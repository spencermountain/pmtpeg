import parseHeader from './parse/get-header.js';
import { enumerateTiles } from './parse/get-tiles/index.js';
import { decompress } from './decompress.js';
import { deserializeDirectory } from './parse/get-tiles/directory.js';
import tileIdToZxy, { zxyToTileId, MAX_ZOOM } from './parse/_hilbert.js';
import { readTile } from './getTile/index.js';
import getPyramid from './getPyramid/index.js';
import { tileTypeName } from './parse/tile-type.js';

const HEADER_BYTES = 127;

// Walking every directory entry means materializing them all in memory (and,
// for fromUrl, downloading the whole leaf-directory section). Planet-scale
// archives have hundreds of millions of entries — refuse those by default.
const MAX_WALK_ENTRIES = 10_000_000;
const MAX_WALK_LEAF_BYTES = 32 * 1024 * 1024;

/** Format a byte count as a short human-readable string, e.g. 78994205 -> "78.99 MB". */
const niceBytes = (n) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i += 1; }
  const value = i === 0 ? Math.round(v) : Math.round(v * 100) / 100;
  return `${value} ${units[i]}`;
};

/**
 * Find the entry in a single (sorted) directory that covers `id`: an exact
 * match, the leaf-pointer whose range contains it, or the run that covers it.
 * Returns null when `id` falls in a gap. Mirrors the PMTiles reference search.
 */
const findTile = (entries, id) => {
  let m = 0;
  let n = entries.length - 1;
  while (m <= n) {
    const k = (m + n) >> 1;
    const t = entries[k].tileId;
    if (id > t) m = k + 1;
    else if (id < t) n = k - 1;
    else return entries[k];
  }
  if (n >= 0) {
    const e = entries[n];
    if (e.runLength === 0) return e;          // leaf-directory pointer
    if (id - e.tileId < e.runLength) return e; // inside this run
  }
  return null;
};

/** The row shape shared by allTiles(), iterTiles() and tileAt(). */
const toRow = (h, e, z, x, y) => ({
  z,
  x,
  y,
  absOffset: h.tileDataOffset + e.offset,
  bytes: e.length,
  runLength: e.runLength,
  shared: e.runLength > 1,
});

/**
 * PMTiles API. The header, directory walk, metadata and pyramid are each read
 * once on first use and cached for the lifetime of the class.
 * @param {{ read(offset:number,length:number):Promise<Uint8Array>, close():Promise<void>, transferred?():number }} reader
 */
class PmTile {
  constructor(reader) {
    // Wrap the reader so every range read is tallied — exposed via usage().
    this._io = { reads: 0, bytes: 0 };
    this._raw = reader;
    this.reader = {
      read: async (offset, length) => {
        const buf = await reader.read(offset, length);
        this._io.reads += 1;
        this._io.bytes += buf.byteLength;
        return buf;
      },
      close: () => reader.close(),
    };
    this._headerP = null;
    this._entriesP = null;
    this._metadataP = null;
    this._tilesP = null;         // cached allTiles({expand:false})
    this._tilesExpandedP = null; // cached allTiles({expand:true})
    this._pyramidP = null;
    this._fileSize = null; // total bytes, known once the header is read
    this._dirCache = new Map(); // offset -> Promise<entries>, for tileAt descent
  }

  /**
   * I/O pulled through the reader since this archive was opened — handy for
   * seeing how little of a remote file you fetch. `bytes` is what was handed
   * to the parser; `transferred` is what actually crossed the network/disk
   * (they differ when a server ignores Range requests and sends the whole
   * file). `file_percentage` is transferred as a percent of the file size
   * (null until the header has been read).
   * @returns {{ reads: number, bytes: number, transferred: number, file_percentage: number | null }}
   */
  usage() {
    const { reads, bytes } = this._io;
    const transferred = this._raw.transferred ? this._raw.transferred() : bytes;
    const file_percentage = this._fileSize
      ? Math.round((transferred / this._fileSize) * 10000) / 100
      : null;
    return { reads, bytes, transferred, file_percentage };
  }

  /** Parsed 127-byte header plus tileTypeName, dedupRatio and a [w,s,e,n] bounds array. */
  header() {
    if (this._headerP == null) {
      this._headerP = (async () => {
        let h;
        try {
          const buf = await this.reader.read(0, HEADER_BYTES);
          h = parseHeader(buf);
        } catch (err) {
          // a bad file leaves nothing worth keeping open — release the handle
          await this.close().catch(() => {});
          throw err;
        }
        this._fileSize = h.tileDataOffset + h.tileDataLength;
        return {
          ...h,
          tileTypeName: tileTypeName(h.tileType),
          dedupRatio: h.addressedTileCount / Math.max(1, h.tileContentCount),
          bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat],
        };
      })();
    }
    return this._headerP;
  }

  /** The JSON metadata blob — vector_layers, attribution, name, generator info, etc. */
  metadata() {
    if (this._metadataP == null) {
      this._metadataP = (async () => {
        const h = await this.header();
        if (h.jsonMetadataLength === 0) return {};
        const raw = await this.reader.read(h.jsonMetadataOffset, h.jsonMetadataLength);
        const buf = await decompress(raw, h.internalCompression);
        return JSON.parse(new TextDecoder().decode(buf));
      })();
    }
    return this._metadataP;
  }

  entries({ force = false } = {}) {
    if (this._entriesP == null) {
      this._entriesP = (async () => {
        const h = await this.header();
        if (!force && (h.tileEntryCount > MAX_WALK_ENTRIES || h.leafDirLength > MAX_WALK_LEAF_BYTES)) {
          this._entriesP = null; // don't cache the refusal — a force:true retry should work
          throw new Error(
            `archive has ${h.tileEntryCount.toLocaleString()} directory entries` +
            ` (${niceBytes(h.leafDirLength)} of directories) — walking it all would use` +
            ` GBs of memory. Use iterTiles() to stream, or pass { force: true }.`
          );
        }
        return enumerateTiles((o, l) => this.reader.read(o, l), h);
      })();
    }
    return this._entriesP;
  }

  /**
   * Tile address list, cached after the first call (don't mutate the result).
   * Pass `{ expand: true }` to emit one row per tile covered by run-length
   * entries (needed for an accurate pyramid).
   */
  allTiles({ expand = false, force = false } = {}) {
    const key = expand ? '_tilesExpandedP' : '_tilesP';
    if (this[key] == null) {
      this[key] = (async () => {
        const h = await this.header();
        const entries = await this.entries({ force });
        const tiles = [];
        for (const e of entries) {
          const count = expand ? e.runLength : 1;
          for (let k = 0; k < count; k++) {
            const { z, x, y } = tileIdToZxy(e.tileId + k);
            tiles.push(toRow(h, e, z, x, y));
          }
        }
        return tiles;
      })().catch((err) => {
        this[key] = null;
        throw err;
      });
    }
    return this[key];
  }

  /**
   * Stream tile rows one at a time without holding the whole list in memory —
   * the way to walk planet-scale archives that allTiles() refuses.
   * Yields the same row shape as allTiles(), in tileId order.
   */
  async *iterTiles({ expand = false } = {}) {
    const h = await this.header();
    const walk = async function* (offset, length) {
      const raw = await this.reader.read(offset, length);
      const entries = deserializeDirectory(await decompress(raw, h.internalCompression));
      for (const e of entries) {
        if (e.runLength === 0) {
          yield* walk.call(this, h.leafDirOffset + e.offset, e.length);
        } else {
          const count = expand ? e.runLength : 1;
          for (let k = 0; k < count; k++) {
            const { z, x, y } = tileIdToZxy(e.tileId + k);
            yield toRow(h, e, z, x, y);
          }
        }
      }
    };
    yield* walk.call(this, h.rootDirOffset, h.rootDirLength);
  }

  /** Read + decompress + deserialize one directory blob, cached by offset. */
  _readDir(offset, length) {
    let p = this._dirCache.get(offset);
    if (p == null) {
      p = (async () => {
        const h = await this.header();
        const raw = await this.reader.read(offset, length);
        return deserializeDirectory(await decompress(raw, h.internalCompression));
      })();
      this._dirCache.set(offset, p);
    }
    return p;
  }

  /**
   * Look up the single tile at a coordinate, returning the same row shape as
   * `allTiles()` ({ z, x, y, absOffset, bytes, runLength, shared }), or `null`
   * if no tile is stored there — including coordinates outside the zoom's
   * grid. Non-integer input throws. Pass the result to `getTile()` to decode.
   *
   * Descends the directory tree (root -> leaf) instead of reading the whole
   * index: typically two small range reads, regardless of archive size.
   * @param {number} z @param {number} x @param {number} y
   */
  async tileAt(z, x, y) {
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`tileAt(z, x, y) takes integers (got ${z}/${x}/${y})`);
    }
    if (z > MAX_ZOOM) throw new Error(`zoom ${z} is beyond z${MAX_ZOOM} (the max safe zoom)`);
    if (z < 0 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return null;
    const h = await this.header();
    const id = zxyToTileId(z, x, y);

    let offset = h.rootDirOffset;
    let length = h.rootDirLength;
    for (let depth = 0; depth < 4; depth++) {
      const entries = await this._readDir(offset, length);
      const e = findTile(entries, id);
      if (e == null) return null;
      if (e.runLength === 0) {
        // leaf-directory pointer — descend one level and search again
        offset = h.leafDirOffset + e.offset;
        length = e.length;
        continue;
      }
      return toRow(h, e, z, x, y);
    }
    throw new Error('directory recursion too deep');
  }

  /** Directory-walk counts, plus the archive's total file size. */
  async stats({ force = false } = {}) {
    const h = await this.header();
    const entries = await this.entries({ force });
    const filesize_bytes = h.tileDataOffset + h.tileDataLength;
    return {
      entry_count: entries.length,
      tile_count: entries.reduce((sum, e) => sum + e.runLength, 0),
      filesize_bytes,
      filesize_nice: niceBytes(filesize_bytes),
    };
  }

  /** Per-zoom tile counts with x/y extent and geographic bbox. Cached after the first call. */
  pyramid({ force = false } = {}) {
    if (this._pyramidP == null) {
      this._pyramidP = this.allTiles({ expand: true, force })
        .then(getPyramid)
        .catch((err) => {
          this._pyramidP = null;
          throw err;
        });
    }
    return this._pyramidP;
  }

  /**
   * Decode a single tile (a row from allTiles()/iterTiles()/tileAt()).
   * MVT archives return per-layer GeoJSON; raster archives return decompressed bytes.
   */
  async getTile(tile) {
    if (!tile || !Number.isFinite(tile.absOffset) || !Number.isFinite(tile.bytes)) {
      throw new Error('getTile() takes a row from allTiles()/tileAt() — an object with absOffset and bytes');
    }
    const h = await this.header();
    return readTile(this.reader, h.tileCompression, h.tileType, tile);
  }

  /** Release the underlying reader (closes the file handle for fromFile). */
  close() {
    return this.reader.close();
  }

  /** Support `await using pm = fromFile(...)` (explicit resource management). */
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}

export default PmTile;

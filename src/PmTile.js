import parseHeader from './parse/get-header.js';
import { enumerateTiles } from './parse/get-tiles/index.js';
import { decompress } from './parse/get-tiles/decompress.js';
import { deserializeDirectory } from './parse/get-tiles/directory.js';
import tileIdToZxy, { zxyToTileId } from './parse/_hilbert.js';
import { readTile } from './getTile/index.js';
import getPyramid from './getPyramid/index.js';
import { tileTypeName } from './parse/tile-type.js';

const HEADER_BYTES = 127;

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
    if (e.runLength === 0) return e;                 // leaf-directory pointer
    if (id - e.tileId < BigInt(e.runLength)) return e; // inside this run
  }
  return null;
};

/**
 * PMTiles API. The header and directory walk are read once on first use
 * and cached for the lifetime of the class.
 * @param {{ read(offset:number,length:number):Promise<Uint8Array>, close():Promise<void> }} reader
 */
class PmTile {
  constructor(reader) {
    // Wrap the reader so every range read is tallied — exposed via usage().
    this._io = { reads: 0, bytes: 0 };
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
    this._dirCache = new Map(); // offset -> Promise<entries>, for tileAt descent
  }

  /**
   * Cumulative bytes and range reads pulled through the reader since this
   * archive was opened — handy for seeing how little of a remote file you fetch.
   * @returns {{ reads: number, bytes: number }}
   */
  usage() {
    return { reads: this._io.reads, bytes: this._io.bytes };
  }

  /** Parsed 127-byte header plus tileTypeName and dedupRatio. */
  header() {
    if (this._headerP == null) {
      this._headerP = (async () => {
        const buf = await this.reader.read(0, HEADER_BYTES);
        const h = parseHeader(buf);
        return {
          ...h,
          tileTypeName: tileTypeName(h.tileType),
          dedupRatio: h.addressedTileCount / Math.max(1, h.tileContentCount),
        };
      })();
    }
    return this._headerP;
  }

  entries() {
    if (this._entriesP == null) {
      this._entriesP = (async () => {
        const h = await this.header();
        return enumerateTiles((o, l) => this.reader.read(o, l), h);
      })();
    }
    return this._entriesP;
  }

  /**
   * Tile address list. Pass `{ expand: true }` to emit one row per tile
   * covered by run-length entries (needed for an accurate pyramid).
   */
  async allTiles({ expand = false } = {}) {
    const h = await this.header();
    const entries = await this.entries();
    const tiles = [];
    for (const e of entries) {
      const count = expand ? e.runLength : 1;
      for (let k = 0; k < count; k++) {
        const { z, x, y } = tileIdToZxy(e.tileId + BigInt(k));
        tiles.push({
          z,
          x,
          y,
          absOffset: h.tileDataOffset + Number(e.offset),
          bytes: e.length,
          runLength: e.runLength,
          shared: e.runLength > 1,
        });
      }
    }
    return tiles;
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
   * if no tile is stored there. Pass the result to `getTile()` to decode it.
   *
   * Descends the directory tree (root -> leaf) instead of reading the whole
   * index: typically two small range reads, regardless of archive size.
   * @param {number} z @param {number} x @param {number} y
   */
  async tileAt(z, x, y) {
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
        offset = h.leafDirOffset + Number(e.offset);
        length = e.length;
        continue;
      }
      return {
        z,
        x,
        y,
        absOffset: h.tileDataOffset + Number(e.offset),
        bytes: e.length,
        runLength: e.runLength,
        shared: e.runLength > 1,
      };
    }
    throw new Error('directory recursion too deep');
  }

  /** Directory-walk counts: entries, shared runs, expanded tile total. */
  async stats() {
    const entries = await this.entries();
    return {
      entryCount: entries.length,
      sharedEntryCount: entries.filter((e) => e.runLength > 1).length,
      tileCount: entries.reduce((sum, e) => sum + e.runLength, 0),
    };
  }

  /** Per-zoom tile counts with x/y extent and geographic bbox. */
  async pyramid() {
    return getPyramid(await this.allTiles({ expand: true }));
  }

  /**
   * Decode a single tile (from `tiles()`).
   * MVT archives return per-layer GeoJSON; raster archives return decompressed bytes.
   */
  async getTile(tile) {
    const h = await this.header();
    return readTile(this.reader, h.tileCompression, h.tileType, tile);
  }

  /** Release the underlying reader (closes the file handle for fromFile). */
  close() {
    return this.reader.close();
  }
}

export default PmTile;

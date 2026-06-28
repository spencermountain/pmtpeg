import parseHeader from './parse/get-header.js';
import { enumerateTiles } from './parse/get-tiles/index.js';
import tileIdToZxy, { zxyToTileId } from './parse/_hilbert.js';
import { readTile } from './getTile/index.js';
import getPyramid from './getPyramid/index.js';
import { tileTypeName } from './parse/tile-type.js';

const HEADER_BYTES = 127;

/**
 * PMTiles API. The header and directory walk are read once on first use
 * and cached for the lifetime of the class.
 * @param {{ read(offset:number,length:number):Promise<Uint8Array>, close():Promise<void> }} reader
 */
class PmTile {
  constructor(reader) {
    this.reader = reader;
    this._headerP = null;
    this._entriesP = null;
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
  async tiles({ expand = false } = {}) {
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

  /**
   * Look up the single tile at a coordinate, returning the same row shape as
   * `tiles()` ({ z, x, y, absOffset, bytes, runLength, shared }), or `null`
   * if no tile is stored there. Pass the result to `getTile()` to decode it.
   */
  async tileAt(x, y, z) {
    const h = await this.header();
    const entries = await this.entries();
    const id = zxyToTileId(z, x, y);

    // entries are sorted by tileId; binary-search the run that covers `id`.
    let lo = 0;
    let hi = entries.length - 1;
    let found = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const e = entries[mid];
      if (id < e.tileId) hi = mid - 1;
      else if (id >= e.tileId + BigInt(e.runLength)) lo = mid + 1;
      else { found = e; break; }
    }
    if (found == null) return null;

    return {
      z,
      x,
      y,
      absOffset: h.tileDataOffset + Number(found.offset),
      bytes: found.length,
      runLength: found.runLength,
      shared: found.runLength > 1,
    };
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
    return getPyramid(await this.tiles({ expand: true }));
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

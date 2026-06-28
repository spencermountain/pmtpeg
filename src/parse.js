import parseHeader from './parse/get-header.js';
import { enumerateTiles } from './parse/get-tiles/index.js';
import tileIdToZxy from './parse/_hilbert.js';
import { readTile } from './getTile/index.js';
import getPyramid from './getPyramid/index.js';

const HEADER_BYTES = 127;

const tileTypeName = (t) =>
  ({ 0: 'unknown', 1: 'mvt(pbf)', 2: 'png', 3: 'jpeg', 4: 'webp', 5: 'avif' }[t] ?? `type${t}`);

/**
 * PMTiles archive API. The header and directory walk are read once on first use
 * and cached for the lifetime of the archive.
 * @param {{ read(offset:number,length:number):Promise<Uint8Array>, close():Promise<void> }} reader
 */
class Pmtile {
  #headerP = null;
  #entriesP = null;

  constructor(reader) {
    this.reader = reader;
  }

  #loadHeader() {
    return (this.#headerP ??= (async () => {
      const buf = await this.reader.read(0, HEADER_BYTES);
      const h = parseHeader(buf);
      return {
        ...h,
        tileTypeName: tileTypeName(h.tileType),
        dedupRatio: h.addressedTileCount / Math.max(1, h.tileContentCount),
      };
    })());
  }

  #loadEntries() {
    return (this.#entriesP ??= (async () => {
      const h = await this.#loadHeader();
      return enumerateTiles((o, l) => this.reader.read(o, l), h);
    })());
  }

  async #buildTiles(expand) {
    const h = await this.#loadHeader();
    const entries = await this.#loadEntries();
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

  /** Parsed 127-byte header plus tileTypeName and dedupRatio. */
  header() {
    return this.#loadHeader();
  }

  /**
   * Tile address list. Pass `{ expand: true }` to emit one row per tile
   * covered by run-length entries (needed for an accurate pyramid).
   */
  tiles({ expand = false } = {}) {
    return this.#buildTiles(expand);
  }

  /** Directory-walk counts: entries, shared runs, expanded tile total. */
  async stats() {
    const entries = await this.#loadEntries();
    return {
      entryCount: entries.length,
      sharedEntryCount: entries.filter((e) => e.runLength > 1).length,
      tileCount: entries.reduce((sum, e) => sum + e.runLength, 0),
    };
  }

  /** Per-zoom tile counts with x/y extent and geographic bbox. */
  async pyramid() {
    return getPyramid(await this.#buildTiles(true));
  }

  /** Decode a single tile (from `tiles()`) into per-layer GeoJSON. */
  async getTile(tile) {
    const h = await this.#loadHeader();
    return readTile(this.reader, h.tileCompression, tile);
  }

  /** Release the underlying reader (closes the file handle for fromFile). */
  close() {
    return this.reader.close();
  }
}

export default Pmtile;

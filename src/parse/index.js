import { open } from 'node:fs/promises';
import { enumerateTiles } from './get-tiles/index.js';
import parseHeader from './get-header.js';
import tileIdToZxy from './_hilbert.js';

const HEADER_BYTES = 127;

const tileTypeName = (t) =>
  ({ 0: 'unknown', 1: 'mvt(pbf)', 2: 'png', 3: 'jpeg', 4: 'webp', 5: 'avif' }[t] ?? `type${t}`);


/** Read `length` bytes at absolute `offset` from an open file handle. */
const createReader = (fh) => async (offset, length) => {
  const buf = Buffer.alloc(length);
  await fh.read(buf, 0, length, offset);
  return buf;
};


/**
 * Enumerate tiles in a PMTiles (v3) archive.
 * @param {string} filePath
 * @param {{ expand?: boolean }} [options]
 *   expand — when true, emit one result per tile covered by run-length entries
 * @returns {Promise<{
 *   header: ReturnType<typeof parseHeader> & { tileTypeName: string, dedupRatio: number },
 *   tiles: Array<{ z: number, x: number, y: number, absOffset: number, bytes: number, runLength: number, shared: boolean }>,
 *   stats: { entryCount: number, sharedEntryCount: number, tileCount: number }
 * }>}
 */
const parsePmtile = async (filePath, { expand = false } = {}) => {
  const fh = await open(filePath, 'r');
  try {
    const readRange = createReader(fh);
    const headerBuf = await readRange(0, HEADER_BYTES);
    const header = parseHeader(headerBuf);
    const entries = await enumerateTiles(readRange, header);

    const tiles = [];
    for (const e of entries) {
      const count = expand ? e.runLength : 1;
      for (let k = 0; k < count; k++) {
        const { z, x, y } = tileIdToZxy(e.tileId + BigInt(k));
        tiles.push({
          z,
          x,
          y,
          absOffset: header.tileDataOffset + Number(e.offset),
          bytes: e.length,
          runLength: e.runLength,
          shared: e.runLength > 1,
        });
      }
    }

    const sharedEntryCount = entries.filter((e) => e.runLength > 1).length;

    return {
      header: {
        ...header,
        tileTypeName: tileTypeName(header.tileType),
        dedupRatio: header.addressedTileCount / Math.max(1, header.tileContentCount),
      },
      tiles,
      stats: {
        entryCount: entries.length,
        sharedEntryCount,
        tileCount: tiles.length,
      },
    };
  } finally {
    await fh.close();
  }
};
export default parsePmtile;
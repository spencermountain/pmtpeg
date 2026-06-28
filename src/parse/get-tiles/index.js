import { decompress } from './decompress.js';
import { deserializeDirectory } from './directory.js';

/** Recursively walk root + leaf directories and collect tile data entries. */
export const enumerateTiles = async (readRange, header) => {
  const rows = [];

  const walk = async (offset, length) => {
    const raw = await readRange(offset, length);
    const entries = deserializeDirectory(await decompress(raw, header.internalCompression));
    for (const e of entries) {
      if (e.runLength === 0) {
        await walk(header.leafDirOffset + Number(e.offset), e.length);
      } else {
        rows.push(e);
      }
    }
  };

  await walk(header.rootDirOffset, header.rootDirLength);
  rows.sort((a, b) => (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0));
  return rows;
};

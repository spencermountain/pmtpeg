import { decompress } from '../../decompress.js';
import { deserializeDirectory } from './directory.js';

// Leaf directories are contiguous in the file, so up to this size we grab the
// whole section in one range read and slice locally — 2 round-trips total
// instead of one per leaf directory (a big win over HTTP).
const ONE_READ_LEAF_LIMIT = 32 * 1024 * 1024;

/** Walk root + leaf directories and collect tile data entries. */
export const enumerateTiles = async (readRange, header) => {
  const rows = [];
  const parse = async (raw) => deserializeDirectory(await decompress(raw, header.internalCompression));

  const root = await parse(await readRange(header.rootDirOffset, header.rootDirLength));

  let section = null; // the whole leaf-dir section, when small enough to take at once
  if (root.some((e) => e.runLength === 0) && header.leafDirLength <= ONE_READ_LEAF_LIMIT) {
    section = await readRange(header.leafDirOffset, header.leafDirLength);
  }

  const walk = async (entries) => {
    for (const e of entries) {
      if (e.runLength === 0) {
        const raw = section
          ? section.subarray(e.offset, e.offset + e.length)
          : await readRange(header.leafDirOffset + e.offset, e.length);
        await walk(await parse(raw));
      } else {
        rows.push(e);
      }
    }
  };

  await walk(root);
  rows.sort((a, b) => a.tileId - b.tileId);
  return rows;
};

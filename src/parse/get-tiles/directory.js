import { readVarint } from './varint.js';

/**
 * Deserialize one directory blob into entries.
 * Format: count, then delta-encoded tileId[], then runLength[], length[], offset[].
 * offset==0 means "follow previous entry's offset+length" (contiguous packing).
 */
export const deserializeDirectory = (buf) => {
  const state = { p: 0 };
  const count = readVarint(buf, state);
  const entries = [];

  let lastId = 0;
  for (let i = 0; i < count; i++) {
    lastId += readVarint(buf, state);
    entries.push({ tileId: lastId, offset: 0, length: 0, runLength: 0 });
  }
  for (let i = 0; i < count; i++) entries[i].runLength = readVarint(buf, state);
  for (let i = 0; i < count; i++) entries[i].length = readVarint(buf, state);
  for (let i = 0; i < count; i++) {
    const o = readVarint(buf, state);
    if (o === 0 && i > 0) {
      entries[i].offset = entries[i - 1].offset + entries[i - 1].length;
    } else {
      entries[i].offset = o - 1;
    }
  }
  return entries;
};

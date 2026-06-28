import { readVarint } from './varint.js';

/**
 * Deserialize one directory blob into entries.
 * Format: count, then delta-encoded tileId[], then runLength[], length[], offset[].
 * offset==0 means "follow previous entry's offset+length" (contiguous packing).
 */
export const deserializeDirectory = (buf) => {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const state = { p: 0 };
  const count = Number(readVarint(dv, state));
  const entries = [];

  let lastId = 0n;
  for (let i = 0; i < count; i++) {
    lastId += readVarint(dv, state);
    entries.push({ tileId: lastId, offset: 0n, length: 0, runLength: 0 });
  }
  for (let i = 0; i < count; i++) entries[i].runLength = Number(readVarint(dv, state));
  for (let i = 0; i < count; i++) entries[i].length = Number(readVarint(dv, state));
  for (let i = 0; i < count; i++) {
    const o = readVarint(dv, state);
    if (o === 0n && i > 0) {
      entries[i].offset = entries[i - 1].offset + BigInt(entries[i - 1].length);
    } else {
      entries[i].offset = o - 1n;
    }
  }
  return entries;
};

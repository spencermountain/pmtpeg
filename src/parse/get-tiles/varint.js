/**
 * Read a varint (LEB128) from `buf` starting at state.p; advances state.p.
 * Plain-number math: each 7-bit group is added via multiplication, which stays
 * exact up to Number.MAX_SAFE_INTEGER (2^53) — plenty for tile ids and offsets.
 */
export const readVarint = (buf, state) => {
  let value = 0, mul = 1, byte;
  do {
    byte = buf[state.p++];
    value += (byte & 0x7f) * mul;
    mul *= 128;
  } while (byte >= 0x80);
  return value;
};

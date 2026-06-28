/** Read a varint from `dv` starting at state.p; advances state.p. */
export const readVarint = (dv, state) => {
  let result = 0n, shift = 0n, byte;
  do {
    byte = BigInt(dv.getUint8(state.p++));
    result |= (byte & 0x7fn) << shift;
    shift += 7n;
  } while (byte & 0x80n);
  return result;
};

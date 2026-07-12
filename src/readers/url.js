// Reader backed by HTTP range requests (browser or Node fetch). Each call
// fetches only the requested byte range, so the whole archive is never loaded —
// unless the server ignores Range and sends everything, in which case we keep
// the body and serve every later read from it for free.
export const urlReader = (url) => {
  let whole = null; // full body, if a server ever ignores our Range header
  let transferred = 0;
  return {
    async read(offset, length) {
      if (whole) return whole.subarray(offset, offset + length);
      const res = await fetch(url, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      });
      if (!res.ok) {
        throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      transferred += buf.byteLength;
      if (res.status === 200 && buf.length > length) {
        whole = buf;
        return whole.subarray(offset, offset + length);
      }
      return buf;
    },
    /** Bytes actually pulled over the network (pre-slice, so a range-ignoring server shows its true cost). */
    transferred: () => transferred,
    async close() {
      whole = null;
    },
  };
};

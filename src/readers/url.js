// Reader backed by HTTP range requests (browser or Node fetch). Each call
// fetches only the requested byte range, so the whole archive is never loaded.
export const urlReader = (url) => ({
  async read(offset, length) {
    const res = await fetch(url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (!res.ok) {
      throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    // If the server ignored Range and returned the whole file (200), slice it.
    if (res.status === 200 && buf.length > length) {
      return buf.subarray(offset, offset + length);
    }
    return buf;
  },
  async close() {},
});

// Reader backed by the local filesystem (Node only). The node:fs import is
// dynamic so this file contributes nothing to a browser bundle unless used.
export const fileReader = (path) => {
  let fhPromise = null;
  const handle = async () => {
    if (!fhPromise) {
      const { open } = await import('node:fs/promises');
      fhPromise = open(path, 'r');
    }
    return fhPromise;
  };
  return {
    async read(offset, length) {
      const fh = await handle();
      const buf = new Uint8Array(length);
      await fh.read(buf, 0, length, offset);
      return buf;
    },
    async close() {
      if (fhPromise) {
        const fh = await fhPromise;
        fhPromise = null;
        await fh.close();
      }
    },
  };
};

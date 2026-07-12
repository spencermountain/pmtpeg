// Reader backed by the local filesystem (Node only). The node:fs import is
// dynamic so this file contributes nothing to a browser bundle unless used.
export const fileReader = (path) => {
  let fhPromise = null;
  let transferred = 0;
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
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      if (bytesRead < length) {
        throw new Error(`file truncated: wanted ${length} bytes at offset ${offset}, got ${bytesRead}`);
      }
      transferred += bytesRead;
      return buf;
    },
    /** Bytes actually pulled from disk. */
    transferred: () => transferred,
    async close() {
      if (fhPromise) {
        const fh = await fhPromise;
        fhPromise = null;
        await fh.close();
      }
    },
  };
};

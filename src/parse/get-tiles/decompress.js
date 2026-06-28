import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';

/** Decompress a buffer per the archive's compression byte. 1=none 2=gzip 3=brotli 4=zstd 0=unknown */
export const decompress = (buf, compression) => {
  switch (compression) {
    case 1: return buf;
    case 2: return gunzipSync(buf);
    case 3: return brotliDecompressSync(buf);
    case 4: throw new Error('zstd directories not supported by node:zlib — re-export without zstd internal compression');
    default: {
      try { return gunzipSync(buf); } catch { }
      try { return inflateSync(buf); } catch { }
      return buf;
    }
  }
};

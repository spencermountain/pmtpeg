import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';

// tileCompression byte in the header at offset 98: 1=none 2=gzip 3=brotli 4=zstd
export const decompressTile = (buf, compression) => {
  switch (compression) {
    case 1: return buf;
    case 2: return gunzipSync(buf);
    case 3: return brotliDecompressSync(buf);
    case 4: throw new Error('zstd tile compression not supported by node:zlib');
    default:
      try { return gunzipSync(buf); } catch { }
      try { return inflateSync(buf); } catch { }
      return buf; // assume raw
  }
};

/** Read the tileCompression byte from the 127-byte header. */
export const readTileCompression = async (fh) => {
  const b = Buffer.alloc(1);
  await fh.read(b, 0, 1, 98);
  return b.readUInt8(0);
};

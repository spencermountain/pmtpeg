// Browser + Node 18+ gzip via the native DecompressionStream API (no node:zlib).
const inflate = async (buf, format) => {
  const ds = new DecompressionStream(format); // 'gzip' | 'deflate' | 'deflate-raw'
  const stream = new Response(buf).body.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

// tileCompression byte in the header at offset 98: 1=none 2=gzip 3=brotli 4=zstd
export const decompressTile = async (buf, compression) => {
  switch (compression) {
    case 1: return buf;
    case 2: return inflate(buf, 'gzip');
    case 3: throw new Error('brotli tile compression not supported in browser — re-export as gzip');
    case 4: throw new Error('zstd tile compression not supported in browser — re-export as gzip');
    default: throw new Error(`unknown tile compression byte: ${compression}`);
  }
};

/** Read the tileCompression byte from the 127-byte header. */
export const readTileCompression = async (fh) => {
  const b = Buffer.alloc(1);
  await fh.read(b, 0, 1, 98);
  return b.readUInt8(0);
};

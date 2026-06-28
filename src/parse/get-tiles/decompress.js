// Browser + Node 18+ gzip via the native DecompressionStream API (no node:zlib).
const inflate = async (buf, format) => {
  const ds = new DecompressionStream(format); // 'gzip' | 'deflate' | 'deflate-raw'
  const stream = new Response(buf).body.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** Decompress a buffer per the archive's compression byte. 1=none 2=gzip 3=brotli 4=zstd 0=unknown */
export const decompress = async (buf, compression) => {
  switch (compression) {
    case 1: return buf;
    case 2: return inflate(buf, 'gzip');
    case 3: throw new Error('brotli directories not supported in browser — re-export as gzip');
    case 4: throw new Error('zstd directories not supported in browser — re-export as gzip');
    default: throw new Error(`unknown directory compression byte: ${compression}`);
  }
};

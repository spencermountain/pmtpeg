// Gzip works everywhere via the native DecompressionStream API (browser + Node 18+).
// Brotli and zstd have no browser API, so they fall back to node:zlib — the import
// is dynamic, so it contributes nothing to a browser bundle unless actually hit.
const inflate = async (buf, format) => {
  const ds = new DecompressionStream(format); // 'gzip' | 'deflate' | 'deflate-raw'
  const stream = new Response(buf).body.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const nodeZlib = async (buf, method) => {
  let zlib;
  try {
    zlib = await import('node:zlib');
  } catch {
    throw new Error(`${method} decompression is not available in the browser — re-export the archive as gzip`);
  }
  if (method === 'brotli') return new Uint8Array(zlib.brotliDecompressSync(buf));
  // zstd landed in node:zlib in Node 22.15 / 23.8
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error('zstd decompression needs Node >= 22.15 — or re-export the archive as gzip');
  }
  return new Uint8Array(zlib.zstdDecompressSync(buf));
};

/** Decompress a buffer per the archive's compression byte. 0=unknown 1=none 2=gzip 3=brotli 4=zstd */
export const decompress = async (buf, compression) => {
  switch (compression) {
    case 0:
      // 'unknown' — sniff the gzip magic bytes, otherwise assume uncompressed
      return buf[0] === 0x1f && buf[1] === 0x8b ? inflate(buf, 'gzip') : buf;
    case 1: return buf;
    case 2: return inflate(buf, 'gzip');
    case 3: return nodeZlib(buf, 'brotli');
    case 4: return nodeZlib(buf, 'zstd');
    default: throw new Error(`unknown compression byte: ${compression}`);
  }
};

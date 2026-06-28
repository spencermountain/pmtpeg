/** Inverse Hilbert: tileId -> {z,x,y}. Mirrors the PMTiles reference implementation. */
const tileIdToZxy = (id) => {
  let acc = 0n, z = 0n;
  while (true) {
    const numTiles = (1n << z) * (1n << z);
    if (acc + numTiles > id) break;
    acc += numTiles;
    z++;
  }
  let pos = id - acc;
  let n = 1n << z, rx, ry, t = pos, x = 0n, y = 0n;
  for (let s = 1n; s < n; s *= 2n) {
    rx = 1n & (t / 2n);
    ry = 1n & (t ^ rx);
    if (ry === 0n) {
      if (rx === 1n) { x = s - 1n - x; y = s - 1n - y; }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    t = t / 4n;
  }
  return { z: Number(z), x: Number(x), y: Number(y) };
};
export default tileIdToZxy;

/** Forward Hilbert: {z,x,y} -> tileId. Inverse of tileIdToZxy. */
export const zxyToTileId = (z, x, y) => {
  z = BigInt(z); x = BigInt(x); y = BigInt(y);
  const n = 1n << z;
  if (x < 0n || y < 0n || x >= n || y >= n) {
    throw new Error(`tile ${x}/${y} is out of range for zoom ${z}`);
  }
  // Base offset: count of all tiles in zooms below z (sum of 4^i for i<z).
  let acc = 0n;
  for (let i = 0n; i < z; i++) acc += (1n << i) * (1n << i);
  let d = 0n;
  for (let s = n >> 1n; s > 0n; s >>= 1n) {
    const rx = (x & s) > 0n ? 1n : 0n;
    const ry = (y & s) > 0n ? 1n : 0n;
    d += s * s * ((3n * rx) ^ ry);
    // rotate the quadrant
    if (ry === 0n) {
      if (rx === 1n) { x = n - 1n - x; y = n - 1n - y; }
      [x, y] = [y, x];
    }
  }
  return acc + d;
};
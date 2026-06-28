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
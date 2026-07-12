// Hilbert-curve tile ids, using plain numbers. Tile ids stay below 2^53 up to
// z26, so Number math is exact there — and ~5x faster than BigInt. Mirrors the
// PMTiles reference implementation, which has the same z26 ceiling.
export const MAX_ZOOM = 26;

/** Inverse Hilbert: tileId -> {z,x,y}. */
const tileIdToZxy = (id) => {
  id = Number(id);
  let acc = 0, z = 0;
  while (true) {
    const numTiles = 4 ** z;
    if (acc + numTiles > id) break;
    acc += numTiles;
    z++;
    if (z > MAX_ZOOM) throw new Error(`tile id ${id} is beyond z${MAX_ZOOM} (the max safe zoom)`);
  }
  let t = id - acc;
  const n = 2 ** z;
  let x = 0, y = 0;
  for (let s = 1; s < n; s *= 2) {
    const rx = Math.floor(t / 2) % 2;
    const ry = (t % 2) ^ rx;
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return { z, x, y };
};
export default tileIdToZxy;

/** Forward Hilbert: {z,x,y} -> tileId. Inverse of tileIdToZxy. */
export const zxyToTileId = (z, x, y) => {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`tile coordinates must be integers (got ${z}/${x}/${y})`);
  }
  if (z > MAX_ZOOM) throw new Error(`zoom ${z} is beyond z${MAX_ZOOM} (the max safe zoom)`);
  const n = 2 ** z;
  if (z < 0 || x < 0 || y < 0 || x >= n || y >= n) {
    throw new Error(`tile ${x}/${y} is out of range for zoom ${z}`);
  }
  // Base offset: count of all tiles in zooms below z (sum of 4^i for i<z).
  let acc = 0;
  for (let i = 0; i < z; i++) acc += 4 ** i;
  let d = 0;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    // rotate the quadrant
    if (ry === 0) {
      if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
      [x, y] = [y, x];
    }
  }
  return acc + d;
};

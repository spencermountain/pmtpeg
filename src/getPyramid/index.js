const tile2lon = (x, z) => (x / 2 ** z) * 360 - 180;

const tile2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** True when this zoom level spans the full Web Mercator tile grid. */
const isWholePlanet = (z, count, minX, maxX, minY, maxY) => {
  const n = 2 ** z;
  return (
    count === n * n &&
    minX === 0 &&
    maxX === n - 1 &&
    minY === 0 &&
    maxY === n - 1
  );
};

/** Geographic bounds for a tile extent. @returns {[west, south, east, north]} */
const tileBBox = (z, minX, maxX, minY, maxY) => [
  tile2lon(minX, z),          // west  = left edge of westernmost tile
  tile2lat(maxY + 1, z),      // south = bottom edge of southernmost tile
  tile2lon(maxX + 1, z),      // east  = right edge of easternmost tile
  tile2lat(minY, z),          // north = top edge of northernmost tile
];

/**
 * Count tiles at each zoom level with x/y extent, ordered from high zoom to low.
 * Pass tiles from `parseFile(path, { expand: true })` so run-length entries
 * are expanded into individual tile addresses.
 * @param {Array<{ z: number, x: number, y: number }>} tiles
 * @returns {Array<{ z: number, count: number, minX: number, maxX: number, minY: number, maxY: number, wholePlanet: boolean, bbox: [number, number, number, number] }>}
 */
const getPyramid = (tiles) => {
  const levels = new Map();

  for (const { z, x, y } of tiles) {
    let level = levels.get(z);
    if (!level) {
      level = { count: 0, minX: x, maxX: x, minY: y, maxY: y };
      levels.set(z, level);
    }
    level.count++;
    level.minX = Math.min(level.minX, x);
    level.maxX = Math.max(level.maxX, x);
    level.minY = Math.min(level.minY, y);
    level.maxY = Math.max(level.maxY, y);
  }

  return [...levels]
    .sort(([a], [b]) => a - b)
    .map(([z, { count, minX, maxX, minY, maxY }]) => ({
      z,
      tileCount: count,
      minX,
      maxX,
      minY,
      maxY,
      wholePlanet: isWholePlanet(z, count, minX, maxX, minY, maxY),
      bbox: tileBBox(z, minX, maxX, minY, maxY),
    }));
};

export default getPyramid;

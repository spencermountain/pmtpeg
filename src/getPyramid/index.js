const tile2lon = (x, z) => (x / 2 ** z) * 360 - 180;

const tile2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** Geographic bounds for a tile extent. @returns {[west, south, east, north]} */
const tileBBox = (z, minX, maxX, minY, maxY) => [
  tile2lon(minX, z),        // west  = left edge
  tile2lat(minY, z),        // south = bottom edge (y grows southward)
  tile2lon(maxX, z),        // east  = right edge
  tile2lat(maxY, z),        // north = top edge
];

/**
 * Count tiles at each zoom level with x/y extent, ordered from high zoom to low.
 * Pass tiles from `parseFile(path, { expand: true })` so run-length entries
 * are expanded into individual tile addresses.
 * @param {Array<{ z: number, x: number, y: number }>} tiles
 * @returns {Array<{ z: number, count: number, minX: number, maxX: number, minY: number, maxY: number }>}
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
      count,
      minX,
      maxX,
      minY,
      maxY,
      bbox: tileBBox(z, minX, maxX, minY, maxY),
    }));
};

export default getPyramid;

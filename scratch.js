import { parseFile, getTile } from './src/index.js';

const result = await parseFile('./examples/edmonton.pmtiles', { expand: true });
console.log(result.header);
console.log(result.stats);
const tile = await getTile('./examples/edmonton.pmtiles', result.tiles[40]);
// console.log(JSON.stringify(tile, null, 2));
console.log(tile);
import { fromFile } from './src/index.js';

const pm = fromFile('./examples/edmonton.pmtiles');

console.log(await pm.header());
console.log(await pm.stats());

const tiles = await pm.tiles({ expand: true });
console.log(tiles[40]);

const tile = await pm.getTile(tiles[40]);
console.log(tile);

console.log(await pm.pyramid());

await pm.close();

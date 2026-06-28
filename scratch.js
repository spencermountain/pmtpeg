import { fromFile, fromUrl } from './src/index.js';

const pm = fromFile('./examples/edmonton.pmtiles');
// const pm = fromUrl('https://snip.spencermountain.dev/2025/07/vancouver.pmtiles');
// const pm = fromUrl('https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles');

console.log(await pm.header());
console.log(await pm.stats());

const tiles = await pm.tiles({ expand: true });
console.log(tiles[40]);

const tile = await pm.getTile(tiles[40]);
console.log(tile);

// console.log(await pm.pyramid());

await pm.close();

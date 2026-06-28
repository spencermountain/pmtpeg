import { fromFile, fromUrl } from './src/index.js';

const examples = [
  'https://demo-bucket.protomaps.com/v4.pmtiles',
  'https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/2025-04-23/places.pmtiles',
  'https://air.mtn.tw/flowers.pmtiles',
  'https://r2-public.protomaps.com/protomaps-sample-datasets/tilezen.pmtiles',
  'https://snip.spencermountain.dev/2025/07/vancouver.pmtiles',
  'https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles'
]

const pm = fromUrl(examples[4]);
// const pm = fromFile('./examples/edmonton.pmtiles');
// const pm = fromUrl('https://pmtiles.io/stamen_toner(raster)CC-BY+ODbL_z3.pmtiles');

console.log(await pm.stats());
const tiles = await pm.allTiles({ expand: false });
console.log(tiles[40]);

// const tile = await pm.getTile(tiles[40]);
// console.log(tile);

// console.log(await pm.pyramid());

const tileAt = await pm.tileAt(9, 82, 177);
console.log({ tileAt });

console.log(await pm.stats());

await pm.close();
console.log('closed');

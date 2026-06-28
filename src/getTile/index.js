// Read one MVT tile out of a PMTiles archive and return it as parsed GeoJSON.
// Deps: npm i @mapbox/vector-tile pbf
import { open } from 'node:fs/promises';
import { decompressTile, readTileCompression } from './decompress.js';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/**
 * @param {string} filePath  path to the .pmtiles archive
 * @param {{z:number,x:number,y:number,absOffset:number,bytes:number}} tile
 * @returns {Promise<{z,x,y,layers:Object<string,{type:'FeatureCollection',features:Array}>}>}
 */
const readTile = async (filePath, tile) => {
  const { z, x, y, absOffset, bytes } = tile;
  const fh = await open(filePath, 'r');
  try {
    const compression = await readTileCompression(fh);

    const raw = Buffer.alloc(bytes);
    await fh.read(raw, 0, bytes, absOffset);
    const pbf = decompressTile(raw, compression);

    const vt = new VectorTile(new PbfReader(pbf));
    const layers = {};
    for (const name of Object.keys(vt.layers)) {
      const layer = vt.layers[name];
      const features = [];
      for (let i = 0; i < layer.length; i++) {
        // feature.toGeoJSON(x,y,z) reprojects tile-local coords to lon/lat
        features.push(layer.feature(i).toGeoJSON(x, y, z));
      }
      layers[name] = { type: 'FeatureCollection', features };
    }
    return { z, x, y, layers };
  } finally {
    await fh.close();
  }
};

export default readTile;
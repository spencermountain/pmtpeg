// Read one MVT tile out of a PMTiles archive and return it as parsed GeoJSON.
// Deps: npm i @mapbox/vector-tile pbf
import { decompressTile } from './decompress.js';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/**
 * @param {{ read(offset:number,length:number):Promise<Uint8Array> }} reader
 * @param {number} compression  tileCompression byte from the header (1=none 2=gzip)
 * @param {{z:number,x:number,y:number,absOffset:number,bytes:number}} tile
 * @returns {Promise<{z,x,y,layers:Object<string,{type:'FeatureCollection',features:Array}>}>}
 */
export const readTile = async (reader, compression, tile) => {
  const { z, x, y, absOffset, bytes } = tile;
  const raw = await reader.read(absOffset, bytes);
  const pbf = await decompressTile(raw, compression);

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
};

export default readTile;

// Read one tile out of a PMTiles archive.
// MVT tiles are decoded to per-layer GeoJSON; raster tiles return raw bytes.
// Deps: npm i @mapbox/vector-tile pbf
import { decompressTile } from './decompress.js';
import { tileTypeName } from '../parse/tile-type.js';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/**
 * @param {{ read(offset:number,length:number):Promise<Uint8Array> }} reader
 * @param {number} compression  tileCompression byte from the header (1=none 2=gzip)
 * @param {number} tileType     tileType byte from the header (1=mvt 2=png …)
 * @param {{z:number,x:number,y:number,absOffset:number,bytes:number}} tile
 * @returns {Promise<
 *   | {z:number,x:number,y:number,layers:Object<string,{type:'FeatureCollection',features:Array}>}
 *   | {z:number,x:number,y:number,format:string,data:Uint8Array}
 * >}
 */
export const readTile = async (reader, compression, tileType, tile) => {
  const { z, x, y, absOffset, bytes } = tile;
  const raw = await reader.read(absOffset, bytes);
  const data = await decompressTile(raw, compression);

  if (tileType !== 1) {
    return { z, x, y, format: tileTypeName(tileType), data };
  }

  const vt = new VectorTile(new PbfReader(data));
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

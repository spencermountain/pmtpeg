// Read one tile out of a PMTiles archive.
// MVT tiles are decoded to per-layer GeoJSON; raster tiles return raw bytes.
// Deps: npm i @mapbox/vector-tile pbf
import { decompressTile } from './decompress.js';
import { tileTypeName } from '../parse/tile-type.js';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

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

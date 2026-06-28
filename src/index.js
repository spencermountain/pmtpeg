import PmtileArchive from './parse.js';
import { fileReader } from './readers/file.js';
import { urlReader } from './readers/url.js';

/** Open a PMTiles archive from a local file path (Node). */
const fromFile = (path) => {
  const reader = fileReader(path);
  return new PmtileArchive(reader);
};

/** Open a PMTiles archive from a URL via HTTP range requests (browser or Node). */
const fromUrl = (url) => {
  const reader = urlReader(url);
  return new PmtileArchive(reader);
};

export { fromFile, fromUrl };
export default { fromFile, fromUrl };

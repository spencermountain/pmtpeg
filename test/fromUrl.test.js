import test from 'node:test';
import assert from 'node:assert/strict';
import { fromUrl } from '../src/index.js';

const VANCOUVER = 'https://snip.spencermountain.dev/2025/maps/vancouver.pmtiles'


test('fromUrl() reads a header over HTTP range requests', {}, async () => {
  const pm = fromUrl(VANCOUVER);
  const header = await pm.header();
  assert.equal(header.tileType, 1);
  assert.equal(header.tileTypeName, 'mvt');
  assert.equal(header.tileCompression, 2);
  assert.equal(header.minZoom, 0);
  assert.equal(header.maxZoom, 15)

  // A header read pulls only the first 127 bytes — proof we sip remote files.
  const { reads, bytes } = pm.usage();
  assert.equal(reads, 1);
  assert.equal(bytes, 127);

  await pm.close();
});

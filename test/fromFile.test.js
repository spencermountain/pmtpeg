import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fromFile } from '../src/index.js';

// Tests run against the local example archive (no network, so the public
// demo buckets referenced in scratch.js are never touched). The file is
// gitignored, so skip cleanly when it isn't present.
const EXAMPLE = fileURLToPath(new URL('../examples/edmonton.pmtiles', import.meta.url));
const present = await stat(EXAMPLE).then(() => true).catch(() => false);
const opts = present ? {} : { skip: 'examples/edmonton.pmtiles not present' };

// One shared, cached archive for the functional tests. usage() reports the
// bytes/reads it pulls — we lean on it to prove the file is sipped, not hammered.
const pm = present ? fromFile(EXAMPLE) : null;

// A coordinate known to exist in this archive, and one well beyond maxZoom.
const PRESENT = { x: 94, y: 166, z: 9 };
const ABSENT = { x: 0, y: 0, z: 20 };

test('header() reports the archive metadata', opts, async () => {
  const h = await pm.header();
  assert.equal(h.tileType, 1);
  assert.equal(h.tileTypeName, 'mvt');
  assert.equal(h.tileCompression, 2); // gzip
  assert.equal(h.minZoom, 0);
  assert.equal(h.maxZoom, 15);
  assert.ok(h.tileDataOffset > 0);
  assert.ok(h.addressedTileCount >= h.tileContentCount);
});

test('tileAt() returns a tiles()-shaped row for a present tile', opts, async () => {
  const row = await pm.tileAt(PRESENT.z, PRESENT.x, PRESENT.y);
  assert.ok(row, 'expected a row for a present tile');
  assert.deepEqual(
    { z: row.z, x: row.x, y: row.y },
    { z: PRESENT.z, x: PRESENT.x, y: PRESENT.y },
  );
  assert.ok(row.absOffset > 0);
  assert.ok(row.bytes > 0);
  assert.ok(row.runLength >= 1);
  assert.equal(row.shared, row.runLength > 1);
});

test('tileAt() returns null past maxZoom', opts, async () => {
  assert.equal(await pm.tileAt(ABSENT.z, ABSENT.x, ABSENT.y), null);
});

test('getTile() decodes a tileAt() row into per-layer GeoJSON', opts, async () => {
  const row = await pm.tileAt(PRESENT.z, PRESENT.x, PRESENT.y);
  const tile = await pm.getTile(row);
  assert.deepEqual({ z: tile.z, x: tile.x, y: tile.y }, PRESENT);
  assert.ok(tile.layers && typeof tile.layers === 'object');
  assert.ok(Object.keys(tile.layers).length > 0);
  const [name] = Object.keys(tile.layers);
  assert.equal(tile.layers[name].type, 'FeatureCollection');
  assert.ok(Array.isArray(tile.layers[name].features));
});

test('stats() agrees with the header counts', opts, async () => {
  const h = await pm.header();
  const s = await pm.stats();
  assert.equal(s.entry_count, h.tileEntryCount);
  assert.equal(s.tile_count, h.addressedTileCount);
  assert.equal(s.filesize_bytes, h.tileDataOffset + h.tileDataLength);
  assert.equal(typeof s.filesize_nice, 'string');
});

test('usage() shows the suite sips the file rather than reading it all', opts, async () => {
  const { reads, bytes, file_percentage } = pm.usage();
  assert.ok(reads > 0 && bytes > 0);
  // ~79 MB file; everything above should touch well under 2 MB of it.
  assert.ok(bytes < 2_000_000, `read ${bytes} bytes`);
  // bytes as a percent of the whole file — a tiny fraction.
  assert.ok(file_percentage > 0 && file_percentage < 5, `read ${file_percentage}%`);
  await pm.close();
});

test('a cold tileAt() descends the tree in a couple of reads', opts, async () => {
  const cold = fromFile(EXAMPLE);
  const row = await cold.tileAt(PRESENT.z, PRESENT.x, PRESENT.y);
  assert.ok(row);
  const { reads, bytes } = cold.usage();
  // header + root dir + one leaf dir — not a full-index walk.
  assert.ok(reads <= 4, `cold tileAt did ${reads} reads`);
  assert.ok(bytes < 50_000, `cold tileAt read ${bytes} bytes`);
  await cold.close();
});

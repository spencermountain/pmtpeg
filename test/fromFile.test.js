import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('header() includes bounds, center and clustered', opts, async () => {
  const h = await pm.header();
  assert.equal(h.clustered, true);
  // edmonton sits around -113.5, 53.5
  assert.ok(h.minLon < -112 && h.maxLon > -115, `lon range ${h.minLon}..${h.maxLon}`);
  assert.ok(h.minLat > 50 && h.maxLat < 56, `lat range ${h.minLat}..${h.maxLat}`);
  assert.deepEqual(h.bounds, [h.minLon, h.minLat, h.maxLon, h.maxLat]);
  assert.ok(h.centerLon > h.minLon && h.centerLon < h.maxLon);
  assert.ok(h.centerLat > h.minLat && h.centerLat < h.maxLat);
  assert.ok(h.centerZoom >= h.minZoom && h.centerZoom <= h.maxZoom);
});

test('metadata() returns the JSON metadata blob', opts, async () => {
  const meta = await pm.metadata();
  assert.ok(Array.isArray(meta.vector_layers), 'expected vector_layers');
  assert.ok(meta.vector_layers.length > 0);
  assert.ok(meta.vector_layers.every((l) => typeof l.id === 'string'));
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

test('tileAt() returns null for coordinates outside the grid', opts, async () => {
  assert.equal(await pm.tileAt(5, 99, 0), null);  // x >= 2^5
  assert.equal(await pm.tileAt(5, 0, -1), null);
  assert.equal(await pm.tileAt(-1, 0, 0), null);
});

test('tileAt() throws a clear error on non-integer input', opts, async () => {
  await assert.rejects(() => pm.tileAt(9.5, 94, 166), /integers/);
  await assert.rejects(() => pm.tileAt('9', '94', '166'), /integers/);
  await assert.rejects(() => pm.tileAt(27, 0, 0), /max safe zoom/);
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

test('getTile() rejects rows that are not tile rows', opts, async () => {
  await assert.rejects(() => pm.getTile(undefined), /absOffset/);
  await assert.rejects(() => pm.getTile({}), /absOffset/);
});

test('stats() agrees with the header counts', opts, async () => {
  const h = await pm.header();
  const s = await pm.stats();
  assert.equal(s.entry_count, h.tileEntryCount);
  assert.equal(s.tile_count, h.addressedTileCount);
  assert.equal(s.filesize_bytes, h.tileDataOffset + h.tileDataLength);
  assert.equal(typeof s.filesize_nice, 'string');
});

test('allTiles() is cached and iterTiles() streams the same rows', opts, async () => {
  const tiles = await pm.allTiles({ expand: true });
  assert.equal(tiles, await pm.allTiles({ expand: true }), 'expected the cached array back');
  let count = 0;
  let first = null;
  for await (const row of pm.iterTiles({ expand: true })) {
    if (count === 0) first = row;
    count++;
  }
  assert.equal(count, tiles.length);
  assert.deepEqual(first, tiles[0]);
});

test('usage() shows the suite sips the file rather than reading it all', opts, async () => {
  const { reads, bytes, transferred, file_percentage } = pm.usage();
  assert.ok(reads > 0 && bytes > 0);
  // local ranged reads: what the parser saw is what came off the disk
  assert.equal(transferred, bytes);
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

test('header() on a non-PMTiles file rejects and releases the file handle', async () => {
  const junk = join(tmpdir(), `pmtpeg-junk-${process.pid}.bin`);
  await writeFile(junk, 'x'.repeat(200));
  const bad = fromFile(junk);
  await assert.rejects(() => bad.header(), /bad magic/);
  // the handle was closed on failure — closing again is a safe no-op
  await bad.close();
  await rm(junk);
});

test('header() on a truncated file says so', async () => {
  const short = join(tmpdir(), `pmtpeg-short-${process.pid}.bin`);
  await writeFile(short, 'PMT');
  const bad = fromFile(short);
  await assert.rejects(() => bad.header(), /truncated/);
  await rm(short);
});

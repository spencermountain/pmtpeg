import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as esm from 'pmtpeg';

const require = createRequire(import.meta.url);
const cjs = require('pmtpeg');

for (const [format, api] of [['ESM', esm], ['CommonJS', cjs]]) {
  test(`${format} package entry opens and reads an archive`, async () => {
    assert.equal(typeof api.fromFile, 'function');
    assert.equal(typeof api.fromUrl, 'function');
    assert.equal(api.default.fromFile, api.fromFile);
    assert.equal(api.default.fromUrl, api.fromUrl);

    const dir = await mkdtemp(join(tmpdir(), 'pmtpeg-exports-'));
    const path = join(dir, 'empty.pmtiles');
    const header = Buffer.alloc(127);
    header.write('PMTiles');
    header[7] = 3;
    const pm = api.fromFile(path);
    try {
      await writeFile(path, header);
      const parsed = await pm.header();
      assert.equal(parsed.tileEntryCount, 0);
      assert.equal(pm.usage().reads, 1);
      assert.deepEqual(await pm.metadata(), {});
    } finally {
      await pm.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
}

import { defineConfig } from 'rolldown';
import { readFileSync } from 'node:fs';

export default defineConfig([
  {
    input: 'src/index.js',
    platform: 'node',
    // Bundle the ESM-only dependencies so require() also works on Node 18.
    external: ['node:fs/promises'],
    output: {
      file: 'builds/pmtpeg.cjs',
      minify: true,
      format: 'cjs',
      exports: 'named',
    },
    plugins: [{
      name: 'commonjs-types',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'pmtpeg.d.cts',
          source: readFileSync(new URL('./builds/pmtpeg.d.ts', import.meta.url), 'utf8'),
        });
      },
    }],
  },
  {
    input: 'src/index.js',
    platform: 'node',
    external: [
      '@mapbox/vector-tile',
      'pbf',
      'node:fs/promises',
    ],
    output: {
      file: 'builds/pmtpeg.js',
      minify: true,
      format: 'esm',
    },
  },
  {
    input: 'src/index.js',
    platform: 'browser',
    external: [
      '@mapbox/vector-tile',
      'pbf',
      'node:fs/promises',
    ],
    output: {
      file: 'builds/pmtpeg.browser.js',
      minify: true,
      format: 'esm',
    },
  },

]);

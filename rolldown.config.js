import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    input: 'src/index.js',
    platform: 'node',
    external: [
      '@mapbox/vector-tile',
      'pbf',
      'node:fs/promises',
    ],
    output: {
      file: 'build/pmtpeg.js',
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
      file: 'build/pmtpeg.browser.js',
      minify: true,
      format: 'esm',
    },
  },

]);
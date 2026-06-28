pmtiles are a neat way to compress map data into a single file, and sip bits of it politely from the client-side.

There are good official tools to pack geojson into this format.

Once you have a pmtile, it can be complicated to understand what's inside of it. It's not just because of the compression, it's because features are repeated at different zoom levels, with different different resolutions.

This library provides a way to parse a pmtiles file and get the header and individual tiles.

This library only supports v3 of this spec

### Usage

`npm install pmtpeg`

```js
import { fromFile, fromUrl } from 'pmtpeg';

// open from a local file (Node)...
const pm = fromFile('./examples/edmonton.pmtiles');
// ...or from a URL via HTTP range requests (browser or Node)
// const pm = pmtpeg.fromUrl('https://example.com/edmonton.pmtiles');

// either way, the same API:
const header = await pm.header();
const stats = await pm.stats();

// tile address list — pass { expand: true } to count run-length runs individually
const tiles = await pm.tiles({ expand: true });

// decode the 40th tile into per-layer GeoJSON
const tile = await pm.getTile(tiles[40]);
console.log(tile);

// counts for individual zoom levels and their extents
const pyramid = await pm.pyramid();
console.log(pyramid);

await pm.close(); // releases the file handle (no-op for fromUrl)
```

Both `fromFile` and `fromUrl` only read the byte ranges they need — the header and
directory index up front, then individual tiles on demand — so a multi-megabyte
archive on a remote URL is never downloaded whole.

Tiles and directories must be gzip-compressed (the PMTiles default); brotli and
zstd are not supported in the browser.

### Details
```jsonc
header
{
  // Byte offset where the root directory starts. It's right after the 127-byte
  // fixed header — i.e. the header is bytes 0–126, root dir begins at 127.
  "rootDirOffset": 127,
  // Length of the root directory in bytes (gzip-compressed). 116 bytes is tiny,
  // so the whole root index fits in the same initial fetch as the header.
  "rootDirLength": 116,

  // Byte offset of the JSON metadata blob (vector layer defs, attribution, etc.).
  "jsonMetadataOffset": 243,
  // Length of that metadata blob in bytes (gzip-compressed).
  "jsonMetadataLength": 1114,

  // Byte offset where the leaf-directory section begins. Leaf dirs hold tile
  // pointers that didn't fit in the root; entries in the root point in here.
  "leafDirOffset": 1357,
  // Total bytes of all leaf directories combined (gzip-compressed). ~130 KB of
  // index means this archive is large enough to need the two-level directory.
  "leafDirLength": 133322,

  // Byte offset where actual tile blobs start. Every tile's absolute position is
  // tileDataOffset + the entry's relative offset.
  "tileDataOffset": 134679,
  // Total bytes of the tile-data section — ~78.9 MB, the bulk of the file.
  "tileDataLength": 78859526,

  // Number of (z/x/y) coordinates that resolve to a tile, counting every address
  // covered by run-length runs. This is the "logical" tile count.
  "addressedTileCount": 73048,
  // Number of entries actually stored in the directories. Lower than addressed
  // because one run-length entry can cover several consecutive coordinates.
  "tileEntryCount": 70029,
  // Number of unique tile blobs on disk. Lower still because identical tiles
  // (e.g. blank ocean) are deduplicated to a single blob.
  "tileContentCount": 65414,

  // Compression used for the directories and JSON metadata.
  // (1=none, 2=gzip, 3=brotli, 4=zstd)
  "internalCompression": 2,
  // Compression applied to each tile blob. 2 = gzip, so MVT tiles must be
  // gunzipped before protobuf decoding.
  "tileCompression": 2,

  // Tile payload format. 1 = MVT (Mapbox Vector Tile, protobuf/pbf).
  // (0=unknown, 1=mvt, 2=png, 3=jpeg, 4=webp, 5=avif)
  "tileType": 1,

  // Lowest zoom level present in the archive (whole world in one tile).
  "minZoom": 0,
  // Highest zoom level present — z15 is roughly city-block detail.
  "maxZoom": 15,

  // Human-readable form of tileType, derived from the byte above.
  "tileTypeName": "mvt(pbf)",
  // addressedTileCount / tileContentCount: ~1.12 addressed tiles per stored blob,
  // i.e. deduplication saved ~10% of tiles. Modest here; basemaps with lots of
  // empty ocean tiles see much higher ratios.
  "dedupRatio": 1.1167028464854618
}

```

stats
```jsonc
{
  // Total tile entries found walking the root + all leaf directories.
  // Matches tileEntryCount above — good consistency check.
  "entryCount": 70029,
  // How many of those entries have runLength > 1, i.e. one stored blob reused
  // across multiple consecutive tile IDs. 1762 of 70029 (~2.5%) are shared runs.
  "sharedEntryCount": 1762,
  // Total addressed tiles, summing each entry's runLength — i.e. directory
  // entries expanded into individual coordinates. Matches addressedTileCount.
  "tileCount": 73048
}

```


tiles
```jsonc
{
  // Zoom level of this tile. z9 covers a region a few hundred km across —
  // roughly metro-area scale.
  "z": 9,
  // Global Tile column at this zoom (0 to 2^9-1 = 0–511), counting east from the
  // antimeridian.
  "x": 94,
  // Global Tile row at this zoom (0–511), counting south from the north edge (XYZ
  // scheme, y=0 at top).
  "y": 166,

  // Absolute byte position of this tile's blob in the file. Already includes
  // tileDataOffset, so you can Range-read straight from here.
  "absOffset": 1763764,
  // Size of the blob in bytes — the stored (gzipped, since tileCompression=2)
  // length. Gunzip then protobuf-decode to get the MVT. ~38 KB.
  "bytes": 38999,

  // How many consecutive tile IDs this one entry covers. 1 = it represents
  // exactly this single tile, no run.
  "runLength": 1,
  // Convenience flag: runLength > 1. false here, so this blob isn't reused
  // across multiple coordinates — it's a unique tile at this z/x/y.
  "shared": false
}
```
MIT
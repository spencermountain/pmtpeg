# Changelog

## Unreleased

### Added

- `metadata()` — returns the archive's JSON metadata blob (`vector_layers`, attribution, name, generator info), cached after the first read
- `header()` now parses the full 127 bytes: `clustered`, `minLon`/`minLat`/`maxLon`/`maxLat`, `centerZoom`/`centerLon`/`centerLat`, plus a derived `bounds` `[west, south, east, north]` array
- `iterTiles({ expand })` — async generator that streams tile rows in tileId order without holding the whole index in memory; works on planet-scale archives
- brotli and zstd decompression in Node via a lazy `node:zlib` import (zstd needs Node ≥ 22.15); browsers still get a clear "re-export as gzip" error
- archives marked `internalCompression`/`tileCompression` = unknown (0) are now sniffed for gzip magic bytes instead of throwing
- `usage()` now reports `transferred` — bytes actually pulled over the network or off disk — alongside `bytes` (what the parser saw); `file_percentage` is computed from `transferred`
- `await using pm = fromFile(...)` support via `Symbol.asyncDispose`
- TypeScript declarations (`builds/pmtpeg.d.ts`), wired into the `types` export condition
- `repository`, `keywords` and `author` fields in package.json

### Changed

- `allTiles()`, `stats()` and `pyramid()` refuse archives with more than ~10M directory entries (or > 32 MB of leaf directories) instead of silently downloading hundreds of MB and running out of memory — pass `{ force: true }` to override, or stream with `iterTiles()`
- `tileAt()` returns `null` for coordinates outside the zoom's grid (previously threw), and throws a clear error for non-integer input (previously a cryptic BigInt error, or silently returned string coords in the row)
- `getTile()` validates its argument and says what a tile row is, instead of failing with a destructuring error
- truncated files now fail with "file truncated: wanted N bytes at offset O" instead of "bad magic"
- zoom levels above 26 now throw — tile ids past z26 exceed `Number.MAX_SAFE_INTEGER`; this matches the official JS implementation's limit
- the two identical `decompress` modules were merged into `src/decompress.js`

### Fixed

- a file handle was leaked when `header()` failed to parse (bad magic, wrong version, truncated file) — Node 22+ raises a fatal `ERR_INVALID_STATE` when GC collects an open handle. The reader is now closed on parse failure
- servers that ignore `Range` requests and return the whole file caused every read to re-download the entire archive (and `usage()` hid the cost, counting only post-slice bytes). The full body is now kept and every later read served from it — one download total — and `usage().transferred` reports the true transfer

### Performance

- tile-id math (Hilbert curve, varints) rewritten from BigInt to plain numbers — exact through z26 and ~5× faster; walking a 70k-tile archive uses about half the memory it did
- the leaf-directory section is fetched in one range read instead of one read per leaf directory (a full index walk went from ~20 round-trips to 3 — a big win for `fromUrl` on slow connections)
- `allTiles()` and `pyramid()` results are cached after the first call, like `entries()` already was

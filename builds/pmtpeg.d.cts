/** Parsed 127-byte PMTiles v3 header, plus a few derived conveniences. */
export interface Header {
  rootDirOffset: number;
  rootDirLength: number;
  jsonMetadataOffset: number;
  jsonMetadataLength: number;
  leafDirOffset: number;
  leafDirLength: number;
  tileDataOffset: number;
  tileDataLength: number;
  addressedTileCount: number;
  tileEntryCount: number;
  tileContentCount: number;
  /** true when tile blobs are ordered by tile id */
  clustered: boolean;
  /** 0=unknown 1=none 2=gzip 3=brotli 4=zstd */
  internalCompression: number;
  /** 0=unknown 1=none 2=gzip 3=brotli 4=zstd */
  tileCompression: number;
  /** 0=unknown 1=mvt 2=png 3=jpeg 4=webp 5=avif */
  tileType: number;
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  centerZoom: number;
  centerLon: number;
  centerLat: number;
  /** human-readable tileType, e.g. 'mvt' */
  tileTypeName: string;
  /** addressedTileCount / tileContentCount */
  dedupRatio: number;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
}

/** One tile address — the row shape shared by allTiles(), iterTiles() and tileAt(). */
export interface TileRow {
  z: number;
  x: number;
  y: number;
  /** absolute byte position of the blob in the file */
  absOffset: number;
  /** stored (compressed) blob length in bytes */
  bytes: number;
  runLength: number;
  /** runLength > 1 */
  shared: boolean;
}

export interface Stats {
  entry_count: number;
  tile_count: number;
  filesize_bytes: number;
  filesize_nice: string;
}

export interface PyramidLevel {
  z: number;
  tileCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  wholePlanet: boolean;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
}

export interface Usage {
  /** number of range reads */
  reads: number;
  /** bytes handed to the parser */
  bytes: number;
  /** bytes actually pulled over the network / off disk */
  transferred: number;
  /** transferred as a percent of the file size; null before the header is read */
  file_percentage: number | null;
}

export interface DecodedVectorTile {
  z: number;
  x: number;
  y: number;
  /** per-layer GeoJSON */
  layers: Record<string, { type: 'FeatureCollection'; features: object[] }>;
}

export interface DecodedRasterTile {
  z: number;
  x: number;
  y: number;
  /** 'png' | 'jpeg' | 'webp' | 'avif' | ... */
  format: string;
  data: Uint8Array;
}

export interface WalkOptions {
  /** emit one row per tile covered by run-length entries */
  expand?: boolean;
  /** walk archives past the size guardrail anyway */
  force?: boolean;
}

export declare class PmTile {
  header(): Promise<Header>;
  /** the JSON metadata blob — vector_layers, attribution, name, etc. */
  metadata(): Promise<Record<string, unknown>>;
  stats(opts?: { force?: boolean }): Promise<Stats>;
  allTiles(opts?: WalkOptions): Promise<TileRow[]>;
  /** stream rows without materializing the whole list — works on planet-scale archives */
  iterTiles(opts?: { expand?: boolean }): AsyncGenerator<TileRow>;
  /** single-tile lookup; null when no tile is stored there */
  tileAt(z: number, x: number, y: number): Promise<TileRow | null>;
  pyramid(opts?: { force?: boolean }): Promise<PyramidLevel[]>;
  getTile(tile: TileRow): Promise<DecodedVectorTile | DecodedRasterTile>;
  usage(): Usage;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/** Open a PMTiles archive from a local file path (Node). */
export declare function fromFile(path: string): PmTile;
/** Open a PMTiles archive from a URL via HTTP range requests (browser or Node). */
export declare function fromUrl(url: string): PmTile;

declare const _default: { fromFile: typeof fromFile; fromUrl: typeof fromUrl };
export default _default;

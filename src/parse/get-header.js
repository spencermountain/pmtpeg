/** Parse the 127-byte header into the offsets/lengths and metadata we need. */
const parseHeader = (buf) => {
  if (buf.toString('ascii', 0, 7) !== 'PMTiles') throw new Error('not a PMTiles file (bad magic)');
  const v = buf.readUInt8(7);
  if (v !== 3) throw new Error(`only PMTiles v3 supported (got v${v})`);
  const rl = (o) => Number(buf.readBigUInt64LE(o));
  return {
    rootDirOffset: rl(8),
    rootDirLength: rl(16),
    jsonMetadataOffset: rl(24),
    jsonMetadataLength: rl(32),
    leafDirOffset: rl(40),
    leafDirLength: rl(48),
    tileDataOffset: rl(56),
    tileDataLength: rl(64),
    addressedTileCount: rl(72),
    tileEntryCount: rl(80),
    tileContentCount: rl(88),
    internalCompression: buf.readUInt8(97),
    tileCompression: buf.readUInt8(98),
    tileType: buf.readUInt8(99),
    minZoom: buf.readUInt8(100),
    maxZoom: buf.readUInt8(101),
  };
};

export default parseHeader;
/** Parse the 127-byte header into the offsets/lengths and metadata we need. */
const parseHeader = (buf) => {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let magic = '';
  for (let i = 0; i < 7; i++) magic += String.fromCharCode(dv.getUint8(i));
  if (magic !== 'PMTiles') throw new Error('not a PMTiles file (bad magic)');
  const v = dv.getUint8(7);
  if (v !== 3) throw new Error(`only PMTiles v3 supported (got v${v})`);
  const rl = (o) => Number(dv.getBigUint64(o, true));
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
    internalCompression: dv.getUint8(97),
    tileCompression: dv.getUint8(98),
    tileType: dv.getUint8(99),
    minZoom: dv.getUint8(100),
    maxZoom: dv.getUint8(101),
  };
};

export default parseHeader;

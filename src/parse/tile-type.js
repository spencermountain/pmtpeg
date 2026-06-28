// Canonical names for the tileType header byte (offset 99).
// (0=unknown 1=mvt 2=png 3=jpeg 4=webp 5=avif)
const TILE_TYPES = { 0: 'unknown', 1: 'mvt', 2: 'png', 3: 'jpeg', 4: 'webp', 5: 'avif' };

export const tileTypeName = (t) => TILE_TYPES[t] ?? `type${t}`;

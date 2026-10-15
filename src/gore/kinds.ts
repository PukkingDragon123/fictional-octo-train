// What comes out of things: per "blood" kind the particle colours, decal
// textures, chunk / stump surfaces and sounds. Species declare their kind in
// SpeciesDef.gore (src/creatures/species.ts); flags fill in sensible defaults.
import type { GoreBlood, GoreDef, SpeciesDef } from '../creatures/species';

export type ParticleStyle = 'drop' | 'fluff' | 'chip' | 'static' | 'glass';

export interface BloodKind {
  key: GoreBlood;
  /** texture palette: gore_<pal>_splat_a ... ('' = no decals) */
  pal: string;
  /** particle colours, dark to light */
  drop: number[];
  mist: number;
  style: ParticleStyle;
  /** pools spread, footprints, arterial spurts, drip trails */
  liquid: boolean;
  tint: number;
  chunkTex: string;
  chunkCol: number;
  stumpTex: string;
  boneTex: string | null;
  snd: { hit: string; heavy: string; tear: string; burst: string; land: string };
  /** decal textures override (glass) */
  decal?: string;
}

const WET = { hit: 'gore_wet_hit', heavy: 'gore_bone_crack', tear: 'gore_tear', burst: 'gore_burst', land: 'gore_gib_land' };

export const KINDS: Record<GoreBlood, BloodKind> = {
  red: { key: 'red', pal: 'red', drop: [0x4a0a0c, 0x6a1012, 0x841719, 0x9e2224], mist: 0x8a2a2c, style: 'drop', liquid: true, tint: 0xffffff, chunkTex: 'gore_flesh', chunkCol: 0xffffff, stumpTex: 'gore_stump', boneTex: 'gore_bone', snd: WET },
  dark: { key: 'dark', pal: 'red', drop: [0x220405, 0x34080a, 0x4a0e10, 0x5a1618], mist: 0x4a2224, style: 'drop', liquid: true, tint: 0x8a6466, chunkTex: 'gore_flesh', chunkCol: 0x9a7a7a, stumpTex: 'gore_stump', boneTex: 'gore_bone', snd: WET },
  pale: { key: 'pale', pal: 'red', drop: [0x9a3a42, 0xb4525a, 0xc87078, 0xdc9aa0], mist: 0xe0b0b4, style: 'drop', liquid: true, tint: 0xffe0e0, chunkTex: 'gore_flesh', chunkCol: 0xe8d0d0, stumpTex: 'gore_stump', boneTex: 'gore_bone', snd: WET },
  oil: { key: 'oil', pal: 'oil', drop: [0x0a0b0d, 0x16181c, 0x22252a, 0x3a3e48], mist: 0x2a2c32, style: 'drop', liquid: true, tint: 0xffffff, chunkTex: 'plastic_black', chunkCol: 0xffffff, stumpTex: 'metal_dark', boneTex: null, snd: { hit: 'gore_squelch', heavy: 'gore_crunch', tear: 'gore_tear', burst: 'gore_crunch', land: 'gore_chip_land' } },
  glow: { key: 'glow', pal: 'glow', drop: [0x2aa47e, 0x48cc9c, 0x8af0c8, 0xc8fff0], mist: 0x8af0c8, style: 'drop', liquid: true, tint: 0xffffff, chunkTex: 'gore_fluff_bits', chunkCol: 0x9affd8, stumpTex: 'gore_fluff_bits', boneTex: null, snd: { hit: 'gore_squelch', heavy: 'gore_squelch', tear: 'gore_fluff', burst: 'gore_squelch', land: 'gore_chip_land' } },
  stuffing: { key: 'stuffing', pal: 'fluff', drop: [0xbcb8ae, 0xd8d4ca, 0xeae8e0, 0xfaf8f2], mist: 0xf0eee8, style: 'fluff', liquid: false, tint: 0xffffff, chunkTex: 'gore_fluff_bits', chunkCol: 0xffffff, stumpTex: 'gore_fluff_bits', boneTex: null, snd: { hit: 'gore_fluff', heavy: 'gore_fluff', tear: 'gore_fluff', burst: 'gore_fluff', land: 'gore_chip_land' } },
  plaster: { key: 'plaster', pal: 'plaster', drop: [0x8e8a80, 0xaeaaa0, 0xc8c4ba, 0xdcd8ce], mist: 0xd8d4cc, style: 'chip', liquid: false, tint: 0xffffff, chunkTex: 'gore_plaster_bits', chunkCol: 0xffffff, stumpTex: 'gore_plaster_bits', boneTex: null, snd: { hit: 'gore_crumble', heavy: 'gore_crunch', tear: 'gore_crumble', burst: 'gore_crumble', land: 'gore_chip_land' } },
  shell: { key: 'shell', pal: 'shell', drop: [0x6a5c48, 0x9a8a6e, 0xbcac8c, 0xd4c6a6], mist: 0xc8bca0, style: 'chip', liquid: false, tint: 0xffffff, chunkTex: 'gore_shell_bits', chunkCol: 0xffffff, stumpTex: 'gore_shell_bits', boneTex: null, snd: { hit: 'gore_crunch', heavy: 'gore_crunch', tear: 'gore_crunch', burst: 'gore_crunch', land: 'gore_chip_land' } },
  static: { key: 'static', pal: 'static', drop: [0x050508, 0xff00ff, 0x00e5ff, 0xffffff], mist: 0xd0d0dc, style: 'static', liquid: false, tint: 0xffffff, chunkTex: 'gore_static_bits', chunkCol: 0xffffff, stumpTex: 'gore_static_bits', boneTex: null, snd: { hit: 'gore_static', heavy: 'gore_static', tear: 'gore_static', burst: 'gore_static', land: 'gore_static' } },
  glass: { key: 'glass', pal: '', decal: 'decal_glass', drop: [0x7898a8, 0xa8c8d8, 0xd8ecf4, 0xffffff], mist: 0xffe8a8, style: 'glass', liquid: false, tint: 0xffffff, chunkTex: 'gore_glass_bits', chunkCol: 0xffffff, stumpTex: 'gore_glass_bits', boneTex: null, snd: { hit: 'glass_clink', heavy: 'glass_break', tear: 'glass_break', burst: 'glass_break', land: 'glass_clink' } },
  none: { key: 'none', pal: '', drop: [0x888888], mist: 0x888888, style: 'chip', liquid: false, tint: 0xffffff, chunkTex: 'white', chunkCol: 0x888888, stumpTex: 'white', boneTex: null, snd: { hit: '', heavy: '', tear: '', burst: '', land: '' } },
};

/** the species' gore declaration with defaults from its flags */
export function goreOf(sp: SpeciesDef): GoreDef & { blood: GoreBlood } {
  const g = sp.gore || {};
  let blood: GoreBlood = g.blood ?? 'red';
  if (!g.blood) {
    if (sp.flags?.immortal) blood = 'none';
    else if (sp.flags?.glitch) blood = 'static';
    else if (sp.flags?.plush) blood = 'stuffing';
    else if (sp.remains === 'decal_glow_paint') blood = 'glow';
  }
  return { ...g, blood };
}

export function kindOf(sp: SpeciesDef): BloodKind { return KINDS[goreOf(sp).blood]; }

/** decal texture of a kind: splat_a | splat_b | spray | pool | drops | wall | streak | wallspray | smear */
export function tex(k: BloodKind, what: string): string {
  if (k.decal) return k.decal;
  if (!k.pal) return '';
  if (!k.liquid && (what === 'streak' || what === 'smear')) what = 'spray';
  if (!k.liquid && what === 'wallspray') what = 'wall';
  return `gore_${k.pal}_${what}`;
}

/** is this a decal texture the gore system manages */
export const isGoreTex = (t: string) => t.startsWith('gore_');
/** liquid gore decals: wet, so they can be walked through */
export const liquidPal = (t: string) => t.startsWith('gore_red_') || t.startsWith('gore_oil_') || t.startsWith('gore_glow_');

// Pixel-art status ("moodle") icons and the body silhouette used by the
// health views. Moodles come in two forms: a 16x16 coloured badge for DOM
// panels (pause status, watch strip) and a 7x7 one-colour glyph for the
// phosphor screens (scanner, watch LCD). The body map is a front-view
// survivor built from simple shapes, one label per pixel, so every body part
// can be shaded by its own state, including limbs that are gone (Body.severed).
import { PixelCanvas, mixHex, bayer } from '../gfx/pixel';
import { Screen } from './font5x7';
import { art, toUrl, kitTheme, PkTheme } from './pixelkit';
import type { BodyPart } from '../items/item';

// ------------------------------------------------------------------ 12x12 badge art ('.' clear, k outline)
const ART: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  hunger: { rows: [
    '......kkkk..', '.....krrrrk.', '....krrrrrrk', '....krorrrrk', '....krrrrrrk', '.....krrrrk.', '....kwkkkk..', '...kwk......', '.kkwk.......', 'kwwk........', 'kwk.........', '.k..........',
  ], pal: { k: 0x2a140a, r: 0xb4602a, o: 0xe8964a, w: 0xf2ead2 } },
  thirst: { rows: [
    '.....k......', '....kck.....', '....kck.....', '...kccck....', '...kccck....', '..kcwccck...', '..kcwccck...', '.kccwcccck..', '.kcccccdck..', '.kcccccdck..', '..kcccddk...', '...kkkkk....',
  ], pal: { k: 0x0a1c34, c: 0x4aa8f0, w: 0xd8f0ff, d: 0x2a74c0 } },
  fatigue: { rows: [
    '...kkk......', '..kmmk......', '.kmmk...zzz.', '.kmk......z.', 'kmmk.....z..', 'kmmk....zzz.', 'kmmk........', '.kmmk.......', '.kmmmkkkk...', '..kmmmmmmk..', '...kkmmmkk..', '.....kkk....',
  ], pal: { k: 0x2a2408, m: 0xf0e08a, z: 0x9ac8ff } },
  endurance: { rows: [
    '......kkkk..', '.....kyyk...', '....kyyk....', '...kyyk.....', '..kyyykkkk..', '..kyyyyyyk..', '..kkkkyyk...', '.....kyk....', '....kyk.....', '...kyk......', '...kk.......', '............',
  ], pal: { k: 0x3a2a04, y: 0xffd84a } },
  panic: { rows: [
    '...kkkkkk...', '..kffffffk..', '.kfwwffwwfk.', '.kfwkffwkfk.', 'kffwwffwwffk', 'kffffffffffk', 'kfffkkkkfffk', 'kfffkrrkfffk', '.kffkrrkffk.', '.kfffkkfffk.', '..kffffffk..', '...kkkkkk...',
  ], pal: { k: 0x2a1c08, f: 0xf2d27a, w: 0xffffff, r: 0x7a1a10 } },
  stress: { rows: [
    '...kkkkkk...', '..kffffffk..', '.kfkkffkkfk.', '.kffkffkffk.', 'kffkkffkkffk', 'kffffffffffk', 'kffffffffffk', 'kffkkkkkkffk', '.kfkwkwkwkk.', '.kffkkkkkfk.', '..kffffffk..', '...kkkkkk...',
  ], pal: { k: 0x2a1408, f: 0xe8a060, w: 0xffffff } },
  unhappy: { rows: [
    '...kkkkkk...', '..kffffffk..', '.kffffffffk.', '.kffkffkffk.', 'kfffkffkfffk', 'kfcffffffffk', 'kfcffffffffk', 'kfcfkkkkfffk', '.kffkffkffk.', '.kffffffffk.', '..kffffffk..', '...kkkkkk...',
  ], pal: { k: 0x101a2a, f: 0x8ab0d8, c: 0xe8f4ff } },
  boredom: { rows: [
    '...kkkkkk...', '..kffffffk..', '.kffffffffk.', '.kfkkffkkfk.', 'kffffffffffk', 'kffffffffffk', 'kffffffffffk', 'kfffkkkkkffk', '.kffffffffk.', '.kffffffffk.', '..kffffffk..', '...kkkkkk...',
  ], pal: { k: 0x1c1c1c, f: 0xb4b4a8 } },
  pain: { rows: [
    '.....k......', '....krk.....', '.k..krk..k..', '.kk.krk.kk..', '..krrrrrk...', 'kkrroywrrkk.', '..krrorrk...', '.kk.krk.kk..', '.k..krk..k..', '....krk.....', '.....k......', '............',
  ], pal: { k: 0x2a0806, r: 0xe0402a, o: 0xff8a4a, y: 0xffd84a, w: 0xffffff } },
  bleeding: { rows: [
    '....k.......', '...krk......', '...krk......', '..krrrk.....', '..krwrk..k..', '.krwrrrk.krk', '.krrrrrkkrrk', '.krrrrdkkrrk', '..krrdk..kk.', '...kkk......', '............', '............',
  ], pal: { k: 0x2a0404, r: 0xc8201a, w: 0xff9a8a, d: 0x7a0a08 } },
  injured: { rows: [
    '........kk..', '.......kwwk.', '......kwwwwk', '.....kwwdwwk', '....kwwdwwk.', '...kwbbbwk..', '..kwbbbwk...', '.kwwdwwk....', 'kwwdwwk.....', 'kwwwwk......', '.kwwk.......', '..kk........',
  ], pal: { k: 0x2a2010, w: 0xf0d8b0, d: 0xc8a878, b: 0xe8c898 } },
  sick: { rows: [
    '...kkkkkk...', '..kggggggk..', '.kggggggggk.', '.kgkkggkkgk.', 'kggggggggggk', 'kggggggggggk', 'kggkggkggkgk', 'kgkgkkgkkggk', '.kggggggggk.', '.kggggggggk.', '..kggggggk..', '...kkkkkk...',
  ], pal: { k: 0x102a08, g: 0x9ad860 } },
  fever: { rows: [
    '.....kk.....', '....kwwk....', '....kwwk..y.', '....kwwk....', '....krwk.y..', '....krwk....', '....krwk..y.', '....krwk....', '...krrrrk...', '...krrrrk...', '....kkkk....', '............',
  ], pal: { k: 0x2a0806, w: 0xf0f0f0, r: 0xe0302a, y: 0xffb04a } },
  cold: { rows: [
    '.....k......', '..k.kck.k...', '...kckck....', 'k..kccck..k.', '.kkkkckkkkk.', 'kccccwcccck.', '.kkkkckkkkk.', 'k..kccck..k.', '...kckck....', '..k.kck.k...', '.....k......', '............',
  ], pal: { k: 0x0a2a44, c: 0xa8e0ff, w: 0xffffff } },
  hot: { rows: [
    '.....o......', '..o..o..o...', '...o.o.o....', '....kkk.....', 'oo.kyyyk.oo.', '..kyywyyk...', '..kyyyyyk...', 'oo.kyyyk.oo.', '....kkk.....', '...o.o.o....', '..o..o..o...', '.....o......',
  ], pal: { k: 0x5a2a04, y: 0xffc83a, w: 0xfff4b0, o: 0xff8a2a } },
  wet: { rows: [
    '...kkkk.....', '..kwwwwkk...', '.kwwwwwwwkk.', 'kwwwwwwwwwwk', 'kgggggggggk.', '.kkkkkkkkk..', '.c..c..c....', '..c..c..c...', '.c..c..c....', '..c..c..c...', '............', '............',
  ], pal: { k: 0x1c2430, w: 0xd8e0e8, g: 0x9aa8b8, c: 0x5ab0ff } },
  drunk: { rows: [
    '..kkkkkkk...', '..kwwwwwk...', '..kaaaaak...', '..kaawaak...', '..kaaaaak...', '...kaaak....', '....kak.....', '....kak.....', '....kak.....', '..kkkkkkk...', '..kgggggk.p.', '..kkkkkkk..p',
  ], pal: { k: 0x2a1a04, w: 0xfff4d8, a: 0xe8a02a, g: 0xb0b0a0, p: 0xff8ac8 } },
  lucidity: { rows: [
    '............', '...kkkkkk...', '.kkwwwwwwkk.', 'kwwwkkkkwwwk', 'kwwkpppkkwwk', 'kwwkpkppkwwk', 'kwwkppkpkwwk', 'kwwkkpppkwwk', '.kkwwkkwwkk.', '...kkkkkk...', '.p....p...p.', '............',
  ], pal: { k: 0x1a0a24, w: 0xe8e0f0, p: 0xb05aff } },
  corruption: { rows: [
    'gg..mm..gg..', 'gg..mm..gg..', '..gg..mmmm..', '..gg..mmmm..', 'mm..gggg..gg', 'mm..gggg..gg', '..mm....gg..', '..mm....gg..', 'gggg..mm..mm', 'gggg..mm..mm', '..mm..gg....', '..mm..gg....',
  ], pal: { g: 0x5aff8a, m: 0xff4ad8 } },
  heavy: { rows: [
    '....kkkk....', '...kmmmmk...', '...km..mk...', '..kkkkkkkk..', '.kmmmmmmmmk.', '.kmwmmmmmmk.', 'kmwmmmmmmmmk', 'kmmmmmmmmmdk', 'kmmmmmmmmmdk', 'kmmmmmmmmddk', '.kddddddddk.', '..kkkkkkkk..',
  ], pal: { k: 0x101010, m: 0x6a6e74, w: 0xb8bcc4, d: 0x3a3e44 } },
  stuffed: { rows: [
    '............', '..kkkkkkkk..', '.kwwwwwwwwk.', 'kwwbbbbbbwwk', 'kwbbobbobbwk', 'kwbbbbbbbbwk', 'kwwbbbbbbwwk', '.kwwwwwwwwk.', '..kkkkkkkk..', '......gg....', '.....g..g...', '....g.......',
  ], pal: { k: 0x2a2010, w: 0xf0ecd8, b: 0xc88a3a, o: 0xe8b05a, g: 0x6aff8a } },
  lonely: { rows: [
    '..kk........', '.kffk.......', '.kffk.......', '..kk...d.d..', '.kffk.......', 'kffffk.d...d', 'kffffk......', 'kffffk.d...d', '.kffk.......', '.kffk..d.d..', '.kffk.......', '.kkkk.......',
  ], pal: { k: 0x101a24, f: 0x8ab0d8, d: 0x5a6a7a } },
  attack: { rows: [
    '............', '.kkk...kkk..', 'krrrk.krrrk.', 'krwrrkrrrrk.', 'krrrrrrrrrk.', 'kkrrkkrrrrk.', 'wwkkwwkkrk..', '..krrk.wwww.', '...krrrk....', '....krk.....', '.....k......', '............',
  ], pal: { k: 0x2a0404, r: 0xe02a3a, w: 0xffffff } },
};
ART.injured.pal.b = 0xe8c898;

// ------------------------------------------------------------------ 7x7 phosphor glyphs ('#' lit)
const MONO: Record<string, string[]> = {
  hunger: ['...###.', '..#####', '..#####', '...###.', '..#....', '.#.....', '##.....'],
  thirst: ['...#...', '..###..', '..###..', '.#####.', '.##.##.', '.#####.', '..###..'],
  fatigue: ['.##..##', '#.....#', '#...##.', '#......', '#......', '.#...#.', '..###..'],
  endurance: ['....##.', '...##..', '..####.', '.####..', '...##..', '..##...', '.##....'],
  panic: ['.#####.', '#.#.#.#', '#######', '#.....#', '#..#..#', '#.....#', '.#####.'],
  stress: ['#.#.#.#', '.#.#.#.', '.......', '#.#.#.#', '.#.#.#.', '.......', '#.#.#.#'],
  unhappy: ['.#####.', '#.....#', '#.#.#.#', '#.....#', '#.###.#', '##...##', '.#####.'],
  boredom: ['.#####.', '#.....#', '##.#..#', '#.....#', '#.###.#', '#.....#', '.#####.'],
  pain: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
  bleeding: ['..#....', '.###...', '.###.#.', '#####..', '#####..', '.###...', '.....#.'],
  injured: ['....##.', '...###.', '..#.##.', '.##.#..', '.###...', '###....', '.#.....'],
  sick: ['.#####.', '#.....#', '#.#.#.#', '#.....#', '##.#.##', '#.#.#.#', '.#####.'],
  fever: ['...##..', '..#..#.', '..#.##.', '..#..#.', '..#.##.', '.#####.', '.#####.'],
  cold: ['#..#..#', '.#.#.#.', '..###..', '###.###', '..###..', '.#.#.#.', '#..#..#'],
  hot: ['#..#..#', '.#####.', '.##.##.', '###.###', '.##.##.', '.#####.', '#..#..#'],
  wet: ['.####..', '######.', '#######', '.......', '#.#.#..', '.#.#.#.', '#.#.#..'],
  drunk: ['#######', '#.....#', '.#...#.', '..#.#..', '...#...', '...#...', '.#####.'],
  lucidity: ['.......', '.#####.', '#..#..#', '#.###.#', '#..#..#', '.#####.', '.......'],
  corruption: ['##.#..#', '.#..##.', '#.##..#', '..#.##.', '##..#.#', '.##.#..', '#..##.#'],
  heavy: ['..###..', '..#.#..', '.#####.', '#######', '#######', '#######', '.#####.'],
  stuffed: ['.#####.', '#######', '#.#.#.#', '#######', '.#####.', '.......', '...##..'],
  lonely: ['.#.....', '###....', '.#.....', '###..#.', '###....', '#.#..#.', '#.#....'],
  attack: ['.##.##.', '#######', '#######', '.#####.', '#.###.#', '.#.#.#.', '...#...'],
};

/** order the moodles are shown in when several are up (worst first is done by the caller) */
export const MOODLE_KEYS = Object.keys(ART);

// ------------------------------------------------------------------ badges
const badgeCache = new Map<string, string>();
/** severity colour for a moodle badge rim */
export function moodleColor(level: number, good = false, t: PkTheme = kitTheme()): number {
  if (good) return t.ph;
  return [t.mid, 0xd8d060, 0xffb040, 0xff7a3a, 0xff3a2a][Math.max(0, Math.min(4, level))];
}
/** 16x16 badge: bevelled tray tinted by severity with the icon art on it */
export function moodleIcon(key: string, level = 1, good = false): string {
  const t = kitTheme();
  const ck = key + level + (good ? 'g' : '') + t.ph;
  const hit = badgeCache.get(ck);
  if (hit) return hit;
  const a = ART[key] || ART.injured;
  const pc = new PixelCanvas(16, 16); pc.wrap = false;
  const rim = moodleColor(level, good, t);
  const fill = mixHex(rim, 0x000000, 0.72);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const corner = (x === 0 || x === 15) && (y === 0 || y === 15);
    if (corner) continue;
    const d = Math.min(x, y, 15 - x, 15 - y);
    if (d === 0) pc.set(x, y, 0x050505);
    else if (d === 1) pc.set(x, y, y === 1 || x === 1 ? mixHex(rim, 0xffffff, 0.3) : mixHex(rim, 0x000000, 0.35));
    else pc.set(x, y, (x + y) % 2 === 0 && y > 9 ? mixHex(fill, 0x000000, 0.25) : fill);
  }
  // severity pips along the bottom rim
  for (let i = 0; i < 4; i++) if (i < level) pc.set(4 + i * 2 + (i > 1 ? 1 : 0), 15, rim);
  art(pc, 2, 2, a.rows, a.pal);
  const url = toUrl(pc);
  badgeCache.set(ck, url);
  return url;
}
export function clearMoodleCache() { badgeCache.clear(); }

/** draw a 7x7 glyph onto a phosphor screen */
export function drawMoodleGlyph(s: Screen, key: string, x: number, y: number, c: number) {
  const g = MONO[key] || MONO.injured;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (g[j][i] === '#') s.px(x + i, y + j, c);
}

// ------------------------------------------------------------------ body silhouette
export const BODY_W = 40, BODY_H = 88;
const ORDER: BodyPart[] = ['head', 'neck', 'torso_u', 'torso_l', 'groin', 'uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'];
const PARENT: Partial<Record<BodyPart, BodyPart>> = {
  uarm_l: 'torso_u', uarm_r: 'torso_u', farm_l: 'uarm_l', farm_r: 'uarm_r', hand_l: 'farm_l', hand_r: 'farm_r',
  thigh_l: 'groin', thigh_r: 'groin', shin_l: 'thigh_l', shin_r: 'thigh_r', foot_l: 'shin_l', foot_r: 'shin_r',
};
let MAP: Int8Array | null = null;
/** per-pixel part index (+1; 0 = outside); the survivor faces the viewer, so their right side is on the left */
export function bodyMap(): Int8Array {
  if (MAP) return MAP;
  const m = new Int8Array(BODY_W * BODY_H);
  const put = (x: number, y: number, p: BodyPart) => { if (x >= 0 && y >= 0 && x < BODY_W && y < BODY_H && !m[y * BODY_W + x]) m[y * BODY_W + x] = ORDER.indexOf(p) + 1; };
  const ell = (cx: number, cy: number, rx: number, ry: number, p: BodyPart) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) put(x, y, p); } };
  const seg = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, p: BodyPart) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= n; i++) { const t = i / n; ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (w0 + (w1 - w0) * t) / 2, (w0 + (w1 - w0) * t) / 2, p); }
  };
  const C = BODY_W / 2;
  // head and neck
  ell(C, 8, 5.6, 7, 'head');
  for (let y = 14; y < 18; y++) for (let x = C - 2.5; x < C + 2.5; x++) put(Math.floor(x), y, 'neck');
  // torso: shoulders taper to the waist
  const torso = (y0: number, y1: number, w0: number, w1: number, p: BodyPart) => {
    for (let y = y0; y < y1; y++) { const w = w0 + (w1 - w0) * ((y - y0) / (y1 - y0)); for (let x = Math.round(C - w / 2); x < Math.round(C + w / 2); x++) put(x, y, p); }
  };
  ell(C - 8.5, 20.5, 3.5, 3, 'torso_u'); ell(C + 8.5, 20.5, 3.5, 3, 'torso_u');
  torso(18, 32, 22, 17, 'torso_u');
  torso(32, 42, 17, 16, 'torso_l');
  torso(42, 48, 17, 18, 'groin');
  // arms (viewer's left = the survivor's right)
  for (const [side, sx] of [['r', -1], ['l', 1]] as ['l' | 'r', number][]) {
    const sh = C + sx * 11.5;
    seg(sh, 21, sh + sx * 1.6, 35, 5, 4.4, ('uarm_' + side) as BodyPart);
    seg(sh + sx * 1.6, 36, sh + sx * 2.6, 49, 4.2, 3.6, ('farm_' + side) as BodyPart);
    ell(sh + sx * 2.8, 52.5, 2.4, 3.2, ('hand_' + side) as BodyPart);
    // legs
    const hx = C + sx * 4.4;
    seg(hx, 49, hx + sx * 0.4, 64, 7.2, 5.6, ('thigh_' + side) as BodyPart);
    seg(hx + sx * 0.4, 65, hx + sx * 0.6, 80, 5, 4, ('shin_' + side) as BodyPart);
    for (let y = 81; y < 85; y++) for (let x = Math.round(hx + sx * 0.6 - 2.5 + (sx > 0 ? 0 : -1)); x < Math.round(hx + sx * 0.6 + 2.5 + (sx > 0 ? 1.5 : 0)); x++) put(x, y, ('foot_' + side) as BodyPart);
  }
  MAP = m;
  return m;
}
export function partAt(x: number, y: number): BodyPart | null {
  const m = bodyMap();
  if (x < 0 || y < 0 || x >= BODY_W || y >= BODY_H) return null;
  const v = m[y * BODY_W + x];
  return v ? ORDER[v - 1] : null;
}

export interface PartState { dmg: number; bleeding: boolean; fracture: boolean; infected: boolean; corrupt: boolean; bandaged: boolean; splinted: boolean; severed: boolean; stumpBleed: boolean; tq: boolean; sealed: boolean }
/** what the health views need to know about one part (reads Body with optional chaining so older saves / builds work) */
export function partState(b: any, part: BodyPart): PartState {
  const injs: any[] = b?.parts?.[part]?.injuries || [];
  const severed: boolean = !!(b?.isSevered?.(part) ?? b?.severed?.includes?.(part));
  const bleedOf = (i: any) => (typeof b?.injuryBleed === 'function' ? b.injuryBleed(i) : i.bleed) || 0;
  const amp = injs.find((i) => i.type === 'amputation');
  return {
    dmg: Math.max(0, Math.min(1, (b?.partDamage?.(part) ?? 0) / 100)),
    bleeding: injs.some((i) => bleedOf(i) > 0.02),
    fracture: injs.some((i) => i.type === 'fracture' && !i.splinted),
    infected: injs.some((i) => i.infection > 0.15),
    corrupt: injs.some((i) => i.corrupt),
    bandaged: injs.some((i) => i.bandage),
    splinted: injs.some((i) => i.splinted),
    severed,
    stumpBleed: !!amp && bleedOf(amp) > 0.02,
    tq: !!amp && amp.tq != null,
    sealed: !!amp && (amp.stitched || amp.caut),
  };
}

export interface BodyInk { faint: number; dim: number; mid: number; hi: number; amb: number; red: number; bg: number }
/**
 * Paint the silhouette with one pixel per art pixel through `px(x, y, colour)`.
 * Parts that are gone leave a dotted ghost outline and a stump cap where they
 * were cut (red while it bleeds, a band for a tourniquet, closed when sealed).
 */
export function paintBody(px: (x: number, y: number, c: number) => void, b: any, ink: BodyInk, sel: BodyPart | null, t: number) {
  const m = bodyMap();
  const st = new Map<BodyPart, PartState>();
  for (const p of ORDER) st.set(p, partState(b, p));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= BODY_W || y >= BODY_H ? 0 : m[y * BODY_W + x]);
  const blinkOn = Math.sin(t * 8) > 0;
  for (let y = 0; y < BODY_H; y++) for (let x = 0; x < BODY_W; x++) {
    const v = at(x, y);
    if (!v) {
      // outline: around parts that are present
      let edge = false, ghost = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = at(x + dx, y + dy);
        if (!n) continue;
        if (st.get(ORDER[n - 1])!.severed) ghost = true; else edge = true;
      }
      if (edge) px(x, y, ink.mid);
      else if (ghost && (x + y) % 3 === 0) px(x, y, ink.dim);
      continue;
    }
    const part = ORDER[v - 1];
    const s = st.get(part)!;
    if (s.severed) {
      // a stump cap where this part meets one that is still there
      const parent = PARENT[part];
      let cap = false;
      for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) { const n = at(x + dx, y + dy); if (n && ORDER[n - 1] === parent && !st.get(parent!)!.severed) cap = true; }
      if (cap) px(x, y, s.stumpBleed ? (blinkOn ? ink.red : ink.amb) : s.tq ? ink.amb : s.sealed ? ink.mid : ink.red);
      continue;
    }
    // seams between parts
    const right = at(x + 1, y), down = at(x, y + 1);
    const seam = (right && right !== v) || (down && down !== v);
    let c = ink.faint;
    // a little volume: lit left edge of each part
    if (at(x - 1, y) !== v) c = ink.dim;
    if (s.dmg > 0) c = s.dmg > 0.5 ? ink.amb : ((x + y) % 2 === 0 ? ink.amb : ink.dim);
    if (s.bandaged && y % 3 === 0) c = ink.hi;
    if (s.splinted && (x % 4 === 0)) c = ink.hi;
    if (s.infected && bayer(x * 3, y * 5) < 0.2) c = ink.amb;
    if (s.fracture && ((x + y * 2) % 7 === 0 || (x * 2 - y) % 9 === 0)) c = ink.amb;
    if (s.corrupt && Math.random() < 0.25) c = ink.hi;
    if (s.bleeding && blinkOn) c = ink.red;
    if (seam) c = ink.bg;
    if (part === sel && (x + y + Math.floor(t * 6)) % 4 === 0) c = ink.hi;
    px(x, y, c);
  }
  // the selected part gets a bright outline
  if (sel) for (let y = 0; y < BODY_H; y++) for (let x = 0; x < BODY_W; x++) {
    if (at(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(x + dx, y + dy); if (n && ORDER[n - 1] === sel) { px(x, y, ink.hi); break; } }
  }
}

/** the silhouette as a full-colour pixel canvas for DOM panels (pause status) */
export function bodyCanvas(b: any, t = 0): PixelCanvas {
  const th = kitTheme();
  const pc = new PixelCanvas(BODY_W, BODY_H); pc.wrap = false;
  const ink: BodyInk = { faint: mixHex(th.scr, th.dark, 0.9), dim: th.dim, mid: th.mid, hi: th.hi, amb: 0xffb040, red: 0xff3a2a, bg: th.scr };
  paintBody((x, y, c) => pc.set(x, y, c), b, ink, null, t);
  return pc;
}

// Still Lifes: the replicas the place makes of people from memory.
//
// One shared look for the live species (src/creatures/species/still_life.ts)
// and the static props (src/content/furniture/m_replicas.ts), so a figure at
// the dinner table that never moves and one that does are the same person:
//  - MEMORIES: who is remembered (appearance, outfit, which features came out
//    wrong). Live ones can also be cast from a survivor in the zone.
//  - waxify(): repaints a HumanRig page into a cast: skin flattened to smooth
//    wax with a mould seam, the face wiped and redrawn wrong (eyes too far
//    apart or level with nothing, no pupils, a mouth painted or sewn shut),
//    clothes a shade too clean, a prisoner number that is not quite anyone's.
//  - POSES: seated, at the table, standing, lying, the child.
//  - bakeReplica(): a posed rig frozen into static, atlas-textured geometry for
//    the chunk mesher (a 128 px copy of the page lives in the world atlas).
import * as THREE from 'three';
import { HumanRig, Appearance, Outfit, Pose, LookPart } from '../../entities/humanRig';
import { REG, VMAP, vOf, PAGE } from '../../entities/humanModel';
import type { Reg } from '../../entities/humanModel';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, bayer } from '../../gfx/pixel';
import { hashStr } from '../../core/rng';

// =====================================================================================
// what came out wrong
// =====================================================================================
export type EyeFlaw = 'blank' | 'black' | 'closed' | 'painted';
export type MouthFlaw = 'sewn' | 'painted' | 'none' | 'grin';
export interface Flaws {
  /** eye spacing in degrees round the head (a person is 17.5) */
  spread: number;
  /** one eye higher than the other (head-local metres) */
  skew: number;
  eyes: EyeFlaw;
  mouth: MouthFlaw;
  /** brows wiped off */
  browless: boolean;
  /** prisoner number on the chest patch / back (jumpsuits), already slightly wrong */
  number?: string;
}

export interface Memory {
  key: string;
  app: Appearance;
  outfit: Outfit;
  flaws: Flaws;
  /** scaled down with an oversized head */
  child?: boolean;
}

const YELLOW = 0xd9a826;
const jump = (): Partial<Outfit> => ({
  torso: { tex: 'c_jumpsuit', color: YELLOW, sleeve: 'long', item: 'prison_jumpsuit' },
  legs: { tex: 'c_jumpsuit', color: YELLOW, item: 'prison_jumpsuit' }, legsKind: 'pants',
  feet: { tex: 'c_shoes_sneaker', color: 0xd8d4c8 },
  cond: { dirt: 0 },
});

/** the people the place remembers (props use these by index: state.v) */
export const MEMORIES: Memory[] = [
  { // 0: a convict, the Remittance Programme intake photo
    key: 'convict_m',
    app: { skin: 0xe8b98f, hair: 0x3b2a1e, hairStyle: 'buzz', face: 0, build: 'average', height: 1.0, bodyShape: 0.1, facialHair: 'stubble', age: 0.2 },
    outfit: jump() as Outfit,
    flaws: { spread: 30, skew: 0, eyes: 'blank', mouth: 'sewn', browless: true, number: 'D-4417' },
  },
  { // 1: a convict, female
    key: 'convict_f',
    app: { skin: 0xd39b6c, hair: 0x1c1612, hairStyle: 'ponytail', face: 4, build: 'slim', height: 0.97, bodyShape: 0.85, facialHair: 'none', age: 0.1 },
    outfit: jump() as Outfit,
    flaws: { spread: 27, skew: 0.007, eyes: 'black', mouth: 'painted', browless: false, number: 'D-4?71' },
  },
  { // 2: a father in a cardigan, the way a child would remember him
    key: 'father',
    app: { skin: 0xf3d2b8, hair: 0x6a4628, hairStyle: 'short', face: 5, build: 'broad', height: 1.04, bodyShape: 0.05, facialHair: 'moustache', age: 0.45 },
    outfit: { torso: { tex: 'c_sweater', color: 0x6a5a3a, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x4a4238 }, legsKind: 'pants', feet: { tex: 'c_shoes_dress', color: 0x3a2a1e }, eyes: { tex: 'c_glasses', color: 0x2a2420, item: 'glasses' } },
    flaws: { spread: 17.5, skew: 0, eyes: 'blank', mouth: 'none', browless: false },
  },
  { // 3: a mother in her good blouse
    key: 'mother',
    app: { skin: 0xe8b98f, hair: 0x9c7a46, hairStyle: 'bob', face: 1, build: 'slim', height: 0.97, bodyShape: 0.9, facialHair: 'none', age: 0.35 },
    outfit: { torso: { tex: 'c_shirt_button', color: 0xe8d6d8, sleeve: 'long' }, legs: { tex: 'c_skirt', color: 0x5a4a6a }, legsKind: 'skirt', feet: { tex: 'c_shoes_dress', color: 0x2a2220 } },
    flaws: { spread: 33, skew: -0.006, eyes: 'painted', mouth: 'grin', browless: false },
  },
  { // 4: a child (replica_child)
    key: 'child',
    app: { skin: 0xf3d2b8, hair: 0xd8c08a, hairStyle: 'bob', face: 4, build: 'slim', height: 0.94, bodyShape: 0.6, facialHair: 'none', age: 0, freckles: 0.6 },
    outfit: { torso: { tex: 'c_shirt_stripe', color: 0xc84a4a, sleeve: 'short' }, legs: { tex: 'c_shorts', color: 0x3a4a6a }, legsKind: 'shorts', feet: { tex: 'c_shoes_sneaker', color: 0xe8e8e0 } },
    flaws: { spread: 24, skew: 0, eyes: 'blank', mouth: 'none', browless: true },
    child: true,
  },
  { // 5: a 1990 survey researcher in a lab coat
    key: 'researcher',
    app: { skin: 0xb67a4c, hair: 0x1c1612, hairStyle: 'short', face: 2, build: 'average', height: 1.02, bodyShape: 0.2, facialHair: 'none', age: 0.3 },
    outfit: { torso: { tex: 'c_shirt_button', color: 0xc8d8e8, sleeve: 'long' }, torsoOuter: { tex: 'c_labcoat', color: 0xe8e8e2, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x2a3040 }, legsKind: 'pants', feet: { tex: 'c_shoes_dress', color: 0x2a2220 }, eyes: { tex: 'c_glasses', color: 0x2a2a2a, item: 'glasses' } },
    flaws: { spread: 17.5, skew: 0.012, eyes: 'closed', mouth: 'sewn', browless: false },
  },
  { // 6: a grandmother in a cardigan
    key: 'grandmother',
    app: { skin: 0xf3d2b8, hair: 0xa8a49e, hairStyle: 'curly', face: 3, build: 'average', height: 0.95, bodyShape: 0.95, facialHair: 'none', age: 0.9 },
    outfit: { torso: { tex: 'c_sweater', color: 0x8a6a7a, sleeve: 'long' }, legs: { tex: 'c_skirt', color: 0x4a4a52 }, legsKind: 'skirt', feet: { tex: 'c_shoes_dress', color: 0x4a3424 } },
    flaws: { spread: 21, skew: 0, eyes: 'black', mouth: 'painted', browless: true },
  },
];
export const MEMORY_COUNT = MEMORIES.length;
export const CHILD_MEMORY = 4;
/** which memories turn up where (prop variants without an explicit state.v pick from these) */
export const ADULT_MEMORIES = [0, 1, 2, 3, 5, 6];

/** a survivor's look, remembered: their appearance and what they wore, with the place's own mistakes */
export function memoryOf(key: string, app: Appearance, outfit: Outfit, seed: number): Memory {
  const r = (k: number) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const o: Outfit = {};
  const keep = (lp?: LookPart) => (lp ? { tex: lp.tex, color: lp.color, sleeve: lp.sleeve, item: lp.item } : undefined);
  o.torso = keep(outfit.torso); o.torsoOuter = keep(outfit.torsoOuter); o.legs = keep(outfit.legs); o.legsKind = outfit.legsKind;
  o.feet = keep(outfit.feet); o.eyes = keep(outfit.eyes);
  if (outfit.head) o.head = { ...keep(outfit.head)!, hat: outfit.head.hat };
  const isJump = /jumpsuit/.test(outfit.torso?.item || '') || outfit.torso?.tex === 'c_jumpsuit';
  const eyes: EyeFlaw[] = ['blank', 'black', 'closed', 'painted'];
  const mouths: MouthFlaw[] = ['sewn', 'painted', 'none', 'grin'];
  return {
    key, app: { ...app }, outfit: o,
    flaws: {
      spread: 24 + r(1) * 12, skew: (r(2) - 0.5) * 0.016, eyes: eyes[Math.floor(r(3) * 4)], mouth: mouths[Math.floor(r(4) * 4)], browless: r(5) < 0.5,
      number: isJump ? 'D-' + String(1000 + Math.floor(r(6) * 8999)).replace(/[0-9]$/, '?') : undefined,
    },
  };
}

// =====================================================================================
// the cast: repaint a HumanRig page
// =====================================================================================
const rgbOf = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
function chroma(r: number, g: number, b: number) { const s = r + g + b + 1; return [r / s, g / s]; }
const lum = (r: number, g: number, b: number) => (r * 0.3 + g * 0.59 + b * 0.11) / 255;
const regX = (R: Reg, deg: number) => R.x + (0.5 + deg / 360) * R.w;
const headY = (y: number) => REG.HEAD.y + (1 - vOf(VMAP.HEAD, y)) * REG.HEAD.h;
const torsoY = (y: number) => REG.TORSO.y + (1 - vOf(VMAP.TORSO, y)) * REG.TORSO.h;

/** the hairline the painter uses (head-local metres), so wax never runs into the hair */
function hairline(style: string, deg: number) {
  if (style === 'bald') return 1;
  const a = Math.abs(deg);
  const front = style === 'buzz' ? 0.158 : 0.155, temple = 0.132, side = style === 'buzz' ? 0.112 : 0.1, back = 0.03;
  if (a < 25) return front; if (a < 60) return front + (temple - front) * ((a - 25) / 35);
  if (a < 105) return temple + (side - temple) * ((a - 60) / 45); return side + (back - side) * Math.min(1, (a - 105) / 55);
}

const DIGITS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  D: '110101101101110', '-': '000000111000000', '?': '111001011000010',
};

/**
 * Turn a painted human page into a wax cast, in place (RGBA, PAGE x PAGE).
 * Deterministic for (memory, seed): the prop and the live one look the same.
 */
export function waxify(d: Uint8Array | Uint8ClampedArray, m: Memory, seed: number) {
  const S = PAGE;
  const app = m.app, f = m.flaws;
  const [sr, sg, sb] = rgbOf(app.skin);
  const [scr, scg] = chroma(sr, sg, sb);
  // ivory-yellow candle wax, keeping a memory of the skin tone underneath; many close steps, so dithering reads as smooth
  const WN = 12;
  const wax = makeRamp(mixHex(app.skin, 0xe6d8b0, 0.7), WN, { hueShift: 0.05, spread: 0.42 });
  const mask = new Uint8Array(S * S);
  const val = new Float32Array(S * S);
  const skinRegs: Reg[] = [REG.HAND_L, REG.HAND_R, REG.ARM_L, REG.ARM_R, REG.LEG_L, REG.LEG_R, REG.TORSO, REG.FOOT_L, REG.FOOT_R];
  const base = lum(sr, sg, sb);
  const MID = 6.2;
  for (const R of skinRegs) {
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
      const i = (y * S + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const [cr, cg] = chroma(r, g, b);
      if (Math.hypot(cr - scr, cg - scg) > 0.032) continue;
      const L = lum(r, g, b);
      if (L < base * 0.35 || L > 0.99) continue;
      const j = y * S + x;
      mask[j] = 1;
      // flattened: the cast keeps the big shapes and loses the skin
      val[j] = MID + (L - base) * 9;
    }
  }
  // the neck is all cast
  for (let y = REG.NECK.y; y < REG.NECK.y + REG.NECK.h; y++) for (let x = REG.NECK.x; x < REG.NECK.x + REG.NECK.w; x++) {
    const j = y * S + x, i = j * 4;
    mask[j] = 1; val[j] = MID - 0.8 + (lum(d[i], d[i + 1], d[i + 2]) - base) * 3;
  }
  // the head is recast whole below the hairline: no eyes, brows, mouth, stubble, freckles survive it
  const H = REG.HEAD;
  for (let y = H.y; y < H.y + H.h; y++) for (let x = H.x; x < H.x + H.w; x++) {
    const deg = ((x - H.x + 0.5) / H.w - 0.5) * 360;
    const yy = VMAP.HEAD[0] + (1 - (y - H.y + 0.5) / H.h) * (VMAP.HEAD[1] - VMAP.HEAD[0]);
    if (yy > hairline(app.hairStyle, deg) - 0.006) continue;
    const j = y * S + x;
    mask[j] = 1;
    const a = Math.abs(deg);
    // forehead, nose ridge and cheekbones catch the light; sockets where the eyes should be; a soft mask
    val[j] = MID + 0.4 + 1.6 * Math.exp(-((yy - 0.15) ** 2) / 0.0015) * Math.max(0, 1 - a / 50) + 1.2 * Math.exp(-((yy - 0.075) ** 2) / 0.0005) * Math.exp(-((a - 38) ** 2) / 220)
      - 1.0 * Math.exp(-((yy - 0.1) ** 2) / 0.0003) * Math.exp(-((a - f.spread) ** 2) / 140) - 2.2 * Math.max(0, (0.02 - yy) / 0.05) - 1.6 * Math.max(0, (a - 55) / 70)
      + (a < 4 && yy > 0.055 && yy < 0.095 ? 1.0 : 0) - (a > 4 && a < 9 && yy > 0.052 && yy < 0.09 ? 0.7 : 0);
  }
  // two passes of a masked blur: no pores, no seams between what was skin and what was recast
  const tmp = new Float32Array(S * S);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const j = y * S + x;
      if (!mask[j]) continue;
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = j + dy * S + dx; if (mask[k]) { s += val[k]; n++; } }
      tmp[j] = s / n;
    }
    for (let j = 0; j < S * S; j++) if (mask[j]) val[j] = tmp[j];
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const j = y * S + x;
    if (!mask[j]) continue;
    const v = val[j];
    let k = Math.floor(v);
    if (v - k > bayer(x, y)) k++;
    const c = wax[k < 0 ? 0 : k > WN - 1 ? WN - 1 : k];
    const i = j * 4;
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255;
  }
  const W0 = wax[2], W1 = wax[3], WH = wax[WN - 1];
  const put = (x: number, y: number, c: number, t = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    d[i] = Math.round(d[i] + (((c >> 16) & 255) - d[i]) * t); d[i + 1] = Math.round(d[i + 1] + (((c >> 8) & 255) - d[i + 1]) * t); d[i + 2] = Math.round(d[i + 2] + ((c & 255) - d[i + 2]) * t);
  };
  // the mould's parting line runs up both sides of the head and down the arms
  for (const k of [-1, 1]) {
    const x = Math.round(regX(H, k * 92));
    for (let y = Math.floor(headY(hairline(app.hairStyle, k * 92) - 0.01)); y <= Math.ceil(headY(-0.02)); y++) { put(x, y, WH, 0.7); put(x + 1, y, W0, 0.45); }
  }
  for (const R of [REG.ARM_L, REG.ARM_R, REG.HAND_L, REG.HAND_R]) {
    const x = Math.round(R.x + R.w * 0.75);
    for (let y = R.y; y < R.y + R.h; y++) if (mask[y * S + x]) { put(x, y, WH, 0.55); put(x + 1, y, W0, 0.35); }
  }
  // ---- the new face
  const dark = mixHex(wax[0], 0x1a1010, 0.55), lidC = mixHex(W0, 0x2a1c18, 0.45);
  const ey0 = Math.round(headY(0.096));
  for (const k of [-1, 1]) {
    const cx = regX(H, k * f.spread);
    const ey = ey0 + Math.round((k > 0 ? f.skew : -f.skew) / ((VMAP.HEAD[1] - VMAP.HEAD[0]) / H.h));
    const x0 = Math.round(cx - 2.5), x1 = x0 + 4;
    for (let x = x0 - 1; x <= x1 + 1; x++) { put(x, ey - 2, W0, 0.55); put(x, ey + 2, W1, 0.45); }
    if (f.eyes === 'closed') {
      for (let x = x0; x <= x1; x++) put(x, ey + (x === x0 || x === x1 ? -1 : 0), dark, 1);
      continue;
    }
    for (let x = x0; x <= x1; x++) put(x, ey - 1, lidC, 1);
    if (f.eyes === 'black') {
      // all pupil: two holes
      for (let x = x0; x <= x1; x++) { put(x, ey, 0x0e0a0a, 1); put(x, ey + 1, x === x0 || x === x1 ? 0x3a2a24 : 0x140e0e, 1); }
      put(x0 + 1, ey, 0x6a6460, 1); // one dull glint, both eyes the same
    } else if (f.eyes === 'painted') {
      // doll eyes: a flat white and a dot that does not quite sit in it
      for (let x = x0; x <= x1; x++) { put(x, ey, 0xeeeae0, 1); put(x, ey + 1, 0xd8d2c4, 1); }
      put(cx + k * 0.8, ey, 0x2a4a6a, 1); put(cx + k * 0.8 - 1, ey, 0x1a2430, 1);
    } else {
      // blank: whites all the way across, no iris, no pupil
      for (let x = x0; x <= x1; x++) { put(x, ey, x === x0 || x === x1 ? 0xd0cabc : 0xf6f2e8, 1); put(x, ey + 1, x === x0 || x === x1 ? 0xb8b0a0 : 0xe4dccc, 1); }
    }
  }
  if (!f.browless) {
    const BR = mixHex(app.hair, 0x2a2018, 0.3);
    for (const k of [-1, 1]) for (let i = -3; i <= 2; i++) put(regX(H, k * f.spread) + i, headY(0.122) + (Math.abs(i) > 1 ? 1 : 0), BR, 0.85);
  }
  const nx = Math.round(regX(H, 0) - 0.5), my = Math.round(headY(0.034));
  if (f.mouth === 'sewn') {
    for (let x = nx - 4; x <= nx + 4; x++) put(x, my, mixHex(dark, 0x4a2020, 0.3), 1);
    for (const sx of [-3, -1, 1, 3]) { put(nx + sx, my - 1, dark, 0.95); put(nx + sx, my + 1, dark, 0.95); }
  } else if (f.mouth === 'painted') {
    put(nx - 1, my, 0x8a2226, 1); put(nx, my, 0x8a2226, 1); put(nx + 1, my, 0x8a2226, 1);
    put(nx - 1, my - 1, 0xb03a3a, 1); put(nx + 1, my - 1, 0xb03a3a, 1); put(nx, my + 1, 0xa0302e, 1);
  } else if (f.mouth === 'grin') {
    for (let x = nx - 6; x <= nx + 6; x++) put(x, my + (Math.abs(x - nx) > 4 ? -1 : 0), 0x5a1e1e, 1);
    for (let x = nx - 4; x <= nx + 4; x++) put(x, my + 1, W0, 0.5);
  }
  // ---- clothes: a shade too clean, colours drifted
  for (const R of [REG.TORSO, REG.ARM_L, REG.ARM_R, REG.LEG_L, REG.LEG_R, REG.SKIRT, REG.FOOT_L, REG.FOOT_R]) {
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
      const j = y * S + x; if (mask[j]) continue;
      const i = j * 4, L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
      d[i] = Math.min(255, d[i] * 0.86 + L * 0.14 + 6); d[i + 1] = Math.min(255, d[i + 1] * 0.86 + L * 0.14 + 5); d[i + 2] = Math.min(255, d[i + 2] * 0.86 + L * 0.14 + 2);
    }
  }
  // ---- the number they gave it (jumpsuits)
  if (f.number) {
    const T = REG.TORSO;
    // drawn wrapped round the torso region (the back is the seam at 180 degrees)
    const tput = (x: number, y: number, c: number) => put(T.x + ((((Math.round(x) - T.x) % T.w) + T.w) % T.w), y, c, 1);
    const stamp = (str: string, cx: number, cy: number, col: number, bg: number, pad = 1) => {
      const w = str.length * 4 - 1;
      const x0 = Math.round(cx - w / 2), y0 = Math.round(cy);
      for (let y = -pad; y <= 4 + pad; y++) for (let x = -pad; x < w + pad; x++) tput(x0 + x, y0 + y, bg);
      for (let n = 0; n < str.length; n++) {
        const g = DIGITS[str[n]] || DIGITS['?'];
        for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === '1') tput(x0 + n * 4 + q, y0 + r, col);
      }
    };
    // over the garment's own patch (left breast) and the stencil on the back: nearly the right number
    stamp(f.number.slice(2), regX(T, -30), torsoY(1.36) + 1, 0x1a1a1a, 0xf0ece0);
    const bi = (Math.round(torsoY(1.42)) * S + Math.round(regX(T, 150))) * 4;
    stamp(f.number, regX(T, 180), torsoY(1.38), 0x2a2218, (d[bi] << 16) | (d[bi + 1] << 8) | d[bi + 2], 2);
  }
  void seed;
}

// =====================================================================================
// poses (HumanRig joint Euler angles)
// =====================================================================================
type J = [number, number, number];
export type ReplicaPose = 'sit' | 'sit_table' | 'stand' | 'lie' | 'child' | 'kneel';
const setJ = (P: Pose, j: keyof Pose, x: number, y = 0, z = 0) => { (P as any)[j] = [x, y, z] as J; };

export function replicaPose(kind: ReplicaPose, seed = 0): Pose {
  const P: Pose = { gripL: 0.15, gripR: 0.15, blink: 0 };
  const h = (k: number) => { const s = Math.sin(seed * 91.7 + k * 17.3) * 43758.5453; return s - Math.floor(s); };
  const tilt = (h(1) - 0.5) * 0.5;
  switch (kind) {
    case 'sit': case 'sit_table':
      P.rootY = -0.47;
      setJ(P, 'thighL', -1.57, -0.04, 0.05); setJ(P, 'thighR', -1.57, 0.04, -0.05);
      setJ(P, 'shinL', 1.57, 0, 0); setJ(P, 'shinR', 1.57, 0, 0);
      setJ(P, 'footL', 0.02, 0, 0); setJ(P, 'footR', 0.02, 0, 0);
      setJ(P, 'spine', -0.02, 0, 0); setJ(P, 'chest', 0.02, 0, 0);
      if (kind === 'sit_table') {
        // hands laid flat on the table, side by side, waiting to be served
        setJ(P, 'uarmL', -0.72, -0.12, 0.1); setJ(P, 'farmL', -0.78, 0, 0); setJ(P, 'handL', 0.15, 0, 0);
        setJ(P, 'uarmR', -0.72, 0.12, -0.1); setJ(P, 'farmR', -0.78, 0, 0); setJ(P, 'handR', 0.15, 0, 0);
      } else {
        setJ(P, 'uarmL', -0.3, -0.06, 0.08); setJ(P, 'farmL', -0.7, 0, 0); setJ(P, 'handL', -0.15, 0, 0);
        setJ(P, 'uarmR', -0.3, 0.06, -0.08); setJ(P, 'farmR', -0.7, 0, 0); setJ(P, 'handR', -0.15, 0, 0);
      }
      setJ(P, 'neck', 0.04, 0, 0); setJ(P, 'head', 0.1, 0, tilt);
      return P;
    case 'lie':
      P.bodyPitch = -1.5708; P.bodyY = 0.11;
      setJ(P, 'uarmL', 0.02, 0, 0.06); setJ(P, 'uarmR', 0.02, 0, -0.06); setJ(P, 'farmL', -0.04, 0, 0); setJ(P, 'farmR', -0.04, 0, 0);
      setJ(P, 'thighL', 0, 0, 0.02); setJ(P, 'thighR', 0, 0, -0.02); setJ(P, 'footL', 0.45, 0, 0); setJ(P, 'footR', 0.45, 0, 0);
      setJ(P, 'head', -0.06, 0, tilt * 0.4);
      P.blink = 0;
      return P;
    case 'kneel':
      P.rootY = -0.42;
      setJ(P, 'thighL', -0.2, 0, 0.05); setJ(P, 'shinL', 1.75, 0, 0); setJ(P, 'footL', 0.6, 0, 0);
      setJ(P, 'thighR', -0.2, 0, -0.05); setJ(P, 'shinR', 1.75, 0, 0); setJ(P, 'footR', 0.6, 0, 0);
      setJ(P, 'uarmL', -0.1, 0, 0.05); setJ(P, 'uarmR', -0.1, 0, -0.05); setJ(P, 'farmL', -0.3, 0, 0); setJ(P, 'farmR', -0.3, 0, 0);
      setJ(P, 'head', 0.25, 0, tilt);
      return P;
    case 'child': case 'stand': default:
      // too straight: arms at its sides, palms in, the head a few degrees off true
      setJ(P, 'uarmL', 0.02, 0, 0.05); setJ(P, 'uarmR', 0.02, 0, -0.05);
      setJ(P, 'farmL', -0.06, 0, 0); setJ(P, 'farmR', -0.06, 0, 0);
      setJ(P, 'handL', 0, 0.3, 0); setJ(P, 'handR', 0, -0.3, 0);
      setJ(P, 'thighL', 0, 0, 0.03); setJ(P, 'thighR', 0, 0, -0.03);
      setJ(P, 'neck', 0.02, 0, 0); setJ(P, 'head', kind === 'child' ? 0.18 : 0.04, 0, tilt + (kind === 'child' ? 0.22 : 0));
      if (kind === 'child') { setJ(P, 'uarmL', -0.18, 0.2, 0.18); setJ(P, 'uarmR', -0.18, -0.2, -0.18); setJ(P, 'farmL', -1.1, 0, 0); setJ(P, 'farmR', -1.1, 0, 0); P.gripL = 0.5; P.gripR = 0.5; }
      return P;
  }
}

// =====================================================================================
// the child's proportions
// =====================================================================================
export const CHILD_SCALE = 0.62;
export const CHILD_HEAD = 1.32;
/** shrink a rig to a child and give it the head it would have had (call once after building) */
export function childProportions(hr: HumanRig, on: boolean) {
  hr.j.head.scale.setScalar(on ? CHILD_HEAD : 1);
  hr.root.scale.setScalar(on ? CHILD_SCALE : 1);
}

// =====================================================================================
// cached memory rigs + the atlas copies for props
// =====================================================================================
const RIGS = new Map<number, HumanRig>();
const PAINTED = new Set<number>();

/** a HumanRig wearing memory `mi`, page already cast in wax (shared, do not add to a scene) */
export function memoryRig(mi: number): HumanRig {
  mi = ((mi % MEMORY_COUNT) + MEMORY_COUNT) % MEMORY_COUNT;
  let hr = RIGS.get(mi);
  if (hr) return hr;
  const m = MEMORIES[mi];
  hr = new HumanRig(m.app);
  hr.setOutfit(m.outfit);
  waxify(pageData(hr), m, hashStr('replica:' + m.key));
  RIGS.set(mi, hr);
  return hr;
}
/** the pixels of a HumanRig's texture page */
export function pageData(hr: HumanRig): Uint8Array {
  const tex = (hr.skin.material as THREE.MeshLambertMaterial).map as THREE.DataTexture;
  return tex.image.data as Uint8Array;
}
export function pageTexture(hr: HumanRig): THREE.DataTexture {
  return (hr.skin.material as THREE.MeshLambertMaterial).map as THREE.DataTexture;
}

const PROP_PX = 128;
export const propTex = (mi: number) => 'c_replica_' + (((mi % MEMORY_COUNT) + MEMORY_COUNT) % MEMORY_COUNT);
addTextureModule(() => {
  const A = atlas();
  for (let i = 0; i < MEMORY_COUNT; i++) A.add(propTex(i), PROP_PX, PROP_PX, (pc) => { pc.wrap = false; pc.fill(0xc8b48c); });
});

/** downsample a 256 page to 128, keeping one-pixel features (eyes, stitches, lids) that an average would lose */
function downsample(src: Uint8Array, out: Uint8Array | Uint8ClampedArray, W: number) {
  const S = PAGE, k = S / W;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    const px: number[] = [];
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const i = ((y * k + dy) * S + x * k + dx) * 4;
      r += src[i]; g += src[i + 1]; b += src[i + 2]; px.push(i);
    }
    const n = k * k; r /= n; g /= n; b /= n;
    const L = r * 0.3 + g * 0.59 + b * 0.11;
    let best = -1, bd = 34;
    for (const i of px) { const l = src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11; const dd = Math.abs(l - L); if (dd > bd) { bd = dd; best = i; } }
    const o = (y * W + x) * 4;
    if (best >= 0) { out[o] = src[best]; out[o + 1] = src[best + 1]; out[o + 2] = src[best + 2]; }
    else { out[o] = r; out[o + 1] = g; out[o + 2] = b; }
    out[o + 3] = 255;
  }
}
/** paint memory `mi` into its atlas slot (once) */
export function ensurePropPage(mi: number) {
  mi = ((mi % MEMORY_COUNT) + MEMORY_COUNT) % MEMORY_COUNT;
  if (PAINTED.has(mi)) return;
  PAINTED.add(mi);
  const src = pageData(memoryRig(mi));
  try { atlas().repaint(propTex(mi), (pc) => { pc.wrap = false; downsample(src, pc.data, PROP_PX); }); } catch (e) { console.warn('replica page', e); }
}

// =====================================================================================
// baking a posed rig into static geometry
// =====================================================================================
const _m = new THREE.Matrix4(), _acc = new THREE.Matrix4(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _n3 = new THREE.Matrix3();
const ADD = (a: THREE.Matrix4, b: THREE.Matrix4, w: number) => { const ae = a.elements, be = b.elements; for (let i = 0; i < 16; i++) ae[i] += be[i] * w; };

/**
 * Freeze memory `mi` in a pose into `mb` (local transform `xf`), textured from
 * the atlas copy of its page. Returns triangles added.
 */
export function bakeReplica(mb: ModelBuilder, mi: number, pose: Pose, xf: THREE.Matrix4, child = false): number {
  const hr = memoryRig(mi);
  ensurePropPage(mi);
  childProportions(hr, child);
  hr.applyPose(pose);
  hr.root.updateMatrixWorld(true);
  const mesh = hr.skin;
  const g = mesh.geometry;
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), UV = g.getAttribute('uv'), C = g.getAttribute('color');
  const SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight'), I = g.getIndex();
  if (!P || !SI || !SW || !I) return 0;
  const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
  const mats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
  const n = P.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), atl = new Float32Array(n * 4), fx = new Float32Array(n * 2);
  const r = atlas().get(propTex(mi));
  for (let v = 0; v < n; v++) {
    _acc.elements.fill(0);
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(v, k); if (w > 0) ADD(_acc, mats[SI.getComponent(v, k)], w); }
    _m.copy(_acc);
    _v.fromBufferAttribute(P as THREE.BufferAttribute, v).applyMatrix4(_m);
    pos[v * 3] = _v.x; pos[v * 3 + 1] = _v.y; pos[v * 3 + 2] = _v.z;
    if (N) { _n3.getNormalMatrix(_m); _n.fromBufferAttribute(N as THREE.BufferAttribute, v).applyMatrix3(_n3).normalize(); nor[v * 3] = _n.x; nor[v * 3 + 1] = _n.y; nor[v * 3 + 2] = _n.z; }
    else nor[v * 3 + 1] = 1;
    uv[v * 2] = Math.min(0.9995, Math.max(0.0005, UV.getX(v))); uv[v * 2 + 1] = Math.min(0.9995, Math.max(0.0005, UV.getY(v)));
    const c = C ? [C.getX(v), C.getY(v), C.getZ(v)] : [1, 1, 1];
    col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
    atl[v * 4] = r.u0; atl[v * 4 + 1] = r.v0; atl[v * 4 + 2] = r.du; atl[v * 4 + 3] = r.dv;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
  out.setAttribute('aFx', new THREE.BufferAttribute(fx, 2));
  out.setIndex(Array.from(I.array as ArrayLike<number>));
  mb.appendGeometry(out, xf);
  childProportions(hr, false);
  return I.count / 3;
}

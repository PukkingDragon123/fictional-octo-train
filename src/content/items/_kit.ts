// Items stream — shared helpers: texture queue (prefix `i_`), a tiny pixel
// font, label / packaging painters and reusable low-poly model parts.
//
// Texel density note: world surfaces are 32 px/m, but hand-held items are
// tiny (a can is 0.11 m tall = 3.5 px at world density). Item detail textures
// (labels, covers, folded garments) are therefore authored at "icon density":
// roughly 12–32 texels across an item's longest side, applied with `fit` UVs,
// so models still read as crisp pixel art when rendered into inventory icons.
// Larger props (long weapons, kits) use the generic 32 px/m materials.
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph } from '../../gfx/pixel';
import { Rng, tileFbm } from '../../core/rng';
import type { ModelBuilder, PrimOpts, TexSpec } from '../../gfx/modelBuilder';

export { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph, Rng, tileFbm };
export type { ModelBuilder, PrimOpts, TexSpec };
export type MB = ModelBuilder;

// ------------------------------------------------------------------ texture queue
type Draw = (pc: PixelCanvas, rng: Rng) => void;
interface QTex { name: string; w: number; h: number; draw: Draw; tile: boolean }
const QUEUE: QTex[] = [];
const SEEN = new Set<string>();

/**
 * Queue an item texture. `tile` = drawing wraps around the edges (for
 * cylinder labels and tiling materials); otherwise a non-wrapping "fit" decal.
 * Returns the texture name so it can be used inline.
 */
export function tex(name: string, w: number, h: number, draw: Draw, tile = false): string {
  if (SEEN.has(name)) return name;
  SEEN.add(name);
  QUEUE.push({ name, w, h, draw, tile });
  return name;
}

addTextureModule(() => {
  const A = atlas();
  for (const q of QUEUE) {
    A.add(q.name, q.w, q.h, (pc, rng) => {
      pc.wrap = q.tile;
      try { q.draw(pc, rng); } catch (e) { console.error('item texture failed', q.name, e); pc.fill(0xff00ff); }
    });
  }
});

// ------------------------------------------------------------------ colour helpers
/** Hue-shifted ramp dark → light */
export const rp = (base: number, n = 5, spread = 0.5) => makeRamp(base, n, { hueShift: 0.035, spread });
export const dk = (c: number, f = 0.72) => scaleHex(c, f);
export const lt = (c: number, t = 0.35) => mixHex(c, 0xfff8ec, t);

/** Common palette */
export const K = {
  ink: 0x211d26, inkSoft: 0x3a3440, paper: 0xece4d0, paperDk: 0xcfc4a8, white: 0xf3efe6,
  red: 0xb8392e, redDk: 0x7d2422, orange: 0xd9782f, yellow: 0xe5c14a, mustard: 0xc9a23a,
  green: 0x4f8a3e, greenDk: 0x2f5a2c, teal: 0x3b8f8a, blue: 0x2f5f9c, blueDk: 0x1f3a63, sky: 0x8fc3e0,
  purple: 0x6b4a8c, pink: 0xe58fb0, brown: 0x7a4f2c, brownDk: 0x4a2f1c, tan: 0xc9a77a,
  grey: 0x8c8c88, greyDk: 0x4a4a4c, greyLt: 0xc8c8c2, silver: 0xc4c8cc, gold: 0xd6b04a,
  neonG: 0x9cff6a, neonC: 0x6af0ff, neonP: 0xff6ad8, pastelP: 0xf2b8d8, pastelB: 0xb8d8f2, pastelY: 0xf2ecb0,
};

// ------------------------------------------------------------------ pixel font (3x5)
const F5: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'], '-': ['...', '...', '###', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'], ':': ['...', '.#.', '...', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], '+': ['...', '.#.', '###', '.#.', '...'], '=': ['...', '###', '...', '###', '...'],
  "'": ['.#.', '.#.', '...', '...', '...'], '#': ['#.#', '###', '#.#', '###', '#.#'], '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '(': ['.#.', '#..', '#..', '#..', '.#.'], ')': ['.#.', '..#', '..#', '..#', '.#.'], '*': ['#.#', '.#.', '#.#', '...', '...'],
  '_': ['...', '...', '...', '...', '###'], '<': ['..#', '.#.', '#..', '.#.', '..#'], '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '♥': ['#.#', '###', '###', '.#.', '...'], ' ': ['...', '...', '...', '...', '...'],
};
const GLYPH: Record<string, string> = {};
for (const k of Object.keys(F5)) GLYPH[k] = F5[k].join('');

/** width in px of a string in the 3x5 font (1px spacing) */
export function txtW(s: string, sp = 1): number { return s.length ? s.length * (3 + sp) - sp : 0; }

/** draw text with the 3x5 font; returns drawn width */
export function txt(pc: PixelCanvas, s: string, x: number, y: number, c: number, shadow?: number, sp = 1): number {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPH[ch] ?? GLYPH['?'] ?? GLYPH[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
      if (g[j * 3 + i] !== '#') continue;
      if (shadow !== undefined) pc.set(cx + i + 1, y + j + 1, shadow);
    }
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') pc.set(cx + i, y + j, c);
    cx += 3 + sp;
  }
  return cx - x - sp;
}
/** centred text */
export function txtC(pc: PixelCanvas, s: string, cx: number, y: number, c: number, shadow?: number): number {
  return txt(pc, s, Math.round(cx - txtW(s) / 2), y, c, shadow);
}

// ------------------------------------------------------------------ painters
/** Stamp a pixel pattern; characters missing from the palette are transparent */
export function stamp(pc: PixelCanvas, x: number, y: number, rows: string[], pal: Record<string, number>) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const c = pal[rows[j][i]];
    if (c !== undefined) pc.set(x + i, y + j, c);
  }
}
/** stamp centred on cx */
export function stampC(pc: PixelCanvas, cx: number, y: number, rows: string[], pal: Record<string, number>) {
  stamp(pc, Math.round(cx - rows[0].length / 2), y, rows, pal);
}

/** Row of pseudo-text "words" (1px tall) — reads as small print */
export function dashes(pc: PixelCanvas, x: number, y: number, w: number, c: number, seed = 1, t = 1) {
  let i = 0;
  while (i < w) {
    const len = 2 + Math.floor(ph(i, y, seed) * 4);
    for (let k = 0; k < len && i + k < w; k++) pc.blend(x + i + k, y, c, t);
    i += len + 1;
  }
}

/** Flat fill with a gentle clustered 2-tone variation (keeps pixel art calm) */
export function calm(pc: PixelCanvas, base: number, amt = 0.08, seed = 3) {
  const R = rp(base, 5, 0.35);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = (ph(x >> 1, y >> 1, seed) - 0.5) * amt * 4 + (ph(x, y, seed + 1) - 0.5) * amt;
    const v = 0.5 + n;
    pc.set(x, y, R[Math.max(0, Math.min(4, Math.round(v * 4 + (bayer(x, y) - 0.5) * 0.6)))]);
  }
}

/** Fill rect with a ramp gradient top (light) → bottom (dark), dithered */
export function vgrad(pc: PixelCanvas, x: number, y: number, w: number, h: number, top: number, bot: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = h <= 1 ? 0 : j / (h - 1);
    pc.set(x + i, y + j, t > bayer(x + i, y + j) ? bot : top);
  }
}

/** bevelled rect: fill + light top-left + dark bottom-right */
export function bev(pc: PixelCanvas, x: number, y: number, w: number, h: number, c: number, light?: number, dark?: number) {
  pc.rect(x, y, w, h, c);
  pc.bevel(x, y, w, h, light ?? lt(c, 0.3), dark ?? dk(c, 0.7));
}

/** horizontal band */
export const band = (pc: PixelCanvas, y: number, h: number, c: number) => pc.rect(0, y, pc.w, h, c);

/** small 1px outline around an inner rect */
export function frame(pc: PixelCanvas, x: number, y: number, w: number, h: number, c: number) { pc.strokeRect(x, y, w, h, c); }

/**
 * Wrapped cylinder label: n repeated panels; the first panel is centred at
 * u = 0.125, which is the side of an unrotated cylinder that faces the
 * default isometric camera (and is the brightest-shaded side).
 */
export function panels(pc: PixelCanvas, n: number, draw: (x0: number, pw: number, k: number) => void) {
  pc.wrap = true;
  const pw = pc.w / n;
  for (let k = 0; k < n; k++) {
    const cx = (0.125 + k / n) * pc.w;
    draw(Math.round(cx - pw / 2), pw, k);
  }
}

/** Generic tin/jar/bottle label texture */
export interface LabelOpts {
  bg: number; band?: number; bandB?: number; plate?: number; ink?: number;
  icon?: string[]; pal?: Record<string, number>; iconY?: number; word?: string; wordC?: number;
  stripe?: number; panelsN?: number; split?: number; splitC?: number; dashesY?: number;
}
export function labelTex(name: string, w: number, h: number, o: LabelOpts): string {
  return tex(name, w, h, (pc) => {
    pc.fill(o.bg);
    // gentle vertical variation of the background
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ph(x >> 1, y >> 1, 77) < 0.12) pc.set(x, y, lt(o.bg, 0.08));
    if (o.split !== undefined) pc.rect(0, o.split, w, h - o.split, o.splitC ?? K.white);
    if (o.band !== undefined) { band(pc, 0, 2, o.band); pc.hline(0, w - 1, 2, dk(o.band, 0.6)); }
    if (o.bandB !== undefined) { band(pc, h - 2, 2, o.bandB); pc.hline(0, w - 1, h - 3, lt(o.bandB, 0.4)); }
    if (o.stripe !== undefined) pc.hline(0, w - 1, Math.floor(h / 2), o.stripe);
    panels(pc, o.panelsN ?? 2, (x0, pw) => {
      const cx = x0 + pw / 2;
      if (o.plate !== undefined) {
        const pwid = Math.min(pw - 2, (o.icon ? o.icon[0].length : 6) + 2);
        const ph0 = (o.iconY ?? 3) - 1, phh = (o.icon ? o.icon.length : 4) + 2;
        pc.rect(Math.round(cx - pwid / 2), ph0, pwid, phh, o.plate);
        pc.set(Math.round(cx - pwid / 2), ph0, o.bg); pc.set(Math.round(cx - pwid / 2) + pwid - 1, ph0, o.bg);
        pc.set(Math.round(cx - pwid / 2), ph0 + phh - 1, o.bg); pc.set(Math.round(cx - pwid / 2) + pwid - 1, ph0 + phh - 1, o.bg);
      }
      if (o.icon) stampC(pc, cx, o.iconY ?? 3, o.icon, o.pal ?? {});
      if (o.word) txtC(pc, o.word, cx, o.dashesY ?? h - 7, o.wordC ?? o.ink ?? K.ink);
      else if (o.dashesY !== undefined) dashes(pc, Math.round(cx - pw / 2) + 2, o.dashesY, pw - 4, o.ink ?? K.ink, 5);
    });
  }, true);
}

/** Front decal for a box / package. Draw callback gets the canvas (non-wrapping). */
export const decal = (name: string, w: number, h: number, draw: (pc: PixelCanvas, rng: Rng) => void) => tex(name, w, h, draw, false);

// ------------------------------------------------------------------ shared item textures
export const T = {
  tin: tex('i_tin', 8, 8, (pc) => {
    const R = rp(0xb4b8bc, 5, 0.45);
    pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, 0, 3) < 0.3 ? 1 : 0) - (ph(x, 1, 4) < 0.15 ? 1 : 0) + (y === 0 ? 1 : 0)]));
  }, true),
  tinTop: tex('i_tin_top', 10, 10, (pc) => {
    const R = rp(0xb8bcc0, 6, 0.5);
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 5, y + 0.5 - 5);
      let c = R[3];
      if (d > 4.3) c = R[5]; else if (d > 3.6) c = R[1]; else if (d > 2.6 && d < 3.2) c = R[2]; else if (d < 1.3) c = R[4];
      if (d < 4 && x + y < 7 && d > 3.2) c = R[4];
      pc.set(x, y, c);
    });
  }),
  aluTop: tex('i_alu_top', 10, 10, (pc) => {
    const R = rp(0xc0c4c8, 6, 0.5);
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 5, y + 0.5 - 5);
      pc.set(x, y, d > 4.2 ? R[5] : d > 3.6 ? R[1] : R[3]);
    });
    // pull tab + mouth
    pc.rect(4, 3, 2, 3, R[5]); pc.set(4, 3, R[4]); pc.rect(4, 6, 2, 2, R[0]); pc.set(5, 5, R[1]);
  }),
  glass: tex('i_glass', 8, 16, (pc) => {
    pc.fill(0xd8e2e2);
    pc.each((x, y) => { if (x >= 5) pc.set(x, y, 0xb9c6c8); if (x === 7) pc.set(x, y, 0x9fadb2); });
    for (let y = 1; y < 15; y++) { pc.set(1, y, 0xffffff); if (y % 5 !== 0) pc.set(2, y, 0xf2f6f6); }
  }),
  plastic: tex('i_plastic', 8, 8, (pc) => {
    pc.fill(0xe6e6e2);
    pc.each((x, y) => { if (ph(x >> 1, y >> 1, 9) < 0.18) pc.set(x, y, 0xd6d6d2); if (ph(x, y, 4) < 0.05) pc.set(x, y, 0xf6f6f2); });
  }, true),
  pages: tex('i_pages', 8, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, y % 2 === 0 ? 0xeee6d2 : (ph(x, y, 2) < 0.3 ? 0xd8ceb4 : 0xe2d9c2)));
  }, true),
  card: tex('i_card', 8, 8, (pc) => {
    pc.fill(0xe8e6e0);
    pc.each((x, y) => { if (ph(x >> 1, y, 5) < 0.15) pc.set(x, y, 0xdcdad2); });
  }, true),
  foldSide: tex('i_fold_side', 16, 6, (pc) => {
    pc.fill(0xd8d8d6);
    pc.hline(0, 15, 0, 0xf0f0ee);
    pc.hline(0, 15, 2, 0xb4b4b2); pc.hline(0, 15, 3, 0xe6e6e4);
    pc.hline(0, 15, 5, 0xa8a8a6);
    for (let x = 0; x < 16; x += 5) pc.set(x, 2, 0xc8c8c6);
  }),
  cap: tex('i_cap', 6, 4, (pc) => {
    pc.each((x, y) => pc.set(x, y, x % 2 === 0 ? 0xf0f0ec : 0xc8c8c4));
    pc.hline(0, 5, 0, 0xffffff);
  }, true),
  screen: tex('i_screen', 8, 6, (pc) => {
    pc.fill(0x1c2a2c);
    pc.hline(1, 6, 1, 0x34484a); pc.set(1, 2, 0x34484a); pc.set(6, 4, 0x2a3a3c);
  }),
  grip: tex('i_grip', 8, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, y % 3 === 0 ? 0x2a2a2e : y % 3 === 1 ? 0x3c3c42 : 0x333338));
  }, true),
  foil: tex('i_foil', 8, 8, (pc) => {
    pc.each((x, y) => { const v = ph(x >> 1, y >> 1, 21); pc.set(x, y, v < 0.3 ? 0x9aa0a6 : v < 0.75 ? 0xc6ccd2 : 0xeef2f6); });
  }, true),
  wood: tex('i_wood', 8, 16, (pc) => {
    const R = rp(0xb88a56, 5, 0.4);
    pc.each((x, y) => {
      const g = Math.sin((x + ph(0, y >> 2, 3) * 2) * 1.3) * 0.5 + 0.5;
      pc.set(x, y, R[1 + Math.round(g * 2 + (ph(x, y, 7) - 0.5) * 0.6)]);
    });
  }, true),
  metal: tex('i_metal', 8, 8, (pc) => {
    const R = rp(0x9aa0a6, 5, 0.45);
    pc.each((x, y) => pc.set(x, y, R[2 + (ph(x + y * 3, 0, 8) < 0.2 ? 1 : 0) - (ph(x, y, 9) < 0.1 ? 1 : 0)]));
  }, true),
  steel: tex('i_steel', 8, 4, (pc) => {
    // polished blade steel: bright streak + darker edge
    pc.fill(0xc6ccd2);
    pc.hline(0, 7, 0, 0xf2f6fa); pc.hline(0, 7, 1, 0xdfe5ea); pc.hline(0, 7, 3, 0x8c949c);
    for (let x = 0; x < 8; x += 3) pc.set(x, 2, 0xb0b8c0);
  }, true),
  rust: tex('i_rust', 8, 8, (pc) => {
    pc.each((x, y) => { const v = ph(x >> 1, y >> 1, 31) * 0.7 + ph(x, y, 32) * 0.3; pc.set(x, y, v < 0.3 ? 0x6a3a22 : v < 0.6 ? 0x8a4c2a : v < 0.85 ? 0x7a6a5e : 0xa25e34); });
  }, true),
  cloth: tex('i_cloth', 8, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, (x + y) % 4 === 0 ? 0xc8c8c6 : (x - y + 16) % 4 === 0 ? 0xe2e2e0 : 0xd6d6d4));
  }, true),
  knit: tex('i_knit', 8, 8, (pc) => {
    pc.each((x, y) => { const v = (x % 2 === 0) ? ((y + (x >> 1)) % 2 === 0 ? 0xdedede : 0xcacaca) : 0xb6b6b6; pc.set(x, y, v); });
  }, true),
  leather: tex('i_leather', 8, 8, (pc) => {
    pc.each((x, y) => { const v = ph(x >> 1, y >> 1, 41); pc.set(x, y, v < 0.25 ? 0x4a2c1c : v < 0.8 ? 0x5e3822 : 0x74482c); });
  }, true),
  nylon: tex('i_nylon', 8, 8, (pc) => {
    pc.fill(0xd2d2d0);
    for (let i = 0; i < 8; i += 4) { pc.hline(0, 7, i, 0xbcbcba); pc.vline(i, 0, 7, 0xbcbcba); }
    pc.set(2, 2, 0xe2e2e0); pc.set(6, 6, 0xe2e2e0);
  }, true),
  rubber: tex('i_rubber', 8, 8, (pc) => {
    pc.fill(0x2e2e32);
    pc.each((x, y) => { if (ph(x, y, 51) < 0.1) pc.set(x, y, 0x3a3a40); });
  }, true),
  black: tex('i_black', 4, 4, (pc) => { pc.fill(0x262428); pc.set(1, 1, 0x302e34); }, true),
  white: tex('i_white', 4, 4, (pc) => { pc.fill(0xf2f0ea); pc.set(2, 2, 0xe2e0da); }, true),
};

// ------------------------------------------------------------------ model helpers
/** tin can: label wraps the body; lid with rings */
export function can(mb: MB, label: string, r: number, h: number, o: { x?: number; z?: number; y?: number; top?: string; segs?: number; open?: boolean; fill?: string; fillColor?: number } = {}) {
  const x = o.x ?? 0, z = o.z ?? 0, y = o.y ?? 0, segs = o.segs ?? 10;
  const rim = Math.min(0.005, h * 0.08);
  mb.cylinder(x, y + rim, z, r, h - rim * 2, segs, { sides: label, top: T.tin, bottom: T.tin }, { fit: true, caps: false });
  mb.cylinder(x, y, z, r * 0.95, rim, segs, { sides: T.tin, top: T.tinTop, bottom: T.tinTop }, { fit: true });
  if (o.open) {
    // open can: rim ring + food surface slightly below the rim
    mb.cylinder(x, y + h - rim, z, r * 1.02, rim, segs, { sides: T.tin, top: T.tin, bottom: T.tin }, { fit: true, caps: false });
    mb.cylinder(x, y + h - rim * 3, z, r * 0.97, rim * 2, segs, { sides: T.tin, top: o.fill ?? T.tin, bottom: T.tin }, { fit: true, color: o.fillColor ?? 0xffffff });
    // lid bent up at the back
    mb.push().translate(x - r * 0.55, y + h, z - r * 0.2).rotateZ(1.1);
    mb.cylinder(0, 0, 0, r * 0.9, 0.002, segs, { sides: T.tin, top: T.tinTop, bottom: T.tinTop }, { fit: true });
    mb.pop();
  } else {
    mb.cylinder(x, y + h - rim, z, r * 1.02, rim, segs, { sides: T.tin, top: o.top ?? T.tinTop, bottom: T.tin }, { fit: true });
  }
}

/** Standing bottle: body + tapered shoulder + neck + cap; optional wrapped label */
export interface BottleOpts {
  r: number; h: number; neckR: number; neckH: number; shoulder: number;
  body?: string; bodyColor?: number; label?: string; labelY?: number; labelH?: number;
  cap?: number; capH?: number; capTex?: string; segs?: number; x?: number; z?: number; square?: boolean; emissive?: number;
}
export function bottle(mb: MB, o: BottleOpts) {
  const x = o.x ?? 0, z = o.z ?? 0, segs = o.segs ?? 8;
  const bodyH = o.h - o.shoulder - o.neckH - (o.capH ?? 0);
  const bt = o.body ?? T.glass;
  const col = o.bodyColor ?? 0xffffff;
  if (o.square) mb.box(x, 0, z, o.r * 1.8, bodyH, o.r * 1.8, bt, { color: col, fit: true, emissive: o.emissive });
  else mb.cylinder(x, 0, z, o.r, bodyH, segs, bt, { color: col, fit: true, emissive: o.emissive });
  mb.cylinder(x, bodyH, z, o.square ? o.r * 1.05 : o.r, o.shoulder, segs, bt, { color: col, fit: true, rTop: o.neckR, emissive: o.emissive });
  mb.cylinder(x, bodyH + o.shoulder, z, o.neckR, o.neckH, segs, bt, { color: col, fit: true, emissive: o.emissive });
  if (o.capH) mb.cylinder(x, o.h - o.capH, z, o.neckR * 1.25, o.capH, segs, o.capTex ?? T.cap, { color: o.cap ?? 0xffffff, fit: true });
  if (o.label) {
    const ly = o.labelY ?? bodyH * 0.25, lh = o.labelH ?? bodyH * 0.5;
    if (o.square) mb.box(x, ly, z, o.r * 1.84, lh, o.r * 1.84, { sides: o.label, top: o.label, bottom: o.label }, { fit: true, skip: ['top', 'bottom'] });
    else mb.cylinder(x, ly, z, o.r * 1.03, lh, segs, o.label, { fit: true, caps: false });
  }
}

/** Upright cardboard package: neutral tinted body + front decal on +z */
export function pack(mb: MB, w: number, h: number, d: number, front: string, color: number, o: { x?: number; y?: number; z?: number; side?: string; top?: string; backDecal?: boolean; eastDecal?: string } = {}) {
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0;
  mb.box(x, y, z, w, h, d, { all: o.side ?? T.card, top: o.top ?? o.side ?? T.card }, { color });
  mb.panel(x - w / 2, z + d / 2 + 0.0015, x + w / 2, z + d / 2 + 0.0015, y, y + h, front, { fit: true });
  if (o.eastDecal) mb.panel(x + w / 2 + 0.0015, z + d / 2, x + w / 2 + 0.0015, z - d / 2, y, y + h, o.eastDecal, { fit: true });
}

/**
 * A flat box with an untinted decal on its top face (things lying flat:
 * magazines, cards, folded paper). Sides use `side` tinted by `sideColor`.
 */
export function slab(mb: MB, w: number, h: number, d: number, top: string, side: string, sideColor = 0xffffff, o: { x?: number; y?: number; z?: number; rot?: number; topColor?: number; emissive?: number } = {}) {
  mb.push().translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  if (o.rot) mb.rotateY(o.rot);
  mb.box(0, 0, 0, w, h, d, side, { color: sideColor, skip: ['top'] });
  mb.flat(0, h, 0, w, d, top, { color: o.topColor ?? 0xffffff, emissive: o.emissive });
  mb.pop();
}

/** Book lying flat: boards, page block, cover decal on top, spine on -x */
export function book(mb: MB, w: number, d: number, h: number, cover: string, boardColor: number, o: { x?: number; z?: number; y?: number; rot?: number; soft?: boolean } = {}) {
  mb.push().translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  if (o.rot) mb.rotateY(o.rot);
  const bt = o.soft ? 0.0012 : Math.min(0.004, h * 0.15);
  mb.box(0, 0, 0, w, bt, d, T.card, { color: boardColor });
  mb.box(0.002, bt, 0, w - 0.006, h - bt * 2, d - 0.006, { all: T.pages }, { fit: false, uvScale: 4 });
  mb.box(0, h - bt, 0, w, bt, d, { all: T.card, top: cover }, { color: 0xffffff, fit: { top: true } });
  mb.box(-w / 2 + bt / 2, 0, 0, bt * 1.2, h, d, T.card, { color: boardColor });
  mb.pop();
}

/** Folded garment stack */
export function folded(mb: MB, w: number, d: number, h: number, top: string, color: number, o: { x?: number; z?: number; y?: number; side?: string } = {}) {
  mb.box(o.x ?? 0, o.y ?? 0, o.z ?? 0, w, h, d, { all: o.side ?? T.foldSide, top }, { color, fit: true });
}

/** Cylinder lying along X from x0 to x1 (radius r0 at x0, r1 at x1), axis at height cy; lit side up */
export function rodX(mb: MB, x0: number, x1: number, cy: number, r0: number, r1: number, segs: number, t: TexSpec, o: PrimOpts & { caps?: boolean; cz?: number } = {}) {
  mb.push().translate(x1, cy, o.cz ?? 0).rotateZ(Math.PI / 2);
  mb.cylinder(0, 0, 0, r1, x1 - x0, segs, t, { ...o, rTop: r0 });
  mb.pop();
}
/** Cylinder lying along Z from z0 to z1 */
export function rodZ(mb: MB, z0: number, z1: number, cy: number, r0: number, r1: number, segs: number, t: TexSpec, o: PrimOpts & { caps?: boolean; cx?: number } = {}) {
  mb.push().translate(o.cx ?? 0, cy, z0).rotateX(Math.PI / 2);
  mb.cylinder(0, 0, 0, r0, z1 - z0, segs, t, { ...o, rTop: r1 });
  mb.pop();
}

/** Simple pill bottle */
export function pillBottle(mb: MB, label: string, bodyColor: number, capColor: number, r = 0.022, h = 0.07, o: { x?: number; z?: number } = {}) {
  const x = o.x ?? 0, z = o.z ?? 0;
  mb.cylinder(x, 0, z, r, h * 0.8, 8, T.plastic, { color: bodyColor, fit: true });
  mb.cylinder(x, h * 0.16, z, r * 1.03, h * 0.5, 8, label, { fit: true, caps: false });
  mb.cylinder(x, h * 0.8, z, r * 1.12, h * 0.2, 8, T.cap, { color: capColor, fit: true });
}

/**
 * Extruded convex polygon (prism). `pts` are [x, z] corners in counter-clockwise
 * order seen from above with north (-z) up, i.e. east = +x, north = -z.
 * Top uses a planar fit mapping over the polygon bounds.
 */
export function prism(mb: MB, pts: [number, number][], y0: number, h: number, top: string, side: string, o: { color?: number; sideColor?: number; emissive?: number; bottom?: boolean } = {}) {
  const y1 = y0 + h;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const uv = (x: number, z: number) => [(x - minX) / (maxX - minX || 1), (maxZ - z) / (maxZ - minZ || 1)];
  const c = o.color ?? 0xffffff, sc = o.sideColor ?? c, e = o.emissive ?? 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0], b = pts[i], d = pts[i + 1];
    mb.triRaw([[a[0], y1, a[1]], [b[0], y1, b[1]], [d[0], y1, d[1]]], [uv(a[0], a[1]), uv(b[0], b[1]), uv(d[0], d[1])], top, c, 1, e);
    if (o.bottom) mb.triRaw([[a[0], y0, a[1]], [d[0], y0, d[1]], [b[0], y0, b[1]]], [uv(a[0], a[1]), uv(d[0], d[1]), uv(b[0], b[1])], side, sc, 0.55, e);
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    // outward normal of a CCW edge is (-dz, dx); brighter when facing the camera (+x/+z)
    const nx = -(q[1] - p[1]), nz = q[0] - p[0];
    const l = Math.hypot(nx, nz) || 1;
    const shade = 0.86 + 0.08 * ((nx + nz) / l) / 1.414;
    mb.quadRaw([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], side, sc, shade, e);
  }
}

/** Rotate everything built inside fn around Y (radians) about the origin */
export function rotY(mb: MB, a: number, fn: () => void) { mb.push().rotateY(a); fn(); mb.pop(); }
/** Translate everything built inside fn */
export function at(mb: MB, x: number, y: number, z: number, fn: () => void, rotYa = 0) { mb.push().translate(x, y, z); if (rotYa) mb.rotateY(rotYa); fn(); mb.pop(); }

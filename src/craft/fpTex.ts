// Hand-pixelled surfaces for the first-person scenes (bench, cooking, trading,
// the operation, the held devices): every texture is painted texel by texel on
// a small canvas with hue-shifted ramps and clustered dither — oiled planks with
// grain, nail heads and burns, masonite pegboard, chipped enamel over rusting
// iron, brushed and scratched steel, bakelite swirl, canvas and burlap weave,
// fire stones, glowing embers, charred logs, skin with pores — and shown crisp
// (NearestFilter, no mipmaps). pixMat() wraps one in a faceted PBR material.
// Geometry from Shape (shapes.ts) carries box-projected uvs at a metric scale,
// so `uv` repeats per metre decide how big a texel lands on screen.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex } from '../gfx/pixel';
import { Rng, tileNoise2, hashf } from '../core/rng';
import { metalEnv } from './metal';

export type TexKind =
  | 'bench' | 'plank' | 'crate' | 'pegboard' | 'masonite' | 'endgrain' | 'handle'
  | 'castIron' | 'rust' | 'steel' | 'stainless' | 'galv' | 'brass' | 'chrome'
  | 'enamelGreen' | 'enamelCream' | 'enamelRed' | 'paintOlive' | 'paintYellow'
  | 'bakelite' | 'bakeliteCream' | 'rubber' | 'leather'
  | 'canvas' | 'burlap' | 'tarp' | 'rag' | 'felt'
  | 'stone' | 'firebrick' | 'embers' | 'ash' | 'charLog' | 'soot'
  | 'skin' | 'flesh' | 'bone' | 'cardboard' | 'concrete' | 'tile';

type Draw = (p: PixelCanvas, r: Rng, glow: PixelCanvas | null) => void;
interface Recipe { w: number; h: number; draw: Draw; rough: number; metal: number; glow?: boolean; env?: number }

// ---------------------------------------------------------------- helpers
/** tileable fractal noise 0..1 over the canvas, `cells` lattice cells across */
function fbm(p: PixelCanvas, x: number, y: number, cells: number, seed: number, oct = 3, sx = 1, sy = 1) {
  let a = 0.5, s = 0, n = 0, c = cells;
  for (let i = 0; i < oct; i++) {
    const cx = Math.max(1, Math.round(c * sx)), cy = Math.max(1, Math.round(c * sy));
    s += a * tileNoise2((x / p.w) * cx, (y / p.h) * cy, cx, cy, seed + i * 31);
    n += a; a *= 0.5; c *= 2;
  }
  return s / n;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** ramp lookup with clustered dither between steps */
function rampAt(p: PixelCanvas, ramp: number[], x: number, y: number, v: number) {
  v = clamp01(v);
  const f = v * (ramp.length - 1);
  let i = Math.floor(f);
  if (f - i > p.clusterT(x, y)) i++;
  return ramp[Math.min(ramp.length - 1, i)];
}
/** a ragged chip: irregular blob, `fn` paints each pixel with its distance 0 (centre)..1 (edge) */
function blob(p: PixelCanvas, cx: number, cy: number, r: number, seed: number, fn: (x: number, y: number, d: number) => void) {
  for (let y = Math.floor(cy - r * 1.4); y <= cy + r * 1.4; y++) for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
    const a = Math.atan2(y - cy, x - cx);
    const rr = r * (0.7 + 0.5 * hashf(Math.floor((a + 4) * 2.2), seed, 3) + 0.2 * Math.sin(a * 3 + seed));
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rr;
    if (d <= 1) fn(x, y, d);
  }
}
function scratch(p: PixelCanvas, r: Rng, c: number, n: number, len: number, ang = -1, a = 0.6) {
  for (let i = 0; i < n; i++) {
    const x = r.float(0, p.w), y = r.float(0, p.h), t = ang < 0 ? r.float(0, Math.PI) : ang + r.float(-0.25, 0.25), l = r.float(len * 0.3, len);
    for (let k = 0; k < l; k++) p.blend(x + Math.cos(t) * k, y + Math.sin(t) * k, c, a * (1 - k / l * 0.5));
  }
}
/** a tiny cross-head screw / rivet: dark rim, light top-left */
function rivet(p: PixelCanvas, x: number, y: number, light: number, dark: number) {
  p.set(x, y, light); p.set(x + 1, y, mixHex(light, dark, 0.5)); p.set(x, y + 1, mixHex(light, dark, 0.5)); p.set(x + 1, y + 1, dark);
  p.set(x - 1, y + 1, scaleHex(dark, 0.6)); p.set(x + 1, y + 2, scaleHex(dark, 0.6)); p.set(x + 2, y + 1, scaleHex(dark, 0.5));
}

// ---------------------------------------------------------------- wood
function planks(p: PixelCanvas, r: Rng, o: { rows: number; base: number[]; oil?: number; nails?: boolean; burns?: number; cuts?: number; seed: number; rough?: number }) {
  const ph = p.h / o.rows;
  for (let row = 0; row < o.rows; row++) {
    const base = o.base[row % o.base.length];
    const ramp = makeRamp(base, 6, { hueShift: 0.03, spread: 0.55 });
    const y0 = Math.round(row * ph), y1 = Math.round((row + 1) * ph);
    const joint = r.int(8, p.w - 8), seed = o.seed + row * 17;
    const knotX = r.float(0, p.w), knotY = r.float(y0 + 3, y1 - 3), hasKnot = r.chance(0.6);
    for (let y = y0; y < y1; y++) for (let x = 0; x < p.w; x++) {
      // long grain: fibre lines running the length of the board, bent round a knot and wandering a little
      let gy = y + (fbm(p, x, y, 2, seed, 2, 1, 0.25) - 0.5) * 5;
      if (hasKnot) { const dx = (x - knotX) / 8, dy = (y - knotY) / 2.2, d = Math.sqrt(dx * dx + dy * dy); gy += Math.exp(-d * d) * 5 * Math.sign(y - knotY + 0.01); }
      const fibre = hashf(Math.floor(gy * 1.4), row, seed) - 0.5;
      const ring = Math.sin(gy * 0.75 + row * 2.1 + fbm(p, x, y, 1, seed + 2, 1) * 4);
      const along = fbm(p, x, y, 4, seed + 5, 2, 1, 0.2) - 0.5;
      let v = 0.56 + fibre * 0.32 + ring * 0.16 + along * 0.22 + (hashf(x, y, seed) - 0.5) * 0.06;
      if (x === joint) v = 0; else if (x === joint + 1) v += 0.18;
      p.set(x, y, rampAt(p, ramp, x, y, v));
    }
    if (hasKnot) blob(p, knotX, knotY, 2.2, seed, (x, y, d) => p.set(x, y, d < 0.5 ? ramp[0] : ramp[1]));
    // the seam between boards: a black gap with a lit lip under it
    for (let x = 0; x < p.w; x++) { p.set(x, y0, scaleHex(ramp[0], 0.45)); p.blend(x, y0 + 1, ramp[5], 0.35); p.blend(x, y1 - 1, ramp[0], 0.4); }
    if (o.nails) for (const nx of [joint - 4, joint + 4]) for (const ny of [y0 + 3, y1 - 4]) rivet(p, nx, ny, 0x9a968c, 0x2a2622);
  }
  // oil, grease and burns soaked into the grain
  for (let i = 0; i < (o.oil ?? 0); i++) p.stain(r.float(0, p.w), r.float(0, p.h), r.float(3, 9), 0x24160a, 0x140c06, r.int(1, 99));
  for (let i = 0; i < (o.burns ?? 0); i++) { const cx = r.float(0, p.w), cy = r.float(0, p.h), rr = r.float(2, 4); blob(p, cx, cy, rr, i + 7, (x, y, d) => p.blend(x, y, 0x120a04, d < 0.6 ? 0.85 : 0.45)); }
  for (let i = 0; i < (o.cuts ?? 0); i++) { const x = r.float(0, p.w), y = r.float(0, p.h), a = r.float(-0.5, 0.5) + (r.chance(0.5) ? 0 : Math.PI / 2), l = r.float(3, 9); for (let k = 0; k < l; k++) { p.blend(x + Math.cos(a) * k, y + Math.sin(a) * k, 0x1a0e06, 0.75); p.blend(x + Math.cos(a) * k, y + Math.sin(a) * k + 1, 0xe8c890, 0.25); } }
  p.grime(0x1c120a, 0.6, 4, o.seed + 3, 0.5);
}

// ---------------------------------------------------------------- metal
function metal(p: PixelCanvas, r: Rng, o: { base: number; spread?: number; brushed?: boolean; pits?: number; rust?: number; scratches?: number; seed: number; spangle?: boolean; tarnish?: number }) {
  const ramp = makeRamp(o.base, 6, { hueShift: 0.02, spread: o.spread ?? 0.45, satShift: 0.02 });
  p.each((x, y) => {
    let v = 0.5 + (fbm(p, x, y, 3, o.seed, 3) - 0.5) * 0.38 + (hashf(x, y, o.seed) - 0.5) * 0.12;
    if (o.brushed) v += (hashf(Math.floor(x / 9), y, o.seed + 9) - 0.5) * 0.3 + (fbm(p, x, y, 4, o.seed + 9, 2, 0.25, 4) - 0.5) * 0.25;
    if (o.spangle) { const c = Math.floor(fbm(p, x, y, 5, o.seed + 4, 1) * 7); v += ((c * 37) % 7) / 7 * 0.3 - 0.15; }
    p.set(x, y, rampAt(p, ramp, x, y, v));
  });
  if (o.tarnish) p.grime(mixHex(o.base, 0x3a4a2a, 0.7), o.tarnish, 3, o.seed + 1, 0.45);
  scratch(p, r, ramp[5], o.scratches ?? 18, 12, o.brushed ? 0.05 : -1, 0.5);
  scratch(p, r, ramp[0], Math.round((o.scratches ?? 18) * 0.4), 8, -1, 0.35);
  for (let i = 0; i < (o.pits ?? 0); i++) { const x = r.int(0, p.w - 1), y = r.int(0, p.h - 1); p.set(x, y, ramp[0]); p.blend(x, y - 1, ramp[5], 0.4); }
  for (let i = 0; i < (o.rust ?? 0); i++) {
    const cx = r.float(0, p.w), cy = r.float(0, p.h), rr = r.float(1.5, 5);
    blob(p, cx, cy, rr, i + o.seed, (x, y, d) => p.set(x, y, d < 0.45 ? 0x4a220e : d < 0.8 ? 0x7a3a16 : mixHex(p.get(x, y), 0x8a4a1e, 0.5)));
    if (r.chance(0.5)) for (let k = 0; k < r.int(3, 10); k++) p.blend(cx, cy + rr + k, 0x6a3214, 0.4 * (1 - k / 10));
  }
}
function enamel(p: PixelCanvas, r: Rng, color: number, seed: number, chips = 14) {
  const ramp = makeRamp(color, 6, { hueShift: 0.03, spread: 0.32 });
  p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 3, seed, 3) - 0.5) * 0.45)));
  p.grime(scaleHex(color, 0.55), 0.5, 3, seed + 2, 0.52);
  // chips knock the enamel off to black iron, a rust ring round the scar, a lit lip on the far edge
  for (let i = 0; i < chips; i++) {
    const cx = r.float(0, p.w), cy = r.float(0, p.h), rr = r.float(1, 3.6);
    blob(p, cx, cy, rr, i * 13 + seed, (x, y, d) => p.set(x, y, d < 0.55 ? 0x1e1c1a : d < 0.85 ? 0x5a2c14 : ramp[0]));
    p.blend(cx - rr * 0.6, cy - rr - 1, ramp[5], 0.7);
  }
  scratch(p, r, ramp[5], 10, 7, -1, 0.35);
  scratch(p, r, 0x2a2420, 6, 5, -1, 0.35);
}

// ---------------------------------------------------------------- cloth
function weave(p: PixelCanvas, r: Rng, o: { base: number; coarse?: number; stripes?: [number, number][]; stains?: number; seed: number; gap?: number }) {
  const ramp = makeRamp(o.base, 6, { hueShift: 0.02, spread: 0.4 });
  const k = o.coarse ?? 1;
  p.each((x, y) => {
    const cx = Math.floor(x / k), cy = Math.floor(y / k);
    const over = (cx + cy) & 1;
    const th = over ? (y % k) / k : (x % k) / k;
    let v = 0.5 + (over ? 0.12 : -0.12) + (fbm(p, x, y, 3, o.seed, 2) - 0.5) * 0.45 + (hashf(over ? cx : cy, 7, o.seed) - 0.5) * 0.25;
    if (k > 1) v -= Math.abs(th - 0.5) * 0.35;
    if (o.gap && ((x % k === 0 && !over) || (y % k === 0 && over))) v -= o.gap;
    p.set(x, y, rampAt(p, ramp, x, y, v));
  });
  for (const [y, c] of o.stripes ?? []) for (let x = 0; x < p.w; x++) for (let j = 0; j < 2; j++) p.blend(x, y + j, c, ((x + j) & 1) ? 0.85 : 0.65);
  for (let i = 0; i < (o.stains ?? 0); i++) p.stain(r.float(0, p.w), r.float(0, p.h), r.float(3, 8), scaleHex(o.base, 0.6), scaleHex(o.base, 0.42), i + o.seed);
  p.grime(scaleHex(o.base, 0.45), 0.5, 4, o.seed + 6, 0.5);
}

// ---------------------------------------------------------------- recipes
const R: Record<TexKind, Recipe> = {
  bench: { w: 128, h: 128, rough: 0.78, metal: 0, draw: (p, r) => planks(p, r, { rows: 4, base: [0x8a6038, 0x7a5432, 0x946840, 0x6e4a2a], oil: 7, nails: true, burns: 3, cuts: 14, seed: 11 }) },
  plank: { w: 64, h: 64, rough: 0.8, metal: 0, draw: (p, r) => planks(p, r, { rows: 2, base: [0xa07850, 0x8e6a44], cuts: 4, seed: 23 }) },
  crate: { w: 64, h: 64, rough: 0.85, metal: 0, draw: (p, r) => {
    planks(p, r, { rows: 3, base: [0xb8925c, 0xa88250, 0xc09a62], nails: true, cuts: 3, seed: 37 });
    // splinters and a stencil smudge
    for (let i = 0; i < 18; i++) { const x = r.int(0, 63), y = r.int(0, 63); p.set(x, y, 0xe0c088); p.set(x + 1, y, 0x5a3a1a); }
  } },
  pegboard: { w: 64, h: 64, rough: 0.82, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0x7a5838, 6, { spread: 0.4 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 4, 41, 3) - 0.5) * 0.4 + (hashf(x, y, 4) - 0.5) * 0.12)));
    p.grime(0x2a1a0e, 0.55, 3, 44, 0.48);
    // a grid of punched holes: dark bore, lit lower rim, a smudge of hands round some
    for (let y = 3; y < 64; y += 8) for (let x = 3; x < 64; x += 8) {
      if (hashf(x, y, 5) < 0.3) p.ellipseBlend(x + 1, y + 1, 3.2, 3.2, 0x2a1a0c, 0.35);
      p.rect(x, y, 2, 2, 0x0c0806); p.set(x + 2, y + 1, ramp[5]); p.set(x + 1, y + 2, ramp[5]); p.set(x - 1, y, ramp[1]); p.set(x, y - 1, ramp[1]);
    }
    p.stain(r.float(0, 64), r.float(0, 64), 9, 0x4a3018, 0x30200e, 3);
    scratch(p, r, ramp[5], 6, 10, -1, 0.3);
  } },
  masonite: { w: 64, h: 64, rough: 0.7, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0x6e4c30, 6, { spread: 0.38 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 6, 51, 3) - 0.5) * 0.35)));
    scratch(p, r, ramp[5], 14, 14, -1, 0.35); scratch(p, r, ramp[0], 8, 9, -1, 0.4);
    p.grime(0x24160a, 0.5, 3, 52, 0.5);
  } },
  endgrain: { w: 64, h: 64, rough: 0.8, metal: 0, draw: (p, r) => {
    // butcher block: squares of end grain with growth rings, knife scores, a blood soak
    for (let by = 0; by < 64; by += 16) for (let bx = 0; bx < 64; bx += 16) {
      const ramp = makeRamp(r.pick([0xb88a58, 0xa47a4c, 0xc4985e]), 6, { spread: 0.45 });
      const ox = bx + r.float(-14, 30), oy = by + r.float(-14, 30);
      for (let y = by; y < by + 16; y++) for (let x = bx; x < bx + 16; x++) {
        const d = Math.hypot(x - ox, y - oy) + fbm(p, x, y, 4, bx + by, 2) * 3;
        p.set(x, y, rampAt(p, ramp, x, y, 0.55 + Math.sin(d * 1.6) * 0.22));
      }
      for (let i = 0; i < 16; i++) { p.set(bx + i, by, ramp[0]); p.set(bx, by + i, ramp[0]); }
    }
    scratch(p, r, 0x3a2410, 22, 10, -1, 0.5); scratch(p, r, 0xe8c898, 10, 7, -1, 0.3);
    p.stain(30, 34, 10, 0x5a1a10, 0x3a0c08, 9);
  } },
  handle: { w: 32, h: 32, rough: 0.6, metal: 0, draw: (p, r) => planks(p, r, { rows: 1, base: [0xc89a62], seed: 61 }) },

  castIron: { w: 64, h: 64, rough: 0.55, metal: 0.75, env: 0.5, draw: (p, r) => metal(p, r, { base: 0x3a3c40, spread: 0.4, pits: 90, rust: 5, scratches: 10, seed: 71 }) },
  rust: { w: 64, h: 64, rough: 0.92, metal: 0.25, draw: (p, r) => {
    const ramp = [0x2a1208, 0x4a220e, 0x6e3416, 0x8e4a1e, 0xb0662a, 0xc88a44];
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, fbm(p, x, y, 4, 81, 4) * 1.15 - 0.05)));
    for (let i = 0; i < 40; i++) { const x = r.int(0, 63), y = r.int(0, 63); p.set(x, y, 0xd8a060); p.set(x, y + 1, 0x2a1208); }
  } },
  steel: { w: 64, h: 64, rough: 0.38, metal: 0.85, env: 0.9, draw: (p, r) => {
    metal(p, r, { base: 0x7e858a, brushed: true, scratches: 30, rust: 2, seed: 91 });
    for (let i = 0; i < 4; i++) p.ellipseBlend(r.float(0, 64), r.float(0, 64), r.float(3, 7), r.float(2, 4), 0x3a3a34, 0.35);
  } },
  stainless: { w: 64, h: 64, rough: 0.3, metal: 0.9, env: 1.1, draw: (p, r) => metal(p, r, { base: 0xa4abb0, brushed: true, scratches: 40, seed: 93, spread: 0.35 }) },
  galv: { w: 64, h: 64, rough: 0.42, metal: 0.8, env: 0.8, draw: (p, r) => metal(p, r, { base: 0x8e969a, spangle: true, scratches: 14, rust: 3, seed: 95 }) },
  brass: { w: 64, h: 64, rough: 0.35, metal: 0.9, env: 1, draw: (p, r) => metal(p, r, { base: 0xa8823a, scratches: 22, tarnish: 0.7, seed: 97 }) },
  chrome: { w: 64, h: 64, rough: 0.15, metal: 1, env: 1.5, draw: (p, r) => metal(p, r, { base: 0xc8ced4, spread: 0.6, scratches: 12, pits: 20, seed: 99 }) },

  enamelGreen: { w: 64, h: 64, rough: 0.35, metal: 0.05, env: 0.5, draw: (p, r) => enamel(p, r, 0x3e6a52, 101) },
  enamelCream: { w: 64, h: 64, rough: 0.3, metal: 0.05, env: 0.5, draw: (p, r) => enamel(p, r, 0xe0d6bc, 103, 18) },
  enamelRed: { w: 64, h: 64, rough: 0.35, metal: 0.05, env: 0.5, draw: (p, r) => enamel(p, r, 0xa8281c, 105) },
  paintOlive: { w: 64, h: 64, rough: 0.6, metal: 0.2, draw: (p, r) => enamel(p, r, 0x5a6248, 107, 10) },
  paintYellow: { w: 64, h: 64, rough: 0.55, metal: 0.1, draw: (p, r) => enamel(p, r, 0xd8a420, 109, 12) },

  bakelite: { w: 64, h: 64, rough: 0.38, metal: 0, env: 0.6, draw: (p, r) => {
    const ramp = makeRamp(0x4a2a18, 6, { spread: 0.45 });
    p.each((x, y) => { const w = fbm(p, x, y, 2, 111, 2) * 6; p.set(x, y, rampAt(p, ramp, x, y, 0.5 + Math.sin((x + w * 3) * 0.2 + fbm(p, x, y, 3, 113, 3) * 9) * 0.22)); });
    scratch(p, r, ramp[5], 10, 8, -1, 0.4);
  } },
  bakeliteCream: { w: 64, h: 64, rough: 0.4, metal: 0, env: 0.5, draw: (p, r) => {
    const ramp = makeRamp(0xdccaa2, 6, { spread: 0.3 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 3, 121, 3) - 0.5) * 0.5)));
    p.grime(0x6a5432, 0.6, 3, 122, 0.5);
    scratch(p, r, 0x8a7652, 12, 8, -1, 0.35);
    for (let i = 0; i < 6; i++) blob(p, r.float(0, 64), r.float(0, 64), r.float(0.8, 1.8), i, (x, y) => p.set(x, y, 0x5a4a32));
  } },
  rubber: { w: 32, h: 32, rough: 0.9, metal: 0, draw: (p, r) => { const ramp = makeRamp(0x2a2622, 5, { spread: 0.35 }); p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.5 + (hashf(x, y, 131) - 0.5) * 0.5))); scratch(p, r, ramp[4], 5, 6, -1, 0.4); } },
  leather: { w: 64, h: 64, rough: 0.7, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0x6a3e22, 6, { spread: 0.45 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 8, 141, 3) - 0.5) * 0.6)));
    for (let i = 0; i < 14; i++) { const x = r.float(0, 64), y = r.float(0, 64), l = r.float(4, 12), a = r.float(0, 3); for (let k = 0; k < l; k++) p.blend(x + Math.cos(a) * k, y + Math.sin(a) * k + Math.sin(k) * 0.6, ramp[0], 0.5); }
  } },

  canvas: { w: 64, h: 64, rough: 0.95, metal: 0, draw: (p, r) => weave(p, r, { base: 0x7a7250, coarse: 1, stains: 4, seed: 151 }) },
  burlap: { w: 64, h: 64, rough: 1, metal: 0, draw: (p, r) => {
    weave(p, r, { base: 0x9a8058, coarse: 3, gap: 0.45, stains: 2, seed: 161 });
    for (let i = 0; i < 60; i++) { const x = r.float(0, 64), y = r.float(0, 64), a = r.float(0, 3.14); for (let k = 0; k < 4; k++) p.blend(x + Math.cos(a) * k, y + Math.sin(a) * k, 0xc8a878, 0.5); }
  } },
  tarp: { w: 64, h: 64, rough: 0.7, metal: 0, draw: (p, r) => {
    weave(p, r, { base: 0x4a5444, coarse: 1, stains: 3, seed: 171 });
    for (let i = 0; i < 3; i++) p.stain(r.float(0, 64), r.float(0, 64), r.float(5, 11), 0x3a0a08, 0x22060a, i + 4);
  } },
  rag: { w: 64, h: 64, rough: 0.95, metal: 0, draw: (p, r) => weave(p, r, { base: 0xb8a888, coarse: 1, stripes: [[10, 0x8a2a22], [14, 0x8a2a22], [44, 0x2a3a6a]], stains: 5, seed: 181 }) },
  felt: { w: 64, h: 64, rough: 1, metal: 0, draw: (p, r) => { const ramp = makeRamp(0x2e4a34, 6, { spread: 0.35 }); p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.5 + (hashf(x, y, 191) - 0.5) * 0.4 + (fbm(p, x, y, 4, 192, 2) - 0.5) * 0.3))); p.stain(20, 30, 9, 0x1e3424, 0x12241a, 2); void r; } },

  stone: { w: 64, h: 64, rough: 0.92, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0x6e6a62, 6, { spread: 0.5 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.5 + (fbm(p, x, y, 4, 201, 4) - 0.5) * 0.8 + (hashf(x, y, 202) < 0.06 ? 0.3 : 0))));
    for (let i = 0; i < 8; i++) blob(p, r.float(0, 64), r.float(0, 64), r.float(1.5, 3.5), i + 9, (x, y, d) => p.blend(x, y, 0x5a6a3a, d < 0.7 ? 0.7 : 0.35));
    for (let i = 0; i < 5; i++) { let x = r.float(0, 64), y = r.float(0, 64); for (let k = 0; k < 12; k++) { p.set(x, y, ramp[0]); x += r.float(-1, 1.4); y += r.float(0.2, 1.2); } }
    p.grime(0x141210, 0.8, 3, 203, 0.45);
  } },
  firebrick: { w: 64, h: 64, rough: 0.9, metal: 0, draw: (p, r) => {
    const ramps = [makeRamp(0x8a4a30, 6, { spread: 0.45 }), makeRamp(0x7a3e28, 6, { spread: 0.45 }), makeRamp(0x9a5a3a, 6, { spread: 0.45 })];
    for (let row = 0; row < 8; row++) for (let bx = -1; bx < 4; bx++) {
      const ramp = r.pick(ramps), x0 = bx * 16 + (row & 1) * 8, y0 = row * 8;
      for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 16; x++) {
        const edge = y === y0 || x === x0;
        p.set(x, y, edge ? 0x3a342c : rampAt(p, ramp, x, y, 0.5 + (fbm(p, x, y, 6, 211, 2) - 0.5) * 0.6 + (y === y0 + 1 ? 0.2 : 0) - (y === y0 + 7 ? 0.2 : 0)));
      }
    }
    p.grime(0x0e0a08, 1, 2, 212, 0.4);
  } },
  embers: { w: 64, h: 64, rough: 1, metal: 0, glow: true, draw: (p, r, g) => {
    const coal = [0x0a0808, 0x16120e, 0x221a14, 0x30261c];
    const hot = [0x7a1a06, 0xb83a0a, 0xe86a14, 0xffa83a, 0xffe08a];
    p.each((x, y) => {
      const n = fbm(p, x, y, 5, 221, 3), c = fbm(p, x, y, 9, 223, 2);
      const crack = Math.abs(c - 0.5) < 0.05 + n * 0.05;
      if (crack || n > 0.68) {
        const v = clamp01((n - 0.4) * 1.8 + (crack ? 0.3 : 0));
        const col = rampAt(p, hot, x, y, v);
        p.set(x, y, col); g!.set(x, y, col);
      } else { p.set(x, y, rampAt(p, coal, x, y, n * 1.3)); g!.set(x, y, 0x000000); }
    });
    void r;
  } },
  ash: { w: 64, h: 64, rough: 1, metal: 0, glow: true, draw: (p, r, g) => {
    const ramp = [0x3a3634, 0x5a5652, 0x7a7670, 0x9a958c, 0xbab4a8];
    p.each((x, y) => { p.set(x, y, rampAt(p, ramp, x, y, fbm(p, x, y, 6, 231, 3) * 1.1)); g!.set(x, y, 0); });
    for (let i = 0; i < 40; i++) { const x = r.int(0, 63), y = r.int(0, 63); p.rect(x, y, 2, 1, 0x141210); }
    for (let i = 0; i < 26; i++) { const x = r.int(0, 63), y = r.int(0, 63), c = r.pick([0xe86a14, 0xb83a0a, 0xffa83a]); p.set(x, y, c); g!.set(x, y, c); }
  } },
  charLog: { w: 64, h: 64, rough: 0.95, metal: 0, glow: true, draw: (p, r, g) => {
    // bark along the length, charred to alligator scales, the cracks glowing
    p.each((x, y) => {
      const n = fbm(p, x, y, 6, 241, 3, 2, 0.5);
      // alligator scales: a jittered grid of cells, the edges between them are the cracks
      const wx = x + (fbm(p, x, y, 4, 243, 2) - 0.5) * 6, wy = y + (fbm(p, x, y, 4, 245, 2) - 0.5) * 6;
      const fx = wx / 7 - Math.floor(wx / 7), fy = wy / 5 - Math.floor(wy / 5);
      const inCrack = fx < 0.16 || fy < 0.2;
      if (inCrack && n > 0.36) { const c = n > 0.58 ? 0xffb04a : n > 0.47 ? 0xe86a14 : 0x9a2a08; p.set(x, y, c); g!.set(x, y, c); }
      else { p.set(x, y, rampAt(p, [0x080606, 0x14100c, 0x221a14, 0x3a2c20], x, y, n)); g!.set(x, y, 0); }
    });
    void r;
  } },
  soot: { w: 32, h: 32, rough: 1, metal: 0, draw: (p) => { p.each((x, y) => p.set(x, y, rampAt(p, [0x060504, 0x0e0c0a, 0x18140f, 0x221c16], x, y, fbm(p, x, y, 4, 251, 3)))); } },

  skin: { w: 64, h: 64, rough: 0.6, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0xc8a088, 6, { spread: 0.35, hueShift: 0.02 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 5, 261, 3) - 0.5) * 0.45 + (hashf(x, y, 262) < 0.05 ? -0.25 : 0))));
    for (let i = 0; i < 6; i++) { let x = r.float(0, 64), y = r.float(0, 64); for (let k = 0; k < 18; k++) { p.blend(x, y, 0x6a6aa0, 0.25); x += r.float(-0.6, 1.2); y += r.float(-0.8, 0.8); } }
    for (let i = 0; i < 3; i++) p.ellipseBlend(r.float(0, 64), r.float(0, 64), r.float(4, 8), r.float(3, 6), 0x6a3a5a, 0.35);
    for (let i = 0; i < 70; i++) p.set(r.int(0, 63), r.int(0, 63), ramp[1]);
  } },
  flesh: { w: 32, h: 32, rough: 0.35, metal: 0, draw: (p, r) => {
    const ramp = [0x3a0606, 0x5a0c0a, 0x7a1612, 0x9a2a22, 0xc04a3a, 0xe8908a];
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, fbm(p, x, y, 4, 271, 3) * 0.9 + (hashf(x, y, 272) < 0.04 ? 0.4 : 0))));
    void r;
  } },
  bone: { w: 32, h: 32, rough: 0.6, metal: 0, draw: (p) => { const ramp = makeRamp(0xe0d4b8, 5, { spread: 0.3 }); p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.5 + (fbm(p, x, y, 4, 281, 3) - 0.5) * 0.5 + (hashf(x, y, 282) < 0.08 ? -0.3 : 0)))); } },
  cardboard: { w: 64, h: 64, rough: 0.9, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0xa8845a, 6, { spread: 0.32 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 6, 291, 3) - 0.5) * 0.3 + (y % 4 === 0 ? -0.08 : 0))));
    p.stain(r.float(0, 64), r.float(0, 64), 10, 0x7a5a36, 0x5a3e22, 3);
    for (let i = 0; i < 4; i++) { const y = r.int(0, 63); for (let x = 0; x < 64; x++) p.blend(x, y, 0xc8b088, 0.3); }
  } },
  concrete: { w: 64, h: 64, rough: 0.95, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0x6a6660, 6, { spread: 0.35 });
    p.each((x, y) => p.set(x, y, rampAt(p, ramp, x, y, 0.5 + (fbm(p, x, y, 5, 301, 4) - 0.5) * 0.6 + (hashf(x, y, 302) < 0.05 ? 0.25 : 0))));
    p.stain(r.float(0, 64), r.float(0, 64), 12, 0x3a3630, 0x2a2622, 7);
  } },
  tile: { w: 64, h: 64, rough: 0.3, metal: 0, draw: (p, r) => {
    const ramp = makeRamp(0xc8c4b0, 6, { spread: 0.3 });
    p.each((x, y) => { const g = x % 16 === 0 || y % 16 === 0; p.set(x, y, g ? 0x4a463e : rampAt(p, ramp, x, y, 0.55 + (fbm(p, x, y, 4, 311, 2) - 0.5) * 0.3)); });
    p.grime(0x3a3226, 0.7, 4, 312, 0.45); void r;
  } },
};

// ---------------------------------------------------------------- textures and materials
const texCache = new Map<string, { map: THREE.CanvasTexture; glow: THREE.CanvasTexture | null }>();
function toCanvas(pc: PixelCanvas): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c;
}
function crisp(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** the painted canvas texture for a surface (and its glow map for embers and coals) */
export function pixTex(kind: TexKind): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture | null } {
  let t = texCache.get(kind);
  if (t) return t;
  const rc = R[kind];
  const pc = new PixelCanvas(rc.w, rc.h);
  const gl = rc.glow ? new PixelCanvas(rc.w, rc.h) : null;
  rc.draw(pc, new Rng(kind), gl);
  t = { map: crisp(toCanvas(pc)), glow: gl ? crisp(toCanvas(gl)) : null };
  texCache.set(kind, t);
  return t;
}

export interface PixMatOpts { color?: number; rough?: number; metal?: number; glow?: number; vc?: boolean; side?: THREE.Side; transparent?: boolean; opacity?: number }
const matCache = new Map<string, THREE.MeshStandardMaterial>();
/**
 * A faceted PBR material dressed in one of the painted surfaces. `vc` reads the
 * per-part tints a Shape bakes into vertex colours (default on); `glow` lights
 * the glowing pixels (embers, cracks) from inside.
 */
export function pixMat(kind: TexKind, o: PixMatOpts = {}): THREE.MeshStandardMaterial {
  const key = kind + JSON.stringify(o);
  let m = matCache.get(key);
  if (m) return m;
  const rc = R[kind], t = pixTex(kind);
  m = new THREE.MeshStandardMaterial({
    map: t.map, color: o.color ?? 0xffffff, roughness: o.rough ?? rc.rough, metalness: o.metal ?? rc.metal,
    vertexColors: o.vc ?? true, flatShading: true, side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false, opacity: o.opacity ?? 1,
  });
  if (rc.env) { m.envMap = metalEnv(); m.envMapIntensity = rc.env; }
  if (t.glow) { m.emissiveMap = t.glow; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = o.glow ?? 1.4; }
  matCache.set(key, m);
  return m;
}

/** every recipe name (the texture gallery) */
export const TEX_KINDS = Object.keys(R) as TexKind[];

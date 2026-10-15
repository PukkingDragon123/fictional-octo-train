// Per-character texture page: every survivor gets a 256x256 pixel-art page
// painted at ~2x the world's texel density (higher on the face): skin with
// baked occlusion and subtle colour variation, a readable face (eyes with
// whites/iris/lids, brows, lips, nose shading, stubble, freckles, age lines,
// scars), hair, and every garment with seams, folds, pockets, zips, prints,
// wear and dirt, plus visible condition (blood, bandages, wet, dirt, pallor).
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph } from '../gfx/pixel';
import { Rng, hashStr, tileFbm } from '../core/rng';
import { REG, RegKey, PAGE, PAD, VMAP } from './humanModel';
import type { Appearance, Outfit, LookPart, RigCondition } from './humanRig';
import { OutfitShape, garment, Paint, paintFallback } from './humanClothes';

const NOISE = new Map<string, Float32Array>();
const LIGHT = new Map<string, Float32Array>();
/** baked occlusion fields depend only on the region (and body shape), so compute them once */
function cachedLight(S: Surf, key: string, fn: (x: number, y: number) => number) {
  const k = S.w + 'x' + S.h + ':' + key;
  let f = LIGHT.get(k);
  if (!f) { f = new Float32Array(S.w * S.h); for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) f[y * S.w + x] = fn(x, y); LIGHT.set(k, f); }
  const w = S.w, F = f;
  S.light = (x, y) => F[y * w + x];
}

// ------------------------------------------------------------------ surface helper
export class Surf {
  pc: PixelCanvas;
  w: number; h: number;
  /** v range in reference metres */
  range: number[];
  /** +1 left limb, -1 right limb, 0 centre */
  side: number;
  key: RegKey;
  seed: number;
  /** extra shading term per pixel in ramp steps (baked occlusion) */
  light: (x: number, y: number) => number = () => 0;
  /** scales the occlusion for the next fills (skin wants it softer than cloth) */
  lightMul = 1;
  constructor(key: RegKey, range: number[], side: number, seed: number) {
    const r = REG[key];
    this.key = key; this.w = r.w; this.h = r.h; this.range = range; this.side = side; this.seed = seed;
    this.pc = new PixelCanvas(r.w, r.h);
    this.pc.wrap = true;
  }
  /** column of an angle (deg; 0 = front, +90 = outer side for limbs / character's left on the torso) */
  X(deg: number) { return (0.5 + deg / 360) * this.w; }
  /** row of a height in reference metres */
  Y(y: number) { return (1 - (y - this.range[0]) / (this.range[1] - this.range[0])) * this.h; }
  deg(x: number) { return ((x + 0.5) / this.w - 0.5) * 360; }
  yAt(row: number) { return this.range[0] + (1 - (row + 0.5) / this.h) * (this.range[1] - this.range[0]); }
  /** dithered write of a fractional ramp index (dither only near the middle between two steps) */
  put(x: number, y: number, R: number[], v: number, dither = 0.5) {
    let i = Math.floor(v);
    if (v - i > 0.5 + (bayer(x, y) - 0.5) * dither) i++;
    this.pc.set(x, y, R[i < 0 ? 0 : i >= R.length ? R.length - 1 : i]);
  }
  /** fill rows [y0, y1) (optionally masked) with ramp values */
  fill(R: number[], fn: (x: number, y: number) => number, y0 = 0, y1 = this.h, mask?: (x: number, y: number) => boolean) {
    const a = Math.max(0, Math.floor(y0)), b = Math.min(this.h, Math.ceil(y1));
    for (let y = a; y < b; y++) for (let x = 0; x < this.w; x++) {
      if (mask && !mask(x, y)) continue;
      this.put(x, y, R, fn(x, y) + this.light(x, y) * Math.min(1.2, R.length / 8) * this.lightMul);
    }
  }
  /** horizontal wrapped line across the whole circumference */
  ring(y: number, c: number, t = 1) { const yy = Math.round(y); for (let x = 0; x < this.w; x++) this.pc.blend(x, yy, c, t); }
  /** tileable noise (wraps with the region size); fields are cached, four variants per region */
  fbm(x: number, y: number, cells = 3, oct = 2, seed = 0) {
    const w = this.w, h = this.h;
    const key = w + 'x' + h + ':' + cells + ':' + oct + ':' + (seed + (this.seed & 3) * 1009);
    let f = NOISE.get(key);
    if (!f) {
      f = new Float32Array(w * h);
      const sd = seed + (this.seed & 3) * 1009;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[j * w + i] = tileFbm(i, j, w, h, cells, oct, sd);
      NOISE.set(key, f);
    }
    const xi = ((Math.floor(x) % w) + w) % w, yi = ((Math.floor(y) % h) + h) % h;
    return f[yi * w + xi];
  }
}

// ------------------------------------------------------------------ appearance helpers
export const EYE_COLORS = [0x5a3a22, 0x3a2414, 0x6a7a3a, 0x3a6a9a, 0x6a8aa8, 0x8a6a3a, 0x4a5a5a];
export interface Skin { R: number[]; base: number; app: Appearance; fem: number; seed: number; pale: number; dirt: number; wet: number }

function skinRamp(c: number, pale: number) {
  let base = scaleHex(c, 0.92);
  if (pale > 0) base = mixHex(base, 0xa8aab0, 0.16 * pale);
  return makeRamp(base, 12, { hueShift: 0.03, spread: 0.55, satShift: 0.08 });
}
const SKIN_MID = 5.6;

// ------------------------------------------------------------------ body skin
function paintSkinBody(S: Surf, K: Skin) {
  const R = K.R;
  S.lightMul = 0.7;
  S.fill(R, (x, y) => SKIN_MID + (S.fbm(x, y, 3, 2, 3) - 0.5) * 0.45 + (ph(x, y, K.seed) - 0.5) * 0.1);
  S.lightMul = 1;
}

function torsoLight(S: Surf, fem: number) {
  fem = Math.round(fem * 4) / 4;
  cachedLight(S, 'torso' + fem, (x, y) => {
    const th = (S.deg(x) * Math.PI) / 180, yy = S.yAt(y);
    let l = 0.25 * Math.cos(th) - 0.15;
    // armpits / sides under the arms
    l -= 1.1 * Math.exp(-((yy - 1.33) ** 2) / 0.003) * Math.exp(-((Math.abs(th) - Math.PI / 2) ** 2) / 0.12);
    // crotch and between the legs
    l -= 1.4 * Math.max(0, (0.875 - yy) / 0.06) * (0.4 + 0.6 * Math.abs(Math.cos(th)));
    // under bust / pecs
    l -= (0.6 * fem + 0.25) * Math.exp(-((yy - 1.2) ** 2) / 0.0006) * Math.exp(-((Math.abs(th) - 0.48) ** 2) / 0.12) * (Math.cos(th) > 0 ? 1 : 0);
    // top of shoulders catch light
    l += 0.4 * Math.max(0, (yy - 1.4) / 0.08);
    // neck base shadow
    l -= 0.5 * Math.max(0, (yy - 1.47) / 0.03);
    return l;
  });
}
function limbLight(S: Surf, kind: 'arm' | 'leg') {
  cachedLight(S, kind, (x, y) => {
    const th = (S.deg(x) * Math.PI) / 180, yy = S.yAt(y);
    // u=0.25 (-90deg) is the inner side
    let l = -0.35 * Math.max(0, -Math.sin(th)) + 0.18 * Math.cos(th) - 0.1;
    if (kind === 'arm') {
      l -= 1.0 * Math.max(0, (yy - 0.0) / 0.05) * Math.max(0, -Math.sin(th));    // armpit
      l -= 0.6 * Math.exp(-((yy + 0.285) ** 2) / 0.0006) * Math.max(0, Math.cos(th) * 0.7 - Math.sin(th) * 0.3); // inner elbow
      l += 0.25 * Math.max(0, (yy - 0.0) / 0.06) * Math.max(0, Math.sin(th)); // shoulder cap
    } else {
      l -= 1.2 * Math.max(0, (yy + 0.02) / 0.07) * Math.max(0, -Math.sin(th) * 0.8 + 0.2); // crotch
      l -= 0.8 * Math.exp(-((yy + 0.45) ** 2) / 0.0008) * Math.max(0, -Math.cos(th)); // back of knee
      l += 0.25 * Math.exp(-((yy + 0.43) ** 2) / 0.0008) * Math.max(0, Math.cos(th)); // kneecap highlight
      l -= 0.3 * Math.max(0, (-0.8 - yy) / 0.06);
    }
    return l;
  });
}

// ------------------------------------------------------------------ face
const HX = (S: Surf, deg: number) => Math.round(S.X(deg) - 0.5);
const HY = (S: Surf, y: number) => Math.round(S.Y(y) - 0.5);

function paintHead(S: Surf, K: Skin, o: Outfit, sh: OutfitShape, cond: RigCondition) {
  const R = K.R, A = K.app, fem = K.fem;
  const face = A.face ?? 0;
  const rng = new Rng(K.seed + 11);
  const hairC = A.hair;
  const age = A.age ?? 0;
  // ---- base skin with facial occlusion
  cachedLight(S, 'head', (x, y) => {
    const deg = S.deg(x), yy = S.yAt(y);
    const a = Math.abs(deg);
    let l = 0.12;
    l -= 0.9 * Math.max(0, (0.0 - yy) / 0.03);                                 // under the jaw
    l -= 0.35 * Math.max(0, (a - 70) / 110);                                    // sides/back away from the face
    l += 0.3 * Math.exp(-((yy - 0.15) ** 2) / 0.002) * Math.max(0, 1 - a / 60); // forehead highlight
    l -= 0.5 * Math.exp(-((yy - 0.099) ** 2) / 0.0002) * Math.exp(-((a - 18) ** 2) / 120); // eye sockets
    l += 0.35 * Math.exp(-((yy - 0.074) ** 2) / 0.0004) * Math.exp(-((a - 42) ** 2) / 200); // cheekbones
    l -= 0.3 * Math.exp(-((yy - 0.05) ** 2) / 0.0005) * Math.exp(-((a - 30) ** 2) / 150); // under cheekbones
    return l;
  });
  S.fill(R, (x, y) => SKIN_MID + (S.fbm(x, y, 4, 2, 5) - 0.5) * 0.45 + (ph(x, y, K.seed + 1) - 0.5) * 0.1);
  // warm flush: cheeks, nose tip, ears; cool beard shadow for masculine faces
  const warm = mixHex(R[5], 0xd06050, 0.28);
  for (const k of [1, -1]) {
    S.pc.ditherBlob(S.X(k * 38), S.Y(0.068), 3.2, 2.2, warm, 0.55 + fem * 0.25);
    S.pc.ditherBlob(S.X(k * 95), S.Y(0.084), 2, 4, mixHex(R[4], 0xc05048, 0.25), 0.7);
  }
  S.pc.ditherBlob(S.X(0), S.Y(0.06), 1.6, 1.4, warm, 0.6);
  const fh = A.facialHair || (A.beard ? 'beard' : 'none');
  const beardArea = (deg: number, yy: number) => {
    const a = Math.abs(deg);
    if (yy > 0.058 || yy < -0.028) return 0;
    if (a > 92) return 0;
    if (yy > 0.044 && a < 12) return 0.7;             // upper lip
    if (yy > 0.025 && yy < 0.042 && a < 20) return 0; // lips
    const cheekTop = 0.055 - (a > 40 ? (a - 40) * 0.0004 : 0);
    if (yy > cheekTop) return 0;
    return 1;
  };
  const stubble = fh === 'stubble' ? 0.8 : fh === 'beard' || fh === 'goatee' || fh === 'moustache' ? 0.4 : Math.max(0, 0.5 - fem) * 0.3;
  if (stubble > 0) {
    // a cool shadow over the beard area, flecked with darker hair dots
    const shadow = mixHex(R[4], 0x4a5058, 0.18 + stubble * 0.12);
    const dot = mixHex(mixHex(R[3], 0x30343a, 0.3), scaleHex(hairC, 0.7), 0.45);
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const a = beardArea(S.deg(x), S.yAt(y));
      if (a <= 0) continue;
      S.pc.blend(x, y, shadow, a * (0.25 + stubble * 0.35));
      if (bayer(x, y) < a * stubble * 0.45) S.pc.blend(x, y, dot, 0.6);
    }
  }
  // ---- scalp under the hair: paint hair colour above the hairline so gaps never show skin
  const style = A.hairStyle;
  if (style !== 'bald') {
    const HR = makeRamp(hairC, 6, { hueShift: 0.03, spread: 0.5 });
    const line = (deg: number) => {
      const a = Math.abs(deg);
      const front = style === 'buzz' ? 0.158 : 0.155, temple = 0.132, side = style === 'buzz' ? 0.112 : 0.1, back = 0.03;
      if (a < 25) return front; if (a < 60) return front + (temple - front) * ((a - 25) / 35);
      if (a < 105) return temple + (side - temple) * ((a - 60) / 45); return side + (back - side) * Math.min(1, (a - 105) / 55);
    };
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const deg = S.deg(x), yy = S.yAt(y), ln = line(deg);
      if (yy > ln + 0.004) S.put(x, y, HR, 2.4 + (ph(x, y, 3) - 0.5) * (style === 'buzz' ? 2 : 1));
      else if (yy > ln - 0.006 && ph(x, y, 5) < (yy - ln + 0.006) / 0.01) S.pc.blend(x, y, HR[2], 0.7);
    }
    // sideburns
    if (style !== 'long' && style !== 'bob') for (const k of [1, -1]) for (let y = HY(S, 0.13); y <= HY(S, 0.07 + fem * 0.04); y++) for (let dx = 0; dx < 2; dx++) S.pc.blend(HX(S, k * (84 - dx * 4)), y, HR[1], 0.75);
  } else {
    // bald: scalp highlight
    S.pc.ditherBlob(S.X(-20), S.Y(0.19), 6, 2.5, R[7], 0.6);
  }
  // ---- eyes
  const eyeY = HY(S, 0.096);
  const iris = A.eyeColor ?? EYE_COLORS[Math.floor(ph(K.seed, 1, 2) * EYE_COLORS.length)];
  const IR = makeRamp(iris, 4, { spread: 0.5 });
  const white = mixHex(0xf2efe6, R[6], 0.15), lash = mixHex(0x1c1410, hairC, 0.2), lid = R[3];
  const narrow = face === 2, round = face === 4;
  const lookDir = 0;
  for (const k of [-1, 1]) {
    // k = -1: character's right eye (viewer's left)
    const cx = S.X(k * 17.5);
    const x0 = Math.round(cx - 2), x1 = x0 + 3;
    // socket shadow + upper lid crease
    for (let x = x0 - 1; x <= x1 + 1; x++) { S.pc.blend(x, eyeY - 2, R[3], 0.45); S.pc.blend(x, eyeY + 1, R[4], 0.3); }
    // lid line / lashes
    for (let x = x0; x <= x1; x++) S.pc.set(x, eyeY - 1, x === (k > 0 ? x1 : x0) && !fem ? lid : lash);
    if (fem > 0.5) { S.pc.set(k > 0 ? x1 + 1 : x0 - 1, eyeY - 1, lash); }
    // eye: white | iris | iris | white  (narrow eyes lose a row of white)
    for (let x = x0; x <= x1; x++) S.pc.set(x, eyeY, white);
    const ix = Math.round(cx - 0.5 + lookDir);
    S.pc.set(ix, eyeY, IR[1]); S.pc.set(ix + 1, eyeY, IR[2]);
    if (!narrow) {
      // pupil + catchlight on round/open eyes
      S.pc.set(ix, eyeY, mixHex(IR[0], 0x101010, 0.5));
      if (round) { for (let x = x0; x <= x1; x++) S.pc.set(x, eyeY + 1, x === ix || x === ix + 1 ? IR[1] : mixHex(white, R[4], 0.4)); }
    } else {
      S.pc.set(x0, eyeY, lid); S.pc.set(x1, eyeY, mixHex(white, lid, 0.5));
    }
    // lower lid / bags
    for (let x = x0; x <= x1; x++) S.pc.blend(x, eyeY + (round ? 2 : 1), R[3], 0.35 + age * 0.3);
    // brows: hair colour, shape by variant and body shape
    const BR = scaleHex(mixHex(hairC, 0x2a2018, 0.25), 0.85);
    const by = HY(S, 0.115) - (round ? 1 : 0);
    for (let i = 0; i < 5; i++) {
      const bx = Math.round(cx - 2.5 + i);
      const arch = fem > 0.5 ? (i === 2 || i === 3 ? -1 : 0) : face === 5 ? (i < 2 ? 1 : 0) : 0;
      const thick = fem > 0.5 ? (i >= 1 && i <= 3 ? 1 : 0) : face === 5 || face === 1 ? 2 : 1 + (i < 3 ? 1 : 0);
      const xx = k > 0 ? Math.round(cx + 2.5 - i) : bx; // mirror so the thick end sits near the nose
      for (let t = 0; t < Math.max(1, thick); t++) S.pc.blend(xx, by + arch + t, BR, i === 4 ? 0.55 : 0.92);
    }
    // crow's feet / age
    if (age > 0.4) { const ox = k > 0 ? x1 + 2 : x0 - 2; S.pc.blend(ox, eyeY - 1, R[3], 0.5); S.pc.blend(ox, eyeY + 1, R[3], 0.5); }
  }
  // ---- nose
  const nx = Math.round(S.X(0) - 0.5);
  for (let y = HY(S, 0.095); y <= HY(S, 0.062); y++) { S.pc.blend(nx, y, R[6], 0.35); S.pc.blend(nx + 1, y, R[5], 0.2); S.pc.blend(nx - 2, y, R[3], 0.35); S.pc.blend(nx + 2, y, R[3], 0.3); }
  const ny = HY(S, 0.053);
  S.pc.set(nx - 1, ny, R[2]); S.pc.set(nx + 1, ny, R[2]);           // nostrils
  S.pc.blend(nx, ny, R[4], 0.6);
  S.pc.blend(nx, ny - 1, R[7], 0.5);                                 // tip highlight
  for (let x = nx - 2; x <= nx + 2; x++) S.pc.blend(x, ny + 1, R[3], 0.4); // under-nose shadow
  // ---- mouth
  const my = HY(S, 0.034);
  const lipC = mixHex(R[4], fem > 0.5 ? 0xb04848 : 0x9a4a40, 0.32 + fem * 0.12);
  const lipD = mixHex(lipC, 0x2a1210, 0.35), lipL = mixHex(lipC, 0xffe0d0, 0.25);
  const mw = face === 5 ? 3 : fem > 0.5 ? 3 : 3;
  S.pc.blend(nx, my - 2, R[4], 0.4); // philtrum
  for (let x = nx - mw; x <= nx + mw; x++) {
    const edge = Math.abs(x - nx) === mw;
    S.pc.set(x, my, edge ? lipD : face === 5 ? lipD : mixHex(lipD, lipC, 0.35));   // lip line
    if (!edge) S.pc.blend(x, my - 1, lipC, face === 5 ? 0.3 : 0.75);              // upper lip
    if (Math.abs(x - nx) < mw - (fem > 0.5 ? 0 : 1)) S.pc.blend(x, my + 1, Math.abs(x - nx) < 1 ? lipL : lipC, face === 5 ? 0.35 : 0.7); // lower lip
  }
  if (face === 1) { S.pc.set(nx - mw - 1, my - 1, lipD); S.pc.set(nx + mw + 1, my - 1, lipD); } // smile corners
  S.pc.blend(nx, my + 3, R[3], 0.4); S.pc.blend(nx - 1, my + 3, R[3], 0.25); S.pc.blend(nx + 1, my + 3, R[3], 0.25); // chin dimple shadow
  for (let x = nx - 2; x <= nx + 2; x++) S.pc.blend(x, HY(S, 0.004), R[6], 0.35); // chin highlight
  // ---- details: freckles, age lines, scars
  const freckles = A.freckles ?? (face === 3 ? 0.5 : 0);
  if (freckles > 0) {
    const fc = mixHex(R[3], 0x8a4a2a, 0.4);
    for (let i = 0; i < 26 * freckles; i++) {
      const d = (rng.next() - 0.5) * 80, yy = 0.058 + rng.next() * 0.04 - Math.abs(d) * 0.0002;
      if (Math.abs(d) < 5 && yy < 0.07) continue;
      S.pc.set(Math.round(S.X(d) - 0.5), Math.round(S.Y(yy) - 0.5), fc);
    }
  }
  if (age > 0.3) {
    for (const yy of [0.135, 0.145]) for (let x = HX(S, -16); x <= HX(S, 16); x++) if (ph(x, yy * 1000, 3) < age * 0.8) S.pc.blend(x, HY(S, yy), R[3], 0.4);
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) S.pc.blend(nx + k * (3 + Math.floor(i * 0.5)), HY(S, 0.052) + i * 2, R[3], 0.3 + age * 0.3); // nasolabial
  }
  const scars = A.scars ?? 0;
  for (let i = 0; i < scars; i++) {
    const sx = (ph(i, K.seed, 4) - 0.5) * 60, sy = 0.06 + ph(i, K.seed, 5) * 0.08, len = 3 + Math.floor(ph(i, K.seed, 6) * 4);
    const sc = mixHex(R[6], 0xd89090, 0.35);
    for (let t = 0; t < len; t++) { S.pc.set(HX(S, sx) + t, HY(S, sy) - Math.round(t * 0.6), sc); if (t % 2 === 0) S.pc.blend(HX(S, sx) + t, HY(S, sy) - Math.round(t * 0.6) + 1, R[3], 0.4); }
  }
  // ---- glasses painted on (frames + lenses), temples are geometry
  if (sh.eyes) {
    const fc = sh.eyes === 'goggles' ? mixHex(o.eyes?.color ?? 0x4aa0d8, 0x101010, 0.25) : (o.eyes?.color ?? 0x202020);
    const lens = sh.eyes === 'sunglasses' ? 0x14181e : sh.eyes === 'goggles' ? mixHex(o.eyes?.color ?? 0x4aa0d8, 0xd0e8f0, 0.45) : -1;
    for (const k of [-1, 1]) {
      const cx = S.X(k * 17.5);
      const x0 = Math.round(cx - 3), x1 = x0 + 5, y0 = eyeY - 2, y1 = eyeY + 2;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        if (edge) { if (!((x === x0 || x === x1) && (y === y0 || y === y1)) || sh.eyes === 'goggles') S.pc.set(x, y, fc); }
        else if (lens >= 0) S.pc.blend(x, y, lens, sh.eyes === 'sunglasses' ? 0.92 : 0.55);
        else S.pc.blend(x, y, 0xd8ecf4, 0.15);
      }
      S.pc.set(x0 + 1, y0 + 1, 0xf0f8ff);
    }
    for (let x = HX(S, -8); x <= HX(S, 8); x++) S.pc.set(x, eyeY - 1, fc); // bridge
  }
  // ---- expression baked into the condition: pain / fear / unconscious
  if (cond.expr === 'pain' || cond.expr === 'fear') {
    for (let x = nx - 2; x <= nx + 2; x++) S.pc.set(x, my, cond.expr === 'fear' ? 0x2a1210 : 0xe8e2d8);
    S.pc.set(nx - 3, my, lipD); S.pc.set(nx + 3, my, lipD);
    if (cond.expr === 'pain') for (const k of [-1, 1]) S.pc.blend(Math.round(S.X(k * 9)), HY(S, 0.11), R[2], 0.6);
  }
}

// ------------------------------------------------------------------ hair
function paintHair(S: Surf, A: Appearance, wet: number) {
  const c = wet > 1 ? scaleHex(A.hair, 0.78) : A.hair;
  const HR = makeRamp(c, 7, { hueShift: 0.035, spread: 0.6 });
  const st = A.hairStyle;
  const strand = (x: number) => ph(x, 0, 41) * 1.2 + (x % 3 === 0 ? -0.6 : 0);
  S.fill(HR, (x, y) => {
    const yy = S.yAt(y), a = Math.abs(S.deg(x));
    let v = 3.1 + strand(x) * (st === 'buzz' ? 0.2 : 0.6) + (S.fbm(x, y * 0.3, 3, 2, 7) - 0.5) * 1.2;
    // sheen band on the crown
    v += 0.9 * Math.exp(-((yy - 0.165) ** 2) / 0.0012) * (st === 'curly' ? 0.4 : 1);
    // roots / underside darker
    v -= 1.4 * Math.max(0, (0.02 - yy) / 0.12) * (a > 100 ? 0.6 : 1);
    if (st === 'curly') v += (ph(x >> 1, y >> 1, 9) - 0.5) * 1.8;
    if (st === 'buzz') v += (ph(x, y, 9) - 0.5) * 0.8;
    return v;
  });
  // parting
  if (st === 'long' || st === 'bob' || st === 'short') { const px = Math.round(S.X(st === 'short' ? 28 : -14)); for (let y = Math.round(S.Y(0.21)); y < S.Y(0.16); y++) S.pc.blend(px, y, HR[0], 0.55); }
  // ends: lighter, ragged tips at the bottom of long hair
  if (st === 'ponytail') { const ty = Math.round(S.Y(-0.05)); for (let x = 0; x < S.w; x++) { S.pc.set(x, ty, 0x2a2a30); S.pc.set(x, ty + 1, 0x3a3a44); } }
}

// ------------------------------------------------------------------ condition overlays
const BLOOD = [0x3a0606, 0x5a0a0a, 0x7a1210, 0x96201a];
function bloodSplat(S: Surf, cx: number, cy: number, r: number, seed: number, drip = true) {
  const rr = Math.ceil(r + 2);
  for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 1.15) / r;
    const n = ph(x, y, seed) * 0.55 + ph(x >> 1, y >> 1, seed + 1) * 0.45;
    if (d < 0.55 + n * 0.6) {
      const k = d < 0.4 ? 1 : d < 0.75 ? 2 : 3;
      S.pc.blend(x, y, BLOOD[k], d < 0.6 ? 0.92 : 0.7);
    }
  }
  if (drip) {
    const rng = new Rng(seed);
    for (let i = 0; i < Math.max(1, Math.round(r * 0.7)); i++) {
      const x = Math.round(cx + (rng.next() - 0.5) * r * 1.4), L = Math.round(r * (0.8 + rng.next() * 1.6));
      for (let t = 0; t < L; t++) S.pc.blend(x, Math.round(cy + r * 0.4) + t, BLOOD[t < L * 0.6 ? 1 : 2], 0.85 * (1 - t / (L + 2)));
    }
  }
}
function bandageWrap(S: Surf, y0: number, y1: number, soak: number, seed: number) {
  const W = [0xd8d4c8, 0xeae6da, 0xc4beb0, 0xf4f0e6];
  for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = 0; x < S.w; x++) {
    const diag = (x + y * 2) % 6 === 0;
    const c = y === Math.round(y0) || y === Math.round(y1) ? W[2] : diag ? W[2] : (ph(x, y, seed) < 0.15 ? W[3] : W[(x >> 1) % 2]);
    S.pc.set(x, y, c);
  }
  if (soak > 0) {
    const cx = S.w * (0.4 + ph(seed, 1, 1) * 0.2), cy = (y0 + y1) / 2;
    const r = 1.2 + soak * (y1 - y0) * 0.45;
    for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.3) / r;
      if (d < 0.7 + ph(x, y, seed) * 0.4) S.pc.blend(x, y, d < 0.5 ? 0x7a1612 : 0xa8463a, 0.8);
    }
  }
}
function grime(S: Surf, amt: number, lowBias: number, seed: number) {
  const D = [0x4a3e2e, 0x5a4a36, 0x3a3226];
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const low = lowBias > 0 ? (y / S.h) * lowBias : 0;
    const n = S.fbm(x, y, 4, 2, seed) * 0.7 + ph(x, y, seed + 3) * 0.3;
    if (n + low * 0.3 > 1.02 - amt * 0.35) S.pc.blend(x, y, D[(x + y) % 3], 0.35 + amt * 0.12);
  }
}
function wetten(S: Surf, amt: number) {
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const i = (y * S.w + x) * 4, d = S.pc.data;
    const f = 1 - 0.12 * amt;
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f * 1.02;
    if (amt > 1 && ph(x, y, 77) < 0.03 * amt) S.pc.blend(x, y, 0xe8f0f4, 0.35);
  }
}
function corrupt(S: Surf, amt: number, seed: number) {
  const C = [0xff00ff, 0x00ffff, 0x101010, 0x40ff80];
  const n = Math.round(amt * 4);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(ph(i, seed, 1) * S.w), y = Math.floor(ph(i, seed, 2) * S.h), w = 2 + Math.floor(ph(i, seed, 3) * 4), h = 1 + Math.floor(ph(i, seed, 4) * 2);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (ph(xx, yy, seed) < 0.8) S.pc.set(xx, yy, C[(i + xx) % 4]);
  }
}

// part -> where its wounds land: region, side, y (reference), angle
const PART_SPOT: Record<string, { reg: 'TORSO' | 'ARM' | 'LEG' | 'HEAD' | 'NECK' | 'HAND' | 'FOOT'; side?: 'L' | 'R'; y: [number, number] }> = {
  head: { reg: 'HEAD', y: [0.06, 0.18] }, neck: { reg: 'NECK', y: [1.47, 1.55] },
  torso_u: { reg: 'TORSO', y: [1.18, 1.4] }, torso_l: { reg: 'TORSO', y: [0.98, 1.16] }, groin: { reg: 'TORSO', y: [0.84, 0.95] },
  uarm_l: { reg: 'ARM', side: 'L', y: [-0.24, -0.04] }, uarm_r: { reg: 'ARM', side: 'R', y: [-0.24, -0.04] },
  farm_l: { reg: 'ARM', side: 'L', y: [-0.48, -0.32] }, farm_r: { reg: 'ARM', side: 'R', y: [-0.48, -0.32] },
  hand_l: { reg: 'HAND', side: 'L', y: [0, 1] }, hand_r: { reg: 'HAND', side: 'R', y: [0, 1] },
  thigh_l: { reg: 'LEG', side: 'L', y: [-0.36, -0.08] }, thigh_r: { reg: 'LEG', side: 'R', y: [-0.36, -0.08] },
  shin_l: { reg: 'LEG', side: 'L', y: [-0.76, -0.5] }, shin_r: { reg: 'LEG', side: 'R', y: [-0.76, -0.5] },
  foot_l: { reg: 'FOOT', side: 'L', y: [0, 1] }, foot_r: { reg: 'FOOT', side: 'R', y: [0, 1] },
};

function applyCondition(S: Surf, regKind: string, side: string, cond: RigCondition, seed: number) {
  for (const [part, spot] of Object.entries(PART_SPOT)) {
    if (spot.reg !== regKind || (spot.side && spot.side !== side)) continue;
    const blood = cond.blood?.[part] ?? 0, band = cond.bandage?.[part] ?? 0;
    const ps = seed + hashStr(part);
    const isUV = spot.reg === 'HAND' || spot.reg === 'FOOT';
    const yr = isUV ? [S.h * 0.15, S.h * 0.85] : [S.Y(spot.y[1]), S.Y(spot.y[0])];
    if (blood > 0) {
      const n = blood >= 3 ? 3 : blood >= 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const cx = (ph(i, ps, 1) * 0.5 + 0.25 + (spot.reg === 'TORSO' ? (ph(i, ps, 9) < 0.5 ? 0 : 0.5) : 0)) * S.w;
        const cy = yr[0] + ph(i, ps, 2) * (yr[1] - yr[0]);
        bloodSplat(S, cx % S.w, cy, 1.5 + blood * 1.1 + ph(i, ps, 3) * 1.5, ps + i * 13, spot.reg !== 'HEAD' || i === 0);
      }
    }
    if (band > 0) {
      if (spot.reg === 'HEAD') {
        bandageWrap(S, S.Y(0.15), S.Y(0.125), band >= 2 ? 0.7 : 0, ps);
      } else {
        const mid = (yr[0] + yr[1]) / 2, half = Math.max(2, (yr[1] - yr[0]) * 0.32);
        bandageWrap(S, mid - half, mid + half, band >= 2 ? 0.8 : band >= 1.5 ? 0.4 : 0, ps);
      }
    }
  }
}

// ------------------------------------------------------------------ page bake
export interface BakeInput { app: Appearance; outfit: Outfit; shape: OutfitShape; cond: RigCondition; seed: number }
/** per-rig cache of the painted page before condition overlays (blood, bandages, wet...) */
export interface BakeCache { key: string; base: { key: RegKey; range: number[]; side: number; seed: number; data: Uint8ClampedArray }[] }

/** Paint the whole page into `out` (RGBA, PAGE x PAGE). With a cache, condition-only changes skip the base paint. */
export function bakePage(inp: BakeInput, out: Uint8Array, cache?: BakeCache) {
  const { outfit: o, cond } = inp;
  const pale = cond.pale ?? 0, wet = cond.wet ?? 0, dirt = cond.dirt ?? 0;
  const { cond: _c, ...looks } = o;
  void _c;
  const baseKey = JSON.stringify([inp.app, looks, inp.shape, pale, wet > 1 ? 1 : 0, cond.expr || '', inp.seed]);
  let surfs: Surf[];
  if (cache && cache.key === baseKey) {
    surfs = cache.base.map((b) => { const S = new Surf(b.key, b.range, b.side, b.seed); S.pc.data.set(b.data); return S; });
  } else {
    surfs = paintBase(inp);
    if (cache) { cache.key = baseKey; cache.base = surfs.map((S) => ({ key: S.key, range: S.range, side: S.side, seed: S.seed, data: new Uint8ClampedArray(S.pc.data) })); }
  }
  paintCondition(surfs, o, cond, inp.seed, dirt, wet);
  blitPage(surfs, out);
}

function paintBase(inp: BakeInput): Surf[] {
  const { app, outfit: o, shape: sh, cond } = inp;
  const fem = app.bodyShape ?? 0.3;
  const pale = cond.pale ?? 0, wet = cond.wet ?? 0, dirt = cond.dirt ?? 0;
  const K: Skin = { R: skinRamp(app.skin, pale), base: app.skin, app, fem, seed: inp.seed, pale, dirt, wet };
  const surfs: Surf[] = [];
  const mk = (key: RegKey, range: number[], side = 0) => { const S = new Surf(key, range, side, inp.seed + hashStr(key)); surfs.push(S); return S; };
  const P = (lp: LookPart | undefined, outer = false): Paint | null => lp ? {
    lp, color: lp.color, outer, sh, seed: inp.seed + hashStr(lp.tex + (lp.item || '')),
    R: makeRamp(scaleHex(lp.color, 0.86), 8, { hueShift: 0.035, spread: 0.58 }),
    F: makeRamp(scaleHex(lp.color, 0.86), 15, { hueShift: 0.035, spread: 0.58 }),
  } : null;
  const top = P(o.torso), outerP = P(o.torsoOuter, true), legs = P(o.legs), feet = P(o.feet), hands = P(o.hands), headP = P(o.head), faceP = P(o.face), eyesP = P(o.eyes), backP = P(o.back);
  const G = (p: Paint | null) => (p ? garment(p.lp.tex) : null);
  const call = (p: Paint | null, fn: string, S: Surf) => {
    if (!p) return;
    const g = G(p);
    const f = g && (g as any)[fn];
    if (f) f(S, p); else if (!g) paintFallback(S, p, fn);
  };

  // ---- head + neck
  const head = mk('HEAD', VMAP.HEAD);
  paintHead(head, K, o, sh, cond);
  const neck = mk('NECK', VMAP.NECK);
  neck.light = (x, y) => -0.5 * Math.max(0, (neck.yAt(y) - 1.55) / 0.05) * (Math.cos((neck.deg(x) * Math.PI) / 180) > 0 ? 1 : 0.3) - 0.2;
  paintSkinBody(neck, K);
  // ---- hair
  const hair = mk('HAIR', VMAP.HAIR);
  paintHair(hair, app, wet);
  // ---- torso
  const torso = mk('TORSO', VMAP.TORSO);
  torsoLight(torso, fem);
  paintSkinBody(torso, K);
  torsoSkinDetail(torso, K);
  call(legs, 'pelvis', torso);
  call(top, 'torso', torso);
  call(outerP, 'torso', torso);
  // ---- arms
  for (const side of ['L', 'R'] as const) {
    const S = mk(('ARM_' + side) as RegKey, VMAP.ARM, side === 'L' ? 1 : -1);
    limbLight(S, 'arm');
    paintSkinBody(S, K);
    armSkinDetail(S, K);
    call(top, 'arm', S);
    call(outerP, 'arm', S);
    call(hands, 'arm', S);
    const H = mk(('HAND_' + side) as RegKey, [0, 1], side === 'L' ? 1 : -1);
    H.light = (x, y) => (y > H.h * 0.5 ? -0.1 : -0.3) - 0.4 * Math.max(0, -Math.sin(((H.deg(x)) * Math.PI) / 180));
    paintSkinBody(H, K);
    handSkinDetail(H, K);
    call(hands, 'hand', H);
  }
  // ---- legs & feet
  for (const side of ['L', 'R'] as const) {
    const S = mk(('LEG_' + side) as RegKey, VMAP.LEG, side === 'L' ? 1 : -1);
    limbLight(S, 'leg');
    paintSkinBody(S, K);
    call(feet, 'leg', S);
    call(legs, 'leg', S);
    const F = mk(('FOOT_' + side) as RegKey, [0, 1], side === 'L' ? 1 : -1);
    if (feet) call(feet, 'foot', F);
    else { F.light = (x, y) => (Math.abs(F.deg(x)) > 100 ? -0.8 : 0) - (y > F.h * 0.7 ? 0 : 0); paintSkinBody(F, K); footSkinDetail(F, K); }
  }
  // ---- skirt / tails / hood, hats, masks, collars, gear, pack, lids
  const skirt = mk('SKIRT', VMAP.SKIRT);
  if (sh.tails && outerP) call(outerP, 'skirt', skirt); else if (legs) call(legs, 'skirt', skirt);
  const collar = mk('COLLAR', [0, 1]);
  const collarP = sh.collarFrom === 'outer' ? outerP : top;
  if (collarP) call(collarP, sh.collar === 'hood' ? 'hood' : 'collar', collar);
  const hat = mk('HAT', [0, 1]);
  if (headP) call(headP, 'hat', hat);
  const mask = mk('MASK', [0, 1]);
  if (faceP) call(faceP, 'mask', mask);
  const gear = mk('GEAR', [0, 1]);
  paintGear(gear, eyesP?.color ?? 0x202020);
  const pack = mk('PACK', [0, 1]);
  if (backP) call(backP, 'pack', pack);
  const lids = mk('LIDS', [0, 1]);
  lids.fill(K.R, (x, y) => SKIN_MID - 0.2 - (y / lids.h) * 0.6);
  for (let x = 0; x < lids.w; x++) { lids.pc.set(x, lids.h - 1, mixHex(0x1c1410, app.hair, 0.2)); lids.pc.blend(x, 1, K.R[3], 0.5); }

  return surfs;
}

function paintCondition(surfs: Surf[], o: Outfit, cond: RigCondition, seed: number, dirt: number, wet: number) {
  for (const S of surfs) {
    const kind = S.key.startsWith('ARM') ? 'ARM' : S.key.startsWith('LEG') ? 'LEG' : S.key.startsWith('HAND') ? 'HAND' : S.key.startsWith('FOOT') ? 'FOOT' : S.key;
    const side = S.key.endsWith('_L') ? 'L' : S.key.endsWith('_R') ? 'R' : '';
    if (kind !== 'HEAD' && kind !== 'NECK') applyCondition(S, kind, side, cond, seed);
    else applyCondition(S, kind, '', cond, seed);
    // garment blood (Item.bloody)
    const gb = kind === 'TORSO' || kind === 'ARM' ? Math.max(o.torso?.blood ?? 0, o.torsoOuter?.blood ?? 0) : kind === 'LEG' ? (o.legs?.blood ?? 0) : kind === 'FOOT' ? (o.feet?.blood ?? 0) : kind === 'HAND' ? (o.hands?.blood ?? 0) : 0;
    if (gb > 0.05) {
      const n = Math.round(1 + gb * (kind === 'TORSO' ? 6 : 3));
      for (let i = 0; i < n; i++) bloodSplat(S, ph(i, S.seed, 31) * S.w, ph(i, S.seed, 32) * S.h, 1 + ph(i, S.seed, 33) * 2.5 * gb + gb, S.seed + i, ph(i, S.seed, 34) < 0.5);
    }
    if (dirt > 0 && kind !== 'HAIR' && kind !== 'LIDS' && kind !== 'GEAR') grime(S, dirt, kind === 'LEG' || kind === 'FOOT' ? 1.5 : 0.4, S.seed + 5);
    if (wet > 0 && kind !== 'GEAR') wetten(S, wet);
    if ((cond.corrupt ?? 0) > 0) corrupt(S, cond.corrupt, S.seed + Math.floor((cond.corrupt ?? 0) * 7));
  }

}

/** blit with wrap padding (u wraps, v clamps) so mip levels never bleed */
function blitPage(surfs: Surf[], out: Uint8Array) {
  out.fill(0);
  for (const S of surfs) {
    const r = REG[S.key];
    for (let y = -PAD; y < r.h + PAD; y++) {
      const sy = Math.min(r.h - 1, Math.max(0, y));
      for (let x = -PAD; x < r.w + PAD; x++) {
        const sx = ((x % r.w) + r.w) % r.w;
        const si = (sy * r.w + sx) * 4, di = ((r.y + y) * PAGE + r.x + x) * 4;
        out[di] = S.pc.data[si]; out[di + 1] = S.pc.data[si + 1]; out[di + 2] = S.pc.data[si + 2]; out[di + 3] = 255;
      }
    }
  }
}

// ------------------------------------------------------------------ anatomy details on bare skin
function torsoSkinDetail(S: Surf, K: Skin) {
  const R = K.R;
  // clavicles
  for (const k of [-1, 1]) for (let d = 6; d < 40; d += 3) { const x = Math.round(S.X(k * d)); const y = Math.round(S.Y(1.448 - d * 0.0002)); S.pc.blend(x, y, R[6], 0.35); S.pc.blend(x, y + 1, R[3], 0.3); }
  // sternum notch + navel
  S.pc.blend(Math.round(S.X(0)), Math.round(S.Y(1.44)), R[3], 0.5);
  S.pc.set(Math.round(S.X(0) - 0.5), Math.round(S.Y(1.035)), R[2]);
  // spine line and shoulder blades
  for (let y = Math.round(S.Y(1.42)); y < S.Y(0.98); y += 2) S.pc.blend(0, y, R[3], 0.35);
  for (const k of [-1, 1]) S.pc.ditherBlob(S.X(k * 150), S.Y(1.29), 2.5, 3, R[6], 0.35);
  // nipples / chest for masculine, bust shading for feminine
  if (K.fem < 0.5) for (const k of [-1, 1]) S.pc.blend(Math.round(S.X(k * 25)), Math.round(S.Y(1.26)), mixHex(R[3], 0xa05048, 0.4), 0.6);
}
function armSkinDetail(S: Surf, K: Skin) {
  const R = K.R;
  // elbow wrinkles on the back, knuckly wrist bone
  for (let i = -1; i <= 1; i++) S.pc.blend(Math.round(S.X(178 + i * 6)), Math.round(S.Y(-0.29)), R[3], 0.45);
  S.pc.blend(Math.round(S.X(120)), Math.round(S.Y(-0.52)), R[6], 0.5);
}
function handSkinDetail(S: Surf, K: Skin) {
  const R = K.R;
  // knuckles (outer side = back of the hand), fingernails at finger tips
  for (let x = 0; x < S.w; x++) {
    const a = S.deg(x);
    if (a > 30 && a < 150) { S.pc.blend(x, Math.round(S.h * 0.46), R[3], 0.4); S.pc.blend(x, Math.round(S.h * 0.25), R[3], 0.3); }
    if (a > 70 && a < 130) for (let y = S.h - 3; y < S.h; y++) S.pc.set(x, y, mixHex(R[7], 0xf0d8d0, 0.4));
    if (a < -40 && a > -150) S.pc.blend(x, Math.round(S.h * 0.66 + ((x * 3) % 4)), R[3], 0.3); // palm creases
  }
}
function footSkinDetail(S: Surf, K: Skin) {
  for (let x = 0; x < S.w; x++) if (Math.abs(S.deg(x)) < 60) for (let y = 0; y < 3; y++) if (x % 3 !== 0) S.pc.blend(x, Math.round(S.h * 0.3) - y, K.R[6], 0.4);
}

function paintGear(S: Surf, frame: number) {
  // u 0..0.5: glasses temples / goggles strap ; u 0.5..1: splint wood
  const FR = makeRamp(frame, 4, { spread: 0.5 });
  const WD = makeRamp(0xa07a4a, 4, { spread: 0.5 });
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    if (x < S.w / 2) S.pc.set(x, y, FR[(y + (x & 1)) % 3]);
    else S.pc.set(x, y, WD[1 + ((x + y * 3) % 5 === 0 ? 0 : 1) + (y % 4 === 0 ? 1 : 0)]);
  }
}

// ------------------------------------------------------------------ texture object
export function makePageTexture(): { tex: THREE.DataTexture; data: Uint8Array } {
  const data = new Uint8Array(PAGE * PAGE * 4);
  const tex = new THREE.DataTexture(data, PAGE, PAGE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { tex, data };
}

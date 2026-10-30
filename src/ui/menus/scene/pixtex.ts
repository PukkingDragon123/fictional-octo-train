// Hand-pixelled surface textures for the subject room, painted once at load
// on small canvases (hue-shifted ramps, ordered dither, 1px highlights and
// shadows, grout, seams, stitching, chips, rust runs, grime) and sampled with
// nearest filtering, no mipmaps. Neutral ones (metal, paint) are tinted per
// part by vertex colour; the rest carry their own colour. Also the shared
// faceted materials (flat shading, real roughness) and stencilled plates.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer } from '../../../gfx/pixel';
import { Rng, tileFbm } from '../../../core/rng';

export type FKey = 'tile' | 'concrete' | 'floor' | 'metal' | 'paint' | 'rust' | 'wood' | 'leather' | 'brass' | 'rubber' | 'bakelite' | 'hazard' | 'copper' | 'sponge' | 'chrome' | 'lamp' | 'glass' | 'screen' | 'enamel';
export type FMats = Record<FKey, THREE.Material>;

/** metres per texture repeat */
export const REP: Partial<Record<FKey, number>> = {
  tile: 1.2, concrete: 1.6, floor: 1.6, metal: 0.4, paint: 0.4, rust: 0.4, wood: 0.32, leather: 0.2, brass: 0.08,
  rubber: 0.16, bakelite: 0.12, hazard: 0.2, copper: 0.06, sponge: 0.1, chrome: 0.24, enamel: 0.4,
};

function toTex(pc: PixelCanvas): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = pc.w; cv.height = pc.h;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const pick = (ramp: number[], v: number, x: number, y: number) => {
  const f = Math.max(0, Math.min(0.999, v)) * (ramp.length - 1);
  let i = Math.floor(f);
  if (f - i > bayer(x, y)) i++;
  return ramp[Math.min(ramp.length - 1, i)];
};
/** a crack: a random walk of dark pixels with a lit lip */
function crack(pc: PixelCanvas, rng: Rng, x: number, y: number, len: number, dark: number, lip: number) {
  let dx = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < len; i++) {
    pc.set(x, y, dark);
    pc.blend(x + 1, y + 1, lip, 0.5);
    if (rng.chance(0.55)) y++;
    if (rng.chance(0.6)) x += dx;
    if (rng.chance(0.12)) dx = -dx;
    if (rng.chance(0.06) && len - i > 4) crack(pc, rng, x, y, Math.floor((len - i) / 2), dark, lip);
  }
}

// ------------------------------------------------------------------ painters
function tilePix(): PixelCanvas {
  const N = 128, T = 16, pc = new PixelCanvas(N, N), rng = new Rng('tiles4');
  const ramp = makeRamp(0x93a48c, 7, { spread: 0.62, hueShift: 0.05 });
  const grout = [0x1e1d18, 0x2b2a22, 0x37352b];
  for (let ty = 0; ty < N / T; ty++) for (let tx = 0; tx < N / T; tx++) {
    const off = rng.float(-0.09, 0.07), crazed = rng.chance(0.12), dirty = rng.float(0, 1);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const X = tx * T + x, Y = ty * T + y;
      if (x === T - 1 || y === T - 1) { pc.set(X, Y, grout[(X * 7 + Y * 3) % 3 === 0 ? 2 : (X + Y) % 2]); continue; }
      const glaze = tileFbm(X, Y, N, N, 8, 3, 11) * 0.22;
      let v = 0.58 + off + glaze - y * 0.006;
      if (x === 0 || y === 0) v += 0.22;
      if (x === T - 2 || y === T - 2) v -= 0.2;
      pc.set(X, Y, pick(ramp, v, X, Y));
    }
    // the glint in the top corner of the glaze
    if (rng.chance(0.7)) { pc.set(tx * T + 2, ty * T + 2, ramp[6]); pc.set(tx * T + 3, ty * T + 2, ramp[5]); pc.set(tx * T + 2, ty * T + 3, ramp[5]); }
    if (crazed) crack(pc, rng, tx * T + rng.int(2, 12), ty * T + rng.int(1, 6), rng.int(6, 14), ramp[0], ramp[5]);
    if (rng.chance(0.09)) {
      // a chipped corner: the biscuit shows through
      const cx = tx * T + (rng.chance(0.5) ? 0 : T - 5), cy = ty * T + (rng.chance(0.5) ? 0 : T - 5);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4 - j; i++) pc.set(cx + i, cy + j, j === 3 - i ? 0x2a2820 : 0x6a665a);
    }
    if (dirty > 0.75) for (let y = 0; y < T - 1; y++) for (let x = 0; x < T - 1; x++) if ((dirty - 0.75) * 3 > bayer(tx * T + x, ty * T + y) + 0.25) pc.blend(tx * T + x, ty * T + y, 0x5a5238, 0.35);
  }
  pc.grime(0x3e3626, 0.55, 4, 23, 0.6);
  // rust runs from the fixings
  for (let k = 0; k < 7; k++) {
    const x = rng.int(0, N - 1), y0 = rng.int(0, N - 1), len = rng.int(10, 40);
    for (let y = 0; y < len; y++) { const t = 1 - y / len; pc.blend(x, y0 + y, 0x6a3418, 0.55 * t); if (rng.chance(0.3)) pc.blend(x + 1, y0 + y, 0x7a4420, 0.3 * t); }
  }
  return pc;
}

function concretePix(seed = 'conc', base = 0x77746a): PixelCanvas {
  const N = 128, pc = new PixelCanvas(N, N), rng = new Rng(seed);
  const ramp = makeRamp(base, 7, { spread: 0.55, hueShift: 0.03 });
  pc.fillRamp(ramp, (x, y) => 0.36 + tileFbm(x, y, N, N, 4, 3, 5) * 0.22 + tileFbm(x, y, N, N, 16, 2, 9) * 0.16 + tileFbm(x, y, N, N, 64, 1, 13) * 0.1, 0.7);
  // board-form joints
  for (const y of [31, 63, 95, 127]) for (let x = 0; x < N; x++) { pc.shade(x, y, 0.7); pc.blend(x, y + 1, ramp[5], 0.25); }
  // form-tie holes
  for (const [x, y] of [[20, 14], [84, 14], [20, 78], [84, 78]]) {
    pc.rect(x, y, 3, 3, ramp[0]); pc.set(x + 3, y + 1, ramp[5]); pc.set(x + 1, y + 3, ramp[5]); pc.set(x, y, 0x0e0d0b);
    for (let j = 4; j < 4 + rng.int(6, 18); j++) pc.blend(x + 1, y + j, 0x3a3020, 0.35 * (1 - j / 22));
  }
  for (let i = 0; i < 260; i++) { const x = rng.int(0, N - 1), y = rng.int(0, N - 1); pc.set(x, y, ramp[0]); pc.blend(x, y + 1, ramp[5], 0.5); }
  for (let i = 0; i < 3; i++) crack(pc, rng, rng.int(0, N), rng.int(0, N), rng.int(16, 40), ramp[0], ramp[5]);
  for (let i = 0; i < 4; i++) pc.stain(rng.int(0, N), rng.int(0, N), rng.int(6, 16), 0x3a3428, 0x2a2418, i + 3);
  pc.drips(rng, 0x2e2618, 10, 0, 60, 0.3);
  pc.grime(0x221e16, 0.45, 3, 41, 0.62);
  return pc;
}

function floorPix(): PixelCanvas {
  const N = 128, pc = new PixelCanvas(N, N), rng = new Rng('floor');
  const ramp = makeRamp(0x4e4c44, 7, { spread: 0.55, hueShift: 0.03 });
  pc.fillRamp(ramp, (x, y) => 0.32 + tileFbm(x, y, N, N, 4, 4, 15) * 0.4 + tileFbm(x, y, N, N, 32, 1, 19) * 0.1, 0.6);
  // aggregate
  for (let i = 0; i < 160; i++) pc.set(rng.int(0, N - 1), rng.int(0, N - 1), rng.chance(0.5) ? ramp[4] : ramp[2]);
  // saw-cut joints
  for (let i = 0; i < N; i++) { pc.set(i, 0, 0x121110); pc.set(i, 1, ramp[5]); pc.set(0, i, 0x121110); pc.set(1, i, ramp[5]); }
  // wet patches and oil
  for (let i = 0; i < 5; i++) { const cx = rng.int(0, N), cy = rng.int(0, N), r = rng.int(8, 22); pc.ditherBlob(cx, cy, r, r * 0.7, scaleHex(ramp[1], 0.75), 0.9); }
  for (let i = 0; i < 3; i++) pc.stain(rng.int(0, N), rng.int(0, N), rng.int(5, 12), 0x1a1a1e, 0x101012, i + 31);
  // scuffs (rubber heels, dragged things)
  for (let i = 0; i < 26; i++) { const x = rng.int(0, N), y = rng.int(0, N), l = rng.int(3, 9); for (let k = 0; k < l; k++) pc.blend(x + k, y + (k >> 2), rng.chance(0.5) ? 0x18171a : ramp[5], 0.45); }
  pc.grime(0x1a1810, 0.5, 4, 7, 0.6);
  return pc;
}

function metalPix(seed = 'metal'): PixelCanvas {
  const N = 64, pc = new PixelCanvas(N, N), rng = new Rng(seed);
  const ramp = makeRamp(0x9a9a98, 6, { spread: 0.5, hueShift: 0.02 });
  pc.fillRamp(ramp, (x, y) => 0.5 + tileFbm(x, y, N, N, 4, 3, 3) * 0.25 - 0.12, 0.8);
  for (let i = 0; i < 90; i++) { const x = rng.int(0, N), y = rng.int(0, N), l = rng.int(4, 18), c = rng.chance(0.5) ? ramp[4] : ramp[1]; for (let k = 0; k < l; k++) pc.blend(x + k, y, c, 0.5); }
  for (let i = 0; i < 9; i++) { const x = rng.int(0, N), y = rng.int(0, N), l = rng.int(4, 12); for (let k = 0; k < l; k++) { pc.set(x + k, y + (k >> 1), ramp[5]); pc.blend(x + k, y + (k >> 1) + 1, ramp[0], 0.6); } }
  for (let i = 0; i < 14; i++) { const x = rng.int(0, N), y = rng.int(0, N); pc.set(x, y, 0x5a3a22); if (rng.chance(0.5)) pc.set(x + 1, y, 0x6a4428); pc.blend(x, y + 1, 0x4a3020, 0.5); }
  pc.grime(0x2a2826, 0.6, 2, 13, 0.55);
  return pc;
}

function paintPix(): PixelCanvas {
  const N = 64, pc = new PixelCanvas(N, N), rng = new Rng('paint');
  const ramp = makeRamp(0xc8c8c0, 6, { spread: 0.35, hueShift: 0.0 });
  pc.fillRamp(ramp, (x, y) => 0.55 + tileFbm(x, y, N, N, 4, 3, 21) * 0.2 - 0.1, 0.7);
  // chips through to the primer and rust, with a lit paint edge above and a dark lip below
  for (let i = 0; i < 12; i++) {
    const cx = rng.int(0, N), cy = rng.int(0, N), r = rng.float(0.8, 2.6);
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y * 1.3) + (rng.next() - 0.5) * 1.5;
      if (d < r) pc.set(cx + x, cy + y, d < r - 1.5 ? 0x4a2e1c : 0x6a5040);
      else if (d < r + 1 && y < 0) pc.set(cx + x, cy + y, ramp[5]);
      else if (d < r + 1) pc.blend(cx + x, cy + y, ramp[0], 0.6);
    }
  }
  for (let i = 0; i < 12; i++) { const x = rng.int(0, N), y = rng.int(0, N), l = rng.int(3, 10); for (let k = 0; k < l; k++) pc.set(x + k, y - (k >> 2), ramp[1]); }
  pc.drips(rng, 0x4a4030, 8, 0, 40, 0.25);
  pc.grime(0x3a3428, 0.45, 3, 29, 0.6);
  return pc;
}

function rustPix(): PixelCanvas {
  const N = 64, pc = new PixelCanvas(N, N), rng = new Rng('rust');
  const ramp = makeRamp(0x7a4426, 7, { spread: 0.6, hueShift: 0.05 });
  pc.fillRamp(ramp, (x, y) => 0.35 + tileFbm(x, y, N, N, 4, 4, 33) * 0.5 + (rng.next() - 0.5) * 0.15, 1);
  for (let i = 0; i < 120; i++) { const x = rng.int(0, N), y = rng.int(0, N); pc.set(x, y, rng.chance(0.4) ? ramp[6] : ramp[0]); }
  for (let i = 0; i < 6; i++) pc.stain(rng.int(0, N), rng.int(0, N), rng.int(3, 8), 0x2a1810, 0x1a0e08, i + 5);
  return pc;
}

function woodPix(): PixelCanvas {
  const N = 64, pc = new PixelCanvas(N, N), rng = new Rng('oak');
  const ramp = makeRamp(0x5e4430, 7, { spread: 0.6, hueShift: 0.04 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const warp = tileFbm(x, y, N, N, 2, 3, 7) * 9 + Math.sin((y / N) * Math.PI * 2) * 1.5;
    const g = ((x + warp) % 6 + 6) % 6;
    let v = 0.55 + tileFbm(x, y, N, N, 4, 2, 17) * 0.2 - (g < 1 ? 0.32 : g < 2 ? 0.12 : 0) + (g > 4.5 ? 0.08 : 0);
    v -= tileFbm(x, y, N, N, 8, 1, 3) * 0.08;
    pc.set(x, y, pick(ramp, v, x, y));
  }
  // varnish catching the light along the grain
  for (let i = 0; i < 40; i++) { const x = rng.int(0, N), y = rng.int(0, N), l = rng.int(2, 7); for (let k = 0; k < l; k++) pc.blend(x, y + k, ramp[6], 0.55); }
  // knots
  for (let i = 0; i < 2; i++) {
    const cx = rng.int(8, 56), cy = rng.int(8, 56);
    for (let y = -6; y <= 6; y++) for (let x = -4; x <= 4; x++) { const d = Math.hypot(x * 1.4, y * 0.8); if (d < 4.5) pc.set(cx + x, cy + y, d < 1.6 ? ramp[0] : Math.floor(d) % 2 ? ramp[1] : ramp[3]); }
  }
  // the plank seam: a black joint with a lit edge
  for (let y = 0; y < N; y++) { pc.set(0, y, 0x120a06); pc.set(1, y, ramp[5]); pc.blend(N - 1, y, ramp[0], 0.7); }
  // scratches and worn spots
  for (let i = 0; i < 10; i++) { const x = rng.int(0, N), y = rng.int(0, N), l = rng.int(3, 8); for (let k = 0; k < l; k++) pc.set(x + k, y + (k >> 1), ramp[5]); }
  pc.grime(0x1e140c, 0.6, 3, 51, 0.55);
  return pc;
}

function leatherPix(): PixelCanvas {
  const N = 64, pc = new PixelCanvas(N, N), rng = new Rng('leather');
  const ramp = makeRamp(0x50321e, 7, { spread: 0.55, hueShift: 0.04 });
  pc.fillRamp(ramp, (x, y) => 0.45 + tileFbm(x, y, N, N, 16, 2, 61) * 0.25 + tileFbm(x, y, N, N, 4, 2, 63) * 0.15, 1);
  // burnished edges
  for (let x = 0; x < N; x++) { pc.set(x, 0, ramp[0]); pc.set(x, 1, ramp[1]); pc.set(x, N - 1, ramp[0]); pc.set(x, N - 2, ramp[1]); pc.set(x, 2, ramp[5]); }
  // saddle stitching near both edges
  for (const y of [5, N - 7]) for (let x = 0; x < N; x++) {
    const m = x % 4;
    if (m < 2) { pc.set(x, y, m ? 0xb8a070 : 0xd8c090); pc.set(x, y + 1, ramp[0]); } else pc.set(x, y, ramp[1]);
  }
  // creases: dark folds with a highlight on the ridge
  for (let i = 0; i < 18; i++) {
    const x = rng.int(0, N), y = rng.int(9, N - 10), l = rng.int(3, 9), dy = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < l; k++) { const yy = y + (k % 3 === 0 ? dy : 0) * Math.floor(k / 3); pc.set(x + k, yy, ramp[0]); pc.set(x + k, yy - 1, ramp[5]); }
  }
  for (let i = 0; i < 6; i++) pc.ditherBlob(rng.int(0, N), rng.int(10, N - 10), rng.int(3, 7), rng.int(2, 4), ramp[4], 0.7);
  pc.grime(0x1a0e08, 0.5, 3, 67, 0.55);
  return pc;
}

function smallPix(seed: string, base: number, o: { spread?: number; streak?: 'h' | 'v'; spots?: number; spot?: number; hi?: number } = {}): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N), rng = new Rng(seed);
  const ramp = makeRamp(base, 6, { spread: o.spread ?? 0.5, hueShift: 0.04 });
  pc.fillRamp(ramp, (x, y) => 0.45 + tileFbm(x, y, N, N, 4, 3, seed.length) * 0.35 + (o.streak === 'v' ? Math.sin(x * 0.9) * 0.12 : o.streak === 'h' ? Math.sin(y * 0.9) * 0.12 : 0), 1);
  for (let i = 0; i < (o.spots ?? 20); i++) { const x = rng.int(0, N), y = rng.int(0, N); pc.set(x, y, o.spot ?? ramp[0]); }
  for (let i = 0; i < (o.hi ?? 8); i++) { const x = rng.int(0, N), y = rng.int(0, N); pc.set(x, y, ramp[5]); pc.set(x + 1, y, ramp[4]); }
  return pc;
}

function hazardPix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N), rng = new Rng('hazard');
  const Y = makeRamp(0xd8a41e, 5, { spread: 0.45 }), K = [0x0e0d0b, 0x1c1a16, 0x2a2720];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const s = ((x + y) % N + N) % N;
    const yel = s < N / 2;
    const edge = s === 0 || s === N / 2;
    pc.set(x, y, edge ? (yel ? Y[1] : K[2]) : yel ? pick(Y, 0.55 + tileFbm(x, y, N, N, 4, 2, 3) * 0.3, x, y) : K[(x * 3 + y) % 7 === 0 ? 1 : 0]);
  }
  for (let i = 0; i < 14; i++) { const x = rng.int(0, N), y = rng.int(0, N), r = rng.int(1, 3); for (let j = 0; j < r; j++) for (let k = 0; k < r + 1; k++) pc.set(x + k, y + j, j === 0 ? 0x8a8a84 : 0x4a4a46); }
  pc.grime(0x2a2418, 0.7, 2, 5, 0.5);
  return pc;
}

function copperPix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N);
  const ramp = makeRamp(0xb06a34, 6, { spread: 0.55 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = y % 3; pc.set(x, y, r === 0 ? ramp[5] : r === 1 ? ramp[3] : ramp[1]); }
  for (let x = 0; x < N; x += 7) for (let y = 0; y < N; y++) pc.blend(x, y, 0x3a5a3a, 0.25);
  return pc;
}

function chromePix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N), rng = new Rng('chrome');
  const ramp = makeRamp(0xb8bcc0, 6, { spread: 0.7, hueShift: 0.02 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const b = ((x + Math.floor(y / 8)) % 16);
    const v = b < 2 ? 0.95 : b < 4 ? 0.7 : b < 9 ? 0.4 : b < 11 ? 0.15 : 0.5;
    pc.set(x, y, pick(ramp, v + (rng.next() - 0.5) * 0.1, x, y));
  }
  return pc;
}

/** a flat stencil / engraved plate with text, crisp (thresholded) in Alagard */
export function plateTex(lines: string[], o: { w?: number; h?: number; bg?: number; ink?: number; rivets?: boolean; size?: number; italic?: boolean } = {}): THREE.CanvasTexture {
  const W = o.w ?? 64, H = o.h ?? 24;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  const bg = o.bg ?? 0xb8ac88, ramp = makeRamp(bg, 5, { spread: 0.4 });
  const rng = new Rng(lines.join('|'));
  pc.fillRamp(ramp, (x, y) => 0.55 + tileFbm(x, y, W, H, 4, 2, 77) * 0.25 - y * 0.004, 0.8);
  pc.bevel(0, 0, W, H, ramp[4], ramp[0]);
  pc.strokeRect(0, 0, W, H, 0x0e0c08);
  if (o.rivets !== false) for (const [x, y] of [[2, 2], [W - 4, 2], [2, H - 4], [W - 4, H - 4]]) { pc.set(x, y, ramp[4]); pc.set(x + 1, y, ramp[1]); pc.set(x, y + 1, ramp[1]); pc.set(x + 1, y + 1, ramp[0]); }
  for (let i = 0; i < W * H * 0.04; i++) pc.set(rng.int(1, W - 2), rng.int(1, H - 2), ramp[1]);
  // the text: rendered at 1x, alpha thresholded so every pixel is solid
  const tc = document.createElement('canvas'); tc.width = W; tc.height = H;
  const ctx = tc.getContext('2d')!;
  const size = o.size ?? Math.floor((H - 4) / lines.length * 0.95);
  ctx.font = `${o.italic ? 'italic ' : ''}600 ${size}px 'Alagard', monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, Math.round(H / 2 + (i - (lines.length - 1) / 2) * size * 0.98) + 0.5, W - 6));
  const id = ctx.getImageData(0, 0, W, H).data;
  const ink = o.ink ?? 0x1a140c;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (id[(y * W + x) * 4 + 3] > 110) { pc.set(x, y, ink); if (id[((y + 1) * W + x) * 4 + 3] <= 110 && y + 1 < H - 1) pc.blend(x, y + 1, ramp[4], 0.6); }
  const t = toTex(pc);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ------------------------------------------------------------------ materials
let cache: { low: boolean; mats: FMats; refs: number } | null = null;
/** the shared faceted materials (shared by the rooms alive on the page; release with disposeFacetMats) */
export function facetMats(low: boolean): FMats {
  if (cache && cache.low === low) { cache.refs++; return cache.mats; }
  const tex: Partial<Record<FKey, THREE.Texture>> = {
    tile: toTex(tilePix()), concrete: toTex(concretePix()), floor: toTex(floorPix()), metal: toTex(metalPix()), paint: toTex(paintPix()),
    rust: toTex(rustPix()), wood: toTex(woodPix()), leather: toTex(leatherPix()),
    brass: toTex(smallPix('brass', 0xb08c3e, { spread: 0.6, spots: 26, spot: 0x4a5028, hi: 10 })),
    rubber: toTex(smallPix('rubber', 0x2a2a2a, { spread: 0.35, streak: 'h', spots: 12, hi: 3 })),
    bakelite: toTex(smallPix('bakelite', 0x3e2414, { spread: 0.55, spots: 14, hi: 6 })),
    hazard: toTex(hazardPix()), copper: toTex(copperPix()),
    sponge: toTex(smallPix('sponge', 0x8a7240, { spread: 0.5, spots: 120, spot: 0x2a2010, hi: 4 })),
    chrome: toTex(chromePix()),
    enamel: toTex(smallPix('enamel', 0xd8d4c4, { spread: 0.25, spots: 10, spot: 0x6a6658, hi: 4 })),
  };
  const PBR: Partial<Record<FKey, [number, number]>> = {
    tile: [0.05, 0.32], concrete: [0, 0.92], floor: [0, 0.6], metal: [0.45, 0.48], paint: [0.1, 0.62], rust: [0.2, 0.85], wood: [0, 0.62], leather: [0, 0.55],
    brass: [0.6, 0.35], rubber: [0, 0.82], bakelite: [0.05, 0.3], hazard: [0.1, 0.6], copper: [0.6, 0.4], sponge: [0, 0.95], chrome: [0.7, 0.2], enamel: [0.05, 0.35],
  };
  const mats = {} as FMats;
  for (const k of Object.keys(tex) as FKey[]) {
    const [metalness, roughness] = PBR[k] ?? [0, 0.7];
    // no specular on the cheap path: metals get a lift so they still read
    const lift = k === 'metal' || k === 'chrome' || k === 'brass' || k === 'copper' ? 1.45 : 1;
    mats[k] = low
      ? new THREE.MeshLambertMaterial({ map: tex[k], vertexColors: true, flatShading: true, color: new THREE.Color(lift, lift, lift) })
      : new THREE.MeshStandardMaterial({ map: tex[k], vertexColors: true, flatShading: true, metalness, roughness });
  }
  mats.lamp = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  mats.glass = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  mats.screen = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  cache = { low, mats, refs: 1 };
  return mats;
}
export function disposeFacetMats() {
  if (!cache || --cache.refs > 0) return;
  for (const m of Object.values(cache.mats)) { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }
  cache = null;
}

export { mixHex, scaleHex };

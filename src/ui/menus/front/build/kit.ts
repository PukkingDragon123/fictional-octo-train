// THE BUILD KIT'S SURFACES (round 26, part B): the finishes and soft things the menu's faceted kit
// (scene/pixtex.ts) did not have, painted once as pixel art in the same way (ramps, dithered noise, wear, nearest
// texels) and lit with the same materials, so a papered wall or a carpeted floor sits in a room like the rest:
//   wallpaper  an aged damask, its motif in a lifted tone, a seam every roll, stains at the skirting
//   stripe     a two-tone regency stripe with a pinline
//   carpet     a cut pile: fine woven noise, flecks, a worn path
//   check      black and cream tiles, crazed glaze, grout
//   parquet    oak blocks in a basket weave, each block its own grain and tone
//   kilim / runner / mat    the rugs (coloured in the texture: patterns, a border, rubber ribs)
// extMats(mats) returns the room kit's materials plus these keys, for FacetBuilder.build.
// printTex(key) is one of the Institute's printed posters (public/art/print, src/gfx/prints.ts) as a texture.
import * as THREE from 'three';
import { PixelCanvas, makeRamp } from '../../../../gfx/pixel';
import { Rng, tileFbm } from '../../../../core/rng';
import { printPixels, whenPrint, type PrintKey } from '../../../../gfx/prints';
import type { FMats, FKey } from '../../scene/pixtex';

export type XKey = 'wallpaper' | 'stripe' | 'carpet' | 'check' | 'parquet' | 'kilim' | 'runner' | 'mat';
export type XMats = Record<FKey | XKey, THREE.Material>;
/** metres per texture repeat for the kit's own surfaces */
export const XREP: Record<XKey, number> = { wallpaper: 0.7, stripe: 0.6, carpet: 0.5, check: 0.6, parquet: 0.8, kilim: 1, runner: 1, mat: 0.5 };

const pick = (ramp: number[], v: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))];

function wallpaperPix(): PixelCanvas {
  const N = 64, pc = new PixelCanvas(N, N), rng = new Rng('damask');
  const ramp = makeRamp(0xd8d0bc, 7, { spread: 0.4, hueShift: 0.02 });
  pc.fillRamp(ramp, (x, y) => 0.46 + tileFbm(x, y, N, N, 4, 3, 5) * 0.16, 0.8);
  // the motif: a mirrored flame-and-leaf drop repeat, a tone up from the ground, with a dark lip under each stroke
  const motif = (cx: number, cy: number) => {
    for (let y = -13; y <= 13; y++) for (let x = 0; x <= 9; x++) {
      const t = (y + 13) / 26, w = Math.sin(t * Math.PI) * (6 + Math.sin(t * 9) * 2.2);
      const leaf = Math.abs(x - Math.sin(t * 6) * 2) < 1.2 + Math.sin(t * Math.PI) * 1.6;
      if (x <= w && (leaf || (x > w - 1.3))) {
        for (const sx of [1, -1]) { pc.set(cx + sx * x, cy + y, x > w - 1.3 ? ramp[5] : ramp[6]); pc.set(cx + sx * x, cy + y + 1, ramp[2]); }
      }
    }
    pc.set(cx, cy - 15, ramp[6]); pc.set(cx, cy + 15, ramp[1]);
  };
  motif(16, 16); motif(48, 48); motif(48, -16); motif(16, 80); motif(-16, 48); motif(80, 48);
  // a roll seam, foxing, a few scuffs
  for (let y = 0; y < N; y++) { pc.blend(0, y, 0x5a4a30, 0.35); pc.blend(1, y, 0xffffff, 0.12); }
  for (let i = 0; i < 9; i++) pc.ditherBlob(rng.int(0, N), rng.int(0, N), rng.float(1.5, 4), rng.float(1.5, 4), 0x8a6a3a, 0.35);
  return pc;
}
function stripePix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N), rng = new Rng('stripe');
  const a = makeRamp(0xe0dccc, 5, { spread: 0.35 }), b = makeRamp(0xb8b4a0, 5, { spread: 0.35 });
  pc.fillRamp(a, () => 0.5, 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = 0.45 + tileFbm(x, y, N, N, 4, 2, 9) * 0.2;
    const band = x < 12 ? b : a;
    pc.set(x, y, pick(band, n));
    if (x === 13 || x === 30) pc.set(x, y, 0x8a7448);
    if (x === 11) pc.set(x, y, band[1]);
  }
  for (let i = 0; i < 4; i++) pc.ditherBlob(rng.int(0, N), rng.int(0, N), 2, 3, 0x7a6a4a, 0.3);
  return pc;
}
function carpetPix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N), rng = new Rng('carpet');
  const ramp = makeRamp(0xc8c4bc, 6, { spread: 0.5 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const weave = ((x + (y >> 1)) % 3 === 0 ? 0.08 : 0) - ((x * 7 + y * 13) % 5 === 0 ? 0.12 : 0);
    pc.set(x, y, pick(ramp, 0.5 + weave + tileFbm(x, y, N, N, 4, 3, 3) * 0.22 + (rng.next() - 0.5) * 0.18));
  }
  for (let i = 0; i < 30; i++) pc.set(rng.int(0, N), rng.int(0, N), ramp[5]);
  return pc;
}
function checkPix(): PixelCanvas {
  const N = 64, T = 16, pc = new PixelCanvas(N, N), rng = new Rng('check');
  const W = makeRamp(0xece6d4, 6, { spread: 0.4 }), K = makeRamp(0x2a2c2a, 6, { spread: 0.5 });
  for (let ty = 0; ty < N / T; ty++) for (let tx = 0; tx < N / T; tx++) {
    const ramp = (tx + ty) % 2 ? K : W, off = rng.float(-0.08, 0.06);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const X = tx * T + x, Y = ty * T + y;
      if (x === T - 1 || y === T - 1) { pc.set(X, Y, 0x3a382e); continue; }
      let v = 0.55 + off + tileFbm(X, Y, N, N, 8, 2, 4) * 0.18;
      if (x === 0 || y === 0) v += 0.2;
      pc.set(X, Y, pick(ramp, v));
    }
  }
  return pc;
}
function parquetPix(): PixelCanvas {
  const N = 64, B = 16, pc = new PixelCanvas(N, N), rng = new Rng('parquet');
  const ramp = makeRamp(0xc8a070, 7, { spread: 0.5, hueShift: 0.03 });
  for (let by = 0; by < N / B; by++) for (let bx = 0; bx < N / B; bx++) {
    const vert = (bx + by) % 2 === 0, tone = rng.float(-0.12, 0.1);
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
      const X = bx * B + x, Y = by * B + y;
      const along = vert ? y : x, across = vert ? x : y;
      // three slats a block, grain running along each
      const slat = Math.floor(across / (B / 3));
      const edge = across % Math.floor(B / 3) === 0 || x === 0 || y === 0;
      const g = Math.sin((along * 0.6 + slat * 7) + Math.sin(across * 1.7 + slat) * 1.6) * 0.08;
      pc.set(X, Y, edge ? ramp[0] : pick(ramp, 0.52 + tone + g + (slat - 1) * 0.04 + tileFbm(X, Y, N, N, 8, 2, 6) * 0.1));
    }
  }
  return pc;
}
function kilimPix(): PixelCanvas {
  const W = 48, H = 64, pc = new PixelCanvas(W, H);
  const red = makeRamp(0x9a3a2a, 5, { spread: 0.4 }), ink = 0x2a1c16, ochre = makeRamp(0xc8962a, 4, { spread: 0.4 }), bone = 0xe0d4b4, teal = 0x3a6a6a;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x, y, W, H, 4, 2, 2) * 0.3 + ((x + y) % 2) * 0.06;
    let c = pick(red, 0.4 + n);
    const bx = Math.min(x, W - 1 - x), by = Math.min(y, H - 1 - y), b = Math.min(bx, by);
    if (b < 2) c = ink; else if (b < 5) c = (bx + by) % 4 < 2 ? pick(ochre, 0.5 + n) : bone; else if (b < 6) c = ink;
    else {
      // stepped diamonds down the field
      const cy = ((y - 6) % 17) - 8, cx = x - W / 2, d = Math.abs(cx) + Math.abs(cy);
      if (d < 9 && d > 6) c = bone; else if (d <= 6 && d > 4) c = teal; else if (d <= 4 && d > 2) c = pick(ochre, 0.6 + n); else if (d <= 2) c = ink;
      if ((Math.abs(cx) === 16 || Math.abs(cx) === 15) && cy % 4 === 0) c = bone;
    }
    pc.set(x, y, c);
  }
  return pc;
}
function runnerPix(): PixelCanvas {
  const W = 32, H = 80, pc = new PixelCanvas(W, H);
  const field = makeRamp(0x3a4a6a, 5, { spread: 0.4 }), gold = makeRamp(0xc8a04a, 4, { spread: 0.35 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x, y, W, H, 4, 2, 8) * 0.3;
    const bx = Math.min(x, W - 1 - x), by = Math.min(y, H - 1 - y), b = Math.min(bx, by);
    let c = pick(field, 0.45 + n);
    if (b < 1) c = 0x1a1a22; else if (b < 4) c = pick(gold, 0.45 + n); else if (b === 4) c = 0x1a1a22;
    else if ((x + y * 2) % 10 === 0 && b > 6) c = pick(gold, 0.6);
    // the worn path down the middle
    if (b > 5 && Math.abs(x - W / 2) < 6) c = pick(field, 0.3 + n * 0.6);
    pc.set(x, y, c);
  }
  return pc;
}
function matPix(): PixelCanvas {
  const N = 16, pc = new PixelCanvas(N, N);
  const ramp = makeRamp(0x2e302e, 5, { spread: 0.6 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) pc.set(x, y, pick(ramp, (y % 4 === 0 ? 0.85 : y % 4 === 1 ? 0.2 : 0.45) + tileFbm(x, y, N, N, 4, 2, 1) * 0.15));
  return pc;
}

function toTex(pc: PixelCanvas): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = pc.w; cv.height = pc.h;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ext = new WeakMap<FMats, XMats>();
/** the room kit's materials plus the build kit's surfaces (same lighting model as the kit: Lambert on the cheap path) */
export function extMats(mats: FMats): XMats {
  const hit = ext.get(mats);
  if (hit) return hit;
  const low = !!(mats.paint as THREE.MeshLambertMaterial).isMeshLambertMaterial;
  const mk = (pc: PixelCanvas, rough: number, metal = 0) => low
    ? new THREE.MeshLambertMaterial({ map: toTex(pc), vertexColors: true, flatShading: true })
    : new THREE.MeshStandardMaterial({ map: toTex(pc), vertexColors: true, flatShading: true, roughness: rough, metalness: metal });
  const x: XMats = {
    ...mats,
    wallpaper: mk(wallpaperPix(), 0.8), stripe: mk(stripePix(), 0.75), carpet: mk(carpetPix(), 0.98), check: mk(checkPix(), 0.3, 0.05),
    parquet: mk(parquetPix(), 0.5), kilim: mk(kilimPix(), 0.97), runner: mk(runnerPix(), 0.97), mat: mk(matPix(), 0.85),
  };
  ext.set(mats, x);
  return x;
}

/** a printed poster as a texture (blank paper until the sheet is in, then the print) */
const prints = new Map<string, THREE.CanvasTexture>();
export function printTex(key: PrintKey, w = 132, h = 180): THREE.CanvasTexture {
  const k = key + w;
  const hit = prints.get(k);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#d8d0b8'; c.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  const paint = () => {
    const im = printPixels(key, w, h);
    if (!im) return;
    c.putImageData(im, 0, 0);
    // the print's own age: a soft darkening to the edges, a fold line
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,28,10,0.35)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,240,0.12)'; c.fillRect(0, Math.round(h * 0.5), w, 1);
    t.needsUpdate = true;
  };
  whenPrint(key, paint);
  paint();
  prints.set(k, t);
  return t;
}

// Pixel-art textures for the first-person eating and drinking scene (eatFp.ts,
// foodMesh.ts): every food gets a three-panel atlas (skin | inside | wrapper),
// hand-drawn in canvas pixels per kind (lenticels and streaks on fruit, crust
// pores and flour on bread, grill char, marbling and grease on meat, crumb
// holes, cheese eyes, fish scales, chocolate cracks, a printed ration wrapper),
// and the packaging gets printed labels (tins, bottles, soda, a canvas-covered
// canteen, an enamel mug) with condensation beads, scuffs and dents. All
// nearest-filtered, text in Space Grotesk thresholded to hard pixels.
import * as THREE from 'three';
import type { Recipe } from './foodMesh';
import { inkText } from './stage';
import { cssFont } from '../../gfx/crt';
import { hash, mix, shade } from './pix';

const FONT = () => cssFont('--font-new', "'Space Grotesk', Arial, sans-serif");
const hex = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

class Paint {
  readonly cv: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly img: ImageData;
  constructor(readonly w: number, readonly h: number) {
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
    this.g = this.cv.getContext('2d', { willReadFrequently: true })!;
    this.img = this.g.createImageData(w, h);
  }
  set(x: number, y: number, c: number, a = 255) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.img.data;
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = a;
  }
  get(x: number, y: number): number { const i = (((y | 0) * this.w) + (x | 0)) * 4, d = this.img.data; return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; }
  fill(x0: number, y0: number, w: number, h: number, f: (x: number, y: number) => number) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, f(x - x0, y - y0)); }
  dot(x: number, y: number, c: number) { this.set(x, y, c); }
  /** a small blob of a few pixels (never a drawn circle) */
  blob(x: number, y: number, r: number, c: number, s = 1) { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (Math.abs(i) + Math.abs(j) <= r + (hash(x + i, y + j, s) > 0.5 ? 0 : -1)) this.set(x + i, y + j, c); }
  flush() { this.g.putImageData(this.img, 0, 0); }
  text(t: string, x: number, y: number, px: number, c: number, align: CanvasTextAlign = 'center', weight = '700') { this.flush(); inkText(this.g, t, x, y, px, FONT(), hex(c), align, weight); this.img.data.set(this.g.getImageData(0, 0, this.w, this.h).data); }
  tex(): THREE.CanvasTexture {
    this.flush();
    const t = new THREE.CanvasTexture(this.cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
}

/** luminance-ish detail 0..1 to a grey that multiplies the vertex colour */
const L = (k: number) => { const v = Math.max(0, Math.min(255, Math.round(150 + k * 105))); return (v << 16) | (v << 8) | v; };

/** the food atlas: [0, 1/3) skin, [1/3, 2/3) inside, [2/3, 1] wrapper (coloured, printed) */
export function foodAtlas(r: Recipe, seed: number): THREE.CanvasTexture {
  const S = 96, P = new Paint(S * 3, S);
  const k = r.kind;
  // ---- skin
  P.fill(0, 0, S, S, (x, y) => {
    const n = hash(x, y, seed), n2 = hash(x >> 2, y >> 2, seed + 3);
    let v = 0.8 + (n2 - 0.5) * 0.22 + (n - 0.5) * 0.1;
    if (k === 'fruit' || k === 'egg') {
      // streaks down the skin, a blush, and pale lenticel specks
      const st = Math.sin(x * 0.55 + Math.sin(y * 0.11 + seed) * 2.6);
      if (st > 0.75) v -= 0.16; else if (st < -0.85) v += 0.08;
      if (n > 0.975) v = 1.05; else if (n > 0.95 && hash(x + 1, y, seed) > 0.5) v = 0.98;
    }
    else if (k === 'loaf' || k === 'cookie' || k === 'sandwich') { if (n < 0.08) v = 0.42; else if (n > 0.965) v = 1.05; if (hash(x >> 1, y >> 1, seed + 9) > 0.92) v = 1; }
    else if (k === 'meat') { if (((x + y * 2) % 14) < 2) v = 0.32; if (hash(x >> 1, y, seed + 4) > 0.9) v = 1.05; if (n > 0.975) v = 1.1; }
    else if (k === 'fish') { const sx = x % 6, sy = (y + ((x / 6) | 0) * 3) % 6; v = sy === 0 || sx === 0 ? 0.7 : 0.92 + (n > 0.9 ? 0.08 : 0); }
    else if (k === 'bar') { if ((x % 12 === 0) || (y % 9 === 0)) v = 0.62; else if (n > 0.95) v = 0.98; }
    else if (k === 'cheese') { v = 0.94 + (n - 0.5) * 0.06; }
    else if (k === 'long') { if (y % 7 === 0 && n > 0.3) v = 0.72; }
    else if (k === 'weird') v = n > 0.5 ? 1 : 0.6;
    else if (k === 'can' || k === 'bowl') { const b = hash(x >> 3, y >> 2, seed + 7); v = b > 0.5 ? 0.95 : 0.78; if ((x & 7) === 0 || (y & 3) === 0) v = 0.68; }
    return L(v);
  });
  // big marks: cheese eyes, char lines, seeds, bruises, mould
  for (let i = 0; i < 24; i++) {
    const x = (hash(i, 1, seed) * S) | 0, y = (hash(i, 2, seed) * S) | 0;
    if (k === 'cheese') P.blob(x, y, 2 + ((i % 3) | 0), L(0.5), i);
    else if (k === 'fruit' && i < 6) P.blob(x, y, 2, L(0.68), i);
    else if (k === 'sandwich' && i < 14) P.blob(x, y, 1, 0xf6f0d8, i); // sesame
  }
  if (r.bad === 'rotten') for (let i = 0; i < 40; i++) P.blob((hash(i, 5, seed) * S) | 0, (hash(i, 6, seed) * S) | 0, 1 + (i % 3), i % 2 ? 0x9ab868 : 0x5a7a3a, i);
  // ---- inside
  P.fill(S, 0, S, S, (x, y) => {
    const n = hash(x, y, seed + 11);
    let v = 0.9 + (n - 0.5) * 0.08;
    if (k === 'loaf' || k === 'sandwich' || k === 'cookie') { if (hash(x >> 1, y >> 1, seed + 12) > 0.86) v = 0.6; }
    else if (k === 'meat' || k === 'fish') { if (y % 4 === 0) v = 0.78; if (n > 0.96) v = 1.05; }
    else if (k === 'fruit' || k === 'long') { if (n > 0.92) v = 1; if (((x * 3 + y * 5) % 23) === 0) v = 0.7; }
    else if (k === 'bar') { if (hash(x >> 2, y >> 2, seed) > 0.8) v = 1.05; }
    return L(v);
  });
  if (k === 'fruit' && r.label.toLowerCase().includes('apple')) for (let i = 0; i < 5; i++) P.blob(S + 30 + i * 8, 48 + (i % 2) * 6, 1, 0x3a2410, i); // pips
  // ---- wrapper: the issue print
  const wc = r.wrap;
  P.fill(S * 2, 0, S, S, (x, y) => {
    const n = hash(x, y, seed + 21);
    let c = (x >> 2) % 2 ? wc : mix(wc, 0xffffff, 0.12);
    if (y < 12 || y > S - 12) c = shade(wc, 0.6);
    if (y === 12 || y === S - 12) c = 0x1a1610;
    if (n > 0.97) c = mix(c, 0xffffff, 0.5); // crinkle glints
    if (((x + y) % 31) === 0) c = shade(c, 0.8);
    return c;
  });
  P.fill(S * 2 + 8, 30, S - 16, 34, (x, y) => (y === 0 || y === 33 || x === 0 || x === S - 17 ? 0x1a1610 : 0xe8dcb8));
  P.text(r.kind === 'bar' ? 'RATION' : 'ISSUE', S * 2 + S / 2, 52, 16, 0x2a1a10);
  P.text('MERIDIAN', S * 2 + S / 2, 61, 8, 0x8a2a1a, 'center', '600');
  for (let x = 0; x < 30; x += 2) P.fill(S * 2 + 10 + x, S - 22, 1, 7, () => (x % 3 ? 0x1a1610 : 0x3a3020));
  return P.tex();
}

export type PropTex = 'can' | 'dcan' | 'bottle' | 'canteen' | 'mug' | 'bowl' | 'drops';
const cache = new Map<string, THREE.CanvasTexture>();

/** printed labels and surfaces for the packaging (wraps once round a cylinder: u = around, v = up) */
export function propTex(kind: PropTex, word = '', tint = 0xc83a2a): THREE.CanvasTexture {
  const key = kind + ':' + word + ':' + tint;
  const hit = cache.get(key); if (hit) return hit;
  let t: THREE.CanvasTexture;
  if (kind === 'can') {
    const P = new Paint(192, 64);
    P.fill(0, 0, 192, 64, (x, y) => {
      const n = hash(x, y, 4);
      let c = y < 8 || y > 55 ? (((y + (x >> 3)) % 3) ? 0xb8bcc2 : 0x8a9098) : tint;
      if (y >= 8 && y <= 55 && y > 40) c = 0xe8dcb8;
      if (y === 8 || y === 55 || y === 40) c = 0x1a1610;
      if (n > 0.96) c = mix(c, 0x6a3a1e, 0.6);
      return c;
    });
    // the picture: a heap of beans / stew lumps in a pixel dish
    for (let i = 0; i < 26; i++) { const x = 48 + ((hash(i, 1) * 30) | 0), y = 16 + ((hash(i, 2) * 18) | 0); P.blob(x, y, 1 + (i % 2), i % 3 ? 0xa8502a : 0x7a3a18, i); P.dot(x - 1, y - 1, 0xe8a070); }
    P.fill(44, 34, 40, 3, (x) => (x === 0 || x === 39 ? 0x1a1610 : 0xd8d0c0));
    P.text(word || 'BEANS', 110, 32, 18, 0xf6efd8);
    P.text('MERIDIAN · ISSUE', 104, 51, 8, 0x3a2a1e, 'center', '600');
    for (let x = 0; x < 22; x += 2) P.fill(150 + x, 43, 1, 9, () => 0x1a1610);
    t = P.tex();
  } else if (kind === 'dcan') {
    const P = new Paint(192, 64);
    P.fill(0, 0, 192, 64, (x, y) => {
      let c = y < 5 || y > 58 ? 0xb8bcc2 : 0xb8201a;
      const wave = 30 + Math.round(Math.sin(x * 0.065) * 7);
      if (y > wave && y < wave + 6 && y >= 5 && y <= 58) c = 0xf4ecd8;
      if (hash(x, y, 9) > 0.975) c = mix(c, 0x1a1610, 0.4);
      return c;
    });
    P.text(word || 'FIZZ', 96, 26, 20, 0xf4ecd8);
    P.text('12 OZ', 96, 54, 8, 0x5a0a08, 'center', '600');
    t = P.tex();
  } else if (kind === 'bottle') {
    const P = new Paint(160, 40);
    P.fill(0, 0, 160, 40, (x, y) => {
      let c = 0xf2f2ea;
      if (y < 6 || y > 33) c = tint;
      if (y > 14 && y < 26 && ((x >> 3) % 2)) c = mix(0xf2f2ea, tint, 0.15);
      if (hash(x, y, 2) > 0.97) c = 0xd8d8d0;
      return c;
    });
    for (let x = 0; x < 30; x++) P.set(28 + x, 24 - Math.round(Math.abs(((x % 10) - 5)) * 0.8), tint); // a mountain line
    P.text(word || 'WATER', 80, 25, 14, 0x1a3a5a);
    P.text('SPRING · 0.5 L', 80, 33, 7, 0x3a5a7a, 'center', '600');
    t = P.tex();
  } else if (kind === 'canteen') {
    const P = new Paint(128, 64);
    // canvas cover: a woven twill, worn pale at the seams, a stencil
    P.fill(0, 0, 128, 64, (x, y) => {
      const w = ((x + y) % 4 < 2) ? 0x5a6038 : 0x4a5030;
      let c = (y % 2 === 0 && x % 2 === 0) ? shade(w, 1.1) : w;
      if (x % 32 < 2) c = 0x3a3e24;
      if (hash(x, y, 13) > 0.97) c = 0x7a7a5a;
      return c;
    });
    P.text('M-7', 64, 38, 16, 0x1e2010);
    t = P.tex();
  } else if (kind === 'mug') {
    const P = new Paint(128, 48);
    P.fill(0, 0, 128, 48, (x, y) => {
      let c = 0xe8e4dc;
      if (y > 41) c = 0x2a4a7a; // the blue rim
      if (y > 39 && y <= 41) c = 0xc8c4bc;
      const chip = hash(x >> 1, y >> 1, 3);
      if (chip > 0.975) c = 0x1a1814;
      if (y < 30 && hash(x, 3, 7) > 0.93 && y > 30 - hash(x, 4, 7) * 22) c = mix(c, 0x6a4020, 0.35); // drip stains
      return c;
    });
    P.text('MERIDIAN', 64, 24, 10, 0x2a4a7a);
    t = P.tex();
  } else if (kind === 'bowl') {
    const P = new Paint(128, 32);
    P.fill(0, 0, 128, 32, (x, y) => { let c = 0xe8e0d0; if (y < 4) c = 0x2a4a7a; if (hash(x >> 1, y >> 1, 5) > 0.97) c = 0x1a1814; return c; });
    t = P.tex();
  } else {
    // condensation: beads and runs on clear glass (alpha cut-out)
    const P = new Paint(128, 64);
    P.fill(0, 0, 128, 64, () => 0);
    for (let i = 0; i < 80; i++) {
      const x = (hash(i, 1, 33) * 128) | 0, y = (hash(i, 2, 33) * 64) | 0;
      P.set(x, y, 0xf8fcff, 255); P.set(x + 1, y, 0xc8dce8, 255); P.set(x, y + 1, 0x9ab8c8, 255);
      if (i % 9 === 0) for (let j = 2; j < 2 + (i % 14); j++) P.set(x, y + j, 0xd8ecf8, 255);
    }
    for (let i = 0; i < P.img.data.length; i += 4) if (P.img.data[i] === 0 && P.img.data[i + 1] === 0 && P.img.data[i + 2] === 0) P.img.data[i + 3] = 0;
    t = P.tex();
  }
  cache.set(key, t);
  return t;
}

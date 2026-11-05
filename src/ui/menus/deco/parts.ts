// Shared parts for the collectibles: faceted domes, balls, tapered limbs,
// leaves, the numbered display bases, the little glint that runs over a
// glossy figure now and then, and the model contract every item returns.
import * as THREE from 'three';
import { DecoBuilder, type DKey, type DMats, at, along, lathe, prism, cbox, extrude, ngon, PixelCanvas } from './kit';
import { bitText, bitMeasure, INK } from '../../../gfx/bitfont';

export type V3 = [number, number, number];

/** what an item's builder hands back */
export interface DecoModel {
  /** the model, origin on the floor at its centre, front facing +Z */
  obj: THREE.Group;
  /** idle animation (t seconds since spawn) */
  update?(t: number, dt: number): void;
  /** clicked / tapped in the room: a wobble, a flicker */
  poke?(): void;
  /** a practical light the item gives off (the room may cap how many are on) */
  light?: THREE.PointLight;
}

// ------------------------------------------------------------------ shapes
/** a faceted dome (eyes, buttons, lenses): bulges along +Y, base radius r, height h */
export const dome = (r: number, h: number, n = 8) => lathe([[0, 0], [r, 0], [r * 0.86, h * 0.55], [r * 0.5, h * 0.9], [0, h]], n, 0.5);
/** a faceted ball (joints, hands, knobs) */
export const ball = (r: number, n = 6) => lathe([[0, -r], [r * 0.62, -r * 0.8], [r, -r * 0.18], [r * 0.92, r * 0.36], [r * 0.56, r * 0.84], [0, r]], n, 0.5);
/** a tapered faceted segment from a to b */
export function limb(b: DecoBuilder, key: DKey, a: V3, c: V3, r0: number, r1: number, color: number, n = 6) {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  b.add(key, prism(r0, len, n, { rTop: r1, c: Math.min(r0, r1) * 0.3 }), color, along(a, c));
}
/** a ball joint at p */
export function knob(b: DecoBuilder, key: DKey, p: V3, r: number, color: number, n = 6) { b.add(key, ball(r, n), color, at(p[0], p[1], p[2])); }
/** a flat leaf / blade outline in XY (base at 0, tip at len), bent by tilting the matrix */
export function leafGeo(len: number, w: number, d = 0.004, pts = 5): THREE.BufferGeometry {
  const L: [number, number][] = [], R: [number, number][] = [];
  for (let i = 0; i <= pts; i++) {
    const t = i / pts, y = t * len;
    const hw = w * Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.5 * (1 - t * 0.25) + (i === 0 ? w * 0.18 : 0);
    L.push([-hw, y]); R.unshift([hw, y]);
  }
  return extrude([...L.slice(0, -1), [0, len], ...R.slice(1)], d, 0);
}

// ------------------------------------------------------------------ the display base
const NUM_CACHE = new Map<string, HTMLCanvasElement>();
/** a printed name strip for a base (Alagard, pixel-crisp) */
export function labelCanvas(text: string, bg = 0x1c1a16, fg = '#e8dcb8', w = 0): HTMLCanvasElement {
  const key = `${text}|${bg}|${fg}|${w}`;
  const hit = NUM_CACHE.get(key);
  if (hit) return hit;
  const tw = bitMeasure(text, 'body');
  const W = Math.max(w, tw + 8), H = 18;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  const r = (bg >> 16) & 255, g = (bg >> 8) & 255, bl = bg & 255;
  const lift = (k: number) => ((Math.min(255, r + k) << 16) | (Math.min(255, g + k) << 8) | Math.min(255, bl + k));
  pc.fill(bg);
  pc.hline(0, W - 1, 0, lift(40)); pc.hline(0, W - 1, H - 1, 0x050505);
  for (let i = 0; i < W * 0.06; i++) pc.set(Math.floor(Math.random() * W), 1 + Math.floor(Math.random() * (H - 2)), lift(18));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.putImageData(pc.toImageData(), 0, 0);
  bitText(ctx, text, Math.round(W / 2), 1, { font: 'body', color: fg, outline: INK, align: 'center' });
  NUM_CACHE.set(key, cv);
  return cv;
}

/** a numbered display base: chamfered hex plinth in glossy black with a brass rim and a printed strip */
export function vinylBase(b: DecoBuilder, r: number, h: number, color = 0x18171a, rim = 0xb08a3a) {
  b.add('gloss', prism(r, h, 6, { rTop: r * 0.96, c: h * 0.25, phase: 0 }), color, at(0, h / 2, 0));
  b.add('brass', prism(r * 0.985, h * 0.16, 6, { c: 0, phase: 0 }), rim, at(0, h * 0.82, 0));
}
/** a stepped statue plinth (octagonal, marble-ish enamel and a brass name plate) */
export function plinth(b: DecoBuilder, r: number, h: number, color = 0x2a2724, accent = 0xa88a4a) {
  b.add('gloss', prism(r, h * 0.55, 8, { rTop: r * 0.97, c: h * 0.08 }), color, at(0, h * 0.275, 0));
  b.add('gloss', prism(r * 0.86, h * 0.45, 8, { rTop: r * 0.8, c: h * 0.06 }), color, at(0, h * 0.55 + h * 0.225, 0), { seed: 7 });
  b.add('brass', prism(r * 0.99, h * 0.07, 8, { c: 0 }), accent, at(0, h * 0.55, 0));
}

// ------------------------------------------------------------------ the glint
let glintTex: THREE.CanvasTexture | null = null;
function glintTexture(): THREE.CanvasTexture {
  if (glintTex) return glintTex;
  const N = 9, pc = new PixelCanvas(N, N);
  pc.wrap = false;
  const c = 4;
  for (let i = 0; i < N; i++) { const d = Math.abs(i - c); const a = d === 0 ? 255 : d < 2 ? 230 : d < 3 ? 150 : 70; pc.set(i, c, 0xffffff, a); pc.set(c, i, 0xffffff, a); }
  pc.set(c - 1, c - 1, 0xffffff, 120); pc.set(c + 1, c + 1, 0xffffff, 120); pc.set(c - 1, c + 1, 0xffffff, 120); pc.set(c + 1, c - 1, 0xffffff, 120);
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  glintTex = new THREE.CanvasTexture(cv);
  glintTex.magFilter = glintTex.minFilter = THREE.NearestFilter; glintTex.generateMipmaps = false;
  return glintTex;
}
/** a star of light that runs over a glossy figure every few seconds */
export class Glint {
  sprite: THREE.Sprite;
  private t = 0; private next: number; private spots: THREE.Vector3[]; private size: number;
  constructor(spots: V3[], size = 0.06, seed = 1) {
    this.size = size;
    const m = new THREE.SpriteMaterial({ map: glintTexture(), transparent: true, depthWrite: false, depthTest: true, toneMapped: false, blending: THREE.AdditiveBlending, color: 0xfff6e0 });
    this.sprite = new THREE.Sprite(m);
    this.sprite.scale.setScalar(size);
    this.sprite.visible = false;
    this.sprite.renderOrder = 5;
    this.spots = spots.map((p) => new THREE.Vector3(...p));
    this.next = 1.5 + (seed % 7) * 0.6;
  }
  update(dt: number) {
    this.t += dt;
    const k = (this.t - this.next) / 0.42;
    if (k < 0) { this.sprite.visible = false; return; }
    if (k > 1) { this.next = this.t + 2.5 + Math.random() * 5; this.sprite.visible = false; return; }
    if (k < 0.05) this.sprite.position.copy(this.spots[Math.floor(Math.random() * this.spots.length)]);
    this.sprite.visible = true;
    const s = Math.sin(k * Math.PI);
    (this.sprite.material as THREE.SpriteMaterial).opacity = s;
    this.sprite.material.rotation = k * 0.8;
    this.sprite.scale.setScalar(this.size * (0.4 + s * 0.8));
  }
}

/** wrap a built group in a scale node so the model is authored in its own units */
export function scaled(g: THREE.Object3D, s: number): THREE.Group {
  const o = new THREE.Group();
  g.scale.setScalar(s);
  o.add(g);
  return o;
}

/** a damped spring for wobbles (value, velocity) */
export class Spring {
  x = 0; v = 0;
  constructor(public k = 60, public c = 6) {}
  step(dt: number, target = 0) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (-(this.x - target) * this.k - this.v * this.c) * h; this.x += this.v * h; }
    return this.x;
  }
  kick(v: number) { this.v += v; }
}

export { DecoBuilder, at, along, lathe, prism, cbox, extrude, ngon };
export type { DMats, DKey };

import * as THREE from 'three';
import { G } from '../game/G';
import { itemGeometry } from '../items/itemMeshes';
import { worldMaterial, U } from '../gfx/materials';
import { Item, itemDef, hasItemDef, freshness, ItemCat } from '../items/item';
import { buildObjGeometry } from '../world/objects';
import { PixelCanvas, mixHex } from '../gfx/pixel';
import { pxScale } from './pixelkit';
import { upscaleRows, rowsToCanvas, shadeSprite, dprK, pcUrl } from './hiPixel';

/**
 * Item icons as pixel art, rendered from each item's real 3D model.
 *
 * The model is posed for its shape (long things lie on the diagonal, flat
 * things are seen from above, tall things from the front at a 3/4 angle),
 * framed tightly, lit like a product shot (warm key, cool fill, rim from
 * behind) and rendered at 4x. The 4x4 samples of every final pixel are
 * reduced to one colour (alpha by coverage, so edges stay hard), the icon is
 * quantised to a small palette, edge-lit (light top-left lip, shaded
 * bottom-right) and given a 1-px "selective" outline: a dark version of the
 * colour it touches rather than flat black. Cached per item, size and state.
 * Without a model or WebGL a hand-drawn glyph for the item's category is used.
 */
const cache = new Map<string, string>();
const SS = 4;

/**
 * Round 13: icons are rendered at the resolution they are shown at (one icon
 * pixel per CSS pixel, two on a sharp screen) instead of a small sprite blown
 * up 2-3x, and the pixel pass adds more: a bigger palette with ordered
 * dithering between its tones, 1 px crease lines where the model's surfaces
 * turn sharply (from a normals pass), the lit lip, the selective outline.
 * `artPx` is the size in the interface's art pixels (--px), `css` in CSS px.
 */
export function iconRes(artPx: number): number { return Math.min(176, Math.round(artPx * pxScale() * dprK())); }
export function iconResCss(css: number): number { return Math.min(176, Math.round(css * dprK())); }

export type IconVariant = '' | 'bloody' | 'burnt' | 'rotten' | 'frozen' | 'wet' | 'obj';

export function itemIcon(key: string, variant: string = '', size = 18): string {
  const ck = key + '|' + variant + '|' + size;
  const hit = cache.get(ck);
  if (hit) return hit;
  let url = '';
  try { url = renderIcon(key, variant, size); } catch (e) { console.warn('icon', key, e); }
  if (!url) url = fallbackIcon(key, size, variant);
  cache.set(ck, url);
  return url;
}

/** the icon for a specific item, showing its state (blood, burnt, rotten, frozen) */
export function itemIconFor(it: Item, size = 18): string { return itemIcon(it.key, iconVariant(it), size); }
export function iconVariant(it: Item): IconVariant {
  if ((it.bloody ?? 0) > 0.3) return 'bloody';
  if ((it.cooked ?? 0) >= 1.6) return 'burnt';
  if ((it.frozen ?? 0) > 0.5) return 'frozen';
  try { if (freshness(it) === 'rotten') return 'rotten'; } catch { /* no food data */ }
  if ((it.wet ?? 0) > 0.5) return 'wet';
  return '';
}

/** Icon of a furniture/prop model (used for container tabs) */
export function objIcon(key: string, size = 16): string {
  return itemIcon(key, 'obj', size);
}

export function clearIconCache() { cache.clear(); }

// ------------------------------------------------------------------ renderer
let rt: THREE.WebGLRenderTarget | null = null;
let rtSize = 0;
let scene: THREE.Scene | null = null;
let cam: THREE.OrthographicCamera | null = null;
let pivot: THREE.Group | null = null;

function setup() {
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.35));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(-2.2, 3.6, 2.6); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9db4ff, 0.75); fill.position.set(3, 1.2, 1.5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(1.5, 2.5, -3.5); scene.add(rim);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
  pivot = new THREE.Group();
  scene.add(pivot);
}

const v3 = new THREE.Vector3();
/** pick yaw / pitch for the shape and fit an orthographic frame around the projected vertices */
function pose(g: THREE.BufferGeometry, obj: boolean): { yaw: number; pitch: number; box: [number, number, number, number] } {
  const bb = g.boundingBox!;
  const size = new THREE.Vector3(); bb.getSize(size);
  const c = new THREE.Vector3(); bb.getCenter(c);
  const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
  const flat = size.y < Math.max(size.x, size.z) * 0.28;
  const tall = size.y > Math.max(size.x, size.z) * 1.5;
  const long = dims[0] > dims[1] * 2.3;
  const pitch = obj ? 0.52 : flat ? (long ? 1.0 : 0.78) : tall ? 0.34 : 0.55;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count, step = Math.max(1, Math.floor(n / 600));
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  let best = { s: Infinity, yaw: 0, box: [0, 0, 0, 0] as [number, number, number, number] };
  const pref = obj ? 0.62 : 0.6; // a 3/4 view from the front-left
  for (let k = 0; k < 24; k++) {
    const yaw = (k / 24) * Math.PI * 2;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += step) {
      v3.fromBufferAttribute(pos, i).sub(c);
      // rotate by yaw about Y, then view from the camera tilted down by pitch looking along -Z
      const rx = v3.x * cy + v3.z * sy, rz = -v3.x * sy + v3.z * cy;
      const sx = rx, syy = v3.y * cp - rz * sp;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (syy < y0) y0 = syy; if (syy > y1) y1 = syy;
    }
    const s = Math.max(x1 - x0, y1 - y0);
    let d = Math.abs(((yaw - pref) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (!long) d = Math.min(d, Math.abs(((yaw + pref) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI) + 0.2);
    // long things: just fill the square; others: stay near a 3/4 front view
    const score = s * (1 + (long ? 0.02 : flat ? 0.55 : 0.22) * d);
    if (score < best.s) best = { s: score, yaw, box: [x0, x1, y0, y1] };
  }
  return { yaw: best.yaw, pitch, box: best.box };
}

function renderIcon(key: string, variant: string, size: number): string {
  const obj = variant === 'obj';
  if (!obj && !hasItemDef(key)) return '';
  const g = obj ? buildObjGeometry(key) : itemGeometry(key);
  const r = G?.pr?.renderer as THREE.WebGLRenderer | undefined;
  if (!g || !r) return '';
  if (!g.boundingBox) g.computeBoundingBox();
  if (!scene) setup();
  const W = size * SS;
  if (!rt || rtSize !== W) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(W, W, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rtSize = W;
  }
  const { yaw, pitch, box } = pose(g, obj);
  const mesh = new THREE.Mesh(g, worldMaterial({ noVis: true, noFog: true, noGrid: true }));
  const center = new THREE.Vector3(); g.boundingBox!.getCenter(center);
  mesh.position.copy(center).multiplyScalar(-1);
  const spin = new THREE.Group(); spin.add(mesh); spin.rotation.y = yaw;
  pivot!.add(spin);
  // frame: one final pixel of margin for the outline on every side
  const [x0, x1, y0, y1] = box;
  const span = Math.max(x1 - x0, y1 - y0) * (size / (size - 2)) + 1e-4;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  cam!.left = mx - span / 2; cam!.right = mx + span / 2; cam!.bottom = my - span / 2; cam!.top = my + span / 2;
  const dist = span * 4 + 2;
  cam!.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  cam!.up.set(0, 1, 0);
  cam!.lookAt(0, 0, 0);
  cam!.near = 0.001; cam!.far = dist * 3;
  cam!.updateProjectionMatrix();
  // world-only shader features off for the icon pass (the uniforms are shared with the main renderer)
  const u = U as any;
  const keys = ['uCutOn', 'uVisOn', 'uFogNear', 'uFogFar', 'uGridScale', 'uCollapse', 'uSnapOn', 'uWetness'];
  const want: Record<string, number> = { uCutOn: 0, uVisOn: 0, uFogNear: 1e4, uFogFar: 2e4, uGridScale: 0, uCollapse: 0, uSnapOn: 0, uWetness: 0 };
  const saved: Record<string, any> = {};
  for (const k of keys) if (u[k] && typeof u[k].value === 'number') { saved[k] = u[k].value; u[k].value = want[k]; }
  const px = new Uint8Array(W * W * 4);
  const nrm = size >= 36 ? new Uint8Array(W * W * 4) : null;
  const prevTarget = r.getRenderTarget();
  const prevClear = new THREE.Color(); r.getClearColor(prevClear); const prevAlpha = r.getClearAlpha();
  try {
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene!, cam!);
    r.readRenderTargetPixels(rt!, 0, 0, W, W, px);
    // the same shot in view-space normals: where they turn sharply, a crease line goes in
    if (nrm) {
      const keep = mesh.material;
      mesh.material = normalMat ??= new THREE.MeshNormalMaterial();
      r.clear(true, true, true);
      r.render(scene!, cam!);
      r.readRenderTargetPixels(rt!, 0, 0, W, W, nrm);
      mesh.material = keep;
    }
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    for (const k of Object.keys(saved)) u[k].value = saved[k];
    pivot!.remove(spin);
  }
  const pc = reduce(px, W, size);
  const creases = nrm ? creaseMap(nrm, W, size) : null;
  post(pc, variant, key, creases);
  return toUrl(pc);
}
let normalMat: THREE.MeshNormalMaterial | null = null;

/** per final pixel: does the surface fold away sharply to its right / below? (1 = crease) */
function creaseMap(nrm: Uint8Array, W: number, size: number): Uint8Array {
  const N = new Float32Array(size * size * 3), has = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0, a = 0, b = 0, c = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const k = (((size - 1 - y) * SS + (SS - 1 - j)) * W + x * SS + i) * 4;
      if (nrm[k + 3] > 128) { n++; a += nrm[k] / 127.5 - 1; b += nrm[k + 1] / 127.5 - 1; c += nrm[k + 2] / 127.5 - 1; }
    }
    if (n < SS * SS * 0.4) continue;
    const l = Math.hypot(a, b, c) || 1, q = (y * size + x) * 3;
    N[q] = a / l; N[q + 1] = b / l; N[q + 2] = c / l; has[y * size + x] = 1;
  }
  const out = new Uint8Array(size * size);
  const dot = (p: number, q: number) => N[p * 3] * N[q * 3] + N[p * 3 + 1] * N[q * 3 + 1] + N[p * 3 + 2] * N[q * 3 + 2];
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const p = y * size + x;
    if (!has[p]) continue;
    const r = p + 1, d = p + size;
    // the pixel on the side turned away from the light takes the line
    if (has[r] && dot(p, r) < 0.6) out[N[p * 3] < N[r * 3] ? p : r] = 1;
    if (has[d] && dot(p, d) < 0.6) out[N[p * 3 + 1] < N[d * 3 + 1] ? p : d] = 1;
  }
  return out;
}

// ------------------------------------------------------------------ pixel pass
const toS = (v: number) => { v /= 255; v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };

/** 4x4 supersamples -> one pixel: alpha by coverage (hard), colour = mean of covered samples */
function reduce(px: Uint8Array, W: number, size: number): PixelCanvas {
  const pc = new PixelCanvas(size, size); pc.wrap = false;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0, R = 0, Gg = 0, B = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const sx = x * SS + i, sy = (size - 1 - y) * SS + (SS - 1 - j);
      const k = (sy * W + sx) * 4;
      if (px[k + 3] > 128) { n++; R += px[k]; Gg += px[k + 1]; B += px[k + 2]; }
    }
    if (n >= SS * SS * 0.4) pc.setRGBA(x, y, toS(R / n), toS(Gg / n), toS(B / n), 255);
  }
  // fill single-pixel holes and drop single stray pixels (keeps silhouettes clean)
  const a = (x: number, y: number) => pc.alpha(x, y) > 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nb = (a(x - 1, y) ? 1 : 0) + (a(x + 1, y) ? 1 : 0) + (a(x, y - 1) ? 1 : 0) + (a(x, y + 1) ? 1 : 0);
    if (!a(x, y) && nb >= 3) { const c = pc.get(x - 1, y) || pc.get(x + 1, y); pc.set(x, y, c); }
    else if (a(x, y) && nb === 0) pc.setRGBA(x, y, 0, 0, 0, 0);
  }
  return pc;
}

function rgb(c: number): [number, number, number] { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function lum(c: number) { const [r, g, b] = rgb(c); return r * 0.3 + g * 0.59 + b * 0.11; }
function satBoost(c: number, k: number, contrast: number): number {
  let [r, g, b] = rgb(c);
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
  r = 128 + (r - 128) * contrast; g = 128 + (g - 128) * contrast; b = 128 + (b - 128) * contrast;
  return (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
}

/** small k-means palette: pixel art reads as clusters of a few colours */
function quantise(pc: PixelCanvas, k: number) {
  const cols: number[] = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y)) cols.push(pc.get(x, y));
  if (cols.length <= k) return;
  // init: spread over the luminance order (deterministic)
  const sorted = [...cols].sort((a, b) => lum(a) - lum(b));
  let cent = Array.from({ length: k }, (_, i) => rgb(sorted[Math.floor((i + 0.5) / k * sorted.length)]));
  const asg = new Int32Array(cols.length);
  for (let it = 0; it < 7; it++) {
    const sum = cent.map(() => [0, 0, 0, 0]);
    cols.forEach((c, i) => {
      const [r, g, b] = rgb(c);
      let bi = 0, bd = Infinity;
      for (let j = 0; j < cent.length; j++) { const d = (r - cent[j][0]) ** 2 * 0.9 + (g - cent[j][1]) ** 2 * 1.2 + (b - cent[j][2]) ** 2 * 0.7; if (d < bd) { bd = d; bi = j; } }
      asg[i] = bi; sum[bi][0] += r; sum[bi][1] += g; sum[bi][2] += b; sum[bi][3]++;
    });
    cent = cent.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  // final assignment: a pixel that sits between two tones is ordered-dithered between them (big icons)
  const dith = pc.w >= 40;
  let i = 0;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y)) {
    let c = cent[asg[i]];
    if (dith) {
      const [r, g, b] = rgb(cols[i]);
      let b1 = Infinity, b2 = Infinity, j1 = 0, j2 = 0;
      for (let j = 0; j < cent.length; j++) {
        const d = (r - cent[j][0]) ** 2 * 0.9 + (g - cent[j][1]) ** 2 * 1.2 + (b - cent[j][2]) ** 2 * 0.7;
        if (d < b1) { b2 = b1; j2 = j1; b1 = d; j1 = j; } else if (d < b2) { b2 = d; j2 = j; }
      }
      const rr = Math.sqrt(b1) / (Math.sqrt(b1) + Math.sqrt(b2) + 1e-6);
      c = cent[rr > 0.3 + BAY[(y & 3) * 4 + (x & 3)] * 0.2 ? j2 : j1];
    }
    i++;
    pc.setRGBA(x, y, Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255);
  }
}
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function post(pc: PixelCanvas, variant: string, key: string, creases: Uint8Array | null = null) {
  const S = pc.w;
  // punchier colour like hand-picked pixel palettes
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (pc.alpha(x, y)) pc.set(x, y, satBoost(pc.get(x, y), 1.18, 1.08));
  quantise(pc, S >= 96 ? 30 : S >= 56 ? 26 : S >= 40 ? 22 : S >= 32 ? 18 : S >= 20 ? 13 : S >= 16 ? 11 : 8);
  // crease lines: the folds of the model drawn in, a dark tone of the surface
  if (creases) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (creases[y * S + x] && pc.alpha(x, y)) pc.set(x, y, mixHex(pc.get(x, y), 0x0a0810, 0.42));
  // state overlays
  // smooth value noise at the icon's scale (stains are blobs with soft, dithered edges, not squares)
  const sc = Math.max(3, S / 6), seed = key.length * 7 + 1;
  const vn = (x: number, y: number, f: number, sd: number) => {
    const X = x / (sc * f), Y = y / (sc * f), x0 = Math.floor(X), y0 = Math.floor(Y), u = X - x0, v = Y - y0;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = hash(x0, y0, sd), b = hash(x0 + 1, y0, sd), c = hash(x0, y0 + 1, sd), d = hash(x0 + 1, y0 + 1, sd);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  const fbm = (x: number, y: number, sd: number) => vn(x, y, 1, sd) * 0.62 + vn(x, y, 0.45, sd + 11) * 0.28 + vn(x, y, 0.2, sd + 23) * 0.1;
  const bay = (x: number, y: number) => BAY[(y & 3) * 4 + (x & 3)];
  if (variant === 'bloody') {
    const m = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) m[y * S + x] = fbm(x, y, seed) + (S >= 32 ? (bay(x, y) - 0.5) * 0.05 : 0);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (pc.alpha(x, y)) {
      const n = m[y * S + x];
      if (n < 0.56) continue;
      const base = pc.get(x, y);
      // dried rim, fresh middle, black clots; a wet glint on the upper-left edge of each stain
      let c = n > 0.74 ? 0x4a0806 : n > 0.62 ? 0x8a140e : mixHex(base, 0x6a100a, 0.7);
      if (n > 0.6 && y > 0 && m[(y - 1) * S + x] < 0.58 && x > 0 && m[y * S + x - 1] < 0.62) c = 0xd8504a;
      pc.set(x, y, c);
      // a drip runs down from the heavier stains
      if (n > 0.7 && hash(x, 0, seed) > 0.86) for (let j = 1; j < Math.round(S / 9); j++) if (pc.alpha(x, y + j)) pc.set(x, y + j, j > 1 && hash(x, j, 2) > 0.6 ? 0x5a0a08 : 0x8a140e);
    }
  } else if (variant === 'burnt') {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (pc.alpha(x, y)) {
      const n = fbm(x, y, seed + 3);
      pc.set(x, y, mixHex(pc.get(x, y), n > 0.62 ? 0x060504 : n > 0.5 ? 0x1c120a : 0x3a2414, n > 0.62 ? 0.88 : 0.6));
      if (n > 0.66 && hash(x, y, 9) > 0.93) pc.set(x, y, 0xff8a2a); // embers
    }
  } else if (variant === 'rotten') {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (pc.alpha(x, y)) {
      const n = fbm(x, y, seed + 5);
      const c = mixHex(pc.get(x, y), 0x5a6a20, 0.35);
      pc.set(x, y, n > 0.68 ? (hash(x, y, 4) > 0.7 ? 0x8a9a40 : 0x3a4210) : n > 0.6 ? mixHex(c, 0x2a3008, 0.4) : c);
    }
  } else if (variant === 'frozen') {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (pc.alpha(x, y)) {
      const n = fbm(x, y, seed + 9);
      pc.set(x, y, mixHex(pc.get(x, y), 0xcfe8ff, n > 0.66 ? 0.75 : 0.32));
      if (hash(x, y, 2) > 0.96) pc.set(x, y, 0xffffff); // frost sparkles
    }
  } else if (variant === 'wet') {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (pc.alpha(x, y)) {
      pc.set(x, y, mixHex(pc.get(x, y), 0x1a3050, 0.25));
      if (fbm(x, y, seed + 13) > 0.7 && hash(x, y, 6) > 0.8) pc.set(x, y, 0xcfe4f4); // droplets
    }
  }
  // edge light: lip on the top-left of the silhouette, shade bottom-right
  const op = (x: number, y: number) => pc.alpha(x, y) > 0;
  const src = new Uint8ClampedArray(pc.data);
  const at = (x: number, y: number) => { const i = (y * S + x) * 4; return (src[i] << 16) | (src[i + 1] << 8) | src[i + 2]; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!op(x, y)) continue;
    const c = at(x, y);
    if (!op(x, y - 1) || !op(x - 1, y)) pc.set(x, y, mixHex(c, 0xfff6e0, 0.22));
    else if (!op(x, y + 1) || !op(x + 1, y)) pc.set(x, y, mixHex(c, 0x000000, 0.22));
  }
  // selective outline (4-connected), darker on the shadow side
  const src2 = new Uint8ClampedArray(pc.data);
  const opa = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && src2[(y * S + x) * 4 + 3] > 0;
  const col = (x: number, y: number) => { const i = (y * S + x) * 4; return (src2[i] << 16) | (src2[i + 1] << 8) | src2[i + 2]; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (opa(x, y)) continue;
    let nc = -1, shadow = false;
    if (opa(x, y + 1)) nc = col(x, y + 1);
    else if (opa(x + 1, y)) nc = col(x + 1, y);
    else if (opa(x - 1, y)) { nc = col(x - 1, y); shadow = true; }
    else if (opa(x, y - 1)) { nc = col(x, y - 1); shadow = true; }
    if (nc < 0) continue;
    pc.set(x, y, mixHex(nc, 0x07060a, shadow ? 0.86 : 0.74));
  }
}
function hash(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return ((h >>> 0) % 1000) / 1000; }

function toUrl(pc: PixelCanvas): string {
  const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c.toDataURL();
}

// ------------------------------------------------------------------ fallback glyphs (no model / no WebGL)
const CAT_GLYPH: Partial<Record<ItemCat | 'obj', string[]>> = {
  food: ['....aaaa....', '...abbbba...', '...cccccc...', '...cddddc...', '...cdeedc...', '...cdeedc...', '...cddddc...', '...cccccc...', '...abbbba...', '....aaaa....'],
  drink: ['.....aa.....', '.....bb.....', '....abba....', '...cddddc...', '...cddddc...', '...ceeeec...', '...ceeeec...', '...cddddc...', '...cddddc...', '....cccc....'],
  medical: ['..aaaaaaaa..', '.abbbbbbbba.', '.abbbccbbba.', '.abbbccbbba.', '.abccccccba.', '.abccccccba.', '.abbbccbbba.', '.abbbccbbba.', '.abbbbbbbba.', '..aaaaaaaa..'],
  weapon: ['..........ab', '.........abb', '........abb.', '.......abb..', '......abb...', '.....abb....', '..d.abb.....', '...dcb......', '...cdd......', '..cc..d.....'],
  tool: ['..aa........', '.abba.......', '.ab.ba......', '..a.bba.....', '.....bba....', '......cca...', '.......cca..', '........cca.', '.........cc.', '............'],
  clothing: ['..aa....aa..', '.abbaaaabba.', 'abbbbbbbbbba', 'abbbbbbbbbba', '.aabbbbbbaa.', '..abbbbbba..', '..abbbbbba..', '..abbbbbba..', '..abbbbbba..', '..aaaaaaaa..'],
  bag: ['....aaaa....', '...a....a...', '..aaaaaaaa..', '.abbbbbbbba.', '.abbccccbba.', '.abbcddcbba.', '.abbbbbbbba.', '.abbbbbbbba.', '.abbbbbbbba.', '..aaaaaaaa..'],
  literature: ['.aaaaaaaa...', '.abbbbbbba..', '.abccccbba..', '.abbbbbbba..', '.abccccbba..', '.abbbbbbba..', '.abbbbbbba..', '.abbbbbbba..', '.aaaaaaaaa..', '..ddddddd...'],
  electronics: ['.aaaaaaaaaa.', '.abbbbbbbba.', '.abccccccba.', '.abccccccba.', '.abccccccba.', '.abbbbbbbba.', '.abdbdbdbba.', '.abbbbbbbba.', '.aaaaaaaaaa.', '............'],
  key: ['............', '..aaa.......', '.abbba......', '.ab.bbaaaaa.', '.abbba..a.a.', '..aaa.......', '............'],
  light: ['............', '.aaaaa......', 'abbbbbaaaa..', 'abbbbbbcccd.', 'abbbbbbcccd.', 'abbbbbaaaa..', '.aaaaa......'],
  obj: ['..aaaaaaaa..', '.abbbbbbbba.', '.abccccccba.', '.abbbbbbbba.', '.abccccccba.', '.abbbbbbbba.', '.abccccccba.', '.abbbbbbbba.', '.aaaaaaaaaa.', '.a........a.'],
  misc: ['....aaaa....', '..aabbbbaa..', '.abbbbbbbba.', '.accbbbbcca.', '.acccbbccca.', '.acccccccca.', '.acccccccca.', '..aacccaa...', '....aaaa....'],
};
const CAT_PAL: Record<string, Record<string, number>> = {
  food: { a: 0x8a8a7c, b: 0xd8d8c8, c: 0x5a5a50, d: 0xc8402a, e: 0xf0d050 },
  drink: { a: 0x2a5a8a, b: 0x7ac0f0, c: 0x3a6a9a, d: 0x8ad0ff, e: 0xe0f4ff },
  medical: { a: 0x8a8a7c, b: 0xf0f0e8, c: 0xd8302a },
  weapon: { a: 0xe0e4e8, b: 0x8a9098, c: 0x5a3a20, d: 0x3a2410 },
  tool: { a: 0x5a5e64, b: 0xa8b0b8, c: 0xc8402a },
  clothing: { a: 0x3a4a6a, b: 0x6a80a8 },
  bag: { a: 0x3a3020, b: 0x7a6040, c: 0x5a4830, d: 0xc8a050 },
  literature: { a: 0x5a1a14, b: 0xa8402a, c: 0xe8d8b0, d: 0xe8e0c8 },
  electronics: { a: 0x2a2c30, b: 0x4a4e54, c: 0x6dff8e, d: 0xc8c8c8 },
  key: { a: 0x8a6a20, b: 0xe0c050 },
  light: { a: 0x3a3c40, b: 0x6a6e74, c: 0xfff0a0, d: 0xffffe0 },
  obj: { a: 0x3a3020, b: 0x7a6040, c: 0x5a4830 },
  misc: { a: 0x5a5040, b: 0xb0a080, c: 0x8a7a5a },
};
function fallbackIcon(key: string, size: number, variant: string): string {
  let cat: string = 'misc';
  if (variant === 'obj') cat = 'obj';
  else if (hasItemDef(key)) { const c = itemDef(key).cat; cat = CAT_GLYPH[c] ? c : c === 'ammo' || c === 'material' || c === 'fuel' ? 'misc' : c === 'seed' ? 'food' : 'misc'; }
  const g0 = CAT_GLYPH[cat as ItemCat] || CAT_GLYPH.misc!;
  // the glyph grown to the icon (EPX, so its curves stay smooth) and lit like the painted kit
  const k = Math.max(1, Math.floor((size - 3) / 12));
  const g = upscaleRows(g0, k);
  const gw = Math.max(...g.map((r) => r.length));
  const pc = new PixelCanvas(size, size); pc.wrap = false;
  const st = rowsToCanvas(g, CAT_PAL[cat] || CAT_PAL.misc);
  pc.blit(st, Math.floor((size - gw) / 2), Math.floor((size - g.length) / 2));
  if (size >= 24) { shadeSprite(pc, { outline: 1, shadow: 0, seed: key.length }); return pcUrl(pc); }
  post(pc, variant === 'obj' ? '' : variant, key);
  return toUrl(pc);
}

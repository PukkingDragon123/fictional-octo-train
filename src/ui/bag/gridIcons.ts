import * as THREE from 'three';
import { G } from '../../game/G';
import { itemGeometry } from '../../items/itemMeshes';
import { worldMaterial, U } from '../../gfx/materials';
import { Item, hasItemDef } from '../../items/item';
import { PixelCanvas, mixHex } from '../../gfx/pixel';
import { iconVariant } from '../icons';
import { footprintOf } from '../../items/grid';

/**
 * Item art for the backpack grid: the item's real 3D model rendered into the
 * exact rectangle of its footprint, as if it lay in the bag on its biggest
 * face and you looked down at it with a slight tilt (a rifle lies on its
 * side, a book on its cover, a can on its flank). The render is 4x
 * supersampled, reduced with hard alpha, quantised to a small palette,
 * edge-lit and outlined like the square icons in src/ui/icons.ts.
 * Cached per item kind, state, footprint and cell size.
 */
const cache = new Map<string, string>();
const SS = 4;

export function gridIcon(it: Item, cell: number): string {
  const [w, h] = footprintOf(it);
  return gridIconFor(it.key, iconVariant(it), w * cell, h * cell);
}

export function gridIconFor(key: string, variant: string, W: number, H: number): string {
  const ck = key + '|' + variant + '|' + W + 'x' + H;
  const hit = cache.get(ck);
  if (hit !== undefined) return hit;
  let url = '';
  try { url = render(key, variant, W, H); } catch (e) { console.warn('grid icon', key, e); }
  cache.set(ck, url);
  return url;
}

let rt: THREE.WebGLRenderTarget | null = null;
let rtW = 0, rtH = 0;
let scene: THREE.Scene | null = null;
let cam: THREE.OrthographicCamera | null = null;
let holder: THREE.Group | null = null;

function setup() {
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.5); key.position.set(-2.2, 3.6, 2.6); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9db4ff, 0.7); fill.position.set(3, 1.2, 1.5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(1.5, 2.5, -3.5); scene.add(rim);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
  holder = new THREE.Group();
  scene.add(holder);
}

const v = new THREE.Vector3();
const TILT = 0.38;

function render(key: string, variant: string, W: number, H: number): string {
  if (!hasItemDef(key)) return '';
  const g = itemGeometry(key);
  const r = G?.pr?.renderer as THREE.WebGLRenderer | undefined;
  if (!g || !r) return '';
  if (!g.boundingBox) g.computeBoundingBox();
  if (!scene) setup();
  const bb = g.boundingBox!;
  const size = new THREE.Vector3(); bb.getSize(size);
  const center = new THREE.Vector3(); bb.getCenter(center);
  // look along the item's thinnest axis: it lies on its biggest face
  const thin = size.x <= size.y && size.x <= size.z ? 'x' : size.y <= size.z ? 'y' : 'z';
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  if (thin === 'y') { dir.set(0, Math.cos(TILT), Math.sin(TILT)); up.set(0, 0, -1); if (size.z > size.x * 1.15) up.set(1, 0, 0); }
  else if (thin === 'z') dir.set(0, Math.sin(TILT), Math.cos(TILT));
  else dir.set(Math.cos(TILT), Math.sin(TILT), 0.18).normalize();
  const dist = Math.max(size.x, size.y, size.z) * 4 + 2;
  const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
  const n = posAttr.count, step = Math.max(1, Math.floor(n / 900));
  const camPos = dir.clone().multiplyScalar(dist);
  const project = (upv: THREE.Vector3) => {
    cam!.position.copy(camPos); cam!.up.copy(upv); cam!.lookAt(0, 0, 0); cam!.updateMatrixWorld(true);
    const inv = cam!.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += step) {
      v.fromBufferAttribute(posAttr, i).sub(center).applyMatrix4(inv);
      if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
    }
    return [x0, x1, y0, y1];
  };
  let box = project(up);
  // turn the camera so the long side of the picture runs along the long side of the footprint
  const longX = box[1] - box[0] >= box[3] - box[2];
  if (W !== H && longX !== W > H) {
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    up.copy(right);
    box = project(up);
  }
  const [x0, x1, y0, y1] = box;
  const pw = Math.max(1e-4, x1 - x0), phh = Math.max(1e-4, y1 - y0);
  // fit inside the rectangle with one pixel for the outline (a little more for tiny cells)
  const pad = W <= 14 || H <= 14 ? 1 : 2;
  const s = Math.min((W - pad * 2) / pw, (H - pad * 2) / phh);
  const halfW = W / s / 2, halfH = H / s / 2;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  cam!.left = mx - halfW; cam!.right = mx + halfW; cam!.bottom = my - halfH; cam!.top = my + halfH;
  cam!.near = 0.001; cam!.far = dist * 3;
  cam!.updateProjectionMatrix();
  const RW = W * SS, RH = H * SS;
  if (!rt || rtW !== RW || rtH !== RH) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rtW = RW; rtH = RH;
  }
  const mesh = new THREE.Mesh(g, worldMaterial({ noVis: true, noFog: true, noGrid: true }));
  mesh.position.copy(center).multiplyScalar(-1);
  holder!.add(mesh);
  const u = U as any;
  const keys = ['uCutOn', 'uVisOn', 'uFogNear', 'uFogFar', 'uGridScale', 'uCollapse', 'uSnapOn', 'uWetness'];
  const want: Record<string, number> = { uCutOn: 0, uVisOn: 0, uFogNear: 1e4, uFogFar: 2e4, uGridScale: 0, uCollapse: 0, uSnapOn: 0, uWetness: 0 };
  const saved: Record<string, any> = {};
  for (const k of keys) if (u[k] && typeof u[k].value === 'number') { saved[k] = u[k].value; u[k].value = want[k]; }
  const px = new Uint8Array(RW * RH * 4);
  const prevTarget = r.getRenderTarget();
  const prevClear = new THREE.Color(); r.getClearColor(prevClear); const prevAlpha = r.getClearAlpha();
  try {
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene!, cam!);
    r.readRenderTargetPixels(rt!, 0, 0, RW, RH, px);
  } finally {
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    for (const k of Object.keys(saved)) u[k].value = saved[k];
    holder!.remove(mesh);
  }
  const pc = reduce(px, W, H);
  post(pc, variant, key);
  return toUrl(pc);
}

const toS = (c: number) => { c /= 255; c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };

function reduce(px: Uint8Array, W: number, H: number): PixelCanvas {
  const RW = W * SS;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let n = 0, R = 0, Gg = 0, B = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const sx = x * SS + i, sy = (H - 1 - y) * SS + (SS - 1 - j);
      const k = (sy * RW + sx) * 4;
      if (px[k + 3] > 128) { n++; R += px[k]; Gg += px[k + 1]; B += px[k + 2]; }
    }
    if (n >= SS * SS * 0.4) pc.setRGBA(x, y, toS(R / n), toS(Gg / n), toS(B / n), 255);
  }
  const a = (x: number, y: number) => pc.alpha(x, y) > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nb = (a(x - 1, y) ? 1 : 0) + (a(x + 1, y) ? 1 : 0) + (a(x, y - 1) ? 1 : 0) + (a(x, y + 1) ? 1 : 0);
    if (!a(x, y) && nb >= 3) { const c = pc.get(x - 1, y) || pc.get(x + 1, y); pc.set(x, y, c); }
    else if (a(x, y) && nb === 0) pc.setRGBA(x, y, 0, 0, 0, 0);
  }
  return pc;
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const lum = (c: number) => { const [r, g, b] = rgb(c); return r * 0.3 + g * 0.59 + b * 0.11; };
function punch(c: number, k: number, contrast: number): number {
  let [r, g, b] = rgb(c);
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
  r = 128 + (r - 128) * contrast; g = 128 + (g - 128) * contrast; b = 128 + (b - 128) * contrast;
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}
function quantise(pc: PixelCanvas, k: number) {
  const cols: number[] = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y)) cols.push(pc.get(x, y));
  if (cols.length <= k) return;
  const sorted = [...cols].sort((a, b) => lum(a) - lum(b));
  let cent = Array.from({ length: k }, (_, i) => rgb(sorted[Math.floor((i + 0.5) / k * sorted.length)]));
  const asg = new Int32Array(cols.length);
  for (let it = 0; it < 6; it++) {
    const sum = cent.map(() => [0, 0, 0, 0]);
    cols.forEach((c, i) => {
      const [r, g, b] = rgb(c);
      let bi = 0, bd = Infinity;
      for (let j = 0; j < cent.length; j++) { const d = (r - cent[j][0]) ** 2 * 0.9 + (g - cent[j][1]) ** 2 * 1.2 + (b - cent[j][2]) ** 2 * 0.7; if (d < bd) { bd = d; bi = j; } }
      asg[i] = bi; sum[bi][0] += r; sum[bi][1] += g; sum[bi][2] += b; sum[bi][3]++;
    });
    cent = cent.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
  }
  let i = 0;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y)) { const c = cent[asg[i++]]; pc.setRGBA(x, y, Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255); }
}
function hash(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return ((h >>> 0) % 1000) / 1000; }

function post(pc: PixelCanvas, variant: string, key: string) {
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pc.alpha(x, y)) pc.set(x, y, punch(pc.get(x, y), 1.16, 1.08));
  const area = W * H;
  quantise(pc, area >= 2400 ? 20 : area >= 900 ? 16 : area >= 400 ? 12 : 9);
  if (variant === 'bloody') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pc.alpha(x, y)) { const q = hash(x >> 1, y >> 1, key.length) * 0.7 + hash(x, y, 3) * 0.3; if (q > 0.62) pc.set(x, y, q > 0.8 ? 0x5a0a08 : 0x8c1610); }
  } else if (variant === 'burnt') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pc.alpha(x, y)) pc.set(x, y, mixHex(pc.get(x, y), hash(x, y, 9) > 0.7 ? 0x0a0806 : 0x2a1a10, 0.6));
  } else if (variant === 'rotten') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pc.alpha(x, y)) pc.set(x, y, hash(x >> 1, y, 5) > 0.82 ? 0x3a4210 : mixHex(pc.get(x, y), 0x5a6a20, 0.35));
  } else if (variant === 'frozen') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pc.alpha(x, y)) pc.set(x, y, mixHex(pc.get(x, y), 0xcfe8ff, hash(x, y, 2) > 0.85 ? 0.8 : 0.3));
  } else if (variant === 'wet') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pc.alpha(x, y)) pc.set(x, y, mixHex(pc.get(x, y), 0x1a3050, 0.25));
  }
  const src = new Uint8ClampedArray(pc.data);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 0;
  const at = (x: number, y: number) => { const i = (y * W + x) * 4; return (src[i] << 16) | (src[i + 1] << 8) | src[i + 2]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!op(x, y)) continue;
    const c = at(x, y);
    if (!op(x, y - 1) || !op(x - 1, y)) pc.set(x, y, mixHex(c, 0xfff6e0, 0.22));
    else if (!op(x, y + 1) || !op(x + 1, y)) pc.set(x, y, mixHex(c, 0x000000, 0.22));
  }
  const src2 = new Uint8ClampedArray(pc.data);
  const opa = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src2[(y * W + x) * 4 + 3] > 0;
  const col = (x: number, y: number) => { const i = (y * W + x) * 4; return (src2[i] << 16) | (src2[i + 1] << 8) | src2[i + 2]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
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

function toUrl(pc: PixelCanvas): string {
  const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c.toDataURL();
}

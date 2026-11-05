// The collectibles' modelling kit: hand-pixelled surface textures painted once
// on small canvases (vinyl with mould seams and a gloss fleck, woven cloth,
// brushed steel, brass, grained wood, rubber, card stock), the shared faceted
// materials (flat shading, real roughness, nearest filtering, no mipmaps) and
// a builder that merges a model's parts per material with box-projected UVs
// and a per-facet tone (every face reads as its own hand-painted plane).
// Shapes come from the room's faceted kit (scene/facet.ts): chamfered hulls,
// few-sided lathes, bevelled extrusions, faceted tubes. Never a bare primitive.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PixelCanvas, makeRamp, bayer } from '../../../gfx/pixel';
import { Rng } from '../../../core/rng';
import { gfxSettings } from '../common';
import { cbox as cboxK } from '../scene/facet';

export { at, along, cbox, lathe, prism, extrude, ngon, tube, band, gem, bolt, hull, jitter, flat } from '../scene/facet';

export type DKey = 'vinyl' | 'gloss' | 'cloth' | 'metal' | 'brass' | 'wood' | 'rubber' | 'card' | 'glow' | 'glass' | 'holo';
export type DMats = Record<DKey, THREE.Material>;

/** metres per texture repeat (figures are small: fine pixels) */
const REP: Record<DKey, number> = { vinyl: 0.09, gloss: 0.09, cloth: 0.05, metal: 0.12, brass: 0.06, wood: 0.14, rubber: 0.06, card: 0.12, glow: 1, glass: 1, holo: 1 };

const hash = (a: number, b: number, c: number) => { const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };

export function pixTex(pc: PixelCanvas, repeat = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = pc.w; cv.height = pc.h;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return canvasTexture(cv, repeat);
}
export function canvasTexture(cv: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const pick = (ramp: number[], v: number, x: number, y: number) => {
  const f = Math.max(0, Math.min(0.999, v)) * (ramp.length - 1);
  let i = Math.floor(f);
  if (f - i > bayer(x, y)) i++;
  return ramp[Math.min(ramp.length - 1, i)];
};

// ------------------------------------------------------------------ painters (neutral: tinted by vertex colour)
function vinylPix(gloss: boolean): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N), rng = new Rng(gloss ? 'gloss' : 'vinyl');
  const ramp = makeRamp(0xd6d6d6, 6, { spread: gloss ? 0.34 : 0.26 });
  pc.fillRamp(ramp, (x, y) => 0.6 + (hash(x >> 2, y >> 2, 3) - 0.5) * 0.12 + (hash(x, y, 9) - 0.5) * 0.05, 0.7);
  // a faint mould seam and the odd fleck in the plastic
  for (let y = 0; y < N; y++) if (y % 7 !== 3) pc.blend(13, y, ramp[1], 0.35);
  for (let i = 0; i < 9; i++) pc.set(rng.int(0, N - 1), rng.int(0, N - 1), ramp[rng.chance(0.5) ? 1 : 2]);
  // the gloss: short 1px highlight strokes
  for (let i = 0; i < (gloss ? 6 : 3); i++) { const x = rng.int(0, N - 4), y = rng.int(0, N - 2); pc.set(x, y, 0xffffff); pc.set(x + 1, y, ramp[5]); if (gloss) pc.set(x + 2, y + 1, ramp[5]); }
  return pc;
}
function clothPix(): PixelCanvas {
  const N = 16, pc = new PixelCanvas(N, N);
  const ramp = makeRamp(0xc8c8c8, 6, { spread: 0.42 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const weave = ((x + y) & 1) ? 0.06 : -0.04;
    const rib = (y % 4 === 0) ? -0.1 : 0;
    pc.set(x, y, pick(ramp, 0.58 + weave + rib + (hash(x, y, 4) - 0.5) * 0.1, x, y));
  }
  for (let x = 0; x < N; x += 2) pc.blend(x, 15, ramp[1], 0.5); // a stitched seam
  return pc;
}
function metalPix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N), rng = new Rng('dmetal');
  const ramp = makeRamp(0xb4b8bc, 6, { spread: 0.45, hueShift: 0.02 });
  pc.fillRamp(ramp, (x, y) => 0.55 + (hash(0, y, 7) - 0.5) * 0.2 + (hash(x >> 3, y, 2) - 0.5) * 0.08, 0.6);
  for (let i = 0; i < 6; i++) { const x = rng.int(0, N - 1), y = rng.int(0, N - 1), l = rng.int(3, 9); for (let k = 0; k < l; k++) pc.set(x + k, y + (k > l / 2 ? 1 : 0), ramp[k % 3 === 0 ? 5 : 4]); }
  for (let i = 0; i < 5; i++) pc.set(rng.int(0, N - 1), rng.int(0, N - 1), ramp[1]);
  return pc;
}
function brassPix(): PixelCanvas {
  const N = 16, pc = new PixelCanvas(N, N), rng = new Rng('dbrass');
  const ramp = makeRamp(0xd0d0d0, 6, { spread: 0.55 });
  pc.fillRamp(ramp, (x, y) => 0.6 + (hash(x >> 1, y >> 2, 5) - 0.5) * 0.25, 0.8);
  for (let i = 0; i < 4; i++) pc.set(rng.int(0, N - 1), rng.int(0, N - 1), 0x707a60);
  pc.set(3, 2, 0xffffff); pc.set(4, 2, ramp[5]);
  return pc;
}
function woodPix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N);
  const ramp = makeRamp(0xc8c8c8, 6, { spread: 0.5 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ring = Math.sin((x + Math.sin(y * 0.35) * 2.2 + hash(0, y >> 3, 1) * 3) * 0.9);
    pc.set(x, y, pick(ramp, 0.5 + ring * 0.16 + (hash(x, y, 6) - 0.5) * 0.08, x, y));
  }
  for (let y = 0; y < N; y++) pc.blend(9, y, ramp[1], 0.4);
  pc.ellipse(22, 12, 2, 3, ramp[1]); pc.set(22, 12, ramp[0]);
  return pc;
}
function rubberPix(): PixelCanvas {
  const N = 16, pc = new PixelCanvas(N, N);
  const ramp = makeRamp(0xb0b0b0, 5, { spread: 0.3 });
  pc.fillRamp(ramp, (x, y) => 0.5 + (hash(x, y, 8) - 0.5) * 0.2 + ((x + y * 3) % 5 === 0 ? -0.15 : 0), 0.6);
  return pc;
}
function cardPix(): PixelCanvas {
  const N = 32, pc = new PixelCanvas(N, N);
  const ramp = makeRamp(0xe0e0e0, 5, { spread: 0.22 });
  pc.fillRamp(ramp, (x, y) => 0.62 + (hash(x, y, 12) - 0.5) * 0.14 + (hash(x >> 2, y >> 1, 3) - 0.5) * 0.08, 0.7);
  return pc;
}

// ------------------------------------------------------------------ materials
let cache: { low: boolean; mats: DMats; refs: number } | null = null;
export function lowQuality(): boolean {
  try {
    const q = gfxSettings().quality;
    const coarse = matchMedia('(pointer: coarse)').matches;
    return q === 'low' || (q === 'auto' && coarse);
  } catch { return false; }
}
/** the shared collectible materials (ref-counted) */
export function decoMats(low = lowQuality()): DMats {
  if (cache && cache.low === low) { cache.refs++; return cache.mats; }
  const tex: Partial<Record<DKey, THREE.Texture>> = {
    vinyl: pixTex(vinylPix(false)), gloss: pixTex(vinylPix(true)), cloth: pixTex(clothPix()), metal: pixTex(metalPix()), brass: pixTex(brassPix()),
    wood: pixTex(woodPix()), rubber: pixTex(rubberPix()), card: pixTex(cardPix()),
  };
  const PBR: Partial<Record<DKey, [number, number]>> = {
    vinyl: [0, 0.42], gloss: [0, 0.22], cloth: [0, 0.9], metal: [0.6, 0.38], brass: [0.7, 0.3], wood: [0, 0.6], rubber: [0, 0.85], card: [0, 0.8],
  };
  const mats = {} as DMats;
  for (const k of Object.keys(tex) as DKey[]) {
    const [metalness, roughness] = PBR[k] ?? [0, 0.7];
    const lift = k === 'metal' || k === 'brass' ? 1.4 : 1;
    mats[k] = low
      ? new THREE.MeshLambertMaterial({ map: tex[k], vertexColors: true, flatShading: true, color: new THREE.Color(lift, lift, lift) })
      : new THREE.MeshStandardMaterial({ map: tex[k], vertexColors: true, flatShading: true, metalness, roughness });
  }
  mats.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  mats.glass = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.2, roughness: 0.08, metalness: 0.1, flatShading: true, depthWrite: false });
  mats.holo = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  cache = { low, mats, refs: 1 };
  return mats;
}
export function releaseDecoMats() {
  if (!cache || --cache.refs > 0) return;
  for (const m of Object.values(cache.mats)) { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }
  cache = null;
}

/** a textured material for one printed picture (posters, labels, rugs); cached by key */
const printed = new Map<string, THREE.Material>();
export function printMat(key: string, paint: () => HTMLCanvasElement | PixelCanvas, o: { glow?: boolean; rough?: number; alpha?: boolean } = {}): THREE.Material {
  let m = printed.get(key);
  if (m) return m;
  const src = paint();
  const tex = src instanceof PixelCanvas ? pixTex(src, false) : canvasTexture(src);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  m = o.glow
    ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: !!o.alpha, alphaTest: o.alpha ? 0.5 : 0 })
    : lowQuality()
      ? new THREE.MeshLambertMaterial({ map: tex, flatShading: true, transparent: !!o.alpha, alphaTest: o.alpha ? 0.5 : 0 })
      : new THREE.MeshStandardMaterial({ map: tex, flatShading: true, roughness: o.rough ?? 0.75, metalness: 0, alphaTest: o.alpha ? 0.5 : 0 });
  printed.set(key, m);
  return m;
}

// ------------------------------------------------------------------ builder
export interface AddOpts { rep?: number; grain?: 'x' | 'y' | 'z'; tone?: number; seed?: number; uv0?: [number, number] }
let seedN = 1;

/** merges parts per material; `print` parts keep their own 0..1 UVs (a picture on a face) */
export class DecoBuilder {
  private parts = new Map<DKey, THREE.BufferGeometry[]>();
  private prints: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  /** add a part: geometry (consumed), colour, transform */
  add(key: DKey, g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4, o: AddOpts = {}) {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const n = p.count;
    const seed = o.seed ?? seedN++;
    const rep = o.rep ?? REP[key];
    const grain = o.grain ?? 'y';
    const uv = new Float32Array(n * 2), toneF = new Float32Array(n);
    const tone = o.tone ?? 0.12;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3(), e = new THREE.Vector3();
    const ou = o.uv0 ? o.uv0[0] : hash(seed, 1, 2), ov = o.uv0 ? o.uv0[1] : hash(seed, 3, 4);
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      nn.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
      const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
      const dom = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
      const rest = (['x', 'y', 'z'] as const).filter((k) => k !== dom);
      let uA: 'x' | 'y' | 'z', vA: 'x' | 'y' | 'z';
      if (rest.includes(grain)) { vA = grain; uA = rest.find((k) => k !== grain)!; } else { uA = rest[0]; vA = rest[1]; }
      const flip = (dom === 'x' ? nn.x : dom === 'y' ? nn.y : nn.z) < 0 ? -1 : 1;
      const t = 1 + (hash(Math.round(nn.x * 9), Math.round(nn.y * 9), Math.round(nn.z * 9) + seed) - 0.5) * tone * 2;
      for (let k = 0; k < 3; k++) {
        const v = k === 0 ? a : k === 1 ? b : c;
        uv[(i + k) * 2] = (v[uA] * flip) / rep + ou;
        uv[(i + k) * 2 + 1] = v[vA] / rep + ov;
        toneF[i + k] = t;
      }
    }
    if (m) geo.applyMatrix4(m);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const col = new Float32Array(n * 3), cc = new THREE.Color(color);
    for (let i = 0; i < n; i++) { const f = toneF[i]; col[i * 3] = cc.r * f; col[i * 3 + 1] = cc.g * f; col[i * 3 + 2] = cc.b * f; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    let list = this.parts.get(key);
    if (!list) { list = []; this.parts.set(key, list); }
    list.push(geo);
    return this;
  }
  /** a printed picture on a flat card: w x h (XY, facing +Z), thickness d; the picture covers the front face */
  print(mat: THREE.Material, w: number, h: number, d: number, m?: THREE.Matrix4, back = 0x2a2620) {
    // the card's body (edges and back) in card stock, the face with the picture
    this.add('card', cboxRaw(w, h, Math.max(0.001, d * 0.9)), back, m, { tone: 0.05 });
    const g = new THREE.PlaneGeometry(w * 0.985, h * 0.985);
    g.translate(0, 0, d / 2 + 0.0006);
    if (m) g.applyMatrix4(m);
    this.prints.push({ geo: g, mat });
    return this;
  }
  get empty() { return this.parts.size === 0 && this.prints.length === 0; }
  build(mats: DMats, shadows = true): THREE.Group {
    const g = new THREE.Group();
    for (const [k, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[k]);
      mesh.name = k;
      const lit = k !== 'glow' && k !== 'glass' && k !== 'holo';
      mesh.castShadow = lit && shadows; mesh.receiveShadow = lit;
      if (k === 'glass' || k === 'holo') mesh.renderOrder = 2;
      g.add(mesh);
    }
    for (const p of this.prints) { const mesh = new THREE.Mesh(p.geo, p.mat); mesh.name = 'print'; mesh.receiveShadow = true; g.add(mesh); }
    this.parts.clear(); this.prints = [];
    return g;
  }
}

/** a lightly chamfered box for a card's body */
function cboxRaw(w: number, h: number, d: number) { return cboxK(w, h, d, Math.min(w, h, d) * 0.3); }

/** a PixelCanvas painted by a function, handy for printed art */
export function paintPix(w: number, h: number, fn: (pc: PixelCanvas, rng: Rng) => void, seed = 'p'): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  pc.wrap = false;
  fn(pc, new Rng(seed));
  return pc;
}
export { PixelCanvas, makeRamp, Rng };

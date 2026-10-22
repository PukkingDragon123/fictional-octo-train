// Shared pieces for the first-person close-ups of src/craft and the iron cube
// (src/ui/inventory.ts): materials, item meshes fitted into cells, the
// survivor's forearms and hands, tweens, pixel particles and a little shake.
import * as THREE from 'three';
import { fbox } from '../ui/touch/facet';
import { worldMaterial } from '../gfx/materials';
import { itemGeometry } from '../items/itemMeshes';
import { ORIENT, type Rot } from '../items/grid';
import { G } from '../game/G';
import { fpArm, type FpArm, type HandPose } from '../fp/hands';

export const fpMat = () => worldMaterial({ noVis: true, noFog: true, noGrid: true });
export const fpGlow = () => worldMaterial({ noVis: true, noFog: true, noGrid: true, unlit: true });

// ---------------------------------------------------------------- easing / tweens
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

interface Tw { t: number; dur: number; fn: (k: number) => void; ease: (t: number) => number; done?: () => void; delay: number }
export class Tweens {
  private list: Tw[] = [];
  add(dur: number, fn: (k: number) => void, ease: (t: number) => number = easeOut, done?: () => void, delay = 0) {
    this.list.push({ t: 0, dur: Math.max(1e-3, dur), fn, ease, done, delay });
  }
  get busy() { return this.list.length > 0; }
  clear() { this.list.length = 0; }
  /** run every tween to its end at once */
  finish() { const l = this.list; this.list = []; for (const w of l) { w.fn(w.ease(1)); w.done?.(); } }
  update(dt: number) {
    if (!this.list.length) return;
    const l = this.list;
    for (let i = 0; i < l.length; i++) {
      const w = l[i];
      if (w.delay > 0) { w.delay -= dt; if (w.delay > 0) continue; }
      w.t += dt;
      const k = clamp01(w.t / w.dur);
      w.fn(w.ease(k));
      if (k >= 1) { l.splice(i, 1); i--; w.done?.(); }
    }
  }
}

// ---------------------------------------------------------------- item meshes fitted into cells
interface Align { q: THREE.Quaternion; center: THREE.Vector3; base: [number, number, number] }
const alignCache = new Map<string, Align | null>();
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

/**
 * How a model is laid into its box: longest side along the rows (z),
 * the middle one across (x), the thinnest up (y). base = model sizes
 * along [w, l, t] after that.
 */
export function itemAlign(key: string): Align | null {
  let a = alignCache.get(key);
  if (a !== undefined) return a;
  const g = itemGeometry(key);
  if (!g) { alignCache.set(key, null); return null; }
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!;
  const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.max(0.004, v));
  const order = [0, 1, 2].sort((i, j) => size[j] - size[i]); // L, M, S
  const [L, M, S] = order;
  const img: THREE.Vector3[] = [];
  img[L] = new THREE.Vector3(0, 0, 1); img[M] = new THREE.Vector3(1, 0, 0); img[S] = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().makeBasis(img[0], img[1], img[2]);
  if (m.determinant() < 0) { img[M].negate(); m.makeBasis(img[0], img[1], img[2]); }
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  a = { q, center: b.getCenter(new THREE.Vector3()), base: [size[M], size[L], size[S]] };
  alignCache.set(key, a);
  return a;
}

const orientQ: THREE.Quaternion[] = [];
const BASE_VEC = [AX[0], AX[2], AX[1]]; // base axes w, l, t in the aligned frame
/** rotation taking an aligned model to grid orientation rot (grid x -> X, rows -> Z, layers -> Y) */
export function orientQuat(rot: Rot): THREE.Quaternion {
  if (orientQ[rot]) return orientQ[rot];
  const o = ORIENT[rot];
  const A = new THREE.Matrix4().makeBasis(BASE_VEC[o[0]], BASE_VEC[o[2]], BASE_VEC[o[1]]);
  const tx = new THREE.Vector3(1, 0, 0);
  let B = new THREE.Matrix4().makeBasis(tx, AX[1], AX[2]);
  let R = B.clone().multiply(A.clone().transpose());
  if (R.determinant() < 0) { tx.negate(); B = new THREE.Matrix4().makeBasis(tx, AX[1], AX[2]); R = B.multiply(A.transpose()); }
  orientQ[rot] = new THREE.Quaternion().setFromRotationMatrix(R);
  return orientQ[rot];
}

export interface ItemObj { outer: THREE.Group; mesh: THREE.Mesh | null; key: string }
/** an unknown item: a chamfered, faceted crate shape (never a raw cube) */
const fallbackGeo = fbox(1, 1, 1, 0.18);
/** an item model wrapped for fitting: position/scale/quaternion go on `outer` */
export function makeItemObj(key: string, mat?: THREE.Material): ItemObj {
  const outer = new THREE.Group();
  const mid = new THREE.Group();
  outer.add(mid);
  const a = itemAlign(key);
  const g = itemGeometry(key);
  let mesh: THREE.Mesh;
  if (g && a) {
    mesh = new THREE.Mesh(g, mat || fpMat());
    mesh.position.copy(a.center).negate();
    mid.quaternion.copy(a.q);
  } else {
    mesh = new THREE.Mesh(fallbackGeo, mat || new THREE.MeshLambertMaterial({ color: 0x9a9080, flatShading: true }));
    mesh.scale.set(0.1, 0.05, 0.14);
  }
  mid.add(mesh);
  outer.userData.key = key;
  return { outer, mesh, key };
}

/** fit an item model into a box bx (x) * by (rows, z) * bz (layers, y) scene units big, with a margin */
export function fitItemObj(o: ItemObj, rot: Rot, bx: number, by: number, bz: number, maxScale = 1.25) {
  const a = itemAlign(o.key);
  o.outer.quaternion.copy(orientQuat(rot));
  if (!a) { o.outer.scale.setScalar(Math.min(bx, by, bz) * 4); return; }
  const ori = ORIENT[rot];
  const sx = bx / a.base[ori[0]], sz = by / a.base[ori[1]], sy = bz / a.base[ori[2]];
  o.outer.scale.setScalar(Math.min(maxScale, Math.min(sx, sy, sz) * 0.88));
}

// ---------------------------------------------------------------- forearms and hands
/**
 * The survivor's arms in a close-up: the shared smooth arms (src/fp/hands.ts),
 * laid from a shoulder-side anchor (`elbow`, off the bottom of the frame) so
 * the wrist lands on `target`; `want` is the hand pose, `roll` turns the palm.
 */
export interface Arm { fp: FpArm; root: THREE.Group; side: 1 | -1; elbow: THREE.Vector3; target: THREE.Vector3; want: HandPose; scale: number }
const FOREARM_LEN = 0.26;

export function makeArm(side: 1 | -1, scale = 1.25): Arm {
  const p: any = G.local;
  const skin = p?.app?.skin ?? 0xe8b98f;
  const fp = fpArm(side === 1 ? 'right' : 'left', { skin, sleeve: 0xeeb415, sleeveStyle: p?.app?.suit?.sleeves === 'rolled' ? 'rolled' : 'long', scale });
  return { fp, root: fp.root, side, elbow: new THREE.Vector3(side * 0.42, -0.62, -0.9), target: new THREE.Vector3(side * 0.2, -0.2, -1.2), want: 'relaxed', scale };
}

const _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _rq = new THREE.Quaternion();
const lastPose = new WeakMap<Arm, HandPose>();
/** lay the forearm toward the target (wrist on it), turn the palm by roll, ease the hand into its pose */
export function poseArm(a: Arm, roll = 0, dt = 1 / 60) {
  _d.subVectors(a.target, a.elbow).normalize();
  a.root.position.copy(a.target).addScaledVector(_d, -FOREARM_LEN * a.scale);
  a.root.quaternion.setFromUnitVectors(_up, _d).multiply(_rq.setFromAxisAngle(_up, roll * a.side));
  if (lastPose.get(a) !== a.want) { lastPose.set(a, a.want); a.fp.pose(a.want); }
  a.fp.update(dt);
}

/** hold an item model in a hand: handle across the palm, head out past the thumb */
export function holdInGrip(a: Arm, o: ItemObj, length = 0.16) {
  a.fp.grip.add(o.outer);
  o.outer.position.set(0, 0, 0);
  o.outer.rotation.set(0, Math.PI / 2, 0);
  o.outer.position.x = -length * 0.28 * (a.side === 1 ? 1 : -1);
}

// ---------------------------------------------------------------- pixel particles
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private base: Float32Array;
  private next = 0;
  constructor(public n = 160, additive = true, size = 3) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
  /** spray k particles from a point (local space of the points' parent) */
  emit(x: number, y: number, z: number, k: number, color: number, speed = 1, up = 0.6, spread = 1) {
    const r = ((color >> 16) & 255) / 255, gg = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    for (let j = 0; j < k; j++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * speed;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s * spread; this.vel[i * 3 + 1] = (up + Math.random() * 0.6) * speed; this.vel[i * 3 + 2] = Math.sin(a) * s * spread;
      const f = 0.75 + Math.random() * 0.25;
      this.base[i * 3] = r * f; this.base[i * 3 + 1] = gg * f; this.base[i * 3 + 2] = b * f;
      this.life[i] = 0.35 + Math.random() * 0.45;
    }
  }
  update(dt: number, gravity = 2.2) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) { this.pos[k + 1] = -999; continue; }
      this.vel[k + 1] -= gravity * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = Math.min(1, this.life[i] * 2.5);
      this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
    }
    if (any) { (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
  }
}

// ---------------------------------------------------------------- a shared backdrop
let backTex: THREE.Texture | null = null;
/** what is behind a close-up: the room gone dark and soft, warm carpet light at the bottom */
export function makeBackdrop(): THREE.Mesh {
  if (!backTex) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const x = c.getContext('2d')!;
    const gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#0b0b0d'); gr.addColorStop(0.55, '#141310'); gr.addColorStop(0.8, '#3a3018'); gr.addColorStop(1, '#5a4a20');
    x.fillStyle = gr; x.fillRect(0, 0, 4, 64);
    backTex = new THREE.CanvasTexture(c);
    backTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: backTex, transparent: true, opacity: 0, depthWrite: false }));
  m.position.set(0, 0, -6);
  m.scale.set(12, 7, 1);
  m.renderOrder = -10;
  return m;
}

/** a unit box outline (for hover / ghost / cut guides) */
let edgeGeo: THREE.BufferGeometry | null = null;
export function boxEdges(color: number, opacity = 1): THREE.LineSegments {
  if (!edgeGeo) edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  return new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false }));
}

/** pointer -> ray in overlay-camera space */
const _ndc = new THREE.Vector2();
export function pointerRay(rc: THREE.Raycaster, cam: THREE.Camera, x: number, y: number) {
  _ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  rc.setFromCamera(_ndc, cam);
  return rc.ray;
}

// Dead units for the remains kit (./kit.ts rm_unit), built on the one human
// base: a HumanRig (src/entities/humanRig.ts) in the Remittance hazmat suit,
// its own painter laying the blood, the dirt and the pallor (RigCondition),
// limbs dropped and capped by its own severing, posed dead, then frozen into
// static prop geometry the way the Still Life replicas are (kit/replica.ts
// bakeReplica): skinned vertices through the posed bones, the texture page
// copied into an atlas slot. The gore on top (the opened chest, the gut, the
// torn suit flaps) is added by the prop around the bone positions this returns.
import * as THREE from 'three';
import { HumanRig, randomAppearance, type Outfit, type Pose } from '../../entities/humanRig';
import { PAGE } from '../../entities/humanModel';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { Rng } from '../../core/rng';

const SLOTS = 3, PX = 128;
export const unitTex = (v: number) => 'rm_unit_page_' + (((v % SLOTS) + SLOTS) % SLOTS);
addTextureModule(() => { const A = atlas(); for (let i = 0; i < SLOTS; i++) A.add(unitTex(i), PX, PX, (pc) => { pc.wrap = false; pc.fill(0xc8a050); }); });

const HAZ = 0xe8c228;
/** the suit, bloodied and worn through; the body under it pale, filthy, cut where the parts were taken */
function deadOutfit(v: number): Outfit {
  const suit = { tex: 'c_hazmat', color: HAZ, sleeve: 'long' as const, item: 'hazmat_suit', blood: 1, wear: 0.85 };
  const sev = v === 1 ? ['shin_l', 'shin_r'] : v === 2 ? ['thigh_l', 'thigh_r'] : [];
  return {
    torso: suit, legs: { ...suit }, legsKind: 'pants',
    feet: { tex: 'c_hazmat', color: 0x1e201e, item: 'hazmat_suit' }, hands: { tex: 'c_hazmat', color: 0x222422, item: 'hazmat_suit' },
    cond: {
      blood: { torso_u: 3, torso_l: 3, head: 2, neck: 3, uarm_l: 2, uarm_r: 1, farm_l: 2, hand_l: 3, hand_r: 2, thigh_l: 2, thigh_r: 3, groin: 2 },
      pale: 3, dirt: 3, wet: 1, expr: v === 1 ? 'pain' : 'fear',
      sev, stump: Object.fromEntries(sev.map((s) => [s, { s: 'raw' }])) as any,
    },
  };
}
/** sprawled where it fell: on its back, face down, or the top half on its back */
function deadPose(v: number): Pose {
  const P: Pose = { gripL: 0.55, gripR: 0.2, blink: 0 };
  const J = (k: keyof Pose, x: number, y = 0, z = 0) => { (P as any)[k] = [x, y, z]; };
  P.bodyPitch = v === 1 ? 1.5708 : -1.5708; P.bodyY = 0.12;
  J('uarmL', -0.3, 0.2, 1.1); J('farmL', -0.9, 0, 0); J('handL', 0.3, 0, 0.4);
  J('uarmR', 0.2, 0, -0.35); J('farmR', -0.25, 0, 0); J('handR', 0, 0, -0.2);
  J('thighL', -0.15, 0, 0.18); J('shinL', 0.35, 0, 0); J('footL', 0.6, 0.4, 0);
  J('thighR', 0.05, 0, -0.08); J('shinR', 0.1, 0, 0); J('footR', 0.7, -0.3, 0);
  J('spine', v === 1 ? 0.08 : -0.05, 0.1, 0); J('chest', 0, 0.05, 0.05);
  J('neck', v === 1 ? 0.2 : -0.25, 0.4, 0); J('head', v === 1 ? 0 : -0.2, 0.55, 0.25);
  return P;
}

const RIGS = new Map<number, HumanRig>();
const PAINTED = new Set<number>();
function rigFor(v: number): HumanRig {
  let hr = RIGS.get(v);
  if (hr) return hr;
  const rng = new Rng(9100 + v * 37);
  hr = new HumanRig(randomAppearance(() => rng.next()));
  hr.setOutfit(deadOutfit(v));
  hr.faceAnim = false;
  RIGS.set(v, hr);
  return hr;
}
/** a 256 page down to 128, keeping one-pixel features (eyes, seams) an average would lose */
function downsample(src: Uint8Array, out: Uint8Array | Uint8ClampedArray) {
  const S = PAGE, k = S / PX;
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    let r = 0, g = 0, b = 0, best = -1, bd = 34;
    const ids: number[] = [];
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = ((y * k + dy) * S + x * k + dx) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; ids.push(i); }
    r /= k * k; g /= k * k; b /= k * k;
    const L = r * 0.3 + g * 0.59 + b * 0.11;
    for (const i of ids) { const d = Math.abs(src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11 - L); if (d > bd) { bd = d; best = i; } }
    const o = (y * PX + x) * 4;
    if (best >= 0) { out[o] = src[best]; out[o + 1] = src[best + 1]; out[o + 2] = src[best + 2]; } else { out[o] = r; out[o + 1] = g; out[o + 2] = b; }
    out[o + 3] = 255;
  }
}

export interface BakedBody { chest: [number, number, number]; hips: [number, number, number]; head: [number, number, number]; handR: [number, number, number]; tris: number }
const _a = new THREE.Matrix4(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _n3 = new THREE.Matrix3();
/**
 * Freeze dead unit `v` into `mb`, laid along x (head toward -x) and centred
 * on the prop. Returns where the chest, hips, head and right hand ended up.
 */
export function bakeDeadUnit(mb: ModelBuilder, v: number): BakedBody | null {
  let hr: HumanRig;
  try { hr = rigFor(v); } catch (e) { console.warn('dead unit rig', e); return null; }
  hr.applyPose(deadPose(v));
  // force the page painted now (it waits for a first frame otherwise)
  (hr as any).ensurePainted?.();
  hr.root.updateMatrixWorld(true);
  if (!PAINTED.has(v)) {
    PAINTED.add(v);
    const src = (hr.skin.material as THREE.MeshLambertMaterial).map as THREE.DataTexture;
    try { atlas().repaint(unitTex(v), (pc) => { pc.wrap = false; downsample(src.image.data as Uint8Array, pc.data); }); } catch (e) { console.warn('dead unit page', e); }
  }
  const mesh = hr.skin, g = mesh.geometry;
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), UV = g.getAttribute('uv'), C = g.getAttribute('color');
  const SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight'), I = g.getIndex();
  if (!P || !SI || !SW || !I) return null;
  const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
  const mats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
  // the frame: rotate the body to lie along x, then centre its footprint on the prop
  const rot = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const n = P.count, pos = new Float32Array(n * 3);
  const box = new THREE.Box3();
  for (let i = 0; i < n; i++) {
    _a.elements.fill(0);
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > 0) { const e = mats[SI.getComponent(i, k)].elements, ae = _a.elements; for (let q = 0; q < 16; q++) ae[q] += e[q] * w; } }
    _v.fromBufferAttribute(P as THREE.BufferAttribute, i).applyMatrix4(_a).applyMatrix4(rot);
    pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    box.expandByPoint(_v);
  }
  const ctr = box.getCenter(new THREE.Vector3());
  const xf = new THREE.Matrix4().makeTranslation(-ctr.x, -box.min.y + 0.005, -ctr.z).multiply(rot);
  const nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3), atl = new Float32Array(n * 4), fx = new Float32Array(n * 2);
  const r = atlas().get(unitTex(v));
  for (let i = 0; i < n; i++) {
    pos[i * 3] -= ctr.x; pos[i * 3 + 1] += -box.min.y + 0.005; pos[i * 3 + 2] -= ctr.z;
    _a.elements.fill(0);
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > 0) { const e = mats[SI.getComponent(i, k)].elements, ae = _a.elements; for (let q = 0; q < 16; q++) ae[q] += e[q] * w; } }
    _m.multiplyMatrices(rot, _a);
    if (N) { _n3.getNormalMatrix(_m); _n.fromBufferAttribute(N as THREE.BufferAttribute, i).applyMatrix3(_n3).normalize(); nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z; } else nor[i * 3 + 1] = 1;
    uv[i * 2] = Math.min(0.9995, Math.max(0.0005, UV.getX(i))); uv[i * 2 + 1] = Math.min(0.9995, Math.max(0.0005, UV.getY(i)));
    col[i * 3] = C ? C.getX(i) : 1; col[i * 3 + 1] = C ? C.getY(i) : 1; col[i * 3 + 2] = C ? C.getZ(i) : 1;
    atl[i * 4] = r.u0; atl[i * 4 + 1] = r.v0; atl[i * 4 + 2] = r.du; atl[i * 4 + 3] = r.dv;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
  out.setAttribute('aFx', new THREE.BufferAttribute(fx, 2));
  out.setIndex(Array.from(I.array as ArrayLike<number>));
  mb.appendGeometry(out, new THREE.Matrix4());
  // the stump caps the rig hangs on its bones (its own limb-loss gear)
  hr.body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name !== 'limbgear' || !m.geometry) return;
    mb.appendGeometry(m.geometry, new THREE.Matrix4().multiplyMatrices(xf, m.matrixWorld));
  });
  const at = (b: THREE.Object3D): [number, number, number] => { _v.setFromMatrixPosition(b.matrixWorld).applyMatrix4(xf); return [_v.x, _v.y, _v.z]; };
  return { chest: at(hr.j.chest), hips: at(hr.j.hips), head: at(hr.j.head), handR: at(hr.j.handR), tris: I.count / 3 };
}

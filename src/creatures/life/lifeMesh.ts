// The user's creature software (src/creatures/life, ported from their own project) as rigs this game can drive:
// one sculpted geometry + painted page per species (cached), and per creature a skinned mesh with its own
// skeleton on this game's kit material (fog of war, outlines, hit flash and dissolve: src/creatures/kit/humanoids.ts),
// the ported Animator for gaits / feet / tails / jaws, and the bones exposed as rig parts so the shared
// layers (smooth.ts, the gore system, horror's twitches) can work on them. A cheap LOD skips the animator
// for creatures far away.
import * as THREE from 'three';
import type { Rig as GameRig } from '../species';
import { buildRig, type Rig as LifeRig, type V3 } from './morph';
import type { Design } from './design';
import { sculpt, type Ctx } from './sculpt';
import type { Page } from './kit';
import { Animator, type AnimIn } from './anim';
import { kitFx, kitMaterial, type KitFx } from '../kit/humanoids';

export interface LifeModel {
  key: string; rig: LifeRig; geo: THREE.BufferGeometry; tex: THREE.DataTexture; inverses: THREE.Matrix4[]; restWorld: V3[]; tris: number;
}
const MODELS = new Map<string, LifeModel>();

/**
 * The species model, built once: `post` runs after the sculptor has painted (and may add skinned geometry
 * through S.B and paint more onto S.page) before the page is padded and uploaded.
 */
export function lifeModel(key: string, d: Design, post?: (S: Ctx, page: Page) => void, tweak?: (rig: LifeRig) => void): LifeModel {
  const hit = MODELS.get(key);
  if (hit) return hit;
  const rig = buildRig(d);
  // (proportions the designer cannot express: longer forelegs, a heavier head)
  tweak?.(rig);
  const restWorld: V3[] = rig.bones.map(() => [0, 0, 0]);
  rig.bones.forEach((bn, i) => { const p = bn.parent >= 0 ? restWorld[bn.parent] : [0, 0, 0] as V3; restWorld[i] = [p[0] + bn.pos[0], p[1] + bn.pos[1], p[2] + bn.pos[2]]; });
  const { geo, tex, tris } = sculpt(d, rig, restWorld, post);
  // this game's world shader reads a few more attributes than the sculptor writes
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3).fill(1), atl = new Float32Array(n * 4), fx = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { atl[i * 4 + 2] = 1; atl[i * 4 + 3] = 1; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
  geo.setAttribute('aFx', new THREE.BufferAttribute(fx, 2));
  // the world shader reads v flipped (this game's kit pages put row 0 at v = 1)
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;
  geo.computeBoundingSphere();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const inverses = restWorld.map((p) => new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
  const m: LifeModel = { key, rig, geo, tex, inverses, restWorld, tris };
  MODELS.set(key, m);
  return m;
}

export interface LifeRigState { model: LifeModel; mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; anim: Animator; F: KitFx; m: Record<string, any>; lastT: number }
export interface LifeGameRig extends GameRig { life: LifeRigState }

/** a creature's rig: root > body (scaled to size) > skinned mesh, with the bones as named parts */
export function lifeRig(model: LifeModel, scale = 1, headY = 1): LifeGameRig {
  const bones = model.rig.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.set(b.pos[0], b.pos[1], b.pos[2]); return o; });
  model.rig.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  const F = kitFx();
  const mat = kitMaterial(model.tex, F);
  mat.alphaTest = 0.5;
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.SkinnedMesh(model.geo, mat);
  for (const b of bones) if (!b.parent) mesh.add(b);
  mesh.bind(new THREE.Skeleton(bones, model.inverses), new THREE.Matrix4());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  (mesh as any).clone = () => new THREE.Group();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(mesh);
  body.scale.setScalar(scale);
  const parts: Record<string, THREE.Object3D> = {};
  bones.forEach((b) => { if (!parts[b.name]) parts[b.name] = b; });
  const anim = new Animator(model.rig, bones, mesh);
  return { root, body, parts, headY, life: { model, mesh, bones, anim, F, m: {}, lastT: 0 } };
}

const _flat = (y: number) => () => y;
/** drive the ported Animator; far away it only poses every few frames */
export function lifeAnimate(rig: LifeGameRig, dt: number, inp: Partial<AnimIn> & { speed: number; state: AnimIn['state'] }, groundY: number, far = false) {
  const L = rig.life;
  L.lastT += dt;
  if (far && L.lastT < 0.12) return false;
  const step = Math.min(0.1, L.lastT);
  L.lastT = 0;
  L.anim.update(step, {
    speed: inp.speed, turn: inp.turn ?? 0, state: inp.state, act: inp.act ?? 0, lookYaw: inp.lookYaw ?? 0, lookPitch: inp.lookPitch ?? 0,
    ground: inp.ground ?? _flat(groundY), air: inp.air ?? 0,
  });
  L.F.fx.value.y += step;
  return true;
}

import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { itemDef } from './item';
import { DETAIL } from './detailModels';
import { DETAIL3 } from './detailModels3';
import { DETAIL4 } from './detailModels4';
// the art pass's models (wave 3) take over from the older entries for the same items; wave 4 is the farm (round 25)
Object.assign(DETAIL, DETAIL3, DETAIL4);
import { bakeLook } from './itemLook';
import { isSoftItem } from './softItems';

const geo = new Map<string, THREE.BufferGeometry | null>();
const closeGeo = new Map<string, THREE.BufferGeometry | null>();

/** the item's model into a builder: its hand-detailed version (src/items/detailModels.ts) when it has one */
function buildModel(mb: ModelBuilder, key: string) {
  const d = itemDef(key), det = DETAIL[key];
  if (det?.build) det.build(mb);
  else if (d.model) d.model(mb);
  else fallbackModel(mb, d.cat, d.tint ?? 0xb0a890);
  if (det?.add && !mb.isEmpty) {
    const g0 = mb.build(); g0.computeBoundingBox();
    det.add(mb, g0.boundingBox!.clone());
    g0.dispose();
  }
}

/** Cached geometry for an item's 3D model (real-world scale, resting on y=0) */
export function itemGeometry(key: string): THREE.BufferGeometry | null {
  let g = geo.get(key);
  if (g !== undefined) return g;
  const mb = new ModelBuilder();
  try { buildModel(mb, key); } catch (e) { console.error('item model', key, e); }
  g = mb.isEmpty ? null : mb.build();
  if (g) g.computeBoundingBox();
  geo.set(key, g);
  return g;
}

/**
 * The close-up version of an item's model (hands, pack, inspect): the same model in the same frame,
 * built in detail mode (every small part chamfered, rounder cylinders), without baked face shading
 * (real lights do it), tagged per vertex with its surface (metal, plastic, cloth, glass, paper,
 * organic...) and a baked contact occlusion. Draw it with itemCloseMat (src/items/itemLook.ts).
 */
export function itemCloseGeometry(key: string): THREE.BufferGeometry | null {
  let g = closeGeo.get(key);
  if (g !== undefined) return g;
  const mb = new ModelBuilder();
  mb.detail = true;
  mb.setFaceShading(false);
  try { buildModel(mb, key); } catch (e) { console.error('item close model', key, e); }
  g = mb.isEmpty ? null : mb.build();
  if (g) { g.computeBoundingBox(); try { bakeLook(g, key); } catch (e) { console.warn('item look', key, e); } }
  closeGeo.set(key, g);
  return g;
}

function fallbackModel(mb: ModelBuilder, cat: string, tint: number) {
  if (cat === 'food') mb.box(0, 0, 0, 0.12, 0.08, 0.08, 'cardboard', { color: tint });
  else if (cat === 'clothing') mb.box(0, 0, 0, 0.3, 0.06, 0.25, 'fabric_grey', { color: tint });
  else mb.box(0, 0, 0, 0.15, 0.1, 0.1, 'cardboard', { color: tint });
}

/** Mesh lying in the world (floor items) */
export function makeItemMesh(key: string): THREE.Mesh | null {
  const g = itemGeometry(key);
  if (!g) return null;
  const m = new THREE.Mesh(g, worldMaterial({}));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * Mesh oriented for holding in a hand: the item's longest axis is aligned with
 * the hand's -Y (an extension of the forearm) and the grip point placed in the
 * fist.
 */
export function makeHeldMesh(key: string): THREE.Object3D | null {
  const g = itemGeometry(key);
  if (!g) return null;
  const bb = g.boundingBox!;
  const size = new THREE.Vector3(); bb.getSize(size);
  const center = new THREE.Vector3(); bb.getCenter(center);
  const mesh = new THREE.Mesh(isSoftItem(key) ? flutterGeo(key, g) : g, worldMaterial({}));
  mesh.castShadow = true;
  const fl = mesh.geometry.userData.flutter as { tick(): void } | undefined;
  if (fl) mesh.onBeforeRender = () => fl.tick();
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(mesh);
  mesh.position.copy(center).multiplyScalar(-1);
  const long = size.x >= size.y && size.x >= size.z ? 'x' : size.z >= size.y ? 'z' : 'y';
  const L = Math.max(size.x, size.y, size.z);
  if (L > 0.22) {
    // rotate long axis onto -Y and slide so the grip (25% from one end) sits in the hand
    if (long === 'x') inner.rotation.z = Math.PI / 2;
    else if (long === 'z') inner.rotation.x = -Math.PI / 2;
    else inner.rotation.x = Math.PI;
    holder.add(inner);
    inner.position.y = -(L * 0.25);
  } else {
    holder.add(inner);
    inner.position.y = -0.03;
  }
  return holder;
}

/**
 * Paper and cloth in a hand flutter (the art pass, wave 3): a copy of the model whose far edge ripples
 * in the air, more the further it is from the fingers; the wave moves in whole frames, like a sprite.
 */
const flutterCache = new Map<string, THREE.BufferGeometry>();
/** one fluttering copy per item kind (every hand holding one shares it) */
function flutterGeo(key: string, g: THREE.BufferGeometry): THREE.BufferGeometry {
  let f = flutterCache.get(key);
  if (!f) { f = flutter(g); flutterCache.set(key, f); }
  return f;
}
function flutter(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.clone();
  const pos = c.getAttribute('position') as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  const bb = g.boundingBox!;
  const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z;
  const alongX = sx >= sz, L = Math.max(sx, sz, 1e-3);
  let last = -1;
  const holder = { tick: () => {
    const fr = Math.floor(performance.now() / 83);
    if (fr === last) return;
    last = fr;
    const t = fr / 12;
    const a = pos.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      const u = alongX ? (base[i] - bb.min.x) / L : (base[i + 2] - bb.min.z) / L;
      const w = (alongX ? (base[i + 2] - bb.min.z) : (base[i] - bb.min.x)) / L;
      a[i + 1] = base[i + 1] + Math.sin(t * 7 + u * 9 + w * 3) * 0.018 * L * u * u + Math.sin(t * 3.1 + w * 5) * 0.01 * L * u;
    }
    pos.needsUpdate = true;
  } };
  c.userData.flutter = holder;
  return c;
}

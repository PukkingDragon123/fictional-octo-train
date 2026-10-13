import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { itemDef } from './item';

const geo = new Map<string, THREE.BufferGeometry | null>();

/** Cached geometry for an item's 3D model (real-world scale, resting on y=0) */
export function itemGeometry(key: string): THREE.BufferGeometry | null {
  let g = geo.get(key);
  if (g !== undefined) return g;
  const d = itemDef(key);
  const mb = new ModelBuilder();
  try {
    if (d.model) d.model(mb);
    else fallbackModel(mb, d.cat, d.tint ?? 0xb0a890);
  } catch (e) { console.error('item model', key, e); }
  g = mb.isEmpty ? null : mb.build();
  if (g) g.computeBoundingBox();
  geo.set(key, g);
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
  const mesh = new THREE.Mesh(g, worldMaterial({}));
  mesh.castShadow = true;
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

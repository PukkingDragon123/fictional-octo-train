// PROPS FROM THE GAME'S OWN KITS (round 26, part B), for the facility's rooms and the stores: the world's furniture
// models (src/content/furniture, in the menu's light: no fog, no sight, no light grid), the Poly Haven lab props
// (public/props/lab via props/glb.ts, async) and the game's item models. Each is centred on its footprint and
// stands on y = 0; their geometries are shared caches (userData.shared: the map never disposes them).
import * as THREE from 'three';
import type { FMats } from '../../scene/pixtex';
import { objDef, objectGeometry } from '../../../../world/objects';
import type { TileObject } from '../../../../world/zone';
import { worldMaterial } from '../../../../gfx/materials';
import { makeItemMesh } from '../../../../items/itemMeshes';
import { loadProp } from '../../props/glb';

const URL_OF = (a: string) => `${import.meta.env.BASE_URL}props/lab/${a}.glb${import.meta.env.VITE_SANDBOXED ? '.txt' : ''}`;
export const lowOf = (mats: FMats) => !!(mats.paint as THREE.MeshLambertMaterial).isMeshLambertMaterial;
/** the world's material without the world's fog, sight and light grid (the menu's lights light it) */
export const menuWorldMat = () => worldMaterial({ noVis: true, noFog: true, noGrid: true });
/** an item model from the game (a weapon on a rack, a find in a case), in the menu's light */
export function itemModel(key: string): THREE.Mesh | null { const m = makeItemMesh(key); if (m) m.material = menuWorldMat(); return m; }

/** mark a mesh's geometry as shared (the world's model cache, a glb's): the map never disposes it */
export const shared = (o: THREE.Object3D) => { o.traverse((q) => { q.userData.shared = true; }); return o; };
/** centre an object on its footprint (x, z) and stand it on y = 0 */
export function centre(o: THREE.Object3D, box = new THREE.Box3().setFromObject(o)): THREE.Object3D {
  const c = box.getCenter(new THREE.Vector3());
  o.position.x -= c.x; o.position.z -= c.z; o.position.y -= box.min.y;
  return o;
}

/** one of the game's world furniture models (src/content/furniture), on its own state */
export function world(key: string, state: Record<string, unknown> = {}, rot = 0): THREE.Object3D {
  const g = new THREE.Group();
  const d = objDef(key);
  const geo = d ? objectGeometry(d, { uid: 0, key, x: 0, y: 0, rot: 0, state } as unknown as TileObject) : null;
  if (!geo) return g;
  const m = new THREE.Mesh(geo, menuWorldMat());
  m.castShadow = true; m.receiveShadow = true;
  m.rotation.y = rot;
  const inner = new THREE.Group(); inner.add(m);
  centre(inner);
  g.add(shared(inner));
  return g;
}
/** a Poly Haven prop (async: the group fills when it has loaded) */
export function glb(a: string, mats: FMats, p: [number, number, number] = [0, 0, 0], ry = 0, s = 1, g = new THREE.Group(), centred = true): THREE.Group {
  void loadProp(URL_OF(a), lowOf(mats)).then((m) => {
    m.castShadow = true; m.receiveShadow = true;
    m.rotation.y = ry; m.scale.setScalar(s);
    const inner = new THREE.Group(); inner.add(m);
    if (centred) centre(inner);
    inner.position.x += p[0]; inner.position.y += p[1]; inner.position.z += p[2];
    g.add(shared(inner));
    g.dispatchEvent({ type: 'loaded' } as never);
  }).catch((e) => console.warn('[facility props]', a, e));
  return g;
}

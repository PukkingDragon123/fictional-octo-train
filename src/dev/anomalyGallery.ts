// Dev helpers for checking the furniture mimics against the real props in the
// creature gallery. Open ?gallery=creatures&filter=swivel&pose=disguised, then:
//   (await import('/src/dev/anomalyGallery.ts')).refProp('chair_office', 3.8, 5)
import * as THREE from 'three';
import { buildObjGeometry } from '../world/objects';
import { MAT } from '../gfx/materials';

/** put a real prop into the gallery scene for a side-by-side comparison */
export function refProp(key: string, x: number, z: number, rot = 0) {
  const g = (window as any).__gallery;
  const geo = buildObjGeometry(key);
  if (!g || !geo) return false;
  const m = new THREE.Mesh(geo, MAT.prop);
  m.position.set(x, 0, z);
  m.rotation.y = rot;
  g.pr.scene.add(m);
  return true;
}

/** move the gallery rig of a species (first match) */
export function placeRig(key: string, x: number, z: number, rot = 0) {
  const rigs = (window as any).__rigs || [];
  const r = rigs.find((q: any) => q.s.key === key);
  if (!r) return false;
  r.rig.root.position.set(x, 0, z);
  r.rig.root.rotation.y = rot;
  return true;
}

/** triangle and draw-call count of a rig */
export function rigStats(key: string) {
  const rigs = (window as any).__rigs || [];
  const r = rigs.find((q: any) => q.s.key === key);
  if (!r) return null;
  let tris = 0, draws = 0;
  r.rig.root.traverse((o: any) => {
    if (o.isMesh && o.visible && o.geometry?.index) {
      let vis = true; let p = o; while (p) { if (!p.visible) vis = false; p = p.parent; }
      if (!vis) return;
      tris += o.geometry.index.count / 3; draws++;
    }
  });
  return { tris, draws };
}

/**
 * In-game staging (?quick): spawn a creature next to the local survivor with
 * its brain switched off, in a given state, for screenshots in real lighting.
 *   const m = await import('/src/dev/anomalyGallery.ts'); m.stage('swivel', -1.2, -0.6, 'disguised')
 */
export async function stage(key: string, dx: number, dz: number, state = 'idle', o: { facing?: number; speed?: number; attack?: number; zoom?: number; mem?: Record<string, any>; hp?: number } = {}) {
  const { G } = await import('../game/G');
  const p = G.local;
  const c = G.creatures.spawn(key, p.zoneKey, p.x + dx, p.z + dz);
  if (!c) return null;
  const sp: any = c.sp;
  if (!sp._think0) { sp._think0 = sp.think || (() => false); sp.think = (cc: any, dt: number) => (cc.mem._staged ? true : sp._think0(cc, dt)); }
  c.mem._staged = true;
  c.state = state as any;
  c.facing = c.targetFacing = o.facing ?? Math.atan2(p.z - c.z, p.x - c.x);
  if (o.speed) c.speed = o.speed;
  if (o.attack) c.attackPhase = o.attack;
  if (o.hp !== undefined) c.hp = o.hp;
  Object.assign(c.mem, o.mem || {});
  if (o.zoom) G.pr.pxSizeTarget = 1 / o.zoom;
  return c.id;
}

/** set fields of a staged creature by id */
export async function poseStaged(id: string, f: Record<string, any>) {
  const { G } = await import('../game/G');
  const c: any = G.creatures.creatures.get(id);
  if (!c) return false;
  for (const [k, v] of Object.entries(f)) { if (k === 'mem') Object.assign(c.mem, v); else c[k] = v; }
  return true;
}

/** move the local survivor to the middle of an empty, lit, walkable square of the zone (radius r tiles) */
export async function openSpot(r = 3, near?: [number, number]) {
  const { G } = await import('../game/G');
  const z: any = G.zone, p: any = G.local;
  let best: [number, number] | null = null, bd = Infinity;
  for (let y = r + 1; y < z.H - r - 1; y++) for (let x = r + 1; x < z.W - r - 1; x++) {
    let ok = true;
    for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) {
      const i = z.idx(x + dx, y + dy);
      if (!z.floor[i] || z.solid[i] || z.objectsAt(x + dx, y + dy).length) ok = false;
      if (ok && (z.edgeBlocks(x + dx, y + dy, 1, 0, 'walk') && dx < r)) ok = false;
      if (ok && (z.edgeBlocks(x + dx, y + dy, 0, 1, 'walk') && dy < r)) ok = false;
    }
    if (!ok) continue;
    if ((G as any).lightLevelAt && (G as any).lightLevelAt(x + 0.5, y + 0.5) < 0.45) continue;
    const d = near ? Math.hypot(x - near[0], y - near[1]) : Math.hypot(x - p.x, y - p.z);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  if (!best) return null;
  p.x = best[0] + 0.5; p.z = best[1] + 0.5;
  return best;
}

/** tone the gallery's flood lighting down toward in-game levels (k = 0..1) */
export async function dimGallery(k = 0.45) {
  const g = (window as any).__gallery;
  if (!g) return false;
  const { U } = await import('../gfx/materials');
  g.pr.scene.traverse((o: any) => { if (o.isLight) o.intensity *= k; });
  U.uGridScale.value *= k;
  return true;
}

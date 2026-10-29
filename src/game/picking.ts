import * as THREE from 'three';
import { G } from './G';
import { Zone, TileObject, EdgeObj } from '../world/zone';
import { objDef, objectGeometry } from '../world/objects';
import { objectMatrix } from '../world/chunkMesher';
import { floorItems, WorldItem } from '../items/worldItems';
import { itemGeometry } from '../items/itemMeshes';
import { Player } from '../entities/player';
import { WALL_H } from '../world/defs';
import { vehicleBox } from '../vehicles/vehicles';

export type PickTarget =
  | { kind: 'object'; obj: TileObject; point: THREE.Vector3 }
  | { kind: 'edge'; x: number; y: number; side: 0 | 1; edge: EdgeObj; point: THREE.Vector3 }
  | { kind: 'item'; wi: WorldItem; point: THREE.Vector3 }
  | { kind: 'creature'; c: any; point: THREE.Vector3 }
  | { kind: 'player'; p: Player; point: THREE.Vector3 }
  | { kind: 'vehicle'; v: any; point: THREE.Vector3 }
  | { kind: 'tile'; x: number; y: number; point: THREE.Vector3 };

const box = new THREE.Box3();
const tmpV = new THREE.Vector3();
const aabbCache = new WeakMap<TileObject, { key: string; box: THREE.Box3 }>();

function objectBox(z: Zone, o: TileObject): THREE.Box3 | null {
  const d = objDef(o.key);
  if (!d) return null;
  const key = `${o.x},${o.y},${o.rot},${o.state?.y ?? 0},${o.ox ?? 0},${o.oz ?? 0},${d.variant ? d.variant(o.state) : ''}`;
  const c = aabbCache.get(o);
  if (c && c.key === key) return c.box;
  const g = objectGeometry(d, o);
  let b: THREE.Box3;
  if (g) { b = g.boundingBox!.clone().applyMatrix4(objectMatrix(z, o, d)); }
  else if (d.ceiling) return null;
  else b = new THREE.Box3(new THREE.Vector3(o.x, 0, o.y), new THREE.Vector3(o.x + 1, Math.max(0.2, d.height), o.y + 1));
  // make thin things easier to click
  const s = b.getSize(tmpV);
  if (s.x < 0.25) { b.min.x -= 0.1; b.max.x += 0.1; }
  if (s.z < 0.25) { b.min.z -= 0.1; b.max.z += 0.1; }
  if (s.y < 0.2) b.max.y += 0.15;
  aabbCache.set(o, { key, box: b });
  return b;
}

/**
 * Find what is under the mouse: tests the camera ray against furniture
 * bounding boxes, doors/windows, floor items, creatures and survivors near
 * the ray's ground track, nearest hit wins; falls back to the floor tile.
 */
export function pick(cssX: number, cssY: number, opts: { creatures?: any[]; ignore?: Player } = {}): PickTarget | null {
  const g = G;
  if (!g.view) return null;
  const z = g.zone;
  const ray = g.pr.screenRay(cssX, cssY);
  // floor hit (approximate with player's floor height)
  const fy = g.local ? g.local.y : 0;
  const t0 = (fy - ray.origin.y) / ray.direction.y;
  const floorHit = ray.origin.clone().addScaledVector(ray.direction, t0);
  let best: PickTarget | null = null, bestT = Infinity;
  const consider = (t: number | null, tgt: () => PickTarget) => { if (t !== null && t < bestT) { bestT = t; best = tgt(); } };
  const hitBox = (b: THREE.Box3): number | null => { const p = ray.intersectBox(b, tmpV); return p ? p.distanceTo(ray.origin) : null; };
  // ground track: from floor hit back toward the camera ~ (WALL_H / tan(pitch)) metres
  const back = new THREE.Vector3(-ray.direction.x, 0, -ray.direction.z).normalize();
  const span = WALL_H / Math.tan(g.pr.pitch) + 1.5;
  const tiles = new Set<number>();
  for (let s = -0.6; s <= span; s += 0.35) {
    const px = floorHit.x + back.x * s, pz = floorHit.z + back.z * s;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const tx = Math.floor(px) + dx, ty = Math.floor(pz) + dy;
      if (z.inb(tx, ty)) tiles.add(z.idx(tx, ty));
    }
  }
  const vis = g.view.vis;
  const seenObj = new Set<number>();
  for (const ti of tiles) {
    const tx = ti % z.W, ty = (ti / z.W) | 0;
    const explored = z.explored[ti] || !vis.enabled;
    // objects
    for (const o of z.tileObjs.get(ti) || []) {
      if (seenObj.has(o.uid)) continue; seenObj.add(o.uid);
      if (!explored) continue;
      const b = objectBox(z, o); if (!b) continue;
      const t = hitBox(b);
      consider(t, () => ({ kind: 'object', obj: o, point: ray.origin.clone().addScaledVector(ray.direction, t!) }));
    }
    // edges with doors/windows
    for (const side of [0, 1] as const) {
      const e = z.edges.get(ti * 2 + side);
      if (!e || e.kind === 'arch' || !explored) continue;
      const bh = z.heightAt(tx, ty);
      if (side === 0) box.set(new THREE.Vector3(tx + 0.08, bh, ty - 0.12), new THREE.Vector3(tx + 0.92, bh + 2.1, ty + 0.12));
      else box.set(new THREE.Vector3(tx - 0.12, bh, ty + 0.08), new THREE.Vector3(tx + 0.12, bh + 2.1, ty + 0.92));
      const t = hitBox(box);
      consider(t, () => ({ kind: 'edge', x: tx, y: ty, side, edge: e, point: ray.origin.clone().addScaledVector(ray.direction, t!) }));
    }
  }
  // floor items
  for (const wi of floorItems(z).values()) {
    if (Math.abs(wi.x - floorHit.x) > span + 2 || Math.abs(wi.z - floorHit.z) > span + 2) continue;
    if (!vis.isVisible(Math.floor(wi.x), Math.floor(wi.z))) continue;
    const geo = itemGeometry(wi.item.key);
    const r = geo ? Math.max(0.12, geo.boundingSphere!.radius) : 0.15;
    box.set(new THREE.Vector3(wi.x - r, wi.y, wi.z - r), new THREE.Vector3(wi.x + r, wi.y + Math.max(0.15, r), wi.z + r));
    const t = hitBox(box);
    if (t !== null) consider(t - 0.3, () => ({ kind: 'item', wi, point: new THREE.Vector3(wi.x, wi.y, wi.z) }));
  }
  // creatures
  for (const c of opts.creatures || []) {
    if (!c.visibleToLocal) continue;
    const r = c.radius ?? 0.4, h = c.height ?? 1.2;
    box.set(new THREE.Vector3(c.x - r, c.y ?? 0, c.z - r), new THREE.Vector3(c.x + r, (c.y ?? 0) + h, c.z + r));
    const t = hitBox(box);
    if (t !== null) consider(t - 0.5, () => ({ kind: 'creature', c, point: new THREE.Vector3(c.x, 0, c.z) }));
  }
  // other players
  for (const p of g.players.values()) {
    if (p === opts.ignore || p.zoneKey !== g.local.zoneKey) continue;
    box.set(new THREE.Vector3(p.x - 0.3, p.y, p.z - 0.3), new THREE.Vector3(p.x + 0.3, p.y + 1.8, p.z + 0.3));
    const t = hitBox(box);
    if (t !== null) consider(t - 0.4, () => ({ kind: 'player', p, point: new THREE.Vector3(p.x, p.y, p.z) }));
  }
  // vehicles
  for (const v of (g as any).vehicles?.list?.() || []) {
    if (!vis.isVisible(Math.floor(v.x), Math.floor(v.z)) && !z.explored[z.idx(Math.floor(v.x), Math.floor(v.z))]) continue;
    vehicleBox(v, box);
    const t = hitBox(box);
    if (t !== null) consider(t + 0.2, () => ({ kind: 'vehicle', v, point: new THREE.Vector3(v.x, 0, v.z) }));
  }
  if (best) return best;
  const tx = Math.floor(floorHit.x), ty = Math.floor(floorHit.z);
  if (!z.inb(tx, ty)) return null;
  return { kind: 'tile', x: tx, y: ty, point: floorHit };
}

export function targetPos(t: PickTarget): { x: number; z: number } {
  switch (t.kind) {
    case 'object': { const d = objDef(t.obj.key); const w = d?.w ?? 1, dd = d?.d ?? 1; const rw = t.obj.rot % 2 === 0 ? w : dd, rd = t.obj.rot % 2 === 0 ? dd : w; return { x: t.obj.x + rw / 2, z: t.obj.y + rd / 2 }; }
    case 'edge': return t.side === 0 ? { x: t.x + 0.5, z: t.y } : { x: t.x, z: t.y + 0.5 };
    case 'item': return { x: t.wi.x, z: t.wi.z };
    case 'creature': return { x: t.c.x, z: t.c.z };
    case 'player': return { x: t.p.x, z: t.p.z };
    case 'vehicle': return { x: t.v.x, z: t.v.z };
    case 'tile': return { x: t.x + 0.5, z: t.y + 0.5 };
  }
}

export function targetName(t: PickTarget): string {
  switch (t.kind) {
    case 'object': return objDef(t.obj.key)?.name || t.obj.key;
    case 'edge': {
      const e = t.edge;
      if (e.kind === 'door') return (e.portal ? 'Door' : 'Door') + (e.locked ? ' (Locked)' : '') + (e.barricade ? ' (Barricaded)' : '');
      if (e.kind === 'window') return 'Window' + (e.glass === 'broken' ? ' (Broken)' : e.open ? ' (Open)' : '') + (e.barricade ? ' (Barricaded)' : '');
      return e.kind[0].toUpperCase() + e.kind.slice(1);
    }
    case 'item': return (t.wi.item.name || '') || '';
    case 'creature': return t.c.displayName?.() || t.c.name || 'Something';
    case 'player': return t.p.name;
    case 'vehicle': return t.v.name || 'Vehicle';
    case 'tile': return G.zone.floorAt(t.x, t.y)?.name || 'Floor';
  }
}

const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc = new THREE.Vector3();
/**
 * Is (cssX, cssY) on the local survivor's own body in the iso view? A capsule round
 * the body from the shins to the crown, tested against the camera ray, and nothing
 * else (a creature, another survivor, an item or a vehicle) standing in front of it.
 * The watch uses it: a click or tap on yourself raises your wrist.
 */
export function pickSelf(cssX: number, cssY: number): boolean {
  const g = G;
  const p = g.local;
  if (!p || !g.view || !g.pr || g.pr.eyeCamera || p.body?.dead || p.inVehicle || !p.rig?.root?.visible) return false;
  const ray = g.pr.screenRay(cssX, cssY);
  const y0 = (p.y ?? 0) + 0.3, y1 = (p.y ?? 0) + 1.78;
  // closest approach between the ray and the body's axis
  _sa.set(p.x, y0, p.z); _sb.set(p.x, y1, p.z);
  const d2 = ray.distanceSqToSegment(_sa, _sb, _sc, undefined);
  const r = 0.27;
  if (d2 > r * r) return false;
  const tSelf = _sc.distanceTo(ray.origin);
  // something else under the pointer and in front of you wins
  const t = pick(cssX, cssY, { creatures: g.creatures?.list?.() || [], ignore: p });
  if (t && (t.kind === 'creature' || t.kind === 'player' || t.kind === 'vehicle' || t.kind === 'item')) {
    if (t.kind === 'item' || t.point.distanceTo(ray.origin) < tSelf + 0.2) return false;
  }
  if (t && (t.kind === 'object' || t.kind === 'edge') && t.point.distanceTo(ray.origin) < tSelf - 0.35) return false;
  return true;
}

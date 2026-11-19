import * as THREE from 'three';
import { Zone } from '../world/zone';
import { Item, itemDef } from './item';
import { itemGeometry } from './itemMeshes';
import { worldMaterial } from '../gfx/materials';
import { Container } from './container';
import { uid } from '../core/rng';
import { clearReach } from '../world/collision';
import { SoftSheet, isSoftItem, type Draught } from './softItems';

/** when each item was put down (paper and cloth fall from the hand only when it was just now) */
const dropAt = new WeakMap<WorldItem, number>();

/** An item lying on the floor of a zone (dropped, spilled from a corpse, generated loot). */
export interface WorldItem {
  item: Item;
  x: number; z: number; y: number;
  rot: number;
  /** settle animation (thrown / dropped) */
  vy?: number; vx?: number; vz?: number;
}

/** Floor items keyed by item uid, stored on the zone meta to keep Zone lean. */
export function floorItems(z: Zone): Map<number, WorldItem> {
  let m = z.meta.floorItems as Map<number, WorldItem> | undefined;
  if (!m) { m = new Map(); z.meta.floorItems = m; }
  return m;
}

/** stable 0..1 noise from an item uid, so every co-op peer scatters a drop identically */
function uidNoise(uid: number, k: number): number {
  let h = ((uid % 4294967296) ^ Math.floor(uid / 4294967296) ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function dropItem(z: Zone, it: Item, x: number, zz: number, y?: number, scatter = 0.25): WorldItem {
  const wi: WorldItem = {
    item: it,
    x: x + (uidNoise(it.uid, 0) - 0.5) * scatter, z: zz + (uidNoise(it.uid, 1) - 0.5) * scatter,
    y: y ?? z.heightAt(Math.floor(x), Math.floor(zz)),
    rot: uidNoise(it.uid, 2) * Math.PI * 2,
  };
  floorItems(z).set(it.uid, wi);
  dropAt.set(wi, performance.now());
  it.parent = undefined;
  z.meta.floorVersion = (z.meta.floorVersion || 0) + 1;
  return wi;
}

export function removeFloorItem(z: Zone, it: Item) {
  floorItems(z).delete(it.uid);
  z.meta.floorVersion = (z.meta.floorVersion || 0) + 1;
}

export function floorItemsNear(z: Zone, x: number, zz: number, r: number): WorldItem[] {
  const out: WorldItem[] = [];
  for (const wi of floorItems(z).values()) if (Math.abs(wi.x - x) <= r && Math.abs(wi.z - zz) <= r) out.push(wi);
  return out;
}

/**
 * Build a transient Container view over floor items around a point (the
 * "Floor" tab of the loot window). Moving items out of it removes them from
 * the floor; moving items in drops them at the player's feet.
 */
export function floorContainer(z: Zone, x: number, zz: number, r = 1.3): Container {
  // transient view of the floor: fixed id so UIs can diff it and no ids are burned
  const c = new Container(-1, 'Floor', 'floor', 9999);
  c.owner = `floor:${x.toFixed(2)},${zz.toFixed(2)}`;
  // round 19: no reaching through walls: only what a hand at (x, zz) can get to
  for (const wi of floorItemsNear(z, x, zz, r)) if (clearReach(z, x, zz, wi.x, wi.z)) c.items.push(wi.item);
  c.lootDone = true;
  return c;
}

/** Renders floor items near the camera as individual meshes. */
export class FloorItemRenderer {
  root = new THREE.Group();
  meshes = new Map<number, THREE.Mesh>();
  /** paper and cloth on the floor: verlet sheets (./softItems.ts) */
  private softs = new Map<number, SoftSheet>();
  /** who is walking about (set by the session each frame): their legs stir loose paper and cloth */
  walkers: { x: number; z: number }[] = [];
  private lastWalk = new WeakMap<object, [number, number]>();
  private version = -1;
  private lastZone: Zone | null = null;
  private zoneAt = 0;

  update(z: Zone, cx: number, cz: number, R: number, isVisible: (x: number, y: number) => boolean, dt: number) {
    if (z !== this.lastZone) { for (const m of this.meshes.values()) this.root.remove(m); this.meshes.clear(); for (const s of this.softs.values()) s.dispose(); this.softs.clear(); this.lastZone = z; this.version = -1; this.zoneAt = performance.now(); }
    const now = performance.now();
    const draughts: Draught[] = [];
    if (dt > 0) for (const w of this.walkers) {
      const l = this.lastWalk.get(w);
      if (l) { const vx = (w.x - l[0]) / dt, vz = (w.z - l[1]) / dt; if (vx * vx + vz * vz > 1.4 && vx * vx + vz * vz < 400) draughts.push({ x: w.x, z: w.z, vx, vz }); }
      this.lastWalk.set(w, [w.x, w.z]);
    }
    const items = floorItems(z);
    const seen = new Set<number>();
    for (const wi of items.values()) {
      if (Math.abs(wi.x - cx) > R || Math.abs(wi.z - cz) > R) continue;
      // falling / thrown physics
      if (wi.vy !== undefined) {
        wi.vy -= 9.8 * dt;
        wi.x += (wi.vx ?? 0) * dt; wi.z += (wi.vz ?? 0) * dt; wi.y += wi.vy * dt;
        const fy = z.heightAt(Math.floor(wi.x), Math.floor(wi.z));
        if (wi.y <= fy) { wi.y = fy; if (Math.abs(wi.vy) > 1.5) { wi.vy = -wi.vy * 0.3; wi.vx = (wi.vx ?? 0) * 0.5; wi.vz = (wi.vz ?? 0) * 0.5; } else { wi.vy = undefined; wi.vx = undefined; wi.vz = undefined; } }
      }
      seen.add(wi.item.uid);
      let m = this.meshes.get(wi.item.uid);
      if (!m) {
        if (isSoftItem(wi.item.key)) {
          const sh = new SoftSheet(wi.item.key, wi.item.uid);
          const t = dropAt.get(wi);
          sh.place(z, wi.x, wi.y, wi.z, wi.rot, t !== undefined && now - t < 1500 && now - this.zoneAt > 2500);
          this.softs.set(wi.item.uid, sh);
          m = sh.mesh;
        } else {
          const g = itemGeometry(wi.item.key);
          if (!g) continue;
          m = new THREE.Mesh(g, worldMaterial({}));
          m.castShadow = true; m.receiveShadow = true;
        }
        m.userData.item = wi.item;
        this.meshes.set(wi.item.uid, m);
        this.root.add(m);
      }
      m.position.set(wi.x, wi.y, wi.z);
      const sh = this.softs.get(wi.item.uid);
      if (sh) { sh.follow(wi.x, wi.y, wi.z); if (sh.step(z, dt, draughts.length ? draughts : null)) sh.write(); }
      else m.rotation.y = wi.rot;
      // the Ledge melts what is left lying about (src/world/anomalies/ledge.ts): it slumps flat and spreads
      const mt = wi.item.data?.melt;
      if (mt) m.scale.set(1 + mt * 0.45, Math.max(0.25, 1 - mt * 0.7), 1 + mt * 0.45); else if (m.scale.y !== 1) m.scale.set(1, 1, 1);
      m.visible = isVisible(Math.floor(wi.x), Math.floor(wi.z));
    }
    for (const [k, m] of this.meshes) if (!seen.has(k)) { this.root.remove(m); this.meshes.delete(k); const sh = this.softs.get(k); if (sh) { sh.dispose(); this.softs.delete(k); } }
    void itemDef;
  }
}

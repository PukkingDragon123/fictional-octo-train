import * as THREE from 'three';
import { Zone } from '../world/zone';
import { Item, itemDef } from './item';
import { itemGeometry } from './itemMeshes';
import { worldMaterial } from '../gfx/materials';
import { Container } from './container';
import { uid } from '../core/rng';

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

export function dropItem(z: Zone, it: Item, x: number, zz: number, y?: number, scatter = 0.25): WorldItem {
  const wi: WorldItem = {
    item: it,
    x: x + (Math.random() - 0.5) * scatter, z: zz + (Math.random() - 0.5) * scatter,
    y: y ?? z.heightAt(Math.floor(x), Math.floor(zz)),
    rot: Math.random() * Math.PI * 2,
  };
  floorItems(z).set(it.uid, wi);
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
  const c = new Container(uid(), 'Floor', 'floor', 9999);
  c.owner = `floor:${x.toFixed(2)},${zz.toFixed(2)}`;
  for (const wi of floorItemsNear(z, x, zz, r)) c.items.push(wi.item);
  c.lootDone = true;
  return c;
}

/** Renders floor items near the camera as individual meshes. */
export class FloorItemRenderer {
  root = new THREE.Group();
  meshes = new Map<number, THREE.Mesh>();
  private version = -1;
  private lastZone: Zone | null = null;

  update(z: Zone, cx: number, cz: number, R: number, isVisible: (x: number, y: number) => boolean, dt: number) {
    if (z !== this.lastZone) { for (const m of this.meshes.values()) this.root.remove(m); this.meshes.clear(); this.lastZone = z; this.version = -1; }
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
        const g = itemGeometry(wi.item.key);
        if (!g) continue;
        m = new THREE.Mesh(g, worldMaterial({}));
        m.castShadow = true; m.receiveShadow = true;
        m.userData.item = wi.item;
        this.meshes.set(wi.item.uid, m);
        this.root.add(m);
      }
      m.position.set(wi.x, wi.y, wi.z);
      m.rotation.y = wi.rot;
      m.visible = isVisible(Math.floor(wi.x), Math.floor(wi.z));
    }
    for (const [k, m] of this.meshes) if (!seen.has(k)) { this.root.remove(m); this.meshes.delete(k); }
    void itemDef;
  }
}

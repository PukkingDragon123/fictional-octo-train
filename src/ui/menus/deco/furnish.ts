// A menu room's furnishings: the collectibles the player placed in it, built
// from the catalogue into the room's own `deco` group, animated every frame,
// lit by a small pool of practical lights (so placing a lava lamp never
// recompiles the room's shaders), saved per room. Also the room's geometry
// for placing things: the floor and shelf rectangles, a pointer ray onto
// them, a footprint test, and a hit test for what is already standing there.
import * as THREE from 'three';
import type { MenuRoom } from '../menuRooms';
import { ITEM, makeModel } from './catalog';
import type { DecoModel } from './parts';
import { placements, setPlacements, type Placement } from './store';

export interface Spot { x: number; y: number; z: number; surf: number; s: number }
interface Placed { p: Placement; model: DecoModel; node: THREE.Group; light: THREE.PointLight | null; lightLocal: THREE.Vector3; t: number }

const LIGHTS = 2;
const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Furnisher {
  readonly room: MenuRoom;
  readonly items = new Map<string, Placed>();
  private pool: THREE.PointLight[] = [];

  constructor(room: MenuRoom) {
    this.room = room;
    for (const p of placements(room.id)) if (ITEM.has(p.item)) this.spawn(p);
  }

  /** build and stand a placement in the room (no save) */
  spawn(p: Placement): Placed | null {
    const model = makeModel(p.item);
    if (!model) return null;
    const node = new THREE.Group();
    node.name = 'deco:' + p.item;
    node.userData.uid = p.uid;
    node.add(model.obj);
    // the model's own light (if any) is replaced by one from the room's pool
    let lightLocal = new THREE.Vector3();
    const light = model.light ?? null;
    if (light) {
      model.obj.updateMatrixWorld(true);
      lightLocal = light.getWorldPosition(new THREE.Vector3());
      light.removeFromParent();
    }
    const placed: Placed = { p: { ...p }, model, node, light, lightLocal, t: Math.random() * 5 };
    this.items.set(p.uid, placed);
    this.pose(placed);
    this.room.deco.add(node);
    if (light) this.ensurePool();
    return placed;
  }
  remove(uid: string) {
    const it = this.items.get(uid);
    if (!it) return;
    it.node.removeFromParent();
    this.items.delete(uid);
  }
  /** move / turn / rescale a placement */
  set(uid: string, q: Partial<Placement>) {
    const it = this.items.get(uid);
    if (!it) return;
    Object.assign(it.p, q);
    this.pose(it);
  }
  private pose(it: Placed) {
    it.node.position.set(it.p.x, it.p.y, it.p.z);
    it.node.rotation.set(0, it.p.rot, 0);
    it.node.scale.setScalar(it.p.s);
  }
  list(): Placement[] { return [...this.items.values()].map((i) => ({ ...i.p })); }
  save() { setPlacements(this.room.id, this.list()); }
  /** put back exactly this set of placements (undo) */
  restore(list: Placement[]) {
    const want = new Map(list.map((p) => [p.uid, p]));
    for (const uid of [...this.items.keys()]) if (!want.has(uid)) this.remove(uid);
    for (const p of list) { if (this.items.has(p.uid)) this.set(p.uid, p); else this.spawn(p); }
  }

  private ensurePool() {
    if (this.pool.length) return;
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 2, 2);
      l.castShadow = false;
      l.name = 'deco-light';
      this.pool.push(l);
      this.room.scene.add(l);
    }
  }

  update(dt: number) {
    let li = 0;
    for (const it of this.items.values()) {
      if (!it.node.visible) continue;
      it.t += dt;
      try { it.model.update?.(it.t, dt); } catch (e) { console.warn('deco idle', e); it.model.update = undefined; }
      if (it.light && li < this.pool.length) {
        const l = this.pool[li++];
        it.node.updateMatrixWorld(true);
        l.position.copy(it.lightLocal).applyMatrix4(it.node.matrixWorld);
        l.color.copy(it.light.color);
        l.intensity = it.light.intensity * 1.6 * it.p.s;
        l.distance = it.light.distance * Math.max(0.6, it.p.s) * 1.3;
      }
    }
    for (; li < this.pool.length; li++) this.pool[li].intensity = 0;
  }

  // ---------------------------------------------------------------- placing
  /** the room's canvas rect (the camera's NDC maps onto it), else the host's */
  private viewRect(): DOMRect {
    const cv = this.room.host.querySelector('canvas');
    const r = (cv ?? this.room.host).getBoundingClientRect();
    return r.width > 4 ? r : this.room.host.getBoundingClientRect();
  }
  /** a ray from a client point, in the deco group's space */
  private localRay(cx: number, cy: number): boolean {
    const r = this.viewRect();
    const cam = this.room.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    _ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
    this.room.deco.updateMatrixWorld(true);
    _m.copy(this.room.deco.matrixWorld).invert();
    _o.copy(_ray.ray.origin).applyMatrix4(_m);
    _d.copy(_ray.ray.direction).transformDirection(_m);
    return true;
  }
  /** where a client point lands on the floor or a shelf (null = nowhere placeable) */
  pick(cx: number, cy: number, allowShelf: boolean): Spot | null {
    this.localRay(cx, cy);
    const F = this.room.floor;
    let best: Spot | null = null, bestT = Infinity;
    const tryRect = (rc: { minX: number; maxX: number; minZ: number; maxZ: number; y: number }, surf: number) => {
      if (Math.abs(_d.y) < 1e-5) return;
      const t = (rc.y - _o.y) / _d.y;
      if (t <= 0 || t >= bestT) return;
      const x = _o.x + _d.x * t, z = _o.z + _d.z * t;
      const pad = surf < 0 ? 0.6 : 0.05;
      if (x < rc.minX - pad || x > rc.maxX + pad || z < rc.minZ - pad || z > rc.maxZ + pad) return;
      bestT = t;
      best = { x: Math.max(rc.minX, Math.min(rc.maxX, x)), y: rc.y, z: Math.max(rc.minZ, Math.min(rc.maxZ, z)), surf, s: 1 };
    };
    if (allowShelf) (this.room.surfaces ?? []).forEach((s, i) => tryRect(s, i));
    tryRect(F, -1);
    return best;
  }
  rect(surf: number) { return surf < 0 ? this.room.floor : (this.room.surfaces ?? [])[surf] ?? this.room.floor; }
  /** snap a spot to the grid inside its rectangle */
  snap(sp: Spot, step: number): Spot {
    const rc = this.rect(sp.surf);
    const sx = Math.round((sp.x - rc.minX) / step) * step + rc.minX, sz = Math.round((sp.z - rc.minZ) / step) * step + rc.minZ;
    return { ...sp, x: Math.max(rc.minX, Math.min(rc.maxX, sx)), z: Math.max(rc.minZ, Math.min(rc.maxZ, sz)) };
  }
  /** can item `id` stand at spot (ignoring `self`)? */
  fits(id: string, sp: Spot, self?: string): boolean {
    const it = ITEM.get(id);
    if (!it) return false;
    if (sp.surf >= 0 && it.place === 'floor') return false;
    const rc = this.rect(sp.surf);
    const r = it.r * sp.s * 0.7;
    if (sp.x < rc.minX + r * 0.5 - 0.02 || sp.x > rc.maxX - r * 0.5 + 0.02 || sp.z < rc.minZ + r * 0.5 - 0.02 || sp.z > rc.maxZ - r * 0.5 + 0.02) return false;
    for (const o of this.items.values()) {
      if (o.p.uid === self || o.p.surf !== sp.surf) continue;
      const oi = ITEM.get(o.p.item);
      if (!oi || oi.under || it.under) continue;
      const min = (oi.r * o.p.s + it.r * sp.s) * 0.72;
      if (Math.hypot(o.p.x - sp.x, o.p.z - sp.z) < min) return false;
    }
    return true;
  }
  /** the placed item under a client point */
  hit(cx: number, cy: number): string | null {
    const r = this.viewRect();
    const cam = this.room.camera as THREE.PerspectiveCamera;
    _ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
    const hits = _ray.intersectObject(this.room.deco, true);
    for (const h of hits) {
      if (!(h.object as THREE.Mesh).isMesh || h.object.userData.ghost) continue;
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.uid) o = o.parent;
      if (o && this.items.has(o.userData.uid)) return o.userData.uid;
    }
    return null;
  }
  /** client position of a room-space point (for bubbles, captions) */
  screen(p: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 | null {
    const r = this.viewRect();
    this.room.deco.updateMatrixWorld(true);
    _w.copy(p).applyMatrix4(this.room.deco.matrixWorld);
    _v.copy(_w).project(this.room.camera);
    if (_v.z > 1) return null;
    return out.set(r.left + (_v.x * 0.5 + 0.5) * r.width, r.top + (-_v.y * 0.5 + 0.5) * r.height);
  }
  poke(uid: string) { this.items.get(uid)?.model.poke?.(); }
  node(uid: string) { return this.items.get(uid)?.node ?? null; }
  dispose() { for (const uid of [...this.items.keys()]) this.remove(uid); for (const l of this.pool) l.removeFromParent(); this.pool = []; }
}

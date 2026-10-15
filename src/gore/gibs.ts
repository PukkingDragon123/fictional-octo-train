// Dismemberment and gibs. A severed rig part (and everything hanging off it)
// is detached from the corpse and replaced by a bloody stump; a clone of it
// (sharing geometry) flies off as a physics gib: gravity, bounces off floors
// and walls, slides, tumbles and settles flat. Generic meat / bone / fluff /
// plaster chunks cover what can't detach. Gibs are local visuals, pooled and
// capped; the persistent record (which parts are gone) lives on the creature.
import * as THREE from 'three';
import { G } from '../game/G';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Zone } from '../world/zone';
import type { BloodKind } from './kinds';

export interface Gib {
  obj: THREE.Group;          // pivot at the gib's centre
  vel: THREE.Vector3;
  spin: THREE.Vector3;       // angular velocity (rad/s)
  half: THREE.Vector3;       // half extents in the gib's own frame
  zone: string;
  kind: BloodKind;
  tint: number;
  settled: boolean;
  bounced: boolean;
  born: number;
  /** seconds this gib keeps oozing (drops while moving) */
  ooze: number;
  big: boolean;
}

const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler();
const UPV = new THREE.Vector3(0, 1, 0), DOWNV = new THREE.Vector3(0, -1, 0);
const geoCache = new Map<string, THREE.BufferGeometry[]>();

/** a few lumpy chunk shapes per texture */
function chunkGeos(tex: string, boneTex: string | null): THREE.BufferGeometry[] {
  const key = tex + '|' + boneTex;
  let g = geoCache.get(key);
  if (g) return g;
  g = [];
  for (let v = 0; v < 4; v++) {
    const mb = new ModelBuilder();
    const s = 0.05 + v * 0.018;
    mb.box(0, -s / 2, 0, s * 1.2, s, s, tex, { fit: true });
    mb.push().translate(s * 0.35, s * 0.15, s * 0.1).rotateY(0.6 + v).rotateZ(0.4);
    mb.box(0, -s * 0.35, 0, s * 0.7, s * 0.7, s * 0.6, tex, { fit: true });
    mb.pop();
    if (boneTex && v % 2 === 1) { mb.push().rotateZ(0.3 * v); mb.box(-s * 0.4, -s * 0.12, 0, s * 1.1, s * 0.24, s * 0.24, boneTex, { fit: true }); mb.pop(); }
    g.push(mb.build());
  }
  geoCache.set(key, g);
  return g;
}

const stumpCache = new Map<string, THREE.BufferGeometry>();
function stumpGeo(tex: string, boneTex: string | null, w: number): THREE.BufferGeometry {
  const q = Math.max(1, Math.min(8, Math.round(w / 0.03)));
  const key = tex + '|' + boneTex + '|' + q;
  let g = stumpCache.get(key);
  if (g) return g;
  const s = q * 0.03;
  const mb = new ModelBuilder();
  // ragged meat cap at the joint, a stub of bone poking out
  mb.box(0, -s * 0.35, 0, s, s * 0.45, s, tex, { fit: true });
  mb.box(s * 0.18, -s * 0.5, -s * 0.12, s * 0.5, s * 0.25, s * 0.55, tex, { fit: true });
  if (boneTex) mb.box(0, -s * 0.75, 0, s * 0.3, s * 0.4, s * 0.3, boneTex, { fit: true });
  g = mb.build();
  stumpCache.set(key, g);
  return g;
}

export class Gibs {
  list: Gib[] = [];
  root: THREE.Group;
  /** called when a gib first slaps the floor (sound + blood) */
  onLand?: (g: Gib, x: number, y: number, z: number, speed: number) => void;
  /** called every so often while a bleeding gib slides */
  onOoze?: (g: Gib, x: number, z: number) => void;

  constructor(root: THREE.Group) { this.root = root; }

  get cap() { return (G.sandbox.gore ?? 2) >= 2 ? 44 : 20; }

  clear() { for (const g of this.list) this.root.remove(g.obj); this.list.length = 0; }

  /** wrap an object (already in world space via its matrixWorld) as a physics gib */
  spawn(src: THREE.Object3D, zone: string, kind: BloodKind, tint: number, vel: THREE.Vector3, spin: number, ooze = 2): Gib {
    // centre pivot: measure the clone in world space, then re-parent under a pivot at its centre
    src.updateWorldMatrix(true, true);
    tmpBox.setFromObject(src);
    if (tmpBox.isEmpty()) { const p = new THREE.Vector3().setFromMatrixPosition(src.matrixWorld); tmpBox.setFromCenterAndSize(p, new THREE.Vector3(0.1, 0.1, 0.1)); }
    const centre = tmpBox.getCenter(new THREE.Vector3());
    const size = tmpBox.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.03, 0.03, 0.03));
    const pivot = new THREE.Group();
    pivot.position.copy(centre);
    this.root.add(pivot);
    pivot.updateMatrixWorld(true);
    // src world matrix relative to the pivot
    const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    const local = inv.multiply(src.matrixWorld);
    local.decompose(src.position, src.quaternion, src.scale);
    pivot.add(src);
    const g: Gib = {
      obj: pivot, vel: vel.clone(), spin: new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin),
      half: size.multiplyScalar(0.5), zone, kind, tint, settled: false, bounced: false, born: G.time, ooze, big: size.x + size.y + size.z > 0.5,
    };
    this.list.push(g);
    this.enforceCap();
    return g;
  }

  /** generic chunks bursting from a point */
  chunks(zone: string, kind: BloodKind, tint: number, x: number, y: number, z: number, n: number, dir: THREE.Vector3, speed: number, upBias = 1.5) {
    const geos = chunkGeos(kind.chunkTex, kind.boneTex);
    const mat = worldMaterial({});
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geos[(Math.random() * geos.length) | 0], mat);
      m.castShadow = false;
      if (kind.chunkCol !== 0xffffff) this.tintMesh(m, kind.chunkCol);
      m.position.set(x + (Math.random() - 0.5) * 0.1, y + (Math.random() - 0.5) * 0.1, z + (Math.random() - 0.5) * 0.1);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(speed * (0.3 + Math.random() * 0.7)).addScaledVector(dir, speed * (0.5 + Math.random()));
      v.y = upBias * (0.6 + Math.random() * 1.4);
      this.spawn(m, zone, kind, tint, v, 14, 1.2);
    }
  }

  private tintMesh(m: THREE.Mesh, col: number) {
    // chunks share geometry: tint by cloning the colour attribute once per colour
    const key = (m.geometry.uuid) + col;
    let g = tintCache.get(key);
    if (!g) {
      g = m.geometry.clone();
      const c = g.getAttribute('color') as THREE.BufferAttribute;
      const r = ((col >> 16) & 255) / 255, gg = ((col >> 8) & 255) / 255, b = (col & 255) / 255;
      for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * r, c.getY(i) * gg, c.getZ(i) * b);
      tintCache.set(key, g);
    }
    m.geometry = g;
  }

  /** a bloody stump where a part was attached (parent space, at the part's pivot) */
  stump(parent: THREE.Object3D, at: THREE.Vector3, quat: THREE.Quaternion, kind: BloodKind, width: number): THREE.Mesh {
    const m = new THREE.Mesh(stumpGeo(kind.stumpTex, kind.boneTex, width), worldMaterial({}));
    m.position.copy(at);
    m.quaternion.copy(quat);
    m.name = 'gore_stump';
    m.castShadow = false;
    parent.add(m);
    return m;
  }

  private enforceCap() {
    while (this.list.length > this.cap) {
      // oldest settled first, else simply the oldest
      let idx = this.list.findIndex((g) => g.settled);
      if (idx < 0) idx = 0;
      const [g] = this.list.splice(idx, 1);
      this.root.remove(g.obj);
    }
  }

  update(dt: number, z: Zone | null) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      if (!z || g.zone !== z.key) { this.root.remove(g.obj); this.list.splice(i, 1); continue; }
      if (g.settled) continue;
      const o = g.obj;
      g.vel.y -= 9.8 * dt;
      const ox = o.position.x, oz = o.position.z;
      let nx = ox + g.vel.x * dt, nz = oz + g.vel.z * dt;
      const otx = Math.floor(ox), otz = Math.floor(oz), ntx = Math.floor(nx), ntz = Math.floor(nz);
      // walls and solid furniture
      const blockedX = otx !== ntx && (z.edgeBlocks(otx, otz, ntx > otx ? 1 : -1, 0, 'walk') || this.solid(z, ntx, otz));
      const blockedZ = otz !== ntz && (z.edgeBlocks(otx, otz, 0, ntz > otz ? 1 : -1, 'walk') || this.solid(z, otx, ntz));
      if (blockedX) { g.vel.x *= -0.35; nx = ox; g.spin.multiplyScalar(0.6); }
      if (blockedZ) { g.vel.z *= -0.35; nz = oz; g.spin.multiplyScalar(0.6); }
      o.position.x = nx; o.position.z = nz;
      o.position.y += g.vel.y * dt;
      // tumble
      tmpE.set(g.spin.x * dt, g.spin.y * dt, g.spin.z * dt);
      tmpQ.setFromEuler(tmpE);
      o.quaternion.premultiply(tmpQ);
      const tx = Math.floor(o.position.x), tz = Math.floor(o.position.z);
      const floor = z.inb(tx, tz) && z.floor[z.idx(tx, tz)] ? z.heightAt(tx, tz) : -3;
      const rest = Math.min(g.half.x, g.half.y, g.half.z) * 1.1;
      if (o.position.y - rest <= floor) {
        if (floor < -2) { this.root.remove(o); this.list.splice(i, 1); continue; }
        o.position.y = floor + rest;
        const speed = g.vel.length();
        if (!g.bounced || Math.abs(g.vel.y) > 1.6) this.onLand?.(g, o.position.x, floor, o.position.z, speed);
        g.bounced = true;
        if (Math.abs(g.vel.y) > 1.1) {
          g.vel.y *= -0.3; g.vel.x *= 0.65; g.vel.z *= 0.65; g.spin.multiplyScalar(0.55);
        } else {
          // sliding: friction, and the gib rolls over onto its flattest side
          g.vel.y = 0;
          const f = Math.exp(-5.5 * dt);
          g.vel.x *= f; g.vel.z *= f; g.spin.multiplyScalar(Math.exp(-7 * dt));
          this.layFlat(g, dt * 6);
          if (g.ooze > 0 && Math.hypot(g.vel.x, g.vel.z) > 0.6) this.onOoze?.(g, o.position.x, o.position.z);
          if (Math.hypot(g.vel.x, g.vel.z) < 0.08 && g.spin.length() < 0.3) {
            this.layFlat(g, 1);
            g.settled = true;
            g.vel.set(0, 0, 0);
            o.position.y = floor + this.restHeight(g) - 0.005;
          }
        }
      }
      g.ooze = Math.max(0, g.ooze - dt);
      if (G.time - g.born > 12) { g.settled = true; }
    }
  }

  private solid(z: Zone, x: number, y: number) { return !z.inb(x, y) || z.solid[z.idx(x, y)] === 1; }

  /** rotate toward the pose where the gib's thinnest axis points up (it lies on its flattest side) */
  private layFlat(g: Gib, k: number) {
    const h = g.half, q = g.obj.quaternion;
    const thin = h.x <= h.y && h.x <= h.z ? 0 : h.y <= h.z ? 1 : 2;
    // that local axis in world space
    if (thin === 0) tmpV.set(1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.y + q.w * q.z), 2 * (q.x * q.z - q.w * q.y));
    else if (thin === 1) tmpV.set(2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x));
    else tmpV.set(2 * (q.x * q.z + q.w * q.y), 2 * (q.y * q.z - q.w * q.x), 1 - 2 * (q.x * q.x + q.y * q.y));
    tmpV.normalize();
    tmpQ.setFromUnitVectors(tmpV, tmpV.y >= 0 ? UPV : DOWNV);
    tmpQ2.copy(tmpQ).multiply(q);
    q.slerp(tmpQ2, Math.min(1, k));
  }
  private restHeight(g: Gib) { return Math.min(g.half.x, g.half.y, g.half.z); }

  /** world-space centre and outward direction of a part before it is cut (for stumps / spurts) */
  static measure(part: THREE.Object3D): { centre: THREE.Vector3; size: THREE.Vector3; pivot: THREE.Vector3 } {
    part.updateWorldMatrix(true, true);
    tmpBox.setFromObject(part);
    const pivot = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
    if (tmpBox.isEmpty()) tmpBox.setFromCenterAndSize(pivot, new THREE.Vector3(0.08, 0.08, 0.08));
    return { centre: tmpBox.getCenter(new THREE.Vector3()), size: tmpBox.getSize(new THREE.Vector3()), pivot };
  }
}

const tintCache = new Map<string, THREE.BufferGeometry>();

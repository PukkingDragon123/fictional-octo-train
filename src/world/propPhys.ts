// Loose furniture as rigid bodies. Anything that can be pushed (src/world/
// destruction.ts pushable) becomes a body in the solver (src/world/rigid.ts)
// the moment something disturbs it, and goes back on the tile grid where it
// comes to rest:
//  - walking into light things shoves them (a chair skids, a bin tips), the
//    walker slowed by what it weighs; heavy things do not budge underfoot
//    (they need a sprint, a shoulder, or the hold-and-push of pushDrag.ts)
//  - a sprint, a tackle or a roll into a piece (the old pushDrag knock) hands
//    over the body's momentum at chest height: tall narrow things go over
//  - kicks, blows and bullets push what they hit; blasts scatter everything
//  - inhabitants barge through it too (host)
//  - hard landings and falls damage it (glass and crockery break, wood
//    splits); a knocked-over piece stays lying on its side (state.tq)
//  - things lying loose on the floor get kicked along by feet, scattered by blasts
// Co-op: the peer that disturbed it owns the body ('objHold' by 'phys:<id>');
// the others see its proxy slide and tip from the light 'mv' stream pushDrag
// already understands; the resting pose is an 'objRelease' op (logged, saved,
// late joiners). Paper and cloth on the floor keep their own sheets.
import * as THREE from 'three';
import { G } from '../game/G';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { Zone, TileObject } from './zone';
import { objDef, objectGeometry, ObjDef } from './objects';
import { objectMatrix } from './chunkMesher';
import { objFootprint } from './collision';
import { MAT, worldMaterial } from '../gfx/materials';
import { applyHold, pushable } from './destruction';
import { objMass, objMat, objMaxHp, Mat } from './debris';
import { RigidWorld, RBody } from './rigid';
import { floorItems, floorItemsNear, WorldItem } from '../items/worldItems';
import { isSoftItem } from '../items/softItems';
import { itemDef } from '../items/item';
import { noise } from '../actions/world';
import { PK } from '../gore/particles';

interface PB {
  o: TileObject; z: Zone; d: ObjDef; b: RBody; mesh: THREE.Group; c: THREE.Vector3; by: string;
  dmg: number; t: number; calm: number; sendT: number; loopKey: string; removeWait: boolean; done: boolean; dirX: number; dirZ: number;
}
interface ItemMove { wi: WorldItem; vx: number; vy: number; vz: number; spin: number; t: number }
interface Walker { id: string; x: number; y: number; z: number; vx: number; vz: number; r: number; kg: number; local: boolean; move?: (dx: number, dz: number) => void }

/** speed at which a landing starts to hurt, and how much of its hit points a hard one takes */
const BREAK_V: Record<Mat, number> = { glass: 2.2, ceramic: 2.6, elec: 3.6, plastic: 4.6, wood: 5.2, metal: 6.5, fabric: 9, paper: 6, flesh: 4 };
const FRAG: Record<Mat, number> = { glass: 1.3, ceramic: 1.2, elec: 0.6, plastic: 0.4, wood: 0.33, metal: 0.14, fabric: 0.05, paper: 0.2, flesh: 0.5 };
/** impulse (N s) a blow of each kind hands the thing it hits */
const HIT_J: Record<string, number> = { kick: 150, melee: 70, smash: 95, chop: 60, pry: 40, slash: 15, bullet: 22, thrown: 55, blast: 520, creature: 260, vehicle: 900 };
const WHEELS = /chair_office|office_chair|swivel|cart|trolley|gurney|dolly|wheel|stroller|hamper_cart|bin_wheelie/;
const MAX_PROPS = 18;

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class PropPhysics {
  props = new Map<number, PB>();
  items: ItemMove[] = [];
  private owning = new Set<number>();
  private lastPos = new Map<string, [number, number]>();
  private zoneKey = '';
  private blastT = 0;

  constructor(public rw: RigidWorld, private root: THREE.Object3D) {
    const gone = (z: Zone, o: TileObject) => { const pb = this.props.get(o.uid); if (pb && !z.objects.has(o.uid)) this.drop(pb); };
    bus.on('objBroken', gone);
    bus.on('objRemoved', gone);
    // anyone's explosion: chunks, furniture and loose things go flying
    bus.on('explosion', (zk: string, x: number, zz: number, r?: number, power?: number) => { const z = G.zones.get(zk); if (z) this.blast(z, x, zz, r ?? 4, power ?? 1); });
    bus.on('bandDetonate', (e: { id: string }) => { const p = G.players?.get?.(e.id) ?? (G.local?.id === e.id ? G.local : null); if (p) { const z = G.zones.get(p.zoneKey); if (z) this.blast(z, p.x, p.z, 2.2, 0.5); } });
  }

  /** this machine is simulating o (pushDrag skips its proxy) */
  owns(uid: number) { return this.owning.has(uid); }
  get count() { return this.props.size; }

  // ---------------------------------------------------------------- starting a body
  /** lift o off the grid as a body (null: not movable, too many going, already moving) */
  start(z: Zone, o: TileObject, maxMass = 400): PB | null {
    const had = this.props.get(o.uid); if (had) return had.done ? null : had;
    if (this.props.size >= MAX_PROPS || z !== this.rw.zone || !G.local) return null;
    const d = objDef(o.key);
    if (!d || !z.objects.has(o.uid) || !pushable(d, o) || o.state?.held) return null;
    const mass = objMass(d);
    if (mass > maxMass) return null;
    if (G.destruct?.push?.st?.o === o) return null;
    let g: THREE.BufferGeometry | null = null;
    try { g = objectGeometry(d, o); } catch { g = null; }
    if (!g) return null;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3()), half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(_v.set(0.05, 0.05, 0.05));
    const M0 = objectMatrix(z, o, d);
    const p = c.clone().applyMatrix4(M0);
    M0.decompose(_v, _q, _v2);
    const by = 'phys:' + G.local.id;
    const [mu] = G.destruct?.push?.friction?.(z, p.x, p.z, d) ?? [0.3];
    const mat = objMat(d);
    const pb = {} as PB;
    const b = this.rw.add({ kind: 'prop', p, q: _q, h: half, mass, e: mat === 'metal' ? 0.18 : mat === 'fabric' ? 0.04 : 0.1, mu: WHEELS.test(d.key) ? 0.06 : Math.max(0.12, mu), mat, life: Infinity, user: pb, onImpact: (bb2, sp, x, y, zz) => this.impact(pb, sp, x, y, zz) });
    // take it off the grid on every peer
    this.owning.add(o.uid);
    applyHold(z, o, by);
    op('objHold', { z: z.key, uid: o.uid, by });
    const mesh = new THREE.Group();
    const m = new THREE.Mesh(g, d.height > 1.1 || d.tall ? MAT.prop : MAT.propLow);
    m.castShadow = !d.noShadow; m.receiveShadow = true; m.position.copy(c).negate();
    mesh.add(m);
    const ov = G.destruct?.overlayFor?.(o, d);
    if (ov) { const om = new THREE.Mesh(ov, worldMaterial({ alphaTest: 0.5 })); om.renderOrder = 1; om.position.copy(c).negate(); mesh.add(om); }
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    Object.assign(pb, { o, z, d, b, mesh, c, by, dmg: 0, t: 0, calm: 0, sendT: 0, loopKey: 'phys:' + o.uid, removeWait: false, done: false, dirX: 0, dirZ: 0 });
    this.props.set(o.uid, pb);
    this.pose(pb);
    // whatever stood on it falls
    const fp = objFootprint(z, o, d), fh = z.heightAt(o.x, o.y);
    for (const wi of floorItems(z).values()) if (wi.x > fp.x0 - 0.05 && wi.x < fp.x1 + 0.05 && wi.z > fp.z0 - 0.05 && wi.z < fp.z1 + 0.05 && wi.y > fh + 0.08 && wi.vy === undefined) { wi.vy = 0.01; wi.vx = 0; wi.vz = 0; }
    return pb;
  }

  /** shove o: impulse J (N s) along (dx, dz) at height hy above its floor, plus a lift */
  push(z: Zone, o: TileObject, dx: number, dz: number, J: number, hy: number, up = 0, maxMass = 400, at?: { x: number; z: number }, vmax = 6): boolean {
    const pb = this.start(z, o, maxMass); if (!pb) return false;
    const b = pb.b, l = Math.hypot(dx, dz) || 1;
    // a light thing takes the blow as speed, up to what a body could plausibly hand it
    J = Math.min(J, b.m * vmax);
    const px = at?.x ?? b.p.x - dx / l * b.h.x * 0.8, pz = at?.z ?? b.p.z - dz / l * b.h.z * 0.8;
    const py = Math.min(b.p.y + b.h.y * 0.9, z.heightAt(Math.floor(b.p.x), Math.floor(b.p.z)) + hy);
    this.rw.impulse(b, dx / l * J, up * J, dz / l * J, px, py, pz);
    pb.dirX = dx / l; pb.dirZ = dz / l;
    return true;
  }

  /** a body barging into loose furniture at speed (pushDrag.knock delegates here) */
  knock(p: any, o: TileObject, vx: number, vz: number, bodyKg = 70): boolean {
    const z = G.getZone(p.zoneKey);
    const d = objDef(o.key); if (!d || !pushable(d, o)) return false;
    const mass = objMass(d);
    if (mass > 180) return false;
    const v = Math.hypot(vx, vz) || 1;
    const [, muS] = G.destruct?.push?.friction?.(z, p.x, p.z, d) ?? [0.3, 0.4];
    const J = bodyKg * v * 0.75, need = muS * mass * 9.8 * 0.2;
    if (J < need) return false;
    if (!this.push(z, o, vx, vz, J - need * 0.5, 0.95, 0.05, 180)) return false;
    G.audio?.at?.('dmg_hit_' + hitKey(objMat(d)), p.x + vx / v * 0.5, p.z + vz / v * 0.5, Math.min(1, 0.4 + J / 400));
    noise(p, p.x, p.z, 8 + J / 60, 'smash');
    return true;
  }

  /** a blow, a kick or a shot landed on o (DestructionSystem.onHit) */
  hit(z: Zone, o: TileObject, d: ObjDef, a: { d: number; how: string; by: string | null; hx: number; hy: number; hz: number; dx: number; dz: number }) {
    if (a.by ? a.by !== G.local?.id : G.role === 'client') return;
    if ((o.hp ?? 1) <= 0) return; // it is about to break
    const J = (HIT_J[a.how] ?? 0) * (0.7 + Math.min(1.5, a.d / 20));
    if (J <= 0) return;
    const mass = objMass(d);
    // static friction first: a light tap does not move a dresser
    if (J < mass * 9.8 * 0.35 * 0.15) return;
    this.push(z, o, a.dx, a.dz, J, Math.max(0.1, a.hy - z.heightAt(o.x, o.y)), a.how === 'blast' ? 0.35 : 0.04, a.how === 'blast' ? 600 : 300, { x: a.hx, z: a.hz }, a.how === 'blast' ? 9 : a.how === 'bullet' ? 2.5 : 5);
    if (a.how === 'blast' && G.time - this.blastT > 0.2) { this.blastT = G.time; this.blast(z, a.hx - a.dx * 1.5, a.hz - a.dz * 1.5, 3, 0.8, false); }
  }

  /** an explosion at (x, zz): chunks, furniture and loose items fly outward */
  blast(z: Zone, x: number, zz: number, r: number, power: number, props = true) {
    if (z !== this.rw.zone) return;
    const fy = z.heightAt(Math.floor(x), Math.floor(zz));
    this.rw.blast(x, fy + 0.4, zz, r, power);
    if (props && G.role !== 'client') {
      const seen = new Set<number>();
      for (let ty = Math.floor(zz - r); ty <= Math.floor(zz + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (!z.inb(tx, ty)) continue;
        for (const o of z.objectsAt(tx, ty)) {
          if (seen.has(o.uid)) continue; seen.add(o.uid);
          const d = objDef(o.key); if (!d) continue;
          const f = objFootprint(z, o, d), cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2, dd = Math.hypot(cx - x, cz - zz);
          if (dd > r) continue;
          const k = (1 - dd / r) * power;
          this.push(z, o, cx - x || 0.01, cz - zz, 900 * k, 0.3, 0.45, 600, undefined, 3 + 7 * k);
        }
      }
    }
    for (const wi of floorItemsNear(z, x, zz, r)) {
      if (isSoftItem(wi.item.key)) continue;
      const dx = wi.x - x, dz = wi.z - zz, dd = Math.hypot(dx, dz) || 0.1;
      if (dd > r) continue;
      const k = (1 - dd / r) * power, sp = Math.min(9, k * 9 / Math.sqrt(Math.max(0.2, itemDef(wi.item.key).weight ?? 0.5)));
      this.kickItem(wi, dx / dd * sp, 1 + sp * 0.5, dz / dd * sp);
    }
  }

  // ---------------------------------------------------------------- per frame
  /** before the solver runs: who is walking where, what they shove */
  pre(dt: number) {
    const z = this.rw.zone;
    if (!z || z.key !== this.zoneKey) { this.zoneChanged(z); if (!z) return; }
    const walkers = this.walkers(z, dt);
    this.rw.movers.length = 0;
    for (const w of walkers) {
      this.rw.movers.push({ x: w.x, y: w.y, z: w.z, r: 0.16, vx: w.vx, vz: w.vz, kg: w.kg });
      const sp = Math.hypot(w.vx, w.vz);
      // walking into light furniture
      if (sp > 0.45 && (w.local || G.role !== 'client')) this.walkInto(z, w, sp);
      // bodies already loose: pushed out of the walker
      for (const pb of this.props.values()) if (!pb.done) this.pushOut(pb, w);
      // feet through loose things on the floor
      if (sp > 1) for (const wi of floorItemsNear(z, w.x, w.z, 0.34)) {
        if (isSoftItem(wi.item.key) || wi.vy !== undefined || this.items.some((m) => m.wi === wi)) continue;
        const dx = wi.x - w.x, dz = wi.z - w.z, dd = Math.hypot(dx, dz);
        if (dd > 0.3 || wi.y > z.heightAt(Math.floor(wi.x), Math.floor(wi.z)) + 0.08) continue;
        if (dx * w.vx + dz * w.vz < 0) continue;
        const kg = Math.max(0.1, itemDef(wi.item.key).weight ?? 0.5);
        const k = Math.min(1, 1.2 / Math.sqrt(kg)) * (0.6 + Math.random() * 0.5);
        this.kickItem(wi, w.vx * k + dx * 1.5, 0.4 + Math.random() * 0.6 * k, w.vz * k + dz * 1.5);
        if (kg < 2) G.audio?.at?.(kg < 0.5 ? 'plastic_tap' : 'metal_clank', wi.x, wi.z, 0.25);
      }
    }
  }

  /** after the solver: draw, stream, settle */
  post(dt: number) {
    const z = this.rw.zone;
    for (const pb of [...this.props.values()]) {
      if (pb.removeWait) {
        if (!z || !z.dirtyChunks.has(z.chunkOf(pb.o.x, pb.o.y))) this.dispose(pb);
        continue;
      }
      pb.t += dt;
      this.pose(pb);
      this.sounds(pb);
      this.send(pb, dt);
      const b = pb.b;
      // settled (asleep, or no more than a creep for a moment), or it has had its time
      pb.calm = b.v.lengthSq() < 0.02 && b.w.lengthSq() < 0.3 && b.air < 3 ? pb.calm + dt : 0;
      if ((!b.awake && b.slept > 0.2) || pb.calm > 0.6 || pb.t > 9 || b.dead) this.finish(pb);
      else if (b.awake) b.slept = 0;
      if (!b.awake) b.slept += dt;
    }
    if (z) this.updateItems(z, dt);
  }

  private walkers(z: Zone, dt: number): Walker[] {
    const out: Walker[] = [];
    const p = G.local;
    if (p && p.zoneKey === z.key && p.alive && !p.inVehicle) {
      out.push({ id: p.id, x: p.x, y: z.heightAt(p.tileX(), p.tileY()), z: p.z, vx: p.vx, vz: p.vz, r: p.radius + 0.05, kg: 70 + (p.body?.skill?.('strength') ?? 0) * 3, local: true, move: (dx, dz) => { p.x += dx; p.z += dz; } });
    }
    if (G.role !== 'client' && dt > 0) {
      const list = G.creatures?.list?.() ?? [];
      for (const c of list) {
        if (c.dead || c.zoneKey !== z.key) continue;
        const l = this.lastPos.get(c.id);
        this.lastPos.set(c.id, [c.x, c.z]);
        if (!l) continue;
        let vx = (c.x - l[0]) / dt, vz = (c.z - l[1]) / dt;
        const s = Math.hypot(vx, vz);
        if (s > 9) { vx = vx / s * 9; vz = vz / s * 9; }
        const r = c.radius ?? 0.3, h = c.height ?? 1.4;
        out.push({ id: c.id, x: c.x, y: z.heightAt(Math.floor(c.x), Math.floor(c.z)) + (c.y > 0.05 ? c.y : 0), z: c.z, vx, vz, r: r + 0.04, kg: Math.max(4, Math.min(900, 70 * (r / 0.3) * (r / 0.3) * (h / 1.6))), local: false });
      }
      if (this.lastPos.size > 200) this.lastPos.clear();
    }
    return out;
  }

  /** a walker pressing into a light piece of furniture starts it moving */
  private walkInto(z: Zone, w: Walker, sp: number) {
    const lim = w.local ? (sp > 3 ? 60 : 32) : w.kg * 0.6;
    const tx = Math.floor(w.x), ty = Math.floor(w.z);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!z.inb(tx + dx, ty + dy)) continue;
      for (const o of z.objectsAt(tx + dx, ty + dy)) {
        if (this.props.has(o.uid) || o.state?.held) continue;
        const d = objDef(o.key);
        if (!d || (d.block ?? 'solid') === 'none' || !pushable(d, o)) continue;
        const mass = objMass(d);
        if (mass > lim) continue;
        const f = objFootprint(z, o, d);
        const cx = Math.max(f.x0, Math.min(w.x, f.x1)), cz = Math.max(f.z0, Math.min(w.z, f.z1));
        const dist = Math.hypot(cx - w.x, cz - w.z);
        if (dist > w.r + 0.04) continue;
        if ((cx - w.x) * w.vx + (cz - w.z) * w.vz < 0.35 * sp * Math.max(0.05, dist)) continue;
        if (this.start(z, o, lim)) { G.audio?.at?.('dmg_hit_' + hitKey(objMat(d)), cx, cz, Math.min(0.7, 0.2 + sp * 0.12)); return; }
      }
    }
  }

  /** walker (a vertical capsule) against a loose body: both give, by weight; the body is pushed where it was touched */
  private pushOut(pb: PB, w: Walker) {
    const b = pb.b;
    if (Math.abs(b.p.x - w.x) > b.h.length() + w.r + 0.2 || Math.abs(b.p.z - w.z) > b.h.length() + w.r + 0.2) return;
    const R = b.R;
    for (const hs of [0.25, 0.6]) {
      const px = w.x, py = w.y + hs, pz = w.z;
      const dx = px - b.p.x, dy = py - b.p.y, dz = pz - b.p.z;
      let lx = R[0] * dx + R[3] * dy + R[6] * dz, ly = R[1] * dx + R[4] * dy + R[7] * dz, lz = R[2] * dx + R[5] * dy + R[8] * dz;
      lx = Math.max(-b.h.x, Math.min(b.h.x, lx)); ly = Math.max(-b.h.y, Math.min(b.h.y, ly)); lz = Math.max(-b.h.z, Math.min(b.h.z, lz));
      const cx = b.p.x + R[0] * lx + R[1] * ly + R[2] * lz, cy = b.p.y + R[3] * lx + R[4] * ly + R[5] * lz, cz = b.p.z + R[6] * lx + R[7] * ly + R[8] * lz;
      if (Math.abs(cy - py) > 0.3) continue;
      let nx = px - cx, nz = pz - cz;
      let d = Math.hypot(nx, nz);
      if (d >= w.r) continue;
      if (d < 1e-4) { nx = px - b.p.x; nz = pz - b.p.z; d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d; d = 0; } else { nx /= d; nz /= d; }
      const depth = w.r - d;
      const share = w.kg / (w.kg + b.m);
      this.rw.wake(b);
      b.p.x -= nx * depth * share; b.p.z -= nz * depth * share; b.dirty = true;
      if (w.move) w.move(nx * depth * (1 - share), nz * depth * (1 - share));
      // match the walker's speed into it (an impulse at the contact: low pushes slide, high ones tip)
      const vw = -(w.vx * nx + w.vz * nz);
      const vb = -(b.v.x * nx + b.v.z * nz);
      if (vw > vb) {
        const red = (w.kg * b.m) / (w.kg + b.m);
        const j = (vw - vb) * red * 0.9;
        this.rw.impulse(b, -nx * j, 0, -nz * j, cx, cy, cz);
        pb.dirX = -nx; pb.dirZ = -nz;
      }
      return;
    }
  }

  private impact(pb: PB, sp: number, x: number, _y: number, z: number) {
    if (pb.done) return;
    const mat = pb.b.mat as Mat;
    if (sp > 1.4) G.audio?.at?.('dmg_hit_' + hitKey(mat), x, z, Math.min(1, 0.2 + sp * 0.1 + Math.min(0.3, pb.b.m / 200)));
    if (sp > 3 && pb.b.m > 20) { try { (G.camera as any)?.shake?.(Math.min(0.25, pb.b.m / 600 * sp / 4), 0.2); } catch { /* no camera shake */ } }
    if (sp > 2.5 && G.local) noise(G.local, x, z, 6 + sp * 1.5 + pb.b.m / 20, 'smash');
    const thr = BREAK_V[mat] ?? 5;
    if (sp > thr) pb.dmg = Math.min(objMaxHp(pb.d) * 2, pb.dmg + objMaxHp(pb.d) * Math.min(1.5, (sp - thr) / thr) * (FRAG[mat] ?? 0.3));
    // dust off the floor where it slammed down
    const D = G.destruct?.dust;
    if (D && sp > 2.2) for (let k = 0; k < Math.min(10, sp * 2); k++) D.add(PK.Dust, x, pb.z.heightAt(Math.floor(x), Math.floor(z)) + 0.03, z, (Math.random() - 0.5) * 1.6, Math.random() * 0.4, (Math.random() - 0.5) * 1.6, 0.02 + Math.random() * 0.02, 1 + Math.random() * 1.5, 0xb0a896);
  }

  private pose(pb: PB) {
    const b = pb.b;
    _m.compose(b.p, b.q, _s);
    pb.mesh.matrix.copy(_m);
    pb.mesh.matrixWorldNeedsUpdate = true;
  }

  private sounds(pb: PB) {
    const b = pb.b;
    const hs = Math.hypot(b.v.x, b.v.z);
    const sliding = b.awake && b.air < 2 && hs > 0.25;
    const key = sliding ? (b.mat === 'metal' || b.mat === 'elec' ? 'dmg_scrape_metal' : b.mat === 'fabric' ? 'dmg_scrape_soft' : 'dmg_scrape_wood') : null;
    const roll = WHEELS.test(pb.d.key);
    G.audio?.positionalLoop?.(pb.loopKey, key, b.p.x, b.p.z, (roll ? 0.2 : 0.35) + Math.min(0.45, b.m / 200) * Math.min(1, hs), (roll ? 1.3 : 0.75) + Math.min(0.6, hs * 0.4), 22);
  }

  /** others see it slide and tip (pushDrag's proxy stream) */
  private send(pb: PB, dt: number) {
    pb.sendT -= dt;
    if (pb.sendT > 0 || G.role === 'solo') return;
    pb.sendT = 0.1;
    const b = pb.b;
    const O = _v.copy(pb.c).applyQuaternion(b.q).negate().add(b.p);
    const up = _v2.set(0, 1, 0).applyQuaternion(b.q);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const ev: any = { t: 'D', k: 'mv', z: pb.z.key, u: pb.o.uid, x: r2(O.x), zz: r2(O.z), m: b.awake ? 1 : 0 };
    const fh = pb.z.heightAt(Math.floor(O.x), Math.floor(O.z));
    if (O.y - fh > 0.01) ev.y = r2(O.y - fh);
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
    if (tilt > 0.05) { const l = Math.hypot(up.x, up.z) || 1; ev.a = r2(tilt); ev.dx = r2(up.x / l); ev.dz = r2(up.z / l); }
    G.net?.broadcastFx?.('gore', ev);
  }

  /** it came to rest: back on the grid where it lies (an op), damage from the landing */
  private finish(pb: PB) {
    if (pb.done) return;
    pb.done = true;
    const z = pb.z, o = pb.o, d = pb.d, b = pb.b;
    G.audio?.positionalLoop?.(pb.loopKey, null);
    this.rw.remove(b);
    if (!z.objects.has(o.uid)) { this.dispose(pb); return; }
    const Q = b.q;
    const O = new THREE.Vector3().copy(pb.c).applyQuaternion(Q).negate().add(b.p);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
    const w = d.w ?? 1, dd = d.d ?? 1, rot = o.rot;
    const rw = rot % 2 === 0 ? w : dd, rd = rot % 2 === 0 ? dd : w;
    let yaw: number | undefined, tq: number[] | undefined, sy: number | undefined;
    if (up.y > 0.985) {
      const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(Q);
      let a = Math.atan2(-ax.z, ax.x) + rot * Math.PI / 2;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      yaw = Math.abs(a) < 0.01 ? 0 : r3(a);
    } else {
      // lying over: the full turn relative to its quarter rotation
      const t = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot * Math.PI / 2).multiply(Q).normalize();
      tq = [r3(t.x), r3(t.y), r3(t.z), r3(t.w)];
      yaw = 0;
    }
    let tx = Math.round(O.x - rw / 2), ty = Math.round(O.z - rd / 2);
    const ok = (x: number, y: number) => z.inb(x, y) && !!z.floor[z.idx(x, y)];
    let cx = O.x, cz = O.z;
    if (!ok(Math.floor(cx), Math.floor(cz)) || !ok(tx, ty)) { tx = o.x; ty = o.y; cx = o.x + rw / 2 + (o.ox ?? 0); cz = o.y + rd / 2 + (o.oz ?? 0); }
    if (tq) sy = r3(Math.max(0, O.y - z.heightAt(tx, ty)));
    op('objRelease', { z: z.key, uid: o.uid, by: pb.by, x: tx, y: ty, ox: r3(cx - rw / 2 - tx), oz: r3(cz - rd / 2 - ty), rot, yaw, tq, sy, phys: 1 });
    this.owning.delete(o.uid);
    pb.removeWait = true;
    if (pb.dmg > 1 && z.objects.has(o.uid)) {
      try { G.destruct?.damageObject?.(null, o, Math.round(pb.dmg), 'crush', { x: b.p.x, y: b.p.y, z: b.p.z }, [pb.dirX || 0.01, pb.dirZ]); } catch (e) { console.warn('prop damage', e); }
    }
  }

  /** forget a body without placing it (it broke, the zone went) */
  private drop(pb: PB) {
    pb.done = true;
    G.audio?.positionalLoop?.(pb.loopKey, null);
    this.rw.remove(pb.b);
    this.owning.delete(pb.o.uid);
    this.dispose(pb);
  }
  private dispose(pb: PB) {
    this.root.remove(pb.mesh);
    this.props.delete(pb.o.uid);
  }

  private zoneChanged(z: Zone | null) {
    // settle what was going where it is (before the solver forgets it)
    for (const pb of [...this.props.values()]) { if (!pb.done) this.finish(pb); this.dispose(pb); }
    this.items.length = 0;
    this.lastPos.clear();
    this.zoneKey = z?.key ?? '';
    // a body left mid-flight in a save or by a peer that left: put it down where it is
    if (z && G.local && G.role !== 'client') for (const o of z.objects.values()) {
      const h = o.state?.held;
      if (typeof h === 'string' && h.startsWith('phys:') && !this.owning.has(o.uid)) {
        const mine = h === 'phys:' + G.local.id;
        const other = G.players?.get?.(h.slice(5));
        if (mine || !other) op('objRelease', { z: z.key, uid: o.uid, by: h, x: o.x, y: o.y, ox: o.ox ?? 0, oz: o.oz ?? 0, rot: o.rot, phys: 1, yaw: o.state.yaw, tq: o.state.tq, sy: o.state.tq ? o.state.y : undefined });
      }
    }
  }

  // ---------------------------------------------------------------- loose items on the floor
  kickItem(wi: WorldItem, vx: number, vy: number, vz: number) {
    if (this.items.length > 40) return;
    const had = this.items.find((m) => m.wi === wi);
    if (had) { had.vx += vx; had.vy = Math.max(had.vy, vy); had.vz += vz; return; }
    this.items.push({ wi, vx, vy, vz, spin: (Math.random() - 0.5) * 12, t: 0 });
  }

  private updateItems(z: Zone, dt: number) {
    const fl = floorItems(z);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i], wi = m.wi;
      if (!fl.has(wi.item.uid) || m.t > 6) { this.items.splice(i, 1); continue; }
      m.t += dt;
      m.vy -= 9.8 * dt;
      const ox = wi.x, oz = wi.z;
      let nx = ox + m.vx * dt, nz = oz + m.vz * dt;
      // walls and void: bounce back off the tile edge it would cross
      const tx = Math.floor(ox), ty = Math.floor(oz), ntx = Math.floor(nx), nty = Math.floor(nz);
      const blocked = (dx: number, dy: number) => z.edgeBlocks(tx, ty, dx, dy, 'walk') || !z.inb(tx + dx, ty + dy) || !z.floor[z.idx(tx + dx, ty + dy)] || z.solid[z.idx(tx + dx, ty + dy)] === 1;
      if (ntx !== tx && blocked(ntx - tx, 0)) { nx = ox; m.vx *= -0.4; }
      if (nty !== ty && blocked(0, nty - ty)) { nz = oz; m.vz *= -0.4; }
      wi.x = nx; wi.z = nz; wi.y += m.vy * dt;
      wi.rot += m.spin * dt;
      const fy = z.heightAt(Math.floor(wi.x), Math.floor(wi.z));
      if (wi.y <= fy) {
        wi.y = fy;
        if (m.vy < -1.4) { m.vy = -m.vy * 0.3; m.vx *= 0.6; m.vz *= 0.6; m.spin *= 0.6; G.audio?.at?.('plastic_tap', wi.x, wi.z, Math.min(0.4, -m.vy * 0.1)); }
        else {
          m.vy = 0;
          const f = Math.exp(-5 * dt); m.vx *= f; m.vz *= f; m.spin *= Math.exp(-6 * dt);
          if (m.vx * m.vx + m.vz * m.vz < 0.01) { this.items.splice(i, 1); continue; }
        }
      }
    }
  }
}

function hitKey(m: Mat | string): string {
  return m === 'wood' || m === 'paper' ? 'wood' : m === 'metal' || m === 'elec' ? 'metal' : m === 'fabric' || m === 'flesh' ? 'fabric' : m === 'plastic' ? 'plastic' : 'hard';
}

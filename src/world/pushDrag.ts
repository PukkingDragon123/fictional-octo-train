// Moving furniture by hand, with physics. A survivor gets hold of a piece (op
// 'objHold': it leaves the tile grid on every peer and is drawn as a proxy)
// and then it is a body with mass on a floor with friction:
//  - W leans into it (push), S hauls it back (pull / drag), A/D side-step it,
//    in the frame of the grab; Shift is power (more force, faster, stamina)
//  - static friction holds it until the push beats it (heavy wardrobes on
//    carpet need Shift), then kinetic friction and inertia: heavy things take
//    a while to get going and slide on when let go; wheels roll far
//  - it scrapes (a loop by material and speed), scuffs and smears the floor,
//    bangs into walls and furniture (both take damage), and tall narrow things
//    topple over and smash when shoved or rammed hard
//  - small things are lifted and carried instead, and can be thrown
// Letting go writes where it ended up (op 'objRelease', bus 'objPushed'), so it
// can be shoved onto a press-machine plate. Other peers see it move from a
// light stream of positions (fx on the gore channel, not logged).
import * as THREE from 'three';
import { G } from '../game/G';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { clamp } from '../core/math';
import { moveCircle } from './collision';
import { Zone, TileObject } from './zone';
import { objDef, objectGeometry, ObjDef } from './objects';
import { objectMatrix } from './chunkMesher';
import { MAT, worldMaterial } from '../gfx/materials';
import type { Player } from '../entities/player';
import { applyHold, pushable } from './destruction';
import { objMass, objMat, objMaxHp } from './debris';
import type { TimedAction } from '../actions/action';
import { noise } from '../actions/world';
import { shake, hitstop } from '../gfx/juice';

const GRAV = 9.8;
/** kinetic / static friction coefficients by floor (furniture feet on it) */
const FLOOR_MU: Record<string, [number, number]> = {
  carpet: [0.33, 0.4], wetcarpet: [0.3, 0.36], tile: [0.24, 0.34], linoleum: [0.22, 0.32], concrete: [0.32, 0.44],
  wood: [0.27, 0.37], metal: [0.24, 0.34], grass: [0.6, 0.75], dirt: [0.55, 0.7], gravel: [0.68, 0.82], water: [0.2, 0.28], deep: [0.15, 0.2],
};
const WHEELS = /chair_office|office_chair|swivel|cart|trolley|gurney|dolly|wheel|stroller|hamper_cart|bin_wheelie/;
const DRAWERS = /desk|dresser|drawer|filing|nightstand|bureau|cabinet|chest_of|sideboard|vanity|counter_unit/;

interface PushState {
  o: TileObject; z: Zone; d: ObjDef; action: TimedAction;
  mode: 'push' | 'carry';
  relX: number; relZ: number; mass: number; mu: number; muS: number; muT: number;
  vx: number; vz: number; cx: number; cz: number; px: number; pz: number; x0: number; z0: number;
  rw: number; rd: number; h: number; lift: number; tall: boolean;
  effort: number; stuck: number; strainSaid: boolean; pullT: number; breathT: number;
  free: boolean; pendDmg: number; by: string;
  thrown: { vy: number; y: number } | null;
  topple: { dx: number; dz: number; ang: number; av: number } | null;
  sendT: number; smearD: number; scuffD: number; moving: number; loopKey: string; t: number;
}
interface Proxy { uid: number; zone: string; mesh: THREE.Group; o: TileObject; d: ObjDef; x: number; z: number; tx: number; tz: number; lift: number; tl: number; tdx: number; tdz: number; moving: number; local: boolean; removeWait: boolean; loopKey: string }

const ROT = [0, 1, 2, 3].map((r) => new THREE.Matrix4().makeRotationY(-r * Math.PI / 2));
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _ax = new THREE.Vector3();
const _mover = { x: 0, z: 0, radius: 0.26 };

export class PushDrag {
  st: PushState | null = null;
  proxies = new Map<number, Proxy>();

  constructor() {
    bus.on('objHeld', (z: Zone, o: TileObject, by: string) => this.held(z, o, by));
  }

  /** the heaviest thing a survivor will even try to get hold of */
  maxMass(p: Player) { return 600 + p.body.skill('strength') * 60; }
  /** the most force a survivor can put into it (N) */
  force(p: Player, power: boolean) {
    const L = p.body.severed?.length ? p.body.limbs() : null;
    const hands = L ? (L.twoHand ? 1 : 0.55) : 1;
    return (400 + p.body.skill('strength') * 35 + (p.body.has?.('strong') ? 90 : 0)) * (power ? 2 : 1) * (p.body.endurance < 0.15 ? 0.55 : 1) * hands;
  }
  /** light and small enough to pick up and carry (power: heave something heavier) */
  liftable(p: Player, o: TileObject, power = false): boolean {
    const d = objDef(o.key); if (!d || !pushable(d, o)) return false;
    if ((d.w ?? 1) > 1 || (d.d ?? 1) > 1 || d.height > 1.3) return false;
    return objMass(d) <= (16 + p.body.skill('strength') * 2.5) * (power ? 1.6 : 1);
  }
  isDrawer(d: ObjDef) { return DRAWERS.test(d.key) || !!d.containers?.length; }

  /** start holding o (called from PushAction.start on the local machine) */
  begin(p: Player, o: TileObject, mode: 'push' | 'drag' | 'carry', action: TimedAction): boolean {
    const z = G.getZone(p.zoneKey);
    const d = objDef(o.key);
    if (!d || !z.objects.has(o.uid) || !pushable(d, o)) return false;
    if (this.st) this.finish();
    const mass = objMass(d);
    if (mass > this.maxMass(p)) {
      bus.emit('think', p, mass > 800 ? "That's not moving. Not without a forklift." : "Not a chance. It weighs a ton.");
      G.audio?.at?.('dmg_stuck', p.x, p.z, 0.8);
      p.body.endurance = Math.max(0, p.body.endurance - 0.03);
      return false;
    }
    const m = objectMatrix(z, o, d);
    const cx = m.elements[12], cz = m.elements[14];
    const w = d.w ?? 1, dd = d.d ?? 1;
    const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    // close enough to put hands on it?
    const nx = Math.max(cx - rw / 2, Math.min(p.x, cx + rw / 2)), nz = Math.max(cz - rd / 2, Math.min(p.z, cz + rd / 2));
    if (Math.hypot(nx - p.x, nz - p.z) > 0.95) { bus.emit('think', p, "I can't reach it from here."); return false; }
    const carry = mode === 'carry';
    applyHold(z, o, p.id);
    op('objHold', { z: z.key, uid: o.uid, by: p.id });
    const [mu, muS] = this.friction(z, cx, cz, d);
    this.st = {
      o, z, d, action, mode: carry ? 'carry' : 'push', relX: cx - p.x, relZ: cz - p.z, mass, mu, muS, muT: 0,
      vx: 0, vz: 0, cx, cz, px: p.x, pz: p.z, x0: cx, z0: cz, rw, rd, h: d.height, lift: 0,
      tall: d.height >= 1.35 && d.height / Math.max(0.2, Math.min(rw, rd)) >= 1.6,
      effort: 0, stuck: 0, strainSaid: false, pullT: 0, breathT: 1, free: false, pendDmg: 0, by: p.id,
      thrown: null, topple: null, sendT: 0, smearD: 0, scuffD: 0, moving: 0, loopKey: 'push:' + o.uid, t: 0,
    };
    G.audio?.at?.('dmg_grab', cx, cz, 0.7);
    if (carry) { G.audio?.itemSound?.('crate', 'pick', p); if (mass > 12) G.audio?.at?.('breath', p.x, p.z, 0.4); }
    bus.emit('grabbed', p, o, this.st.mode);
    return true;
  }

  /**
   * Let go. Something still moving keeps sliding (inertia) until friction
   * stops it; then where it ended up is written (finish).
   */
  end(why = '') {
    const st = this.st; if (!st) return;
    if (st.free || st.thrown || st.topple) return;
    const sp = Math.hypot(st.vx, st.vz);
    if (why !== 'zone' && why !== 'lost' && st.mode === 'push' && sp > 0.22) { st.free = true; this.detach(); return; }
    this.finish();
  }

  /** the survivor stops being part of it (the action ends, the object may still move) */
  private detach() {
    const st = this.st; if (!st) return;
    const p = G.local;
    if (p && p.actions.current === st.action) { st.action.done = true; }
  }

  /** write where it is (and what the bumps did to it) */
  private finish() {
    const st = this.st; if (!st) return;
    this.st = null;
    const { o, z, d } = st;
    G.audio?.positionalLoop?.(st.loopKey, null);
    const p = G.local;
    if (p && p.actions.current === st.action) st.action.done = true;
    if (!z.objects.has(o.uid)) return;
    // carried things are set down somewhere they fit
    if (st.mode === 'carry' && !this.canPlace(z, st, st.cx, st.cz)) {
      const spot = this.findSpot(z, st);
      st.cx = spot[0]; st.cz = spot[1];
    }
    const ax = Math.floor(st.cx - st.rw / 2 + 0.5), ay = Math.floor(st.cz - st.rd / 2 + 0.5);
    const ox = Math.round((st.cx - (ax + st.rw / 2)) * 100) / 100, oz = Math.round((st.cz - (ay + st.rd / 2)) * 100) / 100;
    op('objRelease', { z: z.key, uid: o.uid, by: st.by, x: ax, y: ay, ox, oz });
    G.audio?.at?.(st.mode === 'carry' ? 'thud_soft' : scrapeKey(d).replace('scrape', 'debris'), st.cx, st.cz, 0.5);
    if (st.pendDmg > 0.5) G.destruct?.damageObject?.(p ?? null, o, Math.round(st.pendDmg * 10) / 10, st.topple ? 'topple' : st.thrown ? 'thrown' : 'crush', undefined, [st.vx || 0.01, st.vz]);
  }

  /** a carried thing that will not fit where it is: nearest free spot around it, else where it came from */
  private findSpot(z: Zone, st: PushState): [number, number] {
    for (let r = 0.15; r <= 0.9; r += 0.15) for (let a = 0; a < 8; a++) {
      const x = st.cx + Math.cos(a * Math.PI / 4) * r, zz = st.cz + Math.sin(a * Math.PI / 4) * r;
      if (this.canPlace(z, st, x, zz)) return [x, zz];
    }
    return [st.x0, st.z0];
  }

  /** Space while holding: a hard shove. It flies off the hands; tall things go over */
  shove(p: Player) {
    const st = this.st; if (!st || st.free || st.thrown || st.topple) return;
    if (st.mode === 'carry') { this.throw(p); return; }
    const power = G.input.down('power') || G.input.down('run');
    const L = Math.hypot(st.relX, st.relZ) || 1;
    const J = (power ? 420 : 280) * (1 + p.body.skill('strength') * 0.06);
    const need = st.muS * st.mass * GRAV * 0.35;
    if (J < need) { bus.emit('think', p, "It barely rocks."); G.audio?.at?.('dmg_stuck', st.cx, st.cz, 0.7); return; }
    const dv = (J - need) / st.mass;
    st.vx += st.relX / L * dv; st.vz += st.relZ / L * dv;
    p.body.endurance = Math.max(0, p.body.endurance - (power ? 0.07 : 0.04));
    p.actionAnim = 'shove'; p.actionT = 0; p.actionDur = 0.45;
    setTimeout(() => { if (p.actionAnim === 'shove') p.actionAnim = ''; }, 450);
    G.audio?.at?.('shove', p.x, p.z, 0.8);
    if (st.tall && dv > 0.9) { this.startTopple(st, st.relX / L, st.relZ / L); this.detach(); return; }
    st.free = true; this.detach();
  }

  /** LMB / Space while carrying: throw it where the survivor aims */
  throw(p: Player) {
    const st = this.st; if (!st || st.mode !== 'carry' || st.thrown) return;
    const power = G.input.down('power') || G.input.down('run');
    let ang = p.facing;
    const ax = p.aimX - p.x, az = p.aimZ - p.z;
    if (Math.hypot(ax, az) > 0.6) ang = Math.atan2(az, ax);
    const sp = clamp(8.5 - st.mass * 0.28, 2.5, 8) * (power ? 1.25 : 1) * (1 + p.body.skill('strength') * 0.03);
    st.vx = Math.cos(ang) * sp; st.vz = Math.sin(ang) * sp;
    st.thrown = { vy: 2.2 + sp * 0.12, y: st.lift };
    p.body.endurance = Math.max(0, p.body.endurance - 0.03 - st.mass * 0.003);
    p.facing = p.targetFacing = ang;
    p.actionAnim = 'throw'; p.actionT = 0; p.actionDur = 0.55;
    setTimeout(() => { if (p.actionAnim === 'throw') p.actionAnim = ''; }, 550);
    G.audio?.at?.('whoosh', p.x, p.z, 0.8);
    noise(p, p.x, p.z, 6, 'thrown');
    this.detach();
  }

  forget(uid: number) {
    if (this.st?.o.uid === uid) { G.audio?.positionalLoop?.(this.st.loopKey, null); this.st = null; }
    const pr = this.proxies.get(uid);
    if (pr) { G.audio?.positionalLoop?.(pr.loopKey, null); this.removeProxy(pr); }
  }

  zoneChanged() {
    if (this.st) { this.st.free = false; this.st.thrown = null; this.st.topple = null; this.end('zone'); }
    for (const pr of [...this.proxies.values()]) this.removeProxy(pr);
    // proxies for objects already held in the new zone
    const z = G.view?.zone;
    if (z) for (const o of z.objects.values()) if (o.state?.held) this.held(z, o, o.state.held);
  }

  /** someone took hold of o: show a proxy (here) */
  private held(z: Zone, o: TileObject, by: string) {
    if (z !== G.view?.zone) return;
    const d = objDef(o.key); if (!d) return;
    if (this.proxies.has(o.uid)) return;
    const g = objectGeometry(d, o);
    const mesh = new THREE.Group();
    if (g) {
      const m = new THREE.Mesh(g, d.height > 1.1 || d.tall ? MAT.prop : MAT.propLow);
      m.castShadow = !d.noShadow; m.receiveShadow = true;
      mesh.add(m);
    }
    const ov = G.destruct?.overlayFor?.(o, d);
    if (ov) { const m = new THREE.Mesh(ov, worldMaterial({ alphaTest: 0.5 })); m.renderOrder = 1; mesh.add(m); }
    mesh.matrixAutoUpdate = false;
    const om = objectMatrix(z, o, d);
    const pr: Proxy = { uid: o.uid, zone: z.key, mesh, o, d, x: om.elements[12], z: om.elements[14], tx: om.elements[12], tz: om.elements[14], lift: 0, tl: 0, tdx: 1, tdz: 0, moving: 0, local: by === G.local?.id, removeWait: false, loopKey: 'pushr:' + o.uid };
    this.place(pr, z);
    G.destruct?.root?.add(mesh);
    this.proxies.set(o.uid, pr);
  }

  private place(pr: Proxy, z: Zone) {
    const o = pr.o, d = pr.d;
    const h = z.heightAt(Math.floor(pr.x), Math.floor(pr.z));
    const m = pr.mesh.matrix;
    m.makeTranslation(pr.x, h + (o.state?.y ?? 0) + pr.lift, pr.z);
    m.multiply(ROT[o.rot]);
    if (o.state?.yaw) m.multiply(_r.makeRotationY(o.state.yaw));
    if (pr.tl > 0.001) {
      // toppling: rotate about the bottom edge on the side it falls toward
      const w = d.w ?? 1, dd = d.d ?? 1;
      const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
      const ext = Math.abs(pr.tdx) * rw / 2 + Math.abs(pr.tdz) * rd / 2;
      const ex = pr.x + pr.tdx * ext, ez = pr.z + pr.tdz * ext, ey = h + pr.lift;
      _ax.set(pr.tdz, 0, -pr.tdx).normalize().negate();
      _m.makeTranslation(ex, ey, ez).multiply(_r.makeRotationAxis(_ax, pr.tl)).multiply(_t.makeTranslation(-ex, -ey, -ez));
      m.premultiply(_m);
    }
    pr.mesh.matrixWorldNeedsUpdate = true;
  }

  private removeProxy(pr: Proxy) {
    G.destruct?.root?.remove(pr.mesh);
    this.proxies.delete(pr.uid);
  }

  /** the release landed on this peer: the proxy goes once the chunk with the object is rebuilt */
  released(z: Zone, o: TileObject) {
    const pr = this.proxies.get(o.uid);
    if (!pr) return;
    const d = objDef(o.key)!;
    const m = objectMatrix(z, o, d);
    pr.x = pr.tx = m.elements[12]; pr.z = pr.tz = m.elements[14];
    pr.lift = 0; pr.tl = 0;
    this.place(pr, z);
    pr.removeWait = true; pr.moving = 0;
    G.audio?.positionalLoop?.(pr.loopKey, null);
  }

  onNet(ev: any) {
    if (!ev || ev.k !== 'mv') return;
    const pr = this.proxies.get(ev.u);
    if (!pr || pr.local || pr.zone !== ev.z) return;
    pr.tx = ev.x; pr.tz = ev.zz; pr.moving = ev.m ? 0.4 : 0;
    pr.lift = ev.y ?? 0;
    if (ev.a !== undefined) { pr.tl = ev.a; pr.tdx = ev.dx ?? 1; pr.tdz = ev.dz ?? 0; }
  }

  // ---------------------------------------------------------------- queries for the hint / touch
  /** 0..1: how hard the survivor is straining right now */
  get effort() { return this.st?.effort ?? 0; }
  get holding() { return !!this.st && !this.st.free && !this.st.thrown && !this.st.topple; }
  get mode() { return this.st?.mode ?? null; }

  /** kinetic and static friction of an object's feet on the floor at (x, z) */
  friction(z: Zone, x: number, zz: number, d: ObjDef): [number, number] {
    const f = z.floorAt(Math.floor(x), Math.floor(zz));
    let [mu, muS] = FLOOR_MU[f?.sound ?? 'concrete'] ?? FLOOR_MU.concrete;
    if (f?.friction !== undefined) { const k = f.friction / 0.4; mu *= k; muS *= k; }
    const m = objMat(d);
    if (m === 'metal' || m === 'elec') { mu *= 0.88; muS *= 0.88; }
    else if (m === 'fabric') { mu *= 1.1; muS *= 1.1; }
    if (WHEELS.test(d.key) || d.tags?.includes('wheels')) { mu *= 0.12; muS *= 0.2; }
    const wet = G.gore?.decals?.wetAt?.(z.key, x, zz);
    if (wet && wet.wet > 0.2) { mu *= 0.7; muS *= 0.75; }
    return [mu, muS];
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    try { this.updateLocal(dt); } catch (e) { console.error('pushDrag', e); this.st = null; }
    const z = G.view?.zone;
    for (const pr of [...this.proxies.values()]) {
      if (!z || pr.zone !== z.key) { this.removeProxy(pr); continue; }
      if (pr.removeWait) {
        const o = pr.o;
        if (!z.dirtyChunks.has(z.chunkOf(o.x, o.y))) this.removeProxy(pr);
        continue;
      }
      if (pr.local && this.st?.o === pr.o) {
        pr.x = this.st.cx; pr.z = this.st.cz;
        pr.lift = this.st.thrown ? this.st.thrown.y : this.st.lift;
        if (this.st.topple) { pr.tl = this.st.topple.ang; pr.tdx = this.st.topple.dx; pr.tdz = this.st.topple.dz; }
      } else if (!pr.local) {
        const k = 1 - Math.exp(-10 * dt);
        pr.x += (pr.tx - pr.x) * k; pr.z += (pr.tz - pr.z) * k;
        pr.moving = Math.max(0, pr.moving - dt);
        G.audio?.positionalLoop?.(pr.loopKey, pr.moving > 0 && pr.lift < 0.05 ? scrapeKey(pr.d) : null, pr.x, pr.z, 0.6, 1, 22);
      }
      this.place(pr, z);
    }
  }

  private updateLocal(dt: number) {
    const st = this.st; if (!st) return;
    const p = G.local;
    if (!p || p.zoneKey !== st.z.key || !st.z.objects.has(st.o.uid) || (st.o.state?.held && st.o.state.held !== st.by)) {
      this.st = null; G.audio?.positionalLoop?.(st.loopKey, null);
      // still ours (zone change mid-slide): write it down where it is
      if (st.z.objects.has(st.o.uid) && st.o.state?.held === st.by) this.finishLost(st);
      return;
    }
    st.t += dt;
    if (st.topple) { this.updateTopple(st, dt); this.send(st, dt); return; }
    if (st.thrown) { this.updateThrown(st, dt); this.send(st, dt); return; }
    if (st.free) { this.slide(st, dt); this.sounds(st, Math.hypot(st.vx, st.vz) * dt, dt); this.send(st, dt); return; }
    const cur = p.actions.current;
    if (p.body.dead || p.body.downed || cur !== st.action) { this.end('lost'); return; }
    if (st.mode === 'carry') this.updateCarry(st, p, dt);
    else this.updatePush(st, p, dt);
    if (this.st !== st) return; // let go (a drawer slid out, out of breath)
    this.send(st, dt);
  }
  private finishLost(st: PushState) { this.st = st; st.free = false; st.thrown = null; st.topple = null; this.finish(); }

  private updatePush(st: PushState, p: Player, dt: number) {
    const z = st.z, inp = G.input;
    // the load decides how far the survivor gets: undo what normal walking did this frame
    p.x = st.px; p.z = st.pz;
    const L = Math.hypot(st.relX, st.relZ) || 1;
    const ax = st.relX / L, az = st.relZ / L;
    // A/D side-steps it: the camera's right, made perpendicular to the grab
    const yaw = G.pr.yaw;
    let sx = Math.cos(yaw), sz = -Math.sin(yaw);
    const dp = sx * ax + sz * az; sx -= dp * ax; sz -= dp * az;
    let sl = Math.hypot(sx, sz); if (sl < 0.2) { sx = -az; sz = ax; sl = 1; }
    sx /= sl; sz /= sl;
    const blocked = !!G.ui?.blocksMovement?.();
    const mv = blocked ? { x: 0, y: 0, mag: 0 } : inp.moveAxis();
    const fwd = mv.y * mv.mag, side = mv.x * mv.mag;
    const power = inp.down('power') || inp.down('run') || inp.runLatch;
    const mods = p.body.mods(p.heavyLoad());
    const vF = (fwd >= 0 ? 1.35 : 1.1) * (power ? 1.5 : 1) * mods.move, vS = 0.7 * (power ? 1.25 : 1) * mods.move;
    const vdx = ax * fwd * vF + sx * side * vS, vdz = az * fwd * vF + sz * side * vS;
    const want = Math.hypot(vdx, vdz) > 0.02;
    const into = vdx * ax + vdz * az;
    // a drawer slides out when it is pulled gently
    if (into < -0.05 && !power && st.o.inv && this.isDrawer(st.d)) {
      st.pullT += dt;
      if (st.pullT > 0.18) {
        const o = st.o, d = st.d;
        G.audio?.at?.(objMat(d) === 'metal' ? 'drawer_metal' : 'drawer_wood', st.cx, st.cz, 0.8);
        this.finish();
        G.grab?.openLoot?.(p, o.inv, o);
        return;
      }
    } else st.pullT = 0;
    // friction under it (it changes from carpet to tile as it goes)
    st.muT -= dt;
    if (st.muT <= 0) { st.muT = 0.25; [st.mu, st.muS] = this.friction(z, st.cx, st.cz, st.d); }
    let Fmax = this.force(p, power) * (into < 0 ? 0.88 : 1) * (want ? 1 : 0.65);
    const m = st.mass, N = m * GRAV;
    let fx = m * (vdx - st.vx) / 0.2, fz = m * (vdz - st.vz) / 0.2;
    const fl = Math.hypot(fx, fz);
    if (fl > Fmax) { fx *= Fmax / fl; fz *= Fmax / fl; }
    const F = Math.min(fl, Fmax);
    const sp = Math.hypot(st.vx, st.vz);
    let effort = 0;
    if (sp < 0.03) {
      // at rest: static friction holds it until the push beats it
      const need = st.muS * N;
      if (F <= need) { st.vx = st.vz = 0; effort = want ? Math.min(1, F / Math.max(1, need)) : 0; st.stuck = want ? st.stuck + dt : 0; }
      else { const k = (F - st.mu * N) / F; st.vx += fx * k / m * dt; st.vz += fz * k / m * dt; effort = F / Fmax; st.stuck = 0; }
    } else {
      const fr = st.mu * N;
      const nvx = st.vx + (fx - st.vx / sp * fr) / m * dt, nvz = st.vz + (fz - st.vz / sp * fr) / m * dt;
      if (!want && nvx * st.vx + nvz * st.vz <= 0) { st.vx = 0; st.vz = 0; } else { st.vx = nvx; st.vz = nvz; }
      effort = want ? Math.min(1, F / Fmax) : 0;
      st.stuck = 0;
    }
    st.effort += (effort - st.effort) * Math.min(1, dt * 8);
    const cap = Math.max(vF, vS) * 1.1;
    const s2 = Math.hypot(st.vx, st.vz);
    if (s2 > cap) { st.vx *= cap / s2; st.vz *= cap / s2; }
    // object and survivor move together, sliding along whatever stops them
    const moved = this.step(st, dt, p);
    if (!this.st || st.topple) return;
    st.px = p.x; st.pz = p.z;
    p.vx = 0; p.vz = 0;
    p.speed = moved / Math.max(1e-4, dt); p.running = false;
    p.facing = p.targetFacing = Math.atan2(st.relZ, st.relX);
    if (want || moved > 0.002) (st.action as any).anim = into >= -0.05 ? 'push' : 'drag';
    // effort costs breath; Shift costs more
    if (want) {
      p.exertionTimer = 1;
      p.body.endurance = Math.max(0, p.body.endurance - dt * 0.006 * (0.35 + st.effort) * Math.min(3, 0.4 + m / 50) * (power ? 2.4 : 1));
      if (p.body.endurance < 0.04) { bus.emit('think', p, 'I need to catch my breath.'); this.end('tired'); return; }
      st.breathT -= dt * st.effort;
      if (st.breathT <= 0) { st.breathT = 1.6 + Math.random(); G.audio?.at?.('breath', p.x, p.z, 0.25 + st.effort * 0.3); }
    }
    if (st.stuck > 0.7 && !st.strainSaid) {
      st.strainSaid = true;
      G.audio?.at?.('dmg_stuck', st.cx, st.cz, 0.6);
      bus.emit('think', p, power ? "It won't budge. Not even with everything I've got." : "It won't budge. (Shift: put my back into it)");
    }
    this.sounds(st, moved, dt);
  }

  private updateCarry(st: PushState, p: Player, dt: number) {
    const z = st.z, inp = G.input;
    const power = inp.down('power') || inp.down('run');
    const k = clamp(1.12 - st.mass / 32, 0.45, 1) * (power ? 1.08 : 1);
    let dx = (p.x - st.px) * k, dz = (p.z - st.pz) * k;
    p.x = st.px; p.z = st.pz;
    const reach = 0.3 + Math.max(st.rw, st.rd) / 2;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    _mover.x = p.x; _mover.z = p.z; _mover.radius = p.radius;
    moveCircle(z, _mover, dx, dz, { ignoreLow: false });
    dx = _mover.x - p.x; dz = _mover.z - p.z;
    const tx = p.x + dx + fx * reach, tz = p.z + dz + fz * reach;
    if (this.canCarry(z, st, tx, tz)) { p.x += dx; p.z += dz; st.cx = tx; st.cz = tz; }
    else if (this.canCarry(z, st, p.x + fx * reach, p.z + fz * reach)) { st.cx = p.x + fx * reach; st.cz = p.z + fz * reach; }
    const moved = Math.hypot(p.x - st.px, p.z - st.pz);
    st.px = p.x; st.pz = p.z;
    p.speed = moved / Math.max(1e-4, dt);
    if (st.mass > 8) p.running = false;
    const want = clamp(0.95 - st.h * 0.45, 0.25, 0.75);
    st.lift += (want - st.lift) * Math.min(1, dt * 7);
    st.effort = clamp(st.mass / (16 + p.body.skill('strength') * 2.5), 0, 1);
    p.exertionTimer = Math.max(p.exertionTimer, 0.5);
    p.body.endurance = Math.max(0, p.body.endurance - dt * 0.0015 * st.mass / 8 * (power ? 1.5 : 1));
    if (p.body.endurance < 0.03) { bus.emit('think', p, 'My arms are shaking. I have to put it down.'); this.end('tired'); return; }
    const ax = Math.floor(st.cx - st.rw / 2 + 0.5), ay = Math.floor(st.cz - st.rd / 2 + 0.5);
    st.o.x = ax; st.o.y = ay; st.o.ox = st.cx - (ax + st.rw / 2); st.o.oz = st.cz - (ay + st.rd / 2);
  }

  /** free slide after letting go / a shove: friction only */
  private slide(st: PushState, dt: number) {
    st.muT -= dt;
    if (st.muT <= 0) { st.muT = 0.25; [st.mu, st.muS] = this.friction(st.z, st.cx, st.cz, st.d); }
    const sp = Math.hypot(st.vx, st.vz);
    const dec = st.mu * GRAV * dt;
    if (sp <= dec || sp < 0.05) { st.vx = st.vz = 0; this.finish(); return; }
    st.vx *= (sp - dec) / sp; st.vz *= (sp - dec) / sp;
    this.step(st, dt, null);
  }

  private updateThrown(st: PushState, dt: number) {
    const th = st.thrown!, z = st.z;
    th.vy -= GRAV * dt;
    th.y += th.vy * dt;
    const mx = st.vx * dt, mz = st.vz * dt;
    if (this.canCarry(z, st, st.cx + mx, st.cz + mz)) { st.cx += mx; st.cz += mz; }
    else {
      const sp = Math.hypot(st.vx, st.vz);
      this.bang(st, sp, st.cx + mx, st.cz + mz);
      if (!this.canCarry(z, st, st.cx + mx, st.cz)) st.vx *= -0.25;
      if (!this.canCarry(z, st, st.cx, st.cz + mz)) st.vz *= -0.25;
    }
    // into somebody
    const sp = Math.hypot(st.vx, st.vz);
    if (sp > 2 && th.y < 1.6) for (const c of G.creatures?.creatures?.values?.() || []) {
      const cc: any = c;
      if (cc.dead || cc.zoneKey !== z.key || Math.hypot(cc.x - st.cx, cc.z - st.cz) > (cc.radius ?? 0.4) + Math.max(st.rw, st.rd) / 2) continue;
      G.creatures.damage(st.by, cc.id, Math.round(st.mass * sp * 0.35 * 10) / 10, st.cx - st.vx, st.cz - st.vz, Math.min(1.5, st.mass * sp * 0.02), 'thrown');
      st.pendDmg += st.mass * sp * 0.08;
      st.vx *= 0.2; st.vz *= 0.2;
      G.audio?.at?.('dmg_hit_hard', st.cx, st.cz, 0.9);
      hitstop(50);
      break;
    }
    if (th.y <= 0) {
      const v = Math.hypot(sp, th.vy);
      const frag = ['glass', 'ceramic', 'elec'].includes(objMat(st.d));
      st.pendDmg += 0.5 * st.mass * v * v / 30 * (frag ? 4 : 1);
      G.audio?.at?.('dmg_hit_' + hitMat(st.d), st.cx, st.cz, Math.min(1, 0.4 + v * 0.1));
      shake(Math.min(0.3, v * 0.03 * Math.min(3, st.mass / 10)));
      noise(G.local, st.cx, st.cz, 8 + v * 2, 'thrown');
      st.thrown = null; st.lift = 0;
      st.vx *= 0.35; st.vz *= 0.35;
      st.free = true;
      if (st.pendDmg >= (st.o.hp ?? objMaxHp(st.d))) { st.vx = st.vz = 0; this.finish(); }
    }
  }

  private startTopple(st: PushState, dx: number, dz: number) {
    const l = Math.hypot(dx, dz) || 1;
    st.topple = { dx: dx / l, dz: dz / l, ang: 0.04, av: 0.6 };
    st.vx = st.vz = 0;
    G.audio?.at?.('wood_creak', st.cx, st.cz, 0.8);
  }
  private updateTopple(st: PushState, dt: number) {
    const t = st.topple!;
    // a rod falling about its base: angular acceleration ~ (3g / 2h) sin(angle)
    t.av += (3 * GRAV / (2 * Math.max(0.8, st.h))) * Math.sin(t.ang + 0.08) * dt;
    t.ang += t.av * dt;
    if (t.ang < Math.PI / 2 - 0.04) return;
    t.ang = Math.PI / 2;
    const fx = st.cx + t.dx * st.h * 0.6, fz = st.cz + t.dz * st.h * 0.6;
    G.audio?.at?.('dmg_hit_' + hitMat(st.d), fx, fz, 1);
    G.audio?.at?.('thud_distant', fx, fz, 0.8);
    shake(Math.min(0.45, 0.15 + st.mass / 300)); hitstop(70);
    noise(G.local, fx, fz, 24, 'smash');
    // whatever it lands on
    for (const c of G.creatures?.creatures?.values?.() || []) {
      const cc: any = c;
      if (!cc.dead && cc.zoneKey === st.z.key && Math.hypot(cc.x - fx, cc.z - fz) < st.h * 0.55) G.creatures.damage(st.by, cc.id, Math.round(st.mass * 0.4), st.cx, st.cz, 0.8, 'crush');
    }
    st.pendDmg += Math.max(objMaxHp(st.d) * 1.5, 40);
    st.vx = t.dx; st.vz = t.dz;
    this.finish();
  }

  /** move the object (and the survivor holding it) by v*dt, sliding along obstacles; returns distance moved */
  private step(st: PushState, dt: number, p: Player | null): number {
    const z = st.z;
    let mx = st.vx * dt, mz = st.vz * dt;
    if (Math.abs(mx) < 1e-6 && Math.abs(mz) < 1e-6) return 0;
    const ok = (dx: number, dz: number) => this.canPlace(z, st, st.cx + dx, st.cz + dz) && (!p || this.playerFits(z, p, dx, dz));
    if (!ok(mx, mz)) {
      if (Math.abs(mx) > 1e-6 && ok(mx, 0)) { this.bang(st, Math.abs(st.vz), st.cx, st.cz + Math.sign(mz) * (st.rd / 2 + 0.1)); mz = 0; st.vz = 0; }
      else if (Math.abs(mz) > 1e-6 && ok(0, mz)) { this.bang(st, Math.abs(st.vx), st.cx + Math.sign(mx) * (st.rw / 2 + 0.1), st.cz); mx = 0; st.vx = 0; }
      else { this.bang(st, Math.hypot(st.vx, st.vz), st.cx + Math.sign(mx) * (st.rw / 2 + 0.1), st.cz + Math.sign(mz) * (st.rd / 2 + 0.1)); mx = mz = 0; st.vx = st.vz = 0; }
      if (st.topple || !this.st) return 0;
    }
    st.cx += mx; st.cz += mz;
    if (p) { p.x += mx; p.z += mz; }
    const ax = Math.floor(st.cx - st.rw / 2 + 0.5), ay = Math.floor(st.cz - st.rd / 2 + 0.5);
    st.o.x = ax; st.o.y = ay; st.o.ox = st.cx - (ax + st.rw / 2); st.o.oz = st.cz - (ay + st.rd / 2);
    return Math.hypot(mx, mz);
  }

  /** it hit something at speed: noise, damage to both, maybe it goes over */
  private bang(st: PushState, speed: number, hx: number, hz: number) {
    if (speed < 0.35) return;
    const z = st.z;
    const mat = hitMat(st.d);
    G.audio?.at?.('dmg_hit_' + mat, hx, hz, Math.min(1, 0.3 + speed * 0.35));
    if (speed < 0.7) return;
    const E = 0.5 * st.mass * speed * speed;
    shake(Math.min(0.28, 0.04 + E / 900)); if (E > 120) hitstop(40);
    noise(G.local, hx, hz, 8 + speed * 6, 'smash');
    const frag = ['glass', 'ceramic', 'elec'].includes(objMat(st.d));
    st.pendDmg += E / 40 * (frag ? 3 : 1);
    // the other piece of furniture takes it too
    const tx = Math.floor(hx), tz = Math.floor(hz);
    if (z.inb(tx, tz)) for (const o of z.objectsAt(tx, tz)) {
      if (o === st.o) continue;
      const od = objDef(o.key); if (!od) continue;
      const tall = od.height >= 1.35 && od.height / Math.max(0.2, Math.min(od.w ?? 1, od.d ?? 1)) >= 1.6;
      G.destruct?.damageObject?.(G.local ?? null, o, Math.round((E / 30) * (tall && speed > 1.2 ? 4 : 1) * 10) / 10, 'crush', undefined, [st.vx || 0.01, st.vz]);
      break;
    }
    if (st.tall && speed >= 1.15 && st.mode === 'push') { this.startTopple(st, st.vx || hx - st.cx, st.vz || hz - st.cz); this.detach(); }
  }

  private sounds(st: PushState, moved: number, dt: number) {
    const z = st.z;
    st.moving = moved > 0.002 ? 0.25 : Math.max(0, st.moving - dt);
    const sp = moved / Math.max(1e-4, dt);
    const roll = WHEELS.test(st.d.key);
    G.audio?.positionalLoop?.(st.loopKey, st.moving > 0 && st.mode === 'push' ? scrapeKey(st.d) : null, st.cx, st.cz, (roll ? 0.25 : 0.45) + Math.min(0.45, st.mass / 200) * Math.min(1, sp + 0.3), (roll ? 1.3 : 0.75) + Math.min(0.6, sp * 0.5), 22);
    st.smearD += moved; st.scuffD += moved;
    if (st.smearD > 0.3) {
      st.smearD = 0;
      const wet = G.gore?.decals?.wetAt?.(z.key, st.cx, st.cz);
      if (wet && wet.wet > 0.12 && (G.sandbox.gore ?? 2) > 0) {
        const a = Math.atan2(st.vz, st.vx);
        G.gore.decals.commit(z, { x: st.cx - Math.cos(a) * 0.3, z: st.cz - Math.sin(a) * 0.3, w: Math.min(1.2, st.rw * 0.8 + 0.3), d: 0.35, rot: a, tex: 'gore_red_smear', tint: wet.tint }, 0.4, { show: true, force: true });
      }
    }
    if (st.scuffD > 1.1 && st.mass > 15 && st.mode === 'push' && !roll) {
      st.scuffD = 0;
      const a = Math.atan2(st.vz, st.vx);
      op('decal', { z: z.key, d: { x: Math.round(st.cx * 100) / 100, z: Math.round(st.cz * 100) / 100, w: Math.min(1.4, st.rw * 0.9), d: 0.5, rot: Math.round(a * 100) / 100, tex: 'dbr_scrape', y: 0.0105 } });
    }
  }

  /** others see it move */
  private send(st: PushState, dt: number) {
    st.sendT -= dt;
    if (st.sendT > 0 || G.role === 'solo') return;
    st.sendT = 0.1;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const ev: any = { t: 'D', k: 'mv', z: st.z.key, u: st.o.uid, x: r2(st.cx), zz: r2(st.cz), m: st.moving > 0 ? 1 : 0 };
    const y = st.thrown ? st.thrown.y : st.lift;
    if (y > 0.01) ev.y = r2(y);
    if (st.topple) { ev.a = r2(st.topple.ang); ev.dx = r2(st.topple.dx); ev.dz = r2(st.topple.dz); }
    G.net?.broadcastFx?.('gore', ev);
  }

  /** would the survivor holding it still be standing somewhere legal after moving by (dx, dz)? */
  private playerFits(z: Zone, p: Player, dx: number, dz: number): boolean {
    _mover.x = p.x; _mover.z = p.z; _mover.radius = p.radius;
    moveCircle(z, _mover, dx, dz, { ignoreLow: false });
    return Math.abs(_mover.x - (p.x + dx)) < 0.01 && Math.abs(_mover.z - (p.z + dz)) < 0.01;
  }

  /** a carried (lifted) thing only needs to clear walls and tall furniture */
  private canCarry(z: Zone, st: PushState, cx: number, cz: number): boolean {
    const hx = st.rw / 2 - 0.08, hz = st.rd / 2 - 0.08;
    const ctx = Math.floor(cx), ctz = Math.floor(cz);
    if (!z.inb(ctx, ctz) || !z.floor[z.idx(ctx, ctz)]) return false;
    for (const [x, y] of [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx - hx, cz + hz], [cx + hx, cz + hz]] as [number, number][]) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)]) return false;
      const s = z.solid[z.idx(tx, ty)];
      if (s === 1 || s === 3) return false;
      if (tx !== ctx && z.edgeBlocks(ctx, ctz, tx > ctx ? 1 : -1, 0, 'walk')) return false;
      if (ty !== ctz && z.edgeBlocks(tx, ctz, 0, ty > ctz ? 1 : -1, 'walk')) return false;
    }
    return true;
  }

  /** can the held object's footprint sit with its centre at (cx, cz)? (walls, other furniture, floor) */
  private canPlace(z: Zone, st: PushState, cx: number, cz: number): boolean {
    const hx = st.rw / 2 - 0.06, hz = st.rd / 2 - 0.06;
    const ctx = Math.floor(cx), ctz = Math.floor(cz);
    if (!z.inb(ctx, ctz) || !z.floor[z.idx(ctx, ctz)]) return false;
    const pts: [number, number][] = [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx - hx, cz + hz], [cx + hx, cz + hz], [cx, cz - hz], [cx, cz + hz], [cx - hx, cz], [cx + hx, cz], [cx, cz]];
    for (const [x, y] of pts) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!z.inb(tx, ty)) return false;
      const i = z.idx(tx, ty);
      if (!z.floor[i]) return false;
      const s = z.solid[i];
      if (s === 1 || s === 3 || s === 2) return false;
      // walls between the centre tile and this corner's tile
      let ix = ctx, iy = ctz;
      while (ix !== tx) { const sx = tx > ix ? 1 : -1; if (z.edgeBlocks(ix, iy, sx, 0, 'walk')) return false; ix += sx; }
      while (iy !== ty) { const sy = ty > iy ? 1 : -1; if (z.edgeBlocks(ix, iy, 0, sy, 'walk')) return false; iy += sy; }
    }
    // other survivors are in the way too
    for (const q of G.players.values()) {
      if (q.isLocal || q.zoneKey !== z.key || q.body.dead) continue;
      if (Math.abs(q.x - cx) < hx + 0.25 && Math.abs(q.z - cz) < hz + 0.25) return false;
    }
    return true;
  }
}

function hitMat(d: ObjDef): string {
  const m = objMat(d);
  return m === 'metal' || m === 'elec' ? 'metal' : m === 'fabric' || m === 'paper' ? 'fabric' : m === 'plastic' ? 'plastic' : m === 'wood' ? 'wood' : 'hard';
}
function scrapeKey(d: ObjDef): string {
  const m = objMat(d);
  return m === 'metal' || m === 'elec' ? 'dmg_scrape_metal' : m === 'fabric' ? 'dmg_scrape_soft' : 'dmg_scrape_wood';
}

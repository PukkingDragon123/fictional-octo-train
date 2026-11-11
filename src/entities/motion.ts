// The unit's body in motion (round 15). The controller (src/game/game.ts
// controlLocal) asks this for the stance, whether it can run and how fast,
// then hands it the wanted velocity; this turns that into a body with weight:
//  - momentum: it takes a moment to get going and to stop, a sprint bends
//    round corners in an arc instead of snapping, a hard reversal at speed
//    plants and brakes first, and the body leans into the push
//  - breath: a sprint runs the lungs down; spent ("blown") it cannot run
//    again until it gets its wind back, slows, and stands bent over panting
//  - tripping: sprinting through clutter, debris, loose items or water, or
//    running on when exhausted, drunk or hurt, a foot catches: a lurching
//    stumble it catches, or a real fall (the ragdoll) and getting back up
//  - crawling: hold the sneak key to drop flat and crawl, under tables too;
//    legs that cannot carry it put it on the floor whether it likes it or not
//  - rolling: C rolls over the shoulder (stamina; a moment of nothing can touch it)
//  - blows: real knockback that bleeds off on friction, staggers, and big
//    hits (or a hit on a blown, running body) knock it flat
//  - running into a wall at full tilt: a slam and a stagger; into loose
//    furniture: it goes flying (src/world/pushDrag.ts knock)
// Animations: src/entities/motionAnims.ts (mo_roll, mo_stumble, mo_getup_back)
// plus the animator's own 'stagger' and 'get_up'.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { clamp, angleDiff, wrapAngle } from '../core/math';
import { moveCircle } from '../world/collision';
import { objDef } from '../world/objects';
import type { Zone, TileObject } from '../world/zone';
import { floorItemsNear } from '../items/worldItems';
import { shake, punch, kick } from '../gfx/juice';
import { noise } from '../actions/world';
import type { Input } from '../core/input';
import type { Player } from './player';
import './motionAnims';

type MState = 'free' | 'roll' | 'stumble' | 'fallen' | 'getup' | 'stagger';

declare module './player' {
  interface Player {
    /** the body's physical movement state (local unit): src/entities/motion.ts */
    motion?: UnitMotion;
    /** forward lean the animator adds (radians, from acceleration and sprinting) */
    motionLean?: number;
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _b = new THREE.Vector3();
const say = (p: Player, s: string) => bus.emit('think', p, s);
const audio = (k: string, x: number, z: number, v: number) => { try { G.audio?.at?.(k, x, z, v); } catch { /* no audio */ } };

export class UnitMotion {
  st: MState = 'free';
  t = 0;
  dur = 0;
  /** roll / stumble / fall direction (world radians) */
  dir = 0;
  /** chose to go flat (hold the sneak key) */
  prone = false;
  /** out of breath: no running until the wind comes back */
  blown = false;
  /** outside velocity (blows, slams): it bleeds off on friction */
  exVx = 0; exVz = 0;
  /** the last trip / fall / slam / roll (dev, tests) */
  last = '';
  /** how the last fall landed (front / back) */
  landed = '';
  private lean = 0;
  private prevSp = 0;
  private accF = 0;
  private sneakT0 = -1;
  private sneakUsed = false;
  private tripCd = 0;
  private breathT = 0;
  private clutterT = 0;
  private clutter = 0;
  private sloppy = false;
  private thudDone = false;
  private wasForced = false;
  private since = 0;
  private pending: { dx: number; dz: number; k: number; dmg: number; part: string; grab: boolean } | null = null;

  /** no steering at all (rolling, stumbling, on the floor, getting up) */
  get locked() { return this.st === 'roll' || this.st === 'stumble' || this.st === 'fallen' || this.st === 'getup'; }

  // ================================================================ input: roll, going prone
  input(p: Player, inp: Input, locked: boolean) {
    const now = G.time;
    // never stuck: a state that outlived itself by seconds (the sim paused under it, a death and a revival) lets go
    if (this.st !== 'free' && G.time - this.since > this.dur + 4) this.reset(p);
    if (inp.down('sneak')) { if (this.sneakT0 < 0) this.sneakT0 = now; } else { this.sneakT0 = -1; this.sneakUsed = false; }
    if (locked || this.locked || p.inVehicle) return;
    const swim = p.stance === 'swim';
    if (this.prone) {
      // up again: the sneak key (onto the knees), or Shift (straight up and away)
      const run = inp.hit('run');
      if (inp.hit('sneak') || run) {
        this.eat(inp, 'sneak');
        if (!this.roomToStand(p)) { say(p, 'No room to stand under here.'); return; }
        this.prone = false; p.sneaking = !run; this.sneakUsed = true;
        audio('cloth', p.x, p.z, 0.5);
      }
      return;
    }
    // hold the sneak key: drop flat
    if (!swim && this.sneakT0 >= 0 && !this.sneakUsed && now - this.sneakT0 > 0.42) {
      this.sneakUsed = true; this.prone = true; p.sneaking = true;
      audio('cloth', p.x, p.z, 0.6); audio('thud_soft', p.x, p.z, 0.25);
      return;
    }
    if (inp.hit('roll')) {
      const mv = inp.moveAxis();
      const yaw = G.pr.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      this.roll(p, fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x);
    }
  }
  private enter(st: MState, dur: number) { this.st = st; this.t = 0; this.dur = dur; this.since = G.time; }
  private eat(inp: Input, a: 'sneak') { for (const c of inp.bindings[a]) inp.pressed.delete(c); }

  /** is there headroom here (not under a table) */
  roomToStand(p: Player): boolean {
    const z = G.getZone(p.zoneKey);
    if (!z || !z.inb(p.tileX(), p.tileY())) return true;
    return z.solid[z.idx(p.tileX(), p.tileY())] !== 3;
  }

  // ================================================================ what the controller asks
  /** flat on the floor: chosen, legs that cannot carry it, or no headroom */
  crawling(p: Player, legs: number): boolean {
    const forced = legs >= 0.85;
    if (forced && !this.wasForced) say(p, 'My legs won\'t hold me.');
    this.wasForced = forced;
    if (!this.prone && !this.roomToStand(p) && this.st === 'free') this.prone = true;
    return this.prone || forced;
  }
  crawlSpeed(p: Player, legs: number): number { return this.prone && legs < 0.85 ? 0.55 : 0.32; }
  canRun(_p: Player): boolean { return !this.blown && !this.prone && this.st === 'free'; }
  speedMul(p: Player): number {
    if (this.st === 'stagger') return 0.25;
    const E = p.body.endurance;
    if (this.blown) return 0.72;
    return p.running ? 0.8 + 0.2 * Math.min(1, E / 0.35) : 1;
  }
  /** where the body faces while moving: at speed, where it is actually going (so a sprint bends round) */
  faceDir(p: Player, mx: number, mz: number): number {
    if (this.locked) return this.dir;
    const s = Math.hypot(p.vx, p.vz);
    return s > 1.3 && p.stance !== 'crawl' ? Math.atan2(p.vz, p.vx) : Math.atan2(mz, mx);
  }
  turnRate(p: Player): number { return this.locked ? 30 : p.stance === 'crawl' ? 4 : Math.hypot(p.vx, p.vz) > 3 ? 7 : 12; }

  // ================================================================ the step
  /** wanted velocity (tvx, tvz) in, a moved body out (p.x / p.z / p.vx / p.vz / p.speed) */
  integrate(z: Zone, p: Player, tvx: number, tvz: number, dt: number) {
    if (dt <= 0) return;
    this.tripCd = Math.max(0, this.tripCd - dt);
    this.t += dt;
    this.breath(p, dt);
    if (this.pending) { const h = this.pending; this.pending = null; this.resolveHit(p, h); }
    // something else took the body (dead, downed, carried, a struggle): let go of whatever we were doing
    if (p.body.dead || p.body.downed || p.carriedBy) { if (this.st !== 'free') this.reset(p); }
    const under = p.stance === 'crawl' || this.st === 'roll';
    switch (this.st) {
      case 'roll': this.stepRoll(z, p, dt); break;
      case 'stumble': this.stepStumble(z, p, dt); break;
      case 'fallen': case 'getup': this.stepDown(z, p, dt); break;
      default: this.stepFree(z, p, tvx, tvz, dt, under);
    }
    // outside velocity (blows): friction takes it off
    if (this.exVx || this.exVz) {
      if (this.st !== 'fallen') moveCircle(z, p, this.exVx * dt, this.exVz * dt, { ignoreLow: false, under });
      const f = Math.exp(-(this.st === 'roll' ? 2 : 7) * dt);
      this.exVx *= f; this.exVz *= f;
      if (Math.hypot(this.exVx, this.exVz) < 0.05) this.exVx = this.exVz = 0;
    }
    p.speed = this.st === 'fallen' ? 0 : Math.hypot(p.vx + this.exVx, p.vz + this.exVz);
    // lean into the push (acceleration along the way it faces), a sprinter's forward pitch
    const s = Math.hypot(p.vx, p.vz);
    const a = (s - this.prevSp) / dt;
    this.prevSp = s;
    this.accF += (clamp(a, -12, 12) - this.accF) * (1 - Math.exp(-10 * dt));
    const want = this.st === 'free' && p.stance === 'stand' ? clamp(this.accF * 0.022, -0.1, 0.12) + (p.running ? 0.06 * clamp((s - 2.5) / 1.5, 0, 1) : 0) : 0;
    this.lean += (want - this.lean) * (1 - Math.exp(-8 * dt));
    p.motionLean = this.lean;
  }

  private stepFree(z: Zone, p: Player, tvx: number, tvz: number, dt: number, under: boolean) {
    let s = Math.hypot(p.vx, p.vz);
    const S = Math.hypot(tvx, tvz);
    let h = s > 1e-4 ? Math.atan2(p.vz, p.vx) : Math.atan2(tvz, tvx);
    const H = S > 1e-4 ? Math.atan2(tvz, tvx) : h;
    const crawl = p.stance === 'crawl', swim = p.stance === 'swim';
    const exh = clamp(1 - p.body.endurance / 0.3, 0, 1);
    const load = clamp(p.heavyLoad(), 0, 1.5);
    const fit = (1 - 0.35 * exh) / (1 + load * 0.5);
    const acc = (crawl ? 3 : swim ? 2.2 : p.running ? 7.5 : 11) * fit;
    const dec = crawl ? 6 : swim ? 2.5 : s > 3 ? 8.5 : 13;
    if (S < 0.05) s = Math.max(0, s - dec * dt);
    else {
      const d = angleDiff(h, H);
      if (s < 0.6) h = H;
      else {
        // how fast the run can bend: a sprint swings wide, a walk turns on a coin
        const tr = (s > 3 ? 4.2 : s > 1.6 ? 7.5 : 14) * (crawl ? 0.6 : 1);
        h = wrapAngle(h + clamp(d, -tr * dt, tr * dt));
        // reversing at speed: plant the feet and brake before going the other way
        if (Math.abs(d) > 1.9 && s > 2.2) s = Math.max(0, s - dec * 1.15 * dt);
      }
      const off = Math.abs(angleDiff(h, H));
      const goal = S * (off > 1.2 ? 0.5 : 1 - off * 0.25);
      s = s < goal ? Math.min(goal, s + acc * dt) : Math.max(goal, s - dec * dt);
    }
    p.vx = Math.cos(h) * s; p.vz = Math.sin(h) * s;
    if (s < 1e-3) return;
    const ox = p.x, oz = p.z;
    const ix = p.vx * dt, iz = p.vz * dt;
    moveCircle(z, p, ix, iz, { ignoreLow: false, under });
    const moved = Math.hypot(p.x - ox, p.z - oz), meant = Math.hypot(ix, iz);
    // a wall (or furniture) square on at a full sprint: a slam
    if (s > 3.3 && meant > 1e-4 && moved < meant * 0.3 && this.tripCd <= 0) { this.slam(z, p, h, s); return; }
    // what is left of the velocity after the collision (sliding along a wall keeps the slide)
    if (meant > 1e-4 && moved < meant * 0.98) { const k = moved / meant; p.vx *= k; p.vz *= k; }
    // a foot catches
    if (p.running && s > 3 && this.tripCd <= 0) {
      this.clutterT -= dt;
      if (this.clutterT <= 0) { this.clutterT = 0.12; this.clutter = this.clutterAt(z, p, h); }
      const m = p.body.mods(p.heavyLoad());
      const risk = this.clutter + Math.max(0, exh - 0.45) * 0.35 + m.limp * 0.45 + (m.drunk ?? 0) * 0.4;
      if (risk > 0 && Math.random() < risk * dt) this.trip(p, h, s, exh > 0.6 || m.limp > 0.3 || (m.drunk ?? 0) > 0.5 || Math.random() < 0.4 + this.clutter * 0.2);
    }
  }

  /** what is underfoot just ahead (per second trip risk): loose junk, debris heaps, dropped things, a wet floor */
  private clutterAt(z: Zone, p: Player, h: number): number {
    const ax = p.x + Math.cos(h) * 0.5, az = p.z + Math.sin(h) * 0.5;
    const tx = Math.floor(ax), ty = Math.floor(az);
    if (!z.inb(tx, ty)) return 0;
    let r = 0;
    for (const o of z.objectsAt(tx, ty)) {
      const d = objDef(o.key);
      if (!d || (d.block && d.block !== 'none')) continue;
      if (o.key === 'debris_pile') r += 1.1;
      else if (d.height > 0.04 && d.height < 0.6) r += 0.35;
    }
    try { for (const wi of floorItemsNear(z, ax, az, 0.45)) { void wi; r += 0.18; if (r > 1.6) break; } } catch { /* items not ready */ }
    const f = z.floorAt(tx, ty) as any;
    if (f?.water === 'shallow') r += 0.45;
    if (f?.slip) r += f.slip;
    return Math.min(1.6, r);
  }

  // ================================================================ trips, falls, slams
  private trip(p: Player, h: number, s: number, fall: boolean) {
    this.tripCd = 6;
    this.dir = h;
    p.actions.clear();
    G.combat?.interrupt?.(p);
    audio('cloth', p.x, p.z, 0.7); audio('debtor_grunt', p.x, p.z, 0.45);
    noise(p, p.x, p.z, 8, 'trip');
    if (fall) { this.knockdown(p, Math.cos(h), Math.sin(h), 0.6, 'trip', s); return; }
    this.last = 'stumble';
    this.enter('stumble', 0.75);
    p.playAnim('mo_stumble', this.dur);
    p.facing = p.targetFacing = h;
    shake(0.12, 0.2);
  }

  /** run into something solid: bounce off, reel; loose furniture gets knocked flying instead */
  private slam(z: Zone, p: Player, h: number, s: number) {
    this.tripCd = 2.5;
    const o = this.objectAhead(z, p, h);
    if (o && G.destruct?.push?.knock?.(p, o, Math.cos(h) * s * 0.9, Math.sin(h) * s * 0.9)) {
      // it gave way: the body carries on through, slowed, off balance
      p.vx *= 0.35; p.vz *= 0.35;
      audio('cb_grunt', p.x, p.z, 0.5);
      shake(0.25, 0.25);
      this.last = 'barge';
      if (Math.random() < 0.35) this.trip(p, h, s * 0.5, false);
      return;
    }
    this.last = 'slam';
    audio('body_thud', p.x, p.z, 0.8); audio('debtor_grunt', p.x, p.z, 0.6);
    shake(0.45, 0.3); kick(-Math.cos(h), -Math.sin(h), 0.25); punch(-0.03, 0.25);
    noise(p, p.x, p.z, 14, 'slam');
    p.body.endurance = Math.max(0, p.body.endurance - 0.04);
    if (Math.random() < 0.35) p.body.addInjury(Math.random() < 0.5 ? 'torso_u' : (Math.random() < 0.5 ? 'uarm_l' : 'uarm_r'), 'bruise', 0.15);
    p.vx = p.vz = 0;
    this.exVx = -Math.cos(h) * 1.6; this.exVz = -Math.sin(h) * 1.6;
    p.actions.clear();
    G.combat?.interrupt?.(p);
    if (p.body.endurance < 0.1) { this.knockdown(p, -Math.cos(h), -Math.sin(h), 0.7, 'slam', 1); return; }
    this.enter('stagger', 0.85);
    p.playAnim('stagger', this.dur);
  }

  private objectAhead(z: Zone, p: Player, h: number): TileObject | null {
    for (const r of [0.45, 0.75]) {
      const tx = Math.floor(p.x + Math.cos(h) * r), ty = Math.floor(p.z + Math.sin(h) * r);
      if (!z.inb(tx, ty)) continue;
      for (const o of z.objectsAt(tx, ty)) { const d = objDef(o.key); if (d && d.block && d.block !== 'none') return o; }
    }
    return null;
  }

  /**
   * Off its feet: the ragdoll takes the body (thrown along (dx, dz)), it lies a beat,
   * then gets up the way it landed (face down: push up; on its back: sit up first).
   */
  knockdown(p: Player, dx: number, dz: number, strength: number, how: 'trip' | 'blow' | 'slam', speed = 0) {
    if (p.body.dead || p.body.downed || p.inVehicle) return;
    this.last = how === 'trip' ? 'fall' : 'knockdown:' + how;
    this.enter('fallen', 0.95 + strength * 0.5 + (p.body.endurance < 0.1 ? 0.6 : 0));
    this.thudDone = false;
    this.dir = Math.atan2(dz, dx);
    this.tripCd = Math.max(this.tripCd, 5);
    p.actions.clear();
    G.combat?.interrupt?.(p);
    p.stopAnim();
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (how === 'trip') {
      // the feet catch on the floor, everything above keeps going: it pitches forward onto its hands
      const v = Math.max(2.4, speed);
      _v.set(dx * v * 0.75, 0, dz * v * 0.75);
      _w.set(dx * (1.6 + v * 0.35), -0.9, dz * (1.6 + v * 0.35));
      p.rig.startRagdoll(_v, _w, 'torso_u', this.dur);
    } else {
      _v.set(p.vx * 0.5 + dx * 0.6, 0, p.vz * 0.5 + dz * 0.6);
      _w.set(dx * (2 + 2.8 * strength), 0.5 + 1.2 * strength, dz * (2 + 2.8 * strength));
      p.rig.startRagdoll(_v, _w, 'torso_u', this.dur);
    }
    p.vx = p.vz = 0;
    shake(0.25 + strength * 0.25, 0.3);
    if (strength > 0.8) punch(0.08, 0.5);
  }

  private stepDown(z: Zone, p: Player, dt: number) {
    p.vx = p.vz = 0;
    const R = p.rig.ragdoll;
    if (this.st === 'fallen') {
      // the root rides under the body (so it gets up where it lies, not where it fell from)
      if (R?.active) {
        R.pelvisWorld(_v);
        const ox = p.x, oz = p.z;
        p.x = _v.x; p.z = _v.z;
        // walls: the circle collision keeps the root out of them
        moveCircle(z, p, 0, 0, { ignoreLow: true, under: true });
        if (Math.hypot(p.x - ox, p.z - oz) > 1.2 * dt + 0.1) { p.x = ox; p.z = oz; }
      }
      if (!this.thudDone && this.t > 0.32) {
        this.thudDone = true;
        audio('body_thud', p.x, p.z, 0.9); audio('debtor_gasp', p.x, p.z, 0.5);
        shake(0.35, 0.25);
        noise(p, p.x, p.z, 12, 'fall');
        if (Math.random() < 0.55) p.body.addInjury(['hand_l', 'hand_r', 'shin_l', 'shin_r', 'torso_u'][Math.floor(Math.random() * 5)] as any, 'bruise', 0.12 + Math.random() * 0.12);
      }
      if (this.t >= this.dur) {
        // which way up did it land
        let back = false;
        if (R?.active) {
          R.trunkWorld(_u, _b);
          back = _b.y > 0.25;
          this.landed = back ? 'back' : 'front';
          // the head end of the body: face it (face down) or turn the back to it (face up, the get-up sits forward over the feet)
          const hx = _u.x, hz = _u.z;
          if (Math.hypot(hx, hz) > 0.2) p.facing = p.targetFacing = back ? Math.atan2(-hz, -hx) : Math.atan2(hz, hx);
        }
        this.enter('getup', p.body.endurance < 0.1 ? 2.1 : 1.6);
        p.playAnim(back ? 'mo_getup_back' : 'get_up', this.dur);
        audio('cloth', p.x, p.z, 0.5);
        this.dir = p.facing;
      }
      return;
    }
    if (this.t >= this.dur) { this.st = 'free'; this.t = 0; if (!this.roomToStand(p)) this.prone = true; }
  }

  // ================================================================ roll
  /** C: a dodge roll toward (dx, dz) (zero: the way it faces); false when it cannot */
  roll(p: Player, dx = 0, dz = 0): boolean {
    if (this.st !== 'free' && this.st !== 'stagger') return false;
    if (p.stance === 'swim' || p.stance === 'crawl' || this.prone || p.body.downed || p.body.dead || p.inVehicle || p.carriedBy || p.sleeping) return false;
    if (G.destruct?.push?.holding) return false;
    const E = p.body.endurance;
    if (E < 0.07) { say(p, 'No breath left to roll.'); return false; }
    const l = Math.hypot(dx, dz);
    this.dir = l > 0.1 ? Math.atan2(dz, dx) : p.facing;
    const load = clamp(p.heavyLoad(), 0, 1.5);
    this.enter('roll', 0.66 * (1 + load * 0.25));
    this.sloppy = E < 0.2 || p.body.mods(p.heavyLoad()).limp > 0.3;
    this.thudDone = false;
    this.last = 'roll';
    p.body.endurance = Math.max(0, E - 0.08 * (1 + load * 0.6));
    p.exertionTimer = 1;
    p.actions.clear();
    G.combat?.interrupt?.(p);
    p.playAnim('mo_roll', this.dur);
    p.facing = p.targetFacing = this.dir;
    (p as any).cbIframe = G.time + this.dur * 0.62;
    audio('whoosh', p.x, p.z, 0.55); audio('cloth', p.x, p.z, 0.6);
    noise(p, p.x, p.z, 5, 'roll');
    return true;
  }

  private stepRoll(z: Zone, p: Player, dt: number) {
    const u = this.t / this.dur;
    // a burst off the back foot, carried through the tumble, scrubbed off coming up
    const v = u < 0.12 ? 2.2 + u / 0.12 * 2.6 : u < 0.78 ? 4.8 - (u - 0.12) * 2.4 : Math.max(0.6, 3.2 - (u - 0.78) * 11);
    p.vx = Math.cos(this.dir) * v; p.vz = Math.sin(this.dir) * v;
    p.facing = p.targetFacing = this.dir;
    const ox = p.x, oz = p.z, ix = p.vx * dt, iz = p.vz * dt;
    moveCircle(z, p, ix, iz, { ignoreLow: false, under: true });
    if (!this.thudDone && u > 0.3) { this.thudDone = true; audio('thud_soft', p.x, p.z, 0.45); }
    const meant = Math.hypot(ix, iz), moved = Math.hypot(p.x - ox, p.z - oz);
    if (u > 0.15 && u < 0.75 && meant > 1e-4 && moved < meant * 0.25) {
      // rolled into something: it stops the tumble dead
      const o = this.objectAhead(z, p, this.dir);
      if (o) G.destruct?.push?.knock?.(p, o, Math.cos(this.dir) * 2.4, Math.sin(this.dir) * 2.4);
      audio('body_thud', p.x, p.z, 0.6); shake(0.25, 0.2);
      this.enter('stagger', 0.6); p.vx = p.vz = 0;
      p.playAnim('stagger', 0.6);
      return;
    }
    if (u >= 1) {
      this.st = 'free'; this.t = 0;
      p.vx = Math.cos(this.dir) * 1.8; p.vz = Math.sin(this.dir) * 1.8;
      if (!this.roomToStand(p)) { this.prone = true; p.sneaking = true; return; }
      // spent or hurt: it comes up wrong
      if (this.sloppy && Math.random() < 0.5) { this.tripCd = 0; this.trip(p, this.dir, 2, false); }
    }
  }

  private stepStumble(z: Zone, p: Player, dt: number) {
    const u = this.t / this.dur;
    const v = Math.max(0.5, 3.4 * (1 - u * 1.1));
    p.vx = Math.cos(this.dir) * v; p.vz = Math.sin(this.dir) * v;
    const ox = p.x, oz = p.z;
    moveCircle(z, p, p.vx * dt, p.vz * dt, { ignoreLow: false });
    if (Math.hypot(p.x - ox, p.z - oz) < v * dt * 0.3 && u < 0.6) {
      // stumbled into something: down it goes
      const o = this.objectAhead(z, p, this.dir);
      if (o) G.destruct?.push?.knock?.(p, o, Math.cos(this.dir) * 2.5, Math.sin(this.dir) * 2.5);
      this.knockdown(p, Math.cos(this.dir), Math.sin(this.dir), 0.5, 'trip', 2.5);
      return;
    }
    if (u >= 1) { this.st = 'free'; this.t = 0; p.vx *= 0.5; p.vz *= 0.5; }
  }

  // ================================================================ blows
  /** a creature's blow on the local unit (bus 'playerHit'): resolved next step, after the struggle system had its say */
  hit(p: Player, h: { dmg?: number; knock?: number; from?: [number, number]; grab?: boolean; tear?: unknown }, part: string) {
    if (!h?.from) return;
    let dx = p.x - h.from[0], dz = p.z - h.from[1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { dx = -Math.cos(p.facing); dz = -Math.sin(p.facing); } else { dx /= l; dz /= l; }
    this.pending = { dx, dz, k: h.knock ?? 0, dmg: h.dmg ?? 0, part, grab: !!h.grab || !!h.tear };
  }
  private resolveHit(p: Player, h: { dx: number; dz: number; k: number; dmg: number; part: string; grab: boolean }) {
    if (p.body.dead || p.body.downed) return;
    // a grip or a pin is the struggle's business (src/combat/qte.ts)
    if (h.grab || G.combat?.qte?.active) return;
    const s = h.k + h.dmg / 40;
    const exh = clamp(1 - p.body.endurance / 0.3, 0, 1);
    // the shove of it
    const push = 0.6 + h.k * 2.6 + h.dmg * 0.03;
    this.exVx += h.dx * push; this.exVz += h.dz * push;
    const el = Math.hypot(this.exVx, this.exVz);
    if (el > 5) { this.exVx *= 5 / el; this.exVz *= 5 / el; }
    p.vx *= 0.4; p.vz *= 0.4;
    if (this.st === 'fallen' || this.st === 'getup') return;
    const running = p.running || Math.hypot(p.vx, p.vz) > 3;
    if (s >= 1.35 || (s >= 0.85 && (running || exh > 0.6 || this.st === 'stagger'))) {
      this.knockdown(p, h.dx, h.dz, Math.min(1.4, s), 'blow');
      punch(0.1, 0.55);
    } else if (s >= 0.6 || (running && s >= 0.4)) {
      this.enter('stagger', 0.55 + Math.min(0.5, s * 0.3));
      p.playAnim('stagger', this.dur);
      G.combat?.interrupt?.(p);
      punch(0.05, 0.35);
    }
  }

  // ================================================================ breath
  private breath(p: Player, dt: number) {
    const E = p.body.endurance;
    if (!this.blown && E < 0.04) { this.blown = true; say(p, 'Can\'t... keep... running.'); }
    else if (this.blown && E > 0.3) { this.blown = false; audio('gasp_recover', p.x, p.z, 0.5); }
    if (this.st === 'stagger' && this.t >= this.dur) { this.st = 'free'; this.t = 0; }
    const exh = clamp(1 - E / 0.3, 0, 1);
    if (exh < 0.45) { this.breathT = 0.6; return; }
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = (this.blown ? 1.1 : 1.6) + Math.random() * 0.6;
      audio('breath', p.x, p.z, 0.18 + exh * 0.3 + (this.blown ? 0.15 : 0));
    }
  }

  /** drop everything (death, respawn, zone change) */
  reset(p: Player) {
    if ((this.st === 'fallen' || this.st === 'getup') && !p.body.dead && !p.body.downed) p.rig.stopRagdoll();
    if (this.st !== 'free') p.stopAnim();
    this.st = 'free'; this.t = 0; this.exVx = this.exVz = 0; this.pending = null;
  }

  /** dev / tests */
  debug() { return { st: this.st, t: +this.t.toFixed(2), prone: this.prone, blown: this.blown, last: this.last, landed: this.landed, ex: +Math.hypot(this.exVx, this.exVz).toFixed(2) }; }
}

export function motionOf(p: Player): UnitMotion { return p.motion ?? (p.motion = new UnitMotion()); }

// a creature's blow lands on the local unit: knockback, staggers, knockdowns
bus.on('playerHit', (p: Player, part: string, _kind: string, h: any) => {
  try { if (p?.isLocal && !p.body.dead) motionOf(p).hit(p, h, part); } catch (e) { console.error('motion hit', e); }
});

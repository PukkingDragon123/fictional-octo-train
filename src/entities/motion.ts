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
//  - crouching (C): lower, slower, quieter; sprinting, C drops into a SLIDE (feet
//    first along the floor, under tables, ending crouched or flat if there is no
//    headroom)
//  - crawling (Ctrl): down flat and crawl, under tables too (Ctrl / C / Shift up
//    again); legs that cannot carry it put it on the floor whether it likes it or not
//  - vaulting (Space): over a waist-high thing in front (a counter, a crate, a low
//    wall or fence, an open window's sill) with a hand planted on it; with nothing
//    in front, a short hop
//  - blows: real knockback that bleeds off on friction, staggers, and big
//    hits (or a hit on a blown, running body) knock it flat
//  - running into a wall at full tilt: a slam and a stagger; into loose
//    furniture: it goes flying (src/world/pushDrag.ts knock)
// Animations: src/entities/motionAnims.ts (mo_vault, mo_hop, mo_slide, mo_stumble, mo_getup_back)
// plus the animator's own 'stagger' and 'get_up'.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { clamp, angleDiff, wrapAngle } from '../core/math';
import { moveCircle, resolve, tileSolid, objFootprint } from '../world/collision';
import { objDef } from '../world/objects';
import type { Zone, TileObject } from '../world/zone';
import { floorItemsNear } from '../items/worldItems';
import { shake, punch, kick } from '../gfx/juice';
import { noise } from '../actions/world';
import type { Input } from '../core/input';
import type { Player } from './player';
import { setVaultHeight } from './motionAnims';
import { fallImpact } from '../survival/impacts';

type MState = 'free' | 'slide' | 'vault' | 'hop' | 'stumble' | 'fallen' | 'getup' | 'stagger';
/** a vault: from where, to where, over how high (world), and what is being cleared */
interface VaultPlan { x0: number; z0: number; x1: number; z1: number; h: number; what: 'wall' | 'window' | 'furniture'; glass?: boolean; dir: number }

declare module './player' {
  interface Player {
    /** the body's physical movement state (local unit): src/entities/motion.ts */
    motion?: UnitMotion;
    /** forward lean the animator adds (radians, from acceleration and sprinting) */
    motionLean?: number;
  }
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _b = new THREE.Vector3();
const say = (p: Player, s: string) => bus.emit('think', p, s);
const audio = (k: string, x: number, z: number, v: number) => { try { G.audio?.at?.(k, x, z, v); } catch { /* no audio */ } };

export class UnitMotion {
  st: MState = 'free';
  t = 0;
  dur = 0;
  /** slide / vault / stumble / fall direction (world radians) */
  dir = 0;
  /** chose to go flat (Ctrl) */
  prone = false;
  /** out of breath: no running until the wind comes back */
  blown = false;
  /** outside velocity (blows, slams): it bleeds off on friction */
  exVx = 0; exVz = 0;
  /** the last trip / fall / slam / slide / vault (dev, tests) */
  last = '';
  /** how the last fall landed (front / back) */
  landed = '';
  private lean = 0;
  private prevSp = 0;
  private accF = 0;
  /** how hard the last fall was (knockdown strength) and how fast the body was going */
  private fallK = 0.6; private fallV = 0;
  /** the vault in progress */
  vault: VaultPlan | null = null;
  /** slide speed at the start (it bleeds off) */
  private slideV0 = 0;
  private tripCd = 0;
  private breathT = 0;
  private clutterT = 0;
  private clutter = 0;
  private thudDone = false;
  private wasForced = false;
  private since = 0;
  private pending: { dx: number; dz: number; k: number; dmg: number; part: string; grab: boolean } | null = null;

  /** no steering at all (sliding, vaulting, stumbling, on the floor, getting up) */
  get locked() { return this.st === 'slide' || this.st === 'vault' || this.st === 'stumble' || this.st === 'fallen' || this.st === 'getup'; }
  /** low to the floor right now (sliding): the controller reports a crouched stance */
  get low() { return this.st === 'slide'; }

  // ================================================================ input: crouch, crawl, slide, vault
  input(p: Player, inp: Input, locked: boolean) {
    // never stuck: a state that outlived itself by seconds (the sim paused under it, a death and a revival) lets go
    if (this.st !== 'free' && G.time - this.since > this.dur + 4) this.reset(p);
    if (locked || this.locked || p.inVehicle) return;
    const swim = p.stance === 'swim';
    if (swim) { this.prone = false; return; }
    const crouch = inp.hit('sneak'), crawl = inp.hit('crawl'), jump = inp.hit('jump');
    if (this.prone) {
      // up again: C onto the knees (crouched), Ctrl or Shift straight up
      const run = inp.hit('run');
      if (crouch || crawl || run || jump) {
        if (!this.roomToStand(p)) { say(p, 'No room to stand under here.'); return; }
        this.prone = false; p.sneaking = crouch;
        // push up off the floor, a knee, up (quicker when it means to run)
        if (p.stance === 'crawl' && !p.body.downed) { this.dir = p.facing; this.enter('getup', run ? 0.5 : 0.7); p.playAnim('mo_up', this.dur); }
        audio('cloth', p.x, p.z, 0.5);
      }
      return;
    }
    if (crawl) {
      // down flat: a knee, the hands, the chest
      this.prone = true; p.sneaking = true;
      if (p.stance !== 'crawl') { this.dir = p.facing; this.enter('getup', 0.62); p.playAnim('mo_down', this.dur); }
      audio('cloth', p.x, p.z, 0.6); audio('thud_soft', p.x, p.z, 0.25);
      return;
    }
    if (crouch) {
      // sprinting: drop into a slide; else crouch / stand
      if (p.running && Math.hypot(p.vx, p.vz) > 2.6 && this.slide(p)) return;
      if (p.sneaking && !this.roomToStand(p)) { say(p, 'No room to stand under here.'); return; }
      p.sneaking = !p.sneaking;
      audio('cloth', p.x, p.z, 0.35);
      return;
    }
    // (a struggle or a timing window owns Space while it is up)
    if (jump && !G.combat?.qte?.active) this.jump(p, inp);
  }
  private enter(st: MState, dur: number) { this.st = st; this.t = 0; this.dur = dur; this.since = G.time; }

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
  /** arms full of planks or dragging a body: no sprint (src/interact/haul.ts) */
  canRun(p: Player): boolean { return !this.blown && !this.prone && this.st === 'free' && !p.armload?.length && !p.dragging; }
  speedMul(p: Player): number {
    if (this.st === 'stagger') return 0.25;
    if (p.dragging) return 0.58;
    if (p.armload?.length) { const n = p.armload.length; return Math.max(0.5, 0.82 - n * 0.04); }
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
  /** turning on the spot is a touch slower than turning on the move: the feet step round under it (src/entities/humanGait.ts) */
  turnRate(p: Player): number { const s = Math.hypot(p.vx, p.vz); return this.locked ? 30 : p.stance === 'crawl' ? 4 : s > 3 ? 7 : s < 0.3 ? 9.5 : 12; }

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
    const under = p.stance === 'crawl' || this.st === 'slide';
    switch (this.st) {
      case 'slide': this.stepSlide(z, p, dt); break;
      case 'vault': this.stepVault(z, p, dt); break;
      case 'hop': this.stepHop(z, p, tvx, tvz, dt); break;
      case 'stumble': this.stepStumble(z, p, dt); break;
      case 'fallen': case 'getup': this.stepDown(z, p, dt); break;
      default: this.stepFree(z, p, tvx, tvz, dt, under);
    }
    // outside velocity (blows): friction takes it off
    if (this.exVx || this.exVz) {
      if (this.st !== 'fallen') moveCircle(z, p, this.exVx * dt, this.exVz * dt, { ignoreLow: false, under });
      const f = Math.exp(-(this.st === 'slide' ? 2 : 7) * dt);
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
    // what is left of the velocity after the collision: the slide along the wall or round the corner it was pushed
    // into (round 19: the velocity follows where the body really went, so a glancing wall keeps its speed instead of
    // bleeding it off every frame and leaving the unit stuck against it)
    if (meant > 1e-4 && moved < meant * 0.98) { p.vx = (p.x - ox) / dt; p.vz = (p.z - oz) / dt; }
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
    this.fallK = strength; this.fallV = Math.max(speed, Math.hypot(p.vx, p.vz));
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
        // what hits the floor first: a trip lands on the hands and knees, a blow throws it on its back (src/survival/impacts.ts)
        fallImpact(p, this.last === 'fall' ? 'front' : 'back', this.fallK, this.fallV);
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

  // ================================================================ slide
  /** sprinting + C: feet first along the floor, under tables, a burst that bleeds off; false when it cannot */
  slide(p: Player): boolean {
    if (this.st !== 'free') return false;
    if (p.stance !== 'stand' || this.prone || p.body.downed || p.body.dead || p.inVehicle || p.carriedBy || p.sleeping || p.carrying) return false;
    if (G.destruct?.push?.holding) return false;
    const E = p.body.endurance;
    if (E < 0.06) return false;
    const s = Math.hypot(p.vx, p.vz);
    this.dir = s > 0.5 ? Math.atan2(p.vz, p.vx) : p.facing;
    this.slideV0 = Math.max(4.3, s * 1.12);
    this.enter('slide', 0.82);
    this.last = 'slide';
    p.body.endurance = Math.max(0, E - 0.04);
    p.exertionTimer = 1;
    p.actions.clear();
    G.combat?.interrupt?.(p);
    p.playAnim('mo_slide', this.dur);
    p.facing = p.targetFacing = this.dir;
    audio('cloth', p.x, p.z, 0.8); audio('whoosh', p.x, p.z, 0.35);
    noise(p, p.x, p.z, 4, 'slide');
    return true;
  }

  private stepSlide(z: Zone, p: Player, dt: number) {
    const u = this.t / this.dur;
    // the drop carries the sprint, friction scrubs it off, the last stretch is the body sitting up
    const v = u < 0.1 ? this.slideV0 : u < 0.8 ? this.slideV0 * (1 - (u - 0.1) / 0.7 * 0.78) : this.slideV0 * 0.22 * (1 - (u - 0.8) / 0.2);
    p.vx = Math.cos(this.dir) * v; p.vz = Math.sin(this.dir) * v;
    p.facing = p.targetFacing = this.dir;
    const ox = p.x, oz = p.z, ix = p.vx * dt, iz = p.vz * dt;
    moveCircle(z, p, ix, iz, { ignoreLow: false, under: true });
    const meant = Math.hypot(ix, iz), moved = Math.hypot(p.x - ox, p.z - oz);
    if (u > 0.08 && u < 0.8 && meant > 1e-4 && moved < meant * 0.25) {
      // feet first into something: it stops dead (loose furniture gets kicked along)
      const o = this.objectAhead(z, p, this.dir);
      if (o) G.destruct?.push?.knock?.(p, o, Math.cos(this.dir) * 2.2, Math.sin(this.dir) * 2.2);
      audio('body_thud', p.x, p.z, 0.5); shake(0.2, 0.18);
      this.t = Math.max(this.t, this.dur * 0.8);
    }
    if (u >= 1) {
      this.st = 'free'; this.t = 0;
      p.vx = Math.cos(this.dir) * 0.8; p.vz = Math.sin(this.dir) * 0.8;
      // under a table: flat; still sprinting: straight up and away; else it ends crouched
      if (!this.roomToStand(p)) { this.prone = true; p.sneaking = true; return; }
      p.sneaking = !G.input?.down('run');
      p.stopAnim();
    }
  }

  // ================================================================ vault / hop
  /** Space: vault what is in front, else a short hop */
  jump(p: Player, inp: Input): boolean {
    if (this.st !== 'free') return false;
    if (p.stance === 'swim' || p.stance === 'crawl' || this.prone || p.body.downed || p.body.dead || p.inVehicle || p.carriedBy || p.sleeping) return false;
    if (G.destruct?.push?.holding) return false;
    const z = G.getZone(p.zoneKey);
    if (!z) return false;
    // which way: where it is going, else where the stick / keys point, else where it faces
    const mv = inp.moveAxis();
    const yaw = G.pr.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = fx * mv.y + rx * mv.x, mz = fz * mv.y + rz * mv.x;
    const s = Math.hypot(p.vx, p.vz);
    const dir = s > 0.8 ? Math.atan2(p.vz, p.vx) : Math.hypot(mx, mz) > 0.1 ? Math.atan2(mz, mx) : p.facing;
    const plan = this.vaultPlan(z, p, dir);
    if (plan) return this.startVault(p, plan);
    // an open or broken window right in front, out of the vault's straight line: the old climb through
    if (G.interact?.tryVault?.(p)) return true;
    return this.hop(p, dir, s);
  }

  /** what a vault from here toward `dir` would clear (null: nothing vaultable within reach) */
  vaultPlan(z: Zone, p: Player, dir: number): VaultPlan | null {
    const cx = Math.cos(dir), cz = Math.sin(dir);
    // snap to the grid axis when nearly square on (vaulting a counter at a slant still lands square across it)
    const ax = Math.abs(cx) > Math.abs(cz);
    const sx = ax ? Math.sign(cx) : 0, sz = ax ? 0 : Math.sign(cz);
    const tx = p.tileX(), ty = p.tileY();
    // 1) a low wall, a fence or an open window on the edge just ahead
    const ex = sx === 1 ? tx + 1 : tx, ey = sz === 1 ? ty + 1 : ty;
    const side: 0 | 1 = sx !== 0 ? 1 : 0;
    const toEdge = sx !== 0 ? Math.abs(ex - p.x) : Math.abs(ey - p.z);
    if (toEdge < 0.85 && z.inb(ex, ey)) {
      const e = z.edge(ex, ey, side);
      const w = side === 0 ? z.wallNAt(ex, ey) : z.wallWAt(ex, ey);
      const nx = tx + sx, ny = ty + sz;
      const land = (): [number, number] | null => {
        if (!z.inb(nx, ny) || tileSolid(z, nx, ny, {})) return null;
        // land a body's width past the line, on the far tile
        return sx !== 0 ? [ex + sx * 0.55, p.z] : [p.x, ey + sz * 0.55];
      };
      if (e && e.kind === 'window' && (e.open || e.glass !== 'intact') && !e.barricade) {
        const l = land(); if (l) return { x0: p.x, z0: p.z, x1: l[0], z1: l[1], h: 0.9, what: 'window', glass: e.glass === 'broken', dir: Math.atan2(sz, sx) };
      }
      if (w?.low && !e) {
        const l = land(); if (l) return { x0: p.x, z0: p.z, x1: l[0], z1: l[1], h: Math.min(1.25, w.height ?? 1.1), what: 'wall', dir: Math.atan2(sz, sx) };
      }
      // a wall or a door that is no vault: nothing to clear this way
      if (w || e) return null;
    }
    // 2) waist-high furniture (counters, crates, desks, tables) right ahead, with somewhere to land beyond it
    let first = -1, hMax = 0;
    for (let d = 0.3; d <= 1.05; d += 0.05) {
      const qx = Math.floor(p.x + cx * d), qz = Math.floor(p.z + cz * d);
      if (!z.inb(qx, qz)) return null;
      const sol = z.solid[z.idx(qx, qz)];
      // a solid piece is vaultable too when everything blocking there is waist high (a crate, a barrel, a dresser)
      const lowSolid = sol === 1 && z.objectsAt(qx, qz).every((o) => { const od = objDef(o.key); return !od || (od.block ?? 'solid') === 'none' || (od.height <= 1.1 && !od.tall); });
      if (sol === 2 || sol === 3 || lowSolid) {
        // how high is it, and is the body actually up against it (its real footprint, not the tile)
        for (const o of z.objectsAt(qx, qz)) {
          const od = objDef(o.key);
          if (!od || (od.block ?? 'solid') === 'none') continue;
          const f = objFootprint(z, o, od);
          const px = p.x + cx * d, pz = p.z + cz * d;
          if (px < f.x0 - 0.05 || px > f.x1 + 0.05 || pz < f.z0 - 0.05 || pz > f.z1 + 0.05) continue;
          hMax = Math.max(hMax, od.height);
          if (first < 0) first = d;
        }
        if (first >= 0) break;
      } else if (sol === 1) return null;
      // a wall between here and there is not furniture to vault
      if (d > 0.3) { const bx = Math.floor(p.x + cx * (d - 0.05)), bz = Math.floor(p.z + cz * (d - 0.05)); if ((bx !== qx || bz !== qz) && z.edgeBlocks(bx, bz, qx - bx, qz - bz, 'walk')) return null; }
    }
    if (first < 0 || hMax > 1.2 || hMax < 0.3) return null;
    // across it: the first free spot beyond (no wall in between), a body's width clear
    let px = Math.floor(p.x + cx * first), pz = Math.floor(p.z + cz * first);
    for (let d = first + 0.1; d <= first + 2.2; d += 0.1) {
      const qx = Math.floor(p.x + cx * d), qz = Math.floor(p.z + cz * d);
      if (!z.inb(qx, qz)) return null;
      if (qx !== px || qz !== pz) {
        const ddx = Math.sign(qx - px), ddz = Math.sign(qz - pz);
        if (ddx && ddz) { if (z.edgeBlocks(px, pz, ddx, 0, 'walk') || z.edgeBlocks(px + ddx, pz, 0, ddz, 'walk')) return null; }
        else if (z.edgeBlocks(px, pz, ddx, ddz, 'walk')) return null;
        px = qx; pz = qz;
      }
      const sol = z.solid[z.idx(qx, qz)];
      if (sol === 1) return null;
      if (sol === 0) {
        const lx = p.x + cx * (d + 0.32), lz = p.z + cz * (d + 0.32);
        const probe = { x: lx, z: lz, radius: p.radius };
        resolve(z, probe, {});
        if (Math.hypot(probe.x - lx, probe.z - lz) > 0.2) continue;
        if (!z.floor[z.idx(Math.floor(probe.x), Math.floor(probe.z))]) return null;
        return { x0: p.x, z0: p.z, x1: probe.x, z1: probe.z, h: hMax, what: 'furniture', dir };
      }
    }
    return null;
  }

  private startVault(p: Player, plan: VaultPlan): boolean {
    const E = p.body.endurance;
    if (E < 0.05) { say(p, 'No breath left to climb.'); return false; }
    const load = clamp(p.heavyLoad(), 0, 1.5);
    const span = Math.hypot(plan.x1 - plan.x0, plan.z1 - plan.z0);
    // a sprint flies over; from a standstill it is a plant-and-swing; heavy things and windows are slower
    const fast = Math.hypot(p.vx, p.vz) > 2.6;
    const dur = (fast ? 0.62 : 0.8) + Math.max(0, plan.h - 0.8) * 0.35 + Math.max(0, span - 1.3) * 0.18 + load * 0.15 + (plan.what === 'window' ? 0.2 : 0);
    this.vault = plan;
    this.dir = plan.dir;
    this.enter('vault', dur);
    this.last = 'vault:' + plan.what;
    p.body.endurance = Math.max(0, E - 0.03 * (1 + load));
    p.exertionTimer = 1;
    p.actions.clear();
    G.combat?.interrupt?.(p);
    setVaultHeight(plan.h);
    p.playAnim('mo_vault', dur);
    p.facing = p.targetFacing = plan.dir;
    p.vx = p.vz = 0;
    this.thudDone = false;
    audio(plan.what === 'window' ? 'climb' : 'cloth', p.x, p.z, 0.7);
    noise(p, p.x, p.z, 5, 'climb');
    return true;
  }

  private stepVault(z: Zone, p: Player, dt: number) {
    const V = this.vault;
    if (!V) { this.st = 'free'; return; }
    const u = clamp(this.t / this.dur, 0, 1);
    // the run-up step, the swing over (fast), the drop and the catch
    const e = u < 0.22 ? 0.12 * smooth(u / 0.22) : u < 0.78 ? 0.12 + 0.84 * smooth((u - 0.22) / 0.56) : 0.96 + 0.04 * smooth((u - 0.78) / 0.22);
    const ox = p.x, oz = p.z;
    p.x = V.x0 + (V.x1 - V.x0) * e; p.z = V.z0 + (V.z1 - V.z0) * e;
    p.vx = (p.x - ox) / Math.max(dt, 1e-4); p.vz = (p.z - oz) / Math.max(dt, 1e-4);
    p.facing = p.targetFacing = V.dir;
    if (!this.thudDone && u > 0.86) { this.thudDone = true; audio('thud_soft', p.x, p.z, 0.5); noise(p, p.x, p.z, 4, 'land'); }
    if (u >= 1) {
      p.x = V.x1; p.z = V.z1;
      resolve(z, p, {});
      this.st = 'free'; this.t = 0; this.vault = null;
      p.vx = Math.cos(V.dir) * 1.2; p.vz = Math.sin(V.dir) * 1.2;
      p.body.addXp?.('nimble', 2);
      if (V.glass && Math.random() < 0.5) {
        const part = (['thigh_l', 'thigh_r', 'farm_l', 'farm_r'] as const)[Math.floor(Math.random() * 4)];
        p.body.addInjury(part, Math.random() < 0.4 ? 'glass' : 'laceration', 0.4, { dirty: true });
        say(p, 'Argh! Broken glass!');
      }
    }
  }

  /** nothing to vault: a short hop (carries the run; clears junk on the floor) */
  private hop(p: Player, dir: number, s: number): boolean {
    if (p.body.endurance < 0.04) return false;
    this.dir = dir;
    this.enter('hop', s > 2.6 ? 0.5 : 0.44);
    this.last = 'hop';
    p.body.endurance = Math.max(0, p.body.endurance - 0.015);
    p.playAnim('mo_hop', this.dur);
    this.thudDone = false;
    audio('cloth', p.x, p.z, 0.4);
    return true;
  }
  private stepHop(z: Zone, p: Player, tvx: number, tvz: number, dt: number) {
    const u = this.t / this.dur;
    // steerable a little in the air, momentum mostly kept; low junk is cleared while off the floor
    const k = 1 - Math.exp(-2.5 * dt);
    p.vx += (tvx - p.vx) * k; p.vz += (tvz - p.vz) * k;
    moveCircle(z, p, p.vx * dt, p.vz * dt, { ignoreLow: false });
    if (Math.hypot(p.vx, p.vz) > 0.3) p.targetFacing = Math.atan2(p.vz, p.vx);
    if (!this.thudDone && u > 0.78) { this.thudDone = true; audio('thud_soft', p.x, p.z, 0.35); noise(p, p.x, p.z, 4, 'land'); }
    if (u >= 1) { this.st = 'free'; this.t = 0; }
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
    // mid-vault the body is over the counter: the blow is shrugged off (no knockback into the furniture)
    if (this.st === 'vault') return;
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
    this.st = 'free'; this.t = 0; this.exVx = this.exVz = 0; this.pending = null; this.vault = null;
  }

  /** dev / tests */
  debug() { return { st: this.st, t: +this.t.toFixed(2), prone: this.prone, blown: this.blown, last: this.last, landed: this.landed, ex: +Math.hypot(this.exVx, this.exVz).toFixed(2) }; }
}

export function motionOf(p: Player): UnitMotion { return p.motion ?? (p.motion = new UnitMotion()); }

// a creature's blow lands on the local unit: knockback, staggers, knockdowns
bus.on('playerHit', (p: Player, part: string, _kind: string, h: any) => {
  try { if (p?.isLocal && !p.body.dead) motionOf(p).hit(p, h, part); } catch (e) { console.error('motion hit', e); }
});

// dev / screenshots: put the local unit into a movement state and hold a frame of it
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const pin = { t: -1, dur: 0 };
  const loop = () => { const p = G?.local; if (p && pin.t >= 0) { (p as any).visT = pin.t; p.actionT = pin.t; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  (window as any).__ctrl = {
    m: () => G.local && motionOf(G.local),
    /** stand the unit square in front of the nearest waist-high thing it could vault (searches the zone) */
    nearVault(maxD = 40) {
      const p = G.local, z = G.getZone(p.zoneKey), M = motionOf(p);
      let best: { x: number; z: number; dir: number; d: number } | null = null;
      for (const o of z.objects.values()) {
        const d = objDef(o.key);
        if (!d || (d.block !== 'low' && d.block !== 'table') || d.height < 0.6 || d.height > 1.1) continue;
        const dist = Math.hypot(o.x - p.x, o.y - p.z);
        if (dist > maxD || (best && dist > best.d)) continue;
        for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const sx = o.x + 0.5 - dx * 1.05, sz = o.y + 0.5 - dz * 1.05;
          if (!z.inb(Math.floor(sx), Math.floor(sz)) || z.solid[z.idx(Math.floor(sx), Math.floor(sz))] || !z.floor[z.idx(Math.floor(sx), Math.floor(sz))]) continue;
          const save = [p.x, p.z]; p.x = sx; p.z = sz;
          const plan = M.vaultPlan(z, p, Math.atan2(dz, dx));
          p.x = save[0]; p.z = save[1];
          if (plan) { best = { x: sx, z: sz, dir: Math.atan2(dz, dx), d: dist }; break; }
        }
      }
      if (!best) return null;
      p.x = best.x; p.z = best.z; p.vx = p.vz = 0; p.facing = p.targetFacing = best.dir;
      G.pr.target.set(p.x, p.y, p.z);
      return best;
    },
    /** put a kitchen counter (or `key`) square across the unit's way, the unit side-on to the camera in front of it */
    stage(key = 'counter_kitchen') {
      const p = G.local, z = G.getZone(p.zoneKey);
      for (const o of [...z.objects.values()]) if (o.uid >= 990000) z.removeObject(o);
      const yaw = G.pr.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const ax = Math.abs(rx) > Math.abs(rz), sx = ax ? Math.sign(rx) : 0, sz = ax ? 0 : Math.sign(rz);
      const free = (x: number, y: number) => z.inb(x, y) && !!z.floor[z.idx(x, y)] && !z.solid[z.idx(x, y)] && !z.objectsAt(x, y).length;
      const lit = (x: number, y: number) => { try { return (G as any).lightLevelAt?.(x + 0.5, y + 0.5) ?? 1; } catch { return 1; } };
      let best: { x: number; y: number; l: number } | null = null;
      for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = p.tileX() + dx, y = p.tileY() + dy;
        if (!free(x, y) || !free(x + sx, y + sz) || !free(x + 2 * sx, y + 2 * sz)) continue;
        // open floor round it (no wall to hide the unit from the camera)
        let open = true;
        for (let k = -1; k <= 3 && open; k++) for (const w of [-1, 1]) { const qx = x + sx * k + (sz ? w : 0), qy = y + sz * k + (sx ? w : 0); if (!free(qx, qy)) open = false; }
        if (!open || z.edgeBlocks(x, y, -sx, -sz)) continue;
        if (z.edgeBlocks(x, y, sx, sz) || z.edgeBlocks(x + sx, y + sz, sx, sz)) continue;
        // the best lit spot (a dark corner hides the unit)
        const l = lit(x, y) + lit(x + sx, y + sz);
        if (!best || l > best.l + 0.05) best = { x, y, l };
      }
      if (!best) return null;
      const { x, y } = best;
      z.addObject({ uid: 990000 + Math.floor(Math.random() * 9000), key, x: x + sx, y: y + sz, rot: sx ? 1 : 0, state: {} } as any);
      p.x = x + 0.5 - sx * 0.1; p.z = y + 0.5 - sz * 0.1; p.vx = p.vz = 0; p.facing = p.targetFacing = Math.atan2(sz, sx);
      G.pr.target.set(p.x, p.y, p.z);
      return { x, y, sx, sz, light: best.l };
    },
    /** start a vault / slide / hop for real; `freeze` (0..1) stops the world at that point of it */
    act(kind: 'vault' | 'slide' | 'hop', freeze = -1) {
      const p = G.local, z = G.getZone(p.zoneKey), M = motionOf(p) as any;
      G.paused = false; pin.t = -1;
      M.reset(p); M.prone = false; p.sneaking = false; p.stance = 'stand';
      if (kind === 'vault') { const plan = M.vaultPlan(z, p, p.facing); if (!plan || !M.startVault(p, plan)) return false; }
      else if (kind === 'slide') { p.running = true; p.vx = Math.cos(p.facing) * 4.2; p.vz = Math.sin(p.facing) * 4.2; if (!M.slide(p)) return false; }
      else M.hop(p, p.facing, 0);
      if (freeze >= 0) {
        M.t = freeze * M.dur;
        if (kind === 'vault') M.stepVault(z, p, 1e-3);
        pin.t = freeze * M.dur; pin.dur = M.dur;
        G.paused = true;
        // a still frame: no look-ahead, no blur trail from the camera catching up
        p.vx = p.vz = 0; (G as any).camera?.settle?.(); G.pr.target.set(p.x, p.y, p.z);
      }
      return true;
    },
    /** hold any named pose (or '' to let go) */
    hold(name: string, u: number, dur = 1) { const p = G.local; if (!name) { pin.t = -1; G.paused = false; p.stopAnim(); return; } p.playAnim(name, dur); pin.t = u * dur; G.paused = true; },
    /** stop the world where it is, the camera on the unit */
    still() { const p = G.local; G.paused = true; p.vx = p.vz = 0; (G as any).camera?.settle?.(); G.pr.target.set(p.x, p.y, p.z); },
    release() { pin.t = -1; G.paused = false; },
  };
}

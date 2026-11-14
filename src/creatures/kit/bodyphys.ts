// Round 18: the physics animation layer every creature's rig goes through after the
// smoothing layer (src/creatures/kit/smooth.ts), so no species file has to know.
// src/creatures/manager.ts updateVisuals calls physUndo() before anything poses the rig
// and physApply() after everything has, so the offsets below never feed back into a
// species' own pose. All of it is visual: it reads only replicated state (position,
// facing, hit flash, death, net memory), steps on a fixed 1/120 s clock, and comes out
// the same on every peer.
//  - the body is a mass on springs: a blow is an impulse (it rocks away from the hit,
//    gets shoved off its feet a little and recovers, overshooting), a turn taken too
//    fast throws it outward and makes it stumble, braking hard at speed makes a big
//    body skid (dust under its feet), a ram into a wall crumples it forward
//  - the head is stabilised: it holds itself level while the body pitches and rolls
//    under it (predators, grazers, anything with a head)
//  - death: the body's topple (physics.ts corpseFall) gets loose limbs: every part
//    flops on its own spring when it goes down and again when it hits the floor
//  - cheap: sleeps when nothing is moving, skipped beyond 34 m, at most 6 substeps
// (Feet: the life rigs plant theirs in the world while they bear weight and shift the
// body over them, src/creatures/life/anim.ts.)
import * as THREE from 'three';
import type { Creature } from '../creature';
import type { Rig } from '../species';
import type { VisMotion } from './smooth';
import { hasWeight } from './physics';
import { G } from '../../game/G';
import { PK } from '../../gore/particles';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const STEP = 1 / 120;

interface Flop { o: THREE.Object3D; ax: THREE.Vector3; a: number; w: number }
interface Saved { o: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }
interface PH {
  /** body tilt (pitch about the side axis, roll about the forward axis) and its angular velocity */
  tp: number; tr: number; wp: number; wr: number;
  /** body offset (creature space: x side, y up, z forward) and its velocity */
  ox: number; oy: number; oz: number; vx: number; vy: number; vz: number;
  acc: number; flash: number; imp: number; thud: number; deadT: number; stumbleCd: number; dustT: number;
  flops: Flop[] | null; saved: Saved[]; asleep: boolean;
}
const STATS = { applied: 0, slept: 0, hits: 0, stumbles: 0, flops: 0 };
try { (globalThis as any).__phys = STATS; } catch { /* no window */ }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const hashF = (s: string, k: number) => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };

function stateOf(rig: Rig): PH {
  const ud = rig.root.userData;
  return (ud._ph ??= { tp: 0, tr: 0, wp: 0, wr: 0, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, acc: 0, flash: 0, imp: 0, thud: 0, deadT: 0, stumbleCd: 0, dustT: 0, flops: null, saved: [], asleep: true }) as PH;
}
const save = (S: PH, o: THREE.Object3D) => { if (!S.saved.some((s) => s.o === o)) S.saved.push({ o, q: o.quaternion.clone(), p: o.position.clone() }); };

/** before anything poses the rig: take last frame's physics offsets back off */
export function physUndo(rig: Rig) {
  const S = rig.root.userData._ph as PH | undefined;
  if (!S || !S.saved.length) return;
  for (const s of S.saved) { s.o.quaternion.copy(s.q); s.o.position.copy(s.p); }
  S.saved.length = 0;
}

/** how heavy it feels (1 = a unit-sized animal) */
const heft = (c: Creature) => clamp(0.5 + c.radius * 1.3 + c.height * 0.2, 0.5, 4);

/** a shove to the body, world direction (wx, wz), strength ~0..3 */
function impulse(S: PH, c: Creature, rig: Rig, wx: number, wz: number, k: number) {
  const yaw = rig.root.rotation.y;
  // world -> creature space (the rig faces +z)
  const lx = wx * Math.cos(yaw) - wz * Math.sin(yaw), lz = wx * Math.sin(yaw) + wz * Math.cos(yaw);
  const s = (1.6 + 2.6 * k) / heft(c);
  S.wp += lz * s * 2.2; S.wr -= lx * s * 2.2;
  S.vx += lx * s * 0.35 * c.radius; S.vz += lz * s * 0.35 * c.radius; S.vy -= s * 0.12 * c.height;
  S.asleep = false;
}

/** after everything posed the rig this frame */
export function physApply(c: Creature, rig: Rig, dt: number, vm: VisMotion | null, distToLocal: number) {
  if (!hasWeight(c) || dt <= 0 || distToLocal > 34) return;
  const S = stateOf(rig);
  const n = (c.mem.netMem || c.mem.net || {}) as Record<string, any>;
  const hv = heft(c);
  // ---- what happened to it this frame
  if (c.hitFlash > S.flash + 0.05 && !c.dead) {
    const hd = c.mem.lastHitDir as [number, number, number] | undefined;
    const wx = hd ? hd[0] : -Math.cos(c.facing), wz = hd ? hd[1] : -Math.sin(c.facing);
    impulse(S, c, rig, wx, wz, hd ? clamp(hd[2], 0.2, 2.5) : 0.6);
    STATS.hits++;
  }
  S.flash = c.hitFlash;
  // a rammer's head-on stop: everything behind the head keeps going
  if ((n.imp ?? 0) !== S.imp) { if (S.imp !== 0 || n.imp) impulse(S, c, rig, Math.cos(c.facing), Math.sin(c.facing), 2.6); S.imp = n.imp ?? 0; }
  S.stumbleCd = Math.max(0, S.stumbleCd - dt);
  if (vm && !c.dead) {
    // a turn taken too fast throws it outward (the faster and lighter, the sooner it stumbles)
    const cent = vm.v * vm.fw;
    const lim = 7 + hv * 1.5;
    if (Math.abs(cent) > lim && S.stumbleCd <= 0) {
      const out = Math.sign(cent);
      S.wr += out * clamp((Math.abs(cent) - lim) * 0.25, 0.4, 2.2) / Math.sqrt(hv); S.vy -= 0.08 * c.height; S.asleep = false;
      S.stumbleCd = 0.6; STATS.stumbles++;
    }
    // braking hard at speed: big bodies skid, nose down, dust off the feet
    if (vm.acc < -5 && vm.v > 2.2) {
      S.wp += clamp(-vm.acc * 0.02, 0, 0.6) * dt * 20 / Math.sqrt(hv); S.asleep = false;
      if (c.radius > 0.7 && c.visibleToLocal && (S.dustT -= dt) <= 0) {
        S.dustT = 0.06;
        const dust = (G as any).destruct?.dust;
        if (dust) for (let i = 0; i < 2; i++) { const a = c.facing + (Math.random() - 0.5) * 1.2; dust.add(PK.Dust, c.x + Math.cos(a) * c.radius * 0.8, 0.06, c.z + Math.sin(a) * c.radius * 0.8, Math.cos(c.facing) * 1.2, 0.3 + Math.random() * 0.4, Math.sin(c.facing) * 1.2, 0.05 + Math.random() * 0.05, 0.7 + Math.random() * 0.5, 0x9a8a72); }
      }
    }
  }
  // ---- integrate on a fixed small step
  if (!S.asleep) {
    S.acc = Math.min(S.acc + dt, STEP * 6);
    const K = 150 / Math.sqrt(hv), C = 2 * Math.sqrt(K) * 0.42; // under-damped: it overshoots and settles
    const KP = 220 / Math.sqrt(hv), CP = 2 * Math.sqrt(KP) * 0.55;
    while (S.acc >= STEP) {
      S.acc -= STEP;
      S.wp += (-S.tp * K - S.wp * C) * STEP; S.tp += S.wp * STEP;
      S.wr += (-S.tr * K - S.wr * C) * STEP; S.tr += S.wr * STEP;
      S.vx += (-S.ox * KP - S.vx * CP) * STEP; S.ox += S.vx * STEP;
      S.vy += (-S.oy * KP - S.vy * CP) * STEP; S.oy += S.vy * STEP;
      S.vz += (-S.oz * KP - S.vz * CP) * STEP; S.oz += S.vz * STEP;
    }
    S.tp = clamp(S.tp, -0.6, 0.6); S.tr = clamp(S.tr, -0.6, 0.6);
    const e = Math.abs(S.tp) + Math.abs(S.tr) + Math.abs(S.wp) * 0.1 + Math.abs(S.wr) * 0.1 + Math.abs(S.ox) + Math.abs(S.oy) + Math.abs(S.oz) + (Math.abs(S.vx) + Math.abs(S.vy) + Math.abs(S.vz)) * 0.1;
    if (e < 2e-4) { S.tp = S.tr = S.wp = S.wr = S.ox = S.oy = S.oz = S.vx = S.vy = S.vz = 0; S.asleep = true; STATS.slept++; }
  }
  const body = rig.body;
  if (!S.asleep && !c.dead) {
    save(S, body);
    body.quaternion.premultiply(_q.setFromEuler(_e.set(S.tp, 0, S.tr)));
    body.position.x += S.ox; body.position.y += S.oy; body.position.z += S.oz;
    STATS.applied++;
  }
  // ---- the head holds itself level over a pitching, rolling body
  const head = (rig.parts.head ?? rig.parts.Head) as THREE.Object3D | undefined;
  if (head && head.parent && !c.dead && c.attackPhase <= 0 && head !== body) {
    head.parent.updateWorldMatrix(true, false);
    head.parent.getWorldQuaternion(_q2);
    // how far the parent's up has tipped from the world's (pitch / roll only: never undo where it looks)
    _v.copy(_up).applyQuaternion(_q2);
    const tilt = Math.acos(clamp(_v.y, -1, 1));
    if (tilt > 0.01 && tilt < 1.2) {
      _q.setFromUnitVectors(_v, _up);            // world correction
      _q.slerp(_q.clone().identity(), 1 - 0.55); // part of it: a head is not a gyroscope
      // into the parent's frame: P^-1 * corr * P
      const Pinv = _q2.clone().invert();
      const corr = Pinv.multiply(_q).multiply(_q2);
      save(S, head);
      head.quaternion.premultiply(corr);
    }
  }
  // ---- death: loose limbs that flop as it goes down and again when it hits the floor
  if (c.dead) {
    S.deadT += dt;
    if (!S.flops && S.deadT < 0.5) {
      S.flops = [];
      let i = 0;
      for (const [name, o] of Object.entries(rig.parts)) {
        if (!o || o === body || i++ > 40) continue;
        const ax = new THREE.Vector3(hashF(c.id + name, 1) - 0.5, (hashF(c.id + name, 2) - 0.5) * 0.4, hashF(c.id + name, 3) - 0.5).normalize();
        S.flops.push({ o, ax, a: 0, w: (3 + 4 * hashF(name, 4)) * (hashF(c.id + name, 5) < 0.5 ? -1 : 1) });
      }
      STATS.flops++;
    }
    const thud = (c.mem.fallThud ?? 0) as number;
    if (S.flops && thud !== S.thud) { S.thud = thud; for (const f of S.flops) f.w += (f.w >= 0 ? 1 : -1) * 2.5; }
    if (S.flops && S.deadT < 5) {
      S.acc = Math.min(S.acc + dt, STEP * 6);
      let steps = 0;
      while (S.acc >= STEP) { S.acc -= STEP; steps++; }
      for (const f of S.flops) {
        for (let k = 0; k < steps; k++) { f.w += (-f.a * 55 - f.w * 3.2) * STEP; f.a += f.w * STEP; }
        f.a = clamp(f.a, -0.9, 0.9);
        if (Math.abs(f.a) < 1e-4 || f.o.parent == null) continue;
        save(S, f.o);
        f.o.quaternion.multiply(_q.setFromAxisAngle(f.ax, f.a));
      }
    }
  } else if (S.flops) { S.flops = null; S.deadT = 0; }
}

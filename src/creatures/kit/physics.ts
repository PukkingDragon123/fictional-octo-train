// Shared creature body physics (round 15), used by the creature manager for
// every species, so no species file has to know:
//  - inertia: a creature's velocity turns toward where it wants to go at a
//    rate set by its size (a rat darts, a heavy thing leans into its turns and
//    swings wide), it faces where it is actually going, and it slides to a stop
//  - footing: a blow shoves it (the knockback bleeds off on friction instead of
//    vanishing next frame) and it reels the way it was hit
//  - death: the body topples over the way the killing blow drove it (tall
//    things fall along the blow, long low ones roll onto a side), bounces once
//    on the floor and settles; flyers drop out of the air
// Ghosts, glitches and things that move when unwatched keep their uncanny,
// weightless movement.
import * as THREE from 'three';
import type { Creature } from '../creature';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** does this one move like a body with weight at all */
export function hasWeight(c: Creature): boolean {
  const f = c.sp.flags;
  return !(f?.ghost || f?.glitch || f?.weepingAngel || f?.attached);
}

/** how hard it can change its velocity (m/s²): small things dart, big ones lumber */
export function agility(c: Creature): number {
  const r = Math.max(0.12, c.radius);
  let a = clamp(15 / (0.45 + r * 1.5), 4, 24);
  if (c.sp.flags?.flying) a *= 0.7;
  if (c.sp.flags?.swimmer) a *= 0.6;
  return a;
}

/**
 * Steer the velocity toward (wx, wz) with limited acceleration: speeding up
 * takes a moment, a turn at speed is an arc (the sideways change is limited
 * too), a reversal brakes first.
 */
export function steer(c: Creature, wx: number, wz: number, dt: number) {
  if (!hasWeight(c) || dt <= 0) { c.vx = wx; c.vz = wz; return; }
  const a = agility(c);
  let dx = wx - c.vx, dz = wz - c.vz;
  const dl = Math.hypot(dx, dz);
  const s = Math.hypot(c.vx, c.vz);
  // going the other way at speed: the brakes are better than the turn
  const rev = s > 0.5 && (wx * c.vx + wz * c.vz) < 0;
  const max = a * dt * (rev ? 1.35 : 1);
  if (dl > max) { dx *= max / dl; dz *= max / dl; }
  c.vx += dx; c.vz += dz;
}

/** no wish to move: friction brings it to a stop (or the knockback slides out) */
export function brake(c: Creature, dt: number) {
  if (!hasWeight(c)) { c.vx *= 0.7; c.vz *= 0.7; return; }
  const k = c.sp.flags?.flying ? 3 : clamp(agility(c) * 0.6, 4, 12);
  const f = Math.exp(-k * dt);
  c.vx *= f; c.vz *= f;
}

/** heading to face: where it is really going once it is moving, else where it wants to go */
export function heading(c: Creature, wantX: number, wantZ: number): number {
  return Math.hypot(c.vx, c.vz) > 0.35 && hasWeight(c) ? Math.atan2(c.vz, c.vx) : Math.atan2(wantZ, wantX);
}

/** a blow: a shove scaled by how heavy it is, and a reel the way it was hit (drawn by src/combat/creatureState.ts) */
export function shoveBy(c: Creature, fx: number, fz: number, knock: number, G: { time: number }) {
  const dx = c.x - fx, dz = c.z - fz, d = Math.hypot(dx, dz) || 1;
  const heavy = clamp(0.5 + c.radius * 1.3 + c.height * 0.2, 0.5, 4);
  const v = (knock * 6) / heavy;
  c.vx = (dx / d) * v; c.vz = (dz / d) * v;
  if (knock > 0.05 && hasWeight(c)) {
    const prev = c.mem.cbFl as { t: number } | undefined;
    if (!prev || G.time - prev.t > 0.1) c.mem.cbFl = { t: G.time, dx, dz, s: clamp(knock * 1.6 / heavy, 0.25, 1.5) };
  }
}

// ---------------------------------------------------------------- death: the topple
interface Fall { ax: THREE.Vector3; ang: number; av: number; goal: number; restY: number; bounced: number; drop: number; vy: number; done: boolean }
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _box = new THREE.Box3();

/**
 * The corpse's body (c.rig.body) tips over about its feet: start it with the
 * killing blow's direction (world) and strength. Applied every frame after the
 * species' own (dead) pose; returns false when the rig is not there yet.
 */
export function corpseFall(c: Creature, dt: number, settled = false): boolean {
  const rig = c.rig; if (!rig) return false;
  const body = rig.body as THREE.Object3D;
  let F = c.mem.fall as Fall | undefined;
  if (!F) {
    // the way it was driven (from the last hit), in the body's own frame
    const hit = c.mem.lastHitDir as [number, number, number] | undefined;
    let wx = hit ? hit[0] : Math.cos(c.facing + Math.PI / 2), wz = hit ? hit[1] : Math.sin(c.facing + Math.PI / 2);
    const k = hit ? hit[2] : 0.4;
    const yaw = rig.root.rotation.y;
    const lx = wx * Math.cos(yaw) - wz * Math.sin(yaw), lz = wx * Math.sin(yaw) + wz * Math.cos(yaw);
    // tall upright things fall along the blow; long low bodies roll onto a side
    const tall = c.height > c.radius * 2.6 && !c.sp.flags?.flying;
    if (!tall) {
      const side = Math.abs(lx) > 0.05 ? Math.sign(lx) : (c.id.charCodeAt(c.id.length - 1) % 2 ? 1 : -1);
      _d.set(side, 0, 0);
    } else _d.set(lx, 0, lz).normalize();
    if (_d.lengthSq() < 0.5) _d.set(1, 0, 0);
    const ax = new THREE.Vector3().crossVectors(_up, _d).normalize();
    // how far over: a side or the face / back for tall bodies, nearly flat for flyers' crumpled wings
    const goal = Math.PI / 2 * (tall ? 0.97 : 1);
    // its resting height once over (measured in the final pose)
    body.quaternion.setFromAxisAngle(ax, goal); body.position.y = 0;
    rig.root.updateMatrixWorld(true);
    _box.setFromObject(body);
    const restY = _box.isEmpty() ? -c.height * 0.25 : clamp(rig.root.position.y + 0.015 - _box.min.y, -c.height, 0.3);
    body.quaternion.identity();
    const flyH = c.sp.flags?.flying ? Math.max(0, (rig.root.position.y - c.y)) : 0;
    F = c.mem.fall = settled ? { ax, ang: goal, av: 0, goal, restY, bounced: 2, drop: 0, vy: 0, done: true } : { ax, ang: 0.02, av: 0.6 + k * 2.4, goal, restY, bounced: 0, drop: flyH, vy: 0, done: false };
  }
  if (!F.done && dt > 0) {
    // a rod pivoting on its foot: angular acceleration ~ g sin(angle) / height
    const h = clamp(c.height * 0.55, 0.15, 3);
    F.av += (9.8 / h) * Math.sin(F.ang + 0.06) * dt;
    F.ang += F.av * dt;
    if (F.ang >= F.goal) {
      F.ang = F.goal;
      if (F.av > 1.4 && F.bounced < 2) { F.av = -F.av * 0.28; F.bounced++; c.mem.fallThud = (c.mem.fallThud ?? 0) + 1; }
      else { F.av = 0; F.done = F.drop <= 0.001; }
    }
    if (F.drop > 0) { F.vy -= 9.8 * dt; F.drop = Math.max(0, F.drop + F.vy * dt); if (F.drop <= 0 && F.ang >= F.goal - 1e-3) F.done = true; }
  }
  // (absolute, like the old fixed fall onto the side: the species' dead pose moves the limbs, this the whole body)
  _q.setFromAxisAngle(_d.set(F.ax.x, F.ax.y, F.ax.z), F.ang);
  body.quaternion.copy(_q);
  body.position.y = F.restY * (F.ang / F.goal) + F.drop;
  return true;
}

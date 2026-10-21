// What a fight does to a creature beyond its hit points: poise that breaks
// into a stagger, being knocked down, being held still while it is executed,
// pinning a survivor during a struggle. The host owns the state (c.mem.cb);
// every peer draws it from flags in the creature's net memory (c.mem.netMem:
// cbd down, cbs staggered, cbx execution pose, cbp pinning). One op, 'cb',
// carries a client's requests to the host.
import { G } from '../game/G';
import { defOp, op } from '../game/ops';
import type { Creature } from '../creatures/creature';
import { poiseOf, sizeClass } from './moves';
import { goreOf } from '../gore/kinds';
import { partRole, tearDef } from '../gore/tearing';

export interface CbState { poise: number; poiseT: number; down?: number; stun?: number; exec?: { by: string; until: number }; pin?: { pid: string; until: number } }

const st = (c: Creature): CbState => c.mem.cb || (c.mem.cb = { poise: 0, poiseT: 0 });
/**
 * Set a flag every peer can see. Host convention (src/creatures/behaviors_b.ts net()): mem.net and
 * mem.netMem are one object; clients write into the snapshot copy until the next one arrives.
 */
export function flag(c: Creature, k: string, v: any) {
  let n = G.role === 'client' ? c.mem.netMem : c.mem.net;
  if (!n || typeof n !== 'object') { n = {}; if (G.role !== 'client') c.mem.net = n; }
  c.mem.netMem = n;
  n[k] = v || 0;
}
const nm = (c: Creature): any => c.mem.netMem || c.mem.net || {};

/** can it be killed at all (the immortal, the hazards, the things with thousands of hit points) */
export function killable(c: Creature): boolean { return !c.sp.flags?.immortal && c.sp.hp < 900 && c.sp.temperament !== 'hazard'; }
export const isDown = (c: Creature) => !!nm(c).cbd && !c.dead;
export const isStunned = (c: Creature) => !!nm(c).cbs && !c.dead;
export const inExec = (c: Creature) => !!nm(c).cbx && !c.dead;
/** a finisher is on: knocked down, staggered, or nearly dead */
export function executable(c: Creature): boolean {
  if (c.dead || !killable(c) || inExec(c)) return false;
  return isDown(c) || isStunned(c) || (c.hp > 0 && c.hp <= c.sp.hp * 0.18);
}

// ------------------------------------------------------------------ host side
export function knockDown(c: Creature, secs: number) {
  const s = st(c);
  s.down = Math.max(s.down ?? 0, G.time + secs);
  s.stun = undefined; flag(c, 'cbs', 0);
  flag(c, 'cbd', 1);
  c.attackPhase = 0;
  if (c.mem.tear) delete c.mem.tear;
}
export function stagger(c: Creature, secs: number) {
  const s = st(c);
  if (s.down && s.down > G.time) return;
  s.stun = Math.max(s.stun ?? 0, G.time + secs);
  flag(c, 'cbs', 1);
  c.attackPhase = 0;
  if (c.mem.tear) delete c.mem.tear;
}

export interface HitExtra { po?: number; dn?: number; st?: number; ia?: 1 }

/** host: the combat side of a hit that the creature lived through */
export function combatHit(c: Creature, a: HitExtra, fx: number, fz: number) {
  if (c.dead || !killable(c)) return;
  const s = st(c);
  // poise recovers when it is left alone for a moment
  const idle = G.time - s.poiseT;
  if (idle > 1.6) s.poise = Math.max(0, s.poise - (idle - 1.6) * 22);
  s.poiseT = G.time;
  s.poise += a.po ?? 0;
  const size = sizeClass(c);
  const broke = s.poise >= poiseOf(c);
  // a solid hit interrupts small things mid-attack; big things finish what they started unless their poise breaks
  if ((a.ia && size <= 1) || broke) c.attackPhase = 0;
  if (a.dn && (size <= 2 || broke)) { knockDown(c, a.dn * (size === 3 ? 0.7 : 1)); s.poise = 0; }
  else if (broke) { if (size <= 1 && (a.po ?? 0) >= 30) knockDown(c, 1.8); else stagger(c, a.st ?? 2.2); s.poise = 0; }
  else if (a.st) stagger(c, a.st);
  void fx; void fz;
}

/** host, every frame before the brain: returns true while the creature is not its own (down, staggered, executed, pinning) */
export function creatureStep(c: Creature, dt: number): boolean {
  const s = c.mem.cb as CbState | undefined;
  if (!s || c.dead) return false;
  const t = G.time;
  if (s.exec) {
    if (t > s.exec.until) { s.exec = undefined; flag(c, 'cbx', 0); }
    else { c.vx *= 0.6; c.vz *= 0.6; c.speed = 0; c.attackPhase = 0; c.stagger = Math.max(c.stagger, 0.2); return true; }
  }
  if (s.pin) {
    const p = G.players.get(s.pin.pid);
    if (!p || p.body.dead || t > s.pin.until || p.zoneKey !== c.zoneKey) { s.pin = undefined; flag(c, 'cbp', 0); c.attackT = Math.max(c.attackT, c.sp.attack?.cooldown ?? 1); }
    else {
      // hold on: stay on top of them, face them, the attack pose
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1, want = c.radius + 0.32;
      c.targetFacing = c.facing = Math.atan2(dz, dx);
      c.vx = (dx / d) * (d - want) * 6; c.vz = (dz / d) * (d - want) * 6;
      c.speed = 0; c.attackPhase = 0.2;
      return true;
    }
  }
  if (s.down) {
    if (t > s.down) { s.down = undefined; flag(c, 'cbd', 0); c.stagger = 0.35; }
    else { c.vx *= Math.exp(-5 * dt); c.vz *= Math.exp(-5 * dt); c.speed = 0; c.attackPhase = 0; return true; }
  }
  if (s.stun) {
    if (t > s.stun) { s.stun = undefined; flag(c, 'cbs', 0); }
    else { c.vx *= Math.exp(-6 * dt); c.vz *= Math.exp(-6 * dt); c.speed = 0.15; c.attackPhase = 0; return true; }
  }
  return false;
}

/** host: pick parts a creature can still lose, by role ('head', 'arm', 'leg', 'jaw', 'any') */
export function pickParts(c: Creature, role: string, n = 1): string[] {
  const gd = goreOf(c.sp);
  const gone: string[] = [...(c.mem.sev || []), ...(c.mem.severed || [])];
  const ok = (x: string) => !gone.includes(x) && (!c.rig || !!c.rig.parts[x]);
  if (role === 'head') return gd.head && ok(gd.head) ? [gd.head] : [];
  const list = (gd.sever || []).filter((x) => x !== gd.head && ok(x) && (role === 'any' ? partRole(x, gd.head) !== 'other' : partRole(x, gd.head) === role));
  const out: string[] = [];
  while (out.length < n && list.length) out.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
  return out;
}

export type CbOp =
  | { t: 'sev'; id: string; role: string; n?: number; k: string; fx: number; fz: number; by: string }
  | { t: 'kill'; id: string; by: string; k: string; dmg: number; fx: number; fz: number; f?: string }
  | { t: 'exec'; id: string; by: string; dur: number; pose?: string }
  | { t: 'pose'; id: string; pose: string }
  | { t: 'free'; id: string }
  | { t: 'down'; id: string; s: number }
  | { t: 'pin'; id: string; pid: string; dur: number }
  | { t: 'qte'; id: string; pid: string; r: 'win' | 'perfect' | 'lose' }
  | { t: 'tear+'; id: string; pid: string; add: number }
  | { t: 'tearX'; id: string; pid: string; perfect?: 1 }
  | { t: 'ff'; on: 0 | 1 };

/** send a combat request (applied at once in solo / on the host, sent to the host by a client) */
export function cbOp(a: CbOp) { op('cb', a); }

defOp('cb', (a: CbOp, ctx) => {
  if (a.t === 'ff') { if (!ctx.host || ctx.local) G.sandbox.friendlyFire = a.on ? 1 : 0; return; }
  if (!ctx.host) return;
  const c: Creature | undefined = G.creatures?.creatures?.get?.(a.id);
  if (!c) return;
  hostCb(c, a);
});

function hostCb(c: Creature, a: Exclude<CbOp, { t: 'ff' }>) {
  const cs = G.creatures;
  switch (a.t) {
    case 'sev': {
      if (c.dead || !G.gore) return;
      const parts = pickParts(c, a.role, a.n ?? 1);
      if (!parts.length) return;
      const info = { dmg: 30, kind: a.k, fx: a.fx, fz: a.fz, crit: true, by: a.by };
      if (G.gore.severFatal(c, parts)) { c.hp = 0; cs.kill(c, G.getZone(c.zoneKey), a.by, { ...info, head: true }); }
      else { G.gore.creatureSevered(c, parts, info); if (c.mem.tear) delete c.mem.tear; }
      return;
    }
    case 'kill': {
      if (c.dead) return;
      const gore = G.gore;
      const lv = G.sandbox.gore ?? 2;
      let head = false;
      if (gore && a.f) {
        if (a.f === 'head') head = pickParts(c, 'head').length > 0;
        else if (lv >= 2) gore.debugForce = a.f;
        else if (a.f === 'hb') head = pickParts(c, 'head').length > 0;
      }
      const s = st(c); s.exec = undefined; s.down = undefined; s.stun = undefined;
      flag(c, 'cbx', 0); flag(c, 'cbd', 0); flag(c, 'cbs', 0);
      c.hp = 0;
      cs.kill(c, G.getZone(c.zoneKey), a.by, { dmg: a.dmg, kind: a.k, fx: a.fx, fz: a.fz, crit: true, by: a.by, head });
      if (gore) gore.debugForce = null;
      return;
    }
    case 'exec': {
      if (c.dead) return;
      const s = st(c);
      s.exec = { by: a.by, until: G.time + a.dur };
      s.pin = undefined; flag(c, 'cbp', 0);
      flag(c, 'cbx', a.pose || 'x');
      c.attackPhase = 0; c.vx = c.vz = 0;
      if (c.mem.tear) delete c.mem.tear;
      return;
    }
    case 'pose': if (!c.dead && st(c).exec) flag(c, 'cbx', a.pose || 'x'); return;
    case 'free': { const s = st(c); s.exec = undefined; flag(c, 'cbx', 0); return; }
    case 'down': if (!c.dead) knockDown(c, a.s); return;
    case 'pin': {
      if (c.dead) return;
      const s = st(c);
      s.pin = { pid: a.pid, until: G.time + a.dur };
      flag(c, 'cbp', 1);
      return;
    }
    case 'qte': {
      const s = st(c);
      s.pin = undefined; flag(c, 'cbp', 0);
      if (c.dead) return;
      const p = G.players.get(a.pid);
      if (a.r === 'lose') {
        // it gets what it wanted: a deep bite, sometimes the limb
        const at = c.sp.attack;
        if (!p || !at) return;
        const tear = G.sandbox.limbLoss && tearDef(c.sp.key) && Math.random() < 0.35 ? cs.rollTear(c, p, at.dmg[1] * 1.6, true) : null;
        if (tear) { cs.forceTear(c.id, p.id, tear.part, tear.hold * 0.6); return; }
        const hit = { dmg: at.dmg[1] * 1.6, kinds: at.kinds, corrupt: at.corrupt, height: c.height, knock: 0.9, from: [c.x, c.z] as [number, number], grab: false, parts: at.parts, by: c.sp.key };
        if (p.isLocal) G.combat?.localHurt?.(p, hit); else G.net?.sendHurt?.(p.id, hit);
        c.attackT = Math.max(c.attackT, at.cooldown);
        return;
      }
      // thrown off
      if (p) { const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || 1; c.vx = (dx / d) * 5; c.vz = (dz / d) * 5; }
      c.attackT = Math.max(c.attackT, (c.sp.attack?.cooldown ?? 1) * 1.6);
      if (a.r === 'perfect' && killable(c)) { if (sizeClass(c) <= 2) knockDown(c, 2.4); else stagger(c, 2.4); }
      else c.stagger = Math.max(c.stagger, 0.9);
      return;
    }
    case 'tear+': {
      const t = c.mem.tear as { pid: string; hold: number } | undefined;
      if (t && t.pid === a.pid) t.hold += a.add;
      return;
    }
    case 'tearX': {
      if (c.mem.tear) delete c.mem.tear;
      c.attackPhase = 0;
      const p = G.players.get(a.pid);
      if (p) { const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || 1; c.vx = (dx / d) * 4.5; c.vz = (dz / d) * 4.5; }
      c.attackT = Math.max(c.attackT, (c.sp.attack?.cooldown ?? 1) * 2);
      if (a.perfect && killable(c)) { if (sizeClass(c) <= 2) knockDown(c, 2.4); else stagger(c, 2.4); }
      else c.stagger = Math.max(c.stagger, 1.0);
      return;
    }
  }
}

// ------------------------------------------------------------------ every peer: body language
const ease = (t: number) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** a local flinch the moment our blow lands (before the host's word arrives) */
export function flinch(c: Creature, dx: number, dz: number, s: number) {
  c.hitFlash = Math.max(c.hitFlash, 0.15);
  c.mem.cbFl = { t: G.time, dx, dz, s: Math.min(1.5, s) };
}

/**
 * Layered over the species' animation and the limb-loss crawl (manager.limbVisuals):
 * knocked flat on its side, reeling when staggered, held in the execution pose, the jolt of a hit.
 */
export function creaturePose(c: Creature, dt: number) {
  const rig = c.rig; if (!rig) return;
  const root = rig.root;
  const m = nm(c);
  const v = (c.mem.cbV as { d: number; s: number; k: number; l: number; side: number } | undefined) || (c.mem.cbV = { d: 0, s: 0, k: 0, l: 0, side: Math.random() < 0.5 ? -1 : 1 });
  const x = m.cbx as string | 0 | undefined;
  v.d = damp(v.d, m.cbd || x === 'd' ? 1 : 0, 9, dt);
  v.s = damp(v.s, m.cbs || x === 's' ? 1 : 0, 7, dt);
  v.k = damp(v.k, x === 'k' ? 1 : 0, 8, dt);
  v.l = damp(v.l, x === 'l' ? 1 : 0, 6, dt);
  const fl = c.mem.cbFl as { t: number; dx: number; dz: number; s: number } | undefined;
  if (v.d < 0.002 && v.s < 0.002 && v.k < 0.002 && v.l < 0.002 && !fl) return;
  const t = G.time, h = c.height;
  root.rotation.order = 'YXZ';
  if (v.d > 0.002) {
    // flat on its side, legs still kicking
    const k = ease(v.d);
    root.rotation.z += v.side * 1.42 * k + Math.sin(t * 11) * 0.03 * k;
    root.rotation.x += 0.12 * k;
    root.position.y += Math.min(0.35, c.radius * 0.7) * k;
  }
  if (v.s > 0.002) {
    const k = ease(v.s);
    root.rotation.z += Math.sin(t * 6.3) * 0.13 * k;
    root.rotation.x += (0.2 + Math.sin(t * 4.1) * 0.07) * k;
    root.position.y -= h * 0.05 * k;
  }
  if (v.k > 0.002) {
    // dropped to its knees, head bowed
    const k = ease(v.k);
    root.rotation.x += 0.32 * k;
    root.position.y -= h * 0.24 * k;
  }
  if (v.l > 0.002) {
    // lifted on the spear, writhing
    const k = ease(v.l);
    root.position.y += 0.55 * k;
    root.rotation.x -= 0.55 * k;
    root.rotation.z += Math.sin(t * 19) * 0.08 * k;
  }
  if (fl) {
    const e = Math.max(0, 1 - (t - fl.t) / 0.28);
    if (e <= 0) delete c.mem.cbFl;
    else {
      const k = e * e * fl.s;
      const l = Math.hypot(fl.dx, fl.dz) || 1;
      root.position.x += (fl.dx / l) * 0.13 * k; root.position.z += (fl.dz / l) * 0.13 * k;
      // pitch away from the blow (in the creature's own frame)
      const fwd = (fl.dx * Math.cos(c.facing) + fl.dz * Math.sin(c.facing)) / l;
      root.rotation.x -= fwd * 0.28 * k;
      root.rotation.z += (fl.dx * Math.sin(c.facing) - fl.dz * Math.cos(c.facing)) / l * 0.2 * k;
    }
  }
}

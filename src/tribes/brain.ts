// How the people of the rooms decide what to do (round 15; the host runs it).
// Every half second or so a person looks around (perceive) and the most pressing
// goal wins:
//   1. survive    badly hurt and not brave: run for the camp, away from the threat
//   2. fight      the unit, when the tribe is at war with it, when this person or a
//                 friend who called for help wants it hurt, or a raid was sent for it.
//                 Raiders may lie in AMBUSH (crouched, still) until it comes close.
//   3. protect    guards and hunters go for inhabitants on the camp's ground; the rest
//                 back away from them toward the guards (flee)
//   4. get away   a thief with something of yours walks off (runs, if you saw)
//   5. the unit   ROB it (quick hands from behind), MUG it (walk up and demand the
//                 pack: the talk opens on it), HELP it (a kind person who likes it
//                 bandages its worst bleed), WARN it (shout when something is behind it)
//   6. routine    the clock: sleep at night on the bedrolls (a guard keeps watch),
//                 meals at the fire, and the day's work by role: the trader keeps the
//                 cloth, guards walk the barricades, the cook tends the pot, scavengers
//                 go out and come back, hunters sweep the rooms around the camp.
// Followers (recruits) have their own brain: walk with the unit, fight what threatens
// it, wait where told, carry a pack, get hungry, and leave when mistreated.
// Anyone hurt or robbed can CALL FRIENDS: every member of the tribe in earshot turns
// on the one they name.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Creature } from '../creatures/creature';
import type { Zone } from '../world/zone';
import type { Player } from '../entities/player';
import { TF } from '../world/zone';
import type { Camp } from './camp';
import { TRIBES, type TribeKey } from './defs';
import { bark, memberName, sayAs, tribeOfCreature } from './npc';
import { traitsOf, roleOf, attitude, loyaltyOf, shiftLoyalty, unitFacing, remember, type Role } from './mind';
import { op } from '../game/ops';
import { SAY, line } from './speech';
import { npcSteal, pocketNotice, stealables } from './theft';
import type { TribeSystem } from './tribes';

const HOSTILE_T = new Set(['hostile', 'stalker', 'ambush', 'territorial']);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** replicated look flags for the animation (sit, lie, kneel, sneak, act, aim) */
function net(c: Creature, v: Record<string, any>) {
  const o = c.mem.net || {};
  for (const k in v) if (o[k] !== v[k]) { c.mem.net = { ...o, ...v }; return; }
}
const STILL = { sit: 0, lie: 0, kneel: 0, sneak: 0, act: '', aim: 0 };

export function campOf(c: Creature, z: Zone): Camp | null { return ((z.meta.tribeCamps || []) as Camp[]).find((k) => k.i === c.mem.camp) || null; }

function walkable(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  return !!z.floor[i] && !z.solid[i] && !(z.flags[i] & TF.SHIFT);
}
/** a walkable point at r0..r1 metres from (x, z) */
function pointNear(z: Zone, x: number, y: number, r0: number, r1: number): [number, number] | null {
  for (let k = 0; k < 24; k++) {
    const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
    const X = Math.floor(x + Math.cos(a) * r), Y = Math.floor(y + Math.sin(a) * r);
    if (walkable(z, X, Y)) return [X + 0.5, Y + 0.5];
  }
  return null;
}
function playersHere(c: Creature): Player[] { const out: Player[] = []; for (const p of G.players.values()) if (p.zoneKey === c.zoneKey && !p.body.dead) out.push(p); return out; }

// ---------------------------------------------------------------- perception
interface Seen { foeP: Player | null; fpd: number; foeC: Creature | null; fcd: number; scare: Creature | null }
function perceive(S: TribeSystem, c: Creature, camp: Camp | null, role: Role): Seen {
  const t = c.mem.tribe as TribeKey, m = c.mem;
  const out: Seen = { foeP: null, fpd: Infinity, foeC: null, fcd: Infinity, scare: null };
  const raid = !!m.raid, war = S.hostile(t);
  const al = m.alarm && m.alarm.until > G.time ? m.alarm.pid as string : '';
  for (const p of playersHere(c)) {
    const d = dist(p, c);
    const a = raid || war || al === p.id || (d < 5 && attitude(c) <= -70);
    const range = raid ? 60 : al === p.id ? 28 : 12;
    if (a && d < range && d < out.fpd) { out.foeP = p; out.fpd = d; }
  }
  // inhabitants: fighters take on anything hostile near the camp; the rest just keep clear
  const fighter = role === 'guard' || role === 'hunter' || role === 'raider';
  const cx = camp ? camp.x : c.x, cz = camp ? camp.y : c.z;
  for (const o of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
    if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.tamedBy || o.mem.tribe || !HOSTILE_T.has(o.sp.temperament)) continue;
    const d = dist(o, c);
    if (d > 22) continue;
    const dc = Math.hypot(o.x - cx, o.z - cz);
    if (fighter && (dc < (camp ? camp.r + 9 : 10) || d < 7) && d < out.fcd) { out.foeC = o; out.fcd = d; }
    else if (!fighter && d < 7 && (!out.scare || d < dist(out.scare, c))) out.scare = o;
    // a person who is cornered fights anyway
    if (!fighter && d < 1.6 && d < out.fcd) { out.foeC = o; out.fcd = d; }
  }
  return out;
}

/** shout for the camp: every member of the tribe in earshot turns on this player */
export function alarm(c: Creature, pid: string, why: 'thief' | 'hurt' | 'attack') {
  const t = c.mem.tribe as TribeKey;
  sayAs(c, line(why === 'thief' ? SAY.callThief : why === 'hurt' ? SAY.callHurt : SAY.call));
  const until = G.time + (why === 'thief' ? 35 : 60);
  c.mem.alarm = { pid, until };
  for (const o of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
    if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.mem.tribe !== t || o.tamedBy) continue;
    if (dist(o, c) > 24) continue;
    o.mem.alarm = { pid, until };
    o.mem.net = { ...(o.mem.net || {}), ...STILL };
  }
  G.audio?.at?.('guard_bark', c.x, c.z);
}

// ---------------------------------------------------------------- the fight
function fightPlayer(c: Creature, z: Zone, p: Player, dt: number) {
  const cs = G.creatures;
  net(c, STILL);
  c.targetId = p.id; c.setState('chase');
  const d = dist(p, c), range = (c.sp.attack?.range ?? 1) + p.radius;
  if (d < range) { c.speed = 0; c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); if (c.attackT <= 0) cs.startAttack(c, p); }
  else cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, range * 0.8);
}
function fightCreature(c: Creature, z: Zone, o: Creature, dt: number) {
  const cs = G.creatures, a = c.sp.attack!;
  net(c, STILL);
  c.setState('chase');
  const d = dist(o, c), range = a.range + o.radius + 0.1;
  const ph = c.mem.pendingHit;
  if (ph && G.time >= ph.at) { c.mem.pendingHit = null; const f = G.creatures?.creatures?.get(ph.id); if (f && !f.dead && dist(f, c) < range + 0.5) cs.damage(c.id, f.id, a.dmg[0] + Math.random() * (a.dmg[1] - a.dmg[0]), c.x, c.z, 0.5, TRIBES[c.mem.tribe as TribeKey].weaponKind === 'blade' ? 'blade' : 'blunt'); }
  if (d < range) {
    c.speed = 0; c.targetFacing = Math.atan2(o.z - c.z, o.x - c.x);
    if (c.attackT <= 0) { c.attackPhase = 0.38; c.mem.attackTarget = ''; c.attackT = a.cooldown; c.mem.pendingHit = { id: o.id, at: G.time + 0.22 }; }
  } else cs.moveTo(c, z, o.x, o.z, c.sp.run, dt, range * 0.85);
}
function fleeFrom(c: Creature, z: Zone, fx: number, fz: number, camp: Camp | null, dt: number) {
  net(c, STILL);
  c.setState('flee');
  const m = c.mem;
  if (!m.fleeTo || G.time > m.fleeT) {
    // toward the camp fire if that is away from the threat, else straight away
    let goal: [number, number] | null = null;
    if (camp && Math.hypot(camp.fire[0] - fx, camp.fire[1] - fz) > Math.hypot(c.x - fx, c.z - fz)) goal = [camp.fire[0] + (Math.random() - 0.5) * 2, camp.fire[1] + (Math.random() - 0.5) * 2];
    if (!goal) { const a = Math.atan2(c.z - fz, c.x - fx); goal = pointNear(z, c.x + Math.cos(a) * 9, c.z + Math.sin(a) * 9, 0, 3); }
    m.fleeTo = goal || [c.x, c.z]; m.fleeT = G.time + 3;
    if ((m._fleeSaid ?? 0) < G.time) { m._fleeSaid = G.time + 12; sayAs(c, line(SAY.flee)); }
  }
  G.creatures.moveTo(c, z, m.fleeTo[0], m.fleeTo[1], c.sp.run, dt, 0.6);
}

// ---------------------------------------------------------------- the brain
export function tribeBrain(S: TribeSystem, c: Creature, dt: number): boolean {
  const t = c.mem.tribe as TribeKey; if (!t) return false;
  const cs = G.creatures, z: Zone = G.getZone(c.zoneKey), m = c.mem;
  if (c.tamedBy) return followerBrain(S, c, z, dt);
  // in a conversation: stand, face the unit
  if (m.talkTo) {
    const p = G.players.get(m.talkTo);
    if (p && !p.body.dead && p.zoneKey === c.zoneKey && dist(p, c) < 6) {
      c.speed = 0; c.vx = c.vz = 0; c.setState('idle');
      c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
      net(c, { sit: 0, lie: 0, kneel: 0, sneak: 0, act: '' });
      return true;
    }
    m.talkTo = null;
  }
  const raid = !!m.raid;
  if (raid && G.time > (m.raidUntil ?? 0) && !playersHere(c).some((p) => dist(p, c) < 30)) { cs.remove(c); return true; }
  const tr = traitsOf(c), role = roleOf(c), camp = campOf(c, z);
  pocketNotice(c);
  // look around now and then
  m._seeT = (m._seeT ?? 0) - dt;
  if (m._seeT <= 0 || !m._seen) { m._seeT = 0.35 + Math.random() * 0.2; m._seen = perceive(S, c, camp, role); }
  const seen = m._seen as Seen;
  if (seen.foeP && (seen.foeP.body.dead || seen.foeP.zoneKey !== c.zoneKey)) seen.foeP = null;
  if (seen.foeC && seen.foeC.dead) seen.foeC = null;
  // ---- 1. survive
  const hurt = c.hp < c.sp.hp * 0.32;
  const threat = seen.foeP || seen.foeC;
  if (hurt && threat && tr.bravery < 0.72 && !raid) { fleeFrom(c, z, threat.x, threat.z, camp, dt); return true; }
  // ---- 2. fight the unit (ambushers wait for it)
  if (seen.foeP) {
    const p = seen.foeP;
    if (m.ambush) {
      const near = dist(p, c);
      const spotted = near < 9 && unitFacing(p, c.x, c.z, 1.2);
      if (near > 5.5 && !spotted) { c.speed = 0; c.setState('hide'); net(c, { ...STILL, sneak: 1, kneel: 1 }); c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); return true; }
      m.ambush = 0; sayAs(c, line(SAY.ambush));
      for (const o of (cs.creatures.values() as Iterable<Creature>)) if (o.mem.raid && o.mem.tribe === t && o.zoneKey === c.zoneKey) o.mem.ambush = 0;
    }
    fightPlayer(c, z, p, dt);
    return true;
  }
  if (raid) {
    // raiders close in on the nearest survivor (or wait in ambush ahead of it)
    const p = playersHere(c).sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (p) { c.setState('travel'); net(c, { ...STILL, sneak: m.ambush ? 1 : 0 }); if (!m.ambush) cs.moveTo(c, z, p.x, p.z, c.sp.walk * 1.4, dt, 3); else c.speed = 0; }
    return true;
  }
  // ---- 3. protect the camp / keep clear of inhabitants
  if (seen.foeC) { fightCreature(c, z, seen.foeC, dt); return true; }
  if (seen.scare) { fleeFrom(c, z, seen.scare.x, seen.scare.z, camp, dt); return true; }
  if (c.state === 'chase' || c.state === 'attack' || c.state === 'flee') c.setState('idle');
  // ---- 4. a thief with your things walks off
  if (m.loot?.length && m.getaway && G.time < m.getaway.until) {
    net(c, { ...STILL, sneak: m.spotted ? 0 : 1 });
    c.setState('travel');
    const g = m.getaway;
    if (cs.moveTo(c, z, g.x, g.z, m.spotted ? c.sp.run : c.sp.walk * 1.1, dt, 0.8)) m.getaway = null;
    return true;
  }
  // ---- 5. goals about the unit
  if (unitGoals(S, c, z, camp, role, tr, dt)) return true;
  // ---- 6. the routine
  routine(S, c, z, camp, role, dt);
  return true;
}

// ---------------------------------------------------------------- the unit: rob, mug, help, warn
function unitGoals(S: TribeSystem, c: Creature, z: Zone, camp: Camp | null, role: Role, tr: ReturnType<typeof traitsOf>, dt: number): boolean {
  const m = c.mem, cs = G.creatures;
  const ps = playersHere(c);
  if (!ps.length) return false;
  const p = ps.sort((a, b) => dist(a, c) - dist(b, c))[0];
  const d = dist(p, c);
  const busyTalk = !!S.talk?.c;
  const h = G.clock.hourOfDay, night = h >= 22 || h < 6;
  // WARN: something hungry is behind the unit
  if (d < 18 && (m.warnT ?? 0) < G.time && (S.warnT ?? 0) < G.time && attitude(c) > -5) {
    for (const o of (cs.creatures.values() as Iterable<Creature>)) {
      if (o.dead || o.zoneKey !== c.zoneKey || o.tamedBy || o.mem.tribe || !HOSTILE_T.has(o.sp.temperament)) continue;
      const od = dist(o, p);
      if (od < 9 && od > 2 && !unitFacing(p, o.x, o.z, 1.6) && dist(o, c) < 20) {
        m.warnT = G.time + 45; S.warnT = G.time + 14;
        sayAs(c, line(SAY.warn, { c: o.displayName?.() || o.sp.name }));
        c.targetFacing = Math.atan2(o.z - c.z, o.x - c.x);
        net(c, { ...STILL, act: 'emote:point' }); m._actUntil = G.time + 1.6;
        break;
      }
    }
  }
  if ((m._actUntil ?? 0) > G.time) { c.speed = 0; return true; }
  // HELP: a kind person who likes the unit bandages its worst bleed
  const bleed = (() => { try { return p.body.bleedRate(); } catch { return 0; } })();
  if (m.helping || (bleed > 0.08 && d < 14 && tr.kindness > 0.5 && attitude(c) > 8 && (m.helpT ?? 0) < G.time && !busyTalk && !night)) {
    m.helping = 1;
    if (d > 16 || p.body.dead) { m.helping = 0; m.helpT = G.time + 60; return false; }
    if (d > 1.3) { net(c, STILL); c.setState('travel'); cs.moveTo(c, z, p.x, p.z, bleed > 0.3 ? c.sp.run : c.sp.walk * 1.5, dt, 1.1); if (!m._helpSaid) { m._helpSaid = 1; sayAs(c, line(SAY.helpBleed)); } return true; }
    c.speed = 0; c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
    net(c, { ...STILL, act: 'bandage' });
    m._helpT = (m._helpT ?? 0) + dt;
    if (m._helpT > 2.4) {
      m._helpT = 0; m.helping = 0; m._helpSaid = 0; m.helpT = G.time + 900;
      let worst: any = null;
      for (const inj of p.body.allInjuries()) if (!inj.bandage && p.body.injuryBleed(inj) > (worst ? p.body.injuryBleed(worst) : 0)) worst = inj;
      if (worst) { worst.bandage = { clean: true, soak: 0, sterile: false }; bus.emit('think', p, `${memberName(c)} wraps the ${String(worst.part).replace(/_/g, ' ')} tight. The bleeding slows.`); }
      sayAs(c, line(SAY.helpDone));
      remember(c, 'owe');
      net(c, STILL);
    }
    return true;
  }
  if (busyTalk || night) return false;
  // ROB: quick hands sneak up behind the unit
  const thief = role === 'thief' || (role === 'drifter' && tr.greed > 0.6);
  const att = attitude(c);
  if (thief) m.robT ??= G.time + 90 + Math.random() * 150; // they size you up first
  if (thief && !m.loot?.length && m.robT < G.time && att < 30 && d < 18 && stealables(p).length) {
    const facing = unitFacing(p, c.x, c.z, 1.9);
    if (facing && d < 4.5 && d > 1.2) {
      // seen coming: shrug it off and try again later
      m.robT = G.time + 90; sayAs(c, line(SAY.thiefLeave));
      const away = pointNear(z, c.x, c.z, 4, 8); if (away) m.getaway = { x: away[0], z: away[1], until: G.time + 12 };
      return false;
    }
    net(c, { ...STILL, sneak: d < 7 ? 1 : 0 });
    c.setState('stalk');
    const bx = p.x - Math.cos(p.facing) * 0.7, bz = p.z - Math.sin(p.facing) * 0.7;
    cs.moveTo(c, z, bx, bz, d < 7 ? c.sp.walk * 0.9 : c.sp.walk * 1.3, dt, 0.35);
    if (d < 1.15 && !facing) {
      const it = npcSteal(c, p);
      m.robT = G.time + 600 + Math.random() * 300;
      if (it) {
        if (!m.spotted) sayAs(c, line(SAY.thiefLeave));
        const home = camp ? [camp.x + (Math.random() - 0.5) * 3, camp.y + (Math.random() - 0.5) * 3] : pointNear(z, c.x, c.z, 12, 20);
        if (home) m.getaway = { x: home[0], z: home[1], until: G.time + 40 };
      }
    }
    return true;
  }
  // MUG: a greedy person who has no love for the unit walks up and demands the pack
  const mugger = (role === 'guard' || role === 'thief' || role === 'drifter' || role === 'hunter') && tr.greed > 0.55 && att < -15;
  if (mugger && (m.mugT ?? 0) < G.time && (S.mugT ?? 0) < G.time && d < 12 && stealables(p).length) {
    if (d > 2.2) { net(c, { ...STILL, aim: 1 }); c.setState('chase'); cs.moveTo(c, z, p.x, p.z, c.sp.walk * 1.6, dt, 1.8); return true; }
    m.mugT = G.time + 900; S.mugT = G.time + 240;
    if (!S.talk?.open?.(c, 'mug')) { m.mugT = G.time + 30; return false; }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- the routine
function routine(S: TribeSystem, c: Creature, z: Zone, camp: Camp | null, role: Role, dt: number) {
  const m = c.mem, cs = G.creatures;
  const h = G.clock.hourOfDay;
  const night = h >= 22 || h < 6, meal = (h >= 7 && h < 8) || (h >= 12.5 && h < 13.25) || (h >= 19 && h < 21);
  const post = (m.post as [number, number]) || [c.x, c.z];
  const tag = night ? (role === 'guard' && m.slot === 1 ? 'watch' : 'sleep') : meal && role !== 'guard' && role !== 'scavenger' ? 'meal' : role;
  if (m.jobTag !== tag || !m.job || G.time > m.jobT) {
    if (m.jobTag !== tag && m.jobTag === 'scavenger' && tag !== 'scavenger') sayAs(c, line(SAY.scavBack));
    m.jobTag = tag;
    m.job = pickJob(z, c, camp, tag, post);
    m.jobT = G.time + (m.job.secs ?? 10 + Math.random() * 14);
  }
  const j = m.job;
  if (cs.moveTo(c, z, j.x, j.z, j.run ? c.sp.run * 0.7 : c.sp.walk, dt, 0.35)) {
    c.setState(j.lie ? 'sleep' : 'idle');
    net(c, { sit: j.sit ?? 0, lie: j.lie ?? 0, kneel: j.kneel ?? 0, sneak: 0, act: j.act ?? '', aim: 0 });
    if (j.face) c.targetFacing = j.face;
    else if (camp && (j.sit || tag === 'meal')) c.targetFacing = Math.atan2(camp.fire[1] - c.z, camp.fire[0] - c.x);
    // a patrol walks on to the next point
    if (j.next && (m._waitT = (m._waitT ?? 0) + dt) > j.wait) { m._waitT = 0; m.job = pickJob(z, c, camp, tag, post, j.k + 1); }
    // turn to a survivor who walks up (unless asleep)
    if (!j.lie) for (const p of G.players.values()) if (p.zoneKey === c.zoneKey && dist(p, c) < 3.5) { c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); if (!j.sit) net(c, { act: '' }); }
    // ambient life at the fire, in earshot of the unit
    if ((tag === 'meal' || (tag === 'cook' && Math.random() < 0.3)) && (m._chatT ?? 0) < G.time) {
      m._chatT = G.time + 25 + Math.random() * 40;
      const p = G.local;
      if (p && p.zoneKey === c.zoneKey && dist(p, c) < 9 && Math.random() < 0.5 + traitsOf(c).chatty * 0.4) sayAs(c, Math.random() < 0.5 ? line(SAY.eat) : TRIBES[c.mem.tribe as TribeKey].lines.idle[Math.floor(Math.random() * 3) % TRIBES[c.mem.tribe as TribeKey].lines.idle.length]);
    }
  } else { c.setState('travel'); net(c, STILL); }
}

interface Job { x: number; z: number; sit?: number; lie?: number; kneel?: number; act?: string; face?: number; run?: number; secs?: number; next?: boolean; wait?: number; k?: number }
function pickJob(z: Zone, c: Creature, camp: Camp | null, tag: string, post: [number, number], k = 0): Job {
  const r = Math.random();
  const around = (cx: number, cz: number, rad: number): [number, number] => { const a = Math.random() * 6.28; return [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]; };
  if (!camp) {
    // drifters and raiders: wander the rooms
    const p = pointNear(z, c.home?.x ?? c.x, c.home?.z ?? c.z, 2, 9) || [c.x, c.z];
    return { x: p[0], z: p[1], act: r < 0.2 ? 'emote:shrug' : '', secs: 8 + r * 10 };
  }
  const fire = camp.fire;
  switch (tag) {
    case 'sleep': {
      const bed = camp.beds?.[(c.mem.slot ?? 0) % Math.max(1, camp.beds.length)] ?? post;
      return { x: bed[0], z: bed[1], lie: 1, secs: 60 };
    }
    case 'watch': case 'guard': {
      // walk the barricade line, stop at each corner and look out
      const R = camp.r + 0.2, pts: [number, number][] = camp.patrol?.length ? camp.patrol : [[camp.x - R, camp.y - R], [camp.x + R, camp.y - R], [camp.x + R, camp.y + R], [camp.x - R, camp.y + R]];
      const i = (k + (c.mem.slot ?? 0)) % pts.length, q = pts[i];
      const out = Math.atan2(q[1] - camp.y, q[0] - camp.x);
      if (tag === 'watch') return { x: q[0], z: q[1], face: out, secs: 50, act: r < 0.3 ? 'hold_light' : '' };
      if ((c.mem._watchSay ?? 0) < G.time && Math.random() < 0.15) { c.mem._watchSay = G.time + 60; if (G.local && dist(G.local, c) < 10) sayAs(c, line(SAY.guardWatch)); }
      return { x: q[0], z: q[1], face: out, next: true, wait: 4 + Math.random() * 5, k, secs: 60 };
    }
    case 'meal': {
      const [x, zz] = around(fire[0], fire[1], 1.35);
      return { x, z: zz, sit: 1, act: r < 0.6 ? 'eat' : '', secs: 20 + r * 20 };
    }
    case 'cook': {
      if (r < 0.55) { const [x, zz] = around(fire[0], fire[1], 0.95); return { x, z: zz, kneel: 1, act: 'cook', face: Math.atan2(fire[1] - zz, fire[0] - x), secs: 14 + r * 10 }; }
      if (r < 0.8 && camp.stash) return { x: camp.stash[0] - 0.8, z: camp.stash[1], kneel: 1, act: 'loot', secs: 8 };
      const [x, zz] = around(fire[0], fire[1], 1.4); return { x, z: zz, sit: 1, secs: 12 };
    }
    case 'trader':
      // behind the cloth, facing out of the camp; counting, tidying
      return { x: camp.barter[0] + 0.85, z: camp.barter[1], face: Math.PI, act: r < 0.35 ? 'craft' : r < 0.45 ? 'emote:wave' : '', secs: 16 + r * 14 };
    case 'scavenger': {
      if (c.mem._scavOut) { c.mem._scavOut = 0; return { x: (camp.stash?.[0] ?? fire[0]) - 0.8, z: camp.stash?.[1] ?? fire[1], kneel: 1, act: 'loot', secs: 9 }; }
      const q = pointNear(z, camp.x, camp.y, camp.r + 8, camp.r + 24);
      if (!q) return { x: post[0], z: post[1], secs: 10 };
      c.mem._scavOut = 1;
      if (G.local && dist(G.local, c) < 9 && Math.random() < 0.5) sayAs(c, line(SAY.scavGo));
      return { x: q[0], z: q[1], kneel: 1, act: r < 0.5 ? 'loot' : 'dig', secs: 30 + r * 20 };
    }
    case 'hunter': {
      const q = pointNear(z, camp.x, camp.y, camp.r + 4, camp.r + 16);
      return q ? { x: q[0], z: q[1], act: r < 0.3 ? 'hold_light' : '', secs: 14 + r * 12 } : { x: post[0], z: post[1], secs: 10 };
    }
    case 'thief': {
      if (r < 0.4) { const [x, zz] = around(fire[0], fire[1], 1.4); return { x, z: zz, sit: 1, secs: 15 }; }
      const q = pointNear(z, camp.x, camp.y, 2, camp.r + 7);
      return q ? { x: q[0], z: q[1], act: r < 0.6 ? 'emote:shrug' : '', secs: 10 + r * 10 } : { x: post[0], z: post[1], secs: 10 };
    }
    default: {
      if (r < 0.35) { const [x, zz] = around(fire[0], fire[1], 1.3); return { x, z: zz, sit: 1, secs: 14 }; }
      if (r < 0.55) return { x: camp.barter[0] - 0.9, z: camp.barter[1], act: Math.random() < 0.5 ? 'craft' : 'hammer', secs: 12 };
      return { x: post[0], z: post[1], secs: 12 };
    }
  }
}

// ---------------------------------------------------------------- followers
function followerBrain(S: TribeSystem, c: Creature, z: Zone, dt: number): boolean {
  const p = G.players.get(c.tamedBy!);
  const m = c.mem, cs = G.creatures;
  if (!p || p.zoneKey !== c.zoneKey) { c.speed = 0; return true; }
  if (m.talkTo) { c.speed = 0; c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); net(c, STILL); return true; }
  // hunger: fed every half a day, or loyalty wears thin
  m.fedH ??= G.clock.hours;
  if (G.clock.hours - m.fedH > 14 && (m._hungryT ?? 0) < G.clock.hours) {
    m._hungryT = G.clock.hours + 5;
    sayAs(c, line(SAY.followHungry));
    shiftLoyalty(c, -8);
  }
  // mistreated: they walk
  const loy = loyaltyOf(c);
  if (loy <= 0) { leave(S, c, p); return true; }
  if (loy < 20 && (m._warnLoyT ?? 0) < G.time) { m._warnLoyT = G.time + 120; sayAs(c, line(SAY.followWarn)); }
  // fight what threatens the unit (or hurts the follower)
  m._seeT = (m._seeT ?? 0) - dt;
  if (m._seeT <= 0) {
    m._seeT = 0.4;
    let foe: Creature | null = null, fd = 9;
    for (const o of (cs.creatures.values() as Iterable<Creature>)) {
      if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.tamedBy) continue;
      const hostileBeast = !o.mem.tribe && HOSTILE_T.has(o.sp.temperament);
      const hostileMan = !!o.mem.tribe && (o.targetId === p.id && (o.state === 'chase' || o.state === 'attack'));
      if (!hostileBeast && !hostileMan) continue;
      const d = Math.min(dist(o, p), dist(o, c));
      if (d < fd) { fd = d; foe = o; }
    }
    m.foe = foe?.id ?? null;
  }
  const foe = m.foe ? cs.creatures.get(m.foe) as Creature | undefined : undefined;
  if (foe && !foe.dead && c.hp > c.sp.hp * 0.25) { fightCreature(c, z, foe, dt); return true; }
  if (c.state === 'chase') c.setState('idle');
  if (m.stay) {
    const s = m.stayAt as [number, number] | undefined;
    if (s && !cs.moveTo(c, z, s[0], s[1], c.sp.walk, dt, 0.4)) { net(c, STILL); return true; }
    c.speed = 0; net(c, { ...STILL, sit: dist(p, c) > 8 ? 1 : 0 });
    return true;
  }
  const d = dist(p, c);
  net(c, { ...STILL, sneak: p.stance === 'sneak' || p.stance === 'crawl' ? 1 : 0 });
  if (d > 2.4) { c.setState('follow'); cs.moveTo(c, z, p.x - Math.cos(p.facing) * 1.4, p.z - Math.sin(p.facing) * 1.4, d > 6 ? c.sp.run : c.sp.walk * 1.15, dt, 1.0); }
  else { c.speed = 0; c.setState('idle'); if (Math.random() < dt * 0.3) c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x) + (Math.random() - 0.5) * 2; }
  return true;
}

/** a follower walks out (keeps what it carries) */
export function leave(S: TribeSystem, c: Creature, p: Player) {
  sayAs(c, line(SAY.followLeave));
  c.mem.stay = false;
  c.mem.left = G.time;
  op('tribeRecruit', { id: c.id, by: '' });
  bus.emit('think', p, `${memberName(c)} turns their back on me and walks off. With my things.`);
  S.bumpRep(c.mem.tribe, -4, 'one of theirs left you');
}

/** a word over the shoulder: bark a tribe line when walking past */
export function passBark(c: Creature, p: Player) {
  if (!tribeOfCreature(c) || c.mem.talkTo) return;
  const a = attitude(c);
  const m = c.mem;
  if (m.net?.lie) { if (Math.random() < 0.3) bark(c, 'idle'); return; }
  if (!m._greeted) {
    const tr = traitsOf(c);
    if (a < -25) sayAs(c, line(SAY.greetCold));
    else if (tr.chatty > 0.35) bark(c, 'greet');
    m._greeted = true;
    return;
  }
  bark(c, c.tamedBy === p.id ? 'follow' : 'idle');
}

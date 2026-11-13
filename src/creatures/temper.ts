// TEMPERAMENT — the decision layer between "it has noticed you" and "it attacks you".
// Round 15: the inhabitants are animals and people the place has changed, not
// monsters that want you dead on sight. Each species carries a Disposition (data,
// on its definition: `disposition`, or the table below for the older files):
//
//   mood       docile | skittish | territorial | predator
//   territory  metres round its home it defends (territorial) or will not tolerate you in (predator)
//   warn       seconds of threat display before it commits (rears, puffs, calls, feints)
//   calm       a calm unit (walking, not aiming, not running at it) further than this is ignored
//   hunger     predators hunt when hungry: per-minute rise, the level it hunts at, and it breaks
//              off once a few bites have fed it (sated)
//
// How it plugs in (host only, the manager calls it around every species brain):
//   temperBefore(c, z, dt)  -> true while the layer owns the creature this frame (a threat
//                              display, or letting you go and walking off): the brain is skipped
//   temperAfter(c, z, was)  -> when the brain has just decided to hunt a unit (chase / stalk /
//                              attack), the verdict: let it, warn first, or ignore and leave
//   temperPose(c, t)        -> every peer: the generic threat display layered over the
//                              species' own animation (it swells, sways and feints at you)
//
// Species that already have their own warning and restraint (or are rule-bound: the chess
// pieces, the broadcast creatures) are exempt; a species can opt out with
// `disposition: { mood: ..., self: true }` and use the helpers below inside its own brain
// (the Driller, the Partition Hermit and the Hum Possum do).
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Creature, CState } from './creature';
import type { SpeciesDef } from './species';
import type { Player } from '../entities/player';
import type { Zone } from '../world/zone';

export type Mood = 'docile' | 'skittish' | 'territorial' | 'predator';
export interface Disposition {
  mood: Mood;
  territory?: number;
  warn?: number;
  calm?: number;
  hunger?: { rate: number; hunt: number; sated?: number };
  /** the species applies this itself, inside its own brain (the generic layer leaves it alone) */
  self?: boolean;
}

/** the older species, retuned (data: written onto their definitions at first use) */
const TABLE: Record<string, Disposition> = {
  whip_rat: { mood: 'predator', territory: 5, warn: 1.4, calm: 6, hunger: { rate: 0.07, hunt: 0.5, sated: 0.15 } },
  strider: { mood: 'predator', territory: 6, warn: 1.8, calm: 11, hunger: { rate: 0.05, hunt: 0.55, sated: 0.2 } },
  lifeguard: { mood: 'territorial', territory: 6, warn: 2.2, calm: 8 },
  moon_strider: { mood: 'predator', territory: 5, warn: 1.2, calm: 9, hunger: { rate: 0.06, hunt: 0.5 } },
  hollow: { mood: 'docile' },
  gummy_bear: { mood: 'predator', self: true },
  stilt_gull: { mood: 'territorial', self: true },
};
/** rule-bound, broadcast-bound, sovereign, swarm, or already restrained by their own brain */
const EXEMPT = /^(chess_|pg_|bubble_|mulcher|queen_bee|king_in_yellow|timmy|still_life|bee_keeper|seated|moon_wisp|fungus_)/;

function fromTemperament(sp: SpeciesDef): Disposition | null {
  switch (sp.temperament) {
    case 'hostile': return { mood: 'predator', territory: 5, warn: 1.4, calm: 7, hunger: { rate: 0.06, hunt: 0.45 } };
    case 'stalker': return { mood: 'predator', territory: 4, warn: 1.8, calm: 9, hunger: { rate: 0.05, hunt: 0.5 } };
    case 'ambush': return { mood: 'territorial', territory: 4, warn: 1.2, calm: 6 };
    case 'territorial': return { mood: 'territorial', territory: 6, warn: 2.4, calm: 8 };
    case 'skittish': return { mood: 'skittish' };
    case 'hazard': return null;
    default: return { mood: 'docile' };
  }
}

/** the disposition on a species definition (filled in from the table / its temperament the first time) */
export function dispositionOf(sp: SpeciesDef): Disposition | null {
  const s = sp as SpeciesDef & { disposition?: Disposition | null };
  if (s.disposition === undefined) s.disposition = TABLE[sp.key] ?? fromTemperament(sp);
  return s.disposition ?? null;
}
const gated = (c: Creature): Disposition | null => {
  if (c.tamedBy || c.dead || c.mem.dom || EXEMPT.test(c.sp.key)) return null;
  const D = dispositionOf(c.sp);
  return D && !D.self && (D.mood === 'predator' || D.mood === 'territorial') ? D : null;
};

// ------------------------------------------------------------------ shared helpers (also for species that apply it themselves)
interface TG { mode?: 'warn' | 'leave'; pid?: string; t: number; d0: number; prevHunt?: CState; until: number; committed: boolean; warnedAt: number; prov: number; hp: number; ph?: number; feint: number; lastCall: number }
export function tgOf(c: Creature): TG {
  return (c.mem.tg ??= { t: 0, d0: 0, until: 0, committed: false, warnedAt: -99, prov: -99, hp: c.hp, feint: 0, lastCall: 0 }) as TG;
}
const HUNT = new Set<CState>(['chase', 'stalk', 'attack']);
const netw = (c: Creature): Record<string, any> => { let n = c.mem.net; if (!n || typeof n !== 'object') { n = {}; c.mem.net = n; } c.mem.netMem = n; return n; };
const hashOf = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return ((h >>> 0) % 1000) / 1000; };

/** 0..1, rises with time; predators hunt above their threshold */
export function hungerOf(c: Creature, D?: Disposition | null): number {
  if (c.mem.hunger === undefined) c.mem.hunger = 0.1 + hashOf(c.id) * 0.5;
  void D;
  return c.mem.hunger;
}
export function feed(c: Creature, amount: number) { c.mem.hunger = Math.max(0, hungerOf(c) - amount); }

/** a unit that is walking about, not running at it, not aiming at it, not swinging */
export function isCalm(p: Player, c: Creature): boolean {
  if (p.running || (p.speed ?? 0) > 2.7) return false;
  if (p.aiming) { const a = Math.atan2(c.z - p.z, c.x - p.x); let d = a - p.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (Math.abs(d) < 0.5) return false; }
  return true;
}
/** was it hurt recently (by anyone): provoked things fight */
export function provoked(c: Creature): boolean { return tgOf(c).prov > G.time; }

export type Verdict = 'attack' | 'warn' | 'ignore';
/** should this creature go for this unit, warn it off first, or leave it be? */
export function verdict(c: Creature, D: Disposition, p: Player): Verdict {
  const tg = tgOf(c);
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  const calm = isCalm(p, c);
  const warned = G.time - tg.warnedAt < 40;
  if (provoked(c)) return D.mood === 'docile' || D.mood === 'skittish' ? 'ignore' : 'attack';
  if (p.body?.downed && D.mood === 'predator' && hungerOf(c) >= (D.hunger?.hunt ?? 0.5) * 0.6) return 'attack';
  const strike = c.radius + 1.0;
  if (D.mood === 'territorial') {
    const inside = Math.hypot(p.x - c.home.x, p.z - c.home.z) < (D.territory ?? 5);
    if (!inside && d > strike + 1) return 'ignore';
    if (calm && d > (D.calm ?? 8)) return 'ignore';
    return warned ? 'attack' : 'warn';
  }
  if (D.mood === 'predator') {
    const hungry = hungerOf(c) >= (D.hunger?.hunt ?? 0.5);
    if (!hungry) {
      // fed: it lets a calm unit pass; one that walks right up to it is warned off
      if (d < Math.min(D.territory ?? 4, 4) && !calm) return warned ? 'attack' : 'warn';
      if (d < strike + 0.6) return warned ? 'attack' : 'warn';
      return 'ignore';
    }
    if (calm && d > (D.calm ?? 8)) return 'ignore';
    return warned || !(D.warn ?? 0) ? 'attack' : 'warn';
  }
  return 'ignore';
}

/** which unit a hunting brain means: its target, else the nearest one it is facing */
function huntTarget(c: Creature): Player | null {
  const t = c.targetId ? (G.players.get(c.targetId) as Player | undefined) : undefined;
  if (t && t.zoneKey === c.zoneKey && !t.body.dead) return t;
  let best: Player | null = null, bd = 14;
  for (const p of G.players.values() as IterableIterator<Player>) {
    if (p.zoneKey !== c.zoneKey || p.body.dead) continue;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d >= bd) continue;
    let a = Math.atan2(p.z - c.z, p.x - c.x) - c.facing; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
    if (Math.abs(a) < 0.7 || d < 2.5) { bd = d; best = p; }
  }
  return best;
}

// ------------------------------------------------------------------ host: around the brain
/** the hunger clock, provocation, and (when it owns the creature) the threat display or the walk away */
export function temperBefore(c: Creature, z: Zone, dt: number): boolean {
  const D = gated(c);
  if (!D) return false;
  const tg = tgOf(c);
  if (c.hp < tg.hp - 0.01) { tg.prov = G.time + 25; if (tg.mode) release(c, tg, 'fight'); }
  tg.hp = c.hp;
  if (D.hunger) c.mem.hunger = Math.min(1, hungerOf(c) + D.hunger.rate * dt / 60);
  // it fed on the unit it was after: a bite or two and a predator breaks off
  if (tg.committed && D.hunger) {
    const p = huntTarget(c);
    if (p) {
      const h = p.body.health;
      if (tg.ph !== undefined && h < tg.ph - 2 && Math.hypot(p.x - c.x, p.z - c.z) < c.radius + 2.2) feed(c, 0.3);
      tg.ph = h;
    }
    if (hungerOf(c) < (D.hunger.sated ?? 0.15) && !provoked(c)) { tg.committed = false; leave(c, tg, 8, p ?? null); }
  }
  if (!HUNT.has(c.state) && c.state !== 'warn' && tg.committed && c.stateT > 3) tg.committed = false;
  if (tg.mode === 'warn') return warnStep(c, z, D, tg, dt);
  if (tg.mode === 'leave') return leaveStep(c, z, tg, dt);
  return false;
}

/** the brain just ran: did it decide to go for a unit? */
export function temperAfter(c: Creature, z: Zone, was: CState) {
  const D = gated(c);
  if (!D) return;
  const tg = tgOf(c);
  if (!HUNT.has(c.state) || tg.committed || tg.mode) return;
  const p = huntTarget(c);
  if (!p) return;
  const v = verdict(c, D, p);
  if (v === 'attack') { tg.committed = true; tg.ph = p.body.health; return; }
  const hunt = c.state;
  c.attackPhase = 0; c.speed = 0; c.vx = 0; c.vz = 0;
  if (v === 'warn') {
    tg.mode = 'warn'; tg.pid = p.id; tg.t = 0; tg.d0 = Math.hypot(p.x - c.x, p.z - c.z); tg.prevHunt = hunt; tg.feint = 0; tg.lastCall = 0;
    c.setState('warn');
    netw(c).tw = 1;
    G.creatures?.call?.(c, 'alert');
    bus.emit('creatureWarn', c, p);
    if (p.isLocal) bus.emit('think', p, warnLine(c));
  } else {
    c.setState(HUNT.has(was) ? 'wander' : was);
    leave(c, tg, 3 + hashOf(c.id + G.time.toFixed(0)) * 4, p);
  }
  void z;
}

function warnLine(c: Creature): string {
  const D = dispositionOf(c.sp);
  const L = D?.mood === 'territorial'
    ? ['It is warning me off. This is its patch. Back away slowly.', 'Too close to whatever it is guarding. Easy. Backing off.', 'It is making itself big. It wants me gone, not dead. Yet.']
    : ['It has seen me. It is deciding. Do not run.', 'It is sizing me up. Stay calm, keep my distance.', 'That is a warning. Walk away and it might let me.'];
  return L[Math.floor(Math.random() * L.length)];
}

function warnStep(c: Creature, z: Zone, D: Disposition, tg: TG, dt: number): boolean {
  const p = tg.pid ? (G.players.get(tg.pid) as Player | undefined) : undefined;
  if (!p || p.body.dead || p.zoneKey !== c.zoneKey) { release(c, tg, 'gone'); return false; }
  tg.t += dt;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  c.speed = 0; c.vx *= 0.5; c.vz *= 0.5;
  c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
  // the display: a call every second or so, one feint half way through
  tg.lastCall -= dt;
  if (tg.lastCall <= 0) { tg.lastCall = 1.1 + Math.random() * 0.6; G.creatures?.call?.(c, 'alert'); }
  if (!tg.feint && tg.t > (D.warn ?? 1.5) * 0.5) { tg.feint = 1; netw(c).tf = ((netw(c).tf | 0) + 1) % 100; G.audio?.at?.('whoosh', c.x, c.z, 0.5); }
  const strike = c.radius + 0.9;
  const closing = tg.d0 - d;
  if (provoked(c) || d < strike || (closing > 0.8 && tg.t > 0.7) || !isCalm(p, c) && d < 3) { commit(c, tg); return false; }
  const inside = Math.hypot(p.x - c.home.x, p.z - c.home.z) < (D.territory ?? 5);
  if (d > Math.max(D.territory ?? 5, 6) + 1 || d - tg.d0 > 1.8) {
    leave(c, tg, 6, p);
    if (p.isLocal && Math.random() < 0.6) bus.emit('think', p, ['It let me go.', 'It is not following. Good. Keep walking.', 'It settles back down. I am not worth the trouble.'][Math.floor(Math.random() * 3)]);
    return true;
  }
  if (tg.t > (D.warn ?? 1.5) + 1.2) {
    const hungry = D.mood === 'predator' && hungerOf(c) >= (D.hunger?.hunt ?? 0.5);
    if (hungry || (D.mood === 'territorial' && inside && d < 3.2)) commit(c, tg);
    else leave(c, tg, 6, p);
    return !tg.committed;
  }
  return true;
}
function commit(c: Creature, tg: TG) {
  tg.mode = undefined; tg.committed = true; tg.warnedAt = G.time;
  netw(c).tw = 0;
  c.setState(tg.prevHunt ?? 'chase');
  const p = tg.pid ? (G.players.get(tg.pid) as Player | undefined) : undefined;
  tg.ph = p?.body.health;
}
function release(c: Creature, tg: TG, _why: string) {
  if (tg.mode === 'warn') netw(c).tw = 0;
  tg.mode = undefined;
  if (c.state === 'warn') c.setState('idle');
}
/** it loses interest: turns away and walks back toward home for a few seconds (the brain is off meanwhile) */
function leave(c: Creature, tg: TG, secs: number, p: Player | null) {
  netw(c).tw = 0;
  tg.mode = 'leave'; tg.until = G.time + secs; tg.t = 0;
  c.targetId = null;
  if (p) c.awareness.set(p.id, 0.4);
  const hx = c.home.x, hz = c.home.z;
  const far = Math.hypot(hx - c.x, hz - c.z) > 2;
  if (far) c.goal = { x: hx, z: hz };
  else if (p) { const a = Math.atan2(c.z - p.z, c.x - p.x); c.goal = { x: c.x + Math.cos(a) * 5, z: c.z + Math.sin(a) * 5 }; }
  else c.goal = null;
  c.setState('wander');
}
function leaveStep(c: Creature, z: Zone, tg: TG, dt: number): boolean {
  if (G.time > tg.until || provoked(c)) { tg.mode = undefined; return false; }
  const cs = G.creatures as any;
  if (c.goal && cs?.moveTo) { if (cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk * 0.8, dt, 0.8)) c.goal = null; }
  else { c.speed = 0; c.vx *= 0.6; c.vz *= 0.6; }
  return true;
}

// ------------------------------------------------------------------ every peer: the threat display over the species' own pose
/** layered after the species animates: it swells, shivers and sways at you; one quick feint */
export function temperPose(c: Creature, t: number) {
  const rig = c.rig; if (!rig) return;
  const n = c.mem.netMem || c.mem.net || {};
  const ud = rig.root.userData as Record<string, any>;
  const on = !c.dead && n.tw === 1;
  // (0.12 a frame at 60 fps, at any frame rate)
  const fdt = Math.min(0.1, Math.max(0, t - (ud.twT ?? t))); ud.twT = t;
  ud.tw = (ud.tw ?? 0) + ((on ? 1 : 0) - (ud.tw ?? 0)) * (1 - Math.exp(-7.7 * fdt));
  if (ud.tw < 0.01 && !ud.twS) return;
  const k = ud.tw;
  if (n.tf !== undefined && ud.tf !== n.tf) { ud.tf = n.tf; ud.feintT = t; }
  const ft = t - (ud.feintT ?? -9);
  const feint = ft >= 0 && ft < 0.45 ? Math.sin((ft / 0.45) * Math.PI) : 0;
  const swell = 1 + k * (0.05 + 0.03 * Math.sin(t * 8.5));
  rig.root.scale.set(swell, 1 + k * (0.08 + 0.02 * Math.sin(t * 8.5 + 1)), swell);
  ud.twS = k > 0.01;
  if (!ud.twS) rig.root.scale.set(1, 1, 1);
  const lunge = k * (0.06 * Math.sin(t * 2.6) + 0.35 * feint);
  rig.root.position.x += Math.cos(c.facing) * lunge;
  rig.root.position.z += Math.sin(c.facing) * lunge;
  rig.root.rotation.z += k * 0.03 * Math.sin(t * 27);
}

// The minds of the people in the rooms (round 15). Every tribe member is a person:
//   traits    greed, bravery, kindness, honesty, temper, chattiness: seeded from who
//             they are (the creature id), so every peer and every reload agrees
//   role      what they do for the camp: trader (keeps the cloth), guard (patrols,
//             stands watch at night), cook (the fire, the pot), scavenger (goes out
//             and comes back), hunter (clears inhabitants off the camp's ground),
//             thief (quick hands, low honesty), raider (sent after you), drifter
//   needs     hunger and sleep through the day (the routine follows the clock),
//             fear when something hungry is close
//   memory    what the unit did to THEM: helped, gave, paid, robbed, got caught with
//             a hand in their pocket, lied (found out), hit them, threatened them,
//             and what they did for the unit (it owes them). Kept in the tribe
//             state (op 'tribe' k:'mem'), so saves and co-op keep it, and every
//             one of these also counts against the whole tribe (word gets round).
// attitude() folds it all into one number (-100..100) that the brain, the talk
// and the trade read: standing with the tribe + what this person remembers +
// how they are made.
import { G } from '../game/G';
import { op } from '../game/ops';
import type { Creature } from '../creatures/creature';

export type Role = 'trader' | 'guard' | 'cook' | 'scavenger' | 'hunter' | 'thief' | 'raider' | 'drifter';
export interface Traits { greed: number; bravery: number; kindness: number; honesty: number; temper: number; chatty: number }
/** what one person remembers about the unit (counts) */
export interface Memory {
  /** the unit helped them (healed, saved, shared) */ help: number;
  /** they helped the unit (it owes them) */ owe: number;
  /** paid them / traded fair */ paid: number;
  /** gifts */ gift: number;
  /** robbed (pickpocketed and noticed, or threatened out of something) */ rob: number;
  /** caught with a hand in their pocket */ caught: number;
  /** lies found out */ lie: number;
  /** lies told and believed (not found out yet) */ told: number;
  /** hit them */ hit: number;
  /** threatened them */ fear: number;
  /** conversations */ talk: number;
  /** apologies accepted (softens the grudges) */ sorry: number;
}
export const MEM_KEYS: (keyof Memory)[] = ['help', 'owe', 'paid', 'gift', 'rob', 'caught', 'lie', 'told', 'hit', 'fear', 'talk', 'sorry'];

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export const seededRng = (seed: number) => { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

/** the person's make-up (cached on the creature) */
export function traitsOf(c: Creature): Traits {
  let t = c.mem._tr as Traits | undefined;
  if (!t) {
    const r = seededRng(hash(c.id + ':mind'));
    t = { greed: r(), bravery: r(), kindness: r(), honesty: r(), temper: r(), chatty: r() };
    // the tribe bends them a little
    const k = c.mem.tribe as string;
    if (k === 'tally') { t.honesty = 0.35 + t.honesty * 0.65; t.greed = 0.3 + t.greed * 0.6; }
    else if (k === 'wax') { t.kindness = 0.3 + t.kindness * 0.7; t.temper *= 0.6; }
    else if (k === 'turnkey') { t.bravery = 0.4 + t.bravery * 0.6; t.temper = 0.25 + t.temper * 0.75; }
    else if (k === 'cog') { t.chatty = 0.4 + t.chatty * 0.6; }
    c.mem._tr = t;
  }
  return t;
}

/** their job in camp: slot 0 keeps the cloth, slot 1 guards, 2 cooks, the rest by temperament */
export function roleOf(c: Creature): Role {
  const m = c.mem;
  if (m.role) return m.role as Role;
  let r: Role;
  if (m.raid) r = 'raider';
  else if (m.camp === undefined) r = 'drifter';
  else {
    const s = m.slot as number, t = traitsOf(c);
    r = s === 0 ? 'trader' : s === 1 ? 'guard' : s === 2 ? 'cook'
      : t.honesty < 0.3 && t.greed > 0.45 ? 'thief'
      : t.bravery > 0.62 ? 'hunter'
      : s % 2 ? 'guard' : 'scavenger';
  }
  m.role = r;
  return r;
}
export const ROLE_NAME: Record<Role, string> = { trader: 'Trader', guard: 'Guard', cook: 'Cook', scavenger: 'Scavenger', hunter: 'Hunter', thief: 'Quick Hands', raider: 'Raider', drifter: 'Drifter' };

const blankMem = (): Memory => ({ help: 0, owe: 0, paid: 0, gift: 0, rob: 0, caught: 0, lie: 0, told: 0, hit: 0, fear: 0, talk: 0, sorry: 0 });
/** what this person remembers about the unit */
export function memOf(c: Creature | string): Memory {
  const id = typeof c === 'string' ? c : c.id;
  const raw = (G.tribes?.st?.mind?.[id] || {}) as Record<string, number>;
  const m = blankMem();
  for (const k of MEM_KEYS) m[k] = raw[k] ?? 0;
  return m;
}
/** they will remember this (replicated, saved); the tribe hears of it too */
export function remember(c: Creature, key: keyof Memory, n = 1) {
  if (!n) return;
  op('tribe', { k: 'mem', id: c.id, key, n });
  const t = c.mem.tribe as string | undefined;
  if (t && key !== 'talk' && key !== 'told') G.tribes?.bump?.(`mem:${key}:${t}`, n);
}
/** how much grudge this person carries */
export function grievance(m: Memory) { return Math.max(0, m.rob * 2 + m.caught * 2.5 + m.lie * 1.5 + m.hit * 2 + m.fear * 1 - m.sorry * 1.5); }

/** -100 (wants you dead) .. 100 (would die for you) */
export function attitude(c: Creature): number {
  const t = c.mem.tribe as string;
  const tr = traitsOf(c), m = memOf(c);
  const rep = G.tribes?.rep?.(t) ?? 0;
  // the tribe's word on you (what others of them have been through with you)
  const tribeWord = (k: string) => (G.tribes?.stat?.(`mem:${k}:${t}`) ?? 0);
  let a = rep * 0.55
    + m.help * 12 + m.gift * 6 + Math.min(20, m.paid * 3) + m.sorry * 8
    - m.rob * 18 - m.caught * 22 - m.lie * 14 - m.hit * 16 - m.fear * 8
    - Math.min(18, (tribeWord('rob') + tribeWord('caught') - m.rob - m.caught) * 4)
    + (tr.kindness - 0.5) * 18 - (tr.temper - 0.5) * 10;
  if (c.tamedBy && c.tamedBy === G.local?.id) a += 25;
  return Math.max(-100, Math.min(100, Math.round(a)));
}
export function moodWord(a: number): string { return a >= 50 ? 'warm' : a >= 18 ? 'easy' : a >= -10 ? 'wary' : a >= -40 ? 'cold' : 'hostile'; }

/** follower loyalty (0..100), kept in the tribe state */
export function loyaltyOf(c: Creature): number { return G.tribes?.st?.loyal?.[c.id] ?? 60; }
export function shiftLoyalty(c: Creature, n: number) { op('tribe', { k: 'loyal', id: c.id, n }); }

/** the unit's line of sight: is it looking at this person (within ~100 degrees) */
export function unitFacing(p: { x: number; z: number; facing: number }, x: number, z: number, cone = 1.75) {
  const a = Math.atan2(z - p.z, x - p.x) - p.facing;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < cone / 2 + 0.35;
}

/** what a recruit costs at neutral standing (credit), the standing a tribe wants first, how many can walk with you */
export const RECRUIT_COST = 150, RECRUIT_REP = 30, MAX_FOLLOWERS = 2;

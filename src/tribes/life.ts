// The people's days (round 21, wave 4): every person keeps a loop of their own on top of the camp's
// clock (brain.ts routine): they get hungry and EAT, get tired and REST through the slow hours, go out to
// SCAVENGE (drifters search the rooms for real), carry what they find to the cloth and TRADE it (a
// scavenger hands the trader the day's tins, a drifter walks to a camp and haggles), and SHORE UP the
// barricade when something hungry has been near or the lights are going down. Lone drifters hole up at
// night: a wedge against the door, then sleep. They TALK: a word when they start something, and people
// near each other talk to each other (two-line exchanges) when the unit is in earshot, all through the
// subtitle strip (sayAs). Host-side, like the brain.
//   lifeTag(c, camp, role, base) -> the tag the routine runs   lifeJob(...)   lifeDone(c, tag)   chatter(c)
import { G } from '../game/G';
import type { Creature } from '../creatures/creature';
import type { Zone } from '../world/zone';
import type { Camp } from './camp';
import type { Role } from './mind';
import { traitsOf } from './mind';
import { sayAs, memberName, idHash } from './npc';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const near = (c: Creature, r: number) => { const p = G.local; return !!p && p.zoneKey === c.zoneKey && dist(p, c) < r; };

export const LIFE = {
  eat: ['Right. Food, or I start eating the carpet.', 'Tin time.', "Haven't eaten since the lights changed.", 'One tin. Just one.'],
  rest: ['Five minutes. Just five.', 'My feet are done.', 'Wake me if it gets loud.', 'Sitting down before I fall down.'],
  barricade: ['Shore it up. It was sniffing round here.', 'Nail that one again.', 'This board won\'t hold a cough.', 'Lights are going down. Doors first.'],
  tradeGive: ['Tins. Three. One dented.', 'Wire, a battery, half a candle. Chalk it.', 'Found a lighter. Works. Mostly.', 'Nothing much. The east rooms moved.'],
  tradeTake: ['Chalked. Eat first, then sleep.', 'Dented counts as half.', "That'll keep the fire going. Good.", 'Better than yesterday.'],
  drifterTrade: ['What will you give for a working torch?', 'Two tins for the rope. Final.', "I'm not here to make friends. I'm here for batteries.", "You're robbing me. Fine. Done."],
  search: ['Somebody already had this one.', 'Come on, come on...', 'Empty. Of course.', 'Ha. Still sealed.'],
  holeUp: ['Chair under the handle. Good enough.', 'Nobody in, nobody out.', 'Night. Stay put.'],
  stand: ['Stay behind me!', "It's small. I've got it.", 'Come on then!'],
  tooBig: ["That's not ours to fight. Back! Back to the fire!", 'Too big. Nobody be a hero.', 'Leave it! Get inside!'],
};

/** two-line exchanges between people near each other ({a} the first speaker's name, {b} the second's) */
const TALK: [string, string][] = [
  ['Did you hear it last night? Under the floor.', 'I heard you snoring over it.'],
  ['The east corridor was longer today.', 'Then stop walking it.'],
  ['How many tins left?', 'Enough if nobody counts.'],
  ['That debtor is still around.', "Let them. They pull the hungry ones off us."],
  ['My sister had a kitchen like this.', 'Everyone had a kitchen like this.'],
  ['Who took the good blanket?', 'Nobody. It took itself.'],
  ['Barricade held.', 'This time.'],
  ['Do you think the Institute is still out there?', 'Something is paying for these lights.'],
  ['I found a door that hums.', 'Then leave it humming.'],
  ['You look terrible.', "I slept next to you. That's why."],
  ['Water tastes of almonds again.', 'Better than tasting of nothing.'],
  ['The lights flickered three times.', 'Then we move the beds tonight.'],
];

/** hours since they last ate (seeded so a camp does not all eat at once) */
const hungry = (c: Creature) => { const m = c.mem; m.ateH ??= G.clock.hours - (idHash(c.id + ':ate') % 70) / 10; return G.clock.hours - m.ateH; };
const tiredH = (c: Creature) => { const m = c.mem; m.restH ??= G.clock.hours - (idHash(c.id + ':rest') % 100) / 10; return G.clock.hours - m.restH; };

/** something hungry was near the camp lately: the camp shores up */
export function campThreat(camp: Camp | null, zone: Zone): boolean {
  if (!camp) return false;
  const k = (zone.meta.campThreat ||= {}) as Record<number, number>;
  return (k[camp.i] ?? -1e9) > G.time - 90;
}
export function markThreat(camp: Camp | null, zone: Zone) { if (camp) ((zone.meta.campThreat ||= {}) as Record<number, number>)[camp.i] = G.time; }

/** the routine's tag after the person's own needs: eat, rest, barricade, trade, search, holeup */
export function lifeTag(c: Creature, z: Zone, camp: Camp | null, role: Role, base: string): string {
  const h = G.clock.hourOfDay, night = h >= 22 || h < 6;
  const m = c.mem;
  if (base === 'watch') return base;
  if (night) {
    if (!camp) return m._holed === Math.floor(G.clock.hours / 24) ? 'sleep' : 'holeup';
    return base;
  }
  // shore up when something was near, or at dusk (guards and hunters keep their posts)
  if (camp && role !== 'trader' && (campThreat(camp, z) || (h >= 20.5 && h < 22 && role !== 'guard')) && (m._shoreH ?? -99) < G.clock.hours - 3) return 'barricade';
  if (hungry(c) > 7 && base !== 'meal') return 'eat';
  // the slow hours: a rest after midday, or when they have been on their feet too long
  if ((h >= 14 && h < 15.5 && role !== 'guard' && role !== 'trader') || tiredH(c) > 11) return 'rest';
  // a scavenger back with something: to the cloth first
  if (camp && role === 'scavenger' && m._haul) return 'trade';
  // drifters: their day is searching, and now and then a trip to a camp's cloth
  if (!camp) {
    if (h >= 12 && h < 17 && (m._tradeD ?? -1) !== Math.floor(G.clock.hours / 24) && ((z.meta.tribeCamps || []) as Camp[]).length) return 'trade';
    return 'search';
  }
  return base;
}

interface Job { x: number; z: number; sit?: number; lie?: number; kneel?: number; act?: string; face?: number; run?: number; secs?: number; next?: boolean; wait?: number; k?: number }
type PointNear = (z: Zone, x: number, y: number, r0: number, r1: number) => [number, number] | null;

/** a job for the person's own tags (null: the routine's own) */
export function lifeJob(z: Zone, c: Creature, camp: Camp | null, tag: string, post: [number, number], pointNear: PointNear): Job | null {
  const m = c.mem, r = Math.random();
  const say = (bank: string[], rr = 10, p = 0.55) => { if (near(c, rr) && Math.random() < p + traitsOf(c).chatty * 0.35) sayAs(c, pick(bank)); };
  const home = camp ? camp.fire : (c.home ? [c.home.x, c.home.z] as [number, number] : [c.x, c.z] as [number, number]);
  switch (tag) {
    case 'eat': {
      say(LIFE.eat);
      if (camp) { const a = Math.random() * 6.28; return { x: camp.fire[0] + Math.cos(a) * 1.3, z: camp.fire[1] + Math.sin(a) * 1.3, sit: 1, act: 'eat', face: Math.atan2(-Math.sin(a), -Math.cos(a)), secs: 14 + r * 8 }; }
      const q = pointNear(z, c.x, c.z, 0, 2) || [c.x, c.z];
      return { x: q[0], z: q[1], sit: 1, act: 'eat', secs: 12 + r * 6 };
    }
    case 'rest': {
      say(LIFE.rest, 8, 0.35);
      if (camp) { const bed = camp.beds?.[(m.slot ?? 0) % Math.max(1, camp.beds?.length ?? 1)] ?? post; return { x: bed[0], z: bed[1], sit: r < 0.6 ? 1 : 0, lie: r < 0.6 ? 0 : 1, secs: 40 + r * 40 }; }
      const q = pointNear(z, c.x, c.z, 1, 4) || [c.x, c.z];
      return { x: q[0], z: q[1], sit: 1, secs: 30 + r * 30 };
    }
    case 'barricade': {
      if (!camp) return null;
      const pts = camp.patrol?.length ? camp.patrol : [[camp.x - camp.r, camp.y - camp.r] as [number, number]];
      const q = pts[(m.slot ?? 0) * 3 % pts.length];
      say(LIFE.barricade, 12, 0.6);
      return { x: q[0], z: q[1], kneel: r < 0.5 ? 1 : 0, act: 'hammer', face: Math.atan2(q[1] - camp.y, q[0] - camp.x), secs: 10 + r * 8 };
    }
    case 'trade': {
      if (camp) {
        // a scavenger at the cloth: the trader takes the haul
        const b = camp.barter;
        return { x: b[0] - 0.9, z: b[1], act: 'craft', face: 0, secs: 7 };
      }
      // a drifter walks to the nearest camp's cloth
      const camps = (z.meta.tribeCamps || []) as Camp[];
      const k = camps.slice().sort((a, b) => Math.hypot(a.x - c.x, a.y - c.z) - Math.hypot(b.x - c.x, b.y - c.z))[0];
      if (!k) return null;
      return { x: k.barter[0] - 0.9, z: k.barter[1] + 0.4, act: 'craft', face: 0, secs: 12 };
    }
    case 'search': {
      // a real search: an object a few rooms off (a cabinet, a crate, a desk), crouched over it
      let best: [number, number] | null = null, bd = Infinity;
      const ox = home[0], oz = home[1];
      let n = 0;
      for (const o of z.objects.values()) {
        if (++n > 1500) break;
        const d = Math.hypot(o.x + 0.5 - ox, o.y + 0.5 - oz);
        if (d < 3 || d > 26 || d > bd) continue;
        if (Math.random() < 0.6) continue;
        const q = pointNear(z, o.x + 0.5, o.y + 0.5, 0.8, 1.6);
        if (q) { best = q; bd = d; }
      }
      const q = best ?? pointNear(z, ox, oz, 4, 14) ?? post;
      if (Math.random() < 0.3) say(LIFE.search, 8, 0.3);
      return { x: q[0], z: q[1], kneel: 1, act: r < 0.6 ? 'loot' : 'dig', secs: 12 + r * 10 };
    }
    case 'sleep': {
      if (camp) return null;
      // a drifter sleeps where they holed up
      return { x: c.x, z: c.z, lie: 1, secs: 60 };
    }
    case 'holeup': {
      const q = pointNear(z, c.x, c.z, 0, 3) || [c.x, c.z];
      say(LIFE.holeUp, 10, 0.5);
      return { x: q[0], z: q[1], kneel: 1, act: 'hammer', secs: 9 };
    }
  }
  return null;
}

/** a tag's work was done: the needs it fills, the words that go with it */
export function lifeDone(c: Creature, tag: string, camp: Camp | null) {
  const m = c.mem;
  if (tag === 'eat' || tag === 'meal') m.ateH = G.clock.hours;
  else if (tag === 'rest' || tag === 'sleep') m.restH = G.clock.hours;
  else if (tag === 'barricade') m._shoreH = G.clock.hours;
  else if (tag === 'holeup') m._holed = Math.floor(G.clock.hours / 24);
  else if (tag === 'scavenger' && m._scavOut) m._haul = 1;
  else if (tag === 'trade') {
    if (camp) {
      m._haul = 0;
      if (near(c, 12)) {
        sayAs(c, pick(LIFE.tradeGive));
        // the trader answers
        const tr = [...(G.creatures?.creatures?.values?.() || [])].find((o: Creature) => o !== c && !o.dead && o.mem.camp === camp.i && o.mem.role === 'trader' && o.zoneKey === c.zoneKey) as Creature | undefined;
        if (tr) setTimeout(() => { if (!tr.dead) sayAs(tr, pick(LIFE.tradeTake)); }, 2600);
      }
    } else {
      m._tradeD = Math.floor(G.clock.hours / 24);
      if (near(c, 12)) sayAs(c, pick(LIFE.drifterTrade));
    }
  }
}

/** people near each other talk, when the unit can hear (one exchange per camp every so often) */
export function chatter(c: Creature, camp: Camp | null) {
  const m = c.mem;
  if ((m._talkT ?? 0) > G.time || c.speed > 0.2 || m.net?.lie) return;
  m._talkT = G.time + 20 + Math.random() * 25;
  if (!near(c, 12)) return;
  const z = G.zones.get(c.zoneKey); if (!z) return;
  const cool = (z.meta.chatT ||= {}) as Record<string, number>;
  const key = camp ? 'c' + camp.i : 'd';
  if ((cool[key] ?? 0) > G.time) return;
  let other: Creature | null = null;
  for (const o of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
    if (o === c || o.dead || !o.mem.tribe || o.tamedBy || o.zoneKey !== c.zoneKey || o.mem.net?.lie || o.mem.talkTo) continue;
    if (dist(o, c) < 4.5) { other = o; break; }
  }
  if (!other || Math.random() > 0.35 + traitsOf(c).chatty * 0.5) return;
  cool[key] = G.time + 35 + Math.random() * 40;
  const [a, b] = pick(TALK);
  const o = other;
  c.targetFacing = Math.atan2(o.z - c.z, o.x - c.x);
  o.targetFacing = Math.atan2(c.z - o.z, c.x - o.x);
  sayAs(c, a.replace('{b}', memberName(o)));
  setTimeout(() => { if (!o.dead && !c.dead) sayAs(o, b.replace('{a}', memberName(c))); }, 2400 + a.length * 25);
}

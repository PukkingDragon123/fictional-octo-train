// Quick hands, both ways (round 15).
//  - The unit picks pockets: G next to a person who is not looking (from behind,
//    asleep, busy at the fire) lifts one thing out of what they carry. The odds are
//    the unit's angle, stance and their state; a person who has caught you before
//    keeps a hand on their coat. Caught: they remember it, the tribe hears of it,
//    and they turn round and want an explanation (the talk opens on it). Not
//    caught: sometimes they notice later and remember who stood that close.
//  - Their thieves pick yours: a person with quick hands sneaks up behind the unit
//    and lifts something from the pack (never what is worn or in the hands), then
//    walks off. The unit notices at once, or a little later, and can chase them,
//    talk it back out of them, or take it off the body.
// Every person's pockets are rolled once from their tribe's table (the same table
// the body is searched from), so what you lift is what they would have dropped.
import { G } from '../game/G';
import { bus } from '../core/events';
import { Rng } from '../core/rng';
import { defLoot, rollLoot } from '../items/loot';
import { createItem } from '../items/factory';
import { itemDef, type Item } from '../items/item';
import { itemValue } from '../game/debt/values';
import { TimedAction } from '../actions/action';
import type { Player } from '../entities/player';
import type { Creature } from '../creatures/creature';
import { TRIBE_KEYS, type TribeKey } from './defs';
import { traitsOf, memOf, remember, unitFacing } from './mind';
import { SAY, line } from './speech';
import { memberName, sayAs } from './npc';

// what a member carries (also what the body is searched for)
const POCKETS: Record<TribeKey, [string, number, number?, number?][]> = {
  tally: [['coins', 6, 2, 6], ['canned_beans', 2], ['crackers', 2], ['duct_tape', 1.5], ['battery', 2], ['chalk', 2], ['almond_water', 1.5], ['bandage', 1.5], ['lighter', 1], ['wallet', 0.8]],
  wax: [['candle', 4, 1, 2], ['painkillers', 1.5], ['bandage', 2], ['coins', 2, 1, 3], ['matches', 2], ['sleeping_pills', 1], ['worry_stone', 0.8], ['crackers', 1]],
  turnkey: [['coins', 3, 1, 4], ['ration_bar', 2], ['flare', 1.5], ['painkillers', 1.5], ['bandage', 2], ['keyring', 1.5], ['cigarettes', 1.5], ['ammo_9mm', 0.6, 1, 4]],
  cog: [['wire', 3], ['electronics_scrap', 2.5], ['battery', 2.5], ['screwdriver', 1], ['glowstick', 1.5], ['coins', 2, 1, 3], ['fuse', 1], ['canned_beans', 1]],
};
for (const t of TRIBE_KEYS) defLoot('creature_tribe_' + t, [2, 4], POCKETS[t].filter(([k]) => { try { return !!itemDef(k); } catch { return false; } }), 0.05);

const rng = new Rng((Date.now() ^ 0x5eed) >>> 0);

/** what this person has on them (rolled once, then real: lift it and it is gone) */
export function pocketsOf(c: Creature): Item[] {
  if (!c.mem.pockets) {
    const r = new Rng(c.id + ':pockets');
    c.mem.pockets = rollLoot('creature_tribe_' + (c.mem.tribe || 'tally'), r).map((k) => createItem(k, r));
  }
  return c.mem.pockets as Item[];
}

/** what a thief could lift from the unit: in a bag or a pocket, not worn, not in the hands */
export function stealables(p: Player): Item[] {
  const out: Item[] = [];
  for (const it of p.allItems() as Item[]) {
    if (p.isWorn?.(it) || p.handR === it || p.handL === it || (it.inv && it.inv.items.length)) continue;
    const d = itemDef(it.key);
    if (!d || d.tags?.includes('mission') || d.tags?.includes('quest')) continue;
    out.push(it);
  }
  return out;
}

/** the odds of lifting something from this person right now (0..1) */
export function pickOdds(p: Player, c: Creature): number {
  const tr = traitsOf(c), m = memOf(c), n = c.mem.net || {};
  const behind = !unitFacing({ x: c.x, z: c.z, facing: c.facing }, p.x, p.z, 2.2);
  let k = 0.42 + (behind ? 0.28 : -0.22);
  if (n.lie) k += 0.3; else if (n.sit || n.act) k += 0.1;
  if (p.stance === 'sneak' || p.stance === 'crawl') k += 0.12;
  if (c.mem.talkTo) k -= 0.35;
  k -= tr.bravery * 0.08 + m.caught * 0.18 + (c.mem.alarm && c.mem.alarm.until > G.time ? 0.3 : 0);
  if (c.mem.role === 'thief') k -= 0.2; // takes one to know one
  return Math.max(0.05, Math.min(0.92, k));
}

class PickpocketAction extends TimedAction {
  constructor(p: Player, private c: Creature) { super(p); this.name = 'Pickpocket'; this.duration = 0.85; this.anim = 'loot'; this.showBar = false; this.face = { x: c.x, z: c.z }; }
  isValid() { const c = this.c; return !c.dead && c.zoneKey === this.p.zoneKey && Math.hypot(c.x - this.p.x, c.z - this.p.z) < 1.7; }
  perform() { resolvePick(this.p, this.c); }
}

export function startPickpocket(p: Player, c: Creature) {
  p.actions.clear();
  p.actions.add(new PickpocketAction(p, c));
}

function resolvePick(p: Player, c: Creature) {
  const pockets = pocketsOf(c);
  const odds = pickOdds(p, c);
  const S = G.tribes;
  if (Math.random() < odds) {
    if (!pockets.length) { bus.emit('think', p, 'Lint. A button. Nothing worth the risk.'); return; }
    // the best of two blind grabs
    const a = pockets[Math.floor(Math.random() * pockets.length)], b = pockets[Math.floor(Math.random() * pockets.length)];
    const it = itemValue(a) >= itemValue(b) ? a : b;
    pockets.splice(pockets.indexOf(it), 1);
    p.addItem(it);
    bus.emit('inventoryChanged', p);
    S?.bump?.('pickpocket', 1);
    G.audio?.ui?.('pickup', 0.25);
    bus.emit('think', p, `Lifted: ${it.name || itemDef(it.key).name}. They didn't feel a thing.`);
    // some notice later, and remember who stood that close
    if (Math.random() < 0.3 + traitsOf(c).bravery * 0.2) c.mem.noticeAt = { t: G.time + 25 + Math.random() * 60, pid: p.id, i: it.name || itemDef(it.key).name };
    return;
  }
  // caught
  remember(c, 'caught');
  S?.bumpRep?.(c.mem.tribe, -8, 'caught with your hand in a pocket');
  sayAs(c, line(SAY.caught));
  c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
  c.mem.net = { ...(c.mem.net || {}), sit: 0, lie: 0, act: '' };
  const tr = traitsOf(c);
  // a hot head shouts for the camp; the rest want an explanation
  if (tr.temper > 0.62 || memOf(c).caught > 1) { S?.alarm?.(c, p.id, 'thief'); return; }
  setTimeout(() => S?.talk?.open?.(c, 'caught'), 700);
}

/** host: a thief takes something from the unit; returns it (now in the thief's hands) */
export function npcSteal(c: Creature, p: Player): Item | null {
  const pool = stealables(p);
  if (!pool.length) return null;
  pool.sort((a, b) => itemValue(b) - itemValue(a));
  const it = pool[Math.floor(Math.random() * Math.min(4, pool.length))];
  p.removeItem(it);
  bus.emit('inventoryChanged', p);
  (c.mem.loot ||= []).push(it);
  G.tribes?.bump?.('robbed_by:' + c.mem.tribe, 1);
  const name = it.name || itemDef(it.key).name;
  // noticed now, or a little later
  if (Math.random() < 0.55) {
    setTimeout(() => { if (!p.body.dead) { bus.emit('subtitle', { pid: p.id, text: line(SAY.thiefNoticed, { i: name }) }); G.audio?.ui?.('click', 0.3); } }, 500);
    c.mem.spotted = 1;
  } else setTimeout(() => { if (!p.body.dead) bus.emit('think', p, line(SAY.thiefLater, { i: name, n: memberName(c) })); }, 15000 + Math.random() * 25000);
  return it;
}

/** give everything a thief took back to the unit */
export function returnLoot(c: Creature, p: Player): number {
  const l = (c.mem.loot || []) as Item[];
  for (const it of l) p.addItem(it);
  c.mem.loot = [];
  if (l.length) bus.emit('inventoryChanged', p);
  return l.length;
}

/** a later noticing (host, from the brain) */
export function pocketNotice(c: Creature) {
  const n = c.mem.noticeAt;
  if (!n || G.time < n.t) return;
  c.mem.noticeAt = null;
  const p = G.players.get(n.pid);
  remember(c, 'rob');
  if (!p || p.zoneKey !== c.zoneKey) return;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  if (d < 14) {
    sayAs(c, line(SAY.pocketNotice, { i: n.i }) + (d < 9 ? ' ...You.' : ''));
    if (d < 9 && traitsOf(c).temper > 0.5) G.tribes?.alarm?.(c, p.id, 'thief');
  }
}

/** a body: what was in the pockets, what they carried for you, what they took from you */
export function fillBody(c: Creature) {
  if (!c.inv) return;
  const extra: Item[] = [];
  if (c.mem.pockets) { c.inv.items.length = 0; extra.push(...(c.mem.pockets as Item[])); c.mem.pockets = []; }
  if (c.mem.loot) { extra.push(...(c.mem.loot as Item[])); c.mem.loot = []; }
  const pack = c.mem.pack as { items: Item[] } | undefined;
  if (pack?.items?.length) { extra.push(...pack.items); pack.items.length = 0; }
  for (const it of extra) c.inv.add(it);
}
void rng;

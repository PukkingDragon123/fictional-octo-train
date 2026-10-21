// Verbs without menus. Every thing in the world has an ordered list of verbs
// (the data the old context menus showed, built in ./world.ts plus whatever
// systems add through the 'objectMenu' / 'worldMenu' hooks). There is no list
// on screen any more:
//  - a right click does the PRIMARY verb (the first one that can be done):
//    a box opens, a chair is sat on, a door swings, an item is picked up
//  - what is in hand changes it: a bottle at a tap fills, food at a lit stove
//    cooks, fuel on a fire feeds it, planks on a door barricade it, a key
//    unlocks, any item on a friend is given, medicine on a friend treats them
//  - the rest are still there: hold the right button and turn the wheel (or
//    swipe the USE cap) to step through them one word at a time
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';
import type { PickTarget } from '../game/picking';
import { targetPos, targetName } from '../game/picking';
import { objDef } from '../world/objects';
import type { TileObject } from '../world/zone';
import { Item, itemDef, itemName } from '../items/item';
import type { Container } from '../items/container';
import { TimedAction, InstantAction } from '../actions/action';
import { queueAt, FillAction } from '../actions/basic';
import { BarricadeAction, DoorAction, WindowAction, UseObjectAction, SitAction, SleepAction } from '../actions/world';
import { queueTransfers } from '../actions/transfer';
import { itemPrimaryVerb, itemMenuOptions } from './itemMenu';

/** a target, or the survivor themself (a right click on your own body) */
export type VerbTarget = PickTarget | { kind: 'self'; point: THREE.Vector3 };
export interface Verb { label: string; run: () => void; why?: string | false; held?: boolean; /** offered, but never the right-click default */ late?: boolean }

/** MenuOption[] -> flat verbs ('Label: sub' one level down); disabled ones keep their reason */
export function flatten(opts: MenuOption[], prefix = ''): Verb[] {
  const out: Verb[] = [];
  for (const o of opts) {
    if (!o || o.label === '-') continue;
    const label = prefix ? prefix + ': ' + o.label : o.label;
    if (o.sub?.length) { out.push(...flatten(o.sub, label)); continue; }
    if (!o.action && !o.disabled) continue;
    out.push({ label, run: o.action || (() => {}), why: o.disabled ? (typeof o.disabled === 'string' ? o.disabled : 'not now') : false });
  }
  return out;
}

/** the item the survivor is holding out (primary hand, else the other) */
export function heldItem(p: Player): Item | null { return p.handR ?? p.handL ?? null; }

// ---------------------------------------------------------------- opening things
/** open a container's loot view (the iron-cube backpack when it is in, else the inventory) */
export function openLoot(p: Player, inv: Container | null | undefined, src?: any) {
  if (!inv) return;
  if (inv.locked) { bus.emit('think', p, "It's locked."); G.audio?.at?.('door_locked', p.x, p.z, 0.5); return; }
  if ((G as any).pack?.openLoot) (G as any).pack.openLoot(inv, src);
  else G.ui?.inventory?.focus?.(inv);
  if (src?.key) G.audio?.objSound?.(src.key, 'open', src.x, src.y);
}
export function openBackpack() {
  if ((G as any).pack?.toggle) (G as any).pack.toggle(true);
  else G.ui?.inventory?.toggle?.(true);
}
/** search a container (a short reach in, then the loot view) */
export class LootAction extends TimedAction {
  constructor(p: Player, public inv: Container | null | undefined, public src?: any) { super(p); this.name = 'Search'; this.duration = 0.5; this.anim = 'loot'; this.showBar = false; }
  perform() { openLoot(this.p, this.inv, this.src); }
}

// ---------------------------------------------------------------- the verb lists
/** every verb for a target, the one a right click does first */
export function verbsFor(p: Player, t: VerbTarget | null): Verb[] {
  if (!t) return [];
  const out: Verb[] = [];
  const it = heldItem(p);
  const held = it ? heldVerbs(p, t, it) : [];
  out.push(...held.filter((v) => !v.late));
  if (t.kind === 'self') out.push(...selfVerbs(p, it));
  else {
    let base: Verb[] = [];
    try { base = flatten(G.interact?.menu?.(p, t)?.opts || []); } catch (e) { console.warn('verbs', e); }
    // corpses: searching comes first, scanning is the watch's business
    if (t.kind === 'creature') {
      const c: any = t.c;
      base = base.filter((v) => !/^Scan with/.test(v.label));
      if (c.dead) base = base.map((v) => v.label === 'Search' ? { ...v, run: () => queueAt(p, c.x, c.z, new LootAction(p, c.inv, c), 1.4, false) } : v);
    }
    // housekeeping verbs are offered, never the right-click default (grabbing replaced picking furniture up)
    const LATE = /^(Rotate|Pick up|Disassemble|Walk here)$/;
    out.push(...base.map((v) => (t.kind !== 'tile' && LATE.test(v.label) ? { ...v, late: true } : v)));
  }
  out.push(...held.filter((v) => v.late));
  out.sort((a, b) => (a.late ? 1 : 0) - (b.late ? 1 : 0));
  // same label twice (a held verb and the plain one): keep the first
  const seen = new Set<string>();
  return out.filter((v) => (seen.has(v.label) ? false : (seen.add(v.label), true)));
}

/** what a right click does: the first verb that can be done now */
export function primaryVerb(p: Player, t: VerbTarget | null): Verb | null {
  return verbsFor(p, t).find((v) => !v.why && !v.late) ?? null;
}

/** a short word for the hint / USE cap */
export function verbWord(v: Verb | null): string {
  if (!v) return '';
  return v.label.replace(/\s*\(.*\)$/, '').replace(/^(Search) .*/, '$1').replace(/^Pick up .*/, 'Pick up');
}

/** the survivor themself: the backpack, the floor, what is in hand */
function selfVerbs(p: Player, it: Item | null): Verb[] {
  const out: Verb[] = [{ label: 'Backpack', run: () => openBackpack() }];
  if (p.sittingOn !== -1 && p.sittingOn !== undefined && p.actions.current?.name === 'Sit') out.push({ label: 'Stand up', run: () => p.actions.clear() });
  out.push({ label: 'Sit on the floor', run: () => { p.actions.clear(); p.actions.add(new SitAction(p, null)); } });
  out.push({ label: 'Sleep on the floor', why: p.body.fatigue < 30 ? 'not tired' : false, run: () => { p.actions.clear(); p.actions.add(new SleepAction(p, null, 0.15)); } });
  if (it) for (const v of flatten(itemMenuOptions(p, it, p.containerOf(it) || p.inv, [it]))) if (!/^(Drop|Move to|Inspect)/.test(v.label)) out.push(v);
  // what the floor here offers (dig, forage, build...)
  try { for (const v of flatten(G.interact?.tileOptions?.(p, p.tileX(), p.tileY()) || [])) if (!/^(Walk here|Sit on|Sleep on)/.test(v.label)) out.push(v); } catch { /* no floor */ }
  return out;
}

/** what the thing in hand does to the target (these come before the target's own verbs) */
function heldVerbs(p: Player, t: VerbTarget, it: Item): Verb[] {
  const d = itemDef(it.key);
  const out: Verb[] = [];
  const name = itemName(it);
  const tags = d.tags || [];
  const vessel = !!d.fluidCap && (it.fluid?.amount ?? 0) < (d.fluidCap ?? 0) - 0.01;
  switch (t.kind) {
    case 'self': {
      const v = itemPrimaryVerb(p, it);
      if (v) out.push({ ...v, held: true });
      break;
    }
    case 'object': {
      const o = t.obj, od = objDef(o.key); if (!od) break;
      const pos = targetPos(t);
      const at = (a: TimedAction, reach = 1.5) => () => queueAt(p, pos.x, pos.z, a, reach);
      if (od.water && vessel) {
        const src = G.interact?.waterOf?.(G.getZone(p.zoneKey), o);
        if (src) out.push({ label: 'Fill ' + name, held: true, run: at(new FillAction(p, it, src.fluid, src.available, src.take)) });
      }
      if (od.heat) {
        const fire = od.heat === 'fire' || od.heat === 'grill';
        if (fire && d.burn) out.push({ label: 'Add ' + name + ' to the fire', held: true, late: !!d.weapon, run: at(new UseObjectAction(p, 'Add fuel', 1.5, 'craft', () => { p.removeItem(it); G.interact?.addFuel?.(p, o, it); bus.emit('inventoryChanged', p); })) });
        if (fire && !o.state.lit && (tags.includes('firestarter') || tags.includes('lighter') || tags.includes('matches'))) {
          const fuel = p.findItem((i, dd) => !!dd.burn);
          out.push({ label: 'Light the fire', held: true, why: !fuel && !(o.state.fuel > 0) ? 'needs fuel' : false, run: at(new UseObjectAction(p, 'Light fire', 4, 'craft', () => G.items?.lightFire?.(p, o, it, fuel))) });
        }
        const hot = fire ? !!o.state.lit : !!o.state.on && G.interact?.objPowered?.(o);
        if (d.food?.cookable && !((it.cooked ?? 0) >= 1)) out.push({ label: 'Cook ' + name, held: true, why: !hot ? (fire ? 'light it first' : 'turn it on first') : false, run: () => ((G as any).cook?.cookOn ? (G as any).cook.cookOn(p, it, o) : G.interact?.cook?.(p, it, { o, kind: od.heat })) });
      }
      if (o.inv) {
        const keyId = o.state.keyId as string | undefined;
        if (o.inv.locked && keyId && it.data?.keyId === keyId) {
          out.push({ label: 'Unlock with ' + name, held: true, run: at(new UseObjectAction(p, 'Unlock', 1.5, 'craft', () => { G.audio?.at?.('lock', pos.x, pos.z, 0.6); G.interact?.unlockObj?.(p, o); })) });
        } else if (!o.inv.locked && !p.isWorn(it) && !(od.tags || []).includes('hopper')) {
          out.push({ label: 'Put ' + name + ' in', held: true, late: true, run: at(new InstantAction(p, () => { const c = p.containerOf(it); if (c) queueTransfers(p, [it], c, o.inv!); }, 'Put in')) });
        }
      }
      break;
    }
    case 'edge': {
      const e = t.edge, x = t.x, y = t.y, side = t.side;
      const pos = targetPos(t);
      const at = (a: TimedAction) => () => queueAt(p, pos.x, pos.z, a, 1.4);
      const hammer = !!p.findTool('#hammer');
      if (e.kind !== 'arch' && e.barricade < 4 && it.key === 'plank') out.push({ label: 'Barricade (plank)', held: true, why: !hammer ? 'needs a hammer' : !p.findTool('#nails') ? 'needs nails' : false, run: at(new BarricadeAction(p, x, y, side)) });
      if (e.kind !== 'arch' && e.barricade < 5 && it.key === 'sheet_metal') out.push({ label: 'Barricade (metal sheet)', held: true, why: !hammer ? 'needs a hammer' : !p.findTool('#screws') ? 'needs screws' : false, run: at(new BarricadeAction(p, x, y, side, true)) });
      if ((e.kind === 'door' || e.kind === 'gate') && e.locked && (it.key === 'keyring' || (e.keyId && it.data?.keyId === e.keyId))) out.push({ label: 'Unlock', held: true, run: at(new DoorAction(p, x, y, side, 'unlock')) });
      if (e.kind === 'window' && (!e.curtains || e.curtains === 'none') && (tags.includes('sheet') || it.key === 'bedsheet')) out.push({ label: 'Hang ' + name + ' as a curtain', held: true, run: at(new WindowAction(p, x, y, side, 'addCurtains')) });
      break;
    }
    case 'player': {
      const q = t.p;
      if (d.medical && G.hudBody?.treat) out.push({ label: 'Treat ' + q.name, held: true, run: () => G.hudBody.treat(p, it, q) });
      else if (d.medical) {
        const subs = flatten(itemMenuOptions(p, it, p.containerOf(it) || p.inv, [it])).filter((v) => v.label.includes(q.name + ' — ') && !v.why);
        if (subs[0]) out.push({ ...subs[0], held: true });
      }
      if (!p.isWorn(it)) out.push({ label: 'Give ' + name, held: true, late: true, run: () => queueAt(p, q.x, q.z, new UseObjectAction(p, 'Give', 1, 'hold_item', () => G.net?.giveItem?.(q.id, it)), 1.4, false) });
      break;
    }
    case 'creature': {
      const c: any = t.c;
      if (!c.dead && c.sp?.tame && !c.tamedBy && c.sp.tame.food.includes(it.key)) out.push({ label: 'Offer ' + name, held: true, run: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Offer food', 2, 'pickup', () => G.creatures?.feed?.(p, c, it)), 1.6, false) });
      break;
    }
    case 'tile': {
      if (d.seed) out.push({ label: 'Plant ' + name, held: true, run: () => G.interact?.plantMode?.(p, it) });
      break;
    }
  }
  return out;
}

/** a readable name for whatever a verb target is */
export function verbTargetName(t: VerbTarget | null): string {
  if (!t) return '';
  if (t.kind === 'self') return 'You';
  return targetName(t);
}

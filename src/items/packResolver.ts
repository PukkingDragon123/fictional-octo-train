import type { Player } from '../entities/player';
import { Container } from './container';
import { Item, itemDef, itemName } from './item';
import { G } from '../game/G';
import { bus } from '../core/events';
import { Placement, gridSpec, occupancy, findSpot, claim, setPlace, footprintOf, weightOk, isEquipped } from './grid';
import { transferItem } from '../game/worldOps';
import { floorContainer } from './worldItems';

/**
 * Keeps the local survivor's pack honest. Anything that lands in a pocket or
 * bag without a valid cell (a pickup, a crafting result, a gift, a pocket
 * that vanished with the jacket you took off) is fitted: first into the
 * container it is in, then any other pocket or bag, then a free hand. What is
 * left after a short grace (so scripted "give then wear" sequences can finish)
 * falls to the floor, and the survivor says so.
 */

/** containers the survivor carries, in the order loose things are packed into them */
export function carriedOrder(p: Player, it?: Item): Container[] {
  const bags: Container[] = [];
  const back = p.worn.get('back' as any), belt = p.worn.get('belt' as any);
  if (back?.inv) bags.push(back.inv);
  for (const h of [p.handR, p.handL]) if (h?.inv && !bags.includes(h.inv)) bags.push(h.inv);
  if (belt?.inv && !bags.includes(belt.inv)) bags.push(belt.inv);
  for (const c of p.containers()) if (c !== p.inv && !bags.includes(c)) bags.push(c);
  let small = false;
  if (it) { const [w, h] = footprintOf(it); small = w * h <= 1; }
  const out = small ? [p.inv, ...bags] : [...bags, p.inv];
  // a bag never goes inside itself
  return it?.inv ? out.filter((c) => c !== it.inv) : out;
}

/** the best carried container and cell for an item (null = nowhere) */
export function bestDest(p: Player, it: Item, exclude?: Container | null, count = 1): { c: Container; at: Placement } | null {
  for (const c of carriedOrder(p, it)) {
    if (c === exclude) continue;
    const spec = gridSpec(c);
    if (!spec || !weightOk(c, it)) continue;
    const occ = occupancy(c.items, spec, new Set([it]));
    const at = findSpot(occ, it, count);
    if (at) return { c, at };
  }
  return null;
}

const pending = new Map<number, number>();
const GRACE_MS = 1600;

/** fit everything the local survivor carries; returns true if anything moved */
export function settlePack(p: Player): boolean {
  if (!p || p.body?.dead) return false;
  let changed = false;
  const now = performance.now();
  // worn and held things live on the body (the main container), not inside a bag
  for (const c of p.containers()) {
    if (c === p.inv) continue;
    for (const it of [...c.items]) if (isEquipped(it) && !it.inv) { c.remove(it); p.inv.items.push(it); it.parent = p.inv.uid; changed = true; }
  }
  const seen = new Set<number>();
  for (const c of p.containers()) {
    const spec = gridSpec(c);
    if (!spec) continue;
    const occ = occupancy(c.items, spec);
    for (const it of occ.bad) {
      seen.add(it.uid);
      const at = findSpot(occ, it);
      if (at) { setPlace(it, at); claim(occ, it, at); changed = true; pending.delete(it.uid); continue; }
      const b = bestDest(p, it, c);
      if (b) {
        c.remove(it); setPlace(it, b.at); b.c.items.push(it); it.parent = b.c.uid;
        changed = true; pending.delete(it.uid);
        continue;
      }
      const t0 = pending.get(it.uid);
      if (t0 === undefined) { pending.set(it.uid, now); continue; }
      if (now - t0 < GRACE_MS) continue;
      pending.delete(it.uid);
      overflow(p, it, c);
      changed = true;
    }
  }
  for (const k of pending.keys()) if (!seen.has(k)) pending.delete(k);
  if (changed) bus.emit('inventoryChanged', p);
  return changed;
}

/** no cell anywhere: carry it in a free hand, or let it fall */
function overflow(p: Player, it: Item, c: Container) {
  const d = itemDef(it.key);
  const [w, h] = footprintOf(it);
  const hands = p.body?.limbs?.()?.hands ?? 2;
  const twoH = !!(d.weapon?.twoHanded || d.heavy);
  const freeR = !p.handR, freeL = !p.handL;
  if (hands > 0 && w * h <= 12 && ((twoH && freeR && freeL) || (!twoH && (freeR || freeL)))) {
    setPlace(it, null);
    if (c !== p.inv) { c.remove(it); p.inv.items.push(it); it.parent = p.inv.uid; }
    p.equip(it, freeR ? 'R' : 'L');
    if (p.handR === it || p.handL === it) {
      bus.emit('think', p, `No room for the ${itemName(it).toLowerCase()}. I'll carry it.`);
      bus.emit('gridOverflow', it, 'hand');
      return;
    }
  }
  bus.emit('think', p, `No room for the ${itemName(it).toLowerCase()}. It falls.`);
  bus.emit('gridOverflow', it, 'floor');
  G.audio?.itemSound?.(it.key, 'drop', p);
  try { transferItem(p, it, c, floorContainer(G.getZone(p.zoneKey), p.x, p.z)); }
  catch (e) { console.warn('overflow drop', e); }
}

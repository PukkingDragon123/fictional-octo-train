import { Item, itemDef } from './item';
import { Container } from './container';
import { uid, Rng } from '../core/rng';
import { rollLoot } from './loot';

/** Create a fresh item instance with sensible randomised state. */
export function createItem(key: string, rng?: Rng, opts: { pristine?: boolean } = {}): Item {
  const d = itemDef(key);
  const r = rng || new Rng(Math.floor(Math.random() * 1e9));
  const it: Item = { uid: uid(), key, cond: 1, age: 0 };
  if (!opts.pristine) {
    if (d.durability || d.weapon || d.clothing) it.cond = Math.max(0.15, Math.min(1, (d.spawnCond ?? 0.45) + r.next() * (1 - (d.spawnCond ?? 0.45))));
    if (d.food?.fresh !== undefined) it.age = r.next() * d.food.fresh * 24 * 0.85;
    if (d.uses !== undefined) it.uses = 0.25 + r.next() * 0.75;
    if (d.battery || d.light) it.uses = 0.2 + r.next() * 0.8;
  } else {
    if (d.uses !== undefined || d.battery || d.light) it.uses = 1;
  }
  if (d.fluidCap) {
    if (d.startFluid) it.fluid = { type: d.startFluid[0], amount: Math.min(d.fluidCap, d.startFluid[1]) };
    else it.fluid = null;
  }
  if (d.bag) {
    const c = new Container(uid(), d.name, 'bag', d.bag.capacity);
    c.reduction = d.bag.reduction;
    c.owner = 'item:' + it.uid;
    it.inv = c;
  }
  if (d.weapon?.mag) it.ammo = r.chance(0.5) ? r.int(0, d.weapon.mag) : 0;
  return it;
}

/** Fill a container from its loot table (first time it is opened). */
export function fillLoot(c: Container, seed: number, mult = 1) {
  if (c.lootDone) return;
  c.lootDone = true;
  if (!c.loot) return;
  const rng = new Rng(seed ^ (c.uid * 2654435761));
  for (const key of rollLoot(c.loot, rng, mult)) {
    const it = createItem(key, rng);
    if (c.contentWeight() + (itemDef(key).weight) > c.capacity * 1.2) break;
    c.add(it);
  }
}

/** Deep copy of an item (for network transfer / save) */
export function serializeItem(it: Item): any {
  const o: any = { ...it };
  if (it.inv) o.inv = serializeContainer(it.inv);
  delete o.parent;
  return o;
}
export function deserializeItem(o: any): Item {
  const it: Item = { ...o };
  if (o.inv) it.inv = deserializeContainer(o.inv);
  return it;
}
export function serializeContainer(c: Container): any {
  return { uid: c.uid, name: c.name, kind: c.kind, capacity: c.capacity, reduction: c.reduction, loot: c.loot, lootDone: c.lootDone, locked: c.locked, owner: c.owner, cooling: c.cooling, heating: c.heating, items: c.items.map(serializeItem) };
}
export function deserializeContainer(o: any): Container {
  const c = new Container(o.uid, o.name, o.kind, o.capacity);
  c.reduction = o.reduction || 0; c.loot = o.loot; c.lootDone = !!o.lootDone; c.locked = !!o.locked; c.owner = o.owner || '';
  c.cooling = o.cooling; c.heating = o.heating;
  for (const io of o.items || []) c.add(deserializeItem(io));
  return c;
}

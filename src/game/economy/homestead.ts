// THE HOMESTEAD in a run: wild forage spots in the levels, the backrooms crops
// in planters and fungus beds (src/build/farm.ts grows them), and livestock:
// docile inhabitants tamed by hand (the creature's "Offer food", data in
// registry.ts LIVESTOCK), led into a Livestock Pen (a build piece) where they
// wander the straw, eat from the trough and leave produce to collect.
//   forage_*   objects placed after generation (deterministic, in the zone's uid range);
//              state.at = in-game hour last picked; they grow back in REGROW hours
//   bld_pen    state.feed 0..100, state.store {item: n}; penned creatures carry mem.pen = pen uid
// The creature manager hands a penned creature's step to penStep() (one hook in src/creatures/manager.ts).
import { G } from '../G';
import { bus } from '../../core/events';
import { op } from '../ops';
import { Rng } from '../../core/rng';
import { onZoneGenerated } from '../../world/worldGraph';
import { ZoneBuilder } from '../../world/gen/builder';
import { objDef } from '../../world/objects';
import { floorDef } from '../../world/defs';
import { TF, type Zone, type TileObject } from '../../world/zone';
import { CROPS } from '../../items/worldSystems';
import { createItem } from '../../items/factory';
import { itemDef, hasItemDef, itemName, type Item } from '../../items/item';
import { species as getSpecies } from '../../creatures/registry';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { hasUnlock } from '../research';
import type { Player } from '../../entities/player';
import type { MenuOption } from '../../ui/ui';
import { PLANTS, LIVESTOCK, livestockOf } from './registry';

export const REGROW = 36;
const FORAGE: Record<string, { plant: string; extra?: [string, number] }> = {
  forage_moss: { plant: 'lamp_moss', extra: ['seeds_lamp_moss', 0.35] },
  forage_thistle: { plant: 'almond_thistle', extra: ['seeds_thistle', 0.3] },
  forage_ear: { plant: 'wallpaper_ear', extra: ['spawn_ear', 0.2] },
  forage_morel: { plant: 'carpet_morel', extra: ['spawn_morel', 0.15] },
  forage_truffle: { plant: 'ceiling_truffle' },
};
export const isForage = (k: string) => k in FORAGE;
const SKIP = new Set(['reality', 'exit', 'gallery']);

// ------------------------------------------------------------------ crops and taming (data into the engine)
let wired = false;
export function wireHomestead() {
  for (const p of PLANTS) if (!CROPS[p.crop]) CROPS[p.crop] = { name: p.name, days: p.days, yield: p.yield, item: p.item, color: p.color, dark: p.dark, look: p.look };
  for (const l of LIVESTOCK) {
    const sp = getSpecies(l.species) as any;
    if (sp && !sp.tame) sp.tame = { food: l.food, feeds: l.feeds };
  }
  if (wired) return;
  wired = true;
  onZoneGenerated(placeForage);
  bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => {
    try {
      if (o.key === 'bld_pen') out.unshift(...penMenu(p, o));
      else if (isForage(o.key)) out.unshift(...forageMenu(p, o));
    } catch (e) { console.warn('homestead menu', e); }
  });
}

// ------------------------------------------------------------------ forage spots
function freeFloor(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i] || (z.flags[i] & (TF.SHIFT | TF.STAIRS | TF.NOSPAWN | TF.NOBUILD))) return false;
  const f = floorDef(z.floor[i]);
  if (f?.water) return false;
  for (const o of z.objectsAt(x, y)) if (!objDef(o.key)?.ceiling) return false;
  return true;
}
/** a few wild patches per level, against walls and in corners, chosen by kind */
export function placeForage(z: Zone, seed: number) {
  if (SKIP.has(z.key) || z.key.startsWith('intro') || z.meta.noForage) return;
  if ([...z.objects.values()].some((o) => isForage(o.key))) return;
  const rng = new Rng(seed ^ 0xf0a6e);
  const b = new ZoneBuilder(z, rng);
  const want = Math.max(2, Math.min(7, Math.round((z.W * z.H) / 1400)));
  const kinds: [string, number][] = [['forage_moss', 3], ['forage_ear', 3], ['forage_morel', 2], ['forage_thistle', 2], ['forage_truffle', 0.8]];
  let placed = 0;
  for (let tries = 0; tries < want * 60 && placed < want; tries++) {
    const x = rng.int(1, z.W - 2), y = rng.int(1, z.H - 2);
    if (!freeFloor(z, x, y)) continue;
    // against a wall: moss and ears grow where the damp collects
    const wallish = z.wallN[z.idx(x, y)] || z.wallW[z.idx(x, y)] || (z.inb(x + 1, y) && z.wallW[z.idx(x + 1, y)]) || (z.inb(x, y + 1) && z.wallN[z.idx(x, y + 1)]);
    if (!wallish && rng.next() < 0.75) continue;
    let near = false;
    for (const o of z.objects.values()) if (isForage(o.key) && Math.abs(o.x - x) + Math.abs(o.y - y) < 12) { near = true; break; }
    if (near) continue;
    const key = rng.weighted(kinds);
    if (b.obj(key, x, y, rng.int(0, 3) as 0 | 1 | 2 | 3, {})) placed++;
  }
}
const ready = (o: TileObject) => o.state.at === undefined || G.clock.hours - o.state.at >= REGROW;
function forageMenu(p: Player, o: TileObject): MenuOption[] {
  const f = FORAGE[o.key];
  const pl = PLANTS.find((q) => q.crop === f.plant);
  const name = pl?.name ?? 'plants';
  if (!ready(o)) {
    const h = Math.max(1, Math.ceil(REGROW - (G.clock.hours - (o.state.at ?? 0))));
    return [{ label: `${name}: picked clean (back in ~${h} h)`, disabled: true }];
  }
  return [{
    label: `Pick the ${name.toLowerCase()}`,
    action: () => queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, 'Forage', 2.6, 'loot', () => {
      if (!ready(o) || !pl) return;
      const n = pl.yield[0] + Math.floor(Math.random() * (pl.yield[1] - pl.yield[0] + 1));
      const got: Item[] = [];
      for (let i = 0; i < n; i++) if (hasItemDef(pl.item)) got.push(createItem(pl.item));
      if (f.extra && Math.random() < f.extra[1] && hasItemDef(f.extra[0])) got.push(createItem(f.extra[0]));
      for (const it of got) p.inv.add(it);
      op('objState', { z: p.zoneKey, uid: o.uid, patch: { at: G.clock.hours } });
      bus.emit('inventoryChanged', p);
      G.audio?.at?.('rummage', o.x + 0.5, o.y + 0.5, 0.6);
      p.body.addXp?.('farming', 4);
      bus.emit('think', p, got.length ? `${got.length} × ${itemName(got[0])}${got.length > n ? ' and something to sow' : ''}.` : 'Nothing worth taking.');
    }), 1.3),
  }];
}

// ------------------------------------------------------------------ the livestock pen
const penSize = (o: TileObject): [number, number] => (o.rot % 2 === 0 ? [3, 2] : [2, 3]);
function penned(z: Zone, o: TileObject): any[] {
  const out: any[] = [];
  const cr = G.creatures?.creatures as Map<string, any> | undefined;
  if (cr) for (const c of cr.values()) if (!c.dead && c.zoneKey === z.key && c.mem?.pen === o.uid) out.push(c);
  return out;
}
const storeCount = (o: TileObject) => Object.values((o.state.store || {}) as Record<string, number>).reduce((s, n) => s + n, 0);
function penFoods(z: Zone, o: TileObject): string[] {
  const a = penned(z, o);
  const set = new Set<string>(['feed_mash', 'biomass']);
  for (const c of a) for (const k of livestockOf(c.sp.key)?.food ?? []) set.add(k);
  return [...set];
}
function penMenu(p: Player, o: TileObject): MenuOption[] {
  const z = G.getZone(p.zoneKey);
  const out: MenuOption[] = [];
  const at = (name: string, secs: number, fn: () => void) => () => { const [w, d] = penSize(o); queueAt(p, o.x + w / 2, o.y + d / 2, new UseObjectAction(p, name, secs, 'loot', fn), 2.2); };
  const herd = penned(z, o);
  const n = storeCount(o);
  const feed = Math.round(o.state.feed ?? 0);
  // collect what they made
  if (n > 0) out.push({ label: `Collect from the straw (${n})`, action: at('Collect', 1.8, () => collect(p, o)) });
  // fill the trough
  const foods = penFoods(z, o);
  const food = p.allItems().find((it) => foods.includes(it.key) && !p.isWorn(it));
  if (feed < 90) out.push({ label: food ? `Fill the trough (${itemName(food)})` : 'Fill the trough', disabled: food ? false : 'needs feed mash, biomass or what they eat', action: at('Feed', 1.6, () => fillTrough(p, o)) });
  // lead tamed followers in
  const cr = G.creatures?.creatures as Map<string, any> | undefined;
  if (cr) for (const c of cr.values()) {
    if (c.dead || c.zoneKey !== z.key || c.tamedBy !== p.id || c.mem?.pen) continue;
    if (Math.hypot(c.x - p.x, c.z - p.z) > 12) continue;
    out.push({ label: `Lead the ${c.sp.name.toLowerCase()} in`, action: () => { c.mem.pen = o.uid; c.mem.stay = false; c.mem.persistent = true; c.home = { x: o.x + 1, z: o.y + 1 }; bus.emit('think', p, `In you go. ${livestockOf(c.sp.key) ? 'Earn your keep.' : 'Stay.'}`); } });
  }
  for (const c of herd) out.push({ label: `Let the ${c.sp.name.toLowerCase()} out`, action: () => { c.mem.pen = null; } });
  // the plate on the gate: what is in here and how they are
  const who = herd.length ? herd.map((c) => c.sp.name).join(', ') : 'empty';
  out.push({ label: `Pen: ${who} · trough ${feed}%${herd.length && feed <= 0 ? ' · hungry: nothing laid' : ''}`, disabled: true });
  if (!herd.length) out.push({ label: 'Tame a docile inhabitant by hand first (offer it food), then lead it here', disabled: true });
  return out;
}
function fillTrough(p: Player, o: TileObject) {
  const z = G.getZone(p.zoneKey);
  const foods = penFoods(z, o);
  let feed = o.state.feed ?? 0, used = 0;
  for (const it of p.allItems()) {
    if (feed >= 95) break;
    if (!foods.includes(it.key) || p.isWorn(it)) continue;
    p.removeItem(it);
    feed = Math.min(100, feed + (it.key === 'feed_mash' ? 45 : 25));
    used++;
  }
  if (!used) { bus.emit('think', p, 'Nothing they would eat.'); return; }
  op('objState', { z: z.key, uid: o.uid, patch: { feed } });
  bus.emit('inventoryChanged', p);
  G.audio?.at?.('rummage', o.x + 1, o.y + 1, 0.6);
}
function collect(p: Player, o: TileObject) {
  const store = { ...(o.state.store || {}) } as Record<string, number>;
  let got = 0;
  for (const [k, n] of Object.entries(store)) for (let i = 0; i < n; i++) { if (!hasItemDef(k)) continue; p.inv.add(createItem(k)); got++; }
  op('objState', { z: p.zoneKey, uid: o.uid, patch: { store: {} } });
  bus.emit('inventoryChanged', p);
  if (got) bus.emit('think', p, Object.entries(store).filter(([, n]) => n > 0).map(([k, n]) => `${n} × ${itemDef(k).name}`).join(', ') + '.');
}

/** a penned creature's step: wander the straw inside the fence (host). false: not penned any more */
export function penStep(c: any, z: Zone, dt: number): boolean {
  const o = z.objects.get(c.mem.pen);
  if (!o || o.key !== 'bld_pen') { c.mem.pen = null; return false; }
  const [w, d] = penSize(o);
  const x0 = o.x + 0.45, x1 = o.x + w - 0.45, z0 = o.y + 0.45, z1 = o.y + d - 0.45;
  let g = c.mem.pg as [number, number] | undefined;
  const inside = (q: [number, number]) => q[0] >= x0 && q[0] <= x1 && q[1] >= z0 && q[1] <= z1;
  c.mem.pgT = (c.mem.pgT ?? 0) - dt;
  if (!g || !inside(g) || c.mem.pgT <= 0) {
    g = [x0 + Math.random() * (x1 - x0), z0 + Math.random() * (z1 - z0)];
    c.mem.pg = g; c.mem.pgT = 3 + Math.random() * 7;
  }
  const dd = Math.hypot(g[0] - c.x, g[1] - c.z);
  if (dd > 0.3) G.creatures.moveTo(c, z, g[0], g[1], (c.sp.walk ?? 1) * 0.55, dt, 0.25);
  else { c.speed = 0; c.vx *= 0.8; c.vz *= 0.8; }
  return true;
}

// ------------------------------------------------------------------ host: produce and regrowth over game hours
let simH = 0;
export function homesteadUpdate(dh: number) {
  simH += dh;
  if (simH < 0.25) return;
  const h = simH; simH = 0;
  if (G.role === 'client') return;
  const rate = hasUnlock('hb_breeding') ? 1.5 : 1, thrift = hasUnlock('hb_rations') ? 0.5 : 1;
  for (const z of G.zones.values()) {
    for (const o of z.objects.values()) {
      if (o.key !== 'bld_pen') continue;
      const herd = penned(z, o);
      if (!herd.length) continue;
      let feed = o.state.feed ?? 0;
      if (feed <= 0) continue;
      feed = Math.max(0, feed - h * 1.6 * herd.length * thrift);
      const store = { ...(o.state.store || {}) } as Record<string, number>;
      let changed = Math.floor(feed / 5) !== Math.floor((o.state.feed ?? 0) / 5);
      for (const c of herd) {
        const ls = livestockOf(c.sp.key); if (!ls) continue;
        const prog = (c.mem.prod ||= {}) as Record<string, number>;
        for (const [item, every] of ls.produce) {
          prog[item] = (prog[item] ?? 0) + h * rate;
          if (prog[item] >= every) { prog[item] -= every; if ((store[item] ?? 0) < 6) { store[item] = (store[item] ?? 0) + 1; changed = true; } }
        }
      }
      if (changed) op('objState', { z: z.key, uid: o.uid, patch: { feed, store } });
      else o.state.feed = feed;
    }
  }
}

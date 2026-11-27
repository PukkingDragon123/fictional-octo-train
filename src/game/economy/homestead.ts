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
import { profXp, profMul } from '../professions';
import { discoverFrom } from '../../craft/stores';

export const REGROW = 36;
const FORAGE: Record<string, { plant: string; extra?: [string, number] }> = {
  forage_moss: { plant: 'lamp_moss', extra: ['seeds_lamp_moss', 0.35] },
  forage_thistle: { plant: 'almond_thistle', extra: ['seeds_thistle', 0.3] },
  forage_ear: { plant: 'wallpaper_ear', extra: ['spawn_ear', 0.2] },
  forage_morel: { plant: 'carpet_morel', extra: ['spawn_morel', 0.15] },
  forage_truffle: { plant: 'ceiling_truffle' },
  forage_bluecap: { plant: 'bluecap', extra: ['spawn_bluecap', 0.2] },
  forage_mint: { plant: 'hush_mint', extra: ['seeds_mint', 0.3] },
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
  const kinds: [string, number][] = [['forage_moss', 3], ['forage_ear', 3], ['forage_morel', 2], ['forage_thistle', 2], ['forage_truffle', 0.8], ['forage_bluecap', 1.6], ['forage_mint', 1.6]];
  let placed = 0;
  for (let tries = 0; tries < want * 60 && placed < want; tries++) {
    const x = rng.int(1, z.W - 2), y = rng.int(1, z.H - 2);
    if (!freeFloor(z, x, y)) continue;
    // against a wall: moss and ears grow where the damp collects (the model's back, -z at rot 0, to the wall)
    const n = !!z.wallN[z.idx(x, y)], w = !!z.wallW[z.idx(x, y)], e = z.inb(x + 1, y) && !!z.wallW[z.idx(x + 1, y)], so = z.inb(x, y + 1) && !!z.wallN[z.idx(x, y + 1)];
    if (!(n || w || e || so) && rng.next() < 0.75) continue;
    const rot = (n ? 0 : e ? 1 : so ? 2 : w ? 3 : rng.int(0, 3)) as 0 | 1 | 2 | 3;
    let near = false;
    for (const o of z.objects.values()) if (isForage(o.key) && Math.abs(o.x - x) + Math.abs(o.y - y) < 12) { near = true; break; }
    if (near) continue;
    const key = rng.weighted(kinds);
    if (b.obj(key, x, y, rot, {})) placed++;
  }
}
const ready = (o: TileObject) => o.state.at == null || G.clock.hours - o.state.at >= REGROW;
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
      // Forager (the 'forage' trade stat): more off every patch
      const n = Math.round((pl.yield[0] + Math.floor(Math.random() * (pl.yield[1] - pl.yield[0] + 1))) * profMul('forage'));
      const got: Item[] = [];
      for (let i = 0; i < n; i++) if (hasItemDef(pl.item)) got.push(createItem(pl.item));
      if (f.extra && Math.random() < f.extra[1] && hasItemDef(f.extra[0])) got.push(createItem(f.extra[0]));
      for (const it of got) p.inv.add(it);
      op('objState', { z: p.zoneKey, uid: o.uid, patch: { at: G.clock.hours } });
      bus.emit('inventoryChanged', p);
      G.audio?.at?.('rummage', o.x + 0.5, o.y + 0.5, 0.6);
      p.body.addXp?.('farming', 4);
      profXp('scavenger', 2, 'forage');
      if (got[0]) discoverFrom(got[0].key, 'find');
      bus.emit('think', p, got.length ? `${got.length} × ${itemName(got[0])}${got.length > n ? ' and something to sow' : ''}.` : 'Nothing worth taking.');
    }), 1.3),
  }];
}

// ------------------------------------------------------------------ the livestock pen
// Round 25: the pen needs feed AND water (state.water 0..100; a Water Trough within two tiles keeps it full), and
// works the trades: Feed Rounds ('herd' more produce, 'feed' less eaten), Milking Hands ('milk': more milk and eggs),
// Breeding Pens ('breed'). Milk is taken by hand from the animal (the HumanRig 'milk' clip), down is sheared off a
// hen (shears, the 'shear' clip), eggs and silk turn up in the straw. An incubator set in the pen hatches eggs into
// chicks; two of a 'pair' breeder make a third. Every chore trains the Handler trade.
// Penned animals keep their day (penStep): they wander the straw, go to the trough to eat while there is feed in it,
// and lie down to sleep at night (net 'pn' = 'eat' | 'sleep', read by each species' animate).
const penSize = (o: TileObject): [number, number] => (o.rot % 2 === 0 ? [3, 2] : [2, 3]);
/** a point in the pen's own frame (metres from its centre at rot 0) in tile space */
function penAt(o: TileObject, lx: number, lz: number): [number, number] {
  const [w, d] = penSize(o), th = -o.rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
  return [o.x + w / 2 + lx * c + lz * s, o.y + d / 2 - lx * s + lz * c];
}
const MAX_HERD = 4;
function penned(z: Zone, o: TileObject): any[] {
  const out: any[] = [];
  const cr = G.creatures?.creatures as Map<string, any> | undefined;
  if (cr) for (const c of cr.values()) if (!c.dead && c.zoneKey === z.key && c.mem?.pen === o.uid) out.push(c);
  return out;
}
const storeCount = (o: TileObject) => Object.values((o.state.store || {}) as Record<string, number>).reduce((s, n) => s + n, 0);
function penFoods(z: Zone, o: TileObject): string[] {
  const a = penned(z, o);
  const set = new Set<string>(['feed_mash', 'feed_sack', 'biomass']);
  for (const c of a) for (const k of livestockOf(c.sp.key)?.food ?? []) set.add(k);
  return [...set];
}
const waterOf = (p: Player) => p.findItem((i) => !!i.fluid && (i.fluid.type === 'water' || i.fluid.type === 'tainted') && i.fluid.amount > 0.2);
/** what a penned animal carries on it to be taken by hand: milk in the udder, down under the wings */
const onAnimal = (item: string) => item === 'moon_milk' ? 'udder' : item === 'hen_down' ? 'coat' : null;
const isNight = () => { const h = G.clock.hours % 24; return h >= 22 || h < 6; };
function penMenu(p: Player, o: TileObject): MenuOption[] {
  const z = G.getZone(p.zoneKey);
  const out: MenuOption[] = [];
  const at = (name: string, secs: number, fn: () => void, anim = 'loot') => () => { const [w, d] = penSize(o); queueAt(p, o.x + w / 2, o.y + d / 2, new UseObjectAction(p, name, secs, anim, fn), 2.2); };
  const herd = penned(z, o);
  const n = storeCount(o);
  const feed = Math.round(o.state.feed ?? 0), water = Math.round(o.state.water ?? 0);
  // collect what they made
  if (n > 0) out.push({ label: `Collect from the straw (${n})`, action: at('Collect', 1.8, () => collect(p, o), 'harvest') });
  // milk and down, by hand off the animals
  const udder = herd.filter((c) => (c.mem.udder ?? 0) >= 1), coat = herd.filter((c) => (c.mem.coat ?? 0) >= 1);
  if (udder.length) out.push({ label: `Milk the ${udder[0].sp.name.toLowerCase()}`, action: milkAt(p, o, udder[0]) });
  if (coat.length) {
    const sh = p.findItem((i) => !!itemDef(i.key).tags?.includes('shears'));
    out.push({ label: `Shear the ${coat[0].sp.name.toLowerCase()}`, disabled: sh ? false : 'needs shears', action: shearAt(p, o, coat[0]) });
  }
  // fill the trough and the water pan
  const foods = penFoods(z, o);
  const food = p.allItems().find((it) => foods.includes(it.key) && !p.isWorn(it));
  if (feed < 90) out.push({ label: food ? `Fill the trough (${itemName(food)})` : 'Fill the trough', disabled: food ? false : 'needs feed mash, biomass or what they eat', action: at('Feed', 1.6, () => fillTrough(p, o), 'pour') });
  if (water < 90) { const w = waterOf(p); out.push({ label: 'Fill the water pan', disabled: w ? false : 'needs water', action: at('Water', 1.6, () => fillWater(p, o), 'pour') }); }
  // the incubator: set it in the straw, then eggs in it
  const inc = p.findItem((i) => i.key === 'incubator');
  if (!o.state.incub && inc) out.push({ label: 'Set the incubator in the straw', action: at('Incubator', 2, () => { if (!p.containerOf(inc)) return; p.removeItem(inc); op('objState', { z: p.zoneKey, uid: o.uid, patch: { incub: true } }); bus.emit('inventoryChanged', p); profXp('handler', 3, 'incubator'); }, 'harvest') });
  if (o.state.incub && !o.state.hatch) {
    const eggs = p.allItems().filter((i) => i.key === 'pallid_egg');
    out.push({ label: 'Set eggs to hatch', disabled: eggs.length ? false : 'needs pallid eggs', action: at('Set eggs', 2, () => setEggs(p, o), 'harvest') });
    out.push({ label: 'Take the incubator back', action: at('Incubator', 1.6, () => { if (o.state.hatch) return; op('objState', { z: p.zoneKey, uid: o.uid, patch: { incub: false } }); p.inv.add(createItem('incubator')); bus.emit('inventoryChanged', p); }) });
  }
  // lead tamed followers in
  const cr = G.creatures?.creatures as Map<string, any> | undefined;
  if (cr && herd.length < MAX_HERD) for (const c of cr.values()) {
    if (c.dead || c.zoneKey !== z.key || c.tamedBy !== p.id || c.mem?.pen) continue;
    if (Math.hypot(c.x - p.x, c.z - p.z) > 12) continue;
    out.push({ label: `Lead the ${c.sp.name.toLowerCase()} in`, action: () => { penIn(c, o); bus.emit('think', p, `In you go. ${livestockOf(c.sp.key) ? 'Earn your keep.' : 'Stay.'}`); } });
  }
  for (const c of herd) out.push({ label: `Let the ${c.sp.name.toLowerCase()} out`, action: () => { c.mem.pen = null; } });
  // the plate on the gate: who, feed, water, the incubator
  const who = herd.length ? herd.map((c) => c.sp.name).join(', ') : 'empty';
  const hatch = o.state.hatch ? ` · hatching in ~${Math.max(1, Math.ceil(o.state.hatch.at - G.clock.hours))} h` : '';
  out.push({ label: `Pen: ${who} · trough ${feed}% · water ${water}%${hatch}${herd.length && (feed <= 0 || water <= 0) ? ' · nothing laid' : ''}`, disabled: true });
  if (!herd.length) out.push({ label: 'Tame a docile inhabitant by hand first (offer it food), then lead it here', disabled: true });
  return out;
}
/** in the pen for good: it stays, persists and keeps its day there */
export function penIn(c: any, o: TileObject) {
  c.mem.pen = o.uid; c.mem.stay = false; c.mem.persistent = true;
  const [hx, hz] = penAt(o, 0, 0);
  c.home = { x: hx, z: hz };
}
function milkAt(p: Player, o: TileObject, c: any) {
  return () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Milk', 3.2, 'milk', () => {
    const k = Math.floor(c.mem.udder ?? 0);
    if (k < 1 || c.dead) return;
    c.mem.udder = 0;
    for (let i = 0; i < k; i++) p.inv.add(createItem('moon_milk'));
    bus.emit('inventoryChanged', p);
    G.audio?.at?.('pour', c.x, c.z, 0.5);
    profXp('handler', 6 * k, 'milked');
    bus.emit('think', p, `${k} × ${itemDef('moon_milk').name}. It glows in the jar.`);
    discoverFrom('moon_milk', 'find');
    void o;
  }), 0.9, false);
}
function shearAt(p: Player, o: TileObject, c: any) {
  return () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Shear', 2.6, 'shear', () => {
    const sh = p.findItem((i) => !!itemDef(i.key).tags?.includes('shears'));
    const k = Math.floor(c.mem.coat ?? 0);
    if (!sh || k < 1 || c.dead) return;
    c.mem.coat = 0;
    sh.cond = Math.max(0, (sh.cond ?? 1) - 0.01);
    for (let i = 0; i < k; i++) p.inv.add(createItem('hen_down'));
    bus.emit('inventoryChanged', p);
    G.audio?.at?.('rummage', c.x, c.z, 0.5);
    profXp('handler', 5 * k, 'sheared');
    discoverFrom('hen_down', 'find');
    void o;
  }), 0.8, false);
}
function fillTrough(p: Player, o: TileObject) {
  const z = G.getZone(p.zoneKey);
  const foods = penFoods(z, o);
  let feed = o.state.feed ?? 0, used = 0;
  // a feed sack fills it in one go
  const sack = p.allItems().find((it) => it.key === 'feed_sack' && !p.isWorn(it));
  if (sack && feed < 60) { p.removeItem(sack); feed = 100; used = 1; }
  for (const it of p.allItems()) {
    if (feed >= 95) break;
    if (!foods.includes(it.key) || p.isWorn(it) || it.key === 'feed_sack') continue;
    p.removeItem(it);
    feed = Math.min(100, feed + (it.key === 'feed_mash' ? 45 : 25));
    used++;
  }
  if (!used) { bus.emit('think', p, 'Nothing they would eat.'); return; }
  op('objState', { z: z.key, uid: o.uid, patch: { feed } });
  bus.emit('inventoryChanged', p);
  G.audio?.at?.('rummage', o.x + 1, o.y + 1, 0.6);
  profXp('handler', 2 + used, 'fed');
}
function fillWater(p: Player, o: TileObject) {
  const w = waterOf(p); if (!w?.fluid) return;
  const used = Math.min(w.fluid.amount, 1.5);
  w.fluid.amount -= used; if (w.fluid.amount < 0.01) w.fluid = null;
  op('objState', { z: p.zoneKey, uid: o.uid, patch: { water: Math.min(100, (o.state.water ?? 0) + used * 60) } });
  G.audio?.at?.('pour', o.x + 1, o.y + 1, 0.6);
  bus.emit('inventoryChanged', p);
  profXp('handler', 2, 'watered');
}
/** eggs into the incubator: they hatch in a day (two thirds with Incubation, quicker under Breeding Pens) */
function setEggs(p: Player, o: TileObject) {
  const eggs = p.allItems().filter((i) => i.key === 'pallid_egg').slice(0, 3);
  if (!eggs.length || o.state.hatch || !o.state.incub) return;
  for (const e of eggs) p.removeItem(e);
  const hrs = 22 * (hasUnlock('hb_incubate') ? 0.67 : 1) / Math.max(0.3, profMul('breed'));
  op('objState', { z: p.zoneKey, uid: o.uid, patch: { hatch: { at: G.clock.hours + hrs, sp: 'pale_hen', n: eggs.length, by: p.id } } });
  bus.emit('inventoryChanged', p);
  profXp('handler', 4 * eggs.length, 'incubated');
}
function collect(p: Player, o: TileObject) {
  const store = { ...(o.state.store || {}) } as Record<string, number>;
  let got = 0;
  for (const [k, n] of Object.entries(store)) for (let i = 0; i < n; i++) { if (!hasItemDef(k)) continue; p.inv.add(createItem(k)); got++; }
  op('objState', { z: p.zoneKey, uid: o.uid, patch: { store: {} } });
  bus.emit('inventoryChanged', p);
  if (got) {
    bus.emit('think', p, Object.entries(store).filter(([, n]) => n > 0).map(([k, n]) => `${n} × ${itemDef(k).name}`).join(', ') + '.');
    profXp('handler', 3 * got, 'collected');
    for (const k of Object.keys(store)) discoverFrom(k, 'find');
  }
}

/** a penned creature's day: wander the straw, eat at the trough, sleep at night (host). false: not penned any more */
export function penStep(c: any, z: Zone, dt: number): boolean {
  const o = z.objects.get(c.mem.pen);
  if (!o || o.key !== 'bld_pen') { c.mem.pen = null; return false; }
  const [w, d] = penSize(o);
  const x0 = o.x + 0.45, x1 = o.x + w - 0.45, z0 = o.y + 0.45, z1 = o.y + d - 0.45;
  const n = netAt(c);
  // a chick or a young one grows up in a day
  if (c.mem.young != null && G.clock.hours - c.mem.young > 24) { c.mem.young = null; n.yg = 0; }
  let g = c.mem.pg as [number, number] | undefined;
  const inside = (q: [number, number]) => q[0] >= x0 && q[0] <= x1 && q[1] >= z0 && q[1] <= z1;
  c.mem.pgT = (c.mem.pgT ?? 0) - dt;
  // the day: sleep at night, else now and then go to the trough while it has feed in it
  const night = isNight();
  const fed = (o.state.feed ?? 0) > 0;
  let want: 'sleep' | 'eat' | '' = c.mem.pmode ?? '';
  if (c.mem.pgT <= 0) {
    want = night ? 'sleep' : fed && Math.random() < 0.45 ? 'eat' : '';
    c.mem.pmode = want;
    const i = penned(z, o).indexOf(c);
    if (want === 'sleep') g = penAt(o, -0.9 + (i % 3) * 0.7, 0.45 - Math.floor(i / 3) * 0.5);
    else if (want === 'eat') g = penAt(o, -0.85 + ((i % 3) - 1) * 0.28, -0.3);
    else g = [x0 + Math.random() * (x1 - x0), z0 + Math.random() * (z1 - z0)];
    c.mem.pg = g; c.mem.pgT = want === 'sleep' ? 20 + Math.random() * 20 : want === 'eat' ? 6 + Math.random() * 6 : 3 + Math.random() * 7;
  }
  if (!g || !inside(g)) { g = [Math.min(x1, Math.max(x0, g?.[0] ?? x0)), Math.min(z1, Math.max(z0, g?.[1] ?? z0))]; c.mem.pg = g; }
  const dd = Math.hypot(g[0] - c.x, g[1] - c.z);
  if (dd > 0.3) { G.creatures.moveTo(c, z, g[0], g[1], (c.sp.walk ?? 1) * 0.8, dt, 0.25); setPn(c, n, ''); }
  else {
    c.speed = 0; c.vx *= 0.8; c.vz *= 0.8;
    setPn(c, n, want === 'eat' && !fed ? '' : want);
    if (want === 'eat') c.facing = Math.atan2(penAt(o, -0.85, -0.62)[1] - c.z, penAt(o, -0.85, -0.62)[0] - c.x);
  }
  return true;
}
/** the replicated pen mode, mapped onto what each species already animates (a calf grazes, a pigeon pecks) */
function setPn(c: any, n: Record<string, any>, mode: '' | 'eat' | 'sleep') {
  if (n.pn === mode) return;
  n.pn = mode;
  if (c.sp.key === 'moon_calf') n.gz = mode === 'eat' ? 1 : 0;
  if (c.sp.key === 'tallow_pigeon') n.md = mode === 'eat' ? 'peck' : '';
}
function netAt(c: any): Record<string, any> {
  let n = c.mem.net;
  if (!n || typeof n !== 'object') { n = {}; c.mem.net = n; }
  c.mem.netMem = n;
  return n;
}

// ------------------------------------------------------------------ host: produce and regrowth over game hours
let simH = 0;
export function homesteadUpdate(dh: number) {
  simH += dh;
  if (simH < 0.25) return;
  const h = simH; simH = 0;
  if (G.role === 'client') return;
  const rate = (hasUnlock('hb_breeding') ? 1.5 : 1) * profMul('herd'), thrift = (hasUnlock('hb_rations') ? 0.5 : 1) * profMul('feed');
  for (const z of G.zones.values()) {
    let troughs: TileObject[] | null = null;
    for (const o of z.objects.values()) {
      // picked forage grows back
      if (o.state.at != null && isForage(o.key)) { if (G.clock.hours - o.state.at >= REGROW) op('objState', { z: z.key, uid: o.uid, patch: { at: null } }); continue; }
      if (o.key !== 'bld_pen') continue;
      const patch: Record<string, unknown> = {};
      // a water trough within two tiles tops the pan up
      let water = o.state.water ?? 0;
      if (water < 60) {
        troughs ||= [...z.objects.values()].filter((q) => q.key === 'bld_trough');
        const t = troughs.find((q) => Math.abs(q.x - o.x) <= 4 && Math.abs(q.y - o.y) <= 4 && (q.state.water ?? 0) > 1);
        if (t) { const take = Math.min(t.state.water, 20); op('objState', { z: z.key, uid: t.uid, patch: { water: t.state.water - take } }); water = Math.min(100, water + take * 2); patch.water = water; }
      }
      // the incubator
      const hatch = o.state.hatch as { at: number; sp: string; n: number; by?: string } | null;
      if (hatch && G.clock.hours >= hatch.at) { hatchOut(z, o, hatch); patch.hatch = null; }
      const herd = penned(z, o);
      if (!herd.length) { if (Object.keys(patch).length) op('objState', { z: z.key, uid: o.uid, patch }); continue; }
      let feed = o.state.feed ?? 0;
      if (feed <= 0 || water <= 0) { if (Object.keys(patch).length) op('objState', { z: z.key, uid: o.uid, patch }); continue; }
      feed = Math.max(0, feed - h * 1.6 * herd.length * thrift);
      water = Math.max(0, water - h * 1.2 * herd.length);
      const store = { ...(o.state.store || {}) } as Record<string, number>;
      let changed = Math.floor(feed / 5) !== Math.floor((o.state.feed ?? 0) / 5) || Math.floor(water / 5) !== Math.floor((o.state.water ?? 0) / 5) || Object.keys(patch).length > 0;
      for (const c of herd) {
        const ls = livestockOf(c.sp.key); if (!ls) continue;
        const prog = (c.mem.prod ||= {}) as Record<string, number>;
        for (const [item, every] of ls.produce) {
          prog[item] = (prog[item] ?? 0) + h * rate;
          if (prog[item] < every) continue;
          prog[item] -= every;
          // Milking Hands: milk and eggs come a little more than one at a time
          const more = (item === 'moon_milk' || item === 'pallid_egg' || item === 'pigeon_egg') && Math.random() < profMul('milk') - 1 ? 2 : 1;
          const on = onAnimal(item);
          if (on) { c.mem[on] = Math.min(3, (c.mem[on] ?? 0) + more); continue; }
          if ((store[item] ?? 0) < 6) { store[item] = Math.min(6, (store[item] ?? 0) + more); changed = true; }
        }
        // pairs breed: two or more of a kind, fed and watered, make a third (Breeding Pens hurry it)
        if (ls.breed === 'pair' && herd.length < MAX_HERD && herd.filter((q) => q.sp.key === c.sp.key).length >= 2 && herd.indexOf(c) === herd.findIndex((q) => q.sp.key === c.sp.key)) {
          const br = { ...((o.state.breed || {}) as Record<string, number>) };
          br[c.sp.key] = (br[c.sp.key] ?? 0) + h * rate * profMul('breed');
          if (br[c.sp.key] >= 60) { br[c.sp.key] = 0; bear(z, o, c.sp.key, c.tamedBy); }
          patch.breed = br; changed = true;
        }
      }
      if (changed) op('objState', { z: z.key, uid: o.uid, patch: { ...patch, feed, water, store } });
      else { o.state.feed = feed; o.state.water = water; }
    }
  }
}
/** a young one in the pen, already tame */
function bear(z: Zone, o: TileObject, key: string, owner: string | undefined) {
  const [x, y] = penAt(o, 0.3 - Math.random() * 0.6, 0.2);
  const c = G.creatures?.spawn?.(key, z.key, x, y, {});
  if (!c) return null;
  c.tamedBy = owner ?? G.local?.id; c.feeds = 99;
  c.mem.young = G.clock.hours; netAt(c).yg = 1;
  penIn(c, o);
  bus.emit('bred', { key, zone: z.key, pen: o.uid });
  const p = G.local;
  if (p && p.zoneKey === z.key) { profXp('handler', 25, 'bred'); bus.emit('halo', p, `+1 ${species(key) ? (getSpecies(key) as any).name : key}`, 'good'); }
  return c;
}
function hatchOut(z: Zone, o: TileObject, hatch: { sp: string; n: number; by?: string }) {
  const herd = penned(z, o).length;
  for (let i = 0; i < Math.min(hatch.n, MAX_HERD + 2 - herd); i++) bear(z, o, hatch.sp, hatch.by);
}
const species = (k: string) => !!getSpecies(k);

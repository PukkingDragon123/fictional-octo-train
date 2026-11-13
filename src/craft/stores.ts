// CAMP STORES, DISCOVERY AND QUALITY (round 16).
//
// Storage that links to crafting: every crate, locker and other built container in
// the claim you stand in (or within a few metres of you, with no claim) is part of
// your hands when you craft or build. checkRecipe (src/interact/crafting.ts) and
// build mode (src/build/build.ts) read storeItems(); what they use out of a store
// leaves it through one replicated op ('bldStoreTake').
//
// Recipe discovery: a schematic (a learned recipe) with a `discover` list is learned
// the first time you scan, strip or take apart one of those things; blueprints for
// build pieces are found the same way (DISCOVER_BP).
//
// Quality from tools: what you make with sound tools on a good bench comes out
// better (Crude / Sound / Fine / Masterwork); see craftQuality().
import { G } from '../game/G';
import { bus } from '../core/events';
import { defOp, op } from '../game/ops';
import { objDef } from '../world/objects';
import { itemDef, type Item } from '../items/item';
import { allRecipes, type Recipe } from '../items/recipes';
import { resolveContainer } from '../game/worldOps';
import { grantNode, hasUnlock, researchNode } from '../game/research';
import type { Container } from '../items/container';
import type { Player } from '../entities/player';
import type { TileObject } from '../world/zone';

const NEAR = 4.5;

export interface Store { c: Container; ref: string; o: TileObject }

/** a built container: a piece out of build mode (crate, locker, ...) */
function isStore(o: TileObject): boolean {
  if (!o.inv || o.state?.built !== 1) return false;
  const d = objDef(o.key);
  return !!d?.tags?.includes('build');
}

let cacheT = -1, cacheP: Player | null = null, cache: Store[] = [];
/** the stores linked to this unit's hands right now: the claim it stands in, or anything built within a few metres */
export function stores(p: Player): Store[] {
  if (!p || p.body.dead) return [];
  if (cacheP === p && G.time === cacheT) return cache;
  const out: Store[] = [];
  const z = G.zones.get(p.zoneKey);
  if (z) {
    const claim = G.build?.settle?.claimAt?.(p.zoneKey, p.x, p.z) as TileObject | null;
    const R = claim ? (G.build?.claimRadius?.(claim) ?? 12) : 0;
    for (const o of z.objects.values()) {
      if (!isStore(o)) continue;
      const d = Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.z);
      const inClaim = claim && Math.hypot(o.x + 0.5 - (claim.x + 0.5), o.y + 0.5 - (claim.y + 0.5)) <= R && d <= 16;
      if (inClaim || d <= NEAR) out.push({ c: o.inv!, ref: 'obj:' + o.uid, o });
    }
  }
  cacheT = G.time; cacheP = p; cache = out;
  return out;
}
/** every item in the linked stores */
export function storeItems(p: Player): Item[] {
  const out: Item[] = [];
  for (const s of stores(p)) for (const it of s.c.items) out.push(it);
  return out;
}
export function storeOf(p: Player, it: Item): Store | null {
  for (const s of stores(p)) if (s.c.items.includes(it)) return s;
  return null;
}
/** take an item out of a store (uses = what is left of a drainable, or null to take the whole thing) */
export function takeFromStore(p: Player, it: Item, uses: number | null = null): boolean {
  const s = storeOf(p, it); if (!s) return false;
  op('bldStoreTake', { z: p.zoneKey, ref: s.ref, uid: it.uid, uses });
  return true;
}
defOp('bldStoreTake', (a: { z: string; ref: string; uid: number; uses: number | null }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c) return;
  const it = c.items.find((i) => i.uid === a.uid); if (!it) return;
  if (a.uses == null || a.uses <= 0.001) c.remove(it); else it.uses = a.uses;
  bus.emit('containerChanged', c);
});

// ---------------------------------------------------------------- quality
export const GRADES = ['Crude', 'Sound', 'Fine', 'Masterwork'] as const;
/** 0..3 from the tools used (their condition), the bench and the skill */
export function craftQuality(p: Player, r: Recipe, tools: Item[]): number {
  const tcond = tools.length ? tools.reduce((a, t) => a + (itemDef(t.key).durability ? t.cond : 0.85), 0) / tools.length : 0.55;
  const near = (tag: string) => !!G.interact?.nearTag?.(p, tag);
  const bench = near('bench3') ? 3 : near('bench2') ? 2 : near('workbench') ? 1 : 0;
  const sk = r.xp ? p.body.skill(r.xp[0] as never) : 0;
  const score = tcond * 1.4 + bench * 0.32 + sk * 0.08 - 0.2;
  return score < 0.75 ? 0 : score < 1.35 ? 1 : score < 1.85 ? 2 : 3;
}
/** stamp a made thing with its grade: condition and a word in front of its name (only things that wear) */
export function applyQuality(it: Item, q: number) {
  const d = itemDef(it.key);
  if (!d.durability && !d.weapon && d.cat !== 'tool' && d.cat !== 'weapon') return;
  it.data = { ...(it.data || {}), q };
  it.cond = [0.62, 0.86, 1, 1][q] ?? 1;
  if (q === 0 || q >= 2) it.name = `${GRADES[q]} ${d.name}`;
}

// ---------------------------------------------------------------- discovery
/** build-piece blueprints found by scanning or taking apart (object / item key pattern -> research node) */
const DISCOVER_BP: [RegExp, string, string][] = [
  [/generator|gen_rig/, 'bp_gen_rig', 'Generator Rig'],
  [/radio|walkie/, 'bp_radio', 'Camp Radio'],
  [/alarm|siren|klaxon/, 'bp_siren', 'Crank Siren'],
  [/trap|spring/, 'bp_traps', 'Spring Jaw Trap'],
  [/hydro|planter_box|grow/, 'bp_hydro', 'Hydro Rack'],
  [/cable|wire|fuse|breaker/, 'bp_wiring', 'Wiring'],
  [/compactor|press/, 'bp_compactor', 'Scrap Compactor'],
];

/** something was looked at closely or taken apart: learn what it teaches */
export function discoverFrom(key: string, how: 'scan' | 'strip') {
  const p = G.local as (Player & { knownRecipes?: Set<string> }) | null;
  if (!p || !key) return;
  const known = p.knownRecipes || (p.knownRecipes = new Set<string>());
  const learned: string[] = [];
  for (const r of allRecipes()) {
    if (!r.learned || known.has(r.key) || !r.discover?.includes(key)) continue;
    known.add(r.key); learned.push(r.name);
  }
  for (const [re, node, name] of DISCOVER_BP) {
    if (!re.test(key) || hasUnlock(node) || !researchNode(node)) continue;
    grantNode(node); learned.push('blueprint: ' + name);
  }
  if (!learned.length) return;
  G.audio?.ui?.('nodeUnlock', 0.5);
  const verb = how === 'scan' ? 'The scan shows how it is put together' : 'Taking it apart shows how it was made';
  bus.emit('think', p, `${verb}. ${learned.slice(0, 2).join(', ')}${learned.length > 2 ? ' and more' : ''}.`);
  bus.emit('halo', p, 'Learned: ' + learned[0].replace(/^Cut |^Rivet |^Solder |^Rebuild /, ''), 'good');
  bus.emit('recipeDiscovered', learned);
  G.missions?.set?.('craft:discover');
}

let wired = false;
export function wireDiscovery() {
  if (wired) return;
  wired = true;
  bus.on('scanEntry', (e: { kind: string; key: string }) => { if (e?.kind === 'item' || e?.kind === 'object') discoverFrom(e.key, 'scan'); });
  bus.on('crafted', (p: Player, r: Recipe) => {
    if (p !== G.local || !r?.key?.startsWith('strip_')) return;
    discoverFrom(r.key.slice(6), 'strip');
  });
  bus.on('disassembled', (p: Player, key: string) => { if (p === G.local) discoverFrom(key, 'strip'); });
}

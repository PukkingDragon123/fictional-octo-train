// What things are worth to the Remittance Programme, and what furniture hides.
//
// Every item has a scrip value: an explicit ItemDef.value, else one derived
// from its category, weight, rarity and tags (anomalies and rare tech high,
// food and medicine low), scaled by condition, plus whatever it contains.
// Furniture is worth its weight, its salvage and what is still inside it.
// Smashed furniture spills valuables from a per-kind table (sofa cushions:
// coins and rings, desks: watches and cash, dressers: jewellery, TVs and
// computers: boards and copper, fridges: almost nothing, safes: rich).
import { Item, ItemDef, itemDef, hasItemDef } from '../../items/item';
import { objDef, ObjDef } from '../../world/objects';
import type { TileObject } from '../../world/zone';

const BASE: Record<string, number> = {
  food: 3, drink: 3, medical: 12, weapon: 28, tool: 22, clothing: 6, bag: 12, material: 2, electronics: 45,
  literature: 4, misc: 5, ammo: 1, key: 0, seed: 1, fuel: 8, light: 14, container: 3, lore: 0, trap: 8, corpse: 15, anomaly: 260,
};
const TAG_BONUS: Record<string, number> = { jewelry: 60, gold: 140, silver: 70, copper: 40, antique: 60, shiny: 6, electronics: 20, data: 30, camera: 40 };
const FLUID: Record<string, number> = { water: 2, tainted: 0, almond: 30, gasoline: 14, bleach: 3, juice: 4, soda: 3, alcohol: 18, milk: 3, coolant: 6, static: 90 };

/** items the hoppers refuse (mission items, keys, the band itself) */
export function isRejected(d: ItemDef): boolean {
  const t = d.tags || [];
  return t.includes('no_deposit') || t.includes('mission') || t.includes('keycard') || d.cat === 'key' || d.cat === 'lore' || !!d.key.match(/^(root_key|keycard_|house_key)/);
}

function derived(d: ItemDef): number {
  let v = BASE[d.cat] ?? 4;
  const w = Math.max(0.01, d.weight);
  if (d.cat === 'material') v *= Math.max(1, Math.min(8, w * 3));
  else if (d.cat === 'electronics' || d.cat === 'tool' || d.cat === 'weapon' || d.cat === 'light') v *= 0.6 + Math.min(2, Math.sqrt(w)) * 0.5;
  else if (d.cat === 'clothing') v *= 0.6 + Math.min(1.6, w);
  if (d.rare) v *= 4;
  if (d.anomaly) v = Math.max(v, 220);
  if (d.weapon?.kind === 'firearm') v += 120;
  if (d.radio) v += 30;
  if (d.battery) v += 6;
  for (const t of d.tags || []) v += TAG_BONUS[t] ?? 0;
  return v;
}

/** scrip the hopper pays for one item (0 = rejected) */
export function itemValue(it: Item): number {
  const d = itemDef(it.key);
  if (isRejected(d)) return 0;
  if (it.key === 'furniture' && it.data?.obj) return objKeyValue(it.data.obj, it.data.state || {});
  let v = d.value ?? derived(d);
  // condition: worn-out things are worth less; spoiled food is worth nothing much
  if (d.food) { const ff = d.food.fresh; if (ff !== undefined && it.age / 24 > (d.food.rot ?? ff * 2)) v *= 0.2; }
  else v *= 0.35 + 0.65 * Math.max(0, Math.min(1, it.cond ?? 1));
  if (it.bloody) v *= 1 - Math.min(0.3, it.bloody * 0.3);
  // stacks / boxes
  const count = it.data?.count;
  if (typeof count === 'number' && d.ammoCount) v *= Math.max(0, count) / d.ammoCount;
  // fluids carried in it
  if (it.fluid && it.fluid.amount > 0) v += (FLUID[it.fluid.type] ?? 1) * it.fluid.amount;
  // what it contains
  if (it.inv) for (const c of it.inv.items) v += itemValue(c);
  return Math.max(0, Math.round(v));
}

/** scrip for a whole piece of furniture by key */
export function objKeyValue(key: string, state: Record<string, any> = {}): number {
  const d = objDef(key);
  if (!d) return 10;
  const t = d.tags || [];
  if (t.includes('hopper') || t.includes('portal') || t.includes('node') || t.includes('mission') || key === 'seam_door') return 0;
  let v = Math.min(240, (d.movable ?? 30) * 1.4);
  if (d.disassemble) for (const [k, a, b] of d.disassemble.yields) if (hasItemDef(k)) v += ((a + b) / 2) * (itemDef(k).value ?? derived(itemDef(k))) * 0.8;
  if (d.power) v += 40;
  if (t.some((x) => ['tv', 'computer', 'appliance', 'electronics', 'screen', 'arcade', 'radio'].includes(x))) v += 70;
  if (t.includes('antique') || /piano|grandfather|clock|chandelier/.test(key)) v += 120;
  if (/safe/.test(key)) v += 200;
  if (state.broken) v *= 0.5;
  return Math.round(Math.max(12, Math.min(950, v)));
}

/** scrip for a placed object including its container contents (host only: contents are authoritative there) */
export function objectValue(o: TileObject): number {
  let v = objKeyValue(o.key, o.state);
  if (o.inv) for (const it of o.inv.items) v += itemValue(it);
  return v;
}

// ---------------------------------------------------------------- what furniture hides
interface Stash { chance: number; n: [number, number]; items: [string, number][] }
export const STASH: Record<string, Stash> = {
  cushions: { chance: 0.85, n: [1, 3], items: [['coins', 6], ['wedding_ring', 2.2], ['cash_roll', 1.6], ['silver_dollars', 1], ['engagement_ring', 0.4], ['gold_teeth', 0.35], ['dentures', 0.7], ['cameo_brooch', 0.5], ['pocket_watch', 0.35], ['photo_old', 1.5], ['key_generic', 0.8]] },
  desk: { chance: 0.85, n: [1, 3], items: [['gold_watch', 1.2], ['cash_roll', 2.5], ['pocket_watch', 0.8], ['gold_lighter', 1], ['hard_drive_old', 1.5], ['stamp_album', 0.6], ['medal_case', 0.4], ['coins', 3], ['gold_award', 0.5], ['circuit_board', 0.8]] },
  dresser: { chance: 0.9, n: [1, 3], items: [['pearl_necklace', 1], ['jewellery_box', 1.2], ['gold_chain', 1], ['diamond_earrings', 0.5], ['wedding_ring', 1.5], ['cameo_brooch', 1], ['gold_watch', 0.6], ['cash_roll', 1], ['silver_candlestick', 0.6], ['porcelain_doll', 0.6]] },
  electronics: { chance: 0.95, n: [1, 3], items: [['circuit_board', 5], ['copper_bundle', 3], ['hard_drive_old', 1], ['vhs_stack', 1.2], ['film_reel', 0.4], ['camcorder', 0.3]] },
  appliance: { chance: 0.2, n: [1, 1], items: [['copper_bundle', 3], ['circuit_board', 1], ['coins', 1]] },
  safe: { chance: 1, n: [2, 4], items: [['cash_roll', 4], ['gold_chain', 1.5], ['diamond_earrings', 1], ['engagement_ring', 1], ['gold_watch', 1.5], ['silver_dollars', 2], ['medal_case', 1], ['stamp_album', 1], ['gold_teeth', 0.8]] },
  locker: { chance: 0.75, n: [1, 2], items: [['cash_roll', 2], ['gold_watch', 0.8], ['wedding_ring', 1], ['gold_lighter', 1], ['coins', 3], ['camcorder', 0.4], ['boombox', 0.5]] },
  bed: { chance: 0.6, n: [1, 2], items: [['cash_roll', 3], ['coin_jar', 0.8], ['wedding_ring', 1], ['porcelain_doll', 0.6], ['pocket_watch', 0.4], ['silver_dollars', 1]] },
  shelf: { chance: 0.55, n: [1, 2], items: [['stamp_album', 1.5], ['film_reel', 1], ['vhs_stack', 2], ['antique_figurine', 1.5], ['crystal_decanter', 0.8], ['silver_candlestick', 0.8], ['cash_roll', 1]] },
  cabinet: { chance: 0.6, n: [1, 2], items: [['silverware_set', 1.5], ['crystal_decanter', 1], ['silver_candlestick', 1], ['antique_figurine', 1], ['coin_jar', 1.5]] },
  office: { chance: 0.6, n: [1, 2], items: [['cash_roll', 1.5], ['hard_drive_old', 1.5], ['gold_award', 0.6], ['circuit_board', 1], ['coins', 2], ['typewriter', 0.25]] },
  toybox: { chance: 0.7, n: [1, 2], items: [['porcelain_doll', 2], ['coin_jar', 1], ['silver_dollars', 0.6], ['coins', 2]] },
  generic: { chance: 0.3, n: [1, 1], items: [['coins', 5], ['circuit_board', 1], ['copper_bundle', 1], ['cash_roll', 0.5]] },
};

/** which stash table a piece of furniture uses */
export function stashKind(o: TileObject | string, d?: ObjDef): string {
  const key = typeof o === 'string' ? o : o.key;
  const def = d ?? objDef(key);
  const t = def?.tags || [];
  const s = key + ' ' + t.join(' ');
  if (/safe/.test(s)) return 'safe';
  if (/sofa|couch|armchair|loveseat|recliner|ottoman|rocking_chair/.test(s)) return 'cushions';
  if (/fridge|freezer|stove|microwave|oven|washer|dryer|toaster|dishwasher|water_heater|boiler/.test(s)) return 'appliance';
  if (/tv|computer|crt|monitor|arcade|radio|copier|printer|server_rack|terminal|cctv|cash_register|console|mainframe|hospital_monitor/.test(s)) return 'electronics';
  if (/dresser|wardrobe|nightstand|vanity|jewel|chest_of|dressing/.test(s)) return 'dresser';
  if (/locker|tool_chest/.test(s)) return 'locker';
  if (/toy_box|dollhouse|toybox/.test(s)) return 'toybox';
  if (/bed|crib|bunk|mattress/.test(s)) return 'bed';
  if (/teacher_desk|desk_office|desk_cubicle|reception|security_desk|nurse_station|\bdesk\b|desk/.test(s)) return 'desk';
  if (/filing|cabinet_file/.test(s)) return 'office';
  if (/bookshelf|library_shelf|bookcase|display/.test(s)) return 'shelf';
  if (/cabinet|cupboard|sideboard|hutch|counter_kitchen|china/.test(s)) return 'cabinet';
  return 'generic';
}

/** roll what spills out of a smashed piece of furniture (random; the result travels through dropFloor ops) */
export function rollStash(kind: string, luck = 1, rnd: () => number = Math.random): string[] {
  const s = STASH[kind] || STASH.generic;
  if (rnd() > Math.min(1, s.chance * luck)) return [];
  const n = s.n[0] + Math.floor(rnd() * (s.n[1] - s.n[0] + 1));
  const total = s.items.reduce((a, [, w]) => a + w, 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let r = rnd() * total;
    for (const [k, w] of s.items) { r -= w; if (r <= 0) { if (hasItemDef(k)) out.push(k); break; } }
  }
  return out;
}

/** is this a valuable (for tut:valuable and scan flavour) */
export function isValuable(it: Item): boolean {
  const d = itemDef(it.key);
  return (d.tags || []).includes('valuable') || (d.value ?? 0) >= 100;
}

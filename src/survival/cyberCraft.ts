// Building cyberware on the operating table's jig (src/ui/surgery/field.ts).
// The two machines are the tools, so a recipe here is only the material: what
// goes into the part. A part can be built once the table can fit it (the
// starter, or researched on the watch: cyber.ts partUnlocked). Pieces come out
// of anything you carry that is not worn; the part goes into your pack.
import type { Player } from '../entities/player';
import type { Item } from '../items/item';
import { itemDef, hasItemDef } from '../items/item';
import { createItem } from '../items/factory';
import { CYBER_PARTS, cyberDef } from './cyberParts';

export interface TableInput { item: string; count?: number }

/** what each part is made of, by part key */
export const TABLE_RECIPES: Record<string, TableInput[]> = {
  scrap_arm: [{ item: 'scrap_metal', count: 4 }, { item: 'pipe', count: 2 }, { item: 'wire' }, { item: 'screws' }],
  scrap_leg: [{ item: 'scrap_metal', count: 4 }, { item: 'pipe', count: 2 }, { item: 'sheet_metal' }, { item: 'screws' }],
  vise_hand: [{ item: 'scrap_metal', count: 2 }, { item: 'spring' }, { item: 'sheet_metal' }, { item: 'screws' }],
  tool_hand: [{ item: 'scrap_metal', count: 2 }, { item: 'wire', count: 2 }, { item: 'spring' }, { item: 'electronics_scrap' }],
  servo_arm: [{ item: 'sheet_metal', count: 2 }, { item: 'motor' }, { item: 'wire', count: 2 }, { item: 'battery' }, { item: 'electronics_scrap' }],
  piston_arm: [{ item: 'pipe', count: 3 }, { item: 'scrap_metal', count: 4 }, { item: 'spring', count: 2 }, { item: 'steel_frame' }],
  coil_leg: [{ item: 'spring', count: 3 }, { item: 'sheet_metal', count: 2 }, { item: 'motor' }, { item: 'battery' }],
  lamp_optic: [{ item: 'lightbulb', count: 2 }, { item: 'wire' }, { item: 'battery' }, { item: 'glass_shard' }],
  ledger_optic: [{ item: 'electronics_scrap', count: 2 }, { item: 'lightbulb' }, { item: 'wire' }, { item: 'battery' }],
  trap_jaw: [{ item: 'spring', count: 2 }, { item: 'scrap_metal', count: 2 }, { item: 'screws' }],
  gantry_spine: [{ item: 'pipe', count: 4 }, { item: 'steel_frame' }, { item: 'wire', count: 2 }, { item: 'motor' }],
  plate_dermis: [{ item: 'sheet_metal', count: 6 }, { item: 'screws', count: 2 }, { item: 'leather_strips', count: 2 }],
};

/** the recipe for a part (only inputs the item catalogue knows) */
export function tableRecipe(partKey: string): TableInput[] {
  return (TABLE_RECIPES[partKey] || []).filter((i) => hasItemDef(i.item));
}
/** every part that has a recipe */
export const CRAFTABLE = CYBER_PARTS.filter((d) => TABLE_RECIPES[d.key]);

export interface CraftRow { item: string; name: string; need: number; have: number }
function pool(p: Player): Item[] {
  return p.allItems().filter((i) => !p.isWorn(i) && (i.cond > 0 || !itemDef(i.key).durability));
}
/** what the part needs against what you carry */
export function craftRows(p: Player, partKey: string): CraftRow[] {
  const items = pool(p);
  return tableRecipe(partKey).map((inp) => ({ item: inp.item, name: itemDef(inp.item).name, need: inp.count ?? 1, have: items.filter((i) => i.key === inp.item).length }));
}
export function canCraft(p: Player, partKey: string): boolean {
  const rows = craftRows(p, partKey);
  return rows.length > 0 && rows.every((r) => r.have >= r.need);
}
/** the pieces as item keys, one per item used (for the jig's layout) */
export function pieceKeys(partKey: string): string[] {
  const out: string[] = [];
  for (const inp of tableRecipe(partKey)) for (let i = 0; i < (inp.count ?? 1); i++) out.push(inp.item);
  return out;
}
/** take the pieces out of the pack and put the built part in; null when something is missing */
export function craftPart(p: Player, partKey: string): Item | null {
  const d = cyberDef(partKey);
  if (!d || !hasItemDef(d.item) || !canCraft(p, partKey)) return null;
  const items = pool(p);
  const used: Item[] = [];
  for (const inp of tableRecipe(partKey)) {
    const got = items.filter((i) => i.key === inp.item && !used.includes(i)).slice(0, inp.count ?? 1);
    used.push(...got);
  }
  for (const it of used) p.removeItem(it);
  const out = createItem(d.item);
  p.addItem(out);
  return out;
}

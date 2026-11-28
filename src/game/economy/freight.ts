// FREIGHT (round 27): valuables found in the runs count toward the facility only once they are TRANSPORTED home.
// The Remittance Press is the extraction point: beside DEPOSIT (the debt takes the load, src/game/debt/hopper.ts)
// it offers FREIGHT: the valuables the unit carries are crated in the press's hatch and go up the seam whole, to the
// lab's DELIVERY DOCK (src/ui/menus/lab/dock.ts), where they stand on the freight lift until the lattice spends
// them (src/game/nodeCost.ts). Freighted goods pay no debt: it is the operator's choice, run by run.
// The freight line has a CAPACITY per run (valuables shipped since the run began) and a SPEED (how long the hatch
// takes), and both are facility upgrades on the lattice's Transport branch (src/game/facilityTree.ts: the hand
// cart, the freight lift, the courier drone, the armoured van) through the facility stats 'freight' and 'courier'.
// Big valuables (the heavy ones: typewriters, silver sets, boomboxes) still have to be carried or carted to the
// press: the hand cart's 'storage' raises what a unit can carry.
//   freightCap()  freightLeft()  freightSecs(n)  shipValuables(p, items) -> n
//   dock()  dockCount(class)  takeFromDock(class, n) -> keys  dockUnseen()  markDockSeen()  valClassOf(key)
import { press } from './matter';
import { file, saveFile } from '../meridian';
import { bus } from '../../core/events';
import { itemDef, hasItemDef, type Item } from '../../items/item';
import { facilityBonuses } from '../facility';
import type { Player } from '../../entities/player';

export type ValClass = 'v_gold' | 'v_tech' | 'v_curio';
export const VAL_CLASS: Record<ValClass, { name: string; color: string; icon: string }> = {
  v_gold: { name: 'Gold', color: '#e8c050', icon: 'gold_watch' },
  v_tech: { name: 'Tech', color: '#7ad0e8', icon: 'circuit_board' },
  v_curio: { name: 'Curios', color: '#d8a8e8', icon: 'antique_figurine' },
};
export const VAL_KEYS = Object.keys(VAL_CLASS) as ValClass[];
/** a valuable's class: precious metal and cash, electronics and film, or the rest (antiques, glass, the strange) */
export function valClassOf(key: string): ValClass {
  const tags = hasItemDef(key) ? itemDef(key).tags ?? [] : [];
  if (/ring|chain|necklace|earring|brooch|watch|gold|silver_dollar|cash|coin|medal|jewel|lighter/.test(key) || tags.includes('gold') || tags.includes('jewelry')) return 'v_gold';
  if (/camcorder|boombox|circuit|copper|hard_drive|vhs|film|radio|tape|electr/.test(key) || itemDef(key)?.cat === 'electronics') return 'v_tech';
  return 'v_curio';
}
export const isValuable = (it: Item) => hasItemDef(it.key) && (itemDef(it.key).tags || []).includes('valuable');

export interface DockItem { k: string; c: ValClass; at: number; seen?: boolean }
interface FreightFile { dock: DockItem[]; run: number; sent: number; total: number }
function fr(): FreightFile {
  const p = press() as unknown as { fr?: FreightFile };
  const x = (p.fr && typeof p.fr === 'object' ? p.fr : (p.fr = { dock: [], run: -1, sent: 0, total: 0 })) as FreightFile;
  if (!Array.isArray(x.dock)) x.dock = [];
  x.dock = x.dock.filter((d) => d && typeof d.k === 'string');
  for (const d of x.dock) if (!VAL_CLASS[d.c]) d.c = valClassOf(d.k);
  if (!(x.total >= 0)) x.total = 0;
  return x;
}
const changed = () => { saveFile(); bus.emit('freightChanged', fr()); };

// ---------------------------------------------------------------- the line's capacity and speed (facility upgrades)
/** valuables the line takes per run: two by hand, more with each transport upgrade */
export const freightCap = () => 2 + Math.max(0, facilityBonuses().freight ?? 0);
/** the run the counter belongs to (a new run resets it) */
function runSent(): number { const f = fr(), r = file().runs ?? 0; if (f.run !== r) { f.run = r; f.sent = 0; } return f.sent; }
export const freightLeft = () => Math.max(0, freightCap() - runSent());
/** seconds the hatch takes to crate n valuables (the courier drone and the van make it quicker) */
export const freightSecs = (n: number) => Math.max(0.8, (1.2 + 0.9 * n) / (1 + 0.5 * Math.max(0, facilityBonuses().courier ?? 0)));

/** the unit's valuables crated and sent up the seam to the dock (as many as the line still takes this run) */
export function shipValuables(p: Player | null, items: Item[]): number {
  const vals = items.filter(isValuable).slice(0, freightLeft());
  if (!vals.length) return 0;
  const f = fr();
  runSent();
  for (const it of vals) {
    if (p && p.containerOf(it)) p.removeItem(it);
    f.dock.push({ k: it.key, c: valClassOf(it.key), at: Date.now() });
  }
  f.sent += vals.length; f.total += vals.length;
  changed();
  if (p) bus.emit('inventoryChanged', p);
  bus.emit('freighted', { n: vals.length, keys: vals.map((v) => v.key), by: p?.id ?? '' });
  return vals.length;
}

// ---------------------------------------------------------------- the dock (the lab's side)
export const dock = (): readonly DockItem[] => fr().dock;
export const dockCount = (c: ValClass) => fr().dock.filter((d) => d.c === c).length;
export const dockUnseen = () => fr().dock.filter((d) => !d.seen).length;
export function markDockSeen() { const f = fr(); if (!f.dock.some((d) => !d.seen)) return; for (const d of f.dock) d.seen = true; changed(); }
/** take n valuables of a class off the dock, the least valuable first; returns their keys */
export function takeFromDock(c: ValClass, n: number): string[] {
  const f = fr(), out: string[] = [];
  const val = (k: string) => (hasItemDef(k) ? itemDef(k).value ?? 0 : 0);
  const mine = f.dock.filter((d) => d.c === c).sort((a, b) => val(a.k) - val(b.k)).slice(0, n);
  for (const d of mine) { f.dock.splice(f.dock.indexOf(d), 1); out.push(d.k); }
  if (out.length) changed();
  return out;
}
/** dev / tests: a valuable straight onto the dock */
export function deliver(key: string) { const f = fr(); f.dock.push({ k: key, c: valClassOf(key), at: Date.now() }); f.total++; changed(); }
export const onFreight = (fn: () => void) => bus.on('freightChanged', fn);

// FABRICATION (round 20). The Remittance Press only TAKES now (feed it, it pays out). Making things moved to
// two machines the operator builds: in the lab (src/ui/menus/lab/stations.ts 'filament' and 'printer', the
// fab bay in the control room, src/ui/menus/fab) and, once their blueprints are researched, in a camp.
//   the FILAMENT MAKER   1 kg of one material (banked matter in the seam reservoir, or carried scrap at a camp)
//                        -> shred, melt, extrude, cool, spool -> one spool of filament of that material
//   the PRINTER          a researched pattern: its matter drawn off the spools kilo for kilo, plus dollars,
//                        printed layer by layer on its bed (the lab's go down the chute into the next run)
// Spools belong to the operator (the Meridian file, like the matter bank), so the lab's and a camp's machines
// share them. Saves from before have none: they start empty.
import { file, saveFile } from '../meridian';
import { bus } from '../../core/events';
import { MATS, banked, drawMatter, bankMatter, itemMatter, matterKg, type Mat, type Matter } from './matter';
import { dollars, spendDollars } from './money';
import type { Item } from '../../items/item';
import type { Player } from '../../entities/player';

/** kilos of filament on a full spool */
export const SPOOL_KG = 1;
/** the filament's own colour per material (the strand, the spool, a print on the bed) */
export const FILAMENT: Record<Mat, number> = {
  metal: 0xa8b0b8, polymer: 0x2ab4e8, fibre: 0xe8d49a, wood: 0xb0703a, mineral: 0x8adcc8, chem: 0xc8e832, organic: 0xd8484a, exotic: 0xb45aff,
};
export interface Spool { m: Mat; kg: number }
interface FabFile { spools: Spool[]; wound: number; printed: number }

export function fab(): FabFile {
  const f = file() as unknown as { fab?: FabFile };
  const x = (f.fab && typeof f.fab === 'object' ? f.fab : (f.fab = { spools: [], wound: 0, printed: 0 })) as FabFile;
  if (!Array.isArray(x.spools)) x.spools = [];
  x.spools = x.spools.filter((s) => s && MATS.some((m) => m.key === s.m) && s.kg > 0.0005);
  if (!(x.wound >= 0)) x.wound = 0;
  if (!(x.printed >= 0)) x.printed = 0;
  return x;
}
const changed = () => { saveFile(); bus.emit('fabChanged', fab()); };

export const spools = (): Spool[] => fab().spools;
export const spoolKg = (m: Mat) => spools().reduce((s, q) => s + (q.m === m ? q.kg : 0), 0);
export const spoolTotal = () => spools().reduce((s, q) => s + q.kg, 0);
/** can a print's matter be drawn off the spools */
export const spoolsCover = (m: Matter) => Object.entries(m).every(([k, v]) => spoolKg(k as Mat) + 1e-6 >= (v || 0));

/** draw a print's matter off the spools (the emptiest first) and pay its dollars; false when short */
export function drawSpools(m: Matter, cost: number): boolean {
  if (!spoolsCover(m) || dollars() < cost) return false;
  if (cost > 0 && !spendDollars(cost, 'print')) return false;
  const f = fab();
  for (const [k, v0] of Object.entries(m)) {
    let v = v0 || 0;
    const mine = f.spools.filter((s) => s.m === k).sort((a, b) => a.kg - b.kg);
    for (const s of mine) { if (v <= 0) break; const d = Math.min(s.kg, v); s.kg = Math.round((s.kg - d) * 1000) / 1000; v -= d; }
  }
  f.spools = f.spools.filter((s) => s.kg > 0.0005);
  f.printed++;
  changed();
  return true;
}

// ------------------------------------------------------------------ feedstock for the filament maker
const SCRAP_SHARE = 0.6;
/** carried things that are mostly one material (at a camp the hopper takes scrap from the pack) */
function scrapOf(p: Player | null | undefined, m: Mat): { it: Item; kg: number }[] {
  if (!p) return [];
  const out: { it: Item; kg: number }[] = [];
  for (const it of p.allItems()) {
    if (p.isWorn(it) || it.key === 'bailiff_band' || it.key === 'build_kit' || it.inv?.items.length) continue;
    const mm = itemMatter(it), tot = matterKg(mm), mine = mm[m] ?? 0;
    if (tot > 0.01 && mine / tot >= SCRAP_SHARE) out.push({ it, kg: tot });
  }
  return out.sort((a, b) => b.kg - a.kg);
}
/** kilos of one material the hopper can take: the bank (and, at a camp, the unit's scrap) */
export function feedKg(m: Mat, p?: Player | null): number {
  return banked(m) + scrapOf(p, m).reduce((s, q) => s + q.kg, 0);
}
/** the materials that can fill a spool right now */
export const feedable = (p?: Player | null): Mat[] => MATS.map((q) => q.key).filter((k) => feedKg(k, p) + 1e-6 >= SPOOL_KG);
/** take a spool's worth of one material into the hopper: the bank first, then carried scrap (any surplus is banked) */
export function takeFeed(m: Mat, p?: Player | null): boolean {
  if (feedKg(m, p) + 1e-6 < SPOOL_KG) return false;
  const fromBank = Math.min(banked(m), SPOOL_KG);
  if (fromBank > 0 && !drawMatter({ [m]: fromBank } as Matter, 0)) return false;
  let need = SPOOL_KG - fromBank;
  if (need > 1e-6 && p) {
    const extra: Matter = {};
    for (const s of scrapOf(p, m)) {
      if (need <= 1e-6) break;
      const mm = itemMatter(s.it);
      p.removeItem(s.it);
      need -= mm[m] ?? 0;
      // the rest of what it was made of goes down the seam: matter is kept
      for (const [k, v] of Object.entries(mm)) if (k !== m && v) (extra as Record<string, number>)[k] = ((extra as Record<string, number>)[k] ?? 0) + v;
    }
    if (need < -1e-6) (extra as Record<string, number>)[m] = -need;
    if (matterKg(extra) > 0) bankMatter(extra);
  }
  return true;
}
/** the spool came off the winder */
export function windSpool(m: Mat): Spool {
  const f = fab();
  const s: Spool = { m, kg: SPOOL_KG };
  f.spools.push(s);
  f.wound++;
  changed();
  bus.emit('spoolWound', { m });
  return s;
}
export const onFab = (fn: () => void) => bus.on('fabChanged', fn);

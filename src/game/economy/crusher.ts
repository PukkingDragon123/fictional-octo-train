// THE CRUSHER'S OUTPUTS (round 17). The press does not only pay: what it crushes
// leaves slag, and the slag comes back out of the front lip as materials by what
// the load was made of (its matter, src/game/economy/matter.ts): metal as scrap,
// wood as planks, fibre as rags, polymer as plastic, glass and stone as shards,
// organic as biomass, chemicals as reagent, anomalous matter as glow dust. About
// a third of the mass comes back, so feeding the slag back in runs dry.
// And sometimes it gives more: a JACKPOT (the payout doubled) or a RARE FIND (a
// part out of the seam that nobody put in). The host rolls; every peer plays it.
import type { Item } from '../../items/item';
import { hasItemDef } from '../../items/item';
import type { TileObject } from '../../world/zone';
import { itemMatter, objMatter, type Mat, type Matter } from './matter';

/** material -> what it comes back as, and the kilos one of those weighs */
export const SLAG: [Mat, string, number][] = [
  ['metal', 'scrap_metal', 0.8], ['wood', 'plank', 2.0], ['fibre', 'rag', 0.25], ['polymer', 'plastic_scrap', 0.3],
  ['mineral', 'glass_shard', 0.4], ['organic', 'biomass', 0.8], ['chem', 'chem_reagent', 0.4], ['exotic', 'glow_dust', 0.05],
];
export const SLAG_RATE = 0.33;
const CAP = 8;

/** expected outputs (fractional counts) for a load */
export function slagOf(items: Item[], objs: TileObject[] = []): Map<string, number> {
  const m: Matter = {};
  for (const it of items) itemMatter(it, m);
  for (const o of objs) objMatter(o, m);
  const out = new Map<string, number>();
  for (const [mat, key, kg] of SLAG) {
    const n = ((m[mat] ?? 0) * SLAG_RATE) / kg;
    if (n >= 0.05 && hasItemDef(key)) out.set(key, n);
  }
  return out;
}
/** the slag one load leaves: whole counts, the fractions rolled */
export function rollSlag(items: Item[], objs: TileObject[], rnd: () => number = Math.random): string[] {
  const out: string[] = [];
  for (const [key, n] of slagOf(items, objs)) {
    const k = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0);
    for (let i = 0; i < k && out.length < CAP; i++) out.push(key);
  }
  return out;
}
/** the short words for an expected yield ("2 Scrap Metal · ~Rag": ~ is a chance) */
export function slagWords(items: Item[], name: (k: string) => string, max = 2): string {
  const parts = [...slagOf(items)].sort((a, b) => b[1] - a[1]).map(([key, n]) => (n >= 0.95 ? `${Math.round(n)} ${name(key)}` : `~${name(key)}`));
  return parts.slice(0, max).join(' · ');
}

/** what the seam sometimes gives back that nobody put in */
const RARE: [string, number][] = [['gear', 3], ['relay_board', 2], ['motor', 1.2], ['blueprint_tube', 1.2], ['blueprint_sheet', 2.5], ['glow_dust', 1.5], ['steel_frame', 1.5], ['spring', 3]];
export interface Jackpot { kind: 'double' | 'rare'; bonus: number; drop?: string }
/** one roll per pull: about one in ten pays */
export function rollJackpot(credit: number, items: number, rnd: () => number = Math.random): Jackpot | null {
  const chance = Math.min(0.16, 0.06 + items * 0.01);
  if (rnd() >= chance) return null;
  if (credit > 0 && rnd() < 0.55) return { kind: 'double', bonus: Math.max(10, Math.round(credit)) };
  let tot = 0; for (const [k, w] of RARE) if (hasItemDef(k)) tot += w;
  let r = rnd() * tot;
  for (const [k, w] of RARE) { if (!hasItemDef(k)) continue; r -= w; if (r <= 0) return { kind: 'rare', bonus: 0, drop: k }; }
  return null;
}

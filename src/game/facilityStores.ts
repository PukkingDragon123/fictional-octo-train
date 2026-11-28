// THE WING'S STORES (round 26, part B): the furniture and the finishes a room can be given, as data: what each
// costs (dollars and matter) and the facility stats it raises (src/game/facility.ts FacilityStat; what those do
// in the runs: src/game/facilityFx.ts). Light on imports, so the effects can register it early; the paying is
// round 26's build mode (retired in round 27), the models src/ui/menus/front/build/models.ts (the lab hub's upgrades use them).
import { ROOMS, registerFurniture, furnitureResolver, type Bonuses, type RoomFinish, type RoomId } from './facility';

/** the debris a derelict room holds (the pieces the player carries into the skip) */
export const debrisCount = (id: RoomId) => 7 + (ROOMS.findIndex((d) => d.id === id) % 3);

/** dollars and matter (kg per material: src/game/economy/matter.ts Mat) */
export interface Cost { $: number; m?: Partial<Record<'metal' | 'polymer' | 'fibre' | 'wood' | 'mineral' | 'chem' | 'organic' | 'exotic', number>> }
type Matter = Cost['m'];

export type Layer = 'floor' | 'wall' | 'rug';
export interface FurnSpec {
  kind: string; name: string; stats: Bonuses; cost: Cost; cat: 'furniture' | 'decor' | 'zoo' | 'museum'; layer: Layer; w: number; d: number;
  /** small enough to stand on a desk, a shelf, a counter (build mode stacks it on whatever surface is under it) */
  small?: boolean;
  /** the Institute's prestige it waits for (a higher tier of the stores) */
  prestige?: number;
}
const F = (kind: string, name: string, stats: Bonuses, $: number, m: Matter | undefined, w: number, d: number, cat: FurnSpec['cat'] = 'furniture', layer: Layer = 'floor'): FurnSpec =>
  ({ kind, name, stats, cost: { $, m }, cat, layer, w, d });
/** the stores: footprints in metres (w across, d deep, before turning) */
export const FURN: FurnSpec[] = [
  F('bunk', 'Bunk bed', { rest: 3 }, 40, undefined, 1.0, 2.0),
  F('cot', 'Field cot', { rest: 1 }, 15, undefined, 0.75, 2.0),
  F('hospbed', 'Hospital bed', { health: 2, rest: 1 }, 70, { metal: 4, fibre: 1 }, 1.0, 2.0),
  F('medcab', 'Medical cabinet', { health: 3 }, 60, { metal: 2, chem: 1 }, 1.0, 0.5),
  F('workbench', 'Workbench', { craft: 3 }, 50, { wood: 4, metal: 2 }, 1.5, 0.75),
  F('toolchest', 'Tool chest', { craft: 1 }, 25, { metal: 1 }, 1.0, 0.5),
  F('welder', 'Welding cart', { craft: 2 }, 45, { metal: 3, chem: 1 }, 0.75, 0.75),
  F('hydro', 'Hydro rack', { yield: 3 }, 60, { polymer: 3, chem: 1 }, 1.0, 1.0),
  F('planter', 'Planter', { yield: 1 }, 20, undefined, 1.0, 1.0),
  F('armoury', 'Armoury rack', { melee: 3 }, 70, { metal: 5 }, 1.25, 0.5),
  F('crtbank', 'CRT bank', { scan: 3 }, 80, { metal: 2, polymer: 2, mineral: 2 }, 1.0, 1.0),
  F('labbench', 'Lab bench', { research: 2 }, 60, { mineral: 2, metal: 2 }, 1.0, 1.0),
  F('bookshelf', 'Bookshelf', { research: 1, sanity: 1 }, 30, undefined, 1.0, 0.5),
  F('shelves', 'Steel shelving', { storage: 2 }, 30, { metal: 2 }, 1.0, 0.5),
  F('cart', 'Storage cart', { storage: 1 }, 20, undefined, 0.75, 1.25),
  F('filing', 'Filing cabinet', { storage: 1, research: 1 }, 25, undefined, 0.5, 0.75),
  F('sofa', 'Sofa', { morale: 2, rest: 1 }, 45, { fibre: 2 }, 2.0, 1.0),
  F('armchair', 'Armchair', { morale: 1, rest: 1 }, 25, undefined, 1.0, 1.0),
  F('table', 'Mess table', { morale: 1 }, 25, undefined, 1.0, 1.0),
  F('vending', 'Vending machine', { morale: 1, income: 1 }, 55, { metal: 3, polymer: 2 }, 1.0, 0.75),
  F('fridge', 'Fridge', { health: 1, morale: 1 }, 40, { metal: 2 }, 1.0, 0.75),
  F('radio', 'Radio set', { morale: 1, sanity: 1 }, 20, undefined, 0.75, 0.75),
  F('lamp', 'Floor lamp', { sanity: 1 }, 15, undefined, 0.5, 0.5),
  // decor: prints on the walls (public/art/print), plants (the farm's crops), rugs
  F('print_focus', 'Print: Focus', { morale: 1 }, 8, undefined, 0.75, 0.1, 'decor', 'wall'),
  F('print_calm', 'Print: Stay calm', { sanity: 1 }, 8, undefined, 0.75, 0.1, 'decor', 'wall'),
  F('print_kind', 'Print: Be kind', { morale: 1 }, 8, undefined, 0.75, 0.1, 'decor', 'wall'),
  F('print_specimen', 'Print: Specimen', { research: 1 }, 10, undefined, 0.75, 0.1, 'decor', 'wall'),
  F('chart', 'Anatomy chart', { health: 1 }, 10, undefined, 0.75, 0.1, 'decor', 'wall'),
  F('plant', 'Potted plant', { sanity: 1 }, 12, undefined, 0.5, 0.5, 'decor'),
  F('plant_tall', 'Tall plant', { sanity: 1, morale: 1 }, 20, undefined, 0.5, 0.5, 'decor'),
  F('rug_kilim', 'Kilim rug', { morale: 1 }, 15, undefined, 1.5, 2.0, 'decor', 'rug'),
  F('rug_runner', 'Wool runner', { rest: 1 }, 18, undefined, 1.0, 2.5, 'decor', 'rug'),
  F('rug_mat', 'Rubber mat', { craft: 1 }, 10, undefined, 1.5, 1.0, 'decor', 'rug'),
  // small things that stand on surfaces, and more for the walls
  { ...F('radio_s', 'Wireless', { morale: 1 }, 12, undefined, 0.5, 0.25, 'decor'), small: true },
  { ...F('microscope', 'Microscope', { research: 1 }, 30, { mineral: 1 }, 0.25, 0.25, 'decor'), small: true },
  { ...F('kettle', 'Kettle', { morale: 1 }, 8, undefined, 0.25, 0.25, 'decor'), small: true },
  { ...F('chemset', 'Glassware', { research: 1 }, 20, undefined, 0.5, 0.25, 'decor'), small: true },
  { ...F('bunsen', 'Burner', { craft: 1 }, 10, undefined, 0.25, 0.25, 'decor'), small: true },
  { ...F('plant_s', 'Cutting', { sanity: 1 }, 6, undefined, 0.25, 0.25, 'decor'), small: true },
  { ...F('toolbox_s', 'Toolbox', { craft: 1 }, 15, undefined, 0.5, 0.25, 'decor'), small: true },
  F('lamp_w', 'Wall lamp', { sanity: 1 }, 12, undefined, 0.5, 0.1, 'decor', 'wall'),
  F('clock_w', 'Wall clock', { morale: 1 }, 10, undefined, 0.5, 0.1, 'decor', 'wall'),
  F('shelf_w', 'Wall shelf', { storage: 1 }, 12, undefined, 1.0, 0.1, 'decor', 'wall'),
];
// the stores' higher tiers wait for the Institute's prestige
const TIER_P: Record<string, number> = { hospbed: 4, hydro: 4, crtbank: 6, labbench: 6, vending: 8, armoury: 10, welder: 4 };
for (const f of FURN) if (TIER_P[f.kind]) f.prestige = TIER_P[f.kind];
export const FURN_BY = new Map(FURN.map((f) => [f.kind, f]));
for (const f of FURN) registerFurniture({ kind: f.kind, name: f.name, stats: f.stats });

// ---------------------------------------------------------------- the zoo and the museum of the liminal
/** an inhabitant that can live in an exhibit enclosure: its threat (prestige), its height (how it fits), its habitat */
export interface ZooSp { key: string; name: string; threat: number; h: number; hab: 'carpet' | 'straw' | 'moss' | 'tile' | 'water' | 'paper'; mod: string }
export const ZOO: ZooSp[] = [
  { key: 'moon_calf', name: 'Moon Calf', threat: 0, h: 0.85, hab: 'straw', mod: 'moon_calf' },
  { key: 'pale_hen', name: 'Pale Hen', threat: 0, h: 0.52, hab: 'straw', mod: 'pale_hen' },
  { key: 'hum_possum', name: 'Hum Possum', threat: 0, h: 0.36, hab: 'carpet', mod: 'hum_possum' },
  { key: 'lumenmoth', name: 'Lumenmoth', threat: 0, h: 0.4, hab: 'moss', mod: 'lumenmoth' },
  { key: 'tallow_pigeon', name: 'Tallow Pigeon', threat: 0, h: 0.32, hab: 'tile', mod: 'tallow_pigeon' },
  { key: 'plushkin', name: 'Plushkin', threat: 0, h: 0.42, hab: 'carpet', mod: 'plushkin' },
  { key: 'carpet_grub', name: 'Carpet Grub', threat: 0, h: 0.16, hab: 'carpet', mod: 'carpet_grub' },
  { key: 'paper_grazer', name: 'Paper Grazer', threat: 0, h: 0.08, hab: 'paper', mod: 'paper_grazer' },
  { key: 'spore_rat', name: 'Spore Rat', threat: 2, h: 0.25, hab: 'moss', mod: 'spore_rat' },
  { key: 'parasite_salamander', name: 'Salamander', threat: 3, h: 0.3, hab: 'water', mod: 'salamander' },
  { key: 'stilt_gull', name: 'Stilt Gull', threat: 3, h: 1.8, hab: 'water', mod: 'stilt_gull' },
  { key: 'whip_rat', name: 'Whip Rat', threat: 4, h: 1.4, hab: 'tile', mod: 'whip_rat' },
  { key: 'battering_hare', name: 'Battering Hare', threat: 4, h: 3.6, hab: 'carpet', mod: 'battering_hare' },
  { key: 'gaunt_wolf', name: 'Gaunt Wolf', threat: 5, h: 5.6, hab: 'moss', mod: 'gaunt_wolf' },
];
export const ZOO_BY = new Map(ZOO.map((z) => [z.key, z]));
/** an exhibit's kind: 'encl:<inhabitant>' (an enclosure), 'jar:<inhabitant>' (a specimen), 'case:<item>' (a find in a case) */
export function exhibitSpec(kind: string): FurnSpec | undefined {
  const [pre, key] = kind.split(':');
  if (!key) return undefined;
  if (pre === 'encl') {
    const z = ZOO_BY.get(key); if (!z) return undefined;
    return { kind, name: z.name, cat: 'zoo', layer: 'floor', w: 2.0, d: 1.5, prestige: z.threat >= 4 ? 30 : z.threat >= 3 ? 15 : 0, cost: { $: 60 + 35 * z.threat, m: { mineral: 3, metal: 3 + z.threat } }, stats: { prestige: 3 + 2 * z.threat, income: 1 + z.threat, research: 1, morale: 1 } };
  }
  if (pre === 'jar') {
    const z = ZOO_BY.get(key); if (!z) return undefined;
    return { kind, name: z.name, cat: 'museum', layer: 'floor', w: 0.5, d: 0.5, small: true, cost: { $: 20 + 5 * z.threat, m: { mineral: 1, chem: 1 } }, stats: { prestige: 2 + z.threat, research: 2 } };
  }
  if (pre === 'case') return { kind, name: key.replace(/_/g, ' '), cat: 'museum', layer: 'floor', w: 0.75, d: 0.75, cost: { $: 25, m: { mineral: 1, wood: 1 } }, stats: { prestige: 2, income: 1, research: 1 } };
  return undefined;
}
furnitureResolver((kind) => exhibitSpec(kind));
export const furnSpec = (kind: string) => FURN_BY.get(kind) ?? exhibitSpec(kind);
/** a room's purpose by what is in it: a containment wing (enclosures), a museum hall (cases and specimens), or its own */
export function purposeOf(kinds: string[]): 'zoo' | 'museum' | null {
  const e = kinds.filter((k) => k.startsWith('encl:')).length, m = kinds.filter((k) => k.startsWith('case:') || k.startsWith('jar:')).length;
  if (e && e * 2 >= m) return 'zoo';
  if (m >= 2) return 'museum';
  return null;
}

export type FinishPart = keyof RoomFinish;
export interface FinishSpec { key: string; part: FinishPart; name: string; cost: Cost; color: number; mat: string }
const W = (key: string, name: string, mat: string, color: number, $: number, m?: Matter): FinishSpec => ({ key, part: 'wall', name, mat, color, cost: { $, m } });
const FL = (key: string, name: string, mat: string, color: number, $: number, m?: Matter): FinishSpec => ({ key, part: 'floor', name, mat, color, cost: { $, m } });
const L = (key: string, name: string, color: number): FinishSpec => ({ key, part: 'light', name, mat: 'lamp', color, cost: { $: 5 } });
/** mat: the surface's material (src/ui/menus/scene/pixtex.ts keys, or the build kit's own: wallpaper, carpet, parquet) */
export const FINISHES: FinishSpec[] = [
  W('w_cream', 'Cream paint', 'paint', 0xd8ceb0, 10), W('w_green', 'Institute green', 'paint', 0x6a8a5a, 10), W('w_blue', 'Slate blue', 'paint', 0x6a7a92, 10),
  W('w_oxblood', 'Oxblood', 'paint', 0x8a3a30, 12), W('w_tile', 'White tile', 'tile', 0xd8e0d8, 25), W('w_paper', 'Damask paper', 'wallpaper', 0xb8a070, 20),
  W('w_stripe', 'Stripe paper', 'stripe', 0x8a9a78, 20), W('w_panel', 'Oak panel', 'wood', 0x9a7048, 30),
  FL('f_lino', 'Lino', 'floor', 0x8a8676, 12), FL('f_check', 'Checker tile', 'check', 0xd8d4c4, 25), FL('f_carpet', 'Red carpet', 'carpet', 0x8a3028, 25),
  FL('f_carpetb', 'Blue carpet', 'carpet', 0x3a4a6a, 25), FL('f_parquet', 'Parquet', 'parquet', 0xa87a4a, 30), FL('f_concrete', 'Sealed concrete', 'concrete', 0x9a968c, 10),
  L('l_warm', 'Warm light', 0xffd8a8), L('l_neutral', 'Neutral light', 0xfff2e2), L('l_cool', 'Daylight', 0xe2ecff), L('l_sodium', 'Sodium', 0xffb878),
];
export const FINISH_BY = new Map(FINISHES.map((f) => [f.key, f]));
export const finishSpec = (key: string | undefined) => (key ? FINISH_BY.get(key) : undefined);

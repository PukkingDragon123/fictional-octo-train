// THE FACILITY DECK (round 27): the facility is upgraded the way the unit is, on the research lattice. A third deck
// beside the trades and the lab's research (src/ui/menus/research/lattice.ts), five branches of facility upgrades:
//   The Lab      stations (a lab bench, a CRT bank, steel shelving) and fittings (daylight troughs, epoxy floors)
//   Quarters     cots and bunks, the infirmary (a medical cabinet, a hospital bed), a vending machine
//   Workshop     a tool chest, the workbench, a welding cart, the armoury rack, a hydro rack
//   The Wing     the containment and museum wing: specimen jars, display cases, the museum hall, a zoo enclosure
//   Transport    the freight line (src/game/economy/freight.ts): a hand cart, the freight lift, a courier drone,
//                the armoured van: each step takes more valuables home per run, or crates them faster
// Every node costs RP and STORES (src/game/nodeCost.ts: matter off the press's bank, delivered valuables off the
// dock), like a crafting recipe. What a node does is facility stat points (src/game/facility.ts FacilityStat), a
// bonus source of the facility, so src/game/facilityFx.ts turns them into the multipliers the game already reads
// (talentMul / profMul: rest -> tiredness, health -> healing, craft -> the bench, ...; storage -> carry; freight and
// courier -> the freight line). A researched upgrade also stands in the lab hub (src/ui/menus/lab/upgrades.ts): its
// prop rises out of the floor in the room it belongs to, the lights and the floors improve.
//   FAC_NODES / facNode(key) / facRank(key)    FAC_BRANCHES    facStats() (the summed bonuses)
import { bus } from '../core/events';
import { treeCategory, treeOffer } from './treeData';
import { hasUnlock } from './research';
import { setNodeCost, type CostLine } from './nodeCost';
import { bonusSource, type Bonuses, type FacilityStat } from './facility';

export type HubRoom = 'research' | 'archive' | 'monitor' | 'subject';
export interface FacNode {
  key: string; branch: string; lane: string; title: string; desc: string;
  /** per rank: RP, the stores, the facility stats it adds, one line of what it gives */
  rp: number[]; cost: CostLine[][]; stats: Bonuses[]; gives: string[];
  requires?: string[];
  /** what stands in the lab hub once it is researched (model kinds: src/ui/menus/lab/hubModels.ts), and where */
  props?: string[]; room?: HubRoom;
  /** a fitting instead: brighter lights, polished floors (every lab room) */
  fit?: 'light' | 'floor';
  /** the exhibit on the lattice and in the preview: a model kind (as props), or item keys */
  show: string;
}
export const FAC_BRANCHES = [
  { key: 'f_lab', name: 'The Lab', sub: 'stations · lights · floors', code: 'LAB', icon: 'crt' },
  { key: 'f_quarters', name: 'Quarters', sub: 'bunks · infirmary · canteen', code: 'QTR', icon: 'bunk' },
  { key: 'f_works', name: 'Workshop', sub: 'benches · armoury · grow racks', code: 'WKS', icon: 'wrench' },
  { key: 'f_wing', name: 'The Wing', sub: 'containment · zoo · museum', code: 'WNG', icon: 'vitrine' },
  { key: 'f_freight', name: 'Transport', sub: 'carts · freight lift · drone · van', code: 'FRT', icon: 'crate' },
] as const;
export const isFacBranch = (b: string) => b.startsWith('f_');

const c = (o: Partial<Record<CostLine['r'], number>>): CostLine[] => Object.entries(o).map(([r, n]) => ({ r: r as CostLine['r'], n: n as number }));
export const FAC_NODES: FacNode[] = [
  // ---- the lab
  { key: 'fl_bench', branch: 'f_lab', lane: 'Stations', title: 'Lab Bench', desc: 'A tiled bench with its own glassware and a gas tap: method, not improvisation.', rp: [2], cost: [c({ metal: 2, mineral: 1, v_tech: 1 })], stats: [{ research: 2 }], gives: ['+4% research points'], props: ['labbench'], room: 'research', show: 'labbench' },
  { key: 'fl_crt', branch: 'f_lab', lane: 'Stations', title: 'CRT Bank', desc: 'Four more tubes on the booth\'s desk: every camera, every corridor.', rp: [4], cost: [c({ metal: 3, polymer: 2, mineral: 2, v_tech: 1 })], stats: [{ scan: 3 }], gives: ['scanner +9%, more finds in the codex'], requires: ['fl_bench'], props: ['crtbank'], room: 'archive', show: 'crtbank' },
  { key: 'fl_shelves', branch: 'f_lab', lane: 'Stations', title: 'Steel Shelving', desc: 'Racks for what comes back: nothing lost under a bench again.', rp: [2], cost: [c({ metal: 2 })], stats: [{ storage: 2 }], gives: ['+1 kg carried'], props: ['shelves'], room: 'archive', show: 'shelves' },
  { key: 'fl_light', branch: 'f_lab', lane: 'Fittings', title: 'Daylight Troughs', desc: 'New tubes and white reflectors in every room of the lab.', rp: [2, 4], cost: [c({ metal: 1, mineral: 2 }), c({ metal: 2, mineral: 3, v_gold: 1 })], stats: [{ sanity: 1 }, { sanity: 2 }], gives: ['brighter rooms · panic 2% lower', 'daylight · panic 6% lower'], fit: 'light', show: 'trough' },
  { key: 'fl_floor', branch: 'f_lab', lane: 'Fittings', title: 'Epoxy Floors', desc: 'The cracked tile ground flat and sealed under a clear coat.', rp: [3], cost: [c({ chem: 2, polymer: 1, v_curio: 1 })], stats: [{ morale: 2 }], gives: ['stress and boredom 4% slower'], requires: ['fl_light'], fit: 'floor', show: 'epoxy' },
  // ---- quarters
  { key: 'fq_cot', branch: 'f_quarters', lane: 'Bunks', title: 'Field Cots', desc: 'Canvas on a steel frame: somewhere to lie down that is not the floor.', rp: [1], cost: [c({ fibre: 1, metal: 1 })], stats: [{ rest: 1 }], gives: ['tiredness 3% slower'], props: ['cot'], room: 'archive', show: 'cot' },
  { key: 'fq_bunk', branch: 'f_quarters', lane: 'Bunks', title: 'Bunk Beds', desc: 'Sprung bunks with real mattresses, two to a frame.', rp: [3], cost: [c({ metal: 2, fibre: 2, v_gold: 1 })], stats: [{ rest: 3 }], gives: ['tiredness 9% slower'], requires: ['fq_cot'], props: ['bunk'], room: 'archive', show: 'bunk' },
  { key: 'fq_medcab', branch: 'f_quarters', lane: 'Infirmary', title: 'Medical Cabinet', desc: 'Sutures, splints and a lock on the morphine.', rp: [2], cost: [c({ metal: 1, chem: 1, v_curio: 1 })], stats: [{ health: 3 }], gives: ['wounds heal 9% faster'], props: ['medcab'], room: 'subject', show: 'medcab' },
  { key: 'fq_hospbed', branch: 'f_quarters', lane: 'Infirmary', title: 'Hospital Bed', desc: 'A ward bed with rails and a drip stand.', rp: [5], cost: [c({ metal: 3, fibre: 1, chem: 1, v_gold: 1 })], stats: [{ health: 2, rest: 1 }], gives: ['healing +6%, tiredness 3% slower'], requires: ['fq_medcab'], props: ['hospbed'], room: 'research', show: 'hospbed' },
  { key: 'fq_vend', branch: 'f_quarters', lane: 'Canteen', title: 'Vending Machine', desc: 'Lit, humming, stocked with things in wrappers.', rp: [3], cost: [c({ metal: 2, polymer: 1, v_gold: 1 })], stats: [{ morale: 1, income: 1 }], gives: ['stress 2% slower, the press pays 2% more'], props: ['vending'], room: 'archive', show: 'vending' },
  // ---- the workshop
  { key: 'fw_tools', branch: 'f_works', lane: 'The bench', title: 'Tool Chest', desc: 'A red chest of drawers: every spanner in its place.', rp: [1], cost: [c({ metal: 1 })], stats: [{ craft: 1 }], gives: ['crafting 3% faster'], props: ['toolchest'], room: 'subject', show: 'toolchest' },
  { key: 'fw_bench', branch: 'f_works', lane: 'The bench', title: 'Workbench', desc: 'A heavy beech top on welded legs, a vice at one end.', rp: [3], cost: [c({ wood: 3, metal: 2, v_tech: 1 })], stats: [{ craft: 3 }], gives: ['crafting 9%, building 6% faster'], requires: ['fw_tools'], props: ['workbench'], room: 'subject', show: 'workbench' },
  { key: 'fw_welder', branch: 'f_works', lane: 'The bench', title: 'Welding Cart', desc: 'Bottles, a regulator, a mask on a hook.', rp: [5], cost: [c({ metal: 3, chem: 2, v_tech: 1 })], stats: [{ craft: 2 }], gives: ['crafting 6% faster'], requires: ['fw_bench'], props: ['welder'], room: 'subject', show: 'welder' },
  { key: 'fw_armoury', branch: 'f_works', lane: 'Armoury', title: 'Armoury Rack', desc: 'The Institute\'s own weapons, hung and oiled.', rp: [4], cost: [c({ metal: 4, wood: 1, v_gold: 1 })], stats: [{ melee: 3 }], gives: ['melee +6%'], props: ['armoury'], room: 'subject', show: 'armoury' },
  { key: 'fw_hydro', branch: 'f_works', lane: 'Armoury', title: 'Hydro Rack', desc: 'Lit trays of the farm\'s crops, roots in a nutrient film.', rp: [4], cost: [c({ polymer: 2, chem: 1, organic: 1, v_curio: 1 })], stats: [{ yield: 3 }], gives: ['harvests +12%'], props: ['hydro'], room: 'archive', show: 'hydro' },
  // ---- the wing: containment, the zoo, the museum of the liminal
  { key: 'fz_jars', branch: 'f_wing', lane: 'Containment', title: 'Specimen Jars', desc: 'What the units bring back, in alcohol, labelled.', rp: [2], cost: [c({ mineral: 1, chem: 1 })], stats: [{ research: 2 }], gives: ['+4% research points'], props: ['jar:spore_rat'], room: 'archive', show: 'jar:spore_rat' },
  { key: 'fz_encl', branch: 'f_wing', lane: 'Containment', title: 'Zoo Enclosure', desc: 'Glass, straw, a feeding hatch: an inhabitant kept and shown.', rp: [6], cost: [c({ mineral: 3, metal: 3, v_curio: 1, v_gold: 1 })], stats: [{ prestige: 3, income: 1, morale: 1, research: 1 }], gives: ['the press pays 5% more, research +2%'], requires: ['fz_jars'], props: ['encl:moon_calf'], room: 'archive', show: 'encl:moon_calf' },
  { key: 'fz_case', branch: 'f_wing', lane: 'Museum', title: 'Display Case', desc: 'A find under glass, lit from inside.', rp: [3], cost: [c({ mineral: 2, wood: 1, v_curio: 1 })], stats: [{ prestige: 2, income: 1, research: 1 }], gives: ['the press pays 4% more'], props: ['case:gold_watch'], room: 'archive', show: 'case:gold_watch' },
  { key: 'fz_hall', branch: 'f_wing', lane: 'Museum', title: 'Museum Hall', desc: 'A row of cases: the Institute\'s museum of the liminal opens.', rp: [6], cost: [c({ mineral: 3, wood: 2, v_curio: 2, v_gold: 1 })], stats: [{ prestige: 4, income: 2 }], gives: ['the press pays 8% more'], requires: ['fz_case'], props: ['case:porcelain_doll', 'case:camcorder'], room: 'archive', show: 'case:porcelain_doll' },
  // ---- transport: the freight line from the press to the dock
  { key: 'ft_cart', branch: 'f_freight', lane: 'The line', title: 'Hand Cart', desc: 'A flatbed trolley: the big pieces go to the press on wheels.', rp: [1], cost: [c({ metal: 2, wood: 1 })], stats: [{ freight: 1, storage: 4 }], gives: ['+1 valuable home per run, +2 kg carried'], props: ['cart'], room: 'archive', show: 'cart' },
  { key: 'ft_lift', branch: 'f_freight', lane: 'The line', title: 'Freight Lift', desc: 'A caged lift up the seam to the dock: crates, not pockets.', rp: [4], cost: [c({ metal: 4, polymer: 1, v_tech: 1 })], stats: [{ freight: 2 }], gives: ['+2 valuables home per run'], requires: ['ft_cart'], props: ['lift'], room: 'archive', show: 'lift' },
  { key: 'ft_drone', branch: 'f_freight', lane: 'The line', title: 'Courier Drone', desc: 'Four rotors and a sling: it meets the unit at the press.', rp: [6], cost: [c({ polymer: 2, metal: 2, chem: 1, v_tech: 2 })], stats: [{ courier: 2, freight: 1 }], gives: ['the hatch crates twice as fast, +1 per run'], requires: ['ft_lift'], props: ['drone'], room: 'archive', show: 'drone' },
  { key: 'ft_van', branch: 'f_freight', lane: 'The line', title: 'Armoured Van', desc: 'Plate steel, a strongbox welded in the back.', rp: [10], cost: [c({ metal: 8, polymer: 2, chem: 2, v_gold: 2 })], stats: [{ freight: 4, courier: 1 }], gives: ['+4 valuables home per run, faster still'], requires: ['ft_drone'], props: ['van'], room: 'archive', show: 'van' },
];
const BY = new Map(FAC_NODES.map((n) => [n.key, n]));
export const facNode = (key: string) => BY.get(key.replace(/~\d+$/, ''));
const rankKey = (k: string, r: number) => (r <= 1 ? k : `${k}~${r}`);
/** ranks of a facility node researched */
export function facRank(key: string): number { const d = BY.get(key); if (!d) return 0; let r = 0; for (let i = 1; i <= d.rp.length; i++) if (hasUnlock(rankKey(key, i))) r = i; else break; return r; }

FAC_BRANCHES.forEach((b, i) => treeCategory({ key: b.key, name: b.name, sub: b.sub, code: b.code, order: 200 + i }));
for (const d of FAC_NODES) {
  treeOffer({ key: d.key, category: d.branch, lane: d.lane, title: d.title, desc: d.desc, cost: d.rp, requires: d.requires, item: 'furn:' + d.show, gives: d.gives, ranks: d.rp.length });
  d.cost.forEach((l, i) => setNodeCost(rankKey(d.key, i + 1), l));
}

let cache: Bonuses | null = null;
bus.on('researchUnlocked', (k: string) => { if (facNode(String(k))) { cache = null; bus.emit('facilityChanged', null); } });
/** the stats every researched facility upgrade adds */
export function facStats(): Bonuses {
  if (cache) return cache;
  const out: Bonuses = {};
  for (const d of FAC_NODES) { const r = facRank(d.key); for (let i = 0; i < r; i++) for (const [s, v] of Object.entries(d.stats[i] ?? {}) as [FacilityStat, number][]) out[s] = (out[s] ?? 0) + v; }
  return (cache = out);
}
bonusSource(facStats);
/** the lab hub's fittings: the daylight troughs' rank (0..2), the epoxy floors (0..1) */
export const fitLevel = (f: 'light' | 'floor') => { const d = FAC_NODES.find((n) => n.fit === f); return d ? facRank(d.key) : 0; };

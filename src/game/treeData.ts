// WHAT THE LAB'S RESEARCH LATTICE OFFERS, AS DATA. The control room's 3D skill
// tree (src/ui/menus/research/lattice.ts, data in src/game/unitTree.ts) lists
// everything research can buy: unit designs, recipes, building pieces, device
// upgrades, chips, limbs. Any module registers more here, at load time or later
// (the lattice re-reads it each time it is opened); no UI code needed.
//
//   treeCategory({ key: 'farm', name: 'Farming', sub: 'plants · fungus · livestock', code: 'FRM', order: 35 })
//   treeOffer({ key: 'bp_planter', category: 'build', lane: 'Base pieces', title: 'Planter Box', cost: 3,
//               desc: 'A soil box for crops.', requires: ['bp_spikes'], item: 'planter_box', gives: 'blueprint: Planter Box' })
//
// An offer's key is its research node key (src/game/research.ts): if no node by
// that key exists yet one is defined from the offer (branch = the category), so
// the game's own unlock checks (hasUnlock('bp_planter')) see the purchase. An
// offer with ranks > 1 buys '<key>', '<key>~2', ... in turn. item: an item key
// whose 3D model turns on the node's shelf (any item with a model works).
// Research nodes registered with defNode() and placed nowhere else also appear,
// sorted into a category by their branch: blueprint/build/base -> 'build';
// device/scanner/map/machine/upgrade/tool/tame -> 'device'; recipe/craft/cook -> 'recipe';
// any other branch gets a category of its own.
// Built-in categories: design (DSN), recipe (RCP), build (BLD), device (DEV), chip (CHP), limb (LMB).

export interface TreeCategory {
  key: string;
  name: string;
  /** one line under the name (the ticker shows it) */
  sub: string;
  /** three letters on the console key and the ticker */
  code: string;
  /** sort order on the lattice (design 0, recipe 10, build 20, device 30, chip 40, limb 50) */
  order?: number;
}
export interface TreeOffer {
  /** the research node key bought (rank 1) */
  key: string;
  /** the branch it sits on: a category key */
  category: string;
  /** the lane (row) on that branch; lanes appear in the order they are first used */
  lane?: string;
  title: string;
  desc?: string;
  /** RP per rank (a number for one rank) */
  cost: number | number[];
  /** research node keys or tree node keys that must be owned first */
  requires?: string[];
  /** the item whose 3D model is the node's exhibit */
  item?: string;
  /** fallbacks if that item has no model */
  alt?: string[];
  /** per rank: one line of what it gives */
  gives?: string | string[];
  ranks?: number;
}

const CATS = new Map<string, TreeCategory>();
const OFFERS = new Map<string, TreeOffer>();
let version = 0;

export function treeCategory(c: TreeCategory) { CATS.set(c.key, { ...CATS.get(c.key), ...c }); version++; }
export function treeOffer(o: TreeOffer) { OFFERS.set(o.key, o); version++; }
export function treeOffers(o: TreeOffer[]) { for (const q of o) OFFERS.set(q.key, q); version++; }
export const treeCategories = () => [...CATS.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
export const treeOfferList = () => [...OFFERS.values()];
/** bumps whenever anything is registered (the lattice rebuilds what changed) */
export const treeDataVersion = () => version;

/** which category a research node's branch belongs on */
export function categoryFor(branch: string): string {
  const b = branch.toLowerCase();
  if (/^(blueprint|build|base|struct|piece)/.test(b)) return 'build';
  if (/^(device|scanner|scan|map|machine|upgrade|tool|tame|watch|lamp)/.test(b)) return 'device';
  if (/^(recipe|craft|cook|food)/.test(b)) return 'recipe';
  return b;
}

treeCategory({ key: 'design', name: 'Unit designs', sub: 'dyes · visors · helmets · kit', code: 'DSN', order: 0 });
treeCategory({ key: 'recipe', name: 'Recipes', sub: 'crafting and cooking for the runs', code: 'RCP', order: 10 });
treeCategory({ key: 'build', name: 'Building', sub: 'blueprints · base pieces · structures', code: 'BLD', order: 20 });
treeCategory({ key: 'device', name: 'Devices', sub: 'scanner · map · machines · schematics', code: 'DEV', order: 30 });
treeCategory({ key: 'chip', name: 'Chips', sub: 'permanent neural and somatic implants', code: 'CHP', order: 40 });
treeCategory({ key: 'limb', name: 'Limbs', sub: 'hardware for the unit room to fit', code: 'LMB', order: 50 });

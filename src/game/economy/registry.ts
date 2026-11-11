// THE ECONOMY AS DATA. Everything round 15 added that research, the press or
// the build mode can offer, as plain lists the lab's research lattice
// (src/ui/menus/research/lattice.ts via src/game/treeData.ts) and the press
// terminal (src/game/economy/terminal.ts) read:
//   PATTERNS        creation recipes: what the press can make out of banked matter (+ tokens)
//   PRESS_UPGRADES  device upgrades for the Remittance Press
//   HOMESTEAD       base-building pieces (added to the build catalogue, src/build/pieces.ts)
//   PLANTS          backrooms crops and fungi (planters, fungus beds, forage spots)
//   LIVESTOCK       docile inhabitants that can be tamed, penned, fed and milked
//   HUSBANDRY       farming research (growth and produce upgrades)
//   ECON_RECIPES    hand-crafting recipes for the new resources
// economyCatalogue() returns all of it in one object. Every research node is
// registered with treeOffers(), so the lattice lists it under its category:
// 'matter' (The Press: patterns), 'device' (press upgrades), 'build'
// (homestead pieces), 'farm' (plants, fungus, livestock).
import { treeCategory, treeOffers, type TreeOffer } from '../treeData';
import { defPiece, type Piece } from '../../build/pieces';
import { defRecipe, type Recipe } from '../../items/recipes';
import { CROP_LOOK, type PlantLook } from './plantModels';
import type { Matter } from './matter';

// ------------------------------------------------------------------ creation patterns
export interface Pattern {
  /** research node that unlocks it */
  key: string;
  item: string;
  /** made per print */
  n: number;
  /** matter drawn from the bank per print (kg) */
  cost: Matter;
  /** clearance tokens per print */
  tok: number;
  /** RP to research the pattern in the lab */
  rp: number;
  lane: string;
  requires?: string[];
  desc: string;
}
const P = (key: string, item: string, cost: Matter, tok: number, rp: number, lane: string, desc: string, requires?: string[], n = 1): Pattern => ({ key, item, n, cost, tok, rp, lane, requires, desc });
export const PATTERNS: Pattern[] = [
  P('mx_scrap', 'scrap_metal', { metal: 0.5 }, 1, 2, 'Feedstock', 'Half a kilo of banked metal pressed back out as scrap.'),
  P('mx_nails', 'nails', { metal: 0.3 }, 1, 3, 'Feedstock', 'A box of cut nails.', ['mx_scrap']),
  P('mx_wire', 'wire', { metal: 0.15, polymer: 0.05 }, 1, 3, 'Feedstock', 'Copper wire, sheathed.', ['mx_scrap']),
  P('mx_sheet', 'sheet_metal', { metal: 2 }, 2, 4, 'Feedstock', 'A flat sheet of steel.', ['mx_nails']),
  P('mx_frame', 'steel_frame', { metal: 4 }, 3, 6, 'Feedstock', 'A welded steel frame for machines.', ['mx_sheet']),
  P('mx_plank', 'plank', { wood: 1.2 }, 1, 2, 'Soft goods', 'A straight plank, no knots, no rot.'),
  P('mx_cloth', 'cloth', { fibre: 0.3 }, 1, 2, 'Soft goods', 'A clean bolt of cotton.'),
  P('mx_rope', 'rope', { fibre: 0.6 }, 1, 3, 'Soft goods', 'Ten metres of laid rope.', ['mx_cloth']),
  P('mx_plastic', 'plastic_scrap', { polymer: 0.25 }, 1, 2, 'Soft goods', 'Polymer feedstock.'),
  P('mx_glass', 'glass_pane', { mineral: 1.2 }, 1, 3, 'Soft goods', 'A clean pane of glass.', ['mx_plastic']),
  P('mx_reagent', 'chem_reagent', { chem: 0.35, mineral: 0.1 }, 2, 4, 'Chemistry', 'A jar of general solvent.'),
  P('mx_battery', 'battery', { metal: 0.05, chem: 0.05 }, 2, 5, 'Chemistry', 'A fresh cell.', ['mx_reagent']),
  P('mx_fertilizer', 'fertilizer', { organic: 0.6, chem: 0.2 }, 1, 3, 'Chemistry', 'Fertiliser for planters.', ['mx_reagent']),
  P('mx_bandage', 'bandage', { fibre: 0.05, chem: 0.02 }, 1, 3, 'Chemistry', 'A sterile bandage.', ['mx_reagent']),
  P('mx_elec', 'electronics_scrap', { metal: 0.2, polymer: 0.15, mineral: 0.05 }, 2, 5, 'Parts', 'A populated board.'),
  P('mx_bulb', 'fluoro_tube', { mineral: 0.3, metal: 0.05, chem: 0.02 }, 2, 4, 'Parts', 'A strip-light tube. Crops grow under it.', ['mx_elec']),
  P('mx_motor', 'motor', { metal: 2.5, polymer: 0.3 }, 4, 8, 'Parts', 'A small electric motor.', ['mx_elec']),
  P('mx_ration', 'ration_bar', { organic: 0.15 }, 1, 3, 'Provisions', 'A Meridian ration bar. It is exactly as good as the real one.'),
  P('mx_feed', 'feed_mash', { organic: 0.5 }, 1, 2, 'Provisions', 'A sack of feed mash for the pens.'),
  P('mx_almond', 'almond_water', { organic: 0.5, exotic: 0.05 }, 3, 6, 'Provisions', 'A bottle of almond water. It needs a pinch of something strange.', ['mx_ration']),
  P('mx_s_moss', 'seeds_lamp_moss', { organic: 0.02 }, 1, 2, 'Seed bank', 'Lamp moss spores.'),
  P('mx_s_tuber', 'seeds_vent_tuber', { organic: 0.1 }, 1, 2, 'Seed bank', 'Vent tuber eyes.', ['mx_s_moss']),
  P('mx_s_thistle', 'seeds_thistle', { organic: 0.02, exotic: 0.01 }, 1, 3, 'Seed bank', 'Almond thistle seed.', ['mx_s_tuber']),
  P('mx_s_ear', 'spawn_ear', { organic: 0.08 }, 1, 3, 'Seed bank', 'Wallpaper ear spawn.', ['mx_s_moss']),
  P('mx_s_morel', 'spawn_morel', { organic: 0.08 }, 2, 4, 'Seed bank', 'Carpet morel spawn.', ['mx_s_ear']),
  P('mx_s_puff', 'spawn_puffball', { organic: 0.08 }, 1, 3, 'Seed bank', 'Puffball spawn.', ['mx_s_ear']),
  P('mx_s_hum', 'spawn_humcap', { organic: 0.05, exotic: 0.02 }, 2, 5, 'Seed bank', 'Hum cap spawn.', ['mx_s_morel']),
  P('mx_glow', 'glow_dust', { exotic: 0.05, mineral: 0.02 }, 3, 7, 'Exotic', 'A vial of glow dust, pressed from anomalous residue.'),
];
export const pattern = (k: string) => PATTERNS.find((p) => p.key === k);

// ------------------------------------------------------------------ device upgrades (the press)
export interface Upgrade { key: string; title: string; rp: number; desc: string; gives: string; requires?: string[]; item: string }
export const PRESS_UPGRADES: Upgrade[] = [
  { key: 'pr_assay', title: 'Assay Lens', rp: 3, item: 'magnifying_glass', desc: 'A lens over the plate wired to the terminal.', gives: 'the terminal reads the plate before the lever: mass, material, scrip' },
  { key: 'pr_cold', title: 'Cold Start', rp: 5, item: 'battery', desc: 'A bypass for the contract interlock.', gives: 'the press runs with no contract (free survival): every load is kept as matter' },
  { key: 'pr_stamp', title: 'Token Stamp', rp: 6, item: 'coins', desc: 'A faster die in the token stamp.', gives: 'a clearance token for every 150 scrip remitted (was 250)', requires: ['pr_assay'] },
  { key: 'pr_batch', title: 'Batch Former', rp: 8, item: 'steel_frame', desc: 'A wider die for the creation cycle.', gives: 'patterns print three at a time for one token fee', requires: ['pr_stamp'] },
  { key: 'pr_relay', title: 'Seam Relay', rp: 10, item: 'walkie_talkie', desc: 'A relay from a claim beacon down to the seam.', gives: 'use the press terminal at your claim beacon; prints arrive there', requires: ['pr_batch'] },
];

// ------------------------------------------------------------------ plants and fungi
export interface PlantDef {
  crop: string; name: string; look: PlantLook; days: number; yield: [number, number]; item: string; color: number;
  /** fungi: grow in the dark */
  dark?: boolean;
  seed: string;
  /** a forage spot object that grows wild in the levels */
  forage?: string;
  desc: string;
}
export const PLANTS: PlantDef[] = [
  { crop: 'lamp_moss', name: 'Lamp Moss', look: 'moss', days: 3, yield: [2, 4], item: 'lamp_moss', color: 0x6ab04a, seed: 'seeds_lamp_moss', forage: 'forage_moss', desc: 'Moss on ceiling-tile dust under strip lights; faintly luminous. Wants light and damp.' },
  { crop: 'almond_thistle', name: 'Almond Thistle', look: 'thistle', days: 5, yield: [2, 5], item: 'almond_burr', color: 0xb88ad8, seed: 'seeds_thistle', forage: 'forage_thistle', desc: 'A thistle that wicks almond water out of wet carpet into its seed heads. Wants bright light, drinks hard.' },
  { crop: 'vent_tuber', name: 'Vent Tuber', look: 'tuber', days: 4, yield: [2, 5], item: 'vent_tuber', color: 0xe8dcc0, seed: 'seeds_vent_tuber', desc: 'A pale tuber from the dust behind vents. Grows in nearly any light.' },
  { crop: 'wallpaper_ear', name: 'Wallpaper Ear', look: 'ear', days: 3, yield: [2, 4], item: 'wallpaper_ear', color: 0xa8784a, dark: true, seed: 'spawn_ear', forage: 'forage_ear', desc: 'A bracket fungus on damp wallpaper. Dark and damp.' },
  { crop: 'carpet_morel', name: 'Carpet Morel', look: 'morel', days: 5, yield: [1, 3], item: 'carpet_morel', color: 0x5a3a22, dark: true, seed: 'spawn_morel', forage: 'forage_morel', desc: 'Morels pushing up through wet carpet. Slow, rich, poisonous raw.' },
  { crop: 'hum_cap', name: 'Hum Cap', look: 'humcap', days: 4, yield: [2, 5], item: 'hum_cap', color: 0x5a7aa8, dark: true, seed: 'spawn_humcap', desc: 'Slate caps that lean toward electrical hum. Calming, eaten raw.' },
  { crop: 'tallow_puffball', name: 'Tallow Puffball', look: 'puffball', days: 2, yield: [1, 2], item: 'puffball', color: 0xf2eee4, dark: true, seed: 'spawn_puffball', desc: 'A fast white puffball. Harvest it white.' },
  { crop: 'ceiling_truffle', name: 'Ceiling Truffle', look: 'truffle', days: 9, yield: [1, 2], item: 'ceiling_truffle', color: 0x2a2220, dark: true, seed: '', forage: 'forage_truffle', desc: 'Fruits inside fallen ceiling tiles. Only ever found, never grown.' },
];
for (const p of PLANTS) CROP_LOOK.set(p.crop, p.look);

// ------------------------------------------------------------------ livestock
export interface Livestock {
  species: string; name: string;
  /** what tames it (offered by hand) and what fills its trough */
  food: string[];
  /** feeds to tame */
  feeds: number;
  /** produce: item, every N in-game hours while fed */
  produce: [string, number][];
  desc: string;
}
export const LIVESTOCK: Livestock[] = [
  { species: 'bumble_bee', name: 'Giant Bumble Bee', food: ['meat_raw', 'small_meat_raw', 'biomass', 'feed_mash', 'honeycomb'], feeds: 2, produce: [['honeycomb', 20], ['honey_wax', 30]], desc: 'Too fat to do anything but eat remains and make wax and honey. In a pen, it does exactly that.' },
  { species: 'tallow_pigeon', name: 'Tallow Pigeon', food: ['vent_tuber', 'feed_mash', 'lamp_moss', 'biomass', 'seeds_vent_tuber'], feeds: 3, produce: [['pigeon_egg', 14], ['pigeon_tallow', 24]], desc: 'Lays small waxy eggs and sheds curls of tallow you can scrape off with a thumbnail.' },
  { species: 'moon_calf', name: 'Moon Calf', food: ['lamp_moss', 'feed_mash', 'biomass', 'lettuce', 'cabbage', 'almond_burr'], feeds: 2, produce: [['moon_milk', 18]], desc: 'Gives a jar of pale, faintly glowing milk a day if it is fed.' },
  { species: 'paper_grazer', name: 'Wallpaper Grazer', food: ['paper', 'feed_mash', 'wallpaper_ear', 'biomass'], feeds: 3, produce: [['biomass', 16], ['spawn_ear', 40]], desc: 'Eats paper and sheds fibrous dung that is half fungus spawn already.' },
];
export const livestockOf = (sp: string) => LIVESTOCK.find((l) => l.species === sp);

// ------------------------------------------------------------------ homestead pieces (build mode, B)
export const HOMESTEAD: Piece[] = [
  { key: 'barricade', name: 'Plank Barricade', cat: 'defense', kind: 'obj', obj: 'bld_barricade', h: 1.3, cost: [['plank', 3], ['nails', 6], ['scrap_metal', 1]], weld: 4, join: 'nail', stats: { def: 3 }, desc: 'Planks crossed on a pair of sawhorses and nailed through. Blocks a corridor; things have to work to get past it.' },
  { key: 'plank_door', name: 'Plank Door', cat: 'struct', kind: 'door', wall: 'wood_built', doorStyle: 'door_house', h: 2.7, cost: [['plank', 4], ['nails', 6], ['spring', 1]], weld: 5, join: 'nail', stats: { def: 2 }, desc: 'A wooden door hung in a plank wall. It closes behind you.' },
  { key: 'crate', name: 'Storage Crate', cat: 'living', kind: 'obj', obj: 'bld_crate', h: 0.7, cost: [['plank', 3], ['nails', 4]], weld: 3, join: 'nail', station: 'store', desc: 'A nailed plank crate with a hinged lid. Storage that stays where you left it.' },
  { key: 'bunk', name: 'Plank Bunk', cat: 'living', kind: 'obj', obj: 'bld_bunk', d: 2, h: 0.7, cost: [['plank', 4], ['nails', 6], ['bedsheet', 1]], weld: 5, join: 'nail', stats: { comfort: 3 }, desc: 'A low plank bed with a sheet over a pad of folded cloth. Sleep off the carpet.' },
  { key: 'worktable', name: 'Carpenter\'s Workbench', cat: 'machine', kind: 'obj', obj: 'bld_worktable', w: 2, d: 1, h: 1.0, cost: [['plank', 5], ['nails', 8], ['scrap_metal', 1]], weld: 6, join: 'nail', stats: { comfort: 1 }, station: 'forge', desc: 'A heavy plank bench with a vice and a tool rack. Counts as a workbench.' },
  { key: 'lantern', name: 'Wax Lantern Post', cat: 'living', kind: 'obj', obj: 'bld_lantern', h: 1.7, cost: [['plank', 1], ['glass_shard', 2], ['wire', 1]], weld: 2, join: 'nail', stats: { comfort: 2 }, desc: 'A glass lantern on a post, burning a slow wax candle. Warm light for a room the tubes forgot.' },
  { key: 'pen', name: 'Livestock Pen', cat: 'farm', kind: 'obj', obj: 'bld_pen', w: 3, d: 2, h: 1.0, cost: [['plank', 6], ['nails', 10], ['rope', 1]], weld: 8, join: 'nail', node: 'bp_pen', stats: { food: 2 }, station: 'farm', desc: 'A plank fence round a bed of straw, a trough and a water pan. Lead a tamed animal in (E), fill the trough, collect what it makes.' },
  { key: 'fungus_bed', name: 'Fungus Bed', cat: 'farm', kind: 'obj', obj: 'bld_fungus_bed', h: 0.5, cost: [['plank', 3], ['nails', 4], ['cloth', 1]], weld: 3, join: 'nail', node: 'bp_fungus', stats: { food: 1 }, station: 'farm', desc: 'A box of wet sawdust and coffee grounds under a damp sack. Fungi fruit fastest in the dark.' },
];
for (const p of HOMESTEAD) defPiece(p);

// ------------------------------------------------------------------ farming research
export const HUSBANDRY: TreeOffer[] = [
  { key: 'hb_mycology', category: 'farm', lane: 'Plants & fungus', title: 'Mycology', cost: 3, item: 'carpet_morel', alt: ['seeds_potato'], desc: 'Spawn, substrate and darkness.', gives: 'fungi grow half again as fast' },
  { key: 'hb_compost', category: 'farm', lane: 'Plants & fungus', title: 'Hot Compost', cost: 4, item: 'biomass', requires: ['hb_mycology'], desc: 'Biomass worked into the soil.', gives: 'every harvest yields one more' },
  { key: 'hb_rations', category: 'farm', lane: 'Livestock', title: 'Feed Ratios', cost: 3, item: 'feed_mash', desc: 'Measured feed, no waste.', gives: 'a full trough lasts twice as long' },
  { key: 'hb_breeding', category: 'farm', lane: 'Livestock', title: 'Selective Breeding', cost: 6, item: 'honeycomb', alt: ['honey_wax'], requires: ['hb_rations'], desc: 'Keep the ones that give the most.', gives: 'penned animals produce half again as often' },
];

// ------------------------------------------------------------------ crafting recipes (always known)
export const ECON_RECIPES: Recipe[] = [
  { key: 'make_feed_mash', name: 'Make Feed Mash', category: 'farming', time: 6, anim: 'mix', inputs: [{ item: 'biomass' }, { item: 'vent_tuber' }], outputs: [{ item: 'feed_mash', count: 2 }], desc: 'Grind a tuber into a brick of biomass. Animals will eat it.' },
  { key: 'make_feed_moss', name: 'Make Feed Mash (Moss)', category: 'farming', time: 6, anim: 'mix', inputs: [{ item: 'lamp_moss', count: 2 }, { item: 'biomass' }], outputs: [{ item: 'feed_mash', count: 2 }], desc: 'Moss and biomass, pounded together.' },
  { key: 'make_biomass', name: 'Press Biomass', category: 'farming', time: 5, anim: 'mix', inputs: [{ item: '#vegetable', count: 2 }], outputs: [{ item: 'biomass' }], desc: 'Old vegetables pressed into a brick.' },
  { key: 'make_biomass_meat', name: 'Press Biomass (Scraps)', category: 'farming', time: 5, anim: 'mix', inputs: [{ item: 'meat_raw' }], outputs: [{ item: 'biomass', count: 2 }], desc: 'Gristle and offcuts pressed into bricks for the pens.' },
  { key: 'make_fertilizer_bio', name: 'Make Fertiliser', category: 'farming', time: 8, anim: 'mix', inputs: [{ item: 'biomass', count: 2 }, { item: 'chem_reagent' }], outputs: [{ item: 'fertilizer' }], desc: 'Rot it down hot with a splash of reagent.' },
  { key: 'make_spawn_ear', name: 'Inoculate Dowels', category: 'farming', time: 8, anim: 'craft', inputs: [{ item: 'wallpaper_ear' }, { item: 'twigs' }], outputs: [{ item: 'spawn_ear' }], desc: 'Press a fresh ear against damp dowels and bag them. Spawn in a week.' },
  { key: 'make_spawn_puff', name: 'Spore a Puffball', category: 'farming', time: 6, anim: 'craft', inputs: [{ item: 'puffball' }, { item: 'cloth' }], outputs: [{ item: 'spawn_puffball', count: 2 }], desc: 'Let one brown in a cloth, then shake it over sawdust.' },
  { key: 'make_wax_candle', name: 'Pour a Wax Candle', category: 'survival', time: 10, anim: 'craft', needs: ['fire'], inputs: [{ item: '#wax' }, { item: 'thread', uses: 0.1 }], outputs: [{ item: 'candle' }], desc: 'Melt honey wax or tallow round a wick.' },
];
for (const r of ECON_RECIPES) defRecipe(r);

// ------------------------------------------------------------------ the lattice
treeCategory({ key: 'matter', name: 'The Press', sub: 'creation patterns · matter into things', code: 'MTR', order: 25 });
treeCategory({ key: 'farm', name: 'Farming', sub: 'plants · fungus · livestock', code: 'FRM', order: 35 });
const ITEM_FALLBACK = ['scrap_metal'];
treeOffers([
  ...PATTERNS.map((p): TreeOffer => ({ key: p.key, category: 'matter', lane: p.lane, title: 'Pattern: ' + p.item.replace(/_/g, ' '), cost: p.rp, requires: p.requires, item: p.item, alt: ITEM_FALLBACK, desc: p.desc + ' Made at the press terminal from banked matter and clearance tokens.', gives: `the press can make ${p.item.replace(/_/g, ' ')} (${p.tok} token${p.tok > 1 ? 's' : ''})` })),
  ...PRESS_UPGRADES.map((u): TreeOffer => ({ key: u.key, category: 'device', lane: 'Remittance Press', title: u.title, cost: u.rp, requires: u.requires, item: u.item, alt: ITEM_FALLBACK, desc: u.desc, gives: u.gives })),
  ...HOMESTEAD.filter((p) => p.node).map((p): TreeOffer => ({ key: p.node!, category: 'build', lane: 'Homestead', title: p.name, cost: p.key === 'pen' ? 4 : 3, item: p.key === 'pen' ? 'rope' : 'spawn_ear', alt: ['plank'], desc: p.desc, gives: 'blueprint: ' + p.name })),
  ...HUSBANDRY,
]);

/** titles for the terminal (an item key's display name is resolved there) */
export function economyCatalogue() {
  return { patterns: PATTERNS, upgrades: PRESS_UPGRADES, pieces: HOMESTEAD, plants: PLANTS, livestock: LIVESTOCK, husbandry: HUSBANDRY, recipes: ECON_RECIPES };
}

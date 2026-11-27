// THE FARM ON THE LATTICE (round 25): the trades' nodes for the grow room, the yard, the larder and the codex, on the
// professions' branches (src/game/professions.ts profNode). What each one does is a trade stat read where it applies:
//   grow, yield, pest, hydro    src/build/farm.ts (growth, harvest, how often mites and blight take hold, hydro trays)
//   herd, milk, feed, breed     src/game/economy/homestead.ts (produce rate, milk and eggs, trough, breeding / hatching)
//   forage                      homestead.ts forage spots          preserve   src/survival/survivalSystem.ts (food ageing)
//   discover                    src/craft/stores.ts discoverFrom (how often a find teaches a schematic)
// Their lattice scenes are registered in src/ui/menus/research/preview.ts (FARM_SHOTS: the grow room, the pen, the
// larder, the bench).
import { profNode, type ProfKey } from '../professions';

const N = (prof: ProfKey, lane: string, rows: [string, string, string, number[], number[], Partial<Record<string, number>>[], string[], string?, string[]?, string[]?][]) => {
  for (const [key, title, desc, cost, level, fx, gives, item, alt, requires] of rows) profNode({ key, prof, lane, title, desc, cost, level, fx, gives, item, alt, requires });
};

// ---- BOTANIST: the grow room
N('botanist', 'Grow room', [
  ['pf_bt_hydro', 'Hydroponics', 'Roots in moving water under a tube: the trays and racks are where the fast crops are.', [3, 6], [1, 4], [{ hydro: 1.15 }, { hydro: 1.15 }], ['hydro trays and racks grow 15% faster', 'hydro trays and racks grow 32% faster'], 'strip_cress', ['seeds_cress']],
  ['pf_bt_pest', 'Pest Control', 'Under the leaves every morning, pepper wash on anything that moves.', [3, 6], [2, 4], [{ pest: 0.7 }, { pest: 0.7 }], ['mites and blight take hold 30% less often', 'mites and blight take hold half as often'], 'mite_spray', ['exit_pepper'], ['pf_bt_hydro']],
  ['pf_bt_herbal', 'Herbalist', 'Knows a remedy in every bed: what to pick, when, and what it is good for.', [4], [3], [{ discover: 1.25, heal: 1.06 }], ['finds teach recipes 25% more often, wounds heal 6% faster'], 'bluecap', ['hush_mint'], ['pf_bt_pest']],
]);
// ---- HANDLER: the yard
N('handler', 'The yard', [
  ['pf_hd_water', 'Water Rounds', 'Troughs full, pans clean, before anything asks.', [3], [1], [{ feed: 0.9, herd: 1.08 }], ['feed lasts 10% longer, produce +8%'], 'watering_can', ['bucket']],
  ['pf_hd_shear', 'Shearing', 'Down and silk off an animal without a nick or a fright.', [4], [2], [{ herd: 1.12 }], ['down, silk and every other produce +12%'], 'shears', ['grub_silk'], ['pf_hd_water']],
  ['pf_hd_incub', 'Incubation', 'Warm, turned and watched: more of the eggs hatch, sooner.', [5], [4], [{ breed: 1.3 }], ['eggs hatch and pairs breed 30% faster'], 'incubator', ['pallid_egg'], ['pf_hd_shear']],
]);
// ---- COOK: the larder
N('cook', 'Larder', [
  ['pf_ck_pickle', 'Pickling', 'Brine, salt and a good lid: the summer kept for winter.', [3], [2], [{ preserve: 1.2 }], ['food you carry spoils 20% slower'], 'pickle_jar', ['salted_eggs']],
  ['pf_ck_cheese', 'Cheesemaker', 'Milk worked into something that keeps, and keeps you.', [4], [3], [{ milk: 1.15, hunger: 0.96 }], ['+15% milk and eggs, hunger rises 4% slower'], 'moon_cheese', ['moon_milk'], ['pf_ck_pickle']],
]);
// ---- SCAVENGER: wild patches
N('scavenger', 'Living rough', [
  ['pf_sc_forage', 'Wild Patches', 'Knows where the damp collects and the mint grows back.', [3], [2], [{ forage: 1.3 }], ['+30% from every forage spot'], 'hush_mint', ['bluecap'], ['pf_sc_lean']],
]);
// ---- RESEARCHER: the specimen eye
N('researcher', 'Field kit', [
  ['pf_rs_specimen', 'Specimen Eye', 'Every egg, cap and skein turned over under the lamp until it gives up what it is for.', [5], [3], [{ discover: 1.35 }], ['finds teach recipes 35% more often (and a second at a time)'], 'pallid_egg', ['bluecap'], ['pf_rs_sample']],
]);
// ---- COMBAT: crude arms
N('combat', 'Grit', [
  ['pf_c_crude', 'Crude Arms', 'Nails through a table leg, a bone ground to an edge: home-made, and you know their weight.', [4], [2], [{ melee: 1.05 }], ['+5% melee damage (the club, the bone knife, the sling hit truer)'], 'spiked_club', ['bat'], ['pf_c_wind']],
]);

// THE CAMP (round 16): the pieces that make a base a place that works, as data.
//   - wood-and-scrap first (a hammer and nails), metal later (the welding torch);
//   - every early piece has a metal upgrade you can put over it in place (U in build mode):
//     plank wall -> scrap plate -> riveted steel, plank door -> bulkhead -> blast door,
//     barricade -> plate barricade, crate -> locker, bunk -> cot, wax lantern -> caged lamp,
//     camp flag -> claim beacon, carpenter's bench -> powered bench -> machinist's bench;
//   - workbench tiers gate the intermediate parts (src/content/recipes/zh_parts.ts);
//   - power: a generator rig and wire poles carry current to lamps, the siren, the flail;
//   - water: rain barrel (drips), condensation collector (clean, faster on power), water still (boils);
//   - defence: barricades and walls creatures have to break (src/build/camp.ts probes), jaw traps,
//     tin-can tripwires, the chain flail, the siren;
//   - the bed holds a checkpoint; the radio hears what is coming.
// Models: src/content/furniture/zh_camp.ts. Runtime: src/build/camp.ts.
import { defPiece, piece, type Piece } from './pieces';
import { treeOffers, type TreeOffer } from '../game/treeData';

const CAMP: Piece[] = [
  // ---------------------------------------------------------------- structure
  { key: 'camp_flag', name: 'Camp Flag', cat: 'living', kind: 'obj', obj: 'bld_camp_flag', h: 2.0, cost: [['plank', 1], ['rag', 2], ['nails', 2]], weld: 2.5, join: 'nail', desc: 'A plank pole, a rag flag, a tin-can lamp. Plant it and eight metres round it is your camp.' },
  { key: 'steel_wall', name: 'Riveted Steel Wall', cat: 'struct', kind: 'wall', wall: 'bld_steel_wall', h: 2.7, cost: [['steel_plate', 2], ['scrap_metal', 1]], weld: 8, node: 'bp_steel', stats: { def: 5 }, desc: 'Riveted plate on a box-section frame. It takes a long time to get through.' },
  { key: 'steel_door', name: 'Blast Door', cat: 'struct', kind: 'door', wall: 'bld_steel_wall', doorStyle: 'door_metal', h: 2.7, cost: [['steel_plate', 2], ['hinge', 2], ['steel_frame', 1]], weld: 9, node: 'bp_steel', stats: { def: 5 }, desc: 'A riveted door on two heavy hinges, in a riveted wall.' },
  // ---------------------------------------------------------------- machines
  { key: 'machine_bench', name: 'Machinist\'s Bench', cat: 'machine', kind: 'obj', obj: 'bld_machine_bench', w: 2, d: 1, h: 1.7, cost: [['steel_frame', 2], ['motor', 1], ['gear', 2], ['wiring_harness', 1]], weld: 12, node: 'bp_machine_bench', stats: { comfort: 1, power: -1 }, station: 'forge', desc: 'A lathe, a pillar drill and a tool board on a steel bench. The third and last bench: rebuilt motors, steel frames, the finest work.' },
  { key: 'pole', name: 'Wire Pole', cat: 'machine', kind: 'obj', obj: 'bld_pole', h: 2.6, cost: [['plank', 2], ['wire', 3], ['nails', 2]], weld: 3, join: 'nail', node: 'bp_wiring', desc: 'A plank pole with two glass insulators. Carries a generator\'s current ten metres further.' },
  // ---------------------------------------------------------------- water
  { key: 'rain_barrel', name: 'Rain Barrel', cat: 'farm', kind: 'obj', obj: 'bld_rain_barrel', h: 1.2, cost: [['plank', 3], ['nails', 4], ['rag', 1]], weld: 3, join: 'nail', stats: { food: 1 }, desc: 'A staved barrel under a rag funnel. Catches what drips from the ceiling (boil it).' },
  { key: 'condenser', name: 'Condensation Collector', cat: 'farm', kind: 'obj', obj: 'bld_condenser', h: 1.5, cost: [['pipe', 2], ['sheet_metal', 1], ['wiring_harness', 1]], weld: 6, node: 'bp_water', stats: { food: 1 }, desc: 'A coil of cold pipe over a drip tray. Pulls clean water out of the air; a fan on the grid doubles it.' },
  { key: 'still', name: 'Water Still', cat: 'farm', kind: 'obj', obj: 'bld_still', h: 1.4, cost: [['sheet_metal', 1], ['pipe', 2], ['glass_shard', 2]], weld: 6, node: 'bp_water', stats: { food: 1 }, desc: 'A pot, a lid, a copper coil. Pour in any water, feed the fire, collect it clean.' },
  // ---------------------------------------------------------------- defence
  { key: 'metal_barricade', name: 'Plate Barricade', cat: 'defense', kind: 'obj', obj: 'bld_barricade_metal', h: 1.4, cost: [['sheet_metal', 2], ['steel_frame', 1]], weld: 6, stats: { def: 6 }, desc: 'Sheet steel welded over a frame of bent pipe. Things have to work a long time at it.' },
  { key: 'tripwire', name: 'Tin-Can Tripwire', cat: 'defense', kind: 'obj', obj: 'bld_tripwire', h: 0.5, cost: [['wire', 1], ['scrap_metal', 1], ['plank', 1]], weld: 2, join: 'nail', stats: { def: 1 }, desc: 'A wire across the way and a string of cans. Anything that crosses it rings the camp awake.' },
  { key: 'jaw_trap', name: 'Spring Jaw Trap', cat: 'defense', kind: 'obj', obj: 'bld_jaw_trap', h: 0.25, cost: [['spring', 2], ['scrap_metal', 2], ['wire', 1]], weld: 3, join: 'nail', node: 'bp_traps', stats: { def: 2 }, desc: 'Two toothed jaws on a coil spring. It holds what steps in it. Re-arm it after (E).' },
  { key: 'flail', name: 'Chain Flail Post', cat: 'defense', kind: 'obj', obj: 'bld_flail', h: 1.6, cost: [['motor', 1], ['steel_frame', 1], ['gear', 1], ['pipe', 2]], weld: 9, node: 'bp_flail', stats: { def: 6, power: -1 }, desc: 'A motor spins three lengths of chain on a post. Anything in reach is beaten back. Needs the grid.' },
  { key: 'siren', name: 'Crank Siren', cat: 'defense', kind: 'obj', obj: 'bld_siren', h: 1.8, cost: [['sheet_metal', 1], ['spring', 1], ['scrap_metal', 2], ['wire', 1]], weld: 5, node: 'bp_siren', stats: { def: 2 }, desc: 'A rotor siren on a post. It wails when something hostile is inside the claim, or a tripwire rings.' },
  // ---------------------------------------------------------------- living
  { key: 'work_lamp', name: 'Caged Work Lamp', cat: 'living', kind: 'obj', obj: 'bld_work_lamp', h: 2.1, cost: [['lightbulb', 1], ['wire', 2], ['scrap_metal', 1]], weld: 2, join: 'nail', node: 'bp_wiring', stats: { comfort: 3, power: -1 }, desc: 'A bulb in a wire cage on a pole. Bright, warm and steady while the grid is up.' },
  { key: 'radio', name: 'Camp Radio', cat: 'living', kind: 'obj', obj: 'bld_radio', h: 1.0, cost: [['relay_board', 1], ['wire', 2], ['scrap_metal', 1]], weld: 4, join: 'nail', node: 'bp_radio', stats: { comfort: 1 }, desc: 'A set on a crate with a long wire aerial. Dr. Calder can reach the camp on it, and it hears what is coming.' },
];
for (const p of CAMP) defPiece(p);

/** the piece each one upgrades into, in place (U in build mode) */
export const UPGRADES: Record<string, string> = {
  plank_wall: 'plate_wall', plate_wall: 'steel_wall',
  plank_door: 'hatch', hatch: 'steel_door',
  barricade: 'metal_barricade',
  crate: 'locker',
  bunk: 'cot',
  lantern: 'work_lamp',
  camp_flag: 'beacon',
  worktable: 'mech_bench', mech_bench: 'machine_bench',
  rain_barrel: 'rain',
};
/** what upgrading a into its next costs: the new piece's salvage less what the old one gives back (about a third off) */
export function upgradeCost(to: Piece): [string, number][] {
  return to.cost.map(([k, n]) => [k, Math.max(1, Math.ceil(n * 0.67))] as [string, number]);
}
export const upgradeOf = (key: string): Piece | null => { const k = UPGRADES[key]; return k ? piece(k) ?? null : null; };

/** claim radius per claim object (a camp flag is small, the beacon big) */
export const CLAIM_OBJS: Record<string, number> = { bld_beacon: 12, bld_camp_flag: 8 };

/** bench tier of a workbench object (0 = none) */
export const BENCH_TIER: Record<string, number> = { bld_worktable: 1, kit_workbench: 1, bld_mech_bench: 2, bld_machine_bench: 3 };

// ---------------------------------------------------------------- research: the camp lane comes early and cheap
const L = (key: string, lane: string, title: string, cost: number, item: string, desc: string, gives: string, requires?: string[]): TreeOffer =>
  ({ key, category: 'build', lane, title, cost, item, alt: ['plank', 'scrap_metal'], desc, gives, requires });
treeOffers([
  L('bp_wiring', 'Power', 'Wiring', 1, 'wire', 'Poles, insulators and caged lamps. Carry a generator\'s current round the camp.', 'blueprints: Wire Pole, Caged Work Lamp'),
  L('bp_water', 'Camp', 'Clean Water', 2, 'pipe', 'A coil, a pot, a drip tray. Water you do not have to boil.', 'blueprints: Condensation Collector, Water Still'),
  L('bp_traps', 'Defence', 'Spring Traps', 1, 'spring', 'Two jaws on a coil. It holds whatever steps in it.', 'blueprint: Spring Jaw Trap'),
  L('bp_siren', 'Defence', 'Crank Siren', 2, 'scrap_metal', 'A rotor siren that wails when something hostile is inside the claim.', 'blueprint: Crank Siren', ['bp_traps']),
  L('bp_radio', 'Camp', 'Camp Radio', 2, 'radio_portable', 'A set with a long aerial. Dr. Calder can reach the camp, and it hears what is coming.', 'blueprint: Camp Radio'),
  L('bp_steel', 'Metalwork', 'Riveted Steel', 4, 'sheet_metal', 'Riveted plate on box section: the last upgrade for walls and doors.', 'blueprints: Riveted Steel Wall, Blast Door', ['bp_hatch']),
  L('bp_flail', 'Defence', 'Chain Flail', 4, 'motor', 'A motor, a post, three chains. Turret-like, and it never runs out of nails.', 'blueprint: Chain Flail Post', ['bp_wiring']),
  L('bp_machine_bench', 'Metalwork', 'Machinist\'s Bench', 5, 'motor', 'A lathe and a pillar drill: the third bench. Motors and frames are made here, and everything comes out finer.', 'blueprint: Machinist\'s Bench', ['bp_mech_bench']),
]);

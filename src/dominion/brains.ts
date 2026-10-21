// Mechanical brains: what goes into the skull once the meat is out. Three
// sizes (bigger creatures need a bigger lobe), the research that teaches the
// recipes (branch 'tame'), the recipes themselves (learned schematics), and
// who may be dominated at all.
import { defItem, itemDef } from '../items/item';
import { defRecipe } from '../items/recipes';
import { defNode, hasUnlock } from '../game/research';
import type { ModelBuilder } from '../gfx/modelBuilder';
import type { Creature } from '../creatures/creature';

export interface BrainTier { tier: 1 | 2 | 3; key: string; name: string; maxHp: number; led: number; node: string }
export const BRAINS: BrainTier[] = [
  { tier: 1, key: 'brain_mk1', name: 'Cortex Valve MK-I', maxHp: 45, led: 0xffa040, node: 'tame_mk1' },
  { tier: 2, key: 'brain_mk2', name: 'Twin-Valve Cortex MK-II', maxHp: 110, led: 0xffa040, node: 'tame_mk2' },
  { tier: 3, key: 'brain_mk3', name: 'Titan Lobe MK-III', maxHp: Infinity, led: 0xffa040, node: 'tame_mk3' },
];
export const brainOf = (key: string) => BRAINS.find((b) => b.key === key);
export const brainTier = (t: number) => BRAINS[Math.max(0, Math.min(2, t - 1))];

/** why this creature cannot take a mechanical brain ('' = it can) */
export function domBlock(c: Creature): string {
  const sp = c.sp, f = sp.flags || {};
  if (c.dead) return 'dead';
  if (c.mem.tribe || c.sp.key.startsWith('tribe_')) return 'a person';
  if (f.immortal || f.noCorpse || f.ghost || sp.temperament === 'hazard') return 'no skull to open';
  if (c.mem.dom) return 'already wired';
  return '';
}
/** the smallest brain that can run this body */
export function tierNeeded(c: Creature): 1 | 2 | 3 {
  const hp = c.sp.hp, h = c.sp.height;
  let t: 1 | 2 | 3 = hp <= 45 ? 1 : hp <= 110 ? 2 : 3;
  if (h >= 2.5 && t < 2) t = 2;
  return t;
}

// ---------------------------------------------------------------- research ('tame')
defNode({ key: 'tame_mk1', branch: 'tame', title: 'CORTEX VALVE', cost: 8, icon: 'brain',
  desc: 'Schematic: a one-valve mechanical brain for small things (up to 45 vitality). Knock a monster down, open the skull, swap the meat for the valve.' });
defNode({ key: 'tame_station', branch: 'tame', title: 'LABOUR DIRECTIVE', cost: 14, requires: ['tame_mk1'], icon: 'gear',
  desc: 'Thralls take standing orders at a station: guard a perimeter, haul loose loot into a crate, crank a generator, tend planters.' });
defNode({ key: 'tame_mk2', branch: 'tame', title: 'TWIN-VALVE CORTEX', cost: 22, requires: ['tame_mk1'], icon: 'brain',
  desc: 'Schematic: a two-valve cortex for mid-sized bodies (up to 110 vitality).' });
defNode({ key: 'tame_ride', branch: 'tame', title: 'SADDLE PROTOCOL', cost: 18, requires: ['tame_mk2'], icon: 'saddle',
  desc: 'Ride a thrall big enough to carry you. It runs where you steer, faster than you can.' });
defNode({ key: 'tame_pack', branch: 'tame', title: 'HIVE UPLINK', cost: 25, requires: ['tame_station'], icon: 'net',
  desc: 'Run up to six thralls at once (three without it).' });
defNode({ key: 'tame_overclock', branch: 'tame', title: 'OVERCLOCK', cost: 30, requires: ['tame_mk2'], icon: 'bolt',
  desc: 'Thralls hit half again as hard and move a quarter faster. They run hot.' });
defNode({ key: 'tame_mk3', branch: 'tame', title: 'TITAN LOBE', cost: 50, requires: ['tame_mk2'], icon: 'brain',
  desc: 'Schematic: a three-valve, heat-finned lobe big enough for anything with a skull. Giant robot entity slaves.' });

export const maxThralls = () => (hasUnlock('tame_pack') ? 6 : 3);

// ---------------------------------------------------------------- items
const FIL = 0xffa040;
/** a glass vacuum tube with a glowing filament, standing on a bakelite socket */
function tube(mb: ModelBuilder, x: number, y: number, z: number, h: number, r = 0.011) {
  mb.cylinder(x, y, z, r * 1.25, 0.008, 8, 'plastic_black', { color: 0x3a2418 });
  mb.cylinder(x, y + 0.008, z, r, h, 8, 'glass', { color: 0xd8e4e0 });
  mb.sphere(x, y + 0.008 + h, z, r, 8, 4, 'glass', { color: 0xd8e4e0, sy: 0.8 });
  mb.box(x, y + 0.012 + h * 0.35, z, r * 0.7, h * 0.45, r * 0.25, 'metal_grey', { color: 0x6a6a64 });
  mb.box(x, y + 0.012 + h * 0.5, z, r * 0.3, h * 0.25, r * 0.3, 'white', { color: FIL, emissive: 1.6 });
}
function rivets(mb: ModelBuilder, r: number, y: number, n: number) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; mb.box(Math.cos(a) * r, y, Math.sin(a) * r, 0.005, 0.005, 0.005, 'metal_brass'); } }
function dial(mb: ModelBuilder, x: number, y: number, z: number, r: number) {
  mb.push().translate(x, y, z).rotateX(Math.PI / 2);
  mb.cylinder(0, 0, 0, r, 0.004, 10, 'metal_brass'); mb.cylinder(0, 0.004, 0, r * 0.8, 0.001, 10, 'paper', { color: 0xe8dcb8 });
  mb.pop();
  mb.box(x + r * 0.3, y + r * 0.2, z + 0.003, r * 0.9, 0.0015, 0.001, 'plastic_black');
}
/** MK-I: a riveted steel drum, one valve */
function valve1(mb: ModelBuilder) {
  mb.cylinder(0, 0, 0, 0.046, 0.03, 12, 'metal_rusty', { color: 0x9a9890 });
  mb.cylinder(0, 0.03, 0, 0.048, 0.005, 12, 'metal_brass');
  rivets(mb, 0.047, 0.015, 10);
  tube(mb, 0, 0.035, 0, 0.04);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; mb.cylinder(Math.cos(a) * 0.03, -0.012, Math.sin(a) * 0.03, 0.003, 0.012, 5, 'metal_brass'); }
  dial(mb, 0.0, 0.016, 0.047, 0.01);
}
/** MK-II: a riveted dome, two valves behind a brass collar, braided leads */
function valve2(mb: ModelBuilder) {
  mb.sphere(0, 0.012, 0, 0.056, 12, 6, 'metal_rusty', { color: 0x8a8a84, sy: 0.62 });
  mb.cylinder(0, 0, 0, 0.06, 0.014, 14, 'metal_brass');
  rivets(mb, 0.058, 0.008, 14);
  tube(mb, -0.02, 0.035, 0, 0.042); tube(mb, 0.02, 0.035, 0, 0.042);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) mb.box(sx * (0.062 + i * 0.01), 0.004 - i * 0.004, 0.0, 0.012, 0.008, 0.008, 'fabric_brown', { color: 0x4a3a2a });
  dial(mb, 0, 0.022, 0.05, 0.012);
}
/** MK-III: a boxy chassis, three tall valves in a wire cage, heat fins, terminal posts */
function valve3(mb: ModelBuilder) {
  mb.box(0, 0.02, 0, 0.13, 0.04, 0.1, 'metal_painted_green', { color: 0x5a6250 });
  for (const [x, z] of [[-0.06, -0.045], [0.06, -0.045], [-0.06, 0.045], [0.06, 0.045]]) mb.box(x, 0.041, z, 0.006, 0.004, 0.006, 'metal_brass');
  for (let i = 0; i < 3; i++) tube(mb, -0.035 + i * 0.035, 0.04, -0.01, 0.06, 0.013);
  for (let i = 0; i < 5; i++) mb.box(-0.05 + i * 0.025, 0.07, -0.01, 0.002, 0.07, 0.05, 'metal_grey', { color: 0x8a8a84 });
  for (let i = 0; i < 6; i++) mb.box(0.067, 0.008 + i * 0.006, 0, 0.004, 0.003, 0.09, 'metal_brushed');
  dial(mb, -0.03, 0.022, 0.051, 0.014); dial(mb, 0.025, 0.022, 0.051, 0.01);
  for (const x of [-0.05, 0.05]) mb.cylinder(x, 0.04, 0.035, 0.005, 0.016, 6, 'metal_brass');
}
export const BRAIN_MODELS: Record<string, (mb: ModelBuilder) => void> = {
  brain_mk1: valve1,
  brain_mk2: valve2,
  brain_mk3: valve3,
};

defItem({ key: 'brain_mk1', name: BRAINS[0].name, cat: 'electronics', weight: 0.4, value: 160, noStack: true, tags: ['mech_brain'],
  desc: 'A riveted steel drum with one warm vacuum valve and four brass pins. Runs anything up to the size of a dog. It goes where a small skull keeps its brain.',
  model: BRAIN_MODELS.brain_mk1 });
defItem({ key: 'brain_mk2', name: BRAINS[1].name, cat: 'electronics', weight: 0.9, value: 420, noStack: true, tags: ['mech_brain'],
  desc: 'A riveted dome, two valves behind a brass collar, braided leads. Drives anything up to the size of a person, and most things a little bigger.',
  model: BRAIN_MODELS.brain_mk2 });
defItem({ key: 'brain_mk3', name: BRAINS[2].name, cat: 'electronics', weight: 2.2, value: 1100, noStack: true, tags: ['mech_brain'], rare: true,
  desc: 'Three tall valves in a wire cage, heat fins and two brass dials. Stencilled: RATED FOR NON-STANDARD ANATOMY. Anything with a skull.',
  model: BRAIN_MODELS.brain_mk3 });

// ---------------------------------------------------------------- recipes (schematics learned through research)
defRecipe({ key: 'make_brain_mk1', name: 'Assemble Cortex Valve', category: 'electrical', time: 25, learned: true,
  inputs: [{ item: 'electronics_scrap', count: 2 }, { item: 'wire' }, { item: 'battery' }, { item: 'scrap_metal' }, { item: '#screwdriver', keep: true }],
  outputs: [{ item: 'brain_mk1' }], anim: 'craft', xp: ['electrical', 15], desc: 'Seat a valve in a steel drum, solder the pins, coil the leads.' });
defRecipe({ key: 'make_brain_mk2', name: 'Assemble Twin-Valve Cortex', category: 'electrical', time: 40, learned: true,
  inputs: [{ item: 'electronics_scrap', count: 3 }, { item: 'wire', count: 2 }, { item: 'power_bank' }, { item: 'sheet_metal' }, { item: 'spring', count: 2 }, { item: '#screwdriver', keep: true }],
  outputs: [{ item: 'brain_mk2' }], anim: 'craft', xp: ['electrical', 30], desc: 'Two valves, a brass collar, a power bank to keep the filaments warm.' });
defRecipe({ key: 'make_brain_mk3', name: 'Assemble Titan Lobe', category: 'electrical', time: 60, learned: true, needs: ['workbench'],
  inputs: [{ item: 'electronics_scrap', count: 4 }, { item: 'wire', count: 3 }, { item: 'car_battery' }, { item: 'sheet_metal', count: 2 }, { item: 'memory_shard' }, { item: '#screwdriver', keep: true }],
  outputs: [{ item: 'brain_mk3' }], anim: 'hammer', xp: ['electrical', 60], desc: 'A car battery for a heart, a memory shard for a soul, three valves and fins to bleed the heat.' });

/** recipe keys a research node teaches */
export const NODE_RECIPES: Record<string, string> = { tame_mk1: 'make_brain_mk1', tame_mk2: 'make_brain_mk2', tame_mk3: 'make_brain_mk3' };
export const brainName = (key: string) => itemDef(key).name;

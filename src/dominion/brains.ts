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
  { tier: 1, key: 'brain_mk1', name: 'Cortex Puck MK-I', maxHp: 45, led: 0x5aff8a, node: 'tame_mk1' },
  { tier: 2, key: 'brain_mk2', name: 'Servo Cortex MK-II', maxHp: 110, led: 0xffb840, node: 'tame_mk2' },
  { tier: 3, key: 'brain_mk3', name: 'Titan Lobe MK-III', maxHp: Infinity, led: 0xff3a4a, node: 'tame_mk3' },
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
defNode({ key: 'tame_mk1', branch: 'tame', title: 'CORTEX PUCK', cost: 8, icon: 'brain',
  desc: 'Schematic: a mechanical brain for small things (up to 45 vitality). Knock a monster down, open the skull, swap the meat for the puck.' });
defNode({ key: 'tame_station', branch: 'tame', title: 'LABOUR DIRECTIVE', cost: 14, requires: ['tame_mk1'], icon: 'gear',
  desc: 'Thralls take standing orders at a station: guard a perimeter, haul loose loot into a crate, crank a generator, tend planters.' });
defNode({ key: 'tame_mk2', branch: 'tame', title: 'SERVO CORTEX', cost: 22, requires: ['tame_mk1'], icon: 'brain',
  desc: 'Schematic: a servo-driven cortex for mid-sized bodies (up to 110 vitality).' });
defNode({ key: 'tame_ride', branch: 'tame', title: 'SADDLE PROTOCOL', cost: 18, requires: ['tame_mk2'], icon: 'saddle',
  desc: 'Ride a thrall big enough to carry you. It runs where you steer, faster than you can.' });
defNode({ key: 'tame_pack', branch: 'tame', title: 'HIVE UPLINK', cost: 25, requires: ['tame_station'], icon: 'net',
  desc: 'Run up to six thralls at once (three without it).' });
defNode({ key: 'tame_overclock', branch: 'tame', title: 'OVERCLOCK', cost: 30, requires: ['tame_mk2'], icon: 'bolt',
  desc: 'Thralls hit half again as hard and move a quarter faster. They run hot.' });
defNode({ key: 'tame_mk3', branch: 'tame', title: 'TITAN LOBE', cost: 50, requires: ['tame_mk2'], icon: 'brain',
  desc: 'Schematic: a heat-finned lobe big enough for anything with a skull. Giant robot entity slaves.' });

export const maxThralls = () => (hasUnlock('tame_pack') ? 6 : 3);

// ---------------------------------------------------------------- items
function puck(mb: ModelBuilder, led: number) {
  mb.cylinder(0, 0, 0, 0.045, 0.026, 10, 'metal_brushed', { color: 0xb8c0c8 });
  mb.cylinder(0, 0.026, 0, 0.034, 0.008, 10, 'metal_brass');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.box(Math.cos(a) * 0.04, 0.013, Math.sin(a) * 0.04, 0.012, 0.03, 0.012, 'plastic_black'); }
  mb.box(0, 0.036, 0, 0.012, 0.006, 0.012, 'white', { color: led, emissive: 1.6 });
  mb.box(0.026, 0.03, 0, 0.022, 0.004, 0.006, 'metal_brass', { color: 0xd88a3a });
}
function servo(mb: ModelBuilder, led: number) {
  mb.sphere(0, 0.04, 0, 0.055, 10, 6, 'metal_painted_green', { color: 0x8a96a0, sy: 0.75 });
  mb.cylinder(0, 0, 0, 0.06, 0.018, 12, 'metal_dark');
  for (const s of [-1, 1]) mb.box(s * 0.062, 0.03, 0, 0.012, 0.03, 0.03, 'metal_grey');
  for (let i = 0; i < 3; i++) mb.box(-0.02 + i * 0.02, 0.085, 0.02, 0.01, 0.006, 0.01, 'white', { color: led, emissive: 1.6 });
  mb.box(0, 0.06, -0.045, 0.05, 0.012, 0.012, 'metal_brass', { color: 0xd88a3a });
}
function titan(mb: ModelBuilder, led: number) {
  mb.box(0, 0.04, 0, 0.13, 0.08, 0.1, 'metal_dark', { color: 0x606870 });
  for (let i = 0; i < 6; i++) mb.box(-0.055 + i * 0.022, 0.095, 0, 0.006, 0.03, 0.09, 'metal_brushed');
  mb.cylinder(-0.072, 0.04, 0, 0.022, 0.05, 8, 'metal_brass');
  for (let i = 0; i < 4; i++) mb.box(0.068, 0.02 + i * 0.016, 0.03, 0.006, 0.008, 0.008, 'white', { color: led, emissive: 1.8 });
  mb.box(0, 0.0, 0, 0.14, 0.012, 0.11, 'plastic_black');
}
export const BRAIN_MODELS: Record<string, (mb: ModelBuilder) => void> = {
  brain_mk1: (mb) => puck(mb, BRAINS[0].led),
  brain_mk2: (mb) => servo(mb, BRAINS[1].led),
  brain_mk3: (mb) => titan(mb, BRAINS[2].led),
};

defItem({ key: 'brain_mk1', name: BRAINS[0].name, cat: 'electronics', weight: 0.4, value: 160, noStack: true, tags: ['mech_brain'],
  desc: 'A steel puck of solder and stolen firmware. Runs anything up to the size of a dog. Install it where a small skull keeps its brain.',
  model: BRAIN_MODELS.brain_mk1 });
defItem({ key: 'brain_mk2', name: BRAINS[1].name, cat: 'electronics', weight: 0.9, value: 420, noStack: true, tags: ['mech_brain'],
  desc: 'Servo rings round a ceramic core. Drives anything up to the size of a person, and most things a little bigger.',
  model: BRAIN_MODELS.brain_mk2 });
defItem({ key: 'brain_mk3', name: BRAINS[2].name, cat: 'electronics', weight: 2.2, value: 1100, noStack: true, tags: ['mech_brain'], rare: true,
  desc: 'Heat fins, a capacitor bank and a red eye. Rated for "non-standard anatomy". Anything with a skull.',
  model: BRAIN_MODELS.brain_mk3 });

// ---------------------------------------------------------------- recipes (schematics learned through research)
defRecipe({ key: 'make_brain_mk1', name: 'Assemble Cortex Puck', category: 'electrical', time: 25, learned: true,
  inputs: [{ item: 'electronics_scrap', count: 2 }, { item: 'wire' }, { item: 'battery' }, { item: 'scrap_metal' }, { item: '#screwdriver', keep: true }],
  outputs: [{ item: 'brain_mk1' }], anim: 'craft', xp: ['electrical', 15], desc: 'Solder a firmware board into a steel puck, coil the leads.' });
defRecipe({ key: 'make_brain_mk2', name: 'Assemble Servo Cortex', category: 'electrical', time: 40, learned: true,
  inputs: [{ item: 'electronics_scrap', count: 3 }, { item: 'wire', count: 2 }, { item: 'power_bank' }, { item: 'sheet_metal' }, { item: 'spring', count: 2 }, { item: '#screwdriver', keep: true }],
  outputs: [{ item: 'brain_mk2' }], anim: 'craft', xp: ['electrical', 30], desc: 'Servo rings, a ceramic core, a power bank to keep it dreaming.' });
defRecipe({ key: 'make_brain_mk3', name: 'Assemble Titan Lobe', category: 'electrical', time: 60, learned: true, needs: ['workbench'],
  inputs: [{ item: 'electronics_scrap', count: 4 }, { item: 'wire', count: 3 }, { item: 'car_battery' }, { item: 'sheet_metal', count: 2 }, { item: 'memory_shard' }, { item: '#screwdriver', keep: true }],
  outputs: [{ item: 'brain_mk3' }], anim: 'hammer', xp: ['electrical', 60], desc: 'A car battery heart, a memory shard for a soul, fins to bleed the heat.' });

/** recipe keys a research node teaches */
export const NODE_RECIPES: Record<string, string> = { tame_mk1: 'make_brain_mk1', tame_mk2: 'make_brain_mk2', tame_mk3: 'make_brain_mk3' };
export const brainName = (key: string) => itemDef(key).name;

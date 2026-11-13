// FIRST CAMP (round 16): the early-run tasks on Dr. Calder's board that walk a new
// unit into building. They come straight after the pack tutorial, one at a time:
// salvage, plant a flag, a crate, walls, a bench, a bed, and the first night watch.
// Each one pays in research and a little of what the next one needs.
import { G } from '../game/G';
import { bus } from '../core/events';
import { defQuest } from '../game/quests';
import { defNode, researchNode } from '../game/research';
import { countIn, marked, mark, bump } from './progress';
import { storeItems } from '../craft/stores';
import type { Piece } from './pieces';
import type { Recipe } from '../items/recipes';
import type { Player } from '../entities/player';

const CALDER = 'DR. CALDER';
/** carried, or in a crate of the camp you are standing in */
const have = (key: string, n: number) => () => {
  const p = G.local; if (!p) return 0;
  let k = 0;
  for (const it of [...p.allItems(), ...storeItems(p)]) if (it.key === key) k++;
  return Math.min(1, k / n);
};
const any = (m: unknown, ...keys: string[]) => keys.some((k) => marked(m, 'piece:' + k));

defQuest({
  key: 'fc_salvage', title: 'Salvage', giver: CALDER, category: 'build', auto: true, requires: ['cq_cube'],
  desc: 'The Institute sent you down with a hammer and a box of nails, which is more than the last unit got. Furniture is lumber. Break some, keep the planks, tear a rag or two off whatever is soft.',
  objectives: [
    { id: 'planks', text: 'Carry 3 Planks (smash wooden furniture)', check: have('plank', 3) },
    { id: 'rags', text: 'Carry 2 Rags (tear up cloth)', check: have('rag', 2) },
  ],
  reward: { rp: 2, items: [['plank', 1]] },
});
defQuest({
  key: 'fc_flag', title: 'Plant a Flag', giver: CALDER, category: 'build', auto: true, requires: ['fc_salvage'],
  desc: 'Pick a room with one way in. Press B: the ghost shows where things go, the words over it show what they cost. Tab turns the shelf to LIVING. Click to tack the Camp Flag up, then hold the button on it until the nails are in.',
  objectives: [{ id: 'flag', text: 'Build a Camp Flag (B, LIVING shelf)', check: (m) => any(m, 'camp_flag', 'beacon') }],
  reward: { rp: 2, items: [['plank', 2]] },
});
defQuest({
  key: 'fc_store', title: 'Somewhere to Put Things', giver: CALDER, category: 'build', auto: true, requires: ['fc_flag'],
  desc: 'A crate inside the flag\'s ring is part of your hands: what is in it counts when you build or craft anywhere in the camp. Nail one together.',
  objectives: [{ id: 'crate', text: 'Build a Storage Crate', check: (m) => any(m, 'crate', 'locker') }],
  reward: { rp: 2, items: [['nails', 1]] },
});
defQuest({
  key: 'fc_walls', title: 'Four Walls', giver: CALDER, category: 'build', auto: true, requires: ['fc_store'],
  desc: 'Things live down here, unit, and some of them will come and look at what you built. Close the gaps: plank walls, a door, a barricade across the corridor. Whatever is in the way, they have to break.',
  objectives: [{ id: 'walls', text: 'Put up 3 walls, doors or barricades', check: (m) => Math.min(1, countIn(m, 'camp_wall') / 3) }],
  reward: { rp: 3, items: [['nails', 1], ['plank', 2]] },
});
defQuest({
  key: 'fc_bench', title: 'A Bench', giver: CALDER, category: 'build', auto: true, requires: ['fc_walls'],
  desc: 'A Carpenter\'s Workbench (MACH shelf). Hinges, harnesses, nails cut from scrap: the parts that the metal pieces want are made on benches, and a better bench makes better parts.',
  objectives: [
    { id: 'bench', text: 'Build a Carpenter\'s Workbench', check: (m) => any(m, 'worktable', 'mech_bench', 'machine_bench') },
    { id: 'part', text: 'Make something that needs a workbench', check: (m) => !!m?.flags?.has('craft:benchpart') || !!m?.flags?.has('craft:bench') },
  ],
  reward: { rp: 3, items: [['scrap_metal', 2]] },
});
defQuest({
  key: 'fc_bed', title: 'A Bed of Your Own', giver: CALDER, category: 'build', auto: true, requires: ['fc_bench'],
  desc: 'A Plank Bunk. Sleep in it, or make it (U beside it), and the relay holds a checkpoint there: if your unit is deleted, the next one wakes up in your bed instead of at the start.',
  objectives: [
    { id: 'bunk', text: 'Build a Plank Bunk', check: (m) => any(m, 'bunk', 'cot') },
    { id: 'cp', text: 'Hold a checkpoint in it', check: (m) => marked(m, 'camp:bed') },
  ],
  reward: { rp: 4, items: [['bedsheet', 1]] },
});
defQuest({
  key: 'fc_watch', title: 'Night Watch', giver: CALDER, category: 'build', auto: true, requires: ['fc_bed'],
  desc: 'Every camp gets visitors. Put a tin-can tripwire where something would come in, keep the stores fed, and see what your walls are worth when the first one comes probing.',
  objectives: [
    { id: 'trap', text: 'Build a tripwire, trap or spikes', check: (m) => any(m, 'tripwire', 'jaw_trap', 'spikes') },
    { id: 'probe', text: 'Something probes the camp', check: (m) => marked(m, 'camp:probed') },
  ],
  reward: { rp: 5, items: [['spring', 2]], unlock: ['bp_traps'] },
});
defQuest({
  key: 'fc_upgrade', title: 'Scrap to Steel', giver: 'MERIDIAN R&D', category: 'build', requires: ['fc_walls', 'q_bld_scrap'],
  desc: 'R&D wants to see a wooden camp turn into a metal one. In build mode, point at a plank wall or a crate and press U: the next tier goes on over it, in place.',
  objectives: [{ id: 'up', text: 'Upgrade 2 pieces (U in build mode)', check: (m) => Math.min(1, countIn(m, 'bld_upgrade') / 2) }],
  reward: { rp: 5, items: [['sheet_metal', 2]] },
});

// marks the quests read
let wired = false;
export function wireFirstCamp() {
  if (wired) return;
  wired = true;
  bus.on('bldWelded', (_z: unknown, pc: Piece, _o: unknown, by: string | null) => {
    if (by !== G.local?.id) return;
    if (pc.kind === 'wall' || pc.kind === 'door' || pc.key === 'barricade' || pc.key === 'metal_barricade') bump('camp_wall');
  });
  bus.on('crafted', (p: Player, r: Recipe) => {
    if (p !== G.local || !r?.needs) return;
    if (r.needs.some((n) => n === 'workbench' || n === 'bench2' || n === 'bench3')) G.missions?.set?.('craft:benchpart');
  });
  void mark;
}

// ---------------------------------------------------------------- building starts early: the first blueprints are cheap
for (const [k, cost] of [['bp_spikes', 0], ['bp_hatch', 2], ['bp_mech_bench', 3], ['bp_compactor', 4], ['bp_gen_rig', 4]] as [string, number][]) {
  const n = researchNode(k);
  if (n) defNode({ ...n, cost });
}

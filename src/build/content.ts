// Research blueprints (branch 'blueprint') and quests for building and farming.
import { G } from '../game/G';
import { defNode } from '../game/research';
import { defQuest } from '../game/quests';
import { countIn, marked } from './progress';

const carry = (key: string, n: number) => () => {
  const p = G.local; if (!p) return 0;
  let k = 0; for (const it of p.allItems()) if (it.key === key) k++;
  return Math.min(1, k / n);
};

// ---------------------------------------------------------------- blueprints
defNode({ key: 'bp_spikes', branch: 'blueprint', title: 'Rebar Spikes', desc: 'Weld sharpened rebar to a plate. Anything that walks over it regrets it.', cost: 2, icon: 'spikes' });
defNode({ key: 'bp_hatch', branch: 'blueprint', title: 'Bulkhead Hatch', desc: 'A welded door hung in a scrap-plate wall on a spring hinge.', cost: 3, icon: 'door' });
defNode({ key: 'bp_hydro', branch: 'blueprint', title: 'Hydro Rack', desc: 'Two-tier hydroponic rack with grow LEDs. Fast crops, little water, needs power.', cost: 4, icon: 'plant' });
defNode({ key: 'bp_mech_bench', branch: 'blueprint', title: 'Powered Workbench', desc: 'The first mechanical table: motorised vise, grinder, drill press. Counts as a workbench.', cost: 4, icon: 'bench' });
defNode({ key: 'bp_compactor', branch: 'blueprint', title: 'Scrap Compactor', desc: 'A hydraulic platen: three scrap in, one sheet of metal out.', cost: 5, requires: ['bp_mech_bench'], icon: 'press' });
defNode({ key: 'bp_gen_rig', branch: 'blueprint', title: 'Generator Rig', desc: 'Two salvaged motors run backwards off a fuel drum. Power for the whole base.', cost: 5, requires: ['bp_mech_bench'], icon: 'power' });
defNode({ key: 'bp_turret', branch: 'blueprint', title: 'Pipe Sentry', desc: 'A motor-swivelled nail cannon. Shoots anything that is not a friend.', cost: 7, requires: ['bp_gen_rig'], icon: 'turret' });

// ---------------------------------------------------------------- quests
defQuest({
  key: 'q_bld_scrap', title: 'Scrap Yard', giver: 'MERIDIAN R&D', category: 'build',
  desc: 'R&D wants to know if debtors can build. Smash furniture and bring back what it was made of. Pass the test and they will send you a torch.',
  objectives: [
    { id: 'scrap', text: 'Carry 3 Scrap Metal', check: carry('scrap_metal', 3) },
    { id: 'sheet', text: 'Carry 1 Sheet Metal', check: carry('sheet_metal', 1) },
  ],
  reward: { rp: 2, items: [['welding_torch', 1]] },
});
defQuest({
  key: 'q_bld_sparks', title: 'Sparks', giver: 'MERIDIAN R&D', category: 'build', requires: ['q_bld_scrap'],
  desc: 'Press B. Tack a frame together, then hold the torch to it until the seams glow. Don\'t look directly at the arc.',
  objectives: [{ id: 'weld', text: 'Weld any piece in build mode', check: (m) => countIn(m, 'bld_weld') >= 1 }],
  reward: { rp: 3 },
});
defQuest({
  key: 'q_bld_claim', title: 'Stake a Claim', giver: 'VOSS', category: 'build', requires: ['q_bld_sparks'],
  desc: '"A debtor with an address is a debtor who comes back." Weld a Claim Beacon and put up some walls around it.',
  objectives: [
    { id: 'beacon', text: 'Weld a Claim Beacon', check: (m) => marked(m, 'piece:beacon') },
    { id: 'welds', text: 'Weld 5 pieces', check: (m) => Math.min(1, countIn(m, 'bld_weld') / 5) },
  ],
  reward: { rp: 4, items: [['steel_frame', 1], ['motor', 1]] },
});
defQuest({
  key: 'q_bld_table', title: 'Mechanical Table', giver: 'MERIDIAN R&D', category: 'build', requires: ['q_bld_claim'],
  desc: 'Research the Powered Workbench blueprint on the watch, then weld one. R&D will pay to watch you use it.',
  objectives: [{ id: 'bench', text: 'Weld a Powered Workbench', check: (m) => marked(m, 'piece:mech_bench') }],
  reward: { rp: 6, unlock: ['bp_compactor'] },
});
defQuest({
  key: 'q_bld_defend', title: 'Hold the Line', giver: 'VOSS', category: 'build', requires: ['q_bld_claim'],
  desc: 'Things will come for what you built. Raise your settlement\'s defence to 10: plate walls, spikes, sentries.',
  objectives: [{ id: 'def', text: 'Settlement defence 10+', check: (m) => marked(m, 'settle:def10') }],
  reward: { rp: 6 },
});
defQuest({
  key: 'q_bld_mega', title: 'Mega Base', giver: 'VOSS', category: 'build', requires: ['q_bld_defend'],
  desc: 'Defence, comfort, food, power. Build a base so big the Institute has to send someone to look at it.',
  objectives: [
    { id: 'settle', text: 'Reach SETTLEMENT rank', check: (m) => marked(m, 'settle:settlement') },
    { id: 'mega', text: 'Reach MEGA BASE rank', check: (m) => marked(m, 'settle:mega') },
  ],
  reward: { rp: 25, scrip: 500 },
});
defQuest({
  key: 'q_farm_green', title: 'Green Under Fluorescents', giver: 'VOSS', category: 'farm', requires: ['q_bld_sparks'],
  desc: 'Weld a planter, sow seeds, keep them wet and lit. A strip light will do; the Lobby\'s lights will not care either way.',
  objectives: [{ id: 'harvest', text: 'Harvest a crop from a planter', check: (m) => countIn(m, 'farm_harvest') >= 1 }],
  reward: { rp: 3, items: [['seeds_tomato', 1], ['seeds_lettuce', 1]] },
});
defQuest({
  key: 'q_farm_hydro', title: 'Hydroponics', giver: 'MERIDIAN R&D', category: 'farm', requires: ['q_farm_green'],
  desc: 'Feed a settlement. Four crops growing at once under one beacon, and ten harvests in all.',
  objectives: [
    { id: 'four', text: 'Grow 4 crops in one settlement', check: (m) => marked(m, 'settle:farm4') },
    { id: 'ten', text: 'Harvest 10 times', check: (m) => Math.min(1, countIn(m, 'farm_harvest') / 10) },
  ],
  reward: { rp: 6, unlock: ['bp_hydro'] },
});

// Items, the bag and the recipe of THE FIRST RUN (round 19, src/game/tutorial/firstRun.ts): the Meridian supply
// bag the unit's kit comes down in, the band's dead field radio, the transistor it needs, and the bench recipe
// that puts the two together.
import { defItem } from '../../items/item';
import { defObj } from '../../world/objects';
import { defRecipe } from '../../items/recipes';
import { tex } from './_kit';

const D_RADIO = tex('i_fr_radio', 16, 12, (pc) => {
  pc.fill(0x4a5238);
  pc.rect(2, 2, 8, 8, 0x22261c);
  pc.each((x, y) => { if (x >= 2 && x < 10 && y >= 2 && y < 10 && (x + y) % 2 === 0) pc.set(x, y, 0x3a4030); });
  pc.rect(11, 2, 3, 3, 0x1a1a14); pc.set(12, 3, 0x6a6a58);
  pc.rect(11, 7, 3, 1, 0xc8b070); pc.set(13, 9, 0x7a2018);
  pc.strokeRect(0, 0, 16, 12, 0x2a301e);
});
const D_TRANS = tex('i_fr_transistor', 8, 8, (pc) => {
  pc.fill(0x1c1c1c);
  pc.hline(1, 6, 1, 0x3a3a3a); pc.set(2, 3, 0xd8d8d0); pc.set(3, 3, 0xd8d8d0); pc.set(4, 3, 0xd8d8d0);
  pc.strokeRect(0, 0, 8, 8, 0x0a0a0a);
});

defItem({
  key: 'field_radio_dead', name: 'Dead Field Radio', cat: 'electronics', weight: 0.9, tags: ['electronics', 'radio', 'broken'], value: 4, grid: [2, 1],
  desc: 'The band\'s relay set, issued with the unit. Silent. The output transistor has blown: there is a scorched gap on the board where it sat.',
  model: (mb) => {
    mb.box(0, 0.05, 0, 0.16, 0.1, 0.07, D_RADIO, { color: 0xffffff });
    mb.box(0, 0.005, 0, 0.165, 0.01, 0.075, 'metal_dark');
    mb.cylinder(0.055, 0.1, 0.02, 0.006, 0.12, 6, 'chrome');
    mb.cylinder(-0.04, 0.06, 0.036, 0.012, 0.006, 10, 'metal_dark');
    mb.box(0.03, 0.03, 0.036, 0.02, 0.012, 0.004, 'plastic_black');
  },
});

defItem({
  key: 'transistor', name: 'Power Transistor', cat: 'material', weight: 0.02, tags: ['electronics', 'part'], value: 6, grid: [1, 1],
  desc: 'A black power transistor in a metal tab, three legs bent the way they came out of whatever it was in. The radio wants one.',
  model: (mb) => {
    mb.box(0, 0.012, 0, 0.022, 0.024, 0.008, D_TRANS, { color: 0xffffff });
    mb.box(0, 0.03, -0.002, 0.022, 0.014, 0.003, 'chrome');
    mb.cylinder(0, 0.035, -0.002, 0.003, 0.004, 8, 'metal_dark');
    for (const x of [-0.007, 0, 0.007]) mb.box(x, -0.008, 0.001, 0.0018, 0.022, 0.0018, 'chrome');
  },
});

// the supply bag: an olive canvas duffel with webbing handles, a stencilled Meridian disc and a brass zip pull
defObj({
  key: 'supply_bag', name: 'Meridian Supply Bag', w: 1, d: 1, height: 0.34, block: 'none',
  container: { capacity: 30, kind: 'pile', name: 'Supply bag' },
  sound: 'fabric', flammable: 0.7,
  desc: 'An Institute supply bag, dropped down the link with the unit. Its issue kit is inside.',
  tags: ['bag', 'supply'],
  model: (mb) => {
    // the body (a soft box, its ends tucked), the zip along the top, two webbing handles, the stencilled disc
    mb.box(0, 0, 0, 0.6, 0.24, 0.3, 'fabric_green', { color: 0x7c8a52 });
    mb.box(-0.31, 0.02, 0, 0.03, 0.2, 0.26, 'fabric_green', { color: 0x6a7646 });
    mb.box(0.31, 0.02, 0, 0.03, 0.2, 0.26, 'fabric_green', { color: 0x6a7646 });
    mb.box(0, 0.24, 0, 0.54, 0.012, 0.03, 'metal_dark');
    mb.box(0.22, 0.25, 0.02, 0.04, 0.012, 0.022, 'plastic_yellow');
    for (const x of [-0.15, 0.15]) { mb.box(x, 0.24, -0.06, 0.035, 0.07, 0.014, 'plastic_black'); mb.box(x, 0.24, 0.06, 0.035, 0.07, 0.014, 'plastic_black'); mb.box(x, 0.3, 0, 0.035, 0.014, 0.135, 'plastic_black'); }
    for (const x of [-0.22, 0.22]) mb.box(x, 0, 0, 0.04, 0.245, 0.305, 'plastic_black');
    mb.box(0, 0.06, 0.151, 0.12, 0.12, 0.004, 'plastic_white', { color: 0xe8d8a0 });
  },
});

// the radio repair at the bench: the dead set and the transistor make a working radio (no tools: the clips push in)
defRecipe({
  key: 'fix_field_radio', name: 'Fit the Transistor', category: 'electrical', time: 6,
  inputs: [{ item: 'field_radio_dead' }, { item: 'transistor' }],
  outputs: [{ item: 'radio_portable' }], anim: 'craft', xp: ['electrical', 3],
});

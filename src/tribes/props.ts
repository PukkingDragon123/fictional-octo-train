// Camp artefacts: each tribe raises a totem in the middle of its camp (they
// scan as tribal artefacts), and lays out a barter cloth to trade on. Rounded,
// worn, hand-made shapes: lathed posts, bevelled boards, slumped wax.
import { defObj } from '../world/objects';
import type { ModelBuilder } from '../gfx/modelBuilder';
import { rbox, capsule, ring, dome, blob } from '../scan/shapes';

const T = ['tribe', 'artefact'];

/** a turned post on a rough stone footing */
function post(mb: ModelBuilder, h: number, tex = 'wood_dark', r = 0.05) {
  dome(mb, 0, 0, 0, 0.24, 'stone_rough', { color: 0x6a6660, sy: 0.35 }, 12);
  mb.cylinder(0, 0, 0, r, h, 10, tex, { rTop: r * 0.8 });
  ring(mb, 0, 0.12, 0, r * 1.05, 0.008, 'fabric_brown', { color: 0x8a6a40 }, 12);
}

defObj({
  key: 'tribe_totem_tally', name: 'Tally Post', w: 1, d: 1, height: 2.2, block: 'solid', sound: 'wood', hp: 400,
  desc: 'A post nailed with chalkboards, each one solid with tally marks. The newest board says: YOU.', tags: [...T, 'tally'],
  model: (mb) => {
    post(mb, 2.1);
    for (let i = 0; i < 4; i++) {
      const y = 0.45 + i * 0.4, a = (i % 2 ? 0.3 : -0.25);
      mb.push().translate(0, y, 0.05).rotateY(a);
      rbox(mb, 0, -0.14, 0.02, 0.42 - i * 0.05, 0.28, 0.024, 'wood_light', { color: 0x2e3a30 }, 0.008, 2);
      for (let k = 0; k < 6; k++) capsule(mb, [-0.15 + k * 0.05, -0.1 + (k % 2) * 0.02, 0.034], [-0.15 + k * 0.05, 0.06 - (k % 2) * 0.03, 0.034], 0.004, 'white', { color: 0xf2f0e8 }, 4);
      capsule(mb, [-0.11, -0.05, 0.035], [0.11, -0.02, 0.035], 0.004, 'white', { color: 0xf2f0e8 }, 4);
      blob(mb, 0, 0.12, 0.035, 0.008, 0.008, 0.006, 'metal_dark', {}, 6);
      mb.pop();
    }
    for (let i = 0; i < 9; i++) mb.cylinder(Math.cos(i) * 0.055, 2.0 - i * 0.07, Math.sin(i) * 0.055, 0.014, 0.006, 10, 'metal_brass', { color: i % 2 ? 0xc8a040 : 0xa83020 });
    rbox(mb, 0, 2.1, 0, 0.5, 0.1, 0.12, 'plastic_yellow', { color: 0xe0a020 }, 0.03, 2);
  },
});

defObj({
  key: 'tribe_totem_wax', name: 'Wax Reliquary', w: 1, d: 1, height: 1.9, block: 'solid', sound: 'ceramic', hp: 300,
  light: { color: 0xffb050, intensity: 0.9, radius: 5, y: 1.4, kind: 'fire', flicker: 0.35, power: false },
  desc: 'Years of candles melted into a column the height of a person. A smooth white face is set in the top. It is warm.', tags: [...T, 'wax'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.33, 0.5, 18, 'white', { color: 0xe8dcc4, rTop: 0.27 });
    mb.cylinder(0, 0.5, 0, 0.27, 0.7, 16, 'white', { color: 0xefe3cc, rTop: 0.19 });
    mb.cylinder(0, 1.2, 0, 0.19, 0.38, 14, 'white', { color: 0xf4ead6, rTop: 0.13 });
    dome(mb, 0, 1.58, 0, 0.13, 'white', { color: 0xf4ead6, sy: 0.6 }, 12);
    // the face, smooth and patient
    blob(mb, 0, 1.45, 0.12, 0.09, 0.12, 0.05, 'white', { color: 0xf8f0e0 }, 12);
    for (const s of [-1, 1]) blob(mb, s * 0.035, 1.48, 0.165, 0.012, 0.005, 0.004, 'plastic_black', {}, 6);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39, r = 0.12 + (i % 4) * 0.05, y = 0.5 + (i % 5) * 0.22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.08 + (i % 3) * 0.05;
      mb.cylinder(x, y, z, 0.022, h, 8, 'white', { color: 0xf0e6d2 });
      dome(mb, x, y + h, z, 0.022, 'white', { color: 0xf0e6d2, sy: 0.5 }, 8);
      mb.cylinder(x, y + h + 0.008, z, 0.011, 0.045, 6, 'white', { rTop: 0, color: 0xffb040, emissive: 2.2, caps: false });
    }
    // drips running down the column
    for (let i = 0; i < 9; i++) { const a = i * 0.7; capsule(mb, [Math.cos(a) * 0.29, 0.48 - (i % 3) * 0.05, Math.sin(a) * 0.29], [Math.cos(a) * 0.32, 0.2 - (i % 4) * 0.04, Math.sin(a) * 0.32], 0.018, 'white', { color: 0xe8dcc4 }, 6); }
  },
});

defObj({
  key: 'tribe_totem_turnkey', name: 'Voided Shield', w: 1, d: 1, height: 2.0, block: 'solid', sound: 'metal', hp: 500,
  desc: 'A Meridian riot shield on a pole, the crest scraped off and the word VOID painted over it. Badges hang from it like fruit.', tags: [...T, 'turnkey'],
  model: (mb) => {
    post(mb, 1.95, 'metal_dark', 0.035);
    rbox(mb, 0, 0.38, 0.06, 0.6, 0.95, 0.03, 'glass_dark', { color: 0x4a5260 }, 0.08, 3);
    capsule(mb, [-0.29, 1.3, 0.08], [0.29, 1.3, 0.08], 0.012, 'metal_grey', {}, 6);
    rbox(mb, 0, 0.9, 0.078, 0.44, 0.1, 0.006, 'white', { color: 0xc82a20 }, 0.003, 1);
    for (let i = 0; i < 8; i++) { const x = -0.25 + (i % 4) * 0.16, y = 0.46 - Math.floor(i / 4) * 0.12; capsule(mb, [x, y + 0.06, 0.08], [x, y + 0.035, 0.08], 0.002, 'metal_grey', {}, 4); mb.push().translate(x, y, 0.082).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.026, 0.006, 10, 'metal_brass', { color: 0xc8b060 }); mb.pop(); }
    capsule(mb, [-0.25, 1.95, 0], [0.25, 1.95, 0], 0.022, 'metal_grey', {}, 6);
    for (const s of [-1, 1]) capsule(mb, [s * 0.25, 1.94, 0], [s * 0.26, 1.72, 0.01], 0.014, 'fabric_red', { color: 0xc82a20 }, 6);
  },
});

defObj({
  key: 'tribe_totem_cog', name: 'Machine Shrine', w: 1, d: 1, height: 2.1, block: 'solid', sound: 'metal', hp: 450,
  light: { color: 0x9ce07a, intensity: 0.75, radius: 5, y: 1.2, kind: 'screen', flicker: 0.15, power: false },
  desc: 'Dead televisions stacked into an altar, wired to a car battery. Every screen shows the same green line, rising and falling like breath.', tags: [...T, 'cog'],
  model: (mb) => {
    rbox(mb, 0, 0, 0, 0.62, 0.45, 0.5, 'metal_dark', { color: 0x4a4a48 }, 0.04, 2);
    for (let i = 0; i < 3; i++) {
      const y = 0.45 + i * 0.42, s = 1 - i * 0.18;
      rbox(mb, 0, y, 0, 0.5 * s, 0.4 * s, 0.4 * s, 'plastic_beige', { color: 0xb8b0a0 }, 0.06 * s, 3);
      rbox(mb, 0, y + 0.05 * s, 0.17 * s, 0.38 * s, 0.27 * s, 0.07 * s, 'white', { color: 0x1a4a2a, emissive: 0.6 }, 0.05 * s, 3);
      capsule(mb, [-0.13 * s, y + 0.19 * s, 0.215 * s], [0.13 * s, y + 0.16 * s, 0.215 * s], 0.006, 'white', { color: 0x9ce07a, emissive: 1.4 }, 4);
      for (const k of [-1, 1]) blob(mb, 0.21 * s, y + 0.08 * s + k * 0.05 * s, 0.17 * s, 0.018 * s, 0.018 * s, 0.012, 'plastic_black', {}, 8);
    }
    for (let i = 0; i < 5; i++) capsule(mb, [-0.25 + i * 0.12, 0.05, -0.26], [-0.22 + i * 0.1, 1.2 + (i % 2) * 0.4, -0.2], 0.012, 'rubber_black', {}, 5);
    mb.cylinder(0, 1.72, 0, 0.018, 0.33, 8, 'metal_brass');
    mb.sphere(0, 2.08, 0, 0.04, 10, 6, 'glass', { color: 0xd8e0d8 });
    capsule(mb, [0, 2.06, 0], [0, 2.1, 0], 0.008, 'white', { color: 0xffa040, emissive: 2.2 }, 5);
  },
});

defObj({
  key: 'tribe_barter', name: 'Barter Cloth', w: 1, d: 1, height: 0.45, block: 'low', sound: 'fabric', hp: 120,
  desc: 'A canvas cloth over a crate, laid out with goods. Prices are chalked on a slate.', tags: ['tribe', 'trade'],
  model: (mb) => {
    rbox(mb, 0, 0, 0, 0.7, 0.36, 0.6, 'wood_crate', {}, 0.025, 2);
    rbox(mb, 0, 0.35, 0, 0.78, 0.025, 0.68, 'fabric_brown', { color: 0xb8a078 }, 0.012, 2);
    for (const s of [-1, 1]) rbox(mb, s * 0.385, 0.16, 0, 0.014, 0.2, 0.66, 'fabric_brown', { color: 0xa89068 }, 0.006, 1);
    mb.cylinder(-0.2, 0.375, -0.12, 0.04, 0.09, 12, 'metal_grey');
    mb.cylinder(-0.1, 0.375, -0.14, 0.04, 0.09, 12, 'metal_grey', { color: 0xc8a040 });
    rbox(mb, 0.12, 0.375, -0.1, 0.16, 0.05, 0.1, 'cardboard', {}, 0.01, 1);
    rbox(mb, 0.18, 0.375, 0.14, 0.2, 0.014, 0.14, 'stone_rough', { color: 0x2a3230 }, 0.006, 1);
    capsule(mb, [0.12, 0.392, 0.14], [0.24, 0.392, 0.14], 0.003, 'white', { color: 0xf0f0e8 }, 4);
    blob(mb, -0.15, 0.39, 0.15, 0.05, 0.02, 0.03, 'plastic_yellow', { color: 0xd8b040 }, 8);
  },
});

// ---------------------------------------------------------------- round 15: the camp as a base
// A barricade along the camp's edge (gaps left for doors), a kitchen by the fire, lamps on
// poles. Everything salvaged from the rooms: office doors, chair legs, sandbagged carpet tiles.
defObj({
  key: 'camp_barricade', name: 'Barricade', w: 1, d: 1, height: 1.3, block: 'solid', sound: 'wood', hp: 260, flammable: 0.6,
  desc: 'Office doors, desk tops and chair legs nailed between two posts, sandbagged at the foot. Someone counted every nail.', tags: ['tribe', 'barricade', 'camp'],
  model: (mb) => {
    // sandbags (carpet-tile sacks) along the foot, two courses
    for (let i = 0; i < 4; i++) blob(mb, -0.36 + i * 0.24, 0.085, 0.1, 0.135, 0.09, 0.1, 'fabric_brown', { color: i % 2 ? 0x8a7a58 : 0x7a6c4e }, 10);
    for (let i = 0; i < 3; i++) blob(mb, -0.24 + i * 0.24, 0.235, 0.09, 0.13, 0.08, 0.095, 'fabric_brown', { color: i % 2 ? 0x968660 : 0x857452 }, 10);
    for (let i = 0; i < 4; i++) capsule(mb, [-0.36 + i * 0.24 - 0.1, 0.15, 0.19], [-0.36 + i * 0.24 + 0.1, 0.15, 0.19], 0.004, 'fabric_brown', { color: 0x4a3c28 }, 4);
    // the posts: one squared timber, one steel pipe, both sunk in the sacks
    rbox(mb, -0.43, 0, -0.04, 0.085, 1.28, 0.085, 'wood_dark', { color: 0x5a4430 }, 0.012, 2);
    mb.cylinder(0.43, 0, -0.04, 0.038, 1.22, 10, 'metal_rusty');
    ring(mb, 0.43, 1.22, -0.04, 0.04, 0.008, 'metal_rusty', {}, 10);
    // planks and a desk top, crooked, nailed and lashed
    const boards: [number, number, number, number, string, number][] = [[0.46, 0.07, 1.02, 0.13, 'wood_light', 0x9a7a52], [0.66, -0.05, 1.0, 0.11, 'wood_light', 0xa8885e], [0.88, 0.09, 1.04, 0.15, 'wood_dark', 0x6a5038], [1.1, -0.03, 0.98, 0.12, 'wood_light', 0x8e7048]];
    for (const [y, a, w, hgt, tex, col] of boards) {
      mb.push().translate(0, y, 0.01).rotateZ(a);
      rbox(mb, 0, -hgt / 2, 0, w, hgt, 0.03, tex, { color: col }, 0.008, 2);
      for (const s of [-1, 1]) { mb.cylinder(s * 0.43, -hgt / 2 + 0.03, 0.032, 0.009, 0.01, 6, 'metal_dark'); mb.cylinder(s * 0.43, -hgt / 2 - 0.03, 0.032, 0.009, 0.01, 6, 'metal_dark'); }
      mb.pop();
    }
    // a door from the yellow rooms leaning on the front, its brass knob still on
    mb.push().translate(-0.16, 0, 0.13).rotateX(-0.14).rotateZ(0.04);
    rbox(mb, 0, 0, 0, 0.44, 0.98, 0.04, 'wood_light', { color: 0xc8b078 }, 0.01, 2);
    rbox(mb, 0, 0.56, 0.02, 0.3, 0.32, 0.01, 'wood_light', { color: 0xb89e68 }, 0.004, 1);
    rbox(mb, 0, 0.12, 0.02, 0.3, 0.3, 0.01, 'wood_light', { color: 0xb89e68 }, 0.004, 1);
    mb.sphere(0.16, 0.5, 0.04, 0.022, 8, 6, 'metal_brass');
    mb.pop();
    // chair legs jammed through as spikes, pointing out
    for (let i = 0; i < 3; i++) capsule(mb, [-0.05 + i * 0.2, 0.74 + (i % 2) * 0.12, -0.02], [0.02 + i * 0.22, 0.86 + (i % 2) * 0.1, 0.38], 0.014, 'metal_grey', { color: 0x8a8a86 }, 6);
    // rope lashing round the pipe post, a rag of hi-vis tied on top
    for (let i = 0; i < 4; i++) ring(mb, 0.43, 0.5 + i * 0.05, -0.04, 0.046, 0.007, 'fabric_brown', { color: 0xc8b088 }, 10);
    capsule(mb, [0.43, 1.2, -0.02], [0.5, 1.02, 0.03], 0.022, 'plastic_yellow', { color: 0xe0b020 }, 6);
    // chalk tally marks on the top board
    for (let k = 0; k < 5; k++) capsule(mb, [-0.3 + k * 0.035, 1.02, 0.03], [-0.3 + k * 0.035, 1.09, 0.03], 0.003, 'white', { color: 0xf2f0e8 }, 4);
  },
});

defObj({
  key: 'camp_kitchen', name: 'Camp Kitchen', w: 1, d: 1, height: 0.95, block: 'table', surface: 0.62, sound: 'wood', hp: 160,
  light: { color: 0x6aa0ff, intensity: 0.35, radius: 1.6, y: 0.75, kind: 'fire', flicker: 0.25, power: false },
  desc: 'A door on two filing cabinets: a camping stove, a dented stock pot, tins, a board with something red on it. It smells like food. Mostly.', tags: ['tribe', 'camp', 'kitchen'],
  model: (mb) => {
    // two squat drawer units and a door laid across them
    for (const s of [-1, 1]) {
      rbox(mb, s * 0.27, 0, 0, 0.3, 0.58, 0.5, 'metal_grey', { color: 0x7a7e7a }, 0.02, 2);
      for (let d = 0; d < 2; d++) { rbox(mb, s * 0.27, 0.06 + d * 0.26, 0.252, 0.26, 0.22, 0.01, 'metal_grey', { color: 0x8a8e8a }, 0.006, 1); rbox(mb, s * 0.27, 0.22 + d * 0.26, 0.262, 0.09, 0.018, 0.012, 'metal_dark', {}, 0.004, 1); }
    }
    rbox(mb, 0, 0.58, 0, 0.92, 0.04, 0.6, 'wood_light', { color: 0xb0905e }, 0.01, 2);
    // the stove: a blue ring of flame under the pot
    rbox(mb, -0.2, 0.62, -0.04, 0.22, 0.06, 0.22, 'metal_dark', { color: 0x3a3c40 }, 0.012, 2);
    ring(mb, -0.2, 0.69, -0.04, 0.06, 0.008, 'white', { color: 0x5a8aff, emissive: 2.4 }, 14);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; capsule(mb, [-0.2 + Math.cos(a) * 0.05, 0.69, -0.04 + Math.sin(a) * 0.05], [-0.2 + Math.cos(a) * 0.1, 0.7, -0.04 + Math.sin(a) * 0.1], 0.006, 'metal_dark', {}, 4); }
    // the stock pot: dented, a stew on the boil, a ladle hooked on the rim
    mb.cylinder(-0.2, 0.7, -0.04, 0.105, 0.16, 16, 'metal_grey', { color: 0x9a9a96 });
    ring(mb, -0.2, 0.86, -0.04, 0.106, 0.008, 'metal_grey', { color: 0xb0b0aa }, 16);
    mb.cylinder(-0.2, 0.84, -0.04, 0.098, 0.01, 16, 'white', { color: 0x8a4a22 });
    for (let i = 0; i < 5; i++) blob(mb, -0.2 + Math.cos(i * 1.3) * 0.05, 0.852, -0.04 + Math.sin(i * 1.3) * 0.05, 0.018, 0.008, 0.016, 'white', { color: i % 2 ? 0xc89040 : 0x6a8a3a }, 6);
    for (const s of [-1, 1]) capsule(mb, [-0.2 + s * 0.1, 0.83, -0.04], [-0.2 + s * 0.13, 0.84, -0.04], 0.01, 'metal_dark', {}, 5);
    capsule(mb, [-0.13, 0.87, 0.0], [0.02, 1.02, 0.07], 0.008, 'metal_grey', {}, 5);
    // tins stacked, labels peeling; a cutting board with a red cut and a knife
    for (let i = 0; i < 3; i++) mb.cylinder(0.2 + (i % 2) * 0.07, 0.62 + Math.floor(i / 2) * 0.1, -0.16, 0.034, 0.095, 12, 'metal_grey', { color: [0xc84a2a, 0x3a6a9a, 0xd8b040][i] });
    rbox(mb, 0.16, 0.62, 0.1, 0.26, 0.022, 0.17, 'wood_light', { color: 0xd8b88a }, 0.006, 1);
    blob(mb, 0.13, 0.655, 0.1, 0.07, 0.022, 0.05, 'white', { color: 0x9a2a22 }, 10);
    blob(mb, 0.13, 0.66, 0.1, 0.05, 0.012, 0.03, 'white', { color: 0xe8d0c0 }, 8);
    rbox(mb, 0.25, 0.645, 0.12, 0.13, 0.004, 0.018, 'metal_grey', { color: 0xd0d0cc }, 0.002, 1);
    rbox(mb, 0.19, 0.645, 0.12, 0.05, 0.012, 0.016, 'leather_brown', { color: 0x2a1a10 }, 0.004, 1);
    // a gas canister under the table
    mb.cylinder(0.0, 0.0, 0.06, 0.07, 0.2, 12, 'plastic_yellow', { color: 0x2a6ac8 });
    capsule(mb, [0.0, 0.2, 0.06], [-0.18, 0.62, -0.04], 0.006, 'rubber_black', {}, 4);
  },
});

defObj({
  key: 'camp_lamp', name: 'Lamp Pole', w: 1, d: 1, height: 2.3, block: 'low', sound: 'metal', hp: 140,
  light: { color: 0xffc070, intensity: 1.05, radius: 6.5, y: 1.95, kind: 'fire', flicker: 0.18, power: false },
  desc: 'A length of conduit stood in a paint bucket of rubble, a hurricane lamp hung off a bent coat hook. The camp sleeps under it.', tags: ['tribe', 'camp', 'light'],
  model: (mb) => {
    // the bucket of rubble
    mb.cylinder(0, 0, 0, 0.16, 0.3, 14, 'plastic_yellow', { color: 0xd8d0c0, rTop: 0.18 });
    ring(mb, 0, 0.3, 0, 0.18, 0.012, 'plastic_yellow', { color: 0xc8c0b0 }, 14);
    for (let i = 0; i < 6; i++) blob(mb, Math.cos(i * 1.1) * 0.1, 0.3, Math.sin(i * 1.1) * 0.1, 0.05, 0.035, 0.045, 'stone_rough', { color: 0x8a8478 }, 6);
    capsule(mb, [0.17, 0.28, 0], [0.12, 0.38, 0], 0.006, 'metal_grey', {}, 4);
    // the pole and the hook arm
    mb.cylinder(0, 0.1, 0, 0.022, 2.12, 8, 'metal_grey', { color: 0x9a9890 });
    capsule(mb, [0, 2.15, 0], [0.32, 2.15, 0.02], 0.012, 'metal_grey', {}, 5);
    capsule(mb, [0.32, 2.15, 0.02], [0.33, 2.05, 0.02], 0.008, 'metal_grey', {}, 5);
    for (let i = 0; i < 3; i++) ring(mb, 0, 1.1 + i * 0.04, 0, 0.026, 0.006, 'plastic_black', { color: 0x1a1a1a }, 8);
    // the hurricane lamp: base, wire guard, glowing chimney, cap and bail
    const lx = 0.33, ly = 1.78, lz = 0.02;
    mb.cylinder(lx, ly, lz, 0.06, 0.05, 12, 'metal_rusty', { color: 0xb84020 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; capsule(mb, [lx + Math.cos(a) * 0.055, ly + 0.05, lz + Math.sin(a) * 0.055], [lx + Math.cos(a) * 0.05, ly + 0.2, lz + Math.sin(a) * 0.05], 0.004, 'metal_dark', {}, 4); }
    mb.cylinder(lx, ly + 0.05, lz, 0.042, 0.15, 12, 'white', { color: 0xffd090, emissive: 1.6, rTop: 0.03 });
    mb.cylinder(lx, ly + 0.08, lz, 0.012, 0.05, 8, 'white', { color: 0xfff0c0, emissive: 3.0, rTop: 0.002 });
    mb.cylinder(lx, ly + 0.2, lz, 0.05, 0.04, 12, 'metal_rusty', { color: 0xb84020, rTop: 0.02 });
    ring(mb, lx, ly + 0.26, lz, 0.035, 0.004, 'metal_dark', {}, 10, 'z');
    // a rag tied to the pole as a flag
    capsule(mb, [0, 2.0, 0], [-0.12, 1.86, 0.04], 0.03, 'fabric_red', { color: 0xa83a2a }, 6);
  },
});

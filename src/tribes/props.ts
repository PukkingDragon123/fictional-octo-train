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

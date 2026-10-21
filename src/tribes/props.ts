// Camp artefacts: each tribe raises a totem in the middle of its camp (they
// scan as tribal artefacts), and lays out a barter cloth to trade on.
import { defObj } from '../world/objects';
import type { ModelBuilder } from '../gfx/modelBuilder';

const T = ['tribe', 'artefact'];

function pole(mb: ModelBuilder, h: number, tex = 'wood_dark') { mb.box(0, 0, 0, 0.09, h, 0.09, tex); mb.box(0, 0, 0, 0.42, 0.06, 0.42, 'stone_rough', { color: 0x6a6660 }); }

defObj({
  key: 'tribe_totem_tally', name: 'Tally Post', w: 1, d: 1, height: 2.2, block: 'solid', sound: 'wood', hp: 400,
  desc: 'A post nailed with chalkboards, each one solid with tally marks. The newest board says: YOU.', tags: [...T, 'tally'],
  model: (mb) => {
    pole(mb, 2.1);
    for (let i = 0; i < 4; i++) {
      const y = 0.45 + i * 0.4, a = (i % 2 ? 0.3 : -0.25);
      mb.push().translate(0, y, 0.07).rotateY(a);
      mb.box(0, 0, 0, 0.42 - i * 0.05, 0.28, 0.02, 'wood_light', { color: 0x2e3a30 });
      for (let k = 0; k < 6; k++) mb.box(-0.15 + k * 0.05, 0.07 - (k % 2) * 0.12, 0.012, 0.008, 0.09, 0.004, 'white', { color: 0xf2f0e8 });
      mb.box(0, 0.0, 0.013, 0.2, 0.008, 0.004, 'white', { color: 0xf2f0e8 });
      mb.pop();
    }
    for (let i = 0; i < 9; i++) mb.cylinder(Math.cos(i) * 0.06, 2.0 - i * 0.07, Math.sin(i) * 0.06, 0.014, 0.006, 6, 'metal_brass', { color: i % 2 ? 0xc8a040 : 0xa83020 });
    mb.box(0, 2.15, 0, 0.5, 0.1, 0.12, 'plastic_yellow', { color: 0xe0a020 });
  },
});

defObj({
  key: 'tribe_totem_wax', name: 'Wax Reliquary', w: 1, d: 1, height: 1.9, block: 'solid', sound: 'ceramic', hp: 300,
  light: { color: 0xffb050, intensity: 0.9, radius: 5, y: 1.4, kind: 'fire', flicker: 0.35, power: false },
  desc: 'Years of candles melted into a column the height of a person. A smooth white face is set in the top. It is warm.', tags: [...T, 'wax'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.32, 0.5, 10, 'white', { color: 0xe8dcc4, rTop: 0.26 });
    mb.cylinder(0, 0.5, 0, 0.26, 0.7, 10, 'white', { color: 0xefe3cc, rTop: 0.18 });
    mb.cylinder(0, 1.2, 0, 0.18, 0.4, 8, 'white', { color: 0xf4ead6, rTop: 0.14 });
    mb.box(0, 1.42, 0.13, 0.18, 0.24, 0.04, 'white', { color: 0xf8f0e0 });
    for (const s of [-1, 1]) mb.box(s * 0.04, 1.47, 0.152, 0.02, 0.008, 0.004, 'plastic_black');
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39, r = 0.12 + (i % 4) * 0.05, y = 0.5 + (i % 5) * 0.22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.08 + (i % 3) * 0.05;
      mb.cylinder(x, y, z, 0.022, h, 6, 'white', { color: 0xf0e6d2 });
      mb.cylinder(x, y + h, z, 0.012, 0.04, 5, 'white', { rTop: 0, color: 0xffb040, emissive: 2.2, caps: false });
    }
    for (let i = 0; i < 6; i++) mb.box(Math.cos(i * 1.1) * 0.3, 0.3 - (i % 3) * 0.1, Math.sin(i * 1.1) * 0.3, 0.04, 0.2, 0.04, 'white', { color: 0xe8dcc4 });
  },
});

defObj({
  key: 'tribe_totem_turnkey', name: 'Voided Shield', w: 1, d: 1, height: 2.0, block: 'solid', sound: 'metal', hp: 500,
  desc: 'A Meridian riot shield on a pole, the crest scraped off and the word VOID painted over it. Badges hang from it like fruit.', tags: [...T, 'turnkey'],
  model: (mb) => {
    pole(mb, 1.95, 'metal_dark');
    mb.box(0, 0.85, 0.07, 0.6, 0.95, 0.03, 'glass_dark', { color: 0x4a5260 });
    mb.box(0, 1.3, 0.088, 0.62, 0.06, 0.01, 'metal_grey');
    mb.box(0, 0.95, 0.088, 0.44, 0.1, 0.006, 'white', { color: 0xc82a20 });
    for (let i = 0; i < 8; i++) mb.box(-0.25 + (i % 4) * 0.16, 0.42 - Math.floor(i / 4) * 0.12, 0.09, 0.05, 0.07, 0.008, 'metal_brass', { color: 0xc8b060 });
    mb.box(0, 1.95, 0, 0.5, 0.05, 0.05, 'metal_grey');
    for (const s of [-1, 1]) mb.box(s * 0.25, 1.85, 0, 0.03, 0.2, 0.03, 'fabric_red', { color: 0xc82a20 });
  },
});

defObj({
  key: 'tribe_totem_cog', name: 'Machine Shrine', w: 1, d: 1, height: 2.1, block: 'solid', sound: 'metal', hp: 450,
  light: { color: 0x9ce07a, intensity: 0.75, radius: 5, y: 1.2, kind: 'screen', flicker: 0.15, power: false },
  desc: 'Dead monitors stacked into an altar, wired to a car battery. Every screen shows the same green line, rising and falling like breath.', tags: [...T, 'cog'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.62, 0.45, 0.5, 'metal_dark', { color: 0x4a4a48 });
    for (let i = 0; i < 3; i++) {
      const y = 0.45 + i * 0.42, s = 1 - i * 0.18;
      mb.box(0, y, 0, 0.5 * s, 0.4 * s, 0.4 * s, 'plastic_beige', { color: 0xb8b0a0 });
      mb.box(0, y + 0.06 * s, 0.2 * s + 0.002, 0.38 * s, 0.26 * s, 0.006, 'white', { color: 0x1a4a2a, emissive: 0.6 });
      mb.box(0, y + 0.19 * s, 0.2 * s + 0.005, 0.3 * s, 0.012, 0.004, 'white', { color: 0x9ce07a, emissive: 1.4 });
    }
    for (let i = 0; i < 5; i++) mb.cylinder(-0.25 + i * 0.12, 0.05, -0.27, 0.012, 1.1 + (i % 2) * 0.4, 5, 'rubber_black');
    mb.cylinder(0, 1.72, 0, 0.02, 0.35, 5, 'metal_brass');
    mb.sphere(0, 2.08, 0, 0.04, 8, 5, 'glass', { color: 0xd8e0d8 }); mb.box(0, 2.08, 0, 0.012, 0.03, 0.012, 'white', { color: 0xffa040, emissive: 2.2 });
  },
});

defObj({
  key: 'tribe_barter', name: 'Barter Cloth', w: 1, d: 1, height: 0.45, block: 'low', sound: 'fabric', hp: 120,
  desc: 'A canvas cloth over a crate, laid out with goods. Prices are chalked on a slate.', tags: ['tribe', 'trade'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.7, 0.36, 0.6, 'wood_crate');
    mb.box(0, 0.36, 0, 0.78, 0.02, 0.68, 'fabric_brown', { color: 0xb8a078 });
    for (const s of [-1, 1]) mb.box(s * 0.385, 0.25, 0, 0.012, 0.2, 0.68, 'fabric_brown', { color: 0xa89068 });
    mb.cylinder(-0.2, 0.38, -0.12, 0.04, 0.09, 8, 'metal_grey');
    mb.cylinder(-0.1, 0.38, -0.14, 0.04, 0.09, 8, 'metal_grey', { color: 0xc8a040 });
    mb.box(0.12, 0.38, -0.1, 0.16, 0.05, 0.1, 'cardboard');
    mb.box(0.18, 0.38, 0.14, 0.2, 0.012, 0.14, 'stone_rough', { color: 0x2a3230 });
    mb.box(0.18, 0.392, 0.14, 0.12, 0.003, 0.006, 'white', { color: 0xf0f0e8 });
    mb.box(-0.15, 0.38, 0.15, 0.1, 0.03, 0.06, 'plastic_yellow', { color: 0xd8b040 });
  },
});

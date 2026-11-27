// Furniture — THE GROW ROOM AND THE YARD (round 25, src/build/farm.ts, src/game/economy/homestead.ts):
//   bld_hydro_tray  a two-metre hydroponic table under its own fluorescent hood: a white nutrient tray, a
//                   foam raft of net pots (six plants), a reservoir drum, a pump and a coil of feed tube.
//                   A planter (tag bplanter, hydro) that is its own grow light: a bright grow room is two of these.
//   bld_trough      a galvanised water trough on plank trestles with a ball-cock float: it waters every pen
//                   within two tiles, and rain or a can tops it up (state.water 0..100).
// Built from salvage like the rest of build mode: plate, pipe, plank and weld beads.
import { defObj } from '../../world/objects';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { rod } from './b_common';
import { plantVariant, lookOf, drawPlant, drawTrouble } from '../../game/economy/plantModels';

const T = ['build', 'buildable'];
const ST = 'metal_grey', DK = 'metal_dark', PL = 'q_rough_plank';
const P = (mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.022, t = ST) => rod(mb, x0, y0, z0, x1, y1, z1, r, 8, t);
const bead = (mb: ModelBuilder, x: number, y: number, z: number, r = 0.026) => mb.sphere(x, y, z, r, 7, 4, 'bt_seam', { color: 0xffd890, emissive: 0.25 });

// ---------------------------------------------------------------- the hydroponic tray table (2 x 1)
defObj({
  key: 'bld_hydro_tray', name: 'Hydroponic Tray', w: 2, d: 1, height: 1.75, block: 'low', sound: 'metal', flammable: 0, hp: 320,
  tags: [...T, 'farm', 'bplanter', 'hydro', 'growlight', 'station'],
  desc: 'A white nutrient tray on a steel table, a foam raft of net pots floating in it, two fluorescent tubes on a hood above. Crops grow under it twice as fast as in soil and drink half as much.',
  light: { color: 0xeef8ff, intensity: 1.2, radius: 4.5, y: 1.55, kind: 'fluoro', flicker: 0.02, power: false },
  variant: plantVariant,
  model: (mb, s) => {
    // the table: four pipe legs, a cross brace, a steel top with a rolled lip
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P(mb, sx * 0.92, 0, sz * 0.42, sx * 0.92, 0.72, sz * 0.42, 0.024); bead(mb, sx * 0.92, 0.72, sz * 0.42); mb.cylinder(sx * 0.92, 0, sz * 0.42, 0.035, 0.02, 8, 'rubber_black'); }
    P(mb, -0.92, 0.22, 0.42, 0.92, 0.22, 0.42, 0.016); P(mb, -0.92, 0.22, -0.42, 0.92, 0.22, -0.42, 0.016);
    mb.box(0, 0.72, 0, 1.94, 0.03, 0.94, { all: DK, top: 'bt_plate' });
    // the tray: white plastic, a dark band of nutrient water showing round the raft
    mb.box(0, 0.75, 0, 1.86, 0.14, 0.86, 'plastic_white', { color: 0xc8d2ce });
    mb.box(0, 0.885, 0, 1.8, 0.004, 0.8, 'water', { color: 0x5a8a7a, emissive: 0.15 });
    // the raft and its net pots (two rows of three)
    mb.box(0, 0.884, 0, 1.7, 0.03, 0.72, 'plastic_white', { color: 0xc4c8b8 });
    const pots: [number, number][] = [];
    for (const z of [-0.18, 0.18]) for (const x of [-0.56, 0, 0.56]) pots.push([x, z]);
    pots.forEach(([x, z], i) => {
      mb.cylinder(x, 0.88, z, 0.06, 0.04, 8, 'rubber_black', { rTop: 0.065 });
      mb.cylinder(x, 0.915, z, 0.056, 0.004, 8, 'ec_substrate', { color: 0x8a6a4a });
      if (!s.crop) return;
      const look = lookOf(s.crop as string) ?? 'cress';
      drawPlant(mb, look, x, 0.918, z, Math.floor(s.stage ?? 0), !!s.dead, i);
      if ((s.pest ?? 0) > 0.02 || (s.blight ?? 0) > 0.02) drawTrouble(mb, x, 0.918, z, Math.floor(s.stage ?? 0), s.pest ?? 0, s.blight ?? 0, i);
    });
    // the hood: two square posts at the back, a green steel canopy, two tubes in their end-caps, chains
    for (const sx of [-1, 1]) { P(mb, sx * 0.88, 0.75, -0.4, sx * 0.88, 1.62, -0.4, 0.02, 'metal_painted_green'); bead(mb, sx * 0.88, 0.75, -0.4); }
    P(mb, -0.88, 1.62, -0.4, 0.88, 1.62, -0.4, 0.018, 'metal_painted_green');
    mb.push().translate(0, 1.58, -0.02).rotateX(0.08);
    mb.box(0, 0, 0, 1.76, 0.04, 0.34, 'metal_painted_green');
    for (const sz of [-1, 1]) mb.box(0, -0.035, sz * 0.165, 1.76, 0.05, 0.012, 'metal_painted_green');
    for (const z of [-0.08, 0.08]) {
      mb.cylinderX(0, -0.03, z, 0.016, 1.62, 10, 'plastic_white', { emissive: 1.3, color: 0xf4fbff });
      for (const sx of [-1, 1]) mb.box(sx * 0.82, -0.045, z, 0.04, 0.04, 0.04, 'plastic_black');
    }
    mb.pop();
    for (const sx of [-1, 1]) { rod(mb, sx * 0.6, 1.62, -0.4, sx * 0.6, 1.6, -0.12, 0.006, 4, 'chrome'); }
    // under the table: the reservoir drum, the pump, the feed tube up into the tray, a timer box on a leg
    mb.cylinder(-0.45, 0, 0, 0.26, 0.5, 12, { sides: 'plastic_blue', top: 'plastic_white', bottom: DK }, { color: 0xc8dcf0 });
    mb.cylinder(-0.45, 0.5, 0, 0.08, 0.04, 8, 'plastic_black');
    mb.box(0.35, 0, -0.1, 0.22, 0.16, 0.16, 'metal_painted_green');
    mb.cylinder(0.35, 0.16, -0.1, 0.05, 0.05, 8, DK);
    rod(mb, 0.35, 0.2, -0.1, 0.5, 0.6, -0.36, 0.012, 6, 'rubber_black');
    rod(mb, 0.5, 0.6, -0.36, 0.5, 0.86, -0.38, 0.012, 6, 'rubber_black');
    rod(mb, -0.45, 0.52, 0, 0.3, 0.17, -0.1, 0.01, 6, 'plastic_blue');
    mb.box(0.92, 0.42, 0.44, 0.1, 0.14, 0.05, 'plastic_white', { color: 0xe8e0c8 });
    mb.box(0.92, 0.47, 0.466, 0.05, 0.03, 0.006, 'plastic_white', { color: 0x3aff6a, emissive: 1.4 });
    rod(mb, 0.92, 0.42, 0.44, 0.9, 0.72, 0.43, 0.006, 4, 'rubber_black');
  },
});

// ---------------------------------------------------------------- the water trough (2 x 1)
defObj({
  key: 'bld_trough', name: 'Water Trough', w: 2, d: 1, height: 0.7, block: 'low', sound: 'metal', flammable: 0, hp: 300,
  water: { capacity: 60 },
  tags: [...T, 'farm', 'trough', 'station'],
  desc: 'A galvanised trough on plank trestles with a ball-cock float. It keeps every pen within two tiles in water; fill it with a can or let the rain do it.',
  variant: (s) => String(Math.round((s.water ?? 0) / 25)),
  model: (mb, s) => {
    for (const sx of [-1, 1]) {
      // a trestle: two splayed legs and a cross bar, nailed
      for (const sz of [-1, 1]) { mb.push().translate(sx * 0.7, 0, sz * 0.3).rotateX(sz * -0.12); mb.box(0, 0, 0, 0.08, 0.42, 0.08, PL, { color: 0xe0d0b8 }); mb.pop(); }
      mb.box(sx * 0.7, 0.36, 0, 0.1, 0.06, 0.72, PL, { color: 0xd8c8a8 });
    }
    // the trough: corrugated galvanised steel, rolled lip, a drain bung
    mb.box(0, 0.38, 0, 1.8, 0.3, 0.6, 'metal_grey', { color: 0xc8d0d4, uvScale: 2 });
    for (let i = 0; i < 9; i++) mb.box(-0.8 + i * 0.2, 0.39, 0.302, 0.03, 0.28, 0.008, 'chrome', { color: 0xaab4ba, bevel: false });
    P(mb, -0.9, 0.68, -0.3, 0.9, 0.68, -0.3, 0.016, 'chrome'); P(mb, -0.9, 0.68, 0.3, 0.9, 0.68, 0.3, 0.016, 'chrome');
    P(mb, -0.9, 0.68, -0.3, -0.9, 0.68, 0.3, 0.016, 'chrome'); P(mb, 0.9, 0.68, -0.3, 0.9, 0.68, 0.3, 0.016, 'chrome');
    mb.cylinderZ(0.7, 0.44, 0.31, 0.025, 0.03, 8, 'rubber_black');
    const w = Math.max(0, Math.min(100, s.water ?? 0)) / 100;
    if (w > 0) mb.box(0, 0.4 + w * 0.26, 0, 1.76, 0.004, 0.56, 'water', { color: 0x8ab8c8, emissive: 0.12 });
    else mb.box(0, 0.41, 0, 1.7, 0.01, 0.5, 'dirt', { color: 0x8a7a5a });
    // the ball-cock: a copper float on an arm, a brass valve on the inlet pipe
    mb.box(-0.86, 0.62, 0, 0.06, 0.08, 0.08, 'metal_brass');
    rod(mb, -0.86, 0.64, 0, -0.55, 0.46 + w * 0.24, 0, 0.006, 4, 'metal_brass');
    mb.sphere(-0.52, 0.46 + w * 0.24, 0, 0.05, 8, 6, 'metal_brass', { color: 0xd88a4a });
    rod(mb, -0.86, 0.66, 0, -0.86, 1.0, -0.28, 0.014, 6, ST); rod(mb, -0.86, 1.0, -0.28, -0.86, 1.0, -0.5, 0.014, 6, ST);
    mb.cylinderX(-0.86, 1.0, -0.22, 0.03, 0.05, 6, 'metal_brass');
  },
});

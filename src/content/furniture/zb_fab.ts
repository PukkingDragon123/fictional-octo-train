// Furniture — THE FAB MACHINES AT A CAMP (round 20, src/game/economy/fabCamp.ts): the filament maker and the
// printer as they stand in a level once welded. Using one steps up to the full machine (src/ui/menus/fab).
// Salvage-built: a painted skid, a yellow shredder under its hopper, a barrel in copper bands, a stainless
// bath, a winder with a spool on it; a green cabinet under a glazed chamber with its spools on the roof.
import { defObj } from '../../world/objects';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { rod } from './b_common';

const T = ['build', 'buildable'];
const DK = 'metal_dark', ST = 'metal_grey', GR = 'metal_painted_green', BR = 'metal_brushed';
const P = (mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.02, t = ST) => rod(mb, x0, y0, z0, x1, y1, z1, r, 8, t);
const spool = (mb: ModelBuilder, x: number, y: number, z: number, color: number, s = 1) => {
  mb.cylinderZ(x, y, z, 0.1 * s, 0.07 * s, 14, 'plastic_black');
  mb.cylinderZ(x, y, z, 0.085 * s, 0.072 * s, 14, 'plastic_white', { color });
  mb.cylinderZ(x, y, z, 0.03 * s, 0.075 * s, 8, 'plastic_white');
};

defObj({
  key: 'bld_filament', name: 'Filament Maker', w: 2, d: 1, height: 1.7, block: 'solid', sound: 'metal', flammable: 0, hp: 650,
  tags: [...T, 'station', 'fab'], desc: 'A hopper over two cutter shafts, a barrel in copper heater bands, a water bath, a winder. Scrap goes in one end; a spool of filament comes off the other.',
  light: { color: 0xff8a3a, intensity: 0.35, radius: 2, y: 0.95, kind: 'lamp', power: true },
  model: (mb) => {
    // the skid and its hazard ends
    mb.box(0, 0, 0, 1.96, 0.1, 0.5, { all: DK, top: 'bt_plate' }, { uvScale: 2 });
    for (const x of [-0.95, 0.95]) mb.box(x, 0.01, 0, 0.06, 0.09, 0.52, 'bt_hazard', { fit: true });
    // the shredder on its frame, the hopper, the lever, the seam pipe stub
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(mb, -0.6 + sx * 0.17, 0.1, sz * 0.15, -0.6 + sx * 0.17, 1.05, sz * 0.15, 0.018, DK);
    mb.box(-0.6, 1.05, 0, 0.36, 0.26, 0.32, 'plastic_yellow');
    mb.box(-0.6, 1.02, 0.161, 0.37, 0.03, 0.005, 'bt_hazard', { fit: true });
    mb.cylinder(-0.6, 1.31, 0, 0.16, 0.3, 4, BR, { rTop: 0.27 });
    P(mb, -0.4, 1.2, 0.17, -0.3, 1.42, 0.2, 0.012, 'chrome'); mb.sphere(-0.3, 1.43, 0.2, 0.035, 8, 5, 'plastic_red');
    mb.cylinder(-0.6, 1.6, -0.02, 0.05, 0.1, 8, ST);
    // the gearbox and its red handwheel
    mb.box(-0.86, 0.72, 0, 0.2, 0.34, 0.3, GR);
    mb.cylinderZ(-0.86, 0.9, 0.18, 0.11, 0.025, 14, 'plastic_red'); mb.cylinderZ(-0.86, 0.9, 0.2, 0.025, 0.05, 8, DK);
    // the barrel in three copper bands, the brass die
    mb.cylinderX(-0.18, 0.9, 0, 0.065, 0.95, 12, ST);
    for (const x of [-0.45, -0.18, 0.1]) mb.cylinderX(x, 0.9, 0, 0.075, 0.07, 12, 'metal_brass', { color: 0xff9a5a, emissive: 0.6 });
    mb.cylinder(0.33, 0.9, 0, 0.06, 0.1, 10, 'metal_brass', { rTop: 0.01 });
    // the control box with its dial
    mb.box(-0.2, 0.1, 0.05, 0.42, 0.52, 0.26, GR);
    mb.cylinderZ(-0.3, 0.45, 0.19, 0.045, 0.01, 12, 'plastic_white');
    mb.cylinderZ(-0.08, 0.45, 0.19, 0.035, 0.03, 10, 'plastic_black');
    // the water bath on legs, the water, the riser and its red valve
    for (const x of [0.42, 0.88]) for (const z of [-0.07, 0.07]) P(mb, x, 0.1, z, x, 0.6, z, 0.012, DK);
    mb.box(0.65, 0.6, 0, 0.56, 0.18, 0.2, BR);
    mb.box(0.65, 0.74, 0, 0.52, 0.02, 0.16, 'glass', { color: 0x6ab8e0, emissive: 0.15 });
    P(mb, 0.82, 0.1, 0.16, 0.82, 1.0, 0.16, 0.012, 'metal_brass'); P(mb, 0.82, 1.0, 0.16, 0.7, 1.0, 0.0, 0.012, 'metal_brass');
    mb.cylinderZ(0.82, 0.85, 0.2, 0.04, 0.012, 10, 'plastic_red');
    // the strand from the die into the bath and on to the winder
    P(mb, 0.38, 0.88, 0, 0.5, 0.74, 0, 0.005, 'plastic_blue'); P(mb, 0.5, 0.74, 0, 0.88, 0.74, 0, 0.005, 'plastic_blue'); P(mb, 0.88, 0.74, 0, 1.0, 0.92, 0, 0.005, 'plastic_blue');
    // the winder column, the spool on its axle, the green button
    mb.box(1.05, 0.1, -0.14, 0.12, 0.92, 0.08, GR);
    spool(mb, 1.05, 0.98, 0.02, 0x2ab4e8);
    mb.box(0.98, 0.1, 0.16, 0.12, 0.44, 0.1, 'plastic_yellow');
    mb.cylinder(0.98, 0.54, 0.16, 0.035, 0.03, 10, 'led_green', { emissive: 1.2 });
    // a finished spool on the skid
    spool(mb, 0.7, 0.2, 0.22, 0xd8484a, 0.8);
  },
});

defObj({
  key: 'bld_printer', name: 'Printer', height: 1.75, block: 'solid', sound: 'metal', flammable: 0, hp: 500,
  tags: [...T, 'station', 'fab'], desc: 'A green cabinet under a glazed chamber: a gold bed that drops a layer at a time, a head on a travelling beam, spools on the roof.',
  light: { color: 0xfff0d8, intensity: 0.45, radius: 2.4, y: 1.2, kind: 'lamp', power: true },
  model: (mb) => {
    mb.box(0, 0, 0, 0.84, 0.48, 0.66, GR);
    mb.box(-0.22, 0.3, 0.331, 0.3, 0.12, 0.005, 'bt_grate', { fit: true });
    mb.box(0.2, 0.22, 0.331, 0.26, 0.18, 0.005, 'led_green', { emissive: 0.8, color: 0x3a8a4a });
    mb.box(0, 0.05, 0.331, 0.84, 0.03, 0.005, 'bt_hazard', { fit: true });
    // the chamber: four posts, top and bottom frames, glass on three sides and the doors
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.4, 0.48, sz * 0.3, 0.04, 0.92, 0.04, BR);
    for (const y of [0.48, 1.38]) { mb.box(0, y, 0.3, 0.84, 0.04, 0.04, BR); mb.box(0, y, -0.3, 0.84, 0.04, 0.04, BR); }
    mb.box(0, 0.52, 0.3, 0.78, 0.86, 0.01, 'glass', { color: 0xb8e0f0 });
    for (const sx of [-1, 1]) mb.box(sx * 0.4, 0.52, 0, 0.01, 0.86, 0.58, 'glass', { color: 0xb8e0f0 });
    mb.box(0, 0.52, -0.3, 0.78, 0.86, 0.01, DK);
    // the bed, the beam and the head, the work light
    mb.box(0, 0.78, 0, 0.5, 0.03, 0.42, 'metal_brass');
    mb.box(0, 1.24, 0, 0.76, 0.03, 0.03, BR); mb.box(0.05, 1.12, 0, 0.07, 0.12, 0.06, 'plastic_black');
    mb.box(0, 1.33, 0.25, 0.66, 0.02, 0.02, 'plastic_white', { emissive: 1.2, color: 0xfff4e0 });
    // a part on the bed
    mb.box(0.02, 0.81, 0.0, 0.1, 0.07, 0.08, 'plastic_blue');
    // the roof, its spools
    mb.box(0, 1.42, 0, 0.86, 0.04, 0.66, GR);
    spool(mb, -0.24, 1.58, -0.12, 0x2ab4e8, 0.9); spool(mb, 0.0, 1.58, -0.12, 0xa8b0b8, 0.9); spool(mb, 0.24, 1.58, -0.12, 0xd8484a, 0.9);
    P(mb, -0.24, 1.55, -0.06, 0.05, 1.3, 0.0, 0.006, 'plastic_white');
  },
});

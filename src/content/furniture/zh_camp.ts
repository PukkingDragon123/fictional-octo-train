// Furniture — THE CAMP (round 16, src/build/kit2.ts): camp flag, wire pole,
// caged work lamp, rain barrel, condensation collector, water still, plate
// barricade, tin-can tripwire, spring jaw trap, chain flail post, crank siren,
// camp radio, the machinist's bench and the riveted steel wall. Salvage: bent
// pipe, scrap plate, nails, rag, glass insulators; fresh weld beads at joints.
import { defObj, objDef } from '../../world/objects';
import { defWall } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { makeRamp, ph } from '../../gfx/pixel';
import { rod } from './b_common';

const T = ['build', 'buildable'];
const M = 'metal_rusty', ST = 'metal_grey', DK = 'metal_dark', DW = 'wood_dark', LW = 'wood_light', PL = 'q_rough_plank', POLE = 'q_pole_wood';
const SEAM = 0xffd890;
const P = (mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.025, t = M) => rod(mb, x0, y0, z0, x1, y1, z1, r, 8, t);
const bead = (mb: ModelBuilder, x: number, y: number, z: number, r = 0.03) => mb.sphere(x, y, z, r, 7, 4, 'bt_seam', { color: SEAM, emissive: 0.25 });
const nail = (mb: ModelBuilder, x: number, y: number, z: number) => mb.sphere(x, y, z, 0.009, 4, 3, 'chrome', { color: 0x9a9ea2 });
/** crossed plank feet for a post */
function feet(mb: ModelBuilder, r = 0.3) {
  mb.box(0, 0, 0, r * 2, 0.05, 0.08, DW); mb.box(0, 0.05, 0, 0.08, 0.05, r * 2, DW);
  for (const [x, z] of [[r - 0.04, 0], [-r + 0.04, 0], [0, r - 0.04], [0, -r + 0.04]]) nail(mb, x, 0.1, z);
}
/** a glass insulator on a pin */
const insulator = (mb: ModelBuilder, x: number, y: number, z: number) => { mb.cylinder(x, y, z, 0.008, 0.05, 6, DK); mb.cylinder(x, y + 0.04, z, 0.03, 0.05, 8, 'glass', { color: 0x7ad0b0, rTop: 0.018, emissive: 0.15 }); };
/** a wire cable hanging between two points (a few straight drops) */
function cable(mb: ModelBuilder, a: [number, number, number], b: [number, number, number], sag = 0.1, r = 0.006) {
  let prev = a;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6, y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
    const cur: [number, number, number] = [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t];
    rod(mb, prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], r, 4, 'rubber_black');
    prev = cur;
  }
}

// ---------------------------------------------------------------- textures
addTextureModule(() => {
  const A = atlas();
  // riveted steel: two big painted plates per storey, rivet rows, a stencilled band, rust at the foot
  A.add('bw_steel_rivet', 32, 86, (pc) => {
    const R = makeRamp(0x5e6a70, 6, { spread: 0.3 });
    for (let y = 0; y < 86; y++) for (let x = 0; x < 32; x++) {
      const n = ph(x >> 1, y >> 2, 303);
      let c = n < 0.25 ? R[1] : n > 0.8 ? R[3] : R[2];
      if (y > 74 && ph(x, y, 307) < (y - 74) / 14) c = 0x7a3e22;
      if (y % 43 === 0 || x === 0) c = R[5];
      if (y % 43 === 42 || x === 31) c = R[0];
      pc.set(x, y, c);
    }
    for (const yy of [3, 40, 46, 83]) for (let x = 3; x < 32; x += 5) { pc.set(x, yy, 0xc8d0d4); pc.set(x, yy + 1, 0x24282a); }
    for (let x = 2; x < 30; x++) for (let y = 58; y < 62; y++) pc.set(x, y, ((x + y) >> 1) % 2 ? 0x1a1a1a : 0xd8b020);
  }, 1, 2.7);
  A.add('bt_rag_flag', 16, 12, (pc) => {
    pc.each((x, y) => pc.set(x, y, ph(x, y, 311) < 0.1 ? 0x8a2a1e : (x + (y >> 2)) % 6 < 3 ? 0xc83a2a : 0xb0321e));
    for (let y = 3; y < 9; y++) for (let x = 5; x < 11; x++) if (Math.abs(x - 7.5) + Math.abs(y - 5.5) < 3.2) pc.set(x, y, 0xf2e8c8);
  });
  A.add('bt_dial_radio', 16, 8, (pc) => {
    pc.fill(0xe8d8a0); pc.strokeRect(0, 0, 16, 8, 0x5a4a2a);
    for (let x = 2; x < 15; x += 2) pc.vline(x, 1, 3, 0x3a2a1a);
    pc.vline(9, 1, 6, 0xd8301e);
  });
});

defWall({ key: 'bld_steel_wall', name: 'Riveted Steel Wall', tex: 'bw_steel_rivet', top: 'metal_dark', hp: 1700, sound: 'metal', noWallpaper: true });

// ---------------------------------------------------------------- camp flag (a small claim)
defObj({
  key: 'bld_camp_flag', name: 'Camp Flag', height: 2.0, block: 'low', sound: 'wood', flammable: 0.5, hp: 160,
  tags: [...T, 'beacon', 'claim'], desc: 'A plank pole with a rag flag nailed on and a tin can lamp wired under it. Eight metres round it are yours.',
  light: { color: 0xffb060, intensity: 0.75, radius: 4, y: 1.25, kind: 'fire', flicker: 0.16, power: false },
  model: (mb) => {
    feet(mb, 0.32);
    mb.cylinder(0, 0.08, 0, 0.04, 1.95, 7, POLE, { rTop: 0.032 });
    // the flag: a ripped rag in two panels, nailed through, one corner torn
    mb.push().translate(0.03, 1.62, 0);
    mb.box(0.24, 0, 0, 0.46, 0.3, 0.008, 'bt_rag_flag', { fit: true });
    mb.push().translate(0.47, 0.03, 0).rotateY(-0.25); mb.box(0.08, 0, 0, 0.16, 0.24, 0.008, 'bt_rag_flag', { fit: true, color: 0xe8d8d0 }); mb.pop();
    for (const y of [0.02, 0.26]) nail(mb, 0.02, y, 0.006);
    mb.pop();
    // the tin can lamp: a punched can on a wire bail, a candle stub glowing through the holes
    rod(mb, 0, 1.38, 0, 0.18, 1.36, 0, 0.008, 4, 'metal_dark');
    mb.push().translate(0.2, 1.12, 0);
    rod(mb, 0, 0.24, 0, 0, 0.18, 0, 0.004, 3, 'metal_dark');
    mb.cylinder(0, 0, 0, 0.05, 0.16, 9, 'metal_sheet', { color: 0xd8dcd8 });
    for (let i = 0; i < 6; i++) { const a = i * 1.047; mb.sphere(Math.cos(a) * 0.05, 0.05 + (i % 2) * 0.05, Math.sin(a) * 0.05, 0.008, 4, 3, 'plastic_white', { color: 0xffc070, emissive: 2 }); }
    mb.pop();
    // a coil of spare rope and a stake
    mb.cylinder(0.22, 0.05, 0.18, 0.08, 0.04, 10, 'zw_rope', { rTop: 0.07 });
  },
});

// ---------------------------------------------------------------- the machinist's bench (tier 3)
defObj({
  key: 'bld_machine_bench', name: 'Machinist\'s Bench', w: 2, d: 1, height: 1.7, block: 'table', surface: 0.94, sound: 'metal', flammable: 0, hp: 800,
  tags: [...T, 'workbench', 'bench2', 'bench3', 'station'], desc: 'A steel bench with a small lathe, a pillar drill and a tool board. Fine work. Counts as every workbench.',
  model: (mb) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P(mb, sx * 0.9, 0, sz * 0.38, sx * 0.9, 0.9, sz * 0.38, 0.03, ST); bead(mb, sx * 0.9, 0.9, sz * 0.38, 0.032); }
    P(mb, -0.9, 0.25, 0.38, 0.9, 0.25, 0.38, 0.02, ST); P(mb, -0.9, 0.25, -0.38, 0.9, 0.25, -0.38, 0.02, ST);
    mb.box(0, 0.26, 0, 1.76, 0.03, 0.74, 'bt_grate');
    mb.box(0, 0.9, 0, 1.98, 0.06, 0.9, { all: DK, top: 'bt_plate' });
    // the lathe: headstock, bed, tailstock, a chuck with a part in it
    mb.box(-0.55, 0.96, 0.05, 0.28, 0.24, 0.24, 'metal_painted_green');
    mb.box(-0.15, 0.96, 0.05, 0.6, 0.07, 0.14, DK);
    mb.box(0.2, 0.96, 0.05, 0.12, 0.17, 0.14, 'metal_painted_green');
    mb.cylinderX(-0.37, 1.1, 0.05, 0.055, 0.08, 10, 'chrome');
    mb.cylinderX(-0.22, 1.1, 0.05, 0.02, 0.28, 8, 'metal_brushed');
    for (let i = 0; i < 5; i++) mb.sphere(-0.2 + i * 0.05, 0.965, 0.18, 0.012, 4, 3, 'metal_brushed', { sy: 0.3, color: 0xd8c890 });
    // pillar drill
    mb.box(0.62, 0.96, -0.15, 0.24, 0.04, 0.24, DK);
    P(mb, 0.62, 0.96, -0.25, 0.62, 1.62, -0.25, 0.022, 'chrome');
    mb.box(0.62, 1.42, -0.18, 0.16, 0.2, 0.22, 'metal_painted_green');
    mb.cylinder(0.62, 1.3, -0.12, 0.012, 0.12, 6, 'chrome');
    for (let i = 0; i < 3; i++) { const a = i * 2.094; P(mb, 0.72, 1.44, -0.1, 0.72 + Math.cos(a) * 0.1, 1.44 + Math.sin(a) * 0.1, -0.1, 0.006, 'chrome'); }
    // tool board on the back with wrenches and a red lamp
    mb.box(0, 1.0, -0.43, 1.9, 0.62, 0.03, 'q_pegboard', { color: 0xd8c8a0 });
    for (let i = 0; i < 6; i++) mb.box(-0.8 + i * 0.12, 1.15, -0.41, 0.03, 0.18 + (i % 3) * 0.04, 0.008, 'chrome');
    mb.box(0.1, 1.42, -0.4, 0.3, 0.12, 0.04, DK); mb.sphere(0.28, 1.48, -0.38, 0.03, 6, 4, 'led_red', { emissive: 1.4 });
    mb.box(-0.4, 1.36, -0.405, 0.24, 0.05, 0.005, 'bt_hazard', { fit: true });
  },
});

// ---------------------------------------------------------------- wire pole
defObj({
  key: 'bld_pole', name: 'Wire Pole', height: 2.6, block: 'low', sound: 'wood', flammable: 0.4, hp: 200,
  tags: [...T, 'pole'], desc: 'A plank pole with a cross-arm and two glass insulators. A generator\'s current runs ten metres further along it.',
  model: (mb) => {
    feet(mb, 0.28);
    mb.box(0, 0.08, 0, 0.1, 2.5, 0.1, POLE);
    mb.box(0, 2.32, 0, 0.62, 0.07, 0.07, DW);
    for (const x of [-0.26, 0.26]) insulator(mb, x, 2.39, 0);
    for (const x of [-0.25, 0.25]) nail(mb, x * 0.4, 2.35, 0.04);
    // a junction box with a little lamp, the cable down to it
    mb.box(0, 1.2, 0.07, 0.16, 0.2, 0.06, 'metal_painted_green');
    mb.sphere(0.05, 1.36, 0.1, 0.014, 5, 3, 'led_green', { emissive: 1.5 });
    cable(mb, [-0.26, 2.42, 0], [0, 1.4, 0.07], 0.05);
    mb.box(0, 0.6, 0.051, 0.06, 0.16, 0.004, 'bt_hazard', { fit: true });
  },
});

// ---------------------------------------------------------------- caged work lamp (needs the grid)
defObj({
  key: 'bld_work_lamp', name: 'Caged Work Lamp', height: 2.1, block: 'low', sound: 'metal', flammable: 0, hp: 160, power: true,
  tags: [...T, 'growlight', 'camp_lamp'], desc: 'A big bulb in a wire cage on a pipe pole, a cable trailing off. Warm, steady light while the grid is up.',
  light: { color: 0xffe2b0, intensity: 1.45, radius: 7.5, y: 1.95, kind: 'bulb', flicker: 0.02, power: true },
  model: (mb) => {
    mb.box(0, 0, 0, 0.42, 0.04, 0.42, 'bt_plate');
    P(mb, 0, 0.04, 0, 0, 1.9, 0, 0.022, ST); bead(mb, 0, 0.04, 0, 0.03);
    P(mb, 0, 1.85, 0, 0.16, 1.95, 0, 0.016, ST);
    mb.push().translate(0.2, 1.88, 0);
    mb.cylinder(0, 0.12, 0, 0.07, 0.05, 10, 'metal_painted_green', { rTop: 0.03 });
    mb.sphere(0, 0.06, 0, 0.055, 9, 6, 'plastic_white', { color: 0xfff0c8, emissive: 1.8 });
    for (let i = 0; i < 6; i++) { const a = i * 1.047; rod(mb, Math.cos(a) * 0.075, 0.13, Math.sin(a) * 0.075, Math.cos(a) * 0.075, -0.01, Math.sin(a) * 0.075, 0.004, 3, 'metal_dark'); }
    mb.cylinder(0, -0.015, 0, 0.078, 0.008, 10, 'metal_dark');
    mb.pop();
    cable(mb, [0, 1.6, 0.03], [0.3, 0.02, 0.25], 0.2, 0.008);
  },
});

// ---------------------------------------------------------------- rain barrel (state.water litres)
defObj({
  key: 'bld_rain_barrel', name: 'Rain Barrel', height: 1.2, block: 'solid', sound: 'wood', flammable: 0.5, hp: 220,
  water: { capacity: 30, tainted: true }, tags: [...T, 'rain'], desc: 'A staved barrel under a rag funnel tied to two sticks. It catches what drips from the ceiling. Boil it.',
  variant: (s) => String(Math.min(3, Math.floor(((s.water ?? 0) / 30) * 4))),
  model: (mb, s) => {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mb.push().translate(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27).rotateY(-a); mb.box(0, 0, 0, 0.03, 0.82, 0.145, i % 3 ? LW : DW, { color: 0xd8b888 }); mb.pop(); }
    for (const y of [0.12, 0.7]) mb.cylinder(0, y, 0, 0.29, 0.04, 14, 'metal_rusty');
    const lvl = Math.min(3, Math.floor(((s.water ?? 0) / 30) * 4));
    mb.cylinder(0, 0.02, 0, 0.26, 0.1 + lvl * 0.22, 12, { sides: DW, top: 'water', bottom: DW }, { color: 0xffffff });
    // the funnel: a rag on two crossed sticks, sagging in the middle
    for (const s2 of [-1, 1]) P(mb, s2 * 0.32, 0.8, -0.3, -s2 * 0.32, 1.18, 0.3, 0.012, POLE);
    mb.cylinder(0, 0.88, 0, 0.06, 0.26, 10, 'q_burlap', { rTop: 0.4, color: 0xd8ccb0 });
  },
});

// ---------------------------------------------------------------- condensation collector (state.water litres, clean)
defObj({
  key: 'bld_condenser', name: 'Condensation Collector', height: 1.5, block: 'solid', sound: 'metal', flammable: 0, hp: 300,
  water: { capacity: 16 }, tags: [...T, 'condenser'], desc: 'A coil of cold pipe over a steel drip tray, a jerry can catching the run-off. A fan on the grid doubles the yield.',
  variant: (s) => String(Math.min(3, Math.floor(((s.water ?? 0) / 16) * 4))),
  model: (mb, s) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(mb, sx * 0.3, 0, sz * 0.24, sx * 0.3, 1.3, sz * 0.24, 0.02, ST);
    // the coil: stacked rings of pipe
    for (let i = 0; i < 7; i++) { const y = 0.6 + i * 0.09; mb.push().translate(0, y, 0).rotateX(Math.PI / 2); mb.cylinder(0, -0.012, 0, 0.21, 0.024, 14, 'metal_brushed', { caps: false, color: 0xc8d8e0 }); mb.pop(); }
    for (let i = 0; i < 6; i++) mb.sphere(Math.cos(i) * 0.21, 0.56 - (i % 3) * 0.03, Math.sin(i) * 0.21, 0.012, 4, 3, 'glass', { color: 0xa8d8f0, emissive: 0.2 });
    // the fan box on top
    mb.box(0, 1.28, 0, 0.62, 0.14, 0.5, 'metal_painted_green');
    mb.cylinder(0, 1.42, 0, 0.18, 0.02, 12, 'q_grille_dark');
    // tray and can
    mb.box(0, 0.42, 0, 0.62, 0.05, 0.5, 'metal_sheet');
    const lvl = Math.min(3, Math.floor(((s.water ?? 0) / 16) * 4));
    mb.box(0, 0, 0.06, 0.26, 0.38, 0.16, 'q_drum_side', { color: 0xc8302a });
    if (lvl > 0) mb.box(0, 0.382, 0.06, 0.2, 0.004, 0.1, 'water');
    P(mb, 0, 0.42, 0.06, 0, 0.38, 0.06, 0.012, 'chrome');
  },
});

// ---------------------------------------------------------------- water still (state.feed litres in, state.water litres out clean, state.lit, state.fuel)
defObj({
  key: 'bld_still', name: 'Water Still', height: 1.4, block: 'solid', sound: 'metal', flammable: 0, hp: 320, heat: 'fire',
  water: { capacity: 12 }, tags: [...T, 'still'], desc: 'A lidded pot on a firebox, a copper coil running down through a bucket of cold water into a clean jar. Pour any water in the top (E), feed the fire.',
  variant: (s) => `${s.lit ? 1 : 0}:${(s.feed ?? 0) > 0 ? 1 : 0}:${Math.min(2, Math.floor(((s.water ?? 0) / 12) * 3))}`,
  model: (mb, s) => {
    // firebox of scrap plate, an ember mouth
    mb.box(-0.18, 0, 0, 0.42, 0.4, 0.42, 'metal_rusty');
    mb.box(-0.18, 0.08, 0.212, 0.22, 0.14, 0.01, s.lit ? 'q_embers' : DK, { emissive: s.lit ? 1.5 : 0, fit: true });
    // the pot and its domed lid
    mb.cylinder(-0.18, 0.4, 0, 0.19, 0.32, 12, 'metal_brushed', { color: 0xb8bcc0 });
    mb.sphere(-0.18, 0.72, 0, 0.19, 12, 5, 'metal_brushed', { sy: 0.45, color: 0xc8ccd0 });
    // copper coil out of the lid, down through the bucket
    P(mb, -0.18, 0.84, 0, 0.12, 0.92, 0, 0.012, 'metal_brass'); P(mb, 0.12, 0.92, 0, 0.22, 0.6, 0, 0.012, 'metal_brass');
    mb.cylinder(0.22, 0, 0, 0.14, 0.58, 10, 'metal_sheet', { color: 0x9aa8b0 });
    mb.box(0.22, 0.58, 0, 0.2, 0.004, 0.2, 'water');
    P(mb, 0.36, 0.14, 0, 0.42, 0.1, 0, 0.01, 'metal_brass');
    // the clean jar
    const lvl = Math.min(2, Math.floor(((s.water ?? 0) / 12) * 3));
    mb.cylinder(0.42, 0, 0.12, 0.06, 0.14, 9, 'glass', { color: 0xd8f0f8, emissive: 0.1 });
    if (lvl > 0) mb.cylinder(0.42, 0.005, 0.12, 0.055, 0.04 + lvl * 0.04, 9, 'water');
    if ((s.feed ?? 0) > 0) mb.cylinder(-0.18, 0.66, 0, 0.17, 0.004, 12, 'water');
    for (const [x, z] of [[-0.39, -0.21], [0.03, -0.21], [-0.39, 0.21], [0.03, 0.21]]) bead(mb, x, 0.4, z, 0.02);
  },
});

// ---------------------------------------------------------------- plate barricade
defObj({
  key: 'bld_barricade_metal', name: 'Plate Barricade', height: 1.4, block: 'solid', sound: 'metal', flammable: 0, hp: 1100,
  tags: [...T, 'barricade'], desc: 'Sheet steel welded over a frame of bent pipe, braced on two feet. It will take something a long time to get through.',
  model: (mb) => {
    for (const x of [-0.42, 0.42]) { P(mb, x, 0, -0.25, x, 1.3, 0.05, 0.026); P(mb, x, 0, 0.18, x, 1.3, 0.05, 0.026); bead(mb, x, 1.3, 0.05, 0.035); }
    mb.push().translate(0, 0, 0.1).rotateX(-0.12);
    mb.box(-0.24, 0.05, 0, 0.5, 0.62, 0.025, 'bt_plate', { uvScale: 2 });
    mb.box(0.25, 0.08, 0.01, 0.48, 0.66, 0.025, 'metal_rusty', { uvScale: 2 });
    mb.box(0, 0.68, 0.005, 0.98, 0.58, 0.025, 'bt_plate', { uvScale: 2, color: 0xd8dcd8 });
    for (const y of [0.67, 0.12]) for (let x = -0.45; x <= 0.45; x += 0.1) bead(mb, x, y, 0.02, 0.014);
    mb.box(0, 1.0, 0.022, 0.6, 0.06, 0.004, 'bt_hazard', { fit: true });
    mb.pop();
    // dents and a scratched tally
    for (let i = 0; i < 4; i++) mb.box(-0.3 + i * 0.03, 0.9, 0.13, 0.004, 0.08, 0.004, 'chrome');
  },
});

// ---------------------------------------------------------------- tin-can tripwire (state.rung: time it last rang)
defObj({
  key: 'bld_tripwire', name: 'Tin-Can Tripwire', height: 0.5, block: 'none', sound: 'metal', flammable: 0, hp: 60,
  tags: [...T, 'camp_trap', 'tripwire'], desc: 'Two stakes, a wire at shin height and a string of punched cans. Anything that crosses rings the camp awake.',
  model: (mb) => {
    for (const x of [-0.45, 0.45]) { mb.box(x, 0, 0, 0.05, 0.45, 0.05, POLE); mb.box(x, 0, 0, 0.12, 0.02, 0.12, DW, { color: 0x6a5a3a }); }
    cable(mb, [-0.45, 0.32, 0], [0.45, 0.32, 0], 0.02, 0.003);
    for (let i = 0; i < 4; i++) {
      const x = -0.27 + i * 0.18, y = 0.3 - (i % 2) * 0.02;
      rod(mb, x, y, 0, x, y - 0.06, 0, 0.002, 3, 'metal_dark');
      mb.cylinder(x, y - 0.17, 0, 0.032, 0.11, 8, 'metal_sheet', { color: i % 2 ? 0xd8c8a0 : 0xc8302a });
    }
  },
});

// ---------------------------------------------------------------- spring jaw trap (state.sprung)
defObj({
  key: 'bld_jaw_trap', name: 'Spring Jaw Trap', height: 0.25, block: 'none', sound: 'metal', flammable: 0, hp: 200,
  tags: [...T, 'camp_trap', 'jaw_trap'], desc: 'Two toothed jaws on a coil spring, staked down by a chain. Whatever steps in it stays. Re-arm it after (E).',
  variant: (s) => (s.sprung ? 's' : 'o'),
  model: (mb, s) => {
    mb.box(0, 0, 0, 0.32, 0.02, 0.12, DK);
    mb.cylinderX(0, 0.04, 0, 0.035, 0.16, 8, 'metal_brushed');
    for (const sx of [-1, 1]) {
      mb.push().translate(0, 0.02, sx * 0.04);
      if (s.sprung) mb.rotateX(sx * 1.25); else mb.translate(0, 0, sx * 0.13);
      mb.box(0, 0, 0, 0.3, 0.018, 0.012, 'metal_rusty');
      for (let i = 0; i < 6; i++) mb.box(-0.12 + i * 0.048, 0.016, 0, 0.012, 0.03, 0.008, 'metal_grey');
      mb.pop();
    }
    if (!s.sprung) mb.box(0, 0.025, 0, 0.12, 0.008, 0.12, 'metal_sheet', { color: 0xd8c890 });
    for (let i = 0; i < 4; i++) rod(mb, 0.16 + i * 0.05, 0.01, 0.03 * (i % 2), 0.21 + i * 0.05, 0.01, 0.03 * ((i + 1) % 2), 0.008, 4, 'q_chain');
    mb.cylinder(0.38, 0, 0.03, 0.015, 0.1, 6, 'metal_dark');
  },
});

// ---------------------------------------------------------------- chain flail post (the spinning head is drawn by src/build/camp.ts while powered)
defObj({
  key: 'bld_flail', name: 'Chain Flail Post', height: 1.6, block: 'low', sound: 'metal', flammable: 0, hp: 600, power: true,
  tags: [...T, 'flail', 'station'], desc: 'A motor bolted to the top of a braced post, three lengths of chain on its hub. Plugged into the grid, it beats back anything in reach.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.5, 0.06, 0.5, 'bt_plate');
    for (let i = 0; i < 3; i++) { const a = i * 2.094; P(mb, Math.cos(a) * 0.22, 0.06, Math.sin(a) * 0.22, 0, 0.9, 0, 0.02); bead(mb, Math.cos(a) * 0.22, 0.06, Math.sin(a) * 0.22, 0.025); }
    P(mb, 0, 0.06, 0, 0, 1.3, 0, 0.045, ST);
    mb.cylinder(0, 1.25, 0, 0.13, 0.22, 12, 'plastic_blue');
    mb.box(0.11, 1.3, 0, 0.08, 0.1, 0.12, DK);
    mb.cylinder(0, 1.47, 0, 0.06, 0.06, 10, 'chrome');
    mb.box(0, 0.5, 0.046, 0.1, 0.04, 0.004, 'bt_hazard', { fit: true });
    cable(mb, [0.12, 1.3, 0.05], [0.3, 0.02, 0.2], 0.15, 0.008);
  },
});

// ---------------------------------------------------------------- crank siren
defObj({
  key: 'bld_siren', name: 'Crank Siren', height: 1.8, block: 'low', sound: 'metal', flammable: 0, hp: 300,
  tags: [...T, 'siren', 'alarm'], desc: 'A rotor siren and a red lamp on a post, a crank handle and a spring-wound trip. It wails when something hostile is inside the claim.',
  model: (mb) => {
    feet(mb, 0.3);
    P(mb, 0, 0.08, 0, 0, 1.5, 0, 0.03, ST);
    mb.push().translate(0, 1.48, 0);
    mb.cylinderZ(0, 0.06, 0, 0.12, 0.26, 12, 'metal_painted_green');
    mb.cylinderZ(0, 0.06, 0.15, 0.13, 0.03, 12, 'q_grille_dark');
    for (let i = 0; i < 8; i++) { const a = i * 0.785; mb.box(Math.cos(a) * 0.1, 0.06 + Math.sin(a) * 0.1, -0.02, 0.03, 0.03, 0.2, 'metal_dark'); }
    mb.sphere(0, 0.24, 0, 0.05, 8, 5, 'led_red', { emissive: 1.2 });
    mb.pop();
    // the crank
    P(mb, 0.03, 1.1, 0, 0.16, 1.1, 0, 0.012, DK); P(mb, 0.16, 1.1, 0, 0.16, 1.0, 0.05, 0.012, DK); mb.cylinder(0.16, 0.94, 0.05, 0.016, 0.07, 6, 'rubber_black');
    mb.box(0, 0.7, 0.032, 0.08, 0.05, 0.004, 'bt_hazard', { fit: true });
  },
});

// ---------------------------------------------------------------- camp radio
defObj({
  key: 'bld_radio', name: 'Camp Radio', height: 1.0, block: 'solid', sound: 'wood', flammable: 0.4, hp: 220,
  tags: [...T, 'radio_set'], desc: 'A bakelite set on a nailed crate, a car battery under it, a long wire aerial up a pole. The band\'s frequency, and whatever else is out there.',
  light: { color: 0xffc860, intensity: 0.35, radius: 1.6, y: 0.75, kind: 'screen', flicker: 0.04, power: false },
  model: (mb) => {
    mb.box(0, 0, 0, 0.62, 0.5, 0.46, { all: 'q_crate_side', top: 'q_crate_top' });
    mb.box(-0.12, 0.08, 0.235, 0.24, 0.16, 0.01, DK);
    mb.box(0.06, 0.5, 0, 0.44, 0.28, 0.28, 'q_bakelite', { color: 0x6a3a22 });
    mb.box(0.06, 0.62, 0.142, 0.22, 0.09, 0.004, 'bt_dial_radio', { fit: true, emissive: 0.5 });
    for (const x of [-0.08, 0.2]) mb.cylinderZ(x, 0.56, 0.15, 0.025, 0.02, 8, 'q_bakelite', { color: 0xe8d8b0 });
    mb.box(0.06, 0.52, 0.142, 0.3, 0.035, 0.004, 'q_grille_dark');
    // the aerial pole and its wire
    mb.box(-0.27, 0.5, -0.18, 0.04, 1.4, 0.04, POLE);
    P(mb, -0.27, 1.9, -0.18, -0.27, 2.3, -0.18, 0.005, 'chrome');
    cable(mb, [0.2, 0.75, -0.08], [-0.27, 1.8, -0.18], 0.05, 0.004);
    // a mug, a notepad
    mb.cylinder(-0.2, 0.5, 0.12, 0.035, 0.08, 8, 'plastic_white', { color: 0xd8d0c0 });
    mb.box(-0.2, 0.5, -0.02, 0.1, 0.01, 0.14, 'paper');
  },
});

// ---------------------------------------------------------------- tier and bed tags on the older pieces
for (const [k, tags] of [['bld_mech_bench', ['bench2']], ['bld_cot', ['bed']], ['bld_bunk', ['bed']]] as [string, string[]][]) {
  const d = objDef(k);
  if (d) d.tags = [...new Set([...(d.tags ?? []), ...tags])];
}
void PL; void LW;

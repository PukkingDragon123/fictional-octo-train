// Furniture — THE HOMESTEAD (round 15, src/game/economy): the nailed-plank
// build pieces (barricade, crate, bunk, carpenter's bench, wax lantern post,
// livestock pen, fungus bed) and the wild forage spots the levels grow
// (lamp moss on fallen ceiling tile, almond thistles in a carpet tear,
// wallpaper ears on slumped drywall, morels in wet carpet, ceiling truffles).
// Salvaged wood, bent nails, rope and straw; nothing new, nothing square.
import { defObj } from '../../world/objects';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { rod } from './b_common';
import { drawPlant, lookOf, type PlantLook } from '../../game/economy/plantModels';

const T = ['build', 'buildable'];
const PL = 'q_rough_plank', DW = 'wood_dark', LW = 'wood_light', POLE = 'q_pole_wood';
const nail = (mb: ModelBuilder, x: number, y: number, z: number) => mb.sphere(x, y, z, 0.009, 4, 3, 'chrome', { color: 0x9a9ea2 });
/** a plank from (x0,y0,z0) to (x1,y1,z1): w wide, t thick, with a nail at each end */
function plank(mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w = 0.14, t = 0.025, tex = PL, color = 0xffffff, nails = true) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
  mb.push().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mb.rotateY(-Math.atan2(dz, dx)).rotateZ(Math.atan2(dy, Math.hypot(dx, dz)));
  mb.box(0, -w / 2, 0, L, w, t, tex, { color, uvScale: 1.2 });
  if (nails) for (const s of [-1, 1]) { nail(mb, s * (L / 2 - 0.05), -w * 0.3, t / 2 + 0.002); nail(mb, s * (L / 2 - 0.05), w * 0.3 - w / 2, t / 2 + 0.002); }
  mb.pop();
}
const post = (mb: ModelBuilder, x: number, z: number, h: number, r = 0.045) => { mb.cylinder(x, 0, z, r, h, 7, POLE, { rTop: r * 0.9 }); mb.cylinder(x, h - 0.01, z, r * 0.9, 0.02, 7, DW); };

// ---------------------------------------------------------------- barricade
defObj({
  key: 'bld_barricade', name: 'Plank Barricade', height: 1.3, block: 'solid', sound: 'wood', flammable: 0.6, hp: 520,
  tags: [...T, 'barricade'], desc: 'Planks crossed on two sawhorses and nailed through, a strip of sheet steel over the middle. It will not stop everything. It will make everything work for it.',
  model: (mb) => {
    // two sawhorses
    for (const x of [-0.36, 0.36]) {
      for (const s of [-1, 1]) { plank(mb, x - 0.12, 0, s * 0.2, x, 0.62, s * 0.06, 0.07, 0.04, DW, 0xffffff, false); plank(mb, x + 0.12, 0, s * 0.2, x, 0.62, s * 0.06, 0.07, 0.04, DW, 0xffffff, false); }
      mb.box(x, 0.6, 0, 0.1, 0.07, 0.4, DW);
    }
    // the face: three boards across, one cracked short, a diagonal brace
    plank(mb, -0.5, 0.5, 0.12, 0.5, 0.46, 0.12, 0.16);
    plank(mb, -0.5, 0.84, 0.14, 0.48, 0.88, 0.14, 0.15, 0.025, PL, 0xe8e0d0);
    plank(mb, -0.45, 1.2, 0.13, 0.32, 1.16, 0.13, 0.14);
    plank(mb, -0.44, 0.34, 0.16, 0.42, 1.12, 0.16, 0.12, 0.025, DW);
    // a strip of sheet steel nailed over the gap, a scrap of hazard tape
    mb.box(0.02, 0.62, 0.17, 0.5, 0.16, 0.012, 'metal_rusty', { uvScale: 1 });
    for (const x of [-0.2, 0.24]) for (const y of [0.57, 0.67]) nail(mb, x, y, 0.18);
    mb.box(-0.3, 1.03, 0.165, 0.16, 0.04, 0.004, 'bt_hazard', { fit: true });
    // splinters and sawdust at the foot
    for (let i = 0; i < 5; i++) mb.box(-0.3 + i * 0.15, 0.005, 0.28 + (i % 2) * 0.05, 0.08, 0.008, 0.015, LW, { color: 0xd8c8a0 });
  },
});

// ---------------------------------------------------------------- storage crate
defObj({
  key: 'bld_crate', name: 'Storage Crate', height: 0.7, block: 'solid', sound: 'wood', flammable: 0.7, hp: 300, movable: 0,
  container: { capacity: 34, kind: 'crate', name: 'Crate' }, tags: [...T, 'station'],
  desc: 'Planks nailed into a box, a lid on leather hinges, rope handles. Yours, and it stays where you put it.',
  model: (mb) => {
    mb.box(0, 0.02, 0, 0.84, 0.58, 0.62, { all: 'q_crate_side', top: 'q_crate_top', bottom: DW }, { uvScale: 1 });
    // corner battens and the lid's rim
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.4, 0.02, sz * 0.29, 0.06, 0.58, 0.06, DW);
    mb.box(0, 0.6, 0, 0.88, 0.05, 0.66, { all: DW, top: 'q_crate_top' });
    for (const x of [-0.25, 0.25]) mb.box(x, 0.56, -0.33, 0.07, 0.08, 0.02, DW, { color: 0x5a3a22 });
    // rope handles
    for (const sx of [-1, 1]) { rod(mb, sx * 0.43, 0.38, -0.1, sx * 0.47, 0.32, 0, 0.012, 5, 'zw_rope'); rod(mb, sx * 0.47, 0.32, 0, sx * 0.43, 0.38, 0.1, 0.012, 5, 'zw_rope'); }
    for (const x of [-0.3, 0, 0.3]) nail(mb, x, 0.5, 0.315);
  },
});

// ---------------------------------------------------------------- bunk
defObj({
  key: 'bld_bunk', name: 'Plank Bunk', d: 2, height: 0.7, block: 'solid', sleep: 0.6, sit: true, sound: 'wood', flammable: 0.6, hp: 260,
  tags: [...T], desc: 'A low plank bed, slats on stringers, a pad of folded cloth and a wool blanket that smells of other people. Off the carpet.',
  model: (mb) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.41, 0, sz * 0.9, 0.08, sz < 0 ? 0.7 : 0.45, 0.08, POLE);
    for (const sx of [-1, 1]) plank(mb, sx * 0.42, 0.3, -0.92, sx * 0.42, 0.3, 0.92, 0.14, 0.04, DW, 0xffffff, false);
    for (let i = 0; i < 7; i++) mb.box(0, 0.3, -0.78 + i * 0.26, 0.82, 0.025, 0.12, PL);
    // headboard
    plank(mb, -0.45, 0.62, -0.93, 0.45, 0.62, -0.93, 0.18, 0.03);
    // the pad, the blanket thrown back, the pillow
    mb.box(0, 0.325, 0.02, 0.76, 0.08, 1.7, 'mattress', { color: 0xd8d0b8 });
    mb.box(0.02, 0.405, 0.35, 0.8, 0.04, 1.0, 'q_wool_blanket', { color: 0xffffff });
    mb.box(0.36, 0.2, 0.35, 0.03, 0.22, 1.0, 'q_wool_blanket', { color: 0xe8e0d0 });
    mb.box(0, 0.42, -0.7, 0.52, 0.1, 0.26, 'pillow');
  },
});

// ---------------------------------------------------------------- carpenter's workbench
defObj({
  key: 'bld_worktable', name: 'Carpenter\'s Workbench', w: 2, d: 1, height: 1.0, block: 'table', surface: 0.92, sound: 'wood', flammable: 0.5, hp: 420,
  tags: [...T, 'workbench', 'station'], desc: 'A heavy plank bench on four-by-four legs: a wooden vice, a tool rack, a jar of bent nails, sawdust in every seam. Counts as a workbench.',
  model: (mb) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.88, 0, sz * 0.36, 0.1, 0.88, 0.1, POLE);
    for (const sz of [-1, 1]) plank(mb, -0.9, 0.22, sz * 0.36, 0.9, 0.22, sz * 0.36, 0.1, 0.04, DW, 0xffffff, false);
    mb.box(0, 0.24, 0, 1.76, 0.03, 0.7, PL);
    mb.box(0, 0.86, 0, 1.98, 0.08, 0.9, { all: DW, top: PL }, { uvScale: 1.4 });
    // the vice: a wooden jaw on an iron screw
    mb.box(0.82, 0.74, 0.47, 0.3, 0.2, 0.06, DW);
    mb.cylinderZ(0.82, 0.8, 0.56, 0.018, 0.16, 7, 'metal_dark');
    mb.cylinderX(0.82, 0.8, 0.64, 0.01, 0.24, 6, 'metal_dark');
    // a back rack with tools hanging
    for (const x of [-0.9, 0.9]) mb.box(x, 0.9, -0.42, 0.06, 0.6, 0.05, POLE);
    plank(mb, -0.92, 1.42, -0.43, 0.92, 1.42, -0.43, 0.2, 0.03, PL, 0xffffff, true);
    // hammer, saw, square
    mb.cylinder(-0.55, 1.08, -0.39, 0.014, 0.24, 6, LW); mb.box(-0.55, 1.3, -0.39, 0.12, 0.035, 0.035, 'metal_dark');
    mb.box(-0.2, 1.06, -0.395, 0.34, 0.12, 0.004, 'chrome', { color: 0xc8ccd0 }); mb.box(-0.36, 1.07, -0.39, 0.08, 0.1, 0.02, LW);
    mb.box(0.25, 1.1, -0.395, 0.02, 0.26, 0.004, 'metal_brass'); mb.box(0.32, 0.98, -0.395, 0.16, 0.02, 0.004, 'metal_brass');
    // on the top: a jar of nails, a plane, shavings
    mb.cylinder(0.45, 0.9, 0.1, 0.045, 0.12, 8, 'glass', { color: 0xd8e8e8 });
    for (let i = 0; i < 5; i++) mb.box(0.45 + (i - 2) * 0.012, 0.92, 0.1, 0.004, 0.06, 0.004, 'chrome');
    mb.box(-0.4, 0.9, 0.15, 0.24, 0.06, 0.07, LW); mb.box(-0.4, 0.96, 0.15, 0.05, 0.05, 0.04, DW);
    for (let i = 0; i < 6; i++) mb.sphere(-0.1 + i * 0.07, 0.905, 0.25 - (i % 2) * 0.06, 0.02, 5, 3, LW, { sy: 0.3, color: 0xf0d8a8 });
  },
});

// ---------------------------------------------------------------- wax lantern post
defObj({
  key: 'bld_lantern', name: 'Wax Lantern Post', height: 1.7, block: 'low', sound: 'wood', flammable: 0.3, hp: 140,
  tags: [...T], desc: 'A glass lantern hung from a post, a slow wax candle inside. It flickers. The tubes never do that.',
  light: { color: 0xffb860, intensity: 0.95, radius: 5, y: 1.42, kind: 'fire', flicker: 0.14, power: false },
  model: (mb) => {
    // crossed feet, the post, an iron arm
    plank(mb, -0.3, 0.04, 0, 0.3, 0.04, 0, 0.08, 0.05, DW, 0xffffff, false);
    plank(mb, 0, 0.04, -0.3, 0, 0.04, 0.3, 0.08, 0.05, DW, 0xffffff, false);
    post(mb, 0, 0, 1.62, 0.04);
    rod(mb, 0, 1.55, 0, 0.26, 1.58, 0, 0.012, 6, 'metal_dark');
    rod(mb, 0, 1.3, 0, 0.2, 1.56, 0, 0.008, 5, 'metal_dark');
    // the lantern: brass cage, four panes, the candle, a smoked chimney cap
    mb.push().translate(0.26, 1.22, 0);
    rod(mb, 0, 0.36, 0, 0, 0.3, 0, 0.008, 4, 'metal_brass');
    mb.box(0, 0, 0, 0.16, 0.025, 0.16, 'metal_brass');
    mb.box(0, 0.24, 0, 0.17, 0.025, 0.17, 'metal_brass');
    mb.cylinder(0, 0.265, 0, 0.07, 0.05, 8, 'metal_dark', { rTop: 0.025 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.072, 0.02, sz * 0.072, 0.014, 0.22, 0.014, 'metal_brass');
    mb.box(0, 0.025, 0, 0.13, 0.215, 0.13, 'glass', { color: 0xffe8c0, emissive: 0.35 });
    mb.cylinder(0, 0.03, 0, 0.022, 0.09, 8, 'q_candle', { color: 0xf0d890 });
    mb.sphere(0, 0.14, 0, 0.014, 6, 4, 'plastic_white', { color: 0xffd080, emissive: 2, sy: 1.6 });
    mb.pop();
  },
});

// ---------------------------------------------------------------- livestock pen (3 x 2): state.feed, state.store
const PEN_W = 3, PEN_D = 2;
defObj({
  key: 'bld_pen', name: 'Livestock Pen', w: PEN_W, d: PEN_D, height: 1.0, block: 'none', sound: 'wood', flammable: 0.6, hp: 400,
  tags: [...T, 'farm', 'pen', 'station'], desc: 'A plank fence round a bed of straw, a trough, a water pan and a gate on a rope latch. Lead a tamed animal in, fill the trough, collect what it leaves.',
  variant: (s) => `${(s.feed ?? 0) > 0 ? 1 : 0}:${Math.min(3, Object.values((s.store || {}) as Record<string, number>).reduce((a, b) => a + b, 0))}`,
  model: (mb, s) => {
    const hw = PEN_W / 2 - 0.06, hd = PEN_D / 2 - 0.06;
    // straw: a bed of tufts over the whole floor
    mb.box(0, 0, 0, PEN_W - 0.2, 0.025, PEN_D - 0.2, 'q_straw', { uvScale: 1.5 });
    for (let i = 0; i < 26; i++) { const x = ((i * 0.618) % 1 - 0.5) * (PEN_W - 0.4), z = ((i * 0.381 + 0.17) % 1 - 0.5) * (PEN_D - 0.4); mb.cross(x, 0.02, z, 0.18, 0.06, 'q_hay', { color: 0xe8d090, rot: i }); }
    // posts every metre and two rails per side; the gate in the front (+z) middle
    const posts: [number, number][] = [];
    for (let i = 0; i <= PEN_W; i++) { posts.push([-hw + (i / PEN_W) * hw * 2, -hd]); posts.push([-hw + (i / PEN_W) * hw * 2, hd]); }
    for (let j = 1; j < PEN_D; j++) { posts.push([-hw, -hd + (j / PEN_D) * hd * 2]); posts.push([hw, -hd + (j / PEN_D) * hd * 2]); }
    for (const [x, z] of posts) post(mb, x, z, 0.98, 0.04);
    for (const y of [0.42, 0.82]) {
      plank(mb, -hw, y, -hd, hw, y, -hd, 0.11, 0.025, PL, 0xffffff, true);
      plank(mb, -hw, y, -hd, -hw, y, hd, 0.11, 0.025, PL, 0xe8e0d0, true);
      plank(mb, hw, y, -hd, hw, y, hd, 0.11, 0.025, PL, 0xe8e0d0, true);
      // front rails either side of the gate
      plank(mb, -hw, y, hd, -0.5, y, hd, 0.11, 0.025, PL, 0xffffff, true);
      plank(mb, 0.5, y, hd, hw, y, hd, 0.11, 0.025, PL, 0xffffff, true);
    }
    // the gate: a framed plank leaf with a Z brace, a rope latch
    for (const y of [0.3, 0.75]) plank(mb, -0.48, y, hd + 0.02, 0.46, y, hd + 0.02, 0.1, 0.025, LW);
    plank(mb, -0.44, 0.28, hd + 0.04, 0.42, 0.74, hd + 0.04, 0.09, 0.022, DW);
    rod(mb, 0.48, 0.6, hd + 0.02, 0.52, 0.66, hd + 0.02, 0.012, 5, 'zw_rope');
    // the trough (back left): feed in it when filled
    mb.push().translate(-0.85, 0, -0.62);
    mb.box(0, 0.08, 0, 0.9, 0.22, 0.3, { all: DW, top: s.feed > 0 ? 'q_hay' : DW }, { color: 0xffffff });
    if ((s.feed ?? 0) > 0) mb.box(0, 0.28, 0, 0.8, 0.02, 0.2, 'dirt', { color: 0xa8885a });
    for (const x of [-0.42, 0.42]) mb.box(x, 0, 0, 0.06, 0.12, 0.34, POLE);
    mb.pop();
    // a dented water pan (back right)
    mb.cylinder(0.95, 0.01, -0.6, 0.2, 0.08, 12, 'metal_grey', { rTop: 0.22 });
    mb.cylinder(0.95, 0.075, -0.6, 0.19, 0.004, 12, 'water', { color: 0x9ab8c0, emissive: 0.1 });
    // what they left in the straw
    const n = Math.min(3, Object.values((s.store || {}) as Record<string, number>).reduce((a, b) => a + b, 0));
    for (let i = 0; i < n; i++) mb.sphere(0.2 + i * 0.16, 0.05, 0.25 - i * 0.1, 0.035, 7, 5, 'plastic_white', { color: [0xf0e8d0, 0xe8a02a, 0xe8e4f8][i], sy: 1.2 });
  },
});

// ---------------------------------------------------------------- fungus bed (a dark planter)
defObj({
  key: 'bld_fungus_bed', name: 'Fungus Bed', height: 0.5, block: 'low', sound: 'wood', flammable: 0.5, hp: 220,
  tags: [...T, 'farm', 'bplanter', 'dark_bed', 'station'], desc: 'A plank box of wet sawdust and coffee grounds, half under a damp sack. Fungi fruit fastest in the dark; vegetables sulk.',
  variant: (s) => `${s.crop ?? ''}:${Math.floor(s.stage ?? 0)}:${s.dead ? 1 : 0}:${(s.water ?? 0) > 20 ? 1 : 0}`,
  model: (mb, s) => {
    mb.box(0, 0, 0, 0.9, 0.34, 0.7, { all: PL, top: 'ec_substrate' }, { color: 0xffffff });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.44, 0, sz * 0.34, 0.06, 0.4, 0.06, DW);
    // the sack thrown over the back half, sagging, dark with damp
    mb.push().translate(0, 0.37, -0.18).rotateX(0.08);
    mb.box(0, 0, 0, 0.94, 0.03, 0.42, 'q_burlap', { color: (s.water ?? 0) > 20 ? 0x9a8a6a : 0xd8c8a0 });
    mb.pop();
    mb.box(0, 0.12, -0.36, 0.94, 0.26, 0.02, 'q_burlap', { color: 0x9a8a6a });
    // droplets
    if ((s.water ?? 0) > 20) for (const x of [-0.3, 0.1, 0.35]) mb.sphere(x, 0.33, -0.38, 0.008, 4, 3, 'water', { color: 0xc8e0e8, emissive: 0.3 });
    if (s.crop) {
      const look = lookOf(s.crop) ?? 'tuber';
      const st = Math.floor(s.stage ?? 0);
      for (let i = 0; i < 3; i++) drawPlant(mb, look, -0.28 + i * 0.28, 0.34, 0.12 - (i % 2) * 0.06, st, !!s.dead, i);
    }
  },
});

// ---------------------------------------------------------------- forage spots: state.at = in-game hour last picked (null: ready)
const FORAGE_LOOK: Record<string, PlantLook> = { forage_moss: 'moss', forage_thistle: 'thistle', forage_ear: 'ear', forage_morel: 'morel', forage_truffle: 'truffle' };
function forage(key: string, name: string, desc: string, under: (mb: ModelBuilder) => void, spots: [number, number, number][]) {
  defObj({
    key, name, height: 0.35, block: 'none', sound: 'fabric', flammable: 0.3, hp: 30,
    tags: ['forage', 'plant', 'nature'], desc,
    variant: (s) => (s.at == null ? 'r' : 'p'),
    model: (mb, s) => {
      under(mb);
      const ready = s.at == null;
      spots.forEach(([x, y, z], i) => { if (ready || i % 2 === 0) drawPlant(mb, FORAGE_LOOK[key], x, y, z, ready ? 4 : 1, false, i + 3); });
    },
  });
}
forage('forage_moss', 'Lamp Moss', 'Moss on a fallen ceiling tile under a strip light, glowing faintly green. Pick it; it grows back.', (mb) => {
  mb.push().translate(0, 0.03, -0.2).rotateX(0.12).rotateY(0.3);
  mb.box(0, 0, 0, 0.6, 0.025, 0.6, 'plastic_white', { color: 0xd8d4c4 });
  mb.pop();
  mb.flat(0.1, 0.003, 0.1, 0.8, 0.6, 'dirt', { color: 0x6a6a4a });
}, [[-0.15, 0.06, -0.25], [0.1, 0.07, -0.15], [-0.05, 0.05, 0.0], [0.22, 0.03, 0.15]]);
forage('forage_thistle', 'Almond Thistles', 'Thistles growing out of a tear in wet carpet, heads heavy with sweet water.', (mb) => {
  mb.flat(0, 0.003, 0, 0.8, 0.7, 'dirt', { color: 0x5a4a32 });
  mb.box(-0.25, 0.005, 0.2, 0.3, 0.012, 0.12, 'carpet_wet', { color: 0xd8c898 });
}, [[-0.15, 0, -0.1], [0.15, 0, 0.05], [0.02, 0, -0.28]]);
forage('forage_ear', 'Wallpaper Ears', 'A slab of sodden drywall slumped against the wall, the old wallpaper sprouting shelf fungus.', (mb) => {
  mb.push().translate(0, 0, -0.38).rotateX(-0.35);
  mb.box(0, 0, 0, 0.8, 0.55, 0.05, { all: 'plastic_white', north: 'fabric_floral', south: 'fabric_floral' }, { color: 0xc8c0a8 });
  mb.pop();
  mb.flat(0, 0.003, -0.1, 0.9, 0.5, 'dirt', { color: 0x4a4030 });
}, [[-0.2, 0.12, -0.2], [0.15, 0.25, -0.28], [0.0, 0.02, -0.05]]);
forage('forage_morel', 'Carpet Morels', 'Morels pushed up through a patch of black, wet carpet. The smell is the first thing.', (mb) => {
  mb.flat(0, 0.003, 0, 0.9, 0.8, 'dirt', { color: 0x3a3024 });
}, [[-0.2, 0, -0.1], [0.12, 0, 0.12], [0.18, 0, -0.2], [-0.05, 0, 0.25]]);
forage('forage_truffle', 'Ceiling Truffles', 'A ceiling tile came down and broke open. Black knuckles in the grit inside it.', (mb) => {
  for (const s of [-1, 1]) { mb.push().translate(s * 0.18, 0.01, 0).rotateZ(s * 0.12).rotateY(s * 0.2); mb.box(0, 0, 0, 0.32, 0.022, 0.6, 'plastic_white', { color: 0xd8d4c4 }); mb.pop(); }
}, [[0, 0.02, 0]]);

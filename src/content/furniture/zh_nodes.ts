// Furniture — SALVAGE NODES (round 16, src/build/gather.ts): what the levels give
// up to a unit with the right tool. Each model reads state.left (the pulls still
// in it) and thins as it is worked: the wallpaper peels back to bare board, the
// drywall caves to studs, the heap shrinks, the vending unit loses its panels.
// The back of the wall pieces (-z at rot 0) is against the wall.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { makeRamp, ph } from '../../gfx/pixel';
import { rod } from './b_common';

const T = ['salvage_node', 'nobreak'];
const left = (s: Record<string, any>, max: number) => Math.max(0, Math.min(max, s.left ?? max));
const v = (max: number) => (s: Record<string, any>) => String(left(s, max));
const nail = (mb: ModelBuilder, x: number, y: number, z: number) => mb.sphere(x, y, z, 0.009, 4, 3, 'chrome', { color: 0x9a9ea2 });
/** a ragged sheet hanging off the wall, curled forward at the bottom */
function peel(mb: ModelBuilder, x: number, w: number, top: number, len: number, tex: string, color: number, curl: number) {
  const seg = 4, h = len / seg;
  let y = top, z = -0.44;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * curl;
    mb.push().translate(x, y - h / 2, z + Math.sin(a) * h * 0.5).rotateX(-a);
    mb.box(0, -h / 2, 0, w * (1 - i * 0.06), h, 0.006, tex, { color, fit: true });
    mb.pop();
    y -= h * Math.cos(a); z += Math.sin(a) * h;
  }
}

addTextureModule(() => {
  const A = atlas();
  A.add('gn_wallpaper', 16, 32, (pc) => {
    const R = makeRamp(0xc8b468, 5, { spread: 0.25 });
    pc.each((x, y) => {
      const stripe = (x % 8 < 2) ? R[3] : R[2];
      const n = ph(x, y >> 1, 401);
      pc.set(x, y, n < 0.08 ? 0x7a6a3a : (y % 6 === 0 && x % 8 === 4) ? R[4] : stripe);
    });
    for (let y = 18; y < 32; y++) for (let x = 0; x < 16; x++) if (ph(x, y, 403) < (y - 18) / 22) pc.set(x, y, 0x6a5a30);
  });
  A.add('gn_paper_back', 16, 16, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 409) < 0.2 ? 0xc8c0a8 : 0xe0d8c0)); });
  A.add('gn_drywall', 16, 16, (pc) => {
    pc.each((x, y) => { const n = ph(x >> 1, y >> 1, 411); pc.set(x, y, n < 0.15 ? 0xb8b0a0 : n < 0.3 ? 0x8a8070 : 0xd8d2c4); });
    for (let x = 0; x < 16; x++) if (ph(x, 0, 413) < 0.5) pc.set(x, 15 - (x % 3), 0x6a6050);
  });
  A.add('gn_gypsum', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 417) < 0.3 ? 0xd8d0c0 : 0xf0ece0)); });
  A.add('gn_carpet', 16, 16, (pc) => {
    const R = makeRamp(0xb89a52, 5, { spread: 0.3 });
    pc.each((x, y) => { const n = ph(x, y, 421); pc.set(x, y, n < 0.1 ? 0x5a4a2a : n < 0.4 ? R[1] : n < 0.8 ? R[2] : R[3]); });
  });
  A.add('gn_mould', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 431) < 0.4 ? 0x2a3a1e : 0x4a5a2a)); });
  A.add('gn_vend_face', 16, 32, (pc) => {
    pc.fill(0xb83a2a);
    for (let y = 2; y < 22; y++) for (let x = 2; x < 11; x++) pc.set(x, y, (x + y) % 5 === 0 ? 0x3a4a52 : 0x1a2228);
    for (let y = 4; y < 20; y += 4) pc.hline(2, 10, y, 0x8a8a7a);
    for (let y = 4; y < 14; y += 2) { pc.set(13, y, 0xe8e0c8); pc.set(14, y, 0x2a2a2a); }
    pc.rect(3, 25, 8, 4, 0x1a1a1a);
    pc.strokeRect(0, 0, 16, 32, 0x7a2218);
  });
});

// ---------------------------------------------------------------- peeling wallpaper (4 pulls)
defObj({
  key: 'gn_wallpaper', name: 'Peeling Wallpaper', height: 2.2, block: 'none', sound: 'paper', flammable: 0.6, hp: 40, tags: T,
  desc: 'A sheet of wallpaper the damp has lifted off the wall in long curls. The backing paper and the old linen under it are worth having. A blade takes it off clean.',
  variant: v(4),
  model: (mb, s) => {
    const n = left(s, 4);
    // the bare patch it is lifting off
    mb.box(0, 0.3, -0.462, 0.96, 1.85, 0.004, 'gn_paper_back', { color: 0xd8d0b8 });
    for (let i = 0; i < 4; i++) {
      const x = -0.36 + i * 0.24;
      if (i < n) peel(mb, x, 0.25, 2.12 - (i % 2) * 0.1, 1.05 + (i % 3) * 0.25, 'gn_wallpaper', 0xffffff, 0.9 + i * 0.15);
      else mb.box(x, 1.95, -0.455, 0.24, 0.18, 0.006, 'gn_wallpaper', { fit: true, color: 0xe0d8c0 });
    }
    // a strip of it on the floor, curled
    if (n > 0) { mb.push().translate(0.2, 0.02, -0.2).rotateY(0.6); mb.cylinderX(0, 0.04, 0, 0.04, 0.4, 7, 'gn_wallpaper', { color: 0xe8dcc0 }); mb.pop(); }
    for (let i = 0; i < 5; i++) mb.box(-0.4 + i * 0.2, 0.004, -0.36 + (i % 2) * 0.08, 0.06, 0.004, 0.04, 'gn_wallpaper', { color: 0xc8b890 });
  },
});

// ---------------------------------------------------------------- rotten drywall (3 pulls): the studs show as it is broken out
defObj({
  key: 'gn_drywall', name: 'Rotten Drywall', height: 2.4, block: 'none', sound: 'wood', flammable: 0.4, hp: 60, tags: T,
  desc: 'Drywall that has been wet for years, bowed off its studs. Break it out and there is lumber, wire and nails behind it. A hammer, a crowbar, a sledge.',
  variant: v(3),
  model: (mb, s) => {
    const n = left(s, 3);
    // the studs and a wire run behind
    for (const x of [-0.4, 0, 0.4]) mb.box(x, 0, -0.47, 0.07, 2.35, 0.05, 'q_pole_wood', { color: n > 0 ? 0xb89868 : 0x8a7050 });
    if (n > 0) rod(mb, -0.45, 1.35, -0.44, 0.45, 1.3, -0.44, 0.008, 4, 'plastic_red');
    if (n > 1) rod(mb, -0.45, 0.6, -0.435, 0.45, 0.65, -0.435, 0.01, 4, 'metal_grey');
    // the board: whole panels while it lasts, a jagged hole as it goes
    const panels: [number, number][] = [[-0.25, 0.0], [0.25, 0.0], [-0.25, 1.2], [0.25, 1.2]];
    panels.forEach(([x, y], i) => { if (i < n + 1) mb.box(x, y + 0.02, -0.41, 0.48, 1.12, 0.03, 'gn_drywall', { fit: true, color: 0xffffff }); });
    // swollen chunks and gypsum dust on the floor (more as it is broken out)
    for (let i = 0; i < 3 + (3 - n) * 2; i++) { const a = i * 1.7; mb.push().translate(Math.cos(a) * 0.25, 0.02, -0.15 + Math.sin(a) * 0.15).rotateY(a).rotateZ(0.3); mb.box(0, 0, 0, 0.12 + (i % 3) * 0.04, 0.025, 0.09, 'gn_drywall', { color: 0xe8e2d4 }); mb.pop(); }
    mb.box(0, 0.003, -0.2, 0.8, 0.004, 0.36, 'gn_gypsum', { color: 0xf0ece0 });
    for (const y of [0.3, 1.0, 1.8]) nail(mb, 0.4, y, -0.39);
  },
});

// ---------------------------------------------------------------- sodden carpet (3 pulls): a rolled-back flap of carpet, cut down roll by roll
defObj({
  key: 'gn_carpet', name: 'Sodden Carpet', height: 0.5, block: 'none', sound: 'fabric', flammable: 0.3, hp: 40, tags: T,
  desc: 'A flap of carpet lifted off the underlay and rolled back on itself, heavy with water, a bloom of mould underneath. Cut into strips it is rag and cloth.',
  variant: v(3),
  model: (mb, s) => {
    const n = left(s, 3);
    mb.box(0, 0.002, 0.05, 0.92, 0.012, 0.76, 'q_foam', { color: 0x8a7a5a });
    mb.box(0.2, 0.012, 0.15, 0.3, 0.004, 0.3, 'gn_mould');
    if (n > 0) {
      const r = 0.07 + n * 0.045;
      mb.cylinderX(0, r, -0.2, r, 0.86, 12, { sides: 'gn_carpet', top: 'q_foam', bottom: 'q_foam' }, { color: 0xffffff });
      mb.box(0, 0.012, -0.2 + r, 0.86, 0.02, 0.25, 'gn_carpet');
    }
    // strips already cut, lying wet
    for (let i = 0; i < 3 - n; i++) { mb.push().translate(-0.3 + i * 0.28, 0.016, 0.3).rotateY(0.3 * i); mb.box(0, 0, 0, 0.1, 0.012, 0.5, 'gn_carpet', { color: 0xd8c8a0 }); mb.pop(); }
    for (let i = 0; i < 6; i++) mb.sphere(-0.35 + i * 0.14, 0.012, 0.32 - (i % 2) * 0.5, 0.03, 5, 3, 'water', { sy: 0.15 });
  },
});

// ---------------------------------------------------------------- leaking pipe run (2 pulls): pipe off the wall, a drip into a can (a water tap)
defObj({
  key: 'gn_pipes', name: 'Leaking Pipe Run', height: 2.2, block: 'low', sound: 'metal', flammable: 0, hp: 200, tags: T,
  water: { capacity: 4, tainted: true },
  desc: 'Pipes that came out of the wall and never went back, dripping at a joint into a can someone left. Saw or unscrew a length off; fill a bottle from the drip.',
  variant: v(2),
  model: (mb, s) => {
    const n = left(s, 2);
    // the pipes: two runs down the wall, a valve, brackets
    const runs = [[-0.25, 0.024], [0.18, 0.032]] as const;
    runs.forEach(([x, r], i) => {
      if (i < n) { mb.cylinder(x, 0.12, -0.38, r, 2.05, 8, 'metal_rusty'); for (const y of [0.5, 1.4]) mb.box(x, y, -0.43, r * 2 + 0.04, 0.05, 0.08, 'metal_dark'); }
      else { mb.cylinder(x, 1.8, -0.38, r, 0.37, 8, 'metal_rusty'); mb.cylinder(x, 1.78, -0.38, r * 1.1, 0.03, 8, 'chrome'); }
    });
    if (n > 0) {
      mb.cylinderX(-0.04, 1.0, -0.38, 0.03, 0.44, 8, 'metal_rusty');
      mb.cylinder(-0.04, 1.03, -0.3, 0.012, 0.08, 6, 'metal_dark'); mb.cylinderX(-0.04, 1.12, -0.3, 0.045, 0.015, 8, 'plastic_red');
    }
    // the drip, the can, a wet stain
    mb.sphere(-0.04, 0.88, -0.36, 0.014, 5, 4, 'water', { sy: 1.6, emissive: 0.2 });
    mb.cylinder(-0.04, 0, -0.3, 0.08, 0.16, 10, 'metal_sheet', { color: 0xc8c8c0 });
    mb.box(-0.04, 0.155, -0.3, 0.12, 0.003, 0.12, 'water');
    mb.box(0, 0.003, -0.1, 0.7, 0.003, 0.5, 'water', { color: 0x8a9a8a });
  },
});

// ---------------------------------------------------------------- fallen light fixture (2 pulls)
defObj({
  key: 'gn_fixture', name: 'Fallen Light Fixture', height: 0.45, block: 'low', sound: 'metal', flammable: 0, hp: 80, tags: T,
  desc: 'A ceiling troffer that came down with its tile, hanging by a wire to nothing. Ballast, tubes, wire, a diffuser. Pry it apart.',
  variant: v(2),
  model: (mb, s) => {
    const n = left(s, 2);
    // the broken ceiling tile under it
    for (let i = 0; i < 4; i++) { mb.push().translate(-0.3 + (i % 2) * 0.55, 0.012, -0.2 + Math.floor(i / 2) * 0.42).rotateY(i * 0.7); mb.box(0, 0, 0, 0.32, 0.02, 0.24, 'gn_gypsum', { color: 0xe8e4d8 }); mb.pop(); }
    mb.push().translate(0, 0.05, 0).rotateY(0.25).rotateZ(0.12);
    mb.box(0, 0, 0, 1.15, 0.09, 0.3, 'metal_sheet', { color: 0xe8e8e0 });
    if (n > 0) { for (const z of [-0.07, 0.07]) mb.cylinderX(0, 0.11, z, 0.016, 1.05, 8, 'plastic_white', { color: 0xf2f2ea }); }
    if (n > 1) { mb.box(0, 0.16, 0, 1.1, 0.012, 0.28, 'glass', { color: 0xd8e0e8 }); mb.box(0.3, 0.1, 0, 0.22, 0.05, 0.08, 'metal_dark'); }
    mb.pop();
    rod(mb, 0.5, 0.12, 0.05, 0.62, 0.35, 0.3, 0.006, 4, 'plastic_red');
    for (let i = 0; i < 6; i++) mb.box(-0.4 + i * 0.16, 0.006, 0.36 - (i % 3) * 0.05, 0.05, 0.006, 0.03, 'glass', { color: 0xe8f0f8 });
  },
});

// ---------------------------------------------------------------- dead vending unit (4 pulls): panels come off one by one
defObj({
  key: 'gn_machine', name: 'Dead Vending Unit', height: 1.85, block: 'solid', sound: 'metal', flammable: 0, hp: 600, tags: T,
  desc: 'A snack machine with its glass gone and the coin mech jammed, dead for decades. Boards, wire, springs, sometimes a motor. A screwdriver or a wrench opens it up.',
  variant: v(4),
  model: (mb, s) => {
    const n = left(s, 4);
    mb.box(0, 0, -0.1, 0.86, 1.82, 0.62, { all: 'metal_painted_green', south: n >= 4 ? 'gn_vend_face' : 'metal_dark' }, { color: n >= 4 ? 0xffffff : 0x8a3020, fit: { south: true } });
    // the inside shows as panels come off: spiral coils, a board, a motor
    if (n < 4) {
      mb.box(-0.1, 0.4, 0.2, 0.6, 1.3, 0.02, 'metal_dark');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) if (r * 3 + c < 4 + n * 2) { mb.push().translate(-0.3 + c * 0.2, 0.55 + r * 0.3, 0.12).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.05, 0.16, 8, 'chrome', { caps: false }); mb.pop(); }
      if (n >= 2) { mb.box(0.32, 1.2, 0.18, 0.14, 0.3, 0.04, 'plastic_black', { color: 0x1e5a2e }); mb.cylinder(0.3, 0.35, 0.1, 0.07, 0.16, 10, 'plastic_blue'); }
    }
    // the panels that came off, against its side
    for (let i = 0; i < 4 - n; i++) { mb.push().translate(0.5 + i * 0.03, 0, 0.1 - i * 0.12).rotateZ(-0.25); mb.box(0, 0, 0, 0.02, 0.8, 0.3, 'metal_painted_green', { color: 0xc84a3a }); mb.pop(); }
    mb.box(0, 0.003, 0.36, 0.7, 0.004, 0.3, 'q_hazard', { color: 0x8a8a7a });
  },
});

// ---------------------------------------------------------------- scrap heap (5 pulls): shrinks as it is picked over
defObj({
  key: 'gn_scrap', name: 'Scrap Heap', height: 0.8, block: 'low', sound: 'metal', flammable: 0, hp: 300, tags: T,
  desc: 'A pile of what other people threw away: chair frames, a filing drawer, pipe, a broken fan, a sack of something. Dig through it with your hands, faster with a bar.',
  variant: v(5),
  model: (mb, s) => {
    const n = left(s, 5);
    const k = 0.35 + n * 0.13;
    const bits: [number, number, number, number, number, number, string, number][] = [
      [-0.2, 0, 0.05, 0.5, 0.22, 0.4, 'metal_rusty', 0.3], [0.18, 0, -0.1, 0.36, 0.3, 0.3, 'q_drawer_metal', -0.4], [0, 0.22, 0, 0.4, 0.2, 0.3, 'metal_grey', 0.9],
      [-0.25, 0.25, -0.15, 0.3, 0.16, 0.22, 'q_crate_side', 0.2], [0.25, 0.3, 0.15, 0.24, 0.14, 0.24, 'metal_painted_green', -0.7], [0, 0.42, 0.05, 0.22, 0.12, 0.2, 'metal_rusty', 1.3],
    ];
    bits.forEach(([x, y, z, w, h, d, t, r], i) => { if (i < Math.ceil(n * 1.2)) { mb.push().translate(x * k * 1.6, y * k * 1.4, z * k * 1.6).rotateY(r).rotateZ(r * 0.2); mb.box(0, 0, 0, w, h, d, t); mb.pop(); } });
    if (n >= 2) rod(mb, -0.4, 0.05, 0.3, 0.2, 0.5 * k + 0.1, -0.25, 0.022, 6, 'metal_rusty');
    if (n >= 3) { mb.push().translate(0.3, 0.12, 0.25).rotateX(1.2); mb.cylinder(0, 0, 0, 0.13, 0.03, 10, 'q_grille_dark'); mb.pop(); }
    if (n >= 4) mb.sphere(-0.1, 0.5 * k + 0.08, 0.15, 0.12, 8, 5, 'q_burlap', { sy: 0.7, color: 0xb8a888 });
    for (let i = 0; i < 7; i++) mb.box(-0.45 + i * 0.15, 0.005, 0.4 - (i % 3) * 0.12, 0.06, 0.008, 0.03, 'metal_rusty');
  },
});

// ---------------------------------------------------------------- fungal bloom (3 pulls): shelves and caps up a damp wall
defObj({
  key: 'gn_bloom', name: 'Fungal Bloom', height: 1.6, block: 'none', sound: 'flesh', flammable: 0.2, hp: 40, tags: T,
  desc: 'Bracket shelves and pale caps climbing a wet patch of wall, a sweet rot smell. Chop them off for food, biomass and spawn. They come back fast.',
  variant: v(3),
  model: (mb, s) => {
    const n = left(s, 3);
    mb.box(0, 0.05, -0.46, 0.9, 1.5, 0.006, 'gn_mould', { color: 0xa8b890 });
    const shelves: [number, number, number][] = [[-0.25, 0.4, 0.2], [0.15, 0.65, 0.17], [-0.05, 0.95, 0.22], [0.28, 1.15, 0.14], [-0.3, 1.3, 0.13], [0.05, 0.25, 0.15]];
    shelves.forEach(([x, y, r], i) => { if (i < n * 2) { mb.push().translate(x, y, -0.44); mb.sphere(0, 0, r * 0.45, r, 9, 4, 'q_bark', { sy: 0.32, color: i % 2 ? 0xc89a5a : 0xa8784a }); mb.box(0, -0.012, r * 0.45, r * 1.6, 0.006, r * 0.9, 'gn_mould', { color: 0xe8d8b0 }); mb.pop(); } });
    for (let i = 0; i < n * 2; i++) { const x = -0.35 + i * 0.13, z = -0.2 + (i % 2) * 0.15; mb.cylinder(x, 0, z, 0.012, 0.07 + (i % 3) * 0.03, 5, 'plastic_white', { color: 0xf0ecd8 }); mb.sphere(x, 0.08 + (i % 3) * 0.03, z, 0.035, 7, 3, 'plastic_white', { sy: 0.5, color: 0xe8e0c8 }); }
    for (let i = 0; i < 3 - n; i++) mb.box(-0.2 + i * 0.2, 0.004, -0.1, 0.12, 0.006, 0.08, 'q_bark', { color: 0x7a5a3a });
  },
});

// ---------------------------------------------------------------- old remains (2 pulls)
defObj({
  key: 'gn_remains', name: 'Old Remains', height: 0.35, block: 'none', sound: 'flesh', flammable: 0.1, hp: 30, tags: T,
  desc: 'Bones in the rags of a jumpsuit, a long time dead. Somebody\'s unit, maybe. Pick through: bone, leather, whatever they were carrying.',
  variant: v(2),
  model: (mb, s) => {
    const n = left(s, 2);
    mb.box(0, 0.004, 0, 0.7, 0.012, 0.95, 'q_jersey', { color: 0xb8a060 });
    if (n > 0) {
      mb.sphere(0, 0.07, -0.36, 0.08, 9, 6, 'q_bone', { sy: 0.9, color: 0xe8dcc0 });
      mb.box(0, 0.04, -0.3, 0.06, 0.03, 0.04, 'q_bone', { color: 0x2a2620 });
      for (let i = 0; i < 6; i++) rod(mb, -0.14, 0.03, -0.18 + i * 0.07, 0.14, 0.03, -0.18 + i * 0.07, 0.012, 4, 'q_bone', { color: 0xe0d4b8 });
      rod(mb, 0, 0.03, -0.24, 0, 0.03, 0.2, 0.016, 5, 'q_bone', { color: 0xd8ccb0 });
    }
    if (n > 1) { for (const x of [-0.1, 0.1]) rod(mb, x, 0.03, 0.22, x * 1.6, 0.03, 0.55, 0.018, 5, 'q_bone', { color: 0xe0d4b8 }); mb.box(0.25, 0.02, 0.1, 0.12, 0.04, 0.16, 'q_jersey', { color: 0x5a3a22 }); }
    for (let i = 0; i < 4; i++) mb.box(-0.3 + i * 0.2, 0.006, 0.4, 0.05, 0.006, 0.03, 'q_bone', { color: 0xc8bca0 });
  },
});

// ---------------------------------------------------------------- melted matter (the Ledge, 4 pulls)
defObj({
  key: 'gn_melt', name: 'Melted Matter', height: 0.6, block: 'low', sound: 'plastic', flammable: 0.2, hp: 200, tags: T,
  desc: 'Furniture the Ledge has slumped into one hard puddle: chair legs, a monitor, a lamp, set like toffee. Chip pieces off it. Some of what is in it glows.',
  variant: v(4),
  model: (mb, s) => {
    const n = left(s, 4);
    const k = 0.45 + n * 0.14;
    mb.sphere(0, 0, 0, 0.5 * k + 0.1, 12, 5, 'plastic_beige', { sy: 0.35, color: 0xc89a6a });
    mb.sphere(0.12, 0.05, -0.05, 0.3 * k, 10, 5, 'plastic_blue', { sy: 0.5, color: 0x6a8ab0 });
    if (n >= 2) { mb.push().translate(-0.15, 0.12 * k, 0.05).rotateZ(0.9); mb.cylinder(0, 0, 0, 0.025, 0.35, 6, 'chrome', { rTop: 0.012 }); mb.pop(); }
    if (n >= 3) mb.box(0.05, 0.12 * k + 0.05, -0.1, 0.28, 0.06, 0.2, 'plastic_black', { color: 0x3a3a40 });
    for (let i = 0; i < n; i++) mb.sphere(-0.2 + i * 0.13, 0.06 * k + 0.04, 0.18 - (i % 2) * 0.3, 0.025, 6, 4, 'plastic_white', { color: 0x9aff9a, emissive: 1.6 });
    for (let i = 0; i < 4 - n; i++) mb.box(0.4 - i * 0.1, 0.01, 0.35, 0.07, 0.03, 0.06, 'plastic_beige', { color: 0xb88a5a });
  },
});

// The art pass (wave 4, round 25): the farm, the yard and what is made from them. The grow-room crops and their
// seed, the hens' eggs and down, the grubs' silk, the farm tools, the larder's jars and tins, the herbal remedies,
// the gear sewn from silk and down, and three hand-made weapons. Each is a small real object with the parts a real
// one has (a crimped twist, a cork and its wax, the screw band of a jar lid, the rivet of a pair of shears, the lashing
// on a club, the knuckles of a bone handle), in the item atlas's own pixel textures at icon density; crops reuse the
// world atlas's plant textures (src/game/economy/plantModels.ts) so a harvested pepper is the pepper on the plant.
// Merged into DETAIL (./detailModels.ts) by ./itemMeshes.ts; the item definitions are src/content/items/zf_farm.ts.
import type { ModelBuilder } from '../gfx/modelBuilder';
import type { Detail } from './detailModels';
import { tex, decal, rp, ph, T, rodX } from '../content/items/_kit';

type MB = ModelBuilder;

// ---------------------------------------------------------------- textures (icon density)
const S_SILK = tex('i4_silk', 12, 12, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y * 2) % 5 === 0 ? 0xfffcf0 : (x * 3 + y) % 7 === 0 ? 0xd8d0b8 : 0xf0e8d4)); }, true);
const S_DOWN = tex('i4_down', 12, 12, (pc) => { pc.each((x, y) => { const n = ph(x, y, 401), m = ph(x >> 1, y >> 1, 402); pc.set(x, y, n < 0.12 ? 0xffffff : m < 0.3 ? 0xd8d0c4 : 0xece6dc); }); }, true);
const S_EGG = tex('i4_egg', 12, 12, (pc) => {
  pc.each((x, y) => pc.set(x, y, ph(x, y, 411) < 0.08 ? 0xd8c8b8 : 0xf4eee2));
  for (let i = 0; i < 3; i++) pc.line(ph(i, 1, 412) * 11, 0, ph(i, 2, 412) * 11, 11, 0xe8c8c0, 160);
}, true);
const S_CHEESE = tex('i4_cheese', 12, 12, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 421) < 0.1 ? 0xc8c0e8 : ph(x >> 1, y, 422) < 0.3 ? 0xe8e0f4 : 0xf0ecf8)); }, true);
const S_RIND = tex('i4_rind', 12, 12, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 431) < 0.2 ? 0xb8a8c8 : (x + y) % 4 === 0 ? 0xd0c4dc : 0xc4b8d4)); }, true);
const S_BONE = tex('i4_bone', 8, 16, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 441) < 0.1 ? 0xb8a888 : x === 0 ? 0xc8bca0 : y % 5 === 0 && ph(x, y, 442) < 0.5 ? 0xd8ccb0 : 0xece2c8)); }, true);
const S_BURLAP = tex('i4_burlap', 12, 12, (pc) => { pc.each((x, y) => pc.set(x, y, (x % 2) ^ (y % 2) ? 0xc8a870 : ph(x, y, 451) < 0.2 ? 0xa88850 : 0xb89860)); }, true);
const D_SACK = decal('i4_sack_front', 16, 20, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x % 2) ^ (y % 2) ? 0xc8a870 : 0xb89860));
  // a stencilled hen and three grain lines, faded green ink
  const G2 = 0x3a6a2a;
  for (const [x, y] of [[6, 5], [7, 5], [8, 5], [5, 6], [9, 6], [5, 7], [10, 7], [6, 8], [9, 8], [7, 9], [8, 9], [4, 4], [3, 5]]) pc.set(x, y, G2);
  pc.hline(3, 12, 12, G2); pc.hline(4, 11, 14, G2); pc.hline(5, 10, 16, G2);
  pc.set(12, 4, 0xc83a1e); pc.set(13, 4, 0xc83a1e);
});
const D_PICKLE = decal('i4_label_pickle', 16, 10, (pc) => {
  pc.fill(0xf0e4c4); pc.strokeRect(0, 0, 16, 10, 0xb89a68);
  for (const [x, y] of [[4, 3], [5, 4], [6, 5], [7, 5], [8, 5], [9, 4]]) pc.set(x, y, 0xd8221a);
  pc.set(3, 2, 0x4a7a2a); pc.set(4, 2, 0x4a7a2a);
  pc.hline(3, 12, 7, 0x6a5a40); pc.hline(5, 10, 8, 0x9a8a70);
});
const D_TINCT = decal('i4_label_tinct', 10, 12, (pc) => {
  pc.fill(0xe8dcc0); pc.strokeRect(0, 0, 10, 12, 0x8a6a40);
  // a bluecap drawn in ink, a dose line
  pc.hline(3, 6, 3, 0x2a5ab8); pc.hline(2, 7, 4, 0x2a5ab8); pc.set(4, 5, 0xd8d0c0); pc.set(5, 5, 0xd8d0c0); pc.set(4, 6, 0xd8d0c0); pc.set(5, 6, 0xd8d0c0);
  pc.hline(2, 7, 9, 0x4a3a2a); pc.hline(3, 6, 10, 0x8a7a6a);
});
const D_HUSH = decal('i4_label_hush', 10, 12, (pc) => {
  pc.fill(0xeee4f4); pc.strokeRect(0, 0, 10, 12, 0x8a6aa8);
  pc.set(4, 2, 0xb88ae8); pc.set(5, 3, 0xb88ae8); pc.set(4, 4, 0xb88ae8); pc.set(5, 5, 0xb88ae8);
  pc.set(3, 5, 0x4a9a62); pc.set(6, 6, 0x4a9a62); pc.set(4, 7, 0x4a9a62); pc.set(4, 6, 0x6a4a6a); pc.set(4, 8, 0x6a4a6a);
  pc.hline(2, 7, 10, 0x4a3a5a);
});
const D_SALVE = decal('i4_salve_lid', 12, 12, (pc) => {
  const R = rp(0xb4b8bc, 5, 0.45);
  pc.each((x, y) => { const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6); pc.set(x, y, d > 5.4 ? R[1] : d > 4.8 ? R[4] : R[3]); });
  // a paper roundel with a mint leaf
  pc.each((x, y) => { const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6); if (d < 3.6) pc.set(x, y, 0xe8f0e0); });
  for (const [x, y] of [[6, 3], [5, 4], [6, 4], [7, 4], [5, 5], [6, 5], [7, 5], [6, 6], [6, 7], [6, 8]]) pc.set(x, y, y === 8 || y === 7 ? 0x3a5a3a : 0x4a9a62);
});
const D_SPRAY = decal('i4_label_spray', 10, 14, (pc) => {
  pc.fill(0xf0f0e4); pc.strokeRect(0, 0, 10, 14, 0x8a8a7a);
  // a struck-through mite and a pepper
  for (const [x, y] of [[4, 3], [5, 3], [3, 4], [4, 4], [5, 4], [6, 4], [4, 5], [5, 5]]) pc.set(x, y, 0xb8261a);
  pc.line(2, 6, 7, 1, 0x2a2a2a);
  for (const [x, y] of [[3, 9], [4, 9], [5, 10], [6, 10], [7, 9]]) pc.set(x, y, 0xd8221a);
  pc.hline(2, 7, 12, 0x5a5a4a);
});
const D_TWIST = (name: string, dot: number) => decal(name, 10, 10, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 3 + y) % 5 === 0 ? 0xc8b890 : 0xe8dcc0));
  pc.rect(3, 3, 4, 4, dot); pc.set(3, 3, 0xffffff); pc.hline(1, 8, 8, 0x6a5a40);
});
const D_TW_CRESS = D_TWIST('i4_tw_cress', 0x6ac04a), D_TW_COTTON = D_TWIST('i4_tw_cotton', 0xb8b4ac), D_TW_PEPPER = D_TWIST('i4_tw_pepper', 0xd8221a);
const D_BAND = tex('i4_lid_band', 12, 4, (pc) => { const R = rp(0xc0b080, 5, 0.5); pc.each((x, y) => pc.set(x, y, x % 2 ? R[2] : R[3 + (y === 0 ? 1 : 0)])); }, true);
const D_FELT = tex('i4_felt', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 461) < 0.3 ? 0xd8ccb8 : 0xc8bca4)); }, true);
const D_STRAW = tex('i4_straw', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x + (y >> 1)) % 3 === 0 ? 0xf0d880 : y % 2 ? 0xd8b858 : 0xe8c868)); }, true);

// ---------------------------------------------------------------- shared parts
/** a glass jar with a screw band and a lid, standing on y = 0 (radius r, height h), its contents drawn by `fill` */
function jar(mb: MB, r: number, h: number, label: string | null, fill: (mb: MB) => void, o: { lid?: number; glass?: number } = {}) {
  fill(mb);
  mb.cylinder(0, 0, 0, r, h, 12, T.glass, { color: o.glass ?? 0xe8f4f0 });
  mb.cylinder(0, h, 0, r * 0.86, h * 0.06, 12, T.glass, { color: 0xe0ece8 });
  mb.cylinder(0, h * 1.06, 0, r * 0.9, h * 0.1, 12, D_BAND, { color: o.lid ?? 0xd0b060 });
  mb.cylinder(0, h * 1.16, 0, r * 0.86, h * 0.012, 12, T.tinTop, { color: o.lid ?? 0xd8b868 });
  if (label) { mb.push().translate(0, h * 0.42, r + 0.0008); mb.box(0, 0, 0, r * 1.5, h * 0.42, 0.0008, { all: T.white, south: label }, { fit: { south: true }, bevel: false }); mb.pop(); }
}
/** a stoppered dropper bottle (amber or clear) on y = 0 */
function vial(mb: MB, r: number, h: number, label: string, glass: number, liquid: number) {
  mb.cylinder(0, 0.002, 0, r * 0.88, h * 0.62, 10, T.white, { color: liquid, emissive: 0.15 });
  mb.cylinder(0, 0, 0, r, h * 0.72, 10, T.glass, { color: glass });
  mb.cylinder(0, h * 0.72, 0, r, h * 0.12, 10, T.glass, { color: glass, rTop: r * 0.45 });
  mb.cylinder(0, h * 0.84, 0, r * 0.45, h * 0.06, 8, T.glass, { color: glass });
  mb.cylinder(0, h * 0.9, 0, r * 0.5, h * 0.06, 8, T.black, { color: 0x2a2a2a });
  mb.cylinder(0, h * 0.96, 0, r * 0.36, h * 0.12, 8, T.rubber, { color: 0x2a2a2a, rTop: r * 0.28 });
  mb.push().translate(0, h * 0.36, r + 0.0006); mb.box(0, 0, 0, r * 1.3, h * 0.36, 0.0008, { all: T.white, south: label }, { fit: { south: true }, bevel: false }); mb.pop();
}
/** a crimped paper twist of seed lying on its side */
function twist(mb: MB, label: string) {
  mb.push().rotateY(0.4);
  mb.box(0, 0.004, 0, 0.07, 0.02, 0.045, { all: T.card, top: label }, { color: 0xffffff, fit: { top: true } });
  for (const s of [-1, 1]) { mb.push().translate(s * 0.042, 0.012, 0).rotateY(s * 0.3); mb.box(0, -0.006, 0, 0.018, 0.012, 0.03, T.card, { color: 0xd8ccb0 }); mb.pop(); }
  mb.pop();
}
/** a leaf card seen from both sides */
function leaf(mb: MB, w: number, d: number, t: string, c = 0xffffff) {
  mb.flat(0, 0, d / 2, w, d, t, { color: c });
  mb.push().rotateX(Math.PI); mb.flat(0, -0.0005, -d / 2, w, d, t, { color: 0xc8d8c8 }); mb.pop();
}

// ---------------------------------------------------------------- the models
export const DETAIL4: Record<string, Detail> = {
  // ------------------------------------------------ crops
  bluecap: {
    build: (mb) => {
      // three caps on a shared foot of mycelium and wet carpet fibre, one broken off and lying gills-up
      mb.sphere(0, 0.008, 0, 0.024, 8, 4, 'ec_mould', { sy: 0.4, color: 0xf2f0e8 });
      for (const [x, z, h, r, tilt] of [[0, 0, 0.055, 0.028, 0], [0.022, 0.012, 0.04, 0.02, 0.35], [-0.02, -0.01, 0.032, 0.016, -0.4]] as [number, number, number, number, number][]) {
        mb.push().translate(x, 0.004, z).rotateZ(tilt);
        mb.cylinder(0, 0, 0, 0.0065, h, 8, 'ec_stalk', { rTop: 0.005, color: 0xf0f4f8 });
        mb.cylinder(0, h * 0.8, 0, 0.008, 0.003, 8, 'ec_stalk', { color: 0xd8e4f0 });
        mb.cylinder(0, h - r * 0.2, 0, r * 0.94, 0.003, 10, 'ec_gill', { rTop: r * 0.25, emissive: 1.2 });
        mb.sphere(0, h, 0, r, 10, 5, 'ec_bluecap', { sy: 0.42, emissive: 0.1 });
        mb.pop();
      }
      mb.push().translate(0.05, 0.006, -0.025).rotateX(Math.PI).rotateY(0.6);
      mb.sphere(0, 0, 0, 0.016, 9, 4, 'ec_bluecap', { sy: 0.4 });
      mb.cylinder(0, 0.002, 0, 0.015, 0.002, 10, 'ec_gill', { rTop: 0.004, emissive: 1.3 });
      mb.pop();
    },
    poi: [{ at: [0, 0.05, 0], label: 'GILLS', note: 'Cyan under the cap, bright enough to read by. They dim as it dries.' }],
  },
  strip_cress: {
    build: (mb) => {
      // a cut square of felt pad, the cress standing thick on it, roots hanging white over the edge
      mb.box(0, 0, 0, 0.07, 0.008, 0.06, D_FELT, { color: 0xffffff });
      for (let i = 0; i < 34; i++) {
        const x = (ph(i, 1, 471) - 0.5) * 0.062, z = (ph(i, 2, 471) - 0.5) * 0.052, h = 0.022 + ph(i, 3, 471) * 0.018;
        mb.push().translate(x, 0.008, z).rotateZ((ph(i, 4, 471) - 0.5) * 0.5).rotateY(i * 1.7);
        mb.cylinder(0, 0, 0, 0.0012, h, 3, 'ec_stalk', { color: 0xf0f4e0 });
        for (const s of [-1, 1]) { mb.push().translate(s * 0.004, h, 0).rotateZ(s * 0.4); leaf(mb, 0.008, 0.008, 'ec_cress'); mb.pop(); }
        mb.pop();
      }
      for (let i = 0; i < 6; i++) mb.cylinder(-0.03 + i * 0.012, -0.004, 0.03, 0.0008, 0.006, 3, T.white, { color: 0xf4f0e8 });
    },
    poi: [{ at: [0, 0.03, 0], label: 'LEAVES', note: 'Peppery, crisp, a little sweet. Grown in two days under a tube.' }],
  },
  exit_pepper: {
    build: (mb) => {
      // three pods on a branched green stalk, glossy, glowing faintly at the tips like the sign they grew under
      mb.push().rotateY(0.5);
      rodX(mb, -0.05, 0.0, 0.012, 0.0025, 0.003, 5, 'ec_stalk', { color: 0x4a7a2a });
      for (const [a, l, r] of [[0.5, 0.07, 0.011], [-0.4, 0.06, 0.009], [0.05, 0.075, 0.012]] as [number, number, number][]) {
        mb.push().translate(0, 0.012, 0).rotateY(a).rotateZ(-Math.PI / 2 - 0.1);
        mb.cylinder(0, 0, 0, 0.005, 0.01, 6, 'ec_stalk', { color: 0x4a7a2a, rTop: 0.004 });
        mb.cylinder(0, 0.008, 0, 0.0065, 0.006, 8, 'ec_stalk', { color: 0x5a8a2a, rTop: r });
        mb.cylinder(0, 0.014, 0, r, l, 8, 'ec_pepper', { rTop: 0.0015, emissive: 0.4 });
        mb.pop();
      }
      mb.pop();
    },
    poi: [{ at: [0.04, 0.012, 0], label: 'POD', note: 'Hot. The red glows a little in the dark, exactly the red of an exit sign.' }],
  },
  lint_boll: {
    build: (mb) => {
      // a split brown husk with four lobes of grey lint bursting out, a thread of blue and red caught in it
      for (let q = 0; q < 4; q++) { const a = q * 1.571 + 0.3; mb.sphere(Math.cos(a) * 0.014, 0.022, Math.sin(a) * 0.014, 0.019, 8, 6, 'ec_boll', { sy: 0.9 }); }
      mb.sphere(0, 0.034, 0, 0.016, 8, 6, 'ec_boll');
      for (let q = 0; q < 5; q++) { const a = q * 1.257; mb.push().translate(Math.cos(a) * 0.016, 0.01, Math.sin(a) * 0.016).rotateY(-a).rotateX(0.7); mb.box(0, 0, 0, 0.014, 0.022, 0.003, 'plank', { color: 0x6a4a2a, bevel: false }); mb.pop(); }
      rodX(mb, -0.02, 0.03, 0.03, 0.0007, 0.0007, 3, T.white, { color: 0x3a5ab8, cz: 0.006 });
    },
    poi: [{ at: [0, 0.035, 0], label: 'LINT', note: 'Grey duct fluff that grew on a plant. It spins.' }],
  },
  hush_mint: {
    build: (mb) => {
      // a bunch of sprigs tied with a turn of thread, the leaves paired, a lilac spike humming at the top of one
      mb.push().rotateY(-0.3);
      for (let k = 0; k < 4; k++) {
        mb.push().translate(0, 0.008, (k - 1.5) * 0.008).rotateY((k - 1.5) * 0.18);
        rodX(mb, -0.06, 0.05, 0, 0.0018, 0.002, 4, 'ec_stalk', { color: 0x6a4a6a });
        for (let l = 0; l < 4; l++) for (const s of [-1, 1]) { mb.push().translate(-0.02 + l * 0.022, 0.002, 0).rotateY(s * 1.2 + l * 0.4).rotateX(-0.15); leaf(mb, 0.014, 0.02, 'ec_mint'); mb.pop(); }
        mb.pop();
      }
      for (let f = 0; f < 5; f++) mb.sphere(0.055 + f * 0.006, 0.01, 0, 0.0045 - f * 0.0005, 5, 4, T.white, { color: 0xb88ae8, emissive: 0.4 });
      mb.cylinderX(-0.045, 0.008, 0, 0.007, 0.006, 8, T.white, { color: 0xe8dcc0 });
      mb.pop();
    },
    poi: [{ at: [0.06, 0.012, 0], label: 'FLOWERS', note: 'They hum, very quietly, a note just under the strip lights.' }],
  },
  // ------------------------------------------------ seed
  spawn_bluecap: {
    build: (mb) => {
      // a jam jar of grain gone white with mycelium, blue pins pushing at the glass
      jar(mb, 0.026, 0.06, null, (m) => {
        m.cylinder(0, 0.002, 0, 0.024, 0.05, 10, 'ec_mould', { color: 0xf4f2ea });
        for (let i = 0; i < 5; i++) { const a = i * 1.26; m.sphere(Math.cos(a) * 0.023, 0.012 + (i % 3) * 0.013, Math.sin(a) * 0.023, 0.003, 4, 3, 'ec_bluecap', { emissive: 0.3 }); }
      }, { lid: 0xa8b0b8 });
    },
    poi: [{ at: [0, 0.04, 0.026], label: 'SPAWN', note: 'Grain shot through with white. Break it into wet sawdust and keep it dark.' }],
  },
  seeds_cress: { build: (mb) => twist(mb, D_TW_CRESS), poi: [{ at: [0, 0.02, 0], label: 'TWIST', note: 'A pinch of cress seed. Felt, water, a tube.' }] },
  seeds_cotton: { build: (mb) => twist(mb, D_TW_COTTON), poi: [{ at: [0, 0.02, 0], label: 'TWIST', note: 'Black seeds rolled out of the lint.' }] },
  seeds_pepper: {
    build: (mb) => {
      // a dried, split pod with its flat pale seeds spilling out beside it
      twist(mb, D_TW_PEPPER);
      mb.push().translate(0.03, 0.01, 0.03).rotateY(1.1).rotateZ(Math.PI / 2);
      mb.cylinder(0, 0, 0, 0.006, 0.04, 6, 'ec_pepper', { rTop: 0.0015, color: 0x8a2a1a });
      mb.pop();
      for (let i = 0; i < 6; i++) mb.cylinder(0.045 + ph(i, 1, 481) * 0.02, 0.002, 0.015 + ph(i, 2, 481) * 0.03, 0.0035, 0.001, 6, T.white, { color: 0xf0e0a8 });
    },
  },
  seeds_mint: {
    build: (mb) => {
      // three cuttings in a fold of damp newspaper, the roots just starting
      mb.box(0, 0, 0, 0.06, 0.012, 0.04, T.pages, { color: 0xd8d0c0 });
      for (let k = 0; k < 3; k++) {
        mb.push().translate(-0.01, 0.012, (k - 1) * 0.01).rotateY((k - 1) * 0.2);
        rodX(mb, -0.02, 0.05, 0, 0.0015, 0.0018, 4, 'ec_stalk', { color: 0x6a4a6a });
        for (const s of [-1, 1]) { mb.push().translate(0.045, 0.001, 0).rotateY(s * 1.1); leaf(mb, 0.01, 0.014, 'ec_mint'); mb.pop(); }
        for (let r = 0; r < 3; r++) mb.cylinder(-0.02, -0.002, (r - 1) * 0.002, 0.0006, 0.006, 3, T.white, { color: 0xf4f0e8 });
        mb.pop();
      }
    },
  },
  // ------------------------------------------------ the yard
  pallid_egg: {
    build: (mb) => {
      // long, waxy, faintly translucent, a web of pink veins; a wisp of down stuck to it
      mb.sphere(0, 0.026, 0, 0.019, 10, 8, S_EGG, { sy: 1.4, emissive: 0.06 });
      mb.sphere(0.004, 0.032, 0.012, 0.006, 5, 4, S_DOWN, { sy: 0.4 });
    },
    poi: [{ at: [0, 0.03, 0.019], label: 'SHELL', note: 'Soft as wax and warm as a hand. Hold it to a light: something is curled inside the fertile ones.' }],
  },
  hen_down: {
    build: (mb) => {
      // a loose double handful of down, tied round the middle with a strand of grub silk
      for (let i = 0; i < 9; i++) { const a = i * 2.4; mb.sphere(Math.cos(a) * 0.022 * (i ? 1 : 0), 0.016 + (i % 3) * 0.006, Math.sin(a) * 0.018 * (i ? 1 : 0), 0.02 - (i % 4) * 0.002, 8, 6, S_DOWN, { sy: 0.7 }); }
      mb.cylinder(0, 0.012, 0, 0.026, 0.004, 10, S_SILK, { color: 0xfff8e0 });
    },
    poi: [{ at: [0, 0.03, 0], label: 'DOWN', note: 'From under a pallid hen\'s wings. Light, warm, nearly weightless.' }],
  },
  grub_silk: {
    build: (mb) => {
      // a skein of pale silk wound off a cocoon, the empty cocoon half-unwound beside it
      mb.push().rotateY(0.3);
      for (let i = 0; i < 5; i++) { mb.push().translate(-0.012, 0.012, 0).rotateX(i * 0.63); mb.cylinder(0, -0.003, 0, 0.022, 0.006, 12, S_SILK, { caps: false }); mb.pop(); }
      mb.cylinderX(-0.012, 0.012, 0, 0.012, 0.03, 10, S_SILK, { color: 0xfffcf0 });
      mb.sphere(0.035, 0.012, 0.01, 0.012, 8, 6, S_SILK, { sy: 1, color: 0xe8dcc0 });
      rodX(mb, 0.0, 0.035, 0.014, 0.0008, 0.0008, 3, T.white, { color: 0xfff8e8, cz: 0.008 });
      mb.pop();
    },
    poi: [{ at: [0, 0.03, 0], label: 'SKEIN', note: 'Stronger than cotton, cleaner than anything else down here.' }],
  },
  // ------------------------------------------------ farm tools
  hoe: {
    build: (mb) => {
      // an ash handle with a worn grip, a forged steel blade at right angles on a riveted collar
      rodX(mb, -0.5, 0.42, 0.016, 0.015, 0.016, 8, T.wood, { color: 0xc8a070 });
      rodX(mb, -0.5, -0.34, 0.016, 0.0168, 0.0168, 8, T.wood, { color: 0x8a6a48 });
      mb.cylinderX(0.42, 0.016, 0, 0.02, 0.05, 8, T.steel, { color: 0x6a6e72 });
      for (const x of [0.43, 0.46]) mb.sphere(x, 0.036, 0, 0.004, 5, 3, T.steel, { color: 0xb8bcc0 });
      mb.push().translate(0.47, 0.016, 0);
      mb.box(0.004, -0.004, -0.004, 0.02, 0.012, 0.03, T.steel, { color: 0x5a5e62 });
      mb.box(0.012, -0.004, 0.04, 0.012, 0.004, 0.1, T.rust, { color: 0xa89888 });
      mb.box(0.012, -0.0045, 0.088, 0.013, 0.002, 0.004, T.steel, { color: 0xe0e4e8 });
      mb.pop();
    },
    poi: [{ at: [0.48, 0.016, 0.06], label: 'BLADE', note: 'Filed bright along the edge. It turns a planter over in a minute.' }],
  },
  shears: {
    build: (mb) => {
      // two long blades crossed on a brass pivot, loop handles bound in tape
      for (const s of [-1, 1]) {
        mb.push().translate(0, 0.006 + (s > 0 ? 0.004 : 0), 0).rotateY(s * 0.08);
        mb.box(0.06, 0, s * 0.002, 0.12, 0.003, 0.016, T.steel, { color: 0xc8ccd0 });
        mb.box(0.06, 0.0002, s * 0.009, 0.118, 0.003, 0.003, T.steel, { color: 0xf0f4f8, bevel: false });
        mb.box(-0.03, 0, -s * 0.004, 0.06, 0.004, 0.01, T.steel, { color: 0x8a8e92 });
        mb.push().translate(-0.075, 0, -s * 0.012);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mb.box(Math.cos(a) * 0.018, 0, Math.sin(a) * 0.012, 0.012, 0.006, 0.006, T.rubber, { color: s > 0 ? 0x3a6a3a : 0x2a2a2a }); }
        mb.pop();
        mb.pop();
      }
      mb.cylinder(0, 0.004, 0, 0.006, 0.012, 8, T.tinTop, { color: 0xd8b060 });
    },
    poi: [{ at: [0, 0.016, 0], label: 'PIVOT', note: 'A brass rivet, oiled. They close with a clean snip.' }],
  },
  feed_sack: {
    build: (mb) => {
      // a fat burlap sack, the top folded over and tied, a scoop of feed spilt at the foot
      mb.box(0, 0, 0, 0.16, 0.2, 0.1, { all: S_BURLAP, south: D_SACK }, { fit: { south: true } });
      mb.box(0, 0.2, 0, 0.14, 0.04, 0.08, S_BURLAP, { color: 0xd8b880 });
      mb.cylinder(0, 0.235, 0, 0.025, 0.02, 8, S_BURLAP, { color: 0xb89860 });
      mb.cylinder(0, 0.24, 0, 0.028, 0.006, 8, T.cloth, { color: 0x8a5a3a });
      for (let i = 0; i < 8; i++) mb.sphere(0.06 + ph(i, 1, 491) * 0.05, 0.003, 0.06 + ph(i, 2, 491) * 0.03, 0.004, 4, 3, D_STRAW);
    },
    poi: [{ at: [0, 0.1, 0.05], label: 'FEED', note: 'Four bricks of mash. Fills a trough to the brim in one go.' }],
  },
  incubator: {
    build: (mb) => {
      // a plank box with a window lid, a warm bulb in a tin reflector, a dial thermometer, a straw nest
      mb.box(0, 0, 0, 0.26, 0.12, 0.18, T.wood, { color: 0xd8c0a0 });
      mb.box(0, 0.12, 0, 0.27, 0.012, 0.19, T.wood, { color: 0xb89870 });
      mb.box(0, 0.126, 0, 0.2, 0.002, 0.13, T.glass, { color: 0xfff4e0, emissive: 0.2 });
      mb.box(0.02, 0.07, 0, 0.18, 0.04, 0.12, D_STRAW, { color: 0xffffff });
      for (let i = 0; i < 3; i++) mb.sphere(0.0 + i * 0.04, 0.115, (i % 2) * 0.03 - 0.015, 0.016, 7, 5, S_EGG, { sy: 1.3 });
      mb.cylinder(-0.09, 0.07, 0, 0.022, 0.03, 8, T.tin, { rTop: 0.03 });
      mb.sphere(-0.09, 0.09, 0, 0.012, 6, 4, T.white, { color: 0xffd080, emissive: 1.8 });
      mb.push().translate(0.12, 0.07, 0.091); mb.cylinderZ(0, 0, 0, 0.016, 0.006, 10, T.tinTop, { color: 0xf0ece0 }); mb.box(0, 0, 0.004, 0.002, 0.012, 0.001, T.black, { bevel: false }); mb.pop();
      rodX(mb, -0.13, -0.2, 0.03, 0.002, 0.002, 4, T.rubber, { color: 0x2a2a2a });
    },
    poi: [{ at: [0, 0.13, 0], label: 'WINDOW', note: 'Glass over a nest of straw. Set it in a pen and the hens\' eggs hatch.' }, { at: [0.12, 0.07, 0.095], label: 'DIAL', note: 'Thirty-eight degrees. The bulb keeps it there.' }],
  },
  mite_spray: {
    build: (mb) => {
      // a pump bottle of red pepper wash, the trigger and nozzle, a label with a struck-out mite
      mb.cylinder(0, 0.002, 0, 0.024, 0.1, 10, T.white, { color: 0xd84a2a, emissive: 0.08 });
      mb.cylinder(0, 0, 0, 0.026, 0.12, 10, T.plastic, { color: 0xf0f0f0 });
      mb.cylinder(0, 0.12, 0, 0.012, 0.02, 8, T.plastic, { color: 0x3a8a3a });
      mb.box(0.006, 0.14, 0, 0.05, 0.022, 0.018, T.plastic, { color: 0x3a8a3a });
      mb.box(0.03, 0.145, 0, 0.012, 0.01, 0.01, T.black);
      mb.push().translate(-0.004, 0.122, 0).rotateZ(0.3); mb.box(0.012, -0.03, 0, 0.008, 0.03, 0.012, T.plastic, { color: 0x2a6a2a }); mb.pop();
      mb.push().translate(0, 0.055, 0.0262); mb.box(0, 0, 0, 0.032, 0.05, 0.0008, { all: T.white, south: D_SPRAY }, { fit: { south: true }, bevel: false }); mb.pop();
    },
    poi: [{ at: [0, 0.06, 0.026], label: 'WASH', note: 'Exit-sign pepper steeped in water. Mites hate it. So do eyes.' }],
  },
  // ------------------------------------------------ the larder
  pickle_jar: {
    build: (mb) => jar(mb, 0.035, 0.09, D_PICKLE, (m) => {
      m.cylinder(0, 0.002, 0, 0.033, 0.075, 12, T.white, { color: 0xd8d890, emissive: 0.05 });
      for (let i = 0; i < 6; i++) { const a = i * 1.05; m.push().translate(Math.cos(a) * 0.02, 0.01 + (i % 3) * 0.022, Math.sin(a) * 0.02).rotateZ(0.3 * (i % 2 ? 1 : -1)); m.cylinder(0, 0, 0, 0.006, 0.03, 6, 'ec_pepper', { rTop: 0.002, emissive: 0.25 }); m.pop(); }
      for (let i = 0; i < 4; i++) m.sphere(Math.cos(i * 1.6) * 0.018, 0.06, Math.sin(i * 1.6) * 0.018, 0.008, 5, 3, 'ec_cress', { color: 0x8ab060 });
    }),
    poi: [{ at: [0, 0.04, 0.035], label: 'BRINE', note: 'Peppers and cress in salt water. They keep for weeks.' }],
  },
  moon_cheese: {
    build: (mb) => {
      // a small wheel with a lilac rind, one wedge cut out showing the pale, faintly glowing paste, wrapped in cloth below
      mb.cylinder(0, 0, 0, 0.06, 0.006, 14, T.cloth, { color: 0xe8e0d0 });
      mb.cylinder(0, 0.006, 0, 0.05, 0.04, 14, S_RIND, { emissive: 0.1 });
      mb.cylinder(0, 0.046, 0, 0.05, 0.002, 14, S_RIND, { color: 0xd8d0e8 });
      mb.push().translate(0.07, 0.006, 0.01).rotateY(0.4);
      mb.box(0, 0, 0, 0.04, 0.04, 0.02, { all: S_CHEESE, north: S_RIND }, { color: 0xffffff, emissive: 0.2 });
      mb.pop();
    },
    poi: [{ at: [0.07, 0.03, 0.01], label: 'PASTE', note: 'Pale and soft, with the same faint glow as the milk.' }],
  },
  salted_eggs: {
    build: (mb) => jar(mb, 0.034, 0.085, null, (m) => {
      m.cylinder(0, 0.002, 0, 0.032, 0.07, 12, T.white, { color: 0xf0f0e8, emissive: 0.03 });
      for (let i = 0; i < 4; i++) m.sphere(Math.cos(i * 1.6) * 0.014, 0.022 + (i % 2) * 0.03, Math.sin(i * 1.6) * 0.014, 0.014, 8, 6, S_EGG, { sy: 1.35 });
    }, { lid: 0xc8c0b0 }),
    poi: [{ at: [0, 0.04, 0.034], label: 'SALT', note: 'Pallid eggs packed in salt. The yolks go firm and gold.' }],
  },
  potted_meat: {
    build: (mb) => {
      // a squat tin of cooked meat under a white cap of tallow, the lid off and laid beside it
      mb.cylinder(0, 0, 0, 0.04, 0.045, 12, T.tin);
      mb.cylinder(0, 0.034, 0, 0.038, 0.01, 12, T.white, { color: 0xf4ecd8 });
      for (let i = 0; i < 4; i++) mb.sphere(Math.cos(i * 1.7) * 0.02, 0.043, Math.sin(i * 1.7) * 0.02, 0.006, 5, 3, T.white, { color: 0x8a3a2a, sy: 0.4 });
      mb.push().translate(0.055, 0.002, 0.03).rotateZ(0.2); mb.cylinder(0, 0, 0, 0.041, 0.004, 12, T.tinTop); mb.pop();
    },
    poi: [{ at: [0, 0.045, 0], label: 'TALLOW', note: 'A seal of pigeon tallow over the meat. Nothing gets in.' }],
  },
  empty_jar: {
    build: (mb) => jar(mb, 0.034, 0.088, null, (m) => { m.cylinder(0, 0.002, 0, 0.03, 0.004, 12, T.white, { color: 0xd8e0d8 }); }, { lid: 0xc8a860 }),
    poi: [{ at: [0, 0.1, 0], label: 'LID', note: 'A two-piece screw lid, the seal still good. Pickles, salt eggs, spawn.' }],
  },
  // ------------------------------------------------ remedies
  tincture_bluecap: {
    build: (mb) => vial(mb, 0.018, 0.08, D_TINCT, 0xb87a30, 0x3a8ad8),
    poi: [{ at: [0, 0.03, 0.018], label: 'TINCTURE', note: 'Bluecap steeped in spirit. Ten drops numbs a wound and keeps it clean.' }],
  },
  tincture_hush: {
    build: (mb) => vial(mb, 0.018, 0.08, D_HUSH, 0xc8d8e0, 0xb88ae8),
    poi: [{ at: [0, 0.03, 0.018], label: 'TINCTURE', note: 'Hush mint in almond water. It quiets the heart.' }],
  },
  herb_salve: {
    build: (mb) => {
      // a flat tin of green salve, the lid propped open on its hinge
      mb.cylinder(0, 0, 0, 0.03, 0.014, 12, T.tin);
      mb.cylinder(0, 0.012, 0, 0.027, 0.002, 12, T.white, { color: 0x8ac878, emissive: 0.05 });
      mb.sphere(0.008, 0.013, 0.005, 0.008, 6, 3, T.white, { color: 0x9ad888, sy: 0.3 });
      mb.push().translate(0, 0.014, -0.03).rotateX(-1.9); mb.cylinder(0, 0, 0.03, 0.031, 0.004, 12, { all: T.tin, top: D_SALVE }, { fit: { top: true } }); mb.pop();
    },
    poi: [{ at: [0, 0.014, 0], label: 'SALVE', note: 'Mint and tallow. Cool on a burn, cold on a bruise.' }],
  },
  // ------------------------------------------------ silk and down
  silk_bandage: {
    build: (mb) => {
      // a tight roll of pale silk gauze, the loose end unwound across the table, a pin through it
      mb.cylinderZ(0, 0.022, 0, 0.022, 0.05, 12, S_SILK);
      mb.cylinderZ(0, 0.022, 0, 0.008, 0.052, 8, T.white, { color: 0xe8dcc0 });
      mb.box(0.05, 0, 0, 0.07, 0.002, 0.048, S_SILK, { color: 0xfffcf0, bevel: false });
      mb.box(0.075, 0.003, 0.01, 0.03, 0.002, 0.002, T.steel, { color: 0xd8dce0, bevel: false });
    },
    poi: [{ at: [0, 0.03, 0], label: 'SILK', note: 'Woven grub silk. It does not stick to a wound and it does not fray.' }],
  },
  down_liner: {
    build: (mb) => {
      // a quilted liner folded in three, the stitched diamonds puffed with down, a silk binding round the edge
      for (let l = 0; l < 3; l++) mb.box(0, l * 0.014, 0, 0.26 - l * 0.004, 0.014, 0.2 - l * 0.004, S_SILK, { color: [0xd8d0bc, 0xe0d8c4, 0xece4d0][l] });
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) mb.sphere(-0.1 + i * 0.05, 0.043, -0.072 + j * 0.048, 0.02, 6, 3, S_DOWN, { sy: 0.25, color: 0xf8f4ec });
      for (let i = 0; i < 4; i++) mb.box(-0.075 + i * 0.05, 0.047, 0, 0.002, 0.002, 0.19, T.cloth, { color: 0xa8987a, bevel: false });
      mb.box(0, 0.02, 0.1, 0.262, 0.03, 0.004, S_SILK, { color: 0xc8b890 });
    },
    poi: [{ at: [0, 0.045, 0], label: 'QUILT', note: 'Pallid down sewn into grub silk. Worn under a coat, it is the warmest thing down here.' }],
  },
  // ------------------------------------------------ weapons
  spiked_club: {
    build: (mb) => {
      // a heavy table leg, a cloth grip, nails driven through the head in rings, a lashing of wire
      rodX(mb, -0.24, 0.2, 0.02, 0.018, 0.03, 8, T.wood, { color: 0xa07a50 });
      rodX(mb, -0.24, -0.12, 0.02, 0.0195, 0.021, 8, T.cloth, { color: 0x6a5a48 });
      for (let i = 0; i < 4; i++) mb.cylinderX(-0.21 + i * 0.03, 0.02, 0, 0.0205, 0.006, 8, T.rubber, { color: 0x2a2a2a });
      for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + r * 0.5, x = 0.09 + r * 0.04, rr = 0.026 + r * 0.002;
        mb.push().translate(x, 0.02 + Math.sin(a) * rr, Math.cos(a) * rr).rotateX(-a);
        mb.cylinder(0, 0, 0, 0.0035, 0.048, 5, T.steel, { color: 0xb8bcc0, rTop: 0.001 });
        mb.cylinder(0, -0.002, 0, 0.005, 0.002, 6, T.steel, { color: 0x7a7e82 });
        mb.pop();
      }
      for (let i = 0; i < 5; i++) mb.cylinderX(0.07 + i * 0.006, 0.02, 0, 0.026, 0.002, 8, T.steel, { color: 0xb87a4a });
    },
    poi: [{ at: [0.13, 0.05, 0], label: 'NAILS', note: 'Eighteen four-inch nails through a table leg. Crude. It does not need to be anything else.' }],
  },
  sling: {
    build: (mb) => {
      // two plaited silk cords, a leather pouch cradling a river stone, a finger loop at one end
      mb.push().rotateY(0.25);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 9; i++) mb.sphere(-0.16 + i * 0.018, 0.004, s * (0.012 + Math.sin(i * 0.4) * 0.002), 0.0035, 5, 3, S_SILK, { sy: 0.8, color: i % 2 ? 0xf0e8d4 : 0xd8cca8 });
      }
      mb.box(0.0, 0.004, 0, 0.05, 0.008, 0.04, T.leather, { color: 0x7a5232 });
      mb.sphere(0.0, 0.014, 0, 0.012, 7, 5, 'concrete', { color: 0x9a9890, sy: 0.7 });
      mb.cylinder(-0.18, 0.002, 0.012, 0.01, 0.004, 10, S_SILK, { caps: false, color: 0xe8dcc0 });
      mb.pop();
    },
    poi: [{ at: [0, 0.015, 0], label: 'POUCH', note: 'Whirl it twice and let go of one cord. A stone at forty metres a second.' }],
  },
  bone_knife: {
    build: (mb) => {
      // a long bone split and ground to an edge, the knuckle end as a pommel, a grip of leather strip
      rodX(mb, -0.1, -0.02, 0.012, 0.011, 0.013, 7, T.leather, { color: 0x5a3a22 });
      mb.sphere(-0.105, 0.012, 0, 0.016, 7, 5, S_BONE, { sy: 0.9 });
      for (let i = 0; i < 6; i++) mb.cylinderX(-0.095 + i * 0.013, 0.012, 0, 0.0135, 0.003, 7, T.leather, { color: 0x3a2414 });
      mb.push().translate(-0.02, 0.012, 0);
      mb.box(0.055, -0.004, 0, 0.11, 0.008, 0.022, S_BONE);
      mb.box(0.065, -0.003, 0.012, 0.09, 0.005, 0.004, S_BONE, { color: 0xfff8e8, bevel: false });
      mb.box(0.118, -0.003, 0.004, 0.012, 0.006, 0.012, S_BONE, { color: 0xf0e8d0 });
      mb.pop();
    },
    poi: [{ at: [0.06, 0.012, 0.012], label: 'EDGE', note: 'Ground on a kerb until it took an edge. It holds one better than you would think.' }],
  },
};

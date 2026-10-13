// Items stream — BAGS. `bag` = { capacity kg, reduction (fraction of contents'
// weight removed while carried), slot }. Back-slot bags also carry a
// zero-stat `clothing` block (slot 'back', covers []) purely so the character
// rig can draw them on the back (look part 'back'). Any item with `bag` props is
// an openable container regardless of its category (first aid kit, toolbox…).
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txtC, stamp, dashes, band, rodX, rodZ, prism, ph, MB } from './_kit';

const S_ZIP = tex('i_zip_panel', 12, 12, (pc) => {
  pc.fill(0xd2d2d0);
  pc.each((x, y) => { if ((x + y) % 4 === 0) pc.set(x, y, 0xc6c6c4); });
  pc.hline(0, 11, 1, 0x7a7a78); pc.hline(0, 11, 2, 0xe6e6e4);
  pc.strokeRect(0, 0, 12, 12, 0xa8a8a6);
});
const D_TOTE = decal('i_tote_print', 12, 12, (pc) => {
  pc.fill(0xe8dcc0); pc.each((x, y) => { if ((x + y) % 2 === 0 && ph(x, y, 3) < 0.3) pc.set(x, y, 0xd8ccb0); });
  stamp(pc, 3, 2, ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: 0xc8302a });
  dashes(pc, 2, 9, 8, 0x2a2a2a, 2); dashes(pc, 3, 10, 6, 0x6a6a6a, 3);
});
const D_PLASTIC = tex('i_plastic_bag', 12, 12, (pc) => {
  pc.fill(0xf2f2ee);
  pc.each((x, y) => { if (ph(x >> 1, y, 7) < 0.15) pc.set(x, y, 0xe0e0dc); });
  for (let y = 4; y < 9; y += 2) dashes(pc, 2, y, 8, 0xc8302a, y);
  pc.line(1, 11, 4, 2, 0xffffff);
});
const S_GARBAGE = tex('i_garbage_bag', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, ph(x >> 1, y, 5) < 0.2 ? 0x3a3a40 : ph(x, y, 6) < 0.1 ? 0x4a4a52 : 0x26262a));
}, true);

/** worn-on-back look block */
const backLook = (color: number, tex = 'c_backpack') => ({
  slot: 'back', covers: [], insulation: 0, wind: 0, bite: 0, scratch: 0, water: 0.1,
  look: { part: 'back' as const, tex, color },
});

function backpackModel(mb: MB, color: number, accent: number, h = 0.4, w = 0.3, d = 0.17) {
  mb.box(0, 0, 0, w, h * 0.85, d, T.nylon, { color, uvScale: 3 });
  rodX(mb, -w / 2, w / 2, h * 0.85, d / 2, d / 2, 8, T.nylon, { color, uvScale: 3 });
  mb.box(0, 0.03, d / 2 + 0.03, w * 0.8, h * 0.45, 0.06, S_ZIP, { color: dk(color, 0.88), fit: true });
  mb.box(0, h * 0.55, d / 2 + 0.003, w * 0.86, 0.012, 0.006, T.black);
  for (const x of [w * 0.32, -w * 0.12]) mb.box(x, h * 0.5, d / 2 + 0.065, 0.015, 0.03, 0.006, T.metal, { color: accent });
  for (const s of [-1, 1]) mb.box(s * w * 0.28, h * 0.05, -d / 2 - 0.02, 0.05, h * 0.8, 0.03, T.nylon, { color: 0x2a2a2e });
  mb.box(0, h * 0.85 + d / 2, -0.02, 0.08, 0.025, 0.02, T.nylon, { color: 0x2a2a2e });
}

defItem({
  key: 'backpack_school', name: 'School Backpack', cat: 'bag', weight: 0.6, tags: ['bag', 'backpack'],
  bag: { capacity: 12, reduction: 0.3, slot: 'back' }, clothing: backLook(0x2a5aa8),
  model: (mb) => backpackModel(mb, 0x3a6ab8, 0xf0c419),
});
defItem({
  key: 'backpack_hiking', name: 'Hiking Backpack', cat: 'bag', weight: 1.5, tags: ['bag', 'backpack', 'camping'],
  bag: { capacity: 22, reduction: 0.6, slot: 'back' }, clothing: backLook(0xc84a2a),
  desc: 'Internal frame, hip belt, a hundred straps. Carries a lot without breaking your back.',
  model: (mb) => {
    backpackModel(mb, 0xc8502a, 0xe8e8e8, 0.6, 0.32, 0.22);
    rodX(mb, -0.17, 0.17, 0.05, 0.06, 0.06, 8, T.nylon, { color: 0x3a6a4a, cz: 0.15 });
    for (const s of [-1, 1]) mb.box(s * 0.17, 0.06, 0.02, 0.03, 0.18, 0.1, T.nylon, { color: 0x3a3a40 });
    mb.box(0, 0.5, 0.0, 0.33, 0.06, 0.23, T.nylon, { color: 0xa83e22, uvScale: 3 });
  },
});
defItem({
  key: 'backpack_crafted', name: 'Sewn Backpack', cat: 'bag', weight: 0.9, tags: ['bag', 'backpack', 'crafted'],
  bag: { capacity: 14, reduction: 0.35, slot: 'back' }, clothing: backLook(0x8a7a5a),
  desc: 'Patchwork cloth, leather straps, rope. Holds together.',
  model: (mb) => {
    backpackModel(mb, 0x9a8a6a, 0x8a5a3a, 0.38, 0.28, 0.16);
    for (const y of [0.1, 0.22]) mb.box(0, y, 0.087, 0.282, 0.012, 0.004, T.leather);
  },
});
defItem({
  key: 'duffel_bag', name: 'Duffel Bag', cat: 'bag', weight: 1.0, tags: ['bag'],
  bag: { capacity: 18, reduction: 0.4, slot: 'hand' },
  model: (mb) => {
    rodX(mb, -0.28, 0.28, 0.13, 0.13, 0.13, 10, { sides: T.nylon, top: S_ZIP, bottom: S_ZIP }, { color: 0x2a3a2a, uvScale: 3 });
    mb.box(0, 0.255, 0, 0.42, 0.012, 0.02, T.black);
    for (const s of [-1, 1]) mb.box(s * 0.08, 0.255, 0, 0.03, 0.04, 0.12, T.nylon, { color: 0x1c1c1c });
    mb.box(0, 0.27, 0, 0.2, 0.015, 0.03, T.nylon, { color: 0x1c1c1c });
    for (const s of [-1, 1]) mb.box(s * 0.281, 0.12, 0, 0.004, 0.1, 0.1, T.nylon, { color: 0x1c1c1c });
  },
});
defItem({
  key: 'fanny_pack', name: 'Fanny Pack', cat: 'bag', weight: 0.2, tags: ['bag'],
  bag: { capacity: 3, reduction: 0.2, slot: 'belt' },
  model: (mb) => {
    mb.box(0, 0, 0, 0.22, 0.09, 0.07, S_ZIP, { color: 0x8a4aa8, fit: true });
    rodX(mb, -0.11, 0.11, 0.09, 0.035, 0.035, 8, T.nylon, { color: 0x8a4aa8 });
    for (const s of [-1, 1]) mb.box(s * 0.19, 0.03, -0.02, 0.17, 0.004, 0.03, T.nylon, { color: 0x1c1c1c });
    mb.box(-0.27, 0.03, -0.02, 0.03, 0.01, 0.035, T.plastic, { color: 0x1c1c1c });
  },
});
defItem({
  key: 'tote_bag', name: 'Tote Bag', cat: 'bag', weight: 0.2, tags: ['bag'],
  bag: { capacity: 8, reduction: 0.1, slot: 'hand' },
  model: (mb) => {
    mb.box(0, 0, 0, 0.34, 0.36, 0.08, T.cloth, { color: 0xe8dcc0, uvScale: 3 });
    mb.panel(-0.15, 0.0405, 0.15, 0.0405, 0.06, 0.3, D_TOTE, { fit: true });
    for (const s of [-1, 1]) { mb.box(s * 0.08, 0.36, 0, 0.025, 0.14, 0.006, T.cloth, { color: 0xd8ccb0 }); }
    mb.box(0, 0.49, 0, 0.185, 0.02, 0.006, T.cloth, { color: 0xd8ccb0 });
  },
});
defItem({
  key: 'plastic_bag', name: 'Plastic Bag', cat: 'bag', weight: 0.01, tags: ['bag', 'plastic'],
  bag: { capacity: 4, reduction: 0, slot: 'hand' },
  model: (mb) => {
    mb.box(0, 0, 0, 0.26, 0.24, 0.1, { all: T.plastic, south: D_PLASTIC, north: D_PLASTIC }, { color: 0xf6f6f2, fit: { south: true, north: true } });
    mb.box(0, 0.24, 0, 0.2, 0.03, 0.08, T.plastic, { color: 0xeeeeea });
    for (const s of [-1, 1]) mb.box(s * 0.08, 0.27, 0, 0.04, 0.07, 0.01, T.plastic, { color: 0xf2f2ee });
  },
});
defItem({
  key: 'purse', name: 'Purse', cat: 'bag', weight: 0.4, tags: ['bag'],
  bag: { capacity: 4, reduction: 0.1, slot: 'hand' },
  model: (mb) => {
    prism(mb, [[-0.13, 0.05], [0.13, 0.05], [0.13, -0.05], [-0.13, -0.05]], 0, 0.14, T.leather, T.leather, { color: 0xa84a5a });
    mb.box(0, 0.14, 0, 0.22, 0.03, 0.09, T.leather, { color: 0x8a3a4a });
    mb.box(0, 0.13, 0.052, 0.03, 0.025, 0.008, T.metal, { color: 0xd8b04a });
    mb.push().translate(0, 0.17, 0); for (let i = 0; i < 6; i++) { const a = (i / 5) * Math.PI; mb.box(Math.cos(a) * 0.1, Math.sin(a) * 0.12, 0, 0.03, 0.012, 0.012, T.leather, { color: 0x6a2a3a }); } mb.pop();
  },
});
defItem({
  key: 'briefcase', name: 'Briefcase', cat: 'bag', weight: 1.5, tags: ['bag', 'office'],
  bag: { capacity: 5, reduction: 0.1, slot: 'hand' },
  desc: 'Locked with a three-digit combination. The documents inside are all about you.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.44, 0.32, 0.1, T.leather, { color: 0x6a4a2a, uvScale: 3 });
    mb.box(0, 0.3, 0, 0.445, 0.012, 0.105, T.leather, { color: 0x4a2e1a });
    for (const s of [-1, 1]) mb.box(s * 0.13, 0.27, 0.052, 0.04, 0.03, 0.006, T.metal, { color: 0xd8b04a });
    mb.box(0, 0.32, 0, 0.14, 0.012, 0.03, T.leather, { color: 0x3a2414 });
    for (const s of [-1, 1]) mb.box(s * 0.065, 0.32, 0, 0.015, 0.035, 0.025, T.leather, { color: 0x3a2414 });
    mb.box(0, 0.355, 0, 0.145, 0.014, 0.025, T.leather, { color: 0x3a2414 });
  },
});
defItem({
  key: 'garbage_bag', name: 'Garbage Bag', cat: 'material', weight: 0.05, tags: ['bag', 'plastic', 'garbagebag'],
  bag: { capacity: 10, reduction: 0, slot: 'hand' },
  desc: 'Heavy-duty black bag. Carry junk, line a rain collector, or wear it as a poncho in a pinch.',
  model: (mb) => {
    mb.sphere(0, 0.12, 0, 0.17, 8, 6, S_GARBAGE, { sy: 0.75, fit: true });
    mb.cylinder(0, 0.22, 0, 0.04, 0.05, 6, S_GARBAGE, { rTop: 0.02, fit: true });
    for (const s of [-1, 1]) { mb.push().translate(s * 0.02, 0.27, 0).rotateZ(s * 0.7); mb.box(0, 0.02, 0, 0.02, 0.05, 0.03, S_GARBAGE); mb.pop(); }
  },
});

void K; void rp; void lt; void band; void rodZ;

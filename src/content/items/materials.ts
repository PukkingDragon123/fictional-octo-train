// Items stream — MATERIALS. Drainable boxes/rolls carry `uses` (nails 50,
// screws 40, duct tape 10, glue 5, thread 10, battery 100 = charge %); recipes
// consume `uses` fractions. `burn` = hours of fuel when fed to a fire.
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, dashes, band, panels, slab, folded, rodX, rodZ, prism, ph, bayer, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- textures
const D_NAILS = decal('i_nails_top', 12, 10, (pc) => {
  pc.fill(0xc8a070); pc.strokeRect(0, 0, 12, 10, 0x8a6a42);
  pc.rect(1, 1, 10, 3, 0x2a5aa8); txtC(pc, '', 6, 1, 0); dashes(pc, 2, 2, 8, 0xf2f2ee, 3);
  for (let i = 0; i < 4; i++) { pc.hline(2, 8, 5 + i, 0x8a8e94); pc.set(1, 5 + i, 0x5a5e64); }
});
const D_SCREWS = decal('i_screws_top', 12, 10, (pc) => {
  pc.fill(0xc8a070); pc.strokeRect(0, 0, 12, 10, 0x8a6a42);
  pc.rect(1, 1, 10, 3, 0xc8302a); dashes(pc, 2, 2, 8, 0xf2f2ee, 4);
  for (let i = 0; i < 3; i++) { for (let x = 2; x < 9; x++) pc.set(x, 5 + i * 1.5, x % 2 ? 0xa8acb0 : 0x6a6e74); pc.set(1, 5 + i * 1.5, 0xc8ccd0); }
});
const S_COPPER = tex('i_copper_coil', 12, 6, (pc) => {
  pc.each((x, y) => pc.set(x, y, y % 2 === 0 ? 0xd8823a : 0xa85a22)); pc.vline(2, 0, 5, 0xf2b070);
}, true);
const D_COIL_TOP = tex('i_coil_top', 12, 12, (pc) => {
  pc.fill(0x2a2a2e);
  pc.each((x, y) => { const d = Math.hypot(x - 5.5, y - 5.5); if (d > 2.4 && d < 5.8) pc.set(x, y, Math.round(d * 2) % 2 ? 0xc8722e : 0xe8984a); });
});
const D_PCB = tex('i_pcb', 12, 10, (pc) => {
  pc.fill(0x2a6a3a);
  for (let i = 0; i < 6; i++) pc.line(ph(i, 1, 3) * 11, ph(i, 2, 3) * 9, ph(i, 3, 3) * 11, ph(i, 4, 3) * 9, 0x6ab04a);
  pc.rect(2, 2, 4, 3, 0x1c1c1c); pc.rect(7, 5, 3, 3, 0x1c1c1c); pc.set(9, 2, 0xd8b04a); pc.set(3, 7, 0xd8b04a);
});
const D_TAPE_TOP = tex('i_tape_roll_top', 12, 12, (pc) => {
  pc.fill(0x8a8e94);
  pc.each((x, y) => { const d = Math.hypot(x - 5.5, y - 5.5); if (d < 3.2) pc.set(x, y, d < 2.4 ? 0x3a3a40 : 0xc8a070); else if (Math.round(d * 1.5) % 2) pc.set(x, y, 0x9aa0a6); });
});
const S_TAPE_SIDE = tex('i_tape_side', 12, 4, (pc) => { pc.fill(0x9aa0a6); for (let x = 0; x < 12; x += 2) pc.set(x, 1, 0xb0b6bc); pc.hline(0, 11, 3, 0x7a7e84); }, true);
const S_ROPE = tex('i_rope', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ((x + y * 2) % 4 < 2) ? 0xc8a868 : 0xa88a50)), true);
const D_ROPE_TOP = tex('i_rope_top', 12, 12, (pc) => {
  pc.fill(0x2a2218);
  pc.each((x, y) => { const d = Math.hypot(x - 5.5, y - 5.5); if (d > 1.8 && d < 5.8) pc.set(x, y, (Math.round(d * 1.6) + ((x + y) & 1)) % 2 ? 0xc8a868 : 0x9a7a44); });
});
const S_RAG = tex('i_rag', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 4 === 0 ? 0xc8beaa : (ph(x >> 1, y >> 1, 4) < 0.2 ? 0xd6ccb8 : 0xe2d8c4)));
}, true);
const S_RAG_DIRTY = tex('i_rag_dirty', 8, 8, (pc) => {
  pc.each((x, y) => {
    let c = (x + y) % 4 === 0 ? 0x9a8e78 : 0xb0a48c;
    if (Math.hypot(x - 3, y - 4) < 2.5 + ph(x, y, 2)) c = 0x7a3a2a;
    if (ph(x, y, 9) < 0.1) c = 0x5a5040;
    pc.set(x, y, c);
  });
}, true);
const D_SHEET = tex('i_bedsheet_top', 16, 14, (pc) => {
  pc.fill(0xdce6f0);
  for (let x = 0; x < 16; x += 4) { pc.vline(x, 0, 13, 0x7a9ad0); pc.vline(x + 1, 0, 13, 0xa8c0e4); }
  pc.hline(0, 15, 4, 0xb4c4dc); pc.hline(0, 15, 9, 0xb4c4dc); pc.hline(0, 15, 0, 0xf6f8fa);
});
const S_DENIM = tex('i_denim', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, (x + y) % 3 === 0 ? 0x5a7aaa : (x - y + 16) % 4 === 0 ? 0x2e4a7a : 0x3e5e8e)), true);
const D_SPOOL = tex('i_spool', 12, 6, (pc) => { pc.each((x, y) => pc.set(x, y, (x + (y & 1)) % 2 ? 0xc8302a : 0xa82420)); pc.vline(2, 0, 5, 0xe86a5a); }, true);
const D_NEEDLE_CARD = decal('i_needle_card', 10, 12, (pc) => {
  pc.fill(0xf2ecd8); pc.strokeRect(0, 0, 10, 12, 0xc8bca0); pc.rect(0, 0, 10, 3, 0x2a5aa8);
  for (const x of [2, 5, 8]) { pc.vline(x, 4, 10, 0x9aa0a6); pc.set(x, 4, 0x5a5e64); }
});
const S_SHEETMETAL = tex('i_sheetmetal', 16, 12, (pc) => {
  const R = rp(0x9aa0a6, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[2 + ((x * 3 + y) % 11 === 0 ? 1 : 0) - (ph(x >> 2, y >> 2, 5) < 0.2 ? 1 : 0)]));
  pc.strokeRect(0, 0, 16, 12, R[1]);
  for (const [x, y] of [[1, 1], [14, 1], [1, 10], [14, 10]]) pc.set(x, y, R[4]);
}, false);
const S_BATT = tex('i_battery_label', 16, 8, (pc) => {
  pc.fill(0x1c1c1e); pc.rect(0, 0, 16, 2, 0xd8823a); pc.hline(0, 15, 2, 0x8a5222);
  panels(pc, 2, (x0, pw) => { const cx = Math.round(x0 + pw / 2); pc.rect(cx - 1, 4, 3, 1, 0xd8823a); pc.set(cx, 3, 0xd8823a); pc.set(cx, 5, 0xd8823a); });
}, true);
const D_CHAR_TOP = tex('i_charcoal_top', 12, 10, (pc) => {
  pc.fill(0x2a2a2a); pc.each((x, y) => { if (ph(x >> 1, y >> 1, 4) < 0.4) pc.set(x, y, 0x3e3e42); if (ph(x, y, 5) < 0.08) pc.set(x, y, 0x5a5a5e); });
});
const D_CHAR_FRONT = decal('i_charcoal_front', 12, 14, (pc) => {
  pc.fill(0xc8a070); pc.rect(0, 2, 12, 5, 0x1c1c1c); txtC(pc, 'BBQ', 6, 2, 0xe86a1a);
  stamp(pc, 3, 9, ['.oo.oo', 'oOooOo', '.oo.oo'], { o: 0x3a3a3a, O: 0xe86a1a });
});
const D_LOGEND = tex('i_log_end', 10, 10, (pc) => {
  pc.fill(0xd8b07a);
  pc.each((x, y) => { const d = Math.hypot(x - 4.5, y - 4.5); if (Math.round(d) % 2) pc.set(x, y, 0xc89a62); if (d > 4.3) pc.set(x, y, 0x5a3e24); });
  pc.line(4, 4, 8, 2, 0x8a6a42);
});
const D_COINS = tex('i_coin_top', 8, 8, (pc) => { pc.fill(0xd8b04a); pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); if (d > 3) pc.set(x, y, 0xa8802a); else if (d < 1.6) pc.set(x, y, 0xf2d880); }); });
const D_TARP = tex('i_tarp_top', 16, 14, (pc) => {
  pc.fill(0x2a5ab8); pc.each((x, y) => { if ((x + y) % 2 === 0) pc.set(x, y, 0x3268c8); });
  pc.strokeRect(0, 0, 16, 14, 0x1a4290); pc.hline(0, 15, 6, 0x1a4290);
  for (const [x, y] of [[1, 1], [14, 1], [1, 12], [14, 12]]) pc.set(x, y, 0xc8ccd0);
});
const S_SPRING = tex('i_spring', 8, 8, (pc) => { pc.fill(0x2a2a2e); pc.each((x, y) => { if ((y + Math.floor(x / 2)) % 3 === 0) pc.set(x, y, 0xc8ccd0); else if ((y + Math.floor(x / 2)) % 3 === 1) pc.set(x, y, 0x8a8e94); }); }, true);
const D_CLOTH = tex('i_cloth_bolt', 16, 14, (pc) => {
  pc.fill(0xd8c8a8);
  pc.each((x, y) => { if (x % 4 === 0 || y % 4 === 0) pc.set(x, y, 0xa84a3a); if ((x % 4 === 0) && (y % 4 === 0)) pc.set(x, y, 0x7a2a22); });
  pc.hline(0, 15, 0, 0xe8dcc0);
});
const S_BONE = tex('i_bone', 8, 4, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 3) < 0.15 ? 0xc8bc98 : 0xe8e0c8)), true);

// ---------------------------------------------------------------- wood & fuel
defItem({
  key: 'plank', name: 'Plank', cat: 'material', weight: 2.0, burn: 1.5, tags: ['plank', 'wood'],
  desc: 'A 2x4 board. Barricades, furniture, spears, splints, firewood.',
  model: (mb) => mb.box(0, 0, 0, 1.1, 0.04, 0.095, 'plank'),
});
defItem({
  key: 'firewood', name: 'Firewood', cat: 'fuel', weight: 1.5, burn: 1.5, tags: ['firewood', 'wood'],
  model: (mb) => {
    for (const [z, y, a] of [[-0.05, 0, 0.1], [0.05, 0, -0.05], [0, 0.07, 0.02]] as [number, number, number][]) {
      mb.push().translate(0, y, z).rotateY(a);
      rodX(mb, -0.16, 0.16, 0.04, 0.04, 0.04, 6, { sides: 'bark', top: D_LOGEND, bottom: D_LOGEND }, { fit: false, uvScale: 1 });
      mb.pop();
    }
  },
});
defItem({
  key: 'twigs', name: 'Twigs', cat: 'fuel', weight: 0.3, burn: 0.3, tags: ['twigs', 'tinder', 'wood'],
  desc: 'Kindling. Starts fires; burns fast.',
  model: (mb) => {
    for (let i = 0; i < 7; i++) {
      mb.push().translate(0, 0.004 + (i % 3) * 0.006, -0.03 + i * 0.01).rotateY(-0.25 + ph(i, 1, 3) * 0.5);
      rodX(mb, -0.14, 0.14, 0.004, 0.004, 0.003, 4, 'bark', { color: 0xa88a62 });
      mb.pop();
    }
    mb.box(0, 0, 0, 0.02, 0.025, 0.08, S_ROPE, { uvScale: 4 });
  },
});
defItem({
  key: 'charcoal', name: 'Bag of Charcoal', cat: 'fuel', weight: 1.5, burn: 4, tags: ['charcoal'],
  desc: 'Burns hot and long. About four hours in a fire.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.18, 0.22, 0.09, T.card, { color: 0xc8a070 });
    mb.panel(-0.09, 0.0451, 0.09, 0.0451, 0.0, 0.2, D_CHAR_FRONT, { fit: true });
    mb.flat(0, 0.2201, 0, 0.18, 0.09, D_CHAR_TOP);
    for (const [x, z] of [[-0.04, 0], [0.03, -0.01], [0.0, 0.02]]) mb.box(x, 0.22, z, 0.035, 0.025, 0.03, T.black, { color: 0x3a3a3e });
  },
});

// ---------------------------------------------------------------- fasteners & adhesives
defItem({
  key: 'nails', name: 'Box of Nails', cat: 'material', weight: 0.4, uses: 50, tags: ['nails'],
  desc: 'Fifty nails. Two per plank on a barricade. Also nail-gun ammunition.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.1, 0.045, 0.07, 'cardboard');
    mb.flat(0, 0.0452, 0, 0.1, 0.07, D_NAILS);
    for (const [x, z, a] of [[0.07, 0.02, 0.4], [0.08, -0.01, -0.3]]) { mb.push().translate(x, 0.002, z).rotateY(a); mb.box(0, 0, 0, 0.05, 0.003, 0.003, 'metal_grey'); mb.box(-0.025, 0, 0, 0.004, 0.005, 0.006, 'metal_grey'); mb.pop(); }
  },
});
defItem({
  key: 'screws', name: 'Box of Screws', cat: 'material', weight: 0.3, uses: 40, tags: ['screws'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.09, 0.04, 0.065, 'cardboard');
    mb.flat(0, 0.0402, 0, 0.09, 0.065, D_SCREWS);
  },
});
defItem({
  key: 'duct_tape', name: 'Duct Tape', cat: 'material', weight: 0.25, uses: 10, tags: ['tape'],
  desc: 'Fixes everything, at least temporarily. Ten good strips.',
  model: (mb) => mb.cylinder(0, 0, 0, 0.055, 0.048, 12, { sides: S_TAPE_SIDE, top: D_TAPE_TOP, bottom: D_TAPE_TOP }, { fit: true }),
});
defItem({
  key: 'glue', name: 'Glue', cat: 'material', weight: 0.1, uses: 5, tags: ['glue'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.022, 0.09, 8, T.plastic, { color: 0xf2f2ee, fit: true });
    mb.cylinder(0, 0.03, 0, 0.0228, 0.035, 8, T.white, { color: 0xe86a1a, fit: true, caps: false });
    mb.cylinder(0, 0.09, 0, 0.012, 0.018, 8, T.cap, { color: 0xe86a1a, fit: true, rTop: 0.005 });
  },
});
defItem({
  key: 'zip_ties', name: 'Zip Ties', cat: 'material', weight: 0.05, tags: ['zipties', 'binding'],
  model: (mb) => {
    for (let i = 0; i < 6; i++) { mb.push().translate(0, 0.002 * i, -0.012 + i * 0.005).rotateY(-0.1 + i * 0.04); mb.box(0, 0, 0, 0.2, 0.002, 0.005, T.black); mb.box(0.1, 0, 0, 0.008, 0.005, 0.007, T.black); mb.pop(); }
    mb.box(-0.03, 0, 0, 0.012, 0.016, 0.04, T.white, { color: 0xf2f2ee });
  },
});
defItem({
  key: 'rope', name: 'Rope', cat: 'material', weight: 1.0, burn: 0.3, tags: ['rope', 'binding'],
  desc: 'Ten metres of nylon rope. Snares, lashings, climbing down.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.11, 0.035, 12, { sides: S_ROPE, top: D_ROPE_TOP, bottom: D_ROPE_TOP }, { fit: false, uvScale: 3 });
    mb.cylinder(0, 0, 0, 0.11, 0.035, 12, { sides: S_ROPE, top: D_ROPE_TOP, bottom: S_ROPE }, { fit: true, skip: ['north'] as any });
    rodX(mb, 0.1, 0.2, 0.012, 0.01, 0.01, 6, S_ROPE, { cz: 0.07, uvScale: 3 });
  },
});
defItem({
  key: 'wire', name: 'Electrical Wire', cat: 'material', weight: 0.3, tags: ['wire', 'electrical', 'binding'],
  model: (mb) => mb.cylinder(0, 0, 0, 0.06, 0.03, 10, { sides: S_COPPER, top: D_COIL_TOP, bottom: D_COIL_TOP }, { fit: true }),
});

// ---------------------------------------------------------------- cloth
const crumple = (mb: MB, t: string, color: number) => {
  mb.push().rotateY(0.3); mb.box(0, 0, 0, 0.14, 0.012, 0.1, t, { color, uvScale: 3 }); mb.pop();
  mb.push().translate(0.02, 0.01, 0.01).rotateY(-0.5); mb.box(0, 0, 0, 0.1, 0.012, 0.07, t, { color: dk(color, 0.94), uvScale: 3 }); mb.pop();
  mb.push().translate(-0.03, 0.02, -0.01).rotateY(0.9); mb.box(0, 0, 0, 0.06, 0.01, 0.05, t, { color, uvScale: 3 }); mb.pop();
};
defItem({
  key: 'rag', name: 'Rag', cat: 'material', weight: 0.05, burn: 0.15, tags: ['rag', 'tinder', 'cloth'],
  medical: { type: 'bandage', power: 2 },
  desc: 'Clean cloth. A poor bandage, a good torch wick. Boil or disinfect it to make a proper bandage.',
  model: (mb) => crumple(mb, S_RAG, 0xffffff),
});
defItem({
  key: 'rag_dirty', name: 'Dirty Rag', cat: 'material', weight: 0.05, burn: 0.15, tags: ['rag_dirty', 'tinder'],
  medical: { type: 'bandage', power: 0.5 },
  desc: 'Filthy. Wash it before it touches a wound.',
  model: (mb) => crumple(mb, S_RAG_DIRTY, 0xffffff),
});
defItem({
  key: 'bedsheet', name: 'Bed Sheet', cat: 'material', weight: 0.6, burn: 0.4, tags: ['sheet', 'cloth'],
  desc: 'Rip it into rags, hang it over a window, or knot it into a rope.',
  model: (mb) => folded(mb, 0.3, 0.24, 0.06, D_SHEET, 0xffffff),
});
defItem({
  key: 'cloth', name: 'Fabric', cat: 'material', weight: 0.3, burn: 0.3, tags: ['cloth', 'fabric'],
  desc: 'A folded length of sturdy fabric for sewing bags and patches.',
  model: (mb) => folded(mb, 0.24, 0.2, 0.04, D_CLOTH, 0xffffff),
});
const strips = (mb: MB, t: string, color: number) => {
  for (let i = 0; i < 3; i++) { mb.push().translate(0, i * 0.003, -0.025 + i * 0.025).rotateY(-0.15 + i * 0.15); mb.box(0, 0, 0, 0.22, 0.004, 0.02, t, { color, uvScale: 3 }); mb.pop(); }
};
defItem({
  key: 'denim_strips', name: 'Denim Strips', cat: 'material', weight: 0.05, tags: ['denim', 'cloth'],
  model: (mb) => strips(mb, S_DENIM, 0xffffff),
});
defItem({
  key: 'leather_strips', name: 'Leather Strips', cat: 'material', weight: 0.05, tags: ['leather'],
  model: (mb) => strips(mb, T.leather, 0xd8a878),
});
defItem({
  key: 'thread', name: 'Thread', cat: 'material', weight: 0.03, uses: 10, tags: ['thread'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.016, 0.005, 8, 'wood_light', { fit: true });
    mb.cylinder(0, 0.005, 0, 0.013, 0.03, 8, { sides: D_SPOOL, top: 'wood_light' }, { fit: true });
    mb.cylinder(0, 0.035, 0, 0.016, 0.005, 8, 'wood_light', { fit: true });
  },
});
defItem({
  key: 'needle', name: 'Needles', cat: 'material', weight: 0.01, tags: ['needle'],
  desc: 'A card of sewing needles. Sew, patch — or stitch a wound if you must.',
  model: (mb) => slab(mb, 0.04, 0.003, 0.05, D_NEEDLE_CARD, T.white, 0xf2ecd8, { rot: 0.3 }),
});

// ---------------------------------------------------------------- metal & glass
defItem({
  key: 'scrap_metal', name: 'Scrap Metal', cat: 'material', weight: 0.8, tags: ['scrap', 'metal'],
  model: (mb) => {
    mb.push().rotateY(0.4); mb.box(0, 0, 0, 0.16, 0.006, 0.08, 'metal_rusty'); mb.pop();
    mb.push().translate(0.03, 0.006, 0.02).rotateY(-0.7).rotateZ(0.25); mb.box(0, 0, 0, 0.12, 0.005, 0.05, 'metal_grey'); mb.pop();
    mb.push().translate(-0.04, 0.008, -0.02).rotateY(1.2); mb.box(0, 0, 0, 0.1, 0.02, 0.02, 'metal_dark'); mb.pop();
  },
});
defItem({
  key: 'sheet_metal', name: 'Sheet Metal', cat: 'material', weight: 2.0, tags: ['sheetmetal', 'metal'],
  model: (mb) => mb.box(0, 0, 0, 0.5, 0.004, 0.4, { all: 'metal_grey', top: S_SHEETMETAL }, { fit: { top: true } }),
});
defItem({
  key: 'pipe', name: 'Metal Pipe', cat: 'material', weight: 1.6, tags: ['pipe', 'metal'],
  model: (mb) => {
    rodX(mb, -0.45, 0.45, 0.018, 0.017, 0.017, 8, { sides: 'metal_grey', top: 'i_pipe_end', bottom: 'i_pipe_end' }, { fit: false });
    for (const x of [-0.45, 0.42]) rodX(mb, x, x + 0.03, 0.018, 0.02, 0.02, 8, 'metal_dark');
  },
});
tex('i_pipe_end', 8, 8, (pc) => { pc.fill(0x9aa0a6); pc.each((x, y) => { if (Math.hypot(x - 3.5, y - 3.5) < 2.6) pc.set(x, y, 0x1c1c1e); }); });
defItem({
  key: 'spring', name: 'Spring', cat: 'material', weight: 0.05, tags: ['spring'],
  model: (mb) => rodX(mb, -0.03, 0.03, 0.012, 0.012, 0.012, 8, { sides: S_SPRING, top: T.black, bottom: T.black }, { fit: true }),
});
defItem({
  key: 'glass_shard', name: 'Glass Shard', cat: 'material', weight: 0.05, tags: ['sharp', 'glass'],
  desc: 'Careful. Wrap one end and it is a blade.',
  model: (mb) => {
    prism(mb, [[-0.04, 0.02], [0.05, 0.0], [-0.02, -0.025]], 0, 0.004, 'i_glass', 'i_glass', { color: 0xd8f0e8 });
    prism(mb, [[0.02, 0.04], [0.06, 0.03], [0.03, 0.02]], 0, 0.004, 'i_glass', 'i_glass', { color: 0xc8e8e0 });
  },
});
defItem({
  key: 'stone', name: 'Stone', cat: 'material', weight: 0.4, tags: ['stone'],
  desc: 'Fist-sized. Slingshot ammunition, campfire rings, crushing herbs.',
  model: (mb) => { mb.push().scale(1.2, 1, 0.9); mb.sphere(0, 0.03, 0, 0.04, 6, 5, 'stone_rough', { sy: 0.75 }); mb.pop(); },
});
defItem({
  key: 'bone', name: 'Bone', cat: 'material', weight: 0.2, tags: ['bone'],
  desc: 'Something large, picked clean. Can be carved.',
  model: (mb) => {
    rodX(mb, -0.12, 0.12, 0.016, 0.013, 0.013, 6, S_BONE, { uvScale: 3 });
    for (const x of [-0.13, 0.13]) for (const z of [-0.012, 0.012]) mb.sphere(x, 0.018, z, 0.018, 6, 4, S_BONE, { fit: true });
  },
});

// ---------------------------------------------------------------- electrical parts
defItem({
  key: 'electronics_scrap', name: 'Electronics Scrap', cat: 'material', weight: 0.2, tags: ['electronics', 'scrap'],
  desc: 'Circuit boards, capacitors, a speaker cone. Repairs radios, flashlights and worse.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.12, 0.004, 0.09, { all: T.black, top: D_PCB }, { fit: { top: true }, color: 0xffffff });
    mb.cylinder(0.035, 0.004, 0.025, 0.006, 0.014, 6, T.white, { color: 0x2a5aa8 });
    mb.box(-0.02, 0.004, -0.02, 0.03, 0.006, 0.02, T.black);
    for (let i = 0; i < 3; i++) mb.box(-0.06 - i * 0.008, 0.004, 0.03 - i * 0.01, 0.04, 0.003, 0.003, T.white, { color: [0xc8302a, 0xf0c419, 0x2a2a2a][i] });
  },
});
defItem({
  key: 'battery', name: 'Battery', cat: 'material', weight: 0.06, uses: 100, tags: ['battery'],
  desc: 'Rechargeable D cell. Charge is shown as a percentage.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.016, 0.058, 8, { sides: S_BATT, top: T.tinTop, bottom: T.tinTop }, { fit: true });
    mb.cylinder(0, 0.058, 0, 0.005, 0.003, 6, T.tin, { fit: true });
  },
});
defItem({
  key: 'fuse', name: 'Fuse', cat: 'material', weight: 0.02, tags: ['fuse', 'electrical'],
  model: (mb) => {
    rodX(mb, -0.02, 0.02, 0.008, 0.007, 0.007, 6, 'i_glass', { color: 0xe8f0f0 });
    for (const x of [-0.03, 0.02]) rodX(mb, x, x + 0.01, 0.008, 0.008, 0.008, 6, T.tin);
    rodX(mb, -0.02, 0.02, 0.008, 0.001, 0.001, 3, T.tin);
  },
});
defItem({
  key: 'lightbulb', name: 'Light Bulb', cat: 'material', weight: 0.05, tags: ['lightbulb', 'electrical'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.011, 0.02, 8, T.tin, { fit: true });
    mb.cylinder(0, 0.02, 0, 0.013, 0.012, 8, T.white, { color: 0xf2f2ee, fit: true, rTop: 0.016 });
    mb.sphere(0, 0.052, 0, 0.03, 8, 5, 'i_glass', { color: 0xf6f2e2 });
  },
});
defItem({
  key: 'fluoro_tube', name: 'Fluorescent Tube', cat: 'material', weight: 0.3, tags: ['fluoro', 'electrical', 'glass'],
  desc: 'A replacement tube for the ceiling lights. It hums even when it is off.',
  model: (mb) => {
    rodX(mb, -0.58, 0.58, 0.014, 0.013, 0.013, 6, 'i_white', { color: 0xf6f6f0 });
    for (const x of [-0.6, 0.58]) rodX(mb, x, x + 0.02, 0.014, 0.014, 0.014, 6, T.tin);
  },
});

// ---------------------------------------------------------------- misc materials
defItem({
  key: 'coins', name: 'Coins', cat: 'material', weight: 0.05, value: 1, tags: ['coins', 'shiny'],
  desc: 'Loose change. Worthless here — but it is shiny, and some things like shiny.',
  model: (mb) => {
    const pos: [number, number, number][] = [[0, 0, 0], [0.018, 0, 0.012], [-0.016, 0, 0.014], [0.004, 0.003, 0.004], [0.006, 0.006, 0.0], [-0.02, 0, -0.016], [0.022, 0, -0.012]];
    pos.forEach(([x, y, z], i) => mb.cylinder(x, y, z, 0.012, 0.003, 8, { sides: T.tin, top: D_COINS, bottom: D_COINS }, { fit: true, color: i % 3 === 0 ? 0xd8dce0 : 0xffffff }));
  },
});
defItem({
  key: 'tarp', name: 'Tarp', cat: 'material', weight: 1.2, tags: ['tarp'],
  desc: 'Waterproof sheet with grommets. Rain collectors, shelters, tents.',
  model: (mb) => folded(mb, 0.3, 0.26, 0.07, D_TARP, 0xffffff, { side: T.foldSide }),
});

void K; void rp; void lt; void txt; void band; void bayer; void rodZ;

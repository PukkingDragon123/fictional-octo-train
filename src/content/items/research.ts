// Items stream — RESEARCH: the samples a survivor collects in the field
// (src/research/collect.ts) and the research tools the codex issues as prizes
// (src/game/codex.ts TOOLS; their effects live in src/research/tools.ts).
// Samples carry what they came from in item.data: { src, q } (the codex entry
// key and a quality 0..1). They bank at the Remittance Press (tubed to the
// lab) or when you walk out of the building; on a dead body they are lost.
import { defItem } from '../../items/item';
import { tex, decal, T, txt, dashes, ph, type MB } from './_kit';

// ---------------------------------------------------------------- textures
const L_VIAL = decal('i_vial_label', 8, 10, (pc) => { pc.fill(0xf2f0e4); pc.rect(0, 0, 8, 2, 0xc8302a); dashes(pc, 1, 4, 6, 0x2a2a3a, 2); dashes(pc, 1, 6, 5, 0x2a2a3a, 5); pc.set(6, 8, 0x2a2a3a); });
const S_TISSUE = tex('i_tissue', 8, 8, (pc) => pc.each((x, y) => { const v = ph(x, y, 5); pc.set(x, y, v < 0.25 ? 0xe88a8a : v < 0.6 ? 0xc84a5a : v < 0.85 ? 0x9a2a3a : 0xf0c0b0); }), true);
const S_FLUID = tex('i_sfluid', 6, 8, (pc) => pc.each((x, y) => pc.set(x, y, y < 1 ? 0xb8ffd0 : ph(x, y, 3) < 0.2 ? 0x8af0b0 : 0x3ac880)), true);
const S_SPORE = tex('i_spores', 8, 8, (pc) => pc.each((x, y) => { const v = ph(x, y, 9); pc.set(x, y, v < 0.3 ? 0xf0e8a0 : v < 0.7 ? 0xc8b050 : 0x8a7a2a); }), true);
const S_RESIDUE = tex('i_residue', 8, 8, (pc) => pc.each((x, y) => { const v = ph(x, y, 4); pc.set(x, y, v < 0.3 ? 0xd0a8ff : v < 0.7 ? 0x8a5ad8 : 0x4a2a8a); }), true);
const D_DART = decal('i_dart_band', 8, 6, (pc) => { pc.fill(0xe8443a); pc.rect(0, 2, 8, 2, 0xf2f0e4); txt(pc, 'Z', 3, 1, 0x2a2a3a); });
const D_PING = decal('i_pinger_face', 12, 10, (pc) => { pc.fill(0x1a2a30); pc.each((x, y) => { const d = Math.hypot(x - 5.5, y - 4.5); if (Math.abs(d - 3.5) < 0.6 || Math.abs(d - 1.5) < 0.6) pc.set(x, y, 0x3ad8ff); }); pc.set(5, 4, 0xe8fff8); pc.rect(9, 8, 2, 1, 0xff5a3a); });
const D_LURE = decal('i_lure_label', 10, 8, (pc) => { pc.fill(0xc8e040); pc.rect(0, 0, 10, 2, 0x2a2a1a); txt(pc, 'BAIT', 0, 2, 0x2a2a1a); pc.rect(2, 7, 6, 1, 0x6a7a10); });
const D_FOAM = decal('i_foam_label', 10, 14, (pc) => { pc.fill(0xf0e8c8); pc.rect(0, 0, 10, 3, 0xe8a020); txt(pc, 'SEAL', 0, 4, 0x2a2a2a); for (let x = 0; x < 10; x += 2) pc.set(x, 12, 0x2a2a2a); dashes(pc, 1, 10, 8, 0xa8302a, 3); });
const D_FILTER = decal('i_filter_face', 10, 10, (pc) => { pc.fill(0x2a2a2a); pc.each((x, y) => { if ((x + y) % 2 === 0 && Math.hypot(x - 4.5, y - 4.5) < 4) pc.set(x, y, 0x5a5a5a); }); pc.rect(0, 0, 10, 2, 0xe8c228); });
const D_INHALER = decal('i_inhaler_label', 8, 12, (pc) => { pc.fill(0x7ab8ff); pc.rect(0, 0, 8, 3, 0xf2f2ee); txt(pc, 'C', 2, 4, 0xf2f2ee); dashes(pc, 1, 10, 6, 0x2a4a8a, 2); });
const D_KIT = decal('i_kit2_lid', 14, 10, (pc) => { pc.fill(0xd8dcd8); pc.rect(0, 0, 14, 3, 0x2a8a60); txt(pc, 'MKII', 1, 3, 0x1a3a2a); pc.rect(5, 8, 4, 1, 0xc8302a); pc.rect(6, 7, 2, 3, 0xc8302a); });

// ---------------------------------------------------------------- samples
/** a capped sample vial / jar / slide box with its contents showing */
function vial(mb: MB, fill: string, o: { r?: number; h?: number; cap?: number; fillH?: number } = {}) {
  const r = o.r ?? 0.012, h = o.h ?? 0.07;
  mb.cylinder(0, 0, 0, r * 0.96, h * (o.fillH ?? 0.62), 8, fill, { fit: true, emissive: 0.15 });
  mb.cylinder(0, 0, 0, r, h, 8, 'i_glass', { color: 0xeef8f6, fit: true });
  mb.cylinder(0, h, 0, r * 1.12, h * 0.18, 8, T.plastic, { color: o.cap ?? 0xc8302a });
  mb.box(0, h * 0.3, r * 1.01, r * 1.4, h * 0.34, 0.001, L_VIAL, { fit: true });
}
const SAMPLE = (key: string, name: string, desc: string, model: (mb: MB) => void) => defItem({
  key, name, cat: 'misc', weight: 0.06, value: 1, noStack: true, tags: ['sample', 'research'], desc, model,
});
SAMPLE('sample_tissue', 'Tissue Sample', 'A tissue cassette in a screw-top jar, labelled in your handwriting. Bank it at the Remittance Press (it is tubed to the lab) or carry it out. If you die with it, it is lost.', (mb) => {
  vial(mb, S_TISSUE, { r: 0.02, h: 0.06, cap: 0x2a6ac8, fillH: 0.5 });
  mb.box(0.018, 0, -0.01, 0.03, 0.006, 0.02, T.plastic, { color: 0xf0f0e8 });
});
SAMPLE('sample_fluid', 'Fluid Sample', 'A stoppered vial of something drawn from something. Still warm. Bank it at the press or carry it out; it is lost if you die with it.', (mb) => vial(mb, S_FLUID, { cap: 0xc8302a, fillH: 0.7 }));
SAMPLE('sample_spores', 'Spore Sample', 'A swab sealed in a tube. The tube is fogging from the inside. Bank it at the press or carry it out.', (mb) => {
  vial(mb, S_SPORE, { r: 0.01, h: 0.09, cap: 0xe8c228, fillH: 0.4 });
});
SAMPLE('sample_residue', 'Residue Sample', 'Scrapings in a slide box. The slides hum faintly. Bank it at the press or carry it out.', (mb) => {
  mb.box(0, 0, 0, 0.05, 0.012, 0.03, T.plastic, { color: 0x2a2a30 });
  mb.box(0, 0.012, 0, 0.044, 0.004, 0.026, S_RESIDUE, { fit: true, emissive: 0.3 });
  mb.box(0, 0.016, 0, 0.05, 0.003, 0.03, 'i_glass', { color: 0xeef4ff });
});

// ---------------------------------------------------------------- research tools (codex prizes)
defItem({
  key: 'tool_dart', name: 'Sedative Dart', cat: 'tool', weight: 0.05, tags: ['research_tool', 'research'], value: 4,
  desc: 'Meridian Research Issue. Fire it at the nearest creature in front of you: it drops for ten seconds. Takes the edge off the sampling.',
  model: (mb) => {
    mb.cylinderX(0, 0.008, 0, 0.0055, 0.07, 6, 'i_glass', { color: 0xeef8f6 });
    mb.cylinderX(-0.006, 0.008, 0, 0.0045, 0.04, 6, D_DART, { fit: true, emissive: 0.1 });
    mb.cylinderX(0.042, 0.008, 0, 0.0015, 0.024, 4, T.tin);
    for (const a of [0, 2.1, 4.2]) { mb.push().translate(-0.04, 0.008, 0).rotateX(a); mb.box(0, 0, 0, 0.018, 0.012, 0.001, T.plastic, { color: 0xe8443a }); mb.pop(); }
  },
});
defItem({
  key: 'tool_pinger', name: 'Sonar Pinger', cat: 'tool', weight: 0.4, uses: 3, tags: ['research_tool', 'research'], value: 8,
  desc: 'Meridian Research Issue. Three pings: each shows everything that moves within 18 m, through walls, for eight seconds. It is not quiet.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.07, 0.03, 0.11, T.plastic, { color: 0x3a4a50 });
    mb.box(0, 0.03, 0.01, 0.06, 0.002, 0.06, D_PING, { fit: true, emissive: 0.6 });
    mb.cylinder(0, 0.03, -0.04, 0.012, 0.012, 8, T.tin);
    mb.cylinder(0.026, 0.03, -0.04, 0.003, 0.05, 4, T.tin);
  },
});
defItem({
  key: 'tool_lure', name: 'Lure Jar', cat: 'tool', weight: 0.35, tags: ['research_tool', 'research'], value: 4,
  desc: 'Meridian Research Issue. Pheromone paste and a rattle in a thin jar. Smash it a few metres ahead and everything nearby goes to look for 25 seconds.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.032, 0.085, 8, 'i_glass', { color: 0xe0f0c0 });
    mb.cylinder(0, 0.002, 0, 0.03, 0.05, 8, S_SPORE, { fit: true, color: 0xc8e060 });
    mb.box(0, 0.025, 0.031, 0.04, 0.03, 0.002, D_LURE, { fit: true });
    mb.cylinder(0, 0.085, 0, 0.034, 0.014, 8, { sides: T.tin, top: T.tinTop }, { fit: true });
  },
});
defItem({
  key: 'tool_foam', name: 'Seam-Sealant Foam', cat: 'tool', weight: 0.5, uses: 2, tags: ['research_tool', 'research'], value: 6,
  desc: 'Meridian Research Issue. Expanding sealant for wall seams. Two blasts; whatever stands in front of you is glued to the floor for six seconds.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.03, 0.15, 10, D_FOAM, { fit: true });
    mb.cylinder(0, 0.15, 0, 0.022, 0.02, 8, T.tin, { rTop: 0.012 });
    mb.box(0, 0.172, 0.012, 0.012, 0.012, 0.03, T.plastic, { color: 0xe8a020 });
    mb.cylinderZ(0, 0.176, 0.05, 0.003, 0.05, 4, T.plastic, { color: 0x2a2a2a });
  },
});
defItem({
  key: 'tool_filter', name: 'Hazmat Filter', cat: 'tool', weight: 0.25, tags: ['research_tool', 'research'], value: 6,
  desc: 'Meridian Research Issue. A respirator cartridge soaked in checksum fluid. Carry it: most sickness never gets in, and what does clears twice as fast.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 0.035, 10, T.plastic, { color: 0x3a3a3a });
    mb.cylinder(0, 0.035, 0, 0.038, 0.002, 10, { sides: T.plastic, top: D_FILTER }, { fit: true });
    mb.cylinder(0, -0.012, 0, 0.018, 0.012, 8, T.tin);
  },
});
defItem({
  key: 'tool_inhaler', name: 'Calm-Inhaler', cat: 'tool', weight: 0.08, uses: 3, tags: ['research_tool', 'research'], value: 5,
  desc: 'Meridian Research Issue. Ground memory crystal in a propellant. Three puffs; each takes the panic out of you and keeps it out for a while.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.024, 0.07, 0.03, D_INHALER, { fit: true });
    mb.box(0, 0.0, 0.026, 0.022, 0.02, 0.03, T.plastic, { color: 0xe8e8e0 });
    mb.cylinder(0, 0.07, 0, 0.008, 0.012, 6, T.tin);
  },
});
defItem({
  key: 'tool_kit2', name: 'Sample Kit Mk II', cat: 'tool', weight: 0.6, tags: ['research_tool', 'research'], value: 10,
  desc: 'Meridian Research Issue. A proper field kit: tongs, scalpels, vacuum vials. Carry it: sampling windows are wider, samples come out cleaner and a body gives two.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.16, 0.05, 0.1, T.plastic, { color: 0xd8dcd8 });
    mb.box(0, 0.05, 0, 0.15, 0.002, 0.09, D_KIT, { fit: true });
    mb.box(0, 0.052, -0.052, 0.06, 0.012, 0.01, T.plastic, { color: 0x2a2a2a });
    for (const x of [-0.07, 0.07]) mb.box(x, 0.02, 0.051, 0.012, 0.012, 0.004, T.tin);
  },
});

// Items stream — MEDICAL. Bandage power follows PZ (rag 2, sterile bandage
// 3.5–4, dirty dressings 0.5). Pills carry `food.pills` + `uses` (one pill per
// use) and a MedicalProps type the health system dispatches on.
import { defItem } from '../../items/item';
import { tex, decal, labelTex, T, K, rp, dk, lt, txtC, stamp, stampC, dashes, band, panels, bottle, pack, slab, rodX, pillBottle, ph, bayer, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- textures
const S_GAUZE = tex('i_gauze', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x % 3 === 0 || y % 3 === 0) ? 0xe2e2dc : 0xf6f6f0));
}, true);
const S_GAUZE_DIRTY = tex('i_gauze_dirty', 8, 8, (pc) => {
  pc.each((x, y) => {
    let c = (x % 3 === 0 || y % 3 === 0) ? 0xcfc6b0 : 0xe2dccb;
    const d = Math.hypot(x - 4, y - 3.5);
    if (d < 2.6 + ph(x, y, 3)) c = d < 1.4 ? 0x7a2a22 : 0xa0503a;
    pc.set(x, y, c);
  });
}, true);
const D_ROLL_END = tex('i_roll_end', 8, 8, (pc) => {
  pc.fill(0xf2f2ec);
  for (let a = 0; a < 40; a++) { const t = a * 0.45, r = 0.4 + a * 0.085; pc.set(Math.round(3.5 + Math.cos(t) * r), Math.round(3.5 + Math.sin(t) * r), 0xc8c8c0); }
});
const D_GAUZE_PACK = decal('i_gauze_pack', 12, 12, (pc) => {
  pc.fill(0xf6f4ee); pc.strokeRect(0, 0, 12, 12, 0xd8d6cc);
  pc.rect(4, 2, 4, 8, 0xc8302a); pc.rect(2, 4, 8, 4, 0xc8302a);
  dashes(pc, 2, 10, 8, 0x2a5a9a, 3);
  for (let x = 0; x < 12; x += 2) { pc.set(x, 0, 0xe2e0d6); pc.set(x, 11, 0xe2e0d6); }
});
const L_IODINE = labelTex('i_iodine_label', 24, 10, { bg: 0xf4f2ec, band: 0x8a3a1a, iconY: 3, icon: ['.rr.', 'rrrr', 'rrrr', '.rr.'], pal: { r: 0xc8302a } });
const D_WIPES = decal('i_wipes_front', 12, 8, (pc) => { pc.fill(0x2a6ac8); pc.rect(1, 1, 10, 3, 0xf6f6f2); txtC(pc, '70', 6, 2, 0x2a6ac8); pc.rect(4, 5, 4, 2, 0xf6f6f2); });
const pillLabel = (name: string, bg: number, bandC: number, icon: string[], pal: Record<string, number>) => labelTex(name, 24, 8, { bg, band: bandC, iconY: 3, icon, pal, dashesY: undefined });
const L_PAIN = pillLabel('i_pill_pain', 0xf4f2ec, 0xc8302a, ['rr.bb', 'rr.bb'], { r: 0xc8302a, b: 0x2a5aa8 });
const L_RX = tex('i_pill_rx', 24, 8, (pc) => {
  pc.fill(0xf6f4ee); band(pc, 0, 1, 0x2a5a9a);
  panels(pc, 2, (x0, pw) => { dashes(pc, x0 + 2, 2, pw - 4, 0x2a3a5a, 3); dashes(pc, x0 + 2, 4, pw - 5, 0x2a3a5a, 4); dashes(pc, x0 + 3, 6, pw - 7, 0xc8302a, 5); });
}, true);
const L_RX2 = tex('i_pill_rx2', 24, 8, (pc) => {
  pc.fill(0xf6f4ee); band(pc, 0, 1, 0x3a8a5a);
  panels(pc, 2, (x0, pw) => { dashes(pc, x0 + 2, 2, pw - 4, 0x2a3a2a, 6); dashes(pc, x0 + 2, 4, pw - 5, 0x2a3a2a, 7); pc.rect(x0 + pw / 2 - 1, 6, 3, 1, 0x3a8a5a); });
}, true);
const L_VIT = pillLabel('i_pill_vit', 0xf2a030, 0xf6e07a, ['.ww.', 'wwww', '.ww.'], { w: 0xfaf6ea });
const L_SLEEP = pillLabel('i_pill_sleep', 0x2a2a5a, 0x6a6aaa, ['..yy', '.yy.', '..yy'], { y: 0xf2e08a });
const L_CHECK = tex('i_pill_checksum', 24, 8, (pc) => {
  pc.fill(0x1c1a2a);
  panels(pc, 2, (x0, pw) => {
    for (let i = 0; i < pw; i++) for (let y = 1; y < 7; y++) if (ph(x0 + i, y, 3) < 0.35) pc.set(x0 + i, y, [0x6af0ff, 0xff6ad8, 0xf2f2f2][Math.floor(ph(i, y, 4) * 3)]);
    pc.rect(Math.round(x0 + pw / 2) - 2, 3, 5, 2, 0xf2f2f2);
  });
}, true);
const D_COLD = decal('i_coldpills_front', 12, 8, (pc) => {
  pc.fill(0xf08a2a); pc.rect(0, 5, 12, 3, 0x2a5aa8);
  stamp(pc, 1, 1, ['.ss.', 'sSSs', '.ss.'], { s: 0xa8d8f8, S: 0xffffff });
  dashes(pc, 6, 2, 5, 0xffffff, 2); dashes(pc, 2, 6, 8, 0xffffff, 3);
});
const D_SUTURE = decal('i_suture_pack', 12, 8, (pc) => {
  pc.fill(0xd8dce0); pc.strokeRect(0, 0, 12, 8, 0xb8bcc0);
  pc.rect(1, 1, 5, 6, 0x3a6ab8); dashes(pc, 2, 3, 3, 0xf2f2f2, 3);
  for (let a = 0; a < 8; a++) { const t = Math.PI * (0.1 + a / 9); pc.set(Math.round(9 + Math.cos(t) * 2), Math.round(5 - Math.sin(t) * 2), 0x6a6a72); }
  pc.line(7, 5, 10, 7, 0x2a2a6a);
});
const D_KIT_FRONT = decal('i_firstaid_front', 16, 12, (pc) => {
  pc.fill(0xc8302a); pc.strokeRect(0, 0, 16, 12, 0x8a1e1a);
  pc.rect(6, 2, 4, 8, 0xf6f4ee); pc.rect(4, 4, 8, 4, 0xf6f4ee);
  pc.hline(1, 14, 1, 0xe05040);
});
const S_COTTON = tex('i_cotton', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x >> 1, y >> 1, 7) < 0.3 ? 0xe6e6e2 : 0xfafaf8)), true);
const L_EPI = tex('i_epipen', 16, 6, (pc) => {
  pc.fill(0xf0c419);
  panels(pc, 2, (x0, pw) => { pc.rect(x0 + 1, 2, pw - 2, 2, 0x2a5aa8); });
  band(pc, 0, 1, 0xd8a810);
}, true);
const D_POULTICE = tex('i_poultice', 10, 10, (pc) => {
  pc.fill(0xd8ccb0);
  pc.ellipse(5, 5, 4, 3.4, 0x5a7a2a);
  pc.each((x, y) => { if (Math.hypot(x - 5, y - 5) < 3.2 && ph(x, y, 9) < 0.3) pc.set(x, y, 0x7a9a3a); });
  pc.set(3, 4, 0xa8c85a); pc.set(6, 6, 0x3a5a1a);
});

// ---------------------------------------------------------------- dressings
const roll = (mb: MB, side: string, end: string, color = 0xffffff) => {
  rodX(mb, -0.04, 0.04, 0.025, 0.025, 0.025, 8, { sides: side, top: end, bottom: end }, { fit: true, color });
  mb.box(0.0, 0.0, 0.03, 0.06, 0.003, 0.03, side, { color });
};
defItem({
  key: 'bandage', name: 'Bandage', cat: 'medical', weight: 0.05, tags: ['bandage'],
  medical: { type: 'bandage', power: 3.5, sterile: true },
  desc: 'Clean, sterile dressing. Stops bleeding; change it before it turns.',
  model: (mb) => roll(mb, S_GAUZE, D_ROLL_END),
});
defItem({
  key: 'bandage_dirty', name: 'Dirty Bandage', cat: 'medical', weight: 0.05, tags: ['dirty_dressing'],
  medical: { type: 'bandage', power: 0.5 },
  desc: 'Bloodied. Wash it out into a rag, then boil or disinfect it.',
  model: (mb) => roll(mb, S_GAUZE_DIRTY, D_ROLL_END, 0xe8e0d0),
});
defItem({
  key: 'gauze', name: 'Sterile Gauze Pads', cat: 'medical', weight: 0.03, tags: ['bandage'],
  medical: { type: 'bandage', power: 4, sterile: true },
  model: (mb) => {
    slab(mb, 0.09, 0.008, 0.09, D_GAUZE_PACK, T.white, 0xf0eee8, { rot: 0.2 });
    slab(mb, 0.09, 0.008, 0.09, D_GAUZE_PACK, T.white, 0xf0eee8, { y: 0.008, x: 0.01, z: -0.008, rot: -0.15 });
  },
});
defItem({
  key: 'cotton_balls', name: 'Cotton Balls', cat: 'medical', weight: 0.05, tags: ['cotton', 'tinder'],
  medical: { type: 'bandage', power: 1 },
  desc: 'Soak with disinfectant or liquor to make swabs. Excellent tinder.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.1, 0.06, 0.07, T.plastic, { color: 0xe8f0f4 });
    for (let i = 0; i < 6; i++) mb.sphere(-0.03 + (i % 3) * 0.03, 0.065, i < 3 ? -0.015 : 0.015, 0.016, 6, 4, S_COTTON, { fit: true });
    mb.box(0, 0.035, 0.0352, 0.06, 0.02, 0.001, T.white, { color: 0x6aa0d8 });
  },
});

// ---------------------------------------------------------------- disinfection
defItem({
  key: 'disinfectant', name: 'Disinfectant', cat: 'medical', weight: 0.3, uses: 10, tags: ['disinfectant'],
  medical: { type: 'disinfect', power: 1 },
  desc: 'Povidone-iodine. Clean wounds before you dress them; sterilises rags into bandages.',
  model: (mb) => bottle(mb, { r: 0.03, h: 0.15, neckR: 0.012, neckH: 0.015, shoulder: 0.02, body: T.plastic, bodyColor: 0x8a3a1a, label: L_IODINE, labelY: 0.025, labelH: 0.07, cap: 0xf2f2ee, capH: 0.02 }),
});
defItem({
  key: 'alcohol_wipes', name: 'Alcohol Wipes', cat: 'medical', weight: 0.08, uses: 10, tags: ['disinfectant'],
  medical: { type: 'disinfect', power: 0.7 },
  model: (mb) => pack(mb, 0.1, 0.06, 0.05, D_WIPES, 0x2a6ac8),
});

// ---------------------------------------------------------------- pills
const pills = (key: string, name: string, type: any, uses: number, label: string, body: number, cap: number, desc: string, extra: any = {}) => defItem({
  key, name, cat: 'medical', weight: 0.08, uses, tags: ['pills', ...(extra.tags ?? [])],
  medical: { type, power: extra.power ?? 1 }, food: { hunger: 0, calories: 0, pills: true }, desc,
  rare: extra.rare, anomaly: extra.anomaly,
  model: extra.model ?? ((mb: MB) => pillBottle(mb, label, body, cap, extra.r ?? 0.022, extra.h ?? 0.07)),
});
pills('painkillers', 'Painkillers', 'painkiller', 10, L_PAIN, 0xf2f2ee, 0xf2f2ee, 'Two every six hours. Takes the edge off pain so you can sleep and swing.');
pills('antibiotics', 'Antibiotics', 'antibiotic', 10, L_RX, 0xe8862a, 0xf6f6f2, 'Prescription. Clears wound infections over a few days.');
pills('antidepressants', 'Antidepressants', 'antidepressant', 10, L_RX2, 0xe8862a, 0xf6f6f2, 'Slowly lifts unhappiness. Takes a while to kick in.');
pills('sleeping_pills', 'Sleeping Pills', 'sedative', 10, L_SLEEP, 0x6a7ab8, 0xf2f2ee, 'Knocks you out, even here. Not something to take alone.');
pills('vitamins', 'Vitamins', 'vitamins', 30, L_VIT, 0xf6f4ee, 0xf2a030, 'Daily multivitamin. Helps you shrug off colds and heal a little faster.', { r: 0.03, h: 0.1 });
pills('cold_pills', 'Cold Medicine', 'cold', 10, '', 0, 0, 'Eases a cold: fewer sneezes and coughs (and less noise).', {
  model: (mb: MB) => pack(mb, 0.09, 0.06, 0.025, D_COLD, 0xf08a2a),
});
pills('checksum_pills', 'Checksum Pills', 'checksum', 3, L_CHECK, 0x24203a, 0x6af0ff, 'Unlabelled capsules that hum faintly. Each one re-verifies a little of you against the original: reduces simulation corruption.', {
  power: 0.25, rare: true, anomaly: 'checksum', tags: ['anomalous'],
  model: (mb: MB) => {
    pillBottle(mb, L_CHECK, 0x24203a, 0x6af0ff, 0.022, 0.07);
    mb.box(0, 0.075, 0, 0.012, 0.004, 0.006, 'i_white', { color: 0x6af0ff, emissive: 1.2 });
  },
});

// ---------------------------------------------------------------- procedures
defItem({
  key: 'suture_needle', name: 'Suture Kit', cat: 'medical', weight: 0.03, uses: 4, tags: ['suture'],
  medical: { type: 'suture', power: 1, sterile: true },
  desc: 'Four sterile sutures. Stitch deep wounds closed; hurts less than needle and thread.',
  model: (mb) => slab(mb, 0.1, 0.006, 0.065, D_SUTURE, T.white, 0xd8dce0),
});
defItem({
  key: 'splint', name: 'Splint', cat: 'medical', weight: 0.6, tags: ['splint'],
  medical: { type: 'splint', power: 1 },
  desc: 'Immobilises a fractured limb so it heals many times faster.',
  model: (mb) => {
    for (const z of [-0.022, 0.022]) mb.box(0, 0, z, 0.36, 0.014, 0.03, 'i_wood', { uvScale: 2 });
    for (const x of [-0.11, 0.0, 0.11]) mb.box(x, 0, 0, 0.035, 0.018, 0.08, S_GAUZE, { color: 0xeee8dc });
  },
});
defItem({
  key: 'adrenaline', name: 'Adrenaline Injector', cat: 'medical', weight: 0.06, uses: 1, tags: ['injector'],
  medical: { type: 'adrenaline', power: 1 },
  desc: 'Auto-injector. A burst of endurance and clarity — and a crash an hour later.',
  model: (mb) => {
    rodX(mb, -0.07, 0.06, 0.012, 0.012, 0.012, 8, L_EPI, { fit: true });
    rodX(mb, 0.06, 0.08, 0.012, 0.012, 0.012, 8, T.white, { color: 0xf08a2a });
    rodX(mb, -0.08, -0.07, 0.012, 0.009, 0.009, 8, T.white, { color: 0x2a5aa8 });
  },
});
defItem({
  key: 'first_aid_kit', name: 'First Aid Kit', cat: 'medical', weight: 0.6, tags: ['kit', 'firstaid'],
  bag: { capacity: 3, reduction: 0, slot: 'hand' },
  desc: 'Holds your dressings and pills in one place.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.24, 0.07, 0.17, T.plastic, { color: 0xc8302a });
    mb.box(0, 0.07, 0, 0.245, 0.012, 0.175, T.plastic, { color: 0xb02622 });
    mb.flat(0, 0.0821, 0, 0.2, 0.14, D_KIT_FRONT);
    mb.panel(-0.11, 0.0851, 0.11, 0.0851, 0.01, 0.06, D_KIT_FRONT, { fit: true });
    mb.box(0, 0.082, -0.05, 0.08, 0.016, 0.014, T.plastic, { color: 0x2a2a2a });
    for (const s of [-1, 1]) mb.box(s * 0.04, 0.03, 0.0865, 0.016, 0.02, 0.004, T.plastic, { color: 0xe0e0dc });
  },
});
defItem({
  key: 'tweezers', name: 'Tweezers', cat: 'tool', weight: 0.02, tags: ['tweezers'],
  medical: { type: 'tweezers', power: 1 },
  desc: 'Pulls glass shards and bullets out of wounds.',
  model: (mb) => {
    for (const s of [-1, 1]) { mb.push().rotateY(s * 0.06); mb.box(0, 0, 0, 0.1, 0.003, 0.006, T.steel, { uvScale: 2 }); mb.pop(); }
    mb.box(-0.048, 0, 0, 0.012, 0.004, 0.012, T.steel);
  },
});
defItem({
  key: 'forceps', name: 'Forceps', cat: 'tool', weight: 0.05, tags: ['tweezers'],
  medical: { type: 'tweezers', power: 1.3 },
  model: (mb) => {
    for (const s of [-1, 1]) { mb.push().rotateY(s * 0.12); mb.box(0.02, 0, 0, 0.12, 0.004, 0.005, T.steel); mb.pop(); }
    for (const s of [-1, 1]) mb.box(-0.055, 0, s * 0.016, 0.018, 0.004, 0.016, T.steel);
  },
});
defItem({
  key: 'scalpel', name: 'Scalpel', cat: 'tool', weight: 0.02, tags: ['knife', 'sharp', 'scalpel'],
  weapon: { kind: 'blade', dmg: [4, 7], range: 0.85, speed: 1.9, endurance: 0.02, crit: 0.3, knock: 0.05, durability: 25, noise: 3 },
  model: (mb) => {
    mb.box(-0.03, 0, 0, 0.09, 0.006, 0.01, T.steel, { color: 0xb8c0c8 });
    mb.box(0.03, 0.001, 0, 0.035, 0.003, 0.008, T.steel);
    mb.box(0.05, 0.001, 0.001, 0.01, 0.003, 0.005, T.steel, { color: 0xffffff });
  },
});
defItem({
  key: 'syringe', name: 'Syringe', cat: 'medical', weight: 0.01, tags: ['syringe'],
  desc: 'Empty, sterile. Useful for precise doses.',
  model: (mb) => {
    rodX(mb, -0.04, 0.03, 0.007, 0.007, 0.007, 6, T.plastic, { color: 0xe8f0f4 });
    rodX(mb, 0.03, 0.05, 0.007, 0.0015, 0.0015, 4, T.steel);
    rodX(mb, -0.065, -0.04, 0.007, 0.003, 0.003, 4, T.plastic, { color: 0xf2f2ee });
    mb.box(-0.066, 0, 0, 0.004, 0.014, 0.014, T.plastic, { color: 0xf2f2ee });
  },
});
defItem({
  key: 'poultice', name: 'Herbal Poultice', cat: 'medical', weight: 0.1, tags: ['poultice'],
  medical: { type: 'disinfect', power: 0.6 },
  desc: 'Crushed wild greens in a cloth. Draws out infection and soothes a little.',
  model: (mb) => slab(mb, 0.08, 0.012, 0.08, D_POULTICE, T.cloth, 0xd8ccb0, { rot: 0.4 }),
});

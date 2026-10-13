// Items stream — TOOLS & LIGHTS. Long tools lie along +X with the grip at -X
// and the working end at +X (rotate when holding). Tool tags are what recipes
// and world interactions look for (#hammer, #screwdriver, #knife, …).
// Weapon stats scale: 10 dmg ≈ solid bat hit on a 30 HP dog-sized creature.
import { defItem } from '../../items/item';
import { tex, decal, labelTex, T, K, rp, dk, lt, txt, txtC, stamp, stampC, dashes, band, panels, bottle, pack, slab, rodX, rodZ, prism, ph, bayer, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- textures
export const S_HGRIP = tex('i_hgrip', 8, 4, (pc) => {
  pc.fill(0xd8d8d4);
  for (let x = 0; x < 8; x += 2) pc.vline(x, 0, 3, 0xa8a8a4);
  pc.hline(0, 7, 0, 0xeeeeea);
}, true);
const D_MATCHBOX = decal('i_matchbox', 12, 8, (pc) => {
  pc.fill(0xf0c419); pc.rect(0, 0, 12, 2, 0xc8302a); pc.rect(0, 6, 12, 2, 0xc8302a);
  stamp(pc, 4, 2, ['.rr.', 'rRRr', '.ww.', '.ww.'], { r: 0xc8302a, R: 0xf26a3a, w: 0xf2e8d0 });
  dashes(pc, 8, 3, 3, 0x7a3a1a, 2); dashes(pc, 1, 4, 2, 0x7a3a1a, 3);
});
const S_STRIKER = tex('i_striker', 8, 4, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 5) < 0.4 ? 0x4a2a1a : 0x6a3a22)), true);
const L_FX = labelTex('i_extinguisher_label', 24, 12, { bg: 0xc8202a, plate: 0xf4f2ec, iconY: 4, icon: ['..f..', '.fff.', '.fFf.', 'fffff'], pal: { f: 0xe86a1a, F: 0xf6d040 }, panelsN: 1 });
const L_SPRAY = tex('i_spray_label', 24, 14, (pc) => {
  pc.fill(0xf26a1a);
  band(pc, 0, 2, 0x1c1c1c); band(pc, 12, 2, 0x1c1c1c);
  panels(pc, 2, (x0, pw) => { const cx = Math.round(x0 + pw / 2); pc.rect(cx - 3, 5, 6, 4, 0xfad04a); pc.rect(cx - 2, 6, 4, 2, 0xf26a1a); });
}, true);
const D_METER = decal('i_multimeter_face', 10, 16, (pc) => {
  pc.fill(0xf0c419); pc.strokeRect(0, 0, 10, 16, 0xb8901a);
  pc.rect(1, 1, 8, 5, 0x2a3a2c); pc.rect(2, 2, 6, 3, 0x8aa88a); txt(pc, '12', 2, 2, 0x1a2a1a);
  pc.circle(5, 10, 2.6, 0x2a2a2a); pc.set(5, 8, 0xf2f2f2); pc.set(5, 9, 0xf2f2f2);
  pc.set(2, 14, 0xc8302a); pc.set(7, 14, 0x1a1a1a); pc.set(5, 14, 0x1a1a1a);
});
const D_TIN_LID = tex('i_sewing_lid', 14, 14, (pc) => {
  pc.fill(0x2a4a8a);
  pc.each((x, y) => { const d = Math.hypot(x - 6.5, y - 6.5); if (d > 5.6) pc.set(x, y, 0x1a3060); if (d < 3.8 && d > 3) pc.set(x, y, 0xe8e0c8); });
  stamp(pc, 4, 4, ['.ww.', 'w..w', 'w..w', '.ww.'], { w: 0xf6f0e0 });
  pc.set(6, 6, 0xd8b04a); pc.set(7, 7, 0xd8b04a);
});
const S_TIN_BLUE = tex('i_tin_blue', 16, 6, (pc) => { pc.fill(0x2a4a8a); pc.hline(0, 15, 0, 0x4a6aaa); pc.hline(0, 15, 5, 0x1a3060); for (let x = 1; x < 16; x += 4) pc.set(x, 3, 0xe8e0c8); }, true);
const S_TOOLBOX = tex('i_toolbox_side', 16, 8, (pc) => {
  const R = rp(0xc8302a, 5, 0.4);
  pc.fill(R[2]); pc.hline(0, 15, 0, R[4]); pc.hline(0, 15, 7, R[0]); pc.hline(0, 15, 3, R[1]); pc.hline(0, 15, 4, R[3]);
  for (const x of [1, 14]) { pc.set(x, 1, 0xd8d8d8); pc.set(x, 6, 0xd8d8d8); }
}, true);
const S_TAPEM = tex('i_tapemeasure', 12, 12, (pc) => {
  pc.fill(0xf0c419); pc.each((x, y) => { const d = Math.hypot(x - 5.5, y - 5.5); if (d > 5.3) pc.set(x, y, 0x1c1c1c); if (d < 3) pc.set(x, y, 0x2a2a2a); });
  pc.rect(4, 4, 4, 2, 0xf0c419); pc.set(5, 5, 0x1c1c1c);
});
const D_STICKY = tex('i_sticky_top', 8, 8, (pc) => { pc.fill(0xf6e86a); dashes(pc, 1, 2, 6, 0x5a6aa8, 2); dashes(pc, 1, 4, 5, 0x5a6aa8, 3); pc.hline(0, 7, 0, 0xe8d850); });
const D_COMPASS = tex('i_compass_face', 12, 12, (pc) => {
  pc.fill(0x1c1c1c);
  pc.each((x, y) => { const d = Math.hypot(x - 5.5, y - 5.5); if (d < 4.8) pc.set(x, y, 0xf2ecd8); });
  pc.set(5, 1, 0xc8302a); pc.set(6, 1, 0xc8302a);
  pc.line(6, 6, 8, 2, 0xc8302a); pc.line(5, 5, 3, 9, 0x6a6a72); pc.set(5, 5, 0xd8b04a); pc.set(6, 6, 0xd8b04a);
});
const S_STONE_GRIT = tex('i_whetstone', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 9) < 0.3 ? 0x6a6a70 : ph(x, y, 10) < 0.5 ? 0x7e7e84 : 0x74747a)), true);
const D_CHALKBOX = decal('i_chalk_box', 14, 8, (pc) => {
  pc.fill(0x8ad0f0); band(pc, 0, 1, 0x5aa0c8);
  for (let i = 0; i < 4; i++) pc.rect(2 + i * 3, 3, 2, 4, [0xf6a0c4, 0xf6e07a, 0x9ae08a, 0xf2f2ee][i]);
});
export const D_FLAME = tex('i_flame', 4, 6, (pc) => {
  pc.fill(0xff9a2a); pc.rect(1, 1, 2, 4, 0xffd060); pc.set(1, 3, 0xfff4c0); pc.set(2, 2, 0xfff4c0); pc.hline(0, 3, 5, 0xe86a1a);
});
const D_LENS = tex('i_lens', 6, 6, (pc) => { pc.fill(0xfff4d0); pc.set(1, 1, 0xffffff); pc.set(2, 1, 0xffffff); pc.strokeRect(0, 0, 6, 6, 0xd8c890); });
const L_GLOWSTICK = tex('i_glowstick', 4, 8, (pc) => { pc.fill(0x7cff8a); pc.vline(1, 0, 7, 0xd0ffd0); pc.vline(3, 0, 7, 0x4ad86a); }, true);

// ---------------------------------------------------------------- hand tools
defItem({
  key: 'hammer', name: 'Hammer', cat: 'tool', weight: 0.7, durability: 300, tags: ['hammer'],
  weapon: { kind: 'blunt', dmg: [5, 8], range: 1.0, speed: 1.4, endurance: 0.035, crit: 0.15, knock: 0.3, durability: 200, noise: 6 },
  desc: 'Claw hammer. Builds things, pulls nails, cracks skulls.',
  model: (mb) => {
    rodX(mb, -0.17, 0.05, 0.015, 0.014, 0.013, 6, S_HGRIP, { color: 0x2a2a2a, uvScale: 3 });
    rodX(mb, 0.05, 0.12, 0.015, 0.012, 0.012, 6, T.metal, { color: 0x8a8e94 });
    mb.box(0.12, 0.0, 0.0, 0.032, 0.03, 0.1, T.metal, { color: 0x9aa0a6 });
    mb.box(0.12, 0.004, 0.06, 0.03, 0.022, 0.03, T.metal, { color: 0xb0b6bc });
    mb.push().translate(0.12, 0.0, -0.05).rotateX(-0.35); mb.box(0, 0, -0.025, 0.026, 0.02, 0.05, T.metal, { color: 0x8a8e94 }); mb.pop();
  },
});
defItem({
  key: 'screwdriver', name: 'Screwdriver', cat: 'tool', weight: 0.15, durability: 200, tags: ['screwdriver'],
  weapon: { kind: 'blade', dmg: [3, 5], range: 0.85, speed: 1.8, endurance: 0.02, crit: 0.15, knock: 0.05, durability: 40, noise: 4 },
  model: (mb) => {
    rodX(mb, -0.1, -0.02, 0.014, 0.014, 0.012, 6, S_HGRIP, { color: 0xe8b81a, uvScale: 3 });
    rodX(mb, -0.02, 0.09, 0.014, 0.0035, 0.0035, 4, T.steel);
    mb.box(0.093, 0.011, 0, 0.008, 0.006, 0.002, T.steel);
  },
});
defItem({
  key: 'saw', name: 'Hand Saw', cat: 'tool', weight: 0.8, durability: 250, tags: ['saw'],
  desc: 'Cuts planks and dismantles wooden furniture.',
  model: (mb) => {
    prism(mb, [[-0.12, 0.05], [0.33, 0.035], [0.33, 0.005], [-0.12, -0.06]], 0, 0.003, T.steel, T.steel, { color: 0xd8dce0 });
    for (let i = 0; i < 18; i++) mb.box(-0.1 + i * 0.024, 0, 0.054 - i * 0.001, 0.01, 0.003, 0.006, T.steel, { color: 0xa8acb0 });
    mb.box(-0.18, 0, -0.005, 0.12, 0.022, 0.11, 'i_wood', { color: 0xc8402a });
    mb.box(-0.185, 0.0, -0.01, 0.06, 0.024, 0.05, T.black);
  },
});
defItem({
  key: 'wrench', name: 'Wrench', cat: 'tool', weight: 0.8, durability: 400, tags: ['wrench'],
  weapon: { kind: 'blunt', dmg: [5, 8], range: 1.05, speed: 1.3, endurance: 0.04, crit: 0.1, knock: 0.4, durability: 300, noise: 6 },
  model: (mb) => {
    mb.box(0, 0, 0, 0.22, 0.01, 0.024, T.steel, { color: 0xb8bec4 });
    mb.box(0.125, 0, 0, 0.035, 0.012, 0.05, T.steel, { color: 0xa8aeb4 });
    mb.box(0.138, 0.0, 0, 0.012, 0.013, 0.02, T.black);
    mb.cylinder(-0.12, 0, 0, 0.024, 0.012, 8, { sides: T.steel, top: T.tinTop }, { color: 0xa8aeb4, fit: true });
  },
});
defItem({
  key: 'crowbar', name: 'Crowbar', cat: 'tool', weight: 2.2, durability: 600, tags: ['crowbar'],
  weapon: { kind: 'blunt', dmg: [7, 11], range: 1.25, speed: 1.1, endurance: 0.045, crit: 0.15, knock: 0.6, durability: 400, noise: 7 },
  desc: 'Pries open doors, crates and barricades. Practically indestructible.',
  model: (mb) => {
    rodX(mb, -0.28, 0.24, 0.012, 0.011, 0.011, 6, T.metal, { color: 0x3a3a40 });
    mb.push().translate(0.24, 0.012, 0).rotateY(-0.9); rodX(mb, 0, 0.07, 0, 0.011, 0.009, 6, T.metal, { color: 0x3a3a40 }); mb.pop();
    mb.push().translate(0.285, 0.012, -0.05).rotateY(-2.4); rodX(mb, 0, 0.04, 0, 0.009, 0.006, 6, T.metal, { color: 0x3a3a40 }); mb.pop();
    mb.box(-0.3, 0.004, 0, 0.05, 0.01, 0.026, T.metal, { color: 0x3a3a40 });
    rodX(mb, -0.12, 0.05, 0.012, 0.0125, 0.0125, 6, T.white, { color: 0xc8302a });
  },
});
defItem({
  key: 'shovel', name: 'Shovel', cat: 'tool', weight: 2.0, durability: 300, tags: ['shovel', 'dig'],
  weapon: { kind: 'blunt', dmg: [7, 11], range: 1.6, speed: 1.0, endurance: 0.06, crit: 0.1, knock: 0.7, durability: 120, twoHanded: true, noise: 7 },
  desc: 'Digs furrows, graves and the occasional way out.',
  model: (mb) => {
    rodX(mb, -0.5, 0.25, 0.018, 0.016, 0.016, 6, T.wood, { uvScale: 2 });
    mb.box(-0.53, 0.004, 0, 0.03, 0.03, 0.12, T.black);
    mb.box(-0.545, 0.004, 0, 0.012, 0.03, 0.12, T.black);
    rodX(mb, 0.25, 0.32, 0.018, 0.02, 0.026, 6, T.metal, { color: 0x4a4a52 });
    prism(mb, [[0.3, 0.12], [0.5, 0.11], [0.56, 0.0], [0.5, -0.11], [0.3, -0.12]], 0.004, 0.012, T.metal, T.metal, { color: 0x5a5a62 });
  },
});
defItem({
  key: 'trowel', name: 'Trowel', cat: 'tool', weight: 0.3, durability: 150, tags: ['trowel', 'dig'],
  weapon: { kind: 'blade', dmg: [2, 4], range: 0.85, speed: 1.6, endurance: 0.025, crit: 0.1, knock: 0.1, durability: 30, noise: 4 },
  model: (mb) => {
    rodX(mb, -0.14, -0.04, 0.013, 0.013, 0.014, 6, S_HGRIP, { color: 0x3a8a4a, uvScale: 3 });
    rodX(mb, -0.04, -0.01, 0.012, 0.004, 0.004, 4, T.steel);
    prism(mb, [[-0.01, 0.035], [0.12, 0.0], [-0.01, -0.035]], 0.002, 0.006, T.steel, T.steel, { color: 0xc8ccd0 });
  },
});
defItem({
  key: 'knife_kitchen', name: 'Kitchen Knife', cat: 'weapon', weight: 0.2, durability: 120, tags: ['knife', 'sharp'],
  weapon: { kind: 'blade', dmg: [4, 7], range: 0.9, speed: 1.8, endurance: 0.02, crit: 0.2, knock: 0.05, durability: 40, noise: 4 },
  desc: 'Chef\'s knife. Cuts food, cloth, rope — and whatever else it has to.',
  model: (mb) => {
    mb.box(-0.08, 0, 0, 0.11, 0.016, 0.022, T.black);
    for (const x of [-0.11, -0.07]) mb.box(x, 0.016, 0, 0.006, 0.001, 0.006, T.steel);
    prism(mb, [[-0.025, 0.012], [0.14, 0.006], [0.18, -0.012], [-0.025, -0.022]], 0.004, 0.004, T.steel, T.steel, { color: 0xe2e6ea });
  },
});
defItem({
  key: 'scissors', name: 'Scissors', cat: 'tool', weight: 0.1, durability: 150, tags: ['scissors', 'sharp'],
  weapon: { kind: 'blade', dmg: [2, 4], range: 0.85, speed: 1.7, endurance: 0.02, crit: 0.12, knock: 0.05, durability: 30, noise: 4 },
  model: (mb) => {
    for (const s of [-1, 1]) {
      mb.push().rotateY(s * 0.18);
      prism(mb, [[0.0, 0.006], [0.1, 0.0], [0.0, -0.006]], 0.002 + (s > 0 ? 0.003 : 0), 0.003, T.steel, T.steel, { color: 0xd8dce0 });
      mb.cylinder(-0.035, 0.002 + (s > 0 ? 0.003 : 0), s * 0.018, 0.02, 0.006, 8, T.white, { color: 0xe8862a });
      mb.cylinder(-0.035, 0.0021 + (s > 0 ? 0.003 : 0), s * 0.018, 0.012, 0.0065, 8, T.white, { color: 0x3a3a3a });
      mb.pop();
    }
    mb.cylinder(0, 0.008, 0, 0.004, 0.003, 6, T.steel);
  },
});
defItem({
  key: 'can_opener', name: 'Can Opener', cat: 'tool', weight: 0.15, durability: 120, tags: ['canopener'],
  model: (mb) => {
    for (const s of [-1, 1]) { mb.push().rotateY(s * 0.08); mb.box(-0.04, 0, s * 0.008, 0.12, 0.01, 0.014, S_HGRIP, { color: 0x2a2a2a }); mb.pop(); }
    mb.box(0.035, 0, 0, 0.04, 0.016, 0.04, T.steel, { color: 0xb8bcc0 });
    mb.cylinder(0.035, 0.016, 0, 0.012, 0.012, 6, T.steel);
    mb.box(0.055, 0.02, 0, 0.03, 0.008, 0.012, T.steel, { color: 0x9aa0a6 });
  },
});
defItem({
  key: 'pliers', name: 'Pliers', cat: 'tool', weight: 0.25, durability: 300, tags: ['pliers'],
  weapon: { kind: 'blunt', dmg: [2, 4], range: 0.9, speed: 1.5, endurance: 0.025, crit: 0.05, knock: 0.1, durability: 80, noise: 4 },
  model: (mb) => {
    for (const s of [-1, 1]) {
      mb.push().rotateY(s * 0.12); mb.box(-0.06, 0, s * 0.014, 0.1, 0.012, 0.016, S_HGRIP, { color: 0xc8302a }); mb.pop();
    }
    mb.box(0.03, 0, 0, 0.05, 0.012, 0.026, T.steel, { color: 0x9aa0a6 });
    prism(mb, [[0.055, 0.012], [0.1, 0.002], [0.1, -0.002], [0.055, -0.012]], 0, 0.012, T.steel, T.steel, { color: 0x9aa0a6 });
  },
});
defItem({
  key: 'multitool', name: 'Multitool', cat: 'tool', weight: 0.25, durability: 150, tags: ['screwdriver', 'canopener', 'knife', 'pliers', 'sharp'],
  weapon: { kind: 'blade', dmg: [3, 5], range: 0.85, speed: 1.7, endurance: 0.02, crit: 0.15, knock: 0.05, durability: 30, noise: 4 },
  desc: 'Pliers, blade, screwdriver and can opener in one. Worse at each than the real thing.',
  model: (mb) => {
    mb.box(-0.02, 0, 0, 0.1, 0.018, 0.03, T.steel, { color: 0x9aa0a8 });
    for (const z of [-0.008, 0.008]) mb.box(-0.02, 0.018, z, 0.09, 0.002, 0.006, T.black);
    mb.push().translate(0.03, 0.006, 0).rotateY(0.35); prism(mb, [[0, 0.006], [0.07, 0.0], [0, -0.006]], 0, 0.003, T.steel, T.steel, { color: 0xe2e6ea }); mb.pop();
    mb.push().translate(0.03, 0.01, 0).rotateY(-0.5); mb.box(0.03, 0, 0, 0.06, 0.003, 0.004, T.steel); mb.pop();
  },
});
defItem({
  key: 'pocket_knife', name: 'Pocket Knife', cat: 'weapon', weight: 0.1, durability: 100, tags: ['knife', 'sharp'],
  weapon: { kind: 'blade', dmg: [3, 6], range: 0.85, speed: 1.8, endurance: 0.02, crit: 0.2, knock: 0.05, durability: 35, noise: 4 },
  model: (mb) => {
    mb.box(-0.035, 0, 0, 0.09, 0.014, 0.022, T.white, { color: 0xc8302a });
    mb.box(-0.06, 0.0141, 0, 0.012, 0.001, 0.012, T.white, { color: 0xf2f2ee });
    prism(mb, [[0.01, 0.009], [0.08, 0.004], [0.095, -0.006], [0.01, -0.009]], 0.005, 0.003, T.steel, T.steel, { color: 0xe2e6ea });
  },
});
defItem({
  key: 'box_cutter', name: 'Box Cutter', cat: 'tool', weight: 0.08, durability: 60, tags: ['sharp', 'boxcutter'],
  weapon: { kind: 'blade', dmg: [2, 5], range: 0.85, speed: 1.9, endurance: 0.02, crit: 0.2, knock: 0.0, durability: 20, noise: 4 },
  model: (mb) => {
    mb.box(-0.01, 0, 0, 0.13, 0.016, 0.022, T.white, { color: 0xf0c419 });
    mb.box(-0.01, 0.016, 0, 0.1, 0.002, 0.012, T.black);
    prism(mb, [[0.055, 0.006], [0.075, 0.006], [0.085, -0.006], [0.055, -0.006]], 0.006, 0.002, T.steel, T.steel, { color: 0xe8ecf0 });
  },
});
defItem({
  key: 'bolt_cutters', name: 'Bolt Cutters', cat: 'tool', weight: 2.5, durability: 200, tags: ['boltcutter'],
  weapon: { kind: 'blunt', dmg: [6, 9], range: 1.2, speed: 0.9, endurance: 0.07, crit: 0.1, knock: 0.5, durability: 200, twoHanded: true, noise: 7 },
  desc: 'Snips padlocks, chains and fences.',
  model: (mb) => {
    for (const s of [-1, 1]) {
      mb.push().rotateY(s * 0.06);
      rodX(mb, -0.38, -0.05, 0.012, 0.012, 0.011, 6, T.metal, { color: 0x3a3a40, cz: s * 0.02 });
      rodX(mb, -0.38, -0.24, 0.012, 0.016, 0.016, 6, S_HGRIP, { color: 0xc8302a, cz: s * 0.02, uvScale: 3 });
      mb.pop();
    }
    mb.box(0.0, 0.002, 0, 0.1, 0.02, 0.05, T.metal, { color: 0x4a4a52 });
    prism(mb, [[0.05, 0.022], [0.12, 0.004], [0.12, -0.004], [0.05, -0.022]], 0.002, 0.02, T.metal, T.metal, { color: 0x5a5a62 });
  },
});
defItem({
  key: 'whetstone', name: 'Whetstone', cat: 'tool', weight: 0.4, durability: 100, tags: ['whetstone'],
  desc: 'Restores a blade\'s edge. Each sharpening wears it a little.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.15, 0.012, 0.05, S_STONE_GRIT, { color: 0x8a8a90, uvScale: 3 });
    mb.box(0, 0.012, 0, 0.15, 0.012, 0.05, S_STONE_GRIT, { color: 0xc8a070, uvScale: 3 });
  },
});
defItem({
  key: 'axe', name: 'Axe', cat: 'tool', weight: 2.2, durability: 300, tags: ['axe'],
  weapon: { kind: 'axe', dmg: [12, 20], range: 1.4, speed: 0.9, endurance: 0.08, crit: 0.2, knock: 0.7, durability: 120, twoHanded: true, noise: 7 },
  desc: 'Chops firewood and furniture. Brutal in a fight, exhausting to swing.',
  model: (mb) => {
    rodX(mb, -0.4, 0.3, 0.018, 0.016, 0.019, 6, T.wood, { uvScale: 2 });
    mb.box(0.27, 0.0, -0.005, 0.06, 0.034, 0.07, T.metal, { color: 0x6a6e74 });
    prism(mb, [[0.24, 0.035], [0.3, 0.035], [0.32, 0.12], [0.22, 0.12]], 0.004, 0.026, T.metal, T.metal, { color: 0x7a7e84 });
    mb.box(0.27, 0.0306, 0.115, 0.1, 0.002, 0.012, T.steel, { color: 0xe8ecf0 });
  },
});
defItem({
  key: 'sledgehammer', name: 'Sledgehammer', cat: 'tool', weight: 6.0, durability: 600, tags: ['sledge'],
  weapon: { kind: 'blunt', dmg: [18, 30], range: 1.5, speed: 0.8, endurance: 0.1, crit: 0.15, knock: 1.0, durability: 300, twoHanded: true, noise: 8 },
  desc: 'Demolishes walls and furniture outright. Needs a lot of stamina.',
  model: (mb) => {
    rodX(mb, -0.45, 0.4, 0.04, 0.017, 0.019, 6, T.wood, { uvScale: 2, color: 0xe8c890 });
    rodX(mb, -0.45, -0.3, 0.04, 0.02, 0.02, 6, S_HGRIP, { color: 0x2a2a2a, uvScale: 3 });
    mb.box(0.42, 0.0, 0, 0.08, 0.08, 0.2, T.metal, { color: 0x4a4a52 });
    for (const s of [-1, 1]) mb.box(0.42, 0.0, s * 0.1, 0.085, 0.085, 0.012, T.metal, { color: 0x3a3a40 });
  },
});
defItem({
  key: 'tape_measure', name: 'Tape Measure', cat: 'tool', weight: 0.2, tags: ['tapemeasure'],
  desc: 'Five metres of tape. The corridor you just walked was longer than the building.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.065, 0.065, 0.035, { all: T.plastic, east: S_TAPEM, west: S_TAPEM, south: S_TAPEM }, { color: 0xffffff, fit: true });
    mb.box(0.04, 0.002, 0, 0.03, 0.006, 0.02, T.metal, { color: 0xf0d860 });
    mb.box(0.056, 0.002, 0, 0.004, 0.012, 0.02, T.metal, { color: 0x3a3a40 });
  },
});

// ---------------------------------------------------------------- fire & light
defItem({
  key: 'lighter', name: 'Lighter', cat: 'tool', weight: 0.03, uses: 100, tags: ['lighter', 'firestarter'],
  desc: 'Disposable lighter. A hundred flicks, give or take.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.025, 0.06, 0.012, T.plastic, { color: 0xd8302a });
    mb.box(0, 0.06, 0, 0.025, 0.014, 0.012, T.metal, { color: 0xc8ccd0 });
    mb.box(0.006, 0.066, 0, 0.008, 0.012, 0.008, T.metal, { color: 0x8a8e94 });
    mb.box(-0.004, 0.074, 0, 0.012, 0.004, 0.009, T.black);
  },
});
defItem({
  key: 'matches', name: 'Box of Matches', cat: 'tool', weight: 0.03, uses: 30, tags: ['matches', 'firestarter'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.055, 0.016, 0.036, { all: S_STRIKER, top: D_MATCHBOX }, { fit: { top: true } });
    mb.box(0.012, 0.016, 0.002, 0.04, 0.003, 0.003, 'i_wood');
    mb.box(0.034, 0.016, 0.002, 0.006, 0.005, 0.005, T.white, { color: 0xc8302a });
  },
});
defItem({
  key: 'flashlight', name: 'Flashlight', cat: 'light', weight: 0.5, battery: true, uses: 100, tags: ['flashlight', 'light'],
  light: { range: 14, intensity: 1.2, color: 0xfff0d0, drainPerHour: 0.06, cone: 0.5 },
  weapon: { kind: 'blunt', dmg: [2, 4], range: 0.95, speed: 1.4, endurance: 0.03, crit: 0.05, knock: 0.2, durability: 40, noise: 5 },
  desc: 'Takes batteries; about sixteen hours of beam. Cone of light, not a lantern.',
  model: (mb) => {
    rodX(mb, -0.1, 0.05, 0.019, 0.018, 0.018, 8, S_HGRIP, { color: 0x3a3a40, uvScale: 3 });
    rodX(mb, 0.05, 0.1, 0.026, 0.02, 0.028, 8, T.metal, { color: 0x4a4a52 });
    rodX(mb, 0.1, 0.104, 0.026, 0.024, 0.024, 8, { sides: T.metal, top: D_LENS, bottom: D_LENS }, { fit: true, emissive: 0.9 });
    mb.box(0.0, 0.035, 0, 0.018, 0.006, 0.012, T.rubber, { color: 0x6a6a6a });
  },
});
defItem({
  key: 'lantern', name: 'Camping Lantern', cat: 'light', weight: 1.0, battery: true, uses: 100, tags: ['lantern', 'light', 'camping'],
  light: { range: 7, intensity: 0.9, color: 0xffe2b0, drainPerHour: 0.04 },
  desc: 'Battery lantern. Lights a whole room all around you.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.06, 0.05, 10, T.plastic, { color: 0x3a6a4a, fit: true });
    mb.cylinder(0, 0.05, 0, 0.048, 0.11, 10, 'i_white', { color: 0xfff0c8, emissive: 0.85 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; mb.box(Math.cos(a) * 0.05, 0.05, Math.sin(a) * 0.05, 0.01, 0.11, 0.01, T.plastic, { color: 0x2a5a3a }); }
    mb.cylinder(0, 0.16, 0, 0.055, 0.03, 10, T.plastic, { color: 0x3a6a4a, fit: true, rTop: 0.03 });
    mb.box(0, 0.2, 0, 0.07, 0.01, 0.01, T.metal);
    for (const s of [-1, 1]) mb.box(s * 0.035, 0.185, 0, 0.008, 0.025, 0.008, T.metal);
  },
});
defItem({
  key: 'candle', name: 'Candle', cat: 'light', weight: 0.1, uses: 100, tags: ['candle', 'light'],
  light: { range: 3.5, intensity: 0.55, color: 0xffb860, drainPerHour: 0.125, candle: true },
  desc: 'Eight hours of soft light. Needs a flame to start.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 0.008, 8, T.metal, { color: 0xc8a050, fit: true });
    mb.cylinder(0, 0.008, 0, 0.019, 0.09, 8, 'i_white', { color: 0xf2e8d0, fit: true });
    mb.box(0.012, 0.06, 0.016, 0.006, 0.03, 0.006, 'i_white', { color: 0xf6eedc });
    mb.box(0, 0.098, 0, 0.002, 0.008, 0.002, T.black);
    mb.box(0, 0.105, 0, 0.008, 0.016, 0.008, D_FLAME, { fit: true, emissive: 1.6 });
  },
});
defItem({
  key: 'glowstick', name: 'Glowstick', cat: 'light', weight: 0.03, uses: 100, tags: ['glowstick', 'light'],
  light: { range: 3, intensity: 0.5, color: 0x7cff8a, drainPerHour: 0.083 },
  desc: 'Snap and shake. Twelve hours of eerie green.',
  model: (mb) => {
    rodX(mb, -0.07, 0.07, 0.008, 0.007, 0.007, 6, L_GLOWSTICK, { fit: true, emissive: 1.2 });
    mb.box(-0.074, 0.002, 0, 0.008, 0.012, 0.012, T.plastic, { color: 0xf2f2ee });
  },
});
defItem({
  key: 'torch', name: 'Torch', cat: 'light', weight: 0.5, uses: 100, tags: ['torch', 'light', 'firestarter'],
  light: { range: 6, intensity: 1.0, color: 0xff9a40, drainPerHour: 0.5, candle: true },
  weapon: { kind: 'blunt', dmg: [3, 5], range: 1.1, speed: 1.3, endurance: 0.03, crit: 0.05, knock: 0.2, durability: 20, noise: 5 },
  desc: 'Rag soaked in fuel, wrapped on a stick. Two hours of fire light. Creatures that hate light hate this.',
  model: (mb) => {
    rodX(mb, -0.22, 0.16, 0.014, 0.012, 0.014, 6, T.wood, { uvScale: 2, color: 0x9a7a52 });
    rodX(mb, 0.1, 0.2, 0.02, 0.022, 0.026, 6, T.cloth, { color: 0x6a5a48 });
    mb.box(0.2, 0.01, 0, 0.04, 0.05, 0.04, D_FLAME, { fit: true, emissive: 1.6 });
  },
});

// ---------------------------------------------------------------- electrical
defItem({
  key: 'multimeter', name: 'Multimeter', cat: 'tool', weight: 0.35, battery: true, uses: 100, tags: ['multimeter', 'electrical'],
  desc: 'Find which fuse is dead and which wire is live.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.08, 0.035, 0.14, { all: T.plastic, top: D_METER }, { color: 0xffffff, fit: { top: true } });
    mb.box(0, 0, 0, 0.084, 0.03, 0.144, T.rubber, { color: 0x2a2a2a, skip: ['top'] });
    for (const [x, c] of [[-0.02, 0xc8302a], [0.02, 0x1c1c1c]] as [number, number][]) {
      mb.box(x + 0.05, 0.005, 0.09, 0.006, 0.006, 0.08, T.plastic, { color: c });
      mb.box(x + 0.05, 0.005, 0.135, 0.008, 0.008, 0.02, T.plastic, { color: c });
    }
  },
});
defItem({
  key: 'soldering_iron', name: 'Soldering Iron', cat: 'tool', weight: 0.3, tags: ['solder', 'electrical'],
  desc: 'Needs a powered outlet. Joins wires and fixes circuit boards.',
  model: (mb) => {
    rodX(mb, -0.12, 0.0, 0.012, 0.012, 0.014, 6, S_HGRIP, { color: 0x3a6ac8, uvScale: 3 });
    rodX(mb, 0.0, 0.07, 0.012, 0.006, 0.004, 6, T.steel);
    rodX(mb, 0.07, 0.09, 0.012, 0.003, 0.001, 4, T.metal, { color: 0x8a8070 });
    mb.box(-0.16, 0.004, 0.02, 0.08, 0.006, 0.006, T.black);
    mb.box(-0.2, 0.004, 0.05, 0.006, 0.006, 0.06, T.black);
  },
});

// ---------------------------------------------------------------- marking & office
defItem({
  key: 'spray_paint', name: 'Spray Paint', cat: 'tool', weight: 0.4, uses: 20, tags: ['spray', 'spraypaint', 'mark_wall'],
  desc: 'Mark walls with arrows and warnings. Twenty marks.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.033, 0.16, 10, { sides: L_SPRAY, top: T.tinTop, bottom: T.tinTop }, { fit: true });
    mb.cylinder(0, 0.16, 0, 0.033, 0.012, 10, T.tin, { fit: true, rTop: 0.02 });
    mb.cylinder(0, 0.172, 0, 0.032, 0.04, 10, T.plastic, { color: 0xf26a1a, fit: true });
  },
});
defItem({
  key: 'chalk', name: 'Chalk', cat: 'tool', weight: 0.08, uses: 30, tags: ['chalk', 'mark_floor'],
  desc: 'Leave arrows on the floor so you can find your way back. Thirty marks.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.08, 0.02, 0.06, T.card, { color: 0x8ad0f0 });
    mb.flat(0, 0.0202, 0, 0.08, 0.06, D_CHALKBOX);
    [0xf6a0c4, 0xf6e07a, 0x9ae08a].forEach((c, i) => rodX(mb, -0.03, 0.05, 0.03, 0.007, 0.007, 6, T.white, { color: c, cz: -0.018 + i * 0.017 }));
  },
});
defItem({
  key: 'marker', name: 'Permanent Marker', cat: 'tool', weight: 0.02, uses: 40, tags: ['pen', 'marker'],
  model: (mb) => {
    rodX(mb, -0.07, 0.04, 0.008, 0.008, 0.008, 6, T.white, { color: 0x2a2a2a });
    rodX(mb, 0.04, 0.075, 0.008, 0.0085, 0.0085, 6, T.white, { color: 0x1c1c1c });
    mb.box(-0.02, 0.006, 0.0, 0.04, 0.004, 0.0165, T.white, { color: 0xf2f2ee });
  },
});
defItem({
  key: 'pen', name: 'Pen', cat: 'tool', weight: 0.01, tags: ['pen'],
  model: (mb) => {
    rodX(mb, -0.07, 0.05, 0.005, 0.005, 0.005, 6, T.white, { color: 0xf2f2ee });
    rodX(mb, 0.05, 0.07, 0.005, 0.005, 0.0015, 6, T.white, { color: 0x2a4a9a });
    rodX(mb, -0.075, -0.07, 0.005, 0.0045, 0.0045, 6, T.white, { color: 0x2a4a9a });
    mb.box(-0.045, 0.006, 0.003, 0.03, 0.003, 0.002, T.white, { color: 0x2a4a9a });
  },
});
defItem({
  key: 'pencil', name: 'Pencil', cat: 'tool', weight: 0.01, tags: ['pen'],
  model: (mb) => {
    rodX(mb, -0.07, 0.05, 0.0045, 0.0045, 0.0045, 6, T.white, { color: 0xf0c419 });
    rodX(mb, 0.05, 0.07, 0.0045, 0.0045, 0.001, 6, T.white, { color: 0xe8c898 });
    rodX(mb, -0.082, -0.07, 0.0045, 0.0045, 0.0045, 6, T.white, { color: 0xe890a0 });
  },
});
defItem({
  key: 'stapler', name: 'Stapler', cat: 'misc', weight: 0.3, tags: ['office'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.16, 0.012, 0.04, T.black);
    mb.push().translate(0.07, 0.012, 0).rotateZ(0.08); mb.box(-0.075, 0, 0, 0.15, 0.025, 0.036, T.plastic, { color: 0x2a2a30 }); mb.pop();
    mb.box(-0.065, 0.02, 0, 0.03, 0.02, 0.03, T.plastic, { color: 0x3a3a42 });
  },
});
defItem({
  key: 'sticky_notes', name: 'Sticky Notes', cat: 'misc', weight: 0.05, uses: 50, tags: ['paper'],
  desc: 'Leave notes for the others. Fifty sheets.',
  model: (mb) => slab(mb, 0.076, 0.016, 0.076, D_STICKY, T.pages, 0xf6e86a, { rot: 0.15 }),
});
defItem({
  key: 'compass', name: 'Compass', cat: 'tool', weight: 0.05, tags: ['compass'],
  desc: 'The needle mostly agrees with itself. Mostly.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.03, 0.012, 10, { sides: T.metal, top: D_COMPASS, bottom: T.metal }, { fit: true, color: 0xd8b04a });
    mb.box(0, 0.002, -0.034, 0.012, 0.008, 0.01, T.metal, { color: 0xd8b04a });
  },
});
defItem({
  key: 'binoculars', name: 'Binoculars', cat: 'tool', weight: 0.6, tags: ['binoculars'],
  desc: 'See further down the corridors. Some corridors look back.',
  model: (mb) => {
    for (const s of [-1, 1]) {
      rodX(mb, -0.06, 0.05, 0.028, 0.024, 0.026, 8, T.rubber, { cz: s * 0.035 });
      rodX(mb, 0.05, 0.07, 0.028, 0.028, 0.028, 8, { sides: T.black, top: T.screen, bottom: T.screen }, { cz: s * 0.035, fit: true });
    }
    mb.box(0, 0.035, 0, 0.05, 0.016, 0.04, T.black);
  },
});
defItem({
  key: 'whistle', name: 'Whistle', cat: 'misc', weight: 0.02, tags: ['whistle', 'distraction'],
  desc: 'Shrill. Everything within thirty tiles hears it — friends and otherwise.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.05, 0.016, 0.02, T.metal, { color: 0xc8ccd0 });
    mb.cylinder(-0.012, 0, 0, 0.014, 0.016, 8, T.metal, { color: 0xc8ccd0 });
    mb.box(-0.034, 0.008, 0, 0.012, 0.006, 0.004, T.white, { color: 0xc8302a });
  },
});

// ---------------------------------------------------------------- kits & boxes (containers)
defItem({
  key: 'sewing_kit', name: 'Sewing Kit', cat: 'tool', weight: 0.2, tags: ['sewing', 'kit'],
  bag: { capacity: 1, reduction: 0, slot: 'hand' },
  desc: 'An old cookie tin that holds needles, thread and buttons. (It was never cookies.)',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.07, 0.035, 12, { sides: S_TIN_BLUE, top: D_TIN_LID, bottom: T.tin }, { fit: true });
    mb.cylinder(0, 0.035, 0, 0.072, 0.012, 12, { sides: S_TIN_BLUE, top: D_TIN_LID, bottom: T.tin }, { fit: true });
  },
});
defItem({
  key: 'toolbox_item', name: 'Toolbox', cat: 'tool', weight: 2.5, tags: ['toolbox', 'kit'],
  bag: { capacity: 8, reduction: 0, slot: 'hand' },
  desc: 'Steel toolbox. Heavy, but keeps the tools together.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.4, 0.16, 0.2, S_TOOLBOX, { uvScale: 3 });
    mb.box(0, 0.16, 0, 0.405, 0.035, 0.205, S_TOOLBOX, { uvScale: 3, color: 0xe8e8e8 });
    for (const s of [-1, 1]) mb.box(s * 0.08, 0.195, 0, 0.012, 0.03, 0.02, T.metal);
    mb.box(0, 0.22, 0, 0.18, 0.014, 0.024, T.black);
    for (const s of [-1, 1]) mb.box(s * 0.12, 0.13, 0.103, 0.03, 0.03, 0.006, T.metal, { color: 0xd8dce0 });
  },
});

// ---------------------------------------------------------------- safety
defItem({
  key: 'fire_extinguisher', name: 'Fire Extinguisher', cat: 'tool', weight: 4.5, uses: 20, tags: ['extinguisher'],
  weapon: { kind: 'blunt', dmg: [6, 10], range: 1.0, speed: 0.9, endurance: 0.07, crit: 0.1, knock: 0.7, durability: 60, twoHanded: true, noise: 8 },
  desc: 'Twenty bursts. Puts out fires; a cloud of powder also blinds whatever is chasing you.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.06, 0.36, 10, { sides: L_FX, top: T.white, bottom: T.black }, { fit: true });
    mb.cylinder(0, 0.36, 0, 0.06, 0.04, 10, T.white, { color: 0xc8202a, fit: true, rTop: 0.025 });
    mb.cylinder(0, 0.4, 0, 0.018, 0.03, 6, T.metal);
    mb.box(0.02, 0.43, 0, 0.08, 0.008, 0.02, T.black);
    mb.box(-0.03, 0.42, 0, 0.05, 0.014, 0.02, T.black);
    mb.push().translate(-0.035, 0.41, 0.02).rotateZ(0.3); mb.box(0, -0.15, 0, 0.012, 0.16, 0.012, T.rubber); mb.pop();
  },
});

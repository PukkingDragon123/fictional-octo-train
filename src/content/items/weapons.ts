// Items stream — WEAPONS & AMMO. Scale: dmg 10 ≈ a solid baseball-bat hit on a
// 30 HP dog-sized creature; speed = attacks/s; range in metres; durability =
// hits before breaking; noise in tiles. Ranged weapons use kind 'firearm'
// (any projectile launcher: pistol, nail gun, flare gun, slingshot) with
// `ammo` = item key consumed; 'thrown' weapons are consumed/dropped on throw.
// Long weapons lie along +X: grip at -X, business end at +X.
import { defItem } from '../../items/item';
import { tex, decal, labelTex, T, K, rp, dk, lt, txt, txtC, stamp, dashes, band, panels, bottle, pack, slab, rodX, rodZ, prism, ph, MB } from './_kit';
import { S_HGRIP, D_FLAME } from './tools';

// ---------------------------------------------------------------- textures
const S_GRIPTAPE = tex('i_griptape', 8, 4, (pc) => { pc.fill(0x2a2a2e); for (let x = 0; x < 8; x++) pc.set(x, (x >> 1) % 4, 0x3e3e44); }, true);
const D_AMMO = decal('i_ammo_box', 12, 8, (pc) => {
  pc.fill(0x3a4a2a); band(pc, 0, 1, 0x2a3a1a);
  pc.rect(1, 2, 10, 3, 0xd8c890); txt(pc, '9MM', 1, 2, 0x1c1c1c);
  for (let x = 1; x < 11; x += 2) { pc.set(x, 6, 0xd8b04a); pc.set(x, 7, 0xa8803a); }
});
const L_MOLOTOV = tex('i_molotov_rag', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ((x + y) % 3 === 0) ? 0x8a6a4a : (ph(x, y, 4) < 0.3 ? 0xb8a080 : 0xa89070))), true);
const S_BRICK = tex('i_brick', 8, 4, (pc) => {
  pc.each((x, y) => pc.set(x, y, ph(x, y, 7) < 0.15 ? 0x8a3a2a : ph(x, y, 8) < 0.1 ? 0xc87a5a : 0xa84a34));
  pc.set(2, 1, 0x6a2a1e); pc.set(5, 2, 0x6a2a1e);
}, true);
const D_CLOCKFACE = tex('i_clock_face', 10, 10, (pc) => {
  pc.fill(0xf2eee2); pc.each((x, y) => { if (Math.hypot(x - 4.5, y - 4.5) > 4.6) pc.set(x, y, 0xc8302a); });
  for (const [x, y] of [[4, 1], [8, 4], [4, 8], [1, 4]]) pc.set(x, y, 0x2a2a2a);
  pc.line(4, 4, 4, 2, 0x1c1c1c); pc.line(4, 4, 6, 5, 0x1c1c1c);
});
const L_FLARE = tex('i_flare_label', 16, 6, (pc) => { pc.fill(0xd8202a); panels(pc, 2, (x0, pw) => { dashes(pc, x0 + 1, 2, pw - 2, 0xf6f0e0, 3); }); band(pc, 5, 1, 0xa8181e); }, true);
const D_GLASS_CRACK = tex('i_glass_cracked', 8, 16, (pc) => {
  pc.fill(0xc8d8c8); for (let y = 1; y < 15; y++) pc.set(1, y, 0xf2fff2);
  pc.line(3, 4, 6, 7, 0xf2fff2); pc.line(6, 7, 4, 11, 0xf2fff2); pc.line(6, 7, 7, 9, 0xf2fff2);
});

// ---------------------------------------------------------------- melee: blunt
const bat = (mb: MB, nails: boolean) => {
  rodX(mb, -0.42, -0.1, 0.034, 0.014, 0.018, 8, 'wood_light', { color: 0xf0dcb0 });
  rodX(mb, -0.1, 0.4, 0.034, 0.018, 0.034, 8, 'wood_light', { color: 0xf0dcb0 });
  rodX(mb, 0.4, 0.42, 0.034, 0.034, 0.03, 8, 'wood_light', { color: 0xe8d0a0 });
  rodX(mb, -0.44, -0.42, 0.034, 0.022, 0.022, 8, 'wood_light', { color: 0xe0c898 });
  rodX(mb, -0.4, -0.22, 0.034, 0.0155, 0.0175, 8, S_GRIPTAPE, { uvScale: 3 });
  if (nails) {
    for (let i = 0; i < 9; i++) {
      const x = 0.12 + (i % 5) * 0.06, a = i * 2.2;
      mb.push().translate(x, 0.034, 0).rotateX(a); mb.box(0, 0.028, 0, 0.004, 0.022, 0.004, 'metal_grey', { color: 0xc8ccd0 }); mb.pop();
    }
  }
};
defItem({
  key: 'bat_baseball', name: 'Baseball Bat', cat: 'weapon', weight: 1.0, tags: ['bat'],
  weapon: { kind: 'blunt', dmg: [8, 12], range: 1.5, speed: 1.1, endurance: 0.05, crit: 0.1, knock: 0.6, durability: 60, twoHanded: true, noise: 6 },
  desc: 'Ash bat. The honest weapon.',
  model: (mb) => bat(mb, false),
});
defItem({
  key: 'bat_nailed', name: 'Nailed Bat', cat: 'weapon', weight: 1.2, tags: ['bat'],
  weapon: { kind: 'blunt', dmg: [10, 15], range: 1.5, speed: 1.05, endurance: 0.055, crit: 0.15, knock: 0.6, durability: 45, twoHanded: true, noise: 6 },
  desc: 'A bat with a crown of nails. Wears out faster, hurts a lot more.',
  model: (mb) => bat(mb, true),
});
defItem({
  key: 'golf_club', name: 'Golf Club', cat: 'weapon', weight: 0.4, tags: ['club'],
  weapon: { kind: 'blunt', dmg: [6, 10], range: 1.45, speed: 1.3, endurance: 0.04, crit: 0.12, knock: 0.4, durability: 40, noise: 6 },
  model: (mb) => {
    rodX(mb, -0.5, -0.25, 0.02, 0.014, 0.012, 6, 'rubber_black');
    rodX(mb, -0.25, 0.42, 0.02, 0.008, 0.005, 6, 'chrome');
    mb.box(0.45, 0.0, 0.015, 0.08, 0.035, 0.045, 'chrome', { color: 0xc8ccd0 });
    mb.box(0.45, 0.0, 0.039, 0.07, 0.03, 0.002, 'metal_dark');
  },
});
defItem({
  key: 'pipe_lead', name: 'Lead Pipe', cat: 'weapon', weight: 1.6, tags: ['pipe'], spawnCond: 0.2,
  weapon: { kind: 'blunt', dmg: [7, 11], range: 1.25, speed: 1.15, endurance: 0.05, crit: 0.12, knock: 0.5, durability: 250, noise: 7 },
  model: (mb) => {
    rodX(mb, -0.3, 0.3, 0.02, 0.019, 0.019, 8, 'metal_rusty', { color: 0x9a9a9a });
    rodX(mb, 0.28, 0.33, 0.02, 0.024, 0.024, 8, 'metal_dark');
    rodX(mb, -0.3, -0.12, 0.02, 0.021, 0.021, 8, S_GRIPTAPE, { uvScale: 3, color: 0x8a8a8a });
  },
});
defItem({
  key: 'pool_cue', name: 'Pool Cue', cat: 'weapon', weight: 0.55, tags: ['cue'],
  weapon: { kind: 'blunt', dmg: [4, 7], range: 1.8, speed: 1.4, endurance: 0.035, crit: 0.08, knock: 0.4, durability: 25, twoHanded: true, noise: 5 },
  model: (mb) => {
    rodX(mb, -0.72, -0.2, 0.016, 0.016, 0.012, 6, 'wood_dark');
    rodX(mb, -0.2, 0.7, 0.016, 0.012, 0.0065, 6, 'wood_light', { color: 0xf0dcb0 });
    rodX(mb, 0.7, 0.73, 0.016, 0.0065, 0.006, 6, 'plastic_blue');
    rodX(mb, -0.74, -0.72, 0.016, 0.016, 0.016, 6, 'rubber_black');
  },
});
defItem({
  key: 'baton', name: 'Security Baton', cat: 'weapon', weight: 0.6, tags: ['baton'],
  weapon: { kind: 'blunt', dmg: [5, 8], range: 1.15, speed: 1.4, endurance: 0.035, crit: 0.12, knock: 0.5, durability: 150, noise: 5 },
  model: (mb) => {
    rodX(mb, -0.3, 0.3, 0.016, 0.015, 0.017, 8, 'plastic_black');
    rodX(mb, -0.3, -0.12, 0.016, 0.017, 0.017, 8, S_GRIPTAPE, { uvScale: 3 });
    mb.push().translate(-0.14, 0.016, 0); rodZ(mb, 0, 0.12, 0, 0.012, 0.012, 6, 'plastic_black'); mb.pop();
  },
});
defItem({
  key: 'tire_iron', name: 'Tire Iron', cat: 'weapon', weight: 1.3, tags: ['crowbar', 'tireiron'],
  weapon: { kind: 'blunt', dmg: [6, 9], range: 1.15, speed: 1.2, endurance: 0.045, crit: 0.12, knock: 0.5, durability: 300, noise: 7 },
  model: (mb) => {
    rodX(mb, -0.25, 0.22, 0.012, 0.011, 0.011, 6, 'metal_dark');
    mb.push().translate(0.22, 0.012, 0).rotateY(-1.2); rodX(mb, 0, 0.06, 0, 0.011, 0.011, 6, 'metal_dark'); mb.pop();
    mb.cylinder(0.24, 0, 0.055, 0.02, 0.03, 6, 'metal_dark');
    mb.box(-0.27, 0.004, 0, 0.04, 0.012, 0.024, 'metal_dark');
  },
});
defItem({
  key: 'hockey_stick', name: 'Hockey Stick', cat: 'weapon', weight: 0.6, tags: ['sports'],
  weapon: { kind: 'blunt', dmg: [5, 8], range: 1.7, speed: 1.2, endurance: 0.045, crit: 0.08, knock: 0.5, durability: 35, twoHanded: true, noise: 6 },
  model: (mb) => {
    mb.box(-0.15, 0, 0, 1.1, 0.02, 0.03, 'wood_light', { color: 0xe8d0a0 });
    mb.box(-0.64, 0, 0, 0.12, 0.022, 0.032, S_GRIPTAPE);
    mb.push().translate(0.4, 0, 0).rotateY(-0.5); mb.box(0.12, 0, 0.0, 0.28, 0.06, 0.018, 'wood_light', { color: 0xe8d0a0 }); mb.box(0.12, 0.02, 0.0, 0.2, 0.02, 0.02, S_GRIPTAPE); mb.pop();
  },
});
defItem({
  key: 'tennis_racket', name: 'Tennis Racket', cat: 'weapon', weight: 0.3, tags: ['sports'],
  weapon: { kind: 'blunt', dmg: [3, 5], range: 1.3, speed: 1.4, endurance: 0.03, crit: 0.05, knock: 0.4, durability: 20, noise: 5 },
  model: (mb) => {
    rodX(mb, -0.34, -0.08, 0.016, 0.016, 0.014, 6, S_GRIPTAPE, { color: 0xf2f2ee, uvScale: 3 });
    rodX(mb, -0.08, 0.0, 0.016, 0.012, 0.01, 6, 'plastic_white');
    mb.push().translate(0.13, 0.0, 0).scale(1.25, 1, 1);
    mb.cylinder(0, 0, 0, 0.12, 0.02, 12, { sides: 'plastic_red', top: 'i_strings', bottom: 'i_strings' }, { fit: true });
    mb.pop();
  },
});
tex('i_strings', 12, 12, (pc) => {
  pc.fill(0x6a6a6a);
  pc.each((x, y) => { if (Math.hypot(x - 5.5, y - 5.5) < 5.2) pc.set(x, y, (x % 2 === 0 || y % 2 === 0) ? 0xe8e8e2 : 0x5a5a60); });
});
defItem({
  key: 'rolling_pin', name: 'Rolling Pin', cat: 'weapon', weight: 0.7, tags: ['cookware'],
  weapon: { kind: 'blunt', dmg: [4, 7], range: 1.0, speed: 1.4, endurance: 0.035, crit: 0.1, knock: 0.4, durability: 80, noise: 5 },
  model: (mb) => {
    rodX(mb, -0.13, 0.13, 0.03, 0.03, 0.03, 8, 'wood_light', { color: 0xf0dcb0 });
    for (const s of [-1, 1]) rodX(mb, s > 0 ? 0.13 : -0.22, s > 0 ? 0.22 : -0.13, 0.03, 0.012, 0.012, 6, 'wood_dark');
  },
});
defItem({
  key: 'mop', name: 'Mop', cat: 'weapon', weight: 1.0, tags: ['mop', 'cleaning'],
  weapon: { kind: 'blunt', dmg: [2, 4], range: 1.7, speed: 1.2, endurance: 0.04, crit: 0.03, knock: 0.5, durability: 20, twoHanded: true, noise: 4 },
  model: (mb) => {
    rodX(mb, -0.75, 0.45, 0.016, 0.012, 0.012, 6, 'metal_grey', { color: 0x9ab8d8 });
    mb.box(0.47, 0.0, 0, 0.04, 0.03, 0.08, 'plastic_yellow');
    for (let i = 0; i < 9; i++) { mb.push().translate(0.49, 0.004, -0.04 + i * 0.01).rotateY(-0.3 + (i % 3) * 0.3); mb.box(0.06, 0, 0, 0.12, 0.008, 0.008, T.cloth, { color: 0xd8d0b8 }); mb.pop(); }
  },
});
defItem({
  key: 'broom', name: 'Broom', cat: 'weapon', weight: 0.6, tags: ['broom', 'cleaning'],
  weapon: { kind: 'blunt', dmg: [2, 4], range: 1.7, speed: 1.4, endurance: 0.035, crit: 0.03, knock: 0.6, durability: 20, twoHanded: true, noise: 4 },
  model: (mb) => {
    rodX(mb, -0.8, 0.45, 0.014, 0.011, 0.011, 6, 'wood_light', { color: 0xc8a070 });
    mb.box(0.47, 0.0, 0, 0.05, 0.03, 0.26, 'plastic_red');
    mb.box(0.55, 0.0, 0, 0.12, 0.024, 0.25, T.cloth, { color: 0xc8a050 });
  },
});
defItem({
  key: 'umbrella', name: 'Umbrella', cat: 'weapon', weight: 0.4, tags: ['umbrella'],
  weapon: { kind: 'blunt', dmg: [2, 4], range: 1.2, speed: 1.5, endurance: 0.03, crit: 0.05, knock: 0.3, durability: 15, noise: 4 },
  desc: 'Keeps the rain (and the drips from the ceiling) off. A poor weapon.',
  model: (mb) => {
    rodX(mb, -0.42, 0.42, 0.03, 0.006, 0.006, 6, 'metal_dark');
    mb.push().translate(-0.45, 0.03, 0.03); rodZ(mb, -0.03, 0.0, 0, 0.012, 0.012, 6, 'plastic_black'); mb.pop();
    rodX(mb, -0.43, -0.34, 0.03, 0.013, 0.013, 6, 'plastic_black');
    rodX(mb, -0.25, 0.4, 0.03, 0.03, 0.012, 8, 'fabric_blue', { color: 0x3a4a8a });
    mb.box(-0.05, 0.03, 0.0, 0.12, 0.034, 0.012, 'plastic_black');
  },
});

// ---------------------------------------------------------------- melee: blades & axes
defItem({
  key: 'knife_hunting', name: 'Hunting Knife', cat: 'weapon', weight: 0.3, durability: 200, tags: ['knife', 'sharp'],
  weapon: { kind: 'blade', dmg: [5, 9], range: 0.95, speed: 1.7, endurance: 0.025, crit: 0.25, knock: 0.1, durability: 120, noise: 4 },
  desc: 'Full-tang steel. Skins game, cuts rope, holds an edge.',
  model: (mb) => {
    mb.box(-0.075, 0, 0, 0.11, 0.022, 0.026, 'leather_brown');
    for (let i = 0; i < 4; i++) mb.box(-0.12 + i * 0.03, 0.0221, 0, 0.004, 0.001, 0.026, T.black);
    mb.box(-0.015, 0, 0, 0.012, 0.024, 0.05, 'metal_brass');
    prism(mb, [[-0.01, 0.014], [0.13, 0.012], [0.17, -0.004], [0.14, -0.016], [-0.01, -0.016]], 0.007, 0.006, T.steel, T.steel, { color: 0xe2e6ea });
  },
});
defItem({
  key: 'machete', name: 'Machete', cat: 'weapon', weight: 0.9, durability: 250, tags: ['knife', 'sharp', 'machete'],
  weapon: { kind: 'blade', dmg: [11, 16], range: 1.4, speed: 1.1, endurance: 0.05, crit: 0.2, knock: 0.3, durability: 120, noise: 5 },
  model: (mb) => {
    mb.box(-0.21, 0, 0, 0.13, 0.024, 0.03, 'plastic_black');
    prism(mb, [[-0.145, 0.018], [0.3, 0.03], [0.34, 0.0], [0.3, -0.03], [-0.145, -0.024]], 0.008, 0.005, T.steel, T.steel, { color: 0xc8ccd0 });
    mb.box(0.1, 0.0131, 0.024, 0.4, 0.001, 0.006, T.steel, { color: 0xf2f6fa });
  },
});
defItem({
  key: 'fire_axe', name: 'Fire Axe', cat: 'weapon', weight: 3.0, durability: 300, tags: ['axe'],
  weapon: { kind: 'axe', dmg: [16, 26], range: 1.5, speed: 0.8, endurance: 0.09, crit: 0.25, knock: 0.8, durability: 150, twoHanded: true, noise: 7 },
  desc: 'Red-headed and heavy. Chops through doors and anything behind them.',
  model: (mb) => {
    rodX(mb, -0.45, 0.36, 0.02, 0.018, 0.02, 6, 'wood_light', { color: 0xf0d8a0 });
    rodX(mb, -0.45, -0.3, 0.02, 0.021, 0.021, 6, S_GRIPTAPE, { uvScale: 3 });
    mb.box(0.36, 0.0, 0, 0.07, 0.04, 0.08, 'plastic_red');
    prism(mb, [[0.32, 0.04], [0.4, 0.04], [0.44, 0.15], [0.29, 0.15]], 0.006, 0.028, 'plastic_red', 'plastic_red');
    mb.box(0.365, 0.0341, 0.145, 0.15, 0.002, 0.012, T.steel, { color: 0xe8ecf0 });
    prism(mb, [[0.33, -0.04], [0.39, -0.04], [0.37, -0.15], [0.355, -0.15]], 0.01, 0.02, 'metal_dark', 'metal_dark');
  },
});
defItem({
  key: 'shiv', name: 'Glass Shiv', cat: 'weapon', weight: 0.06, tags: ['sharp'],
  weapon: { kind: 'blade', dmg: [3, 6], range: 0.8, speed: 1.9, endurance: 0.02, crit: 0.25, knock: 0.0, durability: 12, noise: 4 },
  desc: 'A glass shard with a rag-wrapped grip. Fragile, quiet, desperate.',
  model: (mb) => {
    rodX(mb, -0.08, -0.02, 0.012, 0.012, 0.013, 6, T.cloth, { color: 0xc8b898 });
    prism(mb, [[-0.02, 0.012], [0.05, 0.004], [0.08, -0.002], [-0.02, -0.012]], 0.008, 0.004, D_GLASS_CRACK, 'glass', { color: 0xd8f0e0 });
  },
});

// ---------------------------------------------------------------- spears & improvised
defItem({
  key: 'spear_wood', name: 'Wooden Spear', cat: 'weapon', weight: 1.2, tags: ['spear'],
  weapon: { kind: 'spear', dmg: [6, 10], range: 2.2, speed: 1.1, endurance: 0.045, crit: 0.15, knock: 0.3, durability: 30, twoHanded: true, pierce: true, noise: 4 },
  desc: 'A plank whittled to a point. Keeps things at arm\'s length — plus a bit.',
  model: (mb) => {
    mb.box(-0.15, 0.0, 0, 1.3, 0.024, 0.024, 'wood_light', { color: 0xd8b888 });
    prism(mb, [[0.5, 0.012], [0.68, 0.0], [0.5, -0.012]], 0, 0.024, 'wood_light', 'wood_light', { color: 0xc8a070 });
  },
});
defItem({
  key: 'spear_knife', name: 'Knife Spear', cat: 'weapon', weight: 1.4, tags: ['spear'],
  weapon: { kind: 'spear', dmg: [9, 14], range: 2.2, speed: 1.1, endurance: 0.045, crit: 0.25, knock: 0.3, durability: 50, twoHanded: true, pierce: true, noise: 4 },
  model: (mb) => {
    mb.box(-0.15, 0.0, 0, 1.3, 0.024, 0.024, 'wood_light', { color: 0xd8b888 });
    mb.box(0.44, 0.0, 0, 0.12, 0.028, 0.03, T.cloth, { color: 0x9a9aa0 });
    prism(mb, [[0.45, 0.012], [0.62, 0.006], [0.68, -0.004], [0.45, -0.014]], 0.009, 0.004, T.steel, T.steel, { color: 0xe2e6ea });
  },
});
defItem({
  key: 'nailed_plank', name: 'Nailed Plank', cat: 'weapon', weight: 2.2, tags: ['plankweapon'],
  weapon: { kind: 'blunt', dmg: [7, 11], range: 1.45, speed: 1.0, endurance: 0.055, crit: 0.12, knock: 0.5, durability: 30, twoHanded: true, noise: 6 },
  model: (mb) => {
    mb.box(0, 0, 0, 1.0, 0.04, 0.09, 'plank');
    for (let i = 0; i < 5; i++) mb.box(0.25 + i * 0.05, 0.04, -0.02 + (i % 2) * 0.04, 0.004, 0.03, 0.004, 'metal_grey', { color: 0xc8ccd0 });
  },
});

// ---------------------------------------------------------------- ranged
defItem({
  key: 'pistol', name: 'Pistol', cat: 'weapon', weight: 0.9, rare: true, tags: ['gun'],
  weapon: { kind: 'firearm', dmg: [14, 20], range: 18, speed: 2.0, endurance: 0.02, crit: 0.25, knock: 0.3, durability: 800, noise: 40, ammo: 'ammo_9mm', mag: 15, reload: 2.2, spread: 0.05 },
  desc: '9mm semi-automatic, fifteen-round magazine. Every shot rings for forty tiles.',
  model: (mb) => {
    mb.box(0.02, 0.0, 0, 0.18, 0.035, 0.028, 'metal_dark');
    mb.box(0.02, 0.035, 0, 0.18, 0.004, 0.024, 'metal_grey', { color: 0x6a6e74 });
    mb.push().translate(-0.05, 0.0, 0).rotateZ(0.0); mb.box(-0.03, -0.0, 0, 0.05, 0.035, 0.03, 'plastic_black'); mb.pop();
    mb.box(-0.09, 0.0, 0, 0.12, 0.03, 0.03, 'plastic_black');
    mb.box(0.11, 0.012, 0, 0.012, 0.012, 0.012, T.black);
    mb.box(-0.02, 0.0, 0.0, 0.03, 0.012, 0.03, T.black);
  },
});
defItem({
  key: 'ammo_9mm', name: '9mm Ammo', cat: 'ammo', weight: 0.4, ammoCount: 30, rare: true, tags: ['ammo'],
  desc: 'A box of thirty rounds.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.08, 0.035, 0.06, 'cardboard', { color: 0x5a6a3a });
    mb.flat(0, 0.0352, 0, 0.08, 0.06, D_AMMO);
  },
});
defItem({
  key: 'nail_gun', name: 'Nail Gun', cat: 'weapon', weight: 2.5, battery: true, uses: 100, tags: ['nailgun', 'power_tool'],
  weapon: { kind: 'firearm', dmg: [5, 8], range: 5, speed: 1.5, endurance: 0.02, crit: 0.1, knock: 0.1, durability: 400, noise: 12, ammo: 'nails', mag: 30, reload: 3, spread: 0.08 },
  desc: 'Cordless framing nailer. Loads from a box of nails; drains its battery per shot. Also nails boards up fast.',
  model: (mb) => {
    mb.box(0.03, 0.04, 0, 0.24, 0.07, 0.05, 'plastic_yellow', { color: 0xf0c419 });
    mb.box(0.15, 0.0, 0, 0.04, 0.11, 0.04, 'metal_dark');
    mb.box(-0.07, 0.0, 0, 0.05, 0.06, 0.035, 'plastic_black');
    mb.box(-0.1, 0.0, 0, 0.07, 0.04, 0.06, 'plastic_black');
    mb.push().translate(0.08, 0.0, 0).rotateZ(-0.3); mb.box(0, 0, 0, 0.1, 0.02, 0.012, 'metal_grey'); mb.pop();
  },
});
defItem({
  key: 'flare_gun', name: 'Flare Gun', cat: 'weapon', weight: 0.5, tags: ['gun'],
  weapon: { kind: 'firearm', dmg: [8, 12], range: 12, speed: 0.8, endurance: 0.02, crit: 0.1, knock: 0.2, durability: 100, noise: 25, ammo: 'flare', mag: 1, reload: 2.5, spread: 0.06, fire: true },
  desc: 'Fires a burning flare: lights up the dark, sets things alight, draws every eye.',
  model: (mb) => {
    rodX(mb, -0.02, 0.15, 0.04, 0.02, 0.02, 8, 'plastic_red', { color: 0xf26a1a });
    mb.box(-0.06, 0.0, 0, 0.07, 0.05, 0.03, 'plastic_red', { color: 0xf26a1a });
    mb.box(-0.02, 0.055, 0, 0.03, 0.01, 0.02, 'plastic_black');
  },
});
defItem({
  key: 'slingshot', name: 'Slingshot', cat: 'weapon', weight: 0.2, tags: ['sling'],
  weapon: { kind: 'firearm', dmg: [3, 6], range: 10, speed: 1.0, endurance: 0.03, crit: 0.15, knock: 0.15, durability: 80, noise: 2, ammo: 'stone', mag: 1, reload: 1.2, spread: 0.1 },
  desc: 'Forked stick and rubber. Fires stones; nearly silent.',
  model: (mb) => {
    rodX(mb, -0.12, 0.0, 0.012, 0.011, 0.012, 6, 'bark', { color: 0x8a6a4a });
    for (const s of [-1, 1]) { mb.push().translate(0.0, 0.012, 0).rotateY(s * 0.5); rodX(mb, 0, 0.08, 0, 0.01, 0.008, 6, 'bark', { color: 0x8a6a4a }); mb.pop(); }
    for (const s of [-1, 1]) { mb.push().translate(0.07, 0.012, s * 0.038).rotateY(-s * 1.2); mb.box(0.03, 0, 0, 0.06, 0.004, 0.004, T.white, { color: 0xd8a888 }); mb.pop(); }
    mb.box(0.11, 0.008, 0, 0.012, 0.01, 0.02, 'leather_brown');
  },
});

// ---------------------------------------------------------------- thrown
defItem({
  key: 'molotov', name: 'Molotov Cocktail', cat: 'weapon', weight: 0.8, tags: ['thrown', 'fire'],
  weapon: { kind: 'thrown', dmg: [6, 10], range: 9, speed: 0.8, endurance: 0.04, crit: 0, knock: 0.2, durability: 1, noise: 15, fire: true },
  desc: 'Light the rag, throw, step back. Sets a patch of floor ablaze.',
  model: (mb) => {
    bottle(mb, { r: 0.03, h: 0.24, neckR: 0.011, neckH: 0.06, shoulder: 0.04, body: T.glass, bodyColor: 0xc8a050 });
    mb.cylinder(0, 0.235, 0, 0.014, 0.025, 6, L_MOLOTOV, { fit: true });
    mb.push().translate(0.01, 0.255, 0).rotateZ(-0.6); mb.box(0.02, 0, 0, 0.05, 0.006, 0.02, L_MOLOTOV); mb.pop();
  },
});
defItem({
  key: 'glass_bottle_throw', name: 'Cracked Bottle', cat: 'weapon', weight: 0.35, tags: ['thrown', 'distraction'],
  weapon: { kind: 'thrown', dmg: [3, 5], range: 9, speed: 1.0, endurance: 0.03, crit: 0.05, knock: 0.2, durability: 1, noise: 12 },
  desc: 'Too cracked to hold anything. Throw it: the smash draws attention away from you.',
  model: (mb) => {
    mb.push().translate(0, 0.03, 0).rotateZ(Math.PI / 2);
    mb.cylinder(0, -0.12, 0, 0.03, 0.15, 8, D_GLASS_CRACK, { fit: true, color: 0x7a9a6a });
    mb.cylinder(0, 0.03, 0, 0.03, 0.04, 8, D_GLASS_CRACK, { fit: true, color: 0x7a9a6a, rTop: 0.011 });
    mb.cylinder(0, 0.07, 0, 0.011, 0.05, 8, D_GLASS_CRACK, { fit: true, color: 0x7a9a6a });
    mb.pop();
  },
});
defItem({
  key: 'brick', name: 'Brick', cat: 'weapon', weight: 2.0, tags: ['thrown', 'masonry', 'heavyblunt'],
  weapon: { kind: 'thrown', dmg: [5, 8], range: 7, speed: 0.9, endurance: 0.05, crit: 0.1, knock: 0.5, durability: 20, noise: 8 },
  model: (mb) => mb.box(0, 0, 0, 0.21, 0.065, 0.1, S_BRICK, { uvScale: 3.5 }),
});
defItem({
  key: 'noisemaker', name: 'Noisemaker', cat: 'weapon', weight: 0.4, tags: ['thrown', 'distraction', 'noisemaker'],
  weapon: { kind: 'thrown', dmg: [0, 1], range: 8, speed: 0.8, endurance: 0.03, crit: 0, knock: 0, durability: 1, noise: 17 },
  desc: 'A wind-up alarm clock rigged to ring for half an hour wherever it lands (17-tile radius).',
  model: (mb) => {
    mb.cylinder(0, 0.012, 0, 0.045, 0.03, 10, { sides: 'metal_grey', top: D_CLOCKFACE, bottom: 'metal_grey' }, { color: 0xffffff, fit: true });
    mb.push().translate(0, 0.012, 0).rotateX(-Math.PI / 2).translate(0, 0, 0);
    mb.pop();
    for (const s of [-1, 1]) { mb.cylinder(s * 0.03, 0.042, -0.01, 0.016, 0.01, 8, 'metal_grey', { color: 0xc8302a }); mb.box(s * 0.03, 0, 0.02, 0.008, 0.014, 0.008, T.black); }
    mb.box(0.04, 0.02, 0.0, 0.03, 0.006, 0.004, 'plastic_red');
    for (const z of [-0.02, 0.0, 0.02]) mb.box(-0.05, 0.03, z, 0.02, 0.004, 0.004, T.white, { color: [0xc8302a, 0x2a5aa8, 0xf0c419][Math.round(z * 50 + 1)] });
  },
});
defItem({
  key: 'flare', name: 'Road Flare', cat: 'weapon', weight: 0.2, uses: 100, tags: ['flare', 'thrown', 'light', 'distraction'],
  light: { range: 10, intensity: 1.4, color: 0xff3a2a, drainPerHour: 3 },
  weapon: { kind: 'thrown', dmg: [1, 2], range: 10, speed: 1.0, endurance: 0.02, crit: 0, knock: 0, durability: 1, noise: 4 },
  desc: 'Twenty minutes of hissing red light. Throw it to light a room or pull attention. Also flare-gun ammo.',
  model: (mb) => {
    rodX(mb, -0.11, 0.09, 0.016, 0.016, 0.016, 8, L_FLARE, { fit: true });
    rodX(mb, 0.09, 0.11, 0.016, 0.017, 0.017, 8, T.white, { color: 0x2a2a2a });
    rodX(mb, -0.12, -0.11, 0.016, 0.014, 0.014, 8, T.white, { color: 0xf2e8d0 });
  },
});
defItem({
  key: 'baseball', name: 'Baseball', cat: 'weapon', weight: 0.15, tags: ['thrown', 'sports', 'distraction'],
  weapon: { kind: 'thrown', dmg: [2, 4], range: 12, speed: 1.2, endurance: 0.02, crit: 0.05, knock: 0.1, durability: 50, noise: 5 },
  model: (mb) => mb.sphere(0, 0.037, 0, 0.037, 8, 6, 'i_baseball', { fit: true }),
});
tex('i_baseball', 16, 8, (pc) => {
  pc.fill(0xf4f0e6);
  for (let x = 0; x < 16; x++) { const y = Math.round(4 + Math.sin((x / 16) * Math.PI * 4) * 2); pc.set(x, y, 0xc8302a); if (x % 2 === 0) pc.set(x, y - 1, 0xe8a0a0); }
}, true);

void S_HGRIP; void D_FLAME; void K; void rp; void dk; void lt;

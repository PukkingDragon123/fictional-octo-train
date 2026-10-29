// Items stream — THE MERIDIAN FIELD PACK (key iron_cube), THE TOOL ROLL and the parts of hands-on crafting
// (src/craft): a chair leg sawn off a chair, scrap ground to an edge, cloth torn
// into strips, and what they make bound together.
import { defItem } from '../../items/item';
import { T, rodX, rodZ, prism, tex, makeRamp, ph } from './_kit';

/** the field pack's slate canvas: a 2/1 twill with slub threads and grime toward the base */
const S_PACK = tex('i_fpack_canvas', 16, 16, (pc) => {
  const R = makeRamp(0x5a6352, 6, { spread: 0.42, hueShift: 0.03 });
  pc.each((x, y) => {
    let i = 2.6 + ((x + y * 2) % 6 < 3 ? 0.6 : 0) - (((y % 2 === 0) ? ((x >> 1) % 2) : (((x + 1) >> 1) % 2)) * 0.5) + (ph(x, y, 5) - 0.5) * 0.8;
    if (y === 7) i -= 1.4;
    if (y === 6 && x % 3 === 0) i += 1.6;
    pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(i)))]);
  });
}, true);
/** the lid: stencilled Meridian seal and asset number on the canvas, the debtor card in its window */
const S_PACK_LID = tex('i_fpack_lid', 16, 20, (pc) => {
  const R = makeRamp(0x5a6352, 6, { spread: 0.42, hueShift: 0.03 });
  pc.each((x, y) => pc.set(x, y, R[2 + ((x + y * 2) % 6 < 3 ? 1 : 0)]));
  pc.strokeRect(0, 0, 16, 20, R[0]);
  // the seal: a ring with a meridian and the equator, in off-white stencil
  for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; const x = Math.round(8 + Math.cos(t) * 3.5 - 0.5), y = Math.round(5 + Math.sin(t) * 3.5 - 0.5); if (a % 6) pc.set(x, y, 0xe4ddc8); }
  pc.vline(7, 3, 7, 0xe4ddc8); pc.hline(5, 9, 5, 0xe4ddc8);
  pc.hline(3, 12, 10, 0xe4ddc8); pc.hline(4, 11, 11, 0xe4ddc8);
  // the debtor card window
  pc.rect(4, 13, 8, 5, 0xece6d2); pc.hline(4, 11, 13, 0xc8a032); pc.hline(5, 9, 16, 0x1a1a1c); pc.strokeRect(3, 12, 10, 7, 0x26272a);
});
const S_WEB = tex('i_fpack_web', 8, 4, (pc) => {
  pc.each((x, y) => pc.set(x, y, y === 0 || y === 3 ? 0x1a1b1d : (x + y) % 3 === 0 ? 0x3a3c40 : 0x2a2b2e));
}, true);
const S_PAD = tex('i_fpack_pad', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 4 === 0 || (x - y + 8) % 4 === 0 ? 0x4a4c50 : (x % 2 && y % 2) ? 0x141516 : 0x26282b));
}, true);
const S_STRIP = tex('i_cloth_strip', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y * 3) % 7 === 0 ? 0xbcae8c : y % 3 === 0 ? 0xe2d6b8 : 0xd4c8a6));
  pc.vline(7, 0, 7, 0x9a8c6c);
}, true);
const S_CANVAS_ROLL = tex('i_tool_roll', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 2 ? 0x6a5a3a : 0x74643f));
  pc.hline(0, 7, 3, 0x3e3422); pc.hline(0, 7, 4, 0x8a7a52);
}, true);

defItem({
  // the save / grid key stays 'iron_cube' (src/items/footprints.ts, saves, tests): only the thing changed
  key: 'iron_cube', name: 'Meridian Field Pack', cat: 'bag', weight: 3.0, value: 40, noStack: true, tags: ['bag', 'backpack', 'cube', 'frame', 'fabric'],
  desc: 'A Meridian-issue rucksack on a steel frame: slate canvas, five fists to a side, stencilled with an asset number and your debtor number. The zips are sealed with a padlock that opens to your BAILIFF band and nobody else\'s. Everything inside counts against your knees.',
  bag: { capacity: 30, reduction: 0, slot: 'back' },
  clothing: { slot: 'back', covers: [], insulation: 0, wind: 0, bite: 0, scratch: 0, water: 0, look: { part: 'back', tex: 'c_backpack', color: 0x56604e } },
  grid: [5, 5],
  model: (mb) => {
    // standing upright on its frame: the bulging body, the crowned flap, side pockets
    const w = 0.34, h = 0.44, d = 0.22;
    mb.box(0, 0.02, 0, w, h, d, S_PACK, { uvScale: 2 });
    mb.box(0, h - 0.02, 0.005, w + 0.012, 0.05, d + 0.012, { top: S_PACK_LID, sides: S_PACK }, { fit: { top: true } });
    mb.box(0, 0.06, d / 2 + 0.02, w * 0.72, h * 0.42, 0.04, S_PACK, { color: 0xc8ccbe, uvScale: 2 });
    for (const sx of [-1, 1]) mb.box(sx * (w / 2 + 0.025), 0.05, 0.01, 0.05, h * 0.42, d * 0.7, S_PACK, { color: 0xb8bcae, uvScale: 2 });
    // the rubberised base, binding, compression straps and buckles
    mb.box(0, 0.0, 0, w + 0.01, 0.03, d + 0.01, 'rubber_black');
    for (const y of [0.14, 0.3]) mb.box(0, y, 0, w + 0.016, 0.022, d + 0.016, S_WEB);
    for (const sx of [-1, 1]) for (const y of [0.14, 0.3]) mb.box(sx * (w / 2 + 0.012), y - 0.004, d * 0.2, 0.012, 0.03, 0.026, 'plastic_white', { color: 0x2a2b2e });
    // the steel frame up the back, the grab handle, padded shoulder straps
    for (const sx of [-1, 1]) mb.box(sx * (w / 2 - 0.02), 0.0, -d / 2 - 0.014, 0.018, h + 0.06, 0.018, 'metal_grey', { color: 0x5c6064 });
    mb.box(0, h + 0.05, -d / 2 - 0.014, w - 0.02, 0.018, 0.018, 'metal_grey', { color: 0x5c6064 });
    mb.box(0, h + 0.03, -0.02, 0.07, 0.024, 0.02, S_WEB);
    for (const sx of [-1, 1]) mb.box(sx * 0.08, 0.08, -d / 2 - 0.03, 0.06, h - 0.1, 0.022, S_PAD);
    // the brass seal on the zip pulls
    mb.box(0.04, h - 0.04, d / 2 + 0.018, 0.034, 0.038, 0.016, 'metal_brass', { color: 0xd0a850 });
  },
});

defItem({
  key: 'tool_roll', name: 'Tool Roll', cat: 'bag', weight: 0.4, value: 8, noStack: true, tags: ['bag', 'toolroll'],
  desc: 'Waxed canvas with six stitched loops and a quick-draw holster at the end. Rides on the hip. Tools only.',
  bag: { capacity: 12, reduction: 0.1, slot: 'belt' },
  grid: [2, 3],
  model: (mb) => {
    rodX(mb, -0.14, 0.14, 0.04, 0.04, 0.04, 8, S_CANVAS_ROLL, { uvScale: 2 });
    for (const x of [-0.08, 0.08]) rodX(mb, x - 0.012, x + 0.012, 0.04, 0.043, 0.043, 8, T.leather, { color: 0x4a3420 });
    mb.box(0, 0.04, 0.044, 0.05, 0.02, 0.006, 'metal_grey');
  },
});

defItem({
  key: 'chair_leg', name: 'Chair Leg', cat: 'material', weight: 0.5, value: 1, burn: 0.6, tags: ['stick', 'wood', 'handle'],
  desc: 'Sawn off a chair at the joint: straight-grained, dry, the length of your forearm and hand. The start of a lot of things.',
  weapon: { kind: 'blunt', dmg: [3, 6], range: 1.0, speed: 1.4, endurance: 0.03, crit: 0.08, knock: 0.35, durability: 40, noise: 5 },
  model: (mb) => {
    rodX(mb, -0.2, 0.18, 0.018, 0.014, 0.018, 6, T.wood, { uvScale: 2, color: 0xd8b888 });
    mb.box(0.2, 0.0, 0, 0.04, 0.036, 0.036, T.wood, { color: 0xc8a070 });
    mb.box(0.222, 0.004, 0, 0.004, 0.03, 0.03, T.wood, { color: 0xf0d8a8 });
  },
});

defItem({
  key: 'sharp_iron', name: 'Sharpened Iron', cat: 'material', weight: 0.6, value: 3, tags: ['sharp', 'metal', 'blade_head'],
  desc: 'Scrap beaten and ground along one side until the edge catches the light. Hold it by the dull end.',
  model: (mb) => {
    prism(mb, [[-0.06, 0.03], [0.05, 0.03], [0.07, -0.035], [-0.06, -0.025]], 0, 0.008, T.rust, T.metal, { color: 0x8a7a6a });
    mb.box(0.062, 0.0045, 0, 0.012, 0.004, 0.062, T.steel, { color: 0xeef2f6, emissive: 0.15 });
  },
});

defItem({
  key: 'cloth_strips', name: 'Cloth Strips', cat: 'material', weight: 0.05, value: 0, burn: 0.15, tags: ['binding', 'strips', 'tinder'],
  desc: 'A shirt that gave its life. Torn along the weave into long strips: bind with them, braid them, tie off a wound in a pinch.',
  model: (mb) => {
    for (let i = 0; i < 3; i++) mb.box(0, 0.004 + i * 0.006, (i - 1) * 0.022, 0.14 - i * 0.02, 0.005, 0.02, S_STRIP, { uvScale: 2 });
  },
});

defItem({
  key: 'crude_axe', name: 'Crude Axe', cat: 'tool', weight: 1.3, value: 6, durability: 60, tags: ['axe', 'crude'],
  weapon: { kind: 'axe', dmg: [7, 12], range: 1.2, speed: 1.0, endurance: 0.06, crit: 0.14, knock: 0.5, durability: 50, noise: 6 },
  desc: 'A chair leg, a ground scrap head and a torn shirt holding them together. Ugly. Bites into furniture and anything else.',
  model: (mb) => {
    rodX(mb, -0.24, 0.16, 0.018, 0.015, 0.018, 6, T.wood, { uvScale: 2, color: 0xd8b888 });
    prism(mb, [[0.1, 0.02], [0.17, 0.02], [0.19, 0.1], [0.08, 0.1]], 0.012, 0.01, T.rust, T.metal, { color: 0x8a7a6a });
    mb.box(0.135, 0.017, 0.1, 0.11, 0.003, 0.008, T.steel, { color: 0xeef2f6 });
    for (let i = 0; i < 4; i++) rodX(mb, 0.1 + i * 0.018, 0.114 + i * 0.018, 0.018, 0.022, 0.022, 6, S_STRIP);
  },
});

defItem({
  key: 'scrap_knife', name: 'Scrap Knife', cat: 'weapon', weight: 0.35, value: 4, durability: 40, tags: ['sharp', 'knife', 'crude'],
  weapon: { kind: 'blade', dmg: [4, 7], range: 0.85, speed: 1.8, endurance: 0.022, crit: 0.22, knock: 0.05, durability: 35, noise: 4 },
  desc: 'Sharpened iron with a cloth-bound grip. Cuts rope, cloth, meat and, if it comes to it, the thing that wants your meat.',
  model: (mb) => {
    rodX(mb, -0.1, -0.01, 0.014, 0.013, 0.014, 6, S_STRIP);
    prism(mb, [[-0.01, 0.014], [0.1, 0.008], [0.13, -0.002], [-0.01, -0.014]], 0.01, 0.006, T.steel, T.metal, { color: 0xc8ccd0 });
  },
});

defItem({
  key: 'crude_hammer', name: 'Crude Hammer', cat: 'tool', weight: 0.9, value: 4, durability: 50, tags: ['hammer', 'crude', 'hard'],
  weapon: { kind: 'blunt', dmg: [5, 8], range: 1.0, speed: 1.2, endurance: 0.045, crit: 0.1, knock: 0.6, durability: 45, noise: 7 },
  desc: 'A stone lashed into a split chair leg. Drives nails. Cracks skulls. Ask it nicely.',
  model: (mb) => {
    rodX(mb, -0.2, 0.12, 0.018, 0.014, 0.018, 6, T.wood, { uvScale: 2, color: 0xd8b888 });
    mb.push().translate(0.13, 0.03, 0).scale(1.0, 0.9, 1.3); mb.sphere(0, 0, 0, 0.04, 6, 5, 'stone_rough', { sy: 0.8 }); mb.pop();
    for (let i = 0; i < 3; i++) rodZ(mb, -0.03, 0.03, 0.03, 0.026, 0.026, 6, S_STRIP, { cx: 0.1 + i * 0.022 });
  },
});

// Items stream — THE IRON CUBE, THE TOOL ROLL and the parts of hands-on crafting
// (src/craft): a chair leg sawn off a chair, scrap ground to an edge, cloth torn
// into strips, and what they make bound together.
import { defItem } from '../../items/item';
import { T, rodX, rodZ, prism, tex } from './_kit';

const S_IRON = tex('i_cube_iron', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 7 + y * 13) % 11 < 2 ? 0x4c5156 : (x + y) % 5 === 0 ? 0x5e6368 : 0x565b60));
  pc.hline(0, 7, 0, 0x6e7378); pc.vline(0, 0, 7, 0x6e7378);
}, true);
const S_PAD = tex('i_cube_pad', 8, 8, (pc) => {
  pc.fill(0x0e2a2e);
  for (let r = 1; r < 4; r++) pc.each((x, y) => { if (Math.abs(Math.hypot(x - 3.5, y - 4.2) - r * 1.1) < 0.35) pc.set(x, y, 0x3ad8c8); });
  pc.strokeRect(0, 0, 8, 8, 0x8a9096);
});
const S_STRIP = tex('i_cloth_strip', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y * 3) % 7 === 0 ? 0xbcae8c : y % 3 === 0 ? 0xe2d6b8 : 0xd4c8a6));
  pc.vline(7, 0, 7, 0x9a8c6c);
}, true);
const S_CANVAS_ROLL = tex('i_tool_roll', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 2 ? 0x6a5a3a : 0x74643f));
  pc.hline(0, 7, 3, 0x3e3422); pc.hline(0, 7, 4, 0x8a7a52);
}, true);

defItem({
  key: 'iron_cube', name: 'Remittance Cube', cat: 'bag', weight: 3.0, value: 40, noStack: true, tags: ['bag', 'backpack', 'cube', 'hard', 'metal'],
  desc: 'A riveted iron box on a harness, five fists to a side. Opens to your thumbprint and nobody else\'s. The Programme calls it a "secure remittance carrier". Everything inside counts against your knees.',
  bag: { capacity: 30, reduction: 0, slot: 'back' },
  clothing: { slot: 'back', covers: [], insulation: 0, wind: 0, bite: 0, scratch: 0, water: 0, look: { part: 'back', tex: 'c_backpack', color: 0x5a5f63 } },
  grid: [5, 5],
  model: (mb) => {
    const s = 0.4;
    mb.box(0, 0, 0, s, s, s, S_IRON, { uvScale: 2 });
    // edge bands and rivets
    for (const y of [0.004, s - 0.016]) mb.box(0, y, 0, s + 0.012, 0.014, s + 0.012, 'metal_dark');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * s / 2, 0, sz * s / 2, 0.022, s, 0.022, 'metal_dark');
    for (const x of [-0.14, -0.05, 0.05, 0.14]) for (const y of [0.01, s - 0.01]) mb.cylinder(x, y - 0.004, s / 2 + 0.008, 0.007, 0.008, 5, 'metal_grey');
    // the thumb scanner and the bolts
    mb.box(0.1, s * 0.55, s / 2 + 0.004, 0.06, 0.06, 0.008, S_PAD, { fit: true, emissive: 0.6 });
    for (const sx of [-1, 1]) mb.box(sx * 0.15, s - 0.06, s / 2 + 0.008, 0.03, 0.02, 0.014, 'metal_grey');
    // harness straps
    for (const sx of [-1, 1]) mb.box(sx * 0.1, 0.06, -s / 2 - 0.01, 0.04, s - 0.08, 0.016, T.nylon, { color: 0x3a3a34 });
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

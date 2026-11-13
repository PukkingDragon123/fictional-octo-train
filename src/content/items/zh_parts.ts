// Items — CAMP PARTS (round 16): the intermediate parts the benches make and the
// metal tier of build mode consumes (src/build/kit2.ts). Bench tier gates them
// (src/content/recipes/zh_parts.ts): hinges and wiring harnesses on any bench,
// gears, riveted plate and relay boards on the powered bench.
import { defItem } from '../../items/item';
import { tex, rodX } from './_kit';

const D_PLATE = tex('i_zh_plate', 16, 12, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 5 + y * 3) % 11 === 0 ? 0x7a7e84 : (x + y * 2) % 7 === 0 ? 0x8e9298 : 0x84888e));
  pc.strokeRect(0, 0, 16, 12, 0x5a5e64);
  for (const [x, y] of [[2, 2], [13, 2], [2, 9], [13, 9], [7, 2], [7, 9]]) { pc.set(x, y, 0xd8dce0); pc.set(x + 1, y + 1, 0x3a3e44); }
  pc.hline(3, 12, 6, 0x6e7278);
});
const D_BOARD = tex('i_zh_board', 16, 12, (pc) => {
  pc.fill(0x1e5a2e);
  pc.each((x, y) => { if ((x + y) % 5 === 0 && x % 2 === 0) pc.set(x, y, 0xc8a040); });
  pc.rect(3, 3, 4, 3, 0x1a1a1a); pc.rect(9, 6, 5, 3, 0x1a1a1a); pc.rect(4, 8, 2, 2, 0xd8d0c0);
  pc.set(12, 2, 0xe03a2a); pc.set(13, 2, 0x3ae05a);
  pc.strokeRect(0, 0, 16, 12, 0x143e20);
});

defItem({
  key: 'gear', name: 'Cut Gear', cat: 'material', weight: 0.35, tags: ['gear', 'metal', 'part'], value: 9, grid: [1, 1],
  desc: 'A spur gear filed out of scrap plate on the powered bench. Motors, flails, cranks: anything that turns.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.055, 0.016, 16, { sides: 'metal_grey', top: 'chrome', bottom: 'metal_grey' });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mb.push().translate(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06).rotateY(-a); mb.box(0, 0, 0, 0.014, 0.016, 0.014, 'metal_grey'); mb.pop(); }
    mb.cylinder(0, 0.0165, 0, 0.016, 0.002, 10, 'metal_dark');
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; mb.cylinder(Math.cos(a) * 0.033, 0.0165, Math.sin(a) * 0.033, 0.008, 0.001, 8, 'metal_dark'); }
  },
});
defItem({
  key: 'hinge', name: 'Strap Hinge', cat: 'material', weight: 0.25, tags: ['hinge', 'metal', 'part'], value: 5, grid: [1, 1],
  desc: 'Two bent straps on a nail pin. Doors, lids, gates.',
  model: (mb) => {
    for (const s of [-1, 1]) { mb.box(s * 0.045, 0, 0, 0.08, 0.004, 0.035, 'metal_rusty'); for (const x of [0.03, 0.06]) mb.cylinder(s * x, 0.004, 0, 0.004, 0.003, 6, 'chrome'); }
    rodX(mb, -0.004, 0.004, 0.006, 0.008, 0.008, 8, 'metal_dark');
    mb.push().rotateX(Math.PI / 2); mb.cylinder(0, -0.02, -0.006, 0.006, 0.04, 8, 'metal_grey'); mb.pop();
  },
});
defItem({
  key: 'steel_plate', name: 'Riveted Plate', cat: 'material', weight: 2.6, tags: ['plate', 'metal', 'part'], value: 16, grid: [2, 2],
  desc: 'Two sheets of steel riveted back to back on the powered bench. Walls and doors that take an afternoon to get through.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.4, 0.012, 0.3, { all: 'metal_grey', top: D_PLATE }, { fit: { top: true } });
    mb.box(0.01, 0.012, -0.01, 0.38, 0.006, 0.28, 'metal_dark', { color: 0x9a9ea4 });
    for (const x of [-0.17, 0.17]) for (const z of [-0.12, 0.12]) mb.sphere(x, 0.019, z, 0.008, 6, 4, 'chrome');
  },
});
defItem({
  key: 'wiring_harness', name: 'Wiring Harness', cat: 'material', weight: 0.4, tags: ['wire', 'electrical', 'part'], value: 8, grid: [1, 2],
  desc: 'Three lengths of wire bound into a loom, ends stripped and twisted. Every powered piece wants one.',
  model: (mb) => {
    const cols = ['plastic_red', 'plastic_blue', 'rubber_black'];
    for (let i = 0; i < 3; i++) rodX(mb, -0.14, 0.14, 0.012 + i * 0.002, 0.006, 0.006, 6, cols[i], { cz: (i - 1) * 0.008 });
    for (const x of [-0.1, 0, 0.1]) rodX(mb, x - 0.012, x + 0.012, 0.014, 0.014, 0.014, 8, 'rubber_black');
    for (const s of [-1, 1]) mb.box(s * 0.155, 0.012, 0, 0.02, 0.01, 0.03, 'metal_brass');
  },
});
defItem({
  key: 'relay_board', name: 'Relay Board', cat: 'material', weight: 0.3, tags: ['electronics', 'circuit', 'part'], value: 18, grid: [1, 1],
  desc: 'A board of relays and a crystal stripped from a radio, re-soldered on the powered bench. Radios, alarms, the clever pieces.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.12, 0.006, 0.09, { all: 'plastic_black', top: D_BOARD }, { fit: { top: true } });
    mb.box(-0.03, 0.006, -0.01, 0.03, 0.018, 0.022, 'plastic_blue');
    mb.box(0.03, 0.006, 0.015, 0.025, 0.014, 0.02, 'plastic_black');
    mb.cylinder(0.035, 0.006, -0.025, 0.007, 0.02, 8, 'metal_grey');
  },
});

// ---------------------------------------------------------------- round 17: the build kit (build mode while it is in hand) and blueprints
const D_TUBE_LABEL = tex('i_zh_tube_label', 16, 8, (pc) => {
  pc.fill(0xe8dcb4); pc.strokeRect(0, 0, 16, 8, 0x6a5a38);
  pc.rect(1, 1, 4, 6, 0x2f62a8); pc.set(2, 3, 0xe8dcb4); pc.set(3, 4, 0xe8dcb4);
  for (let x = 7; x < 15; x += 2) pc.set(x, 3, 0x3a2e1e);
  for (let x = 7; x < 13; x += 2) pc.set(x, 5, 0x6a5a38);
});
const D_PLAN = tex('i_zh_plan', 16, 16, (pc) => {
  pc.fill(0x2f62a8);
  pc.each((x, y) => { if (x % 4 === 0 || y % 4 === 0) pc.set(x, y, 0x3a72b8); });
  pc.strokeRect(2, 3, 10, 8, 0xdce8f8); pc.hline(2, 11, 7, 0xdce8f8); pc.vline(7, 3, 10, 0xdce8f8);
  pc.set(13, 13, 0xdce8f8); pc.set(14, 13, 0xdce8f8);
});
const D_RULE = tex('i_zh_rule', 16, 4, (pc) => {
  pc.fill(0xe8c020);
  for (let x = 0; x < 16; x += 2) pc.vline(x, 0, x % 4 === 0 ? 2 : 1, 0x2a2410);
});

defItem({
  key: 'build_kit', name: 'Surveyor\'s Build Kit', cat: 'tool', weight: 1.6, durability: 600, tags: ['hammer', 'buildkit', 'tool'], value: 30, grid: [3, 1],
  desc: 'A claw hammer, a yellow folding rule and a tube of blueprint sheets strapped together with a belt. Take it in hand to build: the ghost, the shelves, the salvage. Put it away to stop.',
  model: (mb) => {
    // the blueprint tube under the strap
    rodX(mb, -0.2, 0.2, 0.04, 0.035, 0.035, 10, { sides: 'cardboard', top: D_PLAN, bottom: D_PLAN }, { color: 0xd8c8a0 });
    mb.push().translate(0.02, 0.04, 0).rotateZ(Math.PI / 2); mb.cylinder(0, -0.04, 0, 0.0365, 0.08, 10, D_TUBE_LABEL, { caps: false }); mb.pop();
    for (const x of [-0.205, 0.205]) rodX(mb, x - 0.012, x + 0.012, 0.04, 0.039, 0.039, 10, 'metal_dark');
    // the folding rule along its side, half open
    mb.push().translate(-0.05, 0.08, 0.03).rotateY(0.08);
    mb.box(0, 0, 0, 0.26, 0.006, 0.022, D_RULE, { fit: true });
    mb.push().translate(0.12, 0.004, 0).rotateY(-0.5); mb.box(0.06, 0, 0, 0.13, 0.006, 0.022, D_RULE, { fit: true }); mb.pop();
    mb.cylinder(0.12, 0.004, 0, 0.006, 0.008, 6, 'metal_brass');
    mb.pop();
    // the hammer tucked under the belt
    mb.push().translate(0.0, 0.06, -0.035).rotateY(0.25);
    rodX(mb, -0.16, 0.06, 0.0, 0.012, 0.011, 6, 'wood_dark', { color: 0xa8784a });
    mb.box(0.075, -0.012, -0.03, 0.03, 0.026, 0.085, 'metal_grey', { color: 0x9aa0a6 });
    mb.pop();
    // two belt straps with buckles
    for (const x of [-0.11, 0.11]) {
      mb.push().translate(x, 0.04, 0).rotateX(Math.PI / 2); mb.cylinder(0, -0.006, 0, 0.042, 0.012, 12, 'q_jersey', { caps: false, color: 0x5a3a22 }); mb.pop();
      mb.box(x, 0.078, 0.005, 0.018, 0.006, 0.02, 'metal_brass');
    }
  },
});
defItem({
  key: 'blueprint_sheet', name: 'Rolled Blueprint', cat: 'literature', weight: 0.08, tags: ['paper', 'blueprint', 'tinder'], value: 12, grid: [2, 1], burn: 0.05,
  literature: { pages: 18, boredom: -4 },
  desc: 'A cyan-print sheet rolled tight with a rubber band: somebody\'s drawing of something they built down here. Read it and the build kit has the plan.',
  model: (mb) => {
    rodX(mb, -0.15, 0.15, 0.022, 0.02, 0.02, 10, { sides: D_PLAN, top: 'paper', bottom: 'paper' }, { color: 0xffffff });
    mb.push().translate(0.155, 0.022, 0).rotateZ(-0.3); mb.box(0.03, -0.001, -0.02, 0.06, 0.002, 0.04, D_PLAN, { fit: true }); mb.pop();
    mb.push().translate(-0.04, 0.022, 0).rotateZ(Math.PI / 2); mb.cylinder(0, -0.004, 0, 0.0215, 0.008, 10, 'rubber_black', { caps: false, color: 0xb83a2a }); mb.pop();
  },
});
defItem({
  key: 'blueprint_tube', name: 'Sealed Plan Tube', cat: 'literature', weight: 0.3, tags: ['paper', 'blueprint'], value: 28, grid: [3, 1],
  literature: { pages: 30, boredom: -6 },
  desc: 'A cardboard tube with a Meridian works stamp and wax on both caps. Inside: machine drawings, two or three sheets. Read it.',
  model: (mb) => {
    rodX(mb, -0.22, 0.22, 0.035, 0.032, 0.032, 12, { sides: 'cardboard', top: 'metal_dark', bottom: 'metal_dark' }, { color: 0xc8b088 });
    mb.push().translate(0.0, 0.035, 0).rotateZ(Math.PI / 2); mb.cylinder(0, -0.05, 0, 0.0335, 0.1, 12, D_TUBE_LABEL, { caps: false }); mb.pop();
    for (const x of [-0.225, 0.225]) { rodX(mb, x - 0.015, x + 0.015, 0.035, 0.036, 0.036, 12, 'metal_dark'); mb.sphere(x + (x < 0 ? -0.016 : 0.016), 0.035, 0, 0.012, 6, 4, 'plastic_red', { color: 0xa8281e, sy: 0.6 }); }
  },
});

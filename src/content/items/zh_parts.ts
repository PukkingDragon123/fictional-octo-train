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

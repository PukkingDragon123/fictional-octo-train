// Items stream — FLUID CONTAINERS & COOKWARE. fluidCap in litres (1 L = 1 kg
// added to the item weight). `fluids` omitted = any drinkable/water-like fluid.
// Tags: 'fluidcontainer' on everything that holds fluid; 'boiler' on vessels
// that can sit on a fire/stove to boil (pot, kettle, empty can).
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txtC, stamp, dashes, band, bottle, rodX, rodZ, ph, MB, PixelCanvas } from './_kit';
import { IN, pot, mug, bowl, interiorTex } from './_vessels';
import { BOTTLE_TEX, S_PBOTTLE, waterBottle } from './drink';

const S_CANVAS = tex('i_canvas', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 2 === 0 ? 0xc8c8c0 : (ph(x, y, 3) < 0.2 ? 0xb4b4ac : 0xbebeb6)));
}, true);
const D_MUG = decal('i_mug_decal', 16, 8, (pc) => {
  pc.wrap = true;
  pc.fill(0xf0ece4);
  band(pc, 0, 1, 0x2a5a9a);
  // little Meridian Institute logo (an "M" in a ring) on the camera-facing side
  const cx = 2;
  for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; pc.set(Math.round(cx + Math.cos(t) * 2.5), Math.round(4 + Math.sin(t) * 2.5), 0x2a5a9a); }
  pc.set(cx - 1, 3, 0x2a5a9a); pc.set(cx + 1, 3, 0x2a5a9a); pc.set(cx, 4, 0x2a5a9a); pc.set(cx - 1, 4, 0x2a5a9a); pc.set(cx + 1, 4, 0x2a5a9a);
});
const S_GASCAN = tex('i_gascan_side', 12, 12, (pc) => {
  const R = rp(0xc8302a, 5, 0.4);
  pc.fill(R[2]);
  pc.strokeRect(1, 1, 10, 10, R[1]); pc.strokeRect(2, 2, 8, 8, R[3]);
  pc.line(2, 2, 9, 9, R[1]); pc.line(9, 2, 2, 9, R[1]);
  pc.hline(0, 11, 0, R[4]);
});
const D_GASLABEL = decal('i_gascan_label', 10, 6, (pc) => { pc.fill(0xf0c419); txtC(pc, 'GAS', 5, 0, 0x1e1e1e); pc.hline(0, 9, 5, 0x1e1e1e); });
const S_THERMOS = tex('i_thermos', 12, 16, (pc) => {
  pc.fill(0x3a6a4a);
  for (let y = 0; y < 16; y++) { pc.set(1, y, 0x5a8a6a); pc.set(2, y, 0x4a7a5a); pc.set(9, y, 0x2a4a34); }
  pc.rect(0, 0, 12, 2, 0xc8ccd0); pc.rect(0, 14, 12, 2, 0xc8ccd0); pc.hline(0, 11, 1, 0x9aa0a6);
  dashes(pc, 3, 7, 5, 0xe8d8a0, 3);
}, true);
const S_BEAKER = tex('i_beaker', 12, 12, (pc) => {
  pc.fill(0xd8e6ea);
  for (let y = 3; y < 12; y += 2) pc.hline(1, 3, y, 0x6a8a9a);
  for (let y = 0; y < 12; y++) pc.set(6, y, 0xffffff);
  pc.rect(0, 8, 12, 4, 0xa8d0e0);
}, true);
const L_BLEACH = decal('i_bleach_label', 10, 10, (pc) => { pc.fill(0x2a6ac8); pc.rect(1, 1, 8, 4, 0xf6f6f2); txtC(pc, '', 5, 1, 0); dashes(pc, 2, 2, 6, 0x2a6ac8, 2); dashes(pc, 2, 3, 5, 0x2a6ac8, 3); pc.rect(3, 6, 4, 3, 0xf0c419); pc.set(5, 7, 0x1e1e1e); });
const IN_JUG = interiorTex('i_in_jug', { rim: 0xe8eef2, wall: 0xc8d4dc, size: 8 });

// ---------------------------------------------------------------- bottles & jugs
defItem({
  key: 'water_bottle', name: 'Water Bottle', cat: 'container', weight: 0.03, fluidCap: 0.5, startFluid: ['water', 0.5],
  tags: ['fluidcontainer', 'bottle'], desc: 'Half a litre. Refill it at any tap — boil anything that is not from a tap.',
  model: waterBottle,
});
defItem({
  key: 'water_jug', name: 'Water Jug', cat: 'container', weight: 0.15, fluidCap: 4, startFluid: ['water', 4],
  tags: ['fluidcontainer', 'jug'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.15, 0.24, 0.15, S_PBOTTLE, { color: 0xe6eef2, fit: true });
    mb.cylinder(0, 0.24, 0, 0.075, 0.03, 8, S_PBOTTLE, { color: 0xe6eef2, fit: true, rTop: 0.025 });
    mb.cylinder(0, 0.27, 0, 0.02, 0.02, 8, { sides: T.cap, top: IN_JUG }, { color: 0x2a6ac8, fit: true });
    mb.box(0.055, 0.17, 0, 0.03, 0.08, 0.035, S_PBOTTLE, { color: 0xdce6ec, fit: true });
    mb.panel(-0.06, 0.0761, 0.06, 0.0761, 0.06, 0.15, BOTTLE_TEX.L_WATER, { fit: true });
  },
});
defItem({
  key: 'empty_bottle', name: 'Empty Glass Bottle', cat: 'container', weight: 0.3, fluidCap: 0.5,
  tags: ['fluidcontainer', 'bottle', 'glass'], desc: 'Holds half a litre of anything. Also the start of a molotov.',
  model: (mb) => bottle(mb, { r: 0.03, h: 0.24, neckR: 0.011, neckH: 0.06, shoulder: 0.04, body: T.glass, bodyColor: 0x5a9a6a }),
});
defItem({
  key: 'soda_bottle_2l', name: '2L Soda Bottle', cat: 'container', weight: 0.05, fluidCap: 2, startFluid: ['soda', 2],
  tags: ['fluidcontainer', 'bottle', 'soda'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.05, 0.03, 8, S_PBOTTLE, { color: 0x6a3a22, fit: true, rTop: 0.054 });
    bottle(mb, { r: 0.054, h: 0.31, neckR: 0.014, neckH: 0.03, shoulder: 0.07, body: S_PBOTTLE, bodyColor: 0x6a3a22, label: BOTTLE_TEX.L_2L, labelY: 0.1, labelH: 0.07, cap: 0xc8202a, capH: 0.018 });
  },
});
defItem({
  key: 'canteen', name: 'Canteen', cat: 'container', weight: 0.45, fluidCap: 1,
  tags: ['fluidcontainer', 'camping'],
  model: (mb) => {
    mb.push().translate(0, 0, 0);
    mb.box(0, 0, 0, 0.13, 0.17, 0.065, S_CANVAS, { color: 0x6a7448, uvScale: 3 });
    mb.box(0, 0.17, 0, 0.11, 0.015, 0.06, S_CANVAS, { color: 0x5a6438, uvScale: 3 });
    mb.cylinder(0, 0.185, 0, 0.016, 0.022, 8, T.cap, { color: 0x2a2a2a, fit: true });
    mb.box(0, 0.06, 0.034, 0.1, 0.012, 0.004, T.rubber);
    mb.pop();
  },
});
defItem({
  key: 'thermos', name: 'Thermos', cat: 'container', weight: 0.5, fluidCap: 0.75,
  tags: ['fluidcontainer', 'thermos'], desc: 'Keeps a drink hot for hours.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 0.22, 10, S_THERMOS, { fit: true });
    mb.cylinder(0, 0.22, 0, 0.042, 0.05, 10, T.cap, { color: 0xc8ccd0, fit: true });
    mb.box(0.045, 0.08, 0, 0.012, 0.09, 0.016, T.rubber);
  },
});
defItem({
  key: 'beaker', name: 'Lab Beaker', cat: 'container', weight: 0.15, fluidCap: 0.4,
  tags: ['fluidcontainer', 'lab', 'glass'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 0.1, 10, { sides: S_BEAKER, top: IN.cup, bottom: T.glass }, { fit: true });
    mb.box(0.04, 0.094, 0, 0.012, 0.006, 0.012, T.glass, { color: 0xd8e6ea });
  },
});
defItem({
  key: 'bleach', name: 'Bottle of Bleach', cat: 'container', weight: 0.1, fluidCap: 1, startFluid: ['bleach', 1], fluids: ['bleach', 'water', 'tainted'],
  tags: ['fluidcontainer', 'bleach', 'cleaning'],
  desc: 'Poisonous to drink. A few drops make a litre of dirty water safe.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.1, 0.2, 0.065, T.plastic, { color: 0xf2f2ee, fit: true });
    mb.cylinder(-0.025, 0.2, 0, 0.018, 0.03, 8, T.cap, { color: 0x2a6ac8, fit: true });
    mb.box(0.03, 0.12, 0, 0.025, 0.07, 0.04, T.plastic, { color: 0xe6e6e2, fit: true });
    mb.panel(-0.045, 0.0331, 0.045, 0.0331, 0.03, 0.13, L_BLEACH, { fit: true });
  },
});

// ---------------------------------------------------------------- cookware
defItem({
  key: 'pot', name: 'Cooking Pot', cat: 'container', weight: 1.2, fluidCap: 3,
  tags: ['pot', 'boiler', 'fluidcontainer', 'cookware'],
  desc: 'Three litres. Boil water, make stew, cook rice.',
  model: (mb) => pot(mb, IN.potEmpty),
});
defItem({
  key: 'kettle', name: 'Kettle', cat: 'container', weight: 0.9, fluidCap: 1.5,
  tags: ['kettle', 'boiler', 'fluidcontainer', 'cookware'],
  model: (mb) => {
    const red = 0xc8402a;
    mb.cylinder(0, 0, 0, 0.085, 0.07, 10, T.white, { color: red, fit: true });
    mb.cylinder(0, 0.07, 0, 0.085, 0.05, 10, T.white, { color: red, fit: true, rTop: 0.045 });
    mb.cylinder(0, 0.12, 0, 0.045, 0.006, 10, T.tin, { fit: true });
    mb.cylinder(0, 0.126, 0, 0.012, 0.012, 6, T.black, { fit: true });
    // spout toward -x, tilted up
    mb.push().translate(-0.07, 0.04, 0).rotateZ(0.9); mb.cylinder(0, 0, 0, 0.014, 0.08, 6, T.white, { color: red, rTop: 0.008 }); mb.pop();
    // handle arc
    mb.box(0.03, 0.115, 0, 0.012, 0.06, 0.014, T.black);
    mb.box(-0.03, 0.115, 0, 0.012, 0.06, 0.014, T.black);
    mb.box(0, 0.17, 0, 0.072, 0.014, 0.016, T.black);
  },
});
defItem({
  key: 'frying_pan', name: 'Frying Pan', cat: 'weapon', weight: 1.4,
  tags: ['pan', 'cookware'],
  weapon: { kind: 'blunt', dmg: [5, 8], range: 1.1, speed: 1.2, endurance: 0.05, crit: 0.1, knock: 0.5, durability: 100, noise: 8 },
  desc: 'Cooks eggs. Rings like a bell on contact.',
  model: (mb) => {
    mb.cylinder(-0.06, 0, 0, 0.11, 0.035, 12, { sides: T.black, top: IN.pan, bottom: T.black }, { fit: true, rTop: 0.12 });
    mb.box(0.13, 0.02, 0, 0.17, 0.016, 0.026, T.black);
    mb.box(0.05, 0.012, 0, 0.03, 0.012, 0.02, T.metal);
  },
});
defItem({
  key: 'mug', name: 'Mug', cat: 'container', weight: 0.3, fluidCap: 0.3,
  tags: ['mug', 'fluidcontainer'], desc: 'Meridian Institute logo on the side. Faded from the dishwasher.',
  model: (mb) => mug(mb, IN.mugEmpty, 0xf0ece4, { decal: D_MUG }),
});
defItem({
  key: 'bowl', name: 'Bowl', cat: 'container', weight: 0.3, fluidCap: 0.5,
  tags: ['bowl', 'fluidcontainer'],
  model: (mb) => bowl(mb, IN.bowlEmpty, 0xe8e2d6),
});
defItem({
  key: 'bucket', name: 'Bucket', cat: 'container', weight: 1.0, fluidCap: 10,
  tags: ['bucket', 'fluidcontainer'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.12, 0.27, 12, { sides: T.metal, top: IN.bucket, bottom: T.metal }, { fit: true, rTop: 0.14, color: 0xc8ccc8 });
    for (const y of [0.06, 0.2]) mb.cylinder(0, y, 0, 0.12 + y * 0.075, 0.008, 12, T.metal, { fit: true, color: 0xa8aca8, caps: false });
    // wire handle
    mb.box(0.142, 0.22, 0, 0.006, 0.06, 0.006, T.metal);
    mb.box(-0.142, 0.22, 0, 0.006, 0.06, 0.006, T.metal);
    mb.push().translate(0, 0.33, 0); mb.box(0, 0, 0, 0.26, 0.006, 0.006, T.metal); mb.box(0, -0.004, 0, 0.06, 0.014, 0.014, 'i_wood'); mb.pop();
    mb.box(0.135, 0.28, 0, 0.02, 0.05, 0.006, T.metal);
    mb.box(-0.135, 0.28, 0, 0.02, 0.05, 0.006, T.metal);
  },
});
defItem({
  key: 'watering_can', name: 'Watering Can', cat: 'container', weight: 0.8, fluidCap: 5,
  tags: ['wateringcan', 'fluidcontainer', 'farming'],
  model: (mb) => {
    const g = 0x3a8a4a;
    mb.cylinder(0.02, 0, 0, 0.09, 0.2, 10, T.plastic, { color: g, fit: true });
    mb.push().translate(-0.06, 0.03, 0).rotateZ(0.75); mb.cylinder(0, 0, 0, 0.014, 0.24, 6, T.plastic, { color: g, rTop: 0.012 }); mb.pop();
    mb.push().translate(-0.225, 0.2, 0).rotateZ(0.75); mb.cylinder(0, 0, 0, 0.012, 0.025, 8, T.plastic, { color: 0x2a6a3a, rTop: 0.026 }); mb.pop();
    mb.box(0.02, 0.25, 0, 0.1, 0.016, 0.022, T.plastic, { color: g });
    mb.box(0.085, 0.13, 0, 0.016, 0.13, 0.022, T.plastic, { color: g });
  },
});
defItem({
  key: 'gas_can', name: 'Gas Can', cat: 'container', weight: 1.5, fluidCap: 10, startFluid: ['gasoline', 4], fluids: ['gasoline'],
  tags: ['gascan', 'fuel', 'fluidcontainer'],
  desc: 'Ten litres. For generators, molotovs and torches. Do not drink.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.16, 0.28, 0.25, { sides: S_GASCAN, top: T.plastic, bottom: T.plastic }, { fit: true, color: 0xffffff });
    mb.box(0, 0.28, -0.05, 0.03, 0.04, 0.12, T.plastic, { color: 0xb8282a });
    mb.box(0, 0.32, -0.05, 0.03, 0.014, 0.14, T.plastic, { color: 0xb8282a });
    mb.push().translate(0, 0.27, 0.09).rotateX(0.5); mb.cylinder(0, 0, 0, 0.018, 0.07, 8, T.plastic, { color: 0x2a2a2a }); mb.cylinder(0, 0.07, 0, 0.012, 0.012, 8, T.cap, { color: 0xf0c419 }); mb.pop();
    mb.panel(-0.06, 0.1261, 0.06, 0.1261, 0.12, 0.2, D_GASLABEL, { fit: true });
  },
});

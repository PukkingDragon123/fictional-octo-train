// The studyable anomalies' fixtures (src/world/anomalies: data.ts lists them,
// place.ts puts them in the levels, index.ts runs them): the drain where the
// rain goes up (the Poolrooms), the Noon Lamp (14 Alder Lane), the payphone
// that calls you back (Parking Level P∞), the snow globe with a small Level 0
// inside (Westgate Mall), the swallowing carpet whorl (Level 0) and the
// patient office chair (Level 4). What moves (the rising beads, the glass
// dome, the small figure, the breathing pucker, the turning seat) is drawn by
// src/world/anomalies/fx.ts over these static bases.
// Texture prefix: an_
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, ph, tileFbm, text, textC } from './b_common';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { lathe, blob, tube, surf, type V3 } from '../../creatures/kit/anomalies';
import { chamferBox } from './zx_dimensions';

const T = ['an', 'anomaly', 'fixed'];
const P = (x: number, y: number, z: number): V3 => [x, y, z];

// ---------------------------------------------------------------- textures
addTextureModule(() => {
  const A = atlas();
  // a round cast-iron drain grate in a ring of wet tile: radial slots, rust in the gaps, beads of water standing UP
  A.add('an_grate', 32, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x4a4e52, 6, { spread: 0.5 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d > 15.5) { pc.set(x, y, mixHex(0xd8e8ec, 0xa8c8d0, ph(x >> 2, y >> 2, 901))); continue; }
      let c = R[3];
      const slot = Math.abs(Math.sin(a * 8)) < 0.28 && d > 4 && d < 13.5;
      if (slot) c = d > 12 ? R[0] : 0x0e1416;
      if (d > 13.5) c = R[4];
      if (d < 3.5) c = R[2];
      if (!slot && ph(x, y, 902) < 0.1) c = mixHex(c, 0x8a4a2a, 0.5);
      pc.set(x, y, c);
    }
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 5 + (i % 4) * 2; const x = 15.5 + Math.cos(a) * r, y = 15.5 + Math.sin(a) * r; pc.set(x, y, 0xe8f8ff); pc.blend(x, y + 1, 0x9ad8f0, 0.6); }
  });
  // parchment drum shade with a child's crayon sun on it
  A.add('an_shade', 32, 16, (pc) => {
    const R = makeRamp(0xf0dcb0, 5, { spread: 0.25 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 16, 4, 2, 911) - 0.5) * 0.25, 0.4);
    for (let x = 0; x < 32; x++) { pc.set(x, 0, 0xa8844a); pc.set(x, 15, 0xa8844a); }
    const cx = 16, cy = 8;
    for (let a = 0; a < Math.PI * 2; a += 0.12) { pc.blend(cx + Math.cos(a) * 3.5, cy + Math.sin(a) * 3.5, 0xf0a020, 0.9); }
    pc.ellipseBlend(cx, cy, 3, 3, 0xf8d040, 0.8);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; pc.line(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 4.5, cx + Math.cos(a) * 7, cy + Math.sin(a) * 6, 0xe88a20); }
    pc.set(cx - 1, cy - 1, 0x3a2a1a); pc.set(cx + 1, cy - 1, 0x3a2a1a); pc.line(cx - 1, cy + 1, cx + 1, cy + 1, 0x3a2a1a);
  });
  // the payphone's face: handset recess, keypad, coin slot, instruction card
  A.add('an_phone_face', 24, 40, (pc) => {
    const R = makeRamp(0x8a9098, 6, { spread: 0.4 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 24, 40, 3, 4, 921) - 0.5) * 0.2, 0.5);
    pc.strokeRect(0, 0, 24, 40, R[1]);
    pc.rect(3, 3, 18, 8, 0xf2eee0); text(pc, 'LOCAL', 4, 3, 0x2a2a30); text(pc, '25C', 4, 7, 0xc8302a);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const x = 5 + c * 5, y = 14 + r * 5; pc.rect(x, y, 4, 4, R[5]); pc.set(x + 1, y + 1, 0x2a2a30); pc.set(x + 2, y + 1, 0x2a2a30); pc.hline(x, x + 3, y + 3, R[2]); }
    pc.rect(9, 35, 6, 2, 0x101214); pc.hline(8, 15, 34, R[5]);
    for (let y = 11; y < 40; y++) if (ph(0, y, 922) < 0.3) pc.blend(1, y, 0x6a3a2a, 0.4);
  });
  A.add('an_phone_sign', 32, 8, (pc) => { pc.fill(0x1e3a6a); textC(pc, 'PHONE', 16, 1, 0xf2eee0); pc.hline(0, 31, 0, 0x4a6a9a); pc.hline(0, 31, 7, 0x0e1a34); });
  A.add('an_globe_plaque', 32, 10, (pc) => { pc.fill(0xc8a050); pc.strokeRect(0, 0, 32, 10, 0x8a6a2a); textC(pc, 'LEVEL 0', 16, 2, 0x3a2a10); pc.hline(1, 30, 1, 0xf0d890); });
  // the throat of the carpet whorl: dark, wet, a little red, glossy
  A.add('an_maw', 16, 16, (pc) => {
    const R = makeRamp(0x5a2a22, 6, { spread: 0.5 });
    pc.fillRamp(R, (x, y) => 0.4 + (tileFbm(x, y, 16, 16, 3, 3, 931) - 0.5) * 0.6, 0.6);
    for (let i = 0; i < 5; i++) pc.blend(Math.floor(ph(i, 1, 932) * 16), Math.floor(ph(i, 2, 932) * 16), 0xf0c8b0, 0.7);
  });
  // tired office upholstery: blue-grey tweed worn shiny where something has sat for years
  A.add('an_upholstery', 32, 32, (pc) => {
    const R = makeRamp(0x4a5a72, 6, { spread: 0.4 });
    pc.each((x, y) => { const w = ((x + y) & 3) === 0 ? 1 : 0; pc.set(x, y, R[2 + w + (ph(x >> 1, y >> 1, 941) < 0.18 ? 1 : 0)]); });
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) { const d = Math.hypot(x - 16, y - 16) / 8; if (d < 1) pc.blend(x, y, 0x8a9ab0, 0.3 * (1 - d)); }
  });
});

// ---------------------------------------------------------------- Upward Rain (the Poolrooms)
defObj({
  key: 'an_updrip', name: 'Drain 4', w: 2, d: 2, height: 0.16, block: 'none', movable: 0, hp: 99999, sound: 'metal', noShadow: true,
  tags: [...T, 'pool', 'water'],
  desc: 'A floor drain in a sump of pool tile. Water beads on the grate and then falls up, into a pool clinging to the ceiling.',
  model: (mb) => {
    // the sump: a rim of bullnose tile round a shallow square dish
    for (const s of [-1, 1]) {
      chamferBox(mb, 0, 0, s * 0.88, 1.9, 0.09, 0.16, 0.03, 'tile_pool', { color: 0xf4fafc });
      chamferBox(mb, s * 0.88, 0, 0, 0.16, 0.09, 1.6, 0.03, 'tile_pool', { color: 0xf4fafc });
    }
    mb.box(0, 0.005, 0, 1.62, 0.02, 1.62, 'tile_pool_blue', { color: 0xc8e4ec });
    // the grate, set in a bevelled iron ring
    lathe(mb, [0, 0.02, 0], [[0.52, 0], [0.56, 0.02], [0.53, 0.05], [0.46, 0.05], [0.44, 0.03]], 24, 'metal_dark', { color: 0x6a6e72 });
    mb.push(); mb.translate(0, 0.045, 0); mb.flat(0, 0, 0, 0.9, 0.9, 'an_grate'); mb.pop();
    // water beads standing upright on the iron, stretched upward like they are being pulled
    for (let k = 0; k < 14; k++) {
      const a = k * 2.39, r = 0.12 + (k % 5) * 0.07, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.03 + (k % 3) * 0.025;
      tube(mb, [P(x, 0.05, z), P(x, 0.05 + h * 0.6, z), P(x, 0.05 + h, z)], (t) => 0.014 * (1 - t * 0.6), 5, 'glass', { color: 0xd8f4ff, emissive: 0.25, capEnd: true });
    }
    // a skin of water round the grate
    blob(mb, [0, 0.02, 0], [0.7, 0.012, 0.7], 20, 3, 'tile_pool_deep', { color: 0x9ad0e0, v0: 0, v1: 0.5, emissive: 0.1 });
  },
});

// ---------------------------------------------------------------- the Noon Lamp (14 Alder Lane)
defObj({
  key: 'an_noon_lamp', name: 'Floor Lamp', height: 1.75, block: 'low', movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'light', 'house'],
  desc: 'An old brass floor lamp with a parchment shade. Somebody drew a sun on the shade in crayon. Under it, it is noon.',
  light: { color: 0xfff4dc, intensity: 1.55, radius: 6.8, y: 1.55, kind: 'lamp', power: false },
  model: (mb) => {
    // weighted brass foot, a stem with a knuckle, the switch collar
    lathe(mb, [0, 0, 0], [[0, 0], [0.2, 0], [0.21, 0.02], [0.18, 0.05], [0.1, 0.08], [0.04, 0.12], [0.03, 0.14]], 18, 'metal_brass', { color: 0xe0b860 });
    tube(mb, [P(0, 0.12, 0), P(0, 0.7, 0), P(0.01, 1.2, 0), P(0, 1.42, 0)], 0.015, 7, 'metal_brass', { color: 0xd8b058 });
    lathe(mb, [0, 0.66, 0], [[0, 0], [0.026, 0], [0.03, 0.02], [0.026, 0.05], [0, 0.05]], 10, 'metal_brass', { color: 0xc8a048 });
    lathe(mb, [0, 1.36, 0], [[0, 0], [0.035, 0], [0.04, 0.03], [0.03, 0.08], [0.02, 0.1], [0, 0.1]], 12, 'metal_brass', { color: 0xe8c070 });
    tube(mb, [P(0.03, 1.4, 0), P(0.06, 1.38, 0.01)], 0.006, 4, 'metal_brass', { color: 0xc8a048, capEnd: true });
    // the bulb: a pearl globe, and a filament shaped like a drawn sun
    blob(mb, [0, 1.52, 0], [0.065, 0.075, 0.065], 12, 8, 'white', { color: 0xfffaf0, emissive: 1.6 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; tube(mb, [P(Math.cos(a) * 0.02, 1.53 + Math.sin(a) * 0.02, 0.0), P(Math.cos(a) * 0.04, 1.53 + Math.sin(a) * 0.04, 0.0)], 0.003, 3, 'white', { color: 0xffe080, emissive: 2 }); }
    // the drum shade, flared, a little bowed
    lathe(mb, [0, 1.38, 0], [[0.27, 0], [0.25, 0.08], [0.21, 0.2], [0.18, 0.3]], 20, 'an_shade', { color: 0xffffff, emissive: 0.45, fit: true, inside: null });
    lathe(mb, [0, 1.38, 0], [[0.18, 0.3], [0.21, 0.2], [0.25, 0.08], [0.27, 0]], 20, 'an_shade', { color: 0xfff0d0, emissive: 0.7, fit: true, inside: null });
    for (const y of [1.38, 1.68]) { const r = y < 1.5 ? 0.272 : 0.182; tube(mb, Array.from({ length: 21 }, (_, i) => P(Math.cos(i / 20 * Math.PI * 2) * r, y, Math.sin(i / 20 * Math.PI * 2) * r)), 0.006, 4, 'metal_brass', { color: 0xb89040 }); }
  },
});

// ---------------------------------------------------------------- the Callback (Parking Level P∞)
defObj({
  key: 'an_payphone', name: 'Payphone', height: 2.2, block: 'solid', tall: true, movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'phone_anomaly', 'parking'],
  desc: 'A payphone on a concrete island, under a steel hood. The handset is warm. The coin box is full.',
  model: (mb) => {
    chamferBox(mb, 0, 0, 0, 0.9, 0.14, 0.9, 0.04, 'concrete', { color: 0xc8c4bc });
    lathe(mb, [0, 0.14, -0.08], [[0, 0], [0.09, 0], [0.08, 0.04], [0.055, 0.1], [0.055, 1.05], [0, 1.05]], 12, 'metal_grey', { color: 0x7a8088 });
    chamferBox(mb, 0, 1.0, -0.06, 0.4, 0.66, 0.22, 0.03, 'metal_grey', { color: 0x9aa0a8 });
    mb.box(0, 1.02, 0.052, 0.34, 0.6, 0.01, 'an_phone_face', { fit: true });
    // the hood: a curved steel shell over the box
    surf(mb, 6, 4, (i, j) => { const a = (i / 6 - 0.5) * 2.2, t = j / 4; return [Math.sin(a) * 0.36, 1.72 + Math.cos(a) * 0.08 - t * 0.06, -0.2 + Math.cos(a) * 0.1 + t * 0.42]; }, (i, j) => [i / 3, j / 2], 'metal_grey', { inside: null, flip: true, color: 0x7a8088 });
    surf(mb, 6, 4, (i, j) => { const a = (i / 6 - 0.5) * 2.2, t = j / 4; return [Math.sin(a) * 0.36, 1.725 + Math.cos(a) * 0.08 - t * 0.06, -0.2 + Math.cos(a) * 0.1 + t * 0.42]; }, (i, j) => [i / 3, j / 2], 'metal_grey', { inside: null, color: 0x8a9098 });
    for (const s of [-1, 1]) mb.box(s * 0.33, 1.08, 0.0, 0.025, 0.66, 0.36, 'metal_grey', { color: 0x6a7078 });
    mb.box(0, 1.82, -0.06, 0.6, 0.15, 0.02, 'an_phone_sign', { fit: true, emissive: 0.6 });
    // the handset on its cradle, and the armoured cord looping down
    chamferBox(mb, -0.25, 1.22, 0.02, 0.06, 0.14, 0.08, 0.015, 'metal_dark', { color: 0x3a3e44 });
    tube(mb, [P(-0.27, 1.06, 0.09), P(-0.28, 1.2, 0.1), P(-0.27, 1.36, 0.09)], 0.022, 7, 'plastic_black', { color: 0x2a2c30 });
    blob(mb, [-0.27, 1.06, 0.09], [0.035, 0.03, 0.04], 8, 5, 'plastic_black', { color: 0x2a2c30 });
    blob(mb, [-0.27, 1.36, 0.09], [0.035, 0.03, 0.04], 8, 5, 'plastic_black', { color: 0x2a2c30 });
    const cord: V3[] = []; for (let i = 0; i <= 18; i++) { const t = i / 18; cord.push([-0.27 + Math.sin(t * 22) * 0.025, 1.06 - Math.sin(t * Math.PI) * 0.3, 0.09 + Math.cos(t * 22) * 0.025 + t * 0.02]); }
    tube(mb, cord, 0.009, 5, 'metal_grey', { color: 0xb0b4b8 });
  },
});

// ---------------------------------------------------------------- the Small Level (Westgate Mall)
defObj({
  key: 'an_snow_globe', name: 'Snow Globe', w: 2, d: 2, height: 2.0, block: 'solid', tall: true, movable: 0, hp: 99999, sound: 'glass',
  tags: [...T, 'mall', 'globe'],
  desc: 'A snow globe on a turned wooden plinth, taller than you. Inside: a small yellow room, carpet and all, and somebody in it.',
  model: (mb) => {
    // the turned plinth and its brass ring
    lathe(mb, [0, 0, 0], [[0, 0], [0.78, 0], [0.8, 0.04], [0.74, 0.12], [0.66, 0.2], [0.62, 0.6], [0.7, 0.68], [0.74, 0.76], [0.7, 0.82], [0, 0.82]], 28, 'wood_dark', { color: 0x8a5a34 });
    lathe(mb, [0, 0.8, 0], [[0, 0], [0.74, 0], [0.76, 0.03], [0.72, 0.07], [0, 0.07]], 28, 'metal_brass', { color: 0xe0b860 });
    mb.push(); mb.translate(0, 0.42, 0.635); mb.rotateX(-0.08); mb.box(0, 0, 0, 0.5, 0.15, 0.015, 'an_globe_plaque', { fit: true }); mb.pop();
    // the small Level 0 inside: a disc of carpet, two walls of yellow paper meeting in a corner, a doorway, a lit panel
    mb.push(); mb.translate(0, 0.87, 0);
    lathe(mb, [0, 0, 0], [[0, 0], [0.64, 0], [0.62, 0.05], [0, 0.06]], 24, 'carpet_yellow', { color: 0xf0e0a0 });
    mb.box(-0.1, 0.06, -0.3, 0.8, 0.5, 0.03, 'wall_yellow', { uvScale: 2.5 });
    mb.box(-0.48, 0.06, 0.02, 0.03, 0.5, 0.62, 'wall_yellow', { uvScale: 2.5 });
    mb.box(0.12, 0.06, -0.28, 0.14, 0.3, 0.01, 'plastic_black', { color: 0x2a2010 });
    mb.box(-0.1, 0.55, -0.12, 0.22, 0.012, 0.06, 'white', { emissive: 1.4, color: 0xfff6d0 });
    tube(mb, [P(-0.08, 0.56, -0.29), P(-0.08, 0.56, -0.12)], 0.004, 3, 'metal_grey');
    // drifts of snow banked against the glass
    for (let k = 0; k < 9; k++) { const a = k * 0.72 + 0.3, r = 0.52; blob(mb, [Math.cos(a) * r, 0.05, Math.sin(a) * r], [0.12, 0.05, 0.09], 8, 4, 'white', { color: 0xf8f8ff, v0: 0, v1: 0.5 }); }
    mb.pop();
  },
});

// ---------------------------------------------------------------- the Swallowing Patch (Level 0)
defObj({
  key: 'an_carpet_mouth', name: 'Carpet Whorl', w: 2, d: 2, height: 0.24, block: 'none', movable: 0, hp: 99999, sound: 'fabric', noShadow: true,
  tags: [...T, 'carpet', 'organic'],
  desc: 'The carpet here rises into a soft lip around a damp middle, like a navel or a mouth. It is warm. Sometimes it swallows.',
  model: (mb) => {
    // the lip: carpet rising off the floor into a soft rim and rolling over into the throat
    lathe(mb, [0, 0, 0], [[1.0, 0], [0.92, 0.045], [0.8, 0.14], [0.66, 0.24], [0.54, 0.27], [0.44, 0.22], [0.35, 0.11], [0.28, 0.02], [0.22, -0.04]], 32, 'carpet_yellow', { color: 0xdcc488, inside: null, flip: true });
    // the pile drawn in toward it: a low ring of tension round the rim
    tube(mb, Array.from({ length: 33 }, (_, i) => P(Math.cos(i / 32 * Math.PI * 2) * 0.86, 0.04, Math.sin(i / 32 * Math.PI * 2) * 0.86)), 0.03, 5, 'carpet_yellow', { color: 0xd4bc80 });
    // pleats on the inner slope, puckered into the throat
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + 0.1, a2 = a + 0.12;
      tube(mb, [P(Math.cos(a) * 0.6, 0.255, Math.sin(a) * 0.6), P(Math.cos(a + 0.05) * 0.47, 0.22, Math.sin(a + 0.05) * 0.47), P(Math.cos(a2) * 0.34, 0.09, Math.sin(a2) * 0.34), P(Math.cos(a2 + 0.05) * 0.26, 0.0, Math.sin(a2 + 0.05) * 0.26)], (t) => 0.03 * (1 - t * 0.4), 6, 'carpet_yellow', { color: k % 2 ? 0xc8ae6c : 0xd8c080 });
    }
    // the throat: dark, wet, a little red
    lathe(mb, [0, -0.04, 0], [[0.28, 0.04], [0.2, 0.0], [0.1, -0.02], [0, -0.03]], 20, 'an_maw', { color: 0xffffff, inside: null, flip: true });
    blob(mb, [0.12, 0.0, -0.08], [0.05, 0.012, 0.03], 8, 3, 'an_maw', { color: 0xf0d0c8, v0: 0, v1: 0.5, emissive: 0.15 });
  },
});

// ---------------------------------------------------------------- the Patient Chair (Level 4)
/** the seat, back and arms (fx.ts turns this part to face the unit; with state.full the static model includes it) */
export function patientSeat(mb: ModelBuilder) {
  // seat cushion: a soft slab with a sitting hollow
  blob(mb, [0, 0.5, 0.02], [0.27, 0.06, 0.26], 16, 7, 'an_upholstery', { color: 0xffffff, disp: (d) => 1 - (d[1] > 0.6 ? 0.25 * (1 - Math.hypot(d[0], d[2]) * 1.4) : 0) });
  chamferBox(mb, 0, 0.42, 0.02, 0.44, 0.04, 0.42, 0.015, 'plastic_black', { color: 0x2a2c30 });
  // the back on its curved spine
  tube(mb, [P(0, 0.44, -0.2), P(0, 0.52, -0.3), P(0, 0.7, -0.29)], 0.022, 6, 'metal_dark', { color: 0x3a3e44 });
  blob(mb, [0, 0.9, -0.27], [0.24, 0.27, 0.07], 16, 8, 'an_upholstery', { color: 0xf0f0f4, disp: (d) => 1 + (d[2] > 0 ? -0.18 * Math.max(0, 1 - Math.abs(d[0]) * 1.6) : 0) });
  // the arms: loops of black plastic with pads
  for (const s of [-1, 1]) {
    tube(mb, [P(s * 0.2, 0.44, 0.12), P(s * 0.27, 0.58, 0.1), P(s * 0.27, 0.66, 0.02), P(s * 0.26, 0.66, -0.14)], 0.018, 6, 'plastic_black', { color: 0x2a2c30 });
    blob(mb, [s * 0.27, 0.68, -0.02], [0.04, 0.02, 0.13], 8, 4, 'plastic_black', { color: 0x34363a });
  }
}
defObj({
  key: 'an_patient_chair', name: 'Office Chair', height: 1.2, block: 'low', movable: 0, hp: 99999, sound: 'plastic',
  tags: [...T, 'office', 'chair'],
  desc: 'A worn office chair in tweed. Wherever you stand in the room, it is facing you.',
  variant: (s) => (s.full ? 'full' : 'base'),
  model: (mb, s) => {
    // five-star base on casters, a gas lift
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3, x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3;
      tube(mb, [P(0, 0.1, 0), P(x * 0.6, 0.085, z * 0.6), P(x, 0.065, z)], (t) => 0.028 - t * 0.008, 6, 'plastic_black', { color: 0x2a2c30, capEnd: true });
      tube(mb, [P(x, 0.065, z), P(x, 0.03, z)], 0.008, 4, 'metal_dark');
      blob(mb, [x, 0.028, z], [0.028, 0.026, 0.018], 8, 4, 'plastic_black', { color: 0x1e2024 });
    }
    lathe(mb, [0, 0.08, 0], [[0, 0], [0.05, 0], [0.045, 0.04], [0.025, 0.06], [0.022, 0.32], [0.03, 0.34], [0, 0.34]], 12, 'metal_dark', { color: 0x4a4e54 });
    if (s.full) patientSeat(mb);
  },
});

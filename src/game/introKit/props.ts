// Furniture and fittings for the intake set, faceted low-poly (chamfered
// boxes, turned parts, extruded outlines, swept pipes): the clerks' steel
// desks with CRT terminals, keyboards, paper, rubber stamps and in-trays,
// swivel chairs, filing cabinets, the intake counter with its barred
// teller grille, the barred swing gate and its header, tripod turnstiles,
// a bolted steel bench, a hose reel, I-beams, pipe and conduit runs.
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { cbox, cboxMM, lathe, prism, rod, tube, face, lump, sag, mulberry, type V3, type V2 } from './poly';

/** a CRT terminal on a desk top at (x, y, z) facing `yaw` (0 = +z); the screen face goes into `glow` */
export function terminal(mb: ModelBuilder, glow: ModelBuilder, x: number, y: number, z: number, yaw = 0) {
  for (const b of [mb, glow]) b.push().translate(x, y, z).rotateY(yaw);
  // plinth, the tube's tapered back, the bezel
  cbox(mb, 0, 0, -0.02, 0.26, 0.04, 0.24, 0.012, 'ix_enamel', { color: 0xc8c0a8 });
  prism(mb.push().translate(0, 0, 0).rotateY(-Math.PI / 2), [[-0.17, 0.05], [0.12, 0.08], [0.12, 0.33], [-0.17, 0.36]] as V2[], -0.15, 0.15, 'ix_enamel', { color: 0xc8c0a8, b: 0.015 });
  mb.pop();
  cbox(mb, 0, 0.04, 0.12, 0.38, 0.33, 0.06, 0.02, 'ix_enamel', { color: 0xd8d0b8 });
  cbox(mb, 0, 0.075, 0.148, 0.3, 0.25, 0.012, 0.006, 'plastic_black');
  for (let i = 0; i < 4; i++) cbox(mb, -0.15 + i * 0.02, 0.05, 0.152, 0.008, 0.012, 0.006, 0.002, 'metal_dark');
  face(glow, [[-0.135, 0.09, 0.156], [0.135, 0.09, 0.156], [0.135, 0.31, 0.156], [-0.135, 0.31, 0.156]], 'p_crt_term', { fit: true });
  for (const b of [mb, glow]) b.pop();
}

/** a keyboard: a wedge with key rows */
export function keyboardAt(mb: ModelBuilder, x: number, y: number, z: number, yaw = 0) {
  mb.push().translate(x, y, z).rotateY(yaw).rotateY(-Math.PI / 2);
  prism(mb, [[-0.08, 0], [0.08, 0], [0.08, 0.018], [-0.08, 0.04]] as V2[], -0.2, 0.2, 'ix_enamel', { color: 0xb0a890, b: 0.006 });
  mb.pop();
  mb.push().translate(x, y, z).rotateY(yaw);
  for (let r = 0; r < 4; r++) cbox(mb, 0, 0.022 + r * 0.005, -0.05 + r * 0.03, 0.36, 0.012, 0.022, 0.003, 'plastic_black', { color: 0x6a645a });
  mb.pop();
}

/** a clerk's steel desk (front toward +z after yaw), dressed: terminal, keyboard, paper, stamp, tray, mug */
export function clerkDesk(mb: ModelBuilder, glow: ModelBuilder, x: number, z: number, yaw: number, seed = 1) {
  const r = mulberry(seed);
  mb.push().translate(x, 0, z).rotateY(yaw);
  glow.push().translate(x, 0, z).rotateY(yaw);
  const W = 1.5, D = 0.75, H = 0.76;
  cbox(mb, 0, H - 0.035, 0, W, 0.035, D, 0.01, { top: 'ix_laminate', all: 'ix_enamel' }, { color: 0xd8d0c0 });
  // pedestal of drawers on the right, a leg frame on the left, a modesty panel
  cbox(mb, W / 2 - 0.23, 0.02, 0, 0.42, H - 0.06, D - 0.06, 0.012, 'ix_enamel');
  for (let i = 0; i < 3; i++) {
    cbox(mb, W / 2 - 0.23, 0.06 + i * 0.22, D / 2 - 0.04, 0.38, 0.19, 0.03, 0.01, 'ix_enamel', { color: 0xe0d8c4 });
    rod(mb, [W / 2 - 0.3, 0.2 + i * 0.22, D / 2 - 0.015], [W / 2 - 0.16, 0.2 + i * 0.22, D / 2 - 0.015], 0.008, 4, 'chrome');
  }
  for (const s of [-1, 1]) cbox(mb, -W / 2 + 0.05, 0, s * (D / 2 - 0.05), 0.05, H - 0.04, 0.05, 0.01, 'ix_enamel');
  cbox(mb, -0.15, 0.25, -D / 2 + 0.03, W - 0.5, H - 0.3, 0.02, 0.006, 'ix_enamel', { color: 0xc8c0ac });
  // on top
  terminal(mb, glow, -0.25 + r() * 0.1, H, -0.12, -0.1 + r() * 0.2);
  keyboardAt(mb, -0.2, H, 0.18, 0.05);
  for (let i = 0; i < 3 + Math.floor(r() * 3); i++) cbox(mb, 0.35 + r() * 0.05, H + i * 0.004, 0.05 + r() * 0.06, 0.21, 0.004, 0.29, 0.001, 'paper', { color: 0xf0e8d8 });
  // in-tray
  prism(mb.push().translate(0.42, H, -0.2), [[-0.13, 0], [0.13, 0], [0.14, 0.06], [-0.14, 0.06]] as V2[], -0.17, 0.17, 'metal_dark', { b: 0.004 });
  mb.pop();
  for (let i = 0; i < 4; i++) cbox(mb, 0.42, H + 0.01 + i * 0.006, -0.2, 0.21, 0.004, 0.29, 0.001, 'paper', { color: 0xe8dcc0 });
  // rubber stamp on its pad
  cbox(mb, 0.12, H, 0.24, 0.12, 0.012, 0.08, 0.004, 'plastic_black', { color: 0x6a1410 });
  lathe(mb, 0.12, H + 0.012, 0.24, [[0.03, 0], [0.03, 0.02], [0.012, 0.03], [0.012, 0.07], [0.025, 0.08], [0.02, 0.1], [0, 0.105]], 6, 'wood_dark');
  // a mug
  lathe(mb, -0.6, H, 0.15, [[0.035, 0], [0.04, 0.09], [0.036, 0.095]], 7, 'ix_enamel', { color: 0xe8e2d0 });
  glow.pop();
  mb.pop();
}

/** a swivel chair (seat facing +z after yaw) */
export function swivelChair(mb: ModelBuilder, x: number, z: number, yaw: number) {
  mb.push().translate(x, 0, z).rotateY(yaw);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    rod(mb, [0, 0.07, 0], [Math.cos(a) * 0.28, 0.04, Math.sin(a) * 0.28], 0.015, 4, 'metal_dark');
    lathe(mb, Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28, [[0.025, 0], [0.025, 0.04]], 5, 'rubber_black');
  }
  lathe(mb, 0, 0.06, 0, [[0.03, 0], [0.025, 0.32], [0.04, 0.36]], 6, 'chrome');
  cbox(mb, 0, 0.42, 0, 0.46, 0.08, 0.44, 0.03, 'fabric_grey', { color: 0x4a5048 });
  cbox(mb, 0, 0.48, -0.24, 0.42, 0.42, 0.06, 0.025, 'fabric_grey', { color: 0x4a5048 });
  rod(mb, [0, 0.44, -0.18], [0, 0.6, -0.24], 0.012, 4, 'metal_dark');
  mb.pop();
}

/** a four-drawer filing cabinet against a wall (front +z after yaw) */
export function filingCabinet(mb: ModelBuilder, x: number, z: number, yaw: number, col = 0x7a8478) {
  mb.push().translate(x, 0, z).rotateY(yaw);
  cbox(mb, 0, 0, 0, 0.46, 1.32, 0.62, 0.015, 'ix_enamel', { color: col });
  for (let i = 0; i < 4; i++) {
    cbox(mb, 0, 0.04 + i * 0.32, 0.31, 0.42, 0.29, 0.025, 0.008, 'ix_enamel', { color: col });
    rod(mb, [-0.06, 0.24 + i * 0.32, 0.33], [0.06, 0.24 + i * 0.32, 0.33], 0.009, 4, 'chrome');
    cbox(mb, 0, 0.27 + i * 0.32, 0.326, 0.08, 0.03, 0.004, 0.001, 'paper', { color: 0xe8dcc0 });
  }
  mb.pop();
}

/**
 * The intake counter along a wall line at x (facing -x into the corridor) from z0 to z1:
 * a steel front with the stencil, a laminate top, and above it a barred teller grille
 * up to the ceiling rail, with a transaction slot every two metres.
 */
export function intakeCounter(mb: ModelBuilder, x: number, z0: number, z1: number, h = 2.7) {
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
  mb.push().translate(x, 0, zc).rotateY(-Math.PI / 2);
  // local: the counter runs along x, the corridor side is +z
  cbox(mb, 0, 0, 0, len, 1.0, 0.5, 0.012, { south: 'ix_counter', all: 'ix_steel' }, {});
  cbox(mb, 0, 1.0, 0.04, len + 0.04, 0.05, 0.62, 0.015, { top: 'ix_laminate', all: 'ix_steel' }, { color: 0xb0aca0 });
  // the grille: top and bottom rails, posts every 2 m, bars between
  cbox(mb, 0, 1.05, -0.1, len, 0.06, 0.08, 0.01, 'ix_steel');
  cbox(mb, 0, h - 0.4, -0.1, len, 0.12, 0.1, 0.015, 'ix_plate');
  const posts = Math.max(2, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) cbox(mb, -len / 2 + i * len / posts, 1.05, -0.1, 0.07, h - 1.45, 0.08, 0.012, 'ix_steel');
  for (let xx = -len / 2 + 0.08; xx < len / 2 - 0.04; xx += 0.11) {
    const slot = ((xx + len / 2) % 2) > 0.85 && ((xx + len / 2) % 2) < 1.25;
    rod(mb, [xx, slot ? 1.45 : 1.1, -0.1], [xx, h - 0.4, -0.1], 0.011, 6, 'metal_dark', { caps: false });
  }
  // transaction slots: a steel tray through the counter top, a speaking grille
  for (let i = 0; i < posts; i++) {
    const cx = -len / 2 + (i + 0.5) * len / posts;
    cbox(mb, cx, 1.04, -0.06, 0.4, 0.04, 0.3, 0.01, 'ix_steel', { color: 0x9aa098 });
    cbox(mb, cx, 1.42, -0.1, 0.42, 0.05, 0.1, 0.012, 'ix_steel');
    cbox(mb, cx, 1.55, -0.12, 0.16, 0.16, 0.02, 0.006, 'ix_grate');
  }
  mb.pop();
}

/** a barred swing gate in a steel frame across a corridor at z (x0..x1 opening), the leaf swung open by `open` radians */
export function barredGate(mb: ModelBuilder, x0: number, x1: number, z: number, h: number, open = 1.4, hingeLeft = false) {
  const w = x1 - x0;
  // posts and header
  for (const px of [x0, x1]) cbox(mb, px, 0, z, 0.12, h, 0.16, 0.02, 'ix_steel');
  cbox(mb, (x0 + x1) / 2, h, z, w + 0.12, 0.18, 0.18, 0.025, 'ix_plate');
  // the leaf
  const hx = hingeLeft ? x0 + 0.07 : x1 - 0.07;
  mb.push().translate(hx, 0.05, z).rotateY(hingeLeft ? -open : open);
  const L = w - 0.14, s = hingeLeft ? 1 : -1;
  for (const y of [0.05, h * 0.5, h - 0.15]) rod(mb, [0, y, 0], [s * L, y, 0], 0.022, 6, 'ix_steel');
  rod(mb, [0, 0.05, 0], [0, h - 0.15, 0], 0.028, 6, 'ix_steel');
  rod(mb, [s * L, 0.05, 0], [s * L, h - 0.15, 0], 0.028, 6, 'ix_steel');
  for (let t = 0.12; t < L - 0.04; t += 0.12) rod(mb, [s * t, 0.05, 0], [s * t, h - 0.15, 0], 0.012, 6, 'metal_dark', { caps: false });
  rod(mb, [0, 0.1, 0], [s * L, h * 0.48, 0], 0.016, 6, 'ix_steel');
  cbox(mb, s * (L - 0.06), h * 0.42, 0, 0.12, 0.2, 0.08, 0.012, 'ix_yellow');
  mb.pop();
  for (const y of [0.3, h - 0.4]) lathe(mb, hx, y, z, [[0.035, 0], [0.035, 0.12]], 6, 'metal_dark');
}

/** a waist-high tripod turnstile: cabinet along z at (x, z), arms on its +x side */
export function turnstile(mb: ModelBuilder, x: number, z: number, armsSide = 1, seed = 1) {
  const r = mulberry(seed);
  mb.push().translate(x, 0, z);
  cbox(mb, 0, 0, 0, 0.26, 0.92, 0.9, 0.02, 'ix_steel');
  // the slanted lid
  mb.push().translate(0, 0.92, 0).rotateY(Math.PI / 2);
  prism(mb, [[-0.45, 0], [0.45, 0], [0.45, 0.06], [-0.45, 0.12]] as V2[], -0.14, 0.14, 'chrome', { color: 0xa0a8a8, b: 0.01 });
  mb.pop();
  cbox(mb, 0, 0.94, 0.3, 0.16, 0.05, 0.14, 0.01, 'plastic_black');
  cbox(mb, armsSide * 0.135, 0.6, 0.25, 0.02, 0.06, 0.04, 0.005, 'led_green', { emissive: 1 });
  // hub and three arms (one held out across the lane)
  mb.push().translate(armsSide * 0.14, 0.82, 0.05).rotateZ(-armsSide * 0.62);
  lathe(mb, 0, 0, 0, [[0.06, 0], [0.065, 0.06], [0.04, 0.1]], 7, 'chrome');
  const a0 = r() * 0.5;
  for (let i = 0; i < 3; i++) {
    const a = a0 + i * Math.PI * 2 / 3;
    rod(mb, [0, 0.05, 0], [Math.cos(a) * 0.48 * armsSide, 0.05 + 0.02, Math.sin(a) * 0.48], 0.018, 6, 'chrome');
  }
  mb.pop();
  mb.pop();
}

/** a steel bench bolted to a wall (seat along x, back toward -z after yaw) */
export function steelBench(mb: ModelBuilder, x: number, z: number, yaw: number, len = 1.6) {
  mb.push().translate(x, 0, z).rotateY(yaw);
  for (let i = 0; i < 3; i++) cbox(mb, 0, 0.44, -0.12 + i * 0.12, len, 0.035, 0.1, 0.012, 'ix_steel', { color: 0x6a7068 });
  for (const s of [-1, 1]) {
    prism(mb.push().translate(s * (len / 2 - 0.12), 0, 0).rotateY(-Math.PI / 2), [[-0.18, 0], [0.18, 0], [0.18, 0.06], [0.04, 0.44], [-0.18, 0.44]] as V2[], -0.02, 0.02, 'ix_steel', { b: 0.006 });
    mb.pop();
    for (const t of [-0.12, 0.12]) lathe(mb, s * (len / 2 - 0.12) + t * 0.2, 0, 0.12 * Math.sign(t), [[0.018, 0], [0.012, 0.012]], 6, 'chrome');
  }
  // the shackle bar along the front
  rod(mb, [-len / 2 + 0.1, 0.3, 0.2], [len / 2 - 0.1, 0.3, 0.2], 0.014, 6, 'chrome');
  for (const s of [-1, 1]) rod(mb, [s * (len / 2 - 0.1), 0.3, 0.2], [s * (len / 2 - 0.1), 0.42, 0.1], 0.012, 4, 'chrome');
  mb.pop();
}

/** a wall hose reel facing +z after yaw, at height y */
export function hoseReel(mb: ModelBuilder, x: number, y: number, z: number, yaw: number) {
  mb.push().translate(x, y, z).rotateY(yaw);
  cbox(mb, 0, -0.3, -0.02, 0.36, 0.6, 0.04, 0.01, 'ix_yellow', { color: 0xc83020 });
  mb.push().translate(0, 0, 0.12).rotateX(Math.PI / 2);
  lathe(mb, 0, -0.1, 0, [[0.24, 0], [0.24, 0.02], [0.09, 0.03], [0.09, 0.17], [0.24, 0.18], [0.24, 0.2]], 10, 'ix_yellow', { color: 0xc83020 });
  mb.pop();
  for (let k = 0; k < 3; k++) tube(mb, Array.from({ length: 11 }, (_, i) => { const a = i / 10 * Math.PI * 2; return [Math.cos(a) * (0.13 + k * 0.03), Math.sin(a) * (0.13 + k * 0.03), 0.06 + k * 0.035] as V3; }), 0.017, 5, 'rubber_black', { caps: false });
  tube(mb, [[0.2, -0.05, 0.12], [0.26, -0.4, 0.16], [0.22, -0.9, 0.2], [0.3, -1.2, 0.35]], 0.017, 5, 'rubber_black');
  rod(mb, [0.3, -1.2, 0.35], [0.36, -1.24, 0.5], 0.022, 6, 'metal_brass');
  mb.pop();
}

/** a mop bucket on castors with its wringer and mop */
export function mopBucket(mb: ModelBuilder, x: number, z: number, yaw: number) {
  mb.push().translate(x, 0, z).rotateY(yaw);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(mb, sx * 0.18, 0, sz * 0.13, [[0.025, 0], [0.025, 0.04]], 5, 'rubber_black');
  prism(mb.push().translate(0, 0.05, 0).rotateY(Math.PI / 2), [[-0.15, 0], [0.15, 0], [0.18, 0.32], [-0.18, 0.32]] as V2[], -0.2, 0.2, 'ix_yellow', { b: 0.015 });
  mb.pop();
  cbox(mb, 0.1, 0.37, 0, 0.16, 0.14, 0.26, 0.015, 'metal_dark');
  rod(mb, [0.1, 0.5, 0], [0.3, 0.95, 0.1], 0.012, 4, 'metal_dark');
  rod(mb, [-0.05, 0.3, 0.02], [-0.2, 1.35, 0.15], 0.012, 5, 'wood_dark');
  lump(mb, -0.04, 0.24, 0.02, 0.1, 0.16, 7, 'fabric_grey', { color: 0x9a9480 });
  mb.pop();
}

/** an I-beam from a to b: an extruded I outline (web depth d, flange width f) */
export function iBeam(mb: ModelBuilder, a: V3, b: V3, d = 0.3, f = 0.18, tex = 'ix_steel', up: V3 = [0, 1, 0]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  mb.push().translate(a[0], a[1], a[2]).rotateY(yaw).rotateX(pitch);
  const t = 0.022, w = 0.016;
  const roll = up[1] > 0.5 ? 0 : Math.PI / 2;
  mb.rotateZ(roll);
  prism(mb, [[-f / 2, -d / 2], [f / 2, -d / 2], [f / 2, -d / 2 + t], [w / 2, -d / 2 + t], [w / 2, d / 2 - t], [f / 2, d / 2 - t], [f / 2, d / 2], [-f / 2, d / 2], [-f / 2, d / 2 - t], [-w / 2, d / 2 - t], [-w / 2, -d / 2 + t], [-f / 2, -d / 2 + t]] as V2[], 0, L, tex, { b: 0 });
  mb.pop();
}

/** a pipe run through points, with a flange and a bracket at each corner */
export function pipeRun(mb: ModelBuilder, pts: V3[], r: number, tex = 'ix_steel', o: { color?: number; brackets?: boolean } = {}) {
  tube(mb, pts, r, 6, tex, { color: o.color });
  for (let i = 1; i < pts.length - 1; i++) lathe(mb, pts[i][0], pts[i][1] - r * 1.6, pts[i][2], [[r * 1.45, 0], [r * 1.45, r * 3.2]], 6, 'metal_dark');
  if (o.brackets !== false) for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 1.4);
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; cbox(mb, p[0], p[1] - r * 1.3, p[2], r * 3.2, r * 2.6, r * 1.2, r * 0.3, 'metal_dark'); }
  }
}

/** a cable tray (open U channel) along z at (x, y) from z0 to z1, with a few cables sagging out of it */
export function cableTray(mb: ModelBuilder, x: number, y: number, z0: number, z1: number, seed = 3) {
  const r = mulberry(seed);
  const zc = (z0 + z1) / 2, L = Math.abs(z1 - z0);
  mb.push().translate(x, y, zc);
  prism(mb, [[-0.16, 0], [0.16, 0], [0.16, 0.07], [0.145, 0.07], [0.145, 0.015], [-0.145, 0.015], [-0.145, 0.07], [-0.16, 0.07]] as V2[], -L / 2, L / 2, 'metal_dark', { b: 0 });
  for (let i = 0; i < 4; i++) { const cx = -0.1 + i * 0.065; tube(mb, [[cx, 0.035, -L / 2], [cx + (r() - 0.5) * 0.02, 0.035, 0], [cx, 0.035, L / 2]], 0.014 + r() * 0.008, 5, 'ix_cable', { caps: false }); }
  mb.pop();
  // one cable escaping and sagging
  const a: V3 = [x + 0.15, y + 0.03, z0 + (z1 - z0) * 0.3], b: V3 = [x + 0.15, y + 0.03, z0 + (z1 - z0) * 0.55];
  tube(mb, sag(a, b, 0.35, 8), 0.016, 5, 'ix_cable', { caps: false });
  void cboxMM;
}

/** what was left on the plate: a lumpy yellow bundle, a sleeve, a hand, gore */
export function remains(mb: ModelBuilder, x: number, y: number, z: number, seed = 11) {
  const r = mulberry(seed);
  for (let i = 0; i < 6; i++) lump(mb, x + (r() - 0.5) * 1.1, y, z + (r() - 0.5) * 0.8, 0.28 + r() * 0.18, 0.22 + r() * 0.14, seed + i, 'fabric_grey', { color: 0xd0a028 });
  for (let i = 0; i < 4; i++) lump(mb, x + (r() - 0.5) * 0.9, y + 0.05, z + (r() - 0.5) * 0.6, 0.14 + r() * 0.1, 0.12, seed + 20 + i, 'gore_flesh', {});
  tube(mb, [[x + 0.45, y + 0.08, z + 0.2], [x + 0.75, y + 0.04, z + 0.35], [x + 0.98, y + 0.02, z + 0.42]], 0.06, 6, 'fabric_grey', { color: 0xc89820 });
  lathe(mb.push().translate(x + 1.02, y + 0.02, z + 0.44).rotateZ(-1.4), 0, 0, 0, [[0.03, 0], [0.045, 0.05], [0.03, 0.1], [0.01, 0.12]], 5, 'fabric_grey', { color: 0xc89070 });
  mb.pop();
}

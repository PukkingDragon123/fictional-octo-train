// The cosmetics catalogue (src/game/cosmetics.ts) made solid: low-poly models
// hung on the rig's bones (hats, eyewear and masks on the head, tags and
// collars on the neck, tanks and wings on the back) and the jumpsuit variants
// (re-dyed, or re-woven with stripes, hazard chevrons or circuit thread).
// HumanRig calls cosmeticOutfit() while it dresses the body and
// syncCosmetics() after, so every rig that carries `app.cos` (the creator, the
// player, co-op guests) wears them. Real items win: a worn hat, glasses, mask
// or backpack hides the cosmetic in that slot. Geometry is cached per piece
// and shared by every rig; one small mesh per worn piece.
import * as THREE from 'three';
import type { Outfit } from './humanRig';
import type { Dims, BoneName } from './humanModel';
import { ModelBuilder } from '../gfx/modelBuilder';
import { defGarment, garment } from './humanClothes';
import type { Paint } from './humanClothes';
import type { Surf } from './humanPaint';
import { COSMETIC, type CosSlot } from '../game/cosmetics';

type MB = ModelBuilder;
interface Piece { bone: BoneName; build: (mb: MB) => void; flatHair?: boolean; glow?: { color: number; make: () => THREE.BufferGeometry } }
const TAU = Math.PI * 2;

/** a smooth band round the y axis (radius r, height h, centred at y); an arc a0..a1 (0 = the face, +x the subject's left); sx squeezes it to the head's oval */
function ring(mb: MB, y: number, r: number, h: number, t: number, n: number, tex: string, color: number, emissive = 0, a0 = 0, a1 = TAU, sx = 1) {
  const segs = Math.max(10, Math.round(n * 1.6 * Math.abs(a1 - a0) / TAU));
  const ro = r + t / 2;
  for (let i = 0; i < segs; i++) {
    const A = a0 + ((a1 - a0) * i) / segs, B = a0 + ((a1 - a0) * (i + 1)) / segs;
    const pa = [Math.sin(A) * ro * sx, Math.cos(A) * ro], pb = [Math.sin(B) * ro * sx, Math.cos(B) * ro];
    mb.quadRaw([[pa[0], y - h / 2, pa[1]], [pb[0], y - h / 2, pb[1]], [pb[0], y + h / 2, pb[1]], [pa[0], y + h / 2, pa[1]]],
      [[i / segs, 0], [(i + 1) / segs, 0], [(i + 1) / segs, 1], [i / segs, 1]], tex, color, 1, emissive);
  }
}
/** a round rod between two points */
function rod(mb: MB, a: number[], b: number[], r: number, tex: string, color: number, emissive = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  mb.push().translate(a[0], a[1], a[2]);
  (mb as any).m.multiply(m);
  mb.cylinder(0, 0, 0, r, L, 6, tex, { color, emissive, fit: true });
  mb.pop();
}
/** a curved plate following the face (masks): angles a0..a1, heights y0..y1, an oval a little off the skin; paint(i, j) may recolour (-1 skips a cell: a hole) */
function shell(mb: MB, a0: number, a1: number, y0: number, y1: number, off: number, nA: number, nY: number, tex: string, color: number, paint?: (i: number, j: number) => number) {
  const rz = (y: number) => 0.1 + off - Math.max(0, y - 0.13) * 0.45 - Math.max(0, 0.03 - y) * 0.6;
  for (let j = 0; j < nY; j++) for (let i = 0; i < nA; i++) {
    const c = paint ? paint(i, j) : color;
    if (c < 0) continue;
    const A = a0 + ((a1 - a0) * i) / nA, B = a0 + ((a1 - a0) * (i + 1)) / nA, Y0 = y0 + ((y1 - y0) * j) / nY, Y1 = y0 + ((y1 - y0) * (j + 1)) / nY;
    const P = (a: number, y: number) => [Math.sin(a) * rz(y) * 0.86, y, 0.006 + Math.cos(a) * rz(y)];
    mb.quadRaw([P(A, Y0), P(B, Y0), P(B, Y1), P(A, Y1)], [[i / nA, j / nY], [(i + 1) / nA, j / nY], [(i + 1) / nA, (j + 1) / nY], [i / nA, (j + 1) / nY]], tex, c);
  }
}
/** a two-sided flat panel (wings, plates) */
function plate(mb: MB, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tex: string, color: number) {
  mb.panel(x0, z0, x1, z1, y0, y1, tex, { color, fit: true });
  mb.panel(x1, z1, x0, z0, y0, y1, tex, { color: (color >> 1) & 0x7f7f7f, fit: true });
}

// head-local unit space (scaled by height × head size): y 0 at the jaw hinge,
// eyes at y≈0.1 / z≈0.095, crown at y≈0.215; +z is the face, +x the subject's left
const PIECES: Record<string, Piece> = {
  hat_watch: { bone: 'head', flatHair: true, build: (mb) => {
    mb.cylinder(0, 0.118, 0, 0.109, 0.07, 12, 'fabric_grey', { color: 0x3a4a3a, rTop: 0.1, caps: false });
    mb.cylinder(0, 0.188, 0, 0.1, 0.04, 12, 'fabric_grey', { color: 0x3a4a3a, rTop: 0.06 });
    mb.cylinder(0, 0.112, 0, 0.114, 0.035, 12, 'fabric_grey', { color: 0x2e3c2e, caps: false });
  } },
  hat_bucket: { bone: 'head', flatHair: true, build: (mb) => {
    mb.cylinder(0, 0.128, 0, 0.165, 0.012, 14, 'fabric_brown', { color: 0x8a7a52, rTop: 0.12 });
    mb.cylinder(0, 0.13, 0, 0.107, 0.09, 12, 'fabric_brown', { color: 0x9a8a5e, rTop: 0.095 });
    ring(mb, 0.14, 0.109, 0.016, 0.006, 12, 'fabric_grey', 0x4a3e2a);
  } },
  hat_crown: { bone: 'head', flatHair: true, build: (mb) => {
    ring(mb, 0.138, 0.106, 0.045, 0.006, 14, 'paper', 0xe8c84a);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, w = 0.22;
      const L = [Math.sin(a - w) * 0.11, 0.16, Math.cos(a - w) * 0.11], R = [Math.sin(a + w) * 0.11, 0.16, Math.cos(a + w) * 0.11], T = [Math.sin(a) * 0.115, 0.215, Math.cos(a) * 0.115];
      mb.triRaw([L, R, T], [[0, 0], [1, 0], [0.5, 1]], 'paper', 0xf0d860);
      mb.triRaw([R, L, T], [[0, 0], [1, 0], [0.5, 1]], 'paper', 0xb89a40);
      mb.sphere(T[0], T[1] + 0.006, T[2], 0.008, 6, 4, 'plastic_red', { color: 0xc83a2a });
    }
  } },
  hat_cone: { bone: 'head', flatHair: true, build: (mb) => {
    mb.box(0, 0.125, 0, 0.27, 0.022, 0.27, 'plastic_white', { color: 0xe85a1a });
    mb.cylinder(0, 0.147, 0, 0.112, 0.31, 10, 'plastic_white', { color: 0xf06a24, rTop: 0.014 });
    mb.cylinder(0, 0.25, 0, 0.083, 0.05, 10, 'plastic_white', { color: 0xf0ece0, rTop: 0.068, caps: false });
  } },
  hat_tophat: { bone: 'head', flatHair: true, build: (mb) => {
    mb.cylinder(0, 0.135, 0, 0.155, 0.012, 14, 'fabric_grey', { color: 0x1a1816 });
    mb.cylinder(0, 0.147, 0, 0.1, 0.19, 12, 'fabric_grey', { color: 0x221e1c, rTop: 0.104 });
    mb.cylinder(0, 0.148, 0, 0.103, 0.032, 12, 'fabric_red', { color: 0x8a1a1a, caps: false });
  } },
  hat_antlers: { bone: 'head', build: (mb) => {
    for (const k of [1, -1]) {
      const b = [k * 0.06, 0.17, -0.01], m1 = [k * 0.13, 0.28, -0.03], t1 = [k * 0.15, 0.38, -0.02], t2 = [k * 0.22, 0.33, -0.05], t3 = [k * 0.09, 0.35, 0.02];
      rod(mb, b, m1, 0.006, 'metal_grey', 0x9a9488); rod(mb, m1, t1, 0.005, 'metal_grey', 0x9a9488);
      rod(mb, m1, t2, 0.005, 'metal_grey', 0x8a847a); rod(mb, [k * 0.1, 0.23, -0.02], t3, 0.004, 'metal_grey', 0x9a9488);
    }
    ring(mb, 0.15, 0.105, 0.012, 0.004, 12, 'metal_grey', 0x7a746a);
  } },
  hat_halo: { bone: 'head', build: () => { /* glow only */ }, glow: { color: 0x7ff6ff, make: () => new THREE.TorusGeometry(0.11, 0.012, 4, 20).rotateX(Math.PI / 2).translate(0, 0.33, -0.01) } },
  eyes_shades: { bone: 'head', build: (mb) => {
    ring(mb, 0.095, 0.104, 0.036, 0.012, 14, 'plastic_black', 0x141414, 0, -1.3, 1.3, 0.86);
    ring(mb, 0.1, 0.11, 0.008, 0.004, 14, 'chrome', 0x8a9aa8, 0.4, -0.9, 0.9, 0.86);
    ring(mb, 0.1, 0.1, 0.01, 0.004, 14, 'plastic_black', 0x1a1a1a, 0, 1.3, TAU - 1.3, 0.86);
  } },
  eyes_cinema: { bone: 'head', build: (mb) => {
    ring(mb, 0.1, 0.103, 0.042, 0.01, 14, 'plastic_white', 0xf0ece0, 0, -1.2, 1.2, 0.86);
    ring(mb, 0.1, 0.112, 0.026, 0.003, 10, 'plastic_white', 0xe83a3a, 0.6, 0.12, 0.72, 0.86);
    ring(mb, 0.1, 0.112, 0.026, 0.003, 10, 'plastic_white', 0x3ad8e8, 0.6, -0.72, -0.12, 0.86);
    ring(mb, 0.104, 0.1, 0.01, 0.004, 14, 'plastic_white', 0xe8e4d8, 0, 1.2, TAU - 1.2, 0.86);
  } },
  eyes_goggles: { bone: 'head', build: (mb) => {
    for (const k of [1, -1]) {
      mb.cylinderZ(k * 0.04, 0.1, 0.104, 0.029, 0.03, 8, { sides: 'metal_dark', all: 'glass_dark' }, { color: 0x4a5a4a });
      mb.box(k * 0.04, 0.1, 0.12, 0.034, 0.034, 0.003, 'glass_dark', { color: 0x2a3a2a, emissive: 0.25 });
    }
    ring(mb, 0.1, 0.104, 0.02, 0.006, 14, 'leather_black', 0x2a2420, 0, 0, TAU, 0.82);
  } },
  eyes_monocle: { bone: 'head', build: (mb) => {
    mb.cylinderZ(0.04, 0.1, 0.106, 0.026, 0.008, 10, { sides: 'metal_brass', all: 'glass' }, { color: 0xc8a04a });
    mb.box(0.04, 0.1, 0.111, 0.032, 0.032, 0.002, 'glass', { color: 0xc8e0e8, emissive: 0.5 });
    rod(mb, [0.066, 0.09, 0.104], [0.09, -0.02, 0.07], 0.002, 'metal_brass', 0xc8a04a);
  } },
  eyes_led: { bone: 'head', build: (mb) => {
    ring(mb, 0.1, 0.104, 0.034, 0.014, 14, 'plastic_black', 0x101010, 0, -1.2, 1.2, 0.86);
    ring(mb, 0.1, 0.113, 0.012, 0.003, 14, 'led_red', 0xff3a4a, 1.6, -0.95, 0.95, 0.86);
    ring(mb, 0.1, 0.103, 0.022, 0.005, 14, 'plastic_black', 0x161616, 0, 0, TAU, 0.82);
  } },
  face_bandana: { bone: 'head', build: (mb) => {
    ring(mb, 0.05, 0.104, 0.05, 0.006, 14, 'fabric_red', 0x8a2a2a, 0, 0, TAU, 0.82);
    shell(mb, -1.1, 1.1, 0.0, 0.075, 0.012, 10, 3, 'fabric_red', 0x9a3030);
    mb.triRaw([[-0.07, 0.0, 0.11], [0.07, 0.0, 0.11], [0, -0.06, 0.1]], [[0, 1], [1, 1], [0.5, 0]], 'fabric_red', 0x8a2828);
  } },
  face_resp: { bone: 'head', build: (mb) => {
    mb.cylinderZ(0, 0.025, 0.112, 0.04, 0.04, 12, 'rubber_black', { color: 0x3a3e40 });
    shell(mb, -0.8, 0.8, -0.01, 0.07, 0.006, 8, 3, 'rubber_black', 0x2e3234);
    for (const k of [1, -1]) { mb.push().translate(k * 0.052, 0.025, 0.11).rotateY(k * 0.5).rotateX(0.4); mb.cylinderZ(0, 0, 0.02, 0.022, 0.035, 8, { sides: 'metal_grey', all: 'grate' }, { color: 0x6a7074 }); mb.pop(); }
    ring(mb, 0.065, 0.102, 0.012, 0.004, 14, 'rubber_black', 0x222424, 0, 0, TAU, 0.82);
  } },
  face_muzzle: { bone: 'head', build: (mb) => {
    ring(mb, 0.058, 0.108, 0.01, 0.004, 14, 'metal_grey', 0x6a6460, 0, 0, TAU, 0.82);
    for (let i = -3; i <= 3; i++) { const a = i * 0.24; rod(mb, [Math.sin(a) * 0.11, 0.058, Math.cos(a) * 0.11], [Math.sin(a) * 0.09, -0.005, Math.cos(a) * 0.105], 0.004, 'metal_grey', 0x7a746e); }
    ring(mb, 0.0, 0.1, 0.008, 0.004, 14, 'metal_grey', 0x6a6460, 0, 0, TAU, 0.82);
    ring(mb, -0.004, 0.1, 0.008, 0.004, 12, 'metal_grey', 0x5a544e, 0, -0.8, 0.8, 0.9);
  } },
  face_goalie: { bone: 'head', build: (mb) => {
    // 10 columns across the face, 8 rows from chin to brow: eye slots and breathing holes are left open, chevrons painted red
    shell(mb, -1.25, 1.25, -0.03, 0.2, 0.014, 10, 8, 'plastic_white', 0xe8e4d8, (i, j) => {
      if (j === 5 && (i === 2 || i === 3 || i === 6 || i === 7)) return -1;
      if ((j === 1 || j === 2) && (i === 4 || i === 5) && (i + j) % 2) return -1;
      if (j === 3 && (i === 1 || i === 8)) return 0xa82a22;
      return j === 0 ? 0xd8d4c8 : 0xe8e4d8;
    });
  } },
  face_smile: { bone: 'head', build: (mb) => {
    // a polished plate with eye slits and a painted grin (the grin curves up at the corners)
    shell(mb, -1.2, 1.2, -0.04, 0.2, 0.012, 12, 12, 'chrome', 0xb8bcc0, (i, j) => {
      if (j === 8 && (i === 3 || i === 4 || i === 7 || i === 8)) return 0x050505;
      const grin = Math.round(2.6 + Math.pow((i - 5.5) / 4.2, 2) * 2.2);
      if (i >= 2 && i <= 9 && j === grin) return 0x1a0a0a;
      return 0xb8bcc0;
    });
  } },
  // neck-local: y 0 at the base of the neck, the collarbones a little below
  neck_tags: { bone: 'neck', build: (mb) => {
    ring(mb, 0.02, 0.07, 0.006, 0.004, 14, 'metal_grey', 0xa8acb0);
    rod(mb, [0.03, 0.01, 0.065], [0.0, -0.09, 0.115], 0.002, 'metal_grey', 0xa8acb0);
    rod(mb, [-0.03, 0.01, 0.065], [0.0, -0.09, 0.115], 0.002, 'metal_grey', 0xa8acb0);
    mb.box(0.006, -0.12, 0.118, 0.026, 0.04, 0.004, 'chrome', { color: 0xc8ccd0, emissive: 0.2 });
    mb.box(-0.008, -0.115, 0.122, 0.026, 0.04, 0.004, 'chrome', { color: 0xb0b4b8 });
  } },
  neck_scarf: { bone: 'neck', build: (mb) => {
    mb.cylinder(0, -0.02, 0, 0.082, 0.07, 12, 'fabric_blue', { color: 0x4a6a8a, rTop: 0.072 });
    mb.push().translate(0.04, -0.03, 0.11).rotateZ(0.08); mb.box(0, -0.26, 0, 0.055, 0.27, 0.018, 'fabric_blue', { color: 0x3e5e7e }); mb.box(0, -0.27, 0.001, 0.056, 0.02, 0.019, 'fabric_red', { color: 0x8a2a2a }); mb.pop();
  } },
  neck_collar: { bone: 'neck', build: (mb) => {
    mb.cylinder(0, 0.02, 0, 0.066, 0.032, 12, 'leather_black', { color: 0x2a2a2a });
    mb.box(0, 0.016, 0.068, 0.04, 0.04, 0.02, 'metal_dark', { color: 0x3a3a3a });
    mb.box(0, 0.03, 0.079, 0.01, 0.008, 0.004, 'led_red', { color: 0xff2a2a, emissive: 2 });
  } },
  // chest-local, moved out to the back surface (z ≤ 0 points away from the spine)
  back_cable: { bone: 'chest', build: (mb) => {
    mb.box(0, 0.21, -0.01, 0.06, 0.05, 0.04, 'metal_dark', { color: 0x3a3e40 });
    mb.box(0, 0.21, -0.03, 0.03, 0.03, 0.01, 'led_green', { color: 0x3aff8a, emissive: 1.2 });
    const pts = [[0, 0.21, -0.03], [0.02, 0.12, -0.09], [0.05, -0.05, -0.13], [0.08, -0.3, -0.16], [0.1, -0.55, -0.14], [0.14, -0.72, -0.1]];
    for (let i = 0; i + 1 < pts.length; i++) rod(mb, pts[i], pts[i + 1], 0.013, 'rubber_black', 0x2a2e30);
    mb.box(0.14, -0.76, -0.1, 0.035, 0.05, 0.035, 'metal_rusty', { color: 0x8a6a4a });
  } },
  back_tank: { bone: 'chest', build: (mb) => {
    mb.cylinder(0, -0.2, -0.085, 0.068, 0.36, 10, 'metal_sheet', { color: 0x5a8a9a });
    mb.cylinder(0, 0.16, -0.085, 0.068, 0.025, 10, 'metal_grey', { color: 0x7a8288, rTop: 0.03 });
    mb.box(0, 0.2, -0.085, 0.03, 0.03, 0.03, 'metal_brass', { color: 0xc8a04a });
    mb.box(0, -0.02, -0.155, 0.04, 0.12, 0.004, 'plastic_white', { color: 0xe8e4d8 });
    mb.box(0, 0.0, -0.157, 0.03, 0.02, 0.003, 'led_green', { color: 0x3ae8ff, emissive: 1.2 });
    for (const y of [0.05, -0.15]) mb.box(0, y, -0.02, 0.2, 0.025, 0.035, 'leather_black', { color: 0x2a2420 });
  } },
  back_wings: { bone: 'chest', build: (mb) => {
    for (const k of [1, -1]) {
      plate(mb, k * 0.05, -0.03, k * 0.42, -0.22, 0.02, 0.3, 'metal_sheet', 0xb8bcc0);
      plate(mb, k * 0.07, -0.04, k * 0.36, -0.2, -0.18, 0.02, 'metal_sheet', 0xa8acb0);
      plate(mb, k * 0.09, -0.05, k * 0.28, -0.16, -0.3, -0.16, 'metal_sheet', 0x989ca0);
      for (let i = 0; i < 4; i++) mb.box(k * (0.12 + i * 0.08), 0.28 - i * 0.03, -0.06 - i * 0.04, 0.012, 0.012, 0.012, 'metal_rusty', { color: 0x8a6a4a });
    }
    mb.box(0, 0.02, -0.02, 0.14, 0.2, 0.03, 'metal_dark', { color: 0x4a4e52 });
  } },
};

// ------------------------------------------------------------------ jumpsuit variants
const SUIT_TEX: Record<string, string> = { suit_stripe: 'c_jsuit_stripe', suit_hazard: 'c_jsuit_hazard', suit_circuit: 'c_jsuit_circuit' };
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
type Pat = (S: Surf, x: number, y: number, part: string) => number | null;
const PATTERNS: Record<string, Pat> = {
  c_jsuit_stripe: (_S, _x, y) => (Math.floor(y / 3) % 2 ? 0x1c1a18 : null),
  c_jsuit_hazard: (S, x, y, part) => {
    const lower = part === 'leg' ? S.yAt(y) < -0.45 : part === 'arm' ? S.yAt(y) < -0.25 : part === 'torso' && S.yAt(y) < 0.93;
    return lower && Math.floor((x + y) / 3) % 2 ? 0x17150f : null;
  },
  c_jsuit_circuit: (_S, x, y) => {
    const gx = x % 9 === 0 && hash(x >> 3, y >> 2, 3) > 0.45, gy = y % 7 === 0 && hash(x >> 2, y >> 3, 5) > 0.5;
    if (gx || gy) return 0x3ae8f0;
    return hash(x, y, 9) > 0.985 ? 0x8afcff : null;
  },
};
/** the zones the number stencils live in (left breast patch, the back), which patterns leave alone */
const keepOut = (S: Surf, x: number, y: number) => {
  const yy = S.yAt(y), d = S.deg(x);
  return (yy > 1.31 && yy < 1.41 && d > -40 && d < -18) || (yy > 1.22 && yy < 1.43 && Math.abs(Math.abs(d) - 180) < 42);
};
let suitsDefined = false;
function defineSuits() {
  if (suitsDefined) return true;
  const base = garment('c_jumpsuit');
  if (!base) return false;
  suitsDefined = true;
  for (const tex of Object.values(SUIT_TEX)) {
    const pat = PATTERNS[tex];
    const over = (part: string, fn?: (S: Surf, P: Paint) => void) => (S: Surf, P: Paint) => {
      fn?.(S, P);
      const sl = P.lp.sleeve || 'long';
      for (let y = 0; y < S.h; y++) {
        const yy = S.yAt(y);
        if (part === 'torso' && (yy > 1.47 || yy < P.sh.topHem)) continue;
        if (part === 'arm' && (sl === 'none' || (sl === 'short' && yy < -0.2) || yy < -0.52)) continue;
        for (let x = 0; x < S.w; x++) {
          if (part === 'torso' && keepOut(S, x, y)) continue;
          const c = pat(S, x, y, part);
          if (c != null) S.pc.blend(x, y, c, 0.82);
        }
      }
    };
    defGarment(tex, {
      ...base,
      torso: over('torso', base.torso), pelvis: over('pelvis', base.pelvis), arm: over('arm', base.arm), leg: over('leg', base.leg),
    }, {
      top: { sleeve: 'long', thick: 0.008, hem: 0.93, collar: 'shirt', tuck: true },
      leg: { kind: 'pants', thick: 0.01, flare: 0.012 },
    });
  }
  return true;
}

type CosApp = { cos?: string[] };
/** dress-time hook: re-dye or re-weave the jumpsuit, flatten the hair under a cosmetic hat */
export function cosmeticOutfit(o: Outfit, app: CosApp): Outfit {
  const cos = app.cos;
  if (!cos?.length) return o;
  let out = o;
  for (const k of cos) {
    const def = COSMETIC.get(k);
    if (!def) continue;
    if (def.slot === 'suit' && k !== 'suit_std') {
      const jump = (lp?: { tex: string; item?: string }) => !!lp && (lp.tex === 'c_jumpsuit' || lp.item === 'prison_jumpsuit');
      if (!jump(out.torso) && !jump(out.legs)) continue;
      const tex = SUIT_TEX[k] && defineSuits() ? SUIT_TEX[k] : 'c_jumpsuit';
      out = { ...out };
      if (jump(out.torso)) out.torso = { ...out.torso!, tex, color: def.color };
      if (jump(out.legs)) out.legs = { ...out.legs!, tex, color: def.color };
    } else if (def.slot === 'hat' && PIECES[k]?.flatHair && !out.head) {
      out = { ...out, hatFlat: true } as Outfit;
    }
  }
  return out;
}

const blocked = (slot: CosSlot, o: Outfit) => (slot === 'hat' && !!o.head) || (slot === 'eyes' && !!o.eyes) || (slot === 'face' && !!o.face) || (slot === 'back' && !!o.back);

const GEO = new Map<string, THREE.BufferGeometry>();
const GLOW = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial }>();
function geoOf(k: string): THREE.BufferGeometry | null {
  let g = GEO.get(k);
  if (g === undefined) {
    const p = PIECES[k];
    const mb = new ModelBuilder();
    p?.build(mb);
    g = mb.vertexCount ? mb.build() : (null as any);
    GEO.set(k, g!);
  }
  return g || null;
}
/** the geometry of one piece in its bone's unit space (thumbnails) */
export function cosmeticGeometry(k: string): { geo: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; bone: BoneName } | null {
  const p = PIECES[k];
  if (!p) return null;
  return { geo: geoOf(k), glow: p.glow ? glowOf(k).geo : null, bone: p.bone };
}
function glowOf(k: string) {
  let g = GLOW.get(k);
  if (!g) { const p = PIECES[k].glow!; g = { geo: p.make(), mat: new THREE.MeshBasicMaterial({ color: p.color, fog: false }) }; GLOW.set(k, g); }
  return g;
}

interface RigLike { app: CosApp; bones: Record<string, THREE.Object3D>; dims: Dims }
const WORN = new WeakMap<object, { key: string; meshes: THREE.Object3D[] }>();
/** hang the worn pieces on the rig's bones (cheap when nothing changed) */
export function syncCosmetics(rig: RigLike, o: Outfit, mat: THREE.Material) {
  const d = rig.dims;
  const list = (rig.app.cos || []).filter((k) => PIECES[k] && !blocked(COSMETIC.get(k)!.slot, o));
  const key = list.length ? list.join(',') + '|' + d.s.toFixed(3) + '|' + d.headS.toFixed(3) + '|' + d.mass.toFixed(2) : '';
  const cur = WORN.get(rig);
  if ((cur?.key ?? '') === key) return;
  for (const m of cur?.meshes || []) m.removeFromParent();
  const meshes: THREE.Object3D[] = [];
  for (const k of list) {
    const p = PIECES[k];
    const bone = rig.bones[p.bone];
    if (!bone) continue;
    const sc = p.bone === 'head' ? d.s * d.headS : d.s;
    const place = (m: THREE.Object3D) => {
      m.scale.setScalar(sc);
      if (p.bone === 'chest') { m.position.set(0, 0, -(0.1 * d.mass + 0.012) * d.s); m.scale.set(sc * (0.85 + 0.15 * d.mass), sc, sc); }
      if (p.bone === 'neck') m.scale.set(sc * (0.9 + 0.1 * d.mass), sc, sc * (0.9 + 0.1 * d.mass));
      m.name = 'cosmetic:' + k;
      bone.add(m);
      meshes.push(m);
    };
    const g = geoOf(k);
    if (g) { const m = new THREE.Mesh(g, mat); m.castShadow = true; place(m); }
    if (p.glow) { const gl = glowOf(k); place(new THREE.Mesh(gl.geo, gl.mat)); }
  }
  WORN.set(rig, { key, meshes });
}

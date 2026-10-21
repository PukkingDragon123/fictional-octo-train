// The subject room's machines and props as smooth low-poly models (smoothKit):
// tapered arm beams with knuckle hubs, hydraulic rams and hoses; lathe-turned
// claws, a buzz saw; a bevelled press slab on chrome rams; a turned-leg oak
// chair with leather straps and a ribbed electrode cap on a bent arm; radio
// cabinets with rounded bezels, turned knobs and rabbit ears; the props.
// Same origins and axes as the old block models, so room3d places them alike.
import * as THREE from 'three';
import { SmoothBuilder, at, rbox, cyl, ball, capsule, torus, lathe, tube, frame, hazardStripes, type Mats } from './smoothKit';
import { ROOM } from './roomKit';

const GUN = 0x4c5054, RUST = 0x6a4a36, CHROME = 0xc8ccd0, BLACK = 0x18181a, YEL = 0xe8b52a;

/** an arm beam along +Y (hinge at the origin) */
export function armSegment(mats: Mats, L: number, w: number): THREE.Group {
  const b = new SmoothBuilder();
  b.add('paint', cyl(w * 0.4, w * 0.55, L * 0.8, 12), GUN, at(0, L * 0.48, 0, 0, 0, 0, [1, 1, 0.82]));
  b.add('paint', ball(w * 0.42, 12, 8), GUN, at(0, L * 0.88, 0, 0, 0, 0, [1, 1, 0.82]));
  b.add('metal', cyl(w * 0.62, w * 0.62, w * 1.45, 18), RUST, at(0, 0, 0, 0, 0, Math.PI / 2));
  b.add('chrome', cyl(w * 0.3, w * 0.3, w * 1.6, 12), CHROME, at(0, 0, 0, 0, 0, Math.PI / 2));
  b.add('paint', cyl(w * 0.57, w * 0.57, w * 0.16, 14), YEL, at(0, L * 0.16, 0, 0, 0, 0, [1, 1, 0.84]));
  // the hydraulic ram on the side and its feed hose
  b.add('metal', cyl(w * 0.17, w * 0.17, L * 0.42, 10), 0x2e3032, at(w * 0.72, L * 0.33, 0));
  b.add('chrome', cyl(w * 0.08, w * 0.08, L * 0.36, 8), CHROME, at(w * 0.72, L * 0.7, 0));
  b.add('rubber', tube([[-w * 0.5, L * 0.05, 0.02], [-w * 0.85, L * 0.35, 0.06], [-w * 0.8, L * 0.65, 0.04], [-w * 0.45, L * 0.93, 0.0]], w * 0.12, 16, 6), BLACK);
  b.add('lamp', ball(w * 0.13, 8, 6), 0xff2a1a, at(0, L * 0.8, w * 0.47));
  return b.build(mats);
}
/** the wall / ceiling mount (+Y into the room) */
export function armBase(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  b.add('metal', lathe([[0, -0.05], [0.25, -0.05], [0.25, 0.0], [0.21, 0.04], [0.16, 0.07], [0.15, 0.2], [0.12, 0.24], [0, 0.25]], 18), 0x3a3c3e);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add('chrome', cyl(0.018, 0.018, 0.02, 6), 0x9a8a60, at(Math.cos(a) * 0.21, -0.01, Math.sin(a) * 0.21)); }
  return b.build(mats);
}
/** the claw's wrist and palm (+Y) */
export function clawPalm(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  b.add('metal', lathe([[0, -0.07], [0.07, -0.07], [0.08, 0.0], [0.095, 0.05], [0.1, 0.09], [0.085, 0.125], [0, 0.135]], 14), 0x484c50);
  b.add('metal', torus(0.083, 0.012, 6, 16), RUST, at(0, -0.02, 0, Math.PI / 2));
  b.add('lamp', ball(0.012, 6, 4), 0xff3a2a, at(0, 0.1, 0.09));
  return b.build(mats);
}
/** one curled claw finger (hinge at the origin, reaching +Y) */
export function clawFinger(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  b.add('metal', ball(0.026, 10, 8), RUST);
  b.add('metal', tube([[0, 0, 0], [0, 0.07, 0.012], [0, 0.13, 0.0], [0, 0.17, -0.03]], 0.017, 12, 7), 0x6a6e70);
  b.add('chrome', capsule(0.013, 0.02, 2, 7), 0xa8acb0, at(0, 0.175, -0.035, -0.6));
  return b.build(mats);
}
/** the tool head: motor housing, drill, lamp (+Y); the saw is separate */
export function toolHead(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  b.add('metal', lathe([[0, -0.07], [0.07, -0.07], [0.075, 0.02], [0.085, 0.06], [0.085, 0.14], [0.06, 0.17], [0, 0.175]], 14), 0x484c50);
  b.add('chrome', cyl(0.003, 0.02, 0.13, 10), CHROME, at(0.05, 0.24, 0));
  b.add('metal', cyl(0.028, 0.028, 0.05, 10), 0x2a2c2e, at(0.05, 0.18, 0));
  b.add('lamp', ball(0.022, 8, 6), 0xfff0d0, at(-0.055, 0.15, 0.05));
  b.add('chrome', torus(0.024, 0.006, 6, 12), CHROME, at(-0.055, 0.15, 0.05, 0, 0.9));
  b.add('metal', cyl(0.012, 0.012, 0.16, 8), 0x5a5e62, at(-0.02, 0.2, 0.02, Math.PI / 2));
  return b.build(mats);
}
/** a buzz saw blade in the XY plane */
export function sawBlade(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  b.add('chrome', cyl(0.1, 0.1, 0.006, 28), 0xd8dce0, at(0, 0, 0, Math.PI / 2));
  b.add('metal', cyl(0.025, 0.025, 0.014, 12), 0x5a5e62, at(0, 0, 0, Math.PI / 2));
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; b.add('chrome', new THREE.ConeGeometry(0.009, 0.022, 4), 0xe8ecf0, at(Math.cos(a) * 0.105, Math.sin(a) * 0.105, 0, 0, 0, a - Math.PI / 2 - 0.4)); }
  return b.build(mats);
}
/** the press head: a bevelled slab, hazard skirt, bolts, two chrome rams up into the ceiling */
export function pressModel(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  b.add('paint', rbox(1.3, 0.5, 1.0, 0.05, 3), 0x4a4e52, at(0, 0.25, 0));
  b.add('metal', rbox(1.38, 0.09, 1.08, 0.03, 2), RUST, at(0, 0.54, 0));
  for (const [z, ry] of [[0.503, 0], [-0.503, Math.PI]] as const) {
    b.add('paint', rbox(1.28, 0.13, 0.008, 0.003, 1), BLACK, at(0, 0.075, z, 0, ry));
    b.add('paint', hazardStripes(1.26, 0.12, 22), YEL, at(0, 0.075, z + (z > 0 ? 0.004 : -0.004), 0, ry));
  }
  for (const [x, ry] of [[0.653, Math.PI / 2], [-0.653, -Math.PI / 2]] as const) {
    b.add('paint', rbox(0.98, 0.13, 0.008, 0.003, 1), BLACK, at(x, 0.075, 0, 0, ry));
    b.add('paint', hazardStripes(0.96, 0.12, 16), YEL, at(x + (x > 0 ? 0.004 : -0.004), 0.075, 0, 0, ry));
  }
  for (let i = 0; i < 6; i++) b.add('chrome', cyl(0.022, 0.022, 0.02, 8), 0x9a8a50, at(-0.5 + i * 0.2, 0.3, 0.505, Math.PI / 2));
  for (const k of [-1, 1]) {
    b.add('chrome', cyl(0.09, 0.09, 3.4, 20), CHROME, at(k * 0.38, 0.58 + 1.7, 0));
    b.add('metal', lathe([[0.15, 0], [0.15, 0.1], [0.12, 0.18], [0.095, 0.22]], 18), 0x3a3c3e, at(k * 0.38, 0.58, 0));
  }
  return b.build(mats);
}
/** the hatch shutter: rounded steel slats and a hazard foot */
export function shutterModel(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  const { HATCH_W: w, HATCH_H: h } = ROOM;
  for (let i = 0; i < 9; i++) b.add('metal', rbox(w, h / 9 - 0.014, 0.06, 0.02, 2), i % 2 ? 0x6a6e70 : 0x5a5e60, at(0, i * (h / 9) + h / 18, 0));
  b.add('paint', rbox(w, 0.14, 0.012, 0.004, 1), BLACK, at(0, 0.07, 0.034));
  b.add('paint', hazardStripes(w - 0.02, 0.13, 14), YEL, at(0, 0.07, 0.04));
  return b.build(mats);
}

/** the electric chair: oak with turned legs, leather straps and buckles, the ribbed cap on a bent iron arm, cables */
export function chairModel(mats: Mats, straps: boolean): THREE.Group {
  const b = new SmoothBuilder();
  const { SEAT_Y: Y, CHAIR_Z: z } = ROOM;
  const OAK = 0x6a4428, OAK2 = 0x553620, LEATHER = 0x2a1c14;
  b.add('rubber', rbox(1.05, 0.06, 0.95, 0.02, 2), 0x262626, at(0, 0.03, z));
  for (const [x, dz] of [[-0.27, -0.24], [0.27, -0.24], [-0.27, 0.24], [0.27, 0.24]]) b.add('wood', lathe([[0.05, 0], [0.05, 0.03], [0.038, 0.06], [0.042, 0.2], [0.032, 0.26], [0.045, 0.32], [0.045, Y - 0.06]], 10), OAK2, at(x, 0.06, z + dz));
  b.add('wood', rbox(0.68, 0.08, 0.6, 0.025, 2), OAK, at(0, Y + 0.04, z));
  // the back: two posts and slats
  for (const k of [-1, 1]) b.add('wood', rbox(0.09, 1.0, 0.09, 0.025, 2), OAK2, at(k * 0.3, Y + 0.58, z - 0.27));
  for (const y of [0.25, 0.55, 0.85]) b.add('wood', rbox(0.54, 0.12, 0.05, 0.02, 2), OAK, at(0, Y + y, z - 0.28));
  b.add('wood', rbox(0.76, 0.08, 0.12, 0.03, 2), 0x4e3220, at(0, Y + 1.06, z - 0.27));
  for (const k of [-1, 1]) {
    b.add('wood', lathe([[0.035, 0], [0.03, 0.05], [0.036, 0.12], [0.028, 0.2], [0.038, 0.24]], 10), OAK2, at(k * 0.36, Y + 0.08, z + 0.2));
    b.add('wood', rbox(0.12, 0.06, 0.6, 0.025, 2), 0x5a3a24, at(k * 0.36, Y + 0.33, z - 0.02));
  }
  // iron bands round the back
  for (const y of [0.2, 0.55]) b.add('metal', rbox(0.7, 0.045, 0.02, 0.008, 1), RUST, at(0, Y + y, z - 0.305));
  if (straps) {
    for (const k of [-1, 1]) {
      b.add('rubber', torus(0.075, 0.016, 6, 16), LEATHER, at(k * 0.36, Y + 0.34, z + 0.14, 0, 0, 0, [1, 0.62, 1]));
      b.add('chrome', rbox(0.03, 0.03, 0.012, 0.006, 1), 0xb0a070, at(k * 0.36 + k * 0.07, Y + 0.34, z + 0.14));
      b.add('rubber', torus(0.065, 0.014, 6, 16), LEATHER, at(k * 0.12, 0.22, z + 0.22, Math.PI / 2));
    }
    b.add('rubber', rbox(0.72, 0.07, 0.03, 0.012, 1), LEATHER, at(0, Y + 0.6, z - 0.22));
  }
  // the cap on its bent arm
  b.add('metal', tube([[0, Y + 1.09, z - 0.27], [0, Y + 1.2, z - 0.22], [0, Y + 1.17, z - 0.1], [0, Y + 1.02, z - 0.06]], 0.022, 14, 8), 0x3e4042);
  b.add('metal', lathe([[0.13, 0], [0.135, 0.02], [0.12, 0.05], [0.09, 0.075], [0.05, 0.09], [0, 0.095]], 18), 0x8a8a84, at(0, Y + 0.92, z - 0.06));
  for (const y of [0.015, 0.045]) b.add('chrome', torus(0.128 - y * 0.6, 0.006, 5, 20), 0xb09040, at(0, Y + 0.92 + y, z - 0.06, Math.PI / 2));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add('chrome', ball(0.012, 6, 4), 0xc8a04a, at(Math.sin(a) * 0.125, Y + 0.925, z - 0.06 + Math.cos(a) * 0.125)); }
  // cables: from the cap up into the dark, and along the floor to the breaker
  b.add('rubber', tube([[0, Y + 1.0, z - 0.08], [0.05, Y + 1.5, z - 0.12], [0.02, 2.6, z - 0.2], [0, ROOM.H, z - 0.25]], 0.02, 20, 6), 0x141414);
  b.add('rubber', tube([[0.2, 0.02, z - 0.3], [-0.8, 0.025, z - 0.45], [-2.2, 0.02, z - 0.6], [-ROOM.W + 0.2, 0.9, -1.3]], 0.022, 24, 6), 0x141414);
  return b.build(mats);
}

/** a TV set round a w×h screen centred on the origin (the screen itself is a crt.ts mesh) */
export function tvModel(mats: Mats, kind: 'console' | 'portable' | 'monitor', sw: number, sh: number): THREE.Group {
  const b = new SmoothBuilder();
  const bz = 0.07, D = kind === 'console' ? 0.6 : 0.48;
  const W = sw + bz * 2 + (kind === 'console' ? 0.26 : 0.12), H = sh + bz * 2 + (kind === 'portable' ? 0.16 : 0.12);
  const cx = kind === 'console' ? 0.13 : 0, cy = kind === 'portable' ? -0.04 : -0.03;
  const body = kind === 'console' ? { m: 'wood' as const, c: 0x6a3e22 } : kind === 'portable' ? { m: 'gloss' as const, c: 0xd8c8a0 } : { m: 'paint' as const, c: 0x5e6858 };
  b.add(body.m, rbox(W, H, D * 0.56, 0.06, 3), body.c, at(cx, cy, -D * 0.28 + 0.01));
  // the picture tube's bell behind
  b.add(body.m, lathe([[sw * 0.55, 0], [sw * 0.5, D * 0.2], [sw * 0.32, D * 0.42], [sw * 0.14, D * 0.5], [0, D * 0.52]], 14), body.c, at(cx * 0.4, cy, -D * 0.5, -Math.PI / 2, 0, 0, [1, 1, sh / sw]));
  // the bezel round the glass
  const bezC = kind === 'portable' ? 0xc8b890 : kind === 'console' ? 0xd8c8a0 : 0x34362f;
  b.add('gloss', frame(sw + bz * 2, sh + bz * 2, sw, sh, 0.05, 0.035, 0.04), bezC, at(0, 0, 0.012));
  if (kind === 'console') {
    const kx = sw / 2 + bz + 0.13;
    for (const [y, r] of [[0.12, 0.05], [-0.06, 0.04]] as const) {
      b.add('chrome', lathe([[r * 1.15, 0], [r * 1.1, 0.012], [r, 0.018]], 16), CHROME, at(kx, y, 0.01, Math.PI / 2));
      b.add('gloss', lathe([[r, 0], [r * 0.95, 0.03], [r * 0.8, 0.045], [0, 0.05]], 16), 0x2a1a10, at(kx, y, 0.02, Math.PI / 2));
    }
    for (let i = 0; i < 6; i++) b.add('chrome', cyl(0.004, 0.004, 0.15, 6), 0xa08a60, at(kx, -sh / 2 + 0.01 + i * 0.026, 0.018, 0, 0, Math.PI / 2));
    for (const k of [-1, 1]) b.add('wood', lathe([[0.03, 0], [0.022, 0.08], [0.018, 0.2], [0.03, 0.22]], 8), 0x4a2c18, at(cx + k * W * 0.38, cy - H / 2 - 0.22, -0.12));
  } else if (kind === 'portable') {
    b.add('chrome', tube([[-0.2, sh / 2 + bz + 0.02, -0.15], [-0.18, sh / 2 + bz + 0.12, -0.15], [0.18, sh / 2 + bz + 0.12, -0.15], [0.2, sh / 2 + bz + 0.02, -0.15]], 0.015, 16, 6), CHROME);
    b.add('gloss', lathe([[0.04, 0], [0.038, 0.02], [0.03, 0.03], [0, 0.032]], 14), 0xa83224, at(sw * 0.32, -sh / 2 - bz - 0.06, 0.012, Math.PI / 2));
    for (let i = 0; i < 4; i++) b.add('chrome', cyl(0.004, 0.004, sw * 0.4, 6), 0x8a7a5a, at(-sw * 0.15, -sh / 2 - bz - 0.075 + i * 0.012, 0.012, 0, 0, Math.PI / 2));
  } else {
    for (let i = 0; i < 6; i++) b.add('metal', rbox(0.035, 0.012, 0.02, 0.005, 1), 0x1e201c, at(-W * 0.3 + i * 0.06, -sh / 2 - bz - 0.03, 0.005));
    b.add('chrome', capsule(0.008, 0.03, 2, 6), CHROME, at(sw * 0.38, -sh / 2 - bz - 0.04, 0.03, 0.5));
    b.add('lamp', ball(0.012, 8, 6), 0xff8a3a, at(sw * 0.22, -sh / 2 - bz - 0.04, 0.02));
  }
  if (kind !== 'monitor') {
    for (const k of [-1, 1]) b.add('chrome', cyl(0.006, 0.006, 0.55, 6), 0xd8dce0, at(cx + k * 0.06 + k * Math.sin(0.42) * 0.275, cy + H / 2 + Math.cos(0.42) * 0.275, -D * 0.4, 0, 0, -k * 0.42));
    for (const k of [-1, 1]) b.add('chrome', ball(0.016, 8, 6), 0xe8ecf0, at(cx + k * 0.06 + k * Math.sin(0.42) * 0.55, cy + H / 2 + Math.cos(0.42) * 0.55, -D * 0.4));
    b.add('gloss', lathe([[0.05, 0], [0.045, 0.03], [0.02, 0.045], [0, 0.05]], 12), 0x2a2a2a, at(cx, cy + H / 2, -D * 0.4));
  }
  // the power cord trailing into the dark (they float, but they are still plugged in)
  b.add('rubber', tube([[cx + 0.1, cy - H / 2 + 0.05, -D * 0.5], [cx + 0.14, cy - H / 2 - 0.3, -D * 0.55], [cx + 0.08, cy - H / 2 - 0.8, -D * 0.45], [cx + 0.12, cy - H / 2 - 1.5, -D * 0.5]], 0.008, 16, 5), 0x141414);
  return b.build(mats);
}

/** the floating props: a bakelite handset, a cassette, an ID card, a keycap */
export function propModel(mats: Mats, kind: string): THREE.Group {
  const b = new SmoothBuilder();
  if (kind === 'phone') {
    b.add('gloss', tube([[-0.27, -0.13, 0], [-0.18, -0.05, 0], [0, -0.03, 0], [0.18, -0.05, 0], [0.27, -0.13, 0]], 0.045, 20, 10), 0x9a2a1e);
    for (const k of [-1, 1]) {
      b.add('gloss', lathe([[0.02, -0.02], [0.08, 0], [0.09, 0.03], [0.085, 0.06], [0.04, 0.07], [0, 0.07]], 16), 0xa83224, at(k * 0.27, -0.16, 0, Math.PI));
      b.add('chrome', torus(0.06, 0.006, 5, 16), 0x6a6a6a, at(k * 0.27, -0.235, 0, Math.PI / 2));
    }
    const coil: [number, number, number][] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 14; coil.push([-0.27 + Math.cos(a) * 0.02, -0.24 - t * 0.35, Math.sin(a) * 0.02]); }
    b.add('rubber', tube(coil, 0.006, 80, 4), 0x141414);
  } else if (kind === 'tape') {
    b.add('gloss', rbox(0.56, 0.18, 0.34, 0.03, 2), 0x2a2a34, at(0, -0.09, 0));
    b.add('gloss', rbox(0.42, 0.012, 0.2, 0.005, 1), 0xe8e0c8, at(0, 0.002, 0.0));
    for (const k of [-1, 1]) { b.add('gloss', cyl(0.05, 0.05, 0.014, 18), 0x9a9a9a, at(k * 0.12, 0.004, 0.04)); b.add('metal', cyl(0.02, 0.02, 0.016, 8), 0x2a2a2a, at(k * 0.12, 0.006, 0.04)); }
  } else if (kind === 'card') {
    b.add('gloss', rbox(0.36, 0.48, 0.02, 0.02, 2), 0xe8e4d8, at(0, -0.2, 0));
    b.add('paint', rbox(0.22, 0.22, 0.006, 0.006, 1), 0x1a1a1a, at(0, -0.12, 0.012));
    b.add('chrome', torus(0.03, 0.008, 6, 12), 0x9aa0a4, at(0, 0.06, 0));
    for (let i = 0; i < 3; i++) b.add('paint', rbox(0.24 - i * 0.04, 0.016, 0.004, 0.002, 1), 0x6a6a6a, at(0, -0.29 - i * 0.04, 0.012));
  } else if (kind === 'key') {
    b.add('gloss', rbox(0.32, 0.12, 0.32, 0.035, 3), 0x3a3a40, at(0, -0.12, 0));
    b.add('gloss', rbox(0.25, 0.07, 0.25, 0.04, 3), 0x4a4a52, at(0, -0.03, 0));
    b.add('gloss', lathe([[0.1, 0], [0.06, -0.01], [0, -0.012]], 16), 0x55555e, at(0, 0.006, 0));
  }
  return b.build(mats);
}

/** the settings gear's panel: riveted enamel, three gauge bezels, toggle switches */
export function dialPanelModel(mats: Mats): THREE.Group {
  const b = new SmoothBuilder();
  b.add('paint', rbox(0.86, 0.64, 0.05, 0.03, 2), 0x5a6450, at(0, 0, -0.08));
  for (const [x, y] of [[-0.39, 0.27], [0.39, 0.27], [-0.39, -0.27], [0.39, -0.27]]) b.add('chrome', ball(0.014, 8, 6), 0xa0a4a0, at(x, y, -0.055));
  for (const x of [-0.26, 0, 0.26]) b.add('chrome', torus(0.093, 0.014, 8, 24), 0xb0b4b8, at(x, 0.17, -0.05));
  for (let i = 0; i < 4; i++) {
    b.add('chrome', lathe([[0.025, 0], [0.022, 0.012], [0.012, 0.02]], 12), 0xb8bcc0, at(-0.3 + i * 0.2, -0.22, -0.055, Math.PI / 2));
    b.add('chrome', capsule(0.007, 0.05, 2, 6), 0xd0d4d8, at(-0.3 + i * 0.2, -0.2, -0.03, 0.5 + (i % 2) * -1));
  }
  b.add('paint', rbox(0.7, 0.07, 0.01, 0.004, 1), 0x2a2c28, at(0, -0.31, -0.054));
  return b.build(mats);
}

/** a Nixie tube's socket: turned bakelite, a chrome ring, pins, the dark anode behind the glyph */
export function tubeBaseModel(mats: Mats, r: number): THREE.Group {
  const b = new SmoothBuilder();
  b.add('gloss', lathe([[r * 1.12, -0.1], [r * 1.1, -0.06], [r * 1.05, -0.02], [r * 1.0, 0.0], [0, 0.0]], 18), 0x3a2214);
  b.add('chrome', torus(r * 1.0, 0.012, 6, 24), 0xb8bcc0, at(0, 0.01, 0, Math.PI / 2));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add('chrome', cyl(0.005, 0.005, 0.06, 5), 0xc8a04a, at(Math.sin(a) * r * 0.6, -0.12, Math.cos(a) * r * 0.6)); }
  b.add('metal', rbox(r * 1.3, r * 2.0, 0.004, 0.002, 1), 0x2a2018, at(0, 0.3, -r * 0.55));
  return b.build(mats);
}

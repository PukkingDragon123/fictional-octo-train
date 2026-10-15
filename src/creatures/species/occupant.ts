import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph, mixHex } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, hashId, fakeCreature, rng, fxPoll, playAt, live, seenByAny, localIn, thinkOnce, lineOfSightB } from '../behaviors_b';
import '../../audio/sounds_creatures_b';
import { SkinKit, KRig, surf, tube, blob, spike, damp, toLocal, V3 } from '../kit/anomalies';
import { wetGlints, veins } from '../kit/anomalyTextures';
import '../kit/anomalyTextures';

// The Occupant: something that fills corridors. A wall of carpet grown into
// flesh, studded with dim eyes, dragging itself along long straight halls at
// walking pace. It is heard minutes before it is seen (a rumble felt through
// the floor). It cannot be hurt and touching it is close to fatal. It never
// enters side rooms and cannot open doors: get off the corridor, close a door,
// stay quiet, and let it pass. It comes, and then it goes, like weather.
//
// Built as one skinned mass on a spine of segments: a peristaltic wave runs
// back along it, the seams between its carpet "panels" are creases of wet
// flesh lined with teeth that part and close as it crawls, veins throb across
// its face, fluorescent tubes it has swallowed flicker in its back, a vertical
// mouth of teeth splits the face and twenty eyes blink out of step and follow
// whoever is nearest.

// ---------------------------------------------------------------- shape
const HW = 1.1, HH = 1.12;          // half width / half height of the cross-section
const FACE_Z = 2.0, TIP = 0.45;     // the face dome starts at FACE_Z and bulges TIP further
const BACK_Z = -2.75;
const SEG_Z = [1.1, 0.0, -1.1, -2.2];
const SEAMS = [1.62, 0.55, -0.55, -1.65];
const FRONT_Z = 2.2;
const SQ = 3.2;                      // superellipse exponent: boxy, to fill the corridor

/** lumpy surface displacement (multiplier around 1) */
const lumps = (a: number, z: number) => 1 + 0.035 * Math.sin(a * 5 + z * 3.1) + 0.025 * Math.sin(a * 11 - z * 6.3) + 0.04 * Math.sin(a * 3 + z * 1.7) * Math.sin(z * 2.3 + a);
/** a point on the superellipse cross-section, angle a from the top, scale k */
function ring(a: number, k: number): [number, number] {
  const s = Math.sin(a), c = Math.cos(a);
  const e = 2 / SQ;
  const x = Math.sign(s) * Math.pow(Math.abs(s), e) * HW * k;
  const y = HH + Math.sign(c) * Math.pow(Math.abs(c), e) * HH * k;
  return [x, Math.max(0, y)];
}
/** the face dome: radial scale and z for t = 0 (rim) .. 1 (crown) */
const domeK = (t: number) => Math.pow(Math.cos(t * Math.PI / 2), 0.55);
const domeZ = (t: number) => FACE_Z + TIP * Math.sin(t * Math.PI / 2);

/** eyes on the face: [x, y, radius], deterministic; the face texture paints a socket under each */
const FACE_EYES: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let k = 0; out.length < 13 && k < 600; k++) {
    const x = (hashId('oe' + k) - 0.5) * 1.9, y = 0.35 + hashId('oe' + k, 3) * 1.6;
    const r = out.length < 3 ? 0.15 + hashId('oe' + k, 5) * 0.05 : 0.07 + hashId('oe' + k, 7) * 0.05;
    if (Math.abs(x) < 0.2 + r) continue; // keep clear of the mouth
    if ((x / 0.98) ** 2 + ((y - HH) / 1.0) ** 2 > 0.85) continue;
    if (out.some((e) => Math.hypot(e[0] - x, e[1] - y) < e[2] + r + 0.06)) continue;
    out.push([x, y, r]);
  }
  return out;
})();
/** the dome surface under a face point: z and outward normal */
function facePoint(x: number, y: number): { z: number; n: V3 } {
  const nx = x / HW, ny = (y - HH) / HH;
  const rho = Math.min(0.999, Math.pow(Math.pow(Math.abs(nx), SQ) + Math.pow(Math.abs(ny), SQ), 1 / SQ));
  const t = Math.acos(Math.pow(rho, 1 / 0.55)) * 2 / Math.PI;
  const z = domeZ(t);
  const l = Math.hypot(nx * 0.9, ny * 0.9, 1);
  return { z, n: [nx * 0.9 / l, ny * 0.9 / l, 1 / l] };
}

addTextureModule(() => {
  const A = atlas();
  // carpet that has become skin: dingy loop-pile, pink-grey flesh pushing through, seams and hairs
  A.add('c_occ_body', 64, 64, (pc) => {
    const C = makeRamp(0x8a7a48, 7, { hueShift: 0.04, spread: 0.5 });
    const F = makeRamp(0x80585a, 7, { hueShift: 0.05, spread: 0.55 });
    const fl = (x: number, y: number) => tileFbm(x, y, 64, 64, 4, 3, 501);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const f = fl(x, y);
      if (f > 0.56) {
        const v = (f - 0.56) / 0.44;
        const fold = Math.sin(y * 0.7 + Math.sin(x * 0.25) * 2.5) > 0.55;
        pc.set(x, y, F[Math.min(6, Math.max(0, Math.round(1.5 + v * 3.5 + (fold ? -1.2 : 0) + (ph(x, y, 3) - 0.5) * 0.8)))]);
      } else {
        const loop = ((x >> 1) + (y >> 1)) % 2 === 0 ? 1 : 0;
        const matted = f > 0.48 ? -1.2 : 0;
        pc.set(x, y, C[Math.min(6, Math.max(0, Math.round(2.6 + loop * 0.7 + matted + (tileFbm(x, y, 64, 64, 8, 1, 502) - 0.5) * 2 + (ph(x, y, 5) - 0.5) * 0.8)))]);
      }
    }
    // dark wet margin where carpet meets meat, glints on the meat
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const f = fl(x, y); if (f > 0.54 && f < 0.575) pc.set(x, y, 0x2e1a16); }
    wetGlints(pc, (x, y) => fl(x, y) - 0.25, 0xd8a8a0, 0.6, 503);
    veins(pc, 504, 7, 0x4a2236, 22, 0.5);
    // carpet seams (stitched tape) and old stains
    for (let x = 0; x < 64; x++) { if (fl(x, 31) < 0.56) { pc.set(x, 31, 0x4a3e24); if (x % 4 === 0) pc.set(x, 30, 0x6a5a34); } }
    pc.stain(14, 46, 7, 0x5a4a2a, 0x463820, 4); pc.stain(48, 12, 5, 0x5a4a2a, 0x463820, 9);
    for (let i = 0; i < 22; i++) { const x = Math.floor(ph(i, 1, 505) * 64), y = Math.floor(ph(i, 2, 505) * 64); pc.set(x, y, 0x2a1e14); pc.set(x + 1, y - 1, 0x3a2a1a); } // coarse hairs
  }, 1, 1);
  // the creases between panels: wet, red-purple, glistening, with sockets for the teeth
  A.add('c_occ_crease', 32, 16, (pc) => {
    const R = makeRamp(0x5a1c26, 8, { hueShift: -0.04, spread: 0.6 });
    const h = (x: number, y: number) => tileFbm(x, y, 32, 16, 4, 2, 511);
    pc.fillRamp(R, (x, y) => 0.08 + Math.abs(y - 7.5) / 8 * 0.45 + (h(x, y) - 0.5) * 0.25, 0.7);
    for (let x = 0; x < 32; x++) { pc.set(x, 7 + (x % 5 === 0 ? 1 : 0), 0x12040a); pc.set(x, 8, 0x0a0206); }
    for (let x = 1; x < 32; x += 3) { pc.set(x, 2, 0x3a0a12); pc.set(x, 13, 0x3a0a12); }
    wetGlints(pc, h, 0xf0b0b8, 0.68, 512);
  }, 0.5, 0.25);
  // its face (fit, projected from the front): flesh pushing through the pile, sockets, the mouth slit, folds
  A.add('c_occ_face', 128, 128, (pc) => {
    pc.wrap = false;
    const C = makeRamp(0x8a7a48, 7, { hueShift: 0.04, spread: 0.5 });
    const F = makeRamp(0x8a5a5c, 8, { hueShift: 0.05, spread: 0.6 });
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const u = x / 128, v = 1 - y / 128;
      const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
      const d = Math.hypot(dx, dy);
      const f = tileFbm(x, y, 128, 128, 6, 3, 521) + (1 - d) * 0.35;
      if (f > 0.62) {
        const fold = Math.sin(d * 26 + Math.atan2(dy, dx) * 3) > 0.5; // radial folds, like a puckered scar
        pc.set(x, y, F[Math.min(7, Math.max(0, Math.round(2 + (f - 0.62) * 8 + (fold ? -1.4 : 0) + (ph(x, y, 6) - 0.5) * 0.8)))]);
      } else {
        const loop = ((x >> 1) + (y >> 1)) % 2 === 0 ? 1 : 0;
        pc.set(x, y, C[Math.min(6, Math.max(0, Math.round(2.4 + loop * 0.7 - (f > 0.55 ? 1.2 : 0) + (ph(x, y, 7) - 0.5) * 0.9)))]);
      }
    }
    wetGlints(pc, (x, y) => tileFbm(x, y, 128, 128, 6, 3, 521), 0xe0b0a8, 0.62, 522);
    veins(pc, 523, 16, 0x4a1a30, 34, 0.55);
    // the mouth slit down the middle
    for (let y = 0; y < 128; y++) {
      const v = 1 - y / 128, yy = v * 2 * HH;
      if (yy < 0.3 || yy > 1.75) continue;
      const w = 13 * Math.sin(((yy - 0.3) / 1.45) * Math.PI) + 2;
      for (let x = Math.floor(64 - w); x <= 64 + w; x++) { const e = Math.abs(x - 64) / (w + 0.01); pc.set(x, y, e > 0.75 ? 0x5a1218 : e > 0.4 ? 0x2a060a : 0x080102); }
    }
    // wet sockets under each eye
    for (const [ex, ey, r] of FACE_EYES) {
      const cx = (0.5 + ex / (2 * HW)) * 128, cy = (1 - ey / (2 * HH)) * 128, rp = r / (2 * HW) * 128;
      pc.ellipse(cx, cy, rp * 1.5, rp * 1.25, 0x5a2a28); pc.ellipse(cx, cy, rp * 1.2, rp * 1.0, 0x3a1214);
      for (let a = 0; a < 6; a++) pc.blend(cx + Math.cos(a) * rp * 1.6, cy + Math.sin(a) * rp * 1.4, 0x2a0a0e, 0.6);
    }
  });
  A.add('c_occ_tube', 4, 32, (pc) => { pc.wrap = false; pc.fill(0xf4f8e0); pc.vline(0, 0, 31, 0xd0d4b8); pc.vline(3, 0, 31, 0xe0e4c8); pc.rect(0, 0, 4, 2, 0x8a8a7a); pc.rect(0, 30, 4, 2, 0x8a8a7a); });
  A.add('c_occ_tube_dead', 4, 32, (pc) => { pc.wrap = false; pc.fill(0x9a9c90); pc.vline(0, 0, 31, 0x7a7c70); pc.rect(0, 0, 4, 2, 0x5a5a50); pc.rect(0, 30, 4, 2, 0x5a5a50); pc.set(2, 3, 0x3a3a30); pc.set(1, 28, 0x3a3a30); });
  A.add('c_occ_vein', 8, 8, (pc) => {
    const R = makeRamp(0x4a2a52, 5, { hueShift: -0.03 });
    pc.fillRamp(R, (x, y) => 0.4 + Math.sin(((x + 0.5) / 8) * Math.PI * 2) * 0.3 + (ph(x, y, 9) - 0.5) * 0.1, 0.4);
    pc.vline(5, 0, 7, mixHex(R[4], 0xffffff, 0.3));
  }, 0.125, 0.125);
});

// ---------------------------------------------------------------- build
function buildOccupant(): Rig {
  const K = new SkinKit(2.3);
  K.bone('core', null, [0, 0, 0]);
  K.bone('face', 'core', [0, HH, FACE_Z]);
  for (let i = 0; i < 4; i++) K.bone('s' + i, 'core', [0, HH, SEG_Z[i]]);
  K.bone('mouthL', 'face', [-0.07, 0, 0]);
  K.bone('mouthR', 'face', [0.07, 0, 0]);
  K.bone('veins', 'face', [0, 0, 0.2]);
  for (let i = 0; i < 3; i++) K.bone('fg' + i, 'face', [(i - 1) * 0.6, 0.03 - HH, 0.15]);
  K.bone('t0', 's0', [0.32, HH * 0.98, -0.15]);
  K.bone('t1', 's2', [-0.38, HH * 0.98, 0.1]);
  const eyes: { name: string; at: V3; n: V3; r: number }[] = [];
  FACE_EYES.forEach(([x, y, r], i) => { const fp = facePoint(x, y); eyes.push({ name: 'e' + i, at: [x, y, fp.z], n: fp.n, r }); });
  // a few on the flanks, looking along the walls
  for (let k = 0; k < 6; k++) {
    const s = k % 2 ? 1 : -1, z = 1.35 - Math.floor(k / 2) * 0.55, a = (s > 0 ? 1 : -1) * (Math.PI / 2 - 0.25 - (k % 3) * 0.2);
    const [x, y] = ring(a, 1.0);
    eyes.push({ name: 'e' + (FACE_EYES.length + k), at: [x * 1.0, y, z], n: [Math.sin(a), Math.cos(a) * 0.4, 0.2], r: 0.08 + (k % 3) * 0.02 });
  }
  for (const e of eyes) {
    const parent = e.at[2] > FACE_Z - 0.05 ? 'face' : 's0';
    const pr = K.restOf(parent);
    const yaw = Math.atan2(e.n[0], e.n[2]), pitch = -Math.asin(Math.max(-1, Math.min(1, e.n[1])));
    K.bone(e.name, parent, [e.at[0] - pr[0], e.at[1] - pr[1], e.at[2] - pr[2]], [pitch, yaw, 0]);
  }

  // ---- the mass, lofted along z and blended along the spine
  const centres = [FACE_Z, ...SEG_Z];
  const names = ['face', 's0', 's1', 's2', 's3'];
  const wz = (z: number): [string, number][] => {
    if (z >= centres[0]) return [['face', 1]];
    if (z <= centres[4]) return [['s3', 1]];
    for (let i = 0; i < 4; i++) if (z <= centres[i] && z >= centres[i + 1]) { const w = (centres[i] - z) / (centres[i] - centres[i + 1]); return [[names[i], 1 - w], [names[i + 1], w]]; }
    return [['s1', 1]];
  };
  const AROUND = 16;
  const seamDip = (z: number) => { let d = 0; for (const s of SEAMS) d += Math.exp(-((z - s) ** 2) / 0.006); return d; };
  const loft = (mb: Parameters<typeof surf>[0], z0: number, z1: number, n: number, tex: string, vScale: number) => {
    surf(mb, AROUND, n, (i, j) => {
      const a = (i / AROUND) * Math.PI * 2, z = z0 + (z1 - z0) * (j / n);
      const k = lumps(a, z) * (1 - 0.13 * seamDip(z)) * (z < BACK_Z + 0.5 ? Math.sqrt(Math.max(0.05, 1 - ((BACK_Z + 0.5 - z) / 0.62) ** 2)) : 1);
      const [x, y] = ring(a, k);
      return [x, y, z];
    }, (i, j) => [(i / AROUND) * 7.4, (z0 + (z1 - z0) * (j / n)) * vScale], tex, { inside: null, flip: true });
  };
  // panels of carpet-flesh between the creases, the creases themselves, the rounded back end
  const edges = [FACE_Z, ...SEAMS, BACK_Z];
  K.blend((mb) => {
    for (let k = 0; k < edges.length - 1; k++) {
      const zf = edges[k], zb = edges[k + 1];
      const f0 = k === 0 ? zf : zf - 0.07, b0 = k === edges.length - 2 ? zb : zb + 0.07;
      loft(mb, b0, f0, Math.max(2, Math.round((f0 - b0) / 0.28)), 'c_occ_body', 1);
      if (k < edges.length - 2) loft(mb, zb - 0.07, zb + 0.07, 2, 'c_occ_crease', 4);
    }
    // the face dome
    surf(mb, AROUND, 5, (i, j) => {
      const a = (i / AROUND) * Math.PI * 2, t = j / 5;
      const k = domeK(t) * lumps(a, FACE_Z + t);
      const [x, y] = ring(a, k);
      return [x, y, domeZ(t) + 0.03 * Math.sin(a * 4 + t * 5) * (1 - t)];
    }, (i, j, p) => [0.5 + p[0] / (2 * HW), p[1] / (2 * HH)], 'c_occ_face', { inside: null, flip: true });
  }, (p) => wz(p[2]));

  // ---- teeth lining both lips of every crease
  for (let s = 0; s < SEAMS.length; s++) {
    const zs = SEAMS[s];
    const front = s === 0 ? 'face' : 's' + (s - 1), back = 's' + s;
    for (const [bone, side] of [[front, 1], [back, -1]] as [string, number][]) {
      K.body(bone, (mb) => {
        for (let q = 0; q < 13; q++) {
          const a = -2.1 + (q / 12) * 4.2 + (side > 0 ? 0.08 : -0.08);
          const [x, y] = ring(a, 0.93 * lumps(a, zs));
          const out: V3 = [Math.sin(a) * 0.3, Math.cos(a) * 0.3, -side];
          spike(mb, [x, y, zs + side * 0.06], out, 0.11 + ph(q, s, side + 3) * 0.06, 0.03, q % 4 === 1 ? 'c_an_tooth_dirty' : 'c_an_tooth', 0xffffff, 0, 3);
        }
      });
    }
  }
  // ---- the mouth: two lips of gum down the face with teeth meeting in the middle
  for (const [bone, sx] of [['mouthL', -1], ['mouthR', 1]] as [string, number][]) {
    K.body(bone, (mb) => {
      const pts: V3[] = [];
      for (let k = 0; k <= 6; k++) { const y = 0.32 + (k / 6) * 1.42; const x = sx * (0.05 + Math.sin((k / 6) * Math.PI) * 0.07); pts.push([x, y, facePoint(x, y).z + 0.02]); }
      tube(mb, pts, 0.035, 5, 'c_an_gum', { capStart: true, capEnd: true });
      for (let k = 1; k < 11; k++) {
        const y = 0.38 + (k / 11) * 1.3, x = sx * (0.04 + Math.sin(((y - 0.32) / 1.42) * Math.PI) * 0.06);
        spike(mb, [x, y, facePoint(x, y).z + 0.03], [-sx, 0, 0.35], 0.06 + (k % 3) * 0.015, 0.016, k % 3 ? 'c_an_tooth' : 'c_an_tooth_dirty', 0xffffff, 0, 3);
      }
    });
  }
  // ---- veins throbbing across the face toward the eyes
  K.body('veins', (mb) => {
    for (let k = 0; k < 4; k++) {
      const pts: V3[] = [];
      const x0 = (k < 2 ? -1 : 1) * (0.25 + (k % 2) * 0.12), y0 = 0.5 + k * 0.33;
      for (let q = 0; q <= 7; q++) {
        const x = x0 + (k < 2 ? -1 : 1) * q * 0.09, y = y0 + Math.sin(q * 1.3 + k) * 0.08 + q * 0.02;
        pts.push([x, y, facePoint(x, y).z + 0.012]);
      }
      tube(mb, pts, (t) => 0.02 - t * 0.012, 4, 'c_occ_vein', { capEnd: true });
    }
  });
  // ---- small human fingers along the floor at its leading edge
  for (let i = 0; i < 3; i++) K.body('fg' + i, (mb) => {
    for (let q = 0; q < 3; q++) {
      const x = (i - 1) * 0.6 + (q - 1) * 0.16 + (ph(i, q, 4) - 0.5) * 0.05;
      const z = facePoint(x, 0.12).z - 0.08;
      tube(mb, [[x, 0.03, z], [x, 0.035, z + 0.06], [x + 0.01, 0.025, z + 0.11]], 0.012, 4, 'c_an_flesh_pale', { capEnd: true });
      spike(mb, [x + 0.01, 0.028, z + 0.11], [0, 0.2, 1], 0.012, 0.007, 'c_an_nail', 0xffffff, 0, 3);
    }
  });
  // ---- eyes (glow material, on the root: they show in the dark)
  for (const e of eyes) {
    K.local(e.name, (mb) => {
      blob(mb, [0, 0, -e.r * 0.3], [e.r * 1.25, e.r * 0.85, e.r * 0.7], 7, 3, 'c_an_eye_ball', { fit: true, seam: Math.PI, ao: false });
    }, 'g');
  }
  // ---- swallowed fluorescent tubes: lit (glow) and dead (body) copies
  for (const [b, rot] of [['t0', 0.25], ['t1', -0.3]] as [string, number][]) {
    K.local(b, (mb) => { mb.push().rotateY(rot).rotateX(0.12); mb.box(0, -0.03, 0, 0.07, 0.07, 1.0, 'c_occ_tube', { fit: true, emissive: 1 }); mb.pop(); }, 'g');
  }
  K.body('s0', (mb) => { mb.push().translate(0.32, HH * 0.98, SEG_Z[0] - 0.15).rotateY(0.25).rotateX(0.12); mb.box(0, -0.03, 0, 0.068, 0.068, 0.99, 'c_occ_tube_dead', { fit: true }); mb.pop(); });
  K.body('s2', (mb) => { mb.push().translate(-0.38, HH * 0.98, SEG_Z[2] + 0.1).rotateY(-0.3).rotateX(0.12); mb.box(0, -0.03, 0, 0.068, 0.068, 0.99, 'c_occ_tube_dead', { fit: true }); mb.pop(); });
  const rig = K.finish({ sphere: [0, 1.2, 0, 4.4], onRoot: ['g'] });
  rig.eyes = rig.skins.g ? [rig.skins.g] : undefined;
  rig.root.userData.eyeList = eyes.map((e) => e.name);
  return rig;
}

// ---------------------------------------------------------------- animation
const TMP_V = new THREE.Vector3();
const flickerOn = (t: number, seed: number) => { const q = Math.floor(t * 9 + seed * 17); const h = hashId('f' + q, seed * 100 | 0); return h > 0.12 || (h > 0.05 && ((t * 40) % 1) < 0.5); };
const heartbeat = (t: number) => { const p = (t * 1.05) % 1; return Math.exp(-((p - 0.08) ** 2) / 0.002) + 0.6 * Math.exp(-((p - 0.24) ** 2) / 0.002); };

interface OPose { moving: number; lunge: number; mouth: number; look: [number, number] | null }
function poseOccupant(rig: KRig, o: OPose, t: number, dt: number, ud: Record<string, number>) {
  const P = rig.parts;
  const k = o.moving ? 1 : 0.35;
  ud.ph = (ud.ph ?? 0) + dt * 1.3 * k;
  const ph0 = ud.ph;
  for (let i = 0; i < 4; i++) {
    const s = P['s' + i];
    const w = Math.sin(ph0 - (i + 1) * 1.1);
    const sc = 1 + Math.sin(ph0 - (i + 1) * 1.1 + 1) * 0.045 * k;
    s.position.set(0, HH * sc + Math.max(0, w) * 0.04 * k, SEG_Z[i] + w * 0.11 * k);
    s.scale.set(1 + (sc - 1) * 0.8, sc, 1);
  }
  const fw = Math.sin(ph0 + 0.6);
  P.face.position.set(0, HH, FACE_Z + fw * 0.05 * k + o.lunge * 0.45);
  P.face.scale.set(1 + Math.sin(t * 0.9) * 0.02, 1 + Math.sin(t * 0.9 + 1) * 0.015, 1);
  // the mouth parts like a wound
  const m = o.mouth;
  P.mouthL.position.x = -0.07 - m * 0.14; P.mouthR.position.x = 0.07 + m * 0.14;
  P.mouthL.rotation.y = -m * 0.25; P.mouthR.rotation.y = m * 0.25;
  // veins throb
  const hb = heartbeat(t);
  P.veins.scale.set(1 + hb * 0.03, 1 + hb * 0.03, 1 + hb * 0.4);
  // fingers along the floor wriggle
  for (let i = 0; i < 3; i++) P['fg' + i].rotation.set(Math.sin(t * 3.1 + i * 2) * 0.1, Math.sin(t * 2.3 + i) * 0.06, 0);
  // eyes blink out of step; most of them follow whoever is nearest
  const list: string[] = rig.root.userData.eyeList || [];
  for (let i = 0; i < list.length; i++) {
    const e = P[list[i]];
    const r = hashId('eye' + i, 11);
    const blink = ((t * (0.12 + r * 0.22) + r * 7) % 1) < 0.05;
    e.scale.set(1, blink ? 0.08 : 1, 1);
    const rest = e.userData.restRot as THREE.Euler;
    if (o.look && r > 0.2) {
      const [lx, lz] = o.look;
      const dx = lx - e.position.x - (e.parent === P.face ? 0 : 0), dz = lz - FACE_Z;
      const yaw = Math.atan2(dx, Math.max(0.3, dz));
      e.rotation.set(rest.x * 0.5, rest.y * 0.4 + Math.max(-0.7, Math.min(0.7, yaw - rest.y * 0.4)), 0);
    } else e.rotation.set(rest.x + Math.sin(t * 0.7 + i) * 0.15, rest.y + Math.sin(t * 0.5 + i * 2) * 0.25, 0);
  }
  // swallowed tubes flicker
  const on0 = flickerOn(t, 0.3), on1 = flickerOn(t + 3.1, 0.7);
  P.t0.scale.setScalar(on0 ? 1 : 0.001); P.t1.scale.setScalar(on1 ? 1 : 0.001);
  return [on0, on1];
}

function animateOccupant(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as KRig;
  const n = netOf(c);
  const ud = rig.root.userData as Record<string, number>;
  // fill the corridor: scale the whole mass to its width
  const wTarget = Math.min(1.35, Math.max(0.6, ((n.w ?? 2.4) - 0.15) / 2.3));
  ud.w = (ud.w ?? wTarget) + (wTarget - (ud.w ?? wTarget)) * Math.min(1, dt * 1.5);
  rig.body.scale.x = ud.w;
  const moving = c.speed > 0.05;
  const lunge = c.attackPhase > 0 ? Math.sin((0.38 - Math.min(0.38, c.attackPhase)) / 0.38 * Math.PI) : 0;
  ud.mouth = damp(ud.mouth ?? 0, c.attackPhase > 0 ? 1 : c.state === 'warn' ? 0.75 + Math.sin(t * 4) * 0.15 : 0.08 + Math.max(0, Math.sin(t * 0.4)) * 0.18, 4, dt);
  const p = localIn(c);
  let look: [number, number] | null = null;
  if (p) look = toLocal(c.x, c.z, Math.PI / 2 - c.facing, p.x, p.z);
  const [on0, on1] = poseOccupant(R, { moving: moving ? 1 : 0, lunge, mouth: ud.mouth, look }, t, dt, ud);
  // the tubes it swallowed still light the hall around it, on every peer
  if (live() && rig.root.visible && !c.dead) {
    rig.root.updateMatrixWorld(true);
    for (const [b, on] of [['t0', on0], ['t1', on1]] as [string, boolean][]) {
      if (!on) continue;
      R.parts[b].getWorldPosition(TMP_V);
      G.pointLight(TMP_V.x, TMP_V.y + 0.2, TMP_V.z, 0xe8f0d0, 0.55, 4.5);
    }
  }
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 1, e.a.r ?? 60);
  // dread: the floor shakes, the survivor knows
  if (p && !c.dead && live()) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < 22) G.pr.shake = Math.max(G.pr.shake, (1 - d / 22) * 0.55 * (moving ? 1 : 0.5));
    if (d < 34) thinkOnce(p, 'occupant_near', ['The floor is humming. Something huge is in the halls.', 'Get off the corridor. Find a room with a door.', 'Don\'t breathe. Let it pass.'][Math.floor(t) % 3], 150);
    if (c.visibleToLocal && d < 14) p.body.panic = Math.min(100, p.body.panic + dt * (14 - d) * 0.9);
  }
}

// ---------------------------------------------------------------- brain (host)
interface Route { x: number; y: number; dx: number; dy: number; len: number; s: number }
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const passable = (z: Zone, x: number, y: number, dx: number, dy: number) => z.canStep(x, y, dx, dy, true) && z.floorAt(x + dx, y + dy)?.water !== 'deep';

function runLen(z: Zone, x: number, y: number, dx: number, dy: number, max = 70): number {
  let n = 0;
  while (n < max && passable(z, x, y, dx, dy)) { x += dx; y += dy; n++; }
  return n;
}
/** free width across the run direction at a tile (1 = a one-tile corridor) */
function widthAt(z: Zone, x: number, y: number, dx: number, dy: number): number {
  const px = -dy, py = dx;
  let w = 1;
  for (const s of [1, -1]) { let cx = x, cy = y; for (let k = 0; k < 3; k++) { if (!passable(z, cx, cy, px * s, py * s)) break; cx += px * s; cy += py * s; w++; } }
  return w;
}
/** pick the best onward run from a tile (never straight back unless trapped); `toward` biases it to a heard noise */
function bestRoute(z: Zone, x: number, y: number, from?: [number, number], toward?: { x: number; z: number } | null): Route | null {
  let best: Route | null = null, bs = 0;
  const nd = toward ? Math.hypot(toward.x - x, toward.z - y) || 1 : 1;
  for (const [dx, dy] of DIRS) {
    if (from && dx === -from[0] && dy === -from[1]) continue;
    const len = runLen(z, x, y, dx, dy);
    if (len < 5) continue;
    const w = widthAt(z, x + dx * Math.min(3, len), y + dy * Math.min(3, len), dx, dy);
    const lure = toward ? 1 + 1.5 * Math.max(0, (dx * (toward.x - x) + dy * (toward.z - y)) / nd) : 1;
    const score = len * (w <= 4 ? 1 : 0.45) * (from && dx === from[0] && dy === from[1] ? 1.3 : 1) * lure * rng.float(0.8, 1.2);
    if (score > bs) { bs = score; best = { x, y, dx, dy, len, s: 0 }; }
  }
  if (!best && from) { const len = runLen(z, x, y, -from[0], -from[1]); if (len > 0) best = { x, y, dx: -from[0], dy: -from[1], len, s: 0 }; }
  return best;
}
/** find the end of a long corridor somewhere out of sight and start there */
function findCorridor(z: Zone, c: Creature): Route | null {
  const ps = playersIn(c.zoneKey);
  for (let t = 0; t < 40; t++) {
    const ref = ps.length ? rng.pick(ps) : { x: c.x, z: c.z };
    const a = rng.float(0, Math.PI * 2), r = rng.float(24, 50);
    const x = Math.floor(ref.x + Math.cos(a) * r), y = Math.floor(ref.z + Math.sin(a) * r);
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)] || z.solid[z.idx(x, y)]) continue;
    for (const [dx, dy] of DIRS) {
      const back = runLen(z, x, y, -dx, -dy);
      const sx = x - dx * back, sy = y - dy * back;
      const len = runLen(z, sx, sy, dx, dy);
      if (len < 14 || widthAt(z, sx + dx * 2, sy + dy * 2, dx, dy) > 4) continue;
      if (seenByAny(z, sx + 0.5, sy + 0.5, 40) || ps.some((p) => Math.hypot(p.x - sx, p.z - sy) < 18)) continue;
      return { x: sx, y: sy, dx, dy, len, s: 0 };
    }
  }
  return null;
}

function thinkOccupant(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  const cs = G.creatures;
  hold(c);
  m.life = m.life ?? rng.float(150, 260);
  m.age = (m.age ?? 0) + dt;
  // leaving: once its time is up it simply is not there the next time anyone looks
  if (m.age > m.life && !seenByAny(z, c.x, c.z, 40) && playersIn(c.zoneKey).every((p) => dist(p, c) > 16)) { cs.remove(c); return true; }
  let r: Route | null = m.route;
  if (!r) {
    const tx = Math.floor(c.x), ty = Math.floor(c.z);
    r = bestRoute(z, tx, ty);
    // it belongs in corridors: look for a proper one before settling for an open room
    if (!r || r.len < 10 || widthAt(z, tx + r.dx, ty + r.dy, r.dx, r.dy) > 4) r = findCorridor(z, c) || (r && r.len >= 10 ? r : null);
    if (!r) { m.fails = (m.fails ?? 0) + 1; if (m.fails > 12) cs.remove(c); return true; }
    m.route = r;
    c.facing = c.targetFacing = Math.atan2(r.dy, r.dx);
  }
  // ambience: rumble felt through the floor, distant thuds
  m.rumbleT = (m.rumbleT ?? rng.float(1, 4)) - dt;
  if (m.rumbleT <= 0) { m.rumbleT = rng.float(7, 12); cs.call(c, 'idle'); }
  m.thudT = (m.thudT ?? rng.float(5, 12)) - dt;
  if (m.thudT <= 0) { m.thudT = rng.float(12, 26); cs.call(c, 'call'); }
  // noise draws it: it turns toward what it heard at the next junction and hurries a little
  if (c.lastHeard && G.time - c.lastHeard.t < 0.6 && c.lastHeard.r > 2) m.noise = { x: c.lastHeard.x, z: c.lastHeard.z, t: G.time };
  const lure = m.noise && G.time - m.noise.t < 20 ? m.noise : null;
  const pace = lure && G.time - lure.t < 6 ? c.sp.run : c.sp.walk;
  // blocked by a closed door: press, thud, then go back the way it came
  const i = Math.floor(r.s + 0.5);
  const tx = r.x + r.dx * i, ty = r.y + r.dy * i;
  const nextS = r.s + pace * dt;
  const crossing = Math.floor(nextS + 0.5) > i;
  if (crossing && !passable(z, tx, ty, r.dx, r.dy)) {
    c.setState('warn');
    m.pressT = (m.pressT ?? 0) + dt;
    if (m.pressT > 3.5) {
      m.pressT = 0;
      cs.call(c, 'alert');
      const back = bestRoute(z, tx, ty, [r.dx, r.dy]) || bestRoute(z, tx, ty);
      if (back) { m.route = back; c.targetFacing = Math.atan2(back.dy, back.dx); }
    }
  } else if (r.s >= r.len) {
    // junction or dead end: choose the longest way on
    const nr = bestRoute(z, tx, ty, [r.dx, r.dy], lure);
    if (nr) { m.route = nr; c.targetFacing = Math.atan2(nr.dy, nr.dx); }
    else m.route = null;
  } else {
    c.setState('travel');
    m.pressT = 0;
    r.s = Math.min(r.len, nextS);
  }
  const rr: Route = m.route || r;
  c.x = rr.x + 0.5 + rr.dx * rr.s; c.z = rr.y + 0.5 + rr.dy * rr.s;
  c.speed = c.state === 'travel' ? pace : 0;
  c.phase += c.speed * dt * 1.5;
  n.w = widthAt(z, Math.floor(c.x), Math.floor(c.z), rr.dx, rr.dy);
  // contact: anything inside the mass is crushed
  if (c.attackT <= 0) {
    const fx0 = Math.cos(c.facing), fz0 = Math.sin(c.facing);
    const halfW = Math.min(1.6, n.w * 0.5) + 0.1;
    for (const p of playersIn(c.zoneKey)) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const lon = dx * fx0 + dz * fz0, lat = -dx * fz0 + dz * fx0;
      if (lon > FRONT_Z + 0.35 + p.radius || lon < -2.6 || Math.abs(lat) > halfW + p.radius) continue;
      if (!lineOfSightB(z, c.x, c.z, p.x, p.z)) continue;
      cs.startAttack(c, p);
      break;
    }
  }
  return true;
}

const S = def({
  key: 'occupant', name: 'The Occupant', code: 'E-00 // OCCUPANT', temperament: 'hazard', threat: 5,
  hp: 9999, walk: 0.85, run: 1.3, turn: 1.4, radius: 1.1, height: 2.5, sight: 8, fov: 1, hearing: 1.4,
  attack: { dmg: [55, 80], range: 2.7, cooldown: 1.4, kinds: ['fracture', 'deep', 'bruise'], corrupt: 0.25, knock: 2.8, parts: ['torso_u', 'torso_l', 'head', 'uarm_l', 'uarm_r', 'thigh_l', 'thigh_r'] },
  zones: ['lobby', 'tunnels', 'stairwell', 'parking', 'corrupt'], weight: 0.2, maxPerZone: 1,
  flags: { leviathan: true, immortal: true, noCorpse: true },
  sounds: snd({ idle: 'leviathan_rumble', alert: 'door_kick', call: 'thud_distant', attack: 'occupant_crush', hurt: 'occupant_groan', step: 'occupant_drag' }),
  scan: {
    cls: 'Leviathan / environmental hazard',
    notes: [
      'Fills the corridor wall to wall. Carpet, grown into something alive. Many eyes.',
      'Heard long before seen: a rumble through the floor. When the floor hums, get off the long hallways.',
      'Cannot be hurt. Contact crushes. It never turns into side rooms and cannot open doors: close one between you and it.',
      'Noise draws it: running, shouting and gunfire turn it your way at the next junction. Stay quiet and let it pass.',
    ],
  },
  gore: { blood: 'none' },
  build: buildOccupant,
  animate: animateOccupant,
  think: thinkOccupant,
});
/** gallery poses: crawl (default), still, attack (mouth and lunge), warn (pressing at a door) */
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const ud = rig.root.userData as Record<string, number>;
  const dt = 1 / 60;
  const lunge = q === 'attack' ? Math.max(0, Math.sin((t * 1.3) % (Math.PI))) : 0;
  ud.mouth = damp(ud.mouth ?? 0, q === 'attack' || q === 'warn' ? 0.85 : 0.12, 4, dt);
  poseOccupant(rig as KRig, { moving: q === 'still' || q === 'warn' ? 0 : 1, lunge, mouth: ud.mouth, look: [Math.sin(t * 0.6) * 3, 4] }, t, dt, ud);
  void fakeCreature;
};

// "STANCE": dramatic-pose statuettes on stepped plinths. A posed figure is
// built from a skeleton of points (pelvis, chest, neck, head, shoulders,
// elbows, hands, hips, knees, ankles): a faceted hull torso and pelvis,
// tapered limb segments, ball joints, block hands and feet, then dressed per
// character. Heroic proportions, twisted torsos, weight on one leg.
import * as THREE from 'three';
import { DecoBuilder, type DMats, type DKey, at, along, cbox, prism, lathe, extrude, ngon, hull, band, printMat, paintPix, jitter } from './kit';
import { ball, limb, knob, leafGeo, plinth, labelCanvas, Glint, Spring, scaled, type DecoModel, type V3 } from './parts';

export interface Skel {
  pelvis: V3; chest: V3; neck: V3; head: V3;
  shL: V3; elL: V3; haL: V3; shR: V3; elR: V3; haR: V3;
  hpL: V3; knL: V3; anL: V3; hpR: V3; knR: V3; anR: V3;
  /** head rotation (rx tilt back -, ry turn, rz roll) */
  headRot?: V3;
}
export interface Look {
  skin: number; top: number; sleeve?: number; pants: number; shoes: number; hands?: number;
  /** limb thickness multiplier */
  build?: number;
  key?: DKey;
  /** shoulder / hip half-widths for the hull */
  hips?: number;
}

const v = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mid = (a: V3, b: V3, t = 0.5): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** the body's frame at the chest: right, up, forward */
function frame(s: Skel) {
  const right = v(s.shR).sub(v(s.shL)).normalize();
  const up = v(s.chest).sub(v(s.pelvis)).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
  return { right, up, fwd };
}
const arr = (x: THREE.Vector3): V3 => [x.x, x.y, x.z];

/** build the posed body into b */
export function figure(b: DecoBuilder, s: Skel, L: Look) {
  const k = L.build ?? 1, key = L.key ?? 'vinyl';
  const { right, fwd } = frame(s);
  const R = arr(right), F = arr(fwd);
  // torso: a hull round the shoulders, the ribs and the waist
  const waist = mid(s.pelvis, s.chest, 0.45);
  const tp: V3[] = [];
  for (const sh of [s.shL, s.shR]) {
    const side = sh === s.shL ? -1 : 1;
    const o = add(sh, R, side * 0.022);
    tp.push(add(add(o, F, 0.045 * k), [0, 0.012, 0]), add(add(o, F, -0.04 * k), [0, 0.012, 0]), add(add(o, F, 0.04 * k), [0, -0.05, 0]), add(add(o, F, -0.045 * k), [0, -0.05, 0]));
  }
  for (const side of [-1, 1]) {
    tp.push(add(add(waist, R, side * 0.08 * k), F, 0.05 * k), add(add(waist, R, side * 0.08 * k), F, -0.045 * k));
    tp.push(add(add(s.chest, R, side * 0.1 * k), F, 0.075 * k), add(add(s.chest, R, side * 0.1 * k), F, -0.055 * k));
  }
  b.add(key, hull(tp), L.top, undefined, { tone: 0.16 });
  // pelvis
  const hw = L.hips ?? 0.095;
  const pp: V3[] = [];
  for (const side of [-1, 1]) {
    const hp = side < 0 ? s.hpL : s.hpR;
    pp.push(add(add(hp, R, side * 0.03), F, 0.05 * k), add(add(hp, R, side * 0.03), F, -0.055 * k), add(add(hp, [0, -0.05, 0]), F, 0.03));
    pp.push(add(add(waist, R, side * hw * 0.8), F, 0.05 * k), add(add(waist, R, side * hw * 0.8), F, -0.045 * k));
  }
  b.add(key, hull(pp), L.pants, undefined, { tone: 0.16 });
  // neck and head
  const nb = mid(s.shL, s.shR);
  limb(b, key, add(nb, [0, -0.01, 0]), s.neck, 0.032 * k, 0.028 * k, L.skin);
  const hr = s.headRot ?? [0, 0, 0];
  b.add(key, cbox(0.125, 0.155, 0.14, 0.035, 0.08), L.skin, at(s.head[0], s.head[1], s.head[2], hr[0], hr[1], hr[2]));
  b.add(key, hull([[-0.055, -0.07, 0.02], [0.055, -0.07, 0.02], [-0.03, -0.095, 0.055], [0.03, -0.095, 0.055], [-0.06, -0.02, 0.06], [0.06, -0.02, 0.06], [0, -0.06, 0.075]]), L.skin, at(s.head[0], s.head[1], s.head[2], hr[0], hr[1], hr[2]));
  b.add(key, cbox(0.022, 0.04, 0.03, 0.008), L.skin, headAt(s, 0, -0.01, 0.075));
  // arms
  for (const [sh, el, ha] of [[s.shL, s.elL, s.haL], [s.shR, s.elR, s.haR]] as [V3, V3, V3][]) {
    knob(b, key, sh, 0.04 * k, L.sleeve ?? L.top);
    limb(b, key, sh, el, 0.034 * k, 0.029 * k, L.sleeve ?? L.top);
    knob(b, key, el, 0.029 * k, L.sleeve ?? L.top);
    limb(b, key, el, ha, 0.029 * k, 0.022 * k, L.sleeve ?? L.top);
    const d = v(ha).sub(v(el)).normalize();
    const hc = add(ha, arr(d), 0.035);
    b.add(key, cbox(0.042, 0.075, 0.03, 0.01), L.hands ?? L.skin, along(add(hc, arr(d), -0.03), add(hc, arr(d), 0.03), 0));
  }
  // legs
  for (const [hp, kn, an] of [[s.hpL, s.knL, s.anL], [s.hpR, s.knR, s.anR]] as [V3, V3, V3][]) {
    limb(b, key, hp, kn, 0.05 * k, 0.04 * k, L.pants);
    knob(b, key, kn, 0.04 * k, L.pants);
    limb(b, key, kn, an, 0.039 * k, 0.03 * k, L.pants);
    const yaw = Math.atan2(F[0], F[2]) + (an === s.anL ? -0.15 : 0.15);
    b.add(key, cbox(0.065, 0.045, 0.14, 0.015, 0.1), L.shoes, at(an[0] + Math.sin(yaw) * 0.03, an[1] - 0.02, an[2] + Math.cos(yaw) * 0.03, 0, yaw, 0));
  }
}
/** a transform in the head's own frame (for faces, hats, hair) */
export function headAt(s: Skel, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sc: number | V3 = 1): THREE.Matrix4 {
  const hr = s.headRot ?? [0, 0, 0];
  const hm = at(s.head[0], s.head[1], s.head[2], hr[0], hr[1], hr[2]);
  return hm.multiply(at(x, y, z, rx, ry, rz, sc));
}
function eyes(b: DecoBuilder, s: Skel, col = 0x1a1210, white = 0xe8e4dc) {
  for (const x of [-0.03, 0.03]) {
    b.add('gloss', cbox(0.026, 0.014, 0.01, 0.003), white, headAt(s, x, 0.012, 0.07));
    b.add('gloss', cbox(0.011, 0.012, 0.01, 0.003), col, headAt(s, x, 0.012, 0.074));
    b.add('vinyl', cbox(0.032, 0.007, 0.014, 0.003), 0x2a1a12, headAt(s, x, 0.032, 0.07, 0, 0, x < 0 ? -0.12 : 0.12));
  }
  b.add('vinyl', cbox(0.03, 0.006, 0.01, 0.002), 0x7a3a30, headAt(s, 0, -0.045, 0.072));
}

/** wrap a statue: plinth, the figure scaled, a name strip, glint and a breath of sway */
function finish(b: DecoBuilder, mats: DMats, size: number, label: string, seed: number, extra?: (root: THREE.Group) => ((t: number, dt: number) => void) | void): DecoModel {
  const strip = printMat('slabel:' + label, () => labelCanvas(label.toUpperCase(), 0x2a2010, '#f0d890', 96));
  b.print(strip, 0.28, 0.28 * 18 / 96, 0.006, at(0, 0.04, 0.265 * Math.cos(Math.PI / 8) + 0.002, 0, 0, 0));
  const root = new THREE.Group();
  root.add(b.build(mats));
  const upd = (extra?.(root) || null) as ((t: number, dt: number) => void) | null;
  const glint = new Glint([[0.1, 0.9, 0.1], [-0.12, 0.7, 0.12], [0.05, 0.5, 0.14], [0.2, 0.18, 0.2]], 0.12, seed);
  root.add(glint.sprite);
  const wob = new Spring(90, 5);
  return {
    obj: scaled(root, size / 1.15),
    update(t, dt) { glint.update(dt); root.rotation.z = wob.step(dt) * 0.04; if (upd) upd(t, dt); },
    poke() { wob.kick(3); },
  };
}
const PL = 0.12;
const lift = (s: Skel): Skel => { const o: Record<string, V3> = {}; for (const [k, p] of Object.entries(s) as [string, V3][]) o[k] = k === 'headRot' ? p : [p[0], p[1] + PL, p[2]]; return o as unknown as Skel; };

// ------------------------------------------------------------------ the statues
export function statueDebtor(mats: DMats, size: number): DecoModel {
  const b = new DecoBuilder();
  plinth(b, 0.3, PL, 0x26241f);
  const s = lift({
    pelvis: [0, 0.5, 0.02], chest: [0, 0.72, 0.07], neck: [0, 0.83, 0.1], head: [0, 0.93, 0.14], headRot: [-0.25, 0.1, 0.05],
    shL: [-0.12, 0.8, 0.08], elL: [-0.17, 0.87, 0.23], haL: [-0.14, 0.96, 0.36],
    shR: [0.12, 0.8, 0.06], elR: [0.21, 0.67, -0.05], haR: [0.23, 0.57, -0.16],
    hpL: [-0.07, 0.48, 0.04], knL: [-0.08, 0.3, 0.2], anL: [-0.08, 0.06, 0.16],
    hpR: [0.07, 0.48, 0.0], knR: [0.08, 0.27, -0.1], anR: [0.08, 0.07, -0.27],
  });
  figure(b, s, { skin: 0xd39b6c, top: 0xe2b21e, pants: 0xd8a818, shoes: 0x24201c });
  eyes(b, s);
  b.add('vinyl', cbox(0.135, 0.06, 0.15, 0.03), 0x3b2a1e, headAt(s, 0, 0.07, -0.005));
  b.add('vinyl', cbox(0.135, 0.1, 0.04, 0.015), 0x3b2a1e, headAt(s, 0, 0.02, -0.065));
  b.add('rubber', prism(0.03, 0.03, 8), 0x1a1c1e, along(add(s.haL, [0, -0.06, -0.06]), s.haL));
  b.add('glow', cbox(0.012, 0.01, 0.01, 0.002), 0xff3a20, at(s.haL[0], s.haL[1] - 0.02, s.haL[2] - 0.02));
  b.print(printMat('patch:dnum2', () => labelCanvas('D-0413', 0x16151a, '#f0f0e8', 40)), 0.06, 0.027, 0.005, at(-0.05, s.chest[1] + 0.03, s.chest[2] + 0.08, -0.15, 0, 0));
  // the wall he is coming through: a rippling slab of jelly, light caught in its drips
  const wall: [number, number][] = [];
  for (let i = 0; i <= 10; i++) wall.push([-0.32 + i * 0.064, 1.18 + Math.sin(i * 1.7) * 0.03]);
  wall.push([0.32, PL], [-0.32, PL]);
  b.add('glass', jitter(extrude(wall, 0.08, 0.01), 0.015, 3), 0x6ad0c0, at(0, 0, -0.16));
  b.add('gloss', jitter(extrude([[-0.3, 0], [0.3, 0], [0.3, 0.04], [-0.3, 0.04]], 0.1, 0.01), 0.008, 5), 0x2a6a64, at(0, PL, -0.16));
  for (let i = 0; i < 5; i++) b.add('glow', cbox(0.012, 0.05 + (i % 3) * 0.03, 0.012, 0.004), 0x9af0e0, at(-0.24 + i * 0.12, 0.6 + Math.sin(i * 2.3) * 0.25, -0.115));
  return finish(b, mats, size, 'Breakthrough', 11);
}

export function statueVoss(mats: DMats, size: number): DecoModel {
  const b = new DecoBuilder(), hb = new DecoBuilder();
  // the projector plinth: brass and bakelite, a lens looking up
  b.add('gloss', prism(0.3, 0.07, 8, { rTop: 0.28, c: 0.015 }), 0x2a1c12, at(0, 0.035, 0));
  b.add('brass', prism(0.22, 0.05, 8, { rTop: 0.18, c: 0.01 }), 0xb08a3a, at(0, 0.095, 0));
  b.add('metal', prism(0.06, 0.03, 8, { c: 0.008 }), 0x6a6e72, at(0, 0.13, 0));
  b.add('glow', lathe([[0, 0], [0.045, 0], [0.03, 0.02], [0, 0.024]], 8, 0.5), 0xffc070, at(0, 0.145, 0));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add('brass', cbox(0.02, 0.012, 0.02, 0.004), 0xd0aa50, at(Math.cos(a) * 0.2, 0.125, Math.sin(a) * 0.2, 0, -a, 0)); }
  const s = lift({
    pelvis: [0, 0.5, 0], chest: [0, 0.72, 0.01], neck: [0, 0.84, 0], head: [0, 0.94, 0.01], headRot: [-0.12, 0, 0],
    shR: [0.12, 0.81, 0.02], elR: [0.16, 0.84, 0.19], haR: [0.17, 0.87, 0.35],
    shL: [-0.12, 0.81, 0], elL: [-0.23, 0.66, -0.05], haL: [-0.13, 0.55, 0.02],
    hpL: [-0.08, 0.48, 0], knL: [-0.14, 0.26, 0.03], anL: [-0.17, 0.05, 0.02],
    hpR: [0.08, 0.48, 0], knR: [0.13, 0.26, 0.04], anR: [0.16, 0.05, 0.05],
  });
  const A = 0xffb048;
  figure(hb, s, { skin: A, top: 0xe8902a, pants: 0xd88024, shoes: 0xb06018, key: 'holo', build: 1.05 });
  hb.add('holo', cbox(0.16, 0.05, 0.16, 0.03, 0.15, 0.03), 0xff9a30, headAt(s, 0.015, 0.075, 0, 0, 0, -0.18));
  for (const x of [-0.03, 0.03]) hb.add('holo', cbox(0.03, 0.008, 0.01, 0.002), 0xffe0a0, headAt(s, x, 0.02, 0.072, 0, 0, x < 0 ? 0.3 : -0.3));
  // the beam
  hb.add('holo', lathe([[0.03, 0], [0.24, 1.0], [0, 1.0]], 8, 0.5), 0x3a2008, at(0, 0.15, 0));
  const g = finish(b, mats, size, 'Remit!', 23, (root) => {
    const holo = hb.build(mats, false);
    root.add(holo);
    const m = (holo.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    let slip = 0;
    return (t, dt) => {
      // old film: 24 fps flicker, the frame slipping now and then
      const f = Math.floor(t * 24);
      m.opacity = 0.5 + ((f * 7919) % 13) / 13 * 0.18;
      if (Math.random() < dt * 0.25) slip = 0.12;
      slip = Math.max(0, slip - dt);
      holo.position.y = slip > 0 ? Math.sin(t * 80) * 0.006 : 0;
      holo.position.x = slip > 0 ? 0.004 : 0;
    };
  });
  return g;
}

export function statueGuard(mats: DMats, size: number): DecoModel {
  const b = new DecoBuilder();
  plinth(b, 0.3, PL, 0x22242a, 0x9a9ea2);
  const s = lift({
    pelvis: [0, 0.46, 0], chest: [0, 0.68, 0.05], neck: [0, 0.79, 0.08], head: [0, 0.89, 0.1], headRot: [0.1, -0.2, 0],
    shL: [-0.12, 0.77, 0.05], elL: [-0.18, 0.66, 0.17], haL: [-0.1, 0.68, 0.26],
    shR: [0.12, 0.77, 0.03], elR: [0.24, 0.9, -0.02], haR: [0.2, 1.05, -0.06],
    hpL: [-0.08, 0.45, 0.02], knL: [-0.12, 0.28, 0.2], anL: [-0.12, 0.05, 0.22],
    hpR: [0.08, 0.45, -0.01], knR: [0.12, 0.24, -0.12], anR: [0.14, 0.05, -0.3],
  });
  figure(b, s, { skin: 0xe8b98f, top: 0x34406a, pants: 0x2c3658, shoes: 0x141414, hands: 0x18181a, build: 1.1 });
  eyes(b, s);
  b.add('vinyl', cbox(0.16, 0.1, 0.17, 0.045, 0.15), 0x2a3450, headAt(s, 0, 0.05, -0.005));
  b.add('glass', cbox(0.15, 0.07, 0.02, 0.008), 0x6a8aa0, headAt(s, 0, 0.0, 0.085, 0.15, 0, 0));
  // the baton raised, the riot shield
  b.add('rubber', prism(0.014, 0.3, 8, { c: 0.003 }), 0x161616, along(add(s.haR, [-0.04, -0.05, 0]), add(s.haR, [0.06, 0.25, 0.04])));
  const sh = band(0.4, 0.4, 0.46, 0.014, 28, 0.13, -0.29);
  b.add('glass', sh, 0x90a8c0, at(s.haL[0] + 0.02, s.haL[1] - 0.02, s.haL[2] - 0.34, 0.05, 0.1, 0));
  b.add('rubber', band(0.41, 0.41, 0.03, 0.02, 28, 0.13, -0.29), 0x16181c, at(s.haL[0] + 0.02, s.haL[1] + 0.21, s.haL[2] - 0.34, 0.05, 0.1, 0));
  b.add('rubber', band(0.41, 0.41, 0.03, 0.02, 28, 0.13, -0.29), 0x16181c, at(s.haL[0] + 0.02, s.haL[1] - 0.25, s.haL[2] - 0.34, 0.05, 0.1, 0));
  b.print(printMat('shield-sten', () => labelCanvas('SECURITY', 0x0e1014, '#e8e8e0', 56)), 0.16, 0.16 * 18 / 56, 0.004, at(s.haL[0] + 0.0, s.haL[1] + 0.1, s.haL[2] + 0.07, 0.05, 0.1, 0));
  b.add('brass', extrude([[0, 0.025], [0.02, 0.015], [0.016, -0.01], [0, -0.025], [-0.016, -0.01], [-0.02, 0.015]], 0.008, 0.002), 0xd0b060, at(s.chest[0] - 0.05, s.chest[1] + 0.03, s.chest[2] + 0.085, -0.2, 0, 0));
  return finish(b, mats, size, 'Hold the Line', 31);
}

export function statueResearcher(mats: DMats, size: number): DecoModel {
  const b = new DecoBuilder();
  plinth(b, 0.3, PL, 0x2e2a30, 0xc0a060);
  const s = lift({
    pelvis: [0.02, 0.5, 0], chest: [-0.005, 0.72, 0.0], neck: [-0.02, 0.83, 0.0], head: [-0.03, 0.93, 0.02], headRot: [-0.35, 0.25, 0.08],
    shR: [0.105, 0.8, 0], elR: [0.19, 0.92, 0.03], haR: [0.16, 1.07, 0.06],
    shL: [-0.11, 0.8, 0], elL: [-0.16, 0.76, 0.12], haL: [-0.07, 0.88, 0.1],
    hpL: [-0.06, 0.49, 0], knL: [-0.065, 0.27, 0.0], anL: [-0.06, 0.05, 0.0],
    hpR: [0.085, 0.49, 0], knR: [0.06, 0.28, 0.08], anR: [0.12, 0.07, 0.03],
  });
  figure(b, s, { skin: 0xf0c8a8, top: 0xeceae2, pants: 0x2a2a36, shoes: 0x3a2018, build: 0.92, hips: 0.11 });
  eyes(b, s, 0x3a6a4a);
  // hair: the bun and a loose lock; glasses
  b.add('vinyl', cbox(0.14, 0.07, 0.155, 0.03), 0x8a3a1c, headAt(s, 0, 0.065, -0.005));
  b.add('vinyl', cbox(0.14, 0.11, 0.05, 0.02), 0x8a3a1c, headAt(s, 0, 0.01, -0.06));
  b.add('vinyl', ball(0.045, 7), 0x8a3a1c, headAt(s, 0, 0.06, -0.09));
  b.add('vinyl', cbox(0.02, 0.1, 0.03, 0.008), 0x8a3a1c, headAt(s, -0.07, -0.02, 0.04, 0, 0, 0.1));
  for (const x of [-0.032, 0.032]) b.add('rubber', extrude(ngon(0.022, 6, 0.5, 1.2, 0.9), 0.006, 0, [ngon(0.017, 6, 0.5, 1.2, 0.9).reverse()]), 0x1a1418, headAt(s, x, 0.012, 0.082));
  // the coat: flared tails behind and at the sides, lapels
  for (const [ang, w] of [[Math.PI, 0.2], [Math.PI * 0.62, 0.12], [-Math.PI * 0.62, 0.12]] as [number, number][]) {
    const p: [number, number][] = [[-w / 2, 0], [w / 2, 0], [w / 2 + 0.05, -0.3], [-w / 2 - 0.03, -0.32]];
    b.add('cloth', extrude(p, 0.012, 0.003), 0xe4e2da, at(s.pelvis[0] + Math.sin(ang) * 0.1, s.pelvis[1] + 0.06, s.pelvis[2] + Math.cos(ang) * 0.09, Math.cos(ang) * -0.35, ang, Math.sin(ang) * 0.3));
  }
  b.add('cloth', extrude([[-0.03, 0.07], [0.03, 0.07], [0, -0.04]], 0.01, 0), 0x2a8a8a, at(s.chest[0], s.chest[1] + 0.045, s.chest[2] + 0.075));
  b.print(printMat('patch:rid2', () => labelCanvas('STAFF', 0xe8ecf0, '#1a3a6a', 36)), 0.04, 0.022, 0.004, at(s.chest[0] - 0.06, s.chest[1] + 0.01, s.chest[2] + 0.08));
  // the vial held up to the light
  const vial = add(s.haR, [0, 0.07, 0.01]);
  b.add('glass', lathe([[0.016, -0.05], [0.018, -0.045], [0.018, 0.03], [0.01, 0.04], [0.01, 0.06]], 7, 0.5), 0xd8f0f0, at(...vial));
  b.add('glow', lathe([[0, -0.046], [0.014, -0.042], [0.014, 0.0], [0, 0.0]], 7, 0.5), 0x7aff9a, at(...vial));
  b.add('rubber', prism(0.012, 0.016, 7), 0x6a3a2a, at(vial[0], vial[1] + 0.065, vial[2]));
  const g = finish(b, mats, size, 'Eureka', 37);
  const light = new THREE.PointLight(0x7aff9a, 0.5, 1.2, 2);
  light.position.set(vial[0], vial[1] + 0.02, vial[2]);
  (g.obj.children[0] as THREE.Group).add(light);
  g.light = light;
  const base = g.update!;
  g.update = (t, dt) => { base(t, dt); light.intensity = 0.4 + Math.sin(t * 2.1) * 0.08; };
  return g;
}

export function statueLintel(mats: DMats, size: number): DecoModel {
  const b = new DecoBuilder(), leafL = new DecoBuilder(), leafR = new DecoBuilder();
  plinth(b, 0.32, PL, 0x2a2420, 0xa08850);
  const cream = 0xd8ccae, Y = PL;
  // two posts for legs (one stepping forward), the lintel beam leaning out, the keyhole plate
  b.add('wood', cbox(0.07, 0.78, 0.09, 0.012), cream, at(-0.2, Y + 0.39, 0.02, 0.06, 0, 0.04), { grain: 'y' });
  b.add('wood', cbox(0.07, 0.74, 0.09, 0.012), cream, at(0.2, Y + 0.37, -0.04, -0.12, 0, -0.04), { grain: 'y' });
  for (const x of [-0.2, 0.2]) b.add('wood', cbox(0.1, 0.05, 0.12, 0.012), 0xb8ac90, at(x, Y + 0.025, x < 0 ? 0.04 : -0.08));
  b.add('wood', cbox(0.62, 0.11, 0.13, 0.015), cream, at(0, Y + 0.82, 0.02, 0.18, 0, 0.05), { grain: 'x' });
  b.add('wood', cbox(0.66, 0.035, 0.15, 0.01), 0xc0b494, at(0, Y + 0.89, 0.03, 0.18, 0, 0.05), { grain: 'x' });
  b.add('brass', extrude([[-0.05, 0.07], [0.05, 0.07], [0.055, -0.07], [-0.055, -0.07]], 0.012, 0.003), 0xc0a050, at(0, Y + 0.82, 0.1, 0.18, 0, 0.05));
  b.add('rubber', extrude([[-0.012, 0.03], [0.012, 0.03], [0.014, 0.0], [0.006, -0.004], [0.012, -0.04], [-0.012, -0.04], [-0.006, -0.004], [-0.014, 0.0]], 0.006, 0), 0x050404, at(0, Y + 0.82, 0.108, 0.18, 0, 0.05));
  b.add('glow', cbox(0.008, 0.008, 0.004, 0.001), 0xffe0a0, at(0, Y + 0.835, 0.112));
  // the curtain of long teeth in the doorway
  for (let i = 0; i < 11; i++) {
    const x = -0.15 + i * 0.03, len = 0.12 + ((i * 37) % 7) * 0.025;
    b.add('gloss', lathe([[0.012, 0], [0.008, -len * 0.6], [0, -len]], 5, 0.5), 0xe8e0c8, at(x, Y + 0.77 - (i % 2) * 0.01, 0.03 + (i % 3) * 0.01, 0.18, 0, 0.05));
  }
  // door leaves for arms, flung open on their hinges
  const leaf = (d: DecoBuilder, s: number) => {
    d.add('wood', cbox(0.24, 0.6, 0.025, 0.006), 0x8a5a34, at(s * 0.12, -0.3, 0), { grain: 'y' });
    for (const [y, h] of [[-0.13, 0.18], [-0.42, 0.26]]) d.add('wood', cbox(0.17, h, 0.02, 0.005), 0x7a4e2c, at(s * 0.12, y, 0.01), { grain: 'y' });
    d.add('brass', ball(0.018, 6), 0xd0aa48, at(s * 0.21, -0.3, 0.025));
  };
  leaf(leafL, -1); leaf(leafR, 1);
  return finish(b, mats, size, 'The Lintel', 43, (root) => {
    const L = leafL.build(mats), R = leafR.build(mats);
    const pl = new THREE.Group(), pr = new THREE.Group();
    pl.position.set(-0.26, Y + 0.76, 0.05); pr.position.set(0.26, Y + 0.76, 0.0);
    pl.add(L); pr.add(R);
    root.add(pl, pr);
    return (t) => { pl.rotation.y = -1.1 + Math.sin(t * 0.8) * 0.12; pr.rotation.y = 0.75 + Math.sin(t * 0.8 + 1.4) * 0.1; pl.rotation.z = -0.2; pr.rotation.z = 0.15; };
  });
}

export function statueDoe(mats: DMats, size: number): DecoModel {
  const b = new DecoBuilder();
  plinth(b, 0.3, PL, 0x24261f, 0x9a8a5a);
  const hide = 0xb08a64, pale = 0xd8c0a0, Y = PL;
  // the body hung high, the arched neck, the eyeless face
  const body = [-0.05, Y + 0.78, 0] as V3;
  b.add('vinyl', jitter(hull([[-0.2, -0.05, -0.05], [0.18, -0.06, -0.05], [-0.2, -0.05, 0.05], [0.18, -0.06, 0.05], [-0.22, 0.05, 0], [0.2, 0.06, 0], [-0.1, 0.08, -0.06], [-0.1, 0.08, 0.06], [0.1, 0.09, -0.065], [0.1, 0.09, 0.065], [0.0, -0.09, 0]]), 0.01, 2), hide, at(...body));
  b.add('vinyl', hull([[-0.06, -0.08, -0.03], [0.06, -0.09, -0.03], [-0.06, -0.08, 0.03], [0.06, -0.09, 0.03], [0, -0.1, 0]]), pale, at(...body));
  const n0: V3 = [body[0] + 0.17, body[1] + 0.04, 0], n1: V3 = [body[0] + 0.26, body[1] + 0.22, 0], n2: V3 = [body[0] + 0.22, body[1] + 0.36, 0];
  limb(b, 'vinyl', n0, n1, 0.05, 0.035, hide); limb(b, 'vinyl', n1, n2, 0.035, 0.03, hide);
  knob(b, 'vinyl', n1, 0.036, hide);
  b.add('vinyl', hull([[-0.03, -0.03, -0.035], [-0.03, -0.03, 0.035], [-0.03, 0.04, -0.03], [-0.03, 0.04, 0.03], [0.1, -0.03, -0.018], [0.1, -0.03, 0.018], [0.1, 0.0, -0.016], [0.1, 0.0, 0.016]]), pale, at(n2[0], n2[1] + 0.02, 0, 0, 0, -0.35));
  for (const z of [-1, 1]) b.add('vinyl', leafGeo(0.09, 0.05, 0.01, 4), hide, at(n2[0] - 0.02, n2[1] + 0.05, z * 0.03, z * 0.5, 0, 0.6));
  // four stilt legs with knuckled knees; the near foreleg raised
  const legs: [V3, V3, V3][] = [
    [[body[0] + 0.14, body[1] - 0.04, 0.05], [body[0] + 0.24, body[1] - 0.3, 0.07], [body[0] + 0.17, body[1] - 0.42, 0.08]],
    [[body[0] + 0.14, body[1] - 0.04, -0.05], [body[0] + 0.18, body[1] - 0.38, -0.06], [body[0] + 0.2, Y + 0.02, -0.07]],
    [[body[0] - 0.17, body[1] - 0.04, 0.05], [body[0] - 0.26, body[1] - 0.36, 0.06], [body[0] - 0.22, Y + 0.02, 0.07]],
    [[body[0] - 0.17, body[1] - 0.04, -0.05], [body[0] - 0.12, body[1] - 0.4, -0.06], [body[0] - 0.2, Y + 0.02, -0.07]],
  ];
  for (const [a, k, f] of legs) {
    limb(b, 'vinyl', a, k, 0.026, 0.016, hide, 5); knob(b, 'vinyl', k, 0.022, pale, 5); limb(b, 'vinyl', k, f, 0.016, 0.012, hide, 5);
    b.add('gloss', lathe([[0.016, 0], [0.012, -0.03], [0, -0.035]], 5, 0.5), 0x2a2018, at(f[0], f[1] + 0.03, f[2]));
  }
  b.add('vinyl', leafGeo(0.06, 0.04, 0.01, 4), pale, at(body[0] - 0.21, body[1] + 0.04, 0, 0, 0, 1.9));
  return finish(b, mats, size, 'Stilt Doe', 53);
}

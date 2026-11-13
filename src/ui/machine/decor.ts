// THE MACHINE'S LITTLE THINGS (round 16): real 3D objects that live on the panels and
// stand in for icons, drawn by the one shared renderer (core.ts) like the housings:
//
//   jar       a specimen jar: a riveted plinth, a brass lid on clamp straps, murky fixative,
//             and a small eye creature (an eyeball in a fleshy hood, trailing tendrils and its
//             nerve) that floats, blinks, and turns to watch the cursor
//   beacon    a caged rotating warning light on a bracket: dark glass at rest; on an alert
//             the reflector turns and sweeps a beam (amber, red or green)
//   gears     a meshing train of three gears (brass, steel, iron) on a bolted bracket, turning
//   wrench    a ring spanner hung on a peg; it swings when the pointer brushes it
//   valve     a pipe run with flanges and a red handwheel valve; a click turns the wheel
//   buttons   a little push-button box (mushroom heads, a guard collar, lamps that blink on
//             their own); the heads sink when pressed
//   gauge     a pressure gauge whose needle wanders
//
// Nothing renders per frame. Each object is drawn once per state into a cached sprite sheet
// (core.ts sheet()); a small shared clock flips frames only while something moves (a gear
// turns, a beacon sweeps, the eye looks, a tendril sways) and only while it is on screen.
// mxIcon(kind) gives the same kind of little model as a key icon.
import * as THREE from 'three';
import { sheet, mxOk, mxMat, SHEAR, type ShotOpts } from './core';
import { Mold, M, STEEL, CHROME, BRASS, RUBBER, PLASTIC, PAINT, GLASS, PAPER } from '../touch/stage3d';
import { fcyl, fbox, fdome, fring, frod, plate, clipRect, gem, flathe, ngon } from '../touch/facet';
import { meshOf, bolt, screw, R90 } from './parts';
import { TONES, labelCanvas, canvasTex, hh, mixC } from './paint';
import { mxGauge } from './kit';
import { sfx } from '../menus/sfx';

const PI = Math.PI, TAU = PI * 2;
const reduce = () => document.documentElement.classList.contains('reduce-flash') || !!document.body?.classList.contains('reduce-flash');
/** free-standing objects are drawn straight on (they carry their own tilt); wall-mounted ones in the panels' oblique */
const FREE: ShotOpts = { shear: [0, 0], shadow: [2, 3], shadowA: 0.45 };
const WALL: ShotOpts = { shear: SHEAR, shadow: [2, 3], shadowA: 0.45 };

// ---------------------------------------------------------------- the shared clock
interface Ticker { el: HTMLElement; tick(now: number, dt: number): void; seen: number }
const tickers = new Set<Ticker>();
let raf = 0, lastT = 0;
function loop(now: number) {
  raf = 0;
  const dt = Math.max(0, Math.min(0.1, (now - lastT) / 1000)); lastT = Math.max(lastT, now);
  for (const t of [...tickers]) {
    if (!t.el.isConnected) { if (now - t.seen > 8000) tickers.delete(t); continue; }
    tickOf.set(t.el, t);
    t.seen = now;
    // off screen (display none, a hidden page): no frames
    if (!t.el.getClientRects().length) continue;
    try { t.tick(now, dt); } catch (e) { console.error(e); tickers.delete(t); }
  }
  if (tickers.size) raf = requestAnimationFrame(loop);
}
function clock(t: Ticker) { tickers.add(t); if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
const tickOf = new WeakMap<HTMLElement, Ticker>();
/** start (or restart, after its element was away a while) the decor's ticker */
function wake(el: HTMLElement) { const t = tickOf.get(el); if (t && !tickers.has(t)) { t.seen = performance.now(); clock(t); } }

// the pointer, for the eye
let mx = -1, my = -1, mT = 0;
let ptrOn = false;
function trackPointer() {
  if (ptrOn) return; ptrOn = true;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; mT = performance.now(); }, { passive: true, capture: true });
  window.addEventListener('pointerdown', (e) => { mx = e.clientX; my = e.clientY; mT = performance.now(); }, { passive: true, capture: true });
}

// ---------------------------------------------------------------- small helpers
const col3 = (hex: number) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
function frameCanvas(w: number, h: number, cls = 'mxd-cv'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.className = cls; cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
  cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
  return cv;
}
function blit(cv: HTMLCanvasElement, sh: HTMLCanvasElement | null, f: number, fw: number, fh: number, clear = true, dx = 0, dy = 0) {
  if (!sh) return;
  const c = cv.getContext('2d')!;
  if (clear) c.clearRect(0, 0, cv.width, cv.height);
  c.drawImage(sh, 0, f * fh, fw, fh, dx, dy, fw, fh);
}

/** a gear's outline: `n` trapezoid teeth between root and tip radius, starting at angle a */
function gearPts(n: number, r0: number, r1: number, a: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const st = TAU / n;
  for (let i = 0; i < n; i++) {
    const b = a + i * st;
    for (const [f, r] of [[0, r0], [0.36, r0], [0.47, r1], [0.78, r1], [0.89, r0]] as const) pts.push(new THREE.Vector2(Math.cos(b + f * st) * r, Math.sin(b + f * st) * r));
  }
  return pts;
}
/** tooth centre offset (fraction of a step) for gearPts */
const TOOTH_C = 0.625;
/** one gear in the panel plane at (x, y) (spec space: y down), rotated a; lightening holes, a hub and its bolt */
function gearOn(m: Mold, x: number, y: number, z: number, n: number, r0: number, r1: number, a: number, col: number, surf = BRASS, holes = 4, depth = 3.2) {
  const hub = Math.max(2.2, r0 * 0.3);
  const hl: THREE.Vector2[][] = [];
  if (holes && r0 > 7) {
    const hr = (r0 - hub) * 0.32, rr = (r0 + hub) / 2;
    for (let i = 0; i < holes; i++) { const q = a + (i + 0.5) * TAU / holes; hl.push(ngon(6, hr, q).map((p) => new THREE.Vector2(p.x + Math.cos(q) * rr, p.y + Math.sin(q) * rr))); }
  }
  // the shape's points are already rotated, so the plate goes in unrotated
  m.add(plate(gearPts(n, r0, r1, a), depth, 0.5, hl), M(x, -y, z), col, surf);
  m.add(fcyl(hub, depth + 2, 8, hub * 1.1, 0.25, false, a), M(x, -y, z + depth / 2 + 1, R90), mixC(col, 0x000000, 0.25), surf);
  m.add(fcyl(hub * 0.55, 2, 6, hub * 0.55, 0.3, false, a * 1.7), M(x, -y, z + depth + 2.6, R90), 0xc8ccc4, CHROME);
}

// ================================================================ GEARS
const GEAR_F = 10;
function gearsModel(f: number, s: number): THREE.Group {
  const root = new THREE.Group();
  const W = 64 * s, H = 50 * s;
  // the bracket: a dark steel plate, chamfered, four bolts
  const br = new Mold().add(plate(clipRect(W - 6, H - 8, 6 * s), 2.4, 0.7), M(W / 2, -H / 2, -2.4), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? TONES.dark[3] : TONES.dark[1]), STEEL);
  for (const [bx, by] of [[7, 8], [W - 7, 8], [7, H - 8], [W - 7, H - 8]]) bolt(br, bx, by, 0, 1.6 * s, 0x8a928e, 3);
  meshOf(br, mxMat({ wear: 0.6, seed: 12 }), root);
  // three gears, one tooth pitch per loop: A (12) drives B (8) drives C (6)
  const step = TAU / 12, a = (f / GEAR_F) * step;
  const pA = 14.4 * s, pB = pA * 8 / 12, pC = pA * 6 / 12;
  const ax = W * 0.36, ay = H * 0.54;
  const tAB = -0.42, tBC = 0.9;
  const bx = ax + Math.cos(tAB) * (pA + pB), by = ay + Math.sin(tAB) * (pA + pB);
  const cx = bx + Math.cos(tBC) * (pB + pC), cy = by + Math.sin(tBC) * (pB + pC);
  const sA = TAU / 12, sB = TAU / 8, sC = TAU / 6;
  // scene angles run counter-clockwise with y up: the spec-space directions flip sign
  const phi = -tAB, psi = -tBC, TC = TOOTH_C;
  const rA = phi - TC * sA + a;
  const b0 = phi + PI + sB / 2 - TC * sB;
  const rB = b0 - a * 12 / 8;
  // whatever B shows toward C at frame 0, C shows the complement (the same arc, mirrored)
  const dl = (((psi - b0) / sB - TC) % 1 + 1) % 1;
  const rC = psi + PI + sC / 2 - TC * sC - dl * sC + a * 12 / 6;
  const gm = new Mold();
  gearOn(gm, ax, ay, 0.4, 12, pA - 2.3 * s, pA + 2.3 * s, rA, 0xb08a3a, BRASS, 4, 3.4);
  gearOn(gm, bx, by, 4.4, 8, pB - 2.3 * s, pB + 2.3 * s, rB, 0x9aa29c, STEEL, 4, 3);
  gearOn(gm, cx, cy, 0.6, 6, pC - 2.2 * s, pC + 2.2 * s, rC, 0x5a5e56, STEEL, 0, 3);
  meshOf(gm, mxMat({ wear: 0.4, seed: 5 }), root);
  return root;
}
function gearsSheet(s: number) { return sheet(`dg|gears|${s}`, 64 * s, 50 * s, 6, GEAR_F, (f) => gearsModel(f, s), WALL); }

// ================================================================ BEACON
export type BeaconCol = 'amber' | 'red' | 'green';
const BEACON_RGB: Record<BeaconCol, [number, number, number]> = { amber: [0xffb02a, 0x6a3a06, 0x2a1804], red: [0xff3a22, 0x6a0e08, 0x260604], green: [0x5cff7a, 0x0e5a1e, 0x062010] };
const BEACON_F = 16;
function beaconModel(f: number, on: boolean, col: BeaconCol, s: number): THREE.Group {
  const root = new THREE.Group();
  const W = 34 * s, H = 34 * s;
  const g = new THREE.Group();
  g.position.set(W / 2, -H + 6 * s, 0);
  g.rotation.x = 0.36;
  root.add(g);
  const [hot, mid, dark] = BEACON_RGB[col];
  const th = (f / BEACON_F) * TAU;
  const m = new Mold();
  // bracket foot, base drum with bolts, chrome collar
  m.add(fbox(28 * s, 3 * s, 14 * s, 0.2), M(0, -1.5 * s, 0), TONES.dark[2], STEEL);
  m.add(fcyl(11 * s, 6 * s, 8, 12 * s, 0.25), M(0, 3 * s, 0), (_x, y) => (y > 5 * s ? TONES.olive[3] : TONES.olive[1]), PAINT);
  for (let i = 0; i < 4; i++) { const q = PI / 4 + i * PI / 2; m.add(fcyl(1.3 * s, 1.4 * s, 6, 1.3 * s, 0.2), M(Math.cos(q) * 9 * s, 6.4 * s, Math.sin(q) * 9 * s), 0xa8b0aa, CHROME); }
  m.add(fcyl(9.4 * s, 2.4 * s, 10, 9.8 * s, 0.25), M(0, 7.2 * s, 0), 0xb8c0bc, CHROME);
  // the cage over the glass
  const R = 10.2 * s, y0 = 8.4 * s, y1 = 21 * s;
  for (let i = 0; i < 6; i++) { const q = i * TAU / 6 + PI / 6; m.add(frod([Math.cos(q) * R, y0, Math.sin(q) * R], [Math.cos(q) * R * 0.86, y1, Math.sin(q) * R * 0.86], 0.62 * s, 4), null, 0x8a928e, STEEL); }
  m.add(fring(R * 0.88, 0.7 * s, 12, 4), M(0, y1, 0, R90), 0x9aa29c, STEEL);
  m.add(fring(R, 0.7 * s, 12, 4), M(0, y0 + 4 * s, 0, R90), 0x9aa29c, STEEL);
  m.add(fcyl(3.2 * s, 2.2 * s, 8, 3.6 * s, 0.25), M(0, y1 + 1.1 * s, 0), 0xb8c0bc, CHROME);
  m.add(gem(1.5 * s, 0, 0.05, 2), M(0, y1 + 2.8 * s, 0), 0xd0d4cc, CHROME);
  meshOf(m, mxMat({ wear: 0.45, seed: 21 }), g);
  // the glass dome: facets facing the reflector burn, the rest stays dark glass
  const gm = new Mold();
  const prof = [[8.6, 0], [8.6, 7], [8.1, 9.6], [6.8, 11.8], [4.6, 13.2], [0, 13.8]].map(([r, y]) => [r * s, y * s]);
  gm.add(flathe(prof, 12), M(0, 8.4 * s, 0), (x, _y, z) => {
    if (!on) return mixC(dark, mid, 0.35);
    const d = Math.cos(Math.atan2(z, x) - th);
    return d > 0.82 ? 0xfff6d0 : d > 0.45 ? hot : d > 0 ? mid : mixC(dark, mid, 0.5);
  }, GLASS, 1);
  // the reflector inside shows through the top as a dark vane
  const gmat = mxMat({ wear: 0.05, seed: 33 });
  if (on) gmat.uniforms.uGlow.value.copy(col3(hot)).multiplyScalar(0.85);
  meshOf(gm, gmat, g);
  return root;
}
function beaconSheet(on: boolean, col: BeaconCol, s: number) {
  return sheet(`dg|beacon|${on}|${col}|${s}`, 34 * s, 34 * s, 5, on ? BEACON_F : 1, (f) => beaconModel(f, on, col, s), FREE);
}

// ================================================================ WRENCH
const WR_F = 9;
function wrenchModel(f: number, s: number): THREE.Group {
  const root = new THREE.Group();
  const W = 26 * s, H = 70 * s;
  const ang = ((f / (WR_F - 1)) * 2 - 1) * 0.32;
  // the peg
  const pm = new Mold();
  pm.add(fcyl(3 * s, 1.2, 8, 3.4 * s, 0.3), M(W / 2, -6 * s, 0.6, R90), 0x4a5048, STEEL)
    .add(fcyl(1.5 * s, 9 * s, 6, 1.5 * s, 0.2), M(W / 2, -6 * s, 4.5 * s, R90), 0xa8b0aa, CHROME);
  meshOf(pm, mxMat({ seed: 8 }), root);
  const piv = new THREE.Group();
  piv.position.set(W / 2, -6 * s, 3 * s);
  piv.rotation.z = ang;
  root.add(piv);
  const m = new Mold();
  // ring end round the peg: a twelve-point ring as a 12-gon with a hex hole
  const ring = ngon(12, 6.6 * s, 0);
  const hole = ngon(6, 3.6 * s, 0);
  m.add(plate(ring, 3 * s, 0.6, [hole]), M(0, 0, -1.5 * s), 0xb8bcb4, CHROME);
  // the shank: a long tapered bar with a raised spine
  const L = 50 * s;
  const shank = [new THREE.Vector2(-3 * s, -4 * s), new THREE.Vector2(3 * s, -4 * s), new THREE.Vector2(3.8 * s, -L + 4 * s), new THREE.Vector2(-3.8 * s, -L + 4 * s)];
  m.add(plate(shank, 2.4 * s, 0.5), M(0, 0, -1.2 * s), 0xa8aca4, CHROME);
  m.add(fbox(2 * s, L - 14 * s, 1 * s, 0.3), M(0, -L / 2, 1.6 * s), 0xc8ccc4, CHROME);
  // the open jaw: a fat disc with a slot cut at 15 degrees
  const jaw: THREE.Vector2[] = [];
  const jr = 8.4 * s, gap = 0.62;
  for (let i = 0; i <= 14; i++) { const q = -PI / 2 + gap + (i / 14) * (TAU - gap * 2) - 0.26; jaw.push(new THREE.Vector2(Math.cos(q) * jr, Math.sin(q) * jr - L)); }
  // the slot's inner faces
  const qa = -PI / 2 + gap - 0.26, qb = -PI / 2 - gap - 0.26;
  jaw.push(new THREE.Vector2(Math.cos(qb) * 3.4 * s, Math.sin(qb) * 3.4 * s - L + 1.6 * s));
  jaw.push(new THREE.Vector2(Math.cos(qa) * 3.4 * s, Math.sin(qa) * 3.4 * s - L + 1.6 * s));
  m.add(plate(jaw, 3 * s, 0.6), M(0, 0, -1.5 * s), 0xb8bcb4, CHROME);
  meshOf(m, mxMat({ wear: 0.7, seed: 17 }), piv);
  return root;
}
function wrenchSheet(s: number) { return sheet(`dg|wrench|${s}`, 26 * s, 70 * s, 6, WR_F, (f) => wrenchModel(f, s), WALL); }

// ================================================================ VALVE
const VALVE_F = 10;
function valveModel(f: number, s: number, w: number): THREE.Group {
  const root = new THREE.Group();
  const H = 40 * s;
  const py = H - 9 * s, r = 4.2 * s;
  const m = new Mold();
  // the pipe run with flanged joints and wall clamps
  m.add(frod([2, -py, 5 * s], [w - 2, -py, 5 * s], r, 8), null, 0xb89040, BRASS);
  for (const x of [8 * s, w - 8 * s]) {
    m.add(fcyl(r * 1.55, 2.6 * s, 8, r * 1.55, 0.3), M(x, -py, 5 * s, 0, 0, R90), 0x9a7428, BRASS);
    for (let i = 0; i < 4; i++) { const q = PI / 4 + i * PI / 2; m.add(fcyl(0.8 * s, 3.4 * s, 6, 0.8 * s, 0.2), M(x, -py + Math.sin(q) * r * 1.2, 5 * s + Math.cos(q) * r * 1.2, 0, 0, R90), 0x9aa29c, STEEL); }
  }
  for (const x of [w * 0.2, w * 0.8]) m.add(fbox(r * 2.8, r * 2.8, 4 * s, 0.2), M(x, -py, 2 * s), 0x3a4036, STEEL);
  // the valve body: a bonnet out of the pipe toward the viewer, a stem, the gland nut
  const vx = w / 2;
  m.add(fcyl(r * 1.5, 7 * s, 8, r * 1.7, 0.25), M(vx, -py, 9 * s, R90), 0x8a6a24, BRASS);
  m.add(fcyl(r * 0.9, 3 * s, 6, r * 0.9, 0.25), M(vx, -py, 13.5 * s, R90), 0x9aa29c, STEEL);
  m.add(fcyl(r * 0.36, 5 * s, 6, r * 0.36, 0), M(vx, -py, 16 * s, R90), 0xb8c0bc, CHROME);
  meshOf(m, mxMat({ wear: 0.55, seed: 19 }), root);
  // the handwheel, five spokes, in the panel plane
  const wh = new THREE.Group();
  wh.position.set(vx, -py, 18 * s);
  wh.rotation.z = -(f / VALVE_F) * (TAU / 5);
  const R = 11 * s;
  const wm = new Mold();
  wm.add(fring(R, 1.5 * s, 10, 5), null, 0xc8301e, PLASTIC);
  for (let i = 0; i < 5; i++) { const q = i * TAU / 5 + PI / 2; wm.add(frod([0, 0, 0], [Math.cos(q) * R, Math.sin(q) * R, 0], 1.1 * s, 5), null, 0xa8221a, PLASTIC); }
  wm.add(fcyl(2.6 * s, 3 * s, 8, 2.8 * s, 0.3), M(0, 0, 0.5, R90), 0xa8221a, PLASTIC);
  wm.add(fcyl(1.4 * s, 1.6 * s, 6, 1.4 * s, 0.3), M(0, 0, 2.4 * s, R90), 0xd0d4cc, CHROME);
  meshOf(wm, mxMat({ wear: 0.5, seed: 23 }), wh);
  root.add(wh);
  return root;
}
function valveSheet(s: number, w: number) { return sheet(`dg|valve|${s}|${w}`, w, 40 * s, 6, VALVE_F, (f) => valveModel(f, s, w), WALL); }

// ================================================================ BUTTON BOX
function buttonsModel(f: number, s: number): THREE.Group {
  const root = new THREE.Group();
  const W = 70 * s, H = 32 * s;
  const lamps = f & 3, press = f >> 2; // press 0 none, 1..3 which head is in
  const face = labelCanvas(W, H, '', { ground: 'olive', seed: 7, border: false });
  const c = face.getContext('2d')!;
  c.fillStyle = '#e8c440'; c.font = `${Math.round(7 * s)}px Alagard, monospace`; c.textAlign = 'center';
  c.fillText('RUN', 14 * s, H - 3 * s); c.fillText('HOLD', 32 * s, H - 3 * s); c.fillText('STOP', 51 * s, H - 3 * s);
  const bm = new Mold().add(plate(clipRect(W, H, 4 * s), 4 * s, 1), M(W / 2, -H / 2, -4 * s), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? TONES.olive[2] : TONES.olive[1]), PAINT);
  meshOf(bm, mxMat({ map: canvasTex(face), wear: 0.55, seed: 4 }), root);
  const hw = new Mold();
  screw(hw, 4 * s, 4 * s, 0, 1.2 * s); screw(hw, W - 4 * s, H - 4 * s, 0, 1.2 * s);
  const heads: [number, number, number, number][] = [[14 * s, 13 * s, 0x2e9a3a, 5.6 * s], [32 * s, 13 * s, 0x1c1c18, 5.2 * s], [51 * s, 13 * s, 0xc8281c, 7.2 * s]];
  heads.forEach(([x, y, cc, r], i) => {
    // collar, then the mushroom head on its plunger (pushed in when pressed)
    hw.add(fcyl(r * 1.25, 1.6 * s, 8, r * 1.35, 0.25), M(x, -y, 0.8 * s, R90), i === 2 ? 0xe0ac22 : 0x8a928e, i === 2 ? PAINT : STEEL);
    const z = press === i + 1 ? 2.2 * s : 4.4 * s;
    hw.add(fcyl(r * 0.5, z, 8, r * 0.5, 0), M(x, -y, 1.6 * s + z / 2, R90), 0x9aa29c, STEEL);
    hw.add(flathe([[r, 0], [r, r * 0.25], [r * 0.85, r * 0.55], [r * 0.5, r * 0.72], [0, r * 0.78]], 10), M(x, -y, 1.6 * s + z, R90), cc, PLASTIC);
  });
  meshOf(hw, mxMat({ wear: 0.35, seed: 9 }), root);
  // two little lamps on the hood: amber and green
  const lm = new Mold();
  const L: [number, number, number][] = [[63 * s, 8 * s, 0xffb02a], [63 * s, 20 * s, 0x5cff7a]];
  L.forEach(([x, y, cc], i) => {
    const lit = (lamps >> i) & 1;
    lm.add(fcyl(2.8 * s, 1.2 * s, 8, 3 * s, 0.25), M(x, -y, 0.6 * s, R90), 0x3a3f38, STEEL);
    lm.add(fdome(2 * s, 8, 2, 0.8), M(x, -y, 1.2 * s, R90), lit ? mixC(cc, 0xffffff, 0.35) : mixC(cc, 0x000000, 0.7), GLASS, lit);
  });
  const lmat = mxMat({ seed: 3 });
  lmat.uniforms.uGlow.value.set(1, 0.85, 0.5);
  meshOf(lm, lmat, root);
  return root;
}
function buttonsSheet(s: number) { return sheet(`dg|buttons|${s}`, 70 * s, 32 * s, 5, 16, (f) => buttonsModel(f, s), WALL); }

// ================================================================ THE SPECIMEN JAR
const JW = 60, JH = 92;
/** the liquid column inside the glass (box coords, y down): centre x, top, bottom, radius */
const LIQ = { cx: JW / 2, top: 22, bot: 76, r: 21 };
function jarBack(s: number): THREE.Group {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.position.set(JW * s / 2, -JH * s + 6 * s, 0);
  g.rotation.x = 0.2;
  root.add(g);
  const m = new Mold();
  // the plinth: a stepped steel base with bolts
  m.add(fcyl(26 * s, 5 * s, 8, 27 * s, 0.25), M(0, 2.5 * s, 0), (_x, y) => (y > 4 * s ? TONES.olive[3] : TONES.olive[1]), PAINT);
  m.add(fcyl(23.5 * s, 4 * s, 10, 24.5 * s, 0.25), M(0, 7 * s, 0), TONES.dark[3], STEEL);
  for (let i = 0; i < 6; i++) { const q = i * TAU / 6 + PI / 6; m.add(fcyl(1.3 * s, 1.6 * s, 6, 1.3 * s, 0.3), M(Math.cos(q) * 24.6 * s, 5.3 * s, Math.sin(q) * 24.6 * s), 0xa8b0aa, CHROME); }
  // the glass, full of fixative: murky green-yellow, sediment at the bottom
  const r = LIQ.r * s, y0 = 9 * s, y1 = y0 + (LIQ.bot - LIQ.top) * s;
  m.add(flathe([[r - 2 * s, 0], [r, 2 * s], [r, y1 - y0 - 2 * s], [r - 1.5 * s, y1 - y0]], 14), M(0, y0, 0), (x, y, z) => {
    const t = (y - y0) / (y1 - y0);
    const n = hh(Math.round(x * 2), Math.round(y * 2), 3);
    let c = t < 0.12 ? 0x3a3a16 : t < 0.2 ? 0x55602a : mixC(0x6a8436, 0x8aa048, t);
    if (z < 0) c = mixC(c, 0x1a2410, 0.4);
    return n > 0.93 ? mixC(c, 0xd0d890, 0.25) : c;
  }, GLASS);
  // the lid: brass, a gasket, a top boss with a wing nut
  m.add(fcyl(r + 1.2 * s, 2 * s, 14, r + 1.2 * s, 0.25), M(0, y1 + 1 * s, 0), 0x1a1c16, RUBBER);
  m.add(fcyl(r + 2.2 * s, 5 * s, 14, r + 2.6 * s, 0.25), M(0, y1 + 4.5 * s, 0), 0xb08a3a, BRASS);
  m.add(fcyl(r * 0.6, 3 * s, 10, r * 0.7, 0.3), M(0, y1 + 8.5 * s, 0), 0x9a7428, BRASS);
  m.add(fbox(14 * s, 4 * s, 2.4 * s, 0.25), M(0, y1 + 11.5 * s, 0), 0xc8ccc4, CHROME);
  m.add(fcyl(2 * s, 3 * s, 6, 2 * s, 0.3), M(0, y1 + 10.5 * s, 0), 0xc8ccc4, CHROME);
  // a cable from the lid's gland off to the side
  m.add(fcyl(1.8 * s, 3 * s, 6, 2 * s, 0.3), M(r * 0.8, y1 + 7.6 * s, r * 0.2), 0x8a928e, STEEL);
  m.add(frod([r * 0.8, y1 + 9 * s, r * 0.2], [r * 1.25, y1 + 12 * s, r * 0.1], 1.1 * s, 5), null, 0x1a1a18, RUBBER);
  m.add(frod([r * 1.25, y1 + 12 * s, r * 0.1], [r * 1.5, y1 + 4 * s, 0], 1.1 * s, 5), null, 0x1a1a18, RUBBER);
  meshOf(m, mxMat({ wear: 0.5, seed: 27 }), g);
  // the specimen plate on the plinth's face
  const lab = labelCanvas(Math.round(24 * s), Math.round(10 * s), '07', { ground: 'brass', px: Math.max(8, Math.round(9 * s)), border: false, seed: 4 });
  meshOf(new Mold().add(plate(clipRect(24 * s, 10 * s, 1.2 * s), 1.2 * s, 0.3), M(0, 4.4 * s, 26.2 * s), 0xb08a3a, PAINT), mxMat({ map: canvasTex(lab), wear: 0.2 }), g);
  return root;
}
/** the clamp straps in front of the glass (drawn over the creature) */
function jarFront(s: number): THREE.Group {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.position.set(JW * s / 2, -JH * s + 6 * s, 0);
  g.rotation.x = 0.2;
  root.add(g);
  const m = new Mold();
  const r = (LIQ.r + 1.3) * s, y0 = 7 * s, y1 = 9 * s + (LIQ.bot - LIQ.top) * s + 4 * s;
  for (const q of [PI / 2 - 0.62, PI / 2 + 0.62]) {
    const x = Math.cos(q) * r, z = Math.sin(q) * r;
    m.add(fbox(2.6 * s, y1 - y0, 1.2 * s, 0.25), M(x, (y0 + y1) / 2, z, 0, -q + PI / 2, 0), 0x8a928e, STEEL);
    m.add(fcyl(1.2 * s, 1.4 * s, 6, 1.2 * s, 0.3), M(x * 1.02, y1 - 2 * s, z * 1.02, R90, 0, 0), 0xc8ccc4, CHROME);
  }
  meshOf(m, mxMat({ wear: 0.6, seed: 31 }), g);
  return root;
}
function jarSheets(s: number) {
  const back = sheet(`dg|jarB|${s}`, JW * s, JH * s, 6, 1, () => jarBack(s), FREE);
  const front = sheet(`dg|jarF|${s}`, JW * s, JH * s, 6, 1, () => jarFront(s), { ...FREE, shadowA: 0 });
  return { back, front };
}

// ---- the eye creature
const EYE_NX = 7, EYE_NY = 5;
const EB = 34; // the creature's frame box
let eyeTexCv: HTMLCanvasElement | null = null;
function eyeTex(): THREE.CanvasTexture {
  if (!eyeTexCv) {
    const W = 64, H = 32;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(W, H), d = img.data;
    // equirect: the iris centred at u = 0.25 (+z), v = 0.5
    const cx = 16, cy = 16;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let dx = x - cx; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      const dy = y - cy, rr = Math.hypot(dx, dy);
      let col: number;
      if (rr < 1.6 && Math.abs(dx) < 1.2) col = 0x050404; // the slit pupil
      else if (Math.abs(dx) < 1.1 && Math.abs(dy) < 4.4) col = 0x0a0806;
      else if (rr < 5.6) {
        // iris: amber to sick green, radial fibres, a dark limbal ring
        const a = Math.atan2(dy, dx), fib = hh(Math.round(a * 9), 1, 4);
        col = rr > 4.8 ? 0x2a2a10 : mixC(rr < 3 ? 0xe0b030 : 0x8aa030, 0x5a6a18, fib * 0.6);
      } else {
        // sclera: yellowed, veined toward the back
        const back = Math.min(1, rr / 22);
        col = mixC(0xeee2c4, 0xd8a090, back * 0.7);
        const v = hh(x, y, 9);
        if (v > 0.9 - back * 0.25 && rr > 7) col = mixC(col, 0xa8281c, 0.65);
        if (hh(x >> 1, y, 12) > 0.94 && rr > 8) col = 0x9a2018;
      }
      // a wet catch light
      if ((x === cx - 2 && y === cy - 3) || (x === cx - 3 && y === cy - 3)) col = 0xffffff;
      const i = (y * W + x) * 4;
      d[i] = (col >> 16) & 255; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    eyeTexCv = cv;
  }
  return canvasTex(eyeTexCv);
}
const FLESH = (x: number, y: number, z: number) => {
  const n = hh(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3));
  return n > 0.86 ? 0x7a3a40 : n > 0.6 ? 0xb07a74 : 0xc8968a;
};
function eyeModel(f: number, s: number): THREE.Group {
  const root = new THREE.Group();
  const closed = f >= EYE_NX * EYE_NY;
  const k = f % (EYE_NX * EYE_NY);
  const yaw = ((k % EYE_NX) / (EYE_NX - 1) * 2 - 1) * 0.72;
  const pitch = ((Math.floor(k / EYE_NX)) / (EYE_NY - 1) * 2 - 1) * 0.5;
  const g = new THREE.Group();
  g.position.set(EB * s / 2, -EB * s / 2, 0);
  g.rotation.set(0.2 + pitch, yaw, 0, 'YXZ');
  root.add(g);
  const r = 9.4 * s;
  // the eyeball (smooth, wet)
  // the texture's iris sits at u = 0.25, which a sphere puts on +z
  const ball = new THREE.SphereGeometry(r, 18, 12);
  const bm = new Mold(false).add(ball, null, 0xffffff, [0.6, 0, 0, 0]);
  meshOf(bm, mxMat({ map: eyeTex(), full: true, wear: 0, seed: 2 }), g);
  // the fleshy hood with its lids: a shell open toward +z (shut on a blink)
  const open = closed ? 0.12 : 0.92;
  const hood = new THREE.SphereGeometry(r * 1.14, 14, 9, 0, TAU, open, PI - open);
  hood.rotateX(PI / 2);
  const hm = new Mold().add(hood, null, FLESH, PAINT);
  // the lid rim, swollen
  hm.add(fring(r * 1.14 * Math.sin(open), 1.3 * s, 12, 4), M(0, 0, r * 1.14 * Math.cos(open)), 0x9a5a58, PAINT);
  // two little fins at the sides and a ridge over the top
  for (const sx of [-1, 1]) hm.add(gem(3.2 * s, 0, 0.18, sx + 5), M(sx * r * 1.12, -r * 0.1, -r * 0.3, 0, 0, sx * 0.5, 0.45, 1.3, 1), 0xa86a66, PAINT);
  hm.add(gem(2.6 * s, 0, 0.2, 9), M(0, r * 1.05, -r * 0.2, 0, 0, 0, 1.6, 0.6, 1.2), 0xb07a74, PAINT);
  meshOf(hm, mxMat({ wear: 0.2, seed: 41 }), g);
  return root;
}
function eyeSheet(s: number, closed: boolean) {
  const n = EYE_NX * EYE_NY;
  return sheet(`dg|eye|${s}|${closed}`, EB * s, EB * s, 4, n, (f) => eyeModel(f + (closed ? n : 0), s), FREE);
}
const TEN_F = 8, TB = 36;
function tendrilModel(f: number, s: number): THREE.Group {
  const root = new THREE.Group();
  const ph = (f / TEN_F) * TAU;
  const m = new Mold();
  const ox = TB * s / 2, oy = -9 * s;
  // the optic nerve, a thick twisting tail, and five thin tendrils
  const strands: [number, number, number, number, number][] = [[0, 22, 2.2, 0, 0.9], [-5, 17, 1.2, 1.3, 1.3], [5, 18, 1.2, 2.4, 1.2], [-2.5, 21, 1, 3.1, 1.5], [3, 15, 1, 4.4, 1.6], [-8, 12, 0.9, 5.2, 1.4]];
  for (const [x0, len, r0, phi, amp] of strands) {
    let px = ox + x0 * s, py = oy, pz = -2 * s;
    const n = 7;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const nx = ox + x0 * s + Math.sin(ph + phi + t * 2.4) * amp * s * t * 2.2 + x0 * s * t * 0.35;
      const ny = oy - len * s * t;
      const nz = -2 * s + Math.cos(ph * 0.5 + phi + t * 2) * s * t;
      const rr = Math.max(0.45 * s, r0 * s * (1 - t * 0.7));
      m.add(frod([px, py, pz], [nx, ny, nz], rr, 5), null, t > 0.75 ? 0x6a2a38 : t > 0.4 ? 0x9a5a60 : 0xb88078, PAINT);
      px = nx; py = ny; pz = nz;
    }
    // a bulb at each tip
    m.add(gem(r0 * 0.75 * s, 0, 0.15, Math.round(phi * 3)), M(px, py, pz), 0x5a2030, PAINT);
  }
  meshOf(m, mxMat({ wear: 0.1, seed: 44 }), root);
  return root;
}
function tendrilSheet(s: number) { return sheet(`dg|ten|${s}`, TB * s, TB * s, 3, TEN_F, (f) => tendrilModel(f, s), FREE); }

// ================================================================ the decor element
export type DecorKind = 'jar' | 'beacon' | 'gears' | 'wrench' | 'valve' | 'buttons' | 'gauge';
export interface DecorOpts {
  /** model scale (1 = the natural size, one art pixel per CSS px) */
  s?: number;
  /** beacon colour */
  col?: BeaconCol;
  /** start alerting (beacons sweep, the button box blinks faster) */
  alert?: boolean;
  /** valve: pipe length (CSS px) */
  w?: number;
  /** gears: turning speed (loops a second); 0 holds them */
  speed?: number;
  /** gauge: label */
  label?: string;
  /** gauge: the needle wanders on its own (default); false holds it where set() puts it */
  wander?: boolean;
  cls?: string;
  title?: string;
}
export interface MxDecor { el: HTMLElement; alert(on: boolean): void; poke(): void; dispose(): void; /** gauge: needle 0..1 */ set(v: number): void }

/** a 3D object on its own little element (sized to the model; its canvas spills over for shadows and beams) */
export function mxDecor(kind: DecorKind, o: DecorOpts = {}): MxDecor | null {
  if (!mxOk()) return null;
  const s = o.s ?? 1;
  const el = document.createElement('div');
  el.className = 'mxd mxd-' + kind + (o.cls ? ' ' + o.cls : '');
  if (o.title) el.title = o.title;
  let alertOn = !!o.alert;
  const api: MxDecor = { el, alert: (v) => { alertOn = v; }, poke: () => { /* per kind */ }, set: () => { /* gauges */ }, dispose: () => { tickers.forEach((t) => { if (t.el === el) tickers.delete(t); }); el.remove(); } };
  const box = (w: number, h: number) => { el.style.width = Math.round(w) + 'px'; el.style.height = Math.round(h) + 'px'; };
  const still = () => reduce();

  if (kind === 'gears') {
    const W = 64 * s, H = 50 * s, pad = 6;
    box(W, H);
    const cv = frameCanvas(W + pad * 2, H + pad * 2); cv.style.left = cv.style.top = -pad + 'px'; el.append(cv);
    const fw = cv.width, fh = cv.height;
    let ph = hh(Math.round(W), 3, 5) * GEAR_F, cur = -1;
    const draw = () => { const f = Math.floor(ph) % GEAR_F; if (f === cur) return; cur = f; blit(cv, gearsSheet(s), f, fw, fh); };
    draw();
    const speed = o.speed ?? 0.9;
    clock({ el, seen: 0, tick: (_n, dt) => { if (still() || !speed) return; ph = (ph + dt * speed * GEAR_F * (alertOn ? 2.4 : 1)) % (GEAR_F * 1000); draw(); } });
    api.poke = () => { ph += GEAR_F * 0.5; sfx('ratchet', 0.3); };
    el.addEventListener('pointerdown', () => api.poke());
    return api;
  }

  if (kind === 'beacon') {
    const col = o.col ?? 'amber';
    const W = 34 * s, H = 34 * s, pad = 5, beam = Math.round(46 * s);
    box(W, H);
    const cv = frameCanvas(W + pad * 2 + beam * 2, H + pad * 2 + 14 * s); cv.style.left = -(pad + beam) + 'px'; cv.style.top = -(pad + 14 * s) + 'px'; el.append(cv);
    const fw = Math.round(W + pad * 2), fh = Math.round(H + pad * 2);
    let th = 0, cur = '', glow = 0;
    const [hot] = BEACON_RGB[col];
    const rgb = `${(hot >> 16) & 255},${(hot >> 8) & 255},${hot & 255}`;
    const draw = () => {
      const f = Math.floor((th / TAU) * BEACON_F) % BEACON_F;
      const key = alertOn ? 'on' + f : 'off' + Math.round(glow * 4);
      if (key === cur) return; cur = key;
      const c = cv.getContext('2d')!;
      c.clearRect(0, 0, cv.width, cv.height);
      const ox = beam, oy = 14 * s;
      if (alertOn || glow > 0.05) {
        // the sweeping beam: stepped bands of light, additive, wide when side-on, a flare when it faces you
        const a = alertOn ? (f / BEACON_F) * TAU : 0;
        const cx = ox + pad + W / 2, cy = oy + pad + H - 6 * s - 15 * s * Math.cos(0.36);
        const side = Math.cos(a), face = Math.sin(a);
        c.save(); c.globalCompositeOperation = 'lighter';
        const k = alertOn ? 1 : glow;
        for (let b = 0; b < 3; b++) {
          const L = (beam + W * 0.3) * Math.abs(side) * (1 - b * 0.28), hw = (5 + b * 4) * s * (0.6 + Math.abs(side) * 0.4);
          c.fillStyle = `rgba(${rgb},${(0.09 + b * 0.05) * k})`;
          c.beginPath(); c.moveTo(cx, cy - 3 * s); c.lineTo(cx + Math.sign(side) * L, cy - hw); c.lineTo(cx + Math.sign(side) * L, cy + hw); c.lineTo(cx, cy + 3 * s); c.closePath(); c.fill();
        }
        if (face > 0) for (let b = 0; b < 3; b++) { c.fillStyle = `rgba(${rgb},${0.12 * face * k})`; const rr = (9 + b * 6) * s; c.fillRect(Math.round(cx - rr), Math.round(cy - rr * 0.7), Math.round(rr * 2), Math.round(rr * 1.4)); }
        c.restore();
      }
      const sh = beaconSheet(alertOn, col, s);
      if (sh) c.drawImage(sh, 0, (alertOn ? f : 0) * fh, fw, fh, ox, oy, fw, fh);
    };
    draw();
    clock({ el, seen: 0, tick: (_n, dt) => {
      glow = Math.max(0, glow - dt * 1.5);
      if (alertOn && !still()) th = (th + dt * TAU * 1.25) % TAU;
      draw();
    } });
    api.alert = (v) => { wake(el); if (v === alertOn) return; alertOn = v; if (!v) glow = 1; cur = ''; draw(); };
    api.poke = () => api.alert(!alertOn);
    return api;
  }

  if (kind === 'wrench') {
    const W = 26 * s, H = 70 * s, pad = 6;
    box(W, H);
    const cv = frameCanvas(W + pad * 2, H + pad * 2); cv.style.left = cv.style.top = -pad + 'px'; el.append(cv);
    const fw = cv.width, fh = cv.height;
    let a = 0, v = 0, cur = -1, live = false;
    const draw = () => { const f = Math.max(0, Math.min(WR_F - 1, Math.round(((a / 0.32) + 1) / 2 * (WR_F - 1)))); if (f === cur) return; cur = f; blit(cv, wrenchSheet(s), f, fw, fh); };
    draw();
    api.poke = () => { if (still()) return; v += (Math.random() < 0.5 ? -1 : 1) * 1.6; if (!live) { live = true; sfx('tink', 0.25); } };
    clock({ el, seen: 0, tick: (_n, dt) => {
      if (!live) return;
      v += (-a * 30 - v * 2.2) * dt; a += v * dt; a = Math.max(-0.32, Math.min(0.32, a));
      draw();
      if (Math.abs(a) < 0.01 && Math.abs(v) < 0.02) { a = 0; v = 0; live = false; draw(); }
    } });
    el.addEventListener('pointerenter', () => api.poke());
    el.addEventListener('pointerdown', () => api.poke());
    return api;
  }

  if (kind === 'valve') {
    const w = Math.round(o.w ?? 90), H = 40 * s, pad = 6;
    box(w, H);
    const cv = frameCanvas(w + pad * 2, H + pad * 2); cv.style.left = cv.style.top = -pad + 'px'; el.append(cv);
    const fw = cv.width, fh = cv.height;
    let ph = 0, goal = 0, cur = -1;
    const draw = () => { const f = ((Math.round(ph) % VALVE_F) + VALVE_F) % VALVE_F; if (f === cur) return; cur = f; blit(cv, valveSheet(s, w), f, fw, fh); };
    draw();
    api.poke = () => { goal += VALVE_F * 1.5; sfx('ratchet', 0.4); };
    clock({ el, seen: 0, tick: (_n, dt) => { if (ph >= goal) return; ph = Math.min(goal, ph + dt * 22); draw(); } });
    el.addEventListener('pointerdown', () => api.poke());
    return api;
  }

  if (kind === 'buttons') {
    const W = 70 * s, H = 32 * s, pad = 5;
    box(W, H);
    const cv = frameCanvas(W + pad * 2, H + pad * 2); cv.style.left = cv.style.top = -pad + 'px'; el.append(cv);
    const fw = cv.width, fh = cv.height;
    let lamps = 1, press = 0, cur = -1, t = 0, next = 1.2;
    const draw = () => { const f = (press << 2) | lamps; if (f === cur) return; cur = f; blit(cv, buttonsSheet(s), f, fw, fh); };
    draw();
    clock({ el, seen: 0, tick: (_n, dt) => {
      t += dt;
      if (t > next) { t = 0; next = alertOn ? 0.18 + Math.random() * 0.2 : 0.8 + Math.random() * 2.6; lamps = alertOn ? (lamps ^ 3) : Math.floor(Math.random() * 4); draw(); }
    } });
    el.addEventListener('pointerdown', (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / s;
      press = x < 23 ? 1 : x < 42 ? 2 : 3; draw(); sfx('plate', 0.45);
      lamps = press === 3 ? 0 : press === 1 ? 3 : lamps ^ 1;
      setTimeout(() => { press = 0; draw(); }, 140);
    });
    return api;
  }

  if (kind === 'gauge') {
    const g = mxGauge(Math.round(40 * s), 0.35, o.label ?? 'PSI');
    if (!g) return null;
    el.append(g);
    box(40 * s, 40 * s);
    (g as HTMLElement).style.position = 'absolute'; (g as HTMLElement).style.left = (g as HTMLElement).style.top = '-4px';
    let t = 0, next = 1;
    api.set = (v) => g.set(v);
    if (o.wander !== false) clock({ el, seen: 0, tick: (_n, dt) => { t += dt; if (t < next) return; t = 0; next = 1.5 + Math.random() * 3; g.set(alertOn ? 0.82 + Math.random() * 0.16 : 0.25 + Math.random() * 0.4); } });
    return api;
  }

  // ---- the jar
  trackPointer();
  const W = JW * s, H = JH * s, pad = 6;
  box(W, H);
  const cv = frameCanvas(W + pad * 2, H + pad * 2); cv.style.left = cv.style.top = -pad + 'px'; el.append(cv);
  const lay = document.createElement('canvas'); lay.width = Math.round(TB * s + 8); lay.height = Math.round(TB * s + 8);
  const fwE = Math.round(EB * s + 8), fwT = Math.round(TB * s + 6);
  let lookX = 0, lookY = 0, gx = 0, gy = 0, blink = 0, nextBlink = 2 + Math.random() * 4, sway = 0, bob = Math.random() * 10, cur = '', wander = 0;
  const bubbles: { x: number; y: number; v: number }[] = [];
  let rect: DOMRect | null = null, rectT = 0;
  const draw = () => {
    const ix = Math.max(0, Math.min(EYE_NX - 1, Math.round((lookX + 1) / 2 * (EYE_NX - 1))));
    const iy = Math.max(0, Math.min(EYE_NY - 1, Math.round((lookY + 1) / 2 * (EYE_NY - 1))));
    const fe = iy * EYE_NX + ix, ft = Math.floor(sway) % TEN_F, by = Math.round(Math.sin(bob) * 2.2 * s);
    const key = `${fe}|${blink > 0}|${ft}|${by}|${bubbles.map((b) => Math.round(b.y)).join(',')}`;
    if (key === cur) return; cur = key;
    const J = jarSheets(s), E = eyeSheet(s, blink > 0), T = tendrilSheet(s);
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, cv.width, cv.height);
    if (J.back) c.drawImage(J.back, 0, 0);
    // the creature, inside: tendrils behind, the eye over them, tinted by the fixative
    const lx = pad + LIQ.cx * s, ly = pad + (LIQ.top + (LIQ.bot - LIQ.top) * 0.42) * s + by;
    const lc = lay.getContext('2d')!;
    lc.clearRect(0, 0, lay.width, lay.height);
    if (T) lc.drawImage(T, 0, ft * fwT, fwT, fwT, Math.round(lay.width / 2 - fwT / 2), Math.round(lay.height / 2 - fwT / 2 + 9 * s), fwT, fwT);
    if (E) lc.drawImage(E, 0, fe * fwE, fwE, fwE, Math.round(lay.width / 2 - fwE / 2), Math.round(lay.height / 2 - fwE / 2), fwE, fwE);
    lc.globalCompositeOperation = 'source-atop'; lc.fillStyle = 'rgba(110,150,50,0.22)'; lc.fillRect(0, 0, lay.width, lay.height); lc.globalCompositeOperation = 'source-over';
    // keep it inside the glass
    c.save();
    c.beginPath(); c.rect(pad + (LIQ.cx - LIQ.r + 1.5) * s, pad + (LIQ.top - 1) * s, (LIQ.r * 2 - 3) * s, (LIQ.bot - LIQ.top - 2) * s); c.clip();
    c.drawImage(lay, Math.round(lx - lay.width / 2), Math.round(ly - lay.height / 2));
    // bubbles rising
    c.fillStyle = 'rgba(220,240,170,0.75)';
    for (const b of bubbles) { c.fillRect(Math.round(pad + b.x * s), Math.round(pad + b.y * s), Math.max(1, Math.round(s)), Math.max(1, Math.round(s))); }
    c.restore();
    // the glass in front: two highlight streaks and the straps
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gx0 = pad + (LIQ.cx - LIQ.r) * s, gt = pad + (LIQ.top - 1) * s, gh = (LIQ.bot - LIQ.top + 1) * s;
    c.fillStyle = 'rgba(200,230,190,0.16)'; c.fillRect(Math.round(gx0 + 5 * s), gt, Math.round(3 * s), gh);
    c.fillStyle = 'rgba(230,250,220,0.3)'; c.fillRect(Math.round(gx0 + 6 * s), gt + Math.round(4 * s), Math.max(1, Math.round(s)), Math.round(gh * 0.6));
    c.fillStyle = 'rgba(200,230,190,0.08)'; c.fillRect(Math.round(gx0 + LIQ.r * 2 * s - 11 * s), gt, Math.round(5 * s), gh);
    c.restore();
    if (J.front) c.drawImage(J.front, 0, 0);
  };
  draw();
  clock({ el, seen: 0, tick: (now, dt) => {
    const calm = still();
    // where to look: the pointer, else wander now and then
    rectT -= dt; if (!rect || rectT <= 0) { rect = el.getBoundingClientRect(); rectT = 0.5; }
    const ex = rect.left + rect.width / 2, ey = rect.top + rect.height * 0.42;
    if (mx >= 0 && now - mT < 4000) { gx = Math.max(-1, Math.min(1, (mx - ex) / 260)); gy = Math.max(-1, Math.min(1, (my - ey) / 200)); wander = 1.5; }
    else if ((wander -= dt) <= 0) { wander = 1.2 + Math.random() * 2.8; gx = Math.random() * 2 - 1; gy = Math.random() * 1.4 - 0.7; }
    if (calm) { lookX = gx; lookY = gy; }
    else { lookX += (gx - lookX) * Math.min(1, dt * 9); lookY += (gy - lookY) * Math.min(1, dt * 9); }
    if (blink > 0) blink -= dt; else if ((nextBlink -= dt) <= 0) { blink = 0.13; nextBlink = 2.2 + Math.random() * 4.5; }
    if (!calm) {
      sway = (sway + dt * 5) % (TEN_F * 100); bob += dt * 1.7;
      if (Math.random() < dt * 0.9 && bubbles.length < 5) bubbles.push({ x: LIQ.cx - LIQ.r + 4 + Math.random() * (LIQ.r * 2 - 8), y: LIQ.bot - 3, v: 6 + Math.random() * 8 });
      for (const b of bubbles) { b.y -= b.v * dt; b.x += Math.sin(b.y * 0.4) * dt * 2; }
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].y < LIQ.top + 1) bubbles.splice(i, 1);
    }
    draw();
  } });
  el.addEventListener('pointerdown', () => { blink = 0.3; sfx('squelch', 0.25); });
  return api;
}

/** hang a decor object on a host (absolute: CSS left/top/right/bottom in px; the host becomes a positioning parent) */
export function mxMount(host: HTMLElement, kind: DecorKind, at: { left?: number; top?: number; right?: number; bottom?: number; z?: number }, o: DecorOpts = {}): MxDecor | null {
  const d = mxDecor(kind, o);
  if (!d) return null;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const st = d.el.style;
  st.position = 'absolute';
  for (const k of ['left', 'top', 'right', 'bottom'] as const) if (at[k] !== undefined) st[k] = at[k] + 'px';
  if (at.z !== undefined) st.zIndex = String(at.z);
  host.append(d.el);
  return d;
}

// ================================================================ ICONS: the same little models, small, for keys
export type IconKind = 'gear' | 'wrench' | 'play' | 'tape' | 'clipboard' | 'door' | 'eye' | 'radio' | 'key' | 'lamp' | 'map' | 'skull' | 'jar' | 'bolt' | 'coin' | 'crate' | 'siren'
  // the lab menus' hub: a rolled blueprint, the commissary's ledger and coin tin, Dr. Calder's desk telephone (and off the hook)
  | 'blueprint' | 'ledger' | 'phone' | 'phoneOff';
function iconModel(kind: IconKind, S: number): THREE.Group {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.position.set(S / 2, -S / 2, 0);
  root.add(g);
  const u = S / 22; // design at 22
  const m = new Mold();
  switch (kind) {
    case 'gear': gearOn(m, 0, 0, -1.5 * u, 8, 6.4 * u, 9 * u, 0.2, 0xb08a3a, BRASS, 4, 3 * u); break;
    case 'wrench': {
      const q = -PI / 4;
      const sh = new THREE.Group(); sh.rotation.z = q; g.add(sh);
      const w = new Mold();
      w.add(plate(ngon(12, 3.6 * u, 0), 2 * u, 0.4, [ngon(6, 1.8 * u, 0)]), M(0, 7 * u, -1 * u), 0xb8bcb4, CHROME);
      w.add(fbox(3 * u, 11 * u, 2 * u, 0.25), M(0, 0, 0), 0xa8aca4, CHROME);
      const jaw: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) { const a = -PI / 2 + 0.7 + (i / 10) * (TAU - 1.4); jaw.push(new THREE.Vector2(Math.cos(a) * 4.4 * u, Math.sin(a) * 4.4 * u - 7.5 * u)); }
      jaw.push(new THREE.Vector2(-1 * u, -6.8 * u), new THREE.Vector2(1 * u, -6.8 * u));
      w.add(plate(jaw, 2 * u, 0.4), M(0, 0, -1 * u), 0xb8bcb4, CHROME);
      meshOf(w, mxMat({ wear: 0.5, seed: 3 }), sh);
      break;
    }
    case 'play': {
      const tri = [new THREE.Vector2(-5 * u, -7 * u), new THREE.Vector2(7.5 * u, 0), new THREE.Vector2(-5 * u, 7 * u)];
      m.add(plate(tri, 3 * u, 0.6), M(0, 0, -1.5 * u), 0x3ac85a, PLASTIC, 0);
      bolt(m, -2.5 * u, 0, 1.4 * u, 1.1 * u);
      break;
    }
    case 'tape': {
      m.add(plate(clipRect(19 * u, 12 * u, 1.5 * u), 3 * u, 0.5), M(0, 0, -1.5 * u), 0x1e2018, PLASTIC);
      m.add(plate(clipRect(13 * u, 5 * u, 1 * u), 0.8 * u, 0), M(0, 1 * u, 1.5 * u), 0xd8c890, PAINT);
      for (const x of [-3.6, 3.6]) { m.add(fcyl(2 * u, 1.2 * u, 8, 2 * u, 0.2), M(x * u, 1 * u, 2.2 * u, R90), 0x5a3a20, PLASTIC); m.add(fcyl(0.8 * u, 1.4 * u, 6, 0.8 * u, 0.2), M(x * u, 1 * u, 2.6 * u, R90), 0xe8e8e0, PLASTIC); }
      m.add(fbox(9 * u, 2 * u, 1 * u, 0.2), M(0, -4.2 * u, 1.4 * u), 0x3a3a30, PLASTIC);
      break;
    }
    case 'clipboard': {
      m.add(plate(clipRect(14 * u, 18 * u, 1.5 * u), 1.6 * u, 0.4), M(0, -0.5 * u, -1 * u), 0x8a5a2a, PAINT);
      m.add(plate(clipRect(11 * u, 13 * u, 0.6 * u), 0.6 * u, 0), M(0, -1.6 * u, 0.6 * u), 0xe8e0c8, PAINT);
      for (let i = 0; i < 4; i++) m.add(fbox((i === 3 ? 5 : 8) * u, 0.7 * u, 0.4 * u, 0), M(-0.5 * u, (2 - i * 2.6) * u, 1.1 * u), 0x4a4438, PAINT);
      m.add(fbox(7 * u, 2.4 * u, 2 * u, 0.25), M(0, 7.6 * u, 1.2 * u), 0xb8bcb4, CHROME);
      break;
    }
    case 'door': {
      m.add(plate(clipRect(14 * u, 19 * u, 0.8 * u), 2.4 * u, 0.5), M(0, 0, -1.2 * u), 0x6e2016, PAINT);
      m.add(plate(clipRect(8 * u, 5 * u, 0.5 * u), 0.6 * u, 0), M(0, 4.5 * u, 1.3 * u), 0x10140e, GLASS);
      m.add(fbox(1.6 * u, 4 * u, 1.6 * u, 0.2), M(4 * u, -1 * u, 1.8 * u), 0xc8ccc4, CHROME);
      for (const y of [6, -6]) m.add(fbox(2 * u, 2.6 * u, 1.6 * u, 0.2), M(-6.6 * u, y * u, 0.6 * u), 0x9aa29c, STEEL);
      m.add(fbox(10 * u, 1.8 * u, 0.6 * u, 0), M(0, -6.5 * u, 1.3 * u), 0xe0ac22, PAINT);
      break;
    }
    case 'eye': {
      const ball = new THREE.SphereGeometry(6.4 * u, 14, 10);
      meshOf(new Mold(false).add(ball, null, 0xffffff, [0.6, 0, 0, 0]), mxMat({ map: eyeTex(), full: true, wear: 0 }), g);
      const hood = new THREE.SphereGeometry(7.2 * u, 12, 8, 0, TAU, 0.95, PI - 0.95); hood.rotateX(PI / 2);
      m.add(hood, null, FLESH, PAINT);
      break;
    }
    case 'radio': {
      m.add(plate(clipRect(18 * u, 12 * u, 1.5 * u), 4 * u, 0.6), M(0, -1.5 * u, -2 * u), 0x56603c, PAINT);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) m.add(fbox(1.2 * u, 1.2 * u, 0.6 * u, 0), M((-6.5 + x * 2.2) * u, (-0.5 - y * 2.4) * u, 2.1 * u), 0x10120c, STEEL);
      m.add(fcyl(2.4 * u, 2 * u, 8, 2.6 * u, 0.25), M(4.4 * u, -2.4 * u, 2.6 * u, R90), 0x1a1a16, PLASTIC);
      m.add(frod([-6 * u, 4.5 * u, 0], [-8 * u, 10 * u, 0], 0.6 * u, 4), null, 0xc8ccc4, CHROME);
      break;
    }
    case 'key': {
      m.add(plate(clipRect(16 * u, 15 * u, 2 * u), 2 * u, 0.4), M(0, -1 * u, -3 * u), 0x1a1c16, STEEL);
      m.add(plate(clipRect(12 * u, 11 * u, 1.6 * u), 4 * u, 1.2 * u), M(0, 0, -1 * u), 0xe0ac22, PAINT);
      m.add(fbox(5 * u, 0.9 * u, 0.4 * u, 0), M(0, 0.5 * u, 3.1 * u), 0x14120c, PAINT);
      break;
    }
    case 'lamp': {
      m.add(fcyl(4.6 * u, 6 * u, 8, 5.4 * u, 0.25), M(-1 * u, 0, 0, 0, 0, R90), 0x56603c, PAINT);
      m.add(fcyl(5.2 * u, 1.6 * u, 10, 5.2 * u, 0.25), M(3.2 * u, 0, 0, 0, 0, R90), 0xb8c0bc, CHROME);
      m.add(fdome(4.4 * u, 10, 2, 0.4), M(4 * u, 0, 0, 0, 0, -R90), 0xfff0b0, GLASS, 1);
      m.add(fbox(10 * u, 2.4 * u, 3 * u, 0.2), M(-4 * u, -5 * u, 0), 0x2a2c24, RUBBER);
      break;
    }
    case 'map': {
      for (let i = 0; i < 3; i++) m.add(plate(clipRect(6 * u, 16 * u, 0.3 * u), 0.8 * u, 0), M((i - 1) * 6 * u, 0, (i === 1 ? 1 : 0) * u, 0, (i - 1) * -0.35, 0), (x, y) => (hh(Math.round(x), Math.round(y), 2) > 0.82 ? 0x9aa786 : 0xcdbf96), PAINT);
      m.add(fbox(0.9 * u, 9 * u, 0.4 * u, 0), M(0.5 * u, 0, 1.8 * u, 0, 0, 0.5), 0xb3261c, PAINT);
      break;
    }
    case 'skull': {
      // a gas-mask filter canister: the run is over
      m.add(fcyl(6.4 * u, 7 * u, 10, 6.8 * u, 0.25), M(0, 0, 0, R90), 0x3a3f38, STEEL);
      m.add(fcyl(5 * u, 1 * u, 10, 5 * u, 0.2), M(0, 0, 4 * u, R90), 0x1a1c16, RUBBER);
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; m.add(fcyl(0.9 * u, 1 * u, 6, 0.9 * u, 0), M(Math.cos(a) * 3 * u, Math.sin(a) * 3 * u, 4.6 * u, R90), 0x050504, STEEL); }
      m.add(fbox(14 * u, 2.2 * u, 0.6 * u, 0), M(0, 0, 4.9 * u, 0, 0, -0.6), 0xc8281c, PAINT);
      break;
    }
    case 'jar': {
      m.add(fcyl(6 * u, 12 * u, 10, 6 * u, 0.2), M(0, -1 * u, 0), 0x6a8436, GLASS);
      m.add(fcyl(7 * u, 3 * u, 10, 7.2 * u, 0.25), M(0, 6.4 * u, 0), 0xb08a3a, BRASS);
      m.add(fcyl(7.4 * u, 2.4 * u, 8, 7.8 * u, 0.25), M(0, -8 * u, 0), 0x3b4428, PAINT);
      const ball = new THREE.SphereGeometry(3.4 * u, 10, 8);
      meshOf(new Mold(false).add(ball, M(0, -0.5 * u, 6.2 * u), 0xffffff, [0.6, 0, 0, 0]), mxMat({ map: eyeTex(), full: true, wear: 0 }), g);
      g.rotation.x = 0.25;
      break;
    }
    case 'bolt': {
      const pts = [[-2, 9], [5, 9], [1, 2], [6, 2], [-3, -10], [-0.5, -1], [-5.5, -1]].map(([x, y]) => new THREE.Vector2(x * u, y * u));
      m.add(plate(pts, 2.6 * u, 0.5), M(0, 0, -1.3 * u), 0xe8c440, PAINT, 0.4);
      break;
    }
    case 'coin': {
      m.add(fcyl(7.6 * u, 2.4 * u, 12, 7.6 * u, 0.3), M(0, 0, 0, R90), 0xc8a24a, BRASS);
      m.add(fring(5.4 * u, 0.6 * u, 12, 4), M(0, 0, 1.3 * u), 0xead08a, BRASS);
      m.add(fbox(1.6 * u, 7 * u, 0.8 * u, 0.1), M(0, 0, 1.5 * u), 0x8a6a24, BRASS);
      break;
    }
    case 'crate': {
      m.add(fbox(15 * u, 13 * u, 9 * u, 0.12), M(0, -1 * u, 0), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? 0x9a7a4a : 0x6a4e2a), PAINT);
      for (const y of [-5.5, 3.5]) m.add(fbox(15.6 * u, 1.6 * u, 9.6 * u, 0.1), M(0, y * u, 0), 0x4a5048, STEEL);
      m.add(fbox(1.4 * u, 13 * u, 0.6 * u, 0), M(0, -1 * u, 4.8 * u, 0, 0, 0.7), 0x5a4224, PAINT);
      break;
    }
    case 'blueprint': {
      // a rolled sheet lying across, its spiral end showing, a red band, the corner of the drawing unrolled under it
      const roll = new THREE.Group(); roll.rotation.z = 0.42; g.add(roll);
      const b = new Mold();
      b.add(plate(clipRect(12 * u, 7 * u, 0.4 * u), 0.5 * u, 0), M(-1.5 * u, -5 * u, -1 * u, 0, 0, 0.1), (x, y) => (Math.abs(((x / u) % 3)) < 0.35 || Math.abs(((y / u) % 3)) < 0.35 ? 0xb8d8ff : 0x2a5a9a), PAINT);
      b.add(fcyl(3.6 * u, 19 * u, 10, 3.6 * u, 0.15), M(0, 0, 0, 0, 0, R90), (_x, y, z) => (Math.abs(y) < 0.4 * u && z > 0 ? 0xc8e0ff : 0x3a6aaa), PAINT);
      for (const x of [-9.6, 9.6]) { b.add(fring(2.4 * u, 0.35 * u, 10, 4), M(x * u, 0, 0, 0, R90, 0), 0xd8e8ff, PAPER); b.add(fring(1.2 * u, 0.3 * u, 8, 4), M(x * u, 0, 0, 0, R90, 0), 0xa8c8f0, PAPER); }
      b.add(fring(3.75 * u, 0.5 * u, 10, 4), M(3.6 * u, 0, 0, 0, R90, 0), 0xc8281c, RUBBER);
      meshOf(b, mxMat({ wear: 0.4, seed: 5 }), roll);
      break;
    }
    case 'ledger': {
      // the commissary's ledger (green cloth, cream page edges, a red ribbon) with a brass coin tin on it, lid ajar
      m.add(plate(clipRect(17 * u, 12 * u, 0.8 * u), 3 * u, 0.4), M(0, -3 * u, -3 * u), (_x, _y, z) => (z > -2.5 * u && z < -0.5 * u ? 0xe8e0c8 : 0x2e5a3a), PAINT);
      m.add(fbox(1.2 * u, 5 * u, 0.4 * u, 0), M(5 * u, -9 * u, 0.2 * u), 0xb3261c, PAINT);
      m.add(fcyl(5 * u, 4 * u, 12, 5 * u, 0.2), M(-1 * u, 1.5 * u, 2.6 * u, R90), 0xb08a3a, BRASS);
      m.add(fcyl(5.4 * u, 1.2 * u, 12, 5.4 * u, 0.25), M(0.5 * u, 3.6 * u, 5.6 * u, R90 - 0.5, 0, 0.2), 0xc8a24a, BRASS);
      for (let i = 0; i < 3; i++) m.add(fcyl(2.2 * u, 0.7 * u, 10, 2.2 * u, 0.25), M((-2 + i * 1.6) * u, (0.6 + i * 0.5) * u, (4.8 + i * 0.6) * u, R90), 0xead08a, BRASS);
      g.rotation.x = 0.35;
      break;
    }
    case 'phone':
    case 'phoneOff': {
      // a bakelite desk telephone with a rotary dial; on hold the handset is off its cradle and the line lamp burns red
      const off = kind === 'phoneOff';
      m.add(flathe([[8 * u, 0], [7.6 * u, 3.4 * u], [6 * u, 5.6 * u], [3 * u, 6.4 * u], [0, 6.6 * u]], 8), M(0, -6 * u, 0, 0, PI / 8, 0, 1, 1, 0.8), (_x, y) => (y > -1.2 * u ? 0x8e9a66 : 0x6e7a4c), PAINT);
      m.add(fcyl(3.2 * u, 0.8 * u, 12, 3.2 * u, 0.2), M(0, -3.4 * u, 4.4 * u, 0.8, 0, 0), 0xd8d0b8, PAINT);
      m.add(fring(2.4 * u, 0.5 * u, 10, 4), M(0, -3.4 * u, 4.9 * u, 0.8, 0, 0), 0x2a2620, PLASTIC);
      m.add(fcyl(0.9 * u, 0.6 * u, 8, 0.9 * u, 0.2), M(0, -3.4 * u, 5 * u, 0.8, 0, 0), 0xb3261c, PAINT);
      // the cradle's two prongs
      for (const x of [-5, 5]) m.add(fbox(1.4 * u, 2.4 * u, 1.6 * u, 0.2), M(x * u, 0.4 * u, -0.6 * u), 0xb8c0bc, CHROME);
      const hs = new THREE.Group();
      if (off) { hs.position.set(4.5 * u, -9 * u, 5 * u); hs.rotation.set(0.3, 0.2, -0.5); } else hs.position.set(0, 2 * u, -0.6 * u);
      g.add(hs);
      const h = new Mold();
      h.add(fbox(12 * u, 2.2 * u, 2.4 * u, 0.3), M(0, 0, 0), 0x2a2822, PLASTIC);
      h.add(fbox(9 * u, 0.6 * u, 0.4 * u, 0), M(0, 0.9 * u, 1.2 * u), 0x6a6458, PLASTIC);
      for (const x of [-6.4, 6.4]) h.add(fcyl(2.4 * u, 2.2 * u, 8, 1.8 * u, 0.25), M(x * u, -1.4 * u, 0), 0x1c1a16, PLASTIC);
      meshOf(h, mxMat({ wear: 0.3, seed: 9 }), hs);
      // the line lamp: dark until she is on hold
      const lm = new Mold().add(fdome(1.8 * u, 8, 2, 0.8), M(-5.4 * u, -7 * u, 3.8 * u, 0.6, 0, 0), off ? 0xff5a3a : 0x5a2018, GLASS, off ? 1 : 0);
      const lmat = mxMat({ seed: 2 });
      if (off) lmat.uniforms.uGlow.value.set(1, 0.3, 0.15);
      meshOf(lm, lmat, g);
      g.rotation.x = 0.42;
      break;
    }
    case 'siren': {
      m.add(fcyl(6 * u, 3 * u, 8, 6.6 * u, 0.25), M(0, -6 * u, 0), 0x3b4428, PAINT);
      m.add(flathe([[5.4 * u, 0], [5.4 * u, 6 * u], [4 * u, 9 * u], [0, 10 * u]], 10), M(0, -4.5 * u, 0), (x, _y, z) => (Math.cos(Math.atan2(z, x) - 1.2) > 0.6 ? 0xfff0d0 : 0xff3a22), GLASS, 1);
      g.rotation.x = 0.3;
      break;
    }
  }
  if (!m.empty) {
    const mat = mxMat({ wear: 0.4, seed: 7 });
    if (kind === 'lamp' || kind === 'bolt' || kind === 'siren') mat.uniforms.uGlow.value.set(1, 0.8, 0.4);
    meshOf(m, mat, g);
  }
  return root;
}
/** a little 3D icon (cached): a canvas of size + 2 x 3 px */
export function mxIcon(kind: IconKind, size = 22): HTMLCanvasElement | null {
  if (!mxOk()) return null;
  const free = kind === 'eye' || kind === 'jar' || kind === 'siren' || kind === 'phone' || kind === 'phoneOff' || kind === 'ledger';
  const sh = sheet(`ico|${kind}|${size}`, size, size, 3, 1, () => iconModel(kind, size), free ? FREE : WALL);
  if (!sh) return null;
  const cv = frameCanvas(sh.width, sh.height, 'mxi-cv');
  cv.getContext('2d')!.drawImage(sh, 0, 0);
  return cv;
}

/**
 * paint one still frame of a decor object into any 2D context (the task board's baked housings):
 * (x, y) is the model box's top-left in that context's units; frame picks the pose (a beacon's sweep)
 */
export function paintDecor(c: CanvasRenderingContext2D, kind: 'gears' | 'beacon' | 'wrench' | 'buttons' | 'valve', x: number, y: number, o: { s?: number; col?: BeaconCol; on?: boolean; frame?: number; w?: number } = {}) {
  if (!mxOk()) return;
  const s = o.s ?? 1;
  const at = (sh: HTMLCanvasElement | null, pad: number, w: number, h: number, f: number) => {
    if (!sh) return;
    const fw = Math.round(w + pad * 2), fh = Math.round(h + pad * 2);
    const sm = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
    c.drawImage(sh, 0, f * fh, fw, fh, x - pad, y - pad, fw, fh);
    c.imageSmoothingEnabled = sm;
  };
  if (kind === 'gears') at(gearsSheet(s), 6, 64 * s, 50 * s, (o.frame ?? 0) % GEAR_F);
  else if (kind === 'beacon') at(beaconSheet(!!o.on, o.col ?? 'amber', s), 5, 34 * s, 34 * s, o.on ? (o.frame ?? 3) % BEACON_F : 0);
  else if (kind === 'wrench') at(wrenchSheet(s), 6, 26 * s, 70 * s, Math.floor(WR_F / 2));
  else if (kind === 'buttons') at(buttonsSheet(s), 5, 70 * s, 32 * s, (o.frame ?? 1) & 15);
  else at(valveSheet(s, Math.round(o.w ?? 90)), 6, Math.round(o.w ?? 90), 40 * s, (o.frame ?? 0) % VALVE_F);
}

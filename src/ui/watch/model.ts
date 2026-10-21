// The watch in first person: your left forearm raised in front of your face,
// yellow jumpsuit sleeve shoved up, the BAILIFF band bolted through the wrist,
// and on it a chunky retro-futurist wrist computer: a scratched steel case with
// a bakelite faceplate, a curved phosphor CRT behind a riveted bezel, a big
// knurled function dial, a needle gauge, two bat-handle toggle switches, three
// jewel lamps, a speaker grille, a stamped brass maker's plate and a telescopic
// antenna. Multi-tool modules bolt on as they are researched: a chrome lamp, a
// brass laser emitter fed by two vacuum tubes, a scanner dish, fabricator
// pincers and a bakelite battery.
//
// Device space: X runs along the forearm (elbow at -X, hand at +X), Y up,
// Z toward the eye. The screen sits at SCREEN (centre) facing +Z.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { atlas } from '../../gfx/atlas';

export const SCR_W = 224, SCR_H = 136;
/** metres per screen pixel (the CRT is 67 x 41 mm) */
export const SCR_PX = 0.0003;
export const SCREEN = { w: SCR_W * SCR_PX, h: SCR_H * SCR_PX, x: -0.036, y: 0.003, z: 0.0 };

const ARM_R = 0.031;
const TOP = ARM_R + 0.003;            // underside of the case
const HOUSE = { w: 0.124, h: 0.076, d: 0.024, cx: SCREEN.x + 0.015 };
const FRONT = TOP + HOUSE.d;          // the faceplate
SCREEN.z = FRONT + 0.0004;
/** the right-hand control column (function dial above, needle gauge below) */
const COL_X = HOUSE.cx + HOUSE.w / 2 - 0.02;

let texReady = false;
function textures() {
  if (texReady) return;
  texReady = true;
  const A = atlas();
  // scratched, brushed steel
  A.add('wt_steel', 16, 16, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); const streak = (y * 7 + (x >> 3)) % 5 === 0 ? 10 : 0; pc.set(x, y, n < 0.1 ? 0x6c7174 : n < 0.3 ? 0x8a8f90 + streak : 0x7c8183 + streak); });
    for (let i = 0; i < 7; i++) { const x = rng.int(0, 15), y = rng.int(0, 15); for (let k = 0; k < 5; k++) pc.blend(x + k, y + (k >> 2), 0xc8cccc, 0.55); }
    for (let i = 0; i < 4; i++) pc.blend(rng.int(0, 15), rng.int(0, 15), 0x4a3a2a, 0.5);
    pc.hline(0, 15, 0, 0xa4a8a8); pc.hline(0, 15, 15, 0x4c5052);
  });
  // bakelite: warm near-black brown, mottled, rubbed shiny at the edges
  A.add('wt_bake', 16, 16, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.15 ? 0x241812 : n < 0.3 ? 0x3a2a1e : 0x2e2018); });
    for (let i = 0; i < 6; i++) pc.blend(rng.int(0, 15), rng.int(0, 15), 0x5a4232, 0.6);
    pc.hline(0, 15, 0, 0x5a4434); pc.vline(0, 0, 15, 0x4a3628);
  });
  A.add('wt_knurl', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, x % 2 ? 0x2a2420 : (y === 0 ? 0x9a948c : 0x6a645c))); });
  A.add('wt_knobtop', 12, 12, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 5.5, y - 5.5); pc.set(x, y, d > 5.6 ? 0x1a120c : d > 4.6 ? 0x4a3a2c : 0x2e2018); });
    for (let y = 1; y < 6; y++) { pc.set(5, y, 0xe8e0c8); pc.set(6, y, 0xe8e0c8); }
  });
  // the dial plate behind the function knob: detent ticks
  A.add('wt_dialring', 16, 16, (pc) => {
    pc.fill(0x1c1410);
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.75 + i * (Math.PI * 1.5 / 8); for (let r = 6; r < 8; r++) pc.set(Math.round(7.5 + Math.cos(a) * r), Math.round(7.5 + Math.sin(a) * r), i === 0 ? 0xffb030 : 0xd8d0b8); }
  });
  // gauge face: cream, a tick arc, a red zone
  A.add('wt_gauge', 16, 16, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); pc.set(x, y, d > 7.6 ? 0x2a2420 : d > 6.8 ? 0x9a9488 : 0xe8dcbc); });
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.8 + i * 0.14); const r0 = i % 5 ? 5.2 : 4.4; for (let r = r0; r < 6.4; r += 0.6) pc.set(Math.round(7.5 + Math.cos(a) * r), Math.round(7.5 + Math.sin(a) * r), i < 2 ? 0xc02a1a : 0x2a2018); }
    pc.set(6, 10, 0x2a2018); pc.set(7, 10, 0x2a2018); pc.set(8, 10, 0x2a2018); pc.set(7, 11, 0x2a2018);
  });
  A.add('wt_grille', 16, 8, (pc) => { pc.fill(0x3a2a1e); pc.each((x, y) => { if ((x % 3 === 1) && (y % 3 === 1)) pc.set(x, y, 0x0a0806); else if ((x % 3 === 2) && (y % 3 === 2)) pc.set(x, y, 0x5a4434); }); });
  // stamped brass maker's plate (glyph-like embossing)
  A.add('wt_plate', 24, 8, (pc, rng) => {
    pc.each((x, y) => pc.set(x, y, y === 0 ? 0xf0d080 : y === 7 ? 0x7a5a20 : 0xc8a048));
    for (let x = 2; x < 22; x++) for (let y = 2; y < 6; y++) if ((x % 4 !== 1) && rng.next() < 0.55) pc.set(x, y, rng.next() < 0.5 ? 0x7a5a20 : 0xf0d080);
    pc.set(1, 1, 0x6a4a18); pc.set(22, 1, 0x6a4a18); pc.set(1, 6, 0x6a4a18); pc.set(22, 6, 0x6a4a18);
  });
  A.add('wt_brass', 8, 8, (pc, rng) => { pc.each((x, y) => { const n = rng.next(); pc.set(x, y, y === 0 ? 0xf8e098 : n < 0.2 ? 0x9a7428 : n < 0.5 ? 0xd0a848 : 0xb88e34); }); });
  A.add('wt_copper', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y % 2 ? 0x7a3a18 : 0xd07a40)); });
  A.add('wt_haz', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, ((x + y) >> 1) % 2 ? 0xd8a42a : 0x17150f)); });
  A.add('wt_cuff', 24, 8, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, y === 0 ? 0x8f979e : y === 7 ? 0x2a3035 : n < 0.15 ? 0x545c62 : 0x646c72); });
    for (const x of [3, 11, 19]) { pc.set(x, 2, 0xcfd6da); pc.set(x, 5, 0xcfd6da); }
    for (let i = 0; i < 6; i++) pc.set(rng.int(0, 23), rng.int(1, 6), 0x5a2a1a);
  });
  A.add('wt_sleeve', 16, 16, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.15 ? 0xc89a1c : n < 0.3 ? 0xf0c43a : 0xe2b22c); });
    for (let x = 0; x < 16; x += 2) pc.set(x, 13, 0x8a6a12);
    for (let i = 0; i < 5; i++) pc.blend(rng.int(0, 15), rng.int(0, 15), 0x5a4a2a, 0.5);
  });
  A.add('wt_skin', 8, 8, (pc, rng) => { pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.1 ? 0xd8d0c8 : n < 0.16 ? 0xb8aca2 : 0xeee6de); }); });
  A.add('wt_crust', 8, 8, (pc, rng) => {
    pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5) / 4.5 + rng.next() * 0.3; pc.set(x, y, d < 0.45 ? 0x7a0d0a : d < 0.8 ? 0x4a0a08 : 0x2a1a14); });
  });
  A.add('wt_rubber', 8, 8, (pc, rng) => { pc.each((x, y) => pc.set(x, y, rng.next() < 0.2 ? 0x141210 : 0x1e1a17)); });
}

export interface WatchModel {
  root: THREE.Group;
  arm: THREE.Mesh;
  hand: THREE.Mesh;
  stump: THREE.Mesh;
  screen: THREE.Mesh;
  /** jewel lamps: red alert, amber signal, green power */
  lamps: { power: THREE.Mesh; alert: THREE.Mesh; signal: THREE.Mesh };
  /** the function dial (rotates about its own Z) */
  knob: THREE.Object3D;
  /** the gauge needle (rotates about Z) */
  needle: THREE.Object3D;
  /** bat-handle toggles (pivot about X): torch, laser arm */
  toggles: { torch: THREE.Object3D; laser: THREE.Object3D };
  mods: { torch: THREE.Object3D; laser: THREE.Object3D; dish: THREE.Object3D; fab: THREE.Object3D; cell: THREE.Object3D };
  laserTip: THREE.Object3D;
  torchLens: THREE.Mesh;
  /** vacuum-tube filaments and the emitter's lens (glow when armed) */
  filaments: THREE.MeshBasicMaterial;
  laserLens: THREE.Mesh;
  antenna: THREE.Object3D;
  rebuildArm(skin: number): void;
}

const basic = (c: number, o: Partial<THREE.MeshBasicMaterialParameters> = {}) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, ...o });
const scale = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

export function buildWatchModel(screenMat: THREE.Material): WatchModel {
  textures();
  // double-sided: the whole wrist is mirrored when the band has moved to the right arm
  const mat = worldMaterial({ noVis: true, noFog: true, noGrid: true, doubleSide: true });
  const root = new THREE.Group();
  const H = HOUSE, cx = H.cx;

  // ---- forearm, sleeve, the case (rebuilt when the skin tone changes)
  const armGeo = (skin: number) => {
    const mb = new ModelBuilder();
    // forearm along X: rotate the builder so cylinders (built along Y) lie along +X
    mb.push().rotateZ(-Math.PI / 2);
    mb.cylinder(0, -0.36, 0, ARM_R + 0.004, 0.24, 9, 'wt_skin', { color: skin, rTop: ARM_R, fit: true });
    mb.cylinder(0, -0.12, 0, ARM_R, 0.13, 9, 'wt_skin', { color: skin, rTop: ARM_R * 0.86, fit: true });
    // the sleeve, shoved up past the elbow, with a rolled cuff
    mb.cylinder(0, -0.46, 0, ARM_R + 0.012, 0.19, 9, 'wt_sleeve', { fit: true });
    mb.cylinder(0, -0.285, 0, ARM_R + 0.016, 0.026, 9, 'wt_sleeve', { color: 0xd8d8d8, fit: true });
    // the BAILIFF cuff round the wrist
    mb.cylinder(0, -0.09, 0, ARM_R + 0.0035, 0.07, 10, { sides: 'wt_cuff', top: 'wt_steel', bottom: 'wt_steel' }, { fit: true });
    mb.pop();
    // ---- the case: steel shell, bakelite faceplate, chamfers
    mb.box(cx, -H.h / 2, TOP + H.d / 2 - 0.002, H.w, H.h, H.d - 0.004, 'wt_steel', { fit: true });
    mb.box(cx, -H.h / 2 + 0.003, FRONT - 0.002, H.w - 0.006, H.h - 0.006, 0.004, { all: 'wt_bake', south: 'wt_bake' }, { fit: true });
    mb.box(cx, H.h / 2 - 0.003, TOP + H.d / 2 - 0.002, H.w - 0.008, 0.005, H.d - 0.002, 'wt_steel', { fit: true, color: 0xc8c8c0 });
    mb.box(cx, -H.h / 2 - 0.002, TOP + H.d / 2 - 0.002, H.w - 0.008, 0.005, H.d - 0.002, 'wt_haz', { fit: true });
    for (const sx of [-1, 1]) mb.box(cx + sx * (H.w / 2 + 0.003), -0.026, TOP + H.d / 2 - 0.002, 0.006, 0.052, H.d - 0.006, 'wt_rubber', { fit: true });
    // the CRT bezel: a thick steel frame standing proud of the faceplate, riveted
    const bw = SCREEN.w + 0.012, bh = SCREEN.h + 0.012, sxc = SCREEN.x, syc = SCREEN.y;
    mb.box(sxc, syc + SCREEN.h / 2, FRONT + 0.0015, bw, 0.006, 0.003, 'wt_steel', { fit: true, color: 0xb8b8b0 });
    mb.box(sxc, syc - SCREEN.h / 2 - 0.006, FRONT + 0.0015, bw, 0.006, 0.003, 'wt_steel', { fit: true, color: 0x9a9a94 });
    for (const sx of [-1, 1]) mb.box(sxc + sx * (SCREEN.w / 2 + 0.003), syc - bh / 2 + 0.006, FRONT + 0.0015, 0.006, bh - 0.012, 0.003, 'wt_steel', { fit: true, color: sx < 0 ? 0xa8a8a0 : 0x8c8c86 });
    for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.cylinder(sxc + rx * (bw / 2 - 0.003), syc + ry * (bh / 2 - 0.003), FRONT + 0.003, 0.0013, 0.0012, 6, 'wt_brass');
    // the dark rim inside the bezel, round-cornered by the screen shader
    mb.box(sxc, syc - SCREEN.h / 2 - 0.001, FRONT - 0.0002, SCREEN.w + 0.002, SCREEN.h + 0.002, 0.0005, 'wt_rubber', { fit: true });
    // the control column: dial plate, gauge bezel
    mb.box(COL_X, 0.0035, FRONT + 0.0004, 0.026, 0.026, 0.0008, 'wt_dialring', { fit: true });
    mb.push().translate(COL_X, -0.019, FRONT + 0.0005).rotateX(Math.PI / 2);
    mb.cylinder(0, 0, 0, 0.0115, 0.0024, 12, 'wt_steel', { color: 0xd0d0c8 });
    mb.pop();
    // speaker grille and the maker's plate along the bottom strip
    mb.box(SCREEN.x - 0.014, -H.h / 2 + 0.006, FRONT + 0.0003, 0.036, 0.008, 0.0008, 'wt_grille', { fit: true });
    mb.box(SCREEN.x + 0.021, -H.h / 2 + 0.0065, FRONT + 0.0004, 0.026, 0.0072, 0.001, 'wt_plate', { fit: true });
    // toggle-switch bases on the top rail
    for (const tx of [cx - 0.006, cx + 0.008]) mb.box(tx, H.h / 2, TOP + H.d * 0.55, 0.009, 0.003, 0.009, 'wt_steel', { fit: true, color: 0xa0a0a0 });
    // case corner rivets
    for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.cylinder(cx + rx * (H.w / 2 - 0.004), ry * (H.h / 2 - 0.004), FRONT, 0.0016, 0.0014, 6, 'wt_brass');
    // bolts through the forearm, with what came out around them
    for (const sy of [1, -1]) {
      const by = sy * (ARM_R + 0.002);
      mb.push().translate(cx - 0.045, by, 0).rotateX(Math.PI / 2 * sy);
      mb.cylinder(0, 0, 0, 0.006, 0.007, 6, 'metal_dark');
      mb.pop();
      mb.box(cx - 0.045, by - 0.007, 0.012, 0.016, 0.014, 0.003, 'wt_crust', { fit: true });
    }
    // armoured strap plates down the cuff
    mb.box(cx - H.w / 2 + 0.008, -ARM_R - 0.003, 0, 0.016, 0.006, ARM_R * 1.6, 'wt_steel', { fit: true });
    mb.box(cx + H.w / 2 - 0.008, -ARM_R - 0.003, 0, 0.016, 0.006, ARM_R * 1.6, 'wt_steel', { fit: true });
    return mb.build();
  };
  // hand: a loose fist, back of the hand toward the eye, knuckles, curled fingers, thumb on top
  const handGeo = (skin: number) => {
    const mb = new ModelBuilder();
    const hx = 0.03;
    mb.box(hx + 0.034, -0.026, 0.0, 0.056, 0.052, 0.03, 'wt_skin', { color: skin, fit: true });
    mb.box(hx + 0.066, -0.028, -0.004, 0.014, 0.056, 0.03, 'wt_skin', { color: scale(skin, 0.9), fit: true });
    for (let i = 0; i < 4; i++) mb.box(hx + 0.069, 0.017 - i * 0.0135, 0.012, 0.01, 0.01, 0.007, 'wt_skin', { color: scale(skin, 0.82), fit: true });
    mb.box(hx + 0.058, -0.03, -0.026, 0.026, 0.058, 0.024, 'wt_skin', { color: scale(skin, 0.7), fit: true });
    mb.push().translate(hx + 0.024, 0.026, 0.004).rotateZ(-0.55);
    mb.box(0, 0, 0, 0.042, 0.015, 0.019, 'wt_skin', { color: scale(skin, 0.92), fit: true });
    mb.pop();
    return mb.build();
  };
  const arm = new THREE.Mesh(armGeo(0xc8a080), mat);
  const hand = new THREE.Mesh(handGeo(0xc8a080), mat);
  // where the hand was: a cauterised, bound stump
  const sm = new ModelBuilder();
  sm.push().rotateZ(-Math.PI / 2);
  sm.cylinder(0, 0.012, 0, ARM_R * 0.86, 0.016, 9, { sides: 'wt_rubber', top: 'wt_crust', bottom: 'wt_crust' }, { fit: true, color: 0xb8a890 });
  sm.pop();
  const stump = new THREE.Mesh(sm.build(), mat);
  stump.visible = false;
  root.add(arm, hand, stump);

  // ---- the CRT
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat);
  screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  root.add(screen);
  // a sliver of curved glass catching the light
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.004, SCREEN.h * 0.7), basic(0xffffff, { transparent: true, opacity: 0.06, depthWrite: false }));
  glass.position.set(SCREEN.x - SCREEN.w * 0.28, SCREEN.y + 0.002, SCREEN.z + 0.0015); glass.rotation.z = -0.35;
  root.add(glass);

  // ---- jewel lamps (glass domes) on the top strip
  const lampGeo = new THREE.SphereGeometry(0.0023, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  const ringGeo = new THREE.CylinderGeometry(0.0031, 0.0031, 0.0012, 10).rotateX(Math.PI / 2);
  const ringMat = basic(0x8a8a84);
  const lamp = (i: number) => {
    const x = SCREEN.x - SCREEN.w / 2 + 0.004 + i * 0.0085, y = SCREEN.y + SCREEN.h / 2 + 0.0105;
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.set(x, y, FRONT + 0.0006); root.add(ring);
    const m = new THREE.Mesh(lampGeo, basic(0x101010)); m.position.set(x, y, FRONT + 0.0012); root.add(m); return m;
  };
  const lamps = { power: lamp(0), signal: lamp(1), alert: lamp(2) };

  // ---- the function dial: a knurled bakelite knob with a pointer
  const knob = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.push().rotateX(Math.PI / 2);
    mb.cylinder(0, 0, 0, 0.0082, 0.006, 14, { sides: 'wt_knurl', top: 'wt_knobtop', bottom: 'wt_bake' }, { fit: true });
    mb.cylinder(0, 0.006, 0, 0.0066, 0.002, 14, { sides: 'wt_bake', top: 'wt_knobtop', bottom: 'wt_bake' }, { fit: true });
    mb.pop();
    knob.add(new THREE.Mesh(mb.build(), mat));
    knob.children[0].rotation.x = Math.PI; // the builder's +Y became -Z: face it toward the eye
    knob.children[0].position.z = 0.0085;
  }
  knob.position.set(COL_X, 0.0165, FRONT);
  knob.userData.hit = 'dial';
  root.add(knob);

  // ---- needle gauge: cream face, glass, a red needle
  {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.0098, 16), worldMaterial({ noVis: true, noFog: true, noGrid: true, unlit: true }));
    const uv = atlas().get('wt_gauge');
    const g = face.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute('position'), uvA = g.getAttribute('uv');
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uv.u0 + (pos.getX(i) / 0.0196 + 0.5) * (uv.u1 - uv.u0), uv.v0 + (pos.getY(i) / 0.0196 + 0.5) * (uv.v1 - uv.v0));
    const col = new Float32Array(pos.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    face.position.set(COL_X, -0.019 + 0.0012, FRONT + 0.0028);
    root.add(face);
  }
  const needle = new THREE.Group();
  {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.0082, 0.0004).translate(0, 0.0036, 0), basic(0xb01810));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.0008, 8).rotateX(Math.PI / 2), basic(0x1a1410));
    needle.add(n, hub);
  }
  needle.position.set(COL_X, -0.019 - 0.0015, FRONT + 0.0034);
  root.add(needle);

  // ---- bat-handle toggles on the top rail (pivot at the base, flick along Z)
  const toggle = (x: number) => {
    const piv = new THREE.Group();
    const mb = new ModelBuilder();
    mb.cylinder(0, 0, 0, 0.0011, 0.0085, 6, 'chrome', { rTop: 0.0017 });
    piv.add(new THREE.Mesh(mb.build(), mat));
    piv.position.set(x, H.h / 2 + 0.0028, TOP + H.d * 0.55);
    piv.userData.hit = 'toggle';
    root.add(piv);
    return piv;
  };
  const toggles = { torch: toggle(cx - 0.006), laser: toggle(cx + 0.008) };
  toggles.torch.userData.which = 'torch'; toggles.laser.userData.which = 'laser';

  // ---- telescopic antenna at the elbow end
  const am = new ModelBuilder();
  am.cylinder(0, 0, 0, 0.0016, 0.012, 6, 'chrome');
  am.cylinder(0, 0.012, 0, 0.0011, 0.014, 6, 'chrome');
  am.sphere(0, 0.027, 0, 0.0026, 6, 4, 'wt_brass');
  const antenna = new THREE.Mesh(am.build(), mat);
  antenna.position.set(cx - H.w / 2 + 0.008, H.h / 2 + 0.001, TOP + H.d * 0.4);
  antenna.rotation.z = 0.25;
  root.add(antenna);

  // ---- multi-tool modules
  // torch: a chrome lamp on the hand-end of the case, lens facing along +X
  const torch = new THREE.Group();
  { const mb = new ModelBuilder(); mb.push().rotateZ(-Math.PI / 2); mb.cylinder(0, -0.006, 0, 0.0075, 0.012, 10, 'chrome', { rTop: 0.0085 }); mb.pop(); mb.box(-0.004, -0.009, 0, 0.006, 0.004, 0.01, 'wt_bake', { fit: true }); torch.add(new THREE.Mesh(mb.build(), mat)); }
  const torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.0072, 10).rotateY(Math.PI / 2), basic(0x3a3630));
  torchLens.position.set(0.0062, 0, 0); torch.add(torchLens);
  torch.position.set(cx + H.w / 2 + 0.008, 0.016, TOP + H.d * 0.55);
  root.add(torch);
  // laser: a brass emitter barrel along the top rail, wound with copper, fed by two vacuum tubes
  const laser = new THREE.Group();
  const filaments = basic(0x3a1a08);
  {
    const mb = new ModelBuilder();
    mb.box(-0.012, 0, 0, 0.022, 0.006, 0.012, 'wt_bake', { fit: true });          // tube socket block
    mb.push().translate(0, 0.0105, 0).rotateZ(-Math.PI / 2);
    mb.cylinder(0, -0.024, 0, 0.0042, 0.05, 10, 'wt_brass');
    for (let i = 0; i < 6; i++) mb.cylinder(0, -0.006 + i * 0.0036, 0, 0.0052, 0.0018, 10, 'wt_copper');
    mb.cylinder(0, 0.026, 0, 0.0058, 0.008, 10, 'wt_brass', { rTop: 0.0026 });
    mb.pop();
    laser.add(new THREE.Mesh(mb.build(), mat));
    // the tubes: glass envelopes over glowing filaments
    const env = basic(0xc8d8c8, { transparent: true, opacity: 0.28, depthWrite: false });
    for (const tx of [-0.018, -0.007]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.016, 10), env);
      tube.position.set(tx, 0.014, 0);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), env);
      cap.position.set(tx, 0.022, 0);
      const fil = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.01, 0.0012), filaments);
      fil.position.set(tx, 0.014, 0);
      laser.add(tube, cap, fil);
    }
  }
  const laserLens = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 8).rotateY(Math.PI / 2), basic(0x401008));
  laserLens.position.set(0.0341, 0.0105, 0); laser.add(laserLens);
  const laserTip = new THREE.Object3D(); laserTip.position.set(0.036, 0.0105, 0); laser.add(laserTip);
  laser.position.set(cx + 0.03, H.h / 2 + 0.001, TOP + H.d * 0.45);
  root.add(laser);
  // scanner dish: brass, on a stalk by the antenna
  const dish = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.cylinder(0, 0, 0, 0.0016, 0.007, 6, 'chrome');
    mb.cylinder(0, 0.007, 0, 0.003, 0.004, 12, 'wt_brass', { rTop: 0.01 });
    mb.sphere(0, 0.0105, 0, 0.0014, 6, 4, 'wt_brass');
    dish.add(new THREE.Mesh(mb.build(), mat));
  }
  dish.position.set(cx - H.w / 2 + 0.024, H.h / 2 + 0.001, TOP + H.d * 0.5);
  root.add(dish);
  // fabricator: brass pincers over the knuckles
  const fab = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.box(0, 0, 0, 0.03, 0.01, 0.012, 'wt_bake', { fit: true });
    for (const s of [-1, 1]) { mb.push().translate(0.016, 0.005 + s * 0.006, 0.004).rotateZ(s * 0.5); mb.box(0.008, -0.002, 0, 0.018, 0.004, 0.006, 'wt_brass'); mb.pop(); }
    mb.cylinder(-0.006, 0.01, 0.004, 0.003, 0.003, 8, 'wt_copper');
    fab.add(new THREE.Mesh(mb.build(), mat));
  }
  fab.position.set(cx + H.w / 2 + 0.034, -0.024, TOP + 0.006);
  root.add(fab);
  // battery: a bakelite cell with brass terminals strapped on behind the case
  const cell = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.box(0, -0.016, 0, 0.034, 0.032, 0.012, 'wt_bake', { fit: true });
    mb.box(0, -0.011, 0.0062, 0.026, 0.005, 0.001, 'wt_haz', { fit: true });
    for (const tx of [-0.01, 0.01]) mb.cylinder(tx, 0.016, 0, 0.0026, 0.004, 8, 'wt_brass');
    cell.add(new THREE.Mesh(mb.build(), mat));
  }
  cell.position.set(cx - H.w / 2 - 0.03, 0.0, TOP + 0.004);
  root.add(cell);

  for (const o of [torch, laser, dish, fab, cell]) o.visible = false;

  return {
    root, arm, hand, stump, screen, lamps, knob, needle, toggles, antenna, laserTip, torchLens, laserLens, filaments,
    mods: { torch, laser, dish, fab, cell },
    rebuildArm(skin: number) { arm.geometry.dispose(); arm.geometry = armGeo(skin); hand.geometry.dispose(); hand.geometry = handGeo(skin); },
  };
}

export function setLamp(m: THREE.Mesh, c: number) { (m.material as THREE.MeshBasicMaterial).color.setHex(c); }

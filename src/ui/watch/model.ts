// The watch in first person: your left forearm raised in front of your face,
// yellow jumpsuit sleeve shoved up, the BAILIFF band bolted through the wrist,
// and on it a chunky gunmetal wrist computer: hazard-striped housing, a
// recessed LCD, side keys, status LEDs, an antenna stub. Multi-tool modules
// bolt on as they are researched (torch lens, laser barrel, scanner dish,
// fabricator claw, battery cell).
//
// Device space: X runs along the forearm (elbow at -X, hand at +X), Y up,
// Z toward the eye. The screen sits at SCREEN (centre) facing +Z.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { atlas } from '../../gfx/atlas';

export const SCR_W = 224, SCR_H = 136;
/** metres per screen pixel (the LCD is 67 x 41 mm) */
export const SCR_PX = 0.0003;
export const SCREEN = { w: SCR_W * SCR_PX, h: SCR_H * SCR_PX, x: -0.03, y: 0.0, z: 0.0 };

const ARM_R = 0.031;
const TOP = ARM_R + 0.003;            // underside of the housing
const HOUSE = { w: 0.098, h: 0.064, d: 0.022 };
SCREEN.z = TOP + HOUSE.d + 0.0012;

let texReady = false;
function textures() {
  if (texReady) return;
  texReady = true;
  const A = atlas();
  A.add('wt_case', 16, 16, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.12 ? 0x2a2f35 : n < 0.3 ? 0x3d444b : 0x343a41); });
    for (let i = 0; i < 6; i++) { const x = rng.int(0, 15), y = rng.int(0, 15); for (let k = 0; k < 4; k++) pc.blend(x + k, y + (k >> 1), 0x8a939b, 0.6); }
    pc.hline(0, 15, 0, 0x5a636b); pc.hline(0, 15, 15, 0x1d2126);
  });
  A.add('wt_face', 32, 20, (pc, rng) => {
    pc.fill(0x1b1f24);
    pc.each((x, y) => { if (rng.next() < 0.1) pc.set(x, y, 0x252a30); });
    pc.strokeRect(0, 0, 32, 20, 0x4d555d);
    for (const [x, y] of [[1, 1], [30, 1], [1, 18], [30, 18]]) pc.set(x, y, 0xa8b0b8);
    pc.hline(3, 9, 18, 0xe2b42a); pc.hline(22, 28, 18, 0x2fa6b8);
  });
  A.add('wt_haz', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, ((x + y) >> 1) % 2 ? 0xe2b42a : 0x17150f)); });
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
  A.add('wt_rubber', 8, 8, (pc, rng) => { pc.each((x, y) => pc.set(x, y, rng.next() < 0.2 ? 0x1a1c1e : 0x232629)); });
  A.add('wt_lens', 4, 4, (pc) => { pc.fill(0xffffff); pc.set(0, 0, 0xd0d0d0); pc.set(3, 3, 0xb0b0b0); });
}

export interface WatchModel {
  root: THREE.Group;
  arm: THREE.Mesh;
  hand: THREE.Mesh;
  stump: THREE.Mesh;
  screen: THREE.Mesh;
  leds: { power: THREE.Mesh; alert: THREE.Mesh; signal: THREE.Mesh };
  mods: { torch: THREE.Object3D; laser: THREE.Object3D; dish: THREE.Object3D; fab: THREE.Object3D; cell: THREE.Object3D };
  /** lens tips for beams, in device space */
  laserTip: THREE.Object3D;
  torchLens: THREE.Mesh;
  laserLens: THREE.Mesh;
  antenna: THREE.Object3D;
  rebuildArm(skin: number): void;
}

const ledMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
const scale = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

export function buildWatchModel(screenMat: THREE.Material): WatchModel {
  textures();
  // double-sided: the whole wrist is mirrored when the band has moved to the right arm
  const mat = worldMaterial({ noVis: true, noFog: true, noGrid: true, doubleSide: true });
  const root = new THREE.Group();

  // ---- forearm, sleeve, hand (rebuilt when the skin tone changes)
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
    mb.cylinder(0, -0.08, 0, ARM_R + 0.0035, 0.064, 10, { sides: 'wt_cuff', top: 'wt_case', bottom: 'wt_case' }, { fit: true });
    mb.pop();
    // ---- the wrist computer
    const H = HOUSE, cx = SCREEN.x;
    mb.box(cx, -H.h / 2, TOP + H.d / 2, H.w, H.h, H.d, { all: 'wt_case', south: 'wt_face' }, { fit: true });
    // chamfer rails and armour plates
    mb.box(cx, H.h / 2 - 0.002, TOP + H.d / 2, H.w - 0.01, 0.006, H.d - 0.004, 'wt_case', { fit: true, color: 0xb0b8c0 });
    mb.box(cx, -H.h / 2 - 0.004, TOP + H.d / 2, H.w - 0.01, 0.006, H.d - 0.004, 'wt_haz', { fit: true });
    mb.box(cx - H.w / 2 - 0.004, -0.024, TOP + H.d / 2, 0.008, 0.048, H.d - 0.006, 'wt_rubber', { fit: true });
    mb.box(cx + H.w / 2 + 0.004, -0.024, TOP + H.d / 2, 0.008, 0.048, H.d - 0.006, 'wt_rubber', { fit: true });
    // screen bezel (recessed)
    mb.box(cx, SCREEN.y - SCREEN.h / 2 - 0.003, TOP + H.d + 0.0003, SCREEN.w + 0.006, SCREEN.h + 0.006, 0.0012, 'wt_rubber', { fit: true });
    // side keys on the top rail
    for (let i = 0; i < 3; i++) mb.box(cx - 0.03 + i * 0.016, H.h / 2 + 0.003, TOP + H.d * 0.55, 0.01, 0.004, 0.008, 'metal_grey', { fit: true });
    // bolts through the forearm, with what came out around them
    for (const sy of [1, -1]) {
      const by = sy * (ARM_R + 0.002);
      mb.push().translate(cx - 0.036, by, 0).rotateX(Math.PI / 2 * sy);
      mb.cylinder(0, 0, 0, 0.006, 0.007, 6, 'metal_dark');
      mb.pop();
      mb.box(cx - 0.036, by - 0.007, 0.012, 0.016, 0.014, 0.003, 'wt_crust', { fit: true });
    }
    // armoured strap plates down the cuff
    mb.box(cx - H.w / 2 + 0.006, -ARM_R - 0.003, 0, 0.014, 0.006, ARM_R * 1.6, 'wt_case', { fit: true });
    mb.box(cx + H.w / 2 - 0.006, -ARM_R - 0.003, 0, 0.014, 0.006, ARM_R * 1.6, 'wt_case', { fit: true });
    return mb.build();
  };
  // hand: a loose fist, back of the hand toward the eye, knuckles, curled fingers, thumb on top
  const handGeo = (skin: number) => {
    const mb = new ModelBuilder();
    const hx = 0.014;
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
  sm.cylinder(0, 0.01, 0, ARM_R * 0.86, 0.016, 9, { sides: 'wt_rubber', top: 'wt_crust', bottom: 'wt_crust' }, { fit: true, color: 0xb8a890 });
  sm.pop();
  const stump = new THREE.Mesh(sm.build(), mat);
  stump.visible = false;
  root.add(arm, hand, stump);

  // ---- the LCD
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat);
  screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  root.add(screen);

  // ---- LEDs on the top-right of the face
  const ledGeo = new THREE.BoxGeometry(0.0035, 0.0028, 0.0016);
  const led = (x: number) => { const m = new THREE.Mesh(ledGeo, ledMat(0x101010)); m.position.set(SCREEN.x + SCREEN.w / 2 - x, SCREEN.y + SCREEN.h / 2 + 0.0048, TOP + HOUSE.d + 0.0008); root.add(m); return m; };
  const leds = { power: led(0.003), alert: led(0.009), signal: led(0.015) };

  // ---- antenna stub (the radar dish spins on it later)
  const am = new ModelBuilder();
  am.cylinder(0, 0, 0, 0.0025, 0.022, 6, 'chrome');
  am.sphere(0, 0.023, 0, 0.0035, 6, 4, 'metal_dark');
  const antenna = new THREE.Mesh(am.build(), mat);
  antenna.position.set(SCREEN.x - HOUSE.w / 2 + 0.008, HOUSE.h / 2 + 0.002, TOP + HOUSE.d * 0.4);
  root.add(antenna);

  // ---- multi-tool modules
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x404040, side: THREE.DoubleSide });
  const laserLensMat = new THREE.MeshBasicMaterial({ color: 0x401010, side: THREE.DoubleSide });
  // torch: a lens block on the hand end of the housing, facing along +X
  const torch = new THREE.Group();
  { const mb = new ModelBuilder(); mb.box(0, -0.009, 0, 0.012, 0.018, 0.016, 'wt_case', { fit: true }); torch.add(new THREE.Mesh(mb.build(), mat)); }
  const torchLens = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.012, 0.011), lensMat);
  torchLens.position.set(0.0068, 0, 0); torch.add(torchLens);
  torch.position.set(SCREEN.x + HOUSE.w / 2 + 0.012, 0.012, TOP + HOUSE.d * 0.55);
  root.add(torch);
  // laser: a finned barrel along the bottom rail, red lens at the hand end
  const laser = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.push().rotateZ(-Math.PI / 2);
    mb.cylinder(0, -0.04, 0, 0.0065, 0.08, 8, 'metal_dark');
    for (let i = 0; i < 5; i++) mb.cylinder(0, -0.03 + i * 0.01, 0, 0.0095, 0.003, 8, 'chrome');
    mb.cylinder(0, 0.04, 0, 0.0075, 0.006, 8, 'wt_case', { rTop: 0.005 });
    mb.pop();
    mb.box(-0.02, 0.004, -0.004, 0.024, 0.008, 0.006, 'wt_haz', { fit: true });
    laser.add(new THREE.Mesh(mb.build(), mat));
  }
  const laserLens = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0015, 8).rotateZ(Math.PI / 2), laserLensMat);
  laserLens.position.set(0.0465, 0, 0); laser.add(laserLens);
  const laserTip = new THREE.Object3D(); laserTip.position.set(0.05, 0, 0); laser.add(laserTip);
  laser.position.set(SCREEN.x + 0.012, -HOUSE.h / 2 - 0.011, TOP + HOUSE.d * 0.45);
  root.add(laser);
  // scanner dish on the top rail
  const dish = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.cylinder(0, 0, 0, 0.003, 0.008, 6, 'metal_dark');
    mb.cylinder(0, 0.008, 0, 0.004, 0.004, 10, 'chrome', { rTop: 0.011 });
    dish.add(new THREE.Mesh(mb.build(), mat));
  }
  dish.position.set(SCREEN.x + 0.03, HOUSE.h / 2 + 0.004, TOP + HOUSE.d * 0.5);
  root.add(dish);
  // fabricator claw over the knuckles
  const fab = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.box(0, 0, 0, 0.03, 0.01, 0.012, 'wt_case', { fit: true });
    for (const s of [-1, 1]) { mb.push().translate(0.016, 0.005 + s * 0.006, 0.004).rotateZ(s * 0.5); mb.box(0.008, -0.002, 0, 0.018, 0.004, 0.006, 'chrome'); mb.pop(); }
    mb.box(-0.004, 0.01, 0.006, 0.006, 0.003, 0.003, 'wt_haz', { fit: true });
    fab.add(new THREE.Mesh(mb.build(), mat));
  }
  fab.position.set(SCREEN.x + HOUSE.w / 2 + 0.03, -0.024, TOP + 0.006);
  root.add(fab);
  // graphene cell strapped on the forearm behind the housing
  const cell = new THREE.Group();
  {
    const mb = new ModelBuilder();
    mb.box(0, -0.016, 0, 0.034, 0.032, 0.012, 'wt_case', { fit: true });
    mb.box(0, -0.012, 0.0062, 0.026, 0.006, 0.001, 'wt_haz', { fit: true });
    mb.box(0.013, 0.009, 0.0062, 0.004, 0.003, 0.001, 'wt_lens', { color: 0x7cff6a, emissive: 1 });
    cell.add(new THREE.Mesh(mb.build(), mat));
  }
  cell.position.set(SCREEN.x - HOUSE.w / 2 - 0.03, 0.0, TOP + 0.004);
  root.add(cell);

  for (const o of [torch, laser, dish, fab, cell]) o.visible = false;

  return {
    root, arm, hand, stump, screen, leds, antenna, laserTip, torchLens, laserLens,
    mods: { torch, laser, dish, fab, cell },
    rebuildArm(skin: number) { arm.geometry.dispose(); arm.geometry = armGeo(skin); hand.geometry.dispose(); hand.geometry = handGeo(skin); },
  };
}

export function setLed(m: THREE.Mesh, c: number) { (m.material as THREE.MeshBasicMaterial).color.setHex(c); }

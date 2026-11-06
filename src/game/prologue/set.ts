// The link suite at the Meridian Institute: a hand-built stage for the
// pre-menu prologue (./prologue.ts) and the run's handshake cinematic
// (src/game/intro.ts), drawn by the intake's own stage pass
// (src/game/introKit/stage.ts) out of the same faceted low-poly kit
// (src/game/introKit/poly.ts, props.ts, fixtures.ts) and lit by the same
// motivated lamps (src/game/introKit/lights.ts): cold twin tubes overhead,
// amber spill from the console lamps. Stage metres, the operator walks -z:
//
//   the operators' corridor  z  6 .. -6   two-tone institutional walls, a
//                                         trolley with your badge on it, a
//                                         notice board, the suite's sign, a
//                                         sliding door and its call panel
//   link suite 4             z -6 .. -13  two link chairs side by side facing
//                                         the door: the operator's rig (right,
//                                         a crown on a boom over the headrest)
//                                         and the unit's (left: the prisoner
//                                         in the hazmat suit, strapped down);
//                                         a cable bundle between the crowns, the
//                                         console with its CRTs along the right
//                                         wall, racks with lamps on the left
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { buildObjGeometry } from '../../world/objects';
import { WZ, addTextureModule, atlas, plate, screw, txtC } from '../../content/furniture/a_lib';
import { stageMat, emitMat, type EmitMat } from '../introKit/stageMat';
import { LightDirector, type Fixture } from '../introKit/lights';
import { tubeFixture, deskLamp, shaftGeo, cagedLamp } from '../introKit/fixtures';
import { pipeRun, cableTray, filingCabinet, swivelChair } from '../introKit/props';
import { cbox, lathe, rod, tube, sag, facetize, type V3 } from '../introKit/poly';
import { crtScreen, phosphorText, cssFont, type CrtScreen } from '../../gfx/crt';
import { HumanRig, randomAppearance, type Pose } from '../../entities/humanRig';
import { hazmatOutfit } from '../../entities/player';
import '../introKit/tex';

const SOLID = () => stageMat({ rim: 0.35 });

/** where things are on the stage */
export const LS = {
  cor: { x0: -1.5, x1: 1.5, z0: -6, z1: 6, h: 2.8 },
  room: { x0: -3.6, x1: 3.6, z0: -13, z1: -6, h: 3.3 },
  door: { x0: -0.75, x1: 0.75, h: 2.3 },
  /** where the operator starts, facing -z */
  start: [0, 5.0] as [number, number],
  /** the trolley with the badge (x, z) and the badge on it */
  trolley: [1.0, 0.6] as [number, number],
  badge: new THREE.Vector3(0.95, 0.93, 0.55),
  /** the door's call panel (on the right wall, by the door) */
  panel: new THREE.Vector3(1.47, 1.25, -5.35),
  /** the chairs: seat centres (x, z), facing +z (the operator's rig on the right as you come in, the unit's on the left) */
  rig: [1.0, -9.6] as [number, number],
  unit: [-1.0, -9.6] as [number, number],
  seatY: 0.62,
  /** the operator's eyes when strapped in, the unit's eyes */
  rigEye: new THREE.Vector3(1.0, 1.22, -9.78),
  unitEye: new THREE.Vector3(-1.0, 1.2, -9.74),
  /** the console where Dr. Calder works */
  console: [2.75, -9.0] as [number, number],
};

// ---- the suite's sign and the door panel's face
addTextureModule(() => {
  const A = atlas();
  A.add('ls_sign', 128, 32, (pc, rng) => {
    pc.wrap = false;
    plate(pc, 0, 0, 128, 32, 0x23303a, 5507, { noise: 0.1 });
    pc.strokeRect(0, 0, 128, 32, 0x0a0c0e);
    for (const [x, y] of [[4, 4], [122, 4], [4, 26], [122, 26]] as const) screw(pc, x, y, 0x8a9aa0, 0x141a1e, true);
    txtC(pc, 'MERIDIAN INSTITUTE', 64, 4, 0xe8e4d4);
    txtC(pc, 'LINK SUITE 4', 64, 11, 0x8fd8ff, 1, 2);
    txtC(pc, 'OPERATORS ONLY - NO UNITS UNSTRAPPED', 64, 23, 0xb8b4a4);
    for (let i = 0; i < 70; i++) { const x = rng.int(0, 127), y = rng.int(0, 31); if (rng.chance(0.15)) pc.blend(x, y, 0x8a8a7a, 0.3); }
  }, 2.0, 0.5);
  A.add('ls_panel', 16, 24, (pc) => {
    pc.wrap = false;
    plate(pc, 0, 0, 16, 24, 0x3a444c, 5508, { noise: 0.08 });
    pc.strokeRect(0, 0, 16, 24, 0x101418);
    pc.rect(3, 3, 10, 6, 0x0c1a12); pc.hline(4, 11, 5, 0x5ac888); pc.hline(4, 9, 7, 0x3a8858);
    pc.rect(5, 13, 6, 6, 0x101418);
  });
});

export class LinkSet {
  readonly root: THREE.Group;
  lights: LightDirector;
  fx: Record<string, Fixture> = {};
  /** the sliding door leaf (x slides), 0 shut .. 1 open */
  door!: THREE.Mesh; doorK = 0; doorGoal = 0;
  /** the operator rig's crown on its boom: 0 up .. 1 down on the head */
  crown!: THREE.Group; crownK = 0; crownGoal = 0;
  /** the cuffs on the operator's chair: 0 open .. 1 shut */
  cuffs: THREE.Mesh[] = []; cuffK = 0; cuffGoal = 0;
  badge!: THREE.Mesh;
  panelBtn!: THREE.Mesh; panelMat!: EmitMat;
  /** the unit in its chair, the operator's own body (shown once the operator is out of it) */
  unit: HumanRig;
  operator: HumanRig;
  screens: CrtScreen[] = [];
  /** 0..1: the handshake's progress on the console screens; 'idle' | 'link' | 'shock' | 'up' */
  linkK = 0; mode: 'idle' | 'link' | 'shock' | 'up' = 'idle';
  private rackLamps: { m: EmitMat; ph: number }[] = [];
  private t = 0;

  constructor(root: THREE.Group, private low = false, unitApp = randomAppearance(Math.random)) {
    this.root = root;
    this.lights = new LightDirector(root, low);
    this.build();
    // the unit: a prisoner of the Remittance Programme, strapped into the right-hand chair
    this.unit = new HumanRig(unitApp, stageMat({ rim: 1.1 }), { secondary: true });
    this.unit.setOutfit(hazmatOutfit({}));
    this.unit.root.position.set(LS.unit[0], 0, LS.unit[1]);
    root.add(this.unit.root);
    // the operator: you (seen from the unit's chair after the handshake)
    this.operator = new HumanRig({ ...randomAppearance(Math.random) }, stageMat({ rim: 1.1 }), { secondary: true });
    this.operator.setOutfit({ torso: { tex: 'c_shirt_button', color: 0x5a6a7a, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x2a2c34 }, legsKind: 'pants', feet: { tex: 'c_shoes_dress', color: 0x1e1a1a } });
    this.operator.root.position.set(LS.rig[0], 0, LS.rig[1]);
    this.operator.root.visible = false;
    root.add(this.operator.root);
    for (const r of [this.unit, this.operator]) r.root.traverse((o) => { o.castShadow = !low; });
  }

  private add(g: THREE.BufferGeometry, mat: THREE.Material = SOLID(), shadow = true) {
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.castShadow = shadow && !this.low; m.receiveShadow = !this.low;
    this.root.add(m);
    return m;
  }

  private build() {
    const shell = new ModelBuilder();
    shell.setFacets?.(false);
    const props = new ModelBuilder();
    const { cor, room, door } = LS;
    this.box(shell, cor.x0, cor.x1, cor.z0, cor.z1, cor.h, 'zp_wall_inst', 'ix_laminate', 'concrete', { n: [[door.x0 - 0.1, door.x1 + 0.1, cor.h]] }, 0xe4ded0, 0xa8a49c);
    this.box(shell, room.x0, room.x1, room.z0, room.z1, room.h, 'zp_wall_inst', 'ix_tread', 'concrete', { s: [[door.x0 - 0.1, door.x1 + 0.1, door.h]] }, 0xb8c4cc, 0x8a9096);
    // ---- the corridor: pilasters, skirting, beams, a pipe and a cable tray
    for (let z = cor.z1 - 0.8; z > cor.z0; z -= 2.4) {
      for (const s of [-1, 1]) cbox(props, s * (cor.x1 - 0.06), 0, z, 0.14, cor.h, 0.24, 0.02, 'ix_steel', { color: 0x8a948a });
      cbox(props, 0, cor.h - 0.16, z, cor.x1 - cor.x0, 0.16, 0.2, 0.02, 'ix_steel', { color: 0x7a827a });
    }
    for (const s of [-1, 1]) cbox(props, s * (cor.x1 - 0.02), 0, 0, 0.04, 0.12, cor.z1 - cor.z0, 0.01, 'ix_steel', { color: 0x3a403c });
    pipeRun(props, [[cor.x0 + 0.12, cor.h - 0.3, cor.z1 - 0.2], [cor.x0 + 0.12, cor.h - 0.3, cor.z0 + 0.3]], 0.05, 'ix_steel', { color: 0x9aa098 });
    cableTray(props, cor.x1 - 0.35, cor.h - 0.42, cor.z1 - 0.3, cor.z0 + 0.3, 7);
    // the end wall of the corridor behind you: a plain door
    cbox(props, 0, 0, cor.z1 - 0.05, 1.0, 2.2, 0.08, 0.015, 'metal_painted_green', { color: 0x6a7a80 });
    // the trolley with the badge tray
    const [tx, tz] = LS.trolley;
    props.push().translate(tx, 0, tz);
    for (const [x, z] of [[-0.24, -0.34], [0.24, -0.34], [-0.24, 0.34], [0.24, 0.34]]) { rod(props, [x, 0.08, z], [x, 0.88, z], 0.012, 5, 'chrome'); lathe(props, x, 0, z, [[0.035, 0], [0.04, 0.03], [0.035, 0.07]], 7, 'plastic_black'); }
    cbox(props, 0, 0.86, 0, 0.56, 0.035, 0.78, 0.008, 'ix_steel', { color: 0xb8c0c4 });
    cbox(props, 0, 0.32, 0, 0.56, 0.025, 0.78, 0.008, 'ix_steel', { color: 0x9aa4a8 });
    cbox(props, -0.05, 0.895, 0.05, 0.3, 0.02, 0.24, 0.004, 'ix_steel', { color: 0x6a7276 });
    cbox(props, 0.12, 0.895, -0.22, 0.18, 0.12, 0.14, 0.01, 'paper', { color: 0xe8e4d8 });
    cbox(props, -0.1, 0.34, 0.1, 0.36, 0.2, 0.3, 0.01, 'ix_counter', { color: 0x7a8a96 });
    props.pop();
    // the badge itself: its own mesh, so it can be lifted
    const bm = new ModelBuilder();
    cbox(bm, 0, 0, 0, 0.055, 0.006, 0.085, 0.002, 'paper', { color: 0xf2f0e8 });
    cbox(bm, 0, 0.006, 0.012, 0.04, 0.002, 0.03, 0.001, 'metal_brass', { color: 0x5a88b0 });
    rod(bm, [0, 0.004, -0.045], [-0.08, 0.004, -0.2], 0.004, 4, 'fabric_red', { color: 0x2a5a8a });
    rod(bm, [-0.08, 0.004, -0.2], [0.06, 0.004, -0.24], 0.004, 4, 'fabric_red', { color: 0x2a5a8a });
    this.badge = this.add(bm.build(), stageMat({ rim: 0.8 }), false);
    this.badge.position.copy(LS.badge);
    // the suite's sign over the door, the call panel beside it
    cbox(props, 0, door.h + 0.12, cor.z0 + 0.07, 1.6, 0.4, 0.04, 0.01, { south: 'ls_sign', all: 'metal_dark' }, { fit: true });
    cbox(props, LS.panel.x + 0.02, LS.panel.y - 0.15, LS.panel.z, 0.05, 0.3, 0.2, 0.01, { west: 'ls_panel', all: 'metal_dark' }, { fit: true });
    const btn = new ModelBuilder();
    cbox(btn, 0, -0.03, 0, 0.03, 0.06, 0.06, 0.006, 'ix_sodium', { color: 0xffffff });
    this.panelMat = emitMat(0x7aff9a, 1.6);
    this.panelBtn = this.add(btn.build(), this.panelMat, false);
    this.panelBtn.position.set(LS.panel.x - 0.01, LS.panel.y - 0.02, LS.panel.z);
    // the door: a steel frame and a sliding leaf
    for (const s of [-1, 1]) cbox(props, s * (door.x1 + 0.07), 0, cor.z0, 0.14, door.h, 0.3, 0.02, 'ix_steel');
    cbox(props, 0, door.h, cor.z0, door.x1 - door.x0 + 0.28, 0.16, 0.3, 0.02, 'ix_plate');
    props.box(0, 0.002, cor.z0 + 0.3, door.x1 - door.x0, 0.004, 0.12, 'ix_haz', { ao: false });
    const leaf = new ModelBuilder();
    cbox(leaf, 0, 0, 0, door.x1 - door.x0 + 0.04, door.h - 0.02, 0.06, 0.012, 'ix_plate', { color: 0x9aa8b0 });
    cbox(leaf, 0, 1.3, 0.035, 0.36, 0.5, 0.012, 0.004, 'glass_dark', { color: 0x6a8a9a });
    cbox(leaf, 0, 0.95, 0.035, door.x1 - door.x0 - 0.1, 0.06, 0.01, 0.003, 'ix_haz');
    this.door = this.add(leaf.build());
    this.door.position.set(0, 0, cor.z0);
    // ---- the suite: racks on the left wall, the console on the right
    for (let i = 0; i < 3; i++) {
      const z = -7.4 - i * 1.6;
      cbox(props, room.x0 + 0.35, 0, z, 0.6, 2.1, 0.9, 0.02, 'metal_dark', { color: 0x2a3036 });
      for (let r = 0; r < 6; r++) cbox(props, room.x0 + 0.66, 0.25 + r * 0.3, z, 0.02, 0.22, 0.8, 0.004, 'ix_grate', { color: 0x4a545c });
    }
    const rack = new ModelBuilder();
    for (let i = 0; i < 3; i++) for (let r = 0; r < 6; r++) for (let k = 0; k < 3; k++) cbox(rack, room.x0 + 0.68, 0.32 + r * 0.3, -7.4 - i * 1.6 - 0.3 + k * 0.08, 0.01, 0.02, 0.02, 0.002, 'ix_sodium', { color: 0xffffff });
    for (let n = 0; n < 3; n++) {
      const m = emitMat([0x7aff9a, 0xffb45a, 0x7ad0ff][n], 1.4);
      const g = new ModelBuilder();
      for (let i = 0; i < 3; i++) for (let r = n; r < 6; r += 3) cbox(g, room.x0 + 0.68, 0.32 + r * 0.3, -7.4 - i * 1.6 + 0.2 - n * 0.06, 0.01, 0.02, 0.02, 0.002, 'ix_sodium', { color: 0xffffff });
      this.add(g.build(), m, false);
      this.rackLamps.push({ m, ph: n * 1.7 });
    }
    void rack;
    // the console: a long desk with three CRTs, keyboards, the amber desk lamp
    const [cx, cz] = LS.console;
    cbox(props, room.x1 - 0.45, 0, cz - 0.4, 0.8, 0.82, 3.0, 0.02, 'ix_counter', { color: 0x6a7480 });
    cbox(props, room.x1 - 0.45, 0.82, cz - 0.4, 0.86, 0.04, 3.06, 0.01, 'ix_laminate', { color: 0xc8c4b8 });
    cbox(props, room.x1 - 0.2, 0.86, cz - 0.4, 0.3, 0.55, 3.0, 0.02, 'metal_dark', { color: 0x30363c });
    for (let i = 0; i < 3; i++) cbox(props, room.x1 - 0.62, 0.865, cz - 1.4 + i, 0.18, 0.02, 0.44, 0.004, 'plastic_black', { color: 0x3a3a3a });
    swivelChair(props, cx - 0.1, cz + 0.2, -Math.PI / 2 + 0.3);
    filingCabinet(props, room.x1 - 0.35, -12.4, -Math.PI / 2, 0x6a7468);
    const deskGlow = new ModelBuilder();
    const dl = deskLamp(props, room.x1 - 0.4, 0.86, cz + 0.8, Math.PI);
    this.fx.desk = this.lights.add({ name: 'desk', at: dl.at, col: 0xffb460, power: 3.2, range: 4.5, glowK: 2.2, circuit: 'desk', shaftK: 0, haloS: 0.35 }, dl.glow);
    void deskGlow;
    for (let i = 0; i < 3; i++) {
      const s = crtScreen(0.42, 0.32, { res: [160, 120] });
      s.mesh.position.set(room.x1 - 0.36, 1.18, cz - 1.4 + i);
      s.mesh.rotation.y = -Math.PI / 2;
      s.power(true, true);
      this.root.add(s.mesh);
      cbox(props, room.x1 - 0.22, 0.88, cz - 1.4 + i, 0.3, 0.5, 0.5, 0.03, 'plastic_black', { color: 0xc8c0b0 });
      this.screens.push(s);
    }
    // ---- the two chairs, the crown, the cuffs, the cable bundle
    this.chair(props, LS.rig[0], LS.rig[1], false);
    this.chair(props, LS.unit[0], LS.unit[1], true);
    // the cable bundle: from the unit's headrest crown, sagging across to the rig, and down to the floor duct
    const cab = new ModelBuilder();
    const ha: V3 = [LS.unit[0], 1.62, LS.unit[1] - 0.42], hb: V3 = [LS.rig[0], 1.62, LS.rig[1] - 0.42];
    for (let k = 0; k < 3; k++) tube(cab, sag([ha[0], ha[1] + k * 0.03, ha[2] - k * 0.03], [hb[0], hb[1] + k * 0.03, hb[2] - k * 0.03], 0.35 + k * 0.05, 10), 0.018, 5, 'ix_cable', { color: [0x2a2c30, 0x3a2420, 0x20303a][k] });
    tube(cab, [[0, 1.4, LS.rig[1] - 0.5], [0, 0.6, LS.rig[1] - 0.9], [0, 0.02, LS.rig[1] - 1.4], [1.8, 0.02, -12.6]], 0.03, 6, 'ix_cable', { color: 0x1e2022 });
    tube(cab, sag([room.x1 - 0.5, 0.86, cz - 1.6], [LS.rig[0], 0.4, LS.rig[1] - 0.6], 0.3, 10), 0.022, 5, 'ix_cable', { color: 0x2a2c30 });
    this.add(cab.build(), SOLID(), false);
    // the crown: a ring of electrodes on a boom over the operator's headrest (lowers onto the head)
    const crown = this.crown = new THREE.Group();
    crown.position.set(LS.rig[0], 2.15, LS.rig[1] - 0.3);
    const cm = new ModelBuilder();
    rod(cm, [0, 0.0, 0], [0, 0.65, -0.25], 0.025, 6, 'ix_steel');
    lathe(cm, 0, -0.06, 0, [[0.13, 0], [0.14, 0.02], [0.14, 0.05], [0.12, 0.07]], 10, 'ix_steel', { color: 0x9aa4ac, caps: false });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; rod(cm, [Math.cos(a) * 0.13, -0.04, Math.sin(a) * 0.13], [Math.cos(a) * 0.1, -0.11, Math.sin(a) * 0.1], 0.01, 4, 'chrome'); }
    crown.add(new THREE.Mesh(cm.build(), SOLID()));
    const cg = new ModelBuilder();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; cbox(cg, Math.cos(a) * 0.1, -0.125, Math.sin(a) * 0.1, 0.018, 0.018, 0.018, 0.004, 'ix_sodium', { color: 0xffffff }); }
    this.crownGlow = emitMat(0x8fe8ff, 0.6);
    crown.add(new THREE.Mesh(cg.build(), this.crownGlow));
    crown.traverse((o) => { o.frustumCulled = false; });
    this.root.add(crown);
    // floor paint round the chairs
    props.box(0, 0.003, LS.rig[1], 3.6, 0.004, 0.08, 'ix_haz', { ao: false });
    // objects from the world's own furniture library
    this.put('zp_notice', cor.x0 - WZ, -1.6, Math.PI / 2, { v: 1 }, stageMat({ alphaTest: 0.5, rim: 0.2 }));
    this.put('zp_crt_wall', cor.x0 - WZ, 2.8, Math.PI / 2);
    this.put('zp_crt_wall', room.x0 - WZ + 0.0, -11.8, Math.PI / 2);
    this.add(shell.build(), SOLID());
    this.add(facetize(props.build(), 0.005, 5), SOLID());
    this.buildLamps();
  }
  crownGlow!: EmitMat;

  /** a link chair: a pedestal, a reclined padded seat, the headrest, armrests with wrist cuffs */
  private chair(mb: ModelBuilder, x: number, z: number, unit: boolean) {
    mb.push().translate(x, 0, z);
    lathe(mb, 0, 0, 0, [[0.32, 0], [0.32, 0.04], [0.12, 0.08], [0.09, 0.42], [0.14, 0.5]], 10, 'ix_steel', { color: 0x5a646c });
    cbox(mb, 0, 0.5, 0.02, 0.56, 0.12, 0.56, 0.04, 'ix_rubber', { color: unit ? 0x3a2a26 : 0x2a3440 });
    mb.push().translate(0, 0.58, -0.26).rotateX(-0.22);
    cbox(mb, 0, 0, 0, 0.54, 0.95, 0.12, 0.04, 'ix_rubber', { color: unit ? 0x3a2a26 : 0x2a3440 });
    cbox(mb, 0, 0.98, 0.02, 0.3, 0.24, 0.14, 0.04, 'ix_rubber', { color: unit ? 0x3a2a26 : 0x2a3440 });
    cbox(mb, 0, 0, -0.08, 0.5, 1.1, 0.04, 0.01, 'ix_steel', { color: 0x5a646c });
    mb.pop();
    // the leg rest
    mb.push().translate(0, 0.5, 0.3).rotateX(0.55);
    cbox(mb, 0, -0.5, 0, 0.5, 0.5, 0.1, 0.03, 'ix_rubber', { color: unit ? 0x3a2a26 : 0x2a3440 });
    mb.pop();
    for (const s of [-1, 1]) {
      cbox(mb, s * 0.33, 0.68, 0.06, 0.1, 0.06, 0.52, 0.02, 'ix_rubber', { color: 0x22262a });
      rod(mb, [s * 0.33, 0.5, -0.1], [s * 0.33, 0.68, -0.1], 0.02, 5, 'ix_steel');
      rod(mb, [s * 0.33, 0.5, 0.2], [s * 0.33, 0.68, 0.2], 0.02, 5, 'ix_steel');
      // the unit's wrists are already strapped: dark webbing over the armrests
      if (unit) { cbox(mb, s * 0.33, 0.73, 0.14, 0.13, 0.04, 0.07, 0.01, 'ix_rubber', { color: 0x14161a }); cbox(mb, s * 0.33, 0.73, -0.06, 0.13, 0.04, 0.06, 0.01, 'ix_rubber', { color: 0x14161a }); }
    }
    // the unit: a strap over the chest and a heavier crown already down on its hood
    if (unit) {
      mb.push().translate(0, 0.58, -0.26).rotateX(-0.22);
      cbox(mb, 0, 0.55, 0.14, 0.5, 0.07, 0.03, 0.01, 'ix_rubber', { color: 0x14161a });
      mb.pop();
      rod(mb, [0, 1.62, -0.42], [0, 2.1, -0.6], 0.025, 6, 'ix_steel');
      lathe(mb, 0, 1.52, -0.36, [[0.14, 0], [0.15, 0.02], [0.15, 0.05], [0.13, 0.07]], 10, 'ix_steel', { color: 0x8a949c, caps: false });
    }
    mb.pop();
    if (!unit) {
      // the operator's cuffs: hinged steel loops that swing shut over the wrists
      for (const s of [-1, 1]) {
        const c = new ModelBuilder();
        cbox(c, 0, 0, 0, 0.12, 0.012, 0.07, 0.004, 'ix_steel', { color: 0xa8b0b6 });
        cbox(c, s * 0.055, -0.04, 0, 0.012, 0.05, 0.07, 0.004, 'ix_steel', { color: 0xa8b0b6 });
        const m = this.add(c.build(), SOLID(), false);
        m.position.set(x + s * 0.33 - s * 0.06, 0.78, z + 0.12);
        m.rotation.z = s * 1.3;
        m.userData.side = s;
        this.cuffs.push(m);
      }
    }
  }

  private put(key: string, x: number, z: number, rotY = 0, state: Record<string, unknown> = {}, mat: THREE.Material = SOLID(), y = 0) {
    const g = buildObjGeometry(key, state); if (!g) return null;
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = rotY; m.frustumCulled = false;
    m.castShadow = !this.low; m.receiveShadow = !this.low;
    this.root.add(m); return m;
  }

  private buildLamps() {
    const L = this.lights, { cor, room } = LS;
    const body = new ModelBuilder();
    const COLD = 0xc8ecff;
    [3.6, 0.8, -2.0, -4.6].forEach((z, i) => {
      const lamp = tubeFixture(body, 0, cor.h, z, { drop: 0.14 });
      const sh = new ModelBuilder();
      shaftGeo(sh, 0, cor.h - 0.26, z, 0.26, 1.15, 0.0, 1.5, 1.9);
      this.fx['tube' + i] = L.add({ name: 'tube' + i, at: lamp.at, col: COLD, power: 5.2, range: 6.5, glowK: 2.0, circuit: 'cor', temper: i === 2 ? 'failing' : 'steady', shaftK: 0.06, haloS: 0.5 }, lamp.glow, sh);
    });
    // the suite: two tubes over the chairs, a caged lamp by the racks
    [[-1.0, -8.6], [1.0, -8.6], [0, -11.6]].forEach(([x, z], i) => {
      const lamp = tubeFixture(body, x, room.h, z, { drop: 0.3, rotY: Math.PI / 2 });
      const sh = new ModelBuilder();
      shaftGeo(sh, x, room.h - 0.42, z, 1.15, 0.26, 0.0, 1.7, 1.4);
      this.fx['suite' + i] = L.add({ name: 'suite' + i, at: lamp.at, col: COLD, power: 5.8, range: 7, glowK: 2.0, circuit: 'suite', temper: 'steady', shaftK: 0.07, haloS: 0.5 }, lamp.glow, sh);
    });
    const cl = cagedLamp(body, room.x0 + 0.4, 2.4, -9.0, 0.3, 0x4e6a52);
    this.fx.cage = L.add({ name: 'cage', at: cl.at, col: 0xffc880, power: 2.0, range: 4, glowK: 1.8, circuit: 'suite', temper: 'steady', shaftK: 0, haloS: 0.3 }, cl.glow);
    this.add(facetize(body.build(), 0.004, 7), SOLID(), false);
  }

  /** a rectangular room from boxes (inner faces), openings per side: [x0, x1, h] on n (-z) / s (+z) */
  private box(mb: ModelBuilder, x0: number, x1: number, z0: number, z1: number, h: number, wall: string, floor: string, ceil: string,
    holes: { n?: [number, number, number][]; s?: [number, number, number][] } = {}, wallCol = 0xffffff, floorCol = 0xd0ccc4) {
    const T = 0.1;
    mb.box((x0 + x1) / 2, -T, (z0 + z1) / 2, x1 - x0, T, z1 - z0, { top: floor, all: 'metal_dark' }, { color: floorCol, skip: ['bottom', 'north', 'south', 'east', 'west'] });
    mb.box((x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0, T, z1 - z0, ceil, { color: 0x8a8a88, skip: ['top', 'north', 'south', 'east', 'west'] });
    for (const [x, face] of [[x0, 'west'], [x1, 'east']] as [number, 'west' | 'east'][]) {
      const sk = (['west', 'east', 'north', 'south', 'top', 'bottom'] as const).filter((f) => f !== (face === 'west' ? 'east' : 'west'));
      mb.box(face === 'west' ? x - T / 2 : x + T / 2, 0, (z0 + z1) / 2, T, h, z1 - z0, wall, { color: wallCol, skip: [...sk] });
    }
    const side = (z: number, face: 'south' | 'north', hs: [number, number, number][] = []) => {
      const skip = (['north', 'south', 'east', 'west', 'top', 'bottom'] as const).filter((f) => f !== face);
      const zz = face === 'south' ? z - T / 2 : z + T / 2;
      let x = x0;
      for (const [a, b, hh] of [...hs].sort((p, q) => p[0] - q[0])) {
        if (a > x) mb.box((x + a) / 2, 0, zz, a - x, h, T, wall, { color: wallCol, skip: [...skip] });
        if (hh < h) mb.box((a + b) / 2, hh, zz, b - a, h - hh, T, wall, { color: wallCol, skip: [...skip] });
        x = b;
      }
      if (x < x1) mb.box((x + x1) / 2, 0, zz, x1 - x, h, T, wall, { color: wallCol, skip: [...skip] });
    };
    side(z0, 'south', holes.n);
    side(z1, 'north', holes.s);
  }

  /** the unit slumped in its chair (and the operator, once you are out of your body) */
  static seated(t: number, slump = 1): Pose {
    const br = Math.sin(t * 1.6) * 0.02;
    return {
      bodyPitch: 0, bodyY: 0, rootY: -0.26, rootZ: -0.08,
      thighL: [-1.35, 0, 0.06], shinL: [1.25, 0, 0], footL: [0.1, 0, 0], thighR: [-1.35, 0, -0.06], shinR: [1.25, 0, 0], footR: [0.1, 0, 0],
      spine: [-0.18 + br, 0, 0], chest: [-0.06 + 0.1 * slump, 0, 0], neck: [0.25 * slump, 0, 0], head: [0.35 * slump, 0.25 * slump, 0.12 * slump],
      uarmL: [-0.15, 0, 0.18], farmL: [-1.35, 0, 0], handL: [0, 0, 0], uarmR: [-0.15, 0, -0.18], farmR: [-1.35, 0, 0], handR: [0, 0, 0],
      gripL: 0.3, gripR: 0.3,
    } as unknown as Pose;
  }

  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const ease = (k: number) => k * k * (3 - 2 * k);
    this.doorK += Math.sign(this.doorGoal - this.doorK) * Math.min(Math.abs(this.doorGoal - this.doorK), dt * 0.9);
    this.door.position.x = -ease(this.doorK) * (LS.door.x1 - LS.door.x0 + 0.1);
    this.crownK += Math.sign(this.crownGoal - this.crownK) * Math.min(Math.abs(this.crownGoal - this.crownK), dt * 0.45);
    this.crown.position.y = 2.15 - ease(this.crownK) * 0.66;
    this.crown.position.z = LS.rig[1] - 0.3 - ease(this.crownK) * 0.02;
    this.crownGlow.uniforms.uK.value = 0.4 + this.crownK * 1.6 + (this.mode === 'shock' ? 4 * Math.random() : 0);
    this.cuffK += Math.sign(this.cuffGoal - this.cuffK) * Math.min(Math.abs(this.cuffGoal - this.cuffK), dt * 3);
    for (const c of this.cuffs) c.rotation.z = (c.userData.side as number) * 1.3 * (1 - ease(this.cuffK));
    this.panelMat.uniforms.uK.value = 1.2 + Math.sin(this.t * 4) * 0.5;
    for (const r of this.rackLamps) r.m.uniforms.uK.value = Math.sin(this.t * 3 + r.ph) > 0.2 ? 1.6 : 0.3;
    this.unit.update(dt);
    this.unit.applyPose(LinkSet.seated(this.t, 1));
    if (this.operator.root.visible) { this.operator.update(dt); this.operator.applyPose(LinkSet.seated(this.t + 1, 1.2)); }
    this.lights.update(dt, cam);
    this.drawScreens();
  }

  private drawScreens() {
    const font = cssFont('--font-crt');
    this.screens.forEach((s, i) => {
      const x = s.ctx, W = s.canvas.width, H = s.canvas.height, t = this.t + i * 0.7;
      x.fillStyle = '#020806'; x.fillRect(0, 0, W, H);
      const C = this.mode === 'shock' ? '#ffffff' : '#8fe8ff';
      if (i === 0) {
        phosphorText(x, 'LINK 4', W / 2, 8, { size: 16, color: C, align: 'center', glow: 6, font });
        phosphorText(x, this.mode === 'up' ? 'BOUND' : this.mode === 'idle' ? 'STANDBY' : 'HANDSHAKE', W / 2, 30, { size: 12, color: '#c8f0ff', align: 'center', glow: 4, font });
        x.fillStyle = C; x.fillRect(14, 72, (W - 28) * this.linkK, 8);
        x.strokeStyle = '#3a7a8a'; x.strokeRect(13.5, 71.5, W - 27, 9);
        phosphorText(x, Math.round(this.linkK * 100) + '%', W / 2, 90, { size: 12, color: C, align: 'center', glow: 4, font });
      } else {
        // the two carriers: the rig's and the unit's, coming into phase as the handshake runs
        const ph = (1 - this.linkK) * 2.2;
        for (const [k, col] of [[0, '#ffb45a'], [1, '#8fe8ff']] as [number, string][]) {
          x.strokeStyle = col; x.lineWidth = 2; x.shadowColor = col; x.shadowBlur = 5; x.beginPath();
          for (let j = 0; j <= 40; j++) { const px = 8 + j * (W - 16) / 40, py = H / 2 + Math.sin(j * (0.4 + i * 0.1) + t * 5 + k * ph) * 22 * (this.mode === 'shock' ? Math.random() * 2 : 1); if (j) x.lineTo(px, py); else x.moveTo(px, py); }
          x.stroke();
        }
        x.shadowBlur = 0;
        phosphorText(x, i === 1 ? 'OPERATOR' : 'UNIT', 8, 6, { size: 11, color: '#7fb8d0', glow: 3, font });
      }
      s.flush();
    });
  }

  dispose() {
    this.unit.dispose(); this.operator.dispose();
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry?.dispose(); } });
    for (const s of this.screens) { s.tex.dispose(); (s.mat as THREE.Material).dispose(); }
    this.root.removeFromParent();
  }
}

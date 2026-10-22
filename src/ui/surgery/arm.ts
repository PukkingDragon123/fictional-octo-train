// The theatre's two floor-bolted industrial manipulators. Each is a faceted,
// riveted machine: an octagonal hazard-ringed foot, a yellow pedestal, a
// turret with a motor pack, a box-section upper arm with lightening cut-outs,
// a forearm on a tail lever, a wrist knuckle and a roll flange. Hydraulic
// rams ride every joint (body and chrome rod re-aimed each frame), hoses and
// braided cables sag between the links. The ORDERLY ends in a three-fingered
// gripper (three phalanges a finger, rubber pads, a work lamp and a camera
// eye); the SURGEON in a four-tool turret: bone saw, drill, welding torch and
// clamp, swung round with a clunk. Joints follow their IK targets through
// under-damped springs with a short anticipation pull-back, so the arms move
// with weight: they wind up, lunge, overshoot and settle.
import * as THREE from 'three';
import { Kit, cbox, tbox, prism, lathe, ccyl, ccylX, ccylZ, hexHead, gem, ngon, sawOutline, LiveHose, type P2 } from './geo';
import type { Mats } from './pix';

export type ToolName = 'saw' | 'drill' | 'weld' | 'clamp';
export type ArmKind = 'surgeon' | 'orderly';

const BASE_H = 0.56, SH_UP = 0.27, L1 = 0.92, L2 = 0.82, WR = 0.1;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

class Spring {
  x = 0; v = 0;
  constructor(public w: number, public z: number) {}
  step(target: number, dt: number, wrapped = false) {
    let d = target - this.x;
    if (wrapped) d = wrap(d);
    this.v += (d * this.w * this.w - 2 * this.z * this.w * this.v) * dt;
    this.x += this.v * dt;
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/** a hydraulic ram between two anchors: a painted barrel and a chrome rod that slide past each other */
class Ram {
  body = new THREE.Group(); rod = new THREE.Group();
  constructor(mats: Mats, private a: THREE.Object3D, private b: THREE.Object3D, r: number, len: number) {
    const k = new Kit();
    k.add(mats.gunmetal, ccyl(r, len * 0.82, 8, r * 0.25));
    k.put(mats.chrome, ccyl(r * 1.15, 0.025, 8), 0, len * 0.8, 0);
    k.put(mats.darksteel, cbox(r * 1.9, r * 1.6, r * 2.2), 0, 0, 0);
    k.put(mats.hazard, ccyl(r * 1.04, 0.05, 8, 0.004), 0, len * 0.55, 0);
    this.body.add(k.group());
    const kr = new Kit();
    kr.add(mats.chrome, ccyl(r * 0.5, len * 1.05, 6, r * 0.12));
    kr.put(mats.darksteel, cbox(r * 1.3, r * 1.4, r * 2), 0, 0, 0);
    this.rod.add(kr.group());
  }
  update() {
    this.a.getWorldPosition(_a); this.b.getWorldPosition(_b);
    _c.subVectors(_b, _a).normalize();
    this.body.position.copy(_a); this.body.quaternion.setFromUnitVectors(_Y, _c);
    this.rod.position.copy(_b); this.rod.quaternion.setFromUnitVectors(_Y, _c.negate());
  }
}

interface HoseSpec { hose: LiveHose; a: THREE.Object3D; b: THREE.Object3D; ax: THREE.Vector3; bx: THREE.Vector3; sag: number }

export class IndustrialArm {
  root = new THREE.Group();
  /** pistons and hoses live in world space (parented to this, kept at identity in the scene) */
  world = new THREE.Group();
  private yawG = new THREE.Group(); private shG = new THREE.Group(); private elG = new THREE.Group();
  private wrG = new THREE.Group(); private rollG = new THREE.Group();
  /** the tool end: tools / gripper hang here */
  tool = new THREE.Group();
  tip = new THREE.Object3D();
  /** the gripper's hold point (where carried things are attached) */
  hold = new THREE.Object3D();
  goal = new THREE.Vector3();
  pitch = -1.2; roll = 0;
  private pre: { until: number; p: THREE.Vector3 } | null = null;
  private sY = new Spring(5.2, 0.5); private sS = new Spring(5.8, 0.46); private sE = new Spring(6.6, 0.44); private sW = new Spring(8.5, 0.4); private sR = new Spring(7, 0.5);
  /** how hard the servos work right now (servo whine, status lamp) */
  effort = 0;
  t = 0;
  private rams: Ram[] = [];
  private hoses: HoseSpec[] = [];
  // gripper
  grip = 0; private sG = new Spring(13, 0.42);
  private fingers: { segs: THREE.Group[]; sign: number }[] = [];
  // tool turret
  toolSel: ToolName = 'saw';
  private turret = new THREE.Group(); private sT = new Spring(9, 0.32);
  private tools = new Map<ToolName, { g: THREE.Group; spin?: THREE.Group; tip: THREE.Object3D; jaws?: THREE.Group[] }>();
  spinRate = 0; private spinV = 0;
  clampOpen = 0;
  private lamp: THREE.MeshBasicMaterial; private lampCol: THREE.Color; private torch: THREE.MeshBasicMaterial | null = null;
  /** torch flame 0..1 */
  flame = 0;

  constructor(public kind: ArmKind, private mats: Mats, paint: THREE.MeshStandardMaterial) {
    const M = mats;
    this.lampCol = new THREE.Color(kind === 'surgeon' ? 0xff3020 : 0x40ff70);
    this.lamp = new THREE.MeshBasicMaterial({ color: this.lampCol.clone().multiplyScalar(2.2), toneMapped: false });
    // ---------------------------------------------------------------- foot and pedestal
    const base = new Kit();
    base.put(M.hazard, prism(ngon(8, 0.42, Math.PI / 8), 0.014), 0, 0.007, 0, { rx: -Math.PI / 2 });
    base.put(M.darksteel, prism(ngon(8, 0.36, Math.PI / 8), 0.04, 0.008), 0, 0.03, 0, { rx: -Math.PI / 2 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; base.put(M.steel, hexHead(0.022, 0.03), Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3); }
    base.add(paint, lathe([[0, 0.05], [0.28, 0.05], [0.28, 0.1], [0.21, 0.14], [0.185, 0.46], [0.235, 0.5], [0.235, BASE_H], [0, BASE_H]], 8, Math.PI / 8));
    base.put(M.vent, cbox(0.15, 0.18, 0.03, 0.006), 0, 0.3, 0.19, { rx: -0.08 });
    base.put(M.label, cbox(0.1, 0.05, 0.01, 0.003), 0, 0.43, 0.205);
    base.put(M.darksteel, cbox(0.2, 0.025, 0.2, 0.006), 0, 0.12, 0);
    this.root.add(base.group());
    // ---------------------------------------------------------------- turret
    this.yawG.position.y = BASE_H;
    this.root.add(this.yawG);
    const tu = new Kit();
    tu.add(M.gunmetal, ccyl(0.22, 0.1, 10, 0.02));
    for (const z of [-0.135, 0.135]) tu.put(paint, prism([[-0.17, 0], [0.15, 0], [0.13, 0.17], [0.05, 0.33], [-0.08, 0.33], [-0.18, 0.2]], 0.05, 0.008), 0, 0.08, z);
    tu.put(M.gunmetal, cbox(0.17, 0.18, 0.22, 0.02), -0.21, 0.2, 0);
    for (let i = 0; i < 5; i++) tu.put(M.darksteel, cbox(0.03, 0.012, 0.24, 0.003), -0.29, 0.13 + i * 0.035, 0);
    tu.put(M.label, cbox(0.006, 0.06, 0.1, 0.002), -0.302, 0.25, 0);
    tu.put(this.lamp, cbox(0.03, 0.018, 0.03, 0.006), -0.16, 0.3, 0.1);
    tu.put(M.hazard, ccyl(0.225, 0.03, 10, 0.005), 0, 0.075, 0);
    this.yawG.add(tu.group());
    // ---------------------------------------------------------------- shoulder + upper arm
    this.shG.position.y = SH_UP;
    this.yawG.add(this.shG);
    const up = new Kit();
    up.add(M.darksteel, ccylZ(0.12, 0.31, 10, 0.02));
    for (const z of [-0.17, 0.17]) up.put(M.chrome, ccylZ(0.07, 0.03, 8, 0.008), 0, 0, z);
    const holes: P2[][] = [[[0.22, -0.035], [0.4, -0.03], [0.4, 0.035], [0.22, 0.045]], [[0.5, -0.028], [0.66, -0.026], [0.66, 0.03], [0.5, 0.034]]];
    up.add(paint, prism([[0.02, -0.12], [L1 * 0.5, -0.088], [L1, -0.068], [L1 + 0.02, 0], [L1, 0.07], [L1 * 0.5, 0.09], [0.06, 0.125], [-0.07, 0.08], [-0.08, -0.07]], 0.15, 0.012, holes));
    up.put(M.hazard, cbox(0.05, 0.152, 0.17, 0.008), L1 - 0.16, 0, 0);
    for (const z of [-0.082, 0.082]) up.put(M.darksteel, prism([[0.08, -0.06], [0.2, -0.07], [0.2, 0.08], [0.08, 0.09]], 0.008, 0.002), 0, 0, z);
    for (let i = 0; i < 6; i++) up.put(M.steel, hexHead(0.009, 0.01), 0.1 + i * 0.13, 0.1 - i * 0.005, 0, { rx: 0 });
    up.put(M.darksteel, cbox(0.5, 0.02, 0.04, 0.005), L1 * 0.5, 0.098, 0);
    this.shG.add(up.group());
    // ---------------------------------------------------------------- elbow + forearm
    this.elG.position.x = L1;
    this.shG.add(this.elG);
    const fo = new Kit();
    fo.add(M.darksteel, ccylZ(0.088, 0.24, 10, 0.016));
    for (const z of [-0.13, 0.13]) fo.put(M.chrome, ccylZ(0.05, 0.025, 8, 0.006), 0, 0, z);
    fo.add(paint, prism([[-0.14, -0.04], [0.02, -0.075], [L2 * 0.6, -0.055], [L2, -0.048], [L2 + 0.015, 0], [L2, 0.05], [L2 * 0.6, 0.062], [0.02, 0.085], [-0.13, 0.1], [-0.17, 0.04]], 0.11, 0.01, [[[0.2, -0.025], [0.42, -0.022], [0.42, 0.028], [0.2, 0.032]]]));
    fo.put(M.hazard, cbox(0.04, 0.115, 0.125, 0.006), L2 - 0.1, 0, 0);
    for (let i = 0; i < 5; i++) fo.put(M.darksteel, cbox(0.025, 0.03, 0.05, 0.005), 0.12 + i * 0.12, 0.072, 0);
    fo.put(M.label, cbox(0.12, 0.04, 0.004, 0.002), 0.52, 0.0, 0.058);
    this.elG.add(fo.group());
    // ---------------------------------------------------------------- wrist and roll flange
    this.wrG.position.x = L2;
    this.elG.add(this.wrG);
    const wr = new Kit();
    wr.add(M.gunmetal, cbox(0.13, 0.12, 0.14, 0.022));
    wr.add(M.chrome, ccylZ(0.06, 0.17, 8, 0.01));
    this.wrG.add(wr.group());
    this.rollG.position.x = 0.07;
    this.wrG.add(this.rollG);
    const fl = new Kit();
    fl.put(M.darksteel, ccylX(0.072, 0.05, 8, 0.01), 0.02, 0, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; fl.put(M.steel, hexHead(0.008, 0.012), 0.047, Math.cos(a) * 0.055, Math.sin(a) * 0.055, { rz: -Math.PI / 2 }); }
    this.rollG.add(fl.group());
    this.tool.position.x = 0.05;
    this.rollG.add(this.tool);
    this.tool.add(this.tip);
    if (kind === 'orderly') this.buildGripper(); else this.buildTurret();
    // ---------------------------------------------------------------- rams and hoses
    const anchor = (p: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); p.add(o); return o; };
    for (const z of [-0.105, 0.105]) this.rams.push(new Ram(M, anchor(this.yawG, -0.15, 0.06, z), anchor(this.shG, 0.42, -0.07, z), 0.03, 0.38));
    this.rams.push(new Ram(M, anchor(this.shG, 0.44, 0.105, 0), anchor(this.elG, -0.15, 0.09, 0), 0.026, 0.34));
    for (const r of this.rams) this.world.add(r.body, r.rod);
    const hose = (mat: THREE.Material, r: number, a: THREE.Object3D, b: THREE.Object3D, ax: THREE.Vector3, bx: THREE.Vector3, sag: number, ribs: number) => {
      const h = new LiveHose(mat, r, 5, 12, ribs);
      this.world.add(h.mesh);
      this.hoses.push({ hose: h, a, b, ax, bx, sag });
    };
    hose(M.rubber, 0.022, anchor(this.yawG, -0.24, 0.3, 0.07), anchor(this.shG, 0.36, 0.1, 0.085), new THREE.Vector3(-0.2, 0.25, 0.05), new THREE.Vector3(0, 0.15, 0.05), 0.1, 18);
    hose(M.cable, 0.013, anchor(this.shG, 0.74, 0.08, -0.085), anchor(this.elG, 0.18, 0.07, -0.07), new THREE.Vector3(0.1, 0.1, -0.05), new THREE.Vector3(-0.1, 0.12, -0.04), 0.07, 8);
    hose(M.yellowcable, 0.011, anchor(this.elG, 0.62, 0.05, 0.06), anchor(this.tool, 0.0, 0.06, 0.03), new THREE.Vector3(0.1, 0.08, 0.04), new THREE.Vector3(-0.08, 0.1, 0.02), 0.05, 8);
    hose(M.rubber, 0.016, anchor(this.root, -0.16, 0.25, -0.12), anchor(this.yawG, -0.2, 0.12, -0.11), new THREE.Vector3(-0.2, 0, -0.1), new THREE.Vector3(-0.1, -0.05, -0.05), 0.06, 10);
    this.sY.x = 0; this.sS.x = 0.9; this.sE.x = -1.6; this.sW.x = -0.6;
  }

  // ---------------------------------------------------------------- the gripper
  private buildGripper() {
    const M = this.mats;
    const palm = new Kit();
    palm.put(M.gunmetal, prism(ngon(6, 0.075, Math.PI / 6), 0.12, 0.012), 0.06, 0, 0, { ry: Math.PI / 2 });
    palm.put(M.darksteel, cbox(0.03, 0.12, 0.13, 0.008), 0.125, 0, 0);
    palm.put(M.yellow, cbox(0.07, 0.03, 0.09, 0.01), 0.06, 0.07, 0);
    palm.put(this.mats.glow(0xff2a20, 2.4), gem(0.012, 0.012, 0.012), 0.08, 0.02, 0.07);
    palm.put(M.chrome, ccylZ(0.02, 0.012, 6), 0.08, 0.02, 0.064);
    palm.put(this.mats.glow(0xfff0c8, 3), cbox(0.012, 0.03, 0.05, 0.004), 0.12, -0.06, 0);
    palm.put(M.darksteel, cbox(0.04, 0.02, 0.07, 0.006), 0.11, -0.065, 0);
    this.tool.add(palm.group());
    // two fingers on top, an opposed thumb below; each curls about z toward the palm axis
    const specs: [number, number, number][] = [[0.04, 0.042, 1], [0.04, -0.042, 1], [-0.045, 0, -1]];
    for (const [y, z, sign] of specs) {
      const segs: THREE.Group[] = [];
      let parent: THREE.Object3D = this.tool;
      const lens = [0.07, 0.055, 0.045];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        if (i === 0) g.position.set(0.14, y, z); else g.position.x = lens[i - 1];
        const k = new Kit();
        const L = lens[i], w = 0.034 - i * 0.005;
        k.push().at(L / 2, 0, 0).rz(-Math.PI / 2).add(i === 2 ? M.darksteel : M.yellow, tbox(w, L * 0.98, w * 0.9, w * 0.72, w * 0.68, 0.005)).pop();
        k.put(M.steel, ccylZ(0.014 - i * 0.002, w * 1.15, 6, 0.003), 0, 0, 0);
        k.put(M.rubber, cbox(L * 0.7, 0.008, w * 0.7, 0.003), L * 0.5, -sign * (w * 0.42), 0);
        if (i === 0) k.put(M.chrome, ccylX(0.004, L * 0.8, 5), L * 0.5, sign * (w * 0.5 + 0.004), 0);
        if (i === 2) k.put(M.darksteel, tbox(w * 0.7, 0.02, w * 0.6, w * 0.3, w * 0.3, 0.003), L + 0.008, 0, 0, { rz: -Math.PI / 2 });
        g.add(k.group());
        parent.add(g);
        segs.push(g);
        parent = g;
      }
      this.fingers.push({ segs, sign });
    }
    this.hold.position.set(0.2, 0, 0);
    this.tool.add(this.hold);
    this.tip.position.set(0.24, 0, 0);
  }

  // ---------------------------------------------------------------- the surgeon's tool turret
  private buildTurret() {
    const M = this.mats;
    this.turret.position.x = 0.1;
    this.tool.add(this.turret);
    const hub = new Kit();
    hub.put(M.gunmetal, cbox(0.08, 0.05, 0.08, 0.012), -0.05, 0, 0);
    hub.add(M.darksteel, prism(ngon(8, 0.085, Math.PI / 8), 0.09, 0.01), {});
    hub.put(M.yellow, prism(ngon(8, 0.06, Math.PI / 8), 0.1, 0.006), 0, 0, 0);
    hub.put(M.hazard, ccylZ(0.04, 0.104, 8, 0.004), 0, 0, 0);
    // the hub turns about the tool's z (the turret axis), tools stick out radially
    this.turret.add(hub.group());
    const mount = (name: ToolName, ang: number, build: (k: Kit, g: THREE.Group) => { spin?: THREE.Group; tip: number; jaws?: THREE.Group[] }) => {
      const g = new THREE.Group();
      g.rotation.z = ang;
      const k = new Kit();
      k.put(M.darksteel, cbox(0.05, 0.05, 0.06, 0.01), 0.09, 0, 0);
      const r = build(k, g);
      g.add(k.group());
      const tip = new THREE.Object3D(); tip.position.x = r.tip; g.add(tip);
      this.turret.add(g);
      this.tools.set(name, { g, spin: r.spin, tip, jaws: r.jaws });
    };
    mount('saw', 0, (k, g) => {
      k.put(M.gunmetal, cbox(0.1, 0.045, 0.045, 0.01), 0.16, 0, 0);
      k.put(M.yellow, cbox(0.06, 0.06, 0.07, 0.01), 0.14, 0, 0);
      // the guard: a hazard-striped half shroud over the back of the blade
      const arc: P2[] = [];
      for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.45 + (i / 8) * Math.PI * 1.1; arc.push([Math.cos(a) * 0.112, Math.sin(a) * 0.112]); }
      for (let i = 8; i >= 0; i--) { const a = Math.PI * 0.45 + (i / 8) * Math.PI * 1.1; arc.push([Math.cos(a) * 0.072, Math.sin(a) * 0.072]); }
      k.put(M.hazard, prism(arc, 0.03, 0.004), 0.25, 0, 0);
      const spin = new THREE.Group(); spin.position.x = 0.25;
      const sk = new Kit();
      sk.add(M.steel, prism(sawOutline(20, 0.088, 0.104), 0.005), {});
      sk.add(M.chrome, prism(ngon(6, 0.03), 0.014, 0.003));
      sk.add(M.darksteel, prism(ngon(6, 0.012), 0.02));
      spin.add(sk.group());
      g.add(spin);
      return { spin, tip: 0.35 };
    });
    mount('drill', Math.PI / 2, (k, g) => {
      k.put(M.gunmetal, cbox(0.08, 0.05, 0.05, 0.01), 0.15, 0, 0);
      k.put(M.copper, ccylX(0.016, 0.06, 6), 0.15, 0.035, 0);
      const spin = new THREE.Group(); spin.position.x = 0.19;
      const sk = new Kit();
      sk.add(M.chrome, ccylX(0.024, 0.05, 6, 0.006, 0.016));
      for (let i = 0; i < 9; i++) sk.put(M.steel, cbox(0.016, 0.01, 0.022, 0.002), 0.035 + i * 0.012, 0, 0, { rx: i * 0.42 });
      sk.put(M.steel, tbox(0.012, 0.025, 0.012, 0.002, 0.002, 0.002), 0.155, 0, 0, { rz: -Math.PI / 2 });
      spin.add(sk.group());
      g.add(spin);
      return { spin, tip: 0.36 };
    });
    mount('weld', Math.PI, (k) => {
      k.put(M.gunmetal, cbox(0.07, 0.04, 0.04, 0.01), 0.15, 0, 0);
      k.push().at(0.19, 0, 0).rz(-0.35);
      k.put(M.copper, ccylX(0.016, 0.09, 8, 0.004, 0.011), 0.045, 0, 0);
      k.put(M.cream, ccylX(0.008, 0.02, 6, 0.002, 0.005), 0.1, 0, 0);
      k.pop();
      k.put(M.rubber, ccylX(0.01, 0.06, 5), 0.15, -0.03, 0.02);
      const tg = new THREE.Group();
      this.torch = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.8, 4), toneMapped: false });
      const fk = new Kit(); fk.add(this.torch, gem(0.01, 0.01, 0.01));
      const fm = fk.group(); fm.position.set(0.19 + Math.cos(-0.35) * 0.115, Math.sin(-0.35) * 0.115, 0); fm.visible = false;
      tg.add(fm); this.flameMesh = fm;
      return { tip: 0.31 };
    });
    mount('clamp', -Math.PI / 2, (k, g) => {
      k.put(M.gunmetal, cbox(0.06, 0.05, 0.04, 0.01), 0.15, 0, 0);
      const jaws: THREE.Group[] = [];
      for (const s of [-1, 1]) {
        const j = new THREE.Group(); j.position.set(0.18, 0, 0);
        const jk = new Kit();
        jk.add(M.steel, prism([[0, 0], [0.13, s * 0.01], [0.15, s * 0.004], [0.13, s * -0.004], [0.02, s * -0.012]].map(([x, y]) => [x, y + s * 0.012] as P2), 0.012, 0.002));
        j.add(jk.group());
        g.add(j); jaws.push(j);
      }
      return { tip: 0.33, jaws };
    });
    if (this.flameMesh) this.tools.get('weld')!.g.add(this.flameMesh.parent || this.flameMesh);
    this.setTool('saw', true);
  }
  private flameMesh: THREE.Object3D | null = null;

  /** swing the turret so a tool faces forward (the tool's tip becomes the IK tip) */
  setTool(name: ToolName, snap = false) {
    if (this.kind !== 'surgeon') return;
    this.toolSel = name;
    if (snap) { this.sT.x = this.turretAngle(); this.sT.v = 0; }
  }
  private turretAngle() { return -({ saw: 0, drill: Math.PI / 2, weld: Math.PI, clamp: -Math.PI / 2 }[this.toolSel]); }

  // ---------------------------------------------------------------- motion
  /** reach for a world point with the tool tip at `pitch` below the horizon; a short wind-up first */
  moveTo(p: THREE.Vector3, pitch = this.pitch, antic = 0.06) {
    this.tipWorld(_a);
    _b.subVectors(p, _a);
    const far = _b.length();
    if (antic > 0 && far > 0.12) this.pre = { until: this.t + 0.16, p: _a.clone().addScaledVector(_b.normalize(), -antic).add(new THREE.Vector3(0, antic * 0.7, 0)) };
    else this.pre = null;
    this.goal.copy(p);
    this.pitch = pitch;
  }
  /** jump straight to a pose (no motion) */
  snapTo(p: THREE.Vector3, pitch = this.pitch) {
    this.goal.copy(p); this.pitch = pitch; this.pre = null;
    const j = this.ik(p, pitch);
    this.sY.x = j[0]; this.sS.x = j[1]; this.sE.x = j[2]; this.sW.x = j[3];
    this.sY.v = this.sS.v = this.sE.v = this.sW.v = 0;
    this.apply();
  }
  get settled() { return Math.abs(this.sY.v) + Math.abs(this.sS.v) + Math.abs(this.sE.v) + Math.abs(this.sW.v) < 0.12 && !this.pre; }

  private reach() {
    if (this.kind === 'orderly') return 0.07 + 0.05 + this.tip.position.x;
    const tl = this.tools.get(this.toolSel)!;
    return 0.07 + 0.05 + 0.1 + tl.tip.position.x;
  }
  /** joint angles (yaw, shoulder, elbow, wrist) that put the tool tip on p */
  private ik(p: THREE.Vector3, pitch: number): [number, number, number, number] {
    this.root.updateWorldMatrix(true, false);
    const l = this.root.worldToLocal(_c.copy(p));
    const reach = this.reach();
    const yaw = Math.atan2(-l.z, l.x);
    const r = Math.hypot(l.x, l.z) - Math.cos(pitch) * reach;
    const y = l.y - Math.sin(pitch) * reach - BASE_H - SH_UP;
    const D = Math.min(L1 + L2 - 0.01, Math.max(Math.abs(L1 - L2) + 0.05, Math.hypot(r, y)));
    const c2 = (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    let a2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
    let a1 = Math.atan2(y, r) + Math.atan2(L2 * Math.sin(-a2), L1 + L2 * Math.cos(a2));
    a1 = Math.max(-0.5, Math.min(2.3, a1)); a2 = Math.max(-2.7, Math.min(0.3, a2));
    return [yaw, a1, a2, pitch - a1 - a2];
  }
  private apply() {
    this.yawG.rotation.y = this.sY.x;
    this.shG.rotation.z = this.sS.x;
    this.elG.rotation.z = this.sE.x;
    this.wrG.rotation.z = this.sW.x;
    this.rollG.rotation.x = this.sR.x;
  }
  update(dt: number) {
    this.t += dt;
    const target = this.pre && this.t < this.pre.until ? this.pre.p : this.goal;
    if (this.pre && this.t >= this.pre.until) this.pre = null;
    const j = this.ik(target, this.pitch);
    this.sY.step(j[0], dt, true); this.sS.step(j[1], dt); this.sE.step(j[2], dt); this.sW.step(j[3], dt); this.sR.step(this.roll, dt);
    this.apply();
    this.effort = Math.min(1, (Math.abs(this.sY.v) + Math.abs(this.sS.v) + Math.abs(this.sE.v) + Math.abs(this.sW.v) * 0.5) * 0.45);
    // gripper / turret / spinners
    if (this.kind === 'orderly') {
      this.sG.step(this.grip, dt);
      const g = this.sG.x;
      for (const f of this.fingers) {
        const open = f.sign > 0 ? [-0.5, -0.15, -0.05] : [-0.45, -0.1, -0.05];
        const shut = [0.75, 0.8, 0.65];
        f.segs.forEach((s, i) => { s.rotation.z = -f.sign * (open[i] + (shut[i] - open[i]) * g); });
      }
    } else {
      this.sT.step(this.turretAngle(), dt);
      this.turret.rotation.z = this.sT.x;
      this.spinV += (this.spinRate - this.spinV) * Math.min(1, dt * 3);
      const saw = this.tools.get('saw')!, drill = this.tools.get('drill')!;
      if (this.toolSel === 'saw') saw.spin!.rotation.z -= this.spinV * dt; else drill.spin!.rotation.x += this.spinV * dt * 1.6;
      for (const [i, j] of (this.tools.get('clamp')!.jaws || []).entries()) j.rotation.z = (i ? 1 : -1) * (0.05 + this.clampOpen * 0.35);
      if (this.flameMesh) { this.flameMesh.visible = this.flame > 0.05; const s = 0.6 + Math.random() * 0.8 * this.flame; this.flameMesh.scale.set(s * 1.8, s, s); }
    }
    this.lamp.color.copy(this.lampCol).multiplyScalar(this.effort > 0.15 && (this.t * 8) % 1 < 0.5 ? 0.8 : 2.2);
    this.root.updateMatrixWorld(true);
    for (const r of this.rams) r.update();
    for (const h of this.hoses) {
      h.a.getWorldPosition(_a); h.b.getWorldPosition(_b);
      const len = _a.distanceTo(_b);
      _c.copy(h.ax).applyQuaternion(h.a.parent!.getWorldQuaternion(_q)).add(_a);
      _d.copy(h.bx).applyQuaternion(h.b.parent!.getWorldQuaternion(_q)).add(_b);
      _c.y -= h.sag * len; _d.y -= h.sag * len;
      h.hose.set(_a, _c, _d, _b);
    }
  }
  /** the active tool tip in the world */
  tipWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    if (this.kind === 'surgeon') return this.tools.get(this.toolSel)!.tip.getWorldPosition(out);
    return this.tip.getWorldPosition(out);
  }
  holdWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.hold.getWorldPosition(out); }
  dispose() { for (const h of this.hoses) h.hose.dispose(); }
}

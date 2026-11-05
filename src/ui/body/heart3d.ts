// The heart on the life-support rig (it replaces the IV blood bag): a real
// anatomical heart, faceted low-poly in wet muscle red with the coronary
// vessels in their yellow fat, the aorta arching over the top, the pulmonary
// trunk and the vena cava, fused with machinery: two brass clamp bands bolted
// round the ventricles, a V-pair of steel piston cylinders on its shoulder, a
// glass sight-tube of blood (the level is your health), an octagonal pressure
// gauge, and the aorta coupled through a brass valve into the rig's pipe.
//
// It beats on the shared heartbeat (heartEngine.ts: the survivor's pulse,
// quicker with exertion, fear and low health; stutters after a blow, skips and
// doubles when weak). Every stroke squeezes the muscle, kicks the pistons, jumps
// the gauge needle and the blood in the tube; how hard it pumps is your health.
// Wounds are punctures in the muscle that spurt on every beat (bandaged ones
// get a patch); damage opens cracks across the front.
//
// Space: the root sits on the console's top face (y = 0), the heart centred at x = 0.
import * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { Injury } from '../../survival/body';
import type { BodyStage, Cubes } from './stage';
import { PrintTex } from './stage';
import { Mold, M, STEEL, BRASS, CHROME, RUBBER, PLASTIC, GLASS, R90, solidMesh, fcyl, fbox, fring, ball } from './models';
import { frod } from '../touch/facet';
import { hash, mix } from './pix';
import type { HeartEngine } from './heartEngine';

/** the muscle's centre (root space) */
const HY = 19;
/** the sight-tube: x, bottom, top */
const TX = -15.5, T0 = 4, T1 = 24;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ph = (x: number, y: number, z: number, s: number) => { const v = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(y * 97) * 78.233 + Math.round(z * 97) * 37.719 + s) * 43758.5453; return v - Math.floor(v); };

/** the muscle: an icosphere pushed into a heart (broad base, apex down and to the viewer's right, two atria) */
function muscleGeo(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const down = Math.max(0, -y);
    const taper = 1 - down * 0.52;
    const bump = (cx: number, cy: number, cz: number, r: number, k: number) => { const d = Math.hypot(x - cx, y - cy, z - cz); return d < r ? (1 - d / r) ** 2 * k : 0; };
    const b = bump(-0.72, 0.5, 0.15, 0.85, 0.32) + bump(0.62, 0.62, -0.35, 0.7, 0.22) + bump(0.35, -0.2, 0.6, 0.8, 0.08);
    const j = (ph(x, y, z, 3) - 0.5) * 0.05;
    const k = 1 + b + j;
    P.setXYZ(i, x * taper * 11.2 * k + down * 4.6, y * 13 * k - down * 1.2, z * (0.86 + 0.14 * taper) * 8.6 * k);
  }
  return g;
}
/** muscle colour: deep red, darker atria, the interventricular groove in fat with its artery, a fat cap at the base */
function muscleCol(x: number, y: number, z: number): number {
  const n = hash(Math.round(x * 2), Math.round(y * 2), Math.round(z * 2));
  let c = n > 0.7 ? 0xa8262c : n < 0.25 ? 0x7a161c : 0x92202a;
  const ly = y - HY;
  if (ly > 6) c = mix(c, 0x5e1a2e, clamp((ly - 6) / 5, 0, 0.8));
  // the groove from the base down to the apex, on the front
  const t = clamp((HY + 9 - y) / 22, 0, 1);
  const gx = 0.8 + t * 6.2 - Math.sin(t * 3) * 1.2;
  const d = Math.abs(x - gx);
  if (z > 1 && t > 0 && t < 1) { if (d < 0.7) c = 0xb03838; else if (d < 2) c = mix(0xd2ac64, c, d / 2 * 0.4); }
  // a branch of artery across the left ventricle
  const d2 = Math.abs(y - (HY + 2 - (x - 2) * 0.55));
  if (z > 2 && x > 2 && x < 10 && d2 < 0.55) c = 0xb83c3c;
  if (ly > 9) c = mix(c, 0xd0b070, clamp((ly - 9) / 3, 0, 0.75));
  return c;
}

interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; on: boolean; splash: number }

export class Heart3D {
  readonly root = new THREE.Group();
  /** the part that beats */
  private beatG = new THREE.Group();
  readonly hit: THREE.Mesh;
  private muscleMat: THREE.ShaderMaterial;
  private rods: { g: THREE.Group; ax: THREE.Vector3 }[] = [];
  private needle = new THREE.Group();
  private gauge: PrintTex;
  private fluid: THREE.Mesh; private fluidMat: THREE.ShaderMaterial;
  private holes: { mesh: THREE.Mesh; patch: THREE.Mesh; inj: Injury | null; p: THREE.Vector3 }[] = [];
  private cracks: { mesh: THREE.Mesh; th: number }[] = [];
  private drops: Drop[] = [];
  private puddle: THREE.Mesh; private puddleK = 0;
  private lastAge = 9;
  private ang = 0; private angV = 0; private t = 0;
  private level = 1; private levelV = 0;
  /** where the heart sits: the console top in root space */
  floorY = 0.6;
  hover: Injury | null = null;
  injuries: Injury[] = [];
  private v = new THREE.Vector3();

  constructor(private st: BodyStage) {
    const r = this.root;
    r.add(this.beatG);
    this.beatG.position.set(0, HY, 0);
    // ---- the cradle: a stepped steel octagon, a brass collar, three prongs up to the apex
    const base = new Mold()
      .add(fcyl(8.5, 1.8, 8, 9.2, 0.25), M(2, 0.9, 0), (_x, y) => (y > 1.4 ? 0x9aa2aa : 0x5a6066), STEEL)
      .add(fcyl(6, 1.2, 8, 6.6, 0.25), M(2, 2.4, 0), 0xc0902e, BRASS);
    for (const a of [-0.9, 0.2, 1.3]) base.add(fbox(1, 6.5, 1, 0.3), M(2 + Math.sin(a) * 5, 5, Math.cos(a) * 3.5, 0, 0, -Math.sin(a) * 0.35), 0xb08a3a, BRASS);
    // ---- the sight-tube of blood on the left, in brass caps, piped to the vena cava
    base.add(fcyl(2.6, 1.6, 8, 2.8, 0.3), M(TX, T0 - 0.6, 0), 0xc89a3a, BRASS)
      .add(fcyl(2.6, 1.6, 8, 2.8, 0.3), M(TX, T1 + 0.6, 0), 0xc89a3a, BRASS)
      .add(fbox(1.4, 1.4, 1.4, 0.3), M(TX, T0 - 2, 0), 0x6a6e72, STEEL)
      .add(frod([TX, T1 + 1.4, 0], [TX, T1 + 4, 0], 0.7, 6), null, 0x9aa2aa, STEEL)
      .add(frod([TX, T1 + 4, 0], [-8.5, T1 + 4, -1], 0.7, 6), null, 0x9aa2aa, STEEL)
      .add(fbox(5, 1, 1.2, 0.3), M(TX + 2.6, (T0 + T1) / 2, -0.8), 0x6a6e72, STEEL);
    // ---- the gauge bracket and bezel: an octagon on the lower left of the cradle
    const gx = -8.5, gy = 8.5, gz = 7;
    base.add(fbox(1.2, 5, 1.2, 0.3), M(gx + 1, gy - 4, gz - 2), 0x6a6e72, STEEL)
      .add(fcyl(4, 1.4, 8, 4.3, 0.3), M(gx, gy, gz, R90, 0, Math.PI / 8), (_x, _y, _z, _nx, ny) => (ny > 0.3 ? 0xf0c860 : 0xb08a3a), BRASS);
    r.add(solidMesh(st, base, { wear: 0.6 }));
    // gauge face: a cream octagon with ticks and a red low zone
    this.gauge = new PrintTex(24, 24, 1);
    this.paintGauge();
    const face = new THREE.Mesh(new Mold().add(new THREE.CircleGeometry(3.3, 8, Math.PI / 8), M(gx, gy, gz + 0.75), 0xffffff, PLASTIC).build(), st.solid({ map: this.gauge.tex, wear: 0.2 }));
    r.add(face);
    this.needle.position.set(gx, gy - 0.4, gz + 0.95);
    this.needle.add(solidMesh(st, new Mold().add(fbox(0.45, 2.8, 0.2, 0.1), M(0, 1.4, 0), 0xc81818, PLASTIC).add(fcyl(0.55, 0.3, 6, 0.55, 0.2), M(0, 0, 0.1, R90), 0x1a1a1a, STEEL)));
    r.add(this.needle);
    // the blood in the tube (dynamic), then the glass
    this.fluidMat = st.surf('liquid', { alpha: 0.95, color: 0xb0222a, deep: 0x3a0408, depthWrite: true, glint: 0.4, thick: 0.06 });
    this.fluid = new THREE.Mesh(new Mold().add(fcyl(1.55, 1, 8, 1.55, 0), M(0, 0.5, 0), 0xffffff, PLASTIC).build(), this.fluidMat);
    this.fluid.position.set(TX, T0, 0); this.fluid.renderOrder = 1; r.add(this.fluid);
    const glass = new THREE.Mesh(new Mold().add(fcyl(2, T1 - T0, 8, 2, 0, true), M(TX, (T0 + T1) / 2, 0), 0xe8f4f4, GLASS).build(), st.surf('glass', { alpha: 0.06, color: 0xd8ece6 }));
    glass.renderOrder = 3; r.add(glass);

    // ---- the muscle (beats), its bands and pistons, the vessels
    const B = this.beatG;
    this.muscleMat = st.surf('rubber', { color: 0xffffff });
    const mus = new THREE.Mesh(new Mold().add(muscleGeo(), M(0, 0, 0, 0, 0, -0.18), (x, y, z) => muscleCol(x, y + HY, z), RUBBER).build(), this.muscleMat);
    B.add(mus);
    const mech = new Mold()
      // brass clamp bands round the ventricles, bolted at the front
      .add(fring(1, 0.07, 12, 4), new THREE.Matrix4().compose(new THREE.Vector3(1.2, 1.5, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(R90, 0, -0.18)), new THREE.Vector3(10.6, 10.6, 8)), (_x, _y, _z, _nx, ny) => (ny > 0.3 ? 0xf0c860 : 0xa87a2a), BRASS)
      .add(fring(1, 0.09, 12, 4), new THREE.Matrix4().compose(new THREE.Vector3(3.2, -5.5, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(R90, 0, -0.28)), new THREE.Vector3(7.8, 7.8, 6.4)), (_x, _y, _z, _nx, ny) => (ny > 0.3 ? 0xf0c860 : 0xa87a2a), BRASS);
    for (const [bx, by, bz] of [[1, 1.5, 8.2], [3.6, -5.6, 6.5]]) mech.add(fbox(2.2, 1.6, 1.4, 0.3), M(bx, by, bz), 0x8a9098, STEEL).add(fcyl(0.45, 1, 6, 0.5, 0.3), M(bx, by, bz + 0.9, R90), 0xd8dee4, CHROME);
    // the vessels: the aorta arching over to the right into a brass coupling, the pulmonary trunk, the vena cava
    const vessel = (pts: [number, number, number][], r0: number, r1: number, col: number) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const rr = r0 + (r1 - r0) * (i / (pts.length - 1));
        mech.add(frod(pts[i], pts[i + 1], rr, 7), null, (_x, y, _z, _nx, ny) => mix(col, 0xffffff, ny > 0.5 ? 0.18 : 0) + (y > 0 ? 0 : 0), RUBBER);
        mech.add(ball(rr * 1.02, 1), M(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]), col, RUBBER);
      }
    };
    vessel([[1.5, 8, 0], [2, 14, 0], [4.5, 18, -0.5], [8.5, 18.6, -1], [12, 15.6, -1]], 2.7, 2.2, 0xcc6466);
    vessel([[-1.5, 7.5, 3], [-3.4, 13, 3], [-6.4, 15.2, 2.2]], 2.2, 1.9, 0x8a5c80);
    vessel([[-7.6, 7, -1.5], [-8.4, 12, -1.5], [-8.5, 15.5, -1.2]], 2, 1.9, 0x5c6a9c);
    // couplings: brass on the aorta (with a little handwheel), steel clamps on the others
    mech.add(fcyl(2.8, 2.2, 8, 3, 0.3), M(12.6, 14, -1, 0, 0, 0.5), 0xc89a3a, BRASS)
      .add(fring(1.8, 0.35, 8, 4), M(14.6, 17.5, -1, R90, 0, 0), 0xa8281a, PLASTIC)
      .add(fcyl(0.35, 2.4, 6, 0.35, 0), M(13.8, 16.2, -1, 0, 0, 0.5), 0x8a9098, STEEL)
      .add(fcyl(2.4, 1.6, 8, 2.6, 0.3), M(-6.9, 15.8, 2.2, 0, 0, 0.9), 0x8a9098, STEEL)
      .add(fcyl(2.2, 1.6, 8, 2.4, 0.3), M(-8.5, 16.2, -1.2), 0x8a9098, STEEL)
      .add(fcyl(0.5, 0.6, 6, 0.5, 0.3), M(-8.5, 17.2, -1.2), 0xd8dee4, CHROME);
    // the piston cylinders: a V-pair on the right shoulder
    const cyls: [number, number, number, number][] = [[7.6, 7.5, 1.5, -0.55], [10.2, 2.2, 1.8, -1.05]];
    for (const [cx, cy, cz, a] of cyls) {
      const ax = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
      mech.add(fcyl(1.9, 5, 8, 2.1, 0.3), M(cx + ax.x * 2.5, cy + ax.y * 2.5, cz, 0, 0, a), (_x, _y, _z, nx) => (nx < -0.3 ? 0xc8d0d6 : 0x6a7278), STEEL)
        .add(fcyl(2.2, 0.8, 8, 2.2, 0.3), M(cx + ax.x * 5.1, cy + ax.y * 5.1, cz, 0, 0, a), 0x4a4e52, STEEL)
        .add(fcyl(2.2, 0.8, 8, 2.2, 0.3), M(cx + ax.x * 0.3, cy + ax.y * 0.3, cz, 0, 0, a), 0xb08a3a, BRASS);
      const g = new THREE.Group(); g.position.set(cx + ax.x * 5.4, cy + ax.y * 5.4, cz); g.rotation.z = a;
      g.add(solidMesh(st, new Mold().add(fcyl(0.6, 3, 6, 0.6, 0), M(0, 1.5, 0), 0xe0b450, BRASS).add(fcyl(1.3, 0.9, 8, 1.3, 0.3), M(0, 3.2, 0), 0xd8dee4, CHROME)));
      B.add(g);
      this.rods.push({ g, ax: new THREE.Vector3(0, g.position.y, 0) });
    }
    B.add(solidMesh(st, mech, { wear: 0.5 }));
    // the aorta's brass pipe down to the console pipe (fixed, not beating)
    r.add(solidMesh(st, new Mold()
      .add(frod([12.6 + 1.2, HY + 12.4, -1], [17.5, HY + 6, 1.2], 1.1, 6), null, 0xb08a3a, BRASS)
      .add(frod([17.5, HY + 6, 1.2], [17.5, 1.3, 2.5], 1.1, 6), null, 0xb08a3a, BRASS)
      .add(fcyl(1.7, 1.4, 8, 1.8, 0.3), M(17.5, HY + 6, 1.2), 0xd8aa4a, BRASS)));
    // cracks across the front (dark seams, deeper as health falls)
    const CR: [number, [number, number, number][]][] = [
      [70, [[-4, 5, 7.6], [-2.6, 2, 8.4], [-3.4, -1, 8.4], [-1.6, -4, 7.8]]],
      [48, [[5.5, 3, 7.2], [4, 0, 7.8], [5.2, -3, 7], [3.8, -6.5, 5.6]]],
      [28, [[-7, -1, 6.4], [-5.2, -3.5, 6.8], [-6, -6, 5.4], [-3.5, -8, 5]]],
    ];
    for (const [th, pts] of CR) {
      const m = new Mold();
      for (let i = 0; i < pts.length - 1; i++) m.add(frod(pts[i], pts[i + 1], 0.32, 4), null, 0x1a0408, RUBBER);
      const mesh = solidMesh(st, m); mesh.visible = false; B.add(mesh);
      this.cracks.push({ mesh, th });
    }
    // wound punctures and their patches (a pool)
    const holeGeo = new Mold().add(ball(1, 1), null, 0x2a0206, RUBBER).build();
    const patchGeo = new Mold().add(fbox(3.2, 2.6, 0.5, 0.3), null, (x) => (Math.abs(x) < 0.3 ? 0xc8b890 : 0xe8e0c8), PLASTIC).build();
    const holeMat = st.solid({ wear: 0 }), patchMat = st.solid({ wear: 0.3 });
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(holeGeo, holeMat), patch = new THREE.Mesh(patchGeo, patchMat);
      mesh.visible = patch.visible = false; B.add(mesh, patch);
      this.holes.push({ mesh, patch, inj: null, p: new THREE.Vector3() });
    }
    // the pick box
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(38, 40, 16), new THREE.MeshBasicMaterial());
    this.hit.position.set(0, 18, 0); this.hit.visible = false; r.add(this.hit);
    // the puddle on the console
    this.puddle = new THREE.Mesh(new Mold().add(fcyl(1, 0.4, 9, 1, 0), null, 0xffffff, PLASTIC).build(), st.surf('liquid', { alpha: 0.96, color: 0x9a1820, deep: 0x3a0408, glint: 0.3, thick: 0.1 }));
    this.puddle.position.set(4, this.floorY, 5); this.puddle.scale.set(0.01, 1, 0.01); r.add(this.puddle);
    for (let i = 0; i < 40; i++) this.drops.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, on: false, splash: 0 });
  }

  private paintGauge() {
    const P = this.gauge.pix, N = 24;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - 11.5, dy = y - 11.5;
      P.set(x, y, hash(x, y, 5) > 0.92 ? 0xd8ceb0 : 0xece2c4);
      const a = Math.atan2(dx, -dy), d = Math.hypot(dx, dy);
      // the scale: an arc of ticks from low (left) to high (right); the low end red
      if (d > 7.5 && d < 10 && Math.abs(a) < 2.2) {
        const tick = Math.abs(((a + 2.2) / 4.4 * 8) % 1 - 0.5) > 0.38;
        if (tick || d > 9.2) P.set(x, y, a < -1.1 ? 0xc81c14 : 0x1a1610);
      }
    }
    this.gauge.commit();
  }

  /** jolt it (a hit, a flick) */
  kick(dAng: number, _slosh = 0) { this.angV += dAng * 1.6; this.levelV += (Math.random() - 0.5) * 0.4; }

  /** once a frame: beat from the shared heart engine, wounds, leaks */
  update(dt: number, p: Player, eng: HeartEngine) {
    const b = p.body;
    this.t += dt;
    const hp = clamp(b.health / 100, 0, 1);
    const env = b.dead ? 0 : Math.min(1.2, eng.env());
    const str = 0.45 + 0.55 * hp;
    // squeeze: the ventricles pull in, the base drops a little
    const sq = env * 0.085 * str;
    this.beatG.scale.set(1 - sq, 1 - sq * 0.7, 1 - sq);
    this.beatG.position.y = HY - sq * 4;
    // a blow knocks it about; it rocks back on a spring
    this.angV += (-this.ang * 70 - this.angV * 6) * dt; this.ang += this.angV * dt;
    this.beatG.rotation.z = this.ang * 0.15 + Math.sin(this.t * 1.3) * 0.015;
    this.beatG.rotation.y = Math.sin(this.t * 0.7) * 0.08 + (eng.stutter > 0.3 ? Math.sin(this.t * 40) * 0.03 * eng.stutter : 0);
    // the pistons ride out on every stroke
    for (const r of this.rods) r.g.position.y = r.ax.y + env * (0.6 + 1.6 * hp);
    // the gauge reads the pressure; it sags with health and flickers when it stutters
    const pr = b.dead ? 0 : clamp(hp * 0.75 + env * 0.3 * str + (eng.stutter > 0.3 ? Math.sin(this.t * 31) * 0.12 : 0), 0, 1);
    this.needle.rotation.z += ((2.0 - pr * 4.0) - this.needle.rotation.z) * Math.min(1, dt * 14);
    // the tube: blood level is health, jumping on each stroke
    const want = Math.max(0.02, b.health / 100) + env * 0.025;
    this.levelV += ((want - this.level) * 90 - this.levelV * 9) * dt; this.level = clamp(this.level + this.levelV * dt, 0.01, 1.05);
    this.fluid.scale.set(1, (T1 - T0 - 0.6) * this.level, 1);
    const thin = clamp((100 - b.blood) / 70, 0, 1);
    (this.fluidMat.uniforms.uMul.value as THREE.Vector3).set(0.69 - thin * 0.25, 0.13 - thin * 0.06, 0.16 - thin * 0.06);
    this.fluidMat.uniforms.uSurf.value = T0 + (T1 - T0) * this.level;
    // the muscle greys when it stops; flushes a little when it pounds
    const mul = this.muscleMat.uniforms.uMul.value as THREE.Vector3;
    if (b.dead) mul.set(0.55, 0.5, 0.52); else mul.set(1 + env * 0.12, 1 + env * 0.04, 1 + env * 0.04);
    for (const c of this.cracks) c.mesh.visible = b.health < c.th;
    // wounds: one puncture per open wound, a patch when bandaged
    this.injuries = b.allInjuries().filter((i) => i.type !== 'bruise' && i.type !== 'fracture');
    for (let i = 0; i < this.holes.length; i++) {
      const h = this.holes[i], inj = this.injuries[i] ?? null;
      h.inj = inj;
      h.mesh.visible = !!inj && !inj.bandage; h.patch.visible = !!inj && !!inj.bandage;
      if (!inj) continue;
      this.holePos(inj, h.p);
      h.mesh.position.copy(h.p); h.patch.position.copy(h.p);
      const s = (this.hover === inj ? 1.5 : 1) * (0.6 + Math.min(1, inj.sev) * 0.6);
      h.mesh.scale.set(s, s, 0.5);
    }
    // a new stroke: bleeding wounds spurt
    if (eng.age < this.lastAge && !b.dead) {
      for (const h of this.holes) {
        if (!h.inj || h.inj.bandage) continue;
        const r = b.injuryBleed(h.inj);
        if (r < 0.01) continue;
        const n = Math.min(5, 1 + Math.round(r * 4 * str));
        for (let k = 0; k < n; k++) this.spurt(h.p, r);
      }
    }
    this.lastAge = eng.age;
    // drops fall to the console and pool
    const floor = this.floorY;
    for (const d of this.drops) if (d.on) {
      if (d.splash > 0) { d.splash -= dt; if (d.splash <= 0) d.on = false; continue; }
      d.vy -= 90 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y <= floor) { d.y = floor; d.splash = 0.25; this.puddleK = Math.min(1, this.puddleK + 0.03); }
    }
    this.puddleK = Math.max(0, this.puddleK - dt * 0.01);
    const pk = 0.01 + this.puddleK * 7;
    this.puddle.scale.set(pk, 1, pk * 0.6);
  }
  private spurt(local: THREE.Vector3, r: number) {
    this.v.copy(local); this.beatG.localToWorld(this.v); this.root.worldToLocal(this.v);
    for (const d of this.drops) if (!d.on) {
      d.on = true; d.splash = 0; d.x = this.v.x; d.y = this.v.y; d.z = this.v.z + 0.6;
      const k = 8 + r * 14;
      d.vx = (this.v.x / 10 + (Math.random() - 0.5) * 0.8) * k; d.vy = (0.3 + Math.random() * 0.6) * k; d.vz = (0.6 + Math.random() * 0.4) * k * 0.5;
      return;
    }
  }
  /** a wound's place on the front of the muscle (beat-group space) */
  private holePos(inj: Injury, out: THREE.Vector3) {
    const u = hash(inj.id, 7, 1) * 1.3 - 0.7, w = hash(inj.id, 3, 2) * 1.2 - 0.6;
    const z = Math.sqrt(Math.max(0.05, 1 - u * u - w * w));
    return out.set(u * 9 + Math.max(0, -w) * 3, w * 10, z * 8.2 + 0.4);
  }
  /** a wound's puncture in stage space */
  holeWorld(inj: Injury, out: THREE.Vector3): THREE.Vector3 { this.holePos(inj, out); return this.beatG.localToWorld(out); }
  /** the wound under a pick point (stage space), if any */
  holeUnder(point: THREE.Vector3): Injury | null {
    let best: Injury | null = null, bd = 4.5;
    for (const h of this.holes) {
      if (!h.inj) continue;
      this.v.copy(h.p); this.beatG.localToWorld(this.v);
      const d = Math.hypot(this.v.x - point.x, this.v.y - point.y);
      if (d < bd) { bd = d; best = h.inj; }
    }
    return best;
  }
  /** the blood drops: into the HUD's shared cube batch (in the rig's inner space) */
  cubes(C: Cubes) {
    for (const d of this.drops) if (d.on) {
      this.v.set(d.x, d.y, d.z); this.root.localToWorld(this.v); this.root.parent?.worldToLocal(this.v);
      C.put(this.v.x, this.v.y, this.v.z, d.splash > 0 ? 1.3 : 0.8, d.splash > 0 ? 0.5 : 1.4, 0.8, 0, d.splash > 0 ? 0x7a0a12 : 0xb01822);
    }
  }
}

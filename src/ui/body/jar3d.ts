// The stomach as a machine on the life-support rig: a digester. Food drops
// through a brass hopper (its flap hops when a bite goes in, rattles when you
// are full, is flung open when you throw up) into an octagonal glass chamber
// where a paddle shaft churns it in acid: the murk at the bottom is how fed
// you are, the acid over it rises when you are sick (it foams and turns
// bilious), bites tumble, bob and fizz away, bad food cracks the glass and acid
// weeps from the cracks. Beside it a sight-glass shows your water, and a hex
// gauge on the hopper how full you are; a green jewel lights when you are
// nauseous. The simulation is jar.ts (2D side-view coordinates, unchanged).
//
// Space: the root sits on the console's top face (y = 0), chamber centre x = 0.
import * as THREE from 'three';
import type { Jar } from './jar';
import type { Player } from '../../entities/player';
import { CX as SCX, BOT as SBOT, HW as SHW, IH as SIH } from './jar';
import type { BodyStage, Cubes } from './stage';
import { PrintTex, FONT, inkText } from './stage';
import { Mold, M, BRASS, PAPER, GLASS, STEEL, PAINT, PLASTIC, CHROME, R90, solidMesh, fcyl, fbox, fring } from './models';
import { face as polyFace, ngon, frod, flathe } from '../touch/facet';
import { mix, hash } from './pix';

/** chamber: glass radius, inner radius, fluid height, bottom of the fluid, glass from y = G0 to G1 */
const R = 9.6, RI = 8.8, IHT = 22.5, FLOOR = 4, G0 = 2.6, G1 = 27.4;
/** the hopper: neck radius at y = H0, mouth radius at y = H1 */
const H0 = 28, H1 = 36.5, HR0 = 4.2, HR1 = 9.4;
/** the water sight-glass, left of the chamber */
const WX = -R - 4.2, WR = 1.7, W0 = 3, W1 = 24;
const SIDES = 8, PH = Math.PI / SIDES;
const toX = (x: number) => ((x - SCX) / SHW) * RI;
const toY = (y: number) => FLOOR + ((SBOT - 1 - y) / SIH) * IHT;

/** a column whose top and bottom rings are moved every frame (fluids) */
class Column {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;
  constructor(r: number, mat: THREE.ShaderMaterial, sides = SIDES, ph = PH) {
    const geo = new Mold().add(new THREE.CylinderGeometry(r, r, 1, sides, 1, false, ph), null, 0xffffff, GLASS).build();
    this.base = (geo.getAttribute('position').array as Float32Array).slice();
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }
  set(bottom: number, top: number, tiltX: number, tiltZ: number) {
    const P = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const A = P.array as Float32Array, B = this.base;
    for (let i = 0; i < B.length; i += 3) A[i + 1] = B[i + 1] > 0 ? top + B[i] * tiltX + B[i + 2] * tiltZ : bottom;
    P.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.visible = top - bottom > 0.05;
  }
}

export class Jar3D {
  readonly root = new THREE.Group();
  readonly hit: THREE.Mesh;
  private body = new THREE.Group();
  private flapG = new THREE.Group();
  private shaft = new THREE.Group();
  private needle: THREE.Mesh;
  private murk: Column; private acid: Column; private water: Column;
  private murkMat: THREE.ShaderMaterial; private acidMat: THREE.ShaderMaterial;
  private nauseaMat: THREE.ShaderMaterial;
  private cracks = new PrintTex(96, 48, 1);
  private crackN = -1;
  private label = new PrintTex(40, 16, 1);
  private face = new PrintTex(16, 14, 1);
  private v = new THREE.Vector3();
  private tilt = 0; private tiltV = 0;
  private wob = 0; private wobV = 0;
  private spin = 0;
  private hydr = 1; private sick = 0;
  private t = 0;
  zoom = 0;

  constructor(private st: BodyStage) {
    const r = this.root;
    r.add(this.body);
    const b = this.body;
    // ---- the plinth: a stepped steel octagon with a bakelite motor drum under the shaft
    const base = new Mold()
      .add(fcyl(R + 1.8, G0, SIDES, R + 2.4, 0.2), M(0, G0 / 2, 0), (_x, y) => (y > G0 - 0.6 ? 0x8a9098 : 0x5a5e62), STEEL)
      .add(fcyl(R + 0.4, 0.8, SIDES, R + 0.4, 0.2), M(0, G0 + 0.2, 0), 0x2c1c12, PLASTIC)
      // the glass's top collar and the hopper: a brass funnel, its rim, the hinge block
      .add(fcyl(R + 0.9, 1.6, SIDES, R + 1.1, 0.25), M(0, G1 + 0.4, 0), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? 0xd8aa4a : 0xa87a2a), BRASS)
      .add(fcyl(HR1, H1 - H0, SIDES, HR0, 0, true), M(0, (H0 + H1) / 2, 0), (_x, _y, _z, nx, _ny, nz) => (nz > 0.3 ? 0xc89a3a : Math.abs(nx) > 0.5 ? 0x9a7428 : 0x5a4018), BRASS)
      .add(fring(HR1 + 0.1, 0.6, SIDES, 4), M(0, H1, 0, R90, 0, PH), 0xe0b450, BRASS)
      .add(fbox(6, 1.4, 1.6, 0.3), M(0, H1 + 0.4, -HR1 + 0.4), 0x6a5020, BRASS);
    // bolts round the collar
    for (let i = 0; i < SIDES; i++) { const a = PH + (i / SIDES) * Math.PI * 2; base.add(fcyl(0.55, 0.6, 6, 0.6, 0.3), M(Math.sin(a) * (R + 0.4), G1 + 1.4, Math.cos(a) * (R + 0.4)), 0x6a5020, STEEL); }
    // ---- the water sight-glass: brass caps, a bracket to the chamber, a feed pipe into the hopper
    base.add(fcyl(WR + 0.8, 1.6, 6, WR + 0.9, 0.3), M(WX, W0 - 0.6, 0), 0xc0902e, BRASS)
      .add(fcyl(WR + 0.8, 1.6, 6, WR + 0.9, 0.3), M(WX, W1 + 0.6, 0), 0xc0902e, BRASS)
      .add(fbox(4.6, 1, 1.2, 0.3), M(WX + 2.4, W0 + 8, -0.5), 0x6a6e72, STEEL)
      .add(fbox(4.6, 1, 1.2, 0.3), M(WX + 2.4, W1 - 4, -0.5), 0x6a6e72, STEEL)
      .add(frod([WX, W1 + 1.4, 0], [WX, H1 + 1.5, 0], 0.6, 6), null, 0x9aa2aa, STEEL)
      .add(frod([WX, H1 + 1.5, 0], [-HR1 + 1, H1 + 1.5, 0], 0.6, 6), null, 0x9aa2aa, STEEL)
      .add(fcyl(1, 1.2, 6, 1, 0.3), M(WX, H1 + 1.5, 0), 0xc0902e, BRASS);
    b.add(solidMesh(st, base, { wear: 0.6 }));
    // ---- glass: the back wall, the contents, the churning shaft, then the front wall with its cracks
    const back = new THREE.Mesh(new Mold().add(new THREE.CylinderGeometry(R, R, G1 - G0, SIDES, 1, true, Math.PI + PH, Math.PI * 2), M(0, (G0 + G1) / 2, 0), 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.05, color: 0xcfe2da, side: THREE.BackSide }));
    back.renderOrder = 1; b.add(back);
    this.murkMat = st.surf('liquid', { alpha: 0.97, color: 0x8a6a3a, deep: 0x2a1a0a, glint: 0.1, thick: 0.08, depthWrite: true });
    this.acidMat = st.surf('liquid', { alpha: 0.82, color: 0xc8f040, deep: 0x4a6a08, glint: 0.8, thick: 0.03 });
    this.murk = new Column(RI, this.murkMat); this.murk.mesh.renderOrder = 2; b.add(this.murk.mesh);
    this.acid = new Column(RI, this.acidMat); this.acid.mesh.renderOrder = 3; b.add(this.acid.mesh);
    // the paddle shaft: a steel spindle with three staggered blades and a hex hub (it turns as you digest)
    const sh = new Mold().add(frod([0, 0, 0], [0, IHT + 1, 0], 0.55, 6), null, 0x9aa2aa, STEEL);
    for (let i = 0; i < 3; i++) {
      const y = 3 + i * 6.5, a = i * 2.1;
      sh.add(fbox(RI * 1.5, 0.5, 2.2, 0.2), M(0, y, 0, 0.35, a, 0), 0x7a8288, STEEL);
      sh.add(fcyl(1, 1.4, 6, 1, 0.3), M(0, y, 0), 0x5a5e62, STEEL);
    }
    this.shaft.add(solidMesh(st, sh));
    this.shaft.position.y = FLOOR - 0.6;
    this.shaft.renderOrder = 2;
    b.add(this.shaft);
    const front = new THREE.Mesh(new Mold().add(new THREE.CylinderGeometry(R, R, G1 - G0, SIDES, 1, true, Math.PI + PH, Math.PI * 2), M(0, (G0 + G1) / 2, 0), 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.05, color: 0xdcece6, side: THREE.FrontSide, map: this.cracks.tex }));
    front.renderOrder = 6; b.add(front);
    // the paper label, pasted flat across the three front facets
    const lab = new THREE.Mesh(new Mold().add(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 6, 3, 1, true, -3 * PH, 6 * PH), M(0, G1 - 4, 0), 0xffffff, PAPER).build(), st.solid({ map: this.label.tex, wear: 0.3 }));
    lab.renderOrder = 7; b.add(lab);
    this.paintLabel();
    // the water in its sight-glass
    const waterMat = st.surf('liquid', { alpha: 0.9, color: 0x8ac8f0, deep: 0x2a6a9a, glint: 0.6, thick: 0.2 });
    this.water = new Column(WR - 0.3, waterMat, 6, Math.PI / 6); this.water.mesh.renderOrder = 3;
    this.water.mesh.position.x = WX; b.add(this.water.mesh);
    const wg = new THREE.Mesh(new Mold().add(fcyl(WR, W1 - W0, 6, WR, 0, true), M(WX, (W0 + W1) / 2, 0), 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.06, color: 0xdcece6 }));
    wg.renderOrder = 6; b.add(wg);
    // ---- the hopper's flap (hinged at the back) and its hex fullness gauge
    const flap = new Mold().add(fcyl(HR1 - 0.6, 0.8, SIDES, HR1 - 0.4, 0.3), M(0, 0.4, HR1 - 0.6), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? 0xc8a050 : 0x7a5420), BRASS)
      .add(fbox(2.4, 1.6, 1.2, 0.3), M(0, 1.2, HR1 * 2 - 1.6), 0x3a2418, PLASTIC);
    this.flapG.add(solidMesh(st, flap));
    this.flapG.position.set(0, H1 + 0.6, -HR1 + 0.6);
    b.add(this.flapG);
    this.paintFace();
    const gy = (H0 + H1) / 2 + 0.6, gz = (HR0 + HR1) / 2 + 1.6;
    const gauge = new Mold().add(fcyl(3.4, 1.4, 6, 3.6, 0.2), M(0, gy, gz - 0.4, R90, 0, 0), 0xb8c0c8, STEEL);
    b.add(solidMesh(st, gauge));
    const fm = new THREE.Mesh(new Mold().add(polyFace(ngon(6, 3, 0)), null, 0xffffff, PAINT).build(), st.solid({ map: this.face.tex, wear: 0.15 }));
    fm.position.set(0, gy, gz + 0.35); b.add(fm);
    this.needle = solidMesh(st, new Mold().add(fcyl(0.1, 2.6, 4, 0.3, 0), M(0, 1.1, 0, 0, 0, 0, 1, 1, 0.5), 0xb8201a, BRASS).add(fcyl(0.45, 0.4, 6, 0.5, 0.3), M(0, 0, 0.1, R90), 0xc89a3a, BRASS));
    this.needle.position.set(0, gy - 0.6, gz + 0.5); b.add(this.needle);
    // the nausea jewel on the hopper's flank
    this.nauseaMat = st.solid({ wear: 0.1 });
    b.add(solidMesh(st, new Mold().add(fcyl(1.2, 0.8, 6, 1.4, 0.3), M(HR1 - 1.6, gy + 1.2, gz - 2.6, R90), 0xb8c0c8, CHROME)));
    const jw = new THREE.Mesh(new Mold().add(flathe([[0.9, 0], [0.9, 0.3], [0.5, 0.8], [0, 0.95]], 6), M(0, 0, 0, R90), 0x2a5a1a, GLASS, 1).build(), this.nauseaMat);
    jw.position.set(HR1 - 1.6, gy + 1.2, gz - 2.2); b.add(jw);
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(2 * R + 12, H1 + 4, 22), new THREE.MeshBasicMaterial());
    this.hit.position.set(-2, H1 / 2 + 1, 0); this.hit.visible = false; b.add(this.hit);
  }

  private paintLabel() {
    const P = this.label.pix, W = 40, H = 16;
    P.clear();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) P.set(x, y, y === 0 || y === H - 1 ? 0xc8b890 : hash(x, y, 9) < 0.07 ? 0xe2d6b2 : 0xeee4c6);
    // a black-and-yellow hazard stripe along the bottom
    for (let x = 0; x < W; x++) for (let y = 11; y < 14; y++) P.set(x, y, ((x + y) >> 1) % 2 ? 0x1a1610 : 0xd8a828);
    this.label.commit((c) => inkText(c, 'ACID', W / 2, 10, 11, FONT.sign, '#1a140e', 'center', '700'));
  }
  /** the hex gauge's card: E..F over the top half, the last quarter red */
  private paintFace() {
    const P = this.face.pix, W = 16, H = 14, cx = 7.5, cy = 8, Rr = 6.2;
    P.clear();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = Math.abs((x - 7.5) / 8), ny = Math.abs((y - 6.5) / 7) * 0.866;
      const e = Math.max(ny / 0.866, nx + ny * 0.577);
      if (e > 1) continue;
      P.set(x, y, e > 0.86 ? 0x8a7a5a : hash(x, y, 5) < 0.08 ? 0xe4d8b4 : 0xf0e6c8);
    }
    for (let a = 0.75; a <= 1.0001; a += 0.04) { const ang = Math.PI + a * Math.PI; P.set(Math.round(cx + Math.cos(ang) * (Rr - 0.5)), Math.round(cy + Math.sin(ang) * (Rr - 0.5)), 0xb82a22); }
    for (let k = 0; k <= 4; k++) { const ang = Math.PI + (k / 4) * Math.PI; P.line(cx + Math.cos(ang) * (Rr - 2), cy + Math.sin(ang) * (Rr - 2), cx + Math.cos(ang) * Rr, cy + Math.sin(ang) * Rr, 0x2a2018); }
    this.face.commit();
  }
  repaintType() { this.paintLabel(); this.paintFace(); }
  /** a jolt from outside (a hit, the rig bouncing): the chamber wobbles, the acid sloshes */
  kick(k: number) { this.wobV += k * 3; this.tiltV += k * 4 * (Math.random() < 0.5 ? -1 : 1); }

  update(dt: number, J: Jar, p?: Player) {
    this.t += dt;
    if (p) {
      this.hydr += (Math.max(0, Math.min(1, 1 - p.body.thirst / 100)) - this.hydr) * Math.min(1, dt * 2);
      this.sick += (Math.max(0, Math.min(1, (p.body.sickness - 15) / 55)) - this.sick) * Math.min(1, dt * 2);
    }
    // rattle, the wobble spring, the zoom when you tap it to look inside
    const sh = J.shake > 0 ? (Math.random() - 0.5) * Math.min(1, J.shake * 2) * 1.4 : 0;
    this.wobV += (-this.wob * 160 - this.wobV * 9) * dt - J.lidV * 0.004;
    this.wob += this.wobV * dt;
    const z = this.zoom;
    this.body.position.set(sh, Math.max(-1.5, this.wob * 0.6), 0);
    this.body.scale.set(1 + z * 0.35 - this.wob * 0.03, 1 + z * 0.35 + this.wob * 0.05, 1 + z * 0.35 - this.wob * 0.03);
    this.body.rotation.x = z * 0.3;
    // sloshing: a damped tilt of the surface, kicked by splashes and the rattle
    this.tiltV += (-this.tilt * 40 - this.tiltV * 4) * dt + sh * 0.6;
    this.tilt += this.tiltV * dt;
    const sedTop = FLOOR + J.sedShown * IHT;
    const acidTop = FLOOR + (J.acidShown + J.sedShown) * IHT;
    this.murk.set(FLOOR, sedTop, this.tilt * 0.3, 0);
    this.acid.set(sedTop - 0.05, Math.max(sedTop, acidTop), this.tilt, this.tilt * 0.3);
    this.water.set(W0, W0 + 0.2 + this.hydr * (W1 - W0 - 0.4), 0, 0);
    const ac = J.acidCol();
    const U = this.acidMat.uniforms;
    U.uMul.value.set(((ac >> 16) & 255) / 255, ((ac >> 8) & 255) / 255, (ac & 255) / 255);
    const dk = mix(ac, 0x0a1a02, 0.6);
    U.uDeepC.value.set(((dk >> 16) & 255) / 255, ((dk >> 8) & 255) / 255, (dk & 255) / 255);
    U.uSurf.value = acidTop; U.uFoam.value = J.inflam > 0.3 ? J.inflam : 0;
    const sc = J.sedCol;
    this.murkMat.uniforms.uMul.value.set(((sc >> 16) & 255) / 255, ((sc >> 8) & 255) / 255, (sc & 255) / 255);
    this.murkMat.uniforms.uSurf.value = sedTop;
    // the paddles churn: faster while something is digesting, sluggish and jerky when you are sick
    const work = 0.5 + J.recent * 5 + (J.chunks.some((c) => c.on) ? 1.5 : 0);
    this.spin += dt * work * (1 - this.sick * 0.5) * (this.sick > 0.3 ? 0.6 + 0.4 * Math.max(0, Math.sin(this.t * 5)) : 1);
    this.shaft.rotation.y = this.spin;
    // the flap hops when something goes in, flies open when you throw up, chatters when full
    const hop = Math.max(0, -J.lidY) * 0.03;
    const open = J.vomitT >= 0 ? Math.min(1.9, J.vomitT * 5) : Math.min(0.9, hop);
    this.flapG.rotation.x = -open + (J.fill > 0.93 ? Math.sin(this.t * 40) * 0.04 : 0);
    const f = Math.max(0, Math.min(1.08, J.fill));
    const want = R90 - f * Math.PI;
    this.needle.rotation.z += (want - this.needle.rotation.z) * Math.min(1, dt * 5) + (J.fill > 0.93 ? Math.sin(this.t * 33) * 0.02 : 0);
    const gv = this.nauseaMat.uniforms.uGlow.value as THREE.Vector3;
    const pulse = this.sick > 0.05 ? this.sick * (0.7 + 0.3 * Math.sin(this.t * 4)) : 0;
    gv.set(0.25 * pulse + 0.02, 1.3 * pulse + 0.04, 0.2 * pulse + 0.02);
    // cracks into the front glass texture when they change
    if (J.cracks.length !== this.crackN) {
      this.crackN = J.cracks.length;
      const P = this.cracks.pix; P.clear();
      const u = (x: number) => (0.5 - PH / (Math.PI * 2) + Math.asin(Math.max(-1, Math.min(1, (x - SCX) / SHW))) / (Math.PI * 2)) * 96;
      const v = (y: number) => 48 - (((toY(y) - G0) / (G1 - G0)) * 48);
      for (const ck of J.cracks) {
        const k = ck.pts;
        for (let j = 2; j < k.length; j += 2) { P.line(u(k[j - 2]), v(k[j - 1]), u(k[j]), v(k[j + 1]), 0xffffff, 0.95); P.line(u(k[j - 2]) + 1, v(k[j - 1]) + 1, u(k[j]) + 1, v(k[j + 1]) + 1, 0x203038, 0.5); }
      }
      this.cracks.commit();
    }
  }

  /** chunks, bubbles, splashes, the pour, acid weeping from the cracks */
  cubes(C: Cubes, J: Jar) {
    this.C = C;
    const put = this.put;
    for (let i = 0; i < J.chunks.length; i++) {
      const c = J.chunks[i];
      if (!c.on) continue;
      const zz = (hash(i, 7) - 0.5) * 8;
      const y = toY(c.y);
      put(toX(c.x) * (y > G1 ? 0.45 : 1), y, zz, Math.max(0.5, (c.r / SHW) * RI * 1.5), c.spin, c.c);
    }
    for (let i = 0; i < J.parts.length; i++) {
      const q = J.parts[i];
      if (!q.on) continue;
      const zz = q.out ? 4 : (hash(i, 3) - 0.5) * 7;
      put(toX(q.x), toY(q.y), zz, q.out ? 1.1 : 0.55, q.life * 3, q.c, q.out ? 1 : Math.min(0.9, q.life * 1.5));
    }
    if (J.stream > 0) for (let y = H1; y > FLOOR + (J.acidShown + J.sedShown) * IHT; y -= 1.4) put(Math.sin(y * 0.7 + this.t * 20) * 0.3, y, 0, 1, 0, J.streamC, 0.9);
    // acid weeping out of the cracks that are under the surface
    const surfY = J.surfaceY();
    for (let i = 0; i < J.cracks.length; i++) {
      const k = J.cracks[i].pts;
      if (k[1] <= surfY) continue;
      const len = 2 + ((this.t * 9 + i * 5) % 10);
      const x0 = toX(k[0]) * 1.08, y0 = toY(k[1]);
      for (let y = 0; y < len; y += 1.2) put(x0, y0 - y, 7, 0.7, 0, J.acidCol(), 0.9);
    }
  }
  private C: Cubes | null = null;
  private put = (x: number, y: number, zz: number, sz: number, rot: number, c: number, a = 1) => {
    const b = this.body;
    this.v.set(x, y, zz); b.localToWorld(this.v); this.C!.mesh.parent?.worldToLocal(this.v);
    const k = b.scale.x;
    this.C!.put(this.v.x, this.v.y, this.v.z, sz * k, sz * k, sz * k, rot, c, a);
  };
  /** the hopper's mouth (stage space), where bites drop in */
  topWorld(out: THREE.Vector3) { out.set(0, H1 + 1, 0); return this.body.localToWorld(out); }
}

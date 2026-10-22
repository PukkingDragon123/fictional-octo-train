// The stomach as a 3D prop: a thick glass jar of acid on the shelf, a knurled
// brass screw lid with a little pressure gauge on a stem (how full you are), a
// typed paper label. Inside: the murk of half-digested food at the bottom (how
// fed you are) and the acid over it (higher when inflamed). Bites tumble in
// through the lid, splash, bob and sink as they dissolve with a fizz of
// bubbles; bad food cracks the glass and acid weeps out of the cracks; the lid
// hops when something goes in and rattles when you are full; throwing up
// sends the lot up and out. The simulation is jar.ts (2D side-view coordinates).
import * as THREE from 'three';
import type { Jar } from './jar';
import { CX as SCX, BOT as SBOT, HW as SHW, IH as SIH } from './jar';
import type { BodyStage, Cubes } from './stage';
import { PrintTex, FONT, inkText } from './stage';
import { Mold, M, BRASS, PAPER, GLASS, RUBBER, STEEL, PAINT, R90, solidMesh, fcyl, fring } from './models';
import { face as polyFace, ngon, frod } from '../touch/facet';
import { mix, hash } from './pix';

const R = 11, RI = 10.1, IHT = 30, FLOOR = 1.3;
/** an octagonal apothecary jar: the glass, the fluids and the label share these facets */
const SIDES = 8, PH = Math.PI / SIDES;
const toX = (x: number) => ((x - SCX) / SHW) * RI;
const toY = (y: number) => FLOOR + ((SBOT - 1 - y) / SIH) * IHT;

/** a cylinder whose top and bottom rings are moved every frame (fluid columns) */
class Column {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;
  constructor(r: number, mat: THREE.ShaderMaterial) {
    const geo = new Mold().add(new THREE.CylinderGeometry(r, r, 1, SIDES, 1, false, PH), null, 0xffffff, GLASS).build();
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
  private lid = new THREE.Group();
  private needle: THREE.Mesh;
  private murk: Column; private acid: Column;
  private murkMat: THREE.ShaderMaterial; private acidMat: THREE.ShaderMaterial;
  private cracks = new PrintTex(96, 48, 1);
  private crackN = -1;
  private label = new PrintTex(36, 18, 2);
  private face = new PrintTex(16, 14, 1);
  private v = new THREE.Vector3();
  private tilt = 0; private tiltV = 0;
  private t = 0;
  zoom = 0;

  constructor(private st: BodyStage) {
    const r = this.root;
    r.add(this.body);
    const b = this.body;
    // glass: the back wall first, the contents, then the front wall with its cracks
    const back = new THREE.Mesh(new Mold().add(new THREE.CylinderGeometry(R, R, 32, SIDES, 1, true, Math.PI + PH, Math.PI * 2), M(0, 16, 0), 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.05, color: 0xcfe2da, side: THREE.BackSide }));
    back.renderOrder = 1; b.add(back);
    const floor = new THREE.Mesh(new Mold().add(fcyl(R, FLOOR, SIDES, R, 0.3), M(0, FLOOR / 2, 0), 0xffffff, GLASS).add(fring(R - 0.3, 0.9, SIDES, 4), M(0, 32, 0, R90, 0, PH), 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.2, color: 0xb8d0c8 }));
    floor.renderOrder = 2; b.add(floor);
    this.murkMat = st.surf('liquid', { alpha: 0.97, color: 0x8a6a3a, deep: 0x2a1a0a, glint: 0.1, thick: 0.08, depthWrite: true });
    this.acidMat = st.surf('liquid', { alpha: 0.82, color: 0xc8f040, deep: 0x4a6a08, glint: 0.8, thick: 0.03 });
    this.murk = new Column(RI, this.murkMat); this.murk.mesh.renderOrder = 2; b.add(this.murk.mesh);
    this.acid = new Column(RI, this.acidMat); this.acid.mesh.renderOrder = 3; b.add(this.acid.mesh);
    const front = new THREE.Mesh(new Mold().add(new THREE.CylinderGeometry(R, R, 32, SIDES, 1, true, Math.PI + PH, Math.PI * 2), M(0, 16, 0), 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.05, color: 0xdcece6, side: THREE.FrontSide, map: this.cracks.tex }));
    front.renderOrder = 6; b.add(front);
    // the paper label, pasted flat across the three front facets
    const lab = new THREE.Mesh(new Mold().add(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 9, 3, 1, true, -3 * PH, 6 * PH), M(0, 20, 0), 0xffffff, PAPER).build(), st.solid({ map: this.label.tex, wear: 0.3 }));
    lab.renderOrder = 7; b.add(lab);
    this.paintLabel();
    // the lid: an octagonal brass cap over a red rubber gasket, bolted, with a
    // stem and a hex pressure gauge
    const lid = new Mold()
      .add(fring(R + 0.2, 0.7, SIDES, 4), M(0, 0.2, 0, R90, 0, PH), 0x8a2018, RUBBER)
      .add(fcyl(R + 0.9, 3.4, SIDES, R + 1.1, 0.22), M(0, 1.9, 0), (_x, y, _z, nx, ny) => (ny > 0.5 ? 0xd8aa4a : ny < -0.5 ? 0x5a4018 : Math.abs(nx) > 0.6 ? 0xa87a2a : 0xc89a3a), BRASS)
      .add(fcyl(R - 1.2, 0.8, SIDES, R - 0.6, 0.3), M(0, 4, 0), 0xd8aa4a, BRASS)
      .add(fcyl(0.9, 3.4, 6, 1.1, 0.1), M(0, 5.8, 0), 0x9a7a3a, BRASS)
      .add(fcyl(4.6, 1.8, 6, 4.9, 0.2), M(0, 11.4, -0.2, R90, 0, 0), 0xb8c0c8, STEEL);
    // hex bolt heads round the rim
    for (let i = 0; i < SIDES; i++) { const a = PH + (i / SIDES) * Math.PI * 2; lid.add(fcyl(0.75, 0.7, 6, 0.85, 0.3), M(Math.sin(a) * (R - 0.4), 3.9, Math.cos(a) * (R - 0.4)), 0x6a5020, STEEL); }
    this.lid.add(solidMesh(st, lid));
    this.paintFace();
    const fm = new THREE.Mesh(new Mold().add(polyFace(ngon(6, 4, 0)), null, 0xffffff, PAINT).build(), st.solid({ map: this.face.tex, wear: 0.15 }));
    fm.position.set(0, 11.4, 0.75); this.lid.add(fm);
    this.needle = solidMesh(st, new Mold().add(fcyl(0.12, 3.4, 4, 0.38, 0), M(0, 1.5, 0, 0, 0, 0, 1, 1, 0.5), 0xb8201a, BRASS).add(fcyl(0.55, 0.4, 6, 0.6, 0.3), M(0, 0, 0.1, R90), 0xc89a3a, BRASS));
    this.needle.position.set(0, 10.6, 1.0); this.lid.add(this.needle);
    const cover = new THREE.Mesh(new Mold().add(polyFace(ngon(6, 4.2, 0)), null, 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.03 }));
    cover.position.set(0, 11.4, 1.3); cover.renderOrder = 8; this.lid.add(cover);
    // a wire bail clamp up the sides (it rides with the jar, not the lid)
    const bail = new Mold();
    for (const sx of [-1, 1]) {
      bail.add(frod([sx * (R + 0.5), 22, 0], [sx * (R + 0.5), 31.2, 0], 0.35, 4), null, 0xb8bcc2, STEEL);
      bail.add(frod([sx * (R + 0.5), 31.2, 0], [sx * (R - 2.5), 33.6, 0], 0.35, 4), null, 0xb8bcc2, STEEL);
      bail.add(fcyl(0.9, 1.6, 6, 0.9, 0.3), M(sx * (R + 0.4), 22, 0, 0, 0, R90), 0x8a8e94, STEEL);
    }
    b.add(solidMesh(st, bail));
    this.lid.position.y = 32;
    b.add(this.lid);
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.5, R + 1.5, 50, 8), new THREE.MeshBasicMaterial());
    this.hit.position.y = 24; this.hit.visible = false; b.add(this.hit);
  }

  private paintLabel() {
    const P = this.label.pix;
    P.clear();
    for (let y = 0; y < 18; y++) for (let x = 0; x < 36; x++) P.set(x, y, y === 0 || y === 17 ? 0xc8b890 : hash(x, y, 9) < 0.07 ? 0xe2d6b2 : 0xeee4c6);
    // a black-and-yellow hazard stripe along the bottom
    for (let x = 0; x < 36; x++) for (let y = 13; y < 16; y++) P.set(x, y, ((x + y) >> 1) % 2 ? 0x1a1610 : 0xd8a828);
    this.label.commit((c, k) => {
      inkText(c, 'ACID', 18 * k, 11 * k, 10 * k, FONT.sign, '#1a140e', 'center', '700');
    });
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
    P.set(2, 10, 0x2a2018); P.set(2, 11, 0x2a2018); P.set(3, 10, 0x2a2018); P.set(3, 11, 0x2a2018); // E (a pixel mark: too small for type)
    P.set(13, 10, 0x8a1a12); P.set(13, 11, 0x8a1a12); P.set(12, 10, 0x8a1a12);
    this.face.commit();
  }
  repaintType() { this.paintLabel(); this.paintFace(); }

  update(dt: number, J: Jar) {
    this.t += dt;
    // rattle and the zoom when you tap it to look inside
    const sh = J.shake > 0 ? (Math.random() - 0.5) * Math.min(1, J.shake * 2) * 1.4 : 0;
    this.body.position.x = sh;
    const z = this.zoom;
    this.body.scale.setScalar(1 + z * 0.35);
    this.body.rotation.x = z * 0.35;
    // sloshing: a damped tilt of the surface, kicked by splashes and the rattle
    this.tiltV += (-this.tilt * 40 - this.tiltV * 4) * dt + sh * 0.6;
    this.tilt += this.tiltV * dt;
    const sedTop = FLOOR + J.sedShown * IHT;
    const acidTop = FLOOR + (J.acidShown + J.sedShown) * IHT;
    this.murk.set(FLOOR, sedTop, this.tilt * 0.3, 0);
    this.acid.set(sedTop - 0.05, Math.max(sedTop, acidTop), this.tilt, this.tilt * 0.3);
    const ac = J.acidCol();
    const U = this.acidMat.uniforms;
    U.uMul.value.set(((ac >> 16) & 255) / 255, ((ac >> 8) & 255) / 255, (ac & 255) / 255);
    const dk = mix(ac, 0x0a1a02, 0.6);
    U.uDeepC.value.set(((dk >> 16) & 255) / 255, ((dk >> 8) & 255) / 255, (dk & 255) / 255);
    U.uSurf.value = acidTop; U.uFoam.value = J.inflam > 0.3 ? J.inflam : 0;
    const sc = J.sedCol;
    this.murkMat.uniforms.uMul.value.set(((sc >> 16) & 255) / 255, ((sc >> 8) & 255) / 255, (sc & 255) / 255);
    this.murkMat.uniforms.uSurf.value = sedTop;
    // the lid hops, flies when you throw up; the gauge reads how full
    const hop = Math.max(0, -J.lidY) * 0.14;
    this.lid.position.y = 32 + Math.min(J.vomitT >= 0 ? 14 : 3, hop);
    this.lid.rotation.z = J.vomitT >= 0 ? Math.min(0.9, J.vomitT * 2) : J.fill > 0.93 ? Math.sin(this.t * 40) * 0.03 : 0;
    const f = Math.max(0, Math.min(1.08, J.fill));
    const want = R90 - f * Math.PI;
    this.needle.rotation.z += (want - this.needle.rotation.z) * Math.min(1, dt * 5) + (J.fill > 0.93 ? Math.sin(this.t * 33) * 0.02 : 0);
    // cracks into the front glass texture when they change
    if (J.cracks.length !== this.crackN) {
      this.crackN = J.cracks.length;
      const P = this.cracks.pix; P.clear();
      const u = (x: number) => (0.5 - PH / (Math.PI * 2) + Math.asin(Math.max(-1, Math.min(1, (x - SCX) / SHW))) / (Math.PI * 2)) * 96;
      const v = (y: number) => 48 - ((toY(y) / 32) * 48);
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
      const zz = (hash(i, 7) - 0.5) * 9;
      put(toX(c.x), toY(c.y), zz, Math.max(0.5, (c.r / SHW) * RI * 1.5), c.spin, c.c);
    }
    for (let i = 0; i < J.parts.length; i++) {
      const q = J.parts[i];
      if (!q.on) continue;
      const zz = q.out ? 4 : (hash(i, 3) - 0.5) * 8;
      put(toX(q.x), toY(q.y), zz, q.out ? 1.1 : 0.55, q.life * 3, q.c, q.out ? 1 : Math.min(0.9, q.life * 1.5));
    }
    if (J.stream > 0) for (let y = 36; y > FLOOR + (J.acidShown + J.sedShown) * IHT; y -= 1.4) put(Math.sin(y * 0.7 + this.t * 20) * 0.3, y, 0, 1, 0, J.streamC, 0.9);
    // acid weeping out of the cracks that are under the surface
    const surfY = J.surfaceY();
    for (let i = 0; i < J.cracks.length; i++) {
      const k = J.cracks[i].pts;
      if (k[1] <= surfY) continue;
      const len = 2 + ((this.t * 9 + i * 5) % 10);
      const x0 = toX(k[0]) * 1.06, y0 = toY(k[1]);
      for (let y = 0; y < len; y += 1.2) put(x0, y0 - y, 7, 0.7, 0, J.acidCol(), 0.9);
    }
  }
  private C: Cubes | null = null;
  private put = (x: number, y: number, zz: number, sz: number, rot: number, c: number, a = 1) => {
    const b = this.body;
    this.v.set(x, y, zz); b.localToWorld(this.v); this.root.parent?.worldToLocal(this.v);
    const k = b.scale.x;
    this.C!.put(this.v.x, this.v.y, this.v.z, sz * k, sz * k, sz * k, rot, c, a);
  };
  /** the top of the jar on screen (stage space), where bites drop in */
  topWorld(out: THREE.Vector3) { out.set(0, 36, 0); return this.body.localToWorld(out); }
}

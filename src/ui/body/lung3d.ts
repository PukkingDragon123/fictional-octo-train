// The lungs as a 3D prop: a brass pipe with a red bakelite handwheel, a T to
// two nozzles, two latex balloons tied on (lung-shaped, pink, shiny), and an
// air gauge on a bakelite stand with a jewel lamp and a Nixie tube. Physics:
// the balloons ride a spring around the breath (inflate / deflate, squeeze
// under a thumb, wobble on every pump and cough, flutter in a panic); blood
// that got in pools at the bottom and sloshes; splashes stick on the rubber.
import * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { Lungs } from './lung';
import type { BodyStage, Cubes } from './stage';
import { PrintTex, FONT, inkText } from './stage';
import { Mold, M, BRASS, RUBBER, PLASTIC, STEEL, CHROME, GLASS, PAINT, R90, cyl, box, ring, ball, solidMesh, fcyl, fbox, gem } from './models';
import { plate, face as polyFace, clipRect, flathe, ngon } from '../touch/facet';
import { mix, shade, hash } from './pix';

const LOBE_X = 10, NECK_Y = -14.6, RX = 9.6, RY = 10, RZ = 8;
const GAUGE_Y = -47;
/** the meter case and its face window (units) */
const CW = 24, CH = 17, FW = 19, FH = 12;
/** the Nixie tube's post, beside the meter */
const NIX_X = 15.5, NIX_Y = -50;
/** the needle's sweep either side of upright (radians) */
const SWEEP = 0.9;
/** the shelf, in this prop's space (the HUD puts the valve 74 units above it) */
export const LUNG_FLOOR = -74;

interface Lobe { g: THREE.Group; mesh: THREE.Mesh; base: Float32Array; col: THREE.BufferAttribute; spots: THREE.Group; spotN: number; med: number }

export class Lung3D {
  readonly root = new THREE.Group();
  readonly hit: THREE.Mesh;
  private lobes: Lobe[] = [];
  private wheel = new THREE.Group();
  private needle: THREE.Mesh;
  private lampMat: THREE.ShaderMaterial;
  private nixie: PrintTex;
  private face: PrintTex;
  private keyTex: PrintTex;
  private nixieMesh: THREE.Mesh;
  private key: THREE.Group;
  private colT = 0; private lastDigit = '';
  private spotGeo = new Mold().add(polyFace(ngon(5, 1, 0.3)), null, 0x6a0810, RUBBER).build();
  private spotMat: THREE.ShaderMaterial;
  private v = new THREE.Vector3();
  floorY = -70;

  constructor(private st: BodyStage) {
    this.spotMat = st.surf('liquid', { alpha: 0.95, color: 0x8a1018, deep: 0x3a0408, glint: 0.2 });
    const r = this.root;
    // brass pipe from above, flanges, the T and the elbows down to the nozzles
    const brass = 0xc0902e, dark = 0x8a6020;
    const pipe = new Mold()
      .add(cyl(1.5, 11, 8), M(0, -4.5, 0), brass, BRASS)
      .add(cyl(2.2, 1, 10), M(0, 0.4, 0), dark, BRASS)
      .add(cyl(2.2, 1, 10), M(0, -8.4, 0), dark, BRASS)
      .add(cyl(1.4, 2 * LOBE_X + 2.6, 8), M(0, -10.4, 0, 0, 0, R90), brass, BRASS)
      .add(ball(2.2, 0), M(0, -10.4, 0), dark, BRASS)
      .add(cyl(1.3, 3.6, 8), M(-LOBE_X, -12.2, 0), brass, BRASS)
      .add(cyl(1.3, 3.6, 8), M(LOBE_X, -12.2, 0), brass, BRASS)
      .add(ball(1.6, 0), M(-LOBE_X, -10.4, 0), dark, BRASS)
      .add(ball(1.6, 0), M(LOBE_X, -10.4, 0), dark, BRASS);
    r.add(solidMesh(this.st, pipe));
    // the red bakelite handwheel (it turns as you breathe)
    const wh = new Mold().add(ring(3.6, 0.75, 14), null, 0xa8281a, PLASTIC);
    for (let k = 0; k < 3; k++) wh.add(cyl(0.35, 3.4, 6), M(Math.cos(k * 2.094 + R90) * 1.7, Math.sin(k * 2.094 + R90) * 1.7, 0, 0, 0, k * 2.094), 0x8a1a10, PLASTIC);
    wh.add(cyl(1, 1.6, 8), M(0, 0, 0, R90, 0, 0), brass, BRASS);
    this.wheel.add(solidMesh(this.st, wh));
    this.wheel.position.set(0, -4, 1.8);
    r.add(this.wheel);
    // two balloons
    for (const med of [1, -1]) this.lobes.push(this.makeLobe(med));
    // the air meter: a rectangular panel meter in a bakelite case on a stand,
    // a jewel lamp on its shoulder and a Nixie tube on a post beside it
    const face = this.face = new PrintTex(FW * 2, FH * 2, 1);
    this.paintFace();
    const gy = GAUGE_Y;
    const g = new Mold()
      // bakelite case, a chrome bezel with a clipped-corner window, four screws
      .add(fbox(CW, CH, 4.2, 0.22), M(0, gy, -1.2), (_x, y) => (y > gy + CH / 2 - 1.2 ? 0x4a3020 : 0x2c1c12), PLASTIC)
      .add(plate(clipRect(CW - 1.6, CH - 1.6, 2), 0.9, 0.3, [clipRect(FW + 0.3, FH + 0.3, 1.4)]), M(0, gy, 0.9), (_x, y) => (y > gy + 2 ? 0xe4e8ea : y > gy - 3 ? 0xa8b0b6 : 0x5e6468), CHROME)
      .add(fcyl(0.55, 0.5, 6, 0.6, 0.3), M(-CW / 2 + 1.5, gy + CH / 2 - 1.5, 1.9, R90), 0xc0902e, BRASS)
      .add(fcyl(0.55, 0.5, 6, 0.6, 0.3), M(CW / 2 - 1.5, gy + CH / 2 - 1.5, 1.9, R90), 0xc0902e, BRASS)
      .add(fcyl(0.55, 0.5, 6, 0.6, 0.3), M(-CW / 2 + 1.5, gy - CH / 2 + 1.5, 1.9, R90), 0xc0902e, BRASS)
      .add(fcyl(0.55, 0.5, 6, 0.6, 0.3), M(CW / 2 - 1.5, gy - CH / 2 + 1.5, 1.9, R90), 0xc0902e, BRASS)
      // a zero-adjust screw under the window
      .add(fcyl(0.8, 0.6, 6, 0.9, 0.3), M(0, gy - CH / 2 + 1.2, 1.4, R90), 0x1a1612, PLASTIC)
      // the stand: a square bakelite column, a stepped plinth with a chrome kick plate
      .add(fbox(2.6, GAUGE_Y - CH / 2 - LUNG_FLOOR - 2, 2.6, 0.25), M(0, (GAUGE_Y - CH / 2 + LUNG_FLOOR + 2) / 2, -1.5), 0x3a2418, PLASTIC)
      .add(fbox(30, 2.4, 8, 0.25), M(0, LUNG_FLOOR + 1.2, 0), 0x2a1a12, PLASTIC)
      .add(fbox(26, 0.8, 8.2, 0.3), M(0, LUNG_FLOOR + 2.6, 0), 0x4a3424, PLASTIC)
      .add(fbox(28, 0.7, 0.5, 0.3), M(0, LUNG_FLOOR + 1.3, 4.1), 0xd8dee4, CHROME)
      .add(fbox(4, 2.2, 4, 0.25), M(0, gy - CH / 2 - 0.6, -1.2), 0x2a1a12, PLASTIC)
      // the lamp's chrome collar on the case's shoulder
      .add(fcyl(1.9, 1.2, 6, 2.2, 0.25), M(-CW / 2 + 2.6, gy + CH / 2 + 0.5, -0.4), 0xb8c0c8, CHROME)
      // the Nixie's post and its socket
      .add(fcyl(0.9, NIX_Y - 6 - LUNG_FLOOR, 6), M(NIX_X, (NIX_Y - 6 + LUNG_FLOOR) / 2, -0.5), 0x2a1a12, PLASTIC)
      .add(fcyl(2.9, 1.4, 8, 3.1, 0.25), M(NIX_X, NIX_Y - 5.2, 0), 0x1a1612, PLASTIC)
      .add(fbox(1.6, 2, 1, 0.3), M(NIX_X - 3.2, NIX_Y - 5.8, 0), 0x5a4a32, PLASTIC);
    this.base = solidMesh(this.st, g); r.add(this.base);
    const faceMesh = new THREE.Mesh(new Mold().add(polyFace(clipRect(FW, FH, 1.2)), null, 0xffffff, PAINT).build(), this.st.solid({ map: face.tex, wear: 0.2 }));
    faceMesh.position.set(0, gy, 1.0); r.add(faceMesh);
    // the needle: a tapered blade on a brass hex boss, pivoting under the scale
    const ng = new Mold()
      .add(fcyl(0.12, FH - 2.4, 4, 0.42, 0), M(0, (FH - 2.4) / 2, 0, 0, 0, 0, 1, 1, 0.45), 0xb8201a, PAINT)
      .add(fcyl(0.95, 0.7, 6, 1.05, 0.3), M(0, 0, 0.2, R90), 0xc0902e, BRASS);
    this.needle = solidMesh(this.st, ng);
    this.needle.position.set(0, gy - FH / 2 + 1.1, 1.35); r.add(this.needle);
    const cover = new THREE.Mesh(new Mold().add(polyFace(clipRect(FW + 0.3, FH + 0.3, 1.4)), null, 0xffffff, GLASS).build(), this.st.surf('glass', { alpha: 0.04, color: 0xe8f0ee }));
    cover.position.set(0, gy, 1.75); cover.renderOrder = 4; r.add(cover);
    this.lampMat = this.st.solid({ wear: 0.1 });
    const lamp = new THREE.Mesh(new Mold().add(flathe([[1.7, 0], [1.75, 0.5], [1.2, 1.4], [0.6, 1.8], [0, 1.85]], 6), null, 0x8a5a20, GLASS, 1).build(), this.lampMat);
    lamp.position.set(-CW / 2 + 2.6, gy + CH / 2 + 1.1, -0.4); r.add(lamp);
    this.nixie = new PrintTex(8, 12, 4);
    this.nixieMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.8), new THREE.MeshBasicMaterial({ map: this.nixie.tex, transparent: true, depthWrite: false }));
    this.nixieMesh.position.set(NIX_X, NIX_Y - 0.6, 0.1); r.add(this.nixieMesh);
    const tube = new THREE.Mesh(new Mold().add(fcyl(2.5, 8.6, 8, 2.5, 0, true), M(NIX_X, NIX_Y - 0.4, 0), 0xe8f4f4, GLASS).add(flathe([[2.5, 0], [2.2, 1.2], [1.3, 2.1], [0.3, 2.4], [0, 2.5]], 8), M(NIX_X, NIX_Y + 3.9, 0), 0xe8f4f4, GLASS).build(), this.st.surf('glass', { alpha: 0.05, color: 0xe0eeea }));
    tube.renderOrder = 4; r.add(tube);
    // the H key: a bakelite cap that pops up when the lungs need pumping
    const kt = this.keyTex = new PrintTex(9, 9, 4);
    kt.pix.rect(0, 0, 9, 9, 0xe8dcc0); kt.pix.hline(0, 8, 0, 0xfff8e8); kt.pix.hline(0, 8, 8, 0xa89a7a);
    this.paintKey();
    this.key = new THREE.Group();
    const km = new THREE.Mesh(new Mold().add(box(4.6, 4.6, 2.4), null, 0xe8dcc0, PLASTIC).build(), this.st.solid({ map: kt.tex, wear: 0.2 }));
    this.key.add(km); this.key.position.set(13, -2, 2); this.key.scale.setScalar(0.01);
    r.add(this.key);
    // pick volume: balloons and valve
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(2 * (LOBE_X + RX) + 2, 34, 16), new THREE.MeshBasicMaterial());
    this.hit.position.set(0, -18, 0); this.hit.visible = false; r.add(this.hit);
    this.gaugeHit = new THREE.Mesh(new THREE.BoxGeometry(36, 20, 6), new THREE.MeshBasicMaterial());
    this.gaugeHit.position.set(0, GAUGE_Y, 0); this.gaugeHit.visible = false; r.add(this.gaugeHit);
  }
  readonly gaugeHit: THREE.Mesh;
  private base: THREE.Mesh;

  private makeLobe(med: number): Lobe {
    // a lung-shaped balloon: narrow apex, broad base, the inner side flattened;
    // low-poly latex: a few-sided ball cut into flat facets that each catch the light
    let geo: THREE.BufferGeometry = new THREE.SphereGeometry(1, 11, 8);
    let P = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i);
      const z = P.getZ(i);
      const top = 0.72 + 0.28 * Math.min(1, (1 - y) / 1.2);
      x *= top * (x * med > 0 ? 0.74 : 1);
      if (med < 0 && x * med > 0.2 && y < -0.1 && y > -0.6) x *= 0.75; // the heart's notch on the left lung
      y *= 1.3;
      P.setXYZ(i, x, y - 1.25, z);
    }
    const ng = geo.toNonIndexed(); geo.dispose(); geo = ng;
    geo.computeVertexNormals();
    P = geo.getAttribute('position') as THREE.BufferAttribute;
    geo.setAttribute('aCol', new THREE.Float32BufferAttribute(new Float32Array(P.count * 3).fill(0.85), 3));
    const col = geo.getAttribute('aCol') as THREE.BufferAttribute;
    const mesh = new THREE.Mesh(geo, this.st.surf('rubber'));
    mesh.frustumCulled = false;
    const g = new THREE.Group();
    g.position.set(-med * LOBE_X, NECK_Y, 0);
    // the rolled lip of the neck over the nozzle
    g.add(solidMesh(this.st, new Mold().add(ring(1.5, 0.55, 10), M(0, 0.2, 0, R90, 0, 0), 0xb85a68, RUBBER).add(cyl(1.2, 2, 8), M(0, -0.8, 0), 0xc8606e, RUBBER)));
    g.add(mesh);
    const spots = new THREE.Group(); mesh.add(spots);
    this.root.add(g);
    return { g, mesh, base: (P.array as Float32Array).slice(), col, spots, spotN: -1, med };
  }

  /** the meter's printed card: an arc scale OUT..IN over the needle's pivot, a red zone, maker's type */
  private paintFace() {
    const t = this.face, P = t.pix, W = FW * 2, H = FH * 2;
    // the pivot sits 1.1 units above the bottom of the window
    const cx = W / 2 - 0.5, cy = H - 2.2 - 0.5, R = H - 6;
    P.clear();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      let c = hash(x, y, 2) < 0.07 ? 0xe4d8b4 : 0xf0e6c8;
      if (e === 0) c = 0x8a7a5a; else if (e === 1) c = 0xd8ccaa;
      if (hash(x >> 2, y >> 2, 6) > 0.9 && e > 1) c = mix(c, 0xc8a870, 0.35); // foxing
      // clipped corners (the window's shape)
      if (Math.min(x, W - 1 - x) + Math.min(y, H - 1 - y) < 2) continue;
      P.set(x, y, c);
    }
    // the scale: a double arc, the red zone at IN (full), ticks every tenth, long every fifth
    const ang = (k: number) => -SWEEP + k * 2 * SWEEP;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      const a = ang(k), sx = Math.sin(a), sy = -Math.cos(a);
      P.set(Math.round(cx + sx * R), Math.round(cy + sy * R), 0x2a2018);
      if (k > 0.8) { P.set(Math.round(cx + sx * (R - 1)), Math.round(cy + sy * (R - 1)), 0xb82a22); P.set(Math.round(cx + sx * (R - 2)), Math.round(cy + sy * (R - 2)), 0xb82a22); }
    }
    for (let i = 0; i <= 10; i++) {
      const a = ang(i / 10), sx = Math.sin(a), sy = -Math.cos(a);
      const l = i % 5 === 0 ? 3.2 : 1.6;
      P.line(cx + sx * (R + 0.4), cy + sy * (R + 0.4), cx + sx * (R - l), cy + sy * (R - l), i > 8 ? 0x8a1a12 : 0x2a2018);
    }
    // the pivot's shadow on the card
    P.rect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3, 0x6a5a40, 0.5);
    t.commit((c, k) => {
      inkText(c, 'OUT', (cx - R * 0.74) * k, (cy - 1) * k, 7 * k, FONT.sign, '#2a2018', 'center', '700');
      inkText(c, 'IN', (cx + R * 0.76) * k, (cy - 1) * k, 7 * k, FONT.sign, '#8a1a12', 'center', '700');
      inkText(c, 'Air', cx * k, (cy - R * 0.36) * k, 7 * k, FONT.typeset, '#4a3a28', 'center', 'italic 600');
    });
  }

  update(dt: number, L: Lungs, p: Player, panic: number) {
    const t = L.t;
    const flutter = panic > 0.3 ? Math.sin(t * 46) * 0.035 * panic : 0;
    const s = Math.max(0.3, L.s + flutter);
    const strainK = Math.max(0, L.strain - 0.4) / 0.6;
    const shake = L.strain > 0.85 ? (Math.random() - 0.5) * 0.8 : 0;
    for (const lb of this.lobes) {
      const sq = L.squeeze;
      const wob = 1 + L.wob * 0.08 * Math.sin(t * 30 + lb.med);
      const sx = RX * (0.6 + 0.4 * s) * wob * (1 + sq * 0.14), sy = RY * (0.55 + 0.45 * s) * (1 + L.sv * 0.015) * (1 - sq * 0.22), sz = RZ * (0.6 + 0.4 * s) * (1 + sq * 0.08);
      lb.mesh.scale.set(sx, sy, sz);
      lb.g.position.x = -lb.med * LOBE_X + shake;
      lb.g.rotation.z = Math.sin(t * 1.3 + lb.med) * 0.03 + lb.med * L.sv * 0.004;
      // splashes on the rubber
      if (lb.spotN !== L.spots.length) {
        lb.spotN = L.spots.length;
        lb.spots.clear();
        for (const sp of L.spots) {
          if ((sp.lobe ? -1 : 1) !== lb.med) continue;
          const d = Math.hypot(sp.u * 0.6, sp.v * 0.6, 0.8);
          const m = new THREE.Mesh(this.spotGeo, this.spotMat);
          m.position.set(sp.u * 0.6 / d, -sp.v * 0.6 / d * 1.3 - 1.25, 0.8 / d * 1.02);
          m.scale.set(sp.r * 0.12, sp.r * 0.12, 0.05);
          lb.spots.add(m);
        }
      }
    }
    // rubber colour: lighter when stretched, grey and dull when spent, blood pooled inside (10 Hz)
    this.colT -= dt;
    if (this.colT <= 0) {
      this.colT = 0.1;
      const rub = mix(mix(0xd8707f, 0xf2a8b2, strainK * 0.7), 0x8a5a62, Math.max(0, 0.75 - L.cap) * 1.5);
      for (const lb of this.lobes) {
        const B = lb.base, C = lb.col.array as Float32Array;
        const lvl = -1.3 * 2 + 1.3 * (L.stain * 1.25 * 2) + Math.sin(t * 3 + lb.med) * 0.05 + L.slosh * 0.05;
        for (let i = 0; i < B.length / 3; i++) {
          const x = B[i * 3], y = B[i * 3 + 1];
          let c = rub;
          if (L.stain > 0.01 && y < lvl + x * L.slosh * 0.04) c = mix(rub, y > lvl - 0.25 ? 0xc8282e : 0x6a0c14, 0.75);
          if (L.cap < 0.75 && Math.abs(Math.sin(y * 9 + x * 1.5)) < 0.12) c = shade(c, 0.78);
          C[i * 3] = ((c >> 16) & 255) / 255; C[i * 3 + 1] = ((c >> 8) & 255) / 255; C[i * 3 + 2] = (c & 255) / 255;
        }
        lb.col.needsUpdate = true;
      }
    }
    // the handwheel turns with the breath; the needle reads air, or swings as the metronome
    this.wheel.rotation.z = L.phase * 0.12 + (L.pumping ? L.pos * 1.5 : 0);
    const k = L.pumping ? L.pos : Math.max(0, Math.min(1, p.body.endurance));
    const target = SWEEP - k * 2 * SWEEP;
    this.needle.rotation.z += (target - this.needle.rotation.z) * Math.min(1, dt * (L.pumping ? 40 : 6));
    // jewel lamp: green perfect, amber good, red cough / miss
    const lit = L.flashT > 0;
    const lc = !lit ? 0 : !L.flashGood ? 0xff3a20 : L.lastQ === 'perfect' ? 0x7aff6a : 0xffb030;
    const gv = this.lampMat.uniforms.uGlow.value as THREE.Vector3;
    if (lit) gv.set(((lc >> 16) & 255) / 255 * 1.4, ((lc >> 8) & 255) / 255 * 1.4, (lc & 255) / 255 * 1.4); else gv.set(0.12, 0.06, 0.02);
    // Nixie: the streak
    const digit = L.pumping && L.combo > 0 ? String(Math.min(9, L.combo)) : '';
    if (digit !== this.lastDigit) {
      this.lastDigit = digit;
      const P = this.nixie.pix; P.clear();
      for (let y = 1; y < 11; y++) for (let x = 1; x < 7; x++) if ((x + y) % 2 === 0) P.set(x, y, 0x3a3634);
      this.nixie.commit(digit ? (c, k) => {
        c.font = `${11 * k}px ${FONT.nixie}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = '#ff6a10'; c.shadowBlur = 3 * k; c.fillStyle = '#ffb060';
        c.fillText(digit, 4 * k, 6.4 * k); c.shadowBlur = 0; c.fillStyle = '#ffe0b0'; c.fillText(digit, 4 * k, 6.4 * k);
      } : undefined);
    }
    // the H key pops up when the lungs need pumping
    const want = !L.pumping && L.hint > 0.05 ? 1 : 0.01;
    const ks = this.key.scale.x + (want - this.key.scale.x) * Math.min(1, dt * 12);
    this.key.scale.setScalar(ks);
    this.key.position.y = -2 + (want > 0.5 ? Math.abs(Math.sin(t * 6)) * 1.2 : 0);
  }

  private paintKey() { this.keyTex.commit((c, k) => inkText(c, 'H', 4.5 * k, 7.2 * k, 6.5 * k, FONT.sign, '#2a1a10', 'center', '600')); }
  /** web fonts arrived: print the type again */
  repaintType() { this.paintFace(); this.paintKey(); this.lastDigit = '?'; }
  /** puffs of air (or blood) out of the valve */
  cubes(C: Cubes, L: Lungs) {
    for (const q of L.puffs) if (q.on) { this.v.set(q.x - 25, 2 - q.y, 2); this.root.localToWorld(this.v); this.root.parent?.worldToLocal(this.v); C.put(this.v.x, this.v.y, this.v.z, 1, 1, 1, q.life * 4, q.c, Math.min(0.9, q.life * 2)); }
  }
}

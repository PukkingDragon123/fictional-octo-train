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
import { PixTex } from './stage';
import { Mold, M, BRASS, RUBBER, PLASTIC, STEEL, CHROME, GLASS, R90, cyl, box, ring, ball, solidMesh } from './models';
import { mix, shade, type3, hash } from './pix';

const LOBE_X = 9, NECK_Y = -14.6, RX = 8.2, RY = 8.6, RZ = 6.8;
const GAUGE_Y = -44;

interface Lobe { g: THREE.Group; mesh: THREE.Mesh; base: Float32Array; col: THREE.BufferAttribute; spots: THREE.Group; spotN: number; med: number }

export class Lung3D {
  readonly root = new THREE.Group();
  readonly hit: THREE.Mesh;
  private lobes: Lobe[] = [];
  private wheel = new THREE.Group();
  private needle: THREE.Mesh;
  private lampMat: THREE.ShaderMaterial;
  private nixie: PixTex;
  private nixieMesh: THREE.Mesh;
  private key: THREE.Group;
  private colT = 0; private lastDigit = '';
  private v = new THREE.Vector3();
  floorY = -70;

  constructor(private st: BodyStage) {
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
    for (let k = 0; k < 3; k++) wh.add(box(0.7, 3.4, 0.6), M(Math.cos(k * 2.094 + R90) * 1.7, Math.sin(k * 2.094 + R90) * 1.7, 0, 0, 0, k * 2.094), 0x8a1a10, PLASTIC);
    wh.add(cyl(1, 1.6, 8), M(0, 0, 0, R90, 0, 0), brass, BRASS);
    this.wheel.add(solidMesh(this.st, wh));
    this.wheel.position.set(0, -4, 1.8);
    r.add(this.wheel);
    // two balloons
    for (const med of [1, -1]) this.lobes.push(this.makeLobe(med));
    // the gauge on its stand, the lamp, the Nixie tube
    const face = new PixTex(28, 28);
    this.paintFace(face);
    const g = new Mold()
      .add(cyl(7.6, 2.2, 18), M(0, GAUGE_Y, 0, R90, 0, 0), 0xb8c0c8, CHROME)
      .add(cyl(6.9, 0.6, 18), M(0, GAUGE_Y, 1.2, R90, 0, 0), 0xe8eef2, CHROME)
      .add(box(3, 30, 3), M(0, GAUGE_Y - 21, -1.5), 0x3a2418, PLASTIC)
      .add(box(30, 2.4, 7), M(0, 0, 0), 0x2a1a12, PLASTIC)
      .add(box(4.6, 3, 4.6), M(-11, GAUGE_Y + 0.5, 0), 0x2a1a12, PLASTIC)
      .add(cyl(2.3, 1, 10), M(-11, GAUGE_Y + 3.2, 0), 0xc0902e, BRASS)
      .add(cyl(2.9, 1.4, 10), M(11.5, GAUGE_Y - 5.2, 0), 0x1a1612, PLASTIC)
      .add(box(3.6, 6, 3.6), M(11.5, GAUGE_Y - 9, -0.5), 0x2a1a12, PLASTIC);
    this.base = solidMesh(this.st, g); r.add(this.base);
    const faceMesh = new THREE.Mesh(new THREE.CircleGeometry(6.6, 20), this.st.solid({ map: face.tex, wear: 0.2 }));
    faceMesh.position.set(0, GAUGE_Y, 1.25); r.add(faceMesh);
    const ng = new Mold().add(box(0.8, 5.4, 0.4), M(0, 2.5, 0), 0xb8201a, PLASTIC).add(cyl(0.9, 0.6, 8), M(0, 0, 0.2, R90, 0, 0), 0xc0902e, BRASS);
    this.needle = solidMesh(this.st, ng);
    this.needle.position.set(0, GAUGE_Y - 1.4, 1.7); r.add(this.needle);
    const cover = new THREE.Mesh(new Mold().add(new THREE.CircleGeometry(6.8, 18), null, 0xffffff, GLASS).build(), this.st.clear({ alpha: 0.06, fres: 0.2, spec: 1 }));
    cover.position.set(0, GAUGE_Y, 2.1); cover.renderOrder = 4; r.add(cover);
    this.lampMat = this.st.solid({ wear: 0.1 });
    const lamp = new THREE.Mesh(new Mold().add(ball(1.8, 1), null, 0x8a5a20, GLASS, 1).build(), this.lampMat);
    lamp.position.set(-11, GAUGE_Y + 4.6, 0.4); r.add(lamp);
    this.nixie = new PixTex(8, 12);
    this.nixieMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.8), new THREE.MeshBasicMaterial({ map: this.nixie.tex, transparent: true, depthWrite: false }));
    this.nixieMesh.position.set(11.5, GAUGE_Y - 0.6, 0.1); r.add(this.nixieMesh);
    const tube = new THREE.Mesh(new Mold().add(cyl(2.5, 8.6, 10, true), M(11.5, GAUGE_Y - 0.4, 0), 0xe8f4f4, GLASS).add(ball(2.5, 1), M(11.5, GAUGE_Y + 3.9, 0, 0, 0, 0, 1, 0.6, 1), 0xe8f4f4, GLASS).build(), this.st.clear({ alpha: 0.1, fres: 0.75, spec: 1 }));
    tube.renderOrder = 4; r.add(tube);
    // the H key: a bakelite cap that pops up when the lungs need pumping
    const kt = new PixTex(9, 9);
    kt.pix.rect(0, 0, 9, 9, 0xe8dcc0); kt.pix.hline(0, 8, 0, 0xfff8e8); kt.pix.hline(0, 8, 8, 0xa89a7a); type3(kt.pix, 'H', 3, 2, 0x2a1a10); kt.commit();
    this.key = new THREE.Group();
    const km = new THREE.Mesh(new Mold().add(box(4.6, 4.6, 2.4), null, 0xe8dcc0, PLASTIC).build(), this.st.solid({ map: kt.tex, wear: 0.2 }));
    this.key.add(km); this.key.position.set(13, -2, 2); this.key.scale.setScalar(0.01);
    r.add(this.key);
    // pick volume: balloons and valve
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(2 * (LOBE_X + RX) + 2, 34, 16), new THREE.MeshBasicMaterial());
    this.hit.position.set(0, -18, 0); this.hit.visible = false; r.add(this.hit);
    this.gaugeHit = new THREE.Mesh(new THREE.BoxGeometry(32, 18, 6), new THREE.MeshBasicMaterial());
    this.gaugeHit.position.set(0, GAUGE_Y, 0); this.gaugeHit.visible = false; r.add(this.gaugeHit);
  }
  readonly gaugeHit: THREE.Mesh;
  private base: THREE.Mesh;

  private makeLobe(med: number): Lobe {
    // a lung-shaped balloon: narrow apex, broad base, the inner side flattened
    const geo = new Mold().add(ball(1, 2), null, 0xd8707f, RUBBER).build();
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i);
      const z = P.getZ(i);
      const top = 0.72 + 0.28 * Math.min(1, (1 - y) / 1.2);
      x *= top * (x * med > 0 ? 0.74 : 1);
      if (med < 0 && x * med > 0.2 && y < -0.1 && y > -0.6) x *= 0.75; // the heart's notch on the left lung
      y *= 1.3;
      P.setXYZ(i, x, y - 1.25, z);
    }
    geo.computeVertexNormals();
    const col = geo.getAttribute('aCol') as THREE.BufferAttribute;
    const mesh = new THREE.Mesh(geo, this.st.solid({ wear: 0.15 }));
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

  private paintFace(t: PixTex) {
    const P = t.pix, cx = 14, cy = 17, R = 12;
    P.clear();
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      const d = Math.hypot(x - cx, y - 14);
      if (d > 13.6) continue;
      P.set(x, y, hash(x, y, 2) < 0.07 ? 0xe4d8b4 : 0xf0e6c8);
    }
    // red band near IN (full) on the arc, ticks, the typed scale
    for (let a = 0; a <= 1.0001; a += 0.02) { const ang = Math.PI + a * Math.PI; if (a > 0.8) P.set(Math.round(cx + Math.cos(ang) * (R - 1)), Math.round(cy + Math.sin(ang) * (R - 1)), 0xb82a22); }
    for (let k = 0; k <= 10; k++) {
      const ang = Math.PI + (k / 10) * Math.PI, c = Math.cos(ang), s = Math.sin(ang);
      const l = k % 5 === 0 ? 3 : 1.6;
      P.line(cx + c * (R - l), cy + s * (R - l), cx + c * R, cy + s * R, 0x2a2018);
    }
    type3(P, 'OUT', 2, 19, 0x2a2018, 0.9, 0.3);
    type3(P, 'IN', 19, 19, 0x2a2018, 0.9, 0.3);
    type3(P, 'AIR', 9, 8, 0x6a5a48, 0.7, 0.4);
    t.commit();
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
    const target = R90 - k * Math.PI;
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
      if (digit) { const s2 = new PixTexDigit(); s2.draw(P, digit); }
      this.nixie.commit();
    }
    // the H key pops up when the lungs need pumping
    const want = !L.pumping && L.hint > 0.05 ? 1 : 0.01;
    const ks = this.key.scale.x + (want - this.key.scale.x) * Math.min(1, dt * 12);
    this.key.scale.setScalar(ks);
    this.key.position.y = -2 + (want > 0.5 ? Math.abs(Math.sin(t * 6)) * 1.2 : 0);
    this.base.position.y = 0;
  }
  private spotGeo = new Mold().add(new THREE.CircleGeometry(1, 6), null, 0x6a0810, RUBBER).build();
  private spotMat = this.st.solid({ wear: 0 });

  /** puffs of air (or blood) out of the valve */
  cubes(C: Cubes, L: Lungs) {
    for (const q of L.puffs) if (q.on) { this.v.set(q.x - 25, 2 - q.y, 2); this.root.localToWorld(this.v); C.put(this.v.x, this.v.y, this.v.z, 1, 1, 1, q.life * 4, q.c, Math.min(0.9, q.life * 2)); }
  }
  /** place the gauge stand so it reaches the shelf */
  setFloor(y: number) {
    this.floorY = y;
    const local = y - this.root.position.y;
    this.base.geometry.translate(0, 0, 0);
    this.standY = local;
  }
  standY = 0;
}

/** a glowing orange Nixie numeral, 2x the 3x5 type with a halo */
class PixTexDigit {
  draw(P: import('./pix').Pix, d: string) {
    const G: Record<string, string> = {
      '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001',
      '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
    };
    const g = G[d]; if (!g) return;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') {
      const x = 1 + i * 2, y = 1 + j * 2;
      P.blend(x - 1, y, 0xff6a10, 0.35); P.blend(x + 2, y, 0xff6a10, 0.35);
      P.set(x, y, 0xffc070); P.set(x + 1, y, 0xffa040); P.set(x, y + 1, 0xff8a30); P.set(x + 1, y + 1, 0xff7a20);
    }
  }
}

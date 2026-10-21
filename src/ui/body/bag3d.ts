// The IV blood bag, as a little 3D prop: a chrome stand arm, a steel S-hook,
// a clear PVC pillow with its print (label, pictogram, wound holes) and the
// blood inside it, a port, a roller clamp, a glass drip chamber (hydration) and
// the line going down. Physics: the bag is a damped pendulum on the hook (you
// moving, getting hit, flicking it), the blood surface is a row of springs that
// slosh with the swing, drips fall from every hole, splash on the shelf and
// pool there.
import * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { Injury } from '../../survival/body';
import type { BodyStage, Cubes } from './stage';
import { PixTex } from './stage';
import { Mold, M, CHROME, STEEL, PLASTIC, R90, cyl, box, ring, pillow, solidMesh } from './models';
import { BagPrint, holeAt, PRINT_W, PRINT_H } from './bagPrint';
import { mix } from './pix';

const BW = 26, BH = 46, TOP = -8, DEPTH = 3.4, NC = 9;

export class Bag3D {
  readonly root = new THREE.Group();
  readonly swing = new THREE.Group();
  readonly hit: THREE.Mesh;
  private print = new PixTex(PRINT_W, PRINT_H);
  private painter = new BagPrint();
  private fluid: THREE.Mesh;
  private fluidGeo: THREE.BufferGeometry;
  private fluidMat: THREE.ShaderMaterial;
  private chamber: THREE.Mesh;
  private chamberMat: THREE.ShaderMaterial;
  private puddle: THREE.Mesh;
  private puddleMat: THREE.ShaderMaterial;
  // ---- physics
  ang = 0; angV = 0; tilt = 0; tiltV = 0;
  private wave = new Float32Array(NC); private wv = new Float32Array(NC);
  level = 1; private shown = 1;
  private drops: { x: number; y: number; z: number; vx: number; vy: number; c: number; on: boolean; splash: boolean }[] = [];
  private puddleK = 0;
  private dripT = 0; private chamberY = -1;
  private paintT = 0; private t = 0;
  private col = { base: 0x8e0f17, hi: 0xd2343a };
  private hydr = 1;
  floorY = -70;
  private v = new THREE.Vector3();
  hover: Injury | null = null;
  injuries: Injury[] = [];

  constructor(private st: BodyStage) {
    const r = this.root;
    // stand arm (fixed) and S-hook
    const arm = new Mold()
      .add(cyl(1, 34, 8), M(-2, 3, -1, 0, 0, R90), 0xd8dee4, CHROME)
      .add(box(4, 5, 4), M(-18, 3, -1), 0x5a4a32, PLASTIC)
      .add(cyl(1.2, 2.4, 6), M(-18, 3, 1.6, R90, 0, 0), 0xc89a3a, STEEL);
    r.add(solidMesh(st, arm));
    const hook = new Mold()
      .add(ring(1.6, 0.45, 8), M(0, 0.8, 0, 0, R90, 0), 0xc8ccd2, CHROME)
      .add(ring(1.4, 0.45, 8, Math.PI * 1.3), M(0, -3.2, 0, 0, 0, Math.PI * 1.2), 0xb8bcc2, CHROME)
      .add(box(0.9, 3, 0.9), M(1.4, -1.6, 0), 0xc8ccd2, CHROME);
    r.add(solidMesh(st, hook));
    r.add(this.swing);
    const s = this.swing;
    // heat-sealed top with the hanger slot, and the bottom seam
    const seams = new Mold()
      .add(box(BW, 2.4, 1.2), M(0, TOP + 0.6, 0), (x) => (Math.abs(x) < 1.6 ? 0x3a3a34 : 0xdcd8c4), PLASTIC)
      .add(box(BW - 4, 1.4, 1.2), M(0, TOP - BH - 0.2, 0), 0xd0ccb8, PLASTIC)
      .add(ring(1.4, 0.4, 8), M(0, TOP + 2.6, 0, 0, R90, 0), 0xb8bcc2, CHROME);
    s.add(solidMesh(st, seams));
    // blood (dynamic), drawn first, then the clear plastic over it
    this.fluidGeo = this.makeFluidGeo();
    this.fluidMat = st.clear({ alpha: 0.94, fres: 0.15, spec: 0.6, deep: 0.6, color: 0x8e0f17, depthWrite: true, side: THREE.DoubleSide });
    this.fluid = new THREE.Mesh(this.fluidGeo, this.fluidMat); this.fluid.frustumCulled = false; this.fluid.renderOrder = 1;
    s.add(this.fluid);
    const back = new THREE.Mesh(this.panelGeo(-1), st.clear({ alpha: 0.18, fres: 0.5, spec: 0.5, color: 0xe6ecdc }));
    back.renderOrder = 0; s.add(back);
    const front = new THREE.Mesh(this.panelGeo(1), st.clear({ alpha: 0.16, fres: 0.55, spec: 1, color: 0xeef2e4, map: this.print.tex }));
    front.renderOrder = 2; s.add(front);
    // port, roller clamp, drip chamber with steel caps, the line
    const by = TOP - BH;
    const kit = new Mold()
      .add(cyl(1.3, 3.4, 8), M(0, by - 1.8, 0), 0xe8e4d4, PLASTIC)
      .add(box(3.4, 2.2, 2.4), M(0, by - 5, 0), 0x9aa2aa, STEEL)
      .add(cyl(0.8, 2.6, 8), M(0, by - 5, 1.4, R90, 0, 0), 0x4a525a, STEEL)
      .add(cyl(2.7, 1, 10), M(0, by - 7.2, 0), 0xc8ccd2, CHROME)
      .add(cyl(2.7, 1, 10), M(0, by - 16.4, 0), 0xc8ccd2, CHROME);
    s.add(solidMesh(st, kit));
    const glass = new THREE.Mesh(new Mold().add(cyl(2.4, 8.4, 10, true), M(0, by - 11.8, 0), 0xe8f4f4, PLASTIC).build(), st.clear({ alpha: 0.12, fres: 0.7, spec: 1 }));
    glass.renderOrder = 3; s.add(glass);
    this.chamberMat = st.clear({ alpha: 0.85, fres: 0.2, spec: 0.8, color: 0x8ac8f0, depthWrite: true });
    this.chamber = new THREE.Mesh(new Mold().add(cyl(2, 1, 10), M(0, 0.5, 0), 0xffffff, PLASTIC).build(), this.chamberMat);
    this.chamber.position.y = by - 16; s.add(this.chamber);
    this.lineTop = by - 17;
    const line = new THREE.Mesh(new Mold().add(cyl(0.55, 1, 6), M(0, -0.5, 0), 0xd8e4e4, PLASTIC).build(), st.clear({ alpha: 0.55, fres: 0.4, spec: 0.8, color: 0xd8e8e8 }));
    line.renderOrder = 3; this.line = line; s.add(line);
    // invisible pick box over the bag
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(BW + 2, BH + 4, 9), new THREE.MeshBasicMaterial());
    this.hit.position.set(0, TOP - BH / 2, 0); this.hit.visible = false;
    s.add(this.hit);
    // the puddle on the shelf
    this.puddleMat = st.clear({ alpha: 0.95, fres: 0.1, spec: 1, color: 0x6a0a10, depthWrite: true });
    this.puddle = new THREE.Mesh(new Mold().add(cyl(1, 0.5, 10), null, 0xffffff, PLASTIC).build(), this.puddleMat);
    this.puddle.scale.set(0.01, 1, 0.01);
    r.add(this.puddle);
    for (let i = 0; i < 48; i++) this.drops.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, c: 0, on: false, splash: false });
  }
  private line: THREE.Mesh;
  private lineTop = -70;

  private panelGeo(side: 1 | -1): THREE.BufferGeometry {
    const g = pillow(BW, BH, DEPTH, side);
    g.translate(0, TOP - BH / 2, 0);
    const n = g.getAttribute('position').count;
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    return g;
  }
  private makeFluidGeo(): THREE.BufferGeometry {
    // NC columns x 7 rows; front and back sheets; rows run from the bottom to the (moving) surface
    const g = new THREE.BufferGeometry();
    const rows = 7, n = NC * rows * 2;
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    const idx: number[] = [];
    for (let side = 0; side < 2; side++) {
      const o = side * NC * rows;
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < NC - 1; i++) {
        const a = o + j * NC + i, b = a + 1, c = a + NC, d = c + 1;
        if (side === 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
      }
    }
    // the top: bridge front and back along the surface
    const top = (rows - 1) * NC;
    for (let i = 0; i < NC - 1; i++) { const a = top + i, b = a + 1, c = NC * rows + top + i, d = c + 1; idx.push(a, c, d, a, d, b); }
    g.setIndex(idx);
    return g;
  }
  private bulge(x: number, y: number) { const u = x / (BW / 2), v = (y - (TOP - BH / 2)) / (BH / 2); return DEPTH * 0.86 * (1 - u ** 4) * (1 - Math.min(1, v * v) ** 2); }

  /** jolt it (a hit, a flick): angular kick and a slosh */
  kick(dAng: number, slosh: number) {
    this.angV += dAng; this.tiltV += dAng * 0.4 * (Math.random() - 0.5);
    for (let i = 0; i < NC; i++) this.wv[i] += (Math.random() - 0.5) * slosh * 22;
  }
  beat(k: number) { this.chamberY = 0; this.pulse = 0.08 * k; }
  private pulse = 0;

  update(dt: number, p: Player) {
    const b = p.body;
    this.t += dt;
    this.injuries = b.allInjuries();
    const blood = Math.max(0, Math.min(1, b.blood / 100)), hp = Math.max(0, Math.min(1, b.health / 100));
    this.level = b.dead ? 0 : Math.min(blood, hp * 0.9 + 0.1 * blood);
    this.shown += (this.level - this.shown) * Math.min(1, dt * 2.5);
    this.hydr += (Math.max(0, Math.min(1, 1 - b.thirst / 100)) - this.hydr) * Math.min(1, dt * 2);
    // pendulum + a little tilt toward / away from you
    this.angV += (-this.ang * 22 - this.angV * 2.2) * dt; this.ang = Math.max(-0.5, Math.min(0.5, this.ang + this.angV * dt));
    this.tiltV += (-this.tilt * 18 - this.tiltV * 3) * dt; this.tilt = Math.max(-0.4, Math.min(0.4, this.tilt + this.tiltV * dt));
    // pain makes it tremble
    const pain = b.pain();
    if (pain > 45 && Math.random() < dt * 8) this.angV += (Math.random() - 0.5) * (pain - 45) / 55 * 0.6;
    this.swing.rotation.set(this.tilt, 0, this.ang);
    // surface springs, pushed by the swing (the blood stays level as the bag tilts)
    const w = this.wave, v = this.wv;
    for (let i = 0; i < NC; i++) { const l = w[i - 1] ?? w[i], r = w[i + 1] ?? w[i]; v[i] += ((l + r - 2 * w[i]) * 60 - w[i] * 30 - v[i] * 3) * dt + (i - (NC - 1) / 2) * this.angV * dt * 8; }
    for (let i = 0; i < NC; i++) w[i] = Math.max(-5, Math.min(5, w[i] + v[i] * dt));
    this.pulse = Math.max(0, this.pulse - dt);
    // blood colour: infection greens it, food poisoning muddies it, corruption blackens it (and sparks)
    const fever = b.fever(), sick = b.sickness / 100, cor = b.corruption / 100;
    let base = 0x8e0f17, hi = 0xd2343a;
    if (b.blood < 60) { const k = (60 - b.blood) / 60; base = mix(base, 0x5a0a12, k); hi = mix(hi, 0x9a2a32, k); }
    if (sick > 0.05) { base = mix(base, 0x5e6a14, sick * 0.55); hi = mix(hi, 0x9aa832, sick * 0.55); }
    if (fever > 0.12) { base = mix(base, 0x86a01e, fever * 0.7); hi = mix(hi, 0xc8e050, fever * 0.7); }
    if (b.drunk > 30) base = mix(base, 0x9a3a10, 0.2);
    if (cor > 0.04) { base = mix(base, 0x10141c, Math.min(1, cor * 1.4)); hi = mix(hi, 0x2a3446, Math.min(1, cor * 1.4)); }
    this.col.base = base; this.col.hi = hi;
    const U = this.fluidMat.uniforms;
    U.uMul.value.set(((base >> 16) & 255) / 255, ((base >> 8) & 255) / 255, (base & 255) / 255);
    U.uSpark.value = cor > 0.04 ? cor : 0;
    const cc = this.hydr < 0.25 ? 0xd8b060 : 0x8ac8f0;
    this.chamberMat.uniforms.uMul.value.set(((cc >> 16) & 255) / 255, ((cc >> 8) & 255) / 255, (cc & 255) / 255);
    this.writeFluid();
    // chamber level and the beat's drop
    this.chamber.scale.y = Math.max(0.05, this.hydr * 7.2);
    if (this.chamberY >= 0) { this.chamberY += dt * 2.6; if (this.chamberY > 1) this.chamberY = -1; }
    const lineLen = Math.max(1, this.lineTop - this.floorY + 2);
    this.line.position.y = this.lineTop; this.line.scale.y = lineLen;
    // leaks
    for (const inj of this.injuries) {
      const r = b.injuryBleed(inj);
      if (r <= 0.005) continue;
      if (Math.random() < Math.min(0.95, r * 8 * dt + 0.25 * dt)) this.drip(inj, Math.random() < 0.5 ? base : hi);
      if (inj.infection > 0.25 && Math.random() < dt * 0.4) this.drip(inj, 0xb8c040);
    }
    for (const d of this.drops) {
      if (!d.on) continue;
      d.vy -= 140 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.98;
      if (d.y <= this.floorY + 0.4) {
        if (!d.splash && Math.random() < 0.5) { d.splash = true; d.vy = 18 + Math.random() * 10; d.vx = (Math.random() - 0.5) * 24; d.y = this.floorY + 0.5; }
        else { d.on = false; this.puddleK = Math.min(1, this.puddleK + 0.015); }
      }
    }
    this.puddleK = Math.max(0, this.puddleK - dt * 0.01);
    const pk = this.puddleK;
    this.puddle.position.set(0, this.floorY + 0.25, 1);
    this.puddle.scale.set(0.01 + pk * 9, 1, 0.01 + pk * 4);
    this.puddleMat.uniforms.uMul.value.set(((base >> 16) & 255) / 255 * 0.8, ((base >> 8) & 255) / 255 * 0.8, (base & 255) / 255 * 0.8);
    // repaint the print a few times a second (holes blink when they want care)
    this.paintT -= dt;
    if (this.paintT <= 0) { this.paintT = 0.16; this.painter.paint(this.print.pix, this.injuries, b.severed, this.hover, this.t); this.print.commit(); }
  }

  private writeFluid() {
    const g = this.fluidGeo;
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    const rows = 7;
    const bot = TOP - BH + 1.2, span = BH - 3;
    const lean = Math.tan(this.ang);
    const lvl = this.shown;
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j < rows; j++) for (let i = 0; i < NC; i++) {
        const x = -BW / 2 + 1 + (i / (NC - 1)) * (BW - 2);
        let surf = bot + lvl * span + this.wave[i] * Math.min(1, lvl * 4) + x * lean * 0.8 + this.pulse * 6;
        surf = Math.max(bot + 0.3, Math.min(TOP - 1.4, surf));
        const y = bot + (surf - bot) * (j / (rows - 1));
        const z = (side ? -1 : 1) * Math.max(0.3, this.bulge(x, y)) * (lvl <= 0.003 ? 0 : 1);
        P.setXYZ(side * NC * rows + j * NC + i, x * 0.94, y, z);
      }
    }
    P.needsUpdate = true;
    g.computeVertexNormals();
    this.fluid.visible = lvl > 0.003;
  }

  private drip(inj: Injury, c: number) {
    const w = this.holeWorld(inj, this.v);
    for (const d of this.drops) if (!d.on) { d.on = true; d.splash = false; d.x = w.x + (Math.random() - 0.5) * 0.6; d.y = w.y - 0.5; d.z = w.z + 0.5; d.vx = (Math.random() - 0.5) * 3; d.vy = -2 - Math.random() * 6; d.c = c; return; }
  }
  /** a wound's hole in stage space */
  holeWorld(inj: Injury, out: THREE.Vector3): THREE.Vector3 {
    const [hx, hy] = holeAt(inj);
    const x = (hx / PRINT_W - 0.5) * BW, y = TOP - (hy / PRINT_H) * BH;
    out.set(x, y, this.bulge(x, y) + 0.2);
    return this.swing.localToWorld(out);
  }
  /** the wound under a pick point (stage space), if any */
  holeUnder(point: THREE.Vector3): Injury | null {
    const l = this.swing.worldToLocal(point.clone());
    const u = (l.x / BW + 0.5) * PRINT_W, v = ((TOP - l.y) / BH) * PRINT_H;
    let best: Injury | null = null, bd = 5.5;
    for (const inj of this.injuries) { const [hx, hy] = holeAt(inj); const d = Math.hypot(hx - u, hy - v); if (d < bd) { bd = d; best = inj; } }
    return best;
  }
  /** drops, the drip in the chamber: one shared cube batch */
  cubes(C: Cubes) {
    for (const d of this.drops) if (d.on) C.put(d.x, d.y, d.z, 0.9, d.splash ? 0.9 : 1.6, 0.9, 0, d.c);
    if (this.chamberY >= 0) {
      this.v.set(0, TOP - BH - 8.4 - this.chamberY * Math.max(1.5, 7.5 - this.hydr * 6.5), 0);
      this.swing.localToWorld(this.v);
      C.put(this.v.x, this.v.y, this.v.z, 0.8, 1.2, 0.8, 0, this.hydr < 0.15 ? 0xd8b060 : 0xa8d8f8);
    }
  }
}

// The lungs as a breathing machine on the life-support rig: a ventilator's
// "bag in a bottle". A pink rubber accordion bellows rises and falls inside an
// octagonal glass canister held by four tie rods, under a brass top cap with an
// exhaust valve that puffs on every breath out. The bellows strokes with your
// breathing rate (slow at rest, racing when you run or panic), heaves and
// shudders when the lungs are over-full, stalls low when you are spent, jerks on
// a cough; blood that got in pools in its bottom folds and sloshes. Set into the
// rig's console under it: the air meter (a rectangular panel meter: at rest the
// needle reads your air, while pumping it swings OUT..IN as the metronome), a
// jewel lamp, a Nixie streak counter and the H key that pops up when it is
// time to pump. The simulation is lung.ts (unchanged).
//
// Space: the root sits on the console's top face (y = 0), canister centre x = 0;
// the console's front face is at z = FRONT, its top-to-bottom span y 0..-CON_H.
import * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { Lungs } from './lung';
import type { BodyStage, Cubes } from './stage';
import { PrintTex, FONT, inkText } from './stage';
import { Mold, M, BRASS, PLASTIC, STEEL, CHROME, GLASS, PAINT, RUBBER, R90, solidMesh, fcyl, fbox } from './models';
import { plate, face as polyFace, clipRect, flathe, frod } from '../touch/facet';
import { mix, shade } from './pix';

/** canister: radius, glass from y = BASE to y = BASE + CAN_H */
const CR = 8.4, BASE = 4.2, CAN_H = 29;
/** the bellows' travel (height of the folds above BASE) */
const B_MIN = 5, B_MAX = 26.5;
/** the console under the rig (this prop's meter is set into its front) */
export const CON_H = 14, FRONT = 8;
/** the meter: case and face window (units), centred in the console front */
const CW = 25, CH = 13, FW = 20, FH = 9.6, MY = -CON_H / 2;
/** the needle's sweep either side of upright (radians) */
const SWEEP = 0.95;
/** the old balloons' shelf (kept for callers that placed things by it) */
export const LUNG_FLOOR = -74;
const PLEATS = 7;

export class Lung3D {
  readonly root = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly gaugeHit: THREE.Mesh;
  /** the moving parts: the whole pump (jiggle), the bellows (scaled), its top plate */
  private body = new THREE.Group();
  private bellows: THREE.Mesh;
  private bellowsGeo: THREE.BufferGeometry;
  private bBase: Float32Array;
  private bCol: THREE.BufferAttribute;
  private topPlate = new THREE.Group();
  private valveFlap = new THREE.Group();
  private needle: THREE.Mesh;
  private lampMat: THREE.ShaderMaterial;
  private nixie: PrintTex;
  private face: PrintTex;
  private keyTex: PrintTex;
  private key = new THREE.Group();
  private colT = 0; private lastDigit = '';
  private v = new THREE.Vector3();
  private h = 14; private hv = 0;
  private jx = 0; private jvx = 0;
  private flap = 0;
  private lastS = 0.9;
  private stall = 0;
  floorY = -70;

  constructor(private st: BodyStage) {
    const r = this.root;
    r.add(this.body);
    const b = this.body;
    // ---- the plinth: an octagonal bakelite drum with a brass band, an intake hose stub
    const base = new Mold()
      .add(fcyl(CR + 1.6, BASE, 8, CR + 2.2, 0.2), M(0, BASE / 2, 0), (_x, y) => (y > BASE - 0.8 ? 0x4a3424 : 0x2a1c12), PLASTIC)
      .add(fcyl(CR + 1.9, 0.9, 8, CR + 1.9, 0.2), M(0, 1.4, 0), 0xc0902e, BRASS)
      .add(fcyl(1.3, 4, 6, 1.3, 0.15), M(-CR - 2.4, 1.8, 2, 0, 0, R90), 0x9aa2aa, STEEL)
      .add(fcyl(1.7, 1.2, 6, 1.7, 0.3), M(-CR - 4.2, 1.8, 2, 0, 0, R90), 0xc0902e, BRASS);
    // ---- four tie rods from the plinth to the cap, with hex nuts top and bottom
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * (CR + 1.2), z = Math.sin(a) * (CR + 1.2);
      base.add(frod([x, BASE - 0.5, z], [x, BASE + CAN_H + 1.5, z], 0.42, 6), null, 0xb8c0c6, CHROME);
      base.add(fcyl(0.8, 0.8, 6, 0.85, 0.3), M(x, BASE + CAN_H + 3.4, z), 0x8a9098, STEEL);
      base.add(fcyl(0.8, 0.8, 6, 0.85, 0.3), M(x, BASE + 0.1, z), 0x8a9098, STEEL);
    }
    // ---- the top cap: a stepped brass octagon, a gland, the exhaust valve with its flap and a relief weight
    const capY = BASE + CAN_H;
    base.add(fcyl(CR + 1.9, 2.2, 8, CR + 1.9, 0.25), M(0, capY + 1.1, 0), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? 0xe0b450 : 0xa87a2a), BRASS)
      .add(fcyl(CR - 2, 1.4, 8, CR - 1, 0.3), M(0, capY + 2.9, 0), 0xc89a3a, BRASS)
      .add(fcyl(1.6, 2.4, 6, 1.8, 0.2), M(0, capY + 4.6, 0), 0x6a6e72, STEEL)
      .add(fcyl(1.1, 3.8, 6, 1.1, 0.1), M(3.6, capY + 4.4, 0), 0x9aa2aa, STEEL)
      .add(fcyl(1.4, 3.6, 6, 1.4, 0.1), M(5.6, capY + 6, 0, 0, 0, R90), 0x9aa2aa, STEEL)
      .add(fcyl(1.8, 1, 6, 1.8, 0.3), M(7.6, capY + 6, 0, 0, 0, R90), 0xc0902e, BRASS)
      .add(fbox(0.6, 6, 0.6, 0.2), M(-4, capY + 4.6, 0, 0, 0, -0.35), 0x5a5e62, STEEL)
      .add(fbox(2.4, 1.6, 1.8, 0.25), M(-5.1, capY + 7.4, 0), 0x3a3e42, STEEL);
    b.add(solidMesh(st, base, { wear: 0.6 }));
    // the exhaust flap (hinged, it lifts on every breath out)
    this.valveFlap.position.set(8.2, capY + 6, 0);
    this.valveFlap.add(solidMesh(st, new Mold().add(fbox(0.5, 2.6, 2.6, 0.2), M(0.25, 0, 0), 0x6a4a1a, BRASS)));
    b.add(this.valveFlap);
    // ---- the bellows: an eight-sided accordion of rubber folds (unit height, scaled each frame)
    const prof: number[][] = [[0, 0], [CR - 2.6, 0]];
    for (let i = 0; i < PLEATS; i++) {
      const y0 = i / PLEATS;
      prof.push([CR - 0.7, y0 + 0.5 / PLEATS], [CR - 3.4, y0 + 1 / PLEATS]);
    }
    prof.push([0, 1]);
    const bm = new Mold().add(flathe(prof, 8), null, 0xc8707a, RUBBER);
    this.bellowsGeo = bm.build();
    this.bBase = (this.bellowsGeo.getAttribute('position').array as Float32Array).slice();
    this.bCol = this.bellowsGeo.getAttribute('aCol') as THREE.BufferAttribute;
    this.bellows = new THREE.Mesh(this.bellowsGeo, st.surf('rubber'));
    this.bellows.frustumCulled = false;
    this.bellows.position.y = BASE;
    b.add(this.bellows);
    // the weighted top plate riding on the bellows
    this.topPlate.add(solidMesh(st, new Mold()
      .add(fcyl(CR - 1.2, 1.1, 8, CR - 1, 0.3), M(0, 0.55, 0), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? 0xd8dee4 : 0x8a9298), CHROME)
      .add(fcyl(1.8, 1.4, 6, 2.2, 0.3), M(0, 1.6, 0), 0x6a6e72, STEEL)
      .add(fbox(5.6, 0.7, 1, 0.3), M(0, 1.3, 0), 0x4a4e52, STEEL), { wear: 0.4 }));
    b.add(this.topPlate);
    // ---- the glass canister (drawn after the bellows): octagonal, open, a printed graduation strip
    const glass = new THREE.Mesh(new Mold().add(fcyl(CR, CAN_H, 8, CR, 0, true), M(0, BASE + CAN_H / 2, 0), 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.06, color: 0xdcece6 }));
    glass.renderOrder = 4; b.add(glass);
    const grad = new Mold();
    for (let i = 0; i <= 6; i++) grad.add(fbox(i % 3 === 0 ? 2.2 : 1.2, 0.35, 0.2, 0.2), M(CR * 0.6 - (i % 3 === 0 ? 0.5 : 0), BASE + 3 + i * 3.9, CR * 0.78), 0xe8e4d4, PAINT);
    b.add(solidMesh(st, grad));

    // ---- the console front: the meter, the lamp, the Nixie counter
    const face = this.face = new PrintTex(FW * 2, FH * 2, 1);
    this.paintFace();
    const con = new Mold()
      // bakelite case, a chrome bezel with a clipped-corner window, four screws
      .add(fbox(CW, CH, 2.4, 0.22), M(0, MY, FRONT + 0.6), (_x, y) => (y > MY + CH / 2 - 1 ? 0x4a3020 : 0x2c1c12), PLASTIC)
      .add(plate(clipRect(CW - 1.4, CH - 1.4, 1.8), 0.9, 0.3, [clipRect(FW + 0.3, FH + 0.3, 1.2)]), M(0, MY, FRONT + 1.6), (_x, y) => (y > MY + 2 ? 0xe4e8ea : y > MY - 2.5 ? 0xa8b0b6 : 0x5e6468), CHROME);
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) con.add(fcyl(0.5, 0.5, 6, 0.55, 0.3), M(sx * (CW / 2 - 1.3), MY + sy * (CH / 2 - 1.3), FRONT + 2.6, R90), 0xc0902e, BRASS);
    // the lamp's hex collar (left) and the Nixie's cage socket (right)
    con.add(fcyl(1.9, 1.2, 6, 2.2, 0.25), M(-CW / 2 - 3.4, MY + 1.5, FRONT + 0.6, R90), 0xb8c0c8, CHROME)
      .add(fbox(5.4, 8.4, 2, 0.25), M(CW / 2 + 4, MY, FRONT + 0.4), 0x1a1612, PLASTIC)
      .add(fbox(5.6, 0.8, 2.4, 0.3), M(CW / 2 + 4, MY + 4.2, FRONT + 0.6), 0xc0902e, BRASS)
      .add(fbox(5.6, 0.8, 2.4, 0.3), M(CW / 2 + 4, MY - 4.2, FRONT + 0.6), 0xc0902e, BRASS);
    for (const sx of [-1, 1]) con.add(frod([CW / 2 + 4 + sx * 2.3, MY - 4, FRONT + 1.6], [CW / 2 + 4 + sx * 2.3, MY + 4, FRONT + 1.6], 0.25, 4), null, 0xc0902e, BRASS);
    r.add(solidMesh(st, con, { wear: 0.5 }));
    const faceMesh = new THREE.Mesh(new Mold().add(polyFace(clipRect(FW, FH, 1.1)), null, 0xffffff, PAINT).build(), st.solid({ map: face.tex, wear: 0.2 }));
    faceMesh.position.set(0, MY, FRONT + 1.85); r.add(faceMesh);
    const ng = new Mold()
      .add(fcyl(0.1, FH - 1.6, 4, 0.36, 0), M(0, (FH - 1.6) / 2, 0, 0, 0, 0, 1, 1, 0.45), 0xb8201a, PAINT)
      .add(fcyl(0.8, 0.6, 6, 0.9, 0.3), M(0, 0, 0.2, R90), 0xc0902e, BRASS);
    this.needle = solidMesh(st, ng);
    this.needle.position.set(0, MY - FH / 2 + 0.9, FRONT + 2.1); r.add(this.needle);
    const cover = new THREE.Mesh(new Mold().add(polyFace(clipRect(FW + 0.3, FH + 0.3, 1.2)), null, 0xffffff, GLASS).build(), st.surf('glass', { alpha: 0.04, color: 0xe8f0ee }));
    cover.position.set(0, MY, FRONT + 2.5); cover.renderOrder = 4; r.add(cover);
    this.lampMat = st.solid({ wear: 0.1 });
    const lamp = new THREE.Mesh(new Mold().add(flathe([[1.6, 0], [1.65, 0.5], [1.1, 1.3], [0.55, 1.7], [0, 1.75]], 6), M(0, 0, 0, R90), 0x8a5a20, GLASS, 1).build(), this.lampMat);
    lamp.position.set(-CW / 2 - 3.4, MY + 1.5, FRONT + 1.2); r.add(lamp);
    this.nixie = new PrintTex(8, 12, 2);
    this.paintNixie('');
    const nix = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.4), new THREE.MeshBasicMaterial({ map: this.nixie.tex, transparent: true, depthWrite: false }));
    nix.position.set(CW / 2 + 4, MY, FRONT + 1.5); r.add(nix);
    const tube = new THREE.Mesh(new Mold().add(fcyl(2, 7.6, 6, 2, 0, true), M(CW / 2 + 4, MY, FRONT + 1.6, R90 * 0, 0, 0), 0xe8f4f4, GLASS).build(), st.surf('glass', { alpha: 0.06, color: 0xe0eeea }));
    tube.renderOrder = 4; r.add(tube);
    // ---- the H key: a bakelite cap that pops up beside the canister when the lungs need pumping
    const kt = this.keyTex = new PrintTex(10, 10, 1);
    this.paintKey();
    this.key.add(new THREE.Mesh(new Mold().add(fbox(5, 5, 2.6, 0.2), null, 0xe8dcc0, PLASTIC).build(), st.solid({ map: kt.tex, wear: 0.2 })));
    this.key.position.set(CR + 6, BASE + CAN_H * 0.7, 2); this.key.scale.setScalar(0.01);
    b.add(this.key);
    // ---- pick volumes: the canister, and the meter
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(2 * CR + 6, CAN_H + 12, 18), new THREE.MeshBasicMaterial());
    this.hit.position.set(0, BASE + CAN_H / 2 + 3, 0); this.hit.visible = false; b.add(this.hit);
    this.gaugeHit = new THREE.Mesh(new THREE.BoxGeometry(CW + 14, CH + 2, 6), new THREE.MeshBasicMaterial());
    this.gaugeHit.position.set(2, MY, FRONT + 2); this.gaugeHit.visible = false; r.add(this.gaugeHit);
  }

  /** the meter's printed card: an arc scale OUT..IN over the needle's pivot, a red zone at IN */
  private paintFace() {
    const t = this.face, P = t.pix, W = FW * 2, H = FH * 2;
    const cx = W / 2 - 0.5, cy = H - 1.8 - 0.5, R = H - 4;
    P.clear();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (Math.min(x, W - 1 - x) + Math.min(y, H - 1 - y) < 2) continue;
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      let c = (x * 7 + y * 13) % 17 === 0 ? 0xe4d8b4 : 0xf0e6c8;
      if (e === 0) c = 0x8a7a5a; else if (e === 1) c = 0xd8ccaa;
      if (y < 2 && x > 2 && x < W - 3) c = 0xfff6dc;
      P.set(x, y, c);
    }
    const ang = (k: number) => -SWEEP + k * 2 * SWEEP;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      const a = ang(k), sx = Math.sin(a), sy = -Math.cos(a);
      P.set(Math.round(cx + sx * R), Math.round(cy + sy * R), 0x2a2018);
      if (k > 0.8) P.set(Math.round(cx + sx * (R - 1)), Math.round(cy + sy * (R - 1)), 0xb82a22);
    }
    for (let i = 0; i <= 10; i++) {
      const a = ang(i / 10), sx = Math.sin(a), sy = -Math.cos(a);
      const l = i % 5 === 0 ? 2.6 : 1.3;
      P.line(cx + sx * (R + 0.4), cy + sy * (R + 0.4), cx + sx * (R - l), cy + sy * (R - l), i > 8 ? 0x8a1a12 : 0x2a2018);
    }
    t.commit((c) => {
      inkText(c, 'OUT', 2, H - 2, 7, FONT.sign, '#2a2018', 'left', '600');
      inkText(c, 'IN', W - 2, H - 2, 7, FONT.sign, '#8a1a12', 'right', '600');
    });
  }
  private paintNixie(digit: string) {
    const P = this.nixie.pix; P.clear();
    for (let y = 1; y < 11; y++) for (let x = 1; x < 7; x++) if ((x + y) % 2 === 0) P.set(x, y, 0x3a3634);
    this.nixie.commit(digit ? (c) => {
      // a lit cathode: the digit in hard orange pixels, a darker rim round it (no glow smear)
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) inkText(c, digit, 8 + dx, 19 + dy, 16, FONT.nixie, '#8a2a08', 'center', '600');
      inkText(c, digit, 8, 19, 16, FONT.nixie, '#ffb050', 'center', '600');
    } : undefined);
  }
  private paintKey() { this.keyTex.commit((c) => inkText(c, 'H', 5, 8, 9, FONT.sign, '#2a1a10', 'center', '700')); }
  /** web fonts arrived: print the type again */
  repaintType() { this.paintFace(); this.paintKey(); this.lastDigit = '?'; }

  update(dt: number, L: Lungs, p: Player, panic: number) {
    const t = L.t;
    const b = p.body;
    // how far the bellows stands: the breath (lung.ts's spring), squeezed by a thumb, or the beat while pumping
    const spent = Math.max(0, 0.18 - b.endurance) / 0.18;
    this.stall += ((spent > 0.4 && !L.pumping ? 1 : 0) - this.stall) * Math.min(1, dt * 2);
    let k = L.pumping ? 0.15 + L.pos * 0.85 : Math.max(0, Math.min(1.15, (L.s - 0.3) / 0.85));
    k *= 1 - L.squeeze * 0.55;
    if (this.stall > 0.05) k = k * (1 - this.stall * 0.8) + this.stall * 0.08 * (0.5 + 0.5 * Math.sin(t * 3.1)) ;
    if (b.dead) k = 0;
    const goal = B_MIN + k * (B_MAX - B_MIN);
    // a heavy spring: the plate overshoots and settles; strain makes it heave against the cap
    this.hv += ((goal - this.h) * 140 - this.hv * 16) * dt;
    this.h += this.hv * dt;
    if (L.strain > 0.85) this.h += (Math.random() - 0.5) * 0.6;
    this.h = Math.max(2, Math.min(B_MAX + 0.6, this.h));
    this.bellows.scale.set(1 + (1 - this.h / B_MAX) * 0.06 + L.wob * 0.05 * Math.sin(t * 31), this.h, 1 + (1 - this.h / B_MAX) * 0.06);
    this.topPlate.position.y = BASE + this.h;
    this.topPlate.rotation.z = Math.sin(t * 1.7) * 0.015 + L.wob * 0.06 * Math.sin(t * 23);
    // the exhaust flap lifts while the bellows drops (a breath out)
    const ds = L.s - this.lastS; this.lastS = L.s;
    this.flap += ((ds < -0.002 || L.flashT > 0 ? 1 : 0) - this.flap) * Math.min(1, dt * 12);
    this.valveFlap.rotation.z = -this.flap * 0.9;
    // the pump shudders when over-full or panicking, jumps on a cough
    const shake = (L.strain > 0.8 ? (L.strain - 0.8) * 2.5 : 0) + panic * 0.25 + L.wob * 0.6;
    this.jvx += (-this.jx * 300 - this.jvx * 14) * dt + (Math.random() - 0.5) * shake * 40 * dt * 60 * 0.05;
    this.jx += this.jvx * dt;
    this.body.position.set(this.jx * 0.4, Math.abs(this.jx) * 0.15, 0);
    // rubber colour: livelier when stretched, grey and dull when spent; blood pooled in the bottom folds (10 Hz)
    this.colT -= dt;
    if (this.colT <= 0) {
      this.colT = 0.1;
      const strainK = Math.max(0, L.strain - 0.4) / 0.6;
      const rub = mix(mix(0xc8707a, 0xf09aa6, strainK * 0.6), 0x7a5a5e, Math.max(0, 0.75 - L.cap) * 1.6);
      const B = this.bBase, C = this.bCol.array as Float32Array;
      const lvl = L.stain * 0.7 + Math.sin(t * 3) * 0.01 + L.slosh * 0.02;
      for (let i = 0; i < B.length / 3; i++) {
        const x = B[i * 3], y = B[i * 3 + 1], z = B[i * 3 + 2];
        const rr = Math.hypot(x, z);
        let c = rr < CR - 2.2 ? shade(rub, 0.5) : mix(rub, 0xffd0d4, 0.12); // the inner folds sit in shadow, the outer catch the light
        if (L.stain > 0.01 && y < lvl + x * L.slosh * 0.01) c = mix(c, y > lvl - 0.05 ? 0xc8282e : 0x6a0c14, 0.8);
        C[i * 3] = ((c >> 16) & 255) / 255; C[i * 3 + 1] = ((c >> 8) & 255) / 255; C[i * 3 + 2] = (c & 255) / 255;
      }
      this.bCol.needsUpdate = true;
    }
    // the needle reads air, or swings as the metronome
    const nk = L.pumping ? L.pos : Math.max(0, Math.min(1, b.endurance));
    const target = SWEEP - nk * 2 * SWEEP;
    this.needle.rotation.z += (target - this.needle.rotation.z) * Math.min(1, dt * (L.pumping ? 40 : 6));
    // jewel lamp: green perfect, amber good, red cough / miss
    const lit = L.flashT > 0;
    const lc = !lit ? 0 : !L.flashGood ? 0xff3a20 : L.lastQ === 'perfect' ? 0x7aff6a : 0xffb030;
    const gv = this.lampMat.uniforms.uGlow.value as THREE.Vector3;
    if (lit) gv.set(((lc >> 16) & 255) / 255 * 1.4, ((lc >> 8) & 255) / 255 * 1.4, (lc & 255) / 255 * 1.4); else gv.set(0.12, 0.06, 0.02);
    // Nixie: the streak
    const digit = L.pumping && L.combo > 0 ? String(Math.min(9, L.combo)) : '';
    if (digit !== this.lastDigit) { this.lastDigit = digit; this.paintNixie(digit); }
    // the H key pops up when the lungs need pumping
    const want = !L.pumping && L.hint > 0.05 ? 1 : 0.01;
    const ks = this.key.scale.x + (want - this.key.scale.x) * Math.min(1, dt * 12);
    this.key.scale.setScalar(ks);
    this.key.position.y = BASE + CAN_H * 0.7 + (want > 0.5 ? Math.abs(Math.sin(t * 6)) * 1.2 : 0);
  }

  /** puffs of air (or blood) out of the exhaust valve */
  cubes(C: Cubes, L: Lungs) {
    const ex = 9, ey = BASE + CAN_H + 6;
    for (const q of L.puffs) if (q.on) {
      this.v.set(ex + (q.x - 25) * 0.6 + (2 - q.y) * 0.5, ey + (2 - q.y) * 0.8, 1);
      this.body.localToWorld(this.v); C.mesh.parent?.worldToLocal(this.v);
      C.put(this.v.x, this.v.y, this.v.z, 1, 1, 1, q.life * 4, q.c, Math.min(0.9, q.life * 2));
    }
  }
  /** the pump's top (stage space): where a cough blows out */
  topWorld(out: THREE.Vector3) { out.set(9, BASE + CAN_H + 6, 1); return this.body.localToWorld(out); }
}

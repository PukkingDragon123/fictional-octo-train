// The intake's light director: every lamp on the stage is a fixture with its
// own lit geometry (emitMat), light-shaft cards and a halo, a colour, a
// circuit and a temperament (steady, failing, dead). Real three.js lights are
// few and shared:
//   - a pool of point lights handed each frame to the fixtures that matter
//     most to the camera (bright, near, on);
//   - one shadow-casting key spot the script points at the room it is in
//     (the tube over the body in the wing, the caged lamp over the drain, the
//     work lamp over the press, the rig's lamp, the portal itself);
//   - the red rotating beacon (a spot that sweeps the walls, two beam cones);
//   - the portal's cold glow (a point light, and the caustic web every stage
//     material picks up from SU);
//   - a spark flash for the press, a strobe for the blows, a flare for the
//     band, a dim cold/warm hemisphere fill.
// Beats: blackout (everything dies, then the tubes strike back one by one,
// flickering), brownout (a dip on a slam), surge, strobe, sparks, flare.
// Dust motes drift through the shafts and take their lamp's light.
import * as THREE from 'three';
import { G } from '../G';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { emitMat, glowMat, SU, type EmitMat } from './stageMat';
import { cardGeo, beamGeo } from './fixtures';

export type Temper = 'steady' | 'failing' | 'dead' | 'strobe';
export interface Fixture {
  name: string;
  at: THREE.Vector3;
  col: THREE.Color;
  /** point-light intensity at level 1 and its range */
  power: number; range: number;
  /** emit brightness at level 1 */
  glowK: number;
  circuit: string;
  temper: Temper;
  emit: EmitMat | null;
  shafts: EmitMat[];
  shaftK: number;
  halo: THREE.Mesh | null; haloS: number;
  /** current light level (0 off .. 1 normal), what flicker and beats leave of it */
  level: number;
  /** manual multiplier (script) */
  gain: number;
  // flicker state
  ft: number; fon: boolean; fnext: number; strike: number;
  /** may be given a pooled point light */
  pooled: boolean;
}

/** what a lamp is registered with */
export type FixtureDef = Partial<Omit<Fixture, 'at' | 'col'>> & { name: string; at: THREE.Vector3 | [number, number, number]; col: number };

const HALO_GEO = (() => { let g: THREE.BufferGeometry | null = null; return () => { if (!g) { const mb = new ModelBuilder(); cardGeo(mb, 'ix_halo', 1); g = mb.build(); } return g; }; })();
const tv = new THREE.Vector3(), tw = new THREE.Vector3();

const MOTE_VERT = /* glsl */`
attribute float aK;
varying float vK;
varying vec3 vC;
void main() {
  vK = aK; vC = color;
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = -mv.z < 1.2 ? 2.0 : 1.0;
}
`;
const MOTE_FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
varying float vK;
varying vec3 vC;
void main() { gl_FragColor = vec4(vC * vK, 1.0); gNormal = vec4(0.0); }
`;

export class LightDirector {
  fixtures: Fixture[] = [];
  readonly pool: THREE.PointLight[] = [];
  readonly key: THREE.SpotLight;
  readonly beacon: THREE.SpotLight;
  readonly portal: THREE.PointLight;
  readonly spark: THREE.PointLight;
  readonly strobeL: THREE.PointLight;
  readonly flareL: THREE.PointLight;
  readonly hemi: THREE.HemisphereLight;
  /** circuit power (0 dead .. 1 normal); beats drive it */
  circuits = new Map<string, { p: number; goal: number; hold: number; restrike: boolean }>();
  beaconOn = false; beaconAt = new THREE.Vector3(); beaconSpin = 0; beaconK = 0;
  private beamGroup = new THREE.Group();
  private beamMats: EmitMat[] = [];
  private beaconEmit: EmitMat | null = null;
  private keyGoal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), col: new THREE.Color(), k: 0, angle: 0.8, snap: true };
  private sparkK = 0; private strobeK = 0; private flareK = 0;
  private motes: THREE.Points | null = null;
  private moteF: Fixture[] = []; private moteP: Float32Array | null = null; private moteV: Float32Array | null = null; private moteK: Float32Array | null = null;
  private buzzT = 0;
  t = 0;

  constructor(private root: THREE.Object3D, private low: boolean) {
    const n = low ? 2 : 5;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 6, 1.6); this.pool.push(l); root.add(l); }
    this.key = new THREE.SpotLight(0xdfefff, 0, 9, 0.8, 0.55, 1.4);
    this.key.castShadow = !low;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0006; this.key.shadow.normalBias = 0.02;
    this.key.shadow.camera.near = 0.1; this.key.shadow.camera.far = 12;
    root.add(this.key, this.key.target);
    this.beacon = new THREE.SpotLight(0xff1a0a, 0, 22, 0.32, 0.45, 1.1);
    this.beacon.castShadow = !low;
    this.beacon.shadow.mapSize.set(512, 512);
    this.beacon.shadow.bias = -0.001; this.beacon.shadow.normalBias = 0.03;
    root.add(this.beacon, this.beacon.target);
    this.portal = new THREE.PointLight(0x5ad8ff, 0, 11, 1.3);
    this.spark = new THREE.PointLight(0xffb060, 0, 7, 1.5);
    this.strobeL = new THREE.PointLight(0xf4f8ff, 0, 6, 1.4);
    this.flareL = new THREE.PointLight(0xffa040, 0, 1.4, 2);
    this.hemi = new THREE.HemisphereLight(0x3a4a5a, 0x1a120c, 0.4);
    root.add(this.portal, this.spark, this.strobeL, this.flareL, this.hemi);
    root.add(this.beamGroup);
  }

  /** register a lamp: its lit geometry, light shafts, a halo */
  add(f: FixtureDef, glow?: ModelBuilder, shafts?: ModelBuilder): Fixture {
    const at = Array.isArray(f.at) ? new THREE.Vector3(...f.at) : f.at;
    const col = new THREE.Color(f.col);
    const fx: Fixture = {
      name: f.name, at, col, power: f.power ?? 4, range: f.range ?? 6, glowK: f.glowK ?? 1.6, circuit: f.circuit ?? 'main', temper: f.temper ?? 'steady',
      emit: null, shafts: [], shaftK: f.shaftK ?? 0.12, halo: null, haloS: f.haloS ?? 0.6, level: 1, gain: f.gain ?? 1,
      ft: Math.random() * 3, fon: true, fnext: 0.5 + Math.random() * 2, strike: 0, pooled: f.pooled ?? true,
    };
    if (glow && !glow.isEmpty) {
      fx.emit = emitMat(f.col, fx.glowK);
      const m = new THREE.Mesh(glow.build(), fx.emit);
      m.frustumCulled = false;
      this.root.add(m);
    }
    if (shafts && !shafts.isEmpty) {
      const sm = glowMat(f.col, fx.shaftK, 0.8);
      const m = new THREE.Mesh(shafts.build(), sm);
      m.renderOrder = 6; m.frustumCulled = false;
      this.root.add(m);
      fx.shafts.push(sm);
    }
    if (fx.haloS > 0) {
      const hm = glowMat(f.col, 0.5, 0);
      const h = new THREE.Mesh(HALO_GEO(), hm);
      h.position.copy(at); h.scale.setScalar(fx.haloS); h.renderOrder = 7; h.frustumCulled = false;
      this.root.add(h);
      fx.halo = h;
    }
    if (!this.circuits.has(fx.circuit)) this.circuits.set(fx.circuit, { p: 1, goal: 1, hold: 0, restrike: false });
    this.fixtures.push(fx);
    return fx;
  }

  /** the beacon: its dome's emit material and where it sits */
  setBeacon(at: THREE.Vector3, emit: EmitMat) {
    this.beaconAt.copy(at); this.beaconEmit = emit;
    this.beamGroup.position.copy(at);
    for (const s of [0, Math.PI]) {
      const mb = new ModelBuilder();
      beamGeo(mb, 7, 0.06, 1.1, 6);
      const m = glowMat(0xff2a10, 0, 0.9);
      const mesh = new THREE.Mesh(mb.build(), m);
      mesh.rotation.y = s; mesh.renderOrder = 6; mesh.frustumCulled = false;
      this.beamGroup.add(mesh);
      this.beamMats.push(m);
    }
  }

  /** dust motes in the shafts of these fixtures */
  addMotes(list: Fixture[], per = 18) {
    const n = list.length * per;
    const P = new Float32Array(n * 3), V = new Float32Array(n * 3), C = new Float32Array(n * 3), K = new Float32Array(n);
    this.moteF = [];
    let i = 0;
    for (const f of list) for (let k = 0; k < per; k++, i++) {
      this.moteF.push(f);
      P[i * 3] = f.at.x + (Math.random() - 0.5) * 0.9; P[i * 3 + 1] = Math.random() * f.at.y; P[i * 3 + 2] = f.at.z + (Math.random() - 0.5) * 1.2;
      V[i * 3] = (Math.random() - 0.5) * 0.04; V[i * 3 + 1] = -0.01 - Math.random() * 0.02; V[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
      C[i * 3] = f.col.r; C[i * 3 + 1] = f.col.g; C[i * 3 + 2] = f.col.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('aK', new THREE.BufferAttribute(K, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.motes = new THREE.Points(g, m);
    this.motes.frustumCulled = false; this.motes.renderOrder = 8;
    this.root.add(this.motes);
    this.moteP = P; this.moteV = V; this.moteK = K;
  }

  /** point the shadow-casting key light (snap: jump there, else glide) */
  setKey(pos: THREE.Vector3 | [number, number, number], tgt: THREE.Vector3 | [number, number, number], col: number, k: number, angle = 0.8, snap = false) {
    const g = this.keyGoal;
    Array.isArray(pos) ? g.pos.set(...pos) : g.pos.copy(pos);
    Array.isArray(tgt) ? g.tgt.set(...tgt) : g.tgt.copy(tgt);
    g.col.setHex(col); g.k = k; g.angle = angle; g.snap = snap;
  }

  circuit(name: string) { let c = this.circuits.get(name); if (!c) { c = { p: 1, goal: 1, hold: 0, restrike: false }; this.circuits.set(name, c); } return c; }
  /** the power dies for `secs`, then the tubes strike back one by one */
  blackout(secs: number, names: string[] = [...this.circuits.keys()]) {
    for (const n of names) { const c = this.circuit(n); c.p = 0; c.goal = 0; c.hold = secs; c.restrike = true; }
    for (const f of this.fixtures) if (names.includes(f.circuit)) f.strike = 0;
  }
  /** a dip (a slam on the same supply) */
  brownout(k = 0.25, secs = 0.18, names: string[] = [...this.circuits.keys()]) {
    for (const n of names) { const c = this.circuit(n); c.p = Math.min(c.p, k); c.goal = k; c.hold = secs; c.restrike = false; }
  }
  strobe(k = 1, at?: THREE.Vector3, col = 0xf4f8ff) { this.strobeK = Math.max(this.strobeK, k); if (at) this.strobeL.position.copy(at); this.strobeL.color.setHex(col); }
  sparks(at: THREE.Vector3, k = 1) { this.sparkK = Math.max(this.sparkK, k); this.spark.position.copy(at); }
  flare(at: THREE.Vector3, k = 1) { this.flareK = Math.max(this.flareK, k); this.flareL.position.copy(at); }

  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    // circuits: hold, then recover (a blackout restrikes tube by tube)
    for (const c of this.circuits.values()) {
      if (c.hold > 0) { c.hold -= dt; if (c.hold <= 0) c.goal = 1; }
      else c.p += (c.goal - c.p) * Math.min(1, dt * (c.restrike ? 3 : 10));
    }
    // each fixture's level: its circuit, its temper, its own flicker
    for (const f of this.fixtures) {
      const c = this.circuits.get(f.circuit)!;
      f.ft += dt;
      let lv = 1;
      if (f.temper === 'dead') lv = 0.0;
      else if (f.temper === 'failing') {
        if (f.ft > f.fnext) { f.ft = 0; f.fon = !f.fon; f.fnext = f.fon ? 0.05 + Math.random() * (Math.random() < 0.3 ? 2.2 : 0.4) : 0.03 + Math.random() * 0.12; }
        lv = f.fon ? 0.85 + 0.15 * Math.sin(this.t * 120) : 0.04;
      } else if (f.temper === 'strobe') lv = Math.sin(this.t * 34) > 0 ? 1 : 0.05;
      else lv = 0.96 + 0.04 * Math.sin(this.t * 100 + f.at.z);
      // a tube striking back after a blackout: a few blinks, then on
      if (c.restrike && c.p < 0.98) {
        f.strike += dt;
        const delay = (Math.abs(Math.sin(f.at.z * 3.1 + f.at.x * 1.7)) * 0.9);
        const s = f.strike - delay;
        lv *= s < 0 ? 0 : s < 0.35 ? (Math.sin(s * 70) > 0.2 ? 1 : 0.05) : 1;
        if (c.hold <= 0 && f.strike > 1.6) c.p = 1;
      } else lv *= c.p;
      f.level = lv * f.gain;
      if (f.emit) f.emit.uniforms.uK.value = f.glowK * Math.max(0.03, f.level);
      for (const s of f.shafts) s.uniforms.uK.value = f.shaftK * f.level;
      if (f.halo) {
        f.halo.visible = f.level > 0.05;
        (f.halo.material as EmitMat).uniforms.uK.value = 0.55 * f.level;
        f.halo.quaternion.copy(cam.quaternion);
        f.halo.scale.setScalar(f.haloS * (0.85 + 0.15 * f.level));
      }
    }
    // a failing tube buzzes when it stutters (rate-limited, louder near)
    this.buzzT -= dt;
    if (this.buzzT <= 0) {
      cam.getWorldPosition(tw);
      let best = 99;
      for (const f of this.fixtures) if (f.temper === 'failing' && f.ft < 0.05 && f.fon) best = Math.min(best, f.at.distanceTo(tw));
      if (best < 7) { this.buzzT = 0.35; G.audio?.flat?.('flicker_buzz', 'sfx', 0.35 * (1 - best / 7)); }
    }
    // the pool: the fixtures that light what the camera sees
    cam.getWorldPosition(tw);
    const scored = this.fixtures.filter((f) => f.pooled && f.level > 0.02).map((f) => ({ f, s: f.level * f.power / (1 + f.at.distanceToSquared(tw) * 0.06) })).sort((a, b) => b.s - a.s);
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], e = scored[i];
      if (!e) { l.intensity = 0; continue; }
      l.position.copy(e.f.at); l.color.copy(e.f.col); l.distance = e.f.range;
      l.intensity = e.f.power * e.f.level;
    }
    // the key light
    const kg = this.keyGoal, K = this.key;
    const kk = kg.snap ? 1 : Math.min(1, dt * 4);
    K.position.lerp(kg.pos, kk); K.target.position.lerp(kg.tgt, kk); kg.snap = false;
    K.color.lerp(kg.col, kk); K.angle += (kg.angle - K.angle) * kk;
    // it is the same lamp as the nearest fixture: it flickers with it
    let nearLv = 1, nd = 0.6;
    for (const f of this.fixtures) { const d = f.at.distanceTo(kg.pos); if (d < nd) { nd = d; nearLv = f.level; } }
    K.intensity = kg.k * nearLv;
    K.target.updateMatrixWorld();
    // the beacon: sweeps round; the beams and the dome go with it
    this.beaconK += ((this.beaconOn ? 1 : 0) - this.beaconK) * Math.min(1, dt * 5);
    this.beaconSpin += dt * 3.4;
    const B = this.beacon;
    B.position.copy(this.beaconAt);
    tv.set(Math.cos(this.beaconSpin), -0.22, Math.sin(this.beaconSpin)).multiplyScalar(6).add(this.beaconAt);
    B.target.position.copy(tv); B.target.updateMatrixWorld();
    B.intensity = 38 * this.beaconK;
    this.beamGroup.rotation.y = -this.beaconSpin + Math.PI / 2;
    this.beamGroup.rotation.x = 0;
    this.beamGroup.visible = this.beaconK > 0.02;
    for (const m of this.beamMats) m.uniforms.uK.value = 0.22 * this.beaconK;
    if (this.beaconEmit) this.beaconEmit.uniforms.uK.value = 0.25 + 2.2 * this.beaconK * (0.7 + 0.3 * Math.max(0, Math.cos(this.beaconSpin * 2)));
    // beats decay
    this.sparkK = Math.max(0, this.sparkK - dt * 5);
    this.spark.intensity = 26 * this.sparkK * this.sparkK * (0.7 + 0.3 * Math.random());
    this.strobeK = Math.max(0, this.strobeK - dt * 9);
    this.strobeL.intensity = 30 * this.strobeK;
    this.flareK = Math.max(0, this.flareK - dt * 1.6);
    this.flareL.intensity = 1.1 * this.flareK;
    // the portal's light follows the caustic uniforms
    this.portal.position.copy(SU.uPortPos.value).addScaledVector(SU.uPortN.value, 0.4);
    this.portal.intensity = SU.uPortStr.value * 6 * (0.85 + 0.15 * Math.sin(this.t * 7.3) * Math.sin(this.t * 3.1));
    // motes drift down through the light, take their lamp's level
    if (this.motes && this.moteP) {
      const P = this.moteP, V = this.moteV!, K2 = this.moteK!;
      for (let i = 0; i < this.moteF.length; i++) {
        const f = this.moteF[i];
        P[i * 3] += (V[i * 3] + Math.sin(this.t * 0.7 + i) * 0.01) * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += (V[i * 3 + 2] + Math.cos(this.t * 0.6 + i * 1.3) * 0.01) * dt;
        if (P[i * 3 + 1] < 0.05) { P[i * 3] = f.at.x + (Math.random() - 0.5) * 0.9; P[i * 3 + 1] = f.at.y - 0.1; P[i * 3 + 2] = f.at.z + (Math.random() - 0.5) * 1.2; }
        const dx = P[i * 3] - f.at.x, dz = P[i * 3 + 2] - f.at.z, h = Math.max(0.2, f.at.y - P[i * 3 + 1]);
        const inCone = Math.max(0, 1 - Math.hypot(dx, dz) / (0.35 + h * 0.4));
        K2[i] = f.level * inCone * (0.5 + 0.5 * Math.sin(this.t * 2 + i * 7.1)) * 0.9;
      }
      (this.motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.motes.geometry.getAttribute('aK') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /** the strongest light level of the fixtures in a circuit (for the grade to follow a blackout) */
  circuitLevel(name: string) { return this.circuits.get(name)?.p ?? 1; }
}

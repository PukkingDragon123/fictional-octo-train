// THE CONTAINMENT KIT: the Meridian Institute's secure-room furniture for the
// lab rooms (the codex archive, the control room, unit room 4), on top of the
// set dressing kit (rooms/dress.ts: it shares its builder, so everything
// static still merges into a handful of draws per material) with the pixel
// art of rooms/vaultTex.ts. Every prop is placed by a transform whose local
// +Z faces out into the room (+Y up); floor props stand at y = 0.
//   cell        a containment cell set into a wall: lined recess, its own cold lamp, fog, a specimen,
//               wired glass behind a bolted frame, cell plate, placard, keypad, palm reader, status lamp
//   vitrine     a pedestal case: plinth, brass plate, glass, a top lamp, a floating anomalous object
//   blastDoor   a sealed vault door: hazard-striped leaf, locking wheel, bolt housings, jamb, beacon, locks
//   rack        a server rack: its face (units, drive bays, patch panels) and blinking lamps
//   terminal    a CRT on a wall arm or a desk scrolling redacted text (the monitor bank's tube shader)
//   pipe        a pipe run: elbows, flanges, brackets, marker bands, valves, pressure gauges
//   decon       a decontamination shower: posts, spray ring and bars, grate, strip curtain, pull handle, sign
//   coldStore   dressing for a sample cold store: frost, a red readout, a dewar, cryo signs, a palm reader
//   obsWindow   an observation window: a bolted frame, glass (clear, or a one-way mirror with watchers behind), intercom
//   restraints  a restraint board: shackles on chains, cuffs, a leather strap set; gurney: a strapped trolley
//   placard / sign / crest / keypad / biolock / dossiers / corkboard / stripes / stencil / fog / cables / beacon
//   curio       the anomalous objects themselves (a melted watch, a faceless doll, a cube in a cube, a phone
//               with a knotted cord, a mask, a key too long, a black shard, a jar of teeth, an hourglass that
//               runs up, the melted gummy bear) and blob (the split-bear itself, life size)
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, extrude, hull, tube, bolt, gem, C, LedBank, blink, busy, glowCard, plate, crtSet, type V3 } from '../monitor/props';
import { band as ring, jitter, flat } from '../scene/facet';
import { feedTube, type FeedTube } from '../monitor/feed';
import { shaftMesh } from '../scene/fx';
import type { Dresser } from './dress';
import type { SinRank } from '../../../creatures/lore';
import {
  placardTex, signTex, crestTex, pageTex, folderTex, wiredGlassTex, rackTex, keypadTex, bioTex, readoutTex, frostTex, stencilTex, pipeBandTex,
  paddedTex, evidenceTex, lockerTex, RedactScreen, RANK_COL, rng, type SignKind,
} from './vaultTex';

const T = (m: THREE.Matrix4, l: THREE.Matrix4) => m.clone().multiply(l);
/** a transform at p whose local +Z is z and whose +X lies along xHint (made square to z) */
function basis(p: THREE.Vector3, z: THREE.Vector3, xHint: THREE.Vector3): THREE.Matrix4 {
  const Z = z.clone().normalize();
  let X = xHint.clone().addScaledVector(Z, -xHint.dot(Z));
  if (X.lengthSq() < 1e-6) X = new THREE.Vector3(0, 1, 0).cross(Z);
  X.normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p);
}
const P = (m: THREE.Matrix4, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
let seedN = 4100;

export type CurioKind = 'watch' | 'doll' | 'cube' | 'phone' | 'mask' | 'key' | 'shard' | 'jar' | 'hourglass' | 'gummy';
export const CURIO_NAME: Record<CurioKind, string> = {
  watch: 'THE LATE WATCH', doll: 'FACELESS DOLL', cube: 'NESTED CUBE', phone: 'THE CALLER', mask: 'SMILING MASK', key: 'LONG KEY',
  shard: 'BLACK SHARD', jar: 'JAR OF TEETH', hourglass: 'UPHILL GLASS', gummy: 'GUMMY RESIDUE',
};

// shared materials (one per texture, kept for the page's life: these rooms are built once)
const texMats = new Map<string, THREE.Material>();
function texMat(tex: THREE.Texture, kind: 'std' | 'emit' | 'alpha' | 'emitAlpha' = 'std'): THREE.Material {
  const k = tex.uuid + kind;
  let m = texMats.get(k);
  if (!m) {
    m = kind === 'emit' || kind === 'emitAlpha'
      ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: kind === 'emitAlpha', depthWrite: kind !== 'emitAlpha' })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.06, transparent: kind === 'alpha', alphaTest: kind === 'alpha' ? 0.35 : 0, depthWrite: kind !== 'alpha' });
    texMats.set(k, m);
  }
  return m;
}
/** a textured card facing +Z */
export function card(tex: THREE.Texture, w: number, h: number, kind: 'std' | 'emit' | 'alpha' | 'emitAlpha' = 'std'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), texMat(tex, kind));
  m.receiveShadow = kind === 'std' || kind === 'alpha';
  if (kind === 'emit' || kind === 'emitAlpha') m.userData.noGlow = true;
  return m;
}

// ------------------------------------------------------------------ ground fog
const FOG_V = 'varying vec2 vW; varying vec2 vU; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; vU = uv; gl_Position = projectionMatrix * viewMatrix * w; }';
const FOG_F = `uniform float uTime, uK, uSeed; uniform vec3 uColor; varying vec2 vW; varying vec2 vU;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    vec2 p = vW * 0.9 + vec2(uTime * 0.05, uTime * 0.017) + uSeed;
    float v = n(p) * 0.55 + n(p * 2.1 - uTime * 0.04) * 0.3 + n(p * 4.3 + 7.0) * 0.15;
    v = smoothstep(0.32, 0.85, v);
    vec2 e = min(vU, 1.0 - vU);
    float edge = smoothstep(0.0, 0.18, e.x) * smoothstep(0.0, 0.18, e.y);
    // quantised to a few levels with a 4x4 dither in screen pixels: pixel-art fog, not a gradient
    float a = v * edge * uK;
    vec2 q = floor(gl_FragCoord.xy);
    float d = fract((mod(q.x, 4.0) * 4.0 + mod(q.y, 4.0)) * 0.0625 * 7.0);
    a = floor(a * 10.0 + d) / 10.0;
    gl_FragColor = vec4(uColor * a, 1.0);
  }`;
export function fogLayer(w: number, d: number, color = 0x8aa0b8, k = 0.12, seed = 0): { mesh: THREE.Mesh; u: { uTime: { value: number } } } {
  const u = { uTime: { value: 0 }, uK: { value: k }, uSeed: { value: seed }, uColor: { value: new THREE.Color(color) } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: FOG_V, fragmentShader: FOG_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 3; mesh.userData.noGlow = true; mesh.frustumCulled = false;
  return { mesh, u };
}

// ------------------------------------------------------------------ the kit
export interface Anim { o: THREE.Object3D; f: (o: THREE.Object3D, t: number, dt: number) => void }

export class Vault {
  readonly group = new THREE.Group();
  readonly leds: LedBank;
  private b: FacetBuilder;
  private anims: Anim[] = [];
  private screens: RedactScreen[] = [];
  private tubes: FeedTube[] = [];
  private fogs: { uTime: { value: number } }[] = [];
  private beacons: { spin: THREE.Object3D; ph: number }[] = [];
  private glass: THREE.Texture | null = null;
  /** world points of the cells' and the cases' own lamps (the room may hang a light at one) */
  readonly lamps: { p: THREE.Vector3; color: number; kind: string }[] = [];

  constructor(private d: Dresser, private mats: FMats, maxLeds = 420) {
    this.b = d.b;
    this.leds = new LedBank(maxLeds);
    this.group.name = 'vault';
    this.group.add(this.leds.mesh);
    d.group.add(this.group);
  }
  private add(o: THREE.Object3D, m?: THREE.Matrix4) { if (m) o.applyMatrix4(m); this.group.add(o); return o; }
  private wired() { return this.glass ??= wiredGlassTex(); }
  private led(m: THREE.Matrix4, x: number, y: number, z: number, color: number, o: { size?: number; pattern?: (t: number) => number; level?: number } = {}) {
    if (this.leds.leds.length >= this.leds.mesh.instanceMatrix.count - 1) return null;
    return this.leds.add(P(m, x, y, z), color, { size: o.size ?? 0.01, pattern: o.pattern, level: o.level ?? 1 });
  }
  /** a pooled redaction screen (a few shared per room keeps the canvas work down) */
  private screen(i: number, head: string): RedactScreen {
    const k = i % 3;
    return this.screens[k] ??= new RedactScreen(head, 11 + k * 7);
  }
  private bolts(m: THREE.Matrix4, w: number, h: number, z: number, step = 0.16, r = 0.012) {
    for (let x = -w / 2; x <= w / 2 + 1e-3; x += w / Math.max(1, Math.round(w / step))) for (const y of [-h / 2, h / 2]) this.b.add('metal', bolt(r, r * 0.7), C.steel, T(m, at(x, y, z, Math.PI / 2)));
    for (let y = -h / 2 + h / Math.max(1, Math.round(h / step)); y < h / 2 - 1e-3; y += h / Math.max(1, Math.round(h / step))) for (const x of [-w / 2, w / 2]) this.b.add('metal', bolt(r, r * 0.7), C.steel, T(m, at(x, y, z, Math.PI / 2)));
  }

  // ================================================================ signage
  /** a containment placard on a riveted steel backing (w wide, 160:224) */
  placard(m: THREE.Matrix4, rank: SinRank, o: { cls?: string; cell?: string; w?: number } = {}) {
    const w = o.w ?? 0.3, h = w * 1.4;
    this.b.add('metal', cbox(w + 0.03, h + 0.03, 0.012, 0.004), 0x2a2e32, T(m, at(0, 0, 0.006)));
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.b.add('chrome', bolt(0.007, 0.005), 0xffffff, T(m, at(sx * (w / 2 + 0.006), sy * (h / 2 + 0.006), 0.012, Math.PI / 2)));
    this.add(card(placardTex(rank, { cls: o.cls, cell: o.cell }), w, h), T(m, at(0, 0, 0.0135)));
  }
  /** a warning sign (w wide, 96:120) */
  sign(m: THREE.Matrix4, kind: SignKind, w = 0.22) {
    const h = w * 1.25;
    this.b.add('metal', cbox(w + 0.012, h + 0.012, 0.008, 0.003), 0x3a3e42, T(m, at(0, 0, 0.004)));
    this.add(card(signTex(kind), w, h), T(m, at(0, 0, 0.0085)));
  }
  /** the Institute's crest, cast: a bronze rim, a dark enamel field, the seal in gilt (r = radius) */
  crest(m: THREE.Matrix4, r = 0.25) {
    this.b.add('brass', lathe([[0, 0], [r * 1.08, 0], [r * 1.1, r * 0.06], [r * 1.02, r * 0.12], [r * 0.96, r * 0.1], [0, r * 0.1]], 24), 0xc8a060, T(m, at(0, 0, 0, Math.PI / 2)));
    this.b.add('bakelite', prism(r * 0.96, 0.012, 24), 0x1a2a3a, T(m, at(0, 0, r * 0.1, Math.PI / 2)));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; this.b.add('brass', bolt(r * 0.03, r * 0.02), 0xd8b070, T(m, at(Math.cos(a) * r * 1.03, Math.sin(a) * r * 1.03, r * 0.11, Math.PI / 2))); }
    this.add(card(crestTex(96, '#e8c878', '#2a3a4c'), r * 1.9, r * 1.9, 'alpha'), T(m, at(0, 0, r * 0.1 + 0.008)));
  }
  /** a keypad on its housing */
  keypad(m: THREE.Matrix4) {
    this.b.add('metal', cbox(0.11, 0.155, 0.035, 0.008), 0x3a3e42, T(m, at(0, 0, 0.017)));
    this.add(card(kp ??= keypadTex(), 0.09, 0.135), T(m, at(0, 0, 0.0355)));
    this.led(m, 0.04, 0.072, 0.036, 0xff3a1a, { size: 0.005, pattern: blink(0.7, 0.85) });
  }
  /** a palm reader: a hooded glass plate that glows */
  biolock(m: THREE.Matrix4) {
    this.b.add('metal', cbox(0.12, 0.17, 0.05, 0.01), 0x2a2e32, T(m, at(0, 0, 0.025)));
    this.b.add('metal', cbox(0.13, 0.02, 0.07, 0.006), 0x2a2e32, T(m, at(0, 0.09, 0.04)));
    this.add(card(bio ??= bioTex(), 0.1, 0.15, 'emit'), T(m, at(0, 0, 0.0505)));
    this.led(m, -0.045, 0.072, 0.052, 0x3aff6a, { size: 0.005, pattern: blink(0.25, 0.1) });
  }
  /** a status lamp: a caged dome over a bulb (red, amber or green), steady or blinking */
  lamp(m: THREE.Matrix4, color = 0xff2a1a, pattern?: (t: number) => number) {
    this.b.add('metal', prism(0.035, 0.02, 8), C.darker, T(m, at(0, 0, 0.01, Math.PI / 2)));
    for (let i = 0; i < 4; i++) this.b.add('metal', cbox(0.004, 0.004, 0.05, 0.001), C.dark, T(m, at(Math.cos(i * 1.57) * 0.03, Math.sin(i * 1.57) * 0.03, 0.04)));
    this.b.add('lamp', lathe([[0.026, 0], [0.026, 0.02], [0.014, 0.04], [0, 0.044]], 8), C.dark, T(m, at(0, 0, 0.02, Math.PI / 2)));
    this.led(m, 0, 0, 0.05, color, { size: 0.022, pattern });
  }
  /** a caged ceiling downlight (m at the ceiling, hanging down -Y): the room hangs its spot under it */
  downlight(m: THREE.Matrix4, color = 0xe8f0ff) {
    const b = this.b;
    b.add('metal', prism(0.006, 0.3, 4), C.dark, T(m, at(0, -0.15, 0)));
    b.add('enamel', lathe([[0.2, -0.12], [0.16, -0.06], [0.08, -0.01], [0, 0]], 10), 0x4a5a52, T(m, at(0, -0.3, 0)));
    b.add('lamp', lathe([[0, -0.16], [0.07, -0.14], [0.1, -0.12], [0, -0.12]], 8), color, T(m, at(0, -0.3, 0)));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add('metal', cbox(0.006, 0.08, 0.006, 0.001), C.dark, T(m, at(Math.cos(a) * 0.15, -0.46, Math.sin(a) * 0.15))); }
    b.add('metal', ring(0.15, 0.15, 0.006, 0.006, 10), C.dark, T(m, at(0, -0.5, 0)));
  }
  /** a rotating beacon on a bracket (its beam sweeps the wall) */
  beacon(m: THREE.Matrix4, color = 0xff2a14) {
    this.b.add('metal', cbox(0.12, 0.03, 0.14, 0.008), C.darker, T(m, at(0, 0, 0.07)));
    this.b.add('metal', prism(0.06, 0.04, 10), 0x2a2a2a, T(m, at(0, 0.035, 0.09)));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; this.b.add('metal', prism(0.004, 0.12, 4), C.dark, T(m, at(Math.cos(a) * 0.062, 0.115, 0.09 + Math.sin(a) * 0.062))); }
    this.b.add('metal', band(0.064, 0.064, 0.008, 0.006, 12), C.dark, T(m, at(0, 0.17, 0.09)));
    const dome = new THREE.Mesh(lathe([[0.056, 0], [0.056, 0.08], [0.04, 0.12], [0, 0.13]], 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), toneMapped: false, transparent: true, opacity: 0.85 }));
    dome.userData.noGlow = true; this.add(dome, T(m, at(0, 0.055, 0.09)));
    // the reflector inside and its beam, turning together
    const spin = new THREE.Group();
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), toneMapped: false, side: THREE.DoubleSide }));
    refl.position.y = 0.04; refl.userData.noGlow = true; spin.add(refl);
    const beamG = new THREE.PlaneGeometry(1.6, 0.18, 4, 1); beamG.translate(0.82, 0.04, 0);
    const col = new Float32Array(beamG.attributes.position.count * 3); const cc = new THREE.Color(color);
    for (let i = 0; i < beamG.attributes.position.count; i++) { const x = beamG.attributes.position.getX(i), f = Math.max(0, 1 - x / 1.6) * 0.5 * (Math.abs(beamG.attributes.position.getY(i) - 0.04) < 0.05 ? 1 : 0.2); col[i * 3] = cc.r * f; col[i * 3 + 1] = cc.g * f; col[i * 3 + 2] = cc.b * f; }
    beamG.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    beam.userData.noGlow = true; beam.renderOrder = 3; spin.add(beam);
    this.add(spin, T(m, at(0, 0.055, 0.09)));
    this.beacons.push({ spin, ph: (seedN++ % 7) * 0.9 });
    this.lamps.push({ p: P(m, 0, 0.1, 0.09), color, kind: 'beacon' });
  }
  /** 0..1: how much a beacon's beam faces the room now (a pulsing light can follow it) */
  beaconK(t: number) { return Math.pow(Math.max(0, Math.sin(t * 4.2)), 3); }

  // ================================================================ paper
  /** a scatter of dossiers on a surface (m at the surface, +Y up): folders, an open file, loose redacted pages */
  dossiers(m: THREE.Matrix4, w: number, d: number, o: { n?: number; rank?: SinRank; seed?: number; open?: boolean } = {}) {
    const R = rng(o.seed ?? seedN++);
    const n = o.n ?? 3;
    const ranks: SinRank[] = ['sloth', 'gluttony', 'lust', 'greed', 'envy', 'wrath', 'pride'];
    const spot = () => [(R() - 0.5) * (w - 0.24), (R() - 0.5) * (d - 0.3)] as const;
    let y = 0.002;
    for (let i = 0; i < n; i++) {
      const [x, z] = spot(), ry = (R() - 0.5) * 0.9;
      const M = T(m, at(x, y, z, 0, ry));
      this.b.add('sponge', cbox(0.23, 0.012, 0.3, 0.002), 0xc8a868, T(M, at(0, 0.006, 0)));
      this.b.add('sponge', cbox(0.08, 0.008, 0.03, 0.002), 0xc8a868, T(M, at(-0.06, 0.006, -0.16)));
      this.add(card(folderTex(Math.floor(R() * 9999), o.rank ?? ranks[Math.floor(R() * 7)]), 0.22, 0.29), T(M, at(0, 0.0125, 0, -Math.PI / 2)));
      y += 0.0125;
    }
    if (o.open !== false) {
      // an open file: the folder's two leaves, a page on each
      const [x, z] = spot(), ry = (R() - 0.5) * 0.4;
      const M = T(m, at(x, 0.002, z, 0, ry));
      this.b.add('sponge', cbox(0.46, 0.004, 0.3, 0.001), 0xc8a868, T(M, at(0, 0.002, 0)));
      this.add(card(pageTex(Math.floor(R() * 9999), { photo: true, rank: o.rank }), 0.2, 0.27), T(M, at(-0.11, 0.0045, 0, -Math.PI / 2)));
      this.add(card(pageTex(Math.floor(R() * 9999), { photo: false }), 0.2, 0.27), T(M, at(0.115, 0.0047, 0.004, -Math.PI / 2, 0, 0.05)));
    }
    for (let i = 0; i < 2; i++) { const [x, z] = spot(); this.add(card(pageTex(Math.floor(R() * 9999), { photo: R() < 0.4 }), 0.2, 0.27), T(m, at(x, 0.02 + i * 0.001, z, -Math.PI / 2, 0, (R() - 0.5) * 1.2))); }
  }
  /** an evidence board on the wall: a wooden frame round pinned photographs, cards and red string */
  corkboard(m: THREE.Matrix4, w = 1.2, h = 0.75) {
    this.b.add('wood', cbox(w + 0.06, h + 0.06, 0.03, 0.008), 0x5a3a22, T(m, at(0, 0, 0.015)));
    this.add(card(evidenceTex(seedN++, Math.round(w * 160), Math.round(h * 160)), w, h), T(m, at(0, 0, 0.031)));
    this.b.add('wood', cbox(w * 0.6, 0.02, 0.05, 0.004), 0x5a3a22, T(m, at(0, -h / 2 - 0.04, 0.03)));
    this.b.add('bakelite', prism(0.006, 0.12, 5), 0xc8301e, T(m, at(-0.1, -h / 2 - 0.022, 0.04, 0, 0, Math.PI / 2)));
  }

  // ================================================================ floor
  /** a hazard band on the floor between two corners (world, axis aligned) */
  stripes(x0: number, z0: number, x1: number, z1: number, y = 0.003) {
    this.b.add('hazard', cbox(Math.abs(x1 - x0), 0.004, Math.abs(z1 - z0), 0.001), 0xffffff, at((x0 + x1) / 2, y, (z0 + z1) / 2), { rep: 0.22 });
  }
  /** a word stencilled on the floor (h = letter height in metres), turned ry */
  stencil(x: number, z: number, text: string, h = 0.12, ry = 0, col = '#e8c228') {
    const tex = stencilTex(text, col), img = tex.image as HTMLCanvasElement;
    const k = h / 15, mesh = card(tex, img.width * k, img.height * k, 'alpha');
    (mesh.material as THREE.MeshStandardMaterial).polygonOffset = true; (mesh.material as THREE.MeshStandardMaterial).polygonOffsetFactor = -2;
    mesh.rotation.set(-Math.PI / 2, 0, ry); mesh.position.set(x, 0.004, z); mesh.renderOrder = 1;
    this.group.add(mesh);
  }
  /** a bank of low fog over the floor (a few drifting dithered layers) */
  fog(x0: number, x1: number, z0: number, z1: number, o: { y?: number; color?: number; k?: number; layers?: number } = {}) {
    const n = o.layers ?? 3;
    for (let i = 0; i < n; i++) {
      const f = fogLayer(x1 - x0, z1 - z0, o.color ?? 0x8aa0bc, (o.k ?? 0.1) * (1 - i * 0.22), seedN++ * 1.7);
      f.mesh.position.set((x0 + x1) / 2, (o.y ?? 0.05) + i * 0.16, (z0 + z1) / 2);
      this.group.add(f.mesh); this.fogs.push(f.u);
    }
  }
  /** a bundle of cables slung between two points (n strands, tied) */
  cables(a: V3, z: V3, n = 4, sag = 0.3, r = 0.01) {
    const cols = [0x1a1a1a, 0x2a2a2a, 0x8a2a1a, 0x2a4a8a, 0x5a5a3a, 0xd8c8a0];
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * r * 2.4;
      this.d.droop([a[0] + o, a[1] - Math.abs(o), a[2] + o * 0.5], [z[0] + o, z[1] - Math.abs(o), z[2] - o * 0.5], sag + (i % 2) * 0.04, r, cols[(i * 5) % cols.length]);
    }
  }

  // ================================================================ pipes
  /** a pipe run through world points: elbows, flanges every ~1.4 m, wall brackets, a marker band; valves / gauges at the given point indices */
  pipe(pts: V3[], r: number, color: number, o: { band?: [string, number]; valves?: number[]; gauges?: number[]; out?: V3; key?: 'paint' | 'rust' | 'metal' | 'copper' } = {}) {
    const key = o.key ?? 'paint', out = new THREE.Vector3(...(o.out ?? [0, 0, 1]));
    for (let i = 0; i < pts.length - 1; i++) {
      const A = new THREE.Vector3(...pts[i]), B = new THREE.Vector3(...pts[i + 1]), L = A.distanceTo(B);
      if (L < 1e-3) continue;
      const dir = B.clone().sub(A).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const M = (k: number) => new THREE.Matrix4().compose(A.clone().addScaledVector(dir, k), q, new THREE.Vector3(1, 1, 1));
      this.b.add(key, prism(r, L, 8), color, M(L / 2), { rep: 0.4 });
      const nf = Math.max(0, Math.floor(L / 1.4));
      for (let f = 1; f <= nf; f++) {
        const k = (f * L) / (nf + 1);
        this.b.add('metal', prism(r * 1.45, 0.025, 8), C.steel, M(k));
        for (let bi = 0; bi < 6; bi++) { const a = (bi / 6) * Math.PI * 2; this.b.add('metal', bolt(r * 0.16, r * 0.12), C.steel, T(M(k), at(Math.cos(a) * r * 1.25, 0.014, Math.sin(a) * r * 1.25))); }
        // a bracket back to the wall
        const p = A.clone().addScaledVector(dir, k + 0.12);
        this.b.add('metal', cbox(r * 2.6, 0.03, r * 2.6, 0.004), C.dark, new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
        this.b.add('metal', prism(0.008, r * 2.2, 4), C.dark, new THREE.Matrix4().compose(p.clone().addScaledVector(out, -r * 1.6), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out), new THREE.Vector3(1, 1, 1)));
      }
      if (i > 0) this.b.add(key, lathe([[0, -r * 1.1], [r * 1.08, -r * 0.6], [r * 1.12, 0], [r * 1.08, r * 0.6], [0, r * 1.1]], 8), color, at(A.x, A.y, A.z));
      if (o.band && i === 0) {
        const k = Math.min(L * 0.5, 0.6), p = A.clone().addScaledVector(dir, k);
        this.b.add('paint', prism(r * 1.04, 0.09, 8), o.band[1], new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
        const tex = pipeBandTex(o.band[0], o.band[1]), img = tex.image as HTMLCanvasElement;
        const c = card(tex, (img.width / img.height) * 0.05, 0.05);
        c.applyMatrix4(basis(p.clone().addScaledVector(out, r * 1.06), out, dir));
        this.group.add(c);
      }
    }
    for (const i of o.valves ?? []) { const A = new THREE.Vector3(...pts[i]), B = new THREE.Vector3(...pts[Math.min(pts.length - 1, i + 1)]); this.valve(basis(A.clone().lerp(B, 0.3), out, B.clone().sub(A)), r); }
    for (const i of o.gauges ?? []) {
      const A = new THREE.Vector3(...pts[i]), B = new THREE.Vector3(...pts[Math.min(pts.length - 1, i + 1)]), p = A.lerp(B, 0.7);
      const g = p.clone().addScaledVector(out, r + 0.05);
      this.b.add('brass', prism(0.008, r + 0.05, 6), 0xffffff, new THREE.Matrix4().compose(p.clone().addScaledVector(out, (r + 0.05) / 2), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out), new THREE.Vector3(1, 1, 1)));
      const ry = Math.atan2(out.x, out.z);
      const base = 0.35 + (seedN++ % 5) * 0.08;
      this.d.dial(at(g.x, g.y, g.z, 0, ry), 0.05, 'psi', (t) => base + Math.sin(t * 0.7 + base * 9) * 0.04 + (Math.sin(t * 13 + base) > 0.98 ? 0.06 : 0));
    }
  }
  /** a handwheel valve (m: wheel facing +Z), red */
  valve(m: THREE.Matrix4, r = 0.05) {
    const R = Math.max(0.07, r * 1.8);
    this.b.add('metal', hull([[-r * 1.3, -r * 1.2, -r], [r * 1.3, -r * 1.2, -r], [-r * 1.3, r * 1.2, -r], [r * 1.3, r * 1.2, -r], [-r, -r, r * 0.9], [r, -r, r * 0.9], [-r, r, r * 0.9], [r, r, r * 0.9]]), 0x6a5a4a, m.clone());
    this.b.add('metal', prism(0.01, r + 0.08, 6), C.steel, T(m, at(0, 0, r + 0.04, Math.PI / 2)));
    this.b.add('paint', ring(R, R, 0.016, 0.016, 12), 0xb82a1e, T(m, at(0, 0, r + 0.08, Math.PI / 2)));
    for (let i = 0; i < 4; i++) this.b.add('paint', cbox(0.01, R * 2, 0.01, 0.002), 0xb82a1e, T(m, at(0, 0, r + 0.08, 0, 0, (i * Math.PI) / 4 + 0.3)));
    this.b.add('metal', bolt(0.02, 0.02), C.steel, T(m, at(0, 0, r + 0.085, Math.PI / 2)));
  }

  // ================================================================ machines
  /** a 42U server rack standing at m (front +Z): carcass, perforated door frame, the face, blinking lamps, a cable plume */
  rack(m: THREE.Matrix4, o: { seed?: number; w?: number; h?: number; label?: string; plume?: boolean; hinge?: 1 | -1 } = {}) {
    const w = o.w ?? 0.6, h = o.h ?? 2.0, d = 0.8;
    const b = this.b;
    b.add('paint', cbox(w, h, d, 0.012), 0x1e2226, T(m, at(0, h / 2, 0)), { rep: 0.4 });
    b.add('metal', cbox(w + 0.01, 0.06, d + 0.01, 0.01), 0x2a2e32, T(m, at(0, h + 0.03, 0)));
    for (let i = 0; i < 6; i++) b.add('metal', cbox(w * 0.8, 0.006, 0.04, 0.002), 0x0a0a0c, T(m, at(0, h + 0.062, -d / 2 + 0.1 + i * 0.12)));
    b.add('rubber', cbox(w - 0.04, 0.06, d - 0.04, 0.008), 0x101010, T(m, at(0, 0.03, 0)));
    // the open door frame (hinged left, or right with hinge 1, swung out) with its perforated panels
    const hg = o.hinge ?? -1;
    const door = hg < 0 ? T(m, at(-w / 2, h / 2 + 0.03, d / 2 + 0.01, 0, -1.9)) : T(m, at(w / 2, h / 2 + 0.03, d / 2 + 0.01, 0, Math.PI + 1.9));
    b.add('metal', extrude([[0, -h / 2 + 0.05], [w, -h / 2 + 0.05], [w, h / 2 - 0.02], [0, h / 2 - 0.02]], 0.02, 0.004, [[[0.04, -h / 2 + 0.1], [w - 0.04, -h / 2 + 0.1], [w - 0.04, h / 2 - 0.07], [0.04, h / 2 - 0.07]]]), 0x2a2e32, door);
    for (let y = -h / 2 + 0.14; y < h / 2 - 0.08; y += 0.05) b.add('metal', cbox(w - 0.08, 0.012, 0.006, 0.002), 0x1a1c1e, T(door, at(w / 2, y, 0)));
    b.add('chrome', cbox(0.02, 0.18, 0.03, 0.005), 0xffffff, T(door, at(w - 0.03, 0, 0.02)));
    // the face and its lamps
    const face = rackTex(o.seed ?? seedN++);
    this.add(card(face.tex, w - 0.04, h - 0.1), T(m, at(0, h / 2 + 0.02, d / 2 - 0.02)));
    const pats = [undefined, busy(seedN, 9), blink(1.3, 0.5, 0.2), busy(seedN + 3, 3)];
    for (const L of face.leds) this.led(m, (L.u - 0.5) * (w - 0.04), h / 2 + 0.02 + (L.v - 0.5) * (h - 0.1), d / 2 - 0.016, L.color, { size: 0.0045, pattern: pats[L.kind] ?? busy(seedN++, 5) });
    // a label, a cable plume out of the roof
    const lab = plate(this.mats, [o.label ?? 'RACK ' + String(seedN % 40).padStart(2, '0')], 0.2, 0.05, { bg: 0xe8e2c8, px: 520 });
    lab.applyMatrix4(T(m, at(0, h - 0.04, d / 2 + 0.002))); this.group.add(lab);
    if (o.plume !== false) for (let i = 0; i < 5; i++) b.add('rubber', tube([[(i - 2) * 0.05, h, -0.2], [(i - 2) * 0.06, h + 0.25, -0.25], [(i - 2) * 0.07, h + 0.5, -0.3 - i * 0.04]], 0.012, 6, 4), [0x1a1a1a, 0x2a4a8a, 0x1a1a1a, 0xc8a028, 0x2a2a2a][i], m.clone());
    // the lamps' spill on the floor in front
    const spill = glowCard(w * 1.6, 0.9, 0x6ab8ff, 0.07); spill.applyMatrix4(T(m, at(0, 0.006, d / 2 + 0.4, -Math.PI / 2))); this.group.add(spill);
    this.lamps.push({ p: P(m, 0, h * 0.6, d / 2 + 0.3), color: 0x3aff7a, kind: 'rack' });
  }
  /** a CRT terminal scrolling redacted text: on a wall arm (m on the wall) or standing on a desk (m on the surface) */
  terminal(m: THREE.Matrix4, o: { w?: number; arm?: number; tint?: number; head?: string; i?: number; color?: number } = {}) {
    const w = o.w ?? 0.34, h = w * 0.82, b = this.b;
    let base = m;
    if (o.arm) {
      // a wall plate, a swing arm out to the set
      b.add('metal', cbox(0.12, 0.18, 0.02, 0.006), C.darker, T(m, at(0, 0, 0.01)));
      b.add('metal', tube([[0, 0, 0.02], [0, -0.02, o.arm * 0.5], [0, 0.0, o.arm]], 0.018, 6, 6), C.dark, m.clone());
      b.add('metal', cbox(0.16, 0.02, 0.18, 0.006), C.dark, T(m, at(0, -0.02, o.arm)));
      base = T(m, at(0, -0.01, o.arm));
    }
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    base.decompose(pos, q, s);
    const ry = new THREE.Euler().setFromQuaternion(q, 'YXZ').y, dep = w * 0.8;
    // m is the footprint's centre: the face stands half the set's depth forward of it
    const spot = crtSetAt(b, pos.x + Math.sin(ry) * dep * 0.5, pos.y + h / 2 + 0.01, pos.z + Math.cos(ry) * dep * 0.5, w, h, ry, o.color ?? 0x3a3e40);
    const tb = feedTube(spot.sw, spot.sh, 128, 96, o.tint ?? 0x9dff9a);
    tb.mesh.applyMatrix4(spot.m);
    const scr = this.screen(o.i ?? this.tubes.length, o.head ?? 'MERIDIAN NET');
    tb.setFeed(scr.tex, false); tb.mat.uniforms.uGain.value = 1.5;
    this.group.add(tb.mesh); this.tubes.push(tb);
    this.lamps.push({ p: spot.center.clone().add(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(0.3)), color: o.tint ?? 0x9dff9a, kind: 'crt' });
  }

  // ================================================================ cells and cases
  /**
   * A containment cell set into a wall. m sits on the wall face at the
   * opening's foot (room side +Z); the recess runs back to -d. The room must
   * leave the wall open over [-w/2, w/2] x [0, h].
   */
  cell(m: THREE.Matrix4, o: { w?: number; h?: number; d?: number; rank: SinRank; cls?: string; id: string; holds: CurioKind | 'blob' | 'restraint' | 'chains' | 'empty'; light?: number; lining?: 'padded' | 'tile' | 'steel'; side?: 1 | -1 }) {
    const w = o.w ?? 1.1, h = o.h ?? 2.0, d = o.d ?? 1.0, b = this.b, lc = o.light ?? 0xbfe4ff;
    const sd = o.side ?? 1;
    // the recess: floor, ceiling, walls (lined), a drain, the lamp
    b.add('concrete', cbox(w + 0.04, 0.04, d, 0.004), 0x5a5e5c, T(m, at(0, -0.02, -d / 2)));
    b.add('concrete', cbox(w + 0.04, 0.06, d, 0.004), 0x3a3c3c, T(m, at(0, h + 0.03, -d / 2)));
    b.add('metal', extrude([[-0.08, -0.08], [0.08, -0.08], [0.08, 0.08], [-0.08, 0.08]], 0.01, 0.002, [[[-0.06, -0.06], [0.06, -0.06], [0.06, 0.06], [-0.06, 0.06]]]), 0x6a6e6a, T(m, at(0, 0.004, -d * 0.4, Math.PI / 2)));
    for (let i = 0; i < 5; i++) b.add('metal', cbox(0.12, 0.006, 0.012, 0.002), 0x2a2c2a, T(m, at(0, 0.002, -d * 0.4 - 0.05 + i * 0.025)));
    const lining = o.lining ?? 'steel';
    if (lining === 'padded') {
      const pt = pad ??= paddedTex();
      const mk = (ww: number, hh: number, M: THREE.Matrix4) => { const g = new THREE.PlaneGeometry(ww, hh); const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ww / 0.32, uv.getY(i) * hh / 0.32); const me = new THREE.Mesh(g, padMat ??= new THREE.MeshStandardMaterial({ map: pt, roughness: 0.85 })); me.receiveShadow = true; me.applyMatrix4(M); this.group.add(me); };
      mk(w, h, T(m, at(0, h / 2, -d + 0.001)));
      mk(d, h, T(m, at(-w / 2 + 0.001, h / 2, -d / 2, 0, Math.PI / 2)));
      mk(d, h, T(m, at(w / 2 - 0.001, h / 2, -d / 2, 0, -Math.PI / 2)));
      b.add('concrete', cbox(w + 0.2, h + 0.1, 0.06, 0.004), 0x4a4c4a, T(m, at(0, h / 2, -d - 0.03)));
      for (const s of [-1, 1]) b.add('concrete', cbox(0.06, h + 0.1, d, 0.004), 0x4a4c4a, T(m, at(s * (w / 2 + 0.03), h / 2, -d / 2)));
    } else {
      const key = lining === 'tile' ? 'tile' : 'metal', col = lining === 'tile' ? 0xd8e0e0 : 0x8a9496;
      b.add(key, cbox(w + 0.04, h, 0.06, 0.004), col, T(m, at(0, h / 2, -d - 0.03)), { rep: lining === 'tile' ? 0.9 : 0.5 });
      for (const s of [-1, 1]) b.add(key, cbox(0.06, h, d, 0.004), col, T(m, at(s * (w / 2 + 0.03), h / 2, -d / 2)), { rep: lining === 'tile' ? 0.9 : 0.5 });
      if (lining === 'steel') for (let x = -w / 2 + 0.25; x < w / 2; x += 0.3) b.add('metal', cbox(0.02, h - 0.04, 0.012, 0.004), 0x6a7274, T(m, at(x, h / 2, -d + 0.006)));
    }
    // the lamp: a caged strip at the top front, its pool and a faint cone
    b.add('metal', cbox(w * 0.7, 0.05, 0.1, 0.008), C.darker, T(m, at(0, h - 0.03, -0.14)));
    b.add('lamp', cbox(w * 0.62, 0.012, 0.05, 0.003), lc, T(m, at(0, h - 0.058, -0.14)));
    for (let x = -w * 0.3; x <= w * 0.3; x += w * 0.1) b.add('metal', cbox(0.004, 0.02, 0.07, 0.001), C.dark, T(m, at(x, h - 0.07, -0.14)));
    const pool = glowCard(w * 1.1, d * 1.1, lc, 0.1); pool.applyMatrix4(T(m, at(0, 0.004, -d / 2, -Math.PI / 2))); this.group.add(pool);
    const back = glowCard(w * 1.1, h * 1.0, lc, 0.04); back.applyMatrix4(T(m, at(0, h * 0.55, -d + 0.01))); this.group.add(back);
    const sh = shaftMesh(8); sh.u.uColor.value.setHex(lc); sh.u.uInt.value = 0.035;
    sh.mesh.applyMatrix4(T(m, at(0, h - 0.06, -d * 0.45, 0, 0, 0, [w * 0.45, h - 0.1, d * 0.42])));
    this.group.add(sh.mesh);
    this.lamps.push({ p: P(m, 0, h - 0.25, -d * 0.45), color: lc, kind: 'cell' });
    // fog on the cell floor
    const f = fogLayer(w, d, lc, 0.18, seedN++); f.mesh.applyMatrix4(T(m, at(0, 0.08, -d / 2))); this.group.add(f.mesh); this.fogs.push(f.u);
    const f2 = fogLayer(w, d, lc, 0.1, seedN++); f2.mesh.applyMatrix4(T(m, at(0, 0.3, -d / 2))); this.group.add(f2.mesh); this.fogs.push(f2.u);
    // what it holds
    const mid = T(m, at(0, 0, -d * 0.52));
    switch (o.holds) {
      case 'blob': this.add(blob(this.mats, this.anims, 0.62), T(mid, at(0, 0, 0, 0, 0.6))); break;
      case 'restraint': this.restraintChair(T(mid, at(0, 0, -d * 0.12))); break;
      case 'chains': this.restraints(T(m, at(0, h * 0.55, -d + 0.03)), w * 0.7); break;
      case 'empty': break;
      default: {
        b.add('paint', cbox(0.36, 0.78, 0.36, 0.02), 0x2a2e32, T(mid, at(0, 0.39, 0)));
        b.add('metal', cbox(0.42, 0.04, 0.42, 0.008), 0x4a5054, T(mid, at(0, 0.8, 0)));
        b.add('lamp', cbox(0.3, 0.004, 0.3, 0.001), lc, T(mid, at(0, 0.822, 0)));
        const cu = curio(o.holds, this.mats, this.anims);
        this.add(cu, T(mid, at(0, 0.98, 0, 0, 0.5)));
      }
    }
    // the front: wired glass in a bolted frame, a mullion, the gasket, a hazard sill
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat(this.wired(), w, h));
    gl.applyMatrix4(T(m, at(0, h / 2, -0.04))); gl.renderOrder = 5; gl.userData.noGlow = true; this.group.add(gl);
    const sheen = glowCard(w * 0.9, h * 0.9, 0x9ab8c8, 0.05); sheen.applyMatrix4(T(m, at(-w * 0.1, h * 0.55, -0.035))); this.group.add(sheen);
    const F = 0.13;
    b.add('metal', extrude([[-w / 2 - F, -0.02], [w / 2 + F, -0.02], [w / 2 + F, h + F], [-w / 2 - F, h + F]], 0.1, 0.012, [[[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]]]), 0x4a5052, T(m, at(0, 0, 0.03)), { rep: 0.5 });
    b.add('rubber', extrude([[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]], 0.03, 0, [[[-w / 2 + 0.02, 0.02], [w / 2 - 0.02, 0.02], [w / 2 - 0.02, h - 0.02], [-w / 2 + 0.02, h - 0.02]]]), 0x101010, T(m, at(0, 0, -0.035)));
    if (w > 0.9) b.add('metal', cbox(0.05, h, 0.06, 0.008), 0x4a5052, T(m, at(0, h / 2, -0.02)));
    b.add('metal', cbox(w, 0.05, 0.06, 0.008), 0x4a5052, T(m, at(0, h * 0.42, -0.02)));
    this.bolts(T(m, at(0, h / 2 + F / 2 - 0.01, 0.08)), w + F, h + F - 0.02, 0, 0.18, 0.011);
    b.add('hazard', cbox(w + 2 * F, 0.08, 0.12, 0.004), 0xffffff, T(m, at(0, 0.04, 0.06)), { rep: 0.22 });
    // the cell plate, the status lamp, the speaker, the vent
    const id = plate(this.mats, ['CELL ' + o.id], 0.34, 0.08, { bg: 0x1c2226, ink: 0xe8e0c8, px: 500 });
    id.applyMatrix4(T(m, at(0, h + F + 0.07, 0.04))); this.group.add(id);
    this.lamp(T(m, at(w / 2 + F - 0.06, h + F + 0.07, 0.04)), o.rank === 'wrath' || o.rank === 'pride' ? 0xff2a1a : 0xffa020, blink(0.6, 0.5));
    this.lamp(T(m, at(-w / 2 - F + 0.06, h + F + 0.07, 0.04)), 0x3aff6a);
    for (let i = 0; i < 5; i++) b.add('metal', cbox(0.12, 0.008, 0.01, 0.002), 0x0a0a0a, T(m, at(sd * (w / 2 + F + 0.2), 1.75 - i * 0.02, 0.012)));
    b.add('metal', cbox(0.15, 0.12, 0.012, 0.004), C.darker, T(m, at(sd * (w / 2 + F + 0.2), 1.71, 0.006)));
    // beside it: the placard, the locks
    this.placard(T(m, at(sd * (w / 2 + F + 0.21), 1.32, 0.0)), o.rank, { cls: o.cls, cell: o.id, w: 0.24 });
    this.keypad(T(m, at(sd * (w / 2 + F + 0.13), 0.98, 0)));
    this.biolock(T(m, at(sd * (w / 2 + F + 0.29), 0.98, 0)));
  }

  /** a pedestal case: plinth, brass plate, glass, a lamp in the lid, a placard tab, the object floating */
  vitrine(m: THREE.Matrix4, kind: CurioKind, o: { rank?: SinRank; light?: number; w?: number } = {}) {
    const b = this.b, w = o.w ?? 0.46, ph = 0.92, gh = 0.62, lc = o.light ?? 0xd8eeff;
    b.add('paint', cbox(w, ph, w, 0.03), 0x22262a, T(m, at(0, ph / 2, 0)));
    b.add('metal', cbox(w + 0.06, 0.05, w + 0.06, 0.012), 0x3a4044, T(m, at(0, 0.025, 0)));
    b.add('metal', cbox(w + 0.04, 0.04, w + 0.04, 0.01), 0x4a5054, T(m, at(0, ph + 0.02, 0)));
    // the glass box: an edge frame, a lid with its lamp
    const y0 = ph + 0.04;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('metal', cbox(0.02, gh, 0.02, 0.004), 0x8a9294, T(m, at(sx * w / 2, y0 + gh / 2, sz * w / 2)));
    b.add('metal', cbox(w + 0.04, 0.06, w + 0.04, 0.01), 0x3a4044, T(m, at(0, y0 + gh + 0.03, 0)));
    b.add('lamp', cbox(w * 0.6, 0.006, w * 0.6, 0.002), lc, T(m, at(0, y0 + gh - 0.004, 0)));
    const gm = vitGlass ??= new THREE.MeshBasicMaterial({ color: 0x2a3a40, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, gh), gm); g.applyMatrix4(T(m, at(Math.sin(i * Math.PI / 2) * w / 2, y0 + gh / 2, Math.cos(i * Math.PI / 2) * w / 2, 0, i * Math.PI / 2))); g.userData.noGlow = true; g.renderOrder = 5; this.group.add(g); }
    const st = glowCard(w * 1.2, w * 1.2, lc, 0.3); st.applyMatrix4(T(m, at(0, y0 + 0.003, 0, -Math.PI / 2))); this.group.add(st);
    const sh = shaftMesh(8); sh.u.uColor.value.setHex(lc); sh.u.uInt.value = 0.05; sh.mesh.applyMatrix4(T(m, at(0, y0 + gh - 0.01, 0, 0, 0, 0, [w * 0.42, gh - 0.02, w * 0.42]))); this.group.add(sh.mesh);
    this.lamps.push({ p: P(m, 0, y0 + gh * 0.7, 0), color: lc, kind: 'case' });
    // the object, a little stand
    b.add('metal', prism(0.04, 0.03, 8), 0x8a9294, T(m, at(0, y0 + 0.015, 0)));
    this.add(curio(kind, this.mats, this.anims), T(m, at(0, y0 + 0.2, 0, 0, 0.4)));
    // the brass plate and the rank tab on the plinth's face
    const pl = plate(this.mats, [CURIO_NAME[kind]], w * 0.82, 0.07, { bg: 0xb89850, ink: 0x2a1a08, px: 520 });
    pl.applyMatrix4(T(m, at(0, ph - 0.12, w / 2 + 0.002))); this.group.add(pl);
    if (o.rank) this.placard(T(m, at(0, ph * 0.5, w / 2 + 0.002)), o.rank, { w: 0.18, cell: 'V-' + String(seedN % 90 + 10) });
  }

  /** a vault door set into a wall (the room leaves the wall open over [-w/2 - 0.2, w/2 + 0.2] x [0, h + 0.25]) */
  blastDoor(m: THREE.Matrix4, o: { w?: number; h?: number; id?: string; name?: string; rank?: SinRank; side?: 1 | -1; sign?: boolean } = {}) {
    const w = o.w ?? 1.3, h = o.h ?? 2.2, b = this.b, sd = o.side ?? 1;
    const J = 0.2;
    // the reveal: a deep steel jamb, a threshold, the lintel
    b.add('metal', extrude([[-w / 2 - J, 0], [w / 2 + J, 0], [w / 2 + J, h + J], [-w / 2 - J, h + J]], 0.12, 0.016, [[[-w / 2, 0.02], [w / 2, 0.02], [w / 2, h], [-w / 2, h]]]), 0x4a5054, T(m, at(0, 0, 0.04)), { rep: 0.5 });
    for (const s of [-1, 1]) b.add('metal', cbox(0.06, h, 0.4, 0.008), 0x3a4044, T(m, at(s * (w / 2 + 0.03), h / 2, -0.18)));
    b.add('metal', cbox(w, 0.06, 0.4, 0.008), 0x3a4044, T(m, at(0, h + 0.03, -0.18)));
    b.add('metal', cbox(w + 0.5, 0.03, 0.5, 0.006), 0x6a7072, T(m, at(0, 0.015, -0.05)), { rep: 0.4 });
    for (let i = 0; i < 9; i++) b.add('metal', cbox(0.012, 0.004, 0.44, 0.001), 0x4a5052, T(m, at(-w / 2 + 0.05 + i * (w - 0.1) / 8, 0.032, -0.05)));
    // the hazard border round the opening
    for (const s of [-1, 1]) b.add('hazard', cbox(0.1, h + J, 0.02, 0.003), 0xffffff, T(m, at(s * (w / 2 + J - 0.06), (h + J) / 2, 0.105)), { rep: 0.24 });
    b.add('hazard', cbox(w + 2 * J - 0.02, 0.1, 0.02, 0.003), 0xffffff, T(m, at(0, h + J - 0.06, 0.105)), { rep: 0.24 });
    this.bolts(T(m, at(0, (h + J) / 2, 0.1)), w + J * 1.1, h + J * 0.9, 0, 0.22, 0.014);
    // the leaf, set back in the reveal: raised panels, hazard chevrons, the wheel, the bolt housings, hinges
    const L = T(m, at(0, 0, -0.32));
    b.add('metal', cbox(w - 0.02, h - 0.04, 0.22, 0.03), 0x6a7270, T(L, at(0, h / 2, 0)), { rep: 0.6 });
    for (const [px, py, pw, phh] of [[0, h * 0.75, w - 0.24, h * 0.36], [0, h * 0.27, w - 0.24, h * 0.36]] as [number, number, number, number][]) {
      b.add('metal', cbox(pw, phh, 0.04, 0.02), 0x7a8280, T(L, at(px, py, 0.12)), { rep: 0.5 });
      b.add('metal', cbox(pw - 0.1, phh - 0.1, 0.03, 0.012), 0x6a7270, T(L, at(px, py, 0.14)), { rep: 0.5 });
    }
    for (const yy of [h * 0.52]) b.add('hazard', cbox(w - 0.06, 0.1, 0.03, 0.004), 0xffffff, T(L, at(0, yy, 0.125)), { rep: 0.3 });
    const wy = h * 0.52;
    b.add('metal', prism(0.12, 0.08, 12), 0x3a4044, T(L, at(0, wy, 0.17, Math.PI / 2)));
    b.add('paint', ring(0.26, 0.26, 0.04, 0.035, 16), 0xb8301e, T(L, at(0, wy, 0.26, Math.PI / 2)));
    for (let i = 0; i < 3; i++) b.add('paint', cbox(0.03, 0.5, 0.03, 0.006), 0xb8301e, T(L, at(0, wy, 0.25, 0, 0, (i * Math.PI) / 3)));
    b.add('chrome', prism(0.05, 0.08, 8), 0xffffff, T(L, at(0, wy, 0.25, Math.PI / 2)));
    for (const s of [-1, 1]) for (const yy of [h * 0.22, h * 0.78]) {
      b.add('chrome', cbox(0.16, 0.08, 0.08, 0.02), 0xffffff, T(L, at(s * (w / 2 - 0.13), yy, 0.14)));
      b.add('metal', cbox(0.08, 0.1, 0.05, 0.01), 0x2a2e30, T(L, at(s * (w / 2 - 0.02), yy, 0.13)));
    }
    for (const yy of [h * 0.15, h * 0.5, h * 0.85]) b.add('metal', prism(0.05, 0.22, 8), 0x3a4044, T(L, at(-sd * (w / 2 + 0.0), yy, 0.08)));
    // cold strip lamps down the inside of the jamb, washing the leaf
    for (const s of [-1, 1]) {
      b.add('metal', cbox(0.03, h - 0.1, 0.05, 0.006), C.darker, T(m, at(s * (w / 2 + 0.012), h / 2, -0.06)));
      b.add('lamp', cbox(0.012, h - 0.2, 0.02, 0.003), 0xd8e8ff, T(m, at(s * (w / 2 - 0.004), h / 2, -0.06)));
    }
    const wash = glowCard(w * 1.1, h * 1.05, 0xb8d0ff, 0.09); wash.applyMatrix4(T(L, at(0, h / 2, 0.29))); this.group.add(wash);
    const fl = glowCard(w * 1.4, 0.8, 0xb8d0ff, 0.1); fl.applyMatrix4(T(m, at(0, 0.035, 0.3, -Math.PI / 2))); this.group.add(fl);
    // the round port, dark, a faint red beyond
    b.add('metal', ring(0.08, 0.08, 0.05, 0.03, 12), 0x2a2e30, T(L, at(0, h * 0.8, 0.14, Math.PI / 2)));
    const port = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), new THREE.MeshBasicMaterial({ color: 0x2a0806, toneMapped: false }));
    port.applyMatrix4(T(L, at(0, h * 0.8, 0.13))); port.userData.noGlow = true; this.group.add(port);
    // a stencilled letter on the leaf and its plates
    const lp = plate(this.mats, [o.id ?? 'B'], 0.22, 0.24, { bg: 0xe8b828, ink: 0x141210, px: 300 });
    lp.applyMatrix4(T(L, at(0, h * 0.27, 0.165))); this.group.add(lp);
    const np = plate(this.mats, [o.name ?? 'VAULT B · DEEP ARCHIVE', 'AUTHORISED ENTRY ONLY'], 0.9, 0.14, { bg: 0x1c2226, ink: 0xe8e0c8, px: 420 });
    np.applyMatrix4(T(m, at(0, h + J + 0.12, 0.05))); this.group.add(np);
    const seal = plate(this.mats, ['SEALED'], 0.3, 0.07, { bg: 0xb82a1e, ink: 0xfff0e0, emissive: true, px: 420 });
    seal.applyMatrix4(T(L, at(0, h * 0.665, 0.165))); this.group.add(seal);
    this.beacon(T(m, at(sd * (w / 2 + J - 0.02), h + J + 0.04, 0.1)));
    this.lamp(T(m, at(-sd * (w / 2 + J - 0.08), h + J + 0.12, 0.05)), 0xff2a1a, blink(1.1, 0.5));
    // the locks beside it, the placard, the signs
    this.biolock(T(m, at(sd * (w / 2 + J + 0.14), 1.3, 0)));
    this.keypad(T(m, at(sd * (w / 2 + J + 0.14), 1.05, 0)));
    if (o.rank) this.placard(T(m, at(sd * (w / 2 + J + 0.22), 1.75, 0)), o.rank, { w: 0.22, cell: o.id ?? 'B' });
    if (o.sign !== false) this.sign(T(m, at(-sd * (w / 2 + J + 0.16), 1.55, 0)), 'auth', 0.2);
  }

  // ================================================================ services
  /** a decontamination shower standing at m (open front +Z) */
  decon(m: THREE.Matrix4, o: { w?: number; d?: number; h?: number } = {}) {
    const w = o.w ?? 0.95, d = o.d ?? 0.95, h = o.h ?? 2.3, b = this.b;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('metal', cbox(0.06, h, 0.06, 0.01), 0xc8c8c0, T(m, at(sx * w / 2, h / 2, sz * d / 2)));
    for (const sz of [-1, 1]) b.add('metal', cbox(w + 0.06, 0.08, 0.06, 0.01), 0xc8c8c0, T(m, at(0, h - 0.04, sz * d / 2)));
    for (const sx of [-1, 1]) b.add('metal', cbox(0.06, 0.08, d + 0.06, 0.01), 0xc8c8c0, T(m, at(sx * w / 2, h - 0.04, 0)));
    b.add('hazard', cbox(w + 0.08, 0.06, 0.02, 0.004), 0xffffff, T(m, at(0, h - 0.04, d / 2 + 0.035)), { rep: 0.2 });
    // the back panel and side screens (stainless)
    b.add('chrome', cbox(w, h - 0.12, 0.03, 0.006), 0xa8b0b0, T(m, at(0, (h - 0.12) / 2 + 0.04, -d / 2)), { rep: 0.5 });
    for (const sx of [-1, 1]) b.add('chrome', cbox(0.03, h * 0.62, d - 0.08, 0.006), 0xa0a8a8, T(m, at(sx * w / 2, h * 0.31 + 0.04, 0)), { rep: 0.5 });
    // the floor: a sump tray with a hazard rim, the grate
    b.add('metal', cbox(w + 0.12, 0.06, d + 0.12, 0.012), 0x5a6062, T(m, at(0, 0.03, 0)));
    for (const sz of [-1, 1]) b.add('hazard', cbox(w + 0.12, 0.012, 0.06, 0.003), 0xffffff, T(m, at(0, 0.066, sz * (d / 2 + 0.03))), { rep: 0.2 });
    for (let i = 0; i < 14; i++) b.add('metal', cbox(w - 0.04, 0.02, 0.012, 0.002), 0x7a8284, T(m, at(0, 0.07, -d / 2 + 0.06 + i * (d - 0.12) / 13)));
    // the spray ring overhead, two spray bars, nozzles
    const RR = Math.min(w, d) * 0.32;
    b.add('chrome', ring(RR, RR, 0.03, 0.03, 12), 0xd8dcdc, T(m, at(0, h - 0.24, 0)));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.add('chrome', prism(0.01, 0.04, 5), 0xd8dcdc, T(m, at(Math.cos(a) * RR, h - 0.27, Math.sin(a) * RR))); }
    b.add('chrome', prism(0.015, 0.2, 6), 0xd8dcdc, T(m, at(0, h - 0.14, -d / 2 + 0.06)));
    b.add('chrome', tube([[0, h - 0.04, -d / 2 + 0.05], [0, h - 0.2, -d / 2 + 0.06], [0, h - 0.24, -RR]], 0.015, 6, 5), 0xd8dcdc, m.clone());
    b.add('chrome', lathe([[0, 0], [0.09, 0], [0.07, 0.04], [0, 0.05]], 10), 0xd8dcdc, T(m, at(0, h - 0.33, 0)));
    for (const sx of [-1, 1]) {
      b.add('chrome', prism(0.016, h * 0.7, 6), 0xd8dcdc, T(m, at(sx * (w / 2 - 0.06), h * 0.45, -d / 2 + 0.08)));
      for (let k = 0; k < 6; k++) b.add('chrome', prism(0.008, 0.04, 5), 0xd8dcdc, T(m, at(sx * (w / 2 - 0.09), 0.5 + k * 0.24, -d / 2 + 0.08, 0, 0, Math.PI / 2)));
    }
    // the booth's own lamp in the top frame, its light on the grate and the back panel
    b.add('lamp', cbox(w * 0.6, 0.012, 0.06, 0.003), 0xc8f0e0, T(m, at(0, h - 0.09, -d * 0.2)));
    const gp = glowCard(w * 1.1, d * 1.1, 0xa8e8d0, 0.14); gp.applyMatrix4(T(m, at(0, 0.085, 0, -Math.PI / 2))); this.group.add(gp);
    const gb = glowCard(w * 1.1, h * 0.9, 0xa8e8d0, 0.08); gb.applyMatrix4(T(m, at(0, h * 0.5, -d / 2 + 0.02))); this.group.add(gb);
    // the pull handle on its chain, the supply valve, a lamp
    for (let k = 0; k < 9; k++) b.add('metal', ring(0.012, 0.018, 0.004, 0.004, 6), C.steel, T(m, at(w * 0.25, h - 0.3 - k * 0.04, d * 0.15, 0, k % 2 ? Math.PI / 2 : 0, Math.PI / 2)));
    b.add('paint', extrude([[-0.08, 0], [0.08, 0], [0, 0.13]], 0.02, 0.004, [[[-0.05, 0.016], [0.05, 0.016], [0, 0.095]]]), 0x3ac85a, T(m, at(w * 0.25, h - 0.82, d * 0.15, 0, 0, Math.PI)));
    this.valve(T(m, at(w / 2 + 0.05, 1.2, -d / 2 + 0.2, 0, Math.PI / 2)), 0.035);
    this.lamp(T(m, at(-w / 2 + 0.12, h - 0.2, -d / 2 + 0.02)), 0x3aff6a, blink(0.3, 0.8));
    this.sign(T(m, at(0, 1.5, -d / 2 + 0.017)), 'decon', 0.26);
    const ins = plate(this.mats, ['PULL · COUNT 90', 'EYES SHUT · ARMS UP'], 0.32, 0.09, { bg: 0xe8e2d0, px: 420 });
    ins.applyMatrix4(T(m, at(0, 1.08, -d / 2 + 0.017))); this.group.add(ins);
    // the strip curtain across the front
    const sm = stripMat ??= new THREE.MeshStandardMaterial({ color: 0x9ab8b0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    const nStrip = 7;
    for (let i = 0; i < nStrip; i++) {
      if (i === 3) continue;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w / nStrip + 0.02, h - 0.2), sm);
      g.applyMatrix4(T(m, at(-w / 2 + (i + 0.5) * (w / nStrip), (h - 0.2) / 2 + 0.06, d / 2 + 0.01 + (i % 2) * 0.006, 0, (i - 3) * 0.04)));
      g.userData.noGlow = true; g.renderOrder = 4; this.group.add(g);
      this.anims.push({ o: g, f: (o2, t) => { o2.rotation.x = Math.sin(t * 0.9 + i) * 0.015; } });
    }
    this.d.puddle(P(m, 0.1, 0, d * 0.75).x, P(m, 0.1, 0, d * 0.75).z, 0.9, 0.6);
  }
  /** dressing for a sample cold store whose glass front is the w x h rectangle at m (+Z out) */
  coldStore(m: THREE.Matrix4, w: number, h: number, o: { readout?: string; frost?: boolean } = {}) {
    if (o.frost !== false) { const fr = frostCard(w, h); fr.applyMatrix4(T(m, at(0, 0, 0.004))); this.group.add(fr); }
    const ro = card(readoutTex(o.readout ?? '-80°C'), 0.16, 0.05, 'emit');
    ro.applyMatrix4(T(m, at(w / 2 - 0.12, h / 2 + 0.11, 0.02))); this.group.add(ro);
    this.b.add('metal', cbox(0.2, 0.08, 0.03, 0.006), C.darker, T(m, at(w / 2 - 0.12, h / 2 + 0.11, 0.004)));
    this.sign(T(m, at(-w / 2 + 0.14, h / 2 + 0.12, 0.002)), 'cryo', 0.13);
  }
  /** a liquid nitrogen dewar on its castor dolly (m on the floor) with a hose and its gauge */
  dewar(m: THREE.Matrix4) {
    const b = this.b;
    b.add('metal', cbox(0.5, 0.05, 0.5, 0.01), C.dark, T(m, at(0, 0.08, 0)));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('rubber', prism(0.035, 0.03, 8), 0x1a1a1a, T(m, at(sx * 0.2, 0.035, sz * 0.2, Math.PI / 2)));
    b.add('chrome', lathe([[0, 0], [0.2, 0], [0.22, 0.06], [0.22, 0.95], [0.16, 1.08], [0.08, 1.12], [0, 1.12]], 14), 0xc8d0d4, T(m, at(0, 0.1, 0)), { rep: 0.4 });
    b.add('paint', prism(0.225, 0.12, 14), 0x2a6ac8, T(m, at(0, 0.6, 0)));
    b.add('chrome', ring(0.21, 0.21, 0.025, 0.02, 12), 0xb8c0c4, T(m, at(0, 1.18, 0)));
    for (let i = 0; i < 3; i++) b.add('chrome', cbox(0.02, 0.16, 0.02, 0.004), 0xb8c0c4, T(m, at(Math.cos(i * 2.09) * 0.2, 1.1, Math.sin(i * 2.09) * 0.2)));
    b.add('brass', prism(0.03, 0.08, 6), 0xffffff, T(m, at(0.05, 1.24, 0)));
    this.valve(T(m, at(-0.06, 1.26, 0.02, -Math.PI / 2)), 0.02);
    b.add('rubber', tube([[0.06, 1.28, 0], [0.25, 1.3, 0.1], [0.4, 0.9, 0.2], [0.42, 0.3, 0.35], [0.5, 0.03, 0.6]], 0.016, 14, 5), 0x8a8a7a, m.clone());
    const pos = P(m, 0, 1.0, 0.22), ry = new THREE.Euler().setFromRotationMatrix(m).y;
    this.d.dial(at(pos.x, pos.y, pos.z, 0, ry), 0.045, 'psi', (t) => 0.62 + Math.sin(t * 0.4) * 0.02);
    const lab = plate(this.mats, ['LN2 · 180 L'], 0.2, 0.05, { bg: 0xe8e2d0, px: 520 }); lab.applyMatrix4(T(m, at(0, 0.8, 0.226))); this.group.add(lab);
    this.sign(T(m, at(0, 0.38, 0.222)), 'cryo', 0.13);
  }

  /** an observation window at m (centre of the glass, +Z toward the viewer): mirror = a one-way mirror with watchers behind */
  obsWindow(m: THREE.Matrix4, o: { w?: number; h?: number; mirror?: boolean; shutter?: number; label?: string[]; intercom?: 'below' | 'side' } = {}): THREE.Mesh {
    const w = o.w ?? 1.6, h = o.h ?? 0.95, b = this.b, F = 0.12;
    let pane: THREE.Mesh;
    b.add('metal', extrude([[-w / 2 - F, -h / 2 - F], [w / 2 + F, -h / 2 - F], [w / 2 + F, h / 2 + F], [-w / 2 - F, h / 2 + F]], 0.16, 0.016, [[[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]]), 0x5a6266, T(m, at(0, 0, 0.04)), { rep: 0.5 });
    // a hooded lamp over it, raking down the glass, and the red IN SESSION lamp
    b.add('metal', cbox(w * 0.7, 0.05, 0.14, 0.01), C.darker, T(m, at(0, h / 2 + F + 0.05, 0.12)));
    b.add('lamp', cbox(w * 0.64, 0.01, 0.05, 0.003), 0xd8e4f0, T(m, at(0, h / 2 + F + 0.022, 0.15)));
    const rake = glowCard(w * 1.2, h * 1.5, 0xa8c0d8, 0.07); rake.applyMatrix4(T(m, at(0, 0.05, 0.13))); this.group.add(rake);
    this.lamp(T(m, at(-w / 2 - F + 0.05, h / 2 + F + 0.1, 0.04)), 0xff2a1a, blink(0.5, 0.92));
    b.add('metal', cbox(w + 2 * F + 0.06, 0.06, 0.24, 0.01), 0x4a5052, T(m, at(0, -h / 2 - F - 0.02, 0.1)));
    this.bolts(T(m, at(0, 0, 0.12)), w + F, h + F, 0, 0.2, 0.012);
    if (o.mirror) {
      // a one-way mirror: dark glass that holds the room, and two shapes behind it when the light is right
      const mm = pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mirrorMat ??= new THREE.MeshStandardMaterial({ color: 0x1e2830, roughness: 0.12, metalness: 0.6 }));
      mm.applyMatrix4(T(m, at(0, 0, -0.03))); this.group.add(mm);
      const ghost = card(watchersTex ??= watchers(), w, h, 'emitAlpha');
      ghost.applyMatrix4(T(m, at(0, 0, -0.028))); ghost.renderOrder = 5; this.group.add(ghost);
      const sheen = glowCard(w * 0.9, h * 0.8, 0x8aa8c0, 0.06); sheen.applyMatrix4(T(m, at(w * 0.1, 0, -0.025))); this.group.add(sheen);
    } else {
      const gl = pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat(this.wired(), w, h));
      gl.applyMatrix4(T(m, at(0, 0, -0.03))); gl.renderOrder = 5; gl.userData.noGlow = true; this.group.add(gl);
      const sheen = glowCard(w * 0.9, h * 0.8, 0x9ab8c8, 0.05); sheen.applyMatrix4(T(m, at(-w * 0.15, 0, -0.025))); this.group.add(sheen);
    }
    if (o.shutter) {
      // a blast shutter part-way down from its housing
      const sh = Math.min(h, o.shutter);
      b.add('metal', cbox(w + 0.1, 0.18, 0.2, 0.02), 0x3a4044, T(m, at(0, h / 2 + F + 0.09, 0.1)));
      for (let y = 0; y < sh; y += 0.06) b.add('metal', cbox(w, 0.055, 0.025, 0.006), 0x5a6264, T(m, at(0, h / 2 - y - 0.03, 0.0)));
      b.add('hazard', cbox(w, 0.05, 0.03, 0.004), 0xffffff, T(m, at(0, h / 2 - sh - 0.02, 0.005)), { rep: 0.2 });
    }
    // the intercom under it: speaker grille, push-to-talk, a lamp
    const I = o.intercom === 'side' ? T(m, at(w / 2 + F + 0.2, -h * 0.2, 0.0)) : T(m, at(w / 2 - 0.2, -h / 2 - F - 0.2, 0.0));
    b.add('metal', cbox(0.26, 0.16, 0.06, 0.01), 0x2a2e32, T(I, at(0, 0, 0.03)));
    for (let i = 0; i < 6; i++) b.add('metal', cbox(0.12, 0.008, 0.01, 0.002), 0x0a0a0a, T(I, at(-0.04, 0.05 - i * 0.02, 0.062)));
    b.add('paint', prism(0.025, 0.03, 10), 0xc8281e, T(I, at(0.08, 0, 0.07, Math.PI / 2)));
    this.led(I, 0.08, 0.055, 0.062, 0xffb030, { size: 0.006, pattern: blink(0.4, 0.2) });
    const lab = plate(this.mats, o.label ?? ['OBSERVATION', 'DO NOT TAP THE GLASS'], 0.5, 0.1, { bg: 0xe8e2d0, px: 440 });
    lab.applyMatrix4(T(m, at(-w / 2 + 0.3, -h / 2 - F - 0.14, 0.0))); this.group.add(lab);
    return pane;
  }

  /** a restraint board on the wall (m on the wall at its centre): shackles on chains, cuffs, a strap set, a hazard label */
  restraints(m: THREE.Matrix4, w = 0.8) {
    const b = this.b, hh = 0.7;
    b.add('metal', cbox(w, hh, 0.03, 0.008), 0x4a5052, T(m, at(0, 0, 0.015)), { rep: 0.4 });
    this.bolts(T(m, at(0, 0, 0.03)), w - 0.06, hh - 0.06, 0, 0.25, 0.01);
    const n = Math.max(2, Math.round(w / 0.22));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.1 + (i * (w - 0.2)) / (n - 1), y = hh / 2 - 0.1;
      b.add('metal', bolt(0.025, 0.02), C.steel, T(m, at(x, y, 0.03, Math.PI / 2)));
      b.add('metal', ring(0.025, 0.025, 0.012, 0.01, 8), C.steel, T(m, at(x, y - 0.025, 0.05)));
      const links = 6 + (i % 3) * 2;
      for (let k = 0; k < links; k++) b.add('metal', ring(0.012, 0.02, 0.006, 0.006, 6), 0x8a8e90, T(m, at(x + Math.sin(k * 0.3 + i) * 0.006, y - 0.06 - k * 0.032, 0.055 + k * 0.003, 0, k % 2 ? Math.PI / 2 : 0, Math.PI / 2)));
      const cy = y - 0.08 - links * 0.032;
      b.add('chrome', ring(0.045, 0.045, 0.02, 0.012, 10), 0xc8ccd0, T(m, at(x, cy - 0.04, 0.07, 0.2, 0, 0)));
      b.add('chrome', cbox(0.03, 0.025, 0.025, 0.006), 0xc8ccd0, T(m, at(x + 0.045, cy - 0.04, 0.07)));
    }
    // a leather strap set hanging off a hook at one end
    b.add('metal', prism(0.008, 0.06, 5), C.steel, T(m, at(w / 2 + 0.08, 0.1, 0.04, Math.PI / 2)));
    for (let k = 0; k < 3; k++) {
      b.add('leather', tube([[w / 2 + 0.08, 0.1, 0.07], [w / 2 + 0.06 + k * 0.02, -0.15, 0.06 + k * 0.01], [w / 2 + 0.05 + k * 0.03, -0.42 - k * 0.06, 0.05]], 0.012, 8, 4), [0x5a3a22, 0x4a2a1a, 0x6a4a2a][k], m.clone());
      b.add('chrome', cbox(0.04, 0.03, 0.012, 0.004), 0xc8ccd0, T(m, at(w / 2 + 0.05 + k * 0.03, -0.3 - k * 0.04, 0.06)));
    }
    const lab = plate(this.mats, ['RESTRAINT', 'SIGN OUT EVERY CUFF'], 0.36, 0.09, { bg: 0xe8b828, ink: 0x141210, px: 420 });
    lab.applyMatrix4(T(m, at(0, hh / 2 + 0.08, 0.004))); this.group.add(lab);
  }
  /** a restraint chair bolted to the floor (m at its foot, facing +Z): steel frame, straps across, a head cage */
  restraintChair(m: THREE.Matrix4) {
    const b = this.b;
    b.add('metal', cbox(0.6, 0.04, 0.6, 0.01), 0x4a5052, T(m, at(0, 0.02, 0)));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('metal', cbox(0.05, 0.45, 0.05, 0.008), 0x7a8284, T(m, at(sx * 0.24, 0.245, sz * 0.22)));
    b.add('leather', cbox(0.54, 0.08, 0.5, 0.03), 0x3a3a3a, T(m, at(0, 0.5, 0)));
    b.add('leather', cbox(0.54, 0.75, 0.08, 0.03), 0x3a3a3a, T(m, at(0, 0.92, -0.24, -0.08)));
    for (const sx of [-1, 1]) {
      b.add('metal', cbox(0.06, 0.05, 0.46, 0.01), 0x7a8284, T(m, at(sx * 0.3, 0.72, 0.0)));
      b.add('leather', ring(0.05, 0.05, 0.05, 0.012, 8), 0x5a3a22, T(m, at(sx * 0.3, 0.74, 0.12)));
      b.add('leather', ring(0.06, 0.06, 0.05, 0.012, 8), 0x5a3a22, T(m, at(sx * 0.12, 0.2, 0.26)));
    }
    b.add('leather', cbox(0.58, 0.06, 0.02, 0.006), 0x5a3a22, T(m, at(0, 0.98, -0.19, -0.08)));
    b.add('leather', tube([[0.28, 1.18, -0.2], [0.3, 0.9, -0.1], [0.32, 0.62, -0.05]], 0.012, 6, 4), 0x5a3a22, m.clone());
    b.add('metal', ring(0.13, 0.15, 0.03, 0.01, 10, 0.6, -1.2), 0x7a8284, T(m, at(0, 1.38, -0.18)));
    for (const sx of [-1, 1]) b.add('metal', cbox(0.03, 0.3, 0.03, 0.006), 0x7a8284, T(m, at(sx * 0.15, 1.3, -0.26)));
  }
  /** a hospital trolley with restraint straps (m on the floor, length along z) */
  gurney(m: THREE.Matrix4) {
    const b = this.b, L = 1.9, W = 0.66, y = 0.78;
    b.add('chrome', cbox(W, 0.05, L, 0.012), 0xb8c0c4, T(m, at(0, y, 0)));
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      b.add('chrome', prism(0.018, y - 0.1, 6), 0xb8c0c4, T(m, at(sx * (W / 2 - 0.04), (y - 0.1) / 2 + 0.08, sz * (L / 2 - 0.1))));
      b.add('rubber', prism(0.05, 0.03, 8), 0x1a1a1a, T(m, at(sx * (W / 2 - 0.04), 0.05, sz * (L / 2 - 0.1), 0, 0, Math.PI / 2)));
    }
    b.add('chrome', cbox(W - 0.1, 0.02, L - 0.3, 0.004), 0x9aa2a6, T(m, at(0, 0.3, 0)));
    b.add('leather', cbox(W - 0.06, 0.08, L - 0.06, 0.03), 0x6a7a74, T(m, at(0, y + 0.065, 0)));
    b.add('leather', cbox(W - 0.18, 0.06, 0.3, 0.025), 0xd8d4c8, T(m, at(0, y + 0.13, -L / 2 + 0.22)));
    for (const z of [-0.45, 0.05, 0.55]) {
      b.add('leather', cbox(W + 0.02, 0.012, 0.09, 0.003), 0x4a2a1a, T(m, at(0, y + 0.11, z)));
      for (const sx of [-1, 1]) b.add('leather', cbox(0.012, 0.22, 0.09, 0.003), 0x4a2a1a, T(m, at(sx * (W / 2 + 0.01), y, z)));
      b.add('chrome', cbox(0.06, 0.016, 0.05, 0.004), 0xd8dcdc, T(m, at(0.12, y + 0.12, z)));
    }
    for (const sx of [-1, 1]) b.add('leather', ring(0.04, 0.04, 0.05, 0.012, 8), 0x4a2a1a, T(m, at(sx * (W / 2 - 0.02), y + 0.1, -0.2, 0, 0, Math.PI / 2)));
    for (const sz of [-1, 1]) b.add('chrome', tube([[-W / 2, y + 0.02, sz * L / 2], [-W / 2, y + 0.2, sz * (L / 2 + 0.02)], [W / 2, y + 0.2, sz * (L / 2 + 0.02)], [W / 2, y + 0.02, sz * L / 2]], 0.012, 10, 5, false), 0xd8dcdc, m.clone());
  }

  /** a vault locker wall (cols x rows of numbered doors, cell metres square), m at its centre */
  lockers(m: THREE.Matrix4, cols: number, rows: number, cell = 0.3) {
    const w = cols * cell, h = rows * cell, b = this.b;
    b.add('metal', cbox(w + 0.06, h + 0.06, 0.4, 0.01), 0x2a2e30, T(m, at(0, 0, -0.2)));
    this.add(card(lockerTex(cols, rows, seedN++), w, h), T(m, at(0, 0, 0.002)));
    // handles (3D) on every door, a few doors standing open on a lit drawer
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = -w / 2 + (i + 0.5) * cell, y = h / 2 - (j + 0.5) * cell;
      b.add('chrome', cbox(0.012, 0.05, 0.02, 0.003), 0xc8c0a0, T(m, at(x + cell * 0.36, y - 0.04, 0.012)));
    }
    // a light bar along the top, raking down the doors
    b.add('metal', cbox(w, 0.06, 0.14, 0.01), C.darker, T(m, at(0, h / 2 + 0.06, 0.1)));
    b.add('lamp', cbox(w - 0.1, 0.012, 0.05, 0.003), 0xd8e4ff, T(m, at(0, h / 2 + 0.028, 0.13)));
    const wash = glowCard(w, h * 1.4, 0xb8ccff, 0.08); wash.applyMatrix4(T(m, at(0, h * 0.1, 0.02))); this.group.add(wash);
    const R = rng(seedN++);
    for (let k = 0; k < Math.max(1, Math.floor(cols * rows / 26)); k++) {
      const i = Math.floor(R() * cols), j = Math.floor(R() * rows);
      const x = -w / 2 + (i + 0.5) * cell, y = h / 2 - (j + 0.5) * cell;
      b.add('rubber', cbox(cell - 0.03, cell - 0.03, 0.01, 0.002), 0x050505, T(m, at(x, y, 0.004)));
      b.add('metal', cbox(cell - 0.04, cell - 0.04, 0.02, 0.004), 0x6a7068, T(m, at(x - cell / 2 + 0.01, y, 0.02, 0, -1.6)).multiply(at((cell - 0.04) / 2, 0, 0)));
      b.add('metal', cbox(cell - 0.05, 0.03, 0.25, 0.004), 0x4a5052, T(m, at(x, y - cell / 2 + 0.03, 0.08)));
      this.led(m, x, y + cell * 0.3, 0.02, [0x3aff6a, 0xff3a1a, 0xffb030][k % 3], { size: 0.008, pattern: blink(0.3 + k * 0.1, 0.7) });
    }
  }

  // ================================================================ frame
  update(t: number, dt: number) {
    this.leds.update(t);
    for (const a of this.anims) a.f(a.o, t, dt);
    for (const s of this.screens) s?.update(dt, t);
    for (const tb of this.tubes) tb.update(dt, t);
    for (const f of this.fogs) f.uTime.value = t;
    for (const bc of this.beacons) bc.spin.rotation.y = t * 4.2 + bc.ph;
  }
}

// ------------------------------------------------------------------ shared bits
/** frost creeping in round a glass pane of w x h (for a door that moves: add it to the door) */
export function frostCard(w: number, h: number): THREE.Mesh {
  const fr = card(frost ??= frostTex(), w, h, 'alpha');
  fr.renderOrder = 5;
  return fr;
}
let kp: THREE.Texture | null = null, bio: THREE.Texture | null = null, pad: THREE.Texture | null = null, frost: THREE.Texture | null = null, watchersTex: THREE.Texture | null = null;
let padMat: THREE.Material | null = null, vitGlass: THREE.Material | null = null, stripMat: THREE.Material | null = null, mirrorMat: THREE.Material | null = null;
const glassMats = new Map<string, THREE.Material>();
/** wired glass over w x h metres (the mesh repeats every 0.3 m) */
function glassMat(tex: THREE.Texture, w: number, h: number): THREE.Material {
  const k = `${w.toFixed(2)}x${h.toFixed(2)}`;
  let m = glassMats.get(k);
  if (!m) {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / 0.42, h / 0.42); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 });
    glassMats.set(k, m);
  }
  return m;
}
/** two watchers behind a one-way mirror and a console glow, barely there (alpha) */
function watchers(): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 96;
  const c = cv.getContext('2d')!;
  const R = rng(5);
  for (const [cx, s] of [[52, 1], [104, 0.92]] as [number, number][]) {
    for (let y = 0; y < 96; y++) for (let x = -30; x <= 30; x++) {
      const hy = y - 30 * s, head = (x * x) / (90 * s) + (hy * hy) / (150 * s) < 1, sh = y > 44 * s && Math.abs(x) < (22 + (y - 44 * s) * 0.3) * s;
      if ((head || sh) && R() < 0.85) { c.fillStyle = `rgba(110,135,150,${0.22 + R() * 0.08})`; c.fillRect(cx + x, y, 1, 1); }
    }
  }
  for (let x = 20; x < 140; x++) for (let y = 82; y < 96; y++) if (R() < 0.6) { c.fillStyle = `rgba(80,200,120,${0.12 + R() * 0.12})`; c.fillRect(x, y, 1, 1); }
  for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(255,120,60,0.5)'; c.fillRect(30 + i * 18, 86, 2, 2); }
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a CRT set whose face centre is at a world point, turned ry (the monitor kit's housing) */
function crtSetAt(b: FacetBuilder, x: number, y: number, z: number, w: number, h: number, ry: number, color: number) {
  return crtSet(b, x, y, z, w, h, { color, depth: w * 0.8, ry, seed: seedN++ });
}

// ------------------------------------------------------------------ the anomalous objects
const blobMats = new Map<string, THREE.Material>();
function blobMat(color: number, emis = 0.12, opacity = 1): THREE.Material {
  const k = color + ':' + emis + ':' + opacity;
  let m = blobMats.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.0, flatShading: true, emissive: new THREE.Color(color).multiplyScalar(emis), transparent: opacity < 1, opacity }); blobMats.set(k, m); }
  return m;
}
/** a lumpy, noise-displaced sphere (radius r, squashed), flat-shaded */
function lump(r: number, seed: number, detail = 2, sq = 0.7, amp = 0.18): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 9 + seed) * Math.sin(v.y * 7 + seed * 2) * Math.sin(v.z * 8 + seed * 3) + Math.sin(v.x * 17 + v.z * 13 + seed) * 0.4;
    v.multiplyScalar(1 + n * amp);
    if (v.y < 0) v.y *= sq * 0.7; else v.y *= sq;
    // melt: the low half spreads out
    if (v.y < r * 0.1) { const k = 1 + (r * 0.1 - v.y) / r * 0.6; v.x *= k; v.z *= k; }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return flat(g);
}
/** the split-bear: a gummy bear melted into a blob (life size), still furred, old limbs out of it, a bud splitting off; it quivers */
export function blob(mats: FMats, anims: Anim[], s = 0.6): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(lump(s, 3.1, 3, 0.62, 0.16), blobMat(0xc8402a, 0.16, 0.92));
  body.position.y = s * 0.38; body.castShadow = true; g.add(body);
  const bud = new THREE.Mesh(lump(s * 0.42, 7.7, 2, 0.75, 0.2), blobMat(0xd8562e, 0.2, 0.9));
  bud.position.set(s * 0.82, s * 0.2, s * 0.2); bud.castShadow = true; g.add(bud);
  const neck = new THREE.Mesh(lump(s * 0.18, 1.3, 1, 1, 0.1), blobMat(0xd04a2c, 0.18, 0.9)); neck.position.set(s * 0.6, s * 0.24, s * 0.15); neck.scale.set(1.6, 0.8, 1); g.add(neck);
  const fb = new FacetBuilder();
  // fur: matted tufts still rooted in the candy flesh
  const R = rng(17);
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, e = R() * 1.1 - 0.1, rr = s * (0.95 + R() * 0.12);
    const x = Math.cos(a) * Math.cos(e) * rr, y = s * 0.38 + Math.sin(e) * rr * 0.6, z = Math.sin(a) * Math.cos(e) * rr;
    const n = new THREE.Vector3(x, (y - s * 0.38) * 1.4, z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    fb.add('sponge', prism(0.012 + R() * 0.01, 0.05 + R() * 0.06, 4, { rTop: 0.002 }), [0x6a4022, 0x5a341c, 0x7a4a26][i % 3], new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
  }
  // old limbs: a furred forearm with claws, a hind leg, an ear
  fb.add('sponge', tube([[-s * 0.6, s * 0.4, s * 0.3], [-s * 0.95, s * 0.55, s * 0.55], [-s * 1.15, s * 0.25, s * 0.75]], s * 0.09, 8, 6), 0x6a4022);
  for (let k = 0; k < 4; k++) fb.add('bakelite', prism(0.008, 0.06, 4, { rTop: 0.001 }), 0x1a1410, at(-s * 1.18 + k * 0.02, s * 0.2, s * 0.8 + k * 0.012, 0.9, 0, 0.3));
  fb.add('sponge', tube([[s * 0.2, s * 0.2, -s * 0.6], [s * 0.3, s * 0.1, -s * 0.95], [s * 0.45, 0.03, -s * 1.1]], s * 0.11, 8, 6), 0x5a341c);
  fb.add('sponge', hull([[-0.05, 0, -0.02], [0.05, 0, -0.02], [-0.04, 0.07, 0], [0.04, 0.07, 0], [0, 0.09, 0.02], [0, 0, 0.03]]), 0x6a4022, at(-s * 0.1, s * 0.92, -s * 0.15, 0.3, 0.4, 0.2));
  // one glassy eye, sunk in
  fb.add('bakelite', gem(0.03, 6, 0.03), 0x0a0808, at(-s * 0.25, s * 0.68, s * 0.62, Math.PI / 2, 0, 0));
  g.add(fb.build(mats));
  anims.push({ o: g, f: (o, t) => { const k = Math.sin(t * 2.6) * 0.03 + Math.sin(t * 7.1) * 0.008; body.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5); bud.scale.setScalar(1 + Math.sin(t * 2.6 + 1.2) * 0.05); neck.scale.set(1.6 + Math.sin(t * 2.6 + 0.6) * 0.2, 0.8, 1); void o; } });
  return g;
}
/** an anomalous object (about 0.2 m), on its own origin; adds its idle motion to anims */
export function curio(kind: CurioKind, mats: FMats, anims: Anim[]): THREE.Group {
  const g = new THREE.Group(), b = new FacetBuilder();
  // the group's base y is set by the caller; the motion moves a child pivot
  const pivot = new THREE.Group(); g.add(pivot);
  const bob = (amp: number, spin: number) => anims.push({ o: pivot, f: (o, t) => { o.position.y = Math.sin(t * 1.3 + spin * 7) * amp; o.rotation.y = t * spin; } });
  switch (kind) {
    case 'watch': {
      b.add('brass', lathe([[0, -0.012], [0.07, -0.012], [0.078, 0], [0.07, 0.012], [0, 0.012]], 16), 0xd8b060, at(0, 0, 0, Math.PI / 2));
      b.add('enamel', prism(0.064, 0.004, 16), 0xf0e8d4, at(0, 0, 0.012, Math.PI / 2));
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.add('bakelite', cbox(0.004, 0.01, 0.002, 0.001), 0x1a1a1a, at(Math.cos(a) * 0.054, Math.sin(a) * 0.054, 0.015, 0, 0, a + Math.PI / 2)); }
      for (const [l, a] of [[0.05, 0.4], [0.035, 2.2], [0.055, 4.1]] as [number, number][]) b.add('bakelite', cbox(0.004, l, 0.002, 0.001), 0x1a1a1a, at(Math.sin(a) * l / 2, Math.cos(a) * l / 2, 0.016, 0, 0, -a));
      b.add('brass', ring(0.012, 0.012, 0.006, 0.004, 8), 0xd8b060, at(0, 0.088, 0, Math.PI / 2));
      b.add('brass', prism(0.012, 0.02, 8), 0xd8b060, at(0, 0.076, 0));
      // the rim runs: a drip of brass hanging off the bottom
      b.add('brass', hull([[-0.03, -0.06, -0.01], [0.03, -0.065, -0.01], [-0.02, -0.06, 0.012], [0.02, -0.06, 0.012], [0.0, -0.13, 0], [0.008, -0.11, 0.004]]), 0xd8b060);
      b.add('metal', tube([[0, 0.1, 0], [0.04, 0.14, 0.02], [0.08, 0.1, 0.04], [0.06, 0.02, 0.05], [0.09, -0.04, 0.02]], 0.004, 16, 4), 0xc8a050);
      bob(0.015, 0.4); break;
    }
    case 'doll': {
      b.add('enamel', lathe([[0, -0.07], [0.04, -0.066], [0.068, -0.03], [0.072, 0.01], [0.062, 0.05], [0.035, 0.075], [0, 0.08]], 10), 0xf0e4d8, at(0, 0.02, 0));
      b.add('enamel', lathe([[0, -0.03], [0.03, -0.03], [0.026, 0.0], [0, 0.0]], 8), 0xf0e4d8, at(0, -0.06, 0));
      b.add('leather', hull([[-0.075, 0.0, -0.06], [0.075, 0.0, -0.06], [-0.07, 0.07, -0.04], [0.07, 0.07, -0.04], [0, 0.11, -0.02], [-0.05, -0.06, -0.07], [0.05, -0.06, -0.07], [0, 0.09, 0.03]]), 0x3a2414, at(0, 0.02, 0));
      // a hairline crack across the smooth face, no features at all
      b.add('bakelite', tube([[-0.02, 0.07, 0.06], [0.0, 0.04, 0.07], [-0.01, 0.01, 0.072], [0.02, -0.02, 0.066]], 0.002, 6, 3), 0x2a2420);
      b.add('paint', cbox(0.12, 0.05, 0.06, 0.01), 0x8a2a3a, at(0, -0.11, 0));
      anims.push({ o: pivot, f: (o, t) => { o.rotation.y = Math.sin(t * 0.13) * 0.9; } });
      break;
    }
    case 'cube': {
      const e = 0.11;
      for (const ax of [0, 1, 2]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        const p: V3 = [0, 0, 0]; const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3; p[o1] = s1 * e / 2; p[o2] = s2 * e / 2;
        const sz: V3 = [0.012, 0.012, 0.012]; sz[ax] = e + 0.012;
        b.add('bakelite', cbox(sz[0], sz[1], sz[2], 0.003), 0x16161a, at(p[0], p[1], p[2]));
      }
      const core = new THREE.Mesh(cbox(0.05, 0.05, 0.05, 0.008), new THREE.MeshBasicMaterial({ color: 0x9a7aff, toneMapped: false }));
      core.userData.noGlow = true; pivot.add(core);
      anims.push({ o: core, f: (o, t) => { o.rotation.set(t * 0.7, t * 1.1, t * 0.4); const k = 0.9 + Math.sin(t * 3) * 0.1; o.scale.setScalar(k); } });
      anims.push({ o: pivot, f: (o, t) => { o.rotation.set(Math.sin(t * 0.3) * 0.5, -t * 0.25, 0.6); o.position.y = Math.sin(t * 1.1) * 0.02; } });
      break;
    }
    case 'phone': {
      b.add('bakelite', hull([[-0.1, 0, -0.08], [0.1, 0, -0.08], [-0.1, 0, 0.08], [0.1, 0, 0.08], [-0.07, 0.07, -0.06], [0.07, 0.07, -0.06], [-0.08, 0.05, 0.07], [0.08, 0.05, 0.07]]), 0x141414, at(0, -0.08, 0));
      b.add('chrome', prism(0.05, 0.008, 12), 0xd8dcdc, at(0, -0.015, 0.035, 0.5, 0, 0));
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 1.6 + 0.6; b.add('bakelite', prism(0.007, 0.01, 6), 0x0a0a0a, at(Math.cos(a) * 0.036, -0.012 + Math.sin(a) * 0.036 * 0.88, 0.04 + Math.sin(a) * 0.036 * 0.47, 0.5, 0, 0)); }
      b.add('bakelite', hull([[-0.11, 0, -0.02], [0.11, 0, -0.02], [-0.11, 0.03, -0.02], [0.11, 0.03, -0.02], [-0.12, 0.0, 0.03], [0.12, 0.0, 0.03], [-0.04, 0.035, 0.0], [0.04, 0.035, 0.0]]), 0x141414, at(0, 0.0, -0.04));
      // the cord, tied in a knot it should not be able to tie
      const pts: V3[] = [];
      for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2; pts.push([0.12 + 0.03 * (Math.sin(t) + 2 * Math.sin(2 * t)), -0.06 + 0.03 * (Math.cos(t) - 2 * Math.cos(2 * t)), -0.03 * Math.sin(3 * t)]); }
      b.add('rubber', tube(pts, 0.004, 60, 4), 0x1a1a1a);
      anims.push({ o: pivot, f: (o, t) => { const ring2 = Math.sin(t * 0.21) > 0.93; o.rotation.z = ring2 ? Math.sin(t * 60) * 0.03 : 0; o.position.y = ring2 ? Math.abs(Math.sin(t * 30)) * 0.004 : 0; } });
      break;
    }
    case 'mask': {
      const geo = lathe([[0, -0.1], [0.05, -0.095], [0.075, -0.05], [0.08, 0.02], [0.06, 0.08], [0, 0.1]], 10);
      geo.scale(1, 1, 0.5);
      b.add('enamel', geo, 0xf2ece0, at(0, 0, 0));
      for (const s of [-1, 1]) b.add('bakelite', gem(0.016, 6, 0.01), 0x050505, at(s * 0.03, 0.02, 0.036, Math.PI / 2, 0, 0));
      b.add('bakelite', tube([[-0.035, -0.035, 0.03], [0, -0.05, 0.036], [0.035, -0.035, 0.03]], 0.004, 8, 3), 0x050505);
      b.add('paint', tube([[-0.04, -0.03, 0.03], [-0.03, -0.06, 0.03], [-0.033, -0.09, 0.025]], 0.003, 6, 3), 0x8a1a14);
      anims.push({ o: pivot, f: (o, t) => { o.rotation.y = Math.sin(t * 0.2) * 0.25; o.position.y = Math.sin(t * 0.9) * 0.01; } });
      break;
    }
    case 'key': {
      b.add('brass', prism(0.009, 0.32, 8), 0xd8b060, at(0, -0.04, 0));
      b.add('brass', ring(0.035, 0.035, 0.012, 0.012, 10), 0xd8b060, at(0, 0.14, 0, Math.PI / 2));
      b.add('brass', cbox(0.04, 0.05, 0.008, 0.002), 0xd8b060, at(0.02, -0.17, 0));
      b.add('brass', cbox(0.016, 0.012, 0.008, 0.002), 0xd8b060, at(0.045, -0.155, 0));
      bob(0.02, 0.5); break;
    }
    case 'shard': {
      const geo = jitter(gem(0.05, 5, 0.14, 0.3), 0.02, 4);
      b.add('bakelite', geo, 0x0c0a12);
      const glow = new THREE.Mesh(gem(0.02, 5, 0.07), new THREE.MeshBasicMaterial({ color: 0xb05aff, toneMapped: false, transparent: true, opacity: 0.8 }));
      glow.userData.noGlow = true; pivot.add(glow);
      anims.push({ o: pivot, f: (o, t) => { o.rotation.set(Math.sin(t * 0.5) * 0.3, t * 0.6, 0.2); o.position.y = Math.sin(t * 0.8) * 0.03; } });
      break;
    }
    case 'jar': {
      const jg = new THREE.Mesh(lathe([[0.065, -0.1], [0.07, -0.08], [0.07, 0.07], [0.05, 0.09], [0.05, 0.1]], 10), new THREE.MeshBasicMaterial({ color: 0x3a4a44, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      jg.userData.noGlow = true; jg.renderOrder = 6; pivot.add(jg);
      b.add('metal', prism(0.054, 0.025, 10), 0x8a8270, at(0, 0.11, 0));
      const R = rng(3);
      for (let i = 0; i < 26; i++) b.add('enamel', hull([[-0.008, 0, -0.006], [0.008, 0, -0.006], [-0.006, 0, 0.006], [0.006, 0, 0.006], [-0.003, 0.02, 0], [0.003, 0.02, 0]]), [0xf0e8d0, 0xe0d4b0, 0xc8b890][i % 3], at((R() - 0.5) * 0.1, -0.095 + Math.floor(i / 9) * 0.02 + R() * 0.01, (R() - 0.5) * 0.1, R() * 3, R() * 3, R() * 3));
      b.add('paint', cbox(0.07, 0.04, 0.002, 0.001), 0xe8e0c8, at(0, 0.0, 0.071));
      break;
    }
    case 'hourglass': {
      for (const y of [-0.12, 0.12]) b.add('wood', prism(0.07, 0.02, 8), 0x5a3a22, at(0, y, 0));
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.add('wood', prism(0.006, 0.24, 6), 0x5a3a22, at(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06)); }
      const gl = new THREE.Mesh(lathe([[0.001, -0.11], [0.045, -0.1], [0.05, -0.06], [0.008, 0], [0.05, 0.06], [0.045, 0.1], [0.001, 0.11]], 10), new THREE.MeshBasicMaterial({ color: 0x3a4a50, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      gl.userData.noGlow = true; gl.renderOrder = 6; pivot.add(gl);
      // the sand gathers in the top bulb; a thread of it runs up
      b.add('sponge', lathe([[0, 0.1], [0.042, 0.095], [0.03, 0.05], [0, 0.04]], 8), 0xd8b878, at(0, 0, 0));
      b.add('sponge', prism(0.002, 0.08, 4), 0xd8b878, at(0, 0.0, 0));
      b.add('sponge', lathe([[0, -0.1], [0.02, -0.1], [0, -0.09]], 8), 0xd8b878, at(0, 0, 0));
      anims.push({ o: pivot, f: (o, t) => { o.rotation.y = t * 0.15; } });
      break;
    }
    case 'gummy': {
      const bl = new THREE.Mesh(lump(0.08, 2.2, 2, 0.6, 0.2), blobMat(0xe0402a, 0.25, 0.85));
      bl.castShadow = true; pivot.add(bl);
      const R = rng(9);
      for (let i = 0; i < 18; i++) { const a = R() * 6.28, e = R() * 1.2; b.add('sponge', prism(0.003, 0.02 + R() * 0.02, 4, { rTop: 0.001 }), 0x6a4022, at(Math.cos(a) * Math.cos(e) * 0.085, Math.sin(e) * 0.05, Math.sin(a) * Math.cos(e) * 0.085, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)); }
      b.add('sponge', tube([[0.06, 0.0, 0.03], [0.11, 0.02, 0.06], [0.14, -0.03, 0.08]], 0.012, 6, 5), 0x6a4022);
      anims.push({ o: bl, f: (o, t) => { const k = Math.sin(t * 2.4) * 0.05; o.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5); } });
      pivot.position.y = -0.1;
      break;
    }
  }
  if (!b.empty) pivot.add(b.build(mats));
  return g;
}

/** a strap band (re-export of the facet kit's) */
function band(rx: number, rz: number, h: number, t: number, n = 10) { return ring(rx, rz, h, t, n); }

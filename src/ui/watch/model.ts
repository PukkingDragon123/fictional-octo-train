// The watch in first person: your left forearm (the shared smooth arm from
// src/fp/hands.ts, sleeve rolled back) raised in front of your face, the
// BAILIFF band bolted through the wrist, and on it a chunky retro-futurist
// wrist computer: a rounded brushed-steel case, a lacquered bakelite
// faceplate, a curved phosphor CRT (src/gfx/crt.ts) behind a bevelled steel
// bezel, a knurled function dial, a needle gauge under glass, two bat-handle
// toggles, three jewel lamps, a speaker grille, a stamped brass maker's plate
// and a telescopic antenna. Multi-tool modules bolt on as they are researched:
// a chrome lamp, a brass laser emitter fed by two vacuum tubes, a scanner dish,
// fabricator pincers and a bakelite battery.
//
// Everything is round, bevelled or lathed (no raw boxes), with physically
// based materials: brushed metal with real speculars and a room reflection,
// clear-lacquered bakelite, glass with fresnel.
//
// Device space: X runs along the forearm (elbow at -X, hand at +X), Y up,
// Z toward the eye. The screen sits at SCREEN (centre) facing +Z.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { G } from '../../game/G';
import type { FpArm } from '../../fp/hands';
import { cssFont } from '../../gfx/crt';

/** the tube's character field (layout units) */
export const SCR_W = 224, SCR_H = 136;
/** metres per layout unit (the CRT is 67 x 41 mm) */
export const SCR_PX = 0.0003;
export const SCREEN = { w: SCR_W * SCR_PX, h: SCR_H * SCR_PX, x: -0.036, y: 0.003, z: 0.0 };

const ARM_R = 0.027;                  // the band's inner radius over the shared forearm
const TOP = ARM_R * 0.82 + 0.0042;    // underside of the case: it sits on the (flattened) cuff
export const HOUSE = { w: 0.124, h: 0.076, d: 0.022, cx: SCREEN.x + 0.015 };
const FRONT = TOP + HOUSE.d;          // the faceplate
SCREEN.z = FRONT + 0.0022;
/** the right-hand control column (function dial above, needle gauge below) */
const COL_X = HOUSE.cx + HOUSE.w / 2 - 0.02;
/** where the wrist joint of the shared arm sits (the band is just behind it) */
export const WRIST_X = HOUSE.cx + HOUSE.w / 2 + 0.004;

// ---------------------------------------------------------------- textures
let texReady = false;
/** atlas pictures for the small printed parts (dial ring, gauge face, cuff hazard band, knob tops) */
function textures() {
  if (texReady) return;
  texReady = true;
  const A = atlas();
  A.add('wt_knurl', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, x % 2 ? 0x2a2420 : (y === 0 ? 0x9a948c : 0x6a645c))); });
  A.add('wt_knobtop', 24, 24, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 11.5, y - 11.5); pc.set(x, y, d > 11.4 ? 0x1a120c : d > 9.6 ? 0x4a3a2c : d > 9 ? 0x5a4838 : 0x2e2018); });
    for (let y = 2; y < 11; y++) { pc.set(11, y, 0xe8e0c8); pc.set(12, y, 0xe8e0c8); }
  });
  A.add('wt_dialring', 32, 32, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); pc.set(x, y, d > 15.6 ? 0x14100c : 0x1c1410); });
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.75 + i * (Math.PI * 1.5 / 8); for (let r = 12; r < 15; r += 0.5) pc.set(Math.round(15.5 + Math.cos(a) * r), Math.round(15.5 + Math.sin(a) * r), i === 0 ? 0xffb030 : 0xd8d0b8); }
  });
  A.add('wt_gauge', 32, 32, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); pc.set(x, y, d > 15.4 ? 0x2a2420 : d > 14 ? 0x9a9488 : 0xece2c4); });
    for (let i = 0; i <= 20; i++) { const a = Math.PI * (0.8 + i * 0.07); const r0 = i % 5 ? 11 : 9; for (let r = r0; r < 13.2; r += 0.4) pc.set(Math.round(15.5 + Math.cos(a) * r), Math.round(15.5 + Math.sin(a) * r), i < 4 ? 0xc02a1a : 0x2a2018); }
  });
  A.add('wt_cuff', 24, 8, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.15 ? 0x8a9298 : 0xa2aab0); });
    for (let x = 0; x < 24; x++) { const c = ((x >> 1) % 2) === 0 ? 0xd8a42a : 0x17150f; pc.set(x, 3, c); pc.set(x, 4, c); }
    for (const x of [3, 11, 19]) { pc.set(x, 1, 0xe8eef0); pc.set(x, 6, 0xe8eef0); }
    for (let i = 0; i < 6; i++) pc.set(rng.int(0, 23), rng.int(1, 6), 0x5a2a1a);
  });
  A.add('wt_crust', 8, 8, (pc, rng) => {
    pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5) / 4.5 + rng.next() * 0.3; pc.set(x, y, d < 0.45 ? 0x7a0d0a : d < 0.8 ? 0x4a0a08 : 0x2a1a14); });
  });
}

/** a small procedural canvas texture (cached), tiled */
const TEX = new Map<string, THREE.CanvasTexture>();
const REDRAW: (() => void)[] = [];
/** repaint the printed parts (after the web fonts arrive) */
export function refreshPrinted() { for (const f of REDRAW) f(); }
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true, printed = false): THREE.CanvasTexture {
  let t = TEX.get(key);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  if (printed) REDRAW.push(() => { draw(c.getContext('2d')!, w, h); for (const [, tx] of TEX) if (tx.image === c) tx.needsUpdate = true; for (const m of Object.values(SM || {})) if (m.map?.image === c) m.map.needsUpdate = true; });
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
/** brushed steel: long fine streaks, a few scratches, grime in the corners */
const brushed = () => canvasTex('wt_brushed', 256, 256, (g, w, h) => {
  g.fillStyle = '#a9adb0'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) { const v = 150 + rnd() * 40; g.fillStyle = `rgba(${v},${v + 3},${v + 6},0.35)`; g.fillRect(0, y, w, 1); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(235,240,242,${0.2 + rnd() * 0.3})`; g.lineWidth = 0.6; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + 8 + rnd() * 30, y + (rnd() - 0.5) * 6); g.stroke(); }
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(70,58,44,${0.06 + rnd() * 0.08})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 18, 0, Math.PI * 2); g.fill(); }
});
/** bakelite: dark brown, mottled, with a fine grain */
const bakelite = () => canvasTex('wt_bakelite', 128, 128, (g, w, h) => {
  g.fillStyle = '#35241a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${70 + rnd() * 40},${46 + rnd() * 20},${30 + rnd() * 14},${0.08 + rnd() * 0.12})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 9, 0, Math.PI * 2); g.fill(); }
});
/** hazard stripes */
const hazard = () => canvasTex('wt_hazard', 64, 16, (g, w, h) => {
  g.fillStyle = '#17150f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d8a42a';
  for (let x = -h; x < w + h; x += 16) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 8, h); g.lineTo(x + 8 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  g.fillStyle = 'rgba(40,30,20,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(rnd() * w, rnd() * h, 2, 1);
});
/** a speaker grille: punched holes in bakelite */
const grille = () => canvasTex('wt_grillet', 64, 16, (g, w, h) => {
  g.fillStyle = '#3a281c'; g.fillRect(0, 0, w, h);
  for (let y = 2; y < h; y += 4) for (let x = 2 + ((y >> 2) % 2) * 2; x < w; x += 4) { g.fillStyle = '#0a0806'; g.beginPath(); g.arc(x, y, 1.1, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(120,90,60,0.4)'; g.fillRect(x - 1, y + 1, 2, 0.6); }
});
/** the stamped brass maker's plate (original lettering) */
const plate = () => canvasTex('wt_platet', 128, 36, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#f0d488'); grd.addColorStop(1, '#a8803a');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.font = `bold 13px ${cssFont('--font-sign', 'sans-serif')}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,240,200,0.6)'; g.fillText('BAILIFF  MK·IX', w / 2 + 0.6, h * 0.36 + 0.6);
  g.fillStyle = '#5a3e14'; g.fillText('BAILIFF  MK·IX', w / 2, h * 0.36);
  g.font = `9px ${cssFont('--font-typeset', 'monospace')}`; g.fillText('MERIDIAN INSTITUTE · REMITTANCE', w / 2, h * 0.74);
  for (const [x, y] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) { g.fillStyle = '#6a4a18'; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
}, true, true);

// ---------------------------------------------------------------- materials
type MatKey = 'steel' | 'bake' | 'brass' | 'chrome' | 'rubber' | 'paint';
let ENV: THREE.Texture | null = null;
let MATS: Record<MatKey, THREE.MeshStandardMaterial> | null = null;
/** a small room to reflect: real speculars on the metal, a sheen on the lacquer */
function envMap(): THREE.Texture | null {
  if (ENV) return ENV;
  try {
    const pm = new THREE.PMREMGenerator(G.pr.renderer);
    ENV = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  } catch (e) { console.warn('watch env', e); }
  return ENV;
}
/**
 * ModelBuilder geometry addresses the pixel atlas per face (aAtlas rect + a
 * repeating uv); teach a stock PBR material to sample it the same way.
 */
function atlasAware<T extends THREE.MeshStandardMaterial>(m: T): T {
  const size = atlas().size;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAtlasSize = { value: size };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aAtlas;\nvarying vec4 vAtlas;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vAtlas = aAtlas;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAtlasSize;\nvarying vec4 vAtlas;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec2 texPx = max(vAtlas.zw * uAtlasSize, vec2(1.0));
  vec2 fuv = fract(vMapUv);
  fuv = (floor(fuv * texPx) + 0.5) / texPx;
  vec2 auv = vAtlas.xy + vec2(fuv.x, 1.0 - fuv.y) * vAtlas.zw;
  diffuseColor *= texture2D(map, auv);
#endif`);
  };
  m.customProgramCacheKey = () => 'watch-atlas';
  return m;
}
const lowQ = () => G.pr?.quality === 'low';
/** clearcoat / sheen layers only off the low quality setting */
function phys(o: THREE.MeshPhysicalMaterialParameters): THREE.MeshStandardMaterial {
  if (!lowQ()) return new THREE.MeshPhysicalMaterial(o);
  const { clearcoat, clearcoatRoughness, sheen, sheenRoughness, sheenColor, ...rest } = o;
  void clearcoat; void clearcoatRoughness; void sheen; void sheenRoughness; void sheenColor;
  return new THREE.MeshStandardMaterial(rest as THREE.MeshStandardMaterialParameters);
}
/** atlas-textured PBR for ModelBuilder parts (lathed knobs, cylinders, printed faces) */
export function watchMats(): Record<MatKey, THREE.MeshStandardMaterial> {
  if (MATS) return MATS;
  const env = envMap();
  const map = atlas().texture;
  const base = { map, vertexColors: true, envMap: env, side: THREE.DoubleSide };
  MATS = {
    steel: new THREE.MeshStandardMaterial({ ...base, metalness: 0.85, roughness: 0.36, envMapIntensity: 1.0 }),
    bake: phys({ ...base, metalness: 0, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ ...base, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.1 }),
    chrome: new THREE.MeshStandardMaterial({ ...base, metalness: 1, roughness: 0.12, envMapIntensity: 1.2 }),
    rubber: new THREE.MeshStandardMaterial({ ...base, metalness: 0, roughness: 0.92, envMapIntensity: 0.3 }),
    paint: new THREE.MeshStandardMaterial({ ...base, metalness: 0.1, roughness: 0.55, envMapIntensity: 0.6 }),
  };
  for (const m of Object.values(MATS)) atlasAware(m);
  return MATS;
}
/** plain PBR for the rounded, bevelled parts (their own uvs; procedural canvas maps) */
let SM: Record<string, THREE.MeshStandardMaterial> | null = null;
function solids() {
  if (SM) return SM;
  const env = envMap();
  const rep = (t: THREE.Texture, x: number, y: number) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const b = brushed(), bk = bakelite();
  SM = {
    // extruded shapes carry uvs in metres; rounded boxes 0..1 per face
    steelM: new THREE.MeshStandardMaterial({ map: rep(b, 9, 9), roughnessMap: rep(b, 9, 9), color: 0xd8dcdf, metalness: 0.88, roughness: 0.42, envMap: env, envMapIntensity: 1.05, side: THREE.DoubleSide }),
    steelB: new THREE.MeshStandardMaterial({ map: rep(b, 1.4, 1.4), roughnessMap: rep(b, 1.4, 1.4), color: 0xc8ccd0, metalness: 0.86, roughness: 0.45, envMap: env, envMapIntensity: 1.0, side: THREE.DoubleSide }),
    bakeM: phys({ map: rep(bk, 14, 14), color: 0xffffff, metalness: 0, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.15, envMap: env, envMapIntensity: 0.8, side: THREE.DoubleSide }),
    bakeB: phys({ map: rep(bk, 1.2, 1.2), color: 0xffffff, metalness: 0, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.15, envMap: env, envMapIntensity: 0.8, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1e1b18, metalness: 0, roughness: 0.9, envMap: env, envMapIntensity: 0.25, side: THREE.DoubleSide }),
    hazard: new THREE.MeshStandardMaterial({ map: rep(hazard(), 4, 1), metalness: 0.15, roughness: 0.5, envMap: env, envMapIntensity: 0.5, side: THREE.DoubleSide }),
    grille: new THREE.MeshStandardMaterial({ map: rep(grille(), 1, 1), metalness: 0, roughness: 0.6, envMap: env, envMapIntensity: 0.4, side: THREE.DoubleSide }),
    plate: new THREE.MeshStandardMaterial({ map: rep(plate(), 1, 1), metalness: 0.75, roughness: 0.32, envMap: env, envMapIntensity: 1.0, side: THREE.DoubleSide }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8b060, metalness: 0.92, roughness: 0.28, envMap: env, envMapIntensity: 1.1, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf0f2f4, metalness: 1, roughness: 0.1, envMap: env, envMapIntensity: 1.25, side: THREE.DoubleSide }),
    crust: new THREE.MeshStandardMaterial({ color: 0x4a0c08, metalness: 0, roughness: 0.55, envMap: env, envMapIntensity: 0.4, side: THREE.DoubleSide }),
  };
  return SM;
}

// ---------------------------------------------------------------- rounded / bevelled shapes
const GEO = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };
function roundRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
/** a bevelled slab (a rounded rectangle extruded along +Z from z = 0), optionally with a rounded hole */
function slab(w: number, h: number, r: number, depth: number, bevel: number, hole?: { w: number; h: number; r: number }) {
  const key = `slab:${w}:${h}:${r}:${depth}:${bevel}:${hole ? hole.w + ':' + hole.h + ':' + hole.r : ''}`;
  return geo(key, () => {
    const s = roundRect(w, h, r);
    if (hole) s.holes.push(roundRect(hole.w, hole.h, hole.r) as unknown as THREE.Path);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
    g.computeVertexNormals();
    return g;
  });
}
const rbox = (w: number, h: number, d: number, r: number) => geo(`rbox:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

/** one ModelBuilder per material, each built into its own mesh (lathed and cylindrical parts) */
class Kit {
  private b = new Map<MatKey, ModelBuilder>();
  m(k: MatKey): ModelBuilder { let b = this.b.get(k); if (!b) { b = new ModelBuilder(); b.setFaceShading(false); this.b.set(k, b); } return b; }
  into(g: THREE.Object3D) { const M = watchMats(); for (const [k, b] of this.b) g.add(new THREE.Mesh(b.build(), M[k])); return g; }
}

export interface WatchModel {
  root: THREE.Group;
  /** the shared smooth left arm the watch is bolted to */
  arm: FpArm;
  stump: THREE.Object3D;
  screen: THREE.Mesh;
  /** jewel lamps: red alert, amber signal, green power */
  lamps: { power: THREE.Mesh; alert: THREE.Mesh; signal: THREE.Mesh };
  /** the function dial (rotates about its own Z) */
  knob: THREE.Object3D;
  /** the gauge needle (rotates about Z) */
  needle: THREE.Object3D;
  /** bat-handle toggles (pivot about X): torch, laser arm */
  toggles: { torch: THREE.Object3D; laser: THREE.Object3D };
  mods: { torch: THREE.Object3D; laser: THREE.Object3D; dish: THREE.Object3D; fab: THREE.Object3D; cell: THREE.Object3D };
  laserTip: THREE.Object3D;
  torchLens: THREE.Mesh;
  /** vacuum-tube filaments (glow when armed) */
  filaments: THREE.MeshStandardMaterial;
  laserLens: THREE.Mesh;
  antenna: THREE.Object3D;
}

const glowMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: 0x000000, roughness: 0.15, metalness: 0, side: THREE.DoubleSide });
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xe8f0e8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMap: envMap(), envMapIntensity: 1.4, side: THREE.DoubleSide });

/** set a lamp's lit colour (emissive) */
export function setLamp(m: THREE.Mesh, c: number) {
  const mat = m.material as THREE.MeshStandardMaterial;
  if (mat.userData.c === c) return;
  mat.userData.c = c;
  mat.emissive.setHex(c);
}

/**
 * Bolt the watch onto a shared first-person arm. The arm's root is the elbow
 * with the forearm along +Y and the palm on +Z: it is turned so the forearm
 * runs along the device's +X with the back of the wrist (and the case) toward
 * the eye, the wrist joint just past the case.
 */
export function buildWatchModel(screen: THREE.Mesh, arm: FpArm): WatchModel {
  textures();
  const root = new THREE.Group();
  const H = HOUSE, cx = H.cx, S = solids();

  // ---- the arm: forearm +Y -> device +X, palm +Z -> device -Z (so arm +X -> device +Y)
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1));
  arm.root.quaternion.setFromRotationMatrix(basis);
  arm.root.position.set(WRIST_X - 0.26, 0, -0.002);
  root.add(arm.root);
  // where the hand was: a cauterised, bound stump at the wrist
  const stump = new THREE.Group();
  {
    const g = new THREE.SphereGeometry(0.026, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateZ(-Math.PI / 2); g.scale(0.45, 1, 0.8);
    stump.add(mesh(g, S.crust, WRIST_X - 0.004, 0, 0));
    const wrap = new THREE.CylinderGeometry(0.0275, 0.0265, 0.016, 16, 1, true); wrap.rotateZ(-Math.PI / 2); wrap.scale(1, 1, 0.8);
    stump.add(mesh(wrap, new THREE.MeshStandardMaterial({ color: 0xc8b8a0, roughness: 0.95, side: THREE.DoubleSide }), WRIST_X - 0.012, 0, 0));
  }
  stump.visible = false;
  root.add(stump);

  // ---- the BAILIFF cuff round the wrist, bolted through (lathed, flattened to the forearm)
  const K = new Kit();
  const st = K.m('steel');
  st.push().translate(0, 0, 0).scale(1, 1, 0.82).rotateZ(-Math.PI / 2);
  st.cylinder(0, cx - 0.04, 0, ARM_R + 0.004, 0.08, 20, { sides: 'wt_cuff', top: 'wt_cuff', bottom: 'wt_cuff' }, { fit: true });
  st.pop();
  K.into(root);
  for (const sy of [1, -1]) {
    const by = sy * (ARM_R * 0.82 + 0.004);
    const bolt = new THREE.CylinderGeometry(0.0055, 0.0062, 0.006, 6); // hex head
    root.add(mesh(bolt, S.chrome, cx - 0.045, by, 0));
    const crust = new THREE.SphereGeometry(0.008, 10, 6); crust.scale(1.4, 0.4, 1);
    root.add(mesh(crust, S.crust, cx - 0.045, by - sy * 0.002, 0.006));
  }

  // ---- the case: a rounded brushed-steel shell, a bevelled bakelite faceplate
  root.add(mesh(rbox(H.w, H.h, H.d, 0.007), S.steelB, cx, 0, TOP + H.d / 2));
  root.add(mesh(slab(H.w - 0.01, H.h - 0.01, 0.006, 0.0012, 0.0012), S.bakeM, cx, 0, FRONT - 0.0004));
  // bright top rail and hazard-striped bottom rail, rounded
  root.add(mesh(rbox(H.w - 0.012, 0.005, H.d * 0.7, 0.0024), S.chrome, cx, H.h / 2 + 0.0008, TOP + H.d / 2));
  root.add(mesh(rbox(H.w - 0.012, 0.005, H.d * 0.7, 0.0024), S.hazard, cx, -H.h / 2 - 0.0008, TOP + H.d / 2));
  // rubber grips down the ends
  for (const sx of [-1, 1]) root.add(mesh(rbox(0.007, 0.05, H.d * 0.8, 0.003), S.rubber, cx + sx * (H.w / 2 + 0.002), -0.004, TOP + H.d / 2));
  // the CRT bezel: a bevelled steel frame with a rounded window, standing proud of the faceplate
  root.add(mesh(slab(SCREEN.w + 0.012, SCREEN.h + 0.012, 0.005, 0.0016, 0.0014, { w: SCREEN.w + 0.0006, h: SCREEN.h + 0.0006, r: 0.0036 }), S.steelM, SCREEN.x, SCREEN.y, FRONT + 0.0008));
  // the tube's dark surround inside the window
  root.add(mesh(slab(SCREEN.w + 0.002, SCREEN.h + 0.002, 0.0038, 0.0008, 0), S.rubber, SCREEN.x, SCREEN.y, FRONT + 0.0006));
  // speaker grille and the maker's plate along the bottom strip
  root.add(mesh(slab(0.036, 0.0078, 0.0025, 0.0006, 0.0005), S.grille, SCREEN.x - 0.014, -H.h / 2 + 0.0095, FRONT + 0.0008));
  {
    const pg = slab(0.027, 0.0076, 0.0016, 0.0006, 0.0004);
    // map the plate texture once across its face
    const g2 = pg.clone(); const uv = g2.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 0.0135) / 0.027, (uv.getY(i) + 0.0038) / 0.0076);
    root.add(mesh(g2, S.plate, SCREEN.x + 0.022, -H.h / 2 + 0.0095, FRONT + 0.0008));
  }
  // the control column: a dial plate (round, with detent ticks) and the gauge's bezel and face
  {
    const KK = new Kit();
    const pt = KK.m('paint');
    pt.push().translate(COL_X, 0.0165, FRONT + 0.0004).rotateX(Math.PI / 2);
    pt.cylinder(0, 0, 0, 0.0135, 0.0008, 28, { sides: 'wt_dialring', top: 'wt_dialring', bottom: 'wt_dialring' }, { fit: true });
    pt.pop();
    const sg = KK.m('steel');
    sg.push().translate(COL_X, -0.019, FRONT + 0.0004).rotateX(Math.PI / 2);
    sg.cylinder(0, 0, 0, 0.0118, 0.0018, 28, { sides: 'wt_knurl', top: 'wt_knurl', bottom: 'wt_knurl' }, { color: 0xe8e8e8, fit: true });
    sg.pop();
    pt.push().translate(COL_X, -0.019, FRONT + 0.0012).rotateX(Math.PI / 2);
    pt.cylinder(0, 0, 0, 0.0099, 0.0016, 28, { sides: 'wt_gauge', top: 'wt_gauge', bottom: 'wt_gauge' }, { fit: true });
    pt.pop();
    KK.into(root);
  }
  // toggle-switch collars on the top rail
  for (const tx of [cx - 0.006, cx + 0.008]) root.add(mesh(new THREE.CylinderGeometry(0.0034, 0.0042, 0.0028, 16), S.chrome, tx, H.h / 2 + 0.0024, TOP + H.d * 0.55));
  // rivets: domed brass heads
  const rivet = new THREE.SphereGeometry(0.0016, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    root.add(mesh(rivet, S.brass, cx + rx * (H.w / 2 - 0.0045), ry * (H.h / 2 - 0.0045), FRONT + 0.0009));
    root.add(mesh(rivet, S.brass, SCREEN.x + rx * (SCREEN.w / 2 + 0.0032), SCREEN.y + ry * (SCREEN.h / 2 + 0.0032), FRONT + 0.0032));
  }
  // armoured strap plates down the cuff
  for (const sx of [-1, 1]) root.add(mesh(rbox(0.016, 0.005, ARM_R * 1.4, 0.002), S.steelB, cx + sx * (H.w / 2 - 0.009), -ARM_R * 0.82 - 0.004, 0.004));

  // ---- the CRT (its own glass and shader)
  screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  root.add(screen);

  // ---- jewel lamps (glass domes in chrome collars) on the top strip
  const lampGeo = new THREE.SphereGeometry(0.0023, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(0.0027, 0.0007, 8, 18);
  const lamp = (i: number, glass: number) => {
    const x = SCREEN.x - SCREEN.w / 2 + 0.004 + i * 0.0085, y = SCREEN.y + SCREEN.h / 2 + 0.0105;
    root.add(mesh(ringGeo, S.chrome, x, y, FRONT + 0.0009));
    const m = new THREE.Mesh(lampGeo, glowMat(glass)); m.position.set(x, y, FRONT + 0.0009); root.add(m); return m;
  };
  const lamps = { power: lamp(0, 0x0e2a12), signal: lamp(1, 0x2a1e06), alert: lamp(2, 0x2a0a06) };

  // ---- the function dial: a knurled bakelite knob with a pointer
  const knob = new THREE.Group();
  {
    const KK = new Kit(), b = KK.m('bake');
    b.push().rotateX(Math.PI / 2);
    b.cylinder(0, 0, 0, 0.0084, 0.006, 24, { sides: 'wt_knurl', top: 'wt_knobtop', bottom: 'wt_knobtop' }, { fit: true });
    b.cylinder(0, 0.006, 0, 0.0068, 0.0022, 24, { sides: 'wt_knobtop', top: 'wt_knobtop', bottom: 'wt_knobtop' }, { fit: true, rTop: 0.0058 });
    b.pop();
    KK.into(knob);
  }
  knob.position.set(COL_X, 0.0165, FRONT);
  knob.userData.hit = 'dial';
  root.add(knob);

  // ---- needle gauge: a tapered red needle under a domed glass cover
  const needle = new THREE.Group();
  {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.00012, 0.0004, 0.0084, 6).translate(0, 0.0038, 0), glowMat(0x9a1810));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.0008, 12).rotateX(Math.PI / 2), S.brass);
    needle.add(n, hub);
  }
  needle.position.set(COL_X, -0.0215, FRONT + 0.0032);
  root.add(needle);
  const cover = new THREE.Mesh(new THREE.SphereGeometry(0.0099, 20, 6, 0, Math.PI * 2, 0, Math.PI * 0.18).rotateX(Math.PI / 2), glassMat());
  cover.scale.z = 0.5;
  cover.position.set(COL_X, -0.019, FRONT + 0.0012);
  root.add(cover);

  // ---- bat-handle toggles on the top rail (pivot at the base, flick along Z)
  const toggle = (x: number, which: string) => {
    const piv = new THREE.Group();
    piv.add(mesh(new THREE.CylinderGeometry(0.0017, 0.0011, 0.0085, 10).translate(0, 0.0042, 0), S.chrome));
    piv.add(mesh(new THREE.SphereGeometry(0.0018, 10, 6), S.chrome, 0, 0.0086, 0));
    piv.position.set(x, H.h / 2 + 0.0034, TOP + H.d * 0.55);
    piv.userData.hit = 'toggle'; piv.userData.which = which;
    root.add(piv);
    return piv;
  };
  const toggles = { torch: toggle(cx - 0.006, 'torch'), laser: toggle(cx + 0.008, 'laser') };

  // ---- telescopic antenna at the elbow end
  const antenna = new THREE.Group();
  antenna.add(mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.012, 10).translate(0, 0.006, 0), S.chrome));
  antenna.add(mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.014, 10).translate(0, 0.019, 0), S.chrome));
  antenna.add(mesh(new THREE.SphereGeometry(0.0026, 12, 8), S.brass, 0, 0.027, 0));
  antenna.position.set(cx - H.w / 2 + 0.008, H.h / 2 + 0.001, TOP + H.d * 0.4);
  antenna.rotation.z = 0.25;
  root.add(antenna);

  // ---- multi-tool modules
  // torch: a chrome lamp on the hand end of the case, lens facing along +X
  const torch = new THREE.Group();
  torch.add(mesh(new THREE.CylinderGeometry(0.0085, 0.0072, 0.012, 18).rotateZ(-Math.PI / 2), S.chrome));
  torch.add(mesh(rbox(0.008, 0.005, 0.011, 0.002), S.bakeB, -0.004, -0.008, 0));
  const torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.0074, 18).rotateY(Math.PI / 2), glowMat(0x3a3630));
  torchLens.position.set(0.0062, 0, 0); torch.add(torchLens);
  torch.position.set(cx + H.w / 2 + 0.006, 0.016, TOP + H.d * 0.55);
  root.add(torch);
  // laser: a brass emitter along the top rail, wound with copper, fed by two vacuum tubes
  const laser = new THREE.Group();
  const filaments = glowMat(0x2a1a10);
  {
    laser.add(mesh(rbox(0.022, 0.006, 0.012, 0.0022), S.bakeB, -0.012, 0.003, 0));            // tube socket block
    laser.add(mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.05, 16).rotateZ(-Math.PI / 2), S.brass, 0, 0.0105, 0));
    const coil = new THREE.TorusGeometry(0.0048, 0.0009, 6, 16).rotateY(Math.PI / 2);
    const copper = new THREE.MeshStandardMaterial({ color: 0xd8824a, metalness: 0.9, roughness: 0.32, envMap: envMap(), envMapIntensity: 1.0 });
    for (let i = 0; i < 6; i++) laser.add(mesh(coil, copper, -0.006 + i * 0.0036, 0.0105, 0));
    laser.add(mesh(new THREE.CylinderGeometry(0.0026, 0.0058, 0.008, 16).rotateZ(-Math.PI / 2), S.brass, 0.029, 0.0105, 0));
    const env = glassMat();
    for (const tx of [-0.018, -0.007]) {
      laser.add(mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.01, 6), filaments, tx, 0.016, 0));
      laser.add(mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.014, 16), env, tx, 0.0128, 0));
      laser.add(mesh(new THREE.SphereGeometry(0.0034, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), env, tx, 0.0198, 0));
    }
  }
  const laserLens = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 12).rotateY(Math.PI / 2), glowMat(0x401008));
  laserLens.position.set(0.0331, 0.0105, 0); laser.add(laserLens);
  const laserTip = new THREE.Object3D(); laserTip.position.set(0.035, 0.0105, 0); laser.add(laserTip);
  laser.position.set(cx + 0.03, H.h / 2 + 0.001, TOP + H.d * 0.45);
  root.add(laser);
  // scanner dish: brass, on a stalk by the antenna
  const dish = new THREE.Group();
  dish.add(mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.007, 10).translate(0, 0.0035, 0), S.chrome));
  dish.add(mesh(new THREE.SphereGeometry(0.0105, 18, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4).translate(0, 0.017, 0), S.brass));
  dish.add(mesh(new THREE.SphereGeometry(0.0014, 10, 6), S.brass, 0, 0.0105, 0));
  dish.position.set(cx - H.w / 2 + 0.024, H.h / 2 + 0.001, TOP + H.d * 0.5);
  root.add(dish);
  // fabricator: brass pincers over the knuckles
  const fab = new THREE.Group();
  fab.add(mesh(rbox(0.03, 0.01, 0.012, 0.003), S.bakeB));
  for (const s of [-1, 1]) {
    const jaw = new THREE.Group(); jaw.position.set(0.016, s * 0.004, 0.004); jaw.rotation.z = s * 0.45;
    jaw.add(mesh(new THREE.CapsuleGeometry(0.0022, 0.016, 4, 10).rotateZ(-Math.PI / 2), S.brass, 0.009, 0, 0));
    fab.add(jaw);
  }
  fab.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 12).rotateX(Math.PI / 2), S.brass, -0.006, 0.005, 0.007));
  fab.position.set(cx + H.w / 2 + 0.034, -0.02, TOP + 0.006);
  root.add(fab);
  // battery: a bakelite cell with brass terminals strapped on behind the case
  const cell = new THREE.Group();
  cell.add(mesh(rbox(0.034, 0.032, 0.012, 0.004), S.bakeB));
  cell.add(mesh(rbox(0.026, 0.005, 0.0012, 0.0005), S.hazard, 0, 0.004, 0.0062));
  for (const tx of [-0.01, 0.01]) cell.add(mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.004, 12), S.brass, tx, 0.018, 0));
  cell.position.set(cx - H.w / 2 - 0.03, 0.0, TOP + 0.004);
  root.add(cell);

  for (const o of [torch, laser, dish, fab, cell]) o.visible = false;

  return { root, arm, stump, screen, lamps, knob, needle, toggles, antenna, laserTip, torchLens, laserLens, filaments, mods: { torch, laser, dish, fab, cell } };
}

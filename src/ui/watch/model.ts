// The watch in first person: your left forearm raised in front of your face,
// yellow jumpsuit sleeve shoved up, the BAILIFF band bolted through the wrist,
// and on it a chunky retro-futurist wrist computer: a scratched steel case with
// a lacquered bakelite faceplate, a curved phosphor CRT (src/gfx/crt.ts) behind
// a riveted bezel, a big knurled function dial, a needle gauge under glass,
// two bat-handle toggle switches, three jewel lamps, a speaker grille, a stamped
// brass maker's plate and a telescopic antenna. Multi-tool modules bolt on as
// they are researched: a chrome lamp, a brass laser emitter fed by two vacuum
// tubes, a scanner dish, fabricator pincers and a bakelite battery.
//
// Materials are physically based (metal with real speculars and a room
// reflection, clear-lacquered bakelite, glass with fresnel), textured from the
// pixel atlas for grime and scratches.
//
// Device space: X runs along the forearm (elbow at -X, hand at +X), Y up,
// Z toward the eye. The screen sits at SCREEN (centre) facing +Z.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { G } from '../../game/G';

/** the tube's character field (layout units) */
export const SCR_W = 224, SCR_H = 136;
/** metres per layout unit (the CRT is 67 x 41 mm) */
export const SCR_PX = 0.0003;
export const SCREEN = { w: SCR_W * SCR_PX, h: SCR_H * SCR_PX, x: -0.036, y: 0.003, z: 0.0 };

const ARM_R = 0.031;
const TOP = ARM_R + 0.003;            // underside of the case
export const HOUSE = { w: 0.124, h: 0.076, d: 0.024, cx: SCREEN.x + 0.015 };
const FRONT = TOP + HOUSE.d;          // the faceplate
SCREEN.z = FRONT + 0.0002;
/** the right-hand control column (function dial above, needle gauge below) */
const COL_X = HOUSE.cx + HOUSE.w / 2 - 0.02;

let texReady = false;
function textures() {
  if (texReady) return;
  texReady = true;
  const A = atlas();
  // scratched, brushed steel
  A.add('wt_steel', 16, 16, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); const streak = (y * 7 + (x >> 3)) % 5 === 0 ? 10 : 0; pc.set(x, y, n < 0.1 ? 0x9ca0a2 : n < 0.3 ? 0xbcc0c0 + streak : 0xb0b4b6 + streak); });
    for (let i = 0; i < 7; i++) { const x = rng.int(0, 15), y = rng.int(0, 15); for (let k = 0; k < 5; k++) pc.blend(x + k, y + (k >> 2), 0xe8ecec, 0.55); }
    for (let i = 0; i < 5; i++) pc.blend(rng.int(0, 15), rng.int(0, 15), 0x5a4632, 0.55);
  });
  // bakelite: warm near-black brown, mottled
  A.add('wt_bake', 16, 16, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.15 ? 0x2a1a12 : n < 0.3 ? 0x42301f : 0x36261a); });
    for (let i = 0; i < 6; i++) pc.blend(rng.int(0, 15), rng.int(0, 15), 0x664a34, 0.6);
  });
  A.add('wt_knurl', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, x % 2 ? 0x2a2420 : (y === 0 ? 0x9a948c : 0x6a645c))); });
  A.add('wt_knobtop', 24, 24, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 11.5, y - 11.5); pc.set(x, y, d > 11.4 ? 0x1a120c : d > 9.6 ? 0x4a3a2c : d > 9 ? 0x5a4838 : 0x2e2018); });
    for (let y = 2; y < 11; y++) { pc.set(11, y, 0xe8e0c8); pc.set(12, y, 0xe8e0c8); }
  });
  // the dial plate behind the function knob: detent ticks
  A.add('wt_dialring', 32, 32, (pc) => {
    pc.fill(0x1c1410);
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.75 + i * (Math.PI * 1.5 / 8); for (let r = 12.5; r < 15.5; r += 0.5) pc.set(Math.round(15.5 + Math.cos(a) * r), Math.round(15.5 + Math.sin(a) * r), i === 0 ? 0xffb030 : 0xd8d0b8); }
  });
  // gauge face: cream, a tick arc, a red zone
  A.add('wt_gauge', 32, 32, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); pc.set(x, y, d > 15.4 ? 0x2a2420 : d > 14 ? 0x9a9488 : 0xece2c4); });
    for (let i = 0; i <= 20; i++) { const a = Math.PI * (0.8 + i * 0.07); const r0 = i % 5 ? 11 : 9; for (let r = r0; r < 13.2; r += 0.4) pc.set(Math.round(15.5 + Math.cos(a) * r), Math.round(15.5 + Math.sin(a) * r), i < 4 ? 0xc02a1a : 0x2a2018); }
    for (let r = 12.6; r < 13.4; r += 0.4) for (let a = Math.PI * 0.8; a < Math.PI * 1.08; a += 0.02) pc.set(Math.round(15.5 + Math.cos(a) * r), Math.round(15.5 + Math.sin(a) * r), 0xc02a1a);
  });
  A.add('wt_grille', 16, 8, (pc) => { pc.fill(0x3a2a1e); pc.each((x, y) => { if ((x % 3 === 1) && (y % 3 === 1)) pc.set(x, y, 0x0a0806); else if ((x % 3 === 2) && (y % 3 === 2)) pc.set(x, y, 0x5a4434); }); });
  // stamped brass maker's plate (glyph-like embossing)
  A.add('wt_plate', 24, 8, (pc, rng) => {
    pc.each((x, y) => pc.set(x, y, y === 0 ? 0xf0d080 : y === 7 ? 0x7a5a20 : 0xc8a048));
    for (let x = 2; x < 22; x++) for (let y = 2; y < 6; y++) if ((x % 4 !== 1) && rng.next() < 0.55) pc.set(x, y, rng.next() < 0.5 ? 0x7a5a20 : 0xf0d080);
  });
  A.add('wt_brass', 8, 8, (pc, rng) => { pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.2 ? 0xb08a3a : n < 0.5 ? 0xe0bc60 : 0xd0aa50); }); });
  A.add('wt_copper', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y % 2 ? 0x8a4a28 : 0xe08a50)); });
  A.add('wt_chrome', 8, 8, (pc, rng) => { pc.each((x, y) => pc.set(x, y, rng.next() < 0.15 ? 0xc8ccd0 : 0xf0f2f4)); });
  A.add('wt_haz', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, ((x + y) >> 1) % 2 ? 0xd8a42a : 0x17150f)); });
  A.add('wt_cuff', 24, 8, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.15 ? 0x8a9298 : 0xa2aab0); });
    for (let x = 0; x < 24; x++) { const c = ((x >> 1) % 2) === 0 ? 0xd8a42a : 0x17150f; pc.set(x, 3, c); pc.set(x, 4, c); }
    for (const x of [3, 11, 19]) { pc.set(x, 1, 0xe8eef0); pc.set(x, 6, 0xe8eef0); }
    for (let i = 0; i < 6; i++) pc.set(rng.int(0, 23), rng.int(1, 6), 0x5a2a1a);
  });
  A.add('wt_sleeve', 16, 16, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.15 ? 0xc89a1c : n < 0.3 ? 0xf0c43a : 0xe2b22c); });
    for (let x = 0; x < 16; x += 2) pc.set(x, 13, 0x8a6a12);
    for (let i = 0; i < 5; i++) pc.blend(rng.int(0, 15), rng.int(0, 15), 0x5a4a2a, 0.5);
  });
  A.add('wt_skin', 8, 8, (pc, rng) => { pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.1 ? 0xd8d0c8 : n < 0.16 ? 0xc0b4aa : 0xeee6de); }); });
  A.add('wt_crust', 8, 8, (pc, rng) => {
    pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5) / 4.5 + rng.next() * 0.3; pc.set(x, y, d < 0.45 ? 0x7a0d0a : d < 0.8 ? 0x4a0a08 : 0x2a1a14); });
  });
  A.add('wt_rubber', 8, 8, (pc, rng) => { pc.each((x, y) => pc.set(x, y, rng.next() < 0.2 ? 0x181614 : 0x24201c)); });
}

// ---------------------------------------------------------------- physically based materials
type MatKey = 'steel' | 'bake' | 'brass' | 'chrome' | 'rubber' | 'skin' | 'cloth' | 'paint';
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
export function watchMats(): Record<MatKey, THREE.MeshStandardMaterial> {
  if (MATS) return MATS;
  const env = envMap();
  const map = atlas().texture;
  const base = { map, vertexColors: true, envMap: env, side: THREE.DoubleSide };
  MATS = {
    steel: new THREE.MeshStandardMaterial({ ...base, metalness: 0.85, roughness: 0.38, envMapIntensity: 1.0 }),
    bake: new THREE.MeshPhysicalMaterial({ ...base, metalness: 0, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ ...base, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.1 }),
    chrome: new THREE.MeshStandardMaterial({ ...base, metalness: 1, roughness: 0.12, envMapIntensity: 1.2 }),
    rubber: new THREE.MeshStandardMaterial({ ...base, metalness: 0, roughness: 0.92, envMapIntensity: 0.3 }),
    skin: new THREE.MeshPhysicalMaterial({ ...base, metalness: 0, roughness: 0.6, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffd0b0), envMapIntensity: 0.35 }),
    cloth: new THREE.MeshPhysicalMaterial({ ...base, metalness: 0, roughness: 0.95, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xfff0a0), envMapIntensity: 0.25 }),
    paint: new THREE.MeshStandardMaterial({ ...base, metalness: 0.1, roughness: 0.55, envMapIntensity: 0.6 }),
  };
  for (const m of Object.values(MATS)) atlasAware(m);
  return MATS;
}

/** one ModelBuilder per material, each built into its own mesh */
class Kit {
  private b = new Map<MatKey, ModelBuilder>();
  m(k: MatKey): ModelBuilder { let b = this.b.get(k); if (!b) { b = new ModelBuilder(); b.setFaceShading(false); this.b.set(k, b); } return b; }
  into(g: THREE.Object3D) { const M = watchMats(); for (const [k, b] of this.b) g.add(new THREE.Mesh(b.build(), M[k])); return g; }
}

export interface WatchModel {
  root: THREE.Group;
  arm: THREE.Group;
  hand: THREE.Group;
  stump: THREE.Mesh;
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
  rebuildArm(skin: number): void;
}

const scale = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);
const glowMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: 0x000000, roughness: 0.15, metalness: 0, side: THREE.DoubleSide });
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xe8f0e8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMap: envMap(), envMapIntensity: 1.4, side: THREE.DoubleSide });

/** set a lamp's lit colour (emissive) */
export function setLamp(m: THREE.Mesh, c: number) {
  const mat = m.material as THREE.MeshStandardMaterial;
  if (mat.userData.c === c) return;
  mat.userData.c = c;
  mat.emissive.setHex(c);
}

export function buildWatchModel(screen: THREE.Mesh): WatchModel {
  textures();
  const root = new THREE.Group();
  const H = HOUSE, cx = H.cx;

  // ---- forearm and sleeve (rebuilt when the skin tone changes)
  const arm = new THREE.Group();
  const buildArm = (skin: number) => {
    for (const c of [...arm.children]) { arm.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const K = new Kit();
    const sk = K.m('skin'), cl = K.m('cloth');
    // the forearm along X: rotate the builders so cylinders (built along Y) lie along +X
    for (const b of [sk, cl]) b.push().rotateZ(-Math.PI / 2);
    sk.cylinder(0, -0.36, 0, ARM_R + 0.004, 0.24, 10, 'wt_skin', { color: skin, rTop: ARM_R, uvScale: 14 });
    sk.cylinder(0, -0.12, 0, ARM_R, 0.13, 10, 'wt_skin', { color: skin, rTop: ARM_R * 0.86, uvScale: 14 });
    // the sleeve, shoved up past the elbow, with a rolled cuff
    cl.cylinder(0, -0.46, 0, ARM_R + 0.012, 0.19, 10, 'wt_sleeve', { uvScale: 6 });
    cl.cylinder(0, -0.285, 0, ARM_R + 0.016, 0.026, 10, 'wt_sleeve', { color: 0xd8d8d8, uvScale: 6 });
    for (const b of [sk, cl]) b.pop();
    K.into(arm);
  };
  buildArm(0xc8a080);
  // the hand: a loose fist, back of the hand toward the eye, knuckles, curled fingers, thumb on top
  const hand = new THREE.Group();
  const buildHand = (skin: number) => {
    for (const c of [...hand.children]) { hand.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const K = new Kit(), sk = K.m('skin');
    const hx = 0.03;
    sk.box(hx + 0.034, -0.026, 0.0, 0.056, 0.052, 0.03, 'wt_skin', { color: skin, uvScale: 14 });
    sk.box(hx + 0.066, -0.028, -0.004, 0.014, 0.056, 0.03, 'wt_skin', { color: scale(skin, 0.9), uvScale: 14 });
    for (let i = 0; i < 4; i++) sk.box(hx + 0.069, 0.017 - i * 0.0135, 0.012, 0.01, 0.01, 0.007, 'wt_skin', { color: scale(skin, 0.86), uvScale: 14 });
    sk.box(hx + 0.058, -0.03, -0.026, 0.026, 0.058, 0.024, 'wt_skin', { color: scale(skin, 0.75), uvScale: 14 });
    sk.push().translate(hx + 0.024, 0.026, 0.004).rotateZ(-0.55);
    sk.box(0, 0, 0, 0.042, 0.015, 0.019, 'wt_skin', { color: scale(skin, 0.92), uvScale: 14 });
    sk.pop();
    K.into(hand);
  };
  buildHand(0xc8a080);
  // where the hand was: a cauterised, bound stump
  const sm = new ModelBuilder(); sm.setFaceShading(false);
  sm.push().rotateZ(-Math.PI / 2);
  sm.cylinder(0, 0.012, 0, ARM_R * 0.86, 0.016, 10, { sides: 'wt_rubber', top: 'wt_crust', bottom: 'wt_crust' }, { fit: true, color: 0xb8a890 });
  sm.pop();
  const stump = new THREE.Mesh(sm.build(), watchMats().rubber);
  stump.visible = false;
  root.add(arm, hand, stump);

  // ---- the case and everything fixed to it
  const K = new Kit();
  const st = K.m('steel'), bk = K.m('bake'), br = K.m('brass'), ch = K.m('chrome'), rb = K.m('rubber'), pt = K.m('paint');
  // the BAILIFF cuff round the wrist, bolted through
  st.push().rotateZ(-Math.PI / 2);
  st.cylinder(0, -0.09, 0, ARM_R + 0.0035, 0.07, 12, { sides: 'wt_cuff', top: 'wt_steel', bottom: 'wt_steel' }, { fit: true });
  st.pop();
  for (const sy of [1, -1]) {
    const by = sy * (ARM_R + 0.002);
    st.push().translate(cx - 0.045, by, 0).rotateX(Math.PI / 2 * sy);
    st.cylinder(0, 0, 0, 0.006, 0.007, 6, 'wt_steel', { color: 0x707070 });
    st.pop();
    rb.box(cx - 0.045, by - 0.007, 0.012, 0.016, 0.014, 0.003, 'wt_crust', { fit: true });
  }
  // steel shell, lacquered bakelite faceplate, a bright top rail, hazard-striped bottom rail
  st.box(cx, -H.h / 2, TOP + H.d / 2 - 0.002, H.w, H.h, H.d - 0.004, 'wt_steel', { uvScale: 30 });
  bk.box(cx, -H.h / 2 + 0.003, FRONT - 0.002, H.w - 0.006, H.h - 0.006, 0.004, 'wt_bake', { uvScale: 30 });
  st.box(cx, H.h / 2 - 0.003, TOP + H.d / 2 - 0.002, H.w - 0.008, 0.005, H.d - 0.002, 'wt_steel', { uvScale: 30 });
  pt.box(cx, -H.h / 2 - 0.002, TOP + H.d / 2 - 0.002, H.w - 0.008, 0.005, H.d - 0.002, 'wt_haz', { fit: true });
  for (const sx of [-1, 1]) rb.box(cx + sx * (H.w / 2 + 0.003), -0.026, TOP + H.d / 2 - 0.002, 0.006, 0.052, H.d - 0.006, 'wt_rubber', { uvScale: 30 });
  // the CRT bezel: a thick steel frame standing proud of the faceplate, riveted
  const bw = SCREEN.w + 0.012, bh = SCREEN.h + 0.012, sxc = SCREEN.x, syc = SCREEN.y;
  st.box(sxc, syc + SCREEN.h / 2, FRONT + 0.0015, bw, 0.006, 0.003, 'wt_steel', { uvScale: 30 });
  st.box(sxc, syc - SCREEN.h / 2 - 0.006, FRONT + 0.0015, bw, 0.006, 0.003, 'wt_steel', { uvScale: 30, color: 0xd8d8d8 });
  for (const sx of [-1, 1]) st.box(sxc + sx * (SCREEN.w / 2 + 0.003), syc - bh / 2 + 0.006, FRONT + 0.0015, 0.006, bh - 0.012, 0.003, 'wt_steel', { uvScale: 30, color: sx < 0 ? 0xf0f0f0 : 0xd0d0d0 });
  for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    br.push().translate(sxc + rx * (bw / 2 - 0.003), syc + ry * (bh / 2 - 0.003), FRONT + 0.003).rotateX(Math.PI / 2);
    br.cylinder(0, 0, 0, 0.0013, 0.0012, 6, 'wt_brass');
    br.pop();
  }
  rb.box(sxc, syc - SCREEN.h / 2 - 0.001, FRONT - 0.0004, SCREEN.w + 0.002, SCREEN.h + 0.002, 0.0005, 'wt_rubber', { uvScale: 30 });
  // the control column: dial plate, gauge bezel and face
  pt.box(COL_X, 0.0035, FRONT + 0.0004, 0.026, 0.026, 0.0008, 'wt_dialring', { fit: true });
  st.push().translate(COL_X, -0.019, FRONT + 0.0005).rotateX(Math.PI / 2);
  st.cylinder(0, 0, 0, 0.0115, 0.0016, 16, 'wt_steel');
  st.pop();
  pt.push().translate(COL_X, -0.019, FRONT + 0.0012).rotateX(Math.PI / 2);
  pt.cylinder(0, 0, 0, 0.0098, 0.0016, 16, { sides: 'wt_steel', top: 'wt_gauge', bottom: 'wt_steel' }, { fit: true });
  pt.pop();
  // speaker grille and the maker's plate along the bottom strip
  bk.box(SCREEN.x - 0.014, -H.h / 2 + 0.006, FRONT + 0.0003, 0.036, 0.008, 0.0008, 'wt_grille', { fit: true });
  br.box(SCREEN.x + 0.021, -H.h / 2 + 0.0065, FRONT + 0.0004, 0.026, 0.0072, 0.001, 'wt_plate', { fit: true });
  // toggle-switch bases on the top rail
  for (const tx of [cx - 0.006, cx + 0.008]) ch.box(tx, H.h / 2, TOP + H.d * 0.55, 0.009, 0.003, 0.009, 'wt_chrome', { fit: true });
  // case corner rivets
  for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    br.push().translate(cx + rx * (H.w / 2 - 0.004), ry * (H.h / 2 - 0.004), FRONT).rotateX(Math.PI / 2);
    br.cylinder(0, 0, 0, 0.0016, 0.0014, 6, 'wt_brass');
    br.pop();
  }
  // armoured strap plates down the cuff
  st.box(cx - H.w / 2 + 0.008, -ARM_R - 0.003, 0, 0.016, 0.006, ARM_R * 1.6, 'wt_steel', { uvScale: 30, color: 0xb0b0b0 });
  st.box(cx + H.w / 2 - 0.008, -ARM_R - 0.003, 0, 0.016, 0.006, ARM_R * 1.6, 'wt_steel', { uvScale: 30, color: 0xb0b0b0 });
  K.into(root);

  // ---- the CRT (its own glass and shader)
  screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  root.add(screen);

  // ---- jewel lamps (glass domes in chrome collars) on the top strip
  const lampGeo = new THREE.SphereGeometry(0.0023, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  const ringGeo = new THREE.CylinderGeometry(0.0031, 0.0031, 0.0012, 12).rotateX(Math.PI / 2);
  const lamp = (i: number, glass: number) => {
    const x = SCREEN.x - SCREEN.w / 2 + 0.004 + i * 0.0085, y = SCREEN.y + SCREEN.h / 2 + 0.0105;
    const ring = new THREE.Mesh(ringGeo, watchMats().chrome); ring.position.set(x, y, FRONT + 0.0006); root.add(ring);
    const m = new THREE.Mesh(lampGeo, glowMat(glass)); m.position.set(x, y, FRONT + 0.0012); root.add(m); return m;
  };
  const lamps = { power: lamp(0, 0x0e2a12), signal: lamp(1, 0x2a1e06), alert: lamp(2, 0x2a0a06) };

  // ---- the function dial: a knurled bakelite knob with a pointer
  const knob = new THREE.Group();
  {
    const KK = new Kit(), b = KK.m('bake');
    b.push().rotateX(Math.PI / 2);
    b.cylinder(0, 0, 0, 0.0082, 0.006, 16, { sides: 'wt_knurl', top: 'wt_knobtop', bottom: 'wt_bake' }, { fit: true });
    b.cylinder(0, 0.006, 0, 0.0066, 0.002, 16, { sides: 'wt_bake', top: 'wt_knobtop', bottom: 'wt_bake' }, { fit: true });
    b.pop();
    KK.into(knob);
  }
  knob.position.set(COL_X, 0.0165, FRONT);
  knob.userData.hit = 'dial';
  root.add(knob);

  // ---- needle gauge: a red needle under a glass cover
  const needle = new THREE.Group();
  {
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.0082, 0.0004).translate(0, 0.0036, 0), glowMat(0x9a1810));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.0008, 8).rotateX(Math.PI / 2), watchMats().brass);
    needle.add(n, hub);
  }
  needle.position.set(COL_X, -0.0215, FRONT + 0.0032);
  root.add(needle);
  const cover = new THREE.Mesh(new THREE.CircleGeometry(0.0098, 18), glassMat());
  cover.position.set(COL_X, -0.019, FRONT + 0.0042);
  root.add(cover);

  // ---- bat-handle toggles on the top rail (pivot at the base, flick along Z)
  const toggle = (x: number, which: string) => {
    const piv = new THREE.Group();
    const KK = new Kit();
    KK.m('chrome').cylinder(0, 0, 0, 0.0011, 0.0085, 8, 'wt_chrome', { rTop: 0.0017 });
    KK.into(piv);
    piv.position.set(x, H.h / 2 + 0.0028, TOP + H.d * 0.55);
    piv.userData.hit = 'toggle'; piv.userData.which = which;
    root.add(piv);
    return piv;
  };
  const toggles = { torch: toggle(cx - 0.006, 'torch'), laser: toggle(cx + 0.008, 'laser') };

  // ---- telescopic antenna at the elbow end
  const antenna = new THREE.Group();
  {
    const KK = new Kit();
    KK.m('chrome').cylinder(0, 0, 0, 0.0016, 0.012, 8, 'wt_chrome');
    KK.m('chrome').cylinder(0, 0.012, 0, 0.0011, 0.014, 8, 'wt_chrome');
    KK.m('brass').sphere(0, 0.027, 0, 0.0026, 8, 5, 'wt_brass');
    KK.into(antenna);
  }
  antenna.position.set(cx - H.w / 2 + 0.008, H.h / 2 + 0.001, TOP + H.d * 0.4);
  antenna.rotation.z = 0.25;
  root.add(antenna);

  // ---- multi-tool modules
  // torch: a chrome lamp on the hand-end of the case, lens facing along +X
  const torch = new THREE.Group();
  {
    const KK = new Kit(), c = KK.m('chrome');
    c.push().rotateZ(-Math.PI / 2); c.cylinder(0, -0.006, 0, 0.0075, 0.012, 12, 'wt_chrome', { rTop: 0.0085 }); c.pop();
    KK.m('bake').box(-0.004, -0.009, 0, 0.006, 0.004, 0.01, 'wt_bake', { fit: true });
    KK.into(torch);
  }
  const torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.0072, 12).rotateY(Math.PI / 2), glowMat(0x3a3630));
  torchLens.position.set(0.0062, 0, 0); torch.add(torchLens);
  torch.position.set(cx + H.w / 2 + 0.008, 0.016, TOP + H.d * 0.55);
  root.add(torch);
  // laser: a brass emitter barrel along the top rail, wound with copper, fed by two vacuum tubes
  const laser = new THREE.Group();
  const filaments = glowMat(0x2a1a10);
  {
    const KK = new Kit(), b = KK.m('brass');
    KK.m('bake').box(-0.012, 0, 0, 0.022, 0.006, 0.012, 'wt_bake', { fit: true });          // tube socket block
    b.push().translate(0, 0.0105, 0).rotateZ(-Math.PI / 2);
    b.cylinder(0, -0.024, 0, 0.0042, 0.05, 12, 'wt_brass');
    for (let i = 0; i < 6; i++) b.cylinder(0, -0.006 + i * 0.0036, 0, 0.0052, 0.0018, 12, 'wt_copper');
    b.cylinder(0, 0.026, 0, 0.0058, 0.008, 12, 'wt_brass', { rTop: 0.0026 });
    b.pop();
    KK.into(laser);
    // the tubes: glass envelopes over glowing filaments
    const env = glassMat();
    for (const tx of [-0.018, -0.007]) {
      const fil = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.01, 0.0012), filaments);
      fil.position.set(tx, 0.014, 0);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.016, 12), env);
      tube.position.set(tx, 0.014, 0);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), env);
      cap.position.set(tx, 0.022, 0);
      laser.add(fil, tube, cap);
    }
  }
  const laserLens = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 10).rotateY(Math.PI / 2), glowMat(0x401008));
  laserLens.position.set(0.0341, 0.0105, 0); laser.add(laserLens);
  const laserTip = new THREE.Object3D(); laserTip.position.set(0.036, 0.0105, 0); laser.add(laserTip);
  laser.position.set(cx + 0.03, H.h / 2 + 0.001, TOP + H.d * 0.45);
  root.add(laser);
  // scanner dish: brass, on a stalk by the antenna
  const dish = new THREE.Group();
  {
    const KK = new Kit();
    KK.m('chrome').cylinder(0, 0, 0, 0.0016, 0.007, 8, 'wt_chrome');
    KK.m('brass').cylinder(0, 0.007, 0, 0.003, 0.004, 14, 'wt_brass', { rTop: 0.01 });
    KK.m('brass').sphere(0, 0.0105, 0, 0.0014, 8, 5, 'wt_brass');
    KK.into(dish);
  }
  dish.position.set(cx - H.w / 2 + 0.024, H.h / 2 + 0.001, TOP + H.d * 0.5);
  root.add(dish);
  // fabricator: brass pincers over the knuckles
  const fab = new THREE.Group();
  {
    const KK = new Kit(), b = KK.m('brass');
    KK.m('bake').box(0, 0, 0, 0.03, 0.01, 0.012, 'wt_bake', { fit: true });
    for (const s of [-1, 1]) { b.push().translate(0.016, 0.005 + s * 0.006, 0.004).rotateZ(s * 0.5); b.box(0.008, -0.002, 0, 0.018, 0.004, 0.006, 'wt_brass'); b.pop(); }
    b.cylinder(-0.006, 0.01, 0.004, 0.003, 0.003, 10, 'wt_copper');
    KK.into(fab);
  }
  fab.position.set(cx + H.w / 2 + 0.034, -0.024, TOP + 0.006);
  root.add(fab);
  // battery: a bakelite cell with brass terminals strapped on behind the case
  const cell = new THREE.Group();
  {
    const KK = new Kit();
    KK.m('bake').box(0, -0.016, 0, 0.034, 0.032, 0.012, 'wt_bake', { fit: true });
    KK.m('paint').box(0, -0.011, 0.0062, 0.026, 0.005, 0.001, 'wt_haz', { fit: true });
    for (const tx of [-0.01, 0.01]) KK.m('brass').cylinder(tx, 0.016, 0, 0.0026, 0.004, 10, 'wt_brass');
    KK.into(cell);
  }
  cell.position.set(cx - H.w / 2 - 0.03, 0.0, TOP + 0.004);
  root.add(cell);

  for (const o of [torch, laser, dish, fab, cell]) o.visible = false;

  return {
    root, arm, hand, stump, screen, lamps, knob, needle, toggles, antenna, laserTip, torchLens, laserLens, filaments,
    mods: { torch, laser, dish, fab, cell },
    rebuildArm(skin: number) { buildArm(skin); buildHand(skin); },
  };
}

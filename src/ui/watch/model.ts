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
import { fbox, fcyl, fring, flathe, fdome, gem, plate, clipRect, face, ngon, fcapsule, hull, jitter } from '../touch/facet';
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
/** a point's distance from the centre in "polygon radius" units: R on the edge of a regular n-gon (a corner at `phase`) */
function pd(dx: number, dy: number, n: number, phase = 0): number {
  const seg = (Math.PI * 2) / n;
  let a = Math.atan2(dy, dx) - phase;
  a = ((a % seg) + seg) % seg;
  return Math.hypot(dx, dy) * Math.cos(a - seg / 2) / Math.cos(seg / 2);
}
let texReady = false;
/** atlas pictures for the small printed parts (dial plate, gauge face, cuff hazard band, knob tops): polygons, never discs */
function textures() {
  if (texReady) return;
  texReady = true;
  const A = atlas();
  A.add('wt_knurl', 16, 4, (pc) => { pc.each((x, y) => pc.set(x, y, x % 2 ? 0x2a2420 : (y === 0 ? 0x9a948c : 0x6a645c))); });
  A.add('wt_knobtop', 24, 24, (pc) => {
    pc.each((x, y) => { const d = pd(x - 11.5, y - 11.5, 8); pc.set(x, y, d > 11.4 ? 0x1a120c : d > 9.6 ? 0x4a3a2c : d > 8.8 ? 0x6a5640 : (x + y) % 7 === 0 ? 0x3a2a1e : 0x2e2018); });
    for (let y = 2; y < 11; y++) { pc.set(11, y, 0xe8e0c8); pc.set(12, y, 0xe8e0c8); }
    pc.set(11, 1, 0xfff4d8); pc.set(12, 1, 0xfff4d8);
  });
  A.add('wt_dialring', 32, 32, (pc) => {
    pc.each((x, y) => { const d = pd(x - 15.5, y - 15.5, 8); pc.set(x, y, d > 15.2 ? 0x14100c : d > 14.4 ? 0x3a2c22 : (x * 7 + y * 3) % 11 === 0 ? 0x241a14 : 0x1c1410); });
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.75 + i * (Math.PI * 1.5 / 8); for (let r = 10.5; r < 13.5; r += 0.5) pc.set(Math.round(15.5 + Math.cos(a) * r), Math.round(15.5 + Math.sin(a) * r), i === 0 ? 0xffb030 : 0xd8d0b8); }
  });
  A.add('wt_gauge', 32, 32, (pc) => {
    pc.each((x, y) => { const d = pd(x - 15.5, y - 15.5, 6); pc.set(x, y, d > 15.2 ? 0x2a2420 : d > 13.6 ? 0x9a9488 : d > 13 ? 0x6a6458 : (x * 5 + y * 11) % 13 === 0 ? 0xdcd2b2 : 0xece2c4); });
    for (let i = 0; i <= 20; i++) { const a = Math.PI * (0.8 + i * 0.07); const r0 = i % 5 ? 10 : 8; for (let r = r0; r < 12; r += 0.4) pc.set(Math.round(15.5 + Math.cos(a) * r), Math.round(15.5 + Math.sin(a) * r), i < 4 ? 0xc02a1a : 0x2a2018); }
  });
  A.add('wt_cuff', 24, 8, (pc, rng) => {
    pc.each((x, y) => { const n = rng.next(); pc.set(x, y, n < 0.15 ? 0x8a9298 : 0xa2aab0); });
    for (let x = 0; x < 24; x++) { const c = ((x >> 1) % 2) === 0 ? 0xd8a42a : 0x17150f; pc.set(x, 3, c); pc.set(x, 4, c); }
    for (const x of [3, 11, 19]) { pc.set(x, 1, 0xe8eef0); pc.set(x, 6, 0xe8eef0); }
    for (let i = 0; i < 6; i++) pc.set(rng.int(0, 23), rng.int(1, 6), 0x5a2a1a);
  });
  A.add('wt_crust', 8, 8, (pc, rng) => {
    pc.each((x, y) => { const d = pd(x - 3.5, y - 3.5, 6) / 4.5 + rng.next() * 0.3; pc.set(x, y, d < 0.45 ? 0x7a0d0a : d < 0.8 ? 0x4a0a08 : 0x2a1a14); });
  });
}

/** a small procedural pixel texture (cached, nearest-filtered, tiled) */
const TEX = new Map<string, THREE.CanvasTexture>();
const REDRAW: (() => void)[] = [];
/** repaint the printed parts (after the web fonts arrive) */
export function refreshPrinted() { for (const f of REDRAW) f(); }
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true, printed = false): THREE.CanvasTexture {
  let t = TEX.get(key);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g0 = c.getContext('2d')!; g0.imageSmoothingEnabled = false;
  draw(g0, w, h);
  if (printed) REDRAW.push(() => { const g = c.getContext('2d')!; g.clearRect(0, 0, w, h); draw(g, w, h); for (const [, tx] of TEX) if (tx.image === c) tx.needsUpdate = true; for (const m of Object.values(SM || {})) if (m.map?.image === c) m.map.needsUpdate = true; });
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  TEX.set(key, t);
  return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const hexc = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;
/** brushed steel, pixel by pixel: each row its own grey, long bright scratch runs, dings, grime specks (64 px tiles, ~3000 texels per metre on the case) */
const brushed = () => canvasTex('wt_brushed', 64, 64, (g, w, h) => {
  for (let y = 0; y < h; y++) {
    const v = 150 + rnd() * 26;
    for (let x = 0; x < w; x++) { const k = v + (rnd() < 0.12 ? 10 : 0) - (rnd() < 0.04 ? 14 : 0); g.fillStyle = hexc(k, k + 3, k + 6); g.fillRect(x, y, 1, 1); }
  }
  // long scratch runs along the grain and a few across it
  for (let i = 0; i < 9; i++) { g.fillStyle = rnd() < 0.7 ? '#dfe4e7' : '#6a6e72'; g.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 3 + ((rnd() * 10) | 0), 1); }
  for (let i = 0; i < 4; i++) { const x = (rnd() * w) | 0, y = (rnd() * h) | 0; for (let k = 0; k < 6; k++) { g.fillStyle = '#e8ecef'; g.fillRect(x + k, y + (k >> 1), 1, 1); } }
  // dings: a dark pit with a bright lip
  for (let i = 0; i < 3; i++) { const x = (rnd() * (w - 3)) | 0, y = (rnd() * (h - 3)) | 0; g.fillStyle = '#5a5e62'; g.fillRect(x, y, 2, 2); g.fillStyle = '#e4e8ea'; g.fillRect(x, y + 2, 2, 1); }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,48,36,0.55)'; g.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 1, 1); }
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(90,60,30,0.35)'; g.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 2, 1); }
});
/** bakelite: dark brown, mottled in two-pixel flecks, faint swirl, hairline scratches */
const bakelite = () => canvasTex('wt_bakelite', 64, 64, (g, w, h) => {
  g.fillStyle = '#35241a'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sw = Math.sin(x * 0.21 + Math.sin(y * 0.17) * 2.2) * 0.5 + 0.5; if (sw > 0.82) { g.fillStyle = 'rgba(80,52,32,0.55)'; g.fillRect(x, y, 1, 1); } }
  for (let i = 0; i < 260; i++) { g.fillStyle = hexc(62 + rnd() * 34, 42 + rnd() * 16, 28 + rnd() * 10); g.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 1 + ((rnd() * 2) | 0), 1); }
  for (let i = 0; i < 70; i++) { g.fillStyle = '#24170f'; g.fillRect((rnd() * w) | 0, (rnd() * h) | 0, 1, 1); }
  for (let i = 0; i < 6; i++) { const x = (rnd() * w) | 0, y = (rnd() * h) | 0, l = 3 + ((rnd() * 6) | 0); for (let k = 0; k < l; k++) { g.fillStyle = 'rgba(150,120,96,0.6)'; g.fillRect(x + k, y + ((k * 2) / 3 | 0), 1, 1); } }
});
/** hazard stripes, stepped diagonals, the yellow chipped back to bare steel at the edges */
const hazard = () => canvasTex('wt_hazard', 32, 8, (g, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = ((x + y) >> 2) % 2 ? '#17150f' : '#d8a42a'; g.fillRect(x, y, 1, 1); }
  for (let i = 0; i < 16; i++) { const x = (rnd() * w) | 0, y = rnd() < 0.5 ? 0 : h - 1 - ((rnd() * 2) | 0); g.fillStyle = rnd() < 0.5 ? '#9aa0a4' : '#6a5a2a'; g.fillRect(x, y, 1 + ((rnd() * 2) | 0), 1); }
  g.fillStyle = '#7a5a18'; g.fillRect(3, 1, 1, 1); g.fillRect(12, 2, 1, 1); g.fillRect(22, 5, 2, 1);
});
/** a speaker grille: square punched holes, each with a lit lower lip */
const grille = () => canvasTex('wt_grillet', 24, 6, (g, w, h) => {
  g.fillStyle = '#3a281c'; g.fillRect(0, 0, w, h);
  for (let y = 1; y < h - 1; y += 2) for (let x = 1 + ((y >> 1) % 2); x < w - 1; x += 2) { g.fillStyle = '#0a0806'; g.fillRect(x, y, 1, 1); g.fillStyle = '#6a4e36'; g.fillRect(x, y + 1, 1, 1); }
});
/** the stamped brass maker's plate (original lettering) */
const plateTex = () => canvasTex('wt_platet', 128, 36, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) { const k = y / h; g.fillStyle = hexc(240 - k * 70, 212 - k * 84, 136 - k * 78); g.fillRect(0, y, w, 1); }
  g.fillStyle = '#5a3e14'; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
  g.font = `700 14px ${cssFont('--font-new', 'serif')}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,240,200,0.7)'; g.fillText('BAILIFF  MK·IX', w / 2 + 1, h * 0.38 + 1);
  g.fillStyle = '#4a3010'; g.fillText('BAILIFF  MK·IX', w / 2, h * 0.38);
  g.font = `600 10px ${cssFont('--font-new', 'serif')}`; g.fillText('Meridian Institute · Remittance', w / 2, h * 0.76);
  for (const [x, y] of [[4, 4], [w - 6, 4], [4, h - 6], [w - 6, h - 6]]) { g.fillStyle = '#6a4a18'; g.fillRect(x, y, 2, 2); g.fillStyle = '#f8e0a0'; g.fillRect(x, y, 1, 1); }
}, true, true);

/** the faceplate, one picture over the whole plate (~3400 texels per metre): lacquered bakelite worn
 *  by a thumb round the dial, grime in the corners, chipped edges, screw-head scuffs, cream
 *  printed legends and a strip of masking tape with a pencilled room number */
const FACE_W = 384, FACE_H = 224;
const faceTex = () => canvasTex('wt_face', FACE_W, FACE_H, (g, w, h) => {
  // plate extent in metres and where things sit on it (u, v from the top-left)
  const PW = HOUSE.w - 0.01, PH = HOUSE.h - 0.01;
  const U = (x: number) => ((x - (HOUSE.cx - PW / 2)) / PW) * w, V = (y: number) => ((PH / 2 - y) / PH) * h;
  g.fillStyle = '#33221a'; g.fillRect(0, 0, w, h);
  // mottled lacquer, a faint swirl, brighter toward the top-left where the room light lands
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sw = Math.sin(x * 0.09 + Math.sin(y * 0.07) * 2.6) * 0.5 + 0.5;
    const lift = (1 - (x / w) * 0.6 - (y / h) * 0.5) * 14;
    const n = (rnd() - 0.5) * 10 + (sw > 0.85 ? 12 : 0) + lift;
    g.fillStyle = hexc(50 + n, 34 + n * 0.7, 24 + n * 0.45); g.fillRect(x, y, 1, 1);
  }
  // grime: darker toward the edges and thick in the corners
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    const c = Math.min(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
    const k = Math.max(0, 1 - e / 14) * 0.45 + Math.max(0, 1 - c / 40) * 0.4;
    if (k > 0.02 && rnd() < 0.6 + k * 0.4) { g.fillStyle = `rgba(12,8,4,${Math.min(0.75, k).toFixed(2)})`; g.fillRect(x, y, 1, 1); }
  }
  // chips along the edges: the brown filler under the lacquer, and bare brass where it is worst
  for (let i = 0; i < 46; i++) {
    const side = (rnd() * 4) | 0, t = rnd();
    const x = side === 0 ? t * w : side === 1 ? t * w : side === 2 ? (rnd() * 6) | 0 : w - 1 - ((rnd() * 6) | 0);
    const y = side === 0 ? (rnd() * 6) | 0 : side === 1 ? h - 1 - ((rnd() * 6) | 0) : t * h;
    const r = 1 + ((rnd() * 3) | 0);
    g.fillStyle = rnd() < 0.2 ? '#b8954a' : '#7a5636'; g.fillRect(x | 0, y | 0, r, Math.max(1, r - 1));
    g.fillStyle = '#e0c8a0'; g.fillRect(x | 0, (y | 0) - 1, 1, 1);
  }
  // a thumb has worn a pale arc round the function dial
  const dx = U(COL_X), dy = V(0.0165);
  for (let a = 0; a < 360; a += 1.5) {
    const r = 54 + rnd() * 6, t = (a * Math.PI) / 180;
    if (rnd() < 0.55) { g.fillStyle = `rgba(150,110,80,${(0.25 + rnd() * 0.35).toFixed(2)})`; g.fillRect((dx + Math.cos(t) * r) | 0, (dy + Math.sin(t) * r) | 0, 2, 1); }
  }
  // hairline scratches, mostly along the length
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h, a = (rnd() < 0.75 ? 0.15 : 1.3) + (rnd() - 0.5) * 0.4, l = 6 + rnd() * 40;
    g.strokeStyle = `rgba(190,160,130,${(0.18 + rnd() * 0.3).toFixed(2)})`; g.lineWidth = 1;
    g.beginPath(); g.moveTo((x | 0) + 0.5, (y | 0) + 0.5); g.lineTo(((x + Math.cos(a) * l) | 0) + 0.5, ((y + Math.sin(a) * l) | 0) + 0.5); g.stroke();
  }
  // screw-head scuffs in the corners
  for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = U(HOUSE.cx + rx * (HOUSE.w / 2 - 0.0045)), y = V(ry * (HOUSE.h / 2 - 0.0045));
    for (let k = 0; k < 18; k++) { const t = rnd() * Math.PI * 2, r = 8 + rnd() * 6; g.fillStyle = 'rgba(170,140,110,0.5)'; g.fillRect((x + Math.cos(t) * r) | 0, (y + Math.sin(t) * r) | 0, 2, 1); }
  }
  // printed legends in cream enamel, hard pixels
  const legend = (txt: string, x: number, y: number, px: number, align: CanvasTextAlign = 'center', col = '#e6dcc0') => {
    g.save(); g.font = `600 ${px}px ${cssFont('--font-new', 'monospace')}`; g.textAlign = align; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(10,6,2,0.85)'; g.fillText(txt, (x | 0) + 1, (y | 0) + 1);
    g.fillStyle = col; g.fillText(txt, x | 0, y | 0); g.restore();
  };
  // between the function dial and the charge gauge: what each one is
  legend('FUNCTION', U(COL_X), V(0.0012), 12);
  legend('CHARGE', U(COL_X), V(-0.0044), 12, 'center', '#c8a050');
  // masking tape over the bottom-left corner, pencilled with the room it came from
  g.save();
  g.translate(U(SCREEN.x - SCREEN.w / 2 + 0.004), V(-HOUSE.h / 2 + 0.006)); g.rotate(-0.12);
  g.fillStyle = '#d8cc9c'; g.fillRect(-4, -12, 92, 22);
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(150,130,80,0.5)'; g.fillRect((-4 + rnd() * 92) | 0, (-12 + rnd() * 22) | 0, 1, 1); }
  g.fillStyle = 'rgba(120,100,60,0.6)'; for (let y = -12; y < 10; y += 3) { g.fillRect(-5, y, 1, 2); g.fillRect(88, y + 1, 1, 2); }
  g.font = `500 14px ${cssFont('--font-new', 'monospace')}`; g.textBaseline = 'middle'; g.fillStyle = '#3a3226'; g.fillText('RM 4  KEEP', 2, 0);
  g.restore();
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
  if (!lowQ()) return new THREE.MeshPhysicalMaterial({ flatShading: true, ...o });
  const { clearcoat, clearcoatRoughness, sheen, sheenRoughness, sheenColor, ...rest } = o;
  void clearcoat; void clearcoatRoughness; void sheen; void sheenRoughness; void sheenColor;
  return new THREE.MeshStandardMaterial({ flatShading: true, ...(rest as THREE.MeshStandardMaterialParameters) });
}
/** atlas-textured PBR for ModelBuilder parts (lathed knobs, cylinders, printed faces); flat-shaded facets */
export function watchMats(): Record<MatKey, THREE.MeshStandardMaterial> {
  if (MATS) return MATS;
  const env = envMap();
  const map = atlas().texture;
  const base = { map, vertexColors: true, envMap: env, side: THREE.DoubleSide, flatShading: true };
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
/** plain PBR for the faceted parts (their own 0..1 uvs; pixel canvas maps) */
let SM: Record<string, THREE.MeshStandardMaterial> | null = null;
function solids() {
  if (SM) return SM;
  const env = envMap();
  const rep = (t: THREE.Texture, x: number, y: number) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const once = (t: THREE.Texture) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.ClampToEdgeWrapping; c.needsUpdate = true; return c; };
  const b = brushed(), bk = bakelite();
  const F = { side: THREE.DoubleSide, flatShading: true, envMap: env } as const;
  SM = {
    steelM: new THREE.MeshStandardMaterial({ ...F, map: rep(b, 4, 4), roughnessMap: rep(b, 4, 4), color: 0xd8dcdf, metalness: 0.88, roughness: 0.42, envMapIntensity: 1.05 }),
    steelB: new THREE.MeshStandardMaterial({ ...F, map: rep(b, 3, 3), roughnessMap: rep(b, 3, 3), color: 0xc8ccd0, metalness: 0.86, roughness: 0.45, envMapIntensity: 1.0 }),
    bakeM: phys({ ...F, map: once(faceTex()), color: 0xffffff, metalness: 0, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.8 }),
    bakeB: phys({ ...F, map: rep(bk, 1, 1), color: 0xffffff, metalness: 0, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ ...F, color: 0x1e1b18, metalness: 0, roughness: 0.9, envMapIntensity: 0.25 }),
    hazard: new THREE.MeshStandardMaterial({ ...F, map: rep(hazard(), 4, 1), metalness: 0.15, roughness: 0.5, envMapIntensity: 0.5 }),
    grille: new THREE.MeshStandardMaterial({ ...F, map: rep(grille(), 1, 1), metalness: 0, roughness: 0.6, envMapIntensity: 0.4 }),
    plate: new THREE.MeshStandardMaterial({ ...F, map: rep(plateTex(), 1, 1), metalness: 0.75, roughness: 0.32, envMapIntensity: 1.0 }),
    brass: new THREE.MeshStandardMaterial({ ...F, color: 0xd8b060, metalness: 0.92, roughness: 0.28, envMapIntensity: 1.1 }),
    chrome: new THREE.MeshStandardMaterial({ ...F, color: 0xf0f2f4, metalness: 1, roughness: 0.1, envMapIntensity: 1.25 }),
    crust: new THREE.MeshStandardMaterial({ ...F, color: 0x4a0c08, metalness: 0, roughness: 0.55, envMapIntensity: 0.4 }),
    copper: new THREE.MeshStandardMaterial({ ...F, color: 0xd8824a, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.0 }),
    gauze: new THREE.MeshStandardMaterial({ ...F, color: 0xc8b8a0, roughness: 0.95, envMap: null }),
  };
  return SM;
}

// ---------------------------------------------------------------- faceted shapes (no rounded primitives)
const GEO = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };
/** a bevelled slab with clipped corners (extruded along +Z from z = 0), optionally with a clipped-corner window */
function slab(w: number, h: number, r: number, depth: number, bevel: number, hole?: { w: number; h: number; r: number }) {
  const key = `slab:${w}:${h}:${r}:${depth}:${bevel}:${hole ? hole.w + ':' + hole.h + ':' + hole.r : ''}`;
  return geo(key, () => plate(clipRect(w, h, r), depth + bevel * 2, bevel, hole ? [clipRect(hole.w, hole.h, hole.r)] : []));
}
/** a chamfered block (absolute chamfer r) */
const rbox = (w: number, h: number, d: number, r: number) => geo(`rbox:${w}:${h}:${d}:${r}`, () => fbox(w, h, d, r, true));
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
/** an inked outline: the part's shell pushed out a hair and drawn back-faces-only in black */
const INK = new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.BackSide });
const INK_W = 0.0007;
function ink<T extends THREE.Mesh>(o: T, w = INK_W): T {
  const g = o.geometry;
  let h = HULLS.get(g);
  if (!h) { h = hull(g, w); HULLS.set(g, h); }
  const m = new THREE.Mesh(h, INK);
  m.raycast = () => { /* never picked */ };
  o.add(m);
  return o;
}
const HULLS = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();

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

const glowMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: 0x000000, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, flatShading: true });
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xe8f0e8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMap: envMap(), envMapIntensity: 1.4, side: THREE.DoubleSide, flatShading: true });

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
    const g = fdome(0.026, 7, 3).rotateZ(-Math.PI / 2); g.scale(0.45, 1, 0.8);
    stump.add(mesh(g, S.crust, WRIST_X - 0.004, 0, 0));
    const wrap = fcyl(0.0275, 0.016, 8, 0.0265, 0, true).rotateZ(-Math.PI / 2); wrap.scale(1, 1, 0.8);
    stump.add(mesh(wrap, S.gauze, WRIST_X - 0.012, 0, 0));
  }
  stump.visible = false;
  root.add(stump);

  // ---- the BAILIFF cuff round the wrist, bolted through (a ten-sided band, flattened to the forearm)
  const K = new Kit();
  const st = K.m('steel');
  st.push().translate(0, 0, 0).scale(1, 1, 0.82).rotateZ(-Math.PI / 2);
  st.cylinder(0, cx - 0.04, 0, ARM_R + 0.004, 0.08, 10, { sides: 'wt_cuff', top: 'wt_cuff', bottom: 'wt_cuff' }, { fit: true });
  st.pop();
  K.into(root);
  for (const sy of [1, -1]) {
    const by = sy * (ARM_R * 0.82 + 0.004);
    root.add(mesh(fcyl(0.0055, 0.006, 6, 0.0062, 0.25), S.chrome, cx - 0.045, by, 0)); // hex head
    const crust = gem(0.008, 0, 0.25, sy + 3); crust.scale(1.4, 0.4, 1);
    root.add(mesh(crust, S.crust, cx - 0.045, by - sy * 0.002, 0.006));
  }

  // ---- the case: a chamfered brushed-steel shell, a bevelled bakelite faceplate
  root.add(ink(mesh(rbox(H.w, H.h, H.d, 0.004), S.steelB, cx, 0, TOP + H.d / 2)));
  root.add(ink(mesh(slab(H.w - 0.01, H.h - 0.01, 0.006, 0.0012, 0.0006), S.bakeM, cx, 0, FRONT - 0.0004)));
  // bright top rail and hazard-striped bottom rail
  root.add(ink(mesh(rbox(H.w - 0.012, 0.005, H.d * 0.7, 0.0015), S.chrome, cx, H.h / 2 + 0.0008, TOP + H.d / 2)));
  root.add(ink(mesh(rbox(H.w - 0.012, 0.005, H.d * 0.7, 0.0015), S.hazard, cx, -H.h / 2 - 0.0008, TOP + H.d / 2)));
  // ribbed rubber grips down the ends
  for (const sx of [-1, 1]) {
    root.add(ink(mesh(rbox(0.007, 0.05, H.d * 0.8, 0.002), S.rubber, cx + sx * (H.w / 2 + 0.002), -0.004, TOP + H.d / 2)));
    for (let i = 0; i < 5; i++) root.add(mesh(rbox(0.0024, 0.004, H.d * 0.84, 0.0008), S.rubber, cx + sx * (H.w / 2 + 0.0052), -0.022 + i * 0.009, TOP + H.d / 2));
  }
  // the CRT bezel: a bevelled steel frame with a clipped-corner window, standing proud of the faceplate
  root.add(ink(mesh(slab(SCREEN.w + 0.012, SCREEN.h + 0.012, 0.005, 0.0016, 0.0007, { w: SCREEN.w + 0.0006, h: SCREEN.h + 0.0006, r: 0.0032 }), S.steelM, SCREEN.x, SCREEN.y, FRONT + 0.0004)));
  // the tube's dark surround inside the window
  root.add(mesh(slab(SCREEN.w + 0.002, SCREEN.h + 0.002, 0.0034, 0.0008, 0), S.rubber, SCREEN.x, SCREEN.y, FRONT + 0.0006));
  // speaker grille and the maker's plate along the bottom strip
  root.add(ink(mesh(slab(0.036, 0.0078, 0.0022, 0.0006, 0.0003), S.grille, SCREEN.x - 0.014, -H.h / 2 + 0.0095, FRONT + 0.0006)));
  root.add(ink(mesh(slab(0.027, 0.0076, 0.0016, 0.0006, 0.0003), S.plate, SCREEN.x + 0.022, -H.h / 2 + 0.0095, FRONT + 0.0006)));
  // the control column: an octagonal dial plate (detent ticks) and the gauge's hex bezel and face
  {
    const KK = new Kit();
    const pt = KK.m('paint');
    pt.push().translate(COL_X, 0.0165, FRONT + 0.0004).rotateX(Math.PI / 2);
    pt.cylinder(0, 0, 0, 0.0135, 0.0008, 8, { sides: 'wt_dialring', top: 'wt_dialring', bottom: 'wt_dialring' }, { fit: true });
    pt.pop();
    const sg = KK.m('steel');
    sg.push().translate(COL_X, -0.019, FRONT + 0.0004).rotateX(Math.PI / 2);
    sg.cylinder(0, 0, 0, 0.0124, 0.0018, 6, { sides: 'wt_knurl', top: 'wt_knurl', bottom: 'wt_knurl' }, { color: 0xe8e8e8, fit: true });
    sg.pop();
    pt.push().translate(COL_X, -0.019, FRONT + 0.0012).rotateX(Math.PI / 2);
    pt.cylinder(0, 0, 0, 0.0105, 0.0016, 6, { sides: 'wt_gauge', top: 'wt_gauge', bottom: 'wt_gauge' }, { fit: true });
    pt.pop();
    KK.into(root);
  }
  // toggle-switch collars on the top rail: hex nuts
  for (const tx of [cx - 0.006, cx + 0.008]) root.add(mesh(fcyl(0.0036, 0.0028, 6, 0.0044, 0.25), S.chrome, tx, H.h / 2 + 0.0024, TOP + H.d * 0.55));
  // hex-head screws in the faceplate corners and round the bezel
  const screw = geo('w_screw', () => fcyl(0.0017, 0.0009, 6, 0.0019, 0.35).rotateX(Math.PI / 2));
  for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    root.add(mesh(screw, S.brass, cx + rx * (H.w / 2 - 0.0045), ry * (H.h / 2 - 0.0045), FRONT + 0.0009));
    root.add(mesh(screw, S.brass, SCREEN.x + rx * (SCREEN.w / 2 + 0.0032), SCREEN.y + ry * (SCREEN.h / 2 + 0.0032), FRONT + 0.0028));
  }
  // armoured strap plates down the cuff
  for (const sx of [-1, 1]) root.add(ink(mesh(rbox(0.016, 0.005, ARM_R * 1.4, 0.0012), S.steelB, cx + sx * (H.w / 2 - 0.009), -ARM_R * 0.82 - 0.004, 0.004)));

  // ---- the CRT (its own glass and shader)
  screen.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  root.add(screen);

  // ---- jewel lamps: rose-cut glass in hex chrome collars on the top strip
  const lampGeo = geo('w_jewel', () => flathe([[0.0024, 0], [0.0024, 0.0005], [0.0016, 0.0014], [0.0008, 0.0019], [0, 0.002]], 6).rotateX(Math.PI / 2));
  const ringGeo = geo('w_collar', () => fring(0.0027, 0.0007, 6, 4));
  const lamp = (i: number, glass: number) => {
    const x = SCREEN.x - SCREEN.w / 2 + 0.004 + i * 0.0085, y = SCREEN.y + SCREEN.h / 2 + 0.0105;
    root.add(mesh(ringGeo, S.chrome, x, y, FRONT + 0.0009));
    const m = new THREE.Mesh(lampGeo, glowMat(glass)); m.position.set(x, y, FRONT + 0.0006); root.add(m); return m;
  };
  const lamps = { power: lamp(0, 0x0e2a12), signal: lamp(1, 0x2a1e06), alert: lamp(2, 0x2a0a06) };

  // ---- the function dial: an octagonal knurled bakelite knob with a pointer
  const knob = new THREE.Group();
  {
    const KK = new Kit(), b = KK.m('bake');
    b.push().rotateX(Math.PI / 2);
    b.cylinder(0, 0, 0, 0.0084, 0.006, 8, { sides: 'wt_knurl', top: 'wt_knobtop', bottom: 'wt_knobtop' }, { fit: true });
    b.cylinder(0, 0.006, 0, 0.0068, 0.0022, 8, { sides: 'wt_knobtop', top: 'wt_knobtop', bottom: 'wt_knobtop' }, { fit: true, rTop: 0.0058 });
    b.pop();
    KK.into(knob);
  }
  knob.position.set(COL_X, 0.0165, FRONT);
  knob.userData.hit = 'dial';
  root.add(knob);

  // ---- needle gauge: a tapered red blade on a hex brass boss, under a flat hex glass
  const needle = new THREE.Group();
  {
    const n = new THREE.Mesh(fcyl(0.00012, 0.0084, 4, 0.0004, 0).translate(0, 0.0038, 0), glowMat(0x9a1810));
    const hub = new THREE.Mesh(fcyl(0.0012, 0.0008, 6, 0.0013, 0.3).rotateX(Math.PI / 2), S.brass);
    needle.add(n, hub);
  }
  needle.position.set(COL_X, -0.0215, FRONT + 0.0032);
  root.add(needle);
  const cover = new THREE.Mesh(face(ngon(6, 0.0104, 0)), glassMat());
  cover.position.set(COL_X, -0.019, FRONT + 0.0036);
  root.add(cover);
  // a crack across the gauge glass, from a knock
  {
    const crack = new THREE.Group();
    const cm = new THREE.MeshBasicMaterial({ color: 0xe8f0e8, transparent: true, opacity: 0.55, depthWrite: false });
    const seg = (x0: number, y0: number, x1: number, y1: number) => { const l = Math.hypot(x1 - x0, y1 - y0); const m = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.00028), cm); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(y1 - y0, x1 - x0); crack.add(m); };
    seg(-0.0088, 0.0046, -0.003, 0.0012); seg(-0.003, 0.0012, 0.0016, 0.0024); seg(0.0016, 0.0024, 0.0068, -0.0018); seg(-0.003, 0.0012, -0.0012, -0.004);
    crack.position.set(COL_X, -0.019, FRONT + 0.0039);
    root.add(crack);
  }
  // vents cut in the elbow end of the case, and screws along the cuff plates
  for (let i = 0; i < 4; i++) root.add(mesh(rbox(0.0012, 0.004, H.d * 0.6, 0.0003), S.rubber, cx - H.w / 2 - 0.0002, -0.012 + i * 0.008, TOP + H.d / 2));
  for (const sx of [-1, 1]) for (const k of [-1, 1]) root.add(mesh(screw, S.chrome, cx + sx * (H.w / 2 - 0.009) + k * 0.005, -ARM_R * 0.82 - 0.0012, 0.004 + ARM_R * 0.7));

  // ---- bat-handle toggles on the top rail (pivot at the base, flick along Z)
  const toggle = (x: number, which: string) => {
    const piv = new THREE.Group();
    piv.add(mesh(fcyl(0.0017, 0.0085, 6, 0.0011, 0).translate(0, 0.0042, 0), S.chrome));
    piv.add(mesh(gem(0.0019, 0, 0), S.chrome, 0, 0.0086, 0));
    piv.position.set(x, H.h / 2 + 0.0034, TOP + H.d * 0.55);
    piv.userData.hit = 'toggle'; piv.userData.which = which;
    root.add(piv);
    return piv;
  };
  const toggles = { torch: toggle(cx - 0.006, 'torch'), laser: toggle(cx + 0.008, 'laser') };

  // ---- telescopic antenna at the elbow end
  const antenna = new THREE.Group();
  antenna.add(mesh(fcyl(0.0016, 0.012, 6, 0.0016, 0).translate(0, 0.006, 0), S.chrome));
  antenna.add(mesh(fcyl(0.0011, 0.014, 6, 0.0011, 0).translate(0, 0.019, 0), S.chrome));
  antenna.add(mesh(fcyl(0.0021, 0.0012, 6, 0.0021, 0.3), S.chrome, 0, 0.0122, 0));
  antenna.add(mesh(gem(0.0026, 0, 0.1, 4), S.brass, 0, 0.027, 0));
  // a repair: black electrical tape wound round the antenna's foot
  antenna.add(mesh(jitter(fcyl(0.0026, 0.005, 6, 0.0028, 0.2), 0.00025, 9), S.rubber, 0, 0.004, 0));
  antenna.position.set(cx - H.w / 2 + 0.008, H.h / 2 + 0.001, TOP + H.d * 0.4);
  antenna.rotation.z = 0.25;
  root.add(antenna);

  // ---- multi-tool modules
  // torch: an octagonal chrome lamp on the hand end of the case, lens facing along +X
  const torch = new THREE.Group();
  torch.add(ink(mesh(fcyl(0.0085, 0.012, 8, 0.0072, 0.15).rotateZ(-Math.PI / 2), S.chrome)));
  torch.add(mesh(fring(0.0084, 0.0009, 8, 4).rotateY(Math.PI / 2), S.chrome, 0.006, 0, 0));
  torch.add(mesh(rbox(0.008, 0.005, 0.011, 0.0015), S.bakeB, -0.004, -0.008, 0));
  const torchLens = new THREE.Mesh(face(ngon(8, 0.0074)).rotateY(Math.PI / 2), glowMat(0x3a3630));
  torchLens.position.set(0.0062, 0, 0); torch.add(torchLens);
  torch.position.set(cx + H.w / 2 + 0.006, 0.016, TOP + H.d * 0.55);
  root.add(torch);
  // laser: a brass emitter along the top rail, wound with copper, fed by two vacuum tubes
  const laser = new THREE.Group();
  const filaments = glowMat(0x2a1a10);
  {
    laser.add(ink(mesh(rbox(0.022, 0.006, 0.012, 0.0015), S.bakeB, -0.012, 0.003, 0)));            // tube socket block
    laser.add(ink(mesh(fcyl(0.0042, 0.05, 8, 0.0042, 0.1).rotateZ(-Math.PI / 2), S.brass, 0, 0.0105, 0)));
    const coil = geo('w_coil', () => fring(0.0048, 0.0009, 8, 4).rotateY(Math.PI / 2));
    for (let i = 0; i < 6; i++) laser.add(mesh(coil, S.copper, -0.006 + i * 0.0036, 0.0105, 0));
    laser.add(mesh(fcyl(0.0026, 0.008, 8, 0.0058, 0.1).rotateZ(-Math.PI / 2), S.brass, 0.029, 0.0105, 0));
    const env = glassMat();
    for (const tx of [-0.018, -0.007]) {
      laser.add(mesh(fcyl(0.0006, 0.01, 4, 0.0006, 0), filaments, tx, 0.016, 0));
      laser.add(mesh(fcyl(0.0034, 0.014, 8, 0.0034, 0, true), env, tx, 0.0128, 0));
      laser.add(mesh(fdome(0.0034, 8, 2), env, tx, 0.0198, 0));
    }
  }
  const laserLens = new THREE.Mesh(face(ngon(8, 0.0024)).rotateY(Math.PI / 2), glowMat(0x401008));
  laserLens.position.set(0.0331, 0.0105, 0); laser.add(laserLens);
  const laserTip = new THREE.Object3D(); laserTip.position.set(0.035, 0.0105, 0); laser.add(laserTip);
  laser.position.set(cx + 0.03, H.h / 2 + 0.001, TOP + H.d * 0.45);
  root.add(laser);
  // scanner dish: a faceted brass bowl on a stalk by the antenna
  const dish = new THREE.Group();
  dish.add(mesh(fcyl(0.0016, 0.007, 6, 0.0016, 0).translate(0, 0.0035, 0), S.chrome));
  {
    const prof: number[][] = [];
    for (let i = 0; i <= 3; i++) { const t = Math.PI * 0.6 + (i / 3) * Math.PI * 0.4; prof.push([Math.sin(t) * 0.0105, Math.cos(t) * 0.0105]); }
    dish.add(mesh(flathe(prof.reverse(), 8).translate(0, 0.017, 0), S.brass));
  }
  dish.add(mesh(gem(0.0014, 0, 0), S.brass, 0, 0.0105, 0));
  dish.position.set(cx - H.w / 2 + 0.024, H.h / 2 + 0.001, TOP + H.d * 0.5);
  root.add(dish);
  // fabricator: brass pincers over the knuckles
  const fab = new THREE.Group();
  fab.add(ink(mesh(rbox(0.03, 0.01, 0.012, 0.002), S.bakeB)));
  for (const s2 of [-1, 1]) {
    const jaw = new THREE.Group(); jaw.position.set(0.016, s2 * 0.004, 0.004); jaw.rotation.z = s2 * 0.45;
    jaw.add(mesh(fcapsule(0.0022, 0.02, 6).rotateZ(-Math.PI / 2), S.brass, 0, 0, 0));
    fab.add(jaw);
  }
  fab.add(mesh(fcyl(0.003, 0.003, 6, 0.003, 0.25).rotateX(Math.PI / 2), S.brass, -0.006, 0.005, 0.007));
  fab.position.set(cx + H.w / 2 + 0.034, -0.02, TOP + 0.006);
  root.add(fab);
  // battery: a bakelite cell with brass terminals strapped on behind the case
  const cell = new THREE.Group();
  cell.add(ink(mesh(rbox(0.034, 0.032, 0.012, 0.0025), S.bakeB)));
  cell.add(mesh(rbox(0.026, 0.005, 0.0012, 0.0004), S.hazard, 0, 0.004, 0.0062));
  for (const tx of [-0.01, 0.01]) cell.add(mesh(fcyl(0.0026, 0.004, 6, 0.0028, 0.25), S.brass, tx, 0.018, 0));
  cell.position.set(cx - H.w / 2 - 0.03, 0.0, TOP + 0.004);
  root.add(cell);

  for (const o of [torch, laser, dish, fab, cell]) o.visible = false;

  return { root, arm, stump, screen, lamps, knob, needle, toggles, antenna, laserTip, torchLens, laserLens, filaments, mods: { torch, laser, dish, fab, cell } };
}

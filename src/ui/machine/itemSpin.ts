// AN ITEM AS A TURNING 3D ICON (round 17), drawn by the machine kit (./core.ts) like the band's
// app icons (decor.ts mxIconSpin): the item's own model (src/items/itemMeshes.ts) with its own
// atlas texture, banded key light, inked contour and dithered drop shadow, rendered once into a
// sheet of headings and flipped while it is on screen; quicker while hot (hovered, picked).
// Used by the press's FEED screen (src/game/economy/feedScreen.ts); any screen can show an item
// this way. Units are CSS px, one art pixel each.
import * as THREE from 'three';
import { mxOk, sheet, MXU } from './core';
import { itemGeometry } from '../../items/itemMeshes';
import { atlas } from '../../gfx/atlas';
import { U } from '../../gfx/materials';

const FRAMES = 24;
const TAU = Math.PI * 2;

const VERT = /* glsl */`
attribute vec4 aAtlas;
varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying vec4 vAtlas;
void main() {
  vCol = color; vUv = uv; vAtlas = aAtlas;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// the world's texel lookup (src/gfx/materials.ts FRAG_MAP), the machine kit's banded light
const FRAG = /* glsl */`
uniform sampler2D uAtlasTex; uniform float uAtlasSize; uniform vec3 uKey; uniform float uLight;
varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying vec4 vAtlas;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec2 texPx = max(vAtlas.zw * uAtlasSize, vec2(1.0));
  vec2 tuv = fract(vUv) * texPx;
  vec2 fuv = (floor(tuv) + 0.5) / texPx;
  vec3 base = vCol * texture2D(uAtlasTex, vAtlas.xy + vec2(fuv.x, 1.0 - fuv.y) * vAtlas.zw).rgb;
  float lam = clamp(dot(n, uKey), 0.0, 1.0);
  lam = floor(lam * 5.0 + 0.5) / 5.0;
  float fill = clamp(dot(n, normalize(vec3(0.62, -0.25, 0.74))), 0.0, 1.0);
  vec3 col = base * (0.36 + lam * 0.86 + fill * 0.16) * uLight;
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), 24.0);
  col += step(0.55, sp) * 0.16 * vec3(1.0, 0.97, 0.88);
  float rim = 1.0 - clamp(n.z, 0.0, 1.0);
  col += rim * rim * rim * 0.1 * uLight;
  gl_FragColor = vec4(col, 1.0);
}`;
let mat: THREE.ShaderMaterial | null = null;
function itemMat(): THREE.ShaderMaterial {
  if (mat) return mat;
  mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side: THREE.DoubleSide,
    uniforms: { uAtlasTex: { value: atlas().texture }, uAtlasSize: U.uAtlasSize, uKey: MXU.uKey, uLight: MXU.uLight },
  });
  // shared by every sheet: the kit's disposeTree leaves it (and the atlas) alone
  (mat as unknown as { _keep: boolean })._keep = true;
  return mat;
}

/** the item on its turntable at heading `yaw`, framed in an S x S box (tilted a little towards the viewer) */
function itemModel(key: string, S: number, yaw: number): THREE.Object3D {
  const root = new THREE.Group();
  const g = itemGeometry(key);
  if (!g) return root;
  (g as unknown as { _keep: boolean })._keep = true; // the game's cached geometry: never disposed here
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!, c = b.getCenter(new THREE.Vector3());
  const R = Math.max(1e-3, b.getSize(new THREE.Vector3()).length() / 2);
  const k = (S * 0.48) / R;
  const tilt = new THREE.Group(); tilt.position.set(S / 2, -S / 2, 0); tilt.rotation.x = 0.42;
  const tt = new THREE.Group(); tt.rotation.y = yaw; tilt.add(tt);
  const m = new THREE.Mesh(g, itemMat());
  m.scale.setScalar(k); m.position.copy(c).multiplyScalar(-k);
  tt.add(m);
  root.add(tilt);
  return root;
}

const PAD = 4;
const SHOT = { shear: [0, 0] as [number, number], shadow: [2, 3] as [number, number], shadowA: 0.45 };
const sheetOf = (key: string, size: number, frames: number) => sheet(`item|${key}|${size}|${frames}`, size, size, PAD, frames, (f) => itemModel(key, size, -0.6 + (f / frames) * TAU), SHOT);

export interface ItemSpin { cv: HTMLCanvasElement; hot(on: boolean): void; /** turns per second at rest */ speed: number }

// one clock for every turning item on screen
const live = new Set<{ cv: HTMLCanvasElement; tick(dt: number): void }>();
let raf = 0, last = 0;
function loop(now: number) {
  raf = 0;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const s of [...live]) { if (!s.cv.isConnected) { live.delete(s); continue; } s.tick(dt); }
  if (live.size) raf = requestAnimationFrame(loop);
}
const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

/** a turning item icon: a canvas of (size + 8) CSS px; null without WebGL or a model */
export function mxItemSpin(key: string, size = 64, phase = Math.random()): ItemSpin | null {
  if (!mxOk() || !itemGeometry(key)) return null;
  const sh = sheetOf(key, size, FRAMES);
  if (!sh) return null;
  const fw = size + PAD * 2, fh = fw;
  const cv = document.createElement('canvas');
  cv.width = fw; cv.height = fh; cv.className = 'mxi-cv';
  const c = cv.getContext('2d')!;
  let ph = phase * FRAMES, cur = -1, hot = false;
  const draw = () => { const f = Math.floor(ph) % FRAMES; if (f === cur) return; cur = f; c.clearRect(0, 0, fw, fh); c.drawImage(sh, 0, f * fh, fw, fh, 0, 0, fw, fh); };
  const s: ItemSpin & { tick(dt: number): void } = {
    cv, speed: 0.12,
    hot(on: boolean) { hot = on; },
    tick(dt: number) { ph = (ph + dt * FRAMES * (hot ? 0.75 : s.speed)) % FRAMES; cur = cur === Math.floor(ph) % FRAMES ? cur : -1; draw(); },
  };
  draw();
  live.add(s); run();
  return s;
}

/** one still of an item (its first heading): a canvas of (size + 8) CSS px */
export function mxItemStill(key: string, size = 20): HTMLCanvasElement | null {
  if (!mxOk() || !itemGeometry(key)) return null;
  const sh = sheetOf(key, size, 1);
  if (!sh) return null;
  const cv = document.createElement('canvas');
  cv.width = sh.width; cv.height = sh.height; cv.className = 'mxi-cv';
  cv.getContext('2d')!.drawImage(sh, 0, 0);
  return cv;
}

// The institute's quiet sci-fi (the art pass, wave 3): every powered terminal
// near the unit throws a small holographic readout over its screen, in the
// Meridian green, drawn the pixel way: hard scanlines two art pixels apart,
// bars of data that change a frame at a time, a border that drops a frame now
// and then, every alpha in dithered steps. Subtle on purpose: it is the
// furniture breathing, not a light show. One instanced mesh for all of them,
// refreshed four times a second from the objects round the unit; only the
// ones on screen (seen, powered, unbroken) are drawn.
import * as THREE from 'three';
import { G } from '../game/G';
import { U } from '../gfx/materials';
import { pxShaderMat } from '../gfx/pixelFx';
import { objectMatrix } from './chunkMesher';
import { objDef } from './objects';

/** where the readout hangs on each kind of terminal (model space: x, y, z, width, height, tilt back) */
const HOLO: Record<string, [number, number, number, number, number, number]> = {
  terminal_lab: [-0.05, 1.26, -0.02, 0.36, 0.2, 0.18],
  computer: [0, 0.66, 0.02, 0.3, 0.16, 0.15],
  radio_console: [0, 1.25, 0.05, 0.4, 0.18, 0.2],
  tape_mainframe: [0, 2.1, 0.3, 0.5, 0.16, 0.0],
  keycard_reader: [0, 1.62, 0.12, 0.14, 0.08, 0.0],
};

const VERT = /* glsl */`
varying vec2 vUv; varying float vSeed;
void main(){
  vUv = uv;
  vec4 w = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vSeed = fract(sin(dot(w.xz, vec2(12.9898, 78.233))) * 43758.5453);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform float uTime; uniform vec3 uCol, uWarm;
varying vec2 vUv; varying float vSeed;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main(){
  float t = pxT(uTime + vSeed * 7.0);
  float fr = floor(t * 12.0);
  // about one cell per art pixel at the usual zoom
  vec2 res = vec2(16.0, 9.0);
  vec2 px = floor(vUv * res);
  // frame: a one-pixel border, its corners brighter
  float bx = step(px.x, 0.0) + step(res.x - 1.0, px.x), by = step(px.y, 0.0) + step(res.y - 1.0, px.y);
  float border = min(1.0, bx + by), corner = step(1.5, bx + by);
  float a = border * 0.7 + corner * 0.3;
  // two lines of data that tick over every few frames, and a blinking cursor
  for (int r = 0; r < 2; r++) {
    float y0 = 5.0 - float(r) * 3.0;
    float len = 3.0 + floor(h1(floor(fr / (4.0 + float(r) * 3.0)) + float(r) * 17.0 + vSeed * 31.0) * 8.0);
    float on = step(y0, px.y) * step(px.y, y0) * step(2.0, px.x) * step(px.x, 1.0 + len);
    a = max(a, on);
  }
  float cur = step(13.0, px.x) * step(px.x, 13.0) * step(2.0, px.y) * step(px.y, 3.0) * step(0.5, fract(t * 1.5));
  a = max(a, cur);
  // hard scanlines, a rare dropped frame, the whole readout breathing in steps
  a *= 0.6 + 0.4 * step(0.5, mod(px.y, 2.0));
  a *= step(0.05, h1(fr * 1.7 + vSeed * 3.0));
  a *= 0.75 + 0.25 * step(0.5, h1(floor(fr / 6.0) + vSeed));
  a = pxA(a * 0.9);
  if (a <= 0.0) discard;
  vec3 col = mix(uCol, uWarm, cur);
  gl_FragColor = vec4(col * a, a);
}`;

const MAX = 24;
let mesh: THREE.InstancedMesh | null = null;
const tmp = new THREE.Matrix4(), off = new THREE.Matrix4(), tilt = new THREE.Matrix4(), scl = new THREE.Matrix4();
const on = (s: { on?: boolean; broken?: boolean; unpowered?: boolean } | undefined) => !(s?.on === false || s?.broken || s?.unpowered);

function ensure(): THREE.InstancedMesh | null {
  const scene = G.pr?.scene;
  if (!scene) return null;
  if (!mesh) {
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const mat = pxShaderMat(VERT, FRAG, { uTime: U.uTime, uCol: { value: new THREE.Color(0x7affb0) }, uWarm: { value: new THREE.Color(0xffd27a) } });
    mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 17;
    mesh.name = 'sciHolo';
  }
  if (mesh.parent !== scene) scene.add(mesh);
  return mesh;
}

function tick() {
  const g = G as any;
  const p = g?.local;
  if (!p || g.transitioning || !g.zones || !g.view) { if (mesh) mesh.count = 0; return; }
  const z = g.zones.get(p.zoneKey);
  const m = ensure();
  if (!z || !m) return;
  const vis = g.view.vis;
  let n = 0;
  const R = 11, cx = Math.floor(p.x), cy = Math.floor(p.z);
  for (const o of z.objects.values()) {
    if (n >= MAX) break;
    const h = HOLO[o.key];
    if (!h || Math.abs(o.x - cx) > R || Math.abs(o.y - cy) > R || !on(o.state)) continue;
    if (vis && !vis.isVisible(o.x, o.y)) continue;
    const d = objDef(o.key);
    if (!d) continue;
    tmp.copy(objectMatrix(z, o, d));
    off.makeTranslation(h[0], h[1], h[2]);
    tilt.makeRotationX(-h[5]);
    scl.makeScale(h[3], h[4], 1);
    tmp.multiply(off).multiply(tilt).multiply(scl);
    m.setMatrixAt(n++, tmp);
  }
  m.count = n;
  m.instanceMatrix.needsUpdate = true;
}

if (typeof window !== 'undefined' && typeof (globalThis as any).document?.visibilityState === 'string') {
  setInterval(() => { try { tick(); } catch { /* decoration only */ } }, 250);
}

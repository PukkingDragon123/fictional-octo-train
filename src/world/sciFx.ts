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
  vec2 res = vec2(36.0, 20.0);
  vec2 px = floor(vUv * res);
  // frame: a one-pixel border with corner ticks
  float border = step(px.x, 0.0) + step(res.x - 1.0, px.x) + step(px.y, 0.0) + step(res.y - 1.0, px.y);
  border = min(1.0, border) * step(0.5, h1(fr * 3.1 + vSeed * 9.0) + 0.35);
  // three rows of data bars, each a different length that ticks over every few frames
  float a = border * 0.85;
  for (int r = 0; r < 3; r++) {
    float y0 = 4.0 + float(r) * 5.0;
    float len = 6.0 + floor(h1(floor(fr / (3.0 + float(r))) + float(r) * 17.0 + vSeed * 31.0) * 22.0);
    float on = step(y0, px.y) * step(px.y, y0 + 1.0) * step(3.0, px.x) * step(px.x, 3.0 + len);
    a = max(a, on * 0.75);
  }
  // a little bishop's mark at the right, blinking amber when the readout refreshes
  vec2 m = px - vec2(29.0, 6.0);
  float mark = step(0.0, m.x) * step(m.x, 3.0) * step(0.0, m.y) * step(m.y, 7.0) * step(abs(m.x - 1.5) * 2.0 - m.y * 0.4, 1.6);
  float warm = step(0.85, h1(fr * 0.37 + vSeed));
  a = max(a, mark * 0.9);
  // hard scanlines, the projector's fall-off toward the top, a rare dropped frame
  a *= 0.35 + 0.65 * step(0.5, mod(px.y, 2.0));
  a *= 0.55 + 0.45 * (1.0 - vUv.y);
  a *= step(0.06, h1(fr * 1.7 + vSeed * 3.0));
  a = pxA(a * 0.8);
  if (a <= 0.0) discard;
  vec3 col = mix(uCol, uWarm, mark * warm);
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

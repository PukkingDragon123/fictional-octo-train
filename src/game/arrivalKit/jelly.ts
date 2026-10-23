// The Seam's membrane up close: a dedicated faceted sheet (an irregular,
// jittered triangle grid) whose vertex shader makes it jelly: a slow breath,
// a convex lens pressing out of the frame, rings running out from wherever it
// is touched, a viscous funnel that follows the arm in and clings round the
// wrist (with a lip of displaced gel), a blob that rises to meet the hand
// before it touches, and at the end a swell that reaches out for the face.
// The fragment shader lights the facets from their own derivatives (so the
// facets read), with sharp glints from the strip light above and the amber
// warning lamp, a fresnel sheen, and a cold caustic glow refracted from deep
// inside it, bent by every facet. Values go above 1 where it glints: the
// arrival's cinematic pass blooms them.
import * as THREE from 'three';
import { hash3 } from './geo';

export const JW = 1.12, JH = 2.3;
const NX = 30, NY = 60, NRIP = 6;

const VERT = /* glsl */`
uniform float uTime;
uniform vec4 uRip[${NRIP}];
uniform vec4 uFun;   // x, y (local m), depth, radius
uniform vec4 uPro;   // x, y, amount, radius
uniform vec4 uEng;   // x, y, amount, radius
uniform vec2 uLag;   // the funnel's drag (stretch) direction * amount
uniform float uWob;
uniform vec2 uSize;
varying vec3 vW;
varying float vDisp;
varying vec2 vL;
varying float vFun;

float disp(vec2 p, out float fun) {
  vec2 q = vec2(p.x / uSize.x + 0.5, p.y / uSize.y);
  float edge = smoothstep(0.0, 0.07, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
  float lens = (1.0 - pow(2.0 * q.x - 1.0, 2.0)) * (1.0 - pow(2.0 * q.y - 1.0, 2.0)) * 0.03;
  float z = lens;
  // breathing
  z += sin(p.x * 5.3 + uTime * 0.9) * sin(p.y * 3.1 - uTime * 0.7) * 0.007;
  z += sin(p.x * 11.0 - p.y * 7.0 + uTime * 1.7) * 0.0025;
  // jiggle after it has been disturbed
  z += uWob * (sin(uTime * 11.0 + p.x * 6.0) * sin(p.y * 4.0 - uTime * 8.0) * 0.016 + sin(uTime * 17.0 - p.y * 9.0) * 0.005);
  // rings
  for (int i = 0; i < ${NRIP}; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (age < 0.0 || r.w <= 0.0) continue;
    float d = length(p - r.xy);
    float front = age * 1.15;
    float x = d - front;
    float env = exp(-age * 1.05) * r.w * exp(-abs(x) * 3.2) * smoothstep(-0.2, 0.05, front - d + 0.05);
    z += sin(x * 24.0) * env * 0.028;
  }
  // a blob rising to meet the hand
  float dp = length(p - uPro.xy);
  z += uPro.z * 0.075 * exp(-pow(dp / max(uPro.w, 0.01), 2.0));
  // the funnel round the arm: stretched along the drag, a lip of displaced gel round its rim
  vec2 dv = p - uFun.xy;
  float lag = length(uLag);
  if (lag > 1e-4) { vec2 ld = uLag / lag; float al = dot(dv, ld); dv -= ld * clamp(al, 0.0, 1.0) * min(0.6, lag) * 0.6; }
  float df = length(dv);
  float R = max(uFun.w, 0.01);
  float k = 1.0 - smoothstep(0.035, R, df);
  fun = k;
  z -= uFun.z * pow(k, 1.7);
  z += uFun.z * 0.16 * exp(-pow((df - R * 0.92) / (R * 0.22), 2.0));
  // the swell that reaches for the face
  float de = length(p - uEng.xy);
  z += uEng.z * exp(-pow(de / max(uEng.w, 0.01), 2.0));
  return z * mix(edge, 1.0, max(k, step(0.001, uEng.z) * exp(-pow(de / max(uEng.w, 0.01), 2.0))));
}

void main() {
  vec3 p = position;
  float fun;
  float z = disp(p.xy, fun);
  vec2 q = vec2(p.x / uSize.x + 0.5, p.y / uSize.y);
  float edge = smoothstep(0.0, 0.07, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
  p.x += uWob * sin(uTime * 9.0 + p.y * 5.0) * 0.006 * edge;
  p.z += z;
  vDisp = z; vL = p.xy; vFun = fun;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uGlow;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uGlowCol;
uniform vec3 uLamp;
uniform vec3 uLampCol;
uniform float uHot;
varying vec3 vW;
varying float vDisp;
varying vec2 vL;
varying float vFun;

float caustic(vec2 p, float t) {
  // a thin web of light: crossing warped sine sheets, bright only where they meet
  float v = 0.0;
  vec2 q = p;
  for (int i = 0; i < 3; i++) {
    q += vec2(sin(q.y * 1.7 + t), cos(q.x * 1.3 - t * 0.8)) * 0.55;
    v += abs(sin(q.x) * sin(q.y));
  }
  return pow(clamp(1.0 - v / 3.0, 0.0, 1.0), 7.0);
}

void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 v = normalize(cameraPosition - vW);
  if (dot(n, v) < 0.0) n = -n;
  float ndv = max(dot(n, v), 0.0);
  float fres = pow(1.0 - ndv, 3.0);
  // oily black body
  vec3 col = vec3(0.006, 0.011, 0.013);
  // looking into it: a cold caustic web deep inside, bent by the facet, deeper in the funnel
  vec2 rp = vL * 3.0 + n.xy * (0.6 + 1.2 * vFun) + vec2(0.0, uTime * 0.05);
  float c = caustic(rp * 2.0, uTime * 0.45 + 23.0);
  // depth: a faint glow far inside, brighter toward the middle of the opening, the web of light over it
  float deep = 0.025 + 0.03 * smoothstep(0.9, 0.1, length((vL - vec2(0.0, 1.2)) * vec2(1.4, 0.8)));
  col += uGlowCol * (deep + c * 0.32) * uGlow * (0.4 + 0.6 * ndv) * (1.0 - vFun * 0.6);
  // the strip light above: hard glints on the facets
  vec3 h = normalize(normalize(uKeyDir) + v);
  float sp = pow(max(dot(n, h), 0.0), 70.0);
  col += uKeyCol * sp * 2.6;
  col += uKeyCol * pow(max(dot(n, h), 0.0), 9.0) * 0.025;
  // the warning lamp
  vec3 lv = uLamp - vW;
  vec3 h2 = normalize(normalize(lv) + v);
  col += uLampCol * pow(max(dot(n, h2), 0.0), 46.0) * 1.6 / (1.0 + dot(lv, lv) * 0.6);
  // wet sheen at grazing angles, dark down the funnel's throat, a hot rim where it grips
  col += vec3(0.03, 0.05, 0.055) * fres * 1.4;
  col *= 1.0 - smoothstep(0.55, 1.0, vFun) * 0.7;
  col += uGlowCol * smoothstep(0.75, 0.95, vFun) * (1.0 - smoothstep(0.95, 1.0, vFun)) * 0.25 * uHot;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Jelly {
  mesh: THREE.Mesh;
  u: Record<string, THREE.IUniform>;
  /** a ring from local point (x, y) */
  ripple(x: number, y: number, amp: number, t: number): void;
  dispose(): void;
}

/** the membrane sheet: local x across (centred), y up from 0, surface at z = 0 facing +z */
export function makeJelly(): Jelly {
  // an irregular triangle grid: interior vertices jittered, diagonals alternating
  const pos: number[] = [];
  const P = (i: number, j: number): [number, number] => {
    let x = -JW / 2 + (i / NX) * JW, y = (j / NY) * JH;
    if (i > 0 && i < NX && j > 0 && j < NY) { x += (hash3(i, j, 1) - 0.5) * (JW / NX) * 0.7; y += (hash3(j, i, 2) - 0.5) * (JH / NY) * 0.7; }
    return [x, y];
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    const flip = hash3(i, j, 5) > 0.5;
    const tri = (p: [number, number], q: [number, number], r: [number, number]) => { pos.push(p[0], p[1], 0, q[0], q[1], 0, r[0], r[1], 0); };
    if (flip) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, JH / 2, 0), 2.5);
  const rips: THREE.Vector4[] = Array.from({ length: NRIP }, () => new THREE.Vector4(0, 0, -99, 0));
  const u: Record<string, THREE.IUniform> = {
    uTime: { value: 0 }, uRip: { value: rips }, uFun: { value: new THREE.Vector4(0, 1.2, 0, 0.1) }, uPro: { value: new THREE.Vector4(0, 1.2, 0, 0.1) },
    uEng: { value: new THREE.Vector4(0, 1.4, 0, 0.4) }, uLag: { value: new THREE.Vector2() }, uWob: { value: 0 }, uSize: { value: new THREE.Vector2(JW, JH) },
    uGlow: { value: 0.6 }, uKeyDir: { value: new THREE.Vector3(0.1, 0.9, 0.45) }, uKeyCol: { value: new THREE.Color(0.85, 0.95, 0.92) },
    uGlowCol: { value: new THREE.Color(0.15, 0.75, 0.82) }, uLamp: { value: new THREE.Vector3(0, 2.6, 0.3) }, uLampCol: { value: new THREE.Color(1.0, 0.45, 0.12) }, uHot: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'arrival:jelly';
  let next = 0;
  return {
    mesh, u,
    ripple(x, y, amp, t) { rips[next].set(x, y, t, amp); next = (next + 1) % NRIP; },
    dispose() { g.dispose(); mat.dispose(); },
  };
}

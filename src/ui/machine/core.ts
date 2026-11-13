// THE MACHINE UI RENDERER (round 16). Every panel, key, switch, knob, gauge and
// lamp in the menus is a small 3D object built like the body HUD's console
// (src/ui/body: faceted Mold parts, banded light, inked contours, a dithered
// drop shadow, ordered dither), drawn by ONE shared WebGL context into the 2D
// canvases that sit in the DOM. Nothing renders per frame: a housing is drawn
// when its element changes size, a key's states are drawn once into a cached
// sprite sheet, and the few live parts (a needle swinging, a knob turning, a
// bat handle flipping) render only while they move.
//
// Units: 1 unit = 1 CSS px (one art pixel); y up in the scene, so a part at
// screen (x, y) from the element's top-left sits at (x, -y). The camera is an
// oblique (cabinet) projection: the z = 0 plane maps 1:1 onto the element, and
// whatever stands out of it slides up and left, so the shaded bottom and
// right-hand sides of raised parts show as their thickness (a desk console seen
// from the operator's chair) and a key that is pushed in visibly sinks down
// into its bezel.
import * as THREE from 'three';

// ---------------------------------------------------------------- shared uniforms
export const MXU = {
  uKey: { value: new THREE.Vector3(-0.38, 0.72, 0.58).normalize() },
  uLight: { value: 1.06 },
  uTint: { value: new THREE.Vector3(1.04, 1.0, 0.92) },
  uRust: { value: 0.12 },
};

const NOISE = /* glsl */`
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;
const VERT = /* glsl */`
attribute vec3 aCol; attribute vec4 aSurf; attribute float aGlow;
varying vec3 vN; varying vec3 vCol; varying vec3 vLoc; varying vec4 vSurf; varying vec2 vUv; varying float vGlow;
void main() {
  vCol = aCol; vSurf = aSurf; vUv = uv; vGlow = aGlow;
  vLoc = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
/** enamel, steel, brass, rubber: banded key light, grime blotches, rust patches that eat the paint, hard specular steps on metal */
const FRAG = /* glsl */`
uniform vec3 uKey; uniform float uLight; uniform vec3 uTint; uniform float uRust;
uniform vec3 uGlow; uniform float uSeed; uniform float uWear; uniform float uDim;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
varying vec3 vN; varying vec3 vCol; varying vec3 vLoc; varying vec4 vSurf; varying vec2 vUv; varying float vGlow;
${NOISE}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 base = vCol;
  float metal = vSurf.x;
#ifdef USE_MAP
  vec4 t = texture2D(uMap, vUv);
#ifdef DECAL
  if (t.a < 0.5) discard;
#endif
#ifdef FULL
  base = mix(base, t.rgb, t.a);
#else
  base = mix(base, t.rgb, t.a * smoothstep(0.15, 0.45, n.z));
#endif
#endif
  vec3 q = vLoc + vec3(uSeed);
  // grime: broad blotches and a fine grain (units are screen pixels)
  float g = vn(q * 0.07) * 0.55 + vn(q * 0.27) * 0.3 + h3(floor(q)) * 0.15;
  base *= 0.89 + 0.18 * g;
  base *= 1.0 - uWear * smoothstep(0.6, 0.92, vn(q * 0.17 + 9.0)) * 0.3;
  // rust blooms where paint and steel take it
  float rs = vSurf.y * uRust;
  if (rs > 0.001) {
    float rn = vn(q * 0.045) * 0.5 + vn(q * 0.16 + 4.0) * 0.32 + vn(q * 0.6) * 0.18;
    float e = rs * 1.3 - rn;
    if (e > 0.0) {
      vec3 rc = mix(vec3(0.32, 0.13, 0.05), vec3(0.62, 0.31, 0.11), vn(q * 0.45));
      rc = mix(rc, vec3(0.18, 0.08, 0.04), step(0.7, vn(q * 1.3)) * 0.7);
      base = e < 0.035 ? base * 0.58 + vec3(0.10, 0.04, 0.0) : rc;
      metal *= e < 0.035 ? 0.5 : 0.08;
    }
  }
  float lam = clamp(dot(n, uKey), 0.0, 1.0);
  lam = floor(lam * 5.0 + 0.5) / 5.0;
  float fill = clamp(dot(n, normalize(vec3(0.62, -0.25, 0.74))), 0.0, 1.0);
  vec3 col = base * (0.30 + lam * 0.84 + fill * 0.14) * uLight * uTint;
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), 10.0 + metal * 34.0);
  col += (step(0.42, sp) * 0.36 + step(0.84, sp) * 0.46) * metal * uLight * vec3(1.0, 0.97, 0.88);
  float rim = 1.0 - clamp(n.z, 0.0, 1.0);
  col += rim * rim * rim * 0.08 * vec3(0.85, 1.0, 0.7) * uLight;
  // lit from inside (lamps, back-lit legends): uGlow = colour x intensity
  vec3 lit = base * uGlow * 1.7 + uGlow * 0.35;
  col = mix(col, lit, clamp(vGlow * max(uGlow.r, max(uGlow.g, uGlow.b)) * 1.6, 0.0, 1.0));
  col *= uDim;
  gl_FragColor = vec4(col, 1.0);
}`;
/** a lamp lens: dark tinted glass when off; lit, it glows from a hot core with a hard glint on its facets */
const LENS_FRAG = /* glsl */`
uniform vec3 uKey; uniform vec3 uCol; uniform float uOn; uniform float uDim;
varying vec3 vN; varying vec3 vCol; varying vec3 vLoc; varying vec4 vSurf; varying vec2 vUv; varying float vGlow;
void main() {
  vec3 n = normalize(vN);
  float ndv = clamp(n.z, 0.0, 1.0);
  vec3 off = uCol * (0.10 + 0.16 * ndv) + vec3(0.015, 0.02, 0.015);
  float lam = clamp(dot(n, uKey), 0.0, 1.0);
  off += uCol * floor(lam * 3.0 + 0.5) / 3.0 * 0.12;
  vec3 on = mix(uCol * (0.72 + 0.4 * ndv), vec3(1.0, 1.0, 0.9), pow(ndv, 5.0) * 0.75);
  vec3 col = mix(off, on, uOn);
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), 36.0);
  col += step(0.5, sp) * vec3(0.95, 0.97, 0.9) * (0.7 - uOn * 0.3);
  gl_FragColor = vec4(col * uDim, 1.0);
}`;
/** additive halo round a lit lamp */
const HALO_FRAG = /* glsl */`
uniform vec3 uCol; uniform float uOn;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, d)) * uOn;
  a = floor(a * 4.0 + 0.5) / 4.0;
  gl_FragColor = vec4(uCol * 0.5, a);
}`;
const HALO_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export interface MatOpts { map?: THREE.Texture | null; wear?: number; decal?: boolean; seed?: number; glow?: number; /** the map covers every facet (an eyeball), not only the ones facing out */ full?: boolean }
let seedN = 0;
/** the machine's solid material (per-vertex colour + surface from the Mold, optional painted map) */
export function mxMat(o: MatOpts = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    defines: o.map ? { USE_MAP: '', ...(o.decal ? { DECAL: '' } : {}), ...(o.full ? { FULL: '' } : {}) } : {},
    uniforms: {
      uKey: MXU.uKey, uLight: MXU.uLight, uTint: MXU.uTint, uRust: MXU.uRust,
      uGlow: { value: new THREE.Vector3() }, uSeed: { value: o.seed ?? (seedN++ * 17.3) % 300 }, uWear: { value: o.wear ?? 0.5 },
      uMap: { value: o.map ?? null }, uDim: { value: 1 },
    },
  });
}
export function lensMat(col: number): THREE.ShaderMaterial {
  const c = new THREE.Color(col);
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: LENS_FRAG, uniforms: { uKey: MXU.uKey, uCol: { value: new THREE.Vector3(c.r, c.g, c.b) }, uOn: { value: 0 }, uDim: { value: 1 } } });
}
export function haloMat(col: number): THREE.ShaderMaterial {
  const c = new THREE.Color(col);
  return new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCol: { value: new THREE.Vector3(c.r, c.g, c.b) }, uOn: { value: 0 } } });
}

// ---------------------------------------------------------------- the post pass (the body HUD's, tuned for 1:1)
const POST_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uRes; uniform vec2 uScale; uniform float uRange; uniform float uEdge; uniform vec2 uShadow; uniform float uShadowA;
varying vec2 vUv;
float dz(vec2 uv) { return texture2D(tDepth, uv).x * uRange; }
float bay(vec2 p) {
  vec2 q = mod(p, 4.0);
  float x = q.x, y = q.y;
  float v = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - mod(x, 2.0) * mod(y, 2.0) * 4.0;
  float w = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - floor(x / 2.0) * floor(y / 2.0) * 4.0;
  return (v * 4.0 + w) / 16.0;
}
void main() {
  vec2 px = 1.0 / uRes;
  vec2 uv = vUv * uScale;
  vec4 c = texture2D(tSrc, uv);
  float a = c.a;
  if (a < 0.03) {
    float n = max(max(texture2D(tSrc, uv + vec2(px.x, 0.0)).a, texture2D(tSrc, uv - vec2(px.x, 0.0)).a),
                  max(texture2D(tSrc, uv + vec2(0.0, px.y)).a, texture2D(tSrc, uv - vec2(0.0, px.y)).a));
    if (n > 0.25) { gl_FragColor = vec4(vec3(0.03, 0.03, 0.02) * 0.94, 0.94); return; }
    // a dithered drop shadow, cast down and right
    vec2 so = uv + vec2(-px.x * uShadow.x, px.y * uShadow.y);
    float s = texture2D(tSrc, so).a;
    if (s > 0.25 && so.x > 0.0 && so.y < uScale.y && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, uShadowA); return; }
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 col = c.rgb;
  if (a > 0.5) {
    // inked contours: a nearer part's edge (a depth step, not a slope)
    float d0 = dz(uv), dl = dz(uv - vec2(px.x, 0.0)), dr = dz(uv + vec2(px.x, 0.0)), dd = dz(uv - vec2(0.0, px.y)), du = dz(uv + vec2(0.0, px.y));
    float near = d0 - min(min(dl, dr), min(dd, du));
    float lap = max(abs(dl + dr - 2.0 * d0), abs(dd + du - 2.0 * d0));
    if (near > uEdge && lap > uEdge) { gl_FragColor = vec4(vec3(0.03, 0.03, 0.02) * 0.9 + col * 0.1, 1.0) * a; return; }
  }
  float d = bay(floor(gl_FragCoord.xy)) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 30.0 + 0.5 + d * 0.9) / 30.0;
  gl_FragColor = vec4(col * a, a);
}`;

// ---------------------------------------------------------------- the one context
let R: THREE.WebGLRenderer | null = null;
let dead = false;
let rt: THREE.WebGLRenderTarget | null = null;
let post: { scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(0, 1, 1, 0, 1, 2000);
cam.position.set(0, 0, 1000);
/** draws so far (dev / probes) */
export const mxStats = { draws: 0, ms: 0 };

/** is WebGL available for the machine (else the 2D pixel kit stays) */
export function mxOk(): boolean { return !!ctx(); }

function ctx(): THREE.WebGLRenderer | null {
  if (R || dead) return R;
  try {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 512;
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power', depth: true, stencil: false });
    R.setPixelRatio(1);
    R.autoClear = false;
    R.outputColorSpace = THREE.LinearSRGBColorSpace;
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false, transparent: false,
      uniforms: { tSrc: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: new THREE.Vector2(1, 1) }, uRange: { value: 1999 }, uEdge: { value: 1.6 }, uShadow: { value: new THREE.Vector2(2, 3) }, uShadowA: { value: 0.42 } },
    });
    const ps = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; ps.add(q);
    post = { scene: ps, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  } catch (e) {
    console.warn('machine UI: no WebGL, keeping the 2D kit', e);
    R = null; dead = true;
  }
  return R;
}

function ensureRT(w: number, h: number) {
  const W = Math.max(256, Math.ceil(w / 256) * 256), H = Math.max(256, Math.ceil(h / 256) * 256);
  if (rt && rt.width >= w && rt.height >= h) return;
  const nw = Math.max(W, rt?.width ?? 0), nh = Math.max(H, rt?.height ?? 0);
  rt?.dispose();
  const dt = new THREE.DepthTexture(nw, nh);
  dt.minFilter = dt.magFilter = THREE.NearestFilter;
  rt = new THREE.WebGLRenderTarget(nw, nh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: dt, generateMipmaps: false });
  post!.mat.uniforms.tDepth.value = dt;
  post!.mat.uniforms.uRes.value.set(nw, nh);
}

export interface ShotOpts {
  /** oblique shear: how far a part standing out by 1 unit slides right / down (units; negative = left / up) */
  shear?: [number, number];
  /** drop shadow offset (units, right / down) and strength */
  shadow?: [number, number]; shadowA?: number;
  /** depth step that inks a contour (units) */
  edge?: number;
  /** texels per unit (default 1) */
  k?: number;
}
export const SHEAR: [number, number] = [-0.22, -0.36];
const _sh = new THREE.Matrix4();

/**
 * render `root` (scene units, y up; the element's top-left at 0,0) over the rect
 * x -pad..w+pad, y pad..-(h+pad) into the 2D context at (dx, dy) (canvas px).
 */
export function shoot(root: THREE.Object3D, w: number, h: number, pad: number, out: CanvasRenderingContext2D, dx = 0, dy = 0, o: ShotOpts = {}): boolean {
  const r = ctx(); if (!r || !post) return false;
  const t0 = performance.now();
  const k = o.k ?? 1;
  const tw = Math.max(1, Math.round((w + pad * 2) * k)), th = Math.max(1, Math.round((h + pad * 2) * k));
  ensureRT(tw, th);
  const cv = r.domElement;
  if (cv.width < tw || cv.height < th) r.setSize(Math.max(cv.width, Math.ceil(tw / 128) * 128), Math.max(cv.height, Math.ceil(th / 128) * 128), false);
  // the camera: ortho over the padded rect, sheared so +z slides right and down
  cam.left = -pad; cam.right = w + pad; cam.top = pad; cam.bottom = -(h + pad);
  cam.near = 1; cam.far = 2000;
  cam.updateProjectionMatrix();
  const [sx, sy] = o.shear ?? SHEAR;
  // view space z = world z - 1000: x' = x + sx * zw, y' = y - sy * zw
  _sh.set(1, 0, sx, sx * 1000, 0, 1, -sy, -sy * 1000, 0, 0, 1, 0, 0, 0, 0, 1);
  cam.projectionMatrix.multiply(_sh);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  scene.add(root);
  const target = rt!;
  // clear a texel past the region too: the outline pass samples one texel beyond it
  target.viewport.set(0, 0, tw, th); target.scissor.set(0, 0, Math.min(target.width, tw + 2), Math.min(target.height, th + 2)); target.scissorTest = true;
  r.setRenderTarget(target);
  r.setClearColor(0x000000, 0);
  r.clear(true, true, false);
  target.scissor.set(0, 0, tw, th);
  r.setRenderTarget(target);
  r.render(scene, cam);
  scene.remove(root);
  // composite: outline, contours, shadow, dither -> the canvas's bottom-left corner
  r.setRenderTarget(null);
  r.setScissorTest(false);
  r.setViewport(0, 0, tw, th);
  r.setClearColor(0x000000, 0);
  r.clear(true, false, false);
  const u = post.mat.uniforms;
  u.tSrc.value = target.texture;
  u.uScale.value.set(tw / target.width, th / target.height);
  const sh = o.shadow ?? [2, 3];
  u.uShadow.value.set(sh[0] * k, sh[1] * k);
  u.uShadowA.value = o.shadowA ?? 0.42;
  u.uEdge.value = o.edge ?? 1.6;
  r.render(post.scene, post.cam);
  out.drawImage(cv, 0, cv.height - th, tw, th, dx, dy, tw, th);
  mxStats.draws++; mxStats.ms += performance.now() - t0;
  return true;
}

/** dispose every geometry / material / texture under a root (a housing that was rebuilt) */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !(m.geometry as any)._keep) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) {
      const sm = mt as THREE.ShaderMaterial;
      const map = sm.uniforms?.uMap?.value as THREE.Texture | null;
      if (map && !(map as any)._keep) map.dispose();
      if (!(sm as any)._keep) sm.dispose();
    }
  });
}

// ---------------------------------------------------------------- sprite sheets (render once, show many)
const sheets = new Map<string, HTMLCanvasElement>();
let sheetBytes = 0;
/**
 * a vertical strip of `frames` renders of one part (each (w + 2 pad) x (h + 2 pad)),
 * built by `build(frame)`; cached by key. Returns null without WebGL.
 */
export function sheet(key: string, w: number, h: number, pad: number, frames: number, build: (f: number) => THREE.Object3D, o: ShotOpts = {}): HTMLCanvasElement | null {
  const hit = sheets.get(key);
  if (hit) return hit;
  if (!ctx()) return null;
  const k = o.k ?? 1;
  const fw = Math.round((w + pad * 2) * k), fh = Math.round((h + pad * 2) * k);
  const cv = document.createElement('canvas');
  cv.width = fw; cv.height = fh * frames;
  const c = cv.getContext('2d')!;
  for (let f = 0; f < frames; f++) {
    const root = build(f);
    shoot(root, w, h, pad, c, 0, f * fh, o);
    disposeTree(root);
  }
  // a small LRU: sheets are cheap to rebuild, memory is not free
  sheetBytes += cv.width * cv.height * 4;
  sheets.set(key, cv);
  while (sheetBytes > 96e6 && sheets.size > 1) {
    const [k0, v0] = sheets.entries().next().value as [string, HTMLCanvasElement];
    sheets.delete(k0); sheetBytes -= v0.width * v0.height * 4;
  }
  return cv;
}

// ---------------------------------------------------------------- live parts: one rAF while anything moves
export interface Live { step(dt: number): boolean }
const lives = new Set<Live>();
let raf = 0, last = 0;
function tick(now: number) {
  raf = 0;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
  for (const l of [...lives]) { let more = false; try { more = l.step(dt); } catch (e) { console.error(e); } if (!more) lives.delete(l); }
  if (lives.size) raf = requestAnimationFrame(tick);
}
/** run l.step(dt) every frame until it returns false */
export function animate(l: Live) {
  lives.add(l);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}

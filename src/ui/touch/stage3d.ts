// The physical touch controls are real little 3D objects: one small WebGL
// context draws every prop (valve wheel, arcade button, toggle switch, bottle
// cap...) into a low-resolution target that matches the game's pixel size,
// then one composite pass adds the pixel outline, a drop shadow onto the game
// view, a light ordered dither and the "wrong" effects (chromatic split,
// static). Props are lit with quantised bands so they read like the
// hand-painted world, and every material shares a handful of global uniforms
// (light flicker, rust, blood) so the weird effects cost nothing per prop.
//
// The DOM buttons in touch.ts stay as the invisible hit areas; this module only
// draws. When WebGL is unavailable the CSS pixel pads remain (stage.ok false).
import * as THREE from 'three';
import { Screen } from '../font5x7';

export const DEG = Math.PI / 180;

/** uniforms every prop material shares */
export const SHARED = {
  uKey: { value: new THREE.Vector3(-0.42, 0.66, 0.62).normalize() },
  uLight: { value: 1 },
  uRust: { value: 0 },
  uBlood: { value: 0 },
  uTime: { value: 0 },
  uTint: { value: new THREE.Vector3(1, 1, 1) },
};

// ---------------------------------------------------------------- shaders
const VERT = /* glsl */`
attribute vec3 aCol;
attribute vec4 aSurf;
attribute float aGlow;
uniform float uDent;
varying vec3 vN; varying vec3 vCol; varying vec3 vLoc; varying vec4 vSurf; varying vec2 vUv; varying float vGlow;
void main() {
  vec3 p = position;
  vec3 nn = normal;
  float dw = aSurf.w;
  if (dw > 0.0) {
    // a bowl dent in the top: pushed down, normals lean toward the centre
    p.y -= uDent * dw;
    nn = normalize(nn + vec3(-p.x, 0.0, -p.z) * uDent * 14.0);
  }
  vLoc = position; vCol = aCol; vSurf = aSurf; vUv = uv; vGlow = aGlow;
  vN = normalize(normalMatrix * nn);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const NOISE = /* glsl */`
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;

const FRAG = /* glsl */`
uniform vec3 uKey; uniform float uLight; uniform float uRust; uniform float uBlood; uniform float uTime; uniform vec3 uTint;
uniform float uAlpha; uniform vec3 uGlow; uniform float uSeed; uniform float uWear; uniform float uBloodK;
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
  base = mix(base, t.rgb, t.a);
#endif
  vec3 q = vLoc * 1.0 + vec3(uSeed);
  // grime and wear: every surface is a little dirty
  float g = vn(q * 26.0);
  base *= 0.88 + 0.22 * g;
  base *= 1.0 - uWear * smoothstep(0.55, 0.9, vn(q * 9.0)) * 0.35;
  // rust creeps across metal and paint (sickness)
  float rs = vSurf.y * uRust;
  if (rs > 0.001) {
    float rn = vn(q * 6.0) * 0.62 + vn(q * 17.0 + 4.0) * 0.38;
    float e = rs * 1.25 - rn;
    if (e > 0.0) {
      vec3 rc = mix(vec3(0.30, 0.12, 0.05), vec3(0.62, 0.30, 0.10), vn(q * 37.0));
      rc = mix(rc, vec3(0.20, 0.08, 0.04), step(0.72, vn(q * 53.0)) * 0.8);
      base = e < 0.04 ? base * 0.55 + vec3(0.12, 0.04, 0.0) : rc;
      metal *= e < 0.04 ? 0.5 : 0.05;
    }
  }
  // blood: wet splashes where the hands have been (bleeding)
  float bs = vSurf.z * uBlood * uBloodK;
  float wet = 0.0;
  if (bs > 0.001) {
    float bn = vn(q * 7.0 + 11.0) * 0.6 + vn(vec3(q.x * 30.0, q.y * 5.0, q.z * 30.0) + 2.0) * 0.4;
    float e = bs * 1.2 - bn;
    if (e > 0.0) {
      base = mix(vec3(0.50, 0.03, 0.03), vec3(0.20, 0.0, 0.01), clamp(e * 4.0, 0.0, 1.0));
      wet = 1.0; metal = 0.0;
    }
  }
  float lam = clamp(dot(n, uKey), 0.0, 1.0);
  lam = floor(lam * 4.0 + 0.55) / 4.0;
  float fill = clamp(dot(n, vec3(0.62, -0.3, 0.72)), 0.0, 1.0);
  vec3 col = base * (0.26 + lam * 0.86 + fill * 0.16) * uLight * uTint;
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), wet > 0.5 ? 46.0 : 14.0 + metal * 20.0);
  float shine = max(metal, wet * 0.95);
  col += (step(0.5, sp) * 0.5 + step(0.86, sp) * 0.35) * shine * uLight * vec3(1.0, 0.96, 0.88);
  float rim = 1.0 - clamp(n.z, 0.0, 1.0);
  col += rim * rim * rim * 0.10 * vec3(0.7, 0.85, 1.0) * uLight;
  // lamps and screens: lit from inside (uGlow = colour x intensity)
  vec3 lit = base * uGlow * 1.7 + uGlow * 0.3;
  col = mix(col, lit, clamp(vGlow * max(uGlow.r, max(uGlow.g, uGlow.b)) * 1.6, 0.0, 1.0));
  gl_FragColor = vec4(col, uAlpha);
}
`;

/** dithered contact shadow (a pixel checker of black, density uDens) */
const SHADOW_FRAG = /* glsl */`
uniform float uDens; uniform float uAlpha; uniform vec3 uCol;
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  float b = mod(p.x + p.y, 2.0);
  float b2 = mod(floor(p.x * 0.5) + floor(p.y * 0.5), 2.0);
  float th = uDens > 0.75 ? 1.0 : uDens > 0.5 ? b + b2 * 0.5 : b * b2;
  if (th < 0.5) discard;
  gl_FragColor = vec4(uCol, uAlpha);
}
`;
const SHADOW_VERT = /* glsl */`void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** particles (blood drops, steam, sparks): one instanced draw */
const PART_VERT = /* glsl */`
attribute vec4 aPC;
varying vec4 vC;
void main() { vC = aPC; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }
`;
const PART_FRAG = /* glsl */`
varying vec4 vC;
void main() {
  if (vC.a < 0.99) { vec2 p = floor(gl_FragCoord.xy); if (mod(p.x + p.y, 2.0) > vC.a * 2.0 - 0.01) discard; }
  gl_FragColor = vec4(vC.rgb, 1.0);
}
`;

const POST_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uRes; uniform float uChroma; uniform float uStatic; uniform float uTime; uniform vec2 uShadow;
varying vec2 vUv;
float bay(vec2 p) {
  vec2 q = mod(p, 4.0);
  float x = q.x, y = q.y;
  float v = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - mod(x, 2.0) * mod(y, 2.0) * 4.0;
  float w = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - floor(x / 2.0) * floor(y / 2.0) * 4.0;
  return (v * 4.0 + w) / 16.0;
}
float hh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 px = 1.0 / uRes;
  vec2 uv = vUv;
  if (uStatic > 0.0) {
    float row = floor(uv.y * uRes.y / 2.0);
    float k = hh(vec2(row, floor(uTime * 24.0)));
    if (k < uStatic * 0.25) uv.x += (hh(vec2(floor(uTime * 24.0), row)) - 0.5) * 12.0 * px.x * uStatic;
  }
  vec4 c = texture2D(tSrc, uv);
  if (uChroma > 0.0) {
    vec4 cr = texture2D(tSrc, uv + vec2(uChroma * px.x, 0.0));
    vec4 cb = texture2D(tSrc, uv - vec2(uChroma * px.x, 0.0));
    c.r = cr.a > 0.02 ? cr.r : c.r * 0.6; c.b = cb.a > 0.02 ? cb.b : c.b * 0.6;
    c.a = max(c.a, max(cr.a, cb.a) * 0.7);
  }
  float a = c.a;
  if (a < 0.02) {
    float n = max(max(texture2D(tSrc, uv + vec2(px.x, 0.0)).a, texture2D(tSrc, uv - vec2(px.x, 0.0)).a),
                  max(texture2D(tSrc, uv + vec2(0.0, px.y)).a, texture2D(tSrc, uv - vec2(0.0, px.y)).a));
    if (n > 0.02) { gl_FragColor = vec4(vec3(0.035, 0.028, 0.02) * n, n * 0.96); return; }
    float s = texture2D(tSrc, uv + vec2(-uShadow.x * px.x, uShadow.y * px.y)).a;
    if (s > 0.02) { float sa = 0.42 * s; gl_FragColor = vec4(0.0, 0.0, 0.0, sa); return; }
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 col = c.rgb;
  if (uStatic > 0.0) col = mix(col, vec3(hh(floor(uv * uRes) + fract(uTime * 7.0))), uStatic * 0.18);
  float d = bay(floor(gl_FragCoord.xy)) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 30.0 + 0.5 + d * 0.9) / 30.0;
  gl_FragColor = vec4(col * a, a);
}
`;

// ---------------------------------------------------------------- geometry
/** surface: metal (shine), rust uptake, blood uptake, dent weight */
export type Surf = [number, number, number, number];
export const PAINT: Surf = [0.18, 1, 1, 0];
export const STEEL: Surf = [0.8, 0.55, 0.8, 0];
export const CHROME: Surf = [1, 0.25, 0.7, 0];
export const BRASS: Surf = [0.75, 0.3, 0.7, 0];
export const RUBBER: Surf = [0.04, 0, 0.6, 0];
export const PLASTIC: Surf = [0.3, 0, 0.7, 0];
export const CLOTH: Surf = [0, 0.12, 1, 0];
export const PAPER: Surf = [0, 0.15, 0.9, 0];
export const GLASS: Surf = [0.9, 0, 0.35, 0];
export const CERAMIC: Surf = [0.45, 0, 0.5, 0];

export type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

/** builds one mesh's geometry from transformed primitives, each with a colour and a surface */
export class Mold {
  private p: number[] = []; private n: number[] = []; private c: number[] = []; private u: number[] = []; private s: number[] = []; private gl: number[] = [];
  add(src: THREE.BufferGeometry, m: THREE.Matrix4 | null, color: number | ColorFn, surf: Surf | ((x: number, y: number, z: number) => Surf) = PAINT, glow = 0): this {
    const g = src.index ? src.toNonIndexed() : src;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), UV = g.getAttribute('uv');
    if (m) _nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i); if (m) _v.applyMatrix4(m);
      if (N) { _n.fromBufferAttribute(N, i); if (m) _n.applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
      const hex = typeof color === 'number' ? color : color(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z);
      this.c.push(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
      if (UV) this.u.push(UV.getX(i), UV.getY(i)); else this.u.push(0, 0);
      const sf = typeof surf === 'function' ? surf(_v.x, _v.y, _v.z) : surf;
      this.s.push(sf[0], sf[1], sf[2], sf[3]);
      this.gl.push(glow);
    }
    if (g !== src) g.dispose();
    src.dispose();
    return this;
  }
  /** raw triangles (already in mold space) */
  tris(pos: number[], nor: number[], col: number[], uv: number[], surf: number[]): this {
    this.p.push(...pos); this.n.push(...nor); this.c.push(...col); this.u.push(...uv); this.s.push(...surf);
    for (let i = 0; i < pos.length / 3; i++) this.gl.push(0);
    return this;
  }
  get empty() { return this.p.length === 0; }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.s, 4));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.gl, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** transform: translate, rotate (XYZ radians), scale */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// ---------------------------------------------------------------- textures
/** a tiny pixel texture drawn with the 5x7 font kit (nearest filtering, raw colours) */
export function pixTex(w: number, h: number, draw: (s: Screen) => void, clear = -1): { tex: THREE.CanvasTexture; scr: Screen; redraw: (d?: (s: Screen) => void) => void } {
  const scr = new Screen(w, h);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const redraw = (d: (s: Screen) => void = draw) => {
    if (clear < 0) scr.data.fill(0); else scr.clear(clear);
    d(scr);
    ctx.putImageData(scr.img, 0, 0);
    tex.needsUpdate = true;
  };
  redraw();
  return { tex, scr, redraw };
}
/** Screen colour with alpha */
export const C = (rgb: number, a = 255) => Screen.c(rgb, a);

// ---------------------------------------------------------------- props
export interface PropMatOpts { map?: THREE.Texture; side?: THREE.Side; wear?: number; decal?: boolean }

/**
 * A control drawn in 3D. `root` sits at the hit area's centre (in low-res
 * pixels) scaled to its size; `body` carries the view elevation and the
 * twitch spring; subclasses build their parts under `body` in a unit
 * "panel" space (x right, y out of the panel, z toward the viewer).
 */
export class Prop {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly mats: THREE.ShaderMaterial[] = [];
  /** how much of the survivor's blood ends up on this control (the valve gets the most) */
  bloodK = 0.35;
  /** view elevation: 90 deg = straight down onto the panel */
  elev = 58 * DEG;
  /** model units across the hit area's smaller side */
  fit = 1;
  /** extra screen offset of the model inside its hit area (fractions of the rect) */
  ox = 0; oy = 0;
  // press spring (0 up .. 1 bottomed out)
  press = 0; pv = 0; held = false;
  /** stiffness of the press spring */
  k = 1400;
  on = false; onT = 0;
  // twitch / jolt spring (screen px and radians)
  tx = 0; ty = 0; tr = 0; tvx = 0; tvy = 0; tvr = 0;
  /** a held displacement ("shift"): the prop sits off its place for a while */
  hx = 0; hy = 0; hold = 0;
  alpha = 1; shown = false;
  cx = 0; cy = 0; w = 0; h = 0;
  seed = Math.random() * 40;
  /** set while the prop wants frames (animating) */
  busy = true;
  /** exploded (band detonation): flies off */
  boom: { vx: number; vy: number; vr: number; t: number } | null = null;

  constructor(readonly key: string) { this.root.add(this.body); }

  mat(o: PropMatOpts = {}): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      defines: o.map ? (o.decal ? { USE_MAP: '', DECAL: '' } : { USE_MAP: '' }) : {},
      side: o.side ?? THREE.DoubleSide,
      uniforms: {
        ...SHARED,
        uAlpha: { value: 1 }, uGlow: { value: new THREE.Vector3() }, uDent: { value: 0 }, uSeed: { value: this.seed + this.mats.length * 3.1 },
        uWear: { value: o.wear ?? 0.5 }, uMap: { value: o.map ?? null }, uBloodK: { value: this.bloodK },
      },
    });
    this.mats.push(m);
    return m;
  }
  mesh(m: Mold, mat: THREE.ShaderMaterial, parent: THREE.Object3D = this.body): THREE.Mesh {
    const me = new THREE.Mesh(m.build(), mat);
    me.frustumCulled = false;
    parent.add(me);
    return me;
  }
  /** dithered contact shadow disc / quad lying on the panel */
  shadow(geo: THREE.BufferGeometry, parent: THREE.Object3D = this.body, dens = 0.6, col = 0x050403): THREE.Mesh {
    const m = new THREE.ShaderMaterial({ vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, side: THREE.DoubleSide, uniforms: { uDens: { value: dens }, uAlpha: { value: 1 }, uCol: { value: new THREE.Vector3(((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255) } }, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    (m as any)._shadow = true;
    this.mats.push(m);
    const me = new THREE.Mesh(geo, m);
    // after the solid parts, so it lands on whatever surface lies under it
    me.frustumCulled = false; me.renderOrder = 1;
    parent.add(me);
    return me;
  }

  /** place over a hit area (CSS px), px = CSS px per low-res pixel */
  place(cx: number, cy: number, w: number, h: number, px: number) {
    this.cx = cx; this.cy = cy; this.w = w; this.h = h;
    const s = Math.min(w, h) / px * this.fit;
    this.root.scale.setScalar(s);
    this.applyPos(px);
  }
  applyPos(px: number) {
    const ex = this.boom ? this.boom.vx * this.boom.t + 0 : 0;
    const ey = this.boom ? this.boom.vy * this.boom.t + 900 * this.boom.t * this.boom.t : 0;
    this.root.position.set(
      Math.round((this.cx + this.ox * this.w + this.tx + this.hx + ex) / px),
      -Math.round((this.cy + this.oy * this.h + this.ty + this.hy + ey) / px),
      0);
    this.body.rotation.set(this.elev, 0, -(this.tr + (this.boom ? this.boom.vr * this.boom.t : 0)));
  }

  setAlpha(a: number) {
    if (Math.abs(a - this.alpha) < 1e-3) return;
    this.alpha = a;
    for (const m of this.mats) m.uniforms.uAlpha.value = a;
  }

  /** finger down / up on the hit area */
  down() { this.held = true; this.busy = true; this.onDown(); }
  up(cancelled = false) { this.held = false; this.busy = true; this.onUp(cancelled); }
  /** game state toggle (sneaking, flashlight...) */
  setOn(v: boolean, quiet = false) {
    if (v === this.on) return;
    this.on = v; this.busy = true;
    this.onToggle(v, quiet);
  }
  /** a sudden knock (screen px / radians) */
  jolt(x: number, y: number, r: number) { this.tvx += x; this.tvy += y; this.tvr += r; this.busy = true; }

  /** springs + animation; returns true while anything is still moving */
  step(dt: number, px: number): boolean {
    let moving = false;
    // press: fast, bottoms out with a tiny bounce, springs back with an overshoot
    const goal = this.held ? 1 : 0;
    const k = this.k, c = 2 * Math.sqrt(k) * (this.held ? 0.9 : 0.42);
    this.pv += (-k * (this.press - goal) - c * this.pv) * dt;
    this.press += this.pv * dt;
    if (this.press > 1) { this.press = 1; this.pv = -Math.abs(this.pv) * 0.18; }
    if (Math.abs(this.press - goal) > 0.002 || Math.abs(this.pv) > 0.02) moving = true; else { this.press = goal; this.pv = 0; }
    // twitch spring
    const tk = 260, tc = 2 * Math.sqrt(tk) * 0.32;
    this.tvx += (-tk * this.tx - tc * this.tvx) * dt; this.tvy += (-tk * this.ty - tc * this.tvy) * dt; this.tvr += (-tk * this.tr - tc * this.tvr) * dt;
    this.tx += this.tvx * dt; this.ty += this.tvy * dt; this.tr += this.tvr * dt;
    if (Math.abs(this.tx) + Math.abs(this.ty) + Math.abs(this.tr) * 30 + Math.abs(this.tvx) + Math.abs(this.tvy) > 0.05) moving = true;
    else { this.tx = this.ty = this.tr = this.tvx = this.tvy = this.tvr = 0; }
    if (this.hold > 0) { this.hold -= dt; moving = true; if (this.hold <= 0) { this.tx += this.hx; this.ty += this.hy; this.hx = this.hy = 0; } }
    if (this.boom) { this.boom.t += dt; moving = true; }
    this.onT = Math.min(1, this.onT + dt);
    if (this.animate(dt)) moving = true;
    this.applyPos(px);
    this.busy = moving;
    return moving;
  }

  // ---- overridables
  protected onDown() { /* sounds */ }
  protected onUp(_cancelled: boolean) { /* sounds */ }
  protected onToggle(_v: boolean, _quiet: boolean) { /* sounds */ }
  /** apply press / on / time to the parts; return true while animating */
  protected animate(_dt: number): boolean { return false; }
  /** screen-space anchor for effects (CSS px), e.g. where blood drips from */
  dripPoint(): [number, number] | null { return null; }
}

// ---------------------------------------------------------------- particles
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; w: number; h: number; r: number; g: number; b: number; a: number; grav: number; drag: number; stretch: boolean; hang: number }

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private list: Part[] = [];
  private pc: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  constructor(readonly max = 96) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.pc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    geo.setAttribute('aPC', this.pc);
    const mat = new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, depthTest: false, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
  }
  get alive() { return this.list.length; }
  /** x, y in CSS px; velocities px/s */
  spawn(x: number, y: number, vx: number, vy: number, life: number, w: number, h: number, rgb: number, o: { grav?: number; drag?: number; stretch?: boolean; a?: number; hang?: number } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, y, vx, vy, life, max: life, w, h, r: ((rgb >> 16) & 255) / 255, g: ((rgb >> 8) & 255) / 255, b: (rgb & 255) / 255, a: o.a ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0, stretch: !!o.stretch, hang: o.hang ?? 0 });
  }
  clear() { this.list.length = 0; this.mesh.count = 0; }
  update(dt: number, px: number) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.hang > 0) { p.hang -= dt; }
      else {
        p.vy += p.grav * dt;
        const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      L[j++] = p;
    }
    L.length = j;
    const pc = this.pc.array as Float32Array;
    for (let i = 0; i < j; i++) {
      const p = L[i];
      const hgt = p.stretch && p.hang <= 0 ? Math.max(p.h, Math.min(p.h * 4, Math.abs(p.vy) * 0.018)) : p.hang > 0 ? p.h * (1.4 - p.hang * 0.8) : p.h;
      const fade = p.a * Math.min(1, p.life / Math.max(0.05, p.max * 0.35));
      this.m.makeScale(Math.max(1, Math.round(p.w / px)), Math.max(1, Math.round(hgt / px)), 1);
      this.m.setPosition(Math.round(p.x / px), -Math.round(p.y / px), 50);
      this.mesh.setMatrixAt(i, this.m);
      pc[i * 4] = p.r; pc[i * 4 + 1] = p.g; pc[i * 4 + 2] = p.b; pc[i * 4 + 3] = fade;
    }
    this.mesh.count = j;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.pc.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- stage
export class Stage {
  ok = false;
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  readonly scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
  private rt: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;
  readonly parts = new Particles();
  readonly props = new Map<string, Prop>();
  /** CSS px per low-res pixel */
  px = 1;
  W = 0; H = 0;
  dirty = true;
  /** composite effects */
  chroma = 0; stat = 0;
  private lastRender = 0;

  constructor(host: HTMLElement) {
    this.canvas.className = 'nc-3d-canvas';
    host.prepend(this.canvas);
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false, depth: true, stencil: false });
      r.setPixelRatio(1);
      r.setClearColor(0x000000, 0);
      r.autoClear = false;
      this.renderer = r;
      this.ok = true;
    } catch (e) {
      console.warn('[touch] 3D controls unavailable, using flat pads', e);
      this.canvas.remove();
      return;
    }
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.ok = true; this.rt?.dispose(); this.rt = null; this.dirty = true; });
    this.scene.add(this.parts.mesh);
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false, transparent: false,
      uniforms: { tSrc: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uChroma: { value: 0 }, uStatic: { value: 0 }, uTime: SHARED.uTime, uShadow: { value: new THREE.Vector2(2, 3) } },
    });
    const ps = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; ps.add(q);
    this.post = { scene: ps, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }

  add(p: Prop) { this.props.set(p.key, p); this.scene.add(p.root); p.root.visible = false; return p; }

  /** px: CSS px per low-res pixel (follows the game's pixel size) */
  resize(px: number) {
    if (!this.renderer) return;
    const W = Math.max(1, Math.ceil(window.innerWidth / px)), H = Math.max(1, Math.ceil(window.innerHeight / px));
    if (W === this.W && H === this.H && px === this.px && this.rt) return;
    this.px = px; this.W = W; this.H = H;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = (W * px) + 'px';
    this.canvas.style.height = (H * px) + 'px';
    this.cam.left = 0; this.cam.right = W; this.cam.top = 0; this.cam.bottom = -H;
    this.cam.updateProjectionMatrix();
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, type: THREE.UnsignedByteType });
    this.post!.mat.uniforms.uRes.value.set(W, H);
    this.post!.mat.uniforms.uShadow.value.set(Math.max(1, Math.round(2 / px)) , Math.max(1, Math.round(3 / px)));
    for (const p of this.props.values()) p.place(p.cx, p.cy, p.w, p.h, px);
    this.dirty = true;
  }

  /** draw if anything changed (or every frame while something animates); maxFps caps idle animation */
  render(now: number, maxFps = 60) {
    const r = this.renderer;
    if (!r || !this.ok || !this.rt || !this.post) return;
    if (!this.dirty) return;
    if (now - this.lastRender < 1000 / maxFps - 2) return;
    this.lastRender = now;
    this.dirty = false;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.scene, this.cam);
    const u = this.post.mat.uniforms;
    u.tSrc.value = this.rt.texture;
    u.uChroma.value = this.chroma;
    u.uStatic.value = this.stat;
    r.setRenderTarget(null);
    r.clear(true, false, false);
    r.render(this.post.scene, this.post.cam);
  }

  /** wipe the canvas (controls hidden) */
  blank() {
    const r = this.renderer;
    if (!r || !this.ok) return;
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    this.dirty = true;
  }
}

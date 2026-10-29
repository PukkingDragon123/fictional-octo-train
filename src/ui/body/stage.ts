// The body HUD's little 3D stage. It has no WebGL context of its own: the game
// renderer calls render() at the end of every frame (renderer.afterRender), we
// draw the scene into a low-resolution target at the game's pixel size, then
// composite it into a corner of the screen with a pixel outline, a dithered
// drop shadow and ordered dither, so the props read like the touch controls
// and the rest of the hand-painted world. Units: 1 = one low-res pixel.
import * as THREE from 'three';
import { G } from '../../game/G';
import { Prop, type PropMatOpts } from '../touch/stage3d';
import { Pix } from './pix';
import { cssFont } from '../../gfx/crt';

const NOISE = /* glsl */`
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;
const SURF_VERT = /* glsl */`
attribute vec3 aCol;
varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying vec3 vLoc;
void main() {
  vCol = aCol; vUv = uv; vLoc = position;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const HEAD = /* glsl */`
uniform vec3 uKey; uniform float uLight; uniform vec3 uTint; uniform float uTime; uniform float uAlpha; uniform vec3 uMul;
varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying vec3 vLoc;
${NOISE}
vec3 nrm() { vec3 n = normalize(vN); return gl_FrontFacing ? n : -n; }
`;
/** glass: thick green-grey edges, fresnel, a window reflection band and a bright line, a hot specular; cracks from the map */
const GLASS_FRAG = HEAD + /* glsl */`
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
void main() {
  vec3 n = nrm();
  float ndv = abs(n.z), fr = pow(1.0 - ndv, 3.0);
  vec3 col = uMul * (0.45 + 0.4 * ndv);
  float a = uAlpha + fr * 0.8;
  // the room's fluorescent tube reflected down the curve, and a thin bright edge on the far side
  float band = smoothstep(0.2, 0.02, abs(n.x + 0.42)) * (0.45 + 0.55 * smoothstep(-0.7, 0.5, n.y));
  col = mix(col, vec3(1.0, 0.99, 0.94), band * 0.7); a = max(a, band * 0.5);
  float line = smoothstep(0.06, 0.0, abs(n.x - 0.66));
  col = mix(col, vec3(0.95), line * 0.6); a = max(a, line * 0.4);
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), 70.0);
  col += sp * 1.3; a = max(a, min(1.0, sp * 1.6));
  // grime: finger smudges dull it in patches
  float g = vn(vLoc * 0.4 + 3.0);
  a += smoothstep(0.6, 0.9, g) * 0.08;
#ifdef USE_MAP
  vec4 t = texture2D(uMap, vUv);
  col = mix(col, t.rgb, t.a); a = max(a, t.a);
#endif
  gl_FragColor = vec4(col * uLight * uTint, clamp(a, 0.0, 1.0));
}`;
/** liquid: thin edges let the light through, it darkens with depth, a bright meniscus at the surface, caustic glints, foam, sparks */
const LIQUID_FRAG = HEAD + /* glsl */`
uniform vec3 uDeepC; uniform float uSurf; uniform float uGlint; uniform float uFoam; uniform float uSpark; uniform float uThick;
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 n = nrm();
  float ndv = abs(n.z);
  float depth = clamp((uSurf - vLoc.y) * uThick, 0.0, 1.0);
  vec3 col = mix(uMul * 1.3, uDeepC, clamp(ndv * 0.55 + depth * 0.5, 0.0, 1.0));
  float lam = dot(n, uKey) * 0.5 + 0.5;
  col *= 0.6 + 0.55 * lam;
  // meniscus: the surface climbs the wall and catches the light
  float m = smoothstep(1.3, 0.0, uSurf - vLoc.y);
  col = mix(col, uMul * 1.9 + 0.12, m * 0.75);
  // caustic glints: moving cells of light, strongest just under the surface
  float c = vn(vec3(vLoc.x * 0.8, vLoc.y * 0.8 + uTime * 0.6, uTime * 1.1)) * vn(vec3(vLoc.x * 1.7 - uTime * 0.4, vLoc.y * 1.5, 3.0));
  float glint = smoothstep(0.42, 0.55, c) * uGlint * (0.35 + 0.65 * smoothstep(-18.0, 0.0, vLoc.y - uSurf));
  col += glint * vec3(1.0, 0.97, 0.85) * 0.7;
  // foam on an inflamed surface
  if (uFoam > 0.0) { float f = vn(vec3(vLoc.xz * 1.6, uTime * 2.0)); col = mix(col, vec3(0.97, 0.95, 0.88), step(1.0 - uFoam * 0.7, f) * smoothstep(2.2, 0.0, uSurf - vLoc.y)); }
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), 50.0);
  col += sp * 0.9;
  float a = uAlpha;
  if (uSpark > 0.0) { float k = h2(floor(gl_FragCoord.xy) + floor(uTime * 12.0)); if (k < uSpark * 0.06) { col = k < uSpark * 0.03 ? vec3(0.55, 1.0, 0.62) : vec3(0.92, 1.0, 0.88); a = 1.0; } }
  gl_FragColor = vec4(col * uLight * uTint, a);
}`;
/** latex: wrapped soft light, warm light through the thin rim, a broad sheen and a small hard highlight */
const RUBBER_FRAG = HEAD + /* glsl */`
void main() {
  vec3 n = nrm();
  vec3 base = vCol * uMul;
  float lam = dot(n, uKey) * 0.5 + 0.5;
  vec3 col = base * (0.28 + 0.82 * lam * lam);
  float fr = pow(1.0 - abs(n.z), 2.2);
  col += base * vec3(1.0, 0.62, 0.55) * fr * 0.5;
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = max(dot(n, hv), 0.0);
  col += vec3(1.0, 0.93, 0.92) * (pow(sp, 9.0) * 0.22 + pow(sp, 110.0) * 0.95);
  // talc dust and a few scuffs
  col *= 0.93 + 0.1 * vn(vLoc * 2.2);
  gl_FragColor = vec4(col * uLight * uTint, uAlpha);
}`;
/** PVC bag: crinkled, yellowed, translucent; whitens at grazing angles; streaky highlights; the print is opaque paper and ink */
const PLASTIC_FRAG = HEAD + /* glsl */`
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
void main() {
  vec3 n = nrm();
  // crinkles: the normal wanders
  vec3 w = vec3(vn(vLoc * 0.32) - 0.5, vn(vLoc * 0.32 + 7.0) - 0.5, 0.0) * 0.9 + vec3(vn(vLoc * 0.9 + 2.0) - 0.5, 0.0, 0.0) * 0.4;
  n = normalize(n + w);
  float ndv = abs(n.z), fr = pow(1.0 - ndv, 2.0);
  vec3 col = uMul * (0.55 + 0.45 * (dot(n, uKey) * 0.5 + 0.5));
  float a = uAlpha + fr * 0.55;
  col = mix(col, vec3(0.97, 0.98, 0.95), fr * 0.6);
  float streak = pow(max(0.0, 1.0 - abs(n.x + 0.32) * 3.5), 3.0);
  col = mix(col, vec3(1.0), streak * 0.6); a = max(a, streak * 0.45);
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), 60.0);
  col += sp; a = max(a, min(1.0, sp * 1.4));
#ifdef USE_MAP
  vec4 t = texture2D(uMap, vUv);
  vec3 pc = t.rgb * (0.7 + 0.35 * (dot(normalize(vN), uKey) * 0.5 + 0.5));
  col = mix(col, pc, t.a); a = max(a, t.a);
#endif
  gl_FragColor = vec4(col * uLight * uTint, clamp(a, 0.0, 1.0));
}`;

/** instanced cubes: drops, crumbs, chunks, bubbles (per-instance colour + alpha) */
const CUBE_VERT = /* glsl */`
attribute vec4 aPC;
varying vec4 vC; varying vec3 vN;
void main() {
  vC = aPC;
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const CUBE_FRAG = /* glsl */`
uniform vec3 uKey; uniform float uLight; uniform vec3 uTint;
varying vec4 vC; varying vec3 vN;
void main() {
  if (vC.a < 0.99) { vec2 p = floor(gl_FragCoord.xy); if (mod(p.x + p.y, 2.0) > vC.a * 2.0 - 0.01) discard; }
  float lam = clamp(dot(normalize(vN), uKey), 0.0, 1.0);
  lam = floor(lam * 3.0 + 0.5) / 3.0;
  gl_FragColor = vec4(vC.rgb * (0.45 + lam * 0.7) * uLight * uTint, 1.0);
}`;

const POST_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
/** outline, dithered drop shadow, ordered dither; premultiplied output */
const POST_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uFade; uniform float uRange; uniform float uEdge; uniform vec2 uShadow;
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
  vec4 c = texture2D(tSrc, vUv);
  float a = c.a;
  if (a < 0.03) {
    float n = max(max(texture2D(tSrc, vUv + vec2(px.x, 0.0)).a, texture2D(tSrc, vUv - vec2(px.x, 0.0)).a),
                  max(texture2D(tSrc, vUv + vec2(0.0, px.y)).a, texture2D(tSrc, vUv - vec2(0.0, px.y)).a));
    if (n > 0.25) { float o = 0.92 * uFade; gl_FragColor = vec4(vec3(0.035, 0.028, 0.02) * o, o); return; }
    // a dithered shadow cast down and away: the rig floats, so it falls further when it rises
    float s = texture2D(tSrc, vUv + vec2(-px.x * uShadow.x, px.y * uShadow.y)).a;
    if (s > 0.25 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) { float sa = 0.4 * uFade; gl_FragColor = vec4(0.0, 0.0, 0.0, sa); return; }
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 col = c.rgb;
  // inked contours inside the silhouette: a nearer part's edge (a depth step, not a slope)
  if (a > 0.5) {
    float d0 = dz(vUv), dl = dz(vUv - vec2(px.x, 0.0)), dr = dz(vUv + vec2(px.x, 0.0)), dd = dz(vUv - vec2(0.0, px.y)), du = dz(vUv + vec2(0.0, px.y));
    float near = d0 - min(min(dl, dr), min(dd, du));
    float lap = max(abs(dl + dr - 2.0 * d0), abs(dd + du - 2.0 * d0));
    if (near > uEdge && lap > uEdge) { float o = 0.95 * uFade; gl_FragColor = vec4(vec3(0.035, 0.028, 0.02) * o, o); return; }
  }
  float d = bay(floor(gl_FragCoord.xy)) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 28.0 + 0.5 + d * 0.9) / 28.0;
  a *= uFade;
  gl_FragColor = vec4(col * a, a);
}`;

export type SurfKind = 'glass' | 'liquid' | 'rubber' | 'plastic';
export interface SurfOpts { map?: THREE.Texture | null; alpha?: number; color?: number; deep?: number; side?: THREE.Side; depthWrite?: boolean; glint?: number; thick?: number }

/**
 * A texture painted at k times a Pix's resolution: the pixel art is scaled up crisp,
 * then real type (typewriter labels, gauge numerals, Nixie digits) is drawn over it
 * with the canvas font engine at the full resolution.
 */
export class PrintTex {
  readonly pix: Pix;
  readonly tex: THREE.CanvasTexture;
  readonly cv: HTMLCanvasElement;
  private small: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  constructor(w: number, h: number, readonly k = 2) {
    this.pix = new Pix(w, h);
    this.small = document.createElement('canvas'); this.small.width = w; this.small.height = h;
    this.sctx = this.small.getContext('2d')!;
    this.cv = document.createElement('canvas'); this.cv.width = w * k; this.cv.height = h * k;
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
  }
  commit(type?: (ctx: CanvasRenderingContext2D, k: number) => void) {
    this.sctx.putImageData(this.pix.img, 0, 0);
    const c = this.ctx;
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.small, 0, 0, this.cv.width, this.cv.height);
    if (type) { c.save(); type(c, this.k); c.restore(); }
    this.tex.needsUpdate = true;
  }
}

/** real type for things printed on the props (canvas font strings from src/ui/fonts.css) */
export const FONT = {
  get type() { return cssFont('--font-type'); },
  get typeset() { return cssFont('--font-typeset'); },
  get sign() { return cssFont('--font-sign', 'sans-serif'); },
  get nixie() { return cssFont('--font-nixie'); },
};
let scratch: HTMLCanvasElement | null = null, sctx: CanvasRenderingContext2D | null = null;
/**
 * printed type in Space Grotesk, thresholded to hard pixels (no grey font smoothing):
 * x, y = the baseline anchor (align left / center / right), px = the font size
 */
export function inkText(c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, font: string, color = '#231a12', align: CanvasTextAlign = 'left', weight = '') {
  const wgt = weight.replace(/italic\s*/g, '').trim();
  const size = Math.max(5, Math.round(px));
  if (!scratch) { scratch = document.createElement('canvas'); sctx = scratch.getContext('2d', { willReadFrequently: true }); }
  const g = sctx!;
  const f = `${wgt}${wgt ? ' ' : ''}${size}px ${font}`;
  g.font = f;
  const w = Math.ceil(g.measureText(text).width) + 4, h = Math.ceil(size * 1.5) + 4;
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
  g.clearRect(0, 0, scratch.width, scratch.height);
  g.font = f; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = color;
  const base = Math.ceil(size * 1.1) + 1;
  g.fillText(text, 2, base);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  g.putImageData(img, 0, 0);
  const tw = w - 4;
  const ox = align === 'center' ? Math.round(x - tw / 2) : align === 'right' || align === 'end' ? Math.round(x - tw) : Math.round(x);
  const prev = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
  c.drawImage(scratch, 0, 0, w, h, ox - 2, Math.round(y) - base, w, h);
  c.imageSmoothingEnabled = prev;
}

export class Cubes {
  readonly mesh: THREE.InstancedMesh;
  private pc: THREE.InstancedBufferAttribute;
  n = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private s = new THREE.Vector3();
  constructor(readonly max: number, mat: THREE.ShaderMaterial) {
    // little rounded lumps (drops, bubbles, crumbs, chunks): never cubes
    const geo = new THREE.IcosahedronGeometry(0.62, 0);
    this.pc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    geo.setAttribute('aPC', this.pc);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
  }
  begin() { this.n = 0; }
  put(x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, rgb: number, a = 1) {
    if (this.n >= this.max) return;
    this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rot * 0.7, rot, rot * 0.3)), this.s.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n, this.m);
    const pc = this.pc.array as Float32Array, i = this.n * 4;
    pc[i] = ((rgb >> 16) & 255) / 255; pc[i + 1] = ((rgb >> 8) & 255) / 255; pc[i + 2] = (rgb & 255) / 255; pc[i + 3] = a;
    this.n++;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.pc.needsUpdate = true; }
}

export class BodyStage {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  /** a host prop: makes the touch controls' grimy banded-light material for our opaque parts */
  private host = new Prop('bodyhud');
  readonly uLight = { value: 1 };
  readonly uTint = { value: new THREE.Vector3(1, 0.95, 0.82) };
  readonly uKey = { value: new THREE.Vector3(-0.25, 0.82, 0.52).normalize() };
  readonly uTime = { value: 0 };
  readonly cubeMat: THREE.ShaderMaterial;
  private rt: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial };
  /** drop shadow offset in texels (x left, y down): grows as the floating rig rises */
  get shadow(): THREE.Vector2 { return this.post.mat.uniforms.uShadow.value; }
  /** low-res size and where it sits (CSS px, top-left) */
  W = 1; H = 1; px = 2; css = { x: 0, y: 0, w: 1, h: 1 };
  visible = false;
  fade = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor() {
    this.cam.position.set(0, 0, 500);
    // drops, bubbles and crumbs don't write depth: no inked contour rings round every bubble in the jar
    this.cubeMat = new THREE.ShaderMaterial({ vertexShader: CUBE_VERT, fragmentShader: CUBE_FRAG, depthWrite: false, uniforms: { uKey: this.uKey, uLight: this.uLight, uTint: this.uTint } });
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { tSrc: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uFade: { value: 1 }, uRange: { value: 4000 }, uEdge: { value: 1.6 }, uShadow: { value: new THREE.Vector2(1, 2) } },
    });
    const ps = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; ps.add(q);
    this.post = { scene: ps, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    G.pr?.afterRender?.push((r: THREE.WebGLRenderer) => this.render(r));
  }

  /** the touch controls' material, with our own light / tint / key (the fluorescent hum is ours) */
  solid(o: PropMatOpts = {}): THREE.ShaderMaterial {
    const m = this.host.mat(o);
    m.uniforms.uLight = this.uLight; m.uniforms.uTint = this.uTint; m.uniforms.uKey = this.uKey; m.uniforms.uTime = this.uTime;
    m.uniforms.uRust = { value: 0 }; m.uniforms.uBlood = { value: 0 };
    return m;
  }
  /** the realistic surfaces: glass, liquid, latex, PVC */
  surf(kind: SurfKind, o: SurfOpts = {}): THREE.ShaderMaterial {
    const c = new THREE.Color(o.color ?? 0xffffff), d = new THREE.Color(o.deep ?? 0x000000);
    const frag = kind === 'glass' ? GLASS_FRAG : kind === 'liquid' ? LIQUID_FRAG : kind === 'rubber' ? RUBBER_FRAG : PLASTIC_FRAG;
    const opaque = kind === 'rubber';
    return new THREE.ShaderMaterial({
      vertexShader: SURF_VERT, fragmentShader: frag, transparent: !opaque, depthWrite: o.depthWrite ?? opaque,
      side: o.side ?? THREE.DoubleSide, defines: o.map ? { USE_MAP: '' } : {},
      uniforms: {
        uKey: this.uKey, uLight: this.uLight, uTint: this.uTint, uTime: this.uTime, uMap: { value: o.map ?? null },
        uAlpha: { value: o.alpha ?? (opaque ? 1 : 0.2) }, uMul: { value: new THREE.Vector3(c.r, c.g, c.b) },
        uDeepC: { value: new THREE.Vector3(d.r, d.g, d.b) }, uSurf: { value: 0 }, uGlint: { value: o.glint ?? 0 }, uFoam: { value: 0 }, uSpark: { value: 0 },
        uThick: { value: o.thick ?? 0.05 },
      },
    });
  }

  /**
   * place the stage: CSS position (top-left), size in units, and device px per unit (the
   * game's pixel size). The target holds `detail` texels per unit so real type stays legible.
   */
  layout(x: number, y: number, W: number, H: number, unitPx: number) {
    const dpr = G.pr?.dpr ?? 1;
    this.detail = unitPx % 2 === 0 ? 2 : unitPx >= 3 ? 3 : 1;
    this.W = W; this.H = H; this.px = unitPx;
    this.css = { x, y, w: W * unitPx / dpr, h: H * unitPx / dpr };
    this.cam.left = 0; this.cam.right = W; this.cam.top = 0; this.cam.bottom = -H;
    this.cam.updateProjectionMatrix();
    const rw = Math.ceil(W * this.detail), rh = Math.ceil(H * this.detail);
    if (!this.rt || this.rt.width !== rw || this.rt.height !== rh) {
      this.rt?.dispose();
      const dt = new THREE.DepthTexture(rw, rh);
      dt.minFilter = dt.magFilter = THREE.NearestFilter;
      this.rt = new THREE.WebGLRenderTarget(rw, rh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: dt });
      this.post.mat.uniforms.uRes.value.set(rw, rh);
      this.post.mat.uniforms.tDepth.value = dt;
      this.post.mat.uniforms.uRange.value = this.cam.far - this.cam.near;
    }
  }
  detail = 2;
  private vpFull = new THREE.Vector4();

  render(r: THREE.WebGLRenderer) {
    if (!this.rt || this.fade <= 0.01) return;
    const dpr = G.pr?.dpr ?? 1;
    this.uTime.value = performance.now() / 1000;
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
    const vw = Math.round(this.W * this.px), vh = Math.round(this.H * this.px);
    const vx = Math.round(this.css.x * dpr), vy = Math.round(window.innerHeight * dpr - this.css.y * dpr - vh);
    r.getViewport(this.vpFull);
    r.setViewport(vx, vy, vw, vh);
    this.post.mat.uniforms.tSrc.value = this.rt.texture;
    this.post.mat.uniforms.uFade.value = this.fade;
    r.render(this.post.scene, this.post.cam);
    r.setViewport(this.vpFull);
    r.autoClear = prevAuto;
  }

  /** the object under a screen point (CSS px), or null */
  pick(cx: number, cy: number, targets: THREE.Object3D[]): THREE.Intersection | null {
    const c = this.css;
    if (cx < c.x || cy < c.y || cx > c.x + c.w || cy > c.y + c.h) return null;
    this.ndc.set(((cx - c.x) / c.w) * 2 - 1, -(((cy - c.y) / c.h) * 2 - 1));
    this.ray.setFromCamera(this.ndc, this.cam);
    const hits = this.ray.intersectObjects(targets, true);
    return hits[0] ?? null;
  }
  /** a screen point (CSS px) in stage units */
  toStage(cx: number, cy: number, out: THREE.Vector2): THREE.Vector2 {
    const c = this.css;
    return out.set((cx - c.x) / c.w * this.W, -((cy - c.y) / c.h) * this.H);
  }
  /** a stage point in CSS px */
  toScreen(x: number, y: number): { x: number; y: number } {
    const c = this.css;
    return { x: c.x + (x / this.W) * c.w, y: c.y + (-y / this.H) * c.h };
  }
}

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

const CLEAR_VERT = /* glsl */`
attribute vec3 aCol;
varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying vec3 vLoc;
void main() {
  vCol = aCol; vUv = uv; vLoc = position;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
/** see-through things: bag plastic, glass, fluids. Fresnel edges, banded light, a hard specular. */
const CLEAR_FRAG = /* glsl */`
uniform vec3 uKey; uniform float uLight; uniform vec3 uTint; uniform float uAlpha; uniform float uFres; uniform vec3 uMul;
uniform float uSpec; uniform float uSpark; uniform float uTime; uniform float uDeep;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying vec3 vLoc;
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 base = vCol * uMul;
  float a = uAlpha;
#ifdef USE_MAP
  vec4 t = texture2D(uMap, vUv);
  base = mix(base, t.rgb, t.a);
  a = max(a, t.a);
#endif
  // depth: fluids darken toward the bottom
  base *= 1.0 - uDeep * clamp(-vLoc.y * 0.02, 0.0, 0.5);
  float lam = clamp(dot(n, uKey), 0.0, 1.0);
  lam = floor(lam * 4.0 + 0.55) / 4.0;
  vec3 col = base * (0.38 + lam * 0.78) * uLight * uTint;
  float fr = 1.0 - abs(n.z);
  fr = fr * fr;
  a = clamp(a + fr * uFres, 0.0, 1.0);
  col = mix(col, vec3(0.92, 0.95, 0.9) * uLight, fr * uFres * 0.5);
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), 34.0);
  float s = step(0.55, sp) * uSpec;
  col = mix(col, vec3(1.0, 0.98, 0.9) * uLight, s * 0.85);
  a = max(a, s * 0.9);
  if (uSpark > 0.0) { float k = h2(floor(gl_FragCoord.xy) + floor(uTime * 12.0)); if (k < uSpark * 0.08) { col = k < uSpark * 0.04 ? vec3(0.55, 1.0, 0.62) : vec3(0.9, 1.0, 0.85); a = 1.0; } }
  gl_FragColor = vec4(col, a);
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
uniform sampler2D tSrc; uniform vec2 uRes; uniform float uFade;
varying vec2 vUv;
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
    float s = texture2D(tSrc, vUv + vec2(-px.x, px.y * 2.0)).a;
    if (s > 0.25 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) { float sa = 0.45 * uFade; gl_FragColor = vec4(0.0, 0.0, 0.0, sa); return; }
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 col = c.rgb;
  float d = bay(floor(gl_FragCoord.xy)) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 28.0 + 0.5 + d * 0.9) / 28.0;
  a *= uFade;
  gl_FragColor = vec4(col * a, a);
}`;

export interface ClearOpts { map?: THREE.Texture | null; alpha?: number; fres?: number; spec?: number; deep?: number; color?: number; side?: THREE.Side; depthWrite?: boolean }

/** a pixel canvas that becomes a texture (labels, gauge faces, the bag's print, cracks) */
export class PixTex {
  readonly pix: Pix;
  readonly tex: THREE.CanvasTexture;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  constructor(w: number, h: number) {
    this.pix = new Pix(w, h);
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
    this.ctx = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
  }
  commit() { this.ctx.putImageData(this.pix.img, 0, 0); this.tex.needsUpdate = true; }
}

export class Cubes {
  readonly mesh: THREE.InstancedMesh;
  private pc: THREE.InstancedBufferAttribute;
  n = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private s = new THREE.Vector3();
  constructor(readonly max: number, mat: THREE.ShaderMaterial) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
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
  /** low-res size and where it sits (CSS px, top-left) */
  W = 1; H = 1; px = 2; css = { x: 0, y: 0, w: 1, h: 1 };
  visible = false;
  fade = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor() {
    this.cam.position.set(0, 0, 500);
    this.cubeMat = new THREE.ShaderMaterial({ vertexShader: CUBE_VERT, fragmentShader: CUBE_FRAG, uniforms: { uKey: this.uKey, uLight: this.uLight, uTint: this.uTint } });
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { tSrc: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uFade: { value: 1 } },
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
  clear(o: ClearOpts = {}): THREE.ShaderMaterial {
    const c = new THREE.Color(o.color ?? 0xffffff);
    return new THREE.ShaderMaterial({
      vertexShader: CLEAR_VERT, fragmentShader: CLEAR_FRAG, transparent: true, depthWrite: o.depthWrite ?? false,
      side: o.side ?? THREE.DoubleSide, defines: o.map ? { USE_MAP: '' } : {},
      uniforms: {
        uKey: this.uKey, uLight: this.uLight, uTint: this.uTint, uTime: this.uTime, uMap: { value: o.map ?? null },
        uAlpha: { value: o.alpha ?? 0.3 }, uFres: { value: o.fres ?? 0.5 }, uSpec: { value: o.spec ?? 1 }, uMul: { value: new THREE.Vector3(c.r, c.g, c.b) },
        uSpark: { value: 0 }, uDeep: { value: o.deep ?? 0 },
      },
    });
  }

  /** place the stage: CSS rect (top-left, size) and pixel size (device px per low-res px) */
  layout(x: number, y: number, W: number, H: number, px: number) {
    const dpr = G.pr?.dpr ?? 1;
    this.W = W; this.H = H; this.px = px;
    this.css = { x, y, w: W * px / dpr, h: H * px / dpr };
    this.cam.left = 0; this.cam.right = W; this.cam.top = 0; this.cam.bottom = -H;
    this.cam.updateProjectionMatrix();
    if (!this.rt || this.rt.width !== W || this.rt.height !== H) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      this.post.mat.uniforms.uRes.value.set(W, H);
    }
  }

  render(r: THREE.WebGLRenderer) {
    if (!this.rt || this.fade <= 0.01) return;
    const dpr = G.pr?.dpr ?? 1;
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
    const vw = Math.round(this.W * this.px), vh = Math.round(this.H * this.px);
    const vx = Math.round(this.css.x * dpr), vy = Math.round(window.innerHeight * dpr - this.css.y * dpr - vh);
    const full = new THREE.Vector4(); r.getViewport(full);
    r.setViewport(vx, vy, vw, vh);
    this.post.mat.uniforms.tSrc.value = this.rt.texture;
    this.post.mat.uniforms.uFade.value = this.fade;
    r.render(this.post.scene, this.post.cam);
    r.setViewport(full);
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

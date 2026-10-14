import * as THREE from 'three';
import { U } from './materials';
import { clamp, damp, lerp } from '../core/math';

/** Per-zone colour grading and atmosphere */
export interface Grade {
  lift: [number, number, number];
  gain: [number, number, number];
  gamma: number;
  sat: number;
  tint: [number, number, number];
  vignette: number;
  levels: number;
  grain: number;
}

export const DEFAULT_GRADE: Grade = {
  lift: [0.0, 0.0, 0.0], gain: [1, 1, 1], gamma: 1, sat: 1, tint: [1, 1, 1], vignette: 0.35, levels: 56, grain: 0.012,
};

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform float uOutline;
uniform float uEdgeLight;
uniform vec3 uHighlight;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uGamma;
uniform float uSat;
uniform vec3 uTint;
uniform float uVignette;
uniform float uLevels;
uniform float uGrain;
uniform float uGlitch;
uniform float uPanic;
uniform float uHurt;
uniform float uDesat;
uniform float uWobble;
uniform float uBlink;
uniform float uCorruptFlash;
uniform float uDream;
varying vec2 vUv;

float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  int i = ip.y * 4 + ip.x;
  int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
  return (float(m[i]) + 0.5) / 16.0;
}
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lin(float d) { return uNear + d * (uFar - uNear); }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 px = 1.0 / uRes;
  vec2 uv = vUv;
  // --- mental state wobble / dream warp ---
  if (uWobble > 0.001) {
    uv.x += sin(uv.y * 18.0 + uTime * 1.3) * 0.004 * uWobble;
    uv.y += cos(uv.x * 14.0 + uTime * 1.1) * 0.003 * uWobble;
  }
  // --- glitch: tearing bands ---
  if (uGlitch > 0.001) {
    float band = floor(uv.y * uRes.y / 3.0);
    float t = floor(uTime * 12.0);
    float r = h12(vec2(band, t));
    if (r < uGlitch * 0.12) uv.x += (h12(vec2(t, band)) - 0.5) * 0.08 * uGlitch;
    float blk = h12(floor(uv * uRes / 8.0) + t);
    if (blk < uGlitch * 0.015) uv = floor(uv * uRes / 8.0) * 8.0 / uRes + vec2(h12(vec2(t)) * 0.02, 0.0);
  }
  uv = (floor(uv * uRes) + 0.5) / uRes;

  vec3 c = texture2D(tColor, uv).rgb;
  vec4 nA = texture2D(tNormal, uv);
  vec3 n = nA.xyz * 2.0 - 1.0;
  float d = lin(texture2D(tDepth, uv).r);

  vec2 offs[4] = vec2[4](vec2(0.0, px.y), vec2(0.0, -px.y), vec2(px.x, 0.0), vec2(-px.x, 0.0));
  float depthEdge = 0.0;
  float normalEdge = 0.0;
  float hlEdge = 0.0;
  bool isHl = abs(nA.a - 0.5) < 0.1;
  for (int i = 0; i < 4; i++) {
    vec2 o = uv + offs[i];
    float dn = lin(texture2D(tDepth, o).r);
    vec4 nb = texture2D(tNormal, o);
    float dd = dn - d;
    if (dd > 0.14 + d * 0.004) depthEdge = 1.0;
    vec3 nn = nb.xyz * 2.0 - 1.0;
    if (abs(dd) < 0.25) {
      float ne = clamp(dot(n - nn, vec3(0.55, 0.9, 0.45)), 0.0, 1.0);
      normalEdge += ne * step(-0.01, dd);
    }
    bool nbHl = abs(nb.a - 0.5) < 0.1;
    if (nbHl && !isHl) hlEdge = 1.0;
  }
  float outlineable = step(0.25, nA.a);
  normalEdge = clamp(normalEdge, 0.0, 1.0) * outlineable;
  if (depthEdge > 0.5 && outlineable > 0.5) c *= (1.0 - 0.55 * uOutline);
  else c *= 1.0 + normalEdge * uEdgeLight;
  if (isHl) c = c * 1.18 + uHighlight * 0.06;
  if (hlEdge > 0.5) c = mix(c, uHighlight, 0.85);

  // --- grading (in display space) ---
  c = toSRGB(c);
  c = max(c * uGain + uLift, 0.0);
  c = pow(c, vec3(1.0 / uGamma));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat * (1.0 - uDesat));
  c *= uTint;
  // dream haze: lifted pastel bloom
  if (uDream > 0.001) c = mix(c, c * 0.8 + vec3(0.18, 0.16, 0.22), uDream * 0.35);

  // --- vignette / panic / hurt ---
  vec2 q = vUv - 0.5;
  float vig = dot(q, q) * 2.0;
  c *= 1.0 - vig * uVignette;
  float beat = pow(0.5 + 0.5 * sin(uTime * (5.0 + uPanic * 5.0)), 6.0);
  c = mix(c, vec3(0.35, 0.0, 0.02), clamp(vig * uPanic * (0.5 + 0.5 * beat), 0.0, 0.7));
  c = mix(c, vec3(0.55, 0.0, 0.0), clamp(uHurt * (0.25 + vig), 0.0, 0.8));
  if (uCorruptFlash > 0.001) {
    float ch = mod(floor(vUv.x * uRes.x / 6.0) + floor(vUv.y * uRes.y / 6.0), 2.0);
    c = mix(c, mix(vec3(1.0, 0.0, 1.0), vec3(0.0), ch), uCorruptFlash * step(h12(floor(vUv * uRes / 6.0) + floor(uTime * 20.0)), 0.25));
  }
  // blink (exhaustion): eyelids close from top & bottom
  if (uBlink > 0.001) {
    float lid = abs(vUv.y - 0.5) * 2.0;
    c *= smoothstep(1.0 - uBlink * 1.1, 1.0 - uBlink * 1.1 + 0.15, 1.0 - lid);
  }
  // --- grain ---
  c += (h12(floor(vUv * uRes) + fract(uTime) * 91.0) - 0.5) * uGrain;
  // --- quantise with ordered dither (15-bit-ish PS1 palette) ---
  float b = bayer4(gl_FragCoord.xy);
  c = floor(c * uLevels + b) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}
`;

const BLIT_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uLowRes;
uniform float uScale;
uniform vec2 uOffset;
uniform float uMargin;
uniform vec2 uCanvas;
void main() {
  vec2 sp = gl_FragCoord.xy;
  vec2 lp = sp / uScale + vec2(uMargin) + uOffset;
  gl_FragColor = texture2D(tSrc, lp / uLowRes);
}
`;

const OVERLAY_BLIT_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uLowRes;
uniform float uScale;
uniform float uMargin;
void main() {
  vec2 lp = gl_FragCoord.xy / uScale + vec2(uMargin);
  vec4 c = texture2D(tSrc, lp / uLowRes);
  if (c.a < 0.01) discard;
  vec3 l = max(c.rgb, 0.0);
  vec3 s = mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l));
  gl_FragColor = vec4(s, c.a);
}
`;

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  /** overlay (held scanner etc.) has its own scene + perspective camera */
  readonly overlayScene = new THREE.Scene();
  readonly overlayCamera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  overlayEnabled = false;

  private rtScene!: THREE.WebGLRenderTarget;
  private rtPost!: THREE.WebGLRenderTarget;
  private rtOverlay!: THREE.WebGLRenderTarget;
  private postMat: THREE.ShaderMaterial;
  private blitMat: THREE.ShaderMaterial;
  private overlayBlitMat: THREE.ShaderMaterial;
  private fsScene = new THREE.Scene();
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fsQuad: THREE.Mesh;

  // camera rig
  target = new THREE.Vector3();
  yaw = Math.PI / 4;          // camera sits at +x,+z looking toward -x,-z (north is up-right)
  yawTarget = Math.PI / 4;
  pitch = THREE.MathUtils.degToRad(36);
  /** metres per low-res pixel */
  pxSize = 1 / 32;
  pxSizeTarget = 1 / 32;
  readonly margin = 2;
  scale = 2;
  lowW = 480; lowH = 270;
  private subOffset = new THREE.Vector2();
  shake = 0;
  grade: Grade = { ...DEFAULT_GRADE };
  gradeTarget: Grade = { ...DEFAULT_GRADE };
  fx = { glitch: 0, panic: 0, hurt: 0, desat: 0, wobble: 0, blink: 0, corruptFlash: 0, dream: 0, outline: 1, edgeLight: 0.32 };
  /** user setting: target internal height in px */
  targetLowH = 360;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 160);
    this.scene.background = new THREE.Color(0x000000);

    this.postMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 160 }, uTime: U.uTime,
        uOutline: { value: 1 }, uEdgeLight: { value: 0.32 }, uHighlight: { value: new THREE.Color(0xfff2b0) },
        uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uGamma: { value: 1 },
        uSat: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.35 }, uLevels: { value: 30 },
        uGrain: { value: 0.03 }, uGlitch: { value: 0 }, uPanic: { value: 0 }, uHurt: { value: 0 }, uDesat: { value: 0 },
        uWobble: { value: 0 }, uBlink: { value: 0 }, uCorruptFlash: { value: 0 }, uDream: { value: 0 },
      },
    });
    this.blitMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: BLIT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uLowRes: { value: new THREE.Vector2() }, uScale: { value: 2 }, uOffset: { value: new THREE.Vector2() }, uMargin: { value: 2 }, uCanvas: { value: new THREE.Vector2() } },
    });
    this.overlayBlitMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: OVERLAY_BLIT_FRAG, depthTest: false, depthWrite: false, transparent: true,
      uniforms: { tSrc: { value: null }, uLowRes: { value: new THREE.Vector2() }, uScale: { value: 2 }, uMargin: { value: 2 } },
    });
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    this.fsQuad.frustumCulled = false;
    this.fsScene.add(this.fsQuad);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const W = Math.floor(window.innerWidth * dpr), H = Math.floor(window.innerHeight * dpr);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    this.scale = Math.max(1, Math.round(H / this.targetLowH));
    this.lowW = Math.ceil(W / this.scale);
    this.lowH = Math.ceil(H / this.scale);
    const RW = this.lowW + this.margin * 2, RH = this.lowH + this.margin * 2;
    this.rtScene?.dispose(); this.rtPost?.dispose(); this.rtOverlay?.dispose();
    const depthTex = new THREE.DepthTexture(RW, RH);
    depthTex.type = THREE.FloatType;
    this.rtScene = new THREE.WebGLRenderTarget(RW, RH, {
      count: 2, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depthTex,
      type: THREE.HalfFloatType,
    });
    this.rtPost = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.rtOverlay = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, type: THREE.HalfFloatType });
    this.overlayCamera.aspect = RW / RH;
    this.overlayCamera.updateProjectionMatrix();
    U.uSnapRes.value.set(RW, RH);
  }

  get pixelsPerMetre() { return 1 / this.pxSize; }

  /** Camera basis vectors */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  updateCamera(dt: number) {
    this.yaw = lerp(this.yaw, this.yawTarget, 1 - Math.exp(-10 * dt));
    if (Math.abs(this.yaw - this.yawTarget) < 0.0005) this.yaw = this.yawTarget;
    this.pxSize = damp(this.pxSize, this.pxSizeTarget, 12, dt);
    const cam = this.camera;
    const dist = 60;
    const F = this.forward();
    // orientation
    cam.position.copy(this.target).addScaledVector(F, -dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
    const R = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const Up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    // pixel-perfect snap of the camera in its own image plane
    const ps = this.pxSize;
    const shakeX = (Math.random() - 0.5) * this.shake * 0.25, shakeY = (Math.random() - 0.5) * this.shake * 0.25;
    const tr = this.target.dot(R) + shakeX, tu = this.target.dot(Up) + shakeY;
    const sr = Math.round(tr / ps) * ps, su = Math.round(tu / ps) * ps;
    this.subOffset.set((tr - sr) / ps, (tu - su) / ps);
    const snapped = this.target.clone().addScaledVector(R, sr - tr + shakeX).addScaledVector(Up, su - tu + shakeY);
    cam.position.copy(snapped).addScaledVector(F, -dist);
    cam.updateMatrixWorld();
    const RW = this.lowW + this.margin * 2, RH = this.lowH + this.margin * 2;
    const hw = (RW * ps) / 2, hh = (RH * ps) / 2;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
    cam.near = 0.1; cam.far = 160;
    cam.updateProjectionMatrix();
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  private applyGrade(dt: number) {
    const g = this.grade, t = this.gradeTarget, k = 1 - Math.exp(-2 * dt);
    for (let i = 0; i < 3; i++) {
      g.lift[i] = lerp(g.lift[i], t.lift[i], k); g.gain[i] = lerp(g.gain[i], t.gain[i], k); g.tint[i] = lerp(g.tint[i], t.tint[i], k);
    }
    g.gamma = lerp(g.gamma, t.gamma, k); g.sat = lerp(g.sat, t.sat, k); g.vignette = lerp(g.vignette, t.vignette, k);
    g.levels = t.levels; g.grain = lerp(g.grain, t.grain, k);
    const u = this.postMat.uniforms;
    u.uLift.value.set(...g.lift); u.uGain.value.set(...g.gain); u.uGamma.value = g.gamma; u.uSat.value = g.sat;
    u.uTint.value.set(...g.tint); u.uVignette.value = g.vignette; u.uLevels.value = g.levels; u.uGrain.value = g.grain;
    u.uGlitch.value = this.fx.glitch; u.uPanic.value = this.fx.panic; u.uHurt.value = this.fx.hurt; u.uDesat.value = this.fx.desat;
    u.uWobble.value = this.fx.wobble; u.uBlink.value = this.fx.blink; u.uCorruptFlash.value = this.fx.corruptFlash; u.uDream.value = this.fx.dream;
    u.uOutline.value = this.fx.outline; u.uEdgeLight.value = this.fx.edgeLight;
  }

  /** Player view-space position used by the wall cutout */
  updatePlayerView(worldPos: THREE.Vector3) {
    U.uPlayerPos.value.copy(worldPos);
    U.uCamFwd.value.set(-Math.sin(this.yaw), -Math.cos(this.yaw)).normalize();
    const v = worldPos.clone().add(new THREE.Vector3(0, 1.0, 0)).applyMatrix4(this.camera.matrixWorldInverse);
    U.uPlayerView.value.copy(v);
  }

  render(dt: number) {
    const r = this.renderer;
    this.applyGrade(dt);
    // 1. scene into low-res MRT
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.scene, this.camera);
    // 2. post (outline, grade, dither) into rtPost
    const RW = this.lowW + this.margin * 2, RH = this.lowH + this.margin * 2;
    const pu = this.postMat.uniforms;
    pu.tColor.value = this.rtScene.textures[0];
    pu.tNormal.value = this.rtScene.textures[1];
    pu.tDepth.value = this.rtScene.depthTexture;
    pu.uRes.value.set(RW, RH);
    pu.uNear.value = this.camera.near; pu.uFar.value = this.camera.far;
    this.fsQuad.material = this.postMat;
    r.setRenderTarget(this.rtPost);
    r.render(this.fsScene, this.fsCam);
    // 3. overlay scene (held devices) into its own low-res target
    if (this.overlayEnabled) {
      r.setRenderTarget(this.rtOverlay);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(this.overlayScene, this.overlayCamera);
    }
    // 4. upscale to screen with sub-pixel camera offset
    r.setRenderTarget(null);
    const bu = this.blitMat.uniforms;
    bu.tSrc.value = this.rtPost.texture;
    bu.uLowRes.value.set(RW, RH);
    bu.uScale.value = this.scale;
    bu.uMargin.value = this.margin;
    bu.uOffset.value.copy(this.subOffset);
    this.fsQuad.material = this.blitMat;
    r.render(this.fsScene, this.fsCam);
    if (this.overlayEnabled) {
      const ou = this.overlayBlitMat.uniforms;
      ou.tSrc.value = this.rtOverlay.texture;
      ou.uLowRes.value.set(RW, RH);
      ou.uScale.value = this.scale;
      ou.uMargin.value = this.margin;
      this.fsQuad.material = this.overlayBlitMat;
      r.render(this.fsScene, this.fsCam);
    }
  }

  /** Convert CSS pixel coords to a world ray, intersect with horizontal plane y */
  screenToWorld(cssX: number, cssY: number, planeY = 0): THREE.Vector3 | null {
    const ray = this.screenRay(cssX, cssY);
    if (Math.abs(ray.direction.y) < 1e-5) return null;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    return ray.origin.clone().addScaledVector(ray.direction, t);
  }

  screenRay(cssX: number, cssY: number): THREE.Ray {
    // low-res pixel coords (account for scale, margin and sub-pixel offset)
    const sx = cssX * this.dpr, sy = (window.innerHeight - cssY) * this.dpr;
    const RW = this.lowW + this.margin * 2, RH = this.lowH + this.margin * 2;
    const lx = sx / this.scale + this.margin + this.subOffset.x;
    const ly = sy / this.scale + this.margin + this.subOffset.y;
    const ndc = new THREE.Vector3((lx / RW) * 2 - 1, (ly / RH) * 2 - 1, -1);
    const origin = ndc.clone().unproject(this.camera);
    const dir = this.forward().normalize();
    return new THREE.Ray(origin, dir);
  }

  worldToScreen(p: THREE.Vector3): { x: number; y: number; z: number } {
    const v = p.clone().project(this.camera);
    const RW = this.lowW + this.margin * 2, RH = this.lowH + this.margin * 2;
    const lx = (v.x + 1) / 2 * RW, ly = (v.y + 1) / 2 * RH;
    const sx = (lx - this.margin - this.subOffset.x) * this.scale, sy = (ly - this.margin - this.subOffset.y) * this.scale;
    return { x: sx / this.dpr, y: window.innerHeight - sy / this.dpr, z: v.z };
  }

  /** CSS px per world metre at current zoom (for sizing DOM bubbles) */
  cssPerMetre() { return (this.scale / this.pxSize) / this.dpr; }

  /** zoom levels expressed as low-res pixels per metre */
  static readonly ZOOMS = [14, 18, 23, 28, 32, 40, 48];
  setZoomLevel(level: number) {
    const z = PixelRenderer.ZOOMS;
    this.pxSizeTarget = 1 / z[clamp(Math.round(level), 0, z.length - 1)];
  }
}

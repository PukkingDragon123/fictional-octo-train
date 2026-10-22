import * as THREE from 'three';
import { U } from './materials';
import { clamp, damp, lerp } from '../core/math';
import { PostFX, POST_FRAG, FS_VERT, CAMU, SPOTU } from './postfx';
import { QUALITY, QualityLevel, QualitySetting, ZoneFx, zoneFx, detectQuality } from './fxconfig';

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

// First-person close-ups go through the same film as the world: the zone's grade, the
// light where the survivor stands, dark-art contrast, grain, a pixel silhouette outline and
// the ordered-dither quantise, so hands and props sit in the same picture as the room.
const OVERLAY_BLIT_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uLowRes;
uniform float uScale;
uniform float uMargin;
uniform vec3 uLift, uGain, uTint;
uniform float uGamma, uSat, uLevels, uGrain, uTime, uLight, uVignette, uDark;
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  int i = ip.y * 4 + ip.x;
  int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main() {
  vec2 lp = gl_FragCoord.xy / uScale + vec2(uMargin);
  vec2 px = floor(lp);
  vec2 uv = (px + 0.5) / uLowRes;
  vec4 c = texture2D(tSrc, uv);
  if (c.a < 0.01) {
    // one dark pixel of outline round everything held up to the camera, like the world's
    vec2 o = 1.0 / uLowRes;
    float n = texture2D(tSrc, uv + vec2(o.x, 0.0)).a + texture2D(tSrc, uv - vec2(o.x, 0.0)).a
            + texture2D(tSrc, uv + vec2(0.0, o.y)).a + texture2D(tSrc, uv - vec2(0.0, o.y)).a;
    if (n < 0.02 || uDark < 0.01) discard;
    gl_FragColor = vec4(vec3(0.035, 0.03, 0.024), 0.85);
    return;
  }
  vec3 l = max(c.rgb, 0.0);
  vec3 s = mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l));
  // the room's light dims what you hold up, but glowing things (screens, lamps, embers) keep their glow
  float glow = smoothstep(0.55, 0.95, max(max(s.r, s.g), s.b));
  s *= mix(uLight, 1.0, glow);
  s = max(s * uGain + uLift, 0.0);
  s = pow(s, vec3(1.0 / uGamma));
  float y = dot(s, vec3(0.299, 0.587, 0.114));
  s = mix(vec3(y), s, uSat);
  s *= uTint;
  // dark art: an S-curve that crushes the shadows, colder shadows, less candy saturation
  vec3 sc = clamp(s, 0.0, 1.0);
  s = mix(s, sc * sc * (3.0 - 2.0 * sc), uDark * 0.4);
  s = mix(s, s * vec3(0.9, 0.95, 1.06), uDark * (1.0 - clamp(y * 2.2, 0.0, 1.0)) * 0.5);
  s = mix(vec3(dot(s, vec3(0.299, 0.587, 0.114))), s, 1.0 - uDark * 0.18);
  vec2 q = uv - 0.5;
  s *= 1.0 - dot(q, q) * 2.0 * uVignette;
  float gl2 = dot(s, vec3(0.299, 0.587, 0.114));
  s += (h12(px + floor(uTime * 24.0) * 7.31) - 0.5) * uGrain * (0.55 + 1.8 * gl2 * (1.0 - gl2));
  s = floor(s * uLevels + bayer4(px)) / uLevels;
  gl_FragColor = vec4(s, c.a);
}
`;

const NUM_KEYS: (keyof ZoneFx)[] = ['blob', 'rim', 'hazeDens', 'hazeFall', 'volTop', 'gridMul', 'spotMul', 'sunShafts', 'mistDens', 'mistFall', 'mistLit', 'mistMax', 'bloom', 'bloomTh', 'ao', 'reflect', 'sheen', 'caustics', 'sick', 'motes', 'dirt'];
const TAN36 = Math.tan(THREE.MathUtils.degToRad(36));

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  /** overlay (held scanner etc.) has its own scene + perspective camera */
  readonly overlayScene = new THREE.Scene();
  readonly overlayCamera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  overlayEnabled = false;
  /** how lit the survivor's spot is (the game sets it each frame): first-person close-ups darken in dark rooms */
  overlayLight = 1;
  /** 0 = clean overlay (menus), 1 = the full dark film like the world */
  overlayFilm = 1;
  /** photo mode hides the held devices without touching overlayEnabled */
  hideOverlay = false;

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
  pitchTarget = THREE.MathUtils.degToRad(36);
  /** metres per low-res pixel (effective, including any camera zoom multipliers) */
  pxSize = 1 / 32;
  pxSizeTarget = 1 / 32;
  /** extra world-space offset of the view (shake, recoil, sway) applied before pixel snapping */
  camOffset = new THREE.Vector3();
  /** set by the camera controller (src/game/camera.ts): it animates yaw / pitch / zoom itself */
  externalRig = false;
  readonly margin = 2;
  scale = 2;
  lowW = 480; lowH = 270;
  private subOffset = new THREE.Vector2();
  /** legacy trauma (0..2) other systems bump; the camera controller turns it into smooth shake and decays it */
  shake = 0;
  grade: Grade = { ...DEFAULT_GRADE };
  gradeTarget: Grade = { ...DEFAULT_GRADE };
  fx = { glitch: 0, panic: 0, hurt: 0, desat: 0, wobble: 0, blink: 0, corruptFlash: 0, dream: 0, outline: 1, edgeLight: 0.32 };
  /** user setting: target internal height in px */
  targetLowH = 360;
  dpr = 1;

  // ---- realism layer
  readonly postfx = new PostFX();
  /** quality setting ('auto' picks by device and steps down when frames run long) and the level in use */
  qualitySetting: QualitySetting = 'auto';
  quality: QualityLevel = 'high';
  /** photo mode: force a level regardless of the setting */
  qualityOverride: QualityLevel | null = null;
  zoneFx: ZoneFx = zoneFx('lobby');
  zoneFxTarget: ZoneFx = zoneFx('lobby');
  /** film grain / lens dirt multiplier (Options grain slider), and photo-mode 'clean' switch */
  film = 1;
  clean = false;
  /** lights the volumetric pass follows (set by the game) */
  spot: THREE.SpotLight | null = null;
  sun: THREE.DirectionalLight | null = null;
  /** no tube flutter (reduce flashing) */
  calm = false;
  /** rolling frame time (ms) seen by render(), for the auto quality and the perf overlay */
  frameMs = 16;
  private lastFrameAt = 0;
  private slowFor = 0;
  private builtDefines = '';
  /** a real compare-mode depth texture for the shadow samplers when no shadow map is live (an unbound one is a GL error) */
  private noShadow: THREE.WebGLRenderTarget;

  private tmpR = new THREE.Vector3();
  private tmpU = new THREE.Vector3();
  private tmpF = new THREE.Vector3();
  private tmpP = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 160);
    this.scene.background = new THREE.Color(0x000000);
    this.quality = detectQuality();
    this.postfx.q = QUALITY[this.quality];
    this.postfx.zone = this.zoneFx;

    this.postMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      defines: this.postfx.compositeDefines(),
      uniforms: {
        ...CAMU, ...SPOTU,
        uLightTex: U.uLightTex, uLightInfo: U.uLightInfo, uGridScale: U.uGridScale, uVisTex: U.uVisTex, uVisInfo: U.uVisInfo, uVisOn: U.uVisOn,
        uPlayerPos: U.uPlayerPos, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
        tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        tAO: { value: null }, tVol: { value: null }, tBloom: { value: null }, tBloomWide: { value: null }, tDirt: { value: this.postfx.dirt },
        uRes: { value: new THREE.Vector2() }, uTime: U.uTime,
        uOutline: { value: 1 }, uEdgeLight: { value: 0.32 }, uHighlight: { value: new THREE.Color(0xfff2b0) },
        uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uGamma: { value: 1 },
        uSat: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.35 }, uLevels: { value: 30 },
        uGrain: { value: 0.03 }, uGlitch: { value: 0 }, uPanic: { value: 0 }, uHurt: { value: 0 }, uDesat: { value: 0 },
        uWobble: { value: 0 }, uBlink: { value: 0 }, uCorruptFlash: { value: 0 }, uDream: { value: 0 },
        uAOStr: { value: 1 }, uBloomStr: { value: 0.5 }, uDirtStr: { value: 0.5 }, uReflect: { value: 0.5 },
        uMistCol: { value: new THREE.Vector3(0.5, 0.5, 0.5) }, uMistDens: { value: 0 }, uMistFall: { value: 1 }, uMistLit: { value: 0.5 }, uMistMax: { value: 0.3 },
        uMotes: { value: 0 }, uSick: { value: 0 }, uFlicker: { value: 1 }, uFilm: { value: 1 }, uVoid: { value: new THREE.Color(0) },
        uBlobs: { value: this.postfx.blobs }, uBlobH: { value: this.postfx.blobH }, uBlobN: { value: 0 }, uRim: { value: 0 }, uRimTint: { value: new THREE.Vector3() },
        uSunDir2: { value: new THREE.Vector2(1, 0) }, uSunGlow: { value: 0 }, uSunDir3: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.blitMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: BLIT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uLowRes: { value: new THREE.Vector2() }, uScale: { value: 2 }, uOffset: { value: new THREE.Vector2() }, uMargin: { value: 2 }, uCanvas: { value: new THREE.Vector2() } },
    });
    this.overlayBlitMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: OVERLAY_BLIT_FRAG, depthTest: false, depthWrite: false, transparent: true,
      uniforms: {
        tSrc: { value: null }, uLowRes: { value: new THREE.Vector2() }, uScale: { value: 2 }, uMargin: { value: 2 },
        uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uTint: { value: new THREE.Vector3(1, 1, 1) },
        uGamma: { value: 1 }, uSat: { value: 1 }, uLevels: { value: 30 }, uGrain: { value: 0.03 }, uTime: { value: 0 },
        uLight: { value: 1 }, uVignette: { value: 0.35 }, uDark: { value: 1 },
      },
    });
    const nsd = new THREE.DepthTexture(1, 1);
    nsd.compareFunction = THREE.LessEqualCompare;
    this.noShadow = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, depthTexture: nsd });
    this.renderer.initRenderTarget(this.noShadow);
    SPOTU.tSpotShadow.value = nsd; SPOTU.tSunShadow.value = nsd;
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
    this.postfx.setSize(RW, RH);
  }

  get pixelsPerMetre() { return 1 / this.pxSize; }

  // ---------------------------------------------------------------- quality & atmosphere
  /** apply the graphics settings that live in Options (quality preset, film grain) */
  applySettings(s: { quality?: QualitySetting; grain?: number }) {
    if (s.quality) this.qualitySetting = s.quality;
    if (typeof s.grain === 'number') this.film = clamp(s.grain, 0, 2);
    const lvl = this.qualitySetting === 'auto' ? detectQuality() : this.qualitySetting;
    this.setQuality(lvl);
  }

  setQuality(level: QualityLevel) {
    this.quality = level;
    this.slowFor = 0;
    this.rebuildFx();
  }

  private rebuildFx() {
    const lvl = this.qualityOverride ?? this.quality;
    const q = QUALITY[lvl];
    const key = lvl + '|' + this.postfx.bypass + '|' + this.postfx.debugView;
    if (key === this.builtDefines) return;
    this.builtDefines = key;
    this.postfx.setQuality(q);
    this.postMat.defines = this.postfx.compositeDefines();
    this.postMat.needsUpdate = true;
  }

  /** photo mode helpers: force a level, or bypass all realism passes */
  setFxOverride(level: QualityLevel | null, bypass = false) {
    this.qualityOverride = level;
    this.postfx.bypass = bypass;
    this.rebuildFx();
  }

  /** atmosphere for a zone grade key (see src/gfx/fxconfig.ts) */
  setZoneFx(grade: string, instant = false) {
    this.zoneFxTarget = zoneFx(grade);
    if (instant) this.zoneFx = zoneFx(grade);
    this.postfx.zone = this.zoneFx;
  }

  /** Camera basis vectors */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  updateCamera(dt: number) {
    if (!this.externalRig) {
      this.yaw = lerp(this.yaw, this.yawTarget, 1 - Math.exp(-10 * dt));
      if (Math.abs(this.yaw - this.yawTarget) < 0.0005) this.yaw = this.yawTarget;
      this.pitch = damp(this.pitch, this.pitchTarget, 10, dt);
      this.pxSize = damp(this.pxSize, this.pxSizeTarget, 12, dt);
    }
    const cam = this.camera;
    const dist = 60;
    const F = this.forward(this.tmpF);
    const focus = this.tmpP.copy(this.target).add(this.camOffset);
    // orientation
    cam.position.copy(focus).addScaledVector(F, -dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(focus);
    cam.updateMatrixWorld();
    const R = this.tmpR.setFromMatrixColumn(cam.matrixWorld, 0);
    const Up = this.tmpU.setFromMatrixColumn(cam.matrixWorld, 1);
    // pixel-perfect snap of the camera in its own image plane
    const ps = this.pxSize;
    const tr = focus.dot(R), tu = focus.dot(Up);
    const sr = Math.round(tr / ps) * ps, su = Math.round(tu / ps) * ps;
    this.subOffset.set((tr - sr) / ps, (tu - su) / ps);
    focus.addScaledVector(R, sr - tr).addScaledVector(Up, su - tu);
    cam.position.copy(focus).addScaledVector(F, -dist);
    cam.updateMatrixWorld();
    const RW = this.lowW + this.margin * 2, RH = this.lowH + this.margin * 2;
    const hw = (RW * ps) / 2, hh = (RH * ps) / 2;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
    cam.near = 0.1; cam.far = 160;
    cam.updateProjectionMatrix();
    // shared camera basis for the screen-space passes
    CAMU.uCamPos.value.copy(cam.position);
    CAMU.uCamR.value.copy(R); CAMU.uCamU.value.copy(Up); CAMU.uCamF.value.copy(F);
    CAMU.uHalf.value.set(hw, hh);
    CAMU.uNear.value = cam.near; CAMU.uFar.value = cam.far;
    CAMU.uPxM.value = ps;
    CAMU.uSinPitch.value = Math.sin(this.pitch);
    // lower angles hide more behind walls and props: widen the cutaway; the wet-floor sheen slides with the angle
    const tp = Math.tan(clamp(this.pitch, 0.2, 1.4));
    const cutK = clamp(TAN36 / tp, 0.6, 2.2);
    U.uCutScale.value = Math.max(1, cutK);
    U.uCutWide.value = Math.max(4.2, 5.5 * cutK);
    U.uSpecOff.value = 2.6 / tp;
  }

  private applyGrade(dt: number) {
    const g = this.grade, t = this.gradeTarget, k = 1 - Math.exp(-2 * dt);
    for (let i = 0; i < 3; i++) {
      g.lift[i] = lerp(g.lift[i], t.lift[i], k); g.gain[i] = lerp(g.gain[i], t.gain[i], k); g.tint[i] = lerp(g.tint[i], t.tint[i], k);
    }
    g.gamma = lerp(g.gamma, t.gamma, k); g.sat = lerp(g.sat, t.sat, k); g.vignette = lerp(g.vignette, t.vignette, k);
    g.levels = t.levels; g.grain = lerp(g.grain, t.grain, k);
    // atmosphere follows the zone the same way
    const z = this.zoneFx as any, zt = this.zoneFxTarget as any;
    for (const key of NUM_KEYS) z[key] = lerp(z[key], zt[key], k);
    for (let i = 0; i < 3; i++) { z.haze[i] = lerp(z.haze[i], zt.haze[i], k); z.mist[i] = lerp(z.mist[i], zt.mist[i], k); z.rimTint[i] = lerp(z.rimTint[i], zt.rimTint[i], k); }
    const u = this.postMat.uniforms;
    u.uLift.value.set(...g.lift); u.uGain.value.set(...g.gain); u.uGamma.value = g.gamma; u.uSat.value = g.sat;
    u.uTint.value.set(...g.tint); u.uLevels.value = g.levels;
    const clean = this.clean;
    u.uVignette.value = clean ? g.vignette * 0.5 : g.vignette;
    u.uGrain.value = (g.grain + 0.012) * (clean ? 0 : 1);
    u.uFilm.value = this.film;
    u.uGlitch.value = this.fx.glitch; u.uPanic.value = clean ? 0 : this.fx.panic; u.uHurt.value = clean ? 0 : this.fx.hurt; u.uDesat.value = this.fx.desat;
    u.uWobble.value = this.fx.wobble; u.uBlink.value = clean ? 0 : this.fx.blink; u.uCorruptFlash.value = this.fx.corruptFlash; u.uDream.value = this.fx.dream;
    u.uOutline.value = this.fx.outline; u.uEdgeLight.value = this.fx.edgeLight;
    // zone atmosphere
    u.uAOStr.value = 1;
    u.uBloomStr.value = z.bloom * 0.45;
    u.uDirtStr.value = clean ? 0 : z.dirt * 0.35 * this.film;
    u.uReflect.value = z.reflect;
    u.uMistCol.value.set(z.mist[0], z.mist[1], z.mist[2]);
    u.uMistDens.value = z.mistDens; u.uMistFall.value = Math.max(0.05, z.mistFall); u.uMistLit.value = z.mistLit; u.uMistMax.value = z.mistMax;
    u.uMotes.value = z.motes;
    u.uRim.value = z.rim; u.uRimTint.value.set(z.rimTint[0], z.rimTint[1], z.rimTint[2]);
    u.uBlobN.value = Math.min(16, this.postfx.blobN);
    u.uSick.value = z.sick;
    u.uFlicker.value = this.calm ? 0 : 1;
    U.uCaustics.value = z.caustics;
    U.uSheen.value = z.sheen;
  }

  /** flashlight cone + sun shafts for the volumetric pass and motes (after the scene pass: shadow matrices are fresh) */
  private updateLightUniforms() {
    const s = this.spot, S = SPOTU;
    if (s && s.visible && s.intensity > 0.01) {
      S.uSpotOn.value = 1;
      S.uSpotPos.value.setFromMatrixPosition(s.matrixWorld);
      S.uSpotDir.value.setFromMatrixPosition(s.target.matrixWorld).sub(S.uSpotPos.value).normalize();
      const outer = Math.cos(s.angle), inner = Math.cos(s.angle * (1 - s.penumbra));
      S.uSpotCos.value.set(outer, Math.max(inner, outer + 0.01));
      S.uSpotRange.value = s.distance || 18;
      S.uSpotCol.value.copy(s.color).multiplyScalar(Math.min(1.6, s.intensity / 26));
      const map = s.castShadow ? (s.shadow.map as any)?.depthTexture as THREE.Texture | undefined : undefined;
      S.tSpotShadow.value = map ?? this.noShadow.depthTexture;
      S.uSpotShadowOn.value = map ? 1 : 0;
      if (map) S.uSpotMat.value.copy(s.shadow.matrix);
    } else S.uSpotOn.value = 0;
    const sun = this.sun;
    if (sun && sun.intensity > 0.01 && sun.castShadow) {
      const map = (sun.shadow.map as any)?.depthTexture as THREE.Texture | undefined;
      S.uSunOn.value = map ? 1 : 0;
      S.tSunShadow.value = map ?? this.noShadow.depthTexture;
      if (map) S.uSunMat.value.copy(sun.shadow.matrix);
      S.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(2, sun.intensity));
      // where the sun sits in screen space (warm glow on that side), stronger when it is low
      const d = this.tmpP.copy(sun.position).sub(sun.target.position).normalize();
      const sx = d.dot(CAMU.uCamR.value), sy = d.dot(CAMU.uCamU.value), sl = Math.hypot(sx, sy) || 1;
      const pu = this.postMat.uniforms;
      pu.uSunDir2.value.set(sx / sl, sy / sl);
      pu.uSunDir3.value.copy(d);
      pu.uSunGlow.value = this.zoneFx.sunShafts * (1.2 - Math.min(1, Math.max(0, d.y)) * 0.8);
    } else { S.uSunOn.value = 0; this.postMat.uniforms.uSunGlow.value = 0; }
  }

  /** Player view-space position used by the wall cutout */
  updatePlayerView(worldPos: THREE.Vector3) {
    U.uPlayerPos.value.copy(worldPos);
    U.uCamFwd.value.set(-Math.sin(this.yaw), -Math.cos(this.yaw)).normalize();
    const v = this.tmpP.copy(worldPos).add(this.tmpR.set(0, 1.0, 0)).applyMatrix4(this.camera.matrixWorldInverse);
    U.uPlayerView.value.copy(v);
    CAMU.uFloorY.value = worldPos.y;
  }

  private pass = (m: THREE.ShaderMaterial, rt: THREE.WebGLRenderTarget) => {
    this.fsQuad.material = m;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.fsScene, this.fsCam);
  };

  /** rolling frame time; 'auto' quality steps down after several seconds of slow frames */
  private trackFrame() {
    const now = performance.now();
    const ms = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (ms <= 0 || ms > 250) return;
    this.frameMs = this.frameMs * 0.95 + ms * 0.05;
    if (this.qualitySetting !== 'auto' || this.qualityOverride || this.quality === 'low') { this.slowFor = 0; return; }
    if (this.frameMs > 27) this.slowFor += ms / 1000; else this.slowFor = Math.max(0, this.slowFor - ms / 2000);
    if (this.slowFor > 6) this.setQuality(this.quality === 'high' ? 'medium' : 'low');
  }

  render(dt: number) {
    const r = this.renderer;
    this.trackFrame();
    this.rebuildFx();
    this.applyGrade(dt);
    // 1. scene into low-res MRT
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.scene, this.camera);
    this.updateLightUniforms();
    // 2. realism passes (AO, bloom, volumetrics) at low / half res
    const fxo = this.postfx.run(this.pass, { color: this.rtScene.textures[0], normal: this.rtScene.textures[1], depth: this.rtScene.depthTexture! }, this.zoneFx);
    // 3. composite (reflections, outline, haze, mist, bloom, grade, dither) into rtPost
    const RW = this.lowW + this.margin * 2, RH = this.lowH + this.margin * 2;
    const pu = this.postMat.uniforms;
    pu.tColor.value = this.rtScene.textures[0];
    pu.tNormal.value = this.rtScene.textures[1];
    pu.tDepth.value = this.rtScene.depthTexture;
    pu.tAO.value = fxo.ao; pu.tVol.value = fxo.vol; pu.tBloom.value = fxo.bloom; pu.tBloomWide.value = fxo.wide;
    pu.uRes.value.set(RW, RH);
    this.pass(this.postMat, this.rtPost);
    // 4. overlay scene (held devices) into its own low-res target
    const overlay = this.overlayEnabled && !this.hideOverlay;
    if (overlay) {
      r.setRenderTarget(this.rtOverlay);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(this.overlayScene, this.overlayCamera);
    }
    // 5. upscale to screen with sub-pixel camera offset
    r.setRenderTarget(null);
    const bu = this.blitMat.uniforms;
    bu.tSrc.value = this.rtPost.texture;
    bu.uLowRes.value.set(RW, RH);
    bu.uScale.value = this.scale;
    bu.uMargin.value = this.margin;
    bu.uOffset.value.copy(this.subOffset);
    this.fsQuad.material = this.blitMat;
    r.render(this.fsScene, this.fsCam);
    if (overlay) {
      const ou = this.overlayBlitMat.uniforms;
      ou.tSrc.value = this.rtOverlay.texture;
      ou.uLowRes.value.set(RW, RH);
      ou.uScale.value = this.scale;
      ou.uMargin.value = this.margin;
      // share the world's grade and film so the close-up sits in the same picture
      const pu2 = this.postMat.uniforms;
      ou.uLift.value.copy(pu2.uLift.value); ou.uGain.value.copy(pu2.uGain.value); ou.uTint.value.copy(pu2.uTint.value);
      ou.uGamma.value = pu2.uGamma.value; ou.uSat.value = pu2.uSat.value; ou.uLevels.value = pu2.uLevels.value;
      ou.uGrain.value = pu2.uGrain.value; ou.uVignette.value = pu2.uVignette.value * 0.8;
      ou.uTime.value = performance.now() / 1000;
      ou.uLight.value = this.overlayLight; ou.uDark.value = this.overlayFilm;
      this.fsQuad.material = this.overlayBlitMat;
      r.render(this.fsScene, this.fsCam);
    }
    // 6. small screen-space layers drawn with this same context (the body HUD): no second WebGL context
    for (const f of this.afterRender) f(r);
  }
  /** called at the end of every render with the renderer, default framebuffer bound */
  readonly afterRender: ((r: THREE.WebGLRenderer) => void)[] = [];

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

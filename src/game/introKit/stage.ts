// The intake's own picture. The first-person stage (src/game/intro.ts) is a
// room the camera is inside, so the renderer's overlay pass (which outlines
// held props against the world behind them) cannot draw silhouettes inside
// it. So the stage is drawn here instead, in the same low-res pixel grid and
// integer upscale as the world, after the renderer's own frame:
//   1. the stage scene into a low-res MRT target (colour + the world
//      materials' gNormal + depth), shadows from its own lights;
//   2. prep (low res, linear light): a black one-pixel outline where depth
//      steps, a lit lip on convex creases, the beat's exposure and flash;
//   3. the cinematic layer (this is a cutscene: the crisp-only rule is lifted
//      here and nowhere else): bloom off everything bright (a soft-knee bright
//      pass, three blurred levels: tight, wide, very wide), anamorphic streaks
//      off the hottest lights, light shafts (a radial blur of the bright pass
//      toward the key light on screen), an analytic flare with ghosts off the
//      beacon, depth of field (the scene blurred at half and quarter res, mixed
//      by each pixel's circle of confusion round a focus distance the script
//      racks), camera motion blur along the frame's motion vector and a zoom
//      blur on impacts, chromatic fringing on the heaviest hits;
//   4. a composite straight to the screen: the sharp pixels (one low-res texel
//      each, nearest) with the soft layers sampled smoothly over them, a split
//      tone grade, hurt (the edges going red), the colour draining, vignette,
//      a little grain. When the cutscene ends the pass goes away with it.
import * as THREE from 'three';
import type { PixelRenderer } from '../../gfx/renderer';

/** a grade: lift / gamma / gain per channel, contrast (S-curve), saturation, split-tone tints, exposure */
export interface Look {
  lift: [number, number, number]; gamma: number; gain: [number, number, number];
  contrast: number; sat: number; shadow: [number, number, number]; high: [number, number, number];
  exposure: number; vignette: number;
}
export const LOOKS: Record<string, Look> = {
  // cold fluorescent corridor, amber spill from the desks
  wing: { lift: [0.006, 0.012, 0.02], gamma: 1.0, gain: [1.0, 1.02, 1.05], contrast: 0.5, sat: 0.92, shadow: [0.74, 0.94, 1.16], high: [1.1, 1.0, 0.86], exposure: 1.05, vignette: 0.65 },
  // the tiled room: harsh, green-white, crushed
  ante: { lift: [0.004, 0.008, 0.006], gamma: 0.94, gain: [1.04, 1.04, 0.96], contrast: 0.62, sat: 0.84, shadow: [0.8, 1.0, 1.04], high: [1.08, 1.02, 0.88], exposure: 1.0, vignette: 0.8 },
  // sodium amber against red and cyan
  press: { lift: [0.01, 0.005, 0.008], gamma: 0.98, gain: [1.04, 0.98, 0.9], contrast: 0.6, sat: 0.98, shadow: [0.74, 0.9, 1.18], high: [1.12, 0.98, 0.82], exposure: 1.05, vignette: 0.75 },
  // the portal: cold cyan, deep blacks
  portal: { lift: [0.003, 0.008, 0.012], gamma: 0.96, gain: [0.96, 1.0, 1.06], contrast: 0.64, sat: 0.92, shadow: [0.76, 0.96, 1.14], high: [1.0, 1.02, 1.04], exposure: 1.05, vignette: 0.8 },
  // the Lobby end (unused on the stage, for completeness)
  neutral: { lift: [0, 0, 0], gamma: 1, gain: [1, 1, 1], contrast: 0.2, sat: 1, shadow: [1, 1, 1], high: [1, 1, 1], exposure: 1, vignette: 0.4 },
};
const copyLook = (o: Look, s: Look) => { o.lift = [...s.lift]; o.gain = [...s.gain]; o.shadow = [...s.shadow]; o.high = [...s.high]; o.gamma = s.gamma; o.contrast = s.contrast; o.sat = s.sat; o.exposure = s.exposure; o.vignette = s.vignette; return o; };

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const COMMON = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uNear, uFar;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
`;

// ---- 2. prep: outlines, creases, exposure, flash (low res, linear light)
const PREP = COMMON + /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform vec3 uFlashCol;
uniform float uExposure, uFlash, uOutline;
void main() {
  vec2 uv = vUv;
  vec2 o = 1.0 / uRes;
  vec3 c = texture2D(tColor, uv).rgb;
  vec4 nA = texture2D(tNormal, uv);
  float flag = mod(nA.a, 2.0);
  vec3 n = nA.xyz * 2.0 - 1.0;
  float dr = texture2D(tDepth, uv).r;
  float d = lin(dr);
  float edge = 0.0, crease = 0.0;
  vec2 offs[4] = vec2[4](vec2(0.0, o.y), vec2(0.0, -o.y), vec2(o.x, 0.0), vec2(-o.x, 0.0));
  for (int i = 0; i < 4; i++) {
    vec2 q = uv + offs[i];
    float dn = lin(texture2D(tDepth, q).r);
    float dd = dn - d;
    if (dd > 0.045 + d * 0.03) edge = 1.0;
    else if (abs(dd) < 0.15 + d * 0.02) {
      vec3 nn = texture2D(tNormal, q).xyz * 2.0 - 1.0;
      crease += clamp(dot(n - nn, vec3(0.5, 0.9, 0.4)), 0.0, 1.0) * step(-0.005, dd);
    }
  }
  if (dr < 0.99999 && flag > 0.25) {
    if (edge > 0.5) c = mix(c, vec3(0.004, 0.0035, 0.003), uOutline);
    else c *= 1.0 + min(crease, 1.0) * 0.28;
  }
  c = max(c, 0.0) * uExposure;
  gl_FragColor = vec4(c, 1.0);
}
`;
// ---- bright pass (soft knee), 2x2 average while halving
const BRIGHT = COMMON + /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThr, uKnee;
void main() {
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25;
  float br = max(max(c.r, c.g), c.b);
  float s = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee);
  s = s * s / (4.0 * uKnee + 1e-4);
  float w = max(s, br - uThr) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(24.0)), 1.0);
}
`;
// ---- 2x2 box down
const DOWN = COMMON + /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;
void main() {
  gl_FragColor = vec4((texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25, 1.0);
}
`;
// ---- separable gaussian (9 taps through linear sampling); uDir in texels, scaled for wide streaks
const BLUR = COMMON + /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uDir;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;
// ---- light shafts: radial blur of the bright pass toward a light's place on screen
const RAYS = COMMON + /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uPos;
uniform float uLen;
void main() {
  vec2 d = (uPos - vUv) * uLen / 24.0;
  vec2 p = vUv;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 24; i++) { acc += texture2D(tSrc, p).rgb * w; w *= 0.93; p += d; }
  gl_FragColor = vec4(acc / 9.0, 1.0);
}
`;
// ---- 4. the composite to the screen
const COMP = COMMON + /* glsl */`
uniform sampler2D tSharp;
uniform sampler2D tDepth;
uniform sampler2D tB1;
uniform sampler2D tB2;
uniform sampler2D tB3;
uniform sampler2D tDofH;
uniform sampler2D tDofQ;
uniform sampler2D tStreak;
uniform sampler2D tRays;
uniform vec2 uRes;
uniform float uScale, uMargin, uTime;
uniform vec3 uLift, uGain, uShadow, uHigh;
uniform float uGamma, uContrast, uSat, uVignette, uHurt, uDesat, uKill, uLevels, uGrain;
uniform float uBloom, uStreak, uRaysK, uFocus, uAperture, uNearBlur, uCA, uZoom;
uniform vec2 uMotion;
uniform vec3 uStreakTint, uRayTint, uFlashCol;
uniform float uFlash;
uniform vec3 uFlarePos;
uniform vec3 uFlareCol;
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 sharpAt(vec2 suv) { vec2 px = floor(suv * uRes); return texture2D(tSharp, (px + 0.5) / uRes).rgb; }
void main() {
  // the low-res texel under this screen pixel (crisp), and the continuous coordinate (for the soft layers)
  vec2 lp = gl_FragCoord.xy / uScale + vec2(uMargin);
  vec2 suv = lp / uRes;
  vec2 uv = (floor(lp) + 0.5) / uRes;
  vec3 c;
  // motion blur along the frame's motion, a zoom blur from the centre on impacts
  float mb = length(uMotion * uRes) + uZoom * 40.0;
  if (mb > 0.75) {
    vec3 acc = vec3(0.0);
    vec2 zc = suv - 0.5;
    for (int i = 0; i < 10; i++) {
      float k = float(i) / 9.0 - 0.5;
      acc += sharpAt(suv + uMotion * k - zc * uZoom * (k + 0.5));
    }
    c = acc / 10.0;
  } else c = texture2D(tSharp, uv).rgb;
  // chromatic fringing on the heaviest hits
  if (uCA > 0.001) {
    vec2 dir = (suv - 0.5) * uCA;
    c.r = mix(c.r, sharpAt(suv + dir).r, 0.85);
    c.b = mix(c.b, sharpAt(suv - dir).b, 0.85);
  }
  // depth of field: the circle of confusion round the focus distance (near things blur harder)
  if (uAperture > 0.001) {
    float d = lin(texture2D(tDepth, uv).r);
    float coc = abs(d - uFocus) / max(d, 0.05) * uAperture;
    if (d < uFocus) coc *= 1.0 + uNearBlur;
    coc = clamp(coc, 0.0, 1.0);
    vec3 dh = texture2D(tDofH, suv).rgb, dq = texture2D(tDofQ, suv).rgb;
    c = mix(c, dh, smoothstep(0.08, 0.5, coc));
    c = mix(c, dq, smoothstep(0.5, 1.0, coc));
  }
  // bloom: tight, wide, very wide
  vec3 bl = texture2D(tB1, suv).rgb * 0.55 + texture2D(tB2, suv).rgb * 0.5 + texture2D(tB3, suv).rgb * 0.6;
  c += bl * uBloom;
  // anamorphic streaks off the hottest lights, light shafts
  c += texture2D(tStreak, suv).rgb * uStreak * uStreakTint;
  c += texture2D(tRays, suv).rgb * uRaysK * uRayTint;
  // the beacon's flare: a hot core, a horizontal streak, ghosts across the centre
  if (uFlarePos.z > 0.001) {
    vec2 asp = vec2(uRes.x / uRes.y, 1.0);
    vec2 dv = (suv - uFlarePos.xy) * asp;
    float core = exp(-dot(dv, dv) * 900.0);
    float streak = exp(-abs(dv.y) * 260.0) * exp(-abs(dv.x) * 3.2);
    vec3 f = uFlareCol * (core * 2.0 + streak * 0.9);
    vec2 axis = vec2(0.5) - uFlarePos.xy;
    for (int i = 1; i <= 3; i++) {
      float fi = float(i);
      vec2 gp = uFlarePos.xy + axis * (0.55 * fi);
      vec2 gd = (suv - gp) * asp;
      float r = 0.018 + 0.016 * fi;
      // hexagonal ghosts (the iris), soft edged
      vec2 a = abs(gd);
      float hex = max(a.x * 0.866 + a.y * 0.5, a.y);
      f += uFlareCol * mix(vec3(0.6, 1.0, 0.9), vec3(1.0), fi / 3.0) * (1.0 - smoothstep(r * 0.8, r, hex)) * 0.12;
    }
    c += f * uFlarePos.z;
  }
  // the beat's flash on top of everything (it does not bloom: a strobe, not a lamp)
  c += uFlashCol * uFlash;
  vec3 s = toSRGB(c);
  // grade
  s = max(s * uGain + uLift * (1.0 - s), 0.0);
  s = pow(s, vec3(1.0 / uGamma));
  vec3 sc = clamp(s, 0.0, 1.0);
  s = mix(s, sc * sc * (3.0 - 2.0 * sc), uContrast);
  float y = dot(s, vec3(0.299, 0.587, 0.114));
  s *= mix(uShadow, uHigh, smoothstep(0.05, 0.75, y));
  y = dot(s, vec3(0.299, 0.587, 0.114));
  s = mix(vec3(y), s, uSat * (1.0 - uDesat * 0.8));
  // hurt: the edges go dark red and close in
  vec2 qv = suv - 0.5;
  float r2 = dot(qv * vec2(1.0, 1.25), qv * vec2(1.0, 1.25));
  if (uHurt > 0.0) {
    float e = smoothstep(0.05, 0.3, r2) * uHurt;
    s = mix(s, s * vec3(0.9, 0.1, 0.08) + vec3(0.07, 0.0, 0.0), clamp(e, 0.0, 0.94));
  }
  s *= 1.0 - smoothstep(0.06, 0.42, r2) * uVignette;
  s *= 1.0 - uKill;
  s = floor(clamp(s, 0.0, 1.0) * uLevels + 0.5) / uLevels;
  s += (h12(floor(lp) + floor(uTime * 12.0) * 7.31) - 0.5) * uGrain;
  gl_FragColor = vec4(s, 1.0);
}
`;

type RT = THREE.WebGLRenderTarget;
const mkRT = (w: number, h: number, linear = true) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, depthBuffer: false, type: THREE.HalfFloatType });

export class StageRender {
  readonly scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  /** current grade (eases toward `goal`) */
  look: Look = copyLook({} as Look, LOOKS.wing);
  goal: Look = LOOKS.wing;
  /** seconds to reach the goal look */
  lookRate = 1.2;
  /** additive flash (linear), its colour; decays by flashDecay per second */
  flash = 0; flashCol = new THREE.Color(1, 0.96, 0.9); flashDecay = 4;
  hurt = 0; desat = 0; kill = 0;
  /** extra exposure multiplier for beats (blackout 0 .. flare >1), eases back to 1 */
  expo = 1; expoGoal = 1;
  enabled = true;
  // ---- the cinematic layer (the script drives these)
  /** bloom strength, threshold (linear light) */
  bloom = 0.9; bloomThr = 0.85;
  /** anamorphic streak strength and tint */
  streak = 0.5; streakTint = new THREE.Color(1, 0.75, 0.6);
  /** light shafts toward a world point (the key practical) */
  rays = 0.35; rayAt = new THREE.Vector3(); rayOn = false; rayTint = new THREE.Color(1, 1, 1);
  /** depth of field: focus distance (m) eased toward focusGoal, aperture (0 off .. 1 strong) */
  focus = 2; focusGoal = 2; focusRate = 6; aperture = 0; apertureGoal = 0;
  /** near things blur this much harder (dazed close-ups) */
  nearBlur = 0.6;
  /** motion blur: shutter (0 off .. 1 full frame), a zoom blur that decays (impacts), chromatic fringing that decays */
  shutter = 0.65; zoom = 0; ca = 0;
  /** the beacon's flare: a world point, colour, strength 0..1 (the script sets each frame) */
  flareAt = new THREE.Vector3(); flareK = 0; flareCol = new THREE.Color(1, 0.25, 0.12);
  /** the cheap path (phones): no shafts, no streaks, no quarter-res depth blur */
  low = false;
  private rt: RT | null = null;
  private sharp: RT | null = null;
  private b1a: RT | null = null; private b1b: RT | null = null; private b2a: RT | null = null; private b2b: RT | null = null; private b3a: RT | null = null; private b3b: RT | null = null;
  private dha: RT | null = null; private dhb: RT | null = null; private dqa: RT | null = null; private dqb: RT | null = null;
  private sa: RT | null = null; private sb: RT | null = null; private ray: RT | null = null;
  private black: RT;
  private mats: Record<string, THREE.ShaderMaterial> = {};
  private fs = new THREE.Scene();
  private quad: THREE.Mesh;
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private hook = (r: THREE.WebGLRenderer) => this.draw(r);
  private t = 0;
  private prevVP = new THREE.Matrix4(); private hasPrev = false;
  private motion = new THREE.Vector2();
  private tv = new THREE.Vector3();

  constructor(private pr: PixelRenderer, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.scene.background = null;
    const U = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
    const mk = (frag: string, u: Record<string, unknown>) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, uniforms: U({ uNear: 0.05, uFar: 60, ...u }) });
    this.mats.prep = mk(PREP, { tColor: null, tNormal: null, tDepth: null, uRes: new THREE.Vector2(), uFlashCol: new THREE.Vector3(1, 1, 1), uExposure: 1, uFlash: 0, uOutline: 1 });
    this.mats.bright = mk(BRIGHT, { tSrc: null, uTexel: new THREE.Vector2(), uThr: 0.85, uKnee: 0.35 });
    this.mats.down = mk(DOWN, { tSrc: null, uTexel: new THREE.Vector2() });
    this.mats.blur = mk(BLUR, { tSrc: null, uDir: new THREE.Vector2() });
    this.mats.rays = mk(RAYS, { tSrc: null, uPos: new THREE.Vector2(0.5, 0.5), uLen: 0.7 });
    this.mats.comp = mk(COMP, {
      tSharp: null, tDepth: null, tB1: null, tB2: null, tB3: null, tDofH: null, tDofQ: null, tStreak: null, tRays: null,
      uRes: new THREE.Vector2(1, 1), uScale: 2, uMargin: 2, uTime: 0,
      uLift: new THREE.Vector3(), uGain: new THREE.Vector3(1, 1, 1), uShadow: new THREE.Vector3(1, 1, 1), uHigh: new THREE.Vector3(1, 1, 1),
      uGamma: 1, uContrast: 0.3, uSat: 1, uVignette: 0.5, uHurt: 0, uDesat: 0, uKill: 0, uLevels: 128, uGrain: 0.006,
      uBloom: 0.9, uStreak: 0.5, uRaysK: 0.35, uFocus: 2, uAperture: 0, uNearBlur: 0.6, uCA: 0, uZoom: 0,
      uMotion: new THREE.Vector2(), uStreakTint: new THREE.Vector3(1, 0.75, 0.6), uRayTint: new THREE.Vector3(1, 1, 1),
      uFlarePos: new THREE.Vector3(), uFlareCol: new THREE.Vector3(1, 0.3, 0.15), uFlashCol: new THREE.Vector3(1, 1, 1), uFlash: 0,
    });
    this.black = mkRT(1, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mats.comp);
    this.quad.frustumCulled = false;
    this.fs.add(this.quad);
    // drawn first among the after-render layers (the body HUD etc. stay on top)
    pr.afterRender.unshift(this.hook);
  }

  /** ease the grade toward a named look */
  setLook(name: keyof typeof LOOKS | string, secs = 1.2) { const l = LOOKS[name]; if (l) { this.goal = l; this.lookRate = Math.max(0.05, secs); } }
  /** a flash of light (white strobe, red hit, amber flare...) */
  pulse(k: number, col = 0xfff4e8, decay = 4) { this.flash = Math.max(this.flash, k); this.flashCol.setHex(col); this.flashDecay = decay; }
  /** an impact through the lens: a zoom blur, fringing */
  impact(k: number) { this.zoom = Math.max(this.zoom, 0.03 * k); this.ca = Math.max(this.ca, 0.008 * k); }
  /** a hard cut: no motion blur across it */
  cut() { this.hasPrev = false; }
  /** rack focus to a distance (m) at a rate (1/s), with an aperture */
  rack(dist: number, aperture?: number, rate = 6) { this.focusGoal = dist; this.focusRate = rate; if (aperture !== undefined) this.apertureGoal = aperture; }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 3 / this.lookRate), L = this.look, G = this.goal;
    for (let i = 0; i < 3; i++) { L.lift[i] += (G.lift[i] - L.lift[i]) * k; L.gain[i] += (G.gain[i] - L.gain[i]) * k; L.shadow[i] += (G.shadow[i] - L.shadow[i]) * k; L.high[i] += (G.high[i] - L.high[i]) * k; }
    L.gamma += (G.gamma - L.gamma) * k; L.contrast += (G.contrast - L.contrast) * k; L.sat += (G.sat - L.sat) * k; L.exposure += (G.exposure - L.exposure) * k; L.vignette += (G.vignette - L.vignette) * k;
    this.flash = Math.max(0, this.flash - dt * this.flashDecay * Math.max(0.3, this.flash));
    this.expo += (this.expoGoal - this.expo) * Math.min(1, dt * 6);
    this.focus += (this.focusGoal - this.focus) * Math.min(1, dt * this.focusRate);
    this.aperture += (this.apertureGoal - this.aperture) * Math.min(1, dt * 4);
    this.zoom = Math.max(0, this.zoom - dt * 0.25);
    this.ca = Math.max(0, this.ca - dt * 0.05);
  }

  private ensure(w: number, h: number) {
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    for (const r of [this.rt, this.sharp, this.b1a, this.b1b, this.b2a, this.b2b, this.b3a, this.b3b, this.dha, this.dhb, this.dqa, this.dqb, this.sa, this.sb, this.ray]) r?.dispose();
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.FloatType;
    this.rt = new THREE.WebGLRenderTarget(w, h, { count: 2, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth, type: THREE.HalfFloatType });
    // the sharp picture: nearest when magnified (crisp pixels), linear when the soft passes halve it
    this.sharp = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, depthBuffer: false, type: THREE.HalfFloatType });
    const h2 = [Math.ceil(w / 2), Math.ceil(h / 2)], h4 = [Math.ceil(w / 4), Math.ceil(h / 4)], h8 = [Math.ceil(w / 8), Math.ceil(h / 8)];
    this.b1a = mkRT(h2[0], h2[1]); this.b1b = mkRT(h2[0], h2[1]);
    this.b2a = mkRT(h4[0], h4[1]); this.b2b = mkRT(h4[0], h4[1]);
    this.b3a = mkRT(h8[0], h8[1]); this.b3b = mkRT(h8[0], h8[1]);
    this.dha = mkRT(h2[0], h2[1]); this.dhb = mkRT(h2[0], h2[1]);
    this.dqa = mkRT(h4[0], h4[1]); this.dqb = mkRT(h4[0], h4[1]);
    this.sa = mkRT(h4[0], h4[1]); this.sb = mkRT(h4[0], h4[1]);
    this.ray = mkRT(h2[0], h2[1]);
  }

  private pass(r: THREE.WebGLRenderer, m: THREE.ShaderMaterial, out: RT | null) { this.quad.material = m; r.setRenderTarget(out); r.render(this.fs, this.fsCam); }
  private blurPass(r: THREE.WebGLRenderer, a: RT, b: RT, spread = 1) {
    const m = this.mats.blur, u = m.uniforms;
    u.tSrc.value = a.texture; u.uDir.value.set(spread / a.width, 0); this.pass(r, m, b);
    u.tSrc.value = b.texture; u.uDir.value.set(0, spread / a.height); this.pass(r, m, a);
  }
  private downPass(r: THREE.WebGLRenderer, src: RT, out: RT) { const m = this.mats.down; m.uniforms.tSrc.value = src.texture; m.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); this.pass(r, m, out); }
  /** a world point on the picture (uv), z > 0 when in front */
  private toUv(p: THREE.Vector3, out: THREE.Vector3) { const v = this.tv.copy(p).project(this.camera); out.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, v.z < 1 && v.z > -1 ? 1 : 0); return out; }

  private blackReady = false;
  private draw(r: THREE.WebGLRenderer) {
    if (!this.enabled) return;
    if (!this.blackReady) { this.blackReady = true; r.setRenderTarget(this.black); r.setClearColor(0x000000, 1); r.clear(true, false, false); }
    const pr = this.pr;
    const W = pr.lowW + pr.margin * 2, H = pr.lowH + pr.margin * 2;
    this.ensure(W, H);
    const cam = this.camera;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const rt = this.rt!;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.scene, cam);
    r.setClearColor(prevClear, prevAlpha);
    const near = cam.near, far = cam.far;
    for (const m of Object.values(this.mats)) { if (m.uniforms.uNear) { m.uniforms.uNear.value = near; m.uniforms.uFar.value = far; } }
    // 2. prep
    const L = this.look;
    let u = this.mats.prep.uniforms;
    u.tColor.value = rt.textures[0]; u.tNormal.value = rt.textures[1]; u.tDepth.value = rt.depthTexture; u.uRes.value.set(W, H);
    u.uExposure.value = L.exposure * this.expo; u.uFlash.value = this.flash; u.uFlashCol.value.set(this.flashCol.r, this.flashCol.g, this.flashCol.b);
    this.pass(r, this.mats.prep, this.sharp);
    // 3. bloom: bright pass at half res, then three blurred levels
    u = this.mats.bright.uniforms;
    u.tSrc.value = this.sharp!.texture; u.uTexel.value.set(1 / W, 1 / H); u.uThr.value = this.bloomThr;
    this.pass(r, this.mats.bright, this.b1a);
    // shafts from the unblurred bright pass
    const rayUv = this.toUv(this.rayAt, new THREE.Vector3());
    const raysOn = !this.low && this.rayOn && this.rays > 0.01 && rayUv.z > 0;
    if (raysOn) { u = this.mats.rays.uniforms; u.tSrc.value = this.b1a!.texture; u.uPos.value.set(rayUv.x, rayUv.y); this.pass(r, this.mats.rays, this.ray); }
    this.blurPass(r, this.b1a!, this.b1b!, 1);
    this.downPass(r, this.b1a!, this.b2a!); this.blurPass(r, this.b2a!, this.b2b!, 1.5);
    this.downPass(r, this.b2a!, this.b3a!); this.blurPass(r, this.b3a!, this.b3b!, 2);
    // anamorphic streaks: the quarter level smeared sideways, wider and wider
    const streakOn = !this.low && this.streak > 0.01;
    if (streakOn) {
      const m = this.mats.blur; m.uniforms.tSrc.value = this.b2a!.texture;
      for (const [src, dst, sp] of [[this.b2a, this.sa, 2], [this.sa, this.sb, 5], [this.sb, this.sa, 11]] as [RT, RT, number][]) { m.uniforms.tSrc.value = src.texture; m.uniforms.uDir.value.set(sp / src.width, 0); this.pass(r, m, dst); }
    }
    // depth of field: the sharp picture blurred at half and quarter res
    const dofOn = this.aperture > 0.004;
    if (dofOn) {
      this.downPass(r, this.sharp!, this.dha!); this.blurPass(r, this.dha!, this.dhb!, 1);
      if (!this.low) { this.downPass(r, this.dha!, this.dqa!); this.blurPass(r, this.dqa!, this.dqb!, 1.6); }
    }
    // camera motion: where the middle of the previous frame's view lands now
    cam.updateMatrixWorld();
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (this.hasPrev && this.shutter > 0) {
      const p = this.tv.set(0, 0, -6).applyMatrix4(cam.matrixWorld);
      const a = p.clone().applyMatrix4(this.prevVP), b = p.clone().applyMatrix4(vp);
      this.motion.set((b.x - a.x) * 0.5, (b.y - a.y) * 0.5).multiplyScalar(this.shutter);
      if (this.motion.length() > 0.035) this.motion.setLength(0.035);
    } else this.motion.set(0, 0);
    this.prevVP.copy(vp); this.hasPrev = true;
    // 4. composite
    u = this.mats.comp.uniforms;
    u.tSharp.value = this.sharp!.texture; u.tDepth.value = rt.depthTexture;
    u.tB1.value = this.b1a!.texture; u.tB2.value = this.b2a!.texture; u.tB3.value = this.b3a!.texture;
    u.tDofH.value = dofOn ? this.dha!.texture : this.sharp!.texture; u.tDofQ.value = dofOn && !this.low ? this.dqa!.texture : dofOn ? this.dha!.texture : this.sharp!.texture;
    u.tStreak.value = streakOn ? this.sa!.texture : this.black.texture; u.tRays.value = raysOn ? this.ray!.texture : this.black.texture;
    u.uRes.value.set(W, H); u.uScale.value = pr.scale; u.uMargin.value = pr.margin; u.uTime.value = this.t;
    u.uLift.value.set(...L.lift); u.uGain.value.set(...L.gain); u.uShadow.value.set(...L.shadow); u.uHigh.value.set(...L.high);
    u.uGamma.value = L.gamma; u.uContrast.value = L.contrast; u.uSat.value = L.sat; u.uVignette.value = L.vignette;
    u.uHurt.value = Math.min(1, this.hurt); u.uDesat.value = Math.min(1, this.desat); u.uKill.value = Math.min(1, this.kill);
    u.uBloom.value = this.bloom; u.uStreak.value = streakOn ? this.streak : 0; u.uRaysK.value = raysOn ? this.rays : 0;
    u.uStreakTint.value.set(this.streakTint.r, this.streakTint.g, this.streakTint.b); u.uRayTint.value.set(this.rayTint.r, this.rayTint.g, this.rayTint.b);
    u.uFocus.value = this.focus; u.uAperture.value = dofOn ? this.aperture : 0; u.uNearBlur.value = this.nearBlur;
    u.uMotion.value.copy(this.motion); u.uZoom.value = this.zoom; u.uCA.value = this.ca;
    u.uFlash.value = this.flash; u.uFlashCol.value.set(this.flashCol.r, this.flashCol.g, this.flashCol.b);
    if (this.flareK > 0.01) { const f = this.toUv(this.flareAt, new THREE.Vector3()); u.uFlarePos.value.set(f.x, f.y, f.z * this.flareK); } else u.uFlarePos.value.set(0, 0, 0);
    u.uFlareCol.value.set(this.flareCol.r, this.flareCol.g, this.flareCol.b);
    this.pass(r, this.mats.comp, null);
    r.setRenderTarget(null);
  }

  dispose() {
    const i = this.pr.afterRender.indexOf(this.hook);
    if (i >= 0) this.pr.afterRender.splice(i, 1);
    for (const r of [this.rt, this.sharp, this.b1a, this.b1b, this.b2a, this.b2b, this.b3a, this.b3b, this.dha, this.dhb, this.dqa, this.dqb, this.sa, this.sb, this.ray, this.black]) r?.dispose();
    this.rt = null;
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

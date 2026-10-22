// The intake's own picture. The first-person stage (src/game/intro.ts) is a
// room the camera is inside, so the renderer's overlay pass (which outlines
// held props against the world behind them) cannot draw silhouettes inside
// it, and it dims everything by the light where the survivor's world body
// stands. So the stage is drawn here instead, in the same low-res pixel grid
// and integer upscale as the world, after the renderer's own frame:
//   1. the stage scene into a low-res MRT target (colour + the world
//      materials' gNormal + depth), shadows from its own lights;
//   2. a composite straight to the screen: a black one-pixel outline where
//      depth steps (the nearer silhouette), a lit lip on convex creases, the
//      beat's exposure / flash / strobe, a split-tone grade (amber highlights,
//      cold shadows, or whatever the shot asks), hurt (the edges going red),
//      the colour draining out, a hard vignette, posterise, a whisper of grain.
// Nothing is blurred: every pixel of the stage is one low-res texel.
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
  wing: { lift: [0.012, 0.018, 0.026], gamma: 1.02, gain: [1.0, 1.02, 1.04], contrast: 0.32, sat: 0.92, shadow: [0.78, 0.95, 1.12], high: [1.08, 1.0, 0.88], exposure: 1.05, vignette: 0.55 },
  // the tiled room: harsh, green-white, crushed
  ante: { lift: [0.01, 0.014, 0.012], gamma: 0.96, gain: [1.02, 1.04, 0.98], contrast: 0.45, sat: 0.82, shadow: [0.82, 1.0, 1.02], high: [1.06, 1.02, 0.9], exposure: 1.0, vignette: 0.7 },
  // sodium amber against red and cyan
  press: { lift: [0.016, 0.01, 0.014], gamma: 1.0, gain: [1.06, 0.98, 0.9], contrast: 0.42, sat: 1.05, shadow: [0.75, 0.9, 1.18], high: [1.14, 0.98, 0.8], exposure: 1.1, vignette: 0.65 },
  // the portal: cold cyan, deep blacks
  portal: { lift: [0.006, 0.014, 0.02], gamma: 0.98, gain: [0.94, 1.02, 1.1], contrast: 0.5, sat: 1.0, shadow: [0.7, 0.95, 1.2], high: [0.95, 1.05, 1.12], exposure: 1.1, vignette: 0.7 },
  // the Lobby end (unused on the stage, for completeness)
  neutral: { lift: [0, 0, 0], gamma: 1, gain: [1, 1, 1], contrast: 0.2, sat: 1, shadow: [1, 1, 1], high: [1, 1, 1], exposure: 1, vignette: 0.4 },
};
const copyLook = (o: Look, s: Look) => { o.lift = [...s.lift]; o.gain = [...s.gain]; o.shadow = [...s.shadow]; o.high = [...s.high]; o.gamma = s.gamma; o.contrast = s.contrast; o.sat = s.sat; o.exposure = s.exposure; o.vignette = s.vignette; return o; };

const VERT = /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uScale, uMargin, uNear, uFar, uTime;
uniform vec3 uLift, uGain, uShadow, uHigh, uFlashCol;
uniform float uGamma, uContrast, uSat, uExposure, uVignette, uFlash, uHurt, uDesat, uKill, uLevels, uGrain, uOutline;
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 lp = gl_FragCoord.xy / uScale + vec2(uMargin);
  vec2 px = floor(lp);
  vec2 uv = (px + 0.5) / uRes;
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
  bool solid = dr < 0.99999 && flag > 0.25;
  if (solid) {
    if (edge > 0.5) c = mix(c, vec3(0.006, 0.005, 0.004), uOutline);
    else c *= 1.0 + min(crease, 1.0) * 0.28;
  }
  // exposure and the beat's flash (linear light)
  c *= uExposure;
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
  vec2 qv = uv - 0.5;
  float r2 = dot(qv * vec2(1.0, 1.25), qv * vec2(1.0, 1.25));
  if (uHurt > 0.0) {
    float e = smoothstep(0.06, 0.32, r2) * uHurt;
    s = mix(s, s * vec3(0.9, 0.12, 0.1) + vec3(0.06, 0.0, 0.0), clamp(e, 0.0, 0.92));
  }
  s *= 1.0 - smoothstep(0.08, 0.42, r2) * uVignette;
  s *= 1.0 - uKill;
  // posterise, a whisper of grain
  s = floor(clamp(s, 0.0, 1.0) * uLevels + 0.5) / uLevels;
  s += (h12(px + floor(uTime * 12.0) * 7.31) - 0.5) * uGrain;
  gl_FragColor = vec4(s, 1.0);
}
`;

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
  private rt: THREE.WebGLRenderTarget | null = null;
  private mat: THREE.ShaderMaterial;
  private fs = new THREE.Scene();
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private hook = (r: THREE.WebGLRenderer) => this.draw(r);
  private t = 0;

  constructor(private pr: PixelRenderer, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.scene.background = null;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: 2 }, uMargin: { value: 2 }, uNear: { value: 0.05 }, uFar: { value: 60 }, uTime: { value: 0 },
        uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uShadow: { value: new THREE.Vector3(1, 1, 1) }, uHigh: { value: new THREE.Vector3(1, 1, 1) },
        uFlashCol: { value: new THREE.Vector3(1, 1, 1) }, uGamma: { value: 1 }, uContrast: { value: 0.3 }, uSat: { value: 1 }, uExposure: { value: 1 },
        uVignette: { value: 0.5 }, uFlash: { value: 0 }, uHurt: { value: 0 }, uDesat: { value: 0 }, uKill: { value: 0 }, uLevels: { value: 56 }, uGrain: { value: 0.006 }, uOutline: { value: 1 },
      },
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    q.frustumCulled = false;
    this.fs.add(q);
    // drawn first among the after-render layers (the body HUD etc. stay on top)
    pr.afterRender.unshift(this.hook);
  }

  /** ease the grade toward a named look */
  setLook(name: keyof typeof LOOKS | string, secs = 1.2) { const l = LOOKS[name]; if (l) { this.goal = l; this.lookRate = Math.max(0.05, secs); } }
  /** a flash of light (white strobe, red hit, amber flare...) */
  pulse(k: number, col = 0xfff4e8, decay = 4) { this.flash = Math.max(this.flash, k); this.flashCol.setHex(col); this.flashDecay = decay; }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 3 / this.lookRate), L = this.look, G = this.goal;
    for (let i = 0; i < 3; i++) { L.lift[i] += (G.lift[i] - L.lift[i]) * k; L.gain[i] += (G.gain[i] - L.gain[i]) * k; L.shadow[i] += (G.shadow[i] - L.shadow[i]) * k; L.high[i] += (G.high[i] - L.high[i]) * k; }
    L.gamma += (G.gamma - L.gamma) * k; L.contrast += (G.contrast - L.contrast) * k; L.sat += (G.sat - L.sat) * k; L.exposure += (G.exposure - L.exposure) * k; L.vignette += (G.vignette - L.vignette) * k;
    this.flash = Math.max(0, this.flash - dt * this.flashDecay * Math.max(0.3, this.flash));
    this.expo += (this.expoGoal - this.expo) * Math.min(1, dt * 6);
  }

  private ensure(w: number, h: number) {
    if (this.rt && this.rt.width === w && this.rt.height === h) return this.rt;
    this.rt?.dispose();
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.FloatType;
    this.rt = new THREE.WebGLRenderTarget(w, h, { count: 2, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth, type: THREE.HalfFloatType });
    return this.rt;
  }

  private draw(r: THREE.WebGLRenderer) {
    if (!this.enabled) return;
    const pr = this.pr;
    const W = pr.lowW + pr.margin * 2, H = pr.lowH + pr.margin * 2;
    const rt = this.ensure(W, H);
    const cam = this.camera;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.scene, cam);
    r.setRenderTarget(null);
    r.setClearColor(prevClear, prevAlpha);
    const u = this.mat.uniforms, L = this.look;
    u.tColor.value = rt.textures[0]; u.tNormal.value = rt.textures[1]; u.tDepth.value = rt.depthTexture;
    u.uRes.value.set(W, H); u.uScale.value = pr.scale; u.uMargin.value = pr.margin;
    u.uNear.value = cam.near; u.uFar.value = cam.far; u.uTime.value = this.t;
    u.uLift.value.set(...L.lift); u.uGain.value.set(...L.gain); u.uShadow.value.set(...L.shadow); u.uHigh.value.set(...L.high);
    u.uGamma.value = L.gamma; u.uContrast.value = L.contrast; u.uSat.value = L.sat; u.uVignette.value = L.vignette;
    u.uExposure.value = L.exposure * this.expo;
    u.uFlash.value = this.flash; u.uFlashCol.value.set(this.flashCol.r, this.flashCol.g, this.flashCol.b);
    u.uHurt.value = Math.min(1, this.hurt); u.uDesat.value = Math.min(1, this.desat); u.uKill.value = Math.min(1, this.kill);
    r.render(this.fs, this.fsCam);
  }

  dispose() {
    const i = this.pr.afterRender.indexOf(this.hook);
    if (i >= 0) this.pr.afterRender.splice(i, 1);
    this.rt?.dispose(); this.rt = null;
    this.mat.dispose();
  }
}

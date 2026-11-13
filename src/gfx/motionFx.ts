// Motion blur and the mind's eye: one low-res pass after the composite, before the upscale.
//
// MOTION BLUR. Every pixel is reprojected through last frame's camera (depth + both view-projections), which
// gives the screen motion the camera caused at that pixel: the picture is smeared along it for a fixed
// shutter time (frame-rate independent), so pans, quarter turns, rolls, sprints and hit shakes streak while a
// still camera stays pixel-exact. Bodies that move on their own (a charging inhabitant, the unit in a roll)
// leave a short trail through a reprojected history: the last output, moved with the camera, mixed back in.
// Where nothing moved, history and picture are the same pixels, so a static scene never smears.
//
// THE MIND. Driven by the local unit (src/game/panic.ts, the body console's MIND reading):
//  panic   heavier, outward (tunnel) blur, a tunnel vignette pulsing with the heartbeat, a slight breathing
//          zoom, a shaky view, the colour draining out
//  mind    (low sanity) a drifting double image, a chromatic split toward the edges, straight lines slowly
//          warping, and now and then a one-frame shape at the edge of sight that is not there
// Scaled by severity; 'reduce flashing' drops the flickers and the pulse, motion comfort calms the sway.
import * as THREE from 'three';
import { FS_VERT } from './postfx';
import type { QualityLevel } from './fxconfig';

export type BlurLevel = 'off' | 'low' | 'normal' | 'heavy';
/** shutter (s of motion smeared), the history kept for moving bodies, taps along the motion */
const LEVELS: Record<BlurLevel, { shutter: number; keep: number; taps: number }> = {
  off: { shutter: 0, keep: 0, taps: 0 },
  low: { shutter: 0.035, keep: 0.2, taps: 6 },
  normal: { shutter: 0.07, keep: 0.36, taps: 10 },
  heavy: { shutter: 0.12, keep: 0.52, taps: 14 },
};
/** quality caps: phones get the history trail and a short smear only */
const TAPS_CAP: Record<QualityLevel, number> = { low: 4, medium: 8, high: 14 };

/** what the game feeds in each frame (src/gfx/mindFx.ts sets these from the unit) */
export const MINDFX = {
  /** panic 0..1 */
  panic: 0,
  /** heartbeat pulse 0..1 (peaks on each beat) */
  beat: 0,
  /** low-sanity severity 0..1 */
  mind: 0,
  /** a hallucination this frame: strength 0..1, screen position, shape seed */
  hal: 0, halX: 0.1, halY: 0.5, halK: 0,
  /** accessibility: no flicker, no pulse (reduce flashing); motion comfort halves sway and shake */
  calm: false, comfort: false, shake: 1,
};

const MOTION_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform sampler2D tDepth;
uniform mat4 uInvVP;
uniform mat4 uPrevVP;
uniform vec2 uRes;
uniform float uShutterK;
uniform float uKeep;
uniform float uHistOn;
uniform int uTaps;
uniform float uTime;
uniform float uPanic;
uniform float uBeat;
uniform float uMind;
uniform vec4 uHal;
uniform float uShake;
uniform float uPersp;

float hh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(float t) { float i = floor(t), f = fract(t); f = f * f * (3.0 - 2.0 * f); return mix(hh(vec2(i, 1.7)), hh(vec2(i + 1.0, 1.7)), f) * 2.0 - 1.0; }

void main() {
  vec2 uv = vUv;
  float P = uPanic, M = uMind;
  vec2 c0 = uv - 0.5;
  // panic: the view breathes in and out a little, and shakes
  if (P > 0.001) {
    float br = 0.5 + 0.5 * sin(uTime * (1.6 + P * 1.4));
    uv = 0.5 + c0 * (1.0 - P * 0.03 * br - P * 0.012 * uBeat);
    uv += vec2(vnoise(uTime * 9.0), vnoise(uTime * 11.0 + 4.0)) * 0.0028 * P * uShake;
  }
  // low mind: straight lines slowly bend
  if (M > 0.001) {
    uv += vec2(sin(uv.y * 5.5 + uTime * 0.41) + sin(uv.y * 2.1 - uTime * 0.23) * 0.6, sin(uv.x * 4.6 - uTime * 0.37) + sin(uv.x * 1.7 + uTime * 0.19) * 0.6) * 0.0035 * M * M;
  }
  // ---- reproject: where was this pixel last frame (the camera's own motion)
  float dr = texture2D(tDepth, uv).r;
  vec4 wp = uInvVP * vec4(uv * 2.0 - 1.0, dr * 2.0 - 1.0, 1.0);
  wp /= wp.w;
  vec4 pc = uPrevVP * wp;
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  vec2 mv = (uv - puv) * uRes;                     // pixels this frame
  vec2 blur = mv * uShutterK * (1.0 + P * 0.8);
  float bl = length(blur);
  if (bl > 48.0) blur *= 48.0 / bl;
  // panic adds an outward smear (tunnel vision): stronger toward the rim, swelling on the beat
  blur += c0 * uRes * P * (0.02 + 0.014 * uBeat) * smoothstep(0.08, 0.5, length(c0));
  bl = length(blur);
  vec3 col;
  if (bl < 0.6 || uTaps == 0) col = texture2D(tCur, uv).rgb;
  else {
    vec3 acc = vec3(0.0); float wsum = 0.0;
    vec2 st = blur / uRes;
    for (int i = 0; i < 16; i++) {
      if (i >= uTaps) break;
      float t = (float(i) + 0.5) / float(uTaps) - 0.5;
      float w = 1.0 - abs(t) * 0.8;
      acc += texture2D(tCur, uv + st * t).rgb * w; wsum += w;
    }
    col = acc / wsum;
  }
  // low mind: a second image drifting off the first, colours splitting toward the edges
  if (M > 0.001) {
    vec2 dv = vec2(sin(uTime * 0.37) + sin(uTime * 0.13) * 0.5, cos(uTime * 0.29) * 0.8) * (2.0 + 7.0 * M) / uRes;
    col = mix(col, texture2D(tCur, uv + dv).rgb, 0.32 * M);
    // (none in the middle, up to 8 px at the edges)
    vec2 rd = c0 * 2.0 * dot(c0, c0) * 4.0 * (2.0 + 6.0 * M) * M / uRes;
    float r = texture2D(tCur, uv + rd).r, b = texture2D(tCur, uv - rd).b;
    col = vec3(mix(col.r, r, 0.85), col.g, mix(col.b, b, 0.85));
  }
  // ---- the history: moving bodies trail, a still scene is the same pixels
  if (uHistOn > 0.5 && puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
    vec3 hist = texture2D(tHist, puv).rgb;
    float k = clamp(uKeep + P * 0.18 + M * 0.12, 0.0, 0.8);
    col = mix(col, hist, k);
  }
  // panic: colour drains, a dark tunnel closes in and pulses with the heart
  if (P > 0.001) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(l) * vec3(0.96, 0.97, 1.02), P * 0.5);
    float r = length(c0 * vec2(uRes.x / uRes.y, 1.0));
    float edge = 0.78 - P * 0.3 - uBeat * P * 0.06;
    float tun = smoothstep(edge, edge + 0.32, r);
    col = mix(col, col * vec3(0.18, 0.05, 0.06), tun * (0.55 + 0.35 * P));
  }
  // low mind: a shape at the edge of sight, for a frame
  if (uHal.x > 0.001) {
    vec2 a = (vUv - uHal.yz) * vec2(uRes.x / uRes.y, 1.0);
    float k = uHal.w;
    float head = smoothstep(0.035, 0.026, length(a - vec2(0.0, 0.09 + k * 0.02)));
    float body = smoothstep(0.03, 0.02, abs(a.x + sin(a.y * 9.0 + k * 6.0) * 0.01) - (0.03 - a.y * 0.06)) * step(-0.16, a.y) * step(a.y, 0.08);
    float arm = smoothstep(0.012, 0.006, abs(a.y - 0.04 + a.x * (0.6 + k))) * step(abs(a.x), 0.09 + k * 0.05);
    float s = clamp(head + body + arm, 0.0, 1.0);
    col = mix(col, vec3(0.02, 0.015, 0.02), s * uHal.x);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/** owns the history targets and the pass; the renderer calls run() after the composite */
export class MotionFx {
  level: BlurLevel = 'normal';
  quality: QualityLevel = 'high';
  private mat: THREE.ShaderMaterial;
  private rt: THREE.WebGLRenderTarget[] = [];
  private cur = 0;
  private W = 0; private H = 0; private smooth = false;
  private prevVP = new THREE.Matrix4();
  private vp = new THREE.Matrix4();
  private hasPrev = false;
  private prevPos = new THREE.Vector3();
  private time = 0;
  private lastRun = 0;
  /** dev / probes: the last frame's settings */
  last = { taps: 0, keep: 0, shutterK: 0 };

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: MOTION_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        tCur: { value: null }, tHist: { value: null }, tDepth: { value: null },
        uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) },
        uShutterK: { value: 0 }, uKeep: { value: 0 }, uHistOn: { value: 0 }, uTaps: { value: 0 }, uTime: { value: 0 },
        uPanic: { value: 0 }, uBeat: { value: 0 }, uMind: { value: 0 }, uHal: { value: new THREE.Vector4() }, uShake: { value: 1 }, uPersp: { value: 0 },
      },
    });
  }

  /** anything to do this frame (off with a calm mind: the pass is skipped and the composite goes straight up) */
  active(): boolean { return this.level !== 'off' || MINDFX.panic > 0.002 || MINDFX.mind > 0.002 || MINDFX.hal > 0; }

  setSize(W: number, H: number, smooth: boolean) {
    if (W === this.W && H === this.H && smooth === this.smooth && this.rt.length) return;
    this.W = W; this.H = H; this.smooth = smooth;
    for (const r of this.rt) r.dispose();
    const f = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    this.rt = [0, 1].map(() => new THREE.WebGLRenderTarget(W, H, { minFilter: f, magFilter: f, depthBuffer: false, type: THREE.HalfFloatType, generateMipmaps: false }));
    this.hasPrev = false;
  }

  /** forget the history (a cut: zone change, teleport, the eye view toggled) */
  reset() { this.hasPrev = false; }

  /**
   * Run the pass on the composited picture; returns the texture to put on screen. cam: the camera the
   * world was drawn with this frame (its matrices are current).
   */
  run(pass: (m: THREE.ShaderMaterial, rt: THREE.WebGLRenderTarget) => void, color: THREE.Texture, depth: THREE.Texture, cam: THREE.Camera, dt: number): THREE.Texture {
    const L = LEVELS[this.level];
    this.time += dt;
    // the pass sat idle (blur off, a calm mind): what the history holds is old
    const now = performance.now();
    if (now - this.lastRun > 250) this.hasPrev = false;
    this.lastRun = now;
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    // a jump of the camera (a level change, a teleport, a loop in the suburbs) is a cut, not a smear
    const pos = (cam as any).position as THREE.Vector3;
    if (this.hasPrev && pos.distanceTo(this.prevPos) > 6) this.hasPrev = false;
    this.prevPos.copy(pos);
    const u = this.mat.uniforms;
    u.tCur.value = color; u.tDepth.value = depth;
    u.uInvVP.value.copy(this.vp).invert();
    u.uPrevVP.value.copy(this.hasPrev ? this.prevVP : this.vp);
    u.uRes.value.set(this.W, this.H);
    // the shutter in frames: the same streak at any frame rate
    const fdt = Math.max(1 / 240, Math.min(0.1, dt || 1 / 60));
    u.uShutterK.value = L.shutter > 0 ? Math.min(4, L.shutter / fdt) : 0;
    u.uTaps.value = Math.min(L.taps, TAPS_CAP[this.quality] ?? 8, 16) || (MINDFX.panic > 0.05 ? Math.min(6, TAPS_CAP[this.quality] ?? 6) : 0);
    // the trail lasts the same time at any frame rate
    u.uKeep.value = this.hasPrev && L.keep > 0 ? Math.pow(L.keep, Math.max(0.25, Math.min(4, fdt * 60))) : 0;
    u.uHistOn.value = this.hasPrev && (L.keep > 0 || MINDFX.panic > 0.05 || MINDFX.mind > 0.05) ? 1 : 0;
    u.uTime.value = this.time;
    u.uPanic.value = MINDFX.panic;
    u.uBeat.value = MINDFX.calm ? 0.3 : MINDFX.beat;
    u.uMind.value = MINDFX.mind;
    u.uHal.value.set(MINDFX.calm ? 0 : MINDFX.hal, MINDFX.halX, MINDFX.halY, MINDFX.halK);
    u.uShake.value = MINDFX.shake * (MINDFX.comfort ? 0.35 : 1);
    u.uPersp.value = (cam as THREE.PerspectiveCamera).isPerspectiveCamera ? 1 : 0;
    const src = this.rt[this.cur], dst = this.rt[1 - this.cur];
    u.tHist.value = src.texture;
    pass(this.mat, dst);
    this.cur = 1 - this.cur;
    this.prevVP.copy(this.vp);
    this.hasPrev = true;
    this.last = { taps: u.uTaps.value, keep: u.uKeep.value, shutterK: u.uShutterK.value };
    return dst.texture;
  }
}

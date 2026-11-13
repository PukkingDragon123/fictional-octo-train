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
/** shutter (s of motion smeared), the history kept for moving bodies, taps along the motion, the longest streak (px),
 * and the longest streak a camera TURN may leave (share of the picture width: a quarter turn is a short sweep, not a whirlpool) */
const LEVELS: Record<BlurLevel, { shutter: number; keep: number; taps: number; max: number; rot: number }> = {
  off: { shutter: 0, keep: 0, taps: 0, max: 0, rot: 0 },
  low: { shutter: 0.025, keep: 0.2, taps: 6, max: 16, rot: 0.015 },
  normal: { shutter: 0.045, keep: 0.33, taps: 10, max: 32, rot: 0.03 },
  heavy: { shutter: 0.08, keep: 0.5, taps: 14, max: 56, rot: 0.06 },
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
uniform vec4 uBodyA[16];
uniform vec4 uBodyB[16];
uniform int uBodyN;
uniform float uDt;
uniform float uMaxBlur;
uniform float uSway;
uniform mat4 uCurVP;
uniform vec3 uTrans;
uniform float uRotK;
uniform float uRotMax;

float hh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float capsule(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float vnoise(float t) { float i = floor(t), f = fract(t); f = f * f * (3.0 - 2.0 * f); return mix(hh(vec2(i, 1.7)), hh(vec2(i + 1.0, 1.7)), f) * 2.0 - 1.0; }

void main() {
  vec2 uv = vUv;
  float P = uPanic, M = uMind;
  vec2 c0 = uv - 0.5;
  // panic: the view breathes in and out a little, and shakes
  if (P > 0.001) {
    float br = 0.5 + 0.5 * sin(uTime * (1.6 + P * 1.4));
    uv = 0.5 + c0 * (1.0 - (P * 0.03 * br + P * 0.012 * uBeat) * uSway);
    uv += vec2(vnoise(uTime * 9.0), vnoise(uTime * 11.0 + 4.0)) * 0.0028 * P * uShake;
  }
  // low mind: straight lines slowly bend
  if (M > 0.001) {
    uv += vec2(sin(uv.y * 5.5 + uTime * 0.41) + sin(uv.y * 2.1 - uTime * 0.23) * 0.6, sin(uv.x * 4.6 - uTime * 0.37) + sin(uv.x * 1.7 + uTime * 0.19) * 0.6) * 0.0035 * M * M * uSway;
  }
  // ---- reproject: where was this pixel last frame (the camera's own motion)
  float dr = texture2D(tDepth, uv).r;
  vec4 wp = uInvVP * vec4(uv * 2.0 - 1.0, dr * 2.0 - 1.0, 1.0);
  wp /= wp.w;
  // a body that moves on its own (the unit the camera follows, a charging inhabitant) moved with its own
  // velocity: where it was is a step back along that, so the unit stays sharp in a tracking shot and a fast
  // inhabitant streaks against a still background
  vec3 W = wp.xyz;
  for (int i = 0; i < 16; i++) {
    if (i >= uBodyN) break;
    vec4 a = uBodyA[i];
    vec2 dxz = W.xz - a.xz;
    if (dot(dxz, dxz) < a.w * a.w && W.y > a.y - 0.15 && W.y < a.y + uBodyB[i].w) { W -= uBodyB[i].xyz * uDt; break; }
  }
  vec4 pc = uPrevVP * vec4(W, 1.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  vec2 mv = (uv - puv) * uRes;                     // pixels this frame
  // the camera's slide alone (this frame's view, last frame's position): pans and tracking keep their full
  // streak; what is left is the turn, which is kept short, capped flat (it eases in and out instead of
  // peaking across the turn) and no longer grows away from the middle of the picture
  vec4 tc = uCurVP * vec4(W + uTrans, 1.0);
  vec2 mvT = (uv - (tc.xy / tc.w * 0.5 + 0.5)) * uRes;
  vec2 mvR = mv - mvT;
  vec2 blur = mvT * uShutterK * (1.0 + P * 0.8);
  float bl = length(blur);
  float bmax = uMaxBlur * (1.0 + P * 0.5);
  if (bl > bmax) blur *= bmax / max(bl, 1e-4);
  vec2 rb = mvR * uShutterK * uRotK;
  float rl = length(rb);
  if (rl > uRotMax) rb *= uRotMax / max(rl, 1e-4);
  blur += rb;
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
    vec2 dv = vec2(sin(uTime * 0.37) + sin(uTime * 0.13) * 0.5, cos(uTime * 0.29) * 0.8) * (2.0 + 7.0 * M) * (0.5 + 0.5 * uSway) / uRes;
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
    float edge = 0.86 - P * 0.26 - uBeat * P * 0.05;
    float tun = smoothstep(edge, edge + 0.42, r);
    col = mix(col, col * vec3(0.24, 0.08, 0.09), tun * (0.4 + 0.4 * P));
  }
  // low mind: a shape at the edge of sight, for a frame: too tall, too thin, arms too long
  if (uHal.x > 0.001) {
    vec2 a = (vUv - uHal.yz) * vec2(uRes.x / uRes.y, 1.0);
    float k = uHal.w;
    a.x += a.y * (k - 0.5) * 0.35;                    // it leans
    float d = length((a - vec2(0.0, 0.105)) / vec2(0.016, 0.022)) - 1.0;
    d *= 0.016;
    d = smin(d, capsule(a, vec2(0.0, 0.085), vec2(0.0, -0.02), 0.015), 0.012);
    d = smin(d, capsule(a, vec2(-0.008, -0.02), vec2(-0.011, -0.18), 0.006), 0.01);
    d = smin(d, capsule(a, vec2(0.008, -0.02), vec2(0.012, -0.18), 0.006), 0.01);
    d = smin(d, capsule(a, vec2(-0.017, 0.07), vec2(-0.03 - k * 0.02, -0.075), 0.0045), 0.01);
    d = smin(d, capsule(a, vec2(0.017, 0.07), vec2(0.032, -0.07 + k * 0.03), 0.0045), 0.01);
    float s = smoothstep(0.006, -0.002, d) * smoothstep(-0.2, -0.08, a.y);   // the feet fade into the ground
    s *= 0.75 + 0.25 * hh(floor(vUv * uRes * 0.5));
    col = mix(col, col * 0.12 + vec3(0.01, 0.008, 0.012), s * uHal.x * 0.85);
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
  private prevB: number[] = [];
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
        uBodyA: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uBodyB: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uBodyN: { value: 0 }, uDt: { value: 1 / 60 }, uMaxBlur: { value: 32 }, uSway: { value: 1 },
        uCurVP: { value: new THREE.Matrix4() }, uTrans: { value: new THREE.Vector3() }, uRotK: { value: 0.22 }, uRotMax: { value: 20 },
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

  /** survivors and creatures (the contact-shadow bodies): each matched to where it was last frame for its velocity */
  private bodies(b: { blobs: THREE.Vector4[]; blobH: Float32Array; blobN: number } | undefined, dt: number) {
    const u = this.mat.uniforms, A = u.uBodyA.value as THREE.Vector4[], B = u.uBodyB.value as THREE.Vector4[];
    const n = b ? Math.min(16, b.blobN) : 0, prev = this.prevB, next: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = b!.blobs[i];
      let best = -1, bd = (1.2 + dt * 14) ** 2;
      for (let j = 0; j < prev.length; j += 4) {
        const dx = p.x - prev[j], dz = p.z - prev[j + 2], d = dx * dx + dz * dz;
        if (d < bd && Math.abs(prev[j + 3] - p.w) < p.w * 0.4 + 0.05) { bd = d; best = j; }
      }
      A[i].set(p.x, p.y, p.z, p.w * 1.8 + 0.1);
      if (best >= 0 && this.hasPrev) B[i].set((p.x - prev[best]) / dt, (p.y - prev[best + 1]) / dt, (p.z - prev[best + 2]) / dt, b!.blobH[i] * 1.08);
      else B[i].set(0, 0, 0, b!.blobH[i] * 1.08);
      next.push(p.x, p.y, p.z, p.w);
    }
    this.prevB = next;
    u.uBodyN.value = n;
  }

  /** forget the history (a cut: zone change, teleport, the eye view toggled) */
  reset() { this.hasPrev = false; }

  /**
   * Run the pass on the composited picture; returns the texture to put on screen. cam: the camera the
   * world was drawn with this frame (its matrices are current).
   */
  run(pass: (m: THREE.ShaderMaterial, rt: THREE.WebGLRenderTarget) => void, color: THREE.Texture, depth: THREE.Texture, cam: THREE.Camera, dt: number,
    focus: THREE.Vector3, bodies?: { blobs: THREE.Vector4[]; blobH: Float32Array; blobN: number }): THREE.Texture {
    const L = LEVELS[this.level];
    this.time += dt;
    // the pass sat idle (blur off, a calm mind): what the history holds is old
    const now = performance.now();
    if (now - this.lastRun > 250) this.hasPrev = false;
    this.lastRun = now;
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    // a jump of the camera (a level change, a teleport, a loop in the suburbs) is a cut, not a smear
    if (this.hasPrev && focus.distanceTo(this.prevPos) > 6) this.hasPrev = false;
    (this.mat.uniforms.uTrans.value as THREE.Vector3).copy(focus).sub(this.prevPos);
    if (!this.hasPrev) (this.mat.uniforms.uTrans.value as THREE.Vector3).set(0, 0, 0);
    this.prevPos.copy(focus);
    const u = this.mat.uniforms;
    u.tCur.value = color; u.tDepth.value = depth;
    u.uInvVP.value.copy(this.vp).invert();
    u.uPrevVP.value.copy(this.hasPrev ? this.prevVP : this.vp);
    u.uRes.value.set(this.W, this.H);
    // the shutter in frames: the same streak at any frame rate
    const fdt = Math.max(1 / 240, Math.min(0.1, dt || 1 / 60));
    this.bodies(bodies, fdt);
    u.uDt.value = fdt;
    u.uMaxBlur.value = Math.max(L.max, 12);
    u.uCurVP.value.copy(this.vp);
    u.uRotMax.value = Math.max(L.rot, 0.01) * this.W;
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
    u.uSway.value = MINDFX.comfort ? 0.4 : 1;
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

// The arrival's cinematic picture for the first-person wall shot. Its scene is
// drawn into a low-res target on the same pixel grid as the world (integer
// upscale, nearest), then composited straight to the screen after the
// renderer's frame:
//   - a black one-pixel outline where depth steps (silhouettes), a lit lip
//     on near creases;
//   - bloom (a bright pass blurred at quarter res, added back) for the jelly's
//     glints, the lamp, the glow; cutscenes may bloom, play may not;
//   - lens: barrel warp, a zoom (radial) blur and a little chromatic split
//     for the moment it pulls you in;
//   - 'inside': the gelatinous dark you pass through (a refracting caustic
//     murk, rising bubbles, the heart pushing the picture, closing to black);
//   - a cold grade, vignette, a whisper of grain, a fade.
import * as THREE from 'three';
import type { PixelRenderer } from '../../gfx/renderer';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = /* glsl */`
precision highp float;
uniform sampler2D tSrc; uniform float uTh; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(min(c, vec3(4.0)) * smoothstep(uTh, uTh * 2.0, l), 1.0);
}`;
const BLUR = /* glsl */`
precision highp float;
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += texture2D(tSrc, vUv + uDir * 1.385).rgb * 0.316;
  s += texture2D(tSrc, vUv - uDir * 1.385).rgb * 0.316;
  s += texture2D(tSrc, vUv + uDir * 3.231).rgb * 0.07;
  s += texture2D(tSrc, vUv - uDir * 3.231).rgb * 0.07;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMP = /* glsl */`
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom;
uniform vec2 uRes; uniform float uScale, uMargin, uNear, uFar, uTime;
uniform float uBloom, uWarp, uZoom, uSplit, uInside, uFade, uVig, uExpo, uFlash, uHeart, uLevels;
uniform vec3 uFlashCol; uniform vec2 uCenter;
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float caustic(vec2 p, float t) {
  float v = 0.0;
  vec2 q = p;
  for (int i = 0; i < 3; i++) {
    q += vec2(sin(q.y * 1.7 + t), cos(q.x * 1.3 - t * 0.8)) * 0.55;
    v += abs(sin(q.x) * sin(q.y));
  }
  return pow(clamp(1.0 - v / 3.0, 0.0, 1.0), 6.0);
}
vec3 tap(vec2 uv) { return texture2D(tColor, (floor(uv * uRes) + 0.5) / uRes).rgb; }
vec3 scene(vec2 uv) {
  vec2 px = floor(uv * uRes);
  vec2 q = (px + 0.5) / uRes;
  vec3 c = texture2D(tColor, q).rgb;
  float dr = texture2D(tDepth, q).r;
  float d = lin(dr);
  vec2 o = 1.0 / uRes;
  float edge = 0.0, crease = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 off = i == 0 ? vec2(0.0, o.y) : i == 1 ? vec2(0.0, -o.y) : i == 2 ? vec2(o.x, 0.0) : vec2(-o.x, 0.0);
    float dn = lin(texture2D(tDepth, q + off).r);
    float dd = dn - d;
    if (dd > 0.035 + d * 0.035) edge = 1.0;
    else if (dd < -0.004 - d * 0.004 && dd > -0.03) crease += 0.25;
  }
  if (dr < 0.99999) {
    if (edge > 0.5) c = vec3(0.004, 0.004, 0.005);
    else c *= 1.0 + min(crease, 1.0) * 0.18;
  }
  return c;
}
void main() {
  // (drawn at the low-res grid itself: one fragment per picture pixel)
  vec2 lp = gl_FragCoord.xy;
  vec2 uv = lp / uRes;
  vec2 cc = uCenter;
  // lens: barrel warp toward the centre (the pull), a heartbeat push
  vec2 dv = uv - cc;
  float r2 = dot(dv * vec2(uRes.x / uRes.y, 1.0), dv * vec2(uRes.x / uRes.y, 1.0));
  vec2 wuv = cc + dv * (1.0 - uWarp * 0.35 + uWarp * r2 * 0.5) * (1.0 - uHeart * 0.012);
  // inside the gel the picture swims
  if (uInside > 0.0) {
    float t = uTime;
    wuv += uInside * 0.02 * vec2(sin(wuv.y * 13.0 + t * 1.7) + sin(wuv.y * 31.0 - t * 2.3) * 0.4, cos(wuv.x * 11.0 - t * 1.3));
  }
  vec3 c = scene(wuv);
  if (uZoom > 0.001 || uSplit > 0.001) {
    vec3 acc = c;
    for (int i = 1; i < 8; i++) {
      float f = float(i) / 7.0;
      vec2 s = cc + (wuv - cc) * (1.0 - uZoom * 0.22 * f);
      acc += vec3(tap(s + (s - cc) * uSplit * 0.02).r, tap(s).g, tap(s - (s - cc) * uSplit * 0.02).b);
    }
    c = acc / 8.0;
  }
  // bloom (soft, quarter res)
  c += texture2D(tBloom, wuv).rgb * uBloom;
  c *= uExpo;
  c += uFlashCol * uFlash;
  // the gelatinous dark
  if (uInside > 0.0) {
    float t = uTime;
    vec2 p = (wuv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float k = caustic(p * 5.0 + vec2(0.0, t * 0.3), t * 0.6 + 7.0);
    vec3 murk = vec3(0.002, 0.007, 0.007) + vec3(0.016, 0.085, 0.08) * k * (0.55 + 0.45 * sin(t * 4.2));
    // a few slanted shafts of the light you came from, bent and sliding away
    float sh = pow(max(0.0, sin(p.x * 2.6 + p.y * 1.3 + sin(p.y * 3.7 + t * 1.3) * 0.5 + t * 0.7)), 24.0);
    murk += vec3(0.03, 0.12, 0.11) * sh * (0.6 + 0.4 * sin(p.y * 5.0 - t * 2.0));
    // bubbles rising past
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      vec2 b = vec2(fract(sin(fi * 37.1) * 431.7) * 1.8 - 0.9, fract(fi * 0.137 + t * (0.18 + fract(fi * 0.71) * 0.25)) * 1.6 - 0.8);
      float rr = 0.008 + fract(fi * 0.53) * 0.02;
      float dd = length((p - b) * vec2(1.0, 0.8));
      murk += vec3(0.08, 0.2, 0.19) * (smoothstep(rr, rr * 0.75, dd) - smoothstep(rr * 0.75, rr * 0.4, dd)) * 0.7;
    }
    // the dark closing in from the edges; the heart pushing light through it
    float close = smoothstep(0.08, 0.6, length(p)) * uInside;
    murk *= (1.0 - close * 0.92) * (0.85 + uHeart * 0.4);
    c = mix(c, murk, smoothstep(0.0, 0.45, uInside));
  }
  vec3 s = toSRGB(c);
  // a cold grade: teal shadows, warm-ish highlights, gentle S-curve
  float y = dot(s, vec3(0.299, 0.587, 0.114));
  s *= mix(vec3(0.86, 0.98, 1.08), vec3(1.06, 1.0, 0.92), smoothstep(0.05, 0.7, y));
  vec3 sc = clamp(s, 0.0, 1.0);
  s = mix(s, sc * sc * (3.0 - 2.0 * sc), 0.28);
  vec2 qv = uv - 0.5;
  float vr = dot(qv * vec2(1.0, 1.2), qv * vec2(1.0, 1.2));
  s *= 1.0 - smoothstep(0.06, 0.45, vr) * uVig;
  s *= 1.0 - uFade;
  s = floor(clamp(s, 0.0, 1.0) * uLevels + 0.5) / uLevels;
  s += (h12(floor(lp) + floor(uTime * 12.0) * 7.31) - 0.5) * 0.008;
  gl_FragColor = vec4(s, 1.0);
}`;

const BLIT = /* glsl */`
precision highp float;
uniform sampler2D tSrc; uniform vec2 uRes; uniform float uScale, uMargin;
void main() {
  vec2 lp = gl_FragCoord.xy / uScale + vec2(uMargin);
  gl_FragColor = vec4(texture2D(tSrc, (floor(lp) + 0.5) / uRes).rgb, 1.0);
}`;

export class CinePass {
  readonly scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  bloom = 0.55; warp = 0; zoom = 0; split = 0; inside = 0; fade = 1; vig = 0.6; expo = 1; flash = 0; heart = 0;
  flashCol = new THREE.Color(0.6, 0.95, 1.0);
  center = new THREE.Vector2(0.5, 0.5);
  enabled = true;
  private rt: THREE.WebGLRenderTarget | null = null;
  private b1: THREE.WebGLRenderTarget | null = null;
  private b2: THREE.WebGLRenderTarget | null = null;
  private out: THREE.WebGLRenderTarget | null = null;
  private comp: THREE.ShaderMaterial;
  private blit: THREE.ShaderMaterial;
  private bright: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private fs = new THREE.Scene();
  private quad: THREE.Mesh;
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private hook = (r: THREE.WebGLRenderer) => this.draw(r);
  private t = 0;

  constructor(private pr: PixelRenderer, fov = 60) {
    this.camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.03, 30);
    this.scene.background = new THREE.Color(0x000000);
    this.comp = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMP, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tBloom: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: 2 }, uMargin: { value: 2 }, uNear: { value: 0.03 }, uFar: { value: 30 }, uTime: { value: 0 },
        uBloom: { value: 1 }, uWarp: { value: 0 }, uZoom: { value: 0 }, uSplit: { value: 0 }, uInside: { value: 0 }, uFade: { value: 1 }, uVig: { value: 0.6 },
        uExpo: { value: 1 }, uFlash: { value: 0 }, uHeart: { value: 0 }, uLevels: { value: 96 }, uFlashCol: { value: new THREE.Vector3(1, 1, 1) }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      },
    });
    this.bright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, uTh: { value: 0.9 } } });
    this.blit = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLIT, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: 2 }, uMargin: { value: 2 } } });
    this.blur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.comp);
    this.quad.frustumCulled = false;
    this.fs.add(this.quad);
    // drawn after everything the renderer's frame put on screen (an intake stage still up included)
    pr.afterRender.push(this.hook);
  }

  /** the picture's aspect and the vertical fov that keeps a landscape view on a portrait phone */
  fit(baseFov: number) {
    const pr = this.pr, W = pr.lowW + pr.margin * 2, H = pr.lowH + pr.margin * 2, asp = W / H;
    const base = THREE.MathUtils.degToRad(baseFov);
    const vf = asp >= 1.2 ? base : Math.min(THREE.MathUtils.degToRad(100), 2 * Math.atan(Math.tan(base / 2) * 1.2 / asp));
    this.camera.fov = THREE.MathUtils.radToDeg(vf);
    this.camera.aspect = asp;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) { this.t += dt; this.flash = Math.max(0, this.flash - dt * 3 * Math.max(0.3, this.flash)); }

  private ensure(W: number, H: number) {
    if (this.rt && this.rt.width === W && this.rt.height === H) return;
    this.rt?.dispose(); this.b1?.dispose(); this.b2?.dispose(); this.out?.dispose();
    this.out = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const depth = new THREE.DepthTexture(W, H);
    depth.type = THREE.FloatType;
    this.rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: depth, type: THREE.HalfFloatType });
    const bw = Math.max(2, Math.ceil(W / 4)), bh = Math.max(2, Math.ceil(H / 4));
    const o = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.HalfFloatType };
    this.b1 = new THREE.WebGLRenderTarget(bw, bh, o);
    this.b2 = new THREE.WebGLRenderTarget(bw, bh, o);
  }

  private pass(r: THREE.WebGLRenderer, m: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = m;
    r.setRenderTarget(to);
    r.render(this.fs, this.fsCam);
  }

  private draw(r: THREE.WebGLRenderer) {
    if (!this.enabled) return;
    const pr = this.pr;
    const W = pr.lowW + pr.margin * 2, H = pr.lowH + pr.margin * 2;
    this.ensure(W, H);
    const rt = this.rt!, b1 = this.b1!, b2 = this.b2!;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const clip = r.localClippingEnabled;
    r.localClippingEnabled = true;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.scene, this.camera);
    r.localClippingEnabled = clip;
    // bloom
    this.bright.uniforms.tSrc.value = rt.texture;
    this.pass(r, this.bright, b1);
    for (let i = 0; i < 2; i++) {
      this.blur.uniforms.tSrc.value = b1.texture; this.blur.uniforms.uDir.value.set(1 / b1.width * (1 + i), 0); this.pass(r, this.blur, b2);
      this.blur.uniforms.tSrc.value = b2.texture; this.blur.uniforms.uDir.value.set(0, 1 / b1.height * (1 + i)); this.pass(r, this.blur, b1);
    }
    r.setClearColor(prevClear, prevAlpha);
    const u = this.comp.uniforms;
    u.tColor.value = rt.texture; u.tDepth.value = rt.depthTexture; u.tBloom.value = b1.texture;
    u.uRes.value.set(W, H); u.uScale.value = pr.scale; u.uMargin.value = pr.margin;
    u.uNear.value = this.camera.near; u.uFar.value = this.camera.far; u.uTime.value = this.t;
    u.uBloom.value = this.bloom; u.uWarp.value = this.warp; u.uZoom.value = this.zoom; u.uSplit.value = this.split; u.uInside.value = this.inside;
    u.uFade.value = Math.min(1, Math.max(0, this.fade)); u.uVig.value = this.vig; u.uExpo.value = this.expo; u.uFlash.value = this.flash; u.uHeart.value = this.heart;
    u.uFlashCol.value.set(this.flashCol.r, this.flashCol.g, this.flashCol.b); u.uCenter.value.copy(this.center);
    this.pass(r, this.comp, this.out);
    const bu = this.blit.uniforms;
    bu.tSrc.value = this.out!.texture; bu.uRes.value.set(W, H); bu.uScale.value = pr.scale; bu.uMargin.value = pr.margin;
    this.pass(r, this.blit, null);
    this.quad.material = this.comp;
  }

  dispose() {
    const i = this.pr.afterRender.indexOf(this.hook);
    if (i >= 0) this.pr.afterRender.splice(i, 1);
    this.rt?.dispose(); this.b1?.dispose(); this.b2?.dispose(); this.out?.dispose();
    this.rt = this.b1 = this.b2 = this.out = null;
    this.comp.dispose(); this.bright.dispose(); this.blur.dispose(); this.blit.dispose();
    this.quad.geometry.dispose();
  }
}

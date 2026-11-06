// The menu rooms' composite (the unit room's own renderer and the menu stage's
// rooms both use it): the scene is rendered into a half-float target near the
// screen's own resolution and composited here, cinematic and physically
// believable rather than a pixel filter. In order: a light lens fringe, an
// FXAA-style edge blend, a gentle unsharp, a soft contact line where depth
// steps, ambient occlusion from depth (creases, under the desks), depth haze
// (the air: dust, a cold cast far off), the cutscenes' bloom off true emitters
// (src/game/introKit/stage.ts) with a warm film halation, the lamps' glow
// scattered in the air, bounce light (the room's own light blurred wide and
// spilled back on every surface, so shadows are never dead), screen-space
// light shafts off the lamps, a filmic curve that keeps saturated colours
// saturated (hue-preserving, blended with ACES), a split grade (cold shadows,
// warm highlights, firm blacks), a darkened side for the 2D menu, a vignette,
// the camera flash, blood on the lens, a whisper of grain and an invisible
// one-level dither against banding.
import * as THREE from 'three';

export interface PostUniforms {
  tColor: { value: THREE.Texture | null }; tDepth: { value: THREE.Texture | null }; tLens: { value: THREE.Texture | null };
  uRes: { value: THREE.Vector2 }; uNear: { value: number }; uFar: { value: number }; uTime: { value: number };
  uFlash: { value: number }; uRed: { value: number }; uExposure: { value: number }; uOutline: { value: number };
  uSide: { value: THREE.Vector4 }; uLift: { value: THREE.Vector3 }; uGain: { value: THREE.Vector3 };
  uSat: { value: number }; uContrast: { value: number }; uFloor: { value: number }; uVig: { value: number }; uGrain: { value: number }; uLensOn: { value: number }; uLevels: { value: number };
  tB1: { value: THREE.Texture }; tB2: { value: THREE.Texture }; tB3: { value: THREE.Texture }; uBloom: { value: number };
  /** unsharp mask strength (0 = off) */
  uSharp: { value: number };
  /** 0..1: how much of the tone curve keeps the hue and saturation (the rest is ACES) */
  uKeepSat: { value: number };
  /** depth haze: rgb colour, a = strength at uFar * 0.25 */
  uHaze: { value: THREE.Vector4 };
  /** warm fringe round the bloom (film halation) */
  uHalation: { value: number };
  /** depth-only ambient occlusion: strength (0 = off) and world radius (m) */
  uAO: { value: number }; uAORad: { value: number };
  /** the camera's focal length in render pixels (uRes.y / (2 tan(fov/2))): sizes the AO kernel */
  uFocal: { value: number };
  /** lit air: the wide bloom levels scattered back into the haze (0 = off) */
  uScatter: { value: number };
  /** lens fringe at the frame's edges (render pixels at the corner) */
  uCA: { value: number };
  /** the whole lit room blurred wide (a Bloom run at a near-zero threshold): bounce light and the shafts' source */
  tFill: { value: THREE.Texture };
  /** bounce: the room's own light spilled back into every surface (0 = off) */
  uBounce: { value: number };
  /** up to three screen-space light shafts: xy = the lamp's uv, z = strength (0 = off), w = reach (0..1) */
  uShaft: { value: THREE.Vector4[] };
  uShaftCol: { value: THREE.Vector3 };
  /** edge anti-aliasing (0 = off): a cheap FXAA-style blend across high-contrast steps */
  uAA: { value: number };
}

const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/**
 * The cutscenes' bloom for the menu scenes: a soft-knee bright pass at half res, then three
 * levels (1/2, 1/4, 1/8) each blurred both ways. Feed the post's tB1..tB3 from `tex`.
 */
export class Bloom {
  /** the three blurred levels (black until the first run) */
  readonly tex: [THREE.Texture, THREE.Texture, THREE.Texture] = [BLACK, BLACK, BLACK];
  /** threshold and knee (linear light, after exposure) */
  thr = 0.8; knee = 0.4;
  private lv: { a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget }[] = [];
  private w = 0; private h = 0;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private bright = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0.8 }, uKnee: { value: 0.4 }, uExposure: { value: 1 } },
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr, uKnee, uExposure; varying vec2 vUv;
      void main() {
        // four taps (a 2x2 box) so single hot pixels don't flicker
        vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
                + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25 * uExposure;
        float l = max(c.r, max(c.g, c.b));
        float k = smoothstep(uThr - uKnee, uThr + uKnee, l);
        gl_FragColor = vec4(min(c * k, vec3(8.0)), 1.0);
      }`,
  });
  private blur = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
        c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
        c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.07;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  private down = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        gl_FragColor = vec4((texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25, 1.0);
      }`,
  });
  constructor() {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }
  private ensure(w: number, h: number) {
    if (w === this.w && h === this.h && this.lv.length) return;
    this.dispose();
    this.w = w; this.h = h;
    for (let i = 0; i < 3; i++) {
      const W = Math.max(1, Math.ceil(w / (2 << i))), H = Math.max(1, Math.ceil(h / (2 << i)));
      const o = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false } as const;
      this.lv.push({ a: new THREE.WebGLRenderTarget(W, H, o), b: new THREE.WebGLRenderTarget(W, H, o) });
    }
    for (let i = 0; i < 3; i++) this.tex[i] = this.lv[i].a.texture;
  }
  private pass(r: THREE.WebGLRenderer, m: THREE.ShaderMaterial, out: THREE.WebGLRenderTarget) { this.quad.material = m; r.setRenderTarget(out); r.render(this.scene, this.cam); }
  private blurBoth(r: THREE.WebGLRenderer, l: { a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget }, sp: number) {
    const u = this.blur.uniforms;
    u.tSrc.value = l.a.texture; u.uDir.value.set(sp / l.a.width, 0); this.pass(r, this.blur, l.b);
    u.tSrc.value = l.b.texture; u.uDir.value.set(0, sp / l.a.height); this.pass(r, this.blur, l.a);
  }
  /** bloom off `src` (the scene's linear half-float colour, w x h); leaves the render target unset */
  run(r: THREE.WebGLRenderer, src: THREE.Texture, w: number, h: number, exposure: number) {
    this.ensure(w, h);
    const b = this.bright.uniforms;
    b.tSrc.value = src; b.uTexel.value.set(1 / w, 1 / h); b.uThr.value = this.thr; b.uKnee.value = this.knee; b.uExposure.value = exposure;
    this.pass(r, this.bright, this.lv[0].a);
    this.blurBoth(r, this.lv[0], 1);
    for (let i = 1; i < 3; i++) {
      const d = this.down.uniforms; d.tSrc.value = this.lv[i - 1].a.texture; d.uTexel.value.set(0.5 / this.lv[i - 1].a.width, 0.5 / this.lv[i - 1].a.height);
      this.pass(r, this.down, this.lv[i].a);
      this.blurBoth(r, this.lv[i], 1.3 + i * 0.4);
    }
    r.setRenderTarget(null);
  }
  dispose() { for (const l of this.lv) { l.a.dispose(); l.b.dispose(); } this.lv = []; this.tex[0] = this.tex[1] = this.tex[2] = BLACK; }
}

export function makePost(): { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial; u: PostUniforms } {
  const u: PostUniforms = {
    tColor: { value: null }, tDepth: { value: null }, tLens: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.05 }, uFar: { value: 40 }, uTime: { value: 0 },
    uFlash: { value: 0 }, uRed: { value: 0 }, uExposure: { value: 1 }, uOutline: { value: 0.3 },
    uSide: { value: new THREE.Vector4(1, 0, 0, 0.4) }, uLift: { value: new THREE.Vector3(0.86, 0.96, 1.14) }, uGain: { value: new THREE.Vector3(1.08, 1.0, 0.86) },
    uSat: { value: 0.9 }, uContrast: { value: 1.08 }, uFloor: { value: 0 }, uVig: { value: 0.9 }, uGrain: { value: 0.01 }, uLensOn: { value: 0 }, uLevels: { value: 255 },
    tB1: { value: BLACK }, tB2: { value: BLACK }, tB3: { value: BLACK }, uBloom: { value: 0 },
    uSharp: { value: 0.08 }, uKeepSat: { value: 0.45 }, uHaze: { value: new THREE.Vector4(0.42, 0.5, 0.62, 0.0) }, uHalation: { value: 0.35 },
    uAO: { value: 0 }, uAORad: { value: 0.32 }, uFocal: { value: 300 }, uScatter: { value: 0 },
    uCA: { value: 0 }, tFill: { value: BLACK }, uBounce: { value: 0 },
    uShaft: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uShaftCol: { value: new THREE.Vector3(1, 0.96, 0.9) }, uAA: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tLens; uniform sampler2D tB1, tB2, tB3; uniform float uBloom;
      uniform vec2 uRes; uniform float uNear, uFar, uTime, uFlash, uRed, uExposure, uOutline, uSat, uContrast, uVig, uGrain, uLensOn, uLevels, uFloor;
      uniform vec4 uSide; uniform vec3 uLift, uGain;
      uniform float uSharp, uKeepSat, uHalation; uniform vec4 uHaze;
      uniform float uAO, uAORad, uFocal, uScatter, uCA, uBounce, uAA; uniform sampler2D tFill; uniform vec4 uShaft[3]; uniform vec3 uShaftCol;
      varying vec2 vUv;
      float linD(vec2 uv) { float z = texture2D(tDepth, uv).x; if (z >= 1.0) return uFar * 4.0; float n = z * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - n * (uFar - uNear)); }
      float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-6)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      void main() {
        vec2 px = 1.0 / uRes;
        vec3 c = texture2D(tColor, vUv).rgb;
        // the lens: red and blue drift apart toward the corners (a pixel or two, never at the centre)
        if (uCA > 0.0) { vec2 ca = (vUv - 0.5) * dot(vUv - 0.5, vUv - 0.5) * 4.0 * uCA * px; c.r = texture2D(tColor, vUv + ca).r; c.b = texture2D(tColor, vUv - ca).b; }
        // anti-aliasing: where the luma steps hard against a neighbour, blend along the step (FXAA-lite)
        if (uAA > 0.0) {
          vec3 cN = texture2D(tColor, vUv + vec2(0.0, px.y)).rgb, cS = texture2D(tColor, vUv - vec2(0.0, px.y)).rgb;
          vec3 cE = texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb, cW = texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb;
          vec3 W3 = vec3(0.299, 0.587, 0.114);
          float lC = dot(c, W3), lN = dot(cN, W3), lS = dot(cS, W3), lE = dot(cE, W3), lW = dot(cW, W3);
          float lo = min(lC, min(min(lN, lS), min(lE, lW))), hi = max(lC, max(max(lN, lS), max(lE, lW)));
          float con = (hi - lo) / max(hi, 0.06);
          float v = abs(lN + lS - 2.0 * lC), hzE = abs(lE + lW - 2.0 * lC);
          vec3 along = hzE > v ? (cN + cS) * 0.5 : (cE + cW) * 0.5;
          c = mix(c, (c + along) * 0.5, smoothstep(0.15, 0.6, con) * uAA);
        }
        // unsharp: the pixel against its four neighbours (crisp detail after the blow-up; clamped so edges never ring)
        vec3 nb = (texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb + texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb + texture2D(tColor, vUv + vec2(0.0, px.y)).rgb + texture2D(tColor, vUv - vec2(0.0, px.y)).rgb) * 0.25;
        c = max(c + clamp(c - nb, vec3(-0.25), vec3(0.25)) * uSharp, vec3(0.0));
        // silhouette: this pixel lies well behind a neighbour -> it is the line round that neighbour
        float d = linD(vUv);
        float dn = min(min(linD(vUv - vec2(px.x, 0.0)), linD(vUv + vec2(px.x, 0.0))), min(linD(vUv - vec2(0.0, px.y)), linD(vUv + vec2(0.0, px.y))));
        float edge = step(0.03 + dn * 0.045, d - dn);
        c *= 1.0 - edge * uOutline;
        // ambient occlusion from depth alone, as creases: pairs of taps either side of the pixel, a fixed world
        // radius apart; on any plane their inverse depths average to this pixel's exactly (so floors and walls at
        // a grazing angle stay clean), and where both lie in front of it the pixel sits in a crease: a corner, a
        // gap between props, the shadowed seam under a desk. A tap a whole object nearer is ignored (no halos).
        float aoK = 1.0;
        if (uAO > 0.0 && d < uFar * 0.9) {
          float rp = clamp(uAORad * uFocal / d, 1.5, 40.0);
          float a0 = bayer4(floor(vUv * uRes)) * 3.1416, occ = 0.0, iz = 1.0 / d;
          for (int i = 0; i < 6; i++) {
            float fi = float(i);
            float an = a0 + fi * 0.5236;
            vec2 o = vec2(cos(an), sin(an)) * rp * (0.35 + 0.65 * fract(fi * 0.618 + 0.2)) * px;
            float d1 = linD(vUv + o), d2 = linD(vUv - o);
            float dz = (0.5 / d1 + 0.5 / d2 - iz) * d * d;
            float near = max(d - d1, d - d2);
            occ += smoothstep(0.01 + 0.004 * d, 0.09 + 0.02 * d, dz) * (1.0 - smoothstep(uAORad * 1.5, uAORad * 3.5, near));
          }
          aoK = 1.0 - clamp(occ / 6.0 * uAO * 1.4, 0.0, 0.85);
          c *= aoK;
        }
        // the air in the room: far things sink into a cold, dusty haze (never black)
        float hz = uHaze.a * smoothstep(uNear * 6.0, uFar * 0.25, d) * step(d, uFar * 3.0);
        c = mix(c, uHaze.rgb * (0.04 + 0.1 * dot(c, vec3(0.33))), hz);
        // the side the 2D menu sits on goes darker
        float s = dot(vUv, uSide.xy) + (uSide.x < 0.0 || uSide.y < 0.0 ? 1.0 : 0.0);
        c *= 1.0 - uSide.z * (1.0 - smoothstep(0.0, uSide.w, s));
        c *= 1.0 - uFloor * (1.0 - smoothstep(0.0, 0.38, vUv.y));
        // exposure, the cutscenes' bloom (soft levels over the sharp pixels), filmic curve, split grade
        c *= uExposure;
        vec3 b1 = texture2D(tB1, vUv).rgb, b2 = texture2D(tB2, vUv).rgb, b3 = texture2D(tB3, vUv).rgb;
        // the wide levels carry a warm fringe (film halation); the tight one stays the emitter's own colour
        vec3 bl = b1 * 0.55 + (b2 * 0.45 + b3 * 0.4) * mix(vec3(1.0), vec3(1.25, 0.82, 0.62), uHalation);
        c += bl * uBloom;
        // lit air: the lamps' wide glow hangs in the dust between the camera and whatever is far off
        c += (b3 * 0.7 + b2 * 0.3) * uScatter * (0.35 + 0.65 * smoothstep(uNear * 4.0, uFar * 0.3, min(d, uFar)));
        // bounce: the room's light, blurred wide, falls back onto everything (less in the creases); shadows never go dead
        vec3 fill = texture2D(tFill, vUv).rgb;
        c += fill * uBounce * uExposure * (0.4 + 0.6 * aoK);
        // light shafts: march toward each lamp through the blurred light; what stands before the lamp breaks the rays
        for (int k = 0; k < 3; k++) {
          vec4 sh = uShaft[k];
          if (sh.z <= 0.0) continue;
          vec2 dv = sh.xy - vUv; float dl = length(dv);
          vec2 dir = dv / max(dl, 1e-4) * min(dl, 0.45) * sh.w / 12.0;
          vec2 sp = vUv + dir * bayer4(floor(vUv * uRes) * 0.5);
          float wt = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < 12; i++) { sp += dir; vec3 f = texture2D(tFill, sp).rgb; acc += max(f - vec3(0.35), vec3(0.0)) * wt; wt *= 0.88; }
          float fall = 1.0 - smoothstep(0.0, 0.6, length(dv * vec2(uRes.x / uRes.y, 1.0)));
          c += acc / 12.0 * sh.z * fall * uShaftCol * uExposure;
        }
        // tone: ACES for the roll-off, blended with a hue-preserving curve on luminance so saturated lamps and screens keep their colour
        float lin = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
        vec3 keep = c * (aces(vec3(lin)).r / lin);
        keep = keep / max(1.0, max(keep.r, max(keep.g, keep.b)));
        c = mix(aces(c), keep, uKeepSat);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        c *= mix(uLift, uGain, smoothstep(0.02, 0.5, l));
        c = clamp((c - 0.18) * uContrast + 0.18, 0.0, 1.0);
        // firm blacks, not mud: a soft toe instead of a hard crush
        c = c * c / (c + 0.012) * 1.012;
        vec2 q = vUv - 0.5;
        c *= clamp(1.0 - dot(q, q) * uVig, 0.0, 1.0);
        c = toSRGB(c);
        if (uLensOn > 0.5) { vec4 lb = texture2D(tLens, vUv); c = mix(c, lb.rgb, lb.a); }
        c = mix(c, vec3(1.0, 0.97, 0.92), clamp(uFlash, 0.0, 1.0));
        c = mix(c, c * vec3(1.5, 0.3, 0.25) + vec3(0.1, 0.0, 0.0), clamp(uRed, 0.0, 1.0) * 0.45);
        // grain, then light ordered dither to a reduced palette
        vec2 ip = floor(vUv * uRes);
        c += (hash(ip + floor(uTime * 12.0) * 7.0) - 0.5) * uGrain;
        // 8-bit with an ordered dither of one level (no banding in the haze, no visible pattern); fades out at black
        float dk = smoothstep(0.5 / uLevels, 2.5 / uLevels, max(c.r, max(c.g, c.b)));
        c = floor(c * uLevels + mix(0.5, bayer4(ip), dk)) / uLevels;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  return { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat, u };
}

/** blood on the lens, painted in pixels at the render's own resolution */
export class LensBlood {
  canvas = document.createElement('canvas');
  tex: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private drops: { x: number; y: number; r: number; pts: number[]; run: number; speed: number; t: number; life: number; c: [number, number, number] }[] = [];
  constructor() {
    this.canvas.width = 4; this.canvas.height = 4;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
  }
  get active() { return this.drops.length > 0; }
  resize(w: number, h: number) { if (this.canvas.width === w && this.canvas.height === h) return; this.canvas.width = w; this.canvas.height = h; this.tex.dispose(); this.tex = new THREE.CanvasTexture(this.canvas); this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; }
  /** n drops (blood, or another colour: paint, serum) */
  splat(n: number, color = -1) {
    const W = this.canvas.width, H = this.canvas.height;
    const c: [number, number, number] = color < 0 ? [118, 10, 10] : [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    for (let i = 0; i < n; i++) {
      const r = (0.012 + Math.random() * 0.045) * H;
      const k = 10 + Math.floor(Math.random() * 6), pts: number[] = [];
      for (let j = 0; j < k; j++) pts.push(0.55 + Math.random() * 0.6 + (Math.random() < 0.2 ? 0.5 : 0));
      const x = Math.random() * W, y = Math.random() * H * 0.85;
      this.drops.push({ x, y, r, pts, run: 0, speed: 3 + Math.random() * 12, t: 0, life: 4 + Math.random() * 2.5, c });
      // satellites flung off the main drop
      for (let s = 0; s < 3; s++) {
        const a = Math.random() * Math.PI * 2, d = r * (1.4 + Math.random() * 1.6), rr = r * (0.12 + Math.random() * 0.2);
        this.drops.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: rr, pts: [1, 0.8, 1.1, 0.9, 1, 0.85], run: 0, speed: 0, t: 0, life: 4 + Math.random() * 2, c });
      }
    }
  }
  /** returns true when the texture changed */
  update(dt: number): boolean {
    if (!this.drops.length) return false;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt; d.run += d.speed * dt * Math.max(0, 1 - d.t / d.life);
      if (d.t > d.life) { this.drops.splice(i, 1); continue; }
      const a = Math.min(1, (d.life - d.t) / 1.2) * 0.85;
      const poly = (x: number, y: number, r: number, col: string) => {
        c.fillStyle = col; c.beginPath();
        d.pts.forEach((m, j) => { const an = (j / d.pts.length) * Math.PI * 2; const X = Math.round(x + Math.cos(an) * r * m), Y = Math.round(y + Math.sin(an) * r * m * 0.9); if (j) c.lineTo(X, Y); else c.moveTo(X, Y); });
        c.closePath(); c.fill();
      };
      const [cr, cg, cb] = d.c;
      const rgb = (k: number) => `rgba(${Math.round(cr * k)},${Math.round(cg * k)},${Math.round(cb * k)},${a})`;
      poly(d.x, d.y, d.r, rgb(0.6));
      poly(d.x, d.y - d.r * 0.08, d.r * 0.78, rgb(1));
      // the run down the glass
      c.fillStyle = rgb(0.82);
      c.fillRect(Math.round(d.x - d.r * 0.18), Math.round(d.y), Math.max(1, Math.round(d.r * 0.3)), Math.round(d.run));
      c.fillRect(Math.round(d.x - d.r * 0.24), Math.round(d.y + d.run - 2), Math.max(2, Math.round(d.r * 0.42)), 3);
      // a hard wet highlight
      c.fillStyle = `rgba(${Math.min(255, cr + 120)},${Math.min(255, cg + 140)},${Math.min(255, cb + 140)},${a * 0.8})`;
      c.fillRect(Math.round(d.x - d.r * 0.35), Math.round(d.y - d.r * 0.4), Math.max(1, Math.round(d.r * 0.18)), Math.max(1, Math.round(d.r * 0.12)));
    }
    // hard edges: no soft alpha
    const img = c.getImageData(0, 0, W, H), D = img.data;
    for (let i = 3; i < D.length; i += 4) if (D[i]) D[i] = D[i] > 60 ? Math.min(220, D[i] + 40) : 0;
    c.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
    return true;
  }
  clear() { this.drops = []; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.tex.needsUpdate = true; }
  dispose() { this.tex.dispose(); }
}

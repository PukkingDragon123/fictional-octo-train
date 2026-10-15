import * as THREE from 'three';
import { U } from './materials';
import { FxQuality, ZoneFx } from './fxconfig';

/**
 * Realism passes for the pixel renderer. All of them run at (or below) the
 * low internal resolution and are composited before the grade and the
 * ordered-dither quantise, so they come out as chunky pixel art:
 *  - SSAO + soft contact (blob) shadows from the depth / normal MRT buffers
 *  - bloom on bright emissive pixels and light sources (+ lens dirt)
 *  - volumetric light: haze lit by the zone light grid (columns under
 *    fixtures, skylight shafts), the flashlight cone and sun shafts, both
 *    tested against their shadow maps on high quality
 *  - screen-space reflections on wet / glossy floors (gNormal alpha packs
 *    the wet level written by the floor material)
 *  - an exponential ground-mist layer, dust motes in beams, film grain
 */

export const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** camera basis shared by every pass (updated once per frame by the renderer) */
export const CAMU = {
  uCamPos: { value: new THREE.Vector3() },
  uCamR: { value: new THREE.Vector3(1, 0, 0) },
  uCamU: { value: new THREE.Vector3(0, 1, 0) },
  uCamF: { value: new THREE.Vector3(0, 0, -1) },
  uHalf: { value: new THREE.Vector2(10, 10) },
  uNear: { value: 0.1 },
  uFar: { value: 160 },
  /** metres per low-res pixel */
  uPxM: { value: 1 / 32 },
  uSinPitch: { value: Math.sin(THREE.MathUtils.degToRad(36)) },
  /** floor height under the camera focus (player) */
  uFloorY: { value: 0 },
};

/** flashlight cone shared by the haze march and the motes */
export const SPOTU = {
  uSpotOn: { value: 0 },
  uSpotPos: { value: new THREE.Vector3() },
  uSpotDir: { value: new THREE.Vector3(1, 0, 0) },
  uSpotCos: { value: new THREE.Vector2(0.88, 0.95) },
  uSpotRange: { value: 18 },
  uSpotCol: { value: new THREE.Color(0xffffff) },
  uSpotMat: { value: new THREE.Matrix4() },
  tSpotShadow: { value: null as THREE.Texture | null },
  uSpotShadowOn: { value: 0 },
  uSunOn: { value: 0 },
  uSunCol: { value: new THREE.Color(0xffffff) },
  uSunMat: { value: new THREE.Matrix4() },
  tSunShadow: { value: null as THREE.Texture | null },
};

const COMMON = /* glsl */`
precision highp float;
uniform vec3 uCamPos;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform vec2 uHalf;
uniform float uNear;
uniform float uFar;
uniform float uPxM;
uniform float uSinPitch;
uniform float uFloorY;
varying vec2 vUv;
float lin(float d) { return uNear + d * (uFar - uNear); }
vec3 wpos(vec2 uv, float ld) { return uCamPos + uCamR * ((uv.x * 2.0 - 1.0) * uHalf.x) + uCamU * ((uv.y * 2.0 - 1.0) * uHalf.y) + uCamF * ld; }
vec2 toUv(vec3 p, out float ld) { vec3 r = p - uCamPos; ld = dot(r, uCamF); return vec2(dot(r, uCamR) / uHalf.x, dot(r, uCamU) / uHalf.y) * 0.5 + 0.5; }
/** where the view ray through uv meets the horizontal plane y */
vec3 onPlane(vec2 uv, float y) { vec3 b = wpos(uv, 0.0); return b + uCamF * ((y - b.y) / uCamF.y); }
float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  int i = ip.y * 4 + ip.x;
  int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
  return (float(m[i]) + 0.5) / 16.0;
}
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
/** gNormal alpha: outline flag + 2 x wet level + 16 x water */
vec3 unpackFlags(float a) {
  a += 0.01;
  float water = step(16.0, a); a -= 16.0 * water;
  float wq = floor(a * 0.5);
  return vec3(a - 0.01 - 2.0 * wq, wq / 7.0, water);
}
`;

// ---------------------------------------------------------------- SSAO + blob contact shadows
const AO_FRAG = COMMON + /* glsl */`
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform float uRadius;
uniform float uStrength;
uniform vec4 uBlobs[16];
uniform int uBlobN;
uniform float uBlobStr;
void main() {
  float dr = texture2D(tDepth, vUv).r;
  if (dr >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  float ld = lin(dr);
  vec3 P = wpos(vUv, ld);
  vec3 N = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  float nl = length(N);
  if (nl < 0.5) { gl_FragColor = vec4(1.0); return; }
  N /= nl;
  float ao = 1.0;
#if AO_N > 0
  vec3 T = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 B = cross(N, T);
  float ang = bayer4(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  float occ = 0.0;
  for (int i = 0; i < AO_N; i++) {
    float fi = (float(i) + 0.5) / float(AO_N);
    float r = sqrt(fi);
    float ph = float(i) * 2.399963;
    vec2 k = vec2(cos(ph), sin(ph)) * r;
    k = vec2(k.x * ca - k.y * sa, k.x * sa + k.y * ca);
    float kz = sqrt(max(0.0, 1.0 - r * r)) + 0.12;
    float sc = uRadius * mix(0.25, 1.0, fi * fi);
    vec3 S = P + (T * k.x + B * k.y + N * kz) * sc;
    float sd;
    vec2 su = toUv(S, sd);
    float bd = lin(texture2D(tDepth, su).r);
    float diff = sd - bd;
    occ += step(0.02, diff) * (1.0 - smoothstep(uRadius * 0.8, uRadius * 2.0, diff));
  }
  ao = 1.0 - clamp(occ / float(AO_N) * uStrength * 1.5, 0.0, 0.85);
#endif
  // soft contact shadows pooled under bodies
  if (N.y > 0.55 && uBlobN > 0) {
    for (int i = 0; i < 16; i++) {
      if (i >= uBlobN) break;
      vec4 b = uBlobs[i];
      float above = b.y - P.y;
      if (above < -0.3 || above > 3.0) continue;
      float rr = b.w * (1.0 + max(above, 0.0) * 0.4);
      float s = 1.0 - smoothstep(rr * 0.3, rr * 1.2, length(P.xz - b.xz));
      s *= 1.0 - clamp(above / 3.0, 0.0, 1.0) * 0.8;
      ao *= 1.0 - s * uBlobStr;
    }
  }
  gl_FragColor = vec4(ao, 0.0, 0.0, 1.0);
}
`;

const AO_BLUR_FRAG = COMMON + /* glsl */`
uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2 uTexel;
void main() {
  float c = lin(texture2D(tDepth, vUv).r);
  float s = 0.0, w = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 o = (vec2(float(x), float(y)) - 1.5) * uTexel;
    float a = texture2D(tAO, vUv + o).r;
    float dd = lin(texture2D(tDepth, vUv + o).r);
    float ww = 1.0 / (1.0 + abs(dd - c) * 6.0);
    s += a * ww; w += ww;
  }
  gl_FragColor = vec4(s / w, 0.0, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------- bloom (dual filter)
const BRIGHT_FRAG = COMMON + /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform vec2 uSrcTexel;
uniform float uTh;
void main() {
  vec3 c = vec3(0.0);
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec2 o = (vec2(float(x), float(y)) - 0.5) * uSrcTexel;
    c += texture2D(tColor, vUv + o).rgb;
  }
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float knee = uTh * 0.5;
  float soft = clamp(br - uTh + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float k = max(soft, br - uTh) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * k, vec3(6.0)), 1.0);
}
`;

const DOWN_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform sampler2D tAdd;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-2.0, 0.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * h).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, 2.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(1.0, 1.0) * h).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(2.0, 0.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(1.0, -1.0) * h).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -2.0) * h).rgb;
  c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * h).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}
`;

// ---------------------------------------------------------------- volumetric light (half res)
const LIGHT_PARS = /* glsl */`
uniform sampler2D uLightTex;
uniform vec4 uLightInfo;
uniform float uGridScale;
uniform sampler2D uVisTex;
uniform vec4 uVisInfo;
uniform float uVisOn;
uniform vec3 uPlayerPos;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSpotOn;
uniform vec3 uSpotPos;
uniform vec3 uSpotDir;
uniform vec2 uSpotCos;
uniform float uSpotRange;
uniform vec3 uSpotCol;
vec3 gridAt(vec2 xz) { vec3 g = texture2D(uLightTex, (xz - uLightInfo.xy) * uLightInfo.zw).rgb; return g * g * uGridScale; }
float spotCone(vec3 p) {
  vec3 v = p - uSpotPos;
  float dist = length(v);
  float ca = dot(v, uSpotDir) / max(dist, 1e-3);
  float a = smoothstep(uSpotCos.x, uSpotCos.y, ca);
  float f = clamp(1.0 - dist / uSpotRange, 0.0, 1.0);
  return a * f * f * smoothstep(0.15, 0.6, dist);
}
float visAt(vec2 xz) {
  if (uVisOn < 0.5) return 1.0;
  vec2 v = texture2D(uVisTex, (xz - uVisInfo.xy) * uVisInfo.zw).rg;
  return mix(0.12 + 0.18 * v.g, 1.0, v.r);
}
`;

const VOL_FRAG = COMMON + LIGHT_PARS + /* glsl */`
uniform sampler2D tDepth;
uniform float uDens;
uniform float uFall;
uniform float uTop;
uniform float uGridMul;
uniform float uSpotMul;
uniform vec3 uHaze;
uniform float uSunOn;
uniform vec3 uSunCol;
uniform float uSunMul;
#ifdef VOL_SHADOWS
uniform sampler2DShadow tSpotShadow;
uniform mat4 uSpotMat;
uniform float uSpotShadowOn;
uniform sampler2DShadow tSunShadow;
uniform mat4 uSunMat;
float spotShadow(vec3 p) {
  if (uSpotShadowOn < 0.5) return 1.0;
  vec4 sc = uSpotMat * vec4(p, 1.0);
  sc.xyz /= sc.w;
  if (sc.w <= 0.0 || sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  return texture(tSpotShadow, vec3(sc.xy, sc.z - 0.002));
}
float sunShadow(vec3 p) {
  vec4 sc = uSunMat * vec4(p, 1.0);
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  return texture(tSunShadow, vec3(sc.xy, sc.z - 0.003));
}
#endif
void main() {
  float dr = texture2D(tDepth, vUv).r;
  vec3 P0 = dr >= 0.99999 ? onPlane(vUv, uFloorY) : wpos(vUv, lin(dr));
  vec3 D = -uCamF;
  float top = uFloorY + uTop;
  float tmax = (top - P0.y) / max(D.y, 0.05);
  if (tmax <= 0.0) { gl_FragColor = vec4(0.0); return; }
  tmax = min(tmax, 16.0);
  float stepL = tmax / float(VOL_N);
  float j = bayer4(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < VOL_N; i++) {
    float t = (float(i) + j) * stepL;
    vec3 P = P0 + D * t;
    float h = max(P.y - uFloorY, 0.0);
    float dens = uDens * exp(-h * uFall);
    vec3 gl = gridAt(P.xz);
    vec3 L = gl * min(gl * 0.8, vec3(1.6)) * uGridMul * uHaze;
    if (uSpotOn > 0.5) {
      float cone = spotCone(P);
      if (cone > 0.002) {
#ifdef VOL_SHADOWS
        cone *= spotShadow(P);
#endif
        L += uSpotCol * cone * uSpotMul;
      }
    }
#ifdef VOL_SHADOWS
    if (uSunOn > 0.0) L += uSunCol * (sunShadow(P) * uSunOn * uSunMul * 0.35);
#endif
    acc += L * dens * stepL;
  }
  float fogF = smoothstep(uFogNear, uFogFar, length(P0.xz - uPlayerPos.xz));
  vec3 Pm = P0 + D * (tmax * 0.5);
  float vis = max(visAt(P0.xz + vec2(0.001)), visAt(Pm.xz));
  gl_FragColor = vec4(acc * (1.0 - fogF) * vis * (dr >= 0.99999 ? 0.35 : 1.0), 1.0);
}
`;

// ---------------------------------------------------------------- composite (outline, AO, SSR, haze, mist, bloom, grade, dither)
export const POST_FRAG = COMMON + LIGHT_PARS + /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform sampler2D tVol;
uniform sampler2D tBloom;
uniform sampler2D tBloomWide;
uniform sampler2D tDirt;
uniform vec2 uRes;
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
uniform float uAOStr;
uniform float uBloomStr;
uniform float uDirtStr;
uniform float uReflect;
uniform vec3 uMistCol;
uniform float uMistDens;
uniform float uMistFall;
uniform float uMistLit;
uniform float uMistMax;
uniform float uMotes;
uniform float uSick;
uniform float uFlicker;
uniform float uFilm;
uniform vec3 uVoid;
uniform float uSunOn;
uniform vec3 uSunCol;
uniform vec2 uSunDir2;
uniform float uSunGlow;

vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

#if SSR_N > 0
vec4 traceReflection(vec2 uv, float ld, vec3 N) {
  vec3 R = reflect(uCamF, N);
  vec2 duv = vec2(dot(R, uCamR) / uHalf.x, dot(R, uCamU) / uHalf.y) * 0.5;
  float dld = dot(R, uCamF);
  float t = 0.0;
  float j = bayer4(gl_FragCoord.xy) * 0.06;
  for (int i = 0; i < SSR_N; i++) {
    t += 0.06 + t * 0.14 + j;
    vec2 su = uv + duv * t;
    if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) break;
    float rd = ld + dld * t;
    float bd = lin(texture2D(tDepth, su).r);
    float dz = rd - bd;
    if (dz > 0.02 && dz < 0.3 + t * 0.12) {
      vec2 e = min(su, 1.0 - su);
      float fade = smoothstep(0.0, 0.08, min(e.x, e.y)) * (1.0 - float(i) / float(SSR_N));
      return vec4(texture2D(tColor, su).rgb, fade);
    }
  }
  return vec4(0.0);
}
#endif

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
  vec3 fl = unpackFlags(nA.a);
  vec3 n = nA.xyz * 2.0 - 1.0;
  float dRaw = texture2D(tDepth, uv).r;
  float d = lin(dRaw);
  bool isVoid = dRaw >= 0.99999;
  vec3 P = isVoid ? onPlane(uv, uFloorY) : wpos(uv, d);

  // --- reflections on wet and polished floors ---
#if SSR_N > 0
  if (fl.y > 0.01 && n.y > 0.7 && !isVoid) {
    vec3 N = vec3(0.0, 1.0, 0.0);
    if (fl.z > 0.5) N = normalize(vec3(sin(P.x * 3.1 + uTime * 1.7) * 0.05 + sin(P.z * 5.3 - uTime * 2.3) * 0.03, 1.0, cos(P.z * 2.7 + uTime * 1.3) * 0.05 + sin(P.x * 4.7 + uTime * 2.1) * 0.03));
    vec4 rf = traceReflection(uv, d, N);
    float k = fl.y * uReflect * (fl.z > 0.5 ? 0.55 : 0.4) * rf.a;
    c = c * (1.0 - k * 0.7) + rf.rgb * k * 0.85;
#ifdef DEBUG_VIEW
    if (DEBUG_VIEW == 6) { gl_FragColor = vec4(rf.rgb * rf.a + vec3(0.0, 0.0, 0.15), 1.0); return; }
#endif
  }
#endif

  // --- ambient occlusion + contact shadows ---
#ifdef AO_ON
  bool hlPx = abs(fl.x - 0.5) < 0.1;
  if (!hlPx) {
    float ao = texture2D(tAO, uv).r;
    float bright = clamp(max(c.r, max(c.g, c.b)) - 1.0, 0.0, 1.0);
    c *= mix(1.0, ao, uAOStr * (1.0 - bright));
  }
#endif

  // --- outlines ---
  vec2 offs[4] = vec2[4](vec2(0.0, px.y), vec2(0.0, -px.y), vec2(px.x, 0.0), vec2(-px.x, 0.0));
  float depthEdge = 0.0;
  float normalEdge = 0.0;
  float hlEdge = 0.0;
  bool isHl = abs(fl.x - 0.5) < 0.1;
  for (int i = 0; i < 4; i++) {
    vec2 o = uv + offs[i];
    float dn = lin(texture2D(tDepth, o).r);
    vec4 nb = texture2D(tNormal, o);
    float nbFlag = unpackFlags(nb.a).x;
    float dd = dn - d;
    if (dd > 0.14 + d * 0.004) depthEdge = 1.0;
    vec3 nn = nb.xyz * 2.0 - 1.0;
    if (abs(dd) < 0.25) {
      float ne = clamp(dot(n - nn, vec3(0.55, 0.9, 0.45)), 0.0, 1.0);
      normalEdge += ne * step(-0.01, dd);
    }
    bool nbHl = abs(nbFlag - 0.5) < 0.1;
    if (nbHl && !isHl) hlEdge = 1.0;
  }
  float outlineable = step(0.25, fl.x);
  normalEdge = clamp(normalEdge, 0.0, 1.0) * outlineable;
  if (depthEdge > 0.5 && outlineable > 0.5) c *= (1.0 - 0.55 * uOutline);
  else c *= 1.0 + normalEdge * uEdgeLight;
  if (isHl) c = c * 1.18 + uHighlight * 0.06;
  if (hlEdge > 0.5) c = mix(c, uHighlight, 0.85);

  // --- ground mist, lit by what's around it ---
#ifdef MIST_ON
  if (!isVoid && uMistDens > 0.0) {
    float h0 = max(P.y - uFloorY, 0.0);
    float od = uMistDens * exp(-h0 * uMistFall) / (uMistFall * uSinPitch);
    float m = min(1.0 - exp(-od), uMistMax);
    vec3 lg = gridAt(P.xz);
    vec3 mc = uMistCol * (0.07 + uMistLit * min(lg, vec3(2.5)) * 0.55);
    float fogF = smoothstep(uFogNear, uFogFar, length(P.xz - uPlayerPos.xz));
    m *= visAt(P.xz) * (1.0 - fogF * 0.6);
    c = mix(c, mc, m);
  }
#endif

  // --- volumetric light (haze, cones, shafts) ---
#ifdef VOL_ON
  c += texture2D(tVol, vUv).rgb;
#endif

  // --- dust motes drifting in the beams ---
#ifdef MOTES_ON
  if (uMotes > 0.0) {
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float hy = uFloorY + 0.45 + fk * 0.7;
      vec3 Q = onPlane(uv, hy);
      float tq = dot(Q - uCamPos, uCamF);
      if (!isVoid && tq > d) continue;
      vec2 g = Q.xz * 2.1 + vec2(uTime * 0.05, uTime * 0.035) * (1.0 + fk * 0.5) + fk * 17.3;
      vec2 id = floor(g);
      float hs = h12(id + fk * 31.0);
      if (hs < 0.8) continue;
      vec2 mp = vec2(h12(id + 3.1), h12(id + 7.7)) * 0.8 + 0.1 + vec2(sin(uTime * 0.8 + hs * 40.0), cos(uTime * 0.6 + hs * 30.0)) * 0.07;
      vec2 dl = (fract(g) - mp) / 2.1;
      vec3 d3 = vec3(dl.x, 0.0, dl.y);
      float dpx = length(vec2(dot(d3, uCamR), dot(d3, uCamU))) / uPxM;
      if (dpx > 0.75) continue;
      vec3 L = gridAt(Q.xz);
      if (uSpotOn > 0.5) L += uSpotCol * spotCone(Q) * 2.5;
      if (uSunOn > 0.0) L += uSunCol * 0.45;
      float lum = dot(L, vec3(0.3, 0.5, 0.2));
      float tw = 0.55 + 0.45 * sin(uTime * 2.3 + hs * 60.0);
      c += L * smoothstep(0.35, 1.6, lum) * uMotes * tw * 0.4 * visAt(Q.xz);
    }
  }
#endif

  // --- low sun: warm scattering toward the sun's side of the frame ---
  if (uSunGlow > 0.0 && uSunOn > 0.0) {
    float sg = clamp(dot(vUv - 0.5, uSunDir2) * 1.1 + 0.45, 0.0, 1.0);
    c += uSunCol * (sg * sg * uSunGlow * 0.09);
  }

  // --- bloom + lens dirt ---
#ifdef BLOOM_ON
  vec3 bl = texture2D(tBloom, vUv).rgb;
  c += bl * uBloomStr;
#ifdef DIRT_ON
  c += texture2D(tDirt, vUv).rgb * texture2D(tBloomWide, vUv).rgb * uDirtStr;
#endif
#endif

#ifdef DEBUG_VIEW
  // dev: 1 AO, 2 wet / water / outline flags, 3 haze, 4 bloom, 5 normals
  if (DEBUG_VIEW == 1) c = vec3(texture2D(tAO, uv).r);
  if (DEBUG_VIEW == 2) c = vec3(fl.y, fl.z, fl.x * 0.5);
  if (DEBUG_VIEW == 3) c = texture2D(tVol, vUv).rgb * 4.0;
  if (DEBUG_VIEW == 4) c = texture2D(tBloom, vUv).rgb;
  if (DEBUG_VIEW == 5) c = n * 0.5 + 0.5;
  gl_FragColor = vec4(c, 1.0);
  return;
#endif
  // --- grading (in display space) ---
  c = toSRGB(c);
  c = max(c * uGain + uLift, 0.0);
  c = pow(c, vec3(1.0 / uGamma));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat * (1.0 - uDesat));
  c *= uTint;
  // fluorescent sickness: olive shadows and the faint flutter of old tubes
  if (uSick > 0.001) {
    c = mix(c, c * vec3(0.93, 1.03, 0.78), uSick * 0.6 * (1.0 - clamp(l * 1.4, 0.0, 1.0)));
    float fl2 = step(0.972, h12(vec2(floor(uTime * 16.0), 3.7))) * 0.04 + sin(uTime * 113.0) * 0.004;
    c *= 1.0 - fl2 * uSick * uFlicker;
  }
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
  // --- film grain: per low-res pixel, at film cadence, strongest in the mid tones ---
  float gl2 = dot(c, vec3(0.299, 0.587, 0.114));
  float gw = 0.55 + 1.8 * gl2 * (1.0 - gl2);
  c += (h12(floor(vUv * uRes) + floor(uTime * 24.0) * 7.31) - 0.5) * uGrain * gw * uFilm;
  // --- quantise with ordered dither (15-bit-ish PS1 palette) ---
  float b = bayer4(gl_FragCoord.xy);
  c = floor(c * uLevels + b) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}
`;

/** procedural lens dirt: soft smudges, a few fingerprints' worth of arcs, fine specks */
function makeDirt(): THREE.DataTexture {
  const W = 192, H = 108;
  const d = new Uint8Array(W * H * 4);
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  const f = new Float32Array(W * H);
  const blob = (cx: number, cy: number, r: number, a: number) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, Math.ceil(cx + r)); x++) {
      const k = 1 - Math.hypot(x - cx, (y - cy) * 1.1) / r;
      if (k > 0) f[y * W + x] += a * k * k;
    }
  };
  for (let i = 0; i < 26; i++) blob(rnd() * W, rnd() * H, 8 + rnd() * 26, 0.12 + rnd() * 0.25);
  for (let i = 0; i < 4; i++) {
    const cx = rnd() * W, cy = rnd() * H, r = 10 + rnd() * 14;
    for (let a = 0; a < 6.28; a += 0.04) blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 1.6, 0.1);
  }
  for (let i = 0; i < 160; i++) blob(rnd() * W, rnd() * H, 0.8 + rnd() * 1.8, 0.4 + rnd() * 0.6);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    // dirt reads more toward the frame edges
    const e = Math.min(1, 0.45 + Math.hypot(x / W - 0.5, y / H - 0.5) * 1.4);
    const v = Math.min(1, f[i] * e);
    d[i * 4] = v * 255; d[i * 4 + 1] = v * 240; d[i * 4 + 2] = v * 215; d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const rtOpts = (linear: boolean, half: boolean): THREE.RenderTargetOptions => ({
  minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
  magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
  depthBuffer: false,
  type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
  generateMipmaps: false,
});

export interface FxInputs {
  color: THREE.Texture;
  normal: THREE.Texture;
  depth: THREE.Texture;
}

/**
 * Owns the extra low-res targets and materials. The renderer calls run()
 * between the scene pass and the composite, then binds composite uniforms.
 */
export class PostFX {
  q!: FxQuality;
  zone!: ZoneFx;
  /** bodies for contact shadows: x, base y, z, radius */
  blobs: THREE.Vector4[] = Array.from({ length: 16 }, () => new THREE.Vector4());
  blobN = 0;
  /** photo mode / debug: skip all realism passes */
  bypass = false;
  readonly dirt = makeDirt();

  private W = 0; private H = 0;
  private rtAO: THREE.WebGLRenderTarget | null = null;
  private rtAO2: THREE.WebGLRenderTarget | null = null;
  private rtB: THREE.WebGLRenderTarget[] = [];
  private rtU: THREE.WebGLRenderTarget[] = [];
  private rtVol: THREE.WebGLRenderTarget | null = null;
  private aoMat: THREE.ShaderMaterial;
  private aoBlurMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private volMat: THREE.ShaderMaterial;
  private black: THREE.DataTexture;

  constructor() {
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    const lightU = {
      uLightTex: U.uLightTex, uLightInfo: U.uLightInfo, uGridScale: U.uGridScale, uVisTex: U.uVisTex, uVisInfo: U.uVisInfo, uVisOn: U.uVisOn,
      uPlayerPos: U.uPlayerPos, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    };
    const mk = (frag: string, uniforms: Record<string, any>, defines: Record<string, any> = {}) => new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, uniforms, defines,
    });
    this.aoMat = mk(AO_FRAG, {
      ...CAMU, tDepth: { value: null }, tNormal: { value: null }, uRadius: { value: 0.55 }, uStrength: { value: 1 },
      uBlobs: { value: this.blobs }, uBlobN: { value: 0 }, uBlobStr: { value: 0.45 },
    }, { AO_N: 8 });
    this.aoBlurMat = mk(AO_BLUR_FRAG, { ...CAMU, tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.brightMat = mk(BRIGHT_FRAG, { ...CAMU, tColor: { value: null }, tNormal: { value: null }, uSrcTexel: { value: new THREE.Vector2() }, uTh: { value: 1 } });
    this.downMat = mk(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mk(UP_FRAG, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.volMat = mk(VOL_FRAG, {
      ...CAMU, ...lightU, ...SPOTU, tDepth: { value: null },
      uDens: { value: 0.015 }, uFall: { value: 0.2 }, uTop: { value: 2.8 }, uGridMul: { value: 1 }, uSpotMul: { value: 1 }, uSunMul: { value: 0 }, uHaze: { value: new THREE.Vector3(1, 1, 1) },
    }, { VOL_N: 12 });
  }

  /** composite material defines for the current quality */
  /** dev: composite shows one buffer (1 AO, 2 flags, 3 haze, 4 bloom, 5 normals) */
  debugView = 0;

  compositeDefines(): Record<string, any> {
    const q = this.q, on = !this.bypass;
    const d: Record<string, any> = { SSR_N: on ? q.ssr : 0 };
    if (this.debugView) d.DEBUG_VIEW = this.debugView;
    if (on && (q.ao > 0 || q.blobs > 0)) d.AO_ON = 1;
    if (on && q.bloom > 0) { d.BLOOM_ON = 1; if (q.dirt) d.DIRT_ON = 1; }
    if (on && q.vol > 0) d.VOL_ON = 1;
    if (on && q.motes) d.MOTES_ON = 1;
    if (q.mist) d.MIST_ON = 1;
    return d;
  }

  setQuality(q: FxQuality) {
    this.q = q;
    this.aoMat.defines.AO_N = this.bypass ? 0 : q.ao; this.aoMat.needsUpdate = true;
    this.volMat.defines.VOL_N = Math.max(1, q.vol);
    if (q.volShadows) this.volMat.defines.VOL_SHADOWS = 1; else delete this.volMat.defines.VOL_SHADOWS;
    this.volMat.needsUpdate = true;
    if (this.W) this.setSize(this.W, this.H, true);
  }

  setSize(W: number, H: number, force = false) {
    if (!force && W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.rtAO?.dispose(); this.rtAO2?.dispose(); this.rtVol?.dispose();
    for (const r of this.rtB) r.dispose();
    for (const r of this.rtU) r.dispose();
    this.rtB = []; this.rtU = [];
    this.rtAO = this.rtAO2 = this.rtVol = null;
    const q = this.q;
    if (q.ao > 0 || q.blobs > 0) {
      const aw = q.aoHalf ? Math.ceil(W / 2) : W, ah = q.aoHalf ? Math.ceil(H / 2) : H;
      this.rtAO = new THREE.WebGLRenderTarget(aw, ah, rtOpts(false, false));
      this.rtAO2 = new THREE.WebGLRenderTarget(aw, ah, rtOpts(true, false));
    }
    if (q.bloom > 0) {
      let w = W, h = H;
      for (let i = 0; i < q.bloom; i++) { w = Math.max(2, Math.ceil(w / 2)); h = Math.max(2, Math.ceil(h / 2)); this.rtB.push(new THREE.WebGLRenderTarget(w, h, rtOpts(true, true))); }
      for (let i = 0; i < q.bloom - 1; i++) this.rtU.push(new THREE.WebGLRenderTarget(this.rtB[i].width, this.rtB[i].height, rtOpts(true, true)));
    }
    if (q.vol > 0) this.rtVol = new THREE.WebGLRenderTarget(Math.ceil(W / 2), Math.ceil(H / 2), rtOpts(true, true));
  }

  dispose() {
    this.rtAO?.dispose(); this.rtAO2?.dispose(); this.rtVol?.dispose();
    for (const r of this.rtB) r.dispose();
    for (const r of this.rtU) r.dispose();
  }

  /** run the passes; returns the textures the composite needs */
  run(pass: (m: THREE.ShaderMaterial, rt: THREE.WebGLRenderTarget) => void, inp: FxInputs, z: ZoneFx) {
    const q = this.q;
    const out = { ao: this.black as THREE.Texture, vol: this.black as THREE.Texture, bloom: this.black as THREE.Texture, wide: this.black as THREE.Texture };
    const on = !this.bypass;
    if (this.rtAO && this.rtAO2 && on && (q.ao > 0 || q.blobs > 0)) {
      const u = this.aoMat.uniforms;
      u.tDepth.value = inp.depth; u.tNormal.value = inp.normal;
      u.uStrength.value = z.ao; u.uBlobN.value = Math.min(this.blobN, q.blobs);
      pass(this.aoMat, this.rtAO);
      const b = this.aoBlurMat.uniforms;
      b.tAO.value = this.rtAO.texture; b.tDepth.value = inp.depth; b.uTexel.value.set(1 / this.rtAO.width, 1 / this.rtAO.height);
      pass(this.aoBlurMat, this.rtAO2);
      out.ao = this.rtAO2.texture;
    }
    if (on && this.rtB.length) {
      const bu = this.brightMat.uniforms;
      bu.tColor.value = inp.color; bu.tNormal.value = inp.normal; bu.uSrcTexel.value.set(1 / this.W, 1 / this.H); bu.uTh.value = z.bloomTh;
      pass(this.brightMat, this.rtB[0]);
      const du = this.downMat.uniforms;
      for (let i = 1; i < this.rtB.length; i++) {
        du.tSrc.value = this.rtB[i - 1].texture; du.uTexel.value.set(1 / this.rtB[i - 1].width, 1 / this.rtB[i - 1].height);
        pass(this.downMat, this.rtB[i]);
      }
      const uu = this.upMat.uniforms;
      let src = this.rtB[this.rtB.length - 1];
      for (let i = this.rtB.length - 2; i >= 0; i--) {
        uu.tSrc.value = src.texture; uu.tAdd.value = this.rtB[i].texture; uu.uTexel.value.set(1 / src.width, 1 / src.height);
        pass(this.upMat, this.rtU[i]);
        src = this.rtU[i];
      }
      out.bloom = src.texture;
      out.wide = this.rtB[this.rtB.length - 1].texture;
    }
    if (on && this.rtVol) {
      const v = this.volMat.uniforms;
      v.tDepth.value = inp.depth;
      v.uDens.value = z.hazeDens; v.uFall.value = z.hazeFall; v.uTop.value = z.volTop; v.uGridMul.value = z.gridMul; v.uSpotMul.value = z.spotMul;
      v.uSunMul.value = z.sunShafts; v.uHaze.value.set(z.haze[0], z.haze[1], z.haze[2]);
      pass(this.volMat, this.rtVol);
      out.vol = this.rtVol.texture;
    }
    return out;
  }
}

import * as THREE from 'three';
import { atlas } from './atlas';

/**
 * Shared uniforms driving the whole look of the world. Every world material
 * references these same objects so a single update per frame affects all.
 */
export const U = {
  uTime: { value: 0 },
  uLightTex: { value: null as THREE.Texture | null },
  uLightInfo: { value: new THREE.Vector4(0, 0, 1, 1) },   // originX, originZ, 1/sizeX, 1/sizeZ (world metres)
  uVisTex: { value: null as THREE.Texture | null },
  uVisInfo: { value: new THREE.Vector4(0, 0, 1, 1) },
  uVisOn: { value: 1 },
  uPlayerPos: { value: new THREE.Vector3() },
  uPlayerView: { value: new THREE.Vector3() },
  uCutOn: { value: 1 },
  uCutRadius: { value: 1.3 },
  uCamFwd: { value: new THREE.Vector2(-0.707, -0.707) },
  uCutWide: { value: 5.5 },
  uCutFloor: { value: 0.32 },
  uFogColor: { value: new THREE.Color(0x1a1608) },
  uFogNear: { value: 14 },
  uFogFar: { value: 30 },
  uVoidColor: { value: new THREE.Color(0x050403) },
  uRememberTint: { value: new THREE.Color(0x8890a0) },
  uRememberAmt: { value: 0.42 },
  uCollapse: { value: 0 },
  uSnapRes: { value: new THREE.Vector2(640, 360) },
  uSnapOn: { value: 0 },
  uGridScale: { value: 4.0 },
  uWetness: { value: 0 },
  uAtlasSize: { value: 2048 },
  // ---- realism layer (src/gfx/wetmap.ts, src/gfx/postfx.ts)
  /** per-zone surface map: r reflectivity (gloss / wet), g water, b outdoor (rain wets it), a water proximity (caustics) */
  uWetTex: { value: null as THREE.Texture | null },
  /** world xz -> uv: (0, 0, 1/W, 1/H) in metres */
  uWetInfo: { value: new THREE.Vector4(0, 0, 1, 1) },
  uWetOn: { value: 0 },
  /** animated pool caustics strength (0 = off) and colour */
  uCaustics: { value: 0 },
  uCausticCol: { value: new THREE.Color(0xd8f6ff) },
  /** wet-floor sheen: how far (m) toward the camera the lights' reflection appears, and its strength */
  uSpecOff: { value: 3.6 },
  uSheen: { value: 0.0 },
  /** prop cutaway depth scale (lower camera pitch hides more behind props) */
  uCutScale: { value: 1 },
  /** close-up detail tiles in the atlas (u0, v0, du, dv): walls / props and floors (src/gfx/textures/detail.ts) */
  uDetailW: { value: new THREE.Vector4(0, 0, 0, 0) },
  uDetailF: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** close-up atlas (src/gfx/atlas.ts hdTexture), its size, and 1 while the first-person eye draws the world */
  uHdMap: { value: null as THREE.Texture | null },
  uHdSize: { value: 2048 },
  uCloseUp: { value: 0 },
};

export interface WorldMatOpts {
  cutout?: boolean;
  transparent?: boolean;
  alphaTest?: number;
  doubleSide?: boolean;
  foliage?: boolean;
  noVis?: boolean;
  noFog?: boolean;
  highlight?: boolean;
  /** outline flag written to normal buffer alpha: 1 = normal outlines, 0 = no outlines */
  outline?: number;
  opacity?: number;
  depthWrite?: boolean;
  /** additive glow sprites, light shafts */
  additive?: boolean;
  unlit?: boolean;
  /** ignore the zone light grid (overlay objects such as the held scanner) */
  noGrid?: boolean;
  /** zone floor surfaces: sample the wet / gloss map (reflections, puddles, rain) */
  floor?: boolean;
}

const VERT_DECL = /* glsl */`
attribute vec4 aAtlas;
attribute vec4 aHd;
varying vec4 vHd;
attribute vec2 aFx;
varying vec4 vAtlas;
varying vec3 vWPos;
varying vec3 vWNormal;
varying float vEmis;
varying float vWallAxis;
uniform float uTime;
uniform float uCollapse;
uniform vec2 uSnapRes;
uniform float uSnapOn;
vec3 collapseWarp(vec3 p) {
  float t = uTime * 0.7;
  return vec3(
    sin(p.z * 0.9 + t) * 0.15 + sin(p.y * 2.3 + t * 1.7) * 0.05,
    sin(p.x * 0.7 + p.z * 0.5 + t * 0.6) * 0.12,
    cos(p.x * 0.8 - t) * 0.15
  );
}
`;

const VERT_PROJECT = /* glsl */`
vec4 nWp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  nWp = instanceMatrix * nWp;
#endif
nWp = modelMatrix * nWp;
#ifdef FOLIAGE
  float sway = aFx.y;
  nWp.x += sin(uTime * 1.9 + nWp.z * 1.3 + nWp.x * 0.7) * 0.06 * sway;
  nWp.z += cos(uTime * 1.6 + nWp.x * 1.1) * 0.04 * sway;
#endif
if (uCollapse > 0.001) {
  float h = clamp(nWp.y / 2.8, 0.0, 1.0);
  nWp.xyz += collapseWarp(nWp.xyz) * uCollapse * (0.25 + h);
}
vWPos = nWp.xyz;
vec4 mvPosition = viewMatrix * nWp;
gl_Position = projectionMatrix * mvPosition;
if (uSnapOn > 0.5) {
  vec2 g = uSnapRes * 0.5;
  gl_Position.xy = (floor(gl_Position.xy / gl_Position.w * g + 0.5) / g) * gl_Position.w;
}
vAtlas = aAtlas;
vHd = aHd;
vEmis = aFx.x;
vWallAxis = aFx.y;
vec3 nObj = objectNormal;
#ifdef USE_INSTANCING
  nObj = mat3(instanceMatrix) * nObj;
#endif
vWNormal = normalize(mat3(modelMatrix) * nObj);
`;

const FRAG_DECL = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
varying vec4 vAtlas;
varying vec4 vHd;
uniform sampler2D uHdMap;
uniform float uHdSize;
uniform float uCloseUp;
varying vec3 vWPos;
varying vec3 vWNormal;
varying float vEmis;
varying float vWallAxis;
uniform float uTime;
uniform sampler2D uLightTex;
uniform vec4 uLightInfo;
uniform sampler2D uVisTex;
uniform vec4 uVisInfo;
uniform float uVisOn;
uniform vec3 uPlayerPos;
uniform vec3 uPlayerView;
uniform vec2 uCamFwd;
uniform float uCutWide;
uniform float uCutOn;
uniform float uCutRadius;
uniform float uCutFloor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uVoidColor;
uniform vec3 uRememberTint;
uniform float uRememberAmt;
uniform float uGridScale;
uniform float uAtlasSize;
uniform float uWetness;
uniform sampler2D uWetTex;
uniform vec4 uWetInfo;
uniform float uWetOn;
uniform float uCaustics;
uniform vec3 uCausticCol;
uniform float uSpecOff;
uniform float uSheen;
uniform float uCutScale;
uniform vec4 uDetailW;
uniform vec4 uDetailF;
float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  int i = ip.y * 4 + ip.x;
  int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
  return (float(m[i]) + 0.5) / 16.0;
}
`;

const FRAG_MAP = /* glsl */`
#ifdef USE_MAP
  vec2 texPx = max(vAtlas.zw * uAtlasSize, vec2(1.0));
  vec2 tuv = fract(vMapUv) * texPx;
  vec2 fuv = (floor(tuv) + 0.5) / texPx;
  vec2 auv = vAtlas.xy + vec2(fuv.x, 1.0 - fuv.y) * vAtlas.zw;
  vec4 sampledDiffuseColor = texture2D( map, auv );
  if (uCloseUp > 0.5) {
    // Up close (the first-person eye) one texel would cover many screen pixels. Surfaces with a
    // close-up version (src/gfx/textures/hd.ts: 2-4x the density, material detail painted in) switch
    // to it; everything else rebuilds the inside of each texel the way a pixel artist doubles a
    // sprite and picks up a finer layer of world-space relief. The iso view never runs this.
    vec2 tw = fwidth(tuv);
    float tpp = max(tw.x, tw.y);
    bool worldAtlas = textureSize(map, 0).x == int(uAtlasSize + 0.5);
    if (tpp < 0.6 && tpp > 0.0 && worldAtlas) {
      bool hasHd = vHd.w < 0.0 && vHd.z > 0.0;
      if (hasHd) {
        vec2 hdPx = max(vec2(vHd.z, -vHd.w) * uHdSize, vec2(1.0));
        vec2 huv = fract(vMapUv) * hdPx;
        // a hd texel should cover at least about a pixel: further away read every other one
        float hpp = tpp * hdPx.x / texPx.x;
        float lodT = 1.25 + (fract(sin(dot(floor(tuv * 2.0), vec2(41.3, 289.1))) * 15731.7) - 0.5) * 0.5;
        huv = hpp > lodT ? floor(huv * 0.5) * 2.0 + 0.5 : floor(huv) + 0.5;
        vec2 hu = huv / hdPx;
        sampledDiffuseColor = textureLod(uHdMap, vHd.xy + vec2(hu.x, 1.0 - hu.y) * vec2(vHd.z, -vHd.w), 0.0);
      } else if (tpp < 0.45) {
        vec2 cell = floor(tuv), sub = fract(tuv) - 0.5;
        vec2 sx = vec2(sub.x < 0.0 ? -1.0 : 1.0, 0.0), sy = vec2(0.0, sub.y < 0.0 ? -1.0 : 1.0);
        #define LP_CELL(c) textureLod(map, vAtlas.xy + vec2((mod((c).x, texPx.x) + 0.5) / texPx.x, 1.0 - (mod((c).y, texPx.y) + 0.5) / texPx.y) * vAtlas.zw, 0.0)
        vec4 cH = LP_CELL(cell + sx), cV = LP_CELL(cell + sy), cHo = LP_CELL(cell - sx), cVo = LP_CELL(cell - sy);
        #undef LP_CELL
        vec3 a1 = cH.rgb - cV.rgb, a2 = cV.rgb - cHo.rgb, a3 = cH.rgb - cVo.rgb;
        if (dot(a1, a1) < 0.004 && dot(a2, a2) > 0.004 && dot(a3, a3) > 0.004) sampledDiffuseColor = cH;
        // finer grain: 4 x 4 sub-texels, a few percent either way, fading in as the texel grows
        vec2 sc = floor(tuv * 4.0);
        float gh = fract(sin(dot(sc, vec2(12.9898, 78.233))) * 43758.5453);
        sampledDiffuseColor.rgb *= 1.0 + (gh - 0.5) * 0.07 * smoothstep(0.45, 0.16, tpp);
        // world-space relief at 128 px per metre
        vec3 an = abs(vWNormal);
        bool flr = an.y > max(an.x, an.z);
        vec2 dp = flr ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
        vec4 dr = flr ? uDetailF : uDetailW;
        if (dr.z > 0.0) {
          vec2 duv = (floor(fract(dp * 2.0) * 64.0) + 0.5) / 64.0;
          float dv = textureLod(map, dr.xy + vec2(duv.x, 1.0 - duv.y) * dr.zw, 0.0).r;
          sampledDiffuseColor.rgb *= 1.0 + (dv - 0.5) * 1.1 * smoothstep(0.45, 0.2, tpp);
        }
      }
    }
  }
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const FRAG_CUTOUT = /* glsl */`
#ifdef CUTOUT
if (uCutOn > 0.5 && vWPos.y > uCutFloor) {
  float cut = 0.0;
  vec2 toCam = -sign(uCamFwd);
  if (vWallAxis > 0.5 && vWallAxis < 2.5) {
    // Project Zomboid style cutaway: walls on the camera side of the player
    // (south/east for the default view) are lowered to stubs around them.
    bool alongX = vWallAxis < 1.5;
    float ahead = alongX ? (vWPos.z - uPlayerPos.z) * toCam.y : (vWPos.x - uPlayerPos.x) * toCam.x;
    float lateral = alongX ? abs(vWPos.x - uPlayerPos.x) : abs(vWPos.z - uPlayerPos.z);
    cut = smoothstep(0.1, 0.45, ahead) * smoothstep(uCutWide + 1.5, uCutWide - 1.0, ahead) * smoothstep(uCutWide + 1.5, uCutWide - 1.5, lateral);
  } else {
    // props: vertical slab between camera and player
    vec2 d = vWPos.xz - uPlayerPos.xz;
    float fwd = dot(d, uCamFwd);
    float lat = dot(d, vec2(-uCamFwd.y, uCamFwd.x));
    cut = smoothstep(-0.1, -0.5, fwd) * smoothstep(-5.2 * uCutScale, -3.6 * uCutScale, fwd) * smoothstep(uCutRadius, uCutRadius * 0.45, abs(lat));
  }
  float hfade = smoothstep(uCutFloor, uCutFloor + 0.25, vWPos.y);
  // a clean cut line (no screen-door dither): the wall reads as sawn off around the survivor
  if (cut * hfade > 0.5) discard;
}
#endif
`;

// wet / glossy floors: reflectivity for the post pass, darker albedo where actually wet
const FRAG_WET = /* glsl */`
float wetR = 0.0;
float wetWater = 0.0;
#if defined(FLOOR)
if (uWetOn > 0.5 && vWNormal.y > 0.6) {
  vec4 wm = texture2D(uWetTex, vWPos.xz * uWetInfo.zw);
  wetR = max(wm.r, wm.b * uWetness);
  wetWater = step(0.5, wm.g);
  diffuseColor.rgb *= 1.0 - 0.3 * clamp((wetR - 0.3) / 0.7, 0.0, 1.0);
}
#endif
`;

// animated caustics: thin bright web lines that drift (pool water and the walls and decks near it)
const CAUSTIC_FN = /* glsl */`
float causticAt(vec2 p, float t) {
  vec2 q = p * 1.9;
  q += vec2(sin(q.y * 1.3 + t * 0.8), cos(q.x * 1.1 - t * 0.65)) * 0.55;
  float v = sin(q.x * 2.2 + t * 0.55) + sin(q.y * 2.4 - t * 0.47) + sin((q.x + q.y) * 1.5 + t * 0.71);
  float a = pow(max(0.0, 1.0 - abs(v) * 0.75), 4.0);
  vec2 r = p * 3.1 + vec2(t * 0.21, -t * 0.17);
  float w = sin(r.x * 1.7 + sin(r.y * 1.9 + t)) + sin(r.y * 1.6 + sin(r.x * 1.4 - t * 0.8));
  return a + pow(max(0.0, 1.0 - abs(w) * 0.9), 5.0) * 0.6;
}
`;

const FRAG_LIGHTGRID = /* glsl */`
#if defined( RE_IndirectDiffuse ) && !defined(UNLIT) && !defined(NOGRID)
{
  vec3 wn = normalize(vWNormal);
  // ambient bounce reaches up-facing surfaces best: facets of a low-poly model separate even in the dark
  irradiance *= (0.8 + 0.2 * wn.y) * 0.8;
  vec2 lgp = vWPos.xz + vWNormal.xz * 0.28;
  vec2 luv = (lgp - uLightInfo.xy) * uLightInfo.zw;
  vec3 gt = texture2D(uLightTex, luv).rgb;
  vec3 grid = gt * gt * uGridScale;
  // ceiling fixtures: surfaces higher up the walls catch a bit more light
  grid *= 0.8 + 0.2 * clamp(vWPos.y / 2.6, 0.0, 1.0);
  // motivated light: each pool keeps its core but its fringe falls away faster into the dark
  grid *= mix(0.5, 1.0, smoothstep(0.05, 0.75, dot(grid, vec3(0.3, 0.5, 0.2))));
  // directional light out of the grid itself: it arrives from where the grid gets brighter, so faces
  // turned toward a fixture catch it, faces turned away fall into shade and light pools get a rim
  {
    float e = 0.45 * uLightInfo.z;
    vec3 LW = vec3(0.3, 0.5, 0.2);
    float gx = dot(texture2D(uLightTex, luv + vec2(e, 0.0)).rgb - texture2D(uLightTex, luv - vec2(e, 0.0)).rgb, LW);
    float gz = dot(texture2D(uLightTex, luv + vec2(0.0, e)).rgb - texture2D(uLightTex, luv - vec2(0.0, e)).rgb, LW);
    float g0 = dot(gt, LW) + 0.04;
    vec3 Ld = normalize(vec3(gx / g0 * 1.7, 1.0, gz / g0 * 1.7));
    // ceilings (first person only) take the spill around the fixtures, not the dark of a down-facing face
    grid *= mix(clamp(0.74 + 0.46 * dot(wn, Ld), 0.3, 1.2), 0.62, smoothstep(-0.5, -0.9, wn.y));
  }
  // negative emissive: a fixture's diffuser glows with whatever its own light gives right now
  // (dark when the tube is dead or the power is off, stuttering with the flicker)
  if (vEmis < 0.0) totalEmissiveRadiance += diffuseColor.rgb * min(gt * gt * uGridScale, vec3(2.4)) * (-vEmis);
  irradiance += grid * PI;
#if defined(FLOOR)
  // wet / polished floors mirror the fixtures overhead: sample the light grid where the reflected view ray meets the ceiling
  if (wetR > 0.05 && uSheen > 0.0) {
    vec2 sp = vWPos.xz + uCamFwd * uSpecOff;
    if (wetWater > 0.5) sp += vec2(sin(vWPos.z * 7.0 + uTime * 2.3), cos(vWPos.x * 6.0 - uTime * 1.9)) * 0.12;
    vec3 st = texture2D(uLightTex, (sp - uLightInfo.xy) * uLightInfo.zw).rgb;
    vec3 spec = st * st * st * uGridScale;
    irradiance += spec * PI * wetR * uSheen;
  }
#endif
  if (uCaustics > 0.0 && uWetOn > 0.5) {
    vec2 wp = vWPos.xz + vWNormal.xz * 0.35;
    float near = texture2D(uWetTex, wp * uWetInfo.zw).a;
    if (near > 0.01) {
      vec2 cp = vWPos.xz + vec2(vWPos.y * 0.35, -vWPos.y * 0.2);
      float cst = causticAt(cp, uTime);
      // light that reaches the water is what gets focused into the web
      irradiance += uCausticCol * (cst * near * uCaustics) * (0.35 + dot(grid, vec3(0.33)) * 0.9) * PI;
    }
  }
}
#endif
`;

const FRAG_EMISSIVE = /* glsl */`
totalEmissiveRadiance += diffuseColor.rgb * max(vEmis, 0.0);
`;

const FRAG_FOG = /* glsl */`
#ifndef NOFOG
{
  float fd = length(vWPos.xz - uPlayerPos.xz);
  float fogF = smoothstep(uFogNear, uFogFar, fd);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogF);
}
#endif
#ifndef NOVIS
if (uVisOn > 0.5) {
  vec2 vgp = vWPos.xz + vWNormal.xz * 0.42;
  vec2 vis = texture2D(uVisTex, (vgp - uVisInfo.xy) * uVisInfo.zw).rg;
  vec3 col = gl_FragColor.rgb;
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  vec3 remembered = mix(vec3(lum), col, 0.35) * uRememberTint * uRememberAmt;
  vec3 unexplored = mix(vec3(lum), col, 0.15) * uRememberTint * uRememberAmt * 0.2;
  // hidden areas sink toward the zone's void colour (near-black indoors, haze outdoors) without washing out
  vec3 res = mix(mix(unexplored, remembered, vis.g), uVoidColor, 0.08 + 0.22 * (1.0 - vis.g));
  // a short clean ramp at the vision edge (the final posterise steps it into a couple of bands)
  float v = smoothstep(0.08, 0.92, vis.r);
  gl_FragColor.rgb = mix(res, col, v);
}
#endif
`;

// normal buffer alpha packs: outline flag (0 / 0.5 highlight / 1) + 2 x wet level (0..7) + 16 x water (renderer decodes it)
const FRAG_OUT = /* glsl */`
#ifdef HIGHLIGHT
  gNormal = vec4(normalize(vWNormal) * 0.5 + 0.5, 0.5);
#else
  gNormal = vec4(normalize(vWNormal) * 0.5 + 0.5, OUTLINE_FLAG + 2.0 * floor(clamp(wetR, 0.0, 1.0) * 7.0 + 0.5) + 16.0 * wetWater);
#endif
`;

const cache = new Map<string, THREE.Material>();

function inject(mat: THREE.MeshLambertMaterial, defines: Record<string, string | number>) {
  mat.onBeforeCompile = (shader) => {
    for (const k of Object.keys(U)) (shader.uniforms as any)[k] = (U as any)[k];
    shader.defines = { ...(shader.defines || {}), ...defines };
    // where the close-up detail tiles sit in the world atlas, and the close-up atlas itself
    const A = atlas();
    if (!U.uHdMap.value && A.hdEnabled) { U.uHdMap.value = A.hdTexture; U.uHdSize.value = A.hdSize; }
    if (!U.uDetailW.value.z && A.has('detail_wall')) {
      const w = A.get('detail_wall'), f = A.get('detail_floor');
      U.uDetailW.value.set(w.u0, w.v0, w.du, w.dv); U.uDetailF.value.set(f.u0, f.v0, f.du, f.dv);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', VERT_PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL + CAUSTIC_FN)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_CUTOUT)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_WET)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + FRAG_LIGHTGRID)
      .replace('#include <fog_fragment>', FRAG_FOG)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + FRAG_OUT);
  };
  mat.customProgramCacheKey = () => 'noclip:' + JSON.stringify(defines);
}

/** Get (cached) world material variant. All share the atlas + global uniforms. */
export function worldMaterial(o: WorldMatOpts = {}): THREE.Material {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshLambertMaterial({
    map: atlas().texture,
    vertexColors: true,
    transparent: !!o.transparent || !!o.additive,
    alphaTest: o.alphaTest ?? 0,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    opacity: o.opacity ?? 1,
    depthWrite: o.depthWrite ?? !(o.transparent || o.additive),
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const defines: Record<string, string | number> = { OUTLINE_FLAG: (o.outline ?? 1).toFixed(2) };
  if (o.cutout) defines.CUTOUT = 1;
  if (o.foliage) defines.FOLIAGE = 1;
  if (o.noVis) defines.NOVIS = 1;
  if (o.noFog) defines.NOFOG = 1;
  if (o.highlight) defines.HIGHLIGHT = 1;
  if (o.unlit) defines.UNLIT = 1;
  if (o.noGrid) defines.NOGRID = 1;
  if (o.floor && !o.transparent && !o.additive) defines.FLOOR = 1;
  inject(mat, defines);
  cache.set(key, mat);
  return mat;
}

/** Commonly used variants */
export const MAT = {
  get floor() { return worldMaterial({ outline: 0.0, floor: true }); },
  get wall() { return worldMaterial({ cutout: true }); },
  get prop() { return worldMaterial({ cutout: true }); },
  get propLow() { return worldMaterial({}); },
  get dynamic() { return worldMaterial({}); },
  get foliage() { return worldMaterial({ alphaTest: 0.5, doubleSide: true, foliage: true, outline: 0.0 }); },
  get decal() { return worldMaterial({ transparent: true, outline: 0.0, depthWrite: false }); },
  get glass() { return worldMaterial({ transparent: true, opacity: 0.35, cutout: true, depthWrite: false, outline: 0.0 }); },
  get highlight() { return worldMaterial({ highlight: true, cutout: true }); },
};

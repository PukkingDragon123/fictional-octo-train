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
}

const VERT_DECL = /* glsl */`
attribute vec4 aAtlas;
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
  vec2 fuv = fract(vMapUv);
  fuv = (floor(fuv * texPx) + 0.5) / texPx;
  vec2 auv = vAtlas.xy + vec2(fuv.x, 1.0 - fuv.y) * vAtlas.zw;
  vec4 sampledDiffuseColor = texture2D( map, auv );
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
    cut = smoothstep(-0.1, -0.5, fwd) * smoothstep(-5.2, -3.6, fwd) * smoothstep(uCutRadius, uCutRadius * 0.45, abs(lat));
  }
  float hfade = smoothstep(uCutFloor, uCutFloor + 0.25, vWPos.y);
  if (cut * hfade > bayer4(gl_FragCoord.xy)) discard;
}
#endif
`;

const FRAG_LIGHTGRID = /* glsl */`
#if defined( RE_IndirectDiffuse ) && !defined(UNLIT) && !defined(NOGRID)
{
  vec2 lgp = vWPos.xz + vWNormal.xz * 0.28;
  vec3 gt = texture2D(uLightTex, (lgp - uLightInfo.xy) * uLightInfo.zw).rgb;
  vec3 grid = gt * gt * uGridScale;
  // ceiling fixtures: surfaces higher up the walls catch a bit more light
  grid *= 0.82 + 0.18 * clamp(vWPos.y / 2.6, 0.0, 1.0);
  irradiance += grid * PI;
}
#endif
`;

const FRAG_EMISSIVE = /* glsl */`
totalEmissiveRadiance += diffuseColor.rgb * vEmis;
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
  vec3 unexplored = mix(vec3(lum), col, 0.15) * uRememberTint * uRememberAmt * 0.45;
  // hidden areas sink toward the zone's void colour (near-black indoors, haze outdoors) without washing out
  vec3 res = mix(mix(unexplored, remembered, vis.g), uVoidColor, 0.08 + 0.22 * (1.0 - vis.g));
  // dithered transition keeps the pixel-art feel at vision edges
  float v = vis.r;
  v = clamp(v + (bayer4(gl_FragCoord.xy) - 0.5) * 0.18, 0.0, 1.0);
  gl_FragColor.rgb = mix(res, col, v);
}
#endif
`;

const FRAG_OUT = /* glsl */`
#ifdef HIGHLIGHT
  gNormal = vec4(normalize(vWNormal) * 0.5 + 0.5, 0.5);
#else
  gNormal = vec4(normalize(vWNormal) * 0.5 + 0.5, OUTLINE_FLAG);
#endif
`;

const cache = new Map<string, THREE.Material>();

function inject(mat: THREE.MeshLambertMaterial, defines: Record<string, string | number>) {
  mat.onBeforeCompile = (shader) => {
    for (const k of Object.keys(U)) (shader.uniforms as any)[k] = (U as any)[k];
    shader.defines = { ...(shader.defines || {}), ...defines };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', VERT_PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_CUTOUT)
      .replace('#include <map_fragment>', FRAG_MAP)
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
  inject(mat, defines);
  cache.set(key, mat);
  return mat;
}

/** Commonly used variants */
export const MAT = {
  get floor() { return worldMaterial({ outline: 0.0 }); },
  get wall() { return worldMaterial({ cutout: true }); },
  get prop() { return worldMaterial({ cutout: true }); },
  get propLow() { return worldMaterial({}); },
  get dynamic() { return worldMaterial({}); },
  get foliage() { return worldMaterial({ alphaTest: 0.5, doubleSide: true, foliage: true, outline: 0.0 }); },
  get decal() { return worldMaterial({ transparent: true, outline: 0.0, depthWrite: false }); },
  get glass() { return worldMaterial({ transparent: true, opacity: 0.35, cutout: true, depthWrite: false, outline: 0.0 }); },
  get highlight() { return worldMaterial({ highlight: true, cutout: true }); },
};

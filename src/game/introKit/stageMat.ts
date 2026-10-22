// Materials for the intake stage. They are the world's own materials
// (src/gfx/materials.ts: atlas texels, vertex colours, gNormal for the edge
// pass, no light grid / visibility / fog on the stage) with three things
// added on top for the cinematic look:
//   - a rim light: a fresnel edge in the shot's rim colour, strongest on the
//     side facing the rim direction (characters get it strongest), so figures
//     separate from dark backgrounds;
//   - the portal's light: whatever faces the liquid wall gets a cold glow with
//     a moving caustic web in it;
//   - haze: distance haze in the room's colour, thinner toward the ceiling.
// Plus two shader materials of its own: `emitMat` (opaque, self-lit: tubes,
// lamp glass, CRT faces; each has its own brightness so lamps can flicker one
// by one) and `glowMat` (additive cards: light shafts, halos, beams, caustic
// pools; no depth writes, fades where it is seen edge-on).
import * as THREE from 'three';
import { worldMaterial, U, type WorldMatOpts } from '../../gfx/materials';
import { atlas } from '../../gfx/atlas';

/** per-shot lighting uniforms shared by every stage material (the light director drives them) */
export const SU = {
  uRimCol: { value: new THREE.Color(0x7ad0ff) },
  uRimDir: { value: new THREE.Vector3(0, 0.4, 1).normalize() },
  uRimStr: { value: 1 },
  uPortPos: { value: new THREE.Vector3(0, 1, -30) },
  uPortN: { value: new THREE.Vector3(0, 0, 1) },
  uPortCol: { value: new THREE.Color(0x60e0ff) },
  uPortStr: { value: 0 },
  uPortFall: { value: 0.12 },
  uHazeCol: { value: new THREE.Color(0x0a1014) },
  uHazeDens: { value: 0.05 },
};

export interface StageMatOpts extends WorldMatOpts { rim?: number; noHaze?: boolean }

const DECL = /* glsl */`
uniform vec3 uRimCol; uniform vec3 uRimDir; uniform float uRimStr;
uniform vec3 uPortPos; uniform vec3 uPortN; uniform vec3 uPortCol; uniform float uPortStr; uniform float uPortFall;
uniform vec3 uHazeCol; uniform float uHazeDens;
float ixCaus(vec2 p, float t) {
  vec2 q = p * 1.7;
  q += vec2(sin(q.y * 1.3 + t * 1.1), cos(q.x * 1.2 - t * 0.9)) * 0.6;
  float v = sin(q.x * 2.1 + t * 0.7) + sin(q.y * 2.3 - t * 0.6) + sin((q.x + q.y) * 1.6 + t * 0.9);
  float a = pow(max(0.0, 1.0 - abs(v) * 0.7), 5.0);
  vec2 r = p * 2.9 + vec2(t * 0.3, -t * 0.23);
  float w = sin(r.x * 1.7 + sin(r.y * 1.9 + t * 1.3)) + sin(r.y * 1.6 + sin(r.x * 1.4 - t));
  return a + pow(max(0.0, 1.0 - abs(w) * 0.85), 6.0) * 0.7;
}
`;
const PORTAL = /* glsl */`
#if defined( RE_IndirectDiffuse ) && !defined( UNLIT )
if (uPortStr > 0.001) {
  vec3 ixn = normalize(vWNormal);
  vec3 toP = uPortPos - vWPos;
  float pd = length(toP);
  vec3 pl = toP / max(pd, 1e-3);
  float ndl = clamp(dot(ixn, pl) * 0.85 + 0.15, 0.0, 1.0);
  float front = smoothstep(-0.05, 0.25, dot(-pl, uPortN));
  float fall = 1.0 / (1.0 + pd * pd * uPortFall);
  vec2 cp = vWPos.xz * 1.3 + vec2(vWPos.y * 0.7, -vWPos.y * 0.45);
  float cst = ixCaus(cp, uTime);
  irradiance += uPortCol * (uPortStr * fall * front * ndl * (0.3 + cst * 1.8)) * PI;
}
#endif
`;
const OUT = /* glsl */`
#ifndef UNLIT
{
  vec3 ixn = normalize(vWNormal);
  vec3 ixv = normalize(cameraPosition - vWPos);
  float fr = 1.0 - clamp(dot(ixn, ixv), 0.0, 1.0);
  fr = fr * fr * (0.6 + 0.4 * fr);
  float bk = clamp(dot(ixn, uRimDir) * 0.65 + 0.35, 0.0, 1.0);
  outgoingLight += uRimCol * (IX_RIM * uRimStr * fr * bk) * (0.3 + 0.7 * diffuseColor.rgb);
}
#endif
#ifndef IX_NOHAZE
{
  float hd = length(cameraPosition - vWPos);
  float hz = (1.0 - exp(-hd * uHazeDens)) * mix(1.0, 0.6, clamp(vWPos.y / 7.0, 0.0, 1.0));
  outgoingLight = mix(outgoingLight, uHazeCol, hz);
}
#endif
`;

const cache = new Map<string, THREE.Material>();
let warned = false;

/** a stage material: a world material with the rim, the portal light and the haze */
export function stageMat(o: StageMatOpts = {}): THREE.Material {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  const { rim = 0.6, noHaze = false, ...w } = o;
  const base = worldMaterial({ noVis: true, noFog: true, noGrid: true, ...w }) as THREE.MeshLambertMaterial;
  const m = new THREE.MeshLambertMaterial({
    map: base.map, vertexColors: true, transparent: base.transparent, alphaTest: base.alphaTest, side: base.side,
    opacity: base.opacity, depthWrite: base.depthWrite, blending: base.blending,
  });
  const bk = base as unknown as { onBeforeCompile: (s: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => void; customProgramCacheKey: () => string };
  m.onBeforeCompile = (sh, r) => {
    bk.onBeforeCompile(sh, r);
    Object.assign(sh.uniforms, SU);
    if (!sh.uniforms.uTime) sh.uniforms.uTime = U.uTime;
    sh.defines = { ...(sh.defines || {}), IX_RIM: rim.toFixed(3), ...(noHaze ? { IX_NOHAZE: 1 } : {}) };
    let fs = sh.fragmentShader;
    const ok = fs.includes('#include <common>') && fs.includes('#include <lights_fragment_maps>') && fs.includes('#include <opaque_fragment>') && fs.includes('vWNormal') && fs.includes('vWPos');
    if (!ok) { if (!warned) { warned = true; console.warn('intro stageMat: world shader layout changed; rim / portal light / haze off'); } return; }
    fs = fs.replace('#include <common>', '#include <common>\n' + DECL);
    fs = fs.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + PORTAL);
    fs = fs.replace('#include <opaque_fragment>', OUT + '\n#include <opaque_fragment>');
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => bk.customProgramCacheKey() + '|ixstage:' + key;
  cache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- self-lit and additive
const ATLAS_VERT = /* glsl */`
attribute vec4 aAtlas;
attribute vec2 aFx;
varying vec2 vUv2;
varying vec4 vAt;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vVd;
void main() {
  vUv2 = uv; vAt = aAtlas; vCol = color;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #endif
  vN = normalize(mat3(modelMatrix) * normal);
  vVd = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const ATLAS_SAMPLE = /* glsl */`
uniform sampler2D tAtlas;
uniform float uAtlasSize;
varying vec2 vUv2;
varying vec4 vAt;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vVd;
vec4 atlasTex() {
  vec2 texPx = max(vAt.zw * uAtlasSize, vec2(1.0));
  vec2 f = fract(vUv2);
  f = (floor(f * texPx) + 0.5) / texPx;
  return texture2D(tAtlas, vAt.xy + vec2(f.x, 1.0 - f.y) * vAt.zw);
}
`;
const EMIT_FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform vec3 uCol;
uniform float uK;
` + ATLAS_SAMPLE + /* glsl */`
void main() {
  vec4 t = atlasTex();
  vec3 c = t.rgb * vCol * uCol * uK;
  // a dead tube is grey glass, not black
  c = max(c, t.rgb * vCol * 0.05);
  gl_FragColor = vec4(c, 1.0);
  gNormal = vec4(normalize(vN) * 0.5 + 0.5, 1.0);
}
`;
const GLOW_FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform vec3 uCol;
uniform float uK;
uniform float uEdge;
` + ATLAS_SAMPLE + /* glsl */`
void main() {
  vec4 t = atlasTex();
  float facing = abs(dot(normalize(vN), normalize(vVd)));
  float k = uK * mix(1.0, smoothstep(0.0, 0.6, facing), uEdge);
  gl_FragColor = vec4(t.rgb * vCol * uCol * k, 1.0);
  gNormal = vec4(0.0);
}
`;

export interface EmitMat extends THREE.ShaderMaterial { uniforms: { uCol: { value: THREE.Color }; uK: { value: number }; tAtlas: { value: THREE.Texture }; uAtlasSize: { value: number }; uEdge: { value: number } } }

function atlasUniforms(col: number, k: number) {
  const A = atlas();
  return { tAtlas: { value: A.texture as THREE.Texture }, uAtlasSize: U.uAtlasSize, uCol: { value: new THREE.Color(col) }, uK: { value: k }, uEdge: { value: 1 } };
}
/** opaque self-lit surface (lamp glass, tubes, beacon lens); its own brightness uK */
export function emitMat(col = 0xffffff, k = 1): EmitMat {
  return new THREE.ShaderMaterial({ uniforms: atlasUniforms(col, k), vertexShader: ATLAS_VERT, fragmentShader: EMIT_FRAG, vertexColors: true }) as EmitMat;
}
/** additive light card (shafts, halos, beams, pools); its own brightness uK; edge 1 fades it where seen edge-on */
export function glowMat(col = 0xffffff, k = 1, edge = 1): EmitMat {
  const m = new THREE.ShaderMaterial({
    uniforms: atlasUniforms(col, k), vertexShader: ATLAS_VERT, fragmentShader: GLOW_FRAG, vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }) as EmitMat;
  m.uniforms.uEdge.value = edge;
  return m;
}

// The grass field: GPU-instanced pixel-art grass on the open lawns and meadows
// (the Meadow, the Fields, suburban lawns and verges, the parking planters).
//
// LOOK. Each instance is one upright tuft card (or a flat patch of bare earth)
// from the sheet in src/gfx/grassArt.ts, repainted for the current zoom so a
// texel is exactly one low-res pixel. The card stands at its root's depth, so
// bodies walking through are hidden by the tufts in front of their feet. It is
// drawn with the world material pipeline (sun, sky fill, the light grid, the
// shadow map, fog, the vision mask), so it sits in the world like the floor.
//
// PHYSICS. Wind is analytic in the vertex shader: crests travelling downwind
// (visible waves, a palette step lighter on the crest), slow gust fronts and a
// flutter with its own phase per tuft. Interaction lives in a small camera-
// centred simulation texture (64 m, 4-5 texels per metre) stepped on the GPU
// every frame: (bend xz, bend velocity xz) as a damped spring, and (trample,
// cut, lay direction xz) that recover slowly. Up to 24 movers per frame are
// stamped into it from a uniform array: survivors, creatures (the big ones
// flatten wide swathes; a charging hare leaves a flattened streak), cars,
// thrown and dropped items, and one-frame pushes from shots, landings and
// swings. A blade swung through grass cuts it (and drops a handful of cut grass).
//
// COST. Chunks of 16 x 16 m, one draw call each, frustum culled; instances are
// shuffled at build time so drawing a prefix is an even thinning (zoom out,
// first-person distance, the quality preset). No per-frame CPU work grows with
// the number of blades: the CPU only picks movers and sets a count per chunk.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { worldMaterial } from './materials';
import { QUALITY } from './fxconfig';
import { COLS, VARIANTS, BY_KIND, PAL_N, PALETTES, paletteData, paintSheet, type Kind, type Sheet } from './grassArt';
import { CHUNK, type Zone } from '../world/zone';
import { floorDef } from '../world/defs';
import { objDef } from '../world/objects';
import { itemDef, hasItemDef } from '../items/item';
import { floorItems } from '../items/worldItems';
import { createItem, serializeItem } from '../items/factory';
import { op } from '../game/ops';

/** floor key -> palette row (0 the Meadow, 1 the Fields, 2 lawns) */
export const GRASS_FLOORS: Record<string, number> = { vx_grass: 0, grass_dream: 1, grass: 2 };
/** the open-air levels that grow it (where the battering hare runs) */
export const GRASS_ZONES = new Set(['meadow', 'fields', 'suburbs', 'parking', 'homestead']);

interface Biome { dens: number; flowers: number; flowerMix: [number, number]; clover: number; straw: number; tall: number; short: number; bare: number }
const BIOMES: Biome[] = [
  // the Meadow: even, lush, pastel flowers, hardly a dry blade
  { dens: 13, flowers: 0.09, flowerMix: [0.4, 0.68], clover: 0.05, straw: 0.012, tall: 0.03, short: 0.1, bare: 0.86 },
  // the Fields: a summer afternoon, seed heads and straw, buttercups
  { dens: 13, flowers: 0.09, flowerMix: [0.42, 0.8], clover: 0.07, straw: 0.13, tall: 0.12, short: 0.1, bare: 0.8 },
  // lawns: mown short, clover and daisies, the verges by walls left long
  { dens: 11, flowers: 0.04, flowerMix: [0.6, 0.9], clover: 0.14, straw: 0.04, tall: 0.02, short: 0.5, bare: 0.83 },
];

/** wind per level (0..1), slightly stronger under rain */
const WIND: Record<string, number> = { meadow: 0.55, fields: 0.75, suburbs: 0.45, parking: 0.12, homestead: 0.2 };

const SIM_M = 64;            // metres the interaction texture covers around the camera
const MAXM = 24;             // movers per frame

// ---------------------------------------------------------------- shaders
const VDECL = /* glsl */`
attribute vec4 aRoot;
attribute vec4 aVar;
uniform sampler2D uGBend;
uniform sampler2D uGState;
uniform vec4 uGWin;
uniform vec4 uGWind;
uniform vec4 uGCell;
uniform vec4 uGInfo;
uniform vec4 uGVar[64];
varying vec2 vGUv;
varying float vGShift;
varying float vGRow;
varying float vGTr;
`;

// computed where three starts the normal, so position and normal come from one place
const VBEGIN = /* glsl */`
vec3 gWPos;
vec3 objectNormal;
{
  int vi = int(aVar.x + 0.5);
  vec4 vd = uGVar[vi];
  float seed = aRoot.w;
  vec3 root = aRoot.xyz;
  // the camera's right and its ground direction (cards always face the camera)
  vec3 cR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 cB = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 gR = normalize(vec3(cR.x, 0.0, cR.z) + vec3(1e-5, 0.0, 0.0));
  vec3 gF = normalize(vec3(-cB.x, 0.0, -cB.z) + vec3(0.0, 0.0, 1e-5));
  // interaction state under this tuft
  vec2 wuv = (root.xz - uGWin.xy) * uGWin.z;
  vec4 gb = vec4(0.0), gs = vec4(0.0);
  if (uGWin.w > 0.5 && wuv.x > 0.0 && wuv.y > 0.0 && wuv.x < 1.0 && wuv.y < 1.0) {
    gb = textureLod(uGBend, wuv, 0.0);
    gs = textureLod(uGState, wuv, 0.0);
  }
  float tr = clamp(gs.r, 0.0, 1.0), cut = clamp(gs.g, 0.0, 1.0);
  vec2 lay = gs.ba;
  float ll = length(lay);
  lay = ll > 0.05 ? lay / ll : uGWind.xy;
  // wind: crests travelling downwind, slow gust fronts, each tuft its own flutter
  vec2 wd = uGWind.xy, wq = vec2(-wd.y, wd.x);
  float along = dot(root.xz, wd), across = dot(root.xz, wq);
  float wave = 0.5 + 0.5 * sin(along * 0.45 - uTime * 2.4 + sin(across * 0.11 + uTime * 0.17) * 1.8);
  float front = 0.5 + 0.5 * sin(along * 0.06 - uTime * 0.55 + across * 0.025);
  float crest = wave * wave * wave * (0.3 + 0.7 * front);
  float fl = sin(uTime * (2.1 + seed * 2.7) + seed * 37.0) * 0.6 + sin(uTime * (4.6 + seed * 1.9) + seed * 11.0) * 0.4;
  vec2 wind = (wd * (0.1 + 0.85 * crest * uGWind.w) + (wq * 0.8 + wd * 0.4) * fl * 0.12) * uGWind.z;
  vec2 bend = (wind * (1.0 - tr * 0.85) + gb.xy) * max(vd.w, 0.0);
  float bl = length(bend);
  if (bl > 1.15) bend *= 1.15 / bl;
  float px = position.x, hy = position.y;
  // across the card: the painted box (left .. right of the root, metres)
  float gx = mix(vd.x, vd.y, px + 0.5);
  float col = mod(float(vi), ${COLS}.0), row = floor(float(vi) / ${COLS}.0);
  vec2 cell = vec2(col * uGCell.x, row * uGCell.y);
  if (vd.w < -0.5) {
    // a flat patch on the ground, screen aligned (painted foreshortened: one texel per pixel)
    gWPos = root + gR * gx + gF * ((hy - 0.5) * vd.z) + vec3(0.0, 0.006, 0.0);
    vGUv = (cell + vec2(uGCell.x * 0.5 + gx * uGInfo.x, (1.0 - hy) * vd.z * uGInfo.z)) * uGCell.zw;
    objectNormal = vec3(0.0, 1.0, 0.0);
    vGShift = 0.0;
  } else {
    // an upright card: a cut tuft loses its top (the sheet is cropped, not squashed)
    float cutK = mix(1.0, 0.34, cut);
    float H = vd.z * cutK;
    float k = pow(hy, 1.5);
    // trodden flat, the card lies down along the way the trampler went, its width across that way
    float trE = smoothstep(0.22, 0.85, tr);
    vec3 lp = vec3(-lay.y, 0.0, lay.x);
    lp *= dot(lp, gR) < 0.0 ? -1.0 : 1.0;
    vec3 wAx = normalize(mix(gR, lp, trE) + vec3(1e-4, 0.0, 0.0));
    vec3 uAx = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(lay.x, 0.16, lay.y), trE));
    vec2 off = (bend * 0.85 * (1.0 - trE) + lay * tr * 0.35 * (1.0 - trE)) * H * k;
    float squash = 1.0 - 0.42 * min(1.0, dot(bend, bend)) * (1.0 - trE);
    gWPos = root + wAx * gx + uAx * (hy * H * squash) + vec3(off.x, 0.012 * trE * hy, off.y);
    vGUv = (cell + vec2(uGCell.x * 0.5 + gx * uGInfo.x, uGCell.y - hy * H * uGInfo.y)) * uGCell.zw;
    // lit like the ground it grows from, turned a little toward the camera and the way it leans
    objectNormal = normalize(vec3(0.0, 1.0, 0.0) - gF * 0.3 * (1.0 - trE) + vec3(bend.x, 0.0, bend.y) * 0.25);
    // both faces draw (a lying card may show its back): keep the light normal on the side we see
    if (dot(cross(wAx, uAx), cB) < 0.0) objectNormal = -objectNormal;
    // palette steps: lush patches, gust crests (the blades show their pale side), trampled grass
    float lush = sin(root.x * 0.19 + sin(root.z * 0.15) * 1.7) * 0.5 + sin(root.z * 0.12 - root.x * 0.07 + 2.0) * 0.5;
    // (and a step darker down in the turf, so every tuft stands out of the ground it grows from;
    // flattened grass shows its pale side: a trampled lane reads as a lighter streak)
    vGShift = lush * 0.55 + (seed - 0.5) * 0.9 + crest * uGWind.z * 1.5 * (1.0 - tr) + tr * 0.6 - cut * 0.4 + mix(-1.1, 0.3, hy) * (1.0 - tr);
  }
  vGRow = aVar.y;
  vGTr = vd.w < -0.5 ? 0.0 : tr;
}
`;

const FDECL = /* glsl */`
uniform sampler2D uGTex;
uniform sampler2D uGPal;
varying vec2 vGUv;
varying float vGShift;
varying float vGRow;
varying float vGTr;
`;

const FMAP = /* glsl */`
{
  vec4 gt = texture2D(uGTex, vGUv);
  if (gt.a < 0.5) discard;
  float gi = floor(gt.r * 255.0 / 8.0);
  // whole palette steps, dithered in screen space, never a smooth tint
  float s = floor(vGShift + bayer4(gl_FragCoord.xy));
  if (gi < 5.5) {
    gi = clamp(gi + s, 0.0, 5.0);
    // trodden flat: the blades lie on their backs, a paler and greyer green (dithered in with the trample)
    if (bayer4(gl_FragCoord.xy + vec2(2.0, 1.0)) < vGTr * 1.3 - 0.15) gi = 24.0 + clamp(floor(gi * 0.5), 0.0, 2.0);
  }
  else if (gi < 8.5) gi = clamp(gi + s, 6.0, 8.0);
  else if (gi < 11.5) gi = clamp(gi + s, 9.0, 11.0);
  diffuseColor.rgb *= texelFetch(uGPal, ivec2(int(gi), int(vGRow + 0.5)), 0).rgb;
}
`;

const SIM_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tBend;
uniform sampler2D tState;
uniform vec2 uShift;
uniform vec4 uWin;
uniform vec2 uRes;
uniform vec4 uMA[${MAXM}];
uniform vec4 uMB[${MAXM}];
uniform int uMN;
uniform float uRecover;
layout(location = 0) out vec4 oBend;
layout(location = 1) out vec4 oState;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 pu = uv + uShift;
  vec4 B = vec4(0.0), S = vec4(0.0);
  if (pu.x > 0.0 && pu.y > 0.0 && pu.x < 1.0 && pu.y < 1.0) { B = texture(tBend, pu); S = texture(tState, pu); }
  vec2 p = uWin.xy + uv * uWin.z;
  float dt = uWin.w;
  vec2 d = B.xy, v = B.zw;
  // a damped spring back to upright (a little overshoot, settled in a second or two)
  v += (-46.0 * d - 4.2 * v) * dt;
  d += v * dt;
  float tr = S.r, cut = S.g;
  vec2 lay = S.ba;
  for (int i = 0; i < ${MAXM}; i++) {
    if (i >= uMN) break;
    vec4 a = uMA[i], m = uMB[i];
    vec2 r = p - a.xy;
    float dist = length(r);
    vec2 dir = dist > 1e-3 ? r / dist : vec2(0.0);
    if (m.z < 0.5) {
      // a body: holds the grass bent away from it (and along its way), flattens it the longer it stays
      float f = 1.0 - smoothstep(a.z * 0.5, a.z * 1.25 + 0.14, dist);
      if (f > 0.0) {
        float sp = length(m.xy);
        vec2 mv = sp > 0.05 ? m.xy / sp : vec2(0.0);
        vec2 tgt = (dir * 0.95 + mv * 0.5 * min(1.0, sp / 2.0)) * a.w;
        float hold = clamp(f * 1.7, 0.0, 1.0);
        d = mix(d, tgt, hold);
        v *= 1.0 - hold;
        tr = min(1.0, tr + f * dt * m.w * (0.25 + min(2.6, sp / 2.4)));
        if (sp > 0.3) lay = mix(lay, mv, clamp(f * dt * 5.0, 0.0, 1.0));
        else if (f > 0.3) lay = mix(lay, dir, clamp(f * dt * 1.5, 0.0, 1.0));
      }
    } else if (m.z < 1.5) {
      // a push (a shot, a landing, a swing): one frame of outward velocity, the spring does the rest
      float f = 1.0 - smoothstep(a.z * 0.25, a.z, dist);
      v += (dir + m.xy) * f * a.w;
    } else {
      // a blade through the grass
      float f = 1.0 - smoothstep(a.z * 0.75, a.z, dist);
      cut = max(cut, f);
      v += dir * f * 2.0;
    }
  }
  tr = max(0.0, tr - dt * uRecover);
  cut = max(0.0, cut - dt / 150.0);
  oBend = vec4(d, v);
  oState = vec4(tr, cut, lay);
}
`;

// ---------------------------------------------------------------- small helpers
const hf = (x: number, y: number, s: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vn(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hf(xi, yi, s), b = hf(xi + 1, yi, s), c = hf(xi, yi + 1, s), d = hf(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const n2 = (x: number, y: number, s: number) => vn(x, y, s) * 0.65 + vn(x * 2.1 + 17, y * 2.1 + 5, s + 1) * 0.35;

class Pcg { s: number; constructor(s: number) { this.s = s >>> 0 || 1; } next() { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 4294967296; } }

interface GChunk { ci: number; sig: number; mesh: THREE.Mesh | null; geo: THREE.InstancedBufferGeometry | null; nFlat: number; nTuft: number; cx: number; cz: number }

// ---------------------------------------------------------------- the system
export class GrassSystem {
  name = 'grass';
  enabled = true;
  /** a software rasteriser (no GPU): draw the light version whatever the preset says (null: not looked yet) */
  soft: boolean | null = null;
  readonly root = new THREE.Group();
  private zone: Zone | null = null;
  private active = false;
  private chunks = new Map<number, GChunk>();
  private rr = 0;
  private mat: THREE.MeshLambertMaterial;
  private uni: Record<string, { value: any }>;
  private sheet: Sheet | null = null;
  private sheetTex: THREE.DataTexture | null = null;
  private sheetPitch = 0;
  private wantD = 0; private wantT = 0;
  // simulation
  private simN = 0;
  private rtA: THREE.WebGLRenderTarget | null = null;
  private rtB: THREE.WebGLRenderTarget | null = null;
  private simMat: THREE.ShaderMaterial;
  private simScene = new THREE.Scene();
  private simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private origin = new THREE.Vector2(); private hasOrigin = false;
  private mA = new Float32Array(MAXM * 4); private mB = new Float32Array(MAXM * 4);
  private track = new Map<string, { x: number; z: number; vx: number; vz: number; seen: number }>();
  private pulses: { x: number; z: number; r: number; s: number; kind: number; dx: number; dz: number; zone: string; at: number }[] = [];
  private cutAt = new Map<number, number>();
  private lastCutDrop = 0;
  private windAng = 0.6;
  private time = 0;
  /** dev / probes */
  stats = { chunks: 0, instances: 0, drawn: 0, movers: 0, D: 0, simN: 0, buildMs: 0 };

  constructor() {
    this.root.name = 'grass';
    const pal = new THREE.DataTexture(paletteData(), PAL_N, PALETTES.length, THREE.RGBAFormat, THREE.UnsignedByteType);
    pal.magFilter = pal.minFilter = THREE.NearestFilter; pal.generateMipmaps = false; pal.flipY = false;
    pal.colorSpace = THREE.SRGBColorSpace; pal.needsUpdate = true;
    const vars: THREE.Vector4[] = [];
    // per variant: painted box left, right, height (or flat depth), stiffness (-1: a flat patch); refitted with every sheet
    for (let i = 0; i < 64; i++) { const v = VARIANTS[i]; vars.push(v ? new THREE.Vector4(-v.w / 2, v.w / 2, v.h, v.kind === 'flat' ? -1 : v.stiff) : new THREE.Vector4(-0.01, 0.01, 0.01, 1)); }
    this.uni = {
      uGTex: { value: null }, uGPal: { value: pal }, uGBend: { value: null }, uGState: { value: null },
      uGWin: { value: new THREE.Vector4(0, 0, 1 / SIM_M, 0) }, uGWind: { value: new THREE.Vector4(1, 0, 0.5, 1) },
      uGCell: { value: new THREE.Vector4(32, 32, 1, 1) }, uGInfo: { value: new THREE.Vector4(64, 52, 38, 0) },
      uGVar: { value: vars },
    };
    // the world pipeline's own hook (lighting, light grid, fog, vision, normal buffer), then the grass on top
    const base = worldMaterial({ outline: 0 }) as THREE.MeshLambertMaterial;
    const baseHook = base.onBeforeCompile;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh, r) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VDECL)
        .replace('#include <beginnormal_vertex>', VBEGIN)
        .replace('#include <begin_vertex>', 'vec3 transformed = gWPos;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FDECL)
        .replace('#include <map_fragment>', FMAP);
      baseHook.call(base, sh, r);
      Object.assign(sh.uniforms, this.uni);
    };
    mat.customProgramCacheKey = () => 'grass:1';
    this.mat = mat;
    // the interaction simulation: one full-screen pass into two targets (bend, state)
    this.simMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: SIM_FRAG,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        tBend: { value: null }, tState: { value: null }, uShift: { value: new THREE.Vector2() }, uWin: { value: new THREE.Vector4() },
        uRes: { value: new THREE.Vector2(1, 1) }, uMA: { value: this.mA }, uMB: { value: this.mB }, uMN: { value: 0 }, uRecover: { value: 1 / 45 },
      },
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMat);
    q.frustumCulled = false;
    this.simScene.add(q);
    bus.on('noise', (n: any) => this.onNoise(n));
  }

  // ---------------------------------------------------------------- per frame (called before every render)
  frame(dt: number) {
    const g: any = G;
    const pr = g?.pr, z: Zone | undefined = g?.view?.zone;
    if (!pr || !z) return;
    if (!this.root.parent) pr.scene.add(this.root);
    if (z !== this.zone) this.setZone(z);
    this.root.visible = this.active && this.enabled;
    if (!this.root.visible) return;
    dt = Math.min(0.05, Math.max(0, dt));
    this.time += dt;
    const eye = pr.eyeCamera as THREE.PerspectiveCamera | null;
    const fx = eye ? eye.position.x : pr.target.x, fz = eye ? eye.position.z : pr.target.z;
    const lvl = (pr.qualityOverride ?? pr.quality) as keyof typeof QUALITY;
    const Q: any = QUALITY[lvl] ?? QUALITY.high;
    if (this.soft === null) this.soft = isSoftware(pr.renderer);
    this.updateSheet(pr, dt);
    this.updateChunks(z, fx, fz, eye ? 30 : pr.lowW * pr.pxSize * 0.75 + 4, Math.min(Q.grass ?? 1, this.soft ? 0.45 : 1), 1 / pr.pxSize, !!eye);
    // wind: a slow veer, stronger in the rain
    const wet = /rain|storm/.test(z.env.weather || '') ? 1.6 : 1;
    this.windAng = 0.6 + Math.sin(this.time * 0.031) * 0.5;
    const W = this.uni.uGWind.value as THREE.Vector4;
    W.set(Math.cos(this.windAng), Math.sin(this.windAng), Math.min(1, (WIND[z.key] ?? 0.4) * wet), 1);
    if (!g.paused) this.simulate(pr.renderer, z, fx, fz, dt, this.soft ? Math.min(160, Q.grassSim ?? 256) : (Q.grassSim ?? 256));
  }

  private setZone(z: Zone) {
    this.clearChunks();
    this.zone = z;
    this.active = GRASS_ZONES.has(z.key) && hasGrass(z);
    this.hasOrigin = false;
    this.track.clear(); this.cutAt.clear();
    this.pulses = this.pulses.filter((p) => p.zone === z.key);
    if (this.rtA) this.clearSim();
  }

  private clearChunks() {
    for (const c of this.chunks.values()) { if (c.mesh) this.root.remove(c.mesh); c.geo?.dispose(); }
    this.chunks.clear();
  }

  // ---------------------------------------------------------------- the sheet (repainted for the zoom)
  private updateSheet(pr: any, dt: number) {
    if (pr.eyeCamera && this.sheet) return;
    const D = Math.max(16, Math.min(128, Math.round(1 / pr.pxSize)));
    const pitch = pr.pitch as number;
    if (this.sheet && D === this.sheet.D && Math.abs(pitch - this.sheetPitch) < 0.03) { this.wantT = 0; return; }
    // wait for a zoom to settle before repainting (the first sheet is painted at once)
    if (this.sheet) {
      if (D !== this.wantD) { this.wantD = D; this.wantT = 0; return; }
      this.wantT += dt;
      if (this.wantT < 0.25) return;
    }
    const sh = paintSheet(D, Math.cos(pitch), Math.sin(pitch));
    const tex = new THREE.DataTexture(sh.data, sh.w, sh.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
    this.sheetTex?.dispose();
    this.sheetTex = tex; this.sheet = sh; this.sheetPitch = pitch;
    this.uni.uGTex.value = tex;
    (this.uni.uGCell.value as THREE.Vector4).set(sh.cw, sh.ch, 1 / sh.w, 1 / sh.h);
    (this.uni.uGInfo.value as THREE.Vector4).set(sh.D, sh.Dv, sh.Df, 0);
    const vars = this.uni.uGVar.value as THREE.Vector4[];
    sh.box.forEach((b, i) => { vars[i].x = b[0]; vars[i].y = b[1]; vars[i].z = b[2]; });
    this.stats.D = D;
  }

  // ---------------------------------------------------------------- chunks
  private updateChunks(z: Zone, fx: number, fz: number, R: number, qd: number, ppm: number, eye: boolean) {
    const ccx = Math.floor(fx / CHUNK), ccz = Math.floor(fz / CHUNK);
    const r = Math.ceil((R + 6) / CHUNK);
    let builds = this.chunks.size === 0 ? 99 : 2;
    const t0 = performance.now();
    for (let cy = ccz - r; cy <= ccz + r; cy++) for (let cx = ccx - r; cx <= ccx + r; cx++) {
      if (cx < 0 || cy < 0 || cx >= z.chunksX || cy >= z.chunksY) continue;
      const ci = cy * z.chunksX + cx;
      if (this.chunks.has(ci)) continue;
      const dx = Math.max(0, Math.abs(fx - (cx + 0.5) * CHUNK) - CHUNK / 2), dz = Math.max(0, Math.abs(fz - (cy + 0.5) * CHUNK) - CHUNK / 2);
      if (Math.hypot(dx, dz) > R + 6) continue;
      if (builds-- <= 0) continue;
      this.chunks.set(ci, this.build(z, cx, cy));
    }
    if (performance.now() - t0 > 0.05) this.stats.buildMs = performance.now() - t0;
    // drop chunks well out of reach
    for (const [ci, c] of this.chunks) {
      if (Math.abs(c.cx - ccx) > r + 1 || Math.abs(c.cz - ccz) > r + 1) { if (c.mesh) this.root.remove(c.mesh); c.geo?.dispose(); this.chunks.delete(ci); }
    }
    // one chunk per frame checks whether its tiles changed (digging, building, a fire) and rebuilds
    const keys = [...this.chunks.keys()];
    if (keys.length) {
      const ci = keys[this.rr++ % keys.length], c = this.chunks.get(ci)!;
      if (chunkSig(z, c.cx, c.cz) !== c.sig) { if (c.mesh) this.root.remove(c.mesh); c.geo?.dispose(); this.chunks.set(ci, this.build(z, c.cx, c.cz)); }
    }
    // thinning: fewer tufts zoomed out (each is smaller on screen), with distance in first person, on lower presets
    const zf = Math.max(0.4, Math.min(1, ppm / 56));
    let inst = 0, drawn = 0, n = 0;
    for (const c of this.chunks.values()) {
      if (!c.geo) continue;
      n++;
      let f = qd * (eye ? 1 : zf);
      if (eye) { const d = Math.hypot(fx - (c.cx + 0.5) * CHUNK, fz - (c.cz + 0.5) * CHUNK); f *= Math.max(0.22, Math.min(1, 1.3 - d / 26)); }
      c.geo.instanceCount = c.nFlat + Math.round(c.nTuft * Math.min(1, f));
      inst += c.nFlat + c.nTuft; drawn += c.geo.instanceCount;
    }
    this.stats.chunks = n; this.stats.instances = inst; this.stats.drawn = drawn;
  }

  private build(z: Zone, cx: number, cy: number): GChunk {
    const sig = chunkSig(z, cx, cy);
    const c: GChunk = { ci: cy * z.chunksX + cx, sig, mesh: null, geo: null, nFlat: 0, nTuft: 0, cx, cz: cy };
    const out = growChunk(z, cx, cy);
    if (!out) return c;
    const { roots, vars, nFlat, nTuft, ymin, ymax } = out;
    const geo = new THREE.InstancedBufferGeometry();
    // the card: two columns, three rows (a curved bend), the root along the bottom
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0.45, 0, 0.5, 0.45, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    geo.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
    geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots, 4));
    geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(vars, 4));
    geo.instanceCount = nFlat + nTuft;
    const ctr = new THREE.Vector3((cx + 0.5) * CHUNK, (ymin + ymax) / 2 + 0.3, (cy + 0.5) * CHUNK);
    geo.boundingSphere = new THREE.Sphere(ctr, Math.hypot(CHUNK * 0.72, (ymax - ymin) / 2 + 0.8));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(cx * CHUNK - 0.6, ymin - 0.1, cy * CHUNK - 0.6), new THREE.Vector3((cx + 1) * CHUNK + 0.6, ymax + 0.9, (cy + 1) * CHUNK + 0.6));
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.raycast = () => { /* never picked */ };
    mesh.name = 'grass:' + c.ci;
    this.root.add(mesh);
    c.mesh = mesh; c.geo = geo; c.nFlat = nFlat; c.nTuft = nTuft;
    return c;
  }

  // ---------------------------------------------------------------- interaction simulation
  private ensureSim(r: THREE.WebGLRenderer, N: number) {
    if (this.rtA && this.simN === N) return;
    this.rtA?.dispose(); this.rtB?.dispose();
    const mk = () => new THREE.WebGLRenderTarget(N, N, { count: 2, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
    this.rtA = mk(); this.rtB = mk();
    this.simN = N; this.stats.simN = N;
    this.hasOrigin = false;
    this.clearSim(r);
  }

  private clearSim(r: THREE.WebGLRenderer = (G as any).pr.renderer) {
    const prev = r.getRenderTarget();
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const rt of [this.rtA, this.rtB]) if (rt) { r.setRenderTarget(rt); r.clear(true, false, false); }
    r.setClearColor(cc, ca);
    r.setRenderTarget(prev);
  }

  private simulate(r: THREE.WebGLRenderer, z: Zone, fx: number, fz: number, dt: number, N: number) {
    this.ensureSim(r, N);
    const tx = SIM_M / N;
    const ox = (Math.round(fx / tx) - N / 2) * tx, oz = (Math.round(fz / tx) - N / 2) * tx;
    const su = this.simMat.uniforms;
    if (this.hasOrigin) su.uShift.value.set((ox - this.origin.x) / SIM_M, (oz - this.origin.y) / SIM_M);
    else su.uShift.value.set(9, 9);   // first frame in a level: nothing carried over
    this.origin.set(ox, oz); this.hasOrigin = true;
    su.uWin.value.set(ox, oz, SIM_M, dt);
    su.uRes.value.set(N, N);
    su.uMN.value = this.gatherMovers(z, fx, fz, dt);
    su.tBend.value = this.rtA!.textures[0]; su.tState.value = this.rtA!.textures[1];
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rtB);
    r.render(this.simScene, this.simCam);
    r.setRenderTarget(prev);
    const t = this.rtA; this.rtA = this.rtB; this.rtB = t;
    this.uni.uGBend.value = this.rtA!.textures[0];
    this.uni.uGState.value = this.rtA!.textures[1];
    (this.uni.uGWin.value as THREE.Vector4).set(ox, oz, 1 / SIM_M, 1);
  }

  /** survivors, creatures, cars, items and pushes near the camera into the mover arrays; returns the count */
  private gatherMovers(z: Zone, fx: number, fz: number, dt: number): number {
    const g: any = G;
    const cand: { x: number; z: number; r: number; s: number; kind: number; vx: number; vz: number; w: number; pri: number }[] = [];
    const half = SIM_M / 2 - 1;
    const near = (x: number, zz: number) => Math.abs(x - fx) < half && Math.abs(zz - fz) < half;
    const vel = (key: string, x: number, zz: number) => {
      let t = this.track.get(key);
      if (!t) { t = { x, z: zz, vx: 0, vz: 0, seen: this.time }; this.track.set(key, t); }
      if (dt > 0) {
        const k = Math.min(1, dt * 12);
        t.vx += ((x - t.x) / dt - t.vx) * k; t.vz += ((zz - t.z) / dt - t.vz) * k;
        if (Math.hypot(x - t.x, zz - t.z) > 3) { t.vx = 0; t.vz = 0; }   // a teleport, not a sprint
      }
      t.x = x; t.z = zz; t.seen = this.time;
      return t;
    };
    const body = (key: string, x: number, zz: number, r: number, s: number, w: number, pri: number) => {
      if (!near(x, zz)) return;
      const t = vel(key, x, zz);
      cand.push({ x, z: zz, r, s, kind: 0, vx: t.vx, vz: t.vz, w, pri });
    };
    // survivors (crawling flattens more)
    for (const p of g.players?.values?.() ?? []) {
      if (p.zoneKey !== z.key || p.inVehicle) continue;
      const crawl = p.stance === 'crawl';
      body('p' + p.id, p.x, p.z, crawl ? 0.6 : 0.48, crawl ? 1.1 : 1, crawl ? 1.8 : 0.8, 0);
    }
    // creatures: the big ones flatten wide swathes, corpses lie in the grass they crushed
    for (const c of g.creatures?.creatures?.values?.() ?? []) {
      if (c.zoneKey !== z.key || c.sp?.flags?.flying) continue;
      if (c.y > z.heightAt(Math.floor(c.x), Math.floor(c.z)) + 0.8) continue;
      const r = Math.max(0.2, Math.min(2.4, c.radius ?? 0.4));
      body('c' + c.id, c.x, c.z, c.dead ? r * 0.9 : r, Math.min(1.15, 0.85 + r * 0.2), c.dead ? 0.35 : 0.4 + r * 1.2, 1 + Math.hypot(c.x - fx, c.z - fz) * 0.05);
    }
    // cars: two axles
    for (const v of g.vehicles?.vehicles?.values?.() ?? []) {
      if (v.zone !== z.key) continue;
      const f = v.fwd;
      body('va' + v.id, v.x + f.x * 1.2, v.z + f.z * 1.2, 1.0, 1.1, 2, 2);
      body('vb' + v.id, v.x - f.x * 1.2, v.z - f.z * 1.2, 1.0, 1.1, 2, 2);
    }
    // items: flying ones brush the tips as they come down, the ones lying there press the grass flat
    const items = floorItems(z);
    if (items.size) {
      let k = 0;
      for (const wi of items.values()) {
        if (!near(wi.x, wi.z) || Math.abs(wi.x - fx) > 18 || Math.abs(wi.z - fz) > 18) continue;
        const gy = z.heightAt(Math.floor(wi.x), Math.floor(wi.z));
        if (wi.y - gy > 0.6) continue;
        const kg = itemDef(wi.item.key)?.weight ?? 0.5;
        const r = 0.12 + Math.min(0.25, kg * 0.05);
        body('i' + wi.item.uid, wi.x, wi.z, r, wi.vy !== undefined ? 1.1 : 0.8, wi.vy !== undefined ? 0 : 0.25, 3 + Math.hypot(wi.x - fx, wi.z - fz) * 0.1);
        if (++k > 40) break;
      }
    }
    // pushes (shots, landings, swings, cuts): delivered once
    const now = this.time;
    for (const p of this.pulses) if (p.zone === z.key && p.at <= now && near(p.x, p.z)) cand.push({ x: p.x, z: p.z, r: p.r, s: p.s, kind: p.kind, vx: p.dx, vz: p.dz, w: 0, pri: -1 });
    this.pulses = this.pulses.filter((p) => p.at > now && now - p.at < 5);
    // forget movers that left
    if (this.track.size > 200) for (const [k, t] of this.track) if (this.time - t.seen > 2) this.track.delete(k);
    cand.sort((a, b) => a.pri - b.pri);
    const n = Math.min(MAXM, cand.length);
    for (let i = 0; i < n; i++) {
      const c = cand[i], o = i * 4;
      this.mA[o] = c.x; this.mA[o + 1] = c.z; this.mA[o + 2] = c.r; this.mA[o + 3] = c.s;
      this.mB[o] = c.vx; this.mB[o + 1] = c.vz; this.mB[o + 2] = c.kind; this.mB[o + 3] = c.w;
    }
    this.stats.movers = n;
    return n;
  }

  /** a push for the simulation: kind 1 an outward shove, 2 a cut */
  pulse(x: number, z: number, r: number, s: number, kind = 1, delay = 0, dx = 0, dz = 0) {
    const zk = (G as any)?.local?.zoneKey ?? '';
    if (this.pulses.length < 64) this.pulses.push({ x, z, r, s, kind, dx, dz, zone: zk, at: this.time + delay });
  }

  private onNoise(n: { x: number; z: number; radius: number; kind: string; zone: string; by?: string }) {
    if (!this.active || !this.zone || n.zone !== this.zone.key) return;
    const g: any = G;
    const p = n.by ? g.players?.get?.(n.by) : null;
    if (n.kind === 'gun') {
      // the muzzle blast, and the round's path combing the grass flat for a moment
      this.pulse(n.x, n.z, 2.4, 4.5);
      if (p) {
        const a = Math.atan2(p.aimZ - p.z, p.aimX - p.x), cx = Math.cos(a), cz = Math.sin(a);
        for (let k = 1; k <= 8; k++) this.pulse(p.x + cx * k * 1.6, p.z + cz * k * 1.6, 0.8, 3, 1, k * 0.012, cx * 0.6, cz * 0.6);
      }
    } else if (n.kind === 'thrown') this.pulse(n.x, n.z, 1.4, 3);
    else if (n.kind === 'melee' && p) {
      const a = p.facing ?? 0, ax = p.x + Math.cos(a) * 0.85, az = p.z + Math.sin(a) * 0.85;
      this.pulse(ax, az, 1.1, 2);
      const d = p.handR ? itemDef(p.handR.key) : null;
      const k = d?.weapon?.kind;
      if (k === 'blade' || k === 'axe' || (d?.tags ?? []).includes('sharp')) this.cut(p, ax, az);
    } else if (/expl|blast|boom/.test(n.kind)) this.pulse(n.x, n.z, Math.min(8, n.radius * 0.2), 7);
  }

  /** a blade through the grass: the tops come off, and now and then a handful drops to pick up */
  private cut(p: any, x: number, zz: number) {
    const z = this.zone;
    if (!z) return;
    const tx = Math.floor(x), ty = Math.floor(zz);
    if (!z.inb(tx, ty)) return;
    const f = z.floorAt(tx, ty);
    if (!f || GRASS_FLOORS[f.key] === undefined) return;
    this.pulse(x, zz, 0.95, 1, 2);
    const g: any = G;
    if (p !== g.local || this.time - this.lastCutDrop < 1.2 || !hasItemDef('cut_grass')) return;
    const i = z.idx(tx, ty), last = this.cutAt.get(i) ?? -1e9;
    if (this.time - last < 150) return;
    this.cutAt.set(i, this.time);
    this.lastCutDrop = this.time;
    try {
      const it = createItem('cut_grass', undefined, { pristine: true });
      op('dropFloor', { z: z.key, item: serializeItem(it), x, zz, y: z.heightAt(tx, ty) + 0.4, v: [Math.cos(p.facing) * 0.6, 1.2, Math.sin(p.facing) * 0.6] });
    } catch (e) { console.warn('cut grass', e); }
  }

  /** dev: drop every chunk so they are grown again (after tuning) */
  rebuild() { this.clearChunks(); }
}

/** SwiftShader / llvmpipe: every fragment costs CPU time, so the grass goes light */
function isSoftware(r: THREE.WebGLRenderer): boolean {
  try {
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch { return false; }
}

// ---------------------------------------------------------------- growing a chunk
function hasGrass(z: Zone): boolean {
  for (let i = 0; i < z.floor.length; i++) { const f = z.floor[i]; if (f && GRASS_FLOORS[floorDef(f)?.key ?? ''] !== undefined) return true; }
  return false;
}

function chunkSig(z: Zone, cx: number, cy: number): number {
  let h = 0;
  for (let y = cy * CHUNK; y < Math.min(z.H, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(z.W, (cx + 1) * CHUNK); x++) {
    const i = z.idx(x, y);
    h = (Math.imul(h, 31) + z.floor[i] * 7 + z.solid[i] * 3 + (z.height[i] & 255) * 13 + (z.tileObjs.get(i)?.length ?? 0)) | 0;
  }
  return h;
}

const pick = (k: Kind, r: number) => { const a = BY_KIND[k]; return a[Math.min(a.length - 1, Math.floor(r * a.length))]; };

function growChunk(z: Zone, cx: number, cy: number) {
  const roots: number[] = [], vars: number[] = [], flats: number[] = [], flatV: number[] = [];
  let ymin = 1e9, ymax = -1e9;
  const seed = (z.seed ?? 1) & 0xffff;
  const bioAt = (x: number, y: number) => { if (!z.inb(x, y)) return -1; const f = z.floor[z.idx(x, y)]; if (!f) return -1; const b = GRASS_FLOORS[floorDef(f)?.key ?? '']; return b === undefined ? -1 : b; };
  for (let y = cy * CHUNK; y < Math.min(z.H, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(z.W, (cx + 1) * CHUNK); x++) {
    const bio = bioAt(x, y);
    const i = z.idx(x, y);
    if (bio < 0) {
      // the grass creeps over the edge of a path, a kerb, a patio: a few short blades on this side of the seam
      const f = z.floor[i];
      if (!f || z.solid[i] || floorDef(f)?.water) continue;
      const gy = z.height[i] * 0.1;
      const spill = (nb: number, at: (t: number, d: number) => [number, number]) => {
        if (nb < 0) return;
        for (let k = 0; k < 3; k++) {
          const t = (k + hf(x * 3 + k, y, seed + 131)) / 3, d = 0.02 + 0.12 * hf(x, y * 3 + k, seed + 137);
          if (hf(x + k, y - k, seed + 139) < 0.3) continue;
          const [u, v] = at(t, d);
          roots.push(x + u, gy, y + v, hf(x, y + k, seed + 149));
          vars.push(pick(hf(y, x + k, seed + 151) < 0.75 ? 'short' : 'tuft', hf(x + k, y, seed + 157)), nb, 0, 0);
        }
      };
      if (!z.wallN[i]) spill(bioAt(x, y - 1), (t, d) => [t, d]);
      if (!(z.inb(x, y + 1) && z.wallN[z.idx(x, y + 1)])) spill(bioAt(x, y + 1), (t, d) => [t, 1 - d]);
      if (!z.wallW[i]) spill(bioAt(x - 1, y), (t, d) => [d, t]);
      if (!(z.inb(x + 1, y) && z.wallW[z.idx(x + 1, y)])) spill(bioAt(x + 1, y), (t, d) => [1 - d, t]);
      ymin = Math.min(ymin, gy); ymax = Math.max(ymax, gy);
      continue;
    }
    if (z.solid[i] === 1 || z.solid[i] === 3) continue;
    const B = BIOMES[bio];
    const gy = z.height[i] * 0.1;
    let tallObj = false, flowerObj = false, blocked = false;
    for (const o of z.objectsAt(x, y)) {
      if (o.key === 'grass_tall') tallObj = true;
      else if (o.key === 'flowers') flowerObj = true;
      else { const d = objDef(o.key); if (d && d.block !== 'none' && !d.onWall && !d.ceiling && (d.height ?? 1) > 0.05) blocked = true; }
    }
    if (blocked) continue;
    // what each side of the tile meets: a wall or fence or something tall (long grass grows up against it),
    // a path or other ground (trodden short), or more grass
    const side = (nx: number, ny: number, wall: boolean): number => {
      if (wall) return 2;
      if (!z.inb(nx, ny)) return 1;
      const j = z.idx(nx, ny);
      if (z.solid[j] === 1) return 2;
      if (z.height[j] - z.height[i] > 1) return 2;
      return bioAt(nx, ny) < 0 ? 1 : 0;
    };
    const sN = side(x, y - 1, !!z.wallN[i]), sS = side(x, y + 1, z.inb(x, y + 1) && !!z.wallN[z.idx(x, y + 1)]);
    const sW = side(x - 1, y, !!z.wallW[i]), sE = side(x + 1, y, z.inb(x + 1, y) && !!z.wallW[z.idx(x + 1, y)]);
    const lush = n2(x * 0.09, y * 0.09, seed + 11);
    const flowerF = n2(x * 0.17, y * 0.17, seed + 23);
    const dryF = n2(x * 0.07, y * 0.07, seed + 37);
    const cloverF = n2(x * 0.13, y * 0.13, seed + 41);
    const trail = Math.abs(n2(x * 0.045, y * 0.045, seed + 53) - 0.5);
    const bareAt = (px: number, py: number) => n2(px * 0.23, py * 0.23, seed + 67);
    const bareThr = B.bare + (bio === 0 ? 0.04 : 0);
    // a patch of bare earth in the middle of the tile
    if (bareAt(x + 0.5, y + 0.5) > bareThr + 0.02 && !tallObj) {
      const nf = 1 + (hf(x, y, seed + 71) < 0.5 ? 1 : 0);
      for (let k = 0; k < nf; k++) {
        flats.push(x + 0.3 + hf(x, y, seed + 73 + k) * 0.4, gy, y + 0.3 + hf(x, y, seed + 79 + k) * 0.4, hf(x, y, seed + 83 + k));
        flatV.push(pick('flat', hf(x, y, seed + 89 + k)), bio, 0, 0);
      }
    }
    const nBase = Math.round(B.dens * (0.62 + 0.76 * lush) * (tallObj ? 1.4 : 1));
    const pts: [number, number][] = [];
    const gs = Math.max(1, Math.ceil(Math.sqrt(nBase)));
    for (let k = 0; k < nBase; k++) {
      const gx = k % gs, gz = Math.floor(k / gs) % gs;
      pts.push([(gx + 0.1 + 0.8 * hf(x * 7 + k, y, seed + 97)) / gs, (gz + 0.1 + 0.8 * hf(x, y * 7 + k, seed + 101)) / gs]);
    }
    // long grass crowding the foot of walls, fences and anything tall beside it
    const along = (s: number, fx: (t: number, d: number) => [number, number]) => { if (s !== 2) return; for (let k = 0; k < 5; k++) pts.push(fx((k + hf(x, y, seed + 103 + k)) / 5, 0.03 + 0.17 * hf(y, x, seed + 107 + k))); };
    along(sN, (t, d) => [t, d]); along(sS, (t, d) => [t, 1 - d]); along(sW, (t, d) => [d, t]); along(sE, (t, d) => [1 - d, t]);
    for (let k = 0; k < pts.length; k++) {
      const [u, v] = pts[k];
      const px = x + u, pz = y + v;
      const r = (s: number) => hf(Math.floor(px * 977), Math.floor(pz * 977), seed + s);
      const bv = bareAt(px, pz);
      if (bv > bareThr && !tallObj) continue;
      const dWall = Math.min(sN === 2 ? v : 1, sS === 2 ? 1 - v : 1, sW === 2 ? u : 1, sE === 2 ? 1 - u : 1);
      const dPath = Math.min(sN === 1 ? v : 1, sS === 1 ? 1 - v : 1, sW === 1 ? u : 1, sE === 1 ? 1 - u : 1);
      if (dPath < 0.12 && r(1) < 0.5) continue;
      let kind: Kind;
      const fr = B.flowers * (0.25 + 1.6 * flowerF * flowerF) * (flowerObj ? 3 : 1);
      if (r(2) < fr && dPath > 0.2) { const h = r(3); kind = h < B.flowerMix[0] ? 'flowerW' : h < B.flowerMix[1] ? 'flowerY' : 'flowerP'; }
      else if (dWall < 0.26 || (tallObj && r(4) < 0.6) || r(4) < B.tall * (0.3 + lush * 1.4)) kind = r(5) < B.straw * 2 ? 'straw' : 'tall';
      else if (dPath < 0.3 || trail < 0.028 || bv > bareThr - 0.05 || r(6) < B.short * (1.2 - lush * 0.5)) kind = 'short';
      else if (r(7) < B.clover * (0.4 + 1.2 * cloverF)) kind = 'clover';
      else if (r(8) < B.straw * (0.3 + 1.8 * dryF * dryF)) kind = 'straw';
      else kind = 'tuft';
      roots.push(px, gy, pz, r(9));
      vars.push(pick(kind, r(10)), bio, 0, 0);
    }
    ymin = Math.min(ymin, gy); ymax = Math.max(ymax, gy);
  }
  const nFlat = flats.length / 4, nTuft = roots.length / 4;
  if (!nFlat && !nTuft) return null;
  // shuffle the tufts so any prefix is an even thinning of the whole chunk
  const rng = new Pcg(cx * 73856093 ^ cy * 19349663 ^ seed);
  for (let i = nTuft - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    for (let c = 0; c < 4; c++) { const a = roots[i * 4 + c]; roots[i * 4 + c] = roots[j * 4 + c]; roots[j * 4 + c] = a; const b = vars[i * 4 + c]; vars[i * 4 + c] = vars[j * 4 + c]; vars[j * 4 + c] = b; }
  }
  return {
    roots: new Float32Array([...flats, ...roots]), vars: new Uint8Array([...flatV, ...vars]),
    nFlat, nTuft, ymin, ymax,
  };
}

// ---------------------------------------------------------------- install
let sys: GrassSystem | null = null;
export function installGrass(g: any) {
  if (sys || !g?.pr) return sys;
  sys = new GrassSystem();
  const s = sys;
  g.grass = s;
  g.pr.beforeRender.push((dt: number) => { try { s.frame(dt); } catch (e) { console.warn('grass', e); } });
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nograss')) s.enabled = false;
  if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__grass = s;
  return s;
}

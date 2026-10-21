// Small shared kit for the rule-bound species and the dimension creatures
// (bubbles, chess pieces, moon things, tallyman, mirrorling, lintel, tithe,
// hush, cowerling). Builds on the beast kit (pages, OB, bpart): translucent
// parts, a few painting recipes (skin, soap film, marble, eyes, cut ends),
// rotation helpers, floor markers drawn in world space from a rig, and the
// chessboard maths.
import * as THREE from 'three';
import { Page, Painter, Reg, OB, V3, cachedGeo, ramp, clamp01, bpart as bpartOf, beastMaterial } from './beasts';
import { mixHex, ph } from '../../gfx/pixel';
import { worldMaterial } from '../../gfx/materials';
import type { Rig } from '../species';
import type { Creature } from '../creature';
import type { Zone } from '../../world/zone';
import type { Player } from '../../entities/player';
import type { InjuryType } from '../../survival/body';
import { G } from '../../game/G';
import { applyHitToPlayer, type HitInfo } from '../manager';

// ------------------------------------------------------------------ parts
const TMAT = new Map<string, THREE.Material>();
/** see-through material sharing the atlas (soap film, glass, wisps) */
export function filmMat(opacity = 0.5, additive = false): THREE.Material {
  const k = opacity + ':' + additive;
  let m = TMAT.get(k);
  if (!m) { m = worldMaterial({ transparent: true, opacity, depthWrite: false, additive, outline: 0 }); m.userData.film = true; TMAT.set(k, m); }
  return m;
}
// ------------------------------------------------------------------ surface shading
/**
 * Realistic surfaces layered on the world material (same atlas, light grid,
 * fog, visibility, outlines and normal buffer; only the final lighting is
 * reshaded, in view space, before the colour is written):
 *  - film: soap-bubble thin-film interference (colour bands that swirl and
 *    shift with the viewing angle), fresnel edges, a sharp window highlight;
 *    the middle of the film goes clear, the rim holds the colour.
 *  - lacquer: polished stone / lacquer / metal: a hard clear-coat highlight
 *    over a broad sheen, and the room reflected at grazing angles (fresnel).
 *  - regolith: moon dust: flat back-scattering with an opposition glow, limb
 *    brightening instead of shading, a pale dust bloom on the silhouette and
 *    single grains that glint.
 */
export type Surface = 'film' | 'lacquer' | 'regolith';
const SURF_COMMON = /* glsl */`
  vec3 sNv = normalize(normal);
  vec3 sVv = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
  float sCos = clamp(dot(sNv, sVv), 0.0, 1.0);
  float sLum = clamp(dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.3, 0.59, 0.11)) / max(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), 0.04), 0.0, 3.0);
  vec3 sLd = normalize((viewMatrix * vec4(0.25, 1.0, 0.35, 0.0)).xyz);
#if NUM_DIR_LIGHTS > 0
  sLd = normalize(mix(sLd, directionalLights[0].direction, 0.6));
#endif
  vec3 sH = normalize(sLd + sVv);
  float sNH = max(dot(sNv, sH), 0.0);
`;
const SURF: Record<Surface, string> = {
  film: /* glsl */`{
${SURF_COMMON}
  float sC = abs(dot(sNv, sVv));
  float fres = pow(1.0 - sC, 3.0);
  float th = 0.55 + 0.25 * sin(vWPos.y * 11.0 + vWPos.x * 6.0 + uTime * 0.7) + 0.2 * sin(vWPos.z * 9.0 - uTime * 0.45 + vWPos.y * 4.0);
  float ph = th * 2.4 * sqrt(max(0.0, 1.0 - (1.0 - sC * sC) / 1.77));
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (ph * vec3(1.0, 1.21, 1.47) + vec3(0.0, 0.1, 0.2)));
  float spec = pow(sNH, 90.0) * 2.2 + pow(sNH, 12.0) * 0.18;
  outgoingLight = mix(outgoingLight, irid * (0.35 + sLum * 0.55), 0.35 + 0.5 * fres) + vec3(spec) * (0.4 + sLum * 0.6);
  diffuseColor.a *= clamp(0.35 + 0.65 * fres + spec * 0.5, 0.0, 1.0);
}`,
  lacquer: /* glsl */`{
${SURF_COMMON}
  float coat = pow(sNH, 140.0) * 1.6 + pow(sNH, 24.0) * 0.22;
  float fres = 0.04 + 0.96 * pow(1.0 - sCos, 5.0);
  vec3 sR = reflect(-sVv, sNv);
  vec3 sRw = (vec4(sR, 0.0) * viewMatrix).xyz;
  vec3 env = mix(vec3(0.04, 0.035, 0.03), vec3(0.92, 0.88, 0.8), smoothstep(-0.2, 0.6, sRw.y)) * (0.2 + sLum * 0.5);
  outgoingLight = mix(outgoingLight, env, fres * 0.55) + vec3(coat) * (0.25 + sLum * 0.75);
}`,
  regolith: /* glsl */`{
${SURF_COMMON}
  float opp = pow(max(dot(sLd, sVv), 0.0), 6.0) * 0.25;
  outgoingLight *= 0.9 + opp + 0.2 * (1.0 - sCos);
  outgoingLight += vec3(0.55, 0.56, 0.6) * pow(1.0 - sCos, 3.0) * 0.2 * sLum;
  vec3 gp = floor(vWPos * 70.0);
  float gh = fract(sin(dot(gp, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  outgoingLight += vec3(step(0.985, gh) * pow(sNH, 8.0) * 1.4 * sLum);
}`,
};
const SURF_CACHE = new Map<string, THREE.Material>();
/** the world material `o` with a surface reshade (cached; shares the world material's uniforms) */
export function surfaceMat(kind: Surface, o: Parameters<typeof worldMaterial>[0] = {}): THREE.Material {
  const key = kind + JSON.stringify(o);
  let m = SURF_CACHE.get(key);
  if (m) return m;
  const base = worldMaterial(o) as THREE.MeshLambertMaterial;
  const mat = base.clone();
  const baseKey = base.customProgramCacheKey();
  mat.onBeforeCompile = (shader, r) => {
    base.onBeforeCompile(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', SURF[kind] + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => baseKey + ':surf:' + kind;
  SURF_CACHE.set(key, mat);
  return mat;
}
/** reshade a built rig: opaque beast parts get `solid`, see-through film parts get `film` (or keep theirs) */
export function surface(rig: Rig, solid: Surface | null, filmToo = true) {
  const beast = beastMaterial();
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.material === beast) { if (solid) m.material = surfaceMat(solid, { alphaTest: 0.5 }); }
    else if (filmToo && (m.material as THREE.Material).userData?.film) {
      const fm = m.material as THREE.Material;
      if (!fm.blending || fm.blending === THREE.NormalBlending) m.material = surfaceMat('film', { transparent: true, opacity: fm.opacity, depthWrite: false, outline: 0 });
    }
  });
}

/** a rig part like bpart() with its own material */
export function tpart(rig: Rig, name: string, parent: THREE.Object3D, at: V3, page: Page, key: string, mat: THREE.Material, fn: (ob: OB) => void): THREE.Group {
  const g = new THREE.Group();
  g.name = name; g.position.set(at[0], at[1], at[2]);
  const gk = page.key + ':' + key;
  const geo = cachedGeo(gk, page, fn);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.gk = gk; mesh.userData.page = page.key;
  mesh.renderOrder = 2;
  g.add(mesh);
  parent.add(g);
  rig.parts[name] = g;
  return g;
}
/** rotate a named part (missing parts are ignored) */
export function rot(rig: Rig, n: string, x: number, y = 0, z = 0) { const o = rig.parts[n]; if (o) o.rotation.set(x, y, z); }
export function scl(rig: Rig, n: string, x: number, y = x, z = x) { const o = rig.parts[n]; if (o) o.scale.set(x, y, z); }
export function vis(rig: Rig, n: string, v: boolean) { const o = rig.parts[n]; if (o) o.visible = v; }

// ------------------------------------------------------------------ shapes
/** surface of revolution about +y: profile of [y, radius] from bottom to top */
export function lathe(ob: OB, prof: [number, number][], segs: number, reg: Reg, o: { emis?: number; start?: 'pole' | 'flat' | null; end?: 'pole' | 'flat' | null; cx?: number; cz?: number; sx?: number; sz?: number } = {}) {
  const ys = prof.map((p) => p[0]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const rings = prof.map(([y, r]) => {
    const pts: V3[] = [];
    for (let j = 0; j <= segs; j++) { const a = (j / segs) * Math.PI * 2; pts.push([(o.cx ?? 0) + Math.cos(a) * r * (o.sx ?? 1), y, (o.cz ?? 0) + Math.sin(a) * r * (o.sz ?? 1)]); }
    return { pts, v: 0.04 + 0.92 * ((y - y0) / ((y1 - y0) || 1)), emis: o.emis };
  });
  ob.loft(rings, reg, { start: o.start === undefined ? 'flat' : o.start, end: o.end === undefined ? 'flat' : o.end });
}
/** a box from six quads (flat shaded), centre c, full size s */
export function obox(ob: OB, c: V3, s: V3, reg: Reg, o: { emis?: number; col?: number } = {}) {
  const [x, y, z] = c, hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
  const P = (a: number, b: number, d: number): V3 => [x + a * hx, y + b * hy, z + d * hz];
  const faces: [V3, V3, V3, V3][] = [
    [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)],
    [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)], [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)],
    [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)],
  ];
  const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const f of faces) {
    const ids = f.map((q, i) => ob.vert(q, reg, uv[i][0], uv[i][1], ob.newGroup(), o.col ?? 1, o.emis ?? 0));
    ob.triOut(ids[0], ids[1], ids[2], c); ob.triOut(ids[0], ids[2], ids[3], c);
  }
}

// ------------------------------------------------------------------ thin humanoids (tallyman, mirrorling, hush)
export interface HumSpec {
  page: Page; key: string;
  hipY: number; hipW: number; shoulderW: number;
  torsoLen: number; torsoR: [number, number]; waistR: [number, number];
  neckLen: number; neckR: number;
  upper: number; fore: number; armR: number;
  thigh: number; shin: number; legR: number;
  body: Reg; limb: Reg; hand?: Reg;
  /** head geometry, origin at the top of the neck */
  head: (ob: OB) => void;
  /** extra torso geometry (origin at the waist) */
  torso?: (ob: OB) => void;
  fingers?: number; fingerLen?: number;
}
/** a thin jointed body: pelvis, torso, neck, head, arm/fore/hand and thigh/shin/foot per side (L = +x) */
export function buildHumanoid(rig: Rig, s: HumSpec) {
  const pg = s.page, K = s.key;
  const pelvis = bpartOf(rig, 'pelvis', rig.body, [0, s.hipY, 0], pg, K + 'pelvis', (ob) => ob.blob([0, 0, 0], [s.hipW * 0.6, 0.09, s.waistR[1]], 8, 5, s.body));
  const torso = bpartOf(rig, 'torso', pelvis, [0, 0.04, 0], pg, K + 'torso', (ob) => {
    ob.tube([[0, 0, 0], [0, s.torsoLen * 0.45, 0.01], [0, s.torsoLen * 0.85, 0], [0, s.torsoLen, -0.01]], [s.waistR, [s.waistR[0] * 1.1, s.waistR[1]], s.torsoR, [s.torsoR[0] * 0.6, s.torsoR[1] * 0.7]], 10, s.body, { start: 'flat', end: 'pole', up: [0, 0, 1] });
    s.torso?.(ob);
  });
  const neck = bpartOf(rig, 'neck', torso, [0, s.torsoLen, 0], pg, K + 'neck', (ob) => ob.tube([[0, 0, 0], [0, s.neckLen, 0.02]], [s.neckR, s.neckR * 0.85], 7, s.limb, { up: [0, 0, 1] }));
  bpartOf(rig, 'head', neck, [0, s.neckLen, 0.02], pg, K + 'head', s.head);
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    const arm = bpartOf(rig, 'arm' + side, torso, [k * s.shoulderW / 2, s.torsoLen - 0.06, 0], pg, K + 'arm', (ob) => ob.tube([[0, 0, 0], [0, -s.upper * 0.5, 0], [0, -s.upper, 0]], [s.armR, s.armR * 0.85, s.armR * 0.75], 6, s.limb, { start: 'pole', up: [0, 0, 1] }));
    const fore = bpartOf(rig, 'fore' + side, arm, [0, -s.upper, 0], pg, K + 'fore', (ob) => ob.tube([[0, 0, 0], [0, -s.fore * 0.5, 0], [0, -s.fore, 0]], [s.armR * 0.75, s.armR * 0.65, s.armR * 0.55], 6, s.limb, { start: 'pole', up: [0, 0, 1] }));
    bpartOf(rig, 'hand' + side, fore, [0, -s.fore, 0], pg, K + 'hand', (ob) => {
      const H = s.hand ?? s.limb;
      ob.blob([0, -0.03, 0], [s.armR * 0.9, 0.04, s.armR * 0.6], 6, 4, H);
      const nf = s.fingers ?? 4, fl = s.fingerLen ?? 0.08;
      for (let f = 0; f < nf; f++) ob.cone([(f - (nf - 1) / 2) * s.armR * 0.45, -0.06, 0.005], [(f - (nf - 1) / 2) * 0.08, -1, 0.1], s.armR * 0.2, fl, 3, H);
    });
    void fore;
    const th = bpartOf(rig, 'thigh' + side, pelvis, [k * s.hipW / 2, -0.02, 0], pg, K + 'thigh', (ob) => ob.tube([[0, 0, 0], [0, -s.thigh * 0.5, 0.01], [0, -s.thigh, 0]], [s.legR, s.legR * 0.85, s.legR * 0.7], 7, s.limb, { start: 'pole', up: [0, 0, 1] }));
    const sh = bpartOf(rig, 'shin' + side, th, [0, -s.thigh, 0], pg, K + 'shin', (ob) => ob.tube([[0, 0, 0], [0, -s.shin * 0.5, -0.01], [0, -s.shin, 0]], [s.legR * 0.7, s.legR * 0.6, s.legR * 0.5], 7, s.limb, { start: 'pole', up: [0, 0, 1] }));
    bpartOf(rig, 'foot' + side, sh, [0, -s.shin, 0], pg, K + 'foot', (ob) => ob.blob([0, -0.02, 0.05], [s.legR * 0.7, 0.03, 0.1], 6, 4, s.limb));
  }
}
/** a plain walk cycle for buildHumanoid bodies; `k` scales everything (0 = stand) */
export function humWalk(rig: Rig, c: { phase: number; speed: number }, t: number, o: { stride?: number; arms?: number; bob?: number; k?: number; seed?: number } = {}) {
  const k = o.k ?? Math.min(1, c.speed / 1.2);
  const ph = c.phase * 0.5, st = (o.stride ?? 0.5) * k, ar = (o.arms ?? 0.4) * k;
  for (const [side, sg] of [['L', 1], ['R', -1]] as const) {
    const sw = Math.sin(ph + (sg > 0 ? 0 : Math.PI));
    rot(rig, 'thigh' + side, -sw * st, 0, 0);
    rot(rig, 'shin' + side, Math.max(0, -Math.cos(ph + (sg > 0 ? 0 : Math.PI))) * st * 1.6, 0, 0);
    rot(rig, 'foot' + side, 0, 0, 0);
    rot(rig, 'arm' + side, sw * ar, 0, sg * 0.08);
    rot(rig, 'fore' + side, -0.15 - Math.abs(sw) * ar * 0.4, 0, 0);
    rot(rig, 'hand' + side, 0, 0, 0);
  }
  const pel = rig.parts.pelvis;
  if (pel) pel.position.y = (pel.userData.y0 ??= pel.position.y) + Math.abs(Math.cos(ph)) * (o.bob ?? 0.03) * k + Math.sin(t * 1.2 + (o.seed ?? 0) * 6) * 0.008;
}

// ------------------------------------------------------------------ painting
/** vertical light falloff + mottling with a ramp index range */
export function skin(P: Painter, r: Reg, R: number[], o: { lo?: number; hi?: number; mott?: number; salt?: number; spots?: [number, number]; stripes?: number } = {}) {
  const lo = o.lo ?? 1, hi = o.hi ?? R.length - 2;
  P.fill(r, R, (u, v, x, y) => {
    let l = lo + (hi - lo) * (0.35 + v * 0.55) + (P.n(r, x, y, 3, 2, o.salt ?? 1) - 0.5) * (o.mott ?? 2);
    if (o.spots && ph(x >> 1, y >> 1, (o.salt ?? 1) + 9) < o.spots[0]) l -= o.spots[1];
    if (o.stripes && Math.sin(u * Math.PI * 2 * o.stripes + P.n(r, x, y, 2, 1, 4) * 3) > 0.7) l -= 1.2;
    return l;
  });
}
/** soap film: bands of shifting colour with bright rims and a window highlight */
export function film(P: Painter, r: Reg, pal: number[], o: { salt?: number; bands?: number; glint?: boolean } = {}) {
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const u = (x + 0.5) / r.w, v = (y + 0.5) / r.h;
    const t = (Math.sin(v * Math.PI * (o.bands ?? 3) + Math.sin(u * Math.PI * 4) * 1.4 + P.n(r, x, y, 2, 2, o.salt ?? 2) * 4) * 0.5 + 0.5) * (pal.length - 1);
    const i = Math.floor(t), f = t - i;
    let c = mixHex(pal[i], pal[Math.min(pal.length - 1, i + 1)], f);
    if (v < 0.12 || v > 0.9) c = mixHex(c, 0xffffff, 0.35);
    P.set(r, x, y, c);
  }
  if (o.glint !== false) { P.spot(r, r.w * 0.3, r.h * 0.3, r.w * 0.06, r.h * 0.07, 0xffffff, 0.95); P.spot(r, r.w * 0.36, r.h * 0.42, r.w * 0.025, r.h * 0.03, 0xffffff, 0.8); }
}
/** polished stone with veins */
export function marble(P: Painter, r: Reg, base: number, vein: number, o: { salt?: number; gloss?: number } = {}) {
  const R = ramp(base, 6, mixHex(base, 0x000000, 0.45), 0.35);
  P.fill(r, R, (u, v, x, y) => 1.6 + v * 2.2 + (P.n(r, x, y, 3, 2, o.salt ?? 3) - 0.5) * 1.4, 0.4);
  for (let i = 0; i < Math.max(2, Math.round(r.w * r.h / 260)); i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), P.rng.int(8, 18), P.rng.float(-1, 1), P.rng.float(-1, 1), vein, 0.55, 0.7, 0.2);
  if (o.gloss) for (let y = 0; y < r.h; y += 5) P.glint(r, (y * 7) % r.w, y, 3, 0xffffff, o.gloss);
}
/** a wet round eye filling the region */
export function eye(P: Painter, r: Reg, iris: number, o: { pupil?: number; sclera?: number; slit?: boolean; glow?: boolean } = {}) {
  const cx = r.w / 2, cy = r.h / 2, R0 = Math.min(r.w, r.h) / 2;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const dx = (x + 0.5 - cx) / R0, dy = (y + 0.5 - cy) / R0, d = Math.hypot(dx, dy);
    let c = o.sclera ?? 0xe8e0d0;
    if (d < 0.62) c = mixHex(iris, 0x000000, d * 0.6);
    const pd = o.slit ? Math.abs(dx) * 3.2 + Math.abs(dy) * 0.4 : d * 2.2;
    if (pd < 0.55) c = o.pupil ?? 0x080808;
    if (d > 0.95) c = mixHex(c, 0x000000, 0.5);
    P.set(r, x, y, c);
  }
  P.spot(r, cx - R0 * 0.35, cy - R0 * 0.35, Math.max(0.6, R0 * 0.18), Math.max(0.6, R0 * 0.18), 0xffffff, 0.95);
}
/** the end of a cut part: a rim of skin round meat (or stone, or glass) */
export function cutEnd(P: Painter, r: Reg, skinC: number, meat = 0x8a1c1c) { P.cut(r, skinC, { meat }); }
/**
 * A small hand-painted swatch for hard materials (teeth, brass, cloth, trims):
 * lit from the top, a bright rim row, a dark lower edge, dithered wear and
 * specks, so even the small parts read as painted rather than flat colour.
 */
export function flat(P: Painter, r: Reg, c: number, vary = 0.08) {
  const R = ramp(c, 6, mixHex(c, 0x000000, 0.55), 0.4);
  P.fill(r, R, (u, v, x, y) => {
    let l = 1.6 + v * 2.2 + (P.n(r, x, y, 2, 2, 11) - 0.5) * (1 + vary * 10);
    if (y === 0) l += 1.2;
    if (y === r.h - 1 || x === 0) l -= 1;
    if (ph(x, y, 13) < 0.06 + vary * 0.4) l -= 1.5;
    return l;
  }, 0.7);
  if (r.w >= 6) P.glint(r, Math.floor(r.w * 0.2), Math.max(1, Math.floor(r.h * 0.2)), Math.max(1, Math.floor(r.w * 0.3)), 0xffffff, 0.5);
}

// ------------------------------------------------------------------ world-space markers drawn by a rig
const MK_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const MK_MAT = new Map<number, THREE.MeshBasicMaterial>();
let MK_TEX: THREE.Texture | null = null;
/**
 * The landing-square glow, painted: a warm lamp-lit square of light thrown on
 * the floor, brighter at the edges like a filament, with dithered falloff,
 * corner brackets and dust specks (48 px, nearest-filtered).
 */
function markerTex(): THREE.Texture {
  if (MK_TEX) return MK_TEX;
  const N = 48, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ex = Math.min(x, N - 1 - x), ey = Math.min(y, N - 1 - y), e = Math.min(ex, ey);
    let a = e < 2 ? 1 : e < 4 ? 0.75 : Math.max(0, 0.42 - (e - 4) * 0.02);
    const corner = (ex < 9 && ey < 3) || (ey < 9 && ex < 3);
    if (corner) a = 1;
    a += (ph(x >> 1, y >> 1, 31) - 0.5) * 0.18;
    const q = B[(y & 3) * 4 + (x & 3)] / 16;
    const on = a > q * 0.9 + 0.05;
    const speck = ph(x, y, 37) > 0.97;
    const i = (y * N + x) * 4;
    const hot = e < 2 || corner;
    img.data[i] = 255; img.data[i + 1] = hot ? 214 : 170; img.data[i + 2] = hot ? 150 : 96;
    img.data[i + 3] = on ? Math.round(Math.min(1, a + (speck ? 0.3 : 0)) * 255) : 0;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  MK_TEX = t;
  return t;
}
function markerMat(color: number) {
  let m = MK_MAT.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, map: markerTex(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }); MK_MAT.set(color, m); }
  return m;
}
/**
 * A floor square owned by the rig (so it goes away with it), placed at world
 * (x, z) whatever the rig is doing: counter-rotated against the root's yaw.
 */
export function marker(rig: Rig, slot: string, color: number): THREE.Mesh {
  const ud = rig.root.userData;
  let m = ud['mk_' + slot] as THREE.Mesh | undefined;
  if (!m) {
    // one material per marker so each can fade on its own
    m = new THREE.Mesh(MK_GEO, markerMat(color).clone());
    m.renderOrder = 3; m.visible = false; m.frustumCulled = false;
    rig.root.add(m);
    ud['mk_' + slot] = m;
  }
  return m;
}
export function placeMarker(m: THREE.Mesh, rig: Rig, c: { x: number; z: number; y?: number }, wx: number, wz: number, size: number, alpha: number) {
  const yaw = rig.root.rotation.y;
  const dx = wx - rig.root.position.x, dz = wz - rig.root.position.z;
  const cs = Math.cos(-yaw), sn = Math.sin(-yaw);
  // inverse of the root's rotation about y
  m.position.set(dx * cs + dz * sn, 0.04 - (rig.root.position.y - (c.y ?? 0)), -dx * sn + dz * cs);
  m.rotation.set(0, -yaw, 0);
  m.scale.set(size, 1, size);
  (m.material as THREE.MeshBasicMaterial).opacity = clamp01(alpha);
  m.visible = alpha > 0.01;
}

// ------------------------------------------------------------------ chessboard maths
export interface Board { x0: number; y0: number; cell: number; n: number }
/**
 * The board of a zone: zone.meta.board = { x0, y0, cell, n } when the
 * dimension sets one (tiles; cell = tiles per square); otherwise 2-tile
 * squares from the zone origin.
 */
export function boardOf(z: Zone | null | undefined): Board {
  const meta = (z?.meta ?? {}) as any;
  // the Board dimension (src/world/gen/z_chess.ts) publishes { ox, oy, S } as meta.chess
  const b = meta.board ?? (meta.chess ? { x0: meta.chess.ox, y0: meta.chess.oy, cell: meta.chess.S, n: 8 } : null);
  return { x0: b?.x0 ?? 0, y0: b?.y0 ?? 0, cell: Math.max(1, b?.cell ?? 2), n: b?.n ?? 64 };
}
export const sqOf = (b: Board, x: number, z: number): [number, number] => [Math.floor((x - b.x0) / b.cell), Math.floor((z - b.y0) / b.cell)];
export const sqCenter = (b: Board, i: number, j: number): [number, number] => [b.x0 + (i + 0.5) * b.cell, b.y0 + (j + 0.5) * b.cell];
/** every tile of a square is floor and free */
export function sqFree(z: Zone, b: Board, i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= b.n || j >= b.n) return false;
  // the board's own pieces stand on their squares
  const pcs = (z.meta as any)?.chess?.pieces as { x: number; y: number; alive: boolean }[] | undefined;
  if (pcs && pcs.some((p) => p.alive && p.x === i && p.y === j)) return false;
  for (let y = 0; y < b.cell; y++) for (let x = 0; x < b.cell; x++) {
    const tx = Math.floor(b.x0 + i * b.cell + x), ty = Math.floor(b.y0 + j * b.cell + y);
    if (!z.inb(tx, ty)) return false;
    const k = z.idx(tx, ty);
    if (!z.floor[k] || z.solid[k] === 1 || z.solid[k] === 3) return false;
  }
  return true;
}

// ------------------------------------------------------------------ hits outside the attack cycle
/** host: hurt a survivor directly (landings, pops, slams) on whichever machine owns them */
export function hitPlayer(c: Creature, p: Player, dmg: number, kinds: InjuryType[], knock = 0.8, parts?: string[], corrupt = 0) {
  if (p.body.dead) return;
  const h: HitInfo = { dmg, kinds, corrupt, height: c.height, knock, from: [c.x, c.z], grab: false, parts, by: c.sp.key };
  if (p.isLocal) applyHitToPlayer(p, h); else G.net?.sendHurt?.(p.id, h);
}
/** host: everyone within r of (x, z) in the creature's zone */
export function playersNear(c: Creature, x: number, z: number, r: number): Player[] {
  const out: Player[] = [];
  for (const p of G.players.values()) if (p.zoneKey === c.zoneKey && !p.body.dead && Math.hypot(p.x - x, p.z - z) < r) out.push(p);
  return out;
}

/** creature-ish thing for gallery drivers */
export type Fake = Creature & { [k: string]: any };

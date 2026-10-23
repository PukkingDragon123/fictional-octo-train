// The horror layer every creature wears on top of its own model and motion:
//
//  * facetMaterial(): the world / kit materials re-made faceted (flat-shaded
//    planes, an overhead key per facet even under flat room light) with a wet
//    glint: raw, bloody and fleshy colours catch a hard pixel highlight that
//    slides over their facets as they move.
//  * horrify(def): wraps a species' build and animate. The rig is re-skinned
//    with the faceted materials, and an additive "dread" layer runs after its
//    own animation: snapping twitches and joint pops (head tilts that land too
//    fast and hold too long), ragged breathing with catches, a wind-up and
//    lunge on attacks, a recoil when hurt, eyes that blink wrong and stop
//    blinking when they stare, and in death limbs that drop with weight,
//    bounce, settle and twitch a few more times.
// The additive layer undoes itself before the species animates, so species
// that set their pose absolutely and those that leave parts alone both work.
import * as THREE from 'three';
import type { Rig, SpeciesDef } from '../species';
import type { Creature } from '../creature';

// =====================================================================================
// materials
// =====================================================================================
const FACET_GLSL = /* glsl */`
{
  vec3 fN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  float fk = dot(fN, vec3(-0.38, 0.8, 0.46));
  float facet = 0.8 + 0.28 * fk + 0.06 * fN.y;
  irradiance *= clamp(facet, 0.42, 1.3);
}
`;
const WET_GLSL = /* glsl */`
{
  vec3 wN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  vec3 wV = normalize(cameraPosition - vWPos);
  vec3 wL = normalize(vec3(-0.35, 0.85, 0.4));
  float wS = pow(max(dot(wN, normalize(wL + wV)), 0.0), 16.0);
  vec3 dc = diffuseColor.rgb;
  float red = dc.r - max(dc.g, dc.b);
  float wet = smoothstep(0.06, 0.26, red) * (1.0 - smoothstep(0.5, 0.85, dc.r)) + WET_ALL;
  float lit = dot(irradiance, vec3(0.3333));
  reflectedLight.indirectDiffuse += vec3(1.0, 0.94, 0.88) * step(0.55, wS) * wS * wet * (0.18 + lit * 0.55);
}
`;
/** patch a world-material shader (vWPos present) with faceted light and wet glints */
export function patchFacet(shader: { fragmentShader: string }, wetAll = 0) {
  let fs = shader.fragmentShader;
  if (!fs.includes('vWPos')) return;
  fs = fs.replace('#include <lights_fragment_end>', FACET_GLSL + '#include <lights_fragment_end>\n' + WET_GLSL.replace('WET_ALL', wetAll.toFixed(3)));
  shader.fragmentShader = fs;
}

const WRAP = new WeakMap<THREE.Material, THREE.Material>();
const WRAPPED = new WeakSet<THREE.Material>();
/** a material that already shades faceted (kit materials, human rigs): never wrapped again */
export function markFaceted(m: THREE.Material) { WRAPPED.add(m); return m; }
const keyOf = (m: THREE.Material) => { const k = (m as any).customProgramCacheKey; return typeof k === 'function' ? String(k.call(m)) : ''; };
/** materials the faceting must leave alone: glows, unlit, additive, transparent films, plain basic materials */
function skip(m: THREE.Material) {
  if (WRAPPED.has(m)) return true;
  if (!(m as THREE.MeshLambertMaterial).isMeshLambertMaterial) return true;
  if (m.blending === THREE.AdditiveBlending) return true;
  if (m.transparent && m.opacity < 0.99) return true;
  if ((m as THREE.MeshLambertMaterial).flatShading) return true;
  const k = keyOf(m);
  return k.includes('UNLIT') || k.includes('HIGHLIGHT') || k.includes('human') || k.includes('hkit');
}
/** the faceted, wet-glinting version of a world / kit material (cached; the same object every time) */
export function facetMaterial<T extends THREE.Material>(base: T, wetAll = 0): T {
  if (skip(base)) return base;
  let m = WRAP.get(base);
  if (m) return m as T;
  m = base.clone();
  (m as THREE.MeshLambertMaterial).flatShading = true;
  const b = base as any;
  m.onBeforeCompile = (shader, renderer) => { b.onBeforeCompile?.(shader, renderer); patchFacet(shader, wetAll); };
  m.customProgramCacheKey = () => keyOf(base) + '|facet' + wetAll;
  // uniforms living on the base (kit fx) are reached through its own onBeforeCompile
  WRAP.set(base, m); WRAPPED.add(m);
  return m as T;
}
/** re-skin every mesh under a rig with the faceted materials */
export function facetRig(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const f = facetMaterial(mesh.material as THREE.Material);
    if (f !== mesh.material) mesh.material = f;
  });
}

// =====================================================================================
// dread layer
// =====================================================================================
export interface HorrorOpts {
  /** 0..1 how twitchy (default 0.6) */
  twitch?: number;
  /** how far a twitch throws a joint (radians, default 0.35) */
  snap?: number;
  /** breathing heave of the body (default 0.025 scale) */
  breathe?: number;
  /** how far it throws itself forward on an attack (m, default 0.12) */
  lunge?: number;
  /** limbs drop and bounce when it dies (default true) */
  flop?: boolean;
  /** part name patterns that twitch (default heads, necks, jaws, limbs, tails, fingers) */
  parts?: RegExp;
  /** parts that hang in death (default limbs, heads, tails) */
  hang?: RegExp;
  /** no material swap (species with their own shading) */
  keepMaterials?: boolean;
  /** wet glint everywhere, not just on raw colours (0..1) */
  wet?: number;
}
const DEF_PARTS = /head|neck|jaw|arm|hand|wrist|finger|claw|leg|knee|shin|foot|paw|tail|ear|antenn|tentac|limb|elbow|thigh|shoulder|uarm|farm|spine|chest/i;
const DEF_HANG = /head|neck|jaw|arm|hand|leg|shin|foot|paw|tail|ear|tentac|limb|uarm|farm|thigh/i;

interface Tw { o: THREE.Object3D; base: number; next: number; t: number; dur: number; hold: number; back: number; ax: number; amt: number; cur: [number, number, number]; hang: boolean; fall: number; fv: number; fax: number; fs: number }
interface HState {
  tw: Tw[]; body: { px: number; pz: number; rx: number; sy: number; sx: number };
  breathT: number; catchT: number; lungeT: number; prevAtk: number; hitT: number; prevFlash: number; hitDir: number;
  eyes: { o: THREE.Object3D; sy: number; blinkAt: number; blinkT: number }[]; seed: number; deadT: number;
}
const rnd = (s: { seed: number }) => { s.seed = (s.seed * 16807) % 2147483647; return (s.seed - 1) / 2147483646; };

function hstate(rig: Rig, c: Creature, o: HorrorOpts): HState {
  const ud = rig.root.userData;
  if (ud.horror) return ud.horror as HState;
  let seed = 7; for (const ch of c.id) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647; seed = seed || 11;
  const S: HState = {
    tw: [], body: { px: 0, pz: 0, rx: 0, sy: 1, sx: 1 }, breathT: 0, catchT: 0, lungeT: -1, prevAtk: 0, hitT: -1, prevFlash: 0, hitDir: 1,
    eyes: [], seed, deadT: 0,
  };
  const rx = o.parts ?? DEF_PARTS, hx = o.hang ?? DEF_HANG;
  for (const [name, p] of Object.entries(rig.parts)) {
    if (!p || p === rig.body || p === rig.root || !rx.test(name)) continue;
    const t: Tw = { o: p, base: 0, next: 0, t: -1, dur: 0, hold: 0, back: 0, ax: 0, amt: 0, cur: [0, 0, 0], hang: hx.test(name), fall: 0, fv: 0, fax: 0, fs: 1 };
    t.next = 0.5 + rnd(S) * 4;
    S.tw.push(t);
  }
  for (const e of rig.eyes || []) S.eyes.push({ o: e, sy: e.scale.y || 1, blinkAt: 1 + rnd(S) * 5, blinkT: -1 });
  ud.horror = S;
  return S;
}

/** undo last frame's additive layer (before the species poses the rig) */
function undo(rig: Rig, S: HState) {
  for (const t of S.tw) { t.o.rotation.x -= t.cur[0]; t.o.rotation.y -= t.cur[1]; t.o.rotation.z -= t.cur[2]; t.cur[0] = t.cur[1] = t.cur[2] = 0; }
  const B = rig.body, b = S.body;
  B.position.x -= b.px; B.position.z -= b.pz; B.rotation.x -= b.rx;
  if (b.sy !== 1) B.scale.y /= b.sy;
  if (b.sx !== 1) { B.scale.x /= b.sx; B.scale.z /= b.sx; }
  b.px = b.pz = b.rx = 0; b.sy = b.sx = 1;
  for (const e of S.eyes) if (e.o.scale.y !== e.sy && e.blinkT < 0) e.o.scale.y = e.sy;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** the additive dread layer, after the species posed the rig */
function apply(rig: Rig, c: Creature, dt: number, S: HState, o: HorrorOpts) {
  const twitch = o.twitch ?? 0.6, snap = o.snap ?? 0.35;
  const calm = c.state === 'idle' || c.state === 'watch' || c.state === 'stalk' || c.state === 'curious' || c.state === 'investigate' || c.state === 'emerge';
  const moving = (c.speed ?? 0) > 0.3;
  const B = rig.body, b = S.body;
  if (c.dead) {
    S.deadT += dt;
    if (o.flop !== false) for (const t of S.tw) {
      if (!t.hang) continue;
      // limbs fall with weight: a fast drop, a bounce on the floor, a slow settle, a few dying twitches
      if (S.deadT <= dt * 1.5) { t.fax = rnd(S) < 0.5 ? 0 : 2; t.fs = rnd(S) < 0.5 ? -1 : 1; t.fall = 0; t.fv = 2.5 + rnd(S) * 3; }
      const target = 0.55 + 0.35 * ((t.o.name.length * 7) % 5) / 5;
      t.fv += (-(t.fall - target) * 60 - t.fv * 5) * dt;
      t.fall += t.fv * dt;
      let d = t.fall * t.fs;
      if (S.deadT < 4 && rnd(S) < dt * (S.deadT < 1.5 ? 1.6 : 0.5)) t.fv += (rnd(S) - 0.5) * 9; // post-mortem twitch
      d = Math.max(-1.2, Math.min(1.2, d));
      t.cur[t.fax] += d;
      t.o.rotation.x += t.fax === 0 ? d : 0; t.o.rotation.z += t.fax === 2 ? d : 0;
    }
    for (const e of S.eyes) { e.o.scale.y = e.sy * Math.max(0.05, 1 - S.deadT * 2); }
    return;
  }
  // things that must not move while watched or disguised stay perfectly still
  const still = c.state === 'frozen' || c.state === 'disguised' || c.state === 'hide' || c.state === 'mimic' || (c.mem && c.mem.still);
  if (still) { S.lungeT = -1; S.hitT = -1; return; }
  // ---- twitches and joint pops
  for (const t of S.tw) {
    t.next -= dt * (calm ? 1 : moving ? 0.35 : 0.7) * (0.4 + twitch);
    if (t.t < 0 && t.next <= 0) {
      t.t = 0; t.dur = 0.035 + rnd(S) * 0.05; t.hold = 0.15 + rnd(S) * (calm ? 0.9 : 0.3); t.back = 0.25 + rnd(S) * 0.7;
      t.ax = Math.floor(rnd(S) * 3); t.amt = (rnd(S) < 0.5 ? -1 : 1) * snap * (0.35 + rnd(S) * 0.65) * (/head|neck/i.test(t.o.name) ? 1.25 : 0.7);
      t.next = (calm ? 1.2 : 2.5) + rnd(S) * (calm ? 5 : 9) / (0.3 + twitch);
    }
    if (t.t >= 0) {
      t.t += dt;
      let k: number;
      if (t.t < t.dur) k = t.t / t.dur;                                         // snaps there
      else if (t.t < t.dur + t.hold) k = 1 + Math.sin((t.t - t.dur) * 70) * 0.06 * Math.max(0, 1 - (t.t - t.dur) * 8); // a shiver as it lands
      else if (t.t < t.dur + t.hold + t.back) k = 1 - ease((t.t - t.dur - t.hold) / t.back); // creeps back
      else { k = 0; t.t = -1; }
      const d = t.amt * k;
      t.cur[t.ax] += d;
      if (t.ax === 0) t.o.rotation.x += d; else if (t.ax === 1) t.o.rotation.y += d; else t.o.rotation.z += d;
    }
  }
  // ---- breathing: a slow heave that catches and stutters
  const br = o.breathe ?? 0.025;
  if (br > 0) {
    S.breathT += dt * (calm ? 1.1 : 2.6);
    S.catchT -= dt;
    if (S.catchT < -4 - rnd(S) * 6) S.catchT = 0.5;
    const stutter = S.catchT > 0 ? Math.sin(S.catchT * 60) * 0.4 : 0;
    const h = (Math.sin(S.breathT * 2.1) * 0.5 + 0.5) ** 1.6 + stutter * 0.3;
    b.sy = 1 + h * br; b.sx = 1 + h * br * 0.6;
    B.scale.y *= b.sy; B.scale.x *= b.sx; B.scale.z *= b.sx;
  }
  // ---- attack: a crouched wind-up, then the body is thrown forward and snaps back
  const atk = c.attackPhase > 0 ? 1 : 0;
  if (atk && !S.prevAtk) S.lungeT = 0;
  S.prevAtk = atk;
  if (S.lungeT >= 0) {
    S.lungeT += dt;
    const L = o.lunge ?? 0.12, u = S.lungeT;
    const z = u < 0.16 ? -0.35 * ease(u / 0.16) : u < 0.26 ? -0.35 + 1.35 * ease((u - 0.16) / 0.1) : u < 0.6 ? 1 - ease((u - 0.26) / 0.34) : 0;
    b.pz = z * L; b.rx = z * 0.18;
    if (u > 0.6) S.lungeT = -1;
  }
  // ---- hurt: recoil away and a shudder
  if (c.hitFlash > S.prevFlash + 0.05) { S.hitT = 0; S.hitDir = rnd(S) < 0.5 ? -1 : 1; }
  S.prevFlash = c.hitFlash;
  if (S.hitT >= 0) {
    S.hitT += dt;
    const u = S.hitT, k = u < 0.06 ? u / 0.06 : Math.max(0, 1 - (u - 0.06) / 0.3);
    b.pz += -0.06 * k; b.rx += -0.22 * k; b.px += S.hitDir * Math.sin(u * 50) * 0.015 * k;
    if (u > 0.4) S.hitT = -1;
  }
  B.position.x += b.px; B.position.z += b.pz; B.rotation.x += b.rx;
  // ---- eyes: wrong blinks (one at a time, too slow), never while staring at you
  const staring = c.state === 'watch' || c.state === 'stalk' || c.state === 'chase' || c.state === 'frozen';
  for (const e of S.eyes) {
    if (e.blinkT < 0) { e.blinkAt -= dt; if (e.blinkAt <= 0 && !staring) { e.blinkT = 0; e.blinkAt = 2 + rnd(S) * 7; } }
    if (e.blinkT >= 0) {
      e.blinkT += dt;
      const u = e.blinkT / 0.32;
      e.o.scale.y = e.sy * (u < 0.5 ? 1 - u * 1.9 : u < 1 ? 0.05 + (u - 0.5) * 1.9 : 1);
      if (u >= 1) { e.blinkT = -1; e.o.scale.y = e.sy; }
    }
  }
}

/**
 * Give a species the horror layer (faceted wet materials, twitches, breathing,
 * lunges, recoils, wrong blinks, a weighted death). Returns the same def with
 * build / animate wrapped.
 */
export function horrify<T extends SpeciesDef>(def: T, o: HorrorOpts = {}): T {
  const build = def.build, animate = def.animate;
  def.build = () => {
    const rig = build();
    if (!o.keepMaterials) facetRig(rig.root);
    rig.root.userData.horrorOpts = o;
    return rig;
  };
  def.animate = (rig: Rig, c: Creature, t: number, dt: number) => {
    const S = hstate(rig, c, o);
    undo(rig, S);
    animate(rig, c, t, dt);
    // species that swap materials at runtime (disguises) get faceted again
    if (!o.keepMaterials) facetRig(rig.root);
    apply(rig, c, dt, S, o);
  };
  return def;
}

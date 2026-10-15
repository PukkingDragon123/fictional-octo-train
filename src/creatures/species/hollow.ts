import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { Rng, hashStr } from '../../core/rng';
import { ph } from '../../gfx/pixel';
import { lineOfSight } from '../../world/collision';
import { G } from '../../game/G';
import { HumanRig, Appearance, Outfit, Pose as HPose, randomAppearance, HAIR_COLORS, SKIN_TONES } from '../../entities/humanRig';
import { BONES, BONE_PARENT, REG, VMAP, PAGE, vOf } from '../../entities/humanModel';
import type { AnimInput } from '../../entities/humanAnim';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, nm, netSet, pulse, attack, playersIn, stop, dist, faceTo, facingTo, torchOn, lightAt, speak, showSpeech,
  objectsNear, walkable, galleryPose, h01, idHash, sfx,
} from '../behaviors_a';
import { CutState, cutState, cutSync, cutRestore, lostParts, nearestSurvivor, lookAngles, attackCurve, flinchOf } from '../kit/humanoids';

// =====================================================================================
// HOLLOW — someone who stayed too long. A real office worker in real, faded clothes,
// whose face is rendered at the lowest level of detail: a smear where the eyes and
// mouth should be. Parts of them drop out of the frame in slices. A routine they
// cannot stop repeating. Harmless until you get close in the dark or shine a light
// in their face; then the face is static and they come at you.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // a cut through something that was never really there: static, a dark rim
  A.add('c_hollow_cut', 16, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) / 8;
      const v = ph(x, y, 65);
      pc.set(x, y, d > 0.9 ? 0x5a5650 : v < 0.4 ? 0x141418 : v < 0.75 ? 0x5a5a66 : 0xd0d0dc);
    }
  });
});

// ------------------------------------------------------------------ who they were
const SHIRTS = [0xe6e8ea, 0xc8d8e8, 0xe8d6d8, 0xe8e2cc, 0xb8bcc0, 0xd8e4d8];
const SLACKS = [0x3a3a42, 0x2a3040, 0x4a4238, 0x5a5a5e, 0x2a2826];
const BLAZERS = [0x2e3444, 0x4a4a4e, 0x5a4a3a, 0x3a3a34];
const SWEATERS = [0x6a2e34, 0x4a5a3a, 0x3a4a6a, 0x8a7a5a];

function who(id: string): { app: Appearance; outfit: Outfit } {
  const r = new Rng(hashStr('hollow:' + id));
  const app = randomAppearance(() => r.next());
  app.age = Math.round((0.15 + r.next() * 0.7) * 100) / 100;
  app.skin = SKIN_TONES[Math.floor(r.next() * SKIN_TONES.length)];
  app.hair = HAIR_COLORS[Math.floor(r.next() * 6)];
  const fem = (app.bodyShape ?? 0.3) > 0.5;
  const o: Outfit = {};
  const top = r.next();
  if (top < 0.55) o.torso = { tex: 'c_shirt_button', color: SHIRTS[Math.floor(r.next() * SHIRTS.length)], sleeve: 'long' };
  else if (top < 0.75) o.torso = { tex: 'c_sweater', color: SWEATERS[Math.floor(r.next() * SWEATERS.length)], sleeve: 'long' };
  else o.torso = { tex: 'c_shirt', color: SHIRTS[Math.floor(r.next() * SHIRTS.length)], sleeve: 'short' };
  if (r.next() < 0.35 && top < 0.55) o.torsoOuter = { tex: 'c_jacket', color: BLAZERS[Math.floor(r.next() * BLAZERS.length)], sleeve: 'long' };
  if (fem && r.next() < 0.45) { o.legs = { tex: 'c_skirt', color: SLACKS[Math.floor(r.next() * SLACKS.length)] }; o.legsKind = 'skirt'; }
  else { o.legs = { tex: 'c_slacks', color: SLACKS[Math.floor(r.next() * SLACKS.length)] }; o.legsKind = 'pants'; }
  o.feet = { tex: 'c_shoes_dress', color: r.next() < 0.5 ? 0x2a2220 : 0x4a3424 };
  if (r.next() < 0.3) o.eyes = { tex: 'c_glasses', color: 0x2a2a2a, item: 'glasses' };
  // years under the tubes: pale, a little grimy, a little corrupted
  o.cond = { pale: 2, dirt: 1 + Math.floor(r.next() * 2), blood: {} };
  return { app, outfit: o };
}

// ------------------------------------------------------------------ the page: faded, the face smeared to a low LOD
function fadePage(hr: HumanRig, seed: number) {
  const tex = (hr.skin.material as THREE.MeshLambertMaterial).map as THREE.DataTexture;
  const d = tex.image.data as Uint8Array;
  // wash everything toward a cold grey
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    d[i] = Math.min(255, (r * 0.45 + l * 0.55) * 0.9 + 14);
    d[i + 1] = Math.min(255, (g * 0.45 + l * 0.55) * 0.93 + 15);
    d[i + 2] = Math.min(255, (b * 0.45 + l * 0.55) * 0.98 + 20);
  }
  // the face: averaged into coarse blocks, rows dragged sideways
  const R = REG.HEAD;
  const col = (deg: number) => R.x + Math.round((0.5 + deg / 360) * R.w);
  const row = (y: number) => R.y + Math.round((1 - vOf(VMAP.HEAD, y)) * R.h);
  const x0 = col(-70), x1 = col(70), y0 = row(0.17), y1 = row(-0.02);
  const BW = 5, BH = 4;
  for (let by = y0; by < y1; by += BH) for (let bx = x0; bx < x1; bx += BW) {
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = by; y < Math.min(y1, by + BH); y++) for (let x = bx; x < Math.min(x1, bx + BW); x++) { const i = (y * PAGE + x) * 4; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
    sr /= n; sg /= n; sb /= n;
    for (let y = by; y < Math.min(y1, by + BH); y++) for (let x = bx; x < Math.min(x1, bx + BW); x++) { const i = (y * PAGE + x) * 4; d[i] = sr; d[i + 1] = sg; d[i + 2] = sb; }
  }
  const rng = new Rng(seed);
  for (let y = y0; y < y1; y++) {
    if (!rng.chance(0.4)) continue;
    const s = rng.int(1, 3) * (rng.chance(0.5) ? 1 : -1);
    const rowCopy = d.slice((y * PAGE + x0) * 4, (y * PAGE + x1) * 4);
    for (let x = x0; x < x1; x++) { const sx = Math.min(x1 - 1, Math.max(x0, x - s)) - x0; const i = (y * PAGE + x) * 4; d[i] = rowCopy[sx * 4]; d[i + 1] = rowCopy[sx * 4 + 1]; d[i + 2] = rowCopy[sx * 4 + 2]; }
  }
  // two darker smudges where the eyes were, a grey bar of a mouth
  for (const k of [-1, 1]) for (let y = row(0.108); y <= row(0.092); y++) for (let x = col(k * 30) - 2; x <= col(k * 12) + 1; x++) { const i = (y * PAGE + x) * 4; d[i] *= 0.62; d[i + 1] *= 0.62; d[i + 2] *= 0.66; }
  for (let y = row(0.04); y <= row(0.03); y++) for (let x = col(-14); x <= col(14); x++) { const i = (y * PAGE + x) * 4; d[i] *= 0.78; d[i + 1] *= 0.76; d[i + 2] *= 0.78; }
  tex.needsUpdate = true;
  return { u0: x0 / PAGE, u1: x1 / PAGE, v0: 1 - y1 / PAGE, v1: 1 - y0 / PAGE };
}

/** slices that drop out of the frame (screen-door), static over the face */
function hollowShader(hr: HumanRig, U: { value: THREE.Vector4 }, F: { value: THREE.Vector4 }) {
  const m = hr.material as THREE.MeshLambertMaterial;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uHollow = U; shader.uniforms.uHFace = F;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHollow;\nuniform vec4 uHFace;')
      .replace('diffuseColor *= sampledDiffuseColor;', `diffuseColor *= sampledDiffuseColor;
{
  float band = floor(vWPos.y * 17.0 + floor(uHollow.y * 5.0) * 0.37);
  float bh = fract(sin(band * 91.7 + floor(uHollow.y * 7.0) * 13.1) * 43758.5);
  float a = uHollow.x + (bh < uHollow.z ? 0.55 : 0.0);
  if (a > 0.001 && bayer4(gl_FragCoord.xy) < a) discard;
  if (uHollow.w > 0.001 && vMapUv.x > uHFace.x && vMapUv.x < uHFace.y && vMapUv.y > uHFace.z && vMapUv.y < uHFace.w) {
    vec2 q = floor(vMapUv * 256.0 / vec2(2.0, 1.0));
    float n = fract(sin(dot(q + floor(uHollow.y * 14.0) * vec2(3.1, 7.7), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 st = n < 0.4 ? vec3(0.06) : n < 0.75 ? vec3(0.34, 0.34, 0.4) : vec3(0.85, 0.85, 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, st, uHollow.w);
  }
}`);
  };
  const key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => key + '|hollow1';
  m.needsUpdate = true;
}

// ------------------------------------------------------------------ rig (pooled: each HumanRig owns a texture page)
interface HollowRig extends Rig {
  hr: HumanRig; counter: THREE.Group; cut: CutState; who: string; U: { value: THREE.Vector4 }; F: { value: THREE.Vector4 }; m: Record<string, any>;
}
const POOL: HollowRig[] = [];
const CUT_R: Record<string, number> = { head: 0.05, neck: 0.045, uarmL: 0.045, uarmR: 0.045, farmL: 0.038, farmR: 0.038, handL: 0.025, handR: 0.025, thighL: 0.07, thighR: 0.07, shinL: 0.05, shinR: 0.05, footL: 0.035, footR: 0.035 };
const capGeo = new Map<number, THREE.BufferGeometry>();
function cutCap(name: string): THREE.Object3D | null {
  const r = CUT_R[name]; if (!r) return null;
  let g = capGeo.get(r);
  if (!g) { const mb = new ModelBuilder(); mb.cylinder(0, -0.012, 0, r, 0.024, 8, { sides: 'c_hollow_cut', top: 'c_hollow_cut', bottom: 'c_hollow_cut' }, { fit: true }); g = mb.build(); capGeo.set(r, g); }
  const m = new THREE.Mesh(g, worldMaterial({})); m.name = 'kit_stump';
  return m;
}

function newHollowRig(): HollowRig {
  const hr = new HumanRig(randomAppearance(() => 0.5), worldMaterial({}));
  (hr.skin as any).clone = () => new THREE.Group(); // gibs come from the per-segment proxies
  const root = new THREE.Group(), body = new THREE.Group(), counter = new THREE.Group();
  root.add(body); body.add(counter); counter.add(hr.root);
  const U = { value: new THREE.Vector4(0, 0, 0, 0) }, F = { value: new THREE.Vector4(0, 0, 0, 0) };
  hollowShader(hr, U, F);
  const r: HollowRig = { root, body, parts: { ...hr.j }, headY: 1.75, hr, counter, cut: null as unknown as CutState, who: '', U, F, m: {} };
  r.cut = makeCut(hr);
  POOL.push(r);
  return r;
}
function makeCut(hr: HumanRig): CutState {
  const bones = BONES.map((b) => hr.bones[b]);
  return cutState(bones, hr.skin.skeleton, (i) => cutCap(BONES[i]));
}
function buildHollow(): Rig {
  for (const r of POOL) if (!r.root.parent) { tidy(r); return r; }
  return newHollowRig();
}
/** back to an intact, standing body (pooled rigs come back from the dead) */
function tidy(r: HollowRig) {
  cutRestore(r.cut, r.root, r.hr.body);
  for (const b of BONES) { const p = BONE_PARENT[b]; const want = p ? r.hr.bones[p] : r.hr.body; if (r.hr.bones[b].parent !== want) want.add(r.hr.bones[b]); }
  r.root.userData = {}; r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0); r.root.scale.set(1, 1, 1);
  r.body.rotation.set(0, 0, 0); r.body.position.set(0, 0, 0); r.body.visible = true;
  r.counter.rotation.set(0, 0, 0); r.counter.position.set(0, 0, 0);
  r.m = {};
}
/** become this particular person (swap in their already painted body if a free shell holds it) */
function adopt(r: HollowRig, id: string) {
  const other = POOL.find((o) => o !== r && o.who === id && !o.root.parent);
  if (other) {
    const keep = { hr: r.hr, cut: r.cut, who: r.who, U: r.U, F: r.F };
    r.counter.remove(r.hr.root); other.counter.remove(other.hr.root);
    r.hr = other.hr; r.cut = other.cut; r.who = other.who; r.U = other.U; r.F = other.F;
    other.hr = keep.hr; other.cut = keep.cut; other.who = keep.who; other.U = keep.U; other.F = keep.F;
    r.counter.add(r.hr.root); other.counter.add(other.hr.root);
    r.parts = { ...r.hr.j }; other.parts = { ...other.hr.j };
    cutRestore(r.cut, r.root, r.hr.body);
    return;
  }
  const w = who(id);
  r.hr.setOutfit(w.outfit);
  r.hr.setAppearance(w.app);
  r.cut = makeCut(r.hr);
  const f = fadePage(r.hr, hashStr(id));
  r.F.value.set(f.u0, f.u1, f.v0, f.v1);
  r.who = id;
  r.parts = { ...r.hr.j };
}

// ------------------------------------------------------------------ lines
const LINES = [
  'Have you seen my badge?', 'Is it Tuesday?', 'I just need to finish this one thing.', 'The meeting got moved again.',
  'What floor is this?', 'My shift ended a while ago.', 'Do you know the way out? I knew it this morning.',
  'They said it would only take a minute.', 'I can\'t remember my desk number.', 'Did the lights always hum like that?',
  'Sorry — I think you\'re in my seat.', 'I parked on P3. Or P4.', 'Is that my coffee?', 'I keep hearing the elevator.',
  'Five more minutes.', 'Same as yesterday.',
];
const ANGRY = ['TURN IT OFF.', 'Don\'t look at me.', 'You\'re not on the list.', 'STAY.', 'I was here first.', 'Stop. STOP.'];
function garble(s: string, amt: number) {
  const r = CS().rng;
  return s.split('').map((ch) => (ch !== ' ' && r.chance(amt) ? '#%&*?_/'.charAt(Math.floor(r.next() * 7)) : ch)).join('');
}

// ------------------------------------------------------------------ animation
type Mode = 'stand' | 'walk' | 'sit' | 'watch' | 'grab' | 'dead';
const add = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { const v = p[j] as [number, number, number] | undefined; if (v) { v[0] += x; v[1] += y; v[2] += z; } else (p as any)[j] = [x, y, z]; };
const set = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { (p as any)[j] = [x, y, z]; };

function drive(R: HollowRig, c: Creature | null, mode: Mode, t: number, dt: number, o: { speed: number; yaw: number; pitch: number; hostile: number; atk: { wind: number; strike: number; follow: number }; flinch: number; lost: Set<string>; deathT: number }) {
  const hr = R.hr, m = R.m;
  const noLeg = o.lost.has('thighL') || o.lost.has('thighR') || o.lost.has('shinL') || o.lost.has('shinR');
  const inp: AnimInput = {
    speed: o.speed, stance: noLeg ? 'crawl' : 'stand', full: mode === 'dead' ? 'dead' : mode === 'sit' ? 'sit' : '',
    action: mode === 'sit' ? 'type' : o.flinch > 0.3 ? 'flinch' : '', actionT: mode === 'sit' ? t % 2.4 : (1 - o.flinch) * 0.3, actionDur: mode === 'sit' ? 2.4 : 0.3,
    twoHanded: false, limp: 0, tired: mode === 'walk' || mode === 'stand' ? 0.7 : 0, panic: 0, cold: 0, aimPitch: 0, holdingLight: false, holding: false,
    lookYaw: mode === 'watch' || mode === 'grab' ? o.yaw : 0, fidget: mode === 'stand',
    armHurtL: o.lost.has('uarmL') || o.lost.has('farmL') ? 1 : 0, armHurtR: o.lost.has('uarmR') || o.lost.has('farmR') ? 1 : 0,
  };
  const P = hr.anim.update(dt, inp);
  if (mode === 'walk' && !noLeg) {
    // shuffling, eyes on the carpet, arms forgotten at its sides
    add(P, 'head', 0.32, 0, 0); add(P, 'neck', 0.1, 0, 0);
    for (const a of ['uarmL', 'uarmR'] as const) { const v = P[a]; if (v) v[0] *= 0.3; }
  }
  if (mode === 'stand') add(P, 'head', 0.12, 0, Math.sin(t * 0.21 + (m.seed ?? 0)) * 0.08);
  if (mode === 'watch') {
    // it stares, head tipped too far, and it does not blink
    add(P, 'head', -0.05 + o.pitch * 0.5, 0, 0.42); add(P, 'neck', -0.08, 0, 0.12);
    P.blink = 0;
  }
  if (mode === 'grab') {
    const sw = Math.sin(t * 9) * 0.08;
    set(P, 'uarmL', -1.28 + sw, 0.18, 0.12); set(P, 'uarmR', -1.36 - sw, -0.18, -0.12);
    set(P, 'farmL', -0.3, 0, 0); set(P, 'farmR', -0.22, 0, 0); set(P, 'handL', 0.3, 0, 0); set(P, 'handR', 0.3, 0, 0);
    add(P, 'spine', 0.18, 0, 0); add(P, 'chest', 0.1, 0, 0); add(P, 'head', -0.25 + o.pitch * 0.6, 0, 0);
    P.gripL = 0.35; P.gripR = 0.35; P.blink = 0;
  }
  // attack: a lunge for the throat, hands closing
  const A = o.atk;
  if (A.wind > 0 || A.strike > 0) {
    const w = A.wind * (1 - A.strike), s = A.strike;
    set(P, 'uarmL', -0.7 * w - 1.55 * s, 0.1 + 0.25 * s, 0.4 * w); set(P, 'uarmR', -0.7 * w - 1.6 * s, -0.1 - 0.25 * s, -0.4 * w);
    set(P, 'farmL', -1.4 * w - 0.25 * s, 0, 0); set(P, 'farmR', -1.4 * w - 0.25 * s, 0, 0);
    add(P, 'spine', -0.12 * w + 0.35 * s, 0, 0); add(P, 'chest', 0.15 * s, 0, 0); add(P, 'head', 0.2 * w - 0.3 * s, 0, 0.3 * w);
    P.rootZ = (P.rootZ ?? 0) + 0.22 * s - 0.06 * w; P.rootY = (P.rootY ?? 0) - 0.06 * s;
    P.gripL = 0.2 + 0.8 * s; P.gripR = 0.2 + 0.8 * s;
  }
  // sudden aggression: the head snaps up and round, the whole body jolts
  if (o.hostile > 0) {
    const k = o.hostile;
    add(P, 'head', -0.5 * k, 0.6 * k * Math.sin(t * 60), 0.3 * k); add(P, 'chest', -0.15 * k, 0, 0);
    P.rootX = (P.rootX ?? 0) + Math.sin(t * 77) * 0.03 * k;
  }
  if (o.flinch > 0) { P.rootX = (P.rootX ?? 0) + Math.sin(t * 90) * 0.02 * o.flinch; }
  hr.applyPose(P);
  hr.fx.value.y += dt;
  void c;
}

function animateHollow(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as HollowRig, m = R.m;
  if (R.who !== c.id) { adopt(R, c.id); m.seed = idHash(c) * 10; }
  cutSync(R.cut, R.hr.body);
  const n = nm(c);
  const hostile = !!n.angry || c.state === 'chase';
  const lost = lostParts(c);
  // snap into aggression
  if (hostile && !m.wasHostile) m.aggroAt = t;
  m.wasHostile = hostile;
  const snap = m.aggroAt !== undefined && t - m.aggroAt < 0.45 ? 1 - (t - m.aggroAt) / 0.45 : 0;
  const tgt = nearestSurvivor(c, 12);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 1.62, 1.1, 0.6);
  m.yaw = (m.yaw ?? 0) + (yaw - (m.yaw ?? 0)) * Math.min(1, dt * (hostile ? 12 : 3));
  const mode: Mode = c.dead ? 'dead' : c.attackPhase > 0 || (hostile && c.speed > 0.1) ? 'grab' : n.sit ? 'sit' : c.state === 'watch' ? 'watch' : c.speed > 0.1 ? 'walk' : 'stand';
  if (c.dead) m.deadT = (m.deadT ?? 0) + dt; else m.deadT = 0;
  drive(R, c, mode, t, dt, { speed: c.speed, yaw: mode === 'watch' || mode === 'grab' ? m.yaw : 0, pitch, hostile: snap, atk: attackCurve(rig, c, t), flinch: flinchOf(c), lost, deathT: m.deadT });
  // glitch: slices of the body tear sideways, colour bands; worse when it is angry
  const seed = idHash(c) * 97;
  const pulseG = h01(Math.floor(t * 1.7), seed) < 0.12 ? 0.25 : 0;
  R.hr.fx.value.x = c.dead ? Math.min(1, 0.3 + m.deadT * 0.3) : hostile ? 0.32 + snap * 0.6 : 0.012 + pulseG;
  R.hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.6;
  // translucent slices: it is not all here; when angry, it is more here than you want
  R.U.value.set(c.dead ? Math.min(0.85, 0.12 + m.deadT * 0.22) : hostile ? 0.0 : 0.1, t, hostile ? 0.22 : 0.09 + pulseG, hostile ? (h01(Math.floor(t * 14), seed) < 0.75 ? 1 : 0) : h01(Math.floor(t * 3), seed) < 0.04 ? 1 : 0);
  // the manager tips dead creatures on their side; this one already fell its own way
  if (c.dead) {
    const k = Math.min(1, c.deathT * 2 + (c.deathT > 0 ? 0 : 1));
    const a = (Math.PI / 2) * Math.min(1, k + 0.01), ry = ((rig.root.userData.restY as number | undefined) ?? 0) * Math.min(1, k + 0.01);
    R.counter.rotation.set(0, 0, -a);
    R.counter.position.set(-ry * Math.sin(a), -ry * Math.cos(a), 0);
  } else { R.counter.rotation.set(0, 0, 0); R.counter.position.set(0, 0, 0); }
  // rubber-banding: once in a while it is drawn where it was a moment ago
  const hist: number[][] = (c.mem._hist ??= []);
  hist.push([c.x, c.z]); if (hist.length > 40) hist.shift();
  if (!c.dead && h01(Math.floor(t * 2.2), seed + 3) < (hostile ? 0.18 : 0.06) && (t * 2.2) % 1 < 0.3) {
    const o = hist[0]; rig.root.position.x = o[0]; rig.root.position.z = o[1];
  }
  showSpeech(c, 2.0);
}

// ---------------------------------------------------------------- the routine
interface Routine { pts: { x: number; z: number }[]; sit: { x: number; z: number; f: number } | null; i: number }
function buildRoutine(c: Creature): Routine {
  const z = zoneOf(c), rng = CS().rng;
  let sit: Routine['sit'] = null;
  // a chair at a desk, or failing that a free tile beside any desk/counter
  const desks = objectsNear(z, c.home.x, c.home.z, 12, (o, d) => /desk|table|counter|reception|bench/.test(o.key) || !!d.tags?.includes('desk'), 16);
  const chairs = objectsNear(z, c.home.x, c.home.z, 12, (o, d) => !!d.tags?.includes('chair') || /chair|stool/.test(o.key), 16);
  for (const ch of rng.shuffle(chairs)) {
    const dk = desks.find((d) => Math.abs(d.x - ch.x) <= 1 && Math.abs(d.y - ch.y) <= 1);
    if (dk && walkable(z, ch.x, ch.y)) { sit = { x: ch.x + 0.5, z: ch.y + 0.5, f: Math.atan2(dk.y - ch.y, dk.x - ch.x) }; break; }
  }
  if (!sit) for (const dk of rng.shuffle(desks)) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = dk.x + dx, y = dk.y + dy;
      if (walkable(z, x, y) && !z.objectsAt(x, y).length) { sit = { x: x + 0.5, z: y + 0.5, f: Math.atan2(-dy, -dx) }; break; }
    }
    if (sit) break;
  }
  const pts: { x: number; z: number }[] = [];
  const from = sit ?? c.home;
  for (let tries = 0; tries < 30 && pts.length < 3; tries++) {
    const x = Math.floor(from.x + rng.float(-6, 6)), y = Math.floor(from.z + rng.float(-6, 6));
    if (!walkable(z, x, y) || z.solid[z.idx(x, y)]) continue;
    if (!lineOfSight(z, from.x, from.z, x + 0.5, y + 0.5)) continue;
    pts.push({ x: x + 0.5, z: y + 0.5 });
  }
  if (!pts.length) pts.push({ x: c.home.x, z: c.home.z });
  return { pts, sit, i: 0 };
}

function annoyedBy(c: Creature, dt: number): Player | null {
  const z = zoneOf(c);
  let whoP: Player | null = null;
  for (const p of playersIn(c)) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (d > 9) continue;
    if (!lineOfSight(z, p.x, p.z, c.x, c.z)) continue;
    const dark = lightAt(c.zoneKey, c.x, c.z) < 0.22 && !torchOn(p, c.x, c.z, 9, 0.6);
    const glare = torchOn(p, c.x, c.z, 8, 0.32) && facingTo(c, p.x, p.z, 1.3);
    if ((dark && d < 2.4) || glare) { whoP = p; break; }
  }
  c.mem.annoy = whoP ? (c.mem.annoy ?? 0) + dt : Math.max(0, (c.mem.annoy ?? 0) - dt * 0.5);
  return c.mem.annoy > 0.7 ? whoP : null;
}

function goHostile(c: Creature, p: Player) {
  c.targetId = p.id; c.setState('chase');
  netSet(c, 'angry', 1); netSet(c, 'sit', 0);
  CS().call(c, 'alert');
  speak(c, garble(ANGRY[Math.floor(CS().rng.next() * ANGRY.length)], 0.12), 2.5);
  c.mem.calmAt = G.time + 16;
}

function thinkHollow(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  if (!c.mem.routine) c.mem.routine = buildRoutine(c);
  const R: Routine = c.mem.routine;
  const T = c.targetId ? G.players.get(c.targetId) ?? null : null;
  if (c.state !== 'chase') {
    const whoP = annoyedBy(c, dt);
    if (whoP) { goHostile(c, whoP); return true; }
    if (ev.staggered && T) { goHostile(c, T); return true; }
  }
  // muttering and the occasional line
  if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.07)) { cs.call(c, 'idle'); c.noiseCooldown = 10; }
  if (c.state !== 'chase' && G.time > (c.mem.lineAt ?? 0)) {
    const near = playersIn(c).some((p) => dist(p.x, p.z, c.x, c.z) < 10 && lineOfSight(z, p.x, p.z, c.x, c.z));
    c.mem.lineAt = G.time + (near ? 18 + cs.rng.float(0, 22) : 6);
    if (near) speak(c, garble(LINES[Math.floor(cs.rng.next() * LINES.length)], 0.03));
  }
  switch (c.state) {
    case 'chase': {
      if (!nm(c).angry) { c.mem.calmAt = G.time + 16; cs.call(c, 'alert'); } // struck: the manager put it straight into a chase
      netSet(c, 'angry', 1); netSet(c, 'sit', 0);
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { calm(c); return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const sees = lineOfSight(z, T.x, T.z, c.x, c.z);
      if (sees) c.mem.seenT = G.time;
      if (G.time > (c.mem.calmAt ?? 0) || d > 16 || G.time - (c.mem.seenT ?? G.time) > 6) { calm(c); return true; }
      const reach = (c.sp.attack?.range ?? 0.85) + T.radius;
      if (d <= reach) { faceTo(c, T.x, T.z); stop(c); if (c.attackT <= 0) attack(c, T); return true; }
      cs.moveTo(c, z, T.x, T.z, c.sp.run, dt, reach * 0.8);
      if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.3)) { sayAngry(c); c.noiseCooldown = 4; }
      return true;
    }
    case 'watch': {
      stop(c); netSet(c, 'sit', 0);
      const p = T && dist(T.x, T.z, c.x, c.z) < 8 ? T : null;
      if (p) faceTo(c, p.x, p.z);
      if (!p || c.stateT > (c.mem.watchFor ?? 4)) { c.setState('travel'); c.mem.watchCool = G.time + 14; }
      return true;
    }
    default: {
      // stare at anyone who comes close (it does not blink)
      if (G.time > (c.mem.watchCool ?? 0) && c.state !== 'nest') {
        const p = playersIn(c).find((q) => dist(q.x, q.z, c.x, c.z) < 5.5 && lineOfSight(z, q.x, q.z, c.x, c.z));
        if (p) { c.targetId = p.id; c.setState('watch'); c.mem.watchFor = 3 + cs.rng.float(0, 2.5); if (cs.rng.chance(0.5)) sfx(c, 'hollow_moan', 0.7); return true; }
      }
      return routine(c, R, dt);
    }
  }
}
function sayAngry(c: Creature) { speak(c, garble(ANGRY[Math.floor(CS().rng.next() * ANGRY.length)], 0.15), 2.2); }
function calm(c: Creature) {
  c.setState('travel'); c.targetId = null; c.awareness.clear();
  netSet(c, 'angry', 0); c.mem.annoy = 0; c.mem.watchCool = G.time + 10;
}

/** walk the same short loop, sit at the same desk, for ever */
function routine(c: Creature, R: Routine, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const steps = R.pts.length + (R.sit ? 1 : 0);
  const i = R.i % steps;
  const atDesk = R.sit && i === R.pts.length;
  const goal = atDesk ? R.sit! : R.pts[i];
  if (c.state === 'nest') {
    // seated: typing at nothing
    stop(c); c.x = goal.x; c.z = goal.z; c.facing = c.targetFacing = (goal as any).f ?? c.facing;
    netSet(c, 'sit', 1);
    if (c.stateT > 22) { netSet(c, 'sit', 0); R.i++; c.setState('travel'); }
    return true;
  }
  if (c.state === 'idle') {
    stop(c); netSet(c, 'sit', 0);
    if (c.stateT > 2.5) { R.i++; c.setState('travel'); }
    return true;
  }
  if (c.state !== 'travel') c.setState('travel');
  netSet(c, 'sit', 0);
  if (cs.moveTo(c, z, goal.x, goal.z, c.sp.walk, dt, atDesk ? 0.15 : 0.4) || c.stateT > 30) {
    c.setState(atDesk ? 'nest' : 'idle');
  }
  return true;
}

const sp = def({
  key: 'hollow', name: 'Hollow', code: 'H-00 // DESYNCED STAFF', temperament: 'neutral', threat: 2,
  hp: 45, walk: 1.0, run: 3.4, turn: 7, radius: 0.28, height: 1.8, sight: 12, fov: 1.2, hearing: 0.8,
  attack: { dmg: [5, 10], range: 0.85, cooldown: 1.4, kinds: ['scratch', 'bruise', 'bite'], corrupt: 0.4, knock: 0.2, grab: true, parts: ['uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'neck', 'torso_u'] },
  zones: ['office', 'pools', 'suburbs', 'stairwell', 'mall', 'market', 'parking', 'hospital', 'lab', 'corrupt'], weight: 2, maxPerZone: 4, diet: 'none',
  flags: { glitch: true },
  sounds: { idle: 'hollow_mutter', alert: 'hollow_shriek', attack: 'hollow_moan', hurt: 'static_burst', death: 'hollow_die', step: 'step_carpet' },
  scan: {
    cls: 'Desynced human',
    notes: [
      'A person who stayed in the simulation too long. Rendered at the lowest level of detail.',
      'Repeats a short routine: the same loop, the same desk, the same questions.',
      'Harmless — unless you get close to it in the dark, or shine a light in its face.',
      'Its grab carries a high chance of corruption. Keep the torch pointed at the floor.',
      'It calms down and forgets you if you get out of sight.',
    ],
  },
  gore: { blood: 'static', sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildHollow,
  animate: animateHollow,
  think: thinkHollow,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const R = rig as HollowRig;
  const q = galleryPose('stand');
  const id = 'gallery' + (q.match(/\d+/)?.[0] ?? '');
  if (R.who !== id) adopt(R, id);
  cutSync(R.cut, R.hr.body);
  const mode = (q.replace(/\d+/g, '') || 'stand') as Mode | 'attack' | 'crawl';
  const atk = mode === 'attack' ? { wind: (t % 1.2) < 0.5 ? (t % 1.2) / 0.5 : 0, strike: (t % 1.2) >= 0.5 ? Math.min(1, ((t % 1.2) - 0.5) / 0.2) : 0, follow: 0 } : { wind: 0, strike: 0, follow: 0 };
  const lost = new Set<string>(mode === 'crawl' ? ['shinR'] : []);
  const hostile = mode === 'grab' || mode === 'attack';
  drive(R, null, mode === 'attack' ? 'grab' : mode === 'crawl' ? 'walk' : mode as Mode, t, 1 / 60, { speed: mode === 'walk' ? 1 : mode === 'grab' ? 3 : mode === 'crawl' ? 0.4 : 0, yaw: 0.4, pitch: 0, hostile: 0, atk, flinch: 0, lost, deathT: t });
  R.hr.fx.value.x = hostile ? 0.32 : 0.025;
  R.U.value.set(hostile ? 0.0 : 0.1, t, hostile ? 0.22 : 0.09, hostile ? 1 : 0);
};

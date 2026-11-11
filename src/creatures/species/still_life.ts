import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { HumanRig, Pose as HPose } from '../../entities/humanRig';
import { BONES, BONE_PARENT } from '../../entities/humanModel';
import type { AnimInput } from '../../entities/humanAnim';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { objDef } from '../../world/objects';
import { objectMatrix } from '../../world/chunkMesher';
import { applyHitToPlayer, HitInfo } from '../manager';
import { CS, zoneOf, pulse, objectsNear, wallSpotsNear, walkable, galleryPose, stop, faceTo } from '../behaviors_a';
import { net, netOf, playersIn, seenByAny, hashId, localIn, thinkOnce, playAt, lightAt as lightAtB, fakeCreature } from '../behaviors_b';
import { CutState, cutState, cutSync, cutRestore, lostParts, flinchOf } from '../kit/humanoids';
import {
  MEMORIES, Memory, ADULT_MEMORIES, CHILD_MEMORY, memoryOf, waxify, pageData, pageTexture, replicaPose, ReplicaPose, childProportions, REPLICA_CAST,
} from '../kit/replica';
import { REG, PAGE } from '../../entities/humanModel';
import { KINDS } from '../../gore/kinds';
import { REPLICA_KEYS } from '../../content/furniture/m_replicas';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// STILL LIFE — the place remembers people, and makes them again out of wax.
// Most of them sit where they were put: at the dinner table, on the sofa, in
// bed, nose to the wall. Their heads turn to follow you when you are not
// looking straight at them. Some get up while nobody is watching; some follow
// you round the house at a polite distance; a rare few close their hands round
// your throat. They do not bleed. They are wax, and something dark inside.
// Round 15: they are SPONGE. The cast is a porous, yellow-ochre cellulose under a
// skin of wax: it squashes when struck and springs back, it soaks up whatever it
// stands in (darker and heavier, dripping) and squirts it out when hit, and it tears
// apart in spongy chunks. The shape is still the one human base (HumanRig).
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // a cut through a still life: a wax rim, and the dark that fills it
  A.add('c_wax_cut', 16, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) / 8;
      const n = ph(x, y, 91);
      // a sponge cross-section: a thin wax rind, then open yellow cells with dark pores
      const pore = ph(x >> 1, y >> 1, 37) < 0.35 && ((x + y) & 1) === 0;
      pc.set(x, y, d > 0.9 ? 0xb8a47c : pore ? (n < 0.5 ? 0x5a3e14 : 0x7a5a20) : n < 0.3 ? 0xc89a3a : n < 0.75 ? 0xdcb050 : 0xecc868);
    }
  });
});

// ------------------------------------------------------------------ the sponge: over the wax cast, every cast part goes porous
/**
 * Repaint a cast page as sponge: the wax-coloured pixels (the cast skin) become a yellow-ochre
 * cellulose that keeps the cast's shading, riddled with pores (a dark hole, lit on its lower lip,
 * in a loose cell pattern) and a few larger torn cavities. Eyes, mouths, cloth stay as they are.
 */
export function spongify(d: Uint8Array | Uint8ClampedArray, seed: number) {
  const S = PAGE;
  const SP = [0x6a4a14, 0x8a6420, 0xa47a2a, 0xbc9034, 0xcca040, 0xdab04c, 0xe6c05a, 0xf0d070, 0xf8e090];
  const regs = [REG.HEAD, REG.NECK, REG.TORSO, REG.ARM_L, REG.ARM_R, REG.HAND_L, REG.HAND_R, REG.LEG_L, REG.LEG_R, REG.FOOT_L, REG.FOOT_R].filter(Boolean);
  const isWax = (r: number, g: number, b: number) => { const L = r * 0.3 + g * 0.59 + b * 0.11; return L > 70 && L < 245 && r >= g - 4 && g >= b && r - b > 18 && r - b < 120; };
  const mask = new Uint8Array(S * S);
  for (const R of regs) for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
    const i = (y * S + x) * 4;
    if (isWax(d[i], d[i + 1], d[i + 2])) mask[y * S + x] = 1;
  }
  const put = (x: number, y: number, c: number, t = 1) => {
    if (x < 0 || y < 0 || x >= S || y >= S || !mask[y * S + x]) return;
    const i = (y * S + x) * 4;
    d[i] = Math.round(d[i] + (((c >> 16) & 255) - d[i]) * t); d[i + 1] = Math.round(d[i + 1] + (((c >> 8) & 255) - d[i + 1]) * t); d[i + 2] = Math.round(d[i + 2] + ((c & 255) - d[i + 2]) * t);
  };
  // the body colour: the cast's own light and shade, mapped onto the sponge ramp, with a coarse cell grain
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!mask[y * S + x]) continue;
    const i = (y * S + x) * 4;
    const L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const grain = (ph(x >> 1, y >> 1, seed % 97) - 0.5) * 1.4 + (ph(x, y, 5) - 0.5) * 0.8;
    const k = Math.max(0, Math.min(SP.length - 1, Math.round(1.5 + L * 6.2 + grain)));
    const c = SP[k];
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255;
  }
  // pores: one in most 3x3 cells, offset and sized at random; a few big torn cavities
  for (let cy = 0; cy < S; cy += 3) for (let cx = 0; cx < S; cx += 3) {
    const h = ph(cx, cy, seed % 89 + 3);
    if (h > 0.78 || !mask[cy * S + cx]) continue;
    const px = cx + Math.floor(ph(cx, cy, 7) * 3), py = cy + Math.floor(ph(cx, cy, 8) * 3);
    const big = h < 0.06;
    put(px, py, 0x2a1a08, 0.92); put(px, py + 1, 0xf8e4a0, 0.5);
    if (h < 0.3) { put(px + 1, py, 0x4a3210, 0.8); put(px + 1, py + 1, 0xf0d888, 0.45); }
    if (big) { put(px, py - 1, 0x2a1a08, 0.9); put(px - 1, py, 0x3a2610, 0.85); put(px + 1, py - 1, 0x3a2610, 0.85); put(px - 1, py + 1, 0xf8e4a0, 0.5); }
  }
  // the cast clothes are the same sponge under the paint: sparser pores, the cloth's own colour darkened in them
  const shadeAt = (x: number, y: number, f: number) => { const i = (y * S + x) * 4; d[i] = Math.round(d[i] * f); d[i + 1] = Math.round(d[i + 1] * f); d[i + 2] = Math.round(d[i + 2] * f); };
  for (const R of regs) {
    if (R === REG.HEAD) continue;
    for (let cy = R.y; cy < R.y + R.h - 1; cy += 3) for (let cx = R.x; cx < R.x + R.w - 1; cx += 3) {
      if (mask[cy * S + cx] || ph(cx, cy, seed % 83 + 11) > 0.45) continue;
      const px = cx + Math.floor(ph(cx, cy, 12) * 2), py = cy + Math.floor(ph(cx, cy, 13) * 2);
      shadeAt(px, py, 0.42); if (ph(cx, cy, 14) < 0.4) shadeAt(px + 1, py, 0.6);
    }
  }
}
REPLICA_CAST.push(spongify);

// ------------------------------------------------------------------ rig (pooled: each HumanRig owns a texture page)
interface SLRig extends Rig { hr: HumanRig; counter: THREE.Group; cut: CutState; who: string; m: Record<string, any>; glints: THREE.Mesh[] }
const POOL: SLRig[] = [];
const CUT_R: Record<string, number> = { head: 0.05, neck: 0.045, uarmL: 0.045, uarmR: 0.045, farmL: 0.038, farmR: 0.038, handL: 0.025, handR: 0.025, thighL: 0.07, thighR: 0.07, shinL: 0.05, shinR: 0.05, footL: 0.035, footR: 0.035 };
const capGeo = new Map<number, THREE.BufferGeometry>();
function cutCap(name: string): THREE.Object3D | null {
  const r = CUT_R[name]; if (!r) return null;
  let g = capGeo.get(r);
  if (!g) { const mb = new ModelBuilder(); mb.cylinder(0, -0.012, 0, r, 0.024, 8, { sides: 'c_wax_cut', top: 'c_wax_cut', bottom: 'c_wax_cut' }, { fit: true }); g = mb.build(); capGeo.set(r, g); }
  const m = new THREE.Mesh(g, worldMaterial({})); m.name = 'kit_stump';
  return m;
}
let glintGeo: THREE.BufferGeometry | null = null;
function newRig(): SLRig {
  const hr = new HumanRig(MEMORIES[0].app, worldMaterial({}));
  (hr.skin as any).clone = () => new THREE.Group(); // gibs come from the per-segment proxies
  const root = new THREE.Group(), body = new THREE.Group(), counter = new THREE.Group();
  root.add(body); body.add(counter); counter.add(hr.root);
  if (!glintGeo) { const mb = new ModelBuilder(); mb.box(0, -0.008, 0, 0.022, 0.014, 0.01, 'white', { color: 0xfff2d8, emissive: 1.2 }); glintGeo = mb.build(); }
  // blank wax eyes catch the light in a dark room (kept on the root so they show while the body is hidden)
  const glints = [0, 1].map(() => { const g = new THREE.Mesh(glintGeo!, worldMaterial({ unlit: true, outline: 0 } as any)); g.visible = false; root.add(g); return g; });
  const r: SLRig = { root, body, parts: { ...hr.j }, headY: 1.7, hr, counter, cut: makeCut(hr), who: '', m: {}, glints, eyes: glints };
  POOL.push(r);
  return r;
}
function makeCut(hr: HumanRig): CutState {
  const bones = BONES.map((b) => hr.bones[b]);
  return cutState(bones, hr.skin.skeleton, (i) => cutCap(BONES[i]));
}
function buildSL(): Rig {
  for (const r of POOL) if (!r.root.parent) { tidy(r); return r; }
  return newRig();
}
function tidy(r: SLRig) {
  cutRestore(r.cut, r.root, r.hr.body);
  for (const b of BONES) { const p = BONE_PARENT[b]; const want = p ? r.hr.bones[p] : r.hr.body; if (r.hr.bones[b].parent !== want) want.add(r.hr.bones[b]); }
  r.root.userData = {}; r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0); r.root.scale.set(1, 1, 1);
  r.body.rotation.set(0, 0, 0); r.body.position.set(0, 0, 0); r.body.visible = true;
  r.counter.rotation.set(0, 0, 0); r.counter.position.set(0, 0, 0);
  r.m = {};
}

/** who this one is: a remembered stranger, or one of the survivors */
function lookFor(c: Creature): { key: string; mem: Memory } {
  const n = netOf(c);
  const mi = typeof n.mi === 'number' ? n.mi : 0;
  if (n.cp && G?.players) {
    const p = G.players.get(n.cp) as Player | undefined;
    if (p?.app && p.rig) {
      const o = p.rig.outfit || {};
      const k = 'p:' + n.cp + ':' + (o.torso?.tex ?? '') + (o.torso?.color ?? '') + (o.legs?.color ?? '') + ':' + c.id;
      return { key: k, mem: memoryOf(k, p.app, o, hashId(c.id, 7) * 1000) };
    }
  }
  return { key: 'm:' + mi, mem: MEMORIES[mi % MEMORIES.length] };
}
/** dress a rig as that person (swap in an already painted shell if one is free) */
function adopt(r: SLRig, key: string, mem: Memory) {
  if (r.who === key) return;
  const other = POOL.find((o) => o !== r && o.who === key && !o.root.parent);
  if (other) {
    const keep = { hr: r.hr, cut: r.cut, who: r.who };
    r.counter.remove(r.hr.root); other.counter.remove(other.hr.root);
    r.hr = other.hr; r.cut = other.cut; r.who = other.who;
    other.hr = keep.hr; other.cut = keep.cut; other.who = keep.who;
    r.counter.add(r.hr.root); other.counter.add(other.hr.root);
    r.parts = { ...r.hr.j }; other.parts = { ...other.hr.j };
    cutRestore(r.cut, r.root, r.hr.body);
    return;
  }
  r.hr.outfit = mem.outfit;
  r.hr.setAppearance(mem.app);
  for (const o of Object.values(r.hr.j)) { delete o.userData.wd; o.scale.setScalar(1); }
  waxify(pageData(r.hr), mem, hashId(key, 3) * 1e6);
  spongify(pageData(r.hr), hashId(key, 3) * 1e6);
  pageTexture(r.hr).needsUpdate = true;
  childProportions(r.hr, !!mem.child);
  r.cut = makeCut(r.hr);
  r.who = key;
  r.parts = { ...r.hr.j };
  r.m.spread = mem.flaws.spread; r.m.eyes = mem.flaws.eyes; r.m.child = !!mem.child;
}

// ------------------------------------------------------------------ wrongness: every one is wrong in its own small way
// (the place makes them from memory and does not quite remember what people are for)
const WRONG = ['neck', 'tilt', 'arms', 'shoulders', 'turned', 'hands', 'neck', 'tilt'] as const;
type Wrong = typeof WRONG[number];
function wrongOf(c: Creature): Set<Wrong> {
  const m = c.mem;
  if (!m.wrong) {
    const w = new Set<Wrong>([WRONG[Math.floor(hashId(c.id, 11) * WRONG.length)]]);
    if (hashId(c.id, 12) < 0.45) w.add(WRONG[Math.floor(hashId(c.id, 13) * WRONG.length)]);
    m.wrong = w;
  }
  return m.wrong as Set<Wrong>;
}
/** rotations: a head laid over on the shoulder, a head turned too far round, and the practising twitch */
function wrongPose(P: HPose, w: Set<Wrong>, mode: string, seed: number, t: number) {
  const side = ph(1, 2, seed) < 0.5 ? 1 : -1;
  if (w.has('tilt')) { add(P, 'neck', 0, 0, side * 0.3); add(P, 'head', 0.1, 0, side * 0.75); }
  if (w.has('turned') && mode !== 'walk' && mode !== 'strangle') { add(P, 'neck', 0, side * 0.9, 0); add(P, 'head', 0, side * 1.35, 0); }
  // now and then one joint rehearses a movement, wrongly, and stops
  if (STATIC.has(mode)) {
    const slot = Math.floor(t / 6.5 + seed), f = t / 6.5 + seed - slot;
    if (ph(slot, 3, seed) < 0.4 && f < 0.05) {
      const j = (['head', 'handL', 'handR', 'farmL', 'neck'] as const)[Math.floor(ph(slot, 4, seed) * 5)];
      const k = Math.sin((f / 0.05) * Math.PI) * 0.45;
      add(P, j, k * (ph(slot, 5, seed) - 0.5), k, k * 0.5);
    }
  }
}
/** proportions: a neck a hand too long, arms that reach the knee, shoulders too broad, hands too big */
function nudge(o: THREE.Object3D | undefined, k: number, axes: [number, number, number] = [1, 1, 1]) {
  if (!o) return;
  const ud = o.userData as { wd?: THREE.Vector3 };
  if (ud.wd) o.position.sub(ud.wd); else ud.wd = new THREE.Vector3();
  ud.wd.set(o.position.x * k * axes[0], o.position.y * k * axes[1], o.position.z * k * axes[2]);
  o.position.add(ud.wd);
}
function wrongBody(R: SLRig, w: Set<Wrong>) {
  const J = R.hr.j;
  nudge(J.head, w.has('neck') ? 0.9 : 0);
  nudge(J.farmL, w.has('arms') ? 0.4 : 0); nudge(J.farmR, w.has('arms') ? 0.4 : 0);
  nudge(J.handL, w.has('arms') ? 0.4 : 0); nudge(J.handR, w.has('arms') ? 0.4 : 0);
  nudge(J.uarmL, w.has('shoulders') ? 0.35 : 0, [1, 0, 0]); nudge(J.uarmR, w.has('shoulders') ? 0.35 : 0, [1, 0, 0]);
  const hs = w.has('hands') ? 1.45 : 1;
  J.handL.scale.setScalar(hs); J.handR.scale.setScalar(hs);
}

// ------------------------------------------------------------------ poses & animation
type Mode = ReplicaPose | 'walk' | 'strangle' | 'reach';
const set = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { (p as any)[j] = [x, y, z]; };
const add = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { const v = p[j] as [number, number, number] | undefined; if (v) { v[0] += x; v[1] += y; v[2] += z; } else (p as any)[j] = [x, y, z]; };
const STATIC = new Set(['sit', 'sit_table', 'stand', 'lie', 'kneel', 'child']);
const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/** the static pose for this frame, written into a per-rig scratch pose (no per-frame allocation) */
const POSE_CACHE = new Map<string, HPose>();
function posed(m: Record<string, any>, kind: ReplicaPose, seed: number): HPose {
  const k = kind + ':' + Math.round(seed * 100);
  let base = POSE_CACHE.get(k);
  if (!base) { base = replicaPose(kind, seed); POSE_CACHE.set(k, base); }
  const out: HPose = (m.scratch ??= {});
  for (const key of Object.keys(out)) { const v = (out as any)[key]; if (Array.isArray(v)) { v[0] = 0; v[1] = 0; v[2] = 0; } else delete (out as any)[key]; }
  for (const [key, v] of Object.entries(base)) {
    if (Array.isArray(v)) { const o = ((out as any)[key] ??= [0, 0, 0]); o[0] = v[0]; o[1] = v[1]; o[2] = v[2]; }
    else (out as any)[key] = v;
  }
  return out;
}

function walkPose(R: SLRig, speed: number, dt: number, t: number): HPose {
  const inp: AnimInput = {
    speed, stance: 'stand', full: '', action: '', actionT: 0, actionDur: 1, twoHanded: false, limp: 0, tired: 0, panic: 0, cold: 0,
    aimPitch: 0, holdingLight: false, holding: false, lookYaw: 0, fidget: false,
  };
  const P = R.hr.anim.update(dt, inp);
  // arms hang dead straight and never swing, the torso does not counter-turn: it is carried, not walking
  set(P, 'uarmL', 0.02, 0, 0.05); set(P, 'uarmR', 0.02, 0, -0.05); set(P, 'farmL', -0.05, 0, 0); set(P, 'farmR', -0.05, 0, 0);
  set(P, 'handL', 0, 0.3, 0); set(P, 'handR', 0, -0.3, 0);
  const ch = P.chest as number[] | undefined; if (ch) ch[1] = 0;
  const sp = P.spine as number[] | undefined; if (sp) sp[1] = 0;
  add(P, 'spine', 0.06);
  // a hitch in every other step, like a skipped frame
  if (Math.sin(t * 7.3) > 0.93) add(P, 'head', 0, 0, 0.18);
  P.blink = 0; P.gripL = 0.1; P.gripR = 0.1;
  return P;
}

function strangleShape(P: HPose, t: number, k: number) {
  const sw = Math.sin(t * 13) * 0.05 * k;
  set(P, 'uarmL', -1.42 + sw, -0.32, 0.05); set(P, 'uarmR', -1.42 - sw, 0.32, -0.05);
  set(P, 'farmL', -0.42, 0, 0); set(P, 'farmR', -0.42, 0, 0);
  set(P, 'handL', 0.1, -0.5, 0); set(P, 'handR', 0.1, 0.5, 0);
  add(P, 'spine', 0.14); add(P, 'chest', 0.06); add(P, 'head', -0.12, 0, 0.35 + Math.sin(t * 3) * 0.05);
  P.gripL = 0.75 + Math.sin(t * 9) * 0.2 * k; P.gripR = 0.75 + Math.cos(t * 9) * 0.2 * k;
  P.rootZ = (P.rootZ ?? 0) + 0.06;
}

/** head yaw that turns to follow the local survivor whenever they are not looking straight at it */
function headTrack(R: SLRig, c: Creature, dt: number, frozen: boolean): number {
  const m = R.m;
  const p = localIn(c);
  let want = m.yaw ?? 0;
  if (p && !c.dead) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
    const look = Math.abs(angd(p.facing, Math.atan2(-dz, -dx)));
    const straight = look < 0.4 && c.visibleToLocal;
    m.straight = straight;
    // rig space: +yaw turns toward +x of a figure facing +z (an owl's reach, past where a neck should stop)
    const rel = angd(Math.atan2(dz, dx), c.facing);
    const tgt = Math.max(-2.7, Math.min(2.7, -rel));
    if (d < 18 && !straight && !frozen) want = tgt;
    // the moment you look back: it has moved. one creak, once per turn
    if (straight && Math.abs((m.yaw ?? 0) - (m.yawSeen ?? 0)) > 0.7 && d < 12) {
      playAt('still_neck', c, 0.55, 12);
      if (G.time - (m.stungAt ?? -99) > 25) { m.stungAt = G.time; G.audio?.flat?.('still_moved', 'sfx', 0.32); G.camera?.punch?.(0.025, 0.5); }
    }
    if (straight) m.yawSeen = m.yaw ?? 0;
  }
  const cur = m.yaw ?? 0;
  const step = Math.min(Math.abs(want - cur), dt * 0.7);
  m.yaw = cur + Math.sign(want - cur) * step;
  return m.yaw;
}

function animateSL(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as SLRig, m = R.m;
  // who it is: resolved when that changes (and now and then for copies, whose clothes can change)
  const n0 = netOf(c);
  const sig = (n0.cp ?? '') + '|' + (n0.mi ?? 0);
  if (sig !== m.sig || (n0.cp && t - (m.sigT ?? 0) > 4)) {
    const L = lookFor(c);
    m.sig = sig; m.sigT = t;
    if (R.who !== L.key) { adopt(R, L.key, L.mem); m.spread = L.mem.flaws.spread; m.eyes = L.mem.flaws.eyes; }
  }
  cutSync(R.cut, R.hr.body);
  const n = netOf(c);
  const mode: Mode = (n.ps as Mode) || 'sit';
  const lost = lostParts(c);
  const seed = hashId(c.id, 5) * 50;
  if (c.dead) {
    // stiff as a statue: it keeps the last pose and the manager tips it over
    R.counter.position.y = m.py ?? 0;
    hideGlints(R);
    return;
  }
  const flinch = flinchOf(c);
  let P: HPose;
  const moving = mode === 'walk' && c.speed > 0.05;
  const frozen = !!n.fr && mode === 'walk';
  if (mode === 'walk') {
    // observed mid-stride: not one joint moves until you look away
    if (frozen && m.lastP) P = m.lastP;
    else { P = walkPose(R, Math.max(c.speed, moving ? 0.8 : 0), dt, t); m.lastP = P; }
  } else if (mode === 'strangle') {
    P = posed(m, 'stand', seed); strangleShape(P, t, 1);
  } else if (mode === 'reach') {
    P = posed(m, 'stand', seed); strangleShape(P, t, 0.3); add(P, 'spine', 0.1);
  } else {
    P = posed(m, m.child && mode === 'stand' ? 'child' : STATIC.has(mode) ? (mode as ReplicaPose) : 'sit', seed);
  }
  // the head
  const yaw = headTrack(R, c, dt, frozen);
  if (mode !== 'strangle') { add(P, 'neck', 0, yaw * 0.35, 0); add(P, 'head', 0, yaw * 0.65, 0); }
  else { const p = localIn(c); if (p) add(P, 'head', 0, Math.max(-0.6, Math.min(0.6, -angd(Math.atan2(p.z - c.z, p.x - c.x), c.facing))), 0); }
  // hit: a crack runs through it, it jolts without bending
  if (flinch > 0) { P.rootX = (P.rootX ?? 0) + Math.sin(t * 80) * 0.025 * flinch; add(P, 'head', 0, 0, Math.sin(t * 60) * 0.15 * flinch); }
  if (lost.has('thighL') || lost.has('thighR') || lost.has('shinL') || lost.has('shinR')) { if (mode === 'walk') { P.bodyPitch = 1.2; P.bodyY = 0.25; } }
  const wrong = wrongOf(c);
  wrongPose(P, wrong, mode, seed, t);
  R.hr.applyPose(P);
  wrongBody(R, wrong);
  spongeBody(R, c, n, t, dt, flinch);
  R.hr.fx.value.y += dt;
  // VHS wrongness: a rare tear through the image, more while it moves unseen, a lot while it strangles
  const tear = mode === 'strangle' ? 0.25 : moving && litAt(c) < 0.3 ? 0.08 : 0;
  R.hr.fx.value.x = tear + (ph(Math.floor(t * 3), 0, seed) < 0.01 ? 0.3 : 0);
  R.hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.35;
  // pose height (beds) and stop-motion steps while it walks in the dark
  const py = typeof n.py === 'number' ? n.py : 0;
  m.py = py;
  R.counter.position.y = py;
  if (moving) {
    const hold = m.hold ?? 0;
    if (hold > 0) { m.hold = hold - dt; rig.root.position.set(m.hx, rig.root.position.y, m.hz); }
    else if (ph(Math.floor(t * 4), 1, seed) < (litAt(c) < 0.3 ? 0.55 : 0.2)) { m.hold = 0.12 + ph(Math.floor(t * 4), 2, seed) * 0.12; m.hx = rig.root.position.x; m.hz = rig.root.position.z; }
  } else m.hold = 0;
  eyeShine(R, c);
  strangleLocal(R, c, n, t, dt);
}

/** sponge: squashes on a hit and springs back; soaked, it is darker and it drips (and squirts when struck) */
function spongeBody(R: SLRig, c: Creature, n: Record<string, any>, t: number, dt: number, flinch: number) {
  const m = R.m;
  m.sq = Math.max(m.sq ?? 0, flinch);
  m.sq = Math.max(0, (m.sq ?? 0) - dt * 2.2);
  const k = m.sq * Math.cos((1 - m.sq) * 14) * (m.sq > 0 ? 1 : 0);
  R.counter.scale.set(1 + k * 0.14, 1 - k * 0.18, 1 + k * 0.14);
  const wet = Math.max(0, Math.min(1, typeof n.wt === 'number' ? n.wt : 0));
  const mat = R.hr.skin.material as THREE.MeshLambertMaterial;
  const tone = 1 - wet * 0.38;
  if (mat?.color && Math.abs(mat.color.r - tone) > 0.01) mat.color.setRGB(tone, tone * 0.98, tone * 0.94);
  if (!c.visibleToLocal || c.dead) return;
  // a fresh hit on a soaked one wrings it out
  if (flinch > 0.9 && wet > 0.15 && (m.squirtT ?? 0) < t - 0.4) {
    m.squirtT = t;
    const a = c.facing + Math.PI + (Math.random() - 0.5) * 1.2;
    G.gore?.jet?.(KINDS.pale, 0x8a8a70, c.x, 0.9, c.z, Math.cos(a), Math.sin(a), Math.round(6 + wet * 14), 2.2, 0.8, 1.1, 0.02, 0.05);
    playAt('tc_squish', c, 0.7, 12, 0.9 + Math.random() * 0.2);
  }
  if (wet > 0.3 && (m.dripT = (m.dripT ?? 0) - dt) <= 0) {
    m.dripT = 0.5 + Math.random() * (1.4 - wet);
    G.gore?.jet?.(KINDS.pale, 0x8a8a70, c.x + (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, c.z + (Math.random() - 0.5) * 0.3, 0, 0, 1, 0.1, 0.2, -0.2, 0.014, 0.03);
  }
  void t;
}
/** host: it soaks up what it stands in (wet carpet, puddles, the pool), and dries out slowly */
function soak(c: Creature, dt: number) {
  const n = net(c);
  if (typeof n.wt !== 'number') n.wt = Math.round(hashId(c.id, 9) * 50) / 100;
  let f: any = null;
  try { f = zoneOf(c).floorAt(Math.floor(c.x), Math.floor(c.z)); } catch { /* none */ }
  const wetFloor = !!f && (f.water || String(f.sound ?? '').includes('wet') || String(f.key ?? '').includes('wet'));
  const w = Math.max(0, Math.min(1, n.wt + (wetFloor ? dt * 0.12 : -dt * 0.004)));
  if (Math.abs(w - n.wt) > 0.02) n.wt = Math.round(w * 100) / 100;
  // wrung out a little by every blow
  if (c.hitFlash > 0.12 && n.wt > 0.1) n.wt = Math.round(Math.max(0, n.wt - 0.08) * 100) / 100;
}
const litAt = (c: Creature) => (G && (G as any).players && c.zoneKey ? lightAtB(zoneOf(c), c.x, c.z) : 0.5);
const _hp = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _inv = new THREE.Matrix4();
function hideGlints(R: SLRig) { for (const g of R.glints) g.visible = false; }
/** blank eyes are the only part of it that shows in the dark, and only when your light is on it */
function eyeShine(R: SLRig, c: Creature) {
  const p = localIn(c);
  if (!p || (R.m.eyes !== 'blank' && R.m.eyes !== 'painted')) { hideGlints(R); return; }
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  const lit = litAt(c);
  const show = d < 15 && lit < 0.55 && p.flashlightOn && Math.abs(angd(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) < 0.6;
  if (!show) { hideGlints(R); return; }
  const head = R.hr.j.head;
  R.root.updateMatrixWorld(true);
  head.getWorldQuaternion(_q);
  const s = R.hr.s * (R.m.child ? 1.32 * 0.62 : 1);
  const inv = _inv.copy(R.root.matrixWorld).invert();
  _q2.setFromRotationMatrix(inv);
  for (let k = 0; k < 2; k++) {
    const a = ((k ? 1 : -1) * (R.m.spread ?? 17.5) * Math.PI) / 180;
    _hp.set(Math.sin(a) * 0.088 * s, 0.096 * s, Math.cos(a) * 0.088 * s + 0.002).applyMatrix4(head.matrixWorld).applyMatrix4(inv);
    const g = R.glints[k];
    g.position.copy(_hp);
    g.quaternion.copy(_q).premultiply(_q2);
    g.visible = true;
  }
}

/** on the victim's own machine: held in place, the room dims, the camera closes in */
function strangleLocal(R: SLRig, c: Creature, n: Record<string, any>, t: number, dt: number) {
  const p = G?.local as Player | undefined;
  const m = R.m;
  const on = !!p && n.sv === p.id && n.ps === 'strangle' && !p.body.dead;
  if (on) {
    if (!m.strOn) {
      m.strOn = true; m.strT = 0;
      G.camera?.pushIn?.(0.24, 0.5, -6);
      G.audio?.flat?.('still_choke', 'sfx', 0.75);
      G.audio?.flat?.('dread_hit', 'music', 0.55);
      bus.emit('subtitle', { who: '', text: '— can\'t — breathe —', dur: 2.4, style: 'self' });
      thinkOnce(p, 'sl_strangle', ['Its hands are cold wax and they will not open.', 'It is not even looking at me while it does it.', 'Get it OFF — hit it — shove it —'][Math.floor(Math.random() * 3)], 20);
    }
    m.strT += dt;
    // pinned an arm's length in front of it
    const fx = Math.cos(c.facing), fz = Math.sin(c.facing);
    const tx = c.x + fx * 0.52, tz = c.z + fz * 0.52;
    p.x += (tx - p.x) * Math.min(1, dt * 8); p.z += (tz - p.z) * Math.min(1, dt * 8);
    p.vx *= 0.1; p.vz *= 0.1;
    const k = Math.min(1, m.strT / 3);
    G.pr.fx.blink = Math.max(G.pr.fx.blink, 0.18 + k * 0.45 + Math.max(0, Math.sin(t * 2.6)) * 0.2 * k);
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.25 + k * 0.25);
    G.pr.fx.desat = Math.max(G.pr.fx.desat ?? 0, 0.3 * k);
    if (((m.strT * 2) | 0) !== ((m.strT * 2 - dt * 2) | 0)) { G.camera?.shake?.(0.18 + k * 0.2, 0.45, 0.55); G.audio?.flat?.('heartbeat', 'sfx', 0.5 + k * 0.4, 1 + k * 0.4); }
  } else if (m.strOn) {
    m.strOn = false;
    G.camera?.pushIn?.(0, 1.2);
    if (p && !p.body.dead) { G.audio?.flat?.('gasp_recover', 'sfx', 0.6); thinkOnce(p, 'sl_free', 'Air. AIR. My throat is on fire.', 20); }
  }
}

// ------------------------------------------------------------------ brain (host)
type Role = 'still' | 'mover' | 'follower' | 'hostile';
const SEAT = /(chair|stool|bench)/;
const SOFA = /(sofa|armchair|couch|loveseat)/;
const BED = /^(bed_single|bed_double|bunk_bed|bed_hospital|crafted_bed)$/;
const TABLE = /(table|desk|counter|bar)/;

interface Spot { x: number; z: number; f: number; pose: ReplicaPose; py: number; claim: string }
function claims(c: Creature): Map<string, string> {
  const z = zoneOf(c);
  return (z.meta.__slClaims ??= new Map<string, string>()) as Map<string, string>;
}
function releaseClaim(c: Creature) {
  const k = c.mem.claim as string | undefined;
  if (k && claims(c).get(k) === c.id) claims(c).delete(k);
  c.mem.claim = undefined;
}

/** places a still life can be put: at a table, on a sofa, in a bed, facing a wall */
function findSpots(c: Creature, cx: number, cz: number, r: number): Spot[] {
  const z = zoneOf(c);
  const out: Spot[] = [];
  const cl = claims(c);
  const obs = objectsNear(z, cx, cz, r, (o) => SEAT.test(o.key) || SOFA.test(o.key) || BED.test(o.key), 60);
  for (const o of obs) {
    const d = objDef(o.key); if (!d) continue;
    const m = objectMatrix(z, o, d), e = m.elements;
    const fx = e[8], fz = e[10], rx = e[0], rz = e[2];
    const fl = Math.hypot(fx, fz) || 1, rl = Math.hypot(rx, rz) || 1;
    const F = [fx / fl, fz / fl], Rt = [rx / rl, rz / rl];
    const facing = Math.atan2(F[1], F[0]);
    const floorY = z.heightAt(o.x, o.y);
    if (BED.test(o.key)) {
      const k = 'o' + o.uid;
      if (cl.has(k) && cl.get(k) !== c.id) continue;
      out.push({ x: e[12] + F[0] * 0.86, z: e[14] + F[1] * 0.86, f: facing, pose: 'lie', py: e[13] - floorY + (d.surface ?? 0.5) - 0.02, claim: k });
    } else if (SOFA.test(o.key)) {
      const w = d.w ?? 1;
      for (let s = 0; s < w; s++) {
        const k = 'o' + o.uid + ':' + s;
        if (cl.has(k) && cl.get(k) !== c.id) continue;
        const off = (s - (w - 1) / 2);
        out.push({ x: e[12] + Rt[0] * off - F[0] * 0.12, z: e[14] + Rt[1] * off - F[1] * 0.12, f: facing, pose: 'sit', py: -0.03, claim: k });
      }
    } else {
      const k = 'o' + o.uid;
      if (cl.has(k) && cl.get(k) !== c.id) continue;
      // a table in front of the chair: hands on it
      const tx = Math.floor(e[12] + F[0]), tz = Math.floor(e[14] + F[1]);
      const table = z.inb(tx, tz) && z.objectsAt(tx, tz).some((q: any) => TABLE.test(q.key) || objDef(q.key)?.block === 'table');
      out.push({ x: e[12] - F[0] * 0.07, z: e[14] - F[1] * 0.07, f: facing, pose: table ? 'sit_table' : 'sit', py: 0, claim: k });
    }
  }
  return out;
}
function wallSpot(c: Creature): Spot | null {
  const z = zoneOf(c), rng = CS().rng;
  const ws = wallSpotsNear(z, c.home.x, c.home.z, 8);
  for (let i = 0; i < 8 && ws.length; i++) {
    const w = ws[Math.floor(rng.next() * ws.length)];
    if (z.objectsAt(w.tx, w.ty).length) continue;
    return { x: w.x + w.nx * 0.32, z: w.z + w.nz * 0.32, f: Math.atan2(-w.nz, -w.nx), pose: 'stand', py: 0, claim: '' };
  }
  return null;
}

/** sit it down somewhere nobody can see it being put */
function settle(c: Creature, radius = 16, unseen = true): boolean {
  const z = zoneOf(c), rng = CS().rng;
  const spots = findSpots(c, c.home.x, c.home.z, radius).filter((s) => !unseen || !seenByAny(z, s.x, s.z));
  let pick: Spot | null = null;
  if (spots.length) {
    const w = spots.map((s) => (s.pose === 'sit_table' ? 4 : s.pose === 'lie' ? 1.2 : 2) * (0.5 + rng.next()));
    let best = 0; for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
    pick = spots[best];
  } else {
    pick = wallSpot(c);
    if (pick && unseen && seenByAny(z, pick.x, pick.z)) pick = null;
  }
  if (!pick) return false;
  releaseClaim(c);
  if (pick.claim) { claims(c).set(pick.claim, c.id); c.mem.claim = pick.claim; }
  c.x = pick.x; c.z = pick.z; c.facing = c.targetFacing = pick.f;
  c.mem.anchor = { x: pick.x, z: pick.z, f: pick.f };
  const n = net(c);
  n.ps = pick.pose; n.py = pick.py; n.fr = 0; n.sv = null;
  c.setState('disguised');
  return true;
}

function roleOf(c: Creature): Role {
  const h = hashId(c.id, 3);
  return h < 0.48 ? 'still' : h < 0.72 ? 'mover' : h < 0.92 ? 'follower' : 'hostile';
}

function init(c: Creature) {
  c.mem.init = 1;
  c.mem.role = c.mem.role ?? roleOf(c);
  const n = net(c), rng = CS().rng;
  if (n.mi === undefined) {
    n.mi = rng.chance(0.14) ? CHILD_MEMORY : ADULT_MEMORIES[Math.floor(rng.next() * ADULT_MEMORIES.length)];
    // sometimes it is one of you
    const ps = playersIn(c.zoneKey);
    if (ps.length && n.mi !== CHILD_MEMORY && rng.chance(0.35)) n.cp = ps[Math.floor(rng.next() * ps.length)].id;
  }
  if (!c.mem.anchor) { if (!settle(c, 18, true)) { n.ps = 'stand'; c.mem.anchor = { x: c.x, z: c.z, f: c.facing }; c.setState('disguised'); } }
  c.mem.cool = G.time + 4;
}

/** the survivor it means: the nearest one in the house */
function nearest(c: Creature, maxD = 30): { p: Player; d: number } | null {
  let best: Player | null = null, bd = maxD;
  for (const p of playersIn(c.zoneKey)) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}

function squeeze(c: Creature, p: Player) {
  const rng = CS().rng;
  const hit: HitInfo = { dmg: rng.float(5, 8), kinds: ['bruise'], corrupt: 0, height: 1.5, knock: 0, from: [c.x, c.z], grab: true, parts: ['neck'], by: 'still_life' };
  if (p.isLocal) applyHitToPlayer(p, hit); else G.net?.sendHurt?.(p.id, hit);
}

function startStrangle(c: Creature, p: Player) {
  const n = net(c);
  c.mem.str = { pid: p.id, t: 0, next: 0.35 };
  n.ps = 'strangle'; n.sv = p.id; n.fr = 0;
  c.setState('attack');
  faceTo(c, p.x, p.z, true);
  playAt('still_choke', c, 0.9, 14);
}
function endStrangle(c: Creature) {
  const n = net(c);
  c.mem.str = undefined;
  n.sv = null; n.ps = 'walk'; n.fr = 1;
  c.mem.cool = G.time + 18;
  c.setState('stalk');
}

function thinkSL(c: Creature, dt: number): boolean {
  if (!c.mem.init) init(c);
  soak(c, dt);
  const cs = CS(), z = zoneOf(c), n = net(c);
  const ev = pulse(c);
  const role: Role = c.mem.role;
  const near = nearest(c, 40);
  const seen = cs.observed(c, z, true);
  if (seen) c.mem.everSeen = true;
  // struck: whatever it was, it is not still any more
  if (ev.hurt > 0 || ev.staggered) {
    if (c.mem.str) endStrangle(c);
    releaseClaim(c);
    if (role === 'still' || role === 'follower') c.mem.role = 'mover';
    if (c.state === 'disguised') { n.ps = 'walk'; n.fr = 1; c.setState('stalk'); playAt('still_crack', c, 0.9, 14); }
    c.mem.cool = G.time + 1.5;
  }
  // ---- strangling
  if (c.mem.str) {
    const s = c.mem.str as { pid: string; t: number; next: number };
    const p = G.players.get(s.pid) as Player | undefined;
    s.t += dt;
    if (!p || p.body.dead || p.zoneKey !== c.zoneKey || s.t > 4.6 || Math.hypot(p.x - c.x, p.z - c.z) > 1.6) { endStrangle(c); return true; }
    stop(c); faceTo(c, p.x, p.z);
    s.next -= dt;
    if (s.next <= 0) { s.next = 0.7; squeeze(c, p); }
    return true;
  }
  switch (c.state) {
    case 'disguised': {
      // pinned where it was put (players bump into it; it does not shift)
      const a = c.mem.anchor; if (a) { c.x = a.x; c.z = a.z; c.facing = c.targetFacing = a.f; }
      stop(c);
      if (!near || G.time < (c.mem.cool ?? 0)) return true;
      const d = near.d;
      if ((role === 'mover' || role === 'hostile') && c.mem.everSeen && !seen && d < 14 && d > 1.6) {
        releaseClaim(c); n.ps = 'walk'; n.fr = 0; c.setState('stalk');
        if (d < 9) playAt('still_creak', c, 0.5, 10);
        return true;
      }
      if (role === 'follower' && c.mem.everSeen && d < 9 && d > 2.5) {
        releaseClaim(c); n.ps = 'walk'; n.fr = 0; c.setState('follow');
        return true;
      }
      // the still ones change chairs, now and then, between one look and the next
      if (role === 'still' && c.mem.everSeen && !seen && d > 5 && G.time > (c.mem.moveAt ?? (c.mem.moveAt = G.time + 40 + cs.rng.next() * 60))) {
        c.mem.moveAt = G.time + 50 + cs.rng.next() * 80;
        const was = { x: c.x, z: c.z };
        if (!seenByAny(z, was.x, was.z)) settle(c, 10, true);
      }
      return true;
    }
    case 'stalk': case 'chase': {
      if (!near || near.d > 22) { if (!seenByAny(z, c.x, c.z)) settle(c, 14, true); else stop(c); return true; }
      const p = near.p, d = near.d;
      if (seen) {
        // looked at: it is a statue again, caught mid-step
        stop(c); n.fr = 1; c.mem.unseenT = 0;
        return true;
      }
      n.fr = 0;
      c.mem.unseenT = (c.mem.unseenT ?? 0) + dt;
      if (d > 1.25) {
        cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, 1.15);
        if (cs.rng.chance(dt * 0.25) && d < 10) playAt('still_creak', c, 0.4, 9);
        return true;
      }
      stop(c); faceTo(c, p.x, p.z);
      if (c.mem.role === 'hostile' && c.mem.unseenT > 0.6 && G.time > (c.mem.cool ?? 0)) { startStrangle(c, p); return true; }
      // just behind you, for as long as you do not turn round; then back to its chair
      if (c.stateT > 30 && !seenByAny(z, c.x, c.z)) settle(c, 14, true);
      return true;
    }
    case 'follow': {
      if (!near || near.d > 18 || c.stateT > 70) { if (!seenByAny(z, c.x, c.z)) settle(c, 14, true); else stop(c); return true; }
      const p = near.p, d = near.d;
      faceTo(c, p.x, p.z);
      if (seen && d < 7) { stop(c); n.fr = 1; return true; }
      n.fr = 0;
      if (d > 5.5) cs.moveTo(c, z, p.x, p.z, c.sp.walk, dt, 4.2);
      else stop(c);
      return true;
    }
    case 'attack': endStrangle(c); return true;
    default:
      if (!settle(c, 16, true)) { n.ps = 'stand'; c.setState('disguised'); c.mem.anchor = { x: c.x, z: c.z, f: c.facing }; }
      return true;
  }
}

const sp = def({
  key: 'still_life', name: 'Still Life', code: 'SL-11 // REPLICATED OCCUPANT', temperament: 'neutral', threat: 2,
  rule: { name: 'HEADS THAT TURN', text: 'Most never move while you look straight at them. Keep facing the room and back out.' },
  hp: 70, walk: 1.05, run: 2.6, turn: 6, radius: 0.27, height: 1.75, sight: 10, fov: 1.0, hearing: 0.3,
  attack: { dmg: [5, 8], range: 0.8, cooldown: 1.2, kinds: ['bruise'], corrupt: 0, knock: 0, grab: true, parts: ['neck'] },
  zones: ['house', 'suburbs', 'school', 'hospital'], weight: 1.5, maxPerZone: 7, group: [1, 3], diet: 'none',
  flags: { weepingAngel: true, furniture: 'replica_seated' },
  sounds: { hurt: 'tc_squish', death: 'still_fall' },
  scan: {
    cls: 'Replica (wax over sponge)',
    notes: [
      'A copy of a person, cast from memory. Waxy, too smooth, the features slightly wrong.',
      'Sometimes it is a copy of someone in your crew, down to the jumpsuit.',
      'Most never move. Their heads follow you when you are not looking straight at them.',
      'Some move only while nobody is watching. Some follow you round the house.',
      'Rarely, one will close its hands round a throat. Strike it or shove it to break the grip.',
      'It does not bleed. Under a skin of wax it is sponge: it squashes, soaks up what it stands in, and tears apart in spongy chunks.',
    ],
  },
  gore: { blood: 'stuffing', tint: 0xe8c464, flesh: 0xdcb050, sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  remains: 'none',
  build: buildSL,
  animate: animateSL,
  think: thinkSL,
});
(sp as any).handlesSevered = true;
// clients: the claim list is host-only bookkeeping, but nothing else here needs a host
bus.on('creatureKilled', (c: Creature) => { if (c?.sp?.key === 'still_life') releaseClaim(c); });

(sp as any).animateGallery = (rig: Rig, t: number) => {
  const R = rig as SLRig;
  const q = galleryPose('sit');
  const idx = Number(q.match(/\d+/)?.[0] ?? 0);
  const mode = q.replace(/\d+/g, '') || 'sit';
  const fc = (R.m.fc ??= fakeCreature(sp, { id: 'gal' + idx + mode, mem: { netMem: { mi: idx, ps: mode === 'copy' ? 'stand' : mode } } }));
  fc.animT = t;
  fc.speed = mode === 'walk' ? 1.2 : 0;
  animateSL(rig, fc, t, 1 / 60);
};
export { REPLICA_KEYS };

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(sp, { twitch: 0.5, snap: 0.3 });

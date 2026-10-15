// The dread layer: what makes every creature in the building wrong, on top
// of its own animation and AI (src/creatures/manager.ts calls in here).
//
// Per species (PROFILES, keyed by species key; new species add their own with
// defDread) and per peer, all of it visual except the two host hooks:
//  - stop-motion: the pose (and where it is drawn) holds for a few frames, then
//    snaps on; in the dark, movers are drawn in jumps ("frame skips");
//  - it stops moving the moment you look straight at it (idle, not hunting);
//  - head tilts that keep going past comfortable while it watches you, and
//    twitch idles (a joint snaps out of true for two frames);
//  - limbs that are too long at the moment it strikes;
//  - eye-shine in the dark, glitch dropouts;
//  - stingers, camera punches and push-ins when the hunt starts and when it
//    strikes; flashlights and ceiling tubes stutter when certain things hunt
//    near you, and some of them only cross the room while the light is out
//    (host: dreadFlickStep).
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Creature } from './creature';
import type { Rig } from './species';
import type { Player } from '../entities/player';
import { lineOfSight } from '../world/collision';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';
import '../audio/sounds_creatures_c';

export interface DreadProfile {
  /** pose holds per second (stop-motion), scaled up in the dark and while hunting */
  stutter?: number;
  /** 0..1: while moving in the dark it is drawn in jumps */
  skipDark?: number;
  /** stops every idle motion while the local survivor looks straight at it */
  watchFreeze?: boolean;
  /** head part that tilts while it watches you, and how far (radians) */
  tilt?: string; tiltMax?: number;
  /** parts that twitch out of true now and then, and the twitches per second */
  twitch?: string[]; twitchRate?: number;
  /** impossible bends: these joints flip the wrong way for a few frames while it moves (per second) */
  bend?: string[]; bendRate?: number;
  /** eye-shine in the dark: on part, offset in part space, half separation, colour */
  shine?: { part: string; off: [number, number, number]; sep: number; color?: number; size?: number };
  /** parts that grow too long while it strikes (scale along their own y) */
  stretch?: { parts: string[]; amount: number };
  /** VHS dropouts per second (drawn offset or not at all for a frame or two) */
  glitch?: number;
  /** stinger when its hunt for you begins */
  sting?: 'hit' | 'swell' | 'chase';
  /** camera weight of its hunt starting / its strikes (0..1) */
  cam?: number;
  /** while hunting within this radius, flashlights and tubes near you stutter */
  flick?: number;
  /** host: it closes the distance while the light is out */
  flickStep?: number;
  /** a sound it makes during your light's stutter (close, quiet) */
  flickSound?: string;
  /** notice-it-moved stinger (weeping-angel types) */
  moved?: boolean;
}

const PROFILES: Record<string, DreadProfile> = {
  custodian: { stutter: 0.12, watchFreeze: true, tilt: 'head', tiltMax: 0.5, flick: 9, sting: 'swell', cam: 0.4 },
  davenport: { twitch: ['legFL', 'legBR', 'armL'], twitchRate: 0.18, stretch: { parts: ['armL', 'armR'], amount: 0.45 }, sting: 'hit', cam: 0.8 },
  drywall_man: { bend: ['shinL', 'shinR', 'farmL', 'farmR'], bendRate: 0.5, stutter: 0.3, skipDark: 0.6, tilt: 'head', tiltMax: 0.7, twitch: ['head', 'handL', 'handR'], twitchRate: 0.35, stretch: { parts: ['farmL', 'farmR'], amount: 0.5 }, sting: 'hit', cam: 0.8, flick: 7, flickStep: 2.5 },
  echo: { bend: ['shinL', 'shinR', 'foreL', 'foreR'], bendRate: 0.4, stutter: 0.15, watchFreeze: true, tilt: 'head', tiltMax: 0.95, twitch: ['head'], twitchRate: 0.5, stretch: { parts: ['foreL', 'foreR'], amount: 0.35 }, sting: 'swell', cam: 0.6, flick: 6, flickStep: 3 },
  employee: { bend: ['shinL', 'shinR', 'farmL', 'farmR', 'neck'], bendRate: 0.6, stutter: 0.2, skipDark: 0.8, tilt: 'head', tiltMax: 0.6, twitch: ['handL', 'handR', 'head'], twitchRate: 0.25, stretch: { parts: ['farmL', 'farmR'], amount: 0.4 }, sting: 'hit', cam: 0.6, flick: 8, flickStep: 3.5, moved: true },
  grinhound: { bend: ['shin0', 'shin1', 'shin2', 'shin3'], bendRate: 0.3, twitch: ['head'], twitchRate: 0.3, shine: { part: 'head', off: [0, 0.06, 0.16], sep: 0.045, color: 0xd8ff9a }, sting: 'chase', cam: 0.9, skipDark: 0.25 },
  hollow: { bend: ['shinL', 'shinR', 'farmL', 'farmR'], bendRate: 0.25, skipDark: 0.5, tilt: 'head', tiltMax: 0.55, flick: 5, sting: 'hit', cam: 0.5 },
  lifeguard: { stretch: { parts: ['foreL', 'foreR'], amount: 0.5 }, sting: 'hit', cam: 0.9, tilt: 'head', tiltMax: 0.5 },
  occupant: { flick: 16, cam: 1, sting: 'swell' },
  plushkin: { watchFreeze: true, tilt: 'bearhead', tiltMax: 0.6, twitch: ['bunnyhead', 'beararmL'], twitchRate: 0.2, moved: true },
  sentinel: { shine: { part: 'head', off: [0, 0.02, 0.12], sep: 0.05, color: 0xfff2c8 }, flick: 10 },
  stilt_doe: { bend: ['shin0', 'shin1', 'shin2', 'shin3'], bendRate: 0.5, stutter: 0.1, skipDark: 0.4, tilt: 'head', tiltMax: 0.8, shine: { part: 'head', off: [0, 0.05, 0.1], sep: 0.06, color: 0xf8f0b0 } },
  swivel: { twitch: ['leg0', 'leg2', 'armL'], twitchRate: 0.25, sting: 'hit', cam: 0.7 },
  underlay: { sting: 'hit', cam: 0.8, flick: 5 },
  ventling: { shine: { part: 'head', off: [0, 0.03, 0.08], sep: 0.03, color: 0xffd060, size: 0.016 }, twitch: ['head'], twitchRate: 0.6 },
  wrongbird: { stutter: 0.3, skipDark: 0.5, tilt: 'head', tiltMax: 1.1, twitch: ['head'], twitchRate: 0.6 },
  still_life: { moved: true },
};
/** new species register their profile here */
export function defDread(key: string, p: DreadProfile) { PROFILES[key] = p; }
export const dreadOf = (c: Creature): DreadProfile | undefined => PROFILES[c.sp.key];

// ---------------------------------------------------------------- helpers
const h01 = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function idSeed(c: Creature) { let h = 0; for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) | 0; return ((h >>> 0) % 9973) / 9973 * 100; }
const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const HUNT = new Set(['chase', 'stalk', 'attack', 'investigate', 'watch', 'warn']);
const live = () => !!G && !!(G as any).players;
/** the player asked for no flicker / glitch effects */
const calmFx = () => { try { return document.documentElement.classList.contains('reduce-flash'); } catch { return false; } };
const lightHere = (c: Creature) => (live() && G.view?.zone.key === c.zoneKey ? G.lightLevelAt(c.x, c.z) : 0.5);

interface DState { bd: { part: string; t: number; a: number } | null; seed: number; holdT: number; skipT: number; sx: number; sz: number; sf: number; added: Map<THREE.Object3D, [number, number, number]>; tw: { part: string; t: number; r: [number, number, number] } | null; tilt: number; stretchK: number; seenAt: number; seenX: number; seenZ: number; atk: boolean; glT: number; huntSeen: boolean }
function ds(rig: Rig, c: Creature): DState {
  const ud = rig.root.userData;
  let s = ud.dread as DState | undefined;
  if (!s) { s = { bd: null, seed: idSeed(c), holdT: 0, skipT: 0, sx: 0, sz: 0, sf: 0, added: new Map(), tw: null, tilt: 0, stretchK: 0, seenAt: -1, seenX: c.x, seenZ: c.z, atk: false, glT: 0, huntSeen: false }; ud.dread = s; }
  return s;
}

/** is the local survivor looking straight at c (in the cone, visible, close enough) */
function lookedAt(c: Creature, cone = 0.45, maxD = 16): boolean {
  const p = G.local;
  if (!p || p.zoneKey !== c.zoneKey || !c.visibleToLocal) return false;
  const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
  if (d > maxD) return false;
  return Math.abs(angd(p.facing, Math.atan2(dz, dx))) < cone;
}

// ---------------------------------------------------------------- per creature, around its animate()
/**
 * Before the species animates: undo last frame's additive offsets, and decide
 * whether this frame is held (stop-motion / frozen while watched). Returns true
 * to skip animate() and the position update.
 */
export function dreadBefore(c: Creature, dt: number): boolean {
  const rig = c.rig; if (!rig) return false;
  const P = dreadOf(c); if (!P || c.dead) return false;
  const s = ds(rig, c);
  if (off()) { for (const [o, r] of s.added) { o.rotation.x -= r[0]; o.rotation.y -= r[1]; o.rotation.z -= r[2]; } s.added.clear(); return false; }
  // restore what we added (animate() may or may not overwrite these joints)
  for (const [o, r] of s.added) { o.rotation.x -= r[0]; o.rotation.y -= r[1]; o.rotation.z -= r[2]; }
  s.added.clear();
  if (calmFx()) return false;
  const t = G.time;
  const hunting = HUNT.has(c.state);
  const dark = lightHere(c) < 0.25;
  // frozen while watched: not a breath
  if (P.watchFreeze && !hunting && c.speed < 0.05 && lookedAt(c)) return true;
  // stop-motion holds
  if (s.holdT > 0) { s.holdT -= dt; return true; }
  const rate = (P.stutter ?? 0) * (dark ? 1.6 : 1) * (hunting ? 1.5 : 1);
  if (rate > 0 && h01(Math.floor(t * 12), s.seed) < rate / 12) { s.holdT = 0.06 + h01(Math.floor(t * 12), s.seed + 1) * 0.2; return true; }
  return false;
}

/** where the creature is drawn this frame (after the manager placed the root): frame skips in the dark */
export function dreadPlace(c: Creature, dt: number) {
  const rig = c.rig; if (!rig || off()) return;
  const P = dreadOf(c); if (!P || c.dead) return;
  const s = ds(rig, c);
  const k = P.skipDark ?? 0;
  if (k > 0 && c.speed > 0.4 && lightHere(c) < 0.25) {
    if (s.skipT > 0) { s.skipT -= dt; rig.root.position.x = s.sx; rig.root.position.z = s.sz; rig.root.rotation.y = s.sf; return; }
    if (h01(Math.floor(G.time * 8), s.seed + 5) < k * 0.8) { s.skipT = 0.09 + k * 0.12; s.sx = rig.root.position.x; s.sz = rig.root.position.z; s.sf = rig.root.rotation.y; }
  } else s.skipT = 0;
}

const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
/** dev: window.__noDread = true switches the whole layer off (before / after comparisons) */
const off = () => { try { return !!(window as any).__noDread; } catch { return false; } };
/** after the species animated: tilts, twitches, stretch, shine, glitch, stingers */
export function dreadAfter(c: Creature, dt: number) {
  const rig = c.rig; if (!rig || off()) return;
  const P = dreadOf(c); if (!P) return;
  const s = ds(rig, c);
  const t = G.time;
  const p = G.local as Player | undefined;
  if (c.dead) { shine(rig, c, P, false); restoreStretch(rig, P, s); return; }
  const add = (name: string, x: number, y: number, z: number) => {
    const o = rig.parts[name]; if (!o) return;
    o.rotation.x += x; o.rotation.y += y; o.rotation.z += z;
    const a = s.added.get(o); if (a) { a[0] += x; a[1] += y; a[2] += z; } else s.added.set(o, [x, y, z]);
  };
  const hunting = HUNT.has(c.state);
  // ---- the head tilt: it keeps going while it watches you
  if (P.tilt && p && p.zoneKey === c.zoneKey) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const watching = d < 14 && c.state !== 'chase' && c.state !== 'attack' && Math.abs(angd(c.facing, Math.atan2(p.z - c.z, p.x - c.x))) < 1.1;
    const goal = watching ? (P.tiltMax ?? 0.5) * (h01(Math.floor(s.seed), 3) < 0.5 ? 1 : -1) : 0;
    s.tilt += (goal - s.tilt) * Math.min(1, dt * (watching ? 0.7 : 3));
    // and once in a while it snaps a little further
    const snap = watching && h01(Math.floor(t * 2.5), s.seed + 9) < 0.06 ? 0.25 * Math.sign(goal) : 0;
    if (Math.abs(s.tilt) + Math.abs(snap) > 0.01) add(P.tilt, 0, 0, s.tilt + snap);
  }
  // ---- twitch idles
  if (P.twitch?.length) {
    if (s.tw && t > s.tw.t) s.tw = null;
    if (!s.tw && h01(Math.floor(t * 10), s.seed + 13) < (P.twitchRate ?? 0.2) / 10 * (hunting ? 0.5 : 1)) {
      const part = P.twitch[Math.floor(h01(Math.floor(t * 10), s.seed + 17) * P.twitch.length)];
      const a = 0.25 + h01(Math.floor(t * 10), s.seed + 19) * 0.35;
      const ax = Math.floor(h01(Math.floor(t * 10), s.seed + 23) * 3);
      s.tw = { part, t: t + 0.08 + h01(t, s.seed) * 0.1, r: [ax === 0 ? a : 0, ax === 1 ? a : 0, ax === 2 ? a * (h01(t, 2) < 0.5 ? 1 : -1) : 0] };
    }
    if (s.tw) add(s.tw.part, s.tw.r[0], s.tw.r[1], s.tw.r[2]);
  }
  // ---- a knee or elbow that bends the wrong way for a beat
  if (P.bend?.length) {
    if (s.bd && t > s.bd.t) s.bd = null;
    const moving = c.speed > 0.3 || hunting;
    if (!s.bd && moving && h01(Math.floor(t * 8), s.seed + 31) < (P.bendRate ?? 0.4) / 8 * (lightHere(c) < 0.3 ? 1.6 : 1)) {
      const part = P.bend[Math.floor(h01(Math.floor(t * 8), s.seed + 37) * P.bend.length)];
      s.bd = { part, t: t + 0.12 + h01(t, s.seed + 3) * 0.12, a: (h01(t, s.seed + 5) < 0.5 ? -1 : 1) * (1.0 + h01(t, s.seed + 7) * 0.5) };
    }
    if (s.bd) add(s.bd.part, s.bd.a, 0, 0);
  }
  // ---- too long, right when it strikes
  if (P.stretch) {
    const goal = c.attackPhase > 0 || c.mem?.tear || c.mem?.tearFx ? 1 : 0;
    s.stretchK += (goal - s.stretchK) * Math.min(1, dt * (goal ? 14 : 4));
    for (const n of P.stretch.parts) { const o = rig.parts[n]; if (o) o.scale.y = 1 + P.stretch.amount * s.stretchK; }
  }
  // ---- VHS dropout
  if (P.glitch && !c.mem?.gibbed) {
    if (s.glT > 0) { s.glT -= dt; rig.body.visible = rig.body.visible && h01(Math.floor(t * 30), s.seed) < 0.5; rig.root.position.x += (h01(Math.floor(t * 30), s.seed + 1) - 0.5) * 0.3; }
    else if (h01(Math.floor(t * 6), s.seed + 29) < P.glitch / 6) s.glT = 0.05 + h01(t, s.seed) * 0.12;
  }
  shine(rig, c, P, true);
  // ---- moments: the hunt begins, it strikes, you notice it moved
  if (p && p.zoneKey === c.zoneKey && !p.body.dead) moments(c, P, s, p);
}

function restoreStretch(rig: Rig, P: DreadProfile, s: DState) {
  if (!P.stretch || s.stretchK === 0) return;
  s.stretchK = 0;
  for (const n of P.stretch.parts) { const o = rig.parts[n]; if (o) o.scale.y = 1; }
}

// ---------------------------------------------------------------- eye-shine
const shineGeo = new Map<number, THREE.BufferGeometry>();
let shineMat: THREE.Material | null = null;
function shineGeoOf(col: number) {
  let g = shineGeo.get(col);
  if (!g) { const mb = new ModelBuilder(); mb.box(0, -0.5, 0, 1, 1, 1, 'white', { emissive: 1.6, color: col }); g = mb.build(); shineGeo.set(col, g); }
  return g;
}
function shine(rig: Rig, c: Creature, P: DreadProfile, alive: boolean) {
  if (!P.shine) return;
  let eyes = rig.root.userData.drShine as THREE.Mesh[] | undefined;
  if (!eyes) {
    eyes = rig.root.children.filter((o) => o.name === 'dread_shine') as THREE.Mesh[];
    if (eyes.length < 2) {
      if (!shineMat) shineMat = worldMaterial({ unlit: true, outline: 0 } as any);
      const g = shineGeoOf(P.shine.color ?? 0xfff0c0);
      eyes = [0, 1].map(() => { const m = new THREE.Mesh(g, shineMat!); m.name = 'dread_shine'; m.visible = false; m.castShadow = false; rig.root.add(m); return m; });
    }
    rig.root.userData.drShine = eyes;
    // the manager keeps the root visible (and these in the dark) for things that have eyes
    if (!rig.eyes) rig.eyes = eyes;
  }
  const p = G.local;
  const part = rig.parts[P.shine.part];
  let show = alive && !!p && !!part && p.zoneKey === c.zoneKey;
  let lit = 0.5;
  if (show) {
    const d = Math.hypot(p!.x - c.x, p!.z - c.z);
    show = d < 18 && lightHere(c) < 0.35 && !(c.state === 'disguised' || c.state === 'hide') && lineOfSight(G.zone, p!.x, p!.z, c.x, c.z);
    // brighter (bigger) when your light is on them: the tapetum throws it back
    lit = p!.flashlightOn && Math.abs(angd(p!.facing, Math.atan2(c.z - p!.z, c.x - p!.x))) < 0.6 ? 1 : 0.55;
  }
  if (!show) { for (const e of eyes) e.visible = false; return; }
  rig.root.updateMatrixWorld(true);
  const inv = _inv.copy(rig.root.matrixWorld).invert();
  const sz = (P.shine.size ?? 0.022) * lit;
  for (let k = 0; k < 2; k++) {
    const e = eyes[k];
    _v.set(P.shine.off[0] + (k ? 1 : -1) * P.shine.sep, P.shine.off[1], P.shine.off[2]).applyMatrix4(part!.matrixWorld).applyMatrix4(inv);
    e.position.copy(_v);
    e.scale.set(sz, sz * 0.7, sz);
    e.visible = true;
  }
}

// ---------------------------------------------------------------- moments
let lastSting = -99, lastMoved = -99, lastHit = -99;
function moments(c: Creature, P: DreadProfile, s: DState, p: Player) {
  const t = G.time;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  // the hunt for you begins
  const hunt = (c.state === 'chase' || c.state === 'attack') && d < 15 && c.visibleToLocal;
  if (hunt && !s.huntSeen) {
    s.huntSeen = true;
    if (t - lastSting > 18 && P.sting) {
      lastSting = t;
      G.audio?.flat?.(P.sting === 'chase' ? 'dread_chase' : P.sting === 'swell' ? 'dread_swell' : 'dread_hit', 'music', P.sting === 'swell' ? 0.5 : 0.6);
      const k = P.cam ?? 0.5;
      G.camera?.punch?.(0.05 * k + 0.02, 0.6);
      G.camera?.shake?.(0.25 * k, 0.5, 0.7);
    }
  } else if (!hunt && c.state !== 'chase' && c.state !== 'attack') s.huntSeen = false;
  // it strikes at you: the camera snaps in on the wind-up
  const atk = c.attackPhase > 0;
  if (atk && !s.atk && d < 3 && t - lastHit > 0.8) {
    lastHit = t;
    const k = P.cam ?? 0.5;
    G.camera?.punch?.(0.04 + 0.05 * k, 0.3);
    G.camera?.shake?.(0.12 + 0.2 * k, 0.25, 1.4);
  }
  s.atk = atk;
  // you look back and it is somewhere else
  if (P.moved) {
    if (c.visibleToLocal && lookedAt(c, 0.7, 14)) {
      if (s.seenAt >= 0 && t - s.seenAt > 1.5 && Math.hypot(c.x - s.seenX, c.z - s.seenZ) > 1.4 && t - lastMoved > 10) {
        lastMoved = t;
        G.audio?.flat?.('still_moved', 'sfx', 0.38);
        G.camera?.punch?.(0.035, 0.6);
        if (d < 4) G.audio?.flat?.('dread_hit', 'music', 0.35);
      }
      s.seenAt = t; s.seenX = c.x; s.seenZ = c.z;
    }
  }
}

// ---------------------------------------------------------------- the light stutters
/** local flicker state: until when, and the pattern seed */
const flicker = { until: 0, t0: 0, seed: 0, lights: new Map<any, number>() };
/** is this survivor's light out right now (host decides; the local survivor's own flicker counts too) */
export function lightOut(p: Player): boolean {
  if (!live()) return false;
  const u = (p as any).__flickUntil as number | undefined;
  if (!u || G.time > u) return false;
  return flickPattern(G.time, (p as any).__flickSeed ?? 0, (p as any).__flickT0 ?? 0) < 0.3;
}
function flickPattern(t: number, seed: number, t0: number) {
  // mostly dark, with stuttering returns: a brown-out
  const u = t - t0;
  const q = Math.floor(u * 22);
  return u < 0.08 ? 0.05 : h01(q, seed) < 0.62 ? 0.04 + h01(q, seed + 1) * 0.15 : 0.5 + h01(q, seed + 2) * 0.5;
}

/** host: a creature that hunts p makes p's light (and the tubes round them) stutter; replicated as a creature fx */
export function dreadHost(c: Creature, dt: number) {
  const P = dreadOf(c);
  if (!P?.flick || c.dead) return;
  const n = c.mem.net || (c.mem.net = {});
  const tgt = c.targetId ? G.players.get(c.targetId) : null;
  const hunting = HUNT.has(c.state) || (c.sp.flags?.leviathan && c.state !== 'idle');
  let p: Player | null = tgt && tgt.zoneKey === c.zoneKey ? tgt : null;
  if (!p && hunting) { let bd = P.flick; for (const q of G.players.values()) { if (q.zoneKey !== c.zoneKey || q.body.dead) continue; const d = Math.hypot(q.x - c.x, q.z - c.z); if (d < bd) { bd = d; p = q; } } }
  if (!p || !hunting) return;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  if (d > P.flick || d < 1.5) return;
  c.mem.flickCd = (c.mem.flickCd ?? 3 + Math.random() * 4) - dt;
  if (c.mem.flickCd > 0) return;
  c.mem.flickCd = 7 + Math.random() * 9;
  const dur = 0.5 + Math.random() * 0.9;
  n.flk = [((n.flk?.[0] ?? 0) + 1) % 1000, p.id, Math.round(dur * 1000), Math.floor(Math.random() * 999)];
  startFlicker(p, dur, n.flk[3]);
}
/** every peer: a new flicker fx from this creature (called from the visual pass) */
export function dreadFlickPoll(c: Creature) {
  const n = c.mem.netMem || c.mem.net;
  const f = n?.flk as [number, string, number, number] | undefined;
  if (!f) return;
  const ud = c.rig?.root.userData; if (!ud) return;
  if (ud.flkSeen === undefined) { ud.flkSeen = f[0]; return; }
  if (ud.flkSeen === f[0]) return;
  ud.flkSeen = f[0];
  if (G.role === 'client') { const p = G.players.get(f[1]); if (p) startFlicker(p, f[2] / 1000, f[3]); }
  const P = dreadOf(c);
  if (G.local?.id === f[1] && P?.flickSound) G.audio?.play?.(P.flickSound, c.x, c.z, { zone: c.zoneKey, vol: 0.5 });
}
function startFlicker(p: Player, dur: number, seed: number) {
  const q = p as any;
  q.__flickUntil = G.time + dur; q.__flickT0 = G.time; q.__flickSeed = seed;
  if (p === G.local) {
    flicker.until = G.time + dur; flicker.t0 = G.time; flicker.seed = seed;
    G.audio?.flat?.('flicker_buzz', 'sfx', 0.45);
    // the tubes round you go with it
    const z = G.zone;
    for (const l of z.lights as any[]) {
      if (Math.hypot(l.x - p.x, l.z - p.z) > 9 || l.kind === 'sky' || l.kind === 'fire') continue;
      if (!flicker.lights.has(l)) flicker.lights.set(l, l.flicker);
      l.flicker = 0.9;
    }
  }
}

/** host: things that only cross the room while your light is out */
export function dreadFlickStep(c: Creature, dt: number, moveTo: (gx: number, gz: number, speed: number) => void): boolean {
  const P = dreadOf(c);
  if (!P?.flickStep || c.dead || c.attackPhase > 0) return false;
  const p = c.targetId ? G.players.get(c.targetId) : null;
  if (!p || p.zoneKey !== c.zoneKey || !lightOut(p)) return false;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  if (d < 1.4 || d > 14) return false;
  moveTo(p.x, p.z, P.flickStep / 0.35);
  void dt;
  return true;
}

// ---------------------------------------------------------------- per frame (all peers)
let hooked = false;
export function dreadFrame(_dt: number) {
  if (!live() || !G.local) return;
  if (!hooked) hookRender();
  // restore the tubes after the stutter
  if (flicker.lights.size && G.time > flicker.until) {
    for (const [l, f] of flicker.lights) l.flicker = f;
    flicker.lights.clear();
  }
}
/** the local flashlight follows the stutter: applied just before the scene renders (after the game set it) */
function hookRender() {
  hooked = true;
  const scene = G.pr.scene as THREE.Scene;
  const prev = scene.onBeforeRender;
  let lastT = -1;
  scene.onBeforeRender = function (this: THREE.Scene, ...a: any[]) {
    (prev as any).apply(this, a);
    if (!live() || G.time === lastT) return;
    lastT = G.time;
    const p = G.local;
    if (!p) return;
    for (const pl of G.players.values()) {
      const u = (pl as any).__flickUntil as number | undefined;
      if (!u || G.time > u || pl.zoneKey !== p.zoneKey) continue;
      const k = flickPattern(G.time, (pl as any).__flickSeed ?? 0, (pl as any).__flickT0 ?? 0);
      // the game lists flashlights local first, then other survivors in iteration order
      const list = [...G.players.values()].filter((q) => q.zoneKey === p.zoneKey && q.flashlightOn && q.lightItem && !q.body.dead);
      list.sort((x, y) => (x === p ? -1 : y === p ? 1 : 0));
      const i = list.indexOf(pl);
      const f = (G as any).flashlights?.[i] as THREE.SpotLight | undefined;
      if (f) f.intensity *= k;
    }
  } as any;
}

bus.on('enterZone', () => { flicker.lights.clear(); flicker.until = 0; });

// Shared helpers for creature pack B (lumenmoth, wrongbird, echo, sentinel,
// occupant, lifeguard, lamplighter, plushkin). Engine-agnostic glue: network
// memory, light/visibility queries that also work for zones the host is not
// looking at, hidden-spot search, gift drops and small rig utilities.
import * as THREE from 'three';
import { G } from '../game/G';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { lineOfSight } from '../world/collision';
import { angleDiff, clamp } from '../core/math';
import { Rng } from '../core/rng';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { createItem, serializeItem } from '../items/factory';
import { itemDef } from '../items/item';
import type { Zone, LightSource } from '../world/zone';
import type { Player } from '../entities/player';
import type { Creature } from './creature';
import type { Rig, SpeciesDef } from './species';

export const rng = new Rng(Math.random() * 1e9);

/** SpeciesDef sounds plus the continuous `loop` key the audio engine understands */
export type SoundsB = NonNullable<SpeciesDef['sounds']> & { loop?: string };
export const snd = (s: SoundsB) => s as SpeciesDef['sounds'];

/** true when G is a running game (false in galleries / before boot) */
export const live = () => !!G && !!(G as any).players;

// ---------------------------------------------------------------- network memory
/**
 * Host-side writable replicated memory. Clients receive it as `c.mem.netMem`;
 * the host keeps `mem.net` and `mem.netMem` pointing at the same object so
 * either snapshot convention works.
 */
export function net(c: Creature): Record<string, any> {
  let n = c.mem.net;
  if (!n || typeof n !== 'object') { n = {}; c.mem.net = n; }
  c.mem.netMem = n;
  return n;
}
/** read replicated memory on any peer */
export function netOf(c: Creature): Record<string, any> { return c.mem.netMem || c.mem.net || {}; }

/** host: fire a one-shot effect that every peer's animate() picks up (sound key + optional params) */
export function fx(c: Creature, key: string, extra: Record<string, any> = {}) {
  const n = net(c);
  n.fx = ((n.fx | 0) + 1) % 1000;
  n.fk = key;
  n.fa = Object.keys(extra).length ? extra : undefined;
}
/** animate(): returns newly fired fx keys (each peer sees each seq once; the first sighting only primes) */
export function fxPoll(rig: Rig, c: Creature): { key: string; a: any } | null {
  const n = netOf(c);
  const ud = rig.root.userData;
  if (n.fx === undefined) return null;
  if (ud.fxSeen === undefined) { ud.fxSeen = n.fx; return null; }
  if (ud.fxSeen === n.fx) return null;
  ud.fxSeen = n.fx;
  return { key: n.fk, a: n.fa || {} };
}
/** play a positional sound locally with an explicit range (bypasses the per-key default) */
export function playAt(key: string, c: { x: number; z: number; zoneKey: string }, vol = 1, range?: number, rate?: number) {
  if (!live()) return;
  G.audio?.play?.(key, c.x, c.z, { zone: c.zoneKey, vol, range, rate });
}

// ---------------------------------------------------------------- players & perception
export function playersIn(zk: string): Player[] {
  if (!live()) return [];
  const out: Player[] = [];
  for (const p of G.players.values()) if (p.zoneKey === zk && !p.body.dead) out.push(p);
  return out;
}
export function nearestPlayer(c: { x: number; z: number; zoneKey: string }, maxD = Infinity, pred?: (p: Player, d: number) => boolean): { p: Player; d: number } | null {
  let best: Player | null = null, bd = maxD;
  for (const p of playersIn(c.zoneKey)) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < bd && (!pred || pred(p, d))) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** is a zone light currently shining */
export function lightOn(z: Zone, l: LightSource) {
  if (!l.on || l.broken) return false;
  return z.circuitPowered(l.circuit) || !!z.extPower?.(l.x, l.z);
}

/**
 * Light level (≈ G.lightLevelAt) that also works for zones the local view is
 * not showing (host simulating a friend's zone): static lights are summed
 * from the zone light list, plus sky/ambient and flashlight cones.
 */
export function lightAt(z: Zone, x: number, zz: number): number {
  if (!live()) return 0.5;
  if (G.view?.zone === z) return G.lightLevelAt(x, zz);
  let l = (z.env?.ambientI ?? 0.3) * 0.25 + (z.env?.sky ? 0.5 : 0);
  for (const s of z.lights) {
    const d = Math.hypot(s.x - x, s.z - zz);
    if (d > s.radius || !lightOn(z, s)) continue;
    l += s.intensity * (1 - d / s.radius) * 0.8;
    if (l > 2) break;
  }
  for (const p of playersIn(z.key)) {
    if (!p.flashlightOn) continue;
    const dx = x - p.x, dz = zz - p.z, d = Math.hypot(dx, dz);
    if (d > 16) continue;
    if (Math.abs(angleDiff(p.facing, Math.atan2(dz, dx))) < 0.55 || d < 1.2) l += 1.2 * (1 - d / 16);
  }
  return l;
}

/** a player whose flashlight beam is on point (x,z) within range, with line of sight */
export function beamOn(z: Zone, x: number, zz: number, range = 14): Player | null {
  for (const p of playersIn(z.key)) {
    if (!p.flashlightOn || !p.lightItem) continue;
    const dx = x - p.x, dz = zz - p.z, d = Math.hypot(dx, dz);
    if (d > range) continue;
    const cone = (itemDef(p.lightItem.key)?.light?.cone ?? 0.5) + 0.08;
    if (Math.abs(angleDiff(p.facing, Math.atan2(dz, dx))) > cone && d > 1.2) continue;
    if (!lineOfSight(z, p.x, p.z, x, zz)) continue;
    return p;
  }
  return null;
}

/** does player p currently have (x,z) inside their view (cone + LOS), ignoring light */
export function sees(p: Player, z: Zone, x: number, zz: number, range = 34): boolean {
  const dx = x - p.x, dz = zz - p.z, d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (p.sleeping || p.body.downed) return false;
  if (p.isLocal && G.view?.zone === z) {
    if (d < 2) return true;
    return G.view.vis.isVisible(Math.floor(x), Math.floor(zz));
  }
  if (d > 2.4 && Math.abs(angleDiff(p.facing, Math.atan2(dz, dx))) > 1.45) return false;
  return lineOfSight(z, p.x, p.z, x, zz);
}
/** any player in the zone sees the point (geometric view only) */
export function seenByAny(z: Zone, x: number, zz: number, range = 34): Player | null {
  for (const p of playersIn(z.key)) if (sees(p, z, x, zz, range)) return p;
  return null;
}

/** walkable tile for ground creatures (floor, not solid, not deep water) */
export function walkable(z: Zone, x: number, y: number, allowDeep = false) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i] === 1 || z.solid[i] === 3) return false;
  if (!allowDeep && z.floorAt(x, y)?.water === 'deep') return false;
  return true;
}
export const isDeep = (z: Zone, x: number, y: number) => z.floorAt(Math.floor(x), Math.floor(y))?.water === 'deep';

/**
 * Random tile in the annulus [rMin, rMax] around (cx,cz) that no player can
 * currently see. `pred` filters further (e.g. needs LOS to a player).
 */
export function hiddenSpot(z: Zone, cx: number, cz: number, rMin: number, rMax: number, pred?: (x: number, z: number) => boolean, tries = 40, seeRange = 34): { x: number; z: number } | null {
  for (let t = 0; t < tries; t++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(rMin, rMax);
    const x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cz + Math.sin(a) * r);
    if (!walkable(z, x, y)) continue;
    const px = x + 0.5, pz = y + 0.5;
    if (seenByAny(z, px, pz, seeRange)) continue;
    if (pred && !pred(px, pz)) continue;
    return { x: px, z: pz };
  }
  return null;
}

/**
 * Tiles reachable on foot from (x,z) (BFS through doorless edges, creature
 * rules), up to maxN tiles. Every result is a place the creature can actually
 * walk to, unlike random sampling in a maze.
 */
export function reachTiles(z: Zone, x: number, zz: number, maxN = 1400, allowDeep = false): [number, number, number][] {
  const sx = Math.floor(x), sy = Math.floor(zz);
  const out: [number, number, number][] = [];
  if (!z.inb(sx, sy)) return out;
  const seen = new Set<number>([z.idx(sx, sy)]);
  const q: [number, number, number][] = [[sx, sy, 0]];
  for (let h = 0; h < q.length && out.length < maxN; h++) {
    const [cx, cy, d] = q[h];
    out.push(q[h]);
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy;
      if (!z.inb(nx, ny)) continue;
      const j = z.idx(nx, ny);
      if (seen.has(j)) continue;
      if (!z.canStep(cx, cy, dx, dy, true)) continue;
      if (!allowDeep && z.floorAt(nx, ny)?.water === 'deep') continue;
      seen.add(j);
      q.push([nx, ny, d + 1]);
    }
  }
  return out;
}
const DIR4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** best reachable tile by score (null = rejected); a little randomness keeps it unpredictable */
export function pickReach(z: Zone, x: number, zz: number, score: (tx: number, tz: number, steps: number) => number | null, maxN = 1400): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null, bs = -Infinity;
  for (const [tx, ty, st] of reachTiles(z, x, zz, maxN)) {
    const s0 = score(tx + 0.5, ty + 0.5, st);
    if (s0 === null) continue;
    const sc = s0 + rng.next() * 2;
    if (sc > bs) { bs = sc; best = { x: tx + 0.5, z: ty + 0.5 }; }
  }
  return best;
}

/** creatures that make gentle things hide */
export function isThreat(o: Creature) {
  const T = o.sp.temperament;
  return !o.dead && !o.tamedBy && (T === 'hostile' || T === 'stalker' || T === 'ambush' || !!o.sp.flags?.leviathan);
}
export function threatNear(c: Creature, r: number): Creature | null {
  if (!live() || !G.creatures) return null;
  let best: Creature | null = null, bd = r;
  for (const o of G.creatures.creatures.values() as Iterable<Creature>) {
    if (o === c || o.zoneKey !== c.zoneKey || !isThreat(o)) continue;
    const d = dist(o, c);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** is the light this player is holding an open flame (torch, candle, flare) */
export function heldFlame(p: Player): boolean {
  if (!p.flashlightOn || !p.lightItem) return false;
  const d = itemDef(p.lightItem.key);
  return !!d?.light?.candle || (d?.tags || []).includes('firestarter') || /flare|torch|candle/.test(p.lightItem.key);
}

/** how afraid of the dark a player seems (0..1). Exact for the local player, a darkness guess for others. */
export function fearOf(p: Player, z: Zone): number {
  const dark = 1 - clamp(lightAt(z, p.x, p.z) / 0.55, 0, 1);
  if (p.isLocal) {
    const nyc = p.body.has?.('nyctophobic') ? 0.35 : 0;
    return clamp(Math.max(p.body.panic / 70, dark * (p.flashlightOn ? 0.3 : 0.65) + nyc), 0, 1);
  }
  return dark * (p.flashlightOn ? 0.35 : 0.7);
}

/** host: drop an item on the floor next to a creature (networked, logged) */
export function dropGift(c: Creature, key: string, opts: { data?: Record<string, any>; name?: string } = {}) {
  if (!live()) return;
  const it = createItem(key, rng);
  if (opts.data) it.data = { ...(it.data || {}), ...opts.data };
  if (opts.name) it.name = opts.name;
  const a = rng.float(0, Math.PI * 2);
  op('dropFloor', { z: c.zoneKey, item: serializeItem(it), x: c.x + Math.cos(a) * 0.35, zz: c.z + Math.sin(a) * 0.35 });
}

/** keep the creature's simulated velocity at zero (for teleporting / scripted movers) */
export function hold(c: Creature) { c.speed = 0; c.vx = 0; c.vz = 0; }
export function face(c: Creature, x: number, z: number, instant = false) {
  c.targetFacing = Math.atan2(z - c.z, x - c.x);
  if (instant) c.facing = c.targetFacing;
}

/** cheap stable hash 0..1 of a creature id (per-individual looks) */
export function hashId(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10007) / 10007;
}

// ---------------------------------------------------------------- local-player effects (run from animate on every peer)
/** the local player when it is in the creature's zone */
export function localIn(c: Creature): Player | null {
  if (!live()) return null;
  const p = G.local;
  return p && p.zoneKey === c.zoneKey && !p.body.dead ? p : null;
}
const thoughtT = new Map<string, number>();
/** a rate-limited thought bubble for the local player */
export function thinkOnce(p: Player, key: string, text: string, every = 60) {
  const t = G.time;
  if ((thoughtT.get(key) ?? -1e9) + every > t) return;
  thoughtT.set(key, t);
  bus.emit('think', p, text);
}

// ---------------------------------------------------------------- rig helpers
const MATS = new Map<string, THREE.Material>();
/** material variants beyond the shared creature materials (translucent shadows, additive dust) */
export function matB(kind: 'shadow' | 'glass' | 'dust' | 'glow' | 'card' | 'cardGlow'): THREE.Material {
  let m = MATS.get(kind);
  if (m) return m;
  if (kind === 'shadow') m = worldMaterial({ transparent: true, opacity: 0.55, depthWrite: false, outline: 0, unlit: true, noGrid: true });
  else if (kind === 'glass') m = worldMaterial({ transparent: true, opacity: 0.45, depthWrite: false, outline: 0 });
  else if (kind === 'dust') m = worldMaterial({ additive: true, depthWrite: false, outline: 0, unlit: true, noGrid: true });
  // alpha-tested double-sided cards: shaped wings, ears, frayed cloth
  else if (kind === 'card') m = worldMaterial({ alphaTest: 0.5, doubleSide: true, outline: 1 });
  else if (kind === 'cardGlow') m = worldMaterial({ alphaTest: 0.5, doubleSide: true, outline: 1, unlit: true, noGrid: true });
  else m = worldMaterial({ unlit: true, outline: 1, noGrid: true });
  MATS.set(kind, m);
  return m;
}
/** like species.part() but with a chosen material */
export function partB(rig: Rig, name: string, parent: THREE.Object3D, at: [number, number, number], fn: (mb: ModelBuilder) => void, mat: THREE.Material, shadow = false): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(at[0], at[1], at[2]);
  const mb = new ModelBuilder();
  fn(mb);
  if (!mb.isEmpty) {
    const mesh = new THREE.Mesh(mb.build(), mat);
    mesh.castShadow = shadow; mesh.receiveShadow = false;
    g.add(mesh);
  }
  parent.add(g);
  rig.parts[name] = g;
  return g;
}

/** minimal stand-in creature for gallery animation */
export function fakeCreature(sp: any, over: Partial<Creature> & Record<string, any> = {}): Creature {
  return {
    sp, zoneKey: '', x: 0, z: 0, y: 0, facing: 0, targetFacing: 0, vx: 0, vz: 0, speed: 0,
    hp: sp.hp, state: 'idle', id: 'gallery', stateT: 0, mem: {}, dead: false, deathT: 0, attackPhase: 0, observed: false, hitFlash: 0,
    tamedBy: null, phase: 0, animT: 0, visibleToLocal: true, radius: sp.radius, height: sp.height, ...over,
  } as unknown as Creature;
}

/** shortest signed angle helper re-export */
export { angleDiff, clamp };
export const lineOfSightB = lineOfSight;

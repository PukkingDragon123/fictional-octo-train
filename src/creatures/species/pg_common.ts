// Shared bits for the Nostalgic Playground's five inhabitants (pg_dooley,
// pg_doodlewump, pg_lefty, pg_petula, pg_counto; the zone is
// src/world/gen/z_playground.ts): the shows' lines on the subtitle strip
// (host says, every peer shows), "is the unit watching it", a biped costume
// gait, and painters for plush, felt, stitches, cardboard, foil and blood.
// No species is defined here.
import { bus } from '../../core/events';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Rig } from '../species';
import { zoneOf } from '../behaviors_a';
import { net, netOf, playersIn, dist, sees, angleDiff } from '../behaviors_b';
import { Region, hash, type BoneSpec, type V3 } from '../kit/humanoids';

export const SIDES = [['L', 1], ['R', -1]] as const;

/** a skeleton written in absolute (model-space) joint positions, parents first */
export function absBones(A: [string, string, V3, boolean?][]): BoneSpec[] {
  const abs = new Map<string, V3>();
  return A.map(([name, parent, p, cap]) => {
    abs.set(name, p);
    const q = parent ? abs.get(parent)! : [0, 0, 0];
    return { name, parent, at: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cap };
  });
}

// ------------------------------------------------------------------ the show's lines
/** host: a spoken line (replicated; every peer near enough shows it on the subtitle strip) */
export function say(c: Creature, text: string, dur?: number) {
  const n = net(c);
  c.mem.lnN = (c.mem.lnN ?? 0) + 1;
  n.ln = dur ? [c.mem.lnN, text, dur] : [c.mem.lnN, text];
}
/** animate(): show the latest line once, on the strip, if the local unit is within earshot */
export function linePoll(rig: Rig, c: Creature, who: string, range = 24) {
  const ln = netOf(c).ln as [number, string, number?] | undefined;
  const ud = rig.root.userData;
  if (!ln || ln[0] === ud.pgLn) return;
  ud.pgLn = ln[0];
  const p = G.local;
  if (!p || p.zoneKey !== c.zoneKey || Math.hypot(p.x - c.x, p.z - c.z) > range || c.dead) return;
  bus.emit('subtitle', { who, text: ln[1], style: 'creature', dur: ln[2] ?? Math.min(6.5, 2.2 + ln[1].length * 0.05), x: c.x, y: c.y + c.height + 0.25, z: c.z });
}

// ------------------------------------------------------------------ attention
/** is this unit looking at the creature: it is in their view and within `cone` of where they face */
export function watching(p: Player, c: Creature, cone = 0.62, range = 30): boolean {
  if (p.body.dead || p.sleeping) return false;
  const z = zoneOf(c);
  const d = dist(p, c);
  if (d > range) return false;
  if (d > 1.4 && Math.abs(angleDiff(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) > cone) return false;
  return sees(p, z, c.x, c.z, range);
}
/** the nearest living unit in the zone (and how far) */
export function nearestUnit(c: Creature, maxD = 99): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { if (p.body.dead) continue; const d = dist(p, c); if (d < maxD && (!best || d < best.d)) best = { p, d }; }
  return best;
}
/** a unit that can see the creature at all (any direction it faces within its view) */
export function seenBy(c: Creature, range = 30): Player | null {
  const z = zoneOf(c);
  for (const p of playersIn(c.zoneKey)) if (!p.body.dead && sees(p, z, c.x, c.z, range)) return p;
  return null;
}

// ------------------------------------------------------------------ a costume's gait
export interface Gait { ph: number; mv: number; stride: number; knee: number; arm: number; bounce: number; waddle: number; heavy?: number }
/**
 * Walk cycle for a costumed biped (bones thigh/shin/foot/uarm/farm L+R, hips):
 * returns the hip bob (metres) and the side sway (radians) for the caller to apply.
 */
export function gait(P: Record<string, any>, g: Gait): { bob: number; sway: number } {
  for (const [s, k] of SIDES) {
    const q = g.ph + (k > 0 ? 0 : Math.PI);
    const sw = Math.sin(q), lift = Math.max(0, Math.cos(q));
    const th = P['thigh' + s], sh = P['shin' + s], ft = P['foot' + s];
    if (th) th.rotation.set(-sw * g.stride * g.mv, 0, k * g.waddle * 0.25 * g.mv);
    if (sh) sh.rotation.set(lift * g.knee * g.mv, 0, 0);
    if (ft) ft.rotation.set((sw * g.stride - lift * g.knee) * 0.7 * g.mv, 0, 0);
    const ua = P['uarm' + s], fa = P['farm' + s];
    if (ua) ua.rotation.set(sw * g.arm * g.mv, 0, k * (0.18 + g.waddle * 0.12 * g.mv));
    if (fa) fa.rotation.set(-(0.25 + Math.max(0, -sw) * 0.35) * g.mv, 0, 0);
  }
  const bob = Math.abs(Math.cos(g.ph)) * g.bounce * g.mv - g.bounce * 0.5 * g.mv;
  const sway = Math.sin(g.ph) * g.waddle * g.mv;
  return { bob, sway };
}

// ------------------------------------------------------------------ painters
/** plush / faux fur: a lit tube ramp, a short pile of strands, pilling and matted patches */
export function paintPlush(r: Region, R: number[], o: { seed?: number; base?: number; pile?: number; matted?: number; side?: number } = {}) {
  const seed = o.seed ?? 3, base = o.base ?? R.length * 0.55, pile = o.pile ?? 0.6;
  r.fill(R, (x, y) => {
    const th = (r.deg(x) * Math.PI) / 180;
    const strand = (hash(x, Math.floor(y / 2) + seed) - 0.5) * pile + (hash(x * 3 + 1, y + seed * 7) - 0.5) * pile * 0.5;
    return base + 1.1 * Math.cos(th) - 0.35 + (r.fbm(x, y, 4, 2, seed) - 0.5) * 1.3 + strand - (o.side ? 0.4 * Math.max(0, -Math.sin(th) * o.side) : 0);
  }, undefined, 0.55);
  // pills: little bright knots; matted patches: darker smears where it got wet
  for (let i = 0; i < r.w * r.h * 0.004; i++) r.blend(hash(i, seed + 11) * r.w, hash(i, seed + 12) * r.h, R[R.length - 1], 0.5);
  for (let i = 0; i < (o.matted ?? 3); i++) r.glow(hash(i, seed + 21) * r.w, hash(i, seed + 22) * r.h, 3 + hash(i, 23) * 5, 2 + hash(i, 24) * 4, R[1], 0.55);
}
/** felt: flat, fine, a little fuzzy at the edges of the light */
export function paintFelt(r: Region, R: number[], seed = 5, base = R.length * 0.5) {
  r.fill(R, (x, y) => base + (r.fbm(x, y, 5, 2, seed) - 0.5) * 0.9 + (hash(x, y + seed) - 0.5) * 0.4 + 0.4 * Math.cos((r.deg(x) * Math.PI) / 180), undefined, 0.5);
}
/** a stitched seam between two points: a dark furrow with thread dashes across it */
export function stitches(r: Region, x0: number, y0: number, x1: number, y1: number, furrow: number, thread: number, every = 3, w = 1) {
  const L = Math.max(1, Math.hypot(x1 - x0, y1 - y0)), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  for (let i = 0; i <= L; i++) {
    const x = x0 + ux * i, y = y0 + uy * i;
    r.blend(x, y, furrow, 0.75);
    if (i % every === 0) for (let k = -w; k <= w; k++) r.blend(x - uy * k, y + ux * k, thread, 0.9);
  }
}
/** blood (or anything wet) running down a region from (x, y): rows grow downward */
export function runs(r: Region, x: number, y: number, n: number, len: number, R: number[], seed = 1, width = 1) {
  for (let i = 0; i < n; i++) {
    let px = x + (hash(i, seed) - 0.5) * width * 4, py = y;
    const l = len * (0.4 + hash(i, seed + 3) * 0.8);
    for (let s = 0; s < l; s++) {
      const t = s / l;
      const c = R[Math.max(0, Math.min(R.length - 1, Math.round((1 - t) * (R.length - 2))))];
      for (let k = 0; k < width; k++) r.blend(px + k, py, c, 0.9 - t * 0.3);
      py += 1; if (hash(s, seed + i * 7) < 0.15) px += hash(s, seed + i) < 0.5 ? -1 : 1;
    }
    r.blend(px, py, R[0], 0.9); r.blend(px + 1, py, R[0], 0.5); r.blend(px, py + 1, R[0], 0.7);
  }
}
/** a soaked stain: an irregular blot, darker at the heart, with a dried rim */
export function soak(r: Region, cx: number, cy: number, rx: number, ry: number, R: number[], seed = 1) {
  for (let y = Math.floor(cy - ry * 1.3); y <= cy + ry * 1.3; y++) for (let x = Math.floor(cx - rx * 1.3); x <= cx + rx * 1.3; x++) {
    const a = Math.atan2(y - cy, x - cx), e = 0.75 + 0.45 * hash(Math.floor((a + 4) * 3), seed) + (r.fbm(x, y, 3, 2, seed) - 0.5) * 0.4;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry) / e;
    if (d > 1) continue;
    if (d > 0.86) r.blend(x, y, R[0], 0.55);
    else r.blend(x, y, R[Math.min(R.length - 1, 1 + Math.floor((1 - d) * (R.length - 2)))], 0.5 + (1 - d) * 0.4);
  }
}
/** corrugated cardboard: flat kraft with flute lines, scuffs, marker */
export function paintCardboard(r: Region, R: number[], seed = 7, flutes = true) {
  r.fill(R, (x, y) => R.length * 0.55 + (r.fbm(x, y, 4, 2, seed) - 0.5) * 1.1 + (flutes && (y % 3 === 0) ? -0.35 : 0) + 0.35 * Math.cos((r.deg(x) * Math.PI) / 180), undefined, 0.45);
  for (let i = 0; i < 6; i++) r.crack(hash(i, seed) * r.w, hash(i, seed + 1) * r.h, 6 + Math.floor(hash(i, 2) * 8), hash(i, 3) * 360, R[1], seed + i, 0.5, 0);
}
/** cooking foil over a surface: hard crinkle facets with bright glints */
export function paintFoil(r: Region, R: number[], seed = 9, base = R.length * 0.5) {
  r.fill(R, (x, y) => {
    const v = Math.sin(x * 0.9 + hash(Math.floor(x / 3), Math.floor(y / 3) + seed) * 6) * 0.5 + Math.sin(y * 1.3 - x * 0.4 + hash(Math.floor(y / 4), seed) * 5) * 0.5;
    return base + v * 1.6 + 0.6 * Math.cos((r.deg(x) * Math.PI) / 180);
  }, undefined, 0.3);
  for (let i = 0; i < r.w * r.h * 0.01; i++) r.set(hash(i, seed + 5) * r.w, hash(i, seed + 6) * r.h, 0xffffff);
}

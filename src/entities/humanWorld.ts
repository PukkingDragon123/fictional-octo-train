import { G } from '../game/G';
import { resolve } from '../world/collision';
import type { RagWorld } from './humanRagdoll';
import type { Player } from './player';

/**
 * What a survivor's animation needs to know about the world: the floor
 * height under each foot (steps, ledges, stairs), walls and furniture for a
 * falling ragdoll, and something worth looking at (a creature, the handler,
 * a friend who is talking, the aim point; nervous glances otherwise). All
 * reads are defensive: zones and systems may not exist yet (menus, intro).
 */

/** floor height (world y) at a world point in a zone */
export function floorY(zoneKey: string, x: number, z: number): number {
  const zn = G?.zones?.get?.(zoneKey);
  if (!zn) return NaN;
  const tx = Math.floor(x), ty = Math.floor(z);
  if (!zn.inb(tx, ty) || !zn.floor[zn.idx(tx, ty)]) return NaN;
  return zn.heightAt(tx, ty);
}

/** the per-player ground function the gait queries */
export function groundFn(p: Player): (x: number, z: number) => number {
  return (x, z) => { const y = floorY(p.zoneKey, x, z); return Number.isNaN(y) ? p.y : y; };
}

const ragOpts = { ignoreLow: true };
/** floor + walls for a survivor's ragdoll */
export function ragWorldFor(p: Player): RagWorld {
  return {
    ground: (x, z) => { const y = floorY(p.zoneKey, x, z); return Number.isNaN(y) ? p.y : y; },
    collide: (m) => { const zn = G?.zones?.get?.(p.zoneKey); if (zn) resolve(zn, m, ragOpts); },
  };
}

export interface LookTarget { x: number; y: number; z: number; w: number; until: number; kind: string; id: string }

/**
 * Pick something for a survivor to look at (called a few times a second).
 * Writes into `out` and returns it, or null for nothing (idle glances).
 */
export function pickLook(p: Player, out: LookTarget, now: number): LookTarget | null {
  const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
  let best = -1, bx = 0, by = 0, bz = 0, kind = '', id = '';
  const consider = (x: number, y: number, z: number, score: number, k: string, i: string) => {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 0.01;
    const front = (dx * fx + dz * fz) / d; // 1 straight ahead .. -1 behind
    if (front < -0.35) return;               // would need to turn round
    // hysteresis: keep looking at what we already watch
    const s = score * (0.55 + 0.45 * front) * (i === out.id ? 1.35 : 1);
    if (s > best) { best = s; bx = x; by = y; bz = z; kind = k; id = i; }
  };
  try {
    // creatures in view (the bigger the threat and the closer, the more they hold the eye)
    const cs = G?.creatures?.creatures;
    if (cs) for (const c of cs.values() as Iterable<any>) {
      if (c.dead || c.zoneKey !== p.zoneKey) continue;
      if (c.state === 'disguised' || c.state === 'hide' || c.state === 'travel') continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 11) continue;
      const th = (c.sp?.threat ?? 2) + (c.state === 'chase' || c.state === 'attack' ? 3 : 0);
      consider(c.x, (c.y || 0) + (c.sp?.height ?? (c.radius ? c.radius * 2.2 : 1.4)) * 0.8, c.z, (2 + th) / (1 + d * 0.35), 'creature', 'c' + c.id);
    }
    // the handler hologram
    const h = G?.handler;
    if (h?.visible && typeof h.x === 'number') {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < 9) consider(h.x, (h.y ?? p.y) + 1.65, h.z, 3.2 / (1 + d * 0.3), 'handler', 'handler');
    }
    // other survivors, especially the one talking
    for (const o of G?.players?.values?.() ?? []) {
      if (o === p || o.zoneKey !== p.zoneKey || o.body.dead) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d > 6) continue;
      const talking = o.say && o.say.until > (G?.time ?? 0) ? 3 : 0;
      consider(o.x, o.y + 1.55, o.z, (1.2 + talking) / (1 + d * 0.5), 'player', 'p' + o.id);
    }
  } catch { /* systems not ready */ }
  if (best < 0.25) return null;
  out.x = bx; out.y = by; out.z = bz; out.kind = kind; out.id = id;
  out.w = Math.min(1, best * 0.9 + 0.35);
  out.until = now + 0.35;
  return out;
}

/**
 * Animation detail for a survivor: 0 full (foot / hand IK, look-at, secondary
 * motion), 1 cheaper (no IK) for distant survivors, 2 minimal off screen.
 * The local survivor is always full detail.
 */
export function lodFor(p: Player): number {
  if (p.inVehicle) return 2;
  if (p.isLocal) return 0;
  if (!p.rig.root.visible) return 2;
  const me = G?.local;
  if (!me) return 0;
  const q = G?.pr?.quality ?? 'high';
  const far = q === 'low' ? 8 : q === 'medium' ? 14 : 20;
  return Math.hypot(me.x - p.x, me.z - p.z) > far ? 1 : 0;
}

/** game time in seconds (0 outside a running game) */
export const gameTime = () => (G?.time ?? 0);

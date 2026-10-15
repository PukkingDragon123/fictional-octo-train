// Feeding. Something hungry that finds a survivor's body does not leave it:
// the host walks idle hostile creatures over to a fresh corpse (or one that
// has just stopped moving) and keeps them at it for a while, a lunge every
// second or so. Each bite goes out as a gore event ('M') so every peer sees
// the same thing: gouts from the torso and throat, meat torn loose, later
// the body opened and organs dragged out, the pool under it widening. The
// creature's brain is only nudged through its public fields (state, goal,
// facing, attack pose); anything that is chasing a living target ignores
// the dead.
import { G } from '../game/G';
import type { Creature } from '../creatures/creature';
import type { Player } from '../entities/player';

const HUNGRY = new Set(['hostile', 'stalker', 'ambush', 'territorial']);

export class Mauling {
  private t = 0;

  update(dt: number) {
    if (G.role === 'client' || (G.sandbox.gore ?? 2) <= 0) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.3;
    const cs = G.creatures?.creatures as Map<string, Creature> | undefined;
    if (!cs) return;
    for (const c of cs.values()) {
      if (c.dead || !c.sp.attack || !HUNGRY.has(c.sp.temperament) || c.mem.tear || c.tamedBy) continue;
      const f = c.mem.feed as { pid: string; until: number; next: number; n: number } | undefined;
      // busy with somebody still alive and standing
      const tgt = c.targetId ? G.players.get(c.targetId) : null;
      if (tgt && !tgt.body.dead && !tgt.body.downed && c.state === 'chase') { if (f) delete c.mem.feed; continue; }
      let victim: Player | null = null, vd = 10;
      for (const p of G.players.values()) {
        if (p.zoneKey !== c.zoneKey || !p.body.dead) continue;
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d < vd) { vd = d; victim = p; }
      }
      if (!victim) { if (f) delete c.mem.feed; continue; }
      if (f && f.pid !== victim.id) delete c.mem.feed;
      const feed = (c.mem.feed ??= { pid: victim.id, until: G.time + 30 + Math.random() * 30, next: 0, n: 0 }) as { pid: string; until: number; next: number; n: number };
      if (G.time > feed.until) continue; // sated, for now
      const reach = (c.sp.attack.range ?? 1) + 0.35;
      if (vd > reach) {
        if (c.state === 'idle' || c.state === 'wander' || c.state === 'investigate' || c.state === 'graze' || c.state === 'chase') {
          c.setState('investigate');
          c.goal = { x: victim.x, z: victim.z };
        }
        continue;
      }
      c.speed = 0; c.vx = 0; c.vz = 0;
      c.targetFacing = Math.atan2(victim.z - c.z, victim.x - c.x);
      if (G.time < feed.next) continue;
      feed.next = G.time + 0.8 + Math.random() * 1.1;
      feed.n++;
      // the lunge pose (resolves into nothing against a dead target)
      c.mem.attackTarget = victim.id;
      c.attackPhase = 0.25;
      G.gore?.maul?.(c, victim, feed.n);
    }
  }
}

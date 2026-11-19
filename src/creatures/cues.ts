// Leads to the inhabitants (round 21, wave 4: "creatures encountered more easily"). Two cues tell the
// unit where something is living, without a word on screen:
//   SOUND   an inhabitant out of sight, 12-46 m off, calls now and then (its own recorded idle or call,
//           placed where it stands, so the ears point the way); quiet ones shuffle (far steps)
//   TRACES  what moves leaves a trail: faint drops of whatever runs in it (gore kind: blood, oil, glow,
//           fluff, plaster) every couple of metres, fading after a minute, so a fresh trail leads to it
// Local to each peer (sound and transient decals only, nothing replicated). Called every frame by the
// creature system (manager.ts).
import { G } from '../game/G';
import type { Creature } from './creature';
import { kindOf, tex } from '../gore/kinds';

const HOSTILE = new Set(['hostile', 'stalker', 'ambush', 'territorial']);
let scanT = 0;
const lastAt = new Map<string, { x: number; z: number }>();

export function cuesFrame(dt: number) {
  const p = G.local, view = G.view;
  if (!p || !view || p.body.dead || (G as unknown as { paused?: boolean }).paused) return;
  scanT -= dt;
  const trace = scanT <= 0;
  if (trace) scanT = 0.5;
  const zk = p.zoneKey;
  let called = 0;
  for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
    if (c.dead || c.zoneKey !== zk || c.tamedBy || c.mem.tribe || c.mem.noCap) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d > 48) { lastAt.delete(c.id); continue; }
    // ---- traces, every half second: a mark each ~2 m it has moved
    if (trace && d < 42) {
      const la = lastAt.get(c.id);
      if (!la) lastAt.set(c.id, { x: c.x, z: c.z });
      else if (Math.hypot(c.x - la.x, c.z - la.z) > 1.9) {
        la.x = c.x; la.z = c.z;
        const K = kindOf(c.sp), t = tex(K, K.liquid ? 'drops' : 'spray');
        if (t && !c.sp.flags?.swimmer) {
          const s = Math.max(0.4, Math.min(0.75, (c.radius ?? 0.4) * 1.1));
          // two marks a step (drips either side of where it went), readable at the iso camera
          for (let k = 0; k < 2; k++) G.gore?.decals?.show?.(zk, { x: Math.round((c.x + (Math.random() - 0.5) * 0.5) * 100) / 100, z: Math.round((c.z + (Math.random() - 0.5) * 0.5) * 100) / 100, w: s * (k ? 0.7 : 1), d: s * (k ? 0.7 : 1), rot: Math.random() * 6.28, tex: t, tint: K.tint }, 0, 75);
        }
      }
    }
    // ---- sound: one call per frame at most, each inhabitant on its own slow clock
    if (called || d < 12 || d > 46) continue;
    const m = c.mem;
    m._cueT ??= 4 + Math.random() * 10;
    m._cueT -= dt;
    if (m._cueT > 0) continue;
    const seen = view.vis?.isVisible?.(c.x, c.z);
    // hostile things are heard a little more often (fair warning); the calm ones now and then
    m._cueT = (HOSTILE.has(c.sp.temperament) ? 9 : 15) + Math.random() * 10;
    if (seen) continue;
    const snd = c.sp.sounds?.idle ?? c.sp.sounds?.call ?? c.sp.sounds?.alert;
    if (snd) G.audio?.creature?.(snd, c);
    else G.audio?.at?.('steps_far', c.x, c.z, 0.5);
    called++;
  }
  if (lastAt.size > 200) lastAt.clear();
}

// Small local sound cues for the wrong rooms and the film-mood zones: phones
// that ring for nobody, drips into buckets, televisions hissing, tether ropes
// creaking. Purely audio and purely local: every peer runs the same proximity
// scan around its own listener, nothing touches shared state.
import { G } from '../game/G';

/** object key -> [sound key, min s, max s, volume] */
const CUES: Record<string, [string, number, number, number]> = {
  zw_phone: ['phone_ring', 5, 11, 0.55],
  zw_drip_bucket: ['drip', 1.2, 3.2, 0.5],
  zw_tv_stack: ['static', 6, 14, 0.25],
  zw_crack: ['whisper', 14, 30, 0.2],
  zw_black_door: ['tinnitus', 20, 40, 0.15],
};
const next = new Map<number, number>();
const R = 9;
let t = 0;

function tick() {
  const g: any = G;
  t += 0.5;
  const p = g?.local;
  if (!p || g.transitioning || !g.zones) return;
  const z = g.zones.get(p.zoneKey);
  if (!z) return;
  const cx = Math.floor(p.x), cy = Math.floor(p.z);
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (!z.inb(x, y)) continue;
    const list = z.tileObjs.get(z.idx(x, y));
    if (!list) continue;
    for (const o of list) {
      const cue = CUES[o.key];
      if (!cue || o.x !== x || o.y !== y || o.state?.broken) continue;
      const n = next.get(o.uid);
      if (n === undefined) { next.set(o.uid, t + cue[1] * (0.3 + ((o.uid * 2654435761) >>> 0) % 1000 / 1000)); continue; }
      if (t < n) continue;
      next.set(o.uid, t + cue[1] + (cue[2] - cue[1]) * Math.random());
      g.audio?.play?.(cue[0], o.x + 0.5, o.y + 0.5, { zone: z.key, vol: cue[3] });
    }
  }
  if (next.size > 400) next.clear();
}

if (typeof window !== 'undefined' && typeof (globalThis as any).document?.visibilityState === 'string') {
  setInterval(() => { try { tick(); } catch { /* audio is optional */ } }, 500);
}

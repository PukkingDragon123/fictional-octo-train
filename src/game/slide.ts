// The chute (Level 0's void, src/world/gen/z_lobbysub.ts): step into the hole at
// the top and the unit goes down a carpet ramp on its back, feet first, arms
// thrown up, picking up speed, the camera riding along with it, and comes out
// onto the floor below with a thump. The unit is the HumanRig body: the slide is
// a full-body pose on its animator ('lv_slide', registered below), the path is
// z.meta.slides (world points with heights), and the camera follows the unit
// because the unit is what moves. Local player only; peers see the pose.
import { G } from './G';
import { bus } from '../core/events';
import { registerPose } from '../entities/humanAnim';
import type { Pose, JointName } from '../entities/humanRig';
import { shake, punch } from '../gfx/juice';
import type { Zone } from '../world/zone';

export interface SlideDef { id: string; start: [number, number][]; path: [number, number, number][]; dur: number }

const ALL: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const S = (P: Pose, j: JointName, x: number, y = 0, z = 0) => { P[j] = [x, y, z]; };
const ease = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };

// on its back, feet first: legs out in front, arms flung up, head lifted to see where it is going, rattling on the carpet
registerPose('lv_slide', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? Math.min(1, t / dur) : 1;
  const k = ease(u / 0.12) * (1 - ease((u - 0.92) / 0.08));
  const judder = Math.sin(time * 31) * 0.05 * k, sway = Math.sin(time * 4.3) * 0.12 * k;
  S(P, 'thighL', -1.45 * k, 0, 0.12 * k); S(P, 'shinL', 0.12 * k + judder); S(P, 'footL', 0.25 * k);
  S(P, 'thighR', -1.35 * k, 0, -0.12 * k); S(P, 'shinR', 0.22 * k - judder); S(P, 'footR', 0.25 * k);
  S(P, 'spine', -0.35 * k, sway * 0.4, 0); S(P, 'chest', -0.15 * k, 0, sway * 0.3); S(P, 'neck', 0.35 * k); S(P, 'head', 0.45 * k + judder, sway * 0.5, 0);
  S(P, 'uarmL', -2.5 * k, 0, 0.55 * k + sway * 0.3); S(P, 'farmL', -0.5 * k + judder * 2); S(P, 'uarmR', -2.4 * k, 0, -0.55 * k + sway * 0.3); S(P, 'farmR', -0.6 * k - judder * 2);
  P.bodyPitch = -1.05 * k; P.rootY = -0.62 * k; P.bodyRoll = sway * 0.5;
  P.gripL = 0.2; P.gripR = 0.2;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 3 });

interface Run { d: SlideDef; t: number; seg: number[]; len: number; y0: number; rumT: number }
let run: Run | null = null;
let armed = '';

function slidesOf(z: Zone | undefined): SlideDef[] { return ((z?.meta as any)?.slides ?? []) as SlideDef[]; }
function at(r: Run, s: number): [number, number, number, number] {
  const P = r.d.path;
  let acc = 0;
  for (let i = 1; i < P.length; i++) {
    const L = r.seg[i - 1];
    if (s <= acc + L || i === P.length - 1) {
      const k = L > 0 ? Math.min(1, (s - acc) / L) : 1, a = P[i - 1], b = P[i];
      return [a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
    acc += L;
  }
  const e = P[P.length - 1];
  return [e[0], e[2], e[1], 0];
}

/** start a slide (also the walkthrough's and the reels' way in) */
export function startSlide(id: string): boolean {
  const p = G.local, z = p ? G.zones.get(p.zoneKey) : undefined;
  const d = slidesOf(z).find((s) => s.id === id);
  if (!p || !d || run) return false;
  const seg: number[] = [];
  let len = 0;
  for (let i = 1; i < d.path.length; i++) { const a = d.path[i - 1], b = d.path[i]; const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); seg.push(l); len += l; }
  run = { d, t: 0, seg, len, y0: p.y, rumT: 0 };
  G.transitioning = true;
  p.actions.clear();
  p.vx = p.vz = 0;
  p.playAnim('lv_slide', d.dur + 0.2);
  G.audio?.at?.('carpet_rustle', p.x, p.z, 1);
  G.audio?.at?.('whoosh', p.x, p.z, 0.8);
  bus.emit('noise', { x: p.x, z: p.z, radius: 10, kind: 'thud', zone: p.zoneKey, by: p.id });
  return true;
}

function step(dt: number) {
  const p = G.local;
  if (!p) return;
  if (!run) {
    // standing in the mouth of a chute: down you go
    if (G.transitioning) return;
    const z = G.zones.get(p.zoneKey);
    const tx = Math.floor(p.x), ty = Math.floor(p.z);
    for (const d of slidesOf(z)) {
      const on = d.start.some(([x, y]) => x === tx && y === ty);
      if (on && armed !== d.id) { armed = d.id; startSlide(d.id); return; }
      if (!on && armed === d.id) armed = '';
    }
    return;
  }
  const r = run;
  r.t += dt;
  const u = Math.min(1, r.t / r.d.dur);
  // slow over the lip, then gathering speed all the way down
  const s = r.len * (0.35 * u + 0.65 * u * u);
  const [x, y, zz, f] = at(r, Math.min(r.len, s));
  p.x = x; p.z = zz; p.y = y + 0.05; p.vx = p.vz = 0;
  p.facing = f;
  if (r.t > r.rumT) { r.rumT = r.t + 0.32; G.audio?.at?.('carpet_rustle', p.x, p.z, 0.5 + u * 0.5); shake(0.06 + u * 0.12, 0.2); }
  if (u >= 1) {
    run = null;
    G.transitioning = false;
    const zz2 = G.zones.get(p.zoneKey);
    if (zz2) p.y = zz2.heightAt(Math.floor(p.x), Math.floor(p.z));
    G.pr.target.y = p.y;
    shake(0.55, 0.4); punch(0.06, 0.25);
    G.audio?.at?.('vx_land', p.x, p.z, 0.9);
    p.playAnim('fall_land');
    bus.emit('unitLanded', p, 2);
    G.missions?.set?.('lv:slid');
  }
}

let sys = false;
bus.on('enterZone', () => {
  const g: any = G;
  if (sys || !g?.addSystem) return;
  sys = true;
  g.addSystem({ name: 'lvSlide', update: (dt: number) => { try { step(dt); } catch (e) { console.error('slide', e); run = null; G.transitioning = false; } } });
});
(globalThis as any).__slide = { start: startSlide, get active() { return !!run; } };

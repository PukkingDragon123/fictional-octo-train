// SLEEP (round 24): the time skip and its cut.
//
//   down     the unit gets down (humanAnim's lieIn: a knee, a hand to the floor, sit, back), the camera eases in on
//            it, cinema bars slide in, the lights dim
//   lapse    the clock runs: solo the game clock spins up (about an in-game hour a real second; co-op only while
//            every unit sleeps), a warm light swings round the sleeper so the shadows wheel across the room, the
//            picture goes a little dreamy, the camera drifts round, and a brass alarm clock in the corner of the
//            picture spins its hands (a tick and a jump for every hour)
//   wake     rested: the bells rattle, the camera eases out, the lights come back up and the unit gets up and
//            stretches. Interrupted (an inhabitant close, a blow, a nightmare, a noise): a hard cut back, a flash,
//            a shake and a sting, the unit jolts up on guard facing what woke it
//
// Something out there can come for a sleeper: through the skip, a hostile inhabitant in the level may hear the
// unit (a chance per in-game hour, far less on a built bed). The clock then drops back to real time, something
// creaks out in the dark, and if it gets close the unit wakes to it.
//
// Any key or a click wakes the unit (Esc still pauses). Options > INTERFACE > Sleep cut: full, short, off (off:
// the skip without the camera, the clock or the bars). installSleep(g) once per session (src/game/session.ts).
import { G } from '../G';
import { bus } from '../../core/events';
import type { Game } from '../game';
import type { Player } from '../../entities/player';
import { registerEmote, LIE_IN } from '../../entities/humanAnim';
import type { Pose, JointName } from '../../entities/humanRig';
import { fpClaim, fpRelease, fpGroup, fpOwner, fpCamera } from '../../fp/fp';
import { inhabitantNear } from '../../actions/world';
import { objDef } from '../../world/objects';
import { cutMode, type CutMode } from '../cuts';
import { buildSleepClock, type SleepClock } from './clock3d';
import { cineRunning } from '../cine/engine';

type Phase = 'idle' | 'down' | 'lapse' | 'wake';
type V3 = [number, number, number];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- the wake-up moves (emotes over the animator)
const ALL: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
function keyed(t: number, keys: [number, Pose][]): Pose {
  let i = 1;
  while (i < keys.length && keys[i][0] < t) i++;
  const [t0, a] = keys[Math.max(0, i - 1)], [t1, b] = keys[Math.min(keys.length - 1, i)];
  const k = t1 > t0 ? sm((t - t0) / (t1 - t0)) : 1;
  const out: Record<string, unknown> = {};
  for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = (a as Record<string, unknown>)[n], vb = (b as Record<string, unknown>)[n];
    if (Array.isArray(va) || Array.isArray(vb)) {
      const A = (va as V3) ?? [0, 0, 0], B = (vb as V3) ?? [0, 0, 0];
      out[n] = [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)];
    } else out[n] = lerp((va as number) ?? 0, (vb as number) ?? 0, k);
  }
  return out as Pose;
}
const KNEEL: Pose = { rootY: -0.42, thighL: [-1.4, 0, 0.05], shinL: [1.5, 0, 0], footL: [-0.1, 0, 0], thighR: [0.15, 0, -0.05], shinR: [1.65, 0, 0], footR: [0.7, 0, 0],
  spine: [0.36, 0, 0], chest: [0.1, 0, 0], head: [0.35, 0, 0], uarmR: [-0.6, 0, -0.15], farmR: [-0.3, 0, 0], uarmL: [-0.2, 0, 0.2], farmL: [-0.5, 0, 0] };
const STAND: Pose = { rootY: 0, thighL: [0, 0, 0.03], shinL: [0.04, 0, 0], thighR: [0, 0, -0.03], shinR: [0.04, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
  spine: [0.06, 0, 0], chest: [0, 0, 0], head: [0.15, 0, 0], uarmL: [0.04, 0, 0.07], uarmR: [0.04, 0, -0.07], farmL: [-0.12, 0, 0], farmR: [-0.12, 0, 0] };
const STRETCH: Pose = { ...STAND, rootY: 0.02, uarmL: [-2.85, 0, 0.32], uarmR: [-2.85, 0, -0.32], farmL: [-0.45, 0, 0], farmR: [-0.45, 0, 0], handL: [0.4, 0, 0], handR: [0.4, 0, 0],
  spine: [-0.2, 0, 0], chest: [-0.14, 0, 0], neck: [-0.1, 0, 0], head: [-0.38, 0, 0], gripL: 0, gripR: 0 };
const STRETCH2: Pose = { ...STRETCH, spine: [-0.16, 0, 0.13], chest: [-0.12, 0, 0.06], head: [-0.3, 0.1, 0.12] };
const WAKE_STRETCH = 3.1;
registerEmote('wake_stretch', { dur: WAKE_STRETCH, legs: true, pose: (t) => ({
  pose: keyed(t, [[0, KNEEL], [0.75, STAND], [1.3, STRETCH], [1.9, STRETCH2], [2.35, STRETCH], [WAKE_STRETCH, STAND]]), mask: ALL }) });
const GUARD: Pose = { rootY: -0.26, thighL: [-0.55, 0, 0.12], shinL: [0.85, 0, 0], thighR: [-0.25, 0, -0.12], shinR: [0.7, 0, 0], footL: [-0.25, 0, 0], footR: [-0.3, 0, 0],
  spine: [0.28, 0, 0], chest: [0.08, 0, 0], head: [-0.05, 0, 0], uarmL: [-1.45, 0.2, 0.32], farmL: [-1.7, 0, 0], uarmR: [-1.35, -0.2, -0.32], farmR: [-1.8, 0, 0], gripL: 0.9, gripR: 0.9 };
const WAKE_JOLT = 2.2;
registerEmote('wake_jolt', { dur: WAKE_JOLT, legs: true, pose: (t) => ({
  pose: keyed(t, [[0, KNEEL], [0.22, GUARD], [0.75, { ...GUARD, head: [-0.05, 0.55, 0], spine: [0.28, 0.25, 0] }], [1.3, { ...GUARD, head: [0, -0.45, 0], spine: [0.28, -0.2, 0] }], [1.75, GUARD], [WAKE_JOLT, STAND]]), mask: ALL }) });

// ---------------------------------------------------------------- the bars
let barsEl: HTMLDivElement | null = null;
function bars(k: number) {
  if (typeof document === 'undefined') return;
  if (!barsEl) {
    barsEl = document.createElement('div');
    barsEl.className = 'slp-bars';
    barsEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:28';
    barsEl.innerHTML = '<i style="position:absolute;left:0;right:0;top:0;height:0;background:#000"></i><i style="position:absolute;left:0;right:0;bottom:0;height:0;background:#000"></i>'
      + '<i style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 75% 70% at 50% 52%,transparent 55%,rgba(6,8,16,.5) 82%,rgba(3,4,10,.8) 100%)"></i>';
    document.body.appendChild(barsEl);
  }
  const h = (9 * k).toFixed(2) + 'vh';
  (barsEl.children[0] as HTMLElement).style.height = h;
  (barsEl.children[1] as HTMLElement).style.height = h;
  (barsEl.children[2] as HTMLElement).style.opacity = (k * 0.9).toFixed(3);
  barsEl.style.display = k > 0.001 ? 'block' : 'none';
}

// ---------------------------------------------------------------- the system
const SKIP = { full: 150, short: 300, off: 320 } as Record<CutMode, number>;
const SCARES = new Set(['inhabitant', 'hit', 'nightmare', 'noise']);

class SleepCut {
  readonly name = 'sleep';
  phase: Phase = 'idle';
  t = 0;
  mode: CutMode = 'full';
  /** the eased amounts the frame paints: bars, dim, dream */
  private bar = 0; private barGoal = 0;
  private dim = 1; private dimGoal = 1; private dimRate = 1.5;
  private dream = 0;
  private flash = 0;
  private speed = 1;
  private orbit = 0;
  private lastHour = 0;
  private clock: SleepClock | null = null;
  private clockIn = 0; private clockGoal = 0;
  private claimed = false;
  private sweep = 0;
  private visit: { c: { x: number; z: number; lastHeard?: unknown; dead?: boolean }; t: number } | null = null;
  private visited = false;
  private lastWake = -99;
  /** a wake the cut asked for (a key, a click): no scare */
  private keyWake = false;

  constructor(readonly g: Game) {
    bus.on('sleepStart', (p: Player) => { if (p?.isLocal) this.begin(p); });
    bus.on('sleepEnd', (p: Player, _h: number, scare?: string) => { if (p?.isLocal) this.end(p, scare || ''); });
    bus.on('playerHit', (p: Player) => { if (p?.isLocal && p.sleeping) this.interrupt(p, 'hit'); });
    bus.on('death', (p: Player) => { if (p?.isLocal) this.reset(); });
    // any real close-up (the pack, the health check) takes the stage from the clock
    bus.on('fpLost', (n: string) => { if (n === 'sleep') { this.claimed = false; this.clockGoal = 0; } });
    if (typeof window !== 'undefined') {
      const onKey = (e: KeyboardEvent) => {
        if (this.phase !== 'down' && this.phase !== 'lapse') return;
        if (e.key === 'Escape' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || /^F\d+$/.test(e.key) || e.repeat) return;
        if (this.g.paused || document.querySelector('.ps2, .t-modal, .menu-open')) return;
        this.wakeByHand();
      };
      const onPtr = (e: PointerEvent) => {
        if (this.phase !== 'down' && this.phase !== 'lapse') return;
        if (this.g.paused || !(e.target instanceof HTMLCanvasElement)) return;
        this.wakeByHand();
      };
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('pointerdown', onPtr, true);
    }
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as unknown as { __sleep: unknown }).__sleep = {
        cut: this,
        /** dev: tire the unit and put it to sleep where it stands (or on the nearest bed) */
        now: (fatigue = 85) => {
          const p = G.local; p.body.fatigue = Math.max(p.body.fatigue, fatigue);
          return import('../../actions/world').then((m) => {
            const bed = (G.interact?.objectsNear?.(p, 2.2) || []).find((o: { key: string }) => objDef(o.key)?.sleep);
            p.actions.clear(); p.actions.add(new m.SleepAction(p, bed || null, bed ? objDef(bed.key)!.sleep! : 0.15));
          });
        },
        wake: () => this.wakeByHand(),
        scare: () => { const p = G.local; if (p.sleeping) this.interrupt(p, 'inhabitant'); },
      };
    }
  }

  private wakeByHand() {
    const p = G.local;
    if (!p?.sleeping) return;
    this.keyWake = true;
    p.actions.clear();
  }
  private interrupt(p: Player, why: string) {
    if (!p.sleeping) return;
    (p as unknown as { sleepScare?: string }).sleepScare = why;
    p.actions.clear();
  }

  private begin(p: Player) {
    this.mode = cutMode('sleep');
    this.phase = 'down'; this.t = 0;
    this.keyWake = false; this.visited = false; this.visit = null;
    this.lastHour = Math.floor(G.clock.hours);
    const full = this.mode !== 'off';
    if (full) {
      G.camera?.pushIn?.(this.mode === 'short' ? 0.36 : 0.46, this.mode === 'short' ? 1.1 : 2.2, -9);
      this.barGoal = 1;
      G.hudBody?.setHidden?.('sleep', true);
      document.body.classList.add('noclip-cine');
      this.cineClass = true;
    }
    this.dimGoal = full ? 0.78 : 0.85; this.dimRate = 1.2;
    G.audio?.at?.('cloth', p.x, p.z, 0.5);
    setTimeout(() => { if (this.phase === 'down' || this.phase === 'lapse') G.audio?.at?.('thud_soft', p.x, p.z, 0.25); }, 900);
  }

  private startLapse() {
    this.phase = 'lapse'; this.t = 0;
    if (this.mode === 'off') return;
    this.dimGoal = 0.6; this.dimRate = 0.6;
    // the clock in the corner of the picture (the overlay scene; nothing else holds the stage while the unit sleeps)
    if (G.pr?.overlayScene && (!fpOwner() || fpOwner() === 'sleep')) {
      try {
        this.claimed = fpClaim('sleep', 0.5, { cinematic: 'none' });
        if (this.claimed) {
          if (!this.clock) { this.clock = buildSleepClock(); fpGroup('sleep').add(this.clock.root); }
          this.clockGoal = 1;
        }
      } catch (e) { console.warn('sleep clock', e); }
    }
  }

  private end(p: Player, scare: string) {
    if (this.phase === 'idle') return;
    const wasMode = this.mode;
    const startled = SCARES.has(scare) && !this.keyWake;
    this.phase = 'wake'; this.t = 0; this.visit = null;
    this.lastWake = G.time;
    this.speed = 1; G.clock.speed = 1;
    // the camera back round to where it was, then out
    if (this.orbit) { G.camera?.orbitBy?.(-this.orbit); this.orbit = 0; }
    G.camera?.endOrbit?.();
    if (p.body.dead) { this.reset(); return; }
    if (startled) {
      G.camera?.pushIn?.(0, 0.35);
      G.camera?.shake?.(0.9, 0.55);
      G.camera?.punch?.(-0.12, 0.3);
      this.barGoal = 0; this.bar = Math.min(this.bar, 0.35);
      this.dim = 1.32; this.dimGoal = 1; this.dimRate = 3.2; this.flash = 1;
      this.dream = 0;
      this.clockGoal = 0;
      G.audio?.flat?.('dread_hit', 'sfx', 0.55); G.audio?.flat?.('heartbeat', 'sfx', 0.5);
      const c = inhabitantNear(p, 12);
      if (c) { p.facing = p.targetFacing = Math.atan2(c.z - p.z, c.x - p.x); }
      if (scare === 'inhabitant' || scare === 'hit') p.body.panic = Math.min(100, p.body.panic + 22);
      p.emote('wake_jolt');
      if (scare === 'inhabitant') setTimeout(() => bus.emit('think', p, 'Something is here.'), 350);
      else if (scare === 'hit') setTimeout(() => bus.emit('think', p, 'Get off me!'), 200);
    } else {
      const k = wasMode === 'short' ? 0.55 : 1;
      if (wasMode !== 'off') G.camera?.pushIn?.(0, 1.8 * k);
      this.barGoal = 0;
      this.dimGoal = 1; this.dimRate = 1.6 / k;
      this.clock?.ring(0.9 * k);
      if (wasMode !== 'off') G.audio?.flat?.('elevator_ding', 'sfx', 0.2, 1.25);
      setTimeout(() => { this.clockGoal = 0; }, 700 * k);
      if (!p.body.downed) p.emote('wake_stretch');
    }
    G.hudBody?.setHidden?.('sleep', false);
    this.dropCineClass();
  }

  private cineClass = false;
  private dropCineClass() { if (this.cineClass && !cineRunning() && !(G as unknown as { intro?: { running?: boolean } }).intro?.running) document.body.classList.remove('noclip-cine'); this.cineClass = false; }

  /** everything back to normal at once (death, a load) */
  reset() {
    this.phase = 'idle'; this.t = 0;
    this.bar = this.barGoal = 0; bars(0);
    this.dim = this.dimGoal = 1; this.dream = 0; this.flash = 0;
    this.speed = 1; if (G.clock) G.clock.speed = 1;
    if (this.orbit) { G.camera?.orbitBy?.(-this.orbit); this.orbit = 0; G.camera?.endOrbit?.(); }
    this.clockGoal = 0; this.clockIn = 0;
    this.dropClock();
    if (G.pr) { G.pr.fx.dim = 1; }
    G.hudBody?.setHidden?.('sleep', false);
    this.dropCineClass();
  }
  private dropClock() {
    if (this.claimed && fpOwner() === 'sleep') fpRelease('sleep');
    this.claimed = false;
    if (this.clock) { this.clock.dispose(); this.clock = null; }
  }

  /** every unit in the world asleep (solo: just this one) */
  private everyoneAsleep(): boolean {
    for (const q of G.players.values()) if (!q.body.dead && !q.sleeping) return false;
    return true;
  }

  update(dt: number) {
    const p = G.local;
    if (!p || !G.pr) return;
    if (this.phase === 'idle') return;
    this.t += dt;
    const mode = this.mode;
    // ---- the phase clock
    if (this.phase === 'down') {
      if (!p.sleeping) { this.end(p, ''); }
      else if (this.t >= (mode === 'off' ? 0.6 : LIE_IN + 0.15)) this.startLapse();
    }
    if (this.phase === 'lapse') this.lapse(p, dt);
    if (this.phase === 'wake') {
      if (this.t > 3.2 && this.bar < 0.002 && Math.abs(this.dim - 1) < 0.005 && this.clockIn < 0.01) { this.dropClock(); this.reset(); return; }
    }
    // if the sleep ended without its event (a dropped queue), wake the cut anyway
    if ((this.phase === 'lapse' || this.phase === 'down') && !p.sleeping) this.end(p, '');
    // ---- paint
    const kb = 1 - Math.exp(-(this.barGoal > this.bar ? 2.6 : 3.4) * dt);
    this.bar += (this.barGoal - this.bar) * kb;
    if (Math.abs(this.bar - this.barGoal) < 0.002) this.bar = this.barGoal;
    bars(this.bar);
    this.dim += (this.dimGoal - this.dim) * (1 - Math.exp(-this.dimRate * dt));
    if (Math.abs(this.dim - this.dimGoal) < 0.003) this.dim = this.dimGoal;
    G.pr.fx.dim = this.dim;
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 3); G.pr.fx.blink = Math.max(G.pr.fx.blink, 0); }
    const dreamGoal = this.phase === 'lapse' && mode !== 'off' ? 0.32 + Math.sin(G.time * 0.7) * 0.08 : 0;
    this.dream += (dreamGoal - this.dream) * (1 - Math.exp(-1.5 * dt));
    if (this.dream > 0.002) G.pr.fx.dream = Math.max(G.pr.fx.dream, this.dream);
    // the clock prop
    this.clockIn += (this.clockGoal - this.clockIn) * (1 - Math.exp(-(this.clockGoal > this.clockIn ? 4 : 6) * dt));
    if (this.clock) this.placeClock(dt);
  }

  private lapse(p: Player, dt: number) {
    const mode = this.mode;
    const all = this.everyoneAsleep();
    // ---- an inhabitant: close by wakes the unit; out there it may come looking through the skip
    if (inhabitantNear(p, 6.5)) { this.interrupt(p, 'inhabitant'); return; }
    const v = this.visit;
    if (v) {
      v.t += dt;
      if (v.c.dead || v.t > 14) this.visit = null;
    }
    // ---- the skip
    const want = all && !this.visit ? SKIP[mode] : 1;
    this.speed += (want - this.speed) * (1 - Math.exp(-(want > this.speed ? 1.4 : 5) * dt));
    if (Math.abs(this.speed - want) < 0.5) this.speed = want;
    G.clock.speed = Math.max(1, this.speed);
    const hr = Math.floor(G.clock.hours);
    if (hr !== this.lastHour) {
      const n = hr - this.lastHour;
      this.lastHour = hr;
      if (mode !== 'off') { this.clock?.bump(); G.audio?.flat?.('mn_tick', 'sfx', 0.2, 0.9 + Math.random() * 0.2); }
      if (all && !this.visited && G.role !== 'client') this.rollVisit(p, n);
    }
    if (mode === 'off') return;
    // ---- the shadows wheel: a warm light swings round the sleeper with the clock (a turn every four hours)
    this.sweep = (G.clock.hours / 4) * Math.PI * 2;
    const r = 3.4;
    const lx = p.x + Math.cos(this.sweep) * r, lz = p.z + Math.sin(this.sweep) * r;
    const fast = clamp01((this.speed - 1) / 40);
    G.pointLight(lx, (p.y ?? 0) + 2.3, lz, 0xffd7a0, 1.1 + 0.9 * fast, 8.5);
    // ---- the camera drifts round the sleeper (undone on waking)
    if (!G.camera?.comfort) {
      const d = dt * (0.05 + 0.1 * fast);
      if (this.orbit < 0.22) { G.camera?.orbitBy?.(d); this.orbit += d; }
    }
  }

  /** through the skip: a hostile inhabitant in this level hears the sleeper (once a sleep at most) */
  private rollVisit(p: Player, hours: number) {
    const cs = (G.creatures as unknown as { creatures?: Map<string, { dead?: boolean; zoneKey: string; x: number; z: number; tamedBy?: string | null; sp: { temperament: string }; lastHeard?: unknown }> } | null)?.creatures;
    if (!cs) return;
    let best: { dead?: boolean; zoneKey: string; x: number; z: number; lastHeard?: unknown } | null = null, bd = 42;
    for (const c of cs.values()) {
      if (c.dead || c.zoneKey !== p.zoneKey || c.tamedBy || !/hostile|stalker|ambush|territorial/.test(c.sp.temperament)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    // a built bed (a camp) keeps the sleeper far safer than a floor in the open
    const bed = (G.interact?.objectsNear?.(p, 1.4) || []).some((o: { key: string; state?: { built?: boolean } }) => objDef(o.key)?.tags?.includes('bed') && o.state?.built);
    const chance = 0.05 * hours * (bed ? 0.3 : 1) * (p.body.has?.('heavy_sleeper') ? 1.2 : 1);
    if (Math.random() >= chance) return;
    this.visited = true;
    this.visit = { c: best, t: 0 };
    best.lastHeard = { x: p.x, z: p.z, t: G.time, r: 9 };
    // the time-lapse slows; something creaks out in the dark (a light sleeper wakes to it)
    G.audio?.at?.('wood_creak', lerp(p.x, best.x, 0.5), lerp(p.z, best.z, 0.5), 0.7);
    if (p.body.has?.('light_sleeper')) setTimeout(() => { if (p.sleeping) this.interrupt(p, 'noise'); }, 900);
  }

  private placeClock(dt: number) {
    const c = this.clock!, cam = fpCamera();
    c.step(dt);
    c.set(G.clock.hours, G.clock.day);
    const k = sm(this.clockIn);
    const D = 1.0, halfH = Math.tan((cam.fov * Math.PI) / 360) * D, halfW = halfH * cam.aspect;
    const s = Math.max(0.0001, k) * Math.min(1.25, Math.max(0.75, halfH / 0.268));
    const root = c.root;
    root.visible = k > 0.01;
    root.scale.setScalar(s);
    root.position.copy(cam.position);
    const x = halfW - 0.14 * s, y = halfH - 0.2 * s + (1 - k) * 0.12;
    root.quaternion.copy(cam.quaternion);
    root.translateX(x); root.translateY(y); root.translateZ(-D);
    // turned a little toward the middle of the picture (it reads as an object on a shelf, not a sticker)
    root.rotateY(-0.42); root.rotateX(0.12);
    root.rotateZ(Math.sin(performance.now() * 0.0011) * 0.02);
  }
}

let installed: SleepCut | null = null;
export function installSleep(g: Game) {
  if (installed) return installed;
  installed = new SleepCut(g);
  g.addSystem(installed);
  return installed;
}

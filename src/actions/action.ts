import type { Player } from '../entities/player';
import type { ActionAnim, FullBody } from '../entities/humanAnim';

/**
 * Project Zomboid style timed action. Everything a survivor does — moving an
 * item between containers, eating, bandaging, barricading, cooking — takes
 * time, plays an animation and can be interrupted. Actions queue up.
 */
export abstract class TimedAction {
  name = 'Action';
  /** base duration in real seconds (scaled by the body's action modifier) */
  duration = 1;
  t = 0;
  anim: ActionAnim = 'craft';
  full: FullBody = '';
  /** player may keep walking while this runs */
  canMove = false;
  /** show progress bar */
  showBar = true;
  /** face this world point while acting */
  face?: { x: number; z: number };
  /** loop sound key */
  sound?: string;
  started = false;
  done = false;
  cancelled = false;
  /** skip the body action-speed scaling (e.g. sleeping, waiting) */
  fixedTime = false;
  /** blocks other input (e.g. vaulting) */
  locks = false;
  constructor(public p: Player) {}

  get progress() { return Math.min(1, this.t / this.effDuration); }
  get effDuration() { return this.fixedTime ? this.duration : this.duration * this.p.actionMul(); }

  /** prerequisites still valid? */
  isValid(): boolean { return true; }
  start(): void {}
  update(_dt: number): void {}
  /** completed successfully */
  abstract perform(): void;
  /** interrupted */
  stop(): void {}
}

/** One-shot instant action wrapper (still queued so ordering is preserved) */
export class InstantAction extends TimedAction {
  constructor(p: Player, private fn: () => void, name = '') { super(p); this.duration = 0.01; this.name = name; this.showBar = false; this.anim = ''; }
  perform() { this.fn(); }
}

export class ActionQueue {
  list: TimedAction[] = [];
  constructor(public p: Player) {}
  get current(): TimedAction | undefined { return this.list[0]; }
  get busy() { return this.list.length > 0; }
  add(a: TimedAction) { this.list.push(a); return a; }
  /** replace queue with a single action */
  set(a: TimedAction) { this.clear(); this.list.push(a); return a; }
  clear() {
    const c = this.list[0];
    if (c && c.started && !c.done) { c.cancelled = true; try { c.stop(); } catch (e) { console.error(e); } }
    this.list.length = 0;
  }
  update(dt: number) {
    const a = this.list[0];
    if (!a) return;
    if (!a.started) {
      if (!a.isValid()) { this.list.shift(); return; }
      a.started = true;
      try { a.start(); } catch (e) { console.error('action start', a.name, e); this.list.shift(); return; }
    }
    if (!a.isValid()) { a.cancelled = true; a.stop(); this.list.shift(); return; }
    a.t += dt;
    try { a.update(dt); } catch (e) { console.error('action update', a.name, e); }
    if (a.done) { this.list.shift(); return; }
    if (a.t >= a.effDuration) {
      a.done = true;
      this.list.shift();
      try { a.perform(); } catch (e) { console.error('action perform', a.name, e); }
    }
  }
}

// SKILL CHECKS (round 17): short quick-time windows inside a timed action,
// for the work where a steady hand matters: setting pins, kicking a door in the
// right spot, passing a suture needle, easing glass out of a wound, each cut of
// a butchery, seating a magazine. The work pauses while a window is open; the
// gauge rides over the action plate above the unit's head (src/ui/minigames/check.ts).
//   tap    the needle sweeps back and forth; stop it in the green
//          (E / Space / left click / a tap anywhere on touch)
//   hold   hold the key and the needle pushes along (shaking with pain and nerves);
//          let go in the green. Push past the end and it slips.
// Skills and talents widen the band and slow the needle (opts.ease); the
// Settings assists (Interface: Slower timing) make every window easier.
// Scripted browsers (navigator.webdriver) pass every window unless ?qte is in the URL.
//
//   a.check = new SkillCheck({ kind: 'tap', at: [0.3, 0.6, 0.9], band: 0.18, ease, glyph: 'PIN', onMark: (m, i) => ... });
//   perform(): this.check.hits / misses / perfects / score
// Bus: 'skillCheck' { name, hits, misses, perfects, of } when the action ends.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { TimedAction } from './action';
import type { GaugeMark, GaugeState } from '../ui/minigames/check';
import { qteAssist } from '../core/assist';

// the gauge is UI: loaded on the first window, never at import (game logic stays node-safe for the zone checks)
let gauge: { show(x: number, y: number, st: GaugeState): void; hide(): void } | null = null;
let gaugeLoading = false;
function loadGauge() {
  if (gauge || gaugeLoading || typeof document === 'undefined') return;
  gaugeLoading = true;
  import('../ui/minigames/check').then((m) => { gauge = m.checkGauge; }).catch((e) => { gaugeLoading = false; console.warn('check gauge', e); });
}
const checkGauge = { show: (x: number, y: number, st: GaugeState) => { if (gauge) gauge.show(x, y, st); else loadGauge(); }, hide: () => gauge?.hide() };

export type CheckKind = 'tap' | 'hold';
export type CheckMark = 'perfect' | 'hit' | 'miss';
export interface CheckOpts {
  kind?: CheckKind;
  /** the action's progress (0..1) at which each window opens */
  at: number[];
  /** the green band's width (0..1 of the channel) */
  band?: number;
  /** tap: channel lengths a second; hold: how fast the push runs */
  speed?: number;
  /** hold: how much the needle shakes (pain, panic) 0..1 */
  tremor?: number;
  /** > 1 easier (skill, talents): wider band, slower needle */
  ease?: number;
  /** a tiny stencil on the gauge (PIN, CUT, PASS, KICK, MAG) */
  glyph?: string;
  /** recorded sounds for the marks (defaults: the machines' own) */
  sounds?: Partial<Record<CheckMark, string>>;
  onMark?: (m: CheckMark, i: number) => void;
}

const AUTO = typeof navigator !== 'undefined' && !!navigator.webdriver && typeof location !== 'undefined' && !/[?&]qte/.test(location.search);
const V = new THREE.Vector3();
function vn(t: number, s: number) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); const h = (k: number) => { const x = Math.sin(k * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }; return h(i) * (1 - u) + h(i + 1) * u; }

let owner: SkillCheck | null = null;
let taps = 0, touchHeld = false;
const onDown = (e: PointerEvent) => {
  if (!owner?.isOpen || e.pointerType === 'mouse') return;
  const t = e.target as HTMLElement | null;
  // a tap on the world (or the gauge) is the hand; a tap on a real control stays a control
  if (t && t.closest && t.closest('button, a, input, .touch-btn, [data-touch-btn]')) return;
  taps++; touchHeld = true;
  e.preventDefault(); e.stopPropagation();
};
const onUp = (e: PointerEvent) => { if (e.pointerType !== 'mouse') touchHeld = false; };
let listening = false;
function listen(on: boolean) {
  if (on === listening || typeof window === 'undefined') return;
  listening = on;
  if (on) { window.addEventListener('pointerdown', onDown, { capture: true, passive: false }); window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', onUp, true); }
  else { window.removeEventListener('pointerdown', onDown, { capture: true }); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true); taps = 0; touchHeld = false; }
}

export class SkillCheck {
  readonly marks: (CheckMark | '')[];
  private i = 0;
  private open = false;
  private x = 0; private v = 1; private band: [number, number] = [0.4, 0.6]; private core: [number, number] = [0.48, 0.52];
  private wt = 0; private flash: GaugeMark = ''; private flashT = 0; private armed = false; private pushing = false; private seed = Math.random() * 100;
  private ended = false;
  constructor(public o: CheckOpts) { this.marks = o.at.map(() => ''); }

  get isOpen() { return this.open; }
  get hits() { return this.marks.filter((m) => m === 'hit' || m === 'perfect').length; }
  get perfects() { return this.marks.filter((m) => m === 'perfect').length; }
  get misses() { return this.marks.filter((m) => m === 'miss').length; }
  get of() { return this.marks.length; }
  /** 0..1: how the hand did (a window never reached counts as a plain hit) */
  get score() { return this.marks.reduce((s, m) => s + (m === 'perfect' ? 1 : m === 'hit' || m === '' ? 0.8 : 0), 0) / Math.max(1, this.marks.length); }
  /** every window passed, at least one cleanly */
  get clean() { return this.misses === 0 && this.hits > 0; }

  private ease() { const A = qteAssist(); return Math.max(0.4, (this.o.ease ?? 1) * (A.slow ? 1.35 : 1)); }

  private openWindow() {
    this.open = true; this.wt = 0; this.x = 0; this.v = 1; this.pushing = false; this.flash = ''; this.flashT = 0;
    const E = this.ease();
    const bw = Math.max(0.07, Math.min(0.42, (this.o.band ?? 0.2) * Math.sqrt(E)));
    const lo = this.o.kind === 'hold' ? 0.45 : 0.3;
    const b0 = lo + Math.random() * Math.max(0, 0.94 - bw - lo);
    this.band = [b0, b0 + bw];
    const cw = bw * 0.3, cm = b0 + bw / 2;
    this.core = [cm - cw / 2, cm + cw / 2];
    const G2 = G as unknown as { input?: { down(a: string): boolean; mouseDown: boolean[] } };
    this.armed = !(G2.input?.down('interact') || G2.input?.down('shove') || G2.input?.mouseDown?.[0] || touchHeld);
    owner = this; listen(true); taps = 0; loadGauge();
    G.audio?.ui?.('mn_tick', 0.35);
  }

  private mark(m: CheckMark) {
    const i = this.i;
    this.marks[i] = m; this.i++; this.open = false;
    this.flash = m; this.flashT = 0.42;
    const snd = this.o.sounds?.[m] ?? (m === 'perfect' ? 'mn_perfect' : m === 'hit' ? 'mn_hit' : 'mn_miss');
    G.audio?.ui?.(snd, m === 'miss' ? 0.5 : 0.55);
    if (m === 'perfect') G.audio?.ui?.('cb_perfect', 0.25);
    try { this.o.onMark?.(m, i); } catch (e) { console.error('skill check', e); }
    if (owner === this) { owner = null; listen(false); }
  }

  /** read and eat this frame's press (so it never also opens a menu or throws a shove) */
  private press(keysOnly = false): boolean {
    const inp: any = G.input;
    let hit = false;
    for (const a of ['interact', 'shove']) if (inp.hit(a)) { hit = true; for (const c of inp.bindings[a]) inp.pressed.delete(c); }
    if (keysOnly) return hit;
    if (inp.mousePressed?.[0] && !inp.pointerOverUI) { hit = true; inp.mousePressed[0] = false; }
    if (taps) { hit = true; taps = 0; }
    return hit;
  }
  private holding(): boolean {
    const inp: any = G.input;
    return !!(inp.down('interact') || inp.down('shove') || inp.mouseDown?.[0] || touchHeld);
  }

  /** the action plate over the head steps aside while the gauge holds its lane (one readout at a time) */
  private plate(a: TimedAction, on: boolean) {
    if (on) { if (this.bar === null) { this.bar = a.showBar; a.showBar = false; } }
    else if (this.bar !== null) { a.showBar = this.bar; this.bar = null; }
  }
  private bar: boolean | null = null;

  /** one frame inside the action: true while a window is open (the work waits on the hand) */
  step(a: TimedAction, dt: number): boolean {
    if (this.ended || !a.p.isLocal) return false;
    if (this.flashT > 0) this.flashT -= dt;
    this.plate(a, this.open || this.flashT > 0);
    if (!this.open) {
      if (this.i < this.marks.length && a.progress >= this.o.at[this.i]) {
        if (AUTO) { this.mark('hit'); return false; }
        this.openWindow();
        this.plate(a, true);
      } else {
        // a press before the next window is the hand getting ready, not a new order (it never cancels the work)
        if (this.i < this.marks.length && !AUTO) this.press(true);
        if (this.flashT > 0) this.draw(a, false); else checkGauge.hide();
        return false;
      }
    }
    this.wt += dt;
    const E = this.ease();
    if ((this.o.kind ?? 'tap') === 'tap') {
      const sp = (this.o.speed ?? 1.2) / Math.sqrt(E);
      // judge the press against the needle the player was looking at (before this frame moves it)
      if (this.press()) {
        const inB = this.x >= this.band[0] && this.x <= this.band[1];
        this.mark(!inB ? 'miss' : this.x >= this.core[0] && this.x <= this.core[1] ? 'perfect' : 'hit');
      } else if (this.wt * sp > 2.6) this.mark('miss');
      else {
        this.x += this.v * sp * Math.min(dt, 0.05);
        if (this.x > 1) { this.x = 2 - this.x; this.v = -1; }
        if (this.x < 0) { this.x = -this.x; this.v = 1; }
      }
    } else {
      // hold: arm on a fresh press, push while held, let go in the green
      const held = this.holding();
      this.press();
      if (!this.armed) { if (!held) this.armed = true; }
      else if (held) {
        this.pushing = true;
        const sp = (this.o.speed ?? 0.5) / Math.sqrt(E);
        const tr = Math.max(0, (this.o.tremor ?? 0) / E);
        this.x += sp * dt * (0.55 + 0.9 * vn(this.wt * 2.2, this.seed)) + (vn(this.wt * 9, this.seed + 4) - 0.5) * tr * dt * 3.2;
        this.x = Math.max(0, this.x);
        if (this.x >= 1) { this.x = 1; this.mark('miss'); }
      } else if (this.pushing) {
        const inB = this.x >= this.band[0] && this.x <= this.band[1];
        this.mark(!inB ? 'miss' : this.x >= this.core[0] && this.x <= this.core[1] ? 'perfect' : 'hit');
      }
      if (this.open && !this.pushing && this.wt > 4) this.mark('miss');
    }
    this.draw(a, this.open);
    return this.open;
  }

  private draw(a: TimedAction, live: boolean) {
    const p = a.p;
    if (!G.pr?.worldToScreen) return;
    const s = G.pr.worldToScreen(V.set(p.x, p.y + 2.3, p.z));
    const touch = !!(G.systems.find((q: any) => q.name === 'touch') as any)?.active;
    const kn = (G.input?.keyName?.('interact') || 'E').toUpperCase().slice(0, 3);
    // the action plate's own lane (it is hidden meanwhile): the gauge's foot where the plate's foot was
    checkGauge.show(s.x, s.y - 6, {
      kind: this.o.kind ?? 'tap', x: this.x, band: this.band, core: this.core, marks: this.marks, cur: this.i,
      key: touch ? '' : kn, flash: this.flashT > 0 ? this.flash : '', t: G.time, glyph: this.o.glyph, held: live && this.o.kind === 'hold' && this.holding(), live,
    });
  }

  /** the action is over (done, cancelled, invalid): put the gauge away */
  end(a?: TimedAction) {
    if (this.ended) return;
    this.ended = true; this.open = false;
    if (owner === this) { owner = null; listen(false); }
    if (a) this.plate(a, false);
    checkGauge.hide();
    if (a?.p?.isLocal && this.i > 0) bus.emit('skillCheck', { name: a.name, hits: this.hits, misses: this.misses, perfects: this.perfects, of: this.of });
  }
}

/** how steady the unit's hands are right now (0 calm .. 1 shaking): pain, panic, exhaustion */
export function tremorOf(p: { body: any }): number {
  const b = p.body;
  let t = 0;
  try { t += Math.min(0.5, (b.pain?.() ?? 0) / 200); } catch { /* no pain model */ }
  t += Math.min(0.35, (b.panic ?? 0) / 260);
  if ((b.endurance ?? 1) < 0.25) t += 0.15;
  if ((b.drunk ?? 0) > 0) t += Math.min(0.3, b.drunk / 200);
  return Math.min(1, t);
}

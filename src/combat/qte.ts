// Struggles: when something grabs you, pins you or starts pulling a limb off,
// you fight it in stages: MASH (hammer the key), ALTERNATE (left, right,
// left...) and TIMED (hit it as the closing ring crosses the mark). The
// prompts are glyphs in the world around your body, the progress ring is on
// the floor under you. Win and you tear loose (cleanly enough and the thing is
// left reeling, open to a counter-execution); lose and it bites or rips.
// Touch: tap anywhere to mash / hit, tap left or right of yourself to alternate.
import { G } from '../game/G';
import type { Player } from '../entities/player';
import { TimedAction } from '../actions/action';
import { TornAction } from '../survival/limbSystem';
import { shake, punch, hitstop, slowmo } from '../gfx/juice';
import { gaugeName, type Marks } from './glyphs';
import type { Words } from './words';
import { bus } from '../core/events';
import { qteAssist } from '../ui/menus/settings';

export type QteKind = 'mash' | 'alt' | 'timed';
export interface Stage { kind: QteKind; need: number }
export interface StruggleOpts {
  reason: 'tear' | 'grab' | 'pin';
  cid: string | null;
  dur: number;
  stages: Stage[];
  /** how hard it holds (decay of the mash bar) 0.6 .. 1.6 */
  grip: number;
  act?: TimedAction | null;
  onWin: (perfect: boolean) => void;
  onLose: () => void;
}

/** locks the survivor in place while a grab / pin is fought (the tear has its own TornAction) */
export class StruggleAction extends TimedAction {
  constructor(p: Player, anim: string, dur: number, face?: { x: number; z: number }) {
    super(p);
    this.name = 'Break free'; this.anim = anim as any; this.duration = dur; this.fixedTime = true;
    // round 13: the time left shows on the action plate over the head (src/ui/actionBar.ts), draining, not as chalk marks on the floor
    this.locks = true; this.canMove = false; this.showBar = true; this.face = face;
  }
  /** the action plate shows the time left, not the time spent */
  barK() { return Math.max(0, 1 - this.t / Math.max(0.01, this.duration)); }
  update() { this.p.speed = 0; }
  perform() { /* ends with the struggle */ }
}

// the struggle drives a limb-tearing grip instead of the old SPACE roll
let owns: (a: unknown) => boolean = () => false;
const tornUpdate = TornAction.prototype.update;
TornAction.prototype.update = function (this: TornAction, dt: number) {
  if (owns(this) && !this.ripped && this.t < this.hold) { this.p.speed = 0; return; }
  tornUpdate.call(this, dt);
};

interface Cur extends StruggleOpts {
  t: number; si: number; prog: number; misses: number; hits: number;
  want: 'L' | 'R'; ring: number; pop: number; beat: number; done: boolean;
}

export class Struggles {
  cur: Cur | null = null;
  private taps: { x: number; y: number }[] = [];
  private onTap = (e: PointerEvent) => { if (this.cur && e.pointerType !== 'mouse') { this.taps.push({ x: e.clientX, y: e.clientY }); this.touchDown = true; } };
  private onLift = (e: PointerEvent) => { if (e.pointerType !== 'mouse') this.touchDown = false; };
  private touchDown = false;
  private holdAcc = 0;
  private listening = false;
  /** results for tests / other systems */
  last: { reason: string; win: boolean; perfect: boolean; t: number } | null = null;

  constructor() { owns = (a) => !!this.cur && !this.cur.done && this.cur.act === a; }

  get active() { return !!this.cur && !this.cur.done; }

  start(o: StruggleOpts) {
    if (this.active) return false;
    // round 17 assists (Settings, Interface): slower timing gives the struggle more time and a looser grip
    if (qteAssist().slow) o = { ...o, dur: o.dur * 1.4, grip: o.grip * 0.8 };
    this.cur = { ...o, t: 0, si: 0, prog: 0, misses: 0, hits: 0, want: 'L', ring: 1, pop: 0, beat: 0, done: false };
    if (!this.listening) { window.addEventListener('pointerdown', this.onTap, { capture: true, passive: true }); window.addEventListener('pointerup', this.onLift, true); this.listening = true; }
    this.holdAcc = 0; this.touchDown = false;
    this.taps.length = 0;
    slowmo(0.45, 280); punch(0.07, 0.3); shake(0.35, 0.3);
    G.camera?.pushIn?.(0.2, 0.35, -6);
    G.audio?.ui?.('cb_tick', 0.6);
    const p = G.local;
    if (p) G.combat?.words?.pop(o.reason === 'tear' ? 'Break free' : o.reason === 'pin' ? 'Throw it off' : 'Struggle', p.x, p.y + 2.7, p.z, 'ev bad', 1.1);
    return true;
  }

  private finish(win: boolean) {
    const c = this.cur!;
    c.done = true;
    const perfect = win && c.misses === 0 && c.t < c.dur * 0.62;
    this.last = { reason: c.reason, win, perfect, t: c.t };
    bus.emit('struggle', { reason: c.reason, win, perfect, cid: c.cid });
    G.camera?.pushIn?.(0, 0.4);
    if (this.listening) { window.removeEventListener('pointerdown', this.onTap, { capture: true }); window.removeEventListener('pointerup', this.onLift, true); this.listening = false; }
    this.cur = null;
    try { if (win) c.onWin(perfect); else c.onLose(); } catch (e) { console.error('struggle', e); }
  }

  /** abandon without a result (the survivor died, changed zone...) */
  cancel() { if (this.cur) { this.cur.done = true; this.cur = null; G.camera?.pushIn?.(0, 0.4); } }

  /** player strength in a struggle */
  private might(p: Player) {
    const b = p.body;
    let m = 1 + b.skill('strength') * 0.06 + (b.adrenaline > 0 ? 0.25 : 0) - (b.endurance < 0.2 ? 0.25 : 0) - Math.min(0.4, b.pain() / 250);
    try { m *= (G as any).cyber?.combat?.(G.local)?.dmgMul ? 1.25 : 1; } catch { /* no cyberware */ }
    return Math.max(0.5, m);
  }

  update(dt: number, marks: Marks, words: Words) {
    const c = this.cur;
    const p = G.local;
    if (!c || c.done || !p) { this.taps.length = 0; return; }
    if (p.body.dead || (c.act && (c.act.done || c.act.cancelled || (c.act as any).ripped))) { this.cancel(); return; }
    // the thing holding us is gone: free
    if (c.cid) { const k = G.creatures?.creatures?.get?.(c.cid); if (!k || k.dead) { this.finish(true); return; } }
    c.t += dt;
    const inp = G.input;
    const stage = c.stages[c.si];
    const m = this.might(p);
    const rt = { x: Math.cos(G.pr.yaw), z: -Math.sin(G.pr.yaw) };
    // input this frame
    let press = 0, left = 0, right = 0;
    if (inp.hit('shove')) press++;
    if (inp.mousePressed[0]) { press++; inp.mousePressed[0] = false; }
    if (inp.hit('left')) left++;
    if (inp.hit('right')) right++;
    if (this.taps.length) {
      const sp = G.pr.worldToScreen?.(p.pos);
      for (const tp of this.taps) { press++; if (sp) { if (tp.x < sp.x) left++; else right++; } }
      this.taps.length = 0;
    }
    c.pop = Math.max(0, c.pop - dt * 6);
    if (stage.kind === 'mash') {
      c.prog = Math.max(0, c.prog - dt * 0.3 * c.grip);
      // round 17 assist: hold instead of hammering (a steady strain, about six presses' worth a second)
      if (qteAssist().hold && (inp.down('shove') || inp.mouseDown[0] || this.touchDown)) {
        this.holdAcc += dt * 6.2;
        if (this.holdAcc >= 1) { this.holdAcc -= 1; press++; }
      }
      if (press) { c.prog += press * 0.095 * m; c.pop = 1; this.feel(p, 0.12); }
    } else if (stage.kind === 'alt') {
      c.prog = Math.max(0, c.prog - dt * 0.22 * c.grip);
      const hit = (side: 'L' | 'R') => {
        if (c.want === side) { c.prog += 0.13 * m; c.want = side === 'L' ? 'R' : 'L'; c.pop = 1; this.feel(p, 0.12); }
        else { c.prog = Math.max(0, c.prog - 0.05); G.audio?.ui?.('cb_miss', 0.3); }
      };
      for (let i = 0; i < left; i++) hit('L');
      for (let i = 0; i < right; i++) hit('R');
    } else {
      // timed: the ring closes on the mark; hit it inside the band
      const slow = qteAssist().slow;
      const period = Math.max(0.55, 0.95 - c.si * 0.12) * c.grip ** 0.3 * (slow ? 1.5 : 1);
      c.ring -= dt / period;
      const inBand = slow ? c.ring > 0.2 && c.ring < 0.5 : c.ring > 0.24 && c.ring < 0.46;
      if (press) {
        if (inBand) { c.hits++; c.prog = c.hits / stage.need; c.pop = 1; this.feel(p, 0.3); G.audio?.ui?.('cb_good', 0.6); hitstop(40); }
        else { c.misses++; c.prog = Math.max(0, c.prog - 0.2); G.audio?.ui?.('cb_miss', 0.5); shake(0.25, 0.2); }
        c.ring = 1.15;
      } else if (c.ring <= 0) { c.misses++; c.ring = 1.15; G.audio?.ui?.('cb_miss', 0.4); }
    }
    // heartbeat
    c.beat -= dt;
    if (c.beat <= 0) { c.beat = 0.42 - Math.min(0.2, c.t / c.dur * 0.2); G.audio?.ui?.('heartbeat', 0.5); shake(0.12, 0.15); }
    if (c.prog >= 1) {
      c.si++; c.prog = 0; c.hits = 0; c.ring = 1.15;
      if (c.si >= c.stages.length) { this.finish(true); return; }
      hitstop(60); punch(0.05, 0.2); G.audio?.ui?.('cb_good', 0.8);
    }
    if (c.t >= c.dur) { this.finish(false); return; }
    this.draw(p, c, marks, words, rt);
  }

  private feel(p: Player, k: number) {
    shake(0.1 + k, 0.12);
    G.audio?.at?.('cb_grunt', p.x, p.z, 0.35);
    if (p.isLocal) p.body.endurance = Math.max(0, p.body.endurance - 0.006);
  }

  private draw(p: Player, c: Cur, marks: Marks, words: Words, rt: { x: number; z: number }) {
    const touch = !!(G.systems.find((s) => s.name === 'touch') as any)?.active;
    const stage = c.stages[c.si];
    const now = performance.now() / 1000;
    const hx = p.x, hy = p.y + 2.0, hz = p.z;
    const pulse = 1 + c.pop * 0.25;
    const left = 1 - c.t / c.dur;
    // running out: the keys flush red on the beat
    const hurry = left < 0.3 && Math.sin(now * 20) > 0 ? 'hurry' : 'hot';
    const kn = (a: string) => (G.input.keyName(a as any) || '?').toUpperCase();
    // the struggle as a pressure gauge: the needle climbs into the red as you fight loose
    const fill = (c.si + Math.min(1, c.prog)) / c.stages.length;
    const tremble = Math.sin(now * 47) * 0.012 * c.grip;
    marks.mark(gaugeName(fill, fill > 0.78), hx + rt.x * tremble, hy + 0.55, hz + rt.z * tremble);
    if (stage.kind === 'mash') {
      const held = qteAssist().hold;
      words.prompt(touch ? (held ? 'Hold' : 'Tap') : kn('shove'), held ? 'hold it' : 'hammer it', hx, hy - 0.04 * c.pop, hz, hurry, pulse);
    } else if (stage.kind === 'alt') {
      for (const side of ['L', 'R'] as const) {
        const s = side === 'L' ? -1 : 1, on = c.want === side;
        const name = touch ? (side === 'L' ? '< Tap' : 'Tap >') : kn(side === 'L' ? 'left' : 'right');
        words.prompt(name, on ? 'rock it' : '', hx + rt.x * 0.6 * s, hy - (on ? 0.04 * c.pop : 0), hz + rt.z * 0.6 * s, on ? hurry : 'dim', on ? pulse : 0.9);
      }
    } else {
      const inBand = c.ring > 0.24 && c.ring < 0.46;
      marks.mark('target', hx, hy, hz);
      marks.mark('hoop', hx, hy, hz, { color: inBand ? 0xfff0d0 : 0xffffff, scale: Math.max(0.1, c.ring * 1.7) });
      words.prompt(touch ? 'Tap' : kn('shove'), 'on the mark', hx, hy - 0.62, hz, inBand ? 'go' : 'small', inBand ? 1.12 : 1);
      for (let i = 0; i < stage.need; i++) { const o = (i - (stage.need - 1) / 2) * 0.28; marks.mark(i < c.hits ? 'pip:on' : 'pip', hx + rt.x * o, hy + 0.98, hz + rt.z * o); }
    }
    // the time left is on the action plate over the head now (StruggleAction.barK), nothing on the floor
    // (round 15: no hazard sign over what has us: it is right there, on top of us)
  }
}

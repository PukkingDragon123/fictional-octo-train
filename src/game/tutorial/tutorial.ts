// The contract tutorial: Dr. Iris Calder's link training, right after the run
// intro (src/game/intro.ts). She talks you through the unit's body over the
// band, broadcast-style: a LIVE lesson card at the top of the screen, her
// voice on the wrist (src/game/handler.ts: a voice only, her waveform on the
// loop tracker's tube, src/game/loop/tracker.ts), one word hanging over
// whatever the lesson is about. The lessons that need the body keep the
// controls in your hands; the few that need to show you something are short
// cutscenes (letterbox, the iso camera framed, a cut to the unit's own eyes).
//
//   1 THE LEGS    walk                                         -> WALK
//   2 THE PACE    hold Shift (touch: RUN)                      -> RUN
//   3 LOW         C / Ctrl (touch: SNEAK)                      -> CROUCH
//   4 THE HANDS   a piece of furniture lit, her eyes on it     -> GET A GRIP (right button held / G)
//   5 THE PRESS   a pan to the Remittance Press                -> TO THE PRESS, FEED IT (E)
//                 the band: the number going down, the installment, the watch, the way deeper
//   6 THE LINK    she slips the link on purpose                -> RESYNC (L, or tap the status line)
//   7 DATA        terminals, drives, the inhabitants; the job, once more, plainly
//
// The job is whole furniture: things down here are hard to break, so you get
// hold of a piece, carry it to the press and feed it in (src/world/pushDrag.ts).
// Runs once per contract (flag 'tut:done'), only for the host / solo with the
// contract on (never free survival or a co-op joiner). Esc (or the plate, or
// pad Start) skips the rest. ?quick runs keep the handler's soft guide;
// ?tutorial=1 forces it on a quick start (dev).
//
//   tutorialWanted(), startTutorial(g), tutorialRunning()
import * as THREE from 'three';
import { G } from '../G';
import type { Game, GameSystem } from '../game';
import type { Action } from '../../core/input';
import type { Player } from '../../entities/player';
import type { TileObject } from '../../world/zone';
import { bus } from '../../core/events';
import { objDef } from '../../world/objects';
import { eyeEnter, eyeExit, eyeActive } from '../../fp/eye';
import { floatQuiet } from '../../social/floatText';
import { skipPlate, pollPadSkip, type SkipPlate } from '../introKit/skip';
import { readTime } from '../lines';
import { TUT } from './state';
import '../intro.css';

type Step = 'walk' | 'run' | 'crouch' | 'brief' | 'grip' | 'press' | 'carry' | 'feed' | 'debt' | 'link' | 'data' | 'done';
interface Beat { dur: number; enter?: () => void; tick?: (k: number, dt: number) => void; voss?: boolean }
interface PushApi {
  holding?: unknown; mode?: string; st?: { o?: TileObject } | null;
  liftable?: (p: Player, o: TileObject, power?: boolean) => boolean;
  carryInfo?: () => { mass: number; tier: number; name: string; nearPress: boolean } | null;
}

const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const v1 = new THREE.Vector3();
const push = () => (G as unknown as { destruct?: { push?: PushApi } }).destruct?.push ?? null;
const isTouch = () => document.documentElement.classList.contains('nc-touch') || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
const LESSONS = 7;

let running: Tutorial | null = null;
export function tutorialRunning(): boolean { return !!running; }

/** should a contract run get the staged tutorial now */
export function tutorialWanted(g: Game = G as unknown as Game): boolean {
  const m = (g as unknown as { missions?: { enabled?: boolean; flags?: Set<string> } }).missions;
  if (!m || m.enabled === false) return false;
  if (m.flags?.has('tut:done') || m.flags?.has('contract:first_deposit')) return false;
  const net = (g as unknown as { net?: { mode?: string; isClient?: boolean } }).net;
  if (net?.isClient || net?.mode === 'client') return false;
  return !!g.local;
}

export function startTutorial(g: Game = G as unknown as Game): Tutorial | null {
  if (running || !tutorialWanted(g)) return null;
  const t = new Tutorial(g);
  g.addSystem(t);
  if (import.meta.env.DEV) (window as unknown as { __tut: Tutorial }).__tut = t;
  return t;
}

const CSS = `
.tut-root { position: fixed; inset: 0; pointer-events: none; z-index: 170; font-family: var(--font-new); }
.tut-root .ix-bar { height: 0; }
.tut-root.cine .ix-bar { height: 11vh; }
.tut-shade { position: absolute; inset: 0; background: #000; opacity: 0; }
.tut-obj { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; opacity: 0; transition: opacity .35s; }
.tut-obj.on { opacity: 1; }
.tut-obj b { display: block; font-weight: 400; font-size: 32px; line-height: 32px; color: #ffe7a8; text-shadow: var(--text-ink); letter-spacing: 1px; }
.tut-obj i { display: block; font-style: normal; font-size: 16px; line-height: 16px; color: #e8eef4; text-shadow: var(--text-ink); margin-top: 4px; }
.tut-obj .arrow { display: block; font-size: 16px; color: #ffe7a8; text-shadow: var(--text-ink); animation: tut-bob .9s steps(3) infinite; }
@keyframes tut-bob { 50% { transform: translateY(4px); } }
.tut-count { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; opacity: 0; transition: opacity .3s; }
.tut-count.on { opacity: 1; }
.tut-count small { display: block; font-size: 16px; line-height: 16px; color: #ffb45a; text-shadow: var(--text-ink); }
.tut-count b { display: block; font-weight: 400; font-size: 48px; line-height: 48px; color: #ffd890; text-shadow: var(--text-ink); }
.tut-count em { display: block; font-style: normal; font-size: 32px; line-height: 32px; color: #9cff8a; text-shadow: var(--text-ink); }
.tut-recap { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; opacity: 0; transition: opacity .5s; width: min(92vw, 960px); }
.tut-recap.on { opacity: 1; }
.tut-recap h2 { font-weight: 400; font-size: 32px; line-height: 32px; margin: 0 0 16px; color: #8fd8ff; text-shadow: var(--text-ink); }
.tut-recap .loop { font-size: 32px; line-height: 48px; color: #fff2c8; text-shadow: var(--text-ink); }
.tut-recap .loop span { color: #8fd8ff; }
.tut-recap p { font-size: 16px; line-height: 16px; margin: 12px 0 0; color: #e8eef4; text-shadow: var(--text-ink); }
.tut-recap p b { font-weight: 400; color: #8fd8ff; margin-right: 8px; }
.tut-recap p i { font-style: normal; color: #ffd890; }
/* the broadcast: Dr. Calder's lesson card, top of the screen */
.tut-cast { position: absolute; left: 50%; top: calc(64px + env(safe-area-inset-top)); transform: translate(-50%, -8px); text-align: center; white-space: nowrap; opacity: 0; transition: opacity .4s, transform .4s; }
.tut-cast.on { opacity: 1; transform: translate(-50%, 0); }
.tut-root.cine .tut-cast { opacity: 0; }
/* (on narrower screens the lesson card drops below the loop tracker at the top right, src/game/loop/tracker.ts) */
@media (max-width: 1200px) { .tut-cast { top: calc(124px + env(safe-area-inset-top)); } }
.tut-cast small { display: block; font-size: 16px; line-height: 16px; letter-spacing: 2px; color: #8fd8ff; text-shadow: var(--text-ink); }
.tut-cast small u { text-decoration: none; color: #ff5a4a; animation: tut-live 1.4s steps(2) infinite; }
@keyframes tut-live { 50% { opacity: .25; } }
.tut-cast b { display: block; font-weight: 400; font-size: 32px; line-height: 32px; margin-top: 8px; color: #fff2c8; text-shadow: var(--text-ink); letter-spacing: 1px; }
.tut-cast i { display: block; font-style: normal; font-size: 16px; line-height: 16px; margin-top: 8px; color: #ffe7a8; text-shadow: var(--text-ink); }
.tut-cast i kbd { font: inherit; padding: 0 4px; border: 2px solid #ffe7a8; margin: 0 2px; }
@media (max-width: 600px) { .tut-recap .loop { font-size: 16px; line-height: 32px; } .tut-obj b, .tut-cast b { font-size: 16px; line-height: 16px; } .tut-count b { font-size: 32px; line-height: 32px; } .tut-count em { font-size: 16px; line-height: 16px; } }
`;

export class Tutorial implements GameSystem {
  name = 'tutorial';
  step: Step = 'walk';
  /** seconds in this step */
  t = 0;
  private beats: Beat[] = [];
  private beatT = 0;
  private beatOn = false;
  private cine = false;
  // the iso camera, framed
  private camOn = false; private camFocus = new THREE.Vector3(); private camGoal = new THREE.Vector3(); private camZoom = 1; private camZoomGoal = 1; private camRate = 2;
  // what the lesson is about
  private target: { x: number; z: number; y: number } | null = null;
  private targetObj: TileObject | null = null;
  private refused = new Set<number>();
  private hopper: { x: number; z: number; o: TileObject } | null = null;
  private owedFrom = 0; private owedTo = 0; private paid = 0;
  private bareT = 0;
  private walked = 0; private held = 0; private dropT = 0; private fed = false; private saidHeavy = false; private slipped = false;
  private touch = isTouch();
  private offs: (() => void)[] = [];
  private lockOffs: (() => void)[] = [];
  // dom
  private root: HTMLDivElement; private shade: HTMLDivElement; private obj: HTMLDivElement; private count: HTMLDivElement; private recap: HTMLDivElement; private cast: HTMLDivElement;
  private plate: SkipPlate;
  private shadeA = 0; private shadeGoal = 0;
  private objAt: (() => THREE.Vector3 | null) | null = null;
  private countAt: (() => THREE.Vector3 | null) | null = null;
  private watchUp = false;
  private quietHeld = false;

  constructor(public g: Game) {
    running = this;
    TUT.running = true; TUT.step = 'walk'; TUT.target = -1;
    if (!document.getElementById('tut-css')) { const st = document.createElement('style'); st.id = 'tut-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = (cls: string, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; return e; };
    this.root = el('tut-root');
    this.shade = el('tut-shade');
    this.obj = el('tut-obj');
    this.count = el('tut-count');
    this.recap = el('tut-recap');
    this.cast = el('tut-cast');
    this.plate = skipPlate(() => this.skip(), 'Skip lessons');
    this.plate.setKey(this.touch ? '' : 'Esc');
    this.plate.el.classList.add('on');
    this.root.append(el('ix-bar top'), el('ix-bar bot'), this.shade, this.cast, this.obj, this.count, this.recap, this.plate.el);
    document.body.appendChild(this.root);
    floatQuiet(true); this.quietHeld = true;
    // the handler's soft guide stands down: she runs the lessons from here
    const h = G.handler as unknown as { briefed?: boolean; cine?: boolean; hush?: () => void } | null;
    if (h) { h.briefed = true; h.hush?.(); }
    const on = (ev: string, fn: (...a: any[]) => void) => this.offs.push(bus.on(ev, fn));
    on('grabbed', (p: Player, o: TileObject, mode: string) => { if (p === G.local) this.onGrab(o, mode); });
    on('carryFed', (p: Player) => { if (p === G.local) { this.fed = true; this.t = 0; this.setObjective(null); G.handler?.guide?.(null); } });
    on('deposited', (d: { by: string; value: number }) => {
      if (d?.by !== G.local?.id) return;
      if (['grip', 'carry', 'feed', 'press'].includes(this.step)) { this.paid = d.value; this.go(this.hopper ? 'debt' : 'link'); }
    });
    // Esc skips (only while no menu or reader is up); the controls stay the player's
    const inp = g.input as unknown as { hit: (a: Action) => boolean };
    const own = Object.prototype.hasOwnProperty.call(inp, 'hit') ? inp.hit : undefined;
    const orig = inp.hit.bind(inp);
    inp.hit = (a: Action) => {
      const v = orig(a);
      if (a === 'pause' && v && !this.cine) {
        const ui = g.ui as unknown as { menuEl?: unknown; readerEl?: unknown; modal?: unknown; inventory?: { open?: boolean } } | undefined;
        if (!(ui?.menuEl || ui?.readerEl || ui?.modal || ui?.inventory?.open || (G as unknown as { watch?: { open?: boolean } }).watch?.open)) { this.skip(); return false; }
      }
      return v;
    };
    this.offs.push(() => { if (own) inp.hit = own; else delete (inp as { hit?: unknown }).hit; });
    this.go('walk');
  }

  // ================================================================== steps
  private go(step: Step) {
    this.step = step; this.t = 0;
    TUT.step = step;
    this.setObjective(null);
    const h = G.handler;
    const T = this.touch;
    switch (step) {
      case 'walk':
        this.release();
        this.lesson(1, 'THE LEGS', T ? 'the stick, bottom left' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>');
        this.say(T ? 'Lesson one, the legs. The stick on the left walks it. Small steps, it is still finding its feet.' : 'Lesson one, the legs. W, A, S and D walk it. Small steps, it is still finding its feet.');
        break;
      case 'run':
        this.lesson(2, 'THE PACE', T ? 'tap <kbd>RUN</kbd>' : 'hold <kbd>Shift</kbd>');
        this.say(T ? 'Good. Tap RUN and it runs. Running spends breath: the lungs on the machine will tell you when to stop.' : 'Good. Hold Shift and it runs. Running spends breath: the lungs on the machine will tell you when to stop.');
        break;
      case 'crouch':
        this.lesson(3, 'LOW', T ? 'tap <kbd>SNEAK</kbd>' : '<kbd>C</kbd> or <kbd>Ctrl</kbd>');
        this.say(T ? 'Now get it low. SNEAK. Slower, quieter. Most inhabitants hunt by ear.' : 'Now get it low. C, or Control. Slower, quieter. Most inhabitants hunt by ear.');
        break;
      case 'brief': if (G.local) G.local.sneaking = false; this.findTarget(); this.findHopper(); this.cut(this.briefBeats()); break;
      case 'grip':
        this.release();
        this.lesson(4, 'THE HANDS', T ? 'tap it, then <kbd>CARRY</kbd>' : 'hold the <kbd>right button</kbd> on it, or <kbd>G</kbd>');
        if (this.target) h?.guide?.(this.target);
        break;
      case 'press': this.cut(this.pressBeats()); break;
      case 'carry':
        this.release();
        this.lesson(5, 'THE PRESS', 'walk it over. Heavy loads are slow');
        if (this.hopper) h?.guide?.(this.hopper);
        break;
      case 'feed':
        this.lesson(5, 'THE PRESS', T ? 'tap <kbd>FEED</kbd>' : '<kbd>E</kbd> next to the plate');
        h?.guide?.(null);
        break;
      case 'debt': this.cut(this.debtBeats()); break;
      case 'link':
        this.release();
        this.slipped = false;
        this.lesson(6, 'THE LINK', T ? 'tap the <kbd>LINK</kbd> line' : '<kbd>L</kbd> resyncs');
        this.say('Lesson six, and you will hate it. Your fear runs down the wire. When the brain on the machine cracks, the unit lags, drifts, does things on its own.');
        this.say('I am going to slip the link now. On purpose. Resync it.');
        break;
      case 'data': this.cut(this.dataBeats()); break;
      case 'done': this.finish(); break;
    }
  }

  private briefBeats(): Beat[] {
    const p = G.local!, tg = this.target;
    const h = G.handler;
    return [
      { dur: 0.1, enter: () => { this.lesson(4, 'THE HANDS', ''); this.frame(v1.set(p.x, p.y + 0.6, p.z), 1.0, 8); } },
      // up over the room: the unit small in it, the furniture around it
      { dur: 3.2, voss: true, enter: () => { this.frame(v1.set(p.x, p.y + 0.4, p.z), 0.72, 0.9); G.camera?.orbitBy?.(14 * DEG, 0); this.say('Lesson four, the hands. This is the job, {n}. The Institute collects furniture. Whole. It is all built to last down here.'); } },
      // push on the piece it is going to carry, lit
      { dur: 2.8, voss: true, enter: () => { if (tg) { this.frame(v1.set(tg.x, tg.y + 0.5, tg.z), 1.7, 1.6); h?.point?.(tg.x, tg.z); } this.say(tg ? 'That one. Light enough for a new body.' : 'Find something the unit can lift.', tg ?? undefined); } },
      // its own eyes on it
      { dur: 2.6, voss: true, enter: () => { if (tg) this.eyeOn(tg, 10); this.say(this.touch ? 'Walk up to it, tap it, then CARRY. Lift with the legs.' : 'Walk up to it and hold the right button on it. Or press G. Lift with the legs.'); } },
      { dur: 0.3, enter: () => this.eyeOff() },
    ];
  }

  private pressBeats(): Beat[] {
    const p = G.local!;
    this.findHopper();
    const hp = this.hopper;
    return [
      { dur: 0.1, enter: () => { this.lesson(5, 'THE PRESS', ''); this.frame(v1.set(p.x, p.y + 0.5, p.z), 1.4, 6); } },
      // a pan from the unit to the press, the press lit, Calder at its projector
      { dur: 3.4, voss: true, enter: () => { if (hp) this.frame(v1.set(hp.x, p.y + 0.6, hp.z), 1.5, 1.0); this.say('Got it. Good. That is a Remittance Press. It eats what you feed it and pays the unit\'s number down.'); } },
      { dur: 2.6, voss: true, enter: () => { this.say(this.touch ? 'Carry it over. Next to the plate, tap FEED.' : 'Carry it over. Next to the plate, press E and it goes in.'); } },
    ];
  }

  private debtBeats(): Beat[] {
    const p = G.local!;
    const d = () => (G as unknown as { debt?: { state?: () => { owed: number; paid: number; due: number; dueDay: number; remaining: number; dueH?: number; count?: number; n?: number } } }).debt?.state?.();
    const st0 = d();
    this.owedTo = st0?.remaining ?? 0;
    this.owedFrom = this.owedTo + Math.max(0, this.paid);
    const wrist = () => v1.set(p.x + Math.cos(p.facing + Math.PI / 2) * 0.3, p.y + 1.15, p.z + Math.sin(p.facing + Math.PI / 2) * 0.3);
    const exit = this.findExit();
    return [
      // the press does its work
      { dur: 1.8, enter: () => { G.handler?.guide?.(null); this.lock(true); } },
      // the push on the band: the number counts down
      { dur: 3.6, voss: true, enter: () => { this.frame(v1.set(p.x, p.y + 0.9, p.z), 3.0, 1.3); this.counter(wrist); this.say('Hear that? The unit\'s number went down. That is the whole job.'); },
        tick: (k) => { const n = this.owedFrom + (this.owedTo - this.owedFrom) * ease(clamp01((k - 0.12) / 0.55)); this.setCount('OWED', fmt(n) + ' SCRIP', this.paid > 0 ? '-' + fmt(this.paid) : ''); if (k > 0.12 && k < 0.7 && Math.random() < 0.25) G.audio?.ui?.('watchTick', 0.25); } },
      // the installment and its deadline
      { dur: 4.2, voss: true, enter: () => { const s = d(); this.setCount(`INSTALLMENT ${(s?.n ?? 0) + 1} OF ${s?.count ?? 5}`, fmt(s?.due ?? 0) + ' DUE', `BY DAY ${s?.dueDay ?? 3}`); this.say('The ledger wants an installment every few days. Miss one and the band bites. I do not enjoy that part. Much.'); },
        tick: () => { const s = d(); if (s?.dueH != null) this.setCount(`INSTALLMENT ${(s.n ?? 0) + 1} OF ${s.count ?? 5}`, fmt(s.due) + ' DUE', `DAY ${s.dueDay} - ${Math.max(0, Math.floor(s.dueH))} H LEFT`); } },
      // the watch on the same wrist: the job board (TAB raises it)
      { dur: 4.4, voss: true, enter: () => { this.frame(v1.set(p.x, p.y + 1.0, p.z), 3.4, 1.6); this.setCount(this.touch ? 'THE WATCH' : 'THE WATCH  -  TAB', 'JOBS', 'PAY RESEARCH CREDIT'); this.say('Your watch. My jobs come through it, and they pay research credit: spend it on what the watch can do.'); } },
      { dur: 0.3, enter: () => this.counter(null) },
      // the way deeper
      { dur: 3.6, voss: true, enter: () => { this.camOn = true; if (exit) this.frame(v1.set(exit.x, p.y + 0.5, exit.z), 1.2, 0.9); else this.frame(v1.set(p.x, p.y + 0.5, p.z), 0.8, 1); this.say('Clear the debt and the unit buys passage out at the depot. The deeper rooms pay better. They also bite.', exit ?? undefined); } },
    ];
  }

  /** the last lesson, and the job once more, plainly */
  private dataBeats(): Beat[] {
    const p = G.local!;
    return [
      { dur: 0.1, enter: () => { this.lesson(7, 'DATA', ''); this.frame(v1.set(p.x, p.y + 0.5, p.z), 1.0, 3); } },
      { dur: 3.4, voss: true, enter: () => this.say('Last lesson. Data. Terminals, drives, journals: whatever remembers what happened here, read it. That pays me.') },
      { dur: 3.4, voss: true, enter: () => this.say(this.touch ? 'And the inhabitants. They are organisms, not ghosts. Point the watch at one and scan it. From a distance, please.' : 'And the inhabitants. They are organisms, not ghosts. Hold N on one and the watch scans it. From a distance, please.') },
      { dur: 7.2, enter: () => { this.frame(v1.set(p.x, p.y + 0.5, p.z), 1.1, 1.2); this.showRecap(true); G.audio?.ui?.('watchUp', 0.3); } },
      { dur: 0.6, enter: () => this.showRecap(false) },
      { dur: 2.6, voss: true, enter: () => this.say('That is the training. The next step is always written top right, and I will name it. Stand up straight, {n}. Somebody is always watching.') },
    ];
  }

  // ================================================================== per frame
  update(dt: number) {
    if (this.step === 'done') return;
    this.t += dt;
    const p = G.local;
    if (!p) return;
    // pad Start skips
    const pad = pollPadSkip(); if (pad === 'skip') { this.skip(); return; } else if (pad === 'wake') this.plate.el.classList.add('hot');
    // the cutscene's beats
    if (this.cine && this.beats.length) {
      const b = this.beats[0];
      if (!this.beatOn) { this.beatOn = true; this.beatT = 0; b.enter?.(); }
      this.beatT += dt;
      b.tick?.(this.beatT / b.dur, dt);
      const h = G.handler;
      const waitVoss = b.voss && h?.busy && this.beatT < b.dur + 2.5;
      if (this.beatT >= b.dur && !waitVoss) { this.beats.shift(); this.beatOn = false; if (!this.beats.length) this.cutDone(); }
    }
    const h = G.handler;
    const talking = !!h?.busy;
    const head = () => v1.set(p.x, p.y + 2.3, p.z);
    const ci = push()?.carryInfo?.() ?? null;
    switch (this.step) {
      case 'walk': {
        if (p.speed > 0.6) this.walked += p.speed * dt;
        this.setObjective('WALK', '', head);
        if ((this.walked > 5 || G.missions?.flags?.has?.('tut:walk')) && this.t > 2.5 && !talking) this.go('run');
        else if (this.t > 45) this.go('run');
        break;
      }
      case 'run': {
        if (p.running && p.speed > 2.4) this.held += dt; else this.held = Math.max(0, this.held - dt * 0.5);
        this.setObjective('RUN', '', head);
        if ((this.held > 0.9 && this.t > 1.5 && !talking) || this.t > 35) { this.held = 0; this.go('crouch'); }
        break;
      }
      case 'crouch': {
        if (p.sneaking) this.held += dt;
        this.setObjective('CROUCH', '', head);
        if ((this.held > 0.6 && this.t > 1.5 && !talking) || this.t > 35) { this.held = 0; this.go('brief'); }
        break;
      }
      case 'grip': {
        if (ci) { if (!this.hopper) this.findHopper(); this.go(this.hopper ? 'press' : 'link'); break; }
        const o = this.targetObj;
        // nothing liftable anywhere near (a bare room, everything already pressed): on to the next lesson, never a dead end
        this.bareT = this.target ? 0 : this.bareT + dt;
        if (this.bareT > 20) { this.bareT = 0; this.say('Nothing here the unit can lift. We will come back to the press. Next lesson.'); this.go('link'); break; }
        if (!o || !this.alive(o) || this.t > 60) { this.findTarget(); this.t = Math.min(this.t, 1); if (this.target) h?.guide?.(this.target); }
        this.setObjective('GET A GRIP', this.targetName(), () => (this.target ? v1.set(this.target.x, this.target.y + 1.4, this.target.z) : null));
        this.light(this.target, 0xffe2b0);
        break;
      }
      case 'carry': case 'feed': {
        const hp = this.hopper;
        if (!hp) { this.findHopper(); if (!this.hopper && this.t > 2) this.go('link'); break; }
        if (G.missions?.flags?.has?.('contract:first_deposit') && this.t > 0.5 && !this.fed) { this.go('debt'); break; }
        // fed: the ram comes down; the deposit moves the lesson on (or this, if the press is jammed)
        if (this.fed) { if (this.t > 8) this.go('debt'); break; }
        if (!ci) {
          // put down or dropped: pick it back up
          this.dropT += dt;
          if (this.dropT > 0.8) {
            this.locateTarget();
            if (this.step === 'feed') this.go('carry');
            this.setObjective('PICK IT BACK UP', this.touch ? 'tap it, then CARRY' : 'right button on it, or G', () => (this.target ? v1.set(this.target.x, this.target.y + 1.4, this.target.z) : null));
            this.light(this.target, 0xffe2b0);
          }
          break;
        }
        this.dropT = 0;
        if (ci.nearPress && this.step === 'carry') this.go('feed');
        else if (!ci.nearPress && this.step === 'feed' && this.t > 0.6) this.go('carry');
        if (this.step === 'feed') this.setObjective('FEED IT', this.touch ? 'tap FEED' : 'press E', () => v1.set(hp.x, p.y + 1.8, hp.z));
        else this.setObjective('TO THE PRESS', ci.tier >= 2 ? 'heavy: slow and steady' : '', () => v1.set(hp.x, p.y + 1.8, hp.z));
        this.light({ x: hp.x, z: hp.z, y: p.y }, 0xffd9a0);
        break;
      }
      case 'link': {
        const L = (G as unknown as { link?: { force?: (k: string) => void; state?: string } }).link;
        if (!L) { this.go('data'); break; }
        if (!this.slipped && this.t > 2 && !talking) { this.slipped = true; this.t = 0; try { L.force?.('desync'); } catch (e) { console.warn('link lesson', e); } }
        if (this.slipped) {
          if (L.state === 'desync') this.setObjective('RESYNC', this.touch ? 'tap LINK DESYNC' : 'press L', head);
          else this.setObjective(null);
          if ((L.state === 'ok' && this.t > 0.5) || this.t > 50) { if (L.state === 'ok') this.say('Locked. Good hands. Keep the unit calm and it will not happen often.'); this.go('data'); }
        }
        break;
      }
    }
    this.paint(dt);
  }
  /** the unit got hold of something */
  private onGrab(o: TileObject, mode: string) {
    if (this.step !== 'grip' && this.step !== 'carry' && this.step !== 'feed') return;
    if (mode === 'carry') { this.targetObj = o; TUT.target = o.uid; return; }
    // pushing: too heavy to lift
    this.refused.add(o.uid);
    if (!this.saidHeavy) { this.saidHeavy = true; this.say(this.touch ? 'Too heavy to lift. That one you push. Let go and find something lighter: I have lit one.' : 'Too heavy to lift. That one you push. Let go, E, and find something lighter: I have lit one.'); }
    if (this.step === 'grip') { this.findTarget(); if (this.target) G.handler?.guide?.(this.target); }
  }

  // ================================================================== cutscenes
  private cut(beats: Beat[]) {
    this.beats = beats; this.beatOn = false;
    this.cine = true;
    this.root.classList.add('cine');
    this.plate.el.classList.add('on');
    this.lock(true);
    const h = G.handler as unknown as { cine?: boolean } | null;
    if (h) h.cine = true;
    this.hookCamera();
  }
  private cutDone() {
    const next: Record<string, Step> = { brief: 'grip', press: 'carry', debt: 'link', data: 'done' };
    const n = next[this.step];
    if (n) this.go(n);
  }
  /** control back, the picture back to the game's */
  private release() {
    this.cine = false;
    this.beats = [];
    this.root.classList.remove('cine');
    this.plate.el.classList.remove('hot');
    this.eyeOff();
    this.watch(false);
    this.counter(null);
    this.camOn = false;
    G.camera?.pushIn?.(0, 0.6);
    this.lock(false);
    const h = G.handler as unknown as { cine?: boolean } | null;
    if (h) h.cine = false;
  }
  /** her line (through the cutscene's door in the handler) */
  private say(text: string, point?: { x: number; z: number }, pylon = false) {
    // first in the queue when she is quiet; after her last line when she is mid-sentence (keeps the order)
    G.handler?.say?.(text, { cine: true, pri: G.handler?.busy ? 1 : 3, point, pylon, dur: readTime(text) * 0.9 });
  }

  // ------------------------------------------------------------------ controls
  private lock(on: boolean) {
    if (on) {
      if (this.lockOffs.length) return;
      const g = this.g, inp = g.input as unknown as { hit: (a: Action) => boolean };
      const own = Object.prototype.hasOwnProperty.call(inp, 'hit');
      const prev = own ? inp.hit : undefined;
      const orig = inp.hit.bind(inp);
      inp.hit = (a: Action) => {
        if (a === 'pause') {
          const v = orig(a);
          const ui = g.ui as unknown as { menuEl?: unknown; readerEl?: unknown; modal?: unknown } | undefined;
          if (v && !(ui?.menuEl || ui?.readerEl || ui?.modal)) { this.skip(); return false; }
          return v;
        }
        return false;
      };
      this.lockOffs.push(() => { if (prev) inp.hit = prev; else delete (inp as { hit?: unknown }).hit; });
      const attractWas = g.attract;
      g.attract = () => { const p = G.local; if (p) { p.vx *= 0.8; p.vz *= 0.8; } };
      this.lockOffs.push(() => { g.attract = attractWas; });
      const ui = g.ui as unknown as { onWorldClick?: unknown; onInteractKey?: unknown } | undefined;
      if (ui) {
        const click = ui.onWorldClick, key = ui.onInteractKey;
        ui.onWorldClick = () => { /* locked */ }; ui.onInteractKey = () => { /* locked */ };
        this.lockOffs.push(() => { ui.onWorldClick = click; ui.onInteractKey = key; });
      }
      const tap = (e: PointerEvent) => { if (this.plate.el.contains(e.target as Node)) return; this.plate.el.classList.add('hot'); };
      window.addEventListener('pointerdown', tap, true);
      this.lockOffs.push(() => window.removeEventListener('pointerdown', tap, true));
      (g as unknown as { touch?: { setHidden?: (v: boolean) => void } }).touch?.setHidden?.(true);
      this.lockOffs.push(() => (g as unknown as { touch?: { setHidden?: (v: boolean) => void } }).touch?.setHidden?.(false));
    } else for (const f of this.lockOffs.splice(0).reverse()) { try { f(); } catch (e) { console.error(e); } }
  }

  // ------------------------------------------------------------------ the camera
  private camHooked = false;
  private hookCamera() {
    if (this.camHooked) return;
    this.camHooked = true;
    const cam = this.g.camera as unknown as { update: (dt: number) => void };
    const own = Object.prototype.hasOwnProperty.call(cam, 'update') ? cam.update : null;
    const orig = cam.update.bind(cam);
    const pr = this.g.pr;
    const p = G.local!;
    this.camFocus.set(p.x, p.y + 0.6, p.z); this.camZoom = 1;
    const fn = (dt: number) => {
      orig(dt);
      if (!this.camOn || eyeActive()) return;
      const k = 1 - Math.exp(-dt * this.camRate);
      this.camFocus.lerp(this.camGoal, k);
      this.camZoom += (this.camZoomGoal - this.camZoom) * k;
      pr.target.copy(this.camFocus);
      pr.pxSize = pr.pxSize / Math.max(0.3, this.camZoom);
      pr.updateCamera(0);
    };
    cam.update = fn;
    this.offs.push(() => { if (cam.update !== fn) return; if (own) cam.update = own; else delete (cam as { update?: unknown }).update; });
  }
  private frame(focus: THREE.Vector3, zoom: number, rate = 2) {
    if (!this.camOn) { const p = G.local!; this.camFocus.set(p.x, p.y + 0.6, p.z); this.camZoom = 1; }
    this.camOn = true; this.camGoal.copy(focus); this.camZoomGoal = zoom; this.camRate = rate;
  }
  /** a cut to the unit's own eyes, looking at a spot (a dip to black covers it) */
  private eyeOn(at: { x: number; z: number; y: number }, pitchDeg: number, h = 0.4) {
    const p = G.local!;
    const d = Math.hypot(at.x - p.x, at.z - p.z);
    // only when it is close and in sight: never a first-person shot of a wall
    if (d > 6.5 || d < 0.3 || (G.view?.vis && !G.view.vis.isVisible(Math.floor(at.x), Math.floor(at.z)))) return false;
    const pitch = Math.max(4, Math.min(55, Math.atan2(p.y + 1.6 - (at.y + h), d) / DEG));
    void pitchDeg;
    this.dip(() => {
      p.facing = Math.atan2(at.z - p.z, at.x - p.x);
      eyeEnter({ pitchDeg: pitch, fov: 56 });
    });
    return true;
  }
  private eyeOff() { if (eyeActive()) this.dip(() => eyeExit()); }
  private dipFn: (() => void) | null = null;
  private dip(mid: () => void) { this.shadeGoal = 1; this.dipFn = mid; }
  private watch(on: boolean) {
    const w = (G as unknown as { watch?: { toggle?: (v: boolean, page?: string) => void; open?: boolean } }).watch;
    if (on === this.watchUp) return;
    this.watchUp = on;
    try { w?.toggle?.(on, on ? 'qst' : undefined); } catch { /* no watch */ }
  }

  // ------------------------------------------------------------------ world queries
  private alive(o: TileObject) { const z = G.view?.zone; return !!z?.objects.get(o.uid); }
  /** the nearest piece of furniture the unit can lift whole: the lesson's target */
  private findTarget() {
    const p = G.local; const z = G.view?.zone; if (!p || !z) return;
    const pu = push();
    let best: TileObject | null = null, bs = 1e9;
    for (const o of z.objects.values()) {
      const d = objDef(o.key);
      if (!d || d.ceiling || d.onWall || o.key === 'hopper' || this.refused.has(o.uid)) continue;
      if (pu?.liftable ? !pu.liftable(p, o) : !d.movable) continue;
      const dist = Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.z);
      if (dist < 1.2 || dist > 18) continue;
      if (G.view?.vis && !G.view.vis.isVisible(o.x, o.y) && dist > 4) continue;
      // something with a bit of heft reads as furniture (a chair, a cabinet), not a cup
      const m = (d as { mass?: number }).mass ?? 20;
      const s = dist + (m < 8 ? 4 : 0);
      if (s < bs) { bs = s; best = o; }
    }
    this.targetObj = best;
    TUT.target = best ? best.uid : -1;
    this.locateTarget();
  }
  /** where the target stands now (it moves: carried, set down, dropped) */
  private locateTarget() {
    const z = G.view?.zone, o0 = this.targetObj;
    const o = o0 && z ? z.objects.get(o0.uid) ?? null : null;
    if (!o || !z) { if (o0 && !o) this.findTarget(); else this.target = null; return; }
    this.targetObj = o;
    const d = objDef(o.key)!;
    const w = d.w ?? 1, dd = d.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    this.target = { x: o.x + rw / 2, z: o.y + rd / 2, y: z.heightAt(o.x, o.y) };
  }
  private targetName() { const o = this.targetObj; if (!o) return 'a piece of furniture'; const n = objDef(o.key)?.name || 'that'; return 'the ' + n.toLowerCase(); }
  private findHopper() {
    const h = G.handler as unknown as { nearestHopperObj?: () => TileObject | null; nearestHopper?: () => { x: number; z: number } | null } | null;
    const o = h?.nearestHopperObj?.(), c = h?.nearestHopper?.();
    this.hopper = o && c ? { x: c.x, z: c.z, o } : null;
  }
  /** a way out of this room toward deeper places (not the Seam) */
  private findExit(): { x: number; z: number } | null {
    const p = G.local, z = G.view?.zone; if (!p || !z) return null;
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const pt of z.portals) {
      if (pt.hidden || pt.kind === 'loop' || pt.kind === 'walk') continue;
      const d = Math.hypot(pt.x + 0.5 - p.x, pt.y + 0.5 - p.z);
      if (d < bd && d < 40) { bd = d; best = { x: pt.x + 0.5, z: pt.y + 0.5 }; }
    }
    return best;
  }
  private light(at: { x: number; z: number; y: number } | null, col: number) {
    if (!at) return;
    const k = 0.9 + 0.25 * Math.sin(G.time * 3.2);
    (G as unknown as { pointLight?: (x: number, y: number, z: number, c: number, i: number, d: number) => void }).pointLight?.(at.x, at.y + 1.6, at.z, col, 1.6 * k, 4.5);
  }

  // ------------------------------------------------------------------ dom
  private objKey = '';
  private setObjective(word: string | null, hint = '', at: (() => THREE.Vector3 | null) | null = null) {
    const key = word ? word + '|' + hint : '';
    this.objAt = at;
    if (key === this.objKey) return;
    this.objKey = key;
    if (!word) { this.obj.classList.remove('on'); this.obj.style.visibility = 'hidden'; return; }
    this.obj.style.visibility = '';
    this.obj.innerHTML = `<b>${word}</b>${hint ? `<i>${hint}</i>` : ''}<span class="arrow">v</span>`;
    this.obj.classList.add('on');
    G.audio?.ui?.('watchTick', 0.35);
  }
  /** the broadcast's lesson card */
  private castKey = '';
  private lesson(n: number, title: string, keys: string) {
    const key = n + title + keys;
    if (key === this.castKey) return;
    this.castKey = key;
    this.cast.innerHTML = `<small><u>&#9679;</u> LIVE · DR. I. CALDER · LINK TRAINING ${n}/${LESSONS}</small><b>${title}</b>${keys ? `<i>${keys}</i>` : ''}`;
    this.cast.classList.add('on');
  }
  private counter(at: (() => THREE.Vector3) | null) { this.countAt = at; this.count.classList.toggle('on', !!at); }
  private setCount(label: string, big: string, sub: string) { this.count.innerHTML = `<small>${label}</small><b>${big}</b>${sub ? `<em>${sub}</em>` : ''}`; }
  private showRecap(on: boolean) {
    if (on) this.recap.innerHTML = `<h2>THE LOOP</h2><div class="loop">WAKE <span>&gt;</span> WORK <span>&gt;</span> PRESS <span>&gt;</span> OUT <span>&gt;</span> LAB <span>&gt;</span> NEXT UNIT</div>`
      + `<p><b>WORK</b> furniture, carried whole · data from terminals and drives · scans and samples of the inhabitants</p>`
      + `<p><b>PRESS</b> every piece it takes pays the debt down: <i>+SCRIP</i>. An installment is due every few days</p>`
      + `<p><b>OUT</b> clear the debt and buy passage at the depot, or just survive as long as you can</p>`
      + `<p><b>LAB</b> what the run filed becomes research: <i>+RP</i>. Spend it on upgrades, then send the next unit</p>`;
    this.recap.classList.toggle('on', on);
  }
  private paint(dt: number) {
    // the dip: down fast, run the cut, back up
    if (this.shadeGoal > 0) {
      this.shadeA = Math.min(1, this.shadeA + dt / 0.09);
      if (this.shadeA >= 1) { const f = this.dipFn; this.dipFn = null; this.shadeGoal = 0; f?.(); }
    } else this.shadeA = Math.max(0, this.shadeA - dt / 0.22);
    this.shade.style.opacity = String(this.shadeA);
    const place = (el: HTMLElement, at: (() => THREE.Vector3 | null) | null) => {
      const v = at?.();
      if (!v || !G.pr) { el.style.left = '50%'; el.style.top = '34%'; return; }
      const s = (G.pr as unknown as { worldToScreen: (v: THREE.Vector3) => { x: number; y: number; z: number } }).worldToScreen(v);
      const hw = Math.min(innerWidth / 2 - 8, el.offsetWidth / 2 + 12);
      // never over the lesson card at the top
      const top = this.cast.classList.contains('on') && !this.cine ? this.cast.getBoundingClientRect().bottom + 16 : innerHeight * 0.14;
      const x = Math.max(hw, Math.min(innerWidth - hw, s.x)), y = Math.max(el.offsetHeight + top, Math.min(innerHeight * 0.86, s.y));
      el.style.left = x.toFixed(0) + 'px'; el.style.top = y.toFixed(0) + 'px';
    };
    if (this.objKey) place(this.obj, this.objAt);
    if (this.countAt) place(this.count, this.countAt);
  }

  // ================================================================== the end
  skip() {
    if (this.step === 'done') return;
    G.audio?.flat?.('static_burst', 'sfx', 0.25);
    G.handler?.hush?.();
    this.go('done');
  }
  private finish() {
    this.step = 'done';
    this.release();
    this.setObjective(null);
    this.showRecap(false);
    this.cast.classList.remove('on');
    G.missions?.set?.('tut:done');
    TUT.running = false; TUT.step = ''; TUT.target = -1;
    const h = G.handler as unknown as { guide?: (t: null) => void; briefed?: boolean; cine?: boolean } | null;
    if (h) { h.guide?.(null); h.briefed = true; h.cine = false; }
    if (this.quietHeld) { floatQuiet(false); this.quietHeld = false; }
    for (const f of this.offs.splice(0)) { try { f(); } catch (e) { console.error(e); } }
    const root = this.root, plate = this.plate;
    setTimeout(() => { plate.destroy(); root.remove(); }, 700);
    queueMicrotask(() => { const i = this.g.systems.indexOf(this); if (i >= 0) this.g.systems.splice(i, 1); });
    running = null;
    if (import.meta.env.DEV) (window as unknown as { __tut: Tutorial | null }).__tut = null;
  }

  // ================================================================== dev: jump to a lesson (screenshots)
  debugJump(step: Step) { this.beats = []; this.beatOn = false; G.handler?.hush?.(); this.go(step); }
}

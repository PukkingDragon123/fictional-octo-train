// The contract tutorial: right after the arrival, a forced, staged walk through
// the loop, cutscene - task - cutscene. Each cutscene locks the controls,
// letterboxes the picture, frames the iso camera on what matters (pushes,
// pans), cuts to the survivor's own eyes (src/fp/eye.ts, through a dip to
// black) and has Staff Sergeant Voss (src/game/handler.ts) say the one line
// that matters. Each task gives control back with the target lit (a lamp on
// it, the floor guide's chevrons) and one meaningful word hanging over it.
//
//   brief    the room from above, the furniture lit, his eyes on it   -> BREAK IT OPEN
//   loot     what fell out, his eyes on the valuable                  -> PICK IT UP
//   press    a pan to the Remittance Press, Voss at its projector     -> ONTO THE PLATE / PULL THE LEVER
//   debt     the push on the band: the number counting down; the installment and its deadline;
//            the watch raised (its own first-person close-up) on the job board; a pan to the way
//            deeper (better rooms, passage out at the depot); a recap of the loop
//
// Runs once per contract (flag 'tut:done'), only for the host / solo with the
// contract on (never free survival or a co-op joiner). Esc (or the plate, or
// pad Start) during a cutscene skips the rest. ?quick runs keep the old soft
// guide; ?tutorial=1 forces it on a quick start (dev).
//
//   tutorialWanted(), startTutorial(g), tutorialRunning()
import * as THREE from 'three';
import { G } from '../G';
import type { Game, GameSystem } from '../game';
import type { Action } from '../../core/input';
import type { Zone, TileObject } from '../../world/zone';
import { bus } from '../../core/events';
import { objDef } from '../../world/objects';
import { eyeEnter, eyeExit, eyeActive } from '../../fp/eye';
import { floorItems, floorItemsNear } from '../../items/worldItems';
import { createItem, serializeItem } from '../../items/factory';
import { hasItemDef, itemDef } from '../../items/item';
import { op } from '../ops';
import { isValuable, itemValue } from '../debt/values';
import { floatQuiet } from '../../social/floatText';
import { skipPlate, pollPadSkip, type SkipPlate } from '../introKit/skip';
import { readTime } from '../lines';
import { TUT } from './state';
import '../intro.css';

type Step = 'brief' | 'break' | 'loot' | 'pickup' | 'press' | 'carry' | 'lever' | 'deposit' | 'debt' | 'done';
interface Beat { dur: number; enter?: () => void; tick?: (k: number, dt: number) => void; voss?: boolean }

const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const v1 = new THREE.Vector3();

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
.tut-obj i { display: block; font-style: normal; font-size: 16px; line-height: 18px; color: #e8eef4; text-shadow: var(--text-ink); margin-top: 4px; }
.tut-obj .arrow { display: block; font-size: 16px; color: #ffe7a8; text-shadow: var(--text-ink); animation: tut-bob .9s steps(3) infinite; }
@keyframes tut-bob { 50% { transform: translateY(4px); } }
.tut-count { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; opacity: 0; transition: opacity .3s; }
.tut-count.on { opacity: 1; }
.tut-count small { display: block; font-size: 16px; line-height: 16px; color: #ffb45a; text-shadow: var(--text-ink); }
.tut-count b { display: block; font-weight: 400; font-size: 48px; line-height: 48px; color: #ffd890; text-shadow: var(--text-ink); }
.tut-count em { display: block; font-style: normal; font-size: 32px; line-height: 32px; color: #9cff8a; text-shadow: var(--text-ink); }
.tut-recap { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; opacity: 0; transition: opacity .5s; width: min(92vw, 900px); }
.tut-recap.on { opacity: 1; }
.tut-recap h2 { font-weight: 400; font-size: 32px; line-height: 32px; margin: 0 0 16px; color: #ffb45a; text-shadow: var(--text-ink); }
.tut-recap .loop { font-size: 32px; line-height: 40px; color: #fff2c8; text-shadow: var(--text-ink); }
.tut-recap .loop span { color: #ffb45a; }
.tut-recap p { font-size: 16px; line-height: 22px; margin: 6px 0 0; color: #e8eef4; text-shadow: var(--text-ink); }
@media (max-width: 600px) { .tut-recap .loop { font-size: 16px; line-height: 24px; } .tut-obj b { font-size: 16px; line-height: 18px; } .tut-count b { font-size: 32px; line-height: 32px; } .tut-count em { font-size: 16px; } }
`;

export class Tutorial implements GameSystem {
  name = 'tutorial';
  step: Step = 'brief';
  /** seconds in this step */
  t = 0;
  private beats: Beat[] = [];
  private beatT = 0;
  private beatOn = false;
  private cine = false;
  // the iso camera, framed
  private camOn = false; private camFocus = new THREE.Vector3(); private camGoal = new THREE.Vector3(); private camZoom = 1; private camZoomGoal = 1; private camRate = 2;
  // what the task is about
  private target: { x: number; z: number; y: number } | null = null;
  private targetObj: TileObject | null = null;
  private loot: { key: string; x: number; z: number } | null = null;
  private hopper: { x: number; z: number; o: TileObject } | null = null;
  private owedFrom = 0; private owedTo = 0; private paid = 0;
  private offs: (() => void)[] = [];
  private lockOffs: (() => void)[] = [];
  // dom
  private root: HTMLDivElement; private shade: HTMLDivElement; private obj: HTMLDivElement; private count: HTMLDivElement; private recap: HTMLDivElement;
  private plate: SkipPlate;
  private shadeA = 0; private shadeGoal = 0;
  private objAt: (() => THREE.Vector3 | null) | null = null;
  private countAt: (() => THREE.Vector3 | null) | null = null;
  private watchUp = false;
  private quietHeld = false;

  constructor(public g: Game) {
    running = this;
    TUT.running = true; TUT.step = 'brief'; TUT.target = -1;
    if (!document.getElementById('tut-css')) { const st = document.createElement('style'); st.id = 'tut-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = (cls: string, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; return e; };
    this.root = el('tut-root');
    this.shade = el('tut-shade');
    this.obj = el('tut-obj');
    this.count = el('tut-count');
    this.recap = el('tut-recap');
    this.plate = skipPlate(() => this.skip(), 'Skip tutorial');
    this.plate.setKey('Esc');
    this.root.append(el('ix-bar top'), el('ix-bar bot'), this.shade, this.obj, this.count, this.recap, this.plate.el);
    document.body.appendChild(this.root);
    floatQuiet(true); this.quietHeld = true;
    // the old soft tutorial in the handler stands down
    const h = G.handler as unknown as { briefed?: boolean; cine?: boolean; hush?: () => void } | null;
    if (h) { h.briefed = true; h.cine = true; h.hush?.(); }
    const on = (ev: string, fn: (...a: any[]) => void) => this.offs.push(bus.on(ev, fn));
    on('objBroken', (_z: Zone, o: TileObject, by: string | null) => { if (by === G.local?.id && this.step === 'break') { this.targetObj = o; this.go('loot'); } });
    on('deposited', (d: { by: string; value: number }) => { if (d?.by === G.local?.id && (this.step === 'deposit' || this.step === 'carry' || this.step === 'lever')) { this.paid = d.value; this.go('debt'); } });
    this.go('brief');
  }

  // ================================================================== steps
  private go(step: Step) {
    this.step = step; this.t = 0;
    TUT.step = step;
    this.setObjective(null);
    const h = G.handler;
    switch (step) {
      case 'brief': this.findTarget(); this.cut(this.briefBeats()); break;
      case 'break': this.release(); if (this.target) h?.guide?.(this.target); break;
      case 'loot': this.cut(this.lootBeats()); break;
      case 'pickup': this.release(); break;
      case 'press': this.cut(this.pressBeats()); break;
      case 'carry': this.release(); if (this.hopper) h?.guide?.(this.hopper); break;
      case 'lever': this.cut(this.leverBeats()); break;
      case 'deposit': this.release(); break;
      case 'debt': this.cut(this.debtBeats()); break;
      case 'done': this.finish(); break;
    }
  }

  private briefBeats(): Beat[] {
    const p = G.local!, tg = this.target;
    const h = G.handler;
    return [
      { dur: 0.1, enter: () => { this.frame(v1.set(p.x, p.y + 0.6, p.z), 1.0, 8); } },
      // up over the room: the debtor small in it, the furniture around him
      { dur: 3.2, voss: true, enter: () => { this.frame(v1.set(p.x, p.y + 0.4, p.z), 0.72, 0.9); G.camera?.orbitBy?.(14 * DEG, 0); this.say('Right. The job, {n}. Watch it once. Then you do it until you are square.'); } },
      // push on the piece he is going to break, lit
      { dur: 2.6, voss: true, enter: () => { if (tg) { this.frame(v1.set(tg.x, tg.y + 0.5, tg.z), 1.7, 1.6); h?.point?.(tg.x, tg.z); } this.say('Furniture. People hid what they had left in it. That one.', tg ?? undefined); } },
      // his own eyes on it
      { dur: 2.4, voss: true, enter: () => { if (tg) this.eyeOn(tg, 10); this.say('Break it open. Hit it till it gives.'); } },
      { dur: 0.3, enter: () => this.eyeOff() },
    ];
  }

  private lootBeats(): Beat[] {
    const p = G.local!;
    return [
      // let it fall out
      { dur: 0.9, enter: () => { G.handler?.guide?.(null); this.lock(true); } },
      { dur: 0.1, enter: () => { this.findLoot(); const l = this.loot; this.frame(v1.set(l?.x ?? p.x, p.y + 0.3, l?.z ?? p.z), 2.1, 3); } },
      { dur: 2.6, voss: true, enter: () => { const l = this.loot; if (l) this.eyeOn({ x: l.x, z: l.z, y: p.y }, 42, 0.05); this.say(l ? `There. ${this.lootName()}. That is worth something.` : 'Look on the floor. Something fell out.'); } },
      { dur: 0.3, enter: () => this.eyeOff() },
    ];
  }

  private pressBeats(): Beat[] {
    const p = G.local!;
    const h = G.handler;
    this.findHopper();
    const hp = this.hopper;
    return [
      { dur: 0.1, enter: () => { this.frame(v1.set(p.x, p.y + 0.5, p.z), 1.4, 6); } },
      // a pan from him to the press, the press lit, Voss at its projector
      { dur: 3.4, voss: true, enter: () => { if (hp) { this.frame(v1.set(hp.x, p.y + 0.6, hp.z), 1.5, 1.0); h?.appear?.('pylon'); } this.say('That is a Remittance Press. It eats what you feed it and pays your number down.', undefined, true); } },
    ];
  }

  /** at the press: his eyes on the plate and the lever */
  private leverBeats(): Beat[] {
    const p = G.local!, hp = this.hopper;
    return [
      { dur: 0.2, enter: () => { G.handler?.guide?.(null); if (hp) this.frame(v1.set(hp.x, p.y + 0.7, hp.z), 2.2, 3); } },
      { dur: 2.8, voss: true, enter: () => { if (hp) this.eyeOn({ x: hp.x, z: hp.z, y: p.y }, 20, 0.6); this.say('On the striped plate. Step off it. Pull the red lever.', undefined, true); } },
      { dur: 0.3, enter: () => this.eyeOff() },
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
      { dur: 3.6, voss: true, enter: () => { this.frame(v1.set(p.x, p.y + 0.9, p.z), 3.0, 1.3); this.counter(wrist); this.say('Hear that? Your number went down. That is the whole job.'); },
        tick: (k) => { const n = this.owedFrom + (this.owedTo - this.owedFrom) * ease(clamp01((k - 0.12) / 0.55)); this.setCount('OWED', fmt(n) + ' SCRIP', this.paid > 0 ? '-' + fmt(this.paid) : ''); if (k > 0.12 && k < 0.7 && Math.random() < 0.25) G.audio?.ui?.('watchTick', 0.25); } },
      // the installment and its deadline
      { dur: 4.2, voss: true, enter: () => { const s = d(); this.setCount(`INSTALLMENT ${(s?.n ?? 0) + 1} OF ${s?.count ?? 5}`, fmt(s?.due ?? 0) + ' DUE', `BY DAY ${s?.dueDay ?? 3}`); this.say('The ledger wants an installment every few days. Miss one and the band bites. Then it bites harder.'); },
        tick: () => { const s = d(); if (s?.dueH != null) this.setCount(`INSTALLMENT ${(s.n ?? 0) + 1} OF ${s.count ?? 5}`, fmt(s.due) + ' DUE', `DAY ${s.dueDay} - ${Math.max(0, Math.floor(s.dueH))} H LEFT`); } },
      // the watch: its own first-person close-up, the job board
      { dur: 4.4, voss: true, enter: () => { this.counter(null); this.camOn = false; this.watch(true); this.say('Your watch. Jobs come through it. R&D pays research credit for them: spend it on what the watch can do.'); } },
      { dur: 0.5, enter: () => this.watch(false) },
      // the way deeper
      { dur: 3.6, voss: true, enter: () => { this.camOn = true; if (exit) this.frame(v1.set(exit.x, p.y + 0.5, exit.z), 1.2, 0.9); else this.frame(v1.set(p.x, p.y + 0.5, p.z), 0.8, 1); this.say('Clear the debt and you buy passage out at the depot. The deeper rooms pay better. They also bite.', exit ?? undefined); } },
      // the loop, once more, plainly
      { dur: 5.2, enter: () => { this.frame(v1.set(p.x, p.y + 0.5, p.z), 1.1, 1.2); this.showRecap(true); G.audio?.ui?.('watchUp', 0.3); } },
      { dur: 0.6, enter: () => this.showRecap(false) },
    ];
  }

  // ================================================================== per frame
  update(dt: number) {
    if (this.step === 'done') return;
    this.t += dt;
    const p = G.local;
    if (!p) return;
    // pad Start skips a cutscene
    if (this.cine) { const pad = pollPadSkip(); if (pad === 'skip') this.skip(); else if (pad === 'wake') this.plate.el.classList.add('hot'); }
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
    // the task
    switch (this.step) {
      case 'break': {
        const o = this.targetObj;
        if (o && !this.alive(o)) { this.findTarget(); if (this.target) G.handler?.guide?.(this.target); }
        this.setObjective('BREAK IT OPEN', 'Hit it until it gives', () => (this.target ? v1.set(this.target.x, this.target.y + 1.3, this.target.z) : null));
        this.light(this.target, 0xffe2b0);
        // the flag can come from elsewhere (a co-op host, the destruction system's own path)
        if (G.missions?.flags?.has?.('tut:smash') && this.t > 1 && !this.cine) { /* wait for objBroken; it arrives with the break */ }
        break;
      }
      case 'pickup': {
        const l = this.loot;
        if (this.hasValuable()) { this.go('press'); break; }
        if (l && this.t > 0.5 && !this.lootOnFloor()) this.findLoot();
        this.setObjective('PICK IT UP', this.loot ? this.lootName() : 'Something valuable', () => (this.loot ? v1.set(this.loot.x, p.y + 0.7, this.loot.z) : null));
        this.light(this.loot ? { x: this.loot.x, z: this.loot.z, y: p.y } : null, 0xfff0c8);
        break;
      }
      case 'carry': {
        const hp = this.hopper;
        if (!hp) { this.findHopper(); break; }
        if (G.missions?.flags?.has?.('contract:first_deposit')) { this.go('debt'); break; }
        if (Math.hypot(hp.x - p.x, hp.z - p.z) < 3.4) { this.go('lever'); break; }
        this.setObjective('TO THE PRESS', 'Carry it there', () => v1.set(hp.x, p.y + 1.6, hp.z));
        this.light({ x: hp.x, z: hp.z, y: p.y }, 0xffd9a0);
        break;
      }
      case 'deposit': {
        const hp = this.hopper;
        if (G.missions?.flags?.has?.('contract:first_deposit') && this.t > 0.5) { this.go('debt'); break; }
        if (!hp) { this.findHopper(); break; }
        const on = this.onPlate(hp.o);
        if (on) this.setObjective('PULL THE LEVER', 'The red lever on its side', () => v1.set(hp.x + 1.1, p.y + 1.6, hp.z));
        else this.setObjective('ONTO THE PLATE', this.hasValuable() ? 'Drop it on the striped plate, or Deposit from its menu' : 'Bring something valuable', () => v1.set(hp.x, p.y + 1.6, hp.z));
        this.light({ x: hp.x, z: hp.z, y: p.y }, 0xffd9a0);
        if (!this.hasValuable() && !on && this.t > 3) { /* still carrying nothing: the guide stays on the press, the word says what is missing */ }
        break;
      }
    }
    this.paint(dt);
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
    const next: Record<string, Step> = { brief: 'break', loot: 'pickup', press: 'carry', lever: 'deposit', debt: 'done' };
    const n = next[this.step];
    if (n) this.go(n);
  }
  /** control back, the picture back to the game's */
  private release() {
    this.cine = false;
    this.beats = [];
    this.root.classList.remove('cine');
    this.plate.el.classList.remove('on', 'hot');
    this.eyeOff();
    this.watch(false);
    this.counter(null);
    this.camOn = false;
    G.camera?.pushIn?.(0, 0.6);
    this.lock(false);
    const h = G.handler as unknown as { cine?: boolean } | null;
    if (h) h.cine = false;
  }
  /** Voss's line (through the cutscene's door in the handler) */
  private say(text: string, point?: { x: number; z: number }, pylon = false) {
    G.handler?.say?.(text, { cine: true, pri: 3, point, pylon, dur: readTime(text) * 0.9 });
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
  /** a cut to his own eyes, looking at a spot (a dip to black covers it) */
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
  private alive(o: TileObject) { const z = G.view?.zone; const cur = z?.objects.get(o.uid); return !!cur && !(cur.state as { broken?: boolean })?.broken; }
  /** the nearest piece of furniture worth breaking open (a container first): the tutorial's target */
  private findTarget() {
    const p = G.local; const z = G.view?.zone; if (!p || !z) return;
    let best: TileObject | null = null, bs = 1e9;
    for (const o of z.objects.values()) {
      const d = objDef(o.key);
      if (!d || d.ceiling || d.onWall || o.key === 'hopper' || (d.tags || []).includes('nobreak') || !(d.movable || d.container) || (d.hp ?? 0) > 5000) continue;
      if ((o.state as { broken?: boolean })?.broken) continue;
      const dist = Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.z);
      if (dist < 1.2 || dist > 16) continue;
      const s = dist - (d.container ? 2.5 : 0);
      if (s < bs) { bs = s; best = o; }
    }
    this.targetObj = best;
    TUT.target = best ? best.uid : -1;
    if (best) {
      const d = objDef(best.key)!;
      const w = d.w ?? 1, dd = d.d ?? 1, rw = best.rot % 2 === 0 ? w : dd, rd = best.rot % 2 === 0 ? dd : w;
      this.target = { x: best.x + rw / 2, z: best.y + rd / 2, y: z.heightAt(best.x, best.y) };
    } else this.target = null;
  }
  private findLoot() {
    const p = G.local, z = G.view?.zone; if (!p || !z) return;
    const c = this.target ?? { x: p.x, z: p.z };
    let best: { key: string; x: number; z: number } | null = null, bv = -1;
    for (const w of floorItemsNear(z, c.x, c.z, 5)) {
      const v = isValuable(w.item) ? 1000 + itemValue(w.item) : 0;
      if (v > bv) { bv = v; best = { key: w.item.key, x: w.x, z: w.z }; }
    }
    if (!best || bv < 1000) {
      // nothing worth anything fell out: the Institute's furniture always holds something the first time
      const key = ['gold_watch', 'pocket_watch', 'cash_roll'].find((k) => hasItemDef(k));
      if (key) {
        const it = createItem(key);
        const a = Math.random() * Math.PI * 2;
        op('dropFloor', { z: z.key, item: serializeItem(it), x: c.x + Math.cos(a) * 0.5, zz: c.z + Math.sin(a) * 0.5, y: 0.4, v: [Math.cos(a) * 0.8, 1.6, Math.sin(a) * 0.8] });
        best = { key, x: c.x + Math.cos(a) * 0.9, z: c.z + Math.sin(a) * 0.9 };
      }
    }
    this.loot = best;
  }
  private lootOnFloor() { const z = G.view?.zone, l = this.loot; if (!z || !l) return false; for (const w of floorItemsNear(z, l.x, l.z, 1.2)) if (w.item.key === l.key) { l.x = w.x; l.z = w.z; return true; } return false; }
  private lootName() { const l = this.loot; if (!l) return 'That'; try { const n = itemDef(l.key).name || l.key; return n.charAt(0).toUpperCase() + n.slice(1); } catch { return 'That'; } }
  private hasValuable() { const p = G.local; return !!p && (p.allItems().some((i) => isValuable(i)) || !!G.missions?.flags?.has?.('tut:valuable') && this.step !== 'pickup'); }
  private findHopper() {
    const h = G.handler as unknown as { nearestHopperObj?: () => TileObject | null; nearestHopper?: () => { x: number; z: number } | null } | null;
    const o = h?.nearestHopperObj?.(), c = h?.nearestHopper?.();
    this.hopper = o && c ? { x: c.x, z: c.z, o } : null;
  }
  private onPlate(o: TileObject) {
    const z = G.view?.zone; if (!z) return false;
    for (const w of floorItems(z).values()) if (w.x >= o.x && w.x <= o.x + 2 && w.z >= o.y && w.z <= o.y + 2) return true;
    return false;
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
  private counter(at: (() => THREE.Vector3) | null) { this.countAt = at; this.count.classList.toggle('on', !!at); }
  private setCount(label: string, big: string, sub: string) { this.count.innerHTML = `<small>${label}</small><b>${big}</b>${sub ? `<em>${sub}</em>` : ''}`; }
  private showRecap(on: boolean) {
    if (on) this.recap.innerHTML = `<h2>THE JOB</h2><div class="loop">BREAK IT OPEN <span>&gt;</span> FIND VALUABLES <span>&gt;</span> CARRY THEM <span>&gt;</span> THE PRESS <span>&gt;</span> PULL THE LEVER</div>`
      + `<p>Every deposit pays your number down. An installment is due every few days: miss it and the band shocks you.</p>`
      + `<p>The watch (TAB) carries jobs that pay research credit. Clear the debt, then buy passage out at the depot.</p>`;
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
      if (!v || !G.pr) { el.style.left = '50%'; el.style.top = '30%'; return; }
      const s = (G.pr as unknown as { worldToScreen: (v: THREE.Vector3) => { x: number; y: number; z: number } }).worldToScreen(v);
      const hw = Math.min(innerWidth / 2 - 8, el.offsetWidth / 2 + 12);
      const x = Math.max(hw, Math.min(innerWidth - hw, s.x)), y = Math.max(el.offsetHeight + innerHeight * 0.12, Math.min(innerHeight * 0.86, s.y));
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
}

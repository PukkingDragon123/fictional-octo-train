// BAILIFF: the debtor's monitor band and the only status display in the game.
//
// A steel cuff bolted through the left wrist (band3d.ts) throws a small,
// tilted, flickering hologram into the air beside the survivor: a live ECG
// whose rate is the real pulse and whose shape carries hunger, thirst,
// fatigue, pain, bleeding, cold, heat, panic, sickness and the state of the
// mind (trace.ts), plus a glyph readout of BPM, scrip still owed, the next
// installment countdown and the clock. It opens on demand (L, hover, a tap)
// or by itself when something matters into a fuller projection: a body
// silhouette with injuries and missing limbs, status tags in the band's
// billing language with plain-language explanations, the debt ledger and the
// last things the band and the sergeant said. It glitches when something is
// close, an eye looks out of it sometimes, it lies when you hallucinate,
// flips and stutters in a panic attack and bleeds static when it warns you.
// It talks, too (voice.ts, lines.ts).
//
// API (G.holo): boot(), ping(kind, value?), expand(), collapse(), toggle(),
// say(text, opts?), toast(title, sub?, secs?) -> shown?, visible.
// Listens to bandWarning / bandShock / bandDetonate / debtChanged / deposited
// and to 'subtitle' events in the 'bailiff' style.
// Everything here is local presentation; the band's rules live with G.band.
import './holo.css';
import './holoSounds';
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { clamp, clamp01, damp } from '../../core/math';
import type { Player } from '../../entities/player';
import { ensureMind } from '../../survival/mind';
import { startBreathing } from '../../survival/mindSystem';
import { paintBody, BODY_W, BODY_H, drawMoodleGlyph } from '../moodles';
import { Screen } from '../font5x7';
import { calm } from '../menus/settings';
import { HoloBuf, ink, Ink, mixInk, glyph3Url } from './pix';
import { Trace, F_SPIKE, F_CRACKLE, F_DOT, F_DROP } from './trace';
import { Vitals, emptyVitals, readVitals, statusTags, Tag } from './vitals';
import { Bands } from './band3d';
import { renderVoice, VoicePlayer, VoiceOpts } from './voice';
import * as L from './lines';
import { rigNumber } from '../../content/items/prisoner';

const TW = 96;
const CW = 100, CH = 45;
const EW = 220, EH = 138;

const COL = {
  cyan: ink(0x5cf2ff), hi: ink(0xd2fdff), dim: ink(0x1f8796), amber: ink(0xffb347), red: ink(0xff3a2e), redHi: ink(0xff9d8c),
  white: ink(0xf0ffff), frost: ink(0xdaf6ff), green: ink(0xa4ff6e), magenta: ink(0xff4ad8), heat: ink(0xff7a30), bone: ink(0xf4ecd0),
};
const WHISPERS = ['HELP', 'STAY', 'ITS ME', 'COUNT THEM', 'WAKE UP', 'NOT YOU', 'BEHIND', 'SHH', 'STILL HERE', 'LET ME OUT', 'PAY', 'NO'];

export interface DebtView { owed: number; paid: number; due: number; dueDay: number; cleared: boolean; hoursLeft: number | null }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; kind: number }
interface Floater { text: string; x: number; y: number; vx: number; vy: number; life: number; max: number; col: Ink; big: boolean }
interface Warn { level: number; reason: string; countdown: number | null; t: number }

/** what kind of trouble a band warning reason is */
const warnKind = (r: string) => (/seam|exit|escape|abscond|bound/.test(r) ? 'escape' : /tamper|force|remov|cut/.test(r) ? 'tamper' : 'other');
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
function fmtLeft(h: number): string {
  if (h <= 0) return 'OVERDUE';
  const d = Math.floor(h / 24), hh = Math.floor(h % 24), mm = Math.floor((h % 1) * 60);
  return d > 0 ? `${d}D ${String(hh).padStart(2, '0')}H` : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
/** a prisoner number for this survivor: from the debt contract if it has one, else stable per id + name */
export function debtorNo(p: Player | null | undefined): string {
  if (!p) return 'D-0000';
  const D = (G as any).debt;
  const given = (p as any).prisonerNo || (p as any).prisoner || D?.prisonerNo?.(p.id) || D?.debtorId;
  if (typeof given === 'string' && given) return given;
  // the number stencilled on the jumpsuit (content/items/prisoner.ts) so patch, band and HUD agree
  try { if (typeof (p.rig as any)?.seed === 'number') return rigNumber(p.rig); } catch { /* older rig */ }
  let h = 2166136261;
  for (const ch of p.name + '#' + (G.worldSeed ?? 0)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 'D-' + (1000 + ((h >>> 0) % 9000));
}

export class Holo {
  name = 'holo';
  /** the band is on this survivor's wrist and the projector runs */
  fitted = false;
  expanded = false;
  visible = false;
  private pinned = false;
  private autoT = 0;
  private hoverT = -1;
  private leaveT = -1;
  private bootT = -1;
  private booted = false;
  private sessionStart = -1;

  // ---- DOM
  private el: HTMLDivElement;
  private tilt: HTMLDivElement;
  private face: HTMLButtonElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private xl: HTMLDivElement;
  private tagsEl: HTMLDivElement;
  private plainEl: HTMLDivElement;
  private ledgerEl: HTMLDivElement;
  private logEl: HTMLDivElement;
  private sayEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private breatheBtn: HTMLButtonElement;
  private svg: SVGSVGElement;
  private cone: SVGPolygonElement;
  private rayA: SVGLineElement;
  private rayB: SVGLineElement;
  private grad: SVGLinearGradientElement;
  private hp = 2;

  // ---- model
  private buf: HoloBuf;
  private trace = new Trace(TW);
  private vit: Vitals = emptyVitals();
  private vitT = 0;
  private tags: Tag[] = [];
  private tagKey = '';
  private tagFocus: Tag | null = null;
  private tagEls = new Map<string, HTMLButtonElement>();
  private worstLevel = 0;
  private drawT = 0;
  private beatFlash = 0;
  private parts: Particle[] = [];
  private floaters: Floater[] = [];
  private whisperT = 8;
  private eye = { t: -1, dur: 0, look: 0, lookT: 0, blink: -1 };
  private eyeCd = 20;
  private glitch = 0;
  private near = { d: 99, hostile: false, dx: 0, t: 0 };
  private warn: Warn | null = null;
  private shockT = 0;
  private detonT = -1;
  private flipT = 0;
  private stutterT = 0;
  private wrongT = 0;
  private wrong = { bpm: '', clock: '', owed: '' };
  private debt: DebtView | null = null;
  private lastDebt: any = null;
  private shownOwed = -1;
  private log: { who: string; text: string }[] = [];
  private ariaT = 0;
  private bands = new Bands();
  private bandT = 0;
  private side = 1;
  private sideHold = 0;
  private pos = { x: -1, y: -1, w: 0, h: 0 };
  private wrist = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private dead = false;

  // ---- voice
  private voice = new VoicePlayer();
  private queue: { text: string; o: VoiceOpts; pri: number }[] = [];
  private cds = new Map<string, number>();
  private nextLine = 0;
  private leakT = 240 + Math.random() * 200;
  private dueSaid = '';
  private clearedSaid = false;
  private sayUntil = 0;

  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'hb hb-hidden';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'BAILIFF band hologram');
    el.innerHTML = `
      <div class="hb-above"><div class="hb-toasts" aria-live="polite"></div><div class="hb-say" aria-live="assertive"></div></div>
      <div class="hb-tilt">
        <button class="hb-face" type="button" aria-expanded="false" title="BAILIFF band (L)"><canvas></canvas></button>
        <div class="hb-scan"></div>
        <div class="hb-x">
          <div class="hb-tags" role="list"></div>
          <div class="hb-plain"></div>
          <div class="hb-ledger"></div>
          <div class="hb-log"></div>
        </div>
      </div>
      <button class="hb-breathe" type="button" title="Breathing exercise (H)">BREATHE · H</button>`;
    document.body.appendChild(el);
    this.tilt = el.querySelector('.hb-tilt') as HTMLDivElement;
    this.face = el.querySelector('.hb-face') as HTMLButtonElement;
    this.canvas = el.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.xl = el.querySelector('.hb-x') as HTMLDivElement;
    this.tagsEl = el.querySelector('.hb-tags') as HTMLDivElement;
    this.plainEl = el.querySelector('.hb-plain') as HTMLDivElement;
    this.ledgerEl = el.querySelector('.hb-ledger') as HTMLDivElement;
    this.logEl = el.querySelector('.hb-log') as HTMLDivElement;
    this.sayEl = el.querySelector('.hb-say') as HTMLDivElement;
    this.toastEl = el.querySelector('.hb-toasts') as HTMLDivElement;
    this.breatheBtn = el.querySelector('.hb-breathe') as HTMLButtonElement;
    // the projector cone lives in its own full-screen SVG under the hologram
    const NS = 'http://www.w3.org/2000/svg';
    const svg = this.svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'hb-cone hb-hidden');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><linearGradient id="hb-grad" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9ff8ff" stop-opacity="0.55"/><stop offset="0.25" stop-color="#5cf2ff" stop-opacity="0.16"/><stop offset="1" stop-color="#5cf2ff" stop-opacity="0.04"/></linearGradient></defs><polygon fill="url(#hb-grad)"/><line/><line/>`;
    document.body.appendChild(svg);
    this.cone = svg.querySelector('polygon') as SVGPolygonElement;
    this.grad = svg.querySelector('linearGradient') as SVGLinearGradientElement;
    const ls = svg.querySelectorAll('line');
    this.rayA = ls[0] as SVGLineElement; this.rayB = ls[1] as SVGLineElement;
    this.buf = new HoloBuf(CW, CH);
    document.documentElement.style.setProperty('--nc-scrip', `url(${glyph3Url('¤')})`);
    this.resize();

    // ---- input: hover opens, leaving closes (unless pinned); tap / click / Enter pins
    el.addEventListener('pointerenter', (e) => { if (G.input) G.input.pointerOverUI = true; if (e.pointerType === 'mouse') { this.hoverT = 0.35; this.leaveT = -1; } });
    el.addEventListener('pointerleave', (e) => { if (G.input) G.input.pointerOverUI = false; if (e.pointerType === 'mouse') { this.hoverT = -1; if (!this.pinned) this.leaveT = 0.7; } this.hideTagTip(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.face.addEventListener('click', () => this.toggle());
    this.breatheBtn.addEventListener('click', () => { const p = G.local; if (p) startBreathing(p); G.audio?.ui?.('band_tick', 0.4); });
    window.addEventListener('resize', () => this.resize());
    bus.on('uiScale', () => this.resize());
    bus.on('uiSettings', () => this.resize());

    // ---- the world talks to the band
    bus.on('bandWarning', (w: any) => this.onWarning(w));
    bus.on('bandShock', (s: any) => this.onShock(s));
    bus.on('bandDetonate', (d: any) => this.onDetonate(d));
    bus.on('debtChanged', (st: any) => this.onDebt(st));
    bus.on('deposited', (d: any) => this.onDeposited(d));
    bus.on('subtitle', (s: any) => this.onSubtitle(s));
    bus.on('moodle', (p: Player, key: string, level: number, prev: number) => { if (p?.isLocal) this.onMoodle(key, level, prev); });
    bus.on('death', (p: Player) => { if (p?.isLocal) { this.dead = true; this.queue.length = 0; } });

    G.addSystem({ name: 'holo', update: (dt) => this.update(dt) });
    (G as any).holo = this;
  }

  // =================================================================== API
  /** the intro fitted the band: run the boot sequence */
  boot() {
    this.fitted = true;
    this.booted = true;
    this.bootT = 0;
    this.expanded = false; this.pinned = false;
    G.audio?.ui?.('band_boot', 0.7);
    const p = G.local;
    const owed = this.debtNow()?.owed;
    setTimeout(() => this.say(L.BOOT_LINES[0], { pri: 3, key: 'boot0' }), 900);
    setTimeout(() => this.say(L.fill(L.BOOT_LINES[1], { id: debtorNo(p) }), { pri: 3, key: 'boot1' }), 1200);
    if (owed) setTimeout(() => this.say(L.fill(L.BOOT_LINES[2], { owed: fmt(owed) }), { pri: 3, key: 'boot2' }), 1500);
  }
  /** something happened the band wants to show (deposit, warn, shock, info, objective...) */
  ping(kind: string, value?: any) {
    switch (kind) {
      case 'deposit': this.depositFx(typeof value === 'number' ? value : Number(value?.value) || 0, true); break;
      case 'warn': this.onWarning({ id: G.local?.id, level: typeof value === 'number' ? value : 0.6, reason: String(value?.reason ?? 'default') }); break;
      case 'shock': this.onShock({ id: G.local?.id, strength: Number(value) || 0.7 }); break;
      case 'boot': this.boot(); break;
      default:
        this.autoExpand(2.5);
        if (value != null) this.floatText(String(value), COL.hi, false);
        G.audio?.ui?.('band_tick', 0.4);
    }
  }
  expand() { this.pinned = true; this.setExpanded(true); }
  collapse() { this.pinned = false; this.autoT = 0; this.setExpanded(false); }
  toggle() { if (this.expanded && (this.pinned || this.autoT <= 0)) this.collapse(); else this.expand(); }

  /** make the band speak (voiced, with a subtitle from the wrist) */
  say(text: string, o: { pri?: number; key?: string; cd?: number; voice?: VoiceOpts['kind']; glitch?: number } = {}): boolean {
    if (!text) return false;
    const now = G.time ?? 0;
    const pri = o.pri ?? 1;
    if (pri < 2 && now < this.nextLine) return false;
    if (o.key) { const until = this.cds.get(o.key) ?? -1; if (now < until) return false; this.cds.set(o.key, now + (o.cd ?? 0)); }
    // keep the queue short: newer and higher-priority lines win
    this.queue = this.queue.filter((q) => q.pri >= pri).slice(-1);
    this.queue.push({ text, o: { kind: o.voice ?? 'band', glitch: o.glitch }, pri });
    return true;
  }

  /** a short notice, projected as a line of light above the hologram. False when the hologram is not up. */
  toast(title: string, sub = '', secs = 3.5): boolean {
    if (!this.visible || this.dead) return false;
    const el = document.createElement('div');
    el.className = 'hb-toast';
    el.innerHTML = `<b></b>${sub ? '<small></small>' : ''}`;
    this.toastEl.appendChild(el);
    while (this.toastEl.children.length > 3) this.toastEl.firstElementChild!.remove();
    decode(el.querySelector('b')!, title.toUpperCase(), 1.6);
    if (sub) decode(el.querySelector('small')!, sub, 2.4);
    setTimeout(() => el.classList.add('out'), secs * 1000);
    setTimeout(() => el.remove(), secs * 1000 + 800);
    this.glitch = Math.max(this.glitch, 0.25);
    return true;
  }

  /** tests and screenshots: run the trace and its effects forward without waiting for real time */
  warm(secs = 3) {
    const p = G.local; if (!p) return;
    readVitals(p, this.vit, !!G.survival?.mind?.breathing);
    this.refreshTags(p); this.debt = this.debtNow(); this.scanCreatures(p);
    const bpm = G.survival?.mind?.bpm ?? 70;
    for (let t = 0; t < secs; t += 1 / 30) { this.trace.step(1 / 30, bpm, this.vit); if (this.trace.beatAt >= 0) this.onBeat(this.vit); this.updateFx(1 / 30, this.vit, p); }
    this.tagKey = ''; this.drawT = 0;
  }

  /** world position of a survivor's projector lens (other modules can aim things at it) */
  lensPos(p: Player, out: THREE.Vector3): boolean { return this.bands.lensWorld(p.id, out); }

  // =================================================================== events
  private onWarning(w: any) {
    if (!w) return;
    const local = G.local;
    if (w.id && local && w.id !== local.id) { this.remoteLens(w.id, 2, 2); return; }
    const level = clamp01(Number(w.level) || 0);
    if (level <= 0.01) { this.warn = null; return; }
    const prev = this.warn;
    this.warn = { level, reason: String(w.reason || 'default'), countdown: w.countdown != null ? Number(w.countdown) : null, t: 0 };
    this.autoExpand(3);
    this.glitch = Math.max(this.glitch, 0.4 + level * 0.5);
    if (!prev || prev.reason !== this.warn.reason || level - prev.level > 0.25) {
      G.audio?.ui?.('band_warn', 0.5 + level * 0.4);
      const lines = L.WARN[this.warn.reason] || L.WARN.default;
      this.say(L.pick(lines), { pri: 3, key: 'warn:' + this.warn.reason, cd: 4, voice: level > 0.7 ? 'alarm' : 'band' });
    }
  }
  private onShock(s: any) {
    const local = G.local;
    if (s?.id && local && s.id !== local.id) { this.remoteLens(s.id, 2, 1); return; }
    const k = clamp01(Number(s?.strength) || 0.7);
    this.shockT = 0.6 + k * 0.8;
    this.glitch = 1;
    this.stutterT = 0.25;
    G.audio?.ui?.('band_shock', 0.6 + k * 0.4);
    this.say(L.pick(L.SHOCK), { pri: 3, key: 'shock', cd: 3 });
  }
  private onDetonate(d: any) {
    const local = G.local;
    if (d?.id && local && d.id !== local.id) { const p = G.players.get(d.id); if (p) this.bands.sync(p, false); this.detonated.add(d.id); return; }
    this.detonT = 0;
    this.glitch = 1;
    this.say(L.pick(L.DETONATE), { pri: 4 });
  }
  private detonated = new Set<string>();
  private remoteLens(id: string, state: 0 | 1 | 2, secs: number) { this.remoteRed.set(id, (G.time ?? 0) + secs); void state; }
  private remoteRed = new Map<string, number>();

  private onDebt(st: any) {
    if (!st || typeof st !== 'object') return;
    this.lastDebt = st;
    const d = this.debtNow();
    if (!d) return;
    if (d.cleared && !this.clearedSaid) { this.clearedSaid = true; this.say(L.pick(L.CLEARED), { pri: 3 }); this.autoExpand(4); }
  }
  private onDeposited(d: any) {
    if (!d) return;
    this.depositFx(Number(d.value) || 0, d.by === G.local?.id);
  }
  private lastDepositFx = -10;
  private depositFx(value: number, mine: boolean) {
    const now = G.time ?? 0;
    // the debt agent may both emit 'deposited' and ping: one show per deposit
    if (now - this.lastDepositFx < 0.4) return;
    this.lastDepositFx = now;
    this.autoExpand(3.5);
    if (value) this.floatText('+' + fmt(value) + ' ¤', COL.hi, true);
    for (let i = 0; i < 18; i++) this.spawn(this.expanded ? EW * 0.5 : CW * 0.5, 10, (Math.random() - 0.5) * 60, -30 - Math.random() * 50, 1 + Math.random(), 2);
    G.audio?.ui?.('band_ping', 0.55);
    const owed = this.debtNow()?.owed;
    if (mine || Math.random() < 0.5) this.say(L.fill(L.pick(L.DEPOSIT), { value: fmt(value), owed: owed != null ? fmt(owed) : 'pending' }), { pri: 2, key: 'deposit', cd: 7 });
  }
  private onSubtitle(s: any) {
    if (!s || !s.text) return;
    const style = s.style || (/bailiff|band/i.test(s.who || '') ? 'bailiff' : /voss|sergeant|handler/i.test(s.who || '') ? 'voss' : '');
    if ((style === 'bailiff' && s.voiced) || style === 'voss' || style === 'radio') {
      this.log.push({ who: style === 'bailiff' ? 'BAILIFF' : String(s.who || style).toUpperCase(), text: String(s.text) });
      if (this.log.length > 6) this.log.shift();
      this.logDirty = true;
    }
    if (style !== 'bailiff') return;
    // lines someone else wants the band to say: voice them unless they come voiced
    if (!s.voiced) { this.say(String(s.text), { pri: 3 }); return; }
    this.showSay(String(s.text), Number(s.dur) || 0);
  }
  private logDirty = true;

  private onMoodle(key: string, level: number, prev: number) {
    if (level <= prev) return;
    if (level >= 4 || (key === 'bleeding' && level >= 2) || key === 'attack') this.autoExpand(2.5);
    const lines = L.STATE[key];
    if (!lines) return;
    const need = key === 'bleeding' || key === 'attack' || key === 'fever' ? 1 : key === 'panic' || key === 'pain' ? 3 : 2;
    if (level < need) return;
    this.say(L.pick(lines), { pri: key === 'bleeding' || key === 'attack' ? 2 : 1, key: 'st:' + key, cd: 200 });
  }

  // =================================================================== debt
  private debtNow(): DebtView | null {
    const g = (G as any).debt;
    let st: any = this.lastDebt;
    if (!st && g) st = (typeof g.state === 'function' ? g.state() : g.state) ?? g.snapshot?.() ?? (typeof g.owed === 'number' ? g : null);
    if (!st || typeof st.owed !== 'number' || st.on === false) return null;
    let left: number | null = null;
    try {
      const hl = g?.hoursLeft;
      if (typeof st.dueH === 'number') left = st.dueH - G.clock.hours;
      else if (typeof hl === 'number') left = hl;
      else if (typeof hl === 'function') left = hl.call(g);
      else if (typeof st.dueAt === 'number') left = st.dueAt - G.clock.hours;
      else if (typeof st.dueDay === 'number' && st.dueDay > 0) left = (st.dueDay - G.clock.startDay + 1) * 24 - G.clock.hours;
    } catch { left = null; }
    // 'owed' is the contract total in the ledger; what is still owed is 'remaining'
    const paid = st.paid ?? 0;
    const remaining = typeof st.remaining === 'number' ? st.remaining : Math.max(0, st.owed - paid);
    return { owed: remaining, paid, due: st.due ?? 0, dueDay: st.dueDay ?? 0, cleared: !!st.cleared || remaining <= 0, hoursLeft: left };
  }

  // =================================================================== per frame
  private update(dt: number) {
    const p = G.local;
    if (!p) return;
    this.sessionGate(p);
    // 3D bands on everyone wearing one
    this.bandT -= dt;
    if (this.bandT <= 0) {
      this.bandT = 0.5;
      const alive = new Set<string>();
      for (const q of G.players.values()) {
        alive.add(q.id);
        const on = !this.detonated.has(q.id) && (q.isLocal ? this.fitted && this.detonT < 0 : this.fitted || this.wearsBand(q));
        this.bands.sync(q, on);
      }
      this.bands.prune(alive);
    }
    // vitals a few times a second
    this.vitT -= dt;
    const mind = G.survival?.mind;
    if (this.vitT <= 0) {
      this.vitT = 0.25;
      readVitals(p, this.vit, !!mind?.breathing);
      this.scanCreatures(p);
      this.debt = this.debtNow();
      this.debtTalk();
      this.refreshTags(p);
    }
    const v = this.vit;
    const bpm = this.dead || v.dead ? 0 : (mind?.bpm ?? 70);
    this.trace.step(dt, bpm, v);
    if (this.trace.beatAt >= 0) this.onBeat(v);
    this.beatFlash = Math.max(0, this.beatFlash - dt);
    this.updateFx(dt, v, p);
    this.updateLens(p);
    this.talk(dt, v, p);
    // timers
    if (this.bootT >= 0) { this.bootT += dt; if (this.bootT > 5.2) this.bootT = -1; }
    if (this.autoT > 0) { this.autoT -= dt; if (this.autoT <= 0 && !this.pinned && this.hoverT < 0) this.setExpanded(false); }
    if (this.hoverT > 0) { this.hoverT -= dt; if (this.hoverT <= 0) { this.hoverT = -1; this.setExpanded(true); } }
    if (this.leaveT > 0) { this.leaveT -= dt; if (this.leaveT <= 0) { this.leaveT = -1; if (!this.pinned && this.autoT <= 0) this.setExpanded(false); } }
    if (this.warn) { this.warn.t += dt; if (this.warn.countdown != null) this.warn.countdown = Math.max(0, this.warn.countdown - dt); if (this.warn.t > 12 && this.warn.level < 0.9) this.warn = null; }
    // keys: L opens / closes
    if (G.input?.keyHit?.('KeyL') && !G.input.textFocus && !G.ui?.blocksMovement?.()) this.toggle();
    // visibility
    const ui = G.ui;
    const blocked = !!(ui?.scanner?.open || ui?.inventory?.open || ui?.readerEl || ui?.modal || G.attract);
    const show = this.fitted && !blocked && !(this.dead && this.deadT > 4) && this.detonT < 1.6;
    if (show !== this.visible) {
      this.visible = show;
      this.el.classList.toggle('hb-hidden', !show);
      this.svg.classList.toggle('hb-hidden', !show);
      if (!show) { this.hideTagTip(); if (G.input && this.el.matches(':hover')) G.input.pointerOverUI = false; }
    }
    if (this.dead) this.deadT += dt;
    if (!show) return;
    this.place(p, dt);
    this.updateDom(p, dt);
    // draw at ~20 fps (less when calm), freeze while stuttering
    this.drawT -= dt;
    if (this.stutterT > 0) { this.stutterT -= dt; return; }
    if (this.drawT > 0) return;
    this.drawT = calm() ? 1 / 12 : 1 / 20;
    this.draw(p);
  }
  private deadT = 0;

  /** the band is fitted once the intro has done it (boot), or straight away when there is no intro */
  private sessionGate(p: Player) {
    if (this.fitted) return;
    if (this.sessionStart < 0) this.sessionStart = G.time;
    const intro: any = G.systems.find((s) => s.name === 'intro');
    const introOn = !!intro && intro.phase !== 'done' && !intro.done && !intro.finished;
    const flagged = !!G.missions?.flags?.has?.('contract:intake');
    if (flagged || this.wearsBand(p) || (!introOn && G.time - this.sessionStart > 0.3)) {
      this.fitted = true;
      // a quick flicker-on instead of the full boot when nobody ran one
      if (!this.booted) { this.glitch = 0.8; G.audio?.ui?.('band_open', 0.3); }
    }
  }
  private wearsBand(p: Player): boolean {
    try {
      if (p.worn?.get?.('wrist' as any)?.key === 'bailiff_band') return true;
      if ((p.rig as any)?.outfit?.wrist?.item === 'bailiff_band') return true;
      for (const it of p.worn?.values?.() || []) if (it.key === 'bailiff_band') return true;
    } catch { /* ignore */ }
    return false;
  }

  private scanCreatures(p: Player) {
    let best = 99, hostile = false, dx = 0;
    const all: Iterable<any> = G.creatures?.creatures?.values?.() || [];
    for (const c of all) {
      if (!c || c.dead || c.tamedBy || c.zoneKey !== p.zoneKey) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < best) { best = d; const t = c.sp?.temperament; hostile = t === 'hostile' || t === 'stalker' || t === 'ambush' || t === 'hazard'; dx = c.x - p.x; }
    }
    this.near.d = best; this.near.hostile = hostile; this.near.dx = dx;
  }

  private onBeat(v: Vitals) {
    this.beatFlash = 0.14;
    const T = this.trace;
    // bleeding: drops shake loose from the beat
    if (v.bleed > 0.02) {
      const n = v.bleed > 0.6 ? 3 : v.bleed > 0.25 ? 2 : 1;
      for (let i = 0; i < n; i++) if (Math.random() < 0.35 + v.bleed) this.spawn(this.traceX() + T.beatAt + (Math.random() - 0.5) * 4, this.traceBase() - 4 - Math.random() * 6, (Math.random() - 0.5) * 6, 4 + Math.random() * 10, 2.5, 1);
    }
  }

  private updateFx(dt: number, v: Vitals, p: Player) {
    // glitch: creatures close, warnings, hallucinations, corruption
    const prox = this.near.d < 12 ? clamp01((12 - this.near.d) / 10) * (this.near.hostile ? 1 : 0.45) : 0;
    const target = Math.max(prox * 0.8, (this.warn?.level ?? 0) * 0.7, v.halluc * 0.5, v.corrupt * 0.6, v.attack ? 0.35 : 0, this.shockT > 0 ? 1 : 0);
    this.glitch = damp(this.glitch, target, this.glitch > target ? 1.4 : 6, dt);
    this.shockT = Math.max(0, this.shockT - dt);
    if (this.detonT >= 0) this.detonT += dt;
    // panic attack: the projection flips and stutters
    this.flipT = Math.max(0, this.flipT - dt);
    if (v.attack && !calm()) {
      if (Math.random() < dt * 0.6) this.flipT = 0.12 + Math.random() * 0.25;
      if (Math.random() < dt * 0.8) this.stutterT = 0.08 + Math.random() * 0.2;
    }
    // wrong numbers while hallucinating (or when the mind system plants a fake line)
    const mindGlitch: string | null = G.survival?.mind?.watchGlitch ?? null;
    this.wrongT = Math.max(0, this.wrongT - dt);
    if ((v.halluc > 0.25 || v.dissoc > 0.5) && Math.random() < dt * (0.15 + v.halluc * 0.6)) {
      this.wrongT = 0.6 + Math.random() * 1.6;
      const r = (n: number) => String(Math.floor(Math.random() * n));
      this.wrong.bpm = L.pick(['000', '666', r(400), '31', '??', '---']);
      this.wrong.clock = L.pick(['33:61', '--:--', '00:00', r(99) + ':' + r(99).padStart(2, '0'), '88:88']);
      this.wrong.owed = L.pick(['999999', '0', '-' + r(9999), 'YOU', '4471']);
    }
    if (mindGlitch) { this.wrongT = Math.max(this.wrongT, 0.2); this.wrong.bpm = '!!!'; }
    // the eye
    this.eyeCd -= dt;
    const e = this.eye;
    if (e.t >= 0) {
      e.t += dt;
      e.lookT -= dt;
      if (e.lookT <= 0) { e.lookT = 0.4 + Math.random() * 0.9; e.look = this.near.d < 14 ? clamp(this.near.dx / 6, -1, 1) * (Math.random() < 0.7 ? 1 : -1) : Math.random() * 2 - 1; }
      if (e.blink < 0 && Math.random() < dt * 0.7) e.blink = 0;
      if (e.blink >= 0) { e.blink += dt; if (e.blink > 0.18) e.blink = -1; }
      this.trace.hush = 1;
      if (e.t > e.dur) { e.t = -1; this.trace.hush = 0; }
    } else if (this.eyeCd <= 0 && this.bootT < 0) {
      const chance = (this.near.d < 9 ? 0.12 : 0) + (v.mental > 0.5 ? 0.04 : 0) + v.halluc * 0.1 + 0.004;
      if (Math.random() < chance * dt * 4) {
        e.t = 0; e.dur = 1.6 + Math.random() * 2.2; e.lookT = 0; e.blink = -1;
        this.eyeCd = 25 + Math.random() * 40;
        G.audio?.ui?.('band_glitch', 0.25);
      }
    }
    // whispers in the static
    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = 4 + Math.random() * 8;
      if (v.mental > 0.35 || v.halluc > 0.2 || v.lonely > 0.7) {
        const w = this.expanded ? EW : CW;
        const text = Math.random() < 0.15 ? debtorNo(p) : L.pick(WHISPERS);
        const left = Math.random() < 0.5;
        this.floaters.push({ text, x: left ? -HoloBuf.w3(text) : w, y: 2 + Math.random() * 20, vx: left ? 9 : -9, vy: 0, life: 0, max: 3 + Math.random() * 2, col: COL.dim, big: false });
      }
    }
    // particles
    const W = this.buf.w, H = this.buf.h;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt;
      q.vy += (q.kind === 1 ? 70 : q.kind === 2 ? 60 : 10) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0 || q.y > H + 2 || q.x < -4 || q.x > W + 4) this.parts.splice(i, 1);
    }
    // static dripping out while the band warns
    if (this.warn && Math.random() < dt * (4 + this.warn.level * 20)) this.spawn(Math.random() * W, H - 10 - Math.random() * 10, 0, 10 + Math.random() * 20, 1.5, 3);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life += dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.life > f.max) this.floaters.splice(i, 1);
    }
  }
  private spawn(x: number, y: number, vx: number, vy: number, life: number, kind: number) {
    if (this.parts.length > 70) return;
    this.parts.push({ x, y, vx, vy, life, kind });
  }
  private floatText(text: string, col: Ink, big: boolean) {
    const w = this.expanded ? EW : CW;
    this.floaters.push({ text, x: (w - HoloBuf.w7(text)) / 2, y: big ? 14 : 4, vx: 0, vy: -6, life: 0, max: 2.6, col, big: true });
  }

  private updateLens(p: Player) {
    if (!this.bands.has(p.id)) return;
    const red = !!this.warn || this.shockT > 0 || this.vit.severity > 0.8 || this.detonT >= 0;
    const off = this.beatFlash > 0.07 || (this.glitch > 0.5 && Math.random() < 0.3);
    this.bands.setLens(p.id, off ? 0 : red ? 2 : 1);
    // a faint glow on the wrist from the projector
    if (this.visible && this.bands.lensWorld(p.id, this.tmpV)) G.pointLight?.(this.tmpV.x, this.tmpV.y, this.tmpV.z, red ? 0xff3a2e : 0x5cf2ff, 0.35 + this.glitch * 0.3, 2.2);
    // remote players: red on their warnings
    const now = G.time;
    for (const [id, until] of this.remoteRed) { if (now > until) { this.remoteRed.delete(id); this.bands.setLens(id, 1); } else this.bands.setLens(id, Math.floor(now * 6) % 2 ? 2 : 0); }
  }

  // =================================================================== voice
  private talk(dt: number, v: Vitals, p: Player) {
    if (!this.fitted || this.dead && this.detonT < 0 && this.deadT > 1) { this.queue.length = 0; return; }
    const now = G.time;
    // creatures
    if (this.near.d < 7 && this.near.hostile) this.say(L.pick(L.CREATURE), { key: 'creature', cd: 150 });
    // things it should not say
    this.leakT -= dt * (1 + v.mental * 2 + v.halluc * 2);
    if (this.leakT <= 0) {
      this.leakT = 260 + Math.random() * 300;
      this.say(L.fill(L.pick(L.LEAKS), { id: debtorNo(p) }).replace('D-4471', debtorNo(p)), { voice: 'leak', glitch: 0.6, pri: 1 });
    }
    // relocated after losing the left forearm
    if (this.bands.side(p.id) < 0) this.say(L.RELOCATED[0], { key: 'relocated', cd: 1e9, pri: 2 });
    if (this.voice.busy || !this.queue.length || now < this.sayUntil) return;
    const q = this.queue.shift()!;
    let samples: Float32Array | null = null;
    try { samples = renderVoice(q.text, q.o); } catch { samples = null; }
    const dur = samples ? this.voice.play(samples, q.o.kind === 'leak' ? 0.75 : 0.9) : 1 + q.text.length * 0.06;
    this.sayUntil = now + dur + 0.35;
    this.nextLine = now + dur + 10;
    bus.emit('subtitle', { who: 'BAILIFF', text: q.text, dur: dur + 0.8, style: 'bailiff', voiced: true, leak: q.o.kind === 'leak' });
    if (q.o.kind === 'leak') { this.glitch = Math.max(this.glitch, 0.7); this.eyeCd = 0; }
  }
  private debtTalk() {
    const d = this.debt;
    if (!d || d.cleared || d.hoursLeft == null) return;
    const tag = String(d.dueDay);
    if (d.hoursLeft > 0 && d.hoursLeft < 6 && this.dueSaid !== tag + 's') {
      this.dueSaid = tag + 's';
      this.say(L.fill(L.pick(L.DUE_SOON), { h: Math.max(1, Math.round(d.hoursLeft)), due: fmt(d.due) }), { pri: 2 });
      this.autoExpand(3);
    } else if (d.hoursLeft <= 0 && this.dueSaid !== tag + 'o') {
      this.dueSaid = tag + 'o';
      this.say(L.pick(L.OVERDUE), { pri: 2 });
    }
  }
  /** a band line, written in light just above the hologram */
  private showSay(text: string, dur: number) {
    this.showLine(text, dur, /disregard|please|wearing you|copy of you|person once/i.test(text) ? 'leak' : '');
  }
  /** a line projected above the hologram: the band's ('' / 'leak') or the sergeant's ('voss', with who) */
  showLine(text: string, dur: number, cls = '', who = '') {
    const el = document.createElement('div');
    el.className = 'hb-line' + (cls ? ' ' + cls : '');
    if (who) el.dataset.who = who.toUpperCase();
    while (this.sayEl.childElementCount > 1) this.sayEl.firstElementChild!.remove();
    this.sayEl.appendChild(el);
    decode(el, text, Math.min(dur || 3, 0.4 + text.length * 0.045));
    const secs = Math.max(2.4, dur || 0.8 + text.length * 0.07);
    setTimeout(() => el.classList.add('out'), secs * 1000);
    setTimeout(() => el.remove(), secs * 1000 + 700);
    this.glitch = Math.max(this.glitch, 0.3);
  }

  // =================================================================== layout
  private resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pxn')) || 2;
    const small = Math.min(window.innerWidth, window.innerHeight) < 560;
    const target = small ? 1.5 : clamp(ui, 2, 3);
    const k = Math.max(2, Math.round(target * dpr));
    this.hp = k / dpr;
    this.el.style.setProperty('--hp', this.hp + 'px');
    this.applySize();
  }
  private applySize() {
    const w = this.expanded ? EW : CW, h = this.expanded ? EH : CH;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.buf = new HoloBuf(w, h); }
    this.canvas.style.width = w * this.hp + 'px';
    this.canvas.style.height = h * this.hp + 'px';
    this.pos.w = w * this.hp; this.pos.h = h * this.hp;
  }
  private setExpanded(on: boolean) {
    if (on === this.expanded) return;
    this.expanded = on;
    this.el.classList.toggle('hb-open', on);
    this.face.setAttribute('aria-expanded', String(on));
    this.applySize();
    this.parts.length = 0; this.floaters = this.floaters.filter((f) => !f.big);
    this.tagKey = ''; this.logDirty = true;
    G.audio?.ui?.(on ? 'band_open' : 'band_close', 0.3);
    this.glitch = Math.max(this.glitch, 0.5);
    this.drawT = 0;
  }
  /** tests / screenshots: never open by itself */
  autoOff = false;
  private autoExpand(secs: number) {
    if (this.autoOff || (!this.visible && !this.fitted)) return;
    this.autoT = Math.max(this.autoT, secs);
    this.setExpanded(true);
  }
  private screenOf(x: number, y: number, z: number) { this.tmpV.set(x, y, z); return G.pr.worldToScreen(this.tmpV); }

  /** float beside the survivor, on the side the band is on, projector cone from the lens */
  private place(p: Player, dt: number) {
    const pr = G.pr;
    const pxm = pr.cssPerMetre ? pr.cssPerMetre() : 40;
    const hasLens = this.bands.lensWorld(p.id, this.wrist);
    if (!hasLens) this.wrist.set(p.x, p.y + 0.9, p.z);
    const ws = pr.worldToScreen(this.wrist);
    const cs = this.screenOf(p.x, p.y + 1.25, p.z);
    const hs = this.screenOf(p.x, p.y + (this.expanded ? 1.5 : 1.95), p.z);
    // side with hysteresis: the hologram stays put while the arm swings
    const want = ws.x >= cs.x ? 1 : -1;
    if (want !== this.side) { this.sideHold += dt; if (this.sideHold > 0.6 && Math.abs(ws.x - cs.x) > 4) { this.side = want; this.sideHold = 0; } }
    else this.sideHold = 0;
    const vw = window.innerWidth, vh = window.innerHeight;
    const touch = document.documentElement.classList.contains('nc-touch');
    const top = touch ? 66 : 10, bottom = vh - (touch ? 10 : 10);
    const w = this.pos.w, h = this.pos.h;
    let side = this.side;
    // not enough room on that side: use the other
    const room = (s: number) => (s > 0 ? vw - (cs.x + pxm * 0.45) : cs.x - pxm * 0.45);
    if (room(side) < w + 12 && room(-side) > room(side)) side = -side;
    let x = side > 0 ? cs.x + pxm * 0.34 : cs.x - pxm * 0.34 - w;
    let y = hs.y - h;
    x = clamp(x, 8, vw - w - 8);
    y = clamp(y, top + (this.toastEl.childElementCount ? 20 : 0), bottom - h - 26);
    const P = this.pos;
    if (P.x < 0 || Math.abs(P.x - x) > vw * 0.5 || Math.abs(P.y - y) > vh * 0.5) { P.x = x; P.y = y; }
    else { P.x = damp(P.x, x, 9, dt); P.y = damp(P.y, y, 9, dt); }
    const shake = this.shockT > 0 ? (Math.random() - 0.5) * 8 : this.glitch > 0.6 && Math.random() < 0.2 ? (Math.random() - 0.5) * 4 : 0;
    const rx = Math.round(P.x + shake), ry = Math.round(P.y);
    this.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    this.el.classList.toggle('hb-l', side < 0);
    this.el.classList.toggle('hb-flip', this.flipT > 0);
    // cone from the lens to the near half of the bottom edge
    const lx = ws.x, ly = ws.y;
    const bx0 = rx + (side > 0 ? 0 : w * 0.35), bx1 = rx + (side > 0 ? w * 0.65 : w), by = ry + h - 2;
    const flick = this.glitch > 0.3 && Math.random() < 0.25 ? 0.35 : 1;
    const op = (0.55 + this.vit.severity * 0.2) * flick * (this.bootT >= 0 ? Math.min(1, this.bootT) : 1);
    this.cone.setAttribute('points', `${lx},${ly} ${bx0},${by} ${bx1},${by}`);
    this.cone.style.opacity = String(op);
    this.grad.setAttribute('x1', String(lx)); this.grad.setAttribute('y1', String(ly));
    this.grad.setAttribute('x2', String((bx0 + bx1) / 2)); this.grad.setAttribute('y2', String(by));
    for (const [ln, bx] of [[this.rayA, bx0], [this.rayB, bx1]] as const) { ln.setAttribute('x1', String(lx)); ln.setAttribute('y1', String(ly)); ln.setAttribute('x2', String(bx)); ln.setAttribute('y2', String(by)); }
    this.svg.classList.toggle('hb-red', !!this.warn || this.shockT > 0);
  }

  private hp2(n: number) { return n * this.hp; }

  // =================================================================== DOM parts (expanded view, breathe)
  private refreshTags(p: Player) {
    this.tags = statusTags(p);
    let worst = 0; for (const t of this.tags) if (t.kind !== 'med') worst = Math.max(worst, t.level);
    this.worstLevel = worst;
  }
  private updateDom(p: Player, dt: number) {
    const b = p.body, m = ensureMind(b);
    const mind = G.survival?.mind;
    // breathe prompt during panic (a touch target as much as a hint)
    const breathing = !!mind?.breathing;
    const wantB = !b.dead && (m.attack > 0 || b.panic > 45 || breathing);
    this.breatheBtn.classList.toggle('on', wantB);
    this.breatheBtn.classList.toggle('urgent', m.attack > 0 && !breathing);
    if (breathing) { const t = mind.breathT as number; const ph = Math.floor(t / 4) % 4; this.breatheBtn.textContent = `${['IN', 'HOLD', 'OUT', 'HOLD'][ph]} ${4 - Math.floor(t % 4)}`; }
    else if (this.breatheBtn.textContent !== 'BREATHE · H') this.breatheBtn.textContent = 'BREATHE · H';
    // a11y summary
    this.ariaT -= dt;
    if (this.ariaT <= 0) {
      this.ariaT = 2;
      const d = this.debt;
      const states = this.tags.filter((t) => t.kind !== 'med').slice(0, 4).map((t) => t.plain).join(', ');
      this.face.setAttribute('aria-label', `BAILIFF band. Pulse ${Math.round(mind?.bpm ?? 0)}. ${states || 'No alerts'}.${d ? ` Owed ${fmt(d.owed)} scrip${d.hoursLeft != null && !d.cleared ? `, next ${fmt(d.due)} due in ${fmtLeft(d.hoursLeft)}` : ''}.` : ''} Press L to ${this.expanded ? 'close' : 'open'}.`);
    }
    if (!this.expanded) return;
    // tags: kept by key so a level change does not rebuild (or re-animate) the list
    const shown = this.tags.slice(0, 6);
    const key = shown.map((t) => t.key + t.level).join(',') + '|' + this.tags.length;
    if (key !== this.tagKey) {
      this.tagKey = key;
      const keep = new Set(shown.map((t) => t.key));
      for (const [k, el] of this.tagEls) if (!keep.has(k)) { el.remove(); this.tagEls.delete(k); }
      this.tagsEl.querySelectorAll('.hb-more').forEach((n) => n.remove());
      for (const t of shown) {
        let el = this.tagEls.get(t.key);
        if (!el) {
          el = document.createElement('button');
          el.type = 'button';
          el.setAttribute('role', 'listitem');
          el.innerHTML = `<i style="--g:url(${glyphUrl(t.glyph)})"></i><b></b><s></s>`;
          const btn = el;
          const show = () => { const cur = (btn as any)._tag as Tag | undefined; if (cur) this.showTagTip(cur); };
          el.addEventListener('pointerenter', show);
          el.addEventListener('focus', show);
          el.addEventListener('click', show);
          el.addEventListener('blur', () => this.hideTagTip());
          this.tagEls.set(t.key, el);
        }
        (el as any)._tag = t;
        el.className = `hb-tag lv${t.level} k-${t.kind}`;
        el.setAttribute('aria-label', `${t.plain}. ${t.desc}`);
        (el.querySelector('b') as HTMLElement).textContent = t.label;
        (el.querySelector('s') as HTMLElement).textContent = '|'.repeat(Math.min(4, t.level));
        this.tagsEl.appendChild(el);
      }
      if (this.tags.length > shown.length) { const more = document.createElement('div'); more.className = 'hb-more'; more.textContent = `+${this.tags.length - shown.length} MORE`; this.tagsEl.appendChild(more); }
      if (!shown.length) { const ok = document.createElement('div'); ok.className = 'hb-more ok'; ok.textContent = 'NO DEDUCTIONS. ASSET NOMINAL.'; this.tagsEl.appendChild(ok); }
      if (!this.tagFocus) this.plainEl.textContent = shown[0] ? `${shown[0].plain}: ${shown[0].desc}` : 'Nothing wrong with you that the band can bill.';
    }
    // ledger
    const d = this.debt;
    if (d) {
      if (this.shownOwed < 0) this.shownOwed = d.owed;
      this.shownOwed = Math.abs(this.shownOwed - d.owed) < 1 ? d.owed : damp(this.shownOwed, d.owed, 3, dt);
      const owed = this.wrongT > 0 && this.vit.halluc > 0.2 ? this.wrong.owed : fmt(this.shownOwed);
      const S = '<i class="hb-scrip"></i>';
      const next = d.cleared ? 'CLEARED. TRANSPORT AUTHORISED.' : d.hoursLeft != null ? `NEXT ${S}${fmt(d.due)} IN ${fmtLeft(d.hoursLeft)}` : `NEXT ${S}${fmt(d.due)}`;
      const html = `<div><span>OWED</span> <b>${S}${owed}</b> <span>PAID</span> <b>${S}${fmt(d.paid)}</b></div><div class="${d.hoursLeft != null && d.hoursLeft < 6 && !d.cleared ? 'hot' : ''}">${next}</div>`;
      if (this.ledgerEl.innerHTML !== html) this.ledgerEl.innerHTML = html;
    } else if (this.ledgerEl.textContent !== '') this.ledgerEl.textContent = '';
    if (this.logDirty) {
      this.logDirty = false;
      this.logEl.textContent = '';
      for (const l of this.log.slice(-2)) {
        const ln = document.createElement('div');
        ln.innerHTML = `<span></span> `;
        (ln.firstChild as HTMLElement).textContent = l.who + ':';
        ln.appendChild(document.createTextNode(l.text));
        this.logEl.appendChild(ln);
      }
    }
  }
  private showTagTip(t: Tag) { this.tagFocus = t; this.plainEl.textContent = `${t.plain}: ${t.desc}`; this.plainEl.classList.add('on'); }
  private hideTagTip() { this.tagFocus = null; this.plainEl.classList.remove('on'); }

  // =================================================================== drawing
  private traceX() { return this.expanded ? 46 : 2; }
  private traceBase() { return this.expanded ? 17 : 15; }

  private draw(p: Player) {
    const B = this.buf;
    B.clear();
    const v = this.vit;
    const t = G.time;
    // palette from the body
    const base = mixInk(COL.cyan, COL.amber, clamp01((v.severity - 0.35) * 2.5));
    if (v.severity > 0.8 || this.warn || this.shockT > 0) mixInk(base, COL.red, this.warn ? 0.6 + 0.4 * Math.sin(t * 9) ** 2 : 0.7, base);
    if (v.sick > 0.2) mixInk(base, COL.green, v.sick * 0.45, base);
    if (v.cold > 0.2) mixInk(base, COL.frost, v.cold * 0.5, base);
    if (v.heat > 0.2) mixInk(base, COL.heat, v.heat * 0.4, base);
    if (v.corrupt > 0.2 && Math.random() < v.corrupt * 0.3) mixInk(base, COL.magenta, 0.6, base);
    const dx = this.glitch > 0.35 ? 1 + (Math.random() < this.glitch * 0.5 ? 1 : 0) + (this.shockT > 0 ? 1 : 0) : 0;
    const fadeA = 1 - v.hunger * 0.45;
    if (this.detonT >= 0) this.drawDetonate(B, t);
    else if (this.bootT >= 0 && this.bootT < 3.6) this.drawBoot(B, base, p);
    else {
      this.drawFrame(B, base, v);
      this.drawTrace(B, base, fadeA, dx, v);
      if (this.eye.t >= 0) this.drawEye(B, base);
      this.drawReadout(B, base, dx, p, v);
      if (this.expanded) this.drawBody(B, p, t);
    }
    this.drawFx(B, v, base);
    // the projector's refresh sweep rolling down through the light
    if (!calm()) { const ry = Math.floor((t * 26) % (B.h + 12)) - 6; B.scaleRow(ry, 1.7); B.scaleRow(ry - 1, 1.25); }
    // resolve with shimmer / glitch slices / static
    const glitch = this.glitch;
    let slices: number[] | null = null;
    if (glitch > 0.15 && Math.random() < glitch * 0.6 && !calm()) {
      slices = [];
      const n = 1 + Math.floor(glitch * 3);
      for (let i = 0; i < n; i++) slices.push(Math.floor(Math.random() * B.h), 1 + Math.floor(Math.random() * 4), Math.round((Math.random() - 0.5) * 10 * glitch));
    }
    const heat = v.heat, sick = v.sick;
    const shift = (y: number) => {
      let s = 0;
      if (heat > 0.1) s += Math.sin(y * 0.9 + t * 11) * heat * 1.4;
      if (sick > 0.3) s += Math.sin(y * 0.25 + t * 2.6) * sick * 1.2;
      if (v.drunk > 0.2) s += Math.sin(t * 1.7) * v.drunk * 2;
      if (slices) for (let i = 0; i < slices.length; i += 3) if (y >= slices[i] && y < slices[i] + slices[i + 1]) s += slices[i + 2];
      return s;
    };
    const flick = calm() ? 1 : (Math.random() < 0.04 + glitch * 0.15 ? 0.55 : 1) * (0.92 + Math.random() * 0.08);
    const boot = this.bootT >= 0 && this.bootT < 0.6 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
    const noise = (this.warn ? 0.02 + this.warn.level * 0.05 : 0) + v.mental * 0.012 + glitch * 0.02 + (this.shockT > 0 ? 0.08 : 0);
    this.ctx.putImageData(B.resolve(flick * boot, shift, calm() ? 0 : noise), 0, 0);
  }

  /** corner ticks and a faint grid: the projection's edges, no panel */
  private drawFrame(B: HoloBuf, c: Ink, v: Vitals) {
    const W = B.w, H = B.h;
    const a = 0.32;
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) {
      for (let i = 0; i < 4; i++) { B.add(x + sx * i, y, c, a); B.add(x, y + sy * i, c, a); }
    }
    // grid dots behind the trace
    const x0 = this.traceX(), y0 = this.traceBase();
    for (let x = 0; x < TW; x += 6) for (let y = -10; y <= 8; y += 6) B.add(x0 + x, y0 + y, COL.dim, 0.35);
    // frost crystals creeping in from the edges
    if (v.cold > 0.15) {
      const n = Math.floor(v.cold * 18);
      for (let i = 0; i < n; i++) {
        const h = (i * 2654435761) >>> 0;
        const edge = h % 4, u = ((h >>> 3) % 1000) / 1000;
        const cx = edge === 0 ? u * W : edge === 1 ? W - 2 - (h >>> 12) % 4 : edge === 2 ? u * W : 1 + (h >>> 12) % 4;
        const cy = edge === 0 ? 1 + (h >>> 14) % 4 : edge === 2 ? H - 2 - (h >>> 14) % 4 : u * H;
        const r = 1 + (h >>> 20) % 2;
        B.add(cx, cy, COL.frost, 0.7);
        for (let k = 1; k <= r; k++) { B.add(cx + k, cy, COL.frost, 0.45); B.add(cx - k, cy, COL.frost, 0.45); B.add(cx, cy + k, COL.frost, 0.45); B.add(cx, cy - k, COL.frost, 0.45); }
        if (r > 1) { B.add(cx + 1, cy + 1, COL.frost, 0.3); B.add(cx - 1, cy - 1, COL.frost, 0.3); }
      }
    }
  }

  private drawTrace(B: HoloBuf, c: Ink, fadeA: number, dx: number, v: Vitals) {
    const T = this.trace;
    const x0 = this.traceX(), y0 = this.traceBase();
    const amp = this.expanded ? 12 : 10;
    let prev = -999;
    const hot = mixInk(c, COL.white, 0.6);
    for (let i = 0; i < TW; i++) {
      const age = T.age(i);
      if (age > TW - 6) { prev = -999; continue; }
      const f = T.flags[i];
      const fresh = 1 - age / TW;
      let a = (0.22 + 0.78 * fresh * fresh) * fadeA;
      if (f & F_DROP) a *= 0.6;
      const y = Math.round(y0 - (T.v[i] + T.base[i]) * amp);
      const x = x0 + i;
      if ((f & F_DOT) && (i % 3 === 0)) { prev = y; continue; }
      const col = f & F_SPIKE ? COL.white : age < 3 ? hot : c;
      if (prev !== -999 && Math.abs(prev - y) > 1) { const s = prev < y ? 1 : -1; for (let yy = prev + s; yy !== y; yy += s) B.addChroma(x, yy, col, a * 0.85, dx); }
      B.addChroma(x, y, col, a, dx);
      // a soft second line under the trace (phosphor bloom), skipped when starving: the line thins
      if (v.hunger < 0.5) B.add(x, y + 1, c, a * 0.18);
      // thirst crackle: dry white specks round the line
      if (f & F_CRACKLE) { B.add(x + ((i * 7) % 3) - 1, y - 2 - ((i * 13) % 3), COL.bone, a * 0.9); B.add(x, y + 2 + ((i * 5) % 2), COL.bone, a * 0.5); }
      // ghost of the previous sweep
      if (v.mental > 0.25) { const gy = Math.round(y0 + 2 - (T.prev[i] + T.base[i]) * amp); B.add(x + 2, gy, COL.dim, v.mental * 0.5 * fresh); }
      // the other heart
      if (T.other[i] !== 0 || (v.lonely > 0.4 || v.mental > 0.45 || v.halluc > 0.25)) { const oy = Math.round(y0 + 4 - T.other[i] * amp * 0.8); if (T.other[i] !== 0) B.add(x, oy, COL.redHi, 0.28 * fresh); }
      prev = y;
    }
    // write head
    const hx = x0 + ((T.head - 1 + TW) % TW);
    const hy = Math.round(y0 - (T.v[(T.head - 1 + TW) % TW] + T.base[(T.head - 1 + TW) % TW]) * amp);
    B.add(hx, hy, COL.white, 1); B.add(hx + 1, hy, COL.white, 0.6); B.add(hx, hy - 1, c, 0.5); B.add(hx, hy + 1, c, 0.5);
  }

  private drawEye(B: HoloBuf, c: Ink) {
    const e = this.eye;
    const open = e.blink >= 0 ? Math.abs(1 - e.blink / 0.09) : Math.min(1, e.t / 0.3, (e.dur - e.t) / 0.3);
    const cx = this.traceX() + TW / 2, cy = this.traceBase() - 3;
    const R = 13, Hh = 6 * open;
    const lid = mixInk(c, COL.white, 0.3);
    for (let x = -R; x <= R; x++) {
      const k = 1 - (x / (R + 0.5)) ** 2;
      const h = Hh * k;
      B.add(cx + x, Math.round(cy - h), lid, 0.9); B.add(cx + x, Math.round(cy + h), lid, 0.7);
    }
    if (open > 0.3) {
      const px = cx + Math.round(e.look * 6), r = Math.max(1, Math.round(3.5 * Math.min(1, open)));
      for (let a = 0; a < 20; a++) { const an = (a / 20) * Math.PI * 2; const x = Math.round(px + Math.cos(an) * r), y = Math.round(cy + Math.sin(an) * r); if (Math.abs(y - cy) < Hh) B.add(x, y, COL.redHi, 0.9); }
      // a pinprick pupil glint
      B.add(px - 1, cy - 1, COL.white, 0.9);
      // veins
      B.add(cx - R + 3, cy, COL.red, 0.5); B.add(cx - R + 4, cy - 1, COL.red, 0.4); B.add(cx + R - 3, cy + 1, COL.red, 0.5);
    }
  }

  private drawReadout(B: HoloBuf, c: Ink, dx: number, p: Player, v: Vitals) {
    const mind = G.survival?.mind;
    const wrong = this.wrongT > 0;
    const bpmN = Math.round(v.dead || this.dead ? 0 : mind?.bpm ?? 70);
    const bpm = wrong ? this.wrong.bpm : v.dead || this.dead ? '---' : String(bpmN);
    const clock = wrong ? this.wrong.clock : G.clock.timeString();
    const beat = this.beatFlash > 0;
    const hc = v.attack ? COL.red : beat ? COL.white : c;
    const W = B.w;
    if (!this.expanded) {
      B.text3('♥', 2, 30, hc, beat ? 1 : 0.7, 0, dx);
      const bw = B.text7(bpm, 8, 28, v.attack || bpmN > 140 ? COL.redHi : c, 0.95, 1, dx);
      B.text3('BPM', 8 + bw + 1, 30, COL.dim, 0.9);
      B.text7(clock, W - 2 - HoloBuf.w7(clock) + 1, 28, c, 0.85, 1, dx);
      const d = this.debt;
      if (d) {
        const owed = wrong && v.halluc > 0.2 ? this.wrong.owed : fmt(d.owed);
        B.text3('¤' + owed, 2, 38, d.cleared ? COL.green : c, 0.85, this.glitch > 0.5 ? 0.05 : 0, dx);
        const right = d.cleared ? 'CLEARED' : d.hoursLeft != null ? '▸' + fmtLeft(d.hoursLeft) : '';
        const hot = d.hoursLeft != null && d.hoursLeft < 6 && !d.cleared;
        if (right) B.text3(right, W - 2 - HoloBuf.w3(right), 38, hot ? COL.red : COL.dim, hot && Math.floor(G.time * 2) % 2 ? 1 : 0.8);
      } else {
        // no contract yet: the debtor number
        B.text3(debtorNo(p), 2, 38, COL.dim, 0.7);
      }
      // the band's warning takes over the bottom row
      if (this.warn) {
        const cd = this.warn.countdown != null ? ' ' + Math.ceil(this.warn.countdown) : '';
        const msg = (warnKind(this.warn.reason) === 'escape' ? 'RETURN' : warnKind(this.warn.reason) === 'tamper' ? 'HANDS OFF' : 'WARNING') + cd;
        if (Math.floor(G.time * 4) % 2) B.text3(msg, Math.floor((W - HoloBuf.w3(msg)) / 2), 38, COL.red, 1, 0.04, 1);
      }
      return;
    }
    // expanded: big pulse on the left of the trace, clock and day on the right
    B.text3('♥', 4, 3, hc, beat ? 1 : 0.7);
    B.text7(bpm, 4, 10, v.attack || bpmN > 140 ? COL.redHi : c, 0.95, 2, dx);
    B.text3('BPM', 30, 3, COL.dim, 0.9);
    const right = W - 2;
    B.text7(clock, right - HoloBuf.w7(clock) + 1, 4, c, 0.9, 1, dx);
    const day = 'DAY ' + G.clock.day;
    B.text3(day, right - HoloBuf.w3(day), 14, COL.dim, 0.9);
    const id = debtorNo(p);
    B.text3(id, right - HoloBuf.w3(id), 21, COL.dim, 0.8);
    B.hline(2, W - 3, 30, COL.dim, 0.5, 3);
    // band footer
    const foot = 'BAILIFF 4.71  MERIDIAN REMITTANCE  [L]';
    B.text3(foot, 2, EH - 6, COL.dim, 0.45);
    if (this.warn) {
      const cd = this.warn.countdown != null ? Math.ceil(this.warn.countdown) : null;
      const msg = (warnKind(this.warn.reason) === 'escape' ? 'RETURN TO COVERAGE' : warnKind(this.warn.reason) === 'tamper' ? 'DO NOT TAMPER' : 'NON-COMPLIANCE');
      if (Math.floor(G.time * 3) % 3) B.text3(msg, 50, 24, COL.red, 1, 0.03, 1);
      if (cd != null) B.text7(String(cd), right - HoloBuf.w7(String(cd), 2) - 30, 8, COL.red, 1, 2, 1);
    }
  }

  private inkCache = new Map<number, Ink>();
  private drawBody(B: HoloBuf, p: Player, t: number) {
    const ox = 4, oy = 35;
    const cache = this.inkCache;
    const glitch = this.glitch;
    paintBody((x, y, hex) => {
      let k = cache.get(hex); if (!k) { k = ink(hex); cache.set(hex, k); }
      const jit = glitch > 0.5 && Math.random() < 0.05 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      B.add(ox + x + jit, oy + y, k, (y & 1) ? 0.6 : 0.85);
    }, p.body, { faint: 0x0f4650, dim: 0x1f8796, mid: 0x5cf2ff, hi: 0xd2fdff, amb: 0xffb347, red: 0xff3a2e, bg: 0x000000 }, null, t);
    // a scan bar sweeping down the body
    const sy = oy + Math.floor((t * 30) % (BODY_H + 10)) - 5;
    for (let x = 0; x < BODY_W; x++) B.add(ox + x, sy, COL.cyan, 0.18);
  }

  private drawBoot(B: HoloBuf, c: Ink, p: Player) {
    const t = this.bootT;
    const lines = ['BAILIFF 4.71', 'MERIDIAN REMIT.', 'SEATING..... OK', 'VASC LOCK... OK', 'DEBTOR ' + debtorNo(p), 'LIAB ¤' + (this.debtNow() ? fmt(this.debtNow()!.owed) : '------')];
    const n = Math.min(lines.length, Math.floor(t / 0.42) + 1);
    const start = Math.max(0, n - 6);
    for (let i = start; i < n; i++) {
      const s = lines[i];
      const shown = i === n - 1 ? s.slice(0, Math.floor(((t % 0.42) / 0.42) * s.length * 1.5) + 1) : s;
      B.text3(shown, 3, 3 + (i - start) * 7, i === n - 1 ? COL.white : c, i === n - 1 ? 1 : 0.7, 0.02);
    }
    if (Math.floor(t * 4) % 2) B.add(3 + HoloBuf.w3(lines[n - 1]) + 2, 3 + (n - 1 - start) * 7 + 4, COL.white, 1);
  }

  private drawDetonate(B: HoloBuf, t: number) {
    const k = this.detonT;
    const W = B.w, H = B.h;
    if (k < 0.8) {
      const msg = 'TERMINATED';
      B.text7(msg, Math.floor((W - HoloBuf.w7(msg)) / 2), Math.floor(H / 2 - 4), COL.red, Math.floor(t * 12) % 2 ? 1 : 0.4, 1, 2);
    }
    // the projection breaks up into falling light
    const n = Math.floor(200 * Math.min(1, k));
    for (let i = 0; i < n; i++) B.add(Math.random() * W, Math.random() * H * (1 - k * 0.3) + k * 20, Math.random() < 0.5 ? COL.red : COL.white, 0.6);
  }

  private drawFx(B: HoloBuf, v: Vitals, c: Ink) {
    for (const q of this.parts) {
      if (q.kind === 1) { B.add(q.x, q.y, COL.red, 0.95); B.add(q.x, q.y - 1, COL.red, 0.5); B.add(q.x, q.y - 2, COL.red, 0.2); }
      else if (q.kind === 2) { B.add(q.x, q.y, Math.random() < 0.5 ? COL.white : c, 0.9); B.add(q.x + 1, q.y, c, 0.4); }
      else if (q.kind === 3) { const k = Math.random() < 0.5 ? COL.red : COL.white; B.add(q.x, q.y, k, 0.6); B.add(q.x, q.y + 1, k, 0.3); }
    }
    for (const f of this.floaters) {
      const a = Math.min(1, f.life * 3, (f.max - f.life) * 1.5);
      if (f.big) B.text7(f.text, Math.round(f.x), Math.round(f.y), f.col, a, 1, 1);
      else B.text3(f.text, Math.round(f.x), Math.round(f.y), f.col, a * (0.25 + v.mental * 0.3), 0.1);
    }
  }
}

// ------------------------------------------------------------------ helpers
const glyphCache = new Map<string, string>();
/** a 7x7 moodle glyph as a white mask image (tinted by CSS) */
function glyphUrl(key: string): string {
  let u = glyphCache.get(key);
  if (u) return u;
  const s = new Screen(7, 7);
  s.data.fill(0);
  drawMoodleGlyph(s, key, 0, 0, Screen.c(0xffffff));
  const c = document.createElement('canvas'); c.width = 7; c.height = 7;
  c.getContext('2d')!.putImageData(s.img, 0, 0);
  u = c.toDataURL();
  glyphCache.set(key, u);
  return u;
}

const SCRAMBLE = '#%&¤/\\|<>=+*0123456789ABCDEFXZ';
/** type a line into an element as if it were being decoded from noise */
export function decode(el: HTMLElement, text: string, secs: number) {
  if (calm()) { el.textContent = text; return; }
  const t0 = performance.now();
  const n = text.length;
  const tick = () => {
    if (!el.isConnected) return;
    const k = Math.min(1, (performance.now() - t0) / 1000 / Math.max(0.2, secs));
    const done = Math.floor(k * n);
    let s = text.slice(0, done);
    const tail = Math.min(4, n - done);
    for (let i = 0; i < tail; i++) s += text[done + i] === ' ' ? ' ' : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
    el.textContent = s;
    if (k < 1) requestAnimationFrame(tick); else el.textContent = text;
  };
  tick();
}

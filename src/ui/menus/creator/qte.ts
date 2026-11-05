// The operating mini-games. Each change to the subject is made by a robot
// tool, and the player works it:
//   tap     a marker sweeps a row of teeth: strike when it is in the lit zone
//   hold    hold to build pressure, release inside the bracket (not over the top)
//   trace   drag the blade along the dotted line on his face (keys: hold SPACE
//           to cut, ↑/↓ keep it on the line)
//   rhythm  strike on the beat as the chevrons reach the bars (any key / tap;
//           arrow keys that match score the same)
//   aim     steer the nozzle over the marked patches and hold to spray
// Everything is drawn as crisp pixel art on a low-res canvas laid over the
// room (whole-number scale, ink outline, no boxes, no circles); the words float
// in Alagard. Esc, the gamepad's B or the floating SKIP always just applies.
import type { SubjectRoom } from '../room3d';
import type { ToolKind } from '../scene/tools3d';
import { FocusNav } from '../nav';
import { sfx } from '../sfx';
import { calm } from '../settings';

export type GameKind = 'tap' | 'hold' | 'trace' | 'rhythm' | 'aim';
export interface GameSpec {
  kind: GameKind; tool: ToolKind; verb: string; hint?: string;
  anchor: string; path?: string; targets?: string[]; hits?: number; beats?: number; tempo?: number;
  /** progress of the work 0..1 (gradual changes follow it) */
  onProgress?: (k: number) => void;
  /** the moment the change happens */
  onClimax?: () => void;
}
export type Grade = 'perfect' | 'good' | 'fail';
export interface GameResult { score: number; grade: Grade; skipped: boolean }
export const gradeOf = (s: number): Grade => (s >= 0.82 ? 'perfect' : s >= 0.48 ? 'good' : 'fail');

const INK = '#0a0b10';
const C = {
  steel: ['#2a2e30', '#4a5054', '#6a7276'], amber: ['#a85a10', '#f09a20', '#ffd070'], green: ['#1a7a30', '#3ad060', '#9affb0'],
  red: ['#7a1408', '#d83a20', '#ff7a5a'], white: ['#8a8478', '#d8d2c0', '#fffaf0'], dim: ['#2a2420', '#5a4a38', '#7a6a50'],
};
type Ramp = keyof typeof C;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** CSS px per art pixel (the kit's scale, 2..4) */
function artScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ksn')) || 3;
  return Math.max(2, Math.min(4, Math.round(v)));
}

/** the room with its tool calls silenced (a game that drives something else, like the press) */
function quiet(room: SubjectRoom): SubjectRoom {
  return new Proxy(room, {
    get(t, k) {
      if (typeof k === 'string' && k.startsWith('tool')) return k === 'toolStrike' ? () => Promise.resolve() : () => false;
      const v = (t as any)[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, k, v) { (t as any)[k] = v; return true; },
  });
}

/** play one mini-game over the room; resolves with how well it went (noTool: the tool arm is left alone) */
export function playGame(room: SubjectRoom, spec: GameSpec, host: HTMLElement = document.body, noTool = false): Promise<GameResult> {
  return new Promise((resolve) => new Game(noTool ? quiet(room) : room, spec, host, resolve));
}

/** no game: the robot does it by itself (the "just apply" setting) */
export async function autoPlay(room: SubjectRoom, spec: GameSpec, noTool = false): Promise<GameResult> {
  if (noTool) { spec.onProgress?.(1); spec.onClimax?.(); return { score: 0.9, grade: 'perfect', skipped: true }; }
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  room.toolWork(1);
  await wait(280);
  const strikes = spec.kind === 'tap' ? spec.hits ?? 1 : spec.kind === 'rhythm' ? Math.min(3, spec.beats ?? 3) : 0;
  if (strikes) {
    for (let i = 0; i < strikes; i++) { await room.toolStrike(1); spec.onProgress?.((i + 1) / strikes); if (i === strikes - 1) spec.onClimax?.(); }
  } else {
    room.toolRun(1); room.toolPress(spec.kind === 'hold' ? 0.7 : 0.4);
    for (let i = 1; i <= 6; i++) { spec.onProgress?.(i / 6); await wait(110); }
    spec.onClimax?.();
  }
  room.toolRun(0); room.toolPress(0); room.toolWork(0);
  return { score: 0.9, grade: 'perfect', skipped: true };
}

interface Note { t: number; dir: 'l' | 'r' | 'u' | 'd'; q: number | null }

class Game {
  private root = document.createElement('div');
  private cv = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private verbEl = document.createElement('div');
  private hintEl = document.createElement('div');
  private skipEl = document.createElement('button');
  private nav: FocusNav;
  private ks = 3; private W = 0; private H = 0;
  private t = 0; private last = 0; private raf = 0; private over = false;
  // input
  private held = false; private heldBy = '';
  private dirs = { l: false, r: false, u: false, d: false };
  private padDirs = { l: false, r: false, u: false, d: false };
  private dir(k: 'l' | 'r' | 'u' | 'd') { return this.dirs[k] || this.padDirs[k]; }
  private ptr = { x: -1, y: -1, down: false, seen: false, id: -1 };
  private padPrev: Record<string, boolean> = {};
  private kbMode = false;
  private presses: { t: number; dir: 'l' | 'r' | 'u' | 'd' | null }[] = [];
  private releases = 0;
  // game state
  private scores: number[] = [];
  private climaxed = false;
  private progress = 0;
  // tap
  private mk = 0; private mkDir = 1; private speed = 1.1; private zc = 0.5; private zw = 0.12; private pz = 0.04; private sweeps = 0; private flashT = 0; private flashQ = 0;
  // hold
  private fill = 0; private band: [number, number] = [0.62, 0.8]; private holding = false; private started = false; private holdWait = 0;
  // trace
  private s = 0; private wob = 0; private wobV = 0; private devSum = 0; private devN = 0; private cursor = { x: 0, y: 0 }; private tracing = false; private lastPath: { x: number; y: number }[] = []; private aimTick = 0;
  // rhythm
  private notes: Note[] = []; private beatNext = 0; private iv = 0.5;
  // aim
  private fills: number[] = []; private waste = 0; private ret = { x: 0, y: 0 }; private spraying = false;
  private limit = 8;

  constructor(private room: SubjectRoom, private spec: GameSpec, host: HTMLElement, private done: (r: GameResult) => void) {
    this.root.className = 'qx';
    this.root.dataset.kind = spec.kind;
    this.cv.className = 'qx-cv';
    this.verbEl.className = 'qx-verb';
    this.hintEl.className = 'qx-hint';
    this.skipEl.className = 'qx-skip';
    this.skipEl.type = 'button';
    this.skipEl.innerHTML = '<span>Skip</span><small>just apply · esc</small>';
    this.skipEl.addEventListener('click', (e) => { e.stopPropagation(); this.finish(true); });
    this.skipEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.verbEl.textContent = spec.verb;
    this.hintEl.innerHTML = spec.hint ?? this.defaultHint();
    this.root.append(this.cv, this.verbEl, this.hintEl, this.skipEl);
    host.append(this.root);
    this.ctx = this.cv.getContext('2d')!;
    this.resize();
    room.inputLocked = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.nav = new FocusNav(this.root, { onBack: () => this.finish(true), onArrow: () => true });
    this.bind();
    this.setup();
    requestAnimationFrame(() => this.root.classList.add('on'));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private defaultHint(): string {
    const touch = matchMedia('(pointer: coarse)').matches;
    switch (this.spec.kind) {
      case 'tap': return touch ? 'tap when the marker is in the lit teeth' : 'press <b>space</b> when the marker is in the lit teeth';
      case 'hold': return touch ? 'hold, release inside the brackets' : 'hold <b>space</b> · release inside the brackets';
      case 'trace': return touch ? 'drag along the line, start at the arrow' : 'drag along the line · or hold <b>space</b> and steer with <b>↑ ↓</b>';
      case 'rhythm': return touch ? 'tap on the beat' : 'on the beat: <b>space</b> or the matching arrow';
      case 'aim': return touch ? 'drag over the marks to spray' : 'hold the mouse (or <b>space</b>, aim with arrows) over the marks';
    }
  }

  // ---------------------------------------------------------------- input
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.over) return;
    const k = e.key;
    const dir = k === 'ArrowLeft' ? 'l' : k === 'ArrowRight' ? 'r' : k === 'ArrowUp' ? 'u' : k === 'ArrowDown' ? 'd' : null;
    if (dir) { this.dirs[dir] = true; this.kbMode = true; if (!e.repeat && this.spec.kind === 'rhythm') this.press(dir); e.preventDefault(); return; }
    if (k === ' ' || k === 'Enter' || k === 'Spacebar') {
      e.preventDefault();
      this.kbMode = true;
      if (e.repeat) return;
      this.held = true; this.heldBy = 'key';
      this.press(null);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key;
    const dir = k === 'ArrowLeft' ? 'l' : k === 'ArrowRight' ? 'r' : k === 'ArrowUp' ? 'u' : k === 'ArrowDown' ? 'd' : null;
    if (dir) { this.dirs[dir] = false; return; }
    if ((k === ' ' || k === 'Enter' || k === 'Spacebar') && this.heldBy === 'key') { this.held = false; this.releases++; }
  };
  private bind() {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    const r = this.root;
    r.addEventListener('pointerdown', (e) => {
      if (this.over) return;
      r.setPointerCapture?.(e.pointerId);
      this.ptr = { x: e.clientX, y: e.clientY, down: true, seen: true, id: e.pointerId };
      this.kbMode = false;
      this.held = true; this.heldBy = 'ptr';
      this.press(null);
    });
    r.addEventListener('pointermove', (e) => { this.ptr.x = e.clientX; this.ptr.y = e.clientY; if (e.pointerType === 'mouse') { this.ptr.seen = true; if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.kbMode = false; } });
    const up = (e: PointerEvent) => { if (e.pointerId !== this.ptr.id && this.ptr.id !== -1) return; this.ptr.down = false; if (this.heldBy === 'ptr') { this.held = false; this.releases++; } };
    r.addEventListener('pointerup', up);
    r.addEventListener('pointercancel', up);
    window.addEventListener('resize', this.resize);
  }
  private unbind() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('resize', this.resize);
  }
  private pollPad() {
    const p = [...(navigator.getGamepads?.() || [])].find(Boolean) as Gamepad | undefined;
    if (!p) return;
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const edge = (k: string, v: boolean) => { const was = this.padPrev[k]; this.padPrev[k] = v; return v && !was ? 1 : !v && was ? -1 : 0; };
    const a = edge('a', b(0) || b(7));
    if (a === 1) { this.kbMode = true; this.held = true; this.heldBy = 'pad'; this.press(null); }
    if (a === -1 && this.heldBy === 'pad') { this.held = false; this.releases++; }
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const map: [string, boolean][] = [['l', b(14) || ax < -0.5], ['r', b(15) || ax > 0.5], ['u', b(12) || ay < -0.5], ['d', b(13) || ay > 0.5]];
    for (const [k, v] of map) { const e = edge('d' + k, v); this.padDirs[k as 'l'] = v; if (e === 1) { this.kbMode = true; if (this.spec.kind === 'rhythm') this.press(k as 'l'); } }
  }
  private press(dir: 'l' | 'r' | 'u' | 'd' | null) { this.presses.push({ t: this.t, dir }); }

  private resize = () => {
    this.ks = artScale();
    const w = window.innerWidth, h = window.innerHeight;
    this.W = Math.ceil(w / this.ks); this.H = Math.ceil(h / this.ks);
    this.cv.width = this.W; this.cv.height = this.H;
    this.cv.style.width = this.W * this.ks + 'px'; this.cv.style.height = this.H * this.ks + 'px';
    this.ctx.imageSmoothingEnabled = false;
  };

  // ---------------------------------------------------------------- set up per kind
  private setup() {
    const S = this.spec;
    this.room.toolWork(S.kind === 'trace' || S.kind === 'aim' ? 0.6 : 1);
    switch (S.kind) {
      case 'tap': this.zc = 0.3 + Math.random() * 0.4; this.speed = 0.9 + Math.random() * 0.2; this.limit = 99; break;
      case 'hold': { const c = 0.6 + Math.random() * 0.16; this.band = [c - 0.085, c + 0.085]; this.limit = 99; break; }
      case 'trace': this.limit = 9; break;
      case 'rhythm': {
        const n = S.beats ?? 5;
        this.iv = 60 / (S.tempo ?? 112);
        const lead = 1.4;
        const dirs: Note['dir'][] = ['l', 'u', 'r', 'd'];
        for (let i = 0; i < n; i++) this.notes.push({ t: lead + i * this.iv * (i > 0 && Math.random() < 0.25 ? 1.5 : 1) + (i > 0 ? 0 : 0), dir: dirs[Math.floor(Math.random() * 4)], q: null });
        // keep the gaps monotonic
        for (let i = 1; i < n; i++) this.notes[i].t = Math.max(this.notes[i].t, this.notes[i - 1].t + this.iv * (Math.random() < 0.3 ? 1.5 : 1));
        this.beatNext = lead - this.iv * 2;
        this.limit = this.notes[n - 1].t + 1.2;
        break;
      }
      case 'aim': {
        const n = (S.targets ?? []).length;
        this.fills = new Array(n).fill(0);
        const a = this.room.anchorScreen(S.targets?.[0] ?? S.anchor);
        this.ret = a ? { x: a.x + 60, y: a.y + 40 } : { x: innerWidth / 2, y: innerHeight / 2 };
        this.limit = 8;
        break;
      }
    }
  }

  // ---------------------------------------------------------------- loop
  private loop = (now: number) => {
    if (this.over) return;
    this.raf = requestAnimationFrame(this.loop);
    // real time (a slow device still gets a fair clock)
    const dt = Math.min(0.12, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.pollPad();
    switch (this.spec.kind) {
      case 'tap': this.tapUpdate(dt); break;
      case 'hold': this.holdUpdate(dt); break;
      case 'trace': this.traceUpdate(dt); break;
      case 'rhythm': this.rhythmUpdate(dt); break;
      case 'aim': this.aimUpdate(dt); break;
    }
    this.presses.length = 0; this.releases = 0;
    if (this.over) return;
    this.draw();
  };

  private setProgress(k: number) {
    k = clamp(k, 0, 1);
    if (k <= this.progress + 1e-4) return;
    this.progress = k;
    this.spec.onProgress?.(k);
  }
  private climax() { if (this.climaxed) return; this.climaxed = true; this.spec.onClimax?.(); }

  private finish(skipped = false) {
    if (this.over) return;
    this.over = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.nav.destroy();
    this.room.inputLocked = false;
    this.room.toolRun(0); this.room.toolPress(0);
    if (this.spec.kind === 'trace' || this.spec.kind === 'aim') this.room.toolAnchor(this.spec.anchor);
    let score = this.scores.length ? this.scores.reduce((a, b) => a + b, 0) / this.scores.length : 0;
    if (skipped) { score = 0.8; this.setProgress(1); }
    this.climax();
    this.setProgress(1);
    this.root.classList.remove('on');
    this.root.classList.add('off');
    setTimeout(() => this.root.remove(), 260);
    this.done({ score, grade: skipped ? 'good' : gradeOf(score), skipped });
  }

  /** a floating judgement at a point (client px) */
  private pop(text: string, x: number, y: number, tone: Ramp) {
    const el = document.createElement('div');
    el.className = `qx-pop t-${tone}`;
    el.textContent = text;
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    this.root.append(el);
    setTimeout(() => el.remove(), 900);
  }
  private judge(q: number, x: number, y: number) {
    if (q >= 0.95) { this.pop('Perfect', x, y, 'green'); sfx('hit'); }
    else if (q >= 0.6) { this.pop('Good', x, y, 'amber'); sfx('hit', 0.7); }
    else if (q > 0.15) { this.pop('Sloppy', x, y, 'white'); sfx('miss', 0.6); }
    else { this.pop('Miss', x, y, 'red'); sfx('miss'); }
  }

  /** the anchor on screen in art px, or the middle */
  private anchorArt(): { x: number; y: number } {
    const a = this.room.anchorScreen(this.spec.anchor);
    return a ? { x: a.x / this.ks, y: a.y / this.ks } : { x: this.W / 2, y: this.H / 2 };
  }
  /** where a gauge sits: beside the subject, kept on screen and off the creator's text */
  private gaugeSpot(w: number, h: number, below = true): { x: number; y: number } {
    const a = this.anchorArt();
    const portrait = this.H > this.W * 1.05;
    let x: number, y: number;
    if (below || portrait) { x = a.x - w / 2; y = portrait ? this.H * 0.56 : Math.max(a.y + this.H * 0.2, this.H * 0.62); }
    else { x = a.x + this.W * 0.16; y = a.y - h / 2; }
    return { x: Math.round(clamp(x, 8, this.W - w - 8)), y: Math.round(clamp(y, 8, this.H - h - 26)) };
  }

  // ---------------------------------------------------------------- tap: strike in the zone
  private tapUpdate(dt: number) {
    const need = this.spec.hits ?? 1;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0 && this.scores.length >= need) { this.finish(); return; } return; }
    this.mk += this.mkDir * this.speed * dt;
    if (this.mk > 1) { this.mk = 2 - this.mk; this.mkDir = -1; this.sweeps++; }
    if (this.mk < 0) { this.mk = -this.mk; this.mkDir = 1; this.sweeps++; }
    if (this.mk > 0.45 && this.mk < 0.55 && Math.random() < dt * 6) sfx('tick', 0.4);
    const hit = this.presses.length > 0 || this.sweeps >= 6;
    if (!hit) return;
    const d = Math.abs(this.mk - this.zc);
    const q = this.sweeps >= 6 && !this.presses.length ? 0 : d <= this.pz ? 1 : d <= this.zw ? 0.92 - ((d - this.pz) / (this.zw - this.pz)) * 0.3 : Math.max(0, 0.42 - (d - this.zw) * 3);
    this.scores.push(q);
    const g = this.gaugeSpot(124, 20);
    this.judge(q, (g.x + this.mk * 124) * this.ks, (g.y - 6) * this.ks);
    void this.room.toolStrike(q);
    this.setProgress(this.scores.length / need);
    if (this.scores.length >= need) this.climax();
    this.flashT = 0.45; this.flashQ = q;
    this.sweeps = 0;
    this.zc = 0.25 + Math.random() * 0.5; this.speed *= 1.18;
  }

  // ---------------------------------------------------------------- hold: build and release in the bracket
  private holdDone = -1;
  private holdUpdate(dt: number) {
    if (this.holdDone >= 0) { this.holdDone += dt; if (this.holdDone > 0.45) this.finish(); return; }
    if (this.held && !this.holding) { this.holding = true; this.started = true; sfx('servo', 0.5); }
    if (this.holding) {
      this.fill += dt * (0.42 + this.fill * 0.5);
      this.room.toolPress(this.fill); this.room.toolRun(this.spec.tool === 'injector' ? 0 : 0.6);
      this.setProgress(this.fill / ((this.band[0] + this.band[1]) / 2));
      if (this.fill >= 1) { this.fill = 1; this.release(); return; }
      if (!this.held) { this.release(); return; }
    } else if (!this.started) { this.holdWait += dt; if (this.holdWait > 7) { this.scores.push(0); this.finish(); } }
  }
  private release() {
    this.holding = false;
    const [a, b] = this.band, c = (a + b) / 2;
    const f = this.fill;
    const q = f >= 1 ? 0 : f < a ? Math.max(0, 0.45 - (a - f) * 2.5) : f > b ? Math.max(0, 0.45 - (f - b) * 4) : 1 - (Math.abs(f - c) / (b - a)) * 0.5;
    this.scores.push(q);
    const g = this.gaugeSpot(10, 82, false);
    this.judge(q, (g.x + 18) * this.ks, (g.y + (1 - f) * 80) * this.ks);
    if (f >= 1) { this.pop('Overload', (g.x + 18) * this.ks, (g.y - 8) * this.ks, 'red'); sfx('crack'); }
    void this.room.toolStrike(q);
    this.climax();
    this.holdDone = 0;
  }

  // ---------------------------------------------------------------- trace: cut along the line
  private traceUpdate(dt: number) {
    const raw = this.room.pathScreen(this.spec.path ?? 'jaw');
    if (raw.length < 2) { this.scores.push(0.8); this.finish(); return; }
    const pts = raw.map((p) => ({ x: p.x / this.ks, y: p.y / this.ks }));
    this.lastPath = pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1];
    const at = (s: number) => {
      s = clamp(s, 0, total);
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const k = (s - cum[i - 1]) / Math.max(1e-4, cum[i] - cum[i - 1]);
      const ax = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, ay = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k;
      let nx = -(pts[i].y - pts[i - 1].y), ny = pts[i].x - pts[i - 1].x; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      return { x: ax, y: ay, nx, ny };
    };
    const R = matchMedia('(pointer: coarse)').matches ? 9 : 7;
    let cutting = false, dev = 0;
    if (this.ptr.down && !this.kbMode) {
      // the pointer: find the nearest point of the line just ahead of the cut
      const px = this.ptr.x / this.ks, py = this.ptr.y / this.ks;
      let best = this.s, bd = 1e9;
      for (let s = Math.max(0, this.s - 6); s <= Math.min(total, this.s + 26); s += 1) { const p = at(s); const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = s; } }
      if (bd <= R * 2.2) { cutting = true; if (best > this.s) this.s = best; dev = bd; }
      else if (this.tracing) { dev = R * 2.2; cutting = true; }
      this.cursor = { x: px, y: py };
    } else if (this.held && (this.kbMode || !this.ptr.seen || this.heldBy !== 'ptr')) {
      // keys: the blade runs along by itself, it drifts, ↑/↓ steer it back
      this.s = Math.min(total, this.s + dt * total / 2.6);
      this.wobV += (Math.random() - 0.5) * dt * 220 + Math.sign(this.wob || 1) * dt * 26;
      this.wobV *= Math.exp(-dt * 2);
      const steer = (this.dir('u') ? 1 : 0) - (this.dir('d') ? 1 : 0);
      this.wobV += steer * dt * 160;
      this.wob = clamp(this.wob + this.wobV * dt, -R * 2.4, R * 2.4);
      const p = at(this.s);
      this.cursor = { x: p.x + p.nx * this.wob, y: p.y + p.ny * this.wob };
      cutting = true; dev = Math.abs(this.wob);
    }
    if (cutting && !this.tracing) { this.tracing = true; sfx(this.spec.tool === 'laser' ? 'zap' : this.spec.tool === 'clipper' ? 'clip' : 'slice', 0.7); }
    this.tracing = cutting;
    if (cutting) { this.devSum += Math.min(dev, R * 2.2) * dt; this.devN += dt; }
    this.room.toolWork(cutting ? 1 : 0.6);
    this.room.toolRun(cutting ? 1 : 0.15);
    this.room.toolPress(cutting ? 0.5 + Math.min(1, dev / R) * 0.5 : 0);
    if (cutting && (this.aimTick++ & 1) === 0) this.room.toolAim(this.cursor.x * this.ks, this.cursor.y * this.ks);
    if (!cutting && this.s < 0.5) { const p = at(0); if ((this.aimTick++ & 7) === 0) this.room.toolAim(p.x * this.ks, p.y * this.ks); }
    this.setProgress(this.s / total);
    if (this.s / total > 0.5) this.climax();
    const finish = (sc: number) => { this.scores = [sc]; this.finish(); };
    const mean = this.devN > 0 ? this.devSum / this.devN : R;
    if (this.s >= total - 0.5) finish(clamp(1.08 - mean / (R * 1.25), 0, 1));
    else if (this.t > this.limit) finish(clamp((this.s / total) * (1 - mean / (R * 2)) * 0.7, 0, 0.45));
  }

  // ---------------------------------------------------------------- rhythm: on the beat
  private rhythmUpdate(_dt: number) {
    const t = this.t;
    if (t >= this.beatNext) { sfx('beat', this.beatNext < this.notes[0].t - 0.01 ? 0.8 : 0.35); this.beatNext += this.iv; }
    const g = this.gaugeSpot(150, 20);
    for (const p of this.presses) {
      let best: Note | null = null, bd = 1e9;
      for (const n of this.notes) { if (n.q !== null) continue; const d = Math.abs(n.t - p.t); if (d < bd) { bd = d; best = n; } }
      if (!best || bd > 0.24) { sfx('miss', 0.4); continue; }
      let q = bd < 0.07 ? 1 : bd < 0.14 ? 0.72 : 0.38;
      if (p.dir && p.dir !== best.dir) q *= 0.5;
      best.q = q;
      this.scores.push(q);
      this.judge(q, (g.x + 12) * this.ks, (g.y - 8) * this.ks);
      void this.room.toolStrike(q);
    }
    for (const n of this.notes) if (n.q === null && t - n.t > 0.24) { n.q = 0; this.scores.push(0); this.judge(0, (g.x + 12) * this.ks, (g.y - 8) * this.ks); }
    const doneN = this.notes.filter((n) => n.q !== null).length;
    this.setProgress(doneN / this.notes.length);
    if (doneN >= Math.ceil(this.notes.length / 2)) this.climax();
    if (doneN >= this.notes.length && t > this.notes[this.notes.length - 1].t + 0.3) this.finish();
  }

  // ---------------------------------------------------------------- aim: spray the marks
  private aimUpdate(dt: number) {
    const T = (this.spec.targets ?? []).map((k) => this.room.anchorScreen(k));
    // the reticle: the pointer, or arrows / stick (a gentle pull toward the nearest unfinished mark)
    if (!this.kbMode && this.ptr.seen) { this.ret.x = this.ptr.x; this.ret.y = this.ptr.y; }
    else {
      const sp = 300 * dt;
      this.ret.x += ((this.dir('r') ? 1 : 0) - (this.dir('l') ? 1 : 0)) * sp;
      this.ret.y += ((this.dir('d') ? 1 : 0) - (this.dir('u') ? 1 : 0)) * sp;
      let bi = -1, bd = 1e9;
      T.forEach((p, i) => { if (!p || this.fills[i] >= 1) return; const d = Math.hypot(p.x - this.ret.x, p.y - this.ret.y); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0 && bd < 200) { const p = T[bi]!; this.ret.x += (p.x - this.ret.x) * Math.min(1, dt * 1.6); this.ret.y += (p.y - this.ret.y) * Math.min(1, dt * 1.6); }
      this.ret.x = clamp(this.ret.x, 0, innerWidth); this.ret.y = clamp(this.ret.y, 0, innerHeight);
    }
    const spraying = this.held;
    if (spraying !== this.spraying) { this.spraying = spraying; if (spraying) sfx('spray', 0.5); }
    const R = 30 * (this.ks / 3) + 10;
    let near = false;
    if (spraying) {
      T.forEach((p, i) => {
        if (!p) return;
        const d = Math.hypot(p.x - this.ret.x, p.y - this.ret.y);
        if (d < R) { near = true; this.fills[i] = Math.min(1, this.fills[i] + dt * 0.95 * (1 - (d / R) * 0.4)); }
      });
      if (!near) this.waste += dt;
    }
    this.room.toolWork(spraying ? 1 : 0.6);
    this.room.toolRun(spraying ? 1 : 0);
    if ((this.aimTick++ & 1) === 0 && !this.room.toolAim(this.ret.x, this.ret.y) && spraying) this.waste += dt * 0.5;
    const mean = this.fills.length ? this.fills.reduce((a, b) => a + b, 0) / this.fills.length : 1;
    this.setProgress(mean);
    if (mean > 0.5) this.climax();
    const score = () => clamp(mean * (1 - Math.min(0.55, this.waste * 0.18)), 0, 1);
    if (this.fills.every((f) => f >= 1)) { this.scores = [score()]; this.finish(); }
    else if (this.t > this.limit) { this.scores = [score() * 0.75]; this.finish(); }
  }

  // ---------------------------------------------------------------- drawing
  /** an inked, bevelled block of art pixels */
  private seg(x: number, y: number, w: number, h: number, ramp: Ramp, lit = 1) {
    const c = this.ctx, R = C[ramp];
    c.fillStyle = INK; c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = lit > 0.5 ? R[1] : R[0]; c.fillRect(x, y, w, h);
    c.fillStyle = lit > 0.5 ? R[2] : R[1]; c.fillRect(x, y, w, 1);
    if (h > 2) { c.fillStyle = R[0]; c.fillRect(x, y + h - 1, w, 1); }
  }
  private px(x: number, y: number, w: number, h: number, col: string) { this.ctx.fillStyle = col; this.ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  /** a chevron pointing down at (x, y) (its tip), 7 wide */
  private chevDown(x: number, y: number, ramp: Ramp) {
    x = Math.round(x); y = Math.round(y);
    const R = C[ramp];
    for (let r = 0; r < 4; r++) { this.px(x - 3 + r - 1, y - 4 + r, 7 - r * 2 + 2, 1, INK); }
    for (let r = 0; r < 3; r++) this.px(x - 3 + r, y - 4 + r, 7 - r * 2, 1, r === 0 ? R[2] : R[1]);
    this.px(x, y, 1, 1, INK);
  }
  private arrow(x: number, y: number, dir: Note['dir'], ramp: Ramp, a = 1) {
    // a 9x9 pixel arrow glyph with ink
    const G: Record<Note['dir'], string[]> = {
      r: ['...##....', '...#a#...', '####ab#..', '#aaaaab#.', '#abbbbbc#', '####bc#..', '...#c#...', '...##....', '.........'],
      l: ['....##...', '...#a#...', '..#ab####', '.#aaaaaa#', '#abbbbbc#', '..#bc####', '...#c#...', '....##...', '.........'],
      u: ['....#....', '...#a#...', '..#aab#..', '.#aaabb#.', '###ab####', '..#ab#...', '..#ab#...', '..#bc#...', '..####...'],
      d: ['..####...', '..#ab#...', '..#ab#...', '..#ab#...', '###ab####', '.#aabbc#.', '..#abc#..', '...#c#...', '....#....'],
    };
    const R = C[ramp];
    this.ctx.globalAlpha = a;
    G[dir].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '.') return; this.px(x - 4 + i, y - 4 + j, 1, 1, ch === '#' ? INK : ch === 'a' ? R[2] : ch === 'b' ? R[1] : R[0]); }));
    this.ctx.globalAlpha = 1;
  }
  /** four corner ticks round a point (a target mark), size s */
  private corners(x: number, y: number, s: number, ramp: Ramp) {
    const R = C[ramp], L = 3;
    x = Math.round(x); y = Math.round(y);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + sx * s, cy = y + sy * s;
      const hx = sx < 0 ? cx : cx - L + 1, vy = sy < 0 ? cy : cy - L + 1;
      this.px(hx - 1, cy - 1, L + 2, 3, INK); this.px(cx - 1, vy - 1, 3, L + 2, INK);
      this.px(hx, cy, L, 1, R[2]); this.px(cx, vy, 1, L, R[1]);
    }
  }
  /** the crosshair: four ticks with a gap (no circle) */
  private reticle(x: number, y: number, ramp: Ramp, gap = 3) {
    x = Math.round(x); y = Math.round(y);
    const R = C[ramp];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let i = gap; i < gap + 4; i++) { this.px(x + dx * i - 1, y + dy * i - 1, 3, 3, INK); }
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = gap; i < gap + 4; i++) this.px(x + dx * i, y + dy * i, 1, 1, i === gap ? R[2] : R[1]);
    this.px(x, y, 1, 1, R[2]);
  }

  private draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.W, this.H);
    switch (this.spec.kind) {
      case 'tap': {
        const N = 31, w = N * 4, g = this.gaugeSpot(w, 20);
        const flash = this.flashT > 0 && Math.floor(this.flashT * 16) % 2 === 0;
        for (let i = 0; i < N; i++) {
          const u = (i + 0.5) / N, d = Math.abs(u - this.zc);
          const ramp: Ramp = d <= this.pz + 0.5 / N ? 'green' : d <= this.zw ? 'amber' : 'steel';
          const tall = ramp === 'steel' ? 6 : 9;
          this.seg(g.x + i * 4, g.y + 10 - tall, 3, tall, flash && ramp !== 'steel' ? (this.flashQ > 0.6 ? 'green' : 'red') : ramp, ramp === 'steel' ? 0 : 1);
        }
        this.chevDown(g.x + this.mk * w, g.y - 3, this.flashT > 0 ? (this.flashQ > 0.6 ? 'green' : 'red') : 'white');
        const need = this.spec.hits ?? 1;
        if (need > 1) for (let i = 0; i < need; i++) this.seg(g.x + w / 2 - need * 4 + i * 8, g.y + 16, 5, 3, i < this.scores.length ? (this.scores[i] > 0.6 ? 'green' : 'red') : 'dim', 1);
        break;
      }
      case 'hold': {
        const N = 20, g = this.gaugeSpot(10, N * 4, false);
        for (let i = 0; i < N; i++) {
          const u = (i + 0.5) / N;
          const inBand = u >= this.band[0] && u <= this.band[1];
          const on = u <= this.fill;
          const ramp: Ramp = on ? (u > this.band[1] ? 'red' : inBand ? 'green' : 'amber') : inBand ? 'dim' : 'steel';
          this.seg(g.x, g.y + (N - 1 - i) * 4, 9, 3, ramp, on ? 1 : 0);
        }
        // the bracket either side of the band
        const y0 = g.y + (1 - this.band[1]) * N * 4, y1 = g.y + (1 - this.band[0]) * N * 4;
        for (const x of [g.x - 5, g.x + 12]) { this.px(x - 1, y0 - 1, 4, y1 - y0 + 2, INK); this.px(x, y0, 2, y1 - y0, C.green[1]); this.px(x, y0, 2, 1, C.green[2]); }
        this.px(g.x - 7, y0 - 1, 4, 3, INK); this.px(g.x + 13, y0 - 1, 4, 3, INK); this.px(g.x - 6, y0, 2, 1, C.green[2]); this.px(g.x + 14, y0, 2, 1, C.green[2]);
        this.px(g.x - 7, y1 - 2, 4, 3, INK); this.px(g.x + 13, y1 - 2, 4, 3, INK); this.px(g.x - 6, y1 - 1, 2, 1, C.green[1]); this.px(g.x + 14, y1 - 1, 2, 1, C.green[1]);
        // the pressure needle
        const ny = g.y + (1 - this.fill) * N * 4;
        this.arrow(g.x - 10, Math.round(ny), 'r', this.fill > this.band[1] ? 'red' : 'white');
        break;
      }
      case 'trace': {
        const P = this.lastPath;
        if (P.length < 2) break;
        // the line: dotted ahead, a solid red cut behind
        let acc = 0;
        for (let i = 1; i < P.length; i++) {
          const a = P[i - 1], b = P[i], L = Math.hypot(b.x - a.x, b.y - a.y);
          for (let s = 0; s < L; s += 1) {
            const k = s / Math.max(1e-4, L), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, al = acc + s;
            if (al <= this.s) { this.px(x - 1, y - 1, 3, 3, INK); }
            else if (Math.floor(al) % 4 === 0) { this.px(x - 1, y - 1, 3, 3, INK); }
          }
          acc += L;
        }
        acc = 0;
        for (let i = 1; i < P.length; i++) {
          const a = P[i - 1], b = P[i], L = Math.hypot(b.x - a.x, b.y - a.y);
          for (let s = 0; s < L; s += 1) {
            const k = s / Math.max(1e-4, L), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, al = acc + s;
            if (al <= this.s) this.px(x, y, 1, 1, C.red[1 + ((Math.floor(al) >> 1) & 1)]);
            else if (Math.floor(al) % 4 === 0) this.px(x, y, 1, 1, Math.floor(this.t * 6 + al / 8) % 3 === 0 ? C.amber[2] : C.amber[1]);
          }
          acc += L;
        }
        if (this.s < 1) {
          // the start: a bobbing chevron above the first point
          const p = P[0];
          this.chevDown(p.x, p.y - 4 - Math.round(Math.abs(Math.sin(this.t * 5)) * 3), 'amber');
        }
        const end = P[P.length - 1];
        this.px(end.x - 2, end.y - 2, 5, 5, INK); this.px(end.x - 1, end.y - 1, 3, 3, C.green[1]);
        if (this.tracing || this.kbMode) this.reticle(this.cursor.x, this.cursor.y, this.tracing ? 'white' : 'amber', 2);
        break;
      }
      case 'rhythm': {
        const g = this.gaugeSpot(150, 20), x0 = g.x + 12, y = g.y + 10, pps = 70;
        // the lane: a row of ticks, the strike bars
        for (let x = x0; x < g.x + 150; x += 6) this.px(x, y + 7, 2, 1, C.dim[1]);
        for (const dx of [-7, 6]) { this.px(x0 + dx - 1, y - 8, 3, 18, INK); this.px(x0 + dx, y - 7, 1, 16, C.amber[1]); this.px(x0 + dx, y - 7, 1, 1, C.amber[2]); }
        for (const n of this.notes) {
          const x = x0 + (n.t - this.t) * pps;
          if (n.q !== null) {
            if (this.t - n.t < 0.3 && n.q > 0) this.arrow(x0, y - Math.round((this.t - n.t) * 30), n.dir, n.q > 0.9 ? 'green' : 'amber', 1 - (this.t - n.t) / 0.3);
            continue;
          }
          if (x > g.x + 154) continue;
          const close = Math.abs(n.t - this.t) < 0.14;
          this.arrow(Math.round(x), y, n.dir, close ? 'green' : 'white');
        }
        break;
      }
      case 'aim': {
        const T = (this.spec.targets ?? []).map((k) => this.room.anchorScreen(k));
        T.forEach((p, i) => {
          if (!p) return;
          const x = p.x / this.ks, y = p.y / this.ks, f = this.fills[i];
          const s = 6 + Math.round(Math.sin(this.t * 4 + i) * 1);
          this.corners(x, y, s, f >= 1 ? 'green' : 'amber');
          for (let j = 0; j < 5; j++) this.seg(Math.round(x) - 9 + j * 4, Math.round(y) + s + 5, 2, 2, f > (j + 0.5) / 5 ? (f >= 1 ? 'green' : 'amber') : 'steel', f > (j + 0.5) / 5 ? 1 : 0);
        });
        this.reticle(this.ret.x / this.ks, this.ret.y / this.ks, this.spraying ? 'green' : 'white', this.spraying ? 2 + (Math.floor(this.t * 20) & 1) : 3);
        // the clock: teeth running out
        const left = clamp(1 - this.t / this.limit, 0, 1), N = 16, gx = Math.round(this.W / 2 - N * 2), gy = this.H - 22;
        for (let i = 0; i < N; i++) this.seg(gx + i * 4, gy, 2, 3, (i + 0.5) / N < left ? (left < 0.25 ? 'red' : 'amber') : 'steel', (i + 0.5) / N < left ? 1 : 0);
        break;
      }
    }
    // the trace clock too
    if (this.spec.kind === 'trace') {
      const left = clamp(1 - this.t / this.limit, 0, 1), N = 16, gx = Math.round(this.W / 2 - N * 2), gy = this.H - 22;
      for (let i = 0; i < N; i++) this.seg(gx + i * 4, gy, 2, 3, (i + 0.5) / N < left ? (left < 0.25 ? 'red' : 'amber') : 'steel', (i + 0.5) / N < left ? 1 : 0);
    }
    if (calm()) return;
  }
}

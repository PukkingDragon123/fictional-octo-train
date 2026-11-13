// THE PRESS'S FEED SCREEN (round 17): the press terminal's page for feeding it, item by item,
// built as a sibling of the band's wrist terminal: the same tube (src/ui/crt: amber phosphor,
// scanlines, grain, a rolling bar, a flicker, the bulge and bloom), big turning 3D models
// (src/ui/machine/itemSpin.ts, dressed like crtIcon) instead of words.
//   the pack     everything the unit carries that the press takes, each kind a big turning
//                model (src/ui/machine/itemSpin.ts); hover or tap lifts it, turns it faster and
//                shows one number: what it is worth, in credits
//   the readout  the picked thing's name, its value, and what the crusher gives back as little
//                material models (dim: only a chance)
//   the hopper   ten slots; tap a model (or drag it) and it flies in and snaps; tap a slot to take
//                it back; the gauge fills, the kilos count up
//   the lever    drag it down (or click it, or Space): the screen shakes, static, the load crunches
//                and the materials pop out into the tray while the flip counter rolls the payout;
//                a jackpot flashes amber and overspins the counter in gold
// No rounded corners, no stamps, almost no text. The terminal (terminal.ts) owns the state (the
// queue, waiting, the payout) and the world press; this draws it and keeps its moving parts
// alive across the terminal's re-renders.
import { G } from '../G';
import { itemDef, hasItemDef, type Item } from '../../items/item';
import { mxItemSpin, mxItemStill, type ItemSpin } from '../../ui/machine/itemSpin';
import { itemIcon } from '../../ui/icons';
import { sfx } from '../../ui/menus/sfx';
import { crtScreen, type Crt } from '../../ui/crt/crt';
import { itemValue } from '../debt/values';
import { itemMatter, matterKg, fmtKg } from './matter';
import { slagOf } from './crusher';

export interface FeedHost {
  /** what the unit carries that the press takes, grouped by kind, dearest first */
  rows(): Item[][];
  queue: Item[];
  slots: number;
  canCrush(): boolean;
  busy(): boolean;
  load(it: Item): void;
  unload(it: Item): void;
  crush(): void;
  /** the share of a load's value that goes to the debt (0 with no contract) */
  share(): number;
  /** the terminal's glass, shaken when the load crunches */
  screen: HTMLElement;
}
export interface Payout { value: number; out: string[]; jack: number; bonus: number; drop: string }

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const iname = (k: string) => (hasItemDef(k) ? itemDef(k).name : k.replace(/_/g, ' '));
const nameOf = (it: Item) => it.name || iname(it.key);
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const kgOf = (it: Item) => { const m = matterKg(itemMatter(it)); return m > 0 ? m : (hasItemDef(it.key) ? itemDef(it.key).weight ?? 0 : 0); };
const reduce = () => document.documentElement.classList.contains('reduce-flash') || document.body.classList.contains('reduce-flash');
const audio = (key: string, vol: number) => { try { G?.audio?.ui?.(key, vol); } catch { /* no audio */ } };
/** the credit glyph: a pixel cent sign (7 x 9), in the text's colour */
export const CR = '<svg class="pf-cr" viewBox="0 0 7 9" shape-rendering="crispEdges" aria-label="credits"><path fill="currentColor" d="M3 0h1v1h2v1H4v5h2v1H4v1H3V8H1V7H0V2h1V1h2zm0 2H1v5h2z"/></svg>';
/** a still of an item as a canvas (the machine kit), or its plain icon */
function still(key: string, size: number): HTMLElement {
  const cv = mxItemStill(key, size);
  if (cv) return cv;
  const u = (G as unknown as { pr?: { renderer?: unknown } })?.pr?.renderer ? itemIcon(key, '', size) : '';
  const im = h('img', 'mxi-cv') as HTMLImageElement; if (u) im.src = u; im.width = size + 8; im.height = size + 8;
  return im;
}

// ------------------------------------------------------------------ the flip counter
// Seven-segment digits two art pixels thick on flip cards (9 x 16), drawn at 2 CSS px a pixel;
// a lamp each side. A changing digit flips: the old top leaf folds down, the new bottom drops.
const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
const SEGR: Record<string, [number, number, number, number]> = { a: [0, 0, 7, 2], d: [0, 10, 7, 2], g: [0, 5, 7, 2], f: [0, 0, 2, 7], b: [5, 0, 2, 7], e: [0, 5, 2, 7], c: [5, 5, 2, 7] };
const CW = 9, CH = 16, DIG = 6, PXC = 2;
type Ink = 'amber' | 'green' | 'gold' | 'dim';
const INK: Record<Ink, [string, string]> = { amber: ['#ffc850', '#7a4e14'], green: ['#9affb0', '#2a6a3a'], gold: ['#fff4b0', '#c89020'], dim: ['#6a4818', '#2e1f0a'] };
const cards = new Map<string, HTMLCanvasElement>();
function card(ch: string, ink: Ink): HTMLCanvasElement {
  const k = ch + ink;
  let c = cards.get(k);
  if (c) return c;
  c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#140d06'; g.fillRect(0, 0, CW, CH);
  g.fillStyle = '#241708'; g.fillRect(0, 0, CW, 1);
  const [fg, sh] = INK[ink];
  for (const s of SEG[ch] ?? '') { const [x, y, w, hh] = SEGR[s]; g.fillStyle = sh; g.fillRect(2 + x, 3 + y, w, hh); }
  for (const s of SEG[ch] ?? '') { const [x, y, w, hh] = SEGR[s]; g.fillStyle = fg; g.fillRect(1 + x, 2 + y, w, hh); }
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 8, CW, 1);
  cards.set(k, c);
  return c;
}
class Counter {
  readonly cv = document.createElement('canvas');
  private cur: string[] = Array(DIG).fill('0');
  private next: string[] = Array(DIG).fill('0');
  private t: number[] = Array(DIG).fill(1);
  private ink: Ink = 'dim';
  lamps = 0; // 0 off, 1 lit, 2 jackpot blink
  readonly W = 2 + 6 + 3 + DIG * CW + (DIG - 1) + 3 + 6 + 2;
  readonly H = CH + 4;
  constructor() {
    this.cv.width = this.W; this.cv.height = this.H; this.cv.className = 'pf-cnt';
    this.cv.style.width = this.W * PXC + 'px'; this.cv.style.height = this.H * PXC + 'px';
    this.draw(0);
  }
  set(v: number, ink: Ink) {
    const s = String(Math.min(999999, Math.max(0, Math.round(v)))).padStart(DIG, '0');
    if (ink !== this.ink) { this.ink = ink; for (let i = 0; i < DIG; i++) { this.cur[i] = this.next[i]; this.t[i] = 1; } }
    for (let i = 0; i < DIG; i++) if (s[i] !== this.next[i]) { this.cur[i] = this.t[i] < 0.5 ? this.cur[i] : this.next[i]; this.next[i] = s[i]; this.t[i] = 0; }
  }
  step(dt: number, now: number) {
    for (let i = 0; i < DIG; i++) if (this.t[i] < 1) { this.t[i] = Math.min(1, this.t[i] + dt / 0.08); if (this.t[i] >= 1) this.cur[i] = this.next[i]; }
    this.draw(now);
  }
  private draw(now: number) {
    const g = this.cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.W, this.H);
    g.fillStyle = '#0a0703'; g.fillRect(0, 0, this.W, this.H);
    g.fillStyle = '#5a3c12'; g.fillRect(0, 0, this.W, 1); g.fillRect(0, this.H - 1, this.W, 1); g.fillRect(0, 0, 1, this.H); g.fillRect(this.W - 1, 0, 1, this.H);
    const blink = this.lamps === 2 ? Math.floor(now / 110) % 2 : 0;
    for (const [i, x] of [[0, 3], [1, this.W - 9]] as [number, number][]) {
      const on = this.lamps === 1 || (this.lamps === 2 && (blink + i) % 2 === 0);
      g.fillStyle = on ? (this.lamps === 2 ? '#fff0a0' : '#ffb840') : '#3a2608'; g.fillRect(x, 7, 6, 6);
      g.fillStyle = on ? '#ffffff' : '#5a3c12'; g.fillRect(x + 1, 8, 2, 1);
    }
    for (let i = 0; i < DIG; i++) {
      const x = 11 + i * (CW + 1), y = 2;
      const t = this.t[i], a = card(this.cur[i], this.ink), b = card(this.next[i], this.ink);
      if (t >= 1) { g.drawImage(b, x, y); continue; }
      const half = CH / 2;
      g.drawImage(b, 0, 0, CW, half, x, y, CW, half);
      g.drawImage(a, 0, half, CW, half, x, y + half, CW, half);
      if (t < 0.5) { const hh = Math.max(1, Math.round(half * (1 - t * 2))); g.drawImage(a, 0, 0, CW, half, x, y + half - hh, CW, hh); }
      else { const hh = Math.max(1, Math.round(half * (t - 0.5) * 2)); g.drawImage(b, 0, half, CW, half, x, y + half, CW, hh); }
    }
  }
}

// ------------------------------------------------------------------ the lever
// A phosphor drawing of a heavy lever in a slotted track: drag the handle down to the stop.
class Lever {
  readonly cv = document.createElement('canvas');
  p = 0; // 0 up .. 1 down
  private W = 52; private H = 200;
  private ok = false;
  constructor(private fire: () => void, private can: () => boolean) {
    this.cv.className = 'pf-lever';
    let drag: { y0: number; p0: number; moved: boolean } | null = null;
    this.cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.can()) { sfx('error', 0.4); this.nudge(); return; }
      drag = { y0: e.clientY, p0: this.p, moved: false };
      this.cv.setPointerCapture?.(e.pointerId);
      sfx('rocker', 0.4);
    });
    this.cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y0;
      if (Math.abs(dy) > 4) drag.moved = true;
      this.p = Math.max(0, Math.min(1, drag.p0 + dy / this.travel()));
      if (this.p >= 0.94) { drag = null; this.throw(); }
    });
    const up = () => {
      if (!drag) return;
      const tap = !drag.moved; drag = null;
      if (tap) this.throw(); else this.spring();
    };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', () => { drag = null; this.spring(); });
  }
  private travel() { return (this.H - 40) * (this.cv.getBoundingClientRect().height / this.H || 1); }
  private anim(to: number, ms: number, then?: () => void) {
    const from = this.p, t0 = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); this.p = from + (to - from) * (to > from ? k * k : 1 - (1 - k) * (1 - k)); this.draw(); if (k < 1) requestAnimationFrame(step); else then?.(); };
    requestAnimationFrame(step);
  }
  /** all the way down: the press takes the load */
  throw() { if (!this.can()) { this.spring(); return; } this.anim(1, 110, () => { sfx('lever', 0.9); this.fire(); setTimeout(() => this.spring(), 380); }); }
  private spring() { this.anim(0, 260); }
  private nudge() { this.anim(0.12, 70, () => this.anim(0, 120)); }
  size(w: number, h: number) { this.W = w; this.H = h; this.cv.width = w; this.cv.height = h; this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; this.draw(); }
  setOk(v: boolean) { if (v !== this.ok) { this.ok = v; this.draw(); } }
  private beat = -1;
  /** the chevrons run down the track while there is a load to crush */
  tick(now: number) { const b = Math.floor(now / 110); if (this.ok && b !== this.beat) { this.beat = b; this.draw(now); } }
  draw(now = performance.now()) {
    const g = this.cv.getContext('2d')!, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    const ph = this.ok ? '#ffb43a' : '#8a5a14', hi = this.ok ? '#fff0d0' : '#b88a40', dim = '#5a3c12', dark = '#1e1404';
    const cx = Math.round(W / 2), top = 6, bot = H - 8, travel = bot - top - 26;
    // the housing: a plate with a slot down it, a bolt top and bottom
    g.fillStyle = dark; g.fillRect(cx - 12, top, 24, bot - top);
    g.fillStyle = dim; g.fillRect(cx - 12, top, 24, 2); g.fillRect(cx - 12, bot - 2, 24, 2); g.fillRect(cx - 12, top, 2, bot - top); g.fillRect(cx + 10, top, 2, bot - top);
    g.fillStyle = '#000'; g.fillRect(cx - 3, top + 8, 6, bot - top - 16);
    for (const by of [top + 4, bot - 6]) { g.fillStyle = dim; g.fillRect(cx - 8, by - 1, 3, 3); g.fillRect(cx + 5, by - 1, 3, 3); }
    const y = top + 4 + Math.round(travel * this.p);
    // chevrons below the grip, running down while there is a load
    const step = Math.floor(now / 110);
    for (let i = 0, cy = y + 26; cy < bot - 12; i++, cy += 15) {
      const lit = this.ok && ((step - i) % 5 + 5) % 5 === 0;
      g.fillStyle = lit ? hi : this.ok ? ph : dim;
      if (!lit && this.ok) g.globalAlpha = 0.45;
      for (let r = 0; r < 5; r++) { g.fillRect(cx - 9 + r * 2, cy + r * 2, 2, 2); g.fillRect(cx + 7 - r * 2, cy + r * 2, 2, 2); }
      g.globalAlpha = 1;
    }
    // the grip: a heavy bar across the whole column, ridged
    g.fillStyle = dark; g.fillRect(0, y - 2, W, 22);
    g.fillStyle = ph; g.fillRect(2, y, W - 4, 18);
    g.fillStyle = hi; g.fillRect(2, y, W - 4, 2);
    g.fillStyle = '#6a3e0c'; g.fillRect(2, y + 16, W - 4, 2);
    for (let x = 6; x < W - 6; x += 4) { g.fillStyle = '#7a4a10'; g.fillRect(x, y + 5, 2, 8); }
    g.fillStyle = dark; g.fillRect(cx - 3, y + 18, 6, 4);
    // the stop lights when it is home
    g.fillStyle = this.p > 0.95 ? hi : dim; g.fillRect(cx - 14, bot - 4, 28, 4);
  }
}

// ------------------------------------------------------------------ the crunch over the hopper
interface Bit { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }
class Crunch {
  readonly cv = document.createElement('canvas');
  t = -1;
  private load: { im: HTMLCanvasElement; x: number; y: number; w: number; h: number }[] = [];
  private bits: Bit[] = [];
  private hit = false;
  onHit: () => void = () => {};
  constructor() { this.cv.className = 'pf-fx'; }
  get active() { return this.t >= 0 && (this.t < 0.7 || this.bits.length > 0); }
  /** a phosphor bar the width of the hopper, its face a row of hazard blocks */
  private ram(g: CanvasRenderingContext2D, W: number, y: number) {
    g.fillStyle = '#ffb43a'; g.fillRect(0, y - 10, W, 10);
    g.fillStyle = '#fff0d0'; g.fillRect(0, y - 10, W, 2);
    for (let x = 0; x < W; x += 8) { g.fillStyle = (x >> 3) % 2 ? '#1e1404' : '#ffd860'; g.fillRect(x, y - 4, 8, 4); }
  }
  start(load: { im: HTMLCanvasElement; x: number; y: number; w: number; h: number }[]) { this.t = 0; this.hit = false; this.bits = []; this.load = load; }
  skip() { this.t = -1; this.bits = []; this.load = []; this.cv.getContext('2d')?.clearRect(0, 0, this.cv.width, this.cv.height); }
  step(dt: number, W: number, H: number) {
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px'; }
    const g = this.cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    // the load squeezes flat (in steps, like frames of a sprite), then bursts
    if (t < 0.13) {
      const k = Math.floor((t / 0.13) * 4) / 4;
      for (const l of this.load) {
        const hh = Math.max(3, Math.round(l.h * (1 - k * 0.85))), ww = Math.round(l.w * (1 + k * 0.45));
        g.drawImage(l.im, Math.round(l.x + (l.w - ww) / 2), Math.round(l.y + l.h - hh - l.h * 0.12), ww, hh);
      }
      this.ram(g, W, Math.round((t / 0.13) * (H - 16)));
    } else if (!this.hit) {
      this.hit = true;
      this.onHit();
      for (const l of this.load) for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 220;
        this.bits.push({ x: l.x + l.w / 2, y: l.y + l.h * 0.7, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 80, life: 0, max: 0.3 + Math.random() * 0.45, c: Math.random() < 0.3 ? '#fff0d0' : Math.random() < 0.6 ? '#ffb43a' : '#9a6418', s: Math.random() < 0.3 ? 4 : 2 });
      }
      this.load = [];
    }
    // the ram's face: down hard, a beat on the floor, back up
    if (t >= 0.13 && t < 0.5) this.ram(g, W, Math.round(t < 0.3 ? H - 16 : (H - 16) * (1 - (t - 0.3) / 0.2)));
    for (const b of this.bits) { b.life += dt; b.vy += 420 * dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y > H - 3) { b.y = H - 3; b.vy *= -0.35; b.vx *= 0.6; } }
    this.bits = this.bits.filter((b) => b.life < b.max);
    for (const b of this.bits) { g.fillStyle = b.life / b.max > 0.65 ? '#5a3c12' : b.c; g.fillRect(Math.round(b.x / 2) * 2, Math.round(b.y / 2) * 2, b.s, b.s); }
    if (t > 0.7 && !this.bits.length) this.t = -1;
  }
}

// ------------------------------------------------------------------ the screen
export class FeedScreen {
  private sel: Item | null = null;
  private selKey = '';
  private spins = new Map<string, ItemSpin | null>();
  private slotSpins = new Map<number, ItemSpin | null>();
  private counter = new Counter();
  private crunch = new Crunch();
  // no bulge filter: its colour split blurred every model; a faint fringe at the glass edge stands in (terminal.css)
  private crt: Crt = crtScreen({ phos: 'amber', sound: false, bulge: false, bright: 1.12 });
  private lit = false;
  private lever: Lever;
  private tray = h('div', 'pf-tray');
  private read = h('div', 'pf-read');
  private root: HTMLElement | null = null;
  private holder = h('div', 'pf-host');
  private hbox: HTMLElement | null = null;
  private raf = 0; private last = 0;
  private roll: { to: number; t: number; dur: number; over: boolean; ink: Ink } | null = null;
  private jackT = 0;
  private dead = false;
  private lastPtr = 'mouse';
  private drag: { it: Item; x0: number; y0: number; ghost: HTMLElement | null; from: HTMLElement } | null = null;

  constructor(private host: FeedHost) {
    this.lever = new Lever(() => this.host.crush(), () => this.host.canCrush());
    this.holder.append(this.crt.el);
    this.crunch.onHit = () => {
      sfx('slam', 0.9); sfx('grind', 0.5); audio('press_slam', 0.7);
      this.shake();
      void this.crt.swap(() => {});
    };
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.tick(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragUp);
  }

  destroy() {
    this.dead = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragUp);
    this.drag?.ghost?.remove(); this.drag = null;
    this.crt.dispose();
  }
  /** Space pulls the lever */
  pressKey(code: string): boolean { if (code === 'Space' && this.host.canCrush()) { this.lever.throw(); return true; } if (this.busyShow()) { this.skip(); return true; } return false; }

  // ---------------------------------------------------------------- the page
  render(el: HTMLElement) {
    const H = this.host;
    const rows = H.rows();
    if (!this.sel || (!H.queue.includes(this.sel) && !rows.some((g) => g.includes(this.sel!)))) {
      const same = rows.find((g) => this.key(g[0]) === this.selKey);
      this.sel = same?.[0] ?? rows[0]?.[0] ?? null;
    }
    this.selKey = this.sel ? this.key(this.sel) : '';
    const root = this.root = h('div', 'pf' + (this.jackT > 0 ? ' jack' : ''));
    this.crt.glass.innerHTML = '';
    this.crt.glass.append(root);
    const full = H.queue.length >= H.slots || H.busy();
    // ---- the pack: big turning models
    const pack = h('div', 'pf-pack');
    const size = 90;
    const keep = new Set<string>();
    for (const g of rows.slice(0, 40)) {
      const it = g[0], k = this.key(it), v = itemValue(it);
      keep.add(it.key + '|' + size);
      const t = h('button', 'pf-t crt-ic' + (k === this.selKey ? ' sel hot' : '') + (full ? ' off' : '')) as HTMLButtonElement;
      t.type = 'button'; t.dataset.k = k;
      t.setAttribute('aria-label', `${nameOf(it)}, ${fmt(v)} credits`);
      const w = h('span', 'crt-ic-m');
      const sp = this.spin(it.key, size);
      if (sp) { w.append(sp.cv); sp.hot(k === this.selKey); } else w.append(still(it.key, size));
      t.append(w, h('span', 'crt-ic-l', `${g.length > 1 ? `<i>×${g.length}</i>` : ''}<em>${CR}${v > 0 ? fmt(v) : '0'}</em>`));
      t.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.select(it, pack); });
      t.addEventListener('focus', () => this.select(it, pack));
      t.addEventListener('pointerdown', (e) => {
        this.lastPtr = e.pointerType;
        if (full || e.button > 0) return;
        this.drag = { it, x0: e.clientX, y0: e.clientY, ghost: null, from: w };
      });
      t.addEventListener('click', () => {
        if (this.dragged) { this.dragged = false; return; }
        // a touch picks first, then loads; a mouse (or a key) loads straight away
        if (this.lastPtr !== 'mouse' && this.selKey !== k) { this.select(it, pack); this.lastPtr = 'mouse'; return; }
        this.lastPtr = 'mouse';
        if (!full) this.fly(it, w);
      });
      pack.append(t);
    }
    if (!rows.length) pack.append(h('div', 'pf-empty', '—'));
    for (const [k] of this.spins) if (!keep.has(k)) this.spins.delete(k);
    // ---- the readout under the pack
    this.paintRead();
    // ---- the hopper
    const hop = h('div', 'pf-hop');
    const hbox = this.hbox = h('div', 'pf-hbox' + (H.queue.length ? ' fed' : ''));
    const slots = h('div', 'pf-slots');
    const live = new Set<number>();
    for (let i = 0; i < H.slots; i++) {
      const it = H.queue[i];
      const b = h('button', 'pf-slot' + (it ? ' full' : '')) as HTMLButtonElement;
      b.type = 'button';
      if (it) {
        live.add(it.uid);
        let sp = this.slotSpins.get(it.uid);
        if (sp === undefined) { sp = mxItemSpin(it.key, 38, (it.uid % 7) / 7); this.slotSpins.set(it.uid, sp); }
        b.append(sp ? sp.cv : still(it.key, 38));
        b.setAttribute('aria-label', nameOf(it));
        b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.select(it, null); });
        b.addEventListener('click', () => { if (!this.busyShow() && !H.busy()) { sfx('back', 0.4); H.unload(it); } });
      } else b.disabled = true;
      slots.append(b);
    }
    for (const [u] of this.slotSpins) if (!live.has(u)) this.slotSpins.delete(u);
    hbox.append(slots, this.crunch.cv);
    hbox.addEventListener('pointerdown', () => { if (this.busyShow()) this.skip(); });
    hop.append(hbox);
    const kg = H.queue.reduce((a, it) => a + kgOf(it), 0);
    const gauge = h('div', 'pf-gauge');
    const segs = h('span', 'pf-segs');
    for (let i = 0; i < H.slots; i++) segs.append(h('i', i < H.queue.length ? 'on' : ''));
    gauge.append(segs, h('span', 'pf-kg', H.queue.length ? fmtKg(kg).toUpperCase() : ''));
    hop.append(gauge);
    const ctr = h('div', 'pf-ctr');
    ctr.append(h('span', 'pf-crbig', CR), this.counter.cv);
    ctr.addEventListener('pointerdown', () => { if (this.busyShow()) this.skip(); });
    // the counter under the gauge, the output bin below it (what the crusher gives back lands there)
    hop.append(ctr, this.tray);
    // ---- the lever
    const lev = h('div', 'pf-lev' + (H.canCrush() ? ' ok' : ''));
    lev.append(this.lever.cv);
    this.lever.setOk(H.canCrush());
    root.append(pack, this.read, hop, lev, h('i', 'pf-flash'));
    for (const c of [...el.children]) if (c !== this.holder) c.remove();
    if (this.holder.parentElement !== el) el.append(this.holder);
    if (!this.lit) { this.lit = true; requestAnimationFrame(() => void this.crt.powerOn(true)); }
    requestAnimationFrame(() => {
      // layout sizes (the tube may be mid power-on, scaled)
      if (lev.clientHeight > 40) this.lever.size(Math.max(44, Math.min(64, lev.clientWidth)), lev.clientHeight);
    });
    const val = H.queue.reduce((a, it) => a + itemValue(it), 0);
    if (!this.roll && this.crunch.t < 0 && !H.busy()) this.counter.set(val, H.queue.length ? 'amber' : 'dim');
  }

  private dragged = false;
  private key(it: Item) { return it.key + ':' + (it.name ?? ''); }
  private spin(key: string, size: number): ItemSpin | null {
    const k = key + '|' + size;
    let s = this.spins.get(k);
    if (s === undefined) { s = mxItemSpin(key, size); this.spins.set(k, s); }
    return s;
  }
  private busyShow() { return this.crunch.active || !!this.roll; }

  private select(it: Item, pack: HTMLElement | null) {
    if (this.sel === it) return;
    const old = this.sel;
    this.sel = it;
    if (pack) {
      this.selKey = this.key(it);
      for (const t of pack.querySelectorAll<HTMLElement>('.pf-t')) {
        const on = t.dataset.k === this.selKey;
        t.classList.toggle('sel', on); t.classList.toggle('hot', on);
      }
      for (const [k, s] of this.spins) s?.hot(k.startsWith(it.key + '|'));
    }
    if (old?.key !== it.key) sfx('hover', 0.25);
    this.paintRead();
  }

  /** the picked thing: its name, one value, what the crusher gives back (models; dim = only a chance) */
  private readSpin: { key: string; s: ItemSpin | null } | null = null;
  /** the picked thing: its model turning, its name and one value, what the crusher gives back (models; dim = only a chance) */
  private paintRead() {
    const it = this.sel, r = this.read;
    r.innerHTML = '';
    if (!it) return;
    const v = itemValue(it);
    if (this.readSpin?.key !== it.key) { this.readSpin = { key: it.key, s: mxItemSpin(it.key, 44) }; this.readSpin.s?.hot(true); }
    const m = h('span', 'pf-rm');
    m.append(this.readSpin.s?.cv ?? still(it.key, 44));
    const t = h('span', 'pf-rt');
    t.append(h('b', 'pf-rn', esc(nameOf(it))), h('span', 'pf-rv', `${CR}${fmt(v)}`));
    r.append(m, t);
    const ys = [...slagOf([it])].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (ys.length) {
      const y = h('span', 'pf-ry');
      y.append(h('i', 'pf-arrow', '→'));
      for (const [k, n] of ys) { const sp = h('span', 'pf-yi' + (n < 0.95 ? ' maybe' : '')); sp.title = iname(k); sp.append(still(k, 26)); if (n >= 1.5) sp.append(h('small', '', '×' + Math.round(n))); y.append(sp); }
      r.append(y);
    }
  }


  // ---------------------------------------------------------------- moving things in
  /** a model flies from its turntable into the next slot, and snaps */
  private fly(it: Item, from: HTMLElement) {
    const H = this.host;
    if (H.queue.length >= H.slots || H.busy()) return;
    const slot = this.hbox?.querySelectorAll<HTMLElement>('.pf-slot')[H.queue.length];
    const src = from.querySelector('canvas,img') as HTMLCanvasElement | HTMLImageElement | null;
    if (!src) { this.snap(it); return; }
    if (slot && src && !reduce()) {
      const a = src.getBoundingClientRect(), b = slot.getBoundingClientRect();
      const g = this.ghost(src, a);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const k = 38 / a.width;
      g.animate([
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(${(1 + k) / 2 + 0.1})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k})` },
      ], { duration: 240, easing: 'steps(8, end)' }).onfinish = () => { g.remove(); };
      sfx('whoosh', 0.35);
      setTimeout(() => this.snap(it), 230);
    } else this.snap(it);
  }
  private snap(it: Item) {
    const H = this.host;
    if (H.queue.length >= H.slots || H.busy()) return;
    sfx('clamp', 0.6);
    H.load(it);
    const n = H.queue.length - 1;
    const slot = this.hbox?.querySelectorAll<HTMLElement>('.pf-slot')[n];
    slot?.classList.add('snap');
  }
  private ghost(src: HTMLCanvasElement | HTMLImageElement, r: DOMRect): HTMLElement {
    const g = h('div', 'pf-ghost');
    const c = document.createElement('canvas');
    c.width = (src as HTMLCanvasElement).width || r.width; c.height = (src as HTMLCanvasElement).height || r.height;
    try { c.getContext('2d')!.drawImage(src, 0, 0); } catch { /* not ready */ }
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
    g.append(c);
    g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
    document.body.append(g);
    return g;
  }
  private onDragMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
      const src = d.from.querySelector('canvas,img') as HTMLCanvasElement | null;
      if (!src) { this.drag = null; return; }
      d.ghost = this.ghost(src, src.getBoundingClientRect());
      d.ghost.classList.add('drag');
      this.dragged = true;
      sfx('rocker', 0.3);
    }
    const r = d.from.getBoundingClientRect();
    d.ghost.style.transform = `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)`;
    void r;
    const hb = this.hbox?.getBoundingClientRect();
    this.hbox?.classList.toggle('over', !!hb && e.clientX >= hb.left && e.clientX <= hb.right && e.clientY >= hb.top - 20 && e.clientY <= hb.bottom);
  };
  private onDragUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d?.ghost) return;
    // the click that ends a drag is swallowed once (by the tile it started on); after that taps count again
    setTimeout(() => { this.dragged = false; }, 0);
    const hb = this.hbox?.getBoundingClientRect();
    this.hbox?.classList.remove('over');
    const inside = !!hb && e.clientX >= hb.left && e.clientX <= hb.right && e.clientY >= hb.top - 20 && e.clientY <= hb.bottom;
    const g = d.ghost;
    if (inside && this.host.queue.length < this.host.slots) {
      const slot = this.hbox?.querySelectorAll<HTMLElement>('.pf-slot')[this.host.queue.length];
      const b = slot?.getBoundingClientRect(), a = g.getBoundingClientRect();
      if (b) g.animate([{ transform: g.style.transform }, { transform: `translate(${e.clientX - d.x0 + b.left + b.width / 2 - (a.left + a.width / 2)}px, ${e.clientY - d.y0 + b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${38 / a.width})` }], { duration: 90, easing: 'steps(3, end)' }).onfinish = () => g.remove();
      else g.remove();
      setTimeout(() => this.snap(d.it), 80);
    } else {
      g.animate([{ transform: g.style.transform }, { transform: 'translate(0,0)' }], { duration: 160, easing: 'steps(5, end)' }).onfinish = () => g.remove();
      sfx('back', 0.3);
    }
  };

  // ---------------------------------------------------------------- the show
  /** the lever went down: crunch what is in the slots now (call before the terminal empties them) */
  crushStart() {
    const hb = this.hbox;
    const load: { im: HTMLCanvasElement; x: number; y: number; w: number; h: number }[] = [];
    if (hb) {
      const b = hb.getBoundingClientRect();
      hb.querySelectorAll<HTMLCanvasElement>('.pf-slot.full canvas').forEach((c) => {
        const r = c.getBoundingClientRect();
        const im = document.createElement('canvas'); im.width = c.width; im.height = c.height;
        try { im.getContext('2d')!.drawImage(c, 0, 0); } catch { /* skip */ }
        load.push({ im, x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height });
      });
    }
    this.tray.innerHTML = '';
    this.crunch.start(load);
    this.counter.set(0, 'dim');
    this.counter.lamps = 0;
    this.roll = null;
  }
  /** the press paid: the materials pop out into the tray, the counter rolls (a jackpot flashes and overspins) */
  paid(p: Payout) {
    const out = p.out.slice(0, 10);
    out.forEach((k, i) => setTimeout(() => this.pop(k, i, out.length), 90 + i * 85));
    this.roll = { to: p.value, t: 0, dur: p.jack ? 1.8 : 1.3, over: !!p.jack, ink: p.jack ? 'gold' : 'green' };
    this.counter.lamps = p.jack ? 2 : 1;
    if (p.jack) {
      this.jackT = 2.6;
      this.root?.classList.add('jack');
      this.crt.burst(0.5, 0.25);
      sfx('klaxon', 0.7);
    }
  }
  /** a rare find, named once the payout landed */
  rare(drop: string) { if (drop && ![...this.tray.querySelectorAll<HTMLElement>('.pf-pop')].some((e) => e.dataset.k === drop)) this.pop(drop, this.tray.children.length, this.tray.children.length + 1, true); }
  private pop(key: string, i: number, n: number, gold = false) {
    if (!this.tray.isConnected) return;
    const e = h('span', 'pf-pop' + (gold ? ' gold' : ''));
    e.dataset.k = key; e.title = iname(key);
    e.append(still(key, 28));
    this.tray.append(e);
    sfx('plate', 0.35);
    if (!reduce() && this.hbox) {
      const a = this.hbox.getBoundingClientRect(), b = e.getBoundingClientRect();
      const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
      e.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)` },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 34}px) scale(1.3)`, offset: 0.55 },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: 300, easing: 'steps(9, end)' });
    }
    void n;
  }
  skip() {
    this.crunch.skip();
    if (this.roll) { this.counter.set(this.roll.to, this.roll.ink); this.roll = null; sfx('relay', 0.6); }
  }

  private shake() {
    if (reduce()) return;
    const s = this.host.screen;
    const seq = [[5, -4], [-6, 3], [4, 5], [-3, -3], [2, 1], [0, 0]];
    seq.forEach(([x, y], i) => setTimeout(() => { s.style.transform = x || y ? `translate(${x}px, ${y}px)` : ''; }, i * 40));
  }

  private tick(dt: number, now: number) {
    if (!this.root?.isConnected) return;
    if (this.hbox?.isConnected && (this.crunch.t >= 0 || this.crunch.active)) this.crunch.step(dt, Math.max(8, this.hbox.clientWidth), Math.max(8, this.hbox.clientHeight));
    if (this.roll) {
      const r = this.roll;
      r.t = Math.min(1, r.t + dt / r.dur);
      const e = 1 - Math.pow(1 - r.t, 3);
      const v = r.over ? r.to * (e < 0.75 ? e / 0.75 * 1.35 : 1.35 - (e - 0.75) / 0.25 * 0.35) : r.to * e;
      this.counter.set(v, r.ink);
      if (Math.random() < 0.25) sfx('tick', 0.2);
      if (r.t >= 1) { this.counter.set(r.to, r.ink); this.roll = null; sfx(r.over ? 'unlock' : 'relay', 0.7); }
    }
    if (this.jackT > 0) { this.jackT -= dt; if (this.jackT <= 0) { this.counter.lamps = 1; this.root.classList.remove('jack'); } }
    this.lever.tick(now);
    this.counter.step(dt, now);
  }
}

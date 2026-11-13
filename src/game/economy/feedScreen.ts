// THE PRESS'S FEED SCREEN (round 17): the terminal page a unit feeds the press from,
// item by item. All 2D pixel art at one scale (one art pixel = 2 CSS px), amber on the
// terminal's glass, nothing rounded, no stamps:
//   PACK    what the unit carries that the press takes: a crisp pixel render of each
//           thing, its name, mass, a condition bar, its value and what it leaves behind;
//           the selected line carries a scanning bar
//   ASSAY   the selected (or hovered) thing big, turning frame by frame, with the spec
//           sheet: assay code, mass, condition, hazard class, value, the debt and dollar
//           conversion, a serial, what it is made of as little bar graphs, the yield
//   HOPPER  ten slots, a fill meter, the weight; CRUSH brings a pixel ram down over the
//           slots (sparks, dust, a few pixels of shake, a log scrolling the pressure),
//           then a flip-digit counter rolls the payout; a jackpot blinks the lamps and
//           overspins the counter in gold. A click skips the show.
// The terminal (terminal.ts) owns the state (queue, waiting, payout) and the world press;
// this draws it and keeps its animated parts alive across the terminal's re-renders.
import { G } from '../G';
import { itemDef, hasItemDef, type Item } from '../../items/item';
import { itemIcon, itemIconTurn } from '../../ui/icons';
import { sfx } from '../../ui/menus/sfx';
import { itemValue } from '../debt/values';
import { MATS, itemMatter, matterKg, fmtKg, SCRIP_PER_TOKEN, type Matter } from './matter';
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
  /** the terminal's glass, shaken a few pixels when the ram lands */
  screen: HTMLElement;
}
export interface Payout { value: number; out: string[]; jack: number; bonus: number; drop: string }

const PX = 2; // CSS px per art pixel, everywhere on this screen
const ICON = 16; // list and slot icons, art px
const BIG = 48; // the assay view, art px
const TURN = 12; // frames in a turn

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const iname = (k: string) => (hasItemDef(k) ? itemDef(k).name : k.replace(/_/g, ' '));
const nameOf = (it: Item) => it.name || iname(it.key);
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const canIcon = () => !!(G as unknown as { pr?: { renderer?: unknown } })?.pr?.renderer;
const hash = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return x >>> 0; };
const icon = (key: string, size = ICON) => (canIcon() ? itemIcon(key, '', size) : '');
const img = (key: string, cls: string, size = ICON) => { const u = icon(key, size); return u ? `<img class="${cls}" src="${u}" width="${size * PX}" height="${size * PX}" alt="">` : `<span class="${cls} pf-noic"></span>`; };
const kgOf = (it: Item) => { const m = matterKg(itemMatter(it)); return m > 0 ? m : (hasItemDef(it.key) ? itemDef(it.key).weight ?? 0 : 0); };

/** a hazard class from what the thing is */
function hazard(it: Item): [string, string] {
  const t = (hasItemDef(it.key) ? (itemDef(it.key).tags ?? []).join(' ') : '') + ' ' + it.key;
  if (/glow|exotic|anomal|seam/.test(t)) return ['H3', 'EXOTIC'];
  if (/fuel|flamm|lighter|petrol|alcohol|acid|bleach|solvent|reagent|chem/.test(t)) return ['H2', 'CHEM'];
  if (/blade|knife|sharp|glass|shard|needle|saw|razor/.test(t)) return ['H1', 'SHARP'];
  if (/battery|cell|electr/.test(t)) return ['H1', 'CELL'];
  return ['H0', 'INERT'];
}
/** what a load leaves behind, in short words */
function yieldWords(items: Item[], max = 2): string {
  const parts = [...slagOf(items)].sort((a, b) => b[1] - a[1]).map(([k, n]) => (n >= 0.95 ? `${Math.round(n)} ${iname(k)}` : `~${iname(k)}`));
  return parts.slice(0, max).join(' · ');
}
/** a segmented bar (condition, material share), filled to k */
const bar = (k: number, cls = 'pf-bar') => `<span class="${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, k)) * 100)}%"></i></span>`;

// ------------------------------------------------------------------ the flip-digit counter
// Seven-segment digits, two art pixels thick, printed on flip cards (9 x 16 art px each);
// a lamp each side. A digit that changes flips: the top half folds down, the new bottom
// half drops into place.
const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
const SEGR: Record<string, [number, number, number, number]> = { a: [0, 0, 7, 2], d: [0, 10, 7, 2], g: [0, 5, 7, 2], f: [0, 0, 2, 7], b: [5, 0, 2, 7], e: [0, 5, 2, 7], c: [5, 5, 2, 7] };
const CW = 9, CH = 16, DIG = 6;
type Ink = 'amber' | 'green' | 'gold' | 'dim';
const INK: Record<Ink, [string, string]> = { amber: ['#ffc850', '#8a5a18'], green: ['#9affb0', '#2a6a3a'], gold: ['#fff0a0', '#c89020'], dim: ['#6a4a1a', '#3a2810'] };
const cards = new Map<string, HTMLCanvasElement>();
function card(ch: string, ink: Ink): HTMLCanvasElement {
  const k = ch + ink;
  let c = cards.get(k);
  if (c) return c;
  c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c140a'; g.fillRect(0, 0, CW, CH);
  g.fillStyle = '#2c2010'; g.fillRect(0, 0, CW, 1);
  g.fillStyle = '#0c0805'; g.fillRect(0, CH - 1, CW, 1);
  const [fg, sh] = INK[ink];
  for (const s of SEG[ch] ?? '') { const [x, y, w, hh] = SEGR[s]; g.fillStyle = sh; g.fillRect(1 + x + 1, 2 + y + 1, w, hh); }
  for (const s of SEG[ch] ?? '') { const [x, y, w, hh] = SEGR[s]; g.fillStyle = fg; g.fillRect(1 + x, 2 + y, w, hh); }
  // the split between the two leaves
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 8, CW, 1);
  cards.set(k, c);
  return c;
}
class Counter {
  readonly cv = document.createElement('canvas');
  private cur: string[] = Array(DIG).fill('0');
  private next: string[] = Array(DIG).fill('0');
  private t: number[] = Array(DIG).fill(1);
  private ink: Ink = 'dim';
  lamps = 0; // 0 off, 1 steady, 2 jackpot blink
  readonly W = 2 + 6 + 3 + DIG * CW + (DIG - 1) + 3 + 6 + 2;
  readonly H = CH + 4;
  constructor() {
    this.cv.width = this.W; this.cv.height = this.H;
    this.cv.className = 'pf-cnt';
    this.cv.style.width = this.W * PX + 'px'; this.cv.style.height = this.H * PX + 'px';
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
    // the housing: a dark steel bezel, one light lip, one dark lip
    g.fillStyle = '#3a3226'; g.fillRect(0, 0, this.W, this.H);
    g.fillStyle = '#5a4e3a'; g.fillRect(0, 0, this.W, 1); g.fillRect(0, 0, 1, this.H);
    g.fillStyle = '#171310'; g.fillRect(0, this.H - 1, this.W, 1); g.fillRect(this.W - 1, 0, 1, this.H);
    g.fillStyle = '#0c0906'; g.fillRect(10, 1, DIG * CW + DIG + 1, CH + 2);
    // the lamps
    const blink = this.lamps === 2 ? Math.floor(now / 110) % 2 : 0;
    for (const [i, x] of [[0, 3], [1, this.W - 9]] as [number, number][]) {
      const on = this.lamps === 1 || (this.lamps === 2 && (blink + i) % 2 === 0);
      g.fillStyle = '#171310'; g.fillRect(x - 1, 6, 8, 8);
      g.fillStyle = on ? (this.lamps === 2 ? '#fff0a0' : '#ffb840') : '#4a3410'; g.fillRect(x, 7, 6, 6);
      g.fillStyle = on ? '#ffffff' : '#6a4c1c'; g.fillRect(x + 1, 8, 2, 1);
      g.fillStyle = on ? '#c87818' : '#2a1c08'; g.fillRect(x, 12, 6, 1);
    }
    for (let i = 0; i < DIG; i++) {
      const x = 11 + i * (CW + 1), y = 2;
      const t = this.t[i], a = card(this.cur[i], this.ink), b = card(this.next[i], this.ink);
      if (t >= 1) { g.drawImage(b, x, y); continue; }
      const half = CH / 2;
      if (t < 0.5) {
        // the old top leaf folds down over the new top
        g.drawImage(b, 0, 0, CW, half, x, y, CW, half);
        g.drawImage(a, 0, half, CW, half, x, y + half, CW, half);
        const hh = Math.max(1, Math.round(half * (1 - t * 2)));
        g.drawImage(a, 0, 0, CW, half, x, y + half - hh, CW, hh);
      } else {
        // the new bottom leaf drops over the old bottom
        g.drawImage(b, 0, 0, CW, half, x, y, CW, half);
        g.drawImage(a, 0, half, CW, half, x, y + half, CW, half);
        const hh = Math.max(1, Math.round(half * (t - 0.5) * 2));
        g.drawImage(b, 0, half, CW, half, x, y + half, CW, hh);
      }
    }
  }
}

// ------------------------------------------------------------------ the ram over the hopper
interface Bit { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string }
class Ram {
  readonly cv = document.createElement('canvas');
  t = -1; // seconds since the lever; -1 idle
  private load: { img: HTMLImageElement; x: number; y: number; s: number }[] = [];
  private bits: Bit[] = [];
  private dust: Bit[] = [];
  private landed = false;
  onLand: () => void = () => {};
  constructor() { this.cv.className = 'pf-fx'; }
  get active() { return this.t >= 0 && this.t < 1.2 || this.bits.length > 0 || this.dust.length > 0; }
  /** the lever: the things in the slots (their art rects) are what it crushes */
  start(load: { key: string; x: number; y: number; s: number }[]) {
    this.t = 0; this.landed = false; this.bits = []; this.dust = [];
    this.load = load.map((l) => { const im = new Image(); const u = icon(l.key); if (u) im.src = u; return { img: im, x: l.x, y: l.y, s: l.s }; });
  }
  skip() { this.t = 1.2; this.bits = []; this.dust = []; this.load = []; }
  step(dt: number, W: number, H: number) {
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.cv.style.width = W * PX + 'px'; this.cv.style.height = H * PX + 'px'; }
    const g = this.cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    const RH = 9, floorY = H - 2, crushTo = 5;
    // where the ram's face is
    let face: number;
    if (t < 0.16) face = -2 + (floorY - crushTo + 2) * (t / 0.16) ** 2;
    else if (t < 0.75) face = floorY - crushTo + (t < 0.2 ? 1 : 0);
    else if (t < 1.05) face = floorY - crushTo - (floorY - crushTo + RH + 6) * ((t - 0.75) / 0.3) ** 1.5;
    else face = -RH - 8;
    face = Math.round(face);
    if (!this.landed && t >= 0.16) {
      this.landed = true;
      this.onLand();
      for (let i = 0; i < 46; i++) {
        const x = 2 + Math.random() * (W - 4), s = 40 + Math.random() * 90;
        this.bits.push({ x, y: floorY - crushTo, vx: (Math.random() - 0.5) * 2 * s, vy: -Math.random() * s * 0.9, life: 0, max: 0.25 + Math.random() * 0.4, c: Math.random() < 0.3 ? '#ffffff' : Math.random() < 0.6 ? '#ffd860' : '#ff9030' });
      }
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * W;
        this.dust.push({ x, y: floorY - Math.random() * 4, vx: (x < W / 2 ? -1 : 1) * (8 + Math.random() * 30), vy: -4 - Math.random() * 10, life: 0, max: 0.6 + Math.random() * 0.6, c: Math.random() < 0.5 ? '#8a7c62' : '#5e5444' });
      }
    }
    // the load: squashed under the face, then gone to slag (dithered out)
    const fade = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25);
    if (fade > 0) for (const l of this.load) {
      if (!l.img.complete || !l.img.naturalWidth) continue;
      const top = Math.max(l.y, face), hh = Math.max(2, l.y + l.s - top), k = hh / l.s;
      const ww = Math.round(l.s * (1 + (1 - k) * 0.35));
      if (fade >= 1) g.drawImage(l.img, Math.round(l.x + (l.s - ww) / 2), Math.round(l.y + l.s - hh), ww, Math.round(hh));
      else {
        // ordered dissolve: a 4 x 4 threshold eats the squashed pixels
        g.drawImage(l.img, Math.round(l.x + (l.s - ww) / 2), Math.round(l.y + l.s - hh), ww, Math.round(hh));
        g.fillStyle = '#000';
        g.globalCompositeOperation = 'destination-out';
        for (let y = Math.round(l.y + l.s - hh); y < l.y + l.s; y++) for (let x = Math.round(l.x - 4); x < l.x + l.s + 4; x++) if (BAYER[(y & 3) * 4 + (x & 3)] / 16 > fade) g.fillRect(x, y, 1, 1);
        g.globalCompositeOperation = 'source-over';
      }
    }
    // the ram: two rods, the platen, a hazard band of square blocks along its face
    if (face > -RH - 6) {
      for (const rx of [Math.round(W * 0.22), Math.round(W * 0.78) - 3]) {
        g.fillStyle = '#c8ccc4'; g.fillRect(rx, 0, 3, Math.max(0, face - RH));
        g.fillStyle = '#7a7e76'; g.fillRect(rx + 2, 0, 1, Math.max(0, face - RH));
      }
      const y0 = face - RH;
      g.fillStyle = '#6c706a'; g.fillRect(0, y0, W, RH);
      g.fillStyle = '#9ca29a'; g.fillRect(0, y0, W, 1);
      g.fillStyle = '#4a4e48'; g.fillRect(0, y0 + RH - 4, W, 1);
      for (let x = 0; x < W; x += 4) { g.fillStyle = (x >> 2) % 2 ? '#17150f' : '#e8b52a'; g.fillRect(x, y0 + RH - 3, 4, 3); }
      for (let x = 5; x < W - 3; x += 14) { g.fillStyle = '#c8ccc4'; g.fillRect(x, y0 + 2, 1, 1); g.fillStyle = '#2a2c28'; g.fillRect(x + 1, y0 + 3, 1, 1); }
    }
    // sparks and dust
    for (const b of this.bits) { b.life += dt; b.vy += 260 * dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y > floorY) { b.y = floorY; b.vy *= -0.3; b.vx *= 0.6; } }
    this.bits = this.bits.filter((b) => b.life < b.max && b.x > -2 && b.x < W + 2);
    for (const b of this.bits) { g.fillStyle = b.life / b.max > 0.6 ? '#c86018' : b.c; g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
    for (const d of this.dust) { d.life += dt; d.vx *= 1 - dt * 1.5; d.x += d.vx * dt; d.y += d.vy * dt; d.vy *= 1 - dt; }
    this.dust = this.dust.filter((d) => d.life < d.max);
    for (const d of this.dust) {
      const a = 1 - d.life / d.max, x = Math.round(d.x), y = Math.round(d.y);
      g.fillStyle = d.c;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (BAYER[((y + j) & 3) * 4 + ((x + i) & 3)] / 16 < a * 0.8) g.fillRect(x + i, y + j, 1, 1);
    }
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ------------------------------------------------------------------ the screen
export class FeedScreen {
  private sel: Item | null = null;
  private selKey = '';
  private det = h('div', 'pf-det');
  private counter = new Counter();
  private ram = new Ram();
  private log = h('div', 'pf-log');
  private lines: string[] = ['READY · LOAD THE HOPPER'];
  private frame = 0; private turnKey = ''; private turnT = 0;
  private raf = 0; private last = 0;
  private roll: { from: number; to: number; t: number; dur: number; over: boolean; ink: Ink } | null = null;
  private jackT = 0;
  private pressT = -1;
  private dead = false;
  private bay: HTMLElement | null = null;
  private lastPtr = 'mouse';

  constructor(private host: FeedHost) {
    this.ram.onLand = () => {
      sfx('slam', 0.9); sfx('spark', 0.5);
      try { G?.audio?.ui?.('press_slam', 0.7); } catch { /* no audio */ }
      this.shake();
      this.say(`RAM DOWN · ${fmt(1100 + Math.random() * 300)} kN`);
      this.pressT = 0;
    };
    this.paintLog();
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.tick(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() { this.dead = true; cancelAnimationFrame(this.raf); }

  // ---------------------------------------------------------------- the page
  render(el: HTMLElement) {
    const H = this.host;
    const rows = H.rows();
    const flat = rows.map((g) => g[0]);
    // keep the selection on its kind; else the first line
    if (!this.sel || (!H.queue.includes(this.sel) && !rows.some((g) => g.includes(this.sel!)))) {
      const same = rows.find((g) => this.key(g[0]) === this.selKey);
      this.sel = same?.[0] ?? flat[0] ?? H.queue[0] ?? null;
    }
    this.selKey = this.sel ? this.key(this.sel) : '';
    const root = h('div', 'pf');
    // ---- PACK
    const L = h('div', 'pf-col pf-pack');
    L.append(h('div', 'pf-hd', `<b>PACK</b><span>${rows.length} LINE${rows.length === 1 ? '' : 'S'}</span><span class="pf-tick"></span>`));
    const list = h('div', 'pf-list');
    const locked = H.queue.length >= H.slots || this.busyShow();
    if (!rows.length) list.append(h('p', 'pf-none', 'NOTHING ON YOU THE PRESS WOULD TAKE'));
    for (const g of rows.slice(0, 40)) {
      const it = g[0], v = itemValue(it), kg = kgOf(it), y = yieldWords([it]);
      const r = h('button', 'pf-row' + (this.key(it) === this.selKey ? ' sel' : ''), `${img(it.key, 'pf-ic')}<span class="pf-nm">${esc(nameOf(it))}${g.length > 1 ? ` <i>×${g.length}</i>` : ''}</span><span class="pf-v">${v > 0 ? fmt(v) : '—'}<small>CR</small></span><span class="pf-sub">${bar(it.cond ?? 1, 'pf-cb')}<span>${fmtKg(kg).toUpperCase()}</span>${y ? `<em>→ ${esc(y)}</em>` : ''}</span>`) as HTMLButtonElement;
      r.type = 'button';
      r.dataset.k = this.key(it);
      r.disabled = locked;
      r.addEventListener('pointerdown', (e) => { this.lastPtr = e.pointerType; });
      r.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.select(it, list); });
      r.addEventListener('focus', () => this.select(it, list));
      r.addEventListener('click', () => {
        // a touch picks first, then loads; a mouse (or a key) loads straight away
        if (this.lastPtr !== 'mouse' && this.key(this.sel ?? it) !== this.key(it)) { this.select(it, list); this.lastPtr = 'mouse'; return; }
        this.lastPtr = 'mouse';
        if (H.queue.length < H.slots) { sfx('plate', 0.5); H.load(it); }
      });
      list.append(r);
    }
    // a disabled button swallows pointerenter in some browsers: the list itself still shows the assay
    list.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = (e.target as HTMLElement).closest?.('.pf-row') as HTMLElement | null;
      if (r && r.dataset.k !== this.selKey) { const g = rows.find((q) => this.key(q[0]) === r.dataset.k); if (g) this.select(g[0], list); }
    });
    L.append(list);
    // ---- ASSAY
    const M = h('div', 'pf-col pf-assay');
    M.append(this.det);
    this.paintDetail();
    // ---- HOPPER
    const R = h('div', 'pf-col pf-hop');
    const kgIn = H.queue.reduce((a, it) => a + kgOf(it), 0);
    R.append(h('div', 'pf-hd', `<b>HOPPER</b><span>${String(H.queue.length).padStart(2, '0')}/${H.slots} · ${fmtKg(kgIn).toUpperCase()}</span>`));
    const bay = this.bay = h('div', 'pf-bay');
    const slots = h('div', 'pf-slots');
    for (let i = 0; i < H.slots; i++) {
      const it = H.queue[i];
      const b = h('button', 'pf-slot' + (it ? ' full' : ''), it ? img(it.key, 'pf-sic') : '') as HTMLButtonElement;
      b.type = 'button';
      if (it) {
        b.title = nameOf(it);
        b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.select(it, null); });
        b.addEventListener('click', () => { if (!this.busyShow()) { sfx('back', 0.4); H.unload(it); } });
      } else b.disabled = true;
      slots.append(b);
    }
    bay.append(slots, this.ram.cv);
    bay.addEventListener('pointerdown', () => { if (this.busyShow()) this.skip(); });
    R.append(bay);
    const fill = h('div', 'pf-fill');
    for (let i = 0; i < H.slots; i++) fill.append(h('i', i < H.queue.length ? 'on' : ''));
    R.append(fill);
    const val = H.queue.reduce((a, it) => a + itemValue(it), 0), share = H.share();
    R.append(h('div', 'pf-est', H.queue.length ? `≈ <b>${fmt(val)}</b> CR${share > 0 ? ` · <b>${fmt(val * share)}</b> TO DEBT` : ''}<small>${esc(yieldWords(H.queue, 3))}</small>` : '<small>TAP A LINE TO LOAD IT · TAP A SLOT TO TAKE IT BACK</small>'));
    const crush = h('button', 'ptm-act pf-crush', H.busy() ? '&gt; RAM IS DOWN' : '&gt; CRUSH') as HTMLButtonElement;
    crush.type = 'button';
    crush.disabled = !H.canCrush();
    crush.addEventListener('click', () => H.crush());
    R.append(crush);
    const ctr = h('div', 'pf-ctr');
    ctr.append(this.counter.cv, h('small', '', 'PAYOUT · CR'));
    ctr.addEventListener('pointerdown', () => { if (this.busyShow()) this.skip(); });
    R.append(ctr, this.log);
    root.append(L, M, R);
    el.append(root);
    if (!this.roll && this.ram.t < 0 && !H.busy()) this.counter.set(val, H.queue.length ? 'amber' : 'dim');
    // the selected line in view
    requestAnimationFrame(() => list.querySelector('.pf-row.sel')?.scrollIntoView?.({ block: 'nearest' }));
  }

  private key(it: Item) { return it.key + ':' + (it.name ?? ''); }
  /** the show is running (the ram, the roll): clicks skip it */
  private busyShow() { return this.ram.t >= 0 && this.ram.t < 1.05 || !!this.roll; }

  private select(it: Item, list: HTMLElement | null) {
    if (this.sel === it) return;
    this.sel = it;
    if (list) { this.selKey = this.key(it); for (const r of list.querySelectorAll<HTMLElement>('.pf-row')) r.classList.toggle('sel', r.dataset.k === this.selKey); }
    sfx('hover', 0.25);
    this.paintDetail();
  }

  /** the assay sheet for the selected thing */
  private paintDetail() {
    const it = this.sel, d = this.det;
    if (!it) { d.innerHTML = `<div class="pf-hd"><b>ASSAY</b><span>NO SAMPLE</span><span class="pf-cur">_</span></div><div class="pf-dtop"><div class="pf-view"><i class="pf-scan"></i></div></div>`; this.turnKey = ''; return; }
    const v = itemValue(it), kg = kgOf(it), share = this.host.share();
    const [hz, hzw] = hazard(it);
    const code = 'ASY-' + (hash(it.key) % 1679616).toString(36).toUpperCase().padStart(4, '0');
    const sn = (hash('sn' + it.uid) % 65536).toString(16).toUpperCase().padStart(4, '0') + '-' + String(it.uid % 100000).padStart(5, '0');
    const m: Matter = itemMatter(it), tot = Object.values(m).reduce((a, b) => a + (b ?? 0), 0) || 1;
    const comp = MATS.map((q) => [q, (m[q.key] ?? 0) / tot] as const).filter(([, k]) => k > 0.005).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const y = yieldWords([it], 3);
    if (this.turnKey !== it.key) this.frame = 0;
    const big = canIcon() ? itemIconTurn(it.key, BIG, this.frame, TURN) || icon(it.key, BIG) : '';
    const usd = v / SCRIP_PER_TOKEN;
    d.innerHTML = `<div class="pf-hd"><b>${esc(nameOf(it).toUpperCase())}</b><span>${code}</span><span class="pf-cur">_</span></div>`
      + `<div class="pf-dtop"><div class="pf-view">${big ? `<img class="pf-big" src="${big}" width="${BIG * PX}" height="${BIG * PX}" alt="">` : ''}<i class="pf-scan"></i></div>`
      + `<dl class="pf-spec">`
      + `<dt>MASS</dt><dd>${fmtKg(kg).toUpperCase()}</dd>`
      + `<dt>COND</dt><dd>${bar(it.cond ?? 1, 'pf-cb')}${Math.round((it.cond ?? 1) * 100)}%</dd>`
      + `<dt>HAZ</dt><dd>${hz} ${hzw}</dd>`
      + `<dt>VALUE</dt><dd><b>${fmt(v)}</b> CR</dd>`
      + `<dt>DEBT</dt><dd>${share > 0 ? `+${fmt(v * share)} CR` : '—'}</dd>`
      + `<dt>USD</dt><dd>$${usd < 10 ? usd.toFixed(2) : fmt(usd)}</dd>`
      + `<dt>SN</dt><dd>${sn}</dd>`
      + `</dl></div>`
      + `<div class="pf-comp">${comp.length ? comp.map(([q, k]) => `<span class="pf-mc">${q.code}</span>${bar(k, 'pf-mb')}<span class="pf-mp">${Math.round(k * 100)}%</span>`).join('') : '<span class="pf-mc">—</span><span class="pf-mb"></span><span class="pf-mp"></span>'}</div>`
      + `<div class="pf-yl"><span>YIELD</span>${y ? esc(y) : 'NOTHING BACK'}</div>`;
    if (this.turnKey !== it.key) { this.turnKey = it.key; this.frame = 0; this.turnT = 0; }
  }

  // ---------------------------------------------------------------- the show
  /** the lever: crush what is in the slots now (call before the terminal empties them) */
  crushStart() {
    const bay = this.bay, H = this.host;
    sfx('lever', 0.9);
    this.lines = [];
    this.say(`LEVER · ${H.queue.length} LINE${H.queue.length === 1 ? '' : 'S'} · ${fmtKg(H.queue.reduce((a, it) => a + kgOf(it), 0)).toUpperCase()}`);
    const load: { key: string; x: number; y: number; s: number }[] = [];
    if (bay) {
      const b = bay.getBoundingClientRect();
      bay.querySelectorAll<HTMLElement>('.pf-slot.full .pf-sic').forEach((e, i) => {
        const r = e.getBoundingClientRect(), it = H.queue[i];
        if (it) load.push({ key: it.key, x: Math.round((r.left - b.left) / PX), y: Math.round((r.top - b.top) / PX), s: ICON });
      });
    }
    this.ram.start(load);
    this.counter.set(0, 'dim');
    this.roll = null;
  }
  /** the press paid: roll the counter, log the yield (a jackpot blinks and overspins) */
  paid(p: Payout) {
    this.pressT = -1;
    const n = new Map<string, number>(); for (const k of p.out) n.set(k, (n.get(k) ?? 0) + 1);
    this.say('ASSAY OK');
    if (n.size) this.say('OUT OF THE LIP · ' + [...n].map(([k, c]) => `${c} ${iname(k).toUpperCase()}`).join(' · '));
    if (p.jack === 2) this.say(`JACKPOT · PAID DOUBLE · +${fmt(p.bonus)}`);
    else if (p.jack) this.say(`RARE FIND · ${iname(p.drop || p.out[p.out.length - 1] || '').toUpperCase()}`);
    this.say(`CREDITED ${fmt(p.value)} CR`);
    this.roll = { from: 0, to: p.value, t: 0, dur: p.jack ? 1.8 : 1.3, over: !!p.jack, ink: p.jack ? 'gold' : 'green' };
    this.counter.lamps = p.jack ? 2 : 1;
    this.jackT = p.jack ? 3.2 : 0;
    if (p.jack) sfx('klaxon', 0.7);
  }
  /** a rare find named after the payout landed */
  rare(drop: string) { if (drop) this.say(`RARE FIND · ${iname(drop).toUpperCase()}`); }
  skip() {
    this.ram.skip();
    if (this.roll) { this.counter.set(this.roll.to, this.roll.ink); this.roll = null; sfx('relay', 0.6); }
  }

  private say(line: string) { this.lines.push(line); if (this.lines.length > 4) this.lines.splice(0, this.lines.length - 4); this.paintLog(); }
  private paintLog() { this.log.innerHTML = this.lines.map((l, i) => `<p${i === this.lines.length - 1 ? ' class="new"' : ''}>&gt; ${esc(l)}${i === this.lines.length - 1 ? '<span class="pf-cur">_</span>' : ''}</p>`).join(''); }

  private shake() {
    const s = this.host.screen;
    const seq = [[2, -2], [-2, 1], [1, 2], [-1, -1], [1, 0], [0, 0]];
    seq.forEach(([x, y], i) => setTimeout(() => { s.style.transform = x || y ? `translate(${x * PX}px, ${y * PX}px)` : ''; }, i * 45));
  }

  private tick(dt: number, now: number) {
    if (!this.det.isConnected) return;
    // the ram over the bay
    if (this.bay?.isConnected) {
      const W = Math.max(8, Math.round(this.bay.clientWidth / PX)), Hh = Math.max(8, Math.round(this.bay.clientHeight / PX));
      if (this.ram.t >= 0 || this.ram.active) this.ram.step(dt, W, Hh);
    }
    // the pressure, while the world press works
    if (this.pressT >= 0) {
      this.pressT += dt;
      if (this.pressT > 0.35) { this.pressT = 0.0001; const last = this.lines[this.lines.length - 1] ?? ''; const kn = `COMPRESSING · ${fmt(1150 + Math.random() * 260)} kN`; if (last.startsWith('COMPRESSING')) { this.lines[this.lines.length - 1] = kn; this.paintLog(); } else this.say(kn); }
    }
    // the counter rolls (a jackpot runs past the figure and settles back)
    if (this.roll) {
      const r = this.roll;
      r.t = Math.min(1, r.t + dt / r.dur);
      const e = 1 - Math.pow(1 - r.t, 3);
      const v = r.over ? r.to * (e < 0.75 ? e / 0.75 * 1.35 : 1.35 - (e - 0.75) / 0.25 * 0.35) : r.to * e;
      this.counter.set(v, r.ink);
      if (Math.random() < 0.25) sfx('tick', 0.2);
      if (r.t >= 1) { this.counter.set(r.to, r.ink); this.roll = null; sfx(r.over ? 'unlock' : 'relay', 0.7); }
    }
    if (this.jackT > 0) { this.jackT -= dt; if (this.jackT <= 0) this.counter.lamps = 1; }
    this.counter.step(dt, now);
    // the assay view turns, a frame at a time (each frame rendered once, then cached)
    const im = this.det.querySelector<HTMLImageElement>('.pf-big');
    if (im && this.sel) {
      this.turnT += dt;
      if (this.turnT > 0.16) {
        this.turnT = 0;
        const u = canIcon() ? itemIconTurn(this.sel.key, BIG, ++this.frame, TURN) : '';
        if (u && im.src !== u) im.src = u;
      }
    }
  }
}

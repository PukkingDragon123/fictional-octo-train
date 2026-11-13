// THE COMMISSARY: a staff vending machine for collectibles, drawn as pixel
// art at a whole-number scale. A backlit marquee and a research-point
// counter on top; a glass cabinet of slots, each a live 3D render of the item
// sitting in its wire coil with a code and price strip; a big display window
// for the selected item (live, turning) with its name on embossed label tape
// and a typed card; the BUY key; the series keys (Headcases / Stance /
// Decor); the delivery flap. Buying spends the researcher's dollars (round 17, spendDollars)
// and drops the item out of its coil into the tray.
import { dollars, spendDollars } from '../../../game/economy/money';
/** round 17: the commissary takes DOLLARS (the researcher's money); catalogue figures are x10 */
const cost = (it: { price: number }) => it.price * 10;
import { PixelCanvas, makeRamp } from '../../../gfx/pixel';
import { bitText, bitMeasure } from '../../../gfx/bitfont';
import { FocusNav } from '../nav';
import { plateBtn, type PlateButton } from '../btnKit';
import { sfx } from '../sfx';
import { esc } from '../common';
import { CATALOG, ITEM, SERIES, type Series } from './catalog';
import { owned, addOwned, spare } from './store';
import type { Preview } from './preview';

export interface ShopHost { preview: Preview; layer: HTMLElement; say(kind: 'shop' | 'buy' | 'poor' | 'free'): void; onClose(): void }

interface Slot { id: string; b: HTMLButtonElement; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; code: string; drop: number }
interface Box { x: number; y: number; w: number; h: number }
interface Layout { S: number; W: number; H: number; x: number; y: number; portrait: boolean; cols: number; rows: number; slotW: number; slotH: number; cab: Box; det: Box; name: Box; blurb: Box; buy: Box; tabs: Box; flap: Box; marq: Box; rp: Box; close: Box }

const K = 0x0a0806;

export class Shop {
  active = false;
  private host: ShopHost;
  private el = document.createElement('div');
  private body = document.createElement('canvas');
  private det = document.createElement('canvas');
  private detCtx = this.det.getContext('2d')!;
  private nameEl = document.createElement('div');
  private blurbEl = document.createElement('div');
  private priceEl = document.createElement('div');
  private noteEl = document.createElement('div');
  private slotsEl = document.createElement('div');
  private tabsEl = document.createElement('div');
  private keysEl = document.createElement('div');
  private slots: Slot[] = [];
  private tabBtns: PlateButton[] = [];
  private buyBtn: PlateButton | null = null;
  private closeBtn: PlateButton | null = null;
  private pageL: PlateButton | null = null; private pageR: PlateButton | null = null;
  private series: Series = 'vinyl';
  private page = 0;
  private sel = '';
  private L: Layout | null = null;
  private nav: FocusNav | null = null;
  private t = 0; private slotI = 0; private rpShown = -1; private flash = 0; private delivered = 0;
  private ro: () => void;

  constructor(host: ShopHost) {
    this.host = host;
    this.el.className = 'dk-shop';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Commissary');
    this.body.className = 'dk-mach';
    this.det.className = 'dk-det';
    this.nameEl.className = 'dk-name';
    this.blurbEl.className = 'dk-blurb';
    this.priceEl.className = 'dk-price';
    this.noteEl.className = 'dk-note';
    this.slotsEl.className = 'dk-slots';
    this.tabsEl.className = 'dk-tabs';
    this.keysEl.className = 'dk-keys';
    this.el.append(this.body, this.det, this.nameEl, this.blurbEl, this.priceEl, this.noteEl, this.slotsEl, this.tabsEl, this.keysEl);
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    this.ro = () => { if (this.active) this.layout(); };
  }

  open(series?: Series) {
    if (this.active) return;
    this.active = true;
    if (series) this.series = series;
    this.host.layer.append(this.el);
    document.body.classList.add('deco-shop');
    // keys
    this.keysEl.innerHTML = '';
    this.buyBtn = plateBtn('Buy', () => this.buy(), { finish: 'brass', size: 'md', lamp: 'green', aria: 'Buy the selected item', sound: '' });
    this.closeBtn = plateBtn('Close', () => this.close(), { finish: 'cream', size: 'sm', lamp: false, shape: 'arrowL', sound: 'back', aria: 'Close (Esc)' });
    this.keysEl.append(this.buyBtn, this.closeBtn);
    this.tabsEl.innerHTML = '';
    this.pageL = plateBtn('', () => this.turnPage(-1), { finish: 'steel', size: 'sm', glyph: 'l', lamp: false, sound: 'rocker', aria: 'Previous row' });
    this.tabBtns = SERIES.map((s) => plateBtn(s.name, () => this.setSeries(s.key), { finish: 'olive', size: 'sm', lamp: false, sound: 'rocker', aria: `${s.name}: ${s.sub}`, tight: true }));
    this.pageR = plateBtn('', () => this.turnPage(1), { finish: 'steel', size: 'sm', glyph: 'r', lamp: false, sound: 'rocker', aria: 'Next row' });
    this.tabsEl.append(this.pageL, ...this.tabBtns, this.pageR);
    this.layout();
    this.setSeries(this.series, true);
    window.addEventListener('resize', this.ro);
    this.nav = new FocusNav(this.el, { onBack: () => this.close(), onTab: (d) => this.cycleSeries(d), autofocus: this.slots[0]?.b ?? true });
    this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in');
    sfx('open', 0.8); sfx('hum', 0.25);
    this.host.say('shop');
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.el.remove();
    document.body.classList.remove('deco-shop');
    window.removeEventListener('resize', this.ro);
    this.nav?.destroy(); this.nav = null;
    this.host.preview.drop('shop'); this.host.preview.drop('det');
    sfx('back');
    this.host.onClose();
  }

  // ---------------------------------------------------------------- layout (art pixels)
  private layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const S = Math.max(2, Math.min(4, Math.floor(Math.min(vw / 214, vh / 236))));
    const AW = Math.floor(vw / S), AH = Math.floor(vh / S);
    const portrait = AW < AH * 1.05;
    let L: Layout;
    if (!portrait) {
      const W = Math.min(AW - 10, 404), H = Math.min(AH - 8, 232);
      const cols = 4, rows = 2, slotW = 50, slotH = 60;
      const cab = { x: 8, y: 28, w: cols * slotW + (cols - 1) * 2 + 6, h: rows * slotH + (rows - 1) * 2 + 6 };
      const rx = cab.x + cab.w + 8, rw = W - rx - 8;
      L = {
        S, W, H, x: Math.floor((AW - W) / 2), y: Math.floor((AH - H) / 2), portrait, cols, rows, slotW, slotH, cab,
        marq: { x: 8, y: 6, w: W - 16 - 70, h: 18 }, rp: { x: W - 8 - 66, y: 7, w: 66, h: 16 },
        det: { x: rx, y: 28, w: rw, h: 92 }, name: { x: rx, y: 123, w: rw, h: 14 }, blurb: { x: rx, y: 140, w: rw, h: 34 },
        buy: { x: rx, y: 178, w: rw, h: 22 }, tabs: { x: 8, y: cab.y + cab.h + 4, w: cab.w, h: 18 },
        flap: { x: 8, y: H - 22, w: cab.w, h: 14 }, close: { x: rx, y: H - 24, w: rw, h: 18 },
      };
    } else {
      const W = AW - 8, cols = 3, rows = 2;
      const slotW = Math.floor((W - 16 - 6 - (cols - 1) * 2) / cols), slotH = 60;
      const det = { x: 8, y: 26, w: W - 16, h: Math.min(96, Math.floor(AH * 0.22)) };
      const name = { x: 8, y: det.y + det.h + 3, w: W - 16, h: 14 };
      const blurb = { x: 8, y: name.y + 17, w: W - 16, h: 30 };
      const buy = { x: 8, y: blurb.y + 33, w: W - 16, h: 22 };
      const tabs = { x: 8, y: buy.y + 26, w: W - 16, h: 18 };
      const cab = { x: 8, y: tabs.y + 22, w: cols * slotW + (cols - 1) * 2 + 6, h: rows * slotH + (rows - 1) * 2 + 6 };
      const flap = { x: 8, y: cab.y + cab.h + 6, w: cab.w, h: 14 };
      const H = Math.min(AH - 6, flap.y + flap.h + 30);
      L = {
        S, W, H, x: 4, y: Math.max(3, Math.floor((AH - H) / 2)), portrait, cols, rows, slotW, slotH, cab, det, name, blurb, buy, tabs, flap,
        marq: { x: 8, y: 5, w: W - 16 - 76, h: 17 }, rp: { x: W - 8 - 72, y: 6, w: 72, h: 15 }, close: { x: 8, y: H - 24, w: W - 16, h: 18 },
      };
    }
    this.L = L;
    const px = (v: number) => v * S + 'px';
    const place = (el: HTMLElement, b: Box) => Object.assign(el.style, { left: px(L.x + b.x), top: px(L.y + b.y), width: px(b.w), height: px(b.h) });
    this.el.style.setProperty('--s', S + 'px');
    this.el.classList.toggle('big', S >= 3);
    this.body.width = L.W; this.body.height = L.H;
    place(this.body, { x: 0, y: 0, w: L.W, h: L.H });
    // the display window's live canvas sits inside its chrome frame
    const d = L.det;
    this.det.width = d.w - 4; this.det.height = d.h - 4;
    place(this.det, { x: d.x + 2, y: d.y + 2, w: d.w - 4, h: d.h - 4 });
    place(this.nameEl, { ...L.name, x: L.name.x + 4, w: L.name.w - 8 });
    place(this.blurbEl, L.blurb);
    place(this.priceEl, { x: L.buy.x, y: L.buy.y, w: 46, h: L.buy.h });
    place(this.noteEl, { x: d.x, y: d.y + d.h - 14, w: d.w, h: 14 });
    place(this.slotsEl, { x: L.cab.x + 3, y: L.cab.y + 3, w: L.cab.w - 6, h: L.cab.h - 6 });
    place(this.tabsEl, L.tabs);
    Object.assign(this.keysEl.style, { left: px(L.x + L.buy.x + 50), top: px(L.y + L.buy.y), width: px(L.buy.w - 50), height: px(L.close.y + L.close.h - L.buy.y) });
    this.slotsEl.style.gridTemplateColumns = `repeat(${L.cols}, ${px(L.slotW)})`;
    this.slotsEl.style.gap = px(2);
    this.drawBody();
    SERIES.forEach((s, i) => this.tabBtns[i]?.setLabel(L.portrait ? s.short : s.name));
    // narrow: no page arrows (pressing the lit series key again turns the page)
    for (const b of [this.pageL, this.pageR]) if (b) b.hidden = L.portrait;
    for (const b of [this.buyBtn, this.closeBtn, this.pageL, this.pageR, ...this.tabBtns]) b?.paint();
    if (this.sel) this.select(this.sel, true);
    this.buildSlots();
  }

  /** the machine itself, in pixels */
  private drawBody() {
    const L = this.L!;
    const W = L.W, H = L.H, pc = new PixelCanvas(W, H);
    pc.wrap = false;
    const O = makeRamp(0x4b5638, 7, { spread: 0.62, hueShift: 0.03 });
    const cut = 4;
    const inside = (x: number, y: number) => !(x + y < cut || (W - 1 - x) + y < cut || x + (H - 1 - y) < cut || (W - 1 - x) + (H - 1 - y) < cut);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      let v = 3 + ((x * 7 + y * 13) % 17 === 0 ? -1 : 0) + ((x * 3 + y * 5) % 23 === 0 ? 1 : 0);
      if (x < 2 || y < 2) v = 5; else if (x > W - 3 || y > H - 3) v = 1;
      pc.set(x, y, O[v]);
    }
    // wear: chips to the primer, grime toward the bottom, a rust run
    for (let i = 0; i < W * H * 0.004; i++) { const x = 3 + Math.floor(Math.random() * (W - 6)), y = 3 + Math.floor(Math.random() * (H - 6)); pc.set(x, y, 0x8a8a7a); pc.set(x + 1, y, O[1]); }
    for (let y = H - 40; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (Math.random() < (y - (H - 40)) / 160) pc.blend(x, y, 0x1a1810, 0.35);
    for (let y = 0; y < 26; y++) pc.blend(W - 30, H - 30 + y * 0.9, 0x6a3418, 0.5 * (1 - y / 26));
    // panel seams and rivets
    pc.hline(3, W - 4, 25, O[1]); pc.hline(3, W - 4, 26, O[5]);
    for (let x = 10; x < W - 8; x += 26) for (const y of [3, H - 5]) { pc.set(x, y, 0xe4e8e6); pc.set(x + 1, y, 0xa2aaac); pc.set(x, y + 1, 0xa2aaac); pc.set(x + 1, y + 1, 0x4c5458); }
    // outline
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1) || x === 0 || y === 0 || x === W - 1 || y === H - 1)) pc.set(x, y, K);
    // recessed windows: chrome frames
    const frame = (b: Box, inner: number) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
        const e = Math.min(x - b.x, y - b.y, b.x + b.w - 1 - x, b.y + b.h - 1 - y);
        if (e === 0) pc.set(x, y, K);
        else if (e < 3) pc.set(x, y, (x - b.x < 3 || y - b.y < 3) && !(b.x + b.w - 1 - x < 3 || b.y + b.h - 1 - y < 3) ? [0, 0xd8dcde, 0xa8aeb2][e] : [0, 0x6a7074, 0x8a9096][e]);
        else pc.set(x, y, inner);
      }
    };
    frame(L.cab, 0x07090b);
    frame(L.det, 0x07090b);
    // shelf rails between rows of slots
    for (let r = 1; r < L.rows; r++) { const y = L.cab.y + 3 + r * (L.slotH + 2) - 2; pc.hline(L.cab.x + 3, L.cab.x + L.cab.w - 4, y, 0x8a9096); pc.hline(L.cab.x + 3, L.cab.x + L.cab.w - 4, y + 1, 0x3a4044); }
    // beige panel under the display (name tape, card)
    const P = makeRamp(0xc8bc98, 5, { spread: 0.35 });
    const pan = { x: L.name.x - 2, y: L.name.y - 2, w: L.name.w + 4, h: L.blurb.y + L.blurb.h - L.name.y + 4 };
    for (let y = pan.y; y < pan.y + pan.h; y++) for (let x = pan.x; x < pan.x + pan.w; x++) {
      const e = Math.min(x - pan.x, y - pan.y, pan.x + pan.w - 1 - x, pan.y + pan.h - 1 - y);
      pc.set(x, y, e === 0 ? K : e === 1 ? (y - pan.y === 1 || x - pan.x === 1 ? P[4] : P[1]) : P[2 + ((x * 5 + y * 3) % 13 === 0 ? 1 : 0)]);
    }
    // the name tape (black embossed label)
    for (let y = L.name.y; y < L.name.y + L.name.h; y++) for (let x = L.name.x + 2; x < L.name.x + L.name.w - 2; x++) pc.set(x, y, y === L.name.y ? 0x3a3a40 : y === L.name.y + L.name.h - 1 ? 0x050505 : 0x16161a);
    // the price window
    const pw = { x: L.buy.x, y: L.buy.y, w: 46, h: L.buy.h };
    frame(pw, 0x0a0604);
    // the delivery flap
    const fl = L.flap;
    for (let y = fl.y; y < fl.y + fl.h; y++) for (let x = fl.x; x < fl.x + fl.w; x++) {
      const e = Math.min(x - fl.x, y - fl.y, fl.x + fl.w - 1 - x, fl.y + fl.h - 1 - y);
      pc.set(x, y, e === 0 ? K : y < fl.y + 3 ? 0x050505 : y === fl.y + 3 ? 0x8a9096 : (x + y) % 5 === 0 ? 0x2e3236 : 0x3a3e42);
    }
    // the marquee (backlit) and the research-point counter window
    const M = L.marq;
    for (let y = M.y; y < M.y + M.h; y++) for (let x = M.x; x < M.x + M.w; x++) {
      const e = Math.min(x - M.x, y - M.y, M.x + M.w - 1 - x, M.y + M.h - 1 - y);
      const glow = 0.8 - Math.abs((y - M.y) / M.h - 0.45) * 0.6;
      pc.set(x, y, e === 0 ? K : e === 1 ? 0xa8aeb2 : glow > 0.62 ? 0xfff0c0 : glow > 0.5 ? 0xf6dc98 : 0xe0be70);
    }
    frame(L.rp, 0x060402);
    const cv = this.body, ctx = cv.getContext('2d')!;
    ctx.putImageData(pc.toImageData(), 0, 0);
    const title = L.portrait ? 'COMMISSARY' : 'STAFF COMMISSARY';
    bitText(ctx, title, M.x + Math.round(M.w / 2), M.y + 2, { color: '#4a2410', outline: null, align: 'center' });
    bitText(ctx, 'PUSH', fl.x + Math.round(fl.w / 2), fl.y + 1, { color: '#6a7074', outline: null, align: 'center' });
    this.rpShown = -1;
  }
  private drawRP() {
    const L = this.L!;
    const rp = dollars();
    if (rp === this.rpShown && this.flash <= 0) return;
    this.rpShown = rp;
    const ctx = this.body.getContext('2d')!;
    const b = L.rp;
    ctx.fillStyle = '#060402'; ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    const s = String(Math.min(99999, rp)).padStart(4, '0');
    const red = this.flash > 0 && Math.floor(this.flash * 8) % 2 === 0;
    bitText(ctx, '8888'.slice(0, s.length), b.x + b.w - 4, b.y + 1, { color: '#2a1606', outline: null, align: 'right' });
    bitText(ctx, s, b.x + b.w - 4, b.y + 1, { color: red ? '#ff4a2a' : '#ffb43c', outline: null, align: 'right' });
    bitText(ctx, '$', b.x + 4, b.y + 1, { color: '#8a5a20', outline: null });
  }

  // ---------------------------------------------------------------- slots
  private items() { return CATALOG.filter((i) => i.series === this.series); }
  private get perPage() { const L = this.L!; return L.cols * L.rows; }
  private buildSlots() {
    const L = this.L;
    if (!L) return;
    const list = this.items();
    const pages = Math.max(1, Math.ceil(list.length / this.perPage));
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    const show = list.slice(this.page * this.perPage, (this.page + 1) * this.perPage);
    const focused = document.activeElement;
    const keepFocus = this.slots.findIndex((s) => s.b === focused);
    for (const s of this.slots) this.host.preview.drop('shop:' + s.id);
    this.slotsEl.innerHTML = '';
    this.slots = show.map((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dk-slot';
      const cv = document.createElement('canvas');
      cv.width = L.slotW; cv.height = L.slotH;
      cv.style.width = L.slotW * L.S + 'px'; cv.style.height = L.slotH * L.S + 'px';
      b.append(cv);
      const code = String.fromCharCode(65 + Math.floor(i / L.cols) + this.page * L.rows) + ((i % L.cols) + 1);
      b.setAttribute('aria-label', `${code}: ${it.name}, ${it.price ? it.price + ' research points' : 'free'}${owned(it.id) ? `, you own ${owned(it.id)}` : ''}`);
      b.addEventListener('click', () => { if (this.sel === it.id) this.buy(); else { this.select(it.id); sfx('key', 0.6); } });
      b.addEventListener('focus', () => { if (this.sel !== it.id) { this.select(it.id); sfx('tick', 0.35); } });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') b.focus({ preventScroll: true }); });
      this.slotsEl.append(b);
      const s: Slot = { id: it.id, b, cv, ctx: cv.getContext('2d')!, code, drop: 0 };
      this.drawSlot(s, 0);
      return s;
    });
    if (keepFocus >= 0) this.slots[Math.min(keepFocus, this.slots.length - 1)]?.b.focus({ preventScroll: true });
    if (this.pageL) this.pageL.disabled = this.page <= 0;
    if (this.pageR) this.pageR.disabled = this.page >= pages - 1;
    if (!this.sel || !show.some((i) => i.id === this.sel)) this.select(show[0]?.id ?? '', true);
  }
  private drawSlot(s: Slot, dt: number) {
    const L = this.L!;
    const it = ITEM.get(s.id)!;
    const ctx = s.ctx, W = L.slotW, H = L.slotH, RH = H - 14;
    const on = this.sel === s.id;
    this.host.preview.draw(ctx, 'shop:' + s.id, s.id, W, RH, { dt, yaw: 0.35 + (on ? this.t * 0.9 : Math.sin(this.t * 0.4 + s.code.charCodeAt(0)) * 0.3), slot: true, drop: s.drop > 0 ? 1 - s.drop : 0 });
    // the glass: two diagonal glints
    ctx.fillStyle = 'rgba(220,240,255,0.16)';
    for (let i = 0; i < 6; i++) { ctx.fillRect(4 + i, RH - 12 - i * 2, 1, 2); ctx.fillRect(W - 14 + i, 3 + i * 2, 1, 2); }
    // the strip: code label, price window
    ctx.fillStyle = '#0a0806'; ctx.fillRect(0, RH, W, 14);
    const cw = Math.max(20, bitMeasure(s.code) + 4);
    ctx.fillStyle = '#e8dcb8'; ctx.fillRect(1, RH + 1, cw, 12);
    ctx.fillStyle = '#b8ac88'; ctx.fillRect(1, RH + 12, cw, 1);
    bitText(ctx, s.code, 1 + cw / 2, RH - 1, { color: '#2a1d0e', outline: null, align: 'center' });
    ctx.fillStyle = '#100604'; ctx.fillRect(cw + 2, RH + 1, W - cw - 3, 12);
    const price = it.price ? '$' + cost(it) : '0';
    bitText(ctx, price, W - 3, RH - 1, { color: !it.price ? '#8aff9a' : cost(it) > dollars() ? '#8a4a2a' : '#ffb43c', outline: null, align: 'right' });
    const n = owned(s.id);
    if (n) { ctx.fillStyle = '#0a0806'; ctx.fillRect(1, 1, 15, 10); bitText(ctx, '×' + n, 2, -2, { color: '#8aff9a', outline: null }); }
    if (on) {
      const blink = Math.floor(this.t * 3) % 2 === 0;
      ctx.fillStyle = blink ? '#ffcf5a' : '#c88a20';
      ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, RH - 1, W, 1); ctx.fillRect(0, 0, 1, RH); ctx.fillRect(W - 1, 0, 1, RH);
    }
  }

  private select(id: string, quiet = false) {
    this.sel = id;
    const it = ITEM.get(id);
    if (!it) { this.nameEl.textContent = ''; this.blurbEl.textContent = ''; return; }
    const n = owned(id), sp = spare(id);
    this.nameEl.innerHTML = `<b>${esc(it.name)}</b>`;
    const sub = SERIES.find((s) => s.key === it.series)!;
    this.blurbEl.innerHTML = `${esc(it.blurb)}<small>${esc(sub.name)} · ${n ? `owned ${n}${sp < n ? ` · ${n - sp} placed` : ''}` : 'not owned'}</small>`;
    this.priceEl.innerHTML = it.price ? `<b>$${cost(it)}</b><small>DOLLARS</small>` : '<b>FREE</b>';
    this.priceEl.classList.toggle('short', cost(it) > dollars());
    if (this.buyBtn) { this.buyBtn.setLabel(it.price ? 'Buy' : 'Take'); this.buyBtn.paint(); }
    if (!quiet) this.noteEl.textContent = '';
  }
  private setSeries(k: Series, quiet = false) {
    if (k !== this.series) this.page = 0;
    else if (!quiet && this.L) { const pages = Math.ceil(this.items().length / this.perPage); this.page = (this.page + 1) % Math.max(1, pages); }
    this.series = k;
    SERIES.forEach((s, i) => this.tabBtns[i]?.classList.toggle('on', s.key === k));
    this.sel = '';
    this.buildSlots();
    if (!quiet) sfx('rocker', 0.6);
  }
  private cycleSeries(d: number) { const i = SERIES.findIndex((s) => s.key === this.series); this.setSeries(SERIES[(i + d + SERIES.length) % SERIES.length].key); }
  private turnPage(d: number) { this.page += d; this.sel = ''; this.buildSlots(); this.slots[0]?.b.focus({ preventScroll: true }); }

  private buy() {
    const it = ITEM.get(this.sel);
    if (!it) return;
    if (it.price > 0 && !spendDollars(cost(it), 'deco:' + it.id)) {
      sfx('error'); this.flash = 1.2;
      this.noteEl.textContent = 'insufficient research points';
      this.host.say('poor');
      return;
    }
    addOwned(it.id, 1);
    sfx('confirm'); sfx('servo', 0.5);
    setTimeout(() => sfx('slam', 0.35), 520);
    const s = this.slots.find((q) => q.id === it.id);
    if (s) s.drop = 1;
    this.delivered = 2.4;
    this.noteEl.textContent = 'delivered to your tray';
    this.select(it.id, true);
    this.host.say(it.price ? 'buy' : 'free');
  }

  update(dt: number) {
    if (!this.active || !this.L) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.delivered = Math.max(0, this.delivered - dt);
    this.drawRP();
    // the display window: the selected item turning under the strip light
    if (this.sel) this.host.preview.draw(this.detCtx, 'det', this.sel, this.det.width, this.det.height, { dt, yaw: this.t * 0.6, slot: true });
    else { this.detCtx.fillStyle = '#07090b'; this.detCtx.fillRect(0, 0, this.det.width, this.det.height); }
    // slots: the selected one every frame, the others two at a time; a dropping one every frame
    for (const s of this.slots) if (s.drop > 0) { s.drop = Math.max(0, s.drop - dt * 1.6); this.drawSlot(s, dt); }
    const sel = this.slots.find((s) => s.id === this.sel);
    if (sel && sel.drop <= 0) this.drawSlot(sel, dt);
    if (this.slots.length) for (let k = 0; k < 2; k++) { const s = this.slots[this.slotI++ % this.slots.length]; if (s !== sel && s.drop <= 0) this.drawSlot(s, dt * this.slots.length / 2); }
  }
}

export { bitMeasure };

// THE PRESS'S CREATE PAGE (round 17): the press's shop, in the same tube as its FEED page
// (src/ui/crt, amber). Every pattern on file is a ware on a plinth: its real model turning
// (src/ui/machine/itemSpin.ts), the price as numbers under it (dollars, and the kilos of matter
// it draws, red when the bank is short). Under the pointer a ware lifts, turns quicker and
// shows its name. Buying is tactile: hold a plinth down (or press Enter on it) and its gauge
// fills; at the top the plate prints, the ware jumps and the purse ticks down. Locked patterns
// stand dim behind a padlock with their research price. The purse, the bank, the plate's
// calibration and the press's upgrades sit along the top as numbers and lamps.
// The terminal (terminal.ts) owns the state and the make(); this draws it.
import { hasItemDef, itemDef } from '../../items/item';
import { mxItemSpin, type ItemSpin } from '../../ui/machine/itemSpin';
import { sfx } from '../../ui/menus/sfx';
import { crtScreen, type Crt } from '../../ui/crt/crt';
import { MATS, fmtKg, type Matter } from './matter';
import type { Pattern } from './registry';

export interface CreateHost {
  known: Pattern[];
  locked: Pattern[];
  /** prints per fee (the Batch Former makes it three) */
  batch: number;
  dollars: number;
  bankKg: number;
  /** can this pattern be paid for now: '' yes, else why not ('dollars' / 'matter' / 'busy') */
  why(q: Pattern): '' | 'dollars' | 'matter' | 'busy';
  cost(q: Pattern): Matter;
  /** have the bank's kilos of one material */
  banked(mat: string): number;
  make(q: Pattern): void;
  /** the plate's calibration: 0 none, 1 close, 2 true (a spare on the next make) */
  calib: number;
  calibrate(): void;
  upgrades: { title: string; on: boolean }[];
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const iname = (k: string) => (hasItemDef(k) ? itemDef(k).name : k.replace(/_/g, ' '));
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const LOCK = '<svg class="pc-lock" viewBox="0 0 7 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 0h3v1h1v3h1v4H0V4h1V1h1zm0 1v3h3V1zM3 5h1v2H3z"/></svg>';
const HOLD = 0.55; // seconds a plinth is held down to buy

export class CreateScreen {
  private crt: Crt = crtScreen({ phos: 'amber', sound: false, bulge: false, bright: 1.12 });
  private holder = h('div', 'pf-host pc-host');
  private spins = new Map<string, ItemSpin | null>();
  private lit = false;
  private hold: { q: Pattern; t: number; el: HTMLElement; id: number } | null = null;
  private raf = 0; private last = 0; private dead = false;

  constructor(private host: CreateHost) {
    this.holder.append(this.crt.el);
    const loop = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.tick(dt);
    };
    this.last = performance.now();
    this.raf = requestAnimationFrame(loop);
    window.addEventListener('pointerup', this.release);
    window.addEventListener('pointercancel', this.release);
  }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); window.removeEventListener('pointerup', this.release); window.removeEventListener('pointercancel', this.release); this.crt.dispose(); }
  setHost(host: CreateHost) { this.host = host; }

  render(el: HTMLElement) {
    const H = this.host;
    const root = h('div', 'pc');
    this.crt.glass.innerHTML = '';
    this.crt.glass.append(root);
    // ---- the top strip: purse, bank, the plate, the upgrades (numbers and lamps)
    const top = h('div', 'pc-top');
    top.append(h('span', 'pc-num', `<i>$</i>${fmt(H.dollars)}`), h('span', 'pc-num', `<i>KG</i>${esc(fmtKg(H.bankKg).toUpperCase())}`));
    if (H.batch > 1) top.append(h('span', 'pc-num', `<i>×</i>${H.batch}`));
    const plate = h('button', 'pc-plate' + (H.calib === 2 ? ' true' : H.calib === 1 ? ' close' : ''), '<b></b><b></b><b></b>') as HTMLButtonElement;
    plate.type = 'button';
    plate.title = H.calib === 2 ? 'plate true: the next make prints a spare' : 'calibrate the plate: a clean run prints a spare';
    plate.disabled = H.calib === 2;
    plate.addEventListener('click', () => H.calibrate());
    top.append(plate);
    const ups = h('span', 'pc-ups');
    for (const u of H.upgrades) { const l = h('i', u.on ? 'on' : ''); l.title = u.title + (u.on ? '' : ' · research in the lab'); ups.append(l); }
    top.append(ups);
    root.append(top);
    // ---- the wares
    const grid = h('div', 'pc-grid');
    const keep = new Set<string>();
    for (const q of H.known) grid.append(this.tile(q, false, keep));
    for (const q of H.locked.slice(0, 24)) grid.append(this.tile(q, true, keep));
    if (!H.known.length && !H.locked.length) grid.append(h('div', 'pf-empty', '—'));
    for (const k of [...this.spins.keys()]) if (!keep.has(k)) this.spins.delete(k);
    root.append(grid);
    for (const c of [...el.children]) if (c !== this.holder) c.remove();
    if (this.holder.parentElement !== el) el.append(this.holder);
    if (!this.lit) { this.lit = true; requestAnimationFrame(() => void this.crt.powerOn(true)); }
  }

  private tile(q: Pattern, locked: boolean, keep: Set<string>): HTMLElement {
    const H = this.host;
    const why = locked ? 'locked' : H.why(q);
    const t = h('button', 'pc-t crt-ic' + (locked ? ' locked' : why ? ' cant' : '')) as HTMLButtonElement;
    t.type = 'button';
    const n = q.n * H.batch;
    t.setAttribute('aria-label', `${iname(q.item)}${n > 1 ? ' ×' + n : ''}, $${q.tok}`);
    const m = h('span', 'crt-ic-m');
    const k = q.item;
    keep.add(k);
    let sp = this.spins.get(k);
    if (sp === undefined) { sp = mxItemSpin(k, 64); this.spins.set(k, sp); }
    if (sp) { m.append(sp.cv); sp.hot(false); }
    m.append(h('i', 'pc-plinth'));
    if (locked) m.append(h('span', 'pc-lk', LOCK));
    t.append(m);
    // the price: dollars, then the kilos it draws (red where the bank is short); a locked one, its research price
    const cost = H.cost(q);
    const kg = MATS.reduce((a, mm) => a + (cost[mm.key] ?? 0), 0);
    const shortMat = MATS.some((mm) => (cost[mm.key] ?? 0) > H.banked(mm.key) + 1e-6);
    const price = locked ? `<b class="pc-rp">${q.rp}<small>RP</small></b>` : `<b class="${why === 'dollars' ? 'no' : ''}">$${q.tok}</b><s class="${shortMat ? 'no' : ''}">${esc(fmtKg(kg).toUpperCase())}</s>`;
    t.append(h('span', 'pc-price', price));
    t.append(h('span', 'crt-ic-l', `${n > 1 ? `<i>×${n}</i>` : ''}<em>${esc(iname(q.item))}</em>`));
    const gauge = h('span', 'pc-hold', '<i></i>');
    t.append(gauge);
    const hot = (on: boolean) => { t.classList.toggle('hot', on); sp?.hot(on); };
    t.addEventListener('pointerenter', () => hot(true));
    t.addEventListener('pointerleave', () => { hot(false); if (this.hold?.el === t) this.cancel(); });
    t.addEventListener('focus', () => hot(true));
    t.addEventListener('blur', () => hot(false));
    if (!locked) {
      t.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        if (why) { sfx('error', 0.4); t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope'); return; }
        this.hold = { q, t: 0, el: t, id: e.pointerId };
        t.classList.add('down');
        sfx('rocker', 0.45);
      });
      t.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !why) { e.preventDefault(); this.buy(q, t); } });
    }
    return t;
  }

  private release = () => { if (this.hold && this.hold.t < HOLD) this.cancel(); };
  private cancel() {
    const hd = this.hold; this.hold = null;
    if (!hd) return;
    hd.el.classList.remove('down');
    (hd.el.querySelector('.pc-hold i') as HTMLElement | null)?.style.setProperty('width', '0%');
  }
  private buy(q: Pattern, el: HTMLElement) {
    this.hold = null;
    el.classList.remove('down');
    el.classList.remove('bought'); void el.offsetWidth; el.classList.add('bought');
    sfx('press', 0.6); sfx('plate', 0.5);
    void this.crt.swap(() => {});
    // the terminal re-renders after the make: let the jump play first
    setTimeout(() => this.host.make(q), 220);
  }

  private tick(dt: number) {
    const hd = this.hold;
    if (!hd) return;
    if (!hd.el.isConnected) { this.hold = null; return; }
    hd.t += dt;
    const k = Math.min(1, hd.t / HOLD);
    (hd.el.querySelector('.pc-hold i') as HTMLElement | null)?.style.setProperty('width', Math.round(k * 100) + '%');
    if (Math.random() < 0.3) sfx('tick', 0.15);
    if (k >= 1) this.buy(hd.q, hd.el);
  }
}

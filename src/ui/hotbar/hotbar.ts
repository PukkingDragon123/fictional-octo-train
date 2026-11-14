// THE HOTBAR (round 12): six quick slots. A slot is bound to a thing you carry
// (wherever it is: a pocket, the pack, the tool roll); the binding rides on the
// item itself (item.data.hot = 1..6) so it is saved with it and follows it from
// pocket to pack. Keys 1-6 (a tap on the strip on touch) take it into the right
// hand, or put it away again when it is already there. Binding is drag and drop
// in Inspect Yourself (src/ui/selfInspect) or from the pack view.
import { openItemPanel } from '../itemPanel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Item } from '../../items/item';
import { itemName } from '../../items/item';
import type { Player } from '../../entities/player';
import { EquipAction } from '../../actions/basic';
import { isTouchMode } from '../touch/mode';
import { ctxAllowed } from './context';
import { fpOwner } from '../../fp/fp';
import { Belt, BELT_N } from './belt';

export const HOT_N = 6;

/** the item bound to slot n (1..6), if the unit still carries it */
export function hotItem(p: Player | null | undefined, n: number): Item | null {
  if (!p) return null;
  let best: Item | null = null;
  for (const it of p.allItems()) if ((it.data as any)?.hot === n) best = it;
  return best;
}
/** all six slots */
export function hotSlots(p: Player | null | undefined): (Item | null)[] {
  const out: (Item | null)[] = new Array(HOT_N).fill(null);
  if (!p) return out;
  for (const it of p.allItems()) { const n = (it.data as any)?.hot; if (n >= 1 && n <= HOT_N) out[n - 1] = it; }
  return out;
}
/** bind an item to slot n (null item: clear the slot) */
export function bindHot(p: Player, n: number, it: Item | null) {
  for (const q of p.allItems()) if ((q.data as any)?.hot === n || (it && q === it)) { const d = { ...(q.data || {}) } as any; delete d.hot; q.data = d; }
  if (it) it.data = { ...(it.data || {}), hot: n } as any;
  bus.emit('inventoryChanged', p);
  G.audio?.ui?.('bag_place', 0.35);
}
/** which slot an item is bound to (0 = none) */
export function hotOf(it: Item | null | undefined): number { return ((it?.data as any)?.hot as number) || 0; }

/** take slot n into the right hand (or put it away when it is already there) */
export function useHot(p: Player, n: number) {
  const it = hotItem(p, n);
  if (!it) { bus.emit('think', p, `Slot ${n} is empty. (Inspect yourself to fill it.)`); G.audio?.ui?.('bag_bad', 0.3); return; }
  if (p.handR === it || p.handL === it) p.actions.add(new EquipAction(p, null, p.handR === it ? 'R' : 'L'));
  else p.actions.add(new EquipAction(p, it, 'R'));
  bus.emit('halo', p, itemName(it).toLowerCase(), 'info');
}

export class HotbarStrip {
  readonly el: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private belt = new Belt();
  private sig = '';
  private t = 0;
  private last = performance.now();
  private hoverI = -1;
  hidden = false;

  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'hot12';
    el.className = 'belt';
    el.append(this.belt.cv);
    for (let i = 0; i < HOT_N; i++) {
      // a transparent hit area over each holder of the belt
      const s = document.createElement('div');
      s.className = 'hb-slot';
      s.addEventListener('contextmenu', (e) => e.preventDefault());
      s.addEventListener('pointerenter', () => { this.hoverI = i; this.sig = ''; this.t = 0; });
      s.addEventListener('pointerleave', () => { if (this.hoverI === i) this.hoverI = -1; this.sig = ''; this.t = 0; });
      s.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const p = G.local; if (!p || !this.usable()) return;
        // right-click (or a long press on a filled holder): the item card above the belt (src/ui/itemPanel.ts)
        const card = () => { const it = hotSlots(p)[i]; if (!it) return false; const r = s.getBoundingClientRect(); openItemPanel(it, p.containerOf(it) || p.inv, { x: r.left, y: r.top - 260, w: r.width, h: r.height }); return true; };
        if (e.button === 2) { card(); return; }
        // a click (desktop) or a tap: use it; a long press opens the card (an empty holder: Inspect Yourself to rearrange)
        const t0 = performance.now();
        const up = () => {
          window.removeEventListener('pointerup', up);
          if (performance.now() - t0 > 480) { if (!card()) (G as any).selfInspect?.toggle?.(true); }
          else useHot(p, i + 1);
        };
        window.addEventListener('pointerup', up);
      });
      el.appendChild(s);
      this.slots.push(s);
    }
    document.body.appendChild(el);
    this.layoutSlots();
    window.addEventListener('keydown', (e) => {
      if (e.repeat || G.input?.textFocus || !/^Digit[1-6]$/.test(e.code) || !ctxAllowed()) return;
      const p = G.local; if (!p) return;
      e.preventDefault();
      useHot(p, Number(e.code.slice(5)));
      this.t = 0;
    });
    bus.on('inventoryChanged', () => { this.t = 0; });
    (G as any).hotbar = this;
  }

  /** usable now: the HUD's usual rule, and also under the pack close-up and the pickup grab (things go into it) */
  private usable(): boolean {
    const o = fpOwner();
    return ctxAllowed() || ((o === 'pack' || o === 'grab') && !!G.local && !G.local.body.dead);
  }
  private layoutSlots() {
    const b = this.belt;
    this.slots.forEach((s, i) => { s.style.left = (b.L + i * b.HS) + 'px'; s.style.width = b.HS + 'px'; s.style.top = '10px'; s.style.height = (b.H - 10) + 'px'; });
  }
  /** the slot (1..6) under a client point, 0 for none */
  slotAt(x: number, y: number): number {
    if (!this.el.classList.contains('on')) return 0;
    for (let i = 0; i < this.slots.length; i++) { const r = this.slots[i].getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top - 10 && y <= r.bottom) return i + 1; }
    return 0;
  }
  /** where a thing flying into the belt lands (its own holder when it has one, else the free holder nearest the middle) */
  pocketPoint(it: Item): { x: number; y: number } | null {
    if (!this.el.classList.contains('on')) return null;
    const p = G.local;
    let n = hotOf(it);
    if (!n && p) { const s = hotSlots(p); const free = [2, 3, 1, 4, 0, 5].find((k) => !s[k]); n = (free ?? 2) + 1; }
    const r = this.belt.cv.getBoundingClientRect();
    const q = this.belt.slotPoint(n - 1);
    return { x: r.left + q.x * (r.width / this.belt.W), y: r.top + (q.y + 14) * (r.height / this.belt.H) };
  }
  /** a thing has landed in the belt: its holder (or the middle) gives a bounce */
  landed(it: Item) {
    const n = hotOf(it);
    this.belt.kick(n ? n - 1 : 2);
    G.audio?.ui?.('bag_place', 0.25);
  }

  /** a phone held upright: the belt hangs just under the body console (never over its machines); the touch
   * keys' side columns start under it (--hb-bottom) */
  private placePhone() {
    const phone = isTouchMode() && window.innerWidth <= 520 && window.innerHeight > window.innerWidth;
    this.belt.size(window.innerWidth < 430);
    this.layoutSlots();
    if (!phone) { if (this.el.style.top) { this.el.style.top = ''; document.documentElement.style.removeProperty('--hb-bottom'); } return; }
    const css = (G as any).hudBody?.st?.css as { y: number; h: number } | undefined;
    const top = Math.round(css && css.h > 10 ? css.y + css.h + 4 : 64);
    if (this.el.style.top !== top + 'px') this.el.style.top = top + 'px';
    const bot = Math.round(top + this.el.offsetHeight);
    document.documentElement.style.setProperty('--hb-bottom', bot + 'px');
  }

  update(dt: number) {
    const p = G.local;
    const on = !this.hidden && !!p && this.usable();
    this.el.classList.toggle('on', on);
    this.el.classList.toggle('touch', isTouchMode());
    if (!on || !p) return;
    const now = performance.now();
    this.belt.update(Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    this.placePhone();
    const s = hotSlots(p);
    // how many of each you carry (a count on the holder's tag when more than one)
    const all = p.allItems();
    const count = (it: Item) => all.reduce((n, o) => n + (o.key === it.key ? 1 : 0), 0);
    const sig = s.map((it, i) => (it ? it.uid + ':' + it.key + ':' + count(it) + (p.handR === it || p.handL === it ? '*' : '') : '-') + (this.hoverI === i ? 'h' : '')).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.belt.set(s.map((it, i) => ({ it, n: it ? count(it) : 0, held: !!it && (p.handR === it || p.handL === it), hover: this.hoverI === i })));
    s.forEach((it, i) => { this.slots[i].classList.toggle('full', !!it); this.slots[i].classList.toggle('held', !!it && (p.handR === it || p.handL === it)); this.slots[i].title = ''; });
  }
}
void BELT_N;

// THE HOTBAR (round 12): six quick slots. A slot is bound to a thing you carry
// (wherever it is: a pocket, the pack, the tool roll); the binding rides on the
// item itself (item.data.hot = 1..6) so it is saved with it and follows it from
// pocket to pack. Keys 1-6 (a tap on the strip on touch) take it into the right
// hand, or put it away again when it is already there. Binding is drag and drop
// in Inspect Yourself (src/ui/selfInspect) or from the pack view.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Item } from '../../items/item';
import { itemName } from '../../items/item';
import type { Player } from '../../entities/player';
import { EquipAction } from '../../actions/basic';
import { itemIconFor, iconResCss } from '../icons';
import { isTouchMode } from '../touch/mode';
import { ctxAllowed } from './context';

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
  private sig = '';
  private t = 0;
  hidden = false;

  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'hot12';
    for (let i = 0; i < HOT_N; i++) {
      const s = document.createElement('div');
      s.className = 'hb-slot';
      s.innerHTML = `<i></i><b>${i + 1}</b>`;
      s.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const p = G.local; if (!p || !ctxAllowed()) return;
        // a click (desktop) or a tap: use it; a long press opens Inspect Yourself to rearrange
        const t0 = performance.now();
        const up = () => {
          window.removeEventListener('pointerup', up);
          if (performance.now() - t0 > 480) (G as any).selfInspect?.toggle?.(true);
          else useHot(p, i + 1);
        };
        window.addEventListener('pointerup', up);
      });
      el.appendChild(s);
      this.slots.push(s);
    }
    document.body.appendChild(el);
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

  update(dt: number) {
    const p = G.local;
    const on = !this.hidden && !!p && ctxAllowed();
    this.el.classList.toggle('on', on);
    this.el.classList.toggle('touch', isTouchMode());
    if (!on || !p) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.3;
    const s = hotSlots(p);
    const sig = s.map((it) => (it ? it.uid + ':' + it.key + (p.handR === it || p.handL === it ? '*' : '') : '-')).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    s.forEach((it, i) => {
      const el = this.slots[i];
      const icon = el.querySelector('i') as HTMLElement;
      icon.style.backgroundImage = it ? `url(${itemIconFor(it, iconResCss(32))})` : '';
      el.classList.toggle('full', !!it);
      el.classList.toggle('held', !!it && (p.handR === it || p.handL === it));
      el.title = it ? itemName(it) : 'empty';
    });
  }
}

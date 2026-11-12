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
import { itemIconFor, iconResCss } from '../icons';
import { isTouchMode } from '../touch/mode';
import { ctxAllowed } from './context';
import { crispCanvas, rect, rivet, GUN, AMB } from '../hiPixel';
import { pxPlate, pxFrame } from '../pxKit';
import { mixHex } from '../../gfx/pixel';

// ---- the slots (round 15): just the six slots, each a physical socket in hi-res pixel art.
// A chamfered gunmetal bezel with two screws, a recessed felt bed, a brass tag stamped with the
// key's number; the item sits on the felt with a hard shadow. The slot in the hand rises a
// little and an amber strip lights along the bottom of its bed. Nothing else on the strip.
const SW = 54;
const FONT_DIGITS: Record<string, string[]> = {
  '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '##.', '#.#', '.#.'],
};
/** a socket in 2x pixel art (27x27 art pixels on a 54 px slot): a notched slate bezel with a pixel bevel,
 *  a recessed felt bed in a checker dither, a brass number tag, a screw; held: an amber strip and a dithered glow */
function drawSlot(c: CanvasRenderingContext2D, n: number, full: boolean, held: boolean) {
  const A = SW / 2;
  c.save();
  c.clearRect(0, 0, A, A);
  pxPlate(c, 1, 1, A - 3, A - 3, { tone: 'steel', chamfer: 3, well: 0, screws: false, seed: n * 31, wear: 0.3 });
  // the bed: ink lip, felt, a checker weave, inner shadow top-left, lit lip bottom-right
  const bx = 5, by = 5, bw = A - 11, bh = A - 11, felt = held ? 0x2a1d0e : 0x15140f;
  rect(c, bx - 1, by, bw + 2, bh, 0x050404); rect(c, bx, by - 1, bw, bh + 2, 0x050404);
  rect(c, bx, by, bw, bh, felt);
  for (let j = 1; j < bh - 1; j++) for (let i = 1 + (j & 1); i < bw - 1; i += 2) rect(c, bx + i, by + j, 1, 1, mixHex(felt, 0xffffff, 0.05));
  rect(c, bx, by, bw, 1, 0x000000, 0.6); rect(c, bx, by, 1, bh, 0x000000, 0.45);
  rect(c, bx + 1, by + bh, bw - 1, 1, GUN[7], 0.7); rect(c, bx + bw, by + 1, 1, bh - 1, GUN[6], 0.6);
  if (held) {
    // the strip of light along the bed's foot, and a dithered glow up the felt
    for (let j = 0; j < 5; j++) for (let i = 1; i < bw - 1; i++) if (j < 2 || ((i + j) & 1) === 0) rect(c, bx + i, by + bh - 3 - j, 1, 1, AMB[4], 0.3 - j * 0.05);
    rect(c, bx + 1, by + bh - 2, bw - 2, 1, AMB[5]); rect(c, bx + 2, by + bh - 2, 3, 1, AMB[6]);
  }
  // the brass tag with the number, top-left on the bezel
  const tx = 1, ty = 1;
  rect(c, tx, ty, 7, 9, 0x241808); rect(c, tx + 1, ty + 1, 5, 7, held ? 0xd4b45e : 0x9c7a2c); rect(c, tx + 1, ty + 1, 5, 1, held ? 0xfaecc0 : 0xd4b45e); rect(c, tx + 1, ty + 7, 5, 1, held ? 0x9c7a2c : 0x664818);
  const g = FONT_DIGITS[String(n)] || [];
  g.forEach((row, y) => { for (let x = 0; x < 3; x++) if (row[x] === '#') rect(c, tx + 2 + x, ty + 2 + y, 1, 1, 0x241808); });
  // a screw bottom-right
  rect(c, A - 6, A - 6, 2, 2, GUN[9]); rect(c, A - 5, A - 5, 1, 1, GUN[5]); rect(c, A - 4, A - 5, 1, 2, 0x050404, 0.8); rect(c, A - 6, A - 4, 3, 1, 0x050404, 0.8);
  if (!full) rect(c, bx + Math.floor(bw / 2) - 2, by + Math.floor(bh / 2), 5, 1, 0xffffff, 0.06);
  c.restore();
}

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
      const sc = crispCanvas(SW / 2, SW / 2, 2);
      sc.cv.className = 'hb-cv';
      drawSlot(sc.c, i + 1, false, false);
      (s as any)._c = sc.c;
      s.append(sc.cv, document.createElement('i'));
      s.addEventListener('contextmenu', (e) => e.preventDefault());
      s.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const p = G.local; if (!p || !ctxAllowed()) return;
        // right-click (or a long press on a filled socket): the item card beside the socket (src/ui/itemPanel.ts)
        const card = () => { const it = hotSlots(p)[i]; if (!it) return false; const r = s.getBoundingClientRect(); openItemPanel(it, p.containerOf(it) || p.inv, { x: r.left, y: r.top - 260, w: r.width, h: r.height }); return true; };
        if (e.button === 2) { card(); return; }
        // a click (desktop) or a tap: use it; a long press opens the card (an empty socket: Inspect Yourself to rearrange)
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
    // the rail the six sockets sit in
    try { pxFrame(el, { tone: 'dark', chamfer: 4, screws: false, seed: 66, scale: 2, wear: 0.3 }); } catch { /* no canvas */ }
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
      const held = !!it && (p.handR === it || p.handL === it);
      el.classList.toggle('full', !!it);
      el.classList.toggle('held', held);
      const c = (el as any)._c as CanvasRenderingContext2D | undefined;
      if (c) drawSlot(c, i + 1, !!it, held);
      el.title = it ? itemName(it) : 'empty';
    });
  }
}

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
import { mxSocketSheet, mxFrame, panelSpec, SOCK_PAD } from '../machine/kit';
import { mxMount, type MxDecor } from '../machine/decor';
import { mxOk } from '../machine/core';

/** round 16: a 3D socket (src/ui/machine): a deep olive cup with a felt bed, a bolt, a stamped yellow number tag, an amber lamp that lights in the hand */
function drawSock(cv: HTMLCanvasElement, n: number, held: boolean): boolean {
  const sh = mxSocketSheet(n); if (!sh) return false;
  const fw = SW + SOCK_PAD * 2;
  if (cv.width !== fw) { cv.width = fw; cv.height = fw; cv.style.width = fw + 'px'; cv.style.height = fw + 'px'; cv.style.left = -SOCK_PAD + 'px'; cv.style.top = -SOCK_PAD + 'px'; }
  const c = cv.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, fw, fw);
  c.drawImage(sh, 0, held ? fw : 0, fw, fw, 0, 0, fw, fw);
  return true;
}

// ---- the slots (round 15): just the six slots, each a physical socket in hi-res pixel art.
// A chamfered gunmetal bezel with two screws, a recessed felt bed, a brass tag stamped with the
// key's number; the item sits on the felt with a hard shadow. The slot in the hand rises a
// little and an amber strip lights along the bottom of its bed. Nothing else on the strip.
const SW = 54;
const FONT_DIGITS: Record<string, string[]> = {
  '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '##.', '#.#', '.#.'],
};
function drawSlot(c: CanvasRenderingContext2D, n: number, full: boolean, held: boolean) {
  const W = SW, H = SW;
  c.clearRect(0, 0, W, H);
  pxPlate(c, 1, 1, W - 4, H - 4, { tone: 'steel', chamfer: 7, well: 0, screws: false, seed: n * 31 });
  // the bed: recessed felt, a soft inner shadow, the weave
  const bx = 6, by = 6, bw = W - 4 - 11, bh = H - 4 - 11, felt = held ? 0x2a1d0e : 0x15140f;
  rect(c, bx - 1, by - 1, bw + 2, bh + 2, 0x050404);
  rect(c, bx + 2, by, bw - 4, bh, felt); rect(c, bx, by + 2, bw, bh - 4, felt); rect(c, bx + 1, by + 1, bw - 2, bh - 2, felt);
  for (let j = 0; j < bh; j += 2) for (let i = (j / 2) % 2; i < bw; i += 2) rect(c, bx + i, by + j, 1, 1, mixHex(felt, 0xffffff, 0.05));
  rect(c, bx + 2, by, bw - 4, 2, 0x000000, 0.55); rect(c, bx, by + 2, 2, bh - 4, 0x000000, 0.45);
  rect(c, bx + 2, by + bh - 1, bw - 4, 1, GUN[6], 0.5);
  if (held) {
    // the strip of light along the bed's foot, and a warm glow up the felt
    for (let j = 0; j < 8; j++) rect(c, bx + 2, by + bh - 3 - j, bw - 4, 1, AMB[4], 0.16 * (1 - j / 8));
    rect(c, bx + 3, by + bh - 3, bw - 6, 2, AMB[5]); rect(c, bx + 3, by + bh - 3, bw - 6, 1, AMB[6]);
  }
  // the brass tag with the number, top-left on the bezel
  const tx = 2, ty = 2;
  rect(c, tx, ty, 9, 9, 0x241808); rect(c, tx + 1, ty + 1, 7, 7, held ? 0xd4b45e : 0x9c7a2c); rect(c, tx + 1, ty + 1, 7, 1, held ? 0xfaecc0 : 0xd4b45e);
  const g = FONT_DIGITS[String(n)] || [];
  g.forEach((row, y) => { for (let x = 0; x < 3; x++) if (row[x] === '#') rect(c, tx + 3 + x, ty + 2 + y, 1, 1, 0x241808); });
  // a screw bottom-right
  rivet(c, W - 9, H - 9, 1, true);
  if (!full) { rect(c, bx + bw / 2 - 4, by + bh / 2, 9, 1, 0xffffff, 0.06); }
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
  private bcn: MxDecor | null = null;

  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'hot12';
    for (let i = 0; i < HOT_N; i++) {
      const s = document.createElement('div');
      s.className = 'hb-slot';
      const sc = crispCanvas(SW, SW);
      sc.cv.className = 'hb-cv';
      if (!(mxOk() && drawSock(sc.cv, i + 1, false))) drawSlot(sc.c, i + 1, false, false);
      (s as any)._c = sc.c; (s as any)._cv = sc.cv;
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
    try {
      if (mxOk()) {
        el.classList.add('mx'); mxFrame(el, (w, h) => { const s = panelSpec(w, h, { seed: 66, hazard: false, vents: false, glands: 2, lamps: [] }); s.depth = 7; s.rivets = false; return s; }, { pad: 10 });
        this.bcn = mxMount(el, 'beacon', { right: -36, bottom: 6, z: 3 }, { col: 'red', s: 0.85, cls: 'hb-bcn' });
      }
      else pxFrame(el, { tone: 'dark', chamfer: 8, screws: false, seed: 66 });
    } catch { /* no canvas */ }
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
    this.bcn?.alert(((G as any).survival?.threat ?? 0) > 0.45);
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
      if (!(mxOk() && drawSock((el as any)._cv, i + 1, held)) && c) drawSlot(c, i + 1, !!it, held);
      el.title = it ? itemName(it) : 'empty';
    });
  }
}

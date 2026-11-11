// THE PANEL KIT (round 15): every in-game panel, plate and button drawn as
// high-resolution pixel art on the src/ui/hiPixel.ts primitives (one art pixel
// per CSS pixel, device-crisp), square with chamfered corners, never rounded.
//   pxPlate(c, x, y, w, h, o)   paint a chamfered plate: gunmetal (or olive / oxblood / brass)
//                               bezel with a brushed grain, a lit lip, corner screws, an optional
//                               recessed dark well and a hazard strip
//   pxFrame(el, o)              hang a plate behind any element; it repaints when the element
//                               resizes (ResizeObserver). Returns { repaint, dispose }.
//   pxButton(label, fn, o)      a menu plate: Alagard label in a recessed channel, a lamp that
//                               lights amber on hover / focus / selected
//   pxLamp(c, x, y, on, ramp)   a small indicator lamp in a screwed bezel
import { bevel, rivet, hazard, rect, GUN, AMB, RED, GRN, crispCanvas, dprK } from './hiPixel';
import { mixHex } from '../gfx/pixel';
import './pxKit.css';

type C2 = CanvasRenderingContext2D;
export type PxTone = 'steel' | 'olive' | 'red' | 'brass' | 'dark';
const OLIVE = [0x0d0f08, 0x1a1e10, 0x262c18, 0x343c22, 0x434d2c, 0x55613a, 0x6c7a4c, 0x8a9866, 0xaab888, 0xcfdab0, 0xeef4d8];
const OXBL = [0x0e0505, 0x1e0a09, 0x2e100e, 0x401814, 0x54201a, 0x6a2c22, 0x84402e, 0xa05a42, 0xc07a5e, 0xdca48a, 0xf4d4c4];
const BRASS = [0x120c04, 0x241808, 0x38260c, 0x4e3612, 0x664818, 0x80601e, 0x9c7a2c, 0xb89640, 0xd4b45e, 0xead08a, 0xfaecc0];
const DARK = [0x050506, 0x0b0c0e, 0x111316, 0x171a1e, 0x1e2227, 0x272c32, 0x323840, 0x414952, 0x58616b, 0x7a848e, 0xa8b0b8];
const RAMPS: Record<PxTone, number[]> = { steel: GUN, olive: OLIVE, red: OXBL, brass: BRASS, dark: DARK };

function hsh(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 974711) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; }

export interface PlateOpts {
  tone?: PxTone;
  /** corner cut in art px */
  chamfer?: number;
  /** bezel width; inside it a recessed dark well (0 = a solid plate) */
  well?: number;
  /** the well's colour */
  wellTint?: number;
  /** corner screws */
  screws?: boolean;
  /** a hazard strip along the bottom edge of the bezel */
  hazard?: boolean;
  seed?: number;
  /** scanlines in the well (a screen) */
  scan?: boolean;
}

/** a chamfered plate in high-res pixel art */
export function pxPlate(c: C2, x: number, y: number, w: number, h: number, o: PlateOpts = {}) {
  const ramp = RAMPS[o.tone ?? 'steel'], ch = o.chamfer ?? Math.max(3, Math.min(10, Math.round(Math.min(w, h) * 0.12)));
  const seed = o.seed ?? 7;
  // a drop shadow under it
  rect(c, x + 3 + ch, y + h, w - ch * 2, 2, 0x000000, 0.35); rect(c, x + w, y + 3 + ch, 2, h - ch * 2, 0x000000, 0.3);
  bevel(c, x, y, w, h, ramp.slice(2, 9), { chamfer: ch });
  // the chamfers: cut the corners clean and give each cut a lit / shaded facet
  for (let i = 0; i < ch; i++) {
    const k = ch - i;
    rect(c, x + i, y + k - 1, 1, 1, ramp[8]); rect(c, x + w - 1 - i, y + k - 1, 1, 1, ramp[5]);
    rect(c, x + i, y + h - k, 1, 1, ramp[4]); rect(c, x + w - 1 - i, y + h - k, 1, 1, ramp[2]);
  }
  // brushed grain: short horizontal streaks, light and dark
  const gx0 = x + 2, gx1 = x + w - 2;
  for (let j = y + 2; j < y + h - 2; j += 2) {
    for (let i = gx0 + Math.floor(hsh(j, 1, seed) * 9); i < gx1 - 6; i += 7 + Math.floor(hsh(i, j, seed) * 11)) {
      const len = 3 + Math.floor(hsh(i, j, seed + 1) * 8);
      rect(c, i, j, Math.min(len, gx1 - i), 1, hsh(i, j, seed + 2) < 0.5 ? ramp[8] : ramp[3], 0.18);
    }
  }
  const well = o.well ?? 0;
  if (well > 0 && w > well * 2 + 4 && h > well * 2 + 4) {
    const wx = x + well, wy = y + well, ww = w - well * 2, wh = h - well * 2, wc = Math.max(2, ch - well + 2);
    const tint = o.wellTint ?? 0x0d0c0a;
    // ink lip, then the well with its own chamfer, an inner shadow top-left and a lit lip bottom-right
    rect(c, wx - 1 + wc, wy - 1, ww + 2 - wc * 2, wh + 2, 0x050404); rect(c, wx - 1, wy - 1 + wc, ww + 2, wh + 2 - wc * 2, 0x050404);
    for (let i = 0; i < wc; i++) { rect(c, wx + i - 1 + 0, wy + wc - i - 1, 1, 1, 0x050404); rect(c, wx + ww - i, wy + wc - i - 1, 1, 1, 0x050404); rect(c, wx + i - 1, wy + wh - wc + i, 1, 1, 0x050404); rect(c, wx + ww - i, wy + wh - wc + i, 1, 1, 0x050404); }
    rect(c, wx + wc, wy, ww - wc * 2, wh, tint); rect(c, wx, wy + wc, ww, wh - wc * 2, tint);
    for (let i = 0; i < wc; i++) { rect(c, wx + wc - i, wy + i, ww - (wc - i) * 2, 1, tint); rect(c, wx + wc - i, wy + wh - 1 - i, ww - (wc - i) * 2, 1, tint); }
    rect(c, wx + wc, wy, ww - wc * 2, 2, 0x000000, 0.5); rect(c, wx, wy + wc, 2, wh - wc * 2, 0x000000, 0.4);
    rect(c, wx + wc, wy + wh, ww - wc * 2, 1, ramp[7], 0.8); rect(c, wx + ww, wy + wc, 1, wh - wc * 2, ramp[6], 0.7);
    // a faint grain in the well, and scanlines if it is a screen
    for (let j = wy + 2; j < wy + wh - 2; j += 3) for (let i = wx + 3 + (j % 5); i < wx + ww - 3; i += 9 + Math.floor(hsh(i, j, seed + 5) * 7)) rect(c, i, j, 1, 1, mixHex(tint, 0xffffff, 0.06));
    if (o.scan) for (let j = wy + 1; j < wy + wh - 1; j += 2) rect(c, wx + 1, j, ww - 2, 1, 0x000000, 0.22);
  }
  if (o.screws !== false && w >= 40 && h >= 24) {
    const sx = Math.max(4, Math.min(well > 0 ? Math.floor(well / 2) + 1 : 6, 7)) + Math.floor(ch * 0.35);
    const r = w >= 120 && h >= 48 ? 2 : 1;
    rivet(c, x + sx, y + sx, r, true); rivet(c, x + w - 1 - sx, y + sx, r, true);
    rivet(c, x + sx, y + h - 1 - sx, r, true); rivet(c, x + w - 1 - sx, y + h - 1 - sx, r, true);
  }
  if (o.hazard && w > 60) hazard(c, x + ch + 10, y + h - Math.max(3, Math.floor((o.well ?? 4) * 0.7)) - 1, Math.min(64, w - ch * 2 - 20), Math.max(2, Math.floor((o.well ?? 4) * 0.5)), 0xe8b52a, 0x17150f, 6);
}

/** an indicator lamp in a little screwed bezel (r 3..5) */
export function pxLamp(c: C2, x: number, y: number, on: boolean, ramp: number[] = AMB, r = 3) {
  rect(c, x - r - 1, y - r, r * 2 + 3, r * 2 + 1, GUN[1]); rect(c, x - r, y - r - 1, r * 2 + 1, r * 2 + 3, GUN[1]);
  rect(c, x - r, y - r, r * 2 + 1, r * 2 + 1, GUN[6]); rect(c, x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1, 0x050404);
  const n = ramp.length;
  const core = on ? ramp[n - 3] : mixHex(ramp[1], 0x000000, 0.35), hi = on ? ramp[n - 1] : ramp[2], lo = on ? ramp[n - 5] : ramp[0];
  rect(c, x - r + 2, y - r + 2, r * 2 - 3, r * 2 - 3, core);
  rect(c, x - r + 2, y + r - 2, r * 2 - 3, 1, lo); rect(c, x + r - 2, y - r + 2, 1, r * 2 - 3, lo);
  rect(c, x - r + 2, y - r + 2, 2, 1, hi); rect(c, x - r + 2, y - r + 2, 1, 2, hi);
}

/** a plate behind an element, repainted on resize */
export function pxFrame(el: HTMLElement, o: PlateOpts & { pad?: number } = {}) {
  el.classList.add('pxf');
  const cv = document.createElement('canvas');
  cv.className = 'pxf-cv';
  el.prepend(cv);
  let lastW = 0, lastH = 0;
  const repaint = () => {
    const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
    if (w < 8 || h < 8) return;
    if (w === lastW && h === lastH && cv.width) return;
    lastW = w; lastH = h;
    const k = dprK();
    cv.width = (w + 2) * k; cv.height = (h + 2) * k;
    cv.style.width = w + 2 + 'px'; cv.style.height = h + 2 + 'px';
    const c = cv.getContext('2d')!;
    c.imageSmoothingEnabled = false; c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, w + 2, h + 2);
    pxPlate(c, 1, 1, w - 2, h - 2, o);
  };
  let ro: ResizeObserver | null = null;
  try { ro = new ResizeObserver(() => repaint()); ro.observe(el); } catch { /* old browser */ }
  requestAnimationFrame(repaint);
  return { repaint: () => { lastW = 0; repaint(); }, dispose: () => { ro?.disconnect(); cv.remove(); el.classList.remove('pxf'); } };
}

export interface PxButton extends HTMLButtonElement { setOn(on: boolean): void }
/** a menu plate with an Alagard label and a lamp */
export function pxButton(label: string, fn: () => void, o: { tone?: PxTone; w?: number; h?: number; lamp?: 'amber' | 'green' | 'red'; cls?: string; sub?: string } = {}): PxButton {
  const W = o.w ?? 236, H = o.h ?? 34;
  const b = document.createElement('button') as PxButton;
  b.type = 'button';
  b.className = 'pxb' + (o.cls ? ' ' + o.cls : '');
  b.style.width = W + 'px'; b.style.height = H + 'px';
  const { cv, c } = crispCanvas(W, H);
  cv.className = 'pxb-cv';
  const t = document.createElement('span'); t.className = 'pxb-t'; t.textContent = label;
  b.append(cv, t);
  if (o.sub) { const s = document.createElement('small'); s.className = 'pxb-s'; s.textContent = o.sub; b.append(s); }
  let on = false;
  const ramp = o.lamp === 'green' ? GRN : o.lamp === 'red' ? RED : AMB;
  const draw = () => {
    const hot = on || b.matches(':hover') || b.matches(':focus-visible') || document.activeElement === b;
    c.clearRect(0, 0, W, H);
    pxPlate(c, 1, 1, W - 4, H - 4, { tone: o.tone ?? 'steel', chamfer: 6, well: 0, screws: false, seed: label.length * 13 });
    // the recessed label channel
    const lx = 26, ly = 5, lw = W - 4 - lx - 10, lh = H - 4 - 10;
    rect(c, lx - 1, ly - 1, lw + 2, lh + 2, 0x050404);
    rect(c, lx, ly, lw, lh, hot ? 0x1c140a : 0x0d0c0b);
    rect(c, lx, ly, lw, 1, 0x000000, 0.6); rect(c, lx, ly + lh, lw, 1, GUN[7], 0.6);
    if (hot) { for (let i = 0; i < lw; i += 2) rect(c, lx + i, ly + lh - 1, 1, 1, ramp[4], 0.55); }
    // the lamp and two slot screws at the far end
    pxLamp(c, 13, Math.floor((H - 4) / 2) + 1, hot, ramp, 4);
    rivet(c, W - 9, 6, 1); rivet(c, W - 9, H - 9, 1);
    b.classList.toggle('hot', hot);
  };
  b.setOn = (v: boolean) => { on = v; b.classList.toggle('on', v); draw(); };
  for (const ev of ['pointerenter', 'pointerleave', 'focus', 'blur']) b.addEventListener(ev, () => requestAnimationFrame(draw));
  b.addEventListener('click', () => fn());
  draw();
  return b;
}

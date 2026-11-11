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
//   pxToggle(label, on, fn)     a bat-handle toggle switch that flips (and clunks)
//   tactile(el, sound)          press-in + a CC0 clunk on any element (also: class px-key / data-px-tactile)
// Round 15b: the old industrial machine. Plates are worn (paint chipped to bare metal at the
// edges, scratches, grime settling at the bottom, a rust bloom under a screw); every press clunks
// (src/ui/menus/sfx.ts samples), lamps light on hover, panels arrive on a mechanism (.px-mech-in).
// The CSS layer (src/ui/pxKit.css) has the same look as nine-slices for CSS-only UI.
import { bevel, rivet, hazard, rect, GUN, AMB, RED, GRN, crispCanvas, dprK } from './hiPixel';
import { mixHex } from '../gfx/pixel';
import './pxKit.css';
import { sfx, type Sfx } from './menus/sfx';

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
  /** age: chipped paint, scratches, grime, rust (0 = factory new; default 0.6) */
  wear?: number;
  /** pressed in (a button held down): the bevel sinks */
  sunk?: boolean;
}

/** a chamfered plate in high-res pixel art */
export function pxPlate(c: C2, x: number, y: number, w: number, h: number, o: PlateOpts = {}) {
  const ramp = RAMPS[o.tone ?? 'steel'], ch = o.chamfer ?? Math.max(3, Math.min(10, Math.round(Math.min(w, h) * 0.12)));
  const seed = o.seed ?? 7;
  // a drop shadow under it
  rect(c, x + 3 + ch, y + h, w - ch * 2, 2, 0x000000, 0.35); rect(c, x + w, y + 3 + ch, 2, h - ch * 2, 0x000000, 0.3);
  bevel(c, x, y, w, h, ramp.slice(2, 9), { chamfer: ch, sunk: o.sunk });
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
  // age: chipped paint along the edges (bare bright metal with a dark lip), scratches, grime low down, rust under a screw
  const wear = o.wear ?? 0.6;
  if (wear > 0 && w > 16 && h > 10) {
    const nChip = Math.round((w + h) / 26 * wear);
    for (let i = 0; i < nChip; i++) {
      const side = Math.floor(hsh(i, 3, seed) * 4), t = hsh(i, 5, seed), len = 2 + Math.floor(hsh(i, 7, seed) * 5);
      const cx = side < 2 ? x + ch + 2 + Math.floor(t * (w - ch * 2 - 6)) : side === 2 ? x + 1 : x + w - 3;
      const cy = side === 0 ? y + 1 : side === 1 ? y + h - 3 : y + ch + 2 + Math.floor(t * (h - ch * 2 - 6));
      const hz = side < 2;
      rect(c, cx, cy, hz ? len : 2, hz ? 2 : len, ramp[9], 0.55); rect(c, cx, cy + (hz ? 2 : 0), hz ? len : 1, 1, ramp[1], 0.6);
    }
    const nScr = Math.round((w * h) / 2400 * wear) + 1;
    for (let i = 0; i < nScr; i++) {
      let sx = x + 4 + Math.floor(hsh(i, 11, seed) * (w - 8)), sy = y + 3 + Math.floor(hsh(i, 13, seed) * (h - 6));
      const n = 3 + Math.floor(hsh(i, 17, seed) * 9), dx = hsh(i, 19, seed) < 0.5 ? 1 : -1;
      for (let k = 0; k < n && sx > x + 2 && sx < x + w - 3 && sy < y + h - 3; k++) { rect(c, sx, sy, 1, 1, ramp[9], 0.35); rect(c, sx, sy + 1, 1, 1, ramp[1], 0.25); sx += dx; if (k % 2) sy++; }
    }
    // grime settles toward the bottom edge
    const gh = Math.min(10, Math.floor(h * 0.3));
    for (let j = 0; j < gh; j++) for (let i = x + ch; i < x + w - ch; i += 2 + ((i + j) % 3)) if (hsh(i, j, seed + 21) < 0.28 * wear * (j / gh)) rect(c, i, y + h - gh - 2 + j, 1, 1, 0x1a1408, 0.35);
    if (wear > 0.4 && w >= 40 && h >= 24 && o.screws !== false) { const rx = x + w - 9, ry = y + h - 6; for (let k = 0; k < 4; k++) rect(c, rx + (k % 2), ry + k, 1, 1, k < 2 ? 0x6a3412 : 0x4a220c, 0.45 - k * 0.08); }
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
export function pxButton(label: string, fn: () => void, o: { tone?: PxTone; w?: number; h?: number; lamp?: 'amber' | 'green' | 'red'; cls?: string; sub?: string; sound?: Sfx } = {}): PxButton {
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
  let on = false, down = false;
  const ramp = o.lamp === 'green' ? GRN : o.lamp === 'red' ? RED : AMB;
  const draw = () => {
    const hot = on || down || b.matches(':hover') || b.matches(':focus-visible') || document.activeElement === b;
    c.clearRect(0, 0, W, H);
    const dy = down ? 1 : 0;
    c.save(); c.translate(0, dy);
    pxPlate(c, 1, 1, W - 4, H - 4, { tone: o.tone ?? 'steel', chamfer: 6, well: 0, screws: false, seed: label.length * 13, sunk: down });
    // the recessed label channel
    const lx = 26, ly = 5, lw = W - 4 - lx - 10, lh = H - 4 - 10;
    rect(c, lx - 1, ly - 1, lw + 2, lh + 2, 0x050404);
    rect(c, lx, ly, lw, lh, hot ? 0x1c140a : 0x0d0c0b);
    rect(c, lx, ly, lw, 1, 0x000000, 0.6); rect(c, lx, ly + lh, lw, 1, GUN[7], 0.6);
    if (hot) { for (let i = 0; i < lw; i += 2) rect(c, lx + i, ly + lh - 1, 1, 1, ramp[4], 0.55); }
    // the lamp and two slot screws at the far end
    pxLamp(c, 13, Math.floor((H - 4) / 2) + 1, hot, ramp, 4);
    rivet(c, W - 9, 6, 1); rivet(c, W - 9, H - 9, 1);
    c.restore();
    b.classList.toggle('hot', hot); b.classList.toggle('down', down);
  };
  b.addEventListener('pointerdown', () => { down = true; draw(); sfx(o.sound ?? 'plate', 0.55); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (down) { down = false; draw(); } });
  b.setOn = (v: boolean) => { on = v; b.classList.toggle('on', v); draw(); };
  for (const ev of ['pointerenter', 'pointerleave', 'focus', 'blur']) b.addEventListener(ev, () => requestAnimationFrame(draw));
  b.addEventListener('click', () => fn());
  draw();
  return b;
}

/** press-in and a clunk on any element (a CC0 sample through src/ui/menus/sfx.ts) */
export function tactile(el: HTMLElement, sound: Sfx = 'key') { el.classList.add('px-tactile'); el.dataset.pxSound = sound; installTactile(); }

/** what presses in and clunks: the kit's own keys plus the game's older buttons (dialogue replies, report keys, terminal widgets, hotbar slots) */
const TACTILE = '.px-key, .px-tactile, [data-px-tactile], .hm-opt, .rs-key, .dz-key, .ptm-make, .ct-scr .t-tab, .ct-scr .t-seg-b, .ct-scr .t-toggle, .hb-slot, .mg-cal';
let tactileOn = false;
/** one delegated hook for the whole page: .px-key, .px-tactile and [data-px-tactile] press in and clunk */
export function installTactile() {
  if (tactileOn) return;
  tactileOn = true;
  let held: HTMLElement | null = null;
  const up = () => { held?.classList.remove('px-down'); held = null; };
  document.addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.(TACTILE) as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    held = t; t.classList.add('px-down');
    sfx((t.dataset.pxSound || t.dataset.pxTactile || 'key') as Sfx, 0.5);
  }, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
}
installTactile();

export interface PxToggle extends HTMLButtonElement { set(on: boolean): void; readonly on: boolean }
/** a bat-handle toggle switch on a small screwed plate, with its label stencilled beside it */
export function pxToggle(label: string, on0: boolean, onChange: (on: boolean) => void, o: { sub?: string } = {}): PxToggle {
  const b = document.createElement('button') as PxToggle;
  b.type = 'button'; b.className = 'px-toggle';
  const W = 30, H = 40;
  const { cv, c } = crispCanvas(W, H);
  const lab = document.createElement('span'); lab.className = 'px-toggle-l'; lab.innerHTML = label + (o.sub ? `<small>${o.sub}</small>` : '');
  b.append(cv, lab);
  let on = on0, anim = on0 ? 1 : 0;
  const draw = () => {
    c.clearRect(0, 0, W, H);
    pxPlate(c, 1, 1, W - 4, H - 4, { tone: 'steel', chamfer: 4, screws: false, seed: 9, wear: 0.4 });
    rivet(c, Math.floor(W / 2) - 1, 5, 1, true); rivet(c, Math.floor(W / 2) - 1, H - 9, 1, true);
    // the boss and the bat handle, thrown up (on) or down (off)
    const cx = Math.floor((W - 3) / 2), cy = Math.floor((H - 3) / 2);
    rect(c, cx - 4, cy - 4, 9, 9, GUN[1]); rect(c, cx - 3, cy - 3, 7, 7, GUN[6]); rect(c, cx - 3, cy - 3, 7, 1, GUN[9]);
    const k = anim * 2 - 1, len = 9;
    for (let i = 1; i <= len; i++) {
      const yy = cy - Math.round(k * i), ww = i > len - 3 ? 4 : 2;
      rect(c, cx - Math.floor(ww / 2), yy, ww, 1, i > len - 3 ? GUN[9] : GUN[8]); rect(c, cx - Math.floor(ww / 2) + ww, yy, 1, 1, GUN[3]);
    }
    pxLamp(c, W - 9, 6, on, GRN, 2);
    b.classList.toggle('on', on);
  };
  let raf = 0;
  const flip = () => {
    cancelAnimationFrame(raf);
    const t0 = performance.now(), from = anim, to = on ? 1 : 0;
    const step = (now: number) => { const u = Math.min(1, (now - t0) / 90); anim = from + (to - from) * u; draw(); if (u < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  };
  b.set = (v: boolean) => { if (v === on) return; on = v; flip(); };
  Object.defineProperty(b, 'on', { get: () => on });
  b.addEventListener('click', () => { on = !on; sfx('rocker', 0.7); flip(); onChange(on); });
  draw();
  return b;
}

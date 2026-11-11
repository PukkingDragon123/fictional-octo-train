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
import { glyph5x7 } from './font5x7';

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
  /** Institute hardware on the bezel (needs well >= 14): a stamped serial plate, the crest, a vent grille, a lamp cluster, weld seams, a cable gland */
  serial?: string; crest?: boolean; vents?: boolean; lamps?: ('r' | 'a' | 'g' | 0)[]; welds?: boolean; gland?: boolean;
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
  // Institute hardware on a wide bezel
  if (well >= 14) {
    let tx = x + ch + 8;
    const by = y + Math.floor((well - 13) / 2);
    if (o.crest) { pxCrest(c, tx, by, 13); tx += 19; }
    if (o.serial) tx += pxSerial(c, tx, by - 1, o.serial).w + 8;
    let rx = x + w - ch - 10;
    if (o.vents) { const vw = Math.min(64, Math.floor(w * 0.16)); rx -= vw; pxVent(c, rx, y + 3, vw, well - 6); rx -= 10; }
    if (o.lamps?.length) { rx -= (o.lamps.length - 1) * 9; pxLamps(c, rx, y + Math.floor(well / 2), o.lamps); }
    if (o.welds) { pxWeld(c, x + 3, y + Math.floor(h * 0.35), Math.floor(h * 0.3), false); pxWeld(c, x + w - 6, y + Math.floor(h * 0.35), Math.floor(h * 0.3), false); }
    if (o.gland) pxGland(c, x + w - ch - 14, y + h - Math.ceil(well / 2), 0, Math.ceil(well / 2) - 2);
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
const TACTILE = '.px-key, .px-tactile, [data-px-tactile], .hm-opt, .rs-key, .dz-key, .ptm-make, .ct-scr .t-tab, .ct-scr .t-seg-b, .ct-scr .t-toggle, .hb-slot, .mg-cal, .ft-item';
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

// ================================================================== THE INSTITUTE (round 15c)
// Meridian Institute hardware and paperwork, as primitives. Our own identity: the Institute crest
// (a chamfered octagon, the meridian line struck through seven rungs, one per sin rank) and its
// clearance levels; never anyone else's names, marks or numbering.
//   canvas (art px):  pxText5 · pxSerial · pxHazard · pxVent · pxWeld · pxGland · pxLamps · pxKeySwitch
//                     pxGauge · pxPlacard · pxBarcode · pxCrest · pxRedact
//   elements:         pxStamp · pxRedactEl · pxBanner · pxSerialEl · pxCrestEl · pxAccessLog · pxPlacardEl · pxGaugeEl
//   ids:              nodeId(seed) · caseNo(seed) · CLEARANCE

export const CLEARANCE = 'CLEARANCE: OPERATOR / LEVEL 2';
const hx = (n: number) => '#' + n.toString(16).padStart(6, '0');
let opSeed = 0;
try { opSeed = Number(sessionStorage.getItem('lp.node') || 0) || Math.floor(Math.random() * 900 + 100); sessionStorage.setItem('lp.node', String(opSeed)); } catch { opSeed = 417; }
/** a terminal node id ("MI-04-417") */
export function nodeId(seed = 0) { return `MI-${String(((seed * 7) % 37) + 1).padStart(2, '0')}-${String((opSeed + seed * 131) % 1000).padStart(3, '0')}`; }
/** a case number ("MI/C-0417-15") */
export function caseNo(seed = 0) { return `MI/C-${String((opSeed * 13 + seed * 977) % 10000).padStart(4, '0')}-${15 + (seed % 3)}`; }
const stamp4 = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

/** stamped 5x7 pixel text; returns its width */
export function pxText5(c: C2, x: number, y: number, s: string, col: number, k = 1, emboss?: number): number {
  let cx = Math.round(x);
  for (const ch of s) {
    if (ch === ' ') { cx += 4 * k; continue; }
    const g = glyph5x7(ch);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j * 5 + i]) {
      if (emboss !== undefined) rect(c, cx + i * k, Math.round(y) + j * k + k, k, k, emboss);
      rect(c, cx + i * k, Math.round(y) + j * k, k, k, col);
    }
    cx += 6 * k;
  }
  return cx - Math.round(x) - k;
}
/** a riveted serial plate with stamped text (brass by default); returns its size */
export function pxSerial(c: C2, x: number, y: number, text: string, o: { tone?: 'brass' | 'steel'; k?: number } = {}) {
  const k = o.k ?? 1, w = text.length * 6 * k + 12 + 2 * k, h = 7 * k + 8;
  const R = o.tone === 'steel' ? GUN : [0x120c04, 0x241808, 0x38260c, 0x4e3612, 0x664818, 0x80601e, 0x9c7a2c, 0xb89640, 0xd4b45e, 0xead08a, 0xfaecc0];
  bevel(c, x, y, w, h, R.slice(4, 11), { chamfer: 2 });
  rivet(c, x + 3, y + Math.floor(h / 2), 1); rivet(c, x + w - 4, y + Math.floor(h / 2), 1);
  pxText5(c, x + 7, y + 4, text, R[2], k, R[9]);
  return { w, h };
}
/** worn hazard striping */
export function pxHazard(c: C2, x: number, y: number, w: number, h: number, seed = 3) {
  hazard(c, x, y, w, h, 0xe8b52a, 0x17150f, Math.max(6, h + 2));
  for (let i = 0; i < Math.floor(w / 9); i++) { const px = x + Math.floor(hsh(i, 1, seed) * w), py = y + Math.floor(hsh(i, 2, seed) * h); rect(c, px, py, 1 + Math.floor(hsh(i, 3, seed) * 3), 1, 0x6e6a60, 0.7); }
  rect(c, x, y + h - 1, w, 1, 0x000000, 0.35);
}
/** a vent grille: slots with lit lower lips */
export function pxVent(c: C2, x: number, y: number, w: number, h: number) {
  rect(c, x - 1, y - 1, w + 2, h + 2, 0x050404);
  for (let j = 0; j < h; j += 3) { rect(c, x, y + j, w, 2, 0x0a0b0d); rect(c, x, y + j + 2, w, 1, GUN[6]); }
}
/** a weld seam: a bead of ripples */
export function pxWeld(c: C2, x: number, y: number, len: number, horiz = true) {
  for (let i = 0; i < len; i += 2) { const px = horiz ? x + i : x, py = horiz ? y : y + i; rect(c, px, py, horiz ? 2 : 3, horiz ? 3 : 2, GUN[4]); rect(c, px, py, 1, 1, GUN[8]); rect(c, px + (horiz ? 1 : 2), py + (horiz ? 2 : 1), 1, 1, GUN[2]); }
}
/** a cable gland: a hex nut with a cable leaving it (dir: -1 left, 1 right, 0 down) */
export function pxGland(c: C2, x: number, y: number, dir: -1 | 0 | 1 = 0, len = 10) {
  if (dir === 0) rect(c, x - 1, y + 3, 3, len, 0x141210); else rect(c, dir > 0 ? x + 3 : x - len - 2, y - 1, len, 3, 0x141210);
  rect(c, x - 3, y - 2, 7, 5, GUN[1]); rect(c, x - 2, y - 3, 5, 7, GUN[1]); rect(c, x - 2, y - 2, 5, 5, GUN[6]); rect(c, x - 2, y - 2, 5, 1, GUN[9]); rect(c, x - 1, y - 1, 3, 3, GUN[3]);
}
/** a cluster of indicator lamps: 'r' | 'a' | 'g' lit, 0 dark */
export function pxLamps(c: C2, x: number, y: number, states: ('r' | 'a' | 'g' | 0)[], gap = 9) {
  states.forEach((s, i) => pxLamp(c, x + i * gap, y, !!s, s === 'r' ? RED : s === 'g' ? GRN : AMB, 3));
}
/** a key switch: a chromed barrel with the key turned on or off */
export function pxKeySwitch(c: C2, x: number, y: number, on: boolean) {
  rect(c, x - 5, y - 5, 11, 11, GUN[1]); rect(c, x - 4, y - 4, 9, 9, GUN[7]); rect(c, x - 3, y - 3, 7, 7, GUN[4]); rect(c, x - 4, y - 4, 9, 1, GUN[10]);
  if (on) { rect(c, x - 3, y - 1, 7, 2, GUN[9]); rect(c, x + 3, y - 2, 3, 4, 0xb89640); } else { rect(c, x - 1, y - 3, 2, 7, GUN[9]); rect(c, x - 2, y - 6, 4, 3, 0xb89640); }
  pxText5(c, x - 12, y + 7, 'OFF', GUN[7]); pxText5(c, x + 4, y + 7, 'ON', on ? 0x96ffb0 : GUN[7]);
}
/** an analog gauge in a chamfered square bezel: v 0..1, red zone past `red` */
export function pxGauge(c: C2, x: number, y: number, s: number, v: number, o: { red?: number; label?: string } = {}) {
  bevel(c, x, y, s, s, GUN.slice(2, 9), { chamfer: 3 });
  const fx = x + 3, fy = y + 3, fs = s - 6;
  rect(c, fx, fy, fs, fs, 0xe6dcc0); rect(c, fx, fy, fs, 1, 0x8a8068); rect(c, fx, fy, 1, fs, 0x8a8068);
  const cx = fx + fs / 2, cy = fy + fs * 0.72, r = fs * 0.55, red = o.red ?? 0.8;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, a = Math.PI * (1.15 + t * 0.7), big = i % 5 === 0, col = t >= red ? 0xc8301e : 0x2a2418;
    const r0 = r - (big ? 4 : 2);
    for (let q = r0; q <= r; q += 0.5) rect(c, Math.round(cx + Math.cos(a) * q), Math.round(cy + Math.sin(a) * q), 1, 1, col);
  }
  const a = Math.PI * (1.15 + Math.max(0, Math.min(1, v)) * 0.7);
  for (let q = 0; q <= r - 2; q += 0.5) rect(c, Math.round(cx + Math.cos(a) * q), Math.round(cy + Math.sin(a) * q), 1, 1, 0x8e1a10);
  rect(c, Math.round(cx) - 1, Math.round(cy) - 1, 3, 3, 0x1c1f23);
  if (o.label) pxText5(c, fx + Math.round((fs - o.label.length * 6) / 2) + 1, fy + fs - 9, o.label, 0x2a2418);
  rect(c, fx + 2, fy + 1, Math.floor(fs / 3), 1, 0xffffff, 0.35);
}
/** an enamel warning placard: kind 'warn' (yellow), 'danger' (red), 'info' (cream); text in stamped caps */
export function pxPlacard(c: C2, x: number, y: number, w: number, h: number, kind: 'warn' | 'danger' | 'info', text = '') {
  const bg = kind === 'warn' ? 0xe8b52a : kind === 'danger' ? 0xb8281c : 0xe6dcc0, ink = kind === 'danger' ? 0xfff0e0 : 0x17150f;
  bevel(c, x, y, w, h, kind === 'danger' ? [0x2a0604, 0x5a0c08, 0x8e1a10, 0xb8281c, 0xd84a34, 0xf07a5a, 0xffc0a8] : kind === 'warn' ? [0x3a2a04, 0x7a5a08, 0xb8861c, 0xe8b52a, 0xf2c84a, 0xffe08a, 0xfff4c8] : [0x2a2418, 0x6a6048, 0xb8ac90, 0xe6dcc0, 0xf0e8d0, 0xfaf4e4, 0xffffff], { chamfer: 2 });
  rect(c, x + 2, y + 2, w - 4, 1, ink, 0.8); rect(c, x + 2, y + h - 3, w - 4, 1, ink, 0.8);
  // the triangle pictogram
  const tx = x + 5, ty = y + Math.floor((h - 9) / 2);
  for (let j = 0; j < 9; j++) rect(c, tx + 4 - Math.floor(j / 2), ty + j, Math.floor(j / 2) * 2 + 1, 1, ink);
  rect(c, tx + 4, ty + 3, 1, 3, bg); rect(c, tx + 4, ty + 7, 1, 1, bg);
  if (text) pxText5(c, x + 17, y + Math.floor((h - 7) / 2), text, ink);
  for (let i = 0; i < Math.floor(w / 14); i++) rect(c, x + 2 + Math.floor(hsh(i, 9, w) * (w - 4)), y + 2 + Math.floor(hsh(i, 8, h) * (h - 4)), 2, 1, 0x000000, 0.18);
}
/** a barcode (seeded) */
export function pxBarcode(c: C2, x: number, y: number, w: number, h: number, seed = 1) {
  let cx = x;
  rect(c, x - 2, y - 2, w + 4, h + 4, 0xe6dcc0);
  while (cx < x + w - 2) { const bw = 1 + Math.floor(hsh(cx, 1, seed) * 3); rect(c, cx, y, bw, h, 0x17150f); cx += bw + 1 + Math.floor(hsh(cx, 2, seed) * 2); }
}
/** the Institute crest: a chamfered octagon of dark enamel, a brass rim, the meridian line through seven rungs (the sin ranks) */
export function pxCrest(c: C2, x: number, y: number, s: number) {
  const k = Math.max(2, Math.round(s * 0.28));
  const inside = (i: number, j: number, m: number) => i >= m && j >= m && i < s - m && j < s - m && i + j >= k + m && (s - 1 - i) + j >= k + m && i + (s - 1 - j) >= k + m && (s - 1 - i) + (s - 1 - j) >= k + m;
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    if (!inside(i, j, 0)) continue;
    const rim = !inside(i, j, 2), edge = !inside(i, j, 1);
    rect(c, x + i, y + j, 1, 1, edge ? 0x241808 : rim ? (i + j < s ? 0xd4b45e : 0x80601e) : (j < s / 2 ? 0x1e2a2a : 0x141e1e));
  }
  const mx = x + Math.floor(s / 2);
  rect(c, mx, y + 3, 1, s - 6, 0xead08a);
  for (let r = 0; r < 7; r++) { const ry = y + 4 + Math.round(r * (s - 9) / 6), half = Math.max(1, Math.round((s / 2 - 4) * (1 - Math.abs(r - 3) / 4.5))); rect(c, mx - half, ry, half * 2 + 1, 1, r === 3 ? 0xead08a : 0x9c7a2c); }
}
/** a black redaction bar */
export function pxRedact(c: C2, x: number, y: number, w: number, h: number) {
  rect(c, x, y, w, h, 0x0a0908);
  for (let i = 0; i < w; i += 3) rect(c, x + i, y + (i % 2), 2, 1, 0x1c1a17, 0.6);
}

// ---- elements
const canvasEl = (w: number, h: number, draw: (c: C2) => void, cls: string) => { const { cv, c } = crispCanvas(w, h); cv.className = cls; draw(c); return cv; };
/** a rubber stamp ("CLASSIFIED", "EYES ONLY", "FILED"): red (default), black or green, tilted, worn */
export function pxStamp(text: string, o: { tone?: 'red' | 'black' | 'green'; tilt?: number } = {}) {
  const s = document.createElement('span');
  s.className = 'px-stamp' + (o.tone && o.tone !== 'red' ? ' ' + o.tone : '');
  s.style.setProperty('--tilt', (o.tilt ?? -7) + 'deg');
  s.textContent = text;
  return s;
}
/** a redacted run of text (n characters wide) */
export function pxRedactEl(n = 8) { const s = document.createElement('span'); s.className = 'px-redact'; s.style.width = n * 0.62 + 'em'; s.setAttribute('aria-label', 'redacted'); return s; }
/** a classification banner: the crest, the Institute, the class, the clearance */
export function pxBanner(right = CLEARANCE, cls = 'CLASSIFIED') {
  const d = document.createElement('div'); d.className = 'px-banner';
  d.append(pxCrestEl(14));
  const l = document.createElement('span'); l.textContent = `MERIDIAN INSTITUTE · ${cls}`;
  const r = document.createElement('span'); r.textContent = right;
  d.append(l, r);
  return d;
}
export function pxSerialEl(text: string, o: { tone?: 'brass' | 'steel' } = {}) { const w = text.length * 6 + 14, h = 15; return canvasEl(w, h, (c) => pxSerial(c, 0, 0, text, o), 'px-serial'); }
export function pxCrestEl(s = 16) { return canvasEl(s, s, (c) => pxCrest(c, 0, 0, s), 'px-crest'); }
export function pxPlacardEl(text: string, kind: 'warn' | 'danger' | 'info' = 'warn') { const w = text.length * 6 + 24, h = 15; return canvasEl(w, h, (c) => pxPlacard(c, 0, 0, w, h, kind, text), 'px-placard'); }
/** an analog gauge element; returns it with set(v) */
export function pxGaugeEl(s = 40, v = 0.3, label = '') {
  const { cv, c } = crispCanvas(s, s); cv.className = 'px-gauge';
  const g = cv as HTMLCanvasElement & { set(v: number): void };
  g.set = (q: number) => { c.clearRect(0, 0, s, s); pxGauge(c, 0, 0, s, q, { label }); };
  g.set(v);
  return g;
}
/** an access-log footer: node, timestamp, operator, a barcode */
export function pxAccessLog(node = nodeId(1), who = 'OPERATOR ' + String(opSeed).padStart(4, '0')) {
  const d = document.createElement('div'); d.className = 'px-log';
  const t = document.createElement('span'); t.textContent = `ACCESS LOGGED · NODE ${node} · ${stamp4()} · ${who}`;
  d.append(canvasEl(56, 9, (c) => pxBarcode(c, 2, 2, 52, 5, opSeed), 'px-barcode'), t);
  return d;
}

// THE MACHINE KIT (round 16): the menus as one machine, built like the body HUD.
// DOM stays DOM (text, focus, scrolling, clicks); the hardware around it is 3D,
// drawn by the one shared renderer in core.ts into canvases:
//
//   mxFrame(el, spec)        a riveted, bevelled enamel housing hung on any element (behind it, or
//                            over it with the content showing through a window); rebuilt on resize
//   mxSkinKey(el, o)         turn any button into a 3D push key: a cap in a steel bezel that sinks
//                            when pressed, a glass lamp that lights on hover / focus / selected
//   mxButton(label, fn, o)   a push key with an Alagard legend (the pause column, replies, trade)
//   mxToggle(label, on, fn)  a bat-handle toggle that flips (and clunks), a lamp that lights
//   mxKnob(v)                a bakelite pointer knob over a printed scale; turns with its value
//   mxGauge(s, v, label)     an analog gauge whose needle swings (a live part)
//   mxSocketSheet(n, held)   the hotbar's socket (cached frames)
//   mxArrive(el, from)       a panel arrives on its mechanism (slide, overshoot, clunk)
//
// Palette: olive enamel housings, safety-yellow plates and hazard trim, green and amber lamps,
// dark CRT glass. Sounds: recorded CC0 samples (src/ui/menus/sfx.ts).
import * as THREE from 'three';
import { shoot, sheet, disposeTree, animate, mxOk, SHEAR } from './core';
import { housing, keyPart, keyLayout, KEY_Z, togglePart, TOG_W, TOG_H, knobPart, knobScale, gaugePart, gaugeDial, needleAngle, socketPart, SOCK, setLamp, type HousingSpec, type KeyState, type LampCol } from './parts';
import { canvasTex, type Tone } from './paint';
import { sfx, type Sfx } from '../menus/sfx';
import './machine.css';

const DPR = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
const reduce = () => document.documentElement.classList.contains('reduce-flash') || document.body?.classList.contains('reduce-flash');

// ---------------------------------------------------------------- housings
export interface FrameOpts {
  /** draw over the element (the content shows through `win`) instead of behind it */
  over?: boolean;
  /** room round the element for the drop shadow, cables and handles (CSS px) */
  pad?: number;
  /** the canvas extends past the element by this much on each side (the housing is bigger than the element) */
  grow?: { l?: number; t?: number; r?: number; b?: number };
}
export interface MxFrame { cv: HTMLCanvasElement; repaint(): void; dispose(): void; lamp(i: number, on: boolean): void; readonly size: { w: number; h: number } }

/**
 * hang a 3D housing on `el`. `spec(w, h)` returns the housing for the element's current size
 * (w, h include `grow`); coordinates are relative to the grown rect's top-left.
 */
export function mxFrame(el: HTMLElement, spec: (w: number, h: number) => HousingSpec, o: FrameOpts = {}): MxFrame {
  const cv = document.createElement('canvas');
  cv.className = 'mxf-cv' + (o.over ? ' over' : '');
  const pad = o.pad ?? 12;
  const g = { l: o.grow?.l ?? 0, t: o.grow?.t ?? 0, r: o.grow?.r ?? 0, b: o.grow?.b ?? 0 };
  el.classList.add('mxf');
  el.prepend(cv);
  let lastW = 0, lastH = 0, lampOn: boolean[] = [];
  let built: { w: number; h: number; s: HousingSpec } | null = null;
  const size = { w: 0, h: 0 };
  const draw = () => {
    if (!built) return;
    const { w, h, s } = built;
    const lamps = (s.lamps ?? []).map((l, i) => ({ ...l, on: lampOn[i] ?? l.on }));
    const H = housing({ ...s, lamps });
    const W2 = w + pad * 2, H2 = h + pad * 2;
    if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; }
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, W2, H2);
    shoot(H.root, w, h, pad, c, 0, 0, { shadow: [3, 4], shadowA: 0.5 });
    disposeTree(H.root);
  };
  const repaint = (force = false) => {
    const w = Math.round(el.offsetWidth) + g.l + g.r, h = Math.round(el.offsetHeight) + g.t + g.b;
    if (w < 12 || h < 12 || !el.isConnected) return;
    if (!force && w === lastW && h === lastH) return;
    lastW = w; lastH = h; size.w = w; size.h = h;
    cv.style.left = -(pad + g.l) + 'px'; cv.style.top = -(pad + g.t) + 'px';
    cv.style.width = w + pad * 2 + 'px'; cv.style.height = h + pad * 2 + 'px';
    const s = spec(w, h);
    lampOn = (s.lamps ?? []).map((l, i) => lampOn[i] ?? !!l.on);
    built = { w, h, s };
    draw();
  };
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => repaint()); };
  let ro: ResizeObserver | null = null;
  try { ro = new ResizeObserver(later); ro.observe(el); } catch { /* old browser */ }
  requestAnimationFrame(() => repaint());
  return {
    cv, size,
    repaint: () => repaint(true),
    dispose: () => { ro?.disconnect(); cv.remove(); el.classList.remove('mxf'); },
    lamp: (i, on) => { if (lampOn[i] === on) return; lampOn[i] = on; draw(); },
  };
}

/** a stock housing for a panel: olive enamel, a yellow nameplate, corner guards, rivets, a hazard foot, glands */
export function panelSpec(w: number, h: number, o: {
  title?: string; sub?: string; tone?: Tone; seed?: number; win?: { l: number; t: number; r: number; b: number; cut?: number; lip?: number; lipTone?: Tone };
  lamps?: LampCol[]; hazard?: boolean; glands?: number; vents?: boolean; handles?: boolean; serial?: string; plateW?: number; guards?: boolean; plateAt?: 'top' | 'bottom'; knobs?: number; toggles?: number;
  /** without a window: the hood's and the foot's depth (the element's padding) */
  top?: number; bot?: number;
} = {}): HousingSpec {
  const seed = o.seed ?? 11;
  const s: HousingSpec = { w, h, seed, tone: o.tone ?? 'olive', depth: 9, guards: o.guards ?? (w > 160 && h > 120), plates: [], lamps: [], vents: [], glands: [], hazards: [], stencils: [], knobs: [], toggles: [], stickers: [], placards: [], pipes: [], valves: [] };
  const cut = Math.max(5, Math.min(14, Math.round(Math.min(w, h) * 0.07)));
  s.cut = cut;
  if (o.win) {
    const wn = o.win;
    s.win = { x: wn.l, y: wn.t, w: w - wn.l - wn.r, h: h - wn.t - wn.b, cut: wn.cut ?? 7, lip: wn.lip ?? 4, lipTone: wn.lipTone ?? 'dark' };
  }
  const topBand = o.win ? o.win.t : (o.top ?? 24);
  // nameplate on the hood (yellow enamel, Alagard)
  if (o.title && topBand >= 16) {
    const ph = Math.min(22, topBand - 6), pw = Math.min(o.plateW ?? Math.max(70, o.title.length * (ph >= 20 ? 10 : 8) + 26), w * 0.5);
    const py = o.plateAt === 'bottom' && o.win ? h - o.win.b + Math.round((o.win.b - ph) / 2) : Math.round((topBand - ph) / 2) + 1;
    s.plates!.push({ x: cut + 18, y: py, w: pw, h: ph, text: o.title, ground: 'yellow' });
    if (o.serial && w > pw + 200) s.plates!.push({ x: cut + 26 + pw, y: py + 2, w: o.serial.length * 7 + 14, h: ph - 4, text: o.serial, ground: 'brass', px: 10 });
  }
  // a lamp cluster top right
  const lamps = o.lamps ?? ['green', 'amber'];
  if (topBand >= 14 && w > 120) lamps.forEach((c, i) => s.lamps!.push({ x: w - cut - 14 - i * 13, y: topBand / 2 + 0.5, r: Math.min(3.6, topBand * 0.17), col: c, on: i === 0 }));
  // vents on the hood
  if (o.vents !== false && topBand >= 18 && w > 320) s.vents!.push({ x: Math.round(w * 0.58), y: Math.round(topBand * 0.28), w: Math.round(Math.min(90, w * 0.16)), h: Math.max(6, Math.round(topBand * 0.5)) });
  // the hazard foot
  const botBand = o.win ? o.win.b : (o.bot ?? 18);
  if (o.hazard !== false && botBand >= 12 && w > 140) s.hazards!.push({ x: cut + 14, y: h - Math.min(10, botBand - 4) - 3, w: Math.min(140, Math.round(w * 0.28)), h: Math.min(10, botBand - 4) });
  // knobs and toggles on the foot (decor)
  if (botBand >= 22) {
    for (let i = 0; i < (o.knobs ?? 0); i++) s.knobs!.push({ x: w - cut - 20 - i * 22, y: h - botBand / 2, r: Math.min(6, botBand * 0.24), a: (i * 1.7 + seed) % 3 - 1.5 });
    for (let i = 0; i < (o.toggles ?? 0); i++) s.toggles!.push({ x: Math.round(w * 0.5) + i * 14, y: h - botBand / 2 - 1, on: (i + seed) % 3 !== 0 });
  }
  // glands with cables dropping off the bottom edge
  const ng = o.glands ?? (w > 260 ? 2 : w > 120 ? 1 : 0);
  const cab = [0x1a1a18, 0xc8a020, 0x2a3a1c, 0x7a1810];
  for (let i = 0; i < ng; i++) s.glands!.push({ x: Math.round(w * (0.62 + i * 0.12)) + (seed % 7), y: h - Math.max(5, Math.min(8, botBand / 2)), col: cab[(i + seed) % cab.length], drop: 26 });
  if (o.handles && h > 140) { s.handles = [{ x: 5, y0: h * 0.32, y1: h * 0.68 }, { x: w - 5, y0: h * 0.32, y1: h * 0.68 }]; }
  if (o.win && topBand >= 18) s.seamsY = [topBand - 2];
  // the little things on a big one: an inventory sticker on the hood, a warning placard on the foot, a pipe and its valve
  if (w > 420 && topBand >= 28) {
    const px0 = (s.plates![0] ? s.plates![0].x + s.plates![0].w : cut + 18) + (s.plates![1] ? s.plates![1].w + 20 : 12);
    if (px0 + 40 < w * 0.55) s.stickers!.push({ x: px0, y: Math.round(topBand / 2 - 6), w: 34, h: 13, text: 'INV ' + String(1000 + (seed * 37) % 9000) });
  }
  if (w > 360 && botBand >= 22) s.placards!.push({ x: Math.round(w * 0.3), y: Math.round(h - botBand / 2 - 6), w: 64, h: 13, text: seed % 2 ? 'LIVE' : 'HI-VOLT' });
  if (w > 560 && topBand >= 30 && s.vents!.length) { const v = s.vents![0]; s.pipes!.push([v.x + v.w + 14, topBand * 0.5, v.x + v.w + 64, topBand * 0.5]); s.valves!.push({ x: v.x + v.w + 39, y: topBand * 0.5, r: Math.min(6, topBand * 0.17) }); }
  if (o.sub && o.win && botBand >= 14) s.stencils!.push({ text: o.sub, x: w - cut - 18, y: h - Math.round(botBand / 2) + 5, px: 12, align: 'right', color: 0xe8c440, alpha: 0.8 });
  return s;
}

// ---------------------------------------------------------------- keys
export interface KeySkin { tone?: Tone; bezel?: Tone; lamp?: LampCol | false; seed?: number; screws?: boolean; hazard?: boolean; sound?: Sfx | ''; hover?: Sfx | ''; /** shown dimmed (a key that can't be used now but still says why) */ dim?: boolean }
interface KeyState$ { el: HTMLElement; cv: HTMLCanvasElement; o: KeySkin; w: number; h: number; st: KeyState; down: boolean; on: boolean }
const PADK = 5;
function keyKey(w: number, h: number, o: KeySkin) { return `key|${w}|${h}|${o.tone ?? 'olive'}|${o.bezel ?? 'dark'}|${o.lamp ?? ''}|${o.seed ?? 3}|${o.screws !== false}|${!!o.hazard}`; }
function keySheet(w: number, h: number, o: KeySkin) {
  return sheet(keyKey(w, h, o), w, h, PADK, 5, (f) => keyPart({ w, h, tone: o.tone, bezel: o.bezel, lamp: o.lamp, seed: o.seed, screws: o.screws, hazard: o.hazard }, f as KeyState), { shadow: [2, 3], shadowA: 0.45 });
}
function keyPaint(k: KeyState$) {
  const el = k.el;
  const dis = (el as HTMLButtonElement).disabled || !!k.o.dim;
  const hot = el.matches(':hover') || el.matches(':focus-visible') || document.activeElement === el;
  const st: KeyState = dis ? 4 : k.down ? 2 : k.on ? 3 : hot ? 1 : 0;
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (w < 10 || h < 10) return;
  const sized = w !== k.w || h !== k.h;
  if (!sized && st === k.st) return;
  k.w = w; k.h = h; k.st = st;
  const sh = keySheet(w, h, k.o);
  if (!sh) return;
  const fw = w + PADK * 2, fh = h + PADK * 2;
  if (k.cv.width !== fw || k.cv.height !== fh) { k.cv.width = fw; k.cv.height = fh; k.cv.style.width = fw + 'px'; k.cv.style.height = fh + 'px'; }
  const c = k.cv.getContext('2d')!;
  c.clearRect(0, 0, fw, fh);
  c.drawImage(sh, 0, st * fh, fw, fh, 0, 0, fw, fh);
  // the legend rides on the cap: where the cap's face is in this state
  const z = KEY_Z[st];
  const L = keyLayout({ w, h, lamp: k.o.lamp, screws: k.o.screws });
  el.style.setProperty('--mx-dx', (SHEAR[0] * z).toFixed(1) + 'px');
  el.style.setProperty('--mx-dy', (SHEAR[1] * z).toFixed(1) + 'px');
  el.style.setProperty('--mx-cx', L.cap.x + 'px');
  el.style.setProperty('--mx-cw', L.cap.w + 'px');
  el.classList.toggle('mx-hot', st === 1 || st === 3);
  el.classList.toggle('mx-down', st === 2);
}

/** skin an existing button-like element as a 3D push key; returns setOn / repaint */
export function mxSkinKey(el: HTMLElement, o: KeySkin = {}): { setOn(v: boolean): void; repaint(): void } | null {
  if (!mxOk()) return null;
  const cv = document.createElement('canvas');
  cv.className = 'mxk-cv';
  el.classList.add('mxk');
  el.prepend(cv);
  const k: KeyState$ = { el, cv, o, w: 0, h: 0, st: 0, down: false, on: false };
  (el as any)._mxk = k;
  const paint = () => keyPaint(k);
  el.addEventListener('pointerdown', (e) => { if ((e as PointerEvent).button > 0 || (el as HTMLButtonElement).disabled || o.dim) return; k.down = true; paint(); if (o.sound !== '') sfx(o.sound ?? 'plate', 0.55); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => { if (k.down) { k.down = false; paint(); } else paint(); });
  for (const ev of ['pointerenter', 'focus', 'blur']) el.addEventListener(ev, () => requestAnimationFrame(paint));
  el.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType === 'mouse' && o.hover && !(el as HTMLButtonElement).disabled) sfx(o.hover, 0.35); });
  // keyboard: Enter / Space press the key too
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !k.down) { k.down = true; paint(); setTimeout(() => { k.down = false; paint(); }, 120); } });
  try { new ResizeObserver(() => requestAnimationFrame(paint)).observe(el); } catch { /* ignore */ }
  try { new MutationObserver(() => paint()).observe(el, { attributes: true, attributeFilter: ['disabled', 'class'] }); } catch { /* ignore */ }
  requestAnimationFrame(paint);
  return {
    setOn: (v: boolean) => { k.on = v; paint(); },
    repaint: () => { k.w = 0; paint(); },
  };
}

export interface MxButton extends HTMLButtonElement { setOn(on: boolean): void }
/** a push key with an Alagard legend */
export function mxButton(label: string, fn: () => void, o: KeySkin & { w?: number; h?: number; cls?: string; sub?: string } = {}): MxButton {
  const b = document.createElement('button') as MxButton;
  b.type = 'button';
  b.className = 'mxb' + (o.cls ? ' ' + o.cls : '') + (o.tone === 'yellow' ? ' ink-d' : '');
  if (o.w) b.style.width = o.w + 'px';
  if (o.h) b.style.height = o.h + 'px';
  const t = document.createElement('span'); t.className = 'mxb-t'; t.textContent = label;
  b.append(t);
  if (o.sub) { const s = document.createElement('small'); s.className = 'mxb-s'; s.textContent = o.sub; b.append(s); }
  const sk = mxSkinKey(b, { lamp: 'amber', ...o });
  b.setOn = (v: boolean) => { b.classList.toggle('on', v); sk?.setOn(v); };
  b.addEventListener('click', () => fn());
  return b;
}

// ---------------------------------------------------------------- toggles
const TOG_F = 7;
const PADT = 4;
function togSheet(lit: boolean) {
  return sheet(`tog|${lit}`, TOG_W, TOG_H, PADT, TOG_F, (f) => togglePart(-1 + (f / (TOG_F - 1)) * 2, lit), { shadow: [2, 2] });
}
/** paint the toggle canvas at flip t (-1 off .. 1 on) */
function togDraw(cv: HTMLCanvasElement, t: number, lit: boolean) {
  const sh = togSheet(lit); if (!sh) return;
  const fw = TOG_W + PADT * 2, fh = TOG_H + PADT * 2;
  const f = Math.max(0, Math.min(TOG_F - 1, Math.round(((t + 1) / 2) * (TOG_F - 1))));
  if (cv.width !== fw) { cv.width = fw; cv.height = fh; }
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, fw, fh);
  c.drawImage(sh, 0, f * fh, fw, fh, 0, 0, fw, fh);
}
/** a canvas showing a bat toggle; flip(on) animates it */
export function mxToggleCanvas(on: boolean): { cv: HTMLCanvasElement; flip(on: boolean): void } | null {
  if (!mxOk()) return null;
  const cv = document.createElement('canvas'); cv.className = 'mxt-cv';
  let t = on ? 1 : -1, target = t, lit = on;
  togDraw(cv, t, lit);
  return {
    cv,
    flip: (v: boolean) => {
      target = v ? 1 : -1; lit = v;
      if (reduce()) { t = target; togDraw(cv, t, lit); return; }
      animate({ step: (dt) => { const sp = dt * 16; t = t < target ? Math.min(target, t + sp) : Math.max(target, t - sp); togDraw(cv, t, lit); return t !== target; } });
    },
  };
}
export interface MxToggle extends HTMLButtonElement { set(on: boolean): void; readonly on: boolean }
export function mxToggle(label: string, on0: boolean, onChange: (on: boolean) => void, o: { sub?: string } = {}): MxToggle {
  const b = document.createElement('button') as MxToggle;
  b.type = 'button'; b.className = 'mxt';
  b.setAttribute('role', 'switch');
  const tg = mxToggleCanvas(on0);
  const lab = document.createElement('span'); lab.className = 'mxt-l'; lab.textContent = label;
  if (o.sub) { const s = document.createElement('small'); s.textContent = o.sub; lab.append(s); }
  if (tg) b.append(tg.cv);
  b.append(lab);
  let on = on0;
  const sync = () => { b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); };
  sync();
  b.set = (v: boolean) => { if (v === on) return; on = v; sync(); tg?.flip(on); };
  Object.defineProperty(b, 'on', { get: () => on });
  b.addEventListener('click', () => { on = !on; sync(); sfx('rocker', 0.7); tg?.flip(on); onChange(on); });
  return b;
}

// ---------------------------------------------------------------- knobs
const KNOB_F = 25;
export function mxKnob(size = 40): { cv: HTMLCanvasElement; set(v: number, quiet?: boolean): void } | null {
  if (!mxOk()) return null;
  const cv = document.createElement('canvas'); cv.className = 'mxn-cv';
  const pad = 4, fw = size + pad * 2;
  cv.width = fw; cv.height = fw; cv.style.width = fw + 'px'; cv.style.height = fw + 'px';
  let scaleTex: THREE.Texture | null = null;
  const sh = () => sheet(`knob|${size}`, size, size, pad, KNOB_F, (f) => { scaleTex ??= canvasTex(knobScale(size)); return knobPart(size, f / (KNOB_F - 1), 4, scaleTex); }, { shadow: [2, 2] });
  let cur = -1;
  return {
    cv,
    set: (v: number, quiet = true) => {
      const f = Math.max(0, Math.min(KNOB_F - 1, Math.round(v * (KNOB_F - 1))));
      if (f === cur) return;
      if (!quiet && cur >= 0) sfx('tick', 0.35);
      cur = f;
      const s = sh(); if (!s) return;
      const c = cv.getContext('2d')!;
      c.clearRect(0, 0, fw, fw);
      c.drawImage(s, 0, f * fw, fw, fw, 0, 0, fw, fw);
    },
  };
}

// ---------------------------------------------------------------- gauges (live)
export interface MxGauge extends HTMLCanvasElement { set(v: number): void }
export function mxGauge(s = 44, v0 = 0.3, label = '', tone: Tone = 'olive'): MxGauge | null {
  if (!mxOk()) return null;
  const cv = document.createElement('canvas') as MxGauge; cv.className = 'mxg-cv';
  const pad = 4, fw = s + pad * 2;
  cv.width = fw; cv.height = fw; cv.style.width = fw + 'px'; cv.style.height = fw + 'px';
  const dial = canvasTex(gaugeDial(s, label));
  const rig = gaugePart(s, dial, tone);
  let v = v0, target = v0, vel = 0, moving = false;
  const draw = () => {
    rig.needle.rotation.z = needleAngle(v);
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, fw, fw);
    shoot(rig.root, s, s, pad, c, 0, 0, { shadow: [2, 2] });
  };
  draw();
  cv.set = (q: number) => {
    target = Math.max(0, Math.min(1, q));
    if (moving || Math.abs(target - v) < 0.002) return;
    moving = true;
    animate({ step: (dt) => {
      // a damped needle: it swings past and settles
      vel += ((target - v) * 90 - vel * 11) * dt; v += vel * dt;
      draw();
      if (Math.abs(target - v) < 0.002 && Math.abs(vel) < 0.01) { v = target; draw(); moving = false; return false; }
      if (!cv.isConnected) { moving = false; return false; }
      return true;
    } });
  };
  return cv;
}

// ---------------------------------------------------------------- the hotbar socket
export const SOCK_PAD = 5;
export function mxSocketSheet(n: number): HTMLCanvasElement | null {
  return sheet(`sock|${n}`, SOCK, SOCK, SOCK_PAD, 2, (f) => socketPart(n, f === 1), { shadow: [2, 3] });
}

// ---------------------------------------------------------------- mechanisms
/** a panel arrives on its mechanism: a slide from one side, a hard stop with a little bounce, a clunk */
export function mxArrive(el: HTMLElement, from: 'left' | 'right' | 'top' | 'bottom' = 'bottom', o: { delay?: number; sound?: Sfx | '' } = {}) {
  if (reduce()) return;
  el.classList.remove('mx-arrive'); void el.offsetWidth;
  el.style.setProperty('--mx-from', from === 'left' ? 'translateX(-46px)' : from === 'right' ? 'translateX(46px)' : from === 'top' ? 'translateY(-40px)' : 'translateY(40px)');
  el.style.animationDelay = (o.delay ?? 0) + 'ms';
  el.classList.add('mx-arrive');
  const snd = o.sound ?? 'clamp';
  if (snd) setTimeout(() => sfx(snd, 0.45), (o.delay ?? 0) + 230);
}
/** a hinged flap swings down into place (dialogs) */
export function mxSwing(el: HTMLElement, o: { delay?: number } = {}) {
  if (reduce()) return;
  el.classList.remove('mx-swing'); void el.offsetWidth;
  el.style.animationDelay = (o.delay ?? 0) + 'ms';
  el.classList.add('mx-swing');
  setTimeout(() => sfx('clamp', 0.4), (o.delay ?? 0) + 260);
}

export { setLamp, DPR };

/** skin every reply / choice button in a host as 3D keys (re-run after the host's buttons are replaced) */
export function mxSkinAll(host: HTMLElement, sel: string, o: (b: HTMLElement) => KeySkin) {
  if (!mxOk()) return;
  for (const b of host.querySelectorAll(sel)) if (!(b as any)._mxk) mxSkinKey(b as HTMLElement, o(b as HTMLElement));
}

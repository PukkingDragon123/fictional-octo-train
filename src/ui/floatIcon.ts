// FLOATING ICONS (round 22): the menus' buttons are free-floating objects with their short name floating under them.
// No key, tile, plate or frame. Each icon is a small 3D model (machine/decor.ts and menus/labIcons.ts) rendered
// through the pixel pipeline at its own size (crisp pixels, no smoothing), then inked: a bold outline, a warm rim
// catching the lab light on its upper-left edges, its lower-right edges dropped into shade. It hangs over a soft shadow, bobs slowly and rocks on its
// own turntable; under the pointer (or the keyboard) it lifts, grows a little, brightens and glows, turns right round
// and ticks (a recorded relay click); pressed, it dips. The name is Alagard with a stepped dark extrusion, the same
// letters as the world's floating text (holo/cineText.css .ct-g).
//
//   pixSprite(kind, size)            -> { cv, hot(on) }        the animated sprite alone (chips, tabs, terminals)
//   floatIcon(kind, name, fn, o)     -> button.fi              icon + floating name (+ a key hint)
import { iconSheet, type IconKind } from './machine/decor';
import { mxOk } from './machine/core';
import { sfx, type Sfx } from './menus/sfx';
import './menus/labIcons';
import './floatIcon.css';

const F = 32;
const TAU = Math.PI * 2;
const reduce = () => document.documentElement.classList.contains('reduce-flash');

interface Spr { cv: HTMLCanvasElement; sh: HTMLCanvasElement; fw: number; fh: number; t: number; a: number; hot: boolean; cur: number; gone: number; tmp: HTMLCanvasElement }
const live = new Set<Spr>();
let raf = 0, last = 0;
function loop(now: number) {
  raf = 0;
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
  for (const s of live) {
    if (!s.cv.isConnected) { if (++s.gone > 240) live.delete(s); continue; }
    s.gone = 0;
    s.t += dt;
    // idle: a slow rock either side of facing; hot: it turns right round, quickly
    if (s.hot && !reduce()) s.a += dt * 3.4;
    else {
      const goal = reduce() ? 0 : Math.sin(s.t * 0.55) * 0.5;
      const r = ((s.a + Math.PI) % TAU + TAU) % TAU - Math.PI;
      s.a = r + (goal - r) * Math.min(1, dt * 3);
    }
    draw(s);
  }
  if (live.size) raf = requestAnimationFrame(loop);
}
function run(s: Spr) { live.add(s); if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }

/** one frame of the turntable, inked into a pixel sprite */
function draw(s: Spr, force = false) {
  const f = ((Math.round((s.a / TAU) * F) % F) + F) % F;
  if (f === s.cur && !force && s.t > 3) return; // (the sheet's later frames bake in idle slices: redraw for a while)
  s.cur = f;
  const { fw, fh, tmp } = s;
  const tc = tmp.getContext('2d', { willReadFrequently: true })!;
  tc.clearRect(0, 0, fw, fh);
  tc.drawImage(s.sh, 0, f * fh, fw, fh, 0, 0, fw, fh);
  const im = tc.getImageData(0, 0, fw, fh), d = im.data;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= fw || y >= fh ? 0 : d[(y * fw + x) * 4 + 3]);
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const i = (y * fw + x) * 4;
    if (d[i + 3] < 40) {
      // a bold ink line round the silhouette (and a softer second step under it: the object's own contact shade)
      if (A(x - 1, y) > 120 || A(x + 1, y) > 120 || A(x, y - 1) > 120 || A(x, y + 1) > 120) { out[i] = 18; out[i + 1] = 12; out[i + 2] = 6; out[i + 3] = 255; }
      continue;
    }
    // the rim: an upper-left edge catches the light, a lower-right one drops into shade
    if (A(x - 1, y - 1) < 40 || A(x, y - 1) < 40) { out[i] = Math.min(255, d[i] * 1.28 + 34); out[i + 1] = Math.min(255, d[i + 1] * 1.24 + 28); out[i + 2] = Math.min(255, d[i + 2] * 1.12 + 14); }
    else if (A(x + 1, y + 1) < 40 || A(x, y + 1) < 40) { out[i] = d[i] * 0.72; out[i + 1] = d[i + 1] * 0.7; out[i + 2] = d[i + 2] * 0.74; }
    out[i + 3] = 255;
  }
  tc.putImageData(new ImageData(out, fw, fh), 0, 0);
  const c = s.cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, s.cv.width, s.cv.height);
  c.drawImage(tmp, 0, 0);
}

export interface PixSprite { cv: HTMLCanvasElement; hot(on: boolean): void }
/** the floating pixel sprite of a model, about `size` px across on screen */
export function pixSprite(kind: IconKind, size = 48): PixSprite | null {
  if (!mxOk()) return null;
  const S = Math.max(16, Math.round(size));
  const sh = iconSheet(kind, S, F, 1);
  if (!sh) return null;
  const fw = sh.width, fh = Math.round(sh.height / F);
  const cv = document.createElement('canvas');
  cv.className = 'fi-cv'; cv.width = fw; cv.height = fh;
  cv.style.width = fw + 'px'; cv.style.height = fh + 'px';
  const tmp = document.createElement('canvas'); tmp.width = fw; tmp.height = fh;
  const s: Spr = { cv, sh, fw, fh, t: Math.random() * 10, a: 0, hot: false, cur: -1, gone: 0, tmp };
  draw(s, true);
  run(s);
  return { cv, hot: (on) => { s.hot = on; run(s); } };
}

export interface FloatIconOpts {
  /** the model's size on screen (px) */
  size?: number;
  /** a key hint shown small after the name (Q, E, Esc) */
  hint?: string;
  sound?: Sfx | '';
  cls?: string;
  aria?: string;
  /** the name only while hot (the survey map's rule: no text at all) */
  nameHover?: boolean;
  /** text and glow in the phosphor of a CRT (the band's tube, a terminal) */
  phosphor?: boolean;
}
export interface FloatIcon extends HTMLButtonElement { setOn(on: boolean): void; hot(on: boolean): void; lock(v: boolean): void; ping(): void; readonly kind: IconKind }

/** a floating icon button: the model over its shadow, its short name floating under it */
export function floatIcon(kind: IconKind, name: string, fn: () => void, o: FloatIconOpts = {}): FloatIcon {
  const b = document.createElement('button') as FloatIcon;
  b.type = 'button';
  b.className = 'fi' + (o.nameHover ? ' fi-nh' : '') + (o.phosphor ? ' fi-ph' : '') + (o.cls ? ' ' + o.cls : '');
  b.setAttribute('aria-label', (o.aria ?? name) + (o.hint ? ` (${o.hint})` : ''));
  b.style.setProperty('--fi-ph', (Math.random() * -4).toFixed(2) + 's');
  (b as { kind: IconKind }).kind = kind;
  const ic = document.createElement('span'); ic.className = 'fi-ic';
  const bob = document.createElement('span'); bob.className = 'fi-bob';
  const shadow = document.createElement('span'); shadow.className = 'fi-sh';
  const spr = pixSprite(kind, o.size ?? 44);
  if (spr) bob.append(spr.cv);
  else { const f = document.createElement('b'); f.className = 'fi-fb'; f.textContent = name.slice(0, 1).toUpperCase(); f.style.width = f.style.height = (o.size ?? 44) + 'px'; bob.append(f); }
  ic.append(shadow, bob);
  const t = document.createElement('span'); t.className = 'fi-t'; t.setAttribute('aria-hidden', 'true');
  t.textContent = name;
  if (o.hint) { const k = document.createElement('i'); k.textContent = o.hint; t.append(k); }
  b.append(ic, t);
  let on = false, locked = false;
  const hot = (v: boolean) => { b.classList.toggle('hot', v); spr?.hot(v); };
  b.addEventListener('pointerenter', (e) => { if (document.activeElement !== b && !(document.activeElement as HTMLElement | null)?.matches?.('input, textarea')) b.focus({ preventScroll: true }); hot(true); if ((e as PointerEvent).pointerType === 'mouse') sfx('tick', 0.35); });
  b.addEventListener('pointerleave', () => { b.classList.remove('down'); if (!b.matches(':focus-visible')) hot(false); });
  b.addEventListener('focus', () => { if (b.matches(':focus-visible') || b.matches(':hover')) hot(true); });
  b.addEventListener('blur', () => hot(false));
  b.addEventListener('pointerdown', (e) => { if ((e as PointerEvent).button > 0) return; b.classList.add('down'); });
  b.addEventListener('pointerup', () => b.classList.remove('down'));
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120); } });
  b.addEventListener('click', () => {
    if (locked || b.disabled) { sfx('error', 0.35); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
    if (o.sound !== '') sfx(o.sound ?? 'click', 0.55);
    fn();
  });
  b.setOn = (v: boolean) => { on = v; b.classList.toggle('on', on); };
  b.hot = hot;
  b.lock = (v: boolean) => { locked = v; b.classList.toggle('lock', v); };
  b.ping = () => { b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping'); };
  return b;
}

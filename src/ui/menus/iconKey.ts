// ICON KEYS (round 21): the menus' words become keys with a little 3D model on the cap.
// A machine push key (machine/kit.ts mxSkinKey: enamel cap in a steel bezel, a glass lamp) carrying
// a model that turns slowly on its turntable (machine/decor.ts mxIconSpin, the lab's own models in
// labIcons.ts). Under the pointer or focus the model lifts and spins up, the lamp lights and the relay
// ticks; a press sinks the cap with a clunk. The name floats over the key only while it is hot, as
// raised Alagard letters (no plate behind them); a key hint (Q, E, Esc) rides in the name.
import { mxSkinKey } from '../machine/kit';
import { mxIconSpin, mxIcon, type IconKind } from '../machine/decor';
import { mxOk } from '../machine/core';
import { pxCrestEl } from '../pxKit';
import type { Tone } from '../machine/paint';
import type { LampCol } from '../machine/parts';
import { sfx, type Sfx } from './sfx';
import './labIcons';
import './iconKey.css';

export interface IconKeyOpts {
  /** the key's size in CSS px (the cap is what is left after the lamp) */
  w?: number; h?: number;
  /** the model's box in px */
  model?: number;
  tone?: Tone; lamp?: LampCol | false; seed?: number;
  /** the key's sound when pressed (default the keyboard clack) */
  sound?: Sfx | '';
  /** a keyboard hint shown with the name (Q, E, Esc, 1) */
  hint?: string;
  /** where the name floats: over the key (default) or under it */
  nameAt?: 'top' | 'bottom' | 'right' | 'left';
  cls?: string;
  /** spoken name for screen readers (defaults to the name) */
  aria?: string;
  /** a still model (no turntable): for long rows of small keys */
  still?: boolean;
}
export interface IconKey extends HTMLButtonElement { setOn(on: boolean): void; hot(on: boolean): void; readonly kind: IconKind }

/** a push key with a turning 3D model on its cap, the name on hover */
export function iconKey(kind: IconKind, name: string, fn: () => void, o: IconKeyOpts = {}): IconKey {
  const b = document.createElement('button') as IconKey;
  b.type = 'button';
  const W = o.w ?? 76, H = o.h ?? 60, S = o.model ?? Math.round(H * 0.74);
  b.className = 'ikk ikk-' + (o.nameAt ?? 'top') + (o.lamp === false ? ' ikk-nolamp' : '') + (o.cls ? ' ' + o.cls : '');
  b.style.width = W + 'px'; b.style.height = H + 'px';
  b.style.setProperty('--ik-s', S + 'px');
  b.setAttribute('aria-label', (o.aria ?? name) + (o.hint ? ` (${o.hint})` : ''));
  (b as { kind: IconKind }).kind = kind;
  const spin = !o.still && mxOk() ? mxIconSpin(kind, S) : null;
  const still = !spin && mxOk() ? mxIcon(kind, S) : null;
  const cv = spin?.cv ?? still;
  if (cv) { cv.classList.add('ikk-m'); cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px'; b.append(cv); }
  else b.append(Object.assign(document.createElement('b'), { className: 'ikk-f', textContent: name.slice(0, 2).toUpperCase() }));
  const n = document.createElement('span');
  n.className = 'ikk-n';
  n.setAttribute('aria-hidden', 'true');
  n.textContent = name;
  if (o.hint) { const k = document.createElement('i'); k.textContent = o.hint; n.append(k); }
  b.append(n);
  const sk = mxSkinKey(b, { tone: o.tone ?? 'olive', lamp: o.lamp === undefined ? 'amber' : o.lamp, seed: o.seed ?? 5, sound: o.sound ?? 'key', screws: false });
  // the cap's canvas at its own size from the start (a blank canvas is 300 px wide, and a terminal measures its tray
  // from the keys before the first paint)
  const kc = b.querySelector('.mxk-cv') as HTMLCanvasElement | null;
  if (kc) { kc.width = W + 10; kc.height = H + 10; kc.style.width = W + 10 + 'px'; kc.style.height = H + 10 + 'px'; }
  let on = false;
  // the name floats only under the pointer or the keyboard; a latched key (on) keeps its model lifted and lamp lit
  const hot = (v: boolean) => { b.classList.toggle('hot', v); spin?.hot(v || on); };
  // the pointer takes the focus with it, so only one key in a row is ever hot; a key focused by the room (not by
  // the keyboard) stays quiet until the operator moves to it
  b.addEventListener('pointerenter', (e) => { if (document.activeElement !== b) b.focus({ preventScroll: true }); hot(true); if ((e as PointerEvent).pointerType === 'mouse') sfx('tick', 0.35); });
  b.addEventListener('pointerleave', () => { if (!b.matches(':focus-visible')) hot(false); });
  b.addEventListener('focus', () => { if (b.matches(':focus-visible') || b.matches(':hover')) hot(true); });
  b.addEventListener('blur', () => hot(false));
  b.addEventListener('click', () => fn());
  b.setOn = (v: boolean) => { on = v; b.classList.toggle('on', v); sk?.setOn(v); hot(b.matches(':hover') || b.matches(':focus-visible')); };
  b.hot = hot;
  return b;
}

/** a row of icon keys in a housing-less strip (the keys stand on their own) */
export function iconRow(cls: string, keys: HTMLElement[]): HTMLElement {
  const d = document.createElement('div');
  d.className = 'ikk-row ' + cls;
  d.append(...keys);
  return d;
}

/**
 * the Institute's banner without its long lines: the bishop crest, the booth's number by a little eye (title)
 * and the operator's clearance as lamps by a key (two of four lit); every part names itself on hover
 */
export function iconBanner(o: { booth?: number } = {}): HTMLElement {
  const d = document.createElement('div');
  d.className = 'px-banner ikb';
  const tag = (el: HTMLElement, name: string) => { el.dataset.name = name; el.setAttribute('aria-label', name); el.tabIndex = -1; return el; };
  const crest = tag(document.createElement('span'), 'Meridian Institute of Liminality');
  crest.className = 'ikb-c';
  crest.append(pxCrestEl(14));
  d.append(crest);
  if (o.booth !== undefined) {
    const b = tag(document.createElement('span'), 'Observation booth ' + o.booth);
    b.className = 'ikb-b';
    const ic = mxIcon('eye', 14); if (ic) b.append(ic);
    b.append(Object.assign(document.createElement('b'), { textContent: String(o.booth) }));
    d.append(b);
  }
  const cl = tag(document.createElement('span'), 'Clearance: operator, level 2');
  cl.className = 'ikb-k';
  const ik = mxIcon('key', 14); if (ik) cl.append(ik);
  for (let i = 0; i < 4; i++) { const p = document.createElement('i'); if (i < 2) p.className = 'on'; cl.append(p); }
  d.append(cl);
  return d;
}

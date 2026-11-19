// ICON KEYS (round 21): the menus' words become keys with a little 3D model on the cap.
// A machine push key (machine/kit.ts mxSkinKey: enamel cap in a steel bezel, a glass lamp) carrying
// a model that turns slowly on its turntable (machine/decor.ts mxIconSpin, the lab's own models in
// labIcons.ts). Under the pointer or focus the model lifts and spins up, the lamp lights and the relay
// ticks; a press sinks the cap with a clunk. The name floats over the key only while it is hot, as
// raised Alagard letters (no plate behind them); a key hint (Q, E, Esc) rides in the name.
import { mxSkinKey } from '../machine/kit';
import { mxIconSpin, mxIcon, type IconKind } from '../machine/decor';
import { mxOk } from '../machine/core';
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
  b.className = 'ik ik-' + (o.nameAt ?? 'top') + (o.lamp === false ? ' ik-nolamp' : '') + (o.cls ? ' ' + o.cls : '');
  b.style.width = W + 'px'; b.style.height = H + 'px';
  b.style.setProperty('--ik-s', S + 'px');
  b.setAttribute('aria-label', (o.aria ?? name) + (o.hint ? ` (${o.hint})` : ''));
  (b as { kind: IconKind }).kind = kind;
  const spin = !o.still && mxOk() ? mxIconSpin(kind, S) : null;
  const still = !spin && mxOk() ? mxIcon(kind, S) : null;
  const cv = spin?.cv ?? still;
  if (cv) { cv.classList.add('ik-m'); cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px'; b.append(cv); }
  else b.append(Object.assign(document.createElement('b'), { className: 'ik-f', textContent: name.slice(0, 2).toUpperCase() }));
  const n = document.createElement('span');
  n.className = 'ik-n';
  n.setAttribute('aria-hidden', 'true');
  n.textContent = name;
  if (o.hint) { const k = document.createElement('i'); k.textContent = o.hint; n.append(k); }
  b.append(n);
  const sk = mxSkinKey(b, { tone: o.tone ?? 'olive', lamp: o.lamp === undefined ? 'amber' : o.lamp, seed: o.seed ?? 5, sound: o.sound ?? 'key', screws: false });
  let on = false;
  const hot = (v: boolean) => { b.classList.toggle('hot', v || on); spin?.hot(v || on); };
  b.addEventListener('pointerenter', (e) => { hot(true); if ((e as PointerEvent).pointerType === 'mouse') sfx('tick', 0.35); });
  b.addEventListener('pointerleave', () => { if (document.activeElement !== b) hot(false); });
  b.addEventListener('focus', () => hot(true));
  b.addEventListener('blur', () => hot(false));
  b.addEventListener('click', () => fn());
  b.setOn = (v: boolean) => { on = v; b.classList.toggle('on', v); sk?.setOn(v); hot(v || document.activeElement === b); };
  b.hot = hot;
  return b;
}

/** a row of icon keys in a housing-less strip (the keys stand on their own) */
export function iconRow(cls: string, keys: HTMLElement[]): HTMLElement {
  const d = document.createElement('div');
  d.className = 'ik-row ' + cls;
  d.append(...keys);
  return d;
}

// MENU ICONS (round 22): the menus' buttons are floating icons with their short name under them (../floatIcon.ts):
// a pixel-pipeline model over a soft shadow that bobs and rocks, lifts and glows when hot, dips when pressed. The
// round 21 boxed machine keys are gone (the user rejected them); this keeps their call signature for the menus.
import { mxIcon, type IconKind } from '../machine/decor';
import { pxCrestEl } from '../pxKit';
import type { Sfx } from './sfx';
import { floatIcon, type FloatIcon } from '../floatIcon';
import './labIcons';
import './iconKey.css';

export interface IconKeyOpts {
  /** the old key box (only its height still sizes the model) */
  w?: number; h?: number;
  /** the model's size on screen (px) */
  model?: number;
  /** (unused: no tones, lamps or seeds on a floating icon) */
  tone?: string; lamp?: string | false; seed?: number;
  sound?: Sfx | '';
  /** a keyboard hint shown small after the name (Q, E, Esc) */
  hint?: string;
  /** (unused: the name always floats under the icon) */
  nameAt?: 'top' | 'bottom' | 'right' | 'left';
  cls?: string;
  aria?: string;
  still?: boolean;
  /** the name only while hot */
  nameHover?: boolean;
  phosphor?: boolean;
}
export type IconKey = FloatIcon;

/** a floating icon with its name under it */
export function iconKey(kind: IconKind, name: string, fn: () => void, o: IconKeyOpts = {}): IconKey {
  const S = o.model ?? Math.round((o.h ?? 56) * 0.86);
  return floatIcon(kind, name, fn, { size: S, hint: o.hint, sound: o.sound ?? 'key', cls: o.cls, aria: o.aria, nameHover: o.nameHover, phosphor: o.phosphor });
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

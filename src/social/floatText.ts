// Floating speech, typed: a strip of paper hangs near whoever speaks and
// the letters strike onto it one by one on the 8-bit voice's letter clock
// (src/social/chipVoice.ts), each a little uneven, like a teletype. The
// kind of paper says who is talking: cream ticker tape for survivors
// (tinted per person), a black TV caption band for the sergeant, red-inked
// tape for the band, a manila tag for officers, a yellow telegram for the
// radio. Shouts are comic-strip capitals without paper, shaking; thoughts
// are chalky letters that drift in. All of it is the pixel type of
// src/social/pixtype.ts, scaled up crisp. World anchoring is the UI's
// bubble list (src/ui/ui.ts).
import { letterTimes } from './chipVoice';
import { sheet, paper, glyphIndex, tintFor, type Ink } from './pixtype';
import { calm } from '../ui/menus/settings';
import './social.css';

export type FloatKind = 'say' | 'think' | 'shout' | 'voss' | 'guard' | 'radio' | 'bailiff' | 'emote' | 'note';

export interface FloatOpts {
  kind?: FloatKind;
  /** name stamped at the start of the strip */
  name?: string;
  /** survivor id: tints the paper */
  tint?: string;
  /** seconds before the first letter */
  delay?: number;
}

interface Look { paper: number | null; pk?: 'plain' | 'tape' | 'band'; ink: Ink; name: Ink; s: number; upper?: boolean }
const LOOKS: Record<string, Look> = {
  say: { paper: 0xefe3c2, pk: 'tape', ink: { ink: 0x2b2219 }, name: { ink: 0xa8281c }, s: 2 },
  emote: { paper: 0xefe3c2, pk: 'tape', ink: { ink: 0x2b2219 }, name: { ink: 0xa8281c }, s: 2 },
  think: { paper: null, ink: { ink: 0xe8e2cf, outline: 0x2a2724 }, name: { ink: 0xe8e2cf, outline: 0x2a2724 }, s: 2 },
  shout: { paper: null, ink: { ink: 0xffcf3a, outline: 0x1a1008, shadow: 0x7a2410, bold: true }, name: { ink: 0xffcf3a, outline: 0x1a1008 }, s: 3, upper: true },
  voss: { paper: 0x16130e, pk: 'band', ink: { ink: 0xf2ead2 }, name: { ink: 0xe8a640 }, s: 2 },
  bailiff: { paper: 0xf0e6cc, pk: 'tape', ink: { ink: 0xa82418 }, name: { ink: 0x2b2219 }, s: 2, upper: true },
  guard: { paper: 0xc9b68c, pk: 'plain', ink: { ink: 0x1c1a14, bold: true }, name: { ink: 0x7a2418, bold: true }, s: 2, upper: true },
  radio: { paper: 0xf1dd86, pk: 'plain', ink: { ink: 0x2a2418 }, name: { ink: 0x2a2418 }, s: 2, upper: true },
};

function hash(n: number) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; return n >>> 0; }

function glyphEl(ch: string, k: number, d: string, sh: { url: string }, still: boolean, wobble: boolean): HTMLElement {
  const i = document.createElement('i');
  i.className = 'ft-g';
  i.style.setProperty('--gx', String(glyphIndex(ch)));
  i.style.setProperty('--d', still ? '0s' : d);
  const h = hash(k * 131 + ch.charCodeAt(0));
  // a typed letter is never quite even: ink density, the odd raised or dropped letter
  i.style.setProperty('--ink', (0.8 + (h % 21) / 100).toFixed(2));
  if (wobble && h % 9 === 0) i.style.setProperty('--jy', ((h >> 5) % 2 ? 1 : -1) + '');
  if (sh) i.style.setProperty('--sheet', `url(${sh.url})`);
  return i;
}

export function floatText(text: string, o: FloatOpts = {}): HTMLDivElement {
  const kind = o.kind || 'say';
  const look = LOOKS[kind] || LOOKS.say;
  const el = document.createElement('div');
  el.className = 'w-bubble ft ft-' + kind;
  const ink = sheet(look.ink), nameInk = sheet(look.name);
  el.style.setProperty('--s', String(look.s));
  el.style.setProperty('--cw', String(ink.cw));
  el.style.setProperty('--sw', String(ink.w));
  el.style.setProperty('--sheet', `url(${ink.url})`);
  const tape = document.createElement('span');
  tape.className = 'ft-tape';
  if (look.paper !== null) {
    const pc = (kind === 'say' || kind === 'emote') && o.tint ? tintFor(o.tint) : look.paper;
    tape.style.setProperty('--paper', `url(${paper(pc, look.pk)})`);
    tape.classList.add('papered');
  }
  const still = calm();
  const body = look.upper ? text.toUpperCase() : text;
  const { t } = letterTimes(body);
  const speed = kind === 'shout' ? 0.45 : kind === 'think' ? 1.25 : 1;
  const d0 = o.delay ?? 0;
  // the name, stamped first
  if (o.name) {
    const n = document.createElement('span');
    n.className = 'ft-w ft-name';
    n.style.setProperty('--sheet', `url(${nameInk.url})`);
    const label = o.name.toUpperCase().slice(0, 16) + '▸';
    [...label].forEach((ch, k) => n.appendChild(glyphEl(ch, k + 500, '0s', nameInk, true, false)));
    tape.appendChild(n);
    tape.appendChild(document.createElement('b')).className = 'ft-sp';
  }
  let word: HTMLSpanElement | null = null;
  const chars = [...body];
  for (let k = 0; k < chars.length; k++) {
    const ch = chars[k];
    if (ch === ' ') { word = null; tape.appendChild(document.createElement('b')).className = 'ft-sp'; continue; }
    if (!word) { word = document.createElement('span'); word.className = 'ft-w'; tape.appendChild(word); }
    word.appendChild(glyphEl(ch, k, (d0 + t[k] * speed).toFixed(3) + 's', null as any, still, kind !== 'shout'));
  }
  el.appendChild(tape);
  el.setAttribute('aria-label', (o.name ? o.name + ': ' : '') + text);
  el.setAttribute('role', 'note');
  return el;
}

/** kept for callers that want a colour per survivor (now a paper tint) */
export function speakerColor(id: string): string { return '#' + tintFor(id).toString(16).padStart(6, '0'); }

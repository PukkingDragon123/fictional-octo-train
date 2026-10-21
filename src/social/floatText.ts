// Floating speech: just text, hanging near whoever speaks. No bubble, no
// box: real type with a soft dark halo (`nc-free-text`, src/ui/fonts.css).
// Each letter pops in on the 8-bit voice's letter clock (src/social/
// chipVoice.ts) and settles with a little wobble; the line rises gently
// while it is said and fades when it is done. The voice picks the type:
// survivors talk in a typeset face (each in their own tint), the sergeant in
// a worn typewriter, officers in condensed sign capitals, thoughts in pen,
// shouts in a 1950s poster slab. World anchoring is the UI's bubble list
// (src/ui/ui.ts).
import { letterTimes } from './chipVoice';
import { calm } from '../ui/menus/settings';
import './social.css';

export type FloatKind = 'say' | 'think' | 'shout' | 'voss' | 'guard' | 'radio' | 'bailiff' | 'emote' | 'note';

export interface FloatOpts {
  kind?: FloatKind;
  /** a small name over the line (other survivors, the sergeant, the radio) */
  name?: string;
  /** survivor id: tints the letters */
  tint?: string;
  /** seconds the line stays (drives the slow rise) */
  life?: number;
  /** seconds before the first letter */
  delay?: number;
}

function hash(n: number) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; return n >>> 0; }

/** a warm, light tint per survivor (readable on any floor with the halo) */
export function speakerColor(id: string): string {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 82%)`;
}

export function floatText(text: string, o: FloatOpts = {}): HTMLDivElement {
  const kind = o.kind || 'say';
  const el = document.createElement('div');
  el.className = 'w-bubble ft nc-free-text ft-' + kind;
  if (o.tint) el.style.setProperty('--ftc', speakerColor(o.tint));
  const body = document.createElement('span');
  body.className = 'ft-body';
  body.style.setProperty('--life', Math.max(1.5, o.life ?? 2.2 + text.length * 0.055).toFixed(2) + 's');
  if (o.name) {
    const n = document.createElement('span');
    n.className = 'ft-name';
    n.textContent = o.name;
    body.appendChild(n);
  }
  const still = calm();
  const { t } = letterTimes(text);
  const speed = kind === 'shout' ? 0.45 : kind === 'think' ? 1.25 : 1;
  const d0 = o.delay ?? 0;
  const chars = [...text];
  let word: HTMLSpanElement | null = null;
  for (let k = 0; k < chars.length; k++) {
    const ch = chars[k];
    if (ch === ' ') { word = null; body.appendChild(document.createTextNode(' ')); continue; }
    if (!word) { word = document.createElement('span'); word.className = 'ft-w'; body.appendChild(word); }
    const i = document.createElement('i');
    i.textContent = ch;
    i.style.setProperty('--d', still ? '0s' : (d0 + t[k] * speed).toFixed(3) + 's');
    i.style.setProperty('--i', String(k));
    const h = hash(k * 131 + ch.charCodeAt(0));
    i.style.setProperty('--r', ((h % 9) - 4) * 2.5 + 'deg');
    word.appendChild(i);
  }
  el.appendChild(body);
  el.setAttribute('aria-label', (o.name ? o.name + ': ' : '') + text);
  el.setAttribute('role', 'note');
  return el;
}

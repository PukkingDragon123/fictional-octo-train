// Floating speech: a line of text hanging near whoever says it. Each letter
// pops in on the 8-bit voice's letter clock (src/social/chipVoice.ts), then
// bobs on a slow wave; shouts shake, thoughts fade in soft and slanted. A
// small name tag sits over lines that are not your own. Styles live in
// social.css; the world anchoring is the UI's bubble list (src/ui/ui.ts).
import { letterTimes } from './chipVoice';
import { calm } from '../ui/menus/settings';
import './social.css';

export type FloatKind = 'say' | 'think' | 'shout' | 'voss' | 'guard' | 'radio' | 'bailiff' | 'emote' | 'note';

export interface FloatOpts {
  kind?: FloatKind;
  /** name tag over the line */
  name?: string;
  /** text colour and glow (CSS colours) */
  color?: string;
  glow?: string;
  /** seconds before the first letter */
  delay?: number;
}

/** speaker colour for a survivor: a soft hue from their id */
export function speakerColor(id: string): string {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 85%, 80%)`;
}

export function floatText(text: string, o: FloatOpts = {}): HTMLDivElement {
  const kind = o.kind || 'say';
  const el = document.createElement('div');
  el.className = 'w-bubble ft ft-' + kind;
  if (o.color) el.style.setProperty('--ftc', o.color);
  if (o.glow) el.style.setProperty('--ftg', o.glow);
  if (o.name) {
    const n = document.createElement('b');
    n.className = 'ft-name';
    n.textContent = o.name.toUpperCase();
    el.appendChild(n);
  }
  const body = document.createElement('span');
  body.className = 'ft-body';
  const still = calm();
  const { t } = letterTimes(text);
  const speed = kind === 'shout' ? 0.45 : kind === 'think' ? 1.2 : 1;
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
    word.appendChild(i);
  }
  el.appendChild(body);
  el.setAttribute('aria-label', (o.name ? o.name + ': ' : '') + text);
  return el;
}

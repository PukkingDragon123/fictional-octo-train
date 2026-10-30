// Floating speech: just text, hanging near whoever speaks. No bubble, no
// box: crisp pixel type with a dark ink outline (the user's fonts,
// src/ui/fonts.css: body Alagard, names in Silkscreen). Each letter
// pops in on the 8-bit voice's letter clock (src/social/chipVoice.ts); the
// line rises a hair while it is said and fades when it is done. World
// anchoring is the UI's bubble list (src/ui/ui.ts).
//
// Only lines that MEAN something get on screen. This is the display layer,
// so every source goes through it (thoughts, barks, the handler, the band,
// the radio, other survivors):
//   - a priority per line: 3 other survivors / objectives / warnings,
//     2 story (the sergeant, the band, the radio, officers) and feedback on
//     something you just tried ("won't", "needs", "locked"...), 1 flavour
//     (idle thoughts, barks);
//   - flavour is rate limited (one every 18 s, never the same words within
//     4 minutes, never on top of a more important line), story lines are
//     de-duplicated for 25 s, and a cutscene or the tutorial (floatQuiet())
//     mutes flavour altogether;
//   - long thoughts are cut to their first sentence.
// A muted line is returned hidden ('ft-mute'): callers need not know.
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
  /** 1 flavour .. 3 must show (objectives, warnings); default from the kind and the words */
  pri?: number;
}

/** a warm, light tint per survivor (readable on any floor with the ink) */
export function speakerColor(id: string): string {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 82%)`;
}

// ------------------------------------------------------------------ what gets shown
const now = () => performance.now() / 1000;
const seen = new Map<string, number>();
let lastFlavour = -1e9;
/** until when something important is on screen (flavour waits for it) */
let busyUntil = -1e9;
let quietUntil = -1e9;
let quietHold = 0;

/** mute flavour lines (thoughts, barks) for a while, or while held (cutscenes, the tutorial) */
export function floatQuiet(on: boolean | number) {
  if (typeof on === 'number') quietUntil = Math.max(quietUntil, now() + on);
  else quietHold = Math.max(0, quietHold + (on ? 1 : -1));
}

/** words that make a thought feedback (you tried something and it explains why not) or a warning */
const FEEDBACK = /\b(can'?t|cannot|won'?t|doesn'?t|don'?t|isn'?t|not|no|need|needs|nothing|locked|full|too|already|first|empty|broken|stuck|heavy|bleeding|hurts?|starving|thirsty|dying|blood|help|run)\b/i;

function priority(text: string, kind: FloatKind, o: FloatOpts): number {
  if (o.pri) return o.pri;
  switch (kind) {
    case 'note': case 'emote': case 'shout': return 3;
    case 'bailiff': return /OVERDUE|PENALTY|ABSCOND|PERIMETER|COUNTDOWN|STEP BACK|RETURN|WARNING|CHARGE/i.test(text) ? 3 : 2;
    case 'voss': case 'guard': case 'radio': return 2;
    case 'say': return o.name ? 3 : 2; // another survivor (they have a name over the line) / your own words
    case 'think': return FEEDBACK.test(text) || /[!?]\s*$/.test(text) ? 2 : 1;
  }
  return 2;
}

/** the first sentence of a long thought (lines stay short) */
function shorten(text: string, kind: FloatKind): string {
  const max = kind === 'think' ? 64 : kind === 'say' ? 96 : 999;
  if (text.length <= max) return text;
  const m = /^(.{12,}?[.!?…])(\s|$)/.exec(text);
  if (m && m[1].length <= max) return m[1];
  const cut = text.lastIndexOf(' ', max - 1);
  return text.slice(0, cut > 20 ? cut : max - 1) + '…';
}

/** should this line be on screen at all */
function admit(text: string, kind: FloatKind, pri: number, life: number): boolean {
  const t = now();
  const key = kind + ':' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const last = seen.get(key) ?? -1e9;
  if (pri <= 1) {
    if (quietHold > 0 || t < quietUntil) return false;
    if (t - last < 240 || t - lastFlavour < 18 || t < busyUntil) return false;
    lastFlavour = t;
  } else if (pri === 2) {
    if (kind !== 'say' && t - last < 25) return false;
    busyUntil = Math.max(busyUntil, t + Math.min(6, life));
  } else busyUntil = Math.max(busyUntil, t + Math.min(6, life));
  seen.set(key, t);
  if (seen.size > 300) { for (const [k, v] of seen) if (t - v > 300) seen.delete(k); }
  return true;
}

// ------------------------------------------------------------------ the look: crisp pixel type, ink outline, no wobble
let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.w-bubble.ft.nc-free-text { font-family: var(--font-new) !important; font-style: normal !important; font-weight: 400 !important;
  font-size: 16px; line-height: 18px; letter-spacing: 0; text-shadow: var(--text-ink); filter: none !important; -webkit-font-smoothing: none; font-smooth: never; }
@media (min-width: 900px) and (min-height: 560px) { .w-bubble.ft.nc-free-text { font-size: 16px; } .w-bubble.ft.ft-shout { font-size: 32px; line-height: 32px; } }
.w-bubble.ft.ft-mute { display: none !important; }
.w-bubble.ft .ft-name { font-family: var(--font-small) !important; font-size: 8px; line-height: 10px; letter-spacing: 1px; text-shadow: var(--text-ink); opacity: 0.9; }
.w-bubble.ft.ft-think { transform: translate(-50%, -100%); --ftc: #cfd9e8; }
.w-bubble.ft.ft-guard { text-transform: uppercase; }
.w-bubble.ft.ft-voss { --ftc: #f6deb0; }
.w-bubble.ft.ft-bailiff { --ftc: #ff8e78; }
.w-bubble.ft.ft-p3 { --ftc: #fff2c8; }
.ft i { rotate: 0deg !important; }
.ft-think i { animation: ft-crisp-in 0.2s steps(2) var(--d) forwards !important; }
@keyframes ft-crisp-in { from { opacity: 0; translate: 0 2px; } to { opacity: 1; translate: 0 0; } }
.w-bubble.ft.out, .w-bubble.ft.nc-free-text[style*="opacity: 0"] { filter: none !important; }
`;
  document.head.appendChild(st);
}

export function floatText(text0: string, o: FloatOpts = {}): HTMLDivElement {
  style();
  const kind = o.kind || 'say';
  const text = shorten(String(text0 ?? '').trim(), kind);
  const life = Math.max(1.5, o.life ?? 2.2 + text.length * 0.055);
  const pri = priority(text, kind, o);
  const el = document.createElement('div');
  el.className = 'w-bubble ft nc-free-text nc-ink ft-' + kind + (pri >= 3 && kind === 'think' ? ' ft-p3' : '');
  if (!text || !admit(text, kind, pri, life)) { el.classList.add('ft-mute'); el.setAttribute('aria-hidden', 'true'); return el; }
  if (o.tint) el.style.setProperty('--ftc', speakerColor(o.tint));
  const body = document.createElement('span');
  body.className = 'ft-body';
  body.style.setProperty('--life', life.toFixed(2) + 's');
  if (o.name) {
    const n = document.createElement('span');
    n.className = 'ft-name';
    n.textContent = o.name;
    body.appendChild(n);
  }
  const still = calm();
  const { t } = letterTimes(text);
  const speed = kind === 'shout' ? 0.45 : kind === 'think' ? 1.1 : 1;
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
  el.setAttribute('role', 'note');
  return el;
}

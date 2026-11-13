// THE INSTALL SEQUENCE (round 17): unlocking an upgrade is an event, not a line of text.
//   1. the download   a terminal pane: the file name, a bar, packets streaming past in hex
//   2. the install    the part itself (a little 3D model from src/ui/machine/decor.ts), big, while bolts fly
//                     in and seat, sparks spit, and a stepped progress ring closes round it
//   3. Dr. Calder     her line about it in the subtitle strip (the lab's guide, or the handler mid-run)
//   4. the reveal     the part lights, INSTALLED is stamped, what it gives under it
// About three seconds. A click, Enter, Space or Esc skips to the reveal; another closes it.
// Any research unlock plays it (bus 'researchUnlocked': the lab's tree, a permit's upload mid-run);
// several in a row queue.
import './install.css';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { sfx } from '../menus/sfx';
import { mxOk } from '../machine/core';
import { mxIconAnim, type IconKind } from '../machine/decor';
import { researchNode } from '../../game/research';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const reduce = () => document.documentElement.classList.contains('reduce-flash') || document.body.classList.contains('reduce-flash');

export interface InstallOpts { title: string; icon: IconKind; gives?: string; from?: HTMLElement | null; onDone?: () => void; key?: string }

const LINES = [
  (t: string) => `${t}. Installed. Try not to break it before it pays for itself.`,
  (t: string) => `There. ${t}. The Institute thanks you for your investment.`,
  (t: string) => `${t} is on the unit now. Use it well, operator.`,
  (t: string) => `Upload complete: ${t}. I did warn them you would want that one.`,
];
/** a line from Dr. Calder in the subtitle strip, wherever we are */
function calder(text: string) {
  const guide = (window as any).__deco?.guide as { now?: (t: string) => void } | undefined;
  const h = G.handler as { say?: (t: string, o?: unknown) => void } | undefined;
  if (G.local && h?.say) h.say(text);
  else if (guide?.now) guide.now(text);
  else { const s = el('div', 'ins-sub', `<b>Dr. Iris Calder</b><span>${esc(text)}</span>`); document.body.append(s); requestAnimationFrame(() => s.classList.add('on')); setTimeout(() => { s.classList.remove('on'); setTimeout(() => s.remove(), 400); }, 4200); }
}

const queue: InstallOpts[] = [];
let playing = false;
/** play the sequence (queued behind one already playing) */
export function playInstall(o: InstallOpts) {
  queue.push(o);
  if (!playing) next();
}
/** the skill tree buys through the research system: let it hand over its socket and callback for the next unlock */
let pending: { from: HTMLElement | null; icon: IconKind; onDone?: () => void } | null = null;
export function installFor(from: HTMLElement | null, icon: IconKind, onDone?: () => void) { pending = { from, icon, onDone }; }

function next() {
  const o = queue.shift();
  if (!o) { playing = false; return; }
  playing = true;
  run(o);
}

function run(o: InstallOpts) {
  const v = el('div', 'ins');
  const term = el('div', 'ins-term');
  term.innerHTML = `<div class="ins-th"><b>BAND LINK · DOWNLOAD</b><small>MI/RD · ${esc((o.key ?? o.title).toUpperCase().slice(0, 18))}</small></div><div class="ins-file">${esc(o.title)}</div><div class="ins-bar"><i></i><span>0%</span></div>`;
  const packets = el('div', 'ins-pk');
  term.append(packets);
  const stage = el('div', 'ins-stage');
  const ring = document.createElement('canvas'); ring.className = 'ins-ring'; ring.width = ring.height = 132;
  const fx = document.createElement('canvas'); fx.className = 'ins-fx'; fx.width = fx.height = 220;
  const part = mxOk() ? mxIconAnim(o.icon, 72) : null;
  const pw = el('div', 'ins-part');
  if (part) pw.append(part.cv);
  stage.append(fx, ring, pw);
  const reveal = el('div', 'ins-rev', `<b>INSTALLED</b><span>${esc(o.title)}</span>${o.gives ? `<small>${esc(o.gives)}</small>` : ''}`);
  v.append(term, stage, reveal, el('div', 'ins-hint', 'click to skip'));
  document.body.append(v);
  requestAnimationFrame(() => v.classList.add('on'));
  part?.hot(true);
  sfx('relay', 0.5);
  const bar = term.querySelector('.ins-bar i') as HTMLElement, pct = term.querySelector('.ins-bar span') as HTMLElement;
  const T_DL = 1.1, T_IN = 2.3, T_END = 4.6;
  let t = reduce() ? T_IN : 0, last = performance.now(), raf = 0, phase = 0, closed = false, said = false;
  const sparks: { x: number; y: number; vx: number; vy: number; l: number }[] = [];
  const bolts = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * Math.PI * 2 + 0.3, seat: 0.35 + i * 0.12, done: false }));
  const hex = () => Array.from({ length: 6 }, () => Math.floor(Math.random() * 65536).toString(16).padStart(4, '0')).join(' ');
  let pkT = 0;
  const close = () => {
    if (closed) return; closed = true;
    cancelAnimationFrame(raf);
    v.classList.remove('on');
    window.removeEventListener('keydown', key, true);
    setTimeout(() => { v.remove(); o.onDone?.(); next(); }, 260);
  };
  const skip = () => { if (t < T_IN + 0.1) t = T_IN + 0.1; else close(); };
  const key = (e: KeyboardEvent) => { if (['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); skip(); } };
  window.addEventListener('keydown', key, true);
  v.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); skip(); });
  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    t += dt;
    // 1. the download
    const dl = Math.min(1, t / T_DL);
    bar.style.width = Math.round(dl * 100) + '%'; pct.textContent = Math.round(dl * 100) + '%';
    pkT -= dt;
    if (pkT <= 0 && t < T_DL + 0.3) { pkT = 0.05; const ln = el('div', '', `${(Math.random() * 0xffff | 0).toString(16).padStart(4, '0')}:  ${hex()}`); packets.prepend(ln); if (packets.childElementCount > 9) packets.lastElementChild?.remove(); sfx('type', 0.12); }
    if (phase === 0 && t >= T_DL) { phase = 1; v.classList.add('installing'); sfx('servo', 0.45); }
    // 2. the install: the ring closes in steps, bolts fly in and seat, sparks
    const ip = Math.max(0, Math.min(1, (t - T_DL) / (T_IN - T_DL)));
    const rc = ring.getContext('2d')!;
    rc.clearRect(0, 0, 132, 132);
    const segs = 24, on = Math.floor(ip * segs);
    for (let i = 0; i < segs; i++) {
      const a0 = -Math.PI / 2 + (i / segs) * Math.PI * 2 + 0.03, a1 = a0 + (Math.PI * 2) / segs - 0.06;
      rc.strokeStyle = i < on ? (ip >= 1 ? '#7affa0' : '#ffc040') : '#1c2420'; rc.lineWidth = 8;
      rc.beginPath(); rc.arc(66, 66, 58, a0, a1); rc.stroke();
    }
    const fc = fx.getContext('2d')!;
    fc.clearRect(0, 0, 220, 220);
    for (const b of bolts) {
      const k = Math.max(0, Math.min(1, (ip - b.seat + 0.35) / 0.35));
      if (k <= 0) continue;
      const r = 100 - k * 56, x = 110 + Math.cos(b.a) * r, y = 110 + Math.sin(b.a) * r;
      fc.fillStyle = '#0d0a07'; fc.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8);
      fc.fillStyle = k >= 1 ? '#c8ccc4' : '#9aa29c'; fc.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      fc.fillStyle = '#5a605c'; fc.fillRect(Math.round(x) - 1, Math.round(y) - 3, 2, 6);
      if (k >= 1 && !b.done) { b.done = true; sfx('clamp', 0.35); for (let i = 0; i < 9; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.8) * 220, l: 0.3 + Math.random() * 0.3 }); }
    }
    if (phase === 1 && Math.random() < dt * 14) sparks.push({ x: 110 + (Math.random() - 0.5) * 70, y: 110 + (Math.random() - 0.5) * 70, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200, l: 0.25 });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.l -= dt; if (s.l <= 0) { sparks.splice(i, 1); continue; }
      s.vy += 500 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      fc.fillStyle = s.l > 0.2 ? '#fff4c0' : '#ffb030'; fc.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
    // 3. Dr. Calder, 4. the reveal
    if (!said && t >= T_DL + 0.4) { said = true; calder(LINES[Math.floor(Math.random() * LINES.length)](o.title)); }
    if (phase === 1 && t >= T_IN) { phase = 2; v.classList.add('done'); sfx('unlock', 0.75); for (let i = 0; i < 30; i++) sparks.push({ x: 110, y: 110, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.7) * 380, l: 0.4 + Math.random() * 0.4 }); }
    if (t >= T_END) { close(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

// any research unlock plays it: the skill tree hands over its socket and icon first (installFor)
bus.on('researchUnlocked', (key: string) => {
  const n = researchNode(key);
  if (!n) return;
  if (G.local && (G.local.body?.dead || document.body.classList.contains('noclip-cine'))) return;
  const p = pending; pending = null;
  playInstall({ title: n.title.charAt(0) + n.title.slice(1).toLowerCase(), icon: p?.icon ?? 'gear', gives: n.desc, from: p?.from ?? null, onDone: p?.onDone, key });
});

// Every line a character speaks, drawn where it comes from instead of in a
// subtitle bar. Bus event 'subtitle' ({ who, text, dur?, style?, x?, y?, z?,
// voiced? }):
//   voss     hologram text hanging in the air by the sergeant's projection
//   bailiff  glitch text out of the wrist (holo.ts draws it; here only the
//            fallback when the hologram is down)
//   guard    harsh stencil shouted near the officer
//   radio    burned into the corner of the picture with static
//   self     scrawled by hand near the survivor's head
// Also the shared builders ui.ts uses for thoughts, speech and shouts.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { calm } from '../menus/settings';
import type { Player } from '../../entities/player';

interface UiLike { bubbles: any[]; root: HTMLElement }

/** world position of the handler's projection, if the handler module exposes one */
function handlerPos(out: THREE.Vector3): boolean {
  const h: any = (G as any).handler;
  if (!h) return false;
  try {
    const p = h.worldPos?.() ?? h.pos ?? h.position ?? h.root?.position ?? h.group?.position ?? h.obj?.position ?? h.mesh?.position ?? h.rig?.root?.position;
    if (p && typeof p.x === 'number' && typeof p.z === 'number') {
      if (h.visible === false || h.active === false) return false;
      out.set(p.x, (typeof p.y === 'number' ? p.y : 0) + 2.15, p.z);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ------------------------------------------------------------------ builders
/** handwriting: each letter its own tilt and baseline, written out one by one */
export function scrawl(text: string, cls = 'think'): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'w-bubble ' + cls;
  const words = text.split(' ');
  let i = 0;
  for (let w = 0; w < words.length; w++) {
    const ws = document.createElement('span'); ws.className = 'wd';
    for (const ch of words[w]) {
      const s = document.createElement('i');
      s.textContent = ch;
      const h = hash(i * 7 + ch.charCodeAt(0));
      s.style.setProperty('--r', ((h % 13) - 6) * 0.9 + 'deg');
      s.style.setProperty('--y', ((h >> 4) % 3) - 1 + 'px');
      s.style.animationDelay = calm() ? '0s' : (i * 0.028).toFixed(3) + 's';
      ws.appendChild(s);
      i++;
    }
    el.appendChild(ws);
    if (w < words.length - 1) el.appendChild(document.createTextNode(' '));
    i++;
  }
  el.setAttribute('aria-label', text);
  return el;
}
/** speech: the words arrive one at a time */
export function speech(text: string, cls: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'w-bubble ' + cls;
  const words = text.split(' ');
  words.forEach((w, k) => {
    const s = document.createElement('span');
    s.textContent = w + (k < words.length - 1 ? ' ' : '');
    s.style.animationDelay = calm() ? '0s' : (k * 0.09).toFixed(2) + 's';
    el.appendChild(s);
  });
  return el;
}
/** shouting: big shaking letters */
export function shout(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'w-bubble shout';
  for (const [k, ch] of [...text].entries()) {
    const s = document.createElement('i');
    s.textContent = ch;
    s.style.animationDelay = (-(hash(k) % 10) * 0.03).toFixed(2) + 's';
    el.appendChild(s);
  }
  return el;
}
function hash(n: number) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; return (n >>> 0); }

// ------------------------------------------------------------------ radio corner
let radioHost: HTMLDivElement | null = null;
/** a line of radio burned into the corner of the picture */
export function radioLine(who: string, text: string, secs = 5) {
  if (!radioHost || !radioHost.isConnected) { radioHost = document.createElement('div'); radioHost.className = 'sub-radio'; radioHost.setAttribute('aria-live', 'polite'); document.body.appendChild(radioHost); }
  const el = document.createElement('div');
  el.className = 'sub-rl';
  const head = document.createElement('b');
  head.textContent = (who ? who.toUpperCase() : 'RX') + ' ▸ ';
  const body = document.createElement('span');
  el.appendChild(head); el.appendChild(body);
  radioHost.appendChild(el);
  while (radioHost.children.length > 4) radioHost.firstElementChild!.remove();
  // types in with dropouts
  const t0 = performance.now();
  const dur = Math.min(2.2, 0.3 + text.length * 0.035);
  const tick = () => {
    if (!el.isConnected) return;
    const k = Math.min(1, (performance.now() - t0) / 1000 / dur);
    const n = Math.floor(k * text.length);
    let s = text.slice(0, n);
    if (k < 1 && !calm()) s = s.replace(/[a-z]/gi, (c) => (Math.random() < 0.05 ? '░' : c)) + '▌';
    body.textContent = s;
    if (k < 1) requestAnimationFrame(tick); else body.textContent = text;
  };
  tick();
  G.audio?.ui?.('static_burst', 0.12);
  setTimeout(() => el.classList.add('burn'), secs * 1000);
  setTimeout(() => el.remove(), secs * 1000 + 6000);
}

// ------------------------------------------------------------------ band fallback (hologram down)
let bandHost: HTMLDivElement | null = null;
function bandLine(text: string, secs: number) {
  if (!bandHost || !bandHost.isConnected) { bandHost = document.createElement('div'); bandHost.className = 'sub-band'; bandHost.setAttribute('aria-live', 'assertive'); document.body.appendChild(bandHost); }
  bandHost.textContent = '';
  const el = document.createElement('div');
  el.textContent = text;
  bandHost.appendChild(el);
  setTimeout(() => el.classList.add('out'), secs * 1000);
  setTimeout(() => el.remove(), secs * 1000 + 700);
}

// ------------------------------------------------------------------ the event
export function initSubtitles(ui: UiLike) {
  bus.on('subtitle', (s: any) => {
    if (!s || !s.text) return;
    const text = String(s.text);
    const who = String(s.who || '');
    let style: string = s.style || '';
    if (!style) style = /bailiff|band/i.test(who) ? 'bailiff' : /voss|sergeant|handler/i.test(who) ? 'voss' : /guard|officer|custody/i.test(who) ? 'guard' : who && G.local && who === G.local.name ? 'self' : 'radio';
    const secs = Number(s.dur) > 0 ? Number(s.dur) : 2.2 + text.length * 0.055;
    const at = typeof s.x === 'number' && typeof s.z === 'number' ? { x: s.x, y: (typeof s.y === 'number' ? s.y : 0) + 2.15, z: s.z } : null;
    switch (style) {
      case 'bailiff':
        if (!G.holo?.visible) bandLine(text, secs);
        break;
      case 'radio':
        radioLine(who, text, secs);
        break;
      case 'self': {
        const p = G.local;
        if (!p) return;
        for (const b of ui.bubbles) if (b.target === p && b.kind === 'think') b.until = 0;
        const el = scrawl(text, 'think');
        ui.root.appendChild(el);
        ui.bubbles.push({ el, target: p, until: G.time + secs, born: G.time, rise: 0, kind: 'think' });
        break;
      }
      case 'voss': case 'guard': default: {
        const el = document.createElement('div');
        el.className = 'w-bubble ' + (style === 'guard' ? 'sub-guard' : 'sub-voss');
        if (style !== 'guard') { const n = document.createElement('b'); n.textContent = (who || 'VOSS').toUpperCase(); el.appendChild(n); }
        const body = speech(text, '');
        for (const c of [...body.childNodes]) el.appendChild(c);
        // where is the speaker? given position, the handler's projection, or the band (the sergeant projects from it too)
        let target: any = at;
        if (!target && style !== 'guard') {
          const v = new THREE.Vector3();
          const ok = handlerPos(v);
          if (ok) target = { x: v.x, y: v.y, z: v.z };
          else if (G.local) {
            const p: Player = G.local;
            target = { get x() { return p.x + 0.9; }, get y() { return p.y + 2.5; }, get z() { return p.z - 0.4; } };
          }
        }
        if (!target) {
          // an officer we cannot place: their voice comes from off screen, bottom of the picture
          el.classList.add('offscreen');
          document.body.appendChild(el);
          setTimeout(() => el.classList.add('out'), secs * 1000);
          setTimeout(() => el.remove(), secs * 1000 + 600);
          return;
        }
        ui.root.appendChild(el);
        ui.bubbles.push({ el, target, until: G.time + secs, born: G.time, rise: 0, kind: style });
      }
    }
  });
}

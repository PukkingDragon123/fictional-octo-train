// Cinematic world text: what the people and inhabitants of the levels say, hung in the world beside the
// speaker as type with depth. The letters assemble in on the voice's letter clock (each drops and turns in
// from the lens with a short glow trail), the line drifts a little while it is said, then dissolves up and
// out letter by letter. One line per speaker (a new line replaces the old one), lines never stack on top
// of each other on screen, Alagard throughout, no box, no bubble. The subtitle strip stays as an option
// (Settings: "Subtitle strip").
//
//   cineSay(key, text, anchor, { secs, name, tone, times })   anchor: {x, y, z} world (getters are followed)
//   cineClear(key?)        dissolve a speaker's line (or all)
//   cineActive()           lines on screen (tests; window.__cineText in development)
import * as THREE from 'three';
import { G } from '../../game/G';
import { calm } from '../menus/settings';
import './cineText.css';

export type CineTone = 'calder' | 'radio' | 'npc' | 'creature' | 'band' | 'self';
export interface CineAnchor { readonly x: number; readonly y: number; readonly z: number }
export interface CineOpts { secs?: number; name?: string; tone?: CineTone; /** ms of each letter from the start (the voice's clock) */ times?: number[] }

interface Live { key: string; el: HTMLDivElement; at: CineAnchor; until: number; out: boolean; born: number; n: number; y: number }

let layer: HTMLDivElement | null = null;
const lines = new Map<string, Live>();
const v = new THREE.Vector3();
let raf = 0;

function host(): HTMLDivElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'ct-layer';
    layer.setAttribute('aria-live', 'polite');
    document.body.appendChild(layer);
  }
  return layer;
}

const now = () => performance.now() / 1000;

/** speak a line in the world; returns the line element */
export function cineSay(key: string, text: string, at: CineAnchor, o: CineOpts = {}): HTMLDivElement {
  const secs = o.secs ?? 2.2 + text.length * 0.055;
  const old = lines.get(key);
  if (old) dissolve(old, true);
  const el = document.createElement('div');
  el.className = `ct-line ct-${o.tone ?? 'npc'}`;
  if (o.name) { const n = document.createElement('div'); n.className = 'ct-name'; n.textContent = o.name; el.appendChild(n); }
  const body = document.createElement('div'); body.className = 'ct-body';
  const per = Math.max(18, Math.min(55, (secs * 1000 * 0.45) / Math.max(1, text.length)));
  let i = 0;
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if (/^\s+$/.test(word)) { body.appendChild(document.createTextNode(' ')); i++; continue; }
    const w = document.createElement('span'); w.className = 'ct-w';
    for (const ch of word) {
      const g = document.createElement('span'); g.className = 'ct-g'; g.textContent = ch;
      const ms = o.times?.[i] ?? i * per;
      // each letter comes in from its own angle (seeded by its place: the same line always looks the same)
      const r = (((i * 7919) % 13) - 6) * 3;
      g.style.setProperty('--d', `${Math.round(ms)}ms`);
      g.style.setProperty('--r', `${r}deg`);
      g.style.setProperty('--o', `${Math.round(i * 11)}ms`);
      w.appendChild(g); i++;
    }
    body.appendChild(w);
  }
  el.appendChild(body);
  el.style.setProperty('--life', `${secs + 0.6}s`);
  if (calm()) el.classList.add('ct-calm');
  host().appendChild(el);
  const L: Live = { key, el, at, until: now() + secs, out: false, born: now(), n: i, y: 0 };
  lines.set(key, L);
  place();
  if (!raf) raf = requestAnimationFrame(tick);
  return el;
}

function dissolve(L: Live, fast = false) {
  if (L.out) return;
  L.out = true;
  L.el.classList.add(fast ? 'out-fast' : 'out');
  if (lines.get(L.key) === L) lines.delete(L.key);
  setTimeout(() => L.el.remove(), fast ? 320 : 600 + L.n * 12);
}

export function cineClear(key?: string) {
  for (const L of [...lines.values()]) if (!key || L.key === key) dissolve(L, true);
}
export function cineActive(): { key: string; text: string }[] {
  return [...lines.values()].map((L) => ({ key: L.key, text: L.el.querySelector('.ct-body')?.textContent ?? '' }));
}

/** project every line to its speaker and keep lines from covering each other */
function place() {
  const pr: any = (G as any)?.pr;
  const W = window.innerWidth, H = window.innerHeight;
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const list = [...lines.values()].sort((a, b) => a.born - b.born);
  for (const L of list) {
    let sx = W / 2, sy = H * 0.3, vis = true;
    if (pr?.worldToScreen) {
      const s = pr.worldToScreen(v.set(L.at.x, L.at.y, L.at.z));
      sx = s.x; sy = s.y; vis = s.z < 1;
    }
    const w = L.el.offsetWidth || 200, h = L.el.offsetHeight || 40;
    sx = Math.max(w / 2 + 12, Math.min(W - w / 2 - 12, sx));
    let top = Math.max(12, Math.min(H - h - 90, sy - h));
    // never on top of an earlier line: step up above it
    for (let k = 0; k < 6; k++) {
      const hit = boxes.find((b) => sx + w / 2 > b.x0 && sx - w / 2 < b.x1 && top + h > b.y0 && top < b.y1);
      if (!hit) break;
      top = hit.y0 - h - 6;
    }
    L.y += (top - L.y) * (L.y === 0 ? 1 : 0.25);
    boxes.push({ x0: sx - w / 2, x1: sx + w / 2, y0: L.y, y1: L.y + h });
    L.el.style.transform = `translate3d(${Math.round(sx - w / 2)}px, ${Math.round(L.y)}px, 0)`;
    L.el.style.visibility = vis ? '' : 'hidden';
  }
}

function tick() {
  raf = 0;
  const t = now();
  for (const L of [...lines.values()]) if (t > L.until) dissolve(L);
  if (!lines.size) return;
  place();
  raf = requestAnimationFrame(tick);
}

if (import.meta.env?.DEV) (window as any).__cineText = { say: cineSay, clear: cineClear, active: cineActive };

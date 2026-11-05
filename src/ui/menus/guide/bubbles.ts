// Pixel-art speech clouds over a 3D speaker (after Gacha Garage's Bubbles.js,
// ported and re-cut for this game): each cloud is rasterised once into a
// tiny canvas (a lumpy hand-cut body, 1 art-px ink line, puffy under-shading,
// a drop shadow), shown at 2 CSS px per art pixel with hard pixels, and the
// words (Alagard, 16px, crisp) type themselves in letter by letter. Pop-in
// with squash and stretch, a gentle float, edge clamping (the tail keeps
// pointing at the speaker), a fade and shrink out. Transforms only per frame.
//   const b = new Bubbles(layerParent);
//   b.say(() => headPos, 'Hello.', { dur, style: 'say' | 'think' | 'shout', onChar })
//   b.update(dt, camera, viewRect)
import * as THREE from 'three';

const A = 2;
const INK = [24, 18, 16];
const FILL: Record<string, number[]> = { say: [246, 240, 226], think: [236, 238, 246], shout: [255, 244, 210] };
const SHADE: Record<string, number[][]> = { say: [[196, 186, 166], [222, 214, 196]], think: [[200, 202, 222], [222, 224, 238]], shout: [[236, 200, 140], [248, 226, 176]] };
const TAIL_H = 9;
const _v = new THREE.Vector3();

export type Style = 'say' | 'think' | 'shout';
type Inside = (x: number, y: number) => boolean;
const hash = (i: number, s: number) => { let h = (i * 374761393 + s * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function rasterize(ctx: CanvasRenderingContext2D, w: number, h: number, inside: Inside, style: Style, topOpen: Inside | null = null) {
  const img = ctx.createImageData(w, h), d = img.data;
  const ins = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ins[y * w + x] = inside(x + 0.5, y + 0.5) ? 1 : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : ins[y * w + x]);
  const fill = FILL[style], [s1, s2] = SHADE[style];
  const put = (x: number, y: number, c: number[], a = 255) => { const p = (y * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = a; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y)) {
      let c = fill;
      if (!at(x, y + 1)) c = s1; else if (!at(x, y + 2)) c = s2;
      else if (!at(x, y - 1)) c = [255, 255, 250];
      put(x, y, c);
      if (topOpen && topOpen(x, y)) put(x, y, fill);
    } else {
      let edge = 0;
      for (let j = -1; j <= 1 && !edge; j++) for (let i = -1; i <= 1; i++) if ((i || j) && at(x + i, y + j)) { edge = 1; break; }
      if (edge && !(topOpen && topOpen(x, y))) put(x, y, INK);
      else if (at(x - 1, y - 2) || at(x, y - 2)) { const p = (y * w + x) * 4; d[p] = 10; d[p + 1] = 6; d[p + 2] = 4; d[p + 3] = 90; }
    }
  }
  ctx.putImageData(img, 0, 0);
}

interface Body { canvas: HTMLCanvasElement; w: number; h: number; tx: number; ty: number; low: (x: number) => number }
function makeBody(iw: number, ih: number, style: Style, seed: number): Body {
  const padX = style === 'shout' ? 9 : 6, padY = style === 'shout' ? 7 : 4;
  const cw = iw + padX * 2, chh = ih + padY * 2;
  const r = Math.max(5, Math.min(9, Math.round(chh * 0.42)));
  const m = style === 'shout' ? 7 : Math.ceil(r * 0.75) + 2;
  const w = cw + m * 2, h = chh + m * 2 + 3;
  const x0 = m, y0 = m, x1 = m + cw, y1 = m + chh;
  let inside: Inside;
  if (style === 'shout') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = cw / 2 + 4, ry = chh / 2 + 3;
    const n = Math.max(12, Math.round((cw + chh) / 7));
    inside = (x, y) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
      const f = (a / (Math.PI * 2) + 1) * n, q = (((f + hash(Math.floor(f), seed) * 0.2) % 1) + 1) % 1;
      const spike = 1 + 0.22 * (1 - Math.abs(q - 0.5) * 2) ** 1.6;
      return dx * dx + dy * dy < spike * spike * (1 - 0.06 * Math.abs(Math.sin(a * 2)));
    };
  } else {
    // a lumpy cloud: overlapping puffs along the edges, cut to whole pixels
    const puffs: [number, number, number][] = [];
    const rr = style === 'think' ? r * 0.92 : r;
    const nTop = Math.max(2, Math.round(cw / (rr * 1.45))), nBot = Math.max(2, Math.round(cw / (rr * 1.7)));
    for (let i = 0; i < nTop; i++) puffs.push([x0 + rr * 0.55 + (cw - rr * 1.1) * (nTop === 1 ? 0.5 : i / (nTop - 1)), y0 + rr * 0.42 - hash(i, seed) * 1.2, rr * (0.92 + hash(i + 9, seed) * 0.2)]);
    for (let i = 0; i < nBot; i++) puffs.push([x0 + rr * 0.7 + (cw - rr * 1.4) * (nBot === 1 ? 0.5 : i / (nBot - 1)) + (hash(i + 3, seed) - 0.5) * 2, y1 - rr * 0.5 + hash(i + 5, seed), rr * (0.85 + hash(i + 7, seed) * 0.2)]);
    const nSide = Math.max(1, Math.round((chh - rr) / (rr * 1.3)));
    for (let i = 0; i < nSide; i++) { const yy = y0 + chh * (i + 0.5) / nSide; puffs.push([x0 + rr * 0.35, yy, rr * 0.95], [x1 - rr * 0.35, yy, rr * 0.95]); }
    inside = (x, y) => {
      if (x > x0 + 1 && x < x1 - 1 && y > y0 + 1 && y < y1 - 1) return true;
      for (const [px, py, pr] of puffs) { const dx = x - px, dy = y - py; if (dx * dx + dy * dy < pr * pr) return true; }
      return false;
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.className = 'hb-bg';
  canvas.style.width = w * A + 'px'; canvas.style.height = h * A + 'px';
  rasterize(canvas.getContext('2d')!, w, h, inside, style);
  const low = (x: number) => { for (let y = h - 1; y >= 0; y--) if (inside(x + 0.5, y + 0.5)) return y; return y1; };
  return { canvas, w, h, tx: x0 + padX, ty: y0 + padY, low };
}

function drawTail(cv: HTMLCanvasElement, style: Style, lean: number, depth: number, extra = 0) {
  const w = 30, h = TAIL_H + depth + extra;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; cv.style.width = w * A + 'px'; cv.style.height = h * A + 'px'; }
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const cx = 15, top = 0, tip = h - 1;
  let inside: Inside;
  if (style === 'think') {
    const pts = extra > 6 ? [[0.25, 3.2], [0.5, 2.6], [0.74, 2], [0.94, 1.4]] : [[0.38, 3.2], [0.68, 2.3], [0.93, 1.5]];
    inside = (x, y) => pts.some(([t, r]) => { const py = depth + (tip - depth) * t, px = cx + lean * (1 - t) * 0.8; return (x - px) ** 2 + (y - py) ** 2 < r * r; });
    rasterize(ctx, w, h, inside, style);
    return;
  }
  if (style === 'shout') {
    inside = (x, y) => {
      if (y < top || y > tip) return false;
      const t = (y - top) / (tip - top), mid = cx + lean * (1 - t);
      const zig = (Math.floor(t * 3) % 2 ? 1.5 : -1.5) * (1 - t);
      return Math.abs(x - mid - zig) < 4.2 * (1 - t) + 0.4;
    };
  } else {
    inside = (x, y) => {
      if (y < top || y > tip + 0.5) return false;
      const t = (y - top) / (tip - top);
      const mid = cx + lean * (1 - t) * (1 - t * 0.4) + Math.sin(t * Math.PI) * 1.6;
      return Math.abs(x - mid) < 4.4 * (1 - t) ** 0.8 + 0.35;
    };
  }
  rasterize(ctx, w, h, inside, style, (_x, y) => y < depth);
}

interface Ch { ch: string; el: HTMLElement | null; at: number }
interface B {
  target: () => THREE.Vector3; el: HTMLElement; inner: HTMLElement; body: HTMLElement; tail: HTMLCanvasElement; chars: Ch[]; next: number; style: Style; bg: Body;
  t: number; reveal: number; life: number; closing: boolean; closeT: number; closeDur: number; onChar?: (ch: string) => void; phase: number; delay: number;
  x: number; y: number; vis: boolean; lean: number | null; extra: number; col: number; leanPx: number; op: string; dead?: boolean; k: number; sx: number; sy: number; rise: number; fade: number;
}

export class Bubbles {
  layer = document.createElement('div');
  private list: B[] = [];
  private seed = 1;
  constructor(parent: HTMLElement = document.body) {
    this.layer.className = 'hb-layer';
    parent.append(this.layer);
  }
  say(target: () => THREE.Vector3, text: string, o: { dur?: number; style?: Style; onChar?: (ch: string) => void; cps?: number } = {}) {
    const style = o.style ?? 'say';
    for (const b of this.list) if (!b.closing) this.close(b, 0.12);
    const el = document.createElement('div');
    el.className = `hb ${style}`;
    el.style.opacity = '0';
    const inner = document.createElement('div'); inner.className = 'hb-in';
    const body = document.createElement('div'); body.className = 'hb-body';
    const txt = document.createElement('div'); txt.className = 'hb-txt';
    const chars: Ch[] = [];
    for (const w of String(text).split(/(\s+)/)) {
      if (!w) continue;
      if (/^\s+$/.test(w)) { txt.appendChild(document.createTextNode(' ')); chars.push({ ch: ' ', el: null, at: 0 }); continue; }
      const we = document.createElement('span'); we.className = 'hb-w';
      for (const ch of w) { const c = document.createElement('span'); c.className = 'hb-c'; c.textContent = ch; we.appendChild(c); chars.push({ ch, el: c, at: 0 }); }
      txt.appendChild(we);
    }
    body.appendChild(txt);
    const tail = document.createElement('canvas'); tail.className = 'hb-tail';
    inner.append(body, tail);
    el.appendChild(inner);
    el.style.visibility = 'hidden';
    this.layer.appendChild(el);
    const tw = Math.ceil(txt.offsetWidth), th = Math.ceil(txt.offsetHeight);
    const seed = this.seed++;
    const bg = makeBody(Math.ceil(tw / A), Math.ceil(th / A), style, seed);
    body.prepend(bg.canvas);
    body.style.width = bg.w * A + 'px'; body.style.height = bg.h * A + 'px'; body.style.left = -bg.w * A / 2 + 'px';
    txt.style.left = bg.tx * A + Math.round(((Math.ceil(tw / A) * A) - tw) / 2) + 'px';
    txt.style.top = bg.ty * A + 'px';
    txt.style.width = tw + 'px';
    const cps = o.cps ?? (style === 'shout' ? 40 : 34);
    let t = 0.12;
    for (let i = 0; i < chars.length; i++) {
      chars[i].at = t;
      const ch = chars[i].ch, next = chars[i + 1]?.ch;
      t += 1 / cps;
      if (next && /[.!?]/.test(ch) && !/[.!?]/.test(next)) t += 0.22;
      else if (next && /[,;:]/.test(ch)) t += 0.1;
    }
    const b: B = {
      target, el, inner, body, tail, chars, next: 0, style, bg, t: 0, reveal: t, life: Math.max(o.dur ?? 1.8 + text.length * 0.06, t + 1.4), closing: false, closeT: 0, closeDur: 0.24,
      onChar: o.onChar, phase: Math.random() * 6, delay: this.list.length ? 0.08 : 0, x: 0, y: 0, vis: false, lean: null, extra: 0, col: -1, leanPx: 0, op: '', k: 0, sx: 1, sy: 1, rise: 0, fade: 1,
    };
    el.style.visibility = '';
    this.list.push(b);
    return { close: () => this.close(b), get done() { return b.dead === true; }, get typed() { return b.t >= b.reveal; } };
  }
  /** still typing (drive the mouth with this) */
  get talking() { return this.list.some((b) => !b.closing && b.t < b.reveal + 0.05); }
  get open() { return this.list.some((b) => !b.closing); }
  clear() { for (const b of this.list) this.close(b, 0.14); }
  /** finish typing the current line at once (a click skips) */
  skip() { for (const b of this.list) if (!b.closing && b.t < b.reveal) { b.t = b.reveal; b.life = Math.max(b.life, b.reveal + 1.2); } }
  private close(b: B, dur = 0.24) { if (!b.closing) { b.closing = true; b.closeT = 0; b.closeDur = dur; } }

  update(dt: number, cam: THREE.Camera, rect: DOMRect) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.t += dt;
      while (b.next < b.chars.length && b.chars[b.next].at <= b.t) {
        const c = b.chars[b.next++];
        if (c.el) c.el.classList.add('on');
        b.onChar?.(c.ch);
      }
      if (!b.closing && b.t > b.life) this.close(b);
      let k = 1, sx = 1, sy = 1, rise = 0;
      if (b.closing) {
        b.closeT += dt;
        const u = Math.min(1, b.closeT / b.closeDur);
        k = 1 - u * u; sx = sy = 1 - 0.35 * u; rise = -10 * u;
        if (u >= 1) { b.el.remove(); b.dead = true; this.list.splice(i, 1); continue; }
      } else {
        const u = b.t, e = Math.exp(-u * 9);
        const base = 1 - e * Math.cos(u * 20), sq = 0.22 * e * Math.sin(u * 20);
        sx = base * (1 + sq); sy = base * (1 - sq);
        k = Math.min(1, u / 0.08);
      }
      b.k = k; b.sx = sx; b.sy = sy; b.rise = rise;
      _v.copy(b.target()).project(cam);
      if (_v.z > 1 || _v.z < -1) { if (b.vis) { b.el.style.visibility = 'hidden'; b.vis = false; } continue; }
      b.x = rect.left + (_v.x * 0.5 + 0.5) * rect.width; b.y = rect.top + (-_v.y * 0.5 + 0.5) * rect.height;
      if (!b.vis) { b.el.style.visibility = ''; b.vis = true; }
      const W = window.innerWidth, H = window.innerHeight;
      const bw = b.bg.w * A, bh = (b.bg.h + TAIL_H) * A;
      // keep the cloud on screen; the tail leans back to the speaker
      const cx = Math.max(8 + bw / 2, Math.min(W - 8 - bw / 2, b.x));
      const y = Math.max(bh + 8, Math.min(H - 4, b.y));
      const leanPx = cx - b.x;
      const lean = Math.max(-10, Math.min(10, Math.round(leanPx / A / 2) * 2));
      const col = Math.round(b.bg.w / 2 + lean - leanPx / A);
      if (lean !== b.lean || col !== b.col) this.layoutTail(b, lean, col);
      const bob = Math.sin(b.t * 2.3 + b.phase) * 1.6;
      b.el.style.transform = `translate3d(${b.x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      b.inner.style.transform = `translate(0,${(bob + b.rise).toFixed(1)}px) scale(${b.sx.toFixed(3)},${b.sy.toFixed(3)})`;
      if (Math.abs(leanPx - b.leanPx) > 0.05) { b.body.style.transform = `translateX(${leanPx.toFixed(1)}px)`; b.leanPx = leanPx; }
      const op = b.k.toFixed(2);
      if (op !== b.op) { b.el.style.opacity = op; b.op = op; }
    }
  }
  private layoutTail(b: B, lean: number, col: number) {
    b.lean = lean; b.col = col;
    const depth = 4;
    drawTail(b.tail, b.style, lean, depth, 0);
    b.tail.style.left = -15.5 * A + 'px';
    b.tail.style.top = -(TAIL_H + depth) * A + 'px';
    const low = b.bg.low(Math.max(2, Math.min(b.bg.w - 3, col)));
    b.body.style.top = (-TAIL_H - 1 - low) * A + 'px';
  }
  dispose() { this.layer.remove(); this.list.length = 0; }
}

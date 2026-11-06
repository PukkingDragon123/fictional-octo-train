// THE MAIN COMPUTER: the control room's research tree (data: src/game/unitTree.ts)
// on an old Meridian CRT. The camera has flown into the tube (rooms/research.ts);
// this is the picture on the glass: phosphor amber on green-black, scanlines, a
// rolling hum bar, a punched-tape reader chattering down the left edge.
//   · four branch keys (Q / E): Unit designs, Recipes, Chips, Limbs
//   · each branch a page of lanes: riveted brass frames with pixel-art icons,
//     chained left to right by pipes; a node locks (chains and a padlock) until
//     the node before it is owned; a rank counter under every frame
//   · click / Enter stages the next rank (amber lamp), Undo takes the last one
//     back, Confirm spends the points (the tape punches the order)
//   · the teleprinter on the right reads out whatever is under the pointer
//   openTree({ onClose })   one at a time; Esc / B closes (an unconfirmed plan is dropped)
import './tree.css';
import { FocusNav } from '../nav';
import { sfx } from '../sfx';
import { PixelCanvas, mixHex } from '../../../gfx/pixel';
import { researchPoints } from '../../../game/research';
import {
  BRANCHES, treeNodes, treeNode, treeLanes, rankOf, rankPlanned, nodeState, stage, unstage, clearPlan, confirmPlan, staged, pointsLeft, onPlan, researchFor,
  type Branch, type TreeNode, type NodeState,
} from '../../../game/unitTree';
import { nodeIcon } from './icons';
import { iconResCss } from '../../icons';

const ART = 28;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

let cur: { el: HTMLElement; nav: FocusNav; close: () => void } | null = null;
export const treeOpen = () => !!cur;
export function closeTree() { cur?.close(); }

// ================================================================== pixel-art frames and chains (cached data URLs)
const frames = new Map<string, string>();
function frameUrl(state: NodeState | 'staged'): string {
  const hit = frames.get(state);
  if (hit) return hit;
  const S = 34, p = new PixelCanvas(S, S); p.wrap = false;
  const metal = state === 'locked' ? [0x2a2622, 0x3e3830, 0x564c40, 0x1a1714] : state === 'owned' || state === 'max' ? [0x6a4a14, 0xb8862a, 0xffd36a, 0x3a2608] : state === 'poor' ? [0x4a3a24, 0x7a6038, 0xa88a58, 0x241a10] : [0x5a4418, 0xa07a30, 0xe8c070, 0x2e2010];
  const [lo, mid, hi, dk] = metal;
  // bevelled ring: outer dark line, a lit top-left, shaded bottom-right
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const e = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (e === 0) p.set(x, y, 0x080604);
    else if (e <= 3) {
      const tl = x + y < S - 1;
      p.set(x, y, e === 1 ? (tl ? hi : lo) : e === 2 ? mid : tl ? mixHex(mid, hi, 0.4) : mixHex(mid, lo, 0.5));
      if (e === 2 && (x * 3 + y * 7) % 13 === 0) p.set(x, y, mixHex(mid, dk, 0.5));
    } else if (e === 4) p.set(x, y, dk);
    else p.set(x, y, mixHex(0x0a120c, 0x14261a, 1 - y / S));
  }
  // rivets in the corners, a tag notch at the top
  for (const [x, y] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3]]) { p.set(x, y, hi); p.set(x + 1, y + 1, dk); }
  for (let x = 14; x < 20; x++) p.set(x, 1, dk);
  // the glass: a faint diagonal sheen
  for (let i = 5; i < 14; i++) p.set(i, 5 + (13 - i) * 0, mixHex(0x14261a, 0xffffff, 0.06));
  // the pilot gem in its brass collar at the top: dark glass while locked, amber when it can be bought or is staged, green once owned
  const lamp = state === 'locked' ? [0x1a1e1c, 0x2a302c, 0x3a423c] : state === 'poor' ? [0x4a2a10, 0x7a4a18, 0xa86a2a] : state === 'staged' || state === 'open' ? [0x8a4a08, 0xffb030, 0xfff0b0] : [0x1a6a2a, 0x60ff80, 0xe0ffe8];
  for (let x = 13; x <= 20; x++) for (let y = 0; y <= 3; y++) {
    const edge = x === 13 || x === 20 || y === 0 || y === 3;
    if (edge) p.set(x, y, (x === 13 && y === 0) || (x === 20 && y === 0) ? 0x080604 : y === 0 ? hi : mid);
  }
  for (let x = 14; x <= 19; x++) for (let y = 1; y <= 2; y++) p.set(x, y, y === 1 ? (x <= 15 ? lamp[2] : lamp[1]) : lamp[0]);
  // wear: verdigris in the bevel, a scratch across the ring
  for (const [x, y] of [[5, 30], [6, 30], [29, 7], [29, 8], [30, 26]]) p.set(x, y, mixHex(mid, 0x4a8a6a, 0.45));
  for (let i = 0; i < 5; i++) p.set(24 + i, 31 - (i >> 1), mixHex(mid, hi, 0.6));
  const url = toUrl(p);
  frames.set(state, url);
  return url;
}
let chainU = '';
function chainUrl(): string {
  if (chainU) return chainU;
  const S = 34, p = new PixelCanvas(S, S); p.wrap = false;
  // two chains crossing the glass, a padlock hanging low right
  const link = (cx: number, cy: number, a: number) => {
    for (let t = 0; t < 12; t++) { const an = (t / 12) * Math.PI * 2; const x = Math.round(cx + Math.cos(an) * 2.6 * Math.cos(a) - Math.sin(an) * 1.4 * Math.sin(a)); const y = Math.round(cy + Math.cos(an) * 2.6 * Math.sin(a) + Math.sin(an) * 1.4 * Math.cos(a)); p.set(x, y, t < 6 ? 0xc8ccd0 : 0x6a6e74); }
  };
  for (let i = 0; i < 7; i++) { link(3 + i * 4.6, 4 + i * 4.4, 0.78); link(S - 4 - i * 4.6, 5 + i * 4.3, -0.78); }
  const lx = 22, ly = 20;
  for (let x = 0; x < 9; x++) for (let y = 0; y < 8; y++) p.set(lx + x, ly + 3 + y, y === 0 ? 0xd8b050 : x === 0 ? 0xc89a38 : x === 8 || y === 7 ? 0x5a3e10 : 0xa87a28);
  for (let y = 0; y < 4; y++) { p.set(lx + 1, ly + y, 0xb8bcc0); p.set(lx + 7, ly + y, 0x7a7e84); }
  for (let x = 2; x < 7; x++) p.set(lx + x, ly - 1, 0xb8bcc0);
  p.set(lx + 4, ly + 6, 0x1a1208); p.set(lx + 4, ly + 7, 0x1a1208);
  // outline the metal
  const src = new Uint8ClampedArray(p.data);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (src[(y * S + x) * 4 + 3]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < S && Y < S && src[(Y * S + X) * 4 + 3] > 0; });
    if (n) p.set(x, y, 0x0a0806);
  }
  chainU = toUrl(p);
  return chainU;
}
/**
 * The glass's burn-in under the tree: years of the same directory on the same phosphor have etched a
 * faint graph ruling, two great meshing gears (the institute's seal) and ghost register marks into it.
 * Drawn in whole art pixels (u css px each), very dim, under the pipes.
 */
function engrave(c: CanvasRenderingContext2D, W: number, H: number, u: number, seed: number) {
  const o = Math.max(1, Math.round(u));
  const dot = (x: number, y: number) => c.fillRect(Math.round(x / o) * o, Math.round(y / o) * o, o, o);
  // graph ruling: a dotted grid every 8 art px, a firmer line every 32
  c.fillStyle = 'rgba(70, 140, 90, 0.10)';
  for (let y = 0; y < H; y += 8 * o) for (let x = 0; x < W; x += 2 * o) dot(x, y);
  for (let x = 0; x < W; x += 8 * o) for (let y = 0; y < H; y += 2 * o) dot(x, y);
  c.fillStyle = 'rgba(80, 160, 100, 0.08)';
  for (let y = 0; y < H; y += 32 * o) c.fillRect(0, y, W, o);
  // the seal: two meshing gears with spokes, rings and teeth, faint amber burn
  const gear = (cx: number, cy: number, R: number, teeth: number, ph: number, a: number) => {
    c.fillStyle = `rgba(255, 176, 72, ${a})`;
    const ring = (r: number, step = 1.2) => { const n = Math.ceil((2 * Math.PI * r) / (o * step)); for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; dot(cx + Math.cos(t) * r, cy + Math.sin(t) * r); } };
    ring(R); ring(R * 0.93); ring(R * 0.42); ring(R * 0.16);
    for (let i = 0; i < teeth; i++) {
      const t0 = ph + (i / teeth) * Math.PI * 2, tw = (Math.PI / teeth) * 0.9;
      for (let r = R; r < R * 1.12; r += o) { dot(cx + Math.cos(t0) * r, cy + Math.sin(t0) * r); dot(cx + Math.cos(t0 + tw) * r, cy + Math.sin(t0 + tw) * r); }
      const r = R * 1.12, n = Math.max(2, Math.ceil((tw * r) / o));
      for (let k = 0; k <= n; k++) { const t = t0 + (tw * k) / n; dot(cx + Math.cos(t) * r, cy + Math.sin(t) * r); }
    }
    for (let s = 0; s < 6; s++) { const t = ph + (s / 6) * Math.PI * 2; for (let r = R * 0.16; r < R * 0.93; r += o) { dot(cx + Math.cos(t) * r - Math.sin(t) * o, cy + Math.sin(t) * r + Math.cos(t) * o); dot(cx + Math.cos(t) * r + Math.sin(t) * o, cy + Math.sin(t) * r - Math.cos(t) * o); } }
  };
  const R = Math.min(W, H) * 0.42;
  gear(W * 0.42, H * 0.52, R, 28, seed * 0.3, 0.06);
  gear(W * 0.42 + R * 1.9, H * 0.52 - R * 0.55, R * 0.62, 18, seed * 0.3 + 0.08, 0.045);
  // ghost register marks in the corners, scratches across the glass
  c.fillStyle = 'rgba(120, 200, 140, 0.10)';
  for (const [x, y, sx, sy] of [[2, 2, 1, 1], [W - 3, 2, -1, 1], [2, H - 3, 1, -1], [W - 3, H - 3, -1, -1]]) for (let k = 0; k < 10; k++) { dot(x + sx * k * o, y); dot(x, y + sy * k * o); }
  let s = (seed + 3) * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  c.fillStyle = 'rgba(200, 255, 210, 0.05)';
  for (let i = 0; i < 6; i++) { const x0 = rnd() * W, y0 = rnd() * H, len = 40 + rnd() * 200, t = (rnd() - 0.5) * 0.6; for (let k = 0; k < len; k += o) dot(x0 + k * Math.cos(t), y0 + k * Math.sin(t)); }
}
function toUrl(p: PixelCanvas) { const c = document.createElement('canvas'); c.width = p.w; c.height = p.h; c.getContext('2d')!.putImageData(p.toImageData(), 0, 0); return c.toDataURL(); }

// ================================================================== the screen
export function openTree(o: { onClose?: () => void; branch?: Branch } = {}) {
  if (cur) return;
  let bi = Math.max(0, BRANCHES.findIndex((b) => b.key === (o.branch ?? 'design')));
  let sel: TreeNode | null = null;
  const el = document.createElement('div');
  el.className = 'rt';
  el.innerHTML = `
    <div class="rt-crt" role="dialog" aria-label="Research tree">
      <div class="rt-tape" aria-hidden="true"><i></i></div>
      <div class="rt-glass">
        <header class="rt-head">
          <div class="rt-title"><b>Research directory</b><small>Meridian R-NET 7 · control room main computer</small></div>
          <nav class="rt-tabs"></nav>
        </header>
        <div class="rt-mid">
          <div class="rt-tree"><canvas class="rt-pipes"></canvas><div class="rt-nodes"></div></div>
          <aside class="rt-read" aria-live="polite"></aside>
        </div>
        <footer class="rt-foot">
          <div class="rt-pts"><b>0</b><span>points left</span></div>
          <div class="rt-plan"></div>
          <div class="rt-keys"></div>
        </footer>
      </div>
      <div class="rt-scan" aria-hidden="true"></div>
    </div>`;
  document.body.append(el);
  const $ = <T extends HTMLElement>(s: string) => el.querySelector(s) as T;
  const tabs = $('.rt-tabs'), tree = $('.rt-tree'), nodesEl = $('.rt-nodes'), pipes = $('.rt-pipes') as unknown as HTMLCanvasElement, read = $('.rt-read'), pts = $('.rt-pts'), planEl = $('.rt-plan'), keys = $('.rt-keys'), tape = $('.rt-tape');
  const key = (label: string, cls: string, fn: () => void, aria?: string) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rt-key ' + cls; b.innerHTML = `<span>${esc(label)}</span>`;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', fn);
    return b;
  };
  const undoB = key('Undo', 'undo', () => { if (unstage()) sfx('back', 0.6); else sfx('error', 0.5); }, 'Undo the last staged rank (Backspace)');
  const okB = key('Confirm', 'ok', () => confirm(), 'Confirm: spend the points (C)');
  const closeB = key('Close', 'close', () => close(), 'Close the screen (Esc)');
  keys.append(undoB, okB, closeB);

  // ---------------------------------------------------------------- layout (u = css px per art px)
  let u = 2;
  const layoutU = () => { const W = window.innerWidth, H = window.innerHeight; u = W >= 1180 && H >= 660 ? 2 : W >= 760 && H >= 520 ? 1.5 : 1; el.style.setProperty('--u', String(u)); };
  const COLW = 48, ROWU = 21, NODE = 34, GUT = 84;
  const pos = (n: TreeNode) => ({ x: (GUT + n.col * COLW) * u, y: (8 + n.row * ROWU) * u });
  const btns = new Map<string, HTMLButtonElement>();

  const paintTabs = () => {
    tabs.innerHTML = '';
    BRANCHES.forEach((b, i) => {
      const t = key(b.name, 'tab' + (i === bi ? ' on' : ''), () => { if (i !== bi) { bi = i; sfx('relay', 0.6); build(); } }, `${b.name} — ${b.sub}${i === bi ? ' (shown)' : ''}`);
      t.innerHTML = `<i>${esc(b.code)}</i><span>${esc(b.name)}</span>`;
      tabs.append(t);
    });
  };
  const build = () => {
    layoutU();
    paintTabs();
    const br = BRANCHES[bi].key;
    nodesEl.innerHTML = ''; btns.clear();
    const ns = treeNodes(br);
    let maxX = 0, maxY = 0;
    for (const L of treeLanes(br)) {
      const first = ns.filter((n) => n.row === L.row).sort((a, b) => a.col - b.col)[0];
      if (!first) continue;
      const p = pos(first);
      const lab = document.createElement('div');
      lab.className = 'rt-lane';
      lab.style.left = '0px'; lab.style.width = (p.x - 6 * u) + 'px'; lab.style.top = (p.y + (NODE / 2) * u - 9) + 'px';
      lab.innerHTML = `<span>${esc(L.label)}</span>`;
      nodesEl.append(lab);
    }
    for (const n of ns) {
      const p = pos(n);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rt-node';
      b.style.left = p.x + 'px'; b.style.top = p.y + 'px';
      b.innerHTML = `<img class="ic" alt="" src="${nodeIcon(n, iconResCss(ART * u))}"><img class="ch" alt="" src="${chainUrl()}"><em class="rk"></em>`;
      b.addEventListener('click', () => press(n));
      b.addEventListener('pointerenter', () => { select(n); sfx('tick', 0.3); });
      b.addEventListener('focus', () => select(n));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (unstage()) sfx('back', 0.6); });
      nodesEl.append(b); btns.set(n.key, b);
      maxX = Math.max(maxX, p.x + NODE * u); maxY = Math.max(maxY, p.y + NODE * u + 10 * u);
    }
    nodesEl.style.width = maxX + 8 * u + 'px'; nodesEl.style.height = maxY + 'px';
    pipes.width = Math.ceil(maxX + 8 * u); pipes.height = Math.ceil(maxY);
    pipes.style.width = pipes.width + 'px'; pipes.style.height = pipes.height + 'px';
    if (!sel || sel.branch !== br) sel = ns.find((n) => nodeState(n) === 'open') ?? ns[0] ?? null;
    paint();
    const f = sel && btns.get(sel.key);
    requestAnimationFrame(() => f?.focus({ preventScroll: true }));
  };
  // ---------------------------------------------------------------- state paint
  const paint = () => {
    const br = BRANCHES[bi].key;
    for (const n of treeNodes(br)) {
      const b = btns.get(n.key);
      if (!b) continue;
      const st = nodeState(n), r = rankOf(n), rp = rankPlanned(n);
      const look: NodeState | 'staged' = rp > r ? 'staged' : r >= n.ranks ? 'max' : r > 0 ? 'owned' : st;
      b.dataset.st = look;
      b.style.backgroundImage = `url(${frameUrl(look)})`;
      (b.querySelector('.rk') as HTMLElement).textContent = n.ranks > 1 ? `${rp}/${n.ranks}` : rp ? '1' : '0';
      b.classList.toggle('sel', sel === n);
      b.setAttribute('aria-label', `${n.title}: rank ${rp} of ${n.ranks}, ${st === 'open' ? `stage for ${n.costs[rp]} points` : st}`);
    }
    drawPipes();
    const left = pointsLeft();
    pts.innerHTML = `<b>${left}</b><span>point${left === 1 ? '' : 's'} left</span>`;
    const pl = staged();
    planEl.innerHTML = pl.length ? `<span>${pl.length} staged · ${pl.reduce((s, q) => s + q.cost, 0)} RP</span>` : `<span>nothing staged · ${researchPoints()} RP banked</span>`;
    undoB.disabled = !pl.length; okB.disabled = !pl.length;
    readout();
  };
  const drawPipes = () => {
    const c = pipes.getContext('2d')!;
    c.clearRect(0, 0, pipes.width, pipes.height);
    c.imageSmoothingEnabled = false;
    engrave(c, pipes.width, pipes.height, u, bi);
    const br = BRANCHES[bi].key;
    const W = Math.max(2, Math.round(3 * u));
    const segs: [number, number, number, number, number][] = [];
    const seg = (x0: number, y0: number, x1: number, y1: number, live: number) => {
      const vert = Math.abs(x0 - x1) < 0.5;
      segs.push(vert ? [x0 - W / 2, Math.min(y0, y1), W, Math.abs(y1 - y0), live] : [Math.min(x0, x1), y0 - W / 2, Math.abs(x1 - x0), W, live]);
    };
    for (const n of treeNodes(br)) for (const rk of n.req) {
      const m = treeNode(rk);
      if (!m || m.branch !== br) continue;
      const a = pos(m), b = pos(n), h = (NODE / 2) * u;
      const live = rankOf(m) > 0 ? 2 : rankPlanned(m) > 0 ? 1 : 0;
      if (m.row === n.row) seg(a.x + NODE * u, a.y + h, b.x, b.y + h, live);
      else if (m.col === n.col) { const down = n.row > m.row; seg(a.x + h, down ? a.y + NODE * u : a.y, b.x + h, down ? b.y : b.y + NODE * u, live); }
      else { const xm = b.x - 7 * u; seg(a.x + (m.col < n.col ? NODE * u : 0), a.y + h, xm, a.y + h, live); seg(xm, a.y + h, xm, b.y + h, live); seg(xm, b.y + h, b.x, b.y + h, live); }
    }
    const R = Math.round, o = Math.max(1, R(u));
    c.fillStyle = '#060402';
    for (const [x, y, w, h] of segs) c.fillRect(R(x) - o, R(y) - o, R(w) + 2 * o, R(h) + 2 * o);
    for (const [x, y, w, h, live] of segs) {
      c.fillStyle = live === 2 ? '#ffb848' : live === 1 ? '#d88a2a' : '#3e3222';
      c.fillRect(R(x), R(y), R(w), R(h));
      c.fillStyle = live === 2 ? '#fff0b8' : live === 1 ? '#ffc870' : '#5a4a32';
      if (w > h) c.fillRect(R(x), R(y), R(w), o); else c.fillRect(R(x), R(y), o, R(h));
    }
  };
  // ---------------------------------------------------------------- the teleprinter
  const readout = () => {
    const n = sel;
    if (!n) { read.innerHTML = ''; return; }
    const st = nodeState(n), r = rankOf(n), rp = rankPlanned(n);
    const status = st === 'max' ? (rp > r ? 'STAGED · confirm to spend' : 'COMPLETE · every rank owned')
      : st === 'open' ? `OPEN · press to stage rank ${ROMAN[rp + 1] ?? rp + 1} for ${n.costs[rp]} RP`
        : st === 'poor' ? `SHORT · needs ${n.costs[rp]} RP, ${pointsLeft()} left`
          : `LOCKED · needs ${missing(n)}`;
    const rn = researchFor(n, Math.min(n.ranks, rp + 1));
    const lines = n.gives.map((g, i) => `<li class="${i < r ? 'own' : i < rp ? 'stg' : ''}"><i>${ROMAN[i + 1] ?? i + 1}</i>${esc(g)}</li>`).join('');
    const where = n.branch === 'chip' || n.branch === 'limb' ? 'Fit it on the unit in the unit room.' : n.branch === 'design' ? 'Dress the unit in it in the unit room.' : 'Known on every new run.';
    read.innerHTML = `<div class="rd-h"><img src="${nodeIcon(n, iconResCss(56))}" alt=""><b>${esc(n.title)}</b></div>
      <div class="rd-r">rank ${rp}/${n.ranks}${rp < n.ranks ? ` · next ${n.costs[rp]} RP` : ''}</div>
      <div class="rd-s st-${st}">${esc(status)}</div>
      <ul class="rd-g">${lines}</ul>
      <p class="rd-d">${esc(n.desc || rn?.desc || '')}</p>
      <p class="rd-w">${esc(where)}</p>`;
  };
  const missing = (n: TreeNode) => {
    const need = n.req.map((k) => treeNode(k)).filter((m) => m && rankPlanned(m) < 1).map((m) => m!.title);
    const rn = researchFor(n, rankPlanned(n) + 1);
    for (const q of rn?.requires ?? []) { const m = treeNodes().find((t) => t.rn.includes(q)); if (m && rankPlanned(m) < 1 && !need.includes(m.title)) need.push(m.title); }
    return need.length ? need.join(', ') : 'an earlier node';
  };
  const select = (n: TreeNode) => { if (sel === n) return; sel = n; for (const [k, b] of btns) b.classList.toggle('sel', k === n.key); readout(); };
  const press = (n: TreeNode) => {
    select(n);
    if (stage(n.key)) { sfx('key', 0.9); const b = btns.get(n.key); b?.classList.remove('pop'); void b?.offsetWidth; b?.classList.add('pop'); }
    else { sfx('error', 0.5); const b = btns.get(n.key); b?.classList.remove('deny'); void b?.offsetWidth; b?.classList.add('deny'); }
  };
  const confirm = () => {
    const done = confirmPlan();
    if (!done.length) { sfx('error', 0.5); return; }
    sfx('stamp'); setTimeout(() => sfx('relay', 0.7), 160);
    tape.classList.remove('punch'); void tape.offsetWidth; tape.classList.add('punch');
    for (const k of done) { const b = btns.get(k); b?.classList.remove('done'); void b?.offsetWidth; b?.classList.add('done'); }
  };

  const unsub = onPlan(() => paint());
  const onKey = (e: KeyboardEvent) => {
    if (!cur || cur.el !== el) return;
    if (e.key === 'Backspace' || e.key === 'z' || e.key === 'Z') { e.preventDefault(); e.stopPropagation(); if (unstage()) sfx('back', 0.6); }
    else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); e.stopPropagation(); confirm(); }
  };
  window.addEventListener('keydown', onKey, true);
  const onResize = () => build();
  window.addEventListener('resize', onResize);
  const nav = new FocusNav(el, { onBack: () => close(), onTab: (d) => { bi = (bi + d + BRANCHES.length) % BRANCHES.length; sfx('relay', 0.6); sel = null; build(); } });
  const close = () => {
    if (!cur || cur.el !== el) return;
    cur = null;
    clearPlan();
    unsub();
    nav.destroy();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    el.classList.remove('on');
    sfx('back');
    setTimeout(() => el.remove(), 260);
    o.onClose?.();
  };
  cur = { el, nav, close };
  build();
  tree.scrollLeft = 0;
  requestAnimationFrame(() => el.classList.add('on'));
  sfx('boot', 0.6);
  if (import.meta.env.DEV) (window as any).__tree = { stage, unstage, confirm, select: (k: string) => { const n = treeNode(k); if (n) { bi = BRANCHES.findIndex((b) => b.key === n.branch); sel = n; build(); } }, branch: (i: number) => { bi = i; sel = null; build(); } };
}

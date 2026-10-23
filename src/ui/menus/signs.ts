// HANGING SIGNS: the menu buttons are pixel-art sign boards (weathered
// planks or rusty enamel tin) hung on two chains from an iron bracket or a
// hook. They swing like pendulums: they sway in when the menu shows, swing
// when you hover, focus or press them, settle with damping, and the eye
// bolts creak at the ends of a big swing. The board is drawn once at low
// resolution (lettering painted on in Pixelify Sans, worn), and every frame
// it moves it is rotated on the art-pixel grid (nearest sampling, like a
// hand-rotated sprite) together with its chains, so it stays crisp pixel art
// at a whole number of device pixels per art pixel. Each sign is a real
// <button>: keyboard, gamepad (FocusNav) and touch work as before.
import { PixelCanvas, mixHex, bayer } from '../../gfx/pixel';
import { fontsReady } from '../../gfx/crt';
import { kitScale, shortView, strSeed } from './btnKit';
import { sfx, type Sfx } from './sfx';
import { calm } from './settings';
import './kit.css';

export type SignKind = 'wood' | 'tin' | 'red' | 'cream' | 'olive';
export type SignShape = 'board' | 'arrowL' | 'arrowR';
export type SignHang = 'bracketL' | 'bracketR' | 'hook';
export interface SignOpts {
  kind?: SignKind; shape?: SignShape; size?: 'lg' | 'md' | 'sm';
  hang?: SignHang;
  /** board width in art px at least */
  minW?: number;
  /** a painted chevron (arrow boards) */
  chevron?: boolean;
  sound?: Sfx | ''; aria?: string; seed?: number; pointer?: boolean; cls?: string;
  /** chain length in art px */
  chain?: number;
}
export type HangSign = HTMLButtonElement & {
  setLabel: (l: string) => void;
  /** add angular velocity (rad/s) */
  kick: (w: number) => void;
  /** swing in from an angle after a delay */
  swayIn: (delayMs: number, amp?: number) => void;
  paint: () => void;
  /** set the board width (art px) so a column of signs lines up */
  setBoardW: (w: number) => void;
  /** the board width the label needs (art px) */
  needW: () => number;
};

const K = 0x0a0806;
const WOOD = [K, 0x1c1009, 0x332013, 0x4c311c, 0x654227, 0x7e5634, 0x9a6e46];
const TIN: Record<string, number[]> = {
  tin: [K, 0x12161a, 0x1e252b, 0x2b343c, 0x3a4550, 0x4f5d69, 0x76858f],
  red: [K, 0x220806, 0x3e0f0b, 0x5e1912, 0x7e2619, 0xa03a26, 0xcc6644],
  olive: [K, 0x161a10, 0x252c1b, 0x37402a, 0x4b5638, 0x66734d, 0x93a078],
  cream: [K, 0x463b2a, 0x76684c, 0xa39477, 0xc0b190, 0xd8ccaa, 0xf2e8cc],
};
const PAINT: Record<SignKind, [number, number]> = { wood: [0xe9dcbc, 0xfff3d2], tin: [0xe6dcc4, 0xfff6dc], red: [0xf4e6cc, 0xffffff], olive: [0xe9e0c4, 0xfff8dc], cream: [0x2a1d10, 0x120a04] };
const IRON = { hi: 0x9a9a92, mid: 0x5a5a56, lo: 0x2c2c2a };
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; };
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ lettering
const FONT_PX = 11; // Pixelify Sans: one font pixel = one art pixel at 11px
let fontOk = false;
const fontWait = fontsReady().then(() => { fontOk = true; });
const measureCv = document.createElement('canvas').getContext('2d')!;
function textW(s: string): number {
  measureCv.font = `${FONT_PX}px 'Pixelify Sans', monospace`;
  try { (measureCv as any).letterSpacing = '1px'; } catch { /* old canvas */ }
  return Math.ceil(measureCv.measureText(s).width);
}
/** the label as hard pixels: a mask (1 = paint) w x h */
function textMask(s: string, w: number, h: number): Uint8Array {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.font = `${FONT_PX}px 'Pixelify Sans', monospace`;
  try { (g as any).letterSpacing = '1px'; } catch { /* old canvas */ }
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.fillText(s, 0, h - 2);
  const d = g.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 100 ? 1 : 0;
  return m;
}

// ------------------------------------------------------------------ the board sprite (unrotated)
interface BoardArt { w: number; h: number; px: Uint32Array /* 0 = empty, else 0xff000000 | rgb */; eyes: [number, number][] }
function boardArt(label: string, kind: SignKind, shape: SignShape, w: number, h: number, seed: number, st: 0 | 1 | 2, chevron: boolean): BoardArt {
  const px = new Uint32Array(w * h);
  const rnd = rng(seed);
  const pt = Math.floor(h / 2);
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (shape === 'arrowL' && x < pt && Math.abs(y - (h - 1) / 2) > x + 0.5) return false;
    if (shape === 'arrowR' && (w - 1 - x) < pt && Math.abs(y - (h - 1) / 2) > (w - 1 - x) + 0.5) return false;
    // knocked corners
    if (shape !== 'arrowL' && x === 0 && (y === 0 || y === h - 1)) return false;
    if (shape !== 'arrowR' && x === w - 1 && (y === 0 || y === h - 1)) return false;
    return true;
  };
  const edge = (x: number, y: number) => !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
  const put = (x: number, y: number, c: number) => { if (x >= 0 && y >= 0 && x < w && y < h && px[y * w + x]) px[y * w + x] = 0xff000000 | c; };
  const lift = st === 1 ? 0.1 : st === 2 ? -0.1 : 0;
  const tone = (R: number[], v: number, x: number, y: number) => { const f = 1.5 + Math.max(0, Math.min(1, v + lift)) * 4.4; let i = Math.floor(f); const fr = f - i; if (fr > 0.66 || (fr > 0.4 && bayer(x, y) < (fr - 0.4) / 0.26)) i++; return R[Math.max(1, Math.min(6, i))]; };
  if (kind === 'wood') {
    const planks = h >= 14 ? 2 : 1;
    const seam = Math.round(h / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      let c: number;
      if (edge(x, y)) c = K;
      else if (planks === 2 && y === seam) c = WOOD[1];
      else {
        const p = planks === 2 && y > seam ? 1 : 0;
        const py = p ? y - seam - 1 : y - 1, ph = p ? h - seam - 2 : seam - 1;
        // grain streaks run along the plank, knots here and there
        const g = Math.sin(x * 0.21 + hash(p, 1, seed) * 9 + Math.sin(x * 0.07 + p) * 2 + py * 1.7);
        let v = 0.5 + g * 0.09 + (hash(x >> 2, y, seed + p) - 0.5) * 0.12 - p * 0.04;
        if (py === 0) v += 0.2; else if (py === ph - 1) v -= 0.22;
        const kx = 6 + Math.floor(hash(p, 7, seed) * (w - 12)), ky = 1 + Math.floor(ph / 2);
        if (Math.abs(x - kx) <= 1 && py === ky) v -= 0.35;
        if ((x - kx) ** 2 / 9 + (py - ky) ** 2 < 2.2 && !(Math.abs(x - kx) <= 1 && py === ky)) v -= 0.1;
        if (x <= 1 || x >= w - 2) v -= 0.08;
        c = tone(WOOD, v, x, y);
      }
      px[y * w + x] = 0xff000000 | c;
    }
    // nail heads at the plank ends, iron corner caps
    const nail = (x: number, y: number) => { put(x, y, IRON.hi); put(x + 1, y + 1, IRON.lo); };
    for (let p = 0; p < planks; p++) { const y = p ? seam + Math.floor((h - seam) / 2) - 1 : Math.floor(seam / 2) - (planks === 1 ? 0 : 1); nail(3, y); nail(w - 5, y); }
    const cap = (x: number, y: number, dx: number, dy: number) => {
      for (let i = 0; i < 4; i++) { put(x + dx * i, y, i === 0 ? IRON.mid : IRON.hi); put(x, y + dy * i, IRON.mid); }
      put(x + dx, y + dy, IRON.lo);
    };
    if (shape === 'board') { cap(1, 1, 1, 1); cap(w - 2, 1, -1, 1); cap(1, h - 2, 1, -1); cap(w - 2, h - 2, -1, -1); }
  } else {
    const R = TIN[kind];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      let c: number;
      if (edge(x, y)) c = K;
      else if (!inside(x, y - 2) || !inside(x - 2, y)) c = R[st === 2 ? 2 : 5];           // the rolled edge, lit
      else if (!inside(x, y + 2) || !inside(x + 2, y)) c = R[st === 2 ? 4 : 1];
      else {
        let v = 0.58 - 0.3 * (y / h) + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.08;
        if (hash(x, y, seed + 3) > 0.97) v += 0.08;
        c = tone(R, v, x, y);
      }
      px[y * w + x] = 0xff000000 | c;
    }
    // chipped enamel and rust runs
    for (let i = 0; i < Math.round(w / 9); i++) {
      const x = 3 + Math.floor(rnd() * (w - 6)), top = rnd() < 0.5, y = top ? 2 : h - 3;
      put(x, y, 0x8a5a32); put(x + 1, y, 0x6a3a1a);
      if (rnd() < 0.6) for (let k = 1; k < 3 + Math.floor(rnd() * 3); k++) put(x, y + (top ? k : -k), mixHex(0x7a3a18, R[3], k * 0.25));
    }
  }
  // the eye bolts the chains go through
  const ey = 2;
  const eyes: [number, number][] = shape === 'board' ? [[4, ey], [w - 5, ey]] : shape === 'arrowL' ? [[pt + 2, ey], [w - 5, ey]] : [[4, ey], [w - pt - 3, ey]];
  for (const [x, y] of eyes) { put(x, y, K); put(x - 1, y, IRON.hi); put(x + 1, y, IRON.lo); put(x, y - 1, IRON.hi); put(x, y + 1, IRON.lo); }
  // the lettering (or a big painted chevron), painted on and worn
  const [ink, inkHot] = PAINT[kind];
  const paint = st === 1 ? inkHot : ink;
  const shadowCol = kind === 'cream' ? TIN.cream[5] : kind === 'wood' ? WOOD[1] : TIN[kind][1];
  // one paint mask (the chevron or the label), then a darker lip under the strokes, then the paint with flakes missing
  const mask = new Uint8Array(w * h);
  if (chevron && shape !== 'board') {
    const dir = shape === 'arrowL' ? -1 : 1;
    const cx = Math.floor(w / 2) + dir * Math.floor(pt / 3), cy = (h - 1) / 2, arm = Math.floor(h * 0.3);
    for (let t = 0; t <= arm; t++) for (let k = 0; k < 3; k++) {
      const x = cx + dir * (arm - t) - dir * k;
      for (const y of [Math.floor(cy - t), Math.ceil(cy + t)]) if (inside(x, y) && !edge(x, y)) mask[y * w + x] = 1;
    }
  } else if (label) {
    const tw = textW(label), th = 12;
    const m = textMask(label, tw + 2, th);
    const ox = shape === 'arrowL' ? Math.floor(pt + (w - pt - tw) / 2) : shape === 'arrowR' ? Math.floor((w - pt - tw) / 2) : Math.floor((w - tw) / 2);
    const oy = Math.floor((h - th) / 2) + 1;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw + 2; x++) {
      const X = ox + x, Y = oy + y;
      if (m[y * (tw + 2) + x] && X >= 0 && Y >= 0 && X < w && Y < h) mask[Y * w + X] = 1;
    }
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] && !mask[(y + 1) * w + x]) put(x, y + 1, shadowCol);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    const flake = hash(x, y, seed + 9);
    if (flake < 0.07) continue;
    put(x, y, flake > 0.95 ? mixHex(paint, shadowCol, 0.35) : paint);
  }
  return { w, h, px, eyes };
}

// ------------------------------------------------------------------ the swinging render
interface Geo { W: number; H: number; bx: number; by: number; bw: number; bh: number; pivX: number; pivY: number; hang: SignHang }
function drawFrame(pc: PixelCanvas, g: Geo, art: BoardArt, theta: number, seed: number) {
  pc.clear();
  const { W, pivX, pivY } = g;
  // the bracket (or a hook from above)
  if (g.hang === 'hook') {
    for (let x = pivX - 3; x <= pivX + 3; x++) { pc.set(x, 0, IRON.mid); pc.set(x, 1, IRON.lo); }
    pc.set(pivX - 3, 0, K); pc.set(pivX + 3, 0, K);
    pc.set(pivX, 2, IRON.hi); pc.set(pivX, 3, IRON.mid);
  } else {
    const left = g.hang === 'bracketL';
    const x0 = left ? 0 : pivX - 2, x1 = left ? pivX + 2 : W - 1;
    for (let x = x0; x <= x1; x++) { pc.set(x, 0, K); pc.set(x, 1, IRON.hi); pc.set(x, 2, IRON.lo); pc.set(x, 3, K); }
    // the wall plate with two rivets, a scroll brace under the arm
    const wx = left ? 0 : W - 3;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) pc.set(wx + x, y, x === (left ? 2 : 0) || y === 7 ? K : y === 0 ? IRON.hi : IRON.mid);
    pc.set(wx + 1, 2, IRON.hi); pc.set(wx + 1, 5, IRON.hi);
    const dir = left ? 1 : -1;
    for (let i = 0; i < 6; i++) { const x = (left ? 3 : W - 4) + dir * i, y = 6 - Math.round(i * 0.8); pc.set(x, y, IRON.mid); pc.set(x, y + 1, K); }
    // hook
    pc.set(pivX, 4, IRON.hi); pc.set(pivX + 1, 4, K); pc.set(pivX, 5, IRON.mid);
  }
  const c = Math.cos(theta), s = Math.sin(theta);
  const rot = (x: number, y: number): [number, number] => { const dx = x - pivX, dy = y - pivY; return [pivX + dx * c - dy * s, pivY + dx * s + dy * c]; };
  // chains: alternating links from the hook to each eye bolt
  for (const [ex, ey] of art.eyes) {
    const [ax, ay] = rot(g.bx + ex + 0.5, g.by + ey + 0.5);
    const n = Math.max(2, Math.ceil(Math.hypot(ax - pivX, ay - pivY)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = Math.round(pivX + (ax - pivX) * t), y = Math.round(pivY + (ay - pivY) * t);
      pc.set(x, y, i % 2 ? IRON.hi : IRON.lo);
      if (i % 2) pc.blend(x + 1, y, 0x000000, 0.5);
    }
  }
  // the board and its shadow, inverse-mapped (nearest) so every art pixel stays a pixel
  const { bx, by, bw, bh } = g;
  const reach = Math.ceil(Math.hypot(Math.max(bx + bw - pivX, pivX - bx), by + bh - pivY)) + 2;
  const y0 = Math.max(0, pivY), y1 = Math.min(pc.h - 1, pivY + reach), x0 = Math.max(0, pivX - reach), x1 = Math.min(pc.w - 1, pivX + reach);
  const sample = (x: number, y: number) => {
    const dx = x + 0.5 - pivX, dy = y + 0.5 - pivY;
    const u = Math.floor(pivX + dx * c + dy * s - bx), v = Math.floor(pivY - dx * s + dy * c - by);
    if (u < 0 || v < 0 || u >= art.w || v >= art.h) return 0;
    return art.px[v * art.w + u];
  };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (sample(x - 1, y - 2)) pc.blend(x, y, 0x000000, 0.55);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = sample(x, y);
    if (p) pc.set(x, y, p & 0xffffff);
  }
  void seed;
}

// ------------------------------------------------------------------ physics loop (one for every live sign)
interface Live { sign: HangSign; theta: number; omega: number; wait: number; lastSign: number; creakAt: number; drawn: number; step: (dt: number) => void }
const lives = new Set<Live>();
let raf = 0, lastT = 0;
function loop(now: number) {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0.001, (now - (lastT || now)) / 1000));
  lastT = now;
  for (const l of [...lives]) {
    if (!l.sign.isConnected) { lives.delete(l); continue; }
    l.step(dt);
  }
  if (lives.size) raf = requestAnimationFrame(loop); else lastT = 0;
}
function wake(l: Live) { lives.add(l); if (!raf) { lastT = 0; raf = requestAnimationFrame(loop); } }

const SIZES = { lg: { bh: 16, chain: 4 }, md: { bh: 14, chain: 4 }, sm: { bh: 13, chain: 3 } };

export function hangSign(label: string, onClick: (b: HangSign) => void, o: SignOpts = {}): HangSign {
  const kind = o.kind ?? 'wood', shape = o.shape ?? 'board', size = o.size ?? 'md', hang = o.hang ?? 'bracketL';
  const b = document.createElement('button') as HangSign;
  b.type = 'button';
  b.className = `hs hs-${kind}${o.pointer ? ' hs-ptr' : ''}${o.cls ? ' ' + o.cls : ''}`;
  const canvas = document.createElement('canvas'); canvas.className = 'hs-cv';
  const lab = document.createElement('span'); lab.className = 'hs-l';
  b.append(canvas, lab);
  if (o.aria) b.setAttribute('aria-label', o.aria);
  const seed = o.seed ?? strSeed(label + kind);
  let text = label;
  let boardW = 0;
  let geo: Geo | null = null;
  let arts: BoardArt[] = [];
  let pc: PixelCanvas | null = null;
  let state: 0 | 1 | 2 = 0;
  const needW = () => {
    const sz = SIZES[size];
    const tw = o.chevron ? sz.bh + 6 : textW(text.toUpperCase());
    return Math.max(o.minW ?? 0, tw + (shape === 'board' ? 16 : 14 + Math.floor(sz.bh / 2)));
  };
  const L: Live = {
    sign: b, theta: 0, omega: 0, wait: 0, lastSign: 0, creakAt: 0, drawn: NaN,
    step: (dt: number) => {
      if (L.wait > 0) { L.wait -= dt * 1000; if (L.wait > 0) return; }
      if (b.classList.contains('hs-hold')) { b.classList.remove('hs-hold'); sfx('chain', 0.5); }
      // a damped pendulum (a little stiffer than gravity alone: the chains are short)
      const k = 34, damp = 1.7;
      L.omega += (-k * Math.sin(L.theta) - damp * L.omega) * dt;
      L.theta += L.omega * dt;
      if (Math.abs(L.theta) > 0.42) { L.theta = Math.sign(L.theta) * 0.42; L.omega *= -0.3; }
      const sg = Math.sign(L.omega);
      if (sg && sg !== L.lastSign) {
        if (Math.abs(L.theta) > 0.07 && performance.now() - L.creakAt > 380) { L.creakAt = performance.now(); sfx('creak', Math.min(1, Math.abs(L.theta) * 2.6)); }
        L.lastSign = sg;
      }
      if (Math.abs(L.theta) < 0.0015 && Math.abs(L.omega) < 0.01) { L.theta = 0; L.omega = 0; render(); lives.delete(L); return; }
      render();
    },
  };
  const render = () => {
    if (!geo || !pc || !arts.length) return;
    const th = calm() ? 0 : Math.round(L.theta * 400) / 400;
    if (th === L.drawn && arts[state] === (render as any).lastArt) return;
    L.drawn = th; (render as any).lastArt = arts[state];
    drawFrame(pc, geo, arts[state], th, seed);
    canvas.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  };
  const build = () => {
    if (!b.isConnected) return;
    const s = kitScale();
    const sz = SIZES[size];
    const bh = shortView() ? sz.bh + 2 : sz.bh;
    const chain = o.chain ?? sz.chain;
    const bw = Math.max(boardW, needW());
    const top = hang === 'hook' ? 4 : 6;
    const mx = Math.ceil((chain + bh) * 0.36) + 2;
    const W = bw + 2 * mx + (hang === 'hook' ? 0 : 0), H = top + chain + bh + 4;
    const pivX = Math.floor(W / 2), pivY = top - 1;
    geo = { W, H, bx: mx, by: top + chain, bw, bh, pivX, pivY, hang };
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
    b.style.width = W * s + 'px'; b.style.height = H * s + 'px';
    b.style.setProperty('--hs-cy', (top + chain + bh / 2) * s + 'px');
    b.style.setProperty('--hs-bx', mx * s + 'px');
    pc = new PixelCanvas(W, H); pc.wrap = false;
    arts = [0, 1, 2].map((st) => boardArt(text.toUpperCase(), kind, shape, bw, bh, seed, st as 0 | 1 | 2, !!o.chevron));
    L.drawn = NaN;
    render();
  };
  b.paint = build;
  b.setLabel = (l: string) => { text = l; lab.textContent = l; if (!o.aria) b.setAttribute('aria-label', l); build(); };
  b.setBoardW = (w: number) => { if (w !== boardW) { boardW = w; build(); } };
  b.needW = needW;
  b.kick = (w: number) => { if (calm()) return; L.omega += w; wake(L); };
  b.swayIn = (delayMs: number, amp = 0.34) => {
    if (calm()) return;
    L.theta = (seed % 2 ? 1 : -1) * amp; L.omega = 0; L.wait = delayMs;
    b.classList.add('hs-hold');
    wake(L);
  };
  const setState = (st: 0 | 1 | 2) => { if (st !== state) { state = st; L.drawn = NaN; render(); } };
  const hot = () => setState(document.activeElement === b || b.matches(':hover') ? 1 : 0);
  b.addEventListener('pointerenter', (e) => {
    if (b.disabled) return;
    if (e.pointerType === 'mouse') {
      const a = document.activeElement as HTMLElement | null;
      if (!(a && ((a.tagName === 'INPUT' && (a as HTMLInputElement).type === 'text') || a.tagName === 'TEXTAREA')) && a !== b) b.focus({ preventScroll: true });
    }
    b.kick((e.offsetX < b.offsetWidth / 2 ? 1 : -1) * 1.3);
    sfx('chain', 0.6);
    hot();
  });
  b.addEventListener('pointerleave', hot);
  b.addEventListener('focus', () => { hot(); if (!b.matches(':hover')) b.kick((Math.random() < 0.5 ? -1 : 1) * 0.9); });
  b.addEventListener('blur', hot);
  b.addEventListener('pointerdown', () => setState(2));
  b.addEventListener('pointerup', hot);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    setState(2);
    setTimeout(hot, 140);
    b.kick((L.omega >= 0 ? 1 : -1) * 2.6);
    if (o.sound !== '') sfx(o.sound ?? 'plate');
    sfx('chain');
    onClick(b);
  });
  lab.textContent = label;
  if (!o.aria) b.setAttribute('aria-label', label);
  const ro = new ResizeObserver(() => { if (b.isConnected && !geo) build(); });
  ro.observe(b);
  let lastS = 0;
  window.addEventListener('resize', () => { const s = kitScale(); if (s !== lastS && b.isConnected) { lastS = s; build(); } });
  requestAnimationFrame(() => { lastS = kitScale(); build(); });
  if (!fontOk) fontWait.then(() => build());
  return b;
}

/** give a set of signs one common board width (the widest label) */
export function alignSigns(signs: HangSign[], minW = 0) {
  const w = Math.max(minW, ...signs.map((s) => s.needW()));
  for (const s of signs) s.setBoardW(w);
}

/** the iron post a column of signs is bolted to: drawn to fit its box (art px wide 5) */
export function signPost(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hs-post';
  const cv = document.createElement('canvas');
  el.append(cv);
  let last = '';
  const draw = () => {
    if (!el.isConnected) return;
    const s = kitScale();
    const H = Math.max(8, Math.floor(el.getBoundingClientRect().height / s)), W = 6;
    const k = H + '|' + s;
    if (k === last) return;
    last = k;
    cv.width = W; cv.height = H;
    cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
    el.style.width = W * s + 'px';
    const pc = new PixelCanvas(W, H); pc.wrap = false;
    const col = [K, 0x8a8a84, 0x5a5a56, 0x3e3e3a, 0x262624, K];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = col[x];
      if (x > 0 && x < W - 1 && hash(x, y >> 1, 21) < 0.06) c = 0x6a3414;          // rust
      if (x > 0 && x < W - 1 && (y % 23 === 0 || y % 23 === 1)) c = y % 23 ? 0x2a2a28 : 0xb0b0a8; // collar joints
      pc.set(x, y, c);
    }
    for (let y = 0; y < H; y += 23) for (let x = 0; x < W; x++) pc.set(x, y + 2, K);
    cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  };
  new ResizeObserver(draw).observe(el);
  window.addEventListener('resize', () => { last = ''; draw(); });
  return el;
}

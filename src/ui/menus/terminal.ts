// The green phosphor terminal: a bulky olive enamel housing with a beige
// face plate around the tube, drawn as pixel art in code at the size it is
// shown (whole device pixels per art pixel), with screws, vents, a speaker
// grille, toggle switches, a power lamp, a paper inventory sticker and a
// life's worth of chips, scratches and grime. The screen is real DOM: crisp
// Space Grotesk glowing green on the glass, scanlines, no boxes around text.
// Plate keys (btnKit) sit on the housing's lower strip.
import { PixelCanvas, mixHex, bayer } from '../../gfx/pixel';
import { kitScale, artH, strSeed } from './btnKit';
import { uiSettings, calm } from './settings';
import { sfx } from './sfx';
import './kit.css';

const K = 0x0a0806;
const OLIVE = [K, 0x141810, 0x22281a, 0x333b27, 0x465036, 0x5c6847, 0x84916a];
const BEIGE = [K, 0x4a4030, 0x7a6c52, 0xa3967a, 0xbcb092, 0xd4c9aa, 0xeee4c8];
const STEEL = [K, 0x121518, 0x1f2428, 0x2d343a, 0x3e474e, 0x56616a, 0x8a969e];
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; };
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export interface Bezel { T: number; S: number; B: number; keysW: number }

/** paint the housing into pc (W x H art px). Returns the screen rect. */
function drawHousing(pc: PixelCanvas, W: number, H: number, bz: Bezel, seed: number, o: { lamp?: boolean; compact?: boolean }) {
  const rnd = rng(seed);
  const cw = W - 2, ch = H - 2; // casing (the last 2 px are the drop shadow)
  const c = Math.max(4, Math.round(Math.min(cw, ch) * 0.04));
  const inCase = (x: number, y: number) => x >= 0 && y >= 0 && x < cw && y < ch && !(x + y < c || (cw - 1 - x) + y < c || x + (ch - 1 - y) < c || (cw - 1 - x) + (ch - 1 - y) < c);
  // the drop shadow
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (inCase(x, y)) pc.blend(x + 2, y + 2, 0x000000, 0.7);
  // the screen and the face plate around it
  const sx = bz.S, sy = bz.T, sw = cw - bz.S * 2, sh = ch - bz.T - bz.B;
  const fp = 5; // beige face plate width
  const inFace = (x: number, y: number) => x >= sx - fp && y >= sy - fp && x < sx + sw + fp && y < sy + sh + fp
    && !((x - (sx - fp)) + (y - (sy - fp)) < 3 || ((sx + sw + fp - 1) - x) + (y - (sy - fp)) < 3 || (x - (sx - fp)) + ((sy + sh + fp - 1) - y) < 3 || ((sx + sw + fp - 1) - x) + ((sy + sh + fp - 1) - y) < 3);
  const inScr = (x: number, y: number) => x >= sx && y >= sy && x < sx + sw && y < sy + sh && !((x - sx) + (y - sy) < 2 || ((sx + sw - 1) - x) + (y - sy) < 2 || (x - sx) + ((sy + sh - 1) - y) < 2 || ((sx + sw - 1) - x) + ((sy + sh - 1) - y) < 2);
  const ring = (inside: (x: number, y: number) => boolean, x: number, y: number, max: number) => {
    for (let d = 1; d <= max; d++) for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) if (Math.max(Math.abs(i), Math.abs(j)) === d && !inside(x + i, y + j)) return d - 1;
    return max;
  };
  const sideLit = (inside: (x: number, y: number) => boolean, x: number, y: number, d: number) => {
    const up = !inside(x, y - d), left = !inside(x - d, y), down = !inside(x, y + d), right = !inside(x + d, y);
    const sc = (up ? 1 : 0) + (left ? 1 : 0) - (down ? 1 : 0) - (right ? 1 : 0);
    return sc > 0 ? 1 : sc < 0 ? -1 : 0;
  };
  const tone = (R: number[], val: number, x: number, y: number) => { const f = 1.6 + Math.max(0, Math.min(1, val)) * 4.2; let i = Math.floor(f); if (f - i > bayer(x, y)) i++; return R[Math.max(1, Math.min(6, i))]; };
  const stripY = sy + sh + fp + 1; // where the lower control strip starts
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (!inCase(x, y)) continue;
    if (inScr(x, y)) { pc.set(x, y, 0x020603); continue; }
    if (inFace(x, y)) {
      // the beige face plate: raised outer edge, a slope down into the tube
      const ro = ring((a, b) => inFace(a, b), x, y, 3);
      const ri = ring((a, b) => !inScr(a, b), x, y, 3);
      let col: number;
      if (ri === 0) col = K;
      else if (ri === 1) { const l = sideLit((a, b) => !inScr(a, b), x, y, 2); col = l > 0 ? BEIGE[1] : l < 0 ? BEIGE[5] : BEIGE[2]; }
      else if (ri === 2) { const l = sideLit((a, b) => !inScr(a, b), x, y, 3); col = l > 0 ? BEIGE[2] : l < 0 ? BEIGE[4] : BEIGE[3]; }
      else if (ro === 0) col = K;
      else if (ro === 1) { const l = sideLit((a, b) => inFace(a, b), x, y, 1); col = l > 0 ? BEIGE[6] : l < 0 ? BEIGE[2] : BEIGE[4]; }
      else col = tone(BEIGE, 0.62 - 0.25 * ((y - sy) / Math.max(1, sh)) + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.08, x, y);
      pc.set(x, y, col);
      continue;
    }
    // the olive casing
    const near = x < 4 || y < 4 || x > cw - 5 || y > ch - 5 || x + y < c + 7 || (cw - 1 - x) + y < c + 7 || x + (ch - 1 - y) < c + 7 || (cw - 1 - x) + (ch - 1 - y) < c + 7;
    const r = near ? ring(inCase, x, y, 3) : 3;
    let col: number;
    if (r === 0) col = K;
    else if (r === 1) { const l = sideLit(inCase, x, y, 1); col = l > 0 ? OLIVE[6] : l < 0 ? OLIVE[1] : OLIVE[4]; }
    else if (r === 2) { const l = sideLit(inCase, x, y, 2); col = l > 0 ? OLIVE[5] : l < 0 ? OLIVE[2] : OLIVE[4]; }
    else {
      let val = 0.56 - 0.22 * (y / ch) + (hash(x >> 1, y >> 1, seed + 1) - 0.5) * 0.09;
      if (hash(x, y, seed + 2) > 0.975) val += 0.08;
      // the seam between the hood and the lower strip
      if (y === stripY) col = OLIVE[1];
      else if (y === stripY + 1) col = OLIVE[5];
      else col = tone(OLIVE, val - (y > stripY ? 0.06 : 0), x, y);
    }
    pc.set(x, y, col);
  }
  const put = (x: number, y: number, col: number) => { if (inCase(x, y) && !inScr(x, y)) pc.set(x, y, col); };
  const blendC = (x: number, y: number, col: number, t: number) => { if (inCase(x, y) && !inScr(x, y)) pc.blend(x, y, col, t); };
  const isOlive = (x: number, y: number) => inCase(x, y) && !inFace(x, y) && x > 3 && y > 3 && x < cw - 4 && y < ch - 4;

  // ---- screws in the corners (slotted)
  const screw = (x: number, y: number) => {
    const pat = ['.ab.', 'abbc', 'bbcc', '.cc.'];
    const cols: Record<string, number> = { a: 0xe0e6e4, b: 0x9aa2a4, c: 0x4a5256 };
    pat.forEach((r, j) => [...r].forEach((ch2, i) => { if (ch2 !== '.') put(x + i, y + j, cols[ch2]); }));
    put(x, y + 3, 0x2a3034); put(x + 1, y + 2, 0x2a3034); put(x + 2, y + 1, 0x2a3034); put(x + 3, y, 0x2a3034); // the slot
    blendC(x + 4, y + 2, 0, 0.4); blendC(x + 3, y + 4, 0, 0.4); blendC(x + 4, y + 3, 0, 0.4);
    // a rust run under it
    if (rnd() < 0.6) for (let k = 0; k < 2 + Math.floor(rnd() * 4); k++) blendC(x + 1 + (k > 2 ? 1 : 0), y + 4 + k, k < 2 ? 0x6a3412 : 0x4a220c, 0.5 - k * 0.07);
  };
  const m = Math.max(3, c - 1);
  screw(m, m); screw(cw - m - 4, m); screw(m, ch - m - 5); screw(cw - m - 4, ch - m - 5);

  // ---- vents along the hood (right half of the top bezel)
  if (bz.T >= 9) {
    const vy = 2 + Math.floor((bz.T - fp - 4) / 2);
    const vx0 = Math.round(cw * 0.6), vx1 = cw - m - 9;
    for (let x = vx0; x < vx1; x += 3) {
      for (let j = 0; j < 3; j++) { put(x, vy + j, K); put(x + 1, vy + j, OLIVE[1]); }
      put(x, vy + 3, OLIVE[5]); put(x + 1, vy + 3, OLIVE[5]);
      // grime dribbles from a few slots
      if (hash(x, 3, seed) > 0.72) for (let k = 0; k < 2 + Math.floor(hash(x, 4, seed) * 4); k++) blendC(x, vy + 4 + k, 0x0c0e08, 0.4 - k * 0.06);
    }
    // a stencilled hazard notch at the top left
    const hx = m + 8, hy = vy;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) put(hx + i, hy + j, ((i + j) >> 1) % 2 ? 0xd8b030 : 0x16140c);
    for (let i = -1; i <= 12; i++) { put(hx + i, hy - 1, K); put(hx + i, hy + 3, OLIVE[5]); }
  }

  // ---- the lower control strip: speaker grille, toggle switches, power lamp
  const by0 = stripY + 3, by1 = ch - 4;
  let tray: { x0: number; x1: number; y0: number; y1: number } | null = null;
  let name: { x0: number; x1: number; y0: number; y1: number } | null = null;
  const bh = by1 - by0;
  if (bh >= 6) {
    const mid = Math.floor((by0 + by1) / 2);
    // speaker grille: punched holes in a hex grid
    const gx0 = m + 7, gx1 = gx0 + Math.min(28, Math.round(cw * 0.12));
    for (let y = by0 + 1; y < by1 - 1; y += 2) for (let x = gx0 + ((y >> 1) & 1); x < gx1; x += 2) { put(x, y, K); put(x + 1, y + 1, OLIVE[5]); }
    // three bat-handle toggles in little stamped plates
    let tx = gx1 + 6;
    if (!o.compact) for (let t = 0; t < 3; t++) {
      const upT = hash(t, 9, seed) > 0.4;
      for (let j = -3; j <= 3; j++) for (let i = -2; i <= 3; i++) {
        const e = j === -3 || j === 3 || i === -2 || i === 3;
        put(tx + i, mid + j, e ? (j === -3 || i === -2 ? OLIVE[1] : OLIVE[5]) : OLIVE[2]);
      }
      // the bushing and the bat
      put(tx, mid, 0x9aa2a4); put(tx + 1, mid, 0x4a5256);
      const dir = upT ? -1 : 1;
      for (let k = 1; k <= 3; k++) { put(tx, mid + dir * k, k === 3 ? 0xe0e6e4 : 0xb8c0c2); put(tx + 1, mid + dir * k, 0x5a6266); }
      blendC(tx + 2, mid + dir * 2 + 1, 0, 0.4);
      tx += 9;
    }
    // the power lamp (square, green)
    const lx = tx + 2, ly = mid - 2;
    for (let i = -1; i <= 3; i++) { put(lx + i, ly - 1, OLIVE[1]); put(lx + i, ly + 3, OLIVE[5]); }
    for (let j = 0; j < 3; j++) { put(lx - 1, ly + j, OLIVE[1]); put(lx + 3, ly + j, OLIVE[5]); }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) put(lx + i, ly + j, o.lamp === false ? 0x0e1a10 : j === 0 && i === 0 ? 0xd8ffe0 : j === 2 ? 0x1a9a3a : 0x50ff80);
    if (o.lamp !== false) for (let j = -3; j <= 5; j++) for (let i = -3; i <= 5; i++) { if (i >= -1 && i <= 3 && j >= -1 && j <= 3) continue; blendC(lx + i, ly + j, 0x50ff80, 0.12); }
    // the recessed tray the keys sit in (right side)
    let trayX0 = cw - m - 9;
    if (bz.keysW > 0) {
      const kx1 = cw - m - 7, kx0 = Math.max(lx + 10, kx1 - bz.keysW);
      trayX0 = kx0;
      tray = { x0: kx0, x1: kx1, y0: by0 - 1, y1: by1 };
      for (let y = by0 - 1; y <= by1; y++) for (let x = kx0; x <= kx1; x++) {
        const e = y === by0 - 1 || x === kx0 ? STEEL[0] : y === by1 || x === kx1 ? OLIVE[5] : y === by0 || x === kx0 + 1 ? STEEL[1] : (hash(x >> 1, y, seed + 7) > 0.9 ? STEEL[3] : STEEL[2]);
        put(x, y, e);
      }
    }
    // a brass maker's plate between the lamp and the keys
    const nx0 = lx + 9, nx1 = trayX0 - 6;
    if (nx1 - nx0 >= 46 && bh >= 7) {
      const nh = Math.min(9, bh - 1), ny0 = mid - Math.floor(nh / 2);
      const BR = [K, 0x2c1e08, 0x553a10, 0x80601c, 0xa2802c, 0xc4a24a, 0xeed690];
      for (let j = 0; j < nh; j++) for (let i = 0; i <= nx1 - nx0; i++) {
        const x = nx0 + i, y = ny0 + j;
        const corner = (i === 0 || i === nx1 - nx0) && (j === 0 || j === nh - 1);
        if (corner) continue;
        const col = i === 0 || j === 0 || i === nx1 - nx0 || j === nh - 1 ? K : j === 1 ? BR[6] : j === nh - 2 ? BR[2] : i === 1 ? BR[5] : i === nx1 - nx0 - 1 ? BR[3] : (hash(x >> 2, y, seed + 13) > 0.93 ? BR[3] : (j < nh / 2 ? BR[5] : BR[4]));
        put(x, y, col);
      }
      for (const rx of [nx0 + 2, nx1 - 3]) { put(rx, mid - 1, 0xfff0c0); put(rx + 1, mid - 1, 0xa2802c); put(rx, mid, 0xa2802c); put(rx + 1, mid, 0x553a10); }
      for (let i = 1; i <= nx1 - nx0 + 1; i++) blendC(nx0 + i, ny0 + nh, 0, 0.45);
      for (let j = 1; j <= nh; j++) blendC(nx1 + 1, ny0 + j, 0, 0.45);
      name = { x0: nx0 + 5, x1: nx1 - 5, y0: ny0, y1: ny0 + nh - 1 };
    }
  }

  // ---- a paper inventory sticker on the hood, upper left of the face plate
  if (sw > 60 && bz.T >= 9) {
    const px0 = sx + Math.round(sw * 0.08), py0 = Math.max(2, sy - fp - 7);
    const pw = 16, ph = 5;
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      if ((i === pw - 1 && j === 0) || (i === 0 && j === ph - 1 && rnd() < 0.5)) continue;
      let col = hash(i, j, seed + 11) > 0.85 ? 0xcfc6a6 : 0xe4dcc0;
      if (j === 1 && i > 1 && i < pw - 3 && hash(i, 1, seed) > 0.3) col = 0x4a4a5a;
      if (j === 3 && i > 1 && i < pw - 6 && hash(i, 2, seed) > 0.4) col = 0x6a6a7a;
      if (j === 0 && i > 0 && i < 6) col = 0xb83a2a;
      put(px0 + i, py0 + j, col);
    }
    for (let i = 1; i <= pw; i++) blendC(px0 + i, py0 + ph, 0, 0.45);
  }

  // ---- wear: chipped paint at the edges, scratches, a dent
  const nChip = Math.round((cw + ch) / 9);
  for (let i = 0; i < nChip; i++) {
    const side = Math.floor(rnd() * 4);
    let x = side === 0 || side === 2 ? c + Math.floor(rnd() * (cw - 2 * c)) : side === 1 ? cw - 3 - Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
    let y = side === 1 || side === 3 ? c + Math.floor(rnd() * (ch - 2 * c)) : side === 0 ? 1 + Math.floor(rnd() * 2) : ch - 3 - Math.floor(rnd() * 2);
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      if (!inCase(x, y) || inFace(x, y)) continue;
      put(x, y, rnd() < 0.5 ? 0x9a9c92 : 0x7a7c74);
      if (side === 0) put(x, y + 1, OLIVE[1]); else if (side === 2) put(x, y - 1, OLIVE[1]);
      if (side === 0 || side === 2) x++; else y++;
    }
  }
  const nScr = Math.round((cw * ch) / 900);
  for (let i = 0; i < nScr; i++) {
    let x = 4 + Math.floor(rnd() * (cw - 8)), y = 4 + Math.floor(rnd() * (ch - 8));
    const dx = rnd() < 0.5 ? 1 : -1, len = 3 + Math.floor(rnd() * 6);
    for (let k = 0; k < len; k++) {
      if (isOlive(x, y) && rnd() > 0.2) put(x, y, mixHex(OLIVE[4], OLIVE[6], 0.6));
      else if (inFace(x, y) && !inScr(x, y) && rnd() > 0.3 && ring((a, b) => !inScr(a, b), x, y, 3) >= 3) put(x, y, BEIGE[2]);
      x += dx; if (k % 2) y++;
    }
  }
  // a dent in the hood, lower right
  if (cw > 80) {
    const dx0 = Math.round(cw * 0.82), dy0 = ch - Math.max(4, Math.round(bh / 2)) - 1;
    for (let j = -1; j <= 1; j++) for (let i = -3; i <= 3; i++) if (isOlive(dx0 + i, dy0 + j)) blendC(dx0 + i, dy0 + j, 0x000000, 0.22 - Math.abs(i) * 0.04);
    for (let i = -2; i <= 2; i++) if (isOlive(dx0 + i, dy0 + 2)) put(dx0 + i, dy0 + 2, OLIVE[5]);
  }
  return { sx, sy, sw, sh, stripY, tray, name };
}

// ------------------------------------------------------------------ the DOM terminal
export interface TermOpts {
  /** header line on the glass */
  title?: string; sub?: string;
  /** maker's plate text, engraved on the strip */
  model?: string;
  cls?: string;
  /** width (art px) reserved on the strip for plate keys */
  keysW?: number;
  /** no lower strip: a slim bezel all round */
  slim?: boolean;
  seed?: number;
  /** play the tube's power-on */
  powerOn?: boolean;
}
export interface Terminal {
  el: HTMLElement; screen: HTMLElement; head: HTMLElement; body: HTMLElement; keys: HTMLElement; plate: HTMLElement;
  setHead: (title: string, sub?: string) => void;
  paint: () => void;
  /** reserve more or less room on the strip for the keys */
  setKeysW: (w: number) => void;
}

export function terminal(o: TermOpts = {}): Terminal {
  const el = document.createElement('div');
  el.className = 'ct' + (o.cls ? ' ' + o.cls : '');
  const canvas = document.createElement('canvas'); canvas.className = 'ct-cv';
  const screen = document.createElement('div');
  screen.className = 'ct-scr' + (uiSettings().theme === 'amber' ? ' amber' : '');
  const inner = document.createElement('div'); inner.className = 'ct-in';
  const head = document.createElement('div'); head.className = 'ct-head';
  const body = document.createElement('div'); body.className = 'ct-body';
  inner.append(head, body);
  screen.append(inner);
  const plate = document.createElement('div'); plate.className = 'ct-plate';
  plate.textContent = o.model ?? 'Meridian · Type 4';
  const keys = document.createElement('div'); keys.className = 'ct-keys';
  el.append(canvas, screen, plate, keys);
  const seed = o.seed ?? strSeed((o.title || '') + (o.cls || ''));
  let keysW = o.keysW ?? 0;
  const setHead = (t: string, s = '') => {
    head.innerHTML = '';
    if (!t && !s) { head.hidden = true; return; }
    head.hidden = false;
    const b = document.createElement('b'); b.textContent = t;
    head.append(b);
    if (s) { const sm = document.createElement('small'); sm.textContent = s; head.append(sm); }
  };
  setHead(o.title || '', o.sub || '');
  let last = '';
  const paint = () => {
    if (!el.isConnected) return;
    const s = kitScale();
    const r = el.getBoundingClientRect();
    const W = Math.floor(r.width / s), H = Math.floor(r.height / s);
    if (W < 40 || H < 30) return;
    const keyH = artH('md');
    const kw = !o.slim && keys.children.length ? Math.ceil(keys.scrollWidth / s) + 7 : 0;
    const bz: Bezel = o.slim
      ? { T: 9, S: 8, B: 9, keysW: 0 }
      : { T: W > 150 ? 13 : 11, S: W > 150 ? 10 : 8, B: Math.max(keyH + 9, 15), keysW: Math.max(keysW, kw) };
    const k = `${W}|${H}|${s}|${bz.keysW}|${bz.B}`;
    if (k === last) return;
    last = k;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
    const pc = new PixelCanvas(W, H); pc.wrap = false;
    const g = drawHousing(pc, W, H, bz, seed, { compact: W < 130 });
    canvas.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
    // place the glass and the strip contents on the art grid
    Object.assign(screen.style, { left: g.sx * s + 'px', top: g.sy * s + 'px', width: g.sw * s + 'px', height: g.sh * s + 'px' });
    keys.hidden = !!o.slim;
    if (g.tray) Object.assign(keys.style, { top: (g.tray.y0 + 1) * s + 'px', height: (g.tray.y1 - g.tray.y0) * s + 'px', right: (W - g.tray.x1 + 2) * s + 'px', left: '' });
    else Object.assign(keys.style, { top: (g.stripY + 3) * s + 'px', height: (H - g.stripY - 7) * s + 'px', right: 14 * s + 'px' });
    plate.hidden = !!o.slim || !g.name;
    if (g.name) Object.assign(plate.style, { left: g.name.x0 * s + 'px', width: (g.name.x1 - g.name.x0 + 1) * s + 'px', top: g.name.y0 * s + 'px', height: (g.name.y1 - g.name.y0 + 1) * s + 'px' });
  };
  const ro = new ResizeObserver(() => { if (!el.isConnected) return; paint(); });
  ro.observe(el);
  ro.observe(keys);
  window.addEventListener('resize', () => { last = ''; paint(); });
  if (o.powerOn !== false && !calm()) {
    screen.classList.add('ct-boot');
    setTimeout(() => sfx('relay', 0.7), 30);
    setTimeout(() => screen.classList.remove('ct-boot'), 420);
  }
  return {
    el, screen, head, body, keys, plate, setHead, paint,
    setKeysW: (w: number) => { keysW = w; last = ''; paint(); },
  };
}

/** a line of phosphor text that types itself out, with keyboard clacks (instant under reduce-flash) */
export function teletype(el: HTMLElement, text: string, cps = 70): () => void {
  let stop = false;
  if (calm()) { el.textContent = text; return () => {}; }
  let i = 0, acc = 0, last = performance.now();
  el.textContent = '';
  const tick = (now: number) => {
    if (stop || !el.isConnected) return;
    acc += ((now - last) / 1000) * cps; last = now;
    const n = Math.floor(acc);
    if (n > 0) { acc -= n; i = Math.min(text.length, i + n); el.textContent = text.slice(0, i); if (text[i - 1] !== ' ') sfx('type', 0.35); }
    if (i < text.length) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { stop = true; el.textContent = text; };
}

/** an action line on the glass: "> LABEL" that brightens with a block cursor when focused */
export function crtAct(label: string, onClick: () => void, o: { danger?: boolean; sub?: string; cls?: string } = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ct-act' + (o.danger ? ' danger' : '') + (o.cls ? ' ' + o.cls : '');
  b.innerHTML = `<span class="ct-act-l"></span>${o.sub ? '<small></small>' : ''}`;
  (b.querySelector('.ct-act-l') as HTMLElement).textContent = label;
  if (o.sub) (b.querySelector('small') as HTMLElement).textContent = o.sub;
  b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== b) { const a = document.activeElement as HTMLElement | null; if (a && a.tagName === 'INPUT' && (a as HTMLInputElement).type === 'text') return; b.focus({ preventScroll: true }); sfx('type', 0.6); } });
  b.addEventListener('click', () => { sfx(o.danger ? 'back' : 'key'); onClick(); });
  return b;
}

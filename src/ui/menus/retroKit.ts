// Pixel-art parts for the subject room's front end, drawn once in code and
// installed as CSS images (--rk-*): a bakelite CRT cabinet, olive enamel
// switchboard steel, embossed label tape, typewriter paper, cream and red
// bakelite keys (up and down), a brass plate, Nixie tube cells, jewel lamps,
// porthole glass and the two big pink and blue push buttons. Everything on
// screen sits on one of these: there are no bare boxes.
import { PixelCanvas, bayer, mixHex } from '../../gfx/pixel';
import { toUrl } from '../pixelkit';

const K = 0x0a0806;
function canvas(w: number, h: number) { const pc = new PixelCanvas(w, h); pc.wrap = false; return pc; }
function inRound(x: number, y: number, w: number, h: number, r: number) {
  const cx = x < r ? r - 1 - x : x > w - 1 - r ? x - (w - r) : -1;
  const cy = y < r ? r - 1 - y : y > h - 1 - r ? y - (h - r) : -1;
  if (cx < 0 || cy < 0) return true;
  return cx * cx + cy * cy <= (r - 0.5) * (r - 0.5) + 0.5;
}
/** depth into a rounded rect (0 on the outline) */
function depth(x: number, y: number, w: number, h: number, r: number) {
  let d = 0;
  while (d < 16 && inRound(x - d - 1, y - d - 1, w - 2 * d - 2, h - 2 * d - 2, Math.max(1, r - d - 1))) d++;
  return d;
}
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000; };
function screw(pc: PixelCanvas, x: number, y: number, hi: number, lo: number) {
  pc.set(x, y, lo); pc.set(x + 1, y, hi); pc.set(x, y + 1, hi); pc.set(x + 1, y + 1, lo);
  pc.set(x - 1, y, K); pc.set(x + 2, y + 1, K); pc.set(x, y - 1, K); pc.set(x + 1, y + 2, K);
}

/** a raised panel with a lit top-left bevel; ramp: [outline, dark, base, light, highlight, glint] */
function panel(w: number, h: number, r: number, ramp: number[], bevel: number, mottle: number, seed: number, recess = 0) {
  const pc = canvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inRound(x, y, w, h, r)) continue;
    const d = depth(x, y, w, h, r);
    if (d === 0) { pc.set(x, y, ramp[0]); continue; }
    const lit = Math.min(y, x) <= Math.min(h - 1 - y, w - 1 - x);
    const n = hash(x >> 1, y >> 1, seed);
    let c = ramp[2];
    if (d <= bevel) c = lit ? (d === 1 ? ramp[4] : ramp[3]) : (d === 1 ? ramp[1] : mixHex(ramp[1], ramp[2], 0.5));
    else if (mottle && n < mottle * bayer(x, y)) c = mixHex(ramp[2], ramp[1], 0.45);
    else if (mottle && n > 1 - mottle * 0.5 * bayer(x + 1, y)) c = mixHex(ramp[2], ramp[3], 0.5);
    // the sunk lip of whatever is set into the panel (a screen, a tray)
    if (recess && d === recess) c = lit ? ramp[1] : ramp[3];
    if (recess && d === recess + 1) c = ramp[0];
    if (recess && d > recess + 1) { pc.set(x, y, 0, 0); continue; }
    pc.set(x, y, c);
  }
  pc.set(Math.round(r * 0.7) + 1, 1, ramp[5]); pc.set(1, Math.round(r * 0.7) + 1, ramp[5]);
  return pc;
}

const BAKELITE = [K, 0x2e1408, 0x4e2612, 0x74401e, 0x9a5c2e, 0xd08a4a];
const CREAM = [0x2a2016, 0x9a8a68, 0xd8ccac, 0xece2c6, 0xfaf4e2, 0xffffff];
const RED = [0x1a0604, 0x5a120a, 0x962a18, 0xbe4224, 0xe0683c, 0xffb090];
const OLIVE = [0x121410, 0x2a3024, 0x46503a, 0x5e6a4e, 0x7c8a68, 0xb8c4a0];
const BRASS = [0x2a1c08, 0x6a4a18, 0xa8842e, 0xcaa44a, 0xe8cc7a, 0xfff0c0];

function cabinet() {
  // 44x44, slice 14: chunky bakelite with four screws
  const S = 44, pc = panel(S, S, 9, BAKELITE, 3, 0.35, 7);
  for (const [x, y] of [[4, 4], [S - 6, 4], [4, S - 6], [S - 6, S - 6]]) screw(pc, x, y, 0xc8b8a0, 0x5a4a3a);
  return pc;
}
function steel() {
  // 32x32, slice 9: olive enamel, rivets, chipped paint
  const S = 32, pc = panel(S, S, 4, OLIVE, 2, 0.5, 11);
  for (const [x, y] of [[4, 4], [S - 6, 4], [4, S - 6], [S - 6, S - 6], [15, 3], [15, S - 5], [3, 15], [S - 5, 15]]) { pc.set(x, y, OLIVE[5]); pc.set(x + 1, y, OLIVE[3]); pc.set(x, y + 1, OLIVE[3]); pc.set(x + 1, y + 1, OLIVE[1]); }
  for (let i = 0; i < 9; i++) { const x = 3 + Math.floor(hash(i, 1, 3) * (S - 6)), y = 3 + Math.floor(hash(i, 2, 3) * (S - 6)); if ((x > 8 && x < S - 9) && (y > 8 && y < S - 9)) continue; pc.set(x, y, 0x8a8c86); pc.set(x + 1, y, 0x5a5c56); }
  return pc;
}
function tray() {
  // 16x16 slice 4: a sunk steel tray inside the switchboard (shadow top-left)
  const S = 16, pc = canvas(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y, S, S, 3)) continue;
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    const lit = x + y > S - 1;
    pc.set(x, y, d === 0 ? (lit ? OLIVE[4] : K) : d === 1 ? (lit ? OLIVE[3] : OLIVE[0]) : d === 2 && !lit ? 0x1c2018 : 0x262c20);
  }
  return pc;
}
function tape(c: number) {
  // 10x10 slice 3 fill: embossed plastic tape, notched ends
  const W = 10, H = 10, pc = canvas(W, H);
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === 1 ? mixHex(c, 0xffffff, 0.25) : y === H - 2 ? mixHex(c, 0x000000, 0.45) : (hash(x, y, 5) < 0.12 ? mixHex(c, 0xffffff, 0.08) : c));
  pc.set(0, 1, 0, 0); pc.set(0, H - 2, 0, 0); pc.set(W - 1, 1, 0, 0); pc.set(W - 1, H - 2, 0, 0);
  return pc;
}
function paper() {
  // 16x16 slice 4 fill: typewriter paper, fibres, a soiled edge, a shadow under it
  const S = 16, pc = canvas(S, S);
  for (let y = 0; y < S - 1; y++) for (let x = 0; x < S - 1; x++) {
    const d = Math.min(x, y, S - 2 - x, S - 2 - y);
    let c = hash(x, y, 9) < 0.08 ? 0xd8ceb0 : 0xece4cc;
    if (d === 0) c = 0xb8ac8a; else if (d === 1 && hash(x, y, 4) < 0.4) c = 0xdcd2b4;
    pc.set(x, y, c);
  }
  for (let i = 1; i < S; i++) { pc.set(i, S - 1, 0x000000, 90); pc.set(S - 1, i, 0x000000, 90); }
  return pc;
}
function key(ramp: number[], down: boolean) {
  // 16x18 slice 5 fill: a raised bakelite key with a skirt (down: sunk, no skirt)
  const W = 16, H = 18, pc = canvas(W, H);
  const top = down ? 3 : 0, kh = H - 4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y >= top && y < top + kh && inRound(x, y - top, W, kh, 3)) {
      const d = depth(x, y - top, W, kh, 3);
      const lit = y - top < 4 || x < 3;
      pc.set(x, y, d === 0 ? ramp[0] : d === 1 ? (down ? ramp[1] : lit ? ramp[4] : ramp[1]) : d === 2 && !down && lit ? ramp[3] : (down ? mixHex(ramp[2], ramp[1], 0.3) : ramp[2]));
    } else if (!down && y >= kh - 2 && y < H && x > 0 && x < W - 1) pc.set(x, y, y === H - 1 ? K : ramp[1]);
  }
  return pc;
}
function plateBrass() {
  const W = 16, H = 12, pc = panel(W, H, 2, BRASS, 1, 0.55, 13);
  screw(pc, 2, 4, 0xfff0c0, 0x6a4a18); screw(pc, W - 4, 4, 0xfff0c0, 0x6a4a18);
  return pc;
}
function nixie(on: boolean) {
  // 10x16: a tube seen face on, the anode mesh faintly orange
  const W = 10, H = 16, pc = canvas(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inRound(x, y, W, H, 4)) continue;
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    let c = d === 0 ? 0x2a2420 : 0x120c08;
    if (d > 0 && (x + y) % 2 === 0 && y > 2 && y < H - 3) c = on ? 0x2a1608 : 0x1a120c;
    if (d === 1 && x <= 2 && y < H / 2) c = 0x4a4440;
    pc.set(x, y, c);
  }
  return pc;
}
function lamp(on: boolean) {
  const S = 7, pc = canvas(S, S);
  const c = on ? [0x5a2a00, 0xc86a10, 0xffb43c, 0xfff0a0] : [0x1a1008, 0x3a2410, 0x5a3a1a, 0x8a6a40];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 3, dy = y - 3, r = dx * dx + dy * dy;
    if (r > 10) continue;
    pc.set(x, y, r > 6 ? 0x8a8c90 : r > 3 ? c[1] : c[2]);
  }
  pc.set(2, 2, c[3]);
  return pc;
}
function porthole() {
  const S = 26, pc = canvas(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 12.5, dy = y - 12.5, r = Math.sqrt(dx * dx + dy * dy);
    if (r > 12.6) continue;
    const lit = dx + dy < 0;
    pc.set(x, y, r > 11.6 ? K : r > 10 ? (lit ? 0xd8dce0 : 0x6a6e72) : r > 9.2 ? 0x101410 : (r < 3 && dx < 0 && dy < 0 ? 0x1a2a1c : 0x0c1810));
  }
  pc.set(8, 6, 0x4a5a4c); pc.set(7, 7, 0x4a5a4c); pc.set(6, 8, 0x3a4a3c);
  return pc;
}
function bigButton(c: number, d: number, down: boolean) {
  // 36x28: a big domed bakelite push button in a chrome bezel on a steel collar
  const W = 36, H = 28, pc = canvas(W, H);
  const cx = 17.5, cy = 13;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = (x - cx) / 17.5, ey = (y - cy - 1) / 12.5, er = ex * ex + ey * ey;
    if (er > 1) continue;
    // collar (dark steel) and chrome bezel
    if (er > 0.8) { pc.set(x, y, er > 0.93 ? K : (ey < 0 ? 0xc8ccd0 : 0x5a5e62)); continue; }
    const lift = down ? 2 : 0;
    const bx = (x - cx) / 14, by = (y - (cy - 3 + lift)) / 9.5, br = bx * bx + by * by;
    if (br <= 1) {
      // the dome: highlight top-left, shadow bottom-right, dithered
      const l = 0.6 - bx * 0.35 - by * 0.55 - br * 0.25;
      let col = l > 0.75 ? mixHex(c, 0xffffff, 0.55) : l > 0.45 ? mixHex(c, 0xffffff, 0.15 * (bayer(x, y) < 0.5 ? 1 : 0)) : l > 0.1 ? c : mixHex(c, d, 0.6);
      if (br > 0.82) col = mixHex(c, d, 0.75);
      pc.set(x, y, col);
    } else {
      // the skirt under the dome
      pc.set(x, y, y > cy + 2 ? mixHex(d, K, 0.35) : 0x1a1c1e);
    }
  }
  if (!down) { pc.set(9, 7, 0xffffff); pc.set(10, 6, 0xffffff); pc.set(11, 6, mixHex(c, 0xffffff, 0.7)); }
  return pc;
}

let installed = false;
/** put the parts on :root as --rk-* image variables (once) */
export function installRetroKit() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const de = document.documentElement.style;
  const set = (name: string, pc: PixelCanvas) => de.setProperty('--rk-' + name, `url(${toUrl(pc)})`);
  set('cabinet', cabinet());
  set('steel', steel());
  set('tray', tray());
  set('tape', tape(0x16140f)); set('tape-red', tape(0x8a1a14)); set('tape-blue', tape(0x1e3470));
  set('paper', paper());
  set('key', key(CREAM, false)); set('key-down', key(CREAM, true));
  set('key-red', key(RED, false)); set('key-red-down', key(RED, true));
  set('brass', plateBrass());
  set('nixie', nixie(false)); set('nixie-on', nixie(true));
  set('lamp', lamp(false)); set('lamp-on', lamp(true));
  set('porthole', porthole());
  set('pink', bigButton(0xf070b0, 0x7a1450, false)); set('pink-down', bigButton(0xf070b0, 0x7a1450, true));
  set('blue', bigButton(0x4a90e0, 0x102c6a, false)); set('blue-down', bigButton(0x4a90e0, 0x102c6a, true));
}

/** a number on Nixie tubes (markup; style .rk-nixie) */
export function nixieHtml(n: number, digits = 4): string {
  const s = String(Math.max(0, Math.floor(n))).padStart(digits, ' ').slice(-Math.max(digits, String(Math.floor(n)).length));
  return `<span class="rk-nixie">${[...s].map((c) => `<i${c === ' ' ? ' class="off"' : ''}>${c === ' ' ? '0' : c}</i>`).join('')}</span>`;
}

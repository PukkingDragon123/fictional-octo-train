// The theatre's instruments, drawn as pixel art (no DOM text anywhere): a
// cream-and-bakelite tele-diagnostic CRT with green phosphor and two knobs, a
// riveted control console with Nixie-tube credits, a drum counter, a lottery
// lever and a red mushroom button, a stamped brass plate, and the manila tag
// that hangs off whatever part the pointer is on. Each is one <canvas> drawn at
// 1:1 with the 5x7 font (src/ui/font5x7.ts) and scaled by whole pixels.
import { Screen } from '../font5x7';

export const C = (rgb: number, a = 255) => Screen.c(rgb, a);
export const PH = { bg: 0x041008, dim: 0x1f5a2a, mid: 0x52cc68, hi: 0xb4ffbc, inv: 0x062010 };
const hash = (x: number, y: number, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export interface Hit { x: number; y: number; w: number; h: number; id: string }

/** a pixel-art canvas with whole-pixel scaling and hit regions */
export class Pix {
  el: HTMLCanvasElement;
  s: Screen;
  hits: Hit[] = [];
  hover = '';
  scale = 2;
  onClick?: (id: string) => void;
  onHover?: (id: string) => void;
  onWheel?: (d: number) => void;
  private ctx: CanvasRenderingContext2D;
  constructor(public w: number, public h: number, cls: string) {
    this.el = document.createElement('canvas');
    this.el.width = w; this.el.height = h;
    this.el.className = 'sg-pix ' + cls;
    this.ctx = this.el.getContext('2d')!;
    this.s = new Screen(w, h);
    const at = (e: PointerEvent | MouseEvent) => {
      const r = this.el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * this.w, y = ((e.clientY - r.top) / r.height) * this.h;
      for (let i = this.hits.length - 1; i >= 0; i--) { const t = this.hits[i]; if (x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h) return t.id; }
      return '';
    };
    this.el.addEventListener('pointermove', (e) => { const id = at(e); if (id !== this.hover) { this.hover = id; this.el.style.cursor = id ? 'pointer' : ''; this.onHover?.(id); } });
    this.el.addEventListener('pointerleave', () => { if (this.hover) { this.hover = ''; this.onHover?.(''); } });
    this.el.addEventListener('click', (e) => { e.stopPropagation(); const id = at(e); if (id) this.onClick?.(id); });
    this.el.addEventListener('wheel', (e) => { if (this.onWheel) { e.preventDefault(); this.onWheel(Math.sign(e.deltaY)); } }, { passive: false });
  }
  setScale(k: number) { this.scale = k; this.el.style.width = this.w * k + 'px'; this.el.style.height = this.h * k + 'px'; }
  hit(id: string, x: number, y: number, w: number, h: number) { this.hits.push({ id, x, y, w, h }); }
  flush() { this.ctx.putImageData(this.s.img, 0, 0); }
}

// ------------------------------------------------------------------ drawing helpers
/** rounded rectangle fill */
export function rrect(s: Screen, x: number, y: number, w: number, h: number, r: number, c: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = i < r ? r - i - 0.5 : i >= w - r ? i - (w - r) + 0.5 : 0, dy = j < r ? r - j - 0.5 : j >= h - r ? j - (h - r) + 0.5 : 0;
    if (dx * dx + dy * dy <= r * r) s.px(x + i, y + j, c);
  }
}
/** an enamel / metal plate: fill, a light top-left bevel, a dark bottom-right one, an outline */
export function plate(s: Screen, x: number, y: number, w: number, h: number, base: number, light: number, dark: number, line: number, r = 2) {
  rrect(s, x, y, w, h, r, C(line));
  rrect(s, x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1), C(dark));
  rrect(s, x + 1, y + 1, w - 3, h - 3, Math.max(0, r - 1), C(light));
  rrect(s, x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 1), C(base));
}
export function rivet(s: Screen, x: number, y: number) { s.px(x, y, C(0xf0ecdc)); s.px(x + 1, y, C(0x8a8a80)); s.px(x, y + 1, C(0x8a8a80)); s.px(x + 1, y + 1, C(0x3a3a34)); }
export function screw(s: Screen, x: number, y: number) { s.disc(x, y, 2, C(0x6a5a3a)); s.px(x - 1, y, C(0x2a2014)); s.px(x, y, C(0x2a2014)); s.px(x + 1, y, C(0x2a2014)); s.px(x - 1, y - 1, C(0xd8c890)); }
/** stamped (debossed) lettering: dark letters with a light lip under them */
export function stamped(s: Screen, text: string, x: number, y: number, ink: number, lip: number) {
  s.text(text, x, y + 1, C(lip)); s.text(text, x, y, C(ink));
}
export const centerX = (s: Screen, text: string, w: number, scale = 1) => Math.round((w - s.textW(text, scale) + scale) / 2);

/** brass name plate with screws */
export function brassPlate(s: Screen, x: number, y: number, w: number, h: number, text: string) {
  plate(s, x, y, w, h, 0xb48a3a, 0xe0c070, 0x6a4a1a, 0x2a1a08, 2);
  for (let i = x + 4; i < x + w - 4; i += 3) if (hash(i, y, 3) < 0.2) s.px(i, y + h - 4, C(0x9a7428));
  screw(s, x + 4, y + h / 2); screw(s, x + w - 5, y + h / 2);
  stamped(s, text, x + centerX(s, text, w), y + Math.round((h - 7) / 2), 0x3a2408, 0xf0d890);
}

// ------------------------------------------------------------------ the CRT
export const CRT = { W: 188, H: 156, SX: 10, SY: 8, SW: 168, SH: 126 };
let bezelCache: Uint32Array | null = null;
/** cream enamel cabinet, bakelite surround, brass maker's plate, two knobs (redrawn knobs on top) */
export function drawBezel(s: Screen) {
  if (bezelCache) { s.data.set(bezelCache); return; }
  const { W, H, SX, SY, SW, SH } = CRT;
  s.data.fill(0);
  plate(s, 0, 0, W, H, 0xd8ccae, 0xf2e8cc, 0xa49676, 0x2a2218, 7);
  // enamel wear and a few chips
  for (let i = 0; i < 70; i++) { const x = 3 + Math.floor(hash(i, 1, 5) * (W - 6)), y = 3 + Math.floor(hash(i, 2, 5) * (H - 6)); if (x > SX - 3 && x < SX + SW + 3 && y > SY - 3 && y < SY + SH + 3) continue; s.px(x, y, C(hash(i, 3) < 0.5 ? 0xc4b694 : 0x8a7a5a)); }
  // bakelite surround around the tube
  rrect(s, SX - 5, SY - 5, SW + 10, SH + 10, 9, C(0x1a0c06));
  rrect(s, SX - 4, SY - 4, SW + 8, SH + 8, 8, C(0x3a1c10));
  rrect(s, SX - 3, SY - 3, SW + 6, SH + 6, 7, C(0x2a140a));
  for (let i = 0; i < SW + 4; i++) s.px(SX - 2 + i, SY - 4, C(0x5a3020));
  // the glass (content is blitted over it)
  rrect(s, SX, SY, SW, SH, 6, C(PH.bg));
  // bottom band: the maker's plate, a pilot lamp, two knobs
  brassPlate(s, 48, H - 17, 92, 12, 'TELE-DIAG');
  for (const kx of [20, W - 21]) knob(s, kx, H - 11, 0);
  // vent slots
  for (let i = 0; i < 4; i++) s.hline(W - 46 + 0, W - 46 + 6, H - 17 + i * 3, C(0x5a4a34));
  bezelCache = new Uint32Array(s.data);
}
export function knob(s: Screen, cx: number, cy: number, turn: number) {
  s.disc(cx, cy, 7, C(0x1a0c06));
  s.disc(cx, cy, 6, C(0x3a1c10));
  s.disc(cx - 1, cy - 1, 4, C(0x4e2818));
  s.px(cx - 3, cy - 3, C(0x8a5a3a)); s.px(cx - 2, cy - 4, C(0x7a4a2a));
  const a = -Math.PI / 2 + turn;
  for (let r = 2; r <= 5; r++) s.px(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), C(0xe8dcc0));
  for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; s.px(cx + Math.round(Math.cos(t) * 8), cy + Math.round(Math.sin(t) * 8), C(0x8a7a5a)); }
}
/** phosphor: blit the content with scanlines, a soft glow and the tube's rounded corners */
export function blitPhosphor(dst: Screen, src: Screen, t: number) {
  const { SX, SY, SW, SH } = CRT;
  const d = src.data;
  const bg = PH.bg;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    // rounded tube corners
    const r = 6, dx = x < r ? r - x - 0.5 : x >= SW - r ? x - (SW - r) + 0.5 : 0, dy = y < r ? r - y - 0.5 : y >= SH - r ? y - (SH - r) + 0.5 : 0;
    if (dx * dx + dy * dy > r * r) continue;
    let v = d[y * SW + x];
    let R = v & 255, G = (v >> 8) & 255, B = (v >> 16) & 255;
    if (!R && !G && !B) {
      // glow from the lit neighbours
      const n = (xx: number, yy: number) => { if (xx < 0 || yy < 0 || xx >= SW || yy >= SH) return 0; return (d[yy * SW + xx] >> 8) & 255; };
      const gl = Math.max(n(x - 1, y), n(x + 1, y), n(x, y - 1), n(x, y + 1)) * 0.22;
      R = ((bg >> 16) & 255) + gl * 0.3; G = ((bg >> 8) & 255) + gl; B = (bg & 255) + gl * 0.35;
      // faint noise
      const nz = hash(x, y, (t * 20) | 0) * 6;
      G += nz;
    }
    // scanlines, a bright roll band, the curved vignette
    const scan = y & 1 ? 0.72 : 1;
    const roll = 1 + 0.08 * Math.max(0, 1 - Math.abs(((y / SH - (t * 0.12) % 1.2) + 1.2) % 1.2 - 0.1) * 12);
    const cx = (x / SW - 0.5), cy = (y / SH - 0.5);
    const vig = 1 - (cx * cx + cy * cy) * 0.9;
    const k = scan * roll * vig;
    dst.px(SX + x, SY + y, C((Math.min(255, R * k) << 16) | (Math.min(255, G * k) << 8) | Math.min(255, B * k)));
  }
  // a glint on the glass
  for (let i = 0; i < 18; i++) dst.px(SX + 8 + i, SY + 4 + (i >> 3), C(0x6a8a70));
}

// ------------------------------------------------------------------ phosphor content helpers
export const ph = { bg: C(0), dim: C(PH.dim), mid: C(PH.mid), hi: C(PH.hi) };
/** a framed phosphor button; inverse when hot */
export function phButton(s: Screen, x: number, y: number, label: string, hot: boolean, w?: number) {
  const bw = w ?? s.textW(label) + 5;
  if (hot) { s.rect(x, y, bw, 11, ph.hi); s.text(label, x + 3, y + 2, C(PH.inv)); }
  else { s.frame(x, y, bw, 11, ph.mid); s.text(label, x + 3, y + 2, ph.hi); }
  return bw;
}
/** a cartridge: a slotted bakelite box with a label, as phosphor line art */
export function cartIcon(s: Screen, x: number, y: number, c: number) {
  s.frame(x, y, 10, 8, c); s.hline(x + 2, x + 7, y + 2, c); s.hline(x + 2, x + 5, y + 4, c);
  for (let i = 0; i < 4; i++) s.px(x + 2 + i * 2, y + 8, c);
}
/** a punch card: clipped corner, rows of holes */
export function cardIcon(s: Screen, x: number, y: number, c: number, seed: number) {
  s.hline(x + 2, x + 10, y, c); s.hline(x, x + 10, y + 7, c); s.vline(x, y + 2, y + 7, c); s.vline(x + 10, y, y + 7, c); s.px(x + 1, y + 1, c);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) if (hash(i, j, seed) < 0.6) s.px(x + 2 + i * 2, y + 3 + j * 2, c);
}

// ------------------------------------------------------------------ the console: Nixie credits, drum counter, lever, mushroom button
export const CON = { W: 196, H: 60 };
export function drawConsole(s: Screen, credits: number, rp: number, lever: number, pressed: number, hover: string, t: number) {
  const { W, H } = CON;
  s.data.fill(0);
  plate(s, 0, 4, W, H - 4, 0x9cc4ae, 0xc8e4d4, 0x5a7a68, 0x1a241e, 4);
  for (const [x, y] of [[4, 8], [W - 6, 8], [4, H - 5], [W - 6, H - 5]]) rivet(s, x, y);
  // ---- Nixie tubes: the sign and two digits
  brassPlate(s, 8, 8, 58, 11, 'CREDITS');
  const txt = (credits < 0 ? '-' : '+') + String(Math.min(99, Math.abs(credits))).padStart(2, '0');
  for (let i = 0; i < 3; i++) nixie(s, 9 + i * 19, 22, txt[i], credits < 0 && (t * 2 % 1) < 0.5, t + i);
  // ---- drum counter for research points
  brassPlate(s, 74, 8, 46, 11, 'RESEARCH');
  s.rect(76, 24, 42, 15, C(0x1a1612)); s.frame(75, 23, 44, 17, C(0x3a342a));
  const rs = String(Math.min(999, Math.max(0, rp))).padStart(3, '0');
  for (let i = 0; i < 3; i++) {
    const x = 79 + i * 13;
    s.rect(x, 25, 10, 13, C(0xe8e0cc)); s.hline(x, x + 9, 25, C(0x8a8478)); s.hline(x, x + 9, 37, C(0x8a8478));
    s.text(rs[i], x + 3, 28, C(0x1a1612));
  }
  stamped(s, 'RP', 92, 44, 0x2a3a30, 0xd8ece0);
  // ---- the lottery lever
  brassPlate(s, 126, 8, 30, 11, 'DEAL');
  s.rect(137, 24, 8, 26, C(0x1a1612)); s.frame(136, 23, 10, 28, C(0x3a342a));
  const ly = 26 + Math.round(lever * 18);
  s.rect(139, ly, 4, 4, C(0xc8ccd0)); s.vline(141, Math.min(ly, 24) - 3, ly, C(0xa8acb0));
  const ky = ly - 8;
  s.disc(141, ky, 4, C(hover === 'lever' ? 0xff5a40 : 0xd02818)); s.px(140, ky - 2, C(0xff9a80)); s.px(139, ky - 1, C(0xff9a80));
  // ---- the big red mushroom button on a hazard ring
  const bx = 176, by = 33;
  for (let a = 0; a < 40; a++) { const th = (a / 40) * Math.PI * 2; for (let r = 13; r <= 15; r++) s.px(bx + Math.round(Math.cos(th) * r), by + Math.round(Math.sin(th) * r), C(((a >> 2) & 1) ? 0xe8b828 : 0x1a1814)); }
  s.disc(bx, by + 2, 11, C(0x4a0a06));
  const press = pressed > 0 ? 2 : 0;
  s.disc(bx, by + press, 11, C(hover === 'go' ? 0xff3a28 : 0xd01c10));
  s.disc(bx - 3, by - 3 + press, 4, C(hover === 'go' ? 0xff8a70 : 0xf05a40));
  s.px(bx - 5, by - 5 + press, C(0xffd0c0));
  brassPlate(s, 156, H - 9, 40, 9, 'GO');
  return { lever: [128, 6, 26, 50] as const, go: [160, 16, 34, 36] as const };
}
function nixie(s: Screen, x: number, y: number, ch: string, off: boolean, t: number) {
  // glass envelope, wire mesh, a glowing cathode
  rrect(s, x, y, 16, 26, 5, C(0x2a1a10));
  rrect(s, x + 1, y + 1, 14, 24, 4, C(0x120a06));
  for (let j = 3; j < 23; j += 2) for (let i = 2; i < 14; i += 2) s.px(x + i, y + j, C(0x2a180e));
  s.rect(x + 2, y + 24, 12, 2, C(0x6a6a62));
  if (!off) {
    const flick = 0.85 + 0.15 * Math.sin(t * 37);
    const glow = C((Math.round(0x7a * flick) << 16) | (Math.round(0x28 * flick) << 8) | 0x08);
    // halo first, then the digit
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) s.text(ch, x + 3 + ox, y + 6 + oy, glow, 2 > 1 ? 1 : 1);
    bigChar(s, ch, x + 3, y + 5, C(0xffa040), glow);
  }
  s.px(x + 3, y + 3, C(0x8a7a6a)); s.px(x + 4, y + 2, C(0x8a7a6a));
}
function bigChar(s: Screen, ch: string, x: number, y: number, c: number, halo: number) {
  // a 10x14 digit from the 5x7 glyph at scale 2, with a one-pixel halo
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) s.text(ch, x + ox, y + oy, halo, 2);
  s.text(ch, x, y, c, 2);
}

// ------------------------------------------------------------------ the manila tag on a string
export const TAG = { W: 86, H: 40 };
export function drawTag(s: Screen, l1: string, l2: string, l3 = '') {
  const { W, H } = TAG;
  s.data.fill(0);
  // the string from the bottom-left corner (the part) to the eyelet
  s.line(1, H - 2, 12, 15, C(0xd8d0b8)); s.line(2, H - 2, 13, 15, C(0x8a8270));
  // the tag: manila card with a cut corner, a brass eyelet
  const x0 = 8, y0 = 2, w = W - 10, h = 30;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (i + j < 6 || i + (h - 1 - j) < 6) continue;
    const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1 || i + j === 6 || i + (h - 1 - j) === 6;
    s.px(x0 + i, y0 + j, C(edge ? 0x8a7040 : hash(i, j, 7) < 0.08 ? 0xc8ac70 : 0xdcc48a));
  }
  s.disc(x0 + 6, y0 + 14, 3, C(0xb48a3a)); s.disc(x0 + 6, y0 + 14, 1, C(0x2a2014));
  // typewritten lines (ink bleeds a little)
  const ink = C(0x2a2018), ink2 = C(0x6a2a1a);
  s.text(l1, x0 + 13, y0 + 4, ink);
  s.text(l2, x0 + 13, y0 + 13, ink2);
  if (l3) s.text(l3, x0 + 13, y0 + 21, C(0x4a3a2a));
  for (let i = 0; i < 6; i++) s.px(x0 + 13 + Math.floor(hash(i, 9, 1) * 60), y0 + 4 + Math.floor(hash(i, 8, 2) * 24), C(0xc8b07a));
}

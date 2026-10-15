// Larger pieces of hand-built pixel art for the menus: the NOCLIP logo in
// phosphor bricks, a CCTV feed of an endless corridor for the title screen,
// pre-rotated rubber stamps for the personnel file, and the 8x8 glyphs used
// on keycaps. Everything is drawn with PixelCanvas at 1 art pixel and shown
// at the UI's integer pixel scale.
import { PixelCanvas, mixHex, bayer, bayer8, ph } from '../gfx/pixel';
import { Screen } from './font5x7';
import { art, toUrl, kitTheme, PkTheme, MET } from './pixelkit';

// ------------------------------------------------------------------ logo
const LOGO_GLYPHS: Record<string, string[]> = {
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
};
/**
 * The logo as phosphor bricks: every font cell is a 3x3 bevelled brick, cells
 * fuse sideways into strokes and keep a dark scanline gap between rows, with a
 * dithered bloom around the lit glass.
 */
export function logoCanvas(text = 'NOCLIP', t: PkTheme = kitTheme()): PixelCanvas {
  const cell = 4, gap = 4, pad = 3;
  const W = pad * 2 + text.length * 5 * cell + (text.length - 1) * gap - 1, H = pad * 2 + 7 * cell - 1;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const on = new Uint8Array(W * H);
  let ox = pad;
  for (const ch of text) {
    const g = LOGO_GLYPHS[ch] || LOGO_GLYPHS.O;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
      if (g[j][i] !== '#') continue;
      const x0 = ox + i * cell, y0 = pad + j * cell;
      const right = i < 4 && g[j][i + 1] === '#';
      const w = right ? cell : cell - 1;
      for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) on[(y0 + y) * W + x0 + x] = 1;
    }
    ox += 5 * cell + gap;
  }
  // bloom first (under the bricks)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (on[y * W + x]) continue;
    let near = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H && on[Y * W + X]) near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dy)));
    }
    if (near >= 2) pc.set(x, y, mixHex(t.scr, t.dark, 0.95));
    else if (near === 1 && bayer(x, y) < 0.5) pc.set(x, y, mixHex(t.scr, t.dark, 0.6));
  }
  // bricks: highlight top-left, shade bottom-right of every stroke row
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on[y * W + x]) continue;
    const up = y > 0 && on[(y - 1) * W + x], down = y < H - 1 && on[(y + 1) * W + x];
    const left = x > 0 && on[y * W + x - 1], right = x < W - 1 && on[y * W + x + 1];
    let c = t.ph;
    if (!up) c = !left ? t.hi : mixHex(t.ph, t.hi, 0.6);
    else if (!down) c = !right ? t.dim : t.mid;
    else if (!left) c = mixHex(t.ph, t.hi, 0.35);
    else if (!right) c = t.mid;
    // a faint vertical sheen band
    if (c === t.ph && (x + y * 2) % 23 < 2) c = mixHex(t.ph, t.hi, 0.3);
    pc.set(x, y, c);
  }
  return pc;
}

// ------------------------------------------------------------------ title diorama: CCTV feed of the halls
/**
 * A live security-camera feed of an endless yellow corridor, in phosphor
 * monochrome: one-point perspective, ceiling lights, doorways, a lone figure
 * far down the hall. Redrawn a few times a second (flicker, figure, noise).
 */
export class Diorama {
  readonly w: number; readonly h: number;
  canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private base: PixelCanvas;
  private scr: Screen;
  private t = 0;
  private timer = 0;
  private figure = 0.6;
  constructor(w = 168, h = 60) {
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.scr = new Screen(w, h);
    this.base = this.paint(kitTheme());
    this.draw();
  }
  start() {
    const tick = () => {
      if (!this.canvas.isConnected) { this.timer = 0; return; }
      this.t += 0.25; this.draw();
      this.timer = window.setTimeout(tick, 250);
    };
    if (!this.timer) this.timer = window.setTimeout(tick, 250);
  }
  retheme() { this.base = this.paint(kitTheme()); this.draw(); }

  /** static corridor in a 7-tone phosphor ramp */
  private paint(t: PkTheme): PixelCanvas {
    const W = this.w, H = this.h;
    const R = [mixHex(t.scr, 0x000000, 0.4), t.scr, mixHex(t.scr, t.dark, 0.6), t.dark, mixHex(t.dark, t.dim, 0.6), t.dim, t.mid, t.ph, t.hi];
    const pc = new PixelCanvas(W, H); pc.wrap = false;
    const vx = Math.round(W * 0.56), vy = Math.round(H * 0.46);
    const far = { x0: vx - 9, x1: vx + 9, y0: vy - 7, y1: vy + 6 };   // the far opening
    const tone = (v: number, x: number, y: number) => {
      const n = R.length - 1; v = Math.max(0, Math.min(1, v)) * n;
      let i = Math.floor(v); if (v - i > bayer8(x, y)) i++;
      return R[Math.min(n, i)];
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      // which surface: use the slopes from the vanishing point to the frame corners
      const dx = x + 0.5 - vx, dy = y + 0.5 - vy;
      const inFar = x >= far.x0 && x <= far.x1 && y >= far.y0 && y <= far.y1;
      if (inFar) { pc.set(x, y, R[0]); continue; }
      const sx = Math.abs(dx) / (Math.abs(dx) + 0.001);
      void sx;
      // normalised depth from the frame edge (0 near the viewer) to the far opening (1)
      const kx = dx < 0 ? (far.x0 - vx) / (0 - vx) : (far.x1 - vx) / (W - vx);
      const ky = dy < 0 ? (far.y0 - vy) / (0 - vy) : (far.y1 - vy) / (H - vy);
      const ax = Math.abs(dx) / (dx < 0 ? vx : W - vx), ay = Math.abs(dy) / (dy < 0 ? vy : H - vy);
      let surf: 'wallL' | 'wallR' | 'ceil' | 'floor';
      if (ax > ay) surf = dx < 0 ? 'wallL' : 'wallR'; else surf = dy < 0 ? 'ceil' : 'floor';
      const near = surf === 'wallL' || surf === 'wallR' ? ax : ay;           // 1 at the frame edge
      const k = surf === 'wallL' || surf === 'wallR' ? kx : ky;
      const depth = Math.max(0, Math.min(1, (1 - near) / (1 - k)));          // 0 near .. 1 far
      const z = 1 / (1 - depth * 0.93);                                       // pseudo distance
      let v = 0;
      if (surf === 'ceil') {
        // ceiling tiles with light panels every few metres
        const u = (dx / (vy - y + 0.001)) * 1.0, w = z;
        const tileU = Math.abs(u * 3) % 1, tileW = (w * 1.2) % 1;
        v = 0.55 - depth * 0.35;
        if (tileU < 0.08 || tileW < 0.06 * z) v -= 0.12;
        const lamp = Math.abs(u) < 0.32 && (w * 0.6) % 1 < 0.28;
        if (lamp) v = 0.98 - depth * 0.2;
      } else if (surf === 'floor') {
        const u = dx / (y - vy + 0.001);
        v = 0.42 - depth * 0.3 + (ph(Math.floor(u * 6), Math.floor(z * 3), 7) - 0.5) * 0.06;
        // a light pool under each lamp
        const w = z;
        if (Math.abs(u) < 0.5 && (w * 0.6 + 0.08) % 1 < 0.3) v += 0.12 * (1 - depth);
        if (Math.abs(u * 3) % 1 < 0.05) v -= 0.05;
      } else {
        // wallpaper stripes recede; doors cut into the walls
        const w = z;
        const stripe = (w * 2.6) % 1 < 0.12;
        v = 0.5 - depth * 0.32 + (stripe ? -0.08 : 0);
        const yy = (y - vy) / (Math.abs(dx) + 0.001);  // height on the wall, -1..1-ish
        const door = (Math.floor(w * 0.45) % 3 === (surf === 'wallL' ? 1 : 2)) && (w * 0.45) % 1 > 0.25 && (w * 0.45) % 1 < 0.6 && yy > -0.38;
        if (door) v = 0.08 + (1 - depth) * 0.08;
        if (yy > 0.52 && yy < 0.6) v -= 0.1; // baseboard
      }
      pc.set(x, y, tone(v, x, y));
    }
    // edges where the planes meet, a hair brighter on the ceiling side
    for (let i = 0; i <= 1; i += 1 / 120) {
      for (const [ex, ey] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) {
        const fx = ex === 0 ? far.x0 : far.x1, fy = ey === 0 ? far.y0 : far.y1;
        const x = Math.round(ex + (fx - ex) * i), y = Math.round(ey + (fy - ey) * i);
        pc.set(x, y, ey === 0 ? R[4] : R[2]);
      }
    }
    for (let x = far.x0; x <= far.x1; x++) { pc.set(x, far.y0, R[3]); pc.set(x, far.y1, R[2]); }
    for (let y = far.y0; y <= far.y1; y++) { pc.set(far.x0, y, R[3]); pc.set(far.x1, y, R[3]); }
    return pc;
  }

  private draw() {
    const t = kitTheme();
    const s = this.scr, W = this.w, H = this.h, b = this.base;
    // base image with a flickering lamp band
    const flick = Math.sin(this.t * 7.3) > 0.85 || Math.sin(this.t * 1.7) > 0.97;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = b.get(x, y);
      if (flick && y < H * 0.3 && x > W * 0.4 && x < W * 0.75) c = mixHex(c, 0x000000, 0.35);
      s.px(x, y, Screen.c(c));
    }
    // the lone figure, sometimes there, sometimes not
    this.figure = Math.max(0, Math.min(1, this.figure + (Math.sin(this.t * 0.31) > 0 ? 0.1 : -0.1)));
    if (this.figure > 0.5) {
      const fx = Math.round(W * 0.56) + 3, fy = Math.round(H * 0.46) - 3;
      const fig = ['.#.', '###', '###', '.#.', '#.#'];
      fig.forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '#') s.px(fx + i, fy + j, Screen.c(mixHex(t.scr, 0x000000, 0.5))); });
    }
    // overlay: REC dot, camera id and a running clock in the 5x7 font
    const blink = Math.floor(this.t * 2) % 2 === 0;
    if (blink) s.disc(5, 5, 2, Screen.c(0xff5f45));
    s.text('CAM 03', 10, 2, Screen.c(t.hi));
    const secs = Math.floor(this.t) + 9 * 3600 + 47 * 60;
    const clock = `${String(Math.floor(secs / 3600) % 24).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    s.text(clock, W - s.textW(clock) - 2, H - 9, Screen.c(t.hi));
    s.text('LVL 0', 2, H - 9, Screen.c(t.mid));
    // rolling interference bar and a few noise sparks
    const roll = Math.floor((this.t * 9) % (H + 12)) - 6;
    for (let y = roll; y < roll + 3; y++) if (y >= 0 && y < H) for (let x = 0; x < W; x++) if ((x + y) % 3 === 0) s.px(x, y, Screen.c(mixHex(b.get(x, y), t.hi, 0.18)));
    for (let i = 0; i < 6; i++) { const x = (Math.random() * W) | 0, y = (Math.random() * H) | 0; s.rect(x, y, 1 + ((Math.random() * 3) | 0), 1, Screen.c(t.mid)); }
    this.ctx.putImageData(s.img, 0, 0);
  }
}

// ------------------------------------------------------------------ rubber stamps
/** A worn rubber stamp in the 5x7 font, double border, rotated in pixel space (nearest) so no edge ever blurs. */
export function stampCanvas(text: string, color: number, angleDeg = -9): PixelCanvas {
  const sc = 2;
  const tw = [...text].length * 6 * sc - sc, th = 7 * sc;
  const W = tw + 16, H = th + 14;
  const src = new Screen(W, H);
  src.clear(0x000000); src.data.fill(0);
  const C = Screen.c(color);
  src.frame(0, 0, W, H, C); src.frame(1, 1, W - 2, H - 2, C);
  src.frame(4, 4, W - 8, H - 8, C);
  src.text(text, 8, 7, C, sc);
  // ink wear: knock out clustered pixels
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!src.data[i]) continue;
    const n = ph(Math.floor(x / 3), Math.floor(y / 2), 17) * 0.6 + ph(x, y, 5) * 0.4;
    if (n > 0.8 || (n > 0.66 && bayer(x, y) > 0.5)) src.data[i] = 0;
  }
  // rotate (inverse map, nearest)
  const a = (angleDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const RW = Math.ceil(Math.abs(W * ca) + Math.abs(H * sa)) + 2, RH = Math.ceil(Math.abs(W * sa) + Math.abs(H * ca)) + 2;
  const out = new PixelCanvas(RW, RH); out.wrap = false;
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const dx = x + 0.5 - RW / 2, dy = y + 0.5 - RH / 2;
    const sx = Math.floor(dx * ca + dy * sa + W / 2), sy = Math.floor(-dx * sa + dy * ca + H / 2);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    if (src.data[sy * W + sx]) out.set(x, y, color, ph(x, y, 9) > 0.85 ? 170 : 235);
  }
  return out;
}

// ------------------------------------------------------------------ 8x8 keycap glyphs
const GLYPHS: Record<string, string[]> = {
  dice: ['########', '#......#', '#.#..#.#', '#......#', '#......#', '#.#..#.#', '#......#', '########'],
  left: ['..####..', '.#....#.', '#......#', '#.......', '#...#...', '#..##...', '.#####..', '...##...'],
  right: ['..####..', '.#....#.', '#......#', '.......#', '...#...#', '...##..#', '..#####.', '...##...'],
  plus: ['.####...', '#....#..', '#.##.#..', '#....#..', '.####...', '.....#..', '......#.', '.......#'],
  minus: ['.####...', '#....#..', '#....#..', '#.##.#..', '.####...', '.....#..', '......#.', '.......#'],
  play: ['.#......', '.##.....', '.###....', '.####...', '.####...', '.###....', '.##.....', '.#......'],
  star: ['...#....', '...#....', '.#####..', '..###...', '..#.#...', '.#...#..', '........', '........'],
  lock: ['..###...', '.#...#..', '.#...#..', '#######.', '#.....#.', '#..#..#.', '#.....#.', '#######.'],
  check: ['........', '.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '........'],
  gear: ['...##...', '.######.', '.##..##.', '###..###', '###..###', '.##..##.', '.######.', '...##...'],
};
const glyphCache = new Map<string, string>();
/** data URL of an 8x8 glyph with a 1px light lip under it (engraved look) */
export function glyphUrl(name: string, color = 0x23241f, lip = 0xdddfd2): string {
  const k = name + color + ':' + lip;
  const hit = glyphCache.get(k); if (hit) return hit;
  const g = GLYPHS[name] || GLYPHS.dice;
  const pc = new PixelCanvas(9, 9); pc.wrap = false;
  if (lip >= 0) art(pc, 1, 1, g, { '#': lip });
  art(pc, 0, 0, g, { '#': color });
  const u = toUrl(pc);
  glyphCache.set(k, u);
  return u;
}
/** markup for a keycap glyph (an element sized in art pixels by the stylesheet) */
export function glyph(name: string): string { return `<i class="pxi" style="background-image:url(${glyphUrl(name)})"></i>`; }

export { MET };

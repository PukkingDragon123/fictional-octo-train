// The emote dial: a 1950s rotary telephone dial, drawn as pixel art and
// redrawn while it moves. Eight finger holes over an enamel number plate with
// a pictogram under each (wave, point, dance, sit, salute, mock, cheer,
// shrug), a chrome finger stop, a paper card in the middle (what you are
// about to dial; the line switch for opening your floor), and four bakelite
// keys under it for the whistle calls. Dialling pulls the wheel round to the
// stop and lets it run back, ticking.
import { glyph5x7 } from '../ui/font5x7';
import { G } from '../game/G';

const W = 112, H = 140, CX = 56, CY = 56;
const STOP = (60 * Math.PI) / 180;
const HOLE_R = 9, RING = 38, PLATE_R = 51;
export const HOLE_ANG = Array.from({ length: 8 }, (_, i) => STOP - ((i + 1) * 30 + 8) * Math.PI / 180);
const KEYS = Array.from({ length: 4 }, (_, i) => ({ x: 7 + i * 25, y: 116, w: 23, h: 18 }));

const ICONS: string[][] = [
  ['...#.#...', '..##.#.#.', '..##.###.', '#.######.', '########.', '.#######.', '..#####..', '...###...', '...###...'],
  ['.........', '.....#...', '.....##..', '########.', '#########', '########.', '.....##..', '.....#...', '.........'],
  ['...######', '...#....#', '...#....#', '...#....#', '.###..###', '####.####', '.##...##.', '.........', '.........'],
  ['.#.......', '.#.......', '.#.......', '.#######.', '.#######.', '.#.....#.', '.#.....#.', '.#.....#.', '.........'],
  ['..###....', '.#####...', '..###.##.', '...#.##..', '..#####..', '...#.....', '...#.....', '..#.#....', '.#...#...'],
  ['..#####..', '.#.....#.', '#.##.##.#', '#.......#', '#.#####.#', '#...##..#', '.#..##.#.', '..#####..', '.........'],
  ['#.......#', '.#.###.#.', '..#####..', '...###...', '....#....', '...###...', '...#.#...', '..#...#..', '.........'],
  ['...###...', '...###...', '#...#...#', '.#######.', '....#....', '...###...', '...#.#...', '..#...#..', '.........'],
];
const TUNE_ICONS: string[][] = [
  ['#........', '.##......', '...##....', '.....##..', '.......##', '.........', '.........'],
  ['.......##', '.....##..', '...##....', '.##......', '#........', '.........', '.........'],
  ['#...#...#', '.#.#.#.#.', '..#...#..', '.........', '#...#...#', '.#.#.#.#.', '..#...#..'],
  ['....###..', '....#.#..', '....#....', '....#....', '..###....', '.####....', '..##.....'],
];

export type DialHit = { kind: 'hole'; i: number } | { kind: 'card' } | { kind: 'key'; i: number } | null;

export class EmoteDial {
  el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private img: ImageData | null;
  private buf: Uint32Array | null;
  scale = 3;
  /** wheel rotation (rad, clockwise) and the dialling state */
  theta = 0;
  private pull: { i: number; target: number; fired: boolean; back: boolean; cb: () => void } | null = null;
  hover: DialHit = null;
  tune = 0;
  card: [string, string] = ['DIAL', ''];
  cardRed = false;
  private lastTick = 0;
  dirty = true;

  constructor(onPick: (h: DialHit) => void) {
    this.el = document.createElement('div');
    this.el.className = 'sx-dial';
    this.cv = document.createElement('canvas');
    this.cv.width = W; this.cv.height = H;
    this.g = this.cv.getContext('2d');
    this.img = this.g ? this.g.createImageData(W, H) : null;
    this.buf = this.img ? new Uint32Array(this.img.data.buffer) : null;
    this.el.appendChild(this.cv);
    this.cv.addEventListener('pointermove', (e) => { const h = this.hitAt(e.offsetX / this.scale, e.offsetY / this.scale); if (JSON.stringify(h) !== JSON.stringify(this.hover)) { this.hover = h; this.dirty = true; } });
    this.cv.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; });
    this.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onPick(this.hitAt(e.offsetX / this.scale, e.offsetY / this.scale)); });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', 'Emote dial');
    document.body.appendChild(this.el);
  }

  place(x: number, y: number) {
    this.scale = Math.min(window.innerWidth, window.innerHeight) < 620 ? 2 : 3;
    const w = W * this.scale, h = H * this.scale;
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, x - CX * this.scale));
    const top = Math.max(8, Math.min(window.innerHeight - h - 8, y - CY * this.scale));
    this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    this.dirty = true;
  }
  /** the dial centre on screen (for aiming with the mouse while G is held) */
  centre(): [number, number] {
    const r = this.cv.getBoundingClientRect();
    return [r.left + CX * this.scale, r.top + CY * this.scale];
  }
  /** the hole nearest a screen direction from the centre */
  holeToward(mx: number, my: number): number {
    const [cx, cy] = this.centre();
    const dx = mx - cx, dy = my - cy;
    if (Math.hypot(dx, dy) < 22 * this.scale * 0.6) return -1;
    const a = Math.atan2(dy, dx);
    let best = -1, bd = 9;
    HOLE_ANG.forEach((h, i) => { let d = Math.abs(a - h) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; if (d < bd && d < 0.4) { bd = d; best = i; } });
    return best;
  }

  hitAt(x: number, y: number): DialHit {
    const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
    if (r <= 20) return { kind: 'card' };
    for (let i = 0; i < 8; i++) {
      const hx = CX + Math.cos(HOLE_ANG[i]) * RING, hy = CY + Math.sin(HOLE_ANG[i]) * RING;
      if (Math.hypot(x - hx, y - hy) <= HOLE_R + 1.5) return { kind: 'hole', i };
    }
    for (let i = 0; i < 4; i++) { const k = KEYS[i]; if (x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h) return { kind: 'key', i }; }
    return null;
  }

  /** pull hole i round to the finger stop; cb fires when it reaches the stop */
  dial(i: number, cb: () => void) {
    if (this.pull) return;
    const target = ((i + 1) * 30 + 8) * Math.PI / 180;
    this.pull = { i, target, fired: false, back: false, cb };
  }
  get busy() { return !!this.pull; }

  update(dt: number) {
    const p = this.pull;
    if (p) {
      if (!p.back) {
        this.theta = Math.min(p.target, this.theta + dt * 7.5);
        if (this.theta >= p.target) { p.back = true; if (!p.fired) { p.fired = true; p.cb(); } G.audio?.ui?.('click', 0.3); }
      } else {
        this.theta = Math.max(0, this.theta - dt * 4.2);
        const tick = Math.floor(this.theta / (Math.PI / 6));
        if (tick !== this.lastTick) { this.lastTick = tick; G.audio?.ui?.('vx_tick', 0.18); }
        if (this.theta <= 0) this.pull = null;
      }
      this.dirty = true;
    }
    if (this.dirty) this.draw();
  }

  // ---------------------------------------------------------------- drawing
  private draw() {
    this.dirty = false;
    const b = this.buf, g = this.g, img = this.img;
    if (!b || !g || !img) return;
    b.fill(0);
    const C = (rgb: number, a = 255) => ((a << 24) | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0;
    const px = (x: number, y: number, c: number) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) b[y * W + x] = c; };
    const shade = (base: number, k: number) => { const r = (base >> 16) & 255, gg = (base >> 8) & 255, bb = base & 255; const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))); return (f(r) << 16) | (f(gg) << 8) | f(bb); };
    const holes = HOLE_ANG.map((a) => [CX + Math.cos(a + this.theta) * RING, CY + Math.sin(a + this.theta) * RING]);
    const restHoles = HOLE_ANG.map((a) => [CX + Math.cos(a) * RING, CY + Math.sin(a) * RING]);
    const hovI = this.hover?.kind === 'hole' ? this.hover.i : -1;
    // drop shadow
    for (let y = 0; y < 116; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - CX - 2, y - CY - 3); if (d <= 55) px(x, y, C(0x000000, 110)); }
    for (let y = 0; y < 116; y++) for (let x = 0; x < W; x++) {
      const dx = x - CX + 0.5, dy = y - CY + 0.5, r = Math.hypot(dx, dy);
      if (r > 54.5) continue;
      const lightK = 1 + (-dx - dy) / 160;
      let c: number;
      if (r > PLATE_R + 0.5) {
        // chrome bezel: bright top-left, dark bottom-right, a hard highlight band
        const a = Math.atan2(dy, dx);
        const t = Math.cos(a + 2.35);
        c = t > 0.55 ? 0xf2f4f6 : t > 0 ? 0xb8bcc2 : t > -0.5 ? 0x7c8088 : 0x4a4e56;
        if (r > 53.5) c = shade(c, 0.7);
      } else {
        // which hole (rotated) is this pixel inside?
        let inHole = -1, rim = -1;
        for (let i = 0; i < 8; i++) { const d = Math.hypot(x + 0.5 - holes[i][0], y + 0.5 - holes[i][1]); if (d <= HOLE_R) { inHole = i; break; } if (d <= HOLE_R + 1.2) rim = i; }
        if (inHole >= 0 || r <= 20.5) {
          // the enamel number plate, seen through a hole (or the centre card)
          c = shade(0xe6d8b6, lightK * (r < 20.5 ? 1.04 : 0.96));
          if (r > 20.5) {
            // the pictogram under the hole: plate coordinates (it does not turn)
            for (let i = 0; i < 8; i++) {
              const ix = Math.round(x - restHoles[i][0] + 4.5), iy = Math.round(y - restHoles[i][1] + 4.5);
              if (ix >= 0 && iy >= 0 && ix < 9 && iy < 9 && ICONS[i][iy][ix] === '#') c = i === hovI ? 0xa8281c : 0x2b2219;
            }
          }
        } else if (rim >= 0) {
          const a = Math.atan2(y - holes[rim][1], x - holes[rim][0]);
          c = rim === hovI ? (Math.cos(a + 2.35) > 0 ? 0xffd768 : 0xa97b12) : Math.cos(a + 2.35) > 0 ? 0x4a4440 : 0x0c0a08;
        } else {
          // black bakelite finger wheel, a soft sheen up and left
          const sheen = Math.max(0, Math.cos(Math.atan2(dy, dx) + 2.35)) * Math.max(0, 1 - Math.abs(r - 44) / 6);
          c = shade(0x221c18, 0.9 + sheen * 1.6);
          if (r > 50.2) c = 0x0e0b09;
        }
      }
      px(x, y, C(c));
    }
    // centre card ring
    for (let a = 0; a < 140; a++) { const t = (a / 140) * Math.PI * 2; const c = Math.cos(t + 2.35) > 0 ? 0xe8ecf0 : 0x6a6e76; px(CX + Math.cos(t) * 20.2, CY + Math.sin(t) * 20.2, C(c)); px(CX + Math.cos(t) * 19.4, CY + Math.sin(t) * 19.4, C(shade(c, 0.85))); }
    // card text, typed
    const text = (s: string, cx: number, y: number, ink: number) => {
      const w = s.length * 6 - 1; let x = Math.round(cx - w / 2);
      for (const ch of s) { const bits = glyph5x7(ch); for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (bits[j * 5 + i]) px(x + i, y + j, C(ink)); x += 6; }
    };
    const hv = this.hover;
    const LBL = ['WAVE', 'POINT', 'DANCE', 'SIT', 'SALUTE', 'MOCK', 'CHEER', 'SHRUG'];
    if (hv?.kind === 'hole') text(LBL[hv.i], CX, CY - 3, 0xa8281c);
    else if (hv?.kind === 'key') { text('CALL', CX, CY - 8, 0x2b2219); text(String(hv.i + 1), CX, CY + 1, 0xa8281c); }
    else { text(this.card[0], CX, CY - 8, this.cardRed ? 0xa8281c : 0x2b2219); if (this.card[1]) text(this.card[1], CX, CY + 1, this.cardRed ? 0xa8281c : 0x2b2219); }
    // the finger stop: a chrome hook over the wheel at four o'clock
    for (let r = 43; r <= 57; r++) for (let w = -1.6; w <= 1.6; w += 0.5) {
      const a = STOP + (w / r);
      const c = w < -0.4 ? 0xf2f4f6 : w > 0.6 ? 0x5a5e66 : 0xb8bcc2;
      px(CX + Math.cos(a) * r, CY + Math.sin(a) * r, C(r > 55 ? 0x5a5e66 : c));
    }
    // the whistle keys
    KEYS.forEach((k, i) => {
      const down = i === this.tune, hot = this.hover?.kind === 'key' && this.hover.i === i;
      const oy = down ? 2 : 0;
      for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) {
        const edge = x === 0 || y === 0 || x === k.w - 1 || y === k.h - 1;
        let c = edge ? 0x1a1410 : y < 3 ? 0xf4ead0 : y > k.h - 5 ? 0xa89870 : down ? 0xcfc2a0 : 0xe6d8b6;
        if (hot && !edge && y >= 3 && y <= k.h - 5) c = 0xf6e4b0;
        px(k.x + x, k.y + y + oy, C(c));
      }
      if (!down) for (let x = 1; x < k.w - 1; x++) { px(k.x + x, k.y + k.h, C(0x3a2e24)); px(k.x + x, k.y + k.h + 1, C(0x000000, 120)); }
      const ic = TUNE_ICONS[i];
      for (let y = 0; y < ic.length; y++) for (let x = 0; x < 9; x++) if (ic[y][x] === '#') px(k.x + 7 + x, k.y + 5 + y + oy, C(down ? 0xa8281c : 0x2b2219));
    });
    g.putImageData(img, 0, 0);
  }
}

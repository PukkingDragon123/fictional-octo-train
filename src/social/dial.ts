// The emote dial: a 1950s rotary telephone dial, painted (enamel number
// plate, glossy black bakelite finger wheel, chrome bezel and finger stop),
// redrawn while it turns. A pictogram sits under each of the eight holes
// (wave, point, dance, sit, salute, mock, cheer, shrug); the paper card in
// the middle is typed (what you are about to dial; the line switch for
// opening your floor); four ivory keys under a typed paper strip pick the
// whistle call. Dialling pulls the wheel round to the stop and lets it run
// back, ticking.
import { G } from '../game/G';
import { fontsReady, cssFont } from '../gfx/crt';

const W = 280, H = 352, CX = 140, CY = 140;
const STOP = (60 * Math.PI) / 180;
const R_BEZEL = 134, R_PLATE = 125, RING = 90, HOLE_R = 21, R_CARD = 44;
export const HOLE_ANG = Array.from({ length: 8 }, (_, i) => STOP - ((i + 1) * 30 + 8) * Math.PI / 180);
const KEYS = Array.from({ length: 4 }, (_, i) => ({ x: 20 + i * 62, y: 300, w: 54, h: 40 }));
const LABELS = ['WAVE', 'POINT', 'DANCE', 'SIT', 'SALUTE', 'MOCK', 'CHEER', 'SHRUG'];
const TUNE_LABELS = ['HEY-O', 'COME', 'ALARM', 'TUNE'];
const INK = '#2b2219', RED = '#a8281c';

type Ctx2 = CanvasRenderingContext2D;
/** pictograms, drawn in a 24-unit box centred on (0, 0) */
const ICONS: ((g: Ctx2) => void)[] = [
  (g) => { // wave: an open hand and a swish
    g.beginPath(); g.moveTo(-5, 9); g.lineTo(-6, -1); g.moveTo(-6, -1); g.lineTo(-6, -8); g.moveTo(-2, 0); g.lineTo(-2, -10); g.moveTo(2, 0); g.lineTo(2, -9); g.moveTo(5.5, 1); g.lineTo(5.5, -6);
    g.moveTo(-6, 3); g.lineTo(-10, -1); g.moveTo(-5, 9); g.quadraticCurveTo(5, 11, 5.5, 1); g.stroke();
    g.beginPath(); g.arc(8, -3, 5, -0.9, 0.9); g.stroke();
  },
  (g) => { g.beginPath(); g.moveTo(-10, 0); g.lineTo(8, 0); g.moveTo(2, -6); g.lineTo(9, 0); g.lineTo(2, 6); g.stroke(); },
  (g) => { g.beginPath(); g.moveTo(3, 6); g.lineTo(3, -9); g.lineTo(9, -5); g.stroke(); g.beginPath(); g.ellipse(-0.5, 6, 4, 3, -0.4, 0, Math.PI * 2); g.fill(); },
  (g) => { g.beginPath(); g.moveTo(-6, -10); g.lineTo(-6, 10); g.moveTo(-6, 1); g.lineTo(7, 1); g.lineTo(7, 10); g.moveTo(-6, -10); g.lineTo(-2, -10); g.stroke(); },
  (g) => { g.beginPath(); g.arc(-1, -6, 4, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-1, -2); g.lineTo(-1, 10); g.moveTo(-1, 2); g.lineTo(5, -3); g.lineTo(4, -9); g.moveTo(-1, 2); g.lineTo(-7, 7); g.stroke(); },
  (g) => { g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(-4, -3, 1.4, 0, Math.PI * 2); g.arc(4, -3, 1.4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(-5, 3); g.lineTo(5, 3); g.moveTo(-1, 3); g.quadraticCurveTo(0, 10, 3, 3); g.stroke(); },
  (g) => { g.beginPath(); g.arc(0, -7, 3.5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-9, -11); g.lineTo(0, -1); g.lineTo(9, -11); g.moveTo(0, -3); g.lineTo(0, 5); g.lineTo(-5, 11); g.moveTo(0, 5); g.lineTo(5, 11); g.stroke(); },
  (g) => { g.beginPath(); g.arc(0, -7, 3.5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-11, -5); g.lineTo(-7, 0); g.lineTo(7, 0); g.lineTo(11, -5); g.moveTo(0, -3); g.lineTo(0, 5); g.lineTo(-5, 11); g.moveTo(0, 5); g.lineTo(5, 11); g.stroke(); },
];
const TUNE_ICONS: ((g: Ctx2) => void)[] = [
  (g) => { g.beginPath(); g.moveTo(-10, -5); g.quadraticCurveTo(-2, -6, 0, 0); g.quadraticCurveTo(2, 6, 10, 5); g.stroke(); },
  (g) => { g.beginPath(); g.moveTo(-10, 5); g.lineTo(-4, 5); g.lineTo(-4, 0); g.lineTo(2, 0); g.lineTo(2, -5); g.lineTo(10, -5); g.stroke(); },
  (g) => { g.beginPath(); g.moveTo(-11, 0); for (let k = 0; k < 6; k++) g.lineTo(-9 + k * 4, k % 2 ? -5 : 5); g.lineTo(11, 0); g.stroke(); },
  (g) => { g.beginPath(); g.moveTo(2, 5); g.lineTo(2, -7); g.lineTo(7, -4); g.stroke(); g.beginPath(); g.ellipse(-1, 5, 3.4, 2.5, -0.4, 0, Math.PI * 2); g.fill(); },
];

export type DialHit = { kind: 'hole'; i: number } | { kind: 'card' } | { kind: 'key'; i: number } | null;

export class EmoteDial {
  el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private g: Ctx2 | null;
  private plate: HTMLCanvasElement | null = null;
  private dpr = 1;
  private k = 1;
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
    this.g = this.cv.getContext('2d');
    this.el.appendChild(this.cv);
    const at = (e: PointerEvent) => this.hitAt(e.offsetX / this.k, e.offsetY / this.k);
    this.cv.addEventListener('pointermove', (e) => { const h = at(e); if (JSON.stringify(h) !== JSON.stringify(this.hover)) { this.hover = h; this.dirty = true; } });
    this.cv.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; });
    this.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onPick(at(e)); });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', 'Emote dial');
    document.body.appendChild(this.el);
    // the plate is typed with web fonts: repaint it once they are in
    fontsReady().then(() => { this.plate = null; this.dirty = true; }).catch(() => {});
  }

  place(x: number, y: number) {
    this.k = Math.max(0.62, Math.min(1, Math.min(window.innerWidth, window.innerHeight) / 620));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr !== this.dpr || this.cv.width !== Math.round(W * this.k * dpr)) {
      this.dpr = dpr;
      this.cv.width = Math.round(W * this.k * dpr); this.cv.height = Math.round(H * this.k * dpr);
      this.plate = null;
    }
    this.cv.style.width = W * this.k + 'px'; this.cv.style.height = H * this.k + 'px';
    const left = Math.max(8, Math.min(window.innerWidth - W * this.k - 8, x - CX * this.k));
    const top = Math.max(8, Math.min(window.innerHeight - H * this.k - 8, y - CY * this.k));
    this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    this.dirty = true;
  }
  centre(): [number, number] { const r = this.cv.getBoundingClientRect(); return [r.left + CX * this.k, r.top + CY * this.k]; }
  /** the hole nearest a screen direction from the centre (aiming with G held) */
  holeToward(mx: number, my: number): number {
    const [cx, cy] = this.centre();
    const dx = mx - cx, dy = my - cy;
    if (Math.hypot(dx, dy) < R_CARD * this.k) return -1;
    const a = Math.atan2(dy, dx);
    let best = -1, bd = 9;
    HOLE_ANG.forEach((h, i) => { let d = Math.abs(a - h) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; if (d < bd && d < 0.4) { bd = d; best = i; } });
    return best;
  }
  hitAt(x: number, y: number): DialHit {
    if (Math.hypot(x - CX, y - CY) <= R_CARD) return { kind: 'card' };
    for (let i = 0; i < 8; i++) if (Math.hypot(x - CX - Math.cos(HOLE_ANG[i]) * RING, y - CY - Math.sin(HOLE_ANG[i]) * RING) <= HOLE_R + 3) return { kind: 'hole', i };
    for (let i = 0; i < 4; i++) { const k = KEYS[i]; if (x >= k.x && x < k.x + k.w && y >= k.y - 6 && y < k.y + k.h) return { kind: 'key', i }; }
    return null;
  }

  /** pull hole i round to the finger stop; cb fires when it gets there */
  dial(i: number, cb: () => void) {
    if (this.pull) return;
    this.pull = { i, target: ((i + 1) * 30 + 8) * Math.PI / 180, fired: false, back: false, cb };
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

  // ---------------------------------------------------------------- painting
  /** the static parts: bezel, enamel plate with its pictograms, the key strip */
  private paintPlate(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.cv.width; c.height = this.cv.height;
    const g = c.getContext('2d')!;
    g.scale(this.k * this.dpr, this.k * this.dpr);
    // chrome bezel
    const bz = g.createLinearGradient(CX - R_BEZEL, CY - R_BEZEL, CX + R_BEZEL, CY + R_BEZEL);
    bz.addColorStop(0, '#f4f6f8'); bz.addColorStop(0.3, '#aab0b8'); bz.addColorStop(0.55, '#e6eaee'); bz.addColorStop(0.8, '#6c7078'); bz.addColorStop(1, '#3a3e44');
    g.beginPath(); g.arc(CX, CY, R_BEZEL, 0, Math.PI * 2); g.fillStyle = bz; g.fill();
    g.beginPath(); g.arc(CX, CY, R_BEZEL - 1, 0, Math.PI * 2); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.stroke();
    // enamel number plate with a little age in it
    const pl = g.createRadialGradient(CX - 30, CY - 40, 10, CX, CY, R_PLATE);
    pl.addColorStop(0, '#f6efdc'); pl.addColorStop(0.7, '#e9dfc4'); pl.addColorStop(1, '#cdbf9c');
    g.beginPath(); g.arc(CX, CY, R_PLATE, 0, Math.PI * 2); g.fillStyle = pl; g.fill();
    let h = 12345;
    for (let i = 0; i < 260; i++) {
      h = (h * 1103515245 + 12345) >>> 0; const a = (h / 4294967296) * Math.PI * 2; h = (h * 1103515245 + 12345) >>> 0; const r = Math.sqrt(h / 4294967296) * R_PLATE;
      g.fillStyle = i % 3 ? 'rgba(90,70,40,0.07)' : 'rgba(255,255,255,0.12)'; g.fillRect(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 1.4, 1.4);
    }
    // pictograms and numbers printed on the plate (seen through the holes)
    g.lineCap = 'round'; g.lineJoin = 'round';
    HOLE_ANG.forEach((a, i) => {
      const x = CX + Math.cos(a) * RING, y = CY + Math.sin(a) * RING;
      g.save(); g.translate(x, y - 2); g.scale(0.78, 0.78);
      g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2.3;
      ICONS[i](g);
      g.restore();
      g.font = `700 9px ${cssFont('--font-typeset')}`; g.fillStyle = 'rgba(43,34,25,0.75)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), x + 12, y + 12);
    });
    // the typed paper strip over the whistle keys, and the keys' wooden bed
    const sy = KEYS[0].y - 26;
    g.fillStyle = '#3a2a1e'; roundRect(g, 10, sy - 8, W - 20, 82, 10); g.fill();
    const wood = g.createLinearGradient(0, sy - 8, 0, sy + 74);
    wood.addColorStop(0, '#5a4030'); wood.addColorStop(1, '#2a1c12');
    g.fillStyle = wood; roundRect(g, 12, sy - 6, W - 24, 78, 9); g.fill();
    g.fillStyle = '#efe5cb'; g.fillRect(18, sy - 1, W - 36, 18);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.strokeRect(18.5, sy - 0.5, W - 37, 17);
    g.font = `12px ${cssFont('--font-type')}`; g.fillStyle = INK; g.textBaseline = 'middle';
    KEYS.forEach((k, i) => g.fillText(TUNE_LABELS[i], k.x + k.w / 2, sy + 8.5));
    return c;
  }

  private draw() {
    this.dirty = false;
    const g = this.g; if (!g) return;
    if (!this.plate) this.plate = this.paintPlate();
    const sc = this.k * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.plate, 0, 0);
    g.setTransform(sc, 0, 0, sc, 0, 0);
    const hov = this.hover?.kind === 'hole' ? this.hover.i : -1;
    // the finger wheel: black bakelite with the holes cut through it
    const holes = HOLE_ANG.map((a) => [CX + Math.cos(a + this.theta) * RING, CY + Math.sin(a + this.theta) * RING]);
    g.beginPath();
    g.arc(CX, CY, R_PLATE - 3, 0, Math.PI * 2);
    for (const [x, y] of holes) { g.moveTo(x + HOLE_R, y); g.arc(x, y, HOLE_R, 0, Math.PI * 2, true); }
    g.moveTo(CX + R_CARD + 4, CY); g.arc(CX, CY, R_CARD + 4, 0, Math.PI * 2, true);
    const bk = g.createRadialGradient(CX - 40, CY - 50, 10, CX, CY, R_PLATE);
    bk.addColorStop(0, '#3e3630'); bk.addColorStop(0.55, '#1c1714'); bk.addColorStop(1, '#0c0a08');
    g.fillStyle = bk; g.fill('evenodd');
    // gloss: a long soft highlight up and to the left (only on the bakelite)
    g.save();
    g.clip('evenodd');
    g.beginPath(); g.arc(CX, CY, R_PLATE - 12, Math.PI * 1.05, Math.PI * 1.42); g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 9; g.lineCap = 'round'; g.stroke();
    g.beginPath(); g.arc(CX, CY, R_PLATE - 12, Math.PI * 1.1, Math.PI * 1.3); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.stroke();
    g.restore();
    // hole rims: a chrome lip, brass when hovered
    holes.forEach(([x, y], i) => {
      const rg = g.createLinearGradient(x - HOLE_R, y - HOLE_R, x + HOLE_R, y + HOLE_R);
      if (i === hov) { rg.addColorStop(0, '#ffe08a'); rg.addColorStop(1, '#8a5a10'); } else { rg.addColorStop(0, '#9aa0a8'); rg.addColorStop(1, '#16120f'); }
      g.beginPath(); g.arc(x, y, HOLE_R + 0.5, 0, Math.PI * 2); g.strokeStyle = rg; g.lineWidth = i === hov ? 3.5 : 2; g.stroke();
    });
    // the centre card, typed
    g.beginPath(); g.arc(CX, CY, R_CARD + 3, 0, Math.PI * 2);
    const cr = g.createLinearGradient(CX - R_CARD, CY - R_CARD, CX + R_CARD, CY + R_CARD); cr.addColorStop(0, '#f2f4f6'); cr.addColorStop(1, '#5a5e66');
    g.fillStyle = cr; g.fill();
    const cg = g.createRadialGradient(CX - 10, CY - 14, 4, CX, CY, R_CARD);
    cg.addColorStop(0, '#fbf6e8'); cg.addColorStop(1, '#e2d6b6');
    g.beginPath(); g.arc(CX, CY, R_CARD, 0, Math.PI * 2); g.fillStyle = cg; g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const hv = this.hover;
    const type = (s: string, y: number, size: number, col: string) => { g.font = `${size}px ${cssFont('--font-type')}`; g.fillStyle = col; g.fillText(s, CX, y); };
    if (hv?.kind === 'hole') type(LABELS[hv.i], CY + 1, 20, RED);
    else if (hv?.kind === 'key') { type('WHISTLE', CY - 9, 13, INK); type(TUNE_LABELS[hv.i], CY + 11, 17, RED); }
    else { type(this.card[0], CY - (this.card[1] ? 9 : 0), this.card[1] ? 17 : 20, this.cardRed ? RED : INK); if (this.card[1]) type(this.card[1], CY + 12, 15, this.cardRed ? RED : INK); }
    // the finger stop: a chrome hook over the wheel at four o'clock
    const x0 = CX + Math.cos(STOP) * (RING + 8), y0 = CY + Math.sin(STOP) * (RING + 8), x1 = CX + Math.cos(STOP) * (R_BEZEL + 2), y1 = CY + Math.sin(STOP) * (R_BEZEL + 2);
    const sg = g.createLinearGradient(x0 - 5, y0 - 5, x0 + 5, y0 + 5); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.5, '#b8bcc2'); sg.addColorStop(1, '#4a4e56');
    g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = '#26282c'; g.lineWidth = 9; g.stroke();
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = sg; g.lineWidth = 6; g.stroke();
    // whistle keys: ivory, the chosen one pressed in
    KEYS.forEach((k, i) => {
      const down = i === this.tune, hot = this.hover?.kind === 'key' && this.hover.i === i;
      const oy = down ? 3 : 0;
      g.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(g, k.x + 1, k.y + 3, k.w, k.h, 6); g.fill();
      const kg = g.createLinearGradient(0, k.y + oy, 0, k.y + oy + k.h);
      kg.addColorStop(0, hot ? '#fff6dc' : '#f6ecd2'); kg.addColorStop(0.75, down ? '#cdbf9a' : '#e2d5b2'); kg.addColorStop(1, '#a8986e');
      g.fillStyle = kg; roundRect(g, k.x, k.y + oy, k.w, k.h - oy, 6); g.fill();
      g.strokeStyle = 'rgba(40,28,16,0.6)'; g.lineWidth = 1; roundRect(g, k.x + 0.5, k.y + oy + 0.5, k.w - 1, k.h - oy - 1, 6); g.stroke();
      g.save(); g.translate(k.x + k.w / 2, k.y + oy + k.h / 2); g.strokeStyle = down ? RED : INK; g.fillStyle = down ? RED : INK; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round'; TUNE_ICONS[i](g); g.restore();
    });
  }
}

function roundRect(g: Ctx2, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// THE TOOL BELT (round 18b): the six quick slots as a worn leather belt along the bottom of the screen, painted
// pixel art. Holders hang from it in turn: a leather pouch (its flap folded back and snapped open while something
// pokes up out of its mouth, buckled shut when empty) and a loop with a backing plate (the thing pushed through
// it). A riveted brass plate on the belt above each is stamped with its key. The one in the hand is pulled up out
// of its holder and lit warm; a count rides on a small stitched tag. Things picked up drop into it with a bounce.
import type { Item } from '../../items/item';
import { Px, PAL, hex, mix, mul, leather, weave, stitchLine, stitchRect, rivet, buckle, digits, digitsW, type C3 } from '../fpack/paint';
import { iconImg, onIcons } from '../fpack/board';

export const BELT_N = 6;
const ICON = 44;

export interface BeltSlot { it: Item | null; n: number; held: boolean; hover: boolean }

const POUCH: C3[] = [hex(0x6e4a2c), hex(0x5c5a36), hex(0x7a5232)];

/** a leather body shaded like a soft cylinder (light down its middle), chamfered at the bottom corners */
function pouchBody(p: Px, x0: number, y0: number, w: number, h: number, base: C3, seed: number) {
  leather(p, x0, y0, w, h, base, { seed, edge: false });
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const cut = Math.max(0, 5 - (h - 1 - j)) ;
    if (i < cut || i > w - 1 - cut) { const k = (y0 + j) * p.w + x0 + i; p.d[k * 4 + 3] = 0; continue; }
    const u = i / (w - 1), v = j / (h - 1);
    const k = (0.68 + Math.sin(u * Math.PI) * 0.46) * (1.06 - v * 0.22);
    p.shade(x0 + i, y0 + j, k);
  }
  // outline: dark edge all round, a burnished highlight down the left
  for (let j = 0; j < h; j++) {
    const cut = Math.max(0, 5 - (h - 1 - j));
    p.put(x0 + cut, y0 + j, mul(base, 0.42)); p.put(x0 + w - 1 - cut, y0 + j, mul(base, 0.36));
    if (j > 2 && j < h - 6) p.put(x0 + cut + 1, y0 + j, mul(base, 1.25), 0.6);
  }
  for (let i = 5; i < w - 5; i++) p.put(x0 + i, y0 + h - 1, mul(base, 0.36));
  for (let i = 0; i < 5; i++) { p.put(x0 + i, y0 + h - 6 + i, mul(base, 0.4)); p.put(x0 + w - 1 - i, y0 + h - 6 + i, mul(base, 0.36)); }
  // the stitched seam inside the edge and a soft crease up the middle
  stitchLine(p, x0 + 3, y0 + 4, x0 + 3, y0 + h - 7, PAL.thread, 0.85); stitchLine(p, x0 + w - 4, y0 + 4, x0 + w - 4, y0 + h - 7, PAL.thread, 0.85);
  stitchLine(p, x0 + 7, y0 + h - 4, x0 + w - 8, y0 + h - 4, PAL.thread, 0.85);
  for (let j = 6; j < h - 6; j++) p.shade(x0 + (w >> 1) + ((j >> 3) & 1), y0 + j, 0.9);
}

export class Belt {
  readonly cv = document.createElement('canvas');
  HS = 64; L = 30; W = 0; H = 100;
  private bg: HTMLCanvasElement | null = null;
  private fronts = new Map<string, HTMLCanvasElement>();
  private backs = new Map<string, HTMLCanvasElement>();
  private raise = new Array(BELT_N).fill(0);
  private bounce = new Array(BELT_N).fill(0);
  private bv = new Array(BELT_N).fill(0);
  slots: BeltSlot[] = new Array(BELT_N).fill(0).map(() => ({ it: null, n: 0, held: false, hover: false }));
  private moving = true;

  constructor() {
    this.cv.className = 'hb-belt';
    this.size(false);
    onIcons(() => { this.moving = true; });
  }
  size(narrow: boolean) {
    const HS = narrow ? 58 : 64, L = narrow ? 10 : 30;
    if (HS === this.HS && this.W) return;
    this.HS = HS; this.L = L; this.W = L * 2 + HS * BELT_N;
    this.cv.width = this.W; this.cv.height = this.H;
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.bg = null; this.fronts.clear(); this.backs.clear(); this.moving = true;
  }
  /** slot index (0..5) at a canvas x, or -1 */
  slotAtX(x: number): number { const i = Math.floor((x - this.L) / this.HS); return i >= 0 && i < BELT_N ? i : -1; }
  /** canvas point where a slot's thing sits */
  slotPoint(i: number): { x: number; y: number } { return { x: this.L + i * this.HS + this.HS / 2, y: 40 }; }
  kick(i: number) { if (i >= 0 && i < BELT_N) { this.bv[i] -= 70; this.moving = true; } }
  set(slots: BeltSlot[]) { this.slots = slots; this.moving = true; }

  update(dt: number) {
    dt = Math.min(0.05, dt);
    let live = this.moving;
    for (let i = 0; i < BELT_N; i++) {
      const g = this.slots[i].held ? 1 : 0;
      const r = this.raise[i] + (g - this.raise[i]) * Math.min(1, dt * 14);
      if (Math.abs(r - this.raise[i]) > 0.002) live = true;
      this.raise[i] = Math.abs(r - g) < 0.002 ? g : r;
      this.bv[i] += (-this.bounce[i] * 320 - this.bv[i] * 16) * dt; this.bounce[i] += this.bv[i] * dt;
      if (Math.abs(this.bounce[i]) > 0.05 || Math.abs(this.bv[i]) > 0.5) live = true; else { this.bounce[i] = 0; this.bv[i] = 0; }
    }
    if (!live) return;
    this.moving = false;
    this.draw();
  }

  // ---------------------------------------------------------------- painting
  private paintBg(): HTMLCanvasElement {
    const p = new Px(this.W, this.H, 401);
    const by = 24, bh = 19;
    // the belt: thick worn leather, stitched along both edges, a frame buckle at the left end, the tongue's holes at the right
    leather(p, 2, by, this.W - 4, bh, hex(0x5e3c22), { seed: 3 });
    for (let i = 2; i < this.W - 2; i++) { p.put(i, by + 1, hex(0x8a6040)); p.film(i, by + bh, [0, 0, 0], 0.5); p.film(i, by + bh + 1, [0, 0, 0], 0.25); }
    stitchLine(p, 3, by + 3, this.W - 5, by + 3, PAL.thread, 0.85); stitchLine(p, 3, by + bh - 4, this.W - 5, by + bh - 4, PAL.thread, 0.85);
    if (this.L > 20) {
      buckle(p, 5, by - 4, 20, bh + 8);
      for (let h = 0; h < 3; h++) { const hx = this.W - 24 + h * 7; p.rect(hx, by + 8, 2, 3, hex(0x1a120a)); p.put(hx, by + 7, hex(0x8a6040)); }
    }
    // worn creases
    for (let x = 44; x < this.W - 20; x += 57) for (let j = 4; j < bh - 4; j++) p.shade(x + (j & 1), by + j, 0.84);
    // the stamped brass key plates, each on the belt over its holder
    for (let i = 0; i < BELT_N; i++) {
      const cx = this.L + i * this.HS + this.HS / 2;
      const px = Math.round(cx - 7), py = by + 4;
      for (let j = 0; j < 11; j++) for (let k = 0; k < 15; k++) {
        const edge = k === 0 || j === 0 || k === 14 || j === 10;
        p.put(px + k, py + j, edge ? (k === 14 || j === 10 ? PAL.brassD : PAL.brassL) : mul(PAL.brass, 0.9 + ((k + j) & 1) * 0.07 - j * 0.012));
      }
      for (let j = 0; j < 11; j++) p.film(px + 15, py + j + 1, [0, 0, 0], 0.45);
      for (let k = 0; k < 15; k++) p.film(px + k + 1, py + 11, [0, 0, 0], 0.45);
      digits(p, px + 6, py + 3, String(i + 1), hex(0x3a2610), mul(PAL.brassL, 1.0));
      rivet(p, px + 1, py + 1); rivet(p, px + 11, py + 1);
    }
    return p.done();
  }

  /** what sits in front of the thing: the pouch's body (open or flapped shut) / the loop's band */
  private front(i: number, full: boolean): HTMLCanvasElement {
    const key = i + (full ? 'f' : 'e');
    const hit = this.fronts.get(key); if (hit) return hit;
    const HS = this.HS, w = HS - 10, x0 = 5;
    const p = new Px(HS, this.H, 500 + i);
    if (i % 2 === 0) {
      const base = POUCH[(i >> 1) % POUCH.length];
      const top = 52, h = this.H - top - 2;
      // the hanging tab from the belt with its two rivets
      leather(p, (HS >> 1) - 7, 36, 14, top - 34, mul(base, 0.9), { seed: 40 + i });
      rivet(p, (HS >> 1) - 5, 39); rivet(p, (HS >> 1) + 2, 39);
      pouchBody(p, x0, top, w, h, base, 10 + i);
      // the rolled mouth
      for (let k = 2; k < w - 2; k++) { p.put(x0 + k, top, mul(base, 1.45)); p.put(x0 + k, top + 1, mul(base, 1.15)); p.put(x0 + k, top + 2, mul(base, 0.7)); }
      if (!full) {
        // empty: the flap is down over the mouth, its snap closed
        const fw = w - 6, fh = 17;
        pouchBody(p, x0 + 3, top - 4, fw, fh, mul(base, 1.08), 20 + i);
        for (let k = 0; k < fw - 8; k++) p.film(x0 + 7 + k, top - 4 + fh, [0, 0, 0], 0.45);
        p.disc(x0 + 3 + (fw >> 1), top + fh - 10, 2, PAL.steel); p.put(x0 + 2 + (fw >> 1), top + fh - 11, hex(0xeef0e8));
      }
    } else {
      // a loop: a band of leather across the belt, the thing pushed through it, a snap tab
      const lw = 15, lx = Math.round(HS / 2 - lw / 2), top = 20, h = 50;
      leather(p, lx, top, lw, h, hex(0x7a5232), { seed: 30 + i });
      for (let j = 0; j < h; j++) { const k = 0.75 + Math.sin(((j) / (h - 1)) * Math.PI) * 0.35; for (let q = 0; q < lw; q++) p.shade(lx + q, top + j, k); }
      stitchLine(p, lx + 2, top + 3, lx + 2, top + h - 4, PAL.thread, 0.85); stitchLine(p, lx + lw - 3, top + 3, lx + lw - 3, top + h - 4, PAL.thread, 0.85);
      for (let j = 0; j < h; j++) { p.film(lx + lw, top + j, [0, 0, 0], 0.45); p.film(lx + lw + 1, top + j, [0, 0, 0], 0.2); }
      p.disc(lx + 7, top + h - 9, 2, PAL.steel); p.put(lx + 6, top + h - 10, hex(0xeef0e8));
    }
    const cv = p.done(); this.fronts.set(key, cv); return cv;
  }
  /** what is behind the thing: the pouch's dark mouth and its flap folded back up over the belt / the loop's backing plate */
  private back(i: number, full: boolean): HTMLCanvasElement | null {
    const key = i + (full ? 'f' : 'e');
    if (this.backs.has(key)) return this.backs.get(key)!;
    const HS = this.HS, w = HS - 10;
    const p = new Px(HS, this.H, 700 + i);
    if (i % 2 === 0) {
      if (!full) { this.backs.set(key, null as unknown as HTMLCanvasElement); return null; }
      const base = POUCH[(i >> 1) % POUCH.length];
      // the flap folded back, hanging over the belt, its snap open
      const fw = w - 8, fx = 9, fy = 8;
      pouchBody(p, fx, fy, fw, 28, mul(base, 0.85), 60 + i);
      p.disc(fx + (fw >> 1), fy + 6, 2, PAL.steelD); p.put(fx + (fw >> 1) - 1, fy + 5, PAL.steel);
      // the dark inside of the mouth
      weave(p, 7, 46, w - 4, 8, mul(PAL.leatherD, 0.45), { seed: i, dirt: 0.1, wear: 0 });
      for (let k = 0; k < w - 4; k++) for (let j = 0; j < 8; j++) p.shade(7 + k, 46 + j, 0.5 + j * 0.05);
    } else {
      // a stiff backing plate the loop is riveted through
      const bw = w - 8, bx = 9, byy = 14;
      leather(p, bx, byy, bw, 62, hex(0x4a2e1a), { seed: 80 + i, stitch: true });
      for (let j = 0; j < 62; j++) for (let k = 0; k < bw; k++) p.shade(bx + k, byy + j, 0.8 + Math.sin(k / (bw - 1) * Math.PI) * 0.25);
      for (let k = 0; k < bw; k++) p.film(bx + k + 1, byy + 62, [0, 0, 0], 0.45);
    }
    const cv = p.done(); this.backs.set(key, cv); return cv;
  }

  private draw() {
    if (!this.bg) this.bg = this.paintBg();
    const c = this.cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, this.W, this.H);
    for (let i = 0; i < BELT_N; i++) {
      const s = this.slots[i], ox = this.L + i * this.HS;
      if (i % 2 === 1) { const b = this.back(i, !!s.it); if (b) c.drawImage(b, ox, 0); }
    }
    c.drawImage(this.bg, 0, 0);
    for (let i = 0; i < BELT_N; i++) {
      const ox = this.L + i * this.HS, s = this.slots[i];
      if (i % 2 === 0) { const b = this.back(i, !!s.it); if (b) c.drawImage(b, ox, 0); }
      const r = this.raise[i], bo = this.bounce[i];
      if (s.it) {
        const im = iconImg(s.it, ICON);
        const pouch = i % 2 === 0;
        const x = Math.round(ox + this.HS / 2 - ICON / 2), y = Math.round((pouch ? 22 : 26) - r * 19 + bo * 0.12);
        // lit: a warm glow behind the drawn thing
        if (r > 0.05) {
          const g = c.createRadialGradient(x + ICON / 2, y + ICON / 2, 2, x + ICON / 2, y + ICON / 2, ICON * 0.8);
          g.addColorStop(0, `rgba(255,214,130,${0.5 * r})`); g.addColorStop(0.6, `rgba(255,170,70,${0.18 * r})`); g.addColorStop(1, 'rgba(255,160,60,0)');
          c.fillStyle = g; c.fillRect(x - 14, y - 14, ICON + 28, ICON + 28);
        }
        if (im) {
          c.save(); c.globalAlpha = 0.5; c.filter = 'brightness(0)'; c.drawImage(im, x + 2, y + 3, ICON, ICON); c.restore();
          c.save(); c.filter = r > 0.05 ? `brightness(${1 + r * 0.2}) saturate(${1 + r * 0.1})` : s.hover ? 'brightness(1.1)' : 'brightness(.95)'; c.drawImage(im, x, y, ICON, ICON); c.restore();
          if (r > 0.5) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.22 * r; c.drawImage(im, x, y - 1, ICON, ICON); c.restore(); }
        }
      }
      c.drawImage(this.front(i, !!s.it), ox, 0);
      if (s.hover && !s.held) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.08; c.drawImage(this.front(i, !!s.it), ox, 0); c.restore(); }
      if (s.it && s.n > 1) this.tag(c, ox + this.HS - 10, this.H - 18, s.n);
    }
  }
  private tag(c: CanvasRenderingContext2D, rx: number, y: number, n: number) {
    const s = n > 99 ? '99' : String(n), w = digitsW(s) + 7, h = 10;
    const t = new Px(w + 2, h + 6, n * 3);
    // a cloth tag on a short thread
    t.line(Math.round(w / 2), 0, Math.round(w / 2), 2, PAL.thread);
    weave(t, 0, 3, w, h, hex(0xe0d4a8), { seed: 5, dirt: 0.2, wear: 0.1 });
    stitchRect(t, 0, 3, w, h, mul(hex(0xd8cca0), 0.7), 0.7);
    for (let i = 0; i < w; i++) t.put(i + 1, h + 3, [0, 0, 0], 0.45);
    for (let j = 0; j < h; j++) t.put(w, j + 4, [0, 0, 0], 0.45);
    digits(t, 4, 5, s, hex(0x2a2014), null);
    c.drawImage(t.done(), Math.round(rx - w / 2), y);
  }
}
void mix;

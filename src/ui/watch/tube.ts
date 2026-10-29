// Drawing on the watch's CRT. The tube itself is src/gfx/crt.ts (curved glass,
// beam scanlines, aperture grille, bloom, roll, flicker); this is the pen: a
// small 2D API in "character-cell" units (a 224 x 136 field, 6-unit monospace
// advance, 9-unit lines) that paints into the tube's canvas at a higher
// resolution with the game's typefaces: the CRT face (--font-crt) for the
// terminal, the tube-digit face (--font-nixie) for big digits (font tokens from
// src/ui/fonts.css, read through cssFont so a font swap reaches the watch). Colours are packed the way Screen.c packs them (font5x7), so the
// page code can pass the same palette values.
import { cssFont } from '../../gfx/crt';

/** the font tokens, re-read now and then (the user can change faces at runtime) */
let MONO = 'monospace', NIXIE = 'monospace', fontAt = -1e9;
function faces() {
  const now = performance.now();
  if (now - fontAt < 2000) return;
  fontAt = now;
  MONO = cssFont('--font-crt', 'monospace');
  NIXIE = cssFont('--font-nixie', MONO);
}

export class Tube {
  private css = new Map<number, string>();
  /** hint for pages: true once the web fonts have loaded */
  fontsOk = false;

  constructor(public ctx: CanvasRenderingContext2D, public readonly w: number, public readonly h: number, public k: number) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.textBaseline = 'alphabetic';
    ctx.lineCap = 'square';
  }

  /** packed (Screen.c) colour to CSS */
  col(c: number): string {
    let s = this.css.get(c);
    if (!s) { s = `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`; this.css.set(c, s); }
    return s;
  }

  clear(rgb: number) { this.ctx.fillStyle = `#${rgb.toString(16).padStart(6, '0')}`; this.ctx.fillRect(0, 0, this.w, this.h); }
  px(x: number, y: number, c: number) { this.ctx.fillStyle = this.col(c); this.ctx.fillRect(x | 0, y | 0, 1, 1); }
  rect(x: number, y: number, w: number, h: number, c: number) { if (w <= 0 || h <= 0) return; this.ctx.fillStyle = this.col(c); this.ctx.fillRect(x, y, w, h); }
  /** a 1-unit outline inside the box */
  frame(x: number, y: number, w: number, h: number, c: number) {
    const g = this.ctx; g.fillStyle = this.col(c);
    g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  }
  hline(x0: number, x1: number, y: number, c: number, dash = 0) {
    const g = this.ctx; g.fillStyle = this.col(c);
    if (!dash) { g.fillRect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1); return; }
    for (let x = x0; x <= x1; x += dash) g.fillRect(x, y, Math.max(1, dash / 2), 1);
  }
  vline(x: number, y0: number, y1: number, c: number) { this.ctx.fillStyle = this.col(c); this.ctx.fillRect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, w = 1) {
    const g = this.ctx; g.strokeStyle = this.col(c); g.lineWidth = w;
    g.beginPath(); g.moveTo(x0 + 0.5, y0 + 0.5); g.lineTo(x1 + 0.5, y1 + 0.5); g.stroke();
  }
  /** a ring on the tube: drawn as a polygon (octagon, more sides when big), never a smooth circle */
  circle(cx: number, cy: number, r: number, c: number, dash = 0) {
    const g = this.ctx; g.strokeStyle = this.col(c); g.lineWidth = 1; g.lineJoin = 'miter';
    if (dash) g.setLineDash([dash * 0.6, dash * 0.6]);
    const n = r > 40 ? 12 : r > 14 ? 10 : 8;
    g.beginPath();
    for (let i = 0; i <= n; i++) { const a = Math.PI / n + (i / n) * Math.PI * 2, x = cx + 0.5 + Math.cos(a) * r, y = cy + 0.5 + Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    if (dash) g.setLineDash([]);
  }
  /** a dot / blip: a diamond for small ones, a filled octagon for big ones */
  disc(cx: number, cy: number, r: number, c: number) {
    const g = this.ctx; g.fillStyle = this.col(c);
    const R = Math.max(0.7, r + 0.4), n = R > 3 ? 8 : 4;
    g.beginPath();
    for (let i = 0; i < n; i++) { const a = (n === 4 ? 0 : Math.PI / 8) + (i / n) * Math.PI * 2, x = cx + 0.5 + Math.cos(a) * R, y = cy + 0.5 + Math.sin(a) * R; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
  }
  /** a polyline through [x, y, x, y, ...] */
  poly(pts: number[], c: number, w = 1) {
    const g = this.ctx; g.strokeStyle = this.col(c); g.lineWidth = w; g.lineJoin = 'miter';
    g.beginPath(); for (let i = 0; i < pts.length; i += 2) { if (i) g.lineTo(pts[i], pts[i + 1]); else g.moveTo(pts[i], pts[i + 1]); } g.stroke();
  }

  /** monospace text: the cell is 6 x 9 units per scale; y is the top of the capitals. Returns the width. */
  text(s: string, x: number, y: number, c: number, scale = 1, maxW = 9999, font?: 'nixie'): number {
    const adv = 6 * scale;
    let str = String(s);
    if (str.length * adv > maxW) { const n = Math.max(0, Math.floor(maxW / adv) - 1); str = str.slice(0, n) + '…'; }
    const g = this.ctx;
    faces();
    g.fillStyle = this.col(c);
    if (font === 'nixie') {
      g.font = `${Math.round(13 * scale)}px ${NIXIE}`;
      g.fillText(str, x, y + 8.6 * scale);
      return g.measureText(str).width;
    }
    g.font = `${scale === 1 ? 600 : 700} ${10 * scale}px ${MONO}`;
    g.fillText(str, x, y + 7.2 * scale, str.length * adv + 1);
    return str.length * adv;
  }
  textW(s: string, scale = 1) { return [...String(s)].length * 6 * scale; }
  /** word-wrapped text; returns the lines used */
  para(s: string, x: number, y: number, w: number, c: number, lineH = 9, maxLines = 99): number {
    const words = String(s).split(/\s+/);
    let line = '', n = 0;
    const flush = () => { if (n < maxLines) this.text(line, x, y + n * lineH, c); n++; line = ''; };
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (this.textW(test) > w && line) { flush(); line = wd; } else line = test;
    }
    if (line) flush();
    return n;
  }
  bar(x: number, y: number, w: number, h: number, v: number, fg: number, bg: number) {
    this.frame(x, y, w, h, fg);
    this.rect(x + 1, y + 1, w - 2, h - 2, bg);
    const f = Math.round((w - 2) * Math.max(0, Math.min(1, v)));
    if (f > 0) this.rect(x + 1, y + 1, f, h - 2, fg);
  }
  /** a whole-tube wash (the flash when something lands) */
  wash(c: number, a: number) { if (a <= 0.01) return; const g = this.ctx; g.globalAlpha = Math.min(1, a); g.fillStyle = this.col(c); g.fillRect(0, 0, this.w, this.h); g.globalAlpha = 1; }
}

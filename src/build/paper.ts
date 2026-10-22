// Physical paper for first-person props: blueprint sheets, index cards, gauge
// faces, label tape, paper flags. A 2D canvas on a CanvasTexture, printed in
// real type (the game's web fonts: typewriter, enamel-sign, pencil), with
// paper grain, ruling and stains, so text only ever exists ON something.
import * as THREE from 'three';
import { G } from '../game/G';
import { fontsReady, cssFont } from '../gfx/crt';

/** font families come from the game's type tokens (src/ui/fonts.css), resolved when drawing so a face swap just works */
export const FONT = {
  get type() { return cssFont('--font-type', 'monospace'); },
  get typeset() { return cssFont('--font-typeset', 'monospace'); },
  get sign() { return cssFont('--font-sign', 'sans-serif'); },
  get pen() { return cssFont('--font-pen', 'cursive'); },
  get nixie() { return cssFont('--font-nixie', 'monospace'); },
  get crt() { return cssFont('--font-crt', 'monospace'); },
};
let fontsOk = false;
const waiting = new Set<() => void>();
fontsReady().then(() => { fontsOk = true; for (const f of waiting) f(); waiting.clear(); });
/** run once the fonts are in (immediately if they already are): redraw printed paper */
export function whenFonts(f: () => void) { if (fontsOk) f(); else waiting.add(f); }

const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
function hash(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export interface TextOpts { font?: string; size?: number; color?: number; align?: CanvasTextAlign; maxW?: number; weight?: string; alpha?: number; rot?: number }

export class Sheet {
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  constructor(public w: number, public h: number) {
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
    this.ctx = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }
  commit() { this.tex.needsUpdate = true; }

  fill(c: number) { this.ctx.fillStyle = css(c); this.ctx.fillRect(0, 0, this.w, this.h); }
  rect(x: number, y: number, w: number, h: number, c: number, alpha = 1) { const g = this.ctx; g.globalAlpha = alpha; g.fillStyle = css(c); g.fillRect(x, y, w, h); g.globalAlpha = 1; }
  frame(x: number, y: number, w: number, h: number, c: number, lw = 1) { const g = this.ctx; g.strokeStyle = css(c); g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, lw = 1, dash: number[] = []) {
    const g = this.ctx; g.strokeStyle = css(c); g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
  }
  circle(cx: number, cy: number, r: number, c: number, lw = 1, fill = false) {
    const g = this.ctx; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    if (fill) { g.fillStyle = css(c); g.fill(); } else { g.strokeStyle = css(c); g.lineWidth = lw; g.stroke(); }
  }
  /** printed text; returns its width */
  text(s: string, x: number, y: number, o: TextOpts = {}): number {
    const g = this.ctx;
    g.save();
    g.font = `${o.weight ?? ''} ${o.size ?? 14}px ${o.font ?? FONT.type}`;
    g.textAlign = o.align ?? 'left'; g.textBaseline = 'top';
    g.fillStyle = css(o.color ?? 0x222222); g.globalAlpha = o.alpha ?? 1;
    let str = s;
    if (o.maxW) while (str.length > 1 && g.measureText(str).width > o.maxW) str = str.slice(0, -2) + '…';
    if (o.rot) { g.translate(x, y); g.rotate(o.rot); g.fillText(str, 0, 0); } else g.fillText(str, x, y);
    const w = g.measureText(str).width;
    g.restore();
    return w;
  }
  /** a rubber stamp: a double box and capitals, crooked, with ink gaps */
  stamp(word: string, cx: number, cy: number, c: number, size = 26, rot = -0.12) {
    const g = this.ctx;
    g.save(); g.translate(cx, cy); g.rotate(rot);
    g.font = `700 ${size}px ${FONT.sign}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(word).width + size * 0.8, h = size * 1.35;
    g.strokeStyle = css(c); g.fillStyle = css(c); g.globalAlpha = 0.85;
    g.lineWidth = 3; g.strokeRect(-w / 2, -h / 2, w, h); g.lineWidth = 1.2; g.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
    g.fillText(word, 0, 2);
    // the ink skips
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) { g.globalAlpha = 0.5; g.fillRect((hash(i, 1, 5) - 0.5) * w, (hash(i, 2, 5) - 0.5) * h, 2 + hash(i, 3, 5) * 5, 1 + hash(i, 4, 5) * 2); }
    g.restore();
  }
  /** grain and mottling over everything drawn so far */
  grain(amount = 0.06, seed = 1) {
    const g = this.ctx;
    for (let i = 0; i < (this.w * this.h) / 40; i++) {
      const x = hash(i, 1, seed) * this.w, y = hash(i, 2, seed) * this.h, d = hash(i, 3, seed);
      g.fillStyle = d < 0.5 ? `rgba(0,0,0,${amount})` : `rgba(255,255,255,${amount * 0.7})`;
      g.fillRect(x, y, 1 + d * 2, 1);
    }
  }

  /** blueprint paper: Prussian blue with a fine grid, a border, a crease and a coffee ring */
  blueprint(seed = 1) {
    const g = this.ctx;
    const grd = g.createLinearGradient(0, 0, this.w, this.h); grd.addColorStop(0, '#24538f'); grd.addColorStop(1, '#1b457c');
    g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h);
    for (let x = 0; x < this.w; x += 8) this.line(x + 0.5, 0, x + 0.5, this.h, x % 40 === 0 ? 0x4a7cc0 : 0x34649f, x % 40 === 0 ? 1 : 0.6);
    for (let y = 0; y < this.h; y += 8) this.line(0, y + 0.5, this.w, y + 0.5, y % 40 === 0 ? 0x4a7cc0 : 0x34649f, y % 40 === 0 ? 1 : 0.6);
    this.frame(6, 6, this.w - 12, this.h - 12, 0xcfe0f8, 2);
    this.frame(10, 10, this.w - 20, this.h - 20, 0x9cbbe6, 1);
    g.globalAlpha = 0.18; this.circle(this.w * 0.78, this.h * 0.82, 22, 0x8a5a2a, 5); g.globalAlpha = 1;
    this.grain(0.07, seed);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, this.h * 0.52, this.w, 2);
  }
  /** an index card: cream stock, blue rules, a red margin, a coffee ring */
  card(ruled = true, rule = 22, top = 30) {
    this.fill(0xf0e7cf);
    const g = this.ctx;
    if (ruled) { for (let y = top; y < this.h; y += rule) this.line(0, y + 0.5, this.w, y + 0.5, 0x9fb6d6, 1); this.line(22.5, 0, 22.5, this.h, 0xd88a86, 1.2); }
    g.globalAlpha = 0.22; this.circle(this.w - 40, this.h - 36, 22, 0x9a6a30, 4); g.globalAlpha = 0.12; this.circle(this.w - 38, this.h - 34, 18, 0x9a6a30, 2); g.globalAlpha = 1;
    this.grain(0.05, 3);
  }
  /** a round gauge face: cream enamel, ticks, a red zone, the label in sign type */
  gaugeFace(label: string, red: 'low' | 'high' | 'none' = 'low') {
    const g = this.ctx, cx = this.w / 2, cy = this.h / 2, r = this.w / 2 - 2;
    this.fill(0x141414);
    const grd = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 2, cx, cy, r);
    grd.addColorStop(0, '#f6efd8'); grd.addColorStop(1, '#d8cca8');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    if (red !== 'none') { g.strokeStyle = '#b8302a'; g.lineWidth = r * 0.12; g.beginPath(); const a0 = red === 'low' ? Math.PI * 0.75 : Math.PI * 2.05, a1 = red === 'low' ? Math.PI * 0.95 : Math.PI * 2.25; g.arc(cx, cy, r * 0.8, a0, a1); g.stroke(); }
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (0.75 + i * 0.075), long = i % 5 === 0;
      const r0 = long ? r * 0.66 : r * 0.74;
      this.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86, 0x2a2622, long ? 2 : 1);
    }
    this.text(label, cx, cy + r * 0.28, { font: FONT.sign, size: Math.round(r * 0.36), color: 0x2a2622, align: 'center', weight: '600' });
  }
}

/** a flat lit plane carrying a sheet (for overlay props) */
export function sheetMesh(sheet: Sheet, w: number, h: number, opts: { transparent?: boolean } = {}): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: sheet.tex, transparent: !!opts.transparent }));
}

/** polished metal for first-person props (overlay only): a smooth base colour (the model's baked
 *  shading kept in its vertex colours) with real specular highlights from the scene's lights */
export function shinyMaterial(color: number, shininess = 70, specular = 0x9a9a9a): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({ color, vertexColors: true, shininess, specular });
}

/** aim a raycaster from CSS pixel coordinates through the first-person overlay camera */
export function overlayRay(ray: THREE.Raycaster, cam: THREE.Camera, cx: number, cy: number, ndc = new THREE.Vector2()) {
  const pr = G.pr as any;
  const RW = pr.lowW + pr.margin * 2, RH = pr.lowH + pr.margin * 2;
  const lx = cx * pr.dpr / pr.scale + pr.margin, ly = (window.innerHeight - cy) * pr.dpr / pr.scale + pr.margin;
  ndc.set(lx / RW * 2 - 1, ly / RH * 2 - 1);
  ray.setFromCamera(ndc, cam);
  return ray;
}

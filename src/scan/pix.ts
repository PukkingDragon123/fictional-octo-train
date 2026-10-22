// Printed matter for physical readouts (tribes, domination, scanning): paper,
// card stock, chalk slates and label tape drawn as pixel art, with real type
// set on top (worn typewriter, handwriting, enamel-sign sans, typeset mono,
// terminal phosphor: the faces in src/ui/fonts.css). The ground is painted at
// texel scale and blown up crisp; the type is drawn at k times the resolution
// and mip-mapped, so it stays legible through the low-res picture. Also:
// world-space hanging tags, and the invisible pointer layer first-person
// tables and devices listen through.
import * as THREE from 'three';
import { Screen } from '../ui/font5x7';
import { fontsReady, cssFont } from '../gfx/crt';
import { G } from '../game/G';

export const PAL = {
  paper: 0xe6d9b8, paperDk: 0xc9b98f, paperEdge: 0xa8946a, ink: 0x2a2219, inkRed: 0x8a2416, inkBlue: 0x24365a,
  card: 0xeadfc0, hole: 0x1a140c, chalk: 0xe8e6da, slate: 0x2c3330,
  amber: 0xffb347, amberDk: 0x8a4a12, phos: 0x8cf07a, phosDk: 0x163a12, phosBg: 0x0a1a08,
  brass: 0xc8a050, steel: 0x8a9096,
};
/** the faces come from the CSS tokens (src/ui/fonts.css), read at draw time so a font swap follows */
export const FONT = {
  get type() { return cssFont('--font-type', 'monospace'); },
  get pen() { return cssFont('--font-pen', 'cursive'); },
  get sign() { return cssFont('--font-sign', 'sans-serif'); },
  get mono() { return cssFont('--font-typeset', 'monospace'); },
  get crt() { return cssFont('--font-crt', 'monospace'); },
  get poster() { return cssFont('--font-poster', 'serif'); },
};

const h01 = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
export const mixHex = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

// canvas text waits for the web fonts: surfaces drawn before then are redrawn once they arrive
let fontsOk = false;
const waiting = new Set<PixTex>();
fontsReady().then(() => { fontsOk = true; for (const p of waiting) p.flush(); waiting.clear(); });

interface TextOp { text: string; x: number; y: number; color: number; size: number; font: string; maxW: number; wobble: boolean; glow: number; align: CanvasTextAlign; rot: number; para?: { w: number; lineH: number; maxLines: number }; weight: string }

/** a printed surface: paint the ground on .s (texel scale), set type with typed/pen/sign/mono, then flush() */
export class PixTex {
  s: Screen;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  private ground: HTMLCanvasElement;
  private ops: TextOp[] = [];
  private ctx: CanvasRenderingContext2D;
  constructor(public w: number, public h: number, public k = 3) {
    this.s = new Screen(w, h);
    this.ground = document.createElement('canvas'); this.ground.width = w; this.ground.height = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * k; this.canvas.height = h * k;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearMipmapLinearFilter; this.tex.generateMipmaps = true;
    this.tex.anisotropy = 4;
  }
  /** start over: a clear (or solid) ground and no type */
  reset(color?: number) { if (color === undefined) this.s.data.fill(0); else this.s.clear(color); this.ops.length = 0; }
  /** the old name */
  clearAlpha() { this.reset(); }

  // ---- type
  private op(text: string, x: number, y: number, color: number, size: number, font: string, o: Partial<TextOp> = {}) {
    this.ops.push({ text, x, y, color, size, font, maxW: o.maxW ?? 9999, wobble: o.wobble ?? false, glow: o.glow ?? 0, align: o.align ?? 'left', rot: o.rot ?? 0, para: o.para, weight: o.weight ?? '' });
    this.ctx.font = `${o.weight ?? ''} ${size}px ${font}`;
    return Math.min(o.maxW ?? 9999, this.ctx.measureText(text).width);
  }
  /** worn typewriter: letters sit a hair off the line, the ribbon uneven. Returns the width (texels). */
  typed(text: string, x: number, y: number, color = PAL.ink, size = 8, maxW = 9999) { return this.op(text, x, y, color, size, FONT.type, { maxW, wobble: true }); }
  /** handwriting (price tags, chalk, pencil notes) */
  pen(text: string, x: number, y: number, color = PAL.ink, size = 10, o: { maxW?: number; align?: CanvasTextAlign; rot?: number } = {}) { return this.op(text, x, y, color, size, FONT.pen, { weight: '700', ...o }); }
  /** enamel / label-tape sans */
  sign(text: string, x: number, y: number, color = PAL.ink, size = 8, o: { maxW?: number; align?: CanvasTextAlign } = {}) { return this.op(text, x, y, color, size, FONT.sign, { weight: '600', ...o }); }
  /** typeset mono */
  mono(text: string, x: number, y: number, color = PAL.ink, size = 7, o: { maxW?: number; align?: CanvasTextAlign } = {}) { return this.op(text, x, y, color, size, FONT.mono, { weight: '700', ...o }); }
  /** a word-wrapped typed block; returns the y after it */
  typedPara(text: string, x: number, y: number, w: number, color = PAL.ink, lineH = 9, maxLines = 9, size = 7) {
    this.op(text, x, y, color, size, FONT.type, { para: { w, lineH, maxLines }, wobble: true });
    this.ctx.font = `${size}px ${FONT.type}`;
    const words = text.split(/\s+/); let line = '', n = 0;
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (this.ctx.measureText(t).width > w && line) { n++; line = wd; } else line = t; }
    if (line) n++;
    return y + Math.min(n, maxLines) * lineH;
  }

  // ---- ground (pixel art)
  paper(x: number, y: number, w: number, h: number, base = PAL.paper, seed = 1) {
    const s = this.s;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const n = h01(i, j, seed), edge = Math.min(i, j, w - 1 - i, h - 1 - j);
      let c = mixHex(base, PAL.paperDk, n * 0.3 + (edge < 1 ? 0.4 : 0));
      if (n > 0.987) c = PAL.paperEdge;
      s.px(x + i, y + j, Screen.c(c));
    }
    for (let k = 0; k < 3; k++) for (let m = 0; m <= k; m++) s.px(x + w - 3 + k, y + m, 0);
    s.line(x + w - 3, y, x + w - 1, y + 2, Screen.c(PAL.paperEdge));
  }
  hole(x: number, y: number, w = 2, h = 3) { this.s.rect(x, y, w, h, Screen.c(PAL.hole)); }

  flush() {
    const g = this.ground.getContext('2d')!;
    g.putImageData(this.s.img, 0, 0);
    const c = this.ctx, k = this.k;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.ground, 0, 0, this.canvas.width, this.canvas.height);
    c.save(); c.scale(k, k); c.textBaseline = 'top';
    for (const o of this.ops) {
      c.font = `${o.weight} ${o.size}px ${o.font}`;
      c.fillStyle = css(o.color);
      if (o.glow) { c.shadowColor = css(o.color); c.shadowBlur = o.glow * k; } else c.shadowBlur = 0;
      if (o.para) {
        const words = o.text.split(/\s+/); let line = '', n = 0;
        const put = (t: string) => { if (n < o.para!.maxLines) this.draw(c, t, o.x, o.y + n * o.para!.lineH, o); n++; };
        for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > o.para.w && line) { put(line); line = wd; } else line = t; }
        if (line) put(line);
      } else this.draw(c, o.text, o.x, o.y, o);
    }
    c.restore();
    this.tex.needsUpdate = true;
    if (!fontsOk) waiting.add(this);
  }
  private draw(c: CanvasRenderingContext2D, text: string, x: number, y: number, o: TextOp) {
    let t = text;
    if (c.measureText(t).width > o.maxW) { while (t.length > 1 && c.measureText(t + '…').width > o.maxW) t = t.slice(0, -1); t += '…'; }
    if (o.rot) { c.save(); c.translate(x, y); c.rotate(o.rot); x = 0; y = 0; }
    c.textAlign = o.align;
    if (!o.wobble) c.fillText(t, x, y);
    else {
      // a typewriter: every strike lands a little differently
      let cx = x;
      if (o.align === 'center') cx -= c.measureText(t).width / 2; else if (o.align === 'right') cx -= c.measureText(t).width;
      c.textAlign = 'left';
      for (let i = 0; i < t.length; i++) {
        const ch = t[i], r = h01(i, t.length, o.x + o.y);
        c.globalAlpha = 0.78 + r * 0.22;
        c.fillText(ch, cx, y + (r > 0.82 ? 0.35 : r < 0.1 ? -0.25 : 0));
        cx += c.measureText(ch).width;
      }
      c.globalAlpha = 1;
    }
    if (o.rot) c.restore();
  }
}

/** an overlay-scene material for printed surfaces (cards, tags, plates) */
export function flatMat(tex: THREE.Texture, glow = false) {
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, toneMapped: false, color: glow ? 0xffffff : 0xdedad0 });
}

// ---------------------------------------------------------------- world-space hanging tags
/**
 * A manila tag on a string, hung in the world over what you can act on: typed
 * words and a little bakelite key cap. Paper, a red warning tag, or a stamped
 * metal tag. It only redraws when its words change.
 */
export class WorldTag {
  sprite: THREE.Sprite;
  private pt: PixTex;
  private key = '';
  constructor(w = 120, h = 20) {
    this.pt = new PixTex(w, h, 3);
    const m = new THREE.SpriteMaterial({ map: this.pt.tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.sprite = new THREE.Sprite(m);
    this.sprite.renderOrder = 999;
    this.sprite.visible = false;
    this.sprite.center.set(0.5, 0);
    G.pr.scene.add(this.sprite);
  }
  show(x: number, y: number, z: number, text: string, kind: 'paper' | 'red' | 'metal' | 'dim' = 'paper', keyCap = 'E') {
    const k = kind + '|' + keyCap + '|' + text;
    if (k !== this.key) { this.key = k; this.draw(text, kind, keyCap); }
    this.sprite.position.set(x, y, z);
    // one tag texel = one pixel of the low-res picture, at any zoom
    const cam = G.pr.camera, sc = Math.max(1e-3, (cam.top - cam.bottom) / Math.max(1, G.pr.lowH));
    this.sprite.scale.set(this.pt.w * sc, this.pt.h * sc, 1);
    this.sprite.visible = true;
  }
  hide() { this.sprite.visible = false; }
  private draw(text: string, kind: string, keyCap: string) {
    const p = this.pt, s = p.s;
    p.reset();
    const base = kind === 'red' ? 0xb8402a : kind === 'metal' ? 0x9aa0a0 : kind === 'dim' ? 0x9a9078 : PAL.paper;
    const ink = kind === 'red' ? 0xfff0e0 : kind === 'metal' ? 0x15171a : PAL.ink;
    const tw = Math.min(p.w - 2, Math.ceil((keyCap ? 15 : 6) + p.typed(text, 0, 0, ink, 9) + 6));
    p.reset();
    const x0 = Math.floor((p.w - tw) / 2);
    s.vline(p.w >> 1, 0, 4, Screen.c(0x5a4a30));
    p.paper(x0, 5, tw, p.h - 5, base, text.length);
    if (kind === 'metal') for (const xx of [x0 + 2, x0 + tw - 3]) s.px(xx, 7, Screen.c(0x4a4e52));
    s.rect(x0 + 2, 5 + ((p.h - 5) >> 1) - 1, 2, 2, Screen.c(PAL.brass));
    let x = x0 + 6;
    if (keyCap) {
      s.rect(x, 7, 9, 10, Screen.c(0x241e1a)); s.rect(x + 1, 7, 7, 8, Screen.c(0x4a4038));
      p.sign(keyCap, x + 4.5, 7.5, 0xf0e6d0, 7, { align: 'center' });
      x += 12;
    }
    p.typed(text, x, 7.5, ink, 9, p.w - x - 2);
    p.flush();
  }
}

// ---------------------------------------------------------------- first-person pointer layer
/** an invisible full-screen layer that hands pointer events to a first-person device while it is up */
export class PointerLayer {
  el: HTMLDivElement;
  constructor(name: string, on: { down?: (e: PointerEvent) => void; move?: (e: PointerEvent) => void; up?: (e: PointerEvent) => void }) {
    this.el = document.createElement('div');
    this.el.className = 'fp-capture fp-capture-' + name;
    this.el.style.cssText = 'position:fixed;inset:0;z-index:44;display:none;touch-action:none;background:transparent';
    document.body.append(this.el);
    if (on.down) this.el.addEventListener('pointerdown', (e) => { e.preventDefault(); on.down!(e); });
    if (on.move) this.el.addEventListener('pointermove', (e) => on.move!(e));
    if (on.up) window.addEventListener('pointerup', (e) => { if (this.el.style.display !== 'none') on.up!(e); });
  }
  set on(v: boolean) { this.el.style.display = v ? 'block' : 'none'; if (G.input) G.input.pointerOverUI = v; }
  set cursor(c: string) { this.el.style.cursor = c; }
}

/** raycast helper for overlay-scene picking */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function overlayRay(x: number, y: number, cam: THREE.Camera) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  return ray;
}

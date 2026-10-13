import * as THREE from 'three';
import { PixelCanvas } from './pixel';
import { Rng, hashStr } from '../core/rng';

/** Pixels of texture per metre of world surface. All surfaces are authored at this density. */
export const PX_PER_M = 32;

export interface AtlasRect {
  name: string;
  x: number; y: number; w: number; h: number;
  /** uv rect in atlas space: u0, v0 (top row), du, dv */
  u0: number; v0: number; du: number; dv: number;
  /** size in metres covered by one repeat of the texture */
  mw: number; mh: number;
  /** average colour, handy for particles / minimap */
  avg: number;
}

export type TexDraw = (pc: PixelCanvas, rng: Rng) => void;

interface Pending { name: string; w: number; h: number; draw: TexDraw; mw?: number; mh?: number; }

/**
 * One big atlas holding every world texture. Geometry carries per-vertex
 * atlas rects and the shader wraps UVs inside the rect, so textures still
 * tile seamlessly while the whole world draws with a single material.
 */
export class TextureAtlas {
  readonly size: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private rects = new Map<string, AtlasRect>();
  private shelves: { y: number; h: number; x: number }[] = [];
  private nextShelfY = 0;
  private pending: Pending[] = [];
  private defs = new Map<string, Pending>();
  dirty = false;

  constructor(size = 2048) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size; this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.ctx.imageSmoothingEnabled = false;
    const t = new THREE.CanvasTexture(this.canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    this.texture = t;
    // reserve a white pixel block for untextured / vertex-coloured geometry
    this.add('white', 4, 4, (pc) => pc.fill(0xffffff));
    this.flush();
  }

  /** Queue a texture definition. w,h in pixels; mw/mh override metres covered. */
  add(name: string, w: number, h: number, draw: TexDraw, mw?: number, mh?: number) {
    const p = { name, w, h, draw, mw, mh };
    this.defs.set(name, p);
    if (!this.rects.has(name)) this.pending.push(p);
  }

  has(name: string) { return this.rects.has(name) || this.defs.has(name); }

  private alloc(w: number, h: number): [number, number] {
    const pw = w + 2, ph = h + 2; // 1px gutter
    for (const s of this.shelves) {
      if (ph <= s.h && s.x + pw <= this.size) { const x = s.x; s.x += pw; return [x + 1, s.y + 1]; }
    }
    if (this.nextShelfY + ph > this.size) throw new Error('Texture atlas full');
    const shelf = { y: this.nextShelfY, h: ph, x: pw };
    this.shelves.push(shelf);
    this.nextShelfY += ph;
    return [1, shelf.y + 1];
  }

  /** Draw all pending textures into the atlas canvas. */
  flush() {
    if (!this.pending.length) return;
    // tallest first packs shelves better
    this.pending.sort((a, b) => b.h - a.h);
    for (const p of this.pending) {
      const [x, y] = this.alloc(p.w, p.h);
      this.paint(p, x, y);
    }
    this.pending.length = 0;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  private paint(p: Pending, x: number, y: number) {
    const pc = new PixelCanvas(p.w, p.h);
    p.draw(pc, new Rng(hashStr(p.name)));
    this.ctx.putImageData(pc.toImageData(), x, y);
    // replicate border pixels into the 1px gutter (prevents any bleed)
    this.ctx.drawImage(this.canvas, x, y, p.w, 1, x, y - 1, p.w, 1);
    this.ctx.drawImage(this.canvas, x, y + p.h - 1, p.w, 1, x, y + p.h, p.w, 1);
    this.ctx.drawImage(this.canvas, x, y - 1, 1, p.h + 2, x - 1, y - 1, 1, p.h + 2);
    this.ctx.drawImage(this.canvas, x + p.w - 1, y - 1, 1, p.h + 2, x + p.w, y - 1, 1, p.h + 2);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < pc.data.length; i += 16) { if (pc.data[i + 3] > 0) { r += pc.data[i]; g += pc.data[i + 1]; b += pc.data[i + 2]; n++; } }
    n = Math.max(1, n);
    const S = this.size;
    this.rects.set(p.name, {
      name: p.name, x, y, w: p.w, h: p.h,
      u0: x / S, v0: y / S, du: p.w / S, dv: p.h / S,
      mw: p.mw ?? p.w / PX_PER_M, mh: p.mh ?? p.h / PX_PER_M,
      avg: ((r / n) << 16) | ((g / n) << 8) | (b / n),
    });
  }

  /** Redraw an existing texture in place (e.g. animated screens, corruption). */
  repaint(name: string, draw?: TexDraw) {
    const r = this.rects.get(name); const d = this.defs.get(name);
    if (!r || !d) return;
    if (draw) d.draw = draw;
    this.paint(d, r.x, r.y);
    this.texture.needsUpdate = true;
  }

  get(name: string): AtlasRect {
    let r = this.rects.get(name);
    if (!r) {
      if (!this.defs.has(name)) {
        // unknown texture: generate a clearly-marked placeholder so nothing breaks
        console.warn('missing texture', name);
        const h = hashStr(name);
        const base = ((h & 0x7f) + 64) << 16 | (((h >> 8) & 0x7f) + 64) << 8 | (((h >> 16) & 0x7f) + 64);
        this.add(name, 16, 16, (pc, rng) => {
          pc.fill(base);
          pc.speckle(rng, [base & 0xfefefe >> 1, 0xff00ff], 0.1);
        });
      }
      this.flush();
      r = this.rects.get(name)!;
    }
    return r;
  }

  usage(): number { return this.nextShelfY / this.size; }
}

let _atlas: TextureAtlas | null = null;
export function atlas(): TextureAtlas {
  if (!_atlas) _atlas = new TextureAtlas(2048);
  return _atlas;
}

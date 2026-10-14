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
  /** RGBA pixels, row 0 = top (uploaded as one DataTexture, flipY off) */
  readonly data: Uint8Array;
  readonly texture: THREE.DataTexture;
  private rects = new Map<string, AtlasRect>();
  private shelves: { y: number; h: number; x: number }[] = [];
  private nextShelfY = 0;
  private pending: Pending[] = [];
  private defs = new Map<string, Pending>();
  private dbgCanvas: HTMLCanvasElement | null = null;
  dirty = false;

  constructor(size = 2048) {
    this.size = size;
    this.data = new Uint8Array(size * size * 4);
    const t = new THREE.DataTexture(this.data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
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

  /** debug view of the atlas as a canvas (galleries); built on demand */
  get canvas(): HTMLCanvasElement {
    if (!this.dbgCanvas) { this.dbgCanvas = document.createElement('canvas'); this.dbgCanvas.width = this.dbgCanvas.height = this.size; }
    const ctx = this.dbgCanvas.getContext('2d')!;
    const img = ctx.createImageData(this.size, this.size);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return this.dbgCanvas;
  }

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

  /** Draw all pending textures into the atlas buffer. */
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
    const S = this.size, D = this.data, src = pc.data;
    const row = p.w * 4;
    for (let j = 0; j < p.h; j++) D.set(src.subarray(j * row, j * row + row), ((y + j) * S + x) * 4);
    // replicate border pixels into the 1px gutter (prevents any bleed)
    D.copyWithin(((y - 1) * S + x) * 4, (y * S + x) * 4, (y * S + x) * 4 + row);
    D.copyWithin(((y + p.h) * S + x) * 4, ((y + p.h - 1) * S + x) * 4, ((y + p.h - 1) * S + x) * 4 + row);
    for (let j = -1; j <= p.h; j++) {
      const r = (y + j) * S;
      D.copyWithin((r + x - 1) * 4, (r + x) * 4, (r + x) * 4 + 4);
      D.copyWithin((r + x + p.w) * 4, (r + x + p.w - 1) * 4, (r + x + p.w - 1) * 4 + 4);
    }
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < src.length; i += 16) { if (src[i + 3] > 0) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; } }
    n = Math.max(1, n);
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

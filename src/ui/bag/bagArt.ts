import { PixelCanvas, mixHex, scaleHex, ph, bayer } from '../../gfx/pixel';
import type { GridSpec, Region } from '../../items/grid';

/**
 * Pixel art for the backpack inventory, painted in code at art-pixel scale
 * and shown at an integer zoom: the bag's shell and canvas lining with the
 * grid stitched into it, the lid, zipper pull, carry handle, shoulder straps
 * and the spring scale it hangs from, the laid-out clothes of the paper doll
 * with their pockets, and the trays of the things you loot (a drawer's
 * wooden box, fridge shelves, a trunk's carpet, the floor).
 */
export const CELL = 16;
export const PCELL = 12;

// ------------------------------------------------------------------ tiny font (3x5)
const F5: Record<string, string> = {};
{
  const src: Record<string, string[]> = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
    D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
    P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
    '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
    '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '##.'], '-': ['...', '...', '###', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
    '/': ['..#', '..#', '.#.', '#..', '#..'], ':': ['...', '.#.', '...', '.#.', '...'], '#': ['#.#', '###', '#.#', '###', '#.#'],
    '°': ['##.', '##.', '...', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'], ' ': ['...', '...', '...', '...', '...'],
    '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'], '×': ['...', '#.#', '.#.', '#.#', '...'],
  };
  for (const k of Object.keys(src)) F5[k] = src[k].join('');
}
export function textW(s: string, sp = 1): number { return s.length ? s.length * (3 + sp) - sp : 0; }
export function text(pc: PixelCanvas, s: string, x: number, y: number, c: number, shadow?: number, sp = 1) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = F5[ch] ?? F5['?'];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') {
      if (shadow !== undefined) pc.set(cx + i + 1, y + j + 1, shadow);
    }
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') pc.set(cx + i, y + j, c);
    cx += 3 + sp;
  }
}

// ------------------------------------------------------------------ helpers
export function toUrl(pc: PixelCanvas): string {
  const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c.toDataURL();
}
const lt = (c: number, t = 0.3) => mixHex(c, 0xfff6e4, t);
const dk = (c: number, f = 0.7) => scaleHex(c, f);
const inside = (x: number, y: number, x0: number, y0: number, w: number, h: number, r: number) => {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
  const cx = x < x0 + r ? x0 + r : x >= x0 + w - r ? x0 + w - r - 1 : x;
  const cy = y < y0 + r ? y0 + r : y >= y0 + h - r ? y0 + h - r - 1 : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5;
};
function stitchH(pc: PixelCanvas, x0: number, x1: number, y: number, c: number, on = 2, off = 2) { for (let x = x0; x < x1; x++) if ((x - x0) % (on + off) < on) pc.set(x, y, c); }
function stitchV(pc: PixelCanvas, x: number, y0: number, y1: number, c: number, on = 2, off = 2) { for (let y = y0; y < y1; y++) if ((y - y0) % (on + off) < on) pc.set(x, y, c); }

/** fabric / material texel */
export type Mat = 'canvas' | 'nylon' | 'leather' | 'plastic' | 'steel' | 'tin' | 'cloth' | 'denim' | 'knit';
function matTex(mat: Mat, base: number, x: number, y: number, seed = 1): number {
  switch (mat) {
    case 'canvas': { const w = (x + y) & 1 ? 0.96 : 1.03; const n = ph(x >> 2, y >> 1, seed) * 0.08 - 0.04; return scaleHex(base, w + n); }
    case 'nylon': { const g = x % 7 === 0 || y % 7 === 0 ? 1.07 : 1; return scaleHex(base, g + (ph(x >> 3, y >> 3, seed) * 0.06 - 0.03)); }
    case 'leather': { const n = ph(x >> 1, y >> 1, seed) * 0.5 + ph(x >> 3, y >> 2, seed + 3) * 0.5; return scaleHex(base, 0.9 + n * 0.16); }
    case 'plastic': return scaleHex(base, 1 + (ph(x >> 4, y >> 4, seed) * 0.04 - 0.02));
    case 'steel': return scaleHex(base, 0.95 + ph(0, y, seed) * 0.08 + ((x + y * 3) % 11 === 0 ? 0.04 : 0));
    case 'tin': return scaleHex(base, 0.96 + ph(x >> 2, y >> 2, seed) * 0.06);
    case 'cloth': return scaleHex(base, (x + (y >> 1)) % 3 === 0 ? 0.95 : 1.02);
    case 'denim': return scaleHex(base, (x + y) % 3 === 0 ? 1.1 : (x - y) % 4 === 0 ? 0.9 : 1);
    case 'knit': return scaleHex(base, (y % 2 === 0) !== (x % 2 === 0) ? 1.05 : 0.95);
  }
}

// ================================================================== bags
export interface BagLook { key?: string; shell: number; lining: number; trim: number; thread: number; mat: Mat; rigid?: boolean; pockets?: boolean; label: string[]; zip: number }
export function bagLook(key: string, tint?: number): BagLook {
  const L = (shell: number, lining: number, trim: number, thread: number, mat: Mat, label: string[], o: Partial<BagLook> = {}): BagLook => ({ shell, lining, trim, thread, mat, label, zip: 0x9a9890, ...o });
  switch (key) {
    case 'backpack_school': return L(0x3a62a8, 0x6e7280, 0x1c2a44, 0xd8dce8, 'nylon', ['NAME:', '__________', 'GRADE 7'], { pockets: true });
    case 'backpack_hiking': return L(0xc04e2a, 0x55624f, 0x34363c, 0xe8d8c0, 'nylon', ['ALTUS 55', 'MAX LOAD 25KG'], { pockets: true });
    case 'backpack_crafted': return L(0x8f8062, 0x5e4e36, 0x5a3a24, 0xe0d0a0, 'canvas', ['STITCHED BY', 'HAND'], { pockets: true });
    case 'duffel_bag': return L(0x2e3e2c, 0x3a3a38, 0x1a1a1a, 0xb8b8a0, 'canvas', ['GEAR'], {});
    case 'tote_bag': return L(0xd8ccb0, 0xc4b896, 0x9a8a68, 0x8a7a58, 'cloth', ['TOTE'], {});
    case 'plastic_bag': return L(0xe6e6e0, 0xcfcfc8, 0xb8b8b0, 0xc8302a, 'plastic', ['THANK YOU'], {});
    case 'garbage_bag': return L(0x2a2a2e, 0x1e1e22, 0x101012, 0x4a4a52, 'plastic', [], {});
    case 'purse': return L(0xa84a5a, 0x5a2a34, 0x5a1e28, 0xe8c8a0, 'leather', [], {});
    case 'briefcase': return L(0x6a4228, 0x7a2a2a, 0x2e1c10, 0xc8a050, 'leather', ['PROPERTY OF', 'MERIDIAN'], { rigid: true });
    case 'fanny_pack': return L(0x8a4aa8, 0x3e3e48, 0x1c1c1c, 0xe0d0f0, 'nylon', [], {});
    case 'first_aid_kit': return L(0xc8302a, 0xe8e6dc, 0x7a1a14, 0xffffff, 'plastic', ['FIRST AID'], { rigid: true });
    case 'toolbox_item': return L(0xb83a2a, 0x3a3a3a, 0x5a1a14, 0xd8d8d8, 'steel', [], { rigid: true });
    case 'sewing_kit': return L(0x3a5a8a, 0xd8c8a8, 0x1e2e48, 0xe0d8c0, 'tin', ['NOT', 'COOKIES'], { rigid: true });
    case 'issue_pack': case 'issued_pack': case 'remittance_pack':
      return L(0x5a5a3a, 0x7a6c4a, 0x2c2a1e, 0xc8b88a, 'canvas', ['PROPERTY OF', 'MERIDIAN INST.', 'REMITTANCE', 'ISSUE'], { pockets: true });
    default: {
      const s = tint ?? 0x5a5a3a;
      return L(s, mixHex(s, 0x7a6c4a, 0.6), dk(s, 0.45), 0xc8b88a, 'canvas', ['MERIDIAN', 'ISSUE'], { pockets: true });
    }
  }
}

export interface BagArt { pc: PixelCanvas; ix: number; iy: number; w: number; h: number }
/** the open bag: shell, zipper rim, lining and the stitched cells */
export function paintBag(look: BagLook, spec: GridSpec): BagArt {
  const cw = spec.w * CELL, ch = spec.h * CELL;
  const SP = look.pockets ? 7 : 0; // side pocket bulge
  const BX = 8 + SP, BT = 9, BB = 11;
  const W = cw + BX * 2, H = ch + BT + BB;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const x0 = SP, w0 = W - SP * 2;
  // side pockets (behind the body)
  if (look.pockets) {
    for (const side of [0, 1]) {
      const px = side ? W - SP - 4 : 0, py = Math.round(H * 0.38), pw = SP + 4, phh = Math.round(H * 0.5);
      for (let y = py; y < py + phh; y++) for (let x = px; x < px + pw; x++) {
        if (!inside(x, y, px, py, pw, phh, 3)) continue;
        const mesh = ((x + y) % 3 === 0 || (x - y) % 3 === 0);
        const shade = side ? 0.82 - (x - px) / pw * 0.12 : 0.7 + (x - px) / pw * 0.12;
        pc.set(x, y, mesh ? scaleHex(look.trim, 1.3) : scaleHex(look.shell, shade * 0.85));
      }
      for (let x = px; x < px + pw; x++) { pc.set(x, py + 1, look.trim); pc.set(x, py + 2, lt(look.trim, 0.15)); }
    }
  }
  // body
  for (let y = 0; y < H; y++) for (let x = x0; x < x0 + w0; x++) {
    if (!inside(x, y, x0, 0, w0, H, 6)) continue;
    const u = (x - x0) / w0, v = y / H;
    const round = 1 - Math.pow(Math.abs(u - 0.42) * 2, 2) * 0.22;
    let c = matTex(look.mat, look.shell, x, y, 3);
    c = scaleHex(c, round * (1.06 - v * 0.14));
    if (y >= H - BB + 2) c = matTex(look.mat === 'plastic' ? 'plastic' : 'canvas', dk(look.trim, 1.25), x, y, 5);
    pc.set(x, y, c);
  }
  // outline + piping + stitches
  for (let y = 0; y < H; y++) for (let x = x0; x < x0 + w0; x++) {
    if (!inside(x, y, x0, 0, w0, H, 6)) continue;
    const edge = !inside(x - 1, y, x0, 0, w0, H, 6) || !inside(x + 1, y, x0, 0, w0, H, 6) || !inside(x, y - 1, x0, 0, w0, H, 6) || !inside(x, y + 1, x0, 0, w0, H, 6);
    if (edge) pc.set(x, y, dk(look.trim, 0.8));
  }
  if (!look.rigid) {
    stitchH(pc, x0 + 6, x0 + w0 - 6, H - BB + 1, look.thread);
    stitchV(pc, x0 + 3, 8, H - 8, mixHex(look.thread, look.shell, 0.45));
    stitchV(pc, x0 + w0 - 4, 8, H - 8, mixHex(look.thread, look.shell, 0.45));
  } else {
    // rivets / hinge feet
    for (const fx of [x0 + 4, x0 + w0 - 6]) for (const fy of [4, H - 6]) { pc.set(fx, fy, lt(look.trim, 0.5)); pc.set(fx + 1, fy, look.trim); pc.set(fx, fy + 1, dk(look.trim)); }
  }
  // the mouth: lip, zipper teeth and the lining inside
  const ix = BX, iy = BT;
  const lip = 3;
  for (let y = iy - lip; y < iy + ch + 2; y++) for (let x = ix - lip; x < ix + cw + lip; x++) {
    if (y >= iy && y < iy + ch && x >= ix && x < ix + cw) continue;
    if (y < 0 || y >= H) continue;
    pc.set(x, y, scaleHex(matTex(look.mat, look.shell, x, y, 7), 0.78));
  }
  if (!look.rigid) {
    // zipper tape and teeth around the top and down both sides
    for (let x = ix - 2; x < ix + cw + 2; x++) { pc.set(x, iy - 2, (x & 1) ? look.zip : dk(look.zip, 0.55)); pc.set(x, iy - 1, (x & 1) ? dk(look.zip, 0.55) : lt(look.zip, 0.3)); pc.set(x, iy - 3, dk(look.trim, 0.9)); }
    for (let y = iy - 2; y < iy + Math.round(ch * 0.82); y++) for (const xx of [ix - 2, ix + cw]) {
      pc.set(xx, y, (y & 1) ? look.zip : dk(look.zip, 0.55)); pc.set(xx + 1, y, (y & 1) ? dk(look.zip, 0.55) : lt(look.zip, 0.3));
    }
  } else {
    for (let x = ix - 2; x < ix + cw + 2; x++) { pc.set(x, iy - 2, lt(look.shell, 0.25)); pc.set(x, iy - 1, dk(look.shell, 0.6)); }
  }
  // lining
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    let c = matTex(look.rigid ? (look.mat === 'steel' ? 'steel' : 'plastic') : 'canvas', look.lining, ix + x, iy + y, 11);
    // depth: the rim shades the top and the sides of the opening
    const top = Math.max(0, 1 - y / 14), side = Math.max(0, 1 - Math.min(x, cw - 1 - x) / 6);
    c = scaleHex(c, 0.86 - top * 0.32 - side * 0.12 + (y / ch) * 0.06);
    pc.set(ix + x, iy + y, c);
  }
  paintCells(pc, ix, iy, spec, CELL, look.rigid ? 'molded' : 'stitched', look.lining, look.thread);
  // the label on the lid side of the shell (below the mouth)
  return { pc, ix, iy, w: W, h: H };
}

/** stitched / molded / ruled cells inside a region list */
export function paintCells(pc: PixelCanvas, ox: number, oy: number, spec: GridSpec, cell: number, kind: 'stitched' | 'molded' | 'ruled' | 'wire' | 'none', base: number, thread: number, regions?: Region[], rx0 = 0, ry0 = 0) {
  const regs = regions || spec.regions;
  for (const r of regs) {
    const X0 = ox + (r.x - rx0) * cell, Y0 = oy + (r.y - ry0) * cell;
    for (let cy = 0; cy < r.h; cy++) for (let cx = 0; cx < r.w; cx++) {
      const x0 = X0 + cx * cell, y0 = Y0 + cy * cell;
      if (kind === 'stitched') {
        // quilted pillow: lighter top-left, the seam a crease with thread on it
        for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
          const e = Math.min(x, y, cell - 1 - x, cell - 1 - y);
          if (e === 0) pc.shade(x0 + x, y0 + y, 0.72);
          else if (e === 1 && (x === 1 || y === 1)) pc.shade(x0 + x, y0 + y, 1.12);
          else if (e === 1) pc.shade(x0 + x, y0 + y, 0.88);
        }
        for (let i = 2; i < cell - 2; i++) {
          if ((i & 3) < 2) { pc.blend(x0 + i, y0, thread, 0.55); pc.blend(x0, y0 + i, thread, 0.55); }
        }
      } else if (kind === 'molded') {
        for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
          const e = Math.min(x, y, cell - 1 - x, cell - 1 - y);
          if (e === 0) pc.set(x0 + x, y0 + y, dk(base, 0.62));
          else if (e === 1) pc.shade(x0 + x, y0 + y, x === 1 || y === 1 ? 0.8 : 1.12);
        }
      } else if (kind === 'ruled') {
        for (let i = 0; i < cell; i++) { if (i % 2 === 0) { pc.blend(x0 + i, y0, thread, 0.45); pc.blend(x0, y0 + i, thread, 0.45); } }
      } else if (kind === 'wire') {
        for (let i = 0; i < cell; i++) { if (i % 3 === 0) { pc.blend(x0 + i, y0, thread, 0.3); pc.blend(x0, y0 + i, thread, 0.3); } }
      }
    }
  }
}

/** the lid, flipped back above the mouth: its underside (lining, a mesh pocket, a stamp) inside the shell's rim */
export function paintLid(look: BagLook, w: number, number: string): PixelCanvas {
  const H = 28;
  const pc = new PixelCanvas(w, H); pc.wrap = false;
  const R = 10;
  const inL = (x: number, y: number) => inside(x, y, 0, 0, w, H + R, R);
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
    if (!inL(x, y)) continue;
    const edge = !inL(x - 1, y) || !inL(x + 1, y) || !inL(x, y - 1);
    const rim = !inside(x - 4, y, 0, 0, w, H + R, R) || !inside(x + 4, y, 0, 0, w, H + R, R) || !inside(x, y - 4, 0, 0, w, H + R, R);
    let c: number;
    if (edge) c = dk(look.trim, 0.75);
    else if (rim) { c = matTex(look.mat, look.shell, x, y, 9); c = scaleHex(c, 0.92 + (y / H) * 0.18); if (!inside(x - 3, y, 0, 0, w, H + R, R) || !inside(x, y - 3, 0, 0, w, H + R, R)) c = lt(c, 0.12); }
    else { c = matTex(look.rigid ? 'plastic' : 'canvas', look.lining, x, y, 13); c = scaleHex(c, 0.8 + (y / H) * 0.3); }
    pc.set(x, y, c);
  }
  // inner seam of the rim
  for (let y = 4; y < H; y++) for (let x = 4; x < w - 4; x++) {
    if (!inside(x, y, 4, 4, w - 8, H + R, R - 4)) continue;
    const e = !inside(x - 1, y, 4, 4, w - 8, H + R, R - 4) || !inside(x + 1, y, 4, 4, w - 8, H + R, R - 4) || !inside(x, y - 1, 4, 4, w - 8, H + R, R - 4);
    if (e) pc.set(x, y, dk(look.lining, 0.45));
  }
  if (!look.rigid) {
    // mesh pocket across the lower half with an elastic band
    const mx0 = 9, mx1 = w - 9, my0 = 14, my1 = H;
    for (let y = my0; y < my1; y++) for (let x = mx0; x < mx1; x++) {
      const m = ((x + y) % 3 === 0) || ((x - y + 99) % 3 === 0);
      if (m) pc.set(x, y, mixHex(pc.get(x, y), 0x0e0d0a, 0.55));
    }
    for (let x = mx0; x < mx1; x++) { pc.set(x, my0, lt(look.trim, 0.2)); pc.set(x, my0 + 1, look.trim); pc.set(x, my0 + 2, dk(look.trim, 0.7)); }
  }
  // stamp / label
  const line1 = look.label[0] || '';
  if (number) {
    // a stencilled debtor number, sprayed on
    const s = number.toUpperCase();
    const tw = textW(s) * 2 - 1;
    const sx = Math.round((w - tw) / 2), sy = 5;
    let cx = sx;
    for (const ch of s) {
      const tmp = new PixelCanvas(4, 6); tmp.wrap = false; text(tmp, ch, 0, 0, 0xffffff);
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (tmp.alpha(i, j)) for (let q = 0; q < 4; q++) {
        const px = cx + i * 2 + (q & 1), py = sy + j * 2 + (q >> 1);
        if (ph(px, py, 77) > 0.12) pc.set(px, py, ph(px, py, 78) > 0.85 ? 0x3a2a1a : 0x16130e);
      }
      cx += 8;
    }
    if (line1) text(pc, line1.slice(0, Math.floor((w - 10) / 4)), Math.round((w - textW(line1.slice(0, Math.floor((w - 10) / 4)))) / 2), 18 + 2, mixHex(0x16130e, dk(look.lining, 0.82), 0.25));
  } else if (line1) {
    const tw = textW(line1) + 6;
    const lx = Math.round((w - tw) / 2), ly = 5;
    pc.rect(lx, ly, tw, 8, 0xe8e0c8);
    for (let x = lx; x < lx + tw; x++) pc.set(x, ly + 8, dk(look.lining, 0.5));
    stitchV(pc, lx, ly, ly + 8, dk(0xe8e0c8, 0.7), 1, 1); stitchV(pc, lx + tw - 1, ly, ly + 8, dk(0xe8e0c8, 0.7), 1, 1);
    text(pc, line1, lx + 3, ly + 2, 0x2a2620);
  }
  return pc;
}

/** zipper pull: a metal tab and a bright cord loop */
export function paintZipPull(look: BagLook): PixelCanvas {
  const pc = new PixelCanvas(9, 24); pc.wrap = false;
  const m = 0xb0b0a8;
  // slider
  pc.rect(0, 0, 9, 4, 0x4a4a46); pc.rect(1, 0, 7, 1, 0xd8d8d0); pc.rect(1, 1, 7, 2, m); pc.rect(0, 3, 9, 1, 0x2a2a28);
  // tab
  for (let y = 4; y < 12; y++) { const hw = y < 6 ? 2 : 3; for (let x = 4 - hw; x <= 4 + hw; x++) pc.set(x, y, x === 4 - hw ? 0xe8e8e0 : x === 4 + hw ? 0x5a5a56 : m); }
  pc.rect(3, 7, 3, 3, 0x2a2a28); pc.set(3, 7, 0x6a6a64);
  for (let x = 1; x < 8; x++) pc.set(x, 12, 0x3a3a36);
  // cord loop
  const cord = look.key === 'backpack_school' ? 0xf0c419 : look.key === 'garbage_bag' ? 0x8a8a8a : 0xe8542a;
  for (let y = 12; y < 22; y++) { pc.set(2, y, lt(cord, 0.25)); pc.set(3, y, cord); pc.set(5, y, cord); pc.set(6, y, dk(cord, 0.65)); }
  pc.rect(2, 21, 5, 2, cord); pc.rect(3, 22, 3, 2, dk(cord, 0.6)); pc.set(4, 21, lt(cord, 0.35));
  return pc;
}

/** the haul loop on top of the bag (grab it and shake to repack) */
export function paintHandle(look: BagLook, w = 30): PixelCanvas {
  const H = 12;
  const pc = new PixelCanvas(w, H); pc.wrap = false;
  const web = mixHex(look.trim, look.shell, 0.35);
  for (let x = 2; x < w - 2; x++) {
    const t = (x - 2) / (w - 5);
    const y = Math.round(1 + Math.pow(Math.abs(t - 0.5) * 2, 2.2) * 6);
    for (let k = 0; k < 4; k++) pc.set(x, y + k, k === 0 ? lt(web, 0.4) : k === 3 ? dk(web, 0.55) : (x & 1) ? web : scaleHex(web, 1.1));
    if (x % 3 === 0) pc.set(x, y + 1, mixHex(look.thread, web, 0.4));
  }
  for (const x of [0, w - 6]) { pc.rect(x, 6, 6, 6, dk(look.shell, 0.8)); pc.rect(x + 1, 7, 4, 1, lt(look.shell, 0.2)); stitchH(pc, x + 1, x + 5, 10, look.thread, 1, 1); }
  return pc;
}

/** the shoulder straps hanging from the scale's ring to the top corners of the bag (tension 0..2) */
export function paintStraps(look: BagLook, w: number, h: number, ax: number, bx0: number, bx1: number, tension: number): PixelCanvas {
  const pc = new PixelCanvas(w, h); pc.wrap = false;
  const sag = Math.max(0, 1 - tension) * 9;
  const strain = Math.max(0, tension - 1);
  const sw = tension > 1.4 ? 5 : 6;
  const base = mixHex(mixHex(look.trim, look.shell, 0.3), 0x9a968a, 0.22);
  const strap = strain > 0 ? mixHex(base, 0x8a2a1e, Math.min(0.8, strain * 1.2)) : base;
  const pad = look.shell;
  for (const [x1, side] of [[bx0, -1], [bx1, 1]] as [number, number][]) {
    const x0 = ax + side * 3, y0 = 2, y1 = h;
    const cx = (x0 + x1) / 2 + side * sag * 1.4, cy = (y0 + y1) / 2 + sag * 0.5;
    const steps = Math.ceil(h * 3);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      // the padded part of the strap is wider and shell coloured
      const padded = t > 0.38 && t < 0.86;
      const ww = padded ? sw + 3 : sw;
      const col = padded ? pad : strap;
      for (let k = 0; k < ww; k++) {
        const xx = Math.round(x - ww / 2 + k), yy = Math.round(y);
        let c = k === 0 ? lt(col, 0.45) : k === ww - 1 ? dk(col, 0.5) : k === 1 ? lt(col, 0.18) : col;
        if (!padded && (yy & 1) && k > 0 && k < ww - 1) c = scaleHex(c, 0.92);
        if (padded && (yy % 5 === 0) && k > 0 && k < ww - 1) c = dk(col, 0.82);
        pc.set(xx, yy, c);
      }
      if (padded && Math.round(y) % 3 === 0) { pc.set(Math.round(x - ww / 2 + 1), Math.round(y), mixHex(look.thread, pad, 0.4)); pc.set(Math.round(x + ww / 2 - 2), Math.round(y), mixHex(look.thread, pad, 0.4)); }
      if (strain > 0.2 && t > 0.84 && ph(Math.round(x), Math.round(y), 5) > 0.7) pc.set(Math.round(x + (ph(i, 2, 3) - 0.5) * ww), Math.round(y), 0xff4a2a);
    }
    // ladder-lock buckle just above the pad
    const bt = 0.3;
    const bxx = Math.round((1 - bt) * (1 - bt) * x0 + 2 * (1 - bt) * bt * cx + bt * bt * x1);
    const byy = Math.round((1 - bt) * (1 - bt) * y0 + 2 * (1 - bt) * bt * cy + bt * bt * y1);
    pc.rect(bxx - 4, byy, 9, 4, 0x1a1a1a); pc.rect(bxx - 3, byy + 1, 7, 1, 0x8a8a84); pc.rect(bxx - 3, byy + 2, 7, 1, 0x3e3e3a);
  }
  pc.outline(0x0c0b09);
  return pc;
}

/** the spring scale: brass tube with a window and a ring on top */
export function paintScale(): PixelCanvas {
  const W = 14, H = 40;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const brass = [0x4a3412, 0x7a5a20, 0xa8822e, 0xd0a848, 0xf0d488];
  // top ring
  for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; const x = Math.round(7 + Math.cos(t) * 4), y = Math.round(5 + Math.sin(t) * 4); pc.set(x, y, Math.sin(t) < 0 ? 0xb8b8b0 : 0x6a6a64); }
  // tube
  for (let y = 10; y < H - 3; y++) for (let x = 2; x < 12; x++) {
    const u = (x - 2) / 9;
    const i = Math.max(0, Math.min(4, Math.round(4 - Math.abs(u - 0.35) * 7)));
    pc.set(x, y, brass[i]);
  }
  for (let x = 1; x < 13; x++) { pc.set(x, 10, brass[1]); pc.set(x, 11, brass[3]); pc.set(x, H - 4, brass[1]); pc.set(x, H - 3, brass[0]); }
  // window with ticks
  for (let y = 14; y < H - 7; y++) { pc.set(6, y, 0x1a1a14); pc.set(7, y, 0xe8e0c8); pc.set(8, y, 0xd8d0b8); }
  for (let y = 14; y < H - 7; y += 3) pc.set(8, y, 0x2a2620);
  return pc;
}

// ================================================================== doll
export const DOLL_W = 144, DOLL_H = 190;
export interface DollGarment { key: string; slot: string; part: string; color: number; sleeve?: string; tex?: string; uid: number }
export interface DollPocket { x: number; y: number; w: number; h: number; color: number; label: string }

type Pt = [number, number];
const CX = 72;
// body proportions (art px)
const B = {
  head: [CX, 18] as Pt, headR: 11,
  shoulderY: 35, torsoW: 46, waistW: 40, hipY: 92, torsoTop: 33,
  armL: [[49, 39], [23, 100]] as Pt[], armR: [[95, 39], [121, 100]] as Pt[],
  handL: [20, 107] as Pt, handR: [124, 107] as Pt,
  legL: [[60, 92], [53, 166]] as Pt[], legR: [[84, 92], [91, 166]] as Pt[],
  footL: [49, 173] as Pt, footR: [95, 173] as Pt,
};
/** where on the laid-out body each pocket's top-left goes (its size comes from the pocket) */
const POCKET_AT: Record<string, Pt> = {
  chest: [78, 42], chest_l: [54, 42], inner: [64, 48], pouch: [54, 72],
  side_l: [43, 64], side_r: [73, 64],
  hip_l: [50, 88], hip_r: [82, 88], seat: [60, 140],
  thigh_l: [37, 106], thigh_r: [79, 106],
};
export function pocketAt(id: string, w: number, h: number, taken: { x: number; y: number; w: number; h: number }[]): { x: number; y: number } {
  const base = POCKET_AT[id] ?? [56, 130];
  const pw = w * PCELL + 4, phh = h * PCELL + 4;
  let x = base[0], y = base[1];
  // nudge down until it no longer overlaps an earlier pocket
  for (let k = 0; k < 12; k++) {
    if (!taken.some((t) => x < t.x + t.w && x + pw > t.x && y < t.y + t.h && y + phh > t.y)) break;
    y += 6;
    if (y + phh > DOLL_H - 4) { y = base[1]; x += 8; }
  }
  x = Math.max(1, Math.min(DOLL_W - pw - 1, x));
  y = Math.max(1, Math.min(DOLL_H - phh - 1, y));
  taken.push({ x, y, w: pw, h: phh });
  return { x, y };
}

function seg(pc: PixelCanvas, a: Pt, b: Pt, w0: number, w1: number, fn: (x: number, y: number, t: number, e: number) => number | null) {
  // a thick segment (limb); e = 0 at the edge, 1 at the centre line
  const minX = Math.floor(Math.min(a[0], b[0]) - w0), maxX = Math.ceil(Math.max(a[0], b[0]) + w0);
  const minY = Math.floor(Math.min(a[1], b[1]) - w0), maxY = Math.ceil(Math.max(a[1], b[1]) + w0);
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    let t = ((x + 0.5 - a[0]) * dx + (y + 0.5 - a[1]) * dy) / L2;
    if (t < 0 || t > 1) continue;
    const px = a[0] + dx * t, py = a[1] + dy * t;
    const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
    const hw = (w0 + (w1 - w0) * t) / 2;
    if (d > hw) continue;
    const c = fn(x, y, t, 1 - d / hw);
    if (c !== null) pc.set(x, y, c);
  }
}
function torsoShape(x: number, y: number, top = B.torsoTop, bottom = B.hipY + 2): number {
  // returns 0..1 "inside-ness" of the torso trapezoid, < 0 outside
  if (y < top || y > bottom) return -1;
  const t = (y - top) / (bottom - top);
  const hw = (B.torsoW + (B.waistW - B.torsoW) * Math.min(1, t * 1.3)) / 2 + (t > 0.85 ? (t - 0.85) * 18 : 0);
  const d = Math.abs(x + 0.5 - CX);
  if (d > hw) return -1;
  return 1 - d / hw;
}

/** the chalk outline of a body on a concrete slab, with the worn clothes laid out inside it */
export function paintDoll(garments: DollGarment[], pockets: DollPocket[], number: string, flags: { bag?: number; band?: boolean; hands?: number } = {}): PixelCanvas {
  const pc = new PixelCanvas(DOLL_W, DOLL_H); pc.wrap = false;
  // slab
  for (let y = 0; y < DOLL_H; y++) for (let x = 0; x < DOLL_W; x++) {
    const n = ph(x >> 2, y >> 2, 21) * 0.6 + ph(x >> 4, y >> 3, 22) * 0.4;
    let c = mixHex(0x2a2824, 0x3a3630, n);
    if (ph(x, y, 23) > 0.93) c = scaleHex(c, 1.18);
    if (ph(x >> 1, y >> 1, 24) > 0.985) c = 0x1a1814;
    pc.set(x, y, c);
  }
  // the slab is broken off at its edges
  for (let y = 0; y < DOLL_H; y++) for (let x = 0; x < DOLL_W; x++) {
    const e = Math.min(x, y, DOLL_W - 1 - x, DOLL_H - 1 - y);
    if (e > 5) continue;
    const n = ph(x >> 1, y >> 1, 61) * 3.2 + ph(x >> 3, y >> 3, 62) * 2.6;
    if (n > e + 1.4) pc.set(x, y, 0, 0);
    else if (n > e + 0.6) pc.set(x, y, scaleHex(pc.get(x, y), 1.25));
  }
  // a stain and a hairline crack
  for (let y = 0; y < DOLL_H; y++) for (let x = 0; x < DOLL_W; x++) {
    const d = Math.hypot((x - 110) / 22, (y - 168) / 14);
    if (d < 1) pc.set(x, y, mixHex(pc.get(x, y), 0x1e1610, (1 - d) * 0.45 * (bayer(x, y) > 0.3 ? 1 : 0.6)));
  }
  let cx = 8, cy = 150;
  for (let i = 0; i < 40; i++) { pc.set(cx, cy, 0x161410); cx += 1; cy += ph(i, 3, 25) > 0.6 ? 1 : ph(i, 4, 25) > 0.7 ? -1 : 0; }
  // chalk outline of the body
  const chalk = 0xd8d4c4;
  const body = new PixelCanvas(DOLL_W, DOLL_H); body.wrap = false;
  const mark = (x: number, y: number) => body.set(x, y, 0xffffff);
  for (let y = 0; y < DOLL_H; y++) for (let x = 0; x < DOLL_W; x++) {
    if (Math.hypot(x + 0.5 - B.head[0], y + 0.5 - B.head[1]) <= B.headR) mark(x, y);
    if (torsoShape(x, y, B.torsoTop - 6, B.hipY + 4) >= 0 && y >= 30) mark(x, y);
  }
  for (let y = 28; y < 40; y++) for (let x = CX - 6; x < CX + 6; x++) mark(x, y);
  seg(body, B.armL[0], B.armL[1], 14, 11, () => 0xffffff);
  seg(body, B.armR[0], B.armR[1], 14, 11, () => 0xffffff);
  seg(body, B.legL[0], B.legL[1], 22, 16, () => 0xffffff);
  seg(body, B.legR[0], B.legR[1], 22, 16, () => 0xffffff);
  for (const h of [B.handL, B.handR]) body.ellipse(h[0], h[1], 6, 7, 0xffffff);
  for (const [f, s] of [[B.footL, -1], [B.footR, 1]] as [Pt, number][]) body.ellipse(f[0] + s * 3, f[1], 8, 5, 0xffffff);
  const filled = (x: number, y: number) => body.alpha(x, y) > 0;
  for (let y = 0; y < DOLL_H; y++) for (let x = 0; x < DOLL_W; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
      // chalk is dusty: skip a few pixels, soften others
      const r = ph(x, y, 31);
      if (r > 0.12) pc.set(x, y, r > 0.8 ? mixHex(chalk, 0x3a3630, 0.4) : chalk);
    }
  }
  // garments, inner to outer
  const order = ['socks', 'tshirt', 'shirt', 'sweater', 'pants', 'fullsuit', 'jacket', 'shoes', 'hands', 'neck', 'mask', 'eyes', 'hat', 'belt', 'wrist'];
  const sorted = [...garments].sort((a, b) => (order.indexOf(a.slot) + 99) % 99 - (order.indexOf(b.slot) + 99) % 99);
  for (const g of sorted) paintGarment(pc, g, number);
  // pockets sewn on: a patch with a stitched edge and a darker flap seam
  for (const p of pockets) {
    const W = p.w, H = p.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      let c = matTex('canvas', p.color, p.x + x, p.y + y, 41);
      c = scaleHex(c, e === 0 ? 0.6 : e === 1 ? 0.94 : 0.8);
      pc.set(p.x + x, p.y + y, c);
    }
    stitchH(pc, p.x + 2, p.x + W - 2, p.y + 1, lt(p.color, 0.45));
    stitchV(pc, p.x + 1, p.y + 2, p.y + H - 2, lt(p.color, 0.35));
    stitchV(pc, p.x + W - 2, p.y + 2, p.y + H - 2, lt(p.color, 0.35));
    stitchH(pc, p.x + 2, p.x + W - 2, p.y + H - 2, lt(p.color, 0.35));
    // depth inside the pocket, and a seam between its cells
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) pc.shade(p.x + x, p.y + y, 0.62 + Math.min(0.25, y / H * 0.5));
    for (let x = 2 + PCELL; x < W - 2; x += PCELL) for (let y = 3; y < H - 3; y++) if (y % 3 !== 0) pc.set(p.x + x, p.y + y, dk(p.color, 0.42));
    for (let y = 2 + PCELL; y < H - 2; y += PCELL) for (let x = 3; x < W - 3; x++) if (x % 3 !== 0) pc.set(p.x + x, p.y + y, dk(p.color, 0.42));
  }
  if (flags.band) {
    // BAILIFF band bolted through the left wrist: steel, with a red eye
    const [hx, hy] = [B.handR[0] - 2, B.handR[1] - 11];
    pc.rect(hx - 6, hy, 12, 6, 0x3a3e44); pc.rect(hx - 6, hy, 12, 1, 0x8a9098); pc.rect(hx - 6, hy + 5, 12, 1, 0x1a1c20);
    pc.set(hx - 4, hy + 2, 0xc8ccd0); pc.set(hx + 3, hy + 2, 0xc8ccd0); pc.rect(hx - 1, hy + 2, 2, 2, 0xff3020); pc.set(hx - 1, hy + 2, 0xffc0a0);
    pc.set(hx - 2, hy + 6, 0x7a1a14); pc.set(hx + 2, hy + 7, 0x6a1410);
  }
  return pc;
}

function garmentMat(g: DollGarment): Mat {
  if (/jeans|denim/.test(g.key)) return 'denim';
  if (/sweater|hoodie|beanie|socks|scarf/.test(g.key)) return 'knit';
  if (/leather|boots|dress_shoes/.test(g.key)) return 'leather';
  if (/jumpsuit|uniform|scrubs|coat|lab|hiviz|rain/.test(g.key)) return 'canvas';
  return 'cloth';
}
function paintGarment(pc: PixelCanvas, g: DollGarment, number: string) {
  const mat = garmentMat(g);
  const col = g.color;
  const shadeAt = (x: number, y: number, e: number, base = col) => {
    let c = matTex(mat, base, x, y, g.uid % 97);
    c = scaleHex(c, 0.78 + Math.min(1, e * 2.2) * 0.3);
    // a few folds
    if (ph(x >> 3, y >> 1, g.uid % 13) > 0.9) c = scaleHex(c, 0.88);
    return c;
  };
  const edge = (e: number) => e < 0.12;
  const torso = (top: number, bottom: number, open = false) => {
    for (let y = top; y <= bottom; y++) for (let x = 0; x < DOLL_W; x++) {
      const e = torsoShape(x, y, top, bottom);
      if (e < 0) continue;
      if (open && Math.abs(x + 0.5 - CX) < 2 && y > top + 4) continue;
      pc.set(x, y, edge(e) ? dk(col, 0.55) : shadeAt(x, y, e));
    }
  };
  const sleeves = (len: number) => {
    for (const arm of [B.armL, B.armR]) {
      const end: Pt = [arm[0][0] + (arm[1][0] - arm[0][0]) * len, arm[0][1] + (arm[1][1] - arm[0][1]) * len];
      seg(pc, arm[0], end, 14, 14 - 3 * len, (x, y, t, e) => (edge(e) || t > 0.97 ? dk(col, 0.55) : shadeAt(x, y, e)));
      // cuff
      if (len > 0.6) seg(pc, [end[0] - (end[0] - arm[0][0]) * 0.05, end[1] - (end[1] - arm[0][1]) * 0.05], end, 12, 11, (x, y) => scaleHex(matTex('knit', col, x, y), 0.8));
    }
  };
  const legs = (len: number, waistTop = B.hipY - 6) => {
    for (let y = waistTop; y < B.hipY + 6; y++) for (let x = CX - 22; x < CX + 22; x++) {
      const e = 1 - Math.abs(x + 0.5 - CX) / 22;
      pc.set(x, y, y < waistTop + 3 ? dk(col, 0.7) : shadeAt(x, y, e));
    }
    for (const leg of [B.legL, B.legR]) {
      const end: Pt = [leg[0][0] + (leg[1][0] - leg[0][0]) * len, leg[0][1] + (leg[1][1] - leg[0][1]) * len];
      seg(pc, leg[0], end, 22, 22 - 6 * len, (x, y, t, e) => (edge(e) || t > 0.985 ? dk(col, 0.55) : shadeAt(x, y, e)));
    }
    // fly seam
    for (let y = waistTop + 3; y < B.hipY + 10; y++) pc.set(CX, y, dk(col, 0.6));
  };
  switch (g.slot) {
    case 'tshirt': torso(B.torsoTop + 2, B.hipY - 4); sleeves(g.sleeve === 'long' ? 1 : 0.32); neckline(pc, col, 'round'); break;
    case 'shirt': torso(B.torsoTop, B.hipY - 2); sleeves(g.sleeve === 'short' ? 0.35 : 1); neckline(pc, col, 'collar'); buttons(pc, col); break;
    case 'sweater': torso(B.torsoTop, B.hipY - 1); sleeves(1); neckline(pc, col, 'round'); ribs(pc, col, B.hipY - 4); break;
    case 'jacket': torso(B.torsoTop - 1, B.hipY + 2, true); sleeves(1); neckline(pc, col, 'lapel'); break;
    case 'pants': legs(g.key === 'shorts' ? 0.38 : g.key === 'skirt' ? 0.3 : 1); break;
    case 'fullsuit': {
      torso(B.torsoTop, B.hipY + 2); sleeves(1); legs(1, B.hipY - 2);
      // zip, collar, belt line, number patch
      for (let y = B.torsoTop + 3; y < B.hipY + 6; y++) pc.set(CX, y, (y & 1) ? 0x8a8a84 : dk(col, 0.5));
      neckline(pc, col, 'collar');
      for (let x = CX - 20; x < CX + 20; x++) { pc.set(x, B.hipY - 8, dk(col, 0.62)); pc.set(x, B.hipY - 7, dk(col, 0.78)); }
      if (number) {
        const tw = textW(number) + 2;
        const nx = CX - 2 - tw, ny = B.torsoTop + 7;
        pc.rect(nx, ny, tw, 8, 0xeeeae0); pc.rect(nx, ny + 8, tw, 1, dk(col, 0.5));
        for (let x = nx; x < nx + tw; x += 2) pc.set(x, ny, 0xd8d2c4);
        text(pc, number, nx + 1, ny + 2, 0x16140f);
      }
      break;
    }
    case 'shoes': for (const [f, s] of [[B.footL, -1], [B.footR, 1]] as [Pt, number][]) {
      for (let y = f[1] - 6; y <= f[1] + 6; y++) for (let x = f[0] - 10 + s * 3; x <= f[0] + 10 + s * 3; x++) {
        const d = Math.hypot((x + 0.5 - f[0] - s * 3) / 9, (y + 0.5 - f[1]) / 5.5);
        if (d > 1) continue;
        pc.set(x, y, d > 0.8 ? dk(col, 0.5) : y > f[1] + 3 ? 0x2a2622 : scaleHex(matTex(mat, col, x, y), 1.05 - d * 0.25));
      }
      pc.set(f[0] + s * 3, f[1] - 2, 0xe8e0d0); pc.set(f[0] + s * 3 + 1, f[1] - 1, 0xe8e0d0);
    } break;
    case 'socks': for (const [f, s] of [[B.footL, -1], [B.footR, 1]] as [Pt, number][]) pc.ellipse(f[0] + s * 3, f[1], 7, 4, matTex('knit', col, f[0], f[1])); break;
    case 'hands': for (const h of [B.handL, B.handR]) { for (let y = h[1] - 7; y <= h[1] + 7; y++) for (let x = h[0] - 6; x <= h[0] + 6; x++) { const d = Math.hypot((x + 0.5 - h[0]) / 6, (y + 0.5 - h[1]) / 7); if (d <= 1) pc.set(x, y, d > 0.8 ? dk(col, 0.5) : shadeAt(x, y, 1 - d)); } } break;
    case 'hat': for (let y = B.head[1] - 12; y < B.head[1] - 1; y++) for (let x = B.head[0] - 12; x <= B.head[0] + 12; x++) { const d = Math.hypot((x + 0.5 - B.head[0]) / 12, (y + 0.5 - B.head[1] + 1) / 11); if (d <= 1) pc.set(x, y, d > 0.85 || y === B.head[1] - 2 ? dk(col, 0.55) : shadeAt(x, y, 1 - d)); } break;
    case 'mask': for (let y = B.head[1] + 1; y < B.head[1] + 9; y++) for (let x = B.head[0] - 8; x <= B.head[0] + 8; x++) { if (Math.hypot(x + 0.5 - B.head[0], y + 0.5 - B.head[1]) > 10.5) continue; pc.set(x, y, y === B.head[1] + 1 ? dk(col, 0.6) : shadeAt(x, y, 0.6)); } break;
    case 'eyes': for (const s of [-1, 1]) { const ex = B.head[0] + s * 5, ey = B.head[1] - 2; pc.rect(ex - 3, ey - 2, 6, 5, dk(col, 0.6)); pc.rect(ex - 2, ey - 1, 4, 3, mixHex(col, 0x8ab8d8, 0.5)); pc.set(ex - 2, ey - 1, 0xe8f4ff); } pc.rect(B.head[0] - 2, B.head[1] - 2, 4, 1, dk(col, 0.5)); break;
    case 'neck': for (let y = 30; y < 38; y++) for (let x = CX - 10; x < CX + 10; x++) pc.set(x, y, (y === 30 || y === 37) ? dk(col, 0.6) : matTex('knit', col, x, y)); break;
    case 'wrist': if (g.key !== 'bailiff_band') { const [hx, hy] = [B.handL[0] + 2, B.handL[1] - 11]; pc.rect(hx - 5, hy, 10, 5, dk(col, 0.7)); pc.rect(hx - 2, hy + 1, 4, 3, 0x6dff8e); } break;
    case 'belt': for (let y = B.hipY - 4; y < B.hipY + 4; y++) for (let x = CX - 12; x < CX + 12; x++) pc.set(x, y, y === B.hipY - 4 ? lt(col, 0.3) : y === B.hipY + 3 ? dk(col, 0.5) : matTex('nylon', col, x, y)); break;
    default: break;
  }
}
function neckline(pc: PixelCanvas, col: number, kind: 'round' | 'collar' | 'lapel') {
  const y0 = B.torsoTop;
  if (kind === 'round') { for (let x = CX - 7; x <= CX + 7; x++) { const y = y0 + Math.round(Math.sqrt(Math.max(0, 49 - (x - CX) ** 2)) * 0.6); pc.set(x, y, dk(col, 0.5)); pc.set(x, y + 1, lt(col, 0.15)); } }
  else if (kind === 'collar') { for (const s of [-1, 1]) for (let i = 0; i < 8; i++) for (let k = 0; k <= i; k++) pc.set(CX + s * (k + 1), y0 - 2 + i, i === 7 || k === i ? dk(col, 0.55) : lt(col, 0.2)); }
  else { for (const s of [-1, 1]) for (let i = 0; i < 18; i++) { const x = CX + s * (2 + Math.round(i * 0.45)); pc.set(x, y0 + i, dk(col, 0.45)); pc.set(x + s, y0 + i, lt(col, 0.2)); } }
}
function buttons(pc: PixelCanvas, col: number) { for (let y = B.torsoTop + 8; y < B.hipY - 4; y += 9) { pc.set(CX, y, lt(col, 0.6)); pc.set(CX + 1, y, dk(col, 0.6)); } }
function ribs(pc: PixelCanvas, col: number, y0: number) { for (let y = y0; y < y0 + 4; y++) for (let x = CX - 22; x < CX + 22; x++) if (pc.alpha(x, y) && x % 2 === 0) pc.set(x, y, dk(col, 0.8)); }

/** hand slots under the sleeves: an outlined tray with the hand drawn in chalk */
export function paintHandSlot(side: 'L' | 'R', busy: boolean): PixelCanvas {
  const W = 34, H = 34;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const chalk = 0xd8d4c4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e === 0 && ((x + y) % 3 !== 0)) pc.set(x, y, chalk);
    else if (e > 0) pc.set(x, y, mixHex(0x201e1a, 0x2a2824, ph(x >> 2, y >> 2, side === 'L' ? 3 : 4)), 150);
  }
  if (!busy) {
    // an open palm in chalk
    const hand = ['....#.#.#...', '...#.#.#.#..', '...#.#.#.#..', '...#.#.#.#..', '#..#.#.#.#..', '.#.#######..', '..#.......#.', '...#......#.', '...#.....#..', '....#....#..', '....#....#..', '....######..'];
    const ox = 11, oy = 9;
    hand.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') pc.set(side === 'L' ? ox + row.length - 1 - i : ox + i, oy + j, mixHex(chalk, 0x2a2824, 0.35)); });
  }
  text(pc, side, side === 'L' ? W - 6 : 2, H - 7, mixHex(chalk, 0x2a2824, 0.25));
  return pc;
}

// ================================================================== trays (things you loot)
export interface TrayArt { pc: PixelCanvas; ix: number; iy: number; w: number; h: number }
export function paintTray(spec: GridSpec, style: string, seed = 1): TrayArt {
  const cw = spec.w * CELL, ch = spec.h * CELL;
  const F = style === 'floor' ? 6 : style === 'carpet' ? 9 : style === 'pile' || style === 'corpse' ? 6 : 7;
  const W = cw + F * 2, H = ch + F * 2 + (style === 'wood' || style === 'laminate' ? 6 : 0);
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const ix = F, iy = F;
  const S = (base: number, inner: number, grid: 'ruled' | 'wire' | 'none' | 'molded', gridCol: number) => ({ base, inner, grid, gridCol });
  const look = (() => {
    switch (style) {
      case 'wood': return S(0x7a5030, 0x9a7a52, 'ruled', 0x5a3e24);
      case 'laminate': return S(0xb8ac90, 0xd0c4a4, 'ruled', 0x8a7e64);
      case 'shelf': return S(0x6a4a2c, 0x8a6a46, 'ruled', 0x4a321c);
      case 'steel': return S(0x6a7076, 0x8a9096, 'ruled', 0x4a5056);
      case 'fridge': return S(0xd8dcd8, 0xeef2ee, 'wire', 0x9aa4a8);
      case 'freezer': return S(0xc8d4dc, 0xdfeaf2, 'wire', 0x8aa0b0);
      case 'crate': return S(0x8a6a3e, 0xa88a5a, 'ruled', 0x6a4e2a);
      case 'cardboard': return S(0xa07a4a, 0xb89060, 'ruled', 0x7a5a34);
      case 'carpet': return S(0x3a3c40, 0x2e3034, 'ruled', 0x24262a);
      case 'trash': return S(0x3a4a3a, 0x2a3428, 'ruled', 0x1e261c);
      case 'vending': return S(0x2a2c30, 0x1a1c20, 'none', 0x3a3c40);
      case 'oven': return S(0x1e1e20, 0x2a2a2c, 'wire', 0x6a6a6c);
      case 'medical': return S(0xd8d8d0, 0xeeeee6, 'ruled', 0xb0b0a8);
      case 'toolbox': return S(0xa8302a, 0x3a3a3a, 'molded', 0x2a2a2a);
      case 'pile': return S(0x4a4034, 0x5a4e3e, 'none', 0x3a3228);
      case 'cooler': return S(0x3a6a9a, 0xe8eef2, 'ruled', 0xa8b8c8);
      case 'corpse': return S(0x3a2a24, 0x4a3a30, 'ruled', 0x2a1a14);
      case 'floor': return S(0x8a7a50, 0x9c8b5c, 'ruled', 0x7a6a42);
      default: return S(0x6a5a44, 0x8a7a5a, 'ruled', 0x5a4a34);
    }
  })();
  // frame
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = look.base;
    if (style === 'wood' || style === 'shelf' || style === 'crate') { const grain = Math.sin((y * 0.9 + ph(x >> 3, 0, seed) * 6) * 1.3) * 0.5 + 0.5; c = scaleHex(look.base, 0.9 + grain * 0.14 + ph(x, y >> 2, seed) * 0.04); }
    else if (style === 'steel' || style === 'oven') c = matTex('steel', look.base, x, y, seed);
    else if (style === 'cardboard') c = scaleHex(look.base, 0.95 + ((x >> 1) % 3 === 0 ? 0.06 : 0));
    else if (style === 'carpet') c = scaleHex(0x4a4c52, 0.9 + ph(x, y, seed) * 0.12);
    else if (style === 'floor' || style === 'pile') c = scaleHex(look.base, 0.85 + ph(x >> 1, y >> 1, seed) * 0.2);
    else if (style === 'corpse') c = scaleHex(look.base, 0.8 + ph(x >> 1, y, seed) * 0.3);
    else c = matTex('plastic', look.base, x, y, seed);
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e === 0) c = dk(look.base, 0.45);
    else if (e === 1) c = x === 1 || y === 1 ? lt(c, 0.18) : dk(c, 0.8);
    pc.set(x, y, c);
  }
  // inner floor
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    let c = look.inner;
    const X = ix + x, Y = iy + y;
    if (style === 'wood' || style === 'shelf' || style === 'crate') { const grain = Math.sin((x * 0.25 + Math.sin(y * 0.15 + seed) * 2 + ph(0, y >> 3, seed) * 5) * 1.7) * 0.5 + 0.5; c = scaleHex(look.inner, 0.9 + grain * 0.12); if (style === 'crate' && y % 16 === 15) c = dk(look.inner, 0.6); }
    else if (style === 'carpet' || style === 'floor') c = scaleHex(look.inner, 0.88 + ph(X, Y, seed) * 0.12 + ph(X >> 2, Y >> 2, seed + 1) * 0.08);
    else if (style === 'trash' || style === 'pile') c = scaleHex(look.inner, 0.8 + ph(X >> 1, Y >> 1, seed) * 0.3);
    else if (style === 'corpse') { c = scaleHex(look.inner, 0.8 + ph(X >> 1, Y, seed) * 0.25); if (ph(X >> 2, Y >> 2, seed + 7) > 0.8) c = mixHex(c, 0x6a0c08, 0.65); }
    else if (style === 'steel' || style === 'oven') c = matTex('steel', look.inner, X, Y, seed);
    else c = matTex('plastic', look.inner, X, Y, seed);
    // depth: the frame shades the top and the left
    const top = Math.max(0, 1 - y / 7), left = Math.max(0, 1 - x / 5);
    c = scaleHex(c, 1 - top * 0.32 - left * 0.14);
    pc.set(X, Y, c);
  }
  // stains / crumbs
  if (style === 'floor' || style === 'carpet' || style === 'trash' || style === 'pile') {
    for (let i = 0; i < 5; i++) { const sx = ix + Math.floor(ph(i, 1, seed) * cw), sy = iy + Math.floor(ph(i, 2, seed) * ch); const r = 3 + ph(i, 3, seed) * 6; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y < r * r && sx + x >= ix && sx + x < ix + cw && sy + y >= iy && sy + y < iy + ch) pc.shade(sx + x, sy + y, 0.86); }
  }
  // cells
  if (look.grid !== 'none') paintCells(pc, ix, iy, spec, CELL, look.grid === 'molded' ? 'molded' : look.grid, look.inner, look.gridCol);
  if (style === 'vending') {
    // a coil spiral in every cell
    for (const r of spec.regions) for (let cy = 0; cy < r.h; cy++) for (let cx = 0; cx < r.w; cx++) {
      const x0 = ix + (r.x + cx) * CELL, y0 = iy + (r.y + cy) * CELL;
      for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const x = x0 + 3 + i * 3 + (k > 2 ? 1 : 0); pc.set(x, y0 + 4 + k * 2 - (k > 2 ? 6 : 0) + 4, 0x8a8e94); }
    }
  }
  // shelves between regions
  for (let i = 1; i < spec.regions.length; i++) {
    const r = spec.regions[i];
    const y = iy + r.y * CELL;
    for (let x = ix - 2; x < ix + cw + 2; x++) {
      if (style === 'fridge' || style === 'freezer' || style === 'oven') { pc.set(x, y - 1, (x % 3 === 0) ? 0x7a8488 : 0xc8d0d4); pc.set(x, y, 0x5a6468); }
      else { pc.set(x, y - 1, lt(look.base, 0.2)); pc.set(x, y, dk(look.base, 0.6)); pc.set(x, y + 1, dk(look.inner, 0.75)); }
    }
  }
  // style details
  if (style === 'wood' || style === 'laminate') {
    // drawer front lip with a brass pull at the bottom
    for (let x = 0; x < W; x++) for (let y = H - 7; y < H; y++) pc.set(x, y, y === H - 7 ? lt(look.base, 0.3) : y === H - 1 ? dk(look.base, 0.4) : scaleHex(look.base, 1.05 - (y - H + 7) * 0.03));
    const hx = Math.round(W / 2);
    pc.rect(hx - 8, H - 5, 16, 2, 0xb8902e); pc.rect(hx - 8, H - 5, 16, 1, 0xf0d070); pc.set(hx - 9, H - 4, 0x6a5018); pc.set(hx + 8, H - 4, 0x6a5018);
  } else if (style === 'fridge' || style === 'freezer') {
    // the little lamp at the top and frost
    pc.rect(Math.round(W / 2) - 4, 1, 8, 3, 0xfff8d8); pc.rect(Math.round(W / 2) - 3, 2, 6, 1, 0xffffff);
    if (style === 'freezer') for (let x = ix; x < ix + cw; x++) for (let y = iy; y < iy + 4; y++) if (ph(x, y, 9) > 0.4 - y * 0.08) pc.blend(x, y, 0xf4fbff, 0.6);
  } else if (style === 'carpet') {
    // rubber seal and the latch
    for (let x = 2; x < W - 2; x++) { pc.set(x, 2, 0x161618); pc.set(x, H - 3, 0x161618); }
    pc.rect(Math.round(W / 2) - 4, H - 6, 8, 4, 0x8a8e94); pc.rect(Math.round(W / 2) - 2, H - 5, 4, 2, 0x3a3c40);
  } else if (style === 'medical') {
    pc.rect(W - 9, 2, 6, 2, 0xc8302a); pc.rect(W - 7, 0, 2, 6, 0xc8302a);
  } else if (style === 'floor') {
    // ragged edge: the floor just goes on
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < 4 && ph(x, y, 51) * 4 > e + 0.6) pc.set(x, y, 0, 0);
    }
  }
  return { pc, ix, iy, w: W, h: H };
}

/** a strip of masking tape with a word written on it (container labels) */
export function paintTape(label: string, active: boolean): PixelCanvas {
  const s = label.toUpperCase().slice(0, 18);
  const W = textW(s) + 10, H = 11;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const base = active ? 0xe8dcb0 : 0xb8ae8a;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // torn ends
    if ((x < 2 && ph(0, y, 3) * 2 > x + 0.4) || (x > W - 3 && ph(1, y, 3) * 2 > W - 1 - x + 0.4)) continue;
    pc.set(x, y, scaleHex(base, 0.95 + ph(x >> 1, y, 5) * 0.08), active ? 255 : 230);
  }
  text(pc, s, 5, 3, active ? 0x1a1610 : 0x3a3426);
  return pc;
}

// Pixel-art textures for the Meridian Field Pack (src/ui/pack/packView.ts): slate
// institutional canvas with a twill weave, tan ripstop lining stitched into the
// 5x5x5 grid, black and ochre webbing, zip tape, a rubberised base, and the
// printed things: the stencilled Meridian seal with the asset number (stencil
// bridges, chipped paint), the debtor card in its clear window, the riveted asset
// plate and the packing card inside the lid. Everything is drawn pixel by pixel at
// about one texel per low-res screen pixel, nearest-filtered, no mipmaps; type is
// Space Grotesk drawn small and thresholded so every letter edge is a hard pixel.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex } from '../../gfx/pixel';
import { cssFont, fontsReady } from '../../gfx/crt';

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const hash = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

/** slate canvas: the pack's body colour (a grey-green institutional drab) */
export const SLATE = 0x5a6352;
export const OCHRE = 0xb08a3a;
export const LINING = 0xb3a37a;
export const WEB_BLACK = 0x26272a;

const TEX = new Map<string, THREE.Texture>();
const REDRAW: (() => void)[] = [];
/** repaint printed textures once the web font has arrived */
fontsReady().then(() => { for (const f of REDRAW) f(); });

function toTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true, printed = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (printed) REDRAW.push(() => { ctx.clearRect(0, 0, w, h); draw(ctx); t.needsUpdate = true; });
  TEX.set(key, t);
  return t;
}
const cached = (key: string, make: () => THREE.Texture) => TEX.get(key) ?? make();
const put = (ctx: CanvasRenderingContext2D, pc: PixelCanvas) => ctx.putImageData(pc.toImageData(), 0, 0);

// ---------------------------------------------------------------- tiles
/** slate Cordura: a 2/1 twill, thick and thin threads, slubs, lint, a few darned pulls */
export function canvasTile(): THREE.Texture {
  return cached('pk_canvas', () => toTex('pk_canvas', 64, 64, (ctx) => {
    const pc = new PixelCanvas(64, 64);
    const R = makeRamp(SLATE, 7, { spread: 0.42, hueShift: 0.03 });
    seed = 41;
    pc.each((x, y) => {
      // twill: diagonal ribs every 3 px, warp/weft alternation
      const rib = (x + y * 2) % 6 < 3 ? 1 : 0;
      const weft = (y % 2 === 0) ? ((x >> 1) % 2) : (((x + 1) >> 1) % 2);
      let i = 3 + rib * 0.6 - weft * 0.5 + (hash(x >> 2, y, 3) - 0.5) * 0.9;
      // thick slub threads running across
      if (hash(0, y, 9) > 0.86) i += hash(x >> 3, y, 4) > 0.4 ? 0.8 : -0.4;
      // low-frequency fade (sun and wear)
      i += (hash(x >> 4, y >> 4, 11) - 0.5) * 0.7;
      pc.set(x, y, R[Math.max(0, Math.min(6, Math.round(i)))]);
    });
    // lint and grit flecks
    for (let k = 0; k < 40; k++) pc.set((rnd() * 64) | 0, (rnd() * 64) | 0, rnd() < 0.5 ? R[5] : R[1]);
    // a pulled thread and a darn
    for (let x = 18; x < 30; x++) pc.set(x, 40 + ((x * 3) % 2), R[6]);
    for (let y = 9; y < 14; y++) for (let x = 47; x < 52; x++) if ((x + y) % 2) pc.set(x, y, R[1]);
    put(ctx, pc);
  }));
}

/** the twill weave's shade index at a pixel (0..6), shared by the tile and the one-off pictures */
function twill(x: number, y: number): number {
  const rib = (x + y * 2) % 6 < 3 ? 1 : 0;
  const weft = (y % 2 === 0) ? ((x >> 1) % 2) : (((x + 1) >> 1) % 2);
  let i = 3 + rib * 0.6 - weft * 0.5 + (hash(x >> 2, y, 3) - 0.5) * 0.9;
  if (hash(0, y, 9) > 0.86) i += hash(x >> 3, y, 4) > 0.4 ? 0.8 : -0.4;
  return i + (hash(x >> 4, y >> 4, 11) - 0.5) * 0.7;
}
/** a stitched seam line: a dark groove and a pale lock-stitch beside it */
function seamH(pc: PixelCanvas, x0: number, x1: number, y: number, R: number[], thread = 0xc8c0a0) {
  for (let x = x0; x <= x1; x++) { pc.set(x, y, R[0]); pc.set(x, y + 1, R[1]); if (x % 4 < 2) pc.set(x, y - 2, thread); }
}
function seamV(pc: PixelCanvas, x: number, y0: number, y1: number, R: number[], thread = 0xc8c0a0) {
  for (let y = y0; y <= y1; y++) { pc.set(x, y, R[0]); pc.set(x + 1, y, R[1]); if (y % 4 < 2) pc.set(x - 2, y, thread); }
}
/** scuffed, abraded canvas: lighter, the weave flattened */
function scuff(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, R: number[], k = 1) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d > 1) continue;
    if (hash(x, y, 31) < (1 - d) * 0.9 * k) pc.set(x, y, R[Math.min(6, 4 + (hash(x, y, 2) > 0.6 ? 1 : 0))]);
  }
}
/** dried mud and grime: dark blotches thickest near an edge */
function grime(pc: PixelCanvas, cx: number, cy: number, r: number, col = 0x2a2618, k = 0.7) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d > 1) continue;
    const n = hash(x >> 1, y >> 1, 41) * 0.7 + hash(x, y, 43) * 0.3;
    if (n < (1 - d) * k) pc.blend(x, y, col, 0.55 + n * 0.3);
  }
}

/**
 * The walls all the way round as one picture (u along the perimeter from the bottom end's
 * right corner, v up): stitched corner seams, a stitched band under the binding, the bottom
 * scuffed pale and caked with dried mud, a sewn-on patch, a darned tear, stencilled numbers.
 */
export function wallTex(perim: number, height: number, corners: number[]): THREE.Texture {
  const W = Math.max(64, Math.round(perim * 400)), H = Math.max(32, Math.round(height * 400));
  const key = 'pk_wall_' + W + 'x' + H;
  return cached(key, () => toTex(key, W, H, (ctx) => {
    const pc = new PixelCanvas(W, H);
    pc.wrap = false;
    const R = makeRamp(SLATE, 7, { spread: 0.42, hueShift: 0.03 });
    seed = 77;
    pc.each((x, y) => pc.set(x, y, R[Math.max(0, Math.min(6, Math.round(twill(x, y))))]));
    const top = 6; // canvas row 0 is the top (binding)
    // a stitched band under the binding, and the base seam
    seamH(pc, 0, W - 1, top + 10, R); seamH(pc, 0, W - 1, H - 14, R);
    // the corner seams
    for (const c of corners) seamV(pc, Math.round(c * W), top + 12, H - 16, R);
    // the bottom: abraded pale where it is dragged, then mud
    for (let x = 0; x < W; x += 9) scuff(pc, x + hash(x, 1, 5) * 6, H - 6, 9 + hash(x, 2, 5) * 10, 7 + hash(x, 3, 5) * 6, R, 0.9);
    for (let x = 0; x < W; x += 23) if (hash(x, 7, 9) > 0.35) grime(pc, x + hash(x, 3, 9) * 14, H - 2 - hash(x, 4, 9) * 6, 6 + hash(x, 5, 9) * 9);
    // drips and stains running down from the binding
    for (let k = 0; k < 9; k++) { const x = Math.floor(hash(k, 1, 13) * W); const len = 10 + Math.floor(hash(k, 2, 13) * 30); for (let y = top + 12; y < top + 12 + len; y++) pc.blend(x + ((y >> 3) % 2), y, 0x2c2a20, 0.35 * (1 - (y - top - 12) / len)); }
    // a sewn-on patch (a darker square of older canvas) and a darned tear
    const px = Math.round(W * 0.66), py = Math.round(H * 0.42);
    const R2 = makeRamp(scaleHex(SLATE, 0.82), 7, { spread: 0.4 });
    for (let y = py; y < py + 22; y++) for (let x = px; x < px + 28; x++) pc.set(x, y, R2[Math.max(0, Math.min(6, Math.round(twill(x + 3, y + 5))))]);
    for (let x = px - 1; x <= px + 28; x++) { if (x % 3) { pc.set(x, py - 1, 0xc8b070); pc.set(x, py + 22, 0xc8b070); } }
    for (let y = py - 1; y <= py + 22; y++) { if (y % 3) { pc.set(px - 1, y, 0xc8b070); pc.set(px + 28, y, 0xc8b070); } }
    const tx = Math.round(W * 0.21), ty = Math.round(H * 0.55);
    for (let i = 0; i < 16; i++) { pc.set(tx + i, ty + (i % 3 === 0 ? 1 : 0), R[0]); if (i % 2 === 0) { pc.set(tx + i, ty - 2, 0xd8cca0); pc.set(tx + i, ty + 2, 0xd8cca0); pc.set(tx + i, ty - 1, 0xd8cca0); } }
    // lint and grit flecks
    for (let k = 0; k < W * H / 60; k++) pc.set((rnd() * W) | 0, (rnd() * H) | 0, rnd() < 0.5 ? R[5] : R[1]);
    put(ctx, pc);
    // stencilled numbers on the long sides (the left wall reads MI 0447, the right one the type)
    hardText(ctx, 'MI-0447-R', Math.round(W * 0.42), Math.round(H * 0.4), 12, '#e2dbc4', 'center', 700, 100);
    hardText(ctx, 'TYPE 7  40 KG', Math.round(W * 0.92), Math.round(H * 0.4), 11, '#e2dbc4', 'center', 600, 100);
    chip(ctx, 0.2, 13);
  }, true, true));
}

/**
 * The flap's top as one picture (u across, v from the hinge to the bottom end): a double
 * stitched border, the crown worn pale by hands and straps, coffee-dark stains, a red
 * grease-pencil tally, mud at the bottom end.
 */
export function flapTex(w: number, l: number): THREE.Texture {
  const W = Math.max(64, Math.round(w * 400)), H = Math.max(64, Math.round(l * 400));
  const key = 'pk_flap_' + W + 'x' + H;
  return cached(key, () => toTex(key, W, H, (ctx) => {
    const pc = new PixelCanvas(W, H);
    pc.wrap = false;
    const R = makeRamp(SLATE, 7, { spread: 0.42, hueShift: 0.03 });
    seed = 91;
    pc.each((x, y) => pc.set(x, y, R[Math.max(0, Math.min(6, Math.round(twill(x + 11, y + 7))))]));
    // worn pale on the crown, along the two strap lines and at the bottom-end corners (hands)
    scuff(pc, W * 0.5, H * 0.45, W * 0.32, H * 0.3, R, 0.35);
    for (const v of [0.27, 0.53]) for (let x = 0; x < W; x += 6) scuff(pc, x, H * v, 6, 5, R, 0.6);
    scuff(pc, W * 0.12, H * 0.92, 18, 14, R, 0.8); scuff(pc, W * 0.88, H * 0.92, 18, 14, R, 0.8);
    // a double stitched border
    for (const inset of [5, 9]) { seamH(pc, inset, W - 1 - inset, inset, R); seamH(pc, inset, W - 1 - inset, H - 1 - inset, R); seamV(pc, inset, inset, H - 1 - inset, R); seamV(pc, W - 1 - inset, inset, H - 1 - inset, R); }
    // stains and mud
    grime(pc, W * 0.7, H * 0.18, 13, 0x2a2014, 0.55); grime(pc, W * 0.3, H * 0.75, 9, 0x2a2014, 0.5);
    for (let x = 0; x < W; x += 17) grime(pc, x, H - 3, 7 + hash(x, 1, 3) * 6, 0x2a2618, 0.8);
    for (let k = 0; k < W * H / 60; k++) pc.set((rnd() * W) | 0, (rnd() * H) | 0, rnd() < 0.5 ? R[5] : R[1]);
    // a tally in red grease pencil near the bottom-right corner: somebody counted something
    const gx = Math.round(W * 0.74), gy = Math.round(H * 0.84);
    for (let i = 0; i < 4; i++) for (let y = 0; y < 9; y++) pc.set(gx + i * 3, gy + y, 0xa83224);
    for (let i = 0; i < 13; i++) pc.set(gx - 1 + i, gy + 6 - Math.round(i * 0.4), 0xa83224);
    put(ctx, pc);
  }, false, true));
}

/**
 * The inside of the flap as one picture (u across, v from the hinge up to the free end, as it
 * stands open in front of you): tan ripstop, a mesh pocket with an elastic edge, the packing
 * card pinned in it, the stitched border, the lamp's scorch, a pencilled name crossed out.
 */
export function flapInsideTex(w: number, l: number): THREE.Texture {
  const W = Math.max(64, Math.round(w * 420)), H = Math.max(64, Math.round(l * 420));
  const key = 'pk_flapin_' + W + 'x' + H;
  return cached(key, () => toTex(key, W, H, (ctx) => {
    const pc = new PixelCanvas(W, H);
    pc.wrap = false;
    const R = makeRamp(LINING, 6, { spread: 0.36 });
    pc.each((x, y) => {
      let i = 3 + ((x + y) % 2 ? 0.4 : -0.3) + (hash(x, y, 2) - 0.5) * 0.8 + (hash(x >> 4, y >> 4, 6) - 0.5) * 0.6;
      if (x % 9 === 4 || y % 9 === 4) i -= 0.8;
      pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(i)))]);
    });
    // grime toward the hinge (canvas bottom) and the edges
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.min(x, W - 1 - x, y, H - 1 - y); const k = Math.max(0, 1 - e / 16) * 0.5 + Math.max(0, (y - H * 0.8) / (H * 0.2)) * 0.3; if (hash(x, y, 17) < k) pc.blend(x, y, 0x4a3e28, 0.4); }
    // a stitched border
    const RS = makeRamp(LINING, 6, { spread: 0.5 });
    for (let t = 6; t < W - 6; t++) { pc.set(t, 6, RS[0]); pc.set(t, H - 7, RS[0]); if (t % 4 < 2) { pc.set(t, 8, 0xece4c8); pc.set(t, H - 9, 0xece4c8); } }
    for (let t = 6; t < H - 6; t++) { pc.set(6, t, RS[0]); pc.set(W - 7, t, RS[0]); if (t % 4 < 2) { pc.set(8, t, 0xece4c8); pc.set(W - 9, t, 0xece4c8); } }
    // the mesh pocket over the middle: dark netting with an ochre elastic top edge
    const mx0 = Math.round(W * 0.1), mx1 = Math.round(W * 0.9), my0 = Math.round(H * 0.34), my1 = Math.round(H * 0.86);
    for (let y = my0; y < my1; y++) for (let x = mx0; x < mx1; x++) if ((x + y) % 3 === 0 || (x - y + 300) % 3 === 0) pc.blend(x, y, 0x1c1a16, 0.75);
    for (let x = mx0; x < mx1; x++) for (let y = my0 - 3; y < my0; y++) pc.set(x, y, y === my0 - 3 ? 0x6a5420 : x % 3 === 0 ? 0xc89a40 : 0xb08a3a);
    for (let y = my0; y < my1; y++) { pc.set(mx0, y, 0x6a5420); pc.set(mx1 - 1, y, 0x6a5420); }
    for (let x = mx0; x < mx1; x++) pc.set(x, my1, 0x6a5420);
    // the lamp's scorch near the hinge (it rests against the flap when shut)
    for (let y = H - 30; y < H - 12; y++) for (let x = Math.round(W / 2 - 14); x < W / 2 + 14; x++) { const d = Math.hypot((x - W / 2) / 14, (y - (H - 21)) / 9); if (d < 1 && hash(x, y, 23) < (1 - d)) pc.blend(x, y, 0x3a2a14, 0.45); }
    // the packing card, pinned in the mesh pocket, a little crooked
    const cw = Math.round(W * 0.62), ch = Math.round(cw * 0.66), cx0 = Math.round(W * 0.2), cy0 = Math.round(H * 0.4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const yy = cy0 + y + Math.round(x * 0.04);
      const edge = x === 0 || y === 0 || x === cw - 1 || y === ch - 1;
      pc.set(cx0 + x, yy, edge ? 0x8a7c5c : y < Math.round(ch * 0.17) ? 0x3a4436 : mixHex(0xf0e8d2, 0xdcd0b0, hash(x >> 3, y >> 3, 6) * 0.5));
    }
    for (let y = Math.round(ch * 0.3); y < ch - 2; y += 9) for (let x = 3; x < cw - 3; x++) pc.set(cx0 + x, cy0 + y + Math.round(x * 0.04), 0xc4ccd4);
    // a brass pin
    pc.set(cx0 + (cw >> 1), cy0 - 1, 0xe8c060); pc.set(cx0 + (cw >> 1), cy0, 0x8a6a20); pc.set(cx0 + (cw >> 1) + 1, cy0 - 1, 0xffe8a0);
    put(ctx, pc);
    const tx = cx0 + 5, ty = cy0;
    hardText(ctx, 'PACKING ORDER', cx0 + (cw >> 1), cy0 + Math.round(ch * 0.14), 9, '#e8dfc4', 'center', 700, 100);
    const lines = ['R turn  T tip  Y roll', 'Wheel: peel layers', 'Double-click: work on it', 'Heavy at the back', 'Tap the flap to close'];
    lines.forEach((ln, i) => hardText(ctx, ln, tx, ty + Math.round(ch * 0.3) + 7 + i * 9 + Math.round((cw * 0.3) * 0.04), 8, i === 3 ? '#7a1a12' : '#1e2a40', 'left', 500, 100));
    // a name pencilled on the lining and crossed out: the pack has been someone else's
    hardText(ctx, 'D-3906', Math.round(W * 0.78), Math.round(H * 0.2), 10, '#4a4030', 'center', 500, 100);
    ctx.fillStyle = '#4a4030'; ctx.fillRect(Math.round(W * 0.78) - 18, Math.round(H * 0.2) - 4, 36, 1);
  }, false, true));
}

/** the lining, one grid cell per tile: tan ripstop with a stitched seam on the left and top edges */
export function liningCell(): THREE.Texture {
  return cached('pk_lining', () => toTex('pk_lining', 24, 24, (ctx) => {
    const pc = new PixelCanvas(24, 24);
    const R = makeRamp(LINING, 6, { spread: 0.36 });
    pc.each((x, y) => {
      let i = 3 + ((x + y) % 2 ? 0.4 : -0.3) + (hash(x, y, 2) - 0.5) * 0.8;
      if (x % 8 === 5 || y % 8 === 5) i -= 0.8; // ripstop grid
      pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(i)))]);
    });
    // the seam: a dark groove with a pale lock-stitch beside it
    for (let t = 0; t < 24; t++) {
      pc.set(0, t, R[0]); pc.set(t, 0, R[0]);
      pc.set(1, t, R[1]); pc.set(t, 1, R[1]);
      if (t % 3 !== 2) { pc.set(2, t, 0xe8dfc4); pc.set(t, 2, 0xe8dfc4); }
    }
    pc.set(0, 0, 0x3a3222);
    put(ctx, pc);
  }));
}

/** webbing: nylon tape with herringbone and stitched edges (tiles along u) */
export function webbingTile(color = WEB_BLACK): THREE.Texture {
  const key = 'pk_web_' + color.toString(16);
  return cached(key, () => toTex(key, 16, 8, (ctx) => {
    const pc = new PixelCanvas(16, 8);
    const R = makeRamp(color, 5, { spread: 0.4 });
    pc.each((x, y) => {
      const hb = ((x + (y < 4 ? y : 7 - y)) % 4) < 2 ? 1 : 0;
      let i = 2 + hb * 0.8 - 0.4 + (hash(x, y, 7) - 0.5) * 0.5;
      if (y === 0 || y === 7) i = 0;
      if (y === 1 || y === 6) i = x % 3 === 0 ? 4 : 1.5; // edge stitch
      pc.set(x, y, R[Math.max(0, Math.min(4, Math.round(i)))]);
    });
    put(ctx, pc);
  }));
}

/** zip: interlocking teeth on a dark tape (u along the zip) */
export function zipTile(): THREE.Texture {
  return cached('pk_zip', () => toTex('pk_zip', 8, 6, (ctx) => {
    const pc = new PixelCanvas(8, 6);
    pc.each((x, y) => pc.set(x, y, y === 0 || y === 5 ? 0x141416 : 0x232326));
    for (let x = 0; x < 8; x++) {
      const up = x % 2 === 0;
      pc.set(x, up ? 2 : 3, x % 4 === 0 ? 0xc8ccd0 : 0x8a9096);
      pc.set(x, up ? 1 : 4, 0x4a4e54);
    }
    put(ctx, pc);
  }));
}

/** rubberised base: black with a raised diamond tread and scuffs */
export function rubberTile(): THREE.Texture {
  return cached('pk_rubber', () => toTex('pk_rubber', 32, 32, (ctx) => {
    const pc = new PixelCanvas(32, 32);
    pc.each((x, y) => {
      const d = (Math.abs(((x + y) % 8) - 4) + Math.abs(((x - y + 64) % 8) - 4));
      pc.set(x, y, d < 2 ? 0x3a3c3e : d < 3 ? 0x2a2b2d : 0x1c1d1f);
    });
    seed = 9;
    for (let k = 0; k < 12; k++) { const x = (rnd() * 32) | 0, y = (rnd() * 32) | 0; for (let i = 0; i < 5; i++) pc.set(x + i, y + ((i * 2) % 3) - 1, 0x55585a); }
    put(ctx, pc);
  }));
}

/** a stitched padded panel (the shoulder straps and hip belt): quilting diamonds on black mesh */
export function padTile(): THREE.Texture {
  return cached('pk_pad', () => toTex('pk_pad', 16, 16, (ctx) => {
    const pc = new PixelCanvas(16, 16);
    pc.each((x, y) => {
      const mesh = (x % 2 === 0 && y % 2 === 0) ? 0x141516 : 0x2c2e31;
      pc.set(x, y, mesh);
      if ((x + y) % 16 === 0 || (x - y + 16) % 16 === 0) pc.set(x, y, 0x55575b);
    });
    put(ctx, pc);
  }));
}

// ---------------------------------------------------------------- printed things
const FONT = () => cssFont('--font-new', 'monospace');
/** draw text, then snap its alpha to hard pixels (no anti-aliased fringe) */
function hardText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = 'left', weight = 600, cut = 110) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
  const t = tmp.getContext('2d')!;
  t.font = `${weight} ${px}px ${FONT()}`; t.textAlign = align; t.textBaseline = 'alphabetic';
  t.fillStyle = '#fff'; t.fillText(s, x, y);
  const img = t.getImageData(0, 0, w, h), d = img.data;
  const out = ctx.getImageData(0, 0, w, h), o = out.data;
  const col = new THREE.Color(color);
  const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > cut) { o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = 255; }
  ctx.putImageData(out, 0, 0);
}
/** knock out pixels to look like chipped, worn paint */
function chip(ctx: CanvasRenderingContext2D, amount: number, s = 5) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!d[i + 3]) continue;
    const n = hash(x >> 1, y >> 1, s) * 0.6 + hash(x, y, s + 1) * 0.4;
    if (n < amount) d[i + 3] = 0;
    else if (n < amount + 0.12) { d[i] *= 0.82; d[i + 1] *= 0.82; d[i + 2] *= 0.8; }
  }
  ctx.putImageData(img, 0, 0);
}

/** the Meridian seal in stencil: a globe of meridians under a lintel, with stencil bridges */
function seal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  ctx.fillStyle = col;
  for (let y = -r - 3; y <= r + 1; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x + 0.5, y + 0.5);
    const ring = d <= r && d > r - 2;
    const inner = d <= r - 3.5;
    let on = ring;
    if (inner) {
      // meridians (two ellipses and the axis) and the equator, as stencil cut-outs
      const ex1 = Math.abs(Math.hypot((x + 0.5) / (r * 0.38), (y + 0.5) / (r - 3.5)) - 1) < 0.12;
      const ex2 = Math.abs(Math.hypot((x + 0.5) / (r * 0.72), (y + 0.5) / (r - 3.5)) - 1) < 0.08;
      const axis = Math.abs(x + 0.5) < 0.9, eq = Math.abs(y + 0.5) < 0.9;
      on = !(ex1 || ex2 || axis || eq);
    }
    // stencil bridges: the ring is broken at four points
    if (ring && (Math.abs(x + 0.5) < 1.2 || Math.abs(y + 0.5) < 1.2)) on = false;
    // the lintel over the globe
    if (y <= -r - 1 && y >= -r - 3 && Math.abs(x) <= r - 1) on = Math.abs(x + 0.5) > 1.2;
    if (on) ctx.fillRect(cx + x, cy + y, 1, 1);
  }
}

/** the stencil on the lid: the seal, MERIDIAN INSTITUTE, the pack's type and asset number */
export function logoDecal(asset: string): THREE.Texture {
  const key = 'pk_logo_' + asset;
  return cached(key, () => toTex(key, 128, 80, (ctx) => {
    const W = 128, paint = '#e4ddc8';
    ctx.clearRect(0, 0, W, 80);
    seal(ctx, 64, 22, 15, paint);
    hardText(ctx, 'MERIDIAN', 64, 50, 13, paint, 'center', 700);
    hardText(ctx, 'INSTITUTE', 64, 61, 9, paint, 'center', 600);
    hardText(ctx, 'FIELD PACK  TYPE 7', 64, 71, 7, paint, 'center', 500, 90);
    // stencil bridges cut through every letter at one height
    const img = ctx.getImageData(0, 0, W, 80);
    for (const yy of [44, 56]) for (let x = 0; x < W; x++) img.data[(yy * W + x) * 4 + 3] = 0;
    ctx.putImageData(img, 0, 0);
    hardText(ctx, 'ASSET No. ' + asset, 64, 79, 7, '#f0c040', 'center', 600, 90);
    chip(ctx, 0.2, 3);
  }, false, true));
}

/** small print down a side wall */
export function warnDecal(): THREE.Texture {
  return cached('pk_warn', () => toTex('pk_warn', 128, 24, (ctx) => {
    ctx.clearRect(0, 0, 128, 24);
    // a hazard band: yellow and black steps
    for (let x = 0; x < 128; x++) for (let y = 0; y < 5; y++) { ctx.fillStyle = (((x + y) >> 2) % 2) ? '#18171a' : '#d8a42a'; ctx.fillRect(x, y, 1, 1); }
    hardText(ctx, 'PROPERTY OF THE REMITTANCE PROGRAMME', 2, 14, 7, '#ddd6c0', 'left', 500, 90);
    hardText(ctx, 'DEBTOR ISSUE  DO NOT REMOVE FROM SUBJECT', 2, 22, 7, '#ddd6c0', 'left', 500, 90);
    chip(ctx, 0.16, 8);
  }, false, true));
}

/** the debtor card behind its clear window: header, the number, a barcode, a photo square */
export function idCard(no: string): THREE.Texture {
  const key = 'pk_id_' + no;
  return cached(key, () => toTex(key, 64, 40, (ctx) => {
    const pc = new PixelCanvas(64, 40);
    pc.each((x, y) => pc.set(x, y, y < 9 ? 0xc8a032 : mixHex(0xece6d2, 0xd8d0b8, hash(x >> 2, y >> 2, 3) * 0.6)));
    pc.strokeRect(0, 0, 64, 40, 0x6a6250);
    // photo
    pc.rect(3, 12, 14, 17, 0x2c3329);
    for (let y = 15; y < 29; y++) for (let x = 6; x < 14; x++) if (Math.hypot(x - 9.5, y - 18) < 3.2 || (y > 23 && Math.abs(x - 9.5) < 4 + (y - 23) * 0.4)) pc.set(x, y, 0x54604e);
    // barcode
    for (let x = 20; x < 60; x++) if (hash(x, 1, 5) > 0.45) pc.vline(x, 31, 37, 0x1a1a1a);
    put(ctx, pc);
    hardText(ctx, 'DEBTOR', 4, 8, 8, '#2a1e08', 'left', 700);
    hardText(ctx, 'MERIDIAN', 61, 8, 7, '#2a1e08', 'right', 500, 90);
    hardText(ctx, no, 20, 26, 12, '#1a1a1c', 'left', 700);
  }, false, true));
}

/** the riveted asset plate on the frame */
export function assetPlate(asset: string): THREE.Texture {
  const key = 'pk_plate_' + asset;
  return cached(key, () => toTex(key, 48, 16, (ctx) => {
    const pc = new PixelCanvas(48, 16);
    pc.each((x, y) => pc.set(x, y, mixHex(0xb8bcc0, 0x8a9096, y / 16 + (hash(x, y, 2) - 0.5) * 0.2)));
    pc.strokeRect(0, 0, 48, 16, 0x4a4e54);
    for (const [x, y] of [[2, 2], [45, 2], [2, 13], [45, 13]]) { pc.set(x, y, 0x5a5e62); pc.set(x - 1, y - 1, 0xe8ecf0); }
    put(ctx, pc);
    hardText(ctx, asset, 24, 12, 9, '#2a2e32', 'center', 700);
  }, false, true));
}

/** the packing card pinned inside the lid */
export function packCard(): THREE.Texture {
  return cached('pk_card', () => toTex('pk_card', 96, 64, (ctx) => {
    const pc = new PixelCanvas(96, 64);
    pc.each((x, y) => pc.set(x, y, mixHex(0xf0e8d2, 0xdcd0b0, hash(x >> 3, y >> 3, 6) * 0.5 + y / 200)));
    for (let y = 18; y < 62; y += 9) pc.hline(3, 92, y, 0xb8c4d0);
    pc.vline(9, 12, 63, 0xd09090);
    pc.strokeRect(0, 0, 96, 64, 0x8a7c5c);
    pc.rect(0, 0, 96, 11, 0x3a4436);
    put(ctx, pc);
    hardText(ctx, 'PACKING ORDER', 48, 9, 8, '#e8dfc4', 'center', 700);
    hardText(ctx, 'R turn  T tip  Y roll', 12, 25, 8, '#1e2a40', 'left', 500, 95);
    hardText(ctx, 'Wheel: peel layers', 12, 34, 8, '#1e2a40', 'left', 500, 95);
    hardText(ctx, 'Double-click: work on it', 12, 43, 8, '#1e2a40', 'left', 500, 95);
    hardText(ctx, 'Heavy at the back', 12, 52, 8, '#6a1a12', 'left', 500, 95);
    hardText(ctx, 'Tap the flap to close', 12, 61, 8, '#1e2a40', 'left', 500, 95);
  }, false, true));
}

/** a manila luggage tag hung on the grab handle: the debtor's number in marker */
export function hangTag(no: string): THREE.Texture {
  const key = 'pk_tag_' + no;
  return cached(key, () => toTex(key, 32, 18, (ctx) => {
    const pc = new PixelCanvas(32, 18);
    pc.each((x, y) => {
      const clip = (x < 4 && y < 4 - x) || (x < 4 && y > 13 + x);
      if (clip) return;
      pc.set(x, y, mixHex(0xd6bf86, 0xc0a668, hash(x >> 1, y >> 1, 4) * 0.7));
    });
    pc.set(3, 8, 0x6a5020); pc.set(3, 9, 0x6a5020); pc.set(2, 8, 0xe8d8a0);
    put(ctx, pc);
    hardText(ctx, no, 18, 13, 9, '#1a1410', 'center', 700);
  }, false, true));
}

/** a flat colour ramp tile for small bits (buckles, cord) */
export function solidTile(c: number): THREE.Texture {
  const key = 'pk_solid_' + c.toString(16);
  return cached(key, () => toTex(key, 4, 4, (ctx) => {
    const pc = new PixelCanvas(4, 4);
    pc.each((x, y) => pc.set(x, y, (x + y) % 3 === 0 ? scaleHex(c, 0.9) : c));
    put(ctx, pc);
  }));
}

/** jumpsuit twill for the first-person sleeves: a pale weave (the sleeve colour tints it), a stitched seam, wear */
export function sleeveTex(): THREE.Texture {
  return cached('pk_sleeve', () => {
    const t = toTex('pk_sleeve', 32, 48, (ctx) => {
      const pc = new PixelCanvas(32, 48);
      pc.each((x, y) => {
        const rib = (x + y) % 4 < 2 ? 1 : 0;
        const v = 0.82 + rib * 0.07 + (hash(x >> 1, y, 5) - 0.5) * 0.08 + (hash(x >> 3, y >> 3, 9) - 0.5) * 0.06;
        const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
        pc.setRGBA(x, y, c, c, Math.round(c * 0.97));
      });
      // the inseam: a dark groove and a lock-stitch
      for (let y = 0; y < 48; y++) { pc.setRGBA(15, y, 120, 116, 108); pc.setRGBA(16, y, 168, 162, 150); if (y % 3) pc.setRGBA(18, y, 245, 240, 228); }
      // worn, grubby patches
      for (let k = 0; k < 6; k++) { const cx = hash(k, 1, 3) * 32, cy = hash(k, 2, 3) * 48; for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) if (hash(x + k, y, 7) < 0.45 - Math.hypot(x / 4, y / 3) * 0.4) pc.setRGBA(cx + x, cy + y, 150, 140, 120); }
      put(ctx, pc);
    });
    t.repeat.set(3, 2);
    return t;
  });
}

/** give the shared first-person arms' cloth (sleeves, cuffs, upper arms) a woven texture */
export function texturizeSleeves(root: THREE.Object3D, sleeveColor = 0xeeb415) {
  const want = new THREE.Color(sleeveColor);
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m || seen.has(m) || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    seen.add(m);
    if (m.color.getHex() !== want.getHex() || m.map) return;
    m.map = sleeveTex();
    m.needsUpdate = true;
  });
}

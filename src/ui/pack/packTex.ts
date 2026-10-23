// Pixel-art textures for the Meridian Field Pack (src/ui/pack/packView.ts): slate
// institutional canvas with a twill weave, tan ripstop lining stitched into the
// 5x5x5 grid, black and ochre webbing, zip tape, a rubberised base, and the
// printed things: the stencilled Meridian seal with the asset number (stencil
// bridges, chipped paint), the debtor card in its clear window, the riveted asset
// plate and the packing card inside the lid. Everything is drawn pixel by pixel at
// about one texel per low-res screen pixel, nearest-filtered, no mipmaps; type is
// Pixelify Sans drawn small and thresholded so every letter edge is a hard pixel.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex } from '../../gfx/pixel';
import { cssFont, fontsReady } from '../../gfx/crt';

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const hash = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

/** slate canvas: the pack's body colour (a grey-green institutional drab) */
export const SLATE = 0x4e5648;
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

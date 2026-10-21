// Pixel-art lettering for things that are not world textures: the floating
// speech in the first-person intake, the retro wrist unit's phosphor screen,
// the intake's fast-forward key. Everything is drawn with the game's own 3x5
// stencil font (src/content/furniture/a_lib.ts) into a PixelCanvas and shown
// with nearest filtering, so it sits in the same pixel grid as the world.
import * as THREE from 'three';
import { PixelCanvas } from '../gfx/pixel';
import { txt, txtW } from '../content/furniture/a_lib';

export interface PixelTex { pc: PixelCanvas; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null; tex: THREE.CanvasTexture; flush(): void }

/** a PixelCanvas with a canvas + texture behind it (flush() after drawing) */
export function pixelTex(w: number, h: number): PixelTex {
  const pc = new PixelCanvas(w, h);
  pc.wrap = false;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const img = ctx ? new ImageData(pc.data as unknown as Uint8ClampedArray<ArrayBuffer>, w, h) : null;
  return { pc, cv, ctx, tex, flush() { if (ctx && img) ctx.putImageData(img, 0, 0); tex.needsUpdate = true; } };
}

/** break a line into rows no wider than maxW pixels */
export function wrapText(text: string, maxW: number): string[] {
  const out: string[] = [];
  let row = '';
  for (const w of text.replace(/[—–]/g, '-').replace(/…/g, '...').split(/\s+/)) {
    const next = row ? row + ' ' + w : w;
    if (txtW(next) > maxW && row) { out.push(row); row = w; } else row = next;
  }
  if (row) out.push(row);
  return out;
}

/** lettering with a hard one-pixel outline and a drop shadow (stencil paint on air) */
export function inkText(pc: PixelCanvas, s: string, x: number, y: number, col: number, outline = 0x0a0806) {
  for (const [dx, dy] of [[1, 2], [2, 2], [2, 1]]) txt(pc, s, x + dx, y + dy, 0x000000);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) txt(pc, s, x + dx, y + dy, outline);
  txt(pc, s, x, y, col);
}

/** a block of floating speech: centred rows, outlined; returns the texture and its pixel size */
export function speechTex(text: string, col: number, maxW = 112): { t: PixelTex; w: number; h: number } {
  const rows = wrapText(text.toUpperCase(), maxW);
  const w = Math.max(8, ...rows.map((r) => txtW(r))) + 6, h = rows.length * 7 + 5;
  const t = pixelTex(w, h);
  rows.forEach((r, i) => inkText(t.pc, r, Math.round((w - txtW(r)) / 2), 2 + i * 7, col));
  t.flush();
  return { t, w, h };
}

/** the intake's fast-forward key: a chunky rubber VCR button, its lamp lit when hot */
export function drawSkipKey(pc: PixelCanvas, hot: boolean, esc: boolean) {
  const W = pc.w, H = pc.h;
  pc.data.fill(0);
  const body = hot ? 0x4a4640 : 0x34312c, top = hot ? 0x6a655c : 0x4a4640, dark = 0x16140f;
  // the bezel and the key cap (bevelled, rounded corners)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const corner = (x < 2 || x > W - 3) && (y < 2 || y > H - 3) && !((x === 1 || x === W - 2) && (y === 1 || y === H - 2));
    if (corner) continue;
    let c = body;
    if (y <= 1) c = top; else if (y >= H - 2) c = dark; else if (x <= 1) c = top; else if (x >= W - 2) c = dark;
    pc.set(x, y, c);
  }
  // ▶▶ moulded into the cap
  const ink = hot ? 0xf2e2b0 : 0xb8b0a0;
  const ix = 4, iy = Math.floor(H / 2) - 3;
  for (let k = 0; k < 2; k++) for (let j = 0; j < 7; j++) { const len = 4 - Math.abs(j - 3); for (let i = 0; i < len; i++) pc.set(ix + k * 5 + i, iy + j, ink); }
  txt(pc, 'SKIP', 16, iy + 1, ink);
  if (esc) txt(pc, 'ESC', W - 14, H - 8, 0x7a7468);
  // the little amber lamp
  pc.set(W - 4, 3, hot ? 0xffb040 : 0x5a3a14); pc.set(W - 5, 3, hot ? 0xc87a20 : 0x3a2610);
}

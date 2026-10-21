// Real type on the pixel props: a word set in an industrial typeface (Oswald,
// src/ui/fonts.css) is rasterised once into a scratch canvas and stamped into
// a prop's pixel decal with a hard alpha threshold, so tape labels and the
// bottle cap read as printed metal type yet stay crisp at the game's pixel size.
// Fonts arrive late: props register a refresh and redraw when they are in.
import { Screen } from '../font5x7';

const FAMILY = "'Oswald', 'Arial Narrow', 'Liberation Sans Narrow', sans-serif";
let cv: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
const listeners = new Set<() => void>();
let loaded = false;

function ctx() {
  if (!g) { cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; g = cv.getContext('2d', { willReadFrequently: true }); }
  return g;
}
function fontFor(capH: number, weight: number) { return `${weight} ${Math.max(6, Math.round(capH / 0.74))}px ${FAMILY}`; }

/** call fn whenever the real fonts finish loading (and once now if they already have) */
export function onTypeReady(fn: () => void) {
  listeners.add(fn);
  if (loaded) fn();
}
try {
  const fs = (document as any).fonts;
  const done = () => { loaded = true; for (const f of listeners) { try { f(); } catch { /* a prop gone */ } } };
  if (fs?.load) Promise.all([fs.load(`600 16px Oswald`), fs.load(`500 16px Oswald`)]).then(done, done);
  else loaded = true;
} catch { loaded = true; }

/** width in pixels of text set with cap height capH */
export function typeW(text: string, capH: number, weight = 600, track = 1): number {
  const c = ctx(); if (!c) return text.length * 6;
  c.font = fontFor(capH, weight);
  (c as any).letterSpacing = '0px';
  return Math.ceil(c.measureText(text).width + Math.max(0, text.length - 1) * track);
}

/**
 * Set text into a pixel screen: top of the capitals at y, starting at x, in
 * colour c (0xRRGGBB, alpha a). Returns the width used.
 */
export function typeText(s: Screen, text: string, x: number, y: number, capH: number, c: number, a = 255, weight = 600, track = 1): number {
  const g2 = ctx(); if (!g2 || !cv) { return s.text(text, x, y, Screen.c(c, a)); }
  g2.font = fontFor(capH, weight);
  (g2 as any).letterSpacing = track + 'px';
  const m = g2.measureText(text);
  const w = Math.min(cv.width, Math.ceil(m.width + 2 + text.length * track));
  const asc = Math.ceil(m.actualBoundingBoxAscent || capH), desc = Math.ceil(m.actualBoundingBoxDescent || 0);
  const h = Math.min(cv.height, asc + desc + 2);
  g2.clearRect(0, 0, w, h);
  g2.fillStyle = '#fff';
  g2.textBaseline = 'alphabetic';
  g2.fillText(text, 0, asc);
  const img = g2.getImageData(0, 0, w, h).data;
  const col = Screen.c(c, a);
  // capitals' top sits on y: the cap height of this face at this size
  const capTop = asc - Math.round(g2.measureText('H').actualBoundingBoxAscent || capH);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (img[(j * w + i) * 4 + 3] > 118) s.px(x + i, y + j - capTop, col);
  return Math.ceil(m.width);
}

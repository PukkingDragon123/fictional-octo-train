// THE MERIDIAN INSTITUTE OF LIMINALITY: the logo.
//
// The emblem is a bishop, the chess piece that only ever moves on the diagonal: an ivory piece with
// a mitre (the diagonal cut across it, the ball on top), two collars, a flared stem and a layered
// base, shaded from the upper left with a highlight down its face, a hard dark outline and a drop
// shadow, set in a riveted brass roundel over a dark field engraved with meridians.
//
// Everything is rasterised per pixel on an N x N grid (no smoothing, no scaled-down art), so every
// size is its own clean pixel art: 16 / 32 for favicons and tiny crests, 48 for lockups, 64 for the
// big one (scale it up by whole numbers: 128, 256). The wordmark is Alagard, thresholded crisp,
// brass with a dark outline.
//
//   emblemPixels(N, o)          the emblem as colours (-1 = transparent) on an N x N grid
//   emblemCanvas(N, o)          ... on a canvas (cached)
//   drawEmblem(c, x, y, N, k)   draw it at a whole-number scale k
//   drawEmblemMono(c, cx, cy, R, ink, mid?)   one ink (engraved signs, stamps, medallions)
//   logoCanvas(kind, k)         'emblem' | 'horizontal' | 'stacked' lockups at a whole-number scale
// (no imports: the pixel kits low in the tree draw the emblem too)
const cssFont = (token: string, fallback = 'Alagard, monospace') => { try { return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback; } catch { return fallback; } };
let scratch: HTMLCanvasElement | null = null;
/** a line of type with its alpha thresholded (hard pixel edges, no anti-aliasing) */
function inkText(c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, font: string, color: string, _align: 'left') {
  const size = Math.max(5, Math.round(px));
  scratch ??= document.createElement('canvas');
  const g = scratch.getContext('2d', { willReadFrequently: true })!;
  const f = `${size}px ${font}`;
  g.font = f;
  const w = Math.ceil(g.measureText(text).width) + 4, h = Math.ceil(size * 1.5) + 4;
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
  g.clearRect(0, 0, scratch.width, scratch.height);
  g.font = f; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = color;
  const base = Math.ceil(size * 1.1) + 1;
  g.fillText(text, 2, base);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  g.putImageData(img, 0, 0);
  const prev = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
  c.drawImage(scratch, 0, 0, w, h, Math.round(x) - 2, Math.round(y) - base, w, h);
  c.imageSmoothingEnabled = prev;
}

export const BRAND_NAME = 'Meridian Institute of Liminality';
export const BRAND_CAPS = 'MERIDIAN INSTITUTE OF LIMINALITY';

const OUT = 0x0d0a07;
const IVORY = [0x2a2218, 0x564a38, 0x857760, 0xb2a484, 0xd8cca8, 0xf2ead2, 0xfffbec];
const BRASS = [0x3a2a0e, 0x6a4e18, 0x9a7428, 0xc49a3c, 0xe2c066, 0xf6e09a];
const FIELD = [0x0a1310, 0x101c18, 0x172620, 0x1e3028];
const ENGRAVE = 0x2c4a3c;

export interface EmblemOpts {
  /** the riveted roundel and its field (default true); false = the bishop alone on transparent */
  roundel?: boolean;
}

// ---------------------------------------------------------------- the bishop's profile (local units: height 1, x from the axis)
interface Part { id: number; y0: number; y1: number; hw: (t: number) => number; disc?: boolean }
const PARTS: Part[] = [
  // the mitre: a pointed ovoid, widest two thirds down, tucked into the collar
  { id: 1, y0: 0.085, y1: 0.43, hw: (t) => 0.172 * Math.pow(Math.sin(Math.PI * (0.07 + 0.83 * Math.pow(t, 0.8))), 0.9) },
  { id: 2, y0: 0.405, y1: 0.45, hw: () => 0.135, disc: true },
  { id: 3, y0: 0.45, y1: 0.474, hw: () => 0.088 },
  { id: 4, y0: 0.474, y1: 0.506, hw: () => 0.115, disc: true },
  // the stem flares into the base
  { id: 5, y0: 0.506, y1: 0.765, hw: (t) => 0.074 + 0.082 * Math.pow(t, 1.9) },
  { id: 6, y0: 0.765, y1: 0.806, hw: () => 0.185, disc: true },
  { id: 7, y0: 0.806, y1: 0.872, hw: (t) => 0.2 + 0.03 * t, disc: true },
  { id: 8, y0: 0.872, y1: 0.94, hw: () => 0.252, disc: true },
  { id: 9, y0: 0.94, y1: 0.972, hw: () => 0.238, disc: true },
];
const BALL = { y: 0.045, r: 0.048 };
/** the mitre's cut: a slit from the upper right down toward the left, through the face */
const CUT = { x0: 0.105, y0: 0.165, x1: -0.035, y1: 0.315 };

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

/** which part of the piece a local point is in (0 = outside); u: across from the axis, y: down from the top */
function partAt(x: number, y: number): { id: number; t: number; hw: number } {
  if (Math.hypot(x, y - BALL.y) <= BALL.r) return { id: 10, t: (y - (BALL.y - BALL.r)) / (2 * BALL.r), hw: BALL.r };
  for (const p of PARTS) {
    if (y < p.y0 || y >= p.y1) continue;
    const t = (y - p.y0) / (p.y1 - p.y0), hw = p.hw(t);
    if (Math.abs(x) <= hw) return { id: p.id, t, hw };
  }
  // the mitre's top runs a hair into the collar band: take the widest
  return { id: 0, t: 0, hw: 0 };
}

const cache = new Map<string, Int32Array>();
/** the emblem on an N x N grid: one colour per pixel, -1 transparent */
export function emblemPixels(N: number, o: EmblemOpts = {}): Int32Array {
  const roundel = o.roundel !== false;
  const key = N + '|' + roundel;
  const hit = cache.get(key); if (hit) return hit;
  const out = new Int32Array(N * N).fill(-1);
  const px = 1 / N;
  const small = N < 24;
  // where the piece stands: inside the roundel's field, or filling the square
  const top = roundel ? 0.155 : 0.03, H = roundel ? 0.7 : 0.94;
  const loc = (i: number, j: number) => ({ x: ((i + 0.5) / N - 0.5) / H, y: ((j + 0.5) / N - top) / H });
  // the piece mask and parts
  const part = new Int16Array(N * N), tt = new Float32Array(N * N), uu = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const { x, y } = loc(i, j);
    const p = partAt(x, y);
    // thin parts never vanish at small sizes: half a pixel of grace on the widths
    let id = p.id;
    if (!id) { const g = partAt(Math.sign(x) * Math.max(0, Math.abs(x) - 0.45 * px / H), y); if (g.id && small) id = g.id; }
    part[j * N + i] = id;
    tt[j * N + i] = p.t;
    uu[j * N + i] = p.hw ? x / p.hw : 0;
  }
  const inP = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N && part[j * N + i] > 0;
  // ---- the roundel
  const c = 0.5, Ro = 0.5 - 0.35 * px, rimW = Math.max(2.2 * px, 0.105), Rin = Ro - rimW;
  if (roundel) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N - c, v = (j + 0.5) / N - c, d = Math.hypot(u, v);
    if (d > Ro) continue;
    let col: number;
    if (d > Ro - 1.05 * px) col = OUT;
    else if (d > Rin) {
      // brass, lit from the upper left; a dark bevel on its inner edge
      const lam = (-(u / d) * 0.7 - (v / d) * 0.7) * 0.5 + 0.5;
      col = d < Rin + 0.95 * px ? BRASS[0] : BRASS[Math.max(1, Math.min(5, Math.round(1 + lam * 4)))];
      if (d > Ro - 2.1 * px && lam > 0.55) col = BRASS[5];
    } else {
      // the field: dark, lighter toward the top, meridians engraved across it
      const g = Math.max(0, Math.min(3, Math.round(2.6 - (v + 0.5) * 2.2 - d * 1.2)));
      col = FIELD[g];
      if (!small) {
        const Rf = Rin - 1.5 * px;
        for (const k of [-0.72, -0.38, 0.38, 0.72]) {
          const s = 1 - (v / Rf) * (v / Rf);
          if (s <= 0) continue;
          if (Math.abs(u - k * Math.sqrt(s) * Rf) < 0.55 * px) col = ENGRAVE;
        }
        if (Math.abs(v - 0.2) < 0.5 * px && d < Rf) col = ENGRAVE;
      }
    }
    out[j * N + i] = col;
  }
  // rivets round the rim
  if (roundel && !small) {
    const rr = (Ro + Rin) / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * Math.PI / 4;
      const i = Math.floor((c + Math.cos(a) * rr) * N), j = Math.floor((c + Math.sin(a) * rr) * N);
      const set = (x: number, y: number, col: number) => { if (x >= 0 && y >= 0 && x < N && y < N) out[y * N + x] = col; };
      if (N >= 56) { set(i, j, BRASS[5]); set(i + 1, j, BRASS[3]); set(i, j + 1, BRASS[3]); set(i + 1, j + 1, BRASS[0]); }
      else { set(i, j, BRASS[5]); set(i + 1, j + 1, BRASS[0]); }
    }
  }
  // ---- the drop shadow (down and right) and the hard outline
  const sh = Math.max(1, Math.round(N / 40));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (inP(i, j)) continue;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inP(i + dx, j + dy)) { edge = true; break; }
    if (edge) out[j * N + i] = OUT;
    else if (inP(i - sh, j - sh) && out[j * N + i] !== -1) out[j * N + i] = FIELD[0];
  }
  // ---- the piece, shaded
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const id = part[j * N + i];
    if (!id) continue;
    const u = uu[j * N + i], t = tt[j * N + i];
    // a turned surface lit from the left: bright left of the axis, dark at the right edge
    let lam = 0.6 - 0.42 * u - 0.1 * Math.abs(u) * Math.abs(u);
    if (id === 10) lam = 0.75 - 0.4 * u - 0.35 * t;
    if (id === 1) lam += 0.08 - 0.22 * t;
    if (id === 5) lam -= 0.06;
    let k = Math.max(0, Math.min(5, Math.round(lam * 5.2)));
    // the specular stripe down the face
    if ((id === 1 || id === 5 || id === 8) && u > -0.62 && u < -0.3) k = Math.min(6, k + 1);
    // a disc catches the light on its top row and shadows its bottom row
    const above = j > 0 ? part[(j - 1) * N + i] : 0, below = j < N - 1 ? part[(j + 1) * N + i] : 0;
    const disc = PARTS.find((p) => p.id === id)?.disc;
    if (above !== id && above !== 0 && disc) k = Math.min(6, k + 1);
    if (below !== id && below !== 0) k = Math.max(0, k - 2);
    if (above !== id && above > 0 && !disc) k = Math.max(0, k - 1);
    out[j * N + i] = IVORY[k];
  }
  // ---- the mitre's cut: a dark slit with a lit lower lip
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (part[j * N + i] !== 1) continue;
    const { x, y } = loc(i, j);
    const d = segDist(x, y, CUT.x0, CUT.y0, CUT.x1, CUT.y1) * H * N;
    if (d < (small ? 0.55 : 0.75)) out[j * N + i] = OUT;
    else if (!small && d < 1.75) {
      // which side of the slit: below-left catches the light
      const side = (CUT.x1 - CUT.x0) * (y - CUT.y0) - (CUT.y1 - CUT.y0) * (x - CUT.x0);
      if (side > 0) out[j * N + i] = IVORY[Math.min(6, IVORY.indexOf(out[j * N + i]) + 1)];
      else out[j * N + i] = IVORY[Math.max(0, IVORY.indexOf(out[j * N + i]) - 2)];
    }
  }
  cache.set(key, out);
  return out;
}

const cvCache = new Map<string, HTMLCanvasElement>();
/** the emblem on its own N x N canvas (cached) */
export function emblemCanvas(N: number, o: EmblemOpts = {}): HTMLCanvasElement {
  const key = N + '|' + (o.roundel !== false);
  const hit = cvCache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(N, N), d = img.data, p = emblemPixels(N, o);
  for (let i = 0; i < N * N; i++) { const col = p[i]; if (col < 0) continue; d[i * 4] = (col >> 16) & 255; d[i * 4 + 1] = (col >> 8) & 255; d[i * 4 + 2] = col & 255; d[i * 4 + 3] = 255; }
  c.putImageData(img, 0, 0);
  cvCache.set(key, cv);
  return cv;
}
/** draw the emblem (grid N) at (x, y) scaled by a whole number */
export function drawEmblem(c: CanvasRenderingContext2D, x: number, y: number, N: number, k = 1, o: EmblemOpts = {}) {
  const prev = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
  c.drawImage(emblemCanvas(N, o), Math.round(x), Math.round(y), N * k, N * k);
  c.imageSmoothingEnabled = prev;
}
/**
 * the emblem in one ink (engraved signs, rubber stamps, medallions): the roundel's rings, the piece's outline, the
 * mitre's cut, the meridians; the piece and the band filled with `mid` when given
 */
export function drawEmblemMono(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, ink: string, mid?: string) {
  const N = Math.max(12, Math.round(R * 2 + 1));
  const p = emblemPixels(N);
  const x0 = Math.round(cx - N / 2 + 0.5), y0 = Math.round(cy - N / 2 + 0.5);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const col = p[j * N + i];
    if (col < 0) continue;
    let fill: string | null = null;
    if (col === OUT || col === BRASS[0] || col === ENGRAVE) fill = ink;
    else if (BRASS.includes(col)) fill = mid ?? null;
    else if (IVORY.includes(col)) fill = IVORY.indexOf(col) >= 4 ? ink : mid ?? null;
    if (!fill) continue;
    c.fillStyle = fill; c.fillRect(x0 + i, y0 + j, 1, 1);
  }
}

// ---------------------------------------------------------------- the wordmark
/** a line of Alagard in brass with a hard dark outline, at scale 1 (16 px type) */
function brassLine(text: string, px = 16, spacing = 0): HTMLCanvasElement {
  const font = cssFont('--font-new');
  const chars = [...text];
  // measure by drawing (thresholded type), letter by letter when spaced out
  const tmp = document.createElement('canvas'); const tc = tmp.getContext('2d')!;
  tc.font = `${px}px ${font}`;
  const widths = chars.map((ch) => Math.ceil(tc.measureText(ch).width));
  const W = Math.ceil((spacing ? widths.reduce((a, b) => a + b + spacing, 0) : tc.measureText(text).width)) + 6, H = Math.ceil(px * 1.35) + 4;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const base = Math.ceil(px * 1.05) + 1;
  const write = (col: string, dx: number, dy: number) => {
    if (!spacing) { inkText(c, text, 2 + dx, base + dy, px, font, col, 'left'); return; }
    let x = 2;
    chars.forEach((ch, i) => { if (ch !== ' ') inkText(c, ch, x + dx, base + dy, px, font, col, 'left'); x += widths[i] + spacing; });
  };
  // outline + a shadow step, then the brass in two tones (light over, dark under)
  const ink = '#' + OUT.toString(16).padStart(6, '0');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [2, 2], [1, 2], [2, 1]]) write(ink, dx, dy);
  // the fill on its own layer so the two tones only land on the letters
  const fill = document.createElement('canvas'); fill.width = W; fill.height = H;
  const fc = fill.getContext('2d')!;
  if (!spacing) inkText(fc, text, 2, base, px, font, '#e2c066', 'left');
  else { let x = 2; chars.forEach((ch, i) => { if (ch !== ' ') inkText(fc, ch, x, base, px, font, '#e2c066', 'left'); x += widths[i] + spacing; }); }
  fc.globalCompositeOperation = 'source-atop';
  fc.fillStyle = '#f6e09a'; fc.fillRect(0, 0, W, Math.round(base - px * 0.62));
  fc.fillStyle = '#b08a3a'; fc.fillRect(0, Math.round(base - px * 0.22), W, H);
  c.drawImage(fill, 0, 0);
  return cv;
}

export type LockupKind = 'emblem' | 'horizontal' | 'stacked';
/** the logo at a whole-number scale: the emblem alone (64 grid), or the emblem with the wordmark beside / under it */
export function logoCanvas(kind: LockupKind, k = 1): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d')!;
  const smooth = (on: boolean) => { c.imageSmoothingEnabled = on; };
  if (kind === 'emblem') {
    cv.width = cv.height = 64 * k;
    drawEmblem(c, 0, 0, 64, k);
    return cv;
  }
  const l1 = brassLine('MERIDIAN INSTITUTE', 16, 1), l2 = brassLine('OF LIMINALITY', 16, 3);
  const E = 56;
  if (kind === 'horizontal') {
    const tw = Math.max(l1.width, l2.width), W = E + 10 + tw + 2, H = E + 4;
    cv.width = W * k; cv.height = H * k;
    smooth(false);
    drawEmblem(c, 0, 2 * k, E, k);
    const tx = E + 10, ty = 6;
    c.drawImage(l1, 0, 0, l1.width, l1.height, tx * k, ty * k, l1.width * k, l1.height * k);
    // a brass rule between the lines with a lozenge at its head
    const ry = ty + l1.height + 1;
    c.fillStyle = '#0d0a07'; c.fillRect((tx + 1) * k, (ry - 1) * k, (tw - 2) * k, 3 * k);
    c.fillStyle = '#c49a3c'; c.fillRect((tx + 2) * k, ry * k, (tw - 4) * k, 1 * k);
    c.drawImage(l2, 0, 0, l2.width, l2.height, (tx + Math.round((l1.width - l2.width) / 2)) * k, (ry + 2) * k, l2.width * k, l2.height * k);
    return cv;
  }
  const tw = Math.max(l1.width, l2.width), W = tw + 4, Eb = 64, H = Eb + 6 + l1.height + 4 + l2.height;
  cv.width = W * k; cv.height = H * k;
  smooth(false);
  drawEmblem(c, Math.round((W - Eb) / 2) * k, 0, Eb, k);
  const y1 = Eb + 4;
  c.drawImage(l1, 0, 0, l1.width, l1.height, Math.round((W - l1.width) / 2) * k, y1 * k, l1.width * k, l1.height * k);
  const ry = y1 + l1.height + 1;
  c.fillStyle = '#0d0a07'; c.fillRect(Math.round(W * 0.2) * k, (ry - 1) * k, Math.round(W * 0.6) * k, 3 * k);
  c.fillStyle = '#c49a3c'; c.fillRect((Math.round(W * 0.2) + 1) * k, ry * k, (Math.round(W * 0.6) - 2) * k, 1 * k);
  c.drawImage(l2, 0, 0, l2.width, l2.height, Math.round((W - l2.width) / 2) * k, (ry + 3) * k, l2.width * k, l2.height * k);
  return cv;
}
/** a data URL of the emblem (img tags in HTML strings: the death report's letterhead, cards) */
const urlCache = new Map<string, string>();
export function emblemUrl(N = 32): string {
  const key = String(N);
  const hit = urlCache.get(key); if (hit) return hit;
  const u = emblemCanvas(N).toDataURL('image/png');
  urlCache.set(key, u);
  return u;
}

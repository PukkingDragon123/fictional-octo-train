// THE SLATE KEY: the classic chunky 2D pixel button the title menu wears, as one hand-pixelled
// painter shared by every in-game control (pause column, item card keys, the CSS nine-slices the
// dialogue replies, report keys and title words use). Drawn in art pixels and shown at 2x (or any
// whole multiple) with nearest filtering, so every step stays a crisp square:
//   - a stepped corner notch on every corner (never rounded), a 1-art ink outline
//   - a two-step bevel: lit top-left (two light rows), shaded bottom-right (two dark rows)
//   - a slate face in three bands joined by an ordered (Bayer) dither, a dithered sheen up top
//   - a hard pixel drop shadow (one solid step, one checkered step)
//   - a square indicator lamp in a pixel bezel (lights with a dithered glow), tiny 2x2 rivets
//   - hot: a warm rim on the lit lip and a stepped diagonal glint; down: the plate sinks one
//     step, the bevel inverts; off: greyed and dimmed
import { mixHex } from '../gfx/pixel';

export type SlateTone = 'slate' | 'olive' | 'red' | 'brass';
export type SlateLamp = 'amber' | 'green' | 'red' | 'blue' | false;
/** 0 up, 1 hot (hover / focus), 2 down (pressed / latched), 3 off (disabled) */
export type SlateSt = 0 | 1 | 2 | 3;
export interface SlateOpts {
  st?: SlateSt; tone?: SlateTone; lamp?: SlateLamp;
  /** the lamp shows its colour even at rest (a status lamp), brighter when hot */
  lampLit?: boolean;
  rivets?: boolean; seed?: number;
  /** an engraved glyph in the middle (icon-only keys) */
  glyph?: 'X' | 'L' | 'R';
  /** slateUrl only: grow the PNG this many times (nearest), to show at its natural size */
  scale?: number;
}

//        0 ink     1 deep    2 shade   3 face-lo 4 face    5 face-hi 6 bevel   7 lit     8 glint   9 spec
const TONES: Record<SlateTone, number[]> = {
  slate: [0x050404, 0x0d0f12, 0x16191d, 0x1e2227, 0x262b31, 0x30363d, 0x434a52, 0x6a747e, 0x9aa5ad, 0xdde4e6],
  olive: [0x050404, 0x101208, 0x1a1e10, 0x252b17, 0x2f3720, 0x3a4428, 0x55613a, 0x7a8a56, 0xa6b480, 0xe4ecc8],
  red: [0x050404, 0x1a0706, 0x2a0d0b, 0x38130f, 0x481913, 0x58211a, 0x7e3626, 0xa8543a, 0xd08060, 0xf4d0c0],
  brass: [0x050404, 0x241808, 0x38260c, 0x4e3612, 0x664818, 0x80601e, 0x9c7a2c, 0xc4a24a, 0xead08a, 0xfaecc0],
};
const LAMPS: Record<Exclude<SlateLamp, false>, number[]> = {
  //       dark      dim       core      hi        spec      glow
  amber: [0x2a1404, 0x5a3008, 0xf2ad32, 0xffd06a, 0xfff0bc, 0xffb040],
  green: [0x06200e, 0x0e4a1e, 0x3ae86a, 0x96ffb0, 0xe0ffe8, 0x40ff80],
  red: [0x2a0604, 0x5a0c08, 0xf05a3a, 0xff9a7a, 0xffe0d4, 0xff5030],
  blue: [0x041c24, 0x0a3a4a, 0x3ec8da, 0x9cf0f8, 0xe4feff, 0x50d8f0],
};
const WARM = 0xffc860;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hsh = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; };
const grey = (c: number) => { const l = Math.round(((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.55 + (c & 255) * 0.15); return (l << 16) | (l << 8) | l; };

/** a little RGBA buffer with alpha-over blending */
class Buf {
  d: Uint8ClampedArray<ArrayBuffer>;
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8ClampedArray(new ArrayBuffer(w * h * 4)); }
  set(x: number, y: number, c: number, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4, d = this.d;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const da = d[i + 3] / 255, oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = (r * a + d[i] * da * (1 - a)) / oa; d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa; d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa; d[i + 3] = oa * 255;
  }
  canvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    cv.getContext('2d')!.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return cv;
  }
}

/** ring depth (0 ink .. 3 face, 4-neighbour steps so diagonals come out as clean stairs) and lit side (+1 top-left / -1 bottom-right) for a notched box */
function rings(pw: number, ph: number, notch: number) {
  const inside = (u: number, v: number) => u >= 0 && v >= 0 && u < pw && v < ph && u + v >= notch && (pw - 1 - u) + v >= notch && u + (ph - 1 - v) >= notch && (pw - 1 - u) + (ph - 1 - v) >= notch;
  const ring = new Int8Array(pw * ph).fill(-1), lit = new Int8Array(pw * ph);
  for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) if (inside(u, v)) ring[v * pw + u] = 3;
  for (let d = 0; d < 3; d++) {
    const mark: number[] = [];
    for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) {
      if (ring[v * pw + u] !== 3) continue;
      const out = (x: number, y: number) => !inside(x, y) || (ring[y * pw + x] >= 0 && ring[y * pw + x] < d);
      if (out(u - 1, v) || out(u + 1, v) || out(u, v - 1) || out(u, v + 1)) mark.push(v * pw + u);
    }
    for (const i of mark) ring[i] = d;
  }
  for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) {
    const r = ring[v * pw + u]; if (r < 0 || r === 3) continue;
    const a = Math.min(v, u), z = Math.min(ph - 1 - v, pw - 1 - u);
    lit[v * pw + u] = a < z ? 1 : a > z ? -1 : (v <= ph - 1 - v && u >= pw - 1 - u) || (u <= pw - 1 - u && v >= ph - 1 - v) ? (v < u - (pw - ph) / 2 ? 1 : -1) : 0;
  }
  return { ring, lit, inside };
}

const GLYPHS: Record<string, string[]> = {
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  L: ['..#', '.##', '###', '.##', '..#'],
  R: ['#..', '##.', '###', '##.', '#..'],
};

/** paint a slate key, aw x ah art pixels (the plate is aw-1 x ah-2; the rest is its drop shadow) */
export function paintSlate(aw: number, ah: number, o: SlateOpts = {}): HTMLCanvasElement {
  const st = o.st ?? 0, R = TONES[o.tone ?? 'slate'], seed = o.seed ?? 7;
  const b = new Buf(aw, ah);
  const pw = aw - 1, ph = ah - 2, dn = st === 2 ? 1 : 0;
  const notch = ph >= 14 ? 3 : 2;
  const { ring, lit, inside } = rings(pw, ph, notch);
  // the drop shadow: one solid step, then a checkered one
  for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) {
    if (!inside(u, v)) continue;
    if (!inside(u + 1, v + 1)) b.set(u + 1, v + 1, 0x000000, 0.6);
    if (!dn && !inside(u + 1, v + 2) && !inside(u, v + 2) && ((u + v) & 1) === 0) b.set(u + 1, v + 2, 0x000000, 0.42);
  }
  const hot = st === 1, down = st === 2, off = st === 3;
  const P = (u: number, v: number, c: number, a = 1) => {
    if (u < 0 || v < 0 || u >= pw || v >= ph || ring[v * pw + u] < 0) return;
    b.set(u, v + dn, off ? mixHex(mixHex(c, grey(c), 0.7), 0x000000, 0.25) : c, a);
  };
  // face bands (hi / mid / lo) joined by a two-row Bayer dither
  const lift = hot ? 1 : down ? -1 : 0;
  const band = (u: number, v: number) => {
    const t = v / Math.max(1, ph - 1);
    const f = t < 0.34 ? 0 : t < 0.68 ? 1 : 2;
    const edge = f < 2 ? (f === 0 ? 0.34 : 0.68) * (ph - 1) : -9;
    const near = edge - v;
    let k = f;
    if (near > 0 && near <= 2 && bay(u, v) < (2.5 - near) / 3) k++;
    return R[Math.max(1, Math.min(8, 5 - k + lift))];
  };
  for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) {
    const r = ring[v * pw + u];
    if (r < 0) continue;
    const l = lit[v * pw + u];
    let c: number;
    if (r === 0) c = R[0];
    else if (r === 1) c = down ? (l > 0 ? R[1] : l < 0 ? R[6] : R[3]) : (l > 0 ? (hot ? R[8] : R[7]) : l < 0 ? R[1] : R[4]);
    else if (r === 2) c = down ? (l > 0 ? R[2] : l < 0 ? R[5] : band(u, v)) : (l > 0 ? (hot ? R[7] : R[6]) : l < 0 ? R[2] : band(u, v));
    else c = band(u, v);
    P(u, v, c);
  }
  // the sheen: a dithered light run along the top of the face, fading out to the right
  if (!down) for (let u = 3; u < pw - 3; u++) { const t = u / pw; if (t < 0.55 && bay(u, 3) < 0.85 - t * 1.4) P(u, 3, R[hot ? 7 : 6], 0.7); }
  // a specular pixel where the lit lip turns the corner
  if (!down) { P(notch, 1, R[9]); P(notch + 1, 1, R[9], 0.6); P(1, notch, R[8]); }
  // hot: a warm rim along the lit lip
  if (hot) { for (let u = notch; u < pw - notch; u++) P(u, 1, WARM, 0.45); for (let v = notch; v < ph - notch; v++) P(1, v, WARM, 0.3); }
  // wear: a few scuffs on the face (light run with a dark pixel under its start)
  for (let i = 0, n = Math.max(1, Math.round(pw / 22)); i < n; i++) {
    let u = 8 + Math.floor(hsh(i, 1, seed) * Math.max(1, pw - 18)), v = 4 + Math.floor(hsh(i, 2, seed) * Math.max(1, ph - 8));
    const len = 2 + Math.floor(hsh(i, 3, seed) * 3), dx = hsh(i, 4, seed) < 0.5 ? 1 : -1;
    if (ring[(v + 1) * pw + u] === 3) P(u, v + 1, R[1], 0.5);
    for (let k = 0; k < len; k++) { if (ring[v * pw + u] === 3) P(u, v, R[6], 0.55); u += dx; if (k & 1) v++; }
  }
  // grime settles along the foot
  for (let u = 3; u < pw - 3; u++) if (hsh(u, 9, seed) < 0.3) P(u, ph - 3, R[1], 0.35);
  // hot: a stepped diagonal glint across the face
  if (hot) {
    const g0 = Math.round(pw * 0.68);
    for (let v = 2; v < ph - 2; v++) {
      const u = g0 - (v >> 1);
      for (const [du, a] of [[0, 0.22], [1, 0.22], [4, 0.12]] as const) if (ring[v * pw + u + du] >= 2) P(u + du, v, 0xffffff, a);
    }
  }
  // the lamp: a square window in a pixel bezel, at the left end
  if (o.lamp) {
    const L = LAMPS[o.lamp];
    const s = ph >= 14 ? 4 : 3;
    const lx = notch + 2, ly = Math.floor((ph - s) / 2);
    const on = hot || down || !!o.lampLit;
    const bright = hot || down;
    for (let i = -1; i <= s; i++) { P(lx + i, ly - 1, R[0]); P(lx + i, ly + s, R[0]); P(lx - 1, ly + i, R[0]); P(lx + s, ly + i, R[0]); }
    for (let i = -1; i <= s + 1; i++) { P(lx + i, ly + s + 1, R[7], 0.8); P(lx + s + 1, ly + i, R[6], 0.8); }
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      let c = on ? (bright ? L[2] : mixHex(L[2], L[1], 0.45)) : L[0];
      if (on && (i === s - 1 || j === s - 1)) c = mixHex(c, L[1], 0.5);
      if (!on && i === 0 && j === 0) c = L[1];
      P(lx + i, ly + j, c);
    }
    if (on) { P(lx, ly, bright ? L[4] : L[3]); if (s > 3) P(lx + 1, ly, L[3], bright ? 1 : 0.7); }
    if (bright) for (let j = -3; j <= s + 2; j++) for (let i = -3; i <= s + 2; i++) {
      if (i >= -1 && i <= s && j >= -1 && j <= s) continue;
      const d = Math.max(i < -1 ? -1 - i : i - s, j < -1 ? -1 - j : j - s);
      if ((i + j) & 1 && d > 1) continue;
      if (ring[(ly + j) * pw + lx + i] >= 2) P(lx + i, ly + j, L[5], d <= 1 ? 0.3 : 0.16);
    }
  }
  // tiny rivets at the right end
  if (o.rivets !== false && pw >= 24 && !o.glyph) {
    const rivet = (u: number, v: number) => { P(u - 1, v, R[1], 0.6); P(u, v - 1, R[1], 0.6); P(u, v, R[9]); P(u + 1, v, R[8]); P(u, v + 1, R[8]); P(u + 1, v + 1, R[6]); P(u + 2, v, R[0], 0.8); P(u + 2, v + 1, R[0], 0.8); P(u, v + 2, R[0], 0.8); P(u + 1, v + 2, R[0], 0.8); };
    const rx = pw - notch - 4;
    if (ph >= 13) { rivet(rx, 3); rivet(rx, ph - 6); } else rivet(rx, Math.floor(ph / 2) - 1);
  }
  // an engraved glyph
  if (o.glyph) {
    const g = GLYPHS[o.glyph], gw = g[0].length, gh = g.length;
    const gx = Math.floor((pw - gw) / 2), gy = Math.floor((ph - gh) / 2);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) if (g[j][i] === '#') {
      P(gx + i, gy + j, hot ? (j === 0 ? 0xfff0bc : 0xffb43c) : R[8]);
      if (g[j + 1]?.[i] !== '#') P(gx + i, gy + j + 1, R[1]);
    }
  }
  return b.canvas();
}

const urlCache = new Map<string, string>();
/** a slate key as a data URL (cached) */
export function slateUrl(aw: number, ah: number, o: SlateOpts = {}): string {
  const k = `${aw}|${ah}|${o.st ?? 0}|${o.tone}|${o.lamp}|${o.lampLit}|${o.rivets}|${o.seed}|${o.glyph}|${o.scale}`;
  let u = urlCache.get(k);
  if (!u) {
    const cv = paintSlate(aw, ah, o);
    u = (o.scale && o.scale > 1 ? grow(cv, o.scale) : cv).toDataURL();
    if (urlCache.size > 400) urlCache.delete(urlCache.keys().next().value as string);
    urlCache.set(k, u);
  }
  return u;
}

// ---------------------------------------------------------------- the CSS nine-slices (2x art)
/** a plate nine-slice: 12x12 art grown to 24x24 (slice 8 = 4 art px); flat across every stretched run */
function ninePlate(R: number[], st: SlateSt, rivets: boolean): HTMLCanvasElement {
  const A = 12, b = new Buf(A, A);
  const pw = 11, notch = 2;
  const { ring, lit, inside } = rings(pw, pw, notch);
  for (let v = 0; v < pw; v++) for (let u = 0; u < pw; u++) if (inside(u, v) && !inside(u + 1, v + 1)) b.set(u + 1, v + 1, 0x000000, 0.55);
  const hot = st === 1, down = st === 2;
  for (let v = 0; v < pw; v++) for (let u = 0; u < pw; u++) {
    const r = ring[v * pw + u]; if (r < 0) continue;
    const l = lit[v * pw + u];
    let c: number;
    if (r === 0) c = R[0];
    else if (r === 1) c = down ? (l > 0 ? R[1] : R[6]) : l > 0 ? R[hot ? 8 : 7] : l < 0 ? R[1] : R[4];
    else if (r === 2) c = down ? (l > 0 ? R[2] : R[5]) : l > 0 ? R[hot ? 7 : 6] : l < 0 ? R[2] : R[4];
    else c = v === 3 && !down ? R[hot ? 6 : 5] : R[hot ? 5 : down ? 3 : 4];
    b.set(u, v, c);
  }
  if (hot) { for (let u = 2; u < 9; u++) b.set(u, 1, WARM, 0.45); for (let v = 2; v < 9; v++) b.set(1, v, WARM, 0.3); }
  if (!down) b.set(2, 1, R[9]);
  if (rivets) for (const [x, y] of [[2, 2], [8, 2], [2, 8], [8, 8]]) { b.set(x, y, R[9]); b.set(x + 1, y, R[7]); b.set(x, y + 1, R[7]); b.set(x + 1, y + 1, R[1]); }
  return grow(b.canvas(), 2);
}
/** a keycap nine-slice: 9x9 art grown to 18x18 (slice 6 = 3 art px), a thick lip under it */
function nineKey(R: number[], st: SlateSt): HTMLCanvasElement {
  const A = 9, b = new Buf(A, A);
  const hot = st === 1, down = st === 2;
  const face = hot ? mixHex(R[5], 0x6a4a18, 0.35) : down ? R[3] : R[4];
  for (let v = 0; v < A; v++) for (let u = 0; u < A; u++) {
    const cu = u === 0 || u === A - 1, cv = v === 0 || v === A - 1;
    if (cu && cv) continue;
    let c = face;
    if (cu || cv) c = R[0];
    else if (down) { if (v === 1) c = R[1]; else if (u === 1) c = R[2]; else if (v === A - 2) c = R[3]; }
    else {
      if (v === A - 2) c = R[1]; else if (v === A - 3) c = R[2];
      else if (v === 1) c = hot ? R[8] : R[7]; else if (u === 1) c = hot ? R[7] : R[6]; else if (u === A - 2) c = R[2];
      else if (v === 2) c = hot ? mixHex(R[6], 0x6a4a18, 0.3) : R[5];
    }
    b.set(u, v, c);
  }
  if (hot) for (let u = 2; u < A - 2; u++) b.set(u, 1, WARM, 0.5);
  return grow(b.canvas(), 2);
}
function grow(src: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = src.width * k; cv.height = src.height * k;
  const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}
/** paint the kit's CSS nine-slices (--px-steel, --px-key ... in src/ui/pxKit.css) from the slate painter */
export function installSlateVars() {
  try {
    const de = document.documentElement.style;
    const set = (n: string, cv: HTMLCanvasElement) => de.setProperty(n, `url(${cv.toDataURL()})`);
    set('--px-steel', ninePlate(TONES.slate, 0, true));
    set('--px-steel-hot', ninePlate(TONES.slate, 1, true));
    set('--px-steel-down', ninePlate(TONES.slate, 2, true));
    set('--px-brass', ninePlate(TONES.brass, 0, true));
    set('--px-key', nineKey(TONES.slate, 0));
    set('--px-key-hot', nineKey(TONES.slate, 1));
    set('--px-key-down', nineKey(TONES.slate, 2));
  } catch { /* no canvas: the SVG fallbacks in pxKit.css stay */ }
}

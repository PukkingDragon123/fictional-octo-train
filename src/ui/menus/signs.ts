// HANGING SIGNS: the menu buttons are aluminium corporate signs, drawn as
// detailed pixel art: a brushed, anodised panel with banding and hand-placed
// highlights, a black outline, bevelled and chamfered edges, the Meridian
// accent stripe and mark, clamp bolts with a specular pixel and a little
// corrosion round them, scratches, a dent, fingerprints and dust. Each hangs
// on two steel cables from a brushed rod (wall-mounted or dropped from the
// ceiling) and swings as a parallelogram: it sways in when the menu shows,
// swings when you hover, focus or press it, settles with damping, and the
// cable ticks in its clamp. A pixel sheen slides over the metal as it moves.
//
// Everything is low-res art (one art pixel = kitScale() CSS px, a whole
// number of device px) rendered on a fine grid of SUB canvas px per art px,
// shown with nearest filtering. The lettering is vinyl cut from whatever
// face --font-new names (signFont()): each label is drawn large and every
// fine pixel takes the glyph's AREA COVERAGE (threshold), so any font comes
// out as crisp, faithful hard pixels. Each sign is a real <button>: keyboard,
// gamepad (FocusNav) and touch work as before.
import { cssFont } from '../../gfx/crt';
import { kitScale, shortView, strSeed } from './btnKit';
import { sfx, type Sfx } from './sfx';
import { calm } from './settings';
import './kit.css';

/** wood → plain brushed aluminium (teal stripe), red → red stripe (primary), olive → green stripe, tin → graphite anodised, cream → champagne anodised */
export type SignKind = 'wood' | 'tin' | 'red' | 'cream' | 'olive';
export type SignShape = 'board' | 'arrowL' | 'arrowR';
export type SignHang = 'bracketL' | 'bracketR' | 'hook';
export interface SignOpts {
  kind?: SignKind; shape?: SignShape; size?: 'lg' | 'md' | 'sm';
  hang?: SignHang;
  /** board width in art px at least */
  minW?: number;
  /** a wayfinding arrow instead of a label (arrow boards) */
  chevron?: boolean;
  sound?: Sfx | ''; aria?: string; seed?: number; pointer?: boolean; cls?: string;
  /** cable length in art px */
  chain?: number;
}
export type HangSign = HTMLButtonElement & {
  setLabel: (l: string) => void;
  /** add angular velocity (rad/s) */
  kick: (w: number) => void;
  /** swing in from an angle after a delay */
  swayIn: (delayMs: number, amp?: number) => void;
  paint: () => void;
  /** set the board width (art px) so a column of signs lines up */
  setBoardW: (w: number) => void;
  /** the board width the label needs (art px) */
  needW: () => number;
  /** latch the lit board (the current page) */
  setOn: (v: boolean) => void;
};

// ------------------------------------------------------------------ the one place the lettering font comes from
/** the family list the signs letter in: whatever --font-new names (so a font swap needs no code change) */
export function signFont(): string { return cssFont('--font-new', 'sans-serif'); }
const SIGN_WEIGHT = 600;
const TRACK = 0.12; // tracked-out caps, in em

// ------------------------------------------------------------------ palette
const K = 0x0b0d0f;
interface Fin { R: number[]; accent: number[]; ink: number; inkHot: number; dark: boolean }
//                 outline  deep      dark      low       base      light     high      glint
// aged, oxidised aluminium in a dim room: low, cool, greyed values (only a hint of glint)
const ALU = [K, 0x1b1f22, 0x2a2f33, 0x3a4045, 0x4b5257, 0x5d656a, 0x737b80, 0x8f979b];
const GRAPH = [K, 0x0f1113, 0x181b1e, 0x22262a, 0x2c3135, 0x383e43, 0x4a5157, 0x687077];
const CHAMP = [K, 0x29231a, 0x3b3426, 0x4d4535, 0x5e5543, 0x716753, 0x897e67, 0xa69b82];
const FIN: Record<SignKind, Fin> = {
  wood: { R: ALU, accent: [0x0c2a27, 0x184e47, 0x2a7468, 0x5aa89a], ink: 0xc8cbc3, inkHot: 0xf1f2ea, dark: true },
  red: { R: ALU, accent: [0x300a06, 0x6a1c12, 0x9a3020, 0xd06a50], ink: 0xc8cbc3, inkHot: 0xf1f2ea, dark: true },
  olive: { R: ALU, accent: [0x18220b, 0x334a18, 0x527028, 0x8cb058], ink: 0xc8cbc3, inkHot: 0xf1f2ea, dark: true },
  tin: { R: GRAPH, accent: [0x112630, 0x2a5062, 0x4a7c90, 0x8ab8cc], ink: 0xbfc4c6, inkHot: 0xeef1f2, dark: true },
  cream: { R: CHAMP, accent: [0x2a1e08, 0x553e12, 0x7c602a, 0xb8965a], ink: 0xd4ccb6, inkHot: 0xf6efda, dark: true },
};
// rust: deep pit, dark bloom, mid, orange, a bright flake
const RUST = [0x2a1208, 0x4e2410, 0x743614, 0x9a4e1c, 0xbe6a2c];
const STEEL = { hi: 0xa6adb2, mid: 0x6a7379, lo: 0x3d4449, dk: 0x1e2327 };
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; };
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mix = (a: number, b: number, t: number) => { const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bl = (a & 255) + (((b & 255) - (a & 255)) * t); return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl); };
/** 0xRRGGBB → the little-endian RGBA word ImageData's Uint32 view wants */
const px32 = (c: number, a = 255) => ((a << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;
/** smooth value noise on a cell grid (for clustered rust and grime) */
function vnoise(x: number, y: number, cell: number, seed: number) {
  const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// ------------------------------------------------------------------ coverage rasteriser (any font, any vector)
const OVER = 5; // oversampling per fine pixel
const rcv = document.createElement('canvas');
const rctx = rcv.getContext('2d', { willReadFrequently: true })!;
/** draw() paints white at OVER x the fine grid; returns a 1-bit mask at the fine grid by area coverage */
function rasterize(W: number, H: number, draw: (g: CanvasRenderingContext2D, k: number) => void, thr = 0.45): Uint8Array {
  rcv.width = W * OVER; rcv.height = H * OVER;
  rctx.clearRect(0, 0, rcv.width, rcv.height);
  rctx.fillStyle = '#fff'; rctx.strokeStyle = '#fff';
  draw(rctx, OVER);
  const d = rctx.getImageData(0, 0, rcv.width, rcv.height).data;
  const m = new Uint8Array(W * H);
  const n = OVER * OVER * 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let j = 0; j < OVER; j++) { const row = ((y * OVER + j) * rcv.width + x * OVER) * 4 + 3; for (let i = 0; i < OVER; i++) a += d[row + i * 4]; }
    if (a / n >= thr) m[y * W + x] = 1;
  }
  return m;
}
const mcv = document.createElement('canvas').getContext('2d')!;
function setFont(g: CanvasRenderingContext2D, px: number) {
  g.font = `${SIGN_WEIGHT} ${px}px ${signFont()}`;
  try { (g as any).letterSpacing = `${(px * TRACK).toFixed(2)}px`; } catch { /* no tracking */ }
}
/** the font size (px) that gives caps `cap` px tall, and the label's width at that size */
function fitText(label: string, cap: number): { size: number; w: number } {
  setFont(mcv, 100);
  const m = mcv.measureText('H');
  const capRatio = Math.max(0.4, Math.min(0.95, (m.actualBoundingBoxAscent || 70) / 100));
  const size = cap / capRatio;
  setFont(mcv, size);
  return { size, w: Math.ceil(mcv.measureText(label).width) };
}

// ------------------------------------------------------------------ the panel art (art px), then the fine sprite with lettering
interface Sprite { w: number; h: number; px: Uint32Array /* fine grid, 0 = empty */; bolts: number[] /* art x of the cable bolts */ }
function panelArt(label: string, kind: SignKind, shape: SignShape, w: number, h: number, seed: number, st: 0 | 1 | 2, chevron: boolean, sub: number): Sprite {
  const F = FIN[kind], R = F.R;
  const rnd = rng(seed);
  const art = new Int32Array(w * h).fill(-1);
  const pt = Math.floor(h / 2);
  const c = 2; // chamfer
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (shape === 'arrowL') { if (x < pt) return Math.abs(y - (h - 1) / 2) <= x + 0.5; }
    else if (x + y < c || x + (h - 1 - y) < c) return false;
    if (shape === 'arrowR') { if (w - 1 - x < pt) return Math.abs(y - (h - 1) / 2) <= (w - 1 - x) + 0.5; }
    else if ((w - 1 - x) + y < c || (w - 1 - x) + (h - 1 - y) < c) return false;
    return true;
  };
  const edge = (x: number, y: number) => !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
  const set = (x: number, y: number, col: number) => { if (x >= 0 && y >= 0 && x < w && y < h && art[y * w + x] >= 0) art[y * w + x] = col; };
  const lift = st === 1 ? 0.1 : st === 2 ? -0.08 : 0;
  // anodised banding: each row has its own value, brushed streaks run along the rows
  const band = new Float32Array(h);
  for (let y = 0; y < h; y++) band[y] = (hash(y, 3, seed) - 0.5) * 0.06 + (y % 3 === 0 ? -0.015 : 0);
  for (let y = 0; y < h; y++) {
    let streak = 0, run = 0;
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      let col: number;
      if (edge(x, y)) col = K;
      else if (!inside(x, y - 2) || (shape !== 'arrowL' && !inside(x - 2, y))) col = st === 2 ? R[4] : R[7];  // lit bevel
      else if (!inside(x, y + 2) || (shape !== 'arrowR' && !inside(x + 2, y))) col = R[2];                      // shade bevel
      else {
        if (run <= 0) { run = 3 + Math.floor(rnd() * 14); streak = rnd() < 0.55 ? (rnd() - 0.6) * 0.14 : 0; }
        run--;
        // key light from above: lit at the top, falling off, grime collecting low and in the brushing
        let v = 0.7 - 0.34 * (y / h) - 0.1 * (y / h) ** 2 + band[y] + streak + lift;
        if (hash(x >> 3, y >> 1, seed + 21) < 0.22) v -= 0.08;
        if (x < 3 || x > w - 4) v -= 0.05;
        const f = 2.2 + Math.max(0, Math.min(1, v)) * 4.4;
        let i = Math.floor(f); const fr = f - i;
        if (fr > 0.7 || (fr > 0.45 && bayer(x, y) < (fr - 0.45) / 0.25)) i++;
        col = R[Math.max(2, Math.min(7, i))];
      }
      art[y * w + x] = col;
    }
  }
  const isFace = (x: number, y: number) => inside(x, y) && !edge(x, y) && inside(x, y - 2) && inside(x, y + 2) && inside(x - 2, y) && inside(x + 2, y);
  // hairline scratches (a light run with a dark pixel at its start)
  for (let i = 0; i < Math.round(w / 12); i++) {
    let x = 4 + Math.floor(rnd() * (w - 8)), y = 3 + Math.floor(rnd() * (h - 6));
    const dx = rnd() < 0.5 ? 1 : -1, diag = rnd() < 0.6, len = 3 + Math.floor(rnd() * 6);
    if (isFace(x, y + 1)) set(x, y + 1, R[3]);
    for (let k = 0; k < len; k++) { if (isFace(x, y)) set(x, y, k === 0 ? R[7] : R[6]); x += dx; if (diag && k % 2) y += 1; }
  }
  // a dent: dark on the lit side, light on the far side
  if (w > 30) {
    const dx0 = Math.floor(w * (0.55 + rnd() * 0.3)), dy0 = Math.floor(h * 0.6);
    for (const [x, y, col] of [[0, 0, R[3]], [1, 0, R[3]], [0, 1, R[4]], [2, 1, R[6]], [1, 2, R[6]], [2, 2, R[7]]] as [number, number, number][]) if (isFace(dx0 + x, dy0 + y)) set(dx0 + x, dy0 + y, col);
  }
  // fingerprints: faint dithered oval rings
  for (let f = 0; f < 2; f++) {
    const fx = Math.floor(w * (0.25 + rnd() * 0.6)), fy = Math.floor(h * (0.35 + rnd() * 0.35)), r = 2.5 + rnd() * 1.5;
    for (let y = -4; y <= 4; y++) for (let x = -5; x <= 5; x++) {
      const d = Math.sqrt((x / 1.25) ** 2 + y * y);
      if (Math.abs(d - r) < 0.5 || Math.abs(d - r + 1.6) < 0.4) if (isFace(fx + x, fy + y) && bayer(fx + x, fy + y) < 0.55) set(fx + x, fy + y, mix(art[(fy + y) * w + fx + x], R[2], 0.25));
    }
  }
  // dust settled along the bottom bevel
  for (let x = 2; x < w - 2; x++) {
    const y = h - 3;
    if (isFace(x, y) && hash(x, 5, seed) < 0.2) set(x, y, 0x55504a);
    if (isFace(x, y - 1) && hash(x, 6, seed) < 0.06) set(x, y - 1, 0x4a4540);
  }
  // the accent stripe (the institute's wayfinding colour)
  const left = shape === 'arrowL' ? pt + 2 : 4;
  const A = F.accent;
  for (let y = 3; y < h - 3; y++) for (let k = 0; k < 2; k++) {
    const col = y === 3 ? A[3] : y === h - 4 ? A[0] : k === 0 ? (st === 1 ? A[3] : A[2]) : A[1];
    set(left + k, y, col);
  }
  // the Meridian mark: a chamfered square, the meridian and the horizon it crosses
  const mk = Math.min(7, h - 8), mx = left + 4, my = Math.floor((h - mk) / 2);
  if (!chevron && mk >= 5) {
    for (let i = 0; i < mk; i++) for (let j = 0; j < mk; j++) {
      const ring = i === 0 || j === 0 || i === mk - 1 || j === mk - 1;
      const corner = (i === 0 || i === mk - 1) && (j === 0 || j === mk - 1);
      const meridian = i === Math.floor(mk * 0.4) && j > 0 && j < mk - 1;
      const horizon = j === Math.floor(mk * 0.6) && i > Math.floor(mk * 0.4) && i < mk - 1;
      if ((ring && !corner) || meridian || horizon) set(mx + i, my + j, ring ? A[1] : A[2]);
    }
  }
  // the cable bolts: machined heads with a specular pixel
  const bolts = shape === 'arrowL' ? [pt + 3, w - 5] : shape === 'arrowR' ? [4, w - pt - 4] : [5, w - 6];
  const rustAt = (x: number, y: number, k: number) => { if (inside(x, y) && !edge(x, y)) set(x, y, RUST[Math.max(0, Math.min(4, k))]); };
  for (const bx of bolts) {
    const by = 2;
    // the bloom round the bolt
    for (let y = -2; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x * 0.85, y);
      if (d < 1.2) continue;
      if (rnd() < 1.1 - d * 0.32) rustAt(bx + x, by + y, d < 2 ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 3));
    }
    // streaks running down from it
    const ns = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < ns; k++) {
      let x = bx + Math.floor(rnd() * 3) - 1;
      const len = 4 + Math.floor(rnd() * (h - 6));
      for (let j = 0; j < len; j++) {
        const y = by + 2 + j;
        const fade = j / len;
        if (rnd() < 0.85 - fade * 0.5 || bayer(x, y) > fade) rustAt(x, y, fade < 0.3 ? 3 : fade < 0.65 ? 2 : 1);
        if (rnd() < 0.08) x += rnd() < 0.5 ? -1 : 1;
      }
    }
    for (const [x, y, col] of [[-1, -1, STEEL.dk], [0, -1, STEEL.lo], [1, -1, STEEL.dk], [-1, 0, STEEL.lo], [0, 0, STEEL.hi], [1, 0, STEEL.mid], [-1, 1, STEEL.dk], [0, 1, RUST[2]], [1, 1, STEEL.dk]] as [number, number, number][]) set(bx + x, by + y, col);
    set(bx, by, 0xd8dde0);
  }
  // rust along the edges and in the corners, in clusters, with the odd run down the face
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y) || edge(x, y)) continue;
    const nearEdge = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2);
    const corner = Math.min(x, w - 1 - x) < 5 && Math.min(y, h - 1 - y) < 5;
    const n = vnoise(x, y, 5, seed + 30);
    let p = 0;
    if (corner) p = 0.25 + n * 0.6;
    else if (nearEdge) p = Math.max(0, n - 0.55) * (y > h / 2 ? 2.2 : 1.2);
    else p = Math.max(0, n - 0.8) * 0.9;   // a few blooms out on the face
    if (hash(x, y, seed + 31) < p) {
      rustAt(x, y, n > 0.75 ? 1 + Math.floor(hash(x, y, seed + 32) * 2) : 2 + Math.floor(hash(x, y, seed + 32) * 3));
      if (y < h - 3 && hash(x, y, seed + 33) < 0.25) for (let j = 1; j < 4; j++) if (hash(x, y + j, seed + 34) < 0.75 - j * 0.15) rustAt(x, y + j, 2);
    }
  }
  // pitting: a dark pit with a light lip under it
  for (let i = 0; i < Math.round((w * h) / 70); i++) {
    const x = 3 + Math.floor(rnd() * (w - 6)), y = 3 + Math.floor(rnd() * (h - 6));
    if (!isFace(x, y)) continue;
    set(x, y, rnd() < 0.4 ? RUST[0] : R[1]);
    if (isFace(x + 1, y + 1)) set(x + 1, y + 1, R[5]);
  }
  // flaking paint on the stripe
  for (let y = 3; y < h - 3; y++) for (let k = 0; k < 2; k++) {
    const q = hash(left + k, y, seed + 41);
    if (q < 0.16) set(left + k, y, R[3]); else if (q < 0.26) set(left + k, y, RUST[2]);
  }
  // hot: the stripe's glint runs its whole length and the bolts catch the light
  if (st === 1) for (let y = 4; y < h - 4; y++) set(left, y, A[3]);
  // to the fine grid
  const W = w * sub, H = h * sub;
  const fine = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = art[Math.floor(y / sub) * w + Math.floor(x / sub)]; if (a >= 0) fine[y * W + x] = px32(a); }
  // the vinyl: lettering or a wayfinding arrow, cut at the fine grid by area coverage
  const ink = st === 1 ? F.inkHot : F.ink;
  const lipC = 0x090b0d;
  let mask: Uint8Array | null = null;
  if (chevron && shape !== 'board') {
    const dir = shape === 'arrowL' ? -1 : 1;
    mask = rasterize(W, H, (g, k) => {
      const cx = (W / 2 + dir * pt * sub * 0.3) * k, cy = (H / 2) * k, L = Math.min(W * 0.46, H * 1.15) * k, head = H * 0.3 * k, t = H * 0.1 * k;
      g.beginPath();
      g.moveTo(cx + dir * L / 2, cy);
      g.lineTo(cx + dir * (L / 2 - head), cy - head); g.lineTo(cx + dir * (L / 2 - head - t * 1.1), cy - head);
      g.lineTo(cx + dir * (L / 2 - t * 1.7), cy - t / 2); g.lineTo(cx - dir * L / 2, cy - t / 2);
      g.lineTo(cx - dir * L / 2, cy + t / 2); g.lineTo(cx + dir * (L / 2 - t * 1.7), cy + t / 2);
      g.lineTo(cx + dir * (L / 2 - head - t * 1.1), cy + head); g.lineTo(cx + dir * (L / 2 - head), cy + head);
      g.closePath(); g.fill();
    });
  } else if (label) {
    const cap = Math.round(h * 0.38) * sub;
    const ft = fitText(label, cap);
    const tx = (mx + mk + 5) * sub;
    mask = rasterize(W, H, (g, k) => {
      setFont(g, ft.size * k);
      g.textBaseline = 'alphabetic';
      g.fillText(label, tx * k, ((H + cap) / 2) * k);
    });
  }
  if (mask) {
    // the cut vinyl's thin lip, then the vinyl
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) if (mask[y * W + x] && !mask[(y + 1) * W + x] && fine[(y + 1) * W + x]) fine[(y + 1) * W + x] = px32(lipC);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x] && fine[y * W + x]) { const q = hash(x >> 1, y >> 1, seed + 4); fine[y * W + x] = px32(q > 0.97 ? mix(ink, R[3], 0.6) : q > 0.93 ? mix(ink, R[5], 0.3) : ink); }
  }
  return { w: W, h: H, px: fine, bolts };
}

// ------------------------------------------------------------------ the swinging render (fine grid)
// The panel is a slab T art px thick. As it swings it moves along the cable
// arc and yaws a little, drawn with perspective (inverse-mapped per fine
// pixel, nearest): the end that turns toward you shows its edge band, the
// underside shows as a dark band, the face dims or brightens as it turns
// under the key light from above, and a faint specular slides across it.
// Its shadow falls on the darkness behind; the cables and clamps cast theirs.
interface Geo { W: number; H: number; bx: number; by: number; bw: number; bh: number; rodY: number; cable: number; hang: SignHang; shape: SignShape; sub: number; /** -0.6..0.6: where the viewer is (the slab's back leans toward the screen's middle) */ view: number }
const EDGE = [0x0c0e10, 0x23282c, 0x343a3f, 0x474e54];
function drawFrame(img: ImageData, g32: Uint32Array, geo: Geo, sp: Sprite, theta: number, kind: SignKind) {
  g32.fill(0);
  const { W, sub, rodY } = geo;
  const FW = W * sub, FH = img.height;
  const blk = (ax: number, ay: number, c: number) => { if (ax < 0 || ay < 0 || ax >= W) return; const v = px32(c); for (let j = 0; j < sub; j++) { const row = (ay * sub + j) * FW + ax * sub; for (let i = 0; i < sub; i++) g32[row + i] = v; } };
  const putF = (x: number, y: number, c: number, a = 255) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < FW && y < FH) g32[y * FW + x] = px32(c, a); };
  const shadeF = (x: number, y: number, a: number) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < FW && y < FH && !g32[y * FW + x]) g32[y * FW + x] = px32(0, a); };
  const tops = sp.bolts.map((bx) => geo.bx + bx);
  const left = geo.hang === 'bracketL', right = geo.hang === 'bracketR';
  // ---- the mount: its shadow on the wall first, then a rusty rod with clamps
  const x0 = left ? 0 : tops[0] - 3, x1 = right ? W - 1 : tops[1] + 3;
  for (let x = x0; x <= x1; x++) for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) shadeF((x + 1) * sub + i, (rodY + 2) * sub + j, 90);
  for (let x = x0; x <= x1; x++) {
    const n = vnoise(x, 0, 6, 77), r = hash(x, 1, 77);
    blk(x, rodY - 2, K); blk(x, rodY - 1, n > 0.62 && r < 0.7 ? RUST[3] : STEEL.hi); blk(x, rodY, n > 0.55 && r < 0.8 ? RUST[1] : STEEL.lo); blk(x, rodY + 1, K);
  }
  if (left || right) {
    const fx = left ? 0 : W - 2;
    for (let y = rodY - 4; y <= rodY + 4; y++) for (let x = 0; x < 2; x++) blk(fx + x, y, y === rodY - 4 || y === rodY + 4 || x === (left ? 1 : 0) ? K : (hash(x, y, 5) < 0.3 ? RUST[2] : STEEL.mid));
    blk(fx + (left ? 0 : 1), rodY - 3, STEEL.hi); blk(fx + (left ? 0 : 1), rodY + 2, STEEL.hi);
    blk(fx + (left ? 0 : 1), rodY + 3, RUST[3]);
  } else {
    const cx = Math.round((tops[0] + tops[1]) / 2);
    for (let y = 0; y < rodY - 2; y++) { blk(cx, y, hash(cx, y, 3) < 0.2 ? RUST[2] : STEEL.mid); blk(cx + 1, y, K); }
  }
  for (const tx of tops) {
    blk(tx - 1, rodY - 2, K); blk(tx, rodY - 2, K); blk(tx + 1, rodY - 2, K);
    blk(tx - 1, rodY - 1, STEEL.mid); blk(tx, rodY - 1, STEEL.hi); blk(tx + 1, rodY - 1, STEEL.lo);
    blk(tx - 1, rodY, RUST[2]); blk(tx, rodY, STEEL.dk); blk(tx + 1, rodY, RUST[1]); blk(tx, rodY + 1, K);
    blk(tx + 1, rodY + 1, RUST[1]);
  }
  // ---- the panel's pose: along the cable arc, yawed a little (perspective)
  const dx = Math.sin(theta) * geo.cable * sub, dy = (1 - Math.cos(theta)) * geo.cable * sub;
  const psi = calm() ? 0 : theta * 0.8;
  const c = Math.cos(psi), s = Math.sin(psi);
  const pw = sp.w, ph = sp.h;
  const D = pw * 1.8;
  const cxs = geo.bx * sub + pw / 2 + dx, cys = geo.by * sub + ph / 2 - dy, vc = ph / 2;
  const proj = (a: number, v: number): [number, number] => { const f = D / (D + a * s); return [cxs + a * c * f, cys + (v - vc) * f]; };
  // the slab's depth seen obliquely: the back sits toward the middle of the screen and below
  // (the signs hang above eye level, so you see their underside), and it shifts as the sign turns
  const depth = 3 * sub;
  const ox = depth * (geo.view + s * 1.8), oy = depth * 0.6;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ox), Math.abs(oy))));
  /** the face's texel under a screen point (-1 if none) */
  const faceIdx = (X: number, Y: number): number => {
    const den = c * D - X * s;
    if (den <= 1) return -1;
    const a = (X * D) / den, f = D / (D + a * s);
    const u = Math.floor(a + pw / 2), v = Math.floor(Y / f + vc);
    if (u < 0 || u >= pw || v < 0 || v >= ph) return -1;
    return sp.px[v * pw + u] ? v * pw + u : -1;
  };
  const look = (x: number, y: number): number => {
    const X = x + 0.5 - cxs, Y = y + 0.5 - cys;
    const i = faceIdx(X, Y);
    if (i >= 0) return sp.px[i];
    // the slab behind the face: walk back along the depth direction
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const j = faceIdx(X - ox * t, Y - oy * t);
      if (j < 0) continue;
      const u = j % pw, v = (j / pw) | 0;
      const under = v >= ph - sub * 2 || !sp.px[Math.min(ph - 1, v + sub) * pw + u];
      const r = hash(Math.floor(u / sub), Math.floor((k * 3) / steps), 13);
      if (r < 0.12) return px32(RUST[2 + (r < 0.05 ? 1 : 0)]);
      // underside in the shadow of the key light, the end lit a little; the back corner darkest
      const col = under ? (t > 0.75 ? EDGE[0] : EDGE[1]) : (t < 0.3 ? EDGE[3] : t < 0.75 ? EDGE[2] : EDGE[1]);
      return px32(hash(u >> 2, k, 17) < 0.2 ? mix(col, 0x000000, 0.25) : col);
    }
    return 0;
  };
  // the bounding box of everything the panel can cover
  const corners = [proj(-pw / 2, 0), proj(pw / 2, 0), proj(-pw / 2, ph), proj(pw / 2, ph)];
  const xs = corners.map((q) => q[0]), ys = corners.map((q) => q[1]);
  const xA = Math.max(0, Math.floor(Math.min(...xs) + Math.min(0, ox) - 2)), xB = Math.min(FW - 1, Math.ceil(Math.max(...xs) + Math.max(0, ox) + 2));
  const yA = Math.max(0, Math.floor(Math.min(...ys) - 2)), yB = Math.min(FH - 1, Math.ceil(Math.max(...ys) + oy + 2));
  // ---- the cast shadow on the darkness behind (falls below: the key light is above), a hard core and a dithered penumbra
  const sox = Math.round(sub - dx * 0.25), soy = 3 * sub;
  for (let y = yA; y <= Math.min(FH - 1, yB + soy + sub); y++) for (let x = Math.max(0, xA - sub); x <= Math.min(FW - 1, xB + 2 * sub); x++) {
    if (look(x - sox, y - soy)) shadeF(x, y, 120);
    else if (((x + y) & 1) === 0 && look(x - sox - sub, y - soy - sub)) shadeF(x, y, 60);
  }
  // ---- the cables (corroded), each with a faint shadow beside it
  for (const ax of sp.bolts) {
    const [ex, ey] = proj(ax * sub + sub / 2 - pw / 2, 2 * sub + sub / 2);
    const sx = (geo.bx + ax) * sub + sub / 2, sy = (rodY + 1) * sub;
    const n = Math.max(2, Math.ceil(Math.hypot(ex - sx, ey - sy)));
    const thick = Math.max(1, Math.round(sub * 0.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = sx + (ex - sx) * t, y = sy + (ey - sy) * t;
      shadeF(x + sub, y + sub, 70);
      const rusty = hash(Math.floor(i / sub), ax, 55) < 0.3;
      for (let k = 0; k < thick; k++) putF(x - thick / 2 + k, y, k === 0 ? (rusty ? RUST[3] : STEEL.hi) : k === thick - 1 ? K : rusty ? RUST[1] : STEEL.lo);
    }
  }
  // ---- the panel itself: lit by the key from above, a faint specular sliding across as it turns
  const lightK = 1 - s * 0.16;
  const spec = (s * 1.4 + 0.3) * pw;
  const specA = FIN[kind].dark ? 0.06 : 0.1;
  for (let y = yA; y <= yB; y++) for (let x = xA; x <= xB; x++) {
    const p = look(x, y);
    if (!p) continue;
    let r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
    r *= lightK; g *= lightK; b *= lightK;
    const d = (x - xA) - (y - yA) * 0.8 - spec;
    if (d > 0 && d < 3 * sub) { r += (255 - r) * specA; g += (255 - g) * specA; b += (255 - b) * specA; }
    g32[y * FW + x] = px32((Math.min(255, Math.round(r)) << 16) | (Math.min(255, Math.round(g)) << 8) | Math.min(255, Math.round(b)));
  }
}

// ------------------------------------------------------------------ physics loop (one for every live sign)
interface Live { sign: HangSign; theta: number; omega: number; wait: number; lastSign: number; creakAt: number; drawn: number; step: (dt: number, real: number) => void }
const lives = new Set<Live>();
const all = new Set<HangSign>();
let raf = 0, lastT = 0;
function loop(now: number) {
  raf = 0;
  const real = Math.max(0.001, (now - (lastT || now)) / 1000);
  const dt = Math.min(0.05, real);
  lastT = now;
  for (const l of [...lives]) {
    if (!l.sign.isConnected) { lives.delete(l); continue; }
    l.step(dt, real);
  }
  if (lives.size) raf = requestAnimationFrame(loop); else lastT = 0;
}
function wake(l: Live) { lives.add(l); if (!raf) { lastT = 0; raf = requestAnimationFrame(loop); } }
const repaintAll = () => { for (const s of [...all]) { if (!s.isConnected) { all.delete(s); continue; } s.paint(); } };
// a font swap (the user picks a face, or it finishes loading) re-cuts every sign's vinyl
let fontKey = '';
function refont() {
  const k = signFont();
  if (k === fontKey) return;
  fontKey = k;
  try { void (document as any).fonts?.load?.(`${SIGN_WEIGHT} 16px ${k}`).then(() => repaintAll()); } catch { /* no font api */ }
}
try { (document as any).fonts?.addEventListener?.('loadingdone', () => repaintAll()); } catch { /* no font api */ }
if (import.meta.env.DEV) (window as any).__signs = { lives, get raf() { return raf; }, repaintAll };

// sizes in art px
const SIZES = { lg: { bh: 16, chain: 6 }, md: { bh: 14, chain: 5 }, sm: { bh: 13, chain: 4 } };

export function hangSign(label: string, onClick: (b: HangSign) => void, o: SignOpts = {}): HangSign {
  const kind = o.kind ?? 'wood', shape = o.shape ?? 'board', size = o.size ?? 'md', hang = o.hang ?? 'bracketL';
  const b = document.createElement('button') as HangSign;
  b.type = 'button';
  b.className = `hs hs-${kind}${o.pointer ? ' hs-ptr' : ''}${o.cls ? ' ' + o.cls : ''}`;
  const canvas = document.createElement('canvas'); canvas.className = 'hs-cv';
  const lab = document.createElement('span'); lab.className = 'hs-l';
  b.append(canvas, lab);
  if (o.aria) b.setAttribute('aria-label', o.aria);
  const seed = o.seed ?? strSeed(label + kind);
  let text = label;
  let boardW = 0;
  let geo: Geo | null = null;
  let sprites: Sprite[] = [];
  let img: ImageData | null = null, g32: Uint32Array | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let state: 0 | 1 | 2 = 0;
  const dims = () => {
    const sz = SIZES[size];
    const sv = shortView();
    return { bh: sz.bh + (sv ? 1 : 0), chain: o.chain ?? sz.chain };
  };
  const needW = () => {
    const d = dims();
    if (o.chevron) return Math.max(o.minW ?? 0, Math.round(d.bh * 2.3));
    // measured in art px at a cap height of 0.38 x board height
    const ft = fitText(text.toUpperCase(), Math.round(d.bh * 0.38) * 8);
    const pt = shape === 'board' ? 0 : Math.floor(d.bh / 2);
    return Math.max(o.minW ?? 0, Math.ceil(ft.w / 8) + 4 + 4 + Math.min(7, d.bh - 8) + 5 + 7 + pt);
  };
  const L: Live = {
    sign: b, theta: 0, omega: 0, wait: 0, lastSign: 0, creakAt: 0, drawn: NaN,
    step: (dt: number, real: number) => {
      if (L.wait > 0) { L.wait -= real * 1000; if (L.wait > 0) return; }
      if (b.classList.contains('hs-hold')) { b.classList.remove('hs-hold'); sfx('cable', 0.5); }
      const k = 26, damp = 2.1;
      L.omega += (-k * Math.sin(L.theta) - damp * L.omega) * dt;
      L.theta += L.omega * dt;
      if (Math.abs(L.theta) > 0.75) { L.theta = Math.sign(L.theta) * 0.75; L.omega *= -0.3; }
      const sg = Math.sign(L.omega);
      if (sg && sg !== L.lastSign) {
        if (Math.abs(L.theta) > 0.14 && performance.now() - L.creakAt > 320) { L.creakAt = performance.now(); sfx('cable', Math.min(1, Math.abs(L.theta) * 2.5)); }
        L.lastSign = sg;
      }
      if (Math.abs(L.theta) < 0.004 && Math.abs(L.omega) < 0.02) { L.theta = 0; L.omega = 0; render(); lives.delete(L); return; }
      render();
    },
  };
  const render = () => {
    if (!geo || !ctx || !img || !g32 || !sprites.length) return;
    const th = calm() ? 0 : Math.round(L.theta * 300) / 300;
    if (th === L.drawn && sprites[state] === (render as any).last) return;
    L.drawn = th; (render as any).last = sprites[state];
    drawFrame(img, g32, geo, sprites[state], th, kind);
    ctx.putImageData(img, 0, 0);
  };
  const build = () => {
    if (!b.isConnected) return;
    refont();
    const s = kitScale();
    const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
    const kk = Math.max(1, Math.round(s * dpr));
    const sub = [4, 3, 2].find((d) => kk % d === 0) ?? Math.min(kk, 5);
    const d = dims();
    const bw = Math.max(boardW, needW());
    const rodY = hang === 'hook' ? 5 : 4;
    const mx = Math.ceil(d.chain * 0.75) + 5;
    const top = rodY + 2;
    const W = bw + 2 * mx, H = top + d.chain + d.bh + 8;
    const rr = b.getBoundingClientRect(), vw = window.innerWidth || 1280;
    const view = rr.width ? Math.max(-0.6, Math.min(0.6, ((vw / 2 - (rr.left + rr.width / 2)) / (vw / 2)) * 0.6)) : 0.4;
    geo = { W, H, bx: mx, by: top + d.chain, bw, bh: d.bh, rodY, cable: d.chain + 2, hang, shape, sub, view };
    canvas.width = W * sub; canvas.height = H * sub;
    canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
    b.style.width = W * s + 'px'; b.style.height = H * s + 'px';
    b.style.setProperty('--hs-cy', (top + d.chain + d.bh / 2) * s + 'px');
    b.style.setProperty('--hs-bx', mx * s + 'px');
    ctx = canvas.getContext('2d')!;
    img = ctx.createImageData(W * sub, H * sub);
    g32 = new Uint32Array(img.data.buffer);
    const up = text.toUpperCase();
    sprites = [0, 1, 2].map((st) => panelArt(up, kind, shape, bw, d.bh, seed, st as 0 | 1 | 2, !!o.chevron, sub));
    L.drawn = NaN; (render as any).last = null;
    render();
  };
  b.paint = build;
  b.setLabel = (l: string) => { text = l; lab.textContent = l; if (!o.aria) b.setAttribute('aria-label', l); build(); };
  b.setBoardW = (w: number) => { if (w !== boardW) { boardW = w; build(); } };
  b.needW = needW;
  b.kick = (w: number) => { if (calm()) return; L.omega += w; wake(L); };
  b.swayIn = (delayMs: number, amp = 0.55) => {
    if (calm()) return;
    L.theta = (seed % 2 ? 1 : -1) * Math.max(amp, 0.45) * 1.2; L.omega = 0; L.wait = delayMs;
    b.classList.add('hs-hold');
    wake(L);
  };
  const setState = (st: 0 | 1 | 2) => { if (st !== state) { state = st; render(); } };
  const hot = () => setState(document.activeElement === b || b.matches(':hover') || b.classList.contains('on') ? 1 : 0);
  b.setOn = (v: boolean) => { b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); hot(); };
  b.addEventListener('pointerenter', (e) => {
    if (b.disabled) return;
    if (e.pointerType === 'mouse') {
      const a = document.activeElement as HTMLElement | null;
      if (!(a && ((a.tagName === 'INPUT' && (a as HTMLInputElement).type === 'text') || a.tagName === 'TEXTAREA')) && a !== b) b.focus({ preventScroll: true });
    }
    b.kick((e.offsetX < b.offsetWidth / 2 ? 1 : -1) * 1.6);
    sfx('cable', 0.5);
    hot();
  });
  b.addEventListener('pointerleave', hot);
  b.addEventListener('focus', () => { hot(); if (!b.matches(':hover')) b.kick((Math.random() < 0.5 ? -1 : 1) * 1.3); });
  b.addEventListener('blur', hot);
  b.addEventListener('pointerdown', () => setState(2));
  b.addEventListener('pointerup', hot);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    setState(2);
    setTimeout(hot, 140);
    b.kick((L.omega >= 0 ? 1 : -1) * 3);
    sfx('tink');
    if (o.sound !== '') sfx(o.sound ?? 'plate', 0.6);
    onClick(b);
  });
  lab.textContent = label;
  if (!o.aria) b.setAttribute('aria-label', label);
  const ro = new ResizeObserver(() => { if (b.isConnected && !geo) build(); });
  ro.observe(b);
  let lastKey = '';
  window.addEventListener('resize', () => { const k = `${kitScale()}|${window.devicePixelRatio}|${shortView()}`; if (k !== lastKey && b.isConnected) { lastKey = k; build(); } });
  requestAnimationFrame(() => { lastKey = `${kitScale()}|${window.devicePixelRatio}|${shortView()}`; build(); });
  all.add(b);
  return b;
}

/** give a set of signs one common board width (the widest label) */
export function alignSigns(signs: HangSign[], minW = 0) {
  const w = Math.max(minW, ...signs.map((s) => s.needW()));
  for (const s of signs) s.setBoardW(w);
}

/** kept for callers: the signs hang from their own rods, so the post is an empty spacer */
export function signPost(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hs-post';
  return el;
}

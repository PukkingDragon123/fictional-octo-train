// The switchgear kit: every 2D control in the menus is a piece of pixel art,
// drawn here in code at a low resolution and shown at a whole number of
// device pixels per art pixel (nearest filtering), so it is crisp at any DPR.
//
//  plateBtn  a riveted enamel / steel / brass plate (chamfered or arrow-cut
//            polygon, never round) with a jewel lamp, bevels, chipped paint,
//            scratches and grime. States: normal, hot (hover / focus: the lamp
//            lights), down (pressed / latched on) and disabled, all in one
//            sprite sheet so CSS can switch them.
//  rocker    a two-way bakelite rocker key (previous / next) in a steel bezel.
//  lever     a big knife-switch lever on a riveted base plate (up, mid, down).
//  chipUrl   a square paint chip for colour values (no round swatches).
//
// Labels are real text (EB Garamond, crisp), engraved / stencilled on the
// plate with CSS. Sprites are cached and repainted when the scale changes.
import { PixelCanvas, mixHex, bayer } from '../../gfx/pixel';
import { sfx, type Sfx } from './sfx';
import './kit.css';

export type Finish = 'steel' | 'olive' | 'cream' | 'oxblood' | 'brass' | 'navy';
export type Shape = 'plate' | 'tag' | 'arrowL' | 'arrowR' | 'key' | 'notch';
export type Size = 'xl' | 'lg' | 'md' | 'sm';
export type Glyph = 'L' | 'R' | 'l' | 'r' | 'U' | 'D' | 'X' | 'dot' | 'dice' | 'saw';

const K = 0x0a0806;
interface FinishSpec { ramp: number[]; bare: number; tex: 'brushed' | 'enamel' | 'brass' }
//                       outline  deep      dark      base      light     hi        glint
const FIN: Record<Finish, FinishSpec> = {
  steel: { ramp: [K, 0x121518, 0x1f2428, 0x2d343a, 0x3e474e, 0x56616a, 0x8a969e], bare: 0x9ba3a6, tex: 'brushed' },
  olive: { ramp: [K, 0x161a10, 0x252c1b, 0x37402a, 0x4b5638, 0x66734d, 0x93a078], bare: 0x8e9088, tex: 'enamel' },
  cream: { ramp: [K, 0x463b2a, 0x76684c, 0xa39477, 0xc0b190, 0xd8ccaa, 0xf2e8cc], bare: 0x8a8882, tex: 'enamel' },
  oxblood: { ramp: [K, 0x1e0705, 0x380e0a, 0x561710, 0x742318, 0x973624, 0xcc6644], bare: 0x9a9690, tex: 'enamel' },
  brass: { ramp: [K, 0x2c1e08, 0x553a10, 0x80601c, 0xa2802c, 0xc4a24a, 0xeed690], bare: 0xd6c690, tex: 'brass' },
  navy: { ramp: [K, 0x0a101c, 0x121b2e, 0x1b2944, 0x27395a, 0x3a5074, 0x6c86a8], bare: 0x9aa2a4, tex: 'enamel' },
};
const RIVET = { hi: 0xe4e8e6, mid: 0xa2aaac, lo: 0x4c5458 };

// ------------------------------------------------------------------ scale
const DPR = () => Math.max(1, Math.min(4, window.devicePixelRatio || 1));
/** CSS px per art pixel: always a whole number of device pixels (2 or more), ~3 CSS px on most screens */
export function kitScale(): number {
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;
  const target = h < 520 || w < 340 ? 2 : (w >= 2300 && h >= 1200) ? 4 : 3;
  return Math.max(2, Math.round(target * DPR())) / DPR();
}
/** a short (phone landscape) viewport: fewer, taller art pixels so tap targets stay >= 44 CSS px */
export const shortView = () => (window.innerHeight || 720) < 520;
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
/** plate height in art pixels for a size (includes the 2-pixel drop shadow) */
export function artH(size: Size): number {
  if (shortView()) return { xl: 26, lg: 22, md: 22, sm: 22 }[size];
  const c = coarse();
  return { xl: 22, lg: 16, md: c ? 16 : 14, sm: c ? 16 : 12 }[size];
}

// ------------------------------------------------------------------ helpers
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; };
function rng(seed: number) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function strSeed(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const grey = (c: number) => { const l = Math.round(((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.55 + (c & 255) * 0.15); return (l << 16) | (l << 8) | l; };
const cv = (w: number, h: number) => { const p = new PixelCanvas(w, h); p.wrap = false; return p; };

const cache = new Map<string, string>();
function cached(key: string, make: () => PixelCanvas): string {
  let u = cache.get(key);
  if (!u) {
    const pc = make();
    const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
    c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
    u = c.toDataURL();
    if (cache.size > 600) cache.delete(cache.keys().next().value as string);
    cache.set(key, u);
  }
  return u;
}

// ------------------------------------------------------------------ shapes
type Inside = (u: number, v: number) => boolean;
function shapeFn(shape: Shape | 'halfL' | 'halfR', pw: number, ph: number): Inside {
  const c = Math.max(2, Math.round(ph * 0.2));
  const box = (u: number, v: number) => u >= 0 && v >= 0 && u < pw && v < ph;
  const cut = (u: number, v: number, tl: number, tr: number, br: number, bl: number) =>
    u + v < tl || (pw - 1 - u) + v < tr || (pw - 1 - u) + (ph - 1 - v) < br || u + (ph - 1 - v) < bl;
  switch (shape) {
    case 'tag': return (u, v) => box(u, v) && !cut(u, v, c, c, c, c);
    case 'key': return (u, v) => box(u, v) && !cut(u, v, 1, 1, 1, 1);
    case 'notch': return (u, v) => box(u, v) && !cut(u, v, c + 1, 1, c + 1, 1) && !(u > pw - 2 - c && u < pw - 1 && v > ph * 0.35 && v < ph * 0.65 && u > pw - 1 - Math.round(c * 0.6));
    case 'arrowL': { const a = Math.floor(ph / 2); return (u, v) => box(u, v) && u >= a - Math.min(v, ph - 1 - v) && !cut(u, v, 0, 2, 2, 0); }
    case 'arrowR': { const a = Math.floor(ph / 2); return (u, v) => box(u, v) && (pw - 1 - u) >= a - Math.min(v, ph - 1 - v) && !cut(u, v, 2, 0, 0, 2); }
    case 'halfL': return (u, v) => box(u, v) && !cut(u, v, 1, 0, 0, 1);
    case 'halfR': return (u, v) => (u < 0 ? v >= 0 && v < ph : box(u, v) && !cut(u, v, 0, 1, 1, 0));
    default: return (u, v) => box(u, v) && !cut(u, v, c, 1, c, 1);
  }
}

/** rings: 0 = outline, 1..3 bevel depth, 4 = face; plus which side the nearest edge is on (+1 lit / -1 shade / 0) */
function rings(inside: Inside, pw: number, ph: number) {
  const ring = new Int8Array(pw * ph).fill(-1);
  const lit = new Int8Array(pw * ph);
  for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) {
    if (!inside(u, v)) continue;
    let r = 4;
    for (let d = 1; d <= 4 && r === 4; d++) {
      for (let j = -d; j <= d && r === 4; j++) for (let i = -d; i <= d; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== d) continue;
        if (!inside(u + i, v + j)) { r = d - 1; break; }
      }
    }
    ring[v * pw + u] = r;
    if (r < 4) {
      const d = r + 1;
      const up = !inside(u, v - d);
      const left = !inside(u - d, v);
      const down = !inside(u, v + d);
      const right = !inside(u + d, v);
      const sc = (up ? 1 : 0) + (left ? 1 : 0) - (down ? 1 : 0) - (right ? 1 : 0);
      lit[v * pw + u] = sc > 0 ? 1 : sc < 0 ? -1 : (up && right ? 1 : 0);
    }
  }
  return { ring, lit };
}

// ------------------------------------------------------------------ glyphs (engraved)
const GLYPHS: Record<Glyph, string[]> = {
  L: ['...#', '..##', '.###', '####', '.###', '..##', '...#'],
  R: ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  l: ['..#', '.##', '###', '.##', '..#'],
  r: ['#..', '##.', '###', '##.', '#..'],
  U: ['...#...', '..###..', '.#####.', '#######'],
  D: ['#######', '.#####.', '..###..', '...#...'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  dot: ['##', '##'],
  dice: ['#####', '#.#.#', '#####', '#.#.#', '#####'],
  saw: ['.#.#.#.', '#######', '#.....#', '#.###.#', '#.....#', '#######'],
};

/** state: 0 normal, 1 hot, 2 down, 3 disabled */
type St = 0 | 1 | 2 | 3;
interface PlateSpec { W: number; H: number; finish: Finish; shape: Shape | 'halfL' | 'halfR'; seed: number; lamp?: 'amber' | 'green' | 'red' | false; glyph?: Glyph | null; glyphAt?: 'left' | 'center'; rivets?: boolean; wear?: number }

/** draw one plate state at (ox, oy) into pc; the plate covers W-1 x H-2, the rest is its drop shadow */
function drawPlate(pc: PixelCanvas, ox: number, oy: number, p: PlateSpec, st: St, opts: { noShadow?: boolean } = {}) {
  const F = FIN[p.finish];
  const R = F.ramp;
  const pw = p.W - 1, ph = p.H - 2;
  const inside = shapeFn(p.shape, pw, ph);
  const dn = st === 2 ? 1 : 0;
  // drop shadow (a hard pixel shadow, two rows deep)
  if (!opts.noShadow) for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) if (inside(u, v)) {
    pc.blend(ox + u + 1, oy + v + 2, 0x000000, 0.62);
  }
  const { ring, lit } = rings(inside, pw, ph);
  const rnd = rng(p.seed * 7 + 13);
  const sheenY = ph * 0.3;
  const wear = p.wear ?? 1;
  const faceCol = (u: number, v: number) => {
    let val = 0.6 - 0.34 * (v / ph);
    const n = hash(u >> 1, v, p.seed);
    if (F.tex === 'brushed') {
      val += 0.13 * Math.exp(-(((v - sheenY) / (ph * 0.16)) ** 2));
      const st2 = hash((u + Math.floor(hash(0, v, p.seed) * 40)) >> 2, v, p.seed + 3);
      if (st2 > 0.86) val += 0.07; else if (st2 < 0.1) val -= 0.06;
    } else if (F.tex === 'brass') {
      val += 0.14 * Math.exp(-(((v - sheenY) / (ph * 0.2)) ** 2)) - 0.03;
      if (hash(u >> 2, v >> 1, p.seed + 9) < 0.04 * wear) val -= 0.1;
    } else {
      val += (hash(u >> 1, v >> 1, p.seed + 5) - 0.5) * 0.09;
      if (n > 0.965) val += 0.08;
    }
    // grime gathers low and in the corners
    if (v > ph - 4) val -= 0.05 * (v - (ph - 4)) * wear * (bayer(u, v) < 0.6 ? 1 : 0.3);
    if (u < 3 || u > pw - 4) val -= 0.03 * wear;
    if (st === 1) val += 0.1;
    else if (st === 2) val -= 0.1;
    else if (st === 3) val -= 0.12;
    const f = 1.6 + Math.max(0, Math.min(1, val)) * 4.2;
    let i = Math.floor(f);
    // flat bands with a narrow dithered seam between them (not a checkerboard everywhere)
    const fr = f - i;
    if (fr > 0.66 || (fr > 0.4 && bayer(u, v) < (fr - 0.4) / 0.26)) i++;
    return R[Math.max(1, Math.min(6, i))];
  };
  for (let v = 0; v < ph; v++) for (let u = 0; u < pw; u++) {
    const r = ring[v * pw + u];
    if (r < 0) continue;
    const l = lit[v * pw + u];
    let c: number;
    if (r === 0) c = K;
    else if (r === 1) c = st === 2 ? (l > 0 ? R[1] : l < 0 ? R[4] : R[3]) : (l > 0 ? (st === 1 ? R[6] : R[5]) : l < 0 ? R[1] : R[4]);
    else if (r === 2) c = st === 2 ? (l > 0 ? R[2] : l < 0 ? R[3] : faceCol(u, v)) : (l > 0 ? R[4] : l < 0 ? R[2] : faceCol(u, v));
    else c = faceCol(u, v);
    if (st === 3) c = mixHex(c, grey(c), 0.65);
    pc.set(ox + u, oy + v + dn, c);
  }
  const put = (u: number, v: number, c: number) => { if (u >= 0 && v >= 0 && u < pw && v < ph && ring[v * pw + u] >= 1) pc.set(ox + u, oy + v + dn, st === 3 ? mixHex(c, grey(c), 0.65) : c); };
  const blendIn = (u: number, v: number, c: number, t: number) => { if (u >= 0 && v >= 0 && u < pw && v < ph && ring[v * pw + u] >= 1) pc.blend(ox + u, oy + v + dn, c, t); };
  const isFace = (u: number, v: number) => u >= 0 && v >= 0 && u < pw && v < ph && ring[v * pw + u] >= 3;

  // ---- wear: chipped paint on the edges, scratches, a rust run
  if (wear > 0) {
    const nChip = Math.round((1 + pw / 20) * wear);
    for (let i = 0; i < nChip; i++) {
      const top = rnd() < 0.5;
      const u = 3 + Math.floor(rnd() * (pw - 6)), v = top ? 1 + Math.floor(rnd() * 2) : ph - 2 - Math.floor(rnd() * 2);
      const w = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < w; k++) {
        if (ring[v * pw + u + k] < 1) continue;
        put(u + k, v, F.tex === 'brushed' ? R[6] : F.bare);
        if (rnd() < 0.6) put(u + k, v + (top ? 1 : -1), F.tex === 'brushed' ? R[4] : mixHex(F.bare, R[1], 0.5));
      }
      put(u + w, v, R[1]);
    }
    const nScr = Math.round((pw / 14) * wear);
    for (let i = 0; i < nScr; i++) {
      // short straight scuffs: a light pixel run with a dark pixel under its start
      let u = 6 + Math.floor(rnd() * (pw - 12)), v = 3 + Math.floor(rnd() * Math.max(1, ph - 7));
      const dx = rnd() < 0.5 ? 1 : -1, diag = rnd() < 0.5, len = 2 + Math.floor(rnd() * 4);
      if (isFace(u, v + 1)) put(u, v + 1, R[2]);
      for (let k = 0; k < len; k++) {
        if (isFace(u, v)) put(u, v, k === 0 ? R[6] : R[5]);
        u += dx; if (diag && k % 2 === 1) v += 1;
      }
    }
    if (F.tex !== 'brass' && rnd() < 0.55 * wear) {
      const u = 4 + Math.floor(rnd() * (pw - 8)), v0 = ph - 6;
      for (let k = 0; k < 4; k++) if (isFace(u, v0 + k)) blendIn(u, v0 + k, k < 2 ? 0x6a3412 : 0x4a220c, 0.55 - k * 0.08);
    }
  }

  // ---- rivets (right end, and the left end when there is no lamp)
  const rivet = (u: number, v: number) => {
    put(u, v, RIVET.hi); put(u + 1, v, RIVET.mid); put(u, v + 1, RIVET.mid); put(u + 1, v + 1, RIVET.lo);
    blendIn(u + 2, v + 1, 0x000000, 0.35); blendIn(u + 1, v + 2, 0x000000, 0.35); blendIn(u + 2, v + 2, 0x000000, 0.3);
    blendIn(u - 1, v, 0x000000, 0.18);
  };
  if (p.rivets !== false && ph >= 9) {
    const e = Math.max(3, Math.round(ph * 0.22));
    const rx = p.shape === 'arrowR' ? pw - Math.floor(ph / 2) - 1 : pw - 4;
    if (p.shape !== 'arrowR') { rivet(rx - 1, e - 1); rivet(rx - 1, ph - e - 1); } else rivet(rx - 2, Math.floor(ph / 2) - 1);
    if (!p.lamp && !(p.glyph && p.glyphAt === 'left')) {
      const lx = p.shape === 'arrowL' ? Math.floor(ph / 2) + 1 : 2;
      if (p.shape === 'arrowL') rivet(lx, Math.floor(ph / 2) - 1); else { rivet(lx, e - 1); rivet(lx, ph - e - 1); }
    }
  }

  // ---- the jewel lamp: a rectangular window, lit when hot / down
  if (p.lamp) {
    const lw = ph >= 15 ? 3 : 2, lh = Math.max(4, Math.round(ph * 0.42));
    const lx = (p.shape === 'arrowL' ? Math.floor(ph / 2) + 1 : 3), ly = Math.floor((ph - lh) / 2);
    const on = st === 1 || st === 2;
    const pal = p.lamp === 'green' ? [0x062a10, 0x0e4a1c, 0x3ae86a, 0xb0ffc0, 0x1aa040, 0x40ff80] : p.lamp === 'red' ? [0x2a0604, 0x4a0e08, 0xff4a2a, 0xffc0a0, 0xb01a10, 0xff6040] : [0x2a1006, 0x4a2008, 0xffaa30, 0xfff0b0, 0xc85a10, 0xffa040];
    for (let i = -1; i <= lw; i++) { put(lx + i, ly - 1, R[1]); put(lx + i, ly + lh, R[5]); }
    for (let j = 0; j < lh; j++) { put(lx - 1, ly + j, R[1]); put(lx + lw, ly + j, R[5]); }
    for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
      let c = on ? (j === 0 ? pal[3] : j === lh - 1 ? pal[4] : pal[2]) : (j === lh - 1 ? 0x100604 : pal[0]);
      if (!on && i === 0 && j === 0) c = pal[1];
      if (on && i === lw - 1 && j > 0 && j < lh - 1) c = mixHex(pal[2], pal[4], 0.5);
      put(lx + i, ly + j, c);
    }
    if (on) for (let j = -3; j <= lh + 2; j++) for (let i = -3; i <= lw + 2; i++) {
      if (i >= -1 && i <= lw && j >= -1 && j <= lh) continue;
      const d = Math.max(i < 0 ? -1 - i : i - lw, j < 0 ? -1 - j : j - lh);
      if (isFace(lx + i, ly + j) || ring[(ly + j) * pw + lx + i] >= 1) blendIn(lx + i, ly + j, pal[5], d <= 0 ? 0.32 : d === 1 ? 0.18 : 0.08);
    }
  }

  // ---- an engraved glyph (arrows on rockers, icons on keys)
  if (p.glyph) {
    const g = GLYPHS[p.glyph];
    const gw = g[0].length, gh = g.length;
    const gx = p.glyphAt === 'left' ? (p.shape === 'arrowL' ? Math.floor(ph / 2) + 1 : 3) : Math.floor((pw - gw) / 2);
    const gy = Math.floor((ph - gh) / 2);
    const hot = st === 1;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      if (g[j][i] !== '#') continue;
      put(gx + i, gy + j, hot ? (j === 0 ? 0xffe8a0 : 0xffb43c) : st === 2 ? R[1] : mixHex(R[1], K, 0.4));
      if (!hot && (g[j + 1]?.[i] !== '#')) put(gx + i, gy + j + 1, R[5]);
    }
  }
}

/** a whole plate sprite sheet: 4 states stacked vertically (normal, hot, down, disabled) */
export function plateSheet(p: PlateSpec): string {
  const key = `p|${p.W}|${p.H}|${p.finish}|${p.shape}|${p.seed}|${p.lamp}|${p.glyph}|${p.glyphAt}|${p.rivets}|${p.wear}`;
  return cached(key, () => {
    const pc = cv(p.W, p.H * 4);
    for (let s = 0; s < 4; s++) drawPlate(pc, 0, s * p.H, p, s as St);
    return pc;
  });
}

// ------------------------------------------------------------------ live widgets: repaint on resize
type Live = { el: HTMLElement; paint: () => void };
const live = new Set<Live>();
let lastScale = 0;
function register(w: Live) {
  live.add(w);
  ensureHooks();
  const ro = new ResizeObserver(() => { if (!w.el.isConnected) { ro.disconnect(); live.delete(w); return; } w.paint(); });
  ro.observe(w.el);
}
let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  applyKitVars();
  let t = 0;
  const again = () => { clearTimeout(t); t = window.setTimeout(() => { applyKitVars(); for (const w of [...live]) { if (!w.el.isConnected) { live.delete(w); continue; } w.paint(); } }, 90); };
  window.addEventListener('resize', again);
  try { matchMedia(`(resolution: ${DPR()}dppx)`).addEventListener('change', again); } catch { /* old browser */ }
  (document as any).fonts?.ready?.then(again);
}
/** --ks (CSS px per art pixel) and the selection pointer sprite on :root */
export function applyKitVars() {
  const s = kitScale();
  const de = document.documentElement.style;
  de.setProperty('--ks', s + 'px');
  de.setProperty('--ksn', String(s));
  if (s !== lastScale) {
    lastScale = s;
    de.setProperty('--pb-ptr', `url(${pointerUrl()})`);
    de.setProperty('--pb-ptr-g', `url(${pointerUrl(true)})`);
  }
}
applyKitVars();

function pointerUrl(green = false) {
  return cached('ptr' + green, () => {
    const rows = ['#.....', '##....', '#o#...', '#oo#..', '#ooh#.', '#oo#..', '#o#...', '##....', '#.....'];
    const pc = cv(6, 9);
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '#') pc.set(x, y, K);
      else if (ch === 'o') pc.set(x, y, green ? (y < 4 ? 0x9affb0 : 0x3ad060) : (y < 4 ? 0xffd070 : 0xf09a20));
      else if (ch === 'h') pc.set(x, y, green ? 0xe0ffe8 : 0xfff2c0);
    }));
    return pc;
  });
}

// ------------------------------------------------------------------ plate buttons
export interface PlateOpts {
  finish?: Finish; shape?: Shape; size?: Size; sub?: string; seed?: number;
  lamp?: 'amber' | 'green' | 'red' | false; glyph?: Glyph;
  /** stretch to the container's width */
  full?: boolean;
  /** the blinking selection pointer to the left when focused */
  pointer?: boolean;
  cls?: string; sound?: Sfx | ''; hover?: Sfx | ''; tip?: string; aria?: string;
  /** minimum width in art pixels */
  minW?: number;
  wear?: number;
  /** narrow side margins, no rivets (tabs, tight rows) */
  tight?: boolean;
}
export type PlateButton = HTMLButtonElement & { setLabel: (l: string, sub?: string) => void; paint: () => void };

const inkDark = (f: Finish) => f === 'cream' || f === 'brass';
/** label font size (CSS px) for a plate of this art height at this scale */
const labelPx = (ah: number, s: number, sub: boolean) => Math.round(Math.max(13, Math.min(26, ah * s * (sub ? 0.3 : 0.37))));

export function plateBtn(label: string, onClick: (b: PlateButton) => void, o: PlateOpts = {}): PlateButton {
  const finish = o.finish ?? 'steel', size = o.size ?? 'lg';
  const shape = o.shape ?? 'plate';
  const b = document.createElement('button') as PlateButton;
  b.type = 'button';
  b.className = `pb pb-${finish} pb-${size}${inkDark(finish) ? ' ink-d' : ''}${o.full ? ' pb-full' : ''}${o.pointer ? ' pb-ptr' : ''}${o.cls ? ' ' + o.cls : ''}`;
  b.dataset.shape = shape;
  const lab = document.createElement('span'); lab.className = 'pb-l';
  const sub = document.createElement('small'); sub.className = 'pb-s';
  b.append(lab, sub);
  if (o.tip) b.dataset.tip = o.tip;
  if (o.aria) b.setAttribute('aria-label', o.aria);
  const seed = o.seed ?? strSeed(label + finish);
  const lamp = o.lamp === undefined ? 'amber' : o.lamp;
  let key = '';
  b.setLabel = (l: string, s?: string) => {
    lab.textContent = l;
    if (s !== undefined) { sub.textContent = s; sub.hidden = !s; }
    key = ''; b.paint();
  };
  b.paint = () => {
    if (!b.isConnected) return;
    const s = kitScale();
    const hasSub = !!sub.textContent;
    const ah = artH(hasSub && size !== 'sm' ? 'xl' : size);
    const hPx = ah * s;
    b.style.height = hPx + 'px';
    b.style.setProperty('--bh', hPx + 'px');
    b.style.fontSize = labelPx(ah, s, hasSub) + 'px';
    const iconOnly = !lab.textContent && !!o.glyph;
    const padL = iconOnly ? 0 : (o.tight ? (lamp || o.glyph ? 9 : 4) : (lamp || o.glyph ? 10 : 7)) + (shape === 'arrowL' ? Math.floor((ah - 2) / 2) - 2 : 0);
    const padR = iconOnly ? 0 : (o.tight ? 4 : 8) + (shape === 'arrowR' ? Math.floor((ah - 2) / 2) - 2 : 0);
    b.style.paddingLeft = padL * s + 'px';
    b.style.paddingRight = padR * s + 'px';
    let aw: number;
    if (o.full) { b.style.width = ''; aw = Math.floor(b.getBoundingClientRect().width / s); }
    else {
      b.style.width = '';
      const w0 = b.getBoundingClientRect().width;
      aw = iconOnly ? Math.max(o.minW ?? 0, ah + 3) : Math.max(o.minW ?? 0, Math.ceil(w0 / s), ah + 6);
      b.style.width = aw * s + 'px';
    }
    if (aw < 8) return;
    const k = `${aw}|${ah}|${s}`;
    if (k === key) return;
    key = k;
    const url = plateSheet({ W: aw, H: ah, finish, shape, seed, lamp: iconOnly ? false : lamp, glyph: o.glyph, glyphAt: iconOnly ? 'center' : 'left', wear: o.wear, rivets: iconOnly || o.tight ? false : undefined });
    b.style.backgroundImage = `url(${url})`;
    b.style.backgroundSize = `${aw * s}px ${ah * s * 4}px`;
  };
  b.setLabel(label, o.sub ?? '');
  b.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || b.disabled) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && ((a.tagName === 'INPUT' && (a as HTMLInputElement).type === 'text') || a.tagName === 'TEXTAREA')) return;
    if (a !== b) { b.focus({ preventScroll: true }); if (o.hover !== '') sfx(o.hover ?? 'hover'); }
  });
  b.addEventListener('pointerdown', () => b.classList.add('down'));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, () => b.classList.remove('down'));
  b.addEventListener('click', () => {
    if (b.disabled) return;
    b.classList.add('down');
    setTimeout(() => b.classList.remove('down'), 110);
    if (o.sound !== '') sfx(o.sound ?? 'plate');
    onClick(b);
  });
  register({ el: b, paint: () => b.paint() });
  return b;
}

// ------------------------------------------------------------------ rocker keys
/** frames: 0 rest, 1 left hot, 2 right hot, 3 left down, 4 right down, 5 disabled */
function rockerSheet(hw: number, H: number, finish: Finish, seed: number): string {
  return cached(`rk|${hw}|${H}|${finish}|${seed}`, () => {
    const W = hw * 2 + 2;
    const pc = cv(W, H * 6);
    const frames: [St, St][] = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [3, 3]];
    frames.forEach(([a, b], f) => {
      const oy = f * H;
      // the steel bezel (with its shadow), then the two halves of the bakelite paddle
      drawPlate(pc, 0, oy, { W, H, finish: 'steel', shape: 'key', seed, rivets: false, wear: 0.4 }, a === 3 ? 3 : 0);
      drawPlate(pc, 2, oy + 2, { W: hw, H: H - 4, finish, shape: 'halfL', seed: seed + 1, rivets: false, glyph: 'l', wear: 0.5 }, a, { noShadow: true });
      drawPlate(pc, hw + 1, oy + 2, { W: hw - 1, H: H - 4, finish, shape: 'halfR', seed: seed + 2, rivets: false, glyph: 'r', wear: 0.5 }, b, { noShadow: true });
      for (let y = 3; y < H - 5; y++) pc.set(hw, oy + y, K);
    });
    return pc;
  });
}

export interface Rocker { el: HTMLElement; prev: HTMLButtonElement; next: HTMLButtonElement; paint: () => void; set disabled(v: boolean) }
/** a two-way rocker key: the left half steps back, the right half forward */
export function rocker(onStep: (d: -1 | 1) => void, o: { finish?: Finish; label?: string; size?: Size; seed?: number } = {}): Rocker {
  const finish = o.finish ?? 'cream', size = o.size ?? 'sm';
  const el = document.createElement('span'); el.className = 'rk';
  const mk = (cls: string, d: -1 | 1) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rk-b ' + cls;
    b.setAttribute('aria-label', (o.label ? o.label + ': ' : '') + (d < 0 ? 'previous' : 'next'));
    b.addEventListener('click', () => { if (b.disabled) return; press(d); sfx('rocker'); onStep(d); });
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || b.disabled) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && a.tagName === 'INPUT' && (a as HTMLInputElement).type === 'text') return;
      if (a !== b) { b.focus({ preventScroll: true }); sfx('hover'); }
    });
    b.addEventListener('focus', () => state());
    b.addEventListener('blur', () => state());
    b.addEventListener('pointerdown', () => { el.dataset.st = d < 0 ? '3' : '4'; });
    b.addEventListener('pointerup', () => state());
    b.addEventListener('pointerleave', () => state());
    el.append(b);
    return b;
  };
  let pressT = 0, pressing = 0;
  const press = (d: -1 | 1) => { pressing = d; el.dataset.st = d < 0 ? '3' : '4'; clearTimeout(pressT); pressT = window.setTimeout(() => { pressing = 0; state(); }, 120); };
  const state = () => {
    if (pressing) return;
    if (prev.disabled && next.disabled) { el.dataset.st = '5'; return; }
    const a = document.activeElement;
    el.dataset.st = a === prev ? '1' : a === next ? '2' : '0';
  };
  const prev = mk('l', -1), next = mk('r', 1);
  const seed = o.seed ?? 77;
  let key = '';
  const paint = () => {
    if (!el.isConnected) return;
    const s = kitScale();
    const H = artH(size) + 4;
    const hw = Math.round(H * 0.84);
    const W = hw * 2 + 2;
    el.style.width = W * s + 'px'; el.style.height = H * s + 'px';
    el.style.setProperty('--bh', H * s + 'px');
    const k = `${hw}|${H}|${s}`;
    if (k === key) return;
    key = k;
    el.style.backgroundImage = `url(${rockerSheet(hw, H, finish, seed)})`;
    el.style.backgroundSize = `${W * s}px ${H * s * 6}px`;
  };
  el.dataset.st = '0';
  register({ el, paint });
  return { el, prev, next, paint, set disabled(v: boolean) { prev.disabled = next.disabled = v; state(); } };
}

// ------------------------------------------------------------------ the big lever
/** frames: 0 up, 1 up hot, 2 mid (end-on), 3 down, 4 down hot, 5 up disabled, 6 down disabled */
function leverSheet(W: number, H: number, handle: Finish, seed: number, lampCol: 'green' | 'amber'): string {
  return cached(`lv2|${W}|${H}|${handle}|${seed}|${lampCol}`, () => {
    const pc = cv(W, H * 7);
    const HR = FIN[handle].ramp;
    const COPPER = [0x2a1006, 0x6a3012, 0xa85a24, 0xd88a44, 0xf4c080];
    const hh = Math.max(7, Math.round(H * 0.17));         // handle height
    const by = hh - 2, bh = H - 2 * hh + 2;               // base plate rows
    const bx = 1, bw = W - 3;
    const px = Math.floor(W / 2) - 1;                     // the arm's left column
    const py = by + Math.round(bh * 0.5);                 // pivot row
    const s0 = by + 6, s1 = by + bh - 6;                  // slot
    for (let f = 0; f < 7; f++) {
      const oy = f * H;
      const up = f === 0 || f === 1 || f === 5, mid = f === 2;
      const hot = f === 1 || f === 4, dis = f >= 5;
      const P = (x: number, y: number, c: number) => pc.set(x, oy + y, dis ? mixHex(c, grey(c), 0.6) : c);
      const B = (x: number, y: number, c: number, t: number) => pc.blend(x, oy + y, c, t);
      // the riveted base plate
      drawPlate(pc, bx, oy + by, { W: bw + 1, H: bh + 2, finish: 'steel', shape: 'plate', seed, rivets: false, wear: 1 }, dis ? 3 : 0);
      const rv = (x: number, y: number) => { P(x, y, RIVET.hi); P(x + 1, y, RIVET.mid); P(x, y + 1, RIVET.mid); P(x + 1, y + 1, RIVET.lo); B(x + 2, y + 1, 0, 0.35); B(x + 1, y + 2, 0, 0.35); };
      rv(bx + 3, by + 3); rv(bx + bw - 5, by + 3); rv(bx + 3, by + bh - 5); rv(bx + bw - 5, by + bh - 5);
      // a hazard band across the top of the plate
      for (let x = bx + 6; x < bx + bw - 6; x++) for (let j = 0; j < 2; j++) P(x, by + 3 + j, ((x + j) >> 1) % 2 ? 0xd8a828 : 0x17140c);
      for (let x = bx + 6; x < bx + bw - 6; x++) { P(x, by + 2, 0x121518); P(x, by + 5, 0x56616a); }
      // the slot the arm travels in, with copper contact jaws at the bottom
      for (let y = s0; y <= s1; y++) { P(px - 1, y, 0x121518); P(px, y, 0x050403); P(px + 1, y, 0x050403); P(px + 2, y, 0x0c0a08); P(px + 3, y, 0x6a767e); }
      P(px - 1, s0 - 1, 0x121518); P(px + 3, s1 + 1, 0x6a767e);
      for (const jx of [px - 3, px + 3]) for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) {
        const y = s1 - 4 + j;
        P(jx + i, y, j === 0 ? COPPER[4] : i === 0 ? COPPER[3] : j === 3 ? COPPER[1] : COPPER[2]);
      }
      // engraved 0 (top) and 1 (bottom) beside the slot
      const dig = (x: number, y: number, rows: string[]) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') { P(x + i, y + j, 0x0e1012); P(x + i + 1, y + j + 1, 0x6a767e); } }));
      dig(px + 5, s0 + 1, ['###', '#.#', '#.#', '###']);
      dig(px + 6, s1 - 8, ['##', '.#', '.#', '.#']);
      // the indicator lamp (lit on the thrown lever), left of the pivot
      const lw = 3, lh = 4, lx = bx + 3, ly = py - 2;
      const on = !up && !mid && !dis;
      const lc = lampCol === 'green' ? [0x0a2a12, 0x40ff7a, 0xd0ffd8, 0x1a9a3a] : [0x2a1006, 0xffaa30, 0xfff0b0, 0xc85a10];
      for (let i = -1; i <= lw; i++) { P(lx + i, ly - 1, 0x121518); P(lx + i, ly + lh, 0x6a767e); }
      for (let j = 0; j < lh; j++) { P(lx - 1, ly + j, 0x121518); P(lx + lw, ly + j, 0x6a767e); }
      for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) P(lx + i, ly + j, on ? (j === 0 ? lc[2] : j === lh - 1 ? lc[3] : lc[1]) : (i === 0 && j === 0 ? 0x24301e : lc[0]));
      if (on) for (let i = -2; i <= lw + 1; i++) for (let j = -2; j <= lh + 1; j++) { if (i >= -1 && i <= lw && j >= -1 && j <= lh) continue; B(lx + i, ly + j, lc[1], 0.16); }
      // the pivot block: a square hub with a hex bolt
      const hub = () => {
        const hx = px - 2, hy = py - 2;
        for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) {
          const e = i === 0 || j === 0 || i === 6 || j === 4;
          P(hx + i, hy + j, e ? K : j === 1 ? (i < 4 ? 0x9aa6ae : 0x5d676e) : j === 3 ? 0x2d343a : 0x434c53);
        }
        P(hx + 3, hy + 2, RIVET.hi); P(hx + 4, hy + 2, RIVET.mid); P(hx + 3, hy + 3, RIVET.lo);
        B(hx + 7, hy + 2, 0, 0.4); B(hx + 7, hy + 3, 0, 0.4); B(hx + 2, hy + 5, 0, 0.4); B(hx + 6, hy + 5, 0, 0.4);
      };
      const rod = (y0: number, y1: number) => {
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
          P(px - 1, y, K); P(px, y, 0xd8e0e4); P(px + 1, y, 0x8a969e); P(px + 2, y, 0x4a5458); P(px + 3, y, K);
          B(px + 4, y + 1, 0, 0.35);
        }
      };
      // the bakelite handle: grip ridges, lit top-left, a brass ferrule where the rod enters
      const hwid = W - 6;
      const handleAt = (x: number, y: number, hgt: number, endOn: boolean, ferruleBelow: boolean) => {
        for (let j = 0; j < hgt; j++) for (let i = 0; i < hwid; i++) B(x + i + 2, y + j + 2, 0, 0.45);
        for (let j = 0; j < hgt; j++) for (let i = 0; i < hwid; i++) {
          const corner = (i === 0 || i === hwid - 1) && (j === 0 || j === hgt - 1);
          if (corner) continue;
          const edge = i === 0 || j === 0 || i === hwid - 1 || j === hgt - 1;
          let c: number;
          if (edge) c = K;
          else if (endOn) c = j === 1 || i === 1 ? HR[hot ? 6 : 5] : j === hgt - 2 || i === hwid - 2 ? HR[2] : (Math.abs(i - hwid / 2) < 2 && Math.abs(j - hgt / 2) < 1.5) ? HR[1] : HR[4];
          else {
            const ridge = j > 1 && j < hgt - 2 && j % 2 === 0;
            c = i === 1 ? HR[hot ? 6 : 5] : i === hwid - 2 ? HR[1] : ridge ? HR[2] : HR[hot ? 5 : 4];
            if (j === 1 && i > 1 && i < hwid - 2) c = HR[hot ? 6 : 5];
            if (j === hgt - 2 && i > 1) c = HR[2];
          }
          P(x + i, y + j, c);
        }
        if (!endOn) {
          if (hot) { P(x + 2, y + 1, 0xffffff); P(x + 3, y + 1, mixHex(HR[6], 0xffffff, 0.5)); }
          const fy = ferruleBelow ? y + hgt : y - 2;
          for (let j = 0; j < 2; j++) for (let i = -1; i <= 4; i++) P(px + i - 1 + 1, fy + j, i === -1 || i === 4 ? K : j === 0 ? 0xe8cc7a : 0x8a6a22);
        }
      };
      if (mid) {
        hub();
        handleAt(px - Math.floor(hwid / 2) + 1, py - Math.floor((hh - 1) / 2) - 1, hh - 1, true, false);
      } else if (up) {
        rod(hh + 1, py);
        hub();
        handleAt(px - Math.floor(hwid / 2) + 1, 0, hh, false, true);
      } else {
        hub();
        rod(py + 3, H - hh - 3);
        handleAt(px - Math.floor(hwid / 2) + 1, H - hh - 2, hh, false, false);
      }
    }
    return pc;
  });
}

export interface Lever { el: HTMLButtonElement; set: (down: boolean) => void; pull: () => Promise<void>; readonly down: boolean; paint: () => void }
/** a big knife-switch lever; up at rest, thrown down when it is the current choice */
export function lever(label: string, sub: string, onPull: () => void, o: { handle?: Finish; seed?: number; lamp?: 'green' | 'amber' } = {}): Lever {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'lv';
  el.innerHTML = `<span class="lv-art"></span><span class="lv-t"><b></b><small></small></span>`;
  (el.querySelector('b') as HTMLElement).textContent = label;
  (el.querySelector('small') as HTMLElement).textContent = sub;
  el.setAttribute('aria-label', label + (sub ? ' — ' + sub : ''));
  const art = el.querySelector('.lv-art') as HTMLElement;
  let down = false, anim = false;
  const handle = o.handle ?? 'oxblood', seed = o.seed ?? strSeed(label);
  const frame = () => {
    if (anim) return;
    const hot = (document.activeElement === el || el.matches(':hover')) && !el.disabled;
    el.dataset.f = String(el.disabled ? (down ? 6 : 5) : down ? (hot ? 4 : 3) : (hot ? 1 : 0));
  };
  let key = '';
  const paint = () => {
    if (!el.isConnected) return;
    const s = kitScale();
    const W = shortView() ? 22 : 26, H = shortView() ? 38 : 50;
    art.style.width = W * s + 'px'; art.style.height = H * s + 'px';
    el.style.setProperty('--bh', H * s + 'px');
    const k = `${W}|${H}|${s}`;
    if (k === key) return;
    key = k;
    art.style.backgroundImage = `url(${leverSheet(W, H, handle, seed, o.lamp ?? 'green')})`;
    art.style.backgroundSize = `${W * s}px ${H * s * 7}px`;
  };
  for (const ev of ['focus', 'blur', 'pointerenter', 'pointerleave']) el.addEventListener(ev, frame);
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !el.disabled && document.activeElement !== el) { el.focus({ preventScroll: true }); sfx('hover'); } });
  el.addEventListener('click', () => { if (!el.disabled && !anim) onPull(); });
  const L: Lever = {
    el, paint,
    get down() { return down; },
    set(d: boolean) { down = d; el.classList.toggle('on', d); el.setAttribute('aria-pressed', String(d)); frame(); },
    /** animate a throw (up -> end-on -> down; from down it springs up first) */
    async pull() {
      anim = true;
      const step = (f: number, ms: number) => new Promise<void>((r) => { el.dataset.f = String(f); setTimeout(r, ms); });
      if (down) { await step(2, 70); await step(0, 120); }
      sfx('lever');
      await step(2, 70);
      await step(3, 60);
      anim = false;
      L.set(true);
    },
  };
  el.dataset.f = '0';
  register({ el: art, paint });
  return L;
}

// ------------------------------------------------------------------ small art
/** a square paint chip (colour value), black outline, bevel, a little dog-ear */
export function chipUrl(color: number, size = 9): string {
  return cached(`chip|${color}|${size}`, () => {
    const pc = cv(size + 1, size + 1);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const e = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      let c = e ? K : x === 1 || y === 1 ? mixHex(color, 0xffffff, 0.3) : x === size - 2 || y === size - 2 ? mixHex(color, 0x000000, 0.35) : color;
      if (!e && (x + y) % 4 === 0 && bayer(x, y) > 0.7) c = mixHex(c, 0x000000, 0.08);
      pc.set(x, y, c);
    }
    pc.set(size - 2, 1, 0xf0e8d0); pc.set(size - 3, 1, 0xd8d0b8); pc.set(size - 2, 2, 0xb8b098);
    for (let i = 1; i <= size; i++) { pc.blend(i, size, 0, 0.5); pc.blend(size, i, 0, 0.5); }
    return pc;
  });
}

/** an engraved-steel strip (for a divider under a heading): 1 art px tall groove */
export function grooveUrl(): string {
  return cached('groove', () => { const pc = cv(4, 2); for (let x = 0; x < 4; x++) { pc.set(x, 0, 0x000000, 150); pc.set(x, 1, 0xffffff, 26); } return pc; });
}

// THE LOADING SCREEN (round 13): what #boot shows while the game comes up, a
// save is read or a room is joined. A full painting in high-resolution pixel
// art, generated per pixel at about half the screen's resolution: a yellow
// backrooms corridor in one-point perspective (mono-yellow wallpaper with its
// stripes and damask, water stains, a brown baseboard, a damp carpet, ceiling
// tiles and humming fluorescent panels that light it in pools, a dark doorway
// at the end) with a unit running away down it. The colours are posterised
// with ordered dithering like hand pixelling. Over it the name in Alagard and
// a riveted Meridian plate with the proper bar (src/ui/hiPixel.ts drawBar),
// the step being loaded and the percentage, and a line from the institute.
//   bootLoader()          paint it into #boot (main.ts does this first thing)
//   loaderStage(k, msg)   move the bar on (0..1) and say what is happening
//   loaderText(html)      a message instead of a step (launch errors keep their button)
import { PixelCanvas, mixHex, bayer8 } from '../gfx/pixel';
import { bevel, rivet, hazard, drawBar, GUN, rect, crispCanvas, upscaleRows, rowsToCanvas, shadeSprite } from './hiPixel';

const TIPS = [
  'All units are temporary. All debts are not.',
  'Inhabitants are organisms adapted to this place. Study them before they study you.',
  'The Ledge melts what reaches it. Some things come back.',
  'A unit that stops moving is a unit that stops paying.',
  'Fluorescent hum at 60 Hz is normal. Silence is not.',
  'Dr. Calder reminds you: the band is not a bracelet.',
  'Every level has an exit. Most of them are doors.',
];

let root: HTMLElement | null = null;
let plate: { c: CanvasRenderingContext2D; W: number; H: number } | null = null;
let label: HTMLElement | null = null, pct: HTMLElement | null = null;
let target = 0.04, shown = 0, raf = 0, last = 0, t = 0;

function hsh(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 974711) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; }
function vnoise(x: number, y: number, s: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hsh(x0, y0, s), b = hsh(x0 + 1, y0, s), c = hsh(x0, y0 + 1, s), d = hsh(x0 + 1, y0 + 1, s);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
const fbm = (x: number, y: number, s: number) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
const frac = (v: number) => v - Math.floor(v);

/** the corridor, per pixel */
function paintCorridor(W: number, H: number): PixelCanvas {
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const f = H * 0.95, cx = W * 0.5 + 0.5, cy = H * 0.47;
  const HW = 1.3, CEIL = 0.95, FLOOR = 0.78, ZEND = 15.5, PAN = 2.7;
  const wallC = [0.80, 0.70, 0.40], wallD = [0.58, 0.48, 0.24], ceilC = [0.86, 0.82, 0.66], carpet = [0.56, 0.49, 0.30], base = [0.36, 0.25, 0.13];
  const LV = 9; // posterise levels per channel
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / f, dy = (y - cy) / f;
    const tw = Math.abs(dx) > 1e-5 ? HW / Math.abs(dx) : 1e9, tc = dy < 0 ? CEIL / -dy : 1e9, tf = dy > 0 ? FLOOR / dy : 1e9;
    let tt = Math.min(tw, tc, tf, ZEND);
    const X = dx * tt, Y = -dy * tt, Z = tt;
    let r = 0, g = 0, b = 0, emit = 0;
    // pools of light under the panels (they run down the middle of the ceiling)
    const pz = frac((Z - 1.4) / PAN), near = Math.exp(-(((pz - 0.5) * PAN) ** 2) * 0.55);
    const flick = Z > 9.5 && Z < 12.2 ? 0.55 : 1; // one tube far down has given up
    let light = 0.62 + 0.55 * near * flick;
    if (tt === ZEND) {
      // the end of the corridor: wallpaper with a dark doorway into somewhere else
      const door = Math.abs(X) < 0.42 && Y < 0.5;
      if (door) { const d = Math.max(0, 0.5 - Y) * 0.08; r = 0.05 + d; g = 0.045 + d; b = 0.03; light = 1; }
      else { const u = X * 3.2; const s = frac(u) < 0.07 ? 0.85 : 1; r = wallC[0] * s; g = wallC[1] * s; b = wallC[2] * s; light *= 0.85; }
      if (!door && Math.abs(X) < 0.5 && Y < 0.58 && (Math.abs(X) > 0.42 || Y > 0.5)) { r = 0.42; g = 0.34; b = 0.18; } // the frame
    } else if (tt === tw) {
      // the walls
      const u = Z * 3.0, v = Y;
      if (v < -FLOOR + 0.16) {
        const top = v > -FLOOR + 0.14;
        r = base[0] * (top ? 1.35 : 1); g = base[1] * (top ? 1.35 : 1); b = base[2] * (top ? 1.3 : 1);
        if (frac(Z * 0.9) < 0.012) { r *= 0.6; g *= 0.6; b *= 0.6; }
      } else {
        const stripe = frac(u) < 0.06 ? 0.84 : frac(u + 0.5) < 0.03 ? 0.92 : 1;
        // a faint damask: a diamond in each panel
        const du = Math.abs(frac(u) - 0.5) * 2, dv = Math.abs(frac(v * 2.4) - 0.5) * 2;
        const dam = Math.abs(du + dv - 0.62) < 0.07 ? 0.9 : 1;
        // water stains: dark rings and a tide line
        const st = fbm(Z * 0.9, v * 1.6 + (dx > 0 ? 40 : 0), 3);
        const stain = st > 0.71 ? 0.78 : st > 0.67 ? 0.9 : 1;
        const tide = v > 0.62 && fbm(Z * 2.5, 9, 5) > 0.5 ? 0.9 : 1;
        const k = stripe * dam * stain * tide;
        const mix = Math.min(1, Math.max(0, (st - 0.62) * 3));
        r = (wallC[0] * (1 - mix) + wallD[0] * mix) * k; g = (wallC[1] * (1 - mix) + wallD[1] * mix) * k; b = (wallC[2] * (1 - mix) + wallD[2] * mix) * k;
      }
      // the walls catch more of the light near the ceiling
      light *= 0.82 + 0.18 * Math.max(0, (Y + FLOOR) / (CEIL + FLOOR));
    } else if (tt === tc) {
      // ceiling tiles and the light panels
      const inPanel = Math.abs(X) < 0.36 && Math.abs(pz - 0.5) * PAN < 0.5;
      if (inPanel) {
        const grid = frac(X * 5) < 0.12 || frac(Z * 3) < 0.1;
        r = 1; g = 0.98; b = 0.86; emit = (grid ? 0.65 : 1) * flick; light = 1;
      } else {
        const line = frac((X + 10) / 0.62) < 0.035 * Z ** 0.5 || frac(Z / 0.62) < 0.03 * Z ** 0.5;
        const pock = hsh(Math.floor(X * 40), Math.floor(Z * 40), 9) > 0.92 ? 0.9 : 1;
        const sag = fbm(X * 2, Z * 0.7, 21) > 0.68 ? 0.82 : 1;
        r = ceilC[0] * (line ? 0.78 : pock) * sag; g = ceilC[1] * (line ? 0.78 : pock) * sag; b = ceilC[2] * (line ? 0.76 : pock) * sag;
        light = 0.7 + 0.45 * near * flick;
      }
    } else {
      // the damp carpet
      const n = hsh(Math.floor(X * 60), Math.floor(Z * 30), 4);
      const wet = fbm(X * 1.4, Z * 0.5, 11);
      const k = (0.92 + n * 0.12) * (wet > 0.7 ? 0.74 : wet > 0.66 ? 0.86 : 1);
      r = carpet[0] * k; g = carpet[1] * k; b = carpet[2] * k * (wet > 0.7 ? 1.08 : 1);
      // the panels reflect faintly in the wet patches
      if (wet > 0.7 && Math.abs(X) < 0.3 && near > 0.85) { r += 0.12; g += 0.11; b += 0.08; }
    }
    // distance haze (warm, yellow-brown) and a vignette
    const fog = Math.exp(-Z * 0.055);
    const vx = (x / W - 0.5) * 2, vy = (y / H - 0.5) * 2, vig = 1 - 0.22 * (vx * vx * 0.6 + vy * vy * 0.8);
    const L = (light * fog + (1 - fog) * 0.5) * vig;
    r = (r * L + emit * 0.25) + (1 - fog) * 0.3; g = (g * L + emit * 0.24) + (1 - fog) * 0.25; b = (b * L + emit * 0.18) + (1 - fog) * 0.1;
    // posterise with an ordered dither
    const d = bayer8(x, y) - 0.5;
    const q = (v: number) => Math.max(0, Math.min(255, Math.round(Math.round(Math.max(0, Math.min(1, v)) * LV + d * 0.9) / LV * 255)));
    pc.setRGBA(x, y, q(r), q(g), q(b), 255);
  }
  // light glow round the near panels' edges (a few soft pixels, dithered)
  return pc;
}

/** a unit running away down the corridor (a little silhouette with a rim of light) */
const RUNNER = [
  '....aa....',
  '...abba...',
  '...abba...',
  '....aa....',
  '..aaaaaa..',
  '.abbbbbba.',
  'ab.abbabba',
  'b..abba.ab',
  '...abba...',
  '...abba...',
  '..abbbba..',
  '..ab..ba..',
  '.ab....ba.',
  '.ab.....b.',
  'ab......ab',
  'b........b',
];
function paintRunner(pc: PixelCanvas) {
  const H = pc.h, f = H * 0.95, cy = H * 0.47;
  const Z = 11.6, hgt = (1.25 / Z) * f;
  const k = Math.max(1, Math.round(hgt / RUNNER.length));
  const rows = upscaleRows(RUNNER, k);
  const sp = rowsToCanvas(rows, { a: 0x2a2418, b: 0x15120c }, 2);
  shadeSprite(sp, { outline: 0, inner: false, light: 0.6, bevel: 2 });
  const fy = Math.round(cy + (0.78 / Z) * f), fx = Math.round(pc.w * 0.5 + (0.18 / Z) * f);
  pc.blit(sp, fx - Math.floor(sp.w / 2), fy - sp.h + 2);
  // its shadow on the carpet
  for (let i = -Math.round(sp.w * 0.35); i <= Math.round(sp.w * 0.35); i++) { const x = fx + i, y = fy; if (x >= 0 && x < pc.w && y < pc.h) pc.set(x, y, mixHex(pc.get(x, y), 0x000000, 0.4)); }
}

function drawPlate() {
  if (!plate) return;
  const { c, W, H } = plate;
  c.clearRect(0, 0, W, H);
  rect(c, 3, H - 3, W - 4, 3, 0x000000, 0.4);
  bevel(c, 1, 1, W - 3, H - 5, GUN.slice(2, 9), { chamfer: 3 });
  for (let y = 4; y < H - 8; y += 3) for (let x = 8 + ((y * 5) % 9); x < W - 10; x += 13) rect(c, x, y, 5, 1, GUN[6], 0.2);
  rect(c, 12, 21, W - 24, 1, GUN[1]); rect(c, 12, 22, W - 24, 1, GUN[7], 0.6);
  hazard(c, 6, 27, 5, 13, 0xe8b52a, 0x17150f, 6, 0);
  hazard(c, W - 12, 27, 5, 13, 0xe8b52a, 0x17150f, 6, 3);
  rivet(c, 7, 7, 2, true); rivet(c, W - 9, 7, 2, true); rivet(c, 7, H - 10, 2, true); rivet(c, W - 9, H - 10, 2, true);
  drawBar(c, 16, 28, W - 33, 11, shown, { t, cell: 6, gap: 1, ticks: true });
  const on = Math.floor(t * 2.5) % 2 === 0;
  rect(c, 15, 8, 7, 7, 0x07060a); rect(c, 16, 9, 5, 5, on ? 0xf2ad32 : 0x6e3608); rect(c, 16, 9, 2, 1, on ? 0xfff0bc : 0xa65a10);
}

function tick(now: number) {
  if (!root || !root.isConnected || root.classList.contains('gone') || !plate) { raf = 0; return; }
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now; t += dt;
  // creep on while waiting (never to the end on its own)
  if (target < 0.92) target = Math.min(0.92, target + dt * 0.012);
  shown += (target - shown) * Math.min(1, dt * 4);
  if (pct) pct.textContent = Math.floor(shown * 100) + '%';
  drawPlate();
}

/** paint the loading screen into #boot */
export function bootLoader(msg = 'Waking the unit') {
  const b = document.getElementById('boot');
  if (!b || b.classList.contains('gone')) return;
  root = b;
  b.classList.add('ld13');
  const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
  const s = Math.max(1, Math.round(Math.min(vw / 640, vh / 360)));
  const W = Math.ceil(vw / s), H = Math.ceil(vh / s);
  let art: HTMLCanvasElement | null = null;
  try {
    const pc = paintCorridor(W, H);
    paintRunner(pc);
    art = document.createElement('canvas'); art.width = W; art.height = H; art.className = 'ld-art';
    art.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
    art.style.width = W * s + 'px'; art.style.height = H * s + 'px';
  } catch (e) { console.warn('loader art', e); }
  const PW = Math.min(520, vw - 40), PH = 50;
  const { cv, c } = crispCanvas(PW, PH);
  plate = { c, W: PW, H: PH };
  b.innerHTML = '';
  if (art) b.append(art);
  const title = document.createElement('div'); title.className = 'ld-title'; title.textContent = 'Limbo Phobia';
  const sub = document.createElement('div'); sub.className = 'ld-sub'; sub.textContent = 'Meridian Institute · Remittance Programme';
  const wrap = document.createElement('div'); wrap.className = 'ld-plate'; wrap.style.width = PW + 'px'; wrap.style.height = PH + 'px';
  label = document.createElement('b'); label.className = 'ld-msg';
  pct = document.createElement('i'); pct.className = 'ld-pct';
  wrap.append(cv, label, pct);
  const tip = document.createElement('div'); tip.className = 'ld-tip'; tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const bottom = document.createElement('div'); bottom.className = 'ld-bottom'; bottom.append(wrap, tip);
  b.append(title, sub, bottom);
  label.textContent = msg + '…';
  drawPlate();
  if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
}

/** move the bar on and say what is loading */
export function loaderStage(k: number, msg?: string) {
  if (!root || root.classList.contains('gone')) return;
  target = Math.max(target, Math.min(1, k));
  if (msg && label) label.textContent = msg + '…';
}

/** a plain message in the loading screen (keeps the painting; html may hold a button) */
export function loaderText(html: string) {
  const b = document.getElementById('boot');
  if (!b) return false;
  b.classList.remove('gone');
  if (!b.classList.contains('ld13')) bootLoader();
  let m = b.querySelector('.ld-note') as HTMLElement | null;
  if (!m) { m = document.createElement('div'); m.className = 'ld-note'; b.querySelector('.ld-bottom')?.prepend(m); }
  m.innerHTML = html;
  return true;
}

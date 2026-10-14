// Zone props for Westgate Mall, Foodland and Parking Level P∞: store fascia
// signs, roll-down shutter wallpaper, garage pillars with painted level
// numbers, a ramp up to a level that is closed, cinema screens, hanging aisle
// signs, the mall directory and painted floor markings.
// Texture prefix: zg_
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, makeRamp, mixHex, scaleHex, ph } from '../../gfx/pixel';
import { txt, txtW } from './a_lib';

const T = ['zg', 'mall'];
const WZ = -0.44; // wall face (0.12 m walls) in model space at rot 0
const WH = 86;    // wall texture height in px (2.7 m)
const yAt = (m: number) => Math.round(WH - m * 32);

// ---------------------------------------------------------------- text with a few extra glyphs
const EXTRA: Record<string, string[]> = {
  '∞': ['.....', '.X.X.', 'X.X.X', '.X.X.', '.....'],
  '→': ['..X..', '...X.', 'XXXXX', '...X.', '..X..'],
  '←': ['..X..', '.X...', 'XXXXX', '.X...', '..X..'],
  '↑': ['..X..', '.XXX.', 'X.X.X', '..X..', '..X..'],
  '↓': ['..X..', '..X..', 'X.X.X', '.XXX.', '..X..'],
  '·': ['.', '.', 'X', '.', '.'],
};
function glyphW(ch: string) { return EXTRA[ch] ? EXTRA[ch][0].length : txtW(ch); }
export function zgTextW(s: string, scale = 1) {
  let w = 0;
  for (const ch of s) w += (glyphW(ch) + 1) * scale;
  return Math.max(0, w - scale);
}
export function zgText(pc: PixelCanvas, s: string, x: number, y: number, c: number, scale = 1) {
  let cx = x;
  for (const ch of s) {
    const g = EXTRA[ch];
    if (g) {
      for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === 'X')
        for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) pc.set(cx + i * scale + a, y + j * scale + b, c);
    } else if (ch !== ' ') txt(pc, ch, cx, y, c, 1, scale);
    cx += (glyphW(ch) + 1) * scale;
  }
  return cx;
}
const zgTextC = (pc: PixelCanvas, s: string, cx: number, y: number, c: number, scale = 1) => zgText(pc, s, Math.round(cx - zgTextW(s, scale) / 2), y, c, scale);

// ---------------------------------------------------------------- fascia signs
interface Fascia { lines: string[]; bg: number; fg: number; trim?: number; worn?: boolean; mark?: 'cross' | 'heart' | 'star' | 'film' }
/** store / entrance names that the `zg_fascia` sign can show (state.label) */
export const ZG_FASCIA: Record<string, Fascia> = {
  pretzel: { lines: ['PRETZEL HUT'], bg: 0xb8402a, fg: 0xfff0c0, trim: 0xf0c040 },
  dawns: { lines: ["DAWN'S SHOES"], bg: 0xf4d8e2, fg: 0x8a2a5a, trim: 0xc87a9a },
  hallmark: { lines: ['HALLMARK OF', 'THE HEART'], bg: 0x7a1a2a, fg: 0xf8e0c0, trim: 0xe8b860, mark: 'heart' },
  worn: { lines: ['ST  RE  NAM'], bg: 0x56565a, fg: 0xb8b4a8, trim: 0x3a3a3e, worn: true },
  mode: { lines: ['MODE'], bg: 0x18181c, fg: 0xf4f4f0, trim: 0xd8d8d8 },
  apparel: { lines: ['WESTGATE', 'APPAREL'], bg: 0x2a3a5a, fg: 0xf0e8d8, trim: 0xc8a050 },
  toys: { lines: ['TOYTOWN'], bg: 0xf0c830, fg: 0xd02a2a, trim: 0x2a6ad0, mark: 'star' },
  electro: { lines: ['SOUNDWAVE', 'ELECTRONICS'], bg: 0x101830, fg: 0x40e0f0, trim: 0xf040a0 },
  books: { lines: ['PAGES', 'BOOKSELLERS'], bg: 0x2a4a2a, fg: 0xf0e8c8, trim: 0xc8a050 },
  sports: { lines: ['SPORT ZONE'], bg: 0x1a5ab0, fg: 0xffffff, trim: 0xf0c020 },
  pharmacy: { lines: ['PHARMACY'], bg: 0xf4f4f0, fg: 0x1a8a4a, trim: 0x1a8a4a, mark: 'cross' },
  photo: { lines: ['1 HOUR', 'PHOTO'], bg: 0xf0d020, fg: 0x1a1a1a, trim: 0xd02020 },
  arcade: { lines: ['VOID ARCADE'], bg: 0x140a2a, fg: 0xf050c0, trim: 0x40f0f0 },
  music: { lines: ['MUSIC BOX'], bg: 0xe8e0f0, fg: 0x6a4a9a, trim: 0xc8b0e0, mark: 'star' },
  jewel: { lines: ['GOLD & CO'], bg: 0x1a1a1a, fg: 0xe0b840, trim: 0xe0b840 },
  pets: { lines: ['PET PALACE'], bg: 0x5ab0a0, fg: 0xfffff0, trim: 0x2a6a60 },
  candy: { lines: ['SWEET TOOTH'], bg: 0xf8c8d8, fg: 0xd02a6a, trim: 0x8ad0f0 },
  gifts: { lines: ['CARDS & GIFTS'], bg: 0xf8f0e0, fg: 0x8a3a6a, trim: 0xd8a0c0 },
  kids: { lines: ['KIDS KORNER'], bg: 0x8ad0f0, fg: 0xf8f8f0, trim: 0xf0c040 },
  optical: { lines: ['EYE SEE', 'OPTICAL'], bg: 0xf0f4f8, fg: 0x2a4a8a, trim: 0x8aa0c8 },
  cinema: { lines: ['CINEMA 6'], bg: 0x2a0a10, fg: 0xf8d060, trim: 0xd83040, mark: 'film' },
  foodcourt: { lines: ['FOOD COURT'], bg: 0xf0e8d8, fg: 0xc0402a, trim: 0x5aa69e },
  foodland: { lines: ['FOODLAND'], bg: 0xc0262a, fg: 0xfff8e8, trim: 0xf0c040 },
  restrooms: { lines: ['RESTROOMS'], bg: 0x2a3a4a, fg: 0xe8f0f8, trim: 0x8aa0b0 },
  info: { lines: ['INFORMATION'], bg: 0x1a6a9a, fg: 0xffffff, trim: 0xe8f0f8 },
  security: { lines: ['MALL SECURITY'], bg: 0x2a2a30, fg: 0xd8d8d0, trim: 0x8a8a90 },
  splash: { lines: ['SPLASH WORLD', '→ WATER PARK'], bg: 0x2a8ac8, fg: 0xffffff, trim: 0xf0e060 },
  parking: { lines: ['PARKING', 'LEVEL P1-P∞'], bg: 0x1a3a8a, fg: 0xffffff, trim: 0xf0c020 },
  level2: { lines: ['LEVEL 2', 'NOT OPEN'], bg: 0x3a3a40, fg: 0xf0d080, trim: 0x8a8a90 },
  staff: { lines: ['STAFF ONLY'], bg: 0x5a5a5e, fg: 0xf0f0e8, trim: 0x2a2a2e },
  mall: { lines: ['WESTGATE MALL'], bg: 0xe7bcc1, fg: 0x5a3a7a, trim: 0x5aa69e },
  hospital: { lines: ['ST. ALDRIC', 'EMERGENCY'], bg: 0xd8e8e0, fg: 0xc02a2a, trim: 0xc02a2a, mark: 'cross' },
  deliveries: { lines: ['FOODLAND', 'DELIVERIES'], bg: 0xc0262a, fg: 0xfff8e8, trim: 0x2a2a2e },
  stairs: { lines: ['STAIRS', 'LEVEL P2'], bg: 0x1e6a3a, fg: 0xffffff, trim: 0xf0f0e8 },
  exit: { lines: ['EXIT →'], bg: 0x1e7a3a, fg: 0xffffff, trim: 0xf0f0e8 },
  noexit: { lines: ['NO EXIT'], bg: 0xc02a2a, fg: 0xffffff, trim: 0xf0f0e8 },
  p0: { lines: ['↑ P0', 'CLOSED'], bg: 0xf0c020, fg: 0x1a1a1a, trim: 0x1a1a1a },
  down: { lines: ['↓ P∞', 'ALL LEVELS'], bg: 0x1a3a8a, fg: 0xffffff, trim: 0xf0c020 },
  alder: { lines: ['ALDER LANE', 'ESTATES →'], bg: 0x2a6a3a, fg: 0xffffff, trim: 0xf0f0e8 },
  full: { lines: ['LEVEL FULL'], bg: 0x1a1a1a, fg: 0xf04030, trim: 0x5a5a5e },
  office: { lines: ['MANAGEMENT'], bg: 0xe8e0d0, fg: 0x3a3a3a, trim: 0x8a7a6a },
  bakery: { lines: ['BAKERY'], bg: 0xf0e0c0, fg: 0x8a4a1a, trim: 0xc89050 },
  deli: { lines: ['DELI & MEAT'], bg: 0x8a1a1a, fg: 0xfff0e0, trim: 0xf0f0e8 },
  produce: { lines: ['FRESH PRODUCE'], bg: 0x3a7a2a, fg: 0xfff8d0, trim: 0xf0c040 },
  frozen: { lines: ['FROZEN FOODS'], bg: 0x2a6ab0, fg: 0xffffff, trim: 0xb8e0f8 },
  dairy: { lines: ['DAIRY'], bg: 0xf4f4ff, fg: 0x2a4a9a, trim: 0x2a4a9a },
  service: { lines: ['CUSTOMER', 'SERVICE'], bg: 0xc0262a, fg: 0xfff8e8, trim: 0xf0c040 },
  warehouse: { lines: ['WAREHOUSE', 'STAFF ONLY'], bg: 0x3a3a3e, fg: 0xf0c040, trim: 0xf0c040 },
  checkout: { lines: ['CHECKOUT'], bg: 0xc0262a, fg: 0xfff8e8, trim: 0xf0c040 },
};

const FX_W = 64, FX_H = 13;
function drawFascia(pc: PixelCanvas, f: Fascia) {
  pc.wrap = false;
  const R = makeRamp(f.bg, 5, { spread: 0.18 });
  for (let y = 0; y < FX_H; y++) for (let x = 0; x < FX_W; x++) {
    const n = ph(x >> 2, y >> 1, 77);
    pc.set(x, y, n < 0.2 ? R[1] : n > 0.85 ? R[3] : R[2]);
  }
  const tr = f.trim ?? scaleHex(f.bg, 0.6);
  for (let x = 0; x < FX_W; x++) { pc.set(x, 0, mixHex(tr, 0xffffff, 0.2)); pc.set(x, FX_H - 1, scaleHex(tr, 0.7)); }
  for (let y = 0; y < FX_H; y++) { pc.set(0, y, tr); pc.set(FX_W - 1, y, scaleHex(tr, 0.75)); }
  const two = f.lines.length > 1;
  const markW = f.mark ? 8 : 0;
  const cx = FX_W / 2 + markW / 2;
  if (two) {
    zgTextC(pc, f.lines[0], cx, 1, f.fg); zgTextC(pc, f.lines[1], cx, 7, mixHex(f.fg, f.bg, 0.15));
  } else zgTextC(pc, f.lines[0], cx, 4, f.fg);
  if (f.mark) {
    const mx = Math.round(cx - Math.max(...f.lines.map((l) => zgTextW(l))) / 2) - 7, my = 3;
    const c = f.mark === 'cross' ? 0x1a9a4a : f.mark === 'heart' ? 0xe04060 : f.mark === 'film' ? 0xe8e0d0 : f.fg;
    if (f.mark === 'cross') { pc.rect(mx + 2, my, 2, 6, c); pc.rect(mx, my + 2, 6, 2, c); }
    else if (f.mark === 'heart') { for (const [dx, dy] of [[1, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [1, 3], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4]]) pc.set(mx + dx, my + 1 + dy, c); }
    else if (f.mark === 'film') { pc.rect(mx, my, 6, 7, 0x1a1a1a); for (let y = my; y < my + 7; y += 2) { pc.set(mx, y, c); pc.set(mx + 5, y, c); } }
    else { for (const [dx, dy] of [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [3, 3], [0, 4], [4, 4]]) pc.set(mx + dx + 1, my + 1 + dy, c); }
  }
  if (f.worn) {
    // the letters have mostly fallen off; their ghosts are cleaner than the board
    for (let i = 0; i < 40; i++) pc.blend(Math.floor(ph(i, 1, 81) * FX_W), 2 + Math.floor(ph(i, 2, 81) * 9), 0x2a2a2e, 0.4);
    for (let x = 6; x < FX_W - 6; x += 9) pc.rect(x, 3, 3, 6, mixHex(f.bg, 0xffffff, 0.12));
  } else {
    // grime along the bottom edge, sun-fade on the top
    for (let x = 1; x < FX_W - 1; x++) { pc.blend(x, FX_H - 2, 0x1a1a1a, 0.25); pc.blend(x, 1, 0xffffff, 0.08); }
  }
}

// ---------------------------------------------------------------- garage pillar labels
export const ZG_PILLAR_LABELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P0', 'P13', 'P∞', '?', '-1', 'B4', 'P'];
const PL_W = 26;

function concreteFill(pc: PixelCanvas, base: number, seed: number) {
  const R = makeRamp(base, 5, { spread: 0.2, hueShift: 0.02 });
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = ph(x >> 1, y >> 1, seed) * 0.6 + ph(x >> 3, y >> 3, seed + 1) * 0.4;
    pc.set(x, y, n < 0.3 ? R[1] : n > 0.72 ? R[3] : R[2]);
  }
  return R;
}

function drawPillar(pc: PixelCanvas, label: string, seed: number) {
  pc.wrap = false;
  const R = concreteFill(pc, 0x8e8b84, 900 + seed);
  // hazard band at the foot (bumpers hit it)
  const b0 = yAt(0.55), b1 = WH;
  for (let y = b0; y < b1; y++) for (let x = 0; x < PL_W; x++) {
    const s = Math.floor((x + (WH - y)) / 4) % 2;
    pc.set(x, y, s ? 0x1e1c1a : 0xe0b030);
    if (ph(x, y, seed + 3) < 0.08) pc.set(x, y, R[2]);
  }
  for (let x = 0; x < PL_W; x++) { pc.set(x, b0, 0xf0d060); pc.blend(x, b1 - 1, 0x1a1a1a, 0.5); }
  // painted label panel
  const p0 = yAt(2.05), p1 = yAt(1.25);
  const panel = label === '?' || label === 'P13' ? 0xe8e4dc : label === 'P∞' ? 0x2a5ab8 : 0xf0c020;
  const ink = label === 'P∞' ? 0xf8f8f0 : 0x1a1816;
  for (let y = p0; y < p1; y++) for (let x = 2; x < PL_W - 2; x++) pc.set(x, y, ph(x, y, seed + 5) < 0.06 ? mixHex(panel, R[2], 0.5) : panel);
  const sc = zgTextW(label, 2) <= PL_W - 6 ? 2 : 1;
  zgTextC(pc, label, PL_W / 2, Math.round((p0 + p1) / 2 - 2.5 * sc), ink, sc);
  // a stencilled arrow toward the exit (which is never where it points)
  zgTextC(pc, '→', PL_W / 2, p1 + 4, 0xf0f0e8, 1);
  zgText(pc, 'EXIT', 6, p1 + 11, 0xe8e4d8, 1);
  // tyre rubber and water streaks
  for (let i = 0; i < 5; i++) { const x = Math.floor(ph(i, seed, 13) * PL_W); for (let y = 2; y < 18 + i * 3; y++) pc.blend(x, y, R[0], 0.18); }
  for (let x = 0; x < PL_W; x++) pc.blend(x, 0, 0x1a1a1a, 0.3);
}

// ---------------------------------------------------------------- aisle signs
export const ZG_AISLE_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '0', '∞', '?'];
export const ZG_AISLE_CATS = ['CANNED', 'DRY GOODS', 'SNACKS', 'DRINKS', 'HOUSEHOLD', 'CEREAL', 'BAKING', 'PASTA', 'SOUP', 'PET FOOD', 'BABY', 'HEALTH', 'PAPER', 'FROZEN', 'SEASONAL', 'BREAD', 'CANDY', 'COFFEE', 'NOTHING', 'MIA'];

// ---------------------------------------------------------------- textures
addTextureModule(() => {
  const A = atlas();
  for (const [k, f] of Object.entries(ZG_FASCIA)) A.add('zg_fx_' + k, FX_W, FX_H, (pc) => drawFascia(pc, f));
  ZG_PILLAR_LABELS.forEach((L, i) => A.add('zg_pl_' + i, PL_W, WH, (pc) => drawPillar(pc, L, i * 7)));
  A.add('zg_pl_top', 16, 16, (pc) => { concreteFill(pc, 0x7a7872, 951); });

  // roll-down store shutters (wallpaper for the mall side of a closed storefront)
  for (const [name, tagged] of [['zg_wall_shutter', false], ['zg_wall_shutter_b', true]] as const) {
    A.add(name, 32, WH, (pc) => {
      const S = makeRamp(0xa4a8ac, 5, { spread: 0.32 });
      const top = yAt(2.2);
      // fascia band / housing
      for (let y = 0; y < top; y++) for (let x = 0; x < 32; x++) pc.set(x, y, y < 2 ? 0x2a2830 : y >= top - 4 ? (y === top - 4 ? 0x8a8e92 : 0x6a6e72) : 0x34323a);
      for (let x = 0; x < 32; x++) pc.set(x, top - 1, 0x4a4e52);
      // slats
      for (let y = top; y < WH - 3; y++) {
        const k = (y - top) % 3;
        for (let x = 0; x < 32; x++) {
          let c = k === 0 ? S[4] : k === 1 ? S[2] : S[1];
          if (ph(x >> 2, y, 931) < 0.05) c = S[3];
          pc.set(x, y, c);
        }
      }
      // dents and dirt toward the bottom
      for (let i = 0; i < 9; i++) { const x = Math.floor(ph(i, 1, 932) * 30), y = WH - 6 - Math.floor(ph(i, 2, 932) * 22); pc.blend(x, y, 0x3a3a3e, 0.35); pc.blend(x + 1, y, 0x3a3a3e, 0.25); }
      for (let y = WH - 22; y < WH - 3; y++) for (let x = 0; x < 32; x++) pc.blend(x, y, 0x4a4438, (y - (WH - 22)) / 19 * 0.25);
      // bottom bar with a lock eye
      for (let y = WH - 3; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, y === WH - 3 ? 0xb8bcc0 : 0x5a5e62);
      pc.rect(14, WH - 5, 4, 2, 0x2a2a2e); pc.set(15, WH - 5, 0xd8b040);
      if (tagged) {
        // half a spray-painted word, carried over from the next tile
        const c = 0x3a6ad0;
        for (const [x, y] of [[3, 50], [4, 49], [5, 49], [6, 50], [6, 51], [5, 52], [4, 53], [3, 54], [4, 55], [5, 55], [6, 55], [10, 49], [10, 50], [10, 51], [10, 52], [10, 53], [10, 54], [10, 55], [11, 55], [12, 55], [16, 49], [16, 50], [16, 51], [16, 52], [16, 53], [16, 54], [17, 49], [18, 50], [18, 51], [17, 52], [17, 53], [18, 54], [18, 55]]) { pc.set(x, y, c); pc.blend(x + 1, y + 1, c, 0.3); }
        for (let i = 0; i < 4; i++) for (let y = 56; y < 60 + i * 2; y++) pc.blend(4 + i * 4, y, c, 0.5);
      }
    }, 1, 2.7);
  }

  // ramp deck: concrete with a painted arrow pointing up the slope
  A.add('zg_ramp_top', 32, 32, (pc) => {
    concreteFill(pc, 0x8a877f, 961);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const head = y >= 3 && y <= 13 && Math.abs(x + 0.5 - 16) <= (y - 3) * 0.8 + 0.5;
      const shaft = y > 13 && y <= 28 && x >= 14 && x <= 17;
      if ((head || shaft) && ph(x, y, 962) > 0.12) pc.set(x, y, 0xe8e4d8);
    }
    for (let y = 0; y < 32; y += 4) { pc.set(0, y, 0x5a5850); pc.set(31, y + 2, 0x5a5850); }
  });

  // cinema screen: pale and blank / pale and full of snow
  A.add('zg_screen', 48, 24, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
      const d = Math.hypot((x - 24) / 26, (y - 12) / 13);
      pc.set(x, y, mixHex(0xf4f6ff, 0xa8b0c8, Math.min(1, d * d * 0.8)));
    }
  });
  A.add('zg_screen_static', 48, 24, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
      const n = ph(x, y, 971);
      pc.set(x, y, n < 0.33 ? 0x3a3a44 : n < 0.66 ? 0x9a9aa8 : 0xe8e8f0);
    }
    for (let x = 0; x < 48; x++) { pc.blend(x, 9, 0xffffff, 0.6); pc.blend(x, 10, 0x000000, 0.4); }
    // a figure, almost: a small dark shape in the middle of the snow
    for (const [x, y] of [[23, 10], [24, 10], [23, 11], [24, 11], [22, 12], [23, 12], [24, 12], [25, 12], [23, 13], [24, 13], [23, 14], [24, 14], [22, 15], [25, 15]]) pc.set(x, y, 0x101014);
  });

  // aisle sign faces
  ZG_AISLE_LABELS.forEach((L, i) => A.add('zg_ain_' + i, 24, 11, (pc) => {
    pc.wrap = false;
    pc.fill(0xc0262a);
    for (let x = 0; x < 24; x++) { pc.set(x, 0, 0xe04a40); pc.set(x, 10, 0x8a1a1a); }
    zgText(pc, 'AISLE', 2, 3, 0xfff0e0, 1);
    zgTextC(pc, L, 18, 1, 0xffffff, zgTextW(L, 2) <= 10 ? 2 : 1);
  }));
  ZG_AISLE_CATS.forEach((c, i) => A.add('zg_aic_' + i, 48, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0xf4f0e6);
    for (let x = 0; x < 48; x++) pc.set(x, 6, 0xc8c0b0);
    zgTextC(pc, c, 24, 1, 0x2a2a2e, 1);
  }));

  // the mall directory: a backlit plan with YOU ARE HERE in red (in several places)
  A.add('zg_dir_map', 24, 36, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a2a3a);
    zgTextC(pc, 'WESTGATE', 12, 1, 0xf0e8d8, 1);
    const cols = [0xe7bcc1, 0x84c2ba, 0xf0d080, 0xa8c0e8, 0xc8b0e0, 0xf0a880];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      if ((r === 2 || r === 3) && (c === 1 || c === 2)) continue;
      pc.rect(2 + c * 5, 8 + r * 4, 4, 3, cols[(r * 4 + c) % cols.length]);
    }
    pc.rect(7, 16, 9, 7, 0x5aa69e); pc.set(11, 19, 0xf0f8ff);
    for (const [x, y] of [[4, 33], [12, 18], [19, 10], [3, 12]]) { pc.set(x, y, 0xff2020); pc.set(x + 1, y, 0xff6060); }
    for (let x = 1; x < 23; x++) pc.set(x, 32, 0x3a4a5a);
  });
  A.add('zg_dir_back', 16, 24, (pc) => {
    pc.wrap = false;
    pc.fill(0xe7bcc1);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) if ((x + y) % 7 === 0) pc.set(x, y, 0xd8a8b0);
    for (let x = 0; x < 16; x++) { pc.set(x, 10, 0x8d6aa6); pc.set(x, 11, 0x5aa69e); }
  });

  // painted floor markings (transparent decals)
  const paint = (pc: PixelCanvas, x: number, y: number, c: number, seed: number) => {
    if (ph(x, y, seed) < 0.13) return;
    pc.set(x, y, ph(x, y, seed + 1) < 0.2 ? scaleHex(c, 0.88) : c, 225);
  };
  const paintText = (name: string, w: number, h: number, s: string, c: number, scale: number) => A.add(name, w, h, (pc) => {
    pc.wrap = false; pc.clear();
    const tmp = new PixelCanvas(w, h); tmp.wrap = false; tmp.clear();
    zgTextC(tmp, s, w / 2, Math.round((h - 5 * scale) / 2), 0xffffff, scale);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tmp.alpha(x, y) > 0) paint(pc, x, y, c, 991 + name.length);
  });
  paintText('zg_dc_exit', 40, 12, 'EXIT →', 0xece8dc, 2);
  paintText('zg_dc_pinf', 24, 12, 'P∞', 0xf0c830, 2);
  paintText('zg_dc_slow', 32, 12, 'SLOW', 0xece8dc, 2);
  paintText('zg_dc_stop', 32, 12, 'STOP', 0xece8dc, 2);
  paintText('zg_dc_mia', 32, 12, 'MIA', 0xe8a0b8, 2);
  A.add('zg_dc_hatch', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const edge = x < 2 || y < 2 || x > 29 || y > 29;
      if (edge || (x + y) % 10 < 3) paint(pc, x, y, 0xe8c030, 997);
    }
  });
  // terrazzo inlay under the fountain: an eight-point star in brass and pastel stone
  A.add('zg_dc_star', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - 16, dy = y + 0.5 - 16, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const star = r < 6 + 9 * Math.pow(Math.abs(Math.cos(a * 4)), 6);
      const ring = Math.abs(r - 14) < 0.8;
      if (ring) pc.set(x, y, 0xc8a050, 235);
      else if (star) pc.set(x, y, Math.cos(a * 4) > 0 ? 0xe7bcc1 : 0x84c2ba, 225);
      if (star && Math.abs(r - (6 + 9 * Math.pow(Math.abs(Math.cos(a * 4)), 6))) < 0.9) pc.set(x, y, 0xc8a050, 235);
    }
  });
});

// ---------------------------------------------------------------- objects
defObj({
  key: 'zg_fascia', name: 'Store Sign', w: 3, d: 1, height: 2.7, block: 'none', onWall: true,
  sound: 'metal', hp: 400, flammable: 0.2,
  desc: 'A store sign above a storefront. The letters were cleaned recently. The glass under them was not.',
  tags: [...T, 'sign', 'wall'],
  variant: (s) => String(s.label ?? 'worn') + (s.lit ? '+' : ''),
  model: (mb, s) => {
    const k = ZG_FASCIA[s.label] ? s.label : 'worn';
    mb.box(0, 2.1, WZ + 0.05, 2.86, 0.5, 0.1, { south: 'zg_fx_' + k, all: 'metal_dark' }, { fit: { south: true }, emissive: s.lit ? 0.75 : 0 });
    mb.box(0, 2.07, WZ + 0.05, 2.9, 0.03, 0.12, 'metal_brushed');
    mb.box(0, 2.6, WZ + 0.05, 2.9, 0.03, 0.12, 'metal_brushed');
  },
});

defObj({
  key: 'zg_park_pillar', name: 'Concrete Column', w: 1, d: 1, height: 2.7, block: 'solid', movable: 0,
  sound: 'metal', hp: 99999,
  desc: 'A square concrete column with the level painted on it. You are fairly sure it said something else a minute ago.',
  tags: [...T, 'parking', 'column'],
  variant: (s) => String(s.label ?? 'P∞'),
  model: (mb, s) => {
    const i = Math.max(0, ZG_PILLAR_LABELS.indexOf(String(s.label ?? 'P∞')));
    const t = 'zg_pl_' + i;
    mb.box(0, 0, 0, 0.8, 2.7, 0.8, { south: t, north: t, east: t, west: t, top: 'zg_pl_top', bottom: 'zg_pl_top' }, { fit: { south: true, north: true, east: true, west: true } });
    // chamfered corner guards
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) mb.box(x, 0, z, 0.06, 0.55, 0.06, 'q_hazard');
  },
});

defObj({
  key: 'zg_ramp_up', name: 'Ramp Up', w: 4, d: 6, height: 2.7, block: 'solid', tall: true, movable: 0,
  sound: 'metal', hp: 99999,
  desc: 'A ramp up to the level above. It rises into the slab and stops. Someone has painted the arrow anyway.',
  tags: [...T, 'parking', 'ramp'],
  model: (mb) => {
    mb.wedge(0, 0, 0, 3.3, 6, 2.68, 0.04, { top: 'zg_ramp_top', all: 'concrete' });
    for (const sx of [-1, 1]) {
      mb.wedge(sx * 1.8, 0, 0, 0.3, 6, 2.7, 0.35, { top: 'q_hazard', all: 'concrete' });
      mb.box(sx * 1.8, 2.7, -2.6, 0.3, 0.02, 0.8, 'concrete');
    }
    // the slab edge it disappears into
    mb.box(0, 2.35, -2.85, 4.0, 0.35, 0.3, 'concrete', { color: 0x9a978f });
    mb.box(0, 2.3, -2.68, 3.9, 0.06, 0.04, 'q_hazard');
  },
});

defObj({
  key: 'zg_cinema_screen', name: 'Cinema Screen', w: 5, d: 1, height: 2.7, block: 'none', onWall: true, movable: 0,
  power: true, sound: 'fabric', hp: 300, flammable: 0.7,
  light: { color: 0xc8d4ff, intensity: 0.55, radius: 7, y: 1.5, kind: 'screen', power: true, flicker: 0.04 },
  desc: 'A cinema screen, faintly lit, as if the film ended a second ago and the projector has not noticed.',
  tags: [...T, 'cinema', 'wall'],
  variant: (s) => (s.static ? 'static' : 'blank') + (s.on === false || s.unpowered ? '0' : '1'),
  model: (mb, s) => {
    const lit = !(s.on === false || s.unpowered);
    mb.box(0, 0.45, WZ + 0.03, 4.9, 2.15, 0.04, 'plastic_black');
    mb.box(0, 0.55, WZ + 0.06, 4.6, 1.95, 0.02, s.static ? 'zg_screen_static' : 'zg_screen', { fit: true, emissive: lit ? 0.7 : 0.05 });
    for (const sx of [-1, 1]) mb.box(sx * 2.42, 0.0, WZ + 0.12, 0.26, 2.68, 0.16, 'curtain', { color: 0x8a1a24 });
    mb.box(0, 2.45, WZ + 0.12, 5.0, 0.24, 0.16, 'curtain', { color: 0x8a1a24 });
  },
});

defObj({
  key: 'zg_aisle_sign', name: 'Aisle Sign', w: 1, d: 1, height: 0, block: 'none', ceiling: true, movable: 0,
  sound: 'metal', hp: 200,
  desc: 'A hanging aisle sign. The numbers are in the right font. They are not in the right order.',
  tags: [...T, 'market', 'sign', 'ceiling'],
  variant: (s) => String(s.label ?? '?') + '|' + String(s.cat ?? 0),
  model: (mb, s) => {
    const li = Math.max(0, ZG_AISLE_LABELS.indexOf(String(s.label ?? '?')));
    const ci = Math.abs(Math.floor(Number(s.cat ?? 0))) % ZG_AISLE_CATS.length;
    const n = 'zg_ain_' + li, c = 'zg_aic_' + ci;
    for (const sx of [-0.5, 0.5]) mb.box(sx, 2.42, 0, 0.012, 0.3, 0.012, 'metal_grey');
    mb.box(0, 2.08, 0, 1.3, 0.34, 0.04, { south: n, north: n, all: 'plastic_red' }, { fit: { south: true, north: true } });
    mb.box(0, 1.92, 0, 1.3, 0.16, 0.04, { south: c, north: c, all: 'plastic_white' }, { fit: { south: true, north: true } });
  },
});

defObj({
  key: 'zg_directory', name: 'Mall Directory', w: 1, d: 1, height: 2.1, block: 'solid', movable: 0,
  power: true, sound: 'metal', hp: 500, lore: 'mall_directory',
  light: { color: 0xe8f0ff, intensity: 0.28, radius: 2.4, y: 1.3, kind: 'screen', power: true },
  desc: 'A backlit directory. There is a YOU ARE HERE dot on it. There are four.',
  tags: [...T, 'sign', 'mall'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.8, 0.12, 0.42, 'marble', { color: 0xe8e0d0 });
    for (const sx of [-1, 1]) mb.box(sx * 0.36, 0.12, 0, 0.08, 1.9, 0.3, 'metal_brushed', { color: 0xd8d0d8 });
    mb.box(0, 0.4, 0, 0.66, 1.55, 0.2, { south: 'zg_dir_map', north: 'zg_dir_back', all: 'metal_brushed' }, { fit: { south: true, north: true }, emissive: 0.5 });
    mb.box(0, 1.95, 0, 0.8, 0.12, 0.3, 'plastic_white', { color: 0x8d6aa6 });
  },
});

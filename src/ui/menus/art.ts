// Pixel art for the diegetic menus, drawn in code at start-up: a 3x5 stencil
// font, the intake room's height chart and booking board, tattoo flash
// sprites, hairstyle cards, X-ray films for the Rehab Section, paper and
// rubber stamps. Everything returns a PixelCanvas (toUrl() for <img>/CSS).
import { PixelCanvas, makeRamp, mixHex, ph } from '../../gfx/pixel';
import { TATTOOS } from '../../entities/humanLooks';

// ------------------------------------------------------------------ 3x5 font
const F3: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', '/': '001001010100100', '#': '101111101111101',
  '_': '000000000000111', '\'': '010010000000000', '!': '010010010000010', '?': '110001010000010', '+': '000010111010000', '·': '000000010000000',
};
/** width in pixels of a 3x5 string */
export const textW = (s: string, k = 1) => Math.max(0, s.length * 4 - 1) * k;
export function text3(pc: PixelCanvas, s: string, x: number, y: number, c: number, k = 1) {
  for (const ch of s.toUpperCase()) {
    const g = F3[ch] || F3[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) pc.set(x + (i % 3) * k + a, y + Math.floor(i / 3) * k + b, c);
    x += 4 * k;
  }
}

// ------------------------------------------------------------------ intake room textures
/** the height chart behind the subject: 48 px per metre, 0..2.2 m */
export function heightChart(): PixelCanvas {
  const W = 88, H = 106, ppm = H / 2.2;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  const bg = makeRamp(0xd6d2c2, 6, { spread: 0.35 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = ph(x >> 2, y >> 2, 3) * 0.6 + ph(x, y, 4) * 0.4;
    pc.set(x, y, bg[n > 0.9 ? 1 : n > 0.25 ? 3 : 4]);
  }
  // water stains and a hand smear at shoulder height
  for (let i = 0; i < 260; i++) { const x = Math.floor(ph(i, 1, 9) * W), y = Math.floor(H - 8 - ph(i, 2, 9) * 30); pc.blend(x, y, 0x8a7a50, 0.18); }
  for (let i = 0; i < 40; i++) pc.blend(20 + Math.floor(ph(i, 3, 9) * 8), Math.floor(H - 1.45 * ppm + ph(i, 4, 9) * 10), 0x6a5a40, 0.25);
  const ink = 0x1e1c18;
  for (let cm = 0; cm <= 220; cm += 5) {
    const y = Math.round(H - 1 - (cm / 100) * ppm);
    const major = cm % 10 === 0;
    const len = major ? (cm % 50 === 0 ? W : 18) : 9;
    for (let x = 0; x < len; x++) pc.set(x, y, ink);
    for (let x = W - len; x < W; x++) pc.set(x, y, ink);
    if (major && cm >= 100 && cm % 10 === 0) {
      const s = String(cm);
      text3(pc, s, 20, y - 2, cm % 50 === 0 ? 0x8a1a14 : ink);
      text3(pc, s, W - 20 - textW(s), y - 2, cm % 50 === 0 ? 0x8a1a14 : ink);
    }
  }
  // header
  for (let y = 0; y < 9; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === 8 ? ink : 0x2a2826);
  text3(pc, 'MERIDIAN INTAKE B', Math.round(W / 2 - textW('MERIDIAN INTAKE B') / 2), 2, 0xe8b52a);
  return pc;
}

/** the booking board: black felt, white peg letters */
export function bookingBoard(name: string, num: string, date: string): PixelCanvas {
  const W = 72, H = 44;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, (y % 2 === 0) ? 0x16161a : 0x1c1c22);
  for (let x = 0; x < W; x++) { pc.set(x, 0, 0x5a4a30); pc.set(x, H - 1, 0x3a2e1e); pc.set(x, 1, 0x7a6440); }
  for (let y = 0; y < H; y++) { pc.set(0, y, 0x5a4a30); pc.set(W - 1, y, 0x3a2e1e); }
  const white = 0xe8e6de;
  const line = (s: string, y: number, c = white) => text3(pc, s, Math.round(W / 2 - textW(s) / 2), y, c);
  line('MERIDIAN INSTITUTE', 4, 0xb8b6ae);
  line('REMITTANCE', 11, 0xe8b52a);
  const nm = (name || 'UNNAMED').toUpperCase().slice(0, 17);
  line(nm, 19);
  line(num || 'D-____', 27, num ? white : 0x8a8880);
  line(date, 35, 0xb8b6ae);
  return pc;
}

// ------------------------------------------------------------------ flash sheet
/** a tattoo design as a small image (ink on skin-coloured paper) */
export function tattooImage(key: string, k = 3): PixelCanvas {
  const t = TATTOOS[key];
  const word = { owed: 'OWED', paid: 'PAID', mom: 'MOM' }[key];
  const art = t?.art?.length ? t.art : null;
  const w = art ? art.reduce((m, r) => Math.max(m, r.length), 0) : textW(word || '?');
  const h = art ? art.length : 5;
  const W = Math.max(9, w + 4), H = Math.max(9, h + 4);
  const pc = new PixelCanvas(W * k, H * k);
  pc.wrap = false;
  const INK: Record<string, number> = { '#': 0x1e2a44, o: 0x5a6a88, r: 0xb02a24, g: 0x2e6a3a, y: 0xd8a830 };
  const x0 = Math.floor((W - w) / 2), y0 = Math.floor((H - h) / 2);
  if (art) for (let j = 0; j < art.length; j++) for (let i = 0; i < art[j].length; i++) {
    const c = INK[art[j][i]];
    if (c !== undefined) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) pc.set((x0 + i) * k + a, (y0 + j) * k + b, c);
  }
  else text3(pc, word || '?', x0 * k, y0 * k, 0x1e2a44, k);
  return pc;
}

// ------------------------------------------------------------------ hairstyle cards (barber chart)
/** a tiny head-and-shoulders silhouette with the hairstyle on it */
export function hairIcon(style: string, hair: number, skin: number): PixelCanvas {
  const W = 16, H = 16;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  const HR = makeRamp(hair, 4, { spread: 0.5 }), SR = makeRamp(skin, 4, { spread: 0.4 });
  const cx = 7.5, cy = 7.2, rx = 3.6, ry = 4.4;
  const inHead = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  // shoulders (jumpsuit yellow)
  for (let y = 13; y < H; y++) for (let x = 1; x < W - 1; x++) if (Math.abs(x - cx) < 3 + (y - 12) * 2) pc.set(x, y, y === 13 ? 0xb08a1c : 0xd9a826);
  for (let y = 11; y < 14; y++) for (let x = 6; x < 10; x++) pc.set(x, y, SR[1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inHead(x + 0.5, y + 0.5)) pc.set(x, y, SR[2 + (x < cx ? 0 : -1) + 0]);
  const top = (x: number, y: number) => inHead(x + 0.5, y + 0.5) && y < cy - 1.2;
  const hairAt = (x: number, y: number, c = HR[2]) => { if (x >= 0 && y >= 0 && x < W && y < H) pc.set(x, y, c); };
  const s = style;
  if (s !== 'bald') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const outer = ((x + 0.5 - cx) / (rx + 1)) ** 2 + ((y + 0.5 - cy + 0.4) / (ry + 0.8)) ** 2 <= 1;
    const side = Math.abs(x + 0.5 - cx) > 2.2;
    switch (s) {
      case 'shaved': case 'buzz': case 'cornrows': if (top(x, y)) hairAt(x, y, s === 'shaved' ? SR[0] : s === 'cornrows' && x % 2 ? HR[0] : HR[1]); break;
      case 'receding': if (top(x, y) && (side || y < 3)) hairAt(x, y, HR[1]); break;
      case 'mohawk': if (outer && !side && y < cy) hairAt(x, y, HR[2]); if (y < 2 && Math.abs(x - cx) < 1.5) hairAt(x, y, HR[3]); break;
      case 'undercut': if (outer && y < cy - 1.6) hairAt(x, y, HR[2]); else if (top(x, y)) hairAt(x, y, SR[0]); break;
      case 'spiky': if (outer && y < cy - 1) hairAt(x, y, HR[2]); if (y === 1 && x % 2 === 0 && Math.abs(x - cx) < 4) hairAt(x, y, HR[3]); break;
      case 'curly': case 'afro': {
        const big = s === 'afro' ? 2.2 : 1;
        if (((x + 0.5 - cx) / (rx + big)) ** 2 + ((y + 0.5 - cy + 1) / (ry + big * 0.6)) ** 2 <= 1 && (y < cy - 0.5 || side)) hairAt(x, y, (x + y) % 2 ? HR[2] : HR[1]);
        break;
      }
      case 'long': if (outer && (y < cy - 1 || side)) hairAt(x, y, HR[2]); if (side && y >= cy && y < 15 && Math.abs(x + 0.5 - cx) < rx + 1.2) hairAt(x, y, HR[1]); break;
      case 'bob': if (outer && (y < cy - 1 || side) && y < cy + 3) hairAt(x, y, HR[2]); break;
      case 'mullet': if (outer && y < cy - 1) hairAt(x, y, HR[2]); if (y >= cy && y < 14 && Math.abs(x + 0.5 - cx) > 2.8 && Math.abs(x + 0.5 - cx) < rx + 1.2) hairAt(x, y, HR[1]); break;
      case 'ponytail': if (outer && y < cy - 1) hairAt(x, y, HR[2]); if (x === 12 && y > 3 && y < 11) hairAt(x, y, HR[1]); break;
      case 'topknot': if (outer && y < cy - 1) hairAt(x, y, HR[2]); if (y < 2 && Math.abs(x + 0.5 - cx) < 1.6) hairAt(x, y, HR[3]); break;
      default: if (outer && y < cy - 1.2) hairAt(x, y, HR[2]); break;
    }
  }
  // eyes
  pc.set(6, 8, 0x1a1410); pc.set(9, 8, 0x1a1410);
  return pc;
}

// ------------------------------------------------------------------ X-ray films (Rehab Section)
/** what a condition's film shows */
export type XrayKind = 'brain' | 'heart' | 'lungs' | 'gut' | 'arm' | 'hand' | 'leg' | 'eye' | 'ear' | 'skull' | 'spine' | 'moon' | 'cup' | 'coin' | 'band' | 'box' | 'crowd' | 'nose' | 'sock' | 'chair' | 'cig' | 'pill' | 'paw' | 'book';
const XRAY_OF: Record<string, XrayKind> = {
  strong: 'arm', athletic: 'leg', keen_hearing: 'ear', eagle_eyed: 'eye', light_eater: 'gut', fast_healer: 'hand', lucid_dreamer: 'moon', night_owl: 'moon',
  organized: 'box', dextrous: 'hand', brave: 'heart', outdoorsman: 'lungs', fast_learner: 'brain', handy: 'hand', iron_gut: 'gut', resilient: 'spine', lucky: 'coin',
  graceful: 'leg', mall_rat: 'box', gym_rat: 'arm', speed_reader: 'book', heavy_sleeper: 'moon', pocket_hoarder: 'box', lucky_socks: 'sock', cat_person: 'paw',
  dog_person: 'paw', snack_goblin: 'gut', talks_furniture: 'chair', box_breather: 'lungs', iron_nerves: 'brain', been_here_before: 'skull', creature_whisperer: 'paw',
  unbothered: 'brain', weak: 'arm', unfit: 'lungs', hard_hearing: 'ear', short_sighted: 'eye', hearty_appetite: 'gut', slow_healer: 'hand', insomniac: 'moon',
  claustrophobic: 'box', agoraphobic: 'crowd', nyctophobic: 'moon', cowardly: 'heart', clumsy: 'leg', all_thumbs: 'hand', disorganized: 'box', prone_illness: 'lungs',
  smoker: 'cig', thin_skinned: 'hand', slow_learner: 'brain', weak_stomach: 'gut', lonely: 'crowd', sneezer: 'nose', smells_pizza: 'nose', night_light: 'moon',
  dramatic: 'heart', butterfingers: 'hand', couch_potato: 'chair', worrier: 'brain', light_sleeper: 'moon', melancholic: 'brain', hypochondriac: 'pill', coffee_dependent: 'cup',
  hoarder: 'box', snitch: 'ear', lifer: 'spine', wrecking_ball: 'arm', sweet_on_sarge: 'heart', gallows_humour: 'skull', fresh_fish: 'gut', born_in_debt: 'coin', band_picker: 'band',
};
export const xrayOf = (key: string): XrayKind => XRAY_OF[key] || 'skull';
const XR: Record<XrayKind, string[]> = {
  brain: ['..####..', '.#.##.#.', '#.#..#.#', '#..##..#', '#.#..#.#', '.#.##.#.', '..####..', '...##...'],
  heart: ['.##..##.', '#..##..#', '#......#', '#..##..#', '.#....#.', '..#..#..', '...##...', '........'],
  lungs: ['...##...', '.#.##.#.', '##.##.##', '#..##..#', '#..##..#', '#.#..#.#', '##....##', '.#....#.'],
  gut: ['..####..', '.#....#.', '.#.##.#.', '..#..#..', '.#.##.#.', '.#....#.', '..#.##..', '....#...'],
  arm: ['##......', '###.....', '.###....', '..##....', '..##.##.', '..#####.', '...###..', '........'],
  hand: ['.#.#.#..', '.#.#.#..', '.#.#.#.#', '.#####.#', '.######.', '.#####..', '..###...', '..###...'],
  leg: ['..###...', '..##....', '..##....', '..##....', '..###...', '..##....', '..##....', '..####..'],
  eye: ['........', '..####..', '.#....#.', '#..##..#', '#..##..#', '.#....#.', '..####..', '........'],
  ear: ['..###...', '.#...#..', '.#.#..#.', '.#..#.#.', '..#..#..', '...#.#..', '...##...', '........'],
  skull: ['..####..', '.######.', '#.##.###', '#..#..##', '########', '.##.##..', '.#.#.#..', '........'],
  spine: ['...##...', '..####..', '...##...', '..####..', '...##...', '..####..', '...##...', '..####..'],
  moon: ['...###..', '..##....', '.##.....', '.##.....', '.##.....', '..##....', '...###..', '........'],
  cup: ['........', '.#.#.#..', '######..', '#....###', '#....#.#', '#....###', '.####...', '########'],
  coin: ['..####..', '.#....#.', '#..##..#', '#.#....#', '#..##..#', '#....#.#', '.#.##.#.', '..####..'],
  band: ['........', '.######.', '#.#..#.#', '#.#..#.#', '#.####.#', '.######.', '...##...', '........'],
  box: ['########', '#......#', '#.####.#', '#.#..#.#', '#.#..#.#', '#.####.#', '#......#', '########'],
  crowd: ['.#..#..#', '###.#.##', '.#.###.#', '##.#.###', '#.#.#.#.', '#.#.#.#.', '........', '........'],
  nose: ['...#....', '...#....', '...##...', '...#.#..', '..#..#..', '.#...#..', '.#.#.##.', '..#.....'],
  sock: ['..###...', '..###...', '..#.#...', '..###...', '..###...', '..####..', '..#####.', '...####.'],
  chair: ['.#......', '.#......', '.#......', '.######.', '.#....#.', '.#....#.', '.#....#.', '........'],
  cig: ['......#.', '.....#..', '......#.', '........', '########', '#####..#', '########', '........'],
  pill: ['........', '..###...', '.#####..', '.###.##.', '..##.##.', '...####.', '....##..', '........'],
  paw: ['.#..#...', '#.##.#..', '.#..#...', '..##....', '.####...', '.####...', '..##....', '........'],
  book: ['........', '.##.##..', '#.##.##.', '#.##..#.', '#..#..#.', '#..#..#.', '.##.##..', '........'],
};
/** an X-ray film: glowing bone-white on a deep blue-black, with a lab label */
export function xrayFilm(kind: XrayKind, seed: number, bad: boolean): PixelCanvas {
  const W = 28, H = 30;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  const base = bad ? [0x0a0e18, 0x111828, 0x1a2438] : [0x08121a, 0x0e1c26, 0x162a36];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.hypot(x - W / 2, y - H / 2.4) / 18 + ph(x >> 1, y >> 1, seed) * 0.25;
    pc.set(x, y, base[v < 0.55 ? 2 : v < 0.85 ? 1 : 0]);
  }
  const art = XR[kind];
  const bone = [0x7aa8c0, 0xb8dcea, 0xe8f6ff];
  const k = 2, x0 = Math.round(W / 2 - 8), y0 = 4;
  for (let j = 0; j < art.length; j++) for (let i = 0; i < 8; i++) if (art[j][i] === '#') {
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) pc.set(x0 + i * k + a, y0 + j * k + b, bone[(a + b + i + j) % 3 === 0 ? 2 : 1]);
    // soft bloom around bone
    for (const [dx, dy] of [[-1, 0], [k, 0], [0, -1], [0, k]]) pc.blend(x0 + i * k + dx, y0 + j * k + dy, bone[0], 0.25);
  }
  // film edge notches + label strip
  for (let x = 0; x < W; x++) { pc.set(x, 0, 0x222a30); pc.set(x, H - 1, 0x222a30); }
  for (let x = 2; x < W - 2; x += 4) pc.set(x, 1, 0x3a4a52);
  for (let y = H - 6; y < H - 1; y++) for (let x = 1; x < 11; x++) pc.set(x, y, 0xd8d4c4);
  text3(pc, (seed % 900 + 100).toString(), 2, H - 6, 0x2a2826);
  return pc;
}

// ------------------------------------------------------------------ rubber stamp
/** a rotated inky rubber-stamp word in a box */
export function stampWord(word: string, color: number, k = 2): PixelCanvas {
  const tw = textW(word, k), th = 5 * k;
  const W = tw + 8 * k / 2 + 6, H = th + 8;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  const ink = (x: number, y: number) => { if (ph(x, y, 7) > 0.18) pc.set(x, y, color); else pc.blend(x, y, color, 0.4); };
  for (let x = 0; x < W; x++) { ink(x, 0); ink(x, 1); ink(x, H - 1); ink(x, H - 2); }
  for (let y = 0; y < H; y++) { ink(0, y); ink(1, y); ink(W - 1, y); ink(W - 2, y); }
  const tmp = new PixelCanvas(W, H);
  tmp.wrap = false;
  text3(tmp, word, Math.round((W - tw) / 2), Math.round((H - th) / 2), 0xffffff, k);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (tmp.data[i + 3] > 0) ink(x, y); }
  void mixHex;
  return pc;
}

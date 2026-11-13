// THE CONTAINMENT KIT'S PIXEL ART (rooms/vault.ts): every hand-pixelled
// surface of the Institute's secure rooms, painted once on small canvases with
// hard pixels (no smoothing, no gradients: ramps, bevels, specks, dither) and
// sampled nearest. Headings are Alagard (bitfont); the fine print is a 3x5
// stencil face that reads as text up close and as texture from the door.
//   crest        the Meridian Institute of Liminality's seal: the bishop in a riveted roundel
//   placard      a containment placard: crest, sin-rank block, class, cell, protocol (redacted), pictograms, barcode, hazard band
//   sign         warning signs: voltage, biohazard, do-not-look, cryogenic, decontaminate, no-contact, breathing
//   page / folder  dossier pages with black redaction bars, a mugshot, stamps; manila covers with the rank tab
//   wired glass  reinforced glass: a diamond wire mesh, scuffs and a crack (alpha)
//   rack         a server rack's face: 1U / 2U units, drive bays, patch panels, a tape library, a UPS (with LED spots)
//   locker       a wall of numbered vault doors with seals and tags
//   keypad / biolock / readout / frost / stencil / evidence / pipe band / padded wall
// RedactScreen: a CRT feed that scrolls classified text with redaction blocks.
import * as THREE from 'three';
import { bitText, bitMeasure, bitIsReady, bitReady } from '../../../gfx/bitfont';
import type { SinRank } from '../../../creatures/lore';
import { RANK_INFO } from '../../../creatures/lore';
import { drawPortrait } from '../../../entities/portrait';
import { drawEmblemMono } from '../../brand/logo';

export const RANK_COL: Record<SinRank, number> = { sloth: 0x7a9a86, gluttony: 0xb08a3a, lust: 0xc85a86, greed: 0xd8b02a, envy: 0x3aa860, wrath: 0xc8321e, pride: 0x7a4ab8 };
/** the Institute's working class names per rank (placards fall back on these) */
export const RANK_CLASS: Record<SinRank, string> = { sloth: 'Remnant', gluttony: 'Swarm', lust: 'Familiar', greed: 'Statute', envy: 'Mimic', wrath: 'Fauna', pride: 'Sovereign' };

const hex = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
const shade = (c: number, f: number) => { const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), g = Math.min(255, Math.round(((c >> 8) & 255) * f)), b = Math.min(255, Math.round((c & 255) * f)); return (r << 16) | (g << 8) | b; };
export const rng = (s: number) => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);

// ------------------------------------------------------------------ the 3x5 stencil face
const MICRO: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100110101010', '7': '111001010010010', '8': '010101010101010', '9': '010101011001110',
  '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', '/': '001001010100100', '#': '101111101111101', '°': '010101010000000',
  '%': '101001010100101', '+': '000010111010000', '>': '100010001010100', '<': '001010100010001', '_': '000000000000111', '=': '000111000111000',
  '!': '010010010000010', '?': '110001010000010', '(': '010100100100010', ')': '010001001001010', '·': '000000010000000', '[': '110100100100110',
  ']': '011001001001011', '*': '000101010101000', "'": '010010000000000', ',': '000000000010100', '&': '010101010101011',
};
/** the stencil face: 3x5 cells, 4px advance (x scale) */
export function micro(c: CanvasRenderingContext2D, s: string, x: number, y: number, col: string, sc = 1): number {
  c.fillStyle = col;
  let px = Math.round(x);
  for (const ch of s.toUpperCase()) {
    const g = MICRO[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(px + (i % 3) * sc, Math.round(y) + Math.floor(i / 3) * sc, sc, sc);
    px += 4 * sc;
  }
  return px - x;
}
export const microW = (s: string, sc = 1) => s.length * 4 * sc - sc;

// ------------------------------------------------------------------ canvas plumbing
type Draw = (c: CanvasRenderingContext2D, R: () => number) => void;
/** a nearest-filtered pixel texture; drawn now and again once the bitmap font is in (Alagard headings) */
export function pixTex(w: number, h: number, draw: Draw, o: { seed?: number; alpha?: boolean; repeat?: boolean } = {}): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const paint = () => { c.clearRect(0, 0, w, h); c.imageSmoothingEnabled = false; draw(c, rng(o.seed ?? 7)); };
  paint();
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (!bitIsReady()) void bitReady().then(() => { paint(); t.needsUpdate = true; });
  // drawn again when something on it arrives later (a portrait render, entities/portrait.ts)
  t.userData.repaint = () => { paint(); t.needsUpdate = true; };
  return t;
}
const R_ = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function frame(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) { R_(c, x, y, w, 1, col); R_(c, x, y + h - 1, w, 1, col); R_(c, x, y, 1, h, col); R_(c, x + w - 1, y, 1, h, col); }
function bevel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hi: string, lo: string) { R_(c, x, y, w, 1, hi); R_(c, x, y, 1, h, hi); R_(c, x, y + h - 1, w, 1, lo); R_(c, x + w - 1, y, 1, h, lo); }
function specks(c: CanvasRenderingContext2D, R: () => number, x: number, y: number, w: number, h: number, col: string, n: number) { c.fillStyle = col; for (let i = 0; i < n; i++) c.fillRect(Math.floor(x + R() * w), Math.floor(y + R() * h), 1, 1); }
/** a worn enamel ground: base, mottling clumps, specks, chipped edges with a lit lip, rust bleeding from the rim */
function enamel(c: CanvasRenderingContext2D, R: () => number, w: number, h: number, base: number, o: { rust?: number; chips?: number } = {}) {
  R_(c, 0, 0, w, h, hex(base));
  for (let i = 0; i < w * h * 0.012; i++) { const x = R() * w, y = R() * h, s = 1 + Math.floor(R() * 3); R_(c, x, y, s, s, hex(shade(base, R() < 0.5 ? 0.95 : 1.04))); }
  specks(c, R, 0, 0, w, h, hex(shade(base, 0.82)), w * h * 0.01);
  for (let i = 0; i < (o.chips ?? 6); i++) {
    const x = Math.floor(R() * w), y = R() < 0.5 ? Math.floor(R() * 4) : h - 2 - Math.floor(R() * 4), s = 1 + Math.floor(R() * 3);
    R_(c, x, y, s + 1, s, '#2a2420'); R_(c, x, y + s, s + 1, 1, hex(shade(base, 1.1)));
  }
  for (let i = 0; i < w * (o.rust ?? 0.3); i++) {
    const x = Math.floor(R() * w), top = R() < 0.5, len = 1 + Math.floor(R() * h * 0.12);
    for (let k = 0; k < len; k++) { c.fillStyle = `rgba(${110 + Math.floor(R() * 30)},${60 + Math.floor(R() * 20)},30,${0.5 * (1 - k / len)})`; c.fillRect(x, top ? k : h - 1 - k, 1, 1); }
  }
}
/** diagonal hazard stripes, hard-edged */
export function hazard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p = 8, a = '#e8b828', b = '#141210') {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { c.fillStyle = ((i + j) % (p * 2)) < p ? a : b; c.fillRect(x + i, y + j, 1, 1); }
}
function barcode(c: CanvasRenderingContext2D, R: () => number, x: number, y: number, w: number, h: number, ink: string) {
  let px = x;
  while (px < x + w - 2) { const bw = R() < 0.6 ? 1 : 2; R_(c, px, y, bw, h, ink); px += bw + (R() < 0.5 ? 1 : 2); }
}
const WORDS = ['DO', 'NOT', 'ENTER', 'WITHOUT', 'TWO', 'OPERATORS', 'FEED', 'AT', 'OBSERVE', 'FROM', 'THE', 'WINDOW', 'ONLY', 'NO', 'LIGHT', 'CONTACT', 'REPORT', 'TO', 'LEVEL', 'SEAL', 'ON', 'BREACH', 'UNIT', 'SAMPLE', 'HOURS', 'CELL', 'KEEP', 'DARK', 'COUNT', 'IT', 'TWICE', 'IF', 'MOVED', 'RECORD', 'NEVER', 'ALONE', 'DOOR', 'CALDER', 'WATCH', 'MERIDIAN', 'LOG', 'STATIC'];
/** a line of stencil words with black redaction bars between; returns nothing */
function redLine(c: CanvasRenderingContext2D, R: () => number, x: number, y: number, w: number, ink: string, bar: string, k = 0.35) {
  let px = x;
  while (px < x + w - 6) {
    if (R() < k) { const bw = Math.min(x + w - px, 8 + Math.floor(R() * 26)); R_(c, px, y - 1, bw, 7, bar); px += bw + 3; continue; }
    const wd = WORDS[Math.floor(R() * WORDS.length)];
    if (px + microW(wd) > x + w) break;
    px += micro(c, wd, px, y, ink) + 4;
  }
}

// ------------------------------------------------------------------ the crest
/**
 * The Meridian Institute of Liminality's seal: the bishop in its riveted roundel over the meridians
 * (src/ui/brand/logo.ts), engraved in one ink; `mid` fills the piece and the band
 */
export function drawCrest(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, ink: string, mid?: string) {
  drawEmblemMono(c, cx, cy, R, ink, mid);
}
/** the crest alone on a transparent square (medallion faces, stamps) */
export function crestTex(S = 64, ink = '#d8c890', mid?: string): THREE.CanvasTexture {
  return pixTex(S, S, (c) => drawCrest(c, S / 2 - 0.5, S / 2 - 0.5, S / 2 - 2, ink, mid), { alpha: true });
}

// ------------------------------------------------------------------ placards
const placardCache = new Map<string, THREE.CanvasTexture>();
/** a containment placard, 160 x 224 px */
export function placardTex(rank: SinRank, o: { cls?: string; cell?: string; seed?: number } = {}): THREE.CanvasTexture {
  const key = [rank, o.cls, o.cell, o.seed].join('|');
  const hit = placardCache.get(key); if (hit) return hit;
  const info = RANK_INFO[rank], rc = RANK_COL[rank];
  const t = pixTex(160, 224, (c, R) => {
    const W = 160, H = 224;
    enamel(c, R, W, H, 0xe0d8c0, { rust: 0.4, chips: 9 });
    frame(c, 0, 0, W, H, '#14161a'); frame(c, 1, 1, W - 2, H - 2, '#14161a'); frame(c, 3, 3, W - 6, H - 6, '#8a8470');
    // the header: crest and the department
    R_(c, 5, 5, W - 10, 30, '#1c2226'); bevel(c, 5, 5, W - 10, 30, '#3a444a', '#0a0c0e');
    drawCrest(c, 21, 20, 12, '#d8c890', '#2a3236');
    bitText(c, 'MERIDIAN', 38, 4, { color: '#ece4cc', outline: null });
    micro(c, 'CONTAINMENT DIVISION', 39, 25, '#e8b040');
    // the rank block: colour, numeral, a darker bevel
    const bx = 9, by = 42, bs = 58;
    R_(c, bx, by, bs, bs, hex(rc)); bevel(c, bx, by, bs, bs, hex(shade(rc, 1.35)), hex(shade(rc, 0.55)));
    for (let i = 0; i < 40; i++) R_(c, bx + 2 + R() * (bs - 4), by + 2 + R() * (bs - 4), 1, 1, hex(shade(rc, R() < 0.5 ? 0.85 : 1.15)));
    micro(c, 'RANK', bx + 4, by + 4, hex(shade(rc, 0.45)));
    bitText(c, info.numeral, bx + bs / 2, by + 16, { color: '#fffaf0', outline: hex(shade(rc, 0.35)), scale: 2, align: 'center' });
    // the words beside it
    const tx = 74;
    micro(c, 'SIN RANK', tx, 44, '#6a6250');
    bitText(c, info.label, tx - 1, 50, { color: hex(shade(rc, 0.6)), outline: null });
    micro(c, 'CLASS', tx, 70, '#6a6250');
    bitText(c, (o.cls ?? RANK_CLASS[rank]).toUpperCase(), tx - 1, 76, { color: '#1a1814', outline: null });
    R_(c, tx, 94, W - tx - 9, 1, '#8a8470');
    // the cell
    R_(c, 8, 106, W - 16, 2, '#1c2226');
    micro(c, 'CELL', 10, 114, '#6a6250');
    bitText(c, o.cell ?? 'A-01', 30, 109, { color: '#1a1814', outline: null });
    micro(c, 'SITE M-1 · SUBLEVEL 4', 78, 114, '#6a6250');
    R_(c, 8, 126, W - 16, 1, '#8a8470');
    // the protocol: stencilled words, redacted
    micro(c, 'SPECIAL CONTAINMENT PROTOCOL', 10, 131, '#a8261e');
    for (let l = 0; l < 6; l++) redLine(c, R, 10, 141 + l * 7, W - 20, '#2a2620', '#0c0c0e', 0.4);
    // pictograms
    const pic = (x: number, kind: number) => {
      R_(c, x, 186, 15, 15, '#1c2226'); bevel(c, x, 186, 15, 15, '#4a545a', '#050607');
      const ic = '#ece4cc';
      if (kind === 0) { for (let i = 0; i < 9; i++) { const yy = Math.round(3 * Math.sin((i / 8) * Math.PI)); R_(c, x + 3 + i, 193 - yy, 1, 1, ic); R_(c, x + 3 + i, 193 + yy, 1, 1, ic); } R_(c, x + 6, 192, 3, 3, ic); }
      else if (kind === 1) { R_(c, x + 5, 190, 5, 6, ic); for (let i = 0; i < 4; i++) R_(c, x + 4 + i * 2 - 1, 188, 1, 3, ic); R_(c, x + 9, 192, 2, 1, ic); }
      else { const pts = [[9, 2], [7, 6], [10, 6], [5, 12], [7, 8], [4, 8], [7, 2]]; for (let i = 0; i < pts.length - 1; i++) { const [a1, b1] = pts[i], [a2, b2] = pts[i + 1]; const n = Math.max(Math.abs(a2 - a1), Math.abs(b2 - b1)); for (let k = 0; k <= n; k++) R_(c, x + a1 + ((a2 - a1) * k) / n, 186 + b1 + ((b2 - b1) * k) / n, 1, 1, '#e8b040'); } }
      // the bar through it
      if (kind !== 2) for (let k = 1; k < 14; k++) R_(c, x + k, 186 + k, 1, 1, '#d8301e');
    };
    pic(9, 0); pic(27, 1); pic(45, 2);
    barcode(c, R, 66, 186, 60, 11, '#14161a');
    micro(c, 'M-' + String(Math.floor(R() * 9000 + 1000)) + '-' + info.numeral, 66, 199, '#2a2620');
    R_(c, 130, 186, 21, 15, hex(rc)); frame(c, 130, 186, 21, 15, '#14161a'); micro(c, info.numeral, 132 + (21 - microW(info.numeral)) / 2 - 2, 191, '#fffaf0');
    // the hazard band
    hazard(c, 6, 206, W - 12, 12, 6); frame(c, 6, 206, W - 12, 12, '#14161a');
  }, { seed: o.seed ?? (rank.length * 97 + (o.cell?.charCodeAt(2) ?? 3)) });
  placardCache.set(key, t);
  return t;
}

// ------------------------------------------------------------------ warning signs
export type SignKind = 'volt' | 'bio' | 'look' | 'cryo' | 'decon' | 'touch' | 'breath' | 'auth';
const SIGN_TXT: Record<SignKind, [string, string]> = {
  volt: ['DANGER', 'HIGH VOLTAGE'], bio: ['BIOHAZARD', 'SAMPLES INSIDE'], look: ['WARNING', 'DO NOT LOOK IN'], cryo: ['CAUTION', 'CRYOGENIC -80°C'],
  decon: ['DECONTAMINATE', '90 SECONDS MINIMUM'], touch: ['WARNING', 'DO NOT TOUCH GLASS'], breath: ['CAUTION', 'RESPIRATOR REQUIRED'], auth: ['RESTRICTED', 'CLEARANCE 3 AND UP'],
};
const signCache = new Map<SignKind, THREE.CanvasTexture>();
/** a warning sign, 96 x 120 px: a pictogram (triangle or roundel) over a black band */
export function signTex(kind: SignKind): THREE.CanvasTexture {
  const hit = signCache.get(kind); if (hit) return hit;
  const t = pixTex(96, 120, (c, R) => {
    const W = 96, H = 120;
    enamel(c, R, W, H, 0xece6d4, { rust: 0.5, chips: 5 });
    frame(c, 0, 0, W, H, '#14161a'); frame(c, 2, 2, W - 4, H - 4, '#14161a');
    const [head, sub] = SIGN_TXT[kind];
    const red = kind === 'auth' || kind === 'look' || kind === 'touch';
    const yel = '#e8b828', ink = '#14161a';
    // the triangle (or the red roundel for prohibitions)
    const cx = 48, top = 10, base = 72;
    if (red) {
      for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) { const d = Math.hypot(x, y); if (d <= 30) R_(c, cx + x, 42 + y, 1, 1, d > 25 ? '#c8261a' : '#f4efe2'); }
    } else {
      for (let y = top; y <= base; y++) { const hw = ((y - top) / (base - top)) * 34; R_(c, cx - hw, y, hw * 2 + 1, 1, ink); const iw = hw - 5; if (y > top + 7 && y < base - 3) R_(c, cx - iw, y, iw * 2 + 1, 1, yel); }
    }
    const g = (x: number, y: number, w = 1, h = 1) => R_(c, x, y, w, h, ink);
    const icy = red ? 42 : 52;
    switch (kind) {
      case 'volt': { const pts = [[54, 26], [42, 48], [50, 48], [40, 66], [58, 42], [49, 42], [56, 26]]; for (let i = 0; i < pts.length - 1; i++) { const [a1, b1] = pts[i], [a2, b2] = pts[i + 1]; const n = Math.max(Math.abs(a2 - a1), Math.abs(b2 - b1)); for (let k = 0; k <= n; k++) g(a1 + ((a2 - a1) * k) / n - 1, b1 + ((b2 - b1) * k) / n, 3, 1); } break; }
      case 'bio': for (let a = 0; a < 3; a++) { const an = a * 2.094 - Math.PI / 2, ox = cx + Math.cos(an) * 7, oy = icy + Math.sin(an) * 7; for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const d = Math.hypot(x, y), d2 = Math.hypot(x - Math.cos(an) * 3, y - Math.sin(an) * 3); if (d <= 8 && d >= 5 && d2 > 4) g(ox + x, oy + y); } } for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (Math.hypot(x, y) <= 3 && Math.hypot(x, y) >= 1.5) g(cx + x, icy + y); break;
      case 'cryo': for (let a = 0; a < 6; a++) { const an = (a / 6) * Math.PI * 2; for (let r = 0; r < 14; r++) { g(cx + Math.cos(an) * r, icy + Math.sin(an) * r, 2, 2); if (r === 8) for (const s of [-1, 1]) for (let k = 1; k < 5; k++) g(cx + Math.cos(an) * r + Math.cos(an + s * 0.9) * k, icy + Math.sin(an) * r + Math.sin(an + s * 0.9) * k); } } break;
      case 'decon': { g(cx - 12, icy - 14, 24, 3); g(cx - 2, icy - 20, 4, 6); for (let i = 0; i < 7; i++) for (let k = 0; k < 4; k++) g(cx - 11 + i * 4, icy - 8 + k * 5 + (i % 2) * 2, 1, 3); g(cx - 4, icy + 12, 8, 2); break; }
      case 'breath': { for (let y = -10; y <= 10; y++) for (let x = -12; x <= 12; x++) { const d = Math.hypot(x / 12, y / 10); if (d <= 1 && d > 0.78) g(cx + x, icy + y); } g(cx - 4, icy + 2, 8, 6); for (const s of [-1, 1]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (Math.hypot(x, y) <= 4) g(cx + s * 13 + x, icy + 6 + y); break; }
      case 'look': case 'touch': case 'auth': {
        if (kind === 'look') { for (let x = -16; x <= 16; x++) { const y = Math.round(9 * (1 - (x / 16) ** 2)); g(cx + x, icy - y, 1, 2); g(cx + x, icy + y - 1, 1, 2); } for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x, y) <= 5) g(cx + x, icy + y); R_(c, cx - 1, icy - 4, 1, 2, '#f4efe2'); }
        else if (kind === 'touch') { g(cx - 6, icy - 4, 13, 16); for (let i = 0; i < 4; i++) g(cx - 6 + i * 3 + (i > 1 ? 1 : 0), icy - 16 + (i === 0 || i === 3 ? 4 : 0), 2, 14); g(cx + 7, icy, 7, 3); }
        else { drawCrest(c, cx, icy, 16, ink); }
        for (let k = -20; k <= 20; k++) R_(c, cx + k - 1, icy + k - 1, 4, 3, '#c8261a');
        break;
      }
    }
    // the band and its words
    R_(c, 4, 80, W - 8, H - 84, red ? '#c8261a' : ink);
    bitText(c, head, W / 2, 81, { color: red ? '#fff4e8' : '#e8b828', outline: null, align: 'center' });
    micro(c, sub, Math.round((W - microW(sub)) / 2), 99, red ? '#fff4e8' : '#ece6d4');
    micro(c, 'M.I. OF LIMINALITY', Math.round((W - microW('M.I. OF LIMINALITY')) / 2), 108, red ? '#ffb8a8' : '#8a8478');
  }, { seed: kind.length * 31 });
  signCache.set(kind, t);
  return t;
}

// ------------------------------------------------------------------ dossiers
/** a dossier page, 112 x 148 px: header, a mugshot or diagram, redacted lines, a stamp */
export function pageTex(seed: number, o: { photo?: boolean; stamp?: string; rank?: SinRank } = {}): THREE.CanvasTexture {
  const t: THREE.CanvasTexture = pixTex(112, 148, (c, R) => {
    const W = 112, H = 148;
    R_(c, 0, 0, W, H, '#ece6d2');
    specks(c, R, 0, 0, W, H, '#d8d0b8', 500); specks(c, R, 0, 0, W, H, '#f8f4e8', 300);
    // a coffee ring
    if (R() < 0.4) { const x = 20 + R() * 70, y = 60 + R() * 70; for (let a = 0; a < 6.3; a += 0.06) R_(c, x + Math.cos(a) * 11, y + Math.sin(a) * 11, 1, 1, 'rgba(140,100,60,0.5)'); }
    drawCrest(c, 12, 12, 8, '#3a3a44');
    micro(c, 'M.I. OF LIMINALITY', 24, 6, '#2a2a36');
    micro(c, 'INTERNAL · EYES ONLY', 24, 13, '#a8261e');
    R_(c, 4, 23, W - 8, 1, '#2a2a36');
    micro(c, 'FILE M-' + String(Math.floor(R() * 900 + 100)), 6, 27, '#2a2a36');
    if (o.rank) { const rc = RANK_COL[o.rank]; R_(c, W - 26, 26, 21, 8, hex(rc)); micro(c, RANK_INFO[o.rank].numeral, W - 24, 28, '#fffaf0'); }
    let y = 38;
    if (o.photo !== false) {
      // a mugshot clipped to the page: grey ground, a height chart, and the unit: a render of a HumanRig (entities/portrait.ts)
      R_(c, 6, 37, 32, 40, '#6a6a68'); for (let k = 0; k < 6; k++) R_(c, 6, 40 + k * 6, 4, 1, '#c8c8c0');
      drawPortrait(c, 6, 37, 32, 40, { seed: 300 + (seed % 9), outfit: 'jumpsuit', light: 'mugshot', tone: 'grey', bg: null }, () => (t.userData.repaint as (() => void) | undefined)?.());
      if (R() < 0.6) R_(c, 13, 46, 16, 5, '#0c0c0e');
      // the paperclip
      for (let k = 0; k < 14; k++) { R_(c, 30, 33 + k, 1, 1, '#9aa0a8'); R_(c, 34, 31 + k, 1, 1, '#9aa0a8'); }
      R_(c, 30, 33 + 14, 5, 1, '#9aa0a8'); R_(c, 31, 31, 3, 1, '#9aa0a8');
      for (let l = 0; l < 6; l++) redLine(c, R, 42, 40 + l * 7, W - 48, '#2a2a36', '#0c0c0e', 0.3);
      y = 84;
    }
    for (; y < H - 22; y += 7) redLine(c, R, 6, y, W - 12, '#2a2a36', '#0c0c0e', 0.38);
    // a signature and a stamp
    for (let x = 0; x < 30; x++) R_(c, 8 + x, H - 14 + Math.round(Math.sin(x * 0.7) * 2 + Math.sin(x * 0.23) * 2), 1, 1, '#1a2a6a');
    const st = o.stamp ?? ['CLASSIFIED', 'REDACTED', 'EXPUNGED', 'SEALED'][Math.floor(R() * 4)];
    // the file's status as a flat printed strip along the foot (no rubber stamp)
    const sw = microW(st, 2) + 10, sx = W - sw - 6, sy = H - 20;
    R_(c, sx, sy, sw, 13, '#8a2a1e'); R_(c, sx, sy, 2, 13, '#d8503a');
    micro(c, st, sx + 6, sy + 3, '#f4e6d8', 2);
  }, { seed });
  return t;
}
/** a manila folder cover, 112 x 148 px: tab, crest stamp, red band, rank sticker */
export function folderTex(seed: number, rank?: SinRank): THREE.CanvasTexture {
  return pixTex(112, 148, (c, R) => {
    const W = 112, H = 148;
    enamel(c, R, W, H, 0xc8a868, { rust: 0, chips: 0 });
    for (let i = 0; i < 60; i++) R_(c, R() * W, R() * H, 2, 1, '#b8985a');
    frame(c, 0, 0, W, H, '#8a7040');
    R_(c, 0, 18, W, 12, '#a8261e'); micro(c, 'RESTRICTED', Math.round((W - microW('RESTRICTED', 2)) / 2), 19, '#f8ecd8', 2);
    drawCrest(c, W / 2, 66, 22, 'rgba(90,60,30,0.75)');
    R_(c, 14, 100, W - 28, 20, '#ece6d2'); frame(c, 14, 100, W - 28, 20, '#5a4a30');
    micro(c, 'SUBJECT FILE', 18, 103, '#3a3a44'); micro(c, 'M-' + String(Math.floor(R() * 9000 + 1000)), 18, 111, '#3a3a44');
    if (rank) { const rc = RANK_COL[rank]; R_(c, W - 30, 102, 14, 16, hex(rc)); micro(c, RANK_INFO[rank].numeral, W - 28, 108, '#fffaf0'); }
    for (let l = 0; l < 3; l++) R_(c, 14, 126 + l * 6, 40 + R() * 40, 2, '#0c0c0e');
  }, { seed });
}

// ------------------------------------------------------------------ glass
/** reinforced glass: a diamond wire mesh, scuffs and a crack, on alpha */
export function wiredGlassTex(): THREE.CanvasTexture {
  return pixTex(128, 128, (c, R) => {
    const S = 128;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = (x + y) % 16, b = (x - y + 1024) % 16;
      if (a === 0 || b === 0) R_(c, x, y, 1, 1, 'rgba(150,170,175,0.55)');
      if ((a === 0 || b === 0) && x % 16 === 0 && y % 16 === 0) R_(c, x, y, 1, 1, 'rgba(200,215,220,0.8)');
    }
    // scuffs and wipes
    for (let i = 0; i < 14; i++) { const x = R() * S, y = R() * S, l = 6 + R() * 18; for (let k = 0; k < l; k++) R_(c, x + k, y + k * 0.3, 1, 1, 'rgba(220,235,240,0.18)'); }
    // a crack from a corner
    let x = 6, y = 120;
    for (let k = 0; k < 40; k++) { R_(c, x, y, 1, 1, 'rgba(235,245,250,0.65)'); x += R() < 0.7 ? 1 : 0; y -= R() < 0.6 ? 1 : 0; if (R() < 0.08) { let bx = x, by = y; for (let j = 0; j < 8; j++) { R_(c, bx, by, 1, 1, 'rgba(235,245,250,0.4)'); bx += 1; by += R() < 0.5 ? 1 : 0; } } }
  }, { seed: 77, alpha: true, repeat: true });
}

// ------------------------------------------------------------------ server racks
export interface RackFace { tex: THREE.CanvasTexture; leds: { u: number; v: number; color: number; kind: number }[] }
/** a 42U rack's face, 96 x 320 px: servers, drive bays, patch panels, a tape library, a UPS; LED spots in uv */
export function rackTex(seed: number): RackFace {
  const leds: RackFace['leds'] = [];
  const W = 96, H = 320;
  const tex = pixTex(W, H, (c, R) => {
    leds.length = 0;
    R_(c, 0, 0, W, H, '#0c0e10');
    // the rails with their square holes
    for (const x of [2, W - 8]) { R_(c, x, 0, 6, H, '#3a3e42'); bevel(c, x, 0, 6, H, '#5a6066', '#1a1c1e'); for (let y = 2; y < H; y += 5) R_(c, x + 2, y, 2, 2, '#060708'); }
    let y = 4;
    const led = (x: number, yy: number, color: number, kind = 0) => { R_(c, x, yy, 2, 2, '#050505'); leds.push({ u: (x + 1) / W, v: 1 - (yy + 1) / H, color, kind }); };
    while (y < H - 40) {
      const r = R(), x0 = 9, x1 = W - 9, w = x1 - x0;
      if (r < 0.34) { // 1U server: drive bays, LEDs, a pull tab
        const h = 8; R_(c, x0, y, w, h, '#2a2e32'); bevel(c, x0, y, w, h, '#4a5056', '#141618');
        for (let i = 0; i < 6; i++) { R_(c, x0 + 3 + i * 9, y + 2, 8, 4, '#16181a'); R_(c, x0 + 4 + i * 9, y + 3, 5, 1, '#3a4046'); }
        led(x1 - 10, y + 3, 0x40ff60, 1); led(x1 - 6, y + 3, R() < 0.3 ? 0xffb030 : 0x40ff60, 2);
        y += h + 1;
      } else if (r < 0.56) { // 2U with a vent grille and a label
        const h = 16; R_(c, x0, y, w, h, '#c8c8c0'); bevel(c, x0, y, w, h, '#ecece4', '#7a7a74');
        for (let gy = 3; gy < h - 3; gy += 2) for (let gx = 4; gx < 40; gx += 2) R_(c, x0 + gx, y + gy, 1, 1, '#3a3a38');
        R_(c, x0 + 44, y + 3, 26, 6, '#ece6d2'); micro(c, ['R-NET', 'CODEX', 'VAULT', 'SEAM', 'WATCH', 'MIRROR'][Math.floor(R() * 6)], x0 + 45, y + 4, '#2a2a36');
        led(x0 + 45, y + 11, 0x40ff60, 1); led(x0 + 50, y + 11, 0x3ac8ff, 2); led(x0 + 55, y + 11, R() < 0.25 ? 0xff3a20 : 0x40ff60, 3);
        y += h + 1;
      } else if (r < 0.7) { // a patch panel: 24 ports, coloured leads
        const h = 8; R_(c, x0, y, w, h, '#1a1c1e');
        const cols = ['#2a6ac8', '#e8c228', '#c83a2a', '#3ac86a', '#e8e8e0'];
        for (let i = 0; i < 12; i++) { R_(c, x0 + 3 + i * 6, y + 2, 4, 4, '#060708'); if (R() < 0.7) R_(c, x0 + 4 + i * 6, y + 3, 2, 3, cols[Math.floor(R() * cols.length)]); }
        y += h + 1;
      } else if (r < 0.8) { // the tape library: slots of cartridges, a window
        const h = 30; R_(c, x0, y, w, h, '#2e3236'); bevel(c, x0, y, w, h, '#4a5056', '#141618');
        R_(c, x0 + 4, y + 4, w - 22, h - 8, '#0a1014');
        for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) R_(c, x0 + 6 + i * 7, y + 6 + j * 7, 5, 5, ['#e8e0c8', '#2a6ac8', '#c83a2a'][(i + j) % 3]);
        R_(c, x1 - 14, y + 5, 10, 6, '#062010'); micro(c, '42', x1 - 13, y + 6, '#6aff8a');
        led(x1 - 12, y + 18, 0x40ff60, 1); led(x1 - 8, y + 18, 0xffb030, 3);
        y += h + 1;
      } else if (r < 0.88) { // a blank, with a hand-written tag
        const h = 8; R_(c, x0, y, w, h, '#1e2124');
        if (R() < 0.5) { R_(c, x0 + 20, y + 1, 30, 6, '#e8d870'); micro(c, 'DO NOT', x0 + 22, y + 2, '#3a2a1a'); }
        y += h + 1;
      } else { // a KVM drawer with a tiny screen
        const h = 12; R_(c, x0, y, w, h, '#26292c'); bevel(c, x0, y, w, h, '#4a5056', '#141618');
        R_(c, x0 + 6, y + 3, 24, 6, '#06140a'); redLine(c, R, x0 + 7, y + 4, 22, '#4aff7a', '#4aff7a', 0.5);
        R_(c, x1 - 26, y + 4, 20, 3, '#3a3e42');
        y += h + 1;
      }
    }
    // the UPS at the foot: an LCD and its lamp
    R_(c, 9, H - 38, W - 18, 34, '#1a1c1e'); bevel(c, 9, H - 38, W - 18, 34, '#3a3e42', '#060708');
    R_(c, 16, H - 32, 30, 10, '#2a3a18'); micro(c, '230V', 18, H - 30, '#b8ff6a'); micro(c, '87%', 18, H - 24 + 1, '#b8ff6a');
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 14; gx++) R_(c, 52 + gx * 2, H - 32 + gy * 3, 1, 2, '#060708');
    led(20, H - 14, 0x40ff60, 0); led(26, H - 14, 0xffb030, 2);
    micro(c, 'MERIDIAN', 30, H - 14, '#5a6066');
  }, { seed });
  return { tex, leds };
}

// ------------------------------------------------------------------ the locker wall
/** a wall of numbered vault doors (cols x rows, each ppd px square): seals, tags, keyholes */
export function lockerTex(cols: number, rows: number, seed: number, ppd = 36): THREE.CanvasTexture {
  const W = cols * ppd, H = rows * ppd;
  return pixTex(W, H, (c, R) => {
    R_(c, 0, 0, W, H, '#16181a');
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * ppd + 1, y = j * ppd + 1, s = ppd - 2;
      const base = [0x6a7068, 0x646a62, 0x70766c, 0x5e645c][Math.floor(R() * 4)];
      R_(c, x, y, s, s, hex(base));
      for (let k = 0; k < 18; k++) R_(c, x + 1 + R() * (s - 2), y + 1 + R() * (s - 2), 1, 1, hex(shade(base, R() < 0.5 ? 0.85 : 1.12)));
      bevel(c, x, y, s, s, hex(shade(base, 1.3)), hex(shade(base, 0.5)));
      bevel(c, x + 2, y + 2, s - 4, s - 4, hex(shade(base, 0.7)), hex(shade(base, 1.15)));
      // the number plate and the keyhole
      R_(c, x + 4, y + 4, 18, 7, '#d8d0b4'); frame(c, x + 4, y + 4, 18, 7, '#3a3830');
      micro(c, String(j * cols + i + 101).padStart(3, '0'), x + 6, y + 5, '#1a1814');
      R_(c, x + s - 9, y + s / 2 - 3, 5, 5, '#c8b070'); R_(c, x + s - 7, y + s / 2 - 2, 1, 3, '#14120e');
      // seals, tags, warnings
      const r = R();
      if (r < 0.12) { R_(c, x + 3, y + s - 10, s - 6, 5, '#b82a1e'); micro(c, 'SEALED', x + 5, y + s - 10, '#f8e8d8'); }
      else if (r < 0.2) { R_(c, x + 4, y + 14, 10, 13, '#e8d870'); for (let k = 0; k < 3; k++) R_(c, x + 5, y + 17 + k * 3, 7, 1, '#5a4a2a'); R_(c, x + 8, y + 12, 2, 3, '#8a8a7a'); }
      else if (r < 0.26) hazard(c, x + 3, y + s - 7, s - 6, 4, 3);
      else if (r < 0.3) { R_(c, x + 4, y + 14, 6, 6, '#3aff6a'); }
      if (R() < 0.3) for (let k = 0; k < 6; k++) R_(c, x + R() * s, y + s - 1 - R() * 6, 1, 2, 'rgba(110,60,30,0.6)');
    }
  }, { seed });
}

// ------------------------------------------------------------------ small panels
/** a keypad: an LCD, 12 keys, a card slot, 40 x 60 px */
export const keypadTex = () => pixTex(40, 60, (c, R) => {
  enamel(c, R, 40, 60, 0x4a5056, { rust: 0.2, chips: 2 }); frame(c, 0, 0, 40, 60, '#0c0e10');
  R_(c, 5, 5, 30, 10, '#1a2a12'); micro(c, '- - - -', 8, 8, '#a8ff6a');
  const keys = '123456789*0#';
  for (let i = 0; i < 12; i++) { const x = 5 + (i % 3) * 10, y = 19 + Math.floor(i / 3) * 9; R_(c, x, y, 9, 8, '#c8c4b4'); bevel(c, x, y, 9, 8, '#ecE8d8', '#6a665c'); micro(c, keys[i], x + 3, y + 2, '#1a1814'); }
  R_(c, 6, 56, 28, 2, '#060708');
}, { seed: 5 });
/** a palm reader: a dark glass plate with a hand outline, 40 x 60 px */
export const bioTex = () => pixTex(40, 60, (c, R) => {
  enamel(c, R, 40, 60, 0x3a4046, { rust: 0.1, chips: 2 }); frame(c, 0, 0, 40, 60, '#0c0e10');
  R_(c, 4, 4, 32, 42, '#06141a'); bevel(c, 4, 4, 32, 42, '#020608', '#2a4a52');
  const hand = (x: number, y: number) => R_(c, x, y, 1, 1, '#4ae8ff');
  for (let k = 0; k < 4; k++) { const fx = 10 + k * 5 + (k > 1 ? 1 : 0), fl = k === 0 || k === 3 ? 12 : 15; for (let y = 0; y < fl; y++) { hand(fx, 26 - y); hand(fx + 3, 26 - y); } hand(fx + 1, 26 - fl); hand(fx + 2, 26 - fl); }
  for (let y = 26; y < 40; y++) { hand(10, y); hand(29, y); }
  for (let x = 10; x <= 29; x++) hand(x, 40);
  for (let k = 0; k < 6; k++) { hand(9 - k, 30 + k); hand(10 - k, 30 + k); }
  micro(c, 'PALM', 12, 50, '#8ae8f8');
}, { seed: 9 });
/** a seven-segment style readout on dark glass (emissive) */
export function readoutTex(text: string, color = '#ff4a2a', w = 64, h = 20): THREE.CanvasTexture {
  return pixTex(w, h, (c) => {
    R_(c, 0, 0, w, h, '#100604'); frame(c, 0, 0, w, h, '#2a1a14');
    micro(c, '8'.repeat(Math.floor((w - 6) / 8)), 4, (h - 10) / 2, 'rgba(255,80,40,0.12)', 2);
    micro(c, text, 4, (h - 10) / 2, color, 2);
  }, { seed: 1 });
}
/** frost creeping in from the edges (alpha) */
export const frostTex = () => pixTex(64, 96, (c, R) => {
  for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
    const e = Math.min(x, y, 63 - x, 95 - y), k = Math.max(0, 1 - e / (10 + R() * 8));
    if (R() < k * 0.9) R_(c, x, y, 1, 1, `rgba(${220 + Math.floor(R() * 30)},${235 + Math.floor(R() * 20)},255,${0.35 + k * 0.55})`);
  }
  for (let i = 0; i < 30; i++) { let x = R() * 64, y = R() * 96; for (let k = 0; k < 6; k++) { R_(c, x, y, 1, 1, 'rgba(255,255,255,0.5)'); x += R() < 0.5 ? 1 : -1; y += R() < 0.5 ? 1 : -1; } }
}, { seed: 21, alpha: true });
/** a word stencilled on the floor in worn paint (alpha) */
export function stencilTex(text: string, col = '#e8c228'): THREE.CanvasTexture {
  const w = microW(text, 3) + 8, h = 23;
  return pixTex(w, h, (c, R) => {
    micro(c, text, 4, 4, col, 3);
    // worn by boots: knock pixels out
    const id = c.getImageData(0, 0, w, h);
    for (let i = 3; i < id.data.length; i += 4) if (id.data[i] && R() < 0.22) id.data[i] = 0;
    c.putImageData(id, 0, 0);
  }, { seed: text.length * 13, alpha: true });
}
/** a pipe marker band: colour, the medium, the flow arrow */
export function pipeBandTex(text: string, bg: number): THREE.CanvasTexture {
  const w = microW(text) + 22;
  return pixTex(w, 9, (c) => {
    R_(c, 0, 0, w, 9, hex(bg)); micro(c, text, 3, 2, '#141210');
    const ax = w - 14; R_(c, ax, 4, 8, 1, '#141210'); for (let k = 0; k < 3; k++) R_(c, ax + 8 - k, 4 - k, 1, k * 2 + 1, '#141210');
  }, { seed: 3 });
}
/** padded cell lining: quilted vinyl, buttons, stains */
export const paddedTex = () => pixTex(64, 64, (c, R) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const u = (x % 16) / 16, v = (y % 16) / 16, d = Math.hypot(u - 0.5, v - 0.5);
    const b = 0.78 + (0.5 - d) * 0.35 + (R() - 0.5) * 0.05;
    const g = Math.round(220 * b), col = `rgb(${g},${Math.round(g * 0.98)},${Math.round(g * 0.9)})`;
    R_(c, x, y, 1, 1, col);
  }
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) { R_(c, x, y, 2, 2, '#6a665c'); R_(c, x + 1, y + 1, 1, 1, '#d8d4c8'); }
  for (let i = 0; i < 4; i++) { const x = R() * 60, y = R() * 50; for (let k = 0; k < 14; k++) R_(c, x + R() * 4, y + k, 1, 1, 'rgba(120,90,50,0.35)'); }
}, { seed: 33, repeat: true });
/** an evidence board: cork, pinned photographs, cards, a map scrap, red string */
export function evidenceTex(seed: number, W = 192, H = 120): THREE.CanvasTexture {
  const t: THREE.CanvasTexture = pixTex(W, H, (c, R) => {
    R_(c, 0, 0, W, H, '#a8794a');
    for (let i = 0; i < W * H * 0.25; i++) R_(c, R() * W, R() * H, 1, 1, ['#946a3e', '#b8885a', '#8a5e34', '#c09468'][Math.floor(R() * 4)]);
    frame(c, 0, 0, W, H, '#3a2414'); frame(c, 1, 1, W - 2, H - 2, '#6a4424'); frame(c, 2, 2, W - 4, H - 4, '#3a2414');
    const pins: [number, number][] = [];
    for (let i = 0; i < 11; i++) {
      const kind = R(), w = kind < 0.45 ? 22 : kind < 0.8 ? 26 : 30, h = kind < 0.45 ? 26 : kind < 0.8 ? 18 : 22;
      const x = 6 + R() * (W - w - 12), y = 6 + R() * (H - h - 12);
      if (kind < 0.45) { // a photograph: white border, a grim grey print of somebody (a HumanRig render, entities/portrait.ts)
        R_(c, x, y, w, h, '#ece8dc'); R_(c, x + 2, y + 2, w - 4, h - 7, '#3a3e3a');
        for (let k = 0; k < 30; k++) R_(c, x + 2 + R() * (w - 4), y + 2 + R() * (h - 7), 2, 1, R() < 0.5 ? '#5a5e56' : '#2a2c28');
        drawPortrait(c, x + 2, y + 2, w - 4, h - 7, { seed: 320 + ((seed + i) % 7), outfit: i % 3 ? 'civilian' : 'jumpsuit', light: 'dim', frame: 'chest', tone: 'grey', bg: null }, () => (t.userData.repaint as (() => void) | undefined)?.());
        if (R() < 0.5) for (let k = 0; k < 7; k++) R_(c, x + w / 2 - 6 + k * 2, y + 4 + Math.abs(3 - k), 1, 1, '#d8301e');
      } else if (kind < 0.8) { // an index card, half redacted
        R_(c, x, y, w, h, '#f2ecd8'); R_(c, x, y + 3, w, 1, '#d86a6a');
        for (let l = 0; l < 3; l++) { R_(c, x + 2, y + 6 + l * 4, w - 6 - R() * 8, 1, '#3a3a50'); if (R() < 0.5) R_(c, x + 4 + R() * 8, y + 5 + l * 4, 8, 3, '#0c0c0e'); }
      } else { // a map scrap: corridors
        R_(c, x, y, w, h, '#e0d8b8'); for (let k = 0; k < 6; k++) { const yy = y + 2 + R() * (h - 4); R_(c, x + 2, yy, w - 4, 1, '#6a6050'); const xx = x + 2 + R() * (w - 4); R_(c, xx, y + 2, 1, h - 4, '#6a6050'); }
        R_(c, x + w * 0.6, y + h * 0.4, 3, 3, '#d8301e');
      }
      pins.push([x + w / 2, y + 2]);
      R_(c, x + w / 2 - 1, y + 1, 3, 3, ['#d8301e', '#2a6ac8', '#e8c228'][i % 3]); R_(c, x + w / 2 - 1, y + 1, 1, 1, '#ffffff');
    }
    // the red string from pin to pin
    for (let i = 0; i < pins.length - 1; i++) {
      if (R() < 0.3) continue;
      const [x0, y0] = pins[i], [x1, y1] = pins[(i + 1 + Math.floor(R() * 3)) % pins.length];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= n; k++) { const t = k / n, sag = Math.sin(t * Math.PI) * 3; R_(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag, 1, 1, '#c81e14'); }
    }
  }, { seed });
  return t;
}

// ------------------------------------------------------------------ the redacted terminal
const LINES = [
  'ACCESS LEVEL 3 CONFIRMED', 'RETRIEVING FILE', 'SUBJECT', 'CONTAINMENT STATUS NOMINAL', 'CELL PRESSURE', 'OBSERVATION LOG', 'INCIDENT REPORT',
  'UNIT RECOVERED', 'DO NOT RELEASE', 'PROTOCOL AMENDED BY', 'DR CALDER', 'FEEDING SCHEDULE', 'SPLITTING EVENT', 'MASS REDUCED', 'THE SEAM',
  'LEVEL 0 BREACH', 'TISSUE SAMPLE FILED', 'PERSONNEL LOST', 'AUDIO REMOVED', 'TRANSCRIPT FOLLOWS', 'SEE ADDENDUM', 'IT ASKED FOR', 'REASSIGNED',
];
/** a CRT feed of classified text scrolling, with redaction blocks, a header and the odd ACCESS DENIED */
export class RedactScreen {
  readonly cv = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  private c: CanvasRenderingContext2D;
  private rows: { s: string; bars: [number, number][] }[] = [];
  private R: () => number;
  private scroll = 0; private acc = 0; private deny = 0;
  constructor(private head = 'MERIDIAN NET', seed = 1, readonly W = 128, readonly H = 96) {
    this.cv.width = W; this.cv.height = H;
    this.c = this.cv.getContext('2d')!;
    this.R = rng(seed * 7919 + 13);
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    for (let i = 0; i < 14; i++) this.push();
    this.draw(0);
  }
  private push() {
    const R = this.R;
    let s = R() < 0.6 ? LINES[Math.floor(R() * LINES.length)] : '';
    if (!s) { for (let k = 0; k < 3; k++) s += (k ? ' ' : '') + WORDS[Math.floor(R() * WORDS.length)]; }
    if (R() < 0.25) s = '> ' + s;
    if (R() < 0.2) s = String(Math.floor(R() * 90 + 10)) + ':' + String(Math.floor(R() * 50 + 10)) + ' ' + s;
    const bars: [number, number][] = [];
    const n = R() < 0.7 ? 1 + Math.floor(R() * 2) : 0;
    for (let k = 0; k < n; k++) bars.push([Math.floor(R() * 24), 3 + Math.floor(R() * 9)]);
    this.rows.push({ s, bars });
    if (this.rows.length > 16) this.rows.shift();
  }
  /** advance (call ~10 times a second at most) */
  update(dt: number, t: number) {
    this.acc += dt;
    if (this.acc < 0.09) return;
    this.acc = 0;
    this.scroll += 1;
    if (this.scroll >= 7) { this.scroll = 0; this.push(); if (this.R() < 0.04) this.deny = 1.6; }
    this.deny = Math.max(0, this.deny - 0.09);
    this.draw(t);
  }
  private draw(t: number) {
    const c = this.c, W = this.W, H = this.H;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    // the header bar (inverse video)
    c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, W, 9);
    micro(c, this.head, 2, 2, '#000');
    const clk = String(Math.floor(t / 60) % 60).padStart(2, '0') + ':' + String(Math.floor(t) % 60).padStart(2, '0');
    micro(c, clk, W - microW(clk) - 2, 2, '#000');
    // the text, scrolling up a pixel at a time
    const top = 12, lh = 7, vis = Math.floor((H - top - 9) / lh) + 1;
    const rows = this.rows.slice(-vis - 1);
    rows.forEach((r, i) => {
      const y = top + i * lh - this.scroll;
      if (y < top - 1 || y > H - 12) return;
      micro(c, r.s, 3, y, '#d8d8d8');
      for (const [ch, len] of r.bars) { c.fillStyle = '#ffffff'; c.fillRect(3 + ch * 4, y - 1, len * 4, 7); }
    });
    // the prompt and the cursor
    c.fillStyle = '#000'; c.fillRect(0, H - 9, W, 9);
    micro(c, '> QUERY', 3, H - 7, '#ffffff');
    if (Math.floor(t * 2) % 2) { c.fillStyle = '#fff'; c.fillRect(34, H - 8, 4, 6); }
    if (this.deny > 0 && Math.floor(this.deny * 6) % 2) {
      c.fillStyle = '#fff'; c.fillRect(14, H / 2 - 9, W - 28, 18); c.fillStyle = '#000'; c.fillRect(16, H / 2 - 7, W - 32, 14);
      micro(c, 'ACCESS DENIED', W / 2 - microW('ACCESS DENIED', 1) / 2, H / 2 - 2, '#fff');
    }
    this.tex.needsUpdate = true;
  }
}
export { bitMeasure };

// Pixel-art signs for the physical interaction (no DOM text): a small chipped
// enamel plate with riveted ends showing what the buttons do as glyphs (a
// bakelite mouse with its button painted red, then the verb: a chair, a box,
// a door, an axe...), a hold plate (push / pull arrows, a power bolt, a shove
// burst and a strain gauge with a needle), and a strip of black embossed
// label tape for stepping through verbs one word at a time (letters punched
// in the 5x7 face, pips for where you are in the list, a red rubber stamp
// when it cannot be done). Everything is drawn into a tiny canvas at the
// game's own pixel size and shown with nearest-neighbour scaling.
import { Screen } from '../ui/font5x7';

const PAL: Record<string, number> = {
  k: 0x1d2a44, // enamel navy ink
  r: 0xb8382b, // signal red
  y: 0xc49a3c, // brass
  g: 0x8a8d86, // steel
  b: 0x4a3222, // bakelite
  w: 0xf4eedc, // highlight
  d: 0x141210, // outline
  u: 0x3c6e9a, // water blue
};
const ENAMEL = 0xe6ddc2, ENAMEL_LO = 0xd3c8a8, STEEL = 0x6f716b, TAPE = 0x1b1a18, TAPE_HI = 0x37342f, EMBOSS = 0xeeeadf;

/** 9x9 glyphs ('.' = nothing) */
const ART: Record<string, string[]> = {
  mouseR: ['..ddddd..', '.dbbdrrd.', '.dbbdrrd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '..dbbbd..', '...ddd...'],
  mouseL: ['..ddddd..', '.drrdbbd.', '.drrdbbd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '..dbbbd..', '...ddd...'],
  mouseH: ['..ddddd..', '.dbbdrrd.', '.dbbdrrd.', '.dbbbbbd.', '.dbbbbbd.', '.dbbbbbd.', '..dbbbd..', '...ddd...', '.yyyyyyy.'],
  hand: ['.........', '..k.k.k..', '.kkkkkkk.', '.kwkwkwk.', '.kkkkkkkk', '.kkkkkkk.', '..kkkkk..', '...kkk...', '...kkk...'],
  chair: ['.k.......', '.k.......', '.k.......', '.k.......', '.kkkkkk..', '.kyyyyk..', '.k....k..', '.k....k..', '.........'],
  bed: ['.........', '.........', 'k........', 'k.ww.....', 'kkkkkkkkk', 'kyyyyyyyk', 'k.......k', '.........', '.........'],
  box: ['.........', '.k.....k.', '..k...k..', '.kkkkkkk.', '.kyyyyyk.', '.kykkkyk.', '.kyyyyyk.', '.kkkkkkk.', '.........'],
  door: ['.kkkkkk..', '.kyyyyk..', '.kyyyyk..', '.kyyyyk..', '.kyyykk..', '.kyyyyk..', '.kyyyyk..', '.kkkkkk..', '.........'],
  key: ['.........', '.yyy.....', 'y...y....', 'y...yyyyy', 'y...y..y.', '.yyy...y.', '.........', '.........', '.........'],
  switch: ['..kkkkk..', '..kwwwk..', '..kwrwk..', '..kwrwk..', '..kwwwk..', '..kwwwk..', '..kkkkk..', '.........', '.........'],
  drop: ['....k....', '....k....', '...kuk...', '..kuuuk..', '..kuuuk..', '..kuwuk..', '...kkk...', '.........', '.........'],
  eat: ['......k..', '.....k...', '....k....', '.kkkkkkk.', '.kwwwwwk.', '..kwwwk..', '...kkk...', '.........', '.........'],
  book: ['.........', '.kkk.kkk.', '.kwwkwwk.', '.kwwkwwk.', '.kwwkwwk.', '.kkkkkkk.', '.........', '.........', '.........'],
  pickup: ['....r....', '....r....', '..r.r.r..', '...rrr...', '....r....', '.........', '.kkkkkkk.', '.kyyyyyk.', '.........'],
  walk: ['.kk......', '.kk......', '.k...kk..', '.....kk..', '.kk..k...', '.kk......', '.k...kk..', '.....kk..', '.....k...'],
  push: ['.kkkkkkk.', '.kyyyyyk.', '.kkkkkkk.', '....r....', '...rrr...', '..rrrrr..', '....r....', '....r....', '....r....'],
  pull: ['.kkkkkkk.', '.kyyyyyk.', '.kkkkkkk.', '....r....', '....r....', '....r....', '..rrrrr..', '...rrr...', '....r....'],
  power: ['.....rr..', '....rr...', '...rr....', '..rrrrr..', '....rr...', '...rr....', '..rr.....', '.rr......', '.........'],
  powerOff: ['.....kk..', '....kk...', '...kk....', '..kkkkk..', '....kk...', '...kk....', '..kk.....', '.kk......', '.........'],
  shove: ['k...k...k', '.k..k..k.', '..k.k.k..', '...kkk...', 'kkkkrkkkk', '...kkk...', '..k.k.k..', '.k..k..k.', 'k...k...k'],
  throw: ['...kkkk..', '..k....k.', '.k......k', '.k.....kk', 'k.......k', 'k........', 'yy.......', 'yy.......', '.........'],
  axe: ['..kkk....', '.kgggk...', 'kgggggk..', '.kgggk...', '..kykk...', '....yk...', '....y....', '....y....', '....y....'],
  hammer: ['.kkkkk...', '.kgggkk..', '.kkkkk...', '...y.....', '...y.....', '...y.....', '...y.....', '...y.....', '.........'],
  crowbar: ['.......rr', '......r.r', '.....r...', '....r....', '...r.....', '..r......', '.r.......', 'rr.......', 'r........'],
  saw: ['.........', 'yy.......', 'yykkkkkkk', 'yykgggggk', '..kgggggk', '..k.k.k.k', '.........', '.........', '.........'],
  knife: ['........k', '.......kg', '......kg.', '.....kg..', '....kg...', '...kk....', '..y......', '.y.......', 'y........'],
  lever: ['.....rr..', '.....rr..', '....k....', '...k.....', '..k......', '.kkk.....', 'kgggk....', 'kkkkk....', '.........'],
  flame: ['....r....', '...rr....', '...rrr...', '..rryrr..', '..ryyyr..', '..ryyyr..', '...ryr...', '...kkk...', '.........'],
  cross: ['.........', '...rrr...', '...rrr...', '.rrrrrrr.', '.rrrrrrr.', '.rrrrrrr.', '...rrr...', '...rrr...', '.........'],
  eye: ['.........', '.........', '..kkkkk..', '.k.www.k.', 'k.wkkkw.k', '.k.www.k.', '..kkkkk..', '.........', '.........'],
  gear: ['...k.k...', '..kkkkk..', '.kk...kk.', '.k..y..k.', '.kk...kk.', '..kkkkk..', '...k.k...', '.........', '.........'],
  pack: ['.kkkkkkk.', '.kgggggk.', '.kkkkkkk.', '.kgggggk.', '.kggyggk.', '.kgggggk.', '.kgggggk.', '.kkkkkkk.', '.........'],
  board: ['.........', 'yyyyyyyyy', 'yk.....ky', 'yyyyyyyyy', '.........', 'yyyyyyyyy', 'yk.....ky', 'yyyyyyyyy', '.........'],
  shovel: ['....y....', '....y....', '....y....', '....y....', '...ggg...', '..ggggg..', '..ggggg..', '...ggg...', '....g....'],
  give: ['.........', '....yy...', '....yy...', '.........', 'k.......k', 'kk.....kk', '.kkkkkkk.', '..kkkkk..', '.........'],
  down: ['....k....', '....k....', '....k....', '..kkkkk..', '...kkk...', '....k....', '.........', 'kkkkkkkkk', '.........'],
};

/** which glyph a verb gets */
const VERB_GLYPH: [RegExp, string][] = [
  [/^(Sit|Stand up)/, 'chair'], [/^(Sleep|Lie)/, 'bed'], [/^(Backpack)/, 'pack'],
  [/^(Search|Look inside|Put .* in|Deposit)/, 'box'], [/^(Unlock|Lock)/, 'key'], [/^Knock/, 'hand'],
  [/^(Open|Close|Go through|Step through|Climb|Call the elevator|Go down|Kick down)/, 'door'],
  [/^(Turn|Switch|Use computer)|lights/, 'switch'], [/^(Drink|Fill|Wash|Pour)/, 'drop'],
  [/^Cook|fire|fuel|^Light|^Put out/i, 'flame'], [/^(Eat|Take|Offer|Open$)/, 'eat'], [/^Read/, 'book'],
  [/^Pick up|^Carry/, 'pickup'], [/^Walk/, 'walk'], [/^(Pull the lever|Haul)/, 'lever'],
  [/^Check health|^Look|^Study|^Inspect|^Scan/, 'eye'],
  [/^(Treat|Apply|Disinfect|Stitch|Remove shard|Remove bandage|Revive)/, 'cross'], [/^Give/, 'give'],
  [/^(Barricade|Board|Nail|Remove barricade|Pry the boards|Hang)/, 'board'], [/^(Dig|Plant|Forage|Mark)/, 'shovel'],
  [/^Chop|^Break it down/, 'axe'], [/^(Smash|Kick|Knock the glass)/, 'hammer'], [/^(Pry|Force)/, 'crowbar'], [/^Saw/, 'saw'],
  [/^(Slash|Stab|Butcher)/, 'knife'], [/^(Take apart|Disassemble)/, 'gear'], [/^Clear/, 'shove'],
];
export function verbGlyph(label: string): string {
  for (const [re, g] of VERB_GLYPH) if (re.test(label)) return g;
  return 'gear';
}

function glyph(s: Screen, name: string, x: number, y: number, inv = false) {
  const a = ART[name] || ART.gear;
  for (let j = 0; j < a.length; j++) for (let i = 0; i < a[j].length; i++) {
    const ch = a[j][i];
    if (ch === '.' || ch === ' ') continue;
    let c = PAL[ch] ?? PAL.k;
    if (inv && (ch === 'k' || ch === 'd')) c = EMBOSS;
    s.px(x + i, y + j, Screen.c(c));
  }
}

/** enamel plate w x h with a steel edge, an inner ink line, rivets and two chipped corners */
function plate(s: Screen, w: number, h: number) {
  const C = Screen.c;
  s.rect(0, 0, w, h, C(STEEL));
  s.rect(1, 1, w - 2, h - 2, C(PAL.k));
  s.rect(2, 2, w - 4, h - 4, C(ENAMEL));
  s.hline(2, w - 3, h - 3, C(ENAMEL_LO));
  for (const x of [3, w - 4]) { s.px(x, Math.floor(h / 2), C(STEEL)); s.px(x, Math.floor(h / 2) - 1, C(0xb8b9b2)); }
  // chips: enamel knocked off to the steel and the dark under it
  s.px(1, 1, C(PAL.d)); s.px(2, 1, C(STEEL)); s.px(1, 2, C(STEEL)); s.px(2, 2, C(STEEL));
  s.px(w - 2, h - 2, C(PAL.d)); s.px(w - 3, h - 2, C(STEEL)); s.px(w - 3, h - 3, C(STEEL));
  s.px(0, 0, 0); s.px(w - 1, 0, 0); s.px(0, h - 1, 0); s.px(w - 1, h - 1, 0);
}

/** a strain gauge: a half dial, the needle at v (0..1), red at the top end */
function gauge(s: Screen, x: number, y: number, v: number) {
  const C = Screen.c, r = 5;
  for (let j = 0; j <= r; j++) for (let i = -r; i <= r; i++) {
    const d = Math.hypot(i, j);
    if (d > r + 0.4) continue;
    const ang = Math.atan2(j, -i) / Math.PI; // 0 left .. 1 right (upper half)
    s.px(x + r + i, y + r - j, C(d > r - 0.6 ? PAL.k : ang > 0.78 ? PAL.r : 0xf4efe0));
  }
  const a = Math.PI * (1 - Math.max(0, Math.min(1, v)));
  for (let t = 0; t <= r - 1; t += 0.5) s.px(x + r + Math.round(Math.cos(a) * t), y + r - Math.round(Math.sin(a) * t), C(PAL.d));
  s.px(x + r, y + r, C(PAL.r));
}

export type SignPart = { g: string } | { gap: number } | { gauge: number };

/** draw an enamel plate holding glyphs (and maybe a gauge): returns the screen */
export function enamelSign(parts: SignPart[]): Screen {
  let w = 6;
  for (const p of parts) w += 'g' in p ? 10 : 'gap' in p ? p.gap : 12;
  const h = 15;
  const s = new Screen(w, h);
  plate(s, w, h);
  let x = 4;
  for (const p of parts) {
    if ('g' in p) { glyph(s, p.g, x, 3); x += 10; }
    else if ('gap' in p) {
      // a little divider rivet line between groups
      if (p.gap >= 3) for (let y = 4; y < h - 4; y += 2) s.px(x + Math.floor(p.gap / 2), y, Screen.c(ENAMEL_LO));
      x += p.gap;
    } else { gauge(s, x, 3, p.gauge); x += 12; }
  }
  return s;
}

/**
 * A strip of embossed label tape: [glyph] ‹ WORD › with pips for the place in
 * the list; a red rubber stamp under it with why it cannot be done.
 */
export function labelTape(word: string, g: string, idx: number, n: number, why?: string | false, title?: string): { scr: Screen; leftEnd: number; rightStart: number } {
  const C = Screen.c;
  const txt = word.toUpperCase().slice(0, 28);
  const tw = txt.length * 6 - 1;
  const arrows = n > 1;
  const pipsW = n > 1 ? Math.min(n, 12) * 3 : 0;
  const tapeW = 4 + 10 + (arrows ? 6 : 0) + tw + (arrows ? 6 : 0) + (pipsW ? pipsW + 3 : 0) + 3;
  const titleTxt = (title || '').toUpperCase().slice(0, 26);
  const titleW = titleTxt ? titleTxt.length * 6 + 5 : 0;
  const whyTxt = why ? String(why).toUpperCase().slice(0, 26) : '';
  const whyW = whyTxt ? whyTxt.length * 6 + 5 : 0;
  const w = Math.max(tapeW, titleW, whyW + 4);
  const top = titleTxt ? 11 : 0;
  const h = top + 13 + (whyTxt ? 11 : 0);
  const s = new Screen(w, h);
  if (titleTxt) {
    // a small enamel tag with the thing's name
    s.rect(0, 0, titleW, 10, C(PAL.k)); s.rect(1, 1, titleW - 2, 8, C(ENAMEL));
    s.text(titleTxt, 3, 2, C(PAL.k));
  }
  // the tape, with notched ends
  const y0 = top;
  s.rect(0, y0, tapeW, 13, C(TAPE));
  s.hline(0, tapeW - 1, y0, C(TAPE_HI));
  for (const yy of [y0, y0 + 12]) { s.px(0, yy, 0); s.px(tapeW - 1, yy, 0); }
  s.px(0, y0 + 6, 0); s.px(tapeW - 1, y0 + 6, 0);
  let x = 3;
  glyph(s, g, x, y0 + 2, true); x += 11;
  const leftEnd = x + 5;
  if (arrows) { for (let j = 0; j < 5; j++) for (let i = 0; i <= Math.min(j, 4 - j); i++) s.px(x + 2 - i, y0 + 4 + j, C(PAL.y)); x += 6; }
  // punched letters: raised cream with a dark lip under each
  s.text(txt, x, y0 + 4, C(0x050505)); s.text(txt, x, y0 + 3, C(EMBOSS));
  x += tw + 2;
  const rightStart = x;
  if (arrows) { for (let j = 0; j < 5; j++) for (let i = 0; i <= Math.min(j, 4 - j); i++) s.px(x + i, y0 + 4 + j, C(PAL.y)); x += 6; }
  if (pipsW) {
    const m = Math.min(n, 12), sel = n > 12 ? Math.round(idx / (n - 1) * (m - 1)) : idx;
    for (let i = 0; i < m; i++) { const c = i === sel ? PAL.r : 0x6b675e; s.px(x + i * 3, y0 + 6, C(c)); s.px(x + i * 3 + 1, y0 + 6, C(c)); s.px(x + i * 3, y0 + 7, C(c)); s.px(x + i * 3 + 1, y0 + 7, C(c)); }
  }
  if (whyTxt) {
    // red rubber stamp, a little crooked
    const sy = y0 + 14, sx = 3;
    for (let i = 0; i < whyW; i++) { const dy = Math.round(i / whyW * 1.2); s.px(sx + i, sy + dy, C(PAL.r)); s.px(sx + i, sy + 9 + dy, C(PAL.r)); }
    s.vline(sx, sy, sy + 9, C(PAL.r)); s.vline(sx + whyW - 1, sy + 1, sy + 10, C(PAL.r));
    s.text(whyTxt, sx + 3, sy + 2, C(PAL.r));
  }
  return { scr: s, leftEnd, rightStart };
}

/** blit a Screen into a canvas element shown at k CSS px per pixel */
export function show(cv: HTMLCanvasElement, s: Screen, k: number) {
  if (cv.width !== s.w || cv.height !== s.h) { cv.width = s.w; cv.height = s.h; }
  cv.getContext('2d')!.putImageData(s.img, 0, 0);
  cv.style.width = s.w * k + 'px'; cv.style.height = s.h * k + 'px';
}

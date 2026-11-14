// THE MENU'S PIXEL KEYS (round 18): detailed 2D pixel art, hand-placed on a 32 x 32 grid, for the lab hub's
// corner keys (the codex, the research lattice, the emote jukebox, the commissary, the blueprint, Dr. Calder's
// guide) and the title console's keys (continue, a new unit's shock plug, the free-play reel, the co-op walkie,
// the load clipboard, the controls joystick, the about dossier, the settings gear).
// Each sprite: banded light from the top left (three or four tones per material), a one-pixel selective outline
// (a dark version of what it touches, black at the bottom), a dropped shadow pixel, a few hard glints.
// A sheet holds three frames stacked: rest, hot (lit lamps, a brighter key light) and pressed (one pixel down).
// Shown at whole multiples where possible (image-rendering: pixelated). No circles of blur, no rounded UI.
import { PixelCanvas } from '../../../gfx/pixel';

export type PixKind = 'codex' | 'tree' | 'jukebox' | 'shop' | 'blueprint' | 'guide' | 'guideOff'
  | 'play' | 'plug' | 'reel' | 'walkie' | 'radio' | 'clipboard' | 'joystick' | 'dossier' | 'gear'
  // the loop card: a crate of loot, the press, the debt's coin
  | 'crate' | 'press' | 'coin';

const N = 32;
const K = 0x0b0907;
const mul = (c: number, f: number) => ((Math.min(255, ((c >> 16) & 255) * f) << 16) | (Math.min(255, ((c >> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f)) >>> 0;

/** a little drawing kit over a PixelCanvas */
class P {
  constructor(readonly pc: PixelCanvas, readonly hot: boolean) {}
  px(x: number, y: number, c: number) { if (x >= 0 && y >= 0 && x < N && y < N) this.pc.set(x, y, c); }
  r(x: number, y: number, w: number, h: number, c: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  h(x0: number, x1: number, y: number, c: number) { for (let x = x0; x <= x1; x++) this.px(x, y, c); }
  v(x: number, y0: number, y1: number, c: number) { for (let y = y0; y <= y1; y++) this.px(x, y, c); }
  ln(x0: number, y0: number, x1: number, y1: number, c: number) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, x = x0, y = y0;
    for (;;) { this.px(x, y, c); if (x === x1 && y === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x += sx; } if (e2 <= dx) { e += dx; y += sy; } }
  }
  /** a filled disc, lit from the top left: ramp [dark, mid, light, glint] */
  ball(cx: number, cy: number, rad: number, ramp: number[]) {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      const d = x * x + y * y;
      if (d > rad * rad + rad * 0.6) continue;
      const l = (-x - y) / (rad * 1.6) + 0.15;
      const i = d > (rad - 0.9) * (rad - 0.9) && l < 0 ? 0 : l > 0.55 ? 2 : l > -0.25 ? 1 : 0;
      this.px(cx + x, cy + y, ramp[i]);
    }
    if (rad >= 2) this.px(cx - Math.ceil(rad / 2), cy - Math.ceil(rad / 2), ramp[3] ?? ramp[2]);
  }
  ring(cx: number, cy: number, rad: number, c: number) {
    for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; this.px(Math.round(cx + Math.cos(t) * rad), Math.round(cy + Math.sin(t) * rad), c); }
  }
  /** a box lit from the top left: top row light, left column light, right and bottom dark */
  box(x: number, y: number, w: number, hh: number, ramp: number[]) {
    this.r(x, y, w, hh, ramp[1]);
    this.h(x, x + w - 1, y, ramp[2]); this.v(x, y, y + hh - 1, ramp[2]);
    this.h(x, x + w - 1, y + hh - 1, ramp[0]); this.v(x + w - 1, y, y + hh - 1, ramp[0]);
  }
  /** a lamp: dark when off, a hot core and a halo pixel when lit */
  lamp(x: number, y: number, on: [number, number], off = 0x3a2a1a) {
    if (this.hot) { this.r(x, y, 2, 2, on[0]); this.px(x, y, on[1]); } else { this.r(x, y, 2, 2, off); this.px(x, y, mul(off, 1.5)); }
  }
}

function drawSheet(draw: (p: P) => void): string {
  const pc = new PixelCanvas(N, N * 3);
  pc.wrap = false;
  for (let f = 0; f < 3; f++) {
    const fr = new PixelCanvas(N, N);
    fr.wrap = false;
    draw(new P(fr, f === 1));
    outline(fr);
    const dy = f === 2 ? 1 : 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = fr.alpha(x, y);
      if (!a || y + dy >= N) continue;
      let c = fr.get(x, y);
      if (f === 1) c = mul(c, 1.1);
      if (f === 2) c = mul(c, 0.84);
      pc.set(x, f * N + y + dy, c, a);
    }
  }
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N * 3;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return cv.toDataURL();
}
/** a selective outline (a dark shade of what it touches; black below), then a soft shadow pixel down-right */
function outline(pc: PixelCanvas) {
  const solid = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) solid[y * N + x] = pc.alpha(x, y) > 0 ? 1 : 0;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && solid[y * N + x] === 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (solid[y * N + x]) continue;
    const n = at(x, y - 1) ? [x, y - 1] : at(x - 1, y) ? [x - 1, y] : at(x + 1, y) ? [x + 1, y] : at(x, y + 1) ? [x, y + 1] : null;
    if (n) pc.set(x, y, at(x, y - 1) ? K : mul(pc.get(n[0], n[1]), 0.28));
    else if (at(x - 1, y - 1) || at(x - 2, y - 1)) pc.set(x, y, 0x000000, 80);
  }
}

// ---------------------------------------------------------------- palettes (dark, mid, light, glint)
const STEEL = [0x4a5050, 0x7c8482, 0xb4bcb8, 0xf0f4f0];
const OLIVE = [0x3a4026, 0x5c6638, 0x84905a, 0xb8c088];
const BRASS = [0x7a5418, 0xb8862c, 0xe8c050, 0xfff0b0];
const RED = [0x6a1410, 0xa8281c, 0xd84a32, 0xffa080];
const PAPER = [0xa89a78, 0xd8ccac, 0xf2eadc, 0xffffff];
const MANILA = [0x9a7838, 0xc8a058, 0xe6c47e, 0xfff0c8];
const BLACK = [0x141414, 0x2a2a28, 0x46463e, 0x7a7a70];
const GREEN = [0x1a5a2a, 0x2a9a46, 0x5ae07a, 0xd8ffe0];
const WOOD = [0x4a2c14, 0x7a4a22, 0xa86c34, 0xd89a58];
const BLUE = [0x14305a, 0x245aa8, 0x4a86d0, 0xc8e0ff];
const AMBER: [number, number] = [0xffb030, 0xfff0c0];
const LIME: [number, number] = [0x5aff7a, 0xe8ffe8];

const SPR: Record<PixKind, (p: P) => void> = {
  // a filing cabinet of the codex, its top drawer pulled out on its runners, index cards and coloured tabs
  codex(p) {
    p.box(5, 9, 22, 21, OLIVE);
    p.h(6, 25, 19, OLIVE[0]); p.h(6, 25, 20, OLIVE[2]);
    // the lower drawer: a brass pull, a label frame
    p.box(12, 22, 8, 3, BRASS); p.r(13, 26, 6, 2, PAPER[1]); p.h(13, 18, 26, PAPER[2]);
    // the top drawer pulled out (deeper, lighter), cards standing in it
    p.box(3, 6, 26, 12, OLIVE);
    p.r(5, 4, 22, 4, PAPER[1]);
    for (let x = 5; x <= 26; x += 2) { p.v(x, 4, 7, PAPER[2]); p.px(x, 4, PAPER[3]); }
    const tabs = [0xd84a32, 0x4a86d0, 0xe8c050, 0x5ae07a, 0xd8ccac];
    tabs.forEach((c, i) => { p.r(6 + i * 4, 2, 3, 2, c); p.px(6 + i * 4, 2, mul(c, 1.3)); });
    p.box(12, 11, 8, 3, BRASS); p.px(12, 11, BRASS[3]);
    p.r(13, 15, 6, 2, PAPER[2]); p.h(14, 17, 15, 0x5a5040);
    // an eye glyph on the drawer label when hot (the archive's projector wakes)
    if (p.hot) { p.px(15, 16, 0x2a9a46); p.px(16, 16, 0x2a9a46); }
    p.px(4, 7, OLIVE[3]); p.px(5, 10, OLIVE[3]);
  },
  // the research lattice: a CRT square of linked nodes, the lit ones green, the next ones amber
  tree(p) {
    p.box(2, 3, 28, 25, STEEL);
    p.r(4, 5, 24, 20, 0x08140c);
    for (let y = 6; y < 25; y += 2) p.h(4, 27, y, 0x0c1c12);
    const nodes: [number, number, number][] = [[16, 8, 2], [9, 13, 2], [23, 13, 1], [6, 20, 1], [13, 20, 2], [20, 20, 1], [26, 21, 0]];
    const links: [number, number][] = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6], [4, 5]];
    for (const [a, b] of links) { const A = nodes[a], B = nodes[b]; p.ln(A[0], A[1], B[0], B[1], A[2] === 2 && B[2] === 2 ? 0x3ad060 : 0x2a5a3a); }
    for (const [x, y, s] of nodes) {
      const c = s === 2 ? (p.hot ? 0xaaffbe : 0x5ae07a) : s === 1 ? (p.hot ? 0xffd070 : 0xd8902a) : 0x3a5a46;
      p.r(x - 1, y - 1, 3, 3, mul(c, 0.6)); p.px(x, y, c); p.px(x - 1, y - 1, mul(c, 1.3));
    }
    // the bezel's foot: a plate and two lamps
    p.box(8, 27, 16, 3, OLIVE);
    p.lamp(10, 28, LIME); p.lamp(20, 28, AMBER);
  },
  // the emote jukebox: an arched cabinet, bubble tubes, a record behind the glass, a grille
  jukebox(p) {
    // the arch
    for (let y = 2; y <= 29; y++) {
      const w = y < 10 ? Math.round(Math.sqrt(Math.max(0, 81 - (10 - y) * (10 - y))) * 1.25) : 11;
      p.h(16 - w, 15 + w, y, WOOD[1]);
      p.px(16 - w, y, WOOD[2]); p.px(15 + w, y, WOOD[0]);
    }
    // bubble tubes along the arch
    const tube = p.hot ? [0xff6a3a, 0xffd050, 0x5ae0ff] : [0xc8481c, 0xd8a028, 0x3aa0c0];
    for (let y = 9; y <= 28; y++) { p.px(6, y, tube[(y >> 2) % 3]); p.px(25, y, tube[((y >> 2) + 1) % 3]); }
    for (let y = 3; y <= 9; y++) { const w = Math.round(Math.sqrt(Math.max(0, 81 - (10 - y) * (10 - y))) * 1.25) - 2; p.px(16 - w, y, tube[y % 3]); p.px(15 + w, y, tube[(y + 1) % 3]); }
    // the window and the record
    p.r(9, 6, 14, 10, 0x1a1410);
    p.ball(16, 11, 4, BLACK); p.ring(16, 11, 2, 0x5a5a50); p.r(15, 10, 2, 2, p.hot ? 0xffd050 : 0xd84a32);
    p.h(9, 22, 6, 0x4a3a2a);
    // the selector strip
    p.r(9, 17, 14, 3, PAPER[1]); for (let x = 10; x <= 21; x += 2) p.px(x, 18, 0x6a5a40);
    // the grille
    p.r(9, 21, 14, 7, BRASS[0]); for (let x = 10; x <= 21; x += 2) p.v(x, 22, 26, BRASS[2]);
    p.h(9, 22, 21, BRASS[2]);
    p.lamp(15, 28, AMBER);
  },
  // the commissary: a vending machine, the lit marquee, goods behind the glass, keypad, coin slot, flap
  shop(p) {
    p.box(5, 2, 22, 28, RED);
    p.r(7, 3, 18, 3, p.hot ? 0xfff0c0 : 0xf0d890);
    for (const x of [9, 11, 12, 14, 16, 18, 20, 22]) p.px(x, 4, 0x8a3a10);
    p.r(7, 7, 13, 14, 0x0e1820);
    const goods = [0xe2b21e, 0x6ad0c0, 0xd8402a, 0xe8e0d0, 0x8a5a30, 0x6a8ad0, 0x9ae070, 0xd870c0];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) { const g = goods[(r * 3 + c) % goods.length]; p.r(8 + c * 4, 8 + r * 4, 3, 3, g); p.px(8 + c * 4, 8 + r * 4, mul(g, 1.25)); p.px(10 + c * 4, 10 + r * 4, mul(g, 0.6)); }
      p.h(7, 19, 11 + r * 4, 0x5a6066);
    }
    p.px(8, 7, 0x9ab0c0); p.px(7, 8, 0x9ab0c0);
    // the keypad, the coin slot
    p.r(21, 8, 4, 7, STEEL[1]);
    for (let y = 9; y <= 13; y += 2) { p.px(22, y, PAPER[2]); p.px(23, y, PAPER[2]); }
    p.r(22, 16, 2, 3, K); p.px(21, 16, BRASS[2]);
    p.lamp(22, 19, LIME, 0x2a3a2a);
    // the delivery flap
    p.r(7, 23, 18, 4, 0x2a2622); p.h(7, 24, 23, K); p.h(7, 24, 26, 0x3a3630);
    if (p.hot) { p.r(14, 24, 3, 2, 0xe2b21e); }
  },
  // the blueprint: the sheet on the bench, a plan drawn on it, the roll at its edge and a pencil across
  blueprint(p) {
    for (let y = 4; y <= 24; y++) for (let x = 9; x <= 29; x++) {
      if (x - 25 > y - 4) continue;
      p.px(x, y, (x - 9) % 4 === 0 || (y - 4) % 4 === 0 ? BLUE[2] : BLUE[1]);
    }
    for (let y = 4; y <= 8; y++) for (let x = 25; x <= 29; x++) if (x - 25 <= y - 4 && x - 25 >= y - 5) p.px(x, y, BLUE[3]);
    const W = p.hot ? 0xffffff : 0xe6f0ff;
    p.h(11, 24, 7, W); p.v(11, 7, 22, W); p.h(11, 26, 22, W); p.v(26, 11, 22, W);
    p.v(18, 7, 14, W); p.h(18, 22, 14, W); p.h(11, 14, 15, W); p.v(14, 15, 22, BLUE[1]);
    p.px(15, 22, BLUE[1]); p.px(16, 22, BLUE[1]);
    p.r(21, 17, 3, 3, W); p.px(22, 18, BLUE[1]);
    const R = [0x0e2a58, 0x1a4488, 0x2a62b0, 0x5a8ed0, 0x9ac0ee, 0x3a72bc, 0x245aa8];
    for (let y = 5; y <= 26; y++) for (let x = 2; x <= 8; x++) p.px(x, y, R[x - 2]);
    for (let x = 2; x <= 8; x++) { p.px(x, 4, BLUE[3]); p.px(x, 27, R[0]); }
    p.ring(5, 4, 1, R[1]); for (let y = 8; y <= 25; y += 5) p.px(7, y, R[3]);
    for (let i = 0; i < 14; i++) { const x = 13 + i, y = 30 - i; p.px(x, y, 0xe8b020); p.px(x + 1, y, 0xf8d050); p.px(x, y - 1, 0xb07a10); }
    p.px(12, 30, 0xe8c890); p.px(11, 31, 0x303030); p.px(28, 16, 0xd8d8d8); p.px(29, 15, 0xe07a7a); p.px(28, 15, 0xc05a5a);
  },
  // Dr. Calder's guide: her desk telephone, the handset on its cradle, the dial, a call lamp; ringing when hot
  guide(p) { phone(p, false); },
  guideOff(p) { phone(p, true); },
  // continue: a big green triangle key on a steel plate
  play(p) {
    p.box(3, 4, 26, 24, STEEL);
    p.r(5, 6, 22, 20, BLACK[1]);
    for (let y = 0; y <= 14; y++) { const w = Math.round((y <= 7 ? y : 14 - y) * 1.3); p.h(11, 11 + w, 9 + y, y < 4 ? GREEN[2] : GREEN[1]); p.px(11 + w, 9 + y, GREEN[0]); }
    p.v(11, 9, 23, GREEN[2]); p.px(12, 11, GREEN[3]);
    p.lamp(24, 7, LIME, 0x1a3a22);
  },
  // a new unit: the link rig's heavy shock plug, three prongs, a ribbed grip, the cable, a spark when hot
  plug(p) {
    p.box(9, 10, 14, 13, BLACK);
    for (let y = 13; y <= 20; y += 2) p.h(10, 21, y, BLACK[2]);
    p.box(11, 4, 10, 7, BRASS);
    for (const x of [12, 15, 18]) { p.r(x, 1, 2, 4, STEEL[2]); p.px(x, 1, STEEL[3]); p.px(x + 1, 4, STEEL[0]); }
    p.r(12, 22, 8, 3, RED[1]); p.h(12, 19, 22, RED[2]);
    for (let i = 0; i < 9; i++) { p.px(15 - (i >> 2), 25 + i, BLACK[1]); p.px(16 - (i >> 2), 25 + i, BLACK[2]); }
    p.r(6, 29, 6, 2, BLACK[1]);
    if (p.hot) { p.px(10, 2, 0xfff0a0); p.px(9, 1, 0xffd040); p.px(22, 2, 0xfff0a0); p.px(23, 3, 0xffd040); p.px(24, 1, 0xffd040); p.px(8, 4, 0xffd040); }
    p.px(10, 11, BLACK[3]);
  },
  // free play: a tape reel, the spokes, tape wound on its hub, a loose end
  reel(p) {
    p.ball(16, 16, 13, STEEL);
    p.ball(16, 16, 9, [0x2a1a10, 0x4a2e18, 0x6a4424, 0x9a6a3a]);
    for (let a = 0; a < 3; a++) { const t = a * 2.094 + (p.hot ? 0.5 : 0); p.ln(16, 16, Math.round(16 + Math.cos(t) * 11), Math.round(16 + Math.sin(t) * 11), STEEL[2]); }
    p.ball(16, 16, 3, STEEL); p.r(15, 15, 2, 2, K);
    for (const [x, y] of [[9, 9], [23, 9], [9, 23], [23, 23]]) p.px(x, y, STEEL[0]);
    p.ln(27, 20, 31, 28, 0x4a2e18); p.ln(28, 20, 31, 26, 0x6a4424);
  },
  // co-op: a walkie-talkie with its antenna, speaker grille, push key and channel lamp
  walkie(p) {
    p.r(19, 1, 3, 8, BLACK[2]); p.px(19, 1, BLACK[3]); p.r(18, 0, 5, 2, BLACK[1]);
    p.box(8, 7, 16, 23, OLIVE);
    p.r(10, 10, 12, 8, BLACK[1]);
    for (let y = 11; y <= 16; y += 2) for (let x = 11; x <= 20; x += 2) p.px(x, y, BLACK[3]);
    p.r(10, 20, 12, 4, 0x0e1a10); p.h(11, 18, 21, p.hot ? 0x5ae07a : 0x2a6a3a); p.h(11, 15, 22, p.hot ? 0x5ae07a : 0x2a6a3a);
    p.box(10, 25, 5, 3, RED); p.box(17, 25, 5, 3, STEEL);
    p.r(6, 12, 2, 8, BLACK[1]);
    p.lamp(12, 8, RED.slice(2) as [number, number]);
    p.px(9, 8, OLIVE[3]);
  },
  // co-op (round 18): the field radio set (the band's radio icon): strap handle, telescopic aerial, a perforated
  // grille, the lit tuning window and its needle, two knurled knobs, a toggle and a lamp
  radio(p) {
    p.ln(7, 11, 5, 5, STEEL[2]); p.ln(5, 5, 4, 1, STEEL[3]); p.px(6, 8, STEEL[1]); p.px(4, 1, 0xffffff); p.px(3, 1, STEEL[3]);
    p.r(10, 7, 12, 2, 0x4a3420); p.h(10, 21, 7, 0x6a4c30); p.r(10, 8, 2, 3, STEEL[1]); p.r(20, 8, 2, 3, STEEL[1]);
    p.box(2, 11, 28, 17, OLIVE);
    p.r(4, 13, 12, 12, OLIVE[0]);
    for (let y = 14, k = 0; y <= 23; y += 2, k++) for (let x = 5 + (k & 1); x <= 14; x += 2) p.px(x, y, BLACK[0]);
    p.r(18, 13, 10, 5, BLACK[0]); p.r(19, 14, 8, 3, p.hot ? 0xf4e0a0 : 0xd0b060);
    for (let x = 19; x <= 26; x += 2) p.px(x, 16, 0x5a4020);
    p.v(24, 14, 16, 0xd8301e);
    p.box(18, 19, 4, 4, BLACK); p.px(19, 19, 0xe8dcb0);
    p.box(24, 19, 4, 4, BLACK); p.px(26, 19, 0xe8dcb0);
    p.px(19, 25, STEEL[3]); p.px(19, 24, STEEL[2]);
    p.lamp(25, 25, AMBER);
    p.r(4, 28, 4, 1, BLACK[1]); p.r(24, 28, 4, 1, BLACK[1]);
  },
  // load: a clipboard, its steel clip, a filled sheet with a progress tick box
  clipboard(p) {
    p.box(5, 4, 22, 27, WOOD);
    p.r(7, 7, 18, 22, PAPER[1]); p.h(7, 24, 7, PAPER[2]); p.v(24, 7, 28, PAPER[0]);
    for (let y = 12; y <= 26; y += 3) { p.h(9, 22, y, 0x8a8070); p.r(9, y - 1, 2, 2, y === 12 || y === 15 ? (p.hot ? 0x3ad060 : 0x2a8a4a) : 0x8a8070); }
    p.box(11, 1, 10, 6, STEEL); p.r(14, 2, 4, 2, STEEL[0]); p.px(12, 2, STEEL[3]);
  },
  // controls: an arcade joystick, the red ball, its shaft, the base plate and two buttons
  joystick(p) {
    p.box(3, 21, 26, 9, BLACK);
    p.h(4, 27, 22, BLACK[3]);
    p.r(13, 21, 6, 2, STEEL[0]);
    p.r(15, 10, 3, 12, STEEL[1]); p.v(15, 10, 21, STEEL[2]); p.v(17, 10, 21, STEEL[0]);
    p.ball(16, 7, 6, RED);
    p.ball(7, 25, 2, p.hot ? [0x8a6a10, 0xe8c050, 0xfff0a0, 0xffffff] : BRASS);
    p.ball(24, 25, 2, GREEN);
  },
  // about: a manila dossier, a paper and a photo corner sticking out, a paper clip, the string tie
  dossier(p) {
    p.r(4, 6, 24, 23, MANILA[0]);
    p.r(6, 3, 22, 24, PAPER[2]); p.h(6, 27, 3, PAPER[3]); for (let y = 7; y <= 20; y += 3) p.h(9, 24, y, 0x9a9080);
    p.r(19, 5, 7, 6, 0x5a6a7a); p.r(20, 6, 5, 4, 0x8aa0b0); p.px(21, 7, 0xd8e0e8);
    p.box(3, 11, 26, 19, MANILA);
    p.r(5, 9, 10, 3, MANILA[1]); p.h(5, 14, 9, MANILA[2]);
    p.ball(16, 20, 2, BRASS); p.ln(16, 22, 13, 28, 0x6a4a20);
    p.v(26, 1, 6, STEEL[2]); p.v(28, 1, 6, STEEL[2]); p.h(26, 28, 1, STEEL[2]); p.h(27, 28, 6, STEEL[1]);
    if (p.hot) p.r(7, 14, 6, 1, MANILA[3]);
  },
  // settings: a steel cog, eight teeth, a bored hub with a key slot
  gear(p) {
    for (let a = 0; a < 8; a++) {
      const t = a * (Math.PI / 4) + (p.hot ? Math.PI / 8 : 0);
      const cx = Math.round(16 + Math.cos(t) * 12), cy = Math.round(16 + Math.sin(t) * 12);
      p.r(cx - 2, cy - 2, 4, 4, Math.cos(t) + Math.sin(t) < 0 ? STEEL[2] : STEEL[0]);
    }
    p.ball(16, 16, 11, STEEL);
    p.ring(16, 16, 8, STEEL[0]);
    p.ball(16, 16, 4, BLACK); p.r(15, 13, 2, 3, K);
    p.px(11, 10, STEEL[3]);
  },
  // loot: a slatted wooden crate, nailed, a strap of light on the lid
  crate(p) {
    p.box(3, 8, 26, 21, WOOD);
    for (let y = 12; y <= 26; y += 5) { p.h(4, 27, y, WOOD[0]); p.h(4, 27, y + 1, WOOD[2]); }
    p.v(5, 9, 27, WOOD[3]); p.v(26, 9, 27, WOOD[0]);
    p.ln(5, 10, 26, 27, WOOD[0]); p.ln(6, 10, 27, 27, WOOD[2]);
    for (const [x, y] of [[5, 10], [26, 10], [5, 27], [26, 27]]) p.px(x, y, STEEL[2]);
    p.box(2, 5, 28, 4, WOOD); p.h(3, 28, 5, WOOD[3]);
    if (p.hot) { p.r(10, 3, 3, 2, 0xe8c050); p.r(19, 2, 2, 3, 0x9ab0c0); }
  },
  // the press: two columns, the crown, the ram coming down onto the plate, hazard stripes
  press(p) {
    p.box(3, 2, 26, 6, OLIVE);
    for (let x = 4; x <= 27; x += 4) p.r(x, 6, 2, 1, 0xe8b52a);
    p.box(4, 8, 4, 21, STEEL); p.box(24, 8, 4, 21, STEEL);
    p.r(14, 8, 4, p.hot ? 9 : 5, STEEL[2]); p.v(17, 8, p.hot ? 16 : 12, STEEL[0]);
    p.box(9, p.hot ? 17 : 13, 14, 4, STEEL);
    p.box(8, 24, 16, 3, RED);
    p.box(2, 28, 28, 3, BLACK);
    if (p.hot) { p.px(10, 23, 0xfff0a0); p.px(21, 23, 0xfff0a0); p.px(7, 22, 0xffd040); p.px(24, 22, 0xffd040); }
  },
  // the debt: a stack of credit chits, the top one face up with its notch
  coin(p) {
    for (let i = 0; i < 4; i++) { const y = 24 - i * 4; p.r(6, y, 20, 4, BRASS[1]); p.h(6, 25, y, BRASS[2]); p.h(6, 25, y + 3, BRASS[0]); p.v(6, y, y + 3, BRASS[2]); p.v(25, y, y + 3, BRASS[0]); }
    p.ball(16, 9, 8, BRASS); p.ring(16, 9, 5, BRASS[0]);
    p.r(15, 6, 2, 7, BRASS[0]); p.r(13, 7, 6, 1, BRASS[0]); p.r(13, 11, 6, 1, BRASS[0]);
    if (p.hot) p.px(11, 4, 0xffffff);
  },
};

function phone(p: P, off: boolean) {
  // the body: a sloped desk set
  for (let y = 14; y <= 29; y++) { const w = 10 + Math.min(4, (y - 14) >> 1); p.h(16 - w, 15 + w, y, y < 16 ? BLACK[2] : BLACK[1]); p.px(16 - w, y, BLACK[2]); p.px(15 + w, y, BLACK[0]); }
  // the dial: a cream disc with finger holes
  p.ball(16, 22, 6, PAPER); p.ring(16, 22, 4, 0x6a6458);
  for (let a = 0; a < 8; a++) { const t = a * 0.7 - 2.4; p.px(Math.round(16 + Math.cos(t) * 4), Math.round(22 + Math.sin(t) * 4), K); }
  p.r(15, 21, 2, 2, BRASS[2]);
  // the handset on the cradle (or lifted off, crooked, when muted)
  const hy = off ? 7 : 9;
  p.r(4, hy + 2, 24, 3, BLACK[1]); p.h(4, 27, hy + 2, BLACK[3]);
  p.r(2, hy, 6, 5, BLACK[2]); p.r(24, hy, 6, 5, BLACK[2]); p.h(2, 7, hy, BLACK[3]); p.h(24, 29, hy, BLACK[3]);
  p.r(6, 13, 2, 2, BLACK[0]); p.r(24, 13, 2, 2, BLACK[0]);
  // the call lamp; ringing marks when hot
  p.lamp(26, 17, off ? [0xd84a32, 0xffa080] : AMBER, off ? 0x5a1a10 : 0x3a2a1a);
  if (p.hot && !off) { for (const [x, y] of [[0, 3], [1, 2], [2, 1], [31, 3], [30, 2], [29, 1], [16, 2], [15, 1], [17, 1]]) p.px(x, y, 0xffd070); }
  if (off) { for (let i = 0; i < 6; i++) p.px(10 + i, 4 + (i & 1), 0x8a8478); }
}

const cache = new Map<PixKind, string>();
/** the three-frame sheet (32 x 96 art px: rest, hot, pressed) as a data URL */
export function pixSheet(kind: PixKind): string {
  let u = cache.get(kind);
  if (!u) { u = drawSheet(SPR[kind]); cache.set(kind, u); }
  return u;
}
export const PIX_N = N;

/**
 * a key's icon as an element: the sheet as its background, the hot frame on hover / focus of `host`, the pressed
 * frame while held; `scale` CSS px per art px (whole numbers stay crisp)
 */
export function pixIconEl(kind: PixKind, scale: number, host?: HTMLElement): HTMLElement {
  const i = document.createElement('i');
  i.className = 'pxi';
  const s = N * scale;
  Object.assign(i.style, { display: 'inline-block', width: s + 'px', height: s + 'px', flex: 'none', backgroundImage: `url(${pixSheet(kind)})`, backgroundSize: `${s}px ${s * 3}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', backgroundPosition: '0 0' });
  if (host) {
    const frame = (f: number) => { i.style.backgroundPosition = `0 ${-f * s}px`; };
    const hot = () => frame(document.activeElement === host || host.matches(':hover') ? 1 : 0);
    for (const ev of ['pointerenter', 'pointerleave', 'focus', 'blur', 'pointerup']) host.addEventListener(ev, () => requestAnimationFrame(hot));
    host.addEventListener('pointerdown', () => frame(2));
  }
  return i;
}

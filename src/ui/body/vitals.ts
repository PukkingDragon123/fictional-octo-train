// The vitals cluster of the body HUD (brain, heart engine, health bar, balloon), pixel art drawn every frame into one small
// buffer (pix.ts) and shown integer-upscaled in the top-left corner:
//
//   [ brain ]  [♥ ======== health bar ======== ]      (balloon)
//   [ pack  ]  moodles (tray.ts)                         |
//                                                     [weight]
//
// The brain is sanity: it throbs with the heartbeat (lub-dub), bruises, darkens,
// sprouts veins and cracks as sanity goes, sweats in a panic and flinches on a
// scare. The health bar is a riveted glass tube of blood: a hit flashes it,
// shakes it and leaves a pale ghost that drains after the real level; wounds
// drip from its belly; under a quarter it pulses red with the heart; healing
// sends a sheen and bubbles through it. The balloon is stamina, on a string
// tied to an iron weight: full of air it pulls the string taut, running lets
// the air out (it shrinks and wobbles), exhausted it sags to the floor,
// wrinkled and wheezing, and it gives a little pop when it runs dry.
import { Pix, mix, shade, hash, bayer } from './pix';
import { HeartEngine } from './heartEngine';

export const VW = 206, VH = 62;
/** regions in HUD pixels (the canvas is integer-upscaled) */
export const BRAIN = { x: 0, y: 2, w: 46, h: 38, cx: 23, cy: 21 };
export const PACK = { x: 13, y: 43, w: 18, h: 18 };
/** the heart engine (heartEngine.ts) sits between the brain and the bar and feeds it */
export const HEART = { x: 46, y: 2, w: 30, h: 40, cx: 62, cy: 23 };
export const BAR = { x: 76, y: 13, w: 96, h: 15 };
export const TRAY_AT = { x: 77, y: 32 };
export const ANCHOR = { x: 190, y: 53 };
const FLOOR = VH - 3;

const INK = 0x0a0b10;
// ---- palettes (dark → light)
const BRAIN_OK = [0x5a1830, 0x8e3450, 0xb4506a, 0xd6748a, 0xeea0aa, 0xfcd2cc];
const BRAIN_BAD = [0x150c1a, 0x2c1e34, 0x463650, 0x604c68, 0x7c6680, 0x9c8aa0];
const STEM = [0x5a2a30, 0x8a4a50, 0xb06e6c, 0xcc928a, 0xe2b4a6, 0xf2d4c4];
const CASE = [0x141210, 0x2a2420, 0x423832, 0x5e5048, 0x857262, 0xb09a84];
const BRASS = [0x2e200c, 0x5a4018, 0x8a6626, 0xb88e3a, 0xe0bc62, 0xfae0a0];
const BLOOD = [0xff8e7e, 0xf04a4a, 0xdc2a34, 0xc81e2e, 0xb01828, 0x981424, 0x82101e, 0x6c0c1a, 0x580a16, 0x440812, 0x34060e];
const EMPTY = [0x2a1616, 0x201010, 0x1c0e0e, 0x1a0d0d, 0x180c0c, 0x170b0b, 0x160a0a, 0x150a0a, 0x140909, 0x130808, 0x120808];
const BALLOON = [0x0c1e3a, 0x14365e, 0x1f5288, 0x2c72b2, 0x4694d6, 0x78bcf0, 0xd2f0ff];
const BALLOON_TIRED = [0x16181e, 0x262c36, 0x36404e, 0x4a5666, 0x60707e, 0x8494a2, 0xc4ced6];
const IRON = [0x101216, 0x22262c, 0x363c44, 0x50585e, 0x76808a, 0xa8b0b8];
const STRING = 0xd8ccb4;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ value noise
function vn(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ------------------------------------------------------------------ the brain, pre-baked at its base size
const BW = 46, BH = 38, BCX = 23, BCY = 19;
/** brain-space units to pixels */
const BS = 1.26;
/** fold frequency (noise cells per pixel) */
export let GYRI = 0.3;
export function setGyri(f: number) { GYRI = f; }
interface BrainBake { kind: Uint8Array; tone: Uint8Array; vein: Float32Array; crack: Float32Array; chip: Float32Array }
const E = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => { const dx = (x - cx) / rx, dy = (y - cy) / ry; return 1 - dx * dx - dy * dy; };
function cerebrum(x: number, y: number) { return Math.max(E(x, y, 0, -2.4, 14.6, 9.2), E(x, y, -7.2, -0.4, 8, 8.6), E(x, y, -1.6, 3.4, 9.8, 5.2), E(x, y, 8, -1.4, 7.4, 7.8)); }
function bakeBrain(): BrainBake {
  const N = BW * BH;
  const kind = new Uint8Array(N), tone = new Uint8Array(N), vein = new Float32Array(N), crack = new Float32Array(N), chip = new Float32Array(N);
  const groove = new Uint8Array(N);
  const at = (i: number, j: number) => [(i + 0.5 - BCX) / BS, (j + 0.5 - BCY) / BS];
  // silhouette: cerebrum over the stem over the cerebellum
  for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
    const [x, y] = at(i, j), k = j * BW + i;
    if (cerebrum(x, y) > 0) kind[k] = 1;
    else if (y > 3 && y < 13.5 && x > 0.2 + (y - 5) * 0.32 && x < 4.4 + (y - 5) * 0.32) kind[k] = 3;
    else if (E(x, y, 8.4, 6.6, 6, 3.8) > 0) kind[k] = 2;
  }
  const K = (i: number, j: number) => (i < 0 || j < 0 || i >= BW || j >= BH ? 0 : kind[j * BW + i]);
  // folds: the zero crossings of band-limited noise make a labyrinth of worm-like gyri (1 px lines), kept off the rim
  const gf = new Float32Array(N);
  for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
    const [x, y] = at(i, j);
    const w = (vn(x * 0.12 + 11, y * 0.12 + 3, 7) - 0.5) * 3;
    const gx = x * BS, gy = y * BS;
    gf[j * BW + i] = vn(gx * GYRI + w, gy * GYRI * 1.15 - w * 0.6, 3) * 0.8 + vn(gx * GYRI * 2 + 4, gy * GYRI * 2 + w, 5) * 0.2;
  }
  for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
    const k = j * BW + i;
    if (kind[k] !== 1) continue;
    const edge = !K(i - 1, j) || !K(i + 1, j) || !K(i, j - 1) || !K(i, j + 1) || K(i, j + 1) === 2 || K(i, j + 1) === 3;
    if (edge) continue;
    const a = gf[k] > 0.5;
    if ((i + 1 < BW && kind[k + 1] === 1 && (gf[k + 1] > 0.5) !== a && a) || (j + 1 < BH && kind[k + BW] === 1 && (gf[k + BW] > 0.5) !== a && a)) groove[k] = 1;
  }
  // the lateral fissure (temporal lobe) and the central sulcus
  const carve = (pts: [number, number][]) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = pts[s], [x1, y1] = pts[s + 1];
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let t = 0; t <= n; t++) {
        const i = Math.floor((x0 + (x1 - x0) * t / n) * BS + BCX), j = Math.floor((y0 + (y1 - y0) * t / n) * BS + BCY);
        if (K(i, j) === 1 && K(i, j + 1) && K(i, j - 1)) groove[j * BW + i] = 1;
      }
    }
  };
  carve([[-9, 2.6], [-5, 1.2], [-1, 0.4], [3, -0.6], [6.5, -2.2]]);
  carve([[1.6, -10.4], [0.6, -7], [1.4, -4.2], [0.2, -1.4]]);
  // light from the top-left: a dome over each part, folds dark, the lip below a fold lit
  const L = [-0.5, -0.7, 0.52];
  for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
    const k = j * BW + i, kd = kind[k];
    if (!kd) continue;
    const [x, y] = at(i, j);
    const h = (fx: number, fy: number) => Math.sqrt(Math.max(0, kd === 1 ? cerebrum(fx, fy) : kd === 2 ? E(fx, fy, 8.4, 6.6, 6, 3.8) : 0.3));
    const dx = (h(x + 0.5, y) - h(x - 0.5, y)) * 6, dy = (h(x, y + 0.5) - h(x, y - 0.5)) * 6;
    const nl = Math.hypot(dx, dy, 1);
    let lam = (-dx * L[0] - dy * L[1] + L[2]) / nl;
    if (kd === 3) lam = 0.35 + (x < 2 + (y - 5) * 0.32 ? 0.25 : 0);
    let t = Math.round(clamp(lam * 4.2 + 0.4 + (bayer(i, j) - 0.5) * 0.7, 1, 4));
    if (kd === 2) t = Math.round(clamp(lam * 3.6 + 0.4, 1, 4)) - ((j + (i >> 2)) % 2 === 0 ? 1 : 0);
    if (kd === 1) {
      if (groove[k]) t = 0;
      else if (j > 0 && groove[k - BW]) t = Math.min(5, t + 1 + (lam > 0.55 ? 1 : 0));
      else if (j < BH - 1 && groove[k + BW]) t = Math.max(1, t - 1);
    }
    tone[k] = clamp(t, 0, 5);
  }
  // veins: wandering from the stem and the underside up over the lobes; each has a sanity threshold
  const rnd = (n: number) => hash(n, 77, 13);
  const veinSeeds: [number, number, number, number][] = [[1, 4, -2.3, 0.62], [3, 3, -1.2, 0.5], [-6, 6, -2.0, 0.42], [7, 4, -1.5, 0.34], [-11, 1, -0.9, 0.26], [10, -1, -2.6, 0.18], [-3, -6, -0.2, 0.12]];
  veinSeeds.forEach(([sx, sy, ang, thr], n) => {
    const walk = (x: number, y: number, a: number, len: number, th: number, depth: number) => {
      for (let s = 0; s < len; s++) {
        const i = Math.floor(x * BS + BCX), j = Math.floor(y * BS + BCY);
        if (K(i, j) === 1 || K(i, j) === 2) { const k = j * BW + i; vein[k] = Math.max(vein[k], th); }
        a += (rnd(n * 97 + s * 13 + depth * 7) - 0.5) * 0.9;
        x += Math.cos(a) * 0.9; y += Math.sin(a) * 0.9;
        if (depth < 2 && s > 3 && rnd(n * 31 + s * 5 + depth) < 0.09) walk(x, y, a + (rnd(s + n) < 0.5 ? 0.9 : -0.9), Math.floor(len * 0.5), th * 0.8, depth + 1);
      }
    };
    walk(sx, sy, ang, 12 + Math.floor(rnd(n) * 6), thr, 0);
  });
  // cracks: jagged lines from the rim inward, the first at half sanity, the last near the end
  const crackSeeds: [number, number, number, number][] = [[-2, -11, 1.5, 0.5], [9, -8, 2.2, 0.38], [-13, -2, 0.3, 0.27], [11, 2, 3.4, 0.18], [-6, -9.5, 1.0, 0.1], [4, -10.8, 1.9, 0.06]];
  crackSeeds.forEach(([sx, sy, a0, thr], n) => {
    let x = sx, y = sy, a = a0;
    const len = 9 + Math.floor(rnd(n + 40) * 6);
    for (let s = 0; s < len; s++) {
      const i = Math.round(x * BS + BCX - 0.5), j = Math.round(y * BS + BCY - 0.5);
      if (K(i, j) === 1) {
        const k = j * BW + i; crack[k] = Math.max(crack[k], thr * (1 - s / len * 0.4));
        if (K(i + 1, j + 1) === 1) chip[(j + 1) * BW + i + 1] = Math.max(chip[(j + 1) * BW + i + 1], thr * (1 - s / len * 0.4));
      }
      const zig = (s % 2 ? 1 : -1) * (0.5 + rnd(n * 11 + s) * 0.7);
      x += Math.cos(a + zig) * 1.1; y += Math.sin(a + zig) * 1.1;
      if (s === 4 && rnd(n + 9) < 0.7) { let bx = x, by = y; const ba = a + 0.9; for (let q = 0; q < 4; q++) { bx += Math.cos(ba) * 1.1; by += Math.sin(ba) * 1.1; const bi = Math.round(bx * BS + BCX - 0.5), bj = Math.round(by * BS + BCY - 0.5); if (K(bi, bj) === 1) crack[bj * BW + bi] = Math.max(crack[bj * BW + bi], thr * 0.7); } }
    }
  });
  return { kind, tone, vein, crack, chip };
}

// ------------------------------------------------------------------ the rucksack (16x16)
const PACK_ART = [
  '......kkkkkk......',
  '.....kssssssk.....',
  '.....ks....sk.....',
  '...kkkkkkkkkkkk...',
  '..khhhhhhhhhhhhk..',
  '.khffffffffffffFk.',
  '.kfffsffffffsffFk.',
  '.kFFFsFFFFFFsFFdk.',
  '.kkkkbkkkkkkbkkkk.',
  'kqkmmsmmmmmmsmmkqk',
  'kpkmmmmmmmmmmmmkpk',
  'kpkmkkkkkkkkkkmkpk',
  'kpkmkqqqqqqqqkmkpk',
  'kpkmkppppbpppkmkpk',
  'kpkmkppppppppkmkpk',
  'kdkmkkkkkkkkkkmkdk',
  '.kkddddddddddddkk.',
  '..kkkkkkkkkkkkkk..',
];
const PACK_PAL: Record<string, number> = { k: 0x16140c, f: 0x9c9654, h: 0xc8c27a, F: 0x767238, d: 0x3a381a, m: 0x7a7638, s: 0x5a3c22, b: 0xf0c450, p: 0x666230, q: 0x9a9450 };

export interface VitalsIn {
  hp: number; blood: number; bleed: number; sick: number; corrupt: number;
  sanity: number; panic: number; bpm: number;
  stamina: number; breath: number; running: boolean; moving: boolean;
  dead: boolean;
  pumping: boolean; pumpPos: number; pumpFlash: number; pumpEnd: number; pumpGood: boolean;
  showPack: boolean;
  hover: 'brain' | 'bar' | 'balloon' | 'pack' | 'watch' | null;
  /** the treatment pegboard is over the balloon */
  hideBalloon?: boolean;
}

interface Drip { x: number; y: number; vy: number; t: number; hang: number; on: boolean }
interface Mote { x: number; y: number; vx: number; vy: number; t: number; c: number; kind: number; on: boolean }
interface RopePt { x: number; y: number; px: number; py: number }

export class Vitals {
  pix = new Pix(VW, VH);
  W = VW; H = VH;
  /** the standalone strip (brain, heart, bar, balloon on a weight, pack) or, false, an overlay on the 3D rig (brain + balloon + watch icon only) */
  full = true;
  /** the brain is a 3D machine on the rig (brain3d.ts): only its sweat and picking stay here */
  brain3d = false;
  /** where the brain and the balloon's tie sit (HUD px); the rig moves them every frame */
  brainC = { x: BRAIN.cx, y: BRAIN.cy };
  anchor = { x: ANCHOR.x, y: ANCHOR.y };
  floor = FLOOR;
  private seg = 2.65;
  /** the watch icon (rig overlay): where, lit by a note, hovered */
  watchAt: { x: number; y: number } | null = null;
  watchLit = 0;
  /** switch to the rig overlay at this buffer size; the string is this long (HUD px) */
  rigMode(w: number, h: number, rope: number) {
    if (this.full || w !== this.W || h !== this.H) { this.pix = new Pix(w, h); this.W = w; this.H = h; }
    this.full = false; this.seg = Math.max(1.2, rope / (this.rope.length - 1));
  }
  private brain = bakeBrain();
  time = 0;
  // ---- the heart engine keeps the beat for everything
  readonly heart = new HeartEngine(HEART.cx, HEART.cy);
  private waves: number[] = [];
  // ---- health
  hpShown = 100; lag = 100; private holdT = 0; private lastHp = -1;
  flash = 0; private shake = 0; private sx = 0; private sy = 0;
  heal = 0; private sweep = -1; private slosh = 0; private sloshV = 0;
  private drips: Drip[] = [];
  private dripAcc = 0;
  // ---- brain
  sanityShown = 100; twitch = 0; private lastPanic = 0; private sweatAcc = 0;
  // ---- balloon
  private rope: RopePt[] = [];
  vol = 1; private volV = 0; bAng = 0; private bAngV = 0;
  private wasTired = false; private popT = 0; tape = 0; private wheezeT = 1;
  private runJolt = 0;
  /** where the balloon's body is (HUD px) for hit tests */
  bCx: number = ANCHOR.x; bCy = 14; bR = 10;
  // ---- motes: sparkles, puffs, sweat
  private motes: Mote[] = [];
  /** one-shot events for the HUD to play sounds on */
  events: string[] = [];

  constructor() {
    for (let i = 0; i < 9; i++) this.rope.push({ x: ANCHOR.x, y: ANCHOR.y - i * 2.6, px: ANCHOR.x, py: ANCHOR.y - i * 2.6 });
    for (let i = 0; i < 48; i++) this.drips.push({ x: 0, y: 0, vy: 0, t: 0, hang: 0, on: false });
    for (let i = 0; i < 72; i++) this.motes.push({ x: 0, y: 0, vx: 0, vy: 0, t: 0, c: 0, kind: 0, on: false });
  }

  // ================================================================ events from the world
  /** a blow landed (dmg in health points): flash, shake, slosh */
  hit(dmg: number) {
    const k = clamp(dmg / 20, 0.15, 1);
    this.flash = Math.min(1, this.flash + 0.55 + k * 0.45);
    this.shake = Math.min(3.2, this.shake + 1 + k * 2.2);
    this.sloshV += (Math.random() < 0.5 ? -1 : 1) * (6 + 10 * k);
    this.holdT = 0.55;
    this.twitch = Math.min(1, this.twitch + 0.35 + k * 0.4);
    this.heart.hit(k);
  }
  scare(k = 1) { this.twitch = Math.min(1, this.twitch + 0.5 * k + 0.2); }
  /** running footfalls and turns knock the balloon about */
  jolt(vx: number, vy: number) { const r = this.rope[this.rope.length - 1]; r.px -= vx / 120; r.py -= vy / 120; }
  private mote(x: number, y: number, vx: number, vy: number, t: number, c: number, kind: number) {
    for (const m of this.motes) if (!m.on) { m.on = true; m.x = x; m.y = y; m.vx = vx; m.vy = vy; m.t = t; m.c = c; m.kind = kind; return; }
  }

  // ================================================================ per frame
  update(dt: number, s: VitalsIn) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    // ---- the heart engine: lub-dub, stutters, skipped beats; each stroke sends a wave down the tube
    this.heart.update(dt, this.hpShown, s.dead ? 0 : clamp(s.bpm, 40, 200), s.bleed, s.dead);
    for (const e of this.heart.events) { if (e === 'beat') this.waves.push(0); else if (e === 'stall') this.events.push('stall'); }
    this.heart.events.length = 0;
    for (let i = 0; i < this.waves.length; i++) this.waves[i] += dt * (60 + 80 * this.heart.str);
    if (this.waves.length && this.waves[0] > BAR.w) this.waves.shift();
    // ---- health
    const hp = clamp(s.hp, 0, 100);
    if (this.lastHp < 0) { this.lastHp = hp; this.hpShown = hp; this.lag = hp; }
    const d = hp - this.lastHp;
    if (d < -0.35) { if (this.holdT <= 0 && this.lag < this.hpShown) this.lag = this.hpShown; this.hit(-d); }
    if (d > 0.02) { this.heal = Math.min(1.4, this.heal + d * 0.6 + 0.04); if (this.sweep < 0 && this.heal > 0.3) this.sweep = 0; }
    this.lastHp = hp;
    this.hpShown += (hp - this.hpShown) * Math.min(1, dt * 14);
    if (this.holdT > 0) this.holdT -= dt;
    else this.lag = Math.max(this.hpShown, this.lag - dt * (14 + (this.lag - this.hpShown) * 1.2));
    if (this.lag < this.hpShown) this.lag = this.hpShown;
    this.flash = Math.max(0, this.flash - dt * 4.5);
    this.shake = Math.max(0, this.shake - dt * 9);
    this.sx = this.shake > 0.2 ? Math.round((Math.random() - 0.5) * 2 * this.shake) : 0;
    this.sy = this.shake > 0.2 ? Math.round((Math.random() - 0.5) * 1.2 * this.shake) : 0;
    this.heal = Math.max(0, this.heal - dt * 0.7);
    if (this.sweep >= 0) { this.sweep += dt * 150; if (this.sweep > BAR.w + 20) this.sweep = this.heal > 0.25 ? 0 : -1; }
    if (this.full && this.heal > 0.1 && Math.random() < dt * 14 * this.heal) {
      const fx = BAR.x + 10 + Math.random() * Math.max(4, (BAR.w - 14) * this.hpShown / 100);
      this.mote(fx, BAR.y + 3 + Math.random() * 6, (Math.random() - 0.5) * 4, -10 - Math.random() * 10, 0.7 + Math.random() * 0.4, 0xc8ffd0, 1);
    }
    // the blood sloshes when you move and when you are hit
    this.sloshV += (-this.slosh * 70 - this.sloshV * 5) * dt;
    if (s.running && Math.random() < dt * 5) this.sloshV += (Math.random() - 0.5) * 8;
    this.slosh += this.sloshV * dt;
    // wounds drip from the belly of the tube
    if (!s.dead && s.bleed > 0.015 && this.full) {
      this.dripAcc += dt * Math.min(9, 0.7 + s.bleed * 5.5);
      while (this.dripAcc >= 1) {
        this.dripAcc -= 1;
        const x0 = BAR.x + 10, x1 = x0 + Math.max(2, (BAR.w - 12) * this.hpShown / 100 - 2);
        for (const q of this.drips) if (!q.on) { q.on = true; q.x = Math.round(x0 + Math.random() * (x1 - x0)); q.y = BAR.y + BAR.h; q.vy = 0; q.t = 0; q.hang = 0.25 + Math.random() * 0.5; break; }
      }
    }
    for (const q of this.drips) if (q.on) {
      q.t += dt;
      if (q.t > q.hang) { q.vy += 160 * dt; q.y += q.vy * dt; }
      if (q.y > this.H + 2 || q.t > q.hang + 0.9) q.on = false;
    }
    // ---- the brain
    const san = clamp(s.sanity, 0, 100);
    this.sanityShown += (san - this.sanityShown) * Math.min(1, dt * 2.5);
    const jump = s.panic - this.lastPanic;
    if (jump > 5) this.scare(Math.min(1, jump / 25));
    this.lastPanic = s.panic;
    this.twitch = Math.max(0, this.twitch - dt * 1.8);
    if (!s.dead && s.panic > 42) {
      this.sweatAcc += dt * (s.panic - 42) / 22;
      while (this.sweatAcc >= 1) {
        this.sweatAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.mote(this.brainC.x + side * (7 + Math.random() * 5), this.brainC.y - 13 + Math.random() * 3, side * (10 + Math.random() * 12), -14 - Math.random() * 10, 0.9, 0xbfe6ff, 2);
      }
    }
    // ---- the balloon
    this.balloon(dt, s);
    // ---- motes
    for (const m of this.motes) if (m.on) {
      m.t -= dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.kind === 2) m.vy += 70 * dt;
      else if (m.kind === 3) { m.vx *= 1 - dt * 2; m.vy *= 1 - dt * 2; }
      if (m.t <= 0 || m.y > this.H + 2) m.on = false;
    }
  }

  private balloon(dt: number, s: VitalsIn) {
    // air: stamina, breathing on top, a little more while you pump IN
    let want = clamp(s.stamina, 0, 1);
    want = want * (0.94 + 0.06 * clamp(s.breath, 0.3, 1.3));
    if (s.pumping) want = clamp(want + (s.pumpPos - 0.5) * 0.22, 0, 1.1);
    if (s.dead) want = 0.05;
    // a rubbery spring: it overshoots as it fills, then settles
    this.volV += ((want - this.vol) * 55 - this.volV * 7) * dt;
    this.vol = clamp(this.vol + this.volV * dt, 0.02, 1.2);
    // runs dry: a little pop, a puff, a spin, and a scrap of tape until it recovers
    const tired = s.stamina < 0.07 && !s.dead;
    if (tired && !this.wasTired) {
      this.popT = 0.5; this.volV -= 2.2; this.bAngV += (Math.random() < 0.5 ? -1 : 1) * 9; this.tape = 1;
      this.jolt((Math.random() - 0.5) * 70, -50);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; this.mote(this.bCx + Math.cos(a) * this.bR, this.bCy + Math.sin(a) * this.bR, Math.cos(a) * 26, Math.sin(a) * 26, 0.35, 0xe8eef2, 3); }
      this.events.push('pop');
    }
    this.wasTired = tired;
    if (this.tape > 0 && s.stamina > 0.6) this.tape = Math.max(0, this.tape - dt * 2);
    this.popT = Math.max(0, this.popT - dt);
    // wheezing when it is nearly empty
    if (!s.dead && s.stamina < 0.2) {
      this.wheezeT -= dt * (s.running ? 2.2 : 1);
      if (this.wheezeT <= 0) {
        this.wheezeT = 0.5 + Math.random() * 0.7;
        const r = this.rope[this.rope.length - 1];
        for (let i = 0; i < 3; i++) this.mote(r.x, r.y + 1, (Math.random() - 0.5) * 10, 6 + Math.random() * 6, 0.5 + Math.random() * 0.3, 0xdde4ea, 3);
        if (Math.random() < 0.35) this.events.push('wheeze');
      }
    }
    // running shakes it: footfalls jolt the knot, and it shivers
    if (s.running && !s.dead) { this.runJolt -= dt; if (this.runJolt <= 0) { this.runJolt = 0.3; this.jolt((Math.random() - 0.5) * 34, 8 + Math.random() * 10); } }
    // ---- verlet string: pinned to the weight, the balloon pulls the end up
    const v = this.vol;
    const R = this.rope, n = R.length, seg = this.seg, A = this.anchor;
    // how high it floats: full of air the string is taut, spent it rests on the floor by the weight
    const L = seg * (n - 1);
    const yT = A.y - 2 - L * clamp(0.04 + 1.05 * sstep(0.06, 0.9, v), 0, 1);
    const steps = 2, h = dt / steps;
    const breeze = Math.sin(this.time * 0.7) * 5 + Math.sin(this.time * 1.9 + 1) * 2;
    for (let st = 0; st < steps; st++) {
      for (let i = 1; i < n; i++) {
        const p = R[i];
        const last = i === n - 1;
        const vy = (p.y - p.py) / h, vx = (p.x - p.px) / h;
        const ax = last ? breeze * (1.4 - v * 0.6) + (A.x - 1 - p.x) * 3 - vx * 0.6 : breeze * 0.2;
        const ay = last ? (yT - p.y) * (40 + 60 * v) - vy * (2.2 + 2 * v) : 34;
        const damp = last ? 0.99 : 0.96;
        const nx = p.x + (p.x - p.px) * damp + ax * h * h, ny = p.y + (p.y - p.py) * damp + ay * h * h;
        p.px = p.x; p.py = p.y; p.x = nx; p.y = ny;
      }
      R[0].x = A.x; R[0].y = A.y; R[0].px = A.x; R[0].py = A.y;
      for (let it = 0; it < 8; it++) {
        for (let i = 0; i < n - 1; i++) {
          const a = R[i], b = R[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1e-4;
          if (dl <= seg) continue;
          const wa = i === 0 ? 0 : 0.5, wb = i === 0 ? 1 : i + 1 === n - 1 ? 0.25 : 0.5;
          const k = (dl - seg) / dl / (wa + wb);
          a.x += dx * k * wa; a.y += dy * k * wa; b.x -= dx * k * wb; b.y -= dy * k * wb;
        }
        for (let i = 1; i < n; i++) {
          const p = R[i];
          // the floor, the weight, the walls of our little stage
          if (p.y > this.floor) p.y = this.floor;
          if (i === n - 1) { p.x = this.full ? clamp(p.x, BAR.x + BAR.w + 4 + this.bR * 0.6, VW - 2 - this.bR * 0.6) : clamp(p.x, A.x - 12, A.x + 12); p.y = Math.max(p.y, 3 + this.bR * 2); }
          if (Math.abs(p.x - A.x) < 6 && p.y > A.y - 1) p.y = A.y - 1;
        }
      }
    }
    // the balloon leans along the string; it swings past and back
    const K = R[n - 1], P = R[n - 3];
    const target = Math.atan2(K.x - P.x, P.y - K.y) * (v > 0.3 ? 1 : 0.6);
    this.bAngV += ((clamp(target, -1.2, 1.2) - this.bAng) * 30 - this.bAngV * 4.5) * dt;
    if (s.running) this.bAngV += (Math.random() - 0.5) * dt * 30;
    this.bAng = clamp(this.bAng + this.bAngV * dt, -1.5, 1.5);
    this.bR = 5.4 + 5.8 * clamp(this.vol, 0, 1.15);
    const ux = Math.sin(this.bAng), uy = -Math.cos(this.bAng);
    this.bCx = K.x + ux * (this.bR + 1); this.bCy = K.y + uy * (this.bR + 1);
  }

  // ================================================================ drawing
  draw(s: VitalsIn) {
    const P = this.pix;
    P.clear();
    if (!this.brain3d) this.drawBrain(P, s);
    if (this.full) {
      if (s.showPack) this.drawPack(P, s.hover === 'pack');
      this.drawWeight(P);
    } else if (this.watchAt) this.drawWatch(P, this.watchAt.x, this.watchAt.y, s.hover === 'watch');
    if (!s.hideBalloon) this.drawBalloon(P, s);
    if (this.full) {
      this.drawBar(P, s);
      this.heart.draw(P, HEART.cx, HEART.cy, this.hpShown, s.dead, s.hover === 'bar', { x: BAR.x + 2 + this.sx, y: BAR.y + 7 });
    }
    for (const q of this.drips) if (q.on) {
      const len = q.t < q.hang ? (q.t / q.hang > 0.5 ? 2 : 1) : q.vy > 60 ? 3 : 2;
      for (let i = 0; i < len; i++) P.set(q.x + this.sx, q.y + i, i === 0 && len > 1 ? 0xe03a46 : 0xa8101e);
    }
    for (const m of this.motes) if (m.on && m.kind === 2) { P.set(m.x, m.y, m.c); P.set(m.x, m.y + 1, 0x6aa8e0); }
    if (s.pumping && this.full) this.drawGauge(P, s);
    P.outline(INK, 0.4);
    // over the ink: the string, puffs, sparkles, the critical glow
    if (!s.hideBalloon) this.drawString(P);
    if (!this.full && !s.hideBalloon) { const ax = Math.round(this.anchor.x), ay = Math.round(this.anchor.y); P.set(ax - 1, ay, 0xe0b450); P.set(ax, ay, 0xfae0a0); P.set(ax + 1, ay, 0xb88e3a); P.set(ax, ay + 1, 0x8a6626); }
    this.heart.drawSteam(P);
    for (const m of this.motes) if (m.on) {
      if (m.kind === 1) { const a = clamp(m.t * 2, 0, 1); P.blend(m.x, m.y, m.c, a); if (m.t > 0.4) { P.blend(m.x - 1, m.y, m.c, a * 0.5); P.blend(m.x + 1, m.y, m.c, a * 0.5); P.blend(m.x, m.y - 1, m.c, a * 0.5); P.blend(m.x, m.y + 1, m.c, a * 0.5); } }
      else if (m.kind === 3) { if (bayer(Math.round(m.x), Math.round(m.y)) < clamp(m.t * 2.2, 0, 0.9)) P.blend(m.x, m.y, m.c, 0.85); }
    }
    if (!this.brain3d) this.drawLeak(P, s);
  }

  // ---------------------------------------------------------------- brain
  private beatEnv(): number { return Math.min(1.2, this.heart.env()); }
  private drawBrain(P: Pix, s: VitalsIn) {
    const B = this.brain;
    const san = this.sanityShown / 100;
    const env = s.dead ? 0 : this.beatEnv();
    const throb = 1 + 0.075 * env * (0.6 + 0.4 * san) + (s.hover === 'brain' ? 0.03 : 0);
    const tw = this.twitch;
    const jx = tw > 0.05 ? Math.round(Math.sin(this.time * 71) * 1.6 * tw) : 0;
    const jy = tw > 0.05 ? Math.round(Math.cos(this.time * 53) * 1.1 * tw) : 0;
    const sqx = throb * (1 + tw * 0.08 * Math.sin(this.time * 40)), sqy = throb * (1 - tw * 0.06 * Math.sin(this.time * 40));
    // healthy pink → bruised, grey, dark
    const k = s.dead ? 0 : sstep(0.05, 0.92, san);
    const dark = s.dead ? 0.5 : 0.62 + 0.38 * sstep(0, 0.6, san);
    const ramp = BRAIN_OK.map((c, i) => shade(mix(BRAIN_BAD[i], c, k), dark));
    const stem = STEM.map((c, i) => shade(mix(BRAIN_BAD[i], c, 0.4 + 0.6 * k), dark));
    const veinOn = s.dead ? 0 : 1 - san;
    const veinC = mix(0x5a0a2a, 0xd8203c, clamp(env * 0.9 + (1 - san) * 0.3, 0, 1));
    const cx = this.brainC.x + jx, cy = this.brainC.y + jy;
    const R = 25;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      const bx = Math.floor((x + 0.5 - cx) / sqx + BCX), by = Math.floor((y + 0.5 - cy) / sqy + BCY);
      if (bx < 0 || by < 0 || bx >= BW || by >= BH) continue;
      const i = by * BW + bx, kd = B.kind[i];
      if (!kd) continue;
      let c = kd === 3 ? stem[B.tone[i]] : ramp[B.tone[i]];
      if (kd === 1 && B.vein[i] > 0 && veinOn > 1 - B.vein[i] * 1.5) c = B.tone[i] === 0 ? shade(veinC, 0.7) : veinC;
      if (kd === 1 && B.crack[i] > 0 && san < B.crack[i]) c = INK;
      else if (kd === 1 && B.chip[i] > 0 && san < B.chip[i]) c = mix(ramp[5], 0xffffff, 0.3);
      P.set(x, y, c);
    }
  }
  /** the simulation leaking through the cracks when sanity is nearly gone */
  private drawLeak(P: Pix, s: VitalsIn) {
    const san = this.sanityShown / 100;
    if (s.dead || san > 0.2) return;
    const B = this.brain, a = (0.2 - san) / 0.2;
    if (Math.sin(this.time * 9) < 0.2 - a) return;
    const env = this.beatEnv();
    const throb = 1 + 0.075 * env * 0.6;
    for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
      const i = by * BW + bx;
      if (B.crack[i] > 0 && san < B.crack[i] && hash(bx, by, Math.floor(this.time * 8)) < 0.35 + a * 0.4) {
        const x = Math.round((bx + 0.5 - BCX) * throb + this.brainC.x - 0.5), y = Math.round((by + 0.5 - BCY) * throb + this.brainC.y - 0.5);
        P.blend(x, y, 0x8affa8, 0.55 + a * 0.4);
      }
    }
  }

  // ---------------------------------------------------------------- health bar
  private drawBar(P: Pix, s: VitalsIn) {
    const x0 = BAR.x + this.sx, y0 = BAR.y + this.sy, W = BAR.w, H = BAR.h;
    const hp = this.hpShown / 100, lag = this.lag / 100;
    const crit = s.dead ? 0 : clamp((28 - this.hpShown) / 28, 0, 1);
    const env = s.dead ? 0 : this.beatEnv();
    const pulse = crit > 0 ? env * (0.5 + crit * 0.5) : 0;
    const hov = s.hover === 'bar' ? 1 : 0;
    // the critical glow: a red dither around the casing on every beat
    if (pulse > 0.05) {
      for (let y = y0 - 3; y < y0 + H + 3; y++) for (let x = x0 - 3; x < x0 + W + 3; x++) {
        const dx = Math.max(x0 - x, x - (x0 + W - 1), 0), dy = Math.max(y0 - y, y - (y0 + H - 1), 0);
        const dd = Math.max(dx, dy);
        if (dd > 0 && bayer(x, y) < pulse * (1 - dd / 4) * 0.9) P.blend(x, y, 0xff2a2a, 0.3);
      }
    }
    // inner glass: rows 2..H-3, columns 9..W-3 (the left end is the brass cap under the heart)
    const gx0 = x0 + 9, gx1 = x0 + W - 3, gy0 = y0 + 2, gy1 = y0 + H - 3;
    const gw = gx1 - gx0 + 1, rows = gy1 - gy0 + 1;
    const fillX = gx0 + gw * hp, lagX = gx0 + gw * lag;
    // blood darkens as you lose it; sickness and corruption get into it
    const thin = clamp((100 - s.blood) / 60, 0, 1);
    const flashK = this.flash;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      // chamfered casing corners
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
      const X = x0 + x, Y = y0 + y;
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      const inGlass = X >= gx0 && X <= gx1 && Y >= gy0 && Y <= gy1;
      if (!inGlass) {
        // brass end caps, gunmetal casing between: lit top, dark belly
        const brass = x < 10 || x > W - 4;
        const ramp = brass ? BRASS : CASE;
        let t = y === 0 ? 4 : y === 1 ? 3 : y === H - 1 ? 0 : y === H - 2 ? 1 : 2;
        if (edge === 0 && (x === 0 || x === W - 1)) t = Math.max(0, t - 1);
        if (!brass && y === 1 && (x % 9 === 4)) t = 5; // glints along the top lip
        let c = ramp[t];
        if (brass && y >= 3 && y <= H - 4 && x >= 2 && x < 8 && (x + y) % 3 === 0) c = ramp[Math.max(0, t - 1)];
        if (!brass && hov) c = mix(c, 0xfff0c0, 0.12);
        if (pulse > 0) c = mix(c, 0xff3020, pulse * 0.35);
        if (flashK > 0) c = mix(c, 0xff4030, flashK * 0.4);
        P.set(X, Y, c);
        continue;
      }
      const r = Y - gy0;
      // the surface tilts as the blood sloshes, and ripples a little
      const tilt = this.slosh * (r - rows / 2) * 0.12 + Math.sin(this.time * 6 + r * 0.9) * 0.35;
      const end = fillX + tilt;
      const ri = Math.min(BLOOD.length - 1, Math.round(r * (BLOOD.length - 1) / Math.max(1, rows - 1)));
      let c: number;
      if (X < end && hp > 0.002) {
        c = BLOOD[ri];
        if (thin > 0) c = mix(c, shade(c, 0.55), thin * 0.8);
        if (s.sick > 0.05) c = mix(c, 0x7a7a24, s.sick * 0.35 * (ri / 10 + 0.3));
        if (s.corrupt > 0.05 && hash(X, Y, Math.floor(this.time * 10)) < s.corrupt * 0.15) c = 0x5aff8a;
        // the meniscus: a lit pixel along the surface edge
        if (X >= end - 1.2 && r > 0) c = mix(c, 0xff9a8a, 0.55);
        // ticks every tenth, longer at the half
        const q = (X - gx0) / gw * 10;
        if (Math.abs(q - Math.round(q)) * gw / 10 < 0.5 && Math.round(q) > 0 && Math.round(q) < 10 && r >= rows - (Math.round(q) === 5 ? 6 : 3)) c = shade(c, 0.62);
        // critical: it beats
        if (pulse > 0) c = mix(c, 0xff6a5a, pulse * 0.45);
        // the stroke the heart just pumped, running down the tube
        for (const wv of this.waves) { const dw = X - gx0 - wv + r * 0.4; if (dw > -2.5 && dw < 0.5) c = mix(c, 0xff8a7a, 0.28 * this.heart.str); }
        // healing: a sheen sweeps through
        if (this.sweep >= 0) { const dsw = X - gx0 + r * 0.6 - this.sweep; if (dsw > -3 && dsw < 1) c = mix(c, 0xfff0e0, 0.55); }
        if (flashK > 0) c = mix(c, 0xffffff, flashK * 0.85);
      } else if (X < lagX && this.lag > this.hpShown + 0.2) {
        // the ghost of what you just lost: bright, then souring to dark red as it drains
        const age = this.holdT > 0 ? 0 : clamp((this.lag - this.hpShown) < 2 ? 1 : 0.6, 0, 1);
        c = mix(mix(0xfff0c8, 0xd26a4a, age), shade(0xd26a4a, 0.6), ri / 12);
        if (flashK > 0) c = mix(c, 0xffffff, flashK * 0.6);
      } else {
        c = EMPTY[ri];
        if ((X + Y) % 7 === 0 && r > rows / 2) c = mix(c, 0x3a1a1a, 0.5);
        const q = (X - gx0) / gw * 10;
        if (Math.abs(q - Math.round(q)) * gw / 10 < 0.5 && Math.round(q) > 0 && Math.round(q) < 10 && r >= rows - (Math.round(q) === 5 ? 6 : 3)) c = 0x3a2222;
      }
      // the glass: a broken reflection along the top, a short hot streak
      if (r === 1 && ((X - gx0) % 17) < 12) c = mix(c, 0xffffff, X < end ? 0.38 : 0.16);
      if (r === 2 && X - gx0 > 2 && X - gx0 < 8) c = mix(c, 0xffffff, 0.3);
      P.set(X, Y, c);
    }
    // a seep of blood under the tube when bleeding
    if (s.bleed > 0.015) for (let x = gx0 + 2; x < Math.min(gx1, fillX); x += 5) if (hash(x, 3, 9) < 0.5) P.set(x, y0 + H - 1, 0x8a101c);
    // rivets on the casing
    for (const rx of [x0 + 12, x0 + W - 6]) { P.set(rx, y0 + 1, BRASS[5]); }
  }
  // ---------------------------------------------------------------- the balloon
  private drawWeight(P: Pix) {
    const ax = ANCHOR.x, ay = ANCHOR.y;
    // a cast-iron weight: a ring on top, a trapezoid body with a stamped plate
    P.set(ax - 1, ay - 1, IRON[3]); P.set(ax, ay - 2, IRON[4]); P.set(ax + 1, ay - 1, IRON[2]); P.set(ax - 1, ay, IRON[3]); P.set(ax + 1, ay, IRON[2]);
    const top = ay + 1, bot = VH - 2;
    for (let y = top; y <= bot; y++) {
      const t = (y - top) / Math.max(1, bot - top);
      const hw = Math.round(3 + t * 3.2);
      for (let x = ax - hw; x <= ax + hw; x++) {
        const u = (x - ax) / hw;
        let i = u < -0.55 ? 4 : u < 0 ? 3 : u < 0.6 ? 2 : 1;
        if (y === top) i = Math.min(5, i + 1);
        if (y === bot) i = 0;
        let c = IRON[i];
        if (y === top + 3 && x > ax - hw + 1 && x < ax + hw - 1) c = IRON[0];
        if ((x * 7 + y * 3) % 11 === 0) c = shade(c, 0.8);
        P.set(x, y, c);
      }
    }
  }
  private drawString(P: Pix) {
    const R = this.rope;
    for (let i = 0; i < R.length - 1; i++) P.line(R[i].x, R[i].y - (i === 0 && this.full ? 2 : 0), R[i + 1].x, R[i + 1].y, STRING, 0.95);
  }
  private drawBalloon(P: Pix, s: VitalsIn) {
    const K = this.rope[this.rope.length - 1];
    const a = this.bAng, ca = Math.cos(a), sa = Math.sin(a);
    const v = clamp(this.vol, 0, 1.2);
    const ry = this.bR, rx = ry * 0.86;
    // squash and stretch from the knot's speed
    const vx = K.x - K.px, vy = K.y - K.py, sp = Math.min(1, Math.hypot(vx, vy) * 0.6);
    const sqy = 1 + sp * 0.12, sqx = 1 - sp * 0.08;
    const tiredK = 1 - sstep(0.1, 0.55, v);
    const ramp = BALLOON.map((c, i) => mix(c, BALLOON_TIRED[i], tiredK * 0.4));
    const hov = s.hover === 'balloon' ? 1 : 0;
    const cx = this.bCx, cy = this.bCy;
    const RR = Math.ceil(ry * 1.3 + 2);
    for (let y = Math.floor(cy - RR); y <= cy + RR; y++) for (let x = Math.floor(cx - RR); x <= cx + RR; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      let nx = lx / (rx * sqx), ny = ly / (ry * sqy);
      if (ny > 0) nx /= 1 - 0.24 * Math.min(1, ny * ny);
      // a deflating balloon goes lumpy
      const ang = Math.atan2(ny, nx);
      const lump = tiredK * 0.16 * (Math.sin(ang * 3 + 1) * 0.6 + Math.sin(ang * 5 + this.time * 0.5) * 0.4);
      const d = nx * nx + ny * ny;
      if (d > 1 + lump) continue;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d)));
      const lam = -nx * 0.55 - ny * 0.62 + nz * 0.56;
      let t = Math.round(clamp(lam * 4.4 + 1.6 + (bayer(x, y) - 0.5) * 0.8, 0, 5));
      // the rim catches light from the right; the window highlight up-left
      if (d > 0.72 && nx > 0.35 && ny < 0.3) t = Math.max(t, 3);
      const hx = nx + 0.38, hy = ny + 0.46;
      let c = ramp[t];
      if (hx * hx * 2.2 + hy * hy < 0.05 + 0.03 * v) c = ramp[6];
      else if (hx * hx * 2 + hy * hy < 0.11) c = mix(ramp[5], ramp[6], 0.4);
      // wrinkles when it is low on air
      if (tiredK > 0.25 && Math.abs(Math.sin(ny * 7 + nx * 3)) < 0.18 * tiredK && d < 0.8) c = shade(c, 0.65);
      // the tape over the hole it popped
      if (this.tape > 0) { const tx = nx - 0.25, ty = ny - 0.05; if ((Math.abs(tx - ty) < 0.13 || Math.abs(tx + ty) < 0.13) && Math.abs(tx) < 0.3 && Math.abs(ty) < 0.3) c = (x + y) % 2 ? 0xd8c890 : 0xc0ae78; }
      if (hov) c = mix(c, 0xffffff, 0.1);
      P.set(x, y, c);
    }
    // the knot: a little tied lip under the balloon
    const kx = Math.round(K.x), ky = Math.round(K.y);
    P.set(kx, ky, ramp[2]); P.set(kx - 1, ky + 1, ramp[3]); P.set(kx, ky + 1, ramp[2]); P.set(kx + 1, ky + 1, ramp[1]);
  }
  /** the breathing pump's beat, while it runs: a bead swinging between OUT (bottom) and IN (top) beside the balloon */
  private drawGauge(P: Pix, s: VitalsIn) {
    const x = BAR.x + BAR.w + 3, y0 = BAR.y + BAR.h + 3, y1 = FLOOR - 1;
    for (let y = y0; y <= y1; y++) { P.set(x, y, CASE[2]); P.set(x + 1, y, CASE[1]); }
    const endC = (end: number) => (s.pumpFlash > 0 && s.pumpEnd === end ? (s.pumpGood ? 0x8aff9a : 0xff4a3a) : BRASS[3]);
    for (let i = -1; i <= 2; i++) { P.set(x + i, y0, endC(1)); P.set(x + i, y1, endC(0)); }
    const by = Math.round(y1 - (y1 - y0) * clamp(s.pumpPos, 0, 1));
    P.set(x - 1, by, 0xf0f0e0); P.set(x, by, 0xffffff); P.set(x + 1, by, 0xffffff); P.set(x + 2, by, 0xd8d8c8);
    P.set(x, by - 1, 0xffffff); P.set(x + 1, by + 1, 0xc8c8b8);
  }

  // ---------------------------------------------------------------- the rucksack
  private drawPack(P: Pix, hov: boolean) {
    const ox = PACK.x, oy = PACK.y - (hov ? 1 : 0);
    const A = (i: number, j: number) => (i < 0 || j < 0 || i > 17 || j > 17 ? '.' : PACK_ART[j][i]);
    for (let j = 0; j < 18; j++) for (let i = 0; i < 18; i++) {
      const ch = PACK_ART[j][i];
      if (ch === '.') continue;
      // the outer ink comes from the outline pass; seams inside are drawn here
      if (ch === 'k' && (A(i - 1, j) === '.' || A(i + 1, j) === '.' || A(i, j - 1) === '.' || A(i, j + 1) === '.')) continue;
      let c = PACK_PAL[ch];
      if (hov) c = mix(c, 0xfff0c0, 0.2);
      P.set(ox + i, oy + j, c);
    }
  }

  /** the watch icon (rig overlay): a strap, a brass case, a dark tube that glows green and types when a note comes in */
  private drawWatch(P: Pix, cx: number, cy: number, hov: boolean) {
    const x0 = Math.round(cx) - 8, y0 = Math.round(cy) - 8 - (hov ? 1 : 0);
    const lit = this.watchLit;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      let c = -1;
      // the strap, top and bottom
      if (i >= 5 && i <= 10 && (j < 3 || j > 12)) c = (j + i) % 3 === 0 ? 0x3a2a1a : 0x5a4028;
      // the case: chamfered brass with a steel bezel
      const ci = Math.min(i - 1, 14 - i), cj = Math.min(j - 3, 12 - j);
      if (i >= 1 && i <= 14 && j >= 3 && j <= 12 && ci + cj >= 1) {
        c = ci === 0 || cj === 0 ? (j < 7 ? 0xf0c860 : 0x8a6626) : 0x6a7076;
        // the tube
        if (ci >= 2 && cj >= 1 && i <= 11) {
          c = lit > 0 ? (Math.floor(this.time * 6) % 2 && lit < 0.5 ? 0x1c4a2a : 0x2a8a4a) : 0x142018;
          if (lit > 0 && (j === 6 || j === 9) && i >= 4 && i <= 4 + ((Math.floor(this.time * 10) + j) % 7)) c = 0xb8ffc8;
          if (lit <= 0 && i === 4 && j === 5) c = 0x3a5a44;
        }
        if (i === 13 && (j === 6 || j === 9)) c = 0xd8dee4;
      }
      if (c < 0) continue;
      if (hov) c = mix(c, 0xffffff, 0.15);
      P.set(x0 + i, y0 + j, c);
    }
  }

  // ================================================================ hit tests (HUD px)
  pick(x: number, y: number, showPack: boolean): 'brain' | 'bar' | 'balloon' | 'pack' | 'watch' | null {
    if (!this.full) {
      if (this.watchAt && Math.abs(x - this.watchAt.x) <= 10 && Math.abs(y - this.watchAt.y) <= 10) return 'watch';
      if (Math.hypot(x - this.bCx, (y - this.bCy) * 0.9) < this.bR + 3) return 'balloon';
      if (Math.hypot((x - this.brainC.x) / 22, (y - this.brainC.y) / 18) < 1.05) return 'brain';
      return null;
    }
    if (x >= BAR.x - 1 && x <= BAR.x + BAR.w + 1 && y >= BAR.y - 2 && y <= BAR.y + BAR.h + 1) return 'bar';
    if (x >= HEART.x + 2 && x < HEART.x + HEART.w && y >= HEART.y + 4 && y < HEART.y + HEART.h) return 'bar';
    if (showPack && x >= PACK.x - 1 && x <= PACK.x + PACK.w && y >= PACK.y - 1 && y <= PACK.y + PACK.h) return 'pack';
    const bd = Math.hypot(x - this.bCx, (y - this.bCy) * 0.9);
    if (bd < this.bR + 3 || (Math.abs(x - ANCHOR.x) < 8 && y > ANCHOR.y - 3)) return 'balloon';
    if (x >= BRAIN.x + 1 && x < BRAIN.x + BRAIN.w && y >= BRAIN.y + 2 && y < BRAIN.y + BRAIN.h - 2 && Math.hypot((x - BRAIN.cx) / 22, (y - BRAIN.cy) / 18) < 1.05) return 'brain';
    return null;
  }
}

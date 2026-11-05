// Zomboid-style moodles for the body HUD: small pixel icons on severity plates
// that pop up only while they matter. A new one drops in and bounces, a change
// of level wiggles it, flashes it and shows a little arrow (worse / better),
// the worst level pulses, and a moodle that clears shrinks away while the rest
// slide over to close the gap. Plates are tinted by severity (pale yellow,
// orange, red-orange, red; green for the good ones) with 1–4 pips along the
// bottom. Drawn into a small buffer (pix.ts) and integer-upscaled like the
// rest of the HUD. The health bar, the brain and the balloon already show
// injury, lucidity and exertion, so those three stay off the tray.
import { Pix, mix, shade, bayer } from './pix';
import { moodleArt } from '../moodles';

export const SLOT = 20, PLATE = 18, PAD = 4;
const INK = 0x0a0b10;
/** shown left to right in this order (stable, so nothing jumps about) */
const ORDER = ['attack', 'bleeding', 'pain', 'panic', 'fever', 'sick', 'hunger', 'thirst', 'fatigue', 'cold', 'hot', 'wet', 'stress', 'unhappy', 'lonely', 'boredom', 'drunk', 'heavy', 'corruption', 'stuffed'];
const SKIP = new Set(['injured', 'endurance', 'lucidity']);
const TINT = [0x8a8a7a, 0xc8b040, 0xe08a2a, 0xe04a26, 0xd01c1c];
const GOOD = 0x4aa83e;

export interface MoodleIn { key: string; name: string; level: number; good?: boolean; desc: string }
export interface TrayItem {
  key: string; name: string; desc: string; level: number; good: boolean;
  x: number; y: number; tx: number; ty: number; drop: number; dropV: number;
  s: number; sv: number; out: boolean; wig: number; flash: number; arrow: number; arrowT: number;
}

const plates = new Map<string, { a: Uint8Array; c: Uint32Array }>();
/** an 18x18 plate: chamfered, bevelled, tinted by severity, the icon on it, pips for the level */
function plate(key: string, level: number, good: boolean): { a: Uint8Array; c: Uint32Array } {
  const ck = key + level + (good ? 'g' : '');
  const hit = plates.get(ck);
  if (hit) return hit;
  const N = PLATE, a = new Uint8Array(N * N), c = new Uint32Array(N * N);
  const tint = good ? GOOD : TINT[Math.max(0, Math.min(4, level))];
  const put = (x: number, y: number, col: number) => { if (x < 0 || y < 0 || x >= N || y >= N) return; a[y * N + x] = 1; c[y * N + x] = col; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = Math.min(x, N - 1 - x), cy = Math.min(y, N - 1 - y);
    if (cx + cy < 2) continue;
    const edge = Math.min(cx, cy) + (cx + cy === 2 ? 0 : 0);
    let col: number;
    if (edge === 0 || cx + cy === 2) col = (y < N / 2 && x < N - 2) || (x < N / 2 && y < N - 2) ? mix(tint, 0xffffff, 0.38) : shade(tint, 0.5);
    else if (edge === 1) col = (y <= 1 || x <= 1) ? tint : shade(tint, 0.68);
    else { col = mix(tint, 0x000000, 0.58 + 0.14 * y / N); if (bayer(x, y) < 0.18 && y > N / 2) col = shade(col, 0.82); }
    put(x, y, col);
  }
  // the icon (its own dark outline in the art), sitting on a soft shadow
  const art = moodleArt(key);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const ch = art.rows[j]?.[i];
    if (!ch || ch === '.') continue;
    if (i + 4 < N - 2 && j + 4 < N - 2) { const k = (j + 4) * N + i + 4; if (a[k] && art.rows[j + 1]?.[i + 1] === '.') c[k] = shade(c[k], 0.6); }
    put(i + 3, j + 3, ch === 'k' ? INK : art.pal[ch] ?? 0xffffff);
  }
  // severity pips along the bottom lip
  if (!good) for (let i = 0; i < 4; i++) {
    const x = 4 + i * 3, on = i < level;
    put(x, N - 2, on ? mix(tint, 0xffffff, 0.6) : shade(tint, 0.42)); put(x + 1, N - 2, on ? mix(tint, 0xffffff, 0.35) : shade(tint, 0.42));
  }
  const out = { a, c };
  plates.set(ck, out);
  return out;
}

export class MoodleTray {
  pix: Pix;
  items: TrayItem[] = [];
  cols = 6;
  rows = 1;
  W = 0; H = 0;
  time = 0;
  /** one-shot events for sounds ('in', 'up', 'down', 'out') */
  events: string[] = [];
  constructor(cols = 6) { this.cols = cols; this.pix = this.makePix(); }
  private makePix(): Pix { this.W = this.cols * SLOT + PAD * 2; this.H = 3 * SLOT + PAD * 2; return new Pix(this.W, this.H); }
  setCols(n: number) { if (n === this.cols) return; this.cols = n; this.pix = this.makePix(); this.place(); }

  /** bring the tray in line with the body's moodles (first = no pop, for a fresh body) */
  sync(list: MoodleIn[], first = false) {
    const want = new Map<string, MoodleIn>();
    for (const m of list) if (!SKIP.has(m.key) && m.level > 0) want.set(m.key, m);
    for (const it of this.items) {
      const m = want.get(it.key);
      if (!m) { if (!it.out) { it.out = true; this.events.push('out'); } continue; }
      if (it.out) { it.out = false; it.s = Math.max(it.s, 0.3); }
      if (m.level !== it.level) {
        const worse = it.good ? m.level < it.level : m.level > it.level;
        it.arrow = worse ? 1 : -1; it.arrowT = 2.6; it.wig = 1; it.flash = 1;
        it.level = m.level; it.name = m.name; it.desc = m.desc;
        this.events.push(worse ? 'up' : 'down');
      }
    }
    for (const [k, m] of want) if (!this.items.some((it) => it.key === k)) {
      this.items.push({ key: k, name: m.name, desc: m.desc, level: m.level, good: !!m.good, x: 0, y: 0, tx: 0, ty: 0, drop: first ? 0 : -9, dropV: 0, s: first ? 1 : 0.05, sv: first ? 0 : 9, out: false, wig: first ? 0 : 0.6, flash: first ? 0 : 1, arrow: 0, arrowT: 0 });
      if (!first) this.events.push('in');
    }
    this.items.sort((a, b) => (ORDER.indexOf(a.key) + 99 * +(ORDER.indexOf(a.key) < 0)) - (ORDER.indexOf(b.key) + 99 * +(ORDER.indexOf(b.key) < 0)));
    this.place(first);
  }
  private place(snap = false) {
    let i = 0;
    for (const it of this.items) {
      if (it.out) continue;
      it.tx = (i % this.cols) * SLOT; it.ty = Math.floor(i / this.cols) * SLOT;
      if (snap || (it.s < 0.1 && it.x === 0 && it.y === 0)) { it.x = it.tx; it.y = it.ty; }
      i++;
    }
    this.rows = Math.max(1, Math.min(3, Math.ceil(i / this.cols)));
  }
  get count(): number { let n = 0; for (const it of this.items) if (!it.out) n++; return n; }

  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    for (const it of this.items) {
      const target = it.out ? 0 : 1;
      // a bouncy spring on the size, a drop from above that lands with a bump
      it.sv += ((target - it.s) * (it.out ? 160 : 240) - it.sv * (it.out ? 18 : 11)) * dt;
      it.s = Math.max(0, it.s + it.sv * dt);
      it.dropV += (-it.drop * 260 - it.dropV * 13) * dt; it.drop += it.dropV * dt;
      it.x += (it.tx - it.x) * Math.min(1, dt * 12); it.y += (it.ty - it.y) * Math.min(1, dt * 12);
      it.wig = Math.max(0, it.wig - dt * 1.6);
      it.flash = Math.max(0, it.flash - dt * 3);
      it.arrowT = Math.max(0, it.arrowT - dt);
    }
    const before = this.items.length;
    this.items = this.items.filter((it) => !(it.out && it.s < 0.04));
    if (this.items.length !== before) this.place();
  }

  draw(hover: string | null) {
    const P = this.pix;
    P.clear();
    for (const it of this.items) {
      const pl = plate(it.key, it.level, it.good);
      const wig = it.wig > 0 ? Math.round(Math.sin(this.time * 38) * 1.4 * it.wig) : 0;
      const s = Math.max(0.01, it.s * (hover === it.key ? 1.08 : 1));
      const cx = PAD + it.x + PLATE / 2 + wig, cy = PAD + it.y + PLATE / 2 + Math.round(it.drop) - (hover === it.key ? 1 : 0);
      const half = PLATE / 2 * s;
      const pulse = !it.good && it.level >= 4 ? (Math.sin(this.time * 7) * 0.5 + 0.5) * 0.28 : 0;
      for (let y = Math.floor(cy - half); y < Math.ceil(cy + half); y++) for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x++) {
        const sx = Math.floor((x + 0.5 - cx) / s + PLATE / 2), sy = Math.floor((y + 0.5 - cy) / s + PLATE / 2);
        if (sx < 0 || sy < 0 || sx >= PLATE || sy >= PLATE) continue;
        const k = sy * PLATE + sx;
        if (!pl.a[k]) continue;
        let c = pl.c[k];
        if (pulse > 0 && c !== INK) c = mix(c, 0xff6a50, pulse);
        if (it.flash > 0) c = mix(c, 0xffffff, it.flash * 0.75);
        if (it.out && bayer(x, y) > it.s * 1.4) continue;
        P.set(x, y, c);
      }
    }
    P.outline(INK, 0.35);
    // the change arrows, over the ink at the top-right corner
    for (const it of this.items) {
      if (it.arrowT <= 0 || it.out || (it.arrowT < 0.8 && Math.floor(this.time * 8) % 2)) continue;
      const x = PAD + Math.round(it.x) + PLATE - 3, y = PAD + Math.round(it.y) - 1;
      const col = it.arrow > 0 ? 0xff5a3a : 0x8aff7a;
      const rows = it.arrow > 0 ? [[0], [-1, 0, 1], [-2, -1, 0, 1, 2], [0], [0]] : [[0], [0], [-2, -1, 0, 1, 2], [-1, 0, 1], [0]];
      rows.forEach((r, j) => r.forEach((i) => { P.set(x + i, y + j, col); }));
      // ink round the arrow so it reads on anything
      rows.forEach((r, j) => r.forEach((i) => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + i + dx, yy = y + j + dy; if (!rows[yy - y]?.includes(xx - x)) P.set(xx, yy, INK); } }));
    }
  }

  /** the moodle under a tray pixel */
  pick(x: number, y: number): TrayItem | null {
    for (const it of this.items) {
      if (it.out) continue;
      const x0 = PAD + it.tx, y0 = PAD + it.ty;
      if (x >= x0 - 1 && x < x0 + SLOT - 1 && y >= y0 - 1 && y < y0 + SLOT - 1) return it;
    }
    return null;
  }
  /** a moodle's plate centre in tray pixels */
  centre(key: string): { x: number; y: number } | null {
    const it = this.items.find((i) => i.key === key && !i.out);
    return it ? { x: PAD + it.tx + PLATE / 2, y: PAD + it.ty + PLATE / 2 } : null;
  }
  static tint(level: number, good: boolean): number { return good ? GOOD : TINT[Math.max(0, Math.min(4, level))]; }
}

// The stomach: a glass jar of acid. Food you eat drops in through the lid and
// slowly dissolves (bubbling, shrinking, settling into the murk at the bottom,
// whose height is how fed you are). Bad food cracks the jar; inflammation and
// food poisoning raise the acid so the jar fills sooner and you cannot eat
// much; vomiting throws the lot out.
import type { Player } from '../../entities/player';
import { Pix, mix, shade, bayer, hash } from './pix';

export const JAR_W = 44, JAR_H = 76;
const CX = 22, TOP = 13, BOT = 71, HW = 16;
const IH = BOT - TOP - 2;

interface Chunk { x: number; y: number; vx: number; vy: number; r: number; c: number; wet: boolean; spin: number; on: boolean }
interface Part { x: number; y: number; vx: number; vy: number; life: number; c: number; out: boolean; on: boolean }
interface Crack { pts: number[]; born: number }

export class Jar {
  acid = 0.22;
  private acidShown = 0.22;
  sed = 0.1;
  private sedShown = 0.1;
  private sedCol = 0x8a6a3a;
  private chunks: Chunk[] = [];
  private parts: Part[] = [];
  cracks: Crack[] = [];
  private lidY = 0; private lidV = 0;
  private t = 0; private shake = 0; private stream = 0; private streamC = 0x9ad0f0;
  private swirl = 0; private swirlC = 0x9ad0f0;
  vomitT = -1;
  private inflam = 0;
  private gurgle = 6;
  /** recent eating fills the jar until it settles (0..1 of the jar) */
  private recent = 0;
  constructor() {
    for (let i = 0; i < 40; i++) this.chunks.push({ x: 0, y: 0, vx: 0, vy: 0, r: 0, c: 0, wet: false, spin: 0, on: false });
    for (let i = 0; i < 90; i++) this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, c: 0, out: false, on: false });
  }

  /** how full the jar is (acid + murk + undissolved food), 0..1+ */
  get fill(): number {
    let v = 0;
    for (const c of this.chunks) if (c.on) v += c.r * c.r * 3.14 / (HW * 2 * IH);
    return this.acidShown + this.sedShown + v * 1.6 + this.recent * 0.4;
  }
  canEat(): boolean { return this.fill < 0.93 && this.vomitT < 0; }
  get poisoned(): boolean { return this.cracks.length > 0; }

  /** a bite goes in: a few chunks of its colour drop through the lid */
  bite(c: number, size: number, bad: boolean) {
    const n = 1 + Math.round(size * 2.5);
    for (let i = 0; i < n; i++) this.addChunk(CX + (Math.random() - 0.5) * 8, TOP - 4 - i * 2, (Math.random() - 0.5) * 12, 10 + Math.random() * 8, 1.4 + Math.random() * 1.4 * size + size, mix(c, 0xffffff, Math.random() * 0.15));
    this.lidV -= 30; this.recent = Math.min(0.5, this.recent + 0.035 * (0.6 + size));
    this.sedCol = mix(this.sedCol, shade(c, 0.6), 0.25);
    if (bad) this.crack();
  }
  gulp(c: number) { this.stream = 0.4; this.streamC = c; this.swirl = 1; this.swirlC = c; this.lidV -= 18; this.recent = Math.min(0.5, this.recent + 0.02); }
  pill(c: number) { this.addChunk(CX, TOP - 3, 0, 14, 1, c); this.lidV -= 12; }
  crack() {
    if (this.cracks.length >= 5) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    let x = CX + side * (HW - 1), y = TOP + 8 + Math.random() * (IH - 16);
    const pts = [x, y];
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) { x -= side * (1 + Math.random() * 2.2); y += (Math.random() - 0.5) * 5; pts.push(x, y); }
    this.cracks.push({ pts, born: this.t });
    this.shake = 0.4;
  }
  poke() { this.shake = 0.3; this.lidV -= 14; }
  vomit() { if (this.vomitT < 0) { this.vomitT = 0; this.lidV -= 90; this.shake = 1.2; } }

  private addChunk(x: number, y: number, vx: number, vy: number, r: number, c: number) {
    for (const k of this.chunks) if (!k.on) { k.on = true; k.x = x; k.y = y; k.vx = vx; k.vy = vy; k.r = r; k.c = c; k.wet = false; k.spin = Math.random() * 6; return; }
  }
  private part(x: number, y: number, vx: number, vy: number, life: number, c: number, out = false) {
    for (const q of this.parts) if (!q.on) { q.on = true; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.c = c; q.out = out; return; }
  }
  private surfaceY(): number { return BOT - 1 - (this.acidShown + this.sedShown) * IH; }

  /** returns 'gurgle' when an empty stomach complains (the HUD plays it) */
  update(dt: number, p: Player): 'gurgle' | null {
    const b = p.body;
    this.t += dt;
    let ev: 'gurgle' | null = null;
    // acid rises with inflammation: food poisoning, a gut wound, a hangover, a lot of alcohol
    let gut = 0;
    for (const inj of b.parts.torso_l?.injuries || []) if (inj.type !== 'bruise') gut += 0.15 * (1 - inj.heal);
    this.inflam = Math.min(1, b.sickness / 85 + gut + (b.drunk > 40 ? (b.drunk - 40) / 150 : 0) + (b.mind?.hangover > 0 ? 0.12 : 0));
    this.acid = 0.2 + this.inflam * 0.5;
    this.sed = Math.max(0, Math.min(0.42, (1 - b.hunger / 100) * 0.3 + b.stuffed / 100 * 0.18));
    this.recent = Math.max(0, this.recent - dt * 0.006);
    if (this.vomitT >= 0) {
      this.vomitT += dt;
      const k = Math.min(1, dt * 4);
      this.sedShown += (0 - this.sedShown) * k; this.recent = 0;
      if (this.vomitT < 0.9) for (let i = 0; i < 3; i++) this.part(CX + (Math.random() - 0.5) * 10, TOP - 2, (Math.random() - 0.5) * 50, -40 - Math.random() * 50, 0.9, mix(this.sedCol, 0xa8b030, Math.random() * 0.5), true);
      for (const c of this.chunks) if (c.on && this.vomitT < 0.4) { c.vy = -60 - Math.random() * 40; c.vx = (Math.random() - 0.5) * 50; }
      if (this.vomitT > 1.6) this.vomitT = -1;
    } else {
      this.sedShown += (this.sed - this.sedShown) * Math.min(1, dt * 0.6);
    }
    this.acidShown += (this.acid - this.acidShown) * Math.min(1, dt * 0.8);
    // cracks heal as the poisoning passes
    if (this.cracks.length && b.sickness < 6 && this.t - this.cracks[0].born > 20) this.cracks.shift();
    const surf = this.surfaceY();
    // chunks: fall, splash, sink slowly, dissolve with bubbles
    const strength = 0.05 + this.acidShown * 0.12 + this.inflam * 0.05;
    for (const c of this.chunks) {
      if (!c.on) continue;
      c.spin += dt * 2;
      if (c.y < surf) { c.vy += 90 * dt; }
      else {
        if (!c.wet) { c.wet = true; c.vy *= 0.2; for (let i = 0; i < 4; i++) this.part(c.x, surf - 1, (Math.random() - 0.5) * 30, -20 - Math.random() * 25, 0.5, this.acidCol()); }
        c.vy += (6 - c.vy * 2.5) * dt;
        c.vx += Math.sin(this.t * 2 + c.spin) * 4 * dt;
        c.r -= strength * dt;
        if (Math.random() < dt * (2 + c.r)) this.part(c.x + (Math.random() - 0.5) * c.r * 2, c.y, (Math.random() - 0.5) * 4, -8 - Math.random() * 8, 2, 0xf0ffb0);
        if (c.r < 0.6) { c.on = false; continue; }
      }
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.98;
      const floor = BOT - 1 - this.sedShown * IH * 0.85 - c.r;
      if (c.y > floor) { c.y = floor; c.vy = 0; }
      const lim = HW - 2 - c.r;
      if (c.x < CX - lim) { c.x = CX - lim; c.vx = Math.abs(c.vx) * 0.4; }
      if (c.x > CX + lim) { c.x = CX + lim; c.vx = -Math.abs(c.vx) * 0.4; }
      if (this.vomitT >= 0 && c.y < -10) c.on = false;
    }
    // ambient fizz (more when inflamed or empty and churning)
    const starving = b.hunger > 70;
    const fizz = 1.2 + this.inflam * 5 + (starving ? 4 : 0);
    if (Math.random() < dt * fizz) this.part(CX + (Math.random() - 0.5) * (HW * 2 - 6), BOT - 2, 0, -6 - Math.random() * 10, 3, 0xf0ffb0);
    if (starving) { this.gurgle -= dt; if (this.gurgle <= 0) { this.gurgle = 7 + Math.random() * 9; this.shake = 0.5; ev = 'gurgle'; } }
    for (const q of this.parts) {
      if (!q.on) continue;
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.out) q.vy += 120 * dt;
      else if (q.y < surf && q.vy < 0 && q.c === 0xf0ffb0) q.life = 0;
      else if (q.vy > -30 && q.c !== 0xf0ffb0) q.vy += 90 * dt;
      if (q.life <= 0 || q.y > JAR_H + 2) q.on = false;
    }
    this.lidV += (-this.lidY * 220 - this.lidV * 12) * dt; this.lidY += this.lidV * dt;
    this.shake = Math.max(0, this.shake - dt);
    this.stream = Math.max(0, this.stream - dt);
    this.swirl = Math.max(0, this.swirl - dt * 0.4);
    return ev;
  }
  private acidCol(): number {
    let c = mix(0xb4dc28, 0xe08a2a, this.inflam);
    if (this.swirl > 0) c = mix(c, this.swirlC, this.swirl * 0.5);
    return c;
  }

  draw(P: Pix, ox: number, oy: number) {
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * 2 * Math.min(1, this.shake * 2)) : 0;
    const X = ox + sx;
    const surf = this.surfaceY();
    const sedTop = BOT - 1 - this.sedShown * IH;
    const ac = this.acidCol(), acHi = mix(ac, 0xffffff, 0.35), acDk = shade(ac, 0.6);
    const t = this.t;
    for (let y = TOP; y <= BOT; y++) {
      let hw = HW;
      const top = y - TOP, bot = BOT - y;
      if (top < 3) hw -= 3 - Math.sqrt(Math.max(0, 9 - (3 - top) * (3 - top)));
      if (bot < 5) hw -= 5 - Math.sqrt(Math.max(0, 25 - (5 - bot) * (5 - bot)));
      const xl = Math.round(CX - hw), xr = Math.round(CX + hw);
      for (let x = xl; x <= xr; x++) {
        const nx = (x - CX) / hw;
        const edge = x === xl || x === xr || y === BOT;
        const px = X + x, py = oy + y;
        const wave = Math.sin(x * 0.7 + t * 3) * 0.6 + Math.sin(x * 0.3 - t * 2) * 0.5 * (1 + this.inflam);
        if (!edge && y > sedTop) {
          // the murk: half-dissolved food
          let c = mix(this.sedCol, ac, 0.25);
          if (hash(x, y, 1) < 0.18) c = shade(c, 0.7);
          if (bayer(x, y) < 0.3) c = shade(c, 0.88);
          P.set(px, py, shade(c, 0.85 + 0.25 * (1 - nx * nx)));
        } else if (!edge && y > surf + wave) {
          let c = ac;
          const d = y - (surf + wave);
          if (d < 1) c = acHi;
          else if (bayer(x, y) < d / 50) c = mix(ac, acDk, 0.5);
          if (this.inflam > 0.3 && d < 2.5 && hash(x, (t * 10) | 0, y) < this.inflam * 0.6) c = 0xfff4e0; // foam
          P.set(px, py, shade(c, 0.8 + 0.3 * (1 - nx * nx)));
        } else {
          P.blend(px, py, 0xd8f0f0, edge ? 0.8 : 0.16);
        }
        // glass shine and the dark far edge
        if (nx > -0.82 && nx < -0.62 && y > TOP + 3 && y < BOT - 4) P.blend(px, py, 0xffffff, 0.5);
        if (nx > 0.86 && !edge) P.blend(px, py, 0x203038, 0.25);
      }
    }
    // the rim and the lid (it hops when something goes in, flies off when you throw up)
    P.hline(X + CX - HW + 2, X + CX + HW - 2, oy + TOP, 0xe8f8f8, 0.9);
    const ly = oy + 5 + Math.min(2, Math.round(this.lidY * 0.15));
    const lw = HW - 1;
    for (let y = 0; y < 6; y++) for (let x = -lw; x <= lw; x++) {
      const ridge = (x & 1) === 0 && y > 0 && y < 5;
      const c = y === 0 ? 0xd8dce0 : ridge ? 0x7a828a : 0xa8b0b8;
      P.set(X + CX + x, ly + y, Math.abs(x) === lw ? shade(c, 0.7) : c);
    }
    P.hline(X + CX - lw + 2, X + CX - lw + 6, ly + 1, 0xffffff, 0.7);
    // pouring in
    if (this.stream > 0) for (let y = ly + 6; y < surf + oy; y++) P.set(X + CX + Math.round(Math.sin(y * 0.6 + t * 20) * 0.6), y, this.streamC);
    // chunks
    for (const c of this.chunks) {
      if (!c.on) continue;
      P.disc(Math.round(X + c.x), Math.round(oy + c.y), c.r, c.c, 1);
      P.set(Math.round(X + c.x - c.r * 0.4), Math.round(oy + c.y - c.r * 0.4), mix(c.c, 0xffffff, 0.45));
      if (c.wet) P.ring(Math.round(X + c.x), Math.round(oy + c.y), c.r, shade(c.c, 0.6), 0.5);
    }
    // bubbles, splashes, sick
    for (const q of this.parts) if (q.on) P.blend(Math.round(X + q.x), Math.round(oy + q.y), q.c, q.out ? 1 : Math.min(1, q.life * 1.5));
    // cracks, with acid seeping out of the worst
    for (let i = 0; i < this.cracks.length; i++) {
      const k = this.cracks[i].pts;
      for (let j = 2; j < k.length; j += 2) { P.line(X + k[j - 2], oy + k[j - 1], X + k[j], oy + k[j + 1], 0xffffff, 0.9); P.line(X + k[j - 2] + 1, oy + k[j - 1] + 1, X + k[j] + 1, oy + k[j + 1] + 1, 0x203038, 0.5); }
      if (k[1] > surf) {
        const sx0 = Math.round(X + k[0]);
        const len = 2 + ((t * 9 + i * 5) % 12);
        for (let y = 0; y < len; y++) P.set(sx0 + (k[0] < CX ? -1 : 1), Math.round(oy + k[1] + y), y === Math.floor(len) - 1 ? acHi : ac);
      }
    }
    // full: the lid rattles
    if (this.fill > 0.93 && Math.sin(t * 30) > 0.6) P.hline(X + CX - lw, X + CX + lw, ly - 1, 0xffffff, 0.35);
  }
  inside(lx: number, ly: number) { return lx > 3 && lx < JAR_W - 3 && ly > 3 && ly < JAR_H - 3; }
}

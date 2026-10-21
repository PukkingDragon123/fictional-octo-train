// The lungs: stamina as a pair of rubber balloons on a windpipe. They breathe
// with you, shrink as endurance runs out, swell and strain while you run, and
// flutter in a panic. Blood that splashes on you gets in and pools at the
// bottom (less room until you cough it out). H (or a tap on them) starts the
// pump: a bead runs between OUT and IN, press as it hits each end. On the beat
// you exhale / inhale and recover; off the beat you cough.
import type { Player } from '../../entities/player';
import { Pix, mix, shade, bayer } from './pix';

export const LUNG_W = 50, LUNG_H = 76;
const CXL = 13, CXR = 37, CY = 33, RX = 10.5, RY = 17;
const W_PERFECT = 0.085, W_GOOD = 0.19;

/** 3x5 glyphs for the few letters the dial needs */
const GL: Record<string, string> = { H: '101101111101101', I: '111010010010111', N: '110101101101101', O: '010101101101010', U: '101101101101111', T: '111010010010010' };

export type PumpResult = 'perfect' | 'good' | 'cough' | 'start';
interface Puff { x: number; y: number; vx: number; vy: number; life: number; c: number; on: boolean }
interface Spot { lobe: number; u: number; v: number; r: number }

export class Lungs {
  // ---- body-facing state
  /** 0..1 how over-full the lungs are from running (H pumps it out) */
  strain = 0;
  /** 0..1 blood inside (caps endurance until coughed out) */
  stain = 0;
  // ---- pump minigame
  pumping = false;
  private pos = 0; private dir = 1; private period = 0.95;
  private sinceEnd = 9; private lastEndHit = true; private nextHit = false;
  private misses = 0; private idle = 0;
  combo = 0; hits = 0;
  private flashEnd = -1; private flashT = 0; private flashGood = true;
  // ---- look
  private s = 0.9; private sv = 0; private phase = 0; private t = 0;
  private cap = 1; private panic = 0; private wob = 0;
  private puffs: Puff[] = [];
  private spots: Spot[] = [];
  private slosh = 0; private sloshV = 0;
  hint = 0;
  constructor() { for (let i = 0; i < 40; i++) this.puffs.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, c: 0, on: false }); }

  splash(k: number) {
    this.stain = Math.min(0.85, this.stain + k);
    this.sloshV += 3;
    for (let i = 0; i < 2 + Math.round(k * 10); i++) this.spots.push({ lobe: Math.random() < 0.5 ? 0 : 1, u: (Math.random() - 0.5) * 1.4, v: (Math.random() - 0.3) * 1.3, r: 0.6 + Math.random() * 1.2 });
    if (this.spots.length > 24) this.spots.splice(0, this.spots.length - 24);
  }

  start() {
    this.pumping = true; this.pos = 0; this.dir = 1; this.sinceEnd = 0; this.lastEndHit = true; this.nextHit = false;
    this.misses = 0; this.idle = 0; this.combo = 0; this.hits = 0;
    this.period = this.strain > 0.5 || this.panic > 0.5 ? 0.8 : 1.0;
  }
  stop() { this.pumping = false; this.combo = 0; }

  /** a press on the beat (or not). Returns what happened; the HUD applies it to the body. */
  press(): PumpResult {
    if (!this.pumping) { this.start(); return 'start'; }
    this.idle = 0;
    const toNext = (this.dir > 0 ? 1 - this.pos : this.pos) * this.period;
    let err = 9, end = -1;
    if (!this.lastEndHit && this.sinceEnd < W_GOOD) { err = this.sinceEnd; end = this.dir > 0 ? 0 : 1; this.lastEndHit = true; }
    else if (!this.nextHit && toNext < W_GOOD) { err = toNext; end = this.dir > 0 ? 1 : 0; this.nextHit = true; }
    if (end < 0) { this.combo = 0; this.flash(-1, false); this.cough(); return 'cough'; }
    const q: PumpResult = err <= W_PERFECT ? 'perfect' : 'good';
    this.combo++; this.hits++; this.misses = 0;
    this.flash(end, true);
    // IN fills the balloons, OUT squeezes them and blows a puff out of the windpipe
    if (end === 1) this.sv += q === 'perfect' ? 2.6 : 1.9;
    else { this.sv -= q === 'perfect' ? 3 : 2.2; this.puff(6, 0xf4f4f0); }
    this.strain = Math.max(0, this.strain - (q === 'perfect' ? 0.3 : 0.2));
    // good breathing slows the beat: in... and... out
    this.period = Math.min(1.7, this.period + (q === 'perfect' ? 0.07 : 0.04));
    return q;
  }
  cough() {
    this.sv -= 2.5; this.wob = 1;
    const blood = this.stain > 0.05;
    this.stain = Math.max(0, this.stain - 0.13);
    if (this.spots.length) this.spots.splice(0, Math.min(this.spots.length, 3));
    this.puff(blood ? 10 : 6, blood ? 0xb01818 : 0xe8e8e0, true);
    this.sloshV -= 4;
    return blood;
  }
  private flash(end: number, good: boolean) { this.flashEnd = end; this.flashT = 0.25; this.flashGood = good; }
  private puff(n: number, c: number, burst = false) {
    for (let i = 0; i < n; i++) for (const p of this.puffs) if (!p.on) {
      p.on = true; p.x = 25 + (Math.random() - 0.5) * 2; p.y = 2; p.vx = (Math.random() - 0.5) * (burst ? 30 : 10); p.vy = -(burst ? 14 : 6) - Math.random() * 10; p.life = 0.5 + Math.random() * 0.5; p.c = c; break;
    }
  }

  /** per frame: returns 'miss' when the bead passed an end you did not press */
  update(dt: number, p: Player, exertion: number): 'miss' | 'end' | null {
    const b = p.body;
    this.t += dt;
    this.cap = 0.55 + 0.45 * Math.max(0, Math.min(1, b.endurance));
    this.panic = Math.max(0, Math.min(1, (b.panic - 30) / 70));
    let out: 'miss' | 'end' | null = null;
    // breathing rhythm (breaths a minute)
    const rate = 11 + exertion * 22 + this.panic * 18 + this.strain * 10;
    this.phase += dt * rate / 60 * Math.PI * 2;
    const target = this.cap * (0.86 + 0.1 * Math.sin(this.phase) + this.strain * 0.2) + (b.dead ? -0.5 : 0);
    // a rubbery spring around the breath
    this.sv += ((target - this.s) * 60 - this.sv * 7) * dt;
    this.s = Math.max(0.25, Math.min(1.3, this.s + this.sv * dt));
    this.wob = Math.max(0, this.wob - dt * 2);
    this.sloshV += (-this.slosh * 30 - this.sloshV * 3) * dt; this.slosh += this.sloshV * dt;
    // strain: running fills them up, rest and the pump let it out
    if (p.running) this.strain = Math.min(1, this.strain + dt * (0.075 + Math.max(0, p.heavyLoad?.() ?? 0) * 0.05) * (1 - b.skill('fitness') * 0.04));
    else this.strain = Math.max(0, this.strain - dt * (b.endurance > 0.9 ? 0.12 : 0.05));
    this.stain = Math.max(0, this.stain - dt * 0.004);
    if (this.stain < 0.02 && this.spots.length) this.spots.length = 0;
    // the pump
    if (this.pumping) {
      this.pos += this.dir * dt / this.period;
      this.sinceEnd += dt;
      if (this.pos >= 1 || this.pos <= 0) {
        this.pos = this.pos >= 1 ? 1 : 0;
        this.dir = -this.dir;
        this.sinceEnd = 0;
        this.lastEndHit = this.nextHit; this.nextHit = false;
      }
      if (!this.lastEndHit && this.sinceEnd > W_GOOD) {
        this.lastEndHit = true; this.misses++; this.combo = 0; this.flash(this.dir > 0 ? 0 : 1, false); out = 'miss';
        if (this.misses >= 3) { this.stop(); out = 'end'; }
      }
      this.idle += dt;
      if (this.idle > 14 || b.dead || p.sleeping) { this.stop(); out = 'end'; }
    }
    this.flashT = Math.max(0, this.flashT - dt);
    for (const q of this.puffs) if (q.on) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 6 * dt; q.vx *= 0.96; if (q.life <= 0 || q.y < -3) q.on = false; }
    this.hint = !this.pumping && (this.strain > 0.45 || this.panic > 0.7) ? Math.min(1, this.hint + dt * 3) : Math.max(0, this.hint - dt * 3);
    return out;
  }

  draw(P: Pix, ox: number, oy: number, p: Player) {
    const t = this.t;
    const flutter = this.panic > 0.3 ? Math.sin(t * 46) * 0.035 * this.panic : 0;
    const s = Math.max(0.3, this.s + flutter);
    // windpipe with cartilage rings, branching into two bronchi
    for (let y = 0; y <= 11; y++) {
      const ring = y % 3 === 0;
      for (let x = -2; x <= 2; x++) P.set(ox + 25 + x, oy + y, ring ? 0xe8c8c0 : (x === -2 || x === 2 ? 0xa8707a : 0xd09aa2));
    }
    const sy = oy + CY - RY * s * 0.78;
    for (const [cx, sg] of [[CXL, -1], [CXR, 1]] as const) {
      const ex = ox + cx + sg * -1, ey = Math.min(oy + 18, sy + 3);
      for (let i = -1; i <= 1; i++) P.line(ox + 25 + i, oy + 11, ex + i, ey, i === 0 ? 0xd09aa2 : 0xa8707a);
    }
    // the two balloons
    const strainK = Math.max(0, this.strain - 0.4) / 0.6;
    const rub = mix(mix(0xe2808f, 0xf6b0bc, strainK * 0.7), 0x9a6870, Math.max(0, 0.75 - this.cap) * 1.5);
    const shake = this.strain > 0.85 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    for (let lobe = 0; lobe < 2; lobe++) {
      const cx = ox + (lobe ? CXR : CXL) + shake, cy = oy + CY + (1 - s) * 6;
      const rx = RX * (0.6 + 0.4 * s) * (1 + this.wob * 0.08 * Math.sin(t * 30)), ry = RY * (0.55 + 0.45 * s);
      const med = lobe ? -1 : 1; // the inner side faces the windpipe
      const bloodTop = 1 - this.stain * 1.25 + Math.sin(t * 3 + lobe) * 0.04 + this.slosh * 0.05;
      const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
      for (let y = y0; y <= y1; y++) {
        const v = (y - cy) / ry;
        if (v < -1 || v > 1) continue;
        // narrow apex, broad base, flattened inner side, a notch at the bottom inner edge of the right lobe
        const wTop = 0.62 + 0.38 * Math.min(1, (v + 1) / 1.1);
        const wob = this.sv * 0.02 * Math.sin(v * 5 + t * 18);
        const half = Math.sqrt(Math.max(0, 1 - v * v)) * rx * wTop * (1 + wob);
        const xin = cx + med * half * (lobe && v > 0.25 && v < 0.6 ? 0.55 : 0.78);
        const xout = cx - med * half;
        const xa = Math.round(Math.min(xin, xout)), xb = Math.round(Math.max(xin, xout));
        for (let x = xa; x <= xb; x++) {
          const u = (x - cx) / Math.max(1, half);
          const nz = Math.sqrt(Math.max(0, 1 - u * u * 0.85 - v * v * 0.6));
          let l = 0.45 + 0.65 * Math.max(0, -0.45 * u - 0.55 * v + 0.7 * nz);
          l = Math.round(l * 5 + bayer(x, y) - 0.5) / 5;
          let c = shade(rub, 0.55 + l * 0.6);
          // blood pooled inside, seen through the rubber
          if (v > bloodTop) c = mix(c, v - bloodTop < 0.08 ? 0xd02a30 : 0x8a1018, 0.72);
          // veins when stretched, wrinkles when spent
          if (strainK > 0.2 && Math.abs(Math.sin(u * 7 + v * 3 + lobe * 2) + Math.sin(v * 11)) < 0.08 * strainK) c = 0xb02840;
          if (this.cap < 0.75 && Math.abs(Math.sin(v * 9 + u * 1.5)) < 0.09) c = shade(c, 0.75);
          // the shine
          const hx = u + 0.42, hv = v + 0.5;
          if (hx * hx + hv * hv < 0.035 * (0.7 + s * 0.4)) c = 0xfff0f2;
          P.set(x, y, c);
        }
      }
      // splatter on the outside
      for (const sp of this.spots) if (sp.lobe === lobe) P.disc(Math.round(cx + sp.u * rx * 0.6), Math.round(cy + sp.v * ry * 0.6), sp.r, 0x7a0a12, 0.85);
    }
    // puffs out of the windpipe
    for (const q of this.puffs) if (q.on) P.blend(ox + q.x, oy + q.y, q.c, Math.min(1, q.life * 2));
    // the pump dial
    if (this.pumping || this.hint > 0) this.drawDial(P, ox, oy + 63, this.pumping ? 1 : this.hint);
    void p;
  }

  private drawDial(P: Pix, ox: number, y: number, a: number) {
    const x0 = ox + 6, x1 = ox + 44;
    P.rect(x0, y - 2, x1 - x0 + 1, 5, 0x161012, 0.75 * a);
    P.hline(x0 + 3, x1 - 3, y, 0x4a3a40, a);
    const endC = (end: number) => (this.flashT > 0 && this.flashEnd === end ? (this.flashGood ? 0x8aff7a : 0xff4a3a) : end ? 0xffc86a : 0x7ac8ff);
    P.rect(x0, y - 2, 3, 5, endC(0), a); P.rect(x1 - 2, y - 2, 3, 5, endC(1), a);
    if (this.flashT > 0 && this.flashEnd < 0) P.rect(x0 + 4, y - 1, x1 - x0 - 7, 3, 0xff4a3a, this.flashT * 2);
    if (this.pumping) {
      const bx = Math.round(x0 + 3 + this.pos * (x1 - x0 - 6));
      P.rect(bx - 1, y - 1, 3, 3, 0xffffff);
      P.blend(bx - this.dir * 2, y, 0xffffff, 0.4);
      this.text(P, 'OUT', x0, y + 4, 0x7ac8ff, a);
      this.text(P, 'IN', x1 - 6, y + 4, 0xffc86a, a);
    } else {
      // the key to press, blinking
      if (Math.sin(this.t * 8) > -0.2) { P.rect(ox + 21, y - 4, 9, 9, 0xf2e6c8, a); P.rect(ox + 21, y + 4, 9, 1, 0x8a7a5a, a); this.text(P, 'H', ox + 24, y - 2, 0x201010, a); }
    }
  }
  private text(P: Pix, s: string, x: number, y: number, c: number, a: number) {
    for (const ch of s) {
      const g = GL[ch];
      if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') P.blend(x + i, y + j, c, a);
      x += 4;
    }
  }
  /** a point inside either balloon (logical cell px) */
  inside(lx: number, ly: number): boolean { return ly > 0 && ly < 62 && lx > 1 && lx < LUNG_W - 1; }
  dialPos(): number { return this.pos; }
}

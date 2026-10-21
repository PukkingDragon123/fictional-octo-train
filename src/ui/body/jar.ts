// The stomach's simulation (jar3d.ts draws it, in the jar's own 2D side-view coordinates): a glass jar of acid. Food you eat drops in through the lid and
// slowly dissolves (bubbling, shrinking, settling into the murk at the bottom,
// whose height is how fed you are). Bad food cracks the jar; inflammation and
// food poisoning raise the acid so the jar fills sooner and you cannot eat
// much; vomiting throws the lot out.
import type { Player } from '../../entities/player';
import { mix, shade } from './pix';

export const JAR_W = 44, JAR_H = 76;
export const CX = 22, TOP = 13, BOT = 71, HW = 16;
export const IH = BOT - TOP - 2;

export interface Chunk { x: number; y: number; vx: number; vy: number; r: number; c: number; wet: boolean; spin: number; on: boolean }
export interface Part { x: number; y: number; vx: number; vy: number; life: number; c: number; out: boolean; on: boolean }
export interface Crack { pts: number[]; born: number }

export class Jar {
  acid = 0.22;
  acidShown = 0.22;
  sed = 0.1;
  sedShown = 0.1;
  sedCol = 0x8a6a3a;
  chunks: Chunk[] = [];
  parts: Part[] = [];
  cracks: Crack[] = [];
  lidY = 0; lidV = 0;
  t = 0; shake = 0; stream = 0; streamC = 0x9ad0f0;
  swirl = 0; swirlC = 0x9ad0f0;
  vomitT = -1;
  inflam = 0;
  gurgle = 6;
  /** recent eating fills the jar until it settles (0..1 of the jar) */
  recent = 0;
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
  surfaceY(): number { return BOT - 1 - (this.acidShown + this.sedShown) * IH; }

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
  acidCol(): number {
    let c = mix(0xb4dc28, 0xe08a2a, this.inflam);
    if (this.swirl > 0) c = mix(c, this.swirlC, this.swirl * 0.5);
    return c;
  }

}

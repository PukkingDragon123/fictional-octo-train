// The lungs' simulation (lung3d.ts draws them): stamina as a pair of rubber balloons on a brass valve. They
// breathe with you, shrink as endurance runs out, swell and strain while you
// run, and flutter in a panic. Blood that splashes on you gets in and pools at
// the bottom (less room until you cough it out). Under them sits an air gauge:
// at rest its needle reads how much air you have; H (or a tap) starts the pump
// and the needle swings between OUT and IN like a metronome: press as it hits
// each end. On the beat you exhale / inhale and recover (a jewel lamp flashes,
// a Nixie tube counts the streak); off the beat you cough.
import type { Player } from '../../entities/player';

const W_PERFECT = 0.085, W_GOOD = 0.19;

export type PumpResult = 'perfect' | 'good' | 'cough' | 'start';
export interface Puff { x: number; y: number; vx: number; vy: number; life: number; c: number; on: boolean }
export interface Spot { lobe: number; u: number; v: number; r: number }

export class Lungs {
  // ---- body-facing state
  /** 0..1 how over-full the lungs are from running (H pumps it out) */
  strain = 0;
  /** 0..1 blood inside (caps endurance until coughed out) */
  stain = 0;
  // ---- pump minigame
  pumping = false;
  pos = 0; dir = 1; period = 0.95;
  sinceEnd = 9; private lastEndHit = true; private nextHit = false;
  private misses = 0; private idle = 0;
  combo = 0; hits = 0;
  lastQ: PumpResult = 'good';
  /** squeezed by a thumb (0..1) */
  squeeze = 0;
  flashEnd = -1; flashT = 0; flashGood = true;
  // ---- look
  s = 0.9; sv = 0; phase = 0; t = 0;
  cap = 1; panic = 0; wob = 0;
  puffs: Puff[] = [];
  spots: Spot[] = [];
  slosh = 0; sloshV = 0;
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
    this.combo++; this.hits++; this.misses = 0; this.lastQ = q;
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

  /** a point inside either balloon (logical cell px) */
  dialPos(): number { return this.pos; }
}

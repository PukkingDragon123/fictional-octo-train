// The lungs: stamina as a pair of rubber balloons on a brass valve. They
// breathe with you, shrink as endurance runs out, swell and strain while you
// run, and flutter in a panic. Blood that splashes on you gets in and pools at
// the bottom (less room until you cough it out). Under them sits an air gauge:
// at rest its needle reads how much air you have; H (or a tap) starts the pump
// and the needle swings between OUT and IN like a metronome: press as it hits
// each end. On the beat you exhale / inhale and recover (a jewel lamp flashes,
// a Nixie tube counts the streak); off the beat you cough.
import type { Player } from '../../entities/player';
import { Pix, mix, shade, bayer, hash, type3 } from './pix';

export const LUNG_W = 50, LUNG_H = 84;
const CXL = 13, CXR = 37, CY = 38, RX = 10.5, RY = 18;
const W_PERFECT = 0.085, W_GOOD = 0.19;
const GX = 25, GY = 80, GR = 13;
const BRASS = [0x5a3a12, 0x8a6020, 0xc0902e, 0xe8c060, 0xfff0b0];
const NIX: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
};

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
    this.drawValve(P, ox, oy, s);
    // the two balloons
    const strainK = Math.max(0, this.strain - 0.4) / 0.6;
    const rub = mix(mix(0xd8707f, 0xf0a8b2, strainK * 0.7), 0x8a5a62, Math.max(0, 0.75 - this.cap) * 1.5);
    const shake = this.strain > 0.85 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    for (let lobe = 0; lobe < 2; lobe++) {
      const cx = ox + (lobe ? CXR : CXL) + shake, cy = oy + CY + (1 - s) * 6;
      const rx = RX * (0.6 + 0.4 * s) * (1 + this.wob * 0.08 * Math.sin(t * 30)), ry = RY * (0.55 + 0.45 * s);
      const med = lobe ? -1 : 1; // the inner side faces the valve
      const bloodTop = 1 - this.stain * 1.25 + Math.sin(t * 3 + lobe) * 0.04 + this.slosh * 0.05;
      const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
      // the rolled rubber neck on its brass nozzle
      const nx = ox + (lobe ? CXR - 3 : CXL + 3), ny = oy + 15;
      for (let y = ny; y < Math.min(y0 + 3, ny + 5); y++) for (let x = nx - 1; x <= nx + 1; x++) P.set(x, y, shade(rub, y === ny + 1 ? 0.6 : 0.85 + (x - nx) * -0.1));
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
          let l = 0.42 + 0.68 * Math.max(0, -0.45 * u - 0.55 * v + 0.7 * nz);
          l = Math.round(l * 6 + bayer(x, y) - 0.5) / 6;
          let c = shade(rub, 0.5 + l * 0.62);
          // the latex is thin: a warm glow where light passes through near the rim
          if (nz < 0.35 && u * med < 0) c = mix(c, 0xf8c0a8, 0.25);
          // blood pooled inside, seen through the rubber
          if (v > bloodTop) c = mix(c, v - bloodTop < 0.08 ? 0xc8282e : 0x7a0e16, 0.72);
          // veins when stretched, wrinkles when spent, a seam down the middle
          if (strainK > 0.2 && Math.abs(Math.sin(u * 7 + v * 3 + lobe * 2) + Math.sin(v * 11)) < 0.08 * strainK) c = 0xa02438;
          if (this.cap < 0.75 && Math.abs(Math.sin(v * 9 + u * 1.5)) < 0.09) c = shade(c, 0.72);
          if (Math.abs(u + 0.05) < 0.04 && v > -0.6) c = shade(c, 0.93);
          // the shine: a hard window highlight and a soft bloom around it
          const hx = u + 0.42, hv = v + 0.5, hd = hx * hx + hv * hv;
          const r0 = 0.03 * (0.7 + s * 0.4);
          if (hd < r0) c = 0xfff4f4; else if (hd < r0 * 2.6) c = mix(c, 0xffe0e4, 0.45);
          P.set(x, y, c);
        }
      }
      // splatter on the outside
      for (const sp of this.spots) if (sp.lobe === lobe) { const sx = Math.round(cx + sp.u * rx * 0.6), sy = Math.round(cy + sp.v * ry * 0.6); P.disc(sx, sy, sp.r, 0x6a0810, 0.9); P.set(sx, sy + Math.ceil(sp.r) + 1, 0x6a0810); }
    }
    // puffs out of the valve
    for (const q of this.puffs) if (q.on) P.blend(ox + q.x, oy + q.y, q.c, Math.min(0.85, q.life * 2));
    this.drawGauge(P, ox, oy, p);
  }

  /** brass pipe from above, a red bakelite handwheel, a T splitting to two nozzles */
  private drawValve(P: Pix, ox: number, oy: number, s: number) {
    const B = BRASS;
    const pipe = (x: number, y: number) => { P.set(x - 2, y, B[0]); P.set(x - 1, y, B[2]); P.set(x, y, B[3]); P.set(x + 1, y, B[2]); P.set(x + 2, y, B[1]); };
    for (let y = 0; y <= 10; y++) pipe(ox + 25, oy + y);
    // flange rings
    for (const y of [1, 8]) { P.hline(ox + 22, ox + 28, oy + y, B[1]); P.set(ox + 23, oy + y, B[4]); }
    // the handwheel, seen from the front: a bakelite rim with three spokes and a brass boss
    const wy = oy + 4, wx = ox + 25, wr = 5;
    for (let j = -2; j <= 2; j++) for (let i = -wr; i <= wr; i++) {
      const e = (i * i) / (wr * wr) + (j * j) / 6.25;
      if (e > 1.05) continue;
      if (e > 0.55) P.set(wx + i, wy + j, j < 0 ? 0xc83a2a : j === 0 ? 0x9a2418 : 0x6a160e);
    }
    const spin = this.phase * 0.25;
    for (let k = 0; k < 3; k++) { const a = spin + k * 2.094; P.set(Math.round(wx + Math.cos(a) * 3), wy + Math.round(Math.sin(a) * 1.2), 0x8a1a10); }
    P.rect(wx - 1, wy - 1, 3, 2, B[3]); P.set(wx - 1, wy - 1, B[4]);
    // the T and the two arms down to the balloon necks
    P.rect(ox + 21, oy + 10, 9, 3, B[2]); P.hline(ox + 21, ox + 29, oy + 10, B[3]); P.hline(ox + 21, ox + 29, oy + 12, B[0]);
    for (const [x0, x1] of [[21, 16], [29, 34]] as const) {
      for (let i = 0; i <= 4; i++) { const x = Math.round(ox + x0 + (x1 - x0) * i / 4), y = oy + 11 + i; P.set(x, y, B[3]); P.set(x, y + 1, B[1]); P.set(x + (x1 > x0 ? -1 : 1), y, B[2]); }
      P.rect(ox + x1 - 1, oy + 15, 3, 2, B[1]); P.set(ox + x1 - 1, oy + 15, B[4]);
    }
    void s;
  }

  /** the air gauge: steel bezel, cream face, OUT / IN, a red needle; a jewel lamp and a Nixie tube */
  private drawGauge(P: Pix, ox: number, oy: number, p: Player) {
    const cx = ox + GX, cy = oy + GY;
    // bezel and face (upper half disc)
    for (let j = -GR - 1; j <= 1; j++) for (let i = -GR - 1; i <= GR + 1; i++) {
      const d = Math.sqrt(i * i + j * j);
      if (d > GR + 1.3) continue;
      let c: number;
      if (j > 0) c = 0x3a3e44;
      else if (d > GR - 0.4) c = j < -GR * 0.5 && i < 0 ? 0xe8eef2 : d > GR + 0.5 ? 0x4a5058 : 0xa8b0b8;
      else { c = 0xf0e6c8; if (hash(i, j, 2) < 0.06) c = 0xe4d8b4; if (d < 4) c = mix(c, 0xd8ccaa, 0.4); }
      P.set(cx + i, cy + j, c);
    }
    // the red arc near IN = full, ticks every 30 degrees, typed ends
    for (let a = 0; a <= 6; a++) {
      const ang = Math.PI + (a / 6) * Math.PI;
      const c = Math.cos(ang), sn = Math.sin(ang);
      P.line(cx + c * (GR - 3), cy + sn * (GR - 3), cx + c * (GR - 1.2), cy + sn * (GR - 1.2), 0x2a2018);
    }
    type3(P, 'OUT', cx - 11, cy - 6, 0x2a2018, 0.8, 0.3);
    type3(P, 'IN', cx + 4, cy - 6, 0x2a2018, 0.8, 0.3);
    // needle: the metronome while pumping, otherwise the air you have
    const k = this.pumping ? this.pos : Math.max(0, Math.min(1, p.body.endurance));
    const ang = Math.PI + k * Math.PI;
    const nx = cx + Math.cos(ang) * (GR - 2), ny = cy + Math.sin(ang) * (GR - 2);
    P.line(cx + 1, cy, nx + 1, ny + 1, 0x000000, 0.3);
    P.line(cx, cy, nx, ny, 0xc0201a);
    P.disc(cx, cy, 1.5, BRASS[2]); P.set(cx - 1, cy - 1, BRASS[4]);
    // glass reflection over the face
    P.line(cx - 9, cy - 8, cx - 5, cy - 11, 0xffffff, 0.45);
    // jewel lamp (left): green perfect, amber good, red cough / miss
    const lx = ox + 4, ly = cy - 4;
    const lit = this.flashT > 0;
    const lc = !lit ? 0x5a3a20 : !this.flashGood ? 0xff3a20 : this.flashEnd >= 0 && this.combo > 0 && this.lastQ === 'perfect' ? 0x7aff6a : 0xffb030;
    P.rect(lx - 2, ly + 3, 5, 3, 0x2a2420); P.hline(lx - 2, lx + 2, ly + 3, 0x6a6058);
    P.disc(lx, ly, 2.4, shade(lc, lit ? 1 : 0.8)); P.set(lx - 1, ly - 1, lit ? 0xffffff : mix(lc, 0xffffff, 0.4));
    if (lit) P.ring(lx, ly, 3.6, lc, 0.35 * this.flashT * 4);
    // Nixie tube (right): the streak, glowing orange in a glass envelope
    const tx = ox + 42, ty = cy - 13;
    for (let y = ty; y <= ty + 13; y++) for (let x = tx; x <= tx + 6; x++) {
      const edge = x === tx || x === tx + 6 || (y === ty && (x === tx || x === tx + 6));
      if (y === ty && (x === tx || x === tx + 6)) continue;
      P.blend(x, y, edge ? 0xc8d8e0 : (x + y) % 2 ? 0x2a2e30 : 0x1a1c1e, edge ? 0.7 : 0.9);
    }
    P.rect(tx, ty + 14, 7, 2, 0x2a2420); P.hline(tx, tx + 6, ty + 14, 0x6a6058);
    if (this.pumping && this.combo > 0) {
      const g = NIX[String(Math.min(9, this.combo))];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') { P.set(tx + 2 + i, ty + 4 + j * 2, 0xffb050); P.set(tx + 2 + i, ty + 5 + j * 2, 0xff7a20); P.blend(tx + 1 + i, ty + 4 + j * 2, 0xff7a20, 0.25); }
    } else P.set(tx + 3, ty + 7, 0x4a3a30);
    P.vline(tx + 1, ty + 2, ty + 6, 0xffffff, 0.35);
    // the H key: a bakelite cap that pops up when the lungs need pumping
    if (!this.pumping && this.hint > 0 && Math.sin(this.t * 7) > -0.3) {
      const kx = ox + 36, ky = oy + 1, a = this.hint;
      P.rect(kx, ky, 9, 9, 0xe8dcc0, a); P.rect(kx, ky + 8, 9, 2, 0x8a7a5a, a); P.hline(kx, kx + 8, ky, 0xfff8e8, a);
      type3(P, 'H', kx + 3, ky + 2, 0x2a1a10, a);
    }
  }

  /** a point inside either balloon (logical cell px) */
  inside(lx: number, ly: number): boolean { return ly > 0 && ly < 62 && lx > 1 && lx < LUNG_W - 1; }
  dialPos(): number { return this.pos; }
}

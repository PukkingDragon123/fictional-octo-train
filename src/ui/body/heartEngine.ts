// The beating heart engine of the body HUD: an anatomical heart built like a
// small engine, drawn as pixel art next to the health bar (vitals.ts). A red
// muscle strapped in riveted steel bands, two piston cylinders on the atria,
// a steam vent, a brass front plate with a pressure gauge, and an outlet pipe
// with a valve that feeds the glass blood tube (the health bar).
//
// It owns the heartbeat the whole HUD keeps (the brain throbs on it, the bar
// pulses on it): the rate is the survivor's pulse, faster with exertion, fear
// and low health. Health is how hard it pumps (the squeeze and the piston
// stroke) and what the gauge reads. Damage cracks the plates and the muscle
// (deeper as health falls), wounds leak from the cracks, a blow makes it
// stutter (a held beat, then a scramble), and when it is weak the rhythm goes
// wrong: skipped beats that only flutter, early double beats.
import { Pix, mix, shade, hash, bayer } from './pix';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const MUSCLE = [0x2e040c, 0x520a16, 0x7c1220, 0xa61e2c, 0xcc3a44, 0xee7470];
const STEEL = [0x16181c, 0x2c3036, 0x464c54, 0x666e76, 0x949ca4, 0xc8d0d6];
const BRASS = [0x2e200c, 0x5a4018, 0x8a6626, 0xb88e3a, 0xe0bc62, 0xfae0a0];
const DEAD = [0x1c1a1a, 0x2e2a2a, 0x423c3c, 0x585050, 0x706868, 0x8c8484];
const INK = 0x0a0b10;

/** the muscle's shape in its own frame (x right, y down; ~24 x 28 units) */
function muscle(x: number, y: number): number {
  const E = (cx: number, cy: number, rx: number, ry: number, a = 0) => {
    const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    return 1 - u * u - v * v;
  };
  // ventricles (apex down and to the right), right atrium, the top of the left atrium
  return Math.max(E(1.5, 4, 9.6, 11.6, -0.42), E(-6.8, -3, 5.6, 6.4), E(4, -6, 6.4, 4.6));
}
/** cracks in the muscle and plates: (health threshold, polyline in the heart frame) */
const CRACKS: [number, [number, number][]][] = [
  [72, [[-3, -6], [-1, -3], [-2, 0], [0, 3]]],
  [52, [[7, 1], [5, 4], [6, 7], [4, 10]]],
  [36, [[-8, 2], [-6, 4], [-7, 7], [-4, 9], [-5, 12]]],
  [20, [[2, -8], [4, -5], [3, -2], [6, 0]]],
];

export class HeartEngine {
  /** seconds since the last beat */
  age = 9;
  /** this beat's strength (0 skipped .. 1 full) */
  str = 1;
  rate = 70;
  private next = 0.5;
  private hold = 0;
  stutter = 0;
  private flutter = 0;
  private jolt = 0;
  time = 0;
  /** one-shot events for sounds ('beat', 'skip', 'stall') */
  events: string[] = [];
  /** leaks and steam (in the HUD's pixel space) */
  private parts: { x: number; y: number; vx: number; vy: number; t: number; c: number; steam: boolean; on: boolean }[] = [];
  /** last drawn centre, for leaks */
  private cx = 0; private cy = 0;

  constructor(cx = 0, cy = 0) { this.cx = cx; this.cy = cy; for (let i = 0; i < 40; i++) this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, t: 0, c: 0, steam: false, on: false }); }

  /** the pump envelope of the current beat: a hard squeeze (lub), a smaller second (dub) */
  env(): number {
    const a = this.age;
    return (Math.exp(-a * 14) + (a > 0.2 ? 0.55 * Math.exp(-(a - 0.2) * 14) : 0)) * this.str + this.flutter * Math.abs(Math.sin(this.time * 50)) * 0.25;
  }
  /** a blow: the beat stalls, then scrambles */
  hit(k: number) {
    this.hold = 0.28 + 0.3 * clamp(k, 0, 1);
    this.stutter = Math.min(1, this.stutter + 0.45 + k * 0.4);
    this.jolt = 1;
    this.events.push('stall');
  }
  private part(x: number, y: number, vx: number, vy: number, t: number, c: number, steam: boolean) {
    for (const p of this.parts) if (!p.on) { p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = t; p.c = c; p.steam = steam; return; }
  }

  update(dt: number, hp: number, bpm: number, bleed: number, dead: boolean) {
    this.time += dt;
    this.age += dt;
    this.stutter = Math.max(0, this.stutter - dt * 0.35);
    this.flutter = Math.max(0, this.flutter - dt * 2.5);
    this.jolt = Math.max(0, this.jolt - dt * 4);
    for (const p of this.parts) if (p.on) {
      p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.steam) { p.vx *= 1 - dt * 1.5; p.vy -= 6 * dt; } else p.vy += 120 * dt;
      if (p.t <= 0) p.on = false;
    }
    if (dead) { this.rate = 0; this.str = 0; return; }
    // the pulse, quickened by a weak body
    this.rate = clamp(bpm + Math.max(0, 70 - hp) * 0.45, 40, 190);
    if (this.hold > 0) { this.hold -= dt; return; }
    this.next -= dt;
    if (this.next > 0) return;
    const interval = 60 / this.rate;
    const irr = clamp((42 - hp) / 42, 0, 1) * 0.7 + this.stutter * 0.8;
    const full = 0.35 + 0.65 * clamp(hp / 100, 0, 1);
    if (Math.random() < irr * 0.22) {
      // a skipped beat: it only flutters
      this.flutter = 0.6; this.next = interval * (0.8 + Math.random() * 0.3); this.events.push('skip');
      return;
    }
    this.age = 0; this.str = full * (1 - irr * 0.3 * Math.random());
    this.next = interval * (1 + (Math.random() - 0.5) * irr * 0.6);
    if (Math.random() < irr * 0.18) this.next = interval * 0.32; // an early double
    this.events.push('beat');
    // steam from the vent on every stroke; blood from the cracks when you bleed
    const ps = hp < 30 ? 3 : 1;
    for (let i = 0; i < ps; i++) this.part(this.cx + 7 + Math.random(), this.cy - 15, (Math.random() - 0.3) * 8, -10 - Math.random() * 10, 0.5 + Math.random() * 0.3, hp < 30 ? 0x9a9a9a : 0xe6e6e0, true);
    if (bleed > 0.015) for (const [th, pts] of CRACKS) if (hp < th + 8 && Math.random() < 0.3 + bleed * 0.4) {
      const [ex, ey] = pts[pts.length - 1];
      this.part(this.cx + ex, this.cy + ey, (Math.random() - 0.5) * 12, -4 - Math.random() * 10, 0.8, 0xb01020, false);
    }
  }

  /** draw it centred at (cx, cy); hp 0..100; hover lifts it a little */
  draw(P: Pix, cx: number, cy: number, hp: number, dead: boolean, hover: boolean, outlet: { x: number; y: number }) {
    this.cx = cx; this.cy = cy;
    const env = dead ? 0 : this.env();
    const k = 1 - env * 0.1;
    const jx = this.jolt > 0.05 ? Math.round(Math.sin(this.time * 70) * 1.5 * this.jolt) : 0;
    cx += jx;
    const M = dead ? DEAD : MUSCLE, S = dead ? DEAD : STEEL, B = dead ? DEAD : BRASS;
    const L = [-0.5, -0.7, 0.5];
    // ---- the outlet pipe into the blood tube, a flange and a valve
    const py = Math.round(cy - 3), px0 = Math.round(cx + 7);
    for (let x = px0; x <= outlet.x; x++) {
      P.set(x, py - 1, B[4]); P.set(x, py, B[3]); P.set(x, py + 1, B[2]); P.set(x, py + 2, B[1]);
    }
    for (let y = py - 2; y <= py + 3; y++) { P.set(outlet.x - 1, y, y === py - 2 ? B[5] : B[2]); P.set(outlet.x - 2, y, y === py - 2 ? B[4] : B[1]); }
    const vx = Math.round((px0 + outlet.x) / 2);
    for (let i = -2; i <= 2; i++) P.set(vx + i, py - 4, i === 0 ? B[5] : B[3]);
    P.set(vx, py - 3, S[3]); P.set(vx, py - 2, S[2]);
    // ---- the inlet stub on the left (the veins come in here)
    const iy = Math.round(cy - 6);
    for (let x = Math.round(cx - 15); x < Math.round(cx - 9); x++) { P.set(x, iy, S[4]); P.set(x, iy + 1, S[3]); P.set(x, iy + 2, S[1]); }
    for (let y = iy - 1; y <= iy + 3; y++) P.set(Math.round(cx - 15), y, y === iy - 1 ? S[5] : S[2]);
    // ---- the piston cylinders on the atria: rods leap on every stroke
    const stroke = Math.round(env * (1.5 + 3 * clamp(hp / 100, 0, 1)));
    for (const ox of [-7, 1]) {
      const x0 = Math.round(cx + ox), top = Math.round(cy - 15 * k);
      // rod + cap
      for (let y = top - 3 - stroke; y < top; y++) { P.set(x0 + 1, y, B[4]); P.set(x0 + 2, y, B[2]); }
      for (let i = 0; i < 4; i++) { P.set(x0 + i, top - 4 - stroke, i === 0 ? B[5] : B[3]); }
      // cylinder
      for (let y = top; y < top + 6; y++) for (let i = 0; i < 4; i++) {
        let c = S[i === 0 ? 4 : i === 3 ? 1 : 3];
        if (y === top) c = S[5]; else if ((y - top) % 2 === 0 && i > 0 && i < 3) c = S[2];
        P.set(x0 + i, y, c);
      }
    }
    // the steam vent (a short chimney on the right atrium)
    const vtx = Math.round(cx + 7), vty = Math.round(cy - 13 * k);
    for (let y = vty - 2; y <= vty; y++) { P.set(vtx, y, S[4]); P.set(vtx + 1, y, S[2]); }
    P.set(vtx - 1, vty - 3, S[5]); P.set(vtx, vty - 3, S[4]); P.set(vtx + 1, vty - 3, S[3]); P.set(vtx + 2, vty - 3, S[1]);
    // ---- the muscle, strapped in steel bands, with a brass plate and the gauge
    const crit = clamp((40 - hp) / 40, 0, 1);
    const R = 17;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const lx = (x + 0.5 - cx) / k, ly = (y + 0.5 - cy) / k;
      const h = muscle(lx, ly);
      if (h <= 0) continue;
      const hz = (fx: number, fy: number) => Math.sqrt(Math.max(0, muscle(fx, fy)));
      const dx = (hz(lx + 0.5, ly) - hz(lx - 0.5, ly)) * 5, dy = (hz(lx, ly + 0.5) - hz(lx, ly - 0.5)) * 5;
      const nl = Math.hypot(dx, dy, 1);
      const lam = (-dx * L[0] - dy * L[1] + L[2]) / nl;
      let t = Math.round(clamp(lam * 4.4 + 0.4 + (bayer(x, y) - 0.5) * 0.7, 0, 5));
      let c = M[t];
      // muscle fibres and a coronary vessel
      if (((Math.floor(lx * 0.9 + ly * 0.5) % 3) + 3) % 3 === 0 && t > 1 && t < 5 && bayer(x, y) < 0.4) c = M[t - 1];
      const cor = Math.abs(lx + 1.2 - Math.sin(ly * 0.28) * 2.2 - ly * 0.25);
      if (cor < 0.55 && ly > -6 && ly < 12) c = dead ? M[1] : mix(0x6a1a6a, M[t], 0.35);
      // steel bands round it, riveted
      for (const by of [-1.5, 7]) {
        const d = ly - by - lx * 0.12;
        if (Math.abs(d) < 1.3) {
          c = S[Math.round(clamp(lam * 3.5 + (d < 0 ? 1.4 : 0.2), 0, 5))];
          if (Math.abs(d) < 0.5 && ((Math.round(lx) % 4) + 4) % 4 === 0) c = B[5];
        }
      }
      // the brass plate on the front
      if (lx > -5.5 && lx < 3.5 && ly > 1.2 && ly < 5.6) {
        c = B[ly < 1.9 ? 5 : ly > 4.9 ? 1 : lx < -4.8 ? 4 : 3];
      }
      if (hover) c = mix(c, 0xfff0d0, 0.1);
      if (crit > 0 && !dead && t >= 2) c = mix(c, 0xff4a3a, crit * env * 0.5);
      P.set(x, y, c);
    }
    // ---- the gauge window on the plate: needle reads the pressure (low health, a weak stroke: it sags)
    const gx = Math.round(cx - 4 * k), gy = Math.round(cy + 2 * k);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 7; i++) P.set(gx + i, gy + j, j === 2 && i < 2 ? 0x6a1a14 : 0x161812);
    const pr = dead ? 0 : clamp(hp / 100 * 0.8 + env * 0.35 + (this.stutter > 0.3 ? Math.sin(this.time * 31) * 0.15 : 0), 0, 1);
    const a = -1.25 + pr * 2.5;
    const nx = gx + 3 + Math.sin(a) * 2.6, ny = gy + 2.6 - Math.cos(a) * 2.6;
    P.line(gx + 3, gy + 2, nx, ny, pr < 0.3 ? 0xff5a3a : 0xf2f0e0);
    // ---- cracks (deeper with damage) and their leaks
    for (const [th, pts] of CRACKS) {
      if (hp >= th) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        P.line(cx + pts[i][0] * k, cy + pts[i][1] * k, cx + pts[i + 1][0] * k, cy + pts[i + 1][1] * k, INK);
      }
      const [ex, ey] = pts[1];
      P.set(cx + ex * k + 1, cy + ey * k + 1, shade(M[5], 1.1));
    }
    for (const p of this.parts) if (p.on && !p.steam) { P.set(p.x, p.y, p.c); P.set(p.x, p.y - 1, 0xe03a46); }
  }

  /** steam goes over the ink (soft, dithered) */
  drawSteam(P: Pix) {
    for (const p of this.parts) if (p.on && p.steam && hash(Math.round(p.x), Math.round(p.y), 3) < p.t * 1.6) {
      P.blend(p.x, p.y, p.c, 0.8); if (p.t > 0.35) P.blend(p.x + 1, p.y, p.c, 0.5);
    }
  }
}

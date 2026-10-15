// Destruction sounds, synthesised: impacts per material (wood knocks and
// cracks, metal dents and clangs, fabric thumps, plastic snaps, ceramic
// cracks), the big breaks (splintering crashes, crumpling metal, a sofa
// bursting, a CRT imploding, porcelain exploding), electrical spark zaps,
// glass sheets shattering, drywall punched through, fluorescent tubes
// popping, bullet impacts, debris clattering down and settling, and the
// scrape loops of furniture being shoved across a floor.
import { defSound, defLoopSound, kit } from '../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, perc, adsr, rnd } from '../audio/synth';

const { thump, burst } = kit;

/** sharp crackle: tiny clicks scattered over a span (fibres giving way) */
function crackle(span: number, n: number, f: number, g = 0.5, k = 220) {
  const b = new Buf(span + 0.04);
  for (let i = 0; i < n; i++) {
    const c = noise(0.014, 'white'); bandpass(c, f * (0.6 + rnd() * 0.9), 2.5); c.env(decay(k));
    b.mix(c, rnd() * span, g * (0.4 + rnd() * 0.6));
  }
  return b;
}
/** a resonant knock (wooden body) */
function knock(f: number, len = 0.25, k = 22) {
  const b = osc(len, 'tri', (t) => f * (1 - t * 0.4)).env(decay(k));
  b.mix(osc(len, 'sine', f * 2.7).env(decay(k * 1.6)), 0, 0.35);
  return b;
}
/** metal ring: a few inharmonic partials */
function ring(f: number, len: number, k: number, g = 1) {
  const b = new Buf(len);
  for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.3], [8.93, 0.15]] as const) b.mix(osc(len, 'sine', f * m * (1 + (rnd() - 0.5) * 0.01)).env(decay(k * (0.7 + m * 0.15))), 0, a * g);
  return b;
}
function tinkle(len: number, n: number, g = 0.15) {
  const b = new Buf(len);
  for (let i = 0; i < n; i++) b.mix(osc(0.18, 'sine', 2600 + rnd() * 5200).env(decay(20 + rnd() * 30)), Math.pow(rnd(), 1.8) * (len - 0.2), g * (0.5 + rnd()));
  return b;
}

// ---------------------------------------------------------------- hits
defSound('dmg_hit_wood', (v) => {
  const b = new Buf(0.45);
  b.mix(knock(170 + v * 25, 0.3, 18), 0, 0.9);
  b.mix(burst(0.08, 'pink', 3200, 200, 40), 0, 0.6);
  b.mix(crackle(0.1, 7, 3600, 0.5), 0.01, 1);
  return b.drive(1.5).normalize(0.75);
});
defSound('dmg_hit_metal', (v) => {
  const b = new Buf(0.9);
  b.mix(thump(0.12, 260, 90, 30), 0, 0.7);
  b.mix(ring(380 + v * 70, 0.85, 7), 0, 0.5);
  b.mix(burst(0.05, 'white', 7000, 1500, 70), 0, 0.5);
  return b.drive(1.4).normalize(0.75);
});
defSound('dmg_hit_fabric', (v) => {
  const b = new Buf(0.35);
  b.mix(thump(0.22, 110 + v * 10, 45, 16), 0, 1);
  b.mix(burst(0.15, 'brown', 700, 40, 20), 0, 0.7);
  b.mix(osc(0.18, 'saw', (t) => 160 - t * 200).env(decay(30)), 0.02, 0.15); // springs inside
  return b.normalize(0.7);
});
defSound('dmg_hit_plastic', (v) => {
  const b = new Buf(0.3);
  b.mix(knock(420 + v * 60, 0.18, 35), 0, 0.7);
  b.mix(burst(0.04, 'white', 6000, 900, 90), 0, 0.6);
  return b.normalize(0.6);
});
defSound('dmg_hit_hard', (v) => {
  const b = new Buf(0.4);
  b.mix(knock(620 + v * 80, 0.12, 50), 0, 0.6);
  b.mix(crackle(0.08, 9, 5200, 0.6, 300), 0, 1);
  b.mix(tinkle(0.3, 3, 0.1), 0.02, 1);
  return b.normalize(0.7);
});
defSound('dmg_kick', (v) => {
  const b = new Buf(0.3);
  b.mix(thump(0.2, 140 + v * 12, 55, 22), 0, 1);
  b.mix(burst(0.06, 'pink', 2400, 100, 50), 0, 0.5);
  return b.normalize(0.7);
});

// ---------------------------------------------------------------- breaks
defSound('dmg_break_wood', (v) => {
  const b = new Buf(1.6);
  b.mix(knock(120 + v * 15, 0.4, 10), 0, 0.9);
  b.mix(burst(0.35, 'pink', 3500, 120, 10), 0, 0.7);
  // the long splintering tear, then boards clattering
  const t = noise(0.4, 'white'); bandpass(t, (x) => 1400 + x * 2800, 1.3); t.env(adsr(0.01, 0.08, 0.5, 0.2, 0.4));
  b.mix(t, 0.02, 0.6);
  b.mix(crackle(0.35, 26, 3000, 0.7), 0, 1);
  for (let i = 0; i < 7; i++) b.mix(knock(180 + rnd() * 260, 0.18, 30), 0.25 + rnd() * 1.0, 0.25 + rnd() * 0.3);
  return b.drive(1.8).normalize(0.9);
});
defSound('dmg_break_metal', (v) => {
  const b = new Buf(1.8);
  b.mix(thump(0.3, 180, 60, 12), 0, 0.9);
  // crumpling sheet: a band-swept grind, then rattling parts
  const c = noise(0.5, 'white'); bandpass(c, (x) => 900 + Math.sin(x * 40) * 400, 2); c.env(adsr(0.01, 0.1, 0.6, 0.25, 0.5));
  b.mix(c, 0.01, 0.6);
  b.mix(ring(240 + v * 40, 1.4, 4), 0, 0.45);
  for (let i = 0; i < 6; i++) b.mix(ring(500 + rnd() * 900, 0.3, 18), 0.3 + rnd() * 1.1, 0.12 + rnd() * 0.12);
  return b.drive(1.6).normalize(0.9);
});
defSound('dmg_break_fabric', (v) => {
  const b = new Buf(1.4);
  b.mix(thump(0.35, 95 + v * 8, 38, 9), 0, 1);
  // the cover splitting, stuffing whumping out, a spring twanging
  const r = noise(0.35, 'white'); bandpass(r, (x) => 800 + x * 2000, 1.4); r.env(adsr(0.01, 0.05, 0.6, 0.2, 0.35));
  b.mix(r, 0.04, 0.6);
  b.mix(burst(0.5, 'brown', 600, 30, 6), 0.02, 0.8);
  b.mix(osc(0.8, 'saw', (t) => 210 + Math.sin(t * 90) * 30 - t * 60).env(decay(5)), 0.1, 0.12);
  b.mix(crackle(0.25, 12, 1800, 0.5), 0.05, 1);
  for (let i = 0; i < 4; i++) b.mix(knock(140 + rnd() * 120, 0.2, 25), 0.3 + rnd() * 0.7, 0.2);
  return b.normalize(0.9);
});
defSound('dmg_break_plastic', (v) => {
  const b = new Buf(1.0);
  b.mix(knock(300 + v * 40, 0.2, 24), 0, 0.7);
  b.mix(crackle(0.12, 14, 4200, 0.8, 260), 0, 1);
  for (let i = 0; i < 8; i++) b.mix(knock(500 + rnd() * 600, 0.1, 50), 0.12 + rnd() * 0.7, 0.2);
  return b.drive(1.5).normalize(0.85);
});
defSound('dmg_break_ceramic', (v) => {
  const b = new Buf(1.3);
  b.mix(thump(0.12, 300, 120, 30), 0, 0.6);
  b.mix(burst(0.12, 'white', 9000, 1500, 30), 0, 0.8);
  b.mix(crackle(0.15, 20, 5600, 0.8, 320), 0, 1);
  b.mix(tinkle(1.1, 30, 0.13), 0.03, 1);
  void v; return b.normalize(0.9);
});
defSound('dmg_break_glass', (v) => {
  const b = new Buf(2.0);
  b.mix(burst(0.3, 'white', 10000, 1400, 9), 0, 1);
  b.mix(thump(0.18, 260, 90, 24), 0, 0.5);
  b.mix(tinkle(1.8, 46, 0.14), 0.01, 1);
  // a second wave: the shards hitting the floor
  b.mix(burst(0.2, 'white', 8000, 2000, 14), 0.32 + v * 0.03, 0.45);
  b.mix(tinkle(1.2, 24, 0.1), 0.35, 1);
  return b.normalize(0.95);
});
defSound('dmg_tv_implode', (v) => {
  const b = new Buf(2.2);
  // the tube goes: a hollow whump inward, glass, the electron gun's last whine
  b.mix(thump(0.45, 70 + v * 6, 30, 7), 0, 1);
  b.mix(burst(0.25, 'brown', 800, 30, 10), 0, 0.8);
  b.mix(burst(0.3, 'white', 9500, 1300, 10), 0.03, 0.8);
  b.mix(tinkle(1.6, 34, 0.12), 0.05, 1);
  const w = osc(1.2, 'sine', (t) => 15600 - t * 9000); w.env(decay(4)); b.mix(w, 0.02, 0.06);
  const z = noise(0.8, 'white'); z.crush(4, 6); highpass(z, 1800); z.env(decay(5)); b.mix(z, 0.05, 0.3);
  return b.drive(1.4).normalize(0.95);
});
defSound('dmg_spark', (v) => {
  const b = new Buf(0.5);
  // an electrical zap: crushed buzz bursts and snapping arcs
  for (let i = 0; i < 4 + v; i++) {
    const z = noise(0.05 + rnd() * 0.06, 'white'); z.crush(3, 4 + Math.floor(rnd() * 8)); highpass(z, 1200); z.env(decay(30));
    b.mix(z, rnd() * 0.3, 0.5 + rnd() * 0.5);
  }
  b.mix(osc(0.25, 'square', 120).env(decay(20)), 0, 0.2);
  b.mix(crackle(0.3, 14, 6000, 0.7, 400), 0, 1);
  return b.normalize(0.6);
});
defSound('dmg_light_pop', (v) => {
  const b = new Buf(1.6);
  // a fluorescent tube: a pop, a fizz of gas, glass raining down a moment later
  b.mix(burst(0.06, 'white', 9000, 600, 60), 0, 1);
  b.mix(thump(0.1, 400, 150, 40), 0, 0.5);
  const f = noise(0.5, 'white'); highpass(f, 3000); f.env(decay(7)); b.mix(f, 0.02, 0.4);
  b.mix(tinkle(1.0, 24, 0.12), 0.35 + v * 0.02, 1);
  return b.normalize(0.85);
});

// ---------------------------------------------------------------- walls
defSound('dmg_wall_hit', (v) => {
  const b = new Buf(0.6);
  b.mix(thump(0.25, 120 + v * 10, 48, 14), 0, 1);
  b.mix(burst(0.18, 'pink', 2800, 150, 16), 0, 0.7);
  b.mix(crackle(0.2, 14, 2600, 0.6), 0.01, 1);
  // chalky bits pattering down
  for (let i = 0; i < 6; i++) b.mix(burst(0.03, 'white', 5000, 1500, 90), 0.1 + rnd() * 0.4, 0.15);
  return b.drive(1.6).normalize(0.85);
});
defSound('dmg_wall_break', (v) => {
  const b = new Buf(2.0);
  b.mix(thump(0.4, 100 + v * 8, 36, 8), 0, 1);
  b.mix(burst(0.6, 'pink', 2400, 80, 5), 0, 0.8);
  b.mix(crackle(0.5, 40, 2400, 0.8), 0, 1);
  // board tearing loose, then rubble
  const t = noise(0.5, 'white'); bandpass(t, (x) => 600 + x * 1800, 1.2); t.env(adsr(0.02, 0.1, 0.5, 0.3, 0.5)); b.mix(t, 0.05, 0.5);
  for (let i = 0; i < 18; i++) b.mix(burst(0.05, 'pink', 3500, 300, 50), 0.2 + rnd() * 1.5, 0.15 + rnd() * 0.15);
  return b.drive(1.7).normalize(0.95);
});
defSound('dmg_bullet_wall', (v) => {
  const b = new Buf(0.3);
  b.mix(burst(0.05, 'white', 7000, 900, 80), 0, 1);
  b.mix(thump(0.08, 300, 120, 50), 0, 0.5);
  b.mix(crackle(0.06, 6, 4000, 0.5), 0.005, 1);
  void v; return b.normalize(0.6);
});
defSound('dmg_ricochet', (v) => {
  const b = new Buf(0.6);
  b.mix(burst(0.03, 'white', 9000, 2000, 120), 0, 0.8);
  const w = osc(0.5, 'sine', (t) => 3200 + v * 300 - t * 2400); w.env(perc(0.005, 9)); b.mix(w, 0.01, 0.35);
  return b.normalize(0.6);
});

// ---------------------------------------------------------------- debris
defSound('dmg_debris_wood', (v) => {
  const b = new Buf(0.35);
  b.mix(knock(200 + v * 70 + rnd() * 80, 0.22, 28), 0, 1);
  return b.normalize(0.45);
});
defSound('dmg_debris_metal', (v) => {
  const b = new Buf(0.6);
  b.mix(ring(600 + v * 150, 0.5, 14), 0, 0.6);
  b.mix(burst(0.03, 'white', 6000, 1000, 100), 0, 0.5);
  return b.normalize(0.45);
});
defSound('dmg_debris_soft', (v) => {
  const b = new Buf(0.3);
  b.mix(thump(0.18, 100 + v * 15, 50, 25), 0, 1);
  b.mix(burst(0.1, 'brown', 500, 40, 30), 0, 0.5);
  return b.normalize(0.4);
});
defSound('dmg_debris_glass', (v) => {
  const b = new Buf(0.5);
  b.mix(tinkle(0.45, 6 + v, 0.25), 0, 1);
  return b.normalize(0.45);
});
defSound('dmg_crumble', (v) => {
  const b = new Buf(1.2);
  for (let i = 0; i < 16; i++) b.mix(burst(0.04, 'pink', 3000 + rnd() * 2000, 200, 60), rnd() * 1.0, 0.2 + rnd() * 0.2);
  b.mix(burst(0.6, 'brown', 500, 30, 4), 0, 0.3);
  void v; return b.normalize(0.5);
});

// ---------------------------------------------------------------- push / drag
defLoopSound('dmg_scrape_wood', () => {
  const len = 2;
  const b = noise(len, 'white');
  bandpass(b, (t) => 620 + Math.sin(t * 7.3) * 160 + Math.sin(t * 19) * 60, 2.2);
  // stick-slip judder
  b.env((t) => 0.55 + 0.45 * Math.max(0, Math.sin(t * 2 * Math.PI * 9 + Math.sin(t * 3) * 2)));
  const g = osc(len, 'saw', (t) => 95 + Math.sin(t * 5) * 12); lowpass(g, 400);
  b.mix(g, 0, 0.15);
  return b.normalize(0.5);
});
defLoopSound('dmg_scrape_metal', () => {
  const len = 2;
  const b = noise(len, 'white');
  bandpass(b, (t) => 1500 + Math.sin(t * 6) * 400, 4);
  b.env((t) => 0.5 + 0.5 * Math.max(0, Math.sin(t * 2 * Math.PI * 13)));
  const sq = osc(len, 'saw', (t) => 780 + Math.sin(t * 3.1) * 90); bandpass(sq, 1600, 6); b.mix(sq, 0, 0.12);
  return b.normalize(0.45);
});
defLoopSound('dmg_scrape_soft', () => {
  const len = 2;
  const b = noise(len, 'pink');
  bandpass(b, (t) => 380 + Math.sin(t * 4) * 80, 1.4);
  b.env((t) => 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 3) ** 2);
  return b.normalize(0.4);
});
defSound('dmg_grab', (v) => {
  const b = new Buf(0.3);
  b.mix(thump(0.15, 160 + v * 20, 70, 26), 0, 0.8);
  b.mix(knock(260 + v * 40, 0.15, 30), 0.02, 0.4);
  return b.normalize(0.5);
});
defSound('dmg_stuck', (v) => {
  const b = new Buf(0.4);
  b.mix(thump(0.2, 120 + v * 10, 60, 18), 0, 0.9);
  const c = osc(0.3, 'saw', (t) => 90 + t * 40); bandpass(c, 500, 3); c.env(decay(9)); b.mix(c, 0, 0.3);
  return b.normalize(0.5);
});

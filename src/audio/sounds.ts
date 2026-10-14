import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, voice, rnd, setSeed, SR } from './synth';

/**
 * Sound recipes. Each returns a freshly synthesised buffer; variants (v)
 * shuffle the random seed and pitch so repeated sounds never feel canned.
 */
type Recipe = (v: number) => Buf;
const R: Record<string, Recipe> = {};
const def = (k: string, f: Recipe) => { R[k] = f; };
/** register a one-shot recipe from another module (creature packs etc.) */
export const defSound = (k: string, f: Recipe) => { R[k] = f; };
/** keys of looping recipes registered from other modules (seamless crossfade + loop playback) */
export const LOOP_KEYS = new Set<string>();
export const defLoopSound = (k: string, f: Recipe) => { R[k] = f; LOOP_KEYS.add(k); };

const thump = (len: number, f0: number, f1: number, k: number) => osc(len, 'sine', (t) => f1 + (f0 - f1) * Math.exp(-t * 30)).env(decay(k));
const burst = (len: number, color: 'white' | 'pink' | 'brown', lp: number, hp: number, k: number) => { const b = noise(len, color); lowpass(b, lp); if (hp) highpass(b, hp); return b.env(decay(k)); };
const clickS = (f: number, len = 0.02) => osc(len, 'square', f).env(decay(300));
/** shared building blocks for recipe packs */
export const kit = { thump, burst, clickS };

// ---------------------------------------------------------------- footsteps
function step(soft: number, bright: number, wet: number, hard: number) {
  return (v: number) => {
    const b = new Buf(0.22);
    const heel = burst(0.09, 'pink', 900 + bright * 3500 + v * 120, 60, 55 - soft * 20);
    const toe = burst(0.07, 'white', 1500 + bright * 5000, 300, 80);
    b.mix(heel, 0, 0.9); b.mix(toe, 0.045 + (v % 3) * 0.008, 0.45);
    if (hard) b.mix(thump(0.08, 180 + v * 10, 70, 40), 0, hard * 0.6);
    if (wet) { const sp = burst(0.18, 'white', 3500, 900, 18); bandpass(sp, 1800 + v * 200, 1.5); b.mix(sp, 0.01, wet); }
    return b.normalize(0.7);
  };
}
def('step_carpet', step(0.9, 0.0, 0, 0.3));
def('step_wetcarpet', step(0.8, 0.1, 0.6, 0.2));
def('step_tile', step(0.2, 0.8, 0, 0.5));
def('step_concrete', step(0.4, 0.5, 0, 0.7));
def('step_linoleum', step(0.35, 0.7, 0, 0.4));
def('step_grass', (v) => { const b = burst(0.2, 'white', 6000, 1500, 18); bandpass(b, 3000 + v * 300, 0.8); return b.normalize(0.5); });
def('step_dirt', step(0.7, 0.2, 0, 0.4));
def('step_gravel', (v) => { const b = new Buf(0.25); for (let i = 0; i < 9; i++) b.mix(burst(0.02, 'white', 7000, 2000, 200), i * 0.018 + rnd() * 0.01, 0.4 + rnd() * 0.4); b.mix(thump(0.1, 120, 60, 30), 0, 0.4); void v; return b.normalize(0.6); });
def('step_wood', (v) => { const b = step(0.3, 0.4, 0, 0.6)(v); const k = thump(0.12, 260 + v * 15, 140, 35); b.mix(k, 0, 0.5); return b.normalize(0.7); });
def('step_metal', (v) => { const b = step(0.2, 0.9, 0, 0.3)(v); const r = osc(0.25, 'sine', 820 + v * 60).env(decay(18)); b.mix(r, 0, 0.25); comb(b, 0.0023, 0.6, 0.3); return b.normalize(0.7); });
def('step_water', step(0.5, 0.2, 1.0, 0.1));
def('step_deep', (v) => { const b = burst(0.5, 'pink', 1200, 80, 6); bandpass(b, 500 + v * 80, 0.8); return b.normalize(0.6); });
def('pad', (v) => burst(0.06, 'pink', 700 + v * 50, 80, 70).normalize(0.4));
def('hoof', (v) => { const b = clickS(1300 + v * 120, 0.05); b.mix(thump(0.06, 400, 200, 60), 0, 0.5); return b.normalize(0.5); });

// ---------------------------------------------------------------- ui
def('click', () => { const b = clickS(2200, 0.012); b.mix(clickS(900, 0.01), 0.008, 0.6); return b.normalize(0.5); });
def('menu', () => { const b = burst(0.06, 'white', 4000, 1200, 60); return b.normalize(0.25); });
def('tab', () => { const b = clickS(1500, 0.015); return b.normalize(0.35); });
def('grab', () => burst(0.08, 'pink', 2500, 300, 40).normalize(0.35));
def('bagOpen', () => { const b = new Buf(0.4); b.mix(burst(0.15, 'white', 3000, 500, 15), 0, 0.6); b.mix(burst(0.12, 'pink', 2000, 300, 20), 0.15, 0.5); for (let i = 0; i < 6; i++) b.mix(clickS(3000 + rnd() * 2000, 0.006), 0.05 + i * 0.03, 0.2); return b.normalize(0.4); });
def('bagClose', () => { const b = new Buf(0.3); b.mix(burst(0.1, 'pink', 2500, 300, 25), 0, 0.6); b.mix(thump(0.08, 200, 90, 40), 0.08, 0.4); return b.normalize(0.4); });
def('scannerUp', () => {
  const b = new Buf(0.6);
  const servo = osc(0.35, 'saw', (t) => 220 + t * 500); lowpass(servo, 900); servo.env(adsr(0.03, 0.1, 0.5, 0.15, 0.35));
  b.mix(servo, 0, 0.18);
  b.mix(clickS(1800, 0.02), 0.32, 0.6);
  b.mix(osc(0.12, 'sine', 1760).env(decay(25)), 0.42, 0.25);
  b.mix(osc(0.12, 'sine', 2350).env(decay(25)), 0.5, 0.2);
  return b.normalize(0.45);
});
def('scannerDown', () => { const b = new Buf(0.4); const s = osc(0.3, 'saw', (t) => 600 - t * 900); lowpass(s, 800); s.env(adsr(0.02, 0.1, 0.5, 0.1, 0.3)); b.mix(s, 0, 0.2); b.mix(clickS(1200, 0.02), 0.25, 0.5); return b.normalize(0.4); });
def('scanClick', () => { const b = new Buf(0.08); b.mix(clickS(2600, 0.008), 0, 0.7); b.mix(burst(0.03, 'white', 6000, 2500, 120), 0.004, 0.3); b.mix(thump(0.04, 300, 150, 80), 0, 0.3); return b.normalize(0.5); });
def('dial', () => { const b = clickS(3400, 0.006); b.mix(clickS(2200, 0.004), 0.003, 0.5); return b.normalize(0.3); });
def('scanDone', () => { const b = new Buf(0.45); b.mix(osc(0.1, 'square', 1320).env(decay(20)), 0, 0.3); b.mix(osc(0.18, 'square', 1760).env(decay(14)), 0.12, 0.3); lowpass(b, 4000); return b.normalize(0.4); });
def('radarPing', () => { const b = osc(0.5, 'sine', 1180).env(decay(9)); b.mix(osc(0.5, 'sine', 2360).env(decay(14)), 0, 0.2); return b.normalize(0.25); });
def('paper', () => { const b = burst(0.35, 'white', 5000, 800, 8); bandpass(b, 3000, 0.6); return b.normalize(0.3); });
def('terminal', () => { const b = new Buf(0.6); for (let i = 0; i < 8; i++) b.mix(clickS(1800 + rnd() * 800, 0.01), i * 0.06 + rnd() * 0.02, 0.4); b.mix(osc(0.3, 'sine', 15800).env(decay(8)), 0, 0.03); return b.normalize(0.35); });

// ---------------------------------------------------------------- doors, windows, objects
def('door_open', (v) => {
  const b = new Buf(1.0);
  b.mix(clickS(900 + v * 50, 0.03), 0, 0.6);
  const creak = osc(0.8, 'saw', (t) => 180 + Math.sin(t * 9 + v) * 40 + t * 60); bandpass(creak, (t) => 700 + t * 500, 3); creak.env(adsr(0.08, 0.2, 0.6, 0.3, 0.8));
  b.mix(creak, 0.05, 0.35 + rnd() * 0.2);
  return b.normalize(0.55);
});
def('door_close', (v) => { const b = new Buf(0.5); b.mix(thump(0.3, 140 + v * 10, 55, 14), 0, 0.9); b.mix(burst(0.12, 'pink', 1800, 100, 25), 0, 0.5); b.mix(clickS(1100, 0.02), 0.04, 0.5); return b.normalize(0.7); });
def('door_locked', () => { const b = new Buf(0.4); for (let i = 0; i < 3; i++) { b.mix(clickS(700 + rnd() * 300, 0.03), i * 0.08, 0.6); b.mix(burst(0.04, 'white', 3000, 600, 60), i * 0.08, 0.3); } return b.normalize(0.5); });
def('door_kick', () => { const b = new Buf(0.8); b.mix(thump(0.5, 110, 40, 8), 0, 1); b.mix(burst(0.3, 'brown', 1200, 40, 9), 0, 0.8); b.mix(burst(0.4, 'white', 2500, 400, 12), 0.01, 0.3); return b.drive(1.5).normalize(0.85); });
def('knock', () => { const b = new Buf(0.9); for (let i = 0; i < 3; i++) { b.mix(thump(0.12, 260, 120, 35), i * 0.22, 0.9); b.mix(burst(0.04, 'pink', 2500, 200, 80), i * 0.22, 0.4); } return b.normalize(0.7); });
def('lock', () => { const b = clickS(1400, 0.02); b.mix(clickS(2400, 0.015), 0.05, 0.6); return b.normalize(0.4); });
def('switch', () => { const b = clickS(1900, 0.015); b.mix(thump(0.03, 500, 200, 120), 0, 0.4); return b.normalize(0.45); });
def('window_slide', () => { const b = burst(0.6, 'white', 2200, 300, 3); bandpass(b, (t) => 900 + t * 300, 1); return b.env(adsr(0.05, 0.1, 0.8, 0.15, 0.6)).normalize(0.4); });
def('glass_break', (v) => {
  const b = new Buf(1.6);
  b.mix(burst(0.25, 'white', 9000, 1200, 12), 0, 0.9);
  b.mix(thump(0.15, 300, 100, 30), 0, 0.5);
  for (let i = 0; i < 26; i++) { const f = 2500 + rnd() * 6000; b.mix(osc(0.25, 'sine', f).env(decay(18 + rnd() * 30)), 0.02 + rnd() * 0.9 * Math.pow(rnd(), 2), 0.1 + rnd() * 0.15); }
  void v; return b.normalize(0.85);
});
def('glass_clink', () => { const b = new Buf(0.6); for (let i = 0; i < 6; i++) b.mix(osc(0.2, 'sine', 3000 + rnd() * 4000).env(decay(30)), rnd() * 0.4, 0.2); return b.normalize(0.4); });
def('wood_creak', () => { const b = osc(0.7, 'saw', (t) => 130 + Math.sin(t * 13) * 30); bandpass(b, 600, 4); return b.env(adsr(0.05, 0.2, 0.6, 0.2, 0.7)).normalize(0.45); });
def('wood_hit', () => { const b = thump(0.2, 220, 90, 25); b.mix(burst(0.1, 'pink', 2000, 150, 30), 0, 0.6); return b.normalize(0.65); });
def('climb', () => { const b = new Buf(0.6); b.mix(burst(0.3, 'pink', 2500, 300, 8), 0, 0.5); b.mix(thump(0.15, 120, 60, 25), 0.4, 0.6); return b.normalize(0.5); });
def('pour', () => { const b = noise(1.0, 'white'); bandpass(b, (t) => 700 + Math.sin(t * 30) * 300, 2); return b.env(adsr(0.05, 0.1, 0.7, 0.3, 1.0)).normalize(0.35); });
def('fill', () => { const b = noise(1.5, 'white'); bandpass(b, (t) => 500 + t * 900, 1.5); return b.env(adsr(0.1, 0.2, 0.8, 0.3, 1.5)).normalize(0.35); });
def('drink', () => { const b = new Buf(1.2); for (let i = 0; i < 4; i++) { const g = osc(0.12, 'sine', (t) => 220 - t * 600); g.env(decay(25)); b.mix(g, 0.15 + i * 0.25, 0.6); } return b.normalize(0.4); });
def('eat', () => { const b = new Buf(1.2); for (let i = 0; i < 7; i++) b.mix(burst(0.06, 'white', 4500, 1200, 60), 0.05 + i * 0.16 + rnd() * 0.04, 0.4 + rnd() * 0.3); return b.normalize(0.4); });
def('can_open', () => { const b = new Buf(1.0); for (let i = 0; i < 10; i++) b.mix(burst(0.05, 'white', 7000, 2500, 80), i * 0.08, 0.5); b.mix(clickS(1800, 0.02), 0, 0.6); return b.normalize(0.45); });
def('pills', () => { const b = new Buf(0.5); for (let i = 0; i < 12; i++) b.mix(clickS(4000 + rnd() * 3000, 0.005), rnd() * 0.35, 0.3); return b.normalize(0.35); });
def('bandage', () => { const b = burst(0.5, 'white', 5000, 1500, 6); return b.normalize(0.3); });
def('rip', () => { const b = noise(0.45, 'white'); bandpass(b, (t) => 2000 + t * 4000, 0.9); b.env(perc(0.01, 7)); return b.normalize(0.5); });
def('hammer', (v) => { const b = new Buf(0.3); b.mix(thump(0.2, 900 + v * 40, 350, 30), 0, 0.6); b.mix(osc(0.3, 'sine', 1900 + v * 80).env(decay(25)), 0, 0.3); b.mix(burst(0.05, 'white', 6000, 1500, 90), 0, 0.5); return b.normalize(0.65); });
def('saw', () => { const b = noise(0.5, 'white'); bandpass(b, (t) => 1500 + Math.sin(t * 25) * 600, 2); return b.env(adsr(0.02, 0.05, 0.8, 0.1, 0.5)).normalize(0.45); });
def('dig', () => { const b = new Buf(0.6); b.mix(burst(0.25, 'brown', 900, 60, 10), 0, 0.8); b.mix(burst(0.15, 'white', 4000, 800, 20), 0.05, 0.4); return b.normalize(0.5); });
def('spray', () => { const b = noise(0.8, 'white'); highpass(b, 3000); return b.env(adsr(0.02, 0.05, 0.7, 0.1, 0.8)).normalize(0.3); });
def('vend', () => { const b = new Buf(1.0); b.mix(osc(0.4, 'saw', 80).env(adsr(0.05, 0.1, 0.6, 0.1, 0.4)), 0, 0.3); b.mix(thump(0.3, 160, 60, 15), 0.5, 0.9); return b.normalize(0.6); });
def('sizzle', () => { const b = noise(1.2, 'white'); highpass(b, 2500); for (let i = 0; i < b.n; i++) if (rnd() < 0.003) b.d[i] *= 6; return b.env(adsr(0.05, 0.2, 0.6, 0.3, 1.2)).normalize(0.25); });
def('break', () => { const b = new Buf(0.6); b.mix(burst(0.15, 'white', 5000, 600, 25), 0, 0.8); b.mix(thump(0.2, 300, 80, 25), 0, 0.6); for (let i = 0; i < 5; i++) b.mix(burst(0.04, 'pink', 3000, 300, 80), 0.08 + i * 0.05, 0.3); return b.normalize(0.7); });
def('reload', () => { const b = new Buf(0.5); b.mix(clickS(1400, 0.03), 0, 0.7); b.mix(clickS(900, 0.04), 0.25, 0.8); return b.normalize(0.5); });
def('dryfire', () => clickS(2000, 0.015).normalize(0.4));
def('whoosh', () => { const b = noise(0.25, 'white'); bandpass(b, (t) => 800 + t * 3000, 1.2); return b.env(adsr(0.03, 0.05, 0.6, 0.1, 0.25)).normalize(0.3); });
def('swing', (v) => { const b = noise(0.3, 'pink'); bandpass(b, (t) => 400 + t * 2400 + v * 50, 1.5); return b.env(adsr(0.08, 0.05, 0.5, 0.12, 0.3)).normalize(0.35); });
def('shove', () => { const b = burst(0.15, 'pink', 1500, 100, 20); b.mix(thump(0.12, 150, 70, 30), 0, 0.5); return b.normalize(0.5); });
def('hit_blunt', (v) => { const b = new Buf(0.35); b.mix(thump(0.25, 130 + v * 10, 50, 18), 0, 1); b.mix(burst(0.1, 'brown', 1500, 50, 30), 0, 0.7); b.mix(burst(0.08, 'white', 2500, 500, 50), 0, 0.3); return b.drive(2).normalize(0.85); });
def('hit_blade', (v) => { const b = new Buf(0.3); const sl = noise(0.15, 'white'); bandpass(sl, 3500 + v * 200, 2); sl.env(perc(0.005, 25)); b.mix(sl, 0, 0.8); b.mix(burst(0.12, 'brown', 900, 60, 30), 0.02, 0.6); return b.normalize(0.75); });
def('hit_crit', () => { const b = new Buf(0.5); b.mix(thump(0.35, 90, 35, 10), 0, 1); b.mix(burst(0.2, 'brown', 1200, 40, 15), 0, 0.8); return b.drive(3).normalize(0.9); });
def('gun_pistol', () => { const b = new Buf(1.6); b.mix(burst(0.04, 'white', 12000, 300, 40), 0, 1); b.mix(thump(0.3, 160, 45, 9), 0, 1); const tail = noise(1.5, 'brown'); lowpass(tail, 700); tail.env(decay(3.2)); b.mix(tail, 0.02, 0.6); return b.drive(4).normalize(0.95); });
def('shout', (v) => { const b = voice(0.6, (t) => (t < 0.24 ? 205 + t * 90 : 196 - (t - 0.24) * 140) + v * 18, [[650, 1], [1750, 0.55], [2600, 0.2]], 0.12, 'saw'); b.env(adsr(0.02, 0.08, 0.85, 0.18, 0.6)); return b.drive(1.4).normalize(0.7); });
def('hurt_player', (v) => { const b = voice(0.45, (t) => 220 - t * 140 + v * 12, [[700, 1], [1200, 0.6], [2600, 0.25]], 0.25); b.env(perc(0.01, 6)); return b.normalize(0.55); });
def('heartbeat', () => { const b = new Buf(0.8); b.mix(thump(0.18, 70, 40, 18), 0, 1); b.mix(thump(0.16, 62, 38, 20), 0.22, 0.7); lowpass(b, 300); return b.normalize(0.8); });
def('breath', () => { const b = noise(1.4, 'pink'); bandpass(b, 900, 0.8); return b.env((t) => Math.pow(Math.sin(Math.min(1, t / 1.4) * Math.PI), 2) * 0.8).normalize(0.35); });
def('stomach', () => { const b = osc(1.2, 'saw', (t) => 70 + Math.sin(t * 7) * 30 + Math.sin(t * 23) * 10); lowpass(b, 350); return b.env(adsr(0.1, 0.3, 0.6, 0.4, 1.2)).normalize(0.35); });
def('cough', () => { const b = new Buf(0.8); for (let i = 0; i < 2; i++) { const c = noise(0.25, 'white'); bandpass(c, 900, 0.9); c.env(perc(0.01, 12)); b.mix(c, i * 0.3, 0.8); } return b.normalize(0.5); });
def('teeth', () => { const b = new Buf(1.0); for (let i = 0; i < 18; i++) b.mix(clickS(2800 + rnd() * 900, 0.004), i * 0.05 + rnd() * 0.01, 0.3); return b.normalize(0.3); });

// ---------------------------------------------------------------- creatures
def('hound_huff', (v) => { const b = burst(0.35, 'pink', 1400, 200, 8); bandpass(b, 600 + v * 40, 1); return b.normalize(0.4); });
def('hound_laugh', (v) => {
  // a hacking, wet "ha... ha-ha" that is almost human
  const b = new Buf(1.5);
  const n = 4 + (v % 3);
  for (let i = 0; i < n; i++) {
    const h = voice(0.16, (t) => 300 + v * 15 - t * 200 + rnd() * 20, [[780, 1], [1250, 0.7], [2800, 0.3]], 0.5, 'pulse');
    h.env(perc(0.01, 14));
    b.mix(h, i * (0.16 + rnd() * 0.08), 0.8 - i * 0.08);
  }
  return b.drive(1.6).normalize(0.7);
});
def('hound_snarl', (v) => { const b = voice(0.7, (t) => 90 + Math.sin(t * 60) * 15 + v * 5, [[450, 1], [900, 0.6], [2200, 0.2]], 0.5, 'saw'); b.env(adsr(0.03, 0.1, 0.8, 0.2, 0.7)); return b.drive(2.5).normalize(0.7); });
def('hound_yelp', (v) => { const b = voice(0.3, (t) => 900 - t * 1500 + v * 30, [[1200, 1], [2600, 0.5]], 0.15, 'saw'); b.env(perc(0.01, 9)); return b.normalize(0.6); });
def('hound_death', () => { const b = voice(1.2, (t) => 400 - t * 300, [[800, 1], [1300, 0.6]], 0.4, 'saw'); b.env(adsr(0.02, 0.3, 0.5, 0.6, 1.2)); return b.normalize(0.6); });
def('dog_whine', (v) => { const b = voice(0.9, (t) => 700 + Math.sin(t * 5) * 120 + v * 20, [[900, 1], [2400, 0.4]], 0.1, 'tri'); b.env(adsr(0.1, 0.3, 0.6, 0.3, 0.9)); return b.normalize(0.4); });
def('dog_bark', (v) => { const b = voice(0.22, (t) => 380 - t * 500 + v * 10, [[600, 1], [1400, 0.6]], 0.3, 'saw'); b.env(perc(0.01, 14)); return b.drive(2).normalize(0.6); });
def('dog_growl', () => { const b = voice(1.0, (t) => 85 + Math.sin(t * 45) * 10, [[380, 1], [800, 0.5]], 0.45, 'saw'); b.env(adsr(0.1, 0.2, 0.8, 0.3, 1.0)); return b.normalize(0.55); });
def('doe_click', () => { const b = new Buf(0.6); for (let i = 0; i < 4; i++) b.mix(clickS(2400 + rnd() * 600, 0.01), i * 0.1, 0.6); return b.normalize(0.4); });
def('doe_shriek', (v) => { const b = voice(0.9, (t) => 1400 + Math.sin(t * 30) * 200 - t * 300 + v * 40, [[1800, 1], [3200, 0.6]], 0.2, 'saw'); b.env(adsr(0.02, 0.2, 0.6, 0.4, 0.9)); return b.drive(1.5).normalize(0.7); });
def('doe_death', () => { const b = voice(1.4, (t) => 900 - t * 500, [[1400, 1], [2800, 0.4]], 0.3, 'saw'); b.env(adsr(0.02, 0.5, 0.4, 0.6, 1.4)); return b.normalize(0.6); });
def('creature_hurt', (v) => { const b = voice(0.4, (t) => 300 - t * 200 + v * 20, [[700, 1], [1600, 0.5]], 0.4, 'saw'); b.env(perc(0.01, 8)); return b.normalize(0.6); });
def('creature_death', () => { const b = voice(1.3, (t) => 250 - t * 150, [[500, 1], [1100, 0.6]], 0.5, 'saw'); b.env(adsr(0.02, 0.4, 0.4, 0.6, 1.3)); return b.normalize(0.6); });
def('moth_flutter', () => { const b = noise(0.8, 'pink'); bandpass(b, 400, 1); for (let i = 0; i < b.n; i++) b.d[i] *= 0.5 + 0.5 * Math.sin(i / SR * 2 * Math.PI * 38); return b.env(adsr(0.1, 0.1, 0.8, 0.2, 0.8)).normalize(0.35); });
def('bird_wrong', (v) => { const b = new Buf(0.8); for (let i = 0; i < 3; i++) { const c = osc(0.12, 'sine', (t) => 2500 + Math.sin(t * 90) * 800 + v * 60); c.env(perc(0.005, 25)); b.mix(c, i * 0.2 + (i === 2 ? 0.17 : 0), 0.6); } return b.crush(6, 2).normalize(0.45); });
def('bird_flap', () => { const b = new Buf(0.8); for (let i = 0; i < 7; i++) b.mix(burst(0.06, 'pink', 1500, 200, 40), i * 0.09, 0.5); return b.normalize(0.45); });
def('whisper', (v) => { const b = noise(1.4, 'white'); bandpass(b, (t) => 1800 + Math.sin(t * 11 + v) * 900, 3); return b.env((t) => Math.max(0, Math.sin(t * Math.PI / 1.4)) * (0.5 + 0.5 * Math.sin(t * 17))).normalize(0.35); });
def('scrape_wall', () => { const b = noise(1.2, 'brown'); bandpass(b, (t) => 300 + Math.sin(t * 6) * 120, 2); return b.env(adsr(0.2, 0.2, 0.7, 0.4, 1.2)).normalize(0.45); });
def('vent_clank', (v) => { const b = new Buf(1.2); for (let i = 0; i < 4; i++) { const k = osc(0.3, 'sine', 420 + rnd() * 300 + v * 20).env(decay(14)); comb(k, 0.0031, 0.7, 0.4); b.mix(k, i * 0.22 + rnd() * 0.1, 0.5); } return b.normalize(0.55); });
def('carpet_rustle', () => { const b = noise(1.0, 'pink'); bandpass(b, 700, 0.8); return b.env((t) => 0.5 + 0.5 * Math.sin(t * 14)).fade(0.1, 0.2).normalize(0.35); });
def('leviathan_rumble', () => { const b = osc(4.0, 'saw', (t) => 32 + Math.sin(t * 0.8) * 6); lowpass(b, 160); const n = noise(4.0, 'brown'); lowpass(n, 120); b.mix(n, 0, 0.8); return b.env(adsr(1.0, 0.5, 0.8, 1.5, 4.0)).normalize(0.8); });
def('static_burst', () => { const b = noise(0.5, 'white'); b.crush(4, 3); return b.env(perc(0.01, 6)).normalize(0.4); });
def('chair_squeak', (v) => { const b = osc(0.35, 'saw', (t) => 650 + Math.sin(t * 20) * 80 + v * 30); bandpass(b, 1100, 5); return b.env(adsr(0.02, 0.1, 0.6, 0.1, 0.35)).normalize(0.4); });
def('sofa_groan', () => { const b = voice(1.6, (t) => 70 + Math.sin(t * 3) * 10, [[300, 1], [700, 0.6]], 0.5, 'saw'); b.env(adsr(0.3, 0.3, 0.7, 0.5, 1.6)); return b.normalize(0.6); });
def('plush_squeak', () => { const b = osc(0.25, 'sine', (t) => 900 + t * 700); return b.env(perc(0.02, 10)).normalize(0.35); });
def('custodian_tone', (v) => { const b = new Buf(0.9); [880, 660, 990].forEach((f, i) => b.mix(osc(0.18, 'square', f + v * 5).env(decay(9)), i * 0.22, 0.35)); lowpass(b, 3000); return b.normalize(0.4); });
def('hollow_moan', (v) => { const b = voice(1.8, (t) => 130 + Math.sin(t * 2.3) * 15 + v * 4, [[520, 1], [880, 0.7], [2500, 0.2]], 0.35, 'saw'); b.env(adsr(0.3, 0.4, 0.6, 0.6, 1.8)); return b.normalize(0.55); });
def('mimic_call', (v) => {
  // a voice-like "hey... over here" made of vowel formants
  const vowels: [number, number][][] = [[[700, 1], [1200, 0.7]], [[400, 1], [2100, 0.6]], [[300, 1], [870, 0.6]], [[640, 1], [1190, 0.6]]];
  const b = new Buf(1.6);
  for (let i = 0; i < 3; i++) { const w = voice(0.28, (t) => 175 + v * 8 - t * 30 + rnd() * 6, vowels[(i + v) % vowels.length], 0.18, 'saw'); w.env(adsr(0.03, 0.05, 0.8, 0.08, 0.28)); b.mix(w, 0.1 + i * 0.36, 0.7); }
  return b.normalize(0.55);
});
def('lifeguard_splash', () => { const b = new Buf(1.2); b.mix(burst(0.6, 'white', 3000, 300, 5), 0, 0.8); b.mix(thump(0.4, 90, 40, 8), 0, 0.6); return b.normalize(0.7); });
def('sentinel_hum', () => { const b = osc(2.5, 'sine', (t) => 47 + Math.sin(t * 0.5) * 2); b.mix(osc(2.5, 'sine', 94.3), 0, 0.3); return b.env(adsr(0.6, 0.2, 0.8, 0.8, 2.5)).normalize(0.5); });
def('music_box_broken', (v) => { const notes = [523, 659, 784, 698, 587, 523]; const b = new Buf(2.6); notes.forEach((f, i) => b.mix(osc(0.6, 'sine', f * (1 - rnd() * 0.02) * (v % 2 ? 0.94 : 1)).env(decay(5)), i * 0.38 + rnd() * 0.08, 0.4)); return b.normalize(0.4); });
def('lamp_chirp', (v) => { const b = osc(0.3, 'sine', (t) => 1500 + Math.sin(t * 40) * 300 + v * 50); b.env(perc(0.01, 9)); b.mix(osc(0.4, 'sine', 120).env(decay(4)), 0, 0.2); return b.normalize(0.4); });
def('thud_distant', () => { const b = thump(0.8, 80, 30, 4); lowpass(b, 200); return b.normalize(0.6); });
def('swivel_skitter', () => { const b = new Buf(0.8); for (let i = 0; i < 14; i++) b.mix(clickS(1800 + rnd() * 1500, 0.008), i * 0.05 + rnd() * 0.02, 0.4); return b.normalize(0.45); });

// ---------------------------------------------------------------- loops (seamless-ish, faded edges)
def('hum_fluoro', () => {
  const len = 4;
  const b = new Buf(len);
  b.mix(osc(len, 'sine', 120), 0, 0.5);
  b.mix(osc(len, 'sine', 240), 0, 0.18);
  b.mix(osc(len, 'saw', 60), 0, 0.06);
  const buzz = noise(len, 'white'); bandpass(buzz, 3600, 2); for (let i = 0; i < buzz.n; i++) buzz.d[i] *= 0.6 + 0.4 * Math.sin(i / SR * Math.PI * 2 * 120);
  b.mix(buzz, 0, 0.08);
  return b.normalize(0.5);
});
def('rain', () => { const b = noise(6, 'pink'); highpass(b, 400); for (let i = 0; i < b.n; i++) if (rnd() < 0.0008) b.d[i] += (rnd() - 0.5) * 3; lowpass(b, 6000); return b.normalize(0.5); });
def('wind', () => { const b = noise(8, 'pink'); bandpass(b, (t) => 350 + Math.sin(t * 0.7) * 150 + Math.sin(t * 2.1) * 60, 0.7); return b.env((t) => 0.6 + 0.4 * Math.sin(t * 0.785)).normalize(0.5); });
def('drip_room', () => { const b = new Buf(6); for (let i = 0; i < 9; i++) { const d = osc(0.15, 'sine', (t) => 1500 + rnd() * 900 - t * 2000).env(decay(30)); b.mix(d, rnd() * 5.6, 0.3 + rnd() * 0.3); } return b; });
def('server_hum', () => { const b = noise(4, 'pink'); bandpass(b, 900, 0.5); b.mix(osc(4, 'sine', 100), 0, 0.2); b.mix(osc(4, 'sine', 3200), 0, 0.02); return b.normalize(0.45); });
def('machine_hum', () => { const b = osc(4, 'saw', 50); lowpass(b, 300); const n = noise(4, 'brown'); b.mix(n, 0, 0.5); return b.normalize(0.45); });
def('fire_crackle', () => { const b = noise(4, 'brown'); lowpass(b, 900); for (let i = 0; i < 70; i++) b.mix(burst(0.02, 'white', 6000, 1500, 200), rnd() * 3.9, 0.5 + rnd()); return b.normalize(0.5); });
def('water_lap', () => { const b = noise(6, 'pink'); bandpass(b, (t) => 500 + Math.sin(t * 1.3) * 200, 1); return b.env((t) => 0.5 + 0.5 * Math.sin(t * 2.1)).normalize(0.4); });
def('static', () => { const b = noise(3, 'white'); bandpass(b, 2400, 0.5); b.crush(6, 2); return b.normalize(0.4); });
def('mall_air', () => { const b = noise(6, 'pink'); lowpass(b, 500); b.mix(osc(6, 'sine', 58), 0, 0.1); return b.normalize(0.4); });
def('tunnel_air', () => { const b = noise(6, 'brown'); lowpass(b, 300); b.mix(osc(6, 'sine', 41), 0, 0.15); return b.normalize(0.5); });

// ---------------------------------------------------------------- handling / furniture
def('cloth', (v) => { const len = 0.32 + (v % 3) * 0.06; const b = noise(len, 'pink'); bandpass(b, 1800 + v * 260, 0.7); b.env((t) => Math.sin(Math.min(1, t / len) * Math.PI) * (0.55 + 0.45 * Math.sin(t * 70 + v * 2))); return b.normalize(0.32); });
def('crinkle', () => { const b = new Buf(0.4); for (let i = 0; i < 36; i++) b.mix(burst(0.006, 'white', 9000, 2500, 600), rnd() * 0.38, 0.2 + rnd() * 0.5); return b.normalize(0.3); });
def('metal_clank', (v) => { const b = new Buf(0.7); const f0 = 380 + v * 70; [1, 2.76, 5.4, 8.93].forEach((r, i) => b.mix(osc(0.7, 'sine', f0 * r).env(decay(7 + i * 5)), 0, 0.5 / (i + 1))); b.mix(burst(0.02, 'white', 8000, 1000, 200), 0, 0.4); return b.normalize(0.42); });
def('plastic_tap', (v) => { const b = burst(0.06, 'white', 3200 + v * 400, 500, 90); b.mix(osc(0.05, 'sine', 850 + v * 120).env(decay(80)), 0, 0.3); return b.normalize(0.32); });
def('thud_soft', (v) => { const b = thump(0.25, 140 + v * 15, 55, 16); b.mix(burst(0.08, 'brown', 600, 40, 40), 0, 0.6); return b.normalize(0.45); });
def('drawer_wood', (v) => { const b = noise(0.42, 'pink'); bandpass(b, (t) => 600 + t * 900 + v * 40, 1.6); b.env((t) => (t < 0.32 ? (0.55 + 0.45 * Math.sin(t * 95)) * Math.min(1, t * 25) : 0)); b.mix(thump(0.12, 170, 70, 30), 0.31, 0.9); return b.normalize(0.4); });
def('drawer_metal', (v) => { const b = noise(0.42, 'white'); bandpass(b, (t) => 1900 + t * 1200 + v * 90, 4); b.env((t) => (t < 0.3 ? 0.4 * Math.min(1, t * 25) : 0)); const k = new Buf(0.4); [1, 2.4, 4.1].forEach((r, i) => k.mix(osc(0.4, 'sine', (520 + v * 30) * r).env(decay(10 + i * 6)), 0, 0.5 / (i + 1))); b.mix(k, 0.29, 0.9); return b.normalize(0.42); });
def('cabinet', (v) => { const b = osc(0.35, 'saw', (t) => 300 + Math.sin(t * 30) * 60 + v * 20); bandpass(b, 1200, 3); b.env((t) => Math.max(0, Math.sin(t * Math.PI / 0.35)) * 0.4); b.mix(thump(0.1, 200, 90, 40), 0.3, 0.7); return b.normalize(0.38); });
def('fridge_open', () => { const b = new Buf(0.6); const s = noise(0.25, 'pink'); bandpass(s, 600, 1.2); s.env(perc(0.005, 14)); b.mix(s, 0, 0.8); b.mix(clickS(1600, 0.01), 0.02, 0.3); const hum = osc(0.5, 'sine', 120); hum.env(adsr(0.1, 0.1, 0.6, 0.2, 0.5)); b.mix(hum, 0.08, 0.15); return b.normalize(0.4); });
def('rummage', () => { const b = new Buf(0.9); for (let i = 0; i < 7; i++) { const c = noise(0.12, 'pink'); bandpass(c, 1500 + rnd() * 2000, 1); c.env(perc(0.01, 18)); b.mix(c, rnd() * 0.8, 0.3 + rnd() * 0.5); } return b.normalize(0.32); });
def('craft', () => { const b = new Buf(1.0); for (let i = 0; i < 5; i++) b.mix(rnd() < 0.5 ? clickS(1100 + rnd() * 2200, 0.012) : burst(0.05, 'pink', 3000, 300, 70), rnd() * 0.9, 0.3 + rnd() * 0.4); return b.normalize(0.32); });
def('equip', (v) => { const b = noise(0.18, 'pink'); bandpass(b, 2400 + v * 300, 1.2); b.env(perc(0.01, 20)); b.mix(clickS(2200 + v * 200, 0.01), 0.1, 0.3); return b.normalize(0.3); });
def('fluoro_tick', (v) => { const b = clickS(2400 + v * 300, 0.006); b.mix(osc(0.12, 'sine', 120).env(decay(30)), 0, 0.5); const z = noise(0.06, 'white'); bandpass(z, 4200, 3); z.env(decay(60)); b.mix(z, 0, 0.6); return b.normalize(0.3); });

// ---------------------------------------------------------------- world events (distant, unexplained)
def('power_on', () => { const b = new Buf(2.4); b.mix(thump(0.3, 120, 40, 10), 0, 1); b.mix(burst(0.05, 'white', 5000, 600, 80), 0, 0.5); const h = osc(2.2, 'saw', (t) => 30 + Math.min(1, t / 1.6) * 30); lowpass(h, 400); h.env((t) => Math.min(1, t / 1.2) * Math.exp(-Math.max(0, t - 1.4) * 3)); b.mix(h, 0.1, 0.5); return b.normalize(0.6); });
def('power_off', () => { const b = new Buf(2.6); b.mix(thump(0.3, 110, 35, 10), 0, 1); const h = osc(2.4, 'saw', (t) => 60 * Math.exp(-t * 0.9) + 8); lowpass(h, 300); h.env((t) => Math.exp(-t * 1.4)); b.mix(h, 0, 0.7); return b.normalize(0.6); });
def('deja', () => { const b = noise(2.2, 'pink'); bandpass(b, (t) => 400 + t * 900, 3); b.mix(osc(2.2, 'sine', (t) => 120 * (1 + t * 0.05)), 0, 0.25); b.env((t) => Math.pow(Math.min(1, t / 2.0), 3)); b.reverse(); return b.normalize(0.45); });
def('phone_ring', () => { const b = new Buf(1.7); for (let i = 0; i < 26; i++) { const s = new Buf(0.2); [1, 2.1, 3.3].forEach((r, j) => s.mix(osc(0.2, 'sine', 1150 * r * (i % 2 ? 1.06 : 1)).env(decay(14 + j * 8)), 0, 0.4 / (j + 1))); b.mix(s, i * 0.05, 0.7); } return b.normalize(0.4); });
def('elevator_ding', () => { const b = new Buf(2.4); ([[659, 0], [523, 0.38]] as const).forEach(([f, at]) => { const n = new Buf(1.9); [1, 2.0, 3.01, 4.2].forEach((r, j) => n.mix(osc(1.9, 'sine', f * r).env(decay(2.5 + j * 2)), 0, 0.5 / (j + 1))); b.mix(n, at, 0.6); }); return b.normalize(0.45); });
def('pa_chime', () => { const b = new Buf(3.2); ([[523, 0], [659, 0.45], [784, 0.9], [1047, 1.35]] as const).forEach(([f, at]) => { const n = new Buf(1.7); [1, 2, 3].forEach((r, j) => n.mix(osc(1.7, 'sine', f * r).env(decay(2.2 + j * 2)), 0, 0.5 / (j + 1))); b.mix(n, at, 0.5); }); lowpass(b, 3000); return b.normalize(0.4); });
def('school_bell', () => { const b = new Buf(2.6); for (let i = 0; i < 46; i++) { const s = new Buf(0.15); [1, 2.4, 4.6].forEach((r, j) => s.mix(osc(0.15, 'sine', 980 * r).env(decay(20 + j * 10)), 0, 0.4 / (j + 1))); b.mix(s, i * 0.045, 0.6); } b.env(adsr(0.02, 0.1, 0.9, 0.3, 2.6)); return b.normalize(0.4); });
def('door_far', (v) => { const b = thump(0.5, 110 + v * 10, 45, 7); b.mix(burst(0.1, 'brown', 400, 30, 20), 0, 0.6); lowpass(b, 400); return b.normalize(0.5); });
def('steps_far', (v) => { const b = new Buf(2.6); const n = 6 + (v % 3); const gap = 0.3 - (v % 2) * 0.09; for (let i = 0; i < n; i++) b.mix(burst(0.08, 'pink', 700, 60, 50), i * gap + rnd() * 0.02, 0.5 + i * 0.05); lowpass(b, 600); return b.normalize(0.4); });
def('car_alarm_far', () => { const b = osc(4, 'square', (t) => 900 + 500 * (Math.floor(t * 4) % 2)); lowpass(b, 1400); b.env(adsr(0.05, 0.1, 0.8, 0.5, 4)); return b.normalize(0.3); });
def('beep', (v) => { const b = osc(0.12, 'square', 1800 + v * 200); lowpass(b, 3000); b.env(adsr(0.002, 0.02, 0.8, 0.02, 0.12)); return b.normalize(0.3); });
def('drip', (v) => { const b = osc(0.18, 'sine', (t) => 1400 + v * 160 - t * 2400); b.env(decay(28)); return b.normalize(0.35); });
def('birds_dream', () => { const b = new Buf(3); for (let k = 0; k < 4; k++) { const f0 = 2600 + rnd() * 1800, wob = 50 + rnd() * 30; const ch = osc(0.18, 'sine', (t) => f0 + Math.sin(t * wob) * 400 - t * 1500); ch.env(perc(0.01, 14)); b.mix(ch, 0.2 + k * 0.32 + rnd() * 0.1, 0.5); } return b.normalize(0.3); });
def('sting_low', () => { const len = 5; const b = noise(len, 'brown'); lowpass(b, (t) => 120 + t * 160); for (const f of [41.2, 43.65, 61.7]) b.mix(osc(len, 'saw', f), 0, 0.12); lowpass(b, 500); b.env((t) => Math.pow(Math.min(1, t / 3.5), 2) * (t > 4 ? Math.max(0, 1 - (t - 4)) : 1)); return b.normalize(0.5); });
def('death_tone', () => { const len = 7; const b = new Buf(len); for (const f of [55, 82.4, 110.3, 164.8]) b.mix(osc(len, 'sine', (t) => f * (1 - t * 0.012)), 0, 0.25); const n = noise(len, 'pink'); lowpass(n, 300); b.mix(n, 0, 0.3); b.env(adsr(0.5, 1, 0.8, 3, len)); return b.normalize(0.5); });
def('wake_gasp', () => { const b = noise(0.9, 'pink'); bandpass(b, (t) => 700 + t * 900, 1.2); b.env((t) => Math.pow(Math.sin(Math.min(1, t / 0.9) * Math.PI), 0.6)); return b.normalize(0.4); });

// ---------------------------------------------------------------- appliance / world loops
def('fridge_hum', () => { const len = 4; const b = osc(len, 'sine', 60); b.mix(osc(len, 'sine', 180), 0, 0.3); const n = noise(len, 'pink'); bandpass(n, 300, 1); b.mix(n, 0, 0.4); return b.normalize(0.35); });
def('generator_loop', () => { const len = 3; const b = new Buf(len); for (let i = 0; i < len * 30; i++) b.mix(burst(0.04, 'brown', 500, 30, 50), i / 30, 0.8); b.mix(osc(len, 'saw', 30), 0, 0.3); lowpass(b, 900); return b.normalize(0.5); });
def('computer_hum', () => { const len = 4; const b = noise(len, 'pink'); bandpass(b, 1800, 0.8); b.gain(0.4); b.mix(osc(len, 'sine', 7800), 0, 0.03); for (let i = 0; i < 6; i++) b.mix(clickS(3000 + rnd() * 1500, 0.004), rnd() * len, 0.08); return b.normalize(0.25); });
def('tv_hum', () => { const len = 3; const b = noise(len, 'white'); bandpass(b, 2400, 0.6); b.crush(6, 2); b.gain(0.5); b.mix(osc(len, 'sine', 59.9), 0, 0.4); return b.normalize(0.3); });
def('beep_loop', () => { const b = new Buf(2); b.mix(osc(0.1, 'sine', 1320).env(adsr(0.004, 0.02, 0.8, 0.03, 0.1)), 0.1, 0.5); return b; });
def('crickets', () => { const len = 4; const b = new Buf(len); for (let k = 0; k < 14; k++) { const f = 4200 + rnd() * 900, at = rnd() * (len - 0.4), rate = 28 + rnd() * 8; const c = osc(0.3, 'sine', f); c.env((t) => (Math.sin(t * Math.PI * 2 * rate) > 0.3 ? 1 : 0) * Math.sin(Math.min(1, t / 0.3) * Math.PI)); b.mix(c, at, 0.2 + rnd() * 0.3); } return b.normalize(0.25); });
def('playground_far', () => { const len = 8; const b = new Buf(len); for (let k = 0; k < 10; k++) { const p0 = 260 + rnd() * 200, rate = 5 + rnd() * 4, l = 0.5 + rnd() * 1.2; const vv = voice(l, (t) => p0 * (1 + Math.sin(t * rate) * 0.12 + t * 0.2), [[900 + rnd() * 300, 1], [1800 + rnd() * 500, 0.6], [3000, 0.2]], 0.3); vv.env((t) => Math.max(0, Math.sin(t * Math.PI / l))); b.mix(vv, rnd() * (len - l), 0.2 + rnd() * 0.3); } const sw = osc(len, 'tri', (t) => 600 + Math.sin(t * 2.2) * 200); bandpass(sw, 700, 4); sw.env((t) => Math.max(0, Math.sin(t * 2.2)) * 0.2); b.mix(sw, 0, 0.3); lowpass(b, 1600); return b.normalize(0.3); });
def('murmur', () => { const len = 6; const b = new Buf(len); for (let k = 0; k < 9; k++) { const p0 = 110 + rnd() * 120, rate = 4 + rnd() * 3, l = 1.4 + rnd() * 1.4, ph0 = rnd() * 6; const vv = voice(l, (t) => p0 * (1 + Math.sin(t * rate) * 0.08), [[500 + rnd() * 300, 1], [1100 + rnd() * 600, 0.6], [2500, 0.2]], 0.35); vv.env((t) => Math.max(0, Math.sin(t * Math.PI / l)) * (0.5 + 0.5 * Math.sin(t * 9 + ph0))); b.mix(vv, rnd() * (len - l), 0.3 + rnd() * 0.3); } lowpass(b, 1400); return b.normalize(0.35); });
def('tinnitus', () => { const len = 3; const b = osc(len, 'sine', 6200); b.mix(osc(len, 'sine', 6230), 0, 0.5); return b.normalize(0.25); });
def('crt', () => { const len = 2; const b = osc(len, 'sine', 50); b.mix(osc(len, 'sine', 100), 0, 0.3); const n = noise(len, 'white'); bandpass(n, 7800, 8); b.mix(n, 0, 0.15); return b.normalize(0.2); });
def('beacon', (v) => { const len = 3; const b = new Buf(len); const pat = [1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0].map((x, i) => (i + v) % 3 === 0 ? 1 - x : x); pat.forEach((on, i) => { if (on) b.mix(osc(0.16, 'sine', 1000).env(adsr(0.005, 0.02, 0.9, 0.02, 0.16)), i * 0.2, 0.6); }); return b; });
def('numbers', (v) => { const len = 6; const b = new Buf(len); for (let k = 0; k < 7; k++) { const vow = [[730, 1090], [270, 2290], [570, 840], [300, 870], [530, 1840]][(k * 3 + v) % 5]; const l = 0.28 + rnd() * 0.12, p0 = 105 + rnd() * 10; const s = voice(l, (t) => p0 - t * 30, [[vow[0], 1], [vow[1], 0.7], [2600, 0.2]], 0.25); s.env(adsr(0.02, 0.05, 0.8, 0.08, l)); b.mix(s, 0.3 + k * 0.72, 0.6); } bandpass(b, 1200, 0.5); b.crush(7, 2); return b.normalize(0.4); });
def('drone_bed', () => { const len = 8; const b = new Buf(len); for (const [f, g] of [[55, 0.4], [82.5, 0.25], [110.2, 0.15], [164.6, 0.06]] as const) b.mix(osc(len, 'saw', (t) => f * (1 + Math.sin(t * 0.785 + f) * 0.002)), 0, g); lowpass(b, 380); return b.normalize(0.35); });

// ---------------------------------------------------------------- music instruments (variant = MIDI note)
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
def('mbox', (v) => { const f = mtof(v || 72), len = 2.2; const b = new Buf(len); b.mix(osc(len, 'sine', f).env(perc(0.002, 2.2)), 0, 0.7); b.mix(osc(len, 'sine', f * 2.01).env(decay(5)), 0, 0.12); b.mix(osc(0.5, 'sine', f * 5.43).env(decay(14)), 0, 0.15); b.mix(clickS(f * 4, 0.004), 0, 0.15); return b.normalize(0.45); });
def('epiano', (v) => { const f = mtof(v || 60), len = 2.6; const b = new Buf(len); for (let i = 0; i < b.n; i++) { const t = i / SR, I = 1.6 * Math.exp(-t * 3); b.d[i] = Math.sin(2 * Math.PI * f * t + I * Math.sin(2 * Math.PI * f * t)) * Math.exp(-t * 1.3); } b.mix(osc(0.4, 'sine', f * 7).env(decay(18)), 0, 0.06); return b.fade(0.004, 0.2).normalize(0.4); });
def('piano', (v) => { const f = mtof(v || 60), len = 2.8; const b = new Buf(len); for (let h = 1; h <= 7; h++) { const fh = f * h * Math.sqrt(1 + 0.0004 * h * h); if (fh > 9000) break; b.mix(osc(len, 'sine', fh).env(perc(0.003, 1.2 + h * 0.7)), 0, 0.6 / Math.pow(h, 1.1)); } b.mix(burst(0.03, 'pink', 3000, 200, 90), 0, 0.15); return b.normalize(0.45); });
def('synpad', (v) => { const f = mtof(v || 48), len = 5; const b = new Buf(len); for (const d of [-0.006, 0, 0.007]) b.mix(osc(len, 'saw', f * (1 + d)), 0, 0.3); lowpass(b, (t) => 500 + Math.sin(t * 0.9) * 200); b.env(adsr(1.6, 0.6, 0.75, 2.0, len)); return b.normalize(0.3); });
def('bass_soft', (v) => { const f = mtof(v || 36), len = 1.4; const b = osc(len, 'sine', f); b.mix(osc(len, 'tri', f * 2), 0, 0.15); b.env(perc(0.01, 2.2)); return b.normalize(0.45); });
def('choir', (v) => { const f = mtof(v || 60), len = 5; const b = voice(len, (t) => f * (1 + Math.sin(t * 5.5) * 0.004), [[700, 1], [1100, 0.5], [2600, 0.12]], 0.15); b.env(adsr(1.4, 0.5, 0.8, 2, len)); return b.normalize(0.3); });

const cache = new Map<string, Buf>();
export function hasRecipe(k: string) { return !!R[k]; }
export function synth(key: string, v = 0): Buf | null {
  const ck = key + ':' + v;
  let b = cache.get(ck);
  if (b) return b;
  const f = R[key];
  if (!f) return null;
  setSeed(hashKey(key) + v * 7919);
  try { b = f(v).fade(0.001, 0.02); } catch (e) { console.error('synth', key, e); return null; }
  cache.set(ck, b);
  return b;
}
function hashKey(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

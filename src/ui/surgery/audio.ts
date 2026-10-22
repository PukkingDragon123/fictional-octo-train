// Sound for the operating table: plays the cyber recipes (src/audio/sounds_cyber.ts)
// and this theatre's own (straps, body thuds, turret clunks, relays, keys,
// rockers, the lever's ratchet, bone) through the game's AudioContext when one
// exists, or a private one in the menus. Buffers are synthesised once and
// cached. Loops (servo whine, drill, saw, torch, room hum) are seamless voices
// whose volume and pitch follow the machines frame by frame (csfxVoice).
import { G } from '../../game/G';
import { synth, defSound, kit } from '../../audio/sounds';
import { SR, Buf, noise, osc, lowpass, highpass, bandpass, decay, adsr, rnd, setSeed } from '../../audio/synth';
import '../../audio/sounds_cyber';

let own: AudioContext | null = null;
const cache = new Map<string, AudioBuffer>();
function ctx(): AudioContext | null {
  const gc = (G as any)?.audio?.ctx as AudioContext | undefined;
  if (gc) return gc;
  if (!own) {
    try { const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext; own = AC ? new AC() : null; } catch { own = null; }
  }
  if (own && own.state === 'suspended') own.resume().catch(() => { /* needs a gesture */ });
  return own;
}
/** call from a user gesture so a private context can start */
export function audioKick() { ctx(); }
function buffer(c: AudioContext, key: string, v: number): AudioBuffer | null {
  const ck = key + ':' + v;
  let b = cache.get(ck);
  if (!b) {
    const s = synth(key, v);
    if (!s) return null;
    b = c.createBuffer(1, s.n, SR);
    b.copyToChannel(s.d as Float32Array<ArrayBuffer>, 0);
    cache.set(ck, b);
  }
  return b;
}

/** one-shot */
export function csfx(key: string, vol = 0.7, rate = 1) {
  const c = ctx(); if (!c) return null;
  const b = buffer(c, key, Math.floor(Math.random() * 3));
  if (!b) return null;
  const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
  const g = c.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(c.destination);
  src.start();
  src.onended = () => { src.disconnect(); g.disconnect(); };
  return src;
}
/** a looping sound until the returned stop() */
export function csfxLoop(key: string, vol = 0.7): () => void {
  const v = csfxVoice(key as LoopName);
  if (v.ok) { v.set(vol, 1); return v.stop; }
  const c = ctx(); if (!c) return () => {};
  const b = buffer(c, key, 0);
  if (!b) return () => {};
  const src = c.createBufferSource(); src.buffer = b; src.loop = true;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(c.destination);
  src.start();
  return () => { try { g.gain.setTargetAtTime(0, c.currentTime, 0.05); src.stop(c.currentTime + 0.2); } catch { /* stopped */ } };
}

// ------------------------------------------------------------------ one-shots of this theatre
const { thump, burst, clickS } = kit;
defSound('sg_strap', (v) => {
  setSeed(12000 + v);
  const b = new Buf(0.35);
  b.mix(burst(0.05, 'white', 7000, 1500, 110), 0, 0.7);
  b.mix(thump(0.12, 210, 80, 35), 0, 0.8);
  for (const f of [1900, 2700, 4100]) b.mix(osc(0.18, 'sine', f * (0.97 + rnd() * 0.06)).env(decay(40)), 0.045, 0.16);
  b.mix(burst(0.02, 'white', 9000, 3000, 300), 0.05, 0.6);
  return b.drive(1.6).normalize(0.85);
});
defSound('sg_thud', (v) => {
  setSeed(12100 + v);
  const b = new Buf(0.6);
  b.mix(thump(0.45, 120, 42, 8), 0, 1);
  b.mix(burst(0.18, 'brown', 700, 0, 18), 0, 0.7);
  b.mix(burst(0.06, 'pink', 2400, 300, 60), 0.01, 0.35);
  return b.drive(1.8).normalize(0.9);
});
defSound('sg_clunk', (v) => {
  setSeed(12200 + v);
  const b = new Buf(0.5);
  b.mix(thump(0.18, 260, 90, 28), 0, 0.9);
  for (let i = 0; i < 3; i++) b.mix(clickS(2600 + rnd() * 1200, 0.015), 0.02 + i * 0.03, 0.25);
  for (const f of [870, 1730, 2950]) b.mix(osc(0.45, 'sine', f).env(decay(14)), 0.01, 0.12);
  return b.drive(1.3).normalize(0.8);
});
defSound('sg_lamp', (v) => {
  setSeed(12300 + v);
  const b = new Buf(0.7);
  b.mix(thump(0.2, 180, 60, 26), 0, 0.9);
  b.mix(clickS(3400, 0.01), 0, 0.6);
  const hum = osc(0.65, 'saw', 100); lowpass(hum, 600); hum.env(adsr(0.01, 0.1, 0.4, 0.4, 0.65)); b.mix(hum, 0.02, 0.35);
  const buzz = noise(0.4, 'white'); bandpass(buzz, 3000, 2); buzz.env(decay(9)); b.mix(buzz, 0.01, 0.2);
  return b.normalize(0.75);
});
defSound('sg_key', (v) => {
  setSeed(12400 + v);
  const b = new Buf(0.12);
  b.mix(clickS(3000 + v * 300, 0.012), 0, 0.6);
  b.mix(thump(0.06, 420, 180, 70), 0.004, 0.7);
  b.mix(burst(0.015, 'white', 8000, 2000, 300), 0, 0.3);
  return b.normalize(0.6);
});
defSound('sg_rocker', (v) => {
  setSeed(12500 + v);
  const b = new Buf(0.14);
  b.mix(burst(0.02, 'white', 6000, 900, 260), 0, 0.8);
  b.mix(thump(0.08, 320, 140, 55), 0.003, 0.8);
  b.mix(clickS(1800, 0.01), 0.03, 0.3);
  return b.normalize(0.6);
});
defSound('sg_lever', (v) => {
  setSeed(12600 + v);
  const b = new Buf(0.6);
  for (let i = 0; i < 6; i++) b.mix(clickS(2200 + rnd() * 900, 0.012), 0.03 + i * 0.045, 0.45);
  b.mix(thump(0.25, 200, 70, 20), 0.32, 1);
  for (const f of [640, 1500]) b.mix(osc(0.25, 'sine', f).env(decay(20)), 0.33, 0.12);
  return b.drive(1.4).normalize(0.8);
});
defSound('sg_bone', (v) => {
  setSeed(12700 + v);
  const b = new Buf(0.4);
  for (let i = 0; i < 4; i++) { const c = burst(0.03, 'white', 4200, 500, 120); b.mix(c, i * 0.025 + rnd() * 0.01, 0.6); }
  b.mix(thump(0.2, 150, 60, 25), 0, 0.7);
  const wet = noise(0.3, 'brown'); lowpass(wet, 600); wet.env(decay(12)); b.mix(wet, 0.03, 0.6);
  return b.drive(2).normalize(0.85);
});
defSound('sg_buzzer', () => {
  const b = new Buf(0.5);
  b.mix(osc(0.22, 'square', 880).env(adsr(0.005, 0.02, 0.8, 0.03, 0.22)), 0, 0.25);
  b.mix(osc(0.22, 'square', 660).env(adsr(0.005, 0.02, 0.8, 0.03, 0.22)), 0.25, 0.25);
  return b.normalize(0.5);
});
defSound('sg_squelch', (v) => {
  setSeed(12800 + v);
  const b = new Buf(0.45);
  const n = noise(0.45, 'brown'); bandpass(n, (t) => 380 + Math.sin(t * 40) * 160, 2.5); n.env(adsr(0.02, 0.1, 0.6, 0.2, 0.45)); b.mix(n, 0, 1);
  b.mix(thump(0.15, 140, 60, 25), 0.02, 0.4);
  return b.drive(1.5).normalize(0.8);
});

// ------------------------------------------------------------------ seamless loops
export type LoopName = 'whine' | 'drill' | 'saw' | 'weld' | 'hum';
const LOOPS: Record<LoopName, () => Buf> = {
  whine: () => {
    // servo whine: a geared square and its octave, a six-cycle vibrato (whole periods: loops clean)
    const b = new Buf(1);
    b.mix(osc(1, 'square', (t) => 441 + Math.sin(t * Math.PI * 12) * 6), 0, 0.12);
    b.mix(osc(1, 'sine', (t) => 882 + Math.sin(t * Math.PI * 12) * 12), 0, 0.3);
    b.mix(osc(1, 'sine', 1323), 0, 0.08);
    const n = noise(1, 'pink'); bandpass(n, 1500, 1.5); b.mix(n, 0, 0.12);
    return b;
  },
  drill: () => {
    const b = new Buf(1);
    b.mix(osc(1, 'saw', 147), 0, 0.22); b.mix(osc(1, 'square', 294), 0, 0.08);
    const n = noise(1, 'white'); bandpass(n, 2600, 1.4); n.env((t) => 0.7 + 0.3 * Math.sin(t * Math.PI * 30)); b.mix(n, 0, 0.45);
    return b.drive(1.6);
  },
  saw: () => {
    setSeed(13000);
    const b = new Buf(1);
    b.mix(osc(1, 'saw', 190), 0, 0.3); b.mix(osc(1, 'saw', 380), 0, 0.16);
    const g = noise(1, 'white'); bandpass(g, (t) => 2400 + Math.sin(t * Math.PI * 14) * 500, 1.3); b.mix(g, 0, 0.5);
    const wet = noise(1, 'brown'); lowpass(wet, 700); wet.env((t) => 0.6 + 0.4 * Math.sin(t * Math.PI * 22)); b.mix(wet, 0, 0.5);
    for (let i = 0; i < 9; i++) { const c = noise(0.015, 'white'); bandpass(c, 2600 + rnd() * 2400, 3); c.env(decay(200)); b.mix(c, rnd() * 0.95, 0.5); }
    return b.drive(2.2);
  },
  weld: () => {
    setSeed(13100);
    const b = new Buf(1);
    for (let i = 0; i < 60; i++) { const c = noise(0.004 + rnd() * 0.01, 'white'); highpass(c, 2500); c.env(decay(300)); b.mix(c, rnd() * 0.98, 0.3 + rnd() * 0.7); }
    const hum = osc(1, 'saw', 100); lowpass(hum, 400); b.mix(hum, 0, 0.25);
    const hiss = noise(1, 'white'); highpass(hiss, 4000); b.mix(hiss, 0, 0.12);
    return b;
  },
  hum: () => {
    setSeed(13200);
    const b = new Buf(2);
    const mains = osc(2, 'saw', 50); lowpass(mains, 220); b.mix(mains, 0, 0.35);
    b.mix(osc(2, 'sine', 100), 0, 0.12);
    const buzz = osc(2, 'square', 200); bandpass(buzz, 2400, 3); buzz.env((t) => 0.6 + 0.4 * Math.sin(t * Math.PI * 3)); b.mix(buzz, 0, 0.05);
    const air = noise(2, 'pink'); lowpass(air, 900); b.mix(air, 0, 0.18);
    return b;
  },
};
const loopCache = new Map<string, AudioBuffer>();
function loopBuffer(c: AudioContext, name: LoopName): AudioBuffer | null {
  let ab = loopCache.get(name);
  if (ab) return ab;
  const f = LOOPS[name]; if (!f) return null;
  const b = f().normalize(0.8);
  // crossfade the tail into the head so the seam disappears
  const xf = Math.floor(SR * 0.04), n = b.n - xf;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = b.d[i];
  for (let i = 0; i < xf; i++) { const t = i / xf; d[i] = b.d[i] * t + b.d[n + i] * (1 - t); }
  ab = c.createBuffer(1, n, SR);
  ab.copyToChannel(d, 0);
  loopCache.set(name, ab);
  return ab;
}
export interface Voice { ok: boolean; set(vol: number, rate?: number): void; stop(): void }
/** a running loop whose level and pitch can be steered every frame */
export function csfxVoice(name: LoopName): Voice {
  const dead: Voice = { ok: false, set() {}, stop() {} };
  if (!(name in LOOPS)) return dead;
  const c = ctx(); if (!c) return dead;
  const b = loopBuffer(c, name); if (!b) return dead;
  const src = c.createBufferSource(); src.buffer = b; src.loop = true;
  const g = c.createGain(); g.gain.value = 0;
  src.connect(g); g.connect(c.destination);
  src.start(0, Math.random() * b.duration * 0.9);
  let stopped = false;
  return {
    ok: true,
    set(vol: number, rate = 1) {
      if (stopped) return;
      const t = c.currentTime;
      g.gain.setTargetAtTime(Math.max(0, vol), t, 0.04);
      src.playbackRate.setTargetAtTime(Math.max(0.25, rate), t, 0.05);
    },
    stop() {
      if (stopped) return; stopped = true;
      try { g.gain.setTargetAtTime(0, c.currentTime, 0.05); src.stop(c.currentTime + 0.3); } catch { /* stopped */ }
      setTimeout(() => { try { src.disconnect(); g.disconnect(); } catch { /* gone */ } }, 500);
    },
  };
}

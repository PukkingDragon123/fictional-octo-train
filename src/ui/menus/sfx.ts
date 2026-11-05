// Tiny terminal sound kit for the menus: relay clicks, phosphor blips,
// teletype ticks and the CRT power-on thunk. Synthesised on the fly with
// WebAudio; uses the game's AudioContext when one exists (so it follows the
// UI/master volume) and its own otherwise (title boot before a game exists).
import { G } from '../../game/G';

export type Sfx = 'hover' | 'click' | 'confirm' | 'back' | 'type' | 'error' | 'boot' | 'tab' | 'toggle' | 'unlock' | 'open' | 'tick' | 'stamp' | 'shutter' | 'hum' | 'freeze'
  // the subject room (title / creator / press)
  | 'servo' | 'clamp' | 'slam' | 'squelch' | 'grind' | 'spark' | 'breaker' | 'press' | 'gear' | 'klaxon' | 'hiss' | 'buzz'
  // the pixel-art switchgear (btnKit / terminal): plate keys, rocker keys, the big levers, a keyboard clack
  | 'plate' | 'rocker' | 'lever' | 'key' | 'relay'
  // hanging signs and the gear works
  | 'creak' | 'chain' | 'ratchet'
  // the aluminium signs: a steel cable ticking in its clamp, a light panel knock
  | 'cable' | 'tink'
  // the operating tools and the creator's mini-games
  | 'saw' | 'slice' | 'zap' | 'thunk' | 'clip' | 'spray' | 'inject' | 'squeeze' | 'weld' | 'scan' | 'swap' | 'whoosh'
  | 'ding' | 'perfect' | 'flub' | 'scream' | 'crack' | 'beat' | 'hit' | 'miss' | 'boing' | 'gasp';

let own: AudioContext | null = null;
let gestureHooked = false;
const last: Record<string, number> = {};

function context(): AudioContext | null {
  const gc = (G as any)?.audio?.ctx as AudioContext | null | undefined;
  hookGestures();
  if (gc) return gc;
  if (!own) {
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      own = new AC({ latencyHint: 'interactive' });
    } catch { return null; }
  }
  return own;
}

/** resume suspended audio (ours and the game's) on real user gestures; mobile browsers only count touchend / pointerup / click / keydown, not pointerdown */
function hookGestures() {
  if (gestureHooked) return;
  gestureHooked = true;
  const run = () => {
    for (const c of [own, (G as any)?.audio?.ctx as AudioContext | null]) if (c && c.state !== 'running') c.resume().catch(() => {});
  };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, run, { capture: true });
}
hookGestures();

function volume(): number {
  const v = (G as any)?.audio?.vol;
  if (v) return v.ui * v.master;
  try { const s = JSON.parse(localStorage.getItem('noclip.audio') || '{}'); return (s.ui ?? 0.6) * (s.master ?? 0.85); } catch { return 0.5; }
}

/** play a UI sound; cheap and throttled so hover sweeps never machine-gun */
export function sfx(kind: Sfx, vol = 1) {
  const now = performance.now();
  const gap = kind === 'hover' ? 45 : kind === 'type' || kind === 'tick' ? 28 : 20;
  if (now - (last[kind] || 0) < gap) return;
  last[kind] = now;
  const ctx = context();
  if (!ctx || ctx.state !== 'running') return;
  const out = ctx.createGain();
  out.gain.value = volume() * vol * 0.9;
  out.connect(ctx.destination);
  const t = ctx.currentTime + 0.002;
  const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, peak: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t + at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur);
    g.gain.setValueAtTime(0, t + at);
    g.gain.linearRampToValueAtTime(peak, t + at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + at + dur);
    o.connect(g); g.connect(out);
    o.start(t + at); o.stop(t + at + dur + 0.02);
  };
  const noise = (at: number, dur: number, peak: number, freq: number, q = 1.2) => {
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = peak;
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t + at);
  };
  switch (kind) {
    case 'hover': tone('square', 1850, 1850, 0, 0.025, 0.035); break;
    case 'tick': tone('square', 2600, 2600, 0, 0.012, 0.03); break;
    case 'tab': tone('square', 1200, 1500, 0, 0.04, 0.05); noise(0, 0.02, 0.15, 3500); break;
    case 'click': noise(0, 0.025, 0.5, 2400, 0.8); tone('square', 900, 600, 0, 0.03, 0.05); break;
    case 'toggle': noise(0, 0.02, 0.45, 1800, 0.9); tone('square', 700, 700, 0, 0.02, 0.05); noise(0.05, 0.02, 0.3, 2600, 0.9); break;
    case 'confirm': tone('square', 880, 880, 0, 0.06, 0.06); tone('square', 1320, 1320, 0.07, 0.11, 0.06); break;
    case 'back': tone('square', 990, 990, 0, 0.05, 0.05); tone('square', 660, 660, 0.06, 0.08, 0.05); break;
    case 'open': tone('triangle', 300, 1400, 0, 0.12, 0.08); noise(0, 0.08, 0.12, 4000, 0.7); break;
    case 'error': tone('sawtooth', 140, 120, 0, 0.18, 0.08); tone('square', 147, 140, 0, 0.18, 0.04); break;
    case 'type': noise(0, 0.018, 0.35 + Math.random() * 0.2, 2800 + Math.random() * 1600, 1.4); break;
    case 'stamp': noise(0, 0.12, 0.9, 500, 0.6); tone('sine', 120, 50, 0, 0.16, 0.25); break;
    case 'boot':
      noise(0, 0.05, 0.6, 900, 0.5);
      tone('sine', 60, 40, 0, 0.35, 0.22);
      tone('sine', 15600, 15600, 0.02, 1.4, 0.006);
      tone('triangle', 220, 880, 0.05, 0.5, 0.03);
      break;
    case 'shutter':
      // mirror slap, shutter, then the flash capacitor whining back up
      noise(0, 0.03, 0.9, 1800, 0.7); noise(0.045, 0.02, 0.7, 3200, 0.9);
      tone('sine', 900, 7200, 0.08, 0.9, 0.012);
      break;
    case 'hum': tone('sawtooth', 60, 60, 0, 0.6, 0.03); tone('sine', 120, 118, 0, 0.6, 0.04); break;
    case 'freeze':
      // time catches on something: a falling glassy chord and a tape stop
      [880, 660, 440].forEach((f, i) => tone('triangle', f, f * 0.5, i * 0.03, 0.5, 0.04));
      tone('sawtooth', 220, 40, 0, 0.45, 0.03);
      noise(0, 0.15, 0.3, 6000, 0.5);
      break;
    case 'servo': tone('sawtooth', 140, 330, 0, 0.42, 0.035); tone('square', 70, 160, 0, 0.42, 0.02); noise(0, 0.4, 0.12, 1400, 2); break;
    case 'clamp': noise(0, 0.05, 0.9, 3200, 0.9); tone('square', 320, 110, 0, 0.08, 0.08); tone('triangle', 1260, 1200, 0.01, 0.25, 0.03); break;
    case 'slam':
      tone('sine', 78, 26, 0, 0.9, 0.5); noise(0, 0.35, 1, 260, 0.5); noise(0, 0.08, 0.8, 2200, 0.6);
      tone('triangle', 410, 400, 0.01, 0.9, 0.05); tone('triangle', 637, 630, 0.01, 0.7, 0.035);
      break;
    case 'squelch': for (let i = 0; i < 4; i++) noise(i * 0.045 + Math.random() * 0.02, 0.07, 0.7, 380 + Math.random() * 500, 3.5); tone('sine', 220, 70, 0, 0.25, 0.12); break;
    case 'grind': tone('sawtooth', 820, 1350, 0, 0.55, 0.04); tone('sawtooth', 1640, 2500, 0, 0.55, 0.015); noise(0, 0.55, 0.35, 3800, 1.5); break;
    case 'spark': for (let i = 0; i < 6; i++) noise(Math.random() * 0.22, 0.012, 0.6 + Math.random() * 0.4, 4500 + Math.random() * 4000, 1.2); break;
    case 'breaker': noise(0, 0.1, 1, 340, 0.6); tone('sine', 110, 48, 0, 0.3, 0.3); tone('sawtooth', 60, 60, 0.12, 1.1, 0.03); tone('sine', 120, 120, 0.12, 1.1, 0.04); break;
    case 'press': tone('sine', 240, 90, 0, 0.14, 0.2); noise(0, 0.03, 0.6, 1300, 0.8); tone('square', 1800, 1800, 0.05, 0.03, 0.03); break;
    case 'gear': for (let i = 0; i < 7; i++) { noise(i * 0.055, 0.015, 0.7, 2600 + i * 120, 1); tone('square', 900 - i * 40, 700, i * 0.055, 0.02, 0.03); } break;
    case 'klaxon': for (let i = 0; i < 4; i++) tone('square', i % 2 ? 520 : 690, i % 2 ? 520 : 690, i * 0.21, 0.2, 0.05); break;
    case 'hiss': noise(0, 0.8, 0.45, 5200, 0.6); noise(0, 0.3, 0.3, 900, 0.8); break;
    case 'buzz': tone('sawtooth', 118, 122, 0, 0.32, 0.05); tone('square', 236, 240, 0, 0.32, 0.025); noise(0, 0.3, 0.2, 6000, 0.8); break;
    case 'plate': noise(0, 0.03, 0.8, 1400, 0.7); tone('square', 420, 180, 0, 0.05, 0.07); noise(0.035, 0.02, 0.35, 3000, 1); break;
    case 'rocker': noise(0, 0.018, 0.7, 2600, 1.1); tone('square', 1500, 1100, 0, 0.018, 0.04); noise(0.028, 0.012, 0.3, 4200, 1.2); break;
    case 'key': noise(0, 0.022, 0.75 + Math.random() * 0.2, 1900 + Math.random() * 900, 1); tone('triangle', 260 + Math.random() * 40, 140, 0, 0.04, 0.06); break;
    case 'relay': noise(0, 0.012, 0.8, 3600, 1.4); noise(0.022, 0.01, 0.5, 2400, 1.4); tone('square', 60, 60, 0, 0.05, 0.02); break;
    case 'lever':
      // a big knife-switch lever: the ratchet, the throw, the contact block slamming home
      for (let i = 0; i < 4; i++) noise(i * 0.035, 0.012, 0.5, 2200 + i * 200, 1.3);
      noise(0.16, 0.09, 1, 420, 0.6); tone('sine', 110, 46, 0.16, 0.28, 0.28); tone('square', 2400, 2400, 0.17, 0.02, 0.03);
      break;
    case 'creak': {
      // a rusty eye bolt turning under load: a scraping, wavering squeak
      const o = ctx.createOscillator(), g = ctx.createGain(), m = ctx.createOscillator(), mg = ctx.createGain();
      const f0 = 520 + Math.random() * 380;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.78 + Math.random() * 0.3), t + 0.26);
      m.type = 'square'; m.frequency.value = 31 + Math.random() * 24; mg.gain.value = f0 * 0.08; m.connect(mg); mg.connect(o.frequency);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 2.1; bp.Q.value = 6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.04); g.gain.linearRampToValueAtTime(0.035, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
      o.connect(bp); bp.connect(g); g.connect(out);
      o.start(t); m.start(t); o.stop(t + 0.34); m.stop(t + 0.34);
      noise(0, 0.25, 0.08, 2600, 3);
      break;
    }
    case 'chain': for (let i = 0; i < 4; i++) { noise(i * 0.03 + Math.random() * 0.015, 0.012, 0.35 + Math.random() * 0.25, 3800 + Math.random() * 2600, 5); tone('triangle', 2400 + Math.random() * 900, 2200, i * 0.03, 0.03, 0.012); } break;
    case 'cable': {
      // a thin steel cable ticking in its clamp: two bright short partials, a whisper of noise
      const f = 3200 + Math.random() * 900;
      tone('sine', f, f * 0.985, 0, 0.09, 0.022); tone('sine', f * 1.51, f * 1.49, 0.004, 0.06, 0.012);
      noise(0, 0.012, 0.18, 6800, 3);
      break;
    }
    case 'tink': tone('triangle', 1650 + Math.random() * 200, 1600, 0, 0.16, 0.045); tone('sine', 2480, 2460, 0.002, 0.12, 0.02); noise(0, 0.01, 0.35, 5200, 2); break;
    case 'ratchet': for (let i = 0; i < 5; i++) { noise(i * 0.045, 0.012, 0.8, 1700 + i * 90, 2); tone('square', 620 - i * 20, 480, i * 0.045, 0.015, 0.035); } tone('sine', 140, 80, 0.22, 0.12, 0.12); break;
    // ---- the operating tools
    case 'saw': tone('sawtooth', 600, 1500, 0, 0.35, 0.035); tone('sawtooth', 1200, 2900, 0, 0.35, 0.012); noise(0, 0.3, 0.25, 4200, 1.4); break;
    case 'slice': noise(0, 0.07, 0.6, 6200, 0.9); tone('triangle', 3200, 1800, 0, 0.06, 0.02); noise(0.03, 0.05, 0.35, 900, 2.5); break;
    case 'zap': tone('square', 1800, 600, 0, 0.12, 0.03); tone('sine', 120, 120, 0, 0.18, 0.05); noise(0, 0.1, 0.3, 7000, 1); break;
    case 'thunk': tone('sine', 150, 48, 0, 0.22, 0.42); noise(0, 0.06, 0.9, 700, 0.6); noise(0.01, 0.02, 0.4, 2600, 1.2); break;
    case 'clip': for (let i = 0; i < 5; i++) noise(i * 0.025, 0.02, 0.5, 5200 + Math.random() * 1500, 1.4); tone('sawtooth', 210, 205, 0, 0.14, 0.02); break;
    case 'spray': noise(0, 0.3, 0.55, 7600, 0.5); noise(0, 0.25, 0.25, 2800, 0.8); break;
    case 'inject': noise(0, 0.12, 0.5, 4800, 0.9); tone('triangle', 2600, 2560, 0.1, 0.12, 0.025); tone('sine', 90, 60, 0, 0.1, 0.08); break;
    case 'squeeze': tone('sawtooth', 70, 50, 0, 0.4, 0.05); for (let i = 0; i < 6; i++) noise(i * 0.05, 0.02, 0.45, 1400 + i * 120, 3); break;
    case 'weld': for (let i = 0; i < 12; i++) noise(Math.random() * 0.3, 0.015, 0.5 + Math.random() * 0.4, 3000 + Math.random() * 5000, 1); tone('sawtooth', 100, 98, 0, 0.3, 0.03); break;
    case 'scan': tone('sine', 520, 1560, 0, 0.42, 0.03); tone('square', 1040, 3100, 0, 0.42, 0.006); break;
    case 'swap': noise(0, 0.03, 0.8, 2400, 1); tone('square', 520, 260, 0, 0.05, 0.05); noise(0.09, 0.03, 0.7, 3600, 1.2); tone('triangle', 1400, 1350, 0.09, 0.18, 0.025); break;
    case 'whoosh': noise(0, 0.28, 0.5, 900, 0.4); noise(0.05, 0.2, 0.3, 2200, 0.5); break;
    // ---- the mini-games
    case 'beat': tone('square', 1320, 1320, 0, 0.03, 0.035); break;
    case 'hit': tone('square', 990, 1980, 0, 0.07, 0.06); noise(0, 0.02, 0.35, 5000, 1); break;
    case 'perfect': [1046, 1318, 1568].forEach((f, i) => tone('square', f, f, i * 0.045, 0.09, 0.05)); tone('triangle', 2093, 2093, 0.14, 0.3, 0.035); break;
    case 'ding': tone('triangle', 1568, 1568, 0, 0.5, 0.06); tone('sine', 3136, 3136, 0, 0.35, 0.025); tone('square', 784, 784, 0, 0.06, 0.03); break;
    case 'miss': tone('square', 220, 160, 0, 0.12, 0.05); noise(0, 0.05, 0.3, 500, 1); break;
    case 'flub': tone('sawtooth', 330, 110, 0, 0.42, 0.05); tone('sawtooth', 336, 112, 0.0, 0.42, 0.04); break;
    case 'boing': { const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.45); lfo.frequency.value = 18; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.52); lfo.stop(t + 0.52); break; }
    case 'crack': noise(0, 0.03, 1, 1800, 0.7); noise(0.025, 0.05, 0.8, 900, 1.5); tone('sine', 300, 80, 0, 0.08, 0.15); break;
    case 'gasp': noise(0, 0.32, 0.4, 1500, 1.4); noise(0, 0.3, 0.25, 3200, 3); break;
    case 'scream': {
      // a voice through three vowel formants, pitch shooting up and breaking
      const f0 = 210 + Math.random() * 160;
      const o = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.12); o.frequency.linearRampToValueAtTime(f0 * 1.7, t + 0.55); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.9);
      vib.frequency.value = 7 + Math.random() * 3; vg.gain.value = f0 * 0.06; vib.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.05); g.gain.setValueAtTime(0.5, t + 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
      for (const [f, q, a] of [[820, 6, 1], [1250, 8, 0.6], [2600, 10, 0.35]] as [number, number, number][]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const ga = ctx.createGain(); ga.gain.value = a * 0.22;
        o.connect(bp); bp.connect(ga); ga.connect(g);
      }
      g.connect(out);
      o.start(t); vib.start(t); o.stop(t + 1); vib.stop(t + 1);
      noise(0, 0.6, 0.12, 2400, 1.2);
      break;
    }
    case 'unlock':
      [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, i * 0.07, 0.16, 0.05));
      tone('triangle', 1568, 1568, 0.3, 0.5, 0.04);
      break;
  }
  setTimeout(() => out.disconnect(), 2000);
}

// ---------------------------------------------------------------- held sounds (a saw running, a spray held down)
export type LoopKind = 'saw' | 'spray' | 'clipper' | 'laser' | 'weld' | 'scan' | 'motor';
export interface LoopSfx { set(level: number, pitch?: number): void; stop(): void }
/** a continuous tool sound; set(level 0..1, pitch ×) each frame, stop() when done */
export function loopSfx(kind: LoopKind): LoopSfx {
  const ctx = context();
  const dead: LoopSfx = { set() {}, stop() {} };
  if (!ctx || ctx.state !== 'running') return dead;
  const out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
  const nodes: AudioNode[] = [out];
  const oscs: { o: OscillatorNode; f: number }[] = [];
  const osc = (type: OscillatorType, f: number, g: number, filt?: [BiquadFilterType, number, number]) => {
    const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g;
    if (filt) { const fl = ctx.createBiquadFilter(); fl.type = filt[0]; fl.frequency.value = filt[1]; fl.Q.value = filt[2]; o.connect(fl); fl.connect(gn); nodes.push(fl); } else o.connect(gn);
    gn.connect(out); o.start(); nodes.push(o, gn); oscs.push({ o, f });
  };
  const hiss = (f: number, q: number, g: number) => {
    const n = ctx.sampleRate * 1.5, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
    const gn = ctx.createGain(); gn.gain.value = g;
    s.connect(fl); fl.connect(gn); gn.connect(out); s.start(); nodes.push(s, fl, gn);
  };
  let peak = 0.05;
  switch (kind) {
    case 'saw': osc('sawtooth', 900, 0.5); osc('sawtooth', 1810, 0.22); osc('square', 450, 0.12, ['lowpass', 1200, 1]); hiss(4500, 1.2, 0.5); peak = 0.05; break;
    case 'spray': hiss(7200, 0.6, 1); hiss(2600, 0.9, 0.4); peak = 0.12; break;
    case 'clipper': osc('sawtooth', 118, 0.6); osc('square', 236, 0.25, ['bandpass', 900, 2]); hiss(5200, 1.5, 0.3); peak = 0.045; break;
    case 'laser': osc('sine', 1480, 0.4); osc('square', 60, 0.25, ['lowpass', 300, 1]); hiss(8000, 2, 0.25); peak = 0.04; break;
    case 'weld': hiss(3800, 0.7, 1); osc('sawtooth', 100, 0.3, ['lowpass', 400, 1]); peak = 0.1; break;
    case 'scan': osc('sine', 880, 0.3); osc('square', 1760, 0.08, ['lowpass', 2400, 1]); peak = 0.03; break;
    case 'motor': osc('sawtooth', 120, 0.5, ['lowpass', 600, 1]); osc('square', 60, 0.3, ['lowpass', 300, 1]); peak = 0.04; break;
  }
  let alive = true;
  return {
    set(level: number, pitch = 1) {
      if (!alive) return;
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(volume() * peak * Math.max(0, Math.min(1.2, level)), now, 0.03);
      for (const { o, f } of oscs) o.frequency.setTargetAtTime(f * pitch, now, 0.05);
    },
    stop() {
      if (!alive) return;
      alive = false;
      try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.04); } catch { /* closed */ }
      setTimeout(() => nodes.forEach((n) => { try { (n as any).stop?.(); n.disconnect(); } catch { /* gone */ } }), 400);
    },
  };
}

// ---------------------------------------------------------------- the subject room's air: mains hum, the chair's buzz, distant drips
let amb: { nodes: AudioNode[]; timer: number; out: GainNode } | null = null;
/** start ('room') or stop (null) the menu ambience */
export function ambience(kind: 'room' | null) {
  if (amb) { clearTimeout(amb.timer); try { amb.out.gain.setTargetAtTime(0, amb.out.context.currentTime, 0.3); } catch { /* closed */ } const a = amb; setTimeout(() => a.nodes.forEach((n) => { try { (n as any).stop?.(); n.disconnect(); } catch { /* gone */ } }), 1500); amb = null; }
  if (!kind) return;
  const ctx = context();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(volume() * 0.9, ctx.currentTime + 0.1, 1.5);
  out.connect(ctx.destination);
  const nodes: AudioNode[] = [out];
  const osc = (type: OscillatorType, f: number, g: number, lp = 0) => {
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type; o.frequency.value = f; gn.gain.value = g;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); fl.connect(gn); nodes.push(fl); } else o.connect(gn);
    gn.connect(out); o.start(); nodes.push(o, gn);
    return { o, gn };
  };
  osc('sawtooth', 50, 0.02, 240);
  osc('sine', 100, 0.018);
  const wob = osc('sine', 150.6, 0.006);
  // a slow beating in the hum
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.21; lg.gain.value = 0.004; lfo.connect(lg); lg.connect(wob.gn.gain); lfo.start(); nodes.push(lfo, lg);
  // drips somewhere behind the walls, through a little echo
  const echo = ctx.createDelay(1); echo.delayTime.value = 0.23;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  const eg = ctx.createGain(); eg.gain.value = 0.5;
  echo.connect(fb); fb.connect(echo); echo.connect(eg); eg.connect(out);
  nodes.push(echo, fb, eg);
  const drip = () => {
    if (!amb) return;
    const t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const f = 900 + Math.random() * 900;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.08);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.04, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    o.connect(g); g.connect(out); g.connect(echo);
    o.start(t); o.stop(t + 0.15);
    amb.timer = window.setTimeout(drip, 1400 + Math.random() * 4200);
  };
  amb = { nodes, timer: 0, out };
  amb.timer = window.setTimeout(drip, 2000);
}

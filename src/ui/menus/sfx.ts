// Tiny terminal sound kit for the menus: relay clicks, phosphor blips,
// teletype ticks and the CRT power-on thunk. Synthesised on the fly with
// WebAudio; uses the game's AudioContext when one exists (so it follows the
// UI/master volume) and its own otherwise (title boot before a game exists).
import { G } from '../../game/G';

export type Sfx = 'hover' | 'click' | 'confirm' | 'back' | 'type' | 'error' | 'boot' | 'tab' | 'toggle' | 'unlock' | 'open' | 'tick' | 'stamp';

let own: AudioContext | null = null;
let gestureHooked = false;
const last: Record<string, number> = {};

function context(): AudioContext | null {
  const gc = (G as any)?.audio?.ctx as AudioContext | null | undefined;
  if (gc) return gc;
  if (!own) {
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      own = new AC({ latencyHint: 'interactive' });
    } catch { return null; }
  }
  if (!gestureHooked) {
    gestureHooked = true;
    const resume = () => { if (own && own.state !== 'running') own.resume().catch(() => {}); };
    window.addEventListener('pointerdown', resume, { capture: true });
    window.addEventListener('keydown', resume, { capture: true });
  }
  return own;
}

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
    case 'unlock':
      [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, i * 0.07, 0.16, 0.05));
      tone('triangle', 1568, 1568, 0.3, 0.5, 0.04);
      break;
  }
  setTimeout(() => out.disconnect(), 2000);
}

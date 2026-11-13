// Recorded samples (the game's CC0 library, src/audio/samples.ts) by key, for the
// shop and its stage: works with the game's audio context or, on the lab menus, a
// small one of its own (resumed on the first gesture).
import { G } from '../../game/G';
import { sampleInfo, sampleBuffer, sampleReady, sampleFailed, preloadSamples } from '../../audio/samples';

let own: AudioContext | null = null;
function ctx(): AudioContext | null {
  const g = (G as unknown as { audio?: { ctx?: AudioContext } })?.audio?.ctx;
  if (g) return g;
  if (!own) { try { own = new AudioContext({ latencyHint: 'interactive' }); } catch { return null; } }
  if (own.state !== 'running') void own.resume().catch(() => {});
  return own;
}
function vol(): number {
  const v = (G as unknown as { audio?: { vol?: { ui: number; master: number } } })?.audio?.vol;
  if (v) return v.ui * v.master;
  try { const s = JSON.parse(localStorage.getItem('noclip.audio') || '{}'); return (s.ui ?? 0.6) * (s.master ?? 0.85); } catch { return 0.5; }
}
export function playSample(key: string, v = 1, rate = 1) {
  const c = ctx(); if (!c || c.state !== 'running') return;
  const s = sampleInfo(key); if (!s) return;
  const i = Math.floor(Math.random() * s.files.length);
  if (sampleFailed(key, i)) return;
  preloadSamples(c);
  const go = (buf: AudioBuffer | null) => {
    if (!buf) return;
    const src = c.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = s.rate * rate;
    const g = c.createGain(); g.gain.value = v * s.gain * vol();
    src.connect(g); g.connect(c.destination); src.start();
  };
  const b = sampleBuffer(c, key, i);
  if (b) go(b); else { const t0 = performance.now(); void sampleReady(c, key, i).then((x) => { if (performance.now() - t0 < 400) go(x); }); }
}

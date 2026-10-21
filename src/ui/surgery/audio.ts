// Sound for the operating table: plays the cyber recipes (src/audio/sounds_cyber.ts)
// through the game's AudioContext when one exists, or a private one in the
// menus. Buffers are synthesised once and cached.
import { G } from '../../game/G';
import { synth } from '../../audio/sounds';
import { SR } from '../../audio/synth';
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
  const c = ctx(); if (!c) return () => {};
  const b = buffer(c, key, 0);
  if (!b) return () => {};
  const src = c.createBufferSource(); src.buffer = b; src.loop = true;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(c.destination);
  src.start();
  return () => { try { g.gain.setTargetAtTime(0, c.currentTime, 0.05); src.stop(c.currentTime + 0.2); } catch { /* stopped */ } };
}

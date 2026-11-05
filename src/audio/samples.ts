// Recorded sound effects (CC0 packs, see CREDITS-AUDIO.md and credits.ts) behind the engine's
// sound keys. The manifest maps a key to one or more sample files (variants) with a gain matched
// to the loudness the game was tuned for; the engine routes them exactly like the old recipes
// (buses, distance, walls, reverb, pitch jitter, loops). Files are fetched and decoded lazily;
// a core set is decoded right after the first gesture. Decoded AudioBuffers are kept per page,
// not per AudioContext (the title screen and the session each make one), since a buffer can be
// played by any context.
import { SAMPLE_FILES, SAMPLE_KEYS, LOOP_SAMPLES, PRELOAD } from './sampleManifest';

// Vite turns each file into a URL: '/src/assets/sfx/x.mp3' in dev, a relative hashed file in a
// build (works from an itch.io sub-path), a data: URI once scripts/artifact.mjs inlines them.
const URLS = import.meta.glob('../assets/sfx/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urlOf = new Map<string, string>();
for (const [p, u] of Object.entries(URLS)) urlOf.set(p.slice(p.lastIndexOf('/') + 1, -4), u);

export interface SampleInfo { files: number[]; gain: number; rate: number; pv?: number }
const info = new Map<string, SampleInfo>();
for (const [k, e] of Object.entries(SAMPLE_KEYS)) info.set(k, { files: e[0], gain: e[1], rate: e[2] ?? 1, pv: e[3] });

export const hasSample = (key: string) => info.has(key);
export const sampleInfo = (key: string) => info.get(key);
export const sampleKeys = () => [...info.keys()];

const decoded = new Map<number, AudioBuffer>();
const pending = new Map<number, Promise<AudioBuffer | null>>();
const failed = new Set<number>();

function bytesOf(url: string): Promise<ArrayBuffer | null> {
  if (url.startsWith('data:')) {
    // inlined (sandboxed single-page build): decode the base64 ourselves, no fetch of data: URLs
    try {
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return Promise.resolve(out.buffer);
    } catch { return Promise.resolve(null); }
  }
  return fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
}

/**
 * Loops: drop the MP3 encoder's priming/padding (near-silent samples at both ends) and blend a few
 * milliseconds of the tail into the head; the files themselves already carry a long crossfade.
 */
function tidyLoop(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  const d = b.getChannelData(0);
  const sr = b.sampleRate;
  let a = 0, z = d.length;
  const thr = 2e-3, maxA = Math.floor(0.12 * sr), maxZ = Math.floor(0.2 * sr);
  while (a < maxA && a < d.length && Math.abs(d[a]) < thr) a++;
  while (d.length - z < maxZ && z > a + 1 && Math.abs(d[z - 1]) < thr) z--;
  const L = Math.min(Math.floor(0.025 * sr), Math.floor((z - a) / 4));
  const n = z - a - L;
  if (n < sr * 0.1) return b;
  const out = ctx.createBuffer(1, n, sr);
  const o = out.getChannelData(0);
  for (let i = 0; i < n; i++) o[i] = d[a + i];
  for (let i = 0; i < L; i++) { const w = Math.sin((i / L) * Math.PI * 0.5); o[i] = d[a + i] * w + d[a + n + i] * Math.cos((i / L) * Math.PI * 0.5); }
  return out;
}

function load(ctx: BaseAudioContext, i: number): Promise<AudioBuffer | null> {
  const have = decoded.get(i);
  if (have) return Promise.resolve(have);
  let p = pending.get(i);
  if (p) return p;
  const url = urlOf.get(SAMPLE_FILES[i]);
  if (!url) { failed.add(i); return Promise.resolve(null); }
  p = bytesOf(url).then((ab) => {
    if (!ab) return null;
    // the callback form works on old Safari as well as the promise form
    return new Promise<AudioBuffer | null>((res) => {
      try { ctx.decodeAudioData(ab, (b) => res(b), () => res(null)); } catch { res(null); }
    });
  }).then((b) => {
    pending.delete(i);
    // a closed context cannot decode: let the next caller (with a live context) try again
    if (!b && (ctx as AudioContext).state === 'closed') return null;
    if (!b) { failed.add(i); return null; }
    if (LOOP_SAMPLES.has(i)) b = tidyLoop(ctx, b);
    decoded.set(i, b);
    return b;
  });
  pending.set(i, p);
  return p;
}

/** the sample file index used for variant v of key */
const fileFor = (s: SampleInfo, v: number) => s.files[((v % s.files.length) + s.files.length) % s.files.length];

/** decoded buffer for variant v of key, or null while it is still loading (loading is started) */
export function sampleBuffer(ctx: BaseAudioContext, key: string, v: number): AudioBuffer | null {
  const s = info.get(key);
  if (!s) return null;
  const i = fileFor(s, v);
  const b = decoded.get(i);
  if (b) return b;
  if (!failed.has(i)) void load(ctx, i);
  return null;
}
/** resolves once variant v of key is decoded (or has failed) */
export function sampleReady(ctx: BaseAudioContext, key: string, v: number): Promise<AudioBuffer | null> {
  const s = info.get(key);
  return s ? load(ctx, fileFor(s, v)) : Promise.resolve(null);
}
/** true when this key's sample could not be fetched/decoded: use the recipe instead */
export function sampleFailed(key: string, v: number) {
  const s = info.get(key);
  return !s || failed.has(fileFor(s, v));
}

let preloading = false;
/** decode the core set (UI, footsteps, doors, body, beds...) a few at a time after the first gesture */
export function preloadSamples(ctx: BaseAudioContext) {
  if (preloading) return;
  preloading = true;
  const queue: number[] = [];
  const seen = new Set<number>();
  for (const k of PRELOAD) for (const i of info.get(k)?.files ?? []) if (!seen.has(i)) { seen.add(i); queue.push(i); }
  let active = 0;
  const next = () => {
    while (active < 4 && queue.length) {
      const i = queue.shift()!;
      active++;
      void load(ctx, i).then(() => { active--; next(); });
    }
  };
  next();
}

/** for tests and the dev console: how many samples are decoded / failed */
export function sampleStats() { return { files: SAMPLE_FILES.length, keys: info.size, decoded: decoded.size, failed: failed.size, urls: urlOf.size }; }

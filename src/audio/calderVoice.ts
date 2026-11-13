// Dr. Iris Calder's recorded voice: every fixed line she says (the greeting, the
// tutorial, the handler's remarks, the debt and level notes) is a short mono OGG
// clip in public/voice/calder/, listed in its manifest.json under the line's
// normalised text. Nothing is in the bundle: the manifest is fetched the first
// time her voice is asked for, clips are fetched and decoded on demand, and the
// next few lines in script order are fetched ahead while she talks, so the
// voice starts with its subtitle. The unit's number ("D-4471") is spoken from
// small clips ("dee", "forty-four", "seventy-one") spliced into the line.
// A line without a clip (a dynamic one: amounts, quest names) returns null and
// the caller keeps the old chip voice.
//
//   loadCalderVoice()                  start fetching the manifest (idempotent)
//   calderHas(text)                    is there a recording for this line (sync; false until loaded)
//   calderSay(text, { vol, out })      play it now; returns its length (s) or null
//   calderStop()                       cut her off
//   calderSpeaking(text?)              is she talking (this line)
import { G } from '../game/G';

interface Entry { k: string; f: string[]; d: number }
interface Manifest { v: number; lines: Entry[]; num: Record<string, [string, number]> }

const DIR = 'voice/calder/';
let man: Manifest | null = null;
let loading: Promise<Manifest | null> | null = null;
let off = false;
const byKey = new Map<string, number>();
const bufs = new Map<string, AudioBuffer>();
const pend = new Map<string, Promise<AudioBuffer | null>>();
const bad = new Set<string>();

/** the same normalisation the clip generator used */
export function calderKey(text: string): string {
  return text.toLowerCase().replace(/’/g, "'").replace(/d-\d{4}/g, '{n}').replace(/[^a-z0-9{}']+/g, ' ').replace(/\s+/g, ' ').trim();
}

function url(f: string): string {
  try { return new URL(DIR + f + '.ogg', document.baseURI).toString(); } catch { return DIR + f + '.ogg'; }
}

export function loadCalderVoice(): Promise<Manifest | null> {
  if (loading) return loading;
  if (typeof fetch !== 'function' || typeof document === 'undefined') return Promise.resolve(null);
  let u = DIR + 'manifest.json';
  try { u = new URL(u, document.baseURI).toString(); } catch { /* relative */ }
  loading = fetch(u).then((r) => (r.ok ? r.json() : null)).then((m: Manifest | null) => {
    if (!m || !Array.isArray(m.lines)) { off = true; return null; }
    man = m;
    m.lines.forEach((e, i) => { if (!byKey.has(e.k)) byKey.set(e.k, i); });
    // the greeting goes first in the manifest: have it ready
    for (let i = 0; i < 3; i++) ahead(i);
    return m;
  }).catch(() => { off = true; return null; });
  return loading;
}

function ctxOf(): AudioContext | null {
  const a = G.audio as unknown as { ctx?: AudioContext; ready?: boolean } | undefined;
  return a?.ctx && a.ready !== false ? a.ctx : null;
}

function clip(f: string): Promise<AudioBuffer | null> {
  const have = bufs.get(f);
  if (have) return Promise.resolve(have);
  if (bad.has(f)) return Promise.resolve(null);
  let p = pend.get(f);
  if (p) return p;
  p = fetch(url(f)).then((r) => (r.ok ? r.arrayBuffer() : null)).then(async (ab) => {
    const ctx = ctxOf();
    if (!ab || !ctx) return null;
    const b = await ctx.decodeAudioData(ab);
    bufs.set(f, b);
    return b;
  }).catch(() => { bad.add(f); return null; }).finally(() => pend.delete(f));
  pend.set(f, p);
  return p;
}

/** fetch an entry's clips without playing them */
function ahead(i: number) {
  const e = man?.lines[i];
  if (!e || !ctxOf()) return;
  for (const f of e.f) if (f !== '#') void clip(f);
}

function entryOf(text: string): Entry | null {
  if (!man) { if (!off) void loadCalderVoice(); return null; }
  const i = byKey.get(calderKey(text));
  return i === undefined ? null : man.lines[i];
}

export function calderHas(text: string): boolean { return !!entryOf(text) && !!ctxOf(); }

/** the number's clips: D-4471 -> dee, forty-four, seventy-one */
function numberParts(text: string): string[] {
  const m = /D-(\d{2})(\d{2})/.exec(text);
  if (!man || !m) return [];
  const out: string[] = [];
  for (const k of ['D', m[1], m[2]]) { const n = man.num[k]; if (n) out.push(n[0]); }
  return out;
}

let live: { text: string; srcs: AudioBufferSourceNode[]; until: number; gen: number } | null = null;
let gen = 0;

/** play a recorded line now; its length in seconds, or null when there is no recording (use the chip voice) */
export function calderSay(text: string, o: { vol?: number; out?: AudioNode | null; delay?: number } = {}): number | null {
  const e = entryOf(text);
  const ctx = ctxOf();
  if (!e || !ctx) return null;
  calderStop();
  const my = ++gen;
  const files: string[] = [];
  for (const f of e.f) { if (f === '#') files.push(...numberParts(text)); else files.push(f); }
  const idx = man!.lines.indexOf(e);
  for (let i = 1; i <= 6; i++) ahead(idx + i);
  const out = o.out ?? (G.audio as unknown as { voiceInput?: () => AudioNode | null })?.voiceInput?.() ?? ctx.destination;
  const t0 = performance.now();
  live = { text, srcs: [], until: performance.now() / 1000 + e.d + 0.3, gen: my };
  void Promise.all(files.map(clip)).then((bs) => {
    if (gen !== my || !live) return;
    // too late (a slow network): the subtitle has moved on, stay quiet rather than lag behind it
    if (performance.now() - t0 > 1800) { live = null; return; }
    const g = ctx.createGain(); g.gain.value = o.vol ?? 1;
    g.connect(out);
    let t = ctx.currentTime + (o.delay ?? 0.03);
    const start = t;
    bs.forEach((b, i) => {
      if (!b) return;
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(g); s.start(t);
      live!.srcs.push(s);
      // the spliced number sits a little tighter than whole phrases
      const num = files[i].startsWith('n_') && files[i + 1]?.startsWith('n_');
      t += b.duration + (num ? -0.04 : 0.06);
    });
    live!.until = performance.now() / 1000 + (t - start) + 0.05;
  });
  return e.d + 0.05;
}

export function calderStop() {
  gen++;
  if (!live) return;
  for (const s of live.srcs) { try { s.stop(); } catch { /* not started */ } }
  live = null;
}

export function calderSpeaking(text?: string): boolean {
  if (!live || performance.now() / 1000 > live.until) return false;
  return text === undefined || calderKey(text) === calderKey(live.text);
}

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __calderVoice: unknown }).__calderVoice = { loadCalderVoice, calderHas, calderSay, calderStop, calderSpeaking, calderKey };

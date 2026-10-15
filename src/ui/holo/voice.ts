// The BAILIFF's voice: a cold corporate text-to-speech made from scratch in
// WebAudio terms. Each line is rendered offline into one buffer: a buzzy
// glottal source through three moving formant resonators (vowels from the
// spelling, noise for fricatives, a gap and a burst for plosives), a stepped
// robotic pitch that sinks toward the end of each sentence, ring modulation
// for the metal, a bit crusher for the cheap speaker in the band, and
// glitches: stutters, dropouts and the occasional dive when it says something
// it shouldn't. Plays on the voice bus; subtitles are shown by holo.ts.
import { G } from '../../game/G';

const SR = 16000;

type Cls = 'v' | 'n' | 'l' | 'f' | 'p' | 'h' | ' ' | ',' | '.';
interface Ph { cls: Cls; f: [number, number, number]; len: number; noise?: number; voiced: number; stress?: boolean }

const VOW: Record<string, [number, number, number]> = {
  a: [760, 1250, 2550], e: [520, 1820, 2550], i: [320, 2250, 2950], o: [520, 900, 2400], u: [360, 820, 2300], y: [320, 2100, 2800],
};
const NASAL: [number, number, number] = [260, 1050, 2450];
const LIQ: [number, number, number] = [330, 1150, 2350];

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function say3(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + ' hundred');
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ' ' + ONES[r % 10] : ''));
  return parts.join(' ');
}
export function numWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const out: string[] = [];
  const mil = Math.floor(n / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  if (mil) out.push(say3(mil) + ' million');
  if (th) out.push(say3(th) + ' thousand');
  if (rest) out.push(say3(rest));
  return out.join(' ');
}

/** spelling -> rough phones */
function phones(text: string): Ph[] {
  const t = text.toLowerCase()
    .replace(/(\d[\d,]*)/g, (m) => ' ' + numWords(Number(m.replace(/,/g, ''))) + ' ')
    .replace(/¤/g, ' scrip ').replace(/d-(\d)/g, 'dee $1').replace(/%/g, ' percent')
    .replace(/[^a-z .,!?;:'-]/g, ' ');
  const out: Ph[] = [];
  const words = t.split(/(\s+|[.,!?;:])/).filter((w) => w && w !== ' ');
  for (const w of words) {
    if (/^\s+$/.test(w)) { out.push({ cls: ' ', f: VOW.a, len: 0.035, voiced: 0 }); continue; }
    if (/^[.!?]$/.test(w)) { out.push({ cls: '.', f: VOW.a, len: 0.3, voiced: 0 }); continue; }
    if (/^[,;:]$/.test(w)) { out.push({ cls: ',', f: VOW.a, len: 0.16, voiced: 0 }); continue; }
    let lastV = -1;
    for (let i = 0; i < w.length; i++) {
      const c = w[i], n = w[i + 1] || '';
      if (c === "'" || c === '-') continue;
      if (c in VOW && !(c === 'y' && i === 0)) {
        // vowel pairs glide into one longer vowel
        if (n in VOW && n !== 'y') { out.push({ cls: 'v', f: VOW[c], len: 0.07, voiced: 1 }); out.push({ cls: 'v', f: VOW[n], len: 0.07, voiced: 1 }); i++; }
        else out.push({ cls: 'v', f: VOW[c], len: c === 'e' && i === w.length - 1 ? 0.03 : 0.085, voiced: 1 });
        lastV = out.length - 1;
        continue;
      }
      if (c === 's' && n === 'h') { out.push({ cls: 'f', f: [2600, 3400, 4200], len: 0.08, noise: 1, voiced: 0 }); i++; continue; }
      if (c === 't' && n === 'h') { out.push({ cls: 'f', f: [1400, 4500, 6000], len: 0.06, noise: 0.5, voiced: 0 }); i++; continue; }
      if (c === 'c' && n === 'h') { out.push({ cls: 'p', f: [2500, 3200, 4000], len: 0.07, noise: 1, voiced: 0 }); i++; continue; }
      switch (c) {
        case 'm': case 'n': out.push({ cls: 'n', f: NASAL, len: 0.06, voiced: 0.7 }); break;
        case 'l': case 'r': case 'w': out.push({ cls: 'l', f: c === 'w' ? [300, 700, 2200] : LIQ, len: 0.055, voiced: 0.85 }); break;
        case 'y': out.push({ cls: 'l', f: VOW.i, len: 0.05, voiced: 0.85 }); break;
        case 's': case 'z': case 'x': out.push({ cls: 'f', f: [4200, 5600, 7200], len: 0.075, noise: c === 's' ? 0.9 : 0.6, voiced: c === 'z' ? 0.4 : 0 }); break;
        case 'f': case 'v': out.push({ cls: 'f', f: [1600, 3800, 6200], len: 0.065, noise: 0.45, voiced: c === 'v' ? 0.5 : 0 }); break;
        case 'h': out.push({ cls: 'h', f: VOW[w[i + 1]] || VOW.a, len: 0.05, noise: 0.5, voiced: 0 }); break;
        case 'p': case 'b': out.push({ cls: 'p', f: [700, 1100, 2400], len: 0.06, noise: 0.7, voiced: c === 'b' ? 0.3 : 0 }); break;
        case 't': case 'd': out.push({ cls: 'p', f: [3200, 4200, 5600], len: 0.06, noise: 0.8, voiced: c === 'd' ? 0.3 : 0 }); break;
        case 'k': case 'g': case 'q': case 'c': out.push({ cls: 'p', f: [1700, 2500, 3500], len: 0.065, noise: 0.8, voiced: c === 'g' ? 0.3 : 0 }); break;
        case 'j': out.push({ cls: 'p', f: [2400, 3000, 3800], len: 0.07, noise: 0.7, voiced: 0.4 }); break;
        default: break;
      }
    }
    if (lastV >= 0) { out[lastV].len *= 1.4; out[lastV].stress = true; }
  }
  return out;
}

export interface VoiceOpts {
  /** 'band': the normal unit voice; 'leak': lower, slower, wrong */
  kind?: 'band' | 'leak' | 'alarm';
  /** 0..1 extra glitching */
  glitch?: number;
  rate?: number;
}

/** render a line; returns mono samples at 22.05 kHz */
export function renderVoice(text: string, o: VoiceOpts = {}): Float32Array {
  const ph = phones(text);
  const rate = (o.rate ?? 1) * (o.kind === 'leak' ? 0.82 : o.kind === 'alarm' ? 1.12 : 1);
  const glitch = o.glitch ?? (o.kind === 'leak' ? 0.5 : 0.12);
  let total = 0.09;
  for (const p of ph) total += p.len / rate;
  total += 0.25;
  const n = Math.ceil(total * SR);
  const out = new Float32Array(n);
  // ---- a start chirp: the band clears its throat
  for (let i = 0; i < 0.05 * SR; i++) { const t = i / SR; out[i] = Math.sign(Math.sin(t * 2 * Math.PI * (1500 - t * 9000))) * 0.18 * (1 - t / 0.05); }
  // ---- formant resonators (2-pole), coefficients recomputed every 32 samples
  // three resonators in plain locals (this loop runs ~50k times a line)
  let ay1 = 0, ay2 = 0, aa1 = 0, aa2 = 0, by1 = 0, by2 = 0, ba1 = 0, ba2 = 0, cy1 = 0, cy2 = 0, ca1 = 0, ca2 = 0;
  const R1 = Math.exp(-Math.PI * 90 / SR), R2 = Math.exp(-Math.PI * 120 / SR), R3 = Math.exp(-Math.PI * 180 / SR);
  const W = 2 * Math.PI / SR, FMAX = SR * 0.45;
  let srcPh = 0, ring = 0, nz = 12345;
  const base = o.kind === 'leak' ? 74 : o.kind === 'alarm' ? 128 : 98;
  let i0 = Math.floor(0.09 * SR);
  const cur = [500, 1500, 2500];
  let words = 0, sent = 0;
  for (let k = 0; k < ph.length; k++) {
    const p = ph[k];
    const len = Math.floor((p.len / rate) * SR);
    if (p.cls === ' ') { words++; i0 += len; continue; }
    if (p.cls === '.' || p.cls === ',') { if (p.cls === '.') sent = 0; i0 += len; continue; }
    // robotic stepped pitch: a few fixed steps per word, sinking through the sentence
    const step = [0, 6, -4, 10, 2][(words * 3 + k) % 5];
    const decl = Math.max(0.78, 1 - sent * 0.012);
    let f0 = (base + step) * decl * (p.stress ? 1.06 : 1);
    sent++;
    // the leak voice slides down like a tape running slow
    const slide = o.kind === 'leak' ? -0.25 : 0;
    const plos = p.cls === 'p';
    const gap = plos ? Math.floor(len * 0.45) : 0;
    const glide = p.cls === 'v' || p.cls === 'l' || p.cls === 'n' ? 0.35 : 0.8;
    const pn = p.noise ?? (plos ? 0.7 : 0), pv = p.voiced, fric = p.cls === 'f', nasal = p.cls === 'n' ? 0.6 : 1, noisy = p.cls === 'f' || p.cls === 'p';
    const burstK = 1 / (SR * 0.012);
    for (let j = 0; j < len && i0 + j < n; j++) {
      const t = j / len;
      if ((j & 31) === 0) {
        cur[0] += (p.f[0] - cur[0]) * glide; cur[1] += (p.f[1] - cur[1]) * glide; cur[2] += (p.f[2] - cur[2]) * glide;
        aa1 = 2 * R1 * Math.cos(W * Math.min(cur[0], FMAX)); aa2 = -R1 * R1;
        ba1 = 2 * R2 * Math.cos(W * Math.min(cur[1], FMAX)); ba2 = -R2 * R2;
        ca1 = 2 * R3 * Math.cos(W * Math.min(cur[2], FMAX)); ca2 = -R3 * R3;
      }
      // sources
      const f = f0 * (1 + slide * t * 0.4);
      srcPh += f / SR; if (srcPh >= 1) srcPh -= 1;
      const buzz = (srcPh < 0.3 ? 1 : -0.43) * 0.6 + (2 * srcPh - 1) * 0.4;
      nz = (nz * 1103515245 + 12345) & 0x7fffffff;
      const noise = (nz / 0x7fffffff) * 2 - 1;
      let env = 1;
      if (t < 0.12) env = t / 0.12; else if (t > 0.82) env = (1 - t) / 0.18;
      let x = 0;
      if (plos) { if (j < gap) x = 0; else x = (noise * pn * Math.exp(-(j - gap) * burstK) + buzz * pv * 0.5); }
      else x = buzz * pv + noise * pn * (fric ? 0.9 : 0.4);
      x *= env * nasal;
      // resonators in parallel
      const va = x + aa1 * ay1 + aa2 * ay2; ay2 = ay1; ay1 = va;
      const vb = x + ba1 * by1 + ba2 * by2; by2 = by1; by1 = vb;
      const vc = x + ca1 * cy1 + ca2 * cy2; cy2 = cy1; cy1 = vc;
      let y = va + vb * 0.55 + vc * 0.22;
      if (noisy) y = y * 0.35 + x * 0.25;
      out[i0 + j] += y * 0.06;
    }
    i0 += len;
  }
  // ---- metal: ring modulation, then a crushed little speaker
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(out[i]));
  const norm = mx > 0 ? 0.8 / mx : 1;
  const ringF = o.kind === 'leak' ? 31 : 53;
  let hold = 0, held = 0, hp = 0, lp = 0;
  const q = o.kind === 'leak' ? 32 : 48;
  // ring oscillator as a rotation (no trig per sample)
  const rw = 2 * Math.PI * ringF / SR, rc = Math.cos(rw), rs = Math.sin(rw);
  let rx = 1, ry = 0;
  void ring;
  for (let i = 0; i < n; i++) {
    const nx = rx * rc - ry * rs; ry = rx * rs + ry * rc; rx = nx;
    let v = out[i] * norm;
    v = v * 0.62 + v * ry * 0.38;
    if (hold-- <= 0) { held = Math.round(v * q) / q; hold = 1; }
    v = held;
    // high-pass ~240 Hz, low-pass ~3.4 kHz, soft clip
    hp += (v - hp) * 0.09; v = v - hp;
    lp += (v - lp) * 0.75; v = lp * 1.6;
    if (v > 3) v = 3; else if (v < -3) v = -3;
    out[i] = v * (27 + v * v) / (27 + 9 * v * v) * 0.75;
  }
  // ---- glitches: stutters and dropouts
  const chunk = Math.floor(0.055 * SR);
  for (let at = Math.floor(0.2 * SR); at < n - chunk * 4; at += chunk * 2) {
    const r = Math.random();
    if (r < glitch * 0.18) {
      // stutter: repeat a chunk 1-3 times over what follows
      const reps = 1 + Math.floor(Math.random() * 3);
      for (let k = 1; k <= reps; k++) for (let j = 0; j < chunk && at + k * chunk + j < n; j++) out[at + k * chunk + j] = out[at + j] * (1 - k * 0.12);
      at += reps * chunk;
    } else if (r < glitch * 0.28) {
      for (let j = 0; j < chunk * 0.7 && at + j < n; j++) out[at + j] = j < 30 ? 0.3 : 0;
    }
  }
  return out;
}

/** plays rendered lines on the game's voice bus (falls back to the destination) */
export class VoicePlayer {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  /** seconds the current line still runs */
  busyUntil = 0;
  play(samples: Float32Array, vol = 0.9): number {
    const dur = samples.length / SR;
    const a = G.audio as any;
    const ctx: AudioContext | null = a?.ctx ?? null;
    if (!ctx || ctx.state !== 'running') return dur;
    try {
      this.stop();
      const buf = ctx.createBuffer(1, samples.length, SR);
      buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(g);
      const bus: AudioNode | undefined = a.buses?.voice;
      g.connect(bus || ctx.destination);
      src.start();
      src.onended = () => { if (this.src === src) { this.src = null; this.gain = null; } };
      this.src = src; this.gain = g;
    } catch { /* audio unavailable */ }
    this.busyUntil = performance.now() / 1000 + dur;
    return dur;
  }
  stop() { try { this.src?.stop(); } catch { /* already stopped */ } this.src = null; this.gain = null; }
  get busy() { return performance.now() / 1000 < this.busyUntil; }
}

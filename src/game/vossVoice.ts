// Staff Sergeant Voss's voice: a procedural radio voice built from WebAudio
// nodes, timed to the text. A buzzy glottal source (sawtooth + a little
// breath noise) runs through three formant band-passes whose frequencies hop
// from vowel to vowel syllable by syllable; consonants are short noise
// bursts; the whole thing goes down a radio chain (band limit, a hard
// clipper, a resonant peak) with a squelch at either end and hiss under it.
// It does not say real words. It sounds like somebody who means them.
import { G } from './G';

interface Syl { t: number; d: number; v: [number, number, number]; pitch: number; amp: number; fric: number }

const VOWELS: Record<string, [number, number, number]> = {
  a: [760, 1180, 2480], e: [520, 1780, 2500], i: [330, 2150, 2900], o: [560, 880, 2420], u: [360, 900, 2250], y: [380, 1900, 2600], _: [520, 1450, 2480],
};
let noiseBuf: AudioBuffer | null = null;
let curve: Float32Array | null = null;

function noiseBuffer(ctx: AudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 1234567;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
  return noiseBuf;
}
function clipCurve() {
  if (curve) return curve;
  curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3.2) / Math.tanh(3.2); }
  return curve;
}

/** split a line into syllables with timing; returns the plan and its length (seconds) */
export function planLine(text: string, rate = 1, base = 96): { syl: Syl[]; dur: number } {
  const syl: Syl[] = [];
  let t = 0.12;
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) | 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) | 0; return ((seed >>> 8) & 0xffff) / 65536; };
  const n = words.length;
  words.forEach((w, wi) => {
    const clean = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    const loud = w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w);
    // vowel groups → syllables (numbers read out as a couple each)
    let groups: string[] = clean.match(/[aeiouy]+/g) || [];
    if (/\d/.test(clean)) groups = Array(Math.min(6, Math.ceil(clean.length * 1.4))).fill('_');
    if (!groups.length) groups = ['_'];
    if (groups.length > 1 && clean.endsWith('e') && !clean.endsWith('ee')) groups.pop();
    const decl = 1 - (wi / Math.max(1, n)) * 0.12;
    groups.forEach((g, gi) => {
      const v = VOWELS[g[0]] ?? VOWELS._;
      const stress = gi === 0 ? 1 : 0.82;
      const d = (0.105 + rnd() * 0.06 + (g.length > 1 ? 0.03 : 0)) / rate;
      const fric = gi === 0 && /^[sfzchtkpx]/.test(clean) ? 1 : rnd() < 0.3 ? 0.6 : 0;
      syl.push({ t, d, v, pitch: base * decl * (1 + (rnd() - 0.5) * 0.12) * (loud ? 1.18 : 1) * (gi === 0 ? 1.04 : 1), amp: stress * (loud ? 1.25 : 1), fric });
      t += d + 0.012 / rate;
    });
    // word gap and punctuation
    const last = w[w.length - 1];
    t += (last === '.' || last === '!' ? 0.34 : last === '?' ? 0.3 : last === ',' || last === ';' || last === ':' ? 0.2 : last === '—' || last === '-' ? 0.24 : 0.045) / rate;
    if (last === '?') { const s = syl[syl.length - 1]; if (s) s.pitch *= 1.22; }
  });
  return { syl, dur: t + 0.15 };
}

/**
 * One speaking voice. speak() schedules a whole line and returns its length in
 * seconds; a new line cuts the previous one off.
 */
export class RadioVoice {
  private nodes: AudioNode[] = [];
  private stopAt = 0;
  constructor(public base = 96, public rate = 1) {}

  get ctx(): AudioContext | null { const a = G.audio; return a?.ctx && a.ready ? a.ctx as AudioContext : null; }

  speak(text: string, o: { vol?: number; rate?: number; pitch?: number; clicks?: boolean } = {}): number {
    const plan = planLine(text, (o.rate ?? 1) * this.rate, (o.pitch ?? 1) * this.base);
    const ctx = this.ctx;
    const out: AudioNode | null = G.audio?.voiceInput?.() ?? null;
    if (!ctx || !out) return plan.dur;
    this.stop();
    const t0 = ctx.currentTime + 0.18;
    const end = t0 + plan.dur;
    const vol = o.vol ?? 0.85;
    // source: glottal buzz + breath
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    const sub = ctx.createOscillator(); sub.type = 'square';
    const subG = ctx.createGain(); subG.gain.value = 0.18;
    const nz = ctx.createBufferSource(); nz.buffer = noiseBuffer(ctx); nz.loop = true;
    const voiced = ctx.createGain(); voiced.gain.value = 0;
    const breath = ctx.createGain(); breath.gain.value = 0;
    src.connect(voiced); sub.connect(subG); subG.connect(voiced); nz.connect(breath);
    // formants in parallel
    const mix = ctx.createGain(); mix.gain.value = 1;
    const F: BiquadFilterNode[] = [];
    const fg = [1, 0.62, 0.3];
    for (let i = 0; i < 3; i++) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [7, 9, 11][i];
      const g = ctx.createGain(); g.gain.value = fg[i] * [3.2, 4.2, 5][i];
      voiced.connect(f); breath.connect(f); f.connect(g); g.connect(mix);
      F.push(f);
    }
    // fricatives straight through a high band
    const fr = ctx.createBiquadFilter(); fr.type = 'bandpass'; fr.frequency.value = 3600; fr.Q.value = 1.4;
    const frG = ctx.createGain(); frG.gain.value = 0;
    nz.connect(fr); fr.connect(frG); frG.connect(mix);
    // the radio: band limit, clip, a nasal peak, then level
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420; hp.Q.value = 0.9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 1.2;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1500; pk.Q.value = 2.2; pk.gain.value = 7;
    const ws = ctx.createWaveShaper(); ws.curve = clipCurve() as Float32Array<ArrayBuffer>; ws.oversample = 'none';
    const pre = ctx.createGain(); pre.gain.value = 2.4;
    const outG = ctx.createGain(); outG.gain.value = 0;
    mix.connect(hp); hp.connect(pre); pre.connect(ws); ws.connect(pk); pk.connect(lp); lp.connect(outG); outG.connect(out);
    // hiss under the carrier
    const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuffer(ctx); hiss.loop = true; hiss.playbackRate.value = 0.7;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 2200; hf.Q.value = 0.8;
    const hg = ctx.createGain(); hg.gain.value = 0;
    hiss.connect(hf); hf.connect(hg); hg.connect(out);
    hg.gain.setValueAtTime(0, t0 - 0.12); hg.gain.linearRampToValueAtTime(0.045 * vol, t0 - 0.06); hg.gain.setValueAtTime(0.045 * vol, end); hg.gain.linearRampToValueAtTime(0, end + 0.08);
    outG.gain.setValueAtTime(vol * 0.55, t0);
    // syllables
    const P = src.frequency, S = sub.frequency;
    P.setValueAtTime(plan.syl[0]?.pitch ?? this.base, t0);
    S.setValueAtTime((plan.syl[0]?.pitch ?? this.base) / 2, t0);
    for (const s of plan.syl) {
      const a = t0 + s.t, b = a + s.d;
      // consonant onset
      if (s.fric) {
        frG.gain.setValueAtTime(0, a - 0.045); frG.gain.linearRampToValueAtTime(0.5 * s.fric, a - 0.02); frG.gain.linearRampToValueAtTime(0, a + 0.01);
      }
      voiced.gain.setValueAtTime(0.02, a - 0.004);
      voiced.gain.linearRampToValueAtTime(0.9 * s.amp, a + 0.02);
      voiced.gain.setValueAtTime(0.8 * s.amp, b - 0.03);
      voiced.gain.linearRampToValueAtTime(0.03, b);
      breath.gain.setValueAtTime(0.05, a); breath.gain.linearRampToValueAtTime(0.02, b);
      P.linearRampToValueAtTime(s.pitch, a + 0.03); P.linearRampToValueAtTime(s.pitch * 0.94, b);
      S.linearRampToValueAtTime(s.pitch / 2, a + 0.03); S.linearRampToValueAtTime(s.pitch * 0.47, b);
      for (let i = 0; i < 3; i++) F[i].frequency.setTargetAtTime(s.v[i] * (i === 0 ? 0.95 : 1), a, 0.018);
    }
    voiced.gain.setValueAtTime(0, end);
    const nodes: AudioScheduledSourceNode[] = [src, sub, nz, hiss];
    for (const n of nodes) { n.start(t0 - 0.13); n.stop(end + 0.2); }
    src.onended = () => { for (const n of all) { try { n.disconnect(); } catch { /* gone */ } } };
    const all: AudioNode[] = [src, sub, subG, nz, voiced, breath, mix, ...F, fr, frG, hp, lp, pk, ws, pre, outG, hiss, hf, hg];
    this.nodes = all;
    this.stopAt = end;
    if (o.clicks !== false) {
      G.audio?.flat?.('radio_on', 'voice', 0.42 * vol, 1, t0 - 0.16);
      G.audio?.flat?.('radio_off', 'voice', 0.4 * vol, 1, end + 0.02);
    }
    return plan.dur + 0.2;
  }

  /** cut the current line off (with a squelch if it was still going) */
  stop() {
    const ctx = this.ctx;
    if (!ctx || !this.nodes.length) return;
    if (ctx.currentTime < this.stopAt) G.audio?.flat?.('radio_off', 'voice', 0.3);
    for (const n of this.nodes) {
      try { if ((n as AudioScheduledSourceNode).stop) (n as AudioScheduledSourceNode).stop(); } catch { /* not started */ }
    }
    this.nodes = [];
    this.stopAt = 0;
  }

  get speaking() { const c = this.ctx; return !!c && c.currentTime < this.stopAt; }
}

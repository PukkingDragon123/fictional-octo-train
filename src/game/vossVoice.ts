// The handler's voice (Dr. Iris Calder; once Staff Sergeant Voss): recorded
// vocal grains (src/social/chipVoice.ts, the CC0 voice samples: 'vg_fstd' for
// her, 'vg_mstd' for him) strung along the text syllable by syllable and
// transposed along its melody, sent down the link with a recorded squelch at
// either end. It does not say real words. It sounds like somebody who means them.
import { G } from './G';
import { renderLine, voiceForStyle, letterTimes, type ChipVoice } from '../social/chipVoice';

/** the voices this radio can speak with (recorded grain sets only) */
const STYLES: Record<string, () => ChipVoice> = {
  voss: () => ({ ...voiceForStyle('voss', 'SSGT. VOSS') }),
  // Dr. Calder: a level, precise woman's voice, little wobble, a narrow melody
  calder: () => ({ base: 205, wave: 'pulse', duty: 0.3, wobble: 0.06, range: 3.4, bits: 4, vol: 0.85, grain: 'vg_fstd' } as ChipVoice),
};

const SR = 22050;

export class RadioVoice {
  private src: AudioBufferSourceNode | null = null;
  private stopAt = 0;
  /** base pitch (Hz, ~96 a man's speaking voice, ~205 Dr. Calder's), speaking rate, the voice ('voss' | 'calder') */
  constructor(public base = 96, public rate = 1, public style: 'voss' | 'calder' = 'voss') {}

  get ctx(): AudioContext | null { const a = G.audio; return a?.ctx && a.ready ? a.ctx as AudioContext : null; }

  /** say a line; returns how long it takes (s) */
  speak(text: string, o: { vol?: number; rate?: number; pitch?: number; clicks?: boolean } = {}): number {
    const dur = letterTimes(text).dur / ((o.rate ?? 1) * this.rate);
    const ctx = this.ctx;
    const out: AudioNode | null = G.audio?.voiceInput?.() ?? null;
    if (!ctx || !out || !text.trim()) return dur;
    this.stop();
    try {
      const v = (STYLES[this.style] ?? STYLES.voss)();
      const ref = this.style === 'calder' ? 205 : 96;
      v.base *= (o.pitch ?? 1) * (this.base / ref);
      const pcm = renderLine(text, v, { glitch: false });
      const buf = ctx.createBuffer(1, pcm.length, SR);
      buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource(); src.buffer = buf;
      src.playbackRate.value = (o.rate ?? 1) * this.rate;
      const g = ctx.createGain(); g.gain.value = o.vol ?? 0.85;
      src.connect(g); g.connect(out);
      const t0 = ctx.currentTime + 0.12;
      if (o.clicks !== false) G.audio?.flat?.('radio_on', 'voice', 0.35);
      src.start(t0);
      this.src = src;
      this.stopAt = t0 + buf.duration / src.playbackRate.value;
      src.onended = () => { if (this.src === src) { this.src = null; if (o.clicks !== false) G.audio?.flat?.('radio_off', 'voice', 0.3); } };
    } catch { /* audio unavailable */ }
    return dur + 0.2;
  }

  /** cut the current line off (with a squelch if it was still going) */
  stop() {
    const ctx = this.ctx, s = this.src;
    if (!ctx || !s) return;
    this.src = null;
    if (ctx.currentTime < this.stopAt) G.audio?.flat?.('radio_off', 'voice', 0.3);
    try { s.stop(); } catch { /* not started */ }
    this.stopAt = 0;
  }

  get speaking() { const c = this.ctx; return !!c && c.currentTime < this.stopAt; }
}

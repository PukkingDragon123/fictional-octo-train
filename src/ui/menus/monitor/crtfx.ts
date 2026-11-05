// The cut between rooms, drawn as a tube would: a small canvas over the whole
// screen, enlarged with hard pixels. 'snow' is a burst of static with tearing
// bands (switching channel), 'on' is a tube warming up (a bright line opening
// into the picture, snow fading off it), 'off' is the picture collapsing to a
// line and then a dot. play() resolves at the cut (the middle) and the
// returned `done` when the effect has gone.
import { bitText } from '../../../gfx/bitfont';

export type CrtFxKind = 'snow' | 'on' | 'off';

export class CrtFx {
  el = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private raf = 0;
  private runs: { kind: CrtFxKind; t: number; dur: number; label?: string; cut: () => void; done: () => void; cutDone: boolean }[] = [];

  constructor(host: HTMLElement) {
    this.el.className = 'mr-fx';
    this.ctx = this.el.getContext('2d')!;
    host.append(this.el);
  }
  private size() {
    const W = Math.max(64, Math.round(window.innerWidth / 4)), H = Math.max(48, Math.round(window.innerHeight / 4));
    if (this.el.width !== W || this.el.height !== H) { this.el.width = W; this.el.height = H; this.img = null; }
  }
  /** run an effect; resolves at the cut; `.done` when it has faded */
  play(kind: CrtFxKind, ms: number, label?: string): Promise<void> & { done: Promise<void> } {
    this.size();
    let cut!: () => void, done!: () => void;
    const pc = new Promise<void>((r) => { cut = r; });
    const pd = new Promise<void>((r) => { done = r; });
    this.runs.push({ kind, t: 0, dur: Math.max(60, ms) / 1000, label, cut, done, cutDone: false });
    if (!this.raf) { let last = performance.now(); const step = (now: number) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; this.draw(dt); this.raf = this.runs.length ? requestAnimationFrame(step) : 0; }; this.raf = requestAnimationFrame(step); }
    this.el.classList.add('on');
    return Object.assign(pc, { done: pd });
  }
  get busy() { return this.runs.length > 0; }

  private draw(dt: number) {
    const c = this.ctx, W = this.el.width, H = this.el.height;
    if (!this.img) this.img = c.createImageData(W, H);
    const D = this.img.data;
    D.fill(0);
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      if (!r.cutDone && k >= (r.kind === 'off' ? 0.92 : r.kind === 'on' ? 0.0 : 0.5)) { r.cutDone = true; r.cut(); }
      if (r.kind === 'snow') {
        // up, hold, down
        const a = k < 0.35 ? k / 0.35 : k > 0.65 ? (1 - k) / 0.35 : 1;
        const band = Math.floor(Math.random() * H);
        for (let y = 0; y < H; y++) {
          const torn = Math.abs(y - band) < H * 0.08 ? 1.6 : 1;
          const rowA = a * (0.75 + 0.25 * Math.random());
          for (let x = 0; x < W; x++) {
            const v = Math.random() * 230 * torn;
            const j = (y * W + x) * 4;
            D[j] = v * 0.62; D[j + 1] = Math.min(255, v); D[j + 2] = v * 0.66; D[j + 3] = Math.min(255, 255 * rowA);
          }
        }
      } else if (r.kind === 'on') {
        // the line opens into the picture; snow fades over it
        const open = Math.min(1, k / 0.45), half = Math.max(1, Math.floor((H / 2) * (open * open)));
        const fade = 1 - Math.max(0, (k - 0.35) / 0.65);
        for (let y = 0; y < H; y++) {
          const dy = Math.abs(y - H / 2), inBand = dy < half;
          for (let x = 0; x < W; x++) {
            const j = (y * W + x) * 4;
            if (!inBand) { D[j + 3] = 255; continue; }
            const edge = half - dy < 2 && open < 1 ? 1 : 0;
            const v = edge ? 255 : Math.random() * 200;
            const a = edge ? 255 : fade * (0.25 + 0.5 * (1 - open)) * 255 + (y % 2 ? fade * 70 : 0);
            D[j] = v * 0.7; D[j + 1] = v; D[j + 2] = v * 0.75; D[j + 3] = Math.max(D[j + 3], a);
          }
        }
      } else {
        // collapse: the picture squeezes to a line, then a dot, then black
        const sq = Math.min(1, k / 0.55), half = Math.max(0.5, (H / 2) * (1 - sq * sq));
        const dot = k > 0.55 ? (k - 0.55) / 0.45 : 0, lineW = (W / 2) * (1 - dot * dot);
        for (let y = 0; y < H; y++) {
          const dy = Math.abs(y - H / 2);
          for (let x = 0; x < W; x++) {
            const j = (y * W + x) * 4, dx = Math.abs(x - W / 2);
            const inside = dy <= half && dx <= Math.max(1, lineW);
            if (!inside) { D[j + 3] = 255; continue; }
            const bright = sq * (dot > 0 ? 1 : 0.8);
            D[j] = 200 * bright; D[j + 1] = 255 * bright; D[j + 2] = 210 * bright; D[j + 3] = Math.max(D[j + 3], 255 * Math.min(1, sq * 1.4));
          }
        }
      }
      if (k >= 1) { this.runs.splice(i, 1); if (!r.cutDone) r.cut(); r.done(); }
    }
    c.putImageData(this.img, 0, 0);
    // a channel caption in the middle of the snow
    const lab = this.runs.find((r) => r.label && r.kind === 'snow');
    if (lab) {
      bitText(c, lab.label!, Math.round(W / 2), Math.round(H / 2) - 8, { color: '#d8ffd0', outline: '#020802', align: 'center' });
    }
    if (!this.runs.length) { this.el.classList.remove('on'); c.clearRect(0, 0, W, H); }
  }
  dispose() { cancelAnimationFrame(this.raf); this.el.remove(); }
}

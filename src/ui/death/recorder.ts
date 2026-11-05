// The Institute's tape: a short ring buffer of what the game canvas showed,
// grabbed ~10 times a second as small 4:3 frames (the centre of the picture),
// so the death can be replayed on a monitor in the observation room. Frames are
// taken right after the world is drawn (before the HUD layers), in the same
// frame, so the WebGL canvas needs no preserved drawing buffer.
import type { PixelRenderer } from '../../gfx/renderer';

export interface TapeFrame { cv: HTMLCanvasElement; t: number }

export class Tape {
  readonly w: number; readonly h: number;
  private ring: TapeFrame[] = [];
  private head = 0;
  private count = 0;
  private next = 0;
  private on = true;
  private hook: (r: any) => void;

  constructor(private pr: PixelRenderer, o: { fps?: number; seconds?: number; w?: number } = {}) {
    const fps = o.fps ?? 10, n = Math.round(fps * (o.seconds ?? 6));
    this.w = o.w ?? 256; this.h = Math.round(this.w * 3 / 4);
    for (let i = 0; i < n; i++) { const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h; this.ring.push({ cv, t: -1 }); }
    const step = 1000 / fps;
    this.hook = (r: any) => {
      if (!this.on) return;
      const now = performance.now();
      if (now < this.next) return;
      this.next = Math.max(this.next + step, now - step);
      this.grab(r?.domElement as HTMLCanvasElement | undefined, now);
    };
    // first in the list: before the body HUD paints over the picture
    pr.afterRender.unshift(this.hook);
  }

  private grab(src: HTMLCanvasElement | undefined, now: number) {
    if (!src || !src.width || !src.height) return;
    const f = this.ring[this.head];
    const W = src.width, H = src.height;
    // the centre 4:3 of the picture (portrait screens: a band across the middle)
    let sw = W, sh = H;
    if (W / H > 4 / 3) sw = Math.round(H * 4 / 3); else sh = Math.round(W * 3 / 4);
    const sx = Math.round((W - sw) / 2), sy = Math.round((H - sh) / 2 - (H > W ? H * 0.04 : 0));
    try {
      const c = f.cv.getContext('2d')!;
      c.imageSmoothingEnabled = true;
      c.drawImage(src, sx, Math.max(0, sy), sw, sh, 0, 0, this.w, this.h);
      f.t = now;
      this.head = (this.head + 1) % this.ring.length;
      this.count = Math.min(this.ring.length, this.count + 1);
    } catch { /* tainted or lost context: skip the frame */ }
  }

  /** keep recording (or stop) */
  set recording(v: boolean) { this.on = v; }
  get recording() { return this.on; }

  /** the frames, oldest first */
  frames(): TapeFrame[] {
    const out: TapeFrame[] = [];
    const n = this.ring.length;
    for (let i = 0; i < this.count; i++) out.push(this.ring[(this.head - this.count + i + n) % n]);
    return out;
  }

  dispose() {
    const i = this.pr.afterRender.indexOf(this.hook);
    if (i >= 0) this.pr.afterRender.splice(i, 1);
    this.ring = []; this.count = 0;
  }
}

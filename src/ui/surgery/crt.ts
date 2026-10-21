// The tele-diagnostic CRT as a reusable instrument: a Pix canvas with the
// cream bakelite bezel, phosphor content drawn by the caller every frame
// (with hit regions in screen coordinates), and two knobs that scroll.
import { Screen } from '../font5x7';
import { Pix, CRT, drawBezel, blitPhosphor, knob, ph } from './panel';
import { csfx } from './audio';

export type HitFn = (id: string, x: number, y: number, w: number, h: number) => void;

export class TeleCrt {
  pix = new Pix(CRT.W, CRT.H, 'sg-crt');
  content = new Screen(CRT.SW, CRT.SH);
  hover = '';
  scroll = 0;
  maxScroll = 0;
  private t = 0;
  private knobT = [0, 0];
  constructor(public draw: (s: Screen, hit: HitFn, hover: string, t: number) => void, public onPick: (id: string) => void) {
    this.pix.onHover = (id) => { if (id !== this.hover) { this.hover = id; if (id && id !== 'up' && id !== 'down') csfx('cy_beep', 0.06, 1.6); } };
    this.pix.onClick = (id) => {
      if (id === 'up' || id === 'down') { this.scrollBy(id === 'up' ? -1 : 1); return; }
      csfx('cy_beep', 0.18);
      this.onPick(id);
    };
    this.pix.onWheel = (d) => this.scrollBy(d);
  }
  scrollBy(d: number) {
    const n = Math.max(0, Math.min(this.maxScroll, this.scroll + d));
    if (n === this.scroll) return;
    this.scroll = n;
    this.knobT[d < 0 ? 0 : 1] += d < 0 ? -0.6 : 0.6;
    csfx('cy_servo', 0.08, 2.2);
  }
  /** redraw (call ~15 times a second) */
  frame(dt: number) {
    this.t += dt;
    const P = this.pix, s = P.s;
    P.hits.length = 0;
    drawBezel(s);
    for (const [i, kx] of [20, CRT.W - 21].entries()) knob(s, kx, CRT.H - 11, this.knobT[i]);
    P.hit('up', 10, CRT.H - 21, 20, 20); P.hit('down', CRT.W - 31, CRT.H - 21, 20, 20);
    const c = this.content;
    c.data.fill(ph.bg);
    const hit: HitFn = (id, x, y, w, h) => P.hit(id, CRT.SX + x, CRT.SY + y, w, h);
    this.draw(c, hit, this.hover, this.t);
    blitPhosphor(s, c, this.t);
    P.flush();
  }
}

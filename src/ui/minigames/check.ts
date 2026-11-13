// THE SKILL-CHECK GAUGE (round 17): a small riveted gunmetal strip that sits
// right over the action plate above the unit's head while a timed action asks
// for a steady hand (src/actions/skillCheck.ts). No words: a key cap (or a
// fingertip on touch), a glass channel with the green band and its bright
// core, the amber needle, and a pip per window (green hit, white-green clean,
// red slip). Drawn in hi-res pixel art (src/ui/hiPixel.ts).
//   checkGauge.show(screenX, plateTopY, state)   every frame while a window is open (or flashing)
//   checkGauge.hide()
import { crispCanvas, rect, bevel, rivet, glass, GUN, AMB, GRN, RED } from '../hiPixel';
import { pxText5 } from '../pxKit';
import './minigames.css';

export type GaugeMark = 'perfect' | 'hit' | 'miss' | '';
export interface GaugeState {
  kind: 'tap' | 'hold';
  /** the needle 0..1 */
  x: number;
  band: [number, number];
  core: [number, number];
  marks: GaugeMark[];
  cur: number;
  /** the key cap's letter ('' = a fingertip, for touch) */
  key: string;
  flash: GaugeMark;
  t: number;
  /** a tiny stencil on the plate's end (PIN, CUT, PASS...) */
  glyph?: string;
  held?: boolean;
  /** the window is open (else only the last result is flashing) */
  live: boolean;
}

const W = 152, H = 30;

class CheckGauge {
  private el: HTMLDivElement | null = null;
  private c: CanvasRenderingContext2D | null = null;
  private on = false;
  private lastFlash: GaugeMark = '';

  private build() {
    const el = this.el = document.createElement('div');
    el.className = 'mg-check';
    el.setAttribute('aria-hidden', 'true');
    const k = crispCanvas(W, H);
    this.c = k.c;
    el.append(k.cv);
    document.body.append(el);
  }

  show(sx: number, bottomY: number, st: GaugeState) {
    if (!this.el) this.build();
    const el = this.el!;
    el.style.transform = `translate(${Math.round(sx - W / 2)}px, ${Math.round(bottomY - H)}px)`;
    if (!this.on) { this.on = true; el.classList.add('on'); }
    if (st.flash !== this.lastFlash) {
      this.lastFlash = st.flash;
      el.classList.remove('hit', 'miss');
      if (st.flash) { void el.offsetWidth; el.classList.add(st.flash === 'miss' ? 'miss' : 'hit'); }
    }
    this.draw(st);
  }
  hide() {
    if (!this.on || !this.el) return;
    this.on = false; this.lastFlash = '';
    this.el.classList.remove('on', 'hit', 'miss');
  }

  private draw(st: GaugeState) {
    const c = this.c; if (!c) return;
    c.clearRect(0, 0, W, H);
    // the plate
    rect(c, 3, H - 2, W - 4, 2, 0x000000, 0.35);
    bevel(c, 1, 1, W - 3, H - 4, GUN.slice(2, 9), { chamfer: 3 });
    for (let y = 4; y < H - 6; y += 3) for (let x = 28 + (y % 7); x < W - 8; x += 11) rect(c, x, y, 4, 1, GUN[6], 0.18);
    rivet(c, W - 7, 5, 1, true); rivet(c, W - 7, H - 9, 1, true);
    // the key cap (pressed in while held), or a fingertip on touch
    const down = !!st.held;
    const kx = 4, ky = 4 + (down ? 1 : 0), kw = 20, kh = 18 - (down ? 1 : 0);
    rect(c, kx - 1, 3, kw + 2, 21, 0x07060a);
    bevel(c, kx, ky, kw, kh, down ? GUN.slice(1, 8) : GUN.slice(4, 11), { chamfer: 2 });
    const hot = st.live && (st.kind === 'hold' ? true : st.x >= st.band[0] && st.x <= st.band[1]);
    if (st.key) {
      const tw = st.key.length * 6 - 1;
      pxText5(c, kx + Math.round((kw - tw) / 2), ky + 5, st.key, hot ? 0x1a3a10 : 0x17150f, 1);
    } else {
      // a fingertip: a ring and a dot
      const cx = kx + kw / 2, cy = ky + kh / 2;
      for (let a = 0; a < 16; a++) rect(c, Math.round(cx + Math.cos(a / 16 * Math.PI * 2) * 5), Math.round(cy + Math.sin(a / 16 * Math.PI * 2) * 5), 1, 1, 0x17150f);
      rect(c, Math.round(cx) - 1, Math.round(cy) - 1, 3, 3, 0x17150f);
    }
    if (hot) rect(c, kx + 2, ky + kh - 3, kw - 4, 1, GRN[5], Math.floor(st.t * 10) % 2 ? 1 : 0.4);
    // the channel
    const gx = 29, gy = 5, gw = W - 39, gh = 12;
    glass(c, gx, gy, gw, gh, 0x060d08);
    const px = (u: number) => gx + 1 + Math.round(u * (gw - 3));
    // the band and its core
    const b0 = px(st.band[0]), b1 = px(st.band[1]), c0 = px(st.core[0]), c1 = px(st.core[1]);
    rect(c, b0, gy + 1, b1 - b0 + 1, gh - 2, GRN[2], 0.85);
    rect(c, c0, gy + 1, c1 - c0 + 1, gh - 2, GRN[4], 0.9);
    rect(c, b0, gy + 1, 1, gh - 2, GRN[5]); rect(c, b1, gy + 1, 1, gh - 2, GRN[5]);
    rect(c, b0, gy + 1, b1 - b0 + 1, 1, GRN[6], 0.5);
    // a hold fills from the left as the hand pushes
    if (st.kind === 'hold' && st.live) {
      const fx = px(st.x);
      for (let x = gx + 1; x < fx; x += 3) rect(c, x, gy + gh - 4, 2, 2, AMB[4], 0.75);
    }
    // the result washes over the glass
    if (st.flash) {
      const R = st.flash === 'miss' ? RED : GRN;
      rect(c, gx + 1, gy + 1, gw - 2, gh - 2, st.flash === 'perfect' ? 0xe0ffe8 : R[4], 0.35);
    }
    // the needle
    if (st.live || st.flash) {
      const nx = px(Math.max(0, Math.min(1, st.x)));
      rect(c, nx - 2, gy - 2, 5, gh + 4, 0x07060a);
      const R = st.flash === 'miss' ? RED : st.flash ? GRN : AMB;
      rect(c, nx - 1, gy - 1, 3, gh + 2, R[4]); rect(c, nx - 1, gy - 1, 1, gh + 2, R[6]); rect(c, nx + 1, gy - 1, 1, gh + 2, R[2]);
    }
    // the pips: one per window
    const n = st.marks.length, pw = 6, pg = 2, py = gy + gh + 4;
    for (let i = 0; i < n; i++) {
      const m = st.marks[i], x = gx + i * (pw + pg);
      const cur = i === st.cur && st.live && !m;
      const col = m === 'perfect' ? GRN[6] : m === 'hit' ? GRN[4] : m === 'miss' ? RED[4] : cur ? (Math.floor(st.t * 6) % 2 ? AMB[5] : AMB[2]) : GUN[2];
      rect(c, x - 1, py - 1, pw + 2, 6, 0x07060a);
      rect(c, x, py, pw, 4, col); rect(c, x, py, pw, 1, m ? 0xffffff : GUN[4], m ? 0.35 : 1);
    }
    if (st.glyph) {
      const tw = st.glyph.length * 6 - 1;
      pxText5(c, W - 10 - tw, py - 2, st.glyph, GUN[8], 1);
    }
  }
}

export const checkGauge = new CheckGauge();

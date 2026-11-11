// THE SCANNER'S LOCK-ON (round 15): hard targets (inhabitants of threat 3+,
// anomalies, artefacts) fight the visor. A third of the way into the sweep the
// carrier starts to drift, and a small riveted tuner plate comes up over the
// hotbar: an oscilloscope trace on dark glass with the carrier's peak wandering
// along it, an amber needle, and a row of lock cells. Sweep the mouse sideways
// (or turn the wheel, tap the arrow keys, or drag on touch) to keep
// the needle on the peak. On it, the scan runs faster than normal and the
// cells fill; off it, the scan crawls. Nothing to press, nothing to fail: the
// sweep still finishes on its own, only slower. Drawn with src/ui/hiPixel.ts.
//   const k = scanTuner.step(dt, hard)   while a hard sweep runs: returns the speed factor
//   scanTuner.stop()                     when the sweep ends
import { crispCanvas, rect, glass, rivet, GUN, AMB, GRN } from '../hiPixel';
import { pxPlate, pxLamp } from '../pxKit';
import './minigames.css';

const W = 292, H = 66;
function vn(t: number, s: number) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); const h = (k: number) => { let x = Math.sin(k * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }; return h(i) * (1 - u) + h(i + 1) * u; }

class ScanTuner {
  active = false;
  private el: HTMLDivElement | null = null;
  private c: CanvasRenderingContext2D | null = null;
  private f = 0.5; private n = 0.5; private lock = 0; private t = 0; private seed = 1; private hard = 1;
  private onIt = false; private drawT = 0;
  private wheel = (e: WheelEvent) => { if (!this.active) return; e.preventDefault(); e.stopPropagation(); this.n = clamp(this.n + Math.sign(e.deltaY) * 0.035); };
  private move = (e: PointerEvent) => { if (!this.active) return; const k = e.pointerType === 'touch' ? 0.006 : 0.0032; this.n = clamp(this.n + (e.movementX || 0) * k); };
  private key = (e: KeyboardEvent) => { if (!this.active) return; if (e.code === 'ArrowLeft') { this.n = clamp(this.n - 0.04); e.preventDefault(); } else if (e.code === 'ArrowRight') { this.n = clamp(this.n + 0.04); e.preventDefault(); } };

  private build() {
    const el = this.el = document.createElement('div');
    el.className = 'mg-tuner';
    const k = crispCanvas(W, H);
    this.c = k.c;
    el.append(k.cv);
    let seen = 0;
    try { seen = Number(localStorage.getItem('lp.tunerHint') || 0); } catch { /* storage blocked */ }
    if (seen < 3) { const hnt = document.createElement('small'); hnt.textContent = 'sweep the mouse or turn the wheel to hold the carrier'; el.append(hnt); try { localStorage.setItem('lp.tunerHint', String(seen + 1)); } catch { /* storage blocked */ } }
    document.body.append(el);
  }

  start(hard: number) {
    if (this.active) return;
    this.active = true; this.hard = Math.max(1, Math.min(3, hard));
    this.seed = Math.random() * 100; this.t = 0; this.lock = 0;
    this.f = 0.25 + Math.random() * 0.5; this.n = this.f + (Math.random() < 0.5 ? -0.3 : 0.3);
    this.n = clamp(this.n);
    if (!this.el) this.build();
    this.el!.classList.remove('out'); void this.el!.offsetWidth; this.el!.classList.add('on');
    window.addEventListener('wheel', this.wheel, { capture: true, passive: false });
    window.addEventListener('pointermove', this.move, true);
    window.addEventListener('keydown', this.key, true);
  }

  /** one frame of a hard sweep: the speed factor for the scan */
  step(dt: number, hard: number): number {
    if (!this.active) this.start(hard);
    this.t += dt;
    // the carrier wanders: slow swells and a faster jitter, harder targets drift wider and faster
    const sp = 0.16 + this.hard * 0.09;
    const tgt = 0.12 + 0.76 * (vn(this.t * sp, this.seed) * 0.8 + vn(this.t * sp * 3.1, this.seed + 9) * 0.2);
    this.f += (tgt - this.f) * Math.min(1, dt * 2.2);
    const band = 0.085 - this.hard * 0.012;
    this.onIt = Math.abs(this.n - this.f) < band;
    this.lock = clamp(this.lock + (this.onIt ? dt * 0.55 : -dt * 0.35));
    this.drawT -= dt;
    if (this.drawT <= 0) { this.drawT = 1 / 30; this.draw(band); }
    return this.onIt ? 1.35 + this.lock * 0.4 : 0.32;
  }
  /** how well it held (0..1), for a bonus */
  get quality() { return this.lock; }

  stop() {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('wheel', this.wheel, true);
    window.removeEventListener('pointermove', this.move, true);
    window.removeEventListener('keydown', this.key, true);
    this.el?.classList.remove('on'); this.el?.classList.add('out');
  }

  private draw(band: number) {
    const c = this.c; if (!c) return;
    c.clearRect(0, 0, W, H);
    pxPlate(c, 1, 1, W - 4, H - 4, { tone: 'steel', chamfer: 6, screws: false, seed: 23 });
    rivet(c, 7, 7, 1, true); rivet(c, 7, H - 10, 1, true); rivet(c, W - 10, 7, 1, true); rivet(c, W - 10, H - 10, 1, true);
    pxLamp(c, 20, 22, this.onIt, this.onIt ? GRN : AMB, 4);
    // the scope: dark glass, a grid, the band round the carrier, the trace
    const gx = 34, gy = 8, gw = W - 4 - gx - 12, gh = 30;
    glass(c, gx, gy, gw, gh, 0x04100a);
    for (let i = 1; i < 8; i++) rect(c, gx + Math.round((i / 8) * gw), gy + 1, 1, gh - 2, GRN[1], 0.6);
    rect(c, gx + 1, gy + Math.floor(gh / 2), gw - 2, 1, GRN[1], 0.8);
    const fx = gx + Math.round(this.f * (gw - 1)), bw = Math.round(band * (gw - 1));
    rect(c, fx - bw, gy + 1, bw * 2 + 1, gh - 2, this.onIt ? GRN[2] : GRN[1], this.onIt ? 0.55 : 0.4);
    let py = -1;
    for (let x = 1; x < gw - 1; x++) {
      const u = x / (gw - 1), d = (u - this.f) / (band * 1.1);
      const noise = (vn(x * 0.9 + this.t * 31, this.seed + 3) - 0.5) * (0.35 + 0.15 * this.hard) + (vn(x * 0.21 - this.t * 7, this.seed + 5) - 0.5) * 0.2;
      const amp = Math.exp(-d * d) * (0.75 + 0.15 * Math.sin(this.t * 13)) + noise * 0.5;
      const y = gy + gh - 3 - Math.round(Math.max(0, Math.min(1, amp * 0.85 + 0.12)) * (gh - 6));
      const col = Math.abs(d) < 1 ? GRN[5] : GRN[4];
      if (py >= 0) { const a = Math.min(py, y), b = Math.max(py, y); rect(c, gx + x, a, 1, b - a + 1, col); } else rect(c, gx + x, y, 1, 1, col);
      rect(c, gx + x, y - 1, 1, 1, GRN[6], 0.25);
      py = y;
    }
    // the needle
    const nx = gx + Math.round(this.n * (gw - 1));
    rect(c, nx - 2, gy - 3, 5, gh + 6, 0x07060a);
    rect(c, nx - 1, gy - 2, 3, gh + 4, AMB[4]); rect(c, nx - 1, gy - 2, 1, gh + 4, AMB[6]); rect(c, nx + 1, gy - 2, 1, gh + 4, AMB[2]);
    // the lock cells
    const cells = 18, cw = Math.floor((gw - 2) / cells), cy = gy + gh + 6, filled = Math.round(this.lock * cells);
    rect(c, gx - 1, cy - 1, cells * cw + 1, 9, 0x050404);
    for (let i = 0; i < cells; i++) {
      const on = i < filled, R = i >= cells - 4 ? GRN : AMB;
      rect(c, gx + i * cw, cy, cw - 1, 7, on ? R[3] : GUN[2]);
      rect(c, gx + i * cw, cy, cw - 1, 1, on ? R[6] : GUN[4]);
      rect(c, gx + i * cw, cy + 5, cw - 1, 2, on ? R[2] : GUN[1]);
    }
  }
}
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const scanTuner = new ScanTuner();

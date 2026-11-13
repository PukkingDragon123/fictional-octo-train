// THE SCANNER'S SIGNATURE LOCK (round 17; was the round-15 carrier tuner).
// Anything worth a scan (an inhabitant, a stranger, an anomaly, an artefact,
// an anomalous object) fights the visor: after the cone has found it, a
// riveted olive scope comes up over the hotbar with two dials either side.
// The target's signature runs on the glass as an amber trace that drifts
// (faster, wider and with sudden jumps for rarer and deadlier things); the
// scanner's own trace is green. Turn FREQ (left dial) and GAIN (right dial)
// until the green trace lies on the amber one: the arc under each dial goes
// green when that dial is on, the traces snap together, the lock cells fill.
//   mouse   sweep sideways = FREQ, up / down = GAIN, wheel = GAIN
//   keys    arrow keys (left / right FREQ, up / down GAIN)
//   touch   drag on the scope (sideways FREQ, up / down GAIN)
// A full lock ends the scan early (a clean lock: more DATA). When the window
// runs out the scan reads whatever the cells hold (a sloppy lock: partial
// DATA). Far off the signature the static builds (snow on the glass, the red
// heat bar); at the top the scanner screams feedback and the scan is lost
// (src/scan/scan.ts makes the noise and tips the creature off). No text: the
// stencils on the housing, the lamps, the traces. Drawn with src/ui/hiPixel.ts.
//   scanTuner.start({ diff, ease })   diff 0..4 (how hard the target fights), ease > 1 easier
//   const s = scanTuner.step(dt)      { lock, heat, close, on, t, T, end: '' | 'clean' | 'time' | 'fail' }
//   scanTuner.stop(end?)              flashes the result ('clean' | 'time' | 'fail') and fades out
import { crispCanvas, rect, glass, rivet, GUN, AMB, GRN, RED } from '../hiPixel';
import { pxPlate, pxLamp } from '../pxKit';
import { mxFrame, type MxFrame } from '../machine/kit';
import { mxMount, type MxDecor } from '../machine/decor';
import { mxOk } from '../machine/core';
import { qteAssist } from '../../core/assist';
import './minigames.css';

const W = 300, H = 78;
// the scope's glass and the dials (art px)
const SX = 46, SY = 7, SW = 208, SH = 40;
const DL = { x: 23, y: 25 }, DR = { x: W - 23, y: 25 }, DRAD = 12;
function vn(t: number, s: number) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); const h = (k: number) => { const x = Math.sin(k * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }; return h(i) * (1 - u) + h(i + 1) * u; }
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export interface LockSpec { diff: number; ease?: number }
export type LockEnd = '' | 'clean' | 'time' | 'fail';
export interface LockStep { lock: number; heat: number; close: number; on: boolean; t: number; T: number; end: LockEnd; turned: number }

class ScanLock {
  active = false;
  /** the dials (0..1), the signature's position, its jump offsets */
  private df = 0.5; private dg = 0.5; private tf = 0.5; private tg = 0.5; private jf = 0; private jg = 0;
  private lock = 0; private heat = 0; private t = 0; private T = 4; private seed = 1; private diff = 1; private ease = 1;
  private tol = 0.1; private close = 0; private on = false; private onF = false; private onG = false;
  private jumpT = 3; private phS = 0; private phT = 0; private turned = 0; private endT = 0; private end: LockEnd = '';
  private keys = { l: false, r: false, u: false, d: false };
  private el: HTMLDivElement | null = null;
  private box: HTMLDivElement | null = null;
  private c: CanvasRenderingContext2D | null = null;
  private drawT = 0; private hint = 0;
  private fr: MxFrame | null = null;
  private bcn: MxDecor | null = null;
  private touchId = -1; private tx = 0; private ty = 0;

  private nudge(dx: number, dy: number) {
    if (!this.active || this.end) return;
    const f = this.df, g = this.dg;
    this.df = clamp(this.df + dx); this.dg = clamp(this.dg + dy);
    this.turned += Math.abs(this.df - f) + Math.abs(this.dg - g);
  }
  private wheel = (e: WheelEvent) => { if (!this.active) return; e.preventDefault(); e.stopPropagation(); this.nudge(0, -Math.sign(e.deltaY) * 0.035); };
  private move = (e: PointerEvent) => {
    if (!this.active) return;
    if (e.pointerType === 'mouse') { this.nudge((e.movementX || 0) * 0.0026, -(e.movementY || 0) * 0.0026); return; }
    if (e.pointerId !== this.touchId) return;
    this.nudge((e.clientX - this.tx) * 0.0055, -(e.clientY - this.ty) * 0.0055);
    this.tx = e.clientX; this.ty = e.clientY;
  };
  private down = (e: PointerEvent) => {
    if (!this.active || e.pointerType === 'mouse') return;
    this.touchId = e.pointerId; this.tx = e.clientX; this.ty = e.clientY;
    e.preventDefault(); e.stopPropagation();
  };
  private up = (e: PointerEvent) => { if (e.pointerId === this.touchId) this.touchId = -1; };
  private kd = (e: KeyboardEvent) => {
    if (!this.active) return;
    const k = e.code === 'ArrowLeft' ? 'l' : e.code === 'ArrowRight' ? 'r' : e.code === 'ArrowUp' ? 'u' : e.code === 'ArrowDown' ? 'd' : '';
    if (!k) return;
    // the arrows turn the dials while the scope is up, not the unit's feet
    this.keys[k] = true; e.preventDefault(); e.stopPropagation();
  };
  private ku = (e: KeyboardEvent) => {
    const k = e.code === 'ArrowLeft' ? 'l' : e.code === 'ArrowRight' ? 'r' : e.code === 'ArrowUp' ? 'u' : e.code === 'ArrowDown' ? 'd' : '';
    if (k) this.keys[k] = false;
  };

  private build() {
    const el = this.el = document.createElement('div');
    el.className = 'mg-tuner mg-lock';
    const k = crispCanvas(W, H);
    this.c = k.c;
    const box = this.box = document.createElement('div'); box.className = 'mg-tuner-box';
    box.append(k.cv); el.append(box);
    box.addEventListener('pointerdown', this.down, { passive: false });
    if (mxOk()) {
      this.fr = mxFrame(box, (w, h) => ({ w, h, seed: 23, tone: 'olive', depth: 7, cut: 7, guards: false, rivets: false,
        wells: [{ x: SX - 2, y: SY - 2, w: SW + 4, h: SH + 4 }, { x: SX - 2, y: 52, w: SW + 4, h: 14 }, { x: 6, y: 8, w: 34, h: 34 }, { x: w - 40, y: 8, w: 34, h: 34 }],
        glands: [{ x: Math.round(w * 0.5), y: h - 4, col: 0x1a1a18, drop: 14 }], hazPaint: [{ x: 10, y: h - 11, w: 26, h: 5 }, { x: w - 36, y: h - 11, w: 26, h: 5 }],
        stencils: [{ text: 'FREQ', x: 23, y: 52, px: 8, align: 'center' }, { text: 'GAIN', x: w - 23, y: 52, px: 8, align: 'center' }] }), { pad: 12 });
      this.bcn = mxMount(box, 'beacon', { right: 26, top: -26, z: 3 }, { col: 'green', s: 0.75 });
    }
    document.body.append(el);
  }

  start(o: LockSpec) {
    if (this.active) return;
    const A = qteAssist();
    this.active = true; this.end = ''; this.endT = 0;
    this.diff = clamp(o.diff, 0, 4); this.ease = Math.max(0.5, (o.ease ?? 1) * (A.slow ? 1.35 : 1));
    this.seed = Math.random() * 100; this.t = 0; this.lock = 0; this.heat = 0; this.turned = 0; this.jf = this.jg = 0;
    this.T = clamp((2.2 + this.diff * 0.9) * (A.slow ? 1.3 : 1), 2, 7);
    this.tol = clamp((0.13 - this.diff * 0.016) * this.ease, 0.05, 0.24);
    this.jumpT = 1.4 + Math.random() * 1.2;
    // the signature, and the dials somewhere off it: there is always a little hunting to do
    this.tf = 0.15 + Math.random() * 0.7; this.tg = 0.2 + Math.random() * 0.6;
    const off = () => (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.2);
    this.df = clamp(this.tf + off(), 0.04, 0.96); this.dg = clamp(this.tg + off(), 0.04, 0.96);
    this.keys = { l: false, r: false, u: false, d: false };
    if (!this.el) this.build();
    try { this.hint = Number(localStorage.getItem('lp.lockHint') || 0); localStorage.setItem('lp.lockHint', String(this.hint + 1)); } catch { this.hint = 9; }
    this.el!.classList.remove('out', 'clean', 'fail', 'time'); void this.el!.offsetWidth; this.el!.classList.add('on');
    window.addEventListener('wheel', this.wheel, { capture: true, passive: false });
    window.addEventListener('pointermove', this.move, true);
    window.addEventListener('pointerup', this.up, true);
    window.addEventListener('pointercancel', this.up, true);
    window.addEventListener('keydown', this.kd, true);
    window.addEventListener('keyup', this.ku, true);
    this.draw();
  }

  /** one frame of the lock */
  step(dt: number): LockStep {
    const out = (): LockStep => ({ lock: this.lock, heat: this.heat, close: this.close, on: this.on, t: this.t, T: this.T, end: this.end, turned: this.turned });
    if (!this.active || this.end) return out();
    this.t += dt;
    const D = this.diff, E = this.ease;
    // held arrow keys turn the dials steadily
    const kr = 0.55 * dt;
    if (this.keys.l || this.keys.r) this.nudge(this.keys.r ? kr : -kr, 0);
    if (this.keys.u || this.keys.d) this.nudge(0, this.keys.u ? kr : -kr);
    // the signature wanders: slow swells, harder things faster; the worst jump about
    const sp = (0.1 + D * 0.065) / E;
    if (D >= 2.4) {
      this.jumpT -= dt;
      if (this.jumpT <= 0) {
        this.jumpT = (1.5 + Math.random() * 1.6) * E;
        this.jf = clamp(this.jf + (Math.random() < 0.5 ? -1 : 1) * (0.14 + Math.random() * 0.12), -0.3, 0.3);
        this.jg = clamp(this.jg + (Math.random() - 0.5) * 0.3, -0.25, 0.25);
      }
    }
    this.jf *= Math.max(0, 1 - dt * 0.18); this.jg *= Math.max(0, 1 - dt * 0.18);
    const wf = clamp(0.1 + 0.8 * (vn(this.t * sp, this.seed) * 0.85 + vn(this.t * sp * 3.3, this.seed + 9) * 0.15) + this.jf, 0.05, 0.95);
    const wg = clamp(0.14 + 0.72 * vn(this.t * sp * 0.8, this.seed + 21) + this.jg, 0.08, 0.92);
    this.tf += (wf - this.tf) * Math.min(1, dt * 2.4);
    this.tg += (wg - this.tg) * Math.min(1, dt * 2.4);
    const ef = Math.abs(this.df - this.tf) / this.tol, eg = Math.abs(this.dg - this.tg) / (this.tol * 1.15);
    const e = Math.max(ef, eg);
    this.onF = ef < 1; this.onG = eg < 1; this.on = e < 1;
    this.close = clamp(1 - e / 3);
    if (this.on) {
      this.lock = clamp(this.lock + (dt / (this.T * 0.55)) * (0.65 + 0.35 * (1 - e)));
      this.heat = Math.max(0, this.heat - dt * 0.5);
    } else {
      this.lock = Math.max(0, this.lock - dt * 0.12);
      if (e > 2) this.heat = clamp(this.heat + (dt * (0.1 + D * 0.055)) / E);
      else this.heat = Math.max(0, this.heat - dt * 0.15);
    }
    // phases: the signature rolls along; the scanner's trace slides against it until it is on
    this.phT += dt * (3 + D * 0.6);
    this.phS = this.on ? this.phS + (this.phT - this.phS) * Math.min(1, dt * 10) : this.phS + dt * (1.4 + (1 - this.close) * 3);
    this.bcn?.alert(this.on);
    if (this.lock >= 1) this.end = 'clean';
    else if (this.heat >= 1) this.end = 'fail';
    else if (this.t >= this.T) this.end = 'time';
    this.drawT -= dt;
    if (this.drawT <= 0 || this.end) { this.drawT = 1 / 30; this.draw(); }
    return out();
  }
  /** how full the lock cells are (0..1) */
  get quality() { return this.lock; }

  /** close the scope; a result flashes across it first */
  stop(end: LockEnd = '') {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('wheel', this.wheel, true);
    window.removeEventListener('pointermove', this.move, true);
    window.removeEventListener('pointerup', this.up, true);
    window.removeEventListener('pointercancel', this.up, true);
    window.removeEventListener('keydown', this.kd, true);
    window.removeEventListener('keyup', this.ku, true);
    this.touchId = -1;
    this.bcn?.alert(false);
    const el = this.el; if (!el) return;
    if (end) { this.end = end; this.endT = 1; this.draw(); el.classList.add(end); }
    el.classList.remove('on'); el.classList.add('out');
  }

  // ---------------------------------------------------------------- drawing
  private draw() {
    const c = this.c; if (!c) return;
    c.clearRect(0, 0, W, H);
    const t = this.t, end = this.end;
    if (!this.fr) {
      pxPlate(c, 1, 1, W - 4, H - 4, { tone: 'steel', chamfer: 6, screws: false, seed: 23 });
      rivet(c, 7, H - 10, 1, true); rivet(c, W - 10, H - 10, 1, true);
    }
    // ---- the scope
    const tint = end === 'fail' ? 0x1a0404 : end === 'clean' ? 0x063418 : 0x04100a;
    glass(c, SX, SY, SW, SH, tint);
    for (let i = 1; i < 8; i++) rect(c, SX + Math.round((i / 8) * SW), SY + 1, 1, SH - 2, GRN[1], 0.5);
    for (let j = 1; j < 4; j++) rect(c, SX + 1, SY + Math.round((j / 4) * SH), SW - 2, 1, GRN[1], j === 2 ? 0.8 : 0.4);
    const mid = SY + SH / 2, amp = SH / 2 - 3;
    const fq = (v: number) => 1.1 + v * 4.2, am = (v: number) => (0.18 + v * 0.8) * amp;
    // the signature (amber, dashed, jittered by the noise in it)
    const jit = 0.06 + this.diff * 0.03 + this.heat * 0.35;
    const tF = fq(this.tf), tA = am(this.tg);
    let py = -1;
    for (let x = 0; x < SW - 2; x++) {
      const u = x / (SW - 3);
      const n = (vn(x * 0.7 + t * 40, this.seed + 3) - 0.5) * jit * amp * 2;
      const y = Math.round(mid - Math.sin(u * Math.PI * 2 * tF + this.phT) * tA + n);
      if ((x >> 1) % 2 === 0 || this.on) {
        const a = Math.min(py < 0 ? y : py, y), b = Math.max(py < 0 ? y : py, y);
        rect(c, SX + 1 + x, clamp(a, SY + 1, SY + SH - 2), 1, Math.max(1, Math.min(b, SY + SH - 2) - Math.max(a, SY + 1) + 1), this.on ? AMB[6] : AMB[4], this.on ? 0.55 : 0.9);
      }
      py = y;
    }
    // the scanner's own trace (green; snaps onto the signature on the lock)
    const sF = fq(this.df), sA = am(this.dg);
    py = -1;
    const col = end === 'fail' ? RED[4] : this.on ? GRN[6] : GRN[4];
    for (let x = 0; x < SW - 2; x++) {
      const u = x / (SW - 3);
      const y = clamp(Math.round(mid - Math.sin(u * Math.PI * 2 * sF + this.phS) * sA), SY + 1, SY + SH - 2);
      const a = py < 0 ? y : Math.min(py, y), b = py < 0 ? y : Math.max(py, y);
      rect(c, SX + 1 + x, a, 1, b - a + 1, col);
      if (this.on) rect(c, SX + 1 + x, a - 1, 1, 1, GRN[5], 0.35);
      py = y;
    }
    // static: snow on the glass as the scanner overheats
    const snow = Math.round(18 + this.diff * 8 + this.heat * 300);
    for (let i = 0; i < snow; i++) {
      const sx = SX + 1 + Math.floor(Math.random() * (SW - 2)), sy = SY + 1 + Math.floor(Math.random() * (SH - 2));
      rect(c, sx, sy, 1, 1, this.heat > 0.6 && Math.random() < 0.4 ? RED[5] : GRN[5], 0.2 + this.heat * 0.6);
    }
    // the window draining along the top of the glass
    const left = end ? 0 : clamp(1 - t / this.T);
    rect(c, SX + 1, SY + 1, Math.round((SW - 2) * left), 1, left < 0.25 && Math.floor(t * 8) % 2 ? RED[5] : AMB[5], 0.9);
    // first few locks: the dials' directions pulse beside them (no words)
    if (this.hint < 3 && !end && t < 2.5 && Math.floor(t * 3) % 2 === 0) {
      chevron(c, DL.x - 17, DL.y, -1, 0); chevron(c, DL.x + 17, DL.y, 1, 0);
      chevron(c, DR.x, DR.y - 17, 0, -1); chevron(c, DR.x, DR.y + 17, 0, 1);
    }
    // ---- the dials
    dial(c, DL.x, DL.y, this.df, this.onF, end, t);
    dial(c, DR.x, DR.y, this.dg, this.onG, end, t);
    // ---- the lock cells
    const cells = 20, cw = Math.floor((SW - 2) / cells), cy = 55, filled = Math.round(this.lock * cells);
    rect(c, SX - 1, cy - 1, cells * cw + 1, 9, 0x050404);
    for (let i = 0; i < cells; i++) {
      const on = i < filled, R = end === 'fail' ? RED : i >= cells - 4 || end === 'clean' ? GRN : AMB;
      rect(c, SX + i * cw, cy, cw - 1, 7, on ? R[3] : GUN[2]);
      rect(c, SX + i * cw, cy, cw - 1, 1, on ? R[6] : GUN[4]);
      rect(c, SX + i * cw, cy + 5, cw - 1, 2, on ? R[2] : GUN[1]);
    }
    // ---- the heat bar under them (red, only once it builds)
    if (this.heat > 0.03 || end === 'fail') {
      const hw = Math.round((SW - 2) * (end === 'fail' ? 1 : this.heat));
      rect(c, SX, cy + 9, SW - 2, 2, 0x140404);
      rect(c, SX, cy + 9, hw, 2, this.heat > 0.7 && Math.floor(t * 10) % 2 ? RED[6] : RED[4]);
    }
    // ---- lamps: on the signature (green) / hunting (amber); overheating (red)
    pxLamp(c, SX - 8, cy + 3, end ? end !== 'fail' : this.on || Math.floor(t * 3) % 2 === 0, end === 'fail' ? RED : this.on || end === 'clean' ? GRN : AMB, 2);
    pxLamp(c, SX + SW + 6, cy + 3, this.heat > 0.4 || end === 'fail' ? Math.floor(t * 9) % 2 === 0 || end === 'fail' : false, RED, 2);
    // the result as light on the glass itself (a level bar of colour, no words, nothing tilted)
    if (end && this.endT > 0) {
      const R = end === 'clean' ? GRN : end === 'fail' ? RED : AMB;
      rect(c, SX, SY, SW, SH, R[4], 0.22);
      rect(c, SX, mid - 3, SW, 6, R[5], 0.85); rect(c, SX, mid - 1, SW, 2, R[6]);
    }
  }
}

/** a turned knob with a pointer, tick ring and an arc that lights when the dial is on the signature */
function dial(c: CanvasRenderingContext2D, cx: number, cy: number, v: number, on: boolean, end: LockEnd, t: number) {
  const r = DRAD;
  const a0 = -Math.PI * 0.75, a1 = Math.PI * 0.75, a = a0 + (a1 - a0) * v;
  // the arc of lamps round it
  for (let i = 0; i <= 18; i++) {
    const u = i / 18, aa = a0 + (a1 - a0) * u - Math.PI / 2;
    const x = Math.round(cx + Math.cos(aa) * (r + 4)), y = Math.round(cy + Math.sin(aa) * (r + 4));
    const near = Math.abs(u - v) < 0.06;
    const R = end === 'fail' ? RED : on ? GRN : AMB;
    rect(c, x, y, 1, 1, near ? R[6] : on ? R[2] : GUN[5], near ? 1 : 0.8);
  }
  // the knob: ink rim, a shaded body lit from the top left, knurling
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.5) continue;
    let tone: number;
    if (d > r - 1) tone = GUN[0];
    else {
      const l = (-x - y) / (r * 1.6);
      tone = GUN[clamp(Math.round(4 + l * 3), 2, 8)];
      if (d > r - 3) { const ang = Math.atan2(y, x) - a; if (Math.floor((ang / (Math.PI * 2)) * 24 + 48) % 2 === 0) tone = GUN[Math.max(1, clamp(Math.round(3 + l * 2), 1, 7))]; }
    }
    rect(c, cx + x, cy + y, 1, 1, tone);
  }
  rect(c, cx - 3, cy - 3, 7, 7, GUN[3]); rect(c, cx - 2, cy - 2, 5, 5, GUN[5]);
  // the pointer
  const pa = a - Math.PI / 2;
  for (let k = 3; k < r - 1; k++) rect(c, Math.round(cx + Math.cos(pa) * k), Math.round(cy + Math.sin(pa) * k), 1, 1, on ? GRN[6] : AMB[5]);
  if (on && Math.floor(t * 6) % 2 === 0) rect(c, Math.round(cx + Math.cos(pa) * (r - 2)), Math.round(cy + Math.sin(pa) * (r - 2)), 1, 1, 0xffffff);
}
function chevron(c: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number) {
  for (let i = 0; i < 3; i++) {
    const s = 2 - i;
    if (dx) { rect(c, x + dx * i, y - s, 1, s * 2 + 1, AMB[5]); }
    else { rect(c, x - s, y + dy * i, s * 2 + 1, 1, AMB[5]); }
  }
}

export const scanTuner = new ScanLock();

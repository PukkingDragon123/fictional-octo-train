// Dr. Calder's voice, made physical: the intercom plate the stage scenes show
// while she talks (the prologue's link chair, the run's handshake, the wake)
// and the phosphor scope in the loop tracker on the HUD (./tracker.ts). Every
// pixel drawn here at one CSS pixel: a brushed gunmetal plate with a bevel and
// Phillips screws, a speaker grille, a recessed green tube with a graticule
// and her waveform (it swings with the syllables of the line she is saying),
// a red talk lamp and a knurled knob. No flat boxes.
//
//   new Scope(w, h)              a bare tube (canvas) whose trace follows talk()
//   new Intercom(parent, o)      the whole plate (grille, tube, lamp, knob)
//   drawPlate(ctx, w, h, seed)   the plate body, for other pieces (the tracker)
//   drawRecess(ctx, x, y, w, h)  a sunk window in a plate
//   screw(ctx, x, y)
import { bitText } from '../../gfx/bitfont';
import { letterTimes } from '../../social/chipVoice';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function rnd(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; }
function shade(c: number, k: number): string {
  const r = Math.max(0, Math.min(255, ((c >> 16) & 255) + k)), g = Math.max(0, Math.min(255, ((c >> 8) & 255) + k)), b = Math.max(0, Math.min(255, (c & 255) + k));
  return `rgb(${r},${g},${b})`;
}

/** the plate body: a brushed gunmetal slab with stepped corners, a light top-left bevel and a dark bottom-right one */
export function drawPlate(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7, base = 0x3c4347) {
  const R = rnd(seed);
  for (let y = 0; y < h; y++) {
    // a gentle ramp, darker toward the bottom, and the brushed grain: each row its own tint
    const ramp = Math.round(10 - (y / h) * 22) + Math.round((R() - 0.5) * 7);
    ctx.fillStyle = shade(base, ramp);
    const cut = y === 0 || y === h - 1 ? 2 : y === 1 || y === h - 2 ? 1 : 0;
    ctx.fillRect(cut, y, w - cut * 2, 1);
    // streaks along the grain
    for (let i = 0; i < 3; i++) if (R() < 0.6) { ctx.fillStyle = shade(base, ramp + (R() < 0.5 ? 9 : -8)); ctx.fillRect(Math.floor(R() * w), y, 4 + Math.floor(R() * 26), 1); }
  }
  // wear: a few pits and scuffs
  for (let i = 0; i < (w * h) / 90; i++) { ctx.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.08)'; ctx.fillRect(2 + Math.floor(R() * (w - 4)), 2 + Math.floor(R() * (h - 4)), 1, 1); }
  // bevel
  ctx.fillStyle = shade(base, 58); ctx.fillRect(2, 0, w - 4, 1); ctx.fillRect(0, 2, 1, h - 4); ctx.fillRect(1, 1, 1, 1);
  ctx.fillStyle = shade(base, 30); ctx.fillRect(2, 1, w - 4, 1); ctx.fillRect(1, 2, 1, h - 4);
  ctx.fillStyle = shade(base, -38); ctx.fillRect(2, h - 1, w - 4, 1); ctx.fillRect(w - 1, 2, 1, h - 4); ctx.fillRect(w - 2, h - 2, 1, 1);
  ctx.fillStyle = shade(base, -22); ctx.fillRect(2, h - 2, w - 4, 1); ctx.fillRect(w - 2, 2, 1, h - 4);
}

/** a Phillips screw head, 5 px across */
export function screw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const P: [number, number, string][] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = dx * dx + dy * dy;
    if (d > 5) continue;
    const lit = dx + dy < 0;
    P.push([dx, dy, d >= 4 ? (lit ? '#2a2f31' : '#121516') : lit ? '#b8c0c2' : '#7d878a']);
  }
  for (const [dx, dy, c] of P) { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 1, 1); }
  ctx.fillStyle = '#2b3133'; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 1, y + 2, 1, 1);
}

/** a window sunk into the plate: a dark lip top-left, a lit lip bottom-right, the glass inside */
export function drawRecess(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glass = '#03130e') {
  ctx.fillStyle = '#0e1112'; ctx.fillRect(x + 1, y, w - 2, 1); ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillStyle = '#1b2023'; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = '#6c767a'; ctx.fillRect(x + 1, y + h - 1, w - 2, 1); ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = '#4c5458'; ctx.fillRect(x + 2, y + h - 2, w - 3, 1); ctx.fillRect(x + w - 2, y + 2, 1, h - 3);
  ctx.fillStyle = glass; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
}

/** a backing canvas sized in CSS pixels, drawn at the screen's density */
export function hiCanvas(w: number, h: number, cls = ''): { c: HTMLCanvasElement; x: CanvasRenderingContext2D; dpr: number } {
  const c = document.createElement('canvas');
  const dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
  c.width = w * dpr; c.height = h * dpr;
  c.style.width = w + 'px'; c.style.height = h + 'px';
  c.style.imageRendering = 'pixelated';
  if (cls) c.className = cls;
  const x = c.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.imageSmoothingEnabled = false;
  return { c, x, dpr };
}

// ================================================================== the tube
/** a phosphor tube whose trace swings with Dr. Calder's syllables while she talks */
export class Scope {
  readonly c: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private t = 0;
  private talkT = -1; private talkDur = 0; private times: number[] = []; private text = '';
  private amp = 0.04;
  /** 0 quiet .. 1 at full voice (the lamp reads it) */
  level = 0;
  label = '';
  constructor(public w: number, public h: number, private tint = '#9fffd8') {
    const k = hiCanvas(w, h, 'lp-scope');
    this.c = k.c; this.x = k.x;
  }
  /** a line starts: the trace follows its letters for `dur` seconds */
  talk(text: string, dur?: number) {
    const lt = letterTimes(text);
    this.text = text; this.times = lt.t; this.talkDur = Math.max(dur ?? 0, lt.dur); this.talkT = 0;
  }
  quiet() { this.talkT = -1; }
  get talking() { return this.talkT >= 0 && this.talkT < this.talkDur; }
  update(dt: number) {
    this.t += dt;
    let want = 0.035;
    if (this.talkT >= 0) {
      this.talkT += dt;
      if (this.talkT > this.talkDur) this.talkT = -1;
      else {
        // the letter being said: vowels open the trace, spaces and stops close it
        let i = 0; while (i < this.times.length - 1 && this.times[i + 1] <= this.talkT) i++;
        const ch = this.text[i] || ' ';
        want = ch === ' ' || /[.,;:!?-]/.test(ch) ? 0.12 : /[aeiouyAEIOUY]/.test(ch) ? 0.95 : 0.6;
        want *= 0.75 + 0.25 * Math.sin(this.t * 31);
      }
    }
    this.amp += (want - this.amp) * Math.min(1, dt * 18);
    this.level = Math.max(0, (this.amp - 0.035) / 0.9);
    this.draw();
  }
  private draw() {
    const x = this.x, W = this.w, H = this.h, t = this.t;
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#021a12'; x.fillRect(0, 0, W, H);
    // graticule
    x.fillStyle = 'rgba(80, 200, 150, .10)';
    for (let gx = 4; gx < W; gx += 8) x.fillRect(gx, 0, 1, H);
    for (let gy = (H / 2) % 8; gy < H; gy += 8) x.fillRect(0, Math.floor(gy), W, 1);
    x.fillStyle = 'rgba(120, 240, 190, .16)'; x.fillRect(0, Math.floor(H / 2), W, 1);
    // the trace: a column at a time, a bright core and a soft halo (pixel steps, no smoothing)
    const mid = H / 2, A = (H / 2 - 3) * this.amp;
    let prev = mid;
    const ys: number[] = [];
    for (let i = 0; i < W; i++) {
      const u = i / W;
      const env = Math.sin(u * Math.PI);
      const v = Math.sin(u * 23 + t * 17) * 0.55 + Math.sin(u * 51 - t * 29) * 0.3 + Math.sin(u * 7 + t * 5) * 0.25 + (Math.random() - 0.5) * 0.25 * this.amp;
      ys.push(Math.round(mid + v * A * (0.35 + 0.65 * env)));
    }
    for (let pass = 0; pass < 2; pass++) {
      x.fillStyle = pass === 0 ? 'rgba(90, 255, 190, .22)' : this.tint;
      prev = ys[0];
      for (let i = 0; i < W; i++) {
        const y = ys[i], a = Math.min(prev, y), b = Math.max(prev, y);
        if (pass === 0) x.fillRect(i, a - 1, 1, b - a + 3); else x.fillRect(i, a, 1, b - a + 1);
        prev = y;
      }
    }
    if (this.label) bitText(x, this.label, 3, 1, { font: 'small', color: 'rgba(150, 255, 210, .55)', outline: null });
    // scanlines, the glass's sheen, a dark rim
    x.fillStyle = 'rgba(0, 0, 0, .28)'; for (let y = 1; y < H; y += 2) x.fillRect(0, y, W, 1);
    x.fillStyle = 'rgba(255, 255, 255, .06)'; for (let i = 0; i < Math.min(W, H) * 0.7; i++) x.fillRect(2 + i, 1, Math.max(0, 10 - i * 0.6), 1);
    x.fillStyle = 'rgba(0, 0, 0, .35)'; x.fillRect(0, 0, W, 1); x.fillRect(0, 0, 1, H); x.fillRect(0, H - 1, W, 1); x.fillRect(W - 1, 0, 1, H);
  }
}

// ================================================================== the plate
const CSS = `
.lp-icom { position: absolute; left: 50%; bottom: calc(2.2vh + env(safe-area-inset-bottom)); transform: translateX(-50%) translateY(6px); pointer-events: none; opacity: 0; transition: opacity .35s, transform .35s;
  filter: drop-shadow(0 3px 0 rgba(0,0,0,.45)) drop-shadow(0 8px 14px rgba(0,0,0,.4)); width: 264px; height: 60px; }
.lp-icom.on { opacity: 1; transform: translateX(-50%); }
.lp-icom canvas { position: absolute; display: block; }
@media (max-height: 460px) { .lp-icom { bottom: 6px; } }
`;

/** the intercom plate the stage scenes put under her subtitles: grille, tube, talk lamp, knob */
export class Intercom {
  readonly el: HTMLDivElement;
  readonly scope: Scope;
  private lamp: { c: HTMLCanvasElement; x: CanvasRenderingContext2D };
  private raf = 0; private last = 0;
  private lampOn = -1;
  constructor(parent: HTMLElement, o: { label?: string } = {}) {
    if (!document.getElementById('lp-icom-css')) { const s = document.createElement('style'); s.id = 'lp-icom-css'; s.textContent = CSS; document.head.appendChild(s); }
    const W = 264, H = 60;
    const el = this.el = document.createElement('div');
    el.className = 'lp-icom';
    const body = hiCanvas(W, H);
    const x = body.x;
    drawPlate(x, W, H, 41);
    for (const [sx, sy] of [[5, 5], [W - 6, 5], [5, H - 6], [W - 6, H - 6]] as const) screw(x, sx, sy);
    // the speaker grille: drilled holes, each with its lit lower lip
    drawRecess(x, 12, 10, 50, 40, '#1a1f21');
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 7; gx++) {
      const hx = 16 + gx * 6 + (gy % 2) * 3, hy = 14 + gy * 6;
      if (hx > 57) continue;
      x.fillStyle = '#050607'; x.fillRect(hx, hy, 3, 3); x.fillRect(hx + 1, hy - 1, 1, 1);
      x.fillStyle = '#4f585c'; x.fillRect(hx + 1, hy + 3, 2, 1); x.fillRect(hx + 3, hy + 1, 1, 2);
    }
    // the tube's bezel, then the tube itself (its own canvas, redrawn while she talks)
    drawRecess(x, 68, 7, 156, 46);
    // the knob: knurled rim, a pointer line
    const kx = 244, ky = 41;
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 7.2) continue;
      const a = Math.atan2(dy, dx), lit = -(dx + dy) / 10;
      let c = d > 5.6 ? (Math.floor((a + Math.PI) * 6) % 2 ? 0x22272a : 0x50595d) : 0x3a4245;
      if (d <= 5.6) c = d > 4.6 ? 0x5d676b : 0x454d50;
      x.fillStyle = shade(c, Math.round(lit * 26)); x.fillRect(kx + dx, ky + dy, 1, 1);
    }
    x.fillStyle = '#d8dedf'; for (let i = 1; i < 5; i++) x.fillRect(kx + Math.round(Math.cos(-2.2) * i), ky + Math.round(Math.sin(-2.2) * i), 1, 1);
    // the stamped label
    bitText(x, o.label ?? 'TALK', kx, 1, { font: 'small', color: '#1b1f21', shadow: 'rgba(255,255,255,.18)', outline: null, align: 'center' });
    el.appendChild(body.c);
    // the tube
    this.scope = new Scope(152, 42);
    this.scope.label = 'CONTROL';
    this.scope.c.style.left = '70px'; this.scope.c.style.top = '9px';
    el.appendChild(this.scope.c);
    // the talk lamp (a jewelled red lens in a chrome bezel)
    const L = hiCanvas(11, 11);
    L.c.style.left = '239px'; L.c.style.top = '17px';
    this.lamp = { c: L.c, x: L.x };
    el.appendChild(L.c);
    parent.appendChild(el);
    this.paintLamp(0);
    this.last = performance.now();
    const loop = () => { this.raf = requestAnimationFrame(loop); const now = performance.now(); const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.update(dt); };
    this.raf = requestAnimationFrame(loop);
  }
  show(on = true) { this.el.classList.toggle('on', on); }
  /** a line starts */
  talk(text: string, dur?: number) { this.show(true); this.scope.talk(text, dur); }
  quiet() { this.scope.quiet(); }
  private update(dt: number) {
    if (!this.el.isConnected) { this.destroy(); return; }
    this.scope.update(dt);
    const k = Math.round(this.scope.level * 4) / 4;
    if (k !== this.lampOn) this.paintLamp(k);
  }
  private paintLamp(k: number) {
    this.lampOn = k;
    const x = this.lamp.x;
    x.clearRect(0, 0, 11, 11);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 5.3) continue;
      let c: string;
      if (d > 4) c = dx + dy < 0 ? '#c9d0d2' : '#4a5255';
      else {
        const lit = k > 0 ? 0.45 + k * 0.55 : 0.18;
        const r = Math.round(255 * lit), g = Math.round((dx + dy < -2 ? 150 : 50) * lit), b = Math.round(40 * lit);
        c = `rgb(${r},${g},${b})`;
        if (dx === -1 && dy === -2) c = k > 0 ? '#ffe2d0' : '#8a5a50';
      }
      x.fillStyle = c; x.fillRect(5 + dx, 5 + dy, 1, 1);
    }
    this.lamp.c.style.filter = k > 0 ? `drop-shadow(0 0 ${2 + k * 4}px rgba(255, 70, 40, ${0.5 + k * 0.4}))` : '';
  }
  destroy() { cancelAnimationFrame(this.raf); this.el.remove(); }
}
void hex;

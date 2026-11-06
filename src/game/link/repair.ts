// The link's repair mini-games, drawn as the operator's console feed over the
// unit's picture (a broadcast overlay: scanlines, phosphor, Alagard type, no
// panels). Two of them:
//   resync    LINK DESYNC: the unit's carrier has slipped off the rig's. Two
//             waves on an oscilloscope graticule: the rig's carrier (amber) and
//             the unit's (cyan). Drag across the screen (left / right: phase,
//             up / down: frequency) or use the arrows / WASD until they sit on
//             top of each other; hold them there and the lock fills.
//   breakers  LINK LOST: the rig tripped. Five breakers in a row under a sea of
//             static; the console shows the order the channels come back in.
//             Throw them in that order (click / tap, or keys 1-5); a wrong one
//             trips the lot and you start again.
// Repair.open(kind, stress, done) / close() / update(dt) / active.
import { G } from '../G';
import './link.css';
import { bevel, rivet, hazard, glass, drawBar, rect, GUN, GRN, AMB, RED } from '../../ui/hiPixel';
// Round 13: drawn at twice the old density (one canvas pixel per CSS pixel
// instead of 2-3 px blocks), the console's parts in the hi-res pixel kit
// (src/ui/hiPixel.ts): bevelled steel, rivets, lit lenses, a proper lock bar.

export type RepairKind = 'resync' | 'breakers';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ui = (k: string, v = 0.4) => G.audio?.ui?.(k, v);
const sfx = (k: string, v = 0.5) => G.audio?.flat?.(k, 'sfx', v);

export class Repair {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private hd: HTMLDivElement; private ft: HTMLDivElement;
  kind: RepairKind | null = null;
  private done: ((ok: boolean) => void) | null = null;
  private t = 0;
  private stress = 0;
  // ---- resync
  private fT = 3; private pT = 0; private f = 1.5; private p = 2; private lock = 0; private locked = false;
  private drag: { x: number; y: number; f: number; p: number } | null = null;
  private keys = new Set<string>();
  // ---- breakers
  private order: number[] = []; private step = 0; private on: boolean[] = [];
  private trip = 0; private wonT = -1; private flash: number[] = [];
  private rects: { x: number; y: number; w: number; h: number }[] = [];
  private offs: (() => void)[] = [];
  private u = 2;

  constructor(parent: HTMLElement) {
    const el = this.el = document.createElement('div');
    el.className = 'lk-rep';
    this.cv = document.createElement('canvas');
    this.cx = this.cv.getContext('2d')!;
    this.hd = document.createElement('div'); this.hd.className = 'lk-hd';
    this.ft = document.createElement('div'); this.ft.className = 'lk-ft';
    el.append(this.cv, this.hd, this.ft);
    el.style.display = 'none';
    parent.appendChild(el);
  }

  get active() { return !!this.kind; }

  open(kind: RepairKind, stress: number, done: (ok: boolean) => void) {
    this.close(false);
    this.kind = kind; this.done = done; this.t = 0; this.stress = stress;
    this.el.style.display = '';
    this.el.classList.toggle('lost', kind === 'breakers');
    requestAnimationFrame(() => this.el.classList.add('on'));
    if (kind === 'resync') {
      this.fT = 2 + Math.random() * 3; this.pT = Math.random() * TAU;
      // start well off it: another frequency, half a turn out
      this.f = this.fT + (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 0.9); this.f = clamp(this.f, 0.8, 6.2);
      this.p = this.pT + Math.PI * (0.6 + Math.random() * 0.6);
      this.lock = 0; this.locked = false;
      this.hd.innerHTML = '<small>OPERATOR CONSOLE · LINK 4</small><b>RESYNC</b>';
      this.footer('MATCH THE CARRIER', this.touch() ? 'drag: left / right shifts it, up / down tunes it' : 'drag the mouse, or arrows / WASD · Esc later');
      ui('watchUp', 0.3);
    } else {
      const n = stress > 0.85 ? 5 : 4;
      const all = [0, 1, 2, 3, 4];
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      this.order = all.slice(0, n); this.step = 0; this.on = [false, false, false, false, false]; this.flash = [0, 0, 0, 0, 0]; this.trip = 0; this.wonT = -1;
      this.hd.innerHTML = '<small>CARRIER LOST · UNIT UNSUPERVISED</small><b>RESTORE THE RIG</b>';
      this.sequence();
      sfx('mn_breaker', 0.7);
    }
    this.listen();
  }

  /** close it; ok: it was repaired (the callback runs only when it was not cancelled by a new open) */
  close(ok = false) {
    if (!this.kind) return;
    const cb = this.done; this.done = null; this.kind = null;
    for (const f of this.offs.splice(0)) f();
    this.keys.clear(); this.drag = null;
    this.el.classList.remove('on');
    setTimeout(() => { if (!this.kind) this.el.style.display = 'none'; }, 220);
    cb?.(ok);
  }

  private touch() { return document.documentElement.classList.contains('nc-touch') || matchMedia('(pointer: coarse)').matches; }
  private footer(big: string, small: string, cls = '') { this.ft.innerHTML = `<b class="${cls}">${big}</b><i>${small}</i>`; }
  private sequence() {
    const s = this.order.map((k, i) => `<span style="color:${i < this.step ? '#9cff8a' : i === this.step ? '#ffe7a8' : '#7f93a0'}">${k + 1}</span>`).join(' · ');
    this.footer(s, this.touch() ? 'tap the breakers in this order' : 'click the breakers in this order, or keys 1-5');
  }

  private listen() {
    const el = this.el;
    const down = (e: PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (this.kind === 'resync') { this.drag = { x: e.clientX, y: e.clientY, f: this.f, p: this.p }; el.setPointerCapture?.(e.pointerId); }
      else if (this.kind === 'breakers') { const i = this.rects.findIndex((r) => e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h); if (i >= 0) this.throwBreaker(i); }
    };
    const move = (e: PointerEvent) => {
      if (this.kind !== 'resync') return;
      const d = this.drag;
      // a mouse steers without a button held too (the console's trackball)
      if (!d) { if (e.pointerType === 'mouse') { this.p += e.movementX * 0.012; this.f = clamp(this.f - e.movementY * 0.008, 0.6, 6.6); } return; }
      this.p = d.p + (e.clientX - d.x) * 0.012;
      this.f = clamp(d.f - (e.clientY - d.y) * 0.01, 0.6, 6.6);
    };
    const up = () => { this.drag = null; };
    const kd = (e: KeyboardEvent) => {
      if (!this.kind) return;
      if (e.code === 'Escape') { if (this.kind === 'resync') { e.stopPropagation(); this.close(false); } return; }
      this.keys.add(e.code);
      if (this.kind === 'breakers') { const n = Number(e.key); if (n >= 1 && n <= 5) this.throwBreaker(n - 1); }
      if (/^(Arrow|Key[WASD]|Digit)/.test(e.code)) { e.preventDefault(); e.stopPropagation(); }
    };
    const ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    const enter = () => { G.input && (G.input.pointerOverUI = true); };
    const leave = () => { G.input && (G.input.pointerOverUI = false); };
    el.addEventListener('pointerenter', enter); el.addEventListener('pointerleave', leave);
    enter();
    this.offs.push(() => {
      el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true);
      el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave); leave();
    });
  }

  private throwBreaker(i: number) {
    if (this.wonT >= 0 || this.trip > 0) return;
    if (this.on[i]) return;
    if (this.order[this.step] === i) {
      this.on[i] = true; this.step++; this.flash[i] = 1;
      sfx('switch', 0.8); sfx('mn_relay', 0.35);
      this.sequence();
      if (this.step >= this.order.length) {
        this.wonT = 0;
        sfx('power_on', 0.6);
        this.footer('CARRIER RESTORED', 'the unit is yours again', 'ok');
      }
    } else {
      // the wrong one: the lot trips
      this.trip = 0.6; this.flash[i] = 1;
      sfx('cy_spark', 0.7); sfx('mn_breaker', 0.6);
      this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake');
      this.footer('TRIPPED', 'start again from the first', 'err');
    }
  }

  update(dt: number) {
    if (!this.kind) return;
    this.t += dt;
    const W = innerWidth, H = innerHeight;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    this.u = W > 2200 ? 2 : 1;
    if (this.kind === 'resync') this.stepResync(dt); else this.stepBreakers(dt);
  }

  // ================================================================ resync
  private stepResync(dt: number) {
    const k = this.keys;
    const kf = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    const kp = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    this.f = clamp(this.f + kf * dt * 1.6, 0.6, 6.6); this.p += kp * dt * 2.4;
    // the rig's carrier wanders (harder when the unit is frightened)
    this.pT += dt * (0.25 + this.stress * 0.9) * Math.sin(this.t * 0.7);
    this.fT += dt * Math.sin(this.t * 0.43) * (0.05 + this.stress * 0.15);
    this.fT = clamp(this.fT, 1.4, 5.6);
    const df = Math.abs(this.f - this.fT), dp = Math.abs(wrapPi(this.p - this.pT));
    const good = df < 0.18 && dp < 0.42;
    if (!this.locked) {
      this.lock = clamp(this.lock + (good ? dt / 1.3 : -dt * 0.8), 0, 1);
      if (good && Math.random() < dt * 8) ui('watchTick', 0.18);
      if (this.lock >= 1) {
        this.locked = true; this.wonT = 0;
        sfx('scanDone', 0.6); sfx('power_on', 0.4);
        this.footer('LOCKED', 'carrier matched', 'ok');
      }
    } else { this.wonT += dt; if (this.wonT > 0.9) { this.close(true); return; } }
    this.drawScope(df, dp, good);
  }

  private drawScope(df: number, dp: number, good: boolean) {
    const c = this.cx, W = this.cv.width, H = this.cv.height, u = this.u;
    c.clearRect(0, 0, W, H);
    // the console's picture: deep blue-black, scanlines, a vignette
    c.fillStyle = 'rgba(4, 10, 16, 0.86)'; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(30, 80, 110, 0.18)'); g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // the graticule: a band across the middle
    const x0 = Math.round(W * 0.08 / u) * u, x1 = Math.round(W * 0.92 / u) * u, cy = Math.round(H * 0.5 / u) * u, A = Math.round(Math.min(H * 0.14, 110) / u) * u;
    c.fillStyle = 'rgba(90, 170, 200, 0.12)';
    for (let gx = x0; gx <= x1; gx += 48) c.fillRect(gx, cy - A * 1.6, 1, A * 3.2);
    for (let gy = -3; gy <= 3; gy++) c.fillRect(x0, cy + Math.round(gy * A * 0.5), x1 - x0, 1);
    // minor ticks on the axes, the way a real graticule has them
    c.fillStyle = 'rgba(120, 200, 230, 0.22)';
    for (let gx = x0; gx <= x1; gx += 12) c.fillRect(gx, cy - 2, 1, 5);
    for (let gy = -12; gy <= 12; gy++) c.fillRect(Math.round((x0 + x1) / 2) - 2, cy + Math.round(gy * A * 0.125), 5, 1);
    // the two waves, drawn as pixels with a phosphor bloom
    const wave = (f: number, p: number, col: [number, number, number], jit: number) => {
      const pts: number[] = [];
      for (let x = x0; x <= x1; x += u) {
        const k = (x - x0) / (x1 - x0);
        const n = jit ? (Math.sin(x * 0.37 + this.t * 31) * 0.5 + Math.sin(x * 0.13 - this.t * 17)) * jit : 0;
        pts.push(Math.round((cy + Math.sin(k * TAU * f + p) * A + n) / u) * u);
      }
      for (const [r, a] of [[7, 0.06], [4, 0.12], [2, 0.3], [1, 0.6], [0, 1]] as [number, number][]) {
        c.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${a})`;
        let i = 0;
        for (let x = x0; x <= x1; x += u, i++) {
          const y = pts[i], yp = i ? pts[i - 1] : y;
          const ya = Math.min(y, yp), yb = Math.max(y, yp);
          c.fillRect(x - r * u, ya - r * u, u * (1 + r * 2), yb - ya + u * (1 + r * 2));
        }
      }
    };
    const lk = this.lock;
    const tgt: [number, number, number] = good ? [190, 255, 170] : [255, 180, 90];
    const mine: [number, number, number] = good ? [210, 255, 230] : [143, 232, 255];
    wave(this.fT, this.pT, tgt, 3 + this.stress * 6);
    wave(this.f, this.p, mine, this.locked ? 0 : 1.5 + Math.min(1, df + dp) * 4);
    // the lock: a riveted meter under the scope, its cells filling as the carriers hold together
    const tw = Math.min(440, Math.round(W * 0.5)), px0 = Math.round((W - tw) / 2), py = cy + A * 2 + 10;
    rect(c, px0 - 9, py - 7 + 34, tw + 18, 3, 0x000000, 0.35);
    bevel(c, px0 - 10, py - 8, tw + 20, 34, GUN.slice(2, 9), { chamfer: 3 });
    rivet(c, px0 - 5, py - 3, 2, true); rivet(c, px0 + tw + 4, py - 3, 2, true); rivet(c, px0 - 5, py + 20, 1); rivet(c, px0 + tw + 4, py + 20, 1);
    drawBar(c, px0 + 4, py, tw - 8, 14, lk, { ramp: this.locked ? GRN : good ? GRN : AMB, t: this.t, cell: 6, gap: 1, ticks: true });
    // read-outs, like the console prints them
    c.font = '16px Alagard, monospace'; c.textBaseline = 'top';
    c.fillStyle = '#7fb8d0';
    c.fillText(`FREQ ${this.f.toFixed(2)} / ${this.fT.toFixed(2)}`, x0, cy - A * 1.6 - 24);
    const pd = Math.round(dp / Math.PI * 180);
    const s = `PHASE ${pd}°`;
    c.fillText(s, x1 - c.measureText(s).width, cy - A * 1.6 - 24);
    this.scan(c, W, H);
  }

  // ================================================================ breakers
  private stepBreakers(dt: number) {
    if (this.trip > 0) {
      this.trip -= dt;
      if (this.trip <= 0) { this.on = this.on.map(() => false); this.step = 0; this.sequence(); }
    }
    if (this.wonT >= 0) { this.wonT += dt; if (this.wonT > 1.0) { this.close(true); return; } }
    for (let i = 0; i < 5; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 3);
    this.drawBreakers();
  }

  private drawBreakers() {
    const c = this.cx, W = this.cv.width, H = this.cv.height, u = this.u;
    c.clearRect(0, 0, W, H);
    // static: the unit's feed is gone; through it, nearly nothing
    const fade = this.wonT >= 0 ? Math.max(0, 1 - this.wonT / 0.9) : 1;
    c.fillStyle = `rgba(3, 4, 6, ${0.8 * fade})`; c.fillRect(0, 0, W, H);
    const s = 4; // static grain (kept coarse: it is noise, and cheap)
    for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
      const v = Math.random();
      if (v < 0.45) continue;
      const l = Math.round(60 + v * 170);
      c.fillStyle = `rgba(${l}, ${l}, ${Math.min(255, l + 12)}, ${0.22 * fade})`;
      c.fillRect(x, y, s, s);
    }
    // the rack: five breakers on a steel plate
    const bw = Math.round(Math.min(W * 0.11, 92)), bh = Math.round(bw * 2.1), gap = Math.round(bw * 0.45);
    const tw = bw * 5 + gap * 4, x0 = Math.round((W - tw) / 2), y0 = Math.round(H * 0.5 - bh * 0.42);
    const pl = 14;
    // the steel plate: bevelled, riveted, a hazard strip along the top
    rect(c, x0 - pl + 4, y0 + bh + pl + 2, tw + pl * 2, 5, 0x000000, 0.4);
    bevel(c, x0 - pl, y0 - pl - 10, tw + pl * 2, bh + pl * 2 + 10, GUN.slice(1, 8), { chamfer: 4 });
    hazard(c, x0 - pl + 12, y0 - pl - 6, tw + pl * 2 - 24, 6, 0xe8b52a, 0x17150f, 8, this.t * 0);
    rect(c, x0 - pl + 12, y0 - pl - 7, tw + pl * 2 - 24, 1, GUN[0]); rect(c, x0 - pl + 12, y0 - pl, tw + pl * 2 - 24, 1, GUN[6]);
    for (const [sx, sy] of [[x0 - pl + 6, y0 - pl - 4], [x0 + tw + pl - 7, y0 - pl - 4], [x0 - pl + 6, y0 + bh + pl - 7], [x0 + tw + pl - 7, y0 + bh + pl - 7]]) rivet(c, sx, sy, 2, true);
    this.rects = [];
    c.font = '32px Alagard, monospace'; c.textBaseline = 'top';
    const tripped = this.trip > 0;
    for (let i = 0; i < 5; i++) {
      const x = x0 + i * (bw + gap), y = y0;
      this.rects.push({ x: x - gap / 2, y: y - pl, w: bw + gap, h: bh + pl * 2 });
      const on = this.on[i] && !tripped;
      // housing: a bevelled steel box with a vent grille at the foot
      bevel(c, x, y, bw, bh, GUN.slice(3, 10), { chamfer: 3 });
      for (let v = 0; v < 4; v++) { rect(c, x + 8, y + bh - 14 + v * 3, bw - 16, 1, GUN[1]); rect(c, x + 8, y + bh - 13 + v * 3, bw - 16, 1, GUN[7], 0.5); }
      // the lamp: a domed lens in a black ring, glowing when it is lit
      const lamp = on ? GRN : tripped ? RED : [0x1a0604, 0x3a0c08, 0x5a1a10, 0x8e2a1c, 0xb04030, 0xd07060, 0xe8a090];
      const fl = this.flash[i];
      const lr = Math.max(5, Math.round(bw * 0.15)), lx = Math.round(x + bw / 2), ly = Math.round(y + 10 + lr);
      if (on || tripped || fl > 0) { c.globalAlpha = 0.16 + fl * 0.3; c.fillStyle = '#' + lamp[4].toString(16).padStart(6, '0'); c.beginPath(); c.arc(lx, ly, lr * 2.4, 0, TAU); c.fill(); c.globalAlpha = 1; }
      for (let j = -lr - 2; j <= lr + 2; j++) for (let k2 = -lr - 2; k2 <= lr + 2; k2++) {
        const d = Math.hypot(k2, j);
        if (d > lr + 1.6) continue;
        if (d > lr) { rect(c, lx + k2, ly + j, 1, 1, 0x07060a); continue; }
        const l = (-(k2 + j) / (lr * 2)) * 0.9 + 0.45 - d / lr * 0.25;
        const tone = l > 0.75 ? 6 : l > 0.55 ? 5 : l > 0.35 ? 4 : l > 0.15 ? 3 : 2;
        rect(c, lx + k2, ly + j, 1, 1, lamp[on || tripped ? tone : Math.max(1, tone - 2)]);
      }
      rect(c, lx - Math.round(lr * 0.45), ly - Math.round(lr * 0.55), Math.max(1, Math.round(lr * 0.35)), 1, 0xffffff, 0.85);
      // the slot and the lever (up: on)
      const sw = 8, sx = Math.round(x + bw / 2 - sw / 2), sy = Math.round(y + bh * 0.33), sh = Math.round(bh * 0.5);
      glass(c, sx, sy, sw, sh, 0x050608);
      const k = on ? 0.12 : 0.88;
      const hy = Math.round(sy + sh * k - 10);
      bevel(c, x + 6, hy, bw - 12, 20, on ? [0x5a646c, 0x8a949c, 0xb4bec4, 0xd8dee2, 0xeef2f4, 0xffffff] : [0x5a1410, 0x7a2018, 0xa0342a, 0xb8423a, 0xd06050, 0xe88a7a], { chamfer: 2 });
      for (let g2 = 0; g2 < 3; g2++) rect(c, x + 12, hy + 6 + g2 * 3, bw - 24, 1, 0x000000, 0.22);
      // its number on a little engraved tag
      const lab = String(i + 1);
      const tw2 = c.measureText(lab).width;
      bevel(c, Math.round(x + bw / 2 - 14), y + bh + pl + 4, 28, 34, [0x2a2418, 0x4a3e28, 0x6a5a3a, 0x8a7850, 0xb09a68, 0xd8c48a], { chamfer: 2 });
      c.fillStyle = '#1a140a';
      c.fillText(lab, Math.round(x + bw / 2 - tw2 / 2) + 1, y + bh + pl + 7);
      c.fillStyle = '#fff4d0';
      c.fillText(lab, Math.round(x + bw / 2 - tw2 / 2), y + bh + pl + 6);
    }
    this.scan(c, W, H);
  }

  /** the console's scanlines and a rolling bar */
  private scan(c: CanvasRenderingContext2D, W: number, H: number) {
    const u = this.u;
    c.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < H; y += u * 2) c.fillRect(0, y, W, u);
    const by = ((this.t * 90) % (H + 120)) - 60;
    c.fillStyle = 'rgba(160, 220, 255, 0.035)'; c.fillRect(0, by, W, 60);
  }

  destroy() { this.close(false); this.el.remove(); }
}

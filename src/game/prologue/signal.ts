// The link, as a transition: no room, no chair. The operator's feed comes up
// on the unit like an old set switching on (a dot, a line, the picture opening
// into snow), the shock goes down the wire (a white frame, the snow tearing,
// the bars rolling), the signal locks, and the picture collapses to a line and
// a dot like a tube switching off; under it, black, and then the unit's own
// eyes (the intake cinematic, src/game/intro.ts).
//
//   const s = new SignalWipe(parent, { onShock })   // starts at once
//   s.update(dt) -> true once it is over (black underneath)   s.destroy()
//   SIGNAL_DUR   how long it runs (s)
import { G } from '../G';

export const SIGNAL_DUR = 2.35;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };

const CSS = `
.sg-root { position: absolute; inset: 0; pointer-events: none; z-index: 40; background: #000; overflow: hidden; }
.sg-tube { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform, filter; }
.sg-tube canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.sg-tube .sg-bar { position: absolute; left: 0; right: 0; height: 22%; background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.55) 40%, rgba(0,0,0,.55) 60%, rgba(0,0,0,0)); mix-blend-mode: multiply; }
.sg-tube .sg-scan { position: absolute; inset: 0; background: repeating-linear-gradient(rgba(0,0,0,.28) 0 2px, rgba(0,0,0,0) 2px 4px); }
.sg-tube .sg-vig { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.75) 100%); }
.sg-flash { position: absolute; inset: 0; background: #eaf6ff; opacity: 0; mix-blend-mode: screen; }
.sg-osd { position: absolute; left: calc(32px + env(safe-area-inset-left)); top: calc(28px + env(safe-area-inset-top)); font-family: var(--font-new); font-size: 32px; line-height: 32px;
  color: #e8f4ff; text-shadow: 2px 2px 0 #000, -2px 0 0 rgba(255, 60, 60, .55), 2px 0 0 rgba(60, 200, 255, .55); letter-spacing: 2px; opacity: 0; }
.sg-osd small { display: block; font-size: 16px; line-height: 16px; margin-top: 6px; color: #b8d8ea; letter-spacing: 3px; }
`;

export class SignalWipe {
  readonly el: HTMLDivElement;
  private tube: HTMLDivElement; private cv: HTMLCanvasElement; private bar: HTMLDivElement; private flash: HTMLDivElement; private osd: HTMLDivElement;
  private t = 0;
  private fired = new Set<number>();
  private rowOff: Float32Array = new Float32Array(0);
  private done = false;

  constructor(parent: HTMLElement, private o: { onShock?: () => void; label?: string } = {}) {
    if (!document.getElementById('sg-css')) { const s = document.createElement('style'); s.id = 'sg-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = (cls: string, tag = 'div') => { const e = document.createElement(tag); e.className = cls; return e; };
    this.el = el('sg-root') as HTMLDivElement;
    this.tube = el('sg-tube') as HTMLDivElement;
    this.cv = document.createElement('canvas');
    this.bar = el('sg-bar') as HTMLDivElement;
    this.tube.append(this.cv, this.bar, el('sg-scan'), el('sg-vig'));
    this.flash = el('sg-flash') as HTMLDivElement;
    this.osd = el('sg-osd') as HTMLDivElement;
    this.osd.innerHTML = `LINK<small>${o.label ?? 'MERIDIAN · CH 04'}</small>`;
    this.el.append(this.tube, this.flash, this.osd);
    parent.appendChild(this.el);
    this.paint();
  }

  private at(t: number, id: number, fn: () => void) { if (this.t >= t && !this.fired.has(id)) { this.fired.add(id); fn(); } }
  private sfx(k: string, v: number) { G.audio?.flat?.(k, 'sfx', v); }

  /** true once it is over */
  update(dt: number): boolean {
    if (this.done) return true;
    this.t += Math.min(dt, 0.05);
    this.at(0.02, 1, () => this.sfx('ix_ring', 0.35));
    this.at(0.2, 2, () => { this.sfx('static_burst', 0.75); });
    this.at(0.82, 3, () => { this.sfx('band_shock', 0.9); this.sfx('cy_spark', 0.7); this.o.onShock?.(); });
    this.at(1.55, 4, () => this.sfx('static_burst', 0.4));
    this.at(1.78, 5, () => this.sfx('holo_off', 0.5));
    this.paint();
    if (this.t >= SIGNAL_DUR) { this.done = true; return true; }
    return false;
  }

  private paint() {
    const t = this.t;
    // the tube's shape: a dot, a line, open; then the collapse back to a line and a dot
    let sx = 1, sy = 1, bright = 1;
    if (t < 0.18) { sx = 0.02 + ease(t / 0.18) * 0.98; sy = 0.006; bright = 2.4; }
    else if (t < 0.42) { sx = 1; sy = 0.006 + ease((t - 0.18) / 0.24) * 0.994; bright = 2.4 - ease((t - 0.18) / 0.24) * 1.4; }
    else if (t < 1.55) { sx = 1; sy = 1; bright = 1; }
    else if (t < 1.76) { const k = ease((t - 1.55) / 0.21); sx = 1; sy = 1 - k * 0.994; bright = 1 + k * 2.2; }
    else if (t < 1.98) { const k = ease((t - 1.76) / 0.22); sx = 1 - k * 0.995; sy = 0.006; bright = 3.2; }
    else { sx = 0; sy = 0; }
    // the shock: the whole picture jolts
    const shock = t > 0.82 && t < 1.25 ? 1 - (t - 0.82) / 0.43 : 0;
    const jx = shock ? (Math.random() - 0.5) * 30 * shock : 0, jy = shock ? (Math.random() - 0.5) * 18 * shock : 0;
    this.tube.style.transform = `translate(${jx.toFixed(1)}px, ${jy.toFixed(1)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    this.tube.style.filter = `brightness(${bright.toFixed(2)}) contrast(${(1.1 + shock * 0.6).toFixed(2)})`;
    this.tube.style.opacity = t >= 1.98 ? '0' : '1';
    this.flash.style.opacity = (t > 0.82 && t < 1.05 ? 0.95 * (1 - (t - 0.82) / 0.23) : 0).toFixed(3);
    this.bar.style.top = (((t * 1.7) % 1.3) * 100 - 25).toFixed(1) + '%';
    // the OSD blinks while the picture is up
    this.osd.style.opacity = t > 0.45 && t < 1.5 && Math.floor(t * 6) % 3 !== 0 ? '1' : '0';
    if (sx > 0 && t < 1.98) this.snow(shock, t > 1.1 && t < 1.5 ? (t - 1.1) / 0.4 : 0);
  }

  /** the snow: blue-white noise, rows torn sideways (harder on the shock), the signal half locking at the end */
  private snow(shock: number, lock: number) {
    const c = this.cv, x = c.getContext('2d');
    if (!x) return;
    const W = Math.max(64, Math.ceil(innerWidth / 3)), H = Math.max(48, Math.ceil(innerHeight / 3));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; this.rowOff = new Float32Array(H); }
    const img = x.createImageData(W, H), d = img.data;
    // torn rows: a few bands slide
    for (let y = 0; y < H; y++) {
      const band = Math.floor(y / 6);
      const r = Math.sin(band * 12.9898 + Math.floor(this.t * 20) * 78.233) * 43758.5453;
      const f = r - Math.floor(r);
      this.rowOff[y] = f > 0.82 ? (f - 0.82) * W * (0.6 + shock * 2) : 0;
    }
    const roll = (this.t * 0.9) % 1;
    for (let y = 0; y < H; y++) {
      const off = this.rowOff[y] | 0;
      // a soft horizontal hum band rolling down
      const hum = 1 - 0.35 * Math.max(0, 1 - Math.abs(y / H - roll) * 6);
      for (let xx = 0; xx < W; xx++) {
        const i = (y * W + ((xx + off) % W)) * 4;
        let v = Math.random();
        v = v * v * 255 * hum;
        // locking: the snow thins toward a cold grey field with a lighter centre
        if (lock > 0) { const cx = xx / W - 0.5, cy = y / H - 0.5; const g = 60 + 90 * Math.max(0, 1 - (cx * cx + cy * cy) * 3); v = v * (1 - lock * 0.7) + g * lock * 0.7; }
        d[i] = v * 0.86; d[i + 1] = v * 0.95; d[i + 2] = Math.min(255, v * 1.08 + 14); d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }

  destroy() { this.el.remove(); }
}

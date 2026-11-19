// THE SPOTLIGHT (round 19): the forced tutorial's one-thing-at-a-time view. The screen goes dark except a round
// pool of light on the thing to do; its edge is dithered in the game's pixel grain (a 4 x 4 ordered threshold at a
// third of the screen's resolution), brass pixel corner pieces glint round it (src/ui/menus/guide/tourArt.ts), and
// the key to press stands under it as a pixel key cap that lights when it is pressed. No boxes, no text.
//   const s = new Spotlight();  s.on(() => ({ x, y, r }));  s.keys(['E']);  s.off();  s.update(dt);  s.dispose();
import { cornerSheet, CORNER, CORNER_F, capEl } from '../../ui/menus/guide/tourArt';

export interface SpotAt { x: number; y: number; r: number }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const DOWN = 3; // screen px per mask px

export class Spotlight {
  readonly el = document.createElement('div');
  private cv = document.createElement('canvas');
  private ring = document.createElement('div');
  private capRow = document.createElement('div');
  private at: (() => SpotAt | null) | null = null;
  private k = 0; // fade 0..1
  private cur: SpotAt = { x: 0, y: 0, r: 80 };
  private img: ImageData | null = null;
  private dim = 0.74;

  constructor() {
    this.el.className = 'spot';
    this.cv.className = 'spot-cv';
    this.ring.className = 'spot-ring';
    const u = cornerSheet();
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('i');
      Object.assign(c.style, { width: CORNER * 2 + 'px', height: CORNER * 2 + 'px', backgroundImage: `url(${u})`, backgroundSize: `${CORNER * 2}px ${CORNER * 2 * CORNER_F}px` });
      c.style.setProperty('--cs', CORNER * 2 + 'px'); c.style.setProperty('--cf', String(CORNER_F));
      this.ring.append(c);
    }
    this.capRow.className = 'spot-caps';
    this.el.append(this.cv, this.ring, this.capRow);
    document.body.append(this.el);
    if (!document.getElementById('spot-css')) {
      const st = document.createElement('style'); st.id = 'spot-css';
      st.textContent = `.spot { position: fixed; inset: 0; z-index: 63; pointer-events: none; }
body:has(.spot.on) .ct-layer, body:has(.spot.on) .ft-subs { z-index: 64; }
.spot-cv { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0; transition: opacity .35s ease; }
.spot.on .spot-cv { opacity: 1; }
.spot-ring { position: absolute; left: 0; top: 0; opacity: 0; transition: opacity .25s steps(3); }
.spot.on .spot-ring.vis { opacity: 1; animation: spot-pulse 1.2s steps(4) infinite; }
.spot-ring i { position: absolute; image-rendering: pixelated; background-repeat: no-repeat; filter: drop-shadow(2px 2px 0 rgba(11,10,7,.8)) drop-shadow(0 0 5px rgba(255,190,70,.45)); animation: spot-glint .9s steps(var(--cf)) infinite; }
.spot-ring i:nth-child(1) { left: 0; top: 0; } .spot-ring i:nth-child(2) { right: 0; top: 0; transform: scaleX(-1); }
.spot-ring i:nth-child(3) { left: 0; bottom: 0; transform: scaleY(-1); } .spot-ring i:nth-child(4) { right: 0; bottom: 0; transform: scale(-1,-1); }
@keyframes spot-glint { from { background-position: 0 0; } to { background-position: 0 calc(var(--cs) * var(--cf) * -1); } }
@keyframes spot-pulse { 50% { transform: scale(1.04); } }
.spot-caps { position: absolute; left: 0; top: 0; display: flex; gap: 4px; transform: translate(-50%, 0); opacity: 0; transition: opacity .25s; }
.spot.on .spot-caps.vis { opacity: 1; }
.spot-caps .tcap { background-position: 0 0; filter: drop-shadow(0 3px 0 rgba(11,10,7,.6)); }
.spot-caps .tcap.hot { background-position: 0 calc(var(--ch) * -1); }
.spot-caps .tcap.down { background-position: 0 calc(var(--ch) * -2); }
.spot-caps.wasd { display: grid; grid-template-columns: repeat(3, auto); }
.spot-caps.wasd .tcap:nth-child(1) { grid-column: 2; }`;
      document.head.append(st);
    }
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }

  /** light this (a screen point and a radius, read every frame; null: the whole screen dims with no pool) */
  on(at: (() => SpotAt | null) | null, dim = 0.74) { this.at = at; this.dim = dim; this.el.classList.add('on'); }
  off() { this.at = null; this.el.classList.remove('on'); this.keys(null); }
  get active() { return this.el.classList.contains('on'); }
  /** the key caps under the pool (null: none) */
  keys(keys: string[] | null) {
    this.capRow.replaceChildren(...(keys ?? []).map((k) => { const c = capEl(k, 2); c.dataset.k = k; return c; }));
    this.capRow.classList.toggle('wasd', !!keys && keys.join('') === 'WASD');
    this.capRow.classList.toggle('vis', !!keys?.length);
  }
  private onKey = (e: KeyboardEvent) => {
    const k = e.code.replace(/^Key|^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift');
    this.capRow.querySelectorAll<HTMLElement>('.tcap').forEach((c) => { if (c.dataset.k === k) c.classList.add('down'); });
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.code.replace(/^Key|^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift');
    this.capRow.querySelectorAll<HTMLElement>('.tcap').forEach((c) => { if (c.dataset.k === k) c.classList.remove('down'); });
  };

  update(dt: number) {
    const want = this.active ? 1 : 0;
    this.k += (want - this.k) * Math.min(1, dt * 6);
    if (this.k < 0.01 && !this.active) return;
    const a = this.at?.() ?? null;
    if (a) {
      const s = Math.min(1, dt * 10);
      this.cur.x += (a.x - this.cur.x) * s; this.cur.y += (a.y - this.cur.y) * s; this.cur.r += (a.r - this.cur.r) * s;
    }
    this.draw(!!a);
    // the brackets and the caps follow the pool
    const r = Math.round(this.cur.r), S = r * 2;
    this.ring.classList.toggle('vis', !!a);
    Object.assign(this.ring.style, { left: Math.round(this.cur.x - r) + 'px', top: Math.round(this.cur.y - r) + 'px', width: S + 'px', height: S + 'px' });
    Object.assign(this.capRow.style, { left: Math.round(this.cur.x) + 'px', top: Math.round(this.cur.y + r + 10) + 'px' });
    // a slow glow on the waiting caps
    const lit = Math.floor(performance.now() / 600) % 2 === 0;
    this.capRow.querySelectorAll<HTMLElement>('.tcap:not(.down)').forEach((c) => c.classList.toggle('hot', lit));
  }

  /** the dark with its dithered pool, at a third of the screen's resolution */
  private draw(pool: boolean) {
    const W = Math.ceil(innerWidth / DOWN), H = Math.ceil(innerHeight / DOWN);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.img = null; }
    const g = this.cv.getContext('2d')!;
    this.img ??= g.createImageData(W, H);
    const d = this.img.data;
    const cx = this.cur.x / DOWN, cy = this.cur.y / DOWN, r = this.cur.r / DOWN, edge = Math.max(4, r * 0.35);
    const A = Math.round(255 * this.dim);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let a = A;
      if (pool) {
        const dd = Math.hypot(x - cx, y - cy);
        if (dd < r) a = 0;
        else if (dd < r + edge) {
          // the edge: an ordered dither from light to dark, and a thin warm rim right at the pool
          const t = (dd - r) / edge;
          a = BAYER[(y & 3) * 4 + (x & 3)] / 16 < t ? A : 0;
          if (dd - r < 1.2) { d[i] = 255; d[i + 1] = 196; d[i + 2] = 96; d[i + 3] = 90; continue; }
        }
      }
      d[i] = 6; d[i + 1] = 7; d[i + 2] = 10; d[i + 3] = a;
    }
    g.putImageData(this.img, 0, 0);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.el.remove();
  }
}

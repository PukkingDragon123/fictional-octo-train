// Blood on the lens. A close, wet hit flicks drops onto the camera: a few
// fat beads and a fine mist, drawn at very low resolution and scaled up with
// hard pixels so it sits with the rest of the picture. Heavy drops sag and
// run down before they thin out and dry away. A small canvas laid over the
// game, cleared and hidden when nothing is on it.
import { G } from '../game/G';

interface Drop { x: number; y: number; r: number; vy: number; life: number; max: number; trail: number; col: number; mist: boolean }

const W = 320, H = 180;
/** radii and speeds were tuned at 192 px across */
const S = W / 192;

export class LensBlood {
  private cv: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private drops: Drop[] = [];
  private img: ImageData | null = null;
  private acc = 0;
  private shown = false;

  private ensure() {
    if (this.cv || typeof document === 'undefined') return;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.className = 'gore-lens';
    Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', imageRendering: 'pixelated', zIndex: '4', display: 'none' } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(cv);
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.img = this.ctx?.createImageData(W, H) ?? null;
  }

  /** blood hits the lens: amount 0..1 (how close and how wet), side -1..1 biases where */
  splash(amount: number, side = 0, col = 0x8a1214) {
    const lv = G.sandbox.gore ?? 2;
    if (lv <= 0 || amount <= 0.02) return;
    this.ensure();
    if (!this.cv) return;
    const k = Math.min(1, amount) * (lv >= 2 ? 1 : 0.5);
    const big = Math.round(1 + k * 4), fine = Math.round(4 + k * 16);
    // one flick of blood: drops clustered round where it came from, a fine spray fanning out
    const cx = W * (0.5 + side * 0.3 + (Math.random() - 0.5) * 0.3), cy = H * (0.25 + Math.random() * 0.45);
    for (let i = 0; i < big; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.pow(Math.random(), 0.7) * W * 0.16 * (0.5 + k);
      const r = (1.6 + Math.random() * (1.5 + k * 3.5)) * S;
      this.add(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r, col, false);
    }
    for (let i = 0; i < fine; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.pow(Math.random(), 0.5) * W * 0.26;
      this.add(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, (0.6 + Math.random() * 0.8) * S, col, true);
    }
    if (this.drops.length > 140) this.drops.splice(0, this.drops.length - 140);
  }

  private add(x: number, y: number, r: number, col: number, mist: boolean) {
    const max = mist ? 3 + Math.random() * 3 : 6 + Math.random() * 6;
    this.drops.push({ x, y, r, vy: 0, life: max, max, trail: 0, col, mist });
  }

  clear() { this.drops.length = 0; this.draw(); }

  update(dt: number) {
    if (!this.drops.length) { if (this.shown) { this.draw(); } return; }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      if (d.life <= 0) { this.drops.splice(i, 1); continue; }
      // big drops sag, then run, leaving a thinning trail
      if (!d.mist && d.r > 2.4 * S && d.max - d.life > 0.6) {
        d.vy = Math.min(9 * S, d.vy + dt * (d.r * 1.4));
        const dy = d.vy * dt;
        d.y += dy; d.trail = Math.min(40 * S, d.trail + dy);
        d.r = Math.max(1.2 * S, d.r - dy * 0.06);
      }
    }
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    this.draw();
  }

  private draw() {
    const cv = this.cv, ctx = this.ctx, img = this.img;
    if (!cv || !ctx || !img) return;
    if (!this.drops.length) { cv.style.display = 'none'; this.shown = false; return; }
    if (!this.shown) { cv.style.display = 'block'; this.shown = true; }
    const D = img.data;
    D.fill(0);
    const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      if (D[i + 3] >= a) return;
      D[i] = r; D[i + 1] = g; D[i + 2] = b; D[i + 3] = a;
    };
    for (const d of this.drops) {
      const fade = Math.min(1, d.life / (d.max * 0.35));
      const R = (d.col >> 16) & 255, Gc = (d.col >> 8) & 255, B = d.col & 255;
      const aBody = Math.round((d.mist ? 150 : 215) * fade), aEdge = Math.round(aBody * 0.75);
      // trail first (thin, fading upward)
      for (let t = 0; t < d.trail; t++) {
        const w = Math.max(0, d.r * 0.45 * (1 - t / (d.trail + 1)));
        for (let k = -Math.round(w); k <= Math.round(w); k++) put(d.x + k, d.y - t, R * 0.8, Gc * 0.8, B * 0.8, Math.round(aEdge * (1 - t / (d.trail + 6))));
      }
      const r = d.r, r2 = r * r;
      const seed = (d.max * 1000) | 0;
      if (r < 2.2) {
        // a speck: one to three pixels in an irregular clump (a tiny pixel circle reads as a "+")
        put(d.x, d.y, R * 0.8, Gc * 0.8, B * 0.8, aBody);
        if (r > 1.1) put(d.x + (seed & 1 ? 1 : -1), d.y, R * 0.6, Gc * 0.6, B * 0.6, aEdge);
        if (r > 1.6) put(d.x, d.y + (seed & 2 ? 1 : -1), R * 0.6, Gc * 0.6, B * 0.6, aEdge);
        continue;
      }
      for (let y = -Math.ceil(r) - 1; y <= Math.ceil(r) + 1; y++) for (let x = -Math.ceil(r) - 1; x <= Math.ceil(r) + 1; x++) {
        // lumpy edge: a cheap angular wobble per drop
        const ang = Math.atan2(y, x);
        const wob = 1 + 0.22 * Math.sin(ang * 3 + seed) + 0.12 * Math.sin(ang * 5 + seed * 1.7);
        const q = (x * x + y * y * 1.15) / (wob * wob);
        if (q > r2) continue;
        const edge = q > r2 * 0.5;
        put(d.x + x, d.y + y, edge ? R * 0.55 : R, edge ? Gc * 0.5 : Gc, edge ? B * 0.5 : B, edge ? aEdge : aBody);
      }
      // a wet glint
      if (!d.mist && r > 2) put(d.x - r * 0.35, d.y - r * 0.4, 255, 190, 180, Math.round(200 * fade));
    }
    ctx.putImageData(img, 0, 0);
  }
}

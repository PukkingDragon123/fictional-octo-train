// The theatre's instruments, as faceted objects in the stage's instrument
// layer (stage.fg, rendered in the same pixel grid as the room, outlined in
// black): a bulky olive tele-diagnostic CRT and the operator's slanted control
// desk with a bank of rectangular region keys, a ROW rocker switch, a big FIT
// key, the DEAL lever in its slotted quadrant and the red DISCHARGE key in a
// hazard collar. No dials, no round buttons. Every readable word is drawn on
// the stage's full-resolution overlay: phosphor text on the CRT glass (crisp
// Alagard, scanlines on the pixel grid), engraved labels on the keycaps
// and plates. The SKIP plate is a 2D pixel-art button (drawn at the stage's
// art scale, black outline, bevel, rivets, hazard end) in the DOM.
import * as THREE from 'three';
import { Kit, cbox, tbox, prism, ccylX, hexHead, gem, ngon, type P2 } from './geo';
import type { Mats } from './pix';
import type { SurgeryStage } from './stage';
import { fpArm, type FpArm, type HandPose } from '../../fp/hands';
import { csfx } from './audio';
import { PixelCanvas, makeRamp, scaleHex, mixHex, bayer } from '../../gfx/pixel';
import { hashf } from '../../core/rng';

export const FONT = "'Alagard', monospace";
export const PH = { hi: '#c8ffd0', mid: '#5fe08a', dim: '#2a7a44', inv: '#04120a', warn: '#ffc24a', red: '#ff6a50' };

// ------------------------------------------------------------------ free text on the overlay
/** text floating free with a dark halo (no box) */
export function freeText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size: number; color?: string; align?: CanvasTextAlign; italic?: boolean; weight?: number; halo?: number; glow?: string; base?: CanvasTextBaseline }) {
  ctx.save();
  ctx.font = `${o.weight ?? 500} ${Math.round(o.size)}px ${FONT}`;
  ctx.textAlign = o.align ?? 'left'; ctx.textBaseline = o.base ?? 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(2,3,2,0.92)'; ctx.lineWidth = o.halo ?? Math.max(2, o.size * 0.22);
  ctx.strokeText(s, x, y);
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.size * 0.5; }
  ctx.fillStyle = o.color ?? '#e8e2cc';
  ctx.fillText(s, x, y);
  ctx.restore();
}
/** text engraved into a plate or keycap: dark letters with a lit lower lip */
export function engraved(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, o: { ink?: string; lip?: string; weight?: number; align?: CanvasTextAlign; spacing?: number } = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 600} ${size}px ${FONT}`;
  ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle';
  if (o.spacing) (ctx as any).letterSpacing = `${o.spacing}px`;
  const d = Math.max(1, Math.round(size / 13));
  ctx.fillStyle = o.lip ?? 'rgba(255,248,220,0.38)'; ctx.fillText(s, x, y + d);
  ctx.fillStyle = o.ink ?? '#1c1810'; ctx.fillText(s, x, y);
  ctx.restore();
}
/** pixel-art corner brackets round a point (art = device px per art pixel) */
export function brackets(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, art: number, col: string) {
  const a = Math.max(1, Math.round(art)), s = (v: number) => Math.round(v / a) * a;
  const x0 = s(cx - r), y0 = s(cy - r), x1 = s(cx + r), y1 = s(cy + r), L = a * 4;
  ctx.fillStyle = '#020302';
  for (const [x, y, w, h] of [[x0 - a, y0 - a, L + 2 * a, 3 * a], [x0 - a, y0 - a, 3 * a, L + 2 * a], [x1 - L - a, y0 - a, L + 2 * a, 3 * a], [x1 - a, y0 - a, 3 * a, L + 2 * a], [x0 - a, y1 - a, L + 2 * a, 3 * a], [x0 - a, y1 - L - a, 3 * a, L + 2 * a], [x1 - L - a, y1 - a, L + 2 * a, 3 * a], [x1 - a, y1 - L - a, 3 * a, L + 2 * a]]) ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  for (const [x, y, w, h] of [[x0, y0, L, a], [x0, y0, a, L], [x1 - L, y0, L, a], [x1, y0, a, L], [x0, y1, L, a], [x0, y1 - L + a, a, L], [x1 - L, y1, L + a, a], [x1, y1 - L + a, a, L]]) ctx.fillRect(x, y, w, h);
}

// ------------------------------------------------------------------ the CRT's pen (virtual pixels mapped onto the glass)
export interface CrtRegion { id: string; x: number; y: number; w: number; h: number }
export class CrtPen {
  regions: CrtRegion[] = [];
  constructor(public ctx: CanvasRenderingContext2D, public W: number, public H: number, public hover: string, public k: number) {}
  font(size: number, weight = 500, _italic = false) { return `${weight} ${size}px ${FONT}`; }
  width(s: string, size = 15, weight = 500) { this.ctx.font = this.font(size, weight); return this.ctx.measureText(s).width; }
  text(s: string, x: number, y: number, c = PH.mid, size = 15, align: CanvasTextAlign = 'left', weight = 500, italic = false) {
    const g = this.ctx;
    g.font = this.font(size, weight, italic); g.textAlign = align; g.textBaseline = 'top';
    g.fillStyle = c; g.shadowColor = c; g.shadowBlur = (c === PH.hi ? 6 : 3) * this.k;
    g.fillText(s, x, y);
    g.shadowBlur = 0;
    g.fillText(s, x, y);
  }
  /** wrapped text; returns lines drawn */
  para(s: string, x: number, y: number, w: number, c = PH.mid, size = 14, lh = 17, max = 99, italic = false): number {
    const words = s.split(/\s+/);
    let line = '', n = 0;
    this.ctx.font = this.font(size, 500, italic);
    const out: string[] = [];
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (this.ctx.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; }
    if (line) out.push(line);
    for (const l of out) { if (n >= max) break; this.text(n === max - 1 && out.length > max ? l.replace(/.{0,2}$/, '…') : l, x, y + n * lh, c, size, 'left', 500, italic); n++; }
    return n;
  }
  rule(y: number, c = PH.dim) { const g = this.ctx; g.fillStyle = c; g.fillRect(10, y, this.W - 20, 1.2); }
  fill(x: number, y: number, w: number, h: number, c: string) { this.ctx.fillStyle = c; this.ctx.fillRect(x, y, w, h); }
  hit(id: string, x: number, y: number, w: number, h: number) { this.regions.push({ id, x, y, w, h }); }
  /** a phosphor tab / soft key: bracketed label, inverse video when hot (no frame box) */
  button(id: string, label: string, x: number, y: number, w: number, on = false, h = 26) {
    const hot = on || this.hover === id;
    this.hit(id, x, y - 2, w, h + 4);
    if (hot) { this.fill(x, y, w, h, on ? PH.mid : PH.dim); this.text(label, x + w / 2, y + h / 2 - 9, on ? PH.inv : PH.hi, 16, 'center', 600); }
    else {
      this.text(label, x + w / 2, y + h / 2 - 9, PH.hi, 16, 'center', 600);
      const g = this.ctx; g.fillStyle = PH.mid;
      for (const [a, b] of [[x, y], [x + w - 7, y]]) { g.fillRect(a, b, 7, 1.5); g.fillRect(a + (a === x ? 0 : 5.5), b, 1.5, 7); }
      for (const [a, b] of [[x, y + h - 1.5], [x + w - 7, y + h - 1.5]]) { g.fillRect(a, b, 7, 1.5); g.fillRect(a + (a === x ? 0 : 5.5), b - 5.5, 1.5, 7); }
    }
  }
  /** a segmented bar (unlock progress etc.) */
  bar(x: number, y: number, w: number, h: number, v: number) {
    const n = Math.floor(w / 6), on = Math.round(n * Math.max(0, Math.min(1, v)));
    for (let i = 0; i < n; i++) this.fill(x + i * 6, y, 4, h, i < on ? PH.hi : PH.dim);
  }
  /** a plug-in cartridge glyph */
  cart(x: number, y: number, c: string) {
    const g = this.ctx; g.fillStyle = c;
    g.fillRect(x, y, 18, 2); g.fillRect(x, y + 12, 18, 2); g.fillRect(x, y, 2, 14); g.fillRect(x + 16, y, 2, 14);
    g.fillRect(x + 4, y + 4, 10, 3);
    for (let i = 0; i < 5; i++) g.fillRect(x + 2 + i * 3.4, y + 14, 1.6, 3);
  }
  /** a punch card glyph */
  card(x: number, y: number, c: string, seed: number) {
    const g = this.ctx; g.fillStyle = c;
    g.fillRect(x + 4, y, 16, 1.5); g.fillRect(x, y + 13, 20, 1.5); g.fillRect(x, y + 4, 1.5, 10); g.fillRect(x + 18.5, y, 1.5, 14);
    for (let i = 0; i < 4; i++) g.fillRect(x + i, y + 4 - i, 1.5, 1.5);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 6; i++) if (((seed * 31 + i * 7 + j * 13) % 10) < 6) g.fillRect(x + 3 + i * 2.6, y + 5 + j * 4, 1.5, 2.4);
  }
}

// ------------------------------------------------------------------ the CRT housing
export class Crt3D {
  group = new THREE.Group();
  /** virtual canvas size the screen is drawn in */
  W = 348; H = 316;
  hover = '';
  scroll = 0; maxScroll = 0;
  regions: CrtRegion[] = [];
  t = 0;
  /** 0 off .. 1 on (the picture opens from a line) */
  power = 0; powerT = 1;
  private corners: THREE.Object3D[] = [];
  private plate = new THREE.Object3D();
  private pilot: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  rect = { x: 0, y: 0, w: 0, h: 0 };
  constructor(mats: Mats, public draw: (p: CrtPen, t: number) => void, public onPick: (id: string) => void, public title = 'TELE-DIAGNOSTIC') {
    const M = mats;
    const sw = 1.1, sh = 1.0;
    const k = new Kit();
    // a bulky cabinet: a narrow chamfered bezel round the tube, a deep tapered back, a control lip below
    const BZ = 0.075, LIP = 0.15;
    k.put(M.creamPlain, cbox(sw + 2 * BZ, BZ, 0.2, 0.025), 0, sh / 2 + BZ / 2, -0.06, { tile: 0.9 });
    k.put(M.creamPlain, cbox(sw + 2 * BZ, BZ + LIP, 0.2, 0.025), 0, -sh / 2 - (BZ + LIP) / 2, -0.06, { tile: 0.9 });
    for (const sx of [-1, 1]) k.put(M.creamPlain, cbox(BZ, sh, 0.2, 0.02), sx * (sw / 2 + BZ / 2), 0, -0.06, { tile: 0.9 });
    k.put(M.creamPlain, tbox(sw + 0.1, 0.55, sh + 0.12, sw * 0.62, sh * 0.6, 0.05), 0, 0.0, -0.44, { rx: Math.PI / 2, tile: 0.9 });
    // the tube's dark surround and a chrome rim
    k.put(M.darksteel, cbox(sw + 0.03, 0.025, 0.04, 0.008), 0, sh / 2 + 0.006, 0.012);
    k.put(M.darksteel, cbox(sw + 0.03, 0.025, 0.04, 0.008), 0, -sh / 2 - 0.006, 0.012);
    k.put(M.darksteel, cbox(0.025, sh + 0.03, 0.04, 0.008), -sw / 2 - 0.006, 0, 0.012);
    k.put(M.darksteel, cbox(0.025, sh + 0.03, 0.04, 0.008), sw / 2 + 0.006, 0, 0.012);
    k.put(M.screen, cbox(sw + 0.02, sh + 0.02, 0.02, 0.004), 0, 0, -0.005);
    // the lip: vent slots, a brass name plate, three paddle toggles
    const ly = -sh / 2 - BZ - LIP / 2 + 0.01;
    for (let i = 0; i < 4; i++) k.put(M.darksteel, cbox(0.2, 0.012, 0.01, 0.003), -sw / 2 + 0.13, ly + 0.04 - i * 0.026, 0.045);
    k.put(M.brass, cbox(0.44, 0.07, 0.012, 0.006), 0.0, ly, 0.045);
    for (let i = 0; i < 3; i++) {
      k.put(M.bakelite, cbox(0.05, 0.065, 0.03, 0.008), sw / 2 - 0.25 + i * 0.075, ly, 0.045);
      k.put(M.chrome, cbox(0.018, 0.045, 0.02, 0.004), sw / 2 - 0.25 + i * 0.075, ly + (i === 1 ? -0.012 : 0.012), 0.07, { rx: i === 1 ? 0.5 : -0.5 });
    }
    for (const [x, y] of [[-sw / 2 - BZ / 2, sh / 2 + BZ / 2], [sw / 2 + BZ / 2, sh / 2 + BZ / 2], [-sw / 2 - BZ / 2, ly - 0.03], [sw / 2 + BZ / 2, ly - 0.03]]) k.put(M.steel, hexHead(0.016, 0.012), x, y, 0.045, { rx: Math.PI / 2 });
    // carry handle on top
    k.put(M.darksteel, cbox(0.5, 0.03, 0.05, 0.01), 0, sh / 2 + BZ + 0.07, -0.12);
    for (const s of [-1, 1]) k.put(M.darksteel, cbox(0.03, 0.08, 0.05, 0.01), s * 0.24, sh / 2 + BZ + 0.035, -0.12);
    k.put(M.hazard, cbox(sw + 2 * BZ + 0.01, 0.03, 0.21, 0.008), 0, -sh / 2 - BZ - LIP, -0.06);
    this.group.add(k.group());
    this.pilot = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff70).multiplyScalar(2), toneMapped: false });
    const pk = new Kit(); pk.put(this.pilot, gem(0.02, 0.02, 0.012), sw / 2 - 0.03, -sh / 2 - 0.15, 0.06);
    this.group.add(pk.group(false, false));
    for (const [x, y] of [[-sw / 2, sh / 2], [sw / 2, -sh / 2]]) { const o = new THREE.Object3D(); o.position.set(x, y, 0.005); this.group.add(o); this.corners.push(o); }
    this.plate.position.set(0.0, -sh / 2 - 0.15 + 0.01, 0.055); this.group.add(this.plate);
    this.W = Math.round(316 * sw / sh); this.H = 316;
    this.light = new THREE.PointLight(0x7affa8, 0.25, 2.0, 2);
    this.light.position.set(0, -0.75, 0.9);
    this.group.add(this.light);
  }
  /** the glass, in CSS px of the stage host */
  measure(stage: SurgeryStage) {
    this.group.updateMatrixWorld(true);
    const a = stage.fgToScreen(this.corners[0].getWorldPosition(new THREE.Vector3()));
    const b = stage.fgToScreen(this.corners[1].getWorldPosition(new THREE.Vector3()));
    const s = stage.art, sn = (v: number) => Math.round(v / s) * s;
    const x0 = sn(Math.min(a.x, b.x)) + s, y0 = sn(Math.min(a.y, b.y)) + s, x1 = sn(Math.max(a.x, b.x)) - s, y1 = sn(Math.max(a.y, b.y)) - s;
    this.rect = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    return this.rect;
  }
  /** CSS px -> virtual screen px, or null off the glass */
  toVirtual(x: number, y: number) {
    const r = this.rect;
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h || !r.w) return null;
    return { x: ((x - r.x) / r.w) * this.W, y: ((y - r.y) / r.h) * this.H };
  }
  regionAt(x: number, y: number): string | null {
    const v = this.toVirtual(x, y);
    if (!v) return null;
    for (let i = this.regions.length - 1; i >= 0; i--) { const r = this.regions[i]; if (v.x >= r.x && v.y >= r.y && v.x < r.x + r.w && v.y < r.y + r.h) return r.id; }
    return '';
  }
  /** pointer over the overlay (CSS px); true when it is on the glass */
  pointer2D(x: number, y: number, kind: 'move' | 'click' | 'leave'): boolean {
    if (kind === 'leave') { this.hover = ''; return false; }
    const id = this.regionAt(x, y);
    if (id === null) { if (this.hover) this.hover = ''; return false; }
    if (kind === 'move') { if (id !== this.hover) { this.hover = id; if (id) csfx('cy_beep', 0.04, 1.8); } return !!id; }
    if (kind === 'click' && id) { csfx('cy_beep', 0.16); this.onPick(id); }
    return true;
  }
  scrollBy(d: number) {
    const n = Math.max(0, Math.min(this.maxScroll, this.scroll + d));
    if (n === this.scroll) return;
    this.scroll = n;
    csfx('cy_servo', 0.06, 2.2);
  }
  frame(dt: number, busy = false) {
    this.t += dt;
    this.power += (this.powerT - this.power) * Math.min(1, dt * 5);
    this.pilot.color.setRGB(0.25, 1, 0.45).multiplyScalar(busy ? ((this.t * 6) % 1 < 0.5 ? 0.6 : 2.4) : 2);
    this.light.intensity = 0.25 * this.power * (0.92 + Math.random() * 0.08);
  }
  /** draw the picture on the overlay (device px) */
  paint(ctx: CanvasRenderingContext2D, stage: SurgeryStage) {
    const r = this.measure(stage), d = stage.dpr, art = stage.art * d;
    if (r.w < 8) return;
    const X = r.x * d, Y = r.y * d, Wd = r.w * d, Hd = r.h * d;
    const p = Math.max(0.002, this.power);
    // power: the picture opens from a bright line
    const hOpen = Math.max(art, Hd * Math.min(1, p * 1.6 - 0.3)), wOpen = Wd * Math.min(1, p * 3);
    ctx.save();
    ctx.beginPath(); ctx.rect(X + (Wd - wOpen) / 2, Y + (Hd - hOpen) / 2, wOpen, hOpen); ctx.clip();
    ctx.fillStyle = '#020a05'; ctx.fillRect(X, Y, Wd, Hd);
    if (p > 0.5) {
      const k = Wd / this.W;
      ctx.translate(X, Y); ctx.scale(k, k);
      const pen = new CrtPen(ctx, this.W, this.H, this.hover, k);
      ctx.globalAlpha = 0.93 + Math.random() * 0.07;
      this.draw(pen, this.t);
      this.regions = pen.regions;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    // scanlines on the pixel grid, a slow roll band, the tube's dark corners
    const step = Math.max(2, Math.round(art));
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (let y = Y + step - Math.max(1, Math.round(step / 2)); y < Y + Hd; y += step) ctx.fillRect(X, y, Wd, Math.max(1, Math.round(step / 2)));
    const roll = ((this.t * 0.08) % 1.2 - 0.1) * Hd;
    ctx.fillStyle = 'rgba(120,255,160,0.035)'; ctx.fillRect(X, Y + roll, Wd, Hd * 0.08);
    const cs = art * 3;
    ctx.fillStyle = '#020302';
    for (const [cx, cy, sx, sy] of [[X, Y, 1, 1], [X + Wd, Y, -1, 1], [X, Y + Hd, 1, -1], [X + Wd, Y + Hd, -1, -1]]) { ctx.fillRect(cx - (sx < 0 ? cs : 0), cy - (sy < 0 ? art : 0), cs, art); ctx.fillRect(cx - (sx < 0 ? art : 0), cy - (sy < 0 ? cs : 0), art, cs); }
    if (p < 0.98) { ctx.fillStyle = `rgba(200,255,220,${(1 - p) * 0.9})`; ctx.fillRect(X, Y + Hd / 2 - hOpen / 2, Wd, hOpen); }
    ctx.restore();
    // the maker's plate under the tube
    const pl = stage.fgToScreen(this.plate.getWorldPosition(new THREE.Vector3()));
    engraved(ctx, this.title, pl.x * d, pl.y * d, Math.max(8, r.w * 0.03) * d, { spacing: 1 * d, ink: '#2a1e0c', lip: 'rgba(255,236,170,0.45)' });
  }
}

// ------------------------------------------------------------------ the control desk
export type DeskLayout = 'wide' | 'tall';
export interface Control { id: string; kind: 'key' | 'rocker' | 'lever' | 'big'; mover: THREE.Object3D; label: string; anchor: THREE.Object3D; plate?: THREE.Object3D; lamp?: THREE.MeshBasicMaterial; press: number; latched: boolean; tint: number; w: number }
export const REGION_KEYS: [string, string][] = [['arm_l', 'L.ARM'], ['arm_r', 'R.ARM'], ['hand_l', 'L.HAND'], ['hand_r', 'R.HAND'], ['leg_l', 'L.LEG'], ['leg_r', 'R.LEG'], ['eyes', 'EYES'], ['jaw', 'JAW'], ['spine', 'SPINE'], ['skin', 'SKIN'], ['brain', 'BRAIN'], ['back', 'BACK']];

export class Desk3D {
  group = new THREE.Group();
  controls = new Map<string, Control>();
  hover = '';
  layout: DeskLayout = 'wide';
  W = 2; H = 0.5;
  private body = new THREE.Group();
  private t = 0;
  private lever = 0; private leverV = 0; private leverT = 0;
  constructor(private M: Mats) { this.group.add(this.body); }
  /** the twelve region keys and the action labels (fit key, lever, red key) */
  keys: [string, string][] = REGION_KEYS;
  labels = { fit: 'FIT', deal: 'DEAL', go: 'DISCHARGE' };
  build(layout: DeskLayout) {
    this.layout = layout;
    this.body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.body.clear(); this.controls.clear();
    const M = this.M;
    const wide = layout === 'wide';
    const W = this.W = wide ? 2.2 : 1.24, H = this.H = wide ? 0.5 : 0.78;
    const k = new Kit();
    // the slab: olive enamel panel inside a dark steel rim, a front lip, screws
    k.put(M.panel, cbox(W, H, 0.1, 0.03), 0, 0, -0.05, { tile: 0.5 });
    k.put(M.darksteel, cbox(W + 0.06, 0.04, 0.12, 0.012), 0, H / 2 + 0.01, -0.03);
    k.put(M.darksteel, cbox(W + 0.06, 0.05, 0.14, 0.012), 0, -H / 2 - 0.015, -0.02);
    for (const s of [-1, 1]) k.put(M.darksteel, cbox(0.04, H + 0.06, 0.12, 0.012), s * (W / 2 + 0.01), 0, -0.03);
    k.put(M.hazard, cbox(W + 0.06, 0.025, 0.04, 0.006), 0, -H / 2 - 0.05, 0.02);
    for (const [x, y] of [[-W / 2 + 0.04, H / 2 - 0.04], [W / 2 - 0.04, H / 2 - 0.04], [-W / 2 + 0.04, -H / 2 + 0.04], [W / 2 - 0.04, -H / 2 + 0.04]]) k.put(M.steel, hexHead(0.014, 0.01), x, y, 0.005, { rx: Math.PI / 2 });
    // the region bank: a recessed tray of twelve rectangular keys, a pilot gem over each
    const cols = 6, kw = wide ? 0.15 : 0.18, kh = wide ? 0.12 : 0.13, gx = wide ? 0.022 : 0.02, gy = wide ? 0.05 : 0.055;
    const bankW = cols * kw + (cols - 1) * gx, bankH = 2 * kh + gy;
    const bx = wide ? -W / 2 + 0.06 + bankW / 2 : 0, by = wide ? -0.025 : H / 2 - 0.08 - bankH / 2;
    k.put(M.darksteel, cbox(bankW + 0.05, bankH + 0.06, 0.03, 0.01), bx, by, -0.008);
    k.put(M.brass, cbox(0.3, 0.035, 0.008, 0.004), bx, by + bankH / 2 + 0.03, 0.003);
    this.body.add(k.group());
    const lampMat = () => new THREE.MeshBasicMaterial({ color: 0x1a1210, toneMapped: false });
    const addKey = (id: string, label: string, x: number, y: number, w: number, h: number, tint: number, kind: Control['kind'], depth = 0.05) => {
      const mover = new THREE.Group(); mover.position.set(x, y, 0);
      const kk = new Kit();
      kk.put(M.keycap, tbox(w, depth, h, w * 0.9, h * 0.88, 0.012), 0, 0, depth / 2, { rx: Math.PI / 2, tint, tile: Math.max(w, h) * 1.05 });
      kk.put(M.darksteel, cbox(w * 0.92, h * 0.9, 0.012, 0.004), 0, 0, 0.002);
      const g = kk.group(); mover.add(g);
      mover.userData.pick = id;
      const anchor = new THREE.Object3D(); anchor.position.set(0, 0, depth + 0.002); mover.add(anchor);
      this.body.add(mover);
      const c: Control = { id, kind, mover, label, anchor, press: 0, latched: false, tint, w };
      this.controls.set(id, c);
      return c;
    };
    this.keys.forEach(([id, label], i) => {
      const cx = bx - bankW / 2 + kw / 2 + (i % cols) * (kw + gx), cy = by + bankH / 2 - kh / 2 - Math.floor(i / cols) * (kh + gy);
      const c = addKey('key:' + id, label, cx, cy, kw, kh, id === 'brain' || id === 'craft' ? 0xc8d8ff : id === 'back' ? 0xb8b0a0 : 0xffffff, 'key');
      const lk = new Kit(); c.lamp = lampMat();
      lk.put(c.lamp, gem(0.012, 0.009, 0.006), cx, cy + kh / 2 + gy * 0.5, 0.004);
      this.body.add(lk.group(false, false));
    });
    // the action row: ROW rocker, FIT, the DEAL lever, DISCHARGE
    const ax0 = wide ? bx + bankW / 2 + 0.12 : -W / 2 + 0.08, ay = wide ? -0.01 : -H / 2 + 0.16;
    const span = wide ? W / 2 - 0.06 - ax0 : W - 0.16;
    const slot = (f: number) => ax0 + span * f;
    // rocker: a bakelite housing and a tilting paddle (top half = up, bottom half = down)
    const rx = slot(0.07), rw = 0.09, rh = 0.24;
    const rk = new Kit();
    rk.put(M.bakelite, cbox(rw + 0.04, rh + 0.04, 0.04, 0.01), rx, ay, 0.01);
    this.body.add(rk.group());
    const rock = new THREE.Group(); rock.position.set(rx, ay, 0.035);
    const rkk = new Kit();
    rkk.push().rx(0.0);
    rkk.put(M.keycap, tbox(rw, 0.05, rh * 0.48, rw * 0.92, rh * 0.42, 0.01), 0, rh * 0.25, 0.012, { rx: Math.PI / 2 - 0.12, tint: 0x9a9a8a, tile: 0.25 });
    rkk.put(M.keycap, tbox(rw, 0.05, rh * 0.48, rw * 0.92, rh * 0.42, 0.01), 0, -rh * 0.25, 0.012, { rx: Math.PI / 2 + 0.12, tint: 0x9a9a8a, tile: 0.25 });
    rkk.pop();
    rock.add(rkk.group());
    const up = new THREE.Group(); up.position.set(0, rh * 0.25, 0.03); up.userData.pick = 'rock:up';
    const dn = new THREE.Group(); dn.position.set(0, -rh * 0.25, 0.03); dn.userData.pick = 'rock:down';
    // invisible hit pads over each half
    const pad = (g: THREE.Group) => { const m = new THREE.Mesh(new THREE.BoxGeometry(rw * 1.4, rh * 0.5, 0.06), new THREE.MeshBasicMaterial({ visible: false })); g.add(m); };
    pad(up); pad(dn); rock.add(up, dn);
    this.body.add(rock);
    const ra = new THREE.Object3D(); ra.position.set(rx, ay - rh / 2 - 0.05, 0.004); this.body.add(ra);
    this.controls.set('rock', { id: 'rock', kind: 'rocker', mover: rock, label: 'ROW', anchor: ra, press: 0, latched: false, tint: 0, w: rw });
    // FIT: a wide green key in a steel surround
    const fx = slot(0.33), fw = wide ? 0.28 : 0.3, fh = 0.2;
    const fk = new Kit(); fk.put(M.darksteel, cbox(fw + 0.05, fh + 0.05, 0.03, 0.01), fx, ay, -0.0); this.body.add(fk.group());
    const fit = addKey('fit', this.labels.fit, fx, ay, fw, fh, 0x78d088, 'big', 0.06);
    fit.lamp = lampMat();
    const fl = new Kit(); fl.put(fit.lamp, cbox(fw * 0.6, 0.012, 0.008, 0.003), fx, ay + fh / 2 + 0.03, 0.004); this.body.add(fl.group(false, false));
    // DEAL lever in a slotted brass quadrant, a faceted grip on top
    const lx = slot(0.6);
    const lq = new Kit();
    lq.put(M.brass, prism([[-0.07, -0.16], [0.07, -0.16], [0.08, 0.1], [0.04, 0.16], [-0.04, 0.16], [-0.08, 0.1]], 0.02, 0.004), lx, ay, 0.01);
    lq.put(M.glow(0x050505, 1), cbox(0.022, 0.26, 0.024, 0.004), lx, ay, 0.012);
    for (let i = 0; i < 5; i++) lq.put(M.darksteel, cbox(0.03, 0.006, 0.006, 0.002), lx - 0.045, ay - 0.1 + i * 0.05, 0.022);
    this.body.add(lq.group());
    const lever = new THREE.Group(); lever.position.set(lx, ay - 0.1, 0.02);
    const lv = new Kit();
    lv.put(M.chrome, cbox(0.02, 0.26, 0.02, 0.005), 0, 0, 0.13, { rx: Math.PI / 2 });
    lv.put(M.red, prism(ngon(8, 0.042, Math.PI / 8), 0.09, 0.012), 0, 0, 0.28, { tile: 0.15 });
    lv.put(M.darksteel, cbox(0.05, 0.05, 0.03, 0.01), 0, 0, 0.02);
    lever.add(lv.group());
    lever.userData.pick = 'deal';
    this.body.add(lever);
    const la = new THREE.Object3D(); la.position.set(lx, ay - 0.2, 0.004); this.body.add(la);
    this.controls.set('deal', { id: 'deal', kind: 'lever', mover: lever, label: this.labels.deal, anchor: la, press: 0, latched: false, tint: 0, w: 0.16 });
    // DISCHARGE: a red key in a hazard collar
    const dx = slot(0.86), dw = wide ? 0.24 : 0.26, dh = 0.2;
    const dk = new Kit();
    dk.put(M.hazard, cbox(dw + 0.09, dh + 0.09, 0.035, 0.012), dx, ay, -0.0, { tile: 0.2 });
    dk.put(M.darksteel, cbox(dw + 0.03, dh + 0.03, 0.04, 0.008), dx, ay, 0.002);
    this.body.add(dk.group());
    const go = addKey('go', this.labels.go, dx, ay, dw, dh, 0xe05038, 'big', 0.06);
    go.lamp = lampMat();
    const gl = new Kit(); gl.put(go.lamp, cbox(dw * 0.6, 0.012, 0.008, 0.003), dx, ay + dh / 2 + 0.06, 0.004); this.body.add(gl.group(false, false));
  }
  /** fit the desk into a rect of the instrument layer's view (CSS px), its top tilted away */
  place(stage: SurgeryStage, x: number, y: number, w: number, h: number) {
    const cam = stage.fgCam, D = 4;
    const hh = Math.tan((cam.fov * Math.PI) / 360) * D, hw = hh * cam.aspect;
    const cw = stage.lowW * stage.art, ch = stage.lowH * stage.art;
    const tilt = -0.42;
    const s = Math.min((w / cw) * 2 * hw / (this.W + 0.08), (h / ch) * 2 * hh / (this.H * Math.cos(tilt) + 0.2));
    this.group.scale.setScalar(s);
    this.group.rotation.set(tilt, 0, 0);
    this.group.position.set(((x + w / 2) / cw * 2 - 1) * hw, -(((y + h / 2) / ch) * 2 - 1) * hh, -D);
  }
  pressKey(id: string) {
    const c = this.controls.get(id); if (!c) return;
    c.press = 1;
    if (c.kind === 'lever') { this.leverV = 9; this.leverT = 1; csfx('sg_lever', 0.7); }
    else csfx(c.kind === 'big' ? 'cy_thunk' : 'sg_key', c.kind === 'big' ? 0.6 : 0.55);
  }
  rock(dir: -1 | 1) { const c = this.controls.get('rock'); if (c) { c.press = dir; csfx('sg_rocker', 0.5); } }
  setLabel(id: string, label: string) { const c = this.controls.get(id); if (c) c.label = label; if (id === 'fit' || id === 'deal' || id === 'go') (this.labels as any)[id] = label; }
  setLatched(id: string, on: boolean) { const c = this.controls.get(id); if (c) c.latched = on; }
  setLamp(id: string, col: number | null, k = 2) { const c = this.controls.get(id); if (c?.lamp) { if (col === null) c.lamp.color.setHex(0x1a1210); else c.lamp.color.setHex(col).multiplyScalar(k); } }
  frame(dt: number) {
    this.t += dt;
    for (const c of this.controls.values()) {
      if (c.kind === 'key' || c.kind === 'big') {
        c.press = Math.max(0, c.press - dt * 6);
        const down = Math.max(c.press > 0.4 ? 1 : c.press * 2.5, c.latched ? 0.55 : 0) * (c.kind === 'big' ? 0.04 : 0.028);
        c.mover.position.z = -down + (this.hover === c.id ? 0.006 : 0);
      } else if (c.kind === 'rocker') {
        c.mover.rotation.x += ((c.press ? -c.press * 0.28 : 0) - c.mover.rotation.x) * Math.min(1, dt * 22);
        if (c.press) { c.press -= Math.sign(c.press) * dt * 5; if (Math.abs(c.press) < 0.1) c.press = 0; }
      } else if (c.kind === 'lever') {
        // pulled down to the stop, springs back with an overshoot
        const w = 12, z = 0.3;
        this.leverV += ((this.leverT - this.lever) * w * w - 2 * z * w * this.leverV) * dt;
        this.lever += this.leverV * dt;
        if (this.lever > 1) { this.lever = 1; this.leverV *= -0.3; this.leverT = 0; }
        c.mover.rotation.x = -0.35 + this.lever * 1.25;
      }
    }
  }
  /** engraved labels on the keycaps and the plates (overlay, device px) */
  paint(ctx: CanvasRenderingContext2D, stage: SurgeryStage) {
    const d = stage.dpr;
    this.group.updateMatrixWorld(true);
    const pxPerUnit = (() => { const a = stage.fgToScreen(this.group.localToWorld(new THREE.Vector3(0, 0, 0))), b = stage.fgToScreen(this.group.localToWorld(new THREE.Vector3(1, 0, 0))); return Math.abs(b.x - a.x); })();
    for (const c of this.controls.values()) {
      const p = stage.fgToScreen(c.anchor.getWorldPosition(new THREE.Vector3()));
      if (c.kind === 'key' || c.kind === 'big') {
        const maxW = c.w * pxPerUnit * 0.86;
        let size = Math.min(c.kind === 'big' ? 17 : 13.5, pxPerUnit * (c.kind === 'big' ? 0.06 : 0.042));
        ctx.font = `600 ${size * d}px ${FONT}`;
        const tw = ctx.measureText(c.label).width / d;
        if (tw > maxW) size *= maxW / tw;
        const ink = c.id === 'go' ? '#2a0804' : c.id === 'fit' ? '#0a2410' : '#221c12';
        engraved(ctx, c.label, p.x * d, (p.y + (c.kind === 'big' ? 0 : -1)) * d, size * d, { ink, lip: 'rgba(255,250,230,0.42)', spacing: c.kind === 'big' ? 1.2 * d : 0.3 * d });
      } else {
        const size = Math.min(13, pxPerUnit * 0.04);
        engraved(ctx, c.label, p.x * d, p.y * d, size * d, { ink: '#0e100a', lip: 'rgba(220,230,180,0.3)', spacing: 1.5 * d });
      }
    }
  }
}

// ------------------------------------------------------------------ the SKIP plate (2D pixel art)
/** a pointed steel plate: black outline, bevel, brushed fill, hazard end, rivets; 3 states */
function skipArt(state: 0 | 1 | 2): PixelCanvas {
  const W = 52, H = 22;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  const inside = (x: number, y: number) => {
    if (y < 1 || y > H - 2 || x < 1) return false;
    const tipX = W - 2, body = W - 11;
    if (x <= body) return true;
    const cy = (H - 1) / 2, half = (H - 3) / 2 * (1 - (x - body) / (tipX - body));
    return Math.abs(y - cy) <= half;
  };
  const base = state === 1 ? 0x8a8e84 : state === 2 ? 0x5c6058 : 0x747870;
  const r = makeRamp(base, 7, { spread: 0.48 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const v = 0.5 + (hashf(x >> 2, y, 7) - 0.5) * 0.18 + (hashf(x, y, 9) - 0.5) * 0.08 - (y / H) * 0.18;
    pc.set(x, y, r[Math.max(0, Math.min(6, Math.floor(v * 7 + bayer(x, y) - 0.5)))]);
  }
  // hazard end
  for (let y = 0; y < H; y++) for (let x = 1; x < 8; x++) if (inside(x, y)) pc.set(x, y, ((x + y) & 4) ? 0x18160f : (state === 1 ? 0xffd040 : 0xd8a828));
  for (let y = 2; y < H - 2; y++) pc.set(8, y, 0x0a0908);
  // bevel: lit top-left, dark bottom-right (pressed: inverted)
  const lit = state === 2 ? r[1] : r[6], dark = state === 2 ? r[5] : r[0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1) || !inside(x - 1, y)) pc.set(x, y, x < 9 ? scaleHex(pc.get(x, y), 1.25) : lit);
    else if (!inside(x, y + 1) || !inside(x + 1, y)) pc.set(x, y, dark);
  }
  // rivets and scratches
  for (const [x, y] of [[11, 4], [11, H - 6], [W - 15, 4], [W - 15, H - 6]]) { pc.set(x, y, r[6]); pc.set(x + 1, y, r[4]); pc.set(x, y + 1, r[4]); pc.set(x + 1, y + 1, r[1]); pc.set(x + 2, y + 2, 0x0a0908); }
  for (let i = 0; i < 4; i++) { const x0 = 14 + i * 7, y0 = 5 + (i * 5) % 11; pc.set(x0, y0, r[5]); pc.set(x0 + 1, y0 + 1, r[5]); }
  if (state === 1) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y) && (!inside(x, y - 1))) pc.set(x, y, 0xffe8a0);
  // the black outline
  const src = new Uint8ClampedArray(pc.data);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (src[(y * W + x) * 4 + 3]) continue;
    let n = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && src[(Y * W + X) * 4 + 3]) n = true; }
    if (n) pc.set(x, y, 0x050505);
  }
  return pc;
}
export class SkipButton {
  el = document.createElement('button');
  private cv = document.createElement('canvas');
  private states: ImageData[];
  private state: 0 | 1 | 2 = 0;
  constructor(onSkip: () => void, label = 'SKIP', hint = 'S · Y') {
    this.el.type = 'button';
    this.el.className = 'sg-skip';
    this.el.setAttribute('aria-label', 'Skip the operation');
    this.states = ([0, 1, 2] as const).map((s) => skipArt(s).toImageData());
    this.cv.width = 52; this.cv.height = 22;
    const lab = document.createElement('span'); lab.className = 'sg-skip-l'; lab.textContent = label;
    const hk = document.createElement('span'); hk.className = 'sg-skip-k'; hk.textContent = hint;
    this.el.append(this.cv, lab, hk);
    this.paint();
    const set = (s: 0 | 1 | 2) => { if (s !== this.state) { this.state = s; this.paint(); this.el.classList.toggle('down', s === 2); } };
    this.el.addEventListener('pointerenter', () => set(1));
    this.el.addEventListener('pointerleave', () => set(0));
    this.el.addEventListener('pointerdown', () => set(2));
    this.el.addEventListener('pointerup', () => set(1));
    this.el.addEventListener('focus', () => set(1));
    this.el.addEventListener('blur', () => set(0));
    this.el.addEventListener('click', (e) => { e.stopPropagation(); csfx('sg_rocker', 0.6); onSkip(); });
  }
  private paint() { this.cv.getContext('2d')!.putImageData(this.states[this.state], 0, 0); }
  /** size to the stage's art scale (CSS px per art pixel) */
  scale(art: number) { this.el.style.setProperty('--art', `${art}px`); }
}

// ------------------------------------------------------------------ hands near the camera (src/fp/hands.ts)
/** the patient's own hand at the edge of the view, clenched on the table (field surgery's point of view) */
export function patientHand(scene: THREE.Object3D, skin: number, sleeve: number | null, pose: HandPose = 'fist'): FpArm {
  const a = fpArm('left', { skin, sleeve, sleeveStyle: sleeve === null ? 'none' : 'long' });
  a.root.position.set(-0.3, -0.36, -1.2);
  a.root.rotation.set(-1.05, 0.2, 0.5);
  a.pose(pose, true);
  scene.add(a.root);
  return a;
}

export { mixHex, ccylX, type P2 };

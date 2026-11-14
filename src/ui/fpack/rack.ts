// The gear rack (round 18b): what the unit wears and holds, hung on S-hooks from an iron rail at the top of the
// pack close-up (head, body, the right and the left hand, back, feet), with a brass spring balance at its end that
// weighs the load: the spring stretches and the pointer drops down its scale as things go in, into the red past
// what the unit can carry. Pixel art painted each frame it moves (things swing when they change). Names on hover.
import type { Item } from '../../items/item';
import type { Player } from '../../entities/player';
import { Px, PAL, hex, mix, mul, leather, webbing, rivet, brushed, type C3 } from './paint';
import { iconImg, onIcons } from './board';

export type Hook = 'head' | 'body' | 'R' | 'L' | 'back' | 'feet';
export const HOOKS: Hook[] = ['head', 'body', 'R', 'L', 'back', 'feet'];
const SLOT_HOOK: Record<string, Hook> = {
  hat: 'head', eyes: 'head', mask: 'head', neck: 'head', head: 'head', face: 'head',
  tshirt: 'body', shirt: 'body', sweater: 'body', jacket: 'body', fullsuit: 'body', torso_inner: 'body', torso: 'body', torso_outer: 'body', pants: 'body', legs: 'body',
  hands: 'R', wrist: 'L', back: 'back', belt: 'back', socks: 'feet', shoes: 'feet', feet: 'feet',
};
export const hookOfSlot = (s: string): Hook => SLOT_HOOK[s] ?? (s.startsWith('prosth') ? 'body' : 'body');

const HX = 22, HS = 52, RAIL_Y = 9, ICON = 34;
const W = HX + HOOKS.length * HS + 52, H = 132;

interface Swing { a: number; v: number }

export class Rack {
  readonly el = document.createElement('canvas');
  private sw = new Map<Hook, Swing>();
  private sig = '';
  private hang = new Map<Hook, Item[]>();
  /** the balance: shown load (0..1.4) and its velocity */
  private k = 0; private kv = 0; private kGoal = 0;
  private kg = 0; private cap = 1;
  hover: Hook | 'scale' | null = null;
  private lifted: Item | null = null;
  private bg: HTMLCanvasElement | null = null;
  private live = true;

  constructor() {
    this.el.className = 'fpk-rack';
    this.el.width = W; this.el.height = H;
    for (const h of HOOKS) this.sw.set(h, { a: 0, v: 0 });
    onIcons(() => { this.sig = ''; });
  }

  /** read the unit (worn, hands, load); things that changed get a push */
  sync(p: Player, lifted: Item | null) {
    const hang = new Map<Hook, Item[]>();
    for (const h of HOOKS) hang.set(h, []);
    for (const [slot, it] of p.worn) hang.get(hookOfSlot(String(slot)))!.push(it);
    if (p.handR) hang.get('R')!.unshift(p.handR);
    if (p.handL && p.handL !== p.handR) hang.get('L')!.unshift(p.handL);
    const sig = HOOKS.map((h) => hang.get(h)!.map((i) => i.uid).join(',')).join('|') + '#' + (lifted?.uid ?? '');
    if (sig !== this.sig) {
      if (this.sig) for (const h of HOOKS) { const a = (this.hang.get(h) ?? []).map((i) => i.uid).join(','), b = hang.get(h)!.map((i) => i.uid).join(','); if (a !== b) this.sw.get(h)!.v += 2.4; }
      this.sig = sig; this.hang = hang; this.lifted = lifted;
    }
    this.kg = p.carriedWeight(); this.cap = Math.max(0.1, p.capacity());
    const goal = Math.min(1.4, this.kg / this.cap);
    if (Math.abs(goal - this.kGoal) > 0.004) { this.kv -= (goal - this.kGoal) * 2; this.kGoal = goal; }
  }

  /** the hook (or the balance) under a client point */
  at(cx: number, cy: number): Hook | 'scale' | null {
    const r = this.el.getBoundingClientRect();
    if (cx < r.left || cy < r.top || cx > r.right || cy > r.bottom) return null;
    const x = (cx - r.left) * (W / r.width), y = (cy - r.top) * (H / r.height);
    if (x > HX + HOOKS.length * HS + 4) return 'scale';
    const i = Math.floor((x - HX + HS * 0.1) / HS);
    if (i < 0 || i >= HOOKS.length || y < RAIL_Y - 4 || y > RAIL_Y + 22 + ICON * 2.2) return null;
    return HOOKS[i];
  }
  items(h: Hook): Item[] { return this.hang.get(h) ?? []; }
  /** the client point of a hook's hanging thing */
  hookPoint(h: Hook): { x: number; y: number } {
    const r = this.el.getBoundingClientRect(), i = HOOKS.indexOf(h);
    return { x: r.left + (HX + i * HS + HS * 0.4) * (r.width / W), y: r.top + (RAIL_Y + 30 + ICON / 2) * (r.height / H) };
  }
  weightText() { return `${this.kg.toFixed(1)} / ${this.cap.toFixed(0)} kg`; }

  update(dt: number) {
    if (!this.live) return;
    dt = Math.min(0.05, dt);
    for (const s of this.sw.values()) { s.v += (-s.a * 60 - s.v * 4.2) * dt; s.a += s.v * dt; }
    this.kv += ((this.kGoal - this.k) * 90 - this.kv * 7) * dt; this.k += this.kv * dt;
    this.draw();
  }

  private paintBg(): HTMLCanvasElement {
    const p = new Px(W, H, 211);
    // the rail: a black iron bar with two brackets running up off the top of the picture
    const railW = HX + HOOKS.length * HS + 30;
    for (const bx of [8, railW - 10]) { brushed(p, bx, 0, 6, RAIL_Y + 3, hex(0x3a3c38), { seed: bx }); p.rect(bx - 2, RAIL_Y - 2, 10, 8, hex(0x2a2c28)); rivet(p, bx + 1, RAIL_Y, PAL.steel); }
    brushed(p, 4, RAIL_Y, railW, 5, hex(0x55584f), { seed: 3, wear: 0.9 });
    for (let i = 4; i < railW + 4; i++) { p.put(i, RAIL_Y, hex(0x8a8e84)); p.put(i, RAIL_Y + 4, hex(0x1e1f1c)); p.film(i, RAIL_Y + 5, [0, 0, 0], 0.4); }
    // a webbing tag under each hook (no words: a little pictogram in thread)
    HOOKS.forEach((h, i) => {
      const x = HX + i * HS;
      webbing(p, x - 2, RAIL_Y + 5, 9, 9, mix(PAL.web, PAL.olive, 0.3), true, i + 9);
      const t: C3 = mul(PAL.thread, 0.9);
      const G: Record<Hook, number[][]> = {
        head: [[3, 2], [4, 2], [2, 3], [5, 3], [2, 4], [5, 4], [3, 5], [4, 5]], body: [[2, 2], [5, 2], [2, 3], [3, 3], [4, 3], [5, 3], [3, 4], [4, 4], [3, 5], [4, 5]],
        R: [[2, 2], [3, 2], [4, 2], [4, 3], [3, 4], [4, 4], [4, 5]], L: [[2, 2], [2, 3], [2, 4], [2, 5], [3, 5], [4, 5]], back: [[2, 2], [3, 2], [4, 2], [5, 2], [2, 3], [5, 3], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [5, 5]], feet: [[2, 2], [2, 3], [2, 4], [3, 5], [4, 5], [5, 5]],
      };
      for (const [dx, dy] of G[h]) p.put(x - 2 + dx, RAIL_Y + 5 + dy, t);
    });
    // the spring balance's top bracket
    const sx = HX + HOOKS.length * HS + 12;
    leather(p, sx - 4, RAIL_Y - 1, 14, 6, PAL.leather, { seed: 5 });
    return p.done();
  }

  private draw() {
    if (!this.bg) this.bg = this.paintBg();
    const c = this.el.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, W, H);
    c.drawImage(this.bg, 0, 0);
    HOOKS.forEach((h, i) => this.drawHook(c, h, i));
    this.drawBalance(c);
  }

  private drawHook(c: CanvasRenderingContext2D, h: Hook, i: number) {
    const x = HX + i * HS, y = RAIL_Y + 2;
    const s = this.sw.get(h)!;
    const items = this.items(h).filter((it) => it !== this.lifted);
    c.save();
    c.translate(x + 2, y);
    c.rotate(s.a * 0.12);
    // the S-hook (pixel strokes)
    const hk = new Px(10, 22, i + 1);
    const steel = hex(0x9aa09a), dark = hex(0x3a3e3a);
    for (const [px, py] of [[4, 0], [5, 0], [6, 1], [6, 2], [5, 3], [4, 3], [3, 4], [3, 5], [3, 6], [3, 7], [3, 8], [3, 9], [3, 10], [3, 11], [4, 12], [5, 13], [6, 13], [7, 12], [7, 11]]) { hk.put(px, py, steel); hk.put(px + 1, py + 1, dark, 0.7); }
    hk.put(4, 0, hex(0xe8ece4));
    c.drawImage(hk.done(), -5, 0);
    const hov = this.hover === h;
    // what hangs: by a twine loop, the first in front, the rest fanned out behind it
    items.slice(0, 3).reverse().forEach((it, j, arr) => {
      const k = arr.length - 1 - j;
      const im = iconImg(it, ICON);
      const ox = k * 7 - 2, oy = 16 + k * 5;
      c.strokeStyle = 'rgba(200,184,136,.9)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(1.5, 12.5); c.lineTo(ox + 1.5, oy + 4.5); c.stroke();
      if (!im) return;
      c.save(); c.globalAlpha = 0.35; c.filter = 'brightness(0)'; c.drawImage(im, ox - ICON / 2 + 3, oy + 3, ICON, ICON); c.restore();
      if (k > 0) { c.save(); c.filter = 'brightness(.72) saturate(.8)'; c.drawImage(im, ox - ICON / 2, oy, ICON, ICON); c.restore(); }
      else { c.drawImage(im, ox - ICON / 2, oy - (hov ? 1 : 0), ICON, ICON); if (hov) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.18; c.drawImage(im, ox - ICON / 2, oy - 1, ICON, ICON); c.restore(); } }
    });
    if (!items.length && hov) { c.fillStyle = 'rgba(242,226,160,.5)'; c.fillRect(-1, 15, 6, 1); }
    c.restore();
  }

  private drawBalance(c: CanvasRenderingContext2D) {
    const sx = HX + HOOKS.length * HS + 12, top = RAIL_Y + 4;
    const k = Math.max(0, Math.min(1.45, this.k));
    const TL = 66, ext = 8 + k * 30;
    const p = new Px(26, H, 37);
    // the tube: brass, a slot down its face with the spring inside, graduations, the red band past capacity
    const tx = 6, tw = 13;
    for (let y = 2; y < 2 + TL; y++) for (let x = tx; x < tx + tw; x++) {
      const e = (x - tx) / (tw - 1);
      p.put(x, y, mul(PAL.brass, 0.62 + Math.sin(e * Math.PI) * 0.6 - (e > 0.8 ? 0.2 : 0)));
    }
    p.rect(tx + 4, 6, 5, TL - 8, hex(0x231a0c));
    // the spring, its coils spread by the load
    const coils = 9, sl = 10 + k * 26;
    for (let i = 0; i <= coils * 2; i++) { const yy = 7 + (i / (coils * 2)) * sl; p.put(tx + 5 + (i & 1 ? 2 : 0), yy, hex(0xb8bcb4)); p.put(tx + 6, yy, hex(0x6a6e68)); }
    // graduations (and the red past the limit)
    for (let i = 0; i <= 10; i++) {
      const yy = Math.round(7 + 10 + (i / 10) * 36);
      p.rect(tx + 1, yy, i % 5 === 0 ? 3 : 2, 1, hex(0x3a2a10));
      p.rect(tx + tw - (i % 5 === 0 ? 4 : 3), yy, i % 5 === 0 ? 3 : 2, 1, hex(0x3a2a10));
    }
    p.rect(tx + 1, 7 + 10 + 36 + 1, 3, 9, hex(0xa8402a)); p.rect(tx + tw - 4, 7 + 10 + 36 + 1, 3, 9, hex(0xa8402a));
    // the pointer: a bar riding on the spring, pointing at the load
    const py = Math.round(7 + sl);
    p.rect(tx + 2, py, tw - 4, 2, k > 1 ? hex(0xe0583a) : hex(0xf0e0a0)); p.put(tx + 1, py, hex(0x231a0c)); p.put(tx + tw - 2, py, hex(0x231a0c));
    // the rod down out of the tube and the hook
    const by = 2 + TL;
    p.rect(tx + 5, by, 3, Math.round(ext), hex(0x8a8e88)); p.rect(tx + 5, by, 1, Math.round(ext), hex(0xd8dcd4));
    const hy = by + Math.round(ext);
    for (const [px, py2] of [[6, 0], [7, 1], [7, 2], [6, 3], [5, 3], [4, 2], [4, 1]]) p.put(tx + px, hy + py2, hex(0xb8bcb4));
    p.rect(tx, 0, tw, 2, PAL.brassD); p.rect(tx, TL + 1, tw, 2, PAL.brassD);
    const cv = p.done();
    c.drawImage(cv, sx - 4, top);
    // what it weighs: the field pack's own icon hanging off the hook
    const bag = this.items('back')[0];
    const im = bag ? iconImg(bag, 26) : null;
    if (im) { c.save(); c.translate(sx + 6, top + hy + 4); c.rotate(Math.sin(performance.now() / 900) * 0.04); c.drawImage(im, -13, 0, 26, 26); c.restore(); }
  }
  dispose() { this.live = false; this.el.remove(); }
}

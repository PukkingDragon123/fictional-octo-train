// The things around the pack, in 2D (round 19, the user's design for the backpack scene): only the backpack itself
// is 3D (src/ui/inventory.ts); what lies on the ground, what is in the container being searched, the clothes'
// pockets and the tool roll sit in a housing of the institute's olive machine kit at the right of the screen, each
// thing a detailed pixel icon in a bevelled felt socket. Nearby containers are small icons along its top (pick
// one to look in it). Drag a thing into the pack, onto a slot of the hotbar or into another section; a click sends
// it straight into the pack; right click: its card. Names, weights and condition show in the pack's readout.
import { G } from '../../game/G';
import type { Container } from '../../items/container';
import { itemName, type Item } from '../../items/item';
import { itemIconFor, iconResCss, objIcon } from '../icons';
import { mxOk } from '../machine/core';
import { mxFrame, panelSpec } from '../machine/kit';

export interface SideSection { key: string; c: Container; icon: string; items: Item[][]; hot?: boolean }
export interface SideTab { ref: string; icon: string; name: string; on: boolean; n: number }
export interface SideHooks {
  /** a click: straight into the pack */
  quick(items: Item[], from: Container): void;
  /** a 2D drag let go at a screen point */
  drop(items: Item[], from: Container, x: number, y: number, fromSlot: number): void;
  hover(it: Item | null, n: number): void;
  card(it: Item, from: Container, x: number, y: number): void;
  tab(ref: string): void;
}

const S = 46, ICON = 38;

/** a crafted pixel socket: a bevelled steel rim, a sunk felt bed with its weave, four screws (brass while lit) */
function socketUrl(hot: boolean): string {
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  const px = (x: number, y: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
  const rim = hot ? ['#f0d080', '#c8a050', '#8a6a2a', '#4a3410'] : ['#a4aa9c', '#767c70', '#4a5046', '#22251f'];
  c.fillStyle = '#0b0c0a'; c.fillRect(0, 0, S, S);
  c.fillStyle = rim[1]; c.fillRect(1, 1, S - 2, S - 2);
  c.fillStyle = rim[0]; c.fillRect(1, 1, S - 2, 1); c.fillRect(1, 1, 1, S - 2);
  c.fillStyle = rim[2]; c.fillRect(1, S - 2, S - 2, 1); c.fillRect(S - 2, 1, 1, S - 2);
  c.fillStyle = rim[3]; c.fillRect(3, 3, S - 6, S - 6);
  let seed = hot ? 77 : 31;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 4; y < S - 4; y++) for (let x = 4; x < S - 4; x++) {
    const w = ((x + y) % 4 === 0 ? 0.1 : 0) + ((x - y + 64) % 4 === 0 ? 0.06 : 0) + rnd() * 0.08;
    const sh = (x < 7 || y < 7) ? -0.32 : (x > S - 7 || y > S - 7) ? 0.08 : 0;
    const v = Math.max(0, Math.min(1, 0.26 + w + sh));
    c.fillStyle = hot ? `rgb(${Math.round(52 + v * 50)},${Math.round(40 + v * 40)},${Math.round(22 + v * 24)})` : `rgb(${Math.round(30 + v * 40)},${Math.round(36 + v * 46)},${Math.round(30 + v * 36)})`;
    c.fillRect(x, y, 1, 1);
  }
  for (const [x, y] of [[3, 3], [S - 5, 3], [3, S - 5], [S - 5, S - 5]]) { px(x, y, rim[0]); px(x + 1, y, rim[1]); px(x, y + 1, rim[2]); px(x + 1, y + 1, '#0b0c0a'); }
  return cv.toDataURL();
}

export class PackSide {
  readonly el = document.createElement('div');
  private tabs = document.createElement('div');
  private body = document.createElement('div');
  private ghost = new Image();
  private sig = '';
  private framed = false;
  private sects = new Map<string, HTMLElement>();
  private drag: { items: Item[]; from: Container; x: number; y: number; gx: number; gy: number; vx: number; slot: number; raf: number } | null = null;
  private press: { items: Item[]; from: Container; x: number; y: number; id: number; slot: number } | null = null;
  shown = false;

  constructor(private h: SideHooks) {
    this.el.className = 'pside';
    this.tabs.className = 'pside-tabs';
    this.body.className = 'pside-body';
    this.el.append(this.tabs, this.body);
    this.ghost.className = 'pside-ghost';
    this.el.style.setProperty('--ps-sock', `url(${socketUrl(false)})`);
    this.el.style.setProperty('--ps-sock-hot', `url(${socketUrl(true)})`);
    const st = document.createElement('style');
    st.textContent = `.pside{position:fixed;z-index:62;right:16px;top:calc(7vh + 12px);width:236px;max-height:calc(86vh - 130px);display:flex;flex-direction:column;padding:10px 12px;font-family:var(--font-new);user-select:none;opacity:0;transform:translateX(30px);transition:opacity .2s ease,transform .32s cubic-bezier(.3,1.4,.5,1);pointer-events:none}
.pside,.pside *{border-radius:0!important}
.pside.on{opacity:1;transform:none;pointer-events:auto}
.pside-tabs{position:relative;display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px}
.pside-tabs:empty{display:none}
.pside-tab{position:relative;width:34px;height:34px;padding:0;border:0;cursor:pointer;background:var(--ps-sock) center/100% 100% no-repeat;image-rendering:pixelated;opacity:.7}
.pside-tab.on,.pside-tab:hover{background-image:var(--ps-sock-hot);opacity:1}
.pside-tab img{position:absolute;left:5px;top:5px;width:24px;height:24px;image-rendering:pixelated}
.pside-tab b{position:absolute;right:2px;bottom:0;font-weight:normal;font-size:11px;color:#f2d65a;text-shadow:1px 1px 0 #0b0c0a,-1px 0 0 #0b0c0a}
.pside-body{position:relative;flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#6a6e50 transparent}
.pside-sec{margin-bottom:6px}
.pside-sec.drop .pside-cap{color:#ffe08a}
.pside-sec.drop .pside-grid{outline:2px solid rgba(255,224,138,.55);outline-offset:1px}
.pside-cap{display:flex;align-items:center;gap:6px;height:24px;color:#c8c08a;font-size:13px;text-shadow:1px 1px 0 #0b0c0a}
.pside-cap img{width:22px;height:22px;image-rendering:pixelated;filter:drop-shadow(1px 1px 0 rgba(0,0,0,.6))}
.pside-grid{display:flex;flex-wrap:wrap;gap:3px;min-height:${S}px}
.pside-it{position:relative;width:${S}px;height:${S}px;padding:0;border:0;cursor:grab;background:var(--ps-sock) center/100% 100% no-repeat;image-rendering:pixelated;touch-action:none}
.pside-it:hover{background-image:var(--ps-sock-hot)}
.pside-it img{position:absolute;left:4px;top:4px;width:${ICON}px;height:${ICON}px;image-rendering:pixelated;pointer-events:none;filter:drop-shadow(1px 2px 0 rgba(0,0,0,.55));transition:transform .12s}
.pside-it:hover img{transform:translateY(-2px)}
.pside-it b{position:absolute;right:3px;bottom:1px;font-weight:normal;font-size:12px;color:#f2d65a;text-shadow:1px 1px 0 #0b0c0a,-1px 0 0 #0b0c0a;pointer-events:none}
.pside-it.pop img{animation:ps-pop .38s cubic-bezier(.3,1.6,.5,1) both}
@keyframes ps-pop{0%{transform:translateY(-14px) scale(.3);opacity:0}100%{transform:none;opacity:1}}
.pside-empty{height:${S}px;width:${S}px;background:var(--ps-sock) center/100% 100% no-repeat;image-rendering:pixelated;opacity:.45}
.pside-ghost{position:fixed;left:0;top:0;z-index:72;width:44px;height:44px;image-rendering:pixelated;pointer-events:none;filter:drop-shadow(3px 5px 0 rgba(0,0,0,.45));display:none}
@media (max-width:700px){.pside{left:6px;right:6px;width:auto;top:auto;bottom:calc(7vh + 6px);max-height:32vh}.pside-grid{gap:2px}}`;
    this.el.append(st);
    document.body.append(this.ghost);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('pointerleave', () => { if (!this.drag) this.h.hover(null, 1); });
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.onUp(e, false));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    // a thing on the hotbar dragged into the pack (the hotbar's own handler sits under this one while the pack is up)
    window.addEventListener('pointerdown', (e) => {
      if (!this.shown || e.button !== 0) return;
      // (the pack's pointer layer lies over the hotbar: find the slot by where the pointer is)
      const bar = document.getElementById('hot12');
      if (!bar?.classList.contains('on')) return;
      const slots = [...bar.querySelectorAll<HTMLElement>('.hb-slot')];
      const i = slots.findIndex((q) => { const r = q.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
      const p = G.local; if (!p || i < 0) return;
      const it = p.allItems().find((q) => ((q.data as any)?.hot ?? 0) === i + 1);
      const from = it ? p.containerOf(it) : null;
      if (!it || !from) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.press = { items: [it], from, x: e.clientX, y: e.clientY, id: e.pointerId, slot: i + 1 };
    }, true);
  }

  show(on: boolean) {
    this.shown = on;
    if (on && !this.el.isConnected) document.body.append(this.el);
    if (on && !this.framed && mxOk()) {
      this.framed = true;
      this.el.classList.add('mx');
      try { mxFrame(this.el, (w, h) => { const sp = panelSpec(w, h, { seed: 89, hazard: false, vents: false, glands: 0, lamps: [] }); sp.depth = 7; return sp; }, { pad: 8 }); } catch (e) { console.warn('pack side frame', e); }
    }
    if (!on) { this.endDrag(); this.h.hover(null, 1); }
    requestAnimationFrame(() => this.el.classList.toggle('on', on));
  }

  /** what to show: nearby containers along the top, then a section per container */
  set(tabs: SideTab[], sections: SideSection[]) {
    const sig = tabs.map((t) => t.ref + (t.on ? '*' : '') + t.n).join(',') + '#' + sections.map((s) => s.key + ':' + s.items.map((g) => g[0].uid + 'x' + g.length).join('.')).join('|');
    if (sig === this.sig) return;
    const fresh = new Set<number>();
    const before = new Set<number>();
    this.body.querySelectorAll<HTMLElement>('.pside-it').forEach((b) => before.add(Number(b.dataset.uid)));
    for (const s of sections) for (const g of s.items) if (!before.has(g[0].uid) && this.sig) fresh.add(g[0].uid);
    this.sig = sig;
    this.tabs.replaceChildren(...tabs.map((t) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pside-tab' + (t.on ? ' on' : '');
      const im = new Image(); im.src = t.icon; im.alt = ''; b.append(im);
      if (t.n) { const n = document.createElement('b'); n.textContent = String(t.n); b.append(n); }
      b.addEventListener('pointerenter', () => this.h.hover(null, 1));
      b.addEventListener('click', () => this.h.tab(t.ref));
      return b;
    }));
    this.sects.clear();
    this.body.replaceChildren(...sections.map((s) => {
      const sec = document.createElement('div'); sec.className = 'pside-sec';
      const cap = document.createElement('div'); cap.className = 'pside-cap';
      const ci = new Image(); ci.src = s.icon; ci.alt = ''; cap.append(ci);
      const n = s.items.reduce((k, g) => k + g.length, 0);
      if (n) cap.append(String(n));
      const grid = document.createElement('div'); grid.className = 'pside-grid';
      if (!s.items.length) grid.append(Object.assign(document.createElement('i'), { className: 'pside-empty' }));
      s.items.forEach((g, k) => {
        const it = g[0];
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pside-it' + (fresh.has(it.uid) || s.hot ? ' pop' : '');
        b.dataset.uid = String(it.uid);
        const im = new Image(); im.src = itemIconFor(it, iconResCss(ICON)); im.alt = ''; im.draggable = false;
        if (s.hot) im.style.animationDelay = (k * 60) + 'ms';
        b.append(im);
        if (g.length > 1) { const c = document.createElement('b'); c.textContent = String(g.length); b.append(c); }
        b.addEventListener('pointerenter', () => { if (!this.drag) this.h.hover(it, g.length); G.audio?.ui?.('hover', 0.08); });
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation();
          if (e.button === 2) { this.h.card(it, s.c, e.clientX, e.clientY); return; }
          this.press = { items: e.shiftKey ? g.slice() : [g[g.length - 1]], from: s.c, x: e.clientX, y: e.clientY, id: e.pointerId, slot: 0 };
        });
        grid.append(b);
      });
      sec.append(cap, grid);
      this.sects.set(s.key, sec);
      (sec as any)._c = s.c;
      return sec;
    }));
  }

  /** the container whose section is under a screen point */
  sectionAt(x: number, y: number): Container | null {
    if (!this.shown) return null;
    const r = this.el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    for (const sec of this.sects.values()) { const q = sec.getBoundingClientRect(); if (y >= q.top - 2 && y <= q.bottom + 2) return (sec as any)._c as Container; }
    return null;
  }
  /** light the section a 3D drag is over (null: none) */
  over(c: Container | null) { for (const sec of this.sects.values()) sec.classList.toggle('drop', !!c && (sec as any)._c === c); }
  overPanel(x: number, y: number): boolean { if (!this.shown) return false; const r = this.el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

  // ---------------------------------------------------------------- dragging a thing out of the panel
  private onMove(e: PointerEvent) {
    const pr = this.press;
    if (pr && !this.drag && pr.id === e.pointerId && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 6) {
      this.drag = { items: pr.items, from: pr.from, x: e.clientX, y: e.clientY, gx: pr.x, gy: pr.y, vx: 0, slot: pr.slot, raf: 0 };
      this.press = null;
      const it = pr.items[0];
      this.ghost.src = itemIconFor(it, iconResCss(44));
      this.ghost.style.display = 'block';
      G.audio?.itemSound?.(it.key, 'pick', G.local);
      const tick = () => {
        const d = this.drag; if (!d) return;
        // it trails the pointer a little, swinging with the speed (a weight in the hand)
        const ox = d.gx;
        d.gx += (d.x - d.gx) * 0.32; d.gy += (d.y - d.gy) * 0.32;
        d.vx += ((d.gx - ox) - d.vx) * 0.3;
        this.ghost.style.transform = `translate(${d.gx - 22}px, ${d.gy - 30}px) rotate(${Math.max(-18, Math.min(18, d.vx * 1.4))}deg) scale(1.12)`;
        d.raf = requestAnimationFrame(tick);
      };
      tick();
    }
    if (this.drag) { this.drag.x = e.clientX; this.drag.y = e.clientY; this.over(this.sectionAt(e.clientX, e.clientY)); }
  }
  private onUp(e: PointerEvent, cancel: boolean) {
    const pr = this.press; this.press = null;
    const d = this.drag;
    if (d) {
      this.endDrag();
      if (!cancel) this.h.drop(d.items, d.from, e.clientX, e.clientY, d.slot);
      return;
    }
    if (pr && !cancel && pr.id === e.pointerId && !pr.slot) this.h.quick(pr.items, pr.from);
  }
  private endDrag() {
    const d = this.drag; if (!d) return;
    cancelAnimationFrame(d.raf);
    this.drag = null;
    this.ghost.style.display = 'none';
    this.over(null);
  }
  /** a 3D thing carried over the panel shows as its icon under the pointer */
  ghostAt(it: Item | null, x = 0, y = 0) {
    if (!it) { if (!this.drag) this.ghost.style.display = 'none'; return; }
    this.ghost.src = itemIconFor(it, iconResCss(44));
    this.ghost.style.display = 'block';
    this.ghost.style.transform = `translate(${x - 22}px, ${y - 30}px) scale(1.12)`;
  }
  static objIconOf(key: string) { return objIcon(key, 24); }
  static nameOf(it: Item) { return itemName(it); }
}

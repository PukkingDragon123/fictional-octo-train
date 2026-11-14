// THE PACK (round 18): a clear 2D pixel panel for everything the unit carries, in place of the first-person
// pack close-up as the way to manage items (src/ui/inventory.ts stays in the tree, unused).
//
//   you        a weight bar (carried / capacity, red past it), the two hands and what is worn, then a grid per
//              container you carry (pockets, the pack, the tool roll). Icons only; the name shows on hover.
//   loot       searching a container (or the floor) kneels the unit and rummages: the container's things come
//              flying out of it on screen into a second column beside yours. Click to take (it flies across to
//              your side); with loot open, click yours to put it in. A key takes everything.
//   cards      right-click any item for its card (src/ui/itemPanel.ts); with nothing looted a click does it too.
//   pickup     taking something off the floor (anywhere) sends its icon flying from the floor to the slot bar.
// Calm colours, square everything, Alagard. Keys: I (or Tab-free Esc) closes; the touch PACK key toggles.
// It keeps the old pack's API (toggle, focus, openLoot, lootFloor, open) so every caller still works.
import './pack2d.css';
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Container } from '../../items/container';
import { itemName, itemWeight, type Item } from '../../items/item';
import { itemIconFor, iconResCss } from '../icons';
import { openItemPanel } from '../itemPanel';
import { transferItem, ensureLoot, isWorldContainer } from '../../game/worldOps';
import { floorContainer } from '../../items/worldItems';
import { sfx } from '../menus/sfx';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const reduce = () => document.documentElement.classList.contains('reduce-flash');
const ICON = 36;

export class Pack2D {
  open = false;
  phase = 'off';
  private root = el('div', 'pk2');
  private you = el('section', 'pk2-col pk2-you');
  private lootCol = el('section', 'pk2-col pk2-loot');
  private tip = el('div', 'pk2-tip');
  private loot: Container | null = null;
  private lootRef = '';
  private lootFrom: { x: number; y: number } | null = null;
  private knelt = false;
  private sig = '';
  private dirty = true;
  private raf = 0;
  private fresh = false;

  constructor(ui?: unknown) {
    (G as any).pack = this;
    // the unit stays put while it has the pack open
    const u = ui as { blocksMovement?: () => boolean } | undefined;
    const orig = u?.blocksMovement?.bind(u);
    if (u && orig) u.blocksMovement = () => orig() || this.open;
    this.root.append(this.you, this.lootCol, this.tip);
    this.root.addEventListener('pointerenter', () => { if (G.input) G.input.pointerOverUI = true; });
    this.root.addEventListener('pointerleave', () => { if (G.input) G.input.pointerOverUI = false; this.tip.classList.remove('on'); });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    bus.on('inventoryChanged', () => { this.dirty = true; });
    bus.on('floorChanged', () => { this.dirty = true; });
    window.addEventListener('keydown', (e) => {
      if (!this.open || G.input?.textFocus) return;
      if (e.code === 'Escape' && !document.querySelector('.ipnl, .kd-veil')) { e.preventDefault(); e.stopImmediatePropagation(); this.toggle(false); }
      else if (e.code === 'KeyF' && this.loot) { e.preventDefault(); e.stopImmediatePropagation(); this.takeAll(); }
    }, true);
    // the pickup moment: anything taken off the floor flies to the slot bar
    bus.on('itemPickedUp', (p: any, it: Item, x: number, z: number) => { if (p?.isLocal && !this.open) this.pickupFx(it, x, z); });
  }

  // ---------------------------------------------------------------- the old pack's API
  toggle(v?: boolean) {
    const want = v ?? !this.open;
    if (want === this.open) { if (want) this.dirty = true; return; }
    if (want) this.show(); else this.hide();
  }
  focus(c: Container) { this.setLoot(c); this.toggle(true); this.dirty = true; }
  openLoot(c: Container, src?: { x?: number; y?: number } | null) {
    // the rummage starts where the thing is on screen
    this.lootFrom = src && typeof src.x === 'number' ? this.screenOf(src.x + 0.5, 0.6, (src.y ?? 0) + 0.5) : null;
    this.focus(c);
  }
  lootFloor() { const p = G.local; if (!p) return; this.lootFrom = this.screenOf(p.x, 0.1, p.z); this.setLoot(floorContainer(G.zone, p.x, p.z, 1.3)); this.lootRef = 'floor'; this.toggle(true); this.dirty = true; }
  resume() { /* the 2D pack is never suspended */ }
  shake() { /* nothing to shake in 2D */ }
  quickDraw() { /* (the old close-up's quick draw) */ }
  update(_dt?: number) { /* drawn on its own frame while open */ }

  private setLoot(c: Container) {
    const z = G.zone;
    if (z && isWorldContainer(c)) { try { ensureLoot(z, c); } catch { /* client: the host fills it */ } }
    this.loot = c; this.lootRef = c.owner; this.fresh = true;
  }

  // ---------------------------------------------------------------- show / hide
  private show() {
    const p = G.local;
    if (!p || p.body?.dead) return;
    this.open = true; this.phase = 'open';
    if (!this.root.isConnected) document.body.append(this.root);
    // looting: the unit kneels and rummages while the column is up
    if (this.loot && !p.full && !(p as any).sittingOn && !(p as any).inVehicle) { p.full = 'kneel'; this.knelt = true; }
    requestAnimationFrame(() => this.root.classList.add('on'));
    sfx('open', 0.4); G.audio?.ui?.('bag_zip', 0.3);
    this.dirty = true; this.sig = '';
    cancelAnimationFrame(this.raf);
    const tick = () => { if (!this.open) return; this.refresh(); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }
  private hide() {
    this.open = false; this.phase = 'off';
    cancelAnimationFrame(this.raf);
    this.root.classList.remove('on');
    this.tip.classList.remove('on');
    if (G.input) G.input.pointerOverUI = false;
    const p = G.local;
    if (p && this.knelt && p.full === 'kneel') p.full = '';
    this.knelt = false;
    this.loot = null; this.lootRef = ''; this.lootFrom = null;
    sfx('back', 0.35);
    setTimeout(() => { if (!this.open) this.root.remove(); }, 200);
  }

  // ---------------------------------------------------------------- drawing
  private refresh() {
    const p = G.local;
    if (!p) return;
    // the floor is a fresh view each time (things land and get picked up)
    if (this.lootRef === 'floor' && this.dirty) this.loot = floorContainer(G.zone, p.x, p.z, 1.3);
    // walked away from what was being looted: the column goes
    const sig = [p.containers().map((c) => c.uid + ':' + c.items.map((i) => i.uid).join(',')).join('|'), [...p.worn.values()].map((i) => i.uid).join(','), p.handR?.uid, p.handL?.uid, this.loot ? this.loot.owner + ':' + this.loot.items.map((i) => i.uid).join(',') : '-'].join('#');
    if (!this.dirty && sig === this.sig) return;
    this.dirty = false; this.sig = sig;
    this.drawYou();
    this.drawLoot();
    this.root.classList.toggle('looting', !!this.loot);
  }
  private drawYou() {
    const p = G.local!;
    const w = p.carriedWeight(), cap = p.capacity();
    const k = Math.min(1.25, w / Math.max(0.1, cap));
    const head = el('header', 'pk2-head');
    head.innerHTML = `<i class="pk2-ico you"></i><span class="pk2-wb${k > 1 ? ' over' : ''}"><b style="width:${Math.round(Math.min(1, k) * 100)}%"></b></span><em>${w.toFixed(1)}<small>/${cap.toFixed(0)} kg</small></em>`;
    // the hands and what is worn
    const eq = el('div', 'pk2-eq');
    const hands: [string, Item | null][] = [['R', p.handR ?? null], ['L', p.handL && p.handL !== p.handR ? p.handL : null]];
    for (const [h, it] of hands) eq.append(this.cell(it, null, `hand ${h}`, true));
    for (const [slot, it] of p.worn) eq.append(this.cell(it, p.containerOf(it) ?? p.inv, String(slot), true));
    const body = el('div', 'pk2-body');
    for (const c of p.containers()) body.append(this.grid(c, false));
    this.you.replaceChildren(head, eq, body);
  }
  private drawLoot() {
    const c = this.loot;
    if (!c) { this.lootCol.replaceChildren(); return; }
    const head = el('header', 'pk2-head');
    head.innerHTML = `<i class="pk2-ico ${c.kind === 'floor' ? 'floor' : 'box'}"></i><span class="pk2-name">${esc(c.kind === 'floor' ? 'Floor' : c.name)}</span>`;
    const all = el('button', 'pk2-key', '<kbd>F</kbd><i class="pk2-ico all"></i>') as HTMLButtonElement;
    all.type = 'button'; all.title = 'Take everything';
    all.addEventListener('click', () => this.takeAll());
    head.append(all);
    const g = this.grid(c, true);
    this.lootCol.replaceChildren(head, g);
    // the rummage: on a fresh search the things come flying out of the container into their cells
    if (this.fresh) {
      this.fresh = false;
      const from = this.lootFrom;
      g.querySelectorAll<HTMLElement>('.pk2-cell img').forEach((im, i) => {
        if (reduce() || !from) return;
        const r = im.getBoundingClientRect();
        im.animate([{ transform: `translate(${from.x - r.left}px, ${from.y - r.top}px) scale(.4)`, opacity: 0 }, { offset: 0.2, opacity: 1 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 120 + i * 45, easing: 'cubic-bezier(.2,.8,.3,1.1)', fill: 'backwards' });
      });
      if (c.items.length) G.audio?.ui?.('rummage', 0.4);
    }
  }
  /** a container's grid: one cell per kind of thing (a count when there are several) */
  private grid(c: Container, isLoot: boolean): HTMLElement {
    const sec = el('div', 'pk2-sec');
    if (!isLoot) {
      const p = G.local!;
      const own = c === p.inv ? null : p.allItems().find((i) => i.inv === c) ?? null;
      const cap = el('div', 'pk2-cap');
      if (own) { const im = new Image(); im.src = itemIconFor(own, iconResCss(20)); cap.append(im); this.hover(cap, itemName(own)); }
      else cap.append(el('i', 'pk2-ico pockets'));
      cap.append(el('small', '', `${c.items.length}`));
      sec.append(cap);
    }
    const grid = el('div', 'pk2-grid');
    const groups = new Map<string, Item[]>();
    for (const it of c.items) { const k = it.key + (it.inv ? ':' + it.uid : '') + ((it.cond ?? 1) < 0.5 ? ':w' : ''); const a = groups.get(k); if (a) a.push(it); else groups.set(k, [it]); }
    for (const items of groups.values()) grid.append(this.cell(items[0], c, '', false, items.length, isLoot));
    // a few empty cells so a grid never looks shut
    const empties = Math.max(0, (isLoot ? 12 : 6) - groups.size);
    for (let i = 0; i < empties; i++) grid.append(el('div', 'pk2-cell empty'));
    sec.append(grid);
    return sec;
  }
  private cell(it: Item | null, c: Container | null, slot: string, eq: boolean, n = 1, isLoot = false): HTMLElement {
    const b = el('button', 'pk2-cell' + (eq ? ' eq' : '') + (it ? '' : ' empty')) as HTMLButtonElement;
    b.type = 'button';
    if (eq && !it) { b.append(el('i', 'pk2-ico ' + (slot.startsWith('hand') ? 'hand' : 'slot'))); this.hover(b, slot.toUpperCase()); return b; }
    if (!it) return b;
    const im = new Image(); im.src = itemIconFor(it, iconResCss(ICON)); im.alt = ''; im.draggable = false;
    b.append(im);
    if (n > 1) b.append(el('b', 'pk2-n', String(n)));
    if ((it.cond ?? 1) < 0.5) b.append(el('i', 'pk2-worn'));
    this.hover(b, itemName(it) + (n > 1 ? ` x${n}` : ''), itemWeight(it));
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const p = G.local; if (!p) return;
      const r = b.getBoundingClientRect();
      const card = () => openItemPanel(it, c ?? p.containerOf(it) ?? p.inv, { x: r.left, y: r.top, w: r.width, h: r.height });
      if (e.button === 2 || eq) { card(); return; }
      if (isLoot && this.loot) { this.take(it, r); return; }
      if (this.loot && c) { this.put(it, c, r); return; }
      card();
    });
    return b;
  }
  private hover(b: HTMLElement, name: string, kg?: number) {
    b.addEventListener('pointerenter', () => {
      const r = b.getBoundingClientRect();
      this.tip.innerHTML = `${esc(name)}${kg ? `<small>${kg.toFixed(2)} kg</small>` : ''}`;
      this.tip.style.left = Math.round(r.left + r.width / 2) + 'px'; this.tip.style.top = Math.round(r.top - 6) + 'px';
      this.tip.classList.add('on');
    });
    b.addEventListener('pointerleave', () => this.tip.classList.remove('on'));
  }

  // ---------------------------------------------------------------- moving things
  private dest(it: Item): Container | null {
    const p = G.local!;
    const cs = p.containers();
    return cs.find((c) => c !== p.inv && c.hasRoom(it)) ?? (p.inv.hasRoom(it) ? p.inv : null);
  }
  private take(it: Item, from: DOMRect) {
    const p = G.local!, c = this.loot!;
    const to = this.dest(it);
    if (!to) { sfx('error', 0.4); this.root.classList.remove('full'); void this.root.offsetWidth; this.root.classList.add('full'); return; }
    transferItem(p, it, c, to);
    G.audio?.ui?.('bag_place', 0.35);
    this.fly(itemIconFor(it, iconResCss(ICON)), from, this.you.querySelector('.pk2-body')?.getBoundingClientRect() ?? null);
    this.dirty = true;
  }
  private put(it: Item, from: Container, at: DOMRect) {
    const p = G.local!, c = this.loot!;
    if (c.kind !== 'floor' && !c.hasRoom(it)) { sfx('error', 0.4); return; }
    transferItem(p, it, from, c);
    G.audio?.ui?.('bag_place', 0.3);
    this.fly(itemIconFor(it, iconResCss(ICON)), at, this.lootCol.querySelector('.pk2-grid')?.getBoundingClientRect() ?? null);
    this.dirty = true;
  }
  private takeAll() {
    const c = this.loot; if (!c) return;
    const r = this.lootCol.getBoundingClientRect();
    let i = 0;
    for (const it of [...c.items]) { if (!this.dest(it)) break; setTimeout(() => { if (this.loot === c && c.items.includes(it)) this.take(it, r); }, i++ * 70); }
  }
  /** an icon flying from one place on screen to another */
  private fly(url: string, from: DOMRect | { left: number; top: number; width: number; height: number }, to: DOMRect | { left: number; top: number; width: number; height: number } | null) {
    if (reduce() || !to) return;
    const im = new Image(); im.src = url; im.className = 'pk2-fly';
    document.body.append(im);
    const x0 = from.left + from.width / 2 - ICON / 2, y0 = from.top + from.height / 2 - ICON / 2, x1 = to.left + to.width / 2 - ICON / 2, y1 = to.top + Math.min(40, to.height / 2) - ICON / 2;
    const mid = { x: (x0 + x1) / 2, y: Math.min(y0, y1) - 60 };
    const a = im.animate([{ transform: `translate(${x0}px, ${y0}px) scale(1)` }, { transform: `translate(${mid.x}px, ${mid.y}px) scale(1.15)` }, { transform: `translate(${x1}px, ${y1}px) scale(.6)`, opacity: 0.2 }], { duration: 420, easing: 'cubic-bezier(.3,.6,.4,1)' });
    a.onfinish = () => im.remove();
  }
  private screenOf(x: number, y: number, z: number): { x: number; y: number } | null {
    const cam = (G.pr as any)?.camera as THREE.Camera | undefined;
    if (!cam) return null;
    const v = new THREE.Vector3(x, y, z).project(cam);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }
  /** the pickup moment: the thing flies off the floor to the slot bar, which pulses */
  private pickupFx(it: Item, x: number, z: number) {
    const s = this.screenOf(x, 0.1, z);
    const bar = document.getElementById('hot12');
    if (!s || !bar) return;
    const r = bar.getBoundingClientRect();
    this.fly(itemIconFor(it, iconResCss(ICON)), { left: s.x - 20, top: s.y - 20, width: 40, height: 40 }, r.width ? r : null);
    setTimeout(() => { bar.classList.remove('got'); void bar.offsetWidth; bar.classList.add('got'); }, 380);
  }
}

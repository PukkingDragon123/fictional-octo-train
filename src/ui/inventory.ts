import { G } from '../game/G';
import { UI, escapeHtml } from './ui';
import { Container } from '../items/container';
import { Item, itemDef, itemName, itemWeight, freshness } from '../items/item';
import { itemIcon, objIcon } from './icons';
import { itemTooltip } from './itemTip';
import { queueTransfers } from '../actions/transfer';
import { floorContainer } from '../items/worldItems';
import { objDef } from '../world/objects';
import { lineOfSight } from '../world/collision';
import { ensureLoot, isWorldContainer } from '../game/worldOps';
import { bus } from '../core/events';
import { itemMenuOptions } from '../interact/itemMenu';
import { TileObject } from '../world/zone';

interface Entry { c: Container; name: string; icon: string; obj?: TileObject; }
interface Group { key: string; items: Item[]; }

/**
 * Project Zomboid-style two-pane inventory: your gear on the left (pockets
 * + every bag you carry as folder tabs), nearby containers on the right
 * (furniture within reach, the floor, bags on the floor, corpses, trunks).
 * Drag & drop, double-click to move, right-click for item actions; every
 * move is a timed action so looting under pressure stays tense.
 */
export class InventoryUI {
  open = false;
  ui: UI;
  wrap: HTMLDivElement;
  left: HTMLDivElement;
  right: HTMLDivElement;
  leftSel = 0;
  rightSel = 0;
  nearby: Entry[] = [];
  private scanT = 0;
  private sig = '';
  private expanded = new Set<string>();
  private drag: { items: Item[]; from: Container; ghost: HTMLDivElement; sx: number; sy: number; started: boolean } | null = null;
  private focusRef = '';

  constructor(ui: UI) {
    this.ui = ui;
    this.wrap = document.createElement('div');
    this.wrap.id = 'inv-wrap';
    this.left = this.makePane('left');
    this.right = this.makePane('right');
    this.wrap.style.display = 'none';
    ui.root.appendChild(this.wrap);
    bus.on('containerChanged', () => { this.sig = ''; });
    bus.on('inventoryChanged', () => { this.sig = ''; });
    bus.on('floorChanged', () => { this.scanT = 0; this.sig = ''; });
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', (e) => this.onDragEnd(e));
  }

  private makePane(side: 'left' | 'right'): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'k-panel inv-pane ' + side;
    el.innerHTML = `<div class="inv-head"><span class="k-tape ${side === 'left' ? '' : 'yellow'}">${side === 'left' ? 'Your Gear' : 'Nearby'}</span><span class="inv-weight"></span></div>
      <div class="inv-body"><div class="inv-tabs"></div><div class="inv-list"></div></div><div class="inv-foot"></div>`;
    el.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    el.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; this.ui.hideTip(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.wrap.appendChild(el);
    return el;
  }

  toggle(v?: boolean) {
    this.open = v ?? !this.open;
    this.wrap.style.display = this.open ? '' : 'none';
    if (!this.open) { G.input.pointerOverUI = false; this.ui.hideTip(); }
    this.sig = ''; this.scanT = 0;
    G.audio?.ui?.(this.open ? 'bagOpen' : 'bagClose');
  }

  /** open and select a specific world container on the right side */
  focus(c: Container) {
    this.focusRef = c.owner;
    if (!this.open) this.toggle(true);
    this.scanT = 0; this.sig = '';
  }

  // ---------------- data ----------------
  private playerEntries(): Entry[] {
    const p = G.local;
    const out: Entry[] = [{ c: p.inv, name: 'Pockets & Hands', icon: this.pocketIcon() }];
    for (const it of p.inv.items) if (it.inv && (p.isWorn(it) || p.handR === it || p.handL === it)) out.push({ c: it.inv, name: itemName(it), icon: itemIcon(it.key) });
    return out;
  }
  private pocketIcon() { return itemIcon('fanny_pack'); }

  private scanNearby() {
    const p = G.local;
    const z = G.zone;
    const out: Entry[] = [];
    const R = 1.75;
    const seen = new Set<number>();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = p.tileX() + dx, ty = p.tileY() + dy;
      if (!z.inb(tx, ty)) continue;
      for (const o of z.objectsAt(tx, ty)) {
        if (seen.has(o.uid) || !o.inv) continue;
        seen.add(o.uid);
        const d = objDef(o.key);
        const w = d?.w ?? 1, dd = d?.d ?? 1;
        const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
        // nearest point of the footprint
        const nx = Math.max(o.x, Math.min(p.x, o.x + rw)), nz = Math.max(o.y, Math.min(p.z, o.y + rd));
        if (Math.hypot(nx - p.x, nz - p.z) > R) continue;
        if (!lineOfSight(z, p.x, p.z, Math.min(o.x + rw - 0.01, Math.max(o.x + 0.01, p.x)), Math.min(o.y + rd - 0.01, Math.max(o.y + 0.01, p.z)))) continue;
        ensureLoot(z, o.inv);
        out.push({ c: o.inv, name: d?.name || o.key, icon: objIcon(o.key), obj: o });
      }
    }
    const floor = floorContainer(z, p.x, p.z, 1.3);
    // bags on the floor become their own tabs
    for (const it of floor.items) if (it.inv) out.push({ c: it.inv, name: itemName(it) + ' (floor)', icon: itemIcon(it.key) });
    for (const corpse of G.creatures?.nearbyCorpses?.(p, R) || []) out.push({ c: corpse.inv, name: corpse.name, icon: itemIcon('skeleton') });
    for (const v of G.items?.nearbyTrunks?.(p) || []) out.push({ c: v.c, name: v.name, icon: itemIcon('car_key') });
    out.push({ c: floor, name: 'Floor', icon: this.floorIcon() });
    this.nearby = out;
    if (this.focusRef) {
      const i = out.findIndex((e) => e.c.owner === this.focusRef);
      if (i >= 0) this.rightSel = i;
      this.focusRef = '';
    }
    if (this.rightSel >= out.length) this.rightSel = 0;
  }
  private _floorIcon = '';
  private floorIcon() {
    if (this._floorIcon) return this._floorIcon;
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    const x = c.getContext('2d')!;
    x.fillStyle = '#120e08'; x.beginPath(); x.moveTo(20, 8); x.lineTo(37, 18); x.lineTo(20, 28); x.lineTo(3, 18); x.closePath(); x.fill();
    x.fillStyle = '#8a7a50'; x.beginPath(); x.moveTo(20, 10); x.lineTo(34, 18); x.lineTo(20, 26); x.lineTo(6, 18); x.closePath(); x.fill();
    x.fillStyle = '#a89668'; x.fillRect(14, 16, 4, 2); x.fillRect(22, 18, 5, 2);
    return (this._floorIcon = c.toDataURL());
  }

  private groups(c: Container): Group[] {
    const m = new Map<string, Group>();
    const p = G.local;
    for (const it of c.items) {
      const d = itemDef(it.key);
      // items with individual state are never merged
      const solo = !!it.inv || p.isWorn(it) || p.handR === it || p.handL === it || (d.fluidCap && it.fluid && it.fluid.amount > 0) || (it.eaten ?? 0) > 0 || (it.cooked ?? 0) > 0;
      const k = solo ? it.key + '#' + it.uid : it.key + '|' + freshness(it);
      let g = m.get(k);
      if (!g) { g = { key: k, items: [] }; m.set(k, g); }
      g.items.push(it);
    }
    const arr = [...m.values()];
    arr.sort((a, b) => {
      const da = itemDef(a.items[0].key), db = itemDef(b.items[0].key);
      return da.cat.localeCompare(db.cat) || da.name.localeCompare(db.name);
    });
    return arr;
  }

  // ---------------- rendering ----------------
  update(dt: number) {
    if (!this.open || !G.local) return;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.35; this.scanNearby(); }
    const pe = this.playerEntries();
    const sig = this.signature(pe) + '||' + this.signature(this.nearby) + `|${this.leftSel}|${this.rightSel}|${[...this.expanded].join(',')}`;
    if (sig !== this.sig) { this.sig = sig; this.renderPane(this.left, pe, 'left'); this.renderPane(this.right, this.nearby, 'right'); }
  }
  private signature(es: Entry[]): string {
    return es.map((e) => e.c.uid + ':' + e.c.items.length + ':' + e.c.items.map((i) => i.uid + '.' + Math.round((i.uses ?? 1) * 20) + '.' + Math.round((i.fluid?.amount ?? 0) * 10) + '.' + Math.round((i.eaten ?? 0) * 10)).join(',')).join(';')
      + (G.local ? '|w' + [...G.local.worn.values()].map((i) => i.uid).join(',') + '|h' + (G.local.handR?.uid ?? 0) + '.' + (G.local.handL?.uid ?? 0) : '');
  }

  private renderPane(pane: HTMLDivElement, entries: Entry[], side: 'left' | 'right') {
    const sel = Math.min(side === 'left' ? this.leftSel : this.rightSel, entries.length - 1);
    const entry = entries[Math.max(0, sel)];
    const tabs = pane.querySelector('.inv-tabs') as HTMLDivElement;
    const list = pane.querySelector('.inv-list') as HTMLDivElement;
    const foot = pane.querySelector('.inv-foot') as HTMLDivElement;
    const wEl = pane.querySelector('.inv-weight') as HTMLSpanElement;
    tabs.innerHTML = '';
    entries.forEach((e, i) => {
      const t = document.createElement('div');
      t.className = 'inv-tab' + (i === sel ? ' active' : '');
      t.dataset.name = e.name;
      t.innerHTML = `<img src="${e.icon}">`;
      t.onclick = () => { if (side === 'left') this.leftSel = i; else this.rightSel = i; this.sig = ''; G.audio?.ui?.('tab'); };
      (t as any)._container = e.c;
      tabs.appendChild(t);
    });
    if (side === 'left') {
      const p = G.local;
      const w = p.carriedWeight(), cap = p.capacity();
      wEl.textContent = `${w.toFixed(1)} / ${cap.toFixed(0)}`;
      wEl.className = 'inv-weight' + (w > cap * 1.25 ? ' over' : w > cap ? ' heavy' : '');
    } else if (entry) {
      wEl.textContent = entry.c.kind === 'floor' ? '' : `${entry.c.contentWeight().toFixed(1)} / ${entry.c.capacity}`;
      wEl.className = 'inv-weight';
    }
    list.innerHTML = '';
    (list as any)._container = entry?.c;
    if (!entry) return;
    const head = document.createElement('div');
    head.className = 'inv-cname';
    head.innerHTML = `<span>${escapeHtml(entry.name)}</span><span></span>`;
    list.appendChild(head);
    const groups = this.groups(entry.c);
    if (!groups.length) {
      const em = document.createElement('div'); em.className = 'inv-empty';
      em.textContent = entry.c.kind === 'floor' ? 'Nothing on the floor here.' : 'Empty.';
      list.appendChild(em);
    }
    for (const g of groups) {
      list.appendChild(this.row(g.items, entry.c, false, g.key));
      if (g.items.length > 1 && this.expanded.has(g.key)) for (const it of g.items) list.appendChild(this.row([it], entry.c, true, g.key));
    }
    foot.innerHTML = '';
    const btn = (label: string, fn: () => void, dim = false) => { const b = document.createElement('div'); b.className = 'k-btn' + (dim ? ' dim' : ''); b.textContent = label; b.onclick = fn; foot.appendChild(b); };
    if (side === 'right') {
      btn('Take all', () => queueTransfers(G.local, [...entry.c.items], entry.c, G.local.inv), !entry.c.items.length);
    } else {
      const target = this.nearby[this.rightSel]?.c;
      btn('Put all', () => target && queueTransfers(G.local, entry.c.items.filter((i) => !G.local.isWorn(i) && G.local.handR !== i && G.local.handL !== i), entry.c, target), !target);
    }
    btn('Close', () => this.toggle(false));
  }

  private row(items: Item[], c: Container, sub: boolean, gkey: string): HTMLDivElement {
    const it = items[0];
    const d = itemDef(it.key);
    const p = G.local;
    const r = document.createElement('div');
    r.className = 'inv-row' + (sub ? ' sub' : '');
    const tags: string[] = [];
    if (p.isWorn(it)) tags.push('<span class="tag w">WORN</span>');
    if (p.handR === it && p.handL === it) tags.push('<span class="tag h">BOTH</span>');
    else if (p.handR === it) tags.push('<span class="tag h">R</span>');
    else if (p.handL === it) tags.push('<span class="tag h">L</span>');
    const fr = freshness(it);
    if (fr === 'rotten') tags.push('<span class="tag rot">ROT</span>');
    else if (fr === 'stale') tags.push('<span class="tag rot">STALE</span>');
    if ((it.frozen ?? 0) > 0.5) tags.push('<span class="tag cold">ICE</span>');
    if (p.lightItem === it && p.flashlightOn) tags.push('<span class="tag">ON</span>');
    const showCond = !!(d.durability || d.weapon || d.clothing);
    const cc = it.cond > 0.6 ? '' : it.cond > 0.25 ? 'mid' : 'low';
    const w = items.reduce((s, i) => s + itemWeight(i), 0);
    r.innerHTML = `${items.length > 1 && !sub ? '' : ''}<img src="${itemIcon(it.key)}"><span class="nm">${escapeHtml(itemName(it))}</span><span class="tags">${tags.join('')}</span>${items.length > 1 ? `<span class="ct">×${items.length}</span>` : '<span class="ct"></span>'}<span class="wt">${w.toFixed(1)}</span>${showCond ? `<span class="cond"><i class="${cc}" style="width:${Math.round(it.cond * 100)}%"></i></span>` : ''}`;
    r.addEventListener('mouseenter', (e) => this.ui.showTip(itemTooltip(it, sub ? 1 : items.length), e.clientX, e.clientY));
    r.addEventListener('mousemove', (e) => this.ui.showTip(itemTooltip(it, sub ? 1 : items.length), e.clientX, e.clientY));
    r.addEventListener('mouseleave', () => this.ui.hideTip());
    r.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const ghost = document.createElement('div');
      ghost.id = 'drag-ghost';
      ghost.innerHTML = `<img src="${itemIcon(it.key)}" style="width:48px;height:48px;image-rendering:pixelated">${!sub && items.length > 1 ? `<span>${items.length}</span>` : ''}`;
      // single item by default; shift-drag takes the whole stack
      this.drag = { items: e.shiftKey && !sub ? items : [it], from: c, ghost, sx: e.clientX, sy: e.clientY, started: false };
    });
    r.addEventListener('dblclick', () => {
      const target = this.otherSide(c);
      if (target) queueTransfers(p, [it], c, target);
    });
    r.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.ui.hideTip();
      const opts = itemMenuOptions(p, it, c, sub ? [it] : items);
      this.ui.openMenu(e.clientX, e.clientY, itemName(it), opts);
    });
    if (items.length > 1 && !sub) {
      r.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('ct')) { if (this.expanded.has(gkey)) this.expanded.delete(gkey); else this.expanded.add(gkey); this.sig = ''; }
      });
      (r.querySelector('.ct') as HTMLElement).style.cursor = 'pointer';
    }
    return r;
  }

  /** the container on the opposite pane (for double-click moves) */
  private otherSide(c: Container): Container | null {
    const p = G.local;
    const mine = p.containers().includes(c);
    if (mine) return this.nearby[this.rightSel]?.c ?? null;
    const left = this.playerEntries()[this.leftSel]?.c ?? p.inv;
    return left;
  }

  private onDragMove(e: PointerEvent) {
    const d = this.drag; if (!d) return;
    if (!d.started && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 6) {
      d.started = true;
      document.body.appendChild(d.ghost);
      this.ui.hideTip();
      G.audio?.ui?.('grab');
    }
    if (d.started) {
      d.ghost.style.left = (e.clientX - 24) + 'px';
      d.ghost.style.top = (e.clientY - 24) + 'px';
      document.querySelectorAll('.inv-drop-hl').forEach((n) => n.classList.remove('inv-drop-hl'));
      const tgt = this.dropTarget(e.clientX, e.clientY);
      tgt?.el.classList.add('inv-drop-hl');
    }
  }
  private dropTarget(x: number, y: number): { el: HTMLElement; c: Container } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const tab = el.closest('.inv-tab') as HTMLElement | null;
    if (tab && (tab as any)._container) return { el: tab, c: (tab as any)._container };
    const list = el.closest('.inv-list') as HTMLElement | null;
    if (list && (list as any)._container) return { el: list, c: (list as any)._container };
    return null;
  }
  private onDragEnd(e: PointerEvent) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    d.ghost.remove();
    document.querySelectorAll('.inv-drop-hl').forEach((n) => n.classList.remove('inv-drop-hl'));
    if (!d.started) return;
    const tgt = this.dropTarget(e.clientX, e.clientY);
    const p = G.local;
    if (tgt) {
      if (tgt.c !== d.from) queueTransfers(p, d.items, d.from, tgt.c);
      return;
    }
    // dropped onto the world: put on the floor
    const overPanel = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.k-panel');
    if (!overPanel && p.containers().includes(d.from)) {
      const floor = floorContainer(G.zone, p.x, p.z);
      queueTransfers(p, d.items, d.from, floor);
    }
    void isWorldContainer;
  }
}

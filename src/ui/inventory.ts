import './bag/bag.css';
import { G } from '../game/G';
import { UI } from './ui';
import { Container } from '../items/container';
import { Item, itemDef, itemName, ItemDef } from '../items/item';
import { itemIconFor, itemIcon, objIcon } from './icons';
import { itemTag } from './itemTip';
import { queueTransfers, resolveTarget, TransferAction } from '../actions/transfer';
import { floorContainer } from '../items/worldItems';
import { objDef } from '../world/objects';
import { lineOfSight } from '../world/collision';
import { ensureLoot, isWorldContainer, containerRef, transferItem } from '../game/worldOps';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { itemMenuOptions } from '../interact/itemMenu';
import { TileObject } from '../world/zone';
import { WearAction, EquipAction } from '../actions/basic';
import { InstantAction } from '../actions/action';
import { gridSpec, floorSpec, packLayout, occupancy, testFit, autoPack, dimsOf, footprintOf, isEquipped, GridSpec, Occ, Anchor, Placement, Rot, Fit, Region } from '../items/grid';
import { settlePack, bestDest } from '../items/packResolver';
import { gridIcon } from './bag/gridIcons';
import * as Art from './bag/bagArt';
import { CELL, PCELL } from './bag/bagArt';
import { PixelCanvas } from '../gfx/pixel';
import { debtorNo } from './holo/holo';
import { registerBagSounds } from './bag/bagSounds';

/**
 * The backpack. Opening the inventory swings your pack round on its straps,
 * hung from a spring scale that reads what you carry, unzips it and shows
 * the canvas lining with the grid stitched into it. Your clothes lie on the
 * left as a paper doll on a concrete slab (pockets sewn on, hands below the
 * sleeves), and whatever you are looting sits on the right as what it is: a
 * drawer's wooden tray, fridge shelves, a trunk's carpet, the floor.
 *
 * Items lie in the grid at their footprint, drawn from their 3D models. Drag
 * to move (snaps to cells; R / right-click / a second finger rotates; Shift
 * takes half a stack, Ctrl one; the wheel changes the count), double-click or
 * Ctrl-click to quick-move, right-click or long-press for item actions, drop
 * on the slab to wear, on a hand to hold, outside everything to drop it on
 * the floor. On touch: tap to pick up, tap (or touch and slide) to place.
 * Shake the bag by its handle to repack it. Item facts hang on a tag tied to
 * the item. World containers rearrange through ops, so co-op looters see the
 * same layout; your own pack is yours and is saved with you.
 */

interface Entry { c: Container; name: string; icon: string; obj?: TileObject; style?: string }
type Kind = 'bag' | 'pocket' | 'loot' | 'floor';
type Target =
  | { k: 'grid'; view: GridView; gx: number; gy: number; fit: Fit }
  | { k: 'hand'; hand: 'R' | 'L'; ok: boolean }
  | { k: 'wear'; ok: boolean }
  | { k: 'tab'; c: Container; ok: boolean; el: HTMLElement }
  | { k: 'floor' }
  | { k: 'none' };
interface Drag {
  stack: Item[];
  count: number;
  from: Container;
  src: 'grid' | 'worn' | 'hand';
  hand?: 'R' | 'L';
  view?: GridView;
  rot: Rot;
  grab: [number, number];
  pointerId: number;
  touch: boolean;
  held: boolean;
  ghost: HTMLDivElement;
  over: Target;
  srcEl: HTMLElement | null;
  cell: number;
  /** a finger dragging holds the item above itself (art px); a tap-to-place puts it under the finger */
  lift?: number;
}
interface Press { pointerId: number; x0: number; y0: number; t: number; touch: boolean; el: HTMLElement; long: number; done: boolean; shift: boolean; ctrl: boolean; start: () => void; tap: (x: number, y: number, pr: Press) => void; menu: (x: number, y: number) => void }

const LONG_MS = 460;
const isTouchEv = (e: PointerEvent) => e.pointerType !== 'mouse';

/** one grid on screen: a bag interior, one pocket, a loot tray or the floor */
class GridView {
  el: HTMLDivElement;
  foot: HTMLDivElement;
  els = new Map<number, HTMLDivElement>();
  /** the floor has no stored positions: its layout is computed on view */
  layout: Map<Item, Placement> | null = null;
  occ: Occ | null = null;
  constructor(public c: Container, public spec: GridSpec, public cell: number, public rx: number, public ry: number, public rw: number, public rh: number, public kind: Kind, public region?: Region) {
    this.el = document.createElement('div');
    this.el.className = 'bg-grid';
    this.foot = document.createElement('div');
    this.foot.className = 'gfoot';
    this.el.appendChild(this.foot);
  }
  contains(gx: number, gy: number) { return gx >= this.rx && gy >= this.ry && gx < this.rx + this.rw && gy < this.ry + this.rh; }
}

export class InventoryUI {
  open = false;
  ui: UI;
  root: HTMLDivElement;
  private dim: HTMLDivElement;
  private stage: HTMLDivElement;
  private floorHint: HTMLDivElement;
  private tagEl: HTMLDivElement;
  private svg: SVGSVGElement;
  private strPath: SVGPathElement;
  private hud: HTMLDivElement;
  private bs = 2;
  private compact = false;
  private compactShow: 'body' | 'loot' = 'loot';
  private views: GridView[] = [];
  private nearby: Entry[] = [];
  private lootSel = 0;
  private bagSel = 0;
  private focusRef = '';
  private scanT = 0;
  private settleT = 0;
  private renderT = 0;
  private structSig = '';
  private itemSig = '';
  private dirty = true;
  private drag: Drag | null = null;
  private press: Press | null = null;
  private sel: { it: Item; el: HTMLElement } | null = null;
  private hoverEl: HTMLElement | null = null;
  private hoverTimer = 0;
  private closing = 0;
  private lastTap = { uid: 0, t: 0 };
  private touchHeld = new Set<number>();
  private artCache = new Map<string, { url: string; w: number; h: number; ix?: number; iy?: number }>();
  private anchorOf = new WeakMap<HTMLElement, { view: GridView; a: Anchor }>();
  private wornOf = new WeakMap<HTMLElement, Item>();
  private rigEl: HTMLDivElement | null = null;
  private swingEl: HTMLDivElement | null = null;
  private lastLoad = -1;
  private bagEls: { plunger?: HTMLDivElement; dring?: HTMLDivElement; readout?: HTMLDivElement; straps?: HTMLImageElement; strapsKey?: string } = {};
  private handEls: Record<'R' | 'L', HTMLDivElement | null> = { R: null, L: null };
  private wearZone: HTMLDivElement | null = null;
  private tabEls: { el: HTMLElement; c: Container }[] = [];

  constructor(ui: UI) {
    this.ui = ui;
    registerBagSounds();
    const r = document.createElement('div');
    r.id = 'bag-root';
    this.root = r;
    this.dim = document.createElement('div'); this.dim.className = 'bg-dim';
    this.stage = document.createElement('div'); this.stage.className = 'bg-stage';
    this.floorHint = document.createElement('div'); this.floorHint.className = 'bg-floorhint'; this.floorHint.textContent = 'let go: drop it on the floor';
    this.tagEl = document.createElement('div'); this.tagEl.className = 'bg-tag';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.setAttribute('class', 'bg-string');
    this.strPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); this.svg.appendChild(this.strPath);
    this.hud = document.createElement('div'); this.hud.className = 'bg-hud';
    r.append(this.dim, this.stage, this.floorHint, this.svg, this.tagEl, this.hud);
    document.body.appendChild(r);
    bus.on('containerChanged', () => { this.dirty = true; });
    bus.on('inventoryChanged', () => { this.dirty = true; this.settleT = Math.min(this.settleT, 0.05); });
    bus.on('floorChanged', () => { this.scanT = 0; this.dirty = true; });
    bus.on('gridNoRoom', (it: Item, to: Container) => { if (this.open) this.noRoom(it, to); });
    bus.on('gridOverflow', (it: Item, where: string) => { if (this.open) this.note(where === 'hand' ? 'no room: in hand' : 'no room: dropped', itemName(it)); });
    bus.on('uiScale', () => { this.structSig = ''; });
    window.addEventListener('resize', () => { this.structSig = ''; });
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e, false));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    r.addEventListener('pointerdown', (e) => this.onRootDown(e));
    r.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.drag && !this.drag.touch) this.rotate(); });
    r.addEventListener('wheel', (e) => { if (this.drag && this.drag.stack.length > 1) { e.preventDefault(); this.setCount(this.drag.count + (e.deltaY < 0 ? 1 : -1)); } }, { passive: false });
    // inside the bag the page must not scroll or zoom under a finger
    r.addEventListener('touchmove', (e) => { if (this.open) e.preventDefault(); }, { passive: false });
  }

  // ================================================================ open / close
  toggle(v?: boolean) {
    const want = v ?? !this.open;
    if (want === this.open && !this.closing) return;
    if (want) {
      clearTimeout(this.closing); this.closing = 0;
      this.open = true;
      this.root.className = 'on opening';
      this.structSig = ''; this.itemSig = ''; this.scanT = 0; this.dirty = true;
      G.input.pointerOverUI = true;
      G.audio?.ui?.('bag_zip', 0.6);
      setTimeout(() => G.audio?.ui?.('bagOpen', 0.45), 260);
      setTimeout(() => { if (this.open) this.root.classList.remove('opening'); }, 760);
      this.update(0);
    } else {
      this.cancelDrag(); this.cancelPress(); this.hideTag(); this.setSel(null);
      this.open = false;
      this.ui.closeMenu?.();
      this.root.classList.remove('opening');
      this.root.classList.add('closing');
      G.audio?.ui?.('bag_zip', 0.45);
      setTimeout(() => G.audio?.ui?.('bagClose', 0.45), 120);
      this.closing = window.setTimeout(() => { this.closing = 0; if (!this.open) { this.root.className = ''; G.input.pointerOverUI = false; } }, 260);
      G.input.pointerOverUI = false;
    }
  }

  /** open and show a specific world container on the right */
  focus(c: Container) {
    this.focusRef = c.owner;
    this.compactShow = 'loot';
    if (!this.open) this.toggle(true);
    this.scanT = 0; this.structSig = '';
  }

  // ================================================================ data
  private carriedBags(): Container[] {
    const p = G.local;
    const out: Container[] = [];
    const back = p.worn.get('back' as any);
    if (back?.inv) out.push(back.inv);
    for (const h of [p.handR, p.handL]) if (h?.inv && !out.includes(h.inv)) out.push(h.inv);
    const belt = p.worn.get('belt' as any);
    if (belt?.inv && !out.includes(belt.inv)) out.push(belt.inv);
    for (const c of p.containers()) if (c !== p.inv && !out.includes(c)) out.push(c);
    return out;
  }
  private bagItemOf(c: Container): Item | undefined {
    const uid = Number(c.owner.slice(5));
    for (const it of G.local.inv.items) if (it.uid === uid) return it;
    return G.local.allItems().find((i) => i.inv === c);
  }

  private scanNearby() {
    const p = G.local;
    const z = G.zone;
    if (!p || !z) return;
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
        const nx = Math.max(o.x, Math.min(p.x, o.x + rw)), nz = Math.max(o.y, Math.min(p.z, o.y + rd));
        if (Math.hypot(nx - p.x, nz - p.z) > R) continue;
        if (!lineOfSight(z, p.x, p.z, Math.min(o.x + rw - 0.01, Math.max(o.x + 0.01, p.x)), Math.min(o.y + rd - 0.01, Math.max(o.y + 0.01, p.z)))) continue;
        ensureLoot(z, o.inv);
        out.push({ c: o.inv, name: d?.name || o.key, icon: objIcon(o.key), obj: o });
      }
    }
    const floor = floorContainer(z, p.x, p.z, 1.3);
    for (const it of floor.items) if (it.inv) out.push({ c: it.inv, name: itemName(it), icon: itemIcon(it.key, '', 16) });
    for (const corpse of G.creatures?.nearbyCorpses?.(p, R) || []) out.push({ c: corpse.inv, name: corpse.name, icon: itemIcon('skeleton', '', 16) });
    for (const v of G.items?.nearbyTrunks?.(p) || []) out.push({ c: v.c, name: v.name, icon: itemIcon('car_key', '', 16) });
    out.push({ c: floor, name: 'Floor', icon: '' });
    const prev = this.nearby[this.lootSel]?.c.owner;
    this.nearby = out;
    if (this.focusRef) {
      const i = out.findIndex((e) => e.c.owner === this.focusRef);
      if (i >= 0) this.lootSel = i;
      this.focusRef = '';
    } else if (prev) {
      const i = out.findIndex((e) => e.c.owner === prev || (prev.startsWith('floor:') && e.c.kind === 'floor'));
      this.lootSel = i >= 0 ? i : 0;
    }
    if (this.lootSel >= out.length) this.lootSel = 0;
  }

  // ================================================================ frame
  update(dt: number) {
    const p = G.local;
    if (!p) return;
    // the pack settles itself whether the bag is open or not
    this.settleT -= dt;
    if (this.settleT <= 0) { this.settleT = 0.4; try { settlePack(p); } catch (e) { console.warn('settle', e); } }
    if (!this.open) return;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.4; this.scanNearby(); this.dirty = true; }
    this.renderT -= dt;
    const struct = this.structSignature();
    if (struct !== this.structSig) { this.structSig = struct; this.build(); this.dirty = true; }
    if (this.dirty || this.renderT <= 0) {
      this.renderT = 0.15;
      const sig = this.itemSignature();
      const changed = sig !== this.itemSig || this.dirty;
      if (changed) { this.itemSig = sig; this.renderItems(); }
      this.dirty = false;
      this.updateWeight();
      if (changed && this.drag) this.refreshTarget();
    }
  }

  private structSignature(): string {
    const p = G.local;
    const bags = this.carriedBags();
    if (this.bagSel >= bags.length) this.bagSel = 0;
    const bag = bags[this.bagSel];
    const loot = this.nearby[this.lootSel];
    const ls = loot ? (loot.c.kind === 'floor' ? 'floor:' + floorSpec(loot.c.items).h : loot.c.uid + ':' + (gridSpec(loot.c)?.sig ?? '')) : '-';
    return [bags.map((c) => c.uid).join(','), bag ? bag.uid + ':' + gridSpec(bag)?.sig : '-', [...p.worn.entries()].map(([s, i]) => s + i.uid).join(','),
      ls, this.nearby.map((e) => e.c.uid + e.name).join(','), this.lootSel, innerWidth, innerHeight, this.compact ? this.compactShow : '', loot?.c.locked ? 'L' : ''].join('|');
  }
  private itemSignature(): string {
    const p = G.local;
    let s = '';
    const fl = this.nearby[this.lootSel]?.c;
    if (fl?.kind === 'floor') s += 'F' + fl.items.map((i) => i.uid).join(',');
    for (const v of this.views) {
      s += v.c.uid + ':';
      for (const it of v.c.items) s += it.uid + '.' + (it.gx ?? '_') + '.' + (it.gy ?? '_') + '.' + (it.rot ?? 0) + '.' + Math.round((it.uses ?? 1) * 20) + '.' + Math.round((it.fluid?.amount ?? 0) * 10) + '.' + Math.round(it.cond * 20) + ',';
      s += ';';
    }
    s += '|' + (p.handR?.uid ?? 0) + '.' + (p.handL?.uid ?? 0) + '|' + p.actions.list.length + '|' + (p.actions.current instanceof TransferAction ? Math.round(p.actions.current.progress * 10) : -1);
    return s;
  }

  // ================================================================ layout & build
  /** art-pixel size of each panel, then the zoom that fits the screen */
  private build() {
    const p = G.local;
    this.views = [];
    this.tabEls = [];
    this.stage.innerHTML = '';
    this.handEls = { R: null, L: null };
    this.wearZone = null;
    this.bagEls = {};
    const bags = this.carriedBags();
    const bagC = bags[this.bagSel] ?? null;
    const entry = this.nearby[this.lootSel];

    // --- art sizes
    const bagSpec = bagC ? gridSpec(bagC) : null;
    const bagItem = bagC ? this.bagItemOf(bagC) : undefined;
    const bagKey = bagSpec?.bagKey || bagItem?.key || '';
    const look = Art.bagLook(bagKey, bagItem ? itemDef(bagItem.key).clothing?.look.color ?? itemDef(bagItem.key).tint : undefined);
    look.key = bagKey;
    const bagArt = bagSpec ? this.cachedArt('bag|' + bagKey + '|' + bagSpec.sig, () => { const a = Art.paintBag(look, bagSpec); return { pc: a.pc, ix: a.ix, iy: a.iy }; }) : null;
    const bagW = bagArt ? bagArt.w : 96, bagH = bagArt ? bagArt.h : 80;
    const rigW = Math.max(bagW + 26, 110);
    const compactRig = innerHeight < 560;
    const hookH = compactRig ? 0 : 12, scaleH = compactRig ? 0 : 40, strapH = compactRig ? 38 : 46;
    const rigH = hookH + scaleH + strapH + bagH + 6;
    const dollW = 20 + Art.DOLL_W, dollH = Art.DOLL_H;
    let lootSpec: GridSpec | null = null;
    let lootStyle = 'wood';
    if (entry) {
      lootSpec = entry.c.kind === 'floor' ? floorSpec(entry.c.items) : gridSpec(entry.c);
      lootStyle = entry.c.kind === 'floor' ? 'floor' : entry.c.owner.startsWith('item:') ? 'canvas' : lootSpec?.style || 'wood';
    }
    const trayArt = lootSpec ? (lootStyle === 'canvas' ? null : this.cachedArt('tray|' + lootStyle + '|' + lootSpec.sig + '|' + lootSpec.w + 'x' + lootSpec.h, () => { const a = Art.paintTray(lootSpec!, lootStyle, (entry?.c.uid ?? 1) % 7 + 1); return { pc: a.pc, ix: a.ix, iy: a.iy }; })) : null;
    const lootBagArt = lootSpec && lootStyle === 'canvas' ? this.cachedArt('bag|' + (lootSpec.bagKey || '') + '|' + lootSpec.sig + '|loot', () => { const lk = Art.bagLook(lootSpec!.bagKey || ''); const a = Art.paintBag(lk, lootSpec!); return { pc: a.pc, ix: a.ix, iy: a.iy }; }) : null;
    const tray = trayArt || lootBagArt;
    const lootW = Math.max(tray ? tray.w : 80, 110), lootH = (tray ? tray.h : 60) + 22 + (entry && entry.c.kind !== 'floor' ? 24 : 0);

    // --- zoom
    const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
    const W = innerWidth, H = innerHeight;
    const gap = 10;
    const fullW = dollW + gap + rigW + gap + lootW + 8, fullH = Math.max(dollH, rigH, lootH) + 8;
    let k = Math.floor(Math.min(W * 0.97 / fullW, H * 0.96 / fullH) * dpr);
    this.compact = k / dpr < 1.99 && W / dpr < 1400;
    let layoutW = fullW, layoutH = fullH;
    const tapeH = 14;
    if (this.compact) {
      // phones: the bag, and beside it either your body or what you are looting (tapes switch)
      // one zoom for both views, so switching does not jump
      const sideW = Math.max(dollW, lootW, 120);
      layoutW = rigW + gap + sideW + 6; layoutH = Math.max(dollH, lootH - 10, rigH) + 2;
      k = Math.floor(Math.min(W / layoutW, H / layoutH) * dpr + 0.001);
    }
    k = Math.max(2, k);
    this.bs = k / dpr;
    const bs = this.bs;
    this.root.style.setProperty('--bs', bs + 'px');
    const px = (v: number) => Math.round(v * bs) + 'px';
    this.stage.style.left = Math.max(0, Math.round((W - layoutW * bs) / 2)) + 'px';
    this.stage.style.top = Math.max(0, Math.round((H - layoutH * bs) / 2)) + 'px';
    this.stage.style.width = px(layoutW); this.stage.style.height = px(layoutH);

    if (this.compact) {
      this.buildRig(2, Math.max(0, layoutH - rigH - 2), rigW, hookH, scaleH, strapH, bags, bagC, bagSpec, bagArt, look, compactRig);
      const sx = rigW + gap;
      if (this.compactShow === 'body') this.buildDoll(sx, 1, p, bagItem);
      else this.buildLoot(sx, Math.max(tapeH - 12, Math.round((layoutH - lootH) / 2)), entry, lootSpec, tray, lootStyle, false);
      this.buildTapes(this.compactShow === 'body' ? sx + 22 : sx, 0, layoutW - sx - 22, true);
      return;
    }
    let x = 4;
    this.buildDoll(x, layoutH - dollH - 4, p, bagItem);
    x += dollW + gap;
    this.buildRig(x, 0, rigW, hookH, scaleH, strapH, bags, bagC, bagSpec, bagArt, look, compactRig);
    x += rigW + gap;
    this.buildLoot(x, Math.max(0, Math.round((layoutH - lootH) * 0.55)), entry, lootSpec, tray, lootStyle, true);
  }

  /** the strip of masking-tape labels: every container in reach (and on phones, your body) */
  private buildTapes(x0: number, y0: number, maxW: number, withBody: boolean) {
    const tapes = document.createElement('div');
    tapes.className = 'bg-panel bg-tapes';
    this.place(tapes, x0, y0);
    tapes.style.maxWidth = Math.round(maxW * this.bs) + 'px';
    tapes.style.flexWrap = 'wrap';
    const add = (label: string, on: boolean, i: number, pick: () => void, c?: Container) => {
      const t = document.createElement('div');
      t.className = 'bg-tape';
      t.style.setProperty('--r', ((i * 37) % 7 - 3) + 'deg');
      const a = this.cachedArt('tape|' + label + '|' + on, () => ({ pc: Art.paintTape(label, on) }));
      t.appendChild(this.img(a.url, a.w, a.h));
      t.addEventListener('pointerdown', (ev) => { if (this.drag) return; ev.stopPropagation(); pick(); G.audio?.ui?.('tab'); });
      tapes.appendChild(t);
      if (c) this.tabEls.push({ el: t, c });
    };
    if (withBody) add('body', this.compactShow === 'body', 99, () => { this.compactShow = 'body'; this.structSig = ''; });
    this.nearby.forEach((e, i) => add(e.c.kind === 'floor' ? 'floor' : e.name, i === this.lootSel && (!withBody || this.compactShow === 'loot'), i, () => {
      this.lootSel = i; this.compactShow = 'loot'; this.structSig = '';
      if (e.obj) G.audio?.objSound?.(e.obj.key, 'open', e.obj.x, e.obj.y);
    }, e.c));
    this.stage.appendChild(tapes);
    return tapes;
  }

  private img(url: string, w: number, h: number, cls = ''): HTMLImageElement {
    const im = new Image();
    im.src = url; im.alt = ''; im.draggable = false;
    if (cls) im.className = cls;
    im.style.width = Math.round(w * this.bs) + 'px'; im.style.height = Math.round(h * this.bs) + 'px';
    return im;
  }
  private place(el: HTMLElement, x: number, y: number, w?: number, h?: number) {
    const bs = this.bs;
    el.style.left = Math.round(x * bs) + 'px'; el.style.top = Math.round(y * bs) + 'px';
    if (w !== undefined) el.style.width = Math.round(w * bs) + 'px';
    if (h !== undefined) el.style.height = Math.round(h * bs) + 'px';
  }
  private cachedArt(key: string, make: () => { pc: PixelCanvas; ix?: number; iy?: number }) {
    let a = this.artCache.get(key);
    if (!a) {
      const r = make();
      a = { url: Art.toUrl(r.pc), w: r.pc.w, h: r.pc.h, ix: r.ix, iy: r.iy };
      this.artCache.set(key, a);
      if (this.artCache.size > 160) this.artCache.delete(this.artCache.keys().next().value!);
    }
    return a;
  }

  // ---------------------------------------------------------------- the doll
  private buildDoll(x0: number, y0: number, p: any, bagItem?: Item) {
    const panel = document.createElement('div');
    panel.className = 'bg-panel bg-doll';
    this.place(panel, x0, y0, 20 + Art.DOLL_W, Art.DOLL_H);
    this.stage.appendChild(panel);
    const dx = 20;
    // garments
    const garments: Art.DollGarment[] = [];
    for (const [slot, it] of p.worn as Map<string, Item>) {
      const d = itemDef(it.key);
      const look = d.clothing?.look;
      garments.push({ key: it.key, slot, part: look?.part || '', color: look?.color ?? d.tint ?? 0x7a7a70, sleeve: look?.sleeve, tex: look?.tex, uid: it.uid });
    }
    const pspec = gridSpec(p.inv);
    const taken: { x: number; y: number; w: number; h: number }[] = [];
    const pockets: (Art.DollPocket & { r: Region })[] = [];
    for (const r of pspec?.regions || []) {
      const at = Art.pocketAt(r.pocket || r.id, r.w, r.h, taken);
      const g = garments.find((gg) => gg.uid === r.garment);
      pockets.push({ x: at.x, y: at.y, w: r.w * PCELL + 4, h: r.h * PCELL + 4, color: g ? g.color : 0x7a7a70, label: r.label, r });
    }
    const number = debtorNo(p);
    const back = p.worn.get('back');
    const band = [...p.worn.values()].some((i: Item) => i.key === 'bailiff_band');
    const sig = garments.map((g) => g.key + g.uid + g.color).join(',') + '|' + pockets.map((q) => q.x + ',' + q.y + ',' + q.w + ',' + q.h).join(';') + '|' + number + '|' + (back?.key ?? '') + band;
    const art = this.cachedArt('doll|' + sig, () => ({ pc: Art.paintDoll(garments, pockets, number.replace(/^D-?/, 'D'), { bag: back ? itemDef(back.key).clothing?.look.color ?? itemDef(back.key).tint ?? 0x5a5a3a : undefined, band }) }));
    const im = this.img(art.url, art.w, art.h);
    this.place(im, dx, 0);
    panel.appendChild(im);
    // the slab takes clothes dropped on it
    const zone = document.createElement('div');
    zone.className = 'bg-dollzone';
    this.place(zone, dx + 26, 2, Art.DOLL_W - 52, Art.DOLL_H - 8);
    panel.appendChild(zone);
    this.wearZone = zone;
    // pockets
    for (const q of pockets) {
      const v = new GridView(p.inv, pspec!, PCELL, q.r.x, q.r.y, q.r.w, q.r.h, 'pocket', q.r);
      this.place(v.el, dx + q.x + 2, q.y + 2, q.r.w * PCELL, q.r.h * PCELL);
      v.el.title = '';
      panel.appendChild(v.el);
      this.views.push(v);
    }
    // hands
    for (const hand of ['R', 'L'] as const) {
      const it = hand === 'R' ? p.handR : p.handL;
      const two = it && p.handR === p.handL;
      const el = document.createElement('div');
      el.className = 'bg-hand';
      const hx = hand === 'R' ? dx + 1 : dx + Art.DOLL_W - 35, hy = 130;
      this.place(el, hx, hy, 34, 34);
      const slot = this.cachedArt('hand|' + hand + '|' + !!it, () => ({ pc: Art.paintHandSlot(hand, !!it) }));
      const sim = this.img(slot.url, slot.w, slot.h); sim.style.position = 'absolute'; el.appendChild(sim);
      if (it && !(two && hand === 'L')) {
        const i = document.createElement('i');
        i.style.backgroundImage = `url(${itemIconFor(it, 32)})`;
        this.place(i, 1, 1, 32, 32);
        el.appendChild(i);
        this.wornOf.set(el, it);
      } else if (two && hand === 'L') {
        el.style.opacity = '0.55';
      }
      el.addEventListener('pointerdown', (e) => this.onHandDown(e, el, hand));
      el.addEventListener('contextmenu', (e) => this.onItemMenu(e, el));
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !this.drag && it) this.hoverTag(el, it, 1); });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.drag) this.unhover(el); });
      panel.appendChild(el);
      this.handEls[hand] = el;
    }
    // worn things pinned down the side
    let by = this.compact ? 16 : 4;
    const order = ['hat', 'eyes', 'mask', 'neck', 'jacket', 'fullsuit', 'sweater', 'shirt', 'tshirt', 'hands', 'wrist', 'belt', 'back', 'pants', 'socks', 'shoes'];
    const worn = [...(p.worn as Map<string, Item>).entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99);
    for (const [slot, it] of worn) {
      const b = document.createElement('div');
      b.className = 'bg-badge' + (it.key === 'bailiff_band' ? ' locked' : '');
      this.place(b, 1, by, 16, 16);
      const i = document.createElement('i');
      i.style.backgroundImage = `url(${itemIconFor(it, 16)})`;
      b.appendChild(i);
      this.wornOf.set(b, it);
      b.dataset.slot = slot;
      b.addEventListener('pointerdown', (e) => this.onWornDown(e, b, it));
      b.addEventListener('contextmenu', (e) => this.onItemMenu(e, b));
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !this.drag) this.hoverTag(b, it, 1, 'worn · drag off to take off'); });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.drag) this.unhover(b); });
      panel.appendChild(b);
      by += 19;
      if (by > Art.DOLL_H - 18) break;
    }
  }

  // ---------------------------------------------------------------- the rig (scale, straps, bag)
  private buildRig(x0: number, y0: number, rigW: number, hookH: number, scaleH: number, strapH: number, bags: Container[], bagC: Container | null, spec: GridSpec | null, art: { url: string; w: number; h: number; ix?: number; iy?: number } | null, look: Art.BagLook, compactRig: boolean) {
    const rig = document.createElement('div');
    rig.className = 'bg-panel bg-rig';
    const bagW = art ? art.w : 96, bagH = art ? art.h : 80;
    const rigH = hookH + scaleH + strapH + bagH + 6;
    this.place(rig, x0, y0, rigW, rigH);
    this.stage.appendChild(rig);
    this.rigEl = rig;
    const cx = Math.round(rigW / 2);
    // chain from the top of the screen and the scale
    if (!compactRig) {
      const chain = document.createElement('div'); chain.className = 'bg-chain';
      this.place(chain, cx - 1, -y0 - 60, 2, hookH + 62);
      rig.appendChild(chain);
      const sc = this.cachedArt('scale', () => ({ pc: Art.paintScale() }));
      const sim = this.img(sc.url, sc.w, sc.h); this.place(sim, cx - 7, hookH - 4); rig.appendChild(sim);
      const pl = document.createElement('div'); pl.className = 'bg-plunger'; this.place(pl, cx - 1, hookH + 33, 2, 6); rig.appendChild(pl);
      const dr = document.createElement('div'); dr.className = 'bg-dring'; this.place(dr, cx - 4, hookH + 38, 8, 6); rig.appendChild(dr);
      const ro = document.createElement('div'); ro.className = 'bg-readout'; this.place(ro, cx + 9, hookH + 14); rig.appendChild(ro);
      this.bagEls = { plunger: pl, dring: dr, readout: ro };
    } else {
      const ro = document.createElement('div'); ro.className = 'bg-readout'; this.place(ro, 2, 6); rig.appendChild(ro);
      this.bagEls = { readout: ro };
    }
    const bagY = hookH + scaleH + strapH;
    const bx = Math.round((rigW - bagW) / 2);
    // straps
    if (bagC && art) {
      const st = new Image(); st.className = 'bg-straps'; st.alt = ''; st.draggable = false;
      this.place(st, 0, hookH + scaleH - (compactRig ? 0 : 2), rigW, strapH + 6);
      rig.appendChild(st);
      this.bagEls.straps = st;
      this.bagEls.strapsKey = '';
      (st as any)._geom = { w: rigW, h: strapH + 6, ax: cx, bx0: bx + 5, bx1: bx + bagW - 5, look };
    }
    const swing = document.createElement('div');
    swing.className = 'bg-swing';
    this.place(swing, bx, bagY, bagW, bagH);
    rig.appendChild(swing);
    this.swingEl = swing;
    if (!bagC || !spec || !art) {
      const nb = document.createElement('div');
      nb.className = 'bg-nobag';
      nb.innerHTML = 'no pack<br>find a bag';
      this.place(nb, 0, 0, bagW, bagH);
      swing.appendChild(nb);
      return;
    }
    // lid (flipped back above the mouth), the cover that hides the inside while it opens
    const lid = this.cachedArt('lid|' + (look.key || '') + '|' + bagW + '|' + this.lidNumber(look), () => ({ pc: Art.paintLid(look, bagW - 12, this.lidNumber(look)) }));
    const lidEl = this.img(lid.url, lid.w, lid.h, 'bg-lid');
    this.place(lidEl, 6, -lid.h + 4);
    swing.appendChild(lidEl);
    const body = this.img(art.url, art.w, art.h);
    this.place(body, 0, 0);
    swing.appendChild(body);
    const v = new GridView(bagC, spec, CELL, 0, 0, spec.w, spec.h, 'bag');
    this.place(v.el, art.ix!, art.iy!, spec.w * CELL, spec.h * CELL);
    swing.appendChild(v.el);
    this.views.push(v);
    const cover = document.createElement('div');
    cover.className = 'bg-cover';
    cover.style.background = `#${look.shell.toString(16).padStart(6, '0')}`;
    cover.style.boxShadow = `inset 0 ${-2 * this.bs}px 0 rgba(0,0,0,.35)`;
    this.place(cover, art.ix! - 2, art.iy! - 2, spec.w * CELL + 4, spec.h * CELL + 3);
    swing.appendChild(cover);
    // carry handle = shake
    const hd = this.cachedArt('handle|' + (look.key || ''), () => ({ pc: Art.paintHandle(look, 30) }));
    const handle = document.createElement('div');
    handle.className = 'bg-handle';
    handle.dataset.l = 'shake';
    this.place(handle, Math.round(bagW / 2) - 15, -lid.h - 6, 30, 12);
    handle.appendChild(this.img(hd.url, hd.w, hd.h));
    handle.addEventListener('pointerdown', (e) => { if (this.drag) return; e.stopPropagation(); e.preventDefault(); this.shake(bagC); });
    swing.appendChild(handle);
    // zipper pull at the end of the opened zip: zip it up = close
    if (!look.rigid) {
      const zp = this.cachedArt('zip|' + (look.key || ''), () => ({ pc: Art.paintZipPull(look) }));
      const zip = document.createElement('div');
      zip.className = 'bg-zip';
      this.place(zip, art.ix! + spec.w * CELL - 4, art.iy! - 4, 9, 24);
      zip.style.setProperty('--zip-from', Math.round(-(spec.w * CELL - 4) * this.bs) + 'px');
      zip.appendChild(this.img(zp.url, zp.w, zp.h));
      zip.addEventListener('pointerdown', (e) => { if (this.drag) return; e.stopPropagation(); e.preventDefault(); this.toggle(false); });
      swing.appendChild(zip);
    }
    // more than one bag: luggage tags down the left side switch which one is open
    if (bags.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'bg-bagtabs';
      this.place(tabs, -8, 16);
      bags.forEach((c, i) => {
        const it = this.bagItemOf(c);
        const label = it ? itemDef(it.key).name.replace(/ (Backpack|Bag)$/, '') : c.name;
        const t = document.createElement('div');
        t.className = 'bg-tape';
        t.style.setProperty('--r', (i % 2 ? 3 : -3) + 'deg');
        const a = this.cachedArt('tape|' + label + '|' + (i === this.bagSel), () => ({ pc: Art.paintTape(label, i === this.bagSel) }));
        t.appendChild(this.img(a.url, a.w, a.h));
        t.addEventListener('pointerdown', (e) => { if (this.drag) return; e.stopPropagation(); this.bagSel = i; this.structSig = ''; G.audio?.ui?.('tab'); });
        tabs.appendChild(t);
        this.tabEls.push({ el: t, c });
      });
      swing.appendChild(tabs);
    }
  }
  private lidNumber(look: Art.BagLook): string {
    if (!/issue|remit/.test(look.key || '')) return '';
    return debtorNo(G.local);
  }

  // ---------------------------------------------------------------- the loot side
  private buildLoot(x0: number, y0: number, entry: Entry | undefined, spec: GridSpec | null, tray: { url: string; w: number; h: number; ix?: number; iy?: number } | null, style: string, withTapes: boolean) {
    const panel = document.createElement('div');
    panel.className = 'bg-panel bg-loot';
    const tw = tray ? tray.w : 80, th = tray ? tray.h : 60;
    this.place(panel, x0, y0, Math.max(tw, 110), th + 46);
    this.stage.appendChild(panel);
    if (withTapes) { const tp = this.buildTapes(x0, y0, Math.max(tw, 110), false); tp.remove(); panel.appendChild(tp); tp.style.left = '0px'; tp.style.top = '0px'; }
    const ty = this.nearby.length > 4 ? 26 : 14;
    if (!entry || !spec || !tray) return;
    const trayIm = this.img(tray.url, tray.w, tray.h);
    this.place(trayIm, 0, ty);
    panel.appendChild(trayIm);
    const v = new GridView(entry.c, spec, CELL, 0, 0, spec.w, spec.h, entry.c.kind === 'floor' ? 'floor' : 'loot');
    this.place(v.el, tray.ix!, ty + tray.iy!, spec.w * CELL, spec.h * CELL);
    panel.appendChild(v.el);
    this.views.push(v);
    if (entry.c.locked) {
      const lk = document.createElement('div');
      lk.className = 'bg-locked';
      lk.textContent = 'locked';
      this.place(lk, tray.ix!, ty + tray.iy!, spec.w * CELL, spec.h * CELL);
      panel.appendChild(lk);
    }
    // what is heaped on top (no room in the grid)
    const spill = document.createElement('div');
    spill.className = 'bg-spill';
    spill.dataset.l = 'heaped on top';
    this.place(spill, 2, ty + tray.h + 12);
    spill.style.maxWidth = Math.round(tw * this.bs) + 'px';
    panel.appendChild(spill);
    (v as any).spill = spill;
    void style;
  }

  // ================================================================ items
  private renderItems() {
    const p = G.local;
    const pend = this.pendingTransfers();
    this.leaving = new Set(pend.map((t) => t.it));
    for (const v of this.views) {
      let pos: ((it: Item) => Placement | undefined) | undefined;
      if (v.kind === 'floor') {
        // the floor view is rebuilt from the world on every scan
        const e = this.nearby[this.lootSel];
        if (e?.c.kind === 'floor') v.c = e.c;
        const lay = packLayout(v.c.items, v.spec);
        v.layout = lay.at;
        pos = (it) => lay.at.get(it);
      }
      v.occ = occupancy(v.c.items, v.spec, null, pos);
      const keep = new Set<number>();
      for (const a of v.occ.anchors) {
        if (!v.contains(a.gx, a.gy)) continue;
        const it = a.items[0];
        keep.add(it.uid);
        let el = v.els.get(it.uid);
        const fresh = !el;
        if (!el) { el = document.createElement('div'); el.className = 'gi'; el.appendChild(document.createElement('i')); v.el.appendChild(el); v.els.set(it.uid, el); el.addEventListener('pointerdown', (e) => this.onItemDown(e, el!)); el.addEventListener('pointerenter', (e) => this.onItemEnter(e, el!)); el.addEventListener('pointerleave', (e) => this.onItemLeave(e, el!)); el.addEventListener('contextmenu', (e) => this.onItemMenu(e, el!)); }
        this.anchorOf.set(el, { view: v, a });
        this.drawItem(el, v, a, fresh);
      }
      // items heaped on top of a full world container
      const spill: HTMLDivElement | undefined = (v as any).spill;
      if (spill) {
        spill.innerHTML = '';
        spill.style.display = v.occ.bad.length ? 'flex' : 'none';
        for (const it of v.occ.bad.slice(0, 12)) {
          const el = document.createElement('div');
          el.className = 'gi';
          el.style.position = 'relative';
          const [w, h] = footprintOf(it);
          const s = Math.min(1, 2 / Math.max(w, h));
          const W = Math.max(1, Math.round(w * s * CELL)), H = Math.max(1, Math.round(h * s * CELL));
          el.style.width = W * this.bs + 'px'; el.style.height = H * this.bs + 'px';
          const i = document.createElement('i');
          i.style.width = '100%'; i.style.height = '100%';
          i.style.backgroundImage = `url(${gridIcon(it, CELL) || itemIconFor(it, 32)})`;
          el.appendChild(i);
          spill.appendChild(el);
          this.anchorOf.set(el, { view: v, a: { gx: -99, gy: -99, w, h, rot: 0, items: [it] } });
          el.addEventListener('pointerdown', (e) => this.onItemDown(e, el));
          el.addEventListener('pointerenter', (e) => this.onItemEnter(e, el));
          el.addEventListener('pointerleave', (e) => this.onItemLeave(e, el));
          el.addEventListener('contextmenu', (e) => this.onItemMenu(e, el));
        }
      }
      // transfers on their way into this grid: a faint ghost with progress
      for (const t of pend) {
        if (t.to !== v.c || !t.at || !v.contains(t.at.gx, t.at.gy)) continue;
        const key = -t.it.uid;
        keep.add(key);
        let el = v.els.get(key);
        if (!el) { el = document.createElement('div'); el.className = 'gi pend'; el.appendChild(document.createElement('i')); v.el.appendChild(el); v.els.set(key, el); }
        this.drawItem(el, v, { gx: t.at.gx, gy: t.at.gy, rot: t.at.rot, w: dimsOf(t.it, t.at.rot)[0], h: dimsOf(t.it, t.at.rot)[1], items: [t.it] }, false);
        el.style.setProperty('--p', Math.round(t.progress * 100) + '%');
      }
      for (const [uid, el] of v.els) if (!keep.has(uid)) { el.remove(); v.els.delete(uid); }
    }
    // keep the lifted look on what is being dragged
    if (this.drag) this.markLifted(true);
    void p;
  }

  private drawItem(el: HTMLDivElement, v: GridView, a: Anchor, fresh: boolean) {
    const bs = this.bs, cell = v.cell;
    const it = a.items[0];
    const d = itemDef(it.key);
    const [w0, h0] = footprintOf(it);
    el.style.left = Math.round((a.gx - v.rx) * cell * bs) + 'px';
    el.style.top = Math.round((a.gy - v.ry) * cell * bs) + 'px';
    el.style.width = Math.round(a.w * cell * bs) + 'px';
    el.style.height = Math.round(a.h * cell * bs) + 'px';
    const i = el.firstChild as HTMLElement;
    const url = gridIcon(it, cell);
    el.classList.toggle('noart', !url);
    i.style.backgroundImage = `url(${url || itemIconFor(it, 32)})`;
    i.style.width = Math.round(w0 * cell * bs) + 'px';
    i.style.height = Math.round(h0 * cell * bs) + 'px';
    i.style.transform = a.rot ? `translateX(${Math.round(h0 * cell * bs)}px) rotate(90deg)` : '';
    // stack count, condition, fluid
    let extra = '';
    if (a.items.length > 1) extra += `<b>${a.items.length}</b>`;
    const showCond = !!(d.durability || d.weapon) && it.cond < 0.97;
    if (showCond) extra += `<u><s class="${it.cond > 0.6 ? '' : it.cond > 0.25 ? 'mid' : 'low'}" style="width:${Math.round(it.cond * 100)}%"></s></u>`;
    if (d.fluidCap) extra += `<em><s style="height:${Math.round(((it.fluid?.amount ?? 0) / d.fluidCap) * 100)}%;${it.fluid?.type === 'tainted' ? 'background:#9aa83a' : ''}"></s></em>`;
    const cur = (el as any)._extra;
    if (cur !== extra) { while (el.childNodes.length > 1) el.lastChild!.remove(); if (extra) el.insertAdjacentHTML('beforeend', extra); (el as any)._extra = extra; }
    if (fresh && this.root.classList.contains('opening')) el.classList.add('dropin');
    el.classList.toggle('sel', this.sel?.it === it);
    el.classList.toggle('leaving', !el.classList.contains('pend') && a.items.every((i) => this.leaving.has(i)));
  }
  private leaving = new Set<Item>();

  private pendingTransfers(): { it: Item; to: Container; at: Placement | null; progress: number }[] {
    const p = G.local;
    const out: { it: Item; to: Container; at: Placement | null; progress: number }[] = [];
    for (const a of p.actions.list) if (a instanceof TransferAction && a.at) out.push({ it: a.it, to: a.to, at: a.at, progress: a.started ? a.progress : 0 });
    return out;
  }

  private updateWeight() {
    const p = G.local;
    const w = p.carriedWeight(), cap = p.capacity();
    const ro = this.bagEls.readout;
    if (ro) {
      const over = w > cap;
      ro.classList.toggle('over', over);
      const html = `${w.toFixed(1)}<b>${over ? '!' : ''}</b> / ${cap.toFixed(0)} kg`;
      if ((ro as any)._h !== html) { ro.innerHTML = html; (ro as any)._h = html; }
    }
    const t = Math.min(1.6, w / Math.max(1, cap));
    const ext = Math.round(3 + t * 10);
    if (this.bagEls.plunger) { this.bagEls.plunger.style.height = Math.round(ext * this.bs) + 'px'; }
    if (this.bagEls.dring) this.bagEls.dring.style.transform = `translateY(${Math.round((ext - 3) * this.bs)}px)`;
    // the straps take the bag's load (its rating in kg)
    const st = this.bagEls.straps;
    const bags = this.carriedBags();
    const bagC = bags[this.bagSel];
    if (st && bagC) {
      const g = (st as any)._geom;
      const tension = Math.min(2, bagC.contentWeight() / Math.max(1, bagC.capacity));
      const key = g.w + '|' + Math.round(tension * 10) + '|' + (g.look.key || '') + '|' + (ext - 3);
      if (key !== this.bagEls.strapsKey) {
        this.bagEls.strapsKey = key;
        const art = this.cachedArt('straps|' + key, () => ({ pc: Art.paintStraps(g.look, g.w, g.h + ext - 3, g.ax, g.bx0, g.bx1, tension) }));
        st.src = art.url;
        st.style.height = Math.round(art.h * this.bs) + 'px';
        if (this.swingEl) this.swingEl.style.transform = `translateY(${Math.round((ext - 3) * this.bs)}px)`;
      }
      if (this.lastLoad >= 0 && Math.abs(this.lastLoad - w) > 0.05 && this.rigEl && !this.root.classList.contains('opening')) {
        this.rigEl.classList.remove('sway'); void this.rigEl.offsetWidth; this.rigEl.classList.add('sway');
      }
    }
    this.lastLoad = w;
  }

  // ================================================================ pointer input
  private onRootDown(e: PointerEvent) {
    if (!this.open) return;
    const t = e.target as HTMLElement;
    if (isTouchEv(e)) this.touchHeld.add(e.pointerId);
    // a second finger while carrying something: rotate it
    if (this.drag && isTouchEv(e) && e.pointerId !== this.drag.pointerId && !this.drag.held) { this.rotate(); return; }
    if (this.drag?.held) {
      // tap-to-place: this finger now carries the item; lifting it places it
      if (t.closest('.bg-hud')) return;
      e.preventDefault();
      this.drag.pointerId = e.pointerId;
      this.drag.held = false;
      this.hud.classList.remove('on');
      this.moveGhost(e.clientX, e.clientY);
      return;
    }
    if (t === this.dim || t === this.root || t === this.stage) {
      // empty space: deselect; on touch a tap on nothing closes the bag
      if (this.sel) { this.setSel(null); this.hideTag(); return; }
      if (isTouchEv(e)) { this.toggle(false); }
    }
  }

  private beginPress(e: PointerEvent, el: HTMLElement, start: () => void, tap: (x: number, y: number, pr: Press) => void, menu: (x: number, y: number) => void) {
    if (!this.open || this.drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    this.cancelPress();
    const pr: Press = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now(), touch: isTouchEv(e), el, long: 0, done: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, start, tap, menu };
    if (pr.touch) pr.long = window.setTimeout(() => { if (this.press !== pr || pr.done) return; pr.done = true; (navigator as any).vibrate?.(12); this.press = null; menu(pr.x0, pr.y0); }, LONG_MS);
    this.press = pr;
  }
  private cancelPress() { if (this.press) { clearTimeout(this.press.long); this.press = null; } }

  private onItemDown(e: PointerEvent, el: HTMLElement) {
    const ref = this.anchorOf.get(el);
    if (!ref) return;
    const { view, a } = ref;
    const it = a.items[0];
    const quick = () => { this.hideTag(); this.quickMove(a.items, view.c); };
    this.beginPress(e, el,
      () => {
        const pr = this.press!;
        let count = a.items.length;
        if (pr.shift) count = Math.max(1, Math.ceil(a.items.length / 2));
        if (pr.ctrl) count = 1;
        const r = el.getBoundingClientRect();
        const cell = view.cell * this.bs;
        const grab: [number, number] = [Math.max(0, Math.min(a.w - 1, Math.floor((pr.x0 - r.left) / cell))), Math.max(0, Math.min(a.h - 1, Math.floor((pr.y0 - r.top) / cell)))];
        if (a.gx < -50) { grab[0] = 0; grab[1] = 0; }
        this.startDrag({ stack: a.items.slice(), count, from: view.c, src: 'grid', view, rot: a.rot, grab, pointerId: pr.pointerId, touch: pr.touch, held: false, srcEl: el, cell: view.cell });
      },
      (x, y, pr) => {
        const now = performance.now();
        const dbl = this.lastTap.uid === it.uid && now - this.lastTap.t < 380;
        this.lastTap = { uid: it.uid, t: now };
        if (pr.ctrl || dbl) { this.lastTap.t = 0; if (this.drag?.held) this.cancelDrag(); quick(); return; }
        if (pr.touch) {
          // tap to pick up
          const [w, h] = [a.w, a.h];
          this.startDrag({ stack: a.items.slice(), count: a.items.length, from: view.c, src: 'grid', view, rot: a.rot, grab: [Math.floor((w - 1) / 2), Math.floor((h - 1) / 2)], pointerId: -1, touch: true, held: true, srcEl: el, cell: view.cell });
          this.showHud();
          void x; void y;
          return;
        }
        this.setSel(this.sel?.it === it ? null : { it, el });
        if (this.sel) this.showTag(el, it, a.items.length, this.hintFor(view.c)); else this.hideTag();
      },
      (x, y) => this.openMenu(it, view.c, a.items, x, y));
  }

  private onWornDown(e: PointerEvent, el: HTMLElement, it: Item) {
    this.beginPress(e, el,
      () => {
        if (it.key === 'bailiff_band') { this.bump(el); G.ui?.say?.(G.local, 'It\'s bolted through the bone.', 'think'); return; }
        const [w, h] = footprintOf(it);
        this.startDrag({ stack: [it], count: 1, from: G.local.inv, src: 'worn', rot: 0, grab: [Math.floor((w - 1) / 2), Math.floor((h - 1) / 2)], pointerId: this.press!.pointerId, touch: this.press!.touch, held: false, srcEl: el, cell: CELL });
      },
      (_x, _y, pr) => {
        if (pr.touch) {
          if (it.key === 'bailiff_band') { this.showTag(el, it, 1, 'it does not come off'); return; }
          const [w, h] = footprintOf(it);
          this.startDrag({ stack: [it], count: 1, from: G.local.inv, src: 'worn', rot: 0, grab: [Math.floor((w - 1) / 2), Math.floor((h - 1) / 2)], pointerId: -1, touch: true, held: true, srcEl: el, cell: CELL });
          this.showHud();
          return;
        }
        this.setSel(this.sel?.it === it ? null : { it, el });
        if (this.sel) this.showTag(el, it, 1, 'worn · drag off to take off'); else this.hideTag();
      },
      (x, y) => this.openMenu(it, G.local.inv, [it], x, y));
  }

  private onHandDown(e: PointerEvent, el: HTMLElement, hand: 'R' | 'L') {
    const p = G.local;
    const it = hand === 'R' ? p.handR : p.handL;
    if (!it) { if (!this.drag) e.stopPropagation(); return; }
    const from = p.containerOf(it) || p.inv;
    this.beginPress(e, el,
      () => { const [w, h] = footprintOf(it); this.startDrag({ stack: [it], count: 1, from, src: 'hand', hand, rot: 0, grab: [Math.floor((w - 1) / 2), Math.floor((h - 1) / 2)], pointerId: this.press!.pointerId, touch: this.press!.touch, held: false, srcEl: el, cell: CELL }); },
      (_x, _y, pr) => {
        if (pr.touch) { const [w, h] = footprintOf(it); this.startDrag({ stack: [it], count: 1, from, src: 'hand', hand, rot: 0, grab: [Math.floor((w - 1) / 2), Math.floor((h - 1) / 2)], pointerId: -1, touch: true, held: true, srcEl: el, cell: CELL }); this.showHud(); return; }
        this.setSel(this.sel?.it === it ? null : { it, el });
        if (this.sel) this.showTag(el, it, 1, 'in hand · drag into the bag to put away'); else this.hideTag();
      },
      (x, y) => this.openMenu(it, from, [it], x, y));
  }

  /** right-click: the item's actions (touch gets them from a long press) */
  private onItemMenu(e: MouseEvent, el: HTMLElement) {
    e.preventDefault();
    if (this.drag || (e as PointerEvent).pointerType === 'touch' || this.press?.touch) return;
    e.stopPropagation();
    const ref = this.anchorOf.get(el);
    if (ref) { this.setSel({ it: ref.a.items[0], el }); this.openMenu(ref.a.items[0], ref.view.c, ref.a.items, e.clientX, e.clientY); return; }
    const it = this.wornOf.get(el);
    if (it) { const p = G.local; this.openMenu(it, p.containerOf(it) || p.inv, [it], e.clientX, e.clientY); }
  }

  private onItemEnter(e: PointerEvent, el: HTMLElement) {
    if (e.pointerType !== 'mouse' || this.drag || this.sel) return;
    const ref = this.anchorOf.get(el);
    if (!ref) return;
    this.hoverTag(el, ref.a.items[0], ref.a.items.length, this.hintFor(ref.view.c));
  }
  private onItemLeave(e: PointerEvent, el: HTMLElement) { if (e.pointerType === 'mouse') this.unhover(el); }
  private hoverTag(el: HTMLElement, it: Item, count: number, hint = '') {
    clearTimeout(this.hoverTimer);
    this.hoverEl = el;
    this.hoverTimer = window.setTimeout(() => { if (this.hoverEl === el && !this.drag && !this.sel && el.isConnected) this.showTag(el, it, count, hint); }, 160);
  }
  private unhover(el: HTMLElement) { if (this.hoverEl === el) { this.hoverEl = null; clearTimeout(this.hoverTimer); if (!this.sel) this.hideTag(); } }

  private hintFor(c: Container): string {
    const touch = document.documentElement.classList.contains('coarse');
    const world = isWorldContainer(c) || c.kind === 'floor';
    if (touch) return 'tap: pick up · double-tap: ' + (world ? 'take' : 'stash') + ' · hold: use';
    return 'drag · R turn · dbl-click ' + (world ? 'take' : 'move') + ' · right-click use';
  }

  // ---------------------------------------------------------------- dragging
  private startDrag(d: Omit<Drag, 'ghost' | 'over'>) {
    this.cancelPress();
    this.hideTag();
    this.setSel(null);
    const ghost = document.createElement('div');
    ghost.className = 'bg-ghost';
    ghost.appendChild(document.createElement('i'));
    this.root.appendChild(ghost);
    this.drag = { ...d, ghost, over: { k: 'none' }, lift: d.touch && !d.held ? 26 : 0 };
    this.drawGhost();
    this.markLifted(true);
    G.audio?.itemSound?.(d.stack[0].key, 'pick', G.local);
    if (!d.held && this.press === null) {
      // ghost under the pointer right away (it is updated on every move)
    }
  }
  private markLifted(on: boolean) {
    const d = this.drag;
    if (!d?.srcEl) return;
    const all = d.count >= d.stack.length;
    d.srcEl.classList.toggle('lifted', on && all);
  }
  private drawGhost() {
    const d = this.drag!;
    const it = d.stack[0];
    const [w0, h0] = footprintOf(it);
    const cell = d.cell * this.bs;
    const i = d.ghost.firstChild as HTMLElement;
    const url = gridIcon(it, d.cell);
    i.style.backgroundImage = `url(${url || itemIconFor(it, 32)})`;
    i.style.backgroundSize = url ? '100% 100%' : 'contain';
    i.style.width = Math.round(w0 * cell) + 'px';
    i.style.height = Math.round(h0 * cell) + 'px';
    i.style.transform = d.rot ? `translateX(${Math.round(h0 * cell)}px) rotate(90deg)` : '';
    const [w, h] = dimsOf(it, d.rot);
    d.ghost.style.width = Math.round(w * cell) + 'px';
    d.ghost.style.height = Math.round(h * cell) + 'px';
    let b = d.ghost.querySelector('b');
    if (d.stack.length > 1) { if (!b) { b = document.createElement('b'); d.ghost.appendChild(b); } b.textContent = String(d.count); }
    else b?.remove();
  }
  private lastPt = { x: 0, y: 0 };
  private moveGhost(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    this.lastPt = { x, y };
    this.refreshTarget();
  }
  private refreshTarget() {
    const d = this.drag;
    if (!d) return;
    const { x, y } = this.lastPt;
    if (d.held) { this.showTarget({ k: 'none' }); d.over = { k: 'none' }; return; }
    const tgt = this.targetAt(x, y);
    this.showTarget(tgt);
    d.over = tgt;
    const cell = d.cell * this.bs;
    // over a grid the ghost snaps to the cells
    if (tgt.k === 'grid') {
      const r = tgt.view.el.getBoundingClientRect();
      const vcell = tgt.view.cell * this.bs;
      if (tgt.view.cell !== d.cell) { d.cell = tgt.view.cell; this.drawGhost(); }
      d.ghost.style.left = Math.round(r.left + (tgt.gx - tgt.view.rx) * vcell) + 'px';
      d.ghost.style.top = Math.round(r.top + (tgt.gy - tgt.view.ry) * vcell) + 'px';
      d.ghost.classList.toggle('bad', tgt.fit === 'blocked');
      return;
    }
    if (d.cell !== CELL && tgt.k !== 'hand') { d.cell = CELL; this.drawGhost(); }
    d.ghost.classList.toggle('bad', (tgt.k === 'hand' || tgt.k === 'wear' || tgt.k === 'tab') && !tgt.ok);
    const lift = (d.lift ?? 0) * this.bs;
    const gc = d.cell * this.bs || cell;
    d.ghost.style.left = Math.round(x - (d.grab[0] + 0.5) * gc) + 'px';
    d.ghost.style.top = Math.round(y - (d.grab[1] + 0.5) * gc - lift) + 'px';
  }

  private targetAt(x: number, y: number): Target {
    const d = this.drag!;
    const lift = (d.lift ?? 0) * this.bs;
    const el = document.elementFromPoint(x, y - lift) as HTMLElement | null;
    const it = d.stack[0];
    const def = itemDef(it.key);
    if (!el || !this.root.contains(el)) return { k: 'none' };
    // hands
    for (const hand of ['R', 'L'] as const) {
      const he = this.handEls[hand];
      if (he && (el === he || he.contains(el))) return { k: 'hand', hand, ok: this.canHold(it) };
    }
    // a tab: into that container wherever it fits
    for (const t of this.tabEls) if (t.el === el || t.el.contains(el)) {
      if (t.c === d.from) return { k: 'none' };
      const spot = t.c.kind === 'floor' ? true : !!resolveTarget(G.local, it, d.from, t.c, null);
      return { k: 'tab', c: t.c, ok: spot, el: t.el };
    }
    // a grid (the cell under the grabbed part of the item)
    const gridEl = el.closest('.bg-grid') as HTMLElement | null;
    let view = gridEl ? this.views.find((v) => v.el === gridEl) : undefined;
    if (!view && el.classList.contains('gi')) view = this.anchorOf.get(el)?.view;
    if (!view) {
      // near a grid (between pockets, on a tray's rim): the closest grid within a cell
      let best: GridView | undefined, bd = 1e9;
      for (const v of this.views) {
        const r = v.el.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - (y - lift), 0, (y - lift) - r.bottom);
        const dd = Math.hypot(dx, dy);
        if (dd < v.cell * this.bs * 0.7 && dd < bd) { bd = dd; best = v; }
      }
      view = best;
    }
    if (view) {
      const r = view.el.getBoundingClientRect();
      const vcell = view.cell * this.bs;
      const [w, h] = dimsOf(it, d.rot);
      let gx = Math.floor((x - r.left) / vcell) - Math.min(d.grab[0], w - 1) + view.rx;
      let gy = Math.floor((y - lift - r.top) / vcell) - Math.min(d.grab[1], h - 1) + view.ry;
      // keep it inside this view's cells (snaps against the edge rather than going red)
      gx = Math.max(view.rx, Math.min(view.rx + view.rw - w, gx));
      gy = Math.max(view.ry, Math.min(view.ry + view.rh - h, gy));
      return { k: 'grid', view, gx, gy, fit: this.fitAt(view, gx, gy) };
    }
    if (this.wearZone && (el === this.wearZone || el.closest('.bg-doll'))) {
      const wearable = !!(def.clothing || (def.bag && def.bag.slot !== 'hand'));
      if (d.src === 'worn') return { k: 'none' };
      return { k: 'wear', ok: wearable };
    }
    if (el === this.dim || el === this.root || el === this.stage) return { k: 'floor' };
    return { k: 'none' };
  }

  private fitAt(view: GridView, gx: number, gy: number): Fit {
    const d = this.drag!;
    const it = d.stack[0];
    if (view.c.locked) return 'blocked';
    if (view.kind === 'floor') return 'free';
    if (it.inv && (view.c === it.inv)) return 'blocked';
    if (view.c !== d.from && !this.weightFits(view.c, d.stack.slice(0, d.count))) return 'blocked';
    const moving = new Set(d.stack.slice(0, d.count));
    if (d.from !== view.c) moving.clear();
    const occ = occupancy(view.c.items, view.spec, moving.size ? moving : null);
    // pending arrivals hold their cells
    for (const t of this.pendingTransfers()) if (t.to === view.c && t.at) {
      const [w, h] = dimsOf(t.it, t.at.rot);
      for (let yy = t.at.gy; yy < t.at.gy + h; yy++) for (let xx = t.at.gx; xx < t.at.gx + w; xx++) if (xx < view.spec.w && yy < view.spec.h && occ.cells[yy * view.spec.w + xx] === 0) occ.cells[yy * view.spec.w + xx] = 1e6;
    }
    // dropping a whole stack back where it came from is fine
    const fit = testFit(occ, it, gx, gy, d.rot, d.count);
    return fit;
  }
  private weightFits(c: Container, items: Item[]): boolean {
    if (c.kind !== 'bag' && !c.owner.startsWith('item:')) return true;
    let w = 0;
    for (const it of items) w += it.inv ? it.inv.contentWeight() + itemDef(it.key).weight : (it.data?.weight ?? itemDef(it.key).weight) + (it.fluid?.amount ?? 0);
    return c.contentWeight() + w <= c.capacity * 2 + 1e-6;
  }
  private canHold(it: Item): boolean {
    const p = G.local;
    const L = p.body?.limbs?.();
    if (L && L.hands === 0) return false;
    const d = itemDef(it.key);
    if ((d.weapon?.twoHanded || d.heavy) && L && !L.twoHand) return false;
    return true;
  }

  private showTarget(t: Target) {
    for (const v of this.views) { v.foot.className = 'gfoot'; v.el.classList.remove('hot'); }
    for (const h of Object.values(this.handEls)) h?.classList.remove('hot', 'badhot');
    this.wearZone?.classList.remove('hot', 'badhot');
    for (const tb of this.tabEls) tb.el.classList.remove('hot');
    this.dim.classList.toggle('floor-hot', t.k === 'floor');
    this.floorHint.classList.toggle('on', t.k === 'floor');
    const d = this.drag!;
    if (t.k === 'grid') {
      const v = t.view;
      const [w, h] = dimsOf(d.stack[0], d.rot);
      v.el.classList.add('hot');
      v.foot.className = 'gfoot ' + (t.fit === 'free' ? 'ok' : t.fit === 'stack' ? 'stack' : 'bad');
      this.place(v.foot, (t.gx - v.rx) * v.cell, (t.gy - v.ry) * v.cell, w * v.cell, h * v.cell);
    } else if (t.k === 'hand') this.handEls[t.hand]?.classList.add(t.ok ? 'hot' : 'badhot');
    else if (t.k === 'wear') this.wearZone?.classList.add(t.ok ? 'hot' : 'badhot');
    else if (t.k === 'tab' && t.ok) t.el.classList.add('hot');
  }

  private onMove(e: PointerEvent) {
    if (!this.open) return;
    const pr = this.press;
    if (pr && e.pointerId === pr.pointerId && !pr.done) {
      const dist = Math.abs(e.clientX - pr.x0) + Math.abs(e.clientY - pr.y0);
      if (dist > (pr.touch ? 9 : 5)) { pr.done = true; clearTimeout(pr.long); pr.start(); this.press = null; }
    }
    const d = this.drag;
    if (d && e.pointerId === d.pointerId) { if (e.cancelable) e.preventDefault(); this.moveGhost(e.clientX, e.clientY); }
    else if (d && !d.held && d.pointerId === -1) this.moveGhost(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    this.touchHeld.delete(e.pointerId);
    if (!this.open) return;
    const pr = this.press;
    if (pr && e.pointerId === pr.pointerId) {
      clearTimeout(pr.long);
      this.press = null;
      if (!pr.done && !cancelled) pr.tap(e.clientX, e.clientY, pr);
      return;
    }
    const d = this.drag;
    if (!d || d.held || e.pointerId !== d.pointerId) return;
    if (cancelled) { this.cancelDrag(); return; }
    this.lastPt = { x: e.clientX, y: e.clientY };
    const t = this.targetAt(e.clientX, e.clientY);
    this.commit(t);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open) return;
    if (this.drag) {
      if (e.code === 'KeyR') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.rotate(); return; }
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancelDrag(); return; }
    }
  }

  rotate() {
    const d = this.drag;
    if (!d) return;
    const [w0, h0] = footprintOf(d.stack[0]);
    if (w0 === h0) return;
    const [w, h] = dimsOf(d.stack[0], d.rot);
    // turning toggles between two orientations, so the grabbed cell is mirrored across the diagonal
    // (turning twice puts it back exactly where it was)
    d.grab = [Math.min(h - 1, d.grab[1]), Math.min(w - 1, d.grab[0])];
    d.rot = (d.rot ? 0 : 1) as Rot;
    this.drawGhost();
    this.refreshTarget();
    G.audio?.ui?.('bag_rot', 0.5);
  }
  private setCount(n: number) {
    const d = this.drag;
    if (!d) return;
    d.count = Math.max(1, Math.min(d.stack.length, n));
    this.drawGhost();
    this.markLifted(true);
    this.refreshTarget();
    if (d.held) this.showHud();
  }

  private cancelDrag() {
    const d = this.drag;
    if (!d) return;
    d.ghost.remove();
    d.srcEl?.classList.remove('lifted');
    this.drag = null;
    this.hud.classList.remove('on');
    this.hideTag();
    this.dim.classList.remove('floor-hot');
    this.floorHint.classList.remove('on');
    for (const v of this.views) { v.foot.className = 'gfoot'; v.el.classList.remove('hot'); }
    for (const h of Object.values(this.handEls)) h?.classList.remove('hot', 'badhot');
    this.wearZone?.classList.remove('hot', 'badhot');
    for (const tb of this.tabEls) tb.el.classList.remove('hot');
  }

  /** the touch "holding" HUD: turn, how many, drop, cancel */
  private showHud() {
    const d = this.drag;
    if (!d) return;
    const hud = this.hud;
    hud.innerHTML = '';
    const b = (label: string, cls: string, fn: () => void) => { const el = document.createElement('div'); el.textContent = label; el.className = cls; el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); }); hud.appendChild(el); };
    const [w0, h0] = footprintOf(d.stack[0]);
    if (w0 !== h0) b('turn', '', () => this.rotate());
    if (d.stack.length > 1) { b('-', '', () => this.setCount(d.count - 1)); b(String(d.count), 'n', () => this.setCount(d.count >= d.stack.length ? 1 : d.stack.length)); b('+', '', () => this.setCount(d.count + 1)); }
    b('drop', '', () => { this.commit({ k: 'floor' }); });
    b('x', 'x', () => { this.cancelDrag(); });
    hud.classList.add('on');
    // over the item it came from, else at the bottom
    const r = d.srcEl?.getBoundingClientRect();
    const hw = hud.offsetWidth || 200, hh = hud.offsetHeight || 44;
    let x = r ? r.left + r.width / 2 - hw / 2 : innerWidth / 2 - hw / 2;
    let y = r ? r.bottom + 6 * this.bs : innerHeight - hh - 8;
    if (y + hh > innerHeight - 4) y = (r ? r.top : innerHeight) - hh - 6 * this.bs;
    x = Math.max(4, Math.min(innerWidth - hw - 4, x));
    y = Math.max(4, y);
    hud.style.left = Math.round(x) + 'px'; hud.style.top = Math.round(y) + 'px';
    // the ghost hovers over where it was picked up
    if (r) { d.ghost.style.left = Math.round(r.left - 3 * this.bs) + 'px'; d.ghost.style.top = Math.round(r.top - 5 * this.bs) + 'px'; }
    this.showTag(d.srcEl || d.ghost, d.stack[0], d.count, 'tap a spot to put it there');
  }

  // ---------------------------------------------------------------- committing a drop
  private commit(t: Target) {
    const d = this.drag;
    if (!d) return;
    const p = G.local;
    const items = d.stack.slice(0, d.count);
    const it = items[0];
    const from = d.from;
    this.cancelDrag();
    const world = (c: Container) => isWorldContainer(c) || c.kind === 'floor';
    // what has to happen before it can move: take it off / put it down
    const release = () => {
      if (d.src === 'worn') { p.actions.add(new WearAction(p, it, true)); return true; }
      if (d.src === 'hand') { p.equip(null, d.hand); if (p.handR === it || p.handL === it) p.equip(null, d.hand === 'R' ? 'L' : 'R'); bus.emit('inventoryChanged', p); }
      return false;
    };
    switch (t.k) {
      case 'grid': {
        if (t.fit === 'blocked') { this.bad(); return; }
        const to = t.view.c;
        const at: Placement = { gx: t.gx, gy: t.gy, rot: d.rot };
        if (t.view.kind === 'floor') { if (from.kind === 'floor') return; release(); queueTransfers(p, items, from, to); this.thunk(it); return; }
        if (to === from && d.src === 'grid') {
          if (world(to)) op('gridPlace', { z: G.zone.key, ref: containerRef(to), uids: items.map((i) => i.uid), gx: at.gx, gy: at.gy, rot: at.rot });
          else { for (const i of items) { i.gx = at.gx; i.gy = at.gy; i.rot = at.rot; } bus.emit('inventoryChanged', p); }
          this.thunk(it);
          this.dirty = true;
          return;
        }
        const queued = release();
        if (!world(from) && !world(to) && !queued) {
          // your own pockets and bags: instant
          for (const i of items) { const res = resolveTarget(p, i, from, to, at); if (res) transferItem(p, i, from, res.c, res.at); else { this.bad(); break; } }
          this.thunk(it);
        } else queueTransfers(p, items, queued ? p.inv : from, to, at);
        this.dirty = true;
        return;
      }
      case 'hand': {
        if (!t.ok) { this.bad(); return; }
        if (d.src === 'hand' && d.hand === t.hand) return;
        if (world(from)) queueTransfers(p, [it], from, p.inv);
        if (d.src === 'worn') p.actions.add(new WearAction(p, it, true));
        p.actions.add(new EquipAction(p, it, t.hand));
        return;
      }
      case 'wear': {
        if (!t.ok) { this.bad(); return; }
        if (world(from)) queueTransfers(p, [it], from, p.inv);
        p.actions.add(new WearAction(p, it));
        return;
      }
      case 'tab': {
        if (!t.ok) { this.bad(); return; }
        const queued = release();
        if (!world(from) && !world(t.c) && !queued) { for (const i of items) { const res = resolveTarget(p, i, from, t.c, null); if (res) transferItem(p, i, from, res.c, res.at); } this.thunk(it); }
        else queueTransfers(p, items, queued ? p.inv : from, t.c);
        return;
      }
      case 'floor': {
        const queued = release();
        if (from.kind === 'floor') return;
        queueTransfers(p, items, queued ? p.inv : from, floorContainer(G.zone, p.x, p.z));
        return;
      }
      default: return;
    }
  }

  /** double-click / ctrl-click / double-tap: to the other side */
  private quickMove(stack: Item[], from: Container) {
    const p = G.local;
    const world = isWorldContainer(from) || from.kind === 'floor';
    if (world) { queueTransfers(p, stack, from, p.inv); return; }
    const loot = this.nearby[this.lootSel]?.c;
    if (loot && loot.kind !== 'floor' && !loot.locked) { queueTransfers(p, stack, from, loot); return; }
    // pockets <-> pack
    const bags = this.carriedBags();
    const to = from === p.inv ? bags[this.bagSel] ?? bags[0] : p.inv;
    if (!to) { this.bad(); return; }
    let moved = false;
    for (const i of stack) { const res = resolveTarget(p, i, from, to, null); if (res && res.c !== from) { transferItem(p, i, from, res.c, res.at); moved = true; } }
    if (moved) this.thunk(stack[0]); else { this.bad(); bus.emit('think', p, 'No room.'); }
  }

  shake(c: Container) {
    if (this.drag) return;
    const sw = this.swingEl;
    G.audio?.ui?.('bag_shake', 0.7);
    if (sw) { sw.classList.remove('shake'); void sw.offsetWidth; sw.classList.add('shake'); }
    this.root.classList.add('shaking');
    setTimeout(() => this.root.classList.remove('shaking'), 700);
    setTimeout(() => {
      const ok = autoPack(c);
      bus.emit('inventoryChanged', G.local);
      this.dirty = true;
      if (!ok) bus.emit('think', G.local, 'Shaking won\'t make it fit.');
    }, 160);
  }

  private openMenu(it: Item, c: Container, group: Item[], x: number, y: number) {
    this.hideTag();
    const opts = itemMenuOptions(G.local, it, c, group);
    this.ui.openMenu(x, y, itemName(it), opts, itemIconFor(it, 16));
  }

  // ---------------------------------------------------------------- feedback
  /** a transfer found no room: the target grid flashes red and a scrap of tape says so */
  private noRoom(it: Item, to: Container) {
    this.bad();
    for (const v of this.views) if (v.c === to || (to === G.local.inv && (v.kind === 'bag' || v.kind === 'pocket'))) { v.el.classList.remove('nofit'); void v.el.offsetWidth; v.el.classList.add('nofit'); }
    this.note('no room', itemName(it));
  }
  private note(head: string, what: string) {
    const el = document.createElement('div');
    el.className = 'bg-note';
    el.innerHTML = `<b>${head.replace(/</g, '&lt;')}</b>${what.replace(/</g, '&lt;')}`;
    const anchor = this.swingEl?.getBoundingClientRect();
    this.root.appendChild(el);
    const w = el.offsetWidth;
    el.style.left = Math.round(anchor ? anchor.left + anchor.width / 2 - w / 2 : innerWidth / 2 - w / 2) + 'px';
    el.style.top = Math.round(anchor ? anchor.top + anchor.height * 0.42 : innerHeight / 2) + 'px';
    setTimeout(() => el.remove(), 1900);
  }
  private thunk(it: Item) { G.audio?.ui?.('bag_place', 0.6); void it; }
  private bad() { G.audio?.ui?.('bag_bad', 0.5); (navigator as any).vibrate?.(20); }
  private bump(el: HTMLElement) { el.animate?.([{ transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }], { duration: 160 }); this.bad(); }

  private setSel(s: { it: Item; el: HTMLElement } | null) {
    this.sel?.el.classList.remove('sel');
    this.sel = s;
    s?.el.classList.add('sel');
  }

  // ---------------------------------------------------------------- the tag
  private showTag(el: HTMLElement, it: Item, count: number, hint = '') {
    const tag = this.tagEl;
    tag.innerHTML = itemTag(it, count, footprintOf(it), hint);
    tag.classList.add('on');
    const r = el.getBoundingClientRect();
    const tw = tag.offsetWidth, th = tag.offsetHeight;
    const gap = 14 * this.bs;
    let x = r.right + gap, y = r.top - 4 * this.bs;
    if (x + tw > innerWidth - 4) x = r.left - gap - tw;
    if (x < 4) { x = Math.max(4, Math.min(innerWidth - tw - 4, r.left)); y = r.bottom + gap; }
    if (y + th > innerHeight - 4) y = Math.max(4, innerHeight - th - 4);
    y = Math.max(4, y);
    tag.style.left = Math.round(x) + 'px'; tag.style.top = Math.round(y) + 'px';
    tag.style.transform = `rotate(${(it.uid % 5) - 2}deg)`;
    // the string: from the tag's hole to the item, sagging a little
    const hx = x + 5 * this.bs, hy = y + 8 * this.bs;
    const ix = x > r.right ? r.right - 3 * this.bs : r.left + 3 * this.bs, iy = r.top + Math.min(r.height / 2, 6 * this.bs);
    const mx = (hx + ix) / 2, my = Math.max(hy, iy) + 8 * this.bs;
    this.strPath.setAttribute('d', `M${hx.toFixed(1)} ${hy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ix.toFixed(1)} ${iy.toFixed(1)}`);
    this.strPath.setAttribute('stroke-width', String(this.bs));
    this.svg.style.display = '';
  }
  private hideTag() { this.tagEl.classList.remove('on'); this.svg.style.display = 'none'; }

  // ---------------------------------------------------------------- test hooks (scripts drive the bag with real pointer events)
  /** screen rect of an item (by uid) as drawn in any grid */
  rectOf(uid: number): { x: number; y: number; w: number; h: number } | null {
    for (const v of this.views) for (const [, el] of v.els) {
      const ref = this.anchorOf.get(el);
      if (ref && ref.a.items.some((i) => i.uid === uid)) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    }
    return null;
  }
  /** screen point at the centre of a cell of the grid showing container c (pockets: any pocket view holding the cell) */
  cellPt(c: Container, gx: number, gy: number): { x: number; y: number } | null {
    for (const v of this.views) if (v.c === c && v.contains(gx, gy)) {
      const r = v.el.getBoundingClientRect(), s = v.cell * this.bs;
      return { x: r.left + (gx - v.rx + 0.5) * s, y: r.top + (gy - v.ry + 0.5) * s };
    }
    return null;
  }
  /** which containers are on screen (bag, pockets, loot) */
  shown(): { bag: Container | null; loot: Container | null } {
    return { bag: this.views.find((v) => v.kind === 'bag')?.c ?? null, loot: this.views.find((v) => v.kind === 'loot' || v.kind === 'floor')?.c ?? null };
  }
  selectLoot(c: Container) { const i = this.nearby.findIndex((e) => e.c === c); if (i >= 0) { this.lootSel = i; this.structSig = ''; } }
}

/** an item's def (kept for other modules that imported it from here) */
export type { ItemDef };

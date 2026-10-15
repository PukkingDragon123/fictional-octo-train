import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { PixelCanvas, makeRamp } from '../gfx/pixel';
import { tileFbm } from '../core/rng';
import { allRecipes } from '../items/recipes';
import { hasItemDef } from '../items/item';
import { kitUrl } from './pixelkit';
import { glyphUrl } from './pixelart';
import { Player } from '../entities/player';
import { pick, PickTarget, targetName } from '../game/picking';
import { OCCUPATIONS, TRAITS } from '../survival/traits';
import { itemIcon } from './icons';
import { sfx } from './menus/sfx';
import { calm } from './menus/settings';

export interface MenuOption {
  label: string;
  action?: () => void;
  disabled?: string | boolean;   // reason string shown in red
  sub?: MenuOption[];
  danger?: boolean;
  icon?: string;
}

interface Bubble { el: HTMLDivElement; target: Player | { x: number; y: number; z: number }; until: number; born: number; rise: number; kind: string; }

/** Generates the canvas-weave background used by every panel. */
function weaveDataUrl(): string {
  const pc = new PixelCanvas(32, 32);
  const R = makeRamp(0x2f2a1e, 6, { spread: 0.35 });
  pc.fillRamp(R, (x, y) => {
    const warp = (x % 2 === 0) !== (y % 2 === 0) ? 0.06 : -0.04;
    return 0.45 + warp + (tileFbm(x, y, 32, 32, 3, 2, 5) - 0.5) * 0.25;
  }, 1);
  for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x++) if ((x + y) % 7 === 0) pc.blend(x, y, R[4], 0.3);
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c.toDataURL();
}

type CursorKind = 'arrow' | 'hand' | 'aim' | 'busy';
/** CSS value for a pixel cursor drawn by the kit (hardware cursor: no lag behind the mouse) */
function cursorValue(kind: CursorKind): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--cur-' + kind).trim() || 'default';
}

/** icons for context-menu lines: an explicit item key / URL, or the output of a recipe with that name */
let recipeIcons: Map<string, string> | null = null;
function menuIcon(o: { label: string; icon?: string }): string {
  if (o.icon) return o.icon.startsWith('data:') || o.icon.startsWith('blob:') || o.icon.startsWith('/') ? o.icon : hasItemDef(o.icon) ? itemIcon(o.icon, '', 12) : '';
  if (!recipeIcons) {
    recipeIcons = new Map();
    try { for (const r of allRecipes()) { const out = r.outputs?.[0]?.item; if (out && !recipeIcons.has(r.name)) recipeIcons.set(r.name, out); } } catch { /* recipes not loaded */ }
  }
  const k = recipeIcons.get(o.label);
  return k && hasItemDef(k) ? itemIcon(k, '', 12) : '';
}

/**
 * All screen-space UI: world-anchored bubbles (thoughts, speech, halo
 * text), action bars, hover labels, the pixel cursor, context menus,
 * tooltips, readers and the inventory window. Kept deliberately minimal —
 * the scanner device is the main interface.
 */
export class UI {
  root: HTMLElement;
  bubbles: Bubble[] = [];
  bars = new Map<string, HTMLDivElement>();
  names = new Map<string, HTMLDivElement>();
  hover: PickTarget | null = null;
  hoverLabel: HTMLDivElement;
  cursor: HTMLImageElement;
  cursors: Record<string, string> = {};
  private cursorKind: CursorKind | '' = '';
  menuEl: HTMLDivElement | null = null;
  tipEl: HTMLDivElement | null = null;
  readerEl: HTMLDivElement | null = null;
  inventory: any = null;
  scanner: any = null;
  modal: HTMLElement | null = null;
  private hlMesh: THREE.Mesh | null = null;
  private hlKey = '';
  onWorldClick?: (t: PickTarget, button: number) => void;
  onInteractKey?: () => void;

  constructor() {
    this.root = document.getElementById('ui')!;
    document.documentElement.style.setProperty('--weave', `url(${weaveDataUrl()})`);
    this.hoverLabel = document.createElement('div'); this.hoverLabel.id = 'hover-label';
    document.body.appendChild(this.hoverLabel);
    // pixel cursors are CSS (hardware) cursors from the kit; the old follower image stays hidden for anything that looks it up
    this.cursor = document.createElement('img'); this.cursor.id = 'cursor'; this.cursor.alt = '';
    document.body.appendChild(this.cursor);
    const refreshCursor = () => { for (const k of ['arrow', 'hand', 'aim', 'busy'] as const) this.cursors[k] = kitUrl('cur-' + k + '-img'); this.cursorKind = ''; };
    refreshCursor();
    bus.on('uiSettings', refreshCursor);
    bus.on('uiScale', refreshCursor);
    bus.on('unlocked', (id: string) => this.unlockToast(id));
    window.addEventListener('keydown', (e) => this.menuKey(e), true);
    // track pointer over interactive UI so the world ignores clicks there
    this.root.addEventListener('mouseover', () => { G.input.pointerOverUI = true; });
    this.root.addEventListener('mouseout', () => { G.input.pointerOverUI = false; });
    document.addEventListener('mousedown', (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target as Node)) this.closeMenu();
    }, true);
    bus.on('think', (p: Player, text: string) => this.say(p, text, 'think'));
    bus.on('say', (p: Player, text: string) => this.say(p, text, 'say'));
    bus.on('halo', (p: Player, text: string, kind = '') => this.halo(p, text, kind));
  }

  blocksMovement() { return !!this.readerEl || !!this.modal || !!this.chatEl; }

  // ---------------- co-op chat ----------------
  private chatLog: HTMLDivElement | null = null;
  private chatEl: HTMLInputElement | null = null;
  chatLine(name: string, text: string) {
    if (!this.chatLog) { this.chatLog = document.createElement('div'); this.chatLog.className = 'k-chatlog'; document.body.appendChild(this.chatLog); }
    const line = document.createElement('div');
    line.className = 'k-chatline';
    line.innerHTML = `<b>${escapeHtml(name)}</b> ${escapeHtml(text)}`;
    this.chatLog.appendChild(line);
    while (this.chatLog.children.length > 7) this.chatLog.firstChild!.remove();
    setTimeout(() => line.classList.add('old'), 9000);
  }
  openChat() {
    if (this.chatEl) return;
    const el = document.createElement('input');
    el.className = 'k-chatinput'; el.maxLength = 200; el.placeholder = 'say something…  (Enter to send, Esc to cancel)';
    document.body.appendChild(el);
    this.chatEl = el;
    G.input.textFocus = true;
    setTimeout(() => el.focus(), 0);
    const close = () => { el.remove(); this.chatEl = null; G.input.textFocus = false; };
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = el.value; close(); if (t.trim()) G.net?.chat?.(t); }
      else if (e.key === 'Escape') close();
    });
    el.addEventListener('blur', () => { if (this.chatEl === el) close(); });
  }

  // ---------------- bubbles ----------------
  say(p: Player, text: string, kind: 'say' | 'think' | 'shout' | 'radio' = 'say', secs = 3.5) {
    if (!text) return;
    // replace previous bubble of same kind for this player
    for (const b of this.bubbles) if (b.target === p && b.kind === kind) b.until = 0;
    const el = document.createElement('div');
    el.className = 'w-bubble ' + kind;
    el.textContent = kind === 'think' ? text : kind === 'radio' ? '<<' + text + '>>' : text;
    this.root.appendChild(el);
    this.bubbles.push({ el, target: p, until: G.time + secs + text.length * 0.03, born: G.time, rise: 0, kind });
  }
  halo(p: Player, text: string, kind = '') {
    const el = document.createElement('div');
    el.className = 'w-bubble halo ' + kind;
    el.textContent = text;
    this.root.appendChild(el);
    this.bubbles.push({ el, target: p, until: G.time + 2.2, born: G.time, rise: 1, kind: 'halo' });
  }
  worldText(x: number, y: number, z: number, text: string, kind = 'say', secs = 3) {
    const el = document.createElement('div');
    el.className = 'w-bubble ' + kind;
    el.textContent = text;
    this.root.appendChild(el);
    this.bubbles.push({ el, target: { x, y, z }, until: G.time + secs, born: G.time, rise: 0, kind });
  }

  // ---------------- toasts ----------------
  private toastHost: HTMLDivElement | null = null;
  private lastUnlockAt = -1e9;
  private host(): HTMLDivElement {
    if (!this.toastHost || !this.toastHost.isConnected) { this.toastHost = document.createElement('div'); this.toastHost.className = 'k-toasts'; document.body.appendChild(this.toastHost); }
    return this.toastHost;
  }
  private pushToast(el: HTMLDivElement, secs: number) {
    const host = this.host();
    host.appendChild(el);
    while (host.children.length > 4) host.firstChild!.remove();
    setTimeout(() => el.classList.add('out'), secs * 1000);
    setTimeout(() => el.remove(), secs * 1000 + 700);
  }
  toast(title: string, sub = '', secs = 3.5) {
    // the unlock celebration below already covers plain "X UNLOCKED" notices
    if (/UNLOCKED$/.test(title) && performance.now() - this.lastUnlockAt < 2000) return;
    const el = document.createElement('div');
    el.className = 'k-toast';
    el.dataset.t = title;
    el.dataset.at = String(performance.now());
    el.innerHTML = `<span class="tt"></span>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    const tt = el.firstChild as HTMLElement;
    this.pushToast(el, secs);
    // teletype the headline
    if (calm()) { tt.textContent = title; return; }
    let i = 0;
    const step = () => { if (!el.isConnected) return; i = Math.min(title.length, i + 2); tt.textContent = title.slice(0, i) + (i < title.length ? '▮' : ''); if (i < title.length) setTimeout(step, 18); };
    step();
  }

  /** profile unlock: a new occupation or trait is on the intake form */
  unlockToast(id: string) {
    const [ns, key] = id.split(':');
    let kind = 'UNLOCK', name = key || id, icon = '';
    if (ns === 'job') { const o = OCCUPATIONS.find((x) => x.key === key); kind = 'NEW OCCUPATION UNLOCKED'; name = o?.name || key; const k = o?.items?.[0]; if (k) { try { icon = itemIcon(k, '', 18); } catch { /* no icon */ } } }
    else if (ns === 'trait') { const t = TRAITS.find((x) => x.key === key); kind = 'NEW TRAIT UNLOCKED'; name = t?.name || key; }
    this.lastUnlockAt = performance.now();
    // drop a plain notice another system may have just posted for the same unlock
    this.toastHost?.querySelectorAll('.k-toast:not(.unlock)').forEach((n) => { const e = n as HTMLElement; if (/UNLOCKED$/.test(e.dataset.t || '') && performance.now() - Number(e.dataset.at || 0) < 2000) e.remove(); });
    const el = document.createElement('div');
    el.className = 'k-toast unlock';
    const star = `<img src="${glyphUrl('star', 0xffd04a, 0x5a3a08)}" alt="" style="width:calc(var(--px) * 9);height:calc(var(--px) * 9)">`;
    el.innerHTML = `<div class="u-strip"><span>${escapeHtml(kind)}</span><i>MERIDIAN HR</i></div><div class="u-body"><div class="u-ico">${icon ? `<img src="${icon}" alt="">` : star}</div><div><div class="u-name">${escapeHtml(name)}</div><div class="u-sub">Now on the personnel file for your next run.</div></div><div class="u-sweep"></div></div>`;
    this.pushToast(el, 6.5);
    sfx('unlock');
    G.audio?.ui?.('scanDone', 0.4);
  }

  // ---------------- context menu ----------------
  openMenu(x: number, y: number, title: string, opts: MenuOption[], icon = '') {
    this.closeMenu();
    if (!opts.length) return;
    const el = this.buildMenu(title, opts, undefined, icon);
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(x + 4, window.innerWidth - r.width - 6)) + 'px';
    el.style.top = Math.max(4, Math.min(y + 4, window.innerHeight - r.height - 6)) + 'px';
    this.menuEl = el;
    this.menuKeyboard = false;
    G.audio?.ui?.('menu');
  }
  private menuKeyboard = false;
  private buildMenu(title: string, opts: MenuOption[], parent?: HTMLDivElement, icon = ''): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'k-menu';
    el.setAttribute('role', 'menu');
    (el as any)._parent = parent || null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    if (title) {
      const h = document.createElement('div'); h.className = 'mh';
      if (icon) { const im = document.createElement('img'); im.src = icon; im.alt = ''; h.appendChild(im); }
      h.appendChild(document.createTextNode(title));
      el.appendChild(h);
    }
    for (const o of opts) {
      if (o.label === '-') { const s = document.createElement('div'); s.className = 'sep'; el.appendChild(s); continue; }
      const mi = document.createElement('div');
      mi.className = 'mi' + (o.disabled ? ' dis' : '') + (o.danger ? ' danger' : '');
      mi.tabIndex = -1;
      mi.setAttribute('role', 'menuitem');
      const ic = menuIcon(o);
      if (ic) { const im = document.createElement('img'); im.className = 'ic'; im.src = ic; im.alt = ''; mi.appendChild(im); }
      mi.appendChild(document.createTextNode(o.label));
      if (typeof o.disabled === 'string') { const w = document.createElement('span'); w.className = 'why'; w.textContent = o.disabled; mi.appendChild(w); }
      const openSub = (focusFirst: boolean) => {
        (el as any)._sub?.remove();
        el.querySelectorAll('.mi.open').forEach((n) => n.classList.remove('open'));
        const subEl = this.buildMenu('', o.sub!, el);
        subEl.style.position = 'fixed';
        document.body.appendChild(subEl);
        const r = mi.getBoundingClientRect();
        const sr = subEl.getBoundingClientRect();
        let left = r.right + sr.width > window.innerWidth ? r.left - sr.width : r.right;
        if (left < 4) left = Math.max(4, Math.min(window.innerWidth - sr.width - 4, r.left + 24));
        subEl.style.left = left + 'px';
        subEl.style.top = Math.max(4, Math.min(r.top - 4, window.innerHeight - sr.height - 6)) + 'px';
        (el as any)._sub = subEl;
        mi.classList.add('open');
        if (focusFirst) (subEl.querySelector('.mi:not(.dis)') as HTMLElement | null)?.focus();
      };
      (mi as any)._openSub = o.sub && o.sub.length ? openSub : null;
      mi.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') mi.focus({ preventScroll: true });
        if (o.sub && o.sub.length) { if ((el as any)._subFor !== mi) { (el as any)._subFor = mi; openSub(false); } }
        else { (el as any)._sub?.remove(); (el as any)._sub = null; (el as any)._subFor = null; el.querySelectorAll('.mi.open').forEach((n) => n.classList.remove('open')); }
        if (!o.disabled) sfx('hover', 0.7);
      });
      if (o.sub && o.sub.length) {
        const s = document.createElement('span'); s.className = 'sub'; mi.appendChild(s);
        mi.addEventListener('click', (e) => { e.stopPropagation(); (el as any)._subFor = mi; openSub(this.menuKeyboard); });
      }
      if (!o.disabled && o.action) mi.addEventListener('click', (e) => { e.stopPropagation(); this.closeMenu(); G.audio?.ui?.('click'); o.action!(); });
      else if (o.disabled) mi.addEventListener('click', (e) => { e.stopPropagation(); sfx('error', 0.6); });
      el.appendChild(mi);
    }
    return el;
  }
  /** arrows / enter / esc drive an open context menu; those keys never reach the game meanwhile */
  private menuKey(e: KeyboardEvent) {
    if (!this.menuEl) return;
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' '].includes(k)) return;
    e.stopPropagation(); e.preventDefault();
    this.menuKeyboard = true;
    const active = document.activeElement as HTMLElement | null;
    const cur = active?.classList.contains('mi') ? active : null;
    const menu = (cur?.parentElement as HTMLDivElement | null) || this.deepestMenu();
    const items = [...menu.querySelectorAll(':scope > .mi')] as HTMLElement[];
    const i = cur ? items.indexOf(cur) : -1;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      const n = items.length;
      if (!n) return;
      const d = k === 'ArrowDown' ? 1 : -1;
      let j = i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n;
      for (let tries = 0; tries < n && items[j].classList.contains('dis'); tries++) j = (j + d + n) % n;
      items[j].focus();
      sfx('hover', 0.7);
    } else if (k === 'ArrowRight' && cur && (cur as any)._openSub) { (cur as any)._openSub(true); }
    else if (k === 'ArrowLeft' || k === 'Escape') {
      const parent = (menu as any)._parent as HTMLDivElement | null;
      if (parent) { menu.remove(); (parent as any)._sub = null; (parent as any)._subFor = null; const opener = parent.querySelector('.mi.open') as HTMLElement | null; opener?.classList.remove('open'); opener?.focus(); }
      else if (k === 'Escape') this.closeMenu();
    } else if ((k === 'Enter' || k === ' ') && cur) cur.click();
  }
  private deepestMenu(): HTMLDivElement {
    let m = this.menuEl!;
    while ((m as any)._sub && (m as any)._sub.isConnected) m = (m as any)._sub;
    return m;
  }
  closeMenu() {
    if (!this.menuEl) return;
    (this.menuEl as any)._sub?.remove();
    document.querySelectorAll('.k-menu').forEach((n) => n.remove());
    this.menuEl = null;
  }

  // ---------------- tooltip ----------------
  showTip(html: string, x: number, y: number) {
    if (!this.tipEl) { this.tipEl = document.createElement('div'); this.tipEl.className = 'k-tip'; document.body.appendChild(this.tipEl); }
    this.tipEl.innerHTML = html;
    this.tipEl.style.display = 'block';
    const r = this.tipEl.getBoundingClientRect();
    this.tipEl.style.left = Math.min(x + 18, window.innerWidth - r.width - 8) + 'px';
    this.tipEl.style.top = Math.min(y + 12, window.innerHeight - r.height - 8) + 'px';
  }
  hideTip() { if (this.tipEl) this.tipEl.style.display = 'none'; }

  // ---------------- reader ----------------
  read(title: string, text: string, style: 'paper' | 'terminal' = 'paper') {
    this.closeReader();
    const el = document.createElement('div');
    el.className = 'k-reader ' + (style === 'terminal' ? 'terminal' : 'paper');
    el.innerHTML = `<div class="close" role="button" tabindex="0">CLOSE · ESC</div><div class="k-rd"><h3>${escapeHtml(title)}</h3><pre></pre></div>${style === 'terminal' ? '<div class="fx"></div>' : ''}`;
    const pre = el.querySelector('pre')!;
    if (style === 'terminal' && !calm()) {
      // typewriter effect on terminals
      let i = 0;
      const tick = () => { if (!el.isConnected) return; i = Math.min(text.length, i + 6); pre.textContent = text.slice(0, i) + (i < text.length ? '█' : ''); if (i % 24 === 0) sfx('type', 0.4); if (i < text.length) setTimeout(tick, 16); };
      tick();
    } else pre.textContent = text;
    el.querySelector('.close')!.addEventListener('click', () => this.closeReader());
    el.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    el.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; });
    document.body.appendChild(el);
    this.readerEl = el;
    G.audio?.ui?.(style === 'terminal' ? 'terminal' : 'paper');
  }
  closeReader() { this.readerEl?.remove(); this.readerEl = null; G.input.pointerOverUI = false; }

  centerMessage(html: string, button?: { label: string; action: () => void }) {
    const el = document.createElement('div');
    el.className = 'k-center-msg';
    el.innerHTML = `<div class="k-cm-t">${html}</div>`;
    if (button) {
      const b = document.createElement('div'); b.className = 'k-btn'; b.tabIndex = 0; b.setAttribute('role', 'button'); b.textContent = button.label;
      b.onclick = () => { el.remove(); this.modal = null; sfx('confirm'); button.action(); };
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
      el.appendChild(b);
      setTimeout(() => b.focus(), 50);
    }
    document.body.appendChild(el);
    this.modal = el;
    sfx('error', 0.5);
    return el;
  }

  // ---------------- per-frame ----------------
  update(dt: number) {
    const g = G;
    if (!g.local) return;
    // bubbles follow their owners
    for (const b of this.bubbles) {
      const age = g.time - b.born;
      let x: number, y: number, z: number;
      if (b.target instanceof Player) { x = b.target.x; y = b.target.y + 2.05; z = b.target.z; if (b.target.zoneKey !== g.local.zoneKey || (b.target === g.local && this.scanner?.open)) { b.el.style.display = 'none'; continue; } }
      else { x = b.target.x; y = b.target.y; z = b.target.z; }
      const s = g.pr.worldToScreen(new THREE.Vector3(x, y, z));
      const lift = b.rise ? age * 28 : 0;
      b.el.style.left = s.x + 'px';
      b.el.style.top = (s.y - lift) + 'px';
      b.el.style.display = '';
      if (g.time > b.until - 0.4) b.el.style.opacity = '0';
    }
    this.bubbles = this.bubbles.filter((b) => { if (g.time > b.until) { b.el.remove(); return false; } return true; });
    // stack multiple bubbles above one player
    const per = new Map<any, number>();
    for (const b of [...this.bubbles].reverse()) {
      const n = per.get(b.target) || 0;
      if (n) b.el.style.top = (parseFloat(b.el.style.top) - n * 19) + 'px';
      per.set(b.target, n + 1);
    }
    // action progress bars
    const seen = new Set<string>();
    for (const p of g.players.values()) {
      const a = p.actions.current;
      const showBar = p.isLocal ? (a && a.started && a.showBar) : (p.remote?.state?.ad ?? 0) > 0.6;
      if (!showBar || p.zoneKey !== g.local.zoneKey) continue;
      seen.add(p.id);
      let el = this.bars.get(p.id);
      if (!el) { el = document.createElement('div'); el.className = 'w-bar'; el.innerHTML = '<i></i>'; this.root.appendChild(el); this.bars.set(p.id, el); }
      const s = g.pr.worldToScreen(new THREE.Vector3(p.x, p.y + 2.25, p.z));
      el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
      const prog = p.isLocal ? a!.progress : Math.min(1, (p.remote!.state!.at ?? 0) / Math.max(0.01, p.remote!.state!.ad));
      (el.firstChild as HTMLElement).style.width = Math.round(prog * 100) + '%';
    }
    for (const [id, el] of this.bars) if (!seen.has(id)) { el.remove(); this.bars.delete(id); }
    // teammate name tags (only when visible)
    const nseen = new Set<string>();
    for (const p of g.players.values()) {
      if (p.isLocal || p.zoneKey !== g.local.zoneKey || !p.rig.root.visible) continue;
      nseen.add(p.id);
      let el = this.names.get(p.id);
      if (!el) { el = document.createElement('div'); el.className = 'w-name'; this.root.appendChild(el); this.names.set(p.id, el); }
      el.textContent = p.name + (p.body.downed || p.remote?.state?.down ? ' — DOWN' : '');
      const s = g.pr.worldToScreen(new THREE.Vector3(p.x, p.y + 2.0, p.z));
      el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
    }
    for (const [id, el] of this.names) if (!nseen.has(id)) { el.remove(); this.names.delete(id); }
    if (g.net && !this.chatEl && g.input.hit('chat')) this.openChat();
    this.updateHover();
    this.inventory?.update?.(dt);
    this.scanner?.update?.(dt);
  }

  private updateHover() {
    const g = G;
    const inp = g.input;
    let kind: CursorKind = 'arrow';
    if (g.local.aiming) kind = 'aim';
    let t: PickTarget | null = null;
    if (!inp.pointerOverUI && !this.menuEl && !this.readerEl && !g.local.aiming) {
      t = pick(inp.mouseX, inp.mouseY, { creatures: g.creatures?.list?.() || [], ignore: g.local });
    }
    this.hover = t;
    const interesting = t && t.kind !== 'tile';
    if (interesting) {
      kind = 'hand';
      const name = targetName(t!);
      this.hoverLabel.textContent = name;
      this.hoverLabel.style.display = name ? 'block' : 'none';
      this.hoverLabel.style.left = (inp.mouseX + 16) + 'px';
      this.hoverLabel.style.top = (inp.mouseY + 18) + 'px';
    } else this.hoverLabel.style.display = 'none';
    if (g.local.actions.current?.started && !g.local.aiming && kind === 'arrow') kind = 'busy';
    if (kind !== this.cursorKind) {
      this.cursorKind = kind;
      const v = cursorValue(kind);
      const cv = g.pr?.renderer?.domElement as HTMLCanvasElement | undefined;
      if (cv) cv.style.cursor = v;
      document.body.style.cursor = v;
    }
    // highlight overlay for hovered objects
    const key = t?.kind === 'object' ? 'o' + t.obj.uid + ':' + t.obj.x + ',' + t.obj.y + ':' + t.obj.rot : '';
    if (key !== this.hlKey) {
      this.hlKey = key;
      if (this.hlMesh) { this.hlMesh.parent?.remove(this.hlMesh); this.hlMesh = null; }
      if (t?.kind === 'object' && g.view) {
        const m = g.view.zr.highlightMesh(t.obj);
        if (m) { g.pr.scene.add(m); this.hlMesh = m; }
      }
    }
    // clicks on the world
    if (!inp.pointerOverUI && !this.readerEl && !this.modal) {
      if (inp.clicked(2) && !g.local.aiming) {
        const tt = pick(inp.mouseX, inp.mouseY, { creatures: g.creatures?.list?.() || [], ignore: g.local });
        if (tt) this.onWorldClick?.(tt, 2);
      } else if (inp.clicked(0) && !g.local.aiming && t) {
        this.onWorldClick?.(t, 0);
      }
    }
    if (inp.hit('interact')) this.onInteractKey?.();
    if (inp.hit('pause')) {
      if (this.menuEl) this.closeMenu();
      else if (this.readerEl) this.closeReader();
      else if (this.inventory?.open) this.inventory.toggle(false);
      else if (this.scanner?.open) this.scanner.toggle(false);
      else bus.emit('pauseMenu');
    }
  }
}

export function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }

import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { PixelCanvas, makeRamp } from '../gfx/pixel';
import { tileFbm } from '../core/rng';
import { Player } from '../entities/player';
import { pick, PickTarget, targetName } from '../game/picking';

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

function cursorDataUrl(kind: 'arrow' | 'hand' | 'aim' | 'busy'): string {
  const pc = new PixelCanvas(24, 24); pc.wrap = false;
  const K = 0x0e0c08, W = 0xf2ecd8, A = 0xf2b33d;
  if (kind === 'aim') {
    for (const [x, y] of [[11, 2], [11, 3], [11, 4], [11, 5], [11, 17], [11, 18], [11, 19], [11, 20], [2, 11], [3, 11], [4, 11], [5, 11], [17, 11], [18, 11], [19, 11], [20, 11]]) { pc.set(x, y, W); pc.set(x + 1, y, K); pc.set(x, y + 1, K); }
    pc.set(11, 11, A); pc.set(12, 11, K); pc.set(11, 12, K);
  } else {
    // pixel arrow
    const rows = ['X', 'XX', 'XWX', 'XWWX', 'XWWWX', 'XWWWWX', 'XWWWWWX', 'XWWWWWWX', 'XWWWWWWWX', 'XWWWWWXXXX', 'XWWXWWX', 'XWX XWWX', 'XX  XWWX', 'X    XWWX', '     XWWX', '      XX'];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { if (r[x] === 'X') pc.set(x + 1, y + 1, K); else if (r[x] === 'W') pc.set(x + 1, y + 1, kind === 'hand' ? A : W); } });
    if (kind === 'busy') { pc.rect(14, 14, 6, 6, K); pc.rect(15, 15, 4, 4, A); }
  }
  const c = document.createElement('canvas'); c.width = 24; c.height = 24;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c.toDataURL();
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
    for (const k of ['arrow', 'hand', 'aim', 'busy'] as const) this.cursors[k] = cursorDataUrl(k);
    this.cursor = document.createElement('img'); this.cursor.id = 'cursor'; this.cursor.src = this.cursors.arrow;
    document.body.appendChild(this.cursor);
    document.addEventListener('mousemove', (e) => { this.cursor.style.left = e.clientX + 'px'; this.cursor.style.top = e.clientY + 'px'; });
    document.body.style.cursor = 'none';
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

  blocksMovement() { return !!this.readerEl || !!this.modal; }

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

  toast(title: string, sub = '', secs = 3.5) {
    const el = document.createElement('div');
    el.className = 'k-toast';
    el.innerHTML = `${escapeHtml(title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, secs * 1000);
    setTimeout(() => el.remove(), secs * 1000 + 1400);
  }

  // ---------------- context menu ----------------
  openMenu(x: number, y: number, title: string, opts: MenuOption[]) {
    this.closeMenu();
    if (!opts.length) return;
    const el = this.buildMenu(title, opts);
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = Math.min(x + 4, window.innerWidth - r.width - 6) + 'px';
    el.style.top = Math.min(y + 4, window.innerHeight - r.height - 6) + 'px';
    this.menuEl = el;
    G.audio?.ui?.('menu');
  }
  private buildMenu(title: string, opts: MenuOption[]): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'k-menu';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    if (title) { const h = document.createElement('div'); h.className = 'mh'; h.textContent = title; el.appendChild(h); }
    for (const o of opts) {
      if (o.label === '-') { const s = document.createElement('div'); s.className = 'sep'; el.appendChild(s); continue; }
      const mi = document.createElement('div');
      mi.className = 'mi' + (o.disabled ? ' dis' : '') + (o.danger ? ' danger' : '');
      mi.textContent = o.label;
      if (typeof o.disabled === 'string') { const w = document.createElement('span'); w.className = 'why'; w.textContent = o.disabled; mi.appendChild(w); }
      if (o.sub && o.sub.length) {
        const s = document.createElement('span'); s.className = 'sub'; s.textContent = '▸'; mi.appendChild(s);
        let subEl: HTMLDivElement | null = null;
        mi.addEventListener('mouseenter', () => {
          el.querySelectorAll(':scope > .k-menu').forEach((n) => n.remove());
          subEl = this.buildMenu('', o.sub!);
          subEl.style.position = 'fixed';
          document.body.appendChild(subEl);
          const r = mi.getBoundingClientRect();
          const sr = subEl.getBoundingClientRect();
          subEl.style.left = (r.right + sr.width > window.innerWidth ? r.left - sr.width : r.right) + 'px';
          subEl.style.top = Math.min(r.top - 4, window.innerHeight - sr.height - 6) + 'px';
          (el as any)._sub?.remove(); (el as any)._sub = subEl;
          subEl.addEventListener('mouseleave', () => {});
        });
      } else {
        mi.addEventListener('mouseenter', () => { (el as any)._sub?.remove(); });
      }
      if (!o.disabled && o.action) mi.addEventListener('click', (e) => { e.stopPropagation(); this.closeMenu(); G.audio?.ui?.('click'); o.action!(); });
      el.appendChild(mi);
    }
    return el;
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
    el.className = 'k-reader' + (style === 'terminal' ? ' terminal' : '');
    el.innerHTML = `<div class="close">[ CLOSE ]</div><h3>${escapeHtml(title)}</h3><pre></pre>`;
    const pre = el.querySelector('pre')!;
    if (style === 'terminal') {
      // typewriter effect on terminals
      let i = 0;
      const tick = () => { if (!el.isConnected) return; i = Math.min(text.length, i + 6); pre.textContent = text.slice(0, i) + (i < text.length ? '█' : ''); if (i < text.length) setTimeout(tick, 16); };
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
    el.innerHTML = html;
    if (button) { const b = document.createElement('div'); b.className = 'k-btn'; b.textContent = button.label; b.onclick = () => { el.remove(); this.modal = null; button.action(); }; el.appendChild(b); }
    document.body.appendChild(el);
    this.modal = el;
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
      if (b.target instanceof Player) { x = b.target.x; y = b.target.y + 2.05; z = b.target.z; if (b.target.zoneKey !== g.local.zoneKey) { b.el.style.display = 'none'; continue; } }
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
    this.updateHover();
    this.inventory?.update?.(dt);
    this.scanner?.update?.(dt);
  }

  private updateHover() {
    const g = G;
    const inp = g.input;
    let kind: 'arrow' | 'hand' | 'aim' | 'busy' = 'arrow';
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
    const src = this.cursors[kind];
    if (this.cursor.src !== src) { this.cursor.src = src; this.cursor.className = kind === 'aim' ? 'aim' : ''; }
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

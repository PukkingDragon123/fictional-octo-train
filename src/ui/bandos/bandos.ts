// BAND OS (round 17): the operator's desktop, projected by the unit's band. Esc (the pause), Tab or the
// phone's MENU key put it up; time holds while it projects (solo). A real little desktop:
//
//   the wallpaper    the Institute's bishop over a dark grid, scanlines, a soft vignette
//   the top bar      the launcher (the bishop), the level, the day and time, credits and RP
//   the dock         the apps as little 3D models (src/ui/machine/decor.ts), a lit lamp under each one running
//   desktop icons    double-click (tap on a phone) to open
//   windows          dragged by their title bar, resized from the corner, minimised to the dock, maximised,
//                    closed; the one in front takes the keys. No rounded corners anywhere.
//   the launcher     every app, and the power keys: Resume, Save tape, Quit to title
//   the boot         the first projection of a session boots (bios lines, the logo, a bar); later ones
//                    just flicker on. A click or a key skips it.
//
// On a phone held upright every app is full screen, with the dock along the bottom.
// The apps (./apps.ts) reuse the game's own pages and systems: the pause's file, the survey plotter,
// the quest runtime, the lab's codex and requisition panels, the options panel.
import './bandos.css';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { sfx } from '../menus/sfx';
import { mxIcon, type IconKind } from '../machine/decor';
import { mxOk } from '../machine/core';
import { emblemCanvas, logoCanvas } from '../brand/logo';
import { isTouchMode } from '../touch/mode';
import { APPS, type AppDef } from './apps';
import { isLoading } from '../loading';
import { researchPoints } from '../../game/research';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const reduce = () => document.documentElement.classList.contains('reduce-flash') || document.body.classList.contains('reduce-flash');

export interface WinApi { readonly body: HTMLElement; readonly key: string; setTitle(t: string): void; close(): void; focus(): void; readonly os: BandOS }
interface Win extends WinApi { el: HTMLElement; app: AppDef; min: boolean; max: boolean; rect: { x: number; y: number; w: number; h: number }; dispose?: () => void; tick?: (dt: number) => void }

export class BandOS {
  open = false;
  private root = el('div', 'bos');
  private desk = el('div', 'bos-desk');
  private bar = el('div', 'bos-bar');
  private dock = el('div', 'bos-dock');
  private launcherEl = el('div', 'bos-launch');
  private wins: Win[] = [];
  private z = 10;
  private booted = false;
  private built = false;
  private raf = 0;
  private last = 0;
  private clockT = 0;
  private dockBtns = new Map<string, HTMLButtonElement>();
  private prevPaused = false;

  constructor() {
    (G as any).bandos = this;
    bus.on('pauseMenu', () => this.toggle());
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get phone() { return isTouchMode() && (window.innerWidth < 760 || window.innerHeight > window.innerWidth); }

  // ---------------------------------------------------------------- open / close
  toggle(v = !this.open) { if (v) this.show(); else this.hide(); }
  show() {
    if (this.open) return;
    if (!G.local || isLoading() || document.body.classList.contains('noclip-cine')) return;
    this.build();
    this.open = true;
    const solo = G.role === 'solo';
    this.prevPaused = !!G.paused;
    if (solo) G.paused = true;
    if (G.input) G.input.pointerOverUI = true;
    document.body.append(this.root);
    this.root.classList.toggle('phone', this.phone);
    this.root.classList.toggle('live', !solo);
    this.refreshBar();
    this.layoutAll();
    if (!this.booted && !reduce()) { this.boot(); this.booted = true; }
    else { this.root.classList.remove('booting'); requestAnimationFrame(() => this.root.classList.add('on')); sfx(solo ? 'freeze' : 'open', 0.7); }
    this.booted = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    G.hudBody?.setHidden?.('bandos', true);
  }
  hide(quiet = false) {
    if (!this.open) return;
    this.open = false;
    this.closeLauncher();
    this.root.classList.remove('on');
    cancelAnimationFrame(this.raf);
    // apps that borrowed something give it back while the desktop is down (the plotter's canvas, a lab panel)
    for (const w of [...this.wins]) if (w.app.closeOnHide) this.closeWin(w, true);
    setTimeout(() => { if (!this.open) this.root.remove(); }, 180);
    if (G.role === 'solo') G.paused = false;
    if (G.input) G.input.pointerOverUI = false;
    G.hudBody?.setHidden?.('bandos', false);
    if (!quiet) sfx('back', 0.6);
  }

  private frame = (now: number) => {
    if (!this.open) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    for (const w of this.wins) if (!w.min) w.tick?.(dt);
    this.clockT -= dt;
    if (this.clockT <= 0) { this.clockT = 1; this.refreshBar(); }
    this.raf = requestAnimationFrame(this.frame);
  };

  // ---------------------------------------------------------------- the shell
  private build() {
    if (this.built) return;
    this.built = true;
    const r = this.root;
    // the wallpaper: the bishop large and faint over a grid
    const wall = el('div', 'bos-wall');
    const big = document.createElement('canvas'); big.width = big.height = 64;
    big.getContext('2d')!.drawImage(emblemCanvas(64), 0, 0);
    big.className = 'bos-wall-emblem';
    wall.append(big, el('div', 'bos-wall-word', 'MERIDIAN INSTITUTE OF LIMINALITY<small>operator band · projection</small>'));
    r.append(wall, this.desk, this.bar, this.dock, this.launcherEl, el('div', 'bos-scan'));
    // the top bar
    const start = el('button', 'bos-start') as HTMLButtonElement;
    start.type = 'button'; start.setAttribute('aria-label', 'Launcher');
    const se = document.createElement('canvas'); se.width = se.height = 22; se.getContext('2d')!.drawImage(emblemCanvas(22), 0, 0);
    start.append(se, el('b', '', 'BAND OS'));
    start.addEventListener('click', () => this.toggleLauncher());
    this.bar.append(start, el('span', 'bos-bar-zone'), el('span', 'bos-bar-stat'), el('span', 'bos-bar-clock'));
    // desktop icons
    const icons = el('div', 'bos-icons');
    for (const a of APPS.filter((x) => x.desk !== false)) {
      const b = el('button', 'bos-icon') as HTMLButtonElement;
      b.type = 'button'; b.title = a.title; b.dataset.k = a.key;
      const ic = mxOk() ? mxIcon(a.icon, 30) : null;
      if (ic) b.append(ic);
      b.append(el('span', '', esc(a.title)));
      let lastT = 0;
      b.addEventListener('click', () => { const t = performance.now(); if (this.phone || isTouchMode() || t - lastT < 420) this.launch(a.key); lastT = t; sfx('tick', 0.35); });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.launch(a.key); });
      icons.append(b);
    }
    this.desk.append(icons);
    // the dock
    for (const a of APPS) {
      const b = el('button', 'bos-dk') as HTMLButtonElement;
      b.type = 'button'; b.title = a.title; b.dataset.k = a.key; b.setAttribute('aria-label', a.title);
      const ic = mxOk() ? mxIcon(a.icon, 28) : null;
      if (ic) b.append(ic); else b.append(el('b', '', a.title.slice(0, 2)));
      b.append(el('i', 'bos-dk-lamp'), el('span', 'bos-dk-tip', esc(a.title)));
      b.addEventListener('click', () => { sfx('key', 0.5); this.launch(a.key, true); });
      this.dock.append(b);
      this.dockBtns.set(a.key, b);
    }
    // the launcher
    this.buildLauncher();
    r.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('.bos-launch, .bos-start')) this.closeLauncher(); }, true);
    window.addEventListener('resize', () => { if (this.open) { this.root.classList.toggle('phone', this.phone); this.layoutAll(); } });
  }

  private buildLauncher() {
    const L = this.launcherEl;
    L.innerHTML = '';
    const head = el('div', 'bos-l-head');
    head.append(logoCanvas('horizontal', 1));
    L.append(head);
    const list = el('div', 'bos-l-apps');
    APPS.forEach((a, i) => {
      const b = el('button', 'bos-l-app') as HTMLButtonElement;
      b.type = 'button';
      const ic = mxOk() ? mxIcon(a.icon, 24) : null;
      if (ic) b.append(ic);
      b.append(el('span', '', `${esc(a.title)}<small>${esc(a.sub)}</small>`), el('kbd', '', i < 9 ? String(i + 1) : i === 9 ? '0' : ''));
      b.addEventListener('click', () => { this.closeLauncher(); this.launch(a.key); });
      list.append(b);
    });
    const power = el('div', 'bos-l-power');
    const key = (label: string, cls: string, fn: () => void) => { const b = el('button', 'bos-pk ' + cls, esc(label)) as HTMLButtonElement; b.type = 'button'; b.addEventListener('click', fn); power.append(b); };
    key('Resume', 'go', () => this.hide());
    if (G.role !== 'client') key('Save tape', '', async () => {
      const { saveGame } = await import('../../game/save');
      const ok = await saveGame();
      this.toast(ok ? 'Tape saved to this browser.' : 'Could not save.');
    });
    key('Quit to title', 'stop', async () => {
      const { confirmDialog } = await import('../menus/common');
      const ok = await confirmDialog({ title: 'Quit to title', body: G.role === 'client' ? 'Leave the room and go back to the title?' : 'Your progress is saved first, then the tape rewinds to the title.', ok: 'Quit', cancel: 'Stay', danger: true });
      if (!ok) return;
      if (G.role !== 'client') { const { saveGame } = await import('../../game/save'); await saveGame(); }
      location.reload();
    });
    L.append(list, power);
  }
  private toggleLauncher() { this.launcherEl.classList.contains('on') ? this.closeLauncher() : (this.launcherEl.classList.add('on'), sfx('relay', 0.4)); }
  private closeLauncher() { this.launcherEl.classList.remove('on'); }

  private refreshBar() {
    const p = G.local;
    const c = G.clock as any;
    const hrs = c?.hours ?? 0;
    const zone = p ? ((G as any).getZone?.(p.zoneKey)?.name ?? p.zoneKey) : '';
    (this.bar.querySelector('.bos-bar-zone') as HTMLElement).textContent = zone || '';
    const d = (G as any).debt;
    let rp = 0;
    try { rp = researchPoints(); } catch { /* no profile */ }
    const stat = this.bar.querySelector('.bos-bar-stat') as HTMLElement;
    stat.textContent = (d?.on && !d.cleared ? `${Math.round(d.remaining ?? 0).toLocaleString('en-GB')} owed · ` : '') + `${rp} RP`;
    (this.bar.querySelector('.bos-bar-clock') as HTMLElement).textContent = `DAY ${c?.day ?? Math.floor(hrs / 24) + 1} · ${String(Math.floor(hrs % 24)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}${G.role === 'solo' ? ' · HELD' : ''}`;
  }

  /** a line from the band: the subtitle strip, never a box */
  toast(text: string) {
    const s = el('div', 'bos-line', esc(text));
    this.root.append(s);
    requestAnimationFrame(() => s.classList.add('on'));
    setTimeout(() => { s.classList.remove('on'); setTimeout(() => s.remove(), 400); }, 2600);
  }

  // ---------------------------------------------------------------- the boot
  private boot() {
    const r = this.root;
    r.classList.add('booting', 'on');
    const b = el('div', 'bos-boot');
    const logo = logoCanvas('stacked', 2);
    logo.className = 'bos-boot-logo';
    const lines = el('div', 'bos-boot-lines');
    const bar = el('div', 'bos-boot-bar', '<i></i>');
    b.append(logo, lines, bar);
    r.append(b);
    sfx('boot', 0.55);
    const L = ['BAND OS 3.1 · OPERATOR PROJECTION', 'link .............. OK', 'unit vitals ....... OK', 'survey plotter .... OK', 'remittance ledger . OK', 'mount /field/tapes', 'welcome, operator'];
    let i = 0, done = false;
    const end = () => { if (done) return; done = true; clearInterval(iv); b.classList.add('out'); r.classList.remove('booting'); setTimeout(() => b.remove(), 420); window.removeEventListener('keydown', skip, true); b.removeEventListener('pointerdown', skip); };
    const skip = (e: Event) => { e.preventDefault(); e.stopPropagation(); end(); };
    const iv = setInterval(() => {
      if (i < L.length) { lines.append(el('div', '', esc(L[i]))); sfx('type', 0.25); }
      (bar.firstChild as HTMLElement).style.width = Math.min(100, (i / L.length) * 100) + '%';
      i++;
      if (i > L.length + 1) end();
    }, 170);
    window.addEventListener('keydown', skip, true);
    b.addEventListener('pointerdown', skip);
  }

  // ---------------------------------------------------------------- windows
  launch(key: string, fromDock = false) {
    const a = APPS.find((x) => x.key === key);
    if (!a) return;
    const had = this.wins.find((w) => w.key === key);
    if (had) {
      if (had.min) { had.min = false; had.el.classList.remove('min'); this.focusWin(had); }
      else if (fromDock && this.top() === had) { had.min = true; had.el.classList.add('min'); this.syncDock(); }
      else this.focusWin(had);
      this.syncDock();
      return;
    }
    // apps that share one host (the lab's panels) close the other first
    if (a.group) for (const w of this.wins.filter((x) => x.app.group === a.group)) this.closeWin(w, true);
    const win = el('section', 'bos-win') as HTMLElement;
    win.dataset.k = key;
    const tb = el('header', 'bos-tb');
    const ic = mxOk() ? mxIcon(a.icon, 18) : null;
    if (ic) tb.append(ic);
    const title = el('b', 'bos-tt', esc(a.title));
    const btns = el('span', 'bos-tbb');
    const mk = (cls: string, label: string, fn: () => void) => { const b = el('button', 'bos-wb ' + cls) as HTMLButtonElement; b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); btns.append(b); return b; };
    const body = el('div', 'bos-wbody');
    const W: Win = {
      el: win, app: a, key, body, min: false, max: false, rect: { x: 0, y: 0, w: a.w, h: a.h }, os: this,
      setTitle: (t) => { title.textContent = t; },
      close: () => this.closeWin(W),
      focus: () => this.focusWin(W),
    };
    mk('min', 'Minimise', () => { W.min = true; win.classList.add('min'); this.syncDock(); sfx('tick', 0.4); });
    mk('max', 'Maximise', () => { W.max = !W.max; win.classList.toggle('max', W.max); this.place(W); sfx('tick', 0.4); });
    mk('x', 'Close', () => { this.closeWin(W); sfx('back', 0.5); });
    tb.append(title, btns);
    const grip = el('i', 'bos-grip');
    win.append(tb, body, grip);
    // placement: cascade from the upper left of the free area
    const n = this.wins.length;
    W.rect.x = 120 + (n % 6) * 34; W.rect.y = 64 + (n % 6) * 28;
    this.desk.append(win);
    this.wins.push(W);
    this.place(W);
    this.focusWin(W);
    this.drag(W, tb); this.resize(W, grip);
    win.addEventListener('pointerdown', () => this.focusWin(W));
    tb.addEventListener('dblclick', () => { W.max = !W.max; win.classList.toggle('max', W.max); this.place(W); });
    try {
      const out = a.build(W);
      if (out && typeof out === 'object') { W.dispose = out.dispose; W.tick = out.tick; }
    } catch (e) { console.error('band app', key, e); body.append(el('p', 'bos-err', 'This app crashed. The band logged it.')); }
    if (!reduce()) { win.classList.add('in'); setTimeout(() => win.classList.remove('in'), 260); }
    sfx('open', 0.45);
    this.syncDock();
  }
  private top(): Win | null { let t: Win | null = null; for (const w of this.wins) if (!w.min && (!t || Number(w.el.style.zIndex) > Number(t.el.style.zIndex))) t = w; return t; }
  private focusWin(w: Win) {
    if (w.el.style.zIndex !== String(this.z)) w.el.style.zIndex = String(++this.z);
    for (const o of this.wins) o.el.classList.toggle('front', o === w);
  }
  closeWin(w: Win, quiet = false) {
    const i = this.wins.indexOf(w);
    if (i < 0) return;
    this.wins.splice(i, 1);
    try { w.dispose?.(); } catch (e) { console.warn(e); }
    w.el.remove();
    if (!quiet) sfx('back', 0.4);
    this.syncDock();
  }
  private syncDock() {
    for (const [k, b] of this.dockBtns) {
      const w = this.wins.find((x) => x.key === k);
      b.classList.toggle('run', !!w);
      b.classList.toggle('min', !!w?.min);
    }
  }
  /** the free area between the top bar and the dock */
  private area() {
    const top = this.bar.offsetHeight || 30, bot = (this.dock.offsetHeight || 56) + 10;
    return { x: 0, y: top, w: window.innerWidth, h: Math.max(120, window.innerHeight - top - bot) };
  }
  private place(w: Win) {
    const A = this.area(), st = w.el.style;
    if (this.phone || w.max) { st.left = A.x + 'px'; st.top = A.y + 'px'; st.width = A.w + 'px'; st.height = A.h + 'px'; return; }
    const r = w.rect;
    r.w = Math.max(260, Math.min(r.w, A.w - 16)); r.h = Math.max(160, Math.min(r.h, A.h - 8));
    r.x = Math.max(4, Math.min(r.x, A.w - 80)); r.y = Math.max(A.y + 2, Math.min(r.y, A.y + A.h - 40));
    st.left = r.x + 'px'; st.top = r.y + 'px'; st.width = r.w + 'px'; st.height = r.h + 'px';
  }
  private layoutAll() { for (const w of this.wins) this.place(w); }
  private drag(w: Win, handle: HTMLElement) {
    handle.addEventListener('pointerdown', (e) => {
      if (this.phone || w.max || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = w.rect.x, oy = w.rect.y;
      handle.setPointerCapture?.(e.pointerId);
      w.el.classList.add('drag');
      const mv = (ev: PointerEvent) => { w.rect.x = ox + ev.clientX - sx; w.rect.y = oy + ev.clientY - sy; this.place(w); };
      const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); w.el.classList.remove('drag'); };
      handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }
  private resize(w: Win, grip: HTMLElement) {
    grip.addEventListener('pointerdown', (e) => {
      if (this.phone || w.max) return;
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, ow = w.rect.w, oh = w.rect.h;
      grip.setPointerCapture?.(e.pointerId);
      const mv = (ev: PointerEvent) => { w.rect.w = ow + ev.clientX - sx; w.rect.h = oh + ev.clientY - sy; this.place(w); };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
  }

  // ---------------------------------------------------------------- keys
  private onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]');
    if (!this.open) {
      if (e.code === 'Tab' && !e.repeat && !typing && !G.input?.textFocus && G.local && !(G as any).ui?.modal && !document.querySelector('.ipnl, .kd-veil, .mx-over:not(.mx-embed)')) { e.preventDefault(); e.stopImmediatePropagation(); this.show(); }
      return;
    }
    if (document.querySelector('.kd-veil')) return; // a confirm dialog over the desktop takes the keys
    if (e.code === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (this.launcherEl.classList.contains('on')) { this.closeLauncher(); return; }
      const t = this.top();
      if (t) { this.closeWin(t); sfx('back', 0.45); } else this.hide();
      return;
    }
    if (typing) return;
    if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); this.hide(); return; }
    const m = /^Digit(\d)$/.exec(e.code);
    if (m && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = m[1] === '0' ? 9 : Number(m[1]) - 1;
      if (APPS[i]) { e.preventDefault(); e.stopImmediatePropagation(); this.launch(APPS[i].key, true); }
    }
  }
}

let os: BandOS | null = null;
export function installBandOS(): BandOS { return (os ??= new BandOS()); }

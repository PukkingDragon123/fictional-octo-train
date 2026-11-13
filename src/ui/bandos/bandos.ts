// THE BAND (round 17): the operator's wrist terminal. Esc (the pause), Tab or the phone's MENU key
// raise the left forearm into view with the unit strapped on it; time holds while it is up (solo).
//
//   the unit      a heavy olive field instrument (./wrist3d.ts): a CRT in a deep bezel under a sun
//                 visor, the SELECT dial on the left, the brightness knob and the phosphor toggle on
//                 the right, RESUME / SAVE / QUIT keys under the tube, a message lamp
//   the tube      an old monochrome CRT: phosphor green (or amber, on the toggle) with amber accents,
//                 scanlines, a slight barrel bulge, bloom, a colour fringe, film grain, a vignette,
//                 a rolling bar and a flicker. Alagard, big.
//   home          the apps as big 3D models turning slowly on their turntables (src/ui/machine/decor.ts),
//                 three by three, a chunky label under each. Pick with the pointer, a tap, the arrows
//                 and Enter, the number keys, or the dial (scroll it, or click its left / right / middle)
//   transitions   raise: the arm comes up, then the tube powers on (a bright line opens, the static
//                 settles); an app: a static burst and the picture rolls in; back: it collapses to a dot;
//                 the dial turns to the app, a recorded ratchet click at every detent
//   the apps      full screen in the tube (./apps.ts), reusing the game's own pages and systems, toned
//                 to the phosphor
//
// On a phone held upright the unit fills the screen (no arm) and the icons are thumb sized.
import './bandos.css';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { sfx } from '../menus/sfx';
import { mxOk } from '../machine/core';
import { mxIconSpin, mxIconSpinWarm } from '../machine/decor';
import { mxButton, mxKnob, mxToggleCanvas } from '../machine/kit';
import { isTouchMode } from '../touch/mode';
import { isLoading } from '../loading';
import { purseLine } from '../../game/economy/money';
import { researchPoints } from '../../game/research';
import { APPS, hookMail, mailCount, type AppDef } from './apps';
import { WIDE, TALL, wristArt, wristDial, type WristLayout } from './wrist3d';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const reduce = () => document.documentElement.classList.contains('reduce-flash') || document.body.classList.contains('reduce-flash');
const store = { get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };

/** what an app gets: its body in the tube, and the unit */
export interface WinApi { readonly body: HTMLElement; readonly key: string; setTitle(t: string): void; close(): void; focus(): void; readonly os: BandOS }
interface Run { app: AppDef; api: WinApi; body: HTMLElement; dispose?: () => void; tick?: (dt: number) => void }
type Spin = NonNullable<ReturnType<typeof mxIconSpin>>;

export class BandOS {
  open = false;
  private root = el('div', 'wt');
  private L: WristLayout = WIDE;
  private built = '';
  private rig!: HTMLElement; private lift!: HTMLElement; private tube!: HTMLElement; private glass!: HTMLElement;
  private topL!: HTMLElement; private topR!: HTMLElement; private foot!: HTMLElement; private home!: HTMLElement; private appEl!: HTMLElement;
  private fx!: HTMLCanvasElement;
  private icons: { b: HTMLButtonElement; spin: Spin | null }[] = [];
  private dial: ReturnType<typeof wristDial> = null;
  private knob: ReturnType<typeof mxKnob> = null;
  private tog: ReturnType<typeof mxToggleCanvas> = null;
  private msgLamp!: HTMLElement;
  private sel = 0;
  private cur: Run | null = null;
  private busy = 0;
  private raf = 0; private last = 0; private clockT = 0;
  private fxT = 0; private fxK = 0;
  private amber = store.get('band.phos') === 'amber';
  private bright = Number(store.get('band.bright') ?? 2) || 2;
  private lineT = 0;
  private mailSeen = 0;
  private timers: number[] = [];

  constructor() {
    (G as any).bandos = this;
    bus.on('pauseMenu', () => this.toggle());
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('resize', () => { if (this.open) this.layout(); });
    // bake the home screen's turntables while the game idles, so the band turns at once
    const warm = () => { if (!mxOk()) return; for (const a of APPS) mxIconSpinWarm(a.icon, this.iconSize()); };
    setTimeout(() => { const ric = (window as any).requestIdleCallback as ((f: () => void, o?: object) => void) | undefined; if (ric) ric(warm, { timeout: 4000 }); else warm(); }, 6000);
  }

  get phone() { return isTouchMode() && (window.innerWidth < 760 || window.innerHeight > window.innerWidth); }
  /** the turntable models' size (their canvases are 8 px larger: the pad) */
  private iconSize() { return this.phone ? 76 : 70; }

  // ---------------------------------------------------------------- raise / lower
  toggle(v = !this.open) { if (v) this.show(); else this.hide(); }
  show() {
    if (this.open) return;
    if (!G.local || isLoading() || document.body.classList.contains('noclip-cine')) return;
    hookMail();
    this.open = true;
    this.L = this.phone ? TALL : WIDE;
    this.build();
    const solo = G.role === 'solo';
    if (solo) G.paused = true;
    if (G.input) G.input.pointerOverUI = true;
    G.hudBody?.setHidden?.('bandos', true);
    this.root.classList.toggle('live', !solo);
    this.root.classList.remove('on', 'up');
    this.tube.classList.remove('lit');
    document.body.append(this.root);
    this.layout();
    this.toHome(true);
    this.refreshTop();
    for (const ic of this.icons) ic.spin?.wake();
    this.dial?.to(0, true);
    // the arm comes up, then the tube powers on
    void this.root.offsetWidth;
    this.root.classList.add('on');
    requestAnimationFrame(() => this.root.classList.add('up'));
    sfx(solo ? 'freeze' : 'open', 0.5);
    sfx('servo', 0.4);
    this.busy = 1;
    this.later(reduce() ? 60 : 420, () => this.powerOn());
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }
  hide(quiet = false) {
    if (!this.open) return;
    this.open = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    // apps that borrowed something give it back (the plotter's canvas, a lab panel)
    this.endApp();
    if (G.role === 'solo') G.paused = false;
    if (G.input) G.input.pointerOverUI = false;
    G.hudBody?.setHidden?.('bandos', false);
    if (!quiet) sfx('back', 0.5);
    // the tube collapses to a dot, then the arm goes down
    this.tube.classList.remove('lit', 'roll');
    this.tube.classList.add('dot');
    this.dial?.to(0);
    const root = this.root;
    setTimeout(() => { if (!this.open) root.classList.remove('up'); }, reduce() ? 0 : 220);
    setTimeout(() => { if (!this.open) { root.classList.remove('on'); cancelAnimationFrame(this.raf); } }, reduce() ? 60 : 520);
    setTimeout(() => { if (!this.open) root.remove(); }, reduce() ? 80 : 640);
  }
  private later(ms: number, fn: () => void) { const id = window.setTimeout(() => { this.timers = this.timers.filter((x) => x !== id); if (this.open) fn(); }, ms); this.timers.push(id); }

  /** the tube powers on: a bright line opens to the picture, the static settles */
  private powerOn(short = false) {
    this.tube.classList.remove('dot', 'roll');
    void this.tube.offsetWidth;
    this.tube.classList.add('lit');
    this.tube.classList.toggle('quick', short);
    this.staticBurst(short ? 0.45 : 0.85, short ? 0.35 : 0.7);
    sfx('boot', short ? 0.3 : 0.5);
    if (!short) this.later(160, () => this.dial?.to(this.sel + 1));
    this.later(short ? 220 : 520, () => { this.busy = 0; });
  }

  // ---------------------------------------------------------------- the frame
  private frame = (now: number) => {
    if (!this.open) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    const c = this.cur;
    if (c?.tick) { try { c.tick(dt); } catch (e) { console.warn('band app', c.app.key, e); c.tick = undefined; } }
    this.clockT -= dt;
    if (this.clockT <= 0) { this.clockT = 1; this.refreshTop(); this.syncMsg(); }
    if (this.lineT > 0) { this.lineT -= dt; if (this.lineT <= 0) this.footLine(); }
    this.drawFx(dt);
    this.raf = requestAnimationFrame(this.frame);
  };
  /** static on the tube: k strength, for t seconds (fading) */
  private staticBurst(k: number, t: number) { if (reduce()) return; this.fxK = k; this.fxT = t; }
  private drawFx(dt: number) {
    const cv = this.fx, c = cv.getContext('2d')!;
    if (this.fxT <= 0) { if (cv.dataset.on) { c.clearRect(0, 0, cv.width, cv.height); delete cv.dataset.on; } return; }
    this.fxT = Math.max(0, this.fxT - dt);
    cv.dataset.on = '1';
    const w = cv.width, h = cv.height, im = c.createImageData(w, h), d = im.data;
    const a = Math.min(1, this.fxK * Math.min(1, this.fxT * 3)) * 255;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = Math.random() < 0.85 ? a : 0; }
    // a few torn bright lines
    c.putImageData(im, 0, 0);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k < 3; k++) c.fillRect(0, Math.floor(Math.random() * h), w, 1);
  }

  // ---------------------------------------------------------------- building
  private build() {
    const L = this.L, key = L.kind + (mxOk() ? 'm' : '');
    if (this.built === key) return;
    this.built = key;
    this.endApp();
    const r = this.root;
    r.replaceChildren();
    r.className = 'wt ' + L.kind + (this.amber ? ' amb' : '');
    this.rig = el('div', 'wt-rig');
    this.lift = el('div', 'wt-lift');
    this.rig.append(this.lift);
    this.lift.style.width = L.W + 'px'; this.lift.style.height = L.H + 'px';
    // the unit (and the arm) as one picture, or a plain case without WebGL
    const skin = (G.local as any)?.app?.skin ?? 0xe8b98f;
    const art = wristArt(L, skin);
    if (art) { art.className = 'wt-art'; art.style.left = L.ox + 'px'; art.style.top = L.oy + 'px'; art.style.width = L.cw + 'px'; art.style.height = L.ch + 'px'; this.lift.append(art); }
    else this.lift.classList.add('flat');
    // the tube
    const crt = el('div', 'wt-crt');
    Object.assign(crt.style, { left: L.scr.x + 'px', top: L.scr.y + 'px', width: L.scr.w + 'px', height: L.scr.h + 'px' });
    this.tube = el('div', 'wt-tube');
    this.glass = el('div', 'wt-glass');
    const top = el('div', 'wt-top');
    this.topL = el('b'); this.topR = el('span');
    top.append(this.topL, this.topR);
    this.home = el('div', 'wt-home');
    this.appEl = el('div', 'wt-app');
    this.foot = el('div', 'wt-foot');
    this.glass.append(top, this.home, this.appEl, this.foot);
    this.fx = document.createElement('canvas'); this.fx.className = 'wt-fx';
    this.fx.width = Math.ceil(L.scr.w / 3); this.fx.height = Math.ceil(L.scr.h / 3);
    const grain = el('i', 'wt-grain');
    grain.style.backgroundImage = `url(${grainUrl()})`;
    this.tube.append(this.glass, el('i', 'wt-scan'), el('i', 'wt-roll'), grain, this.fx, el('i', 'wt-vig'), el('i', 'wt-flash'));
    crt.append(this.tube);
    this.lift.append(crt);
    this.glass.style.filter = `url(#${crtFilter(L.scr.w, L.scr.h)})`;
    // home: the apps three by three
    this.icons = [];
    const size = this.iconSize();
    APPS.forEach((a, i) => {
      const b = el('button', 'wt-ic') as HTMLButtonElement;
      b.type = 'button'; b.dataset.k = a.key; b.setAttribute('aria-label', `${a.title}: ${a.sub}`);
      const spin = mxOk() ? mxIconSpin(a.icon, size) : null;
      const well = el('span', 'wt-ic-m');
      if (spin) well.append(spin.cv); else well.append(el('b', '', esc(a.title.slice(0, 2).toUpperCase())));
      b.append(well, el('span', 'wt-ic-l', `<i>${i + 1}</i>${esc(a.title.toUpperCase())}`));
      b.addEventListener('pointerenter', () => { if (!this.cur && !this.busy) this.select(i); });
      b.addEventListener('focus', () => { if (!this.cur) this.select(i, true); });
      b.addEventListener('click', () => { this.select(i, true); this.launch(a.key); });
      this.home.append(b);
      this.icons.push({ b, spin });
    });
    // the moving parts on the case
    const D = L.dial;
    const dial = wristDial(D.s);
    this.dial = dial;
    const dw = el('button', 'wt-dial') as HTMLButtonElement;
    dw.type = 'button'; dw.setAttribute('aria-label', 'Select dial');
    Object.assign(dw.style, { left: D.x - 5 + 'px', top: D.y - 5 + 'px', width: D.s + 10 + 'px', height: D.s + 10 + 'px' });
    if (dial) dw.append(dial.cv);
    let wheelT = 0;
    dw.addEventListener('wheel', (e) => { e.preventDefault(); const t = performance.now(); if (t - wheelT < 110) return; wheelT = t; this.turn(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); }, { passive: false });
    dw.addEventListener('click', (e) => {
      const rc = dw.getBoundingClientRect(), fx = (e.clientX - rc.left) / rc.width;
      if (e.detail === 0) { this.enter(); return; }
      if (fx < 0.36) this.turn(-1); else if (fx > 0.64) this.turn(1); else this.enter();
    });
    this.lift.append(dw);
    const K = L.knob, knob = mxKnob(K.s);
    this.knob = knob;
    const kw = el('button', 'wt-knob') as HTMLButtonElement;
    kw.type = 'button'; kw.setAttribute('aria-label', 'Brightness');
    Object.assign(kw.style, { left: K.x - 4 + 'px', top: K.y - 4 + 'px' });
    if (knob) { kw.append(knob.cv); knob.set(this.bright / 3); }
    kw.addEventListener('click', () => { this.bright = (this.bright + 1) % 4; store.set('band.bright', String(this.bright)); knob?.set(this.bright / 3, false); sfx('tick', 0.5); this.applyLook(); });
    this.lift.append(kw);
    const tg = mxToggleCanvas(!this.amber);
    this.tog = tg;
    const tw = el('button', 'wt-tog') as HTMLButtonElement;
    tw.type = 'button'; tw.setAttribute('aria-label', 'Phosphor: green or amber');
    Object.assign(tw.style, { left: L.tog.x - 4 + 'px', top: L.tog.y - 4 + 'px' });
    if (tg) tw.append(tg.cv); else tw.textContent = 'PHOS';
    tw.addEventListener('click', () => { this.amber = !this.amber; store.set('band.phos', this.amber ? 'amber' : 'green'); tg?.flip(!this.amber); sfx('rocker', 0.6); this.applyLook(); this.staticBurst(0.4, 0.25); });
    this.lift.append(tw);
    // RESUME, SAVE, QUIT under the tube
    const keyDefs: [string, () => void, 'olive' | 'yellow' | 'red', 'green' | 'amber' | 'red'][] = [
      ['RESUME', () => this.hide(), 'olive', 'green'],
      ['SAVE', () => void this.save(), 'yellow', 'amber'],
      ['QUIT', () => void this.quit(), 'red', 'red'],
    ];
    keyDefs.forEach(([label, fn, tone, lamp], i) => {
      const R = L.keys[i];
      const b = mxButton(label, fn, { tone, lamp, w: R.w, h: R.h, cls: 'wt-key', sound: 'key' });
      Object.assign(b.style, { position: 'absolute', left: R.x + 'px', top: R.y + 'px' });
      if (label === 'SAVE' && G.role === 'client') { b.disabled = true; b.classList.add('off'); }
      this.lift.append(b);
    });
    this.msgLamp = el('i', 'wt-msg');
    Object.assign(this.msgLamp.style, { left: L.msg.x - 7 + 'px', top: L.msg.y - 7 + 'px' });
    this.lift.append(this.msgLamp);
    r.append(this.rig);
    this.applyLook();
  }
  private applyLook() {
    this.root.classList.toggle('amb', this.amber);
    this.tube?.style.setProperty('--wt-b', String([0.72, 0.88, 1, 1.16][this.bright] ?? 1));
  }
  /** fit the unit to the window (the arm may run past the edges) */
  private layout() {
    const L = this.phone ? TALL : WIDE;
    if (L !== this.L) { this.L = L; this.build(); this.toHome(true); }
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = L.kind === 'tall' ? Math.min(vw / L.W, vh / L.H) : Math.min((vw * 0.94) / L.W, (vh * 0.95) / L.H);
    this.rig.style.transform = `translate(${Math.round((vw - L.W * s) / 2)}px, ${Math.round((vh - L.H * s) / 2 + (L.kind === 'wide' ? vh * 0.01 : 0))}px) scale(${s})`;
  }

  // ---------------------------------------------------------------- home, apps
  private select(i: number, quiet = false) {
    i = (i + APPS.length) % APPS.length;
    const was = this.sel;
    this.sel = i;
    this.icons.forEach((ic, k) => { ic.b.classList.toggle('sel', k === i); ic.spin?.hot(k === i); });
    if (!this.cur) this.footLine();
    if (i !== was && !quiet) sfx('hover', 0.3);
    if (!this.busy) this.dial?.to(i + 1);
  }
  /** the dial: on home it moves the pick; in an app it changes app */
  private turn(d: number) {
    if (this.busy) return;
    if (this.cur) { const i = (APPS.findIndex((a) => a.key === this.cur!.app.key) + d + APPS.length) % APPS.length; this.select(i, true); this.launch(APPS[i].key); }
    else this.select(this.sel + d);
  }
  private enter() { if (this.cur) this.back(); else this.launch(APPS[this.sel].key); }
  private toHome(instant = false) {
    this.endApp();
    this.home.hidden = false;
    this.appEl.hidden = true;
    this.root.classList.remove('in-app');
    this.select(this.sel, true);
    if (instant) this.dial?.to(this.sel + 1, true);
    this.refreshTop();
  }
  private endApp() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    try { c.dispose?.(); } catch (e) { console.warn(e); }
    c.body.remove();
  }
  /** open an app full screen in the tube: a static burst, the picture rolls in, the dial turns to it */
  launch(key: string) {
    const i = APPS.findIndex((x) => x.key === key);
    const a = APPS[i];
    if (!a || !this.open) return;
    if (this.cur?.app.key === key) return;
    this.sel = i;
    this.dial?.to(i + 1);
    this.busy = 1;
    sfx('relay', 0.45);
    sfx('hiss', 0.25);
    this.staticBurst(0.9, 0.32);
    this.tube.classList.remove('roll');
    void this.tube.offsetWidth;
    if (!reduce()) this.tube.classList.add('roll');
    this.later(reduce() ? 0 : 110, () => {
      this.endApp();
      const body = el('div', 'wt-app-body wt-a-' + a.key);
      this.appEl.replaceChildren(body);
      this.appEl.hidden = false;
      this.home.hidden = true;
      this.root.classList.add('in-app');
      const api: WinApi = { body, key, os: this, setTitle: () => {}, close: () => this.back(), focus: () => {} };
      const run: Run = { app: a, api, body };
      this.cur = run;
      try {
        const out = a.build(api);
        if (out && typeof out === 'object') { run.dispose = out.dispose; run.tick = out.tick; }
      } catch (e) { console.error('band app', key, e); body.append(el('p', 'bos-p', 'NO SIGNAL. The band logged it.')); }
      if (key === 'mail') { this.mailSeen = mailCount(); this.syncMsg(); }
      this.refreshTop();
      this.footLine();
    });
    this.later(reduce() ? 0 : 380, () => { this.busy = 0; this.tube.classList.remove('roll'); });
  }
  /** Esc / B: out of an app (the picture collapses to a dot and home powers back on); on home, lower the arm */
  back() {
    if (!this.cur) { this.hide(); return; }
    if (this.busy) return;
    this.busy = 1;
    sfx('back', 0.45);
    this.tube.classList.remove('lit', 'roll');
    this.tube.classList.add('dot');
    this.later(reduce() ? 0 : 260, () => { this.toHome(); this.powerOn(true); });
  }

  // ---------------------------------------------------------------- the lines on the tube
  private refreshTop() {
    if (!this.topL) return;
    this.topL.textContent = `MI-7 · ${this.cur ? this.cur.app.title.toUpperCase() : 'HOME'}`;
    const c = G.clock as any;
    const hrs = c?.hours ?? 0;
    const d = (G as any).debt;
    let rp = 0;
    try { rp = researchPoints(); } catch { /* no profile */ }
    const money = (d?.on && !d.cleared ? `${Math.round(d.remaining ?? 0).toLocaleString('en-GB')} CR OWED · ` : '') + purseLine(d?.on && d.cleared ? (d.surplus ?? 0) : null);
    const clock = `D${c?.day ?? Math.floor(hrs / 24) + 1} ${String(Math.floor(hrs % 24)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}${G.role === 'solo' ? ' HELD' : ''}`;
    this.topR.textContent = this.L.kind === 'tall' ? clock : `${clock} · ${money}${money.includes('RP') ? '' : ` · ${rp} RP`}`;
  }
  private footLine() {
    if (!this.foot || this.lineT > 0) return;
    const a = APPS[this.sel];
    this.foot.classList.remove('line');
    this.foot.innerHTML = this.cur ? `<span>${esc(this.cur.app.sub)}</span><kbd>${isTouchMode() ? 'DIAL · BACK' : 'ESC · BACK'}</kbd>` : `<span>${esc(a?.sub ?? '')}</span><kbd>${isTouchMode() ? 'TAP · OPEN' : 'ENTER · OPEN'}</kbd>`;
  }
  /** a line from the band: on the tube's foot line for a while, never a box */
  toast(text: string) {
    if (!this.foot) return;
    this.lineT = 3;
    this.foot.classList.add('line');
    this.foot.innerHTML = `<span>&gt; ${esc(text)}</span><i class="wt-cur"></i>`;
    sfx('type', 0.3);
  }
  private syncMsg() { this.msgLamp?.classList.toggle('on', mailCount() > this.mailSeen); }

  private async save() {
    if (G.role === 'client') return;
    const { saveGame } = await import('../../game/save');
    const ok = await saveGame();
    this.toast(ok ? 'TAPE SAVED TO THIS BROWSER.' : 'COULD NOT SAVE.');
  }
  private async quit() {
    const { confirmDialog } = await import('../menus/common');
    const ok = await confirmDialog({ title: 'Quit to title', body: G.role === 'client' ? 'Leave the room and go back to the title?' : 'Your progress is saved first, then the tape rewinds to the title.', ok: 'Quit', cancel: 'Stay', danger: true });
    if (!ok) return;
    if (G.role !== 'client') { const { saveGame } = await import('../../game/save'); await saveGame(); }
    location.reload();
  }

  // ---------------------------------------------------------------- keys
  private onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]');
    if (!this.open) {
      if (e.code === 'Tab' && !e.repeat && !typing && !G.input?.textFocus && G.local && !(G as any).ui?.modal && !document.querySelector('.ipnl, .kd-veil, .mx-over:not(.mx-embed)')) { e.preventDefault(); e.stopImmediatePropagation(); this.show(); }
      return;
    }
    if (document.querySelector('.kd-veil, .ipnl')) return; // a dialog or an item card over the unit takes the keys
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.back(); return; }
    if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); this.hide(); return; }
    if (typing) return;
    if (!this.cur) {
      const cols = 3;
      const mv = e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : e.code === 'ArrowUp' ? -cols : e.code === 'ArrowDown' ? cols : 0;
      if (mv) { e.preventDefault(); e.stopImmediatePropagation(); this.select(this.sel + mv); return; }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); this.launch(APPS[this.sel].key); return; }
    }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { e.preventDefault(); e.stopImmediatePropagation(); this.turn(e.code === 'BracketLeft' ? -1 : 1); return; }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); const i = Number(m[1]) - 1; if (APPS[i]) { this.select(i, true); this.launch(APPS[i].key); } }
  }
}

// ---------------------------------------------------------------- film grain (one tile, shifted about by CSS)
let grain = '';
function grainUrl(): string {
  if (grain) return grain;
  const cv = document.createElement('canvas'); cv.width = cv.height = 160;
  const c = cv.getContext('2d')!, im = c.createImageData(160, 160), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = Math.random() < 0.6 ? 255 : 0; }
  c.putImageData(im, 0, 0);
  return (grain = cv.toDataURL());
}

// ---------------------------------------------------------------- the tube's SVG filter: bulge, fringe, bloom
const filters = new Set<string>();
function crtFilter(w: number, h: number): string {
  const id = `wt-crt-${w}x${h}`;
  if (filters.has(id)) return id;
  filters.add(id);
  // a displacement map: each pixel samples a little further out the further it is from the centre (a slight barrel)
  const S = 44, k = 0.034;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!, im = c.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1, r2 = nx * nx + ny * ny;
    const dx = nx * k * r2 * (w / 2), dy = ny * k * r2 * (h / 2);
    const i = (y * w + x) * 4;
    d[i] = Math.max(0, Math.min(255, Math.round(127.5 + (dx / S) * 255)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round(127.5 + (dy / S) * 255)));
    d[i + 2] = 128; d[i + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">
    <feImage href="${cv.toDataURL()}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${S}" xChannelSelector="R" yChannelSelector="G" result="bent"/>
    <feColorMatrix in="bent" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feOffset in="r" dx="1.4" dy="0" result="r2"/>
    <feColorMatrix in="bent" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/>
    <feOffset in="gb" dx="-0.6" dy="0" result="gb2"/>
    <feComposite in="r2" in2="gb2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="split"/>
    <feGaussianBlur in="split" stdDeviation="3.2" result="blur"/>
    <feComposite in="split" in2="blur" operator="arithmetic" k1="0" k2="1" k3="0.65" k4="0"/>
  </filter>`;
  document.body.append(svg);
  return id;
}

let os: BandOS | null = null;
export function installBandOS(): BandOS { return (os ??= new BandOS()); }

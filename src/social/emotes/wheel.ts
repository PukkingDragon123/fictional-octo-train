// THE EMOTE WHEEL (round 17): eight riveted viewing windows in a ring round a
// control hub, all machine-kit hardware (src/ui/machine). Each window is a little
// CRT that plays the unit doing that emote (a cached strip of real 3D frames of
// the HumanRig: src/social/emotes/stage.ts), a keycap with its number, a yellow
// name plate and a lamp. The hub carries what is hovered, the four whistle keys,
// the line key for your floor and the SHOP key (the emote jukebox). Hold G, aim
// and let go; or tap G and click a window; 1-8 pick a window; Esc closes.
// Same surface as the old rotary dial (src/social/dial.ts) so G.social drives it.
import { mxFrame, panelSpec, mxButton, type MxButton } from '../../ui/machine/kit';
import { mxOk } from '../../ui/machine/core';
import { mxIcon } from '../../ui/machine/decor';
import { sfx } from '../../ui/menus/sfx';
import { emoteInfo, wheelSlots, onEmotes, RARITY } from './catalog';
import { emoteSheet, sheetNow, sheetFrame, stageOk } from './stage';
import './emotes.css';

export type WheelHit = { kind: 'hole'; i: number } | { kind: 'card' } | { kind: 'key'; i: number } | { kind: 'shop' } | null;
const TUNE_LABELS = ['HEY-O', 'COME', 'ALARM', 'TUNE'];
const N = 8;
/** the windows sit round the ring starting at the top, clockwise */
const ANG = Array.from({ length: N }, (_, i) => -Math.PI / 2 + (i / N) * Math.PI * 2);
const PW = 84, PH = 92; // preview px (CSS)

interface Win { el: HTMLButtonElement; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; name: HTMLElement; id: string }

export class EmoteWheel {
  el = document.createElement('div');
  private ring = document.createElement('div');
  private hub = document.createElement('div');
  private hubName = document.createElement('b');
  private hubSub = document.createElement('small');
  private tuneKeys: MxButton[] = [];
  private lineKey: MxButton;
  private wins: Win[] = [];
  private t = 0;
  private pickT = -1; private pickI = -1; private pickCb: (() => void) | null = null;
  hover: WheelHit = null;
  tune = 0;
  card: [string, string] = ['DIAL', ''];
  cardRed = false;
  dirty = true;
  private R = 182;
  constructor(private onPick: (h: WheelHit) => void) {
    const el = this.el;
    el.className = 'ew';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Emote wheel');
    this.ring.className = 'ew-ring';
    this.hub.className = 'ew-hub';
    el.append(this.ring, this.hub);
    // ---- the windows
    for (let i = 0; i < N; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ew-win';
      const scr = document.createElement('span'); scr.className = 'ew-scr mx-crt';
      const cv = document.createElement('canvas'); cv.className = 'ew-cv';
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(PW * dpr); cv.height = Math.round(PH * dpr);
      scr.append(cv);
      const cap = document.createElement('i'); cap.className = 'ew-key'; cap.textContent = String(i + 1);
      const name = document.createElement('span'); name.className = 'ew-name';
      const lamp = document.createElement('u'); lamp.className = 'ew-lamp';
      b.append(scr, cap, name, lamp);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onPick({ kind: 'hole', i }); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.setHover(i); });
      this.ring.append(b);
      this.wins.push({ el: b, cv, ctx: cv.getContext('2d')!, name, id: '' });
    }
    // ---- the hub: what is hovered, the whistles, the line, the shop
    const head = document.createElement('div'); head.className = 'ew-head';
    this.hubName.textContent = 'EMOTES'; this.hubSub.textContent = 'aim and let go';
    head.append(this.hubName, this.hubSub);
    const tunes = document.createElement('div'); tunes.className = 'ew-tunes';
    TUNE_LABELS.forEach((l, i) => {
      const k = mxButton(l, () => this.onPick({ kind: 'key', i }), { w: 58, h: 26, cls: 'ew-tk', tone: 'olive', lamp: 'green', sound: 'key' });
      tunes.append(k); this.tuneKeys.push(k);
    });
    this.lineKey = mxButton('LINE', () => this.onPick({ kind: 'card' }), { w: 118, h: 28, cls: 'ew-line', tone: 'dark', lamp: 'amber', sound: 'relay' });
    const shop = mxButton('JUKEBOX', () => this.onPick({ kind: 'shop' }), { w: 132, h: 34, cls: 'ew-shop', tone: 'yellow', lamp: 'red', sound: 'plate', icon: mxOk() ? mxIcon('coin', 22) : null });
    const tl = document.createElement('small'); tl.className = 'ew-tl'; tl.textContent = 'WHISTLE · Q';
    this.hub.append(head, tl, tunes, this.lineKey, shop);
    if (mxOk()) {
      mxFrame(this.hub, (w, h) => panelSpec(w, h, { title: 'EMOTES', seed: 71, lamps: ['green', 'amber'], glands: 1, hazard: true, top: 30, bot: 16, vents: false }), { pad: 14 });
      for (const w of this.wins) mxFrame(w.el, (ww, hh) => panelSpec(ww, hh, { seed: 40 + this.wins.indexOf(w), lamps: [], glands: 0, hazard: false, vents: false, handles: false, win: { l: 6, t: 6, r: 6, b: 26, cut: 4, lip: 2 } }), { pad: 8 });
    }
    el.addEventListener('pointerleave', () => this.setHover(-1));
    document.body.append(el);
    this.fill();
    onEmotes(() => { this.fill(); });
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** what is in the windows (the operator's wheel slots) */
  fill() {
    const slots = wheelSlots();
    this.wins.forEach((w, i) => {
      const id = slots[i] || '';
      w.id = id;
      const e = id ? emoteInfo(id) : null;
      w.name.textContent = e ? e.name : 'EMPTY';
      w.el.classList.toggle('empty', !e);
      w.el.style.setProperty('--rar', e ? RARITY[e.rarity].col : '#5a5e4a');
      w.el.setAttribute('aria-label', e ? `${i + 1}: ${e.name}` : `${i + 1}: empty, open the jukebox`);
      if (e && stageOk()) void emoteSheet(e.anim, w.cv.width, w.cv.height).then(() => { this.dirty = true; });
    });
    this.dirty = true;
  }

  private layout() {
    const small = innerWidth < 560 || innerHeight < 620;
    this.R = small ? 150 : 182;
    const k = Math.min(1, (Math.min(innerWidth, innerHeight) - 16) / (this.R * 2 + 130));
    this.el.style.setProperty('--ews', String(k));
    this.wins.forEach((w, i) => { w.el.style.left = Math.cos(ANG[i]) * this.R + 'px'; w.el.style.top = Math.sin(ANG[i]) * this.R + 'px'; });
  }
  place(x: number, y: number) {
    const k = Number(this.el.style.getPropertyValue('--ews') || 1);
    const m = (this.R + 70) * k;
    this.el.style.left = Math.max(m, Math.min(innerWidth - m, x)) + 'px';
    this.el.style.top = Math.max(m, Math.min(innerHeight - m, y)) + 'px';
  }
  /** the window in the direction of a screen point from the centre (-1 near the middle) */
  holeToward(mx: number, my: number): number {
    const r = this.el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = mx - cx, dy = my - cy;
    if (Math.hypot(dx, dy) < 60) return -1;
    let a = Math.atan2(dy, dx) - ANG[0];
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(a / (Math.PI * 2 / N)) % N;
  }
  setHover(i: number) {
    this.hover = i >= 0 ? { kind: 'hole', i } : null;
    this.wins.forEach((w, j) => w.el.classList.toggle('hot', j === i));
    const e = i >= 0 ? emoteInfo(this.wins[i].id) : null;
    this.hubName.textContent = i < 0 ? 'EMOTES' : e ? e.name : 'EMPTY SLOT';
    this.hubSub.textContent = i < 0 ? 'aim and let go' : e ? RARITY[e.rarity].label : 'fill it at the jukebox';
    this.hubName.style.color = e ? RARITY[e.rarity].col : '';
  }
  /** a window was chosen: it lights and clunks, then the emote plays */
  dial(i: number, cb: () => void) {
    this.pickI = i; this.pickT = 0; this.pickCb = cb;
    this.wins[i]?.el.classList.add('fire');
    sfx('plate', 0.8);
  }
  get busy() { return this.pickT >= 0; }
  update(dt: number) {
    this.t += dt;
    if (this.pickT >= 0) {
      this.pickT += dt;
      if (this.pickT > 0.16 && this.pickCb) { const cb = this.pickCb; this.pickCb = null; cb(); }
      if (this.pickT > 0.45) { this.wins[this.pickI]?.el.classList.remove('fire'); this.pickT = -1; }
    }
    if (!this.el.classList.contains('open')) return;
    // the windows' little films
    for (const w of this.wins) {
      const e = w.id ? emoteInfo(w.id) : null;
      if (!e) { if (this.dirty) w.ctx.clearRect(0, 0, w.cv.width, w.cv.height); continue; }
      const sh = sheetNow(e.anim, w.cv.width, w.cv.height);
      if (sh) sheetFrame(w.ctx, sh, this.t + w.cv.width * 0.0 + this.wins.indexOf(w) * 0.37, w.cv.width, w.cv.height);
    }
    if (this.dirty) {
      this.dirty = false;
      this.tuneKeys.forEach((k, i) => k.setOn(i === this.tune));
      this.lineKey.style.display = this.card[0] === 'DIAL' ? 'none' : '';
      const t = this.lineKey.querySelector('.mxb-t'); if (t) t.textContent = this.card.join(' ').trim();
      this.lineKey.classList.toggle('red', this.cardRed);
    }
  }
}

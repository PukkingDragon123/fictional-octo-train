// G.social: emotes, whistling, shouting, barks and the 8-bit voice of every
// survivor. G opens the emote wheel (hold, aim, let go; or tap G and click);
// Q taps whistle your chosen call, holding Q shouts. Emote poses travel to
// co-op peers in the player snapshot; whistles and barks travel as 'sx'
// messages. Every 'say' and 'shout' speech line (chat included) gets the
// speaker's chip voice, timed to the floating letters.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import { playLine, voiceFromApp } from './chipVoice';
import { floatText } from './floatText';
import { notes } from './pixtype';
import './sounds';
import './social.css';

interface Slot { key: string; emote: string; label: string; bark: string[]; color: string; icon: string }
const I = (p: string) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square">${p}</svg>`;
export const EMOTE_SLOTS: Slot[] = [
  { key: 'wave', emote: 'wave', label: 'Wave', bark: ['Hey!', 'Hi!', 'Over here!', 'Yo!'], color: '#3a8cff', icon: I('<path d="M5 14V6M8 14V3M11 14V5M13 9l-2 5H5L3 10"/>') },
  { key: 'point', emote: 'point', label: 'Point', bark: ['There!', 'Look!', 'That way!'], color: '#ff9a2a', icon: I('<path d="M2 8h10M9 4l4 4-4 4"/>') },
  { key: 'dance', emote: 'dance', label: 'Dance', bark: ['♪ ♫', 'la la la', '♫'], color: '#d04aff', icon: I('<path d="M6 13V3l7-1v9"/><circle cx="4.5" cy="13" r="1.5"/><circle cx="11.5" cy="11" r="1.5"/>') },
  { key: 'sit', emote: 'sit_wait', label: 'Sit', bark: [], color: '#4ac08a', icon: I('<path d="M4 2v12M4 9h8v5M12 9V5"/>') },
  { key: 'salute', emote: 'salute', label: 'Salute', bark: ['Sir!', 'Yes sir!', 'Reporting!'], color: '#d8c040', icon: I('<path d="M3 6h10M9 6l3-4M5 9v5h6V9"/>') },
  { key: 'mock', emote: 'mock', label: 'Mock', bark: ['Nyeh nyeh!', 'Too slow!', 'Ha-HA!', 'Bleh!'], color: '#ff4a6a', icon: I('<circle cx="8" cy="8" r="6"/><path d="M5 6h1M10 6h1M6 10h4v2H8"/>') },
  { key: 'cheer', emote: 'cheer', label: 'Cheer', bark: ['Woo!', 'Yeah!', 'Let\'s go!'], color: '#ff6ad8', icon: I('<path d="M3 2l3 5v7M13 2l-3 5v7M6 7h4"/>') },
  { key: 'shrug', emote: 'shrug', label: 'Shrug', bark: ['Eh?', 'Dunno.', 'Huh.'], color: '#8a9ab0', icon: I('<path d="M2 6l3 3h6l3-3M8 9v5M7 3h2v2H7z"/>') },
];
export const TUNES = ['Hey-o', 'Come', 'Alarm', 'Tune'];

const SHOUT_HOLD = 0.35;
const tmpV = new THREE.Vector3();

export class SocialSystem implements GameSystem {
  name = 'social';
  tune = 0;
  private wheel: HTMLDivElement | null = null;
  private wheelOpen = false;
  private wheelAt = { x: 0, y: 0 };
  private wheelHeldT = 0;
  private wheelMoved = false;
  private hot = -1;
  private qT = -1;
  private qShouted = false;
  private whistleCd = 0;
  private shoutCd = 0;
  private barkCd = 0;

  constructor() {
    try { const t = Number(localStorage.getItem('noclip.tune')); if (t >= 0 && t < TUNES.length) this.tune = t; } catch { /* storage blocked */ }
    this.patchSay();
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const g = G, p = g.local;
    if (!p) return;
    this.whistleCd -= dt; this.shoutCd -= dt; this.barkCd -= dt;
    const inp = g.input;
    const busy = p.body.dead || g.ui?.blocksMovement?.() || g.transitioning;
    // ---- Q: tap = whistle, hold = shout
    const qDown = inp.down('whistle') || inp.down('shout');
    if ((inp.hit('whistle') || inp.hit('shout')) && !busy) { this.qT = 0; this.qShouted = false; }
    if (this.qT >= 0) {
      if (qDown) {
        this.qT += dt;
        if (!this.qShouted && this.qT >= SHOUT_HOLD) { this.qShouted = true; this.shout(); }
      } else {
        if (!this.qShouted) this.whistle(this.tune);
        this.qT = -1;
      }
    }
    // ---- G: the emote wheel
    if (inp.hit('emote') && !busy) {
      if (this.wheelOpen) this.closeWheel();
      else { this.openWheel(); this.wheelHeldT = 0; this.wheelMoved = false; }
    }
    if (this.wheelOpen) {
      if (busy) { this.closeWheel(); return; }
      this.wheelHeldT += dt;
      const dx = inp.mouseX - this.wheelAt.x, dy = inp.mouseY - this.wheelAt.y;
      const r = Math.hypot(dx, dy);
      if (r > 44 && r < 200) {
        this.wheelMoved = true;
        let a = Math.atan2(dy, dx) + Math.PI / 2;
        if (a < 0) a += Math.PI * 2;
        this.setHot(Math.round(a / (Math.PI * 2 / EMOTE_SLOTS.length)) % EMOTE_SLOTS.length);
      } else if (r <= 44) this.setHot(-1);
      // hold-and-release: letting go of G on a slice plays it
      if (!inp.down('emote') && this.wheelHeldT > 0.22 && this.wheelMoved) {
        if (this.hot >= 0) this.emote(EMOTE_SLOTS[this.hot].key);
        this.closeWheel();
      }
      if (inp.hit('pause')) this.closeWheel();
    }
  }

  // ---------------------------------------------------------------- actions
  /** play an emote (slot key or raw emote name) with a bark */
  emote(key: string) {
    const p = G.local; if (!p || p.body.dead) return;
    const slot = EMOTE_SLOTS.find((s) => s.key === key || s.emote === key);
    const name = slot?.emote || key;
    p.emote?.(name, name === 'sit_wait' || name === 'dance' ? true : undefined);
    if (slot && slot.bark.length && this.barkCd <= 0) {
      this.barkCd = 2.5;
      const text = slot.bark[Math.floor(Math.random() * slot.bark.length)];
      G.ui?.say?.(p, text, 'say', 2.2);
      G.net?.social?.({ t: 'bark', text, kind: 'say' });
    }
    bus.emit('emote', p, name);
  }

  /** whistle one of the calls (0 hey-o, 1 come here, 2 alarm, 3 tune) */
  whistle(tune = this.tune) {
    const p = G.local; if (!p || p.body.dead || this.whistleCd > 0) return;
    this.whistleCd = 0.9;
    this.whistleAt(p, tune);
    bus.emit('noise', { x: p.x, z: p.z, radius: tune === 2 ? 26 : 18, kind: 'whistle', zone: p.zoneKey, by: p.id });
    bus.emit('whistle', p, tune);
    G.net?.social?.({ t: 'whistle', tune });
  }
  private whistleAt(p: Player, tune: number) {
    G.audio?.at?.('vx_whistle_' + (tune & 3), p.x, p.z, 0.9);
    // notes float up off the whistler
    const ui = G.ui; if (!ui?.root || !ui.bubbles) return;
    const n = tune === 2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'w-bubble ft-note';
      el.style.backgroundImage = `url(${notes()[i % 2]})`;
      el.style.setProperty('--nx', (i % 2 ? 1 : -1) * (8 + i * 6) + 'px');
      el.style.animationDelay = (i * 0.16).toFixed(2) + 's';
      ui.root.appendChild(el);
      ui.bubbles.push({ el, target: p, until: G.time + 1.8 + i * 0.16, born: G.time, rise: 1, kind: 'note' });
    }
  }

  /** hold Q: a shout friends hear across the floor (and so does everything else) */
  shout() {
    const g = G, p = g.local; if (!p || p.body.dead || this.shoutCd > 0) return;
    this.shoutCd = 2.5;
    const alone = g.players.size <= 1;
    const lines = alone ? ['HELLO?!', 'IS ANYONE THERE?', 'HEY!', 'HELLO?'] : ['HEY!', 'OVER HERE!', 'HERE!', 'COME HERE!', 'WAIT UP!'];
    const text = lines[Math.floor(Math.random() * lines.length)];
    g.ui?.say?.(p, text, 'shout', 2.5);
    g.audio?.at?.('shout', p.x, p.z, 1);
    bus.emit('noise', { x: p.x, z: p.z, radius: 28, kind: 'shout', zone: p.zoneKey, by: p.id });
    g.net?.shout?.(text);
    bus.emit('shout', p);
  }

  setTune(i: number) {
    this.tune = ((i % TUNES.length) + TUNES.length) % TUNES.length;
    try { localStorage.setItem('noclip.tune', String(this.tune)); } catch { /* storage blocked */ }
    this.renderTunes();
  }

  // ---------------------------------------------------------------- network
  onNet(from: string, d: any) {
    const p = G.players.get(from);
    if (!p || !G.local || p.zoneKey !== G.local.zoneKey) return;
    if (d.t === 'whistle') this.whistleAt(p, Number(d.tune) | 0);
    else if (d.t === 'bark' && typeof d.text === 'string') G.ui?.say?.(p, d.text.slice(0, 60), d.kind === 'shout' ? 'shout' : 'say', 2.2);
  }

  // ---------------------------------------------------------------- voice for every spoken line
  private patchSay() {
    const ui = G.ui;
    if (!ui || ui.__sxSay) return;
    const orig = ui.say.bind(ui);
    ui.__sxSay = true;
    ui.say = (p: Player, text: string, kind: 'say' | 'think' | 'shout' | 'radio' = 'say', secs = 3.5) => {
      orig(p, text, kind, secs);
      if (!p || !text || (kind !== 'say' && kind !== 'shout')) return;
      // other survivors: their name stamped on the strip, the paper in their tint
      if (!p.isLocal) {
        for (let i = ui.bubbles.length - 1; i >= 0; i--) {
          const b = ui.bubbles[i];
          if (b.target !== p || b.kind !== kind) continue;
          const el = floatText(text, { kind: kind === 'shout' ? 'shout' : 'say', name: p.name, tint: p.id });
          b.el.replaceWith(el); b.el = el;
          break;
        }
      }
      playLine(text, voiceFromApp(p.app, p.id), p.isLocal ? null : { x: p.x, z: p.z }, { shout: kind === 'shout' });
    };
  }

  // ---------------------------------------------------------------- the wheel
  toggleWheel() { if (this.wheelOpen) this.closeWheel(); else this.openWheel(); }
  get isWheelOpen() { return this.wheelOpen; }
  openWheel() {
    if (!this.wheel) this.buildWheel();
    const p = G.local; if (!p || !this.wheel) return;
    const s = G.pr.worldToScreen(tmpV.set(p.x, p.y + 1.1, p.z));
    const W = window.innerWidth, H = window.innerHeight;
    this.wheelAt = { x: Math.max(170, Math.min(W - 170, s.x)), y: Math.max(160, Math.min(H - 210, s.y)) };
    this.wheel.style.transform = `translate(${this.wheelAt.x}px, ${this.wheelAt.y}px)`;
    this.wheelOpen = true;
    this.setHot(-1);
    this.renderCenter();
    this.renderTunes();
    this.wheel.classList.add('open');
    G.audio?.ui?.('tab', 0.3);
  }
  closeWheel() {
    this.wheelOpen = false;
    this.wheel?.classList.remove('open');
    G.input.pointerOverUI = false;
  }
  private setHot(i: number) {
    if (i === this.hot || !this.wheel) return;
    this.hot = i;
    this.wheel.querySelectorAll('.sx-slice.emo').forEach((el, k) => el.classList.toggle('hot', k === i));
    this.renderCenter();
    if (i >= 0) G.audio?.ui?.('tick', 0.15);
  }
  private renderCenter() {
    const c = this.wheel?.querySelector('.sx-center'); if (!c) return;
    c.innerHTML = '';
    if (this.hot >= 0) { const l = document.createElement('div'); l.className = 'lbl'; l.textContent = EMOTE_SLOTS[this.hot].label; c.append(l); return; }
    const box = document.createElement('div');
    const f = G.floors;
    const st = f?.floorStatus?.() as string | undefined;
    box.innerHTML = `<div class="lbl">EMOTE</div>`;
    if (st === 'can-open') {
      const b = document.createElement('button'); b.textContent = 'OPEN FLOOR';
      b.title = 'List this floor on the relay: other players falling through holes can land here';
      b.onclick = (e) => { e.stopPropagation(); f.openFloor?.(); this.closeWheel(); };
      box.append(document.createElement('br'), b);
    } else if (st && st.startsWith('open:')) {
      const s2 = document.createElement('div'); s2.style.cssText = 'font-size:9px;color:#8ff6ff;margin-top:4px'; s2.textContent = 'FLOOR OPEN ' + st.slice(5);
      box.append(s2);
    }
    c.append(box);
  }
  private renderTunes() {
    this.wheel?.querySelectorAll('.sx-slice.tune').forEach((el, k) => el.classList.toggle('sel', k === this.tune));
  }
  private buildWheel() {
    const w = document.createElement('div');
    w.className = 'sx-wheel';
    const ring = document.createElement('div'); ring.className = 'sx-ring'; w.append(ring);
    const R = 112;
    EMOTE_SLOTS.forEach((s, i) => {
      const a = (i / EMOTE_SLOTS.length) * Math.PI * 2 - Math.PI / 2;
      const el = document.createElement('div');
      el.className = 'sx-slice emo';
      el.style.left = Math.round(Math.cos(a) * R) + 'px';
      el.style.top = Math.round(Math.sin(a) * R) + 'px';
      el.style.setProperty('--sc', s.color);
      el.style.setProperty('--sd', (i * 0.025).toFixed(3) + 's');
      el.innerHTML = `${s.icon}<span>${s.label}</span>`;
      el.addEventListener('pointerenter', () => this.setHot(i));
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.emote(s.key); this.closeWheel(); });
      w.append(el);
    });
    TUNES.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'sx-slice tune';
      el.style.left = Math.round((i - 1.5) * 60) + 'px';
      el.style.top = (R + 66) + 'px';
      el.style.setProperty('--sd', (0.2 + i * 0.03).toFixed(3) + 's');
      el.textContent = '♪ ' + t;
      el.title = 'Whistle call (tap Q)';
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.setTune(i); this.whistle(i); });
      w.append(el);
    });
    const c = document.createElement('div'); c.className = 'sx-center'; w.append(c);
    w.addEventListener('pointerenter', () => { G.input.pointerOverUI = true; });
    w.addEventListener('pointerleave', () => { G.input.pointerOverUI = false; });
    document.body.appendChild(w);
    this.wheel = w;
  }
}

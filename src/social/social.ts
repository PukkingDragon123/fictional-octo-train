// G.social: emotes, whistling, shouting, barks and the 8-bit voice of every
// survivor. G brings up the emote dial, a rotary telephone dial (hold G, aim,
// let go to dial; or tap G and click a hole; the keys under it pick the call);
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
import { EmoteDial, type DialHit } from './dial';
import './sounds';
import './social.css';

interface Slot { key: string; emote: string; label: string; bark: string[] }
export const EMOTE_SLOTS: Slot[] = [
  { key: 'wave', emote: 'wave', label: 'Wave', bark: ['Hey!', 'Hi!', 'Over here!', 'Yo!'] },
  { key: 'point', emote: 'point', label: 'Point', bark: ['There!', 'Look!', 'That way!'] },
  { key: 'dance', emote: 'dance', label: 'Dance', bark: ['la la la!', 'dum de dum', 'doo-wop!'] },
  { key: 'sit', emote: 'sit_wait', label: 'Sit', bark: [] },
  { key: 'salute', emote: 'salute', label: 'Salute', bark: ['Sir!', 'Yes sir!', 'Reporting!'] },
  { key: 'mock', emote: 'mock', label: 'Mock', bark: ['Nyeh nyeh!', 'Too slow!', 'Ha-HA!', 'Bleh!'] },
  { key: 'cheer', emote: 'cheer', label: 'Cheer', bark: ['Woo!', 'Yeah!', 'Let\'s go!'] },
  { key: 'shrug', emote: 'shrug', label: 'Shrug', bark: ['Eh?', 'Dunno.', 'Huh.'] },
];
export const TUNES = ['Hey-o', 'Come', 'Alarm', 'Tune'];

const SHOUT_HOLD = 0.35;
const tmpV = new THREE.Vector3();

export class SocialSystem implements GameSystem {
  name = 'social';
  tune = 0;
  private dialObj: EmoteDial | null = null;
  private wheelOpen = false;
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
    // keep floating lines inside the picture: after the UI has placed them each frame, nudge any that hang off an edge
    const keepIn = () => {
      requestAnimationFrame(keepIn);
      const ui = G.ui; if (!ui?.bubbles?.length) return;
      const W = window.innerWidth;
      for (const b of ui.bubbles) {
        const el = b.el as HTMLElement;
        if (!el.classList.contains('ft') || el.classList.contains('offscreen') || el.style.display === 'none') continue;
        const x = parseFloat(el.style.left); if (!isFinite(x)) continue;
        const half = el.offsetWidth / 2 + 10;
        const cx = Math.max(half, Math.min(W - half, x));
        if (cx !== x) el.style.left = cx + 'px';
      }
    };
    requestAnimationFrame(keepIn);
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const g = G, p = g.local;
    if (!p) return;
    this.whistleCd -= dt; this.shoutCd -= dt; this.barkCd -= dt;
    const inp = g.input;
    const busy = p.body.dead || g.ui?.blocksMovement?.() || g.transitioning || !!p.inVehicle;
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
    if (this.dialObj) this.dialObj.update(dt);
    if (this.wheelOpen && this.dialObj) {
      const d = this.dialObj;
      if (busy) { this.closeWheel(); return; }
      this.wheelHeldT += dt;
      // holding G: aim at a hole with the mouse direction from the dial's centre
      if (inp.down('emote') && !d.busy) {
        const i = d.holeToward(inp.mouseX, inp.mouseY);
        if (i >= 0) { this.wheelMoved = true; this.setHot(i); }
      }
      // hold-and-release: letting go of G on a hole dials it
      if (!inp.down('emote') && this.wheelHeldT > 0.22 && this.wheelMoved && !d.busy) {
        this.wheelMoved = false;
        if (this.hot >= 0) this.pick({ kind: 'hole', i: this.hot });
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
      el.textContent = i % 2 ? '♫' : '♪';
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
          const el = floatText(text, { kind: kind === 'shout' ? 'shout' : 'say', name: p.name, tint: p.id, life: secs });
          b.el.replaceWith(el); b.el = el;
          break;
        }
      }
      playLine(text, voiceFromApp(p.app, p.id), p.isLocal ? null : { x: p.x, z: p.z }, { shout: kind === 'shout' });
    };
  }

  // ---------------------------------------------------------------- the dial
  toggleWheel() { if (this.wheelOpen) this.closeWheel(); else this.openWheel(); }
  get isWheelOpen() { return this.wheelOpen; }
  openWheel() {
    const p = G.local; if (!p) return;
    if (!this.dialObj) {
      this.dialObj = new EmoteDial((h) => this.pick(h));
      this.dialObj.el.addEventListener('pointerenter', () => { G.input.pointerOverUI = true; });
      this.dialObj.el.addEventListener('pointerleave', () => { G.input.pointerOverUI = false; });
    }
    const d = this.dialObj;
    const s = G.pr.worldToScreen(tmpV.set(p.x, p.y + 1.1, p.z));
    d.place(s.x, s.y);
    d.tune = this.tune;
    this.wheelOpen = true;
    this.hot = -1; d.hover = null;
    this.renderCard();
    d.el.classList.add('open');
    G.audio?.ui?.('tab', 0.3);
  }
  closeWheel() {
    this.wheelOpen = false;
    this.dialObj?.el.classList.remove('open');
    G.input.pointerOverUI = false;
  }
  private setHot(i: number) {
    if (i === this.hot || !this.dialObj) return;
    this.hot = i;
    this.dialObj.hover = i >= 0 ? { kind: 'hole', i } : null;
    this.dialObj.dirty = true;
    if (i >= 0) G.audio?.ui?.('tick', 0.15);
  }
  /** a hole dialled, a whistle key pressed, the card (the line switch) */
  private pick(h: DialHit) {
    const d = this.dialObj; if (!d || !h) return;
    if (h.kind === 'hole') {
      if (d.busy) return;
      const slot = EMOTE_SLOTS[h.i];
      d.dial(h.i, () => { this.emote(slot.key); setTimeout(() => { if (!d.busy) this.closeWheel(); }, 120); });
      setTimeout(() => this.closeWheel(), 1100);
    } else if (h.kind === 'key') {
      this.setTune(h.i); this.whistle(h.i);
    } else if (h.kind === 'card') {
      if (G.floors?.floorStatus?.() === 'can-open') { G.floors.openFloor?.(); this.closeWheel(); }
    }
  }
  /** the paper card in the middle: DIAL, or the state of your floor's line */
  private renderCard() {
    const d = this.dialObj; if (!d) return;
    const st = G.floors?.floorStatus?.() as string | undefined;
    if (st === 'can-open') { d.card = ['OPEN', 'LINE']; d.cardRed = true; }
    else if (st && st.startsWith('open:')) { d.card = ['LINE', st.slice(5, 10)]; d.cardRed = false; }
    else { d.card = ['DIAL', '']; d.cardRed = false; }
    d.dirty = true;
  }
  private renderTunes() { if (this.dialObj) { this.dialObj.tune = this.tune; this.dialObj.dirty = true; } }
}

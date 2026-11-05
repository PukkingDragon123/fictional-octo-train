// The body HUD (G.hudBody): one tidy cluster in the top-left corner, pixel art
// at the game's own pixel size (vitals.ts, tray.ts):
//
//   the BRAIN is sanity: it throbs with the heartbeat, bruises, veins and
//     cracks as sanity goes, sweats in a panic, flinches on a scare;
//   the HEALTH BAR is a riveted glass tube of blood: hits flash and shake it
//     and leave a pale ghost that drains after the level; wounds drip from it;
//     it pulses when critical and shimmers while you heal. Click / tap it to
//     treat the worst wound with the best thing you carry;
//   the BALLOON is stamina, tied to an iron weight: it fills as you recover,
//     shrinks and wobbles while you run, sags wheezing when you are spent and
//     gives a little pop when it runs dry. H (or a click / tap on it) starts
//     the breathing pump: press as the bead reaches IN, then OUT;
//   MOODLES (hunger, thirst, tiredness, pain, bleeding, sickness, cold, heat,
//     panic, ...) pop up under the bar only while they matter, Zomboid style,
//     tinted 1–4 by severity; hover or tap one for its name and what to do;
//   the RUCKSACK under the brain opens the pack (desktop; phones have PACK).
// All type floats free with a halo below the cluster (no boxes).
//
// The stomach and the lungs are still simulated (jar.ts, lung.ts): eating fills
// the jar (canEat, vomiting), the lungs carry the breathing pump and strain.
//
// API: pumpPress(), pumping, canEat(), lungs / jar (sims), eatStart(action) /
// drinkStart(action) (first-person close-ups, eatFp.ts), eat (EatFp), vomit(p),
// setHidden(key, on), warm(secs), holeScreen(inj), propScreen(kind),
// jarScreen(), openPack(), why, st (where it sits, for tests).
import './body.css';
import './sounds';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { fpOwner } from '../../fp/fp';
import type { Player } from '../../entities/player';
import type { Injury } from '../../survival/body';
import { Lungs, type PumpResult } from './lung';
import { Jar } from './jar';
import { Vitals, VW, VH, BAR, BRAIN, PACK, TRAY_AT, type VitalsIn } from './vitals';
import { MoodleTray, SLOT, PAD } from './tray';
import { treatOptions, bestTreatment, woundTitle, needsCare } from './treat';
import { breathHit, breathDone } from '../../survival/mindSystem';
import { ensureMind } from '../../survival/mind';
import { shake } from '../../gfx/juice';
import { itemDef } from '../../items/item';
import { EatFp } from './eatFp';

/** first-person scenes that get the whole picture (eating too: its own scene in the room, no floating HUD) */
const FULL_FP = new Set(['pack', 'inspect', 'bench', 'cook', 'trade', 'dominion', 'surgery', 'remote', 'eat']);
/** the screen margin everything keeps (CSS px) */
export const HUD_MARGIN = 12;

type Kind = 'brain' | 'bar' | 'balloon' | 'pack' | 'moodle';
interface Hover { kind: Kind | null; key: string }
const NONE: Hover = { kind: null, key: '' };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class BodyHud {
  name = 'hudBody';
  readonly lungs = new Lungs();
  readonly jar = new Jar();
  readonly eat: EatFp;
  readonly vit = new Vitals();
  readonly tray = new MoodleTray(6);
  /** where the cluster sits (CSS px), its pixel size (device px per art pixel) and how visible it is */
  readonly st = { css: { x: 0, y: 0, w: 1, h: 1 }, px: 2, W: VW, H: VH, fade: 0, detail: 1 };
  private root: HTMLDivElement;
  private cvV: HTMLCanvasElement; private cvT: HTMLCanvasElement;
  private gV: CanvasRenderingContext2D; private gT: CanvasRenderingContext2D;
  private say: HTMLDivElement;
  private sayKey = '';
  private pinT = 0;
  private shown = false;
  private hidden = new Set<string>();
  private hover: Hover = NONE;
  private sig = new Map<number, string>();
  private coughCd = 0;
  private pumpAttack = false;
  private deadT = 0;
  private bodyOf: Player | null = null;
  private touch = false;
  private u = 2;
  private layoutT = 0;
  private moodT = 0;
  private down: { kind: Kind; id: number } | null = null;
  private overUI = false;
  private recent: string[] = [];
  private lastV = { x: 0, z: 0 };
  private hintT = 0;
  /** why the HUD is hidden right now ('' when shown; for tests) */
  why = '';

  constructor() {
    const root = this.root = document.createElement('div');
    root.className = 'bh-hud';
    root.setAttribute('aria-hidden', 'true');
    this.cvV = document.createElement('canvas'); this.cvV.className = 'bh-cv';
    this.cvT = document.createElement('canvas'); this.cvT.className = 'bh-cv';
    this.cvV.width = VW; this.cvV.height = VH;
    root.append(this.cvT, this.cvV);
    document.body.appendChild(root);
    this.gV = this.cvV.getContext('2d')!; this.gT = this.cvT.getContext('2d')!;
    const say = this.say = document.createElement('div');
    say.className = 'bh-say nc-free-text';
    say.setAttribute('role', 'status');
    document.body.appendChild(say);
    this.eat = new EatFp(this);
    this.relayout();
    window.addEventListener('resize', () => this.relayout());
    bus.on('uiScale', () => this.relayout());
    bus.on('touchMode', () => this.relayout());

    // ---- pointer: the world never sees a press that lands on the HUD
    window.addEventListener('pointerdown', (e) => this.onDown(e), true);
    window.addEventListener('pointermove', (e) => this.onMove(e), true);
    window.addEventListener('pointerup', (e) => this.onUp(e), true);
    window.addEventListener('pointercancel', (e) => this.onUp(e), true);
    window.addEventListener('contextmenu', (e) => { if (this.pickAt(e.clientX, e.clientY).kind) e.preventDefault(); }, true);

    // ---- the world reaches the body
    bus.on('playerHit', (p: Player, _part: string, _kind: string, h: any) => {
      if (!p?.isLocal) return;
      this.vit.hit(Number(h?.dmg) || 8);
      this.vit.jolt((Math.random() - 0.5) * 60, -30);
    });
    bus.on('bloodied', (p: Player, _part: string, amt: number) => { if (p?.isLocal) this.lungs.splash(Math.min(0.2, (Number(amt) || 0.5) * 0.09)); });
    bus.on('consumed', (p: Player, key: string) => { if (p?.isLocal && !this.eat.active && key) this.jar.pill(0xe8e0d0); });
    bus.on('death', (p: Player) => { if (p?.isLocal) this.vit.hit(30); });
    bus.on('cough', (p: Player) => { if (p?.isLocal) this.vit.jolt((Math.random() - 0.5) * 40, -20); });
    bus.on('vomit', (p: Player) => { if (p?.isLocal) this.vit.scare(0.5); });
    bus.on('panicAttack', (p: Player) => { if (!p || p.isLocal) this.vit.scare(1); });

    G.addSystem({ name: 'hudBody', update: (dt) => this.update(dt) });
    (G as any).hudBody = this;
  }

  // =================================================================== API
  get pumping(): boolean { return this.lungs.pumping; }
  canEat(): boolean { return this.jar.canEat(); }
  setHidden(key: string, on: boolean) { if (on) this.hidden.add(key); else this.hidden.delete(key); }
  /** H, the scanner's breathe button, the PUMP prop, a click on the balloon */
  pumpPress() {
    const p = G.local; if (!p || p.body.dead) return;
    const wasOn = this.lungs.pumping;
    this.onPump(p, this.lungs.press(), wasOn);
  }
  eatStart(a: any): boolean { const ok = this.eat.startEat(a); if (ok && a?.it) this.noteFood(a.it.key); return ok; }
  drinkStart(a: any): boolean { return this.eat.startDrink(a); }
  /** tests / screenshots: run the HUD forward */
  warm(secs = 2) { const p = G.local; if (!p) return; for (let t = 0; t < secs; t += 1 / 30) this.step(1 / 30, p); this.paint(); }
  /** where a wound shows on screen (the health bar; CSS px) */
  holeScreen(_inj?: Injury): { x: number; y: number } { return this.toScreen(BAR.x + BAR.w / 2, BAR.y + BAR.h / 2); }
  /** a part's centre on screen (CSS px): 'bag' the health bar, 'lung' the balloon, 'jar' the hunger moodle (or the bar), 'pack' the rucksack, 'brain' */
  propScreen(kind: 'bag' | 'lung' | 'jar' | 'pack' | 'brain'): { x: number; y: number } {
    if (kind === 'lung') return this.toScreen(this.vit.bCx, this.vit.bCy);
    if (kind === 'pack') return this.toScreen(PACK.x + PACK.w / 2, PACK.y + PACK.h / 2);
    if (kind === 'brain') return this.toScreen(BRAIN.cx, BRAIN.cy);
    if (kind === 'jar') { const c = this.tray.centre('hunger') || this.tray.centre('stuffed'); if (c) return this.toScreen(c.x + TRAY_AT.x - PAD, c.y + TRAY_AT.y - PAD); }
    return this.holeScreen();
  }
  jarScreen(): { x: number; y: number } { return this.propScreen('jar'); }
  /** open the backpack */
  openPack() {
    G.audio?.ui?.('bh_squelch', 0.3);
    const inv: any = (G as any).ui?.inventory;
    if (inv?.toggle) inv.toggle(true);
  }
  /** what the HUD is laid out like (tests) */
  layoutInfo() {
    const r = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { vitals: r(this.cvV), tray: r(this.cvT), unit: this.u, touch: this.touch, moodles: this.tray.items.filter((i) => !i.out).map((i) => i.key + i.level) };
  }
  private toScreen(x: number, y: number) { return { x: this.st.css.x + x * this.u, y: this.st.css.y + y * this.u }; }
  private noteFood(key: string) {
    try { this.recent.unshift(itemDef(key).name.toLowerCase()); } catch { this.recent.unshift(key.replace(/_/g, ' ')); }
    this.recent = [...new Set(this.recent)].slice(0, 3);
  }

  // =================================================================== per frame
  private update(dt: number) {
    const p = G.local;
    // full first-person close-ups get the whole picture: the watch held up to the eye, the cube,
    // the bench, cooking, trading, surgery, eating (the bites still reach the stomach)
    const fp = fpOwner();
    const w: any = (G as any).watch;
    this.setHidden('fp', !!fp && (FULL_FP.has(fp) || (fp === 'watch' && !!w?.open && !w?.small)));
    const intro: any = G.systems.find((s) => s.name === 'intro');
    const introOn = !!intro && intro.phase !== 'done' && !intro.done && !intro.finished;
    const show = !!p && !G.attract && !introOn && !this.hidden.size && !document.body.classList.contains('photo-mode') && this.deadT < 6;
    this.why = !p ? 'nobody' : G.attract ? 'attract' : introOn ? 'intro' : this.hidden.size ? [...this.hidden].join(',') : this.deadT >= 6 ? 'dead' : show ? '' : 'photo';
    if (show !== this.shown) {
      this.shown = show;
      if (!show) { this.setSay(''); this.setOver(false); this.hover = NONE; }
    }
    const fade = this.st.fade += ((show ? 1 : 0) - this.st.fade) * Math.min(1, dt * 7);
    const op = fade < 0.02 ? '0' : fade > 0.98 ? '1' : fade.toFixed(2);
    if (this.root.style.opacity !== op) { this.root.style.opacity = op; this.root.style.visibility = fade < 0.02 ? 'hidden' : 'visible'; }
    document.documentElement.classList.toggle('bh-on', fade > 0.5);
    if (!p) return;
    this.layoutT -= dt;
    if (this.layoutT <= 0) { this.layoutT = 0.5; this.relayout(); }
    if (p !== this.bodyOf) { this.bodyOf = p; this.deadT = 0; this.sig.clear(); this.tray.items.length = 0; this.tray.sync(this.moodlesOf(p), true); }
    if (p.body.dead) this.deadT += dt; else this.deadT = 0;
    this.step(dt, p);
    this.eat.update(dt);
    if (fade > 0.01) this.paint();
    this.pinT = Math.max(0, this.pinT - dt);
    if (show) this.updateSay(p, dt);
  }

  private moodlesOf(p: Player) {
    try { return p.body.moodles(p.heavyLoad?.() ?? 0); } catch { return []; }
  }

  private input: VitalsIn = {
    hp: 100, blood: 100, bleed: 0, sick: 0, corrupt: 0, sanity: 100, panic: 0, bpm: 70, stamina: 1, breath: 1,
    running: false, moving: false, dead: false, pumping: false, pumpPos: 0, pumpFlash: 0, pumpEnd: 0, pumpGood: true, showPack: true, hover: null,
  };
  /** sanity for the brain: lucidity, worn down by chronic anxiety, low mood and trauma, dented by a panic */
  sanity(p: Player): number {
    const b = p.body, m: any = (b as any).mind || {};
    return Math.max(0, Math.min(100, b.lucidity - (m.anxiety ?? 0) * 18 - (m.depression ?? 0) * 14 - (m.trauma ?? 0) * 12 - b.corruption * 0.25 - Math.max(0, b.panic - 50) * 0.3 - ((m.attack ?? 0) > 0 ? 12 : 0)));
  }

  private step(dt: number, p: Player) {
    const b = p.body;
    // the sims: lungs (strain, the pump) and the stomach jar
    const exertion = p.running ? 1 : (p.speed ?? 0) > 0.5 ? 0.3 : 0;
    const ev = this.lungs.update(dt, p, exertion);
    if (ev === 'miss') G.audio?.ui?.('band_tick', 0.25);
    if (ev === 'end') this.pumpEnded(p);
    if (this.jar.update(dt, p) === 'gurgle') G.audio?.ui?.('bh_gurgle', 0.4);
    this.applyBody(dt, p);
    this.watchWounds(p);
    // the balloon swings as you start, stop and turn
    const ax = (p.vx ?? 0) - this.lastV.x, az = (p.vz ?? 0) - this.lastV.z;
    this.lastV.x = p.vx ?? 0; this.lastV.z = p.vz ?? 0;
    const yaw = G.pr?.yaw ?? 0;
    const sx = ax * Math.cos(yaw) - az * Math.sin(yaw);
    if (Math.abs(sx) > 0.05) this.vit.jolt(-sx * 14, 0);
    // the vitals
    const I = this.input, L = this.lungs;
    I.hp = b.health; I.blood = b.blood; I.bleed = b.bleedRate(); I.dead = b.dead;
    I.sick = Math.max(0, Math.min(1, (b.sickness - 20) / 70 + b.fever() * 0.6));
    I.corrupt = Math.max(0, Math.min(1, b.corruption / 80));
    I.sanity = this.sanity(p); I.panic = b.panic;
    I.bpm = b.dead ? 0 : (G.survival?.mind?.bpm ?? 70 + b.panic * 0.6);
    I.stamina = b.endurance; I.breath = L.s; I.running = !!p.running && (p.speed ?? 0) > 0.5; I.moving = (p.speed ?? 0) > 0.3;
    I.pumping = L.pumping; I.pumpPos = L.pos; I.pumpFlash = L.flashT; I.pumpEnd = L.flashEnd; I.pumpGood = L.flashGood;
    I.showPack = !this.touch;
    I.hover = this.hover.kind === 'moodle' ? null : this.hover.kind;
    this.vit.update(dt, I);
    // the moodles: a few times a second is plenty
    this.moodT -= dt;
    if (this.moodT <= 0) { this.moodT = 0.2; this.tray.sync(this.moodlesOf(p)); }
    this.tray.update(dt);
    for (const e of this.vit.events) G.audio?.ui?.(e === 'pop' ? 'hud_pop' : 'hud_wheeze', e === 'pop' ? 0.5 : 0.25);
    this.vit.events.length = 0;
    for (const e of this.tray.events) if (this.st.fade > 0.5) G.audio?.ui?.(e === 'in' ? 'hud_moodle' : e === 'up' ? 'hud_worse' : e === 'down' ? 'hud_better' : 'hud_moodle_out', e === 'out' ? 0.12 : 0.22);
    this.tray.events.length = 0;
  }

  private paint() {
    this.vit.draw(this.input);
    this.gV.putImageData(this.vit.pix.img, 0, 0);
    this.tray.draw(this.hover.kind === 'moodle' ? this.hover.key : null);
    if (this.cvT.width !== this.tray.W || this.cvT.height !== this.tray.H) { this.cvT.width = this.tray.W; this.cvT.height = this.tray.H; this.relayout(true); }
    this.gT.putImageData(this.tray.pix.img, 0, 0);
  }

  /** what the sims do back to the body */
  private applyBody(dt: number, p: Player) {
    const b = p.body;
    if (b.dead) return;
    const L = this.lungs;
    // blood in the lungs leaves less room for air; over-full lungs burn stamina; at the limit you cough
    const cap = 1 - L.stain * 0.45;
    if (b.endurance > cap) b.endurance = Math.max(cap, b.endurance - dt * 0.2);
    if (p.running && L.strain > 0.55) b.endurance = Math.max(0, b.endurance - dt * 0.02 * (L.strain - 0.55) / 0.45);
    this.coughCd = Math.max(0, this.coughCd - dt);
    if (L.strain >= 0.99 && this.coughCd <= 0) { this.coughCd = 4; L.strain = 0.7; this.coughFx(p, L.cough(), 0.06); }
    else if (L.stain > 0.35 && this.coughCd <= 0 && Math.random() < dt * 0.05) { this.coughCd = 6; this.coughFx(p, L.cough(), 0.02); }
    // the stomach: poisoning and overfilling bring it back up
    const J = this.jar;
    if (J.vomitT < 0 && ((b.sickness > 55 && J.fill > 0.55 && Math.random() < dt / 30) || J.fill > 1.06)) this.vomit(p);
  }
  private coughFx(p: Player, blood: boolean, cost: number) {
    p.body.endurance = Math.max(0, p.body.endurance - cost);
    G.audio?.flat?.('cough', 'voice', 0.5, 0.9 + Math.random() * 0.2);
    shake(0.12, 0.2);
    bus.emit('cough', p, blood);
  }
  vomit(p: Player) {
    const b = p.body;
    this.jar.vomit();
    b.hunger = Math.min(100, b.hunger + 12 + this.jar.sed * 30);
    b.stuffed = 0;
    b.thirst = Math.min(100, b.thirst + 10);
    b.sickness = Math.max(0, b.sickness - 18);
    b.unhappy = Math.min(100, b.unhappy + 6);
    b.endurance = Math.max(0, b.endurance - 0.15);
    G.audio?.flat?.('bh_vomit', 'voice', 0.7);
    shake(0.35, 0.5);
    if (this.eat.active) this.eat.abort('retch');
    this.recent.length = 0;
    bus.emit('think', p, ['Hhgk— oh no. Oh no.', 'Everything came back up.', 'That was not food.'][Math.floor(Math.random() * 3)]);
    bus.emit('vomit', p);
  }

  private onPump(p: Player, r: PumpResult, wasOn: boolean) {
    const b = p.body;
    if (!wasOn) { this.pumpAttack = (ensureMind(b).attack ?? 0) > 0; G.audio?.ui?.('band_tick', 0.35); return; }
    if (r === 'cough') { this.coughFx(p, this.lungs.stain > 0, 0.02); b.panic = Math.min(100, b.panic + 2); return; }
    const q = r === 'perfect' ? 2 : 1;
    b.endurance = Math.min(1 - this.lungs.stain * 0.45, b.endurance + (q === 2 ? 0.055 : 0.032));
    breathHit(p, q);
    const combo = this.lungs.combo;
    G.audio?.ui?.(q === 2 ? 'bh_perfect' : 'bh_good', 0.35 + Math.min(0.2, combo * 0.02));
    G.audio?.flat?.(this.lungs.pos > 0.5 ? 'bh_in' : 'bh_out', 'voice', 0.35, 0.95 + Math.random() * 0.1);
  }
  private pumpEnded(p: Player) { breathDone(p, this.lungs.hits, this.pumpAttack); this.pumpAttack = false; }

  /** a treatment landed: the bar shimmers, a rip of tape */
  private watchWounds(p: Player) {
    for (const inj of p.body.allInjuries()) {
      const s = `${inj.bandage ? (inj.bandage.clean ? 'B' : 'b') : ''}${inj.stitched ? 'S' : ''}${inj.splinted ? 'P' : ''}${inj.disinfected > 0 ? 'D' : ''}${inj.foreign ? 'F' : ''}${inj.tq != null ? 'T' : ''}${inj.caut ? 'C' : ''}`;
      const prev = this.sig.get(inj.id);
      if (prev !== undefined && prev !== s && s.length >= prev.length - (prev.includes('F') && !s.includes('F') ? 1 : 0)) {
        this.vit.heal = Math.min(1.4, this.vit.heal + 0.7);
        G.audio?.ui?.(s.includes('B') && !prev.includes('B') ? 'bh_tape' : 'bh_squelch', 0.45);
      }
      this.sig.set(inj.id, s);
    }
  }

  // =================================================================== layout
  private relayout(force = false) {
    const touch = document.documentElement.classList.contains('nc-touch');
    const dpr = G.pr?.dpr ?? Math.min(3, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    // the game's own pixel size on a desktop (never more than a third of the width); about 1.5 CSS px a pixel on a phone
    const game = G.pr?.scale ?? Math.max(1, Math.round(window.innerHeight * dpr / 360));
    const unit = touch
      ? Math.max(1, Math.min(Math.round(1.5 * dpr), Math.floor(W * 0.8 * dpr / VW)))
      : Math.max(1, Math.min(game, Math.floor(W * 0.34 * dpr / VW)));
    const u = unit / dpr;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    let x = snap(HUD_MARGIN + safe('left')), y = snap(HUD_MARGIN + safe('top'));
    if (touch) {
      // the touch props: keep clear of every one of them. First choice: the left edge, under the top bar;
      // if that lands on a prop (phones held sideways: POWER and RUN), the gap in the middle of the top bar.
      const btns: DOMRect[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('#nc-touch .nc-btn, #nc-touch .nc-stick')) {
        if (el.offsetParent === null || el.classList.contains('nc-hide')) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) btns.push(r);
      }
      const w = VW * u, h = (TRAY_AT.y + SLOT) * u;
      const top = btns.filter((r) => r.top < 90 && r.bottom < 140);
      const hits = (cx: number, cy: number) => btns.some((r) => r.right > cx && r.left < cx + w && r.bottom > cy && r.top < cy + h);
      const ax = snap(8 + safe('left'));
      let ay = snap(6 + safe('top'));
      for (const r of top) if (r.right > ax && r.left < ax + w) ay = Math.max(ay, snap(r.bottom + 6));
      x = ax; y = ay;
      if (hits(ax, ay)) {
        const L = Math.max(0, ...top.filter((r) => r.left < W / 2).map((r) => r.right));
        const R = Math.min(W, ...top.filter((r) => r.left >= W / 2).map((r) => r.left));
        if (R - L >= w + 12) { x = snap(L + (R - L - w) / 2); y = snap(4 + safe('top')); }
      }
    }
    // (the art's empty top rows sit in the margin)
    y = snap(y - 2 * u);
    if (!force && touch === this.touch && unit === this.st.px && x === this.st.css.x && y === this.st.css.y) return;
    this.touch = touch; this.u = u;
    this.st.px = unit; this.st.css = { x, y, w: VW * u, h: VH * u };
    const sz = (el: HTMLCanvasElement, w: number, h: number, ox: number, oy: number) => {
      el.style.width = w * u + 'px'; el.style.height = h * u + 'px';
      el.style.transform = `translate(${snap(ox)}px, ${snap(oy)}px)`;
    };
    sz(this.cvV, VW, VH, x, y);
    sz(this.cvT, this.tray.W, this.tray.H, x + (TRAY_AT.x - PAD) * u, y + (TRAY_AT.y - PAD) * u);
    // where the cluster ends: other corner UI (the radio line) sits below it
    const bottom = y + Math.max(VH - 2, TRAY_AT.y + this.tray.rows * SLOT) * u;
    document.documentElement.style.setProperty('--hud-tl-bottom', Math.round(bottom) + 'px');
    document.documentElement.style.setProperty('--hud-tl-right', Math.round(x + VW * u) + 'px');
  }

  // =================================================================== input
  private pickAt(cx: number, cy: number): Hover {
    if (!this.shown || this.st.fade < 0.5) return NONE;
    const u = this.u, hx = (cx - this.st.css.x) / u, hy = (cy - this.st.css.y) / u;
    const it = this.tray.pick(hx - (TRAY_AT.x - PAD), hy - (TRAY_AT.y - PAD));
    if (it) return { kind: 'moodle', key: it.key };
    if (hx < 0 || hy < 0 || hx >= VW || hy >= VH) return NONE;
    const k = this.vit.pick(hx, hy, !this.touch);
    return k ? { kind: k, key: k } : NONE;
  }
  private setOver(on: boolean) {
    if (on === this.overUI) return;
    this.overUI = on;
    if (G.input) G.input.pointerOverUI = on;
    document.body.classList.toggle('bh-hover', on);
  }
  private onMove(e: PointerEvent) {
    if (this.down) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.pointerType === 'touch') return;
    const h = this.pickAt(e.clientX, e.clientY);
    if (h.kind !== this.hover.kind || h.key !== this.hover.key) { this.hover = h; if (h.kind) this.pinT = 0; }
    this.setOver(!!h.kind);
  }
  private onDown(e: PointerEvent) {
    const h = this.pickAt(e.clientX, e.clientY);
    if (!h.kind) return;
    e.preventDefault(); e.stopPropagation();
    const p = G.local; if (!p) return;
    this.down = { kind: h.kind, id: e.pointerId };
    const touch = e.pointerType === 'touch';
    if (touch) { this.hover = h; this.pinT = 3; }
    if (e.button !== 0 && !touch) return;
    if (h.kind === 'pack') { this.openPack(); this.down = null; return; }
    if (h.kind === 'balloon') { this.pumpPress(); this.vit.jolt((Math.random() - 0.5) * 50, -30); G.audio?.ui?.('hud_squeak', 0.3); }
    else if (h.kind === 'brain') { this.vit.scare(0.3); G.audio?.ui?.('bh_squelch', 0.2); }
    else if (h.kind === 'bar') { const said = this.treatWorst(p); if (said) { this.hover = h; this.pinT = 2.6; this.setSay(said); this.sayKey = 'pin:' + said; } }
    else if (h.kind === 'moodle') { G.audio?.ui?.('band_tick', 0.2); if (!touch) this.pinT = 0; }
  }
  private onUp(e: PointerEvent) {
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    this.down = null;
    e.preventDefault(); e.stopPropagation();
    if (e.pointerType === 'touch') this.setOver(false);
  }
  /** the worst wound gets the best thing you carry; returns a line about it */
  private treatWorst(p: Player): string {
    const b = p.body;
    const injs = b.allInjuries().filter(needsCare).sort((a, c) => b.injuryBleed(c) - b.injuryBleed(a) || c.infection - a.infection || c.sev - a.sev);
    if (!injs.length) { G.audio?.ui?.('band_tick', 0.25); return b.health < 99 ? 'No wounds to treat\nrest, eat and drink to heal' : ''; }
    for (const inj of injs) {
      const best = bestTreatment(inj, treatOptions(p, inj));
      if (best?.run) {
        best.run();
        G.audio?.ui?.('bh_wrap', 0.35);
        const t = woundTitle(inj).split(' · ');
        return `${best.label}${best.using ? ' with ' + best.using.toLowerCase() : ''}\n${t[0].toLowerCase()}, ${t[1].toLowerCase()}`;
      }
    }
    G.audio?.ui?.('band_tick', 0.3);
    const miss = treatOptions(p, injs[0]).find((o) => o.missing)?.missing;
    return `You have nothing for it${miss ? '\nneeds ' + miss : ''}`;
  }

  // =================================================================== free-floating type (no box)
  private setSay(html: string) {
    if (html === this.sayKey) return;
    this.sayKey = html;
    this.say.innerHTML = html;
    this.say.classList.toggle('on', !!html);
  }
  private line(title: string, color: number | null, ...rest: string[]) {
    return `<b${color != null ? ` style="color:${hex(color)}"` : ''}>${esc(title)}</b>` + rest.filter(Boolean).map((r) => `<br>${esc(r)}`).join('');
  }
  private updateSay(p: Player, dt: number) {
    // under the cluster, left-aligned with the bar
    const u = this.u;
    const rows = this.tray.count ? this.tray.rows : 0;
    const top = this.st.css.y + Math.max(VH - 3, TRAY_AT.y + rows * SLOT + 1) * u;
    const left = this.st.css.x + BAR.x * u;
    const tx = Math.round(left) + 'px', ty = Math.round(top) + 'px';
    if (this.say.style.left !== tx) this.say.style.left = tx;
    if (this.say.style.top !== ty) this.say.style.top = ty;
    if (this.sayKey.startsWith('pin:') && this.pinT > 0) return;
    if (this.touch && this.pinT <= 0 && !this.lungs.pumping && this.hintT <= 0) { this.hover = NONE; this.setSay(''); return; }
    const h = this.hover, b = p.body, T = this.touch;
    let html = '';
    if (h.kind === 'pack') html = this.line('Backpack', null, T ? 'tap to open' : 'click to open  ·  I');
    else if (h.kind === 'bar') {
      const hp = Math.round(b.health);
      const injs = b.allInjuries().filter((i) => i.type !== 'bruise');
      const care = injs.filter(needsCare);
      const br = b.bleedRate();
      const state = hp > 85 ? 'healthy' : hp > 60 ? 'hurt' : hp > 35 ? 'badly hurt' : hp > 15 ? 'critical' : 'dying';
      const w = injs.length ? `${injs.length} wound${injs.length > 1 ? 's' : ''}${br > 0.02 ? (br > 0.8 ? ', pouring blood' : ', bleeding') : ''}` : 'no wounds';
      let act = '';
      if (care.length) {
        const best = bestTreatment(care[0], treatOptions(p, care[0]));
        act = best ? `${T ? 'tap' : 'click'}: ${best.label.toLowerCase()}${best.using ? ' with ' + best.using.toLowerCase() : ''}` : 'nothing to treat it with';
      }
      html = this.line(`Health ${hp}  ·  ${state}`, hp < 30 ? 0xff6a5a : null, `${w}  ·  blood ${Math.round(b.blood)}%`, act);
    } else if (h.kind === 'brain') {
      const s = Math.round(this.sanity(p));
      const word = s > 85 ? 'steady' : s > 65 ? 'uneasy' : s > 45 ? 'frayed' : s > 25 ? 'unravelling' : 'breaking';
      const m: any = (b as any).mind || {};
      const pn = b.panic > 75 ? 'terrified' : b.panic > 50 ? 'panicking' : b.panic > 25 ? 'on edge' : 'calm';
      const bpm = Math.round(G.survival?.mind?.bpm ?? 70);
      html = this.line(`Sanity ${s}  ·  ${word}`, s < 30 ? 0xc8a0ff : null, `${pn}  ·  pulse ${bpm}${(m.attack ?? 0) > 0 ? '  ·  panic attack' : ''}`, b.panic > 30 || s < 50 ? `light, people and slow breathing help${T ? '' : '  ·  H'}` : '');
    } else if (h.kind === 'balloon') {
      const st = Math.round(b.endurance * 100);
      html = this.lungs.pumping
        ? this.line('Breathe', 0x9ad8ff, `press ${T ? 'PUMP' : 'H'} as the bead reaches IN, then OUT`, this.lungs.combo > 1 ? `${this.lungs.combo} in a row` : '')
        : this.line(`Stamina ${st}%`, st < 15 ? 0xff8a6a : null, st < 15 ? 'spent: stop running and catch your breath' : p.running ? 'running lets the air out' : 'it fills back up while you walk or rest', `${T ? 'tap' : 'click'} or ${T ? 'PUMP' : 'H'}: breathe on the beat`);
    } else if (h.kind === 'moodle') {
      const it = this.tray.items.find((i) => i.key === h.key);
      if (it) html = this.line(it.name, MoodleTray.tint(it.level, it.good), it.desc);
    } else if (this.lungs.pumping) {
      html = this.line('Breathe', 0x9ad8ff, `${T ? 'PUMP' : 'H'} as the bead reaches IN, then OUT`);
    } else {
      // a nudge when you are out of breath or panicking and have not found the pump yet
      if (this.lungs.hint > 0.9 && this.hintT <= 0 && Math.random() < dt * 0.15) this.hintT = 4;
      this.hintT = Math.max(0, this.hintT - dt);
      if (this.hintT > 0) html = this.line(b.panic > 50 ? 'Breathe' : 'Out of breath', 0x9ad8ff, `${T ? 'PUMP' : 'H'}: breathe on the beat`);
    }
    this.setSay(html);
  }
}

let probe: HTMLDivElement | null = null;
/** CSS safe-area inset in px */
function safe(side: 'left' | 'top'): number {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) 0 0 env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return parseFloat(side === 'left' ? cs.paddingLeft : cs.paddingTop) || 0;
}

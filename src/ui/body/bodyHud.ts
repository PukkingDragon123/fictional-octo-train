// The body HUD (G.hudBody): one machine, top-left, read at a glance. A
// life-support rig drawn in 3D through the game's own renderer (stage.ts),
// with its readings floating over the console's front in Alagard:
//
//   MIND   the brain on its brass plinth (vitals.ts, pixel art): sanity. It
//          throbs with the heartbeat, bruises, veins and cracks as sanity
//          goes, sweats in a panic, flinches on a scare.
//   HEART  the mechanical heart (heart3d.ts): health. It beats with the pulse
//          (faster with exertion, fear and low health), pumps as hard as you
//          are well, its sight-tube and gauge read it; wounds are punctures that
//          spurt on each beat, damage cracks it, a blow makes it stutter.
//          Click / tap a puncture to treat it (a first-aid pegboard swings in).
//   AIR    the breathing pump (lung3d.ts) with the stamina balloon tied to its
//          cap (vitals.ts): the balloon fills as you recover, shrinks and
//          wobbles while you run, sags wheezing when spent, pops a little when
//          it runs dry. H (or a thumb on the pump / the balloon) pumps on the beat.
//   FOOD   the digester (jar3d.ts): the stomach and its water sight-glass.
//   the rucksack on the end opens the pack; the watch icon under the brain
//   lights and types when the watch has something for you (tap: open it).
// Other statuses pop up as Zomboid-style moodles beside the watch icon (tray.ts).
//
// API: pumpPress(), pumping, canEat(), lungs / jar (sims), eatStart(action) /
// drinkStart(action) (first-person close-ups, eatFp.ts), eat (EatFp), vomit(p),
// setHidden(key, on), warm(secs), holeScreen(inj), propScreen(kind),
// jarScreen(), openPack(), why, st (where it sits), layoutInfo().
import './body.css';
import './sounds';
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { fpOwner } from '../../fp/fp';

/** first-person scenes that get the whole picture (eating too: its own scene in the room, no floating HUD) */
const FULL_FP = new Set(['pack', 'inspect', 'bench', 'cook', 'trade', 'dominion', 'surgery', 'remote', 'eat', 'watch', 'talk']);
import type { Player } from '../../entities/player';
import type { Injury } from '../../survival/body';
import { Lungs, type PumpResult } from './lung';
import { Jar } from './jar';
import { BodyStage, Cubes } from './stage';
import { Rig3D, SW, SH, CON_TOP, HEART_AT, PUMP_AT, JAR_AT, BRAIN_AT, TIE_AT, LABEL_X } from './rig3d';
import { Heart3D } from './heart3d';
import { Brain3D } from './brain3d';
import { Lung3D, CON_H } from './lung3d';
import { Jar3D } from './jar3d';
import { Board3D } from './board3d';
import { Vitals, type VitalsIn } from './vitals';
import { MoodleTray, SLOT, PAD } from './tray';
import { treatOptions, bestTreatment, woundTitle, type TreatOpt } from './treat';
import { breathHit, breathDone } from '../../survival/mindSystem';
import { ensureMind } from '../../survival/mind';
import { shake } from '../../gfx/juice';
import { fontsReady } from '../../gfx/crt';
import { itemDef } from '../../items/item';
import { EatFp } from './eatFp';

/** the pegboard swings in over the pump */
const BOARD_AT: [number, number] = [PUMP_AT[0] + 2, -10];
/** the screen margin everything keeps (CSS px) */
export const HUD_MARGIN = 12;

type Kind = 'bag' | 'lung' | 'gauge' | 'jar' | 'tool' | 'pack' | 'brain' | 'balloon' | 'watch' | 'moodle';
interface Hover { kind: Kind | null; inj: Injury | null; slot: number; key: string }
const NONE: Hover = { kind: null, inj: null, slot: -1, key: '' };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const TONE: Record<string, number> = { ok: 0x9affb4, warn: 0xffb46a, rp: 0xc8a0ff };

export class BodyHud {
  name = 'hudBody';
  readonly lungs = new Lungs();
  readonly jar = new Jar();
  readonly eat: EatFp;
  readonly st = new BodyStage();
  readonly vit = new Vitals();
  readonly tray = new MoodleTray(6);
  private world = new THREE.Group();
  private heartV: Heart3D; private brainV: Brain3D; private lungV: Lung3D; private jarV: Jar3D; private board: Board3D;
  readonly rig: Rig3D;
  private runT = 0; private lastLidV = 0;
  private cubes: Cubes;
  // ---- DOM: the pixel overlay (brain, balloon, watch icon), the moodle tray, the readings, the info line
  private cvV: HTMLCanvasElement; private gV: CanvasRenderingContext2D;
  private cvT: HTMLCanvasElement; private gT: CanvasRenderingContext2D;
  private labs: Record<'mind' | 'heart' | 'food', HTMLDivElement>;
  private labKey: Record<string, string> = {};
  private say: HTMLDivElement;
  private sayKey = '';
  private pinT = 0;
  private shown = false;
  private hidden = new Set<string>();
  private beatT = 0;
  private hover: Hover = NONE;
  private boardInj: Injury | null = null;
  private boardT = 0;
  private sig = new Map<number, string>();
  private coughCd = 0;
  private pumpAttack = false;
  private lastV = { x: 0, z: 0 };
  private deadT = 0;
  private bodyOf: Player | null = null;
  private k = 1; private touch = false;
  /** overlay: device px per art pixel, CSS px per art pixel, its size in art pixels */
  private u2 = 2; private uc = 2; private ow = 1; private oh = 1;
  private layoutT = 0;
  private moodT = 0;
  private down: { kind: Kind; x: number; y: number; moved: number; id: number; inj: Injury | null } | null = null;
  private overUI = false;
  private zoomT = 0;
  private flick = 0;
  private recent: string[] = [];
  private sparks: { x: number; y: number; t: number; c: number }[] = [];
  private v = new THREE.Vector3();
  private input: VitalsIn = {
    hp: 100, blood: 100, bleed: 0, sick: 0, corrupt: 0, sanity: 100, panic: 0, bpm: 70, stamina: 1, breath: 1,
    running: false, moving: false, dead: false, pumping: false, pumpPos: 0, pumpFlash: 0, pumpEnd: 0, pumpGood: true, showPack: false, hover: null,
  };
  /** why the HUD is hidden right now ('' when shown; for tests) */
  why = '';

  constructor() {
    const st = this.st;
    // (bright and colourful, never murky)
    st.uTint.value.set(1.12, 1.06, 0.98);
    st.scene.add(this.world);
    this.rig = new Rig3D(st);
    this.world.add(this.rig.pivot);
    const R = this.rig.inner;
    this.heartV = new Heart3D(st); this.lungV = new Lung3D(st); this.jarV = new Jar3D(st); this.board = new Board3D(st);
    this.brainV = new Brain3D(st);
    R.add(this.heartV.root, this.brainV.root, this.lungV.root, this.jarV.root, this.board.root);
    this.brainV.root.position.set(BRAIN_AT[0], BRAIN_AT[1] + 3.2, 0);
    this.vit.brain3d = true;
    this.heartV.root.position.set(HEART_AT[0], HEART_AT[1], 0);
    this.heartV.root.scale.setScalar(1.12);
    this.lungV.root.position.set(PUMP_AT[0], PUMP_AT[1], 0);
    this.jarV.root.position.set(JAR_AT[0], JAR_AT[1], 0);
    this.board.root.position.set(BOARD_AT[0], BOARD_AT[1], 16);
    this.cubes = new Cubes(260, st.cubeMat);
    R.add(this.cubes.mesh);

    const mk = (cls: string) => { const c = document.createElement('canvas'); c.className = cls; document.body.appendChild(c); return c; };
    this.cvV = mk('bh-cv bh-ov'); this.gV = this.cvV.getContext('2d')!;
    this.cvT = mk('bh-cv bh-tray'); this.gT = this.cvT.getContext('2d')!;
    const lab = () => { const d = document.createElement('div'); d.className = 'bh-lab'; document.body.appendChild(d); return d; };
    this.labs = { mind: lab(), heart: lab(), food: lab() };
    const say = this.say = document.createElement('div');
    say.className = 'bh-say nc-free-text';
    say.setAttribute('role', 'status');
    document.body.appendChild(say);
    this.eat = new EatFp(this);
    this.relayout();
    window.addEventListener('resize', () => this.relayout());
    bus.on('uiScale', () => this.relayout());
    bus.on('touchMode', () => this.relayout());
    fontsReady().then(() => { this.lungV.repaintType(); this.jarV.repaintType(); this.rig.repaintType(); });

    // ---- pointer: the world never sees a press that lands on the HUD
    window.addEventListener('pointerdown', (e) => this.onDown(e), true);
    window.addEventListener('pointermove', (e) => this.onMove(e), true);
    window.addEventListener('pointerup', (e) => this.onUp(e), true);
    window.addEventListener('pointercancel', (e) => this.onUp(e), true);
    window.addEventListener('contextmenu', (e) => { if (this.pickAt(e.clientX, e.clientY).kind) e.preventDefault(); }, true);

    // ---- the world reaches the body
    bus.on('playerHit', (p: Player, _part: string, _kind: string, h: any) => {
      if (!p?.isLocal) return;
      const dmg = Number(h?.dmg) || 8, k = Math.min(1, dmg / 22);
      this.heartV.kick((Math.random() - 0.5) * 3 * (0.5 + k), 0.4 + k);
      this.vit.hit(dmg);
      this.rig.kick((Math.random() - 0.5) * 14 * (0.4 + k), -(8 + 14 * k), (Math.random() - 0.5) * 0.5 * (0.4 + k));
      this.jarV.kick(0.5 + k);
    });
    bus.on('bloodied', (p: Player, _part: string, amt: number) => { if (p?.isLocal) this.lungs.splash(Math.min(0.2, (Number(amt) || 0.5) * 0.09)); });
    bus.on('creatureKilled', (c: any) => {
      const p = G.local; if (!p || !c || c.zoneKey !== p.zoneKey) return;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 2.6 && (G.sandbox?.gore ?? 1) > 0) this.lungs.splash(0.14 * (1 - d / 2.6) + 0.04);
    });
    bus.on('consumed', (p: Player, key: string) => { if (p?.isLocal && !this.eat.active && key) this.jar.pill(0xe8e0d0); });
    bus.on('death', (p: Player) => { if (p?.isLocal) { this.heartV.kick(1.5, 1); this.rig.kick(0, -20, 0.4); } });
    bus.on('cough', (p: Player) => { if (p?.isLocal) this.rig.kick((Math.random() - 0.5) * 6, 6, (Math.random() - 0.5) * 0.2); });
    bus.on('vomit', (p: Player) => { if (p?.isLocal) { this.rig.kick(0, -14, (Math.random() - 0.5) * 0.4); this.jarV.kick(2); this.vit.scare(0.4); } });
    bus.on('panicAttack', (p: Player) => { if (!p || p.isLocal) this.vit.scare(1); });

    G.addSystem({ name: 'hudBody', update: (dt) => this.update(dt) });
    (G as any).hudBody = this;
  }

  // =================================================================== API
  get pumping(): boolean { return this.lungs.pumping; }
  canEat(): boolean { return this.jar.canEat(); }
  setHidden(key: string, on: boolean) { if (on) this.hidden.add(key); else this.hidden.delete(key); }
  /** H, the scanner's breathe button, the PUMP prop, a thumb on the pump or the balloon */
  pumpPress() {
    const p = G.local; if (!p || p.body.dead) return;
    const wasOn = this.lungs.pumping;
    this.onPump(p, this.lungs.press(), wasOn);
  }
  eatStart(a: any): boolean { const ok = this.eat.startEat(a); if (ok && a?.it) this.noteFood(a.it.key); return ok; }
  drinkStart(a: any): boolean { return this.eat.startDrink(a); }
  /** tests / screenshots: run the HUD forward */
  warm(secs = 2) { const p = G.local; if (!p) return; for (let t = 0; t < secs; t += 1 / 30) this.step(1 / 30, p); this.place(); this.paint(); }
  /** where a wound's puncture is on screen (CSS px) */
  holeScreen(inj: Injury): { x: number; y: number } {
    this.world.updateMatrixWorld(true);
    const w = this.heartV.holeWorld(inj, this.v);
    return this.st.toScreen(w.x, w.y);
  }
  /** a part's centre on screen (CSS px): 'bag'/'heart' the heart, 'lung' the pump, 'jar' the digester, 'pack', 'brain', 'balloon', 'watch' */
  propScreen(kind: 'bag' | 'heart' | 'lung' | 'jar' | 'pack' | 'brain' | 'balloon' | 'watch'): { x: number; y: number } {
    if (kind === 'brain') return this.ovScreen(this.vit.brainC.x, this.vit.brainC.y);
    if (kind === 'balloon') return this.ovScreen(this.vit.bCx, this.vit.bCy);
    if (kind === 'watch') { const w = this.vit.watchAt; return w ? this.ovScreen(w.x, w.y) : { x: 0, y: 0 }; }
    this.world.updateMatrixWorld(true);
    const o = kind === 'bag' || kind === 'heart' ? this.heartV.hit : kind === 'lung' ? this.lungV.hit : kind === 'jar' ? this.jarV.hit : this.rig.packHit;
    o.getWorldPosition(this.v);
    return this.st.toScreen(this.v.x, this.v.y);
  }
  /** open the backpack (the rucksack on the rig) */
  openPack() {
    G.audio?.ui?.('bh_squelch', 0.3);
    const inv: any = (G as any).ui?.inventory;
    if (inv?.toggle) inv.toggle(true);
  }
  jarScreen(): { x: number; y: number } {
    this.world.updateMatrixWorld(true);
    const w = this.jarV.topWorld(this.v);
    return this.st.toScreen(w.x, w.y);
  }
  /** where everything sits (tests) */
  layoutInfo() {
    const r = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { stage: this.st.css, overlay: r(this.cvV), tray: r(this.cvT), k: this.k, unit: this.st.px, u2: this.u2, touch: this.touch, moodles: this.tray.items.filter((i) => !i.out).map((i) => i.key + i.level), labels: Object.values(this.labs).map((l) => l.textContent) };
  }
  private noteFood(key: string) {
    try { this.recent.unshift(itemDef(key).name.toLowerCase()); } catch { this.recent.unshift(key.replace(/_/g, ' ')); }
    this.recent = [...new Set(this.recent)].slice(0, 3);
  }
  /** overlay art px -> CSS px */
  private ovScreen(x: number, y: number) { return { x: this.st.css.x + x * this.uc, y: this.st.css.y + y * this.uc }; }
  /** rig space (stage units) -> overlay art px */
  private rigToOv(x: number, y: number): { x: number; y: number } {
    this.v.set(x, y, 0); this.rig.inner.localToWorld(this.v);
    const s = this.st.toScreen(this.v.x, this.v.y);
    return { x: (s.x - this.st.css.x) / this.uc, y: (s.y - this.st.css.y) / this.uc };
  }

  // =================================================================== per frame
  private update(dt: number) {
    const p = G.local;
    // full first-person close-ups get the whole picture: the watch at the eye, the cube, the bench,
    // cooking, trading, surgery, eating (the bites still reach the digester)
    const fp = fpOwner();
    this.setHidden('fp', !!fp && FULL_FP.has(fp));
    const intro: any = G.systems.find((s) => s.name === 'intro');
    const introOn = !!intro && intro.phase !== 'done' && !intro.done && !intro.finished;
    const show = !!p && !G.attract && !introOn && !this.hidden.size && !document.body.classList.contains('photo-mode') && this.deadT < 6;
    this.why = !p ? 'nobody' : G.attract ? 'attract' : introOn ? 'intro' : this.hidden.size ? [...this.hidden].join(',') : this.deadT >= 6 ? 'dead' : show ? '' : 'photo';
    if (show !== this.shown) {
      this.shown = show;
      if (!show) { this.closeBoard(); this.setSay(''); this.setOver(false); this.hover = NONE; }
    }
    this.st.fade += ((show ? 1 : 0) - this.st.fade) * Math.min(1, dt * 6);
    const fade = this.st.fade;
    const op = fade < 0.02 ? '0' : fade > 0.98 ? '1' : fade.toFixed(2);
    for (const el of [this.cvV, this.cvT, ...Object.values(this.labs)]) if (el.style.opacity !== op) { el.style.opacity = op; el.style.visibility = fade < 0.02 ? 'hidden' : 'visible'; }
    document.documentElement.classList.toggle('bh-on', fade > 0.5);
    if (!p) return;
    this.layoutT -= dt;
    if (this.layoutT <= 0) { this.layoutT = 0.5; this.relayout(); }
    if (p !== this.bodyOf) { this.bodyOf = p; this.deadT = 0; this.sig.clear(); this.tray.items.length = 0; this.tray.sync(this.moodlesOf(p), true); }
    if (p.body.dead) this.deadT += dt; else this.deadT = 0;
    this.step(dt, p);
    this.eat.update(dt);
    if (this.boardInj) { this.boardT -= dt; if ((this.boardT <= 0 && this.hover.kind !== 'tool') || !p.body.allInjuries().includes(this.boardInj)) this.closeBoard(); }
    if (fade > 0.01) { this.place(); this.paint(); this.labels(p); }
    this.pinT = Math.max(0, this.pinT - dt);
    if (show) this.updateSay(p, dt);
  }
  private moodlesOf(p: Player) { try { return p.body.moodles(p.heavyLoad?.() ?? 0); } catch { return []; } }

  /** sanity for the brain: lucidity, worn down by chronic anxiety, low mood and trauma, dented by a panic */
  sanity(p: Player): number {
    const b = p.body, m: any = (b as any).mind || {};
    return Math.max(0, Math.min(100, b.lucidity - (m.anxiety ?? 0) * 18 - (m.depression ?? 0) * 14 - (m.trauma ?? 0) * 12 - b.corruption * 0.25 - Math.max(0, b.panic - 50) * 0.3 - ((m.attack ?? 0) > 0 ? 12 : 0)));
  }

  private step(dt: number, p: Player) {
    const b = p.body;
    // the rig: it takes a knock now and then while you run, every bite and gulp lands with a bump
    this.rig.update(dt, b.dead);
    if (p.running && (p.speed ?? 0) > 0.5) { this.runT -= dt; if (this.runT <= 0) { this.runT = 0.45; this.rig.kick((Math.random() - 0.5) * 2, -3, (Math.random() - 0.5) * 0.06); } }
    if (this.jar.lidV < this.lastLidV - 12) { this.rig.kick((Math.random() - 0.5) * 3, -6, (Math.random() - 0.5) * 0.15); this.jarV.kick(1); }
    this.lastLidV = this.jar.lidV;
    this.rig.packHover = this.hover.kind === 'pack' ? 1 : 0;
    // the fluorescent tube over the rig hums and now and then dips (more when you are scared)
    const fear = Math.max(0, (b.panic - 40) / 60);
    this.st.uLight.value = Math.random() < dt * (0.1 + fear * 1.5) ? 0.82 : Math.min(1.08, this.st.uLight.value + dt * 6);
    // the balloon swings as you start, stop and turn
    const ax = (p.vx ?? 0) - this.lastV.x, az = (p.vz ?? 0) - this.lastV.z;
    this.lastV.x = p.vx ?? 0; this.lastV.z = p.vz ?? 0;
    const yaw = G.pr?.yaw ?? 0;
    const sx = ax * Math.cos(yaw) - az * Math.sin(yaw);
    if (Math.abs(sx) > 0.05) { this.vit.jolt(-sx * 14, 0); this.heartV.kick(-sx * 0.2); }
    // the sims and the props
    const exertion = p.running ? 1 : (p.speed ?? 0) > 0.5 ? 0.3 : 0;
    if (p.running && Math.random() < dt * 4) this.lungs.sv += (Math.random() - 0.5) * 0.6;
    const want = this.down && (this.down.kind === 'lung' || this.down.kind === 'gauge') ? 1 : 0;
    this.lungs.squeeze += (want - this.lungs.squeeze) * Math.min(1, dt * 18);
    const ev = this.lungs.update(dt, p, exertion);
    if (ev === 'miss') G.audio?.ui?.('band_tick', 0.25);
    if (ev === 'end') this.pumpEnded(p);
    this.lungV.update(dt, this.lungs, p, this.lungs.panic);
    if (this.jar.update(dt, p) === 'gurgle') { G.audio?.ui?.('bh_gurgle', 0.4); this.jarV.kick(0.4); }
    this.zoomT = Math.max(0, this.zoomT - dt);
    this.jarV.zoom += ((this.zoomT > 0 ? 1 : 0) - this.jarV.zoom) * Math.min(1, dt * 8);
    this.jarV.update(dt, this.jar, p);
    this.board.update(dt);
    this.applyBody(dt, p);
    this.watchWounds(p);
    // the vitals overlay: the heartbeat everything shares, the brain, the balloon
    const I = this.input, L = this.lungs;
    I.hp = b.health; I.blood = b.blood; I.bleed = b.bleedRate(); I.dead = b.dead;
    I.sick = Math.max(0, Math.min(1, (b.sickness - 20) / 70 + b.fever() * 0.6));
    I.corrupt = Math.max(0, Math.min(1, b.corruption / 80));
    I.sanity = this.sanity(p); I.panic = b.panic;
    I.bpm = b.dead ? 0 : (G.survival?.mind?.bpm ?? 70 + b.panic * 0.6) + exertion * 18;
    I.stamina = b.endurance; I.breath = L.s; I.running = !!p.running && (p.speed ?? 0) > 0.5; I.moving = (p.speed ?? 0) > 0.3;
    I.pumping = L.pumping; I.pumpPos = L.pos; I.pumpFlash = L.flashT; I.pumpEnd = L.flashEnd; I.pumpGood = L.flashGood;
    I.hover = this.hover.kind === 'brain' || this.hover.kind === 'balloon' || this.hover.kind === 'watch' ? this.hover.kind : null;
    I.hideBalloon = this.board.open;
    this.vit.update(dt, I);
    this.heartV.hover = this.hover.kind === 'bag' ? this.hover.inj : this.boardInj;
    this.heartV.update(dt, p, this.vit.heart);
    this.brainV.update(dt, p, this.vit, this.hover.kind === 'brain');
    // the drip from the heart's punctures every beat (the old bag's drip-chamber tick)
    if (!b.dead) { this.beatT += dt * (I.bpm || 70) / 60; if (this.beatT >= 1) this.beatT -= 1; }
    // the moodles: a few times a second
    this.moodT -= dt;
    if (this.moodT <= 0) { this.moodT = 0.2; this.tray.sync(this.moodlesOf(p)); }
    this.tray.update(dt);
    // the watch: a note lights its icon and types beside it
    const note = (G as any).watch?.hudNote?.() ?? null;
    this.vit.watchLit = note ? Math.min(1, (G.time - note.at) * 2 + 0.2) : 0;
    for (const e of this.vit.events) G.audio?.ui?.(e === 'pop' ? 'hud_pop' : e === 'stall' ? 'hud_valve' : 'hud_wheeze', e === 'pop' ? 0.5 : 0.25);
    this.vit.events.length = 0;
    for (const e of this.tray.events) if (this.st.fade > 0.5) G.audio?.ui?.(e === 'in' ? 'hud_moodle' : e === 'up' ? 'hud_worse' : e === 'down' ? 'hud_better' : 'hud_moodle_out', e === 'out' ? 0.12 : 0.22);
    this.tray.events.length = 0;
    // one batch of little cubes: drops, puffs, chunks, bubbles, sparks
    this.world.updateMatrixWorld(true);
    const C = this.cubes;
    C.begin();
    this.heartV.cubes(C); this.brainV.cubes(C); this.lungV.cubes(C, this.lungs); this.jarV.cubes(C, this.jar);
    for (const s of this.sparks) if (s.t > 0) { s.t -= dt; s.y += dt * 8; C.put(s.x, s.y, 10, 0.8, 0.8, 0.8, s.t * 9, s.c, Math.min(1, s.t * 4)); }
    if (this.sparks.length && this.sparks[0].t <= 0) this.sparks = this.sparks.filter((s) => s.t > 0);
    C.end();
  }

  /** the overlay follows the rig: the brain on its plinth, the balloon's tie on the pump, the watch icon under the brain */
  private place() {
    this.world.updateMatrixWorld(true);
    const br = this.rigToOv(BRAIN_AT[0], CON_TOP + 3.4);
    this.vit.brainC.x = Math.round(br.x); this.vit.brainC.y = Math.round(br.y - 16);
    const tie = this.rigToOv(TIE_AT[0], TIE_AT[1]);
    this.vit.anchor.x = tie.x; this.vit.anchor.y = tie.y; this.vit.floor = tie.y + 1;
    const base = this.rigToOv(BRAIN_AT[0], -SH);
    // no watch icon on the HUD any more (the watch lives on the wrist: Tab); keep base for the moodle row
    void base; this.vit.watchAt = null;
  }
  private paint() {
    this.vit.draw(this.input);
    this.gV.putImageData(this.vit.pix.img, 0, 0);
    this.tray.draw(this.hover.kind === 'moodle' ? this.hover.key : null);
    if (this.cvT.width !== this.tray.W || this.cvT.height !== this.tray.H) { this.cvT.width = this.tray.W; this.cvT.height = this.tray.H; this.relayout(true); }
    this.gT.putImageData(this.tray.pix.img, 0, 0);
  }
  /** the readings on the console's front: MIND, HEART, FOOD */
  private labels(p: Player) {
    const b = p.body;
    const vals: Record<'mind' | 'heart' | 'food', number> = { mind: Math.round(this.vit.sanityShown), heart: Math.round(b.health), food: Math.round(100 - b.hunger) };
    const y = CON_TOP - CON_H / 2 + 0.6;
    // where the readings land; a small rig (phones) has no room for the words, only the numbers
    const at = {} as Record<'mind' | 'heart' | 'food', { x: number; y: number }>;
    for (const k of ['mind', 'heart', 'food'] as const) {
      this.v.set(LABEL_X[k], y, 8); this.rig.inner.localToWorld(this.v);
      const s = this.st.toScreen(this.v.x, this.v.y);
      at[k] = { x: s.x, y: s.y };
    }
    // Alagard at 16px runs ~9px a glyph: 'HEART 100' wants ~85px, so the readings need ~90px between centres
    const words = Math.min(at.heart.x - at.mind.x, at.food.x - at.heart.x) >= 90;
    for (const k of ['mind', 'heart', 'food'] as const) {
      const el = this.labs[k], v = Math.max(0, vals[k]);
      const low = v < 30 ? (v < 15 ? 'crit' : 'low') : '';
      const html = words ? `${k.toUpperCase()} <b class="${low}">${v}</b>` : `<b class="${low}">${v}</b>`;
      if (this.labKey[k] !== html) { this.labKey[k] = html; el.innerHTML = html; el.title = k; }
      const s = at[k];
      const t = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -50%)`;
      if (el.style.transform !== t) el.style.transform = t;
    }
  }

  /** what the objects do back to the body */
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

  /** a treatment landed: sparks on the puncture, a rip of tape, the heart jolts */
  private watchWounds(p: Player) {
    for (const inj of p.body.allInjuries()) {
      const s = `${inj.bandage ? (inj.bandage.clean ? 'B' : 'b') : ''}${inj.stitched ? 'S' : ''}${inj.splinted ? 'P' : ''}${inj.disinfected > 0 ? 'D' : ''}${inj.foreign ? 'F' : ''}${inj.tq != null ? 'T' : ''}${inj.caut ? 'C' : ''}`;
      const prev = this.sig.get(inj.id);
      if (prev !== undefined && prev !== s && s.length >= prev.length - (prev.includes('F') && !s.includes('F') ? 1 : 0)) {
        this.world.updateMatrixWorld(true);
        const w = this.rig.inner.worldToLocal(this.heartV.holeWorld(inj, this.v));
        for (let i = 0; i < 8; i++) this.sparks.push({ x: w.x + Math.cos(i * 0.785) * 2.4, y: w.y + Math.sin(i * 0.785) * 2.4, t: 0.35 + i * 0.02, c: i % 2 ? 0xffffff : 0xfff0a0 });
        if (this.sparks.length > 40) this.sparks.splice(0, this.sparks.length - 40);
        G.audio?.ui?.(s.includes('B') && !prev.includes('B') ? 'bh_tape' : 'bh_squelch', 0.45);
        this.heartV.kick(0.6, 0.2);
      }
      this.sig.set(inj.id, s);
    }
  }

  // =================================================================== layout
  private relayout(force = false) {
    const touch = document.documentElement.classList.contains('nc-touch');
    const dpr = G.pr?.dpr ?? Math.min(3, window.devicePixelRatio || 1);
    const VWp = window.innerWidth, VHp = window.innerHeight;
    const game = Math.max(1, G.pr?.scale ?? Math.round(VHp * dpr / 360));
    // device px per stage unit: the game's pixel size (on a phone: one CSS px)
    const unitPx = touch ? Math.max(1, Math.round(dpr)) : game;
    // how wide the machine is: a third of a desktop, most of a phone held upright, short when held sideways
    let css = touch ? Math.min(VWp * 0.86, 360) : Math.min(VWp * 0.3, 470);
    if (touch) css = Math.min(css, VHp * 0.38 * SW / SH);
    const k = Math.max(0.7, css * dpr / (SW * unitPx));
    const W = Math.round(SW * k), H = Math.round(SH * k);
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    let x = snap(HUD_MARGIN + safe('left')), y = snap(HUD_MARGIN + safe('top'));
    if (touch) {
      // under the top bar's controls that run over the machine's width
      x = snap(8 + safe('left')); y = snap(6 + safe('top'));
      const right = x + W * unitPx / dpr;
      for (const el of document.querySelectorAll<HTMLElement>('#nc-touch .nc-tl .nc-btn, #nc-touch .nc-tr .nc-btn')) {
        if (el.offsetParent === null || el.classList.contains('nc-hide')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.top > 140) continue;
        if (r.right > x && r.left < right) y = Math.max(y, snap(r.bottom + 4));
      }
    }
    // the overlay's pixel size: about the rig's own scale, a whole number of device px
    const u2 = Math.max(1, Math.round(k * unitPx * 0.8));
    if (!force && touch === this.touch && k === this.k && x === this.st.css.x && y === this.st.css.y && unitPx === this.st.px && u2 === this.u2) return;
    this.touch = touch; this.k = k; this.u2 = u2; this.uc = u2 / dpr;
    this.world.scale.setScalar(k);
    this.st.layout(x, y, W, H, unitPx);
    // the overlay covers the stage plus a row for the watch icon
    this.ow = Math.ceil(this.st.css.w / this.uc); this.oh = Math.ceil(this.st.css.h / this.uc) + 22;
    // the string: whatever room is left above the pump's cap once the full balloon fits
    const room = -TIE_AT[1] * k * unitPx / u2;
    this.vit.rigMode(this.ow, this.oh, Math.max(5, Math.min(18, room - 28)));
    this.cvV.width = this.ow; this.cvV.height = this.oh;
    const sz = (el: HTMLCanvasElement, w: number, h: number, ox: number, oy: number) => {
      el.style.width = w * this.uc + 'px'; el.style.height = h * this.uc + 'px';
      el.style.transform = `translate(${snap(ox)}px, ${snap(oy)}px)`;
    };
    sz(this.cvV, this.ow, this.oh, x, y);
    // the moodles: right of the watch icon, under the console
    const cols = Math.max(3, Math.floor((this.ow - 26) / SLOT));
    this.tray.setCols(Math.min(8, cols));
    if (this.cvT.width !== this.tray.W) { this.cvT.width = this.tray.W; this.cvT.height = this.tray.H; }
    const bx = this.rigToOvX(BRAIN_AT[0]);
    sz(this.cvT, this.tray.W, this.tray.H, x + (bx + 12 - PAD) * this.uc, y + (this.oh - 21 - PAD) * this.uc);
    const bottom = y + (this.oh + Math.max(0, this.tray.rows - 1) * SLOT) * this.uc;
    document.documentElement.style.setProperty('--hud-tl-bottom', Math.round(bottom) + 'px');
    document.documentElement.style.setProperty('--hud-tl-right', Math.round(x + this.st.css.w) + 'px');
    document.documentElement.style.setProperty('--hud-lab', Math.max(12, Math.min(16, Math.round(CON_H * k * unitPx / dpr * 0.62))) + 'px');
  }
  private rigToOvX(x: number) { this.world.updateMatrixWorld(true); return Math.round(this.rigToOv(x, CON_TOP).x); }

  // =================================================================== input
  private pickAt(cx: number, cy: number): Hover {
    if (!this.shown || this.st.fade < 0.5) return NONE;
    // the pixel overlay first (brain, balloon, watch icon), then the moodles, then the machine
    const ox = (cx - this.st.css.x) / this.uc, oy = (cy - this.st.css.y) / this.uc;
    if (ox >= 0 && oy >= 0 && ox < this.ow && oy < this.oh) {
      const k = this.vit.pick(ox, oy, false);
      if (k === 'brain' || k === 'balloon' || k === 'watch') { if (k !== 'balloon' || !this.board.open) return { ...NONE, kind: k, key: k }; }
    }
    const tb = this.cvT.getBoundingClientRect();
    const it = this.tray.pick((cx - tb.left) / this.uc, (cy - tb.top) / this.uc);
    if (it && cx >= tb.left && cy >= tb.top) return { ...NONE, kind: 'moodle', key: it.key };
    this.world.updateMatrixWorld(true);
    const targets: THREE.Object3D[] = [...this.board.hits, this.heartV.hit, this.lungV.hit, this.lungV.gaugeHit, this.jarV.hit, this.rig.packHit];
    const h = this.st.pick(cx, cy, targets);
    if (!h) return NONE;
    const o = h.object;
    const slot = this.board.slotOf(o);
    if (slot >= 0) return { kind: 'tool', inj: this.boardInj, slot, key: '' };
    if (o === this.heartV.hit) return { kind: 'bag', inj: this.heartV.holeUnder(h.point), slot: -1, key: '' };
    if (o === this.lungV.hit) return { ...NONE, kind: 'lung' };
    if (o === this.lungV.gaugeHit) return { ...NONE, kind: 'gauge' };
    if (o === this.rig.packHit) return { ...NONE, kind: 'pack' };
    return { ...NONE, kind: 'jar' };
  }
  private setOver(on: boolean) {
    if (on === this.overUI) return;
    this.overUI = on;
    if (G.input) G.input.pointerOverUI = on;
    document.body.classList.toggle('bh-hover', on);
  }
  private onMove(e: PointerEvent) {
    if (this.down) {
      const d = this.down;
      const dx = e.clientX - d.x;
      d.moved = Math.max(d.moved, Math.hypot(dx, e.clientY - d.y));
      if (d.kind === 'bag' && d.moved > 6) { this.heartV.kick((dx - this.flick) * 0.01); this.flick = dx; }
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (e.pointerType === 'touch') return;
    const h = this.pickAt(e.clientX, e.clientY);
    if (h.kind !== this.hover.kind || h.key !== this.hover.key || h.inj !== this.hover.inj) { this.hover = h; if (h.kind) this.pinT = 0; }
    this.board.hover = h.kind === 'tool' ? h.slot : -1;
    this.setOver(!!h.kind);
  }
  private onDown(e: PointerEvent) {
    const h = this.pickAt(e.clientX, e.clientY);
    if (!h.kind) { if (this.boardInj && e.button === 0) this.closeBoard(); return; }
    e.preventDefault(); e.stopPropagation();
    const p = G.local; if (!p) return;
    this.hover = h;
    this.down = { kind: h.kind, x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId, inj: h.inj };
    this.flick = 0;
    const touch = e.pointerType === 'touch';
    if (touch) this.pinT = 3;
    // every touch on the machine nudges it a little
    if (h.kind !== 'moodle' && h.kind !== 'watch') { const sp = this.st.toStage(e.clientX, e.clientY, new THREE.Vector2()); this.rig.poke(sp.x / this.k, sp.y / this.k, h.kind === 'pack' ? 0.4 : 0.2); }
    if (h.kind === 'pack') { this.openPack(); this.down = null; return; }
    if (h.kind === 'watch') { this.down = null; const w: any = (G as any).watch; if (w?.toggle) w.toggle(true); return; }
    if (h.kind === 'lung' || h.kind === 'gauge' || h.kind === 'balloon') { this.pumpPress(); this.lungs.wob = 0.6; if (h.kind === 'balloon') { this.vit.jolt((Math.random() - 0.5) * 50, -30); G.audio?.ui?.('hud_squeak', 0.3); } else G.audio?.ui?.('bh_squelch', 0.2); }
    else if (h.kind === 'brain') { this.vit.scare(0.3); G.audio?.ui?.('bh_squelch', 0.2); }
    else if (h.kind === 'moodle') G.audio?.ui?.('band_tick', 0.2);
    else if (h.kind === 'tool') { const o = this.board.slots[h.slot]?.opt; if (o && this.boardInj) this.runOpt(o); }
    else if (h.kind === 'jar') { this.zoomT = 2.6; this.jar.poke(); G.audio?.ui?.('bh_plop', 0.25); }
    else if (h.kind === 'bag') {
      // a puncture: the next sensible thing (or the pegboard); the heart itself: the worst wound's
      const inj = h.inj ?? this.worstWound(p);
      if (inj) {
        const opts = treatOptions(p, inj);
        const best = bestTreatment(inj, opts);
        if (!touch && e.button === 0 && best && this.boardInj !== inj) { this.boardInj = inj; this.runOpt(best); }
        else this.openBoard(inj, opts, best);
      } else this.heartV.kick((Math.random() - 0.5) * 1.6);
    }
  }
  private worstWound(p: Player): Injury | null {
    const b = p.body;
    return b.allInjuries().filter((i) => i.type !== 'bruise').sort((a, c) => b.injuryBleed(c) - b.injuryBleed(a) || c.infection - a.infection || c.sev - a.sev)[0] ?? null;
  }
  private onUp(e: PointerEvent) {
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    this.down = null;
    e.preventDefault(); e.stopPropagation();
    if (e.pointerType === 'touch') { this.setOver(false); }
  }
  private runOpt(o: TreatOpt) {
    if (!o.run) { G.audio?.ui?.('band_tick', 0.3); return; }
    o.run();
    G.audio?.ui?.('bh_wrap', 0.35);
    this.closeBoard();
  }
  private openBoard(inj: Injury, opts: TreatOpt[], best: TreatOpt | null) {
    this.boardInj = inj; this.boardT = 8;
    this.board.show(opts.slice(0, 6), best);
    G.audio?.ui?.('bh_squelch', 0.3);
  }
  private closeBoard() { if (!this.boardInj && !this.board.open) return; this.boardInj = null; this.board.hide(); }

  // =================================================================== free-floating type (no box), under the machine
  private setSay(html: string) {
    if (html === this.sayKey) return;
    this.sayKey = html;
    this.say.innerHTML = html;
    this.say.classList.toggle('on', !!html);
  }
  private line(title: string, color: number | null, ...rest: string[]) {
    return `<b${color != null ? ` style="color:${hex(color)}"` : ''}>${esc(title)}</b>` + rest.filter(Boolean).map((r) => `<br>${esc(r)}`).join('');
  }
  private updateSay(p: Player, _dt: number) {
    const top = Math.round(this.st.css.y + (this.oh + Math.max(0, this.tray.rows - 1) * SLOT + 2) * this.uc) + 'px';
    const left = Math.round(this.st.css.x + 4) + 'px';
    if (this.say.style.left !== left) this.say.style.left = left;
    if (this.say.style.top !== top) this.say.style.top = top;
    const b = p.body, h = this.hover, T = this.touch;
    if (T && this.pinT <= 0 && !this.lungs.pumping) this.hover = NONE;
    let html = '';
    if (h.kind === 'pack') html = this.line('Backpack', null, T ? 'tap to open' : 'click to open  ·  I');
    else if (h.kind === 'tool') {
      const o = this.board.slots[h.slot]?.opt;
      if (o) html = this.line(o.label, null, o.missing ? 'needs ' + o.missing : o.using ? o.using.toLowerCase() : '');
    } else if (h.kind === 'bag') {
      const inj = h.inj;
      const H = this.vit.heart;
      if (inj) {
        const r = b.injuryBleed(inj);
        const t = woundTitle(inj).split(' · ');
        const best = bestTreatment(inj, treatOptions(p, inj));
        html = this.line(`${t[0]}, ${t[1].toLowerCase()}`, r > 0.15 ? 0xff7a5a : null, r > 0.5 ? 'pouring' : r > 0.15 ? 'bleeding' : r > 0.01 ? 'oozing' : inj.infection > 0.15 ? 'infected' : '', best ? `${T ? 'tap' : 'click'}: ${best.label.toLowerCase()}${best.using ? ' with ' + best.using.toLowerCase() : ''}` : 'you have nothing for it');
      } else {
        const hp = Math.round(b.health);
        const pump = b.dead ? 'stopped' : H.stutter > 0.4 ? 'stuttering' : hp < 35 ? 'weak and racing' : hp < 65 ? 'labouring' : 'strong';
        const n = b.allInjuries().filter((i) => i.type !== 'bruise').length;
        const bits: string[] = [];
        if (b.fever() > 0.15) bits.push('infected');
        if (b.sickness > 20) bits.push('poisoned');
        html = this.line(`Health ${hp}  ·  heart ${Math.round(H.rate)} bpm, ${pump}`, hp < 30 ? 0xff6a5a : null, `blood ${Math.round(b.blood)}%  ·  ${n ? `${n} wound${n > 1 ? 's' : ''}` : 'no wounds'}${bits.length ? '  ·  ' + bits.join(', ') : ''}`, n ? `${T ? 'tap' : 'click'} a puncture to treat it` : '');
      }
    } else if (h.kind === 'lung' || h.kind === 'gauge' || h.kind === 'balloon') {
      const st = Math.round(b.endurance * 100);
      html = this.lungs.pumping
        ? this.line('Breathe', 0x9ad8ff, 'press as the needle hits OUT, then IN', this.lungs.combo > 1 ? `${this.lungs.combo} in a row` : '')
        : this.line(`Air ${st}%`, st < 15 ? 0xff8a6a : null, st < 15 ? 'spent: stop running and catch your breath' : p.running ? 'running lets the air out of the balloon' : this.lungs.stain > 0.05 ? 'blood in the lungs: cough it up' : 'it fills back up while you walk or rest', `H${T ? ' or a thumb' : ''}: breathe on the beat`);
    } else if (h.kind === 'jar') {
      const hu = b.hunger, th = b.thirst;
      const bits = [`water ${th < 20 ? 'fine' : th < 45 ? 'low' : th < 70 ? 'thirsty' : 'parched'}`];
      if (b.sickness > 20) bits.push('nauseous');
      if (this.recent.length) bits.push('in it: ' + this.recent.join(', '));
      if (this.jar.acid > 0.32) bits.push('acid rising');
      if (this.jar.poisoned) bits.push('cracked');
      html = this.line(`Food ${Math.round(100 - hu)}  ·  ${hu < 15 ? 'full' : hu < 30 ? 'fed' : hu < 50 ? 'peckish' : hu < 75 ? 'hungry' : 'starving'}${this.jar.canEat() ? '' : '  ·  no room for more'}`, hu > 70 || th > 70 ? 0xffb46a : null, bits.join('  ·  '));
    } else if (h.kind === 'brain') {
      const s = Math.round(this.sanity(p));
      const word = s > 85 ? 'steady' : s > 65 ? 'uneasy' : s > 45 ? 'frayed' : s > 25 ? 'unravelling' : 'breaking';
      const m: any = (b as any).mind || {};
      const pn = b.panic > 75 ? 'terrified' : b.panic > 50 ? 'panicking' : b.panic > 25 ? 'on edge' : 'calm';
      html = this.line(`Mind ${s}  ·  ${word}`, s < 30 ? 0xc8a0ff : null, `${pn}  ·  pulse ${Math.round(this.vit.heart.rate)}${(m.attack ?? 0) > 0 ? '  ·  panic attack' : ''}`, b.panic > 30 || s < 50 ? `light, people and slow breathing help${T ? '' : '  ·  H'}` : '');
    } else if (h.kind === 'moodle') {
      const it = this.tray.items.find((i) => i.key === h.key);
      if (it) html = this.line(it.name, MoodleTray.tint(it.level, it.good), it.desc);
    } else if (h.kind === 'watch') {
      html = this.line('Watch', 0x9affb4, `${T ? 'tap' : 'click'} to raise it  ·  Tab`);
    }
    if (!html) {
      // nothing hovered: the watch's note types out here, or the pump's beat while you breathe
      // (the watch's notes no longer type out on the HUD: the wrist chimes, Tab reads them)
      if (this.lungs.pumping) html = this.line('Breathe', 0x9ad8ff, `${T ? 'PUMP' : 'H'} as the needle hits OUT, then IN`);
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

// The body HUD (G.hudBody): one machine floating in the corner instead of bars,
// a life-support rig drawn in 3D through the game's own renderer (stage.ts).
// It hangs in the still air, drifting and bobbing, and it is sprung: hits,
// bites, gulps, footsteps, coughs and pokes knock it about (rig3d.ts).
// The IV blood bag on its mast is health and blood: every wound is a hole in
// it, dripping or pouring; click / tap a hole to treat it (a first-aid
// pegboard swings in with what you could use). The breathing pump is stamina:
// a bellows in a glass canister (lung3d.ts); H (or a thumb on it) pumps it on
// the beat of the air meter. The digester is the stomach and the water
// (jar3d.ts). The rucksack on its end opens the backpack. Hover anything for
// a line of free-floating type.
//
// API: pumpPress(), pumping, canEat(), lungs / jar (sims), eatStart(action) /
// drinkStart(action) (first-person close-ups, eatFp.ts), vomit(p),
// setHidden(key, on), warm(secs), holeScreen(inj), why.
import './body.css';
import './sounds';
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { fpOwner } from '../../fp/fp';

const FULL_FP = new Set(['pack', 'inspect', 'bench', 'cook', 'trade', 'dominion', 'surgery', 'remote']);
import type { Player } from '../../entities/player';
import type { Injury } from '../../survival/body';
import { Lungs, type PumpResult } from './lung';
import { Jar } from './jar';
import { BodyStage, Cubes } from './stage';
import { Rig3D, SW, SH, CON_TOP, BAG_AT, PUMP_AT, JAR_AT } from './rig3d';
import { Bag3D } from './bag3d';
import { Lung3D } from './lung3d';
import { Jar3D } from './jar3d';
import { Board3D } from './board3d';
import { treatOptions, bestTreatment, woundTitle, type TreatOpt } from './treat';
import { breathHit, breathDone } from '../../survival/mindSystem';
import { ensureMind } from '../../survival/mind';
import { shake } from '../../gfx/juice';
import { fontsReady } from '../../gfx/crt';
import { itemDef } from '../../items/item';
import { EatFp } from './eatFp';

/** the pegboard swings in over the pump */
const BOARD_AT: [number, number] = [PUMP_AT[0] + 2, -10];

type Kind = 'bag' | 'lung' | 'gauge' | 'jar' | 'tool' | 'pack';
interface Hover { kind: Kind | null; inj: Injury | null; slot: number }

export class BodyHud {
  name = 'hudBody';
  readonly lungs = new Lungs();
  readonly jar = new Jar();
  readonly eat: EatFp;
  readonly st = new BodyStage();
  private world = new THREE.Group();
  private bagV: Bag3D; private lungV: Lung3D; private jarV: Jar3D; private board: Board3D;
  readonly rig: Rig3D;
  private runT = 0; private lastLidV = 0; private lastSquish = 0;
  private cubes: Cubes;
  private say: HTMLDivElement;
  private sayKey = '';
  private shown = false;
  private hidden = new Set<string>();
  private beatT = 0;
  private hover: Hover = { kind: null, inj: null, slot: -1 };
  private boardInj: Injury | null = null;
  private boardT = 0;
  private sig = new Map<number, string>();
  private coughCd = 0;
  private pumpAttack = false;
  private lastV = { x: 0, z: 0 };
  private deadT = 0;
  private bodyOf: Player | null = null;
  private k = 1; private touch = false;
  private layoutT = 0;
  private baseY = 0;
  private barEl: HTMLElement | null = null;
  private down: { kind: Kind; x: number; y: number; moved: number; id: number; inj: Injury | null } | null = null;
  private overUI = false;
  private zoomT = 0;
  private flick = 0;
  private recent: string[] = [];
  private sparks: { x: number; y: number; t: number; c: number }[] = [];
  private v = new THREE.Vector3();
  /** why the HUD is hidden right now ('' when shown; for tests) */
  why = '';

  constructor() {
    const st = this.st;
    st.scene.add(this.world);
    // one machine: everything rides the rig's floating frame
    this.rig = new Rig3D(st);
    this.world.add(this.rig.pivot);
    const R = this.rig.inner;
    this.bagV = new Bag3D(st, false); this.lungV = new Lung3D(st); this.jarV = new Jar3D(st); this.board = new Board3D(st);
    R.add(this.bagV.root, this.lungV.root, this.jarV.root, this.board.root);
    this.bagV.root.position.set(BAG_AT[0], BAG_AT[1], 0);
    this.lungV.root.position.set(PUMP_AT[0], PUMP_AT[1], 0);
    this.jarV.root.position.set(JAR_AT[0], JAR_AT[1], 0);
    // the pegboard hangs in front of the pump while you pick a treatment
    this.board.root.position.set(BOARD_AT[0], BOARD_AT[1], 16);
    this.bagV.floorY = CON_TOP;
    this.cubes = new Cubes(260, st.cubeMat);
    R.add(this.cubes.mesh);

    const say = this.say = document.createElement('div');
    say.className = 'bh-say nc-free-text';
    say.setAttribute('role', 'status');
    document.body.appendChild(say);
    this.eat = new EatFp(this);
    this.relayout();
    window.addEventListener('resize', () => this.relayout());
    bus.on('uiScale', () => this.relayout());
    fontsReady().then(() => { this.lungV.repaintType(); this.jarV.repaintType(); this.rig.repaintType(); });

    // ---- pointer: the world never sees a press that lands on a prop
    window.addEventListener('pointerdown', (e) => this.onDown(e), true);
    window.addEventListener('pointermove', (e) => this.onMove(e), true);
    window.addEventListener('pointerup', (e) => this.onUp(e), true);
    window.addEventListener('pointercancel', (e) => this.onUp(e), true);
    window.addEventListener('contextmenu', (e) => { if (this.pickAt(e.clientX, e.clientY).kind) e.preventDefault(); }, true);

    // ---- the world reaches the body
    bus.on('playerHit', (p: Player, _part: string, _kind: string, h: any) => {
      if (!p?.isLocal) return;
      const k = Math.min(1, (Number(h?.dmg) || 8) / 22);
      this.bagV.kick((Math.random() - 0.5) * 3 * (0.5 + k), 0.4 + k);
      // the whole rig takes the blow: it lurches, rolls and rings back
      this.rig.kick((Math.random() - 0.5) * 30 * (0.4 + k), -(14 + 26 * k), (Math.random() - 0.5) * 1.6 * (0.4 + k));
      this.jarV.kick(0.5 + k);
    });
    bus.on('bloodied', (p: Player, _part: string, amt: number) => { if (p?.isLocal) this.lungs.splash(Math.min(0.2, (Number(amt) || 0.5) * 0.09)); });
    bus.on('creatureKilled', (c: any) => {
      const p = G.local; if (!p || !c || c.zoneKey !== p.zoneKey) return;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 2.6 && (G.sandbox?.gore ?? 1) > 0) this.lungs.splash(0.14 * (1 - d / 2.6) + 0.04);
    });
    bus.on('consumed', (p: Player, key: string) => { if (p?.isLocal && !this.eat.active && key) this.jar.pill(0xe8e0d0); });
    bus.on('death', (p: Player) => { if (p?.isLocal) { this.bagV.kick(1.5, 1); this.rig.kick(0, -40, 1.2); } });
    bus.on('cough', (p: Player) => { if (p?.isLocal) this.rig.kick((Math.random() - 0.5) * 8, 10, (Math.random() - 0.5) * 0.6); });
    bus.on('vomit', (p: Player) => { if (p?.isLocal) { this.rig.kick(0, -22, (Math.random() - 0.5) * 1.4); this.jarV.kick(2); } });

    G.addSystem({ name: 'hudBody', update: (dt) => this.update(dt) });
    (G as any).hudBody = this;
  }

  // =================================================================== API
  get pumping(): boolean { return this.lungs.pumping; }
  canEat(): boolean { return this.jar.canEat(); }
  setHidden(key: string, on: boolean) { if (on) this.hidden.add(key); else this.hidden.delete(key); }
  /** H, the scanner's breathe button, a thumb on the lungs */
  pumpPress() {
    const p = G.local; if (!p || p.body.dead) return;
    const wasOn = this.lungs.pumping;
    this.onPump(p, this.lungs.press(), wasOn);
  }
  eatStart(a: any): boolean { const ok = this.eat.startEat(a); if (ok && a?.it) this.noteFood(a.it.key); return ok; }
  drinkStart(a: any): boolean { return this.eat.startDrink(a); }
  /** tests / screenshots: run the objects forward */
  warm(secs = 2) { const p = G.local; if (!p) return; for (let t = 0; t < secs; t += 1 / 30) this.step(1 / 30, p); }
  /** where a wound's hole is on screen (CSS px) */
  holeScreen(inj: Injury): { x: number; y: number } {
    this.world.updateMatrixWorld(true);
    const w = this.bagV.holeWorld(inj, this.v);
    return this.st.toScreen(w.x, w.y);
  }
  /** a prop's centre on screen (CSS px), for tests and pointers ('lung' is the breathing pump, 'jar' the digester) */
  propScreen(kind: 'bag' | 'lung' | 'jar' | 'pack'): { x: number; y: number } {
    this.world.updateMatrixWorld(true);
    const o = kind === 'bag' ? this.bagV.hit : kind === 'lung' ? this.lungV.hit : kind === 'jar' ? this.jarV.hit : this.rig.packHit;
    o.getWorldPosition(this.v);
    return this.st.toScreen(this.v.x, this.v.y);
  }
  /** open the backpack (the rucksack on the rig) */
  openPack() {
    G.audio?.ui?.('bh_squelch', 0.3);
    const inv: any = (G as any).ui?.inventory;
    if (inv?.toggle) inv.toggle(true);
  }
  /** the jar's mouth on screen (eating aims the bites there) */
  jarScreen(): { x: number; y: number } {
    this.world.updateMatrixWorld(true);
    const w = this.jarV.topWorld(this.v);
    return this.st.toScreen(w.x, w.y);
  }
  private noteFood(key: string) {
    try { this.recent.unshift(itemDef(key).name.toLowerCase()); } catch { this.recent.unshift(key.replace(/_/g, ' ')); }
    this.recent = [...new Set(this.recent)].slice(0, 3);
  }

  // =================================================================== per frame
  private update(dt: number) {
    const p = G.local;
    // full first-person close-ups get the whole picture: the watch held up to the eye, the cube,
    // the bench, cooking, trading, surgery (eating keeps the jar in view: bites land in it)
    const fp = fpOwner();
    const w: any = (G as any).watch;
    this.setHidden('fp', !!fp && (FULL_FP.has(fp) || (fp === 'watch' && !!w?.open && !w?.small)));
    const intro: any = G.systems.find((s) => s.name === 'intro');
    const introOn = !!intro && intro.phase !== 'done' && !intro.done && !intro.finished;
    const show = !!p && !G.attract && !introOn && !this.hidden.size && !document.body.classList.contains('photo-mode') && this.deadT < 6;
    this.why = !p ? 'nobody' : G.attract ? 'attract' : introOn ? 'intro' : this.hidden.size ? [...this.hidden].join(',') : this.deadT >= 6 ? 'dead' : show ? '' : 'photo';
    if (show !== this.shown) {
      this.shown = show;
      if (!show) { this.closeBoard(); this.setSay(''); this.setOver(false); }
    }
    this.st.fade += ((show ? 1 : 0) - this.st.fade) * Math.min(1, dt * 6);
    if (!p) return;
    this.layoutT -= dt;
    if (this.layoutT <= 0) { this.layoutT = 1; this.relayout(); }
    if (p !== this.bodyOf) { this.bodyOf = p; this.deadT = 0; this.sig.clear(); }
    if (p.body.dead) this.deadT += dt; else this.deadT = 0;
    this.step(dt, p);
    // it floats: the shadow falls further as it rises
    const lift = Math.max(0, -this.rig.lift + 4) * this.st.detail * 0.5;
    this.st.shadow.set(1 + Math.round(lift * 0.4), 3 + Math.round(lift));
    this.eat.update(dt);
    // a first-person cut's cinema bar slides up over the corner: the shelf rides up above it
    if (!this.touch) {
      if (!this.barEl) this.barEl = document.querySelector('.fp-cut .b');
      const bar = this.barEl ? (parseFloat(this.barEl.style.height) || 0) * window.innerHeight / 100 : 0;
      this.st.css.y = this.baseY - bar;
    }
    if (this.boardInj) { this.boardT -= dt; if ((this.boardT <= 0 && this.hover.kind !== 'tool') || !p.body.allInjuries().includes(this.boardInj)) this.closeBoard(); }
    if (show && this.hover.kind) this.updateSay(p);
  }

  private step(dt: number, p: Player) {
    const b = p.body;
    // the rig: footsteps jolt it while you run, every bite and gulp lands with a bump
    this.rig.update(dt, b.dead);
    if (p.running && (p.speed ?? 0) > 0.5) { this.runT -= dt; if (this.runT <= 0) { this.runT = 0.32; this.rig.kick((Math.random() - 0.5) * 6, -8, (Math.random() - 0.5) * 0.25); } }
    if (this.jar.lidV < this.lastLidV - 12) { this.rig.kick((Math.random() - 0.5) * 4, -10, (Math.random() - 0.5) * 0.4); this.jarV.kick(1); }
    this.lastLidV = this.jar.lidV;
    this.rig.packHover = this.hover.kind === 'pack' ? 1 : 0;
    // the fluorescent tube over the shelf hums and now and then dips (more when you are scared)
    const fear = Math.max(0, (b.panic - 40) / 60);
    this.st.uLight.value = Math.random() < dt * (0.15 + fear * 2) ? 0.72 : Math.min(1, this.st.uLight.value + dt * 6);
    // heartbeat: the drip chamber and a pulse in the bag
    const bpm = b.dead ? 0 : (G.survival?.mind?.bpm ?? 70);
    if (bpm > 0) { this.beatT += dt * bpm / 60; if (this.beatT >= 1) { this.beatT -= 1; this.bagV.beat(bpm > 110 ? 1.5 : 1); } }
    // the bag swings as you start, stop and turn
    const ax = (p.vx ?? 0) - this.lastV.x, az = (p.vz ?? 0) - this.lastV.z;
    this.lastV.x = p.vx ?? 0; this.lastV.z = p.vz ?? 0;
    const yaw = G.pr?.yaw ?? 0;
    const sx = ax * Math.cos(yaw) - az * Math.sin(yaw);
    if (Math.abs(sx) > 0.05) this.bagV.kick(-sx * 0.35, Math.abs(sx) > 1.5 ? 0.15 : 0);
    if (p.running && Math.random() < dt * 3) this.bagV.kick((Math.random() - 0.5) * 0.4, 0.05);
    this.bagV.hover = this.hover.kind === 'bag' ? this.hover.inj : this.boardInj;
    this.bagV.update(dt, p);
    const exertion = p.running ? 1 : (p.speed ?? 0) > 0.5 ? 0.3 : 0;
    if (p.running && Math.random() < dt * 4) this.lungs.sv += (Math.random() - 0.5) * 0.6;
    const want = this.down && (this.down.kind === 'lung' || this.down.kind === 'gauge') ? 1 : 0;
    this.lungs.squeeze += (want - this.lungs.squeeze) * Math.min(1, dt * 18);
    const ev = this.lungs.update(dt, p, exertion);
    if (ev === 'miss') G.audio?.ui?.('band_tick', 0.25);
    if (ev === 'end') this.pumpEnded(p);
    this.lungV.update(dt, this.lungs, p, this.lungs.panic);
    if (this.jar.update(dt, p) === 'gurgle') { G.audio?.ui?.('bh_gurgle', 0.5); this.jarV.kick(0.4); }
    this.zoomT = Math.max(0, this.zoomT - dt);
    this.jarV.zoom += ((this.zoomT > 0 ? 1 : 0) - this.jarV.zoom) * Math.min(1, dt * 8);
    this.jarV.update(dt, this.jar, p);
    this.board.update(dt);
    this.applyBody(dt, p);
    this.watchWounds(p);
    // one batch of little cubes: drops, puffs, chunks, bubbles, sparks
    this.world.updateMatrixWorld(true);
    const C = this.cubes;
    C.begin();
    this.bagV.cubes(C); this.lungV.cubes(C, this.lungs); this.jarV.cubes(C, this.jar);
    for (const s of this.sparks) if (s.t > 0) { s.t -= dt; s.y += dt * 8; C.put(s.x, s.y, 6, 0.8, 0.8, 0.8, s.t * 9, s.c, Math.min(1, s.t * 4)); }
    if (this.sparks.length && this.sparks[0].t <= 0) this.sparks = this.sparks.filter((s) => s.t > 0);
    C.end();
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

  /** a treatment landed: sparks on the hole, a rip of tape, the bag jolts */
  private watchWounds(p: Player) {
    for (const inj of p.body.allInjuries()) {
      const s = `${inj.bandage ? (inj.bandage.clean ? 'B' : 'b') : ''}${inj.stitched ? 'S' : ''}${inj.splinted ? 'P' : ''}${inj.disinfected > 0 ? 'D' : ''}${inj.foreign ? 'F' : ''}${inj.tq != null ? 'T' : ''}${inj.caut ? 'C' : ''}`;
      const prev = this.sig.get(inj.id);
      if (prev !== undefined && prev !== s && s.length >= prev.length - (prev.includes('F') && !s.includes('F') ? 1 : 0)) {
        const w = this.rig.inner.worldToLocal(this.bagV.holeWorld(inj, this.v));
        for (let i = 0; i < 8; i++) this.sparks.push({ x: w.x + Math.cos(i * 0.785) * 2.4, y: w.y + Math.sin(i * 0.785) * 2.4, t: 0.35 + i * 0.02, c: i % 2 ? 0xffffff : 0xfff0a0 });
        if (this.sparks.length > 40) this.sparks.splice(0, this.sparks.length - 40);
        G.audio?.ui?.(s.includes('B') && !prev.includes('B') ? 'bh_tape' : 'bh_squelch', 0.45);
        this.bagV.kick(0.6, 0.2);
      }
      this.sig.set(inj.id, s);
    }
  }

  // =================================================================== layout
  private relayout() {
    const touch = document.documentElement.classList.contains('nc-touch');
    const dpr = G.pr?.dpr ?? Math.min(2, window.devicePixelRatio || 1);
    const game = G.pr?.scale ?? 2;
    const k = touch ? 1.45 : 1.3;
    const W = Math.round(SW * k), H = Math.round(SH * k);
    // the game's pixel size, but never more than about a quarter of the screen's width
    const unitPx = touch ? Math.max(1, game) : Math.max(1, Math.min(game, Math.floor(window.innerWidth * dpr * 0.27 / W)));
    const cw = W * unitPx / dpr, ch = H * unitPx / dpr;
    const x = touch ? Math.round((window.innerWidth - cw) / 2) : Math.round(window.innerWidth - cw - 8);
    const y = touch ? 2 : Math.round(window.innerHeight - ch - 4);
    if (touch === this.touch && k === this.k && x === this.st.css.x && y === this.baseY && unitPx === this.st.px && W === this.st.W) return;
    this.touch = touch; this.k = k; this.baseY = y;
    this.world.scale.setScalar(k);
    this.st.layout(x, y, W, H, unitPx);
  }

  // =================================================================== input
  private pickAt(cx: number, cy: number): Hover {
    if (!this.shown || this.st.fade < 0.5) return { kind: null, inj: null, slot: -1 };
    this.world.updateMatrixWorld(true);
    const targets: THREE.Object3D[] = [...this.board.hits, this.bagV.hit, this.lungV.hit, this.lungV.gaugeHit, this.jarV.hit, this.rig.packHit];
    const h = this.st.pick(cx, cy, targets);
    if (!h) return { kind: null, inj: null, slot: -1 };
    const o = h.object;
    const slot = this.board.slotOf(o);
    if (slot >= 0) return { kind: 'tool', inj: this.boardInj, slot };
    if (o === this.bagV.hit) return { kind: 'bag', inj: this.bagV.holeUnder(h.point), slot: -1 };
    if (o === this.lungV.hit) return { kind: 'lung', inj: null, slot: -1 };
    if (o === this.lungV.gaugeHit) return { kind: 'gauge', inj: null, slot: -1 };
    if (o === this.rig.packHit) return { kind: 'pack', inj: null, slot: -1 };
    return { kind: 'jar', inj: null, slot: -1 };
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
      // flicking the bag: it swings after your finger
      if (d.kind === 'bag' && d.moved > 6) { this.bagV.kick((dx - this.flick) * 0.012, 0.05); this.flick = dx; }
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (e.pointerType === 'touch') return;
    const h = this.pickAt(e.clientX, e.clientY);
    this.hover = h;
    this.board.hover = h.kind === 'tool' ? h.slot : -1;
    this.setOver(!!h.kind);
    if (!h.kind) this.setSay('');
    else if (G.local) this.updateSay(G.local);
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
    // every touch wobbles the rig a little
    const sp = this.st.toStage(e.clientX, e.clientY, new THREE.Vector2());
    this.rig.poke(sp.x / this.k, sp.y / this.k, h.kind === 'pack' ? 0.6 : 0.35);
    if (h.kind === 'pack') { this.openPack(); this.down = null; return; }
    if (h.kind === 'lung' || h.kind === 'gauge') { this.pumpPress(); this.lungs.wob = 0.6; G.audio?.ui?.('bh_squelch', 0.2); }
    else if (h.kind === 'tool') { const o = this.board.slots[h.slot]?.opt; if (o && this.boardInj) this.runOpt(o); }
    else if (h.kind === 'jar') { this.zoomT = 2.6; this.jar.poke(); G.audio?.ui?.('bh_plop', 0.25); }
    else if (h.kind === 'bag' && h.inj) {
      const opts = treatOptions(p, h.inj);
      const best = bestTreatment(h.inj, opts);
      // a plain click does the next sensible thing; right-click, a tap, or nothing doable shows the pegboard
      if (!touch && e.button === 0 && best && this.boardInj !== h.inj) { this.boardInj = h.inj; this.runOpt(best); }
      else this.openBoard(h.inj, opts, best);
    }
    if (touch) this.updateSay(p);
  }
  private onUp(e: PointerEvent) {
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    this.down = null;
    e.preventDefault(); e.stopPropagation();
    if (d.kind === 'bag' && !d.inj && d.moved < 6) { this.bagV.kick((Math.random() - 0.5) * 1.6, 0.4); G.audio?.ui?.('bh_squelch', 0.25); }
    if (e.pointerType === 'touch') { this.hover = { kind: null, inj: null, slot: -1 }; this.setOver(false); setTimeout(() => { if (!this.down) this.setSay(''); }, 1800); }
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

  // =================================================================== free-floating type (no box)
  private setSay(text: string, x = 0, y = 0) {
    if (text !== this.sayKey) { this.sayKey = text; this.say.textContent = text; }
    this.say.classList.toggle('on', !!text);
    if (text) { this.say.style.left = Math.round(x) + 'px'; this.say.style.top = Math.round(y) + 'px'; }
  }
  private updateSay(p: Player) {
    const b = p.body, h = this.hover;
    const lines: string[] = [];
    let at = { x: 0, y: 0 };
    const over = (o: THREE.Object3D, dy: number) => { o.getWorldPosition(this.v); return this.st.toScreen(this.v.x, this.v.y + dy * this.k); };
    if (h.kind === 'pack') {
      lines.push('Backpack');
      lines.push(`${this.touch ? 'tap' : 'click'} to open${this.touch ? '' : '  ·  I'}`);
      at = over(this.rig.packHit, 10);
    } else if (h.kind === 'tool') {
      const o = this.board.slots[h.slot]?.opt;
      if (o) lines.push(o.label + (o.missing ? ' — needs ' + o.missing : o.using ? ' — ' + o.using.toLowerCase() : ''));
      at = over(this.board.root, 4);
    } else if (h.kind === 'bag') {
      const inj = h.inj;
      if (inj) {
        const r = b.injuryBleed(inj);
        const t = woundTitle(inj).split(' · ');
        lines.push(`${t[0]}, ${t[1].toLowerCase()}` + (r > 0.5 ? ' — pouring' : r > 0.15 ? ' — bleeding' : r > 0.01 ? ' — oozing' : inj.infection > 0.15 ? ' — infected' : ''));
        const best = bestTreatment(inj, treatOptions(p, inj));
        lines.push(best ? `${this.touch ? 'tap' : 'click'}: ${best.label.toLowerCase()}${best.using ? ' with ' + best.using.toLowerCase() : ''}` : 'you have nothing for it');
      } else {
        lines.push(`Blood ${Math.round(b.blood)}%  ·  health ${Math.round(b.health)}%  ·  water ${Math.round(100 - b.thirst)}%`);
        const n = b.allInjuries().filter((i) => i.type !== 'bruise').length;
        const bits: string[] = [];
        if (b.fever() > 0.15) bits.push('infected');
        if (b.sickness > 20) bits.push('poisoned');
        if (b.corruption > 10) bits.push('corrupted');
        lines.push((n ? `${n} hole${n > 1 ? 's' : ''} in the bag` : 'no holes') + (bits.length ? '  ·  blood ' + bits.join(', ') : ''));
      }
      at = over(this.bagV.hit, 26);
    } else if (h.kind === 'lung' || h.kind === 'gauge') {
      lines.push(`Air ${Math.round(b.endurance * 100)}%` + (this.lungs.stain > 0.05 ? ' — blood in the lungs, cough it up' : ''));
      lines.push(this.lungs.pumping ? 'press as the needle hits OUT, then IN' : this.lungs.strain > 0.45 ? 'straining — H to pump it out' : `H${this.touch ? ' or a thumb' : ''}: breathe on the beat`);
      at = over(this.lungV.hit, 24);
    } else if (h.kind === 'jar') {
      const hu = b.hunger;
      lines.push(`Stomach ${hu < 15 ? 'full' : hu < 30 ? 'fed' : hu < 50 ? 'peckish' : hu < 75 ? 'hungry' : 'starving'}` + (this.jar.canEat() ? '' : ' — no room for more'));
      const bits: string[] = [];
      const th = b.thirst;
      bits.push(`water ${th < 20 ? 'fine' : th < 45 ? 'low' : th < 70 ? 'thirsty' : 'parched'}`);
      if (b.sickness > 20) bits.push('nauseous');
      if (this.recent.length) bits.push('in it: ' + this.recent.join(', '));
      if (this.jar.acid > 0.32) bits.push('acid rising');
      if (this.jar.poisoned) bits.push('cracked');
      if (bits.length) lines.push(bits.join('  ·  '));
      at = over(this.jarV.hit, 24);
    }
    this.setSay(lines.join('\n'), at.x, this.touch ? this.st.css.y + this.st.css.h + 4 : Math.max(4, Math.min(at.y, this.st.css.y) - 6));
  }
}

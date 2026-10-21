// The body HUD (G.hudBody): three physical objects in the corner instead of
// bars. The IV blood bag is health and blood (wounds are holes you click to
// treat), the lungs are stamina (H pumps them on the beat), the acid jar is the
// stomach. Drawn pixel by pixel into one small canvas, scaled up crisp.
//
// API: pumpPress(), pumping, canEat(), jar/bag/lungs, eatStart(action) /
// drinkStart(action) (first-person close-ups, eatFp.ts), setHidden(key, on),
// warm(secs) for tests and screenshots.
import './body.css';
import './sounds';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Player } from '../../entities/player';
import type { Injury } from '../../survival/body';
import { Pix } from './pix';
import { IvBag, BAG_W } from './ivBag';
import { Lungs, LUNG_W, type PumpResult } from './lung';
import { Jar, JAR_W, JAR_H } from './jar';
import { treatOptions, bestTreatment, woundTitle, type TreatOpt } from './treat';
import { breathHit, breathDone } from '../../survival/mindSystem';
import { ensureMind } from '../../survival/mind';
import { shake, pop } from '../../gfx/juice';
import { calm } from '../menus/settings';
import { EatFp } from './eatFp';

const GAP = 3;
const XB = 0, XL = BAG_W + GAP, XJ = BAG_W + GAP + LUNG_W + GAP;
const W = XJ + JAR_W, H = JAR_H;
type Cell = 'bag' | 'lung' | 'jar' | null;

export class BodyHud {
  name = 'hudBody';
  readonly bag = new IvBag();
  readonly lungs = new Lungs();
  readonly jar = new Jar();
  readonly eat: EatFp;
  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pix = new Pix(W, H);
  private tip: HTMLDivElement;
  private card: HTMLDivElement;
  private pops: HTMLDivElement;
  private k = 2;
  private shown = false;
  private hidden = new Set<string>();
  private drawT = 0;
  private beatT = 0;
  private hover: { cell: Cell; inj: Injury | null; x: number; y: number } = { cell: null, inj: null, x: 0, y: 0 };
  private cardInj: Injury | null = null;
  private cardT = 0;
  private sig = new Map<number, string>();
  private sparks: { x: number; y: number; t: number; c: number }[] = [];
  private coughCd = 0;
  private pumpAttack = false;
  private lastV = { x: 0, z: 0 };
  private deadT = 0;
  private bodyOf: Player | null = null;
  private touchT = 0;
  /** why the HUD is hidden right now ('' when shown; for tests) */
  why = '';

  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'bh bh-hidden';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Body: blood bag, lungs, stomach');
    el.innerHTML = '<canvas></canvas><div class="bh-pops"></div><div class="bh-tip" role="status"></div><div class="bh-card" role="menu"></div>';
    document.body.appendChild(el);
    this.canvas = el.querySelector('canvas') as HTMLCanvasElement;
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.tip = el.querySelector('.bh-tip') as HTMLDivElement;
    this.card = el.querySelector('.bh-card') as HTMLDivElement;
    this.pops = el.querySelector('.bh-pops') as HTMLDivElement;
    this.eat = new EatFp(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    bus.on('uiScale', () => this.resize());
    bus.on('uiSettings', () => this.resize());

    // ---- pointer: hover reads out, click treats / pumps
    const c = this.canvas;
    c.addEventListener('pointerenter', () => { if (G.input) G.input.pointerOverUI = true; });
    c.addEventListener('pointerleave', () => { if (G.input && !this.card.matches(':hover')) G.input.pointerOverUI = false; this.setHover(null, null, 0, 0); });
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.card.addEventListener('pointerenter', () => { if (G.input) G.input.pointerOverUI = true; });
    this.card.addEventListener('pointerleave', () => { if (G.input) G.input.pointerOverUI = false; });
    window.addEventListener('pointerdown', (e) => { if (this.cardInj && !this.el.contains(e.target as Node)) this.closeCard(); }, true);

    // ---- the world reaches the body
    bus.on('playerHit', (p: Player, _part: string, _kind: string, h: any) => {
      if (!p?.isLocal) return;
      const k = Math.min(1, (Number(h?.dmg) || 8) / 22);
      this.bag.slosh(0.4 + k); this.bag.swing((Math.random() - 0.5) * 2 * (0.5 + k));
    });
    bus.on('bloodied', (p: Player, _part: string, amt: number) => { if (p?.isLocal) this.lungs.splash(Math.min(0.2, (Number(amt) || 0.5) * 0.09)); });
    bus.on('creatureKilled', (c: any) => {
      const p = G.local; if (!p || !c || c.zoneKey !== p.zoneKey) return;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 2.6 && (G.sandbox?.gore ?? 1) > 0) this.lungs.splash(0.14 * (1 - d / 2.6) + 0.04);
    });
    bus.on('consumed', (p: Player, key: string) => { if (p?.isLocal && !this.eat.active && key) this.jar.pill(0xe8e0d0); });
    bus.on('death', (p: Player) => { if (p?.isLocal) this.bag.slosh(1); });

    G.addSystem({ name: 'hudBody', update: (dt) => this.update(dt) });
    (G as any).hudBody = this;
  }

  // =================================================================== API
  get pumping(): boolean { return this.lungs.pumping; }
  canEat(): boolean { return this.jar.canEat(); }
  setHidden(key: string, on: boolean) { if (on) this.hidden.add(key); else this.hidden.delete(key); }
  /** H, the scanner's breathe button, a tap on the lungs */
  pumpPress() {
    const p = G.local; if (!p || p.body.dead) return;
    const wasOn = this.lungs.pumping;
    const r = this.lungs.press();
    this.onPump(p, r, wasOn);
  }
  eatStart(a: any): boolean { return this.eat.startEat(a); }
  drinkStart(a: any): boolean { return this.eat.startDrink(a); }
  /** tests / screenshots: run the objects forward */
  warm(secs = 2) {
    const p = G.local; if (!p) return;
    for (let t = 0; t < secs; t += 1 / 30) this.step(1 / 30, p);
    this.drawT = 0;
  }

  // =================================================================== per frame
  private update(dt: number) {
    const p = G.local;
    const intro: any = G.systems.find((s) => s.name === 'intro');
    const introOn = !!intro && intro.phase !== 'done' && !intro.done && !intro.finished;
    const show = !!p && !G.attract && !introOn && !this.hidden.size && !document.body.classList.contains('photo-mode') && this.deadT < 6;
    this.why = !p ? 'nobody' : G.attract ? 'attract' : introOn ? 'intro' : this.hidden.size ? [...this.hidden].join(',') : this.deadT >= 6 ? 'dead' : show ? '' : 'photo';
    if (show !== this.shown) {
      this.shown = show;
      this.el.classList.toggle('bh-hidden', !show);
      if (!show) { this.closeCard(); this.setHover(null, null, 0, 0); if (G.input && this.el.matches(':hover')) G.input.pointerOverUI = false; }
    }
    if (!p) return;
    // touch mode can switch on after we were built (first touch): re-place
    this.touchT -= dt;
    if (this.touchT <= 0) { this.touchT = 1; if (document.documentElement.classList.contains('nc-touch') !== this.el.classList.contains('bh-touch')) this.resize(); }
    if (p !== this.bodyOf) { this.bodyOf = p; this.deadT = 0; this.sig.clear(); }
    if (p.body.dead) this.deadT += dt; else this.deadT = 0;
    this.step(dt, p);
    this.eat.update(dt);
    if (!show) return;
    if (this.cardInj) { this.cardT -= dt; if (this.cardT <= 0 && !this.card.matches(':hover')) this.closeCard(); else if (!p.body.allInjuries().includes(this.cardInj)) this.closeCard(); }
    this.drawT -= dt;
    if (this.drawT > 0) return;
    this.drawT = calm() ? 1 / 15 : 1 / 30;
    this.draw(p);
  }

  private step(dt: number, p: Player) {
    const b = p.body;
    // heartbeat drives the drip chamber and a pulse in the bag
    const bpm = b.dead ? 0 : (G.survival?.mind?.bpm ?? 70);
    if (bpm > 0) { this.beatT += dt * bpm / 60; if (this.beatT >= 1) { this.beatT -= 1; this.bag.beat(bpm > 110 ? 1.5 : 1); } }
    // the bag swings as you start and stop
    const ax = (p.vx ?? 0) - this.lastV.x, az = (p.vz ?? 0) - this.lastV.z;
    this.lastV.x = p.vx ?? 0; this.lastV.z = p.vz ?? 0;
    const yaw = G.pr?.yaw ?? 0;
    const sx = ax * Math.cos(yaw) - az * Math.sin(yaw);
    if (Math.abs(sx) > 0.05) { this.bag.swing(-sx * 0.25); if (Math.abs(sx) > 1.5) this.bag.slosh(0.15); }
    this.bag.update(dt, p);
    const exertion = p.running ? 1 : (p.speed ?? 0) > 0.5 ? 0.3 : 0;
    const ev = this.lungs.update(dt, p, exertion);
    if (ev === 'miss') G.audio?.ui?.('band_tick', 0.25);
    if (ev === 'end') this.pumpEnded(p);
    if (this.jar.update(dt, p) === 'gurgle') G.audio?.ui?.('bh_gurgle', 0.5);
    this.applyBody(dt, p);
    this.watchWounds(p);
    for (const s of this.sparks) s.t -= dt;
    if (this.sparks.length && this.sparks[0].t <= 0) this.sparks = this.sparks.filter((s) => s.t > 0);
  }

  /** what the objects do back to the body */
  private applyBody(dt: number, p: Player) {
    const b = p.body;
    if (b.dead) return;
    const L = this.lungs;
    // blood in the lungs leaves less room for air
    const cap = 1 - L.stain * 0.45;
    if (b.endurance > cap) b.endurance = Math.max(cap, b.endurance - dt * 0.2);
    // over-full lungs burn stamina; at the limit you cough whether you like it or not
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
    this.popText(blood ? 'COUGH (blood)' : 'COUGH', 'bad', XL + LUNG_W / 2);
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
    bus.emit('think', p, ['Hhgk— oh no. Oh no.', 'Everything came back up.', 'That was not food.'][Math.floor(Math.random() * 3)]);
    bus.emit('vomit', p);
  }

  private onPump(p: Player, r: PumpResult, wasOn: boolean) {
    const b = p.body;
    if (!wasOn) { this.pumpAttack = (ensureMind(b).attack ?? 0) > 0; G.audio?.ui?.('band_tick', 0.35); this.popText('BREATHE', 'info', XL + LUNG_W / 2); return; }
    if (r === 'cough') {
      const blood = this.lungs.stain > 0 || false;
      this.coughFx(p, blood, 0.02);
      b.panic = Math.min(100, b.panic + 2);
      return;
    }
    const q = r === 'perfect' ? 2 : 1;
    b.endurance = Math.min(1 - this.lungs.stain * 0.45, b.endurance + (q === 2 ? 0.055 : 0.032));
    breathHit(p, q);
    const combo = this.lungs.combo;
    G.audio?.ui?.(q === 2 ? 'bh_perfect' : 'bh_good', 0.35 + Math.min(0.2, combo * 0.02));
    G.audio?.flat?.(this.lungs.dialPos() > 0.5 ? 'bh_in' : 'bh_out', 'voice', 0.35, 0.95 + Math.random() * 0.1);
    this.popText(q === 2 ? (combo > 3 ? `PERFECT x${combo}` : 'PERFECT') : 'GOOD', q === 2 ? 'great' : 'good', XL + LUNG_W / 2);
    pop(this.canvas, 1.03, 140);
  }
  private pumpEnded(p: Player) {
    breathDone(p, this.lungs.hits, this.pumpAttack);
    this.pumpAttack = false;
  }

  /** a treatment landed (bandage on, stitched, splinted, cleaned): a little flourish on the hole */
  private watchWounds(p: Player) {
    for (const inj of p.body.allInjuries()) {
      const s = `${inj.bandage ? (inj.bandage.clean ? 'B' : 'b') : ''}${inj.stitched ? 'S' : ''}${inj.splinted ? 'P' : ''}${inj.disinfected > 0 ? 'D' : ''}${inj.foreign ? 'F' : ''}${inj.tq != null ? 'T' : ''}${inj.caut ? 'C' : ''}`;
      const prev = this.sig.get(inj.id);
      if (prev !== undefined && prev !== s && s.length >= prev.length - (prev.includes('F') && !s.includes('F') ? 1 : 0)) {
        const h = this.bag.holePos(inj);
        if (h) for (let i = 0; i < 8; i++) this.sparks.push({ x: XB + h.x + Math.cos(i * 0.785) * 3, y: h.y + Math.sin(i * 0.785) * 3, t: 0.35 + i * 0.02, c: i % 2 ? 0xffffff : 0xfff0a0 });
        G.audio?.ui?.(s.includes('B') && !prev.includes('B') ? 'bh_tape' : 'bh_squelch', 0.45);
        pop(this.canvas, 1.04, 160);
      }
      this.sig.set(inj.id, s);
    }
  }

  private draw(p: Player) {
    const P = this.pix;
    P.clear();
    const hovInj = this.hover.cell === 'bag' ? this.hover.inj : this.cardInj;
    this.bag.draw(P, XB, 0, p, hovInj);
    (this.lungs as any).draw?.(P, XL, 0, p);
    (this.jar as any).draw?.(P, XJ, 0);
    for (const s of this.sparks) { const k = Math.max(0, s.t); P.blend(Math.round(s.x + (s.x - XB) * 0), Math.round(s.y - (0.4 - k) * 10), s.c, Math.min(1, k * 4)); }
    P.outline(0x120a0c, 0.3);
    this.ctx.putImageData(P.img, 0, 0);
    if (this.hover.cell) this.updateTip(p);
  }

  // =================================================================== layout
  private resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pxn')) || 2;
    const touch = document.documentElement.classList.contains('nc-touch');
    const vw = window.innerWidth, vh = window.innerHeight;
    const small = Math.min(vw, vh) < 560;
    let target = small ? 1.5 : Math.max(2, Math.min(3, ui));
    // on a phone the HUD sits top-centre between the corner buttons: fit the gap
    if (touch) target = Math.max(1, Math.min(target, (vw - 240) / W, vh * 0.22 / H));
    const k = Math.max(1, Math.round(target * dpr)) / dpr;
    this.k = k;
    this.canvas.style.width = W * k + 'px';
    this.canvas.style.height = H * k + 'px';
    this.el.style.setProperty('--bh-k', String(k));
    this.el.classList.toggle('bh-touch', touch);
  }

  // =================================================================== input
  private local(e: PointerEvent): { lx: number; ly: number; cell: Cell; cx: number } {
    const r = this.canvas.getBoundingClientRect();
    const lx = (e.clientX - r.left) / this.k, ly = (e.clientY - r.top) / this.k;
    const cell: Cell = lx < XB + BAG_W ? 'bag' : lx >= XL && lx < XL + LUNG_W ? 'lung' : lx >= XJ ? 'jar' : null;
    return { lx, ly, cell, cx: cell === 'bag' ? lx - XB : cell === 'lung' ? lx - XL : lx - XJ };
  }
  private onMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const { cell, cx, ly } = this.local(e);
    const inj = cell === 'bag' ? this.bag.hit(cx, ly) : null;
    this.setHover(cell, inj, e.clientX, e.clientY);
    this.canvas.style.cursor = inj || cell === 'lung' ? 'pointer' : 'default';
  }
  private onDown(e: PointerEvent) {
    const p = G.local; if (!p) return;
    e.preventDefault(); e.stopPropagation();
    const { cell, cx, ly } = this.local(e);
    const touch = e.pointerType === 'touch';
    if (cell === 'bag') {
      const inj = this.bag.hit(cx, ly);
      if (!inj) { this.setHover('bag', null, e.clientX, e.clientY); this.bag.slosh(0.3); G.audio?.ui?.('bh_squelch', 0.25); return; }
      const opts = treatOptions(p, inj);
      const best = bestTreatment(inj, opts);
      // a plain click does the next sensible thing; right-click, a tap, or nothing doable opens the choices
      if (!touch && e.button === 0 && best && !(this.cardInj === inj)) { this.runOpt(p, inj, best); return; }
      this.openCard(p, inj, opts, best);
      return;
    }
    if (cell === 'lung') { this.pumpPress(); return; }
    if (cell === 'jar') { this.setHover('jar', null, e.clientX, e.clientY); this.jar.poke(); G.audio?.ui?.('bh_plop', 0.25); return; }
  }
  private runOpt(p: Player, inj: Injury, o: TreatOpt) {
    if (!o.run) return;
    o.run();
    this.closeCard();
    G.audio?.ui?.('bh_wrap', 0.35);
    this.popText(o.label.toUpperCase(), 'info', XB + (this.bag.holePos(inj)?.x ?? BAG_W / 2));
    void p;
  }
  private openCard(p: Player, inj: Injury, opts: TreatOpt[], best: TreatOpt | null) {
    this.cardInj = inj; this.cardT = 7;
    const c = this.card;
    c.innerHTML = '';
    const h = document.createElement('div'); h.className = 'bh-card-h'; h.textContent = woundTitle(inj); c.appendChild(h);
    if (!opts.length) { const n = document.createElement('div'); n.className = 'bh-card-n'; n.textContent = inj.type === 'bruise' ? 'It will fade on its own.' : 'Nothing more to do. Let it heal.'; c.appendChild(n); }
    for (const o of opts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bh-opt' + (o === best ? ' best' : '') + (o.missing ? ' off' : '');
      btn.innerHTML = '<b></b><small></small>';
      (btn.querySelector('b') as HTMLElement).textContent = o.label;
      (btn.querySelector('small') as HTMLElement).textContent = o.missing ? 'needs ' + o.missing : o.using ? 'with ' + o.using : '';
      btn.disabled = !!o.missing;
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); this.runOpt(p, inj, o); });
      c.appendChild(btn);
    }
    const hp = this.bag.holePos(inj);
    c.style.left = Math.round((XB + (hp?.x ?? 20)) * this.k + 10) + 'px';
    c.style.setProperty('--hy', Math.round((hp?.y ?? 30) * this.k) + 'px');
    c.classList.add('on');
    this.tip.classList.remove('on');
    G.audio?.ui?.('bh_squelch', 0.3);
  }
  private closeCard() { if (!this.cardInj) return; this.cardInj = null; this.card.classList.remove('on'); }

  private setHover(cell: Cell, inj: Injury | null, x: number, y: number) {
    this.hover.cell = cell; this.hover.inj = inj; this.hover.x = x; this.hover.y = y;
    if (!cell || this.cardInj) this.tip.classList.remove('on');
  }
  private updateTip(p: Player) {
    const b = p.body;
    const cell = this.hover.cell;
    const lines: string[] = [];
    if (cell === 'bag') {
      const inj = this.hover.inj;
      if (inj) {
        lines.push(woundTitle(inj));
        const r = b.injuryBleed(inj);
        lines.push(r > 0.5 ? 'pouring out' : r > 0.15 ? 'bleeding' : r > 0.01 ? 'oozing' : inj.infection > 0.15 ? 'infected' : 'not bleeding');
        const best = bestTreatment(inj, treatOptions(p, inj));
        lines.push(best ? `click: ${best.label.toLowerCase()}${best.using ? ' (' + best.using + ')' : ''}` : 'right-click: options');
      } else {
        lines.push(`BLOOD ${Math.round(b.blood)}%  HEALTH ${Math.round(b.health)}%`);
        const n = b.allInjuries().filter((i) => i.type !== 'bruise').length;
        lines.push(n ? `${n} wound${n > 1 ? 's' : ''}: click a hole to treat it` : 'no open wounds');
        const bits: string[] = [];
        if (b.fever() > 0.15) bits.push('infection');
        if (b.sickness > 20) bits.push('food poisoning');
        if (b.corruption > 10) bits.push('corruption');
        if (bits.length) lines.push('blood: ' + bits.join(', '));
        lines.push(`hydration ${Math.round(100 - b.thirst)}% (drip chamber)`);
      }
    } else if (cell === 'lung') {
      lines.push(`STAMINA ${Math.round(b.endurance * 100)}%`);
      if (this.lungs.pumping) lines.push('press H as the bead hits OUT / IN');
      else lines.push(this.lungs.strain > 0.45 ? 'straining: press H to pump it out' : 'H: breathe (calms panic)');
      if (this.lungs.stain > 0.05) lines.push(`blood in the lungs (-${Math.round(this.lungs.stain * 45)}% air): cough it out`);
    } else if (cell === 'jar') {
      const hunger = b.hunger;
      lines.push(`STOMACH ${hunger < 15 ? 'full' : hunger < 30 ? 'fed' : hunger < 50 ? 'peckish' : hunger < 75 ? 'hungry' : 'starving'}`);
      lines.push(this.jar.canEat() ? `room for ${Math.max(0, Math.round((0.93 - this.jar.fill) * 100))}%` : 'too full to eat');
      if (this.jar.acid > 0.32) lines.push('acid rising: inflamed, eat little');
      if (this.jar.poisoned) lines.push('cracked: something you ate was bad');
    }
    const txt = lines.join('\n');
    if (this.tip.textContent !== txt) this.tip.textContent = txt;
    const r = this.el.getBoundingClientRect();
    const cx = cell === 'bag' ? XB + BAG_W / 2 : cell === 'lung' ? XL + LUNG_W / 2 : XJ + JAR_W / 2;
    const tw = this.tip.offsetWidth || 120;
    this.tip.style.left = Math.round(Math.max(tw / 2 + 4 - r.left, Math.min(window.innerWidth - r.left - tw / 2 - 4, cx * this.k))) + 'px';
    this.tip.classList.toggle('below', r.top < 120);
    this.tip.classList.add('on');
  }
  private popCount = 0;
  popText(text: string, kind: 'good' | 'great' | 'bad' | 'info', x: number) {
    if (this.popCount > 4) return;
    const d = document.createElement('div');
    d.className = 'bh-pop ' + kind;
    d.textContent = text;
    d.style.left = Math.round(x * this.k) + 'px';
    this.pops.appendChild(d);
    this.popCount++;
    setTimeout(() => { d.remove(); this.popCount--; }, 900);
  }
  /** the jar's top in screen space (eating aims crumbs there) */
  jarScreen(): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (XJ + JAR_W / 2) * this.k, y: r.top + 10 * this.k };
  }
}

import * as THREE from 'three';
import { G } from './G';
import type { GameSystem } from './game';
import { defOp, op } from './ops';
import type { Player } from '../entities/player';
import { itemDef, type Item } from '../items/item';
import { clamp, angleDiff } from '../core/math';
import { bus } from '../core/events';
import { noise } from '../actions/world';
import { lineOfSight, moveCircle } from '../world/collision';
import { serializeItem } from '../items/factory';
import { Rng } from '../core/rng';
import { applyHitToPlayer, type HitInfo } from '../creatures/manager';
import type { Creature } from '../creatures/creature';
import { TornAction } from '../survival/limbSystem';
import { shake, punch, hitstop, slowmo, kick } from '../gfx/juice';
import '../combat/anims';
import '../combat/sounds';
import { wielded, MOVES, sizeClass, type MoveKind, type Wielded } from '../combat/moves';
import { Marks, gaugeName } from '../combat/glyphs';
import { Words } from '../combat/words';
import { Combo } from '../combat/combos';
import { Struggles, StruggleAction, type Stage } from '../combat/qte';
import { Executions } from '../combat/executions';
import { combatHit, creatureStep, creaturePose, executable, isDown, isStunned, inExec, killable, flinch, cbOp, type HitExtra } from '../combat/creatureState';

// a hit on a creature: from a client to the host (the host applies its own directly)
defOp('creatureHit', (a: { id: string; dmg: number; fx: number; fz: number; knock: number; by: string; k?: string; cr?: 1 } & HitExtra, ctx) => {
  if (!ctx.host) return;
  hostHit(a.by, a.id, a.dmg, a.fx, a.fz, a.knock, a.k, !!a.cr, a);
});
function hostHit(by: string, id: string, dmg: number, fx: number, fz: number, knock: number, k: string | undefined, crit: boolean, x: HitExtra) {
  const cs = G.creatures; if (!cs) return;
  cs.damage(by, id, dmg, fx, fz, knock, k, crit);
  const c: Creature | undefined = cs.creatures.get(id);
  if (c && !c.dead && (x.po || x.dn || x.st || x.ia)) combatHit(c, x, fx, fz);
}

type St = 'idle' | 'strike' | 'charge';
interface Move {
  kind: MoveKind; t: number; dur: number; hitAt: number; landed: boolean; dir: number;
  power: number; perfect: boolean; anim: string; step: number; stepDone: number; slow: number;
  chain: number; counter: boolean; targetId?: string; face?: number;
}

const HOSTILE = new Set(['hostile', 'stalker', 'ambush', 'territorial']);
const _v = new THREE.Vector3();

/**
 * Player combat. Left mouse: tap for a light strike, hold to charge a heavy
 * (release at the flash for a perfect blow); light strikes in rhythm chain,
 * and a fourth in time opens a barrage. Shift + attack while sprinting: lunge.
 * Space: shove (a sprinting shove is a tackle), and on something knocked down,
 * a stomp; attacking something on the floor slashes it, and shove -> stomp ->
 * slash on the same body is a finisher. Tap Shift (or double-tap a direction)
 * in a fight to dodge; a dodge just before a blow lands slows the world and
 * opens a counter. Staggered, downed or dying creatures can be executed (E,
 * or attack them). Grabs, pins and limb-tearing grips become struggles.
 * Guns and throwables keep their own verbs. In co-op, survivors can hurt each
 * other when friendly fire is on (sandbox).
 */
export class CombatSystem implements GameSystem {
  name = 'combat';
  rng = new Rng(Math.random() * 1e9);
  marks = new Marks();
  words = new Words();
  qte = new Struggles();
  exec = new Executions();
  combo = new Combo();
  state: St = 'idle';
  move: Move | null = null;
  /** the physical attack button: when it went down, whether it is still held */
  private btn: { t0: number; up: boolean; upT: number } | null = null;
  private owned = false;
  private charge = { t: 0, lvl: 0, fullT: -1, snd: 0, perfectShown: false };
  private lastFight = -99;
  private touchSys: any = undefined;
  private tHeld = false;
  private vAtk = false;
  private ignoreClickUntil = 0;
  private shiftT0 = -9;
  private dirTap: Record<string, number> = { up: -9, down: -9, left: -9, right: -9 };
  private dodgeCd = 0;
  private struggleCd = 0;
  private noTearQte = 0;
  private stars: { x: number; y: number; z: number; t0: number; s: number; c: number }[] = [];
  private flashes: { x: number; y: number; z: number; until: number; c: number; i: number }[] = [];
  private prevPos = { x: 0, z: 0, zone: '', ok: false };
  private slowK = 1;
  private lastTel = new WeakMap<object, number>();
  private rangedCd = 0;
  /** true on the frames the attack button belongs to combat (other systems should leave the click alone) */
  claimsClick = false;

  constructor() {
    G.combat = this;
    bus.on('playerHit', (p: Player, part: string, kind: string, h: HitInfo) => { try { this.onPlayerHit(p, part, kind, h); } catch (e) { console.error('combat playerHit', e); } });
  }

  // ================================================================ hooks for other systems
  /** creature manager (host): the creature is down / staggered / executed / pinning: skip its brain */
  creatureStep(c: Creature, dt: number) { return creatureStep(c, dt); }
  /** creature manager (every peer): fight body language over the species' animation */
  creaturePose(c: Creature, dt: number) { creaturePose(c, dt); }
  /** creature manager (applyHitToPlayer): a hit that arrives during a dodge or an execution misses */
  evade(p: Player, h: HitInfo): boolean {
    if (!p.isLocal || ((p as any).cbIframe ?? 0) <= G.time) return false;
    if (!this.exec.active) this.perfectDodge(p, h.from);
    return true;
  }
  localHurt(p: Player, hit: HitInfo) { applyHitToPlayer(p, hit); }
  /** on-screen controls: hold / release the attack button (charge) */
  touchAttack(down: boolean) { this.vAtk = down; }
  /** on-screen controls / gamepads: dodge toward a world direction (0,0 = step back) */
  dodge(dx = 0, dz = 0) { const p = G.local; if (p) this.startDodge(p, dx, dz); }
  /** execute a creature now if it can be (tests, touch prompts) */
  execute(id: string, combo = false) {
    const p = G.local, c: Creature | undefined = G.creatures?.creatures?.get?.(id);
    if (!p || !c) return null;
    return this.exec.start(p, c, wielded(p), combo);
  }

  weapon(p: Player) { const w = wielded(p); return { it: w.it, w: w.w, armed: w.armed }; }
  /** host / solo: friendly fire on or off for everyone */
  setFriendlyFire(on: boolean) { setFriendlyFire(on); }

  /** a hit from the local survivor on a creature (host applies, a client asks the host); local flinch at once */
  dealCreature(p: Player, c: Creature, o: { dmg: number; kind: string; knock: number; crit?: boolean } & HitExtra) {
    const ex: HitExtra = { po: o.po ? Math.round(o.po) : undefined, dn: o.dn, st: o.st, ia: o.ia };
    if (G.role !== 'client') hostHit(p.id, c.id, o.dmg, p.x, p.z, o.knock, o.kind, !!o.crit, ex);
    else op('creatureHit', { id: c.id, dmg: o.dmg, fx: p.x, fz: p.z, knock: o.knock, by: p.id, k: o.kind, cr: o.crit ? 1 : undefined, ...ex });
    flinch(c, c.x - p.x, c.z - p.z, Math.min(1.5, 0.4 + o.knock * 0.6));
    this.lastFight = G.time;
  }

  // ================================================================ frame
  update(dt: number) {
    this.marks.attach();
    this.marks.begin();
    this.words.begin();
    try { this.frame(dt); } finally {
      try { this.drawWorld(dt); } catch (e) { console.error('combat marks', e); }
      this.marks.end();
      this.words.end();
    }
  }

  private frame(dt: number) {
    const p = G.local;
    this.claimsClick = false;
    if (!p) return;
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
    this.struggleCd = Math.max(0, this.struggleCd - dt);
    if (p.body.dead || p.inVehicle) { this.qte.cancel(); if (this.exec.active) this.exec.end(p); this.resetMoves(p); return; }
    this.applySlow(p);
    this.pollTear(p);
    if (this.qte.active) { this.resetMoves(p); this.qte.update(dt, this.marks, this.words); G.input.mouseReleased[0] = false; this.endFrame(p); return; }
    if (p.body.downed) { this.resetMoves(p); this.endFrame(p); return; }
    if (this.exec.active) { this.resetMoves(p); this.exec.update(dt, p, this.marks, this.words); this.slowK = 0; this.endFrame(p); return; }
    const inp = G.input;
    const cur = p.actions.current;
    const busy = !!(cur?.started && cur.locks);
    const over = inp.pointerOverUI || !!G.ui?.menuEl;
    // ---- the attack button: mouse, the on-screen button / 'primary' action
    const ts = this.touch();
    const tHeld = !!(ts?.active && ts.atk) || this.vAtk || inp.down('primary' as any);
    const tPress = tHeld && !this.tHeld, tRel = !tHeld && this.tHeld;
    this.tHeld = tHeld;
    if (tRel) this.ignoreClickUntil = performance.now() + 900;
    const alt = inp.keys.has('AltLeft') || inp.keys.has('AltRight');
    let press = false, release = false;
    if (tPress) press = true;
    if (tRel) release = true;
    if (!tHeld && inp.mousePressed[0] && !over && !alt && !busy && performance.now() > this.ignoreClickUntil) {
      if (this.wantsClick(p)) { press = true; this.owned = true; inp.mousePressed[0] = false; }
    } else if (tHeld && inp.mousePressed[0]) inp.mousePressed[0] = false;
    if (this.owned) {
      this.claimsClick = true;
      if (!inp.mouseDown[0] || inp.mouseReleased[0]) { release = true; this.owned = false; inp.mouseReleased[0] = false; }
    }
    if (busy || over) { if (this.state === 'charge') this.state = 'idle'; this.btn = null; }
    if (press) this.btn = { t0: G.time, up: false, upT: 0 };
    if (release && this.btn && !this.btn.up) { this.btn.up = true; this.btn.upT = G.time; }
    const held = !!this.btn && !this.btn.up;
    // ---- execution on E
    if (!busy && inp.hit('interact')) {
      const c = this.execTarget(p, 2.1);
      if (c) { for (const code of inp.bindings.interact) inp.pressed.delete(code); this.exec.start(p, c, wielded(p)); this.endFrame(p); return; }
    }
    // ---- dodge: tap Shift, or double-tap a direction (in a fight)
    if (!busy) this.dodgeInput(p);
    // ---- shove / tackle / stomp
    if (!busy && inp.hit('shove') && this.state !== 'charge') {
      if (!G.interact?.tryVault?.(p)) this.shove(p);
    }
    // ---- moves in progress
    if (this.move) this.stepMove(p, dt);
    // ---- the attack button
    if (!busy) this.attackButton(p, held, dt);
    this.endFrame(p);
  }

  private endFrame(p: Player) {
    p.attackCooldown = this.move ? Math.max(0.01, this.move.dur - this.move.t) : this.rangedCd;
    this.prevPos = { x: p.x, z: p.z, zone: p.zoneKey, ok: true };
  }

  /** scale back the walking the controller just did (rooted while striking / charging) */
  private applySlow(p: Player) {
    const k = this.slowK;
    const pp = this.prevPos;
    if (k < 0.999 && pp.ok && pp.zone === p.zoneKey) {
      const dx = p.x - pp.x, dz = p.z - pp.z;
      if (Math.abs(dx) + Math.abs(dz) < 0.6 && (dx || dz)) moveCircle(G.getZone(p.zoneKey), p, -dx * (1 - k), -dz * (1 - k), { ignoreLow: false });
      p.speed *= k;
    }
    this.slowK = this.move ? this.move.slow : this.state === 'charge' ? 0.4 : 1;
  }

  private touch(): any {
    if (this.touchSys === undefined) this.touchSys = G.systems.find((s) => s.name === 'touch') ?? null;
    return this.touchSys;
  }

  /** is the survivor in a fight (hostile close by, recent blows, something to finish) */
  engaged(p: Player): boolean {
    if (G.time - this.lastFight < 5) return true;
    for (const c of G.creatures?.creatures?.values?.() || []) {
      const cc = c as Creature;
      if (cc.dead || cc.zoneKey !== p.zoneKey || cc.tamedBy) continue;
      const d = Math.hypot(cc.x - p.x, cc.z - p.z);
      if (d > 7) continue;
      if (HOSTILE.has(cc.sp.temperament) || cc.state === 'chase' || cc.state === 'attack' || (d < 3 && executable(cc))) return true;
    }
    return false;
  }

  /** would a left click right now be an attack (else it is left to walking / interaction) */
  wantsClick(p: Player): boolean {
    if (p.inVehicle || p.body.dead || p.body.downed) return false;
    const w = wielded(p);
    if (w.ranged) return w.w.kind === 'firearm' || p.aiming;
    if (p.aiming || w.armed || w.cls === 'cyber') return true;
    return this.engaged(p);
  }

  // ================================================================ the attack button
  private attackButton(p: Player, held: boolean, dt: number) {
    const w = wielded(p);
    const b = this.btn;
    // guns and throwables: their own verbs, on press
    if (w.ranged) {
      if (b && !b.up && this.rangedCd <= 0 && !this.move) {
        if (w.w.kind === 'firearm') this.shoot(p, w.it!, w.w);
        else if (p.aiming) this.throwItem(p, w.it!);
        this.btn = null;
      }
      return;
    }
    // barrage: every press is a jab, at once
    const br = this.combo.barrage;
    if (br) {
      if (b) { br.queued = Math.min(2, br.queued + 1); this.btn = null; }
      const ready = !this.move || (this.move.kind === 'jab' && this.move.t > this.move.dur * 0.55);
      if (br.queued > 0 && ready && br.jabs < 8 && G.time <= br.until) { br.queued--; br.jabs++; this.startMove(p, 'jab', w); }
      if ((G.time > br.until || br.jabs >= 8) && (!this.move || this.move.landed)) {
        this.combo.barrage = null;
        if (br.jabs >= 3) { this.startMove(p, 'flurryEnd', w); this.words.pop('Barrage', p.x, p.y + 2.3, p.z, 'ev crit', 1); this.combo.note('barrage'); }
      }
      return;
    }
    if (this.state === 'charge') { this.chargeStep(p, w, held, dt); return; }
    // wait for the move to reach its cancel point
    if (this.move && !this.cancelable(this.move)) return;
    if (!b) return;
    // sprinting: a lunge, straight away
    if (p.running && !b.up && !this.move && p.body.endurance > 0.1) { this.btn = null; this.combo.reset(); this.startMove(p, 'lunge', w); return; }
    const holdT = (b.up ? b.upT : G.time) - b.t0;
    if (!b.up && holdT >= 0.2) {
      // hold: wind up a heavy
      this.btn = { ...b };
      this.state = 'charge';
      this.charge = { t: 0, lvl: 0, fullT: -1, snd: 0, perfectShown: false };
      this.move = null;
      p.playAnim('cb_charge', w.feel.chargeT);
      G.audio?.at?.('cb_charge', p.x, p.z, 0.5);
      return;
    }
    if (b.up) {
      this.btn = null;
      this.tapAttack(p, w, b.t0);
    }
  }

  /** a light strike (or what the context makes of it: execution, ground slash, finisher, barrage) */
  private tapAttack(p: Player, w: Wielded, pressT: number) {
    const dir = this.aimDir(p);
    // a counter after a perfect dodge / struggle, or a broken enemy in reach: execute
    const ctr = this.combo.counter && G.time < this.combo.counter.until ? this.combo.counter : null;
    const near = this.pickTarget(p, w.w.range + w.feel.reach + 0.9, 0.9, dir, true);
    if (near && near.c) {
      const c = near.c;
      if (executable(c) && !isDown(c) && (isStunned(c) || c.hp <= c.sp.hp * 0.18) || (ctr && killable(c) && (!ctr.id || ctr.id === c.id))) {
        this.combo.counter = null;
        if (this.exec.start(p, c, w)) return;
      }
      if (isDown(c)) {
        if (this.combo.finisherReady(c.id) || c.hp <= w.w.dmg[1] * 2.2 * MOVES.slash.dmg) { this.combo.note('finisher', c.id); this.combo.ground = null; if (this.exec.start(p, c, w, true)) return; }
        this.startMove(p, 'slash', w, c.id);
        return;
      }
    }
    // the rhythm of the chain
    const prev = this.move;
    const lastDur = prev ? prev.dur : this.lastLightDur;
    const timing = this.combo.press(pressT - this.combo.impactT, lastDur);
    this.combo.chain++;
    if (this.combo.chain >= 4 && (timing === 'good' || timing === 'perfect') && w.cls !== 'heavy') {
      // the fourth in rhythm opens a barrage
      this.combo.barrage = { until: G.time + 1.5, jabs: 1, queued: 0 };
      this.combo.chain = 0;
      this.words.pop('Flurry', p.x, p.y + 2.3, p.z, 'ev', 0.8);
      this.startMove(p, 'jab', w);
      return;
    }
    this.startMove(p, 'light', w, undefined, timing === 'perfect' && this.combo.chain > 1);
  }
  private lastLightDur = 0.4;

  private chargeStep(p: Player, w: Wielded, held: boolean, dt: number) {
    const ch = this.charge;
    ch.t += dt;
    const T = w.feel.chargeT / Math.max(0.5, w.speedMul);
    ch.lvl = Math.min(1, ch.t / T);
    p.facing = p.targetFacing = this.aimDir(p);
    p.body.endurance = Math.max(0, p.body.endurance - dt * (ch.lvl >= 1 ? 0.05 : 0.015) * w.stamMul);
    if (p.actionAnim !== 'cb_charge') p.playAnim('cb_charge', T);
    p.actionDur = T;
    ch.snd -= dt;
    if (ch.lvl < 1 && ch.snd <= 0) { ch.snd = 0.3; G.audio?.at?.('cb_charge', p.x, p.z, 0.35 + ch.lvl * 0.4); }
    if (ch.lvl >= 1 && ch.fullT < 0) { ch.fullT = G.time; G.audio?.at?.('cb_ready', p.x, p.z, 0.9); punch(0.025, 0.12); }
    // held on past the window: the arms start to shake, the blow loses its edge
    if (!held) {
      this.state = 'idle';
      this.btn = null;
      const perfect = ch.fullT >= 0 && G.time - ch.fullT <= 0.3;
      this.startMove(p, 'heavy', w, undefined, perfect, Math.max(0.15, ch.lvl));
    } else if (p.body.endurance <= 0.01) {
      this.state = 'idle'; this.btn = null;
      this.startMove(p, 'heavy', w, undefined, false, ch.lvl * 0.7);
    }
  }

  private cancelable(m: Move) { return m.landed && m.t >= m.dur * Math.max(m.hitAt + 0.12, 0.66); }

  // ================================================================ moves
  private animFor(kind: MoveKind, w: Wielded, perfect: boolean): string {
    switch (kind) {
      case 'light': {
        if (w.cls === 'unarmed' || w.cls === 'cyber') return this.combo.chain % 2 ? 'cb_jab' : 'cb_jab2';
        return w.feel.lightAnim === 'swing' && w.w.twoHanded ? 'swing2h' : w.feel.lightAnim;
      }
      case 'jab': return this.combo.barrage && this.combo.barrage.jabs % 2 ? 'cb_jab2' : 'cb_jab';
      case 'heavy': case 'flurryEnd': return 'cb_heavy';
      case 'lunge': return 'cb_lunge';
      case 'shove': return 'shove';
      case 'tackle': return 'cb_tackle';
      case 'stomp': return 'cb_stomp';
      case 'slash': return 'cb_slash';
      default: void perfect; return '';
    }
  }

  private startMove(p: Player, kind: MoveKind, w: Wielded, targetId?: string, perfect = false, power = 1) {
    const spec = MOVES[kind];
    // a two-handed weapon needs two hands (or one and a hook to steady it)
    const L = p.body.severed.length ? p.body.limbs() : null;
    if (L && w.it && (w.w.twoHanded || (itemDef(w.it.key) as any).heavy) && !L.twoHand && kind !== 'shove' && kind !== 'stomp' && kind !== 'tackle') { bus.emit('think', p, 'I can\'t swing that with one hand.'); return; }
    const tired = p.body.endurance < 0.12;
    const skill = p.body.skill(skillFor(w.w.kind));
    const speed = (1 + skill * 0.04) * w.speedMul * (tired ? 0.72 : 1) / Math.max(0.6, p.body.mods(p.heavyLoad()).action ?? 1);
    let dur: number;
    switch (kind) {
      case 'light': dur = w.feel.light * Math.sqrt(1.35 / Math.max(0.5, w.w.speed)) / speed; this.lastLightDur = dur; break;
      case 'jab': dur = 0.15 / speed; break;
      case 'heavy': dur = w.feel.heavyDur / Math.sqrt(speed); break;
      case 'flurryEnd': dur = 0.42; break;
      case 'lunge': dur = 0.52; break;
      case 'shove': dur = 0.42; break;
      case 'tackle': dur = 0.55; break;
      case 'stomp': dur = 0.55 / Math.sqrt(speed); break;
      case 'slash': dur = 0.5 / Math.sqrt(speed); break;
      default: dur = 0.3;
    }
    const stam = (kind === 'light' ? w.feel.stam * spec.stam : kind === 'heavy' || kind === 'flurryEnd' || kind === 'slash' || kind === 'jab' ? w.feel.stam * spec.stam * (kind === 'heavy' ? 0.6 + power : 1) : spec.stam) * w.stamMul * (p.body.has('athletic') ? 0.8 : 1);
    p.body.endurance = Math.max(0, p.body.endurance - stam);
    p.exertionTimer = 1;
    if (tired && Math.random() < 0.3) bus.emit('think', p, 'Can\'t... breathe...');
    const dir = kind === 'lunge' || kind === 'tackle' ? this.dashDir(p) : this.aimDir(p, targetId);
    const slow = kind === 'light' ? 0.55 : kind === 'jab' ? 0.7 : kind === 'heavy' || kind === 'flurryEnd' ? 0.12 : kind === 'stomp' || kind === 'slash' ? 0.2 : 0;
    const anim = this.animFor(kind, w, perfect);
    // close the gap: the strike steps in on what it is aimed at (magnetism), never through it
    let step = spec.step * (kind === 'heavy' ? 0.5 + power * 0.5 : 1);
    if (kind === 'light' || kind === 'jab' || kind === 'heavy' || kind === 'flurryEnd' || kind === 'slash') {
      const reach = w.w.range + w.feel.reach + 0.25;
      const t = this.pickTarget(p, reach + 1.4, 0.6, dir, kind === 'slash');
      if (t?.c) {
        const gap = Math.hypot(t.x - p.x, t.z - p.z) - t.c.radius - reach * 0.7;
        step = Math.max(step, Math.min(kind === 'heavy' ? 1.2 : 0.9, gap));
        targetId = targetId ?? t.c.id;
      }
    }
    this.move = { kind, t: 0, dur, hitAt: spec.hitAt, landed: false, dir, power, perfect, anim, step, stepDone: 0, slow, chain: this.combo.chain, counter: !!(this.combo.counter && G.time < this.combo.counter.until), targetId };
    this.state = 'strike';
    p.attackCooldown = dur;
    if (anim) p.playAnim(anim, dur);
    p.facing = p.targetFacing = dir;
    const big = kind === 'heavy' || kind === 'lunge' || kind === 'flurryEnd' || kind === 'tackle';
    G.audio?.at?.(big ? 'cb_whoosh_big' : kind === 'shove' ? 'shove' : kind === 'stomp' ? 'cb_grunt' : 'swing', p.x, p.z, big ? 0.8 : 0.5);
    if (perfect && kind === 'heavy') { this.words.pop('Perfect', p.x, p.y + 2.3, p.z, 'ev perfect', 0.9); G.audio?.at?.('cb_perfect', p.x, p.z, 0.6); }
    this.combo.note(kind, targetId);
    this.lastFight = G.time;
  }

  private stepMove(p: Player, dt: number) {
    const m = this.move!;
    m.t += dt;
    p.facing = p.targetFacing = m.face ?? m.dir;
    // forward motion (a step into the blow, the lunge, the tackle)
    if (m.step > 0) {
      const end = m.kind === 'dodge' ? 0.75 : m.kind === 'lunge' || m.kind === 'tackle' ? m.hitAt + 0.1 : m.hitAt + 0.05;
      const u = Math.min(1, m.t / (m.dur * end));
      const want = m.step * (1 - (1 - u) * (1 - u));
      const d = want - m.stepDone;
      if (d > 0) {
        const z = G.getZone(p.zoneKey);
        // stop short of whatever we are hitting
        const tg = m.targetId ? G.creatures?.creatures?.get?.(m.targetId) : null;
        const block = tg ? Math.hypot(tg.x - p.x, tg.z - p.z) - tg.radius - (m.kind === 'lunge' || m.kind === 'tackle' ? 0.35 : 0.6) : 9;
        const s = Math.min(d, Math.max(0, block));
        if (s > 0) moveCircle(z, p, Math.cos(m.dir) * s, Math.sin(m.dir) * s, { ignoreLow: false });
        m.stepDone = want;
        p.speed = m.kind === 'lunge' || m.kind === 'tackle' || m.kind === 'dodge' ? d / Math.max(1e-3, dt) * 0.5 : p.speed;
      }
    }
    if (m.kind === 'dodge') { p.vx = p.vz = 0; }
    if (!m.landed && m.t >= m.dur * m.hitAt && m.kind !== 'dodge') { m.landed = true; this.resolve(p, m); }
    if (m.kind === 'dodge' && m.t >= m.dur * 0.5) m.landed = true;
    if (m.t >= m.dur) {
      this.move = null;
      this.state = 'idle';
      if (p.actionAnim === m.anim) p.stopAnim();
    }
  }

  private resetMoves(p: Player) {
    if (this.move && p.actionAnim === this.move.anim) p.stopAnim();
    if (this.state === 'charge' && p.actionAnim === 'cb_charge') p.stopAnim();
    this.move = null; this.state = 'idle'; this.btn = null; this.owned = false;
    this.combo.barrage = null;
    this.slowK = 1;
  }

  // ================================================================ aiming
  private aimDir(p: Player, targetId?: string): number {
    if (targetId) { const c = G.creatures?.creatures?.get?.(targetId); if (c) return Math.atan2(c.z - p.z, c.x - p.x); }
    let dir = Math.hypot(p.aimX - p.x, p.aimZ - p.z) > 0.3 ? Math.atan2(p.aimZ - p.z, p.aimX - p.x) : p.facing;
    // aim assist: snap to the closest thing in a narrow cone in reach
    const w = wielded(p);
    const t = this.pickTarget(p, w.w.range + w.feel.reach + 1.1, 0.55, dir, false);
    if (t) dir = Math.atan2(t.z - p.z, t.x - p.x);
    return dir;
  }
  private dashDir(p: Player): number {
    let dir = Math.hypot(p.vx, p.vz) > 0.5 ? Math.atan2(p.vz, p.vx) : p.facing;
    const t = this.pickTarget(p, 4, 0.6, dir, false);
    if (t) dir = Math.atan2(t.z - p.z, t.x - p.x);
    return dir;
  }

  /** the best thing to hit around a direction: creatures (and players with friendly fire) */
  pickTarget(p: Player, range: number, arc: number, dir: number, includeDown: boolean): { x: number; z: number; c?: Creature; q?: Player } | null {
    const z = G.getZone(p.zoneKey);
    let best: { x: number; z: number; c?: Creature; q?: Player } | null = null, bs = Infinity;
    for (const c0 of G.creatures?.creatures?.values?.() || []) {
      const c = c0 as Creature;
      if (c.dead || c.zoneKey !== p.zoneKey || c.tamedBy || c.mem.thrallOf) continue;
      if (!includeDown && isDown(c)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > range + c.radius) continue;
      const da = Math.abs(angleDiff(dir, Math.atan2(c.z - p.z, c.x - p.x)));
      if (da > arc && d > c.radius + 0.5) continue;
      if (!lineOfSight(z, p.x, p.z, c.x, c.z)) continue;
      const s = d + da * 1.6;
      if (s < bs) { bs = s; best = { x: c.x, z: c.z, c }; }
    }
    if (G.sandbox.friendlyFire) for (const q of G.players.values()) {
      if (q === p || q.body.dead || q.zoneKey !== p.zoneKey) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > range + 0.3) continue;
      const da = Math.abs(angleDiff(dir, Math.atan2(q.z - p.z, q.x - p.x)));
      if (da > arc) continue;
      const s = d + da * 1.6;
      if (s < bs) { bs = s; best = { x: q.x, z: q.z, q }; }
    }
    return best;
  }

  private execTarget(p: Player, r: number): Creature | null {
    let best: Creature | null = null, bd = Infinity;
    for (const c0 of G.creatures?.creatures?.values?.() || []) {
      const c = c0 as Creature;
      if (c.zoneKey !== p.zoneKey || !executable(c) || c.tamedBy) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z) - c.radius;
      if (d < r && d < bd && lineOfSight(G.getZone(p.zoneKey), p.x, p.z, c.x, c.z)) { bd = d; best = c; }
    }
    return best;
  }

  // ================================================================ hits
  private resolve(p: Player, m: Move) {
    const w = wielded(p);
    const k = m.kind;
    const spec = MOVES[k];
    const ground = k === 'stomp' || k === 'slash';
    const aoe = k === 'heavy' && w.cls === 'heavy' && m.power >= 0.85;
    const reach = w.w.range + w.feel.reach + 0.25 + (k === 'lunge' ? 0.45 : 0) + (ground ? 0.35 : 0) + (k === 'shove' || k === 'tackle' ? 0.3 - w.w.range * 0.3 : 0) + (aoe ? 0.4 : 0);
    const arc = aoe ? 2.2 : k === 'shove' || k === 'tackle' ? 1.0 : ground ? 1.2 : k === 'jab' ? 0.6 : w.feel.arc;
    const z = G.getZone(p.zoneKey);
    const hits: { c?: Creature; q?: Player; d: number }[] = [];
    for (const c0 of G.creatures?.creatures?.values?.() || []) {
      const c = c0 as Creature;
      if (c.dead || c.zoneKey !== p.zoneKey || c.tamedBy || c.mem.thrallOf) continue;
      const down = isDown(c);
      if (ground) { if (!down && m.targetId !== c.id) continue; }
      else if (down && k !== 'shove' && !aoe) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > reach + c.radius) continue;
      if (Math.abs(angleDiff(m.dir, Math.atan2(c.z - p.z, c.x - p.x))) > arc && d > c.radius + 0.35) continue;
      if (!lineOfSight(z, p.x, p.z, c.x, c.z)) continue;
      hits.push({ c, d });
    }
    if (G.sandbox.friendlyFire && !ground) for (const q of G.players.values()) {
      if (q === p || q.body.dead || q.zoneKey !== p.zoneKey) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > reach + 0.3 || Math.abs(angleDiff(m.dir, Math.atan2(q.z - p.z, q.x - p.x))) > arc) continue;
      if (!lineOfSight(z, p.x, p.z, q.x, q.z)) continue;
      hits.push({ q, d });
    }
    hits.sort((a, b) => a.d - b.d);
    const max = k === 'jab' || k === 'stomp' ? 1 : aoe ? 5 : k === 'shove' || k === 'tackle' ? 3 : w.feel.multi + (k === 'heavy' ? 1 : 0);
    let n = 0;
    for (const h of hits.slice(0, max)) { if (h.c) this.strikeCreature(p, h.c, m, w); else if (h.q) this.strikePlayer(p, h.q, m, w); n++; }
    if (n) {
      this.combo.landed(n);
      if (w.it && k !== 'shove' && k !== 'tackle' && k !== 'stomp') this.wear(p, w.it, k === 'heavy' ? 2 : 1);
      p.anim?.impact?.(w.cls === 'blade' || w.cls === 'spear' ? 0.35 : 0.7);
      if (aoe) { shake(0.8, 0.45); G.audio?.at?.('cb_impact', p.x, p.z, 1); }
    } else if (k === 'light' || k === 'heavy' || k === 'lunge') {
      // furniture, walls, windows in front
      this.hitWorld(p, k === 'heavy' ? { ...w.w, dmg: [w.w.dmg[0] * (1 + m.power), w.w.dmg[1] * (1 + m.power)] as [number, number] } : w.w, w.it);
      if (k !== 'light') shake(0.15, 0.15);
    }
    noise(p, p.x, p.z, n ? w.w.noise * (k === 'heavy' ? 1.4 : 1) : w.w.noise * 0.5, 'melee');
    if (n) p.body.addXp('strength', k === 'heavy' ? 2 : 1);
  }

  private strikeCreature(p: Player, c: Creature, m: Move, w: Wielded) {
    const k = m.kind, spec = MOVES[k];
    const mods = p.body.mods(p.heavyLoad());
    const skill = p.body.skill(skillFor(w.w.kind));
    const foot = k === 'stomp' || k === 'shove' || k === 'tackle';
    const kickMul = 1;
    let dmg = (foot ? this.rng.float(4, 8) : this.rng.float(w.w.dmg[0], w.w.dmg[1])) * (mods.attack ?? 1) * (1 + skill * 0.07) * spec.dmg * w.dmgMul * kickMul;
    if (k === 'heavy') dmg *= (1.2 + (w.feel.heavyMul - 1.2) * m.power) * (m.perfect ? 1.35 : 1);
    if (k === 'lunge') dmg *= w.feel.lungeMul;
    if (k === 'light') dmg *= 1 + 0.1 * Math.max(0, m.chain - 1) + (m.perfect ? 0.2 : 0);
    const dir = Math.atan2(c.z - p.z, c.x - p.x);
    const behind = Math.abs(angleDiff(c.facing, dir)) < 0.9 && !isDown(c);
    const unaware = c.state === 'idle' || c.state === 'sleep' || c.state === 'disguised' || c.state === 'wander' || c.state === 'graze' || c.state === 'eat';
    const broken = isDown(c) || isStunned(c);
    if (behind) dmg *= 1.5;
    if (broken) dmg *= 1.3;
    if (m.counter) dmg *= 1.8;
    const crit = m.counter || this.rng.chance(w.w.crit + skill * 0.01 + (unaware ? 0.25 : 0) + (behind ? 0.35 : 0) + (m.perfect ? 0.3 : 0) + (k === 'lunge' && (w.cls === 'blade' || w.cls === 'spear') ? 0.3 : 0));
    if (crit) dmg *= 2;
    if (w.it && (w.it.cond ?? 1) < 0.3) dmg *= 0.75;
    const size = sizeClass(c);
    const sizeK = size === 3 ? 0.35 : size === 2 ? 0.8 : 1.2;
    const knock = (foot ? 0.6 : w.w.knock) * w.feel.knock * spec.knock * sizeK * kickMul;
    const po = spec.poise * (foot ? 1 : w.feel.poise) * w.poiseMul * kickMul * (m.perfect ? 1.6 : 1) * (m.counter ? 2 : 1) * (k === 'heavy' ? 0.6 + m.power : 1) * (crit ? 1.3 : 1);
    let dn: number | undefined, stn: number | undefined;
    if (k === 'tackle' && size <= 2) dn = 2.2;
    else if (k === 'flurryEnd' && size <= 2) dn = 2.0;
    else if (k === 'heavy' && m.perfect) { if (w.cls === 'blade' || w.cls === 'spear') stn = 2.4; else dn = 2.0; }
    else if (k === 'shove' && (size <= 1 || isStunned(c))) dn = 1.9;
    else if (k === 'lunge' && w.cls === 'spear') stn = 1.2;
    const ia: 1 | undefined = k === 'light' && !m.perfect && !m.counter ? undefined : 1;
    const kind = k === 'shove' || k === 'tackle' ? 'shove' : k === 'stomp' ? 'blunt' : w.hitKind;
    this.dealCreature(p, c, { dmg, kind, knock, crit, po, dn, st: stn, ia });
    // the ground chain
    if (dn && size <= 2) this.combo.grounded(c.id);
    if (k === 'stomp') { if (!this.combo.ground || this.combo.ground.id !== c.id) this.combo.grounded(c.id); this.combo.stomped(c.id); }
    // feel it
    const big = k === 'heavy' || k === 'lunge' || k === 'flurryEnd' || k === 'tackle' || k === 'stomp' || k === 'slash';
    const stopMs = spec.stop * (crit ? 1.3 : 1) * (k === 'heavy' ? 0.6 + m.power * 0.6 : 1) * (m.perfect ? 1.3 : 1);
    hitstop(stopMs);
    shake(spec.shake * (crit ? 1.3 : 1) * (k === 'heavy' ? 0.5 + m.power * 0.7 : 1), 0.25);
    punch(big ? 0.05 + (m.perfect ? 0.03 : 0) : 0.02, big ? 0.25 : 0.14);
    kick(c.x - p.x, c.z - p.z, big ? 0.3 : 0.12);
    const hy = c.y + Math.min(1.6, c.height * 0.6);
    G.audio?.hit?.(kind === 'shove' || kind === 'unarmed' ? 'blunt' : kind, c.x, c.z, crit);
    if (big) G.audio?.at?.(k === 'stomp' ? 'cb_stomp' : 'cb_impact', c.x, c.z, k === 'heavy' ? 0.5 + m.power * 0.5 : 0.8);
    else if (k === 'jab') G.audio?.at?.('cb_jab', c.x, c.z, 0.7);
    this.stars.push({ x: (c.x + p.x * 0.4) / 1.4, y: hy, z: (c.z + p.z * 0.4) / 1.4, t0: performance.now(), s: big ? 1.6 : 1, c: crit ? 0xfff0d0 : 0xffb868 });
    // sparks off the blow (metal on bone)
    const sx = (c.x + p.x * 0.4) / 1.4, sz = (c.z + p.z * 0.4) / 1.4;
    for (let i = 0; i < (big ? 9 : crit ? 6 : 3); i++) { const a = dir + (Math.random() - 0.5) * 1.8, v = 1.5 + Math.random() * 2.5; this.marks.spark(sx, hy, sz, Math.cos(a) * v, 0.5 + Math.random() * 1.8, Math.sin(a) * v, 0.3 + Math.random() * 0.15, crit ? 0xfff0c0 : 0xffb050); }
    if (this.stars.length > 8) this.stars.shift();
    this.flashes.push({ x: c.x, y: hy, z: c.z, until: G.time + (big ? 0.09 : 0.05), c: crit ? 0xffffff : 0xffc080, i: big ? 1.5 : 0.8 });
    if (this.flashes.length > 6) this.flashes.shift();
    if (crit && k !== 'jab') this.words.pop(behind ? 'Backstab' : m.counter ? 'Counter' : 'Crit', c.x, hy + 0.55, c.z, m.counter ? 'ev counter' : 'ev crit', 0.8);
    if (dn && size <= 2) this.words.pop('Down', c.x, hy + 0.35, c.z, 'ev down', 0.8);
    p.body.addXp(skillFor(w.w.kind), 3);
    bus.emit('combatHit', p, c, dmg, kind, crit);
  }

  /** friendly fire: the hit goes to the other survivor's machine through the existing hurt channel */
  private strikePlayer(p: Player, q: Player, m: Move, w: Wielded) {
    if (!G.sandbox.friendlyFire) return;
    const k = m.kind, spec = MOVES[k];
    const foot = k === 'shove' || k === 'tackle' || k === 'stomp';
    let dmg = (foot ? this.rng.float(1, 3) : this.rng.float(w.w.dmg[0], w.w.dmg[1])) * spec.dmg * w.dmgMul * (p.body.mods(p.heavyLoad()).attack ?? 1);
    if (k === 'heavy') dmg *= 1.2 + (w.feel.heavyMul - 1.2) * m.power;
    if (k === 'lunge') dmg *= w.feel.lungeMul;
    const kinds: HitInfo['kinds'] = foot || w.cls === 'unarmed' || w.cls === 'blunt' || w.cls === 'heavy' || w.cls === 'improvised' || w.cls === 'cyber' ? (dmg > 14 ? ['fracture', 'bruise'] : ['bruise']) : w.cls === 'spear' ? ['deep'] : ['laceration', 'deep'];
    const knock = (foot ? 1.2 : w.w.knock) * spec.knock * w.feel.knock;
    const hit: HitInfo = { dmg, kinds, corrupt: 0, height: k === 'stomp' ? 0.5 : 1.5, knock, from: [p.x, p.z], grab: false, by: p.id };
    G.net?.sendHurt?.(q.id, hit);
    q.registerHit(p.x, p.z, 'torso_u', Math.min(1.4, 0.3 + knock * 0.5));
    hitstop(spec.stop * 0.7); shake(spec.shake * 0.8, 0.2); kick(q.x - p.x, q.z - p.z, 0.15);
    G.audio?.hit?.(foot ? 'blunt' : w.hitKind, q.x, q.z, false);
    this.lastFight = G.time;
  }

  // ================================================================ shove, stomp, tackle
  shove(p: Player) {
    if (this.state === 'charge' || (this.move && !this.cancelable(this.move)) || this.qte.active || this.exec.active) return;
    if (p.body.endurance < 0.03) { bus.emit('think', p, 'No strength left to push.'); return; }
    const w = wielded(p);
    // something on the floor in front: stomp it
    const dir = Math.hypot(p.aimX - p.x, p.aimZ - p.z) > 0.3 ? Math.atan2(p.aimZ - p.z, p.aimX - p.x) : p.facing;
    let down: Creature | null = null, bd = 1.7;
    for (const c0 of G.creatures?.creatures?.values?.() || []) {
      const c = c0 as Creature;
      if (c.dead || c.zoneKey !== p.zoneKey || !isDown(c)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z) - c.radius;
      if (d < bd && Math.abs(angleDiff(dir, Math.atan2(c.z - p.z, c.x - p.x))) < 1.6) { bd = d; down = c; }
    }
    if (down) { this.startMove(p, 'stomp', w, down.id); return; }
    if (p.running && p.body.endurance > 0.12) { this.startMove(p, 'tackle', w); return; }
    this.startMove(p, 'shove', w);
  }

  private dodgeInput(p: Player) {
    const inp = G.input;
    if (inp.hit('run')) this.shiftT0 = G.time;
    if (inp.up('run') && G.time - this.shiftT0 < 0.2 && this.engaged(p)) {
      const mv = inp.moveAxis();
      const yaw = G.pr.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      this.startDodge(p, fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x);
      return;
    }
    for (const a of ['up', 'down', 'left', 'right'] as const) {
      if (!inp.hit(a)) continue;
      if (G.time - this.dirTap[a] < 0.24 && this.engaged(p)) {
        const yaw = G.pr.yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const [x, y] = a === 'up' ? [0, 1] : a === 'down' ? [0, -1] : a === 'left' ? [-1, 0] : [1, 0];
        this.startDodge(p, fx * y + rx * x, fz * y + rz * x);
        this.dirTap[a] = -9;
        return;
      }
      this.dirTap[a] = G.time;
    }
  }

  private startDodge(p: Player, dx: number, dz: number) {
    if (this.dodgeCd > 0 || this.qte.active || this.exec.active || p.body.dead || p.body.downed || p.inVehicle) return;
    if (this.move && this.move.landed === false && (this.move.kind === 'heavy' || this.move.kind === 'lunge') && this.move.t > this.move.dur * 0.3) return;
    if (p.body.endurance < 0.06) { bus.emit('think', p, 'Too winded to dodge.'); return; }
    const l = Math.hypot(dx, dz);
    const dir = l > 0.1 ? Math.atan2(dz, dx) : p.facing + Math.PI;
    const face = p.facing;
    const da = angleDiff(face, dir);
    const anim = Math.abs(da) < 0.7 ? 'cb_dodge_f' : Math.abs(da) > 2.3 ? 'cb_dodge_b' : da < 0 ? 'cb_dodge_l' : 'cb_dodge_r';
    if (this.state === 'charge') this.state = 'idle';
    this.btn = null;
    this.move = { kind: 'dodge', t: 0, dur: 0.3, hitAt: 0, landed: false, dir, power: 1, perfect: false, anim, step: MOVES.dodge.step, stepDone: 0, slow: 0, chain: 0, counter: false };
    this.state = 'strike';
    p.playAnim(anim, 0.3);
    p.body.endurance = Math.max(0, p.body.endurance - MOVES.dodge.stam);
    (p as any).cbIframe = G.time + 0.26;
    this.dodgeCd = 0.42;
    G.audio?.at?.('whoosh', p.x, p.z, 0.6);
    // a blow about to land on us: perfect
    for (const c0 of G.creatures?.creatures?.values?.() || []) {
      const c = c0 as Creature;
      if (c.dead || c.zoneKey !== p.zoneKey || c.attackPhase <= 0 || c.mem.cb?.pin) continue;
      if (c.mem.attackTarget && c.mem.attackTarget !== p.id) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) < (c.sp.attack?.range ?? 1) + c.radius + 1.2) { this.perfectDodge(p, [c.x, c.z], c.id); break; }
    }
    // keep facing the fight while stepping out of it
    this.move.face = face;
    p.facing = p.targetFacing = face;
  }

  private perfectDodge(p: Player, from: [number, number], id?: string) {
    if (this.combo.counter && G.time < this.combo.counter.until) return;
    slowmo(0.3, 520);
    G.audio?.at?.('cb_perfect', p.x, p.z, 0.8);
    this.words.pop('Dodge', p.x, p.y + 2.2, p.z, 'ev dodge', 0.9);
    this.combo.counter = { until: G.time + 1.4, id };
    p.body.endurance = Math.min(1, p.body.endurance + 0.05);
    punch(-0.03, 0.3);
    void from;
  }

  // ================================================================ struggles (victim side)
  private onPlayerHit(p: Player, _part: string, _kind: string, h: HitInfo) {
    if (!p.isLocal || p.body.dead) return;
    // a survivor's blow (friendly fire)
    if (G.players.has(h.by)) {
      if (h.knock >= 1.2) p.playAnim('stagger', 0.8);
      return;
    }
    this.lastFight = G.time;
    // an interrupted wind-up
    if (this.state === 'charge') { this.state = 'idle'; this.btn = null; if (p.actionAnim === 'cb_charge') p.stopAnim(); }
    if (h.tear || this.qte.active || this.struggleCd > 0 || this.exec.active) return;
    const c = this.findAttacker(p, h.by, h.from);
    if (!c) return;
    const size = sizeClass(c);
    if (h.grab) this.startGrab(p, c, 'grab', size);
    else if ((size === 3 || (size === 2 && h.dmg >= 12)) && Math.random() < (size === 3 ? 0.3 : 0.16)) this.startGrab(p, c, 'pin', size);
  }

  private findAttacker(p: Player, sp: string, from: [number, number]): Creature | null {
    let best: Creature | null = null, bd = 3.5;
    for (const c0 of G.creatures?.creatures?.values?.() || []) {
      const c = c0 as Creature;
      if (c.dead || c.zoneKey !== p.zoneKey || c.sp.key !== sp) continue;
      const d = Math.hypot(c.x - from[0], c.z - from[1]);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  private stagesFor(size: number, reason: string): Stage[] {
    const s: Stage[] = [{ kind: 'mash', need: 1 }];
    if (size >= 2) s.push(reason === 'pin' ? { kind: 'alt', need: 1 } : { kind: 'timed', need: 2 });
    if (size >= 3) s.push(reason === 'pin' ? { kind: 'timed', need: 2 } : { kind: 'alt', need: 1 });
    return s;
  }

  private startGrab(p: Player, c: Creature, reason: 'grab' | 'pin', size: number) {
    const stages = this.stagesFor(size, reason);
    const dur = 2.4 + stages.length * 1.1;
    p.actions.clear();
    this.resetMoves(p);
    const act = new StruggleAction(p, reason === 'pin' ? 'cb_pinned' : 'cb_struggle', dur + 1, { x: c.x, z: c.z });
    p.actions.add(act);
    cbOp({ t: 'pin', id: c.id, pid: p.id, dur: dur + 0.5 });
    this.struggleCd = 7;
    const end = () => { act.done = true; if (p.actionAnim === 'cb_pinned' || p.actionAnim === 'cb_struggle') p.stopAnim(); };
    this.qte.start({
      reason, cid: c.id, dur, stages, grip: 0.8 + size * 0.2, act,
      onWin: (perfect) => {
        end();
        cbOp({ t: 'qte', id: c.id, pid: p.id, r: perfect ? 'perfect' : 'win' });
        this.brokeFree(p, c, perfect);
        if (reason === 'pin') p.playAnim('get_up', 0.9);
      },
      onLose: () => {
        end();
        cbOp({ t: 'qte', id: c.id, pid: p.id, r: 'lose' });
        this.noTearQte = G.time + 4;
        this.words.pop(reason === 'pin' ? 'Mauled' : 'Bitten', p.x, p.y + 2.2, p.z, 'ev bad', 1);
        shake(0.8, 0.4);
        if (reason === 'pin') p.playAnim('get_up', 1.4);
      },
    });
  }

  /** a limb-tearing grip has started: fight it */
  private pollTear(p: Player) {
    const a = p.actions.current;
    if (!(a instanceof TornAction) || !a.started || a.ripped || this.qte.active || a.t >= a.hold * 0.8 || G.time < this.noTearQte) return;
    if ((a as any).cbSeen) return;
    (a as any).cbSeen = true;
    const c = this.findAttacker(p, a.by, a.from);
    const size = c ? sizeClass(c) : 2;
    const stages = this.stagesFor(size, 'tear');
    const extra = 0.5 + stages.length * 0.65;
    a.hold += extra; a.duration += extra; a.showBar = false;
    if (c) cbOp({ t: 'tear+', id: c.id, pid: p.id, add: extra });
    this.resetMoves(p);
    this.qte.start({
      reason: 'tear', cid: c?.id ?? null, dur: Math.max(1.2, a.hold - a.t - 0.05), stages, grip: 0.8 + size * 0.2, act: a,
      onWin: (perfect) => {
        a.done = true;
        p.body.addInjury(a.part, 'laceration', perfect ? 0.3 : 0.6, { dirty: true });
        if (c) { cbOp({ t: 'tearX', id: c.id, pid: p.id, perfect: perfect ? 1 : undefined }); this.brokeFree(p, c, perfect); }
        bus.emit('think', p, perfect ? 'NOT TODAY.' : 'I got it loose— move!');
      },
      onLose: () => { this.words.pop('Ripped', p.x, p.y + 2.2, p.z, 'ev bad', 1.2); },
    });
  }

  private brokeFree(p: Player, c: Creature, perfect: boolean) {
    p.playAnim('shove', 0.45);
    hitstop(perfect ? 110 : 70); shake(perfect ? 0.8 : 0.5, 0.35); punch(perfect ? 0.08 : 0.05, 0.3);
    kick(c.x - p.x, c.z - p.z, 0.4);
    G.audio?.at?.('cb_break', p.x, p.z, 1);
    flinch(c, c.x - p.x, c.z - p.z, 1.4);
    this.words.pop(perfect ? 'Reversal' : 'Broke free', p.x, p.y + 2.2, p.z, perfect ? 'ev perfect' : 'ev free', 1.1);
    if (perfect) {
      slowmo(0.35, 600);
      this.combo.counter = { until: G.time + 1.8, id: c.id };
      G.audio?.at?.('cb_perfect', p.x, p.z, 0.8);
    }
    this.lastFight = G.time;
  }

  // ================================================================ the world layer: rings, glow, prompts, telegraphs, stars
  private drawWorld(dt: number) {
    const p = G.local;
    if (!p || !G.view) return;
    const M = this.marks;
    const now = performance.now();
    void dt;
    // the charge: a ring filling under the feet, the weapon hand glowing
    if (this.state === 'charge') {
      const ch = this.charge;
      const full = ch.fullT >= 0, perfect = full && G.time - ch.fullT <= 0.3, over = full && !perfect;
      // hot metal: dull red, orange, then white at the moment to let go
      const col = perfect ? (Math.sin(now / 30) > 0 ? 0xfff4d8 : 0xffd890) : over ? 0xc84a20 : ch.lvl > 0.66 ? 0xffa040 : 0xd86030;
      // a brass pressure gauge over the head: the needle climbs into the red; it rattles when held too long
      const rattle = over ? Math.sin(now / 17) * 0.03 : 0;
      M.mark(gaugeName(ch.lvl, perfect), p.x + rattle, p.y + 2.25 + (perfect ? 0.03 : 0), p.z, { scale: perfect ? 1.12 : 1 });
      this.glowAt(p, ch.lvl, col, now);
      // the weapon heats: embers come off it, a shower of sparks at the moment to let go
      const hand = this.handPos(p);
      if (ch.lvl > 0.5 && Math.random() < ch.lvl * 0.35) M.spark(hand.x, hand.y, hand.z, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, 0.35, 0xffa040, 1, 3);
      if (perfect && !ch.perfectShown) { ch.perfectShown = true; for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, v = 1.5 + Math.random() * 2; M.spark(hand.x, hand.y, hand.z, Math.cos(a) * v, 1 + Math.random() * 2, Math.sin(a) * v, 0.45, 0xfff0c0, 1, 8); } }
    }
    // peers winding up
    for (const q of G.players.values()) {
      if (q.isLocal || q.zoneKey !== p.zoneKey || q.actionAnim !== 'cb_charge') continue;
      const lvl = Math.min(1, ((q as any).visT ?? q.actionT) / Math.max(0.2, q.actionDur || 1));
      this.glowAt(q, lvl, lvl >= 1 ? 0xfff4d8 : 0xffa040, now);
    }
    // impact stars and flashes
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i], u = (now - s.t0) / 130;
      if (u >= 1) { this.stars.splice(i, 1); continue; }
      M.mark('star', s.x, s.y, s.z, { color: s.c, scale: s.s * (0.7 + u * 0.8), opacity: 1 - u, add: true, rot: s.t0 % 1.57 });
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (G.time > f.until) { this.flashes.splice(i, 1); continue; }
      G.pointLight(f.x, f.y, f.z, f.c, f.i, 4);
    }
    // creatures: wind-up telegraphs, staggered spirals, execution prompts
    const touch = !!this.touch()?.active;
    let promptShown = false;
    for (const c0 of G.creatures?.creatures?.values?.() || []) {
      const c = c0 as Creature;
      if (c.dead || c.zoneKey !== p.zoneKey || !c.visibleToLocal) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 10) continue;
      const top = c.y + Math.min(2.5, c.height + 0.3);
      const pinning = !!(c.mem.netMem?.cbp);
      if (c.attackPhase > 0 && !pinning && !c.tamedBy) {
        let t0 = this.lastTel.get(c);
        if (t0 === undefined || G.time - t0 > 1.2) { t0 = G.time; this.lastTel.set(c, t0); if (d < 4) G.audio?.at?.('cb_tick', c.x, c.z, 0.5); }
        if (G.time - t0 < 0.45) M.mark('warn', c.x, top + 0.15 + Math.max(0, 0.12 - (G.time - t0)), c.z, { scale: 1 + Math.max(0, 0.1 - (G.time - t0)) * 4 });
      }
      if (isStunned(c)) M.mark('dizzy', c.x, top, c.z, { rot: Math.sin(now / 160) * 0.4 });
      if (!promptShown && !inExec(c) && d < 3.4 && executable(c)) {
        promptShown = true;
        M.mark('badge:skull', c.x, top + 0.38 + (d < 2.2 ? Math.sin(now / 90) * 0.03 : 0), c.z, { color: d < 2.2 ? 0xffffff : 0x9a8c78 });
        if (d < 2.2) { const rt = { x: Math.cos(G.pr.yaw), z: -Math.sin(G.pr.yaw) }; this.words.prompt(touch ? 'Tap' : (G.input.keyName('interact') || 'E').toUpperCase(), 'finish it', c.x + rt.x * 0.55, top + 0.3, c.z + rt.z * 0.55, 'hot'); }
      }
    }
    // a counter window is open
    const ctr = this.combo.counter;
    // a counter is open: pale chalk scratches round the feet, rubbed out as the moment passes
    if (ctr && G.time < ctr.until) M.ring(p.x, p.y, p.z, 0.9, (ctr.until - G.time) / 1.6, 0xf2ead0, 0x2a2016, 0.8);
    // the run of blows: a count hanging by the shoulder
    if (this.combo.hits >= 2 && G.time - this.combo.hitT < 1.6) {
      const n = this.combo.hits, rt = { x: Math.cos(G.pr.yaw), z: -Math.sin(G.pr.yaw) };
      const bump = 1 + Math.max(0, 0.18 - (G.time - this.combo.hitT)) * 2.2;
      this.words.prompt('\u00d7' + n, '', p.x + rt.x * 0.75, p.y + 1.75, p.z + rt.z * 0.75, 'count' + (n >= 8 ? ' max' : n >= 5 ? ' hi' : ''), bump);
    }
    // a heavy swing leaves a smear of embers behind the weapon
    const mv = this.move;
    if (mv && (mv.kind === 'heavy' || mv.kind === 'lunge' || mv.kind === 'flurryEnd' || mv.kind === 'slash') && mv.t > mv.dur * (mv.hitAt - 0.2) && mv.t < mv.dur * (mv.hitAt + 0.12)) {
      const h = this.handPos(p);
      M.spark(h.x, h.y, h.z, 0, 0, 0, 0.16, mv.perfect ? 0xfff0c0 : 0xffa050, 2, 0);
    }
  }

  private handPos(q: Player): THREE.Vector3 {
    const hand = (q.rig as any)?.j?.handR as THREE.Object3D | undefined;
    if (hand) hand.getWorldPosition(_v); else _v.set(q.x, q.y + 1.2, q.z);
    return _v;
  }
  private glowAt(q: Player, lvl: number, col: number, now: number) {
    this.handPos(q);
    const pulse = Math.sin(now / (lvl >= 1 ? 45 : 110)) * 0.15;
    this.marks.mark('glow', _v.x, _v.y, _v.z, { color: col, add: true, scale: 0.5 + lvl * 0.8 + pulse, opacity: 0.25 + lvl * 0.5 });
    G.pointLight(_v.x, _v.y, _v.z, col, 0.35 + lvl * 1.1 + pulse * 0.5, 2.6);
  }

  // ================================================================ legacy verbs (guns, throwing, world hits, wear)
  /** a plain light strike now (older callers) */
  attack(p: Player) { const w = wielded(p); if (w.ranged) { if (w.w.kind === 'firearm') this.shoot(p, w.it!, w.w); else this.throwItem(p, w.it!); } else this.startMove(p, 'light', w); }

  private hitWorld(p: Player, w: any, it: Item | null = null) {
    // furniture, walls (src/world/destruction.ts)
    if (G.destruct?.meleeWorld?.(p, w, it)) return;
    const z = G.getZone(p.zoneKey);
    const fx = p.x + Math.cos(p.facing) * 0.9, fz = p.z + Math.sin(p.facing) * 0.9;
    const tx = Math.floor(fx), ty = Math.floor(fz);
    // windows in reach get smashed by a swing
    for (const [x, y, side] of [[tx, ty, 0], [tx, ty, 1], [tx, ty + 1, 0], [tx + 1, ty, 1]] as [number, number, 0 | 1][]) {
      const e = z.edge(x, y, side);
      if (!e) continue;
      const ex = side === 0 ? x + 0.5 : x, ez = side === 0 ? y : y + 0.5;
      if (Math.hypot(ex - p.x, ez - p.z) > 1.3) continue;
      if (e.kind === 'window' && e.glass === 'intact') {
        op('edge', { z: z.key, x, y, side, patch: { glass: 'broken' } });
        G.audio?.at?.('glass_break', ex, ez);
        noise(p, ex, ez, 22, 'glass');
        return;
      }
      if ((e.kind === 'door' || e.kind === 'window') && e.barricade > 0) {
        G.audio?.at?.('wood_hit', ex, ez);
        return;
      }
    }
  }

  private wear(p: Player, it: Item, n = 1) {
    const d = itemDef(it.key);
    const dur = d.weapon?.durability ?? 12;
    const mk = (p.body.skill('mechanics') > 3 ? 0.8 : 1);
    if (this.rng.chance(1 / Math.max(1, dur) * 2.2 * mk * n)) it.cond = Math.max(0, it.cond - 0.1);
    if (it.cond <= 0) {
      p.removeItem(it);
      bus.emit('think', p, `My ${d.name.toLowerCase()} broke!`);
      G.audio?.at?.('break', p.x, p.z);
      bus.emit('inventoryChanged', p);
    }
  }

  shoot(p: Player, it: Item, w: any) {
    this.rangedCd = p.attackCooldown = 1 / Math.max(0.3, w.speed);
    if ((it.ammo ?? 0) <= 0) { G.audio?.at?.('dryfire', p.x, p.z); bus.emit('think', p, 'Empty.'); return; }
    it.ammo = (it.ammo ?? 0) - 1;
    p.playAnim('shoot', 0.3);
    const aim = p.body.mods(0).aim * (1 + p.body.skill('firearm') * 0.05);
    // from the hip it goes wide
    const spread = (w.spread ?? 0.08) / Math.max(0.25, aim) * (p.aiming ? 1 : 1.7);
    const ang = Math.atan2(p.aimZ - p.z, p.aimX - p.x) + this.rng.gauss(0, spread);
    p.facing = p.targetFacing = ang;
    G.audio?.gun?.(it.key, p.x, p.z);
    G.pointLight(p.x + Math.cos(ang) * 0.6, p.y + 1.3, p.z + Math.sin(ang) * 0.6, 0xffd090, 3, 6);
    noise(p, p.x, p.z, w.noise, 'gun');
    shake(0.45, 0.2); kick(-Math.cos(ang), -Math.sin(ang), 0.12);
    this.lastFight = G.time;
    // hitscan along the tile grid
    const z = G.getZone(p.zoneKey);
    const cs = G.creatures;
    let best: any = null, bd = 30, bq: Player | null = null;
    for (const c of cs?.creatures.values() || []) {
      const cc: any = c;
      if (cc.dead || cc.zoneKey !== p.zoneKey) continue;
      const dx = cc.x - p.x, dz = cc.z - p.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      const perp = Math.abs(-Math.sin(ang) * dx + Math.cos(ang) * dz);
      const along = Math.cos(ang) * dx + Math.sin(ang) * dz;
      if (along < 0 || perp > cc.radius + 0.1) continue;
      if (!lineOfSight(z, p.x, p.z, cc.x, cc.z)) continue;
      best = cc; bd = d;
    }
    if (G.sandbox.friendlyFire) for (const q of G.players.values()) {
      if (q === p || q.body.dead || q.zoneKey !== p.zoneKey) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(-Math.sin(ang) * dx + Math.cos(ang) * dz) > 0.35 || Math.cos(ang) * dx + Math.sin(ang) * dz < 0 || !lineOfSight(z, p.x, p.z, q.x, q.z)) continue;
      bq = q; bd = d; best = null;
    }
    if (bq) {
      const hit: HitInfo = { dmg: this.rng.float(w.dmg[0], w.dmg[1]) * (1 - bd / 60), kinds: ['bullet' as any], corrupt: 0, height: 1.5, knock: w.knock, from: [p.x, p.z], grab: false, by: p.id };
      G.net?.sendHurt?.(bq.id, hit); bq.registerHit(p.x, p.z, 'torso_u', 0.8);
    } else if (best) {
      const crit = this.rng.chance(w.crit ?? 0);
      this.dealCreature(p, best, { dmg: this.rng.float(w.dmg[0], w.dmg[1]) * (1 - bd / 60), kind: 'firearm', knock: w.knock, crit, po: 14 });
      p.body.addXp('firearm', 4);
    }
    // what the bullet hits before (or instead of) a creature: windows, walls, furniture
    else G.destruct?.bulletWorld?.(p, ang, 30, w);
  }

  throwItem(p: Player, it: Item) {
    const d = itemDef(it.key);
    this.rangedCd = p.attackCooldown = 0.6;
    p.playAnim('throw', 0.6);
    p.removeItem(it);
    const dist = clamp(Math.hypot(p.aimX - p.x, p.aimZ - p.z), 1.5, 9 + p.body.skill('strength'));
    const ang = Math.atan2(p.aimZ - p.z, p.aimX - p.x);
    const t = 0.65;
    const vx = Math.cos(ang) * dist / t, vz = Math.sin(ang) * dist / t;
    op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x + Math.cos(ang) * 0.4, zz: p.z + Math.sin(ang) * 0.4, y: p.y + 1.4, v: [vx, 3.2, vz] });
    setTimeout(() => {
      const lx = p.x + Math.cos(ang) * dist, lz = p.z + Math.sin(ang) * dist;
      noise(p, lx, lz, d.key === 'noisemaker' ? 30 : 12, 'thrown');
      if (d.weapon?.fire) G.items?.startFire?.(p.zoneKey, Math.floor(lx), Math.floor(lz), 2);
      if (d.key.includes('bottle') || d.weapon?.fire) G.audio?.at?.('glass_break', lx, lz);
      // thrown hits
      for (const c of G.creatures?.creatures.values() || []) {
        const cc: any = c;
        if (!cc.dead && cc.zoneKey === p.zoneKey && Math.hypot(cc.x - lx, cc.z - lz) < 1.2 && d.weapon) G.creatures.damage(p.id, cc.id, this.rng.float(d.weapon.dmg[0], d.weapon.dmg[1]), p.x, p.z, 0.3, d.weapon.fire ? 'fire' : 'thrown');
      }
    }, t * 1000);
    bus.emit('inventoryChanged', p);
  }

  /** dev / tests: a snapshot of the fight state */
  debug() {
    return { state: this.state, move: this.move ? { kind: this.move.kind, t: +this.move.t.toFixed(2), landed: this.move.landed } : null, charge: +this.charge.lvl.toFixed(2), chain: this.combo.chain, hits: this.combo.hits, barrage: this.combo.barrage, ground: this.combo.ground, counter: this.combo.counter, qte: this.qte.cur ? { reason: this.qte.cur.reason, stage: this.qte.cur.si, prog: +this.qte.cur.prog.toFixed(2) } : null, lastQte: this.qte.last, exec: this.exec.cur ? this.exec.cur.def.key : null, lastExec: this.exec.last, log: this.combo.log.slice(-8).map((l) => l.k) };
  }
}

export function skillFor(kind: string): any {
  switch (kind) { case 'blade': return 'blade'; case 'spear': return 'spear'; case 'firearm': return 'firearm'; case 'axe': return 'blade'; default: return 'blunt'; }
}

/** host / solo: turn friendly fire on or off for everyone (sandbox setting) */
export function setFriendlyFire(on: boolean) { cbOp({ t: 'ff', on: on ? 1 : 0 }); }

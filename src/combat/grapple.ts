// Grapples: when something grabs you, pins you, swallows you or starts pulling a limb off, the body fights it on
// its own. No prompts, no keys, no gauges: the outcome is worked out from what the unit has (strength, adrenaline,
// breath, pain, the arms and legs it still has the use of, what is in its hand, whether the thing came at it from
// behind) against how hard the thing holds, and it plays out as a few physical heaves on the HumanRig: arms locked
// out against it, a wrench, a knee, a stab with whatever is in the hand. Each heave jolts the body and the camera;
// the last one either throws the thing off (it recoils, reels, sometimes goes down) or it wins and bites.
// Callers (src/game/combat.ts, the queen's stomach, the land jelly) get onWin(clean) / onLose() exactly as before.
import { G } from '../game/G';
import type { Player } from '../entities/player';
import { TimedAction } from '../actions/action';
import { TornAction } from '../survival/limbSystem';
import { shake, punch, hitstop, kick } from '../gfx/juice';
import { bus } from '../core/events';
import { wielded } from './moves';
import { angleDiff } from '../core/math';
import { flinch } from './creatureState';
import { masteryRank, moveOwned } from '../game/professions';
import type { Creature } from '../creatures/creature';

export interface GrappleOpts {
  reason: 'tear' | 'grab' | 'pin';
  cid: string | null;
  /** the longest the thing can hold on before it gets what it wanted */
  dur: number;
  /** how hard it holds: 0.6 (a small thing) .. 1.6 (something that swallows you) */
  grip: number;
  act?: TimedAction | null;
  onWin: (clean: boolean) => void;
  onLose: () => void;
}

/** locks the unit in place while a grab / pin is fought (the tear has its own TornAction). No plate over the head. */
export class GrappleAction extends TimedAction {
  constructor(p: Player, anim: string, dur: number, face?: { x: number; z: number }) {
    super(p);
    this.name = 'Held'; this.anim = anim as any; this.duration = dur; this.fixedTime = true;
    this.locks = true; this.canMove = false; this.showBar = false; this.face = face;
  }
  private flashSaved: { anim: any; t: number; dur: number } | null = null;
  /** a short one-shot over the hold (a stab, a knee) on the action's own clock, then back into the hold where it was */
  flash(anim: string, dur: number) {
    if (this.flashSaved || !this.started || this.done) return;
    this.flashSaved = { anim: this.anim, t: this.t, dur };
    this.anim = anim as any; this.t = 0;
  }
  update() {
    this.p.speed = 0;
    const f = this.flashSaved;
    if (f && this.t >= f.dur) { this.anim = f.anim; this.t = f.t + this.t; this.flashSaved = null; }
  }
  perform() { /* ends with the grapple */ }
}

// a limb-tearing grip that the grapple owns does not rip while the body is still fighting it
let owns: (a: unknown) => boolean = () => false;
const tornUpdate = TornAction.prototype.update;
TornAction.prototype.update = function (this: TornAction, dt: number) {
  if (owns(this) && !this.ripped && this.t < this.hold) { this.p.speed = 0; return; }
  tornUpdate.call(this, dt);
};

interface Cur extends GrappleOpts {
  t: number; prog: number; heaves: number; wins: number;
  /** per-heave odds of gaining on it, fixed when the grapple starts (the body's state then) */
  odds: number;
  next: number; done: boolean;
  /** the unit's edge, for the ending: a blade or a club in the hand gets used */
  armed: 'blade' | 'blunt' | '';
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class Grapples {
  cur: Cur | null = null;
  /** results for tests / other systems */
  last: { reason: string; win: boolean; clean: boolean; t: number; odds: number; heaves: number } | null = null;

  constructor() { owns = (a) => !!this.cur && !this.cur.done && this.cur.act === a; }

  get active() { return !!this.cur && !this.cur.done; }

  start(o: GrappleOpts) {
    if (this.active) return false;
    const p = G.local;
    if (!p) return false;
    const c = o.cid ? G.creatures?.creatures?.get?.(o.cid) as Creature | undefined : undefined;
    const might = this.might(p, c, o.reason);
    const odds = clamp(0.5 + (might - o.grip) * 0.55, 0.12, 0.9);
    const w = wielded(p);
    const armed: Cur['armed'] = !w.armed || w.ranged ? '' : w.cls === 'blade' || w.cls === 'spear' || w.cls === 'axe' ? 'blade' : 'blunt';
    this.cur = { ...o, t: 0, prog: 0, heaves: 0, wins: 0, odds, next: 0.45 + Math.random() * 0.15, done: false, armed };
    // the moment it takes hold: a jolt and a short lean in, nothing on the screen
    punch(0.06, 0.3); shake(0.35, 0.3);
    G.camera?.pushIn?.(0.12, 0.35, -4);
    G.audio?.at?.('body_thud', p.x, p.z, 0.8);
    G.audio?.at?.('cb_grunt', p.x, p.z, 0.6);
    return true;
  }

  private finish(win: boolean) {
    const c = this.cur!;
    c.done = true;
    const clean = win && c.heaves <= 2 && c.wins === c.heaves;
    this.last = { reason: c.reason, win, clean, t: c.t, odds: +c.odds.toFixed(2), heaves: c.heaves };
    bus.emit('struggle', { reason: c.reason, win, perfect: clean, cid: c.cid });
    G.camera?.pushIn?.(0, 0.4);
    this.cur = null;
    try { if (win) c.onWin(clean); else c.onLose(); } catch (e) { console.error('grapple', e); }
  }

  /** abandon without a result (the unit died, changed zone...) */
  cancel() { if (this.cur) { this.cur.done = true; this.cur = null; G.camera?.pushIn?.(0, 0.4); } }

  /**
   * how much the body has to fight with: strength, adrenaline, breath, pain, the limbs it can use, what it holds,
   * and where the thing has it (from behind is worse; a pin with bad legs is worse still)
   */
  might(p: Player, c?: Creature, reason = 'grab') {
    const b = p.body;
    let m = 1 + b.skill('strength') * 0.06 + (b.adrenaline > 0 ? 0.25 : 0) - (b.endurance < 0.2 ? 0.25 : 0) - Math.min(0.4, b.pain() / 250);
    try { m *= (G as any).cyber?.combat?.(G.local)?.dmgMul ? 1.25 : 1; } catch { /* no cyberware */ }
    try {
      const L: any = b.severed.length ? b.limbs() : null;
      if (L && !L.twoHand) m -= 0.3;
      if (L && reason === 'pin' && (L.legs ?? 2) < 2) m -= 0.15;
    } catch { /* no limb model */ }
    const w = wielded(p);
    if (w.armed && !w.ranged) m += w.cls === 'blade' || w.cls === 'spear' ? 0.3 : w.cls === 'axe' ? 0.25 : 0.15;
    else if (w.it && !w.ranged) m += 0.08;
    // round 25: mastery of what is in the hand (bare hands count as improvised), and the Counter learnt
    if (!w.ranged) m += masteryRank(w.armed ? w.cls : 'improvised') * 0.07 + (moveOwned('counter') ? 0.1 : 0);
    if (c) {
      const toIt = Math.atan2(c.z - p.z, c.x - p.x);
      if (Math.abs(angleDiff(p.facing, toIt)) > 2.1) m -= 0.25;
    }
    return Math.max(0.4, m);
  }

  update(dt: number) {
    const c = this.cur;
    const p = G.local;
    if (!c || c.done || !p) return;
    if (p.body.dead || (c.act && (c.act.done || c.act.cancelled || (c.act as any).ripped))) { this.cancel(); return; }
    // the thing holding us is gone: free
    const k = c.cid ? G.creatures?.creatures?.get?.(c.cid) as Creature | undefined : undefined;
    if (c.cid && (!k || k.dead)) { this.finish(true); return; }
    c.t += dt;
    if (c.t >= c.next) {
      // one heave: the body throws everything into it; the dice are the body's own odds
      c.heaves++;
      const gain = Math.random() < c.odds;
      if (gain) { c.wins++; c.prog += 0.42 + c.odds * 0.25; } else c.prog = Math.max(0, c.prog - 0.12);
      this.heave(p, k, c, gain);
      c.next = c.t + 0.55 + Math.random() * 0.3 + (gain ? 0 : 0.15);
      if (c.prog >= 1) { this.finish(true); return; }
    }
    if (c.t >= c.dur) this.finish(false);
  }

  /** a heave seen and felt: the trunk wrenches, the camera jolts, breath goes, a blade or a club gets used */
  private heave(p: Player, k: Creature | undefined, c: Cur, gain: boolean) {
    const side = c.heaves % 2 ? 1 : -1;
    p.anim?.nudge?.(gain ? -0.9 : 0.7, side * 1.1, gain ? 0.05 : -0.08);
    p.body.endurance = Math.max(0, p.body.endurance - 0.03);
    p.exertionTimer = 1;
    shake(gain ? 0.28 : 0.2, 0.18);
    G.audio?.at?.('cb_grunt', p.x, p.z, gain ? 0.6 : 0.4);
    if (!k) return;
    const dx = k.x - p.x, dz = k.z - p.z;
    if (gain) {
      kick(dx, dz, 0.12);
      flinch(k, dx, dz, 0.6);
      if (c.armed) {
        // the weapon hand gets a blow in: short, ugly, close (on the hold's own clock; never from a pin on the back)
        // (with the Counter learnt the first good heave is a full counter blow: src/game/professions.ts)
        const ctr = moveOwned('counter') && c.wins === 1;
        if (c.act instanceof GrappleAction && c.reason !== 'pin') c.act.flash(ctr ? 'cb_counter' : c.armed === 'blade' ? 'cb_jab' : 'cb_heavy', ctr ? 0.42 : c.armed === 'blade' ? 0.24 : 0.42);
        G.combat?.dealCreature?.(p, k, { dmg: (3 + Math.random() * 4) * (ctr ? 2.2 : 1) * (1 + masteryRank(c.armed === 'blade' ? 'blade' : 'blunt') * 0.08), kind: c.armed === 'blade' ? 'blade' : 'blunt', knock: ctr ? 0.6 : 0.2, po: ctr ? 25 : 10 });
        G.audio?.hit?.(c.armed === 'blade' ? 'blade' : 'blunt', k.x, k.z, false);
        G.audio?.at?.(c.armed === 'blade' ? 'flesh_cut' : 'bone_crunch', k.x, k.z, 0.6);
        hitstop(45);
      } else {
        // a knee, a forearm in its face
        if (c.act instanceof GrappleAction && c.reason === 'grab' && c.heaves === 1) c.act.flash(moveOwned('kick') ? 'cb_shove_kick' : 'cb_kick', moveOwned('kick') ? 0.5 : 0.4);
        G.audio?.at?.('body_thud', k.x, k.z, 0.5);
      }
    } else {
      // it wrenches back: the body is pulled toward it
      kick(-dx, -dz, 0.1);
      G.audio?.at?.('gore_squelch', p.x, p.z, 0.25);
    }
  }
}

// Limb loss in play (G.limbs). Runs on every machine for its own survivor:
//  - sever(): a limb comes off: Body.severed, a stump wound that pumps blood
//    until it is treated, shock (pain, panic, trauma for the mind), whatever
//    the hand held falls, the limb drops to the floor (floor-item op, so
//    everyone sees it fly) and the gore system sprays and screams for all.
//  - startTear(): a creature's grab-and-rip (decided on the host in the
//    creature manager): the survivor is held, pulled, and the limb comes
//    away. SPACE (shove) might tear you free first.
//  - stump care from the world right-click menu (tourniquet, cauterising in a
//    flame or with a hot blade, stitching, bandaging) for yourself or a
//    teammate, crutches and prosthetics, phantom limb pain, tourniquets left
//    on too long, cars hitting pedestrians, severed limbs rotting.
//  - remote survivors: their severed parts / stumps arrive in the outfit
//    condition (netState) and are mirrored onto their local Body so the rig,
//    the animation and the medical menus (teammate treatment) see them.
// The model (which parts, levels, gaits, multipliers) is src/survival/limbs.ts.
import { G } from '../game/G';
import type { GameSystem } from '../game/game';
import { bus } from '../core/events';
import { Rng } from '../core/rng';
import { op } from '../game/ops';
import type { Player } from '../entities/player';
import { HumanRig } from '../entities/humanRig';
import { BodyPart, Item, itemDef } from '../items/item';
import { serializeItem, createItem } from '../items/factory';
import { floorItems } from '../items/worldItems';
import { itemGeometry } from '../items/itemMeshes';
import { PART_NAMES } from './body';
import { TEARS } from '../gore/tearing';
import { TimedAction } from '../actions/action';
import { queueAt, WearAction } from '../actions/basic';
import { ClimbAction } from '../actions/world';
import { CraftAction } from '../interact/crafting';
import { BandageAction, RemoveTourniquetAction, CauterizeAction, CloseStumpAction, isTourniquet, isStump, tourniquetable, stumpLabel } from '../actions/medical';
import type { Recipe } from '../items/recipes';
import type { MenuOption } from '../ui/ui';
import type { HitInfo } from '../creatures/manager';
import { chainOf, distalOf, isLimbPart, lossName, lossLevel, stumpBleed, CHAINS, PROSTHETICS, slotOf, prostFits, noAids, Side, LimbKind, StumpCond } from './limbs';

export interface SeverCause { how: 'bite' | 'crush' | 'tear' | 'wrench' | 'pull' | 'snap' | 'vehicle' | 'blade'; by?: string; from?: [number, number] }

const VERB_HOW: Record<string, SeverCause['how']> = { bite: 'bite', crush: 'crush', wrench: 'wrench', pull: 'pull', snap: 'snap' };
const LIMB_ITEM: Record<LimbKind, string[]> = { arm: ['limb_arm', 'limb_forearm', 'limb_hand'], leg: ['limb_leg', 'limb_shin', 'limb_foot'] };
/** hours before a severed limb turns */
const ROT_HOURS = 30;

const SCREAM: string[] = ['MY ARM—', 'NO NO NO NO—', 'IT TOOK IT— IT TOOK IT—', 'GET IT OFF—', 'AAAAAAAH—'];
const PHANTOM: Record<LimbKind, string[]> = {
  arm: ['My fingers are cramping. My fingers are not there.', 'My hand itches. The hand I do not have.', 'I keep reaching with it.', 'It feels like it is clenched, all the time.'],
  leg: ['My foot is burning. I do not have a foot.', 'My toes are cold. Which toes?', 'I can feel my knee bend. It is not there.', 'The leg that is gone is aching.'],
};

/** two-handed work: hammering, sawing, sewing, carpentry, tailoring (unless a recipe is made for one hand) */
export function needsTwoHands(r: Recipe): boolean {
  if (ONE_HAND_OK.has(r.key)) return false;
  return r.anim === 'hammer' || r.anim === 'saw' || r.anim === 'stitch' || r.category === 'carpentry' || r.category === 'tailoring' || r.key.startsWith('rip');
}
const ONE_HAND_OK = new Set(['make_hook_hand', 'tourniquet_belt', 'tourniquet_rags', 'tourniquet_strips', 'make_crutch_pipe']);

/** the survivor's hold, pull and rip (locks movement; SPACE may tear you free) */
export class TornAction extends TimedAction {
  ripped = false;
  private struggle = 0;
  constructor(p: Player, public part: BodyPart, public hold: number, public verb: string, public by: string, public from: [number, number]) {
    super(p);
    const c = chainOf(part);
    this.anim = (c ? `torn_${c.kind}_${c.side}` : 'flinch') as any;
    this.name = 'HELD! (SPACE to break free)';
    this.duration = hold + 0.7;
    this.fixedTime = true; this.locks = true; this.canMove = false;
    this.face = { x: from[0], z: from[1] };
  }
  start() { G.audio?.hurt?.(this.p); }
  update(dt: number) {
    const p = this.p;
    p.speed = 0;
    if (this.ripped) return;
    if (this.t < this.hold) {
      if (G.input?.hit?.('shove')) {
        this.struggle++;
        const free = 0.1 + p.body.skill('strength') * 0.025 + (p.body.adrenaline > 0 ? 0.08 : 0) + this.struggle * 0.03;
        if (Math.random() < free) {
          bus.emit('halo', p, 'Tore free!', 'good');
          bus.emit('think', p, 'I got it loose— RUN.');
          p.body.addInjury(this.part, 'laceration', 0.7, { dirty: true });
          this.done = true;
          return;
        }
        G.pr.shake = Math.max(G.pr.shake, 0.4);
      }
      G.pr.shake = Math.max(G.pr.shake, 0.15 + (this.t / this.hold) * 0.35);
      return;
    }
    this.rip();
  }
  stop() { if (!this.ripped && this.t > this.hold * 0.55) this.rip(); }
  perform() { if (!this.ripped) this.rip(); }
  private rip() {
    this.ripped = true;
    limbs()?.sever(this.p, this.part, { how: VERB_HOW[this.verb] ?? 'tear', by: this.by, from: this.from });
  }
}

export function limbs(): LimbSystem | null { return (G as any)?.limbs ?? null; }

export class LimbSystem implements GameSystem {
  name = 'limbs';
  rng = new Rng(Math.random() * 1e9);
  private scanT = 0;
  private flyT = 0;
  private vehLast = new Map<string, { x: number; z: number; t: number; sp: number }>();
  private hitCd = 0;
  private tqWarned = new Set<number>();
  private rotten = new Set<number>();
  private patched = false;

  constructor() {
    (G as any).limbs = this;
    bus.on('worldMenu', (p: Player, t: any, opts: MenuOption[]) => { try { this.worldMenu(p, t, opts); } catch (e) { console.warn('limb menu', e); } });
    this.patchActions();
  }

  // ================================================================ losing a limb
  /** a limb comes off (on the survivor's own machine). Returns false when limb loss is off or nothing is left to lose. */
  sever(p: Player, part: BodyPart, cause: SeverCause): boolean {
    if (!G.sandbox.limbLoss || !p?.isLocal || p.body.dead || !isLimbPart(part)) return false;
    const b = p.body;
    const lost = distalOf(part).filter((q) => !b.severed.includes(q));
    if (!lost.length) return false;
    const c = chainOf(part)!;
    const before = b.limbs();
    // what the lost hand held falls (and a two-handed grip goes); the remaining hand becomes the main one
    if (c.kind === 'arm') this.dropHeldFor(p, c.side, before);
    // the monitor comes off with the forearm
    if (c.kind === 'arm' && c.side === 'l' && c.idx <= 1) {
      const w = p.worn.get('wrist' as any);
      if (w) { p.unwear(w); bus.emit('think', p, 'The monitor... it came off with the arm.'); }
    }
    // the wounds on the parts that are gone go with them, and so does an older stump further down
    for (const q of lost) b.parts[q].injuries = [];
    for (const q of distalOf(part)) if (q !== part) b.parts[q].injuries = b.parts[q].injuries.filter((i) => !isStump(i));
    b.severed = [...b.severed, ...lost];
    // the stump: pumping, filthy, in agony
    const inj = b.addInjury(part, 'amputation', 1, { dirty: true });
    inj.bleed = stumpBleed(part) * (cause.how === 'crush' || cause.how === 'vehicle' ? 0.85 : 1);
    inj.sev = 1;
    // shock
    b.blood = Math.max(6, b.blood - (10 + lost.length * 5));
    b.health = Math.max(1, b.health - 8 - lost.length * 3);
    b.panic = 100;
    b.stress = Math.min(100, b.stress + 40);
    b.unhappy = Math.min(100, b.unhappy + 25);
    b.adrenaline = Math.max(b.adrenaline, 0.3);
    const mind = G.survival?.mind;
    mind?.addTrauma?.(b, 0.35, cause.by || 'maimed', 0.8);
    if (mind?.startAttack && !b.has('iron_nerves') && this.rng.chance(0.55)) setTimeout(() => { if (!p.body.dead && !p.body.downed) mind.startAttack(p); }, 6000 + this.rng.int(0, 5000));
    // the limb itself, flung away toward whatever pulled it
    if ((G.sandbox.gore ?? 2) > 0) this.dropLimb(p, part, cause, lost.length);
    const from = cause.from ?? [p.x + Math.cos(p.facing), p.z + Math.sin(p.facing)];
    G.gore?.survivorSevered?.(p, part, cause.how, from);
    G.pr.fx.hurt = 1;
    G.pr.shake = Math.max(G.pr.shake, 1.2);
    G.ui?.say?.(p, c.kind === 'arm' ? SCREAM[this.rng.int(0, SCREAM.length - 1)].replace('ARM', c.idx === 2 ? 'HAND' : 'ARM') : this.rng.pick(['MY LEG—', 'NO— NO—', 'AAAAAAAH—']), 'shout', 3);
    bus.emit('noise', { x: p.x, z: p.z, radius: 26, kind: 'scream', zone: p.zoneKey, by: p.id });
    setTimeout(() => { if (!p.body.dead) bus.emit('think', p, `My ${lossName(c.kind, c.side, lossLevel(b.severed, c.kind, c.side))}... it's gone. Stop the bleeding. STOP THE BLEEDING.`); }, 2200);
    p.actions.clear();
    p.outfitDirty = true;
    p.refreshCondition?.();
    bus.emit('limbLost', p, part, cause);
    bus.emit('inventoryChanged', p);
    return true;
  }

  /** items held in the hand that is lost fall; the other hand's item becomes the main one */
  private dropHeldFor(p: Player, side: Side, L: ReturnType<Player['body']['limbs']>) {
    const mainSide: Side = L.handOk.r ? 'r' : 'l';
    const drop = (it: Item | null) => {
      if (!it) return;
      p.removeItem(it);
      op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x, zz: p.z, y: p.y + 0.9, v: [(Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2] });
    };
    if (p.handR && p.handR === p.handL) { drop(p.handR); return; }
    if (side === mainSide) {
      drop(p.handR);
      // the other hand carries on as the main hand
      if (p.handL) { const it = p.handL; p.handL = null; p.handR = it; p.outfitDirty = true; }
    } else drop(p.handL);
  }

  private dropLimb(p: Player, part: BodyPart, cause: SeverCause, n: number) {
    const c = chainOf(part)!;
    const key = LIMB_ITEM[c.kind][c.idx];
    const it = createItem(key, undefined, { pristine: true });
    const whose = c.kind === 'arm' ? (c.idx === 2 ? 'hand' : c.idx === 1 ? 'forearm' : 'arm') : (c.idx === 2 ? 'foot' : c.idx === 1 ? 'lower leg' : 'leg');
    it.name = `${p.name}'s ${c.side === 'l' ? 'left' : 'right'} ${whose}`;
    it.data = { ...(it.data || {}), t: G.clock.hours, who: p.name };
    void n;
    const from = cause.from;
    let vx = (Math.random() - 0.5) * 1.5, vz = (Math.random() - 0.5) * 1.5;
    if (from) {
      const dx = from[0] - p.x, dz = from[1] - p.z, d = Math.hypot(dx, dz) || 1;
      const sp = cause.how === 'crush' || cause.how === 'vehicle' ? 1.2 : 2.6;
      vx = (dx / d) * sp + (Math.random() - 0.5); vz = (dz / d) * sp + (Math.random() - 0.5);
    }
    op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x, zz: p.z, y: p.y + (c.kind === 'arm' ? 1.1 : 0.5), v: [vx, 2.4, vz] });
  }

  /** a creature's tearing grab landed on the local survivor (applyHitToPlayer) */
  startTear(p: Player, h: HitInfo) {
    if (!p.isLocal || p.body.dead || !h.tear || p.inVehicle) return;
    const part = h.tear.part as BodyPart;
    if (p.body.severed.includes(part)) return;
    p.actions.clear();
    p.actions.add(new TornAction(p, part, h.tear.hold, h.tear.verb, h.by, h.from));
    const line = (h.by && TEARS[h.by]?.line) || 'It has me—';
    G.ui?.say?.(p, line, 'shout', h.tear.hold + 0.5);
  }

  // ================================================================ per frame
  update(dt: number, dh: number) {
    HumanRig.gentle = (G.sandbox.gore ?? 2) <= 0;
    const p = G.local;
    if (!p) return;
    if (!this.patched) this.patchActions();
    // what the survivor is getting by with
    this.setAids(p);
    for (const o of G.players.values()) if (!o.isLocal) this.mirrorRemote(o);
    if (p.body.dead) return;
    const b = p.body;
    if (b.severed.length) {
      this.phantom(p, dh);
      for (const inj of b.allInjuries()) {
        if (inj.tq == null) continue;
        if (inj.tq > 2 && !this.tqWarned.has(inj.id)) { this.tqWarned.add(inj.id); bus.emit('think', p, 'The tourniquet has been on too long. I need to close this and take it off.'); }
        if (inj.tq > 4) b.health = Math.max(0, b.health - 2.5 * dh);
      }
    }
    this.hitCd = Math.max(0, this.hitCd - dt);
    if (G.sandbox.limbLoss && !p.inVehicle) this.vehicles(p, dt);
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 2; this.rot(p); }
  }

  /** crutches in hand, prosthetics strapped on (Body.limbAids drives gait and grip) */
  private setAids(p: Player) {
    const b = p.body;
    const a = b.limbAids || (b.limbAids = noAids());
    const isCrutch = (it: Item | null) => !!it && (itemDef(it.key).tags || []).includes('crutch');
    const L = b.severed.length ? b.limbs() : null;
    // a crutch in the primary slot sits in whichever hand is the main one
    const mainLeft = !!L?.mirror;
    const cR = isCrutch(p.handR) && (p.handL !== p.handR), cL = isCrutch(p.handL) && p.handL !== p.handR;
    const crutchR = mainLeft ? cL : cR, crutchL = mainLeft ? cR : cL;
    const prost: typeof a.prost = {};
    for (const [slot, it] of p.worn) {
      const d = PROSTHETICS[it.key];
      if (!d || !String(slot).startsWith('prosth_')) continue;
      const side = String(slot).endsWith('_l') ? 'l' : 'r';
      prost[slotOf(d.limb, side)] = it.key;
    }
    if (a.crutchL !== crutchL || a.crutchR !== crutchR || JSON.stringify(a.prost) !== JSON.stringify(prost)) {
      b.limbAids = { prost, crutchL, crutchR };
      p.outfitDirty = true;
      p.refreshCondition?.();
    }
  }

  /** a teammate's missing limbs and stumps, from their outfit condition */
  private mirrorRemote(o: Player) {
    const cond = o.rig.outfit.cond;
    const sev = (cond?.sev ?? []) as BodyPart[];
    const b = o.body;
    if (b.severed.length !== sev.length || sev.some((x) => !b.severed.includes(x))) b.severed = [...sev];
    const pr = (cond?.prost ?? {}) as Record<string, string>;
    const isCrutch = (it: Item | null) => !!it && (itemDef(it.key).tags || []).includes('crutch');
    const L = b.severed.length ? b.limbs() : null;
    const r = isCrutch(o.handR), l = isCrutch(o.handL);
    const aids = { prost: pr as any, crutchL: L?.mirror ? r : l, crutchR: L?.mirror ? l : r };
    if (JSON.stringify(aids) !== JSON.stringify(b.limbAids)) b.limbAids = aids;
    // stump wounds as treatable mirrors (their id is the owner's injury id: treatments patch it there)
    const stumps = (cond?.stump ?? {}) as Record<string, StumpCond & { id?: number }>;
    for (const part of Object.keys(b.parts) as BodyPart[]) {
      const sc = stumps[part];
      const list = b.parts[part].injuries;
      const i0 = list.findIndex((i) => i.type === 'amputation');
      if (!sc || !sc.id) { if (i0 >= 0) list.splice(i0, 1); continue; }
      let inj = i0 >= 0 ? list[i0] : null;
      if (!inj || inj.id !== sc.id) {
        if (i0 >= 0) list.splice(i0, 1);
        inj = { id: sc.id, type: 'amputation', part, sev: 1, bleed: stumpBleed(part), heal: 0, healTime: 300, bandage: null, disinfected: 0, stitched: false, splinted: false, foreign: false, infection: 0, corrupt: false, age: 0 };
        list.push(inj);
      }
      inj.tq = sc.tq ? (inj.tq ?? 0) : null;
      inj.caut = sc.s === 'caut';
      inj.stitched = sc.s === 'stitch';
      inj.bandage = sc.s === 'band' || sc.s === 'bandb' ? (inj.bandage ?? { clean: sc.s === 'band', soak: sc.s === 'bandb' ? 0.8 : 0.1, sterile: false }) : null;
      inj.bleed = sc.s === 'raw' ? stumpBleed(part) : stumpBleed(part) * 0.06;
    }
  }

  private phantom(p: Player, dh: number) {
    const b = p.body;
    if (b.phantom > 0) return;
    b.phantomCd -= dh;
    if (b.phantomCd > 0) return;
    b.phantomCd = 5 + this.rng.next() * 14;
    const m: any = b.mind;
    const ch = 0.3 + (m?.trauma ?? 0) * 0.35 + b.stress / 250 - (b.antidep > 0 ? 0.15 : 0);
    if (!this.rng.chance(ch)) return;
    b.phantom = 0.4 + this.rng.next() * 1.2;
    b.stress = Math.min(100, b.stress + 12);
    b.unhappy = Math.min(100, b.unhappy + 6);
    const arm = b.severed.some((x) => chainOf(x)?.kind === 'arm'), leg = b.severed.some((x) => chainOf(x)?.kind === 'leg');
    const kind: LimbKind = arm && (!leg || this.rng.chance(0.5)) ? 'arm' : 'leg';
    bus.emit('think', p, this.rng.pick(PHANTOM[kind]));
  }

  // ================================================================ cars hitting people on foot
  private vehicles(p: Player, dt: number) {
    const vs: any = (G as any).vehicles;
    if (!vs?.vehicles || this.hitCd > 0) return;
    for (const v of vs.vehicles.values() as Iterable<any>) {
      if (v.zone !== p.zoneKey) continue;
      // speed from how far it moved (remote cars only carry a pose)
      const last = this.vehLast.get(v.id);
      let sp = Math.abs(v.speed ?? 0);
      if (last && G.time > last.t) sp = Math.max(sp, Math.hypot(v.x - last.x, v.z - last.z) / (G.time - last.t));
      this.vehLast.set(v.id, { x: v.x, z: v.z, t: G.time, sp });
      if (sp < 6) continue;
      const reach = (v.def?.len ?? 4) / 2 + 0.35, wid = (v.def?.wid ?? 1.8) / 2 + 0.3;
      const fx = Math.cos(v.yaw ?? 0), fz = Math.sin(v.yaw ?? 0);
      const dx = p.x - v.x, dz = p.z - v.z;
      const along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
      if (Math.abs(along) > reach || Math.abs(side) > wid) continue;
      this.hitCd = 1.5;
      this.runOver(p, v, sp, fx, fz);
      return;
    }
  }
  private runOver(p: Player, v: any, sp: number, fx: number, fz: number) {
    const b = p.body;
    const legSide: Side = this.rng.chance(0.5) ? 'l' : 'r';
    b.addInjury(`shin_${legSide}` as BodyPart, sp > 9 ? 'fracture' : 'bruise', Math.min(1, sp / 12));
    b.addInjury('torso_u', 'bruise', Math.min(1, sp / 14));
    if (sp > 10) b.addInjury(`thigh_${legSide}` as BodyPart, 'deep', 0.7, { dirty: true });
    b.health = Math.max(0, b.health - sp * 2.2);
    p.vx += fx * sp * 0.8; p.vz += fz * sp * 0.8;
    G.audio?.at?.('crash', p.x, p.z, 0.8);
    G.audio?.hurt?.(p);
    G.pr.shake = Math.max(G.pr.shake, 1);
    bus.emit('think', p, 'The car— I didn\'t see—');
    if (sp > 11 && this.rng.chance(Math.min(0.6, (sp - 11) / 8))) {
      const part = (this.rng.chance(0.6) ? `shin_${legSide}` : `thigh_${legSide}`) as BodyPart;
      this.sever(p, part, { how: 'vehicle', by: 'vehicle', from: [p.x - fx, p.z - fz] });
    }
  }

  // ================================================================ rot
  private rot(p: Player) {
    const z = G.zones.get(p.zoneKey);
    if (!z) return;
    const ext: any = G.systems.find((s) => s.name === 'extras');
    const meshes: Map<number, any> | undefined = ext?.floor?.meshes;
    let flies = false;
    for (const wi of floorItems(z).values()) {
      const k = wi.item.key;
      if (!k.startsWith('limb_') || k.endsWith('_rot')) continue;
      const t = wi.item.data?.t;
      const rotten = typeof t === 'number' && G.clock.hours - t > ROT_HOURS;
      if (!rotten) continue;
      if (!wi.item.name?.startsWith('Rotting')) wi.item.name = 'Rotting ' + (wi.item.name || itemDef(k).name.replace('Severed ', '')).replace(/^Severed /, '');
      const m = meshes?.get(wi.item.uid);
      if (m && !this.rotten.has(wi.item.uid)) { const g = itemGeometry(k + '_rot'); if (g) { m.geometry = g; this.rotten.add(wi.item.uid); } }
      if (Math.hypot(wi.x - p.x, wi.z - p.z) < 7) flies = true;
    }
    for (const it of p.allItems()) {
      if (!it.key.startsWith('limb_') || it.key.endsWith('_rot')) continue;
      const t = it.data?.t;
      if (typeof t === 'number' && G.clock.hours - t > ROT_HOURS && !it.name?.startsWith('Rotting')) it.name = 'Rotting ' + (it.name || itemDef(it.key).name).replace(/^Severed /, '');
      if (typeof t === 'number' && G.clock.hours - t > ROT_HOURS) { flies = true; p.body.unhappy = Math.min(100, p.body.unhappy + 0.5); }
    }
    this.flyT -= 2;
    if (flies && this.flyT <= 0) { this.flyT = 6; G.audio?.at?.('limb_flies', p.x + 1, p.z, 0.5); }
  }

  // ================================================================ menus: stump care for yourself or a teammate, prosthetics
  private worldMenu(p: Player, t: any, opts: MenuOption[]) {
    if (!p?.isLocal || p.body.dead) return;
    const target: Player = t?.kind === 'player' && t.p && t.p !== p ? t.p : p;
    if (target !== p && Math.hypot(target.x - p.x, target.z - p.z) > 6) return;
    const self = target === p;
    const subs: MenuOption[] = [];
    const run = (a: TimedAction) => () => { if (self) { p.actions.clear(); p.actions.add(a); } else queueAt(p, target.x, target.z, a, 1.4, false); };
    const tq = p.findItem((it) => isTourniquet(it));
    const bandage = p.findItem((it, d) => d.medical?.type === 'bandage' && !isTourniquet(it));
    const knife = p.findTool('#knife') || p.findTool('#sharp') || p.findTool('scalpel');
    const flame = p.findTool('#lighter') || p.findTool('#matches') || p.findTool('lighter') || p.findTool('matches');
    const heat = G.interact?.nearHeat?.(p) || ((G as any).fireNear?.(p.x, p.z, p.zoneKey) ?? 0) > 0;
    const needle = p.findTool('#needle') || p.findTool('suture_needle');
    const thread = p.findTool('#thread') || null;
    for (const inj of target.body.allInjuries()) {
      if (!isStump(inj) && !(tourniquetable(inj)) && inj.tq == null) continue;
      const nm = PART_NAMES[inj.part];
      const st = isStump(inj) ? stumpLabel(inj) : 'bleeding hard';
      const items: MenuOption[] = [];
      if (tourniquetable(inj)) items.push({ label: 'Apply tourniquet', disabled: !tq ? 'needs a tourniquet' : false, action: tq ? run(new BandageAction(p, target, inj, tq)) : undefined });
      if (inj.tq != null) items.push({ label: 'Loosen tourniquet', action: run(new RemoveTourniquetAction(p, target, inj)) });
      if (isStump(inj)) {
        if (!inj.caut) {
          items.push({ label: 'Cauterise in the flame', disabled: !heat ? 'needs a fire or a stove' : false, action: heat ? run(new CauterizeAction(p, target, inj, 'fire', null)) : undefined });
          items.push({ label: 'Cauterise with a hot blade', disabled: !knife ? 'needs a blade' : !(flame || heat) ? 'needs a flame to heat it' : false, action: knife && (flame || heat) ? run(new CauterizeAction(p, target, inj, 'blade', knife)) : undefined });
        }
        if (!inj.stitched) items.push({ label: 'Stitch the stump closed', disabled: !needle ? 'needs a needle' : false, action: needle ? run(new CloseStumpAction(p, target, inj, needle, thread)) : undefined });
        if (!inj.bandage) items.push({ label: 'Bandage the stump', disabled: !bandage ? 'needs a bandage or rag' : false, action: bandage ? run(new BandageAction(p, target, inj, bandage)) : undefined });
      }
      if (items.length) subs.push({ label: `${nm} — ${st}`, sub: items });
    }
    // prosthetics (yourself)
    if (self && p.body.severed.length) {
      for (const it of p.allItems()) {
        const d = PROSTHETICS[it.key];
        if (!d || p.isWorn(it)) continue;
        const fits = (['l', 'r'] as Side[]).some((s) => prostFits(it.key, d.limb, lossLevel(p.body.severed, d.limb, s)));
        subs.push({ label: `Strap on ${itemDef(it.key).name}`, disabled: fits ? (this.stumpRaw(p, d.limb) ? 'the stump is still an open wound' : false) : 'it does not fit', action: () => { p.actions.add(new WearAction(p, it)); } });
      }
      for (const [, it] of p.worn) if (PROSTHETICS[it.key]) subs.push({ label: `Take off ${itemDef(it.key).name}`, action: () => p.actions.add(new WearAction(p, it, true)) });
    }
    if (!subs.length) return;
    opts.push({ label: self ? 'Stump care' : `${target.name}: stump care`, sub: subs });
  }

  /** is the stump on that kind of limb still an open, unsealed wound */
  stumpRaw(p: Player, kind: LimbKind): boolean {
    return p.body.allInjuries().some((i) => isStump(i) && chainOf(i.part)?.kind === kind && !i.stitched && !i.caut && i.heal < 0.35);
  }

  // ================================================================ hands: climbing and two-handed crafting
  private patchActions() {
    if (this.patched) return;
    this.patched = true;
    const climbValid = ClimbAction.prototype.isValid;
    ClimbAction.prototype.isValid = function (this: ClimbAction) {
      const L = this.p.body.severed.length ? this.p.body.limbs() : null;
      if (L && !L.climb) {
        if (!this.started) bus.emit('think', this.p, L.hands < 2 ? 'I can\'t climb with one hand.' : 'I can\'t climb like this.');
        return false;
      }
      return climbValid.call(this);
    };
    const craftValid = CraftAction.prototype.isValid;
    CraftAction.prototype.isValid = function (this: CraftAction) {
      const L = this.p.body.severed.length ? this.p.body.limbs() : null;
      if (L && !L.twoHand && needsTwoHands(this.r)) {
        if (!this.started) bus.emit('think', this.p, L.hands === 0 ? 'I have no hands to do that with.' : 'That needs two hands.');
        return false;
      }
      return craftValid.call(this);
    };
  }
}

export { CHAINS };

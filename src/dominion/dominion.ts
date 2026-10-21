// Domination: knock a monster down, open its skull, pull the brain, seat a
// mechanical one: it is yours. Thralls follow, guard, attack what you attack
// (or what you point at with K), carry cargo, can be ridden (SADDLE PROTOCOL)
// and take standing orders at base stations (guard / haul / power / farm).
//
// Knock-downs are the combat system's (src/combat/creatureState.ts): a beaten
// creature at low vitality goes down for long enough to operate on, and the
// operation holds it there. Authority: the host simulates (CreatureSystem
// calls step() for wired creatures before their own brains). Every change is
// an op, so co-op peers and save games agree: domDown/domHold (knock-downs), domInstall
// (a brain swap), domCmd/domStation/domRide (orders), domHaul/domUnload
// (cargo), domRelease (shut one down), domGone (it died).
import { G } from '../game/G';
import { bus } from '../core/events';
import { defOp, op, isReplaying } from '../game/ops';
import type { GameSystem } from '../game/game';
import type { Creature } from '../creatures/creature';
import type { Zone } from '../world/zone';
import { Container } from '../items/container';
import { createItem } from '../items/factory';
import { floorItems, removeFloorItem } from '../items/worldItems';
import { moveCircle } from '../world/collision';
import { hasUnlock } from '../game/research';
import { shake, slowmo } from '../gfx/juice';
import { knockDown as cbKnockDown, isDown as cbIsDown } from '../combat/creatureState';
import { BRAINS, brainTier, domBlock, maxThralls, NODE_RECIPES, tierNeeded } from './brains';
import { domSounds } from './sounds';
import { syncImplants, dropImplant } from './implants';
import { DomUI } from './domUI';
import { Operation } from './operate';

export type ThrallMode = 'follow' | 'stay' | 'guard' | 'station';
export type StationKind = 'guard' | 'haul' | 'power' | 'farm';
export interface Station { kind: StationKind; zone: string; x: number; z: number }
export interface ThrallRec {
  id: string; owner: string; tier: 1 | 2 | 3; name: string; sp: string;
  mode: ThrallMode; gx: number; gz: number; target: string | null; station: Station | null; rider: string | null;
}

const HOSTILE = new Set(['hostile', 'stalker', 'ambush', 'territorial']);
const DOWN_KINDS = new Set(['blunt', 'unarmed', 'shove', 'kick', 'thrown', 'vehicle', 'stomp', 'bash']);
const NAMES = ['MULE', 'HOUND', 'BRUTE', 'TALLOW', 'SPROCKET', 'GRUEL', 'LUG', 'VASSAL', 'CINDER', 'KNUCKLE', 'BOLT', 'MOTH', 'RIVET', 'HUSK', 'OX', 'PIKE'];
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const cs = () => G.creatures;

export class DominionSystem implements GameSystem {
  name = 'dominion';
  thralls = new Map<string, ThrallRec>();
  ui: DomUI;
  surgery: Operation;
  /** per owner: the creature they last hurt (thralls pile in) */
  private ownerFoe = new Map<string, { id: string; t: number }>();
  private relocT = new Map<string, number>();
  /** each thrall's cargo hold (kept out of creature memory so saves stay small) */
  cargo = new Map<string, Container>();
  private lastHour = -1;
  private wasRiding = false;

  constructor() {
    G.dominion = this;
    domSounds();
    this.ui = new DomUI(this);
    this.surgery = new Operation(this);
    bus.on('creatureHurt', (c: Creature, hit: any) => this.onHurt(c, hit));
    bus.on('creatureKilled', (c: Creature, killer: any) => this.onKilled(c, killer));
    // schematics learned through research become known recipes
    const learn = () => { const p = G.local as any; if (!p) return; const k: Set<string> = p.knownRecipes || (p.knownRecipes = new Set<string>()); for (const [n, r] of Object.entries(NODE_RECIPES)) if (hasUnlock(n)) k.add(r); };
    bus.on('researchUnlocked', learn);
    setTimeout(learn, 0);
  }

  // ---------------------------------------------------------------- queries
  rec(c: Creature | string): ThrallRec | undefined { return this.thralls.get(typeof c === 'string' ? c : c.id); }
  creature(id: string): Creature | undefined { return cs()?.creatures?.get(id); }
  /** down on the floor: the combat system's knock-down, or our hold (replicated by op, so clients agree) */
  isDowned(c: Creature) { return !c.dead && (cbIsDown(c) || (c.mem.domDownUntil ?? 0) > G.time || (G.role !== 'client' && (c.mem.cb?.down ?? 0) > G.time)); }
  /** thralls of a player (alive) */
  thrallsOf(owner: string): ThrallRec[] { return [...this.thralls.values()].filter((r) => r.owner === owner && !!this.creature(r.id) && !this.creature(r.id)!.dead); }
  mine(): ThrallRec[] { return G.local ? this.thrallsOf(G.local.id) : []; }
  /** stations by kind (the settlement can list its workforce) */
  stationsOf(kind?: StationKind) { return [...this.thralls.values()].filter((r) => r.station && (!kind || r.station.kind === kind)); }
  /** thrall-cranked power near a point (watts-ish units for the settlement; 0 = none) */
  powerAt(zone: string, x: number, z: number, r = 14): number {
    let w = 0;
    for (const t of this.stationsOf('power')) if (t.station!.zone === zone && Math.hypot(t.station!.x - x, t.station!.z - z) <= r) w += 200 * t.tier;
    return w;
  }
  canRide(c: Creature) { return hasUnlock('tame_ride') && c.height >= 0.8 && c.sp.hp >= 30 && !c.sp.flags?.flying; }
  riding(): ThrallRec | undefined { const me = G.local?.id; if (me) for (const r of this.thralls.values()) if (r.rider === me) return r; return undefined; }

  // ---------------------------------------------------------------- knock-downs (host)
  private onHurt(c: Creature, hit: any) {
    if (G.role === 'client' || c.dead || c.mem.dom || (c.mem.domDownUntil ?? 0) > G.time) return;
    const by = hit?.by as string | undefined;
    if (by) this.noteFoe(by, c);
    const byPlayer = !!by && G.players.has(by);
    const byThrall = !!by && !!this.thralls.get(by);
    if (!byPlayer && !byThrall) return;
    if (domBlock(c) && !c.mem.tribe) return;
    const frac = c.hp / Math.max(1, c.sp.hp);
    const blunt = DOWN_KINDS.has(hit?.kind) || (hit?.kind === undefined);
    if ((frac <= 0.35 && blunt) || frac <= 0.16 || (hit?.crit && blunt && frac <= 0.55)) this.knockDown(c, 8 + 7 * (1 - frac) + (c.sp.hp < 40 ? 4 : 0), by);
  }
  /** a player (or a thrall) hurt this creature: their thralls join in */
  private noteFoe(by: string, c: Creature) {
    const owner = G.players.has(by) ? by : this.thralls.get(by)?.owner;
    if (owner && !c.mem.dom && !c.mem.tribe) this.ownerFoe.set(owner, { id: c.id, t: G.time });
  }

  /** host: put a creature on the floor for `secs` (combat finishers may call this) */
  knockDown(c: Creature, secs = 12, by?: string) {
    if (G.role === 'client' || c.dead || c.mem.dom || c.sp.flags?.immortal) return;
    c.stagger = Math.max(c.stagger, 0.6);
    c.attackPhase = 0;
    op('domDown', { id: c.id, s: Math.round(secs * 10) / 10, by });
  }


  // ---------------------------------------------------------------- host simulation hook
  /** called by CreatureSystem.simulate for downed / wired creatures; true = handled */
  step(c: Creature, z: Zone, dt: number): boolean {
    if (c.mem.dom) return this.thrallStep(c, z, dt);
    return false;
  }


  private thrallStep(c: Creature, z: Zone, dt: number): boolean {
    const r = this.thralls.get(c.id);
    if (!r) { delete c.mem.dom; return false; }
    if (c.stagger > 0) return true;
    const sp = c.sp;
    const over = hasUnlock('tame_overclock') ? 1 : 0;
    const run = sp.run * (1 + over * 0.25), walk = sp.walk * (1 + over * 0.25);
    // ridden: it goes where the rider goes
    if (r.rider) {
      const rp = G.players.get(r.rider);
      if (rp && rp.zoneKey === c.zoneKey && !rp.body.dead) {
        c.x = rp.x; c.z = rp.z; c.vx = c.vz = 0; c.facing = c.targetFacing = rp.facing;
        c.speed = rp.speed * 1.6; c.setState(c.speed > 0.2 ? 'chase' : 'idle');
        return true;
      }
    }
    // an attack in progress
    if (c.attackPhase > 0) {
      c.attackPhase -= dt; c.vx *= 0.8; c.vz *= 0.8;
      if (c.attackPhase <= 0) this.resolveBite(c, r);
      return true;
    }
    const owner = G.players.get(r.owner);
    const foe = this.pickFoe(c, r, owner, dt);
    if (foe) {
      const a = sp.attack;
      const range = (a?.range ?? c.radius + 0.5) + foe.radius;
      const d = Math.hypot(foe.x - c.x, foe.z - c.z);
      c.setState('chase');
      if (d < range) {
        c.speed = 0; c.targetFacing = Math.atan2(foe.z - c.z, foe.x - c.x);
        if (c.attackT <= 0) { c.attackPhase = 0.32; c.attackT = (a?.cooldown ?? 1.2) / (1 + over * 0.2); c.mem.domHit = foe.id; cs().call(c, 'attack'); }
      } else cs().moveTo(c, z, foe.x, foe.z, run, dt, range * 0.8);
      this.retaliate(foe, c, d);
      return true;
    }
    const stay = r.mode === 'stay' || c.mem.stay;
    if (r.mode === 'station' && r.station) return this.stationStep(c, r, z, dt, walk);
    if (r.mode === 'guard' || stay) {
      const d = Math.hypot(r.gx - c.x, r.gz - c.z);
      if (!stay && d > 1.6) { cs().moveTo(c, z, r.gx, r.gz, d > 6 ? run : walk, dt, 1.2); c.setState('travel'); }
      else { c.speed = 0; c.setState('watch'); if (owner && Math.random() < dt * 0.3) c.targetFacing = Math.atan2(owner.z - c.z, owner.x - c.x); }
      return true;
    }
    // follow
    if (!owner || owner.zoneKey !== c.zoneKey) { c.speed = 0; c.setState('idle'); return true; }
    const d = Math.hypot(owner.x - c.x, owner.z - c.z);
    const slot = (hash(c.id) % 5) - 2;
    const fx = owner.x - Math.cos(owner.facing) * 1.6 + Math.cos(owner.facing + Math.PI / 2) * slot * 0.7;
    const fz = owner.z - Math.sin(owner.facing) * 1.6 + Math.sin(owner.facing + Math.PI / 2) * slot * 0.7;
    if (d > 2.4) { cs().moveTo(c, z, fx, fz, d > 6 ? run : walk * 1.2, dt, 0.8); c.setState('follow'); }
    else { c.speed = 0; c.setState('idle'); if (Math.random() < dt * 0.4) c.targetFacing = Math.atan2(owner.z - c.z, owner.x - c.x); }
    return true;
  }

  /** what this thrall should be fighting right now */
  private pickFoe(c: Creature, r: ThrallRec, owner: any, dt: number): Creature | null {
    const all = cs().creatures as Map<string, Creature>;
    const ok = (o: Creature | undefined) => !!o && !o.dead && o.zoneKey === c.zoneKey && !o.mem.dom && o !== c;
    if (r.target) { const t = all.get(r.target); if (ok(t)) return t!; r.target = null; }
    const of = this.ownerFoe.get(r.owner);
    if (of && G.time - of.t < 20) { const t = all.get(of.id); if (ok(t) && !this.isDowned(t!) && Math.hypot(t!.x - c.x, t!.z - c.z) < 14) return t!; }
    // hostiles near whatever it protects
    const cx = r.mode === 'station' && r.station ? r.station.x : r.mode === 'guard' ? r.gx : owner?.x ?? c.x;
    const cz = r.mode === 'station' && r.station ? r.station.z : r.mode === 'guard' ? r.gz : owner?.z ?? c.z;
    const reach = r.mode === 'follow' ? 7 : 10;
    if (c.thinkT > 0) { c.thinkT -= dt; return c.mem.domFoe ? (ok(all.get(c.mem.domFoe)) ? all.get(c.mem.domFoe)! : null) : null; }
    c.thinkT = 0.3;
    let best: Creature | null = null, bd = reach;
    for (const o of all.values()) {
      if (!ok(o) || this.isDowned(o)) continue;
      const hostile = HOSTILE.has(o.sp.temperament) || o.mem.raid || (o.mem.tribe && (o.state === 'chase' || o.state === 'attack'));
      if (!hostile || o.tamedBy) continue;
      const d = Math.hypot(o.x - cx, o.z - cz);
      if (d < bd) { bd = d; best = o; }
    }
    c.mem.domFoe = best?.id ?? null;
    return best;
  }

  private resolveBite(c: Creature, r: ThrallRec) {
    const foe = this.creature(c.mem.domHit);
    if (!foe || foe.dead) return;
    const a = c.sp.attack;
    const range = (a?.range ?? c.radius + 0.5) + foe.radius + 0.4;
    if (Math.hypot(foe.x - c.x, foe.z - c.z) > range) return;
    const base = a ? (a.dmg[0] + a.dmg[1]) / 2 : 4 + c.sp.hp * 0.08;
    const dmg = base * (1 + 0.25 * (r.tier - 1)) * (hasUnlock('tame_overclock') ? 1.5 : 1);
    cs().damage(c.id, foe.id, dmg, c.x, c.z, 0.5 + r.tier * 0.1, 'bite');
  }

  /** monsters fight back against thralls that engage them */
  private retaliate(foe: Creature, c: Creature, d: number) {
    const a = foe.sp.attack;
    if (!a || this.isDowned(foe) || foe.attackT > 0 || foe.mem.dom || d > a.range + c.radius + 0.2) return;
    foe.attackT = a.cooldown * 1.2;
    foe.targetFacing = Math.atan2(c.z - foe.z, c.x - foe.x);
    cs().call(foe, 'attack');
    cs().damage(foe.id, c.id, (a.dmg[0] + a.dmg[1]) * 0.4, foe.x, foe.z, 0.3, 'bite');
  }

  // ---------------------------------------------------------------- stations
  private stationStep(c: Creature, r: ThrallRec, z: Zone, dt: number, walk: number): boolean {
    const st = r.station!;
    if (st.zone !== c.zoneKey) { c.speed = 0; return true; }
    const m = c.mem;
    const goto = (x: number, zz: number, stop = 0.9) => { const at = cs().moveTo(c, z, x, zz, walk, dt, stop); c.setState(at ? 'idle' : 'travel'); return at; };
    switch (st.kind) {
      case 'guard': {
        if (!m.patrol || G.time > m.patrolT) { const a = Math.random() * Math.PI * 2, rr = 1 + Math.random() * 3.5; m.patrol = [st.x + Math.cos(a) * rr, st.z + Math.sin(a) * rr]; m.patrolT = G.time + 5 + Math.random() * 4; }
        goto(m.patrol[0], m.patrol[1], 0.6);
        break;
      }
      case 'power': {
        if (goto(st.x, st.z, 0.7)) { c.setState('nest'); c.speed = 0; c.targetFacing += dt * 3; } // walking the crank in circles
        break;
      }
      case 'haul': {
        const inv = c.inv;
        const full = !inv || inv.items.length >= 8;
        const loose = full ? null : this.nearestLoot(z, st.x, st.z, 8, c);
        if (loose) {
          if (goto(loose.x, loose.z, 0.7) && G.time > (m.haulT ?? 0)) { m.haulT = G.time + 0.6; op('domHaul', { z: z.key, uid: loose.item.uid, id: c.id }); }
        } else if (inv && inv.items.length) {
          const box = this.nearestBox(z, st.x, st.z);
          if (box && goto(box.x + 0.5, box.y + 0.5, 1.1) && G.time > (m.haulT ?? 0)) { m.haulT = G.time + 1; op('domUnload', { z: z.key, id: c.id, ref: 'obj:' + box.uid }); }
          else if (!box) goto(st.x, st.z);
        } else goto(st.x, st.z);
        break;
      }
      case 'farm': {
        if (!m.tend || G.time > m.tendT) {
          let best: any = null, bw = 70;
          for (const o of z.objects.values()) if (o.key === 'crop' && !o.state.dead && Math.hypot(o.x + 0.5 - st.x, o.y + 0.5 - st.z) < 7 && (o.state.water ?? 0) < bw) { bw = o.state.water ?? 0; best = o; }
          m.tend = best ? best.uid : null; m.tendT = G.time + 8;
        }
        const o = m.tend != null ? z.objects.get(m.tend) : null;
        if (o) { if (goto(o.x + 0.5, o.y + 0.5, 0.8)) { op('objState', { z: z.key, uid: o.uid, patch: { water: Math.min(100, (o.state.water ?? 0) + 35) } }); bus.emit('thrallTend', { zone: z.key, uid: o.uid, by: c.id }); m.tend = null; m.tendT = G.time + 6; } }
        else goto(st.x, st.z);
        break;
      }
    }
    return true;
  }
  private nearestLoot(z: Zone, x: number, zz: number, r: number, c: Creature) {
    let best: any = null, bd = r;
    for (const wi of floorItems(z).values()) {
      if (wi.item.inv || (wi.vy ?? 0) !== 0) continue;
      const d = Math.hypot(wi.x - x, wi.z - zz);
      if (d < bd && (!c.inv || c.inv.hasRoom(wi.item))) { bd = d; best = wi; }
    }
    return best;
  }
  private nearestBox(z: Zone, x: number, zz: number) {
    let best: any = null, bd = 4;
    for (const o of z.objects.values()) {
      if (!o.inv || o.inv.kind === 'corpse') continue;
      const d = Math.hypot(o.x + 0.5 - x, o.y + 0.5 - zz);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** every in-game hour (host): power stations keep their generator fed */
  private hourly() {
    for (const r of this.stationsOf('power')) {
      const st = r.station!, z = G.zones.get(st.zone); if (!z) continue;
      const c = this.creature(r.id); if (!c || c.dead || Math.hypot(c.x - st.x, c.z - st.z) > 2) continue;
      for (const o of z.objects.values()) {
        if (!o.key.includes('generator') || Math.hypot(o.x + 0.5 - st.x, o.y + 0.5 - st.z) > 4) continue;
        op('objState', { z: z.key, uid: o.uid, patch: { fuel: Math.min(10, (o.state.fuel ?? 0) + 0.35 * r.tier), on: true } });
        break;
      }
      bus.emit('thrallPower', { zone: st.zone, x: st.x, z: st.z, id: r.id, watts: 200 * r.tier });
    }
  }

  // ---------------------------------------------------------------- deaths
  private onKilled(c: Creature, _killer: any) {
    const r = this.thralls.get(c.id);
    if (!r || G.role === 'client') return;
    // the cortex survives its body: it lands in the remains with the cargo
    const cargo = this.cargo.get(c.id);
    if (c.inv) {
      c.inv.add(createItem(brainTier(r.tier).key));
      if (cargo && cargo !== c.inv) for (const it of [...cargo.items]) c.inv.add(it);
    }
    op('domGone', { id: c.id, why: 'killed' });
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, dh: number) {
    void dh;
    const host = G.role !== 'client';
    // clients: tribe-less mirrors never get simulated; keep their wiring for visuals
    const h = Math.floor(G.clock.hours);
    if (host && h !== this.lastHour) { if (this.lastHour >= 0) this.hourly(); this.lastHour = h; }
    if (host) this.relocate(dt);
    this.rideLocal(dt);
    syncImplants(this);
    this.ui.update(dt);
    this.surgery.update(dt);
  }

  /** followers keep up with an owner who changed zones */
  private relocate(dt: number) {
    for (const r of this.thralls.values()) {
      if (r.mode !== 'follow' && !r.rider) continue;
      const c = this.creature(r.id), p = G.players.get(r.rider || r.owner);
      if (!c || c.dead || !p || p.zoneKey === c.zoneKey || c.mem.stay) { this.relocT.delete(r.id); continue; }
      const t = (this.relocT.get(r.id) ?? 0) + dt;
      this.relocT.set(r.id, t);
      if (t < (r.rider ? 0.05 : 1.6)) continue;
      this.relocT.delete(r.id);
      if (c.rig) { cs().root.remove(c.rig.root); c.rig = null; }
      c.zoneKey = p.zoneKey; c.x = p.x - Math.cos(p.facing) * 0.9; c.z = p.z - Math.sin(p.facing) * 0.9;
      if (r.rider) { c.x = p.x; c.z = p.z; }
      c.path = null; c.home = { x: c.x, z: c.z };
    }
  }

  /** the local rider: faster, higher, seated; the beast drawn under them */
  private rideLocal(dt: number) {
    const p = G.local; if (!p) return;
    const r = this.riding();
    const c = r ? this.creature(r.id) : undefined;
    if (!r || !c || c.dead || c.zoneKey !== p.zoneKey || p.body.dead) {
      if (this.wasRiding) { this.wasRiding = false; if (p.full === 'sit') p.full = ''; if (r && (!c || c.dead || p.body.dead)) op('domRide', { id: r.id, by: p.id, on: false }); }
      return;
    }
    this.wasRiding = true;
    const z = G.getZone(p.zoneKey);
    const boost = (c.sp.run / 3.2) * (hasUnlock('tame_overclock') ? 1.25 : 1);
    if (p.speed > 0.05 && boost > 1) moveCircle(z, p, p.vx * dt * (boost - 1), p.vz * dt * (boost - 1), { ignoreLow: false });
    p.full = 'sit';
    p.y = z.heightAt(p.tileX(), p.tileY()) + Math.min(1.4, c.height * 0.62);
    c.x = p.x; c.z = p.z; c.facing = p.facing;
    if (c.rig) { c.rig.root.position.set(c.x, c.y, c.z); c.rig.root.rotation.y = Math.PI / 2 - c.facing; }
  }


  // ---------------------------------------------------------------- player-side API
  /** the brain the local survivor would use on this creature (smallest that fits) */
  brainFor(c: Creature) {
    const need = tierNeeded(c);
    const p = G.local;
    for (const b of BRAINS) if (b.tier >= need) { const it = p?.findItem((i) => i.key === b.key); if (it) return { it, tier: b }; }
    return null;
  }
  /** start the operation on a downed creature (local survivor) */
  operate(c: Creature): boolean {
    const p = G.local; if (!p) return false;
    const block = domBlock(c);
    if (block) { bus.emit('think', p, block === 'a person' ? "No. Not a person." : block === 'already wired' ? 'Already wired.' : "There's nothing in there I can rewire."); return false; }
    if (!this.isDowned(c)) { bus.emit('think', p, 'It has to be down first. Beat it to the floor.'); return false; }
    if (this.mine().length >= maxThralls()) { bus.emit('think', p, `I can't run more than ${maxThralls()} of them at once.`); return false; }
    const b = this.brainFor(c);
    if (!b) { bus.emit('think', p, `A skull this size needs a ${brainTier(tierNeeded(c)).name} or better.`); return false; }
    const tool = p.findTool('#saw') || p.findTool('#sharp');
    if (!tool) { bus.emit('think', p, 'I need a blade or a saw to get the skull open.'); return false; }
    op('domHold', { id: c.id, s: 90, by: p.id });
    this.surgery.start(c, b.it, b.tier.tier, tool);
    return true;
  }
  /** the operation finished: the brain goes in (the item is spent once the host confirms) */
  install(c: Creature, tier: 1 | 2 | 3) {
    const p = G.local!;
    const n = [...this.thralls.values()].filter((r) => r.owner === p.id).length + 1;
    const name = `${NAMES[hash(c.id) % NAMES.length]}-${String(n).padStart(2, '0')}`;
    op('domInstall', { id: c.id, by: p.id, tier, name });
  }
  abortHold(c: Creature) { op('domHold', { id: c.id, s: 2.5 }); }

  command(id: string, mode: ThrallMode, extra: { x?: number; z?: number; target?: string | null } = {}) {
    const p = G.local; if (!p) return;
    op('domCmd', { id, by: p.id, mode, ...extra });
  }
  /** every thrall following the local survivor goes for this creature */
  sic(target: Creature) {
    const p = G.local; if (!p) return 0;
    let n = 0;
    for (const r of this.mine()) if (r.mode !== 'station') { op('domCmd', { id: r.id, by: p.id, mode: r.mode, target: target.id }); n++; }
    return n;
  }
  assign(id: string, kind: StationKind | null, at?: { zone: string; x: number; z: number }) {
    const p = G.local; if (!p) return;
    const c = this.creature(id);
    const s = kind ? { kind, zone: at?.zone ?? c?.zoneKey ?? p.zoneKey, x: at?.x ?? c?.x ?? p.x, z: at?.z ?? c?.z ?? p.z } : null;
    op('domStation', { id, by: p.id, s });
  }
  ride(id: string, on: boolean) { const p = G.local; if (p) op('domRide', { id, by: p.id, on }); }
  release(id: string) { const p = G.local; if (p) op('domRelease', { id, by: p.id }); }

  // ---------------------------------------------------------------- op application (every peer)
  applyInstall(a: { id: string; by: string; tier: 1 | 2 | 3; name: string }) {
    const c = this.creature(a.id);
    const r: ThrallRec = { id: a.id, owner: a.by, tier: a.tier, name: a.name, sp: c?.sp.key ?? '', mode: 'follow', gx: c?.x ?? 0, gz: c?.z ?? 0, target: null, station: null, rider: null };
    this.thralls.set(a.id, r);
    if (c) this.wire(c, r);
    bus.emit('thrallMade', r, c);
  }
  /** make a creature a thrall (also re-applied when a mirror or a loaded save brings it back) */
  wire(c: Creature, r: ThrallRec) {
    c.mem.dom = { owner: r.owner, tier: r.tier, name: r.name };
    // up off the table
    c.mem.domDownUntil = 0;
    if (c.mem.cb) { c.mem.cb.down = undefined; c.mem.cb.stun = undefined; }
    if (c.mem.netMem) { c.mem.netMem.cbd = 0; c.mem.netMem.cbs = 0; }
    c.tamedBy = r.owner; c.mem.persistent = true; c.name = r.name;
    c.awareness.clear(); c.targetId = null; c.attackPhase = 0; c.alert = 0;
    if (c.mem.tear) c.stagger = 1;
    c.hp = Math.min(c.sp.hp, Math.max(c.hp, c.sp.hp * 0.6));
    c.setState('idle');
    let inv = this.cargo.get(c.id);
    if (!inv && c.inv && c.inv.owner === 'corpse:' + c.id && !c.dead) inv = c.inv; // a loaded save brought its hold back
    if (!inv) {
      inv = new Container(hash(c.id + 'cargo') % 1e9, `${r.name} — cargo`, 'thrall', Math.round(10 + c.sp.hp * 0.25 * r.tier));
      inv.owner = 'corpse:' + c.id; inv.lootDone = true;
    }
    this.cargo.set(c.id, inv);
    c.inv = inv;
  }
  forget(id: string) {
    const r = this.thralls.get(id);
    this.thralls.delete(id);
    const c = this.creature(id);
    if (c) { delete c.mem.dom; c.tamedBy = null; dropImplant(c); }
    if (r) bus.emit('thrallLost', r);
  }
}

// ---------------------------------------------------------------- ops
const D = () => G.dominion as DominionSystem | null;
defOp('domDown', (a: { id: string; s: number; by?: string }, ctx) => {
  if (isReplaying()) return;
  const d = D(), c = d?.creature(a.id); if (!d || !c || c.dead || c.mem.dom) return;
  const first = !d.isDowned(c);
  c.mem.domDownUntil = G.time + a.s;
  if (ctx.host) cbKnockDown(c, a.s);
  if (first) {
    bus.emit('creatureDowned', c, a.by);
    if (a.by && a.by === G.local?.id) {
      slowmo(0.35, 260); shake(0.35);
      G.audio?.at?.('dom_down', c.x, c.z, 0.8);
      const can = d.brainFor(c) && !domBlock(c);
      bus.emit('think', G.local, can ? "It's down. Open it up before it gets back up." : !domBlock(c) ? "It's down. If I had a brain for it..." : "It's down.");
    }
  }
});
/** the operation holds the body down (long), or lets it go (short) */
defOp('domHold', (a: { id: string; s: number; by?: string }, ctx) => {
  if (isReplaying()) return;
  const d = D(), c = d?.creature(a.id); if (!d || !c || c.dead || c.mem.dom) return;
  if (a.s > 5 && !d.isDowned(c)) return;
  c.mem.domDownUntil = G.time + a.s;
  if (!ctx.host) return;
  if (a.s > 5) cbKnockDown(c, a.s);
  else if (c.mem.cb?.down && c.mem.cb.down > G.time + a.s) c.mem.cb.down = G.time + a.s;
});
defOp('domInstall', (a: { id: string; by: string; tier: 1 | 2 | 3; name: string }, ctx) => {
  const d = D(); if (!d) return;
  const c = d.creature(a.id);
  if (ctx.host && !isReplaying()) {
    // the host checks the body on the table is still there, still down, and the brain fits
    if (!c || c.dead || !d.isDowned(c) || domBlock(c) || a.tier < tierNeeded(c)) return false;
    if (d.thrallsOf(a.by).length >= 6) return false;
  }
  d.applyInstall(a);
  return true;
});
defOp('domCmd', (a: { id: string; by: string; mode: ThrallMode; x?: number; z?: number; target?: string | null }) => {
  const d = D(), r = d?.rec(a.id); if (!d || !r || r.owner !== a.by) return;
  const c = d.creature(a.id);
  r.mode = a.mode;
  if (a.target !== undefined) r.target = a.target;
  if (a.mode !== 'station') r.station = null;
  if (a.mode === 'guard' || a.mode === 'stay') { r.gx = a.x ?? c?.x ?? r.gx; r.gz = a.z ?? c?.z ?? r.gz; }
  if (c) { c.mem.stay = a.mode === 'stay'; c.path = null; }
});
defOp('domStation', (a: { id: string; by: string; s: Station | null }) => {
  const d = D(), r = d?.rec(a.id); if (!d || !r || r.owner !== a.by) return;
  r.station = a.s; r.mode = a.s ? 'station' : 'follow'; r.rider = null;
  const c = d.creature(a.id); if (c) { c.mem.stay = false; c.path = null; }
  bus.emit('thrallStation', r);
});
defOp('domRide', (a: { id: string; by: string; on: boolean }) => {
  const d = D(), r = d?.rec(a.id); if (!d || !r) return;
  if (a.on) { if (r.owner !== a.by || r.rider) return; for (const o of d.thralls.values()) if (o.rider === a.by) o.rider = null; r.rider = a.by; r.mode = 'follow'; r.station = null; }
  else if (r.rider === a.by) r.rider = null;
});
defOp('domHaul', (a: { z: string; uid: number; id: string }) => {
  const z = G.zones.get(a.z), c = D()?.creature(a.id); if (!z || !c?.inv) return;
  const wi = floorItems(z).get(a.uid); if (!wi) return;
  removeFloorItem(z, wi.item);
  c.inv.add(wi.item);
  bus.emit('floorChanged', z); bus.emit('containerChanged', c.inv);
});
defOp('domUnload', (a: { z: string; id: string; ref: string }) => {
  const z = G.zones.get(a.z), c = D()?.creature(a.id); if (!z || !c?.inv) return;
  const o = z.objects.get(Number(a.ref.slice(4))); if (!o?.inv) return;
  for (const it of [...c.inv.items]) { if (!o.inv.hasRoom(it)) break; c.inv.remove(it); o.inv.add(it); }
  bus.emit('containerChanged', c.inv); bus.emit('containerChanged', o.inv);
});
defOp('domRelease', (a: { id: string; by: string }, ctx) => {
  const d = D(), r = d?.rec(a.id); if (!d || !r || r.owner !== a.by) return;
  const c = d.creature(a.id);
  d.forget(a.id);
  // the cortex shorts out and the body drops; the brain can be dug back out of it
  if (c && !c.dead && ctx.host && !isReplaying()) {
    const z = G.getZone(c.zoneKey);
    cs().kill(c, z, undefined, { dmg: 0, kind: 'trap', fx: c.x, fz: c.z });
    if (c.inv) c.inv.add(createItem(brainTier(r.tier).key));
  }
});
defOp('domGone', (a: { id: string }) => { D()?.forget(a.id); });


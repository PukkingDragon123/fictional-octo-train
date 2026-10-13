import * as THREE from 'three';
import { G } from '../game/G';
import { GameSystem } from '../game/game';
import { Creature, CState } from './creature';
import { SpeciesDef } from './species';
import { species as getSpecies, allSpecies } from './registry';
import { bus } from '../core/events';
import { Zone } from '../world/zone';
import { moveCircle, lineOfSight, wallsBetween } from '../world/collision';
import { findPath } from '../world/path';
import { Player } from '../entities/player';
import { clamp, dampAngle, wrapAngle, angleDiff } from '../core/math';
import { Rng } from '../core/rng';
import { BodyPart } from '../items/item';
import { InjuryType } from '../survival/body';
import { Container } from '../items/container';
import { uid } from '../core/rng';
import { rollLoot } from '../items/loot';
import { createItem } from '../items/factory';
import { MenuOption } from '../ui/ui';
import { op } from '../game/ops';
import { ButcherAction } from '../actions/world';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import { itemDef } from '../items/item';

export interface NoiseEvent { x: number; z: number; radius: number; kind: string; zone: string; by?: string; t: number; }

const PART_WEIGHTS_LOW: [BodyPart, number][] = [['shin_l', 4], ['shin_r', 4], ['foot_l', 2], ['foot_r', 2], ['thigh_l', 3], ['thigh_r', 3], ['hand_l', 1], ['hand_r', 1], ['farm_l', 1], ['farm_r', 1]];
const PART_WEIGHTS_MID: [BodyPart, number][] = [['torso_u', 3], ['torso_l', 3], ['uarm_l', 2], ['uarm_r', 2], ['farm_l', 3], ['farm_r', 3], ['hand_l', 2], ['hand_r', 2], ['thigh_l', 1], ['thigh_r', 1], ['groin', 1]];
const PART_WEIGHTS_HIGH: [BodyPart, number][] = [['head', 2], ['neck', 2], ['torso_u', 3], ['uarm_l', 2], ['uarm_r', 2], ['farm_l', 2], ['farm_r', 2]];

/**
 * Owns every creature: spawning per zone, perception (sight with light and
 * stealth, hearing through walls, scent trails, vibration, being watched),
 * the default behaviour state machine, locomotion with A*, attacks and
 * injuries, corpses and butchering, rendering and network snapshots.
 */
export class CreatureSystem implements GameSystem {
  name = 'creatures';
  creatures = new Map<string, Creature>();
  root = new THREE.Group();
  noises: NoiseEvent[] = [];
  rng = new Rng(Math.random() * 1e9);
  spawnT = 0;
  private lastThreat = 0;

  constructor() {
    G.creatures = this;
    G.pr.scene.add(this.root);
    bus.on('noise', (n: any) => { this.noises.push({ ...n, t: G.time }); if (G.role === 'client') G.net?.sendNoise?.(n); });
    bus.on('footstep', (p: Player) => this.footstepNoise(p));
  }

  list(): Creature[] { return [...this.creatures.values()].filter((c) => c.zoneKey === G.local?.zoneKey); }
  get isAuthority() { return G.role !== 'client'; }

  spawn(key: string, zoneKey: string, x: number, z: number, opts: Partial<Creature> = {}): Creature | null {
    const sp = getSpecies(key) as unknown as SpeciesDef;
    if (!sp) { console.warn('unknown species', key); return null; }
    const c = new Creature(sp, zoneKey, x, z, opts.id);
    Object.assign(c, opts);
    c.spawnedAt = G.time;
    this.creatures.set(c.id, c);
    return c;
  }

  remove(c: Creature) {
    if (c.rig) { this.root.remove(c.rig.root); }
    this.creatures.delete(c.id);
  }

  // ---------------------------------------------------------------- update
  update(dt: number, _dh: number) {
    if (this.isAuthority) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 2.5; this.manageSpawns(); }
      const active = new Set<string>();
      for (const p of G.players.values()) active.add(p.zoneKey);
      for (const c of this.creatures.values()) {
        if (!active.has(c.zoneKey)) continue;
        this.simulate(c, dt);
      }
      this.noises = this.noises.filter((n) => G.time - n.t < 0.5);
    } else {
      for (const c of this.creatures.values()) this.interpolate(c, dt);
    }
    this.updateVisuals(dt);
    this.updateThreat(dt);
  }

  private footstepNoise(p: Player) {
    const z = G.getZone(p.zoneKey);
    const f = z.floorAt(p.tileX(), p.tileY());
    let r = p.running ? 14 : p.stance === 'sneak' ? 3.5 : 7;
    const snd = f?.sound;
    if (snd === 'carpet' || snd === 'grass' || snd === 'dirt') r *= 0.75;
    else if (snd === 'tile' || snd === 'metal' || snd === 'linoleum') r *= 1.2;
    else if (snd === 'water' || snd === 'wetcarpet') r *= 1.3;
    if (p.body.has('graceful') || p.body.perks.has('lightstep')) r *= 0.7;
    if (p.body.has('clumsy')) r *= 1.3;
    r *= 1 + Math.max(0, p.heavyLoad()) * 0.5;
    bus.emit('noise', { x: p.x, z: p.z, radius: r, kind: p.running ? 'run' : 'step', zone: p.zoneKey, by: p.id });
    // scent trail for trackers
    const i = z.idx(p.tileX(), p.tileY());
    z.scent[i] = G.clock.hours;
  }

  // ---------------------------------------------------------------- spawning
  private manageSpawns() {
    const zones = new Set<string>();
    for (const p of G.players.values()) zones.add(p.zoneKey);
    for (const zk of zones) {
      const z = G.getZone(zk);
      const here = [...this.creatures.values()].filter((c) => c.zoneKey === zk && !c.dead);
      const cap = Math.round(z.creatureCap * G.sandbox.creatures * (1 + G.collapse * 0.8));
      // despawn far, unseen wanderers
      for (const c of here) {
        if (c.mem.persistent || c.tamedBy) continue;
        const near = Math.min(...[...G.players.values()].filter((p) => p.zoneKey === zk).map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
        if (near > 70 && G.time - c.lastObserved > 90) this.remove(c);
      }
      if (here.length >= cap || !z.spawnTable.length) continue;
      const table = z.spawnTable.filter(([k]) => getSpecies(k));
      if (!table.length) continue;
      const key = this.rng.weighted(table as [string, number][]);
      const sp = getSpecies(key) as unknown as SpeciesDef;
      if (sp.maxPerZone !== undefined && here.filter((c) => c.sp.key === key).length >= sp.maxPerZone) continue;
      const pos = this.findSpawnSpot(z, sp);
      if (!pos) continue;
      const n = sp.group ? this.rng.int(sp.group[0], sp.group[1]) : 1;
      for (let i = 0; i < n; i++) {
        const c = this.spawn(key, zk, pos[0] + 0.5 + this.rng.float(-1, 1), pos[1] + 0.5 + this.rng.float(-1, 1));
        if (c && sp.flags?.furniture) c.setState('disguised');
      }
    }
  }

  findSpawnSpot(z: Zone, sp: SpeciesDef): [number, number] | null {
    for (let t = 0; t < 40; t++) {
      const spot = z.randomFloor(this.rng, (x, y) => {
        if (sp.flags?.swimmer) return z.floorAt(x, y)?.water === 'deep';
        if (sp.flags?.underCarpet) return (z.floorAt(x, y)?.sound ?? '').includes('carpet');
        if (sp.diet === 'grass') return !!z.floorAt(x, y)?.outdoor;
        return true;
      });
      if (!spot) continue;
      let ok = true;
      for (const p of G.players.values()) {
        if (p.zoneKey !== z.key) continue;
        const d = Math.hypot(p.x - spot[0], p.z - spot[1]);
        if (d < 20) { ok = false; break; }
        if (p.isLocal && G.view?.zone === z && G.view.vis.isVisible(spot[0], spot[1])) { ok = false; break; }
      }
      if (ok) return spot;
    }
    return null;
  }

  // ---------------------------------------------------------------- perception
  playersInZone(zk: string): Player[] { return [...G.players.values()].filter((p) => p.zoneKey === zk && !p.body.dead); }

  /** how visible is player p to creature c this instant (0..1) */
  visibility(c: Creature, p: Player, z: Zone): number {
    const sp = c.sp;
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > sp.sight * 1.6) return 0;
    let light = G.view?.zone === z ? G.lightLevelAt(p.x, p.z) : 0.5;
    if (p.flashlightOn) light += 0.8;
    if (sp.nightVision) light = Math.max(light, 0.9);
    let range = sp.sight * clamp(light * 1.4, 0.18, 1);
    if (p.stance === 'sneak') range *= 0.55 * (1 - p.body.skill('sneaking') * 0.04);
    if (p.running) range *= 1.15;
    if (d > range) return 0;
    const ang = Math.abs(angleDiff(c.facing, Math.atan2(dz, dx)));
    const inCone = ang < sp.fov || d < 2.2;
    if (!inCone) return 0;
    if (!lineOfSight(z, c.x, c.z, p.x, p.z)) return 0;
    return clamp(1 - d / (range + 0.01), 0.15, 1);
  }

  /** is creature c being looked at by any player (for things that only move unobserved) */
  observed(c: Creature, z: Zone): boolean {
    for (const p of this.playersInZone(c.zoneKey)) {
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
      if (d > 30) continue;
      const ang = Math.abs(angleDiff(p.facing, Math.atan2(dz, dx)));
      const cone = (p.isLocal && G.view ? G.view.vis.coneHalf : 1.4) + 0.05;
      if (ang > cone && d > 2.0) continue;
      if (!lineOfSight(z, p.x, p.z, c.x, c.z)) continue;
      const lit = (G.view?.zone === z ? G.lightLevelAt(c.x, c.z) : 0.5) + (p.flashlightOn && ang < 0.55 ? 1 : 0);
      if (lit < 0.1 && d > 3) continue;
      if (p.sleeping || p.body.downed) continue;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- simulation
  private simulate(c: Creature, dt: number) {
    const z = G.getZone(c.zoneKey);
    if (c.dead) { c.deathT += dt; return; }
    c.stateT += dt;
    c.attackT = Math.max(0, c.attackT - dt);
    c.stagger = Math.max(0, c.stagger - dt);
    c.noiseCooldown = Math.max(0, c.noiseCooldown - dt);
    c.observed = this.observed(c, z);
    if (c.observed) c.lastObserved = G.time;
    // attack in progress
    if (c.attackPhase > 0) {
      c.attackPhase -= dt;
      c.vx *= 0.8; c.vz *= 0.8;
      if (c.attackPhase <= 0) this.resolveAttack(c);
      this.applyMove(c, z, dt);
      return;
    }
    if (c.stagger > 0) { this.applyMove(c, z, dt); return; }
    c.thinkT -= dt;
    const doThink = c.thinkT <= 0;
    if (doThink) {
      c.thinkT = 0.18 + this.rng.next() * 0.08;
      this.perceive(c, z, 0.25);
    }
    if (!(c.sp.think && c.sp.think(c, dt))) this.defaultBrain(c, z, dt, doThink);
    this.applyMove(c, z, dt);
  }

  perceive(c: Creature, z: Zone, dt: number) {
    const sp = c.sp;
    let best: Player | null = null, bestA = 0;
    for (const p of this.playersInZone(c.zoneKey)) {
      let v = this.visibility(c, p, z);
      if (sp.vibration) {
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (p.speed > 0.4 && p.stance !== 'sneak' && d < 5.5) v = Math.max(v, 1 - d / 5.5);
      }
      let a = c.awareness.get(p.id) ?? 0;
      a = v > 0 ? Math.min(1.5, a + v * dt * (3 + c.alert * 4)) : Math.max(0, a - dt * 0.25);
      c.awareness.set(p.id, a);
      if (a > bestA) { bestA = a; best = p; }
      if (v > 0 && a >= 1) c.lastSeen = { x: p.x, z: p.z, t: G.time };
    }
    if (best && bestA >= 1) { c.targetId = best.id; c.alert = Math.min(1, c.alert + dt); }
    else c.alert = Math.max(0, c.alert - dt * 0.08);
    // hearing
    for (const n of this.noises) {
      if (n.zone !== c.zoneKey) continue;
      const d = Math.hypot(n.x - c.x, n.z - c.z);
      let r = n.radius * sp.hearing;
      const walls = wallsBetween(z, c.x, c.z, n.x, n.z, 4);
      r *= Math.pow(0.6, walls);
      if (d < r) {
        if (!c.lastHeard || G.time - c.lastHeard.t > 0.5 || r - d > c.lastHeard.r) c.lastHeard = { x: n.x + this.rng.float(-1.5, 1.5) * (d / r), z: n.z + this.rng.float(-1.5, 1.5) * (d / r), t: G.time, r: r - d };
        if (c.state === 'sleep' && d < r * 0.6) c.setState('idle');
      }
    }
  }

  target(c: Creature): Player | null { return c.targetId ? (G.players.get(c.targetId) || null) : null; }

  /** default behaviour tree by temperament */
  defaultBrain(c: Creature, z: Zone, dt: number, think: boolean) {
    const sp = c.sp;
    const t = this.target(c);
    const aware = t ? (c.awareness.get(t.id) ?? 0) >= 1 : false;
    const dist = t ? Math.hypot(t.x - c.x, t.z - c.z) : Infinity;
    const T = sp.temperament;
    const fearful = T === 'peaceful' || T === 'skittish';
    // tamed companions
    if (c.tamedBy) { this.companionBrain(c, z, dt, think); return; }
    // fear of fire for hostile beasts
    if (think && !fearful && G.items?.fireNear?.(c.x, c.z, 4, c.zoneKey) && T !== 'hazard') { c.setState('flee'); c.goal = this.fleeSpot(c, z, c.x, c.z); }
    switch (c.state) {
      case 'disguised':
        c.speed = 0;
        if (t && dist < 1.8 && aware) { c.setState('attack'); this.startAttack(c, t); }
        else if (t && dist < 3.5 && (c.awareness.get(t.id) ?? 0) > 0.6 && !c.observed) { c.setState('chase'); bus.emit('creatureReveal', c); }
        return;
      case 'sleep':
        c.speed = 0;
        if (c.stateT > 60 + this.rng.next() * 60) c.setState('idle');
        if (aware && dist < 6) { c.setState(fearful ? 'flee' : T === 'territorial' ? 'warn' : 'idle'); }
        return;
      case 'idle':
      case 'wander':
      case 'graze':
        if (aware) {
          if (fearful) { if (dist < (T === 'skittish' ? 14 : 8) || t!.running) { c.setState('flee'); c.goal = this.fleeSpot(c, z, t!.x, t!.z); this.call(c, 'alert'); } }
          else if (T === 'curious') { c.setState('curious'); }
          else if (T === 'territorial') { if (dist < 7) { c.setState('warn'); this.call(c, 'alert'); } }
          else if (T === 'hostile' || T === 'ambush') { c.setState('chase'); this.call(c, 'alert'); }
          else if (T === 'stalker') { c.setState('stalk'); }
          else if (T === 'neutral') { /* ignores unless attacked */ }
        } else if (c.lastHeard && G.time - c.lastHeard.t < 1 && !fearful && T !== 'neutral') {
          c.setState('investigate'); c.goal = { x: c.lastHeard.x, z: c.lastHeard.z };
        } else if (c.lastHeard && G.time - c.lastHeard.t < 1 && fearful && c.lastHeard.r > 3) {
          c.setState('flee'); c.goal = this.fleeSpot(c, z, c.lastHeard.x, c.lastHeard.z);
        } else if (sp.smell && think && this.rng.chance(0.05)) {
          const s = this.scentStep(c, z); if (s) { c.setState('investigate'); c.goal = s; }
        } else {
          if (c.state === 'idle') {
            c.speed = 0;
            if (c.stateT > 2 + this.rng.next() * 5) {
              if (sp.diet === 'grass' && this.rng.chance(0.5)) c.setState('graze');
              else if (sp.flags?.nocturnal && !G.clock.isNight() && this.rng.chance(0.3)) c.setState('sleep');
              else { c.setState('wander'); c.goal = this.wanderSpot(c, z); }
            }
            if (c.noiseCooldown <= 0 && this.rng.chance(dt * 0.08)) { this.call(c, 'idle'); c.noiseCooldown = 6; }
          } else if (c.state === 'graze') {
            c.speed = 0;
            if (c.stateT > 6 + this.rng.next() * 8) c.setState('idle');
          } else {
            if (!c.goal || this.moveTo(c, z, c.goal.x, c.goal.z, sp.walk * 0.7, dt, 0.6)) c.setState('idle');
            if (c.stateT > 20) c.setState('idle');
          }
        }
        return;
      case 'investigate':
        if (aware && !fearful) { c.setState(T === 'stalker' ? 'stalk' : 'chase'); return; }
        if (!c.goal || this.moveTo(c, z, c.goal.x, c.goal.z, sp.walk, dt, 0.8) || c.stateT > 15) {
          c.setState('idle'); c.stateT = -3; // linger, looking around
          c.targetFacing += 1.2;
        }
        return;
      case 'curious':
        if (!t || !aware) { c.setState('idle'); return; }
        if (dist < 2.5 || t.running) { c.setState('flee'); c.goal = this.fleeSpot(c, z, t.x, t.z); return; }
        if (dist > 4.5) this.moveTo(c, z, t.x, t.z, sp.walk * 0.6, dt, 3.5);
        else { c.speed = 0; c.targetFacing = Math.atan2(t.z - c.z, t.x - c.x); }
        if (c.stateT > 25) c.setState('wander');
        return;
      case 'warn':
        if (!t) { c.setState('idle'); return; }
        c.speed = 0;
        c.targetFacing = Math.atan2(t.z - c.z, t.x - c.x);
        if (c.noiseCooldown <= 0) { this.call(c, 'alert'); c.noiseCooldown = 2.5; }
        if (dist < 3 || c.stateT > 5 && dist < 6) c.setState('chase');
        else if (dist > 9) c.setState('idle');
        return;
      case 'stalk': {
        if (!t) { c.setState('idle'); return; }
        // keep distance, stay out of light, strike when close and unobserved
        const want = 9;
        if ((dist < 4 && !c.observed) || t.body.downed || t.body.health < 30) { c.setState('chase'); return; }
        if (c.observed && dist < 12 && this.rng.chance(dt * 0.6)) { c.setState('flee'); c.goal = this.fleeSpot(c, z, t.x, t.z); return; }
        if (dist > want + 3) this.moveTo(c, z, t.x, t.z, sp.walk, dt, want);
        else c.speed = 0;
        c.targetFacing = Math.atan2(t.z - c.z, t.x - c.x);
        if (c.stateT > 60) c.setState('idle');
        return;
      }
      case 'chase': {
        if (!t || t.body.dead) { c.setState('idle'); c.targetId = null; return; }
        const lost = !aware && (!c.lastSeen || G.time - c.lastSeen.t > 6);
        if (lost) { c.setState('investigate'); c.goal = c.lastSeen ? { x: c.lastSeen.x, z: c.lastSeen.z } : null; return; }
        const reach = (sp.attack?.range ?? 1) + t.radius;
        if (dist <= reach && c.attackT <= 0 && sp.attack) { this.startAttack(c, t); return; }
        const gx = aware ? t.x : c.lastSeen!.x, gz = aware ? t.z : c.lastSeen!.z;
        this.moveTo(c, z, gx, gz, sp.run, dt, reach * 0.8);
        if (dist <= reach) { c.speed = 0; c.targetFacing = Math.atan2(t.z - c.z, t.x - c.x); }
        if (c.noiseCooldown <= 0 && this.rng.chance(dt * 0.4)) { this.call(c, 'attack'); c.noiseCooldown = 3; }
        return;
      }
      case 'flee':
        if (!c.goal) c.goal = this.wanderSpot(c, z, 20);
        if (this.moveTo(c, z, c.goal.x, c.goal.z, sp.run, dt, 1) || c.stateT > 8) { c.setState('idle'); c.awareness.clear(); }
        return;
      default:
        if (c.stateT > 10) c.setState('idle');
        c.speed = 0;
    }
  }

  companionBrain(c: Creature, z: Zone, dt: number, think: boolean) {
    const owner = G.players.get(c.tamedBy!);
    if (!owner || owner.zoneKey !== c.zoneKey) { c.speed = 0; return; }
    // defend owner: attack hostiles near
    if (think) {
      let foe: Creature | null = null, fd = 7;
      for (const o of this.creatures.values()) {
        if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.tamedBy) continue;
        if (o.sp.temperament !== 'hostile' && o.sp.temperament !== 'stalker' && o.sp.temperament !== 'ambush') continue;
        const d = Math.hypot(o.x - owner.x, o.z - owner.z);
        if (d < fd) { fd = d; foe = o; }
      }
      c.mem.foe = foe?.id ?? null;
      if (foe && c.noiseCooldown <= 0) { this.call(c, 'alert'); c.noiseCooldown = 4; bus.emit('think', owner, `${c.name} growls at something.`); }
    }
    const foe = c.mem.foe ? this.creatures.get(c.mem.foe) : null;
    if (foe && c.sp.attack) {
      const d = Math.hypot(foe.x - c.x, foe.z - c.z);
      if (d < c.sp.attack.range + foe.radius && c.attackT <= 0) { c.attackT = c.sp.attack.cooldown; this.damage(c.id, foe.id, (c.sp.attack.dmg[0] + c.sp.attack.dmg[1]) / 2, c.x, c.z); return; }
      this.moveTo(c, z, foe.x, foe.z, c.sp.run, dt, 0.8);
      return;
    }
    const d = Math.hypot(owner.x - c.x, owner.z - c.z);
    if (d > 2.5) this.moveTo(c, z, owner.x, owner.z, d > 6 ? c.sp.run : c.sp.walk, dt, 1.8);
    else { c.speed = 0; if (this.rng.chance(dt * 0.3)) c.targetFacing = Math.atan2(owner.z - c.z, owner.x - c.x); }
  }

  // ---------------------------------------------------------------- locomotion
  /** move toward a point (pathfinding when blocked). returns true when within `stop` metres */
  moveTo(c: Creature, z: Zone, gx: number, gz: number, speed: number, dt: number, stop = 0.5): boolean {
    const dx = gx - c.x, dz = gz - c.z;
    const d = Math.hypot(dx, dz);
    if (d <= stop) { c.speed = 0; return true; }
    c.repathT -= dt;
    const direct = d < 6 && lineOfSight(z, c.x, c.z, gx, gz);
    let tx = gx, tz = gz;
    if (!direct || c.sp.flags?.ghost) {
      if (!c.sp.flags?.ghost) {
        if (!c.path || c.repathT <= 0) {
          c.repathT = 1.2 + this.rng.next();
          c.path = findPath(z, Math.floor(c.x), Math.floor(c.z), Math.floor(gx), Math.floor(gz), { creature: true, maxNodes: 2500, doors: false });
          c.pathIdx = 0;
          if (!c.path) { c.speed = 0; return d < stop + 2; }
        }
        while (c.path && c.pathIdx < c.path.length && Math.hypot(c.path[c.pathIdx][0] + 0.5 - c.x, c.path[c.pathIdx][1] + 0.5 - c.z) < 0.45) c.pathIdx++;
        if (c.path && c.pathIdx < c.path.length) { tx = c.path[c.pathIdx][0] + 0.5; tz = c.path[c.pathIdx][1] + 0.5; }
      }
    }
    const ddx = tx - c.x, ddz = tz - c.z, dd = Math.hypot(ddx, ddz) || 1;
    c.targetFacing = Math.atan2(ddz, ddx);
    c.vx = (ddx / dd) * speed; c.vz = (ddz / dd) * speed;
    c.speed = speed;
    return false;
  }

  private applyMove(c: Creature, z: Zone, dt: number) {
    const turn = c.sp.turn ?? 8;
    c.facing = dampAngle(c.facing, c.targetFacing, turn, dt);
    if (c.speed <= 0.01) { c.vx *= 0.7; c.vz *= 0.7; }
    const mvx = c.vx * dt, mvz = c.vz * dt;
    if (Math.abs(mvx) + Math.abs(mvz) > 1e-5) {
      const ox = c.x, oz = c.z;
      moveCircle(z, c, mvx, mvz, { creature: true, ghost: !!c.sp.flags?.ghost, ignoreLow: true });
      const moved = Math.hypot(c.x - ox, c.z - oz);
      c.phase += moved / Math.max(0.3, c.radius * 2.2) * Math.PI;
      if (c.speed > 0 && moved < Math.hypot(mvx, mvz) * 0.15) { c.repathT = 0; c.path = null; }
    }
    if (c.speed <= 0.01 && c.attackPhase <= 0) { c.vx = 0; c.vz = 0; }
    // separation from other creatures
    for (const o of this.creatures.values()) {
      if (o === c || o.dead || o.zoneKey !== c.zoneKey) continue;
      const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), m = c.radius + o.radius;
      if (d > 0.001 && d < m) { const push = (m - d) * 0.5; c.x += (dx / d) * push; c.z += (dz / d) * push; }
    }
    // keep out of players
    for (const p of G.players.values()) {
      if (p.zoneKey !== c.zoneKey || p.body.dead) continue;
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz), m = c.radius + p.radius;
      if (d > 0.001 && d < m) { const push = (m - d); c.x += (dx / d) * push * 0.6; c.z += (dz / d) * push * 0.6; if (p.isLocal) { p.x -= (dx / d) * push * 0.4; p.z -= (dz / d) * push * 0.4; } }
    }
    c.y = z.heightAt(Math.floor(c.x), Math.floor(c.z)) + (c.sp.flags?.swimmer ? -0.6 : 0);
  }

  wanderSpot(c: Creature, z: Zone, r = 10): { x: number; z: number } {
    for (let t = 0; t < 12; t++) {
      const x = Math.floor(c.home.x + this.rng.float(-r, r)), y = Math.floor(c.home.z + this.rng.float(-r, r));
      if (!z.inb(x, y) || !z.floor[z.idx(x, y)] || z.solid[z.idx(x, y)]) continue;
      if (c.sp.flags?.swimmer && z.floorAt(x, y)?.water !== 'deep') continue;
      if (c.sp.flags?.underCarpet && !(z.floorAt(x, y)?.sound ?? '').includes('carpet')) continue;
      return { x: x + 0.5, z: y + 0.5 };
    }
    return { x: c.x, z: c.z };
  }
  fleeSpot(c: Creature, z: Zone, fx: number, fz: number): { x: number; z: number } {
    const a = Math.atan2(c.z - fz, c.x - fx);
    for (let t = 0; t < 10; t++) {
      const aa = a + this.rng.float(-0.8, 0.8), d = this.rng.float(10, 18);
      const x = Math.floor(c.x + Math.cos(aa) * d), y = Math.floor(c.z + Math.sin(aa) * d);
      if (z.inb(x, y) && z.floor[z.idx(x, y)] && !z.solid[z.idx(x, y)]) return { x: x + 0.5, z: y + 0.5 };
    }
    return this.wanderSpot(c, z, 15);
  }
  scentStep(c: Creature, z: Zone): { x: number; z: number } | null {
    let best = 0, bx = 0, by = 0;
    const cx = Math.floor(c.x), cy = Math.floor(c.z);
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!z.inb(x, y)) continue;
      const s = z.scent[z.idx(x, y)];
      if (s > best && G.clock.hours - s < 6) { best = s; bx = x; by = y; }
    }
    return best ? { x: bx + 0.5, z: by + 0.5 } : null;
  }

  call(c: Creature, kind: 'idle' | 'alert' | 'attack' | 'hurt' | 'death' | 'call') {
    const snd = c.sp.sounds?.[kind];
    if (snd) { G.audio?.creature?.(snd, c); if (G.role === 'host') G.net?.broadcastFx?.('csnd', { id: c.id, s: snd }); }
  }

  // ---------------------------------------------------------------- combat
  startAttack(c: Creature, p: Player) {
    c.attackPhase = 0.38;
    c.mem.attackTarget = p.id;
    c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
    c.attackT = c.sp.attack!.cooldown;
    this.call(c, 'attack');
  }
  private resolveAttack(c: Creature) {
    const p = G.players.get(c.mem.attackTarget);
    const a = c.sp.attack;
    if (!p || !a || p.body.dead || p.zoneKey !== c.zoneKey) return;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d > a.range + p.radius + 0.35) { if (p.isLocal) G.audio?.at?.('whoosh', c.x, c.z); return; }
    // dodge chance for nimble survivors
    const dodge = 0.06 + p.body.skill('nimble') * 0.025 + (p.aiming ? 0.04 : 0);
    if (this.rng.chance(dodge)) { if (p.isLocal) bus.emit('halo', p, 'Dodged!', 'good'); return; }
    const hit = { dmg: this.rng.float(a.dmg[0], a.dmg[1]), kinds: a.kinds, corrupt: a.corrupt, height: c.height, knock: a.knock ?? 0.6, from: [c.x, c.z] as [number, number], grab: !!a.grab, parts: a.parts, by: c.sp.key };
    if (p.isLocal) applyHitToPlayer(p, hit);
    else G.net?.sendHurt?.(p.id, hit);
  }

  /** damage a creature (authority) */
  damage(byId: string, cid: string, amount: number, fx: number, fz: number, knock = 0.4) {
    const c = this.creatures.get(cid);
    if (!c || c.dead) return;
    if (!this.isAuthority) { op('creatureHit', { id: cid, dmg: amount, fx, fz, knock, by: byId }); return; }
    if (c.sp.flags?.immortal) { c.stagger = 0.4; this.call(c, 'hurt'); return; }
    c.hp -= amount;
    c.hitFlash = 0.15;
    c.stagger = 0.25 + knock * 0.3;
    const dx = c.x - fx, dz = c.z - fz, d = Math.hypot(dx, dz) || 1;
    c.vx = (dx / d) * knock * 6; c.vz = (dz / d) * knock * 6;
    c.awareness.set(byId, 1.5);
    c.targetId = G.players.has(byId) ? byId : c.targetId;
    c.lastSeen = { x: fx, z: fz, t: G.time };
    const z = G.getZone(c.zoneKey);
    if (this.rng.chance(0.5)) op('decal', { z: c.zoneKey, d: { x: c.x + this.rng.float(-0.4, 0.4), z: c.z + this.rng.float(-0.4, 0.4), w: 0.5 + amount * 0.03, d: 0.5 + amount * 0.03, rot: this.rng.float(0, 6), tex: c.sp.flags?.glitch ? 'decal_glitch' : 'decal_blood_drip' } });
    if (c.hp <= 0) this.kill(c, z, byId);
    else {
      this.call(c, 'hurt');
      const T = c.sp.temperament;
      if (T === 'peaceful' || T === 'skittish' || T === 'curious') { c.setState('flee'); c.goal = this.fleeSpot(c, z, fx, fz); }
      else if (T !== 'hazard') c.setState('chase');
    }
  }

  kill(c: Creature, z: Zone, byId?: string) {
    c.dead = true; c.hp = 0; c.setState('dead'); c.speed = 0; c.vx = c.vz = 0;
    this.call(c, 'death');
    if (!c.sp.flags?.noCorpse) {
      c.inv = new Container(uid(), c.sp.name, 'corpse', 30);
      c.inv.owner = 'corpse:' + c.id;
      const drops = rollLoot('creature_' + c.sp.key, this.rng);
      for (const k of drops) c.inv.add(createItem(k, this.rng));
      c.inv.lootDone = true;
      op('decal', { z: c.zoneKey, d: { x: c.x, z: c.z, w: 1 + c.radius * 2, d: 1 + c.radius * 2, rot: this.rng.float(0, 6), tex: c.sp.flags?.glitch ? 'decal_glitch' : 'decal_blood_pool' } });
    } else {
      setTimeout(() => this.remove(c), 1500);
    }
    const killer = byId ? G.players.get(byId) : null;
    if (killer) killer.kills++;
    bus.emit('creatureKilled', c, killer);
  }

  corpseContainer(id: string) { return this.creatures.get(id)?.inv ?? null; }
  nearbyCorpses(p: Player, r: number) {
    const out: { inv: Container; name: string }[] = [];
    for (const c of this.creatures.values()) if (c.dead && c.inv && c.zoneKey === p.zoneKey && Math.hypot(c.x - p.x, c.z - p.z) < r + c.radius) out.push({ inv: c.inv, name: c.displayName() });
    return out;
  }
  onButcher(c: Creature) { c.butchered = true; if (c.rig) c.rig.root.scale.y = 0.6; }

  menuOptions(p: Player, c: Creature): MenuOption[] {
    const out: MenuOption[] = [];
    if (G.ui?.scanner) out.push({ label: 'Scan with SEER-9', action: () => G.ui.scanner.scanCreature?.(c) });
    if (c.dead) {
      out.push({ label: 'Search', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Search', 0.6, 'loot', () => G.ui?.inventory?.toggle(true)), 1.4, false) });
      if (c.sp.meat && !c.butchered) out.push({ label: 'Butcher', disabled: !p.findTool('#knife') ? 'needs a knife' : false, action: () => queueAt(p, c.x, c.z, new ButcherAction(p, c), 1.4, false) });
      return out;
    }
    if (c.sp.tame && !c.tamedBy) {
      const food = p.findItem((it) => c.sp.tame!.food.includes(it.key));
      out.push({ label: 'Offer food', disabled: !food ? 'needs ' + c.sp.tame.food.map((k) => itemDef(k).name).slice(0, 2).join('/') : false, action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Offer food', 2, 'pickup', () => this.feed(p, c, food!)), 1.6, false) });
    }
    if (c.tamedBy === p.id) {
      out.push({ label: 'Pet', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Pet', 2, 'pickup', () => { p.body.unhappy = Math.max(0, p.body.unhappy - 12); p.body.stress = Math.max(0, p.body.stress - 10); bus.emit('think', p, ['Good... boy?', 'It purrs like a fridge.', 'It leans into my hand.'][Math.floor(Math.random() * 3)]); }), 1.4, false) });
      out.push({ label: c.mem.stay ? 'Follow me' : 'Stay', action: () => { c.mem.stay = !c.mem.stay; } });
    }
    return out;
  }
  feed(p: Player, c: Creature, food: any) {
    p.removeItem(food);
    c.feeds++;
    c.setState('idle');
    c.awareness.clear();
    bus.emit('inventoryChanged', p);
    if (c.sp.tame && c.feeds >= c.sp.tame.feeds) {
      c.tamedBy = p.id; c.mem.persistent = true;
      c.name = c.sp.name;
      bus.emit('halo', p, `${c.sp.name} trusts you`, 'good');
      bus.emit('tamed', p, c);
    } else bus.emit('think', p, 'It sniffs the food... and eats it.');
  }

  // ---------------------------------------------------------------- client interpolation
  applySnapshot(s: any) {
    let c = this.creatures.get(s.id);
    if (!c) { c = this.spawn(s.k, s.z, s.x, s.zz, { id: s.id }) || undefined; if (!c) return; }
    c.zoneKey = s.z;
    c.net = { x: s.x, z: s.zz, f: s.f, t: G.time };
    c.state = s.s; c.speed = s.sp; c.hp = s.hp; c.y = s.y;
    if (s.d && !c.dead) { c.dead = true; c.inv = c.inv || new Container(uid(), c.sp.name, 'corpse', 30); c.inv.owner = 'corpse:' + c.id; }
    c.attackPhase = s.at ? 0.2 : 0;
    if (s.m) c.mem.netMem = s.m;
  }
  private interpolate(c: Creature, dt: number) {
    if (!c.net) return;
    const k = 1 - Math.exp(-10 * dt);
    const ox = c.x, oz = c.z;
    c.x += (c.net.x - c.x) * k; c.z += (c.net.z - c.z) * k;
    c.facing = dampAngle(c.facing, c.net.f, 10, dt);
    c.phase += Math.hypot(c.x - ox, c.z - oz) / Math.max(0.3, c.radius * 2.2) * Math.PI;
  }

  // ---------------------------------------------------------------- rendering
  private updateVisuals(dt: number) {
    const local = G.local;
    if (!local || !G.view) return;
    const zk = local.zoneKey;
    for (const c of this.creatures.values()) {
      const inZone = c.zoneKey === zk;
      if (!inZone) { if (c.rig) { this.root.remove(c.rig.root); c.rig = null; } continue; }
      const d = Math.hypot(c.x - local.x, c.z - local.z);
      if (d > 50) { if (c.rig) c.rig.root.visible = false; c.visibleToLocal = false; continue; }
      if (!c.rig) { c.rig = c.sp.build(); c.rig.root.userData.creature = c; this.root.add(c.rig.root); }
      const vis = G.view.vis;
      const tileVis = vis.isVisible(Math.floor(c.x), Math.floor(c.z));
      const show = tileVis || d < 1.6;
      c.visibleToLocal = show;
      if (show && !c.wasSeenByLocal) { c.wasSeenByLocal = true; bus.emit('creatureSeen', c); }
      c.rig.root.visible = show || !!c.rig.eyes;
      if (c.rig.eyes) for (const e of c.rig.eyes) e.visible = show || (d < 16 && lineOfSight(G.zone, local.x, local.z, c.x, c.z) && !c.dead);
      c.rig.body.visible = show;
      c.rig.root.position.set(c.x, c.y, c.z);
      c.rig.root.rotation.y = Math.PI / 2 - c.facing;
      c.animT += dt;
      c.hitFlash = Math.max(0, c.hitFlash - dt);
      try { c.sp.animate(c.rig, c, c.animT, dt); } catch (e) { console.error('anim', c.sp.key, e); }
      if (c.dead) {
        const k = Math.min(1, c.deathT * 2 + (c.deathT > 0 ? 0 : 1));
        c.rig.body.rotation.z = (c.sp.flags?.flying ? 0 : Math.PI / 2) * Math.min(1, k + 0.01);
        c.rig.body.position.y = -c.height * 0.25 * Math.min(1, k + 0.01);
      }
    }
  }

  /** panic & lucidity pressure on the local player from visible creatures */
  private updateThreat(dt: number) {
    const p = G.local; if (!p || !G.survival) return;
    let threat = 0, anomaly = 0;
    for (const c of this.creatures.values()) {
      if (c.dead || c.zoneKey !== p.zoneKey || !c.visibleToLocal || c.tamedBy) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const lit = G.lightLevelAt(c.x, c.z) > 0.12 || d < 4;
      if (!lit) continue;
      const base = c.sp.threat / 5;
      const near = clamp(1 - d / 18, 0, 1);
      const active = c.state === 'chase' || c.state === 'attack' ? 1.4 : c.state === 'stalk' || c.state === 'warn' ? 1.1 : 0.6;
      threat = Math.max(threat, base * near * active);
      if (c.sp.flags?.watcher || c.sp.flags?.glitch || c.sp.flags?.weepingAngel) anomaly = Math.max(anomaly, near * 0.8 + 0.2);
    }
    G.survival.threat = Math.max(G.survival.threat, threat);
    G.survival.anomaly = Math.max(G.survival.anomaly, anomaly);
    this.lastThreat = threat; void dt;
  }
}

// ---------------------------------------------------------------- player injury application
export interface HitInfo { dmg: number; kinds: InjuryType[]; corrupt: number; height: number; knock: number; from: [number, number]; grab: boolean; parts?: string[]; by: string; }

/** Apply a creature's hit to a local player's body: protection, injury type, corruption, knockback, feedback. */
export function applyHitToPlayer(p: Player, h: HitInfo) {
  const rng = new Rng(Math.random() * 1e9);
  const table = h.parts?.length ? h.parts.map((x) => [x as BodyPart, 1] as [BodyPart, number]) : h.height < 0.9 ? PART_WEIGHTS_LOW : h.height < 2.0 ? PART_WEIGHTS_MID : PART_WEIGHTS_HIGH;
  const part = p.body.downed ? rng.pick(['torso_u', 'torso_l', 'head'] as BodyPart[]) : rng.weighted(table);
  let kind = rng.pick(h.kinds);
  const prot = p.protection(part, kind === 'bite' ? 'bite' : 'scratch');
  // clothing can stop the attack from breaking skin entirely
  if (rng.chance(prot / 100)) {
    kind = 'bruise';
    for (const w of p.worn.values()) { const c = itemDef(w.key).clothing; if (c && (c.covers as string[]).includes(part)) { w.cond = Math.max(0, w.cond - 0.08); break; } }
    bus.emit('think', p, 'My clothes took the hit.');
  }
  const sev = clamp(h.dmg / 30, 0.15, 1);
  p.body.addInjury(part, kind, sev, { corruptChance: kind === 'bruise' ? 0 : h.corrupt, dirty: true });
  p.body.health = Math.max(0, p.body.health - h.dmg * 0.35);
  p.body.panic = Math.min(100, p.body.panic + 18);
  // knockback
  const dx = p.x - h.from[0], dz = p.z - h.from[1], d = Math.hypot(dx, dz) || 1;
  p.vx += (dx / d) * h.knock * 4; p.vz += (dz / d) * h.knock * 4;
  p.actions.clear();
  G.pr.fx.hurt = Math.min(1, G.pr.fx.hurt + 0.5);
  G.pr.shake = Math.min(2, G.pr.shake + 0.8);
  G.audio?.hurt?.(p);
  if (h.grab) { p.mem_grabbed = G.time + 1.2; }
  op('decal', { z: p.zoneKey, d: { x: p.x, z: p.z, w: 0.6, d: 0.6, rot: rng.float(0, 6), tex: 'decal_blood_drip' } });
  bus.emit('playerHit', p, part, kind, h);
}

declare module '../entities/player' { interface Player { mem_grabbed?: number; } }
export { allSpecies, wrapAngle };

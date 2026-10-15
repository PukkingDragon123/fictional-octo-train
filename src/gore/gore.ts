// GoreSystem (G.gore): blood and dismemberment, scaled by Game.sandbox.gore
// (0 off, 1 normal, 2 heavy).
//
// - Every hit sprays according to what did it: blunt splatter, blade spurts
//   and cast-off streaks, firearm mist plus an exit spray onto whatever wall
//   is behind, tearing gouts from bites, a burst for vehicles.
// - Severe wounds pump arterial spurts; bleeding survivors drip and, badly
//   hurt, spurt; the wounded leave drip trails, sliding corpses smear.
// - Persistent blood (splats, wall splatter, pools that spread under a
//   corpse, smears, drips, bloody footprints) goes through the 'decal' op;
//   particles, gibs and spurts are local.
// - Kills by heavy blunt, blades, axes, guns and cars take heads and limbs:
//   the part becomes a physics gib and leaves a stump; heavy mode adds head
//   bursts and full gibbing. Plush, glitched and fibreglass things bleed
//   stuffing, static and chips instead.
// Co-op: creature damage is decided on the host, which broadcasts compact
// 'gore' fx events so every peer sees the same severed parts; survivors'
// own machines report their hits, bleeding and deaths the same way.
import * as THREE from 'three';
import { G } from '../game/G';
import type { GameSystem } from '../game/game';
import { bus } from '../core/events';
import { Rng } from '../core/rng';
import { moveCircle } from '../world/collision';
import type { Creature } from '../creatures/creature';
import type { Player } from '../entities/player';
import type { Zone, Decal } from '../world/zone';
import type { SpeciesDef } from '../creatures/species';
import { Particles, PK } from './particles';
import { GoreDecals, findWall, clampOnWall } from './decals';
import { Gibs } from './gibs';
import { KINDS, BloodKind, goreOf, kindOf, tex } from './kinds';
import './goreTextures';
import './goreSounds';
import './limbSounds';
import { creatureLimbFx, partRole, limbId, HEADLESS_OK } from './tearing';
import { LimbSystem } from '../survival/limbSystem';
import { synth } from '../audio/sounds';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { DestructionSystem } from '../world/destruction';
import { WallRuns } from './wallRuns';
import { addWound, restoreWounds } from './wounds';
import { LensBlood } from './lens';
import { Mauling } from './maul';

/** gore sound recipes, synthesised a few at a time in the background so the first kill does not hitch */
const WARM = ['gore_wet_hit', 'gore_bone_crack', 'gore_squelch', 'gore_tear', 'gore_burst', 'gore_gib_land', 'gore_spurt', 'gore_crunch', 'gore_chip_land', 'gore_fluff', 'gore_crumble', 'gore_static'];

export interface CreatureHitInfo { dmg: number; kind: string; fx: number; fz: number; crit?: boolean; by?: string }

/** compact fx events (host → all for creatures; a survivor's machine → all for its own blood) */
type GoreEv =
  | { t: 'c'; id: string; w: string; a: number; x: number; z: number; k?: 1; cr?: 1; sv?: string[]; hb?: 1; gb?: 1; ch?: number; art?: 1; bs?: 1; op?: 1; b?: string }
  | { t: 'pool'; z: string; d: Decal; g: number }
  | { t: 'p'; id: string; w: string; a: number; x: number; z: number; pt: string }
  | { t: 'b'; id: string; l: number; pt: string }
  | { t: 'd'; id: string; gb?: 1 }
  | { t: 'g'; id: string }
  /** a living creature lost parts (host → all) */
  | { t: 'cs'; id: string; ls: string[]; w: string; x: number; z: number }
  /** a creature has a survivor in its grip and is pulling (host → all) */
  | { t: 'T'; id: string; pid: string; pt: string; h: number; v: string }
  /** a survivor lost a limb (their machine → all) */
  | { t: 'L'; id: string; pt: string; w: string; x: number; z: number }
  /** a creature feeding on a body (host → all) */
  | { t: 'M'; id: string; pid: string; n: number }
  /** destruction fx (pushed furniture moving): handed to G.destruct */
  | { t: 'D'; [k: string]: any };

interface Artery { obj: THREE.Object3D; off: THREE.Vector3; dir: THREE.Vector3; t: number; dur: number; str: number; K: BloodKind; tint: number; zone: string; ph: number; f: number; acc: number; owner: boolean; dec: number; tag: string }

/** survivor body part → rig joint and offset along the segment */
const PART_JOINT: Record<string, [string, number]> = {
  head: ['head', 0.11], neck: ['neck', 0.04], torso_u: ['chest', 0.12], torso_l: ['spine', 0.1], groin: ['hips', -0.02],
  uarm_l: ['uarmL', -0.15], uarm_r: ['uarmR', -0.15], farm_l: ['farmL', -0.12], farm_r: ['farmR', -0.12], hand_l: ['handL', -0.05], hand_r: ['handR', -0.05],
  thigh_l: ['thighL', -0.22], thigh_r: ['thighR', -0.22], shin_l: ['shinL', -0.2], shin_r: ['shinR', -0.2], foot_l: ['footL', -0.06], foot_r: ['footR', -0.06],
};
/** a severed survivor part → the joint at the cut (its own joint's origin is where it hung from) */
const SEV_JOINT: Record<string, string> = {
  uarm_l: 'uarmL', uarm_r: 'uarmR', farm_l: 'farmL', farm_r: 'farmR', hand_l: 'handL', hand_r: 'handR',
  thigh_l: 'thighL', thigh_r: 'thighR', shin_l: 'shinL', shin_r: 'shinR', foot_l: 'footL', foot_r: 'footR',
};
/** survivor injury type → how the blood comes out */
const INJ_HIT: Record<string, string> = { bite: 'bite', laceration: 'claw', deep: 'claw', scratch: 'claw', bullet: 'firearm', glass: 'blade', bruise: 'blunt', fracture: 'blunt', burn: 'fire', amputation: 'axe' };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const mulHex = (a: number, b: number) => b === 0xffffff ? a :
  ((((a >> 16) & 255) * ((b >> 16) & 255) / 255) << 16) | ((((a >> 8) & 255) * ((b >> 8) & 255) / 255) << 8) | ((a & 255) * (b & 255) / 255);
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion();

export class GoreSystem implements GameSystem {
  name = 'gore';
  root = new THREE.Group();
  parts: Particles;
  glow: Particles;
  decals: GoreDecals;
  gibs: Gibs;
  arteries: Artery[] = [];
  rng = new Rng(Math.random() * 1e9);
  /** survivors' bleeding as last reported: level 0..4 and the worst part */
  bleed = new Map<string, { l: number; pt: string; acc: number; dec: number; last?: [number, number] }>();
  private gibbedPlayers = new Set<string>();
  private wet = new WeakMap<Player, { wet: number; tint: number; side: number }>();
  private sentBleed = { l: -1, pt: '', t: 0 };
  private lastHit = { dmg: 0, t: -9 };
  private vehT = 0;
  private sndT = new Map<string, number>();
  private warm = 0;
  private warmT = 4;
  private warmMesh: THREE.Mesh | null = null;
  /** blood running down walls, droplet marks */
  runs: WallRuns;
  /** blood on the camera lens */
  lens = new LensBlood();
  /** creatures feeding on the dead (host) */
  maulers = new Mauling();
  private weaponT = 0;
  /** dev / tests: force the next death's outcome ('bs' bisect, 'op' opened, 'gb' gib, 'hb' head burst) */
  debugForce: string | null = null;

  constructor() {
    (G as any).gore = this;
    this.root.name = 'gore';
    G.pr.scene.add(this.root);
    this.parts = new Particles(1500);
    this.glow = new Particles(260, true);
    this.root.add(this.parts.mesh, this.glow.mesh);
    this.decals = new GoreDecals(this.root);
    this.gibs = new Gibs(this.root);
    this.gibs.onLand = (g, x, y, z, speed) => this.gibLanded(g, x, y, z, speed);
    this.gibs.onOoze = (g, x, z) => { if (g.kind.liquid && Math.random() < 0.3) this.emit(g.kind, g.tint, x, g.obj.position.y, z, 0, 0.3, 0, 0.025, 1, 0); };
    this.runs = new WallRuns(this.root);
    this.parts.onWall = (x, y, z, nx, nz, col) => { const zk = G.view?.zone?.key; if (zk && this.lv > 0) this.runs.dot(zk, x, y, z, nx, nz, col); };
    bus.on('footstep', (p: Player) => this.footstep(p));
    bus.on('death', (p: Player) => this.localDeath(p));
    // survivors losing limbs (runs whatever the gore level; it decides what to show)
    if (!(G as any).limbs) G.addSystem(new LimbSystem());
    // furniture damage, debris, wall holes, push / drag (src/world/destruction.ts)
    if (!G.destruct) G.addSystem(new DestructionSystem());
  }

  /** 0 off, 1 normal, 2 heavy */
  get lv(): number { return G.sandbox.gore ?? 2; }
  get mul() { return this.lv >= 2 ? 1.45 : 0.7; }
  get authority() { return G.role !== 'client'; }

  onZoneChange() { this.parts.clear(); this.glow.clear(); this.gibs.clear(); this.arteries.length = 0; this.runs.clear(); this.lens.clear(); }

  update(dt: number) {
    const z = G.view?.zone ?? null;
    if (z && this.warm === 0 && !this.warmMesh && this.lv > 0) this.prewarm();
    if (this.warmMesh && this.warm > 6) { this.root.remove(this.warmMesh); this.warmMesh.geometry.dispose(); this.warmMesh = null; }
    this.parts.update(dt, z);
    this.glow.update(dt, z);
    this.gibs.update(dt, z);
    this.updateArteries(dt, z);
    this.decals.update(dt);
    this.runs.update(this.lv > 0 ? z : null);
    this.lens.update(dt);
    try { this.maulers.update(dt); } catch (e) { console.error('maul', e); }
    if ((this.weaponT -= dt) <= 0) { this.weaponT = 0.5; this.bloodyWeapon(); }
    if (this.lv > 0) {
      if (this.warm < WARM.length * 3 && (this.warmT -= dt) <= 0) { this.warmT = 0.15; synth(WARM[this.warm % WARM.length], Math.floor(this.warm / WARM.length)); this.warm++; }
      this.updateSurvivors(dt, z);
      this.updateWounded(dt, z);
      if (this.authority) { this.vehT -= dt; if (this.vehT <= 0) { this.vehT = 0.1; this.runOver(); } }
    }
  }

  /** compile the shader variants gore brings in (instanced particles, wall decals) before the first fight */
  private prewarm() {
    const p = G.local; if (!p) return;
    for (const P of [this.parts, this.glow]) P.add(PK.Drop, p.x, p.y - 0.5, p.z, 0, 0, 0, 0.0001, 2, 0xffffff);
    const mb = new ModelBuilder();
    mb.quadRaw([[0, -9, 0], [0, -9, 0], [0, -9, 0], [0, -9, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'gore_red_wall');
    mb.flat(0, -9, 0, 0.001, 0.001, 'gore_red_pool');
    this.warmMesh = new THREE.Mesh(mb.build(), worldMaterial({ transparent: true, outline: 0.0, depthWrite: false, cutout: true }));
    this.warmMesh.frustumCulled = false;
    this.root.add(this.warmMesh);
  }

  // ================================================================ net
  private send(ev: GoreEv) { if (G.role !== 'solo') G.net?.broadcastFx?.('gore', ev); }
  /** fx from another peer */
  onNet(ev: GoreEv) {
    if (ev?.t === 'D') { G.destruct?.onNet?.(ev); return; }
    if (!ev || this.lv <= 0) return;
    try {
      switch (ev.t) {
        case 'c': this.applyCreature(ev); break;
        case 'pool': this.decals.show(ev.z, ev.d, ev.g, ev.g + 10); break;
        case 'p': this.applyPlayerHit(ev); break;
        case 'b': { const b = this.bleed.get(ev.id); if (b) { b.l = ev.l; b.pt = ev.pt; } else this.bleed.set(ev.id, { l: ev.l, pt: ev.pt, acc: 0, dec: 0 }); break; }
        case 'd': this.applyPlayerDeath(ev); break;
        case 'g': this.applyCorpseGib(ev.id); break;
        case 'cs': this.applyCreatureSevered(ev); break;
        case 'T': this.applyTear(ev); break;
        case 'L': this.applySurvivorSevered(ev); break;
        case 'M': this.applyMaul(ev); break;
      }
    } catch (e) { console.warn('gore fx', e); }
  }

  // ================================================================ particles
  private poolFor(K: BloodKind) { return K.key === 'glow' || K.style === 'static' ? this.glow : this.parts; }

  /** one particle of whatever this kind of blood is made of */
  emit(K: BloodKind, tint: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, stretch: number, mist = false) {
    const P = this.poolFor(K);
    const col = mulHex(mist ? K.mist : K.drop[(Math.random() * K.drop.length) | 0], tint);
    switch (K.style) {
      case 'drop': P.add(mist ? PK.Mist : PK.Drop, x, y, z, vx, vy, vz, mist ? size * 2.2 : size, mist ? life * 0.4 : life, col, mist ? 0 : stretch); break;
      case 'fluff': P.add(PK.Fluff, x, y, z, vx * 0.6, vy * 0.7, vz * 0.6, size * (mist ? 2.4 : 1.6), life * 3, col); break;
      case 'static': P.add(PK.Static, x, y, z, vx * 0.5, vy * 0.3, vz * 0.5, size * 1.4, life * 0.5, col); break;
      case 'glass': P.add(PK.Glass, x, y, z, vx, vy, vz, size * 0.9, life * 2.5, col); break;
      default: P.add(mist ? PK.Mist : PK.Chunk, x, y, z, vx, vy, vz, mist ? size * 2.5 : size * 1.2, mist ? life * 0.5 : life * 3, col);
    }
  }

  /** a fan of drops around a direction */
  jet(K: BloodKind, tint: number, x: number, y: number, z: number, dx: number, dz: number, n: number, speed: number, spread: number, up: number, size = 0.03, stretch = 0.07) {
    const base = Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) {
      const a = base + this.rng.gauss(0, spread);
      const s = speed * (0.55 + Math.random() * 0.7);
      this.emit(K, tint, x, y, z, Math.cos(a) * s, up * (0.3 + Math.random() * 1.0), Math.sin(a) * s, size * (0.6 + Math.random() * 0.8), 1.4 + Math.random() * 0.6, stretch);
    }
  }
  mist(K: BloodKind, tint: number, x: number, y: number, z: number, dx: number, dz: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dz, dx) + this.rng.gauss(0, 0.6), s = speed * Math.random();
      this.emit(K, tint, x + (Math.random() - 0.5) * 0.1, y + (Math.random() - 0.5) * 0.15, z + (Math.random() - 0.5) * 0.1, Math.cos(a) * s, Math.random() * 0.6, Math.sin(a) * s, 0.04 + Math.random() * 0.05, 0.9 + Math.random() * 0.6, 0, true);
    }
  }
  bits(K: BloodKind, tint: number, x: number, y: number, z: number, dx: number, dz: number, n: number, speed: number) {
    const P = this.poolFor(K);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dz, dx) + this.rng.gauss(0, 0.9), s = speed * (0.4 + Math.random() * 0.8);
      const col = K.style === 'drop' ? mulHex(Math.random() < 0.3 ? 0xd8c8b0 : K.drop[1], tint) : mulHex(K.drop[(Math.random() * K.drop.length) | 0], tint);
      P.add(K.style === 'static' ? PK.Static : PK.Chunk, x, y, z, Math.cos(a) * s, 1 + Math.random() * 2.2, Math.sin(a) * s, 0.03 + Math.random() * 0.035, 5 + Math.random() * 5, col);
    }
  }

  /** the spray of one hit, by what did it */
  hitFx(K: BloodKind, tint: number, hk: string, x: number, y: number, z: number, dx: number, dz: number, dmg: number, crit = false) {
    if (K.key === 'none' || hk === 'fire') return;
    const m = this.mul, A = clamp(Math.sqrt(Math.max(0.5, dmg) / 10), 0.4, 2), heavy = this.lv >= 2;
    const n = (k: number) => Math.max(1, Math.round(k * A * m * (crit ? 1.4 : 1)));
    switch (hk) {
      case 'shove': case 'unarmed':
        this.jet(K, tint, x, y, z, dx, dz, dmg < 1.6 ? 2 : n(6), 1.6, 1.0, 1.4, 0.025, 0.04); break;
      case 'blade': case 'claw': {
        // spurts flung sideways off the edge, long thin streaks
        const side = Math.random() < 0.5 ? 1 : -1, a = Math.atan2(dz, dx);
        for (const s of hk === 'blade' ? [side, -side * 0.4] : [side]) {
          const b = a + s * (0.9 + Math.random() * 0.5);
          this.jet(K, tint, x, y, z, Math.cos(b), Math.sin(b), n(9), 4.6, 0.22, 0.9, 0.026, 0.11);
        }
        this.jet(K, tint, x, y, z, dx, dz, n(5), 2.4, 0.6, 1.2, 0.03, 0.06);
        break;
      }
      case 'axe':
        this.jet(K, tint, x, y, z, dx, dz, n(16), 3.2, 0.9, 1.6, 0.034, 0.08);
        this.jet(K, tint, x, y, z, -dz, dx, n(6), 4.2, 0.25, 0.9, 0.028, 0.1);
        this.mist(K, tint, x, y, z, dx, dz, n(4), 1.2);
        if (heavy) this.bits(K, tint, x, y, z, dx, dz, Math.round(3 * m), 2.2);
        break;
      case 'spear':
        this.jet(K, tint, x, y, z, dx, dz, n(12), 3.8, 0.28, 0.7, 0.03, 0.1);
        this.jet(K, tint, x, y, z, -dx, -dz, n(5), 2.0, 0.4, 0.9, 0.028, 0.06);
        break;
      case 'firearm':
        // entry: a puff back toward the shooter; exit: a fast tight cone and a red mist
        this.mist(K, tint, x - dx * 0.1, y, z - dz * 0.1, -dx, -dz, n(4), 0.8);
        this.jet(K, tint, x + dx * 0.15, y, z + dz * 0.15, dx, dz, n(22), 6.0, 0.32, 0.5, 0.024, 0.12);
        this.mist(K, tint, x + dx * 0.25, y, z + dz * 0.25, dx, dz, n(8), 2.4);
        if (heavy && dmg > 12) this.bits(K, tint, x, y, z, dx, dz, Math.round(2 * m), 3.5);
        break;
      case 'bite':
        // tearing gouts: fat slow drops and meat
        this.jet(K, tint, x, y, z, dx, dz, n(10), 1.7, 1.1, 1.4, 0.045, 0.04);
        this.bits(K, tint, x, y, z, dx, dz, Math.round((heavy ? 3 : 1) * m + 0.4), 1.6);
        break;
      case 'vehicle':
        this.jet(K, tint, x, y, z, dx, dz, n(34), 5.0, 0.8, 2.0, 0.036, 0.09);
        this.mist(K, tint, x, y, z, dx, dz, n(10), 2.5);
        this.bits(K, tint, x, y, z, dx, dz, Math.round(6 * m), 4);
        break;
      default: // blunt, thrown, trap
        this.jet(K, tint, x, y, z, dx, dz, n(14), 2.4, 1.25, 1.7, 0.032, 0.05);
        this.mist(K, tint, x, y, z, dx, dz, n(3), 0.9);
        if (heavy && dmg >= 12) this.bits(K, tint, x, y, z, dx, dz, Math.round(2 * m), 2);
    }
  }

  private snd(key: string, x: number, z: number, vol = 1, zone?: string) {
    if (!key) return;
    const last = this.sndT.get(key) ?? -9;
    if (G.time - last < 0.05) return;
    this.sndT.set(key, G.time);
    G.audio?.play?.(key, x, z, { vol, zone });
  }

  // ================================================================ persistent splatter (owner of the event only)
  hitDecals(z: Zone, K: BloodKind, tint: number, hk: string, x: number, y: number, zz: number, dx: number, dz: number, dmg: number) {
    if (K.key === 'none' || hk === 'fire' || (!K.pal && !K.decal)) return;
    if ((hk === 'shove' || hk === 'unarmed') && dmg < 2) return;
    const r = this.rng, m = this.mul, A = clamp(Math.sqrt(Math.max(0.5, dmg) / 10), 0.5, 1.8);
    const ang = Math.atan2(dz, dx);
    const at = (dist: number, spread = 0.25) => { const a = ang + r.gauss(0, spread); return [x + Math.cos(a) * dist, zz + Math.sin(a) * dist] as const; };
    const floorDecal = (t: string, px: number, pz: number, w: number, d: number, rot: number, delay: number) =>
      this.decals.commit(z, { x: px, z: pz, w, d, rot, tex: t, tint }, delay);
    const wallDecal = (maxD: number, size: number, what: string, chance: number) => {
      if (!r.chance(chance * m)) return;
      const hit = findWall(z, x, zz, dx + r.gauss(0, 0.15), dz + r.gauss(0, 0.15), maxD);
      if (!hit) return;
      const w = Math.min(0.95, size), along = clampOnWall(z, hit, w);
      const alongX = Math.abs(Math.sin(hit.rot)) > 0.5;
      const px = alongX ? along : hit.x, pz = alongX ? hit.z : along;
      const floorY = z.heightAt(Math.floor(px), Math.floor(pz));
      const hgt = what === 'wallspray' ? size * 0.5 : size;
      const yy = clamp(y - floorY - hit.dist * 0.18 + r.float(-0.12, 0.2), hgt / 2 + 0.05, hit.h - hgt / 2 - 0.05);
      this.decals.commit(z, { x: px, z: pz, y: yy, w, d: hgt, rot: hit.rot, tex: tex(K, what), tint, vert: 1 }, 0.12 + hit.dist * 0.12);
    };
    switch (hk) {
      case 'blade': case 'claw': {
        const side = r.chance(0.5) ? 1 : -1, b = ang + side * r.float(1.0, 1.5), len = r.float(0.8, 1.4) * A;
        floorDecal(tex(K, 'streak'), x + Math.cos(b) * (0.25 + len / 2), zz + Math.sin(b) * (0.25 + len / 2), len, 0.2 * A, b, 0.35);
        const [px, pz] = at(r.float(0.1, 0.4));
        floorDecal(tex(K, 'drops'), px, pz, 0.4 * A, 0.4 * A, r.float(0, 6.28), 0.4);
        wallDecal(1.6, 0.7 * A, 'wallspray', 0.6);
        break;
      }
      case 'axe': {
        const [px, pz] = at(r.float(0.3, 0.7));
        floorDecal(tex(K, r.chance(0.5) ? 'splat_a' : 'splat_b'), px, pz, 0.8 * A, 0.8 * A, r.float(0, 6.28), 0.35);
        const b = ang + r.float(-1.6, 1.6), len = r.float(0.9, 1.5);
        floorDecal(tex(K, 'streak'), x + Math.cos(b) * (0.3 + len / 2), zz + Math.sin(b) * (0.3 + len / 2), len, 0.22, b, 0.4);
        wallDecal(1.8, 0.75 * A, 'wall', 0.7);
        break;
      }
      case 'spear': {
        const len = r.float(0.7, 1.1) * A;
        floorDecal(tex(K, 'spray'), x + dx * (0.2 + len / 2), zz + dz * (0.2 + len / 2), len, len * 0.5, ang, 0.35);
        wallDecal(1.4, 0.6 * A, 'wall', 0.5);
        break;
      }
      case 'firearm': {
        const len = r.float(1.0, 1.6) * A;
        floorDecal(tex(K, 'spray'), x + dx * (0.3 + len / 2), zz + dz * (0.3 + len / 2), len, len * 0.5, ang + r.gauss(0, 0.08), 0.3);
        wallDecal(3.5, 0.85 * A, 'wall', 0.9);
        break;
      }
      case 'vehicle': {
        const [px, pz] = at(0.6);
        floorDecal(tex(K, 'splat_a'), px, pz, 1.3, 1.3, r.float(0, 6.28), 0.25);
        const len = r.float(1.5, 2.4);
        floorDecal(tex(K, 'smear'), x + dx * (0.5 + len / 2), zz + dz * (0.5 + len / 2), len, 0.6, ang, 0.4);
        wallDecal(3, 0.95, 'wall', 0.8);
        break;
      }
      case 'bite': {
        const [px, pz] = at(r.float(0.1, 0.4), 0.8);
        floorDecal(tex(K, r.chance(0.5) ? 'splat_a' : 'splat_b'), px, pz, 0.55 * A, 0.55 * A, r.float(0, 6.28), 0.4);
        const [qx, qz] = at(r.float(0.2, 0.6), 1.2);
        floorDecal(tex(K, 'drops'), qx, qz, 0.35, 0.35, r.float(0, 6.28), 0.45);
        break;
      }
      default: { // blunt, thrown, trap, unarmed
        const [px, pz] = at(r.float(0.2, 0.7), 0.4);
        floorDecal(tex(K, r.chance(0.5) ? 'splat_a' : 'splat_b'), px, pz, r.float(0.5, 0.8) * A, r.float(0.5, 0.8) * A, r.float(0, 6.28), 0.35);
        if (r.chance(0.5)) { const [qx, qz] = at(r.float(0.5, 1.1), 0.7); floorDecal(tex(K, 'drops'), qx, qz, 0.35, 0.35, r.float(0, 6.28), 0.45); }
        wallDecal(1.4, 0.7 * A, 'wall', 0.55);
      }
    }
  }

  /** spreading pool: every peer watches it grow, the owner commits it when it has spread */
  pool(z: Zone, x: number, zz: number, w: number, K: BloodKind, tint: number, grow?: number) {
    if (K.key === 'none' || (!K.pal && !K.decal)) return;
    const d: Decal = { x, z: zz, w, d: w * this.rng.float(0.8, 1.0), rot: this.rng.float(0, 6.28), tex: tex(K, 'pool'), tint };
    if (!K.liquid) { this.decals.commit(z, d, 0.5); return; }
    const g = grow ?? (this.lv >= 2 ? 9 : 7);
    const dd = this.decals.commit(z, d, g, { grow: g });
    if (dd) this.send({ t: 'pool', z: z.key, d: dd, g });
  }

  // ================================================================ wax replicas (furniture of a sort: src/world/destruction.ts)
  /** a hit on a wax replica: something pale and thin seeps out */
  replicaBleed(x: number, y: number, z: number, nx: number, nz: number, k = 1) {
    if (this.lv <= 0) return;
    this.jet(KINDS.pale, 0xffffff, x, y, z, nx, nz, Math.round(8 * k * this.mul) + 1, 1.8, 0.8, 1.2, 0.026, 0.05);
  }
  /** a replica coming apart: pale gouts, chunks of wax and something inside that should not be there */
  replicaBurst(zone: Zone, x: number, y: number, z: number, dx: number, dz: number) {
    if (this.lv <= 0) return;
    const K = KINDS.pale, m = this.mul;
    this.jet(K, 0xffffff, x, y, z, dx, dz, Math.round(40 * m), 2.6, 1.4, 2.0, 0.032, 0.06);
    this.mist(K, 0xffffff, x, y, z, dx, dz, Math.round(10 * m), 1.2);
    this.gibs.chunks(zone.key, KINDS.red, 0xe8d0c0, x, y, z, Math.round(4 * m) + 1, v3.set(dx, 0, dz), 2.2, 1.8);
    this.snd('gore_squelch', x, z, 0.9, zone.key);
    if (this.authority) this.pool(zone, x + dx * 0.3, z + dz * 0.3, 1.0, K, 0xffe8e0, 5);
  }

  // ================================================================ creatures (authority side)
  /** a creature was hurt and lives (called by the creature manager on the host) */
  creatureHurt(c: Creature, info: CreatureHitInfo) {
    // shoves and burns don't open anything up
    if (this.lv <= 0 || info.kind === 'shove' || info.kind === 'fire' || (info.kind === 'unarmed' && info.dmg < 2)) return;
    const gd = goreOf(c.sp), K = KINDS[gd.blood];
    if (K.key === 'none') return;
    const ev: GoreEv = { t: 'c', id: c.id, w: info.kind, a: Math.round(info.dmg * 10) / 10, x: Math.round(info.fx * 10) / 10, z: Math.round(info.fz * 10) / 10 };
    if (info.crit) ev.cr = 1;
    if (info.by) ev.b = info.by;
    const ratio = c.hp / c.sp.hp;
    if (this.lv >= 2 && K.liquid && ratio < 0.45 && ['blade', 'axe', 'firearm', 'bite', 'claw', 'spear'].includes(info.kind) && !this.arteries.some((a) => a.tag === c.id)) ev.art = 1;
    this.applyCreature(ev);
    this.send(ev);
    // persistence
    const z = G.getZone(c.zoneKey);
    const [dx, dz] = this.dirFrom(c, info.fx, info.fz);
    this.hitDecals(z, K, gd.tint ?? K.tint, info.kind, c.x, this.hitY(c), c.z, dx, dz, info.dmg);
    if (K.liquid && info.kind !== 'fire') c.mem.goreBleed = { until: G.time + 8 + Math.min(20, info.dmg), s: clamp(1 - ratio, 0.2, 1) };
  }

  /** a creature died (host): pick what comes off, broadcast, leave the mess */
  creatureDied(c: Creature, info: CreatureHitInfo) {
    if (this.lv <= 0) return;
    const sp = c.sp, gd = goreOf(sp), K = KINDS[gd.blood];
    if (K.key === 'none') return;
    const r = this.rng, hk = info.kind, dmg = info.dmg;
    const gone: string[] = [...(c.mem.sev || []), ...(c.mem.severed || [])];
    // only parts that are actually on show (plushkin carries both a bear and a bunny rig)
    const shown = (n: string) => !c.rig || (!!c.rig.parts[n] && attached(c.rig.parts[n], c.rig.root) && visibleChain(c.rig.parts[n], c.rig.root));
    const sev = (gd.sever || []).filter((n) => n !== gd.head && !gone.includes(n) && shown(n));
    const head = gd.head && !gone.includes(gd.head) && shown(gd.head) ? gd.head : null;
    const canGib = gd.gib !== false && !sp.flags?.noCorpse;
    const out: string[] = [];
    let hb = false, gb = false, ch = 0, bs = false, opened = false;
    const cutBy = (k: string) => ['blade', 'axe', 'firearm', 'vehicle', 'blunt', 'bite'].includes(k);
    // cut in two: a huge axe or sledge blow, a car, a point-blank blast
    if (this.lv >= 2 && canGib && this.waistOf(c) && (
      (hk === 'axe' && (info.crit || dmg >= sp.hp * 0.75) && r.chance(0.5)) || (hk === 'vehicle' && dmg >= 25 && r.chance(0.5)) ||
      (hk === 'blunt' && info.crit && dmg >= 22 && r.chance(0.3)) || (hk === 'firearm' && dmg >= 26 && r.chance(0.35)) || (dmg >= sp.hp * 1.6 && r.chance(0.5)))) bs = true;
    const force = this.debugForce; this.debugForce = null;
    if (force === 'bs' && this.waistOf(c)) bs = true;
    if (force === 'gb') gb = true;
    if (force === 'hb' && head) hb = true;
    if (bs || gb || hb) { /* forced or the bisection is the show */ }
    else if (this.lv >= 2 && cutBy(hk)) {
      if (canGib && ((hk === 'vehicle' && dmg >= 30) || (hk === 'axe' && info.crit && dmg >= sp.hp * 0.9) || (hk === 'firearm' && sp.hp <= 12) || dmg >= Math.max(55, sp.hp * 2.2))) gb = true;
      else {
        if (hk === 'firearm' && r.chance(0.4)) hb = true;
        else if (hk === 'blunt' && (info.crit || dmg >= 13) && r.chance(0.45)) hb = true;
        else if (hk === 'vehicle' && r.chance(0.3)) hb = true;
        else if ((hk === 'blade' || hk === 'axe') && r.chance(hk === 'axe' ? 0.5 : 0.4)) { if (head) out.push(head); else ch += 3; }
        if (hb && !head) { hb = false; ch += 5; }
        let nl = 0;
        if (hk === 'axe') nl = r.int(0, 2);
        else if (hk === 'blade') nl = r.chance(0.55) ? 1 : 0;
        else if (hk === 'firearm') nl = r.chance(0.3) ? 1 : 0;
        else if (hk === 'vehicle') nl = r.int(1, 3);
        else if (hk === 'bite') nl = r.chance(0.3) ? 1 : 0;
        else if (hk === 'blunt' && dmg >= 14) nl = r.chance(0.25) ? 1 : 0;
        for (let i = 0; i < nl; i++) { if (sev.length) out.push(sev.splice(r.int(0, sev.length - 1), 1)[0]); else ch += 2; }
      }
    } else if (this.lv === 1 && head && (hk === 'blade' || hk === 'axe') && (info.crit || dmg >= sp.hp * 0.5) && r.chance(0.35)) out.push(head);
    // the blow took the head clean off (decided by rollLiveSever)
    if ((info as any).head && head && !out.includes(head) && !gb) { out.push(head); hb = false; }
    // a killing cut or bite through the torso opens it (ribs, guts)
    if (this.lv >= 2 && !gb && !bs && K.liquid && (force === 'op' || (hk === 'axe' || hk === 'blade' || hk === 'bite' || hk === 'claw') && r.chance(hk === 'axe' ? 0.6 : 0.4))) opened = true;
    const ev: GoreEv = { t: 'c', id: c.id, w: hk, a: Math.round(dmg * 10) / 10, x: Math.round(info.fx * 10) / 10, z: Math.round(info.fz * 10) / 10, k: 1 };
    if (info.crit) ev.cr = 1;
    if (info.by) ev.b = info.by;
    if (bs) ev.bs = 1;
    if (opened) ev.op = 1;
    if (out.length) ev.sv = out;
    if (hb) ev.hb = 1;
    if (gb) ev.gb = 1;
    if (ch) ev.ch = ch;
    this.applyCreature(ev);
    this.send(ev);
    // persistence: the killing blow, then a pool (after the corpse stops sliding)
    const z = G.getZone(c.zoneKey);
    const [dx, dz] = this.dirFrom(c, info.fx, info.fz);
    const tint = gd.tint ?? K.tint;
    this.hitDecals(z, K, tint, hk, c.x, this.hitY(c), c.z, dx, dz, dmg);
    if (hb || gb || bs) {
      // a ring of splatter
      for (let i = 0; i < (gb ? 5 : 3); i++) {
        const a = r.float(0, 6.28), d = r.float(0.4, gb ? 1.6 : 1.1);
        this.decals.commit(z, { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, w: r.float(0.5, 0.9), d: r.float(0.5, 0.9), rot: r.float(0, 6.28), tex: tex(K, r.chance(0.5) ? 'splat_a' : 'splat_b'), tint }, 0.4 + r.float(0, 0.3));
      }
      for (const [wx, wz] of [[dx, dz], [-dz, dx], [dz, -dx]]) {
        const hit = findWall(z, c.x, c.z, wx, wz, 2.2);
        if (!hit || !r.chance(0.7)) continue;
        const w = 0.9, along = clampOnWall(z, hit, w), alongX = Math.abs(Math.sin(hit.rot)) > 0.5;
        this.decals.commit(z, { x: alongX ? along : hit.x, z: alongX ? hit.z : along, y: clamp(this.hitY(c) - z.heightAt(Math.floor(c.x), Math.floor(c.z)), 0.6, hit.h - 0.5), w, d: w, rot: hit.rot, tex: tex(K, 'wall'), tint, vert: 1 }, 0.3);
      }
    }
    if (sp.flags?.noCorpse) return;
    // the corpse slides from big knocks, smearing as it goes; the pool waits for it to stop
    const push = hk === 'vehicle' ? r.float(3, 5) : (hk === 'axe' || (hk === 'blunt' && dmg >= 12)) ? r.float(1.0, 2.0) : hk === 'firearm' ? r.float(0.3, 0.8) : 0;
    if (push > 0.5 && K.liquid && !sp.flags?.flying && !sp.flags?.swimmer && c.radius < 0.7) c.mem.slide = [dx * push, dz * push, 0];
    else this.deathPool(c);
  }

  private deathPool(c: Creature) {
    const gd = goreOf(c.sp), K = KINDS[gd.blood];
    const z = G.getZone(c.zoneKey);
    const size = clamp(0.6 + c.radius * 2.4, 0.5, 2.4) * clamp(Math.sqrt(c.sp.hp / 40), 0.7, 1.3) * (this.lv >= 2 ? 1.25 : 1) * (c.mem.gibbed ? 1.3 : c.mem.bisected ? 1.5 : 1);
    this.pool(z, c.x + this.rng.float(-0.1, 0.1), c.z + this.rng.float(-0.1, 0.1), size, K, gd.tint ?? K.tint);
    // it keeps draining: a wider, darker second pool creeps out from under it a while later
    if (this.lv >= 2 && K.liquid) {
      const x = c.x + this.rng.float(-0.25, 0.25), zz = c.z + this.rng.float(-0.25, 0.25), tint = gd.tint ?? K.tint;
      setTimeout(() => { if (G.zones.get(z.key) === z) this.pool(z, x, zz, Math.min(2.8, size * 1.45), K, mulHex(0xc8b0b0, tint), 22); }, 9000 + this.rng.float(0, 8000));
    }
  }

  /** dead creature tick on the host: sliding corpses smear, then pool */
  corpseStep(c: Creature, dt: number, z: Zone) {
    const s = c.mem.slide as [number, number, number] | undefined;
    if (!s) return;
    const ox = c.x, oz = c.z;
    moveCircle(z, c as any, s[0] * dt, s[1] * dt, { creature: true, ignoreLow: true });
    const f = Math.exp(-3.2 * dt);
    s[0] *= f; s[1] *= f;
    s[2] += Math.hypot(c.x - ox, c.z - oz);
    const K = kindOf(c.sp), tint = goreOf(c.sp).tint ?? K.tint;
    if (s[2] > 0.45) {
      s[2] = 0;
      const a = Math.atan2(s[1], s[0]);
      this.decals.commit(z, { x: c.x - Math.cos(a) * 0.25, z: c.z - Math.sin(a) * 0.25, w: 0.6, d: 0.25 + c.radius * 0.6, rot: a, tex: tex(K, 'smear'), tint }, 0.05, { force: true });
    }
    if (Math.hypot(s[0], s[1]) < 0.2 || c.deathT > 4) { delete c.mem.slide; this.deathPool(c); }
  }

  private dirFrom(c: { x: number; z: number }, fx: number, fz: number): [number, number] {
    let dx = c.x - fx, dz = c.z - fz;
    const l = Math.hypot(dx, dz);
    if (l < 0.05) { const a = Math.random() * 6.28; return [Math.cos(a), Math.sin(a)]; }
    dx /= l; dz /= l;
    return [dx, dz];
  }
  private hitY(c: Creature): number {
    if (c.rig) {
      c.rig.body.updateWorldMatrix(true, true);
      const b = new THREE.Box3().setFromObject(c.rig.body);
      if (!b.isEmpty()) return clamp(b.min.y + (b.max.y - b.min.y) * 0.62, c.y + 0.1, c.y + 2.2);
    }
    return c.y + Math.min(1.6, c.height * 0.58);
  }

  // ================================================================ creatures (every peer)
  private applyCreature(ev: Extract<GoreEv, { t: 'c' }>) {
    const c: Creature | undefined = G.creatures?.creatures?.get?.(ev.id);
    if (!c) return;
    const gd = goreOf(c.sp), K = KINDS[gd.blood], tint = gd.tint ?? K.tint;
    if (K.key === 'none') return;
    const [dx, dz] = this.dirFrom(c, ev.x, ev.z);
    const here = c.zoneKey === G.local?.zoneKey;
    const hy = this.hitY(c);
    const hx = c.x - dx * c.radius * 0.4, hz = c.z - dz * c.radius * 0.4;
    if (here) {
      this.hitFx(K, tint, ev.w, hx, hy, hz, dx, dz, ev.a, !!ev.cr);
      // the wound stays on the body
      if (this.lv > 0 && c.rig && ev.w !== 'fire' && ev.w !== 'shove' && (ev.w !== 'unarmed' || ev.a >= 6)) {
        try { addWound(c, K, ev.w, dx, dz, hy, !!ev.k || ev.a >= 18, false, tint); } catch (e) { console.warn('wound', e); }
        if (ev.k && ev.op && !ev.gb && !ev.bs) { try { addWound(c, K, ev.w, dx, dz, hy - 0.08, true, true, tint); } catch (e) { console.warn('wound', e); } }
      }
      // a close one: on the lens
      if (K.liquid && ev.a >= 9) this.lensNear(c.x, c.z, (ev.a / 30) * (ev.k ? 1.4 : 1), K);
      // the weapon that did it
      if (ev.b && ev.b === G.local?.id && K.liquid && ['blade', 'axe', 'blunt', 'spear', 'unarmed'].includes(ev.w)) {
        const it = G.local.handR;
        if (it) it.bloody = Math.min(1, (it.bloody ?? 0) + 0.12 + ev.a / 120);
      }
      // survivors right next to a bloody hit get splashed
      if (K.liquid && ev.a >= 8) for (const p of G.players.values()) {
        if (p.zoneKey === c.zoneKey && !p.body.dead && Math.hypot(p.x - c.x, p.z - c.z) < 1.3 + c.radius) bus.emit('bloodied', p, 'torso_u', clamp(ev.a / 40, 0.1, 0.6) * this.mul);
      }
      if (ev.w !== 'fire' && ev.w !== 'shove') {
        this.snd(K.snd.hit, c.x, c.z, 0.9, c.zoneKey);
        if ((ev.a >= 12 || ev.cr || ev.k) && ev.w !== 'firearm' && ev.w !== 'shove' && K.snd.heavy) this.snd(K.snd.heavy, c.x, c.z, 0.7, c.zoneKey);
      }
    }
    if (!ev.k) {
      if (ev.art && here && c.rig) this.woundArtery(c, dx, dz, hy);
      if (K.liquid && ev.w !== 'fire') c.mem.goreBleed = { until: G.time + 8 + Math.min(20, ev.a), s: clamp(1 - c.hp / c.sp.hp, 0.2, 1) };
      return;
    }
    // death: what comes off
    const sev: string[] = c.mem.sev = [...(c.mem.sev || [])];
    if (ev.gb) { c.mem.gibbed = true; this.fullGib(c, K, tint, dx, dz, here); return; }
    if (ev.bs) { const w = this.waistOf(c); if (w && !sev.includes(w)) { sev.push(w); c.mem.bisected = true; if (here) this.bisect(c, w, K, tint, dx, dz); } }
    if (ev.op && here && K.liquid) {
      this.gibs.organs(c.zoneKey, K, tint, c.x, hy - 0.1, c.z, Math.round(1 + this.mul), v3.set(dx, 0, dz), 1.6);
      this.jet(K, tint, c.x, hy - 0.1, c.z, dx, dz, Math.round(30 * this.mul), 2.4, 1.2, 1.4, 0.034, 0.05);
      this.snd(K.snd.tear, c.x, c.z, 1, c.zoneKey);
    }
    for (const n of ev.sv || []) if (!sev.includes(n)) { sev.push(n); if (here) this.sever(c, n, K, tint, dx, dz, true); }
    if (ev.hb && gd.head) { if (!sev.includes(gd.head)) sev.push(gd.head); if (here) this.headBurst(c, gd.head, K, tint, dx, dz); }
    if (ev.ch && here) {
      const y = hy;
      this.gibs.chunks(c.zoneKey, K, tint, c.x, y, c.z, Math.round(ev.ch * this.mul) + 1, v3.set(dx, 0, dz), 2.4);
      this.snd(K.snd.tear, c.x, c.z, 0.8, c.zoneKey);
    }
    if ((ev.sv?.length || ev.hb) && here) this.snd(ev.hb ? K.snd.burst : K.snd.tear, c.x, c.z, 1, c.zoneKey);
  }

  /** the rig was (re)built: re-apply missing parts as stumps, no gibs */
  onRigBuilt(c: Creature) {
    try { restoreWounds(c); } catch (e) { console.warn('wounds', e); }
    if (!c.rig || (!c.mem.sev?.length && !c.mem.severed?.length)) return;
    const K = kindOf(c.sp);
    for (const n of [...(c.mem.severed || []), ...(c.mem.sev || [])] as string[]) this.sever(c, n, K, 0xffffff, 0, 0, false);
  }

  // ================================================================ living creatures losing parts (src/gore/tearing.ts)
  /**
   * Host: does this blow take a part off a creature that survives it? Heavy blades and axes,
   * guns, big blunt hits and cars can. Returns the part names (a head only on a clean crit).
   */
  rollLiveSever(c: Creature, info: CreatureHitInfo): string[] | null {
    if (this.lv <= 0 || c.dead) return null;
    const sp = c.sp, gd = goreOf(sp), K = KINDS[gd.blood];
    if (K.key === 'none' || sp.flags?.immortal) return null;
    const base = ({ axe: 0.3, blade: 0.15, firearm: 0.1, blunt: 0.06, vehicle: 0.35, bite: 0.04, spear: 0.03 } as Record<string, number>)[info.kind] ?? 0;
    if (!base || (info.kind === 'blunt' && info.dmg < 12)) return null;
    const r = this.rng;
    const ch = base * clamp(info.dmg / Math.max(8, sp.hp * 0.3), 0.4, 1.6) * (info.crit ? 1.8 : 1) * (this.lv >= 2 ? 1 : 0.55);
    if (!r.chance(ch)) return null;
    const gone: string[] = [...(c.mem.sev || []), ...(c.mem.severed || [])];
    const shown = (n: string) => !c.rig || (!!c.rig.parts[n] && attached(c.rig.parts[n], c.rig.root) && visibleChain(c.rig.parts[n], c.rig.root));
    const head = gd.head && !gone.includes(gd.head) && shown(gd.head) ? gd.head : null;
    if (head && info.crit && ['axe', 'blade', 'firearm'].includes(info.kind) && r.chance(info.kind === 'axe' ? 0.35 : 0.18)) return [head];
    const cand = (gd.sever || []).filter((n) => n !== gd.head && !gone.includes(n) && shown(n) && partRole(n, gd.head) !== 'other');
    if (!cand.length) return null;
    return [cand[r.int(0, cand.length - 1)]];
  }

  /** is losing these parts fatal for this creature (a head, for most things) */
  severFatal(c: Creature, names: string[]): boolean {
    const gd = goreOf(c.sp);
    return !!gd.head && names.includes(gd.head) && !HEADLESS_OK.has(c.sp.key);
  }

  /** Host: a living creature loses parts: every peer cuts them off its rig (gib, stump, spurting) */
  creatureSevered(c: Creature, names: string[], info: CreatureHitInfo) {
    if (this.lv <= 0 || !names.length) return;
    const ev: GoreEv = { t: 'cs', id: c.id, ls: names, w: info.kind, x: Math.round(info.fx * 10) / 10, z: Math.round(info.fz * 10) / 10 };
    this.applyCreatureSevered(ev);
    this.send(ev);
    // where it came off: a splash on the floor
    const gd = goreOf(c.sp), K = KINDS[gd.blood];
    if (K.key !== 'none' && (K.pal || K.decal)) {
      const z = G.getZone(c.zoneKey);
      this.decals.commit(z, { x: c.x + this.rng.float(-0.3, 0.3), z: c.z + this.rng.float(-0.3, 0.3), w: 0.7, d: 0.7, rot: this.rng.float(0, 6.28), tex: tex(K, 'splat_a'), tint: gd.tint ?? K.tint }, 0.4);
    }
  }

  private applyCreatureSevered(ev: Extract<GoreEv, { t: 'cs' }>) {
    const c: Creature | undefined = G.creatures?.creatures?.get?.(ev.id);
    if (!c) return;
    const gd = goreOf(c.sp), K = KINDS[gd.blood], tint = gd.tint ?? K.tint;
    const here = c.zoneKey === G.local?.zoneKey;
    const [dx, dz] = this.dirFrom(c, ev.x, ev.z);
    const sv: string[] = c.mem.severed = [...(c.mem.severed || [])];
    let any = false;
    for (const n of ev.ls) {
      for (const m of this.withChildren(c, n)) {
        if (sv.includes(m)) continue;
        sv.push(m); any = true;
        if (here && m === n) this.sever(c, n, K, tint, dx, dz, true);
      }
    }
    if (!any) return;
    c.mem.limbFx = creatureLimbFx(c.sp, sv);
    if (here && K.key !== 'none') {
      this.snd(K.snd.tear, c.x, c.z, 1, c.zoneKey);
      this.snd(K.snd.heavy, c.x, c.z, 0.8, c.zoneKey);
      const y = this.hitY(c);
      this.jet(K, tint, c.x, y, c.z, dx, dz, Math.round(24 * this.mul), 3.2, 1.0, 1.8, 0.032, 0.07);
      this.mist(K, tint, c.x, y, c.z, dx, dz, Math.round(8 * this.mul), 1.4);
    }
  }

  /** snapshot catch-up (a peer that missed the event, or came into the zone later): cut without the show */
  syncCreatureSevered(c: Creature, names: string[]) {
    const sv: string[] = c.mem.severed = [...(c.mem.severed || [])];
    const K = kindOf(c.sp);
    let any = false;
    for (const n of names) if (!sv.includes(n)) { sv.push(n); any = true; if (c.rig) this.sever(c, n, K, 0xffffff, 0, 0, false); }
    if (any) c.mem.limbFx = creatureLimbFx(c.sp, sv);
  }

  /** a part and everything hanging off it that the species can lose (rig hierarchy, or list order by limb) */
  private withChildren(c: Creature, name: string): string[] {
    const gd = goreOf(c.sp);
    const list = gd.sever || [];
    const out = [name];
    const rp = c.rig?.parts[name];
    if (rp) { for (const n of list) { const q = c.rig!.parts[n]; if (q && q !== rp && isAncestor(rp, q)) out.push(n); } return out; }
    const role = partRole(name, gd.head), id = limbId(name), i0 = list.indexOf(name);
    if (role === 'leg' || role === 'arm') for (let i = i0 + 1; i < list.length; i++) if (partRole(list[i], gd.head) === role && limbId(list[i]) === id) out.push(list[i]);
    return out;
  }

  /** host: a creature grabbed a survivor and is pulling (every peer sees it strain and hears it) */
  tearStart(c: Creature, pid: string, part: string, hold: number, verb: string) {
    const ev: GoreEv = { t: 'T', id: c.id, pid, pt: part, h: Math.round(hold * 100) / 100, v: verb };
    this.applyTear(ev);
    this.send(ev);
  }
  private applyTear(ev: Extract<GoreEv, { t: 'T' }>) {
    const c: Creature | undefined = G.creatures?.creatures?.get?.(ev.id);
    if (!c) return;
    c.mem.tearFx = { until: G.time + ev.h + 0.3, pid: ev.pid, v: ev.v, t0: G.time };
    if (c.zoneKey === G.local?.zoneKey && this.lv > 0) this.snd('gore_tear', c.x, c.z, 0.7, c.zoneKey);
  }

  // ================================================================ survivors losing limbs (src/survival/limbSystem.ts)
  /** the victim's machine: a limb came off. Everyone sees the spray and hears it; the owner leaves the mess. */
  survivorSevered(p: Player, part: string, how: string, from: [number, number]) {
    const ev: GoreEv = { t: 'L', id: p.id, pt: part, w: how, x: Math.round(from[0] * 10) / 10, z: Math.round(from[1] * 10) / 10 };
    this.applySurvivorSevered(ev);
    this.send(ev);
    if (this.lv <= 0) return;
    const z = G.getZone(p.zoneKey);
    const [dx, dz] = this.dirFrom(p, from[0], from[1]);
    const wp = this.woundPos(p, part);
    this.hitDecals(z, KINDS.red, 0xffffff, how === 'crush' ? 'vehicle' : 'axe', p.x, wp.y, p.z, dx, dz, 34);
    this.hitDecals(z, KINDS.red, 0xffffff, 'blade', p.x, wp.y, p.z, -dz, dx, 24);
    this.pool(z, p.x - dx * 0.2, p.z - dz * 0.2, this.lv >= 2 ? 1.3 : 1.0, KINDS.red, 0xffffff, 6);
    this.lastHit = { dmg: 30, t: G.time };
  }

  private applySurvivorSevered(ev: Extract<GoreEv, { t: 'L' }>) {
    const p = G.players.get(ev.id);
    if (!p) return;
    const here = p.zoneKey === G.local?.zoneKey;
    // sounds play even with gore off (it is still horrible); the show needs gore on
    if (here) {
      this.snd(ev.w === 'crush' || ev.w === 'vehicle' ? 'limb_crush' : 'limb_rip', p.x, p.z, 1, p.zoneKey);
      this.snd('gore_bone_crack', p.x, p.z, 0.9, p.zoneKey);
      const rate = ((p.app as any)?.bodyShape ?? 0.3) > 0.6 ? 1.25 : 1;
      if (p.isLocal) G.audio?.flat?.('limb_scream', 'voice', 0.9, rate);
      else G.audio?.play?.('limb_scream', p.x, p.z, { zone: p.zoneKey, rate });
    }
    if (this.lv <= 0 || !here) return;
    const K = KINDS.red, m = this.mul;
    const [dx, dz] = this.dirFrom(p, ev.x, ev.z);
    const jn = SEV_JOINT[ev.pt];
    const j: THREE.Object3D | undefined = jn ? (p.rig as any)?.j?.[jn] : undefined;
    let pos: THREE.Vector3;
    if (j && inScene(j)) { j.updateWorldMatrix(true, false); pos = j.getWorldPosition(new THREE.Vector3()); }
    else pos = this.woundPos(p, ev.pt);
    // the limb comes away: a burst toward the attacker's pull, mist, bits of meat
    this.jet(K, 0xffffff, pos.x, pos.y, pos.z, -dx, -dz, Math.round(46 * m), 3.6, 0.9, 2.2, 0.036, 0.08);
    this.jet(K, 0xffffff, pos.x, pos.y, pos.z, dx, dz, Math.round(18 * m), 2.2, 1.4, 1.4, 0.03, 0.05);
    this.mist(K, 0xffffff, pos.x, pos.y, pos.z, -dx, -dz, Math.round(16 * m), 1.8);
    this.bits(K, 0xffffff, pos.x, pos.y, pos.z, -dx, -dz, Math.round(7 * m) + 1, 2.4);
    this.gibs.chunks(p.zoneKey, K, 0xffffff, pos.x, pos.y, pos.z, Math.round(3 * m) + 1, v3.set(-dx, 0, -dz), 2.0, 1.8);
    // the stump pumps: arterial spurts out along where the limb was
    if (j && inScene(j)) {
      for (let i = this.arteries.length - 1; i >= 0; i--) if (this.arteries[i].tag === 'p:' + p.id) this.arteries.splice(i, 1);
      this.arteries.push({ obj: j, off: new THREE.Vector3(), dir: new THREE.Vector3((Math.random() - 0.5) * 0.4, -1, 0.25).normalize(), t: 0, dur: this.lv >= 2 ? 11 : 6, str: 1.5, K, tint: 0xffffff, zone: p.zoneKey, ph: 0, f: 1.35, acc: 0, owner: p.isLocal, dec: 0.4, tag: 'p:' + p.id });
    }
    bus.emit('bloodied', p, 'torso_u', 0.8);
    bus.emit('bloodied', p, ev.pt, 1);
    this.shake(p.x, p.z, p.isLocal ? 0.9 : 0.45);
    this.lensNear(pos.x, pos.z, p.isLocal ? 1.6 : 1.0);
  }

  /** cut a named part off a creature's rig: stump, gib, spurting */
  private sever(c: Creature, name: string, K: BloodKind, tint: number, dx: number, dz: number, live: boolean, burst = false) {
    const rig = c.rig; if (!rig) return;
    const part = rig.parts[name];
    if (!part || !attached(part, rig.root) || !visibleChain(part, rig.root)) return;
    const m = Gibs.measure(part);
    const parent = part.parent!;
    const dims = [m.size.x, m.size.y, m.size.z].sort((a, b) => a - b);
    // the cut is as thick as the part's slimmer side (necks are thinner than heads)
    const isHead = name === goreOf(c.sp).head;
    const stump = this.gibs.stump(parent, part.position, part.quaternion, K, clamp(dims[0] * (isHead ? 0.6 : 0.9), 0.03, isHead ? 0.12 : 0.2));
    if (live && !burst) {
      const clone = part.clone(true);
      part.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      const out = m.centre.clone().sub(m.pivot); out.y = 0;
      if (out.lengthSq() > 1e-4) out.normalize();
      const v = new THREE.Vector3(dx * 2.2 + out.x * 1.6 + (Math.random() - 0.5), 1.8 + Math.random() * 2, dz * 2.2 + out.z * 1.6 + (Math.random() - 0.5));
      this.gibs.spawn(clone, c.zoneKey, K, tint, v, 9, 3);
    }
    parent.remove(part);
    if (live && K.liquid) {
      // the stump pumps: outward along where the part was
      stump.updateMatrixWorld(true);
      const wdir = m.centre.clone().sub(m.pivot);
      if (wdir.lengthSq() < 1e-4) wdir.set(0, 1, 0);
      wdir.normalize();
      const local = wdir.applyQuaternion(stump.getWorldQuaternion(q4).invert());
      const neck = isHead || burst;
      this.arteries.push({ obj: stump, off: new THREE.Vector3(), dir: local, t: 0, dur: (this.lv >= 2 ? (neck ? 9 : 5) : 2.5) + Math.random() * 2, str: neck ? 1.7 : 1.1, K, tint, zone: c.zoneKey, ph: Math.random() * 3, f: neck ? 1.45 : 1.25, acc: 0, owner: this.authority, dec: 0.6, tag: c.id });
    }
  }

  /** the part to cut a body in two at: the bone above the root on the way to the head (a spine, a chest) */
  waistOf(c: Creature): string | null {
    const rig = c.rig; if (!rig) return null;
    const gd = goreOf(c.sp);
    let start: THREE.Object3D | undefined = gd.head ? rig.parts[gd.head] : undefined;
    if (!start) for (const n of gd.sever || []) { if (partRole(n, gd.head) === 'arm' && rig.parts[n]) { start = rig.parts[n]; break; } }
    if (!start || !attached(start, rig.root)) return null;
    const chain: THREE.Object3D[] = [];
    let q = start.parent;
    while (q && q !== rig.body && q !== rig.root) { chain.push(q); q = q.parent; }
    if (chain.length < 2) return null;
    const pick = chain[chain.length - 2];
    for (const k in rig.parts) if (rig.parts[k] === pick) return k;
    return null;
  }

  /** cut in two at the waist: the top half goes, the legs stay, everything in between comes out */
  private bisect(c: Creature, waist: string, K: BloodKind, tint: number, dx: number, dz: number) {
    const part = c.rig?.parts[waist];
    let px = c.x, py = this.hitY(c) - 0.1, pz = c.z;
    if (part) { part.updateWorldMatrix(true, false); const wp = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld); px = wp.x; py = wp.y; pz = wp.z; }
    this.sever(c, waist, K, tint, dx, dz, true);
    const m = this.mul;
    if (K.liquid) this.gibs.organs(c.zoneKey, K, tint, px, py, pz, Math.round(2 + 2 * m), v3.set(dx, 0, dz), 2.2);
    this.gibs.chunks(c.zoneKey, K, tint, px, py, pz, Math.round(5 * m) + 2, v3.set(dx, 0, dz), 2.6, 2.2);
    this.jet(K, tint, px, py, pz, dx, dz, Math.round(60 * m), 3.6, 1.4, 2.4, 0.036, 0.07);
    this.jet(K, tint, px, py, pz, -dz, dx, Math.round(20 * m), 2.6, 0.8, 1.6, 0.03, 0.06);
    this.jet(K, tint, px, py, pz, dz, -dx, Math.round(20 * m), 2.6, 0.8, 1.6, 0.03, 0.06);
    this.mist(K, tint, px, py, pz, dx, dz, Math.round(18 * m), 2);
    this.bits(K, tint, px, py, pz, dx, dz, Math.round(10 * m), 3);
    this.snd(K.snd.burst, px, pz, 1, c.zoneKey);
    this.snd(K.snd.tear, px, pz, 1, c.zoneKey);
    this.snd(K.snd.heavy, px, pz, 0.9, c.zoneKey);
    this.shake(px, pz, 0.55);
    this.lensNear(px, pz, 1.4, K);
  }

  /** blood on the lens when it happens close to the local survivor */
  lensNear(x: number, z: number, amount: number, K: BloodKind = KINDS.red) {
    const p = G.local; if (!p || !K.liquid) return;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > 2.2) return;
    const k = amount * (1 - d / 2.2);
    if (k < 0.2 || Math.random() > 0.2 + k * 0.6) return;
    // which side of the picture: screen-right of the camera is (cos yaw, -sin yaw)
    const yaw = G.pr.yaw, sx = (x - p.x) * Math.cos(yaw) - (z - p.z) * Math.sin(yaw);
    this.lens.splash(k, clamp(sx, -1, 1), K.drop[1] ?? 0x8a1214);
  }

  // ================================================================ feeding (src/gore/maul.ts decides, host)
  maul(c: Creature, p: Player, n: number) {
    const ev: GoreEv = { t: 'M', id: c.id, pid: p.id, n };
    this.applyMaul(ev);
    this.send(ev);
    // what stays: the pool widens, meat and blood strewn about
    const z = G.getZone(p.zoneKey);
    if (n % 3 === 1) this.pool(z, p.x + this.rng.float(-0.3, 0.3), p.z + this.rng.float(-0.3, 0.3), Math.min(2.6, 1.2 + n * 0.08), KINDS.red, 0xffffff, 6);
    if (n % 2 === 0) {
      const a = this.rng.float(0, 6.28), d = this.rng.float(0.3, 1.0);
      this.decals.commit(z, { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, w: this.rng.float(0.4, 0.8), d: this.rng.float(0.4, 0.8), rot: this.rng.float(0, 6.28), tex: tex(KINDS.red, this.rng.chance(0.5) ? 'splat_a' : 'drops') }, 0.4);
    }
  }

  private applyMaul(ev: Extract<GoreEv, { t: 'M' }>) {
    const c: Creature | undefined = G.creatures?.creatures?.get?.(ev.id);
    const p = G.players.get(ev.pid);
    if (!c || !p || this.lv <= 0 || p.zoneKey !== G.local?.zoneKey) return;
    const K = KINDS.red, m = this.mul, r = this.rng;
    const parts = ['torso_u', 'torso_l', 'neck', 'thigh_l', 'thigh_r', 'uarm_l', 'uarm_r', 'head'];
    const pt = parts[(ev.n * 7 + 3) % parts.length];
    const wp = this.woundPos(p, pt);
    // it pulls back with its mouthful: the spray goes up and toward it
    let dx = c.x - p.x, dz = c.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    this.jet(K, 0xffffff, wp.x, wp.y, wp.z, dx, dz, Math.round(16 * m) + 2, 2.2, 1.2, 2.2, 0.034, 0.05);
    this.mist(K, 0xffffff, wp.x, wp.y, wp.z, dx, dz, Math.round(5 * m) + 1, 1.2);
    if (ev.n % 2 === 0) this.bits(K, 0xffffff, wp.x, wp.y, wp.z, dx, dz, Math.round(3 * m) + 1, 2);
    if (ev.n % 3 === 0) this.gibs.chunks(p.zoneKey, K, 0xffffff, wp.x, wp.y, wp.z, Math.round(m) + 1, v3.set(dx, 0, dz), 1.8, 1.5);
    if (this.lv >= 2 && ev.n >= 5 && ev.n % 4 === 1) this.gibs.organs(p.zoneKey, K, 0xffffff, wp.x, wp.y, wp.z, 1, v3.set(dx, 0, dz), 1.4);
    this.snd(r.chance(0.5) ? 'gore_tear' : 'gore_squelch', p.x, p.z, 0.9, p.zoneKey);
    if (ev.n % 3 === 0) this.snd('gore_bone_crack', p.x, p.z, 0.7, p.zoneKey);
    bus.emit('bloodied', p, pt, 0.7);
    this.lensNear(wp.x, wp.z, 0.8, K);
    // the body is gone after long enough at it
    if (this.lv >= 2 && ev.n >= 16) this.gibPlayer(p);
  }

  /** the local survivor's weapon shows what it has been used for */
  private bloodyWeapon() {
    const p = G.local; if (!p || this.lv <= 0) return;
    const it = p.handR;
    const lvl = it ? Math.min(3, Math.floor((it.bloody ?? 0) * 3.99)) : 0;
    const held: THREE.Object3D | undefined = (p.rig as any)?.heldR;
    if (!held) return;
    held.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const ud = mesh.userData;
      if ((ud.goreLvl ?? 0) === lvl && ud.goreSrc) return;
      if (!ud.goreSrc) ud.goreSrc = mesh.geometry;
      ud.goreLvl = lvl;
      mesh.geometry = lvl ? bloodyGeo(ud.goreSrc, lvl) : ud.goreSrc;
    });
  }

  private headBurst(c: Creature, head: string, K: BloodKind, tint: number, dx: number, dz: number) {
    const part = c.rig?.parts[head];
    let cx = c.x, cy = this.hitY(c) + 0.2, cz = c.z;
    if (part && attached(part, c.rig!.root)) { const m = Gibs.measure(part); cx = m.centre.x; cy = m.centre.y; cz = m.centre.z; }
    this.sever(c, head, K, tint, dx, dz, true, true);
    const m = this.mul;
    this.gibs.chunks(c.zoneKey, K, tint, cx, cy, cz, Math.round(6 * m) + 1, v3.set(dx, 0, dz), 2.2, 2.4);
    this.jet(K, tint, cx, cy, cz, dx, dz, Math.round(40 * m), 3.2, 1.6, 2.6, 0.034, 0.06);
    this.mist(K, tint, cx, cy, cz, dx, dz, Math.round(14 * m), 1.6);
    this.bits(K, tint, cx, cy, cz, dx, dz, Math.round(8 * m), 2.6);
    this.snd(K.snd.burst, cx, cz, 1, c.zoneKey);
    this.snd(K.snd.heavy, cx, cz, 0.8, c.zoneKey);
    this.shake(cx, cz, 0.35);
    this.lensNear(cx, cz, 1.2, K);
  }

  private fullGib(c: Creature, K: BloodKind, tint: number, dx: number, dz: number, here: boolean) {
    const gd = goreOf(c.sp);
    if (!here || !c.rig) return;
    const rig = c.rig;
    const cy = this.hitY(c);
    const names = [...(gd.head ? [gd.head] : []), ...(gd.sever || [])];
    const done: THREE.Object3D[] = [];
    rig.root.updateWorldMatrix(true, true);
    // the torso, minus everything that flies off on its own
    const torso = rig.body.clone(true);
    for (const n of names) torso.getObjectByName(n)?.removeFromParent();
    rig.body.matrixWorld.decompose(torso.position, torso.quaternion, torso.scale);
    this.gibs.spawn(torso, c.zoneKey, K, tint, new THREE.Vector3(dx * 2.5, 1.2, dz * 2.5), 5, 4);
    for (const n of names) {
      const p = rig.parts[n];
      if (!p || !attached(p, rig.root) || done.some((d) => isAncestor(d, p))) continue;
      done.push(p);
      const clone = p.clone(true);
      p.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      const a = Math.atan2(dz, dx) + this.rng.gauss(0, 1.1), s = 2.5 + Math.random() * 3;
      this.gibs.spawn(clone, c.zoneKey, K, tint, new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s), 14, 3);
    }
    const m = this.mul;
    this.gibs.chunks(c.zoneKey, K, tint, c.x, cy, c.z, Math.round(10 * m) + 2, v3.set(dx, 0, dz), 3.2, 2.6);
    this.jet(K, tint, c.x, cy, c.z, dx, dz, Math.round(70 * m), 4.5, 2.2, 2.8, 0.036, 0.07);
    this.mist(K, tint, c.x, cy, c.z, dx, dz, Math.round(20 * m), 2.2);
    this.bits(K, tint, c.x, cy, c.z, dx, dz, Math.round(14 * m), 3.4);
    this.snd(K.snd.burst, c.x, c.z, 1, c.zoneKey);
    this.snd(K.snd.heavy, c.x, c.z, 0.9, c.zoneKey);
    this.shake(c.x, c.z, 0.5);
    this.lensNear(c.x, c.z, 1.5, K);
  }

  /** a corpse run over (host decides, every peer bursts it) */
  private applyCorpseGib(id: string) {
    const c: Creature | undefined = G.creatures?.creatures?.get?.(id);
    if (!c || c.mem.gibbed) return;
    c.mem.gibbed = true;
    const K = kindOf(c.sp), tint = goreOf(c.sp).tint ?? K.tint;
    this.fullGib(c, K, tint, Math.random() - 0.5, Math.random() - 0.5, c.zoneKey === G.local?.zoneKey);
  }

  /** a living creature's severe wound pumps blood for a while */
  private woundArtery(c: Creature, dx: number, dz: number, hy: number) {
    const K = kindOf(c.sp), tint = goreOf(c.sp).tint ?? K.tint;
    const root = c.rig!.root;
    root.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3(c.x - dx * c.radius * 0.8, hy, c.z - dz * c.radius * 0.8);
    const off = root.worldToLocal(wp.clone());
    const dir = new THREE.Vector3(-dx, 0.35, -dz).normalize().applyQuaternion(root.getWorldQuaternion(q4).invert());
    this.arteries.push({ obj: root, off, dir, t: 0, dur: 6 + Math.random() * 4, str: 0.8, K, tint, zone: c.zoneKey, ph: 0, f: 1.5, acc: 0, owner: this.authority, dec: 0.8, tag: c.id });
  }

  // ================================================================ arteries
  private updateArteries(dt: number, z: Zone | null) {
    for (let i = this.arteries.length - 1; i >= 0; i--) {
      const a = this.arteries[i];
      a.t += dt;
      if (a.t > a.dur || !z || a.zone !== z.key || !inScene(a.obj)) { this.arteries.splice(i, 1); continue; }
      const prev = Math.sin(a.ph);
      a.ph += dt * a.f * Math.PI * 2;
      const s = Math.sin(a.ph);
      const fade = Math.pow(1 - a.t / a.dur, 0.7);
      const env = Math.pow(Math.max(0, s), 3) * a.str * fade;
      if (prev <= 0 && s > 0 && fade > 0.3) {
        const p = a.obj.localToWorld(v3.copy(a.off));
        this.snd('gore_spurt', p.x, p.z, 0.35 * fade, a.zone);
      }
      a.acc += env * 70 * dt * this.mul;
      if (a.acc < 1) continue;
      const p = a.obj.localToWorld(v3.copy(a.off));
      const wd = a.dir.clone().applyQuaternion(a.obj.getWorldQuaternion(q4));
      while (a.acc >= 1) {
        a.acc -= 1;
        const sp = 1.8 + env * 2.6;
        this.emit(a.K, a.tint, p.x, p.y, p.z, wd.x * sp + (Math.random() - 0.5) * 0.4, wd.y * sp + 0.6 + Math.random() * 0.5, wd.z * sp + (Math.random() - 0.5) * 0.4, 0.022 + Math.random() * 0.016, 1.6, 0.1);
      }
      // the owner leaves where it lands
      if (a.owner) {
        a.dec -= dt;
        if (a.dec <= 0) {
          a.dec = 1.2 + Math.random();
          const reach = 0.5 + 0.9 * fade;
          const lx = p.x + wd.x * reach, lz = p.z + wd.z * reach;
          this.decals.commit(z, { x: lx, z: lz, w: 0.4, d: 0.4, rot: Math.random() * 6.28, tex: tex(a.K, 'drops'), tint: a.tint }, 0.5);
        }
      }
    }
  }

  // ================================================================ wounded creatures: drips and trails
  private updateWounded(dt: number, z: Zone | null) {
    const cs = G.creatures; if (!cs) return;
    for (const c of cs.creatures.values() as Iterable<Creature>) {
      const b = c.mem.goreBleed as { until: number; s: number } | undefined;
      if (!b) continue;
      if (c.dead || G.time > b.until) { delete c.mem.goreBleed; continue; }
      const K = kindOf(c.sp), tint = goreOf(c.sp).tint ?? K.tint;
      if (z && c.zoneKey === z.key && c.visibleToLocal && Math.random() < dt * (1.5 + b.s * 6) * this.mul) {
        this.emit(K, tint, c.x + (Math.random() - 0.5) * c.radius, this.hitY(c) - 0.15, c.z + (Math.random() - 0.5) * c.radius, 0, -0.2, 0, 0.02, 1.2, 0.08);
      }
      if (this.authority) {
        const last = c.mem.goreLast as [number, number] | undefined;
        if (!last) { c.mem.goreLast = [c.x, c.z]; continue; }
        if (Math.hypot(c.x - last[0], c.z - last[1]) > 1.3 - b.s * 0.5) {
          c.mem.goreLast = [c.x, c.z];
          if (Math.random() < 0.5 + b.s * 0.5) this.decals.commit(G.getZone(c.zoneKey), { x: c.x, z: c.z, w: 0.3 + b.s * 0.2, d: 0.3 + b.s * 0.2, rot: Math.random() * 6.28, tex: tex(K, 'drops'), tint }, 0.6);
        }
      }
    }
  }

  // ================================================================ gibs landing
  private gibLanded(g: { kind: BloodKind; tint: number; zone: string; big: boolean; obj: THREE.Object3D }, x: number, y: number, z: number, speed: number) {
    if (speed < 0.8) return;
    this.snd(g.kind.snd.land, x, z, clamp(speed / 5, 0.3, 0.9), g.zone);
    if (g.kind.liquid) {
      for (let i = 0; i < 4; i++) this.emit(g.kind, g.tint, x, y + 0.03, z, (Math.random() - 0.5) * 1.6, 0.8 + Math.random(), (Math.random() - 0.5) * 1.6, 0.022, 0.8, 0.05);
      // where it slaps down it leaves a mark (local: gibs are not replicated)
      if (g.big || Math.random() < 0.4) this.decals.show(g.zone, { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, w: g.big ? 0.45 : 0.25, d: g.big ? 0.45 : 0.25, rot: Math.random() * 6.28, tex: tex(g.kind, 'drops'), tint: g.tint }, 0, 90);
    }
  }

  private shake(x: number, z: number, amt: number) {
    const p = G.local;
    if (!p || reduceMotion() || Math.hypot(p.x - x, p.z - z) > 9) return;
    G.pr.shake = Math.max(G.pr.shake, amt);
  }

  // ================================================================ survivors
  /** a creature's hit landed on the local survivor (manager.applyHitToPlayer) */
  playerHit(p: Player, h: { dmg: number; from: [number, number] }, part: string, injury: string) {
    if (this.lv <= 0) return;
    this.lastHit = { dmg: h.dmg, t: G.time };
    const ev: GoreEv = { t: 'p', id: p.id, w: injury, a: Math.round(h.dmg * 10) / 10, x: Math.round(h.from[0] * 10) / 10, z: Math.round(h.from[1] * 10) / 10, pt: part };
    this.applyPlayerHit(ev);
    this.send(ev);
    if (injury === 'bruise' || injury === 'burn') return;
    const z = G.getZone(p.zoneKey);
    const [dx, dz] = this.dirFrom(p, h.from[0], h.from[1]);
    const wp = this.woundPos(p, part);
    this.hitDecals(z, KINDS.red, 0xffffff, INJ_HIT[injury] ?? 'claw', p.x, wp.y, p.z, dx, dz, h.dmg * 0.8);
  }

  private applyPlayerHit(ev: Extract<GoreEv, { t: 'p' }>) {
    const p = G.players.get(ev.id);
    if (!p || p.zoneKey !== G.local?.zoneKey) return;
    const hk = INJ_HIT[ev.w] ?? 'claw';
    if (hk === 'fire') return;
    const [dx, dz] = this.dirFrom(p, ev.x, ev.z);
    const wp = this.woundPos(p, ev.pt);
    this.hitFx(KINDS.red, 0xffffff, hk, wp.x, wp.y, wp.z, dx, dz, ev.w === 'bruise' ? ev.a * 0.3 : ev.a * 0.8);
    // for whoever paints blood onto survivors' bodies (character rig)
    if (ev.w !== 'bruise') bus.emit('bloodied', p, ev.pt, clamp(ev.a / 25, 0.15, 1));
    if (ev.w !== 'bruise') this.snd('gore_wet_hit', p.x, p.z, 0.75, p.zoneKey);
    if (ev.w === 'bite') this.snd('gore_tear', p.x, p.z, 0.6, p.zoneKey);
    if (ev.w !== 'bruise') this.lensNear(wp.x, wp.z, (ev.a / 20) * (p.isLocal ? 1.3 : 0.8));
    // on the floor and still being torn at
    if (p.body.downed && ev.w !== 'bruise' && this.lv >= 2) {
      this.jet(KINDS.red, 0xffffff, wp.x, wp.y, wp.z, -dx, -dz, Math.round(14 * this.mul), 2, 1.1, 2, 0.034, 0.05);
      if (Math.random() < 0.4) this.gibs.chunks(p.zoneKey, KINDS.red, 0xffffff, wp.x, wp.y, wp.z, 1, v3.set(-dx, 0, -dz), 1.6, 1.4);
    }
  }

  /** world position of a wound on a survivor (rig.woundPoints() if the rig offers it, else the joint) */
  woundPos(p: Player, part: string): THREE.Vector3 {
    const rig: any = p.rig;
    try {
      const wps = rig?.woundPoints?.();
      if (Array.isArray(wps) && wps.length) {
        const hit = wps.find((w: any) => w && (w.part === part || w.key === part)) ?? null;
        const w: any = hit ?? null;
        const pos = w ? (w.pos ?? w.position ?? w.p ?? w) : null;
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number') return new THREE.Vector3(pos.x, pos.y, pos.z);
      }
    } catch { /* fall back to joints */ }
    const pj = PART_JOINT[part] ?? PART_JOINT.torso_u;
    const j: THREE.Object3D | undefined = rig?.j?.[pj[0]];
    if (j && inScene(j)) { j.updateWorldMatrix(true, false); return j.localToWorld(new THREE.Vector3(0, pj[1], 0)); }
    return new THREE.Vector3(p.x, p.y + 1.1, p.z);
  }

  /** bleeding survivors: drips, spurts when it is bad, drip trails and crawl smears (owner commits) */
  private updateSurvivors(dt: number, z: Zone | null) {
    const me = G.local;
    if (me) {
      // my own bleeding, reported to the others when it changes
      let worst = '', wb = 0;
      if (!me.body.dead) for (const [k, part] of Object.entries(me.body.parts)) for (const inj of part.injuries) { const b = me.body.injuryBleed(inj); if (b > wb) { wb = b; worst = k; } }
      const rate = me.body.dead ? 0 : me.body.bleedRate();
      const l = rate < 0.02 ? 0 : rate < 0.35 ? 1 : rate < 0.8 ? 2 : rate < 1.4 ? 3 : 4;
      let st = this.bleed.get(me.id);
      if (!st) this.bleed.set(me.id, st = { l, pt: worst, acc: 0, dec: 0 });
      st.l = l; st.pt = worst;
      const s = this.sentBleed;
      if ((s.l !== l || s.pt !== worst) && G.time - s.t > 1) { s.l = l; s.pt = worst; s.t = G.time; this.send({ t: 'b', id: me.id, l, pt: worst }); }
    }
    for (const p of G.players.values()) {
      const st = this.bleed.get(p.id);
      if (!st || st.l <= 0 || p.body.dead && !p.isLocal) continue;
      if (p.body.dead) continue;
      const here = !!z && p.zoneKey === z.key;
      // drips
      st.acc += dt * [0, 0.8, 2.2, 4, 6][st.l] * this.mul;
      if (here && st.acc >= 1) {
        st.acc = 0;
        const wp = this.woundPos(p, st.pt);
        this.emit(KINDS.red, 0xffffff, wp.x + (Math.random() - 0.5) * 0.04, wp.y, wp.z + (Math.random() - 0.5) * 0.04, p.vx * 0.3, -0.3, p.vz * 0.3, 0.02 + Math.random() * 0.01, 1.4, 0.1);
      }
      // severe bleeding: arterial spurts from the worst wound
      if (here && st.l >= 3 && !this.arteries.some((a) => a.tag === 'p:' + p.id)) {
        const pj = PART_JOINT[st.pt] ?? PART_JOINT.torso_u;
        const stump = p.body.severed.includes(st.pt as any) && !!SEV_JOINT[st.pt];
        const j: THREE.Object3D | undefined = (p.rig as any)?.j?.[stump ? SEV_JOINT[st.pt] : pj[0]];
        if (j && inScene(j)) {
          let out: THREE.Vector3;
          if (stump) out = new THREE.Vector3((Math.random() - 0.5) * 0.5, -1, 0.3).normalize();
          else {
            out = this.woundPos(p, st.pt).sub(v3.set(p.x, p.y + 1.0, p.z)); out.y = 0.4;
            out.normalize().applyQuaternion(j.getWorldQuaternion(q4).invert());
          }
          this.arteries.push({ obj: j, off: new THREE.Vector3(0, stump ? 0 : pj[1], 0), dir: out, t: 0, dur: 4, str: st.l >= 4 ? 0.9 : 0.6, K: KINDS.red, tint: 0xffffff, zone: p.zoneKey, ph: 0, f: 1.2, acc: 0, owner: p.isLocal, dec: 1, tag: 'p:' + p.id });
        }
      }
      // persistent drips (my own survivor only), batched; downed and crawling smears
      if (p.isLocal) {
        st.dec -= dt;
        const last = st.last;
        const moved = last ? Math.hypot(p.x - last[0], p.z - last[1]) : 9;
        const zz = G.getZone(p.zoneKey);
        if (p.body.downed && moved > 0.5 && st.l >= 1) {
          const a = last ? Math.atan2(p.z - last[1], p.x - last[0]) : p.facing;
          this.decals.commit(zz, { x: p.x, z: p.z, w: 0.6, d: 0.35, rot: a, tex: 'gore_red_smear' }, 1.5, { show: true });
          st.last = [p.x, p.z];
        } else if (st.dec <= 0 && (moved > 0.7 || !last || moved < 0.1)) {
          st.dec = [9, 3.2, 1.8, 1.1, 0.8][st.l] * (this.lv >= 2 ? 1 : 1.6);
          if (moved > 0.2 || Math.random() < 0.5) this.decals.commit(zz, { x: p.x + (Math.random() - 0.5) * 0.3, z: p.z + (Math.random() - 0.5) * 0.3, w: 0.22 + st.l * 0.07, d: 0.22 + st.l * 0.07, rot: Math.random() * 6.28, tex: 'gore_red_drops' }, 1.5, { show: true });
          st.last = [p.x, p.z];
        }
      }
    }
    // gibbed survivors stay gibbed
    for (const id of this.gibbedPlayers) { const p = G.players.get(id); const b = (p?.rig as any)?.body; if (b) b.visible = false; }
  }

  /** bloody footprints after walking through fresh blood (my own survivor commits them) */
  private footstep(p: Player) {
    if (!p.isLocal || this.lv <= 0 || p.inVehicle) return;
    let st = this.wet.get(p);
    if (!st) this.wet.set(p, st = { wet: 0, tint: 0xffffff, side: 1 });
    const fresh = this.decals.wetAt(p.zoneKey, p.x, p.z);
    if (fresh.wet > st.wet) { st.wet = fresh.wet; st.tint = fresh.tint; }
    st.side = -st.side;
    if (st.wet < 0.06) return;
    const f = p.facing, ox = -Math.sin(f) * 0.08 * st.side, oz = Math.cos(f) * 0.08 * st.side;
    const z = G.getZone(p.zoneKey);
    this.decals.commit(z, { x: p.x + ox + Math.cos(f) * 0.1, z: p.z + oz + Math.sin(f) * 0.1, w: 0.13, d: 0.28, rot: f + Math.PI / 2, tex: st.wet > 0.4 ? 'gore_print_a' : 'gore_print_b', tint: st.tint }, 1.4, { show: true, force: st.wet > 0.4 });
    st.wet -= this.lv >= 2 ? 0.06 : 0.09;
  }

  private localDeath(p: Player) {
    if (!p.isLocal || this.lv <= 0) return;
    const gb = this.lv >= 2 && this.lastHit.dmg >= 32 && G.time - this.lastHit.t < 2;
    const ev: GoreEv = { t: 'd', id: p.id };
    if (gb) ev.gb = 1;
    this.applyPlayerDeath(ev);
    this.send(ev);
    // committed quickly: this tab is about to show the death screen
    this.pool(G.getZone(p.zoneKey), p.x, p.z, this.lv >= 2 ? 1.7 : 1.4, KINDS.red, 0xffffff, 2.5);
  }

  private applyPlayerDeath(ev: Extract<GoreEv, { t: 'd' }>) {
    const p = G.players.get(ev.id);
    if (!p) return;
    this.bleed.delete(p.id);
    if (ev.gb) this.gibPlayer(p);
  }

  /** burst a survivor's corpse (heavy mode: run over, or killed by a crushing blow) */
  gibPlayer(p: Player) {
    if (this.gibbedPlayers.has(p.id)) return;
    this.gibbedPlayers.add(p.id);
    const rig: any = p.rig;
    const here = p.zoneKey === G.local?.zoneKey;
    const K = KINDS.red, m = this.mul;
    if (here && rig?.body) {
      rig.root?.updateWorldMatrix?.(true, true);
      const meshes: THREE.Object3D[] = rig.meshes ? [...rig.meshes.values()] : [];
      for (const mesh of meshes) {
        if (!mesh?.parent || !inScene(mesh)) continue;
        const clone = mesh.clone(true);
        mesh.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
        const a = Math.random() * 6.28, s = 1.5 + Math.random() * 3;
        this.gibs.spawn(clone, p.zoneKey, K, 0xffffff, new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s), 12, 3);
      }
      const y = p.y + 0.6;
      this.gibs.chunks(p.zoneKey, K, 0xffffff, p.x, y, p.z, Math.round(10 * m) + 2, v3.set(0, 0, 0), 2.8, 2.6);
      this.jet(K, 0xffffff, p.x, y, p.z, 1, 0, Math.round(70 * m), 4, 3.2, 2.6, 0.036, 0.07);
      this.mist(K, 0xffffff, p.x, y, p.z, 1, 0, Math.round(20 * m), 2);
      this.snd('gore_burst', p.x, p.z, 1, p.zoneKey);
      this.snd('gore_bone_crack', p.x, p.z, 0.9, p.zoneKey);
      this.shake(p.x, p.z, 0.5);
    }
    if (rig?.body) rig.body.visible = false;
  }

  // ================================================================ vehicles over corpses (host)
  private runOver() {
    const vs: any = (G as any).vehicles;
    if (!vs?.vehicles) return;
    for (const v of vs.vehicles.values() as Iterable<any>) {
      if (Math.abs(v.speed ?? 0) < 4) continue;
      const reach = (v.def?.len ?? 4) / 2;
      for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) {
        if (!c.dead || c.zoneKey !== v.zone || c.mem.gibbed || c.mem.runOver) continue;
        if (Math.hypot(c.x - v.x, c.z - v.z) > reach + c.radius) continue;
        c.mem.runOver = true;
        const K = kindOf(c.sp), tint = goreOf(c.sp).tint ?? K.tint;
        if (K.key === 'none') continue;
        const z = G.getZone(c.zoneKey), a = v.yaw ?? 0;
        this.decals.commit(z, { x: c.x + Math.cos(a) * 0.9, z: c.z + Math.sin(a) * 0.9, w: 2.0, d: 0.7, rot: a, tex: tex(K, 'smear'), tint }, 0.2, { force: true });
        if (this.lv >= 2 && goreOf(c.sp).gib !== false) { const ev: GoreEv = { t: 'g', id: c.id }; this.applyCorpseGib(c.id); this.send(ev); }
        else this.snd(K.snd.heavy, c.x, c.z, 0.9, c.zoneKey);
      }
      if (this.lv < 2) continue;
      for (const p of G.players.values()) {
        if (!p.body.dead || p.zoneKey !== v.zone || this.gibbedPlayers.has(p.id)) continue;
        if (Math.hypot(p.x - v.x, p.z - v.z) > reach + 0.4) continue;
        const ev: GoreEv = { t: 'd', id: p.id, gb: 1 };
        this.applyPlayerDeath(ev); this.send(ev);
        this.decals.commit(G.getZone(p.zoneKey), { x: p.x, z: p.z, w: 2.0, d: 0.7, rot: v.yaw ?? 0, tex: 'gore_red_smear' }, 0.2, { force: true });
      }
    }
  }
}

const bloodyCache = new Map<string, THREE.BufferGeometry>();
/** a held weapon's geometry with blood worked into its business end (the far half along its length) */
function bloodyGeo(src: THREE.BufferGeometry, lvl: number): THREE.BufferGeometry {
  const key = src.uuid + '|' + lvl;
  let g = bloodyCache.get(key);
  if (g) return g;
  g = src.clone();
  const P = g.getAttribute('position') as THREE.BufferAttribute, C = g.getAttribute('color') as THREE.BufferAttribute;
  if (!P || !C) return src;
  g.computeBoundingBox();
  const bb = g.boundingBox!, size = bb.getSize(new THREE.Vector3());
  const ax = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const lo = bb.min[ax], len = Math.max(1e-4, size[ax]);
  for (let i = 0; i < P.count; i++) {
    const t = ((ax === 'x' ? P.getX(i) : ax === 'y' ? P.getY(i) : P.getZ(i)) - lo) / len;
    const n = ((Math.round(P.getX(i) * 300) * 73856093) ^ (Math.round(P.getY(i) * 300) * 19349663) ^ (Math.round(P.getZ(i) * 300) * 83492791)) >>> 0;
    const reach = 0.25 + lvl * 0.15;
    // whichever end is further from the grip (the grip sits about a quarter along)
    const along = Math.max(t, 1 - t);
    if (along < 1 - reach || (n % 7) / 7 > 0.35 + lvl * 0.2) continue;
    const k = Math.min(1, 0.45 + lvl * 0.18);
    C.setXYZ(i, C.getX(i) * (1 - k) + 0.42 * k, C.getY(i) * (1 - k) + 0.04 * k, C.getZ(i) * (1 - k) + 0.05 * k);
  }
  C.needsUpdate = true;
  bloodyCache.set(key, g);
  return g;
}

function attached(o: THREE.Object3D, root: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) { if (p === root) return true; p = p.parent; }
  return false;
}
/** is the part shown by its own rig (ignores the whole-body visibility the view toggles) */
function visibleChain(o: THREE.Object3D, root: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p && p !== root && p.parent !== root) { if (!p.visible) return false; p = p.parent; }
  return true;
}
function isAncestor(a: THREE.Object3D, b: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = b.parent;
  while (p) { if (p === a) return true; p = p.parent; }
  return false;
}
function inScene(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) { if ((p as any).isScene) return true; p = p.parent; }
  return false;
}

export type { SpeciesDef };

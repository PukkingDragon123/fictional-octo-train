import * as THREE from 'three';
import { Body, Env } from '../survival/body';
import { HumanRig, Appearance, Outfit } from './humanRig';
import { HumanAnimator, Stance, FullBody, ActionAnim } from './humanAnim';
import { ActionQueue } from '../actions/action';
import { Container } from '../items/container';
import { Item, itemDef, itemWeight, ItemDef } from '../items/item';
import { makeHeldMesh } from '../items/itemMeshes';
import { uid } from '../core/rng';
import { clamp, dampAngle, wrapAngle } from '../core/math';
import { occupationByKey } from '../survival/traits';

export const WEAR_SLOTS = ['head', 'eyes', 'face', 'neck', 'torso_inner', 'torso', 'torso_outer', 'hands', 'legs', 'feet', 'socks', 'back', 'belt', 'wrist'] as const;
export type WearSlot = typeof WEAR_SLOTS[number];

export interface PlayerNetState {
  x: number; z: number; f: number; sp: number; st: Stance; fb: FullBody; ac: ActionAnim; at: number; ad: number;
  run: boolean; light: boolean; hr: string; hl: string; out: Outfit; down: boolean; dead: boolean; zone: string; aim: boolean;
  carry?: string; carriedBy?: string; name: string; app: Appearance; th?: boolean;
}

/**
 * A survivor. The local player is driven by input; remote players (co-op)
 * are driven by network snapshots but share the same visual + body model.
 */
export class Player {
  id: string;
  name: string;
  isLocal: boolean;
  zoneKey = '';
  x = 0; z = 0; y = 0;
  facing = 0;
  targetFacing = 0;
  vx = 0; vz = 0;
  speed = 0;
  radius = 0.26;
  body = new Body();
  app: Appearance;
  occupation = 'unemployed';
  inv: Container;
  worn = new Map<WearSlot, Item>();
  handR: Item | null = null;
  handL: Item | null = null;
  actions: ActionQueue;
  running = false;
  sneaking = false;
  aiming = false;
  stance: Stance = 'stand';
  full: FullBody = '';
  actionAnim: ActionAnim = '';
  actionT = 0; actionDur = 0;
  rig: HumanRig;
  anim = new HumanAnimator();
  flashlightOn = false;
  lightItem: Item | null = null;
  carrying: string | null = null;
  carriedBy: string | null = null;
  sittingOn: number | null = null;
  sleeping = false;
  attackCooldown = 0;
  exertionTimer = 0;
  lastStepPhase = 0;
  stepParity = 0;
  noiseAccum = 0;
  /** world-space aim point (mouse) */
  aimX = 0; aimZ = 0;
  remote?: { tx: number; tz: number; tf: number; t: number; state?: PlayerNetState };
  heldKeyR = ''; heldKeyL = '';
  outfitDirty = true;
  /** short-lived speech bubble */
  say: { text: string; until: number; kind: 'say' | 'think' | 'shout' | 'radio' } | null = null;
  inVehicle: string | null = null;
  kills = 0;
  daysSurvived = 0;
  spawnTime = 0;
  ghostT = 0;
  scannerOpen = false;
  footstepCb?: (p: Player) => void;

  constructor(id: string, name: string, app: Appearance, isLocal: boolean) {
    this.id = id; this.name = name; this.app = app; this.isLocal = isLocal;
    this.inv = new Container(uid(), 'Inventory', 'main', 50);
    this.inv.owner = 'player:' + id;
    this.actions = new ActionQueue(this);
    this.rig = new HumanRig(app);
    this.rig.root.userData.player = this;
  }

  get pos() { return new THREE.Vector3(this.x, this.y, this.z); }
  tileX() { return Math.floor(this.x); }
  tileY() { return Math.floor(this.z); }
  get alive() { return !this.body.dead; }

  // ---------------- inventory helpers ----------------
  /** every container the player carries: main + bags (worn or in hand) */
  containers(): Container[] {
    const out: Container[] = [this.inv];
    for (const it of this.inv.items) if (it.inv && (this.isWorn(it) || this.handR === it || this.handL === it)) out.push(it.inv);
    return out;
  }
  allItems(): Item[] {
    const out: Item[] = [];
    for (const c of this.containers()) for (const it of c.items) out.push(it);
    return out;
  }
  findItem(pred: (it: Item, d: ItemDef) => boolean): Item | undefined {
    for (const it of this.allItems()) if (pred(it, itemDef(it.key))) return it;
    return undefined;
  }
  /** tag lookup: '#hammer' style or plain key */
  findTool(tagOrKey: string, minUses = 0): Item | undefined {
    const tag = tagOrKey.startsWith('#') ? tagOrKey.slice(1) : null;
    return this.findItem((it, d) => {
      if (tag ? !(d.tags || []).includes(tag) && d.key !== tag : d.key !== tagOrKey) return false;
      if (minUses > 0 && (it.uses ?? 1) < minUses) return false;
      if (it.cond <= 0 && d.durability) return false;
      return true;
    });
  }
  containerOf(it: Item): Container | null {
    for (const c of this.containers()) if (c.items.includes(it)) return c;
    return null;
  }
  removeItem(it: Item) {
    const c = this.containerOf(it);
    if (c) c.remove(it);
    if (this.handR === it) this.handR = null;
    if (this.handL === it) this.handL = null;
    for (const [s, w] of this.worn) if (w === it) { this.worn.delete(s); this.outfitDirty = true; }
    if (this.lightItem === it) { this.lightItem = null; this.flashlightOn = false; }
  }
  addItem(it: Item, target?: Container): boolean {
    const c = target || this.inv;
    c.add(it);
    return true;
  }
  isWorn(it: Item) { for (const w of this.worn.values()) if (w === it) return true; return false; }
  wornSlot(it: Item): WearSlot | null { for (const [s, w] of this.worn) if (w === it) return s; return null; }

  /** carried weight: worn clothing counts 30%, bags count bag + reduced contents */
  carriedWeight(): number {
    let w = 0;
    for (const it of this.inv.items) {
      const d = itemDef(it.key);
      if (this.isWorn(it) && d.clothing) w += itemWeight(it) * 0.3;
      else w += itemWeight(it);
    }
    return w;
  }
  capacity() {
    let c = this.body.carryCapacity();
    return c;
  }
  heavyLoad(): number { return Math.max(0, this.carriedWeight() / this.capacity() - 1); }

  // ---------------- equipment ----------------
  equip(it: Item | null, hand: 'R' | 'L' = 'R') {
    if (it) {
      const d = itemDef(it.key);
      if (this.handR === it) this.handR = null;
      if (this.handL === it) this.handL = null;
      if (d.weapon?.twoHanded || d.heavy) { this.handR = it; this.handL = it; }
      else if (hand === 'R') { if (this.handL === this.handR) this.handL = null; this.handR = it; }
      else { if (this.handL === this.handR) this.handR = null; this.handL = it; }
      if (d.light) this.lightItem = it;
    } else {
      if (hand === 'R') { if (this.handL === this.handR) this.handL = null; this.handR = null; }
      else { if (this.handL === this.handR) this.handR = null; this.handL = null; }
    }
    if (this.lightItem && this.handR !== this.lightItem && this.handL !== this.lightItem && !this.isWorn(this.lightItem)) { this.lightItem = null; this.flashlightOn = false; }
    this.outfitDirty = true;
  }
  wear(it: Item) {
    const d = itemDef(it.key);
    let slot: WearSlot | null = null;
    if (d.clothing) slot = d.clothing.slot as WearSlot;
    else if (d.bag) slot = d.bag.slot === 'back' ? 'back' : d.bag.slot === 'belt' || d.bag.slot === 'hip' ? 'belt' : null;
    if (!slot) return false;
    const prev = this.worn.get(slot);
    if (prev) this.worn.delete(slot);
    if (this.handR === it) this.handR = null;
    if (this.handL === it) this.handL = null;
    this.worn.set(slot, it);
    this.outfitDirty = true;
    return true;
  }
  unwear(it: Item) { for (const [s, w] of this.worn) if (w === it) this.worn.delete(s); this.outfitDirty = true; }

  insulation(): number {
    let ins = 0, n = 0;
    for (const it of this.worn.values()) { const c = itemDef(it.key).clothing; if (c) { ins += c.insulation * (1 - (it.wet ?? 0) * 0.5); n++; } }
    return clamp(ins, 0, 1);
  }
  protection(part: string, kind: 'bite' | 'scratch'): number {
    let p = 0;
    for (const it of this.worn.values()) { const c = itemDef(it.key).clothing; if (c && (c.covers as string[]).includes(part)) p += c[kind] * (0.4 + 0.6 * it.cond); }
    return clamp(p, 0, 95);
  }

  /** visual outfit from worn items */
  computeOutfit(): Outfit {
    const o: Outfit = {};
    const look = (it?: Item) => it ? itemDef(it.key).clothing?.look : undefined;
    for (const [slot, it] of this.worn) {
      const d = itemDef(it.key);
      const l = d.clothing?.look;
      if (d.bag && slot === 'back') { o.back = { tex: 'c_backpack', color: d.tint ?? 0x4a5a6a, size: Math.min(1.2, 0.7 + d.bag.capacity / 40) }; continue; }
      if (!l) continue;
      const lp = { tex: l.tex, color: l.color, sleeve: l.sleeve };
      switch (l.part) {
        case 'torso':
          if (slot === 'torso_outer') o.torsoOuter = lp;
          else if (slot === 'torso' || !o.torso) o.torso = lp;
          break;
        case 'legs': o.legs = lp; o.legsKind = l.tex.includes('short') ? 'shorts' : l.tex.includes('skirt') ? 'skirt' : 'pants'; break;
        case 'feet': o.feet = lp; break;
        case 'hands': o.hands = lp; break;
        case 'head': o.head = { ...lp, hat: (l.hat as any) || (l.tex.includes('beanie') ? 'beanie' : l.tex.includes('hardhat') ? 'hardhat' : l.tex.includes('helmet') ? 'helmet' : 'cap') }; break;
        case 'eyes': o.eyes = lp; break;
        case 'face': o.face = lp; break;
        case 'back': o.back = { ...lp, size: 1 }; break;
      }
    }
    void look;
    return o;
  }

  refreshVisuals() {
    if (this.outfitDirty) {
      this.rig.setOutfit(this.computeOutfit());
      this.outfitDirty = false;
    }
    const kr = this.handR ? this.handR.key : '', kl = this.handL && this.handL !== this.handR ? this.handL.key : '';
    if (kr !== this.heldKeyR) { this.heldKeyR = kr; this.rig.hold('R', kr ? makeHeldMesh(kr) : null); }
    if (kl !== this.heldKeyL) { this.heldKeyL = kl; this.rig.hold('L', kl ? makeHeldMesh(kl) : null); }
  }

  actionMul(): number { return this.body.mods(this.heavyLoad()).action; }

  setOccupation(key: string) {
    this.occupation = key;
    const occ = occupationByKey(key);
    for (const [k, v] of Object.entries(occ.skills)) (this.body.skills as any)[k].level = Math.max((this.body.skills as any)[k].level, v as number);
    for (const p of occ.perks || []) this.body.perks.add(p);
  }

  // ---------------- per-frame visual update ----------------
  updateVisual(dt: number) {
    this.refreshVisuals();
    const m = this.body.mods(this.heavyLoad());
    const a = this.actions.current;
    let action: ActionAnim = this.actionAnim;
    let full: FullBody = this.full;
    if (a && a.started && !this.remote) { action = a.anim; full = a.full || full; this.actionT = a.t; this.actionDur = a.effDuration; }
    if (this.aiming && !action) {
      const w = this.handR ? itemDef(this.handR.key).weapon : undefined;
      action = w?.kind === 'firearm' ? 'aim_gun' : w?.kind === 'thrown' ? 'aim_throw' : 'aim_melee';
    }
    if (this.scannerOpen && !action) action = 'scanner';
    if (!action && this.handR && !this.aiming) {
      const d = itemDef(this.handR.key);
      if (d.light && this.flashlightOn) action = 'hold_light';
    }
    if (this.carrying && !action) action = 'carry';
    const pose = this.anim.update(dt, {
      speed: this.speed, stance: this.stance, full, action, actionT: this.actionT, actionDur: this.actionDur,
      twoHanded: !!(this.handR && this.handR === this.handL), limp: m.limp, tired: m.tired, panic: m.panic,
      cold: m.cold, aimPitch: 0, holdingLight: !!this.lightItem && this.flashlightOn && this.handR === this.lightItem,
      holding: !!this.handR, lookYaw: 0,
    });
    this.rig.applyPose(pose);
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = Math.PI / 2 - this.facing;
    // footsteps from locomotion phase
    const ph = this.anim.phase;
    const stepIdx = Math.floor(ph / Math.PI);
    if (stepIdx !== this.lastStepPhase) {
      this.lastStepPhase = stepIdx;
      if (this.speed > 0.3 && this.stance !== 'swim' && !full) this.footstepCb?.(this);
    }
  }

  /** smoothly turn toward target facing */
  turn(dt: number, rate = 14) { this.facing = dampAngle(this.facing, this.targetFacing, rate, dt); this.facing = wrapAngle(this.facing); }

  envDefaults(): Env {
    return {
      ambient: 21, insulation: this.insulation(), windExposed: false, raining: false, inWater: 'none', floorWet: 0,
      exertion: 0, moving: false, running: false, resting: false, asleep: false, bedQuality: 0, nearFire: 0,
      lightLevel: 1, darkness: false, nearTeam: 0, threat: 0, anomaly: 0, corruptZone: 0, collapse: 0,
      smallRoom: false, openSpace: false, entertained: false, heavyLoad: this.heavyLoad(),
    };
  }

  netState(): PlayerNetState {
    return {
      x: +this.x.toFixed(3), z: +this.z.toFixed(3), f: +this.facing.toFixed(3), sp: +this.speed.toFixed(2), st: this.stance,
      fb: this.full || (this.actions.current?.started ? this.actions.current.full : '') || '', ac: (this.actions.current?.started ? this.actions.current.anim : '') || (this.aiming ? 'aim_melee' : ''),
      at: this.actions.current?.t ?? 0, ad: this.actions.current?.effDuration ?? 0,
      run: this.running, light: this.flashlightOn, hr: this.handR?.key || '', hl: this.handL && this.handL !== this.handR ? this.handL.key : '',
      out: this.computeOutfit(), down: this.body.downed, dead: this.body.dead, zone: this.zoneKey, aim: this.aiming,
      carry: this.carrying || undefined, carriedBy: this.carriedBy || undefined, name: this.name, app: this.app, th: this.scannerOpen,
    };
  }
}

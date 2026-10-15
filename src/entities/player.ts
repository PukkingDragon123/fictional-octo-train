import * as THREE from 'three';
import { Body, Env, INJURY_INFO } from '../survival/body';
import { HumanRig, Appearance, Outfit, RigCondition } from './humanRig';
import { HumanAnimator, Stance, FullBody, ActionAnim } from './humanAnim';
import { ActionQueue } from '../actions/action';
import { Container } from '../items/container';
import { Item, itemDef, itemWeight, ItemDef, BODY_PARTS } from '../items/item';
import { makeHeldMesh } from '../items/itemMeshes';
import { uid } from '../core/rng';
import { clamp, dampAngle, wrapAngle } from '../core/math';
import { occupationByKey } from '../survival/traits';

// item clothing slots (one item each): layered torso tshirt < shirt < sweater < jacket
export const WEAR_SLOTS = ['hat', 'eyes', 'mask', 'neck', 'tshirt', 'shirt', 'sweater', 'jacket', 'fullsuit', 'hands', 'pants', 'socks', 'shoes', 'back', 'belt', 'wrist',
  'head', 'face', 'torso_inner', 'torso', 'torso_outer', 'legs', 'feet'] as const;
export type WearSlot = typeof WEAR_SLOTS[number];

export interface PlayerNetState {
  x: number; z: number; f: number; sp: number; st: Stance; fb: FullBody; ac: ActionAnim; at: number; ad: number;
  run: boolean; light: boolean; hr: string; hl: string; out: Outfit; down: boolean; dead: boolean; zone: string; aim: boolean;
  carry?: string; carriedBy?: string; name: string; app: Appearance; th?: boolean; veh?: string;
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
  /** the rig's animator (rig.anim) */
  anim: HumanAnimator;
  /** visible condition mirrored onto the model (blood, bandages, splints, wet, pallor...) */
  cond: RigCondition | undefined;
  private condT = 0; private condKey = ''; private lastHealth = 100; private visT = 0; private lastNetT = -1; private lastAnim = '';
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
    this.anim = this.rig.anim;
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

  /** visual outfit from worn items (plus the visible condition for the local survivor) */
  computeOutfit(): Outfit {
    const o: Outfit = {};
    let torsoRank = -1, feetRank = -1;
    let suit: Outfit['torso'] | null = null;
    const q = (v: number | undefined, steps = 4) => (v && v > 0.05 ? Math.round(v * steps) / steps : undefined);
    for (const [slot, it] of this.worn) {
      const d = itemDef(it.key);
      const l = d.clothing?.look;
      if (d.bag && slot === 'back') { o.back = { tex: l?.tex || 'c_backpack', color: l?.color ?? d.tint ?? 0x4a5a6a, size: Math.min(1.2, 0.7 + d.bag.capacity / 40), item: it.key }; continue; }
      if (!l) continue;
      const lp = { tex: l.tex, color: l.color, sleeve: l.sleeve, item: it.key, blood: q(it.bloody), wear: it.cond < 0.6 ? q(1 - it.cond) : undefined };
      switch (l.part) {
        case 'torso': {
          // layers: tshirt < shirt < sweater, jacket drawn over them; coveralls paint torso and legs
          if (slot === 'jacket' || slot === 'torso_outer') { o.torsoOuter = lp; break; }
          const rank = ({ fullsuit: 0, tshirt: 1, torso_inner: 1, shirt: 2, torso: 2, sweater: 3 } as Record<string, number>)[slot] ?? 2;
          if (!o.torso || rank >= torsoRank) { o.torso = lp; torsoRank = rank; }
          if (slot === 'fullsuit') suit = lp;
          break;
        }
        case 'legs': o.legs = lp; o.legsKind = l.tex.includes('short') ? 'shorts' : l.tex.includes('skirt') ? 'skirt' : 'pants'; break;
        case 'feet': { const rank = slot === 'socks' ? 0 : 1; if (rank >= feetRank) { o.feet = lp; feetRank = rank; } break; }
        case 'hands': o.hands = lp; break;
        case 'head': o.head = { ...lp, hat: (l.hat as any) || (l.tex.includes('beanie') ? 'beanie' : l.tex.includes('hardhat') ? 'hardhat' : l.tex.includes('helmet') ? 'helmet' : 'cap') }; break;
        case 'eyes': o.eyes = lp; break;
        case 'face': if (!o.face || slot === 'mask') o.face = lp; break;
        case 'back': o.back = { ...lp, size: 1 }; break;
      }
    }
    if (suit && !o.legs) { o.legs = { tex: suit.tex, color: suit.color, item: suit.item, blood: suit.blood, wear: suit.wear }; o.legsKind = 'pants'; }
    if (this.cond) o.cond = this.cond;
    return o;
  }

  /** visible condition from the body: blood on wounded parts, bandages, splints, wetness, pallor, corruption */
  computeCondition(): RigCondition {
    const b = this.body;
    const c: RigCondition = {};
    const blood: Record<string, number> = {}, bandage: Record<string, number> = {}, bleeding: Record<string, number> = {};
    const splint: string[] = [];
    for (const part of BODY_PARTS) {
      for (const inj of b.parts[part].injuries) {
        if (inj.heal > 0.85) continue;
        const bl = b.injuryBleed(inj);
        const info = INJURY_INFO[inj.type];
        if (info.bleed > 0 && !inj.bandage) blood[part] = Math.max(blood[part] ?? 0, Math.min(3, Math.max(1, Math.round((inj.sev * 2.2 + (bl > 0.3 ? 1 : 0)) * (1 - inj.heal * 0.8)))));
        if (inj.bandage) bandage[part] = Math.max(bandage[part] ?? 0, inj.bandage.soak > 0.7 ? 2 : inj.bandage.soak > 0.3 ? 1.5 : 1);
        if (inj.splinted && !splint.includes(part)) splint.push(part);
        if (bl > 0.02) bleeding[part] = Math.max(bleeding[part] ?? 0, bl > 0.5 ? 3 : bl > 0.2 ? 2 : 1);
      }
    }
    if (Object.keys(blood).length) c.blood = blood;
    if (Object.keys(bandage).length) c.bandage = bandage;
    if (Object.keys(bleeding).length) c.bleeding = bleeding;
    if (splint.length) c.splint = splint.sort();
    const lv = (v: number, a: number, b2: number, c3: number) => (v >= c3 ? 3 : v >= b2 ? 2 : v >= a ? 1 : 0);
    const wet = lv(b.wetness, 15, 40, 70); if (wet) c.wet = wet;
    const pale = lv(100 - b.blood, 25, 45, 65); if (pale) c.pale = pale;
    const cor = lv(b.corruption, 10, 40, 70); if (cor) c.corrupt = cor;
    if (!b.dead) { if (b.downed || b.pain() > 65) c.expr = 'pain'; else if (b.panic > 70) c.expr = 'fear'; }
    return c;
  }

  refreshVisuals() {
    if (this.outfitDirty) {
      // remote survivors get their look (and condition) from the network snapshot, not from an empty worn map
      if (!this.remote) this.rig.setOutfit(this.computeOutfit());
      this.outfitDirty = false;
    }
    const kr = this.handR ? this.handR.key : '', kl = this.handL && this.handL !== this.handR ? this.handL.key : '';
    const grip = (k: string) => { const d = itemDef(k); return d.weapon?.kind === 'firearm' || d.light ? 'along' as const : d.weapon && d.weapon.kind !== 'thrown' || d.tags?.includes('tool') ? 'perp' as const : 'auto' as const; };
    if (kr !== this.heldKeyR) { this.heldKeyR = kr; this.rig.hold('R', kr ? makeHeldMesh(kr) : null, kr ? grip(kr) : 'auto'); }
    if (kl !== this.heldKeyL) { this.heldKeyL = kl; this.rig.hold('L', kl ? makeHeldMesh(kl) : null, kl ? grip(kl) : 'auto'); }
  }

  actionMul(): number { return this.body.mods(this.heavyLoad()).action; }

  setOccupation(key: string) {
    this.occupation = key;
    const occ = occupationByKey(key);
    for (const [k, v] of Object.entries(occ.skills)) (this.body.skills as any)[k].level = Math.max((this.body.skills as any)[k].level, v as number);
    for (const p of occ.perks || []) this.body.perks.add(p);
  }

  // ---------------- per-frame visual update
  updateVisual(dt: number) {
    const local = !this.remote;
    if (local) {
      // visible condition follows the body twice a second (repaints only when something visible changed)
      this.condT -= dt;
      if (this.condT <= 0) {
        this.condT = 0.5;
        const c = this.computeCondition();
        const k = JSON.stringify(c);
        if (k !== this.condKey) { this.condKey = k; this.cond = Object.keys(c).length ? c : undefined; this.outfitDirty = true; }
      }
      if (this.body.health < this.lastHealth - 1.5) this.rig.fx.value.z = 0.8;
      this.lastHealth = this.body.health;
      this.rig.fx.value.x = this.body.corruption > 10 ? Math.min(1, (this.body.corruption - 10) / 80) : 0;
    } else {
      const cr = this.rig.outfit.cond?.corrupt ?? 0;
      this.rig.fx.value.x = cr ? cr / 3 : 0;
    }
    this.rig.fx.value.z = Math.max(0, this.rig.fx.value.z - dt * 4);
    this.refreshVisuals();
    const m = this.body.mods(this.heavyLoad());
    const a = this.actions.current;
    let action: ActionAnim = this.actionAnim;
    let full: FullBody = this.full;
    if (a && a.started && !this.remote) { action = a.anim; full = a.full || full; this.actionT = a.t; this.actionDur = a.effDuration; this.visT = a.t; }
    else if (action) {
      // combat swings / remote actions: run the clock locally between updates
      if (this.remote) { if (this.actionT !== this.lastNetT || action !== this.lastAnim) { this.lastNetT = this.actionT; this.visT = this.actionT; } else this.visT += dt; }
      else { if (action !== this.lastAnim) this.visT = this.actionT; else this.visT += dt; this.actionT = this.visT; }
    }
    this.lastAnim = action;
    const w = this.handR ? itemDef(this.handR.key).weapon : undefined;
    if (this.aiming && (!action || action === 'aim_melee')) {
      action = w?.kind === 'firearm' ? 'aim_gun' : w?.kind === 'thrown' ? 'aim_throw' : 'aim_melee';
    }
    if (this.scannerOpen && !action) action = 'scanner';
    if (!action && this.handR && !this.aiming) {
      const d = itemDef(this.handR.key);
      if (d.light && this.flashlightOn) action = 'hold_light';
    }
    if (this.carrying && !action) action = 'carry';
    if (!full) {
      if (this.body.dead) full = 'dead';
      else if (this.carriedBy) full = 'carried';
      else if (this.body.downed && this.speed < 0.08) full = 'downed';
    }
    if (this.sleeping && !full) full = 'lie';
    // which leg / arm hurts (for the limp side and a cradled arm)
    let limpSide: 'L' | 'R' | undefined, armL = 0, armR = 0;
    if (local && (m.limp > 0.05 || this.body.armPenalty() > 0.1)) {
      const dmg = (ps: string[]) => ps.reduce((s, p) => s + this.body.partDamage(p as any), 0);
      limpSide = dmg(['thigh_l', 'shin_l', 'foot_l']) >= dmg(['thigh_r', 'shin_r', 'foot_r']) ? 'L' : 'R';
      const frac = (p: string[]) => Math.min(1, p.reduce((s, q) => s + this.body.parts[q as 'farm_l'].injuries.filter((i) => i.type === 'fracture' && i.heal < 0.8).length, 0) * 0.8 + dmg(p) / 120);
      armL = frac(['uarm_l', 'farm_l']); armR = frac(['uarm_r', 'farm_r']);
    }
    const prevF = this.rig.root.rotation.y;
    this.rig.animate(dt, {
      speed: this.speed, stance: this.stance, full, action, actionT: this.visT, actionDur: this.actionDur,
      twoHanded: !!(this.handR && this.handR === this.handL), limp: m.limp, tired: m.tired, panic: m.panic,
      cold: m.cold, aimPitch: 0, holdingLight: !!this.lightItem && this.flashlightOn && this.handR === this.lightItem,
      holding: !!this.handR, heldL: !!this.handL && this.handL !== this.handR, lookYaw: 0,
      weapon: w ? w.kind : this.handR ? 'tool' : 'unarmed', limpSide, armHurtL: armL, armHurtR: armR,
      exhausted: local ? Math.max(0, 1 - this.body.endurance / 0.3) : 0, drunk: m.drunk, hot: local && this.body.temp > 37.6 ? Math.min(1, (this.body.temp - 37.4) / 1.5) : 0,
      turn: dt > 0 ? wrapAngle(Math.PI / 2 - this.facing - prevF) / dt : 0, hasWatch: [...this.worn.keys()].includes('wrist'),
      unconscious: this.body.dead || (this.body.downed && this.body.downedTime > 30),
    });
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

  /** play an emote (wave, flex, dance, jumping_jacks, shrug, salute, point, facepalm, sit_wait, cheer, clap, bow); mirrored to co-op peers */
  emote(name: string, loop?: boolean) { return this.rig.playEmote(name, loop); }

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

  /** action animation as mirrored to peers: timed actions, combat swings, then emotes */
  private netAnim(): { ac: ActionAnim; at: number; ad: number } {
    const cur = this.actions.current;
    if (cur?.started && cur.anim) return { ac: cur.anim, at: +cur.t.toFixed(2), ad: +cur.effDuration.toFixed(2) };
    if (this.actionAnim) return { ac: this.actionAnim, at: +this.actionT.toFixed(2), ad: +this.actionDur.toFixed(2) };
    const e = this.anim.emoteState;
    if (e) return { ac: ('emote:' + e.name) as ActionAnim, at: +e.t.toFixed(2), ad: 0 };
    return { ac: '', at: 0, ad: 0 };
  }

  netState(): PlayerNetState {
    return {
      x: +this.x.toFixed(3), z: +this.z.toFixed(3), f: +this.facing.toFixed(3), sp: +this.speed.toFixed(2), st: this.stance,
      fb: this.full || (this.actions.current?.started ? this.actions.current.full : '') || '',
      ...this.netAnim(),
      run: this.running, light: this.flashlightOn, hr: this.handR?.key || '', hl: this.handL && this.handL !== this.handR ? this.handL.key : '',
      out: this.computeOutfit(), down: this.body.downed, dead: this.body.dead, zone: this.zoneKey, aim: this.aiming,
      carry: this.carrying || undefined, carriedBy: this.carriedBy || undefined, name: this.name, app: this.app, th: this.scannerOpen, veh: this.inVehicle || undefined,
    };
  }
}

import * as THREE from 'three';
import { Body, Env, INJURY_INFO } from '../survival/body';
import { HumanRig, Appearance, Outfit, RigCondition } from './humanRig';
import { HumanAnimator, Stance, FullBody, ActionAnim, AnimInput, ANIM_DUR } from './humanAnim';
import { groundFn, ragWorldFor, pickLook, lodFor, gameTime, LookTarget } from './humanWorld';
import { ActionQueue } from '../actions/action';
import { Container } from '../items/container';
import { Item, itemDef, itemWeight, ItemDef, BODY_PARTS } from '../items/item';
import { makeHeldMesh } from '../items/itemMeshes';
import { uid } from '../core/rng';
import { bus } from '../core/events';
import { clamp, dampAngle, wrapAngle } from '../core/math';
import { occupationByKey } from '../survival/traits';
import { cutParts, PROSTHETICS, prostFits, lossLevel, chainOf, Side, StumpCond, StumpLook } from '../survival/limbs';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { crutchHeldModel } from './limbGear';
import { size3 } from '../items/grid';

/** elbow crutch held in the fist (shared geometry) */
const CRUTCH_GEO: Record<string, THREE.BufferGeometry> = {};
function crutchMesh(key: string, s: number): THREE.Object3D {
  const wood = key.includes('wood');
  const k = (wood ? 'w' : 'a') + Math.round(s * 100);
  if (!CRUTCH_GEO[k]) { const mb = new ModelBuilder(); crutchHeldModel(mb, wood, s); CRUTCH_GEO[k] = mb.build(); }
  const m = new THREE.Mesh(CRUTCH_GEO[k], worldMaterial({}));
  m.castShadow = true;
  return m;
}
const isCrutchKey = (k: string) => !!k && (itemDef(k).tags || []).includes('crutch');

// item clothing slots (one item each): layered torso tshirt < shirt < sweater < jacket
export const WEAR_SLOTS = ['hat', 'eyes', 'mask', 'neck', 'tshirt', 'shirt', 'sweater', 'jacket', 'fullsuit', 'hands', 'pants', 'socks', 'shoes', 'back', 'belt', 'wrist',
  'head', 'face', 'torso_inner', 'torso', 'torso_outer', 'legs', 'feet'] as const;
export type WearSlot = typeof WEAR_SLOTS[number];

// gore splashes and panic attacks show on the body (each peer handles its own survivor's look)
bus.on('bloodied', (p: Player, part: string, amount: number) => { if (p && typeof p.bloodied === 'function') p.bloodied(part, amount); });
bus.on('panicAttack', (p: Player) => { p?.anim?.panicAttack?.(); });
// a creature's blow lands on the local survivor: a procedural reaction (mirrored to peers through netState)
bus.on('playerHit', (p: Player, part: string, _kind: string, h: { dmg?: number; knock?: number; from?: [number, number] }) => {
  if (p && typeof p.registerHit === 'function' && h?.from) p.registerHit(h.from[0], h.from[1], part, (h.dmg ?? 10) / 28 + (h.knock ?? 0) * 0.35);
});
// the BAILIFF band (debt contract): a shock jolts its wearer; a detonation throws the arm (emitted on every peer)
const bandPlayer = (e: any): Player | undefined => (typeof e?.id === 'string' ? (globalThis as any).__game?.players?.get?.(e.id) : undefined);
bus.on('bandShock', (e: { id: string; strength?: number }) => {
  // the owner plays it (peers see it through netState); skipped when a timed 'shocked' action already runs
  const p = bandPlayer(e);
  if (p && p.isLocal && !p.body.dead && !p.actions.list.some((a) => a.anim === 'shocked')) p.playAnim('shocked', 0.8 + Math.min(1, e.strength ?? 0.5) * 0.8);
});
bus.on('bandDetonate', (e: { id: string }) => { const p = bandPlayer(e); if (p) p.blast(p.x + Math.cos(p.facing + 1.2) * 0.3, p.z + Math.sin(p.facing + 1.2) * 0.3, 'hand_l', 1.6); });

const BODY_PART_KEYS: readonly string[] = BODY_PARTS as readonly string[];
const _vel = new THREE.Vector3(), _imp = new THREE.Vector3();

export interface PlayerNetState {
  x: number; z: number; f: number; sp: number; st: Stance; fb: FullBody; ac: ActionAnim; at: number; ad: number;
  run: boolean; light: boolean; hr: string; hl: string; out: Outfit; down: boolean; dead: boolean; zone: string; aim: boolean;
  carry?: string; carriedBy?: string; name: string; app: Appearance; th?: boolean; veh?: string;
  /** last blow taken: [sequence, push direction (world radians), body part index, strength] — peers replay the reaction / ragdoll */
  hx?: [number, number, number, number];
  /** item in hand for the current eat / drink animation */
  ai?: string;
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
  private condT = 0; private condKey = ''; private lastHealth = 100; private visT = 0; private lastNetT = -1; private lastAnim: string = '';
  /** blood splashed onto body parts (0..1), fading over a few minutes */
  splash: Record<string, number> = {};

  /** recompute the visible condition (limb loss, treatment) on the next frame */
  refreshCondition() { this.condT = 0; }

  /** gore hit / splash on a body part: stains the skin there and soaks the garment covering it */
  bloodied(part: string, amount: number) {
    if (this.remote) return;
    this.splash[part] = Math.min(1, Math.max(this.splash[part] ?? 0, amount) + amount * 0.25);
    let best: Item | null = null, rank = -1;
    const order = ['tshirt', 'shirt', 'sweater', 'fullsuit', 'jacket', 'pants', 'shoes', 'hands', 'hat'];
    for (const [slot, it] of this.worn) {
      const c = itemDef(it.key).clothing;
      if (!c || !(c.covers as string[]).includes(part)) continue;
      const r = order.indexOf(slot);
      if (r > rank) { rank = r; best = it; }
    }
    if (best) { best.bloody = Math.min(1, (best.bloody ?? 0) + amount * 0.3); this.outfitDirty = true; }
    this.condT = 0;
  }
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
    this.rig = new HumanRig(app, undefined, { secondary: true });
    this.anim = this.rig.anim;
    this.rig.root.userData.player = this;
    this.rig.ragWorld = ragWorldFor(this);
    this.groundAt = groundFn(this);
  }

  // ---------------- animation helpers (src/entities/humanAnim.ts)
  private groundAt: (x: number, z: number) => number;
  private animIn: AnimInput = {
    speed: 0, stance: 'stand', full: '', action: '', actionT: 0, actionDur: 0, twoHanded: false, limp: 0, tired: 0, panic: 0, cold: 0,
    aimPitch: 0, holdingLight: false, holding: false, lookYaw: 0,
  };
  private look: LookTarget = { x: 0, y: 0, z: 0, w: 0, until: 0, kind: '', id: '' };
  private lookOn = false; private lookT = 0;
  private visY = NaN;
  private wasDead = false; private wasDown = false;
  private lastSteps = 0;
  private oneShot: { name: string; dur: number } | null = null;
  private propKey = '';
  /** the last blow (for peers and for which way the body falls) */
  private hitSeq = 0; private hitSeen = -1;
  private lastHit = { dx: 0, dz: 0, part: '', s: 0, t: -99 };

  /**
   * Play a named animation once (or for dur seconds if it loops): 'push',
   * 'drag', 'smash', 'kick_obj', 'eat', 'drink', 'dragged', 'beaten', 'kneel',
   * 'fall_land', 'get_up', 'stagger', 'shocked', 'flinch' and every other
   * ActionAnim name. Mirrored to co-op peers; unknown names just play nothing.
   * A running TimedAction's own anim takes precedence while it runs.
   */
  playAnim(name: string, dur?: number) {
    const d = dur ?? ANIM_DUR[name] ?? 1;
    this.actionAnim = name as ActionAnim; this.actionT = 0; this.actionDur = d; this.visT = 0; this.lastAnim = name;
    this.oneShot = { name, dur: d };
  }
  /** stop a playAnim() early */
  stopAnim(name?: string) { if (this.oneShot && (!name || this.oneShot.name === name)) { if (this.actionAnim === this.oneShot.name) this.actionAnim = ''; this.oneShot = null; } }

  /** a blow from (fromX, fromZ) on a body part: the body reacts (and its fall, if it dies, goes the right way) */
  registerHit(fromX: number, fromZ: number, part: string, strength: number) {
    let dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = -Math.cos(this.facing); dz = -Math.sin(this.facing); } else { dx /= d; dz /= d; }
    const s = clamp(strength, 0.15, 1.5);
    this.hitSeq++;
    this.lastHit = { dx, dz, part, s, t: gameTime() };
    this.rig.hit(dx, dz, part, s);
  }
  /** an explosion at (x, z): a violent reaction, and the direction a ragdoll will be thrown */
  blast(x: number, z: number, part: string, strength: number) { this.registerHit(x, z, part, strength); }

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
  private packSlowT = -1e9; private packSlowV = 1;
  /** walking pace from what you carry (1 = unburdened): weight against what you can carry, and how full the iron cube is */
  packSlow(): number {
    const now = performance.now();
    if (now - this.packSlowT < 250) return this.packSlowV;
    this.packSlowT = now;
    const load = this.carriedWeight() / Math.max(1, this.capacity());
    const back = this.worn.get('back');
    let fill = 0;
    if (back?.inv && back.key === 'iron_cube') { let v = 0; for (const it of back.inv.items) { const s = size3(it.key); v += s[0] * s[1] * s[2]; } fill = Math.min(1, v / 125); }
    const k = clamp((load - 0.3) / 0.7, 0, 1);
    this.packSlowV = clamp(1 - 0.26 * k * k * (3 - 2 * k) - 0.14 * Math.pow(fill, 1.4), 0.55, 1);
    return this.packSlowV;
  }

  // ---------------- equipment ----------------
  equip(it: Item | null, hand: 'R' | 'L' = 'R') {
    if (it && this.body.severed.length) {
      // limb loss (src/survival/limbs.ts): one hand means one slot (the main one); two-handed things need two hands or a hook
      const L = this.body.limbs();
      const d = itemDef(it.key);
      if (L.hands === 0) { if (this.isLocal) bus.emit('think', this, 'I have no hands to hold it with.'); return; }
      if ((d.weapon?.twoHanded || d.heavy) && !L.twoHand) { if (this.isLocal) bus.emit('think', this, 'I can\'t hold that with one hand.'); return; }
      if (L.hands === 1) {
        hand = 'R';
        if (this.handL && this.handL !== this.handR) { const o = this.handL; this.handL = null; if (!this.handR) this.handR = o; }
      }
    }
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
    const pd = PROSTHETICS[it.key];
    if (pd) {
      // strapped onto the stump it fits (a side that is not already wearing one)
      const sides = (['l', 'r'] as Side[]).filter((sd) => prostFits(it.key, pd.limb, lossLevel(this.body.severed, pd.limb, sd)) && !this.worn.has(`prosth_${pd.limb}_${sd}` as WearSlot));
      if (!sides.length) { if (this.isLocal) bus.emit('think', this, this.body.severed.length ? 'It doesn\'t fit what I\'ve lost.' : 'I don\'t need that. Thank god.'); return false; }
      const raw = this.body.allInjuries().some((i) => i.type === 'amputation' && chainOf(i.part)?.kind === pd.limb && !i.stitched && !i.caut && i.heal < 0.35);
      if (raw) { if (this.isLocal) bus.emit('think', this, 'The stump is still an open wound. It needs closing first.'); return false; }
      slot = `prosth_${pd.limb}_${sides[0]}` as WearSlot;
    }
    else if (d.bag) slot = d.bag.slot === 'back' ? 'back' : d.bag.slot === 'belt' || d.bag.slot === 'hip' ? 'belt' : null;
    if (!slot) return false;
    const prev = this.worn.get(slot);
    // the Remittance cube is bolted to its harness: other packs get carried, not swapped in
    if (prev && prev !== it && prev.key === 'iron_cube' && it.key !== 'iron_cube') { if (this.isLocal) bus.emit('think', this, 'The cube is bolted to my harness. That one goes in my hands.'); return false; }
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
      if (slot === 'wrist') { o.wrist = { tex: l?.tex || 'watch', color: l?.color ?? 0x2e2a26, item: it.key }; continue; }
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
    // fresh splashes (gore 'bloodied' events) on top of the wounds' own stains
    for (const [part, v] of Object.entries(this.splash)) if (v > 0.05) blood[part] = Math.max(blood[part] ?? 0, Math.min(3, Math.ceil(v * 3)));
    if (Object.keys(blood).length) c.blood = blood;
    if (Object.keys(bandage).length) c.bandage = bandage;
    if (Object.keys(bleeding).length) c.bleeding = bleeding;
    if (splint.length) c.splint = splint.sort();
    const lv = (v: number, a: number, b2: number, c3: number) => (v >= c3 ? 3 : v >= b2 ? 2 : v >= a ? 1 : 0);
    const wet = lv(b.wetness, 15, 40, 70); if (wet) c.wet = wet;
    const pale = lv(100 - b.blood, 25, 45, 65); if (pale) c.pale = pale;
    const cor = lv(b.corruption, 10, 40, 70); if (cor) c.corrupt = cor;
    if (!b.dead) { if (b.downed || b.pain() > 65) c.expr = 'pain'; else if (b.panic > 70) c.expr = 'fear'; }
    // limb loss: what is gone, how each stump looks, prosthetics (mirrored to co-op peers through the outfit)
    if (b.severed.length) {
      c.sev = [...b.severed].sort();
      const stump: Record<string, StumpCond & { id?: number }> = {};
      for (const cut of cutParts(b.severed)) {
        const inj = b.parts[cut].injuries.find((i) => i.type === 'amputation');
        let look: StumpLook = 'healed';
        if (inj) look = inj.bandage ? (inj.bandage.soak > 0.6 || !inj.bandage.clean ? 'bandb' : 'band') : inj.stitched ? 'stitch' : inj.caut ? 'caut' : 'raw';
        const sc: StumpCond & { id?: number } = { s: look };
        if (inj && inj.tq != null) sc.tq = 1;
        if (inj) sc.id = inj.id;
        stump[cut] = sc;
      }
      c.stump = stump;
      const pr = b.limbAids?.prost;
      if (pr && Object.keys(pr).length) c.prost = { ...pr } as Record<string, string>;
    }
    return c;
  }

  refreshVisuals() {
    if (this.outfitDirty) {
      // remote survivors get their look (and condition) from the network snapshot, not from an empty worn map
      if (!this.remote) this.rig.setOutfit(this.computeOutfit());
      this.outfitDirty = false;
    }
    // with the right hand gone, the main item sits in the left hand (the animation mirrors to match)
    const mirror = this.body.severed.length ? this.body.limbs().mirror : false;
    // what is being eaten / drunk shows in the free hand while the animation plays
    const main = this.handR ? this.handR.key : this.propKey, off = this.handL && this.handL !== this.handR ? this.handL.key : '';
    const kr = mirror ? off : main, kl = mirror ? main : off;
    const grip = (k: string) => { const d = itemDef(k); return d.weapon?.kind === 'firearm' || d.light ? 'along' as const : d.weapon && d.weapon.kind !== 'thrown' || d.tags?.includes('tool') ? 'perp' as const : 'auto' as const; };
    const mesh = (k: string) => (isCrutchKey(k) ? crutchMesh(k, this.rig.s) : makeHeldMesh(k));
    if (kr !== this.heldKeyR) { this.heldKeyR = kr; this.rig.hold('R', kr ? mesh(kr) : null, kr ? (isCrutchKey(kr) ? 'raw' : grip(kr)) : 'auto'); }
    if (kl !== this.heldKeyL) { this.heldKeyL = kl; this.rig.hold('L', kl ? mesh(kl) : null, kl ? (isCrutchKey(kl) ? 'raw' : grip(kl)) : 'auto'); }
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
      for (const k in this.splash) { this.splash[k] -= dt / 240; if (this.splash[k] <= 0) delete this.splash[k]; }
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
      // a peer's survivor took a blow: replay the reaction
      const hx = this.remote?.state?.hx;
      if (hx && hx[0] !== this.hitSeen) {
        if (this.hitSeen !== -1) {
          const part = BODY_PART_KEYS[hx[2]] ?? 'torso_u';
          this.lastHit = { dx: Math.cos(hx[1]), dz: Math.sin(hx[1]), part, s: hx[3], t: gameTime() };
          this.rig.hit(this.lastHit.dx, this.lastHit.dz, part, hx[3]);
          this.rig.fx.value.z = Math.max(this.rig.fx.value.z, 0.6);
        }
        this.hitSeen = hx[0];
      }
    }
    this.rig.fx.value.z = Math.max(0, this.rig.fx.value.z - dt * 4);
    const a = this.actions.current;
    const eating = a && a.started && (a.anim === 'eat' || a.anim === 'drink') ? ((a as any).it?.key as string | undefined) : undefined;
    this.propKey = local ? (eating || '') : (this.remote?.state?.ai || '');
    this.refreshVisuals();
    const m = this.body.mods(this.heavyLoad());
    let action: ActionAnim = this.actionAnim;
    let full: FullBody = this.full;
    if (a && a.started && !this.remote) { action = a.anim; full = a.full || full; this.actionT = a.t; this.actionDur = a.effDuration; this.visT = a.t; }
    else if (action) {
      // combat swings / remote actions / playAnim one-shots: run the clock locally between updates
      if (this.remote) { if (this.actionT !== this.lastNetT || action !== this.lastAnim) { this.lastNetT = this.actionT; this.visT = this.actionT; } else this.visT += dt; }
      else { if (action !== this.lastAnim) this.visT = this.actionT; else this.visT += dt; this.actionT = this.visT; }
      // a playAnim() one-shot ends by itself
      const os = this.oneShot;
      if (os && !this.remote && action === os.name && this.visT >= os.dur) { this.actionAnim = ''; action = ''; this.oneShot = null; }
    }
    if (this.oneShot && this.actionAnim !== this.oneShot.name) this.oneShot = null;
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
    // missing limbs: hop, crutches, a peg's stiff limp, one-armed poses (src/survival/limbs.ts)
    const LS = this.body.severed.length || this.body.limbAids?.crutchL || this.body.limbAids?.crutchR ? this.body.limbs() : null;
    let limp = m.limp;
    if (LS) {
      if (LS.gait === 'peg') { limp = Math.max(limp, 0.42); limpSide = LS.legProst.l === 'peg' ? 'L' : 'R'; }
      else if (LS.gait === 'prosthetic') { limp = Math.max(limp, 0.14); limpSide = LS.legProst.l ? 'L' : 'R'; }
    }
    if (local && !LS && (m.limp > 0.05 || this.body.armPenalty() > 0.1)) {
      const dmg = (ps: string[]) => ps.reduce((s, p) => s + this.body.partDamage(p as any), 0);
      limpSide = dmg(['thigh_l', 'shin_l', 'foot_l']) >= dmg(['thigh_r', 'shin_r', 'foot_r']) ? 'L' : 'R';
      const frac = (p: string[]) => Math.min(1, p.reduce((s, q) => s + this.body.parts[q as 'farm_l'].injuries.filter((i) => i.type === 'fracture' && i.heal < 0.8).length, 0) * 0.8 + dmg(p) / 120);
      armL = frac(['uarm_l', 'farm_l']); armR = frac(['uarm_r', 'farm_r']);
    }
    // place the root first: the feet are planted in the world and the ragdoll works in world space
    const prevF = this.rig.root.rotation.y;
    const yaw = Math.PI / 2 - this.facing;
    if (Number.isNaN(this.visY) || Math.abs(this.visY - this.y) > 1.5 || local) this.visY = this.y;
    else this.visY += (this.y - this.visY) * (1 - Math.exp(-14 * dt));
    this.rig.root.position.set(this.x, this.visY, this.z);
    this.rig.root.rotation.y = yaw;
    const lod = lodFor(this);
    // something worth looking at (a few times a second)
    const now = gameTime();
    this.lookT -= dt;
    if (this.lookT <= 0 && lod < 2) {
      this.lookT = 0.25 + Math.random() * 0.15;
      if (this.isLocal && this.aiming) { this.look.x = this.aimX; this.look.z = this.aimZ; this.look.y = this.y + 1.1; this.look.w = 1; this.look.id = 'aim'; this.lookOn = true; }
      else this.lookOn = !!pickLook(this, this.look, now);
    }
    // bleeding wound to press a hand on (the worst one), hunger, sickness
    let clutch: string | undefined;
    const bl = this.rig.outfit.cond?.bleeding;
    if (bl) {
      let best = 0;
      for (const k in bl) if (bl[k] > best) { best = bl[k]; clutch = k; }
      // a trickle on a limb is left alone; the trunk, the head or a real bleed gets a hand on it
      if (clutch && best < 2 && !/^(torso|groin|head|neck)/.test(clutch)) clutch = undefined;
    }
    const I = this.animIn;
    I.speed = this.speed; I.stance = this.stance; I.full = full; I.action = action; I.actionT = this.visT; I.actionDur = this.actionDur;
    I.twoHanded = !!(this.handR && this.handR === this.handL); I.limp = limp; I.tired = m.tired; I.panic = m.panic;
    I.cold = m.cold; I.aimPitch = 0; I.holdingLight = !!this.lightItem && this.flashlightOn && this.handR === this.lightItem;
    I.holding = !!this.handR || !!this.propKey; I.heldL = !!this.handL && this.handL !== this.handR; I.lookYaw = 0;
    I.weapon = w ? w.kind : this.handR ? 'tool' : 'unarmed'; I.limpSide = limpSide; I.armHurtL = armL; I.armHurtR = armR;
    I.exhausted = local ? Math.max(0, 1 - this.body.endurance / 0.3) : 0; I.drunk = m.drunk; I.hot = local && this.body.temp > 37.6 ? Math.min(1, (this.body.temp - 37.4) / 1.5) : 0;
    I.turn = dt > 0 ? wrapAngle(yaw - prevF) / dt : 0; I.hasWatch = !!this.rig.outfit.wrist && !(LS && LS.arm.l >= 2);
    I.unconscious = this.body.dead || (this.body.downed && this.body.downedTime > 30);
    I.limbs = LS ? {
      armL: LS.arm.l, armR: LS.arm.r, legL: LS.leg.l, legR: LS.leg.r, gait: LS.gait, mirror: LS.mirror,
      crutchL: !!this.body.limbAids?.crutchL, crutchR: !!this.body.limbAids?.crutchR,
      pegL: LS.legProst.l === 'peg', pegR: LS.legProst.r === 'peg', hookL: LS.hook.l, hookR: LS.hook.r,
    } : undefined;
    I.wx = this.x; I.wy = this.visY; I.wz = this.z; I.wyaw = yaw; I.ground = this.groundAt; I.lod = lod;
    I.moveYaw = 0;
    if (this.lookOn) { I.lookX = this.look.x; I.lookY = this.look.y; I.lookZ = this.look.z; I.lookW = this.look.w; } else I.lookW = 0;
    I.clutch = clutch;
    I.hunger = local ? clamp((this.body.hunger - 55) / 40, 0, 1) : 0;
    I.sick = local ? clamp((this.body.sickness - 30) / 50, 0, 1) : 0;
    I.fidget = lod === 0;
    // deaths and knockdowns: a ragdoll takes the body from its current pose, thrown by the last blow
    const dead = this.body.dead, down = this.body.downed && !dead;
    if (dead && !this.wasDead) this.fallRagdoll(Infinity);
    else if (down && !this.wasDown && !this.carriedBy) this.fallRagdoll(1.15);
    else if (!dead && this.wasDead) this.rig.stopRagdoll();
    this.wasDead = dead; this.wasDown = down;
    this.rig.animate(dt, I);
    // footsteps from real foot landings
    const steps = this.anim.steps;
    if (steps !== this.lastSteps) {
      this.lastSteps = steps;
      if (this.speed > 0.3 && this.stance !== 'swim' && !full) this.footstepCb?.(this);
    }
  }

  /** hand the body to the ragdoll (recover = seconds before it blends back into the animation) */
  private fallRagdoll(recover: number) {
    const h = this.lastHit, recent = gameTime() - h.t < 2;
    const g = this.anim.gait;
    _vel.set(this.remote ? g.vx : this.vx, 0, this.remote ? g.vz : this.vz);
    if (recent) _imp.set(h.dx, 0, h.dz).multiplyScalar(1.6 + 2.6 * h.s).setY(0.5 + 1.4 * Math.max(0, h.s - 0.5));
    else _imp.set(Math.cos(this.facing), 0, Math.sin(this.facing)).multiplyScalar(0.7);
    this.rig.startRagdoll(_vel, _imp, recent ? h.part : 'torso_u', recover);
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
    if (this.anim.panicking) return { ac: 'panic', at: 0, ad: 0 };
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
      hx: this.hitSeq ? [this.hitSeq, +Math.atan2(this.lastHit.dz, this.lastHit.dx).toFixed(2), Math.max(0, BODY_PART_KEYS.indexOf(this.lastHit.part)), +this.lastHit.s.toFixed(2)] : undefined,
      ai: this.propKey || undefined,
    };
  }
}

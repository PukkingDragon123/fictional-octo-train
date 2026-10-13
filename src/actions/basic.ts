import { TimedAction } from './action';
import type { Player } from '../entities/player';
import { G } from '../game/G';
import { findPath, adjacentStand } from '../world/path';
import { moveCircle } from '../world/collision';
import { Item, itemDef, freshness, FluidType, fluidName } from '../items/item';
import { bus } from '../core/events';
import { createItem } from '../items/factory';
import { clamp } from '../core/math';
import { Container } from '../items/container';

/** Walk along an A* path to a tile (or adjacent to it), then let the queue continue. */
export class WalkToAction extends TimedAction {
  path: [number, number][] | null = null;
  idx = 0;
  stuck = 0;
  constructor(p: Player, public tx: number, public ty: number, public adjacent = false, public reach = 1.35, public goal?: { x: number; z: number }) {
    super(p);
    this.duration = 9999; this.fixedTime = true; this.canMove = false; this.showBar = false; this.anim = ''; this.name = 'Walk';
  }
  start() {
    const z = G.getZone(this.p.zoneKey);
    let tx = this.tx, ty = this.ty;
    if (this.adjacent) {
      const st = adjacentStand(z, tx, ty, this.p.tileX(), this.p.tileY());
      if (st) { tx = st[0]; ty = st[1]; }
    }
    if (tx === this.p.tileX() && ty === this.p.tileY()) { this.path = []; return; }
    this.path = findPath(z, this.p.tileX(), this.p.tileY(), tx, ty, { doors: true, maxNodes: 8000 });
    if (!this.path) { bus.emit('think', this.p, "I can't get there."); this.cancelled = true; this.done = true; this.p.actions.clear(); }
  }
  update(dt: number) {
    const p = this.p;
    if (!this.path) return;
    const z = G.getZone(p.zoneKey);
    // close enough to interact?
    if (this.goal && Math.hypot(this.goal.x - p.x, this.goal.z - p.z) <= this.reach && this.idx > 0) { this.finishWalk(); return; }
    if (this.idx >= this.path.length) { this.finishWalk(); return; }
    const [nx, ny] = this.path[this.idx];
    // open closed doors on the way
    const dx = nx - p.tileX(), dy = ny - p.tileY();
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      const ex = dx === 1 ? nx : p.tileX(), ey = dy === 1 ? ny : p.tileY();
      const side: 0 | 1 = dx !== 0 ? 1 : 0;
      const e = z.edge(ex, ey, side);
      if (e && e.kind === 'door' && !e.open && !e.locked && !e.barricade) G.interact?.openDoor?.(p, ex, ey, side, true);
    }
    const tx = nx + 0.5, tz = ny + 0.5;
    const ddx = tx - p.x, ddz = tz - p.z;
    const dist = Math.hypot(ddx, ddz);
    if (dist < 0.18) { this.idx++; return; }
    const sp = (p.running ? 4.0 : 2.0) * p.body.mods(p.heavyLoad()).move;
    const step = Math.min(dist, sp * dt);
    const ox = p.x, oz = p.z;
    moveCircle(z, p, (ddx / dist) * step, (ddz / dist) * step);
    p.vx = (p.x - ox) / Math.max(dt, 1e-4); p.vz = (p.z - oz) / Math.max(dt, 1e-4);
    p.speed = Math.hypot(p.vx, p.vz);
    p.targetFacing = Math.atan2(ddz, ddx);
    p.turn(dt, 12);
    if (Math.hypot(p.x - ox, p.z - oz) < step * 0.2) { this.stuck += dt; if (this.stuck > 1.2) { this.idx++; this.stuck = 0; } } else this.stuck = 0;
  }
  private finishWalk() { this.p.vx = 0; this.p.vz = 0; this.p.speed = 0; this.done = true; }
  perform() {}
}

/** Queue: walk next to a world position if needed, then run the action */
export function queueAt(p: Player, x: number, z: number, a: TimedAction, reach = 1.3, adjacentTile = true) {
  p.actions.clear();
  if (Math.hypot(x - p.x, z - p.z) > reach) p.actions.add(new WalkToAction(p, Math.floor(x), Math.floor(z), adjacentTile, reach, { x, z }));
  a.face = { x, z };
  p.actions.add(a);
}

// ---------------------------------------------------------------- eating & drinking
export class EatAction extends TimedAction {
  constructor(p: Player, public it: Item, public portion = 1) {
    super(p);
    const d = itemDef(it.key);
    this.name = 'Eat ' + d.name;
    this.duration = d.food?.pills ? 1.2 : 2.2 + portion * 3.2;
    this.anim = 'eat';
    this.sound = d.food?.pills ? 'pills' : 'eat';
  }
  isValid() { return !!this.p.containerOf(this.it); }
  start() { G.audio?.loop?.('eat', this.p, true); }
  stop() { this.apply(this.progress); G.audio?.loop?.('eat', this.p, false); }
  perform() { this.apply(1); G.audio?.loop?.('eat', this.p, false); }
  private apply(frac: number) {
    const d = itemDef(this.it.key);
    const f = d.food;
    if (!f) return;
    const left = 1 - (this.it.eaten ?? 0);
    const eatNow = Math.min(left, this.portion * left > 0 ? this.portion * frac : 0);
    if (eatNow <= 0.01) return;
    const fr = freshness(this.it);
    const cooked = (this.it.cooked ?? 0) >= 1 && (this.it.cooked ?? 0) < 1.6;
    const burnt = (this.it.cooked ?? 0) >= 1.6;
    const hungerScale = cooked ? 1.25 : 1;
    this.p.body.eat({ ...f, hunger: f.hunger * hungerScale }, eatNow, { rotten: fr === 'rotten', stale: fr === 'stale', raw: !!f.raw && !cooked && !burnt, burnt, cooked });
    this.it.eaten = (this.it.eaten ?? 0) + eatNow;
    if (this.it.eaten >= 0.99) {
      this.p.removeItem(this.it);
      if (f.leaves) this.p.inv.add(createItem(f.leaves, undefined, { pristine: true }));
    }
    bus.emit('inventoryChanged', this.p);
    if (fr === 'rotten') bus.emit('think', this.p, 'That tasted rotten...');
  }
}

export class DrinkAction extends TimedAction {
  constructor(p: Player, public it: Item, public litres: number) {
    super(p);
    this.name = 'Drink';
    this.duration = 1.2 + litres * 5;
    this.anim = 'drink';
  }
  isValid() { return !!this.p.containerOf(this.it) && !!this.it.fluid && this.it.fluid.amount > 0.001; }
  start() { G.audio?.loop?.('drink', this.p, true); }
  stop() { this.apply(this.progress); G.audio?.loop?.('drink', this.p, false); }
  perform() { this.apply(1); G.audio?.loop?.('drink', this.p, false); }
  private apply(frac: number) {
    const fl = this.it.fluid; if (!fl) return;
    const amt = Math.min(fl.amount, this.litres * frac);
    if (amt <= 0.005) return;
    fl.amount -= amt;
    this.p.body.drink(fl.type, amt);
    if (fl.amount <= 0.005) this.it.fluid = null;
    bus.emit('inventoryChanged', this.p);
  }
}

/** drink straight from a tap / pool / toilet */
export class DrinkFromSourceAction extends TimedAction {
  constructor(p: Player, public fluid: FluidType, public onDone?: (l: number) => void) {
    super(p); this.name = 'Drink'; this.duration = 4; this.anim = 'drink';
  }
  perform() {
    const need = Math.max(0.1, this.p.body.thirst / 48);
    this.p.body.drink(this.fluid, need);
    this.onDone?.(need);
    if (this.fluid === 'tainted') bus.emit('think', this.p, 'That water tasted... off.');
  }
}

export class FillAction extends TimedAction {
  constructor(p: Player, public it: Item, public fluid: FluidType, public available = Infinity, public onTake?: (l: number) => void) {
    super(p);
    const d = itemDef(it.key);
    const room = (d.fluidCap ?? 0) - (it.fluid?.amount ?? 0);
    this.name = 'Fill ' + d.name;
    this.duration = 1 + Math.min(room, available) * 1.2;
    this.anim = 'pour';
  }
  isValid() { return !!this.p.containerOf(this.it); }
  start() { G.audio?.loop?.('fill', this.p, true); }
  stop() { G.audio?.loop?.('fill', this.p, false); this.apply(this.progress); }
  perform() { G.audio?.loop?.('fill', this.p, false); this.apply(1); }
  private apply(frac: number) {
    const d = itemDef(this.it.key);
    const cap = d.fluidCap ?? 0;
    const cur = this.it.fluid?.amount ?? 0;
    const add = Math.min(this.available, (cap - cur) * frac);
    if (add <= 0) return;
    // mixing clean with tainted taints it all
    let type = this.fluid;
    if (this.it.fluid && this.it.fluid.amount > 0.01 && this.it.fluid.type !== type) type = this.it.fluid.type === 'tainted' || type === 'tainted' ? 'tainted' : type;
    this.it.fluid = { type, amount: cur + add };
    this.onTake?.(add);
    bus.emit('inventoryChanged', this.p);
  }
}

export class PourAction extends TimedAction {
  constructor(p: Player, public it: Item, public into: Item | null) {
    super(p); this.name = 'Pour'; this.duration = 2.2; this.anim = 'pour';
  }
  perform() {
    const fl = this.it.fluid; if (!fl) return;
    if (!this.into) { this.it.fluid = null; G.audio?.at?.('pour', this.p.x, this.p.z); bus.emit('inventoryChanged', this.p); return; }
    const cap = itemDef(this.into.key).fluidCap ?? 0;
    const cur = this.into.fluid?.amount ?? 0;
    const amt = Math.min(fl.amount, cap - cur);
    let type = fl.type;
    if (this.into.fluid && this.into.fluid.amount > 0.01 && this.into.fluid.type !== type) type = this.into.fluid.type === 'tainted' || type === 'tainted' ? 'tainted' : type;
    this.into.fluid = { type, amount: cur + amt };
    fl.amount -= amt;
    if (fl.amount <= 0.005) this.it.fluid = null;
    bus.emit('inventoryChanged', this.p);
  }
}

// ---------------------------------------------------------------- equipment
export class WearAction extends TimedAction {
  constructor(p: Player, public it: Item, public off = false) {
    super(p);
    const d = itemDef(it.key);
    this.name = (off ? 'Take off ' : 'Wear ') + d.name;
    const slow = d.clothing?.slot === 'feet' || d.clothing?.slot === 'legs' ? 3.2 : d.bag ? 1.0 : 1.8;
    this.duration = slow;
    this.anim = 'craft';
  }
  isValid() { return !!this.p.containerOf(this.it); }
  perform() {
    if (this.off) this.p.unwear(this.it);
    else this.p.wear(this.it);
    G.audio?.itemSound?.(this.it.key, 'cloth', this.p);
    bus.emit('inventoryChanged', this.p);
  }
}
export class EquipAction extends TimedAction {
  constructor(p: Player, public it: Item | null, public hand: 'R' | 'L' = 'R') {
    super(p); this.name = it ? 'Equip' : 'Unequip'; this.duration = 0.45; this.anim = 'hold_item'; this.canMove = true; this.showBar = false;
  }
  isValid() { return !this.it || !!this.p.containerOf(this.it); }
  perform() {
    if (this.it && this.p.isWorn(this.it)) this.p.unwear(this.it);
    this.p.equip(this.it, this.hand);
    if (this.it) G.audio?.itemSound?.(this.it.key, 'equip', this.p);
    bus.emit('inventoryChanged', this.p);
  }
}

// ---------------------------------------------------------------- reading
export class ReadAction extends TimedAction {
  constructor(p: Player, public it: Item) {
    super(p);
    const d = itemDef(it.key);
    const pages = d.literature?.pages ?? 60;
    this.name = 'Read ' + d.name;
    this.duration = Math.min(40, 4 + pages * 0.12);
    this.anim = 'read';
    this.fixedTime = false;
  }
  isValid() { return !!this.p.containerOf(this.it); }
  update(dt: number) {
    // reading needs light
    if (G.lightLevelAt(this.p.x, this.p.z) < 0.08) { bus.emit('think', this.p, "It's too dark to read."); this.p.actions.clear(); }
    G.survival && (G.survival.entertained = 1);
    void dt;
  }
  perform() {
    const d = itemDef(this.it.key);
    const lit = d.literature;
    if (!lit) return;
    const b = this.p.body;
    if (lit.boredom) b.boredom = clamp(b.boredom + lit.boredom, 0, 100);
    if (lit.unhappy) b.unhappy = clamp(b.unhappy + lit.unhappy, 0, 100);
    if (lit.stress) b.stress = clamp(b.stress + lit.stress, 0, 100);
    const known: Set<string> = (this.p as any).knownRecipes || ((this.p as any).knownRecipes = new Set<string>());
    let learned = 0;
    for (const r of lit.recipes || []) if (!known.has(r)) { known.add(r); learned++; }
    if (lit.skill) {
      const mult: Record<string, number> = (this.p as any).xpMult || ((this.p as any).xpMult = {});
      mult[lit.skill] = Math.max(mult[lit.skill] ?? 1, lit.mult ?? 3);
      bus.emit('halo', this.p, `${lit.skill.toUpperCase()} XP ×${lit.mult ?? 3}`, 'good');
    }
    if (learned) bus.emit('halo', this.p, `+${learned} schematic${learned > 1 ? 's' : ''}`, 'good');
    if (lit.text) G.ui?.read(d.name, lit.text);
    bus.emit('read', this.p, this.it);
  }
}

// ---------------------------------------------------------------- misc
export class OpenCanAction extends TimedAction {
  constructor(p: Player, public it: Item, public tool: Item | null) {
    super(p);
    this.name = 'Open can';
    const t = tool ? itemDef(tool.key) : null;
    this.duration = !tool ? 9 : (t?.tags || []).includes('canopener') ? 3 : 6;
    this.anim = tool ? 'craft' : 'hammer';
  }
  isValid() { return !!this.p.containerOf(this.it); }
  perform() {
    const d = itemDef(this.it.key);
    const c = this.p.containerOf(this.it) as Container;
    const into = d.food?.openedInto;
    if (!this.tool && Math.random() < 0.35) { bus.emit('think', this.p, 'Ow! Cut my hand on the lid.'); this.p.body.addInjury('hand_l', 'laceration', 0.3, { dirty: true }); }
    if (this.tool && !(itemDef(this.tool.key).tags || []).includes('canopener')) this.tool.cond = Math.max(0, this.tool.cond - 0.04);
    if (into) {
      this.p.removeItem(this.it);
      const n = createItem(into, undefined, { pristine: true });
      n.age = this.it.age;
      c.add(n);
    } else this.it.opened = true;
    G.audio?.at?.('can_open', this.p.x, this.p.z);
    bus.emit('inventoryChanged', this.p);
  }
}

export class RipAction extends TimedAction {
  constructor(p: Player, public it: Item) {
    super(p); this.name = 'Rip clothing'; this.duration = 4.5; this.anim = 'craft';
  }
  isValid() { return !!this.p.containerOf(this.it) && !this.p.isWorn(this.it); }
  perform() {
    const d = itemDef(this.it.key);
    const out = d.clothing?.rip || 'rag';
    let n = d.clothing?.ripCount ?? 2;
    n = Math.max(1, Math.round(n * (0.4 + this.it.cond * 0.6)));
    if (!this.p.findTool('#scissors') && !this.p.findTool('#knife')) n = Math.max(1, n - 1);
    this.p.removeItem(this.it);
    for (let i = 0; i < n; i++) this.p.inv.add(createItem(out, undefined, { pristine: true }));
    this.p.body.addXp('tailoring', 2);
    G.audio?.at?.('rip', this.p.x, this.p.z);
    bus.emit('halo', this.p, `+${n} ${itemDef(out).name}`);
    bus.emit('inventoryChanged', this.p);
  }
}

export class WaitAction extends TimedAction {
  constructor(p: Player, secs: number, name = 'Wait', anim: any = '') { super(p); this.duration = secs; this.name = name; this.anim = anim; this.fixedTime = true; this.showBar = false; }
  perform() {}
}

export function describeFluid(t: FluidType) { return fluidName(t); }

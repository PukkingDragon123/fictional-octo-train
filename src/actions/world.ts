import { TimedAction } from './action';
import type { Player } from '../entities/player';
import { G } from '../game/G';
import { op } from '../game/ops';
import { Zone, EdgeObj, TileObject, TF } from '../world/zone';
import { objDef } from '../world/objects';
import { Item, itemDef } from '../items/item';
import { createItem } from '../items/factory';
import { bus } from '../core/events';
import { floorId } from '../world/defs';
import { dropItem } from '../items/worldItems';
import { serializeItem } from '../items/factory';
import { rollLoot } from '../items/loot';
import { Rng } from '../core/rng';
import { clamp } from '../core/math';

const zk = (p: Player) => p.zoneKey;
const edgeArgs = (p: Player, x: number, y: number, side: 0 | 1, patch: Partial<EdgeObj>) => ({ z: zk(p), x, y, side, patch });

/** emit a noise event (creatures hear it) */
export function noise(p: Player | null, x: number, z: number, radius: number, kind = 'generic') {
  bus.emit('noise', { x, z, radius, kind, zone: p ? p.zoneKey : G.local.zoneKey, by: p?.id });
}

// ---------------------------------------------------------------- doors & windows
export class DoorAction extends TimedAction {
  constructor(p: Player, public x: number, public y: number, public side: 0 | 1, public mode: 'toggle' | 'lock' | 'unlock' | 'knock' | 'kick') {
    super(p);
    this.duration = mode === 'toggle' ? 0.35 : mode === 'knock' ? 1.6 : mode === 'kick' ? 1.4 : 1.2;
    this.anim = mode === 'kick' ? 'shove' : mode === 'knock' ? 'hammer' : 'hold_item';
    this.name = mode === 'kick' ? 'Kick door' : mode === 'knock' ? 'Knock' : 'Door';
    this.showBar = mode !== 'toggle';
  }
  perform() {
    const z = G.getZone(this.p.zoneKey);
    const e = z.edge(this.x, this.y, this.side); if (!e) return;
    switch (this.mode) {
      case 'toggle':
        if (e.barricade > 0) { bus.emit('think', this.p, "It's barricaded."); return; }
        if (e.locked && !e.open) { bus.emit('think', this.p, "It's locked."); G.audio?.at?.('door_locked', this.x, this.y); return; }
        op('edge', edgeArgs(this.p, this.x, this.y, this.side, { open: !e.open, swing: swingAway(this.p, this.x, this.y, this.side) }));
        G.audio?.at?.(e.open ? 'door_close' : 'door_open', this.x + 0.5, this.y + 0.5);
        noise(this.p, this.x, this.y, e.open ? 5 : 4, 'door');
        break;
      case 'lock': case 'unlock':
        op('edge', edgeArgs(this.p, this.x, this.y, this.side, { locked: this.mode === 'lock' }));
        G.audio?.at?.('lock', this.x, this.y);
        break;
      case 'knock':
        G.audio?.at?.('knock', this.x + 0.5, this.y + 0.5);
        noise(this.p, this.x, this.y, 14, 'knock');
        break;
      case 'kick': {
        const dmg = 18 + this.p.body.skill('strength') * 4;
        const hp = e.hp - dmg;
        G.audio?.at?.('door_kick', this.x + 0.5, this.y + 0.5);
        noise(this.p, this.x, this.y, 18, 'bang');
        if (hp <= 0) { op('edge', edgeArgs(this.p, this.x, this.y, this.side, { locked: false, open: true, hp: Math.round(e.maxHp * 0.3), barricade: 0 })); bus.emit('think', this.p, 'It gave way!'); }
        else op('edge', edgeArgs(this.p, this.x, this.y, this.side, { hp }));
        this.p.body.endurance = Math.max(0, this.p.body.endurance - 0.08);
        if (Math.random() < 0.08) this.p.body.addInjury(Math.random() < 0.5 ? 'foot_r' : 'shin_r', 'bruise', 0.3);
        break;
      }
    }
  }
}
function swingAway(p: Player, x: number, y: number, side: 0 | 1): 1 | -1 {
  // door swings away from the opener
  if (side === 0) return p.z < y ? 1 : -1;
  return p.x < x ? 1 : -1;
}

export class BarricadeAction extends TimedAction {
  constructor(p: Player, public x: number, public y: number, public side: 0 | 1, public metal = false) {
    super(p); this.name = 'Barricade'; this.duration = metal ? 12 : 8; this.anim = 'hammer';
  }
  isValid() {
    const p = this.p;
    if (!p.findTool('#hammer')) return false;
    if (this.metal) return !!p.findTool('sheet_metal') && !!p.findTool('#screws');
    return !!p.findTool('plank') && !!p.findTool('#nails');
  }
  start() { G.audio?.loop?.('hammer', this.p, true); }
  stop() { G.audio?.loop?.('hammer', this.p, false); }
  perform() {
    G.audio?.loop?.('hammer', this.p, false);
    const z = G.getZone(this.p.zoneKey);
    const e = z.edge(this.x, this.y, this.side); if (!e) return;
    const p = this.p;
    if (this.metal) { p.removeItem(p.findTool('sheet_metal')!); const s = p.findTool('#screws')!; s.uses = (s.uses ?? 1) - 0.15; if (s.uses <= 0.01) p.removeItem(s); }
    else { p.removeItem(p.findTool('plank')!); const n = p.findTool('#nails')!; n.uses = (n.uses ?? 1) - 0.1; if (n.uses <= 0.01) p.removeItem(n); }
    const side = this.side === 0 ? (p.z >= this.y ? 1 : -1) : (p.x >= this.x ? 1 : -1);
    op('edge', edgeArgs(p, this.x, this.y, this.side, { barricade: this.metal ? 5 : Math.min(4, e.barricade + 1), open: false, barricadeSide: side as 1 | -1 }));
    noise(p, this.x, this.y, 16, 'hammer');
    p.body.addXp('carpentry', 6);
    bus.emit('inventoryChanged', p);
  }
}

export class UnbarricadeAction extends TimedAction {
  constructor(p: Player, public x: number, public y: number, public side: 0 | 1) {
    super(p); this.name = 'Remove barricade'; this.duration = 6; this.anim = 'saw';
  }
  isValid() { return !!(this.p.findTool('#hammer') || this.p.findTool('#crowbar')); }
  perform() {
    const z = G.getZone(this.p.zoneKey);
    const e = z.edge(this.x, this.y, this.side); if (!e || !e.barricade) return;
    if (e.barricade >= 5) { this.p.inv.add(createItem('sheet_metal', undefined, { pristine: true })); op('edge', edgeArgs(this.p, this.x, this.y, this.side, { barricade: 0 })); }
    else { if (Math.random() < 0.7) this.p.inv.add(createItem('plank', undefined, { pristine: true })); op('edge', edgeArgs(this.p, this.x, this.y, this.side, { barricade: e.barricade - 1 })); }
    G.audio?.at?.('wood_creak', this.x, this.y);
    noise(this.p, this.x, this.y, 8, 'pry');
    bus.emit('inventoryChanged', this.p);
  }
}

export class WindowAction extends TimedAction {
  constructor(p: Player, public x: number, public y: number, public side: 0 | 1, public mode: 'toggle' | 'smash' | 'clearGlass' | 'curtains' | 'addCurtains') {
    super(p);
    this.duration = mode === 'toggle' ? 1.2 : mode === 'smash' ? 0.8 : mode === 'clearGlass' ? 3.5 : mode === 'addCurtains' ? 5 : 0.6;
    this.anim = mode === 'smash' ? 'swing' : mode === 'clearGlass' ? 'craft' : 'hold_item';
    this.name = { toggle: 'Window', smash: 'Smash window', clearGlass: 'Remove glass', curtains: 'Curtains', addCurtains: 'Hang curtains' }[mode];
  }
  perform() {
    const z = G.getZone(this.p.zoneKey);
    const e = z.edge(this.x, this.y, this.side); if (!e) return;
    const p = this.p;
    switch (this.mode) {
      case 'toggle':
        if (e.glass === 'broken' || e.glass === 'none') return;
        if (e.locked) { bus.emit('think', p, "It's stuck."); return; }
        op('edge', edgeArgs(p, this.x, this.y, this.side, { open: !e.open }));
        G.audio?.at?.('window_slide', this.x, this.y);
        break;
      case 'smash': {
        if (e.glass !== 'intact') return;
        op('edge', edgeArgs(p, this.x, this.y, this.side, { glass: 'broken', open: false }));
        G.audio?.at?.('glass_break', this.x + 0.5, this.y + 0.5);
        noise(p, this.x, this.y, 22, 'glass');
        const armed = p.handR && itemDef(p.handR.key).weapon;
        if (!armed && Math.random() < 0.7) p.body.addInjury(Math.random() < 0.5 ? 'hand_r' : 'farm_r', Math.random() < 0.3 ? 'glass' : 'laceration', 0.4, { dirty: true });
        // shards fall on both sides
        for (let i = 0; i < 2; i++) op('decal', { z: zk(p), d: { x: this.x + (this.side === 1 ? (i ? 0.3 : -0.3) : 0.5), z: this.y + (this.side === 0 ? (i ? 0.3 : -0.3) : 0.5), w: 0.7, d: 0.7, rot: Math.random() * 6, tex: 'decal_glass' } });
        break;
      }
      case 'clearGlass': {
        if (e.glass !== 'broken') return;
        const gloves = [...p.worn.values()].some((w) => itemDef(w.key).clothing?.slot === 'hands');
        if (!gloves && Math.random() < 0.25) p.body.addInjury('hand_r', 'scratch', 0.3);
        op('edge', edgeArgs(p, this.x, this.y, this.side, { glass: 'none' }));
        G.audio?.at?.('glass_clink', this.x, this.y);
        break;
      }
      case 'curtains':
        if (!e.curtains || e.curtains === 'none') return;
        op('edge', edgeArgs(p, this.x, this.y, this.side, { curtains: e.curtains === 'open' ? 'closed' : 'open' }));
        G.audio?.at?.('cloth', this.x, this.y);
        break;
      case 'addCurtains': {
        const sheet = p.findTool('#sheet') || p.findTool('bedsheet');
        if (!sheet) return;
        p.removeItem(sheet);
        const side = this.side === 0 ? (p.z >= this.y ? 1 : -1) : (p.x >= this.x ? 1 : -1);
        op('edge', edgeArgs(p, this.x, this.y, this.side, { curtains: 'closed', curtainSide: side as 1 | -1 }));
        break;
      }
    }
  }
}

/** Climb through a window / over a low obstacle: a short locked movement */
export class ClimbAction extends TimedAction {
  sx = 0; sz = 0; tx = 0; tz = 0;
  constructor(p: Player, targetX: number, targetZ: number, public glassy = false) {
    super(p);
    this.name = 'Climb'; this.duration = 1.1; this.full = 'vault'; this.anim = ''; this.locks = true; this.showBar = false;
    this.tx = targetX; this.tz = targetZ;
  }
  start() { this.sx = this.p.x; this.sz = this.p.z; this.face = { x: this.tx, z: this.tz }; G.audio?.at?.('climb', this.p.x, this.p.z); }
  update() {
    const k = Math.min(1, this.t / this.effDuration);
    const e = k * k * (3 - 2 * k);
    this.p.x = this.sx + (this.tx - this.sx) * e;
    this.p.z = this.sz + (this.tz - this.sz) * e;
    this.p.speed = 0;
  }
  perform() {
    this.p.x = this.tx; this.p.z = this.tz;
    if (this.glassy && Math.random() < 0.6) {
      const part = (['thigh_l', 'thigh_r', 'farm_l', 'farm_r', 'torso_l'] as const)[Math.floor(Math.random() * 5)];
      this.p.body.addInjury(part, Math.random() < 0.4 ? 'glass' : 'laceration', 0.45, { dirty: true });
      bus.emit('think', this.p, 'Argh! Broken glass!');
    }
    noise(this.p, this.p.x, this.p.z, 5, 'climb');
    this.p.body.addXp('nimble', 3);
  }
}

// ---------------------------------------------------------------- furniture
export class SearchAction extends TimedAction {
  constructor(p: Player, public o: TileObject) { super(p); this.name = 'Search'; this.duration = 0.6; this.anim = 'loot'; this.showBar = false; }
  perform() {
    if (!this.o.inv) return;
    if (this.o.inv.locked) { bus.emit('think', this.p, "It's locked."); return; }
    G.ui?.inventory?.focus(this.o.inv);
    G.audio?.objSound?.(this.o.key, 'open', this.o.x, this.o.y);
  }
}

export class SitAction extends TimedAction {
  constructor(p: Player, public o: TileObject | null) { super(p); this.name = 'Sit'; this.duration = 1e9; this.fixedTime = true; this.full = 'sit'; this.anim = ''; this.showBar = false; }
  start() {
    if (this.o) {
      const d = objDef(this.o.key)!;
      const w = d.w ?? 1, dd = d.d ?? 1;
      const rw = this.o.rot % 2 === 0 ? w : dd, rd = this.o.rot % 2 === 0 ? dd : w;
      this.p.x = this.o.x + rw / 2; this.p.z = this.o.y + rd / 2;
      this.p.facing = this.p.targetFacing = Math.PI / 2 - (-this.o.rot * Math.PI / 2) ;
      this.p.facing = this.p.targetFacing = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][this.o.rot];
      this.p.sittingOn = this.o.uid;
      if (this.o.key.includes('sofa') && G.creatures?.disturbFurniture?.(this.o, this.p)) return;
    } else this.p.sittingOn = -1;
  }
  stop() { this.p.sittingOn = null; }
  perform() { this.p.sittingOn = null; }
}

/** Sleep / rest. In solo time accelerates; in co-op only when everyone sleeps. */
export class SleepAction extends TimedAction {
  hours = 0;
  constructor(p: Player, public o: TileObject | null, public quality: number) {
    super(p); this.name = 'Sleep'; this.duration = 1e9; this.fixedTime = true; this.full = o && objDef(o.key)?.sleep ? 'lie' : 'lie_side'; this.anim = ''; this.showBar = false;
  }
  start() {
    const p = this.p;
    if (p.body.fatigue < 30) { bus.emit('think', p, "I'm not tired."); this.done = true; return; }
    if (this.o) { const d = objDef(this.o.key)!; const w = d.w ?? 1, dd = d.d ?? 1; const rw = this.o.rot % 2 === 0 ? w : dd, rd = this.o.rot % 2 === 0 ? dd : w; p.x = this.o.x + rw / 2; p.z = this.o.y + rd / 2; }
    p.sleeping = true;
    (p as any).bedQuality = this.quality;
    bus.emit('sleepStart', p);
  }
  update(dt: number) {
    const p = this.p;
    this.hours += dt * G.clock.hoursPerSecond;
    const wake = p.body.fatigue <= 3 || this.hours > 14 || p.body.panic > 50 || p.body.health < 30 || p.body.bleedRate() > 0.4 || p.body.hunger > 80 || p.body.thirst > 85;
    if (wake) { this.done = true; this.wakeUp(); }
  }
  private wakeUp() {
    const p = this.p;
    p.sleeping = false;
    bus.emit('sleepEnd', p, this.hours);
    if (p.body.fatigue > 40) bus.emit('think', p, 'I barely slept...');
    else bus.emit('think', p, this.quality > 0.7 ? 'That was good sleep.' : 'My back hurts...');
  }
  stop() { if (this.p.sleeping) this.wakeUp(); }
  perform() { if (this.p.sleeping) this.wakeUp(); }
}

export class DisassembleAction extends TimedAction {
  constructor(p: Player, public o: TileObject) {
    super(p);
    const d = objDef(o.key)!;
    this.name = 'Disassemble ' + d.name;
    this.duration = d.disassemble?.time ?? 8;
    const tools = d.disassemble?.tools || [];
    this.anim = tools.some((t) => t.includes('saw')) ? 'saw' : tools.some((t) => t.includes('hammer') || t.includes('sledge')) ? 'hammer' : 'craft';
  }
  isValid() {
    const d = objDef(this.o.key); if (!d?.disassemble) return false;
    return d.disassemble.tools.every((t) => !!this.p.findTool(t)) && G.getZone(this.p.zoneKey).objects.has(this.o.uid);
  }
  start() { G.audio?.loop?.(this.anim === 'saw' ? 'saw' : this.anim === 'hammer' ? 'hammer' : 'craft', this.p, true); }
  stop() { G.audio?.loop?.('craft', this.p, false); G.audio?.loop?.('saw', this.p, false); G.audio?.loop?.('hammer', this.p, false); }
  perform() {
    this.stop();
    const d = objDef(this.o.key)!;
    const p = this.p;
    const rng = new Rng(Math.random() * 1e9);
    const skill = d.disassemble?.skill as any;
    const lvl = skill ? p.body.skill(skill) : 0;
    // contents spill on the floor
    if (this.o.inv) for (const it of [...this.o.inv.items]) op('dropFloor', { z: zk(p), item: serializeItem(it), x: this.o.x + 0.5, zz: this.o.y + 0.5 });
    for (const [key, mn, mx] of d.disassemble!.yields) {
      const n = Math.max(0, Math.round(rng.int(mn, mx) * (0.6 + lvl * 0.06)));
      for (let i = 0; i < n; i++) p.inv.add(createItem(key, rng));
    }
    for (const t of d.disassemble!.tools) { const tool = p.findTool(t); if (tool && itemDef(tool.key).durability) tool.cond = Math.max(0, tool.cond - 0.02); }
    op('objRemove', { z: zk(p), uid: this.o.uid });
    if (skill) p.body.addXp(skill, 8);
    noise(p, this.o.x, this.o.y, 10, 'work');
    bus.emit('inventoryChanged', p);
  }
}

export class SwitchAction extends TimedAction {
  constructor(p: Player, public fn: () => void, name = 'Switch') { super(p); this.name = name; this.duration = 0.4; this.anim = 'hold_item'; this.showBar = false; }
  perform() { this.fn(); }
}

/** Generic "use object for N seconds then run fn" (computers, TVs, pianos, phones...) */
export class UseObjectAction extends TimedAction {
  constructor(p: Player, name: string, secs: number, anim: any, public fn: () => void, public tick?: (dt: number) => void) {
    super(p); this.name = name; this.duration = secs; this.anim = anim;
  }
  update(dt: number) { this.tick?.(dt); }
  perform() { this.fn(); }
}

// ---------------------------------------------------------------- the land
export class DigAction extends TimedAction {
  constructor(p: Player, public x: number, public y: number) { super(p); this.name = 'Dig furrow'; this.duration = 7; this.anim = 'dig'; }
  isValid() { return !!(this.p.findTool('#shovel') || this.p.findTool('#trowel')); }
  start() { G.audio?.loop?.('dig', this.p, true); }
  stop() { G.audio?.loop?.('dig', this.p, false); }
  perform() {
    this.stop();
    const z = G.getZone(this.p.zoneKey);
    op('floor', { z: zk(this.p), x: this.x, y: this.y, floor: floorId('soil'), flags: z.flags[z.idx(this.x, this.y)] | TF.FURROW });
    this.p.body.addXp('farming', 4);
    this.p.body.endurance = Math.max(0, this.p.body.endurance - 0.06);
  }
}

export class ForageAction extends TimedAction {
  constructor(p: Player, public x: number, public y: number, public table: string) { super(p); this.name = 'Forage'; this.duration = 9; this.anim = 'loot'; }
  perform() {
    const p = this.p;
    const lvl = p.body.skill('foraging') + (p.body.has('outdoorsman') ? 2 : 0) + (p.occupation === 'ranger' ? 2 : 0);
    const z = G.getZone(p.zoneKey);
    const key = `forage:${this.x},${this.y}`;
    const last = (z.meta[key] as number) ?? -999;
    if (G.clock.hours - last < 24) { bus.emit('think', p, 'Already picked clean here.'); return; }
    op('zoneMeta', { z: z.key, patch: { [key]: G.clock.hours } });
    const rng = new Rng(Math.random() * 1e9);
    const found = rollLoot('forage_' + this.table, rng, 0.6 + lvl * 0.12);
    if (!found.length) { bus.emit('think', p, 'Nothing useful.'); }
    for (const k of found) { p.inv.add(createItem(k, rng)); bus.emit('halo', p, '+ ' + itemDef(k).name); }
    p.body.addXp('foraging', 6 + found.length * 3);
    bus.emit('inventoryChanged', p);
  }
}

export class MarkAction extends TimedAction {
  constructor(p: Player, public it: Item, public x: number, public z: number, public tex: string) { super(p); this.name = 'Mark'; this.duration = 2; this.anim = 'craft'; }
  perform() {
    this.it.uses = (this.it.uses ?? 1) - 0.05;
    if (this.it.uses <= 0.01) this.p.removeItem(this.it);
    op('decal', { z: zk(this.p), d: { x: this.x, z: this.z, w: 0.6, d: 0.6, rot: Math.atan2(this.z - this.p.z, this.x - this.p.x) + Math.PI / 2, tex: this.tex, y: 0.015 } });
    G.audio?.at?.('spray', this.x, this.z);
  }
}

export class ButcherAction extends TimedAction {
  constructor(p: Player, public corpse: any) { super(p); this.name = 'Butcher'; this.duration = 12; this.anim = 'loot'; }
  isValid() { return !!this.p.findTool('#knife') && !this.corpse.butchered; }
  perform() {
    const p = this.p;
    const yields: [string, number][] = this.corpse.sp?.meat || [['meat_raw', 2]];
    const z = G.getZone(p.zoneKey);
    for (const [k, n] of yields) for (let i = 0; i < n; i++) p.inv.add(createItem(k, undefined, { pristine: true }));
    this.corpse.butchered = true;
    G.creatures?.onButcher?.(this.corpse);
    const knife = p.findTool('#knife'); if (knife) knife.cond = Math.max(0, knife.cond - 0.03);
    op('decal', { z: z.key, d: { x: this.corpse.x, z: this.corpse.z, w: 1.2, d: 1.2, rot: Math.random() * 6, tex: 'decal_blood_pool' } });
    p.body.addXp('trapping', 6);
    if ([...p.worn.values()].length) for (const w of p.worn.values()) w.bloody = clamp((w.bloody ?? 0) + 0.3, 0, 1);
    bus.emit('inventoryChanged', p);
  }
}

/** vending machine: smash glass or insert coins */
export class VendAction extends TimedAction {
  constructor(p: Player, public o: TileObject, public smash: boolean) { super(p); this.name = smash ? 'Smash glass' : 'Insert coins'; this.duration = smash ? 1.5 : 2.5; this.anim = smash ? 'swing' : 'craft'; }
  perform() {
    const p = this.p;
    if (this.smash) {
      op('objState', { z: zk(p), uid: this.o.uid, patch: { broken: true } });
      G.audio?.at?.('glass_break', this.o.x + 0.5, this.o.y + 0.5);
      noise(p, this.o.x, this.o.y, 20, 'glass');
      if (this.o.inv) this.o.inv.locked = false;
      return;
    }
    const coins = p.findTool('coins'); if (!coins) return;
    p.removeItem(coins);
    const powered = G.interact?.objPowered?.(this.o);
    if (!powered) { bus.emit('think', p, 'Nothing. No power.'); return; }
    const it = this.o.inv?.items[0];
    if (!it) { bus.emit('think', p, 'Sold out.'); return; }
    op('take', { z: zk(p), ref: 'obj:' + this.o.uid, uid: it.uid, to: p.id });
    G.audio?.at?.('vend', this.o.x, this.o.y);
  }
}

export function spillItem(z: Zone, key: string, x: number, zz: number) { dropItem(z, createItem(key), x, zz); }

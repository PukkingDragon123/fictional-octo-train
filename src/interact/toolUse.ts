// Tools on the world: with something in hand, a left click is what that tool
// does to what is under the cursor. A hammer or a pipe smashes, an axe chops
// (and leaves firewood), a crowbar pries locks, boards and doors, a saw cuts
// pieces off (a chair loses a leg per stroke), a knife slashes upholstery open
// and butchers a carcass, a screwdriver or wrench takes things apart, a shovel
// digs, a sledge caves walls in. Small and fragile things break with one hit.
// In reach the blow lands at once; further away the survivor walks over first.
import { G } from '../game/G';
import { op } from '../game/ops';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import { Item, itemDef } from '../items/item';
import { createItem, serializeItem } from '../items/factory';
import type { PickTarget } from '../game/picking';
import { objDef } from '../world/objects';
import type { TileObject } from '../world/zone';
import { TimedAction } from '../actions/action';
import { queueAt } from '../actions/basic';
import { UseObjectAction, UnbarricadeAction, BarricadeAction, DisassembleAction, ButcherAction, DigAction, MarkAction, WindowAction, noise } from '../actions/world';
import { breakable, PILE } from '../world/destruction';
import { objMat, objMaxHp } from '../world/debris';
import { SmashAction, ClearDebrisAction, ToolKind, queueOn, reachTo, strikeObject, wearTool, weaponOf, wallNear, wallStand, targetPoint } from '../world/destructActions';
import { shake } from '../gfx/juice';

export type { ToolKind };

/** what kind of tool an item is, for hitting the world */
export function toolKind(it: Item | null | undefined): ToolKind {
  if (!it) return null;
  const d = itemDef(it.key);
  const t = d.tags || [];
  const w = d.weapon;
  if (t.includes('saw')) return 'saw';
  if (t.includes('sledge')) return 'sledge';
  if (t.includes('axe') || w?.kind === 'axe') return 'axe';
  if (t.includes('crowbar')) return 'crowbar';
  if (t.includes('hammer')) return 'hammer';
  if (t.includes('shovel') || t.includes('dig')) return 'dig';
  if (t.includes('spray') || t.includes('chalk') || t.includes('marker') || it.key === 'glow_paint') return 'paint';
  if (t.includes('knife') || t.includes('machete') || w?.kind === 'blade') return 'knife';
  if (t.includes('screwdriver') || t.includes('wrench')) return 'unscrew';
  if (w?.kind === 'spear') return 'spear';
  if (w?.kind === 'blunt') return 'blunt';
  return null;
}

export interface ToolVerb { label: string; run: () => void; reach: number; at: { x: number; z: number }; strike: boolean }

const SHARP = new Set(['knife', 'spear', 'saw']);
const heavyEnough = (k: ToolKind) => k === 'sledge' || k === 'axe' || k === 'blunt' || k === 'hammer' || k === 'crowbar' || k === 'dig';

/** the verb a left click with this tool would do on a target (null: nothing, combat decides) */
export function toolVerb(p: Player, t: PickTarget | null, it: Item | null = p.handR): ToolVerb | null {
  const k = toolKind(it);
  if (!k || !t || !it) return null;
  const { w } = weaponOf(p, it);
  const reach = (w.range ?? 0.85) + 0.3;
  const z = G.getZone(p.zoneKey);
  switch (t.kind) {
    case 'object': {
      const o = t.obj, d = objDef(o.key); if (!d) return null;
      const at = targetPoint(p, { kind: 'obj', o });
      if (o.key === PILE) return { label: 'Clear debris', reach, at, strike: false, run: () => queueOn(p, o, new ClearDebrisAction(p, o), 0.45) };
      // a locked box: pry it
      if (k === 'crowbar' && o.inv?.locked) return { label: 'Pry it open', reach, at, strike: false, run: () => queueOn(p, o, pryContainer(p, o, it), 0.5) };
      if ((k === 'unscrew' || (k === 'hammer' && !breakable(d, o))) && d.disassemble) {
        const missing = d.disassemble.tools.filter((tt) => !p.findTool(tt));
        if (!missing.length) return { label: 'Take apart', reach, at, strike: false, run: () => queueOn(p, o, new DisassembleAction(p, o), 0.5) };
      }
      if (!breakable(d, o)) return null;
      if (k === 'saw') return { label: objMat(d) === 'metal' ? 'Saw (slow)' : 'Saw a piece off', reach: 1.0, at, strike: false, run: () => queueOn(p, o, new SawAction(p, o, it), 0.45) };
      if (k === 'knife' && objMat(d) === 'fabric') return { label: 'Slash it open', reach, at, strike: true, run: () => queueOn(p, o, new SlashAction(p, o, it), 0.5) };
      if (k === 'dig' || k === 'paint' || k === 'unscrew') return null;
      const label = k === 'axe' ? 'Chop' : k === 'crowbar' ? 'Pry apart' : k === 'knife' || k === 'spear' ? 'Stab' : 'Smash';
      return { label, reach, at, strike: true, run: () => strikeOrWalk(p, o, k, reach) };
    }
    case 'edge': {
      const e = t.edge, x = t.x, y = t.y, side = t.side;
      const at = side === 0 ? { x: x + 0.5, z: y } : { x, z: y + 0.5 };
      const go = (a: TimedAction) => () => queueAt(p, at.x, at.z, a, 1.3);
      if (e.barricade > 0 && (k === 'crowbar' || k === 'hammer')) {
        if (k === 'hammer' && e.barricade < 4 && p.findTool('plank') && p.findTool('#nails')) return { label: 'Nail another board', reach: 1.3, at, strike: false, run: go(new BarricadeAction(p, x, y, side)) };
        return { label: 'Pry the boards off', reach: 1.3, at, strike: false, run: go(new UnbarricadeAction(p, x, y, side)) };
      }
      if (k === 'hammer' && e.kind !== 'arch' && e.barricade < 4) {
        if (p.findTool('plank') && p.findTool('#nails')) return { label: 'Board it up', reach: 1.3, at, strike: false, run: go(new BarricadeAction(p, x, y, side)) };
        if (p.findTool('sheet_metal') && p.findTool('#screws')) return { label: 'Board it up (metal)', reach: 1.3, at, strike: false, run: go(new BarricadeAction(p, x, y, side, true)) };
      }
      if (e.kind === 'window' && e.glass === 'intact' && !e.barricade) return { label: 'Smash the window', reach: 1.3, at, strike: true, run: go(new WindowAction(p, x, y, side, 'smash')) };
      if (e.kind === 'window' && e.glass === 'broken' && (k === 'hammer' || k === 'crowbar' || k === 'blunt')) return { label: 'Knock the glass out', reach: 1.3, at, strike: false, run: go(new WindowAction(p, x, y, side, 'clearGlass')) };
      if ((e.kind === 'door' || e.kind === 'gate') && e.locked && !e.open && !e.portal) {
        if (k === 'crowbar') return { label: 'Force the door', reach: 1.3, at, strike: false, run: go(forceDoor(p, x, y, side, it)) };
        if (k === 'axe' || k === 'sledge') return { label: 'Break it down', reach: 1.3, at, strike: true, run: go(chopDoor(p, x, y, side, it)) };
      }
      return null;
    }
    case 'creature': {
      const c: any = t.c;
      if (!c.dead) return null;
      if (k === 'knife' && c.sp?.meat && !c.butchered) return { label: 'Butcher', reach: 1.4, at: { x: c.x, z: c.z }, strike: false, run: () => butcher(p, c) };
      return null;
    }
    case 'tile': {
      const f = z.floorAt(t.x, t.y);
      const at = { x: t.x + 0.5, z: t.y + 0.5 };
      if (k === 'dig' && f?.diggable) return { label: 'Dig', reach: 1.3, at, strike: false, run: () => queueAt(p, at.x, at.z, new DigAction(p, t.x, t.y), 1.3) };
      if (k === 'paint') return { label: 'Mark the floor', reach: 1.3, at, strike: false, run: () => queueAt(p, at.x, at.z, new MarkAction(p, it, at.x, at.z, it.key === 'glow_paint' ? 'decal_glow_paint' : (itemDef(it.key).tags || []).includes('chalk') ? 'decal_mark_x' : 'decal_arrow_floor'), 1.3) };
      // a wall right where they clicked: smash through it
      const wl = wallNear(z, t.point.x, t.point.z, p);
      if (wl && heavyEnough(k)) {
        const s = wallStand(wl);
        return { label: 'Smash through the wall', reach: 0.7, at: s, strike: true, run: () => queueAt(p, s.x, s.z, new SmashAction(p, { kind: 'wall', x: wl.x, y: wl.y, side: wl.side, u: wl.u, h: 1.15, n: wl.n }, false, 0, { tool: k }), 0.7, false) };
      }
      // a working light overhead
      const l = G.destruct?.lightNear?.(z, t.point.x, t.point.z, 0.9);
      if (l && (w.range ?? 0) >= 1.0) return { label: 'Smash the light', reach: 0.6, at: { x: l.x, z: l.z }, strike: true, run: () => queueAt(p, l.x, l.z, new SmashAction(p, { kind: 'light', id: l.id, x: l.x, z: l.z }, false, 0, { tool: k }), 0.55, false) };
      return null;
    }
  }
  return null;
}

/** one blow on an object: at once if in reach, else walk over and swing */
function strikeOrWalk(p: Player, o: TileObject, k: ToolKind, reach: number) {
  const a = new SmashAction(p, { kind: 'obj', o }, false, 0, { tool: k });
  if (reachTo(p, o) <= reach) { p.actions.clear(); p.actions.add(a); a.face = targetPoint(p, { kind: 'obj', o }); }
  else queueOn(p, o, a, Math.max(0.45, Math.min(1.0, reach - 0.4)));
}

/**
 * The combat swing hit no creature (src/game/combat.ts -> destruct.meleeWorld):
 * what the tool in hand does to what it lands on. Returns true when handled.
 */
let lastStrike = { at: 0, key: '' };
export function noteStrike(key: string) { lastStrike = { at: performance.now(), key }; }
export function toolHit(p: Player, w: any, it: Item | null): boolean {
  const k = toolKind(it);
  // the hovered thing first (the click aimed at it), else what is in front
  const hv: PickTarget | null = G.ui?.hover ?? null;
  let o: TileObject | null = null;
  if (hv?.kind === 'object' && reachTo(p, hv.obj) <= (w.range ?? 0.85) + 0.4) o = hv.obj;
  if (!o) o = G.destruct?.objectInFront?.(p, (w.range ?? 0.85) + 0.35, 0.9) ?? null;
  if (!o) return false;
  // the same blow already landed through a click (src/interact/grab.ts)
  if (performance.now() - lastStrike.at < 350 && lastStrike.key === 'o' + o.uid) return true;
  const d = objDef(o.key);
  if (!d || !breakable(d, o)) return false;
  strikeObject(p, o, k, it, k === 'axe' ? 'chop' : k === 'crowbar' ? 'pry' : k && SHARP.has(k) ? 'slash' : 'melee');
  if (it) wearTool(p, it, 0.6);
  return true;
}

// ---------------------------------------------------------------- tool actions
/** a saw stroke: cuts a piece off (a chair leg, a slat); the last stroke takes it apart */
export class SawAction extends TimedAction {
  constructor(p: Player, public o: TileObject, public it: Item | null) {
    super(p);
    const metal = objMat(objDef(o.key)!) === 'metal';
    this.name = 'Saw'; this.duration = metal ? 5 : 2.6; this.anim = 'saw';
  }
  isValid() { return G.getZone(this.p.zoneKey).objects.has(this.o.uid) && !this.o.state?.held; }
  start() { G.audio?.loop?.('saw', this.p, true); }
  stop() { G.audio?.loop?.('saw', this.p, false); }
  perform() {
    G.audio?.loop?.('saw', this.p, false);
    const p = this.p, o = this.o, d = objDef(o.key)!;
    const z = G.getZone(p.zoneKey);
    const m = objMat(d);
    const max = objMaxHp(d);
    const k = m === 'wood' || m === 'paper' ? 0.36 : m === 'fabric' || m === 'plastic' ? 0.3 : m === 'metal' ? 0.14 : 0.2;
    const left = o.hp ?? max;
    const piece = d.disassemble?.yields?.[0]?.[0] ?? (m === 'metal' || m === 'elec' ? 'scrap_metal' : m === 'fabric' ? 'cloth' : 'plank');
    const at = targetPoint(p, { kind: 'obj', o });
    // a piece comes off and drops at the survivor's feet
    try {
      const it = createItem(piece);
      op('dropFloor', { z: z.key, item: serializeItem(it), x: (at.x + p.x) / 2, zz: (at.z + p.z) / 2, y: 0.5, v: [(p.x - at.x) * 0.6, 1.2, (p.z - at.z) * 0.6] });
      bus.emit('think', p, left - max * k <= 0 ? 'It comes apart.' : m === 'wood' ? 'A leg comes off.' : 'Cut a piece off.');
    } catch { /* no such item */ }
    G.destruct?.damageObject?.(p, o, Math.round(max * k * 10) / 10, 'saw', undefined, [at.x - p.x, at.z - p.z]);
    noise(p, at.x, at.z, 8, 'saw');
    p.body.addXp?.('carpentry', 3);
    wearTool(p, this.it, 1);
  }
}

/** a knife through upholstery: whatever was hidden in the cushions is right there */
export class SlashAction extends TimedAction {
  constructor(p: Player, public o: TileObject, public it: Item | null) { super(p); this.name = 'Slash'; this.duration = 0.7; this.anim = 'stab' as any; this.showBar = false; }
  isValid() { return G.getZone(this.p.zoneKey).objects.has(this.o.uid) && !this.o.state?.held; }
  perform() {
    const p = this.p, o = this.o;
    G.audio?.at?.('dmg_hit_fabric', p.x, p.z, 0.8);
    strikeObject(p, o, 'knife', this.it, 'slash');
    if (o.inv && !o.state?.slashed) {
      op('objState', { z: p.zoneKey, uid: o.uid, patch: { slashed: true } });
      if (o.inv.locked) op('invLock', { z: p.zoneKey, uid: o.uid, locked: false });
      G.grab?.openLoot?.(p, o.inv, o);
    }
    wearTool(p, this.it, 0.5);
  }
}

function pryContainer(p: Player, o: TileObject, it: Item) {
  const at = targetPoint(p, { kind: 'obj', o });
  return new UseObjectAction(p, 'Pry open', 3.5, 'push', () => {
    noise(p, at.x, at.z, 10, 'pry');
    G.audio?.at?.('break', at.x, at.z, 0.8);
    shake(0.08);
    op('objState', { z: p.zoneKey, uid: o.uid, patch: { pried: true } });
    op('invLock', { z: p.zoneKey, uid: o.uid, locked: false });
    bus.emit('think', p, 'The lock gives.');
    wearTool(p, it, 1.5);
  });
}

function forceDoor(p: Player, x: number, y: number, side: 0 | 1, it: Item) {
  return new UseObjectAction(p, 'Force the door', 4.5, 'push', () => {
    const ex = side === 0 ? x + 0.5 : x, ez = side === 0 ? y : y + 0.5;
    if (Math.random() < 0.25 + p.body.skill('strength') * 0.06) {
      op('edge', { z: p.zoneKey, x, y, side, patch: { locked: false, open: true } });
      G.audio?.at?.('door_kick', ex, ez, 0.9); shake(0.12);
      bus.emit('think', p, 'The frame splits. It is open.');
    } else { G.audio?.at?.('wood_creak', ex, ez, 0.9); bus.emit('think', p, 'Almost. Again.'); }
    noise(p, ex, ez, 14, 'pry');
    wearTool(p, it, 1.5);
  });
}

function chopDoor(p: Player, x: number, y: number, side: 0 | 1, it: Item) {
  const a = new UseObjectAction(p, 'Break it down', 1.1, 'smash', () => {
    const ex = side === 0 ? x + 0.5 : x, ez = side === 0 ? y : y + 0.5;
    G.audio?.at?.('door_kick', ex, ez, 1); shake(0.15);
    noise(p, ex, ez, 22, 'smash');
    if (Math.random() < 0.35 + p.body.skill('strength') * 0.05) {
      op('edge', { z: p.zoneKey, x, y, side, patch: { locked: false, open: true } });
      bus.emit('think', p, 'It gives.');
    }
    wearTool(p, it, 1);
  });
  return a;
}

function butcher(p: Player, c: any) {
  // butchery has its own hands-on scene when the cooking system is in (src: (G as any).cook)
  if ((G as any).cook?.butcher) { (G as any).cook.butcher(p, c); return; }
  queueAt(p, c.x, c.z, new ButcherAction(p, c), 1.4, false);
}

// ---------------------------------------------------------------- salvage bonus
// chopping wood leaves firewood; prying furniture apart leaves nails; sawing leaves clean planks
bus.on('objBroken', (z: any, o: TileObject, by: string | null, how: string) => {
  try {
    if (!by || by !== G.local?.id || !G.local) return;
    const d = objDef(o.key); if (!d) return;
    const m = objMat(d);
    const drops: string[] = [];
    if (how === 'chop' && m === 'wood') drops.push('firewood', ...(Math.random() < 0.5 ? ['firewood'] : []));
    if (how === 'pry' && (m === 'wood' || m === 'metal')) drops.push(Math.random() < 0.6 ? 'nails' : 'screws');
    if (how === 'saw') drops.push(m === 'metal' ? 'scrap_metal' : m === 'fabric' ? 'cloth' : 'plank');
    const w = d.w ?? 1, dd = d.d ?? 1;
    const cx = o.x + (o.rot % 2 === 0 ? w : dd) / 2 + (o.ox ?? 0), cz = o.y + (o.rot % 2 === 0 ? dd : w) / 2 + (o.oz ?? 0);
    for (const k of drops) {
      try { op('dropFloor', { z: z.key, item: serializeItem(createItem(k)), x: cx + (Math.random() - 0.5) * 0.5, zz: cz + (Math.random() - 0.5) * 0.5, y: 0.4, v: [(Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5] }); } catch { /* unknown item */ }
    }
  } catch (e) { console.warn('tool salvage', e); }
});


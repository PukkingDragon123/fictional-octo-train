// What a survivor does to the furniture with their hands and tools: one blow
// per click (a hammer smashes, an axe chops, a crowbar pries, a knife slashes,
// a sledge caves things in), a kick, holding on to push / drag / carry, kicking
// a heap of debris aside, smashing through a drywall partition, knocking out a
// light. There are no menus: src/interact/grab.ts and src/interact/toolUse.ts
// decide what a click does. Everything that changes the world goes through
// G.destruct / ops.
import { G } from '../game/G';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { TimedAction } from '../actions/action';
import { queueAt } from '../actions/basic';
import { noise } from '../actions/world';
import { Zone, TileObject } from './zone';
import { objDef } from './objects';
import { objectMatrix } from './chunkMesher';
import { wallDef } from './defs';
import { itemDef } from '../items/item';
import type { Item } from '../items/item';
import type { Player } from '../entities/player';
import { objMat, objMass, objMaxHp } from './debris';
import { shake, hitstop } from '../gfx/juice';

export type Target =
  | { kind: 'obj'; o: TileObject }
  | { kind: 'wall'; x: number; y: number; side: 0 | 1; u: number; h: number; n: 1 | -1 }
  | { kind: 'light'; id: number; x: number; z: number };

/** what a tool does to things (src/interact/toolUse.ts picks it from the held item) */
export type ToolKind = 'saw' | 'axe' | 'crowbar' | 'hammer' | 'sledge' | 'knife' | 'unscrew' | 'dig' | 'blunt' | 'spear' | 'paint' | null;

const UNARMED = { kind: 'unarmed', dmg: [2, 4], range: 0.85, speed: 1.4, endurance: 0.03 };
/** tools without weapon stats still hit something */
const TOOL_W: Record<string, any> = {
  saw: { kind: 'blade', dmg: [4, 7], range: 0.9, speed: 1.1, endurance: 0.04 },
  unscrew: { kind: 'blade', dmg: [1, 3], range: 0.85, speed: 1.6, endurance: 0.02 },
  dig: { kind: 'blunt', dmg: [5, 8], range: 1.3, speed: 1.0, endurance: 0.05 },
};
export function weaponOf(p: Player, it: Item | null = p.handR) {
  const d = it ? itemDef(it.key) : null;
  const w = d?.weapon ?? null;
  return { it, w: (w as any) || UNARMED, armed: !!w, heavy: !!(w && ((w as any).twoHanded || d!.weight >= 1.8)) };
}

export function targetPoint(p: Player, t: Target): { x: number; z: number } {
  if (t.kind === 'obj') {
    const z = G.getZone(p.zoneKey), d = objDef(t.o.key)!;
    const m = objectMatrix(z, t.o, d);
    return { x: m.elements[12], z: m.elements[14] };
  }
  if (t.kind === 'wall') return t.side === 0 ? { x: t.x + t.u, z: t.y } : { x: t.x, z: t.y + t.u };
  return { x: t.x, z: t.z };
}

/** small, glass, pottery, cheap plastic: one decent hit and it is gone */
export function fragile(o: TileObject): boolean {
  const d = objDef(o.key); if (!d) return false;
  const m = objMat(d);
  return m === 'glass' || m === 'ceramic' || objMass(d) < 6 || objMaxHp(d) <= 14 || (m === 'plastic' && objMass(d) < 12);
}

/**
 * One blow on a piece of furniture with whatever is in hand (tool decides the
 * damage kind and multipliers). Fragile things break at once. Returns the damage dealt.
 */
export function strikeObject(p: Player, o: TileObject, tool: ToolKind, it: Item | null, how = 'smash', kick = false): number {
  const z = G.getZone(p.zoneKey);
  const d = objDef(o.key); if (!d) return 0;
  const at = targetPoint(p, { kind: 'obj', o });
  let dx = at.x - p.x, dz = at.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const { w } = weaponOf(p, it);
  const tw = it && !itemDef(it.key).weapon && tool ? TOOL_W[tool] ?? w : w;
  const str = p.body.skill('strength');
  const base = kick ? 9 + Math.random() * 5 + str * 1.5 : tw.dmg[0] + Math.random() * (tw.dmg[1] - tw.dmg[0]);
  const kind = kick ? 'kick' : tool === 'axe' ? 'axe' : tool === 'knife' || tool === 'saw' || tool === 'spear' ? 'blade' : tool === 'unscrew' ? 'blade' : tw.kind ?? 'unarmed';
  let dmg = (G.destruct?.weaponDamage?.(p, o, kind, base) ?? base) * (tool === 'sledge' ? 1.5 : 1) * (weaponOf(p, it).heavy && !kick ? 1.2 : 1);
  if (!kick && fragile(o)) dmg = Math.max(dmg, (o.hp ?? objMaxHp(d)) + 1);
  const hy = z.heightAt(o.x, o.y) + (kick ? Math.min(0.45, d.height * 0.5) : Math.min(1.2, d.height * 0.8));
  G.destruct?.damageObject?.(p, o, dmg, how, { x: at.x - dx * 0.35, y: hy, z: at.z - dz * 0.35 }, [dx, dz]);
  noise(p, at.x, at.z, kick ? 12 : tool === 'sledge' ? 22 : 15, 'smash');
  try { (p as any).anim?.impact?.(kick ? 0.5 : 0.8); } catch { /* older rigs */ }
  if (dmg > 25) { shake(0.12); hitstop(35); }
  const m = objMat(d);
  // hands and feet are not hammers
  if (kick && (m === 'glass' || m === 'metal') && Math.random() < 0.15) p.body.addInjury(Math.random() < 0.5 ? 'foot_r' : 'shin_r', m === 'glass' ? 'laceration' : 'bruise', 0.3);
  if (!it && !kick && Math.random() < (m === 'glass' ? 0.5 : 0.15)) p.body.addInjury('hand_r', m === 'glass' ? 'laceration' : 'bruise', 0.3);
  return dmg;
}

/** wear on the tool after a blow; true when it broke */
export function wearTool(p: Player, it: Item | null, k = 1): boolean {
  if (!it) return false;
  const d = itemDef(it.key);
  const dur = d.weapon?.durability ?? (d as any).durability ?? 50;
  if (Math.random() < (1 / Math.max(1, dur)) * 1.5 * k) it.cond = Math.max(0, (it.cond ?? 1) - 0.1);
  if ((it.cond ?? 1) <= 0) { p.removeItem(it); bus.emit('think', p, `My ${d.name.toLowerCase()} broke!`); G.audio?.at?.('break', p.x, p.z); bus.emit('inventoryChanged', p); return true; }
  return false;
}

/** one blow (a swing or a kick); with `repeat` it keeps going until the thing gives or the survivor moves */
export class SmashAction extends TimedAction {
  struck = false;
  tool: ToolKind;
  repeat: boolean;
  constructor(p: Player, public tgt: Target, public kick = false, public n = 0, opts: { tool?: ToolKind; repeat?: boolean } = {}) {
    super(p);
    const { w, heavy } = weaponOf(p);
    this.tool = opts.tool ?? null;
    this.repeat = !!opts.repeat;
    this.duration = kick ? 0.95 : Math.max(0.6, Math.min(1.6, 1.0 / (w.speed ?? 1)));
    const two = heavy || this.tool === 'sledge' || this.tool === 'axe' || tgt.kind === 'light';
    this.anim = (kick ? 'kick_obj' : two ? 'smash' : 'swing') as any;
    this.name = kick ? 'Kick' : tgt.kind === 'light' ? 'Smash the light' : this.tool === 'axe' ? 'Chop' : 'Smash';
    this.showBar = false;
    this.face = targetPoint(p, tgt);
  }
  isValid() {
    const z = G.getZone(this.p.zoneKey);
    const t = this.tgt;
    if (t.kind === 'obj') return z.objects.has(t.o.uid) && !t.o.state?.held;
    if (t.kind === 'wall') { const i = z.idx(t.x, t.y); return !!(t.side === 0 ? z.wallN[i] : z.wallW[i]) && !z.edges.has(i * 2 + t.side); }
    const l = z.lights.find((q) => q.id === t.id);
    return !!l && !l.broken;
  }
  start() {
    G.audio?.at?.(this.kick ? 'swing' : 'whoosh', this.p.x, this.p.z, this.kick ? 0.3 : 0.5);
    if (this.p.body.endurance < 0.05) { bus.emit('think', this.p, 'Too tired to swing.'); this.done = true; }
  }
  update() {
    if (!this.struck && this.t >= this.effDuration * (this.kick ? 0.42 : 0.55)) { this.struck = true; this.strike(); }
  }
  perform() {
    if (!this.struck) { this.struck = true; this.strike(); }
    if (this.repeat && this.tgt.kind !== 'light' && this.isValid() && this.n < 40) this.p.actions.add(new SmashAction(this.p, this.tgt, this.kick, this.n + 1, { tool: this.tool, repeat: true }));
  }
  private strike() {
    const p = this.p;
    const z = G.getZone(p.zoneKey);
    const { it, w, heavy } = weaponOf(p);
    const str = p.body.skill('strength');
    p.exertionTimer = 1;
    p.body.endurance = Math.max(0, p.body.endurance - (this.kick ? 0.035 : (w.endurance ?? 0.05) * 1.1));
    p.body.addXp?.('strength', 1);
    G.grab?.noteStrike?.(this.tgt);
    const t = this.tgt;
    if (t.kind === 'light') {
      noise(p, t.x, t.z, 15, 'smash');
      op('lightSmash', { z: z.key, id: t.id, by: p.id });
      return;
    }
    if (t.kind === 'wall') {
      const base = this.kick ? 9 + Math.random() * 5 + str * 1.5 : w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0]);
      const kind = this.kick ? 'kick' : w.kind ?? 'unarmed';
      const overhead = !this.kick && heavy ? 1.25 : 1;
      const wd = wallDef(this.wallId(z, t));
      const k = this.kick ? (wd.key === 'cubicle' || wd.glass ? 0.6 : 0.25) : kind === 'blunt' ? (this.tool === 'sledge' ? 1.6 : 1) : kind === 'axe' ? 0.85 : kind === 'unarmed' ? 0.3 : 0.2;
      const at = targetPoint(p, t);
      noise(p, at.x, at.z, this.kick ? 12 : heavy ? 20 : 15, 'smash');
      try { (p as any).anim?.impact?.(this.kick ? 0.5 : heavy ? 0.9 : 0.7); } catch { /* older rigs */ }
      op('wallSmash', { z: z.key, x: t.x, y: t.y, side: t.side, d: Math.round(base * k * overhead * (1 + str * 0.05) * 10) / 10, how: this.kick ? 'kick' : 'smash', by: p.id, u: Math.round((t.u + (Math.random() - 0.5) * 0.3) * 100) / 100, h: Math.round((this.kick ? 0.45 : t.h + (Math.random() - 0.5) * 0.4) * 100) / 100, n: t.n });
      if (!it && !this.kick && Math.random() < 0.3) p.body.addInjury(Math.random() < 0.5 ? 'hand_r' : 'hand_l', 'bruise', 0.25);
    } else {
      strikeObject(p, t.o, this.tool, it, this.kick ? 'kick' : this.tool === 'axe' ? 'chop' : this.tool === 'crowbar' ? 'pry' : this.tool === 'knife' ? 'slash' : 'smash', this.kick);
    }
    if (!this.kick && wearTool(p, it)) this.n = 999;
  }
  private wallId(z: Zone, t: { x: number; y: number; side: 0 | 1 }) { const i = z.idx(t.x, t.y); return t.side === 0 ? z.wallN[i] : z.wallW[i]; }
}

/** hold on and move it (the push / drag / carry itself runs in src/world/pushDrag.ts) */
export class PushAction extends TimedAction {
  constructor(p: Player, public o: TileObject, public mode: 'push' | 'drag' | 'carry') {
    super(p);
    this.name = mode === 'carry' ? 'Carry' : mode === 'push' ? 'Push' : 'Drag';
    this.duration = 1e9; this.fixedTime = true; this.canMove = true; this.showBar = false;
    this.anim = (mode === 'carry' ? 'carry' : mode) as any;
  }
  isValid() { return G.getZone(this.p.zoneKey).objects.has(this.o.uid); }
  start() { if (!G.destruct?.push?.begin?.(this.p, this.o, this.mode, this)) this.done = true; }
  stop() { if (G.destruct?.push?.st?.action === this) G.destruct.push.end('stop'); }
  perform() { this.stop(); }
}

/** kick a debris heap flat (anything buried in it is left on the floor) */
export class ClearDebrisAction extends TimedAction {
  constructor(p: Player, public o: TileObject) { super(p); this.name = 'Clear debris'; this.duration = 1.6; this.anim = 'kick_obj' as any; this.showBar = false; }
  isValid() { return G.getZone(this.p.zoneKey).objects.has(this.o.uid); }
  perform() {
    const z = G.getZone(this.p.zoneKey);
    if (this.o.inv) for (const it of [...this.o.inv.items]) op('move', { z: z.key, from: 'obj:' + this.o.uid, to: `floor:${this.o.x + 0.5},${this.o.y + 0.5}`, uid: it.uid });
    op('objRemove', { z: z.key, uid: this.o.uid });
    G.audio?.at?.('dmg_crumble', this.o.x + 0.5, this.o.y + 0.5, 0.8);
    noise(this.p, this.o.x + 0.5, this.o.y + 0.5, 8, 'smash');
  }
}

// ---------------------------------------------------------------- getting there
/** where to stand to work on it: off the side of its footprint nearest the survivor */
export function approach(p: Player, o: TileObject, gap = 0.55): { x: number; z: number; reach: number; cx: number; cz: number } {
  const z = G.getZone(p.zoneKey), d = objDef(o.key)!;
  const m = objectMatrix(z, o, d);
  const cx = m.elements[12], cz = m.elements[14];
  const w = d.w ?? 1, dd = d.d ?? 1;
  const hx = (o.rot % 2 === 0 ? w : dd) / 2, hz = (o.rot % 2 === 0 ? dd : w) / 2;
  // nearest point of the footprint, then out from that side
  const nx = Math.max(cx - hx, Math.min(p.x, cx + hx)), nz = Math.max(cz - hz, Math.min(p.z, cz + hz));
  let ox = 0, oz = 0;
  const dl = Math.abs(nx - (cx - hx)), dr = Math.abs(nx - (cx + hx)), dt = Math.abs(nz - (cz - hz)), db = Math.abs(nz - (cz + hz));
  const mn = Math.min(dl, dr, dt, db);
  if (mn === dl) ox = -1; else if (mn === dr) ox = 1; else if (mn === dt) oz = -1; else oz = 1;
  let x = nx + ox * gap, zz = nz + oz * gap;
  // that spot is in a wall or another object: just go for the middle of the nearest side
  if (!z.inb(Math.floor(x), Math.floor(zz)) || z.solid[z.idx(Math.floor(x), Math.floor(zz))] === 1 || !z.floor[z.idx(Math.floor(x), Math.floor(zz))]) { x = cx + ox * (hx + gap); zz = cz + oz * (hz + gap); }
  return { x, z: zz, reach: 0.4, cx, cz };
}
/** distance from the survivor to the nearest point of an object's footprint */
export function reachTo(p: Player, o: TileObject): number {
  const z = G.getZone(p.zoneKey), d = objDef(o.key); if (!d) return 99;
  const m = objectMatrix(z, o, d);
  const cx = m.elements[12], cz = m.elements[14];
  const w = d.w ?? 1, dd = d.d ?? 1;
  const hx = (o.rot % 2 === 0 ? w : dd) / 2, hz = (o.rot % 2 === 0 ? dd : w) / 2;
  const nx = Math.max(cx - hx, Math.min(p.x, cx + hx)), nz = Math.max(cz - hz, Math.min(p.z, cz + hz));
  return Math.hypot(nx - p.x, nz - p.z);
}
/** walk to the spot (unless already in reach), then do it facing the object */
export function queueOn(p: Player, o: TileObject, a: TimedAction, gap = 0.55) {
  const ap = approach(p, o, gap);
  if (reachTo(p, o) <= gap + 0.35) { p.actions.clear(); p.actions.add(a); }
  else queueAt(p, ap.x, ap.z, a, ap.reach, false);
  a.face = { x: ap.cx, z: ap.cz };
}

/** the plain (smashable or chippable) wall face nearest to a point, on the survivor's side */
export function wallNear(z: Zone, x: number, zz: number, p: Player, maxD = 0.42): { x: number; y: number; side: 0 | 1; u: number; n: 1 | -1; id: number } | null {
  const tx = Math.floor(x), ty = Math.floor(zz);
  let best: any = null, bd = maxD;
  for (const [ex, ey, side] of [[tx, ty, 0], [tx, ty + 1, 0], [tx, ty, 1], [tx + 1, ty, 1]] as [number, number, 0 | 1][]) {
    if (!z.inb(ex, ey)) continue;
    const i = z.idx(ex, ey);
    const id = side === 0 ? z.wallN[i] : z.wallW[i];
    if (!id || z.edges.has(i * 2 + side)) continue;
    const wd = wallDef(id);
    if (!(wd.sound === 'drywall' || wd.glass || wd.sound === 'wood' && !wd.low && wd.key !== 'hedge')) continue;
    const dist = side === 0 ? Math.abs(zz - ey) : Math.abs(x - ex);
    if (dist > bd) continue;
    bd = dist;
    best = { x: ex, y: ey, side, u: Math.max(0.15, Math.min(0.85, side === 0 ? x - ex : zz - ey)), n: side === 0 ? (p.z >= ey ? 1 : -1) : (p.x >= ex ? 1 : -1), id };
  }
  return best;
}
/** the spot to stand to hit a wall face */
export function wallStand(wl: { x: number; y: number; side: 0 | 1; u: number; n: 1 | -1 }): { x: number; z: number } {
  return wl.side === 0 ? { x: wl.x + wl.u, z: wl.y + wl.n * 0.6 } : { x: wl.x + wl.n * 0.6, z: wl.y + wl.u };
}

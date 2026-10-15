// What a survivor does to the furniture: smash it (overhead with something
// heavy, swing after swing until it gives), kick it, push it, drag it, kick a
// heap of debris aside, smash through a drywall partition, knock out a light.
// Context-menu entries come in through the interaction hooks ('objectMenu',
// 'worldMenu'); everything that changes the world goes through
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
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';
import { breakable, pushable, PILE } from './destruction';
import { objMat } from './debris';

type Target =
  | { kind: 'obj'; o: TileObject }
  | { kind: 'wall'; x: number; y: number; side: 0 | 1; u: number; h: number; n: 1 | -1 }
  | { kind: 'light'; id: number; x: number; z: number };

const UNARMED = { kind: 'unarmed', dmg: [2, 4], range: 0.85, speed: 1.4, endurance: 0.03 };
function weaponOf(p: Player) {
  const it = p.handR;
  const w = it ? itemDef(it.key).weapon : null;
  return { it, w: (w as any) || UNARMED, armed: !!w, heavy: !!(w && ((w as any).twoHanded || itemDef(it!.key).weight >= 1.8)) };
}

function targetPoint(p: Player, t: Target): { x: number; z: number } {
  if (t.kind === 'obj') {
    const z = G.getZone(p.zoneKey), d = objDef(t.o.key)!;
    const m = objectMatrix(z, t.o, d);
    return { x: m.elements[12], z: m.elements[14] };
  }
  if (t.kind === 'wall') return t.side === 0 ? { x: t.x + t.u, z: t.y } : { x: t.x, z: t.y + t.u };
  return { x: t.x, z: t.z };
}

/** one blow (a swing or a kick); queues the next one until the thing gives or the survivor moves */
export class SmashAction extends TimedAction {
  struck = false;
  constructor(p: Player, public tgt: Target, public kick = false, public n = 0) {
    super(p);
    const { w, heavy } = weaponOf(p);
    this.kick = kick || false;
    this.duration = kick ? 0.95 : Math.max(0.7, Math.min(1.6, 1.1 / (w.speed ?? 1)));
    this.anim = (kick ? 'kick_obj' : heavy || tgt.kind === 'light' ? 'smash' : 'swing') as any;
    this.name = kick ? 'Kick' : tgt.kind === 'light' ? 'Smash the light' : 'Smash';
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
    G.audio?.at?.('swing', this.p.x, this.p.z, this.kick ? 0.3 : 0.6);
    if (this.p.body.endurance < 0.05) { bus.emit('think', this.p, 'Too tired to swing.'); this.done = true; }
  }
  update() {
    if (!this.struck && this.t >= this.effDuration * (this.kick ? 0.42 : 0.55)) { this.struck = true; this.strike(); }
  }
  perform() {
    if (!this.struck) { this.struck = true; this.strike(); }
    // again, until it gives (a light only takes one good hit)
    if (this.tgt.kind !== 'light' && this.isValid() && this.n < 40) this.p.actions.add(new SmashAction(this.p, this.tgt, this.kick, this.n + 1));
  }
  private strike() {
    const p = this.p;
    const z = G.getZone(p.zoneKey);
    const { it, w, heavy } = weaponOf(p);
    const str = p.body.skill('strength');
    p.exertionTimer = 1;
    p.body.endurance = Math.max(0, p.body.endurance - (this.kick ? 0.035 : (w.endurance ?? 0.05) * 1.1));
    p.body.addXp?.('strength', 1);
    const t = this.tgt;
    const at = targetPoint(p, t);
    let dx = at.x - p.x, dz = at.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    noise(p, at.x, at.z, this.kick ? 12 : heavy ? 20 : 15, 'smash');
    if (t.kind === 'light') {
      op('lightSmash', { z: z.key, id: t.id, by: p.id });
      return;
    }
    const base = this.kick ? 9 + Math.random() * 5 + str * 1.5 : w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0]);
    const kind = this.kick ? 'kick' : w.kind ?? 'unarmed';
    const overhead = !this.kick && heavy ? 1.25 : 1;
    if (t.kind === 'wall') {
      const wd = wallDef(this.wallId(z, t));
      const k = this.kick ? (wd.key === 'cubicle' || wd.glass ? 0.6 : 0.25) : kind === 'blunt' ? 1 : kind === 'axe' ? 0.85 : kind === 'unarmed' ? 0.3 : 0.2;
      op('wallSmash', { z: z.key, x: t.x, y: t.y, side: t.side, d: Math.round(base * k * overhead * (1 + str * 0.05) * 10) / 10, how: this.kick ? 'kick' : 'smash', by: p.id, u: Math.round((t.u + (Math.random() - 0.5) * 0.3) * 100) / 100, h: Math.round((this.kick ? 0.45 : t.h + (Math.random() - 0.5) * 0.4) * 100) / 100, n: t.n });
      if (!it && !this.kick && Math.random() < 0.3) p.body.addInjury(Math.random() < 0.5 ? 'hand_r' : 'hand_l', 'bruise', 0.25);
    } else {
      const o = t.o, d = objDef(o.key)!;
      const dmg = (G.destruct?.weaponDamage?.(p, o, kind, base) ?? base) * overhead;
      const zz = G.getZone(p.zoneKey);
      const hy = zz.heightAt(o.x, o.y) + (this.kick ? Math.min(0.45, d.height * 0.5) : Math.min(1.2, d.height * 0.8));
      G.destruct?.damageObject?.(p, o, dmg, this.kick ? 'kick' : 'smash', { x: at.x - dx * 0.35, y: hy, z: at.z - dz * 0.35 }, [dx, dz]);
      const m = objMat(d);
      // hands and feet are not hammers
      if (this.kick && (m === 'glass' || m === 'metal') && Math.random() < 0.15) p.body.addInjury(Math.random() < 0.5 ? 'foot_r' : 'shin_r', m === 'glass' ? 'laceration' : 'bruise', 0.3);
      if (!it && !this.kick && Math.random() < (m === 'glass' ? 0.5 : 0.15)) p.body.addInjury('hand_r', m === 'glass' ? 'laceration' : 'bruise', 0.3);
    }
    if (it) {
      const dur = itemDef(it.key).weapon?.durability ?? 50;
      if (Math.random() < (1 / Math.max(1, dur)) * 1.5) it.cond = Math.max(0, (it.cond ?? 1) - 0.1);
      if ((it.cond ?? 1) <= 0) { p.removeItem(it); bus.emit('think', p, `My ${itemDef(it.key).name.toLowerCase()} broke!`); G.audio?.at?.('break', p.x, p.z); bus.emit('inventoryChanged', p); this.n = 999; }
    }
  }
  private wallId(z: Zone, t: { x: number; y: number; side: 0 | 1 }) { const i = z.idx(t.x, t.y); return t.side === 0 ? z.wallN[i] : z.wallW[i]; }
}

/** hold on and move it (the push / drag itself runs in src/world/pushDrag.ts) */
export class PushAction extends TimedAction {
  constructor(p: Player, public o: TileObject, public mode: 'push' | 'drag') {
    super(p);
    this.name = mode === 'push' ? 'Push' : 'Drag';
    this.duration = 1e9; this.fixedTime = true; this.canMove = true; this.showBar = false;
    this.anim = mode as any;
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

// ---------------------------------------------------------------- menus
function approach(p: Player, o: TileObject): { x: number; z: number; reach: number } {
  const z = G.getZone(p.zoneKey), d = objDef(o.key)!;
  const m = objectMatrix(z, o, d);
  const cx = m.elements[12], cz = m.elements[14];
  const w = d.w ?? 1, dd = d.d ?? 1;
  const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  return { x: cx, z: cz, reach: Math.max(rw, rd) / 2 + 0.75 };
}

bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => {
  try {
    const d = objDef(o.key); if (!d) return;
    if (o.key === PILE) {
      out.push({ label: 'Kick the debris aside', action: () => { const a = approach(p, o); queueAt(p, a.x, a.z, new ClearDebrisAction(p, o), 1.2); } });
      return;
    }
    const ap = approach(p, o);
    if (breakable(d, o)) {
      const { it, armed, heavy } = weaponOf(p);
      const w = it ? itemDef(it.key) : null;
      const label = armed ? `Smash it (${w!.name.toLowerCase()})` : 'Smash it (bare hands)';
      out.push({ label, danger: true, action: () => queueAt(p, ap.x, ap.z, new SmashAction(p, { kind: 'obj', o }), Math.max(1.1, ap.reach - (heavy ? 0.1 : 0.2))) });
      if (d.height <= 1.7) out.push({ label: 'Kick it', danger: true, action: () => queueAt(p, ap.x, ap.z, new SmashAction(p, { kind: 'obj', o }, true), Math.max(1.0, ap.reach - 0.25)) });
    }
    if (pushable(d, o) && !d.tags?.includes('pushable')) {
      out.push({ label: 'Push', action: () => queueAt(p, ap.x, ap.z, new PushAction(p, o, 'push'), Math.max(0.9, ap.reach - 0.2)) });
      out.push({ label: 'Drag', action: () => queueAt(p, ap.x, ap.z, new PushAction(p, o, 'drag'), Math.max(0.9, ap.reach - 0.2)) });
    }
  } catch (e) { console.warn('destruct menu', e); }
});

bus.on('worldMenu', (p: Player, t: any, opts: MenuOption[]) => {
  try {
    // holding something: let go of it from any menu
    const st = G.destruct?.push?.st;
    if (st) opts.unshift({ label: 'Let go of the ' + (objDef(st.o.key)?.name ?? 'thing').toLowerCase(), action: () => G.destruct.push.end('menu') });
    const pt = t?.point; if (!pt) return;
    const z = G.getZone(p.zoneKey);
    const { w, it } = weaponOf(p);
    // a plain wall right by where they clicked: smash through it
    if (t.kind === 'tile' || t.kind === 'object') {
      const wl = wallNear(z, pt.x, pt.z, p);
      if (wl) {
        const wd = wallDef(wl.id);
        const label = wd.glass ? 'Smash the glass wall' : 'Smash through the wall';
        const reachX = wl.side === 0 ? wl.x + wl.u : wl.x + wl.n * 0.6, reachZ = wl.side === 0 ? wl.y + wl.n * 0.6 : wl.y + wl.u;
        const tgt: Target = { kind: 'wall', x: wl.x, y: wl.y, side: wl.side, u: wl.u, h: 1.15, n: wl.n };
        const okTool = !!it && (w.kind === 'blunt' || w.kind === 'axe');
        opts.push({ label, danger: true, disabled: !okTool && !wd.glass && wd.key !== 'cubicle' ? 'needs a sledgehammer, axe or something heavy' : false, action: () => queueAt(p, reachX, reachZ, new SmashAction(p, tgt), 0.7, false) });
      }
    }
    // a working ceiling light overhead
    const l = G.destruct?.lightNear?.(z, pt.x, pt.z, 0.9);
    if (l) {
      const long = !!it && (w.range ?? 0) >= 1.0;
      opts.push({ label: 'Smash the light', danger: true, disabled: !long ? 'needs something long to reach it' : false, action: () => queueAt(p, l.x, l.z, new SmashAction(p, { kind: 'light', id: l.id, x: l.x, z: l.z }), 0.55, false) });
    }
  } catch (e) { console.warn('destruct world menu', e); }
});

/** the plain (smashable or chippable) wall face nearest to a clicked point, on the clicker's side */
function wallNear(z: Zone, x: number, zz: number, p: Player): { x: number; y: number; side: 0 | 1; u: number; n: 1 | -1; id: number } | null {
  const tx = Math.floor(x), ty = Math.floor(zz);
  let best: any = null, bd = 0.42;
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

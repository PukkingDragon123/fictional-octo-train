import { G } from './G';
import { GameSystem } from './game';
import { defOp } from './ops';
import { Player } from '../entities/player';
import { itemDef, Item } from '../items/item';
import { clamp, angleDiff } from '../core/math';
import { bus } from '../core/events';
import { noise } from '../actions/world';
import { lineOfSight } from '../world/collision';
import { serializeItem } from '../items/factory';
import { op } from './ops';
import { Rng } from '../core/rng';

defOp('creatureHit', (a: { id: string; dmg: number; fx: number; fz: number; knock: number; by: string; k?: string; cr?: 1 }, ctx) => {
  if (!ctx.host) return;
  G.creatures?.damage(a.by, a.id, a.dmg, a.fx, a.fz, a.knock, a.k, !!a.cr);
});

const UNARMED = { kind: 'unarmed' as const, dmg: [2, 4] as [number, number], range: 0.85, speed: 1.6, endurance: 0.03, crit: 0.05, knock: 0.4, durability: 1, noise: 4 };

/**
 * Player combat: aim with right mouse, swing/stab/shoot/throw with left
 * mouse, shove with space. Melee hits every creature in an arc in front;
 * damage scales with weapon skill, strength, endurance and wounds; weapons
 * wear out and break; guns are loud.
 */
export class CombatSystem implements GameSystem {
  name = 'combat';
  rng = new Rng(Math.random() * 1e9);
  constructor() { G.combat = this; }

  update(dt: number) {
    const p = G.local;
    if (!p || p.body.dead || p.body.downed || p.inVehicle) return;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    const inp = G.input;
    const busy = p.actions.current?.started && p.actions.current.locks;
    if (busy || inp.pointerOverUI || G.ui?.menuEl) return;
    if (p.aiming && inp.mousePressed[0] && p.attackCooldown <= 0) this.attack(p);
    if (inp.hit('shove')) {
      if (!G.interact?.tryVault?.(p)) this.shove(p);
    }
  }

  weapon(p: Player) {
    const it = p.handR;
    const w = it ? itemDef(it.key).weapon : null;
    return { it, w: w || UNARMED, armed: !!w };
  }

  attack(p: Player) {
    const { it, w } = this.weapon(p);
    const mods = p.body.mods(p.heavyLoad());
    if (p.body.endurance < 0.05) bus.emit('think', p, 'Too tired to swing.');
    const speedMul = (1 + p.body.skill(skillFor(w.kind)) * 0.04) * (p.body.endurance < 0.25 ? 0.7 : 1);
    p.attackCooldown = 1 / (w.speed * speedMul);
    p.body.endurance = Math.max(0, p.body.endurance - w.endurance * (p.body.has('athletic') ? 0.8 : 1));
    p.exertionTimer = 1;
    if (w.kind === 'firearm') { this.shoot(p, it!, w as any); return; }
    if (w.kind === 'thrown') { this.throwItem(p, it!); return; }
    const anim = w.kind === 'blade' || w.kind === 'spear' ? 'stab' : (w as any).twoHanded ? 'swing2h' : 'swing';
    p.actionAnim = anim; p.actionT = 0; p.actionDur = p.attackCooldown * 0.9;
    const start = G.time;
    // hit resolves at the strike frame
    setTimeout(() => {
      if (p.body.dead) return;
      p.actionAnim = anim;
      this.resolveMelee(p, it, w as any, mods.attack);
    }, Math.max(60, p.attackCooldown * 380));
    const clear = () => { if (G.time - start >= p.attackCooldown * 0.85) { p.actionAnim = ''; } else requestAnimationFrame(clear); };
    requestAnimationFrame(clear);
    G.audio?.at?.('swing', p.x, p.z, 0.5);
  }

  private resolveMelee(p: Player, it: Item | null, w: any, atkMul: number) {
    const cs = G.creatures; if (!cs) return;
    const range = w.range + 0.25;
    const arc = w.kind === 'spear' || w.kind === 'blade' ? 0.55 : 1.0;
    let hitAny = false;
    const z = G.getZone(p.zoneKey);
    const targets = [...cs.creatures.values()].filter((c: any) => !c.dead && c.zoneKey === p.zoneKey)
      .map((c: any) => ({ c, d: Math.hypot(c.x - p.x, c.z - p.z) }))
      .filter(({ c, d }) => d <= range + c.radius && Math.abs(angleDiff(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) < arc && lineOfSight(z, p.x, p.z, c.x, c.z))
      .sort((a, b) => a.d - b.d)
      .slice(0, w.multiHit ?? (w.kind === 'blunt' || w.kind === 'axe' ? 2 : 1));
    const skill = p.body.skill(skillFor(w.kind));
    for (const { c } of targets) {
      let dmg = this.rng.float(w.dmg[0], w.dmg[1]) * atkMul * (1 + skill * 0.07);
      const crit = this.rng.chance(w.crit + skill * 0.01 + (c.state === 'idle' || c.state === 'sleep' || c.state === 'disguised' ? 0.25 : 0));
      if (crit) dmg *= 2.2;
      if (it && (it.cond ?? 1) < 0.3) dmg *= 0.75;
      cs.damage(p.id, c.id, dmg, p.x, p.z, w.knock, w.kind, crit);
      hitAny = true;
      G.audio?.hit?.(w.kind, c.x, c.z, crit);
      if (crit) G.pr.shake = Math.max(G.pr.shake, 0.6);
      p.body.addXp(skillFor(w.kind), 3);
    }
    // hitting walls/doors/windows in front
    if (!hitAny) this.hitWorld(p, w);
    if (hitAny && it) this.wear(p, it);
    if (hitAny) p.body.addXp('strength', 1);
    noise(p, p.x, p.z, hitAny ? w.noise : w.noise * 0.5, 'melee');
  }

  private hitWorld(p: Player, w: any) {
    const z = G.getZone(p.zoneKey);
    const fx = p.x + Math.cos(p.facing) * 0.9, fz = p.z + Math.sin(p.facing) * 0.9;
    const tx = Math.floor(fx), ty = Math.floor(fz);
    // windows in reach get smashed by a swing
    for (const [x, y, side] of [[tx, ty, 0], [tx, ty, 1], [tx, ty + 1, 0], [tx + 1, ty, 1]] as [number, number, 0 | 1][]) {
      const e = z.edge(x, y, side);
      if (!e) continue;
      const ex = side === 0 ? x + 0.5 : x, ez = side === 0 ? y : y + 0.5;
      if (Math.hypot(ex - p.x, ez - p.z) > 1.3) continue;
      if (e.kind === 'window' && e.glass === 'intact') {
        op('edge', { z: z.key, x, y, side, patch: { glass: 'broken' } });
        G.audio?.at?.('glass_break', ex, ez);
        noise(p, ex, ez, 22, 'glass');
        return;
      }
      if ((e.kind === 'door' || e.kind === 'window') && e.barricade > 0) {
        G.audio?.at?.('wood_hit', ex, ez);
        return;
      }
    }
  }

  private wear(p: Player, it: Item) {
    const d = itemDef(it.key);
    const dur = d.weapon?.durability ?? 50;
    const mk = (p.body.skill('mechanics') > 3 ? 0.8 : 1);
    if (this.rng.chance(1 / Math.max(1, dur) * 2.2 * mk)) it.cond = Math.max(0, it.cond - 0.1);
    if (it.cond <= 0) {
      p.removeItem(it);
      bus.emit('think', p, `My ${d.name.toLowerCase()} broke!`);
      G.audio?.at?.('break', p.x, p.z);
      bus.emit('inventoryChanged', p);
    }
  }

  shoot(p: Player, it: Item, w: any) {
    if ((it.ammo ?? 0) <= 0) { G.audio?.at?.('dryfire', p.x, p.z); bus.emit('think', p, 'Empty.'); return; }
    it.ammo = (it.ammo ?? 0) - 1;
    p.actionAnim = 'shoot'; p.actionT = 0; p.actionDur = 0.3;
    setTimeout(() => { p.actionAnim = ''; }, 300);
    const aim = p.body.mods(0).aim * (1 + p.body.skill('firearm') * 0.05);
    const spread = (w.spread ?? 0.08) / Math.max(0.25, aim);
    const ang = p.facing + this.rng.gauss(0, spread);
    G.audio?.gun?.(it.key, p.x, p.z);
    G.pointLight(p.x + Math.cos(ang) * 0.6, p.y + 1.3, p.z + Math.sin(ang) * 0.6, 0xffd090, 3, 6);
    noise(p, p.x, p.z, w.noise, 'gun');
    G.pr.shake = Math.max(G.pr.shake, 0.5);
    // hitscan along the tile grid
    const z = G.getZone(p.zoneKey);
    const cs = G.creatures;
    let best: any = null, bd = 30;
    for (const c of cs?.creatures.values() || []) {
      if ((c as any).dead || (c as any).zoneKey !== p.zoneKey) continue;
      const cc: any = c;
      const dx = cc.x - p.x, dz = cc.z - p.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      const perp = Math.abs(-Math.sin(ang) * dx + Math.cos(ang) * dz);
      const along = Math.cos(ang) * dx + Math.sin(ang) * dz;
      if (along < 0 || perp > cc.radius + 0.1) continue;
      if (!lineOfSight(z, p.x, p.z, cc.x, cc.z)) continue;
      best = cc; bd = d;
    }
    if (best) { cs.damage(p.id, best.id, this.rng.float(w.dmg[0], w.dmg[1]) * (1 - bd / 60), p.x, p.z, w.knock, 'firearm', this.rng.chance(w.crit ?? 0)); p.body.addXp('firearm', 4); }
  }

  throwItem(p: Player, it: Item) {
    const d = itemDef(it.key);
    p.actionAnim = 'throw'; p.actionT = 0; p.actionDur = 0.6;
    setTimeout(() => { p.actionAnim = ''; }, 600);
    p.removeItem(it);
    const dist = clamp(Math.hypot(p.aimX - p.x, p.aimZ - p.z), 1.5, 9 + p.body.skill('strength'));
    const ang = Math.atan2(p.aimZ - p.z, p.aimX - p.x);
    const t = 0.65;
    const vx = Math.cos(ang) * dist / t, vz = Math.sin(ang) * dist / t;
    op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x + Math.cos(ang) * 0.4, zz: p.z + Math.sin(ang) * 0.4, y: p.y + 1.4, v: [vx, 3.2, vz] });
    setTimeout(() => {
      const lx = p.x + Math.cos(ang) * dist, lz = p.z + Math.sin(ang) * dist;
      noise(p, lx, lz, d.key === 'noisemaker' ? 30 : 12, 'thrown');
      if (d.weapon?.fire) G.items?.startFire?.(p.zoneKey, Math.floor(lx), Math.floor(lz), 2);
      if (d.key.includes('bottle') || d.weapon?.fire) G.audio?.at?.('glass_break', lx, lz);
      // thrown hits
      for (const c of G.creatures?.creatures.values() || []) {
        const cc: any = c;
        if (!cc.dead && cc.zoneKey === p.zoneKey && Math.hypot(cc.x - lx, cc.z - lz) < 1.2 && d.weapon) G.creatures.damage(p.id, cc.id, this.rng.float(d.weapon.dmg[0], d.weapon.dmg[1]), p.x, p.z, 0.3, d.weapon.fire ? 'fire' : 'thrown');
      }
    }, t * 1000);
    bus.emit('inventoryChanged', p);
  }

  shove(p: Player) {
    if (p.attackCooldown > 0) return;
    p.attackCooldown = 0.7;
    p.actionAnim = 'shove'; p.actionT = 0; p.actionDur = 0.45;
    setTimeout(() => { p.actionAnim = ''; }, 450);
    p.body.endurance = Math.max(0, p.body.endurance - 0.04);
    for (const c of G.creatures?.creatures.values() || []) {
      const cc: any = c;
      if (cc.dead || cc.zoneKey !== p.zoneKey) continue;
      const d = Math.hypot(cc.x - p.x, cc.z - p.z);
      if (d > 1.1 + cc.radius || Math.abs(angleDiff(p.facing, Math.atan2(cc.z - p.z, cc.x - p.x))) > 1.0) continue;
      const big = cc.radius > 0.6;
      G.creatures.damage(p.id, cc.id, big ? 0.5 : 1.5, p.x, p.z, big ? 0.15 : 1.2, 'shove');
    }
    G.audio?.at?.('shove', p.x, p.z);
  }
}

export function skillFor(kind: string): any {
  switch (kind) { case 'blade': return 'blade'; case 'spear': return 'spear'; case 'firearm': return 'firearm'; case 'axe': return 'blade'; default: return 'blunt'; }
}

// Where a blow lands and what it carries on into. Round 24 ("combat more realistic and cool, no QTE"):
//  - every melee hit on an inhabitant lands on a part of it (head, body, an arm, a leg), picked from the move,
//    the weapon's line and the size of the thing: a head takes more and is dazed by a club, a leg buckles and
//    goes out from under it, an arm drops its attack, the body is driven back. Blades and axes on a limb feed the
//    gore system's live sever (src/combat/creatureState.ts 'sev'), clubs on a head crack it.
//  - a thing knocked hard enough keeps travelling: for half a second it is tracked, and the first loose piece of
//    furniture it runs into is thrown by the solver (src/world/propPhys.ts) with the creature's weight behind it;
//    something too heavy to move stops it dead (a thud, a jolt through the camera).
// Nothing is drawn here: the parts read from the creature's own body (src/combat/creatureState.ts creaturePose),
// recorded CC0 impact sounds (src/audio/sampleManifest.ts) and the existing gore and camera juice.
import { G } from '../game/G';
import type { Creature } from '../creatures/creature';
import { objDef } from '../world/objects';
import { objFootprint } from '../world/collision';
import { objMass } from '../world/debris';
import { shake, punch } from '../gfx/juice';
import { sizeClass, type MoveKind, type WClass } from './moves';
import { flinch } from './creatureState';

export type HitPart = 'head' | 'body' | 'arm' | 'leg';

/** where the blow lands: the line of the move, the weapon, how tall the thing is, and a little luck */
export function pickPart(c: Creature, kind: MoveKind, cls: WClass, behind: boolean): HitPart {
  const size = sizeClass(c);
  const r = Math.random();
  // ground blows: whatever is up; a stomp is mostly the head or the chest of a thing on the floor
  if (kind === 'stomp') return r < 0.45 ? 'head' : 'body';
  if (kind === 'slash') return r < 0.3 ? 'head' : r < 0.6 ? 'body' : r < 0.8 ? 'arm' : 'leg';
  if (kind === 'shove' || kind === 'tackle') return 'body';
  // something big: the arms reach its legs and its body; its head is up out of reach unless it is bent over
  if (size === 3) return r < 0.08 ? 'head' : r < 0.55 ? 'leg' : r < 0.85 ? 'body' : 'arm';
  // something small: the swing comes down on all of it
  if (size <= 0) return r < 0.4 ? 'head' : 'body';
  const overhand = cls === 'blunt' || cls === 'heavy' || cls === 'axe' || cls === 'improvised';
  const head = (overhand ? 0.3 : cls === 'unarmed' ? 0.38 : 0.2) + (kind === 'heavy' ? 0.08 : 0) + (behind ? 0.1 : 0);
  const leg = cls === 'spear' ? 0.2 : kind === 'lunge' ? 0.18 : 0.12;
  const arm = cls === 'blade' ? 0.24 : 0.16;
  if (r < head) return 'head';
  if (r < head + leg) return 'leg';
  if (r < head + leg + arm) return 'arm';
  return 'body';
}

/** what the part does to the blow: damage, poise, knockback, a daze, legs out, and the sound of it */
export function partEffect(part: HitPart, cls: WClass, size: number, crit: boolean) {
  const blunt = cls === 'blunt' || cls === 'heavy' || cls === 'improvised' || cls === 'unarmed' || cls === 'cyber';
  const cut = cls === 'blade' || cls === 'axe' || cls === 'spear';
  switch (part) {
    case 'head': return {
      dmg: 1.35, po: blunt ? 1.4 : 1.1, knock: 0.9, crit: 0.15,
      // a club to the head rings it: a short daze (the creature reels in place)
      st: blunt && size <= 2 ? 0.9 + (crit ? 0.6 : 0) : undefined, dn: undefined as number | undefined,
      snd: blunt ? 'gore_bone_crack' : 'flesh_cut', sever: cut && crit ? 'head' : '',
    };
    case 'leg': return {
      dmg: 0.9, po: 1.25, knock: 0.7, crit: 0,
      st: undefined as number | undefined,
      // the knee goes: something man-sized or smaller drops
      dn: size <= 2 && (blunt ? Math.random() < 0.3 : Math.random() < 0.15) ? 1.5 : undefined,
      snd: blunt ? 'bone_crunch' : 'flesh_cut', sever: cut ? 'leg' : '',
    };
    case 'arm': return {
      dmg: 0.85, po: 0.9, knock: 0.6, crit: 0,
      st: undefined as number | undefined, dn: undefined as number | undefined,
      snd: blunt ? 'body_thud' : 'flesh_cut', sever: cut ? 'arm' : '',
    };
    default: return {
      dmg: 1, po: 1, knock: 1.15, crit: 0,
      st: undefined as number | undefined, dn: undefined as number | undefined,
      snd: blunt ? 'body_thud' : 'gore_wet_hit', sever: '',
    };
  }
}

interface Flying { c: Creature; t: number; dx: number; dz: number; k: number; hit: Set<number> }

export class Impacts {
  private flying: Flying[] = [];

  /** a creature was driven along (dx, dz) with strength k (about 0.5 a shove .. 2 a tackle): watch where it goes */
  launch(c: Creature, dx: number, dz: number, k: number) {
    if (c.dead || k < 0.45) return;
    const l = Math.hypot(dx, dz) || 1;
    const had = this.flying.find((f) => f.c === c);
    if (had) { had.t = 0; had.dx = dx / l; had.dz = dz / l; had.k = Math.max(had.k, k); return; }
    if (this.flying.length > 6) this.flying.shift();
    this.flying.push({ c, t: 0, dx: dx / l, dz: dz / l, k, hit: new Set() });
  }

  update(dt: number) {
    const pp: any = (G as any).destruct?.props;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      const c = f.c;
      if (f.t > 0.55 || c.dead || !G.local || c.zoneKey !== G.local.zoneKey) { this.flying.splice(i, 1); continue; }
      if (!pp) continue;
      if (this.into(c, f, pp)) this.flying.splice(i, 1);
    }
  }

  /** the first loose thing in its path takes the creature's momentum; true when it hit something */
  private into(c: Creature, f: Flying, pp: any): boolean {
    const z = G.getZone(c.zoneKey);
    const r = (c.radius ?? 0.3) + 0.12;
    const ax = c.x + f.dx * r * 0.6, az = c.z + f.dz * r * 0.6;
    const tx = Math.floor(ax), ty = Math.floor(az);
    const kg = Math.max(8, Math.min(600, 70 * ((c.radius ?? 0.3) / 0.3) ** 2 * ((c.height ?? 1.4) / 1.6)));
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!z.inb(tx + ox, ty + oy)) continue;
      for (const o of z.objectsAt(tx + ox, ty + oy)) {
        if (f.hit.has(o.uid) || o.state?.held) continue;
        const d = objDef(o.key);
        if (!d || (d.block ?? 'solid') === 'none') continue;
        const fp = objFootprint(z, o, d);
        const nx = Math.max(fp.x0, Math.min(ax, fp.x1)), nz = Math.max(fp.z0, Math.min(az, fp.z1));
        const dist = Math.hypot(nx - ax, nz - az);
        if (dist > r * 0.75) continue;
        // only what is ahead of it
        if ((nx - c.x) * f.dx + (nz - c.z) * f.dz < 0) continue;
        f.hit.add(o.uid);
        const speed = 2 + f.k * 2.4;
        const J = kg * speed * 0.6;
        const mass = objMass(d);
        let moved = false;
        try { moved = !!pp.push(z, o, f.dx, f.dz, J, Math.min(1.1, (c.height ?? 1.4) * 0.5), 0.12, Math.min(400, kg * 1.6), { x: nx, z: nz }, 7); } catch { moved = false; }
        const vol = Math.min(1, 0.45 + f.k * 0.3);
        if (moved) {
          // it goes over and the thing goes with it: furniture skids, tall things topple
          G.audio?.at?.(mass > 30 ? 'dmg_hit_wood' : 'dmg_hit_hard', nx, nz, vol);
          G.audio?.at?.('body_thud', c.x, c.z, vol * 0.8);
          shake(0.25 + f.k * 0.12, 0.25); punch(0.04, 0.25);
          c.vx *= 0.45; c.vz *= 0.45;
        } else {
          // a wall of a thing: it stops dead against it
          G.audio?.at?.('body_thud', c.x, c.z, vol);
          G.audio?.at?.('dmg_hit_hard', nx, nz, vol * 0.6);
          shake(0.3 + f.k * 0.15, 0.25); punch(0.05, 0.3);
          c.vx = -c.vx * 0.15; c.vz = -c.vz * 0.15;
        }
        // the jolt back through it
        flinch(c, -f.dx, -f.dz, Math.min(1.5, 0.6 + f.k * 0.4));
        try { G.combat?.slam?.(c, f.k, moved); } catch { /* combat not ready */ }
        return true;
      }
    }
    return false;
  }
}

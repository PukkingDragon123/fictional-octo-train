// The passive, frightened brain shared by the harmless things (bubble rabbits,
// cowerlings): they live their own small lives, flee from survivors, freeze
// and play dead, beg when cornered, and only fight back when struck with
// nowhere to run. Leave them be and some of them pay you back. Kill one and
// the rest of its kind in that zone stop trusting anyone.
//
// Replicated pose for animate(): net(c).pose = '' | 'dead' | 'beg' | 'cower'.
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { net, playersIn, dist, hold, face, rng } from '../behaviors_b';
import { pulse, attack } from '../behaviors_a';
import { ruleShown } from '../rules';

export interface ScaredOpts {
  /** flee when a survivor comes this close (walking) */
  fleeR: number;
  /** ... or this close while sneaking */
  sneakR?: number;
  /** freeze and play dead when this close (instead of running) */
  playDeadR?: number;
  /** what it does when it cannot get away */
  cornered: 'beg' | 'playDead' | 'bite' | 'custom';
  onCornered?: (c: Creature, p: Player) => void;
  /** spared after it played dead or begged: once per creature */
  gift?: (c: Creature, p: Player) => void;
  /** wander radius around home */
  roam?: number;
}

/** zone-wide distrust after a killing (zone.meta.fear_<key>) */
export function distrust(c: Creature) { const z = G.getZone(c.zoneKey); z.meta['fear_' + c.sp.key] = (z.meta['fear_' + c.sp.key] ?? 0) + 1; }
const feared = (c: Creature) => (G.getZone(c.zoneKey).meta['fear_' + c.sp.key] ?? 0) > 0;

function nearest(c: Creature): { p: Player; d: number } | null {
  let best: Player | null = null, bd = 30;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}

export function scaredThink(c: Creature, dt: number, o: ScaredOpts): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  const pl = pulse(c);
  if (pl.hurt > 0) { m.hurtBy = c.targetId; m.wasHurt = true; }
  const t = nearest(c);
  const fear = feared(c) ? 1.6 : 1;
  let r = 0;
  if (t) r = (t.p.stance === 'sneak' ? (o.sneakR ?? o.fleeR * 0.45) : o.fleeR) * (t.p.running ? 1.4 : 1) * fear;
  // sample progress for corner detection
  m.sT = (m.sT ?? 0) - dt;
  if (m.sT <= 0) { m.sT = 0.8; m.moved = Math.hypot(c.x - (m.sx ?? c.x), c.z - (m.sz ?? c.z)); m.sx = c.x; m.sz = c.z; }
  const spared = (p: Player) => {
    if (!m.wasHurt && !m.gifted && !feared(c) && o.gift) { m.gifted = true; o.gift(c, p); ruleShown(c); }
  };
  switch (c.state) {
    case 'frozen': {
      // lying still on its back; it peeks, it waits
      n.pose = 'dead'; hold(c);
      if (pl.hurt > 0) { n.pose = ''; flee(c, t?.p); return true; }
      if (!t || t.d > Math.max(r, 3) * 1.2) { m.calmT = (m.calmT ?? 0) + dt; if (m.calmT > 2.5) { n.pose = ''; c.setState('idle'); if (t) spared(t.p); } }
      else { m.calmT = 0; if (t.d < 1.8 && c.stateT > 5 && o.cornered === 'beg') { c.setState('warn'); n.pose = 'beg'; } }
      return true;
    }
    case 'warn': {
      // begging: knelt, hands together, chirping
      n.pose = 'beg'; hold(c);
      if (t) face(c, t.p.x, t.p.z);
      if (c.noiseCooldown <= 0) { cs.call(c, 'idle'); c.noiseCooldown = 1.6; }
      if (pl.hurt > 0 || m.wasHurt && t && t.d < 1.4 && c.attackT <= 0) { if (t && t.d < 1.5 && c.sp.attack && c.attackT <= 0) { n.pose = ''; c.setState('attack'); attack(c, t.p); } else { n.pose = ''; flee(c, t?.p); } return true; }
      if (!t || t.d > 4.5) { n.pose = ''; c.setState('idle'); if (t) spared(t.p); }
      else if (c.stateT > 9) { n.pose = ''; flee(c, t.p); }
      return true;
    }
    case 'attack':
      if (c.attackPhase <= 0) flee(c, t?.p);
      return true;
    case 'flee': {
      n.pose = '';
      if (!c.goal) c.goal = cs.fleeSpot(c, z, t?.p.x ?? c.x, t?.p.z ?? c.z);
      const arrived = cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.8);
      // cornered: not getting anywhere with someone right on it
      if (t && t.d < 2.2 && c.stateT > 1.2 && (m.moved ?? 1) < 0.35) { cornered(c, t.p, o); return true; }
      if (arrived || c.stateT > 7) {
        if (t && t.d < r) { c.goal = cs.fleeSpot(c, z, t.p.x, t.p.z); c.stateT = 0; }
        else { c.setState('hide'); n.pose = 'cower'; }
      }
      return true;
    }
    case 'hide':
      n.pose = 'cower'; hold(c);
      if (t && t.d < r * 0.8) { if (o.playDeadR && t.d < o.playDeadR) playDead(c); else flee(c, t.p); return true; }
      if (c.stateT > 6 + rng.float(0, 6)) { n.pose = ''; c.setState('idle'); }
      return true;
    default:
      break;
  }
  if (t && t.d < r) {
    if (o.playDeadR && t.d < o.playDeadR) playDead(c);
    else { flee(c, t.p); cs.call(c, 'alert'); }
    return true;
  }
  // its own small life
  n.pose = '';
  if (c.state === 'wander') {
    if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk * 0.7, dt, 0.5) || c.stateT > 15) c.setState('idle');
  } else if (c.state === 'graze') {
    hold(c);
    if (c.stateT > 4 + rng.float(0, 5)) c.setState('idle');
  } else {
    if (c.state !== 'idle') c.setState('idle');
    hold(c);
    if (c.stateT > 2 + rng.float(0, 4)) {
      if (rng.chance(0.4)) c.setState('graze');
      else { c.setState('wander'); c.goal = cs.wanderSpot(c, z, o.roam ?? 8); }
    }
    if (c.noiseCooldown <= 0 && rng.chance(dt * 0.05)) { cs.call(c, 'idle'); c.noiseCooldown = 7; }
  }
  return true;
}

function flee(c: Creature, p?: Player) {
  const z = G.getZone(c.zoneKey);
  c.setState('flee');
  c.goal = G.creatures.fleeSpot(c, z, p?.x ?? c.x, p?.z ?? c.z);
}
function playDead(c: Creature) {
  c.setState('frozen');
  c.mem.calmT = 0;
  net(c).pose = 'dead';
  G.creatures.call(c, 'hurt');
  ruleShown(c);
}
function cornered(c: Creature, p: Player, o: ScaredOpts) {
  if (o.cornered === 'custom' && o.onCornered) { o.onCornered(c, p); return; }
  if (o.cornered === 'playDead') { playDead(c); return; }
  if (o.cornered === 'beg') { c.setState('warn'); net(c).pose = 'beg'; ruleShown(c); return; }
  if (c.sp.attack && c.attackT <= 0) { c.setState('attack'); attack(c, p); }
}

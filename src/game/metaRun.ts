// A run under the Meridian file (src/game/meridian.ts): the session calls
// startMetaRun() once the local survivor exists. Every session (new, loaded,
// co-op) wears the loadout's powers (body perks) and listens for study and
// commendations; a NEW run also counts toward the milestones, gets the
// earned starting kit and (solo / host) brings the deployed pet, which is
// spawned next to the survivor once they stand somewhere real (after the
// intake intro) and is moved along whenever its survivor changes floor.
// Pets are ordinary tamed creatures (tamedBy, mem.pet), so saves keep them.
import type { Game } from './game';
import type { Player } from '../entities/player';
import { G } from './G';
import { bus } from '../core/events';
import { species } from '../creatures/registry';
import { wireStudy, loadoutPerks, loadout, noteRunStart, noteRunEnd, startingKit, STARTER_PET, PET_TINTS } from './meridian';
import { wireAchievements, runStarted } from './achievements';
import '../creatures/species/roach';

export function startMetaRun(g: Game, p: Player, o: { fresh: boolean; give: (key: string) => void; ready: () => boolean }) {
  wireStudy((k: any) => !!k && (k === p || k === p.id));
  // the file remembers the run before the commendations read it
  let ended = false;
  bus.on('runReport', (r: any) => { if (!ended) { ended = true; noteRunEnd(String(r?.cause?.who || r?.cause?.text || 'unknown')); } });
  bus.on('death', (pl: Player) => { if (pl === p) setTimeout(() => { if (!ended) { ended = true; noteRunEnd('unknown'); } }, 4000); });
  wireAchievements(() => G.local?.id);
  for (const k of loadoutPerks()) p.body.perks.add(k);
  if (!o.fresh) { g.addSystem(petKeeper(g)); return; }
  noteRunStart();
  for (const k of startingKit()) { try { o.give(k); } catch { /* unknown item */ } }
  const pet = g.role !== 'client' ? loadout().pet : null;
  runStarted(!!pet && !!species(pet));
  g.addSystem(petKeeper(g, pet && species(pet) ? { key: pet, owner: p, ready: o.ready } : null));
}

/** spawns the deployed pet once, then keeps every pet on its survivor's floor */
function petKeeper(g: Game, want: { key: string; owner: Player; ready: () => boolean } | null = null) {
  let t = 0;
  return {
    name: 'pets',
    update(dt: number) {
      t -= dt;
      if (t > 0) return;
      t = 0.5;
      const cs: any = G.creatures;
      if (!cs) return;
      if (want && !want.owner.body.dead && want.ready() && !g.transitioning && g.view) {
        const p = want.owner, z = g.getZone(p.zoneKey);
        const [x, y] = g.nearestWalkable(z, Math.floor(p.x - Math.cos(p.facing) * 1.2), Math.floor(p.z - Math.sin(p.facing) * 1.2));
        const c = cs.spawn(want.key, p.zoneKey, x + 0.5, y + 0.5, { tamedBy: p.id });
        if (c) {
          const L = loadout(), sp: any = species(want.key);
          c.mem.pet = true; c.mem.persistent = true;
          if (want.key === STARTER_PET) { c.mem.hat = L.petHat ?? null; c.mem.tint = L.petTint ?? PET_TINTS[0].key; }
          c.feeds = sp?.tame?.feeds ?? 0;
          c.name = sp?.name ?? c.name;
          bus.emit('petDeployed', c, p);
        }
        want = null;
      }
      // a pet left behind on another floor follows its survivor
      if (g.transitioning) return;
      for (const c of cs.creatures.values()) {
        if (!c.mem?.pet || c.dead || !c.tamedBy) continue;
        const o = G.players.get(c.tamedBy);
        if (!o || o.body.dead || o.zoneKey === c.zoneKey) continue;
        const z = g.getZone(o.zoneKey);
        const [x, y] = g.nearestWalkable(z, Math.floor(o.x), Math.floor(o.z));
        if (c.rig) { cs.root.remove(c.rig.root); c.rig = null; }
        c.zoneKey = o.zoneKey; c.x = x + 0.5; c.z = y + 0.5; c.path = null; c.goal = null; c.home = { x: c.x, z: c.z };
      }
    },
  };
}

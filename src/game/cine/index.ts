// Round 15 (WORLD): the first-person cinematics. installCine() is called once per
// session (src/game/session.ts): the crossings between levels (./travel.ts), the
// first-visit reveals and the facility finds (./moments.ts), and on a re-entry from a
// checkpoint the relay's own shot. See ./engine.ts for the shot machinery.
import type { Game } from '../game';
import { G } from '../G';
import { installTravelCine, type Entrance } from './travel';
import { installMoments, reentryShot, revealLevel, facilityFound, checkpointShot } from './moments';
import { cineEnabled, cineRunning } from './engine';
import type { FacInfo } from '../../world/gen/facilities';

export { cineEnabled, cineRunning, checkpointShot };

export function installCine(g: Game, o: { reentry?: boolean } = {}) {
  installTravelCine(g);
  installMoments();
  if (o.reentry) {
    // after the first frames are up (the session starts the loop after this)
    let t = 0;
    const sys = { name: 'cineReentry', update: (dt: number) => {
      t += dt;
      if (t < 0.4) return;
      g.systems.splice(g.systems.indexOf(sys), 1);
      const cp = (G as unknown as { checkpoint?: { label?: string } }).checkpoint;
      reentryShot(cp?.label || 'the relay');
    } };
    g.addSystem(sys);
  }
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const w = window as unknown as { __crossing?: { test: (k?: Entrance) => unknown }; __cine: unknown };
    w.__cine = {
      cross: (k: Entrance) => w.__crossing?.test(k),
      reveal: (zone = g.local.zoneKey) => revealLevel(zone, true),
      facility: (i = 0) => { const f = ((G.zone?.meta?.facilities || []) as FacInfo[])[i]; return f ? facilityFound(f, G.zone.key, true) : null; },
      reentry: () => reentryShot('Relay 0-A'),
      get running() { return cineRunning(); },
    };
    // ?cinetest=<lift|stairs_down|stairs_up|crawl_duct|crawl_pipe|liquid|door|reveal|reentry> plays one a few seconds in
    const q = new URLSearchParams(location.search).get('cinetest');
    if (q) setTimeout(() => {
      const c = w.__cine as { cross: (k: Entrance) => unknown; reveal: () => unknown; reentry: () => unknown; facility: () => unknown };
      if (q === 'reveal') c.reveal(); else if (q === 'reentry') c.reentry(); else if (q === 'facility') c.facility(); else c.cross(q as Entrance);
    }, Number(new URLSearchParams(location.search).get('cineat') || 4000));
  }
}

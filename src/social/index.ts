// The social layer and the shared floors, installed into a running session:
// G.social (emotes, whistles, shouts, the 8-bit voice), G.floors (holes,
// falling, other players' floors) and the dimensions' rules (src/social/dims).
import type { Game } from '../game/game';
import { SocialSystem } from './social';
import { FloorSystem } from './floors';
import { DimensionSystem } from './dims';
import { bus } from '../core/events';

export function installSocial(g: Game) {
  const social = new SocialSystem();
  g.social = social;
  g.addSystem(social);
  const floors = new FloorSystem();
  g.floors = floors;
  g.addSystem(floors);
  const dims = new DimensionSystem();
  floors.dims = dims;
  g.addSystem(dims);
  if (import.meta.env.DEV) (window as any).__vxBus = bus;
}

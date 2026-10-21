// The social layer and the shared floors, installed into a running session:
// G.social (emotes, whistles, shouts, the 8-bit voice), G.floors (holes,
// falling, other players' floors), the dimensions' rules (src/social/dims)
// and the enamel faces of the signs that name the floors (src/social/signs).
import type { Game } from '../game/game';
import { SocialSystem } from './social';
import { FloorSystem } from './floors';
import { DimensionSystem } from './dims';
import { SignSystem } from './signs';
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
  g.addSystem(new SignSystem());
  if (import.meta.env.DEV) (window as any).__vxBus = bus;
}

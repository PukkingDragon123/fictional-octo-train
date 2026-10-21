// One hook for the session: scanning for data, domination (brain swaps and
// thralls) and the tribes. Content (items, objects, species, camps, quests)
// registers on import; the systems are built once a game exists.
import type { Game } from '../game/game';
import '../scan/items';
import '../dominion/brains';
import './props';
import './camp';
import './npc';
import './quests';
import { ScanSystem } from '../scan/scan';
import { DominionSystem } from '../dominion/dominion';
import { TribeSystem } from './tribes';
import { tribeSounds } from './sounds';

export function installFactions(g: Game) {
  tribeSounds();
  g.addSystem(new ScanSystem());
  g.addSystem(new DominionSystem());
  g.addSystem(new TribeSystem());
}

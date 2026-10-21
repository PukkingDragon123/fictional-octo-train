// Build mode, welding, settlements and farming: G.build.
//   G.build.toggle(on?)            enter / leave build mode (B)
//   G.build.captures()             true while build mode owns the mouse
//   G.build.useObject(p, o)        E on planters, frames, the compactor, the beacon
//   G.build.settle.stations(zk?)   staffable stations;  .assignWorker(zk, uid, id|null);  .stationWork(zk, uid, dt)
//   G.build.farm                   planters / hydro racks
import type { Game } from '../game/game';
import { lootTable } from '../items/loot';
import { BuildSystem } from './build';
import './ops';
import './sounds';
import './content';

/** salvage and the torch show up where tools and machines are kept */
function seedLoot() {
  const add = (table: string, entries: [string, number][]) => {
    const t = lootTable(table); if (!t) return;
    for (const e of entries) if (!t.entries.some((x) => x[0] === e[0])) t.entries.push(e);
  };
  add('maintenance', [['welding_torch', 1.2], ['steel_frame', 1], ['motor', 0.8]]);
  add('toolbox', [['welding_torch', 1]]);
  add('debris_metal', [['steel_frame', 2], ['sheet_metal', 2]]);
  add('debris_elec', [['motor', 1.5]]);
  add('debris_fabric', [['steel_frame', 0.8]]);
}

export function installBuild(g: Game): BuildSystem {
  seedLoot();
  const b = new BuildSystem();
  g.build = b;
  g.addSystem(b);
  return b;
}

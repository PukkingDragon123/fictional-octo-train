import { Game, GameSystem } from './game';
import { G } from './G';
import { SurvivalSystem } from '../survival/survivalSystem';
import { Player } from '../entities/player';
import { Appearance, randomAppearance } from '../entities/humanRig';
import { Item, hasItemDef } from '../items/item';
import { Rng } from '../core/rng';
import { createItem } from '../items/factory';
import { UI } from '../ui/ui';
import { InventoryUI } from '../ui/inventory';
import { Interact } from '../interact/world';
import { FloorItemRenderer } from '../items/worldItems';
import { bus } from '../core/events';
import { CreatureSystem } from '../creatures/manager';
import { CombatSystem } from './combat';
import { Scanner } from '../ui/scanner/scanner';
import { AudioEngine } from '../audio/audio';
import { MissionSystem } from '../missions/missions';
import '../missions/directives';
import { ShiftSystem } from '../world/shift';
import '../game/worldOps';
import '../world/zones';

export interface NewGameOpts {
  name: string;
  app?: Appearance;
  occupation?: string;
  traits?: string[];
  seed?: number;
}

export function newItem(key: string, extra: Partial<Item> = {}): Item {
  return { ...createItem(key, undefined, { pristine: true }), ...extra };
}

/** Renders floor items & handles global hotkeys */
class WorldExtras implements GameSystem {
  name = 'extras';
  floor = new FloorItemRenderer();
  constructor(g: Game) { g.pr.scene.add(this.floor.root); }
  update(dt: number) {
    const g = G;
    if (!g.view) return;
    const p = g.local;
    const R = g.pr.lowW * g.pr.pxSize * 0.7 + 4;
    this.floor.update(g.zone, g.pr.target.x, g.pr.target.z, R, (x, y) => g.view!.vis.isVisible(x, y), dt);
    const inp = g.input;
    if (inp.hit('inventory')) g.ui?.inventory?.toggle();
    if (inp.hit('scanner')) g.ui?.scanner?.toggle?.();
    if (inp.hit('map')) g.ui?.scanner?.toggle?.(true, 'map');
    void p;
  }
}

/** Boot a single-player session straight into Level 0. */
export function startSolo(opts: NewGameOpts): Game {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const g = new Game(canvas);
  g.worldSeed = opts.seed ?? 1337;
  const surv = new SurvivalSystem();
  g.survival = surv;
  g.addSystem(surv);
  g.addSystem(new WorldExtras(g));
  g.addSystem(new CreatureSystem());
  g.addSystem(new CombatSystem());
  const audio = new AudioEngine();
  g.audio = audio;
  g.addSystem({ name: 'audio', update: (dt) => audio.update(dt) });
  const missions = new MissionSystem();
  g.missions = missions;
  g.addSystem(missions);
  g.addSystem(new ShiftSystem());
  const ui = new UI();
  g.ui = ui;
  ui.inventory = new InventoryUI(ui);
  new Scanner();
  const interact = new Interact();
  const app = opts.app || randomAppearance(Math.random);
  const p = new Player('local', opts.name, app, true);
  for (const t of opts.traits || []) p.body.traits.add(t);
  p.setOccupation(opts.occupation || 'unemployed');
  const start = ['tshirt', 'jeans', 'sneakers', 'socks'];
  for (const k of start) if (hasItemDef(k)) { const it = newItem(k); p.inv.add(it); p.wear(it); }
  for (const k of ['water_bottle', 'almond_water', 'granola_bar', 'lighter']) if (hasItemDef(k)) p.inv.add(newItem(k));
  g.local = p;
  g.addPlayer(p);
  ui.onWorldClick = (t, b) => {
    if (p.body.dead) return;
    if (ui.scanner?.open && t.kind === 'creature' && b === 0) { ui.scanner.scanCreature(t.c); return; }
    if (b === 2) { const m = interact.menu(p, t); ui.openMenu(g.input.mouseX, g.input.mouseY, m.title, m.opts); }
    else interact.defaultAction(p, t);
  };
  ui.onInteractKey = () => {
    if (ui.hover && ui.hover.kind !== 'tile') { interact.defaultAction(p, ui.hover); return; }
    // nearest interactable in front
    const objs = interact.objectsNear(p, 1.6);
    if (objs.length) { interact.defaultAction(p, { kind: 'object', obj: objs[0], point: p.pos }); return; }
  };
  bus.on('death', (pl: Player) => {
    if (pl !== p) return;
    setTimeout(() => ui.centerMessage(`YOU HAVE BEEN DELETED<br><span style="font-size:20px;letter-spacing:2px;color:#a89a72">${p.name} survived ${Math.floor(g.clock.hours / 24)} days, ${Math.floor(g.clock.hours % 24)} hours</span>`, { label: 'Begin again', action: () => location.reload() }), 1500);
  });
  const z = g.getZone('lobby');
  const sp = (z.meta.spawn as [number, number]) || z.randomFloor(new Rng(3)) || [10, 10];
  g.placePlayer(p, 'lobby', sp[0], sp[1], 0);
  (window as any).__game = g;
  document.getElementById('boot')?.classList.add('gone');
  g.start();
  return g;
}

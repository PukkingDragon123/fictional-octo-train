import { Game, GameSystem } from './game';
import { G } from './G';
import { SurvivalSystem } from '../survival/survivalSystem';
import { Player } from '../entities/player';
import { Appearance, randomAppearance } from '../entities/humanRig';
import { Item, hasItemDef, itemDef } from '../items/item';
import { Rng, setUidSlot } from '../core/rng';
import { createItem } from '../items/factory';
import { UI } from '../ui/ui';
import { InventoryUI } from '../ui/inventory';
import { Interact } from '../interact/world';
import { FloorItemRenderer } from '../items/worldItems';
import { bus } from '../core/events';
import { CreatureSystem } from '../creatures/manager';
import { CombatSystem } from './combat';
import { GoreSystem } from '../gore/gore';
import { Scanner } from '../ui/scanner/scanner';
import { Watch } from '../ui/watch/watch';
import { AudioEngine } from '../audio/audio';
import { MissionSystem } from '../missions/missions';
import '../missions/directives';
import { ShiftSystem } from '../world/shift';
import { WorldSystems } from '../items/worldSystems';
import { VehicleSystem } from '../vehicles/vehicles';
import { replayOps, op } from './ops';
import { restorePlayer, restoreAfterLoad, saveGame, SaveData } from './save';
import { occupationByKey } from '../survival/traits';
import { PauseMenu } from '../ui/menus/pause';
import { TouchControls } from '../ui/touch/touch';
import type { Net, Welcome } from '../net/net';
import { introWanted, startIntro, INTRO_ZONE } from './intro';
import '../game/worldOps';
import '../world/zones';

export interface SessionOpts {
  mode: 'solo' | 'host' | 'client';
  name: string;
  app?: Appearance;
  occupation?: string;
  traits?: string[];
  seed?: number;
  sandbox?: Partial<Game['sandbox']>;
  directives?: boolean;
  net?: Net;
  welcome?: Welcome;
  save?: SaveData;
}
/** kept for dev entry points */
export interface NewGameOpts { name: string; app?: Appearance; occupation?: string; traits?: string[]; seed?: number }

export function newItem(key: string, extra: Partial<Item> = {}): Item {
  return { ...createItem(key, undefined, { pristine: true }), ...extra };
}

/** Renders floor items & handles global hotkeys */
class WorldExtras implements GameSystem {
  name = 'extras';
  floor = new FloorItemRenderer();
  private autosaveT = 300;
  private shoutT = 0;
  constructor(g: Game) { g.pr.scene.add(this.floor.root); }
  update(dt: number) {
    const g = G;
    if (!g.view) return;
    const R = g.pr.lowW * g.pr.pxSize * 0.7 + 4;
    this.floor.update(g.zone, g.pr.target.x, g.pr.target.z, R, (x, y) => g.view!.vis.isVisible(x, y), dt);
    const inp = g.input;
    if (inp.hit('inventory')) g.ui?.inventory?.toggle();
    if (inp.hit('scanner')) g.ui?.scanner?.toggle?.();
    if (inp.hit('map')) g.ui?.scanner?.toggle?.(true, 'map');
    // Q: shout. Friends hear it across the floor; so does everything else.
    this.shoutT -= dt;
    if (inp.hit('shout') && this.shoutT <= 0 && !g.local.body.dead && !g.ui?.scanner?.open) {
      this.shoutT = 2.5;
      const p = g.local;
      const alone = g.players.size <= 1;
      const lines = alone ? ['HELLO?!', 'IS ANYONE THERE?', 'HEY!', 'HELLO?'] : ['HEY!', 'OVER HERE!', 'HERE!', 'COME HERE!', 'WAIT UP!'];
      const text = lines[Math.floor(Math.random() * lines.length)];
      g.ui?.say?.(p, text, 'shout', 2.5);
      g.audio?.at?.('shout', p.x, p.z, 1);
      bus.emit('noise', { x: p.x, z: p.z, radius: 28, kind: 'shout', zone: p.zoneKey, by: p.id });
      g.net?.shout?.(text);
      bus.emit('shout', p);
    }
    // autosave every five minutes (solo / host)
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) { this.autosaveT = 300; if (g.role !== 'client' && !g.local.body.dead) saveGame().then((ok) => { if (ok) g.ui?.toast?.('SAVED', '', 1.5); }); }
  }
}

export function startSolo(opts: NewGameOpts): Game {
  return startSession({ mode: 'solo', ...opts });
}

/** Build a complete running game: new world, loaded save, co-op host or co-op client. */
export function startSession(o: SessionOpts): Game {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const g = new Game(canvas);
  g.role = o.mode;
  const w = o.welcome, s = o.save;
  g.worldSeed = w?.seed ?? s?.seed ?? o.seed ?? 1337;
  Object.assign(g.sandbox, w?.sandbox ?? s?.sandbox ?? o.sandbox ?? {});
  if (o.net) {
    g.net = o.net;
    setUidSlot(Math.max(0, Number(o.net.id.slice(1)) - 1));
  }
  if (s) { g.saveId = s.id; g.playMinutes = s.playMinutes || 0; }
  g.clock.hours = w?.hours ?? s?.hours ?? g.sandbox.startHour;
  g.collapse = w?.collapse ?? s?.collapse ?? 0;

  // on-screen controls run first so their input is in place before other systems read it
  g.addSystem(new TouchControls(g));
  const surv = new SurvivalSystem();
  g.survival = surv;
  g.addSystem(surv);
  g.addSystem(new WorldExtras(g));
  g.addSystem(new CreatureSystem());
  g.addSystem(new CombatSystem());
  g.addSystem(new GoreSystem());
  const audio = new AudioEngine();
  g.audio = audio;
  g.addSystem({ name: 'audio', update: (dt) => audio.update(dt) });
  const missions = new MissionSystem();
  g.missions = missions;
  missions.enabled = o.directives ?? true;
  g.addSystem(missions);
  g.addSystem(new ShiftSystem());
  const items = new WorldSystems();
  g.items = items;
  g.addSystem(items);
  g.addSystem(new VehicleSystem());
  if (o.net) g.addSystem(o.net);
  const ui = new UI();
  g.ui = ui;
  ui.inventory = new InventoryUI(ui);
  new Scanner();
  new Watch();
  const interact = new Interact();
  new PauseMenu();

  // ---- the survivor
  const id = o.net?.id ?? 'p1';
  const app = s?.player?.app ?? o.app ?? randomAppearance(Math.random);
  const p = new Player(id, s?.player?.name ?? o.name, app, true);
  if (s) restorePlayer(p, s.player);
  else {
    for (const t of o.traits || []) p.body.traits.add(t);
    p.setOccupation(o.occupation || 'unemployed');
    const start = ['tshirt', 'jeans', 'sneakers', 'socks', 'wrist_monitor'];
    for (const k of start) if (hasItemDef(k)) { const it = newItem(k); p.inv.add(it); p.wear(it); }
    for (const k of ['water_bottle', 'almond_water', 'granola_bar']) if (hasItemDef(k)) p.inv.add(newItem(k));
    // the job's kit: clothing and bags go on (as the personnel-file preview shows), the rest into the pockets
    for (const k of occupationByKey(p.occupation).items) {
      if (!hasItemDef(k)) continue;
      const it = newItem(k); p.inv.add(it);
      const d = itemDef(k);
      if (d.clothing || d.bag?.slot === 'back') p.wear(it);
    }
  }
  g.local = p;
  g.addPlayer(p);

  // ---- the world: mission state, then every change ever made (op log)
  const mstate = w?.missions ?? s?.missions;
  if (mstate) missions.load(mstate);
  if (o.directives === false) missions.enabled = false;
  const log = w?.log ?? s?.log;
  if (log?.length) replayOps(log);
  if (s) restoreAfterLoad(s);
  if (w) for (const [zk, f] of Object.entries(w.fires || {})) g.getZone(zk).meta.fires = f;
  if (w?.vehicles) { for (const v of w.vehicles) g.getZone(v.zone); (g as any).vehicles?.load?.(w.vehicles); }

  // ---- input routing
  ui.onWorldClick = (t, b) => {
    if (p.body.dead) return;
    if (items.placing && items.placementClick(b)) return;
    if (ui.scanner?.open && t.kind === 'creature' && b === 0) { ui.scanner.scanCreature(t.c); return; }
    if (b === 2) { const m = interact.menu(p, t); ui.openMenu(g.input.mouseX, g.input.mouseY, m.title, m.opts); }
    else interact.defaultAction(p, t);
  };
  ui.onInteractKey = () => {
    if (p.inVehicle) return;
    if (ui.hover && ui.hover.kind !== 'tile') { interact.defaultAction(p, ui.hover); return; }
    const objs = interact.objectsNear(p, 1.6);
    if (objs.length) { interact.defaultAction(p, { kind: 'object', obj: objs[0], point: p.pos }); return; }
  };
  bus.on('death', (pl: Player) => {
    if (pl !== p) return;
    const days = Math.floor(g.clock.hours / 24), hrs = Math.floor(g.clock.hours % 24);
    setTimeout(() => ui.centerMessage(`YOU HAVE BEEN DELETED<br><span style="font-size:20px;letter-spacing:2px;color:#a89a72">${escape(p.name)} survived ${days} days, ${hrs} hours</span>`, { label: 'Back to the title', action: () => location.reload() }), 1500);
  });

  // ---- where we start
  if (w) {
    // a host still in the opening intro: friends wake in the Lobby spawn room instead
    const lobbySpawn = () => (g.getZone('lobby').meta.spawn as [number, number]) || [10, 10];
    const wz = w.zone === INTRO_ZONE ? 'lobby' : w.zone, wsp = w.zone === INTRO_ZONE ? lobbySpawn() : w.spawn;
    const z = g.getZone(wz);
    const [x, y] = g.nearestWalkable(z, wsp[0], wsp[1]);
    g.placePlayer(p, wz, x, y, 0);
    for (const q of w.players) {
      if (q.id === id || g.players.has(q.id)) continue;
      const rp = new Player(q.id, q.name, q.app, false);
      if (q.state) { rp.x = q.state.x; rp.z = q.state.z; rp.zoneKey = q.state.zone; rp.remote = { tx: q.state.x, tz: q.state.z, tf: q.state.f, t: 0, state: q.state }; }
      g.addPlayer(rp);
    }
  } else if (s && s.player.zoneKey !== INTRO_ZONE) {
    const z = g.getZone(s.player.zoneKey);
    const [x, y] = g.nearestWalkable(z, Math.floor(s.player.x), Math.floor(s.player.z));
    g.placePlayer(p, s.player.zoneKey, x, y, s.player.facing);
  } else {
    const z = g.getZone('lobby');
    const sp = (z.meta.spawn as [number, number]) || z.randomFloor(new Rng(3)) || [10, 10];
    // a brand-new world opens in normal reality and noclips into the Lobby (src/game/intro.ts)
    if (!s && introWanted(o.mode)) startIntro(g, p, sp);
    else g.placePlayer(p, 'lobby', sp[0], sp[1], 0);
  }
  (window as any).__game = g;
  if (import.meta.env.DEV) (window as any).__dev = { newItem, op };
  document.getElementById('boot')?.classList.add('gone');
  g.sessionStart = performance.now();
  g.start();
  return g;
}

function escape(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }

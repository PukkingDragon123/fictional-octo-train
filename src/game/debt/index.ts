// The debt contract: the new main goal. Pay off the crew's debt by salvaging
// valuables into Remittance Hoppers, keep up with the installments, then buy
// passage out at the depot. The BAILIFF band enforces it.
//
//   ledger.ts     G.debt: the shared ledger, installments, penalties ('debtChanged')
//   values.ts     what every item / piece of furniture is worth, what furniture hides
//   hopper.ts     hopper processing ('deposited'), overlays, menus
//   hopperPlace.ts  a hopper in every zone (post-generation hook), the kiosk
//   band.ts       G.band: escape detection, shocks, removal, detonation
//   transport.ts  the kiosk, the transports, boarding, the ending
//   voice.ts      handler / band lines
//
// Free survival (directives off) has no contract: hoppers stay cold, no band.
import { bus } from '../../core/events';
import { G } from '../G';
import { op } from '../ops';
import { addStat } from '../profile';
import { createItem, serializeItem } from '../../items/factory';
import { objDef } from '../../world/objects';
import type { Game } from '../game';
import type { Player } from '../../entities/player';
import type { Zone, TileObject } from '../../world/zone';
import type { Item } from '../../items/item';
import type { Container } from '../../items/container';
import type { MenuOption } from '../../ui/ui';
import { DebtSystem } from './ledger';
import { BandSystem } from './band';
import { HopperSystem } from './hopper';
import { TransportSystem } from './transport';
import { stashKind, rollStash, isValuable, itemValue } from './values';
import { installHopperPlacement } from './hopperPlace';
import { voss, selfThought, pick } from './voice';
import './sounds';

export { DebtSystem, BandSystem, HopperSystem, TransportSystem };

let listening = false;

/** create the contract systems for a session (after the mission system) */
export function installContract(g: Game) {
  installHopperPlacement();
  const debt = new DebtSystem();
  g.addSystem(debt);
  const band = new BandSystem();
  g.addSystem(band);
  const hop = new HopperSystem();
  debt.hoppers = hop;
  g.addSystem(hop);
  const tr = new TransportSystem();
  debt.transport = tr;
  g.addSystem(tr);
  if (!listening) {
    listening = true;
    bus.on('objBroken', (z: Zone, o: TileObject, by: string | null, how: string) => { try { onBroken(z, o, by, how); } catch (e) { console.warn('stash', e); } });
    bus.on('inventoryChanged', (p: Player) => { if (p?.isLocal && !G.missions?.flags?.has('tut:valuable') && p.allItems().some(isValuable)) G.missions?.set?.('tut:valuable'); });
  }
  if (import.meta.env.DEV) (window as any).__debt = { debt, band, hop, tr, smash: devSmash, value: itemValue };
  return debt;
}

/** a new world: the starting kit of a Remittance debtor */
export function issueKit(p: Player, add: (key: string, wear?: boolean) => Item | null) {
  add('prison_jumpsuit', true);
  add('canvas_slipons', true);
  add('issue_pack', true);
  add('ration_bar');
  add('water_pouch');
}

/** the session is starting without the intro (?quick, intro off): the band is already on */
export function skipIntake(p: Player) {
  if (!G.missions?.enabled) return;
  G.band?.fit?.(p, { silent: true });
  G.missions?.set?.('contract:intake');
}

let saidSmash = false;
/** furniture broke: whoever broke it shakes out what was hidden inside */
function onBroken(z: Zone, o: TileObject, by: string | null, how: string) {
  void how;
  if (!by || by !== G.local?.id || !o) return;
  G.missions?.set?.('tut:smash');
  addStat('furniture_smashed');
  const d = objDef(o.key);
  if (!d || d.onWall || d.ceiling) return;
  const kind = stashKind(o, d);
  const luck = G.local.body.has?.('lucky') ? 1.25 : 1;
  const keys = rollStash(kind, luck);
  const w = d.w ?? 1, dd = d.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  const cx = o.x + rw / 2, cz = o.y + rd / 2;
  keys.forEach((k, i) => {
    const it = createItem(k);
    const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 1.4;
    op('dropFloor', { z: z.key, item: serializeItem(it), x: cx + (Math.random() - 0.5) * rw * 0.5, zz: cz + (Math.random() - 0.5) * rd * 0.5, y: 0.5 + i * 0.05, v: [Math.cos(a) * s, 1.8 + Math.random() * 1.6, Math.sin(a) * s] });
  });
  if (keys.length) {
    G.audio?.at?.('coins', cx, cz, 0.6);
    const what = kind === 'cushions' ? 'Something was stuffed down the cushions.' : kind === 'electronics' ? 'Boards and copper. The hopper likes those.' : kind === 'safe' ? 'Jackpot.' : kind === 'appliance' ? 'Huh. Something was in there after all.' : 'Something fell out.';
    setTimeout(() => selfThought(what), 400);
    if (!saidSmash && G.debt?.on) { saidSmash = true; setTimeout(() => voss('Now you are learning. Pick it up. Take it to the plate.'), 1800); }
  } else if (!saidSmash && G.debt?.on && Math.random() < 0.5) setTimeout(() => voss(pick(['Nothing? Smash the next one.', 'Empty. They are not all empty.'])), 1200);
}

/** dev: break an object as if the local survivor smashed it (when the destruction system is absent) */
function devSmash(o: TileObject) {
  const z = G.getZone(G.local.zoneKey);
  if (G.destruct?.breakObject) return G.destruct.breakObject(z, o, G.local.id, 'smash');
  op('objState', { z: z.key, uid: o.uid, patch: { broken: true } });
  bus.emit('objBroken', z, o, G.local.id, 'smash');
}

/** item context menu hook (src/interact/itemMenu.ts) */
export function itemMenuHook(p: Player, it: Item, c: Container, opts: MenuOption[], inWorld: boolean) {
  try {
    G.band?.itemMenu?.(p, it, opts);
    G.debt?.hoppers?.itemMenu?.(p, it, opts, inWorld);
  } catch (e) { console.warn('debt item menu', e); }
  void c;
}

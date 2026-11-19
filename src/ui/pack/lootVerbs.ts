// Detailed looting (round 19): what a right click on a body or a container offers, added to the world's menus (bus
// 'worldMenu' / 'objectMenu', which the right-click context menu is built from). A body: search it (the hands pull
// the coat open in first person, then its things lie in the pack's 2D panel), go through its pockets only, take
// everything it has into the pack in one go, or look at it (what it is, how long dead, roughly what it carries).
// A container: search it, take everything, look at it. Each option carries `info` (plain text for "more info").
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Player } from '../../entities/player';
import type { Container } from '../../items/container';
import type { MenuOption } from '../ui';
import type { TileObject } from '../../world/zone';
import { itemWeight } from '../../items/item';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { queueTransfers } from '../../actions/transfer';
import { LootAction, openLoot } from '../../interact/verbs';
import { ensureLoot, isWorldContainer } from '../../game/worldOps';
import { objDef } from '../../world/objects';

type Opt = MenuOption & { info?: string };

/** the bag on the back (else the pockets): where taken things go */
function packOf(p: Player): Container { return (p.worn as Map<string, any>).get('back')?.inv ?? p.inv; }

/** everything out of a container into the pack, one thing after another (each a short transfer) */
function takeAll(p: Player, c: Container) {
  const z = G.zone;
  if (z && isWorldContainer(c)) { try { ensureLoot(z, c); } catch { /* the host fills it */ } }
  if (!c.items.length) { bus.emit('think', p, ['Nothing in it.', 'Empty.', 'Someone got here first.'][Math.floor(Math.random() * 3)]); return; }
  queueTransfers(p, [...c.items], c, packOf(p));
  G.audio?.ui?.('rummage', 0.4);
}

/** a plain-words look: how full, how heavy, what kind of thing is in it */
function describe(c: Container): string {
  const n = c.items.length;
  if (!c.lootDone && n === 0) return 'Something might be in there.';
  if (!n) return 'Empty.';
  const kg = c.items.reduce((s, it) => s + itemWeight(it), 0);
  return `${n} thing${n > 1 ? 's' : ''} in it, about ${kg < 1 ? 'a handful' : kg.toFixed(0) + ' kg'}.`;
}

let installed = false;
export function installLootVerbs() {
  if (installed) return;
  installed = true;
  // bodies
  bus.on('worldMenu', (p: Player, t: any, opts: Opt[]) => {
    if (t?.kind !== 'creature' || !t.c?.dead) return;
    const c = t.c, inv: Container | null = c.inv ?? null;
    if (!inv) return;
    const reach = (a: any) => queueAt(p, c.x, c.z, a, 1.4, false);
    const i = opts.findIndex((o) => o.label === 'Search');
    const search: Opt = { label: 'Search the body', info: 'Kneel, open the coat, go through everything it has. Its things show beside your pack.', action: () => reach(new LootAction(p, inv, c)) };
    const pockets: Opt = { label: 'Search its pockets', info: 'A quick feel through the pockets only: faster, and you do not have to move it.', action: () => reach(new UseObjectAction(p, 'Pockets', 0.35, 'loot', () => { G.audio?.ui?.('cloth', 0.45); openLoot(p, inv, c); })) };
    const all: Opt = { label: 'Take everything', info: 'Everything it carries goes into your pack, one thing after another.', disabled: inv.locked ? 'it is held shut' : false, action: () => reach(new UseObjectAction(p, 'Take everything', 0.6, 'loot', () => takeAll(p, inv))) };
    const look: Opt = { label: 'Look at the body', info: 'What it was, and roughly what it carries.', action: () => bus.emit('think', p, `${c.displayName?.() ?? 'It'}. ${describe(inv)}`) };
    if (i >= 0) opts.splice(i, 1, search, pockets, all, look); else opts.unshift(search, pockets, all, look);
  });
  // containers
  bus.on('objectMenu', (p: Player, o: TileObject, out: Opt[]) => {
    const inv = o.inv; if (!inv) return;
    const name = (objDef(o.key)?.name ?? 'it').toLowerCase();
    const at = (a: any) => queueAt(p, o.x + 0.5, o.y + 0.5, a, 1.4);
    const s = out.find((q) => /^(Search|Open|Loot)/.test(q.label));
    if (s) (s as Opt).info ??= `Open the ${name} and go through it; its things show beside your pack.`;
    if (!out.some((q) => q.label === 'Take everything')) {
      out.splice(s ? out.indexOf(s) + 1 : 0, 0, { label: 'Take everything', info: `Everything in the ${name} goes into your pack.`, disabled: inv.locked ? 'locked' : false, action: () => at(new UseObjectAction(p, 'Take everything', 0.6, 'loot', () => takeAll(p, inv))) } as Opt);
    }
    if (!s) out.unshift({ label: 'Search', info: `Open the ${name} and go through it.`, disabled: inv.locked ? 'locked' : false, action: () => at(new LootAction(p, inv, o)) } as Opt);
  });
}

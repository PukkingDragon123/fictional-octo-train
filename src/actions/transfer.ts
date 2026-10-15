import { TimedAction } from './action';
import type { Player } from '../entities/player';
import { Item, itemDef, itemWeight } from '../items/item';
import { Container } from '../items/container';
import { transferItem, isWorldContainer } from '../game/worldOps';
import { bus } from '../core/events';
import { G } from '../game/G';
import { Placement, Rot, containerOcc, testFit, findSpot, weightOk } from '../items/grid';
import { bestDest } from '../items/packResolver';

/**
 * Moving an item between containers takes time scaled by its weight (PZ
 * ISInventoryTransferAction). With the backpack grid a transfer can carry a
 * target cell (`at`); if that cell is taken by the time the hands get there
 * the item goes to the first free spot, and if there is none it stays put.
 * A transfer "into the inventory" (p.inv with no cell) picks the best carried
 * container: small things into pockets, the rest into the pack.
 */
export class TransferAction extends TimedAction {
  constructor(p: Player, public it: Item, public from: Container, public to: Container, public at?: Placement | null) {
    super(p);
    const w = Math.min(3, itemWeight(it));
    let d = 0.28 + w * 0.22;
    if (to.kind === 'floor') d *= 0.35;
    if (from.kind === 'floor') d *= 0.8;
    if (!isWorldContainer(from) && !isWorldContainer(to) && from.kind !== 'floor' && to.kind !== 'floor') d *= 0.6;
    if (p.body.has('dextrous')) d *= 0.5;
    if (p.body.has('all_thumbs')) d *= 2.5;
    this.duration = d;
    this.name = 'Transfer';
    this.anim = from.kind === 'floor' || to.kind === 'floor' ? 'pickup' : isWorldContainer(from) || isWorldContainer(to) ? 'loot' : 'craft';
    this.canMove = !isWorldContainer(from) && !isWorldContainer(to) && from.kind !== 'floor';
    this.showBar = d > 0.4;
  }
  isValid() {
    if (this.from.kind === 'floor') return true; // floor contents are re-resolved on perform
    return this.from.items.includes(this.it);
  }
  start() { G.audio?.itemSound?.(this.it.key, 'pick', this.p); }
  perform() {
    const res = resolveTarget(this.p, this.it, this.from, this.to, this.at);
    if (!res) { bus.emit('think', this.p, noRoomLine(this.it, this.to)); bus.emit('gridNoRoom', this.it, this.to); return; }
    transferItem(this.p, this.it, this.from, res.c, res.at);
    G.audio?.itemSound?.(this.it.key, 'drop', this.p);
    bus.emit('transferred', this.p, this.it, this.from, res.c);
    void itemDef;
  }
}

/** where the item really goes: the requested cell if still free, else the first fit; null = no room */
export function resolveTarget(p: Player, it: Item, from: Container, to: Container, at?: Placement | null): { c: Container; at: Placement | null } | null {
  if (to.kind === 'floor') return { c: to, at: null };
  // "into my inventory" with no particular cell: the best carried container
  if (to === p.inv && !at) {
    const b = bestDest(p, it);
    return b ? { c: b.c, at: b.at } : null;
  }
  if (!weightOk(to, it)) return null;
  const occ = containerOcc(to, new Set([it]));
  if (!occ) return { c: to, at: at ?? null }; // no grid known yet: let the container settle it
  if (at && testFit(occ, it, at.gx, at.gy, at.rot as Rot) !== 'blocked') return { c: to, at };
  const spot = findSpot(occ, it, 1, at?.rot);
  if (spot) return { c: to, at: spot };
  // the pockets are full but a bag may not be
  if (to === p.inv) { const b = bestDest(p, it); if (b) return { c: b.c, at: b.at }; }
  void from;
  return null;
}

function noRoomLine(it: Item, to: Container): string {
  const d = itemDef(it.key);
  if ((to.kind === 'bag' || to.owner.startsWith('item:')) && !weightOk(to, it)) return 'The straps would tear.';
  if (to.kind === 'main') return `No room for the ${d.name.toLowerCase()}.`;
  return 'It won\'t fit.';
}

export function queueTransfers(p: Player, items: Item[], from: Container, to: Container, at?: Placement | null) {
  for (const it of items) p.actions.add(new TransferAction(p, it, from, to, at));
}

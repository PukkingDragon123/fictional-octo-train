import { TimedAction } from './action';
import type { Player } from '../entities/player';
import { Item, itemDef, itemWeight } from '../items/item';
import { Container } from '../items/container';
import { transferItem, isWorldContainer } from '../game/worldOps';
import { bus } from '../core/events';
import { G } from '../game/G';

/** Moving an item between containers takes time scaled by its weight (PZ ISInventoryTransferAction). */
export class TransferAction extends TimedAction {
  constructor(p: Player, public it: Item, public from: Container, public to: Container) {
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
    if (!this.to.hasRoom(this.it) && this.to.kind !== 'floor') { bus.emit('think', this.p, 'It won\'t fit.'); return; }
    transferItem(this.p, this.it, this.from, this.to);
    G.audio?.itemSound?.(this.it.key, 'drop', this.p);
    bus.emit('transferred', this.p, this.it, this.from, this.to);
    void itemDef;
  }
}

export function queueTransfers(p: Player, items: Item[], from: Container, to: Container) {
  for (const it of items) p.actions.add(new TransferAction(p, it, from, to));
}

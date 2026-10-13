import { TimedAction } from './action';
import type { Player } from '../entities/player';
import { Item, itemDef } from '../items/item';
import { Injury, INJURY_INFO, PART_NAMES } from '../survival/body';
import { bus } from '../core/events';
import { G } from '../game/G';
import { createItem } from '../items/factory';

/** Medical treatment on yourself or a teammate (target may be another player). */
abstract class MedAction extends TimedAction {
  constructor(p: Player, public target: Player, public inj: Injury) { super(p); this.anim = 'bandage'; }
  get skill() { return this.p.body.skill('firstaid'); }
  scale(base: number) { return base * (1 - this.skill * 0.06) * (this.p.occupation === 'nurse' ? 0.7 : 1) * (this.target === this.p ? 1 : 0.85); }
  isValid() {
    if (!this.target.body.allInjuries().includes(this.inj)) return false;
    return this.target === this.p || Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 1.8;
  }
  sync() { if (this.target !== this.p) G.net?.sendMedical?.(this.target.id, this.inj); }
}

export class BandageAction extends MedAction {
  constructor(p: Player, target: Player, inj: Injury, public item: Item) {
    super(p, target, inj);
    this.name = 'Bandage ' + PART_NAMES[inj.part];
    this.duration = this.scale(inj.bandage ? 4.5 : 3.5);
  }
  isValid() { return super.isValid() && !!this.p.containerOf(this.item); }
  perform() {
    const d = itemDef(this.item.key);
    const sterile = this.item.key === 'bandage' && !(this.item.data?.dirty);
    const clean = d.key !== 'rag_dirty' && d.key !== 'bandage_dirty';
    if (this.inj.bandage && !this.inj.bandage.clean) this.p.inv.add(createItem('bandage_dirty', undefined, { pristine: true }));
    this.inj.bandage = { clean, soak: 0, sterile };
    if (!clean) this.inj.infection = Math.max(this.inj.infection, 0.04);
    this.p.removeItem(this.item);
    this.p.body.addXp('firstaid', 5);
    this.sync();
    G.audio?.at?.('bandage', this.p.x, this.p.z);
    bus.emit('inventoryChanged', this.p);
  }
}

export class RemoveBandageAction extends MedAction {
  constructor(p: Player, target: Player, inj: Injury) { super(p, target, inj); this.name = 'Remove bandage'; this.duration = 2; }
  perform() {
    if (!this.inj.bandage) return;
    if (!this.inj.bandage.clean || this.inj.bandage.soak > 0.3) this.p.inv.add(createItem('bandage_dirty', undefined, { pristine: true }));
    else this.p.inv.add(createItem('bandage', undefined, { pristine: true }));
    this.inj.bandage = null;
    this.sync();
    bus.emit('inventoryChanged', this.p);
  }
}

export class DisinfectAction extends MedAction {
  constructor(p: Player, target: Player, inj: Injury, public item: Item) {
    super(p, target, inj); this.name = 'Disinfect wound'; this.duration = this.scale(3);
  }
  isValid() { return super.isValid() && !!this.p.containerOf(this.item); }
  perform() {
    this.inj.disinfected = 24;
    this.inj.infection = Math.max(0, this.inj.infection - 0.4);
    const d = itemDef(this.item.key);
    if (d.fluidCap && this.item.fluid) { this.item.fluid.amount -= 0.05; if (this.item.fluid.amount <= 0.01) this.item.fluid = null; }
    else { this.item.uses = (this.item.uses ?? 1) - 0.12; if (this.item.uses <= 0.01) this.p.removeItem(this.item); }
    this.target.body.panic = Math.min(100, this.target.body.panic + 6);
    if (this.target === this.p) bus.emit('think', this.p, 'Ssss... that stings.');
    this.p.body.addXp('firstaid', 4);
    this.sync();
    bus.emit('inventoryChanged', this.p);
  }
}

export class StitchAction extends MedAction {
  constructor(p: Player, target: Player, inj: Injury, public needle: Item, public thread: Item | null) {
    super(p, target, inj); this.name = 'Stitch wound'; this.duration = this.scale(9);
  }
  isValid() { return super.isValid() && !!this.p.containerOf(this.needle); }
  perform() {
    this.inj.stitched = true;
    this.inj.bleed *= 0.15;
    const pain = 22 - this.skill * 2;
    this.target.body.panic = Math.min(100, this.target.body.panic + pain);
    if (this.thread) { this.thread.uses = (this.thread.uses ?? 1) - 0.1; if (this.thread.uses <= 0.01) this.p.removeItem(this.thread); }
    else { this.needle.uses = (this.needle.uses ?? 1) - 0.25; if ((this.needle.uses ?? 0) <= 0.01) this.p.removeItem(this.needle); }
    if (Math.random() < 0.25 - this.skill * 0.03) this.inj.infection = Math.max(this.inj.infection, 0.05);
    this.p.body.addXp('firstaid', 12);
    this.sync();
    bus.emit('inventoryChanged', this.p);
  }
}

export class SplintAction extends MedAction {
  constructor(p: Player, target: Player, inj: Injury, public splint: Item) {
    super(p, target, inj); this.name = 'Apply splint'; this.duration = this.scale(7);
  }
  isValid() { return super.isValid() && !!this.p.containerOf(this.splint); }
  perform() {
    this.inj.splinted = true;
    this.p.removeItem(this.splint);
    this.p.body.addXp('firstaid', 10);
    this.sync();
    bus.emit('inventoryChanged', this.p);
  }
}

export class RemoveForeignAction extends MedAction {
  constructor(p: Player, target: Player, inj: Injury, public tool: Item | null) {
    super(p, target, inj); this.name = inj.type === 'bullet' ? 'Remove bullet' : 'Remove glass'; this.duration = this.scale(tool ? 6 : 10);
  }
  perform() {
    const chance = (this.tool ? 0.85 : 0.45) + this.skill * 0.04;
    if (Math.random() < chance) {
      this.inj.foreign = false;
      bus.emit('halo', this.p, 'Removed!', 'good');
    } else {
      this.inj.sev = Math.min(1, this.inj.sev + 0.15);
      this.inj.bleed += 0.15;
      bus.emit('think', this.p, "Ah! It's still in there.");
    }
    this.target.body.panic = Math.min(100, this.target.body.panic + 15);
    this.p.body.addXp('firstaid', 8);
    this.sync();
  }
}

export class PillAction extends TimedAction {
  constructor(p: Player, public it: Item) {
    super(p);
    this.name = 'Take ' + itemDef(it.key).name; this.duration = 2.2; this.anim = 'eat';
  }
  isValid() { return !!this.p.containerOf(this.it); }
  perform() {
    const d = itemDef(this.it.key);
    const b = this.p.body;
    switch (d.medical?.type) {
      case 'painkiller': b.painkiller = 5; break;
      case 'antibiotic': b.antibiotics = 12; break;
      case 'sedative': b.sedated = 6; b.panic = 0; b.stress = Math.max(0, b.stress - 30); break;
      case 'antidepressant': b.antidep = 24; break;
      case 'vitamins': b.fatigue = Math.max(0, b.fatigue - 8); break;
      case 'cold': b.sickness = Math.max(0, b.sickness - 10); break;
      case 'adrenaline': b.adrenaline = 0.5; b.endurance = 1; b.fatigue = Math.max(0, b.fatigue - 30); break;
      case 'checksum':
        b.corruption = Math.max(0, b.corruption - 28);
        b.lucidity = Math.min(100, b.lucidity + 15);
        bus.emit('think', this.p, 'Static fades. Numbers line up again.');
        break;
    }
    if (d.uses !== undefined) { this.it.uses = (this.it.uses ?? 1) - 0.1; if (this.it.uses <= 0.01) this.p.removeItem(this.it); }
    else this.p.removeItem(this.it);
    G.audio?.at?.('pills', this.p.x, this.p.z);
    bus.emit('inventoryChanged', this.p);
  }
}

export function injuryLabel(inj: Injury): string {
  const parts: string[] = [INJURY_INFO[inj.type].name];
  if (inj.bandage) parts.push(inj.bandage.clean ? 'bandaged' : 'dirty bandage');
  if (inj.stitched) parts.push('stitched');
  if (inj.splinted) parts.push('splinted');
  if (inj.foreign) parts.push(inj.type === 'bullet' ? 'bullet lodged' : 'glass lodged');
  if (inj.infection > 0.15) parts.push('infected');
  return `${PART_NAMES[inj.part]}: ${parts.join(', ')}`;
}

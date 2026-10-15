// Trait quirks that need the world, not just the body: sneezing, smelling like
// pizza, dropping things, reading or snacking at double speed, creatures that
// trust a cat or dog person sooner. Runs for the local survivor only; anything
// that changes shared state goes through ops or bus 'noise' like everything else.
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { itemDef } from '../items/item';
import { serializeItem } from '../items/factory';
import type { Player } from '../entities/player';
import type { Env } from './body';

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const CANINE = new Set(['grinhound', 'goodboy']);
const CAT_LIKE = new Set(['plushkin', 'lamplighter']);
const DUSTY = new Set(['lobby', 'office', 'school', 'house', 'suburbs', 'mall']);

export class Quirks {
  private sneezeT = 120;
  private scentT = 3;
  private dropCd = 10;
  private tameAction: unknown = null;

  /** before the body updates: adjust what the senses report */
  preBody(p: Player, env: Env) {
    const b = p.body;
    // Dog Person: hounds are just big dogs
    if (b.has('dog_person') && env.threat > 0 && this.onlyCanines(p)) env.threat *= 0.5;
  }

  update(p: Player, env: Env, dt: number) {
    const b = p.body;
    if (b.dead || b.downed) return;
    const a = p.actions.current;
    // ---- Speed Reader / Snack Goblin: some actions simply go faster
    if (a && a.started && !a.done) {
      if (b.has('speed_reader') && a.anim === 'read' && a.name.startsWith('Read')) a.t += dt;
      if (b.has('snack_goblin') && a.name.startsWith('Eat ')) {
        const it = (a as any).it;
        const f = it ? itemDef(it.key).food : undefined;
        if (f && (f.ingredient === 'sweet' || (itemDef(it.key).tags || []).includes('snack'))) a.t += dt;
      }
    }
    // ---- taming: cat / dog people and whisperers need fewer treats
    if (a && a.started && a.name === 'Offer food' && this.tameAction !== a) {
      this.tameAction = a;
      this.tameBonus(p);
    }
    if (!a) this.tameAction = null;
    // ---- Sneezer
    if (b.has('sneezer') && !p.sleeping) {
      this.sneezeT -= dt * (DUSTY.has(env.zone || '') ? 1.6 : 1) * (b.sickness > 20 ? 2 : 1);
      if (this.sneezeT <= 0) { this.sneezeT = 90 + Math.random() * 200; this.sneeze(p); }
    }
    // ---- Smells Like Pizza: an invisible cloud of delicious
    if (b.has('smells_pizza')) {
      this.scentT -= dt;
      if (this.scentT <= 0) {
        this.scentT = p.sneaking ? 4.5 : 3;
        bus.emit('noise', { x: p.x, z: p.z, radius: p.sneaking ? 8 : 12, kind: 'scent', zone: p.zoneKey, by: p.id });
        const z = G.getZone(p.zoneKey);
        const tx = p.tileX(), ty = p.tileY();
        if (z.scent) for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) if (z.inb(x, y)) z.scent[z.idx(x, y)] = G.clock.hours;
      }
    }
    // ---- Butterfingers: panicky hands let go
    this.dropCd -= dt;
    if (b.has('butterfingers') && this.dropCd <= 0 && p.handR && !p.inVehicle && b.panic > 55) {
      const chance = (b.mind.attack > 0 ? 0.12 : 0.04) * ((b.panic - 55) / 45 + 0.3);
      if (Math.random() < chance * dt) { this.dropCd = 25; this.drop(p); }
    }
  }

  private onlyCanines(p: Player) {
    let any = false;
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
      if (c.dead || c.tamedBy || c.zoneKey !== p.zoneKey || !c.visibleToLocal || (c.sp?.threat ?? 0) < 2) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) > 18) continue;
      if (!CANINE.has(c.sp.key)) return false;
      any = true;
    }
    return any;
  }

  private tameBonus(p: Player) {
    if (G.role === 'client') return; // the host owns creature state
    const b = p.body;
    let best: any = null, bd = 3;
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
      if (c.dead || c.tamedBy || !c.sp?.tame || c.zoneKey !== p.zoneKey) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    let bonus = 0;
    if (b.has('cat_person') && CAT_LIKE.has(best.sp.key)) bonus++;
    if (b.has('dog_person') && CANINE.has(best.sp.key)) bonus++;
    if (b.has('creature_whisperer')) bonus++;
    if (!bonus) return;
    best.feeds = Math.min(best.feeds + bonus, best.sp.tame.feeds - 1);
  }

  private sneeze(p: Player) {
    G.ui?.say?.(p, pick(['ACHOO!', 'A-CHOO!', 'HAAATCHOO!', 'ah... ah... CHOO!']), 'shout', 1.8);
    G.audio?.play?.('cough', p.x, p.z, { flat: true, vol: 0.9, rate: 1.4 });
    bus.emit('noise', { x: p.x, z: p.z, radius: 16, kind: 'sneeze', zone: p.zoneKey, by: p.id });
    if (p.sneaking) p.body.stress = Math.min(100, p.body.stress + 4);
  }

  private drop(p: Player) {
    const it = p.handR; if (!it) return;
    p.removeItem(it);
    const f = p.facing;
    op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: p.x + Math.cos(f) * 0.45, zz: p.z + Math.sin(f) * 0.45 });
    G.audio?.itemSound?.(it.key, 'drop', p);
    bus.emit('inventoryChanged', p);
    bus.emit('think', p, pick(['My hands! I dropped it!', 'No no no, butterfingers!', 'It slipped!']));
  }
}

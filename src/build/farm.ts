// Farming in planters and hydro racks (and the old plank planter): sow seeds,
// water, grow through stages under light (sky, strip lights, the rack's own
// LEDs), harvest. Host-simulated; every stage change is an objState op.
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { clamp } from '../core/math';
import { objDef } from '../world/objects';
import { itemDef, hasItemDef, type Item } from '../items/item';
import { createItem } from '../items/factory';
import { CROPS } from '../items/worldSystems';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import type { Player } from '../entities/player';
import type { Zone, TileObject } from '../world/zone';
import type { MenuOption } from '../ui/ui';
import { bump } from './progress';

export const isPlanter = (o: TileObject) => o.key === 'farm_planter' || !!objDef(o.key)?.tags?.includes('bplanter');
const isHydro = (o: TileObject) => o.key === 'bld_hydro';
const waterOf = (p: Player) => p.findItem((i) => !!i.fluid && (i.fluid.type === 'water' || i.fluid.type === 'tainted') && i.fluid.amount > 0.2);
const seedsOf = (p: Player): Item[] => p.allItems().filter((i) => { const s = itemDef(i.key).seed; return !!s && !!CROPS[s]; });

export class Farm {
  private simH = 0;

  /** 0..1 how well lit this planter is for growing */
  light(z: Zone, o: TileObject): number {
    if (z.floorAt(o.x, o.y)?.outdoor && z.env.sky) { const h = G.clock.hours % 24; return h > 6 && h < 20 ? 1 : 0.25; }
    let best = isHydro(o) ? 0.8 : 0.2;
    for (let y = o.y - 4; y <= o.y + 4; y++) for (let x = o.x - 4; x <= o.x + 4; x++) {
      if (!z.inb(x, y)) continue;
      for (const q of z.objectsAt(x, y)) if (objDef(q.key)?.tags?.includes('growlight') && Math.hypot(q.x - o.x, q.y - o.y) <= 4.2) return 1;
    }
    for (const l of z.lights) if (l.on && !l.broken && Math.hypot(l.x - o.x - 0.5, l.z - o.y - 0.5) < 3.5) best = Math.max(best, 0.6);
    return best;
  }

  status(z: Zone, o: TileObject): string {
    const s = o.state;
    if (!s.crop) return 'Empty soil';
    const c = CROPS[s.crop as string];
    const st = Math.floor(s.stage ?? 0);
    const what = s.dead ? 'withered' : st >= 5 ? 'rotting' : st >= 4 ? 'READY' : ['seeded', 'sprouting', 'growing', 'flowering'][st];
    const l = this.light(z, o);
    return `${c?.name ?? 'Crop'}: ${what} · water ${Math.round(s.water ?? 0)}%${l < 0.5 ? ' · too dark' : ''}`;
  }

  /** the one obvious thing to do with a planter (E / tap) */
  use(p: Player, o: TileObject): boolean {
    const z = G.getZone(p.zoneKey);
    const s = o.state, st = Math.floor(s.stage ?? 0);
    if (!s.crop) {
      const seed = seedsOf(p)[0];
      if (!seed) { bus.emit('think', p, 'Empty soil. I need seeds.'); return true; }
      this.sow(p, o, seed); return true;
    }
    if (s.dead || st >= 5) { this.clear(p, o); return true; }
    if (st >= 4) { this.harvest(p, o); return true; }
    if ((s.water ?? 0) < 70 && waterOf(p)) { this.water(p, o); return true; }
    bus.emit('think', p, this.status(z, o) + '.');
    return true;
  }

  /** the word for what use() would do now */
  verb(p: Player, o: TileObject): string {
    const s = o.state, st = Math.floor(s.stage ?? 0);
    if (!s.crop) return seedsOf(p).length ? 'Sow ' + itemDef(seedsOf(p)[0].key).name : 'Check the soil';
    if (s.dead || st >= 5) return 'Clear the dead plants';
    if (st >= 4) return 'Harvest';
    if ((s.water ?? 0) < 70 && waterOf(p)) return 'Water';
    return 'Check the crop';
  }

  options(p: Player, o: TileObject): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    const s = o.state, st = Math.floor(s.stage ?? 0);
    const out: MenuOption[] = [{ label: this.status(z, o), disabled: true }];
    if (!s.crop) {
      const seeds = seedsOf(p);
      out.push(seeds.length ? { label: 'Sow', sub: seeds.slice(0, 8).map((sd) => ({ label: itemDef(sd.key).name, action: () => this.sow(p, o, sd) })) } : { label: 'Sow', disabled: 'no seeds' });
      return out;
    }
    if (!s.dead && st < 5) out.push({ label: 'Water', disabled: !waterOf(p) ? 'needs water' : (s.water ?? 0) > 95 ? 'soaked' : false, action: () => this.water(p, o) });
    if (st >= 4 && !s.dead) out.push({ label: 'Harvest', action: () => this.harvest(p, o) });
    out.push({ label: 'Pull up', danger: true, action: () => this.clear(p, o) });
    return out;
  }

  private at(p: Player, o: TileObject, name: string, secs: number, anim: string, fn: () => void) {
    queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, name, secs, anim, fn), 1.5);
  }

  sow(p: Player, o: TileObject, seed: Item) {
    const zk = p.zoneKey;
    this.at(p, o, 'Sow', 3, 'dig', () => {
      if (!p.containerOf(seed) || o.state.crop) return;
      const d = itemDef(seed.key);
      if (d.uses) { seed.uses = (seed.uses ?? 1) - 1 / d.uses; if (seed.uses <= 0.001) p.removeItem(seed); } else p.removeItem(seed);
      const c = CROPS[d.seed!];
      op('objState', { z: zk, uid: o.uid, patch: { crop: d.seed, cc: c?.color ?? 0x6ab04a, stage: 0, growth: 0, water: Math.max(o.state.water ?? 0, 35), dead: false, dry: 0 } });
      G.audio?.at?.('dig', o.x + 0.5, o.y + 0.5, 0.5);
      p.body.addXp('farming', 3);
      bus.emit('inventoryChanged', p);
    });
  }

  water(p: Player, o: TileObject) {
    const zk = p.zoneKey;
    this.at(p, o, 'Water', 2.5, 'pour', () => {
      const w = waterOf(p); if (!w?.fluid) return;
      const used = Math.min(w.fluid.amount, isHydro(o) ? 0.5 : 1);
      w.fluid.amount -= used; if (w.fluid.amount < 0.01) w.fluid = null;
      op('objState', { z: zk, uid: o.uid, patch: { water: clamp((o.state.water ?? 0) + used * 70, 0, 100) } });
      G.audio?.at?.('pour', o.x + 0.5, o.y + 0.5, 0.6);
      bus.emit('inventoryChanged', p);
    });
  }

  harvest(p: Player, o: TileObject) {
    const zk = p.zoneKey;
    this.at(p, o, 'Harvest', 3.5, 'loot', () => {
      const c = CROPS[o.state.crop as string];
      if (!c || Math.floor(o.state.stage ?? 0) < 4 || o.state.dead) return;
      const skill = p.body.skill('farming');
      const mul = (isHydro(o) ? 1.5 : 1) * (1 + skill * 0.08);
      const n = Math.max(1, Math.round((c.yield[0] + Math.random() * (c.yield[1] - c.yield[0])) * mul));
      if (hasItemDef(c.item)) for (let i = 0; i < n; i++) p.inv.add(createItem(c.item));
      G.audio?.at?.('rummage', o.x + 0.5, o.y + 0.5, 0.7);
      // a few seeds come back
      const seedKey = Object.keys(CROPS).includes(o.state.crop) ? findSeedFor(o.state.crop) : null;
      if (seedKey && Math.random() < 0.6) p.inv.add(createItem(seedKey));
      op('objState', { z: zk, uid: o.uid, patch: { crop: null, stage: 0, growth: 0, dead: false } });
      p.body.addXp('farming', 8);
      bump('farm_harvest');
      bus.emit('inventoryChanged', p);
      bus.emit('cropHarvested', p, c.item, n);
    });
  }

  clear(p: Player, o: TileObject) {
    this.at(p, o, 'Pull up', 1.5, 'loot', () => op('objState', { z: p.zoneKey, uid: o.uid, patch: { crop: null, stage: 0, growth: 0, dead: false } }));
  }

  /** a worker (robot thrall) tends it: water from nowhere, a little growth */
  tend(z: Zone, o: TileObject, dt: number) {
    if (!o.state.crop || o.state.dead) return;
    o.state.water = clamp((o.state.water ?? 0) + dt * 0.5, 0, 100);
    o.state.growth = (o.state.growth ?? 0) + dt * 0.0005;
  }

  /** host: growth over game hours */
  update(dh: number) {
    this.simH += dh;
    if (this.simH < 0.25) return;
    const h = this.simH; this.simH = 0;
    if (G.role === 'client') return;
    for (const z of G.zones.values()) {
      const raining = z.env.weather === 'rain';
      let funnels: TileObject[] | null = null;
      for (const o of z.objects.values()) {
        if (!isPlanter(o) || !o.state.crop || o.state.dead) continue;
        const c = CROPS[o.state.crop as string]; if (!c) continue;
        const hydro = isHydro(o);
        const outdoor = !!z.floorAt(o.x, o.y)?.outdoor;
        let water = (o.state.water ?? 0) - h * (hydro ? 0.45 : 1.1) + (raining && outdoor ? h * 25 : 0);
        // a rain funnel within two tiles tops it up
        if (water < 50) {
          funnels ||= [...z.objects.values()].filter((q) => q.key === 'bld_rain');
          const f = funnels.find((q) => Math.abs(q.x - o.x) <= 2 && Math.abs(q.y - o.y) <= 2 && (q.state.water ?? 0) > 1);
          if (f) { const take = Math.min(f.state.water, 2); f.state.water -= take; water += take * 30; }
        }
        water = clamp(water, 0, 100);
        let growth = o.state.growth ?? 0;
        const light = this.light(z, o);
        const powered = !hydro || !!G.items?.generatorPowers?.(z, o.x, o.y) || z.circuitPowered?.(z.roomAt(o.x, o.y).circuit);
        if (water > 5) growth += h / (c.days * 24) * 4 * light * (hydro ? (powered ? 1.6 : 0.8) : 1) * (o.state.worker ? 1.2 : 1);
        const dry = water <= 0 ? (o.state.dry ?? 0) + h : 0;
        const stage = Math.min(5, Math.floor(growth));
        const patch: Record<string, any> = { water, growth, dry };
        if (dry > 48) patch.dead = true;
        const wetFlip = (water > 20) !== ((o.state.water ?? 0) > 20);
        if (stage !== Math.floor(o.state.stage ?? 0) || patch.dead || wetFlip) { patch.stage = stage; op('objState', { z: z.key, uid: o.uid, patch }); }
        else Object.assign(o.state, patch);
      }
    }
  }
}

let seedIndex: Map<string, string> | null = null;
function findSeedFor(crop: string): string | null {
  if (!seedIndex) {
    seedIndex = new Map();
    for (const k of ['seeds_potato', 'seeds_carrot', 'seeds_tomato', 'seeds_cabbage', 'seeds_strawberry', 'seeds_lettuce', 'seeds_dreamlily']) if (hasItemDef(k)) { const s = itemDef(k).seed; if (s) seedIndex.set(s, k); }
  }
  return seedIndex.get(crop) ?? null;
}

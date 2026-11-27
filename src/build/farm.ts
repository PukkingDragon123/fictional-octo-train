// Farming in planters and hydro racks (and the old plank planter): sow seeds,
// water, grow through stages under light (sky, strip lights, the rack's own
// LEDs), harvest. Host-simulated; every stage change is an objState op.
// Round 25: trouble and tools. Lint mites (state.pest 0..1) take hold of a growing crop and spread over it; blight
// (state.blight 0..1) grows in an over-watered one. Either slows it and, left alone, kills it. Pick the mites off by
// hand or spray them (mite_spray, which also keeps them off for two days); cut blight out with shears or a knife.
// A hoe turns an empty planter (state.tilled: the next crop grows a quarter faster and gives one more). Harvest is
// by hand (the HumanRig 'harvest' clip: kneel, grip, tug, pull, drop into the other hand); shears take one more off
// every plant. Every harvest trains the Botanist trade and can teach a recipe that uses the crop (the codex finds).
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
import { hasUnlock } from '../game/research';
import { profMul, profXp } from '../game/professions';
import { allItemDefs } from '../items/item';
import { discoverFrom } from '../craft/stores';

export const isPlanter = (o: TileObject) => o.key === 'farm_planter' || !!objDef(o.key)?.tags?.includes('bplanter');
const isHydro = (o: TileObject) => o.key === 'bld_hydro' || !!objDef(o.key)?.tags?.includes('hydro');
/** a tray with its own tubes (bld_hydro_tray) runs off its own ballast: always powered */
const selfLit = (o: TileObject) => !!objDef(o.key)?.tags?.includes('growlight');
const toolOf = (p: Player, tag: string) => p.findItem((i) => !!itemDef(i.key).tags?.includes(tag) && (i.cond ?? 1) > 0.02 && (i.uses ?? 1) > 0.001);
const trouble = (o: TileObject) => Math.max(o.state.pest ?? 0, o.state.blight ?? 0);
const waterOf = (p: Player) => p.findItem((i) => !!i.fluid && (i.fluid.type === 'water' || i.fluid.type === 'tainted') && i.fluid.amount > 0.2);
const seedsOf = (p: Player): Item[] => p.allItems().filter((i) => { const s = itemDef(i.key).seed; return !!s && !!CROPS[s]; });

export class Farm {
  private simH = 0;

  /** 0..1 how well lit this planter is for growing */
  light(z: Zone, o: TileObject): number {
    // a fungus bed sits under its damp sack (src/content/furniture/ze_base.ts)
    if (objDef(o.key)?.tags?.includes('dark_bed')) return 0.15;
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
    const bad = `${(s.pest ?? 0) > 0.05 ? ' · mites' : ''}${(s.blight ?? 0) > 0.05 ? ' · blight' : ''}`;
    return `${c?.name ?? 'Crop'}: ${what} · water ${Math.round(s.water ?? 0)}%${c?.dark ? (l > 0.7 ? ' · too bright' : '') : l < 0.5 ? ' · too dark' : ''}${bad}`;
  }

  /** the one obvious thing to do with a planter (E / tap) */
  use(p: Player, o: TileObject): boolean {
    const z = G.getZone(p.zoneKey);
    const s = o.state, st = Math.floor(s.stage ?? 0);
    if (!s.crop) {
      if (!s.tilled && toolOf(p, 'hoe')) { this.till(p, o); return true; }
      const seed = seedsOf(p)[0];
      if (!seed) { bus.emit('think', p, 'Empty soil. I need seeds.'); return true; }
      this.sow(p, o, seed); return true;
    }
    if (s.dead || st >= 5) { this.clear(p, o); return true; }
    if ((s.blight ?? 0) > 0.15) { this.cutBlight(p, o); return true; }
    if ((s.pest ?? 0) > 0.15) { this.treatPests(p, o); return true; }
    if (st >= 4) { this.harvest(p, o); return true; }
    if ((s.water ?? 0) < 70 && waterOf(p)) { this.water(p, o); return true; }
    bus.emit('think', p, this.status(z, o) + '.');
    return true;
  }

  /** the word for what use() would do now */
  verb(p: Player, o: TileObject): string {
    const s = o.state, st = Math.floor(s.stage ?? 0);
    if (!s.crop) return !s.tilled && toolOf(p, 'hoe') ? 'Turn the soil' : seedsOf(p).length ? 'Sow ' + itemDef(seedsOf(p)[0].key).name : 'Check the soil';
    if (s.dead || st >= 5) return 'Clear the dead plants';
    if ((s.blight ?? 0) > 0.15) return toolOf(p, 'shears') || toolOf(p, 'sharp') ? 'Cut out the blight' : 'Pull the mouldy leaves';
    if ((s.pest ?? 0) > 0.15) return toolOf(p, 'pesticide') ? 'Spray the mites' : 'Pick off the mites';
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
      if (!s.tilled) out.push({ label: 'Turn the soil', disabled: toolOf(p, 'hoe') ? false : 'needs a hoe', action: () => this.till(p, o) });
      out.push(seeds.length ? { label: 'Sow', sub: seeds.slice(0, 8).map((sd) => ({ label: itemDef(sd.key).name, action: () => this.sow(p, o, sd) })) } : { label: 'Sow', disabled: 'no seeds' });
      return out;
    }
    if (!s.dead && st < 5) out.push({ label: 'Water', disabled: !waterOf(p) ? 'needs water' : (s.water ?? 0) > 95 ? 'soaked' : false, action: () => this.water(p, o) });
    if (!s.dead && st < 5) {
      if ((s.pest ?? 0) > 0.02) out.push({ label: toolOf(p, 'pesticide') ? 'Spray the mites' : 'Pick off the mites', action: () => this.treatPests(p, o) });
      else if (toolOf(p, 'pesticide')) out.push({ label: 'Spray against mites', action: () => this.treatPests(p, o) });
      if ((s.blight ?? 0) > 0.02) out.push({ label: toolOf(p, 'shears') || toolOf(p, 'sharp') ? 'Cut out the blight' : 'Pull the mouldy leaves', action: () => this.cutBlight(p, o) });
    }
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
      op('objState', { z: zk, uid: o.uid, patch: { crop: d.seed, cc: c?.color ?? 0x6ab04a, stage: 0, growth: 0, water: Math.max(o.state.water ?? 0, 35), dead: false, dry: 0, pest: 0, blight: 0 } });
      G.audio?.at?.('dig', o.x + 0.5, o.y + 0.5, 0.5);
      p.body.addXp('farming', 3);
      profXp('botanist', 1, 'sow');
      bus.emit('inventoryChanged', p);
    });
  }

  water(p: Player, o: TileObject) {
    const zk = p.zoneKey;
    const can = waterOf(p)?.key === 'watering_can';
    this.at(p, o, 'Water', can ? 1.6 : 2.5, 'pour', () => {
      const w = waterOf(p); if (!w?.fluid) return;
      // a watering can's rose spreads it: the same soak for less water
      const used = Math.min(w.fluid.amount, (isHydro(o) ? 0.5 : 1) * (w.key === 'watering_can' ? 0.7 : 1));
      w.fluid.amount -= used; if (w.fluid.amount < 0.01) w.fluid = null;
      op('objState', { z: zk, uid: o.uid, patch: { water: clamp((o.state.water ?? 0) + used * (w.key === 'watering_can' ? 100 : 70), 0, 100) } });
      G.audio?.at?.('pour', o.x + 0.5, o.y + 0.5, 0.6);
      bus.emit('inventoryChanged', p);
    });
  }

  harvest(p: Player, o: TileObject) {
    const zk = p.zoneKey;
    // by hand: kneel at the bed, grip, tug, pull the crop free and drop it into the other hand (HumanRig 'harvest')
    this.at(p, o, 'Harvest', 3.5, 'harvest', () => {
      const c = CROPS[o.state.crop as string];
      if (!c || Math.floor(o.state.stage ?? 0) < 4 || o.state.dead) return;
      const skill = p.body.skill('farming');
      const mul = (isHydro(o) ? 1.5 : 1) * (1 + skill * 0.08) * (1 - 0.5 * trouble(o));
      const shears = toolOf(p, 'shears');
      const n = Math.max(1, Math.round((c.yield[0] + Math.random() * (c.yield[1] - c.yield[0])) * mul * profMul('yield'))) + (hasUnlock('hb_compost') ? 1 : 0) + (o.state.tilled ? 1 : 0) + (shears ? 1 : 0);
      if (shears) shears.cond = Math.max(0, (shears.cond ?? 1) - 0.01);
      if (hasItemDef(c.item)) for (let i = 0; i < n; i++) p.inv.add(createItem(c.item));
      G.audio?.at?.('rummage', o.x + 0.5, o.y + 0.5, 0.7);
      // a few seeds come back
      const seedKey = findSeedFor(o.state.crop);
      if (seedKey && Math.random() < 0.6 * Math.min(1.5, profMul('yield'))) p.inv.add(createItem(seedKey));
      op('objState', { z: zk, uid: o.uid, patch: { crop: null, stage: 0, growth: 0, dead: false, pest: 0, blight: 0, tilled: false } });
      p.body.addXp('farming', 8);
      profXp('botanist', 4 + n, 'harvest');
      bump('farm_harvest');
      bus.emit('inventoryChanged', p);
      bus.emit('cropHarvested', p, c.item, n);
      // what you grew teaches what it is good for
      discoverFrom(c.item, 'find');
    });
  }

  clear(p: Player, o: TileObject) {
    this.at(p, o, 'Pull up', 1.5, 'loot', () => op('objState', { z: p.zoneKey, uid: o.uid, patch: { crop: null, stage: 0, growth: 0, dead: false, pest: 0, blight: 0 } }));
  }

  /** a hoe turns an empty bed: the next crop grows a quarter faster and gives one more */
  till(p: Player, o: TileObject) {
    this.at(p, o, 'Turn the soil', 3, 'dig', () => {
      const hoe = toolOf(p, 'hoe');
      if (!hoe || o.state.crop) return;
      hoe.cond = Math.max(0, (hoe.cond ?? 1) - 0.01);
      op('objState', { z: p.zoneKey, uid: o.uid, patch: { tilled: true } });
      G.audio?.at?.('dig', o.x + 0.5, o.y + 0.5, 0.6);
      p.body.addXp('farming', 2);
    });
  }
  /** mites: sprayed off (and kept off two days) or picked off by hand (half of them) */
  treatPests(p: Player, o: TileObject) {
    const spray = toolOf(p, 'pesticide');
    this.at(p, o, spray ? 'Spray' : 'Pick off mites', spray ? 2 : 4, spray ? 'pour' : 'harvest', () => {
      const sp = toolOf(p, 'pesticide');
      const patch: Record<string, unknown> = { pest: sp ? 0 : Math.max(0, (o.state.pest ?? 0) - 0.5) };
      if (sp) { sp.uses = Math.max(0, (sp.uses ?? 1) - 1 / (itemDef(sp.key).uses ?? 6)); if (sp.uses <= 0.001) p.removeItem(sp); patch.sprayed = G.clock.hours + 48; }
      op('objState', { z: p.zoneKey, uid: o.uid, patch });
      G.audio?.at?.(sp ? 'pour' : 'rummage', o.x + 0.5, o.y + 0.5, 0.5);
      p.body.addXp('farming', 2);
      profXp('botanist', 3, 'pests');
      bus.emit('inventoryChanged', p);
    });
  }
  /** blight: cut out clean with shears or a knife, or the worst leaves pulled by hand */
  cutBlight(p: Player, o: TileObject) {
    const cut = toolOf(p, 'shears') || toolOf(p, 'sharp');
    this.at(p, o, cut ? 'Cut out blight' : 'Pull mouldy leaves', cut ? 2.5 : 3.5, 'harvest', () => {
      const t = toolOf(p, 'shears') || toolOf(p, 'sharp');
      if (t) t.cond = Math.max(0, (t.cond ?? 1) - 0.01);
      op('objState', { z: p.zoneKey, uid: o.uid, patch: { blight: t ? 0 : Math.max(0, (o.state.blight ?? 0) - 0.4) } });
      G.audio?.at?.('rummage', o.x + 0.5, o.y + 0.5, 0.5);
      p.body.addXp('farming', 2);
      profXp('botanist', 3, 'blight');
    });
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
        const powered = !hydro || selfLit(o) || !!G.items?.generatorPowers?.(z, o.x, o.y) || z.circuitPowered?.(z.roomAt(o.x, o.y).circuit);
        // trouble: mites find a growing crop (less often under Pest Watch, never while the spray holds), blight a
        // sodden one; both spread through the plants, slow them, and kill them at full strength
        const st0 = Math.floor(o.state.stage ?? 0);
        let pest = o.state.pest ?? 0, blight = o.state.blight ?? 0;
        const watch = (hasUnlock('hb_ipm') ? 0.5 : 1) * profMul('pest');
        if (st0 >= 1 && st0 < 5) {
          if (pest > 0) pest = Math.min(1, pest + h * 0.03);
          else if ((o.state.sprayed ?? -1) < G.clock.hours && Math.random() < h * 0.006 * watch * (outdoor ? 1.3 : 1)) pest = 0.05;
          if (blight > 0) blight = Math.min(1, blight + h * (water > 70 ? 0.035 : 0.012));
          else if (!hydro && water > 85 && Math.random() < h * 0.012 * watch) blight = 0.05;
        }
        const sick = Math.max(pest, blight);
        // fungi grow best in the dark: light slows them
        const lk = c.dark ? Math.max(0.25, 1.1 - light * 0.8) : light;
        if (water > 5) growth += h / (c.days * 24) * 4 * lk * (c.dark && hasUnlock('hb_mycology') ? 1.5 : 1) * (hydro ? (powered ? 1.6 : 0.8) * (hasUnlock('hb_hydro') ? 1.25 : 1) * profMul('hydro') : 1) * (o.state.worker ? 1.2 : 1) * (o.state.tilled ? 1.25 : 1) * (1 - 0.6 * sick) * profMul('grow');
        const dry = water <= 0 ? (o.state.dry ?? 0) + h : 0;
        const stage = Math.min(5, Math.floor(growth));
        const patch: Record<string, any> = { water, growth, dry, pest, blight };
        if (dry > 48) patch.dead = true;
        // full-strength trouble for half a day kills the crop
        const doom = sick >= 1 ? (o.state.doom ?? 0) + h : 0;
        patch.doom = doom;
        if (doom > 12) patch.dead = true;
        const wetFlip = (water > 20) !== ((o.state.water ?? 0) > 20);
        const sickFlip = Math.round(pest * 3) !== Math.round((o.state.pest ?? 0) * 3) || Math.round(blight * 3) !== Math.round((o.state.blight ?? 0) * 3);
        if (stage !== Math.floor(o.state.stage ?? 0) || patch.dead || wetFlip || sickFlip) { patch.stage = stage; op('objState', { z: z.key, uid: o.uid, patch }); }
        else Object.assign(o.state, patch);
      }
    }
  }
}

let seedIndex: Map<string, string> | null = null;
/** the seed item that sows a crop (every item with a `seed`; the first defined wins) */
export function findSeedFor(crop: string): string | null {
  if (!seedIndex) {
    seedIndex = new Map();
    for (const d of allItemDefs()) if (d.seed && !seedIndex.has(d.seed)) seedIndex.set(d.seed, d.key);
  }
  return seedIndex.get(crop) ?? null;
}

import { G } from '../game/G';
import type { Player } from '../entities/player';
import { MenuOption } from '../ui/ui';
import { Item, itemDef } from '../items/item';
import { Recipe, RecipeInput, allRecipes } from '../items/recipes';
import { TimedAction } from '../actions/action';
import { createItem } from '../items/factory';
import { bus } from '../core/events';
import { SkillKey } from '../survival/traits';
import { storeItems, storeOf, takeFromStore, craftQuality, applyQuality, GRADES } from '../craft/stores';
import { craftSpeed } from '../build/speed';
import { talentMul } from '../survival/talents';

function matches(it: Item, key: string): boolean {
  if (key.startsWith('#')) { const d = itemDef(it.key); return (d.tags || []).includes(key.slice(1)) || d.key === key.slice(1); }
  return it.key === key;
}

export interface CraftCheck { ok: boolean; missing: string[]; picks: { inp: RecipeInput; items: Item[] }[]; }

/** Can the player craft this recipe right now? Also chooses which items get used. */
export function checkRecipe(p: Player, r: Recipe, prefer?: Item[] | null): CraftCheck {
  const missing: string[] = [];
  const picks: CraftCheck['picks'] = [];
  const used = new Set<Item>();
  // round 16: the crates and lockers of the camp you stand in are part of your hands (src/craft/stores.ts)
  let pool = [...p.allItems().filter((i) => !p.isWorn(i)), ...storeItems(p)];
  // things laid out on the workbench get used first
  if (prefer?.length) { const pref = new Set(prefer); pool = [...pool.filter((i) => pref.has(i)), ...pool.filter((i) => !pref.has(i))]; }
  for (const inp of r.inputs) {
    const need = inp.count ?? 1;
    const cands = pool.filter((i) => !used.has(i) && matches(i, inp.item) && (i.cond > 0 || !itemDef(i.key).durability));
    let got: Item[] = [];
    if (inp.uses) got = cands.filter((i) => (i.uses ?? 1) >= inp.uses! - 1e-6).slice(0, 1);
    else if (inp.fluid) got = cands.filter((i) => i.fluid && i.fluid.type === inp.fluid![0] && i.fluid.amount >= inp.fluid![1] - 1e-6).slice(0, 1);
    else got = cands.slice(0, need);
    if (got.length < (inp.uses || inp.fluid ? 1 : need)) {
      const nm = inp.item.startsWith('#') ? inp.item.slice(1) : itemDef(inp.item).name;
      missing.push((need > 1 ? need + '× ' : '') + nm + (inp.fluid ? ` (${inp.fluid[1]}L ${inp.fluid[0]})` : ''));
    } else { if (!inp.keep) got.forEach((g) => used.add(g)); picks.push({ inp, items: got }); }
  }
  if (r.skill) { const lvl = p.body.skill(r.skill[0] as SkillKey); if (lvl < r.skill[1]) missing.push(`${r.skill[0]} ${r.skill[1]}`); }
  if (r.learned) { const known: Set<string> | undefined = (p as any).knownRecipes; if (!known?.has(r.key)) missing.push('unknown schematic'); }
  const needs = (Array.isArray(r.needs) ? r.needs : r.needs ? [r.needs as any] : []) as string[];
  for (const n of needs) {
    if (n === 'fire' || n === 'stove') { if (!G.interact?.nearHeat?.(p)) missing.push('heat source'); }
    else if (n === 'workbench') { if (!G.interact?.nearTag?.(p, 'workbench')) missing.push('workbench'); }
    else if (n === 'bench2') { if (!G.interact?.nearTag?.(p, 'bench2')) missing.push('powered workbench'); }
    else if (n === 'bench3') { if (!G.interact?.nearTag?.(p, 'bench3')) missing.push("machinist's bench"); }
    else if (n === 'water') { if (!G.interact?.nearWater?.(p)) missing.push('water source'); }
    else if (n === 'power') { if (!G.interact?.hasPower?.(p)) missing.push('electricity'); }
    else if (n === 'light') { if (G.lightLevelAt(p.x, p.z) < 0.1) missing.push('light'); }
  }
  return { ok: missing.length === 0, missing, picks };
}

export class CraftAction extends TimedAction {
  /** items to use first (laid out on the workbench, src/craft/bench.ts) */
  prefer: Item[] | null = null;
  constructor(p: Player, public r: Recipe, public times = 1) {
    super(p);
    this.name = times > 1 ? `${r.name} (${times} queued)` : r.name;
    const sk = r.xp ? p.body.skill(r.xp[0] as SkillKey) : 0;
    this.duration = r.time * (1 - sk * 0.05) * (p.body.has('handy') && r.category === 'carpentry' ? 0.75 : 1) / craftSpeed(p) * talentMul(p.body, 'craft');
    this.anim = r.anim === 'hammer' ? 'hammer' : r.anim === 'saw' ? 'saw' : r.anim === 'cook' ? 'craft' : 'craft';
    this.sound = r.sound;
  }
  isValid() { return checkRecipe(this.p, this.r).ok; }
  start() { G.audio?.loop?.(this.r.sound || (this.r.anim === 'hammer' ? 'hammer' : this.r.anim === 'saw' ? 'saw' : 'craft'), this.p, true); }
  stop() { G.audio?.loop?.(this.r.sound || 'craft', this.p, false); }
  perform() {
    G.audio?.loop?.(this.r.sound || 'craft', this.p, false);
    const chk = checkRecipe(this.p, this.r, this.prefer);
    if (!chk.ok) return;
    let condFrom: Item | null = null;
    // kept inputs an output refers to are changed in place (boiling, purifying, repairs, patches, charging)
    const inPlace = new Set(this.r.outputs.map((o) => o.item));
    const kept = new Map<string, Item[]>();
    // the grade of what comes out: the tools' condition, the bench, the skill (src/craft/stores.ts)
    const tools = chk.picks.filter((pk) => pk.inp.keep && !inPlace.has(pk.inp.item) && !pk.inp.fluid).flatMap((pk) => pk.items);
    const q = craftQuality(this.p, this.r, tools);
    for (const pk of chk.picks) {
      for (const it of pk.items) {
        // out of a camp store: it leaves through the store's op
        if (!this.p.containerOf(it) && storeOf(this.p, it)) {
          if (pk.inp.keep) { const d = itemDef(it.key); if (d.durability) it.cond = Math.max(0, it.cond - 1 / d.durability); continue; }
          if (pk.inp.uses) { takeFromStore(this.p, it, (it.uses ?? 1) - pk.inp.uses); continue; }
          if (pk.inp.fluid && it.fluid) { it.fluid.amount -= pk.inp.fluid[1]; if (it.fluid.amount <= 0.005) it.fluid = null; continue; }
          takeFromStore(this.p, it);
          continue;
        }
        if (this.r.keepCondFrom && matches(it, this.r.keepCondFrom)) condFrom = it;
        if (pk.inp.keep) {
          const d = itemDef(it.key);
          if (inPlace.has(pk.inp.item)) { const a = kept.get(pk.inp.item) || []; a.push(it); kept.set(pk.inp.item, a); continue; }
          if (pk.inp.fluid && it.fluid) { it.fluid.amount -= pk.inp.fluid[1]; if (it.fluid.amount <= 0.005) it.fluid = null; }
          if (d.durability) it.cond = Math.max(0, it.cond - 1 / d.durability);
          continue;
        }
        if (pk.inp.uses) { it.uses = (it.uses ?? 1) - pk.inp.uses; if (it.uses <= 0.005) this.p.removeItem(it); continue; }
        if (pk.inp.fluid && it.fluid) { it.fluid.amount -= pk.inp.fluid[1]; if (it.fluid.amount <= 0.005) it.fluid = null; continue; }
        this.p.removeItem(it);
      }
    }
    let label = '';
    for (const out of this.r.outputs) {
      const same = kept.get(out.item);
      if (same?.length) {
        for (const it of same) {
          if (out.fluid) { if (it.fluid) it.fluid = { type: out.fluid[0] as any, amount: it.fluid.amount }; }
          else {
            it.cond = Math.min(1, it.cond + 0.6);
            if (it.uses !== undefined || itemDef(it.key).uses) it.uses = 1;
          }
          label = label || (out.fluid ? `${itemDef(it.key).name}: ${out.fluid[0]}` : `${itemDef(it.key).name} restored`);
        }
        continue;
      }
      if (out.fluid) {
        // fill a container that was an input (e.g. a drink mixed into a bottle)
        const vessel = chk.picks.flatMap((p) => p.items).find((i) => itemDef(i.key).fluidCap);
        if (vessel) vessel.fluid = { type: out.fluid[0] as any, amount: Math.min(itemDef(vessel.key).fluidCap!, (vessel.fluid?.amount ?? 0) + out.fluid[1]) };
        continue;
      }
      if (out.item.startsWith('#')) continue;
      for (let i = 0; i < (out.count ?? 1); i++) {
        const it = createItem(out.item, undefined, { pristine: true });
        if (condFrom) it.cond = Math.min(1, condFrom.cond + 0.25);
        else applyQuality(it, q);
        if (itemDef(out.item).food?.cookable && this.r.category === 'cooking') it.cooked = 1;
        this.p.inv.add(it);
      }
      label = label || `+${out.count ?? 1} ${itemDef(out.item).name}`;
      const od = itemDef(out.item);
      if ((od.durability || od.weapon) && !condFrom && q !== 1) label += ` (${GRADES[q]})`;
    }
    if (this.r.xp) this.p.body.addXp(this.r.xp[0] as SkillKey, this.r.xp[1]);
    if (label) bus.emit('halo', this.p, label, 'good');
    bus.emit('crafted', this.p, this.r);
    bus.emit('inventoryChanged', this.p);
    // the craft queue: the next one goes to the front of the line while it still can be made
    if (this.times > 1 && checkRecipe(this.p, this.r).ok) this.p.actions.list.unshift(new CraftAction(this.p, this.r, this.times - 1));
  }
}

/** how many times over this recipe can be made right now (capped) */
export function craftableTimes(p: Player, r: Recipe, cap = 10): number {
  const chk = checkRecipe(p, r);
  if (!chk.ok) return 0;
  let n = cap;
  for (const pk of chk.picks) {
    if (pk.inp.keep) continue;
    const need = pk.inp.count ?? 1;
    const pool = [...p.allItems().filter((i) => !p.isWorn(i)), ...storeItems(p)].filter((i) => matches(i, pk.inp.item));
    if (pk.inp.uses) n = Math.min(n, Math.floor(pool.reduce((a, i) => a + (i.uses ?? 1), 0) / pk.inp.uses + 1e-6));
    else if (pk.inp.fluid) n = Math.min(n, 1);
    else n = Math.min(n, Math.floor(pool.length / need));
  }
  return Math.max(1, n);
}
/** queue the same recipe n times (the craft queue) */
export function queueCraft(p: Player, r: Recipe, n: number) { p.actions.add(new CraftAction(p, r, Math.max(1, Math.min(10, n)))); }

export function recipesUsing(it: Item): Recipe[] {
  return allRecipes().filter((r) => r.inputs.some((inp) => matches(it, inp.item)));
}

export function craftOptionsForItem(p: Player, it: Item): MenuOption[] {
  const out: MenuOption[] = [];
  for (const r of recipesUsing(it).slice(0, 14)) {
    if (r.learned && !(p as any).knownRecipes?.has(r.key)) continue;
    const chk = checkRecipe(p, r);
    out.push({ label: r.name, disabled: chk.ok ? false : 'needs ' + chk.missing.slice(0, 2).join(', '), action: () => p.actions.add(new CraftAction(p, r)) });
    const n = chk.ok ? Math.min(5, craftableTimes(p, r, 5)) : 0;
    if (n >= 2) out.push({ label: `${r.name} ×${n}`, action: () => queueCraft(p, r, n) });
  }
  return out;
}

import { G } from '../game/G';
import type { Player } from '../entities/player';
import { MenuOption } from '../ui/ui';
import { Item, itemDef } from '../items/item';
import { Recipe, RecipeInput, allRecipes } from '../items/recipes';
import { TimedAction } from '../actions/action';
import { createItem } from '../items/factory';
import { bus } from '../core/events';
import { SkillKey } from '../survival/traits';

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
  let pool = p.allItems().filter((i) => !p.isWorn(i));
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
    this.name = r.name;
    const sk = r.xp ? p.body.skill(r.xp[0] as SkillKey) : 0;
    this.duration = r.time * (1 - sk * 0.05) * (p.body.has('handy') && r.category === 'carpentry' ? 0.75 : 1);
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
    for (const pk of chk.picks) {
      for (const it of pk.items) {
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
        if (itemDef(out.item).food?.cookable && this.r.category === 'cooking') it.cooked = 1;
        this.p.inv.add(it);
      }
      label = label || `+${out.count ?? 1} ${itemDef(out.item).name}`;
    }
    if (this.r.xp) this.p.body.addXp(this.r.xp[0] as SkillKey, this.r.xp[1]);
    if (label) bus.emit('halo', this.p, label, 'good');
    bus.emit('crafted', this.p, this.r);
    bus.emit('inventoryChanged', this.p);
  }
}

export function recipesUsing(it: Item): Recipe[] {
  return allRecipes().filter((r) => r.inputs.some((inp) => matches(it, inp.item)));
}

export function craftOptionsForItem(p: Player, it: Item): MenuOption[] {
  const out: MenuOption[] = [];
  for (const r of recipesUsing(it).slice(0, 14)) {
    if (r.learned && !(p as any).knownRecipes?.has(r.key)) continue;
    const chk = checkRecipe(p, r);
    out.push({ label: r.name, disabled: chk.ok ? false : 'needs ' + chk.missing.slice(0, 2).join(', '), action: () => p.actions.add(new CraftAction(p, r)) });
  }
  return out;
}

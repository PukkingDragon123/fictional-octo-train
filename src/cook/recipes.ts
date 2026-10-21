// Dishes: what a pan or a pot of ingredients turns into when it is plated.
// Recipes match ingredient classes (meat, organ, veg, weird parts...). Known
// recipes (research branch 'recipe', or discovered by cooking them once) cook
// at full quality; improvising a recipe you don't know yet costs a little.
import { itemDef } from '../items/item';
import { defNode, hasUnlock } from '../game/research';

export type Cls = 'meat' | 'organ' | 'veg' | 'fruit' | 'sweet' | 'grain' | 'egg' | 'human' | 'marrow' | 'tallow' | 'glow' | 'weird' | 'extra';
export interface DishRecipe {
  key: string;
  name: string;
  dish: string;
  vessel: 'pan' | 'pot' | 'any';
  /** ingredient classes and how many at least; arrays = any of these classes */
  needs: [Cls | Cls[], number][];
  node?: string;
  hint: string;
}

export function classOf(key: string): Cls {
  const d = itemDef(key), tags = d.tags || [];
  if (tags.includes('longpig')) return 'human';
  if (key === 'part_tallow') return 'tallow';
  if (key === 'part_stilt_marrow') return 'marrow';
  if (key === 'part_glow_sac' || key === 'part_echo_cochlea' || key === 'part_stutter_gland') return 'glow';
  if (tags.includes('organ')) return 'organ';
  switch (d.food?.ingredient) {
    case 'meat': case 'fish': return 'meat';
    case 'veg': return 'veg';
    case 'fruit': return 'fruit';
    case 'sweet': return 'sweet';
    case 'grain': return 'grain';
    case 'egg': return 'egg';
    case 'weird': return 'weird';
    default: return tags.includes('produce') ? 'veg' : 'extra';
  }
}

const MEATY: Cls[] = ['meat', 'organ', 'human', 'marrow'];
export const RECIPES: DishRecipe[] = [
  { key: 'glow', name: 'Glow Broth', dish: 'dish_glow_broth', vessel: 'pot', needs: [['glow', 1], [['veg', 'fruit', 'weird'], 1]], node: 'rc_glow', hint: 'a glowing gland + a vegetable, simmered' },
  { key: 'wax', name: 'Tallow Candy', dish: 'dish_wax_candy', vessel: 'pan', needs: [['tallow', 1], [['sweet', 'fruit'], 1]], node: 'rc_wax', hint: 'wax-fat + something sweet, fried glassy' },
  { key: 'long', name: 'Long Ration', dish: 'dish_gristle_stew', vessel: 'pot', needs: [['human', 1]], node: 'rc_long', hint: 'pale gristle, boiled until it stops looking like anything' },
  { key: 'marrow', name: 'Roast Marrow Toast', dish: 'dish_marrow', vessel: 'pan', needs: [['marrow', 1]], node: 'rc_marrow', hint: 'stilt marrow, roasted in its bone' },
  { key: 'stew', name: 'Backrooms Stew', dish: 'dish_stew', vessel: 'pot', needs: [[MEATY, 1], [['veg', 'fruit'], 2]], node: 'rc_stew', hint: 'any meat + two vegetables in the pot, stirred' },
  { key: 'offal', name: 'Offal Fry-Up', dish: 'dish_offal', vessel: 'pan', needs: [['organ', 1], [['veg', 'fruit'], 1]], node: 'rc_offal', hint: 'heart, liver or coil + a vegetable' },
  { key: 'skewer', name: 'Grill Skewers', dish: 'dish_skewer', vessel: 'pan', needs: [[MEATY, 2]], node: 'rc_skewer', hint: 'two cuts of meat, turned often' },
  { key: 'hash', name: 'Skillet Hash', dish: 'dish_hash', vessel: 'pan', needs: [[MEATY, 1], [['veg', 'fruit', 'grain', 'egg'], 1]], hint: 'meat + a vegetable, fried together' },
  { key: 'garden', name: 'Fluorescent Garden Fry', dish: 'dish_garden', vessel: 'pan', needs: [[['veg', 'fruit'], 2]], hint: 'two vegetables, blistered' },
  { key: 'seared', name: 'Seared Cutlet', dish: 'dish_seared', vessel: 'pan', needs: [[MEATY, 1]], hint: 'one cut of meat, both sides' },
];

/** first recipe the ingredients satisfy in this vessel */
export function matchRecipe(keys: string[], vessel: 'pan' | 'pot'): DishRecipe | null {
  const cls = keys.map(classOf);
  for (const r of RECIPES) {
    if (r.vessel !== 'any' && r.vessel !== vessel) continue;
    const used = new Array(cls.length).fill(false);
    let ok = true;
    for (const [want, n] of r.needs) {
      const set = Array.isArray(want) ? want : [want];
      let got = 0;
      for (let i = 0; i < cls.length && got < n; i++) if (!used[i] && set.includes(cls[i])) { used[i] = true; got++; }
      if (got < n) { ok = false; break; }
    }
    if (ok) return r;
  }
  return null;
}
export const recipeKnown = (r: DishRecipe) => !r.node || hasUnlock(r.node);

// ---------------------------------------------------------------- research: branch 'recipe'
defNode({ key: 'rc_stew', branch: 'recipe', title: 'Backrooms Stew', desc: 'Any meat and two vegetables in a pot, stirred so it does not catch. Filling, calming.', cost: 2, icon: 'pot' });
defNode({ key: 'rc_skewer', branch: 'recipe', title: 'Grill Skewers', desc: 'Two cuts of meat on a wire, turned often over a hot grate.', cost: 2, icon: 'meat' });
defNode({ key: 'rc_offal', branch: 'recipe', title: 'Offal Fry-Up', desc: 'Heart, liver or gut with a vegetable. Iron and grease.', cost: 2, icon: 'heart' });
defNode({ key: 'rc_marrow', branch: 'recipe', title: 'Roast Marrow', desc: 'Split a stilt doe\'s leg bone and roast the marrow.', cost: 3, icon: 'bone' });
defNode({ key: 'rc_wax', branch: 'recipe', title: 'Tallow Candy', desc: 'Wax-fat from a Still Life fried with sugar until it sets glassy. Strangely comforting.', cost: 4, icon: 'candy' });
defNode({ key: 'rc_glow', branch: 'recipe', title: 'Glow Broth', desc: 'A glowing gland simmered with a vegetable. Clears the head. Mostly.', cost: 5, requires: ['rc_stew'], icon: 'glow' });
defNode({ key: 'rc_long', branch: 'recipe', title: 'Long Ration', desc: 'What you do with what came off something shaped like a person. Nobody needs to know.', cost: 1, icon: 'skull' });

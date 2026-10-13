/**
 * Crafting recipes. Inputs reference an item key or a tag ("#hammer"). Tools
 * (keep: true) are required but not consumed (they may lose condition).
 * Drainables (thread, tape, glue) consume `uses` fractions instead of items.
 */
export interface RecipeInput {
  item: string;             // item key, or '#tag' for any item with that tag
  count?: number;           // default 1
  keep?: boolean;           // tool: not consumed
  uses?: number;            // drainable fraction consumed (0..1)
  fluid?: [string, number]; // fluid type + litres consumed from a container
}

export interface RecipeOutput { item: string; count?: number; fluid?: [string, number]; }

export interface Recipe {
  key: string;
  name: string;
  category: 'survival' | 'medical' | 'cooking' | 'carpentry' | 'electrical' | 'tailoring' | 'weapons' | 'farming' | 'trapping' | 'misc' | 'anomaly';
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  time: number;             // seconds of real-time action at skill 0
  skill?: [string, number]; // required skill level
  xp?: [string, number];
  needs?: ('fire' | 'stove' | 'workbench' | 'water' | 'power' | 'light' | 'surface')[];
  /** must be learned from a magazine/schematic first */
  learned?: boolean;
  anim?: 'craft' | 'hammer' | 'saw' | 'cook' | 'stitch' | 'mix';
  sound?: string;
  desc?: string;
  /** the output takes the input's condition (e.g. sharpening) */
  keepCondFrom?: string;
}

const REG = new Map<string, Recipe>();
export function defRecipe(r: Recipe): Recipe { REG.set(r.key, r); return r; }
export function recipe(key: string) { return REG.get(key); }
export function allRecipes() { return [...REG.values()]; }

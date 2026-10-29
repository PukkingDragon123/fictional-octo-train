// Crafting knowledge on the watch's research tree (branch 'recipe') and the
// quests that teach hands-on crafting. Hand steps are found by doing; the
// tree buys better methods (fewer strikes, tighter bindings, faster bench
// work), blueprints for new tools, and the schematics that used to come only
// from magazines.
import { defNode, hasUnlock } from '../game/research';
import { defQuest } from '../game/quests';
import { allRecipes, Recipe } from '../items/recipes';
import { G } from '../game/G';
import { bus } from '../core/events';

defNode({ key: 'rc_scavenger', branch: 'recipe', title: 'Scavenger\'s Hands', cost: 0, icon: 'hand',
  desc: 'What every debtor works out in the first hour: chair legs come off, shirts tear into strips, scrap takes an edge if you hit it enough.' });
defNode({ key: 'rc_edgework', branch: 'recipe', title: 'Edge Work', cost: 3, requires: ['rc_scavenger'], icon: 'blade',
  desc: 'Strike at a shallow angle and turn the piece. Sharpening takes about a third fewer blows. Blueprint: bind a grip onto sharpened iron for a Scrap Knife.' });
defNode({ key: 'rc_lashing', branch: 'recipe', title: 'Lashing Knots', cost: 3, requires: ['rc_scavenger'], icon: 'rope',
  desc: 'Square lashing, half hitches, a frapping turn. Bindings and braids need fewer wraps.' });
defNode({ key: 'rc_crude_tools', branch: 'recipe', title: 'Crude Tools', cost: 5, requires: ['rc_edgework', 'rc_lashing'], icon: 'hammer',
  desc: 'Blueprint: a stone lashed into a split handle makes a Crude Hammer. Everything you bind by hand comes out sound.' });
defNode({ key: 'rc_bench', branch: 'recipe', title: 'Bench Craft', cost: 4, requires: ['rc_scavenger'], icon: 'bench',
  desc: 'Jigs, clamps and a sense of order. Assembling recipes at a workbench goes a third faster.' });
defNode({ key: 'rc_tailor', branch: 'recipe', title: 'Pattern Cutting', cost: 4, requires: ['rc_scavenger'], icon: 'needle',
  desc: 'Schematics: sew a backpack, a sleeping bag, and every other tailoring pattern that used to come from a magazine.' });
defNode({ key: 'rc_field_medic', branch: 'recipe', title: 'Field Kit', cost: 4, requires: ['rc_scavenger'], icon: 'cross',
  desc: 'Schematics: suture kits, alcohol swabs and the rest of the medical recipes the Institute keeps in binders.' });
defNode({ key: 'rc_schematics', branch: 'recipe', title: 'Recovered Schematics', cost: 8, requires: ['rc_bench'], icon: 'blueprint',
  desc: 'R&D\'s salvage archive, decrypted onto your watch: every remaining schematic, from traps to electronics.' });

/** which research node teaches a schematic (learned: true) recipe */
export function nodeForRecipe(r: Recipe): string {
  if (r.category === 'tailoring') return 'rc_tailor';
  if (r.category === 'medical') return 'rc_field_medic';
  return 'rc_schematics';
}
export function recipeHint(r: Recipe): string {
  if (!r.learned) return '';
  const n = nodeForRecipe(r);
  return hasUnlock(n) ? '' : 'research it on the watch, or find it in print';
}

/** research you own teaches the survivor the schematics it covers */
export function syncKnowledge() {
  const p = G.local as any;
  if (!p) return;
  const known: Set<string> = p.knownRecipes || (p.knownRecipes = new Set<string>());
  let n = 0;
  for (const r of allRecipes()) if (r.learned && !known.has(r.key) && hasUnlock(nodeForRecipe(r))) { known.add(r.key); n++; }
  if (n) bus.emit('think', p, n === 1 ? 'I know how to make something new.' : `${n} new schematics on the watch.`);
}
bus.on('researchUnlocked', () => { try { syncKnowledge(); } catch (e) { console.warn('knowledge', e); } });

// ---------------------------------------------------------------- quests
const has = (m: any, f: string) => !!m?.flags?.has?.(f);
defQuest({
  key: 'cq_cube', title: 'Thumb on the Glass', giver: 'VOSS', category: 'tutorial', auto: true,
  desc: 'That pack on your back is Programme property and it only opens for you. Open it, pack it properly, and put a tool on your hip where you can reach it.',
  objectives: [
    { id: 'open', text: 'Open the field pack: the seal reads your band (I)', check: (m) => has(m, 'pack:opened') },
    { id: 'pack', text: 'Put something in the pack', check: (m) => has(m, 'pack:packed') },
    { id: 'holster', text: 'Draw a tool from the quick-draw holster (` or Y)', check: (m) => has(m, 'pack:holster'), optional: true },
  ],
  reward: { rp: 2 },
});
defQuest({
  key: 'cq_first_axe', title: 'Make Your First Axe', giver: 'VOSS', category: 'crafting', requires: ['cq_cube'],
  desc: 'Furniture won\'t smash itself and the Institute isn\'t issuing tools. A handle, a head and something to bind them. Find a chair, find scrap, find a shirt nobody needs. Double-click things to work on them.',
  objectives: [
    { id: 'leg', text: 'Saw or knock a leg off a chair', check: (m) => has(m, 'craft:chair_leg') },
    { id: 'edge', text: 'Beat scrap metal to an edge with a rock or something hard', check: (m) => has(m, 'craft:sharp_iron') },
    { id: 'strips', text: 'Tear cloth into strips (or find rope)', check: (m) => has(m, 'craft:cloth_strips') || has(m, 'craft:rope') || has(m, 'craft:crude_axe') },
    { id: 'axe', text: 'Bind the head onto the handle', check: (m) => has(m, 'craft:crude_axe') },
  ],
  reward: { rp: 6, unlock: ['rc_edgework'] },
});
defQuest({
  key: 'cq_rope', title: 'Over and Under', giver: 'MERIDIAN R&D', category: 'crafting', requires: ['cq_first_axe'],
  desc: 'R&D would like to know whether a debtor can braid. Three strips of cloth. Twist them.',
  objectives: [{ id: 'rope', text: 'Braid cloth strips into rope', check: (m) => has(m, 'craft:rope') }],
  reward: { rp: 3, unlock: ['rc_lashing'] },
});
defQuest({
  key: 'cq_bench', title: 'Bench Work', giver: 'MERIDIAN R&D', category: 'crafting', requires: ['cq_first_axe'],
  desc: 'Find a workbench. Lay the parts out of your cube on the boards and make something with your hands.',
  objectives: [{ id: 'bench', text: 'Make something at a workbench', check: (m) => has(m, 'craft:bench') }],
  reward: { rp: 4 },
});

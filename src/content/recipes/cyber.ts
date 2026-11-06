// Recipes — CYBERWARE: the two scrap parts you can make yourself. (Nothing is
// fitted in the field any more: feed a part to a press and the lab files its
// design; the unit room fits it between runs, src/ui/menus/intake.ts.)
import { defRecipe } from '../../items/recipes';

defRecipe({
  key: 'make_scrap_arm', name: 'Build Scrapjack Arm', category: 'misc', time: 50, needs: ['workbench'],
  inputs: [{ item: 'scrap_metal', count: 4 }, { item: 'pipe', count: 2 }, { item: 'wire' }, { item: '#tape', uses: 0.4 }, { item: '#hammer', keep: true }],
  outputs: [{ item: 'cy_scrap_arm' }], anim: 'hammer', xp: ['mechanics', 20],
  desc: 'Pipe, a jack piston and a vice where the hand goes. It will hit hard and it will rust.',
});
defRecipe({
  key: 'make_scrap_leg', name: 'Build Scrapjack Leg', category: 'misc', time: 50, needs: ['workbench'],
  inputs: [{ item: 'scrap_metal', count: 4 }, { item: 'pipe', count: 2 }, { item: 'sheet_metal' }, { item: '#tape', uses: 0.4 }, { item: '#hammer', keep: true }],
  outputs: [{ item: 'cy_scrap_leg' }], anim: 'hammer', xp: ['mechanics', 20],
  desc: 'A scaffold pole, a van shock absorber and a steel-toe boot. Loud. Unbreakable. Rusts.',
});

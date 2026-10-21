// Recipes — CYBERWARE: the workbench-built field surgery rig and the two scrap
// parts you can make yourself. (Fitting them happens on an operating table or
// with the rig: right-click yourself → Cyberware; src/survival/cyber.ts.)
import { defRecipe } from '../../items/recipes';

defRecipe({
  key: 'make_surgery_rig', name: 'Build Field Surgery Rig', category: 'medical', time: 60, needs: ['workbench'],
  inputs: [{ item: 'scrap_metal', count: 3 }, { item: 'pipe' }, { item: 'wire' }, { item: 'battery' }, { item: '#saw', keep: true }, { item: '#screwdriver', keep: true }],
  outputs: [{ item: 'surgery_rig' }], anim: 'hammer', skill: ['mechanics', 1], xp: ['mechanics', 25],
  desc: 'A folding arm, a bone saw and a bolt driver on a case of sockets. For taking off what you have and fitting what you found.',
});
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

// Recipes — LIMB LOSS: improvised tourniquets, crutches, a peg leg and a hook.
// (Treating a stump — tourniquet, cauterising, closing it — happens from the
// world right-click menu and the bandage menu; see src/survival/limbSystem.ts.)
import { defRecipe } from '../../items/recipes';

defRecipe({
  key: 'tourniquet_belt', name: 'Make Tourniquet (Belt)', category: 'medical', time: 4,
  inputs: [{ item: 'belt' }, { item: 'twigs' }], outputs: [{ item: 'tourniquet_improv' }], anim: 'craft',
  desc: 'Loop a belt, slide a stick under it to twist it tight.',
});
defRecipe({
  key: 'tourniquet_rags', name: 'Make Tourniquet (Rags)', category: 'medical', time: 5,
  inputs: [{ item: 'rag', count: 2 }, { item: 'twigs' }], outputs: [{ item: 'tourniquet_improv' }], anim: 'craft',
  desc: 'Twist two rags into a band, knot a stick into it for a windlass.',
});
defRecipe({
  key: 'tourniquet_strips', name: 'Make Tourniquet (Leather)', category: 'medical', time: 5,
  inputs: [{ item: 'leather_strips' }, { item: 'twigs' }], outputs: [{ item: 'tourniquet_improv' }], anim: 'craft',
});
defRecipe({
  key: 'make_crutch_wood', name: 'Build Wooden Crutch', category: 'carpentry', time: 30,
  inputs: [{ item: 'plank', count: 2 }, { item: 'nails', uses: 0.08 }, { item: 'rag' }, { item: '#hammer', keep: true }, { item: '#saw', keep: true }],
  outputs: [{ item: 'crutch_wood' }], anim: 'hammer', skill: ['carpentry', 1], xp: ['carpentry', 12],
  desc: 'A forearm crutch: a shaft, a handle, a padded cuff.',
});
defRecipe({
  key: 'make_crutch_pipe', name: 'Build Pipe Crutch', category: 'survival', time: 20,
  inputs: [{ item: 'pipe', count: 2 }, { item: '#tape', uses: 0.3 }, { item: 'rag' }], outputs: [{ item: 'crutch' }], anim: 'craft', xp: ['mechanics', 6],
  desc: 'Two pipes, a lot of tape and a rag for the grip.',
});
defRecipe({
  key: 'make_peg_leg', name: 'Carve Peg Leg', category: 'carpentry', time: 45,
  inputs: [{ item: 'plank' }, { item: 'leather_strips', count: 2 }, { item: 'nails', uses: 0.06 }, { item: '#saw', keep: true }, { item: '#hammer', keep: true }, { item: '#knife', keep: true }],
  outputs: [{ item: 'peg_leg' }], anim: 'saw', skill: ['carpentry', 2], xp: ['carpentry', 20],
  desc: 'Turn a post, hollow a cup, rivet straps. For a lost foot or lower leg.',
});
defRecipe({
  key: 'make_hook_hand', name: 'Forge Hook Hand', category: 'survival', time: 45,
  inputs: [{ item: 'scrap_metal', count: 2 }, { item: 'leather_strips', count: 2 }, { item: '#hammer', keep: true }, { item: '#wrench', keep: true }],
  outputs: [{ item: 'hook_hand' }], anim: 'hammer', needs: ['fire'], skill: ['mechanics', 2], xp: ['mechanics', 20],
  desc: 'Heat the bar, bend it round, beat a point on it; lace a cuff to fit the stump.',
});

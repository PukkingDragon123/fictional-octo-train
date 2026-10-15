// Recipes — MIND: journaling (a coping action with real effects, see
// mindSystem.ts onCrafted 'journal_entry'), repairing the wrist monitor and
// a few small comforts you can make yourself.
import { defRecipe } from '../../items/recipes';

defRecipe({
  key: 'journal_entry', name: 'Write in Journal', category: 'misc', time: 14,
  inputs: [{ item: 'notebook', uses: 0.05 }, { item: '#pen', keep: true }], outputs: [],
  needs: ['light'], anim: 'craft',
  desc: 'Write down what happened and how it felt. Eases stress, anxiety, low mood, loneliness and bad memories. Works best once or twice a day.',
});
defRecipe({
  key: 'repair_wrist_monitor', name: 'Repair Wrist Monitor', category: 'electrical', time: 18,
  inputs: [{ item: 'wrist_monitor', keep: true }, { item: '#screwdriver', keep: true }, { item: 'electronics_scrap' }],
  outputs: [{ item: 'wrist_monitor' }], xp: ['electrical', 6], anim: 'craft',
  desc: 'Open the case, dry the board, reseat the display. Take the monitor off first.',
});
defRecipe({
  key: 'make_nightlight', name: 'Make Night-Light', category: 'electrical', time: 16,
  inputs: [{ item: 'lightbulb' }, { item: 'battery' }, { item: '#tape', uses: 0.1 }], outputs: [{ item: 'nightlight' }],
  skill: ['electrical', 1], xp: ['electrical', 5], anim: 'craft',
  desc: 'A bulb, a battery and tape. Enough light to sleep by.',
});
defRecipe({
  key: 'make_worry_stone', name: 'Polish a Worry Stone', category: 'misc', time: 20,
  inputs: [{ item: 'stone' }, { item: 'rag', keep: true }], outputs: [{ item: 'worry_stone' }], anim: 'craft',
  desc: 'Rub a flat stone smooth until your thumb has a place to rest.',
});
defRecipe({
  key: 'listen_music', name: 'Listen to Music', category: 'misc', time: 25,
  inputs: [{ item: '#music', keep: true }], outputs: [], anim: 'craft',
  desc: 'Put something on and just listen for a while. Eases stress and low mood, takes the edge off loneliness. Uses a little battery.',
});

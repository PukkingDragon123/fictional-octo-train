// Items the world systems create: carried furniture.
import { defItem } from '../../items/item';

defItem({
  key: 'furniture', name: 'Furniture', cat: 'misc', weight: 10, heavy: true, noStack: true,
  tags: ['furniture', 'heavy'],
  desc: 'Heavy and awkward. Carried in both arms; place it somewhere with the item menu.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.5, 0.45, 0.4, 'wood_crate');
  },
});

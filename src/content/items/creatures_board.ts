// What the Board's toy-box natives leave behind (round 16: Flagfall, the Boxwood
// Pawns, the Folding Board; src/creatures/species/chess_toys.ts): the felt from
// under a piece, the lead slug in its foot, dense turned boxwood, and their
// corpse loot tables (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { T, tex, ph } from './_kit';

const BAIZE = tex('i_baize', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 7) < 0.2 ? 0x24502c : ph(x, y, 9) < 0.15 ? 0x3e7a48 : 0x2e6238)), true);
const BOXWOOD = tex('i_boxwood', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, (y + (ph(x, 0, 5) < 0.4 ? 1 : 0)) % 3 === 0 ? 0xb8884e : ph(x, y, 4) < 0.12 ? 0xe8c890 : 0xd6a868)), true);
const LEAD = tex('i_lead', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 3) < 0.18 ? 0x8a8e94 : ph(x, y, 6) < 0.1 ? 0x4a4c52 : 0x6a6e74)), true);

defItem({
  key: 'baize_felt', name: 'Green Baize', cat: 'material', weight: 0.03, value: 3, burn: 0.1, tags: ['cloth', 'fabric', 'rag'],
  desc: 'A disc of green felt from under a chess piece, the glue still tacky on one side. It smells of the cupboard under the stairs.',
  model: (mb) => mb.cylinder(0, 0, 0, 0.045, 0.004, 10, { sides: BAIZE, top: BAIZE, bottom: T.white }, { fit: true }),
});
defItem({
  key: 'lead_weight', name: 'Piece Weight', cat: 'material', weight: 0.25, value: 4, tags: ['metal', 'lead', 'weight'],
  desc: 'The lead slug poured into the foot of a wooden pawn so it stands up when it is knocked. Heavy for its size. Sinkers, ballast, a sling stone.',
  model: (mb) => mb.cylinder(0, 0, 0, 0.022, 0.03, 8, { sides: LEAD, top: LEAD, bottom: LEAD }, { fit: true }),
});
defItem({
  key: 'boxwood_chunk', name: 'Boxwood', cat: 'material', weight: 0.4, value: 6, burn: 0.9, tags: ['wood', 'fuel', 'carving'],
  desc: 'A turned chunk of a living piece: close-grained, yellow, heavy as horn. Still warm. It burns slow and hot, and it carves like soap.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.03, 0.05, 8, { sides: BOXWOOD, top: BOXWOOD, bottom: BOXWOOD }, { fit: true });
    mb.cylinder(0, 0.05, 0, 0.022, 0.03, 8, { sides: BOXWOOD, top: BOXWOOD, bottom: BOXWOOD }, { fit: true });
  },
});

// ---------------------------------------------------------------- corpse loot
defLoot('creature_chess_clock', [2, 4], [['spring', 5], ['gear', 4], ['scrap_metal', 2], ['plank', 1]], 0);
defLoot('creature_chess_pawn', [1, 3], [['boxwood_chunk', 5], ['lead_weight', 3], ['baize_felt', 3]], 0);
// the Stalker (src/creatures/species/stalker.ts): stretched skin your colour, a lengthened finger bone
defLoot('creature_stalker', [1, 3], [['strider_skin', 3], ['long_bone', 3], ['bone', 2]], 0);
defLoot('creature_chess_case', [2, 4], [['baize_felt', 5], ['plank', 2], ['boxwood_chunk', 2], ['scrap_metal', 1]], 0);

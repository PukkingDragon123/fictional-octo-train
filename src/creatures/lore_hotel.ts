// The Halcyon's inhabitant (src/world/gen/z_hotel.ts, src/creatures/species/unclaimed.ts).
// Field codex entry (src/creatures/lore.ts spreads it into INHABITANTS). Data only.
import type { InhabitantLore } from './lore';

export const HOTEL_INHABITANTS: InhabitantLore[] = [
  {
    id: 'unclaimed', name: 'The Unclaimed', rank: 'greed', class: 'Mimic', danger: 6,
    summary: 'A teetering tower of old luggage carried on six long jointed legs: a steamer trunk at the bottom whose lid is a mouth, a suitcase, a carpet bag, a vanity case and a hatbox on top with a brass service bell on its lid, every case strapped to the next, luggage tags fluttering. One long arm in three joints ends in a brass luggage hook.',
    biology: 'Not a collector of luggage but luggage grown into an animal, or an animal that has grown into the shape of what it keeps. The cases are its body segments, each a hollow of leather and silk lining over a soft wall that breathes; the straps are tendons. The bottom trunk holds the gut and a wound coil of brass-coloured gristle that ticks steadily, the organ the Institute calls the ticker. Its legs are thin and sinewy, knees high like a harvestman\'s, and they carry the stack swaying: the whole tower whips and sways when it starts, stops and turns. The arm folds flat against the stack and reaches more than two metres.',
    behaviour: 'It walks the corridor ring of the third floor in one direction, the way a clock goes, and rings the bell on its hatbox at every corner: you can always hear where it is. It sees a long way down a straight corridor and charges anything it sees there, fast on the straight, but it cannot take a corner at speed: the stack swings out and it has to stop and brace. It is too tall for the room doors and never comes in. If it saw or heard a unit go into a room, it goes to that door and knocks three times, and then the arm comes in through the doorway and hooks whatever is within reach of it. It waits at the door a while, rattling the handle, and goes back to its round.',
    habitat: 'The Halcyon, third floor: the corridor ring, never the rooms.',
    lore: 'The card on every pillow: "Housekeeping will knock three times. It is not necessary to answer." The night porter\'s book: "Corners. Always make for a corner." Dr. Calder: "It is keeping everybody\'s luggage for them. It will keep yours. Stay off the carpet when you hear the bell, and when it knocks, go and sit in the bath." Rank GREED: a keeper. Learn the door and it is a nuisance; meet it on a straight and it is a killer.',
    harvest: [
      { item: 'unc_ticker', how: 'Cut the ticking organ out of the bottom trunk. R&D pays a great deal for it.' },
      { item: 'unc_hook', how: 'Unscrew the brass hook from the end of its arm.' },
      { item: 'unc_tag', how: 'Tear the luggage tags off its cases. Read the names.' },
      { item: 'unc_strap', how: 'Cut the straps that hold it together.' },
      { item: 'unc_lining', how: 'Peel the silk lining out of the cases.' },
    ],
  },
];

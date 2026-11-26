// Lore: the Halcyon, third floor (src/world/gen/z_hotel.ts).
import { defLore } from '../loreRegistry';

defLore({
  id: 'ht_card', title: 'Card on the pillow',
  text: `THE HALCYON
Welcome to the third floor.

Housekeeping will call once a day. If you would rather not be disturbed, simply stay inside your room and away from the door. Housekeeping will knock three times. It is not necessary to answer.

Ice is available at the end of every corridor. The corridor has no end.

We hope you enjoy your stay.`,
  codex: ['unclaimed'],
});

defLore({
  id: 'ht_porter', title: 'Night porter\'s book (front desk)',
  text: `01:10 Bell at the north corner. Then the east corner. Then the south. It goes round the way the clock goes, always. You can set your watch by it.
02:40 Guest in 318 rang down. Said someone knocked three times and then put an arm in under the chain. I told her stay in the bathroom. She did. She is fine.
03:05 It cannot come into the rooms. Too tall for the doors, all those cases. It just reaches.
03:30 If it sees you in the corridor it comes fast, but it cannot take a corner. The cases swing out and it has to stop. Corners. Always make for a corner.
04:00 Took a trolley down to the linen room press. Paid off two weeks. Calder says keep doing it.
04:01 Bell at the north corner.`,
  codex: ['unclaimed'],
});

defLore({
  id: 'ht_linen', title: 'Housekeeping notice (linen room)',
  text: `STAFF ONLY

The press in here takes everything: trolleys, carts, the chandelier if you can get it down. Brass and silver are worth the most. Do NOT feed it the luggage carts while the luggage is still strapped on. It does not like that. Neither does the luggage.

Lost property is kept by the Unclaimed. Do not ask it for anything back.`,
  codex: ['unclaimed'],
});

defLore({
  id: 'ht_bill', title: 'Room service bill',
  text: `ROOM 311
1 x Club sandwich
1 x Pot of tea for two
1 x Something for the porter

Signed: (a unit's name, in your handwriting)`,
});

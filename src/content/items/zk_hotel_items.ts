// What the Halcyon and its inhabitant leave behind (src/world/gen/z_hotel.ts,
// src/creatures/lore_hotel.ts harvest list): brass room keys on red tassels,
// silver cloches, the desk bell, bagged ice, the little soaps; the Unclaimed's
// luggage tags, straps, brass hook and the warm thing that ticks in its bottom
// trunk; the floor's loot tables and the corpse table (`creature_unclaimed`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, rp, ph, type MB } from './_kit';
import { blob } from '../../creatures/kit/anomalies';

const S_BRASS = tex('i_ht_brass', 8, 8, (pc) => { const R = rp(0xc8a050, 5, 0.5); pc.each((x, y) => pc.set(x, y, R[2 + (y < 2 ? 1 : 0) - (ph(x, y, 9951) < 0.2 ? 1 : 0)])); pc.set(2, 1, 0xfff0c0); }, true);
const S_TASSEL = tex('i_ht_tassel', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, x % 2 ? 0x9a2a2e : 0xc8403a)); }, true);
const S_SILVER = tex('i_ht_silver', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, Math.hypot(x - 2.5, y - 2) < 1.6 ? 0xffffff : y < 4 ? 0xd8dce0 : 0x9aa0a8)); }, true);
const S_ICE = tex('i_ht_ice', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 9952) < 0.3 ? 0xffffff : (x + y) % 3 ? 0xd8eef8 : 0xb0d0e0)); }, true);
const S_SOAP = tex('i_ht_soap', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y === 0 || y === 7 ? 0xc8b8a0 : 0xf4ecd8)); pc.set(3, 3, 0xd8a640); pc.set(4, 3, 0xd8a640); pc.set(3, 4, 0xd8a640); pc.set(4, 4, 0xd8a640); }, true);
const S_TAG = tex('i_ht_tag', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y < 2 ? 0x6a4a2a : ph(x, y, 9953) < 0.2 ? 0x3a3a3a : 0xe8dcc0)); pc.set(1, 0, 0xc8a050); }, true);
const S_STRAP = tex('i_ht_strap', 8, 8, (pc) => { const R = rp(0x6a3a22, 5, 0.5); pc.each((x, y) => pc.set(x, y, y === 0 || y === 7 ? R[0] : x % 4 === 0 ? R[1] : R[3])); }, true);
const S_LINING = tex('i_ht_lining', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y) % 4 === 0 ? 0x5a1a2a : 0x8a2a3a)); }, true);
const S_TICK = tex('i_ht_tick', 8, 8, (pc) => { pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); pc.set(x, y, d < 1.2 ? 0x2a1a10 : d < 3 ? (Math.floor(Math.atan2(y - 3.5, x - 3.5) * 2) % 2 ? 0xd8a640 : 0x9a6a2a) : 0xb88a7a); }); }, true);

// ---- the hotel
defItem({
  key: 'ht_room_key', name: 'Halcyon Room Key', cat: 'misc', weight: 0.06, value: 18, tags: ['brass', 'hotel', 'antique'],
  desc: 'A heavy brass key on a red tassel, a brass fob stamped 311. It opens every door on the third floor. None of them are 311.',
  model: (mb: MB) => {
    mb.box(0, 0.004, 0, 0.07, 0.008, 0.012, S_BRASS);
    mb.cylinder(-0.045, 0, 0, 0.016, 0.008, 8, S_BRASS);
    mb.box(0.04, 0.004, 0.006, 0.014, 0.008, 0.012, S_BRASS);
    mb.box(-0.075, 0.004, 0, 0.03, 0.008, 0.01, S_TASSEL);
  },
});
defItem({
  key: 'ht_cloche', name: 'Silver Cloche', cat: 'misc', weight: 0.7, value: 55, tags: ['silver', 'hotel', 'antique', 'shiny'],
  desc: 'A domed silver plate cover with a ball handle, polished so well you can see the corridor in it, and yourself, and somebody standing behind you.',
  model: (mb: MB) => { mb.cylinder(0, 0, 0, 0.12, 0.01, 12, S_SILVER); blob(mb, [0, 0.01, 0], [0.11, 0.07, 0.11], 12, 6, S_SILVER); mb.sphere(0, 0.085, 0, 0.012, 6, 4, S_SILVER); },
});
defItem({
  key: 'ht_bell', name: 'Service Bell', cat: 'misc', weight: 0.3, value: 34, tags: ['brass', 'hotel', 'antique', 'lure'],
  desc: 'A brass desk bell with a black base. Strike it and it rings clear down the whole corridor, and something on the floor stops what it is doing to listen.',
  model: (mb: MB) => { mb.cylinder(0, 0, 0, 0.04, 0.012, 10, 'plastic_black'); blob(mb, [0, 0.012, 0], [0.034, 0.026, 0.034], 10, 5, S_BRASS); mb.cylinder(0, 0.036, 0, 0.004, 0.012, 5, S_BRASS); },
});
defItem({
  key: 'ht_ice_bag', name: 'Bag of Ice', cat: 'drink', weight: 1.2, value: 2, tags: ['hotel', 'cold', 'water'],
  food: { hunger: 0, thirst: 22, calories: 0, frozenOk: true },
  desc: 'A plastic bag of clear ice from the machine down the hall. It melts slowly. Too slowly. It tastes of nothing at all.',
  model: (mb: MB) => { blob(mb, [0, 0.04, 0], [0.08, 0.04, 0.06], 9, 5, S_ICE); },
});
defItem({
  key: 'ht_soap', name: 'Hotel Soap', cat: 'misc', weight: 0.03, value: 3, tags: ['hotel', 'hygiene', 'soap'],
  desc: 'A little wrapped bar of soap with a gold H pressed into it, the wrapping still crisp. It smells of a room you stayed in once.',
  model: (mb: MB) => { mb.box(0, 0, 0, 0.05, 0.016, 0.035, S_SOAP); },
});

// ---- the Unclaimed (src/creatures/species/unclaimed.ts)
defItem({
  key: 'unc_tag', name: 'Luggage Tag', cat: 'material', weight: 0.02, value: 38, tags: ['research', 'paper', 'hotel', 'weird'],
  desc: 'A card luggage tag on a brass eyelet, torn from one of the Unclaimed\'s cases. The name on it is a unit\'s name. The check-in date is tomorrow.',
  model: (mb: MB) => { mb.box(0, 0.002, 0, 0.07, 0.004, 0.035, S_TAG); },
});
defItem({
  key: 'unc_strap', name: 'Trunk Strap', cat: 'material', weight: 0.35, value: 9, tags: ['leather', 'strap', 'hotel', 'weird'],
  desc: 'A long leather luggage strap with a brass buckle, warm and faintly damp, like something that has been holding on very hard. Good leather. It makes a fine sling, binding or belt.',
  model: (mb: MB) => { mb.box(0, 0.003, 0, 0.3, 0.006, 0.03, S_STRAP); mb.box(0.13, 0.006, 0, 0.03, 0.01, 0.04, S_BRASS); },
});
defItem({
  key: 'unc_hook', name: 'Porter\'s Hook', cat: 'material', weight: 0.9, value: 42, tags: ['brass', 'sharp', 'hotel', 'weird', 'metal'],
  desc: 'The brass luggage hook the Unclaimed reaches through doors with: three curved prongs, polished bright on the inside of the curve. Somewhere a bench could make it into something nasty.',
  model: (mb: MB) => { for (const z of [-0.025, 0, 0.025]) mb.box(0.02, 0.006, z, 0.16, 0.012, 0.012, S_BRASS); mb.box(-0.08, 0.008, 0, 0.06, 0.016, 0.05, S_BRASS); },
});
defItem({
  key: 'unc_lining', name: 'Trunk Lining', cat: 'material', weight: 0.2, value: 12, tags: ['fabric', 'cloth', 'silk', 'hotel', 'weird'],
  desc: 'A sheet of claret silk lining peeled from inside one of its cases. On the reverse, in the weave, a pattern like the corridor carpet, repeating, going round.',
  model: (mb: MB) => { mb.box(0, 0.003, 0, 0.22, 0.006, 0.16, S_LINING); },
});
defItem({
  key: 'unc_ticker', name: 'Ticking Organ', cat: 'material', weight: 0.8, value: 160, rare: true, tags: ['research', 'specimen', 'hotel', 'weird', 'organic'],
  desc: 'Cut from the bottom trunk of an Unclaimed: a fist of brass-coloured gristle wound round itself like a mainspring. It ticks. It is keeping time for a checkout that never comes. Meridian R&D will pay very well for it.',
  model: (mb: MB) => { blob(mb, [0, 0.04, 0], [0.05, 0.04, 0.045], 10, 6, S_TICK, { disp: (d) => 1 + 0.12 * Math.sin(Math.atan2(d[2], d[0]) * 5 + d[1] * 30) }); },
});

// ---- the floor's loot
defLoot('ht_floor', [1, 1], [['ht_room_key', 4], ['coins', 5], ['newspaper', 3], ['ht_soap', 3], ['note', 1.5], ['umbrella', 1], ['glasses', 0.8], ['wallet', 1], ['keyring', 1], ['photo_old', 0.8], ['matches', 1], ['ht_bell', 0.4], ['unc_tag', 0.6]], 0.3);
defLoot('ht_room', [1, 3], [['wallet', 2], ['cash_roll', 1.2], ['gold_watch', 0.6], ['wedding_ring', 0.6], ['pearl_necklace', 0.3], ['ht_soap', 3], ['toothbrush', 2], ['soap', 1], ['newspaper', 2], ['umbrella', 1], ['glasses', 1], ['photo_old', 1], ['tape_cassette', 0.8], ['whiskey', 0.6], ['wine', 0.6], ['ht_room_key', 2], ['lighter', 1]], 0.25);
defLoot('ht_cart', [1, 3], [['ht_cloche', 2], ['silverware_set', 1.2], ['wine', 1.5], ['water_bottle', 2], ['crystal_decanter', 0.5], ['silver_candlestick', 0.4], ['cloth', 2]], 0.2);
defLoot('ht_tray', [1, 1], [['ht_cloche', 1.5], ['silverware_set', 0.6], ['cloth', 2], ['note', 1], ['coins', 2]], 0.4);
defLoot('ht_luggage', [2, 4], [['cameo_brooch', 0.6], ['jewellery_box', 0.6], ['gold_chain', 0.5], ['pocket_watch', 0.6], ['camcorder', 0.3], ['film_reel', 0.4], ['scarf', 2], ['umbrella', 1.5], ['photo_old', 2], ['unc_tag', 1.2], ['wallet', 1.5], ['stamp_album', 0.5]], 0.1);
defLoot('ht_ice', [1, 3], [['ht_ice_bag', 6], ['water_bottle', 1]], 0.2);
defLoot('ht_linen', [1, 3], [['cloth', 5], ['blanket', 2], ['ht_soap', 3], ['rag_dirty', 1], ['bandage', 0.8]], 0.25);
defLoot('ht_laundry', [1, 2], [['cloth', 4], ['scarf', 1.5], ['rag_dirty', 2], ['coins', 2], ['wallet', 0.6], ['wedding_ring', 0.3], ['unc_tag', 0.5]], 0.3);
defLoot('ht_keys', [1, 3], [['ht_room_key', 8], ['keyring', 1.5]], 0.1);
defLoot('ht_hose', [0, 1], [['rope', 2], ['duct_tape', 1], ['flashlight', 1], ['battery', 1.5]], 0.5);
defLoot('ht_staff', [1, 3], [['flashlight', 2], ['battery', 3], ['fuse', 2], ['screwdriver', 1], ['wrench', 0.8], ['first_aid_kit', 0.6], ['ht_room_key', 3], ['note', 1], ['coins', 2]], 0.15);

// ---- corpse
defLoot('creature_unclaimed', [4, 6], [['unc_strap', 5], ['unc_tag', 4], ['unc_lining', 3], ['unc_hook', 1.5], ['unc_ticker', 1.2], ['ht_room_key', 2], ['jewellery_box', 0.5]], 0);

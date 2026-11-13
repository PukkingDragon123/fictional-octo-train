// What Westgate Station and its inhabitants leave behind (src/world/gen/z_subway.ts,
// src/creatures/lore_subway.ts harvest lists): brass tokens, the Worm Train's flesh,
// shell and dead window-eyes, its egg jelly and larvae, the Token Whelk, the Stile
// Mantis and the Ringer; the station's loot tables and the corpse tables
// (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, rp, ph, type MB } from './_kit';
import { blob, tube } from '../../creatures/kit/anomalies';

const S_BRASS = tex('i_su_brass', 8, 8, (pc) => { const R = rp(0xc89a40, 5, 0.5); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 9901) < 0.25 ? 1 : 0) - (Math.hypot(x - 3.5, y - 3.5) > 3.2 ? 1 : 0)])); pc.set(3, 3, 0x3a2a10); pc.set(4, 3, 0x3a2a10); pc.set(3, 4, 0x3a2a10); pc.set(2, 2, 0xfff0b0); }, true);
const S_FLESH = tex('i_su_flesh', 8, 8, (pc) => { const R = rp(0xb86a5a, 5, 0.6); pc.each((x, y) => pc.set(x, y, ph(x, y, 9902) < 0.12 ? 0xf0d8c8 : R[2 + (ph(x >> 1, y, 9903) < 0.3 ? 1 : 0) - (y % 3 === 0 ? 1 : 0)])); }, true);
const S_SHELL = tex('i_su_shell', 8, 8, (pc) => { const R = rp(0x6a7068, 5, 0.5); pc.each((x, y) => pc.set(x, y, x % 4 === 0 ? R[0] : y === 1 ? 0xd0d4c8 : R[2 + (ph(x, y, 9904) < 0.25 ? 1 : 0)])); pc.set(2, 5, 0x2f8a86); pc.set(3, 5, 0x2f8a86); }, true);
const S_EYE = tex('i_su_eye', 8, 8, (pc) => { pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); pc.set(x, y, d < 1.4 ? 0x1a2a2a : d < 3 ? 0x6a9a90 : 0x3a4a44); }); pc.set(2, 2, 0xffffff); }, true);
const S_SPINE = tex('i_su_spine', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y % 2 ? 0x2a2a28 : 0x5a5650)); pc.set(3, 0, 0xe0e0d8); }, true);
const S_JELLY = tex('i_su_jelly', 8, 8, (pc) => { const R = rp(0xd8e0a8, 5, 0.4); pc.each((x, y) => pc.set(x, y, ph(x, y, 9905) < 0.15 ? 0xffffff : R[2 + (ph(x, y, 9906) < 0.3 ? 1 : 0)])); pc.set(4, 4, 0x8a6a3a); }, true);
const S_LARVA = tex('i_su_larva', 8, 8, (pc) => { const R = rp(0xe8c8b0, 5, 0.5); pc.each((x, y) => pc.set(x, y, x % 3 === 0 ? R[1] : R[3])); pc.set(1, 3, 0x2a3a3a); }, true);
const S_WHELK = tex('i_su_whelk', 8, 8, (pc) => { const R = rp(0xd8c0a0, 5, 0.5); pc.each((x, y) => pc.set(x, y, ph(x, y, 9907) < 0.2 ? 0xf8ecd8 : R[2 + (ph(x >> 1, y, 9908) < 0.3 ? 1 : 0)])); }, true);
const S_OPER = tex('i_su_oper', 8, 8, (pc) => { pc.each((x, y) => { const a = Math.atan2(y - 3.5, x - 3.5), d = Math.hypot(x - 3.5, y - 3.5); pc.set(x, y, Math.sin(d * 2.2 + a) > 0.3 ? 0x6a3a1a : 0x9a6a3a); }); }, true);
const S_CHITIN = tex('i_su_chitin', 8, 8, (pc) => { const R = rp(0x9ab098, 5, 0.5); pc.each((x, y) => pc.set(x, y, y === 0 ? 0xe8f0e0 : R[2 + (ph(x, y, 9909) < 0.25 ? 1 : 0) - (x === 7 ? 1 : 0)])); }, true);
const S_CORD = tex('i_su_cord', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y) % 3 === 0 ? 0x101010 : 0x2a2a2c)); }, true);
const S_BELL = tex('i_su_bell', 8, 8, (pc) => { const R = rp(0xc8b8a0, 5, 0.5); pc.each((x, y) => pc.set(x, y, R[2 + (y < 3 ? 1 : 0) - (ph(x, y, 9910) < 0.2 ? 1 : 0)])); }, true);

// ---- the station
defItem({
  key: 'brass_token', name: 'Subway Token', cat: 'misc', weight: 0.004, value: 3, tags: ['token', 'subway', 'currency'],
  desc: 'A brass transit token with a Y cut out of the middle: WESTGATE INNER LOOP, GOOD FOR ONE FARE. The turnstiles take them. So does something in the turnstile line that is not a turnstile.',
  model: (mb: MB) => { mb.cylinder(0, 0, 0, 0.012, 0.002, 10, S_BRASS, { caps: true } as any); },
});

// ---- the Worm Train (src/creatures/species/worm_train.ts)
defItem({
  key: 'wt_flesh', name: 'Worm Train Flesh', cat: 'food', weight: 0.6, value: 8, tags: ['meat', 'subway'],
  food: { hunger: 22, calories: 640, raw: true, cookable: true, cookMins: 18, poison: 0.25, unhappy: 10, fresh: 1, rot: 2.5, ingredient: 'meat', cookedName: 'Seared Worm Flesh' },
  desc: 'A slab of pale, ringed muscle cut from between two car-shell plates. It smells of brake dust and wet pennies. Cooked, it is chewy and sweet, like crab.',
  model: (mb: MB) => { blob(mb, [0, 0.025, 0], [0.07, 0.025, 0.05], 9, 5, S_FLESH, { disp: (d) => 1 + 0.1 * Math.sin(d[0] * 14) }); },
});
defItem({
  key: 'wt_shell', name: 'Car-Shell Plate', cat: 'material', weight: 1.4, value: 22, tags: ['armor_plate', 'chitin', 'subway', 'weird'],
  desc: 'A curved plate of the Worm Train\'s shell: horn the colour of a dirty train, ribbed like fluted steel, with a teal stripe it grew itself. It turns a knife. It would turn a lot more strapped to a forearm.',
  model: (mb: MB) => { mb.box(0, 0.01, 0, 0.26, 0.02, 0.18, S_SHELL); mb.box(0, 0.025, 0.05, 0.26, 0.012, 0.03, S_SHELL, { color: 0x2f8a86 }); },
});
defItem({
  key: 'wt_eye', name: 'Window Eye', cat: 'material', weight: 0.3, value: 40, tags: ['research', 'weird', 'subway', 'glass'],
  desc: 'One of the dead window-eyes from a Worm Train\'s flank: a pane of clouded lens in a rubbery lid. Look through it and the room is lit like a carriage at night, and there are people sitting in it who are not there.',
  model: (mb: MB) => { mb.box(0, 0.006, 0, 0.16, 0.012, 0.11, S_EYE); mb.box(0, 0.014, 0, 0.13, 0.004, 0.08, 'glass', { color: 0xa8c8c0 }); },
});
defItem({
  key: 'wt_spine', name: 'Pantograph Spine', cat: 'material', weight: 0.5, value: 14, tags: ['sharp', 'conductive', 'subway', 'weird'],
  desc: 'A jointed spine from a Worm Train\'s back, folded like the arm that touched the overhead wire. The tip is scorched. It still makes a hair stand up when you bring it near.',
  model: (mb: MB) => { tube(mb, [[-0.12, 0.01, 0], [0, 0.04, 0.02], [0.12, 0.012, 0]], (t) => 0.012 * (1 - t * 0.6), 5, S_SPINE); },
});
defItem({
  key: 'wt_egg_jelly', name: 'Egg Jelly', cat: 'food', weight: 0.3, value: 18, tags: ['jelly', 'subway', 'weird', 'research'],
  food: { hunger: 10, thirst: 14, calories: 260, raw: true, poison: 0.1, unhappy: 14, fresh: 1, rot: 1.5 },
  desc: 'A double handful of the clear yolk from a Worm Train egg sac. It is faintly warm and it hums against your palm the way a rail hums before the train. The lab pays for it. It is also, technically, food.',
  model: (mb: MB) => { blob(mb, [0, 0.03, 0], [0.05, 0.03, 0.05], 10, 6, S_JELLY); },
});
defItem({
  key: 'wt_larva', name: 'Curled Larva', cat: 'material', weight: 0.9, value: 55, tags: ['research', 'specimen', 'subway', 'weird'],
  desc: 'A Worm Train larva cut out of its sac before it could hatch: a curled thing the length of your forearm, three soft car-segments and a blind headlamp, with its legs folded like a sleeping beetle. The Institute wants these more than anything else down there.',
  model: (mb: MB) => {
    const p: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 1.4; p.push([Math.cos(a) * 0.06, 0.025, Math.sin(a) * 0.06]); }
    tube(mb, p, (t) => 0.024 * (1 - t * 0.4), 7, S_LARVA);
  },
});

// ---- the Token Whelk (src/creatures/species/su_natives.ts)
defItem({
  key: 'whelk_meat', name: 'Whelk Foot', cat: 'food', weight: 0.8, value: 9, tags: ['meat', 'subway'],
  food: { hunger: 24, calories: 520, raw: true, cookable: true, cookMins: 16, poison: 0.2, unhappy: 6, fresh: 1, rot: 2.5, ingredient: 'meat', cookedName: 'Boiled Whelk' },
  desc: 'A wedge of the Token Whelk\'s foot, cream and rubbery. Boiled long enough it is a fine thing to eat, and it tastes faintly of brass.',
  model: (mb: MB) => { blob(mb, [0, 0.03, 0], [0.07, 0.03, 0.045], 9, 5, S_WHELK); },
});
defItem({
  key: 'whelk_operculum', name: 'Whelk Operculum', cat: 'misc', weight: 0.05, value: 30, tags: ['token', 'subway', 'weird'],
  desc: 'The horny door a Token Whelk closes its shell with: a brown disc with a growth spiral, exactly the size of a subway token. The turnstiles accept it. They seem to prefer it.',
  model: (mb: MB) => { mb.cylinder(0, 0, 0, 0.03, 0.004, 12, S_OPER, { caps: true } as any); },
});

// ---- the Stile Mantis
defItem({
  key: 'mantis_blade', name: 'Stile Mantis Arm', cat: 'material', weight: 0.4, value: 16, tags: ['sharp', 'chitin', 'subway'],
  desc: 'One of the three raptorial arms of a Stile Mantis, the shape and polish of a chrome turnstile bar, lined underneath with a comb of hooked spines. It still folds when you pinch the joint.',
  model: (mb: MB) => { tube(mb, [[-0.14, 0.012, 0], [0.04, 0.016, 0], [0.13, 0.014, 0.03]], (t) => 0.014 * (1 - t * 0.5), 6, S_CHITIN); },
});
defItem({
  key: 'mantis_chitin', name: 'Brushed Chitin', cat: 'material', weight: 0.3, value: 10, tags: ['chitin', 'armor_plate', 'subway'],
  desc: 'A flat panel of mantis chitin with a grain like brushed steel. Hold it at arm\'s length and you would swear it was a piece of a machine.',
  model: (mb: MB) => { mb.box(0, 0.006, 0, 0.18, 0.012, 0.12, S_CHITIN); },
});

// ---- the Ringer
defItem({
  key: 'ringer_cord', name: 'Coiled Cord', cat: 'material', weight: 0.3, value: 12, tags: ['rope', 'fiber', 'subway', 'weird'],
  desc: 'The Ringer\'s neck, or a length of it: a black, springy coil of cartilage that stretches to four times its length and snaps back. It makes a good snare. It makes an excellent bungee.',
  model: (mb: MB) => {
    const p: [number, number, number][] = [];
    for (let i = 0; i <= 28; i++) { const a = i * 0.9; p.push([-0.1 + i * 0.007, 0.02 + Math.sin(a) * 0.012, Math.cos(a) * 0.012]); }
    tube(mb, p, 0.004, 4, S_CORD);
  },
});
defItem({
  key: 'ringer_bell', name: 'Bell Organ', cat: 'material', weight: 0.25, value: 26, tags: ['lure', 'research', 'subway', 'weird'],
  desc: 'The double bell-chamber out of a Ringer\'s throat. Flick it and it rings like a telephone in an empty house, and anything listening in the tunnels turns its head.',
  model: (mb: MB) => { for (const x of [-0.025, 0.025]) blob(mb, [x, 0.03, 0], [0.025, 0.03, 0.025], 8, 5, S_BELL); },
});

// ---- the station's loot
defLoot('su_floor', [1, 1], [['brass_token', 8], ['newspaper', 5], ['paper', 4], ['coins', 5], ['soda_can_empty', 4], ['empty_bottle', 2], ['wallet', 1], ['keyring', 1], ['umbrella', 1.2], ['note', 1.5], ['photo_old', 0.8], ['candy_bar', 1], ['glasses', 0.5], ['tape_cassette', 1.2], ['cassette_player', 0.3]], 0.3);
defLoot('su_track_junk', [1, 1], [['scrap_metal', 5], ['brass_token', 4], ['coins', 3], ['battery', 2], ['glass_shard', 2], ['bone', 2], ['rag_dirty', 2], ['wt_shell', 1.2], ['umbrella', 0.5]], 0.25);
defLoot('su_train', [1, 2], [['newspaper', 6], ['umbrella', 3], ['wallet', 2], ['brass_token', 4], ['candy_bar', 2], ['soda_can', 2], ['glasses', 1], ['keyring', 1.5], ['photo_old', 1], ['tape_cassette', 2], ['cassette_player', 0.6]], 0.2);
defLoot('su_staff', [1, 3], [['flashlight', 3], ['battery', 4], ['fuse', 3], ['wrench', 1.5], ['brass_token', 5], ['first_aid_kit', 1], ['note', 1], ['coins', 2]], 0.15);

// ---- corpses
defLoot('creature_worm_train', [5, 8], [['wt_flesh', 6], ['wt_shell', 5], ['wt_eye', 2], ['wt_spine', 3]], 0);
defLoot('creature_worm_larva', [1, 2], [['wt_flesh', 4], ['wt_shell', 2], ['wt_spine', 0.6]], 0);
defLoot('creature_worm_egg', [1, 3], [['wt_egg_jelly', 5], ['wt_larva', 2]], 0);
defLoot('creature_token_whelk', [3, 5], [['whelk_meat', 5], ['whelk_operculum', 2], ['brass_token', 6], ['coins', 4]], 0);
defLoot('creature_stile_mantis', [1, 3], [['mantis_blade', 4], ['mantis_chitin', 4], ['brass_token', 3]], 0);
defLoot('creature_ringer', [1, 2], [['ringer_cord', 4], ['ringer_bell', 2], ['meat_raw', 2]], 0);

// What the Plunge and its inhabitants leave behind (src/world/gen/z_plunge.ts,
// src/creatures/lore_pool.ts harvest lists): the Gulper's hide, meat and tooth rows,
// tadpoles, frog legs and piranha jaws, the balloon puffer's latex, eyes and string;
// the Plunge's loot tables and the corpse tables (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, rp, ph, type MB } from './_kit';
import { blob, tube } from '../../creatures/kit/anomalies';

const S_HIDE = tex('i_pl_hide', 8, 8, (pc) => { const R = rp(0xf0e6de, 5, 0.4); pc.each((x, y) => pc.set(x, y, R[2 + (Math.sin(y * 1.3 + x * 0.4) > 0.5 ? -1 : 0) + (ph(x, y, 9701) < 0.15 ? 1 : 0)])); }, true);
const S_GMEAT = tex('i_pl_gmeat', 8, 8, (pc) => { const R = rp(0xe8b0a8, 5, 0.5); pc.each((x, y) => pc.set(x, y, ph(x, y, 9702) < 0.15 ? 0xf8ece4 : R[2 + (ph(x >> 1, y, 9703) < 0.3 ? 1 : 0)])); }, true);
const S_TEETH = tex('i_pl_teeth', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y < 3 ? (x % 2 ? 0xf8f4e8 : 0xd8d0c0) : 0xe0a0a8)); }, true);
const S_TAD = tex('i_pl_tad', 8, 8, (pc) => { const R = rp(0xeee4dc, 5, 0.4); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 9704) < 0.25 ? 1 : 0)])); pc.set(5, 2, 0xe86a7a); }, true);
const S_FROG = tex('i_pl_frog', 8, 8, (pc) => { const R = rp(0x6a8a5a, 5, 0.5); pc.each((x, y) => pc.set(x, y, ph(x, y, 9705) < 0.2 ? 0x2a3a1a : R[2 + (y < 2 ? 1 : 0)])); }, true);
const S_PJAW = tex('i_pl_pjaw', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y < 3 && x % 2 ? 0xf8f4e8 : y < 3 ? 0x8a2a1a : 0xe85a30)); }, true);
const S_LATEX = tex('i_pl_latex', 8, 8, (pc) => { const R = rp(0xe83a5a, 5, 0.5); pc.each((x, y) => pc.set(x, y, R[2 + (y < 2 ? 2 : 0) - (ph(x, y, 9706) < 0.2 ? 1 : 0)])); }, true);
const S_EYE = tex('i_pl_eye', 8, 8, (pc) => { pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); pc.set(x, y, d < 1.2 ? 0x050505 : d < 2.4 ? 0x4a7ab8 : ph(x, y, 9707) < 0.15 ? 0xc83040 : 0xf4f0ea); }); pc.set(2, 2, 0xffffff); }, true);
const S_STR = tex('i_pl_str', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y) % 3 ? 0xf0ece0 : 0xc8c0b0)); }, true);

// ---- the Gulper (src/creatures/species/pl_pool.ts)
defItem({
  key: 'gulper_hide', name: 'Gulper Hide', cat: 'material', weight: 1.6, value: 30, tags: ['leather', 'hide', 'pool', 'weird'],
  desc: 'A sheet of the Gulper\'s skin: white, loose, wrinkled like the back of an old hand, and slick on one side however long you leave it to dry. It cures into a soft pale leather that water runs off.',
  model: (mb: MB) => { mb.box(0, 0.01, 0, 0.32, 0.02, 0.22, S_HIDE); mb.box(0.04, 0.025, -0.03, 0.2, 0.01, 0.14, S_HIDE, { color: 0xe8dcd4 }); },
});
defItem({
  key: 'gulper_meat', name: 'Gulper Meat', cat: 'food', weight: 0.9, value: 10, tags: ['meat', 'pool'],
  food: { hunger: 28, calories: 720, raw: true, cookable: true, cookMins: 22, poison: 0.25, unhappy: 8, fresh: 1, rot: 2.5, ingredient: 'meat', cookedName: 'Braised Gulper' },
  desc: 'A slab of pale, gelatinous meat from under the Gulper\'s skin. Cooked slowly it goes soft and sweet, somewhere between pork and eel. Old cookbooks in other places say the same of its cousins.',
  model: (mb: MB) => { blob(mb, [0, 0.03, 0], [0.08, 0.03, 0.055], 9, 5, S_GMEAT); },
});
defItem({
  key: 'gulper_tooth', name: 'Gulper Tooth Row', cat: 'material', weight: 0.15, value: 22, tags: ['sharp', 'bone', 'pool', 'research'],
  desc: 'A strip of gum cut from the rim of the Gulper\'s jaw with forty tiny backward teeth set in it like a comb. Nothing it bites gets to pull back out. The lab wants one; it also makes a terrible rasp.',
  model: (mb: MB) => { mb.box(0, 0.006, 0, 0.18, 0.012, 0.025, S_TEETH); for (let i = 0; i < 9; i++) mb.box(-0.08 + i * 0.02, 0.015, 0, 0.006, 0.012, 0.006, 'plastic_white', { color: 0xf8f4e8 }); },
});

// ---- the tadpoles
defItem({
  key: 'tadpole_meat', name: 'Gulper Tadpole', cat: 'food', weight: 0.15, value: 3, tags: ['meat', 'pool', 'small'],
  food: { hunger: 6, calories: 120, raw: true, cookable: true, cookMins: 6, poison: 0.2, unhappy: 12, fresh: 1, rot: 1.5, ingredient: 'meat', cookedName: 'Fried Tadpole' },
  desc: 'A dead Gulper tadpole as long as your hand, mostly head. Fried crisp it is edible. Its little mouth is still open.',
  model: (mb: MB) => { blob(mb, [0.02, 0.02, 0], [0.04, 0.02, 0.035], 8, 5, S_TAD); tube(mb, [[-0.02, 0.015, 0], [-0.07, 0.012, 0.01], [-0.1, 0.01, -0.01]], (t) => 0.012 * (1 - t), 5, S_TAD); },
});

// ---- the frog piranha
defItem({
  key: 'frog_leg', name: 'Frog Piranha Leg', cat: 'food', weight: 0.25, value: 7, tags: ['meat', 'pool'],
  food: { hunger: 12, calories: 260, raw: true, cookable: true, cookMins: 10, poison: 0.15, unhappy: 4, fresh: 1, rot: 2, ingredient: 'meat', cookedName: 'Grilled Frog Leg' },
  desc: 'One long, muscular hind leg off a frog piranha, webbed foot and all. The muscle still twitches if you salt it. Grilled, it tastes exactly like you would hope.',
  model: (mb: MB) => { tube(mb, [[-0.1, 0.02, 0], [0, 0.03, 0.01], [0.06, 0.015, -0.02], [0.12, 0.008, 0]], (t) => 0.022 * (1 - t * 0.6), 6, S_FROG); },
});
defItem({
  key: 'piranha_jaw', name: 'Piranha Underbite', cat: 'material', weight: 0.08, value: 12, tags: ['sharp', 'bone', 'pool'],
  desc: 'The jutting lower jaw of a frog piranha with its row of interlocking triangular teeth. Lashed to a stick, a saw. Tribes elsewhere would trade a lot for a necklace of these.',
  model: (mb: MB) => { mb.box(0, 0.012, 0, 0.06, 0.024, 0.07, S_PJAW); for (let i = 0; i < 5; i++) mb.box(-0.024 + i * 0.012, 0.03, 0.03, 0.008, 0.016, 0.006, 'plastic_white', { color: 0xf8f4e8 }); },
});

// ---- the balloon puffer
defItem({
  key: 'puffer_latex', name: 'Puffer Latex', cat: 'material', weight: 0.05, value: 9, tags: ['rubber', 'pool', 'weird'],
  desc: 'A sheet of the balloon puffer\'s latex, torn where it popped, still glossy. It stretches to five times its length and seals a leak, a wound or a jar.',
  model: (mb: MB) => { mb.box(0, 0.004, 0, 0.14, 0.008, 0.1, S_LATEX); },
});
defItem({
  key: 'puffer_eye', name: 'Puffer Eye', cat: 'material', weight: 0.03, value: 45, tags: ['research', 'specimen', 'pool', 'weird'],
  desc: 'A human eyeball out of a balloon puffer: wet, veined, perfectly ordinary, with a little knot of latex where the optic nerve should be. It still tracks movement for about a minute after you hold it.',
  model: (mb: MB) => { blob(mb, [0, 0.025, 0], [0.025, 0.025, 0.025], 10, 7, S_EYE); },
});
defItem({
  key: 'balloon_string', name: 'Balloon String', cat: 'material', weight: 0.01, value: 2, tags: ['fiber', 'string', 'pool'],
  desc: 'A metre of curling ribbon that trailed from a balloon puffer. It is warm.',
  model: (mb: MB) => { const p: [number, number, number][] = []; for (let i = 0; i <= 12; i++) p.push([-0.1 + i * 0.017, 0.006, Math.sin(i * 1.4) * 0.02]); tube(mb, p, 0.003, 4, S_STR); },
});

// ---- the Plunge's loot
defLoot('pl_floor', [1, 1], [['toy_rubber_duck', 4], ['swim_goggles', 3], ['coins', 5], ['brass_token', 2], ['soda_can_empty', 4], ['empty_bottle', 2], ['note', 1.5], ['keyring', 1.5], ['wristwatch', 0.6], ['candy_bar', 1.5], ['puffer_latex', 1], ['balloon_string', 1]], 0.3);
defLoot('pl_locker', [1, 3], [['swim_goggles', 3], ['coins', 4], ['wallet', 1.5], ['keyring', 2], ['wristwatch', 1], ['candy_bar', 2], ['soda_can', 2], ['towel', 2], ['note', 1], ['photo_old', 0.8]], 0.25);

// ---- corpses
defLoot('creature_gulper', [5, 8], [['gulper_meat', 6], ['gulper_hide', 4], ['gulper_tooth', 2], ['swim_goggles', 1], ['wristwatch', 0.6]], 0);
defLoot('creature_gulper_tadpole', [1, 1], [['tadpole_meat', 5]], 0.2);
defLoot('creature_frog_piranha', [1, 3], [['frog_leg', 5], ['piranha_jaw', 3]], 0);
defLoot('creature_balloon_puffer', [1, 3], [['puffer_latex', 5], ['puffer_eye', 3], ['balloon_string', 3]], 0);

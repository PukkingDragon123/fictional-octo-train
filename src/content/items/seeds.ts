// Items stream — SEEDS, FARMING SUPPLIES, TRAPS & BAIT. `seed` = crop key the
// farming system plants; `uses` = seeds per packet (PZ: 5 per packet). Crop →
// harvest item: potato→potato, carrot→carrot, tomato→tomato, cabbage→cabbage,
// strawberry→strawberries, lettuce→lettuce, dreamlily→dreamlily_bloom.
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, stampC, dashes, band, slab, rodX, prism, ph, MB, PixelCanvas } from './_kit';

function packetTex(name: string, bg: number, art: string[], pal: Record<string, number>) {
  return decal(name, 12, 16, (pc) => {
    pc.fill(0xf2ecd8);
    pc.rect(1, 1, 10, 10, bg);
    stampC(pc, 6, 2, art, pal);
    dashes(pc, 1, 12, 10, 0x4a4a46, 2); dashes(pc, 2, 14, 8, 0x8a8a84, 3);
    pc.hline(0, 11, 0, 0xffffff);
  });
}
const SEEDS: [string, string, string, number, string[], Record<string, number>, number][] = [
  ['seeds_carrot', 'Carrot Seeds', 'carrot', 0x8ac0e0, ['..g.g.', '...g..', '..oo..', '..oo..', '..oo..', '...o..', '...o..'], { g: 0x5aa83a, o: 0xe8802a }, 5],
  ['seeds_tomato', 'Tomato Seeds', 'tomato', 0x9ad8a0, ['..g...', '.rrrr.', 'rrRrrr', 'rrrrrr', '.rrrr.'], { g: 0x3a8a3a, r: 0xd83a2a, R: 0xff9a80 }, 5],
  ['seeds_cabbage', 'Cabbage Seeds', 'cabbage', 0xe8d8a0, ['.gggg.', 'gGgGgg', 'ggGggG', 'gGggGg', '.gggg.'], { g: 0x6aa84a, G: 0xa8d87a }, 5],
  ['seeds_strawberry', 'Strawberry Seeds', 'strawberry', 0xf0d0e0, ['.ggg.', 'rrrrr', 'ryryr', '.rrr.', '..r..'], { g: 0x3a8a3a, r: 0xd02a3a, y: 0xf6e07a }, 5],
  ['seeds_lettuce', 'Lettuce Seeds', 'lettuce', 0xf2e8b0, ['.g.g.', 'gGgGg', 'GgGgG', 'gGgGg', '.ggg.'], { g: 0x7ac04a, G: 0xb8e888 }, 5],
];
for (const [key, name, crop, bg, art, pal, uses] of SEEDS) {
  const t = packetTex('i_seed_' + crop, bg, art, pal);
  defItem({
    key, name, cat: 'seed', weight: 0.02, seed: crop, uses, tags: ['seed'],
    desc: `A packet of ${uses} seeds. Dig a furrow, sow, water.`,
    model: (mb) => slab(mb, 0.075, 0.004, 0.11, t, T.pages, 0xf2ecd8, { rot: 0.2 }),
  });
}
const S_NET = tex('i_net_bag', 8, 8, (pc) => { pc.fill(0xb08a5a); pc.each((x, y) => { if ((x + y) % 3 === 0 || (x - y + 9) % 3 === 0) pc.set(x, y, 0xd8402a); }); }, true);
defItem({
  key: 'seeds_potato', name: 'Seed Potatoes', cat: 'seed', weight: 0.6, seed: 'potato', uses: 3, tags: ['seed'],
  desc: 'Three sprouting potatoes, ready to plant.',
  model: (mb) => {
    for (const [x, z] of [[-0.03, -0.02], [0.03, -0.01], [0.0, 0.03]]) { mb.push().translate(x, 0, z).scale(1.25, 1, 1); mb.sphere(0, 0.026, 0, 0.032, 6, 5, 'i_potato', { fit: true, sy: 0.75 }); mb.pop(); }
    mb.sphere(0, 0.03, 0, 0.07, 6, 4, S_NET, { sy: 0.5, fit: true });
    for (const [x, z] of [[-0.02, -0.03], [0.04, 0.0]]) mb.box(x, 0.05, z, 0.006, 0.014, 0.006, T.white, { color: 0xc8e0a0 });
  },
});
const D_DREAM_PACKET = decal('i_seed_dreamlily', 12, 16, (pc) => {
  pc.fill(0x1c1828);
  for (let i = 0; i < 12; i++) pc.set(Math.floor(ph(i, 1, 4) * 12), Math.floor(ph(i, 2, 4) * 10), 0xf2f2ff);
  stampC(pc, 6, 2, ['..p..', '.pPp.', 'pPwPp', '.pPp.', '..g..', '..g..'], { p: 0xd8a8f8, P: 0xf6d8ff, w: 0xffffff, g: 0x6ad8a8 });
  dashes(pc, 1, 12, 10, 0x8a7ab8, 2); txtC(pc, '', 6, 13, 0);
});
defItem({
  key: 'seeds_dreamlily', name: 'Dreamlily Seeds', cat: 'seed', weight: 0.02, seed: 'dreamlily', uses: 3, tags: ['seed', 'anomalous'], rare: true,
  desc: 'Seeds that are slightly warm, like something asleep. Grows only where the sky is painted.',
  model: (mb) => slab(mb, 0.075, 0.004, 0.11, D_DREAM_PACKET, T.pages, 0x2a2438, { rot: -0.2, emissive: 0.4 }),
});

// ---------------------------------------------------------------- harvest of the anomalous crop
const S_PETAL = tex('i_petal', 6, 6, (pc) => { pc.fill(0xc898f0); pc.vline(2, 0, 5, 0xecd8ff); pc.set(3, 5, 0x9a68d8); pc.set(4, 4, 0xb080e8); });
defItem({
  key: 'dreamlily_bloom', name: 'Dreamlily Bloom', cat: 'food', weight: 0.05, tags: ['anomalous', 'herb', 'flower'],
  food: { hunger: 1, thirst: 1, calories: 10, lucidity: 15, unhappy: -4, fresh: 2, rot: 4, ingredient: 'weird' },
  desc: 'A pale, faintly glowing lily. Eat it, or brew it into tea for a clearer head.',
  model: (mb) => {
    rodX(mb, -0.09, 0.0, 0.004, 0.003, 0.003, 4, T.white, { color: 0x6ad8a8 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      mb.push().translate(0.01, 0.012, 0).rotateY(a).rotateZ(0.5); mb.box(0.018, 0, 0, 0.036, 0.003, 0.02, S_PETAL, { fit: true, emissive: 0.3 }); mb.pop();
    }
    mb.sphere(0.01, 0.016, 0, 0.007, 5, 4, T.white, { color: 0xfff6c0, emissive: 1.2 });
    mb.push().translate(-0.05, 0.004, 0).rotateY(0.6); mb.box(0, 0, 0.012, 0.04, 0.003, 0.016, T.white, { color: 0x6ad8a8 }); mb.pop();
  },
});

// ---------------------------------------------------------------- fertiliser
const D_FERT = decal('i_fertilizer_front', 12, 16, (pc) => {
  pc.fill(0x3a7a3a); pc.rect(0, 2, 12, 6, 0xf2ecd8); txtC(pc, 'NPK', 6, 2, 0x2a5a2a);
  stampC(pc, 6, 9, ['.g.g.', 'ggggg', '..g..', '..g..'], { g: 0x9ae06a }); dashes(pc, 1, 14, 10, 0xf2ecd8, 2);
});
defItem({
  key: 'fertilizer', name: 'Fertilizer', cat: 'misc', weight: 2.0, uses: 4, tags: ['fertilizer', 'farming'],
  desc: 'Four applications. Speeds crop growth and improves yield.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.2, 0.25, 0.08, T.plastic, { color: 0x3a7a3a });
    mb.panel(-0.1, 0.0401, 0.1, 0.0401, 0.01, 0.24, D_FERT, { fit: true });
    mb.box(0, 0.25, 0, 0.2, 0.02, 0.03, T.plastic, { color: 0x2a5a2a });
  },
});
const D_COMPOST = tex('i_compost_top', 10, 10, (pc) => { pc.fill(0x3e2e1e); pc.each((x, y) => { const v = ph(x, y, 8); if (v < 0.2) pc.set(x, y, 0x5a4228); else if (v < 0.27) pc.set(x, y, 0x6a8a3a); else if (v < 0.3) pc.set(x, y, 0xc8b070); }); });
defItem({
  key: 'compost', name: 'Compost', cat: 'misc', weight: 3.0, uses: 2, tags: ['fertilizer', 'compost', 'farming'],
  desc: 'Rich, dark, made from rotten food. Two applications of fertiliser.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.11, 0.2, 10, T.plastic, { color: 0x3a3a40, fit: true, rTop: 0.12 });
    mb.cylinder(0, 0.2, 0, 0.115, 0.004, 10, { sides: T.plastic, top: D_COMPOST }, { fit: true });
  },
});

// ---------------------------------------------------------------- traps & bait
defItem({
  key: 'trap_box_item', name: 'Box Trap', cat: 'trap', weight: 3.0, place: 'trap_box', tags: ['trap'],
  desc: 'Bait it and leave it. Catches small creatures overnight.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.45, 0.22, 0.22, 'wood_light', { color: 0xd8b888 });
    mb.box(0.231, 0.03, 0, 0.012, 0.19, 0.2, 'wood_dark');
    mb.push().translate(-0.1, 0.22, 0).rotateZ(-0.2); mb.box(0.1, 0, 0, 0.22, 0.012, 0.02, 'wood_dark'); mb.pop();
    mb.cylinder(-0.1, 0.22, 0, 0.012, 0.03, 6, 'wood_dark');
    for (let i = 0; i < 4; i++) mb.box(-0.18 + i * 0.1, 0.221, 0, 0.004, 0.001, 0.2, T.black);
  },
});
defItem({
  key: 'trap_snare_item', name: 'Snare', cat: 'trap', weight: 0.3, place: 'trap_snare', tags: ['trap'],
  desc: 'A noose on a bent stick. Set it on a trail.',
  model: (mb) => {
    rodX(mb, -0.15, 0.1, 0.008, 0.007, 0.006, 5, 'bark', { color: 0x8a6a4a });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; mb.box(0.13 + Math.cos(a) * 0.04, 0.002, Math.sin(a) * 0.04, 0.026, 0.004, 0.004, T.white, { color: 0xc8a868 }); }
    rodX(mb, 0.08, 0.1, 0.006, 0.003, 0.003, 4, T.white, { color: 0xc8a868 });
  },
});
const D_BAIT = tex('i_bait_top', 10, 10, (pc) => { pc.fill(0x5a3a22); pc.each((x, y) => { if (ph(x, y, 3) < 0.25) pc.set(x, y, 0xc87a7a); if (ph(x, y, 4) < 0.1) pc.set(x, y, 0x8a5a3a); }); });
defItem({
  key: 'bait', name: 'Bait', cat: 'trap', weight: 0.05, tags: ['bait'],
  desc: 'Worms and scraps in a paper twist. Smells irresistible, to some.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.035, 0.03, 8, { sides: T.card, top: D_BAIT }, { color: 0xc8a878, fit: true });
  },
});

void K; void rp; void dk; void lt; void txt; void stamp; void band; void prism;

// ---------------------------------------------------------------- trap catches (spawned by the trap system) & small game
const furTex = (name: string, base: number, belly: number) => tex(name, 12, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, y > 5 ? belly : ph(x, y, 3) < 0.25 ? lt(base, 0.15) : ph(x, y, 4) < 0.2 ? dk(base, 0.85) : base));
}, true);
const F_RAT = furTex('i_fur_rat', 0x6a625a, 0x9a928a);
const F_RABBIT = furTex('i_fur_rabbit', 0x8a6a4a, 0xd8cbb8);
const F_SQUIRREL = furTex('i_fur_squirrel', 0xa8582a, 0xe8d8c0);
const F_BIRD = tex('i_feathers', 12, 8, (pc) => pc.each((x, y) => pc.set(x, y, (x + y * 2) % 5 === 0 ? 0x4a3a2a : y > 5 ? 0xc8b898 : (x % 3 === 0 ? 0x7a6a52 : 0x8a7a62))), true);
/** small animal lying on its side: body along X, head at +X */
function critter(mb: MB, o: { fur: string; len: number; r: number; head: number; tail?: [number, number, number]; ears?: number; legs?: number; beak?: boolean }) {
  mb.push().scale(o.len / (o.r * 2), 1, 1); mb.sphere(0, o.r * 0.85, 0, o.r, 7, 5, o.fur, { fit: true, sy: 0.85 }); mb.pop();
  mb.sphere(o.len * 0.5, o.r * 0.7, 0, o.head, 6, 5, o.fur, { fit: true });
  if (o.beak) mb.box(o.len * 0.5 + o.head * 1.1, o.r * 0.68, 0, o.head * 0.8, o.head * 0.35, o.head * 0.4, T.white, { color: 0xd8a83a });
  else mb.box(o.len * 0.5 + o.head * 0.9, o.r * 0.6, 0, o.head * 0.4, o.head * 0.35, o.head * 0.4, T.white, { color: 0xc89a8a });
  mb.box(o.len * 0.5 + o.head * 0.2, o.r * 0.7 + o.head * 0.4, o.head * 0.62, o.head * 0.25, o.head * 0.25, 0.004, T.black);
  if (o.ears) for (const s of [-1, 1]) { mb.push().translate(o.len * 0.42, o.r * 0.9 + o.head * 0.5, s * o.head * 0.4).rotateZ(-1.0); mb.box(o.ears / 2, 0, 0, o.ears, o.head * 0.25, o.head * 0.45, o.fur, { fit: true }); mb.pop(); }
  if (o.tail) { const [len, w, curl] = o.tail; mb.push().translate(-o.len * 0.5, o.r * 0.6, 0).rotateZ(curl); mb.box(-len / 2, 0, 0, len, w, w, o.fur, { fit: true }); mb.pop(); }
  if (o.legs) for (const x of [-o.len * 0.25, o.len * 0.25]) mb.box(x, o.r * 0.25, o.r * 0.7, o.legs * 0.3, o.legs * 0.25, o.legs, o.fur, { fit: true });
}
defItem({
  key: 'rat_dead', name: 'Dead Rat', cat: 'corpse', weight: 0.3, tags: ['small_game', 'butcherable'],
  desc: 'Caught in a trap. Butcher it with a knife for a little meat.',
  model: (mb) => critter(mb, { fur: F_RAT, len: 0.17, r: 0.032, head: 0.026, tail: [0.16, 0.008, 0.15], legs: 0.03 }),
});
defItem({
  key: 'rabbit_dead', name: 'Dead Rabbit', cat: 'corpse', weight: 1.5, tags: ['small_game', 'butcherable'],
  desc: 'A grey-brown rabbit with fur too soft for this place. Butcher it with a knife.',
  model: (mb) => critter(mb, { fur: F_RABBIT, len: 0.3, r: 0.07, head: 0.05, tail: [0.03, 0.035, 0.6], ears: 0.08, legs: 0.08 }),
});
defItem({
  key: 'squirrel_dead', name: 'Dead Squirrel', cat: 'corpse', weight: 0.5, tags: ['small_game', 'butcherable'],
  desc: 'Butcher it with a knife for a little meat.',
  model: (mb) => critter(mb, { fur: F_SQUIRREL, len: 0.2, r: 0.04, head: 0.032, tail: [0.18, 0.05, -0.5], ears: 0.02, legs: 0.04 }),
});
defItem({
  key: 'bird_dead', name: 'Dead Bird', cat: 'corpse', weight: 0.3, tags: ['small_game', 'butcherable'],
  desc: 'A drab little bird. Pluck and butcher it with a knife.',
  model: (mb) => critter(mb, { fur: F_BIRD, len: 0.15, r: 0.04, head: 0.026, tail: [0.07, 0.012, 0.1], beak: true }),
});
defItem({
  key: 'small_meat_raw', name: 'Small Game Meat', cat: 'food', weight: 0.2, tags: ['rawmeat', 'stewmeat'],
  food: { hunger: 8, calories: 280, raw: true, cookable: true, cookMins: 12, poison: 0.4, fresh: 1, rot: 3, ingredient: 'meat', cookedName: 'Roast Small Game' },
  model: (mb) => {
    mb.box(0, 0, 0, 0.1, 0.004, 0.08, T.card, { color: 0xd8c8a8 });
    mb.push().rotateY(0.3); mb.box(0, 0.004, 0, 0.08, 0.025, 0.045, 'i_meat_raw', { uvScale: 4 }); mb.pop();
    mb.push().translate(0.02, 0.004, 0.02).rotateY(-0.4); mb.box(0, 0, 0, 0.04, 0.02, 0.025, 'i_meat_raw', { uvScale: 4 }); mb.pop();
  },
});

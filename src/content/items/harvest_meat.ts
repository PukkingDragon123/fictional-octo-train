// Items — THE HARVEST (round 15). What a body gives up when you take it apart properly
// (src/cook/butchery.ts): lean flesh, fat, the new inhabitants' odd parts, and the
// leftovers of a Still Life (sponge). Every flesh cut is raw: eaten raw it risks food
// poisoning, parasites and (for anything that was a person) your nerve; cooked
// (src/cook/cooking.ts) it is safe and filling. Icons come from these models
// (src/ui/icons.ts renders them).
import { defItem, type FoodProps } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, T, rodX, makeRamp, ph, type MB } from './_kit';

// ---------------------------------------------------------------- textures (painted at 16 px: they are seen up close in the icons)
const S_LEAN = tex('i_hv_lean', 16, 16, (pc) => {
  const R = makeRamp(0xa8282c, 6, { spread: 0.55 });
  pc.each((x, y) => {
    const grain = Math.sin(x * 0.9 + y * 0.35 + ph(x >> 2, y, 3) * 2);
    const fat = (x * 5 + y * 3) % 17 === 0 || ph(x, y, 9) < 0.05;
    pc.set(x, y, fat ? 0xf0dcd0 : R[Math.max(0, Math.min(5, Math.round(2.6 + grain * 1.3 + (ph(x, y, 4) - 0.5))))]);
  });
}, true);
const S_FAT = tex('i_hv_fat', 16, 16, (pc) => {
  const R = makeRamp(0xf0e2c8, 6, { spread: 0.45 });
  pc.each((x, y) => pc.set(x, y, ph(x, y, 13) < 0.04 ? 0xc87a70 : R[Math.max(0, Math.min(5, Math.round(3 + Math.sin(x * 0.6 + ph(x >> 1, y >> 1, 5) * 3) * 1.4)))]));
}, true);
const S_POSSUM = tex('i_hv_possum', 16, 16, (pc) => {
  const R = makeRamp(0xb43a3c, 6, { spread: 0.5 });
  pc.each((x, y) => pc.set(x, y, y < 3 ? (ph(x, y, 2) < 0.5 ? 0x8a8682 : 0x6a6662) : y < 5 ? 0xe8d8c8 : R[Math.max(0, Math.min(5, Math.round(2.5 + Math.sin(x * 0.7 + y * 0.2) + (ph(x, y, 6) - 0.5) * 1.5)))]));
}, true);
const S_SPONGE = tex('i_hv_sponge', 16, 16, (pc) => {
  const R = [0x8a6420, 0xbc9034, 0xdab04c, 0xf0d070];
  pc.each((x, y) => {
    const pore = ph(x >> 1, y >> 1, 21) < 0.32 && ((x ^ y) & 1) === 0;
    pc.set(x, y, pore ? 0x3a2610 : R[Math.max(0, Math.min(3, Math.round(1.6 + (ph(x, y, 7) - 0.5) * 2.2)))]);
  });
}, true);
const S_TOOTH = tex('i_hv_tooth', 8, 16, (pc) => {
  pc.each((x, y) => { const g = ((x + y * 0.6) % 4) < 1; pc.set(x, y, y > 12 ? 0x6a4a24 : g ? 0x8a7a5a : y < 2 ? 0xfff6e0 : 0xd8c8a0); });
}, true);
const S_BOARD = tex('i_hv_board', 16, 16, (pc) => {
  pc.each((x, y) => { const w = ((x >> 1) + (y >> 1)) & 1; pc.set(x, y, y < 2 || y > 13 ? 0xa8aeb4 : (w ? 0x46536a : 0x3e4a5a)); });
  for (let x = 3; x < 9; x++) pc.set(x, 7, 0xf2eee0);
  pc.set(8, 9, 0xc87a70); pc.set(9, 9, 0xd88a80);
}, true);

// ---------------------------------------------------------------- flesh and fat
type F = Partial<FoodProps>;
function flesh(key: string, name: string, weight: number, f: F, model: (mb: MB) => void, desc: string, tags: string[] = [], grid?: [number, number]) {
  defItem({
    key, name, cat: 'food', weight, value: 6, desc, model, grid,
    food: { hunger: 18, calories: 700, raw: true, cookable: true, cookMins: 22, poison: 0.35, fresh: 1.2, rot: 3, ingredient: 'meat', ...f } as FoodProps,
    tags: ['rawmeat', 'rawflesh', 'butchered', ...tags],
  });
}
flesh('flesh_strips', 'Raw Flesh Strips', 0.35, { hunger: 14, calories: 520, cookedName: 'Seared Strips' }, (mb) => {
  for (let i = 0; i < 3; i++) { mb.push().translate(0, 0.012 + i * 0.012, (i - 1) * 0.03).rotateY((i - 1) * 0.25); mb.box(0, 0, 0, 0.17, 0.014, 0.03, S_LEAN, { uvScale: 2 }); mb.pop(); }
}, 'Long lean strips cut along the grain of whatever it was. Dark red, faintly sweet. Cook it.');
flesh('fat_raw', 'Raw Fat', 0.3, { hunger: 6, calories: 900, cookMins: 18, poison: 0.2, unhappy: 6, cookedName: 'Crackling' }, (mb) => {
  mb.box(0, 0.025, 0, 0.12, 0.05, 0.08, S_FAT, { uvScale: 2 });
  mb.box(0.01, 0.055, 0.005, 0.1, 0.012, 0.07, S_LEAN, { uvScale: 2, color: 0xe0b0a8 });
}, 'A slab of white fat with a skin of red on one side. Render it, fry in it, or eat it crackled when you are cold.', ['fat']);
flesh('possum_meat', 'Possum Haunch', 0.45, { hunger: 22, calories: 780, cookMins: 26, poison: 0.4, cookedName: 'Roast Possum' }, (mb) => {
  mb.sphere(0, 0.035, 0, 0.055, 8, 5, S_POSSUM, { sy: 0.65 });
  rodX(mb, 0.04, 0.12, 0.03, 0.012, 0.009, 6, T.card, { color: 0xf2ead8 });
  mb.sphere(0.12, 0.03, 0, 0.013, 5, 4, T.card, { color: 0xf2ead8 });
}, 'A hind leg, the grey bristle still on the rump. Lean and gamey. Hum Possums carry worms: cook it through.', ['parasites']);
flesh('driller_cheek', 'Jaw Muscle', 0.6, { hunger: 20, calories: 760, cookMins: 32, poison: 0.45, unhappy: 20, stress: 10, lucidity: -4, cookedName: 'Braised Jaw Muscle' }, (mb) => {
  mb.sphere(0, 0.035, 0, 0.07, 8, 5, S_LEAN, { sy: 0.55, sx: 1.3 } as any);
  mb.box(0.03, 0.06, 0, 0.06, 0.01, 0.05, S_FAT, { uvScale: 2 });
}, 'A great fan of chewing muscle off a Driller, tough as a belt. It worked that jaw through concrete. It was a person, once, too.', ['longpig'], [2, 1]);

// ---------------------------------------------------------------- the odd parts
defItem({
  key: 'driller_tooth', name: 'Drill Tooth', cat: 'material', weight: 0.08, value: 22, tags: ['anomalous', 'weirdpart', 'butchered', 'sharp'],
  desc: 'One of the seven teeth from a Driller\'s ring: as long as a finger, grooved in a spiral like a masonry bit. It is sharper than it should be, and it bites into concrete.',
  model: (mb) => { mb.push().rotateZ(1.2); rodX(mb, -0.05, 0.05, 0.012, 0.011, 0.0015, 7, S_TOOTH); mb.pop(); },
});
defItem({
  key: 'partition_board', name: 'Grown Partition Panel', cat: 'material', weight: 1.1, value: 14, tags: ['board', 'plank', 'butchered', 'build'], grid: [2, 2],
  desc: 'A section of cubicle wall cut off a Partition Hermit\'s back. Fabric over board, aluminium trim, a memo still pinned to it. The edge is pink where it grew in. Good for building.',
  model: (mb) => { mb.box(0, 0.012, 0, 0.26, 0.024, 0.2, S_BOARD, { uvScale: 1 }); mb.box(0, 0.026, -0.1, 0.27, 0.006, 0.012, 'white', { color: 0xd88080 }); },
});
defItem({
  key: 'sponge_chunk', name: 'Sponge Chunk', cat: 'material', weight: 0.15, value: 8, tags: ['sponge', 'absorbent', 'butchered', 'cloth'],
  desc: 'A torn lump of a Still Life: yellow cellulose sponge under a skin of wax. It still holds the shape of an elbow. It soaks up anything: water, blood, the smell of a room.',
  model: (mb) => { mb.sphere(0, 0.035, 0, 0.05, 7, 5, S_SPONGE, { sy: 0.75 }); mb.sphere(0.03, 0.05, 0.01, 0.025, 6, 4, 'white', { color: 0xe6d8b0 }); },
});

// ---------------------------------------------------------------- corpse loot (pockets, not meat): the new natives
defLoot('creature_driller', [0, 2], [['driller_tooth', 3], ['id_badge', 1], ['coins', 2, 1, 3], ['bone', 3, 1, 2], ['glass_shard', 1], ['key_generic', 0.8]], 0.3);
defLoot('creature_hermit', [1, 3], [['pen', 4], ['sticky_notes', 3], ['stapler', 2], ['mug', 2], ['photo_old', 2], ['id_badge', 2], ['coins', 3, 1, 3], ['floppy_disk', 1], ['phone_dead', 1]], 0.1);
defLoot('creature_hum_possum', [0, 2], [['coins', 3, 1, 2], ['food_scraps', 4], ['gum', 1], ['battery', 1], ['marbles', 0.6], ['key_generic', 0.5]], 0.35);

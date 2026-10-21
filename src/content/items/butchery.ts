// Items — BUTCHERY. What comes off a corpse when you cut it up (src/cook/butchery.ts):
// meat cuts, organs, hide, and the parts only one species has. Raw meat is
// cookable (src/cook/cooking.ts) and goes bad in a day or two.
import { defItem, type FoodProps } from '../../items/item';
import { tex, T, rodX, type MB } from './_kit';

const S_MARBLE = tex('i_bt_marble', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 3 + y * 5) % 7 === 0 ? 0xf2d8d0 : (x + y * 2) % 5 === 0 ? 0x8a1a1e : 0xb02a2c));
}, true);
const S_ORGAN = tex('i_bt_organ', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 5 + y) % 6 === 0 ? 0x4a0a14 : (x + y) % 4 === 0 ? 0x8a2234 : 0x6a1424));
}, true);
const S_HIDE = tex('i_bt_hide', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 3 + y * 7) % 5 === 0 ? 0x5a4636 : (x ^ y) % 3 === 0 ? 0x8a7058 : 0x7a6048));
}, true);
const S_PALE = tex('i_bt_pale', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 2 + y * 3) % 7 === 0 ? 0xb88a7a : (x + y) % 4 === 0 ? 0xd8b8a8 : 0xc8a294));
}, true);

type Extra = { tags?: string[]; desc?: string; value?: number; grid?: [number, number] };
function meat(key: string, name: string, weight: number, f: FoodProps, model: (mb: MB) => void, x: Extra = {}) {
  defItem({ key, name, cat: 'food', weight, food: { raw: true, cookable: true, fresh: 1.2, rot: 3, ...f }, model, ...x, tags: ['rawmeat', 'butchered', ...(x.tags || [])] });
}
function part(key: string, name: string, f: Partial<FoodProps> | null, color: number, model: (mb: MB) => void, desc: string, value = 30) {
  defItem({
    key, name, cat: f ? 'food' : 'anomaly', weight: 0.25, value, desc, model, tags: ['weirdpart', 'butchered'],
    ...(f ? { food: { hunger: 4, calories: 120, raw: true, cookable: true, cookMins: 10, ingredient: 'weird', poison: 0.2, fresh: 3, rot: 6, ...f } as FoodProps } : {}),
    tint: color,
  });
}

// ---------------------------------------------------------------- cuts
meat('cut_haunch', 'Haunch', 0.9, { hunger: 32, calories: 1400, cookMins: 30, poison: 0.3, ingredient: 'meat', cookedName: 'Roast Haunch' }, (mb) => {
  mb.sphere(0, 0.05, 0, 0.09, 8, 5, S_MARBLE, { sy: 0.6 });
  rodX(mb, 0.06, 0.17, 0.05, 0.016, 0.012, 6, T.card, { color: 0xf2ead8 });
  mb.sphere(0.17, 0.05, 0, 0.02, 6, 4, T.card, { color: 0xf2ead8 });
}, { desc: 'A whole hind leg, skin still on one side. Heavy as a bag of sand.', grid: [2, 2] });

meat('cut_shank', 'Shank', 0.45, { hunger: 18, calories: 700, cookMins: 25, poison: 0.3, ingredient: 'meat', cookedName: 'Braised Shank' }, (mb) => {
  rodX(mb, -0.1, 0.06, 0.035, 0.04, 0.03, 7, S_MARBLE);
  rodX(mb, 0.06, 0.12, 0.035, 0.012, 0.012, 5, T.card, { color: 0xf2ead8 });
}, { desc: 'Foreleg meat around a knuckle of bone.' });

meat('cut_ribs', 'Rack of Ribs', 0.7, { hunger: 24, calories: 1100, cookMins: 30, poison: 0.25, unhappy: -3, ingredient: 'meat', cookedName: 'Charred Ribs' }, (mb) => {
  mb.box(0, 0, 0, 0.22, 0.03, 0.12, S_MARBLE, { uvScale: 3 });
  for (let i = 0; i < 6; i++) mb.box(-0.09 + i * 0.036, 0.03, 0, 0.012, 0.008, 0.14, T.card, { color: 0xf2ead8 });
}, { desc: 'A curved rack cut from the barrel of the chest.', grid: [2, 1] });

meat('cut_gristle', 'Pale Gristle', 0.4, { hunger: 16, calories: 640, cookMins: 22, poison: 0.45, unhappy: 22, stress: 12, ingredient: 'meat', cookedName: 'Cooked Gristle' }, (mb) => {
  mb.box(0, 0, 0, 0.14, 0.04, 0.08, S_PALE, { uvScale: 3 });
  mb.box(0.03, 0.04, 0.01, 0.06, 0.02, 0.05, S_PALE, { uvScale: 3, color: 0xe8d0c0 });
}, { tags: ['longpig'], desc: 'It came off something shaped like a person. You try very hard not to think about whose.' });

meat('organ_heart', 'Heart', 0.3, { hunger: 10, calories: 340, cookMins: 14, poison: 0.2, unhappy: 4, ingredient: 'meat', cookedName: 'Seared Heart' }, (mb) => {
  mb.sphere(0, 0.045, 0, 0.05, 7, 5, S_ORGAN, { sy: 1.15 });
  rodX(mb, -0.02, 0.02, 0.1, 0.012, 0.01, 5, S_ORGAN, { color: 0xc8a0a8 });
}, { tags: ['organ'], desc: 'Fist-sized and still slick. It does not beat. You check twice.' });

meat('organ_liver', 'Liver', 0.35, { hunger: 12, calories: 380, cookMins: 10, poison: 0.25, unhappy: 6, ingredient: 'meat', cookedName: 'Fried Liver' }, (mb) => {
  mb.sphere(0, 0.02, 0, 0.08, 8, 4, S_ORGAN, { sy: 0.32, color: 0x8a5050 });
}, { tags: ['organ'], desc: 'Dark, glossy, iron-smelling. Good for you, they say.' });

meat('organ_offal', 'Offal Coil', 0.5, { hunger: 10, calories: 420, cookMins: 18, poison: 0.5, unhappy: 10, ingredient: 'meat', cookedName: 'Fried Offal' }, (mb) => {
  for (let i = 0; i < 5; i++) { const a = i * 1.3; mb.sphere(Math.cos(a) * 0.04 * (1 + i * 0.2), 0.02, Math.sin(a) * 0.04 * (1 + i * 0.2), 0.026, 6, 4, S_ORGAN, { color: 0xd8a0a0 }); }
}, { tags: ['organ'], desc: 'Loops of gut. Rinse it. Rinse it again.' });

defItem({
  key: 'hide_raw', name: 'Raw Hide', cat: 'material', weight: 1.2, value: 12, tags: ['hide', 'leather', 'butchered'], grid: [2, 2],
  desc: 'A rolled-up skin, fat side in. Leather, eventually; a smell, immediately.',
  model: (mb) => { mb.cylinderX(0, 0.05, 0, 0.05, 0.24, 8, S_HIDE); mb.box(0.1, 0, 0, 0.08, 0.008, 0.16, S_HIDE); },
});

// ---------------------------------------------------------------- species parts (one per kind of thing)
const gland = (c: number) => (mb: MB) => { mb.sphere(0, 0.03, 0, 0.035, 7, 5, 'plastic_white', { color: c, emissive: 0.3 }); mb.sphere(0.02, 0.05, 0.01, 0.012, 5, 3, 'plastic_white', { color: 0xffffff }); };
part('part_tallow', 'Tallow Lump', { hunger: 6, calories: 600, unhappy: 14, ingredient: 'weird' }, 0xe8dcb8, (mb) => mb.sphere(0, 0.03, 0, 0.05, 7, 4, 'plastic_white', { color: 0xe8dcb8, sy: 0.7 }), 'Wax-fat scooped from inside a Still Life. It melts on your fingers and smells like a birthday.');
part('part_stutter_gland', 'Stutter Gland', { lucidity: -0.1, stress: 4 }, 0xd8d0c8, gland(0xd8d0c8), 'A pale knot from the Stammer. Hold it and the world skips a frame.', 45);
part('part_eyeshine', 'Eye-Shine Bead', null, 0xf6f0a0, (mb) => mb.sphere(0, 0.02, 0, 0.022, 7, 5, 'plastic_white', { color: 0xf6f0a0, emissive: 1.4 }), 'The reflective layer behind a Gloam\'s eye. Still catches light that is not there.', 70);
part('part_grin_tongue', 'Grinning Tongue', { hunger: 6, calories: 220, unhappy: 18, ingredient: 'meat' }, 0xc85a6a, (mb) => mb.box(0, 0, 0, 0.12, 0.018, 0.045, S_ORGAN, { color: 0xffb0b8 }), 'Long and too human. The hound grinned with it.', 25);
part('part_stilt_marrow', 'Stilt Marrow', { hunger: 10, calories: 520, unhappy: -4, ingredient: 'meat' }, 0xf2e0c0, (mb) => rodX(mb, -0.12, 0.12, 0.02, 0.018, 0.018, 6, T.card, { color: 0xf2e0c0 }), 'A split leg bone from a stilt doe, full of sweet yellow marrow.', 30);
part('part_static_node', 'Static Node', null, 0x9ab0c8, (mb) => mb.box(0, 0, 0, 0.05, 0.05, 0.05, 'screen_on', { color: 0x9ab0c8, emissive: 1 }), 'A lump of noise from inside a Hollow. Your teeth hum near it.', 80);
part('part_plaster_heart', 'Plaster Heart', null, 0xe8e2d8, (mb) => mb.sphere(0, 0.04, 0, 0.045, 6, 4, 'plastic_white', { color: 0xe8e2d8 }), 'The Drywall Man had one. It is hollow and has a stud through it.', 40);
part('part_shell_chip', 'Shell Chip', null, 0xd8d8e0, (mb) => mb.box(0, 0, 0, 0.08, 0.01, 0.06, 'plastic_white', { color: 0xd8d8e0 }), 'A glossy curve of an Employee\'s face. There is a reflection in it that is not yours.', 35);
part('part_echo_cochlea', 'Echo Cochlea', { lucidity: -0.15, stress: 6 }, 0x8a7a9a, gland(0x8a7a9a), 'A spiral of cartilage that whispers your last sentence back to you.', 55);
part('part_drowned_lung', 'Drowned Lung', { hunger: 4, thirst: 10, calories: 90, unhappy: 16, ingredient: 'weird' }, 0xb8a0a8, gland(0xb8a0a8), 'Waterlogged. When you squeeze it, pool water comes out. Chlorinated.', 25);
part('part_plenum_eye', 'Plenum Eye Cluster', null, 0xe0c8c0, (mb) => { for (let i = 0; i < 4; i++) mb.sphere((i % 2) * 0.03 - 0.015, 0.02, (i >> 1) * 0.03 - 0.015, 0.016, 5, 4, 'plastic_white', { color: 0xf2f2e8 }); }, 'Four eyes on a stalk. They tracked the ceiling.', 60);
part('part_cotton_heart', 'Cotton Heart', null, 0xd84a5a, (mb) => mb.sphere(0, 0.03, 0, 0.04, 6, 4, 'fabric_red', { color: 0xd84a5a }), 'A stitched felt heart, stuffed tight. It is warm.', 30);
part('part_bellows_lung', 'Bellows Lung', { hunger: 5, calories: 160, unhappy: 10, ingredient: 'weird' }, 0x9a7a6a, gland(0x9a7a6a), 'Ventlings breathe the building\'s air through this. It still sighs.', 30);
part('part_wishbone', 'Wrong Wishbone', null, 0xf2ead8, (mb) => { mb.push().rotateY(0.4); rodX(mb, 0, 0.1, 0.01, 0.006, 0.006, 4, T.card, { color: 0xf2ead8 }); mb.pop(); mb.push().rotateY(-0.4); rodX(mb, 0, 0.1, 0.01, 0.006, 0.006, 4, T.card, { color: 0xf2ead8 }); mb.pop(); }, 'It has three ends. Make a wish. It will be wrong.', 25);
part('part_glow_sac', 'Glow Sac', { hunger: 3, calories: 60, lucidity: 0.1, ingredient: 'weird' }, 0x9aff8a, (mb) => mb.sphere(0, 0.03, 0, 0.035, 7, 5, 'plastic_white', { color: 0x9aff8a, emissive: 1.6 }), 'Bioluminescent fluid in a skin bag. Drinkable, in theory.', 50);

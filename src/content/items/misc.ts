// Items stream — MISC: toys & comfort items, hygiene, bedding, keys, and the
// placeable kits (`place` = object key created when the kit is placed).
// Comfort items carry their "play / hold" effect in `literature` (boredom,
// unhappy, stress per use session) and the tag 'comfort' (UI verb: Play/Hold).
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, stampC, dashes, band, panels, slab, folded, book, rodX, rodZ, prism, ph, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- textures
const S_FUR = tex('i_fur', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 4) < 0.25 ? 0xb08050 : ph(x, y, 5) < 0.2 ? 0x8a5a32 : 0x9a6a3e)), true);
const D_CARDS = decal('i_cards_box', 10, 14, (pc) => { pc.fill(0x2a4a9a); pc.strokeRect(1, 1, 8, 12, 0xf2f2ee); stampC(pc, 5, 4, ['.r.', 'rrr', 'rrr', '.r.'], { r: 0xf2f2ee }); dashes(pc, 2, 10, 6, 0xf2f2ee, 2); });
const D_DIE = tex('i_die', 6, 6, (pc) => { pc.fill(0xf6f4ee); pc.strokeRect(0, 0, 6, 6, 0xd8d6cc); pc.set(1, 1, 0x1c1c1c); pc.set(4, 4, 0x1c1c1c); pc.set(2, 2, 0xc8302a); pc.set(3, 3, 0xc8302a); });
const D_CRAYONS = decal('i_crayons_box', 14, 10, (pc) => { pc.fill(0xf0c419); pc.rect(0, 5, 14, 5, 0x3a8a3a); txt(pc, 'CRA', 1, 0, 0x2a5a2a); for (let i = 0; i < 6; i++) pc.vline(1 + i * 2, 6, 8, [0xc8302a, 0x2a5aa8, 0xe8862a, 0x8a3aa8, 0x3aa83a, 0x1c1c1c][i]); });
const D_WALLET = tex('i_wallet_top', 12, 10, (pc) => { const R = rp(0x5a3a22, 5, 0.35); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y, 3) < 0.2 ? 1 : 0)])); pc.strokeRect(0, 0, 12, 10, R[1]); for (let x = 1; x < 11; x += 2) { pc.set(x, 1, R[4]); pc.set(x, 8, R[4]); } });
const L_SUNSCREEN = tex('i_sunscreen_label', 16, 10, (pc) => { pc.fill(0xf6f2ea); band(pc, 0, 3, 0xf0a020); panels(pc, 2, (x0, pw) => { stampC(pc, x0 + pw / 2, 4, ['.y.', 'yyy', '.y.'], { y: 0xf6c830 }); dashes(pc, x0 + 1, 8, pw - 2, 0x2a5aa8, 2); }); }, true);
const S_SOAP = tex('i_soap', 8, 8, (pc) => { pc.fill(0xe8c8d8); pc.rect(2, 3, 4, 2, 0xd8b0c4); pc.hline(0, 7, 0, 0xf6e0ea); }, true);
const D_TOWEL = tex('i_towel_top', 16, 14, (pc) => {
  pc.fill(0xd8d8d6); pc.each((x, y) => { if ((x + y) % 2 === 0) pc.set(x, y, 0xcacac8); });
  pc.rect(0, 9, 16, 2, 0xf2f2f0); pc.rect(0, 11, 16, 1, 0x8a8a88); pc.hline(0, 15, 0, 0xf0f0ee);
});
const D_BLANKET = tex('i_blanket_top', 16, 14, (pc) => {
  pc.fill(0x8a3a3a);
  pc.each((x, y) => { if (x % 6 < 2) pc.set(x, y, 0x5a2a2a); if (y % 6 < 2) pc.set(x, y, (x % 6 < 2) ? 0x3a1a1a : 0x6a2e2e); if (x % 6 === 4 && y % 2 === 0) pc.set(x, y, 0xd8c060); });
  pc.hline(0, 15, 0, 0xa84a48);
});
const D_PILLOW = tex('i_pillow_top', 14, 10, (pc) => { pc.fill(0xf2f2ee); pc.strokeRect(0, 0, 14, 10, 0xd8d8d2); pc.each((x, y) => { if ((x * 3 + y) % 9 === 0) pc.set(x, y, 0xb8d0e8); }); pc.set(3, 3, 0xe2e2dc); });
const S_NYLON_BAND = tex('i_strap', 4, 4, (pc) => { pc.fill(0x2a2a2e); pc.hline(0, 3, 0, 0x4a4a52); }, true);
const D_KIT_TAG = (name: string, art: string[], pal: Record<string, number>) => decal(name, 12, 10, (pc) => {
  pc.fill(0xe8dcc0); pc.strokeRect(0, 0, 12, 10, 0x8a6a42); pc.set(1, 1, 0x5a4a32);
  stampC(pc, 6, 2, art, pal);
});
const K_CRATE = D_KIT_TAG('i_kit_crate', ['bbbbbbb', 'b.b.b.b', 'bbbbbbb', 'b.b.b.b', 'bbbbbbb', 'b.b.b.b'], { b: 0x6a4a2a });
const K_TABLE = D_KIT_TAG('i_kit_table', ['bbbbbbbb', 'bbbbbbbb', '.b....b.', '.b....b.', '.b....b.'], { b: 0x6a4a2a });
const K_CHAIR = D_KIT_TAG('i_kit_chair', ['.b...', '.b...', '.bbbb', '.b..b', '.b..b'], { b: 0x6a4a2a });
const K_BED = D_KIT_TAG('i_kit_bed', ['b......', 'bwwwrrr', 'brrrrrr', 'b.....b'], { b: 0x6a4a2a, w: 0xf2f2ee, r: 0xc8402a });
const K_PLANTER = D_KIT_TAG('i_kit_planter', ['.g.g.g.', 'ggggggg', 'bbbbbbb', 'bkkkkkb', 'bbbbbbb'], { g: 0x4aa83a, b: 0x6a4a2a, k: 0x3a2a1a });
const K_BARRICADE = D_KIT_TAG('i_kit_barricade', ['bbbbbb.', '.bbbbbb', 'bbbbbb.', '.bbbbbb'], { b: 0x6a4a2a });
const K_BENCH = D_KIT_TAG('i_kit_workbench', ['..g.s..', 'bbbbbbb', 'b.....b', 'b.....b'], { b: 0x6a4a2a, g: 0x8a8e94, s: 0xc8302a });
const K_RAIN = D_KIT_TAG('i_kit_rain', ['.b.b.b.', 'ttttttt', '.t...t.', '..ccc..', '..ccc..'], { b: 0x4a8ad8, t: 0x2a5ab8, c: 0x8a8e94 });

// ---------------------------------------------------------------- toys & comfort
const comfort = (b: number, u: number, s = 0) => ({ boredom: b, unhappy: u, stress: s });
defItem({
  key: 'teddy_bear', name: 'Teddy Bear', cat: 'misc', weight: 0.4, tags: ['toy', 'comfort'],
  literature: comfort(-5, -15, -10),
  desc: 'Threadbare and patient. Hold it to calm down; sleeping with it keeps the nightmares quieter.',
  model: (mb) => {
    mb.sphere(0, 0.065, 0, 0.06, 8, 6, S_FUR, { sy: 1.1, fit: true });
    mb.sphere(0, 0.16, 0.0, 0.045, 8, 6, S_FUR, { fit: true });
    for (const s of [-1, 1]) {
      mb.sphere(s * 0.035, 0.2, -0.005, 0.016, 6, 4, S_FUR, { fit: true });
      mb.sphere(s * 0.06, 0.08, 0.02, 0.022, 6, 4, S_FUR, { fit: true });
      mb.sphere(s * 0.035, 0.02, 0.04, 0.025, 6, 4, S_FUR, { fit: true });
      mb.box(s * 0.015, 0.17, 0.042, 0.008, 0.008, 0.004, T.black);
    }
    mb.sphere(0, 0.15, 0.04, 0.016, 6, 4, T.white, { color: 0xd8b890 });
    mb.box(0, 0.155, 0.055, 0.008, 0.006, 0.004, T.black);
    mb.box(0, 0.115, 0.04, 0.05, 0.012, 0.02, T.white, { color: 0xc8302a });
  },
});
defItem({
  key: 'toy_rubber_duck', name: 'Rubber Duck', cat: 'misc', weight: 0.05, tags: ['toy', 'comfort'],
  literature: comfort(-6, -5),
  desc: 'Squeaks. Floats. Found in a pool hall that has never had children in it.',
  model: (mb) => {
    mb.sphere(0, 0.03, 0, 0.035, 8, 5, T.white, { color: 0xf6d02a, sy: 0.8 });
    mb.sphere(0.025, 0.065, 0, 0.022, 8, 5, T.white, { color: 0xf6d02a });
    mb.box(0.052, 0.06, 0, 0.018, 0.008, 0.016, T.white, { color: 0xf26a1a });
    for (const s of [-1, 1]) mb.box(0.035, 0.072, s * 0.016, 0.006, 0.006, 0.004, T.black);
    mb.box(-0.032, 0.045, 0, 0.012, 0.012, 0.02, T.white, { color: 0xe8c020 });
  },
});
defItem({
  key: 'doll', name: 'Porcelain Doll', cat: 'misc', weight: 0.5, tags: ['toy'],
  literature: comfort(-4, 4, 6),
  desc: 'Glass eyes. It was facing the other way a minute ago.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.05, 0.1, 8, T.white, { color: 0x8a3a5a, rTop: 0.03 });
    mb.sphere(0, 0.135, 0, 0.035, 8, 6, 'porcelain', { color: 0xf6e8e0 });
    mb.box(0, 0.15, -0.012, 0.075, 0.05, 0.05, T.white, { color: 0xc89a4a });
    for (const s of [-1, 1]) { mb.box(s * 0.012, 0.14, 0.033, 0.008, 0.008, 0.004, T.white, { color: 0x3a6ab8 }); mb.box(s * 0.045, 0.06, 0, 0.014, 0.05, 0.014, 'porcelain', { color: 0xf6e8e0 }); }
  },
});
defItem({
  key: 'toy_car', name: 'Toy Car', cat: 'misc', weight: 0.1, tags: ['toy'],
  literature: comfort(-6, -2),
  model: (mb) => {
    mb.box(0, 0.012, 0, 0.09, 0.02, 0.04, T.plastic, { color: 0xc8302a });
    mb.box(-0.005, 0.032, 0, 0.045, 0.016, 0.036, T.plastic, { color: 0xd84038 });
    mb.box(0.012, 0.034, 0, 0.012, 0.012, 0.037, 'i_glass', { color: 0xa8c8e0 });
    for (const x of [-0.028, 0.028]) for (const z of [-0.02, 0.02]) rodZ(mb, z - 0.004, z + 0.004, 0.011, 0.011, 0.011, 8, T.black, { cx: x });
  },
});
defItem({
  key: 'rubiks_cube', name: 'Puzzle Cube', cat: 'misc', weight: 0.1, tags: ['toy', 'comfort'],
  literature: comfort(-25, -3),
  desc: 'A colour-twisting puzzle. One face can never be solved.',
  model: (mb) => mb.box(0, 0, 0, 0.056, 0.056, 0.056, 'i_cube_faces', { fit: true }),
});
tex('i_cube_faces', 9, 9, (pc) => { pc.fill(0x1c1c1c); for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) pc.rect(x * 3, y * 3, 2, 2, [0xc8302a, 0xf0c419, 0x2a5aa8, 0x3a9a3a, 0xf2f2ee, 0xe8862a][(x * 7 + y * 3) % 6]); });
defItem({
  key: 'marbles', name: 'Bag of Marbles', cat: 'misc', weight: 0.2, tags: ['toy', 'distraction'],
  literature: comfort(-8, -2),
  desc: 'Scatter them on the floor: anything that walks over them makes a racket.',
  model: (mb) => {
    mb.sphere(0, 0.035, 0, 0.045, 6, 5, T.cloth, { color: 0x6a3a8a, sy: 0.8 });
    mb.cylinder(0, 0.065, 0, 0.012, 0.02, 6, T.cloth, { color: 0x5a2a7a });
    [0x2a8ad8, 0xc8302a, 0x3ab85a].forEach((c, i) => mb.sphere(0.05 + i * 0.018, 0.008, 0.02 - i * 0.012, 0.008, 6, 4, 'i_glass', { color: c }));
  },
});
defItem({
  key: 'deck_of_cards', name: 'Deck of Cards', cat: 'misc', weight: 0.1, tags: ['toy', 'comfort'],
  literature: comfort(-20, -5),
  desc: 'Solitaire passes the time. Fifty-three cards; you have checked twice.',
  model: (mb) => pack(mb, 0.064, 0.09, 0.02, D_CARDS, 0x2a4a9a),
});
function pack(mb: MB, w: number, h: number, d: number, front: string, color: number) {
  mb.box(0, 0, 0, w, h, d, T.card, { color });
  mb.panel(-w / 2, d / 2 + 0.0015, w / 2, d / 2 + 0.0015, 0, h, front, { fit: true });
}
defItem({
  key: 'dice', name: 'Dice', cat: 'misc', weight: 0.02, tags: ['toy', 'comfort'],
  literature: comfort(-8, -2),
  model: (mb) => {
    mb.push().rotateY(0.3); mb.box(0, 0, 0, 0.018, 0.018, 0.018, D_DIE, { fit: true }); mb.pop();
    mb.push().translate(0.03, 0, 0.012).rotateY(-0.5); mb.box(0, 0, 0, 0.018, 0.018, 0.018, D_DIE, { fit: true }); mb.pop();
  },
});
defItem({
  key: 'crayons', name: 'Crayons', cat: 'misc', weight: 0.1, tags: ['pen', 'toy'],
  literature: comfort(-10, -4),
  desc: 'Draw on the walls. Something down here likes the drawings.',
  model: (mb) => {
    pack(mb, 0.09, 0.06, 0.02, D_CRAYONS, 0xf0c419);
    [0xc8302a, 0x2a5aa8, 0xe8862a, 0x3aa83a].forEach((c, i) => mb.cylinder(-0.03 + i * 0.02, 0.06, 0, 0.004, 0.02, 6, T.white, { color: c, rTop: 0.002 }));
  },
});
defItem({
  key: 'jump_rope', name: 'Jump Rope', cat: 'misc', weight: 0.3, tags: ['toy', 'rope_source'],
  desc: 'Cut the handles off and it is a decent length of rope.',
  model: (mb) => {
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; mb.box(Math.cos(a) * 0.08, 0.003, Math.sin(a) * 0.06, 0.04, 0.006, 0.006, T.white, { color: 0xe86ab0 }); }
    for (const s of [-1, 1]) rodX(mb, 0.07 * s - 0.03, 0.07 * s + 0.03, 0.01, 0.01, 0.01, 6, T.white, { color: 0x2a8ad8, cz: 0.08 });
  },
});
defItem({
  key: 'basketball', name: 'Basketball', cat: 'misc', weight: 0.6, tags: ['toy', 'sports', 'distraction'],
  desc: 'Bounce it down a corridor and see what follows the sound.',
  model: (mb) => mb.sphere(0, 0.12, 0, 0.12, 10, 7, 'i_basketball', { fit: true }),
});
tex('i_basketball', 16, 8, (pc) => { pc.fill(0xd8702a); pc.each((x, y) => { if (ph(x, y, 3) < 0.15) pc.set(x, y, 0xc8602a); }); pc.hline(0, 15, 4, 0x2a1a10); pc.vline(2, 0, 7, 0x2a1a10); pc.vline(10, 0, 7, 0x2a1a10); pc.set(2, 2, 0xf09a5a); }, true);
defItem({
  key: 'pool_noodle', name: 'Pool Noodle', cat: 'misc', weight: 0.15, tags: ['toy', 'pool'],
  desc: 'Bright foam tube. Floats. Will not save you, but might keep you up.',
  model: (mb) => rodX(mb, -0.7, 0.7, 0.035, 0.035, 0.035, 8, { sides: 'foam', top: 'i_noodle_end', bottom: 'i_noodle_end' }, { color: 0x6af06a }),
});
tex('i_noodle_end', 8, 8, (pc) => { pc.fill(0x6af06a); pc.each((x, y) => { if (Math.hypot(x - 3.5, y - 3.5) < 1.4) pc.set(x, y, 0x1c3a1c); }); });

// ---------------------------------------------------------------- personal & hygiene
defItem({
  key: 'wallet', name: 'Wallet', cat: 'misc', weight: 0.1, tags: ['wallet', 'lore'],
  desc: 'A driver\'s licence, a library card, a photo of a dog. Everything expired the same day.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.11, 0.018, 0.085, { all: T.leather, top: D_WALLET }, { fit: { top: true }, color: 0xffffff });
    mb.box(0.012, 0.018, -0.01, 0.07, 0.003, 0.05, T.white, { color: 0x6aa0d8 });
  },
});
defItem({
  key: 'keyring', name: 'Keyring', cat: 'key', weight: 0.08, tags: ['key'],
  desc: 'A ring of keys to doors that may not exist any more. Try them anyway.',
  model: (mb) => {
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; mb.box(Math.cos(a) * 0.02, 0.002, Math.sin(a) * 0.02, 0.012, 0.003, 0.003, 'chrome'); }
    [0.4, 1.3, 2.4].forEach((a, i) => {
      mb.push().translate(Math.cos(a) * 0.02, 0.003 + i * 0.002, Math.sin(a) * 0.02).rotateY(-a);
      mb.box(0.03, 0, 0, 0.045, 0.003, 0.012, i === 1 ? 'metal_brass' : 'chrome'); mb.box(0.006, 0, 0, 0.018, 0.0035, 0.02, i === 1 ? 'metal_brass' : 'chrome');
      mb.pop();
    });
  },
});
defItem({
  key: 'key_generic', name: 'Key', cat: 'key', weight: 0.01, tags: ['key'],
  desc: 'A single brass key with a paper tag. The tag says only "B".',
  model: (mb) => {
    mb.box(0.015, 0, 0, 0.045, 0.003, 0.01, 'metal_brass');
    mb.cylinder(-0.015, 0, 0, 0.012, 0.003, 8, 'metal_brass');
    for (const x of [0.02, 0.028, 0.036]) mb.box(x, 0, 0.007, 0.004, 0.003, 0.004, 'metal_brass');
    mb.box(-0.04, 0, 0.0, 0.025, 0.002, 0.018, T.white, { color: 0xf2ecd8 });
  },
});
defItem({
  key: 'car_key', name: 'Car Key', cat: 'key', weight: 0.03, tags: ['key', 'carkey'],
  desc: 'The fob still blinks. There must be a car somewhere in the parking levels.',
  model: (mb) => {
    mb.box(-0.015, 0, 0, 0.035, 0.012, 0.022, T.plastic, { color: 0x1c1c20 });
    mb.box(0.025, 0.003, 0, 0.045, 0.004, 0.009, 'chrome');
    mb.box(-0.015, 0.012, 0.004, 0.006, 0.002, 0.006, T.white, { color: 0xc8302a, emissive: 0.8 });
  },
});
defItem({
  key: 'padlock', name: 'Padlock', cat: 'misc', weight: 0.25, tags: ['padlock', 'lock'],
  desc: 'Lock a container or a door hasp. Comes with its key.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.045, 0.04, 0.02, 'metal_brass');
    for (const s of [-1, 1]) mb.box(s * 0.015, 0.04, 0, 0.006, 0.025, 0.006, 'chrome');
    mb.box(0, 0.062, 0, 0.036, 0.006, 0.006, 'chrome');
    mb.box(0, 0.012, 0.0105, 0.004, 0.012, 0.001, T.black);
  },
});
defItem({
  key: 'sunscreen', name: 'Sunscreen', cat: 'misc', weight: 0.2, uses: 10, tags: ['hygiene'],
  desc: 'SPF 50. There is no sun. The fields beyond the pool halls burn anyway.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.025, 0.12, 8, L_SUNSCREEN, { fit: true });
    mb.cylinder(0, 0.12, 0, 0.022, 0.02, 8, T.cap, { color: 0xf0a020, fit: true });
  },
});
defItem({
  key: 'soap', name: 'Bar of Soap', cat: 'misc', weight: 0.1, uses: 10, tags: ['soap', 'hygiene', 'cleaning'],
  desc: 'Wash off blood and grime (with water) — clean bodies get fewer infections and fewer sad looks.',
  model: (mb) => mb.box(0, 0, 0, 0.085, 0.025, 0.055, S_SOAP, { fit: true }),
});
defItem({
  key: 'toothbrush', name: 'Toothbrush', cat: 'misc', weight: 0.02, tags: ['hygiene'],
  literature: comfort(0, -3),
  model: (mb) => {
    mb.box(0, 0, 0, 0.17, 0.008, 0.012, T.plastic, { color: 0x2a8ad8 });
    mb.box(0.07, 0.008, 0, 0.025, 0.01, 0.011, T.white, { color: 0xf2f2ee });
  },
});
defItem({
  key: 'toothpaste', name: 'Toothpaste', cat: 'misc', weight: 0.1, uses: 20, tags: ['hygiene'],
  model: (mb) => {
    rodX(mb, -0.07, 0.05, 0.016, 0.018, 0.016, 8, 'i_toothpaste', { fit: true });
    rodX(mb, 0.05, 0.07, 0.016, 0.009, 0.009, 6, T.white, { color: 0xf2f2ee });
  },
});
tex('i_toothpaste', 12, 8, (pc) => { pc.fill(0xf2f2ee); pc.rect(0, 2, 12, 3, 0x2a5aa8); pc.hline(0, 11, 3, 0xc8302a); }, true);
defItem({
  key: 'toilet_paper', name: 'Toilet Paper', cat: 'misc', weight: 0.1, burn: 0.1, tags: ['paper', 'tinder', 'hygiene'],
  model: (mb) => mb.cylinder(0, 0, 0, 0.055, 0.1, 10, { sides: 'i_tp_side', top: 'i_tp_top', bottom: 'i_tp_top' }, { fit: true }),
});
tex('i_tp_side', 12, 8, (pc) => { pc.fill(0xf6f6f2); for (let y = 1; y < 8; y += 2) for (let x = (y >> 1) & 1; x < 12; x += 2) pc.set(x, y, 0xe8e8e2); }, true);
tex('i_tp_top', 10, 10, (pc) => { pc.fill(0xf2f2ee); pc.each((x, y) => { const d = Math.hypot(x - 4.5, y - 4.5); if (d < 2) pc.set(x, y, 0xb88a5a); else if (d < 2.6) pc.set(x, y, 0x8a6a42); else if (Math.round(d * 2) % 3 === 0) pc.set(x, y, 0xe2e2dc); }); });
defItem({
  key: 'necklace', name: 'Necklace', cat: 'misc', weight: 0.02, value: 5, tags: ['shiny', 'jewelry'],
  desc: 'A silver locket. The photo inside has been cut out.',
  model: (mb) => {
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; mb.box(Math.cos(a) * 0.035, 0.001, Math.sin(a) * 0.025, 0.012, 0.002, 0.002, 'chrome'); }
    mb.cylinder(0.0, 0.0, 0.03, 0.01, 0.005, 8, 'chrome');
  },
});
defItem({
  key: 'chlorine_tablets', name: 'Purification Tablets', cat: 'misc', weight: 0.05, uses: 10, tags: ['purify'],
  desc: 'Chlorine tablets: one makes a litre of tainted water drinkable in half an hour.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.018, 0.06, 8, T.plastic, { color: 0xf2f2ee, fit: true });
    mb.cylinder(0, 0.015, 0, 0.0185, 0.03, 8, 'i_purify_label', { fit: true, caps: false });
    mb.cylinder(0, 0.06, 0, 0.02, 0.012, 8, T.cap, { color: 0x2a8ad8, fit: true });
  },
});
tex('i_purify_label', 12, 6, (pc) => { pc.fill(0x2a8ad8); panels(pc, 2, (x0, pw) => { stampC(pc, x0 + pw / 2, 1, ['.w.', 'www', 'www', '.w.'], { w: 0xf2f2ee }); }); }, true);

// ---------------------------------------------------------------- bedding & camping
defItem({
  key: 'towel_item', name: 'Towel', cat: 'misc', weight: 0.4, burn: 0.2, tags: ['towel', 'cloth'],
  desc: 'Dry yourself off after the flooded levels. Rip into rags if you must.',
  model: (mb) => folded(mb, 0.24, 0.18, 0.05, D_TOWEL, 0x6ab0d8),
});
defItem({
  key: 'blanket', name: 'Blanket', cat: 'misc', weight: 1.2, burn: 0.6, tags: ['blanket', 'cloth', 'bedding', 'warmth'],
  desc: 'Wool, warm. Wrap up (+warmth) or sleep under it for better rest.',
  model: (mb) => folded(mb, 0.32, 0.26, 0.08, D_BLANKET, 0xffffff),
});
defItem({
  key: 'pillow_item', name: 'Pillow', cat: 'misc', weight: 0.5, tags: ['pillow', 'bedding'],
  desc: 'Improves sleep anywhere — even on the floor of a room that will not stay the same size.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.42, 0.08, 0.28, { all: 'pillow', top: D_PILLOW }, { fit: { top: true } });
    mb.box(0, 0.02, 0, 0.44, 0.04, 0.3, 'pillow', { color: 0xe8e8e2 });
  },
});
defItem({
  key: 'sleeping_bag_item', name: 'Sleeping Bag', cat: 'misc', weight: 1.8, place: 'sleeping_bag', tags: ['bedding', 'camping'],
  desc: 'Rolled up. Place it to sleep warm anywhere.',
  model: (mb) => {
    rodX(mb, -0.22, 0.22, 0.11, 0.11, 0.11, 10, { sides: T.nylon, top: 'i_bag_roll_end', bottom: 'i_bag_roll_end' }, { color: 0x2a5aa8, uvScale: 3 });
    for (const x of [-0.12, 0.12]) rodX(mb, x - 0.012, x + 0.012, 0.11, 0.113, 0.113, 10, S_NYLON_BAND);
  },
});
tex('i_bag_roll_end', 10, 10, (pc) => { pc.fill(0x2a5aa8); pc.each((x, y) => { const d = Math.hypot(x - 4.5, y - 4.5); if (Math.round(d * 1.6) % 2) pc.set(x, y, 0xc8302a); if (d > 4.4) pc.set(x, y, 0x1a3a7a); }); });
defItem({
  key: 'tent_kit', name: 'Tent', cat: 'misc', weight: 4.0, place: 'tent', tags: ['camping', 'kit'],
  desc: 'Packed two-person tent. Pitch it for a dry, private place to sleep.',
  model: (mb) => {
    rodX(mb, -0.25, 0.25, 0.09, 0.09, 0.09, 10, T.nylon, { color: 0x4a7a3a, uvScale: 3 });
    for (const x of [-0.15, 0.15]) rodX(mb, x - 0.012, x + 0.012, 0.09, 0.093, 0.093, 10, S_NYLON_BAND);
    for (const z of [-0.03, 0.0, 0.03]) rodX(mb, 0.2, 0.36, 0.11 + z * 0.5, 0.006, 0.006, 5, 'metal_grey', { cz: z });
  },
});
defItem({
  key: 'campfire_kit', name: 'Campfire Kit', cat: 'misc', weight: 3.5, place: 'campfire_unlit', tags: ['camping', 'kit', 'fire'],
  desc: 'A ring of stones and a stack of dry wood. Place it, then light it.',
  model: (mb) => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mb.push().translate(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14).scale(1.2, 1, 1); mb.sphere(0, 0.02, 0, 0.032, 6, 4, 'stone_rough', { sy: 0.7 }); mb.pop(); }
    for (let i = 0; i < 4; i++) { mb.push().translate(0, 0.02 + i * 0.012, 0).rotateY(i * 0.8); rodX(mb, -0.1, 0.1, 0.0, 0.016, 0.016, 6, 'bark'); mb.pop(); }
  },
});
defItem({
  key: 'rain_collector_kit', name: 'Rain Collector Kit', cat: 'misc', weight: 6.0, place: 'rain_collector', tags: ['kit', 'water'],
  desc: 'A tarp funnel on a frame over a bucket. Place it where water drips: ceilings leak a lot down here.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.5, 0.1, 0.12, 'plank');
    mb.box(0, 0.1, 0, 0.3, 0.06, 0.26, T.foldSide, { color: 0x2a5ab8, fit: true });
    mb.flat(0, 0.1601, 0, 0.3, 0.26, 'i_tarp_top');
    mb.cylinder(0.2, 0.1, 0.0, 0.07, 0.14, 8, T.metal, { color: 0xc8ccc8, rTop: 0.08 });
    for (const x of [-0.15, 0.1]) mb.box(x, 0.0, 0, 0.02, 0.105, 0.125, S_NYLON_BAND);
    mb.box(-0.1, 0.16, 0.0, 0.07, 0.002, 0.05, K_RAIN, { fit: true });
  },
});

// ---------------------------------------------------------------- carpentry kits (flat-packed boards + a tag)
interface KitOpts { key: string; name: string; place: string; weight: number; tag: string; desc: string; boards: number; len: number; heavy?: boolean }
const KITS: KitOpts[] = [
  { key: 'kit_crate', name: 'Crate Kit', place: 'crate_built', weight: 8, tag: K_CRATE, boards: 4, len: 0.7, desc: 'Pre-cut boards for a sturdy storage crate. Place to assemble.' },
  { key: 'kit_table', name: 'Table Kit', place: 'table_built', weight: 10, tag: K_TABLE, boards: 5, len: 0.9, heavy: true, desc: 'A rough plank table, ready to assemble.' },
  { key: 'kit_chair', name: 'Chair Kit', place: 'chair_built', weight: 6, tag: K_CHAIR, boards: 3, len: 0.6, desc: 'A simple wooden chair, ready to assemble.' },
  { key: 'kit_bed', name: 'Bed Frame Kit', place: 'crafted_bed', weight: 12, tag: K_BED, boards: 6, len: 1.0, heavy: true, desc: 'A raised bed frame with a stuffed-sheet mattress. Far better sleep than the floor.' },
  { key: 'kit_planter', name: 'Planter Box Kit', place: 'farm_planter', weight: 8, tag: K_PLANTER, boards: 4, len: 0.8, desc: 'A raised planter box: grow food on any floor, even carpet. Needs soil and water.' },
  { key: 'kit_barricade', name: 'Barricade Panel', place: 'barricade', weight: 6.5, tag: K_BARRICADE, boards: 3, len: 1.0, desc: 'Three planks pre-nailed on battens. Fix over a door or window, or stand it in a corridor.' },
  { key: 'kit_workbench', name: 'Workbench Kit', place: 'workbench', weight: 14, tag: K_BENCH, boards: 6, len: 1.0, heavy: true, desc: 'A heavy workbench. Advanced carpentry, electrical and mechanics recipes need one.' },
];
for (const k of KITS) {
  defItem({
    key: k.key, name: k.name, cat: 'misc', weight: k.weight, place: k.place, heavy: k.heavy, tags: ['kit', 'furniture_kit'], desc: k.desc,
    model: (mb) => {
      for (let i = 0; i < k.boards; i++) {
        const layer = Math.floor(i / 2), side = i % 2;
        mb.box(0, layer * 0.042, (side ? 0.05 : -0.05), k.len, 0.04, 0.095, 'plank', { uvOffset: [i * 0.3, 0] });
      }
      const top = Math.ceil(k.boards / 2) * 0.042;
      for (const x of [-k.len * 0.3, k.len * 0.3]) mb.box(x, -0.002, 0, 0.03, top + 0.006, 0.205, S_NYLON_BAND);
      mb.box(k.len * 0.05, top, 0.0, 0.11, 0.003, 0.09, k.tag, { fit: true });
    },
  });
}

void K; void rp; void dk; void lt; void txtC; void stamp; void slab; void book; void prism;

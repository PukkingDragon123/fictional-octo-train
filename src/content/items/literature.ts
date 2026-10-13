// Items stream — LITERATURE. Magazines teach recipes (literature.recipes =
// recipe keys marked learned:true) and give a small XP multiplier; skill books
// give ×3 XP for their skill while read (PZ volume-1 equivalent). Fiction
// relieves boredom/unhappiness/stress. Lore items carry their text.
import { defItem } from '../../items/item';
import { tex, decal, T, K, rp, dk, lt, txt, txtC, stamp, stampC, dashes, band, slab, book, folded, ph, MB, PixelCanvas } from './_kit';

// ---------------------------------------------------------------- cover painter
interface Cover { bg: number; title: string; titleC: number; bandC?: number; icon?: string[]; pal?: Record<string, number>; iconY?: number; w?: number; h?: number; stripe?: number; frame?: number }
function coverTex(name: string, c: Cover) {
  const W = c.w ?? 16, H = c.h ?? 20;
  return decal(name, W, H, (pc) => {
    pc.fill(c.bg);
    pc.each((x, y) => { if (ph(x >> 1, y >> 1, 7) < 0.1) pc.set(x, y, lt(c.bg, 0.08)); });
    if (c.bandC !== undefined) { pc.rect(0, 1, W, 7, c.bandC); }
    txtC(pc, c.title, W / 2, 2, c.titleC);
    if (c.icon) stampC(pc, W / 2, c.iconY ?? 9, c.icon, c.pal ?? {});
    if (c.stripe !== undefined) pc.hline(0, W - 1, H - 3, c.stripe);
    dashes(pc, 2, H - 2, W - 4, dk(c.bg, 0.55), 3);
    pc.hline(0, W - 1, 0, lt(c.bg, 0.3));
    if (c.frame !== undefined) pc.strokeRect(0, 0, W, H, c.frame);
  });
}

// ---------------------------------------------------------------- magazines
interface Mag { key: string; name: string; skill: string; recipes: string[]; cover: Cover; desc: string }
const MAGS: Mag[] = [
  { key: 'mag_carpentry', name: 'Weekend Woodworker', skill: 'carpentry', recipes: ['make_kit_bed', 'make_rain_collector', 'make_barricade_kit'],
    desc: 'Teaches: crafted bed, rain collector, barricade panels.',
    cover: { bg: 0xc8862a, title: 'WOOD', titleC: 0xf6f0e0, bandC: 0x5a3a1a, iconY: 9, icon: ['ggggg..', '.gg.....', '.gg.sss', '.gg.sss', '....sss'], pal: { g: 0x8a8e94, s: 0xe8d8a8 } } },
  { key: 'mag_electrical', name: 'Circuit Monthly', skill: 'electrical', recipes: ['make_noisemaker', 'make_lantern', 'jury_rig_fuse'],
    desc: 'Teaches: noisemaker, lantern, jury-rigged fuse.',
    cover: { bg: 0x2a3a6a, title: 'VOLT', titleC: 0xf0c419, bandC: 0x1a2448, iconY: 9, icon: ['...yy', '..yy.', '.yyyy', '..yy.', '.yy..', 'yy...'], pal: { y: 0xf0c419 } } },
  { key: 'mag_cooking', name: 'Pantry & Pot', skill: 'cooking', recipes: ['make_jerky', 'make_ration_bar'],
    desc: 'Teaches: jerky, survival ration bars.',
    cover: { bg: 0xeee0c0, title: 'COOK', titleC: 0xc8302a, iconY: 9, icon: ['.s..s.', '..s..s', 'kkkkkk', 'kKKKKk', '.kkkk.'], pal: { s: 0xa8a8a8, k: 0x4a4a52, K: 0xc8642a } } },
  { key: 'mag_farming', name: 'Green Thumb', skill: 'farming', recipes: ['make_compost', 'cut_seed_potato', 'seeds_from_tomato', 'seeds_from_strawberries'],
    desc: 'Teaches: compost, seed potatoes, saving tomato and strawberry seeds.',
    cover: { bg: 0x4a8a3a, title: 'GROW', titleC: 0xf6f0e0, bandC: 0x2a5a2a, iconY: 9, icon: ['.g.g.', 'ggggg', '..g..', '.bbb.', 'bbbbb'], pal: { g: 0x9ae06a, b: 0x7a5a3a } } },
  { key: 'mag_firstaid', name: 'Field Medic Digest', skill: 'firstaid', recipes: ['make_suture', 'make_alcohol_wipes'],
    desc: 'Teaches: suture kits from needle and thread, alcohol swabs.',
    cover: { bg: 0xf2f2ee, title: 'AID', titleC: 0xc8302a, frame: 0xc8302a, iconY: 9, icon: ['.rr.', '.rr.', 'rrrr', 'rrrr', '.rr.', '.rr.'], pal: { r: 0xc8302a } } },
  { key: 'mag_mechanics', name: 'Wrench Weekly', skill: 'mechanics', recipes: ['make_sheet_metal', 'repair_nail_gun'],
    desc: 'Teaches: hammering scrap into sheet metal, nail gun repair.',
    cover: { bg: 0x3a3a40, title: 'GEAR', titleC: 0xf26a1a, bandC: 0x1c1c20, iconY: 9, icon: ['.ss.s', 's..ss', '.sss.', 'ss...', 's.s..'], pal: { s: 0xc8ccd0 } } },
  { key: 'mag_tailoring', name: 'Stitch & Mend', skill: 'tailoring', recipes: ['sew_backpack', 'make_sleeping_bag'],
    desc: 'Teaches: sewn backpack, sleeping bag.',
    cover: { bg: 0xd88ab0, title: 'SEW', titleC: 0xf6f0f4, bandC: 0xa85a84, iconY: 9, icon: ['....n', '...n.', 'rrn..', 'rRr..', 'rrr..'], pal: { n: 0xc8ccd0, r: 0x2a5aa8, R: 0x6a9ae8 } } },
  { key: 'mag_trapping', name: 'Snare & Set', skill: 'trapping', recipes: ['make_trap_box', 'make_snare_wire'],
    desc: 'Teaches: box traps, wire snares.',
    cover: { bg: 0x6a5a3a, title: 'TRAP', titleC: 0xf2e6c8, bandC: 0x3e3420, iconY: 9, icon: ['.ccc.', 'c...c', 'c...c', '.ccc.', '..c..', '..c..'], pal: { c: 0xd8b878 } } },
  { key: 'mag_survival', name: 'Off-Grid Living', skill: 'foraging', recipes: ['make_poultice', 'make_slingshot', 'purify_bleach'],
    desc: 'Teaches: herbal poultice, slingshot, purifying water with bleach.',
    cover: { bg: 0x2a5a4a, title: 'WILD', titleC: 0xf6f0e0, bandC: 0x1a3a30, iconY: 9, icon: ['..o..', '.ooo.', 'oyoyo', 'bbbbb'], pal: { o: 0xe86a1a, y: 0xf6d040, b: 0x7a5a3a } } },
  { key: 'mag_debug', name: 'PATCH NOTES (zine)', skill: 'debugging', recipes: ['make_checksum_pills', 'make_sim_patch', 'charge_battery_static', 'make_glow_jar', 'make_lucid_tea'],
    desc: 'Photocopied zine passed between survivors. Teaches: checksum pills, sim patch, static charging, glow jars, dreamlily tea.',
    cover: { bg: 0x0c0c14, title: 'SYS', titleC: 0x6af06a, iconY: 9, icon: ['.ccc.', 'cmwmc', 'cwkwc', 'cmwmc', '.ccc.'], pal: { c: 0x6af0ff, m: 0xff6ad8, w: 0xf2f2f2, k: 0x0c0c14 } } },
];
for (const m of MAGS) {
  const cover = coverTex('i_cover_' + m.key, m.cover);
  defItem({
    key: m.key, name: m.name, cat: 'literature', weight: 0.2, tags: ['magazine', 'paper', 'tinder'], burn: 0.1, desc: m.desc,
    literature: { skill: m.skill, mult: 1.5, minLevel: 0, recipes: m.recipes, pages: 30, boredom: -10 },
    model: (mb) => slab(mb, 0.21, 0.006, 0.28, cover, T.pages, 0xf2ecdc, { rot: 0.12 }),
  });
}

// ---------------------------------------------------------------- skill books (×3 XP)
const BOOKS: [string, string, string, Cover][] = [
  ['book_carpentry', 'Carpentry for Beginners', 'carpentry', { bg: 0x7a4a2a, title: 'WOOD', titleC: 0xe8c890, iconY: 9, icon: ['ggg..', '.g...', '.g.ww', '...ww'], pal: { g: 0xc8ccd0, w: 0xe8c890 }, stripe: 0xe8c890 }],
  ['book_electrical', 'Electrical Basics', 'electrical', { bg: 0x1a2a5a, title: 'ELEC', titleC: 0xf0c419, iconY: 9, icon: ['..yy', '.yy.', 'yyyy', '.yy.', 'yy..'], pal: { y: 0xf0c419 }, stripe: 0xf0c419 }],
  ['book_firstaid', 'First Aid Manual', 'firstaid', { bg: 0xa8282a, title: 'AID', titleC: 0xf2f2ee, iconY: 9, icon: ['.ww.', 'wwww', 'wwww', '.ww.'], pal: { w: 0xf2f2ee }, stripe: 0xf2f2ee }],
  ['book_farming', 'The Kitchen Garden', 'farming', { bg: 0x2a5a2a, title: 'FARM', titleC: 0xe8e0a8, iconY: 9, icon: ['.g.g', 'gggg', '.oo.', '.oo.'], pal: { g: 0x9ae06a, o: 0xe8862a }, stripe: 0xe8e0a8 }],
  ['book_cooking', 'Cooking Fundamentals', 'cooking', { bg: 0xd8a040, title: 'COOK', titleC: 0x4a2a10, iconY: 9, icon: ['.ww.', 'wwww', 'kkkk', '.kk.'], pal: { w: 0xf6f2ea, k: 0x3a3a40 }, stripe: 0x4a2a10 }],
];
for (const [key, name, skill, cv] of BOOKS) {
  const cover = coverTex('i_cover_' + key, cv);
  defItem({
    key, name, cat: 'literature', weight: 0.8, tags: ['book', 'skillbook', 'paper'], burn: 0.5,
    desc: `Skill book: triple ${skill} experience while it lasts.`,
    literature: { skill, mult: 3, minLevel: 0, pages: 220, boredom: -5 },
    model: (mb) => book(mb, 0.17, 0.24, 0.04, cover, cv.bg, { rot: -0.1 }),
  });
}

// ---------------------------------------------------------------- fiction
const C_NOVEL = coverTex('i_cover_novel', { bg: 0x4a3a6a, title: '', titleC: 0, iconY: 4, icon: ['...yy..', '..y....', '.y.....', '.y.....', '..y....', '...yy..', '.......', 'kkk.kkk', 'kkkkkkk'], pal: { y: 0xf0e0a0, k: 0x2a2040 }, stripe: 0xd8b04a });
defItem({
  key: 'novel', name: 'Novel', cat: 'literature', weight: 0.4, tags: ['book', 'fiction', 'paper'], burn: 0.4,
  desc: 'A paperback about a lighthouse keeper. Absorbing. Hours vanish.',
  literature: { boredom: -40, unhappy: -20, stress: -10, pages: 320 },
  model: (mb) => book(mb, 0.11, 0.18, 0.03, C_NOVEL, 0x4a3a6a, { rot: 0.3, soft: true }),
});
const C_COMIC = coverTex('i_cover_comic', { bg: 0xf0c419, title: 'POW', titleC: 0xc8302a, iconY: 9, icon: ['..bb..', '.bbbb.', '..bb..', '.rbbr.', '.b..b.'], pal: { b: 0x2a5aa8, r: 0xc8302a }, frame: 0x1c1c1c });
defItem({
  key: 'comic', name: 'Comic Book', cat: 'literature', weight: 0.1, tags: ['fiction', 'paper', 'tinder'], burn: 0.1,
  literature: { boredom: -30, unhappy: -15, pages: 32 },
  model: (mb) => slab(mb, 0.17, 0.004, 0.26, C_COMIC, T.pages, 0xf2ecdc, { rot: -0.2 }),
});
const D_NEWS = decal('i_newspaper', 16, 20, (pc) => {
  pc.fill(0xe0dccc);
  txtC(pc, 'NEWS', 8, 1, 0x1c1c1c); pc.hline(1, 14, 7, 0x1c1c1c);
  pc.rect(1, 9, 7, 5, 0x8a8a84); pc.set(3, 10, 0xb8b8b0); pc.rect(4, 12, 3, 1, 0x5a5a56);
  for (let y = 9; y < 19; y += 2) dashes(pc, 9, y, 6, 0x4a4a46, y);
  for (let y = 15; y < 19; y += 2) dashes(pc, 1, y, 7, 0x4a4a46, y + 3);
});
defItem({
  key: 'newspaper', name: 'Newspaper', cat: 'literature', weight: 0.2, tags: ['paper', 'tinder'], burn: 0.15,
  desc: 'Yesterday\'s paper. It is always yesterday\'s paper.',
  literature: { boredom: -12, pages: 16, text: 'LOCAL MAN WALKS INTO STOREROOM, IS STILL WALKING\nInstitute denies "any knowledge of the yellow rooms".\nWeather: fluorescent, humid, 24°C. Tomorrow: the same.' },
  model: (mb) => slab(mb, 0.3, 0.01, 0.38, D_NEWS, T.pages, 0xe0dccc, { rot: 0.15 }),
});
const C_KIDS = decal('i_cover_kids', 16, 20, (pc) => {
  pc.fill(0x9ad8f0);
  pc.rect(0, 14, 16, 6, 0x8ad06a);
  pc.circle(12, 4, 2.4, 0xf6d040);
  pc.rect(3, 9, 7, 6, 0xf6eedc); pc.line(2, 9, 6, 5, 0xd84a3a); pc.line(6, 5, 11, 9, 0xd84a3a); pc.hline(3, 9, 9, 0xd84a3a);
  pc.rect(5, 11, 2, 4, 0x8a5a3a); pc.set(8, 11, 0x2a5aa8);
  for (let x = 1; x < 15; x += 3) pc.set(x, 17, 0xf6a0c4);
  dashes(pc, 2, 1, 7, 0x2a5aa8, 4);
});
defItem({
  key: 'childrens_book', name: 'Children\'s Book', cat: 'literature', weight: 0.3, tags: ['book', 'fiction', 'paper'], burn: 0.2,
  desc: '"The House With Too Many Rooms." A picture book. The last page is a door.',
  literature: { boredom: -12, unhappy: -8, pages: 24, text: 'Pip found a door behind the wallpaper.\nBehind the door was a hallway, yellow as butter.\nThe hallway went on, and on, and on.\nPip was not scared. Pip counted the lights.\nWhen Pip got to the last light, Pip was home.\n(Can YOU count the lights?)' },
  model: (mb) => book(mb, 0.22, 0.22, 0.012, C_KIDS, 0x2a5aa8, { rot: -0.25 }),
});

// ---------------------------------------------------------------- lore documents
const C_JOURNAL = decal('i_cover_journal', 14, 20, (pc) => {
  const R = rp(0x5a3a22, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 1, 3) < 0.25 ? 1 : 0)]));
  pc.strokeRect(1, 1, 12, 18, R[1]);
  pc.rect(11, 8, 3, 4, R[0]); pc.set(12, 9, 0xd8b04a);
  dashes(pc, 3, 4, 7, R[4], 2);
});
defItem({
  key: 'journal', name: 'Survivor\'s Journal', cat: 'lore', weight: 0.3, tags: ['lore', 'paper'], lore: 'journal_survivor', noStack: true,
  desc: 'Water-stained pages in a hurried hand.',
  literature: { boredom: -5, stress: 3, pages: 40, text: 'Day 3. Found almond water in a vending machine that was not plugged in. Tastes like being nine years old.\nDay 9. The hum stops when you are being watched. Learned that the hard way.\nDay 14. Marked the walls with chalk arrows. Came back an hour later and the arrows pointed the other way.\nDay 20. The fields beyond the pool hall have a door standing on its own. It wants a code. Three parts. I have one.\nDay 21. If you are reading this: do not sleep without someone on watch. Do not follow the music.' },
  model: (mb) => book(mb, 0.13, 0.2, 0.025, C_JOURNAL, 0x5a3a22, { rot: 0.4 }),
});
const C_HANDBOOK = decal('i_cover_handbook', 16, 22, (pc) => {
  pc.fill(0xeef2f6);
  pc.rect(0, 0, 3, 22, 0x2a5a9a);
  for (let a = 0; a < 20; a++) { const t = (a / 20) * Math.PI * 2; pc.set(Math.round(9.5 + Math.cos(t) * 3.5), Math.round(7 + Math.sin(t) * 3.5), 0x2a5a9a); }
  txt(pc, 'M', 8, 5, 0x2a5a9a);
  dashes(pc, 5, 13, 9, 0x2a5a9a, 2); dashes(pc, 5, 15, 8, 0x8a9ab0, 3); dashes(pc, 5, 19, 6, 0x8a9ab0, 4);
});
defItem({
  key: 'employee_handbook', name: 'Meridian Employee Handbook', cat: 'lore', weight: 0.4, tags: ['lore', 'paper'], lore: 'handbook_meridian', noStack: true,
  desc: 'MERIDIAN INSTITUTE — Continuity Program — Onboarding Handbook (rev. 7). Teaches: almond water.',
  literature: {
    boredom: 5, pages: 60, recipes: ['make_almond_water'],
    text: 'Welcome to the Meridian Continuity Program!\n\n§1 You are a valued instance. Your comfort is monitored.\n§2 If you find yourself in an unfamiliar corridor, remain calm. All corridors are familiar to someone.\n§3 HYDRATION PROTOCOL: Combine one measure of almond extract with clean water. Drink regularly. Almond water stabilises perception (see Appendix C: "Lucidity").\n§4 Do not attempt to leave the program before your exit code is fully assembled. Partial exits are not supported.\n§5 Fluorescent fixtures are maintained for your benefit. Do not remove the tubes.\n§6 Report any entity that resembles a co-worker. It is not your co-worker.\n\nAppendix C has been torn out.',
  },
  model: (mb) => {
    mb.box(0, 0, 0, 0.24, 0.045, 0.3, T.card, { color: 0x2a5a9a });
    mb.box(0.01, 0.004, 0, 0.21, 0.037, 0.29, { all: T.pages }, { uvScale: 4 });
    mb.flat(0.006, 0.0451, 0, 0.228, 0.29, C_HANDBOOK);
    for (const z of [-0.08, 0, 0.08]) mb.box(-0.112, 0.022, z, 0.016, 0.03, 0.03, 'chrome');
  },
});
const D_MAP = decal('i_map_lobby', 20, 16, (pc) => {
  pc.fill(0xe8dca0);
  pc.each((x, y) => { if (x % 4 === 0 || y % 4 === 0) pc.set(x, y, 0xc8b870); });
  for (const [x, y, w, h] of [[1, 1, 6, 4], [8, 2, 5, 6], [14, 1, 5, 5], [2, 7, 4, 7], [9, 10, 9, 5]]) pc.strokeRect(x, y, w, h, 0x8a6a3a);
  pc.line(4, 5, 4, 8, 0xc8302a); pc.line(4, 8, 11, 8, 0xc8302a); pc.line(11, 8, 11, 11, 0xc8302a);
  stamp(pc, 15, 11, ['x.x', '.x.', 'x.x'], { x: 0xc8302a });
  pc.vline(10, 0, 15, 0xb8a860);
});
defItem({
  key: 'map_lobby', name: 'Map of Sector Yellow', cat: 'literature', weight: 0.05, tags: ['map', 'paper'], lore: 'map_lobby', noStack: true,
  desc: 'Hand-drawn in marker on the back of an office memo. A red route ends in an X. Some rooms are crossed out — "MOVED".',
  literature: { pages: 1, text: 'SECTOR YELLOW (as of last week)\nX = the stairwell door that goes DOWN. Needs the master fuse.\nDO NOT go past the room with the green carpet.' },
  model: (mb) => slab(mb, 0.2, 0.004, 0.16, D_MAP, T.pages, 0xd8cc90, { rot: 0.2 }),
});
const D_NOTEBOOK = decal('i_notebook_cover', 14, 20, (pc) => {
  pc.fill(0xc8a070); pc.each((x, y) => { if (ph(x, y, 5) < 0.1) pc.set(x, y, 0xb08a5a); });
  for (let y = 1; y < 20; y += 2) pc.set(1, y, 0xc8ccd0);
  pc.rect(4, 4, 8, 4, 0xf2ecd8); dashes(pc, 5, 5, 6, 0x5a5a5a, 2);
});
defItem({
  key: 'notebook', name: 'Notebook', cat: 'literature', weight: 0.2, uses: 40, tags: ['paper', 'notebook'], burn: 0.2,
  desc: 'Forty blank pages. Write notes, maps, warnings for the others.',
  model: (mb) => book(mb, 0.15, 0.21, 0.012, D_NOTEBOOK, 0xc8a070, { rot: -0.2, soft: true }),
});
const D_PAPER = decal('i_paper_sheet', 12, 16, (pc) => {
  pc.fill(0xf4f2ec); for (let y = 3; y < 16; y += 2) pc.hline(1, 10, y, 0xd0dcec); pc.vline(2, 0, 15, 0xecc0c0);
});
defItem({
  key: 'paper', name: 'Paper', cat: 'literature', weight: 0.01, tags: ['paper', 'tinder'], burn: 0.05,
  desc: 'A blank sheet. Tinder, notes, paper planes.',
  model: (mb) => slab(mb, 0.21, 0.002, 0.28, D_PAPER, T.pages, 0xf4f2ec, { rot: 0.35 }),
});

void K; void rp; void band; void folded; void txt; void stamp;

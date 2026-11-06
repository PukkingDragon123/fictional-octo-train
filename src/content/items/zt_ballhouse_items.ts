// Items of the Ball House (src/world/gen/z_ballhouse.ts) and its kids
// (src/creatures/species/timmy.ts): the sweets. Every sweet here is food and a
// throwable: wield one and throw it (or drop it) near a Timmy and it goes
// after it, sucks it, hums and forgets you; a swelling one that has not gone
// too far sighs back down. Also what the kids leave behind (the lollipop out
// of a fist, a scrap of head) and the Ball House's loot tables.
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, rp, ph, mixHex, type MB } from './_kit';
import { blob, tube } from '../../creatures/kit/anomalies';

/** a sweet you can throw: no damage, a soft landing, a little noise */
const SWEET_THROW = { kind: 'thrown' as const, dmg: [0, 0] as [number, number], range: 10, speed: 1.1, endurance: 0.01, crit: 0, knock: 0, durability: 1, noise: 3 };

// ------------------------------------------------------------------ textures
const S_SWIRL = tex('i_bx_swirl', 16, 16, (pc) => {
  const cols = [0xff2a4a, 0xfff4f0, 0xffd21a, 0xfff4f0, 0x2a8aff, 0xfff4f0, 0x3ad84a, 0xfff4f0];
  pc.each((x, y) => {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d > 7.6) { pc.set(x, y, 0xd81a3a); return; }
    const s = Math.floor(((a / (Math.PI * 2) + 1) * 4 + d * 0.38) % 8);
    pc.set(x, y, cols[(s + 8) % 8]);
  });
  pc.set(5, 4, 0xffffff); pc.set(6, 4, 0xffffff); pc.set(5, 5, 0xfff8f0);
});
const S_STICK = tex('i_bx_stick', 4, 8, (pc) => pc.each((x, y) => pc.set(x, y, x === 0 ? 0xd8d4c8 : x === 3 ? 0xc8c4b8 : 0xf4f0e8)), true);
const S_GUM = tex('i_bx_gum', 8, 8, (pc) => { const R = rp(0xffffff, 4, 0.2); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 7) < 0.2 ? 1 : 0)])); pc.set(2, 2, 0xffffff); pc.set(3, 2, 0xffffff); }, true);
const S_BEAD = tex('i_bx_bead', 8, 8, (pc) => { const R = rp(0xf0e8f4, 4, 0.25); pc.each((x, y) => pc.set(x, y, R[1 + ((x + y) & 1)])); pc.set(2, 2, 0xffffff); }, true);
const S_TICKET = tex('i_bx_ticket', 16, 8, (pc) => {
  pc.fill(0xd82a2a);
  for (let x = 0; x < 16; x++) { pc.set(x, 0, 0xf0a0a0); pc.set(x, 7, 0x8a1010); }
  for (let y = 1; y < 7; y += 2) { pc.set(0, y, 0x8a1010); pc.set(15, y, 0x8a1010); }
  for (let x = 4; x < 12; x++) pc.set(x, 3, x % 2 ? 0xfff0e0 : 0xffe0c0);
  for (let x = 5; x < 11; x++) pc.set(x, 5, 0xf8d0c0);
}, false);
const S_SKIN = tex('i_bx_membrane', 12, 12, (pc) => {
  const R = rp(0xf0c0b0, 5, 0.35);
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 1, 41) < 0.3 ? 1 : 0) - (ph(x, y, 42) < 0.08 ? 1 : 0)]));
  for (let i = 0; i < 3; i++) { let x = ph(i, 1, 43) * 12, y = ph(i, 2, 43) * 12; for (let k = 0; k < 8; k++) { x += Math.cos(k + i); y += Math.sin(k * 0.7 + i); pc.blend(Math.round(x), Math.round(y), 0x7a8ac8, 0.5); } }
}, true);

// ------------------------------------------------------------------ the sweets
function lolly(mb: MB, r: number, stick: number, tint = 0xffffff) {
  mb.box(0, 0.006, 0.0, 0.007, 0.007, stick, S_STICK, { fit: true });
  mb.push().translate(0, 0.008, stick / 2 + r * 0.9).rotateX(-Math.PI / 2);
  mb.cylinder(0, -0.006, 0, r, 0.012, 14, { sides: 'white', top: S_SWIRL, bottom: S_SWIRL }, { fit: true, color: tint });
  mb.pop();
}
defItem({
  key: 'lollipop', name: 'Swirl Lollipop', cat: 'food', weight: 0.06, tags: ['sweet', 'candy', 'snack', 'thrown', 'distraction'], value: 3,
  food: { hunger: 3, calories: 140, unhappy: -12, boredom: -8, stress: -3, ingredient: 'sweet' },
  weapon: SWEET_THROW,
  desc: 'A big flat swirl lollipop on a paper stick, every colour there is. Throw it near one of the Ball House kids and it will forget about you.',
  model: (mb) => lolly(mb, 0.042, 0.11),
});
defItem({
  key: 'timmy_lollipop', name: "Timmy's Lollipop", cat: 'food', weight: 0.05, tags: ['sweet', 'candy', 'thrown', 'distraction', 'ballhouse'], value: 6,
  food: { hunger: 2, calories: 100, unhappy: 4, boredom: -4, stress: 6, poison: 0.08, ingredient: 'sweet' },
  weapon: SWEET_THROW,
  desc: 'Prised out of a small, sticky fist. Licked down to a lopsided wafer. The kids want this one more than anything else in the world.',
  model: (mb) => { lolly(mb, 0.036, 0.1, 0xe8d8d0); mb.box(0.012, 0.016, 0.1, 0.03, 0.004, 0.022, 'white', { color: 0x9a3a3a }); },
});
defItem({
  key: 'gumball', name: 'Gumballs', cat: 'food', weight: 0.04, tags: ['sweet', 'candy', 'snack', 'thrown', 'distraction'], value: 2,
  food: { hunger: 1, calories: 60, unhappy: -6, boredom: -6, ingredient: 'sweet' },
  weapon: SWEET_THROW,
  desc: 'A fistful of gumballs from a machine that has not been refilled since before you were born. Hard as marbles. They still taste of something.',
  model: (mb) => {
    const cols = [0xff3a5a, 0xffe03a, 0x4ab8ff, 0x6ae05a, 0xffffff, 0xc85aff];
    for (let i = 0; i < 6; i++) { const a = i * 1.1; mb.sphere(Math.cos(a) * 0.022 * (i % 3 ? 1 : 0.4), 0.012 + (i > 3 ? 0.016 : 0), Math.sin(a) * 0.022 * (i % 3 ? 1 : 0.4), 0.012, 6, 4, S_GUM, { fit: true, color: cols[i] }); }
  },
});
defItem({
  key: 'candy_necklace', name: 'Candy Necklace', cat: 'food', weight: 0.05, tags: ['sweet', 'candy', 'snack', 'thrown', 'distraction'], value: 3,
  food: { hunger: 2, calories: 110, unhappy: -9, boredom: -5, ingredient: 'sweet' },
  weapon: SWEET_THROW,
  desc: 'Pastel candy beads on an elastic string. A prize from the counter, for forty tickets. Tastes of chalk and perfume.',
  model: (mb) => {
    const cols = [0xffb0d0, 0xb0e0ff, 0xfff0a0, 0xc0f0c0, 0xe0c0ff];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; mb.cylinder(Math.cos(a) * 0.05, 0.004, Math.sin(a) * 0.04, 0.007, 0.008, 6, S_BEAD, { fit: true, color: cols[i % cols.length] }); }
  },
});
defItem({
  key: 'prize_tickets', name: 'Prize Tickets', cat: 'misc', weight: 0.02, tags: ['ballhouse', 'paper'], value: 1,
  desc: 'A strip of red prize tickets, still folded at the perforations. The prize counter still honours them. Something behind it is still counting.',
  model: (mb) => { for (let i = 0; i < 3; i++) mb.box(0, 0.002 + i * 0.002, (i - 1) * 0.004, 0.055, 0.002, 0.025, S_TICKET, { fit: true }); },
});
defItem({
  key: 'head_membrane', name: 'Head Membrane', cat: 'material', weight: 0.08, tags: ['ballhouse', 'research', 'anomalous'], value: 22,
  desc: 'A sheet of skin from a Timmy\'s head, as thin as a balloon and as stretchy. Blue veins in it. It smells of strawberry. The lab will want it.',
  model: (mb) => {
    blob(mb, [0, 0.01, 0], [0.07, 0.012, 0.05], 10, 4, S_SKIN, { disp: (d, u) => 1 + 0.25 * Math.sin(u * Math.PI * 7) * Math.abs(d[0]) });
    tube(mb, [[0.06, 0.012, 0.01], [0.085, 0.014, 0.02], [0.1, 0.01, 0.018]], 0.006, 5, S_SKIN, { capEnd: true });
  },
});

// ------------------------------------------------------------------ loot
// a popped or deflated kid: whatever was in its pockets
defLoot('creature_timmy', [1, 3], [['timmy_lollipop', 6], ['gumball', 4], ['prize_tickets', 4], ['candy_necklace', 1.5], ['head_membrane', 2.5], ['marbles', 1], ['toy_car', 0.6], ['crayons', 0.8], ['photo_old', 0.3]], 0);
// the prize counter's glass display and its jars
defLoot('bx_prize', [2, 5], [['candy_necklace', 5], ['lollipop', 6], ['gumball', 5], ['candy_bar', 3], ['toy_rubber_duck', 2], ['marbles', 2], ['toy_car', 2], ['teddy_bear', 1], ['jump_rope', 1], ['prize_tickets', 2], ['handheld_game', 0.3]], 0);
defLoot('bx_candy_jar', [2, 4], [['lollipop', 6], ['gumball', 7], ['candy_necklace', 2], ['candy_bar', 2], ['candy_dream', 0.4]], 0);
// the shoe cubbies by the door
defLoot('bx_cubby', [1, 2], [['socks', 6], ['juice_box', 3], ['candy_bar', 1.5], ['toy_car', 1], ['crayons', 1], ['prize_tickets', 2], ['note', 0.6], ['photo_old', 0.5], ['bandage', 0.6]], 0.35);
// what turns up in the ball pits
defLoot('bx_pit', [1, 1], [['socks', 4], ['gumball', 3], ['lollipop', 2], ['prize_tickets', 3], ['marbles', 2], ['toy_car', 1], ['coins', 2], ['bandage', 0.6], ['timmy_lollipop', 0.8], ['head_membrane', 0.4]], 0.55);
// a party room's leftovers
defLoot('bx_party', [1, 3], [['candy_bar', 3], ['lollipop', 3], ['gumball', 2], ['juice_box', 4], ['cookies', 1.5], ['candy_necklace', 1], ['prize_tickets', 1], ['note', 0.5]], 0.3);
// lost and found
defLoot('bx_lost', [2, 5], [['socks', 5], ['teddy_bear', 1], ['doll', 0.8], ['toy_car', 2], ['childrens_book', 1], ['jump_rope', 1], ['juice_box', 1], ['photo_old', 0.8], ['note', 0.6], ['handheld_game', 0.3], ['lollipop', 1]], 0);
void mixHex;

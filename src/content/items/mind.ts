// Items stream — MIND & MONITOR: the wrist monitor every survivor wakes up
// wearing, medication with trade-offs, comfort objects and a night-light.
// Mental effects live in src/survival/mindSystem.ts (keyed by item key/tags):
//   'comfort' tag   — carried: calmer, less lonely; "Use" with it helps more
//   'nightlight'    — satisfies the Night Light trait while sleeping
//   anxiolytics     — calm panic for hours, drowsy, tolerance + rebound
import { defItem } from '../../items/item';
import { lootTable } from '../../items/loot';
import { tex, decal, T, rp, txt, stampC, pillBottle, ph, MB } from './_kit';

// ---------------------------------------------------------------- textures
const D_MONITOR = decal('i_wristmon_face', 14, 10, (pc) => {
  pc.fill(0x3a3e44);
  pc.strokeRect(0, 0, 14, 10, 0x22262a);
  pc.hline(1, 12, 1, 0x5a6068);
  pc.rect(2, 2, 10, 6, 0x1a1206);
  // amber segments: 12:07
  const A = 0xffb238, D = 0x3a2408;
  for (const [x, on] of [[3, 1], [5, 1], [8, 1], [10, 1]] as [number, number][]) { pc.vline(x, 3, 6, on ? A : D); pc.set(x - 1, 3, A); pc.set(x - 1, 6, A); }
  pc.set(7, 4, A); pc.set(7, 6, A);
  pc.set(1, 8, 0xc8302a); pc.set(12, 8, 0x6ac83a);
});
const S_BAND = tex('i_wristmon_band', 4, 8, (pc) => { pc.fill(0x2e2a26); for (let y = 0; y < 8; y += 2) pc.hline(0, 3, y, 0x3e3832); pc.set(1, 1, 0x1e1a18); pc.set(2, 5, 0x1e1a18); }, true);
const L_CALM = tex('i_anxiolytic_label', 16, 8, (pc) => {
  pc.fill(0xf2f0ea); pc.rect(0, 0, 16, 2, 0x3a8a8a); pc.rect(0, 6, 16, 2, 0x3a8a8a);
  txt(pc, 'Rx', 1, 2, 0x1c3a3a); pc.rect(9, 3, 5, 2, 0xa8d8d8);
}, true);
const D_PHOTO = decal('i_family_photo', 12, 10, (pc) => {
  pc.fill(0xf2eee2);
  pc.rect(1, 1, 10, 7, 0x8ab0c8);
  pc.rect(1, 5, 10, 3, 0x6a9a4a);
  // three little people, one small
  stampC(pc, 6, 2, ['h.h.h', 'b.b.b', 'b.b.b'], { h: 0xe8c8a0, b: 0xc8402a });
  pc.set(8, 4, 0x2a5aa8); pc.set(4, 4, 0xe8a020);
  pc.rect(1, 8, 10, 1, 0xf2eee2);
  for (let i = 0; i < 3; i++) pc.set(2 + i * 3, 9, 0x8a8478);
});
const D_CHARM = decal('i_lucky_charm', 8, 8, (pc) => {
  pc.fill(0x000000);
  pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.5); pc.set(x, y, d < 3.6 ? (d > 2.9 ? 0xc8a85a : 0xd8eadc) : 0x000000); });
  stampC(pc, 4, 2, ['g.g', '.g.', 'g.g'], { g: 0x3a9a3a });
  pc.set(4, 5, 0x2a6a2a);
});
const S_MOTH = tex('i_plush_moth', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 9) < 0.3 ? 0xd8cfb8 : 0xe8e0c8)), true);
const D_MOTH_WING = decal('i_plush_moth_wing', 12, 8, (pc) => {
  const R = rp(0xb8a8d8, 4, 0.4);
  pc.fill(R[2]);
  pc.each((x, y) => { if (Math.hypot(x - 3, y - 4) < 2 || Math.hypot(x - 8, y - 4) < 2) pc.set(x, y, R[3]); });
  pc.set(3, 4, 0x4a3a6a); pc.set(8, 4, 0x4a3a6a);
  pc.strokeRect(0, 0, 12, 8, R[0]);
});
const S_STONE = tex('i_worry_stone', 8, 8, (pc) => { const R = rp(0x7a8a8c, 5, 0.35); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 2) < 0.2 ? 1 : 0) - (ph(x >> 1, y >> 1, 3) < 0.15 ? 1 : 0)])); pc.set(3, 3, R[4]); }, true);
const D_NIGHTLIGHT = decal('i_nightlight_face', 10, 10, (pc) => {
  pc.fill(0x000000);
  stampC(pc, 5, 1, ['....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '.yyy.yyy.', 'yy.....yy'], { y: 0xffe28a });
  pc.set(4, 4, 0x8a6a2a); pc.set(6, 4, 0x8a6a2a);
});
const D_PAMPHLET = decal('i_wellness_pamphlet', 12, 16, (pc) => {
  pc.fill(0xeaf2ee); pc.rect(0, 0, 12, 4, 0x3a8a7a);
  txt(pc, 'OK', 3, 0, 0xeaf2ee);
  pc.each((x, y) => { if (Math.hypot(x - 6, y - 9) < 3.2) pc.set(x, y, 0xf0c060); });
  pc.set(5, 8, 0x5a4a2a); pc.set(7, 8, 0x5a4a2a); pc.hline(5, 7, 10, 0x5a4a2a);
  for (let y = 13; y < 15; y++) pc.hline(1, 10, y, 0xa8b8b0);
});
const D_CARD = decal('i_breathing_card', 14, 10, (pc) => {
  pc.fill(0xf6f2e6); pc.strokeRect(0, 0, 14, 10, 0x6a9ac8);
  pc.strokeRect(3, 2, 6, 6, 0x2a5a8a);
  pc.set(10, 2, 0x2a5a8a); pc.set(11, 3, 0x2a5a8a); pc.set(10, 7, 0x2a5a8a);
  pc.set(3, 2, 0xc8402a);
});

// ---------------------------------------------------------------- the wrist monitor
defItem({
  key: 'wrist_monitor', name: 'Wrist Monitor', cat: 'electronics', weight: 0.12, tags: ['watch', 'monitor'], noStack: true,
  desc: 'A chunky KESTREL WM-7 survival monitor, Meridian issue, strapped to your wrist when you woke. Clock, alarm, heart rate, body temperature, breathing, a mood read-out and a compass. Kinetic charging. Splash-proof, not swim-proof: soak it and it fogs up and fails. Take it off and repair it with a screwdriver and some electronics scrap.',
  clothing: { slot: 'wrist', covers: [], insulation: 0, wind: 0, bite: 3, scratch: 3, water: 0.3, look: undefined as any },
  value: 6,
  model: (mb: MB) => {
    mb.box(0, 0, 0, 0.05, 0.016, 0.04, T.plastic, { color: 0x4a4e54 });
    mb.flat(0, 0.0162, 0, 0.044, 0.034, D_MONITOR, { emissive: 0.6 });
    for (const s of [-1, 1]) {
      mb.box(0, 0.002, s * 0.045, 0.026, 0.006, 0.05, S_BAND, { color: 0xffffff });
      mb.box(s * 0.027, 0.006, -0.008, 0.006, 0.006, 0.01, T.metal, { color: 0xc8c8c0 });
    }
    mb.box(0, 0.002, 0.072, 0.03, 0.008, 0.008, T.metal, { color: 0xb8b8b0 });
  },
});

// ---------------------------------------------------------------- medication
defItem({
  // medical type 'anxiolytic' is unknown to PillAction (it only spends a dose); mindSystem applies the effect when "Take" completes
  key: 'anxiolytics', name: 'Anxiolytic Tablets', cat: 'medical', weight: 0.08, uses: 10, tags: ['pills', 'meds_mind'],
  medical: { type: 'anxiolytic' as any },
  desc: 'Prescription calmers. Quiets panic within minutes and keeps it down for a few hours, but makes you drowsy. Take them often and they work less, and the anxiety comes back harder when you stop.',
  model: (mb: MB) => pillBottle(mb, L_CALM, 0xf2f0ea, 0x3a8a8a),
});

// ---------------------------------------------------------------- comfort objects
defItem({
  key: 'family_photo', name: 'Family Photo', cat: 'misc', weight: 0.02, tags: ['comfort', 'entertain', 'paper'], noStack: true,
  desc: 'A creased photo of people you are sure you know. Carrying it makes the loneliness lighter; looking at it for a while helps more.',
  model: (mb: MB) => { mb.box(0, 0, 0, 0.09, 0.002, 0.07, T.white, { color: 0xf2eee2 }); mb.flat(0, 0.0021, 0, 0.09, 0.07, D_PHOTO); },
});
defItem({
  key: 'lucky_charm', name: 'Lucky Charm', cat: 'misc', weight: 0.02, tags: ['comfort', 'jewelry'],
  desc: 'A four-leaf clover set in a resin coin, on a keyring. Turning it over in your fingers steadies them.',
  model: (mb: MB) => {
    mb.cylinder(0, 0, 0, 0.018, 0.005, 10, { sides: T.metal, top: D_CHARM, bottom: T.metal }, { fit: { top: true }, color: 0xffffff });
    mb.box(0, 0.002, -0.026, 0.004, 0.003, 0.016, T.metal, { color: 0xc8c8c0 });
  },
});
defItem({
  key: 'plush_moth', name: 'Moth Plush', cat: 'misc', weight: 0.25, tags: ['toy', 'comfort', 'entertain'],
  desc: 'A soft, slightly lumpy moth with felt antennae. Somebody made it by hand. It is very hard to feel alone holding it.',
  model: (mb: MB) => {
    mb.sphere(0, 0.04, 0, 0.035, 8, 6, S_MOTH, { sy: 1.3, fit: true });
    mb.sphere(0, 0.095, 0.01, 0.028, 8, 6, S_MOTH, { fit: true });
    for (const s of [-1, 1]) {
      mb.push().translate(s * 0.05, 0.06, -0.005).rotateZ(s * 0.35);
      mb.box(0, -0.03, 0, 0.06, 0.06, 0.008, D_MOTH_WING, { fit: true });
      mb.pop();
      mb.box(s * 0.012, 0.1, 0.034, 0.008, 0.008, 0.004, T.black);
      mb.box(s * 0.012, 0.125, 0.012, 0.004, 0.03, 0.004, T.black, { color: 0x4a3a2a });
    }
  },
});
defItem({
  key: 'worry_stone', name: 'Worry Stone', cat: 'misc', weight: 0.08, tags: ['comfort', 'entertain'],
  desc: 'A flat, smooth stone with a thumb-shaped dip worn into it. Rubbing it is oddly calming.',
  model: (mb: MB) => mb.sphere(0, 0.01, 0, 0.025, 8, 5, S_STONE, { sy: 0.4, fit: true }),
});
defItem({
  key: 'nightlight', name: 'Battery Night-Light', cat: 'electronics', weight: 0.15, battery: true, uses: 1, tags: ['nightlight', 'comfort'],
  desc: 'A little star-shaped lamp from a child\'s room. Too dim to see by, bright enough to sleep by. Drains slowly while you sleep.',
  model: (mb: MB) => {
    mb.box(0, 0, 0, 0.07, 0.012, 0.03, T.plastic, { color: 0xf2f0ea });
    mb.panel(-0.035, 0.0151, 0.035, 0.0151, 0.012, 0.08, D_NIGHTLIGHT, { fit: true, emissive: 1.2 });
  },
});

// ---------------------------------------------------------------- reading
defItem({
  key: 'wellness_pamphlet', name: 'Wellness Pamphlet', cat: 'lore', weight: 0.02, tags: ['lore', 'paper', 'tinder'], lore: 'pamphlet_wellness', noStack: true, burn: 0.05,
  model: (mb: MB) => { mb.box(0, 0, 0, 0.07, 0.003, 0.1, T.white, { color: 0xeaf2ee }); mb.flat(0, 0.0031, 0, 0.07, 0.1, D_PAMPHLET); },
});
defItem({
  key: 'breathing_card', name: 'Laminated Card', cat: 'lore', weight: 0.01, tags: ['lore', 'paper'], lore: 'card_breathing', noStack: true,
  model: (mb: MB) => { mb.box(0, 0, 0, 0.085, 0.002, 0.055, T.white, { color: 0xf6f2e6 }); mb.flat(0, 0.0021, 0, 0.085, 0.055, D_CARD); },
});
defItem({
  key: 'kestrel_manual', name: 'KESTREL WM-7 Manual', cat: 'lore', weight: 0.05, tags: ['lore', 'paper', 'tinder'], lore: 'manual_kestrel', noStack: true, burn: 0.05,
  model: (mb: MB) => { mb.box(0, 0, 0, 0.06, 0.004, 0.08, T.white, { color: 0xd8d4c8 }); mb.flat(0, 0.0041, 0, 0.06, 0.08, D_MONITOR); },
});

// ---------------------------------------------------------------- loot: slot the new things into existing tables
// (runs after every content module has registered its tables)
queueMicrotask(() => {
  const add = (table: string, entry: [string, number, number?, number?]) => { const t = lootTable(table); if (t && !t.entries.some((e) => e[0] === entry[0])) t.entries.push(entry as any); };
  add('meds_rx', ['anxiolytics', 4]);
  add('hospital_pharmacy', ['anxiolytics', 3]);
  add('bathroom_cabinet', ['anxiolytics', 0.6]);
  add('nightstand', ['family_photo', 1.2]);
  add('nightstand', ['worry_stone', 0.6]);
  add('nightstand', ['nightlight', 0.8]);
  add('bedroom_dresser', ['family_photo', 1]);
  add('survivor_corpse', ['family_photo', 2]);
  add('survivor_corpse', ['wrist_monitor', 1]);
  add('car_glovebox', ['lucky_charm', 2]);
  add('junk', ['lucky_charm', 0.6]);
  add('creature_nest', ['lucky_charm', 0.6]);
  add('toys', ['plush_moth', 3]);
  add('kids_room', ['plush_moth', 2]);
  add('kids_room', ['nightlight', 3]);
  add('electronics_small', ['nightlight', 1]);
  add('electronics_small', ['wrist_monitor', 0.4]);
  add('security_office', ['wrist_monitor', 1]);
  add('morgue', ['wrist_monitor', 1]);
  add('break_room', ['wellness_pamphlet', 2]);
  add('break_room', ['breathing_card', 1]);
  add('office_desk', ['wellness_pamphlet', 0.6]);
  add('office_desk', ['worry_stone', 0.4]);
  add('school_desk', ['breathing_card', 0.4]);
  add('lore_bits', ['wellness_pamphlet', 1]);
  add('lore_bits', ['kestrel_manual', 0.6]);
});

// The four survivor factions of the Backrooms: who they are, how they look,
// what they say, what they trade and where they camp. Original content.
//  - THE TALLYMEN: scavengers who count everything (the dead most of all).
//  - THE WAXEN CHOIR: masked in candle wax, they worship the Still Lifes.
//  - THE TURNKEYS: Meridian custody officers who deserted into the rooms.
//  - THE SPROCKET CONGREGATION: machine worshippers; they wire minds into meat.
import type { Appearance, Outfit } from '../entities/humanRig';
import { HAIR_COLORS, SKIN_TONES } from '../entities/humanRig';
import type { ModelBuilder } from '../gfx/modelBuilder';
import { GUARD_GREY } from '../content/items/prisoner';

export type TribeKey = 'tally' | 'wax' | 'turnkey' | 'cog';
export const TRIBE_KEYS: TribeKey[] = ['tally', 'wax', 'turnkey', 'cog'];

export interface TribeLines { greet: string[]; trade: string[]; hostile: string[]; hurt: string[]; recruit: string[]; idle: string[]; raid: string[]; bye: string[]; follow: string[] }
export interface TribeDef {
  key: TribeKey;
  name: string;
  member: string;
  /** css accent / 3D accent */
  color: number; accent: number; css: string;
  /** main camp zone first, then outposts */
  camps: { zone: string; size: number }[];
  app(r: () => number): Appearance;
  outfit(r: () => number): Outfit;
  /** head gear built onto the head joint (head-local metres, face +z) */
  head(mb: ModelBuilder, v: number): void;
  /** extra gear on a joint */
  gear?: { joint: 'uarmL' | 'uarmR' | 'chest' | 'hips'; build: (mb: ModelBuilder, v: number) => void };
  weapon: string; weaponKind: string;
  names: string[];
  lines: TribeLines;
  /** [item key, minimum standing to be offered] */
  wares: [string, number][];
  /** item categories / tags they pay extra for */
  wants: string[];
  startRep: number;
  rival: TribeKey;
  hp: number;
  dmg: [number, number];
  lore: { cls: string; notes: string[] };
}

const pick = <T>(r: () => number, a: T[]) => a[Math.floor(r() * a.length) % a.length];
const app = (r: () => number, o: Partial<Appearance> = {}): Appearance => ({
  skin: pick(r, SKIN_TONES), hair: pick(r, HAIR_COLORS), hairStyle: pick(r, ['short', 'long', 'buzz', 'bald', 'ponytail', 'curly', 'bob'] as const), face: Math.floor(r() * 6),
  build: pick(r, ['slim', 'average', 'broad'] as const), height: 0.95 + r() * 0.1, bodyShape: r(), facialHair: pick(r, ['none', 'stubble', 'beard', 'none'] as const), age: 0.2 + r() * 0.6, scars: Math.floor(r() * 3), ...o,
});
const dim = (c: number, f: number) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

export const TRIBES: Record<TribeKey, TribeDef> = {
  tally: {
    key: 'tally', name: 'The Tallymen', member: 'Tallyman', color: 0xe0a020, accent: 0xf2f0e8, css: '#e8a62a',
    camps: [{ zone: 'market', size: 5 }, { zone: 'lobby', size: 2 }],
    app: (r) => app(r),
    outfit: (r) => ({
      torso: { tex: 'c_shirt', color: dim(0x7a6a52, 0.8 + r() * 0.3), sleeve: 'long' },
      torsoOuter: { tex: 'c_vest_hiviz', color: dim(0xe0a020, 0.75 + r() * 0.25), sleeve: 'none', wear: 0.6 },
      legs: { tex: 'c_jeans', color: dim(0x3c3e4c, 0.8 + r() * 0.3), wear: 0.5 }, legsKind: 'pants',
      feet: { tex: 'c_shoes_boot', color: 0x3a2a1a }, hands: { tex: 'c_gloves', color: 0x5a4a30 },
      head: r() < 0.6 ? { tex: 'c_beanie', color: pick(r, [0x8a3a20, 0x3a4a2a, 0x5a5a5a]), hat: 'beanie' } : undefined,
      back: { tex: 'c_backpack', color: 0x5a4a32, size: 1.1 },
    }),
    head: (mb) => {
      // a forehead strap of bottle caps and white tally ticks
      mb.box(0, 0.115, 0.0, 0.205, 0.03, 0.215, 'leather_brown', { color: 0x4a3420 });
      for (let i = 0; i < 5; i++) mb.box(-0.06 + i * 0.03, 0.118, 0.107, 0.006, 0.026, 0.004, 'white', { color: 0xf2f0e8 });
      mb.box(0, 0.118, 0.108, 0.14, 0.004, 0.004, 'white', { color: 0xf2f0e8 });
      for (const s of [-1, 1]) mb.cylinder(s * 0.1, 0.11, 0.05, 0.014, 0.006, 8, 'metal_brass', { color: 0xc8a040 });
    },
    gear: { joint: 'chest', build: (mb) => { for (let i = 0; i < 3; i++) mb.box(0.09 - i * 0.03, -0.02 - i * 0.02, 0.13, 0.024, 0.03, 0.018, 'metal_rusty'); } },
    weapon: 'pipe_lead', weaponKind: 'blunt',
    names: ['Ninety', 'Tuesday-Count', 'Ledger Jo', 'Fourteen', 'Abacus', 'Mags', 'Tick', 'Old Sixty', 'Penny Tally', 'Dozen'],
    lines: {
      greet: ['Forty-one, forty-two... and you. You make forty-three.', "Another debtor. We don't count debts. We count what's left.", 'Hands where I can count them.'],
      trade: ['Everything has a number. Let us find yours.', 'Put it on the cloth. We weigh, we count, we chalk it.', "Fair count. Nobody's ever cheated a Tallyman twice."],
      hostile: ["You're off the tally.", 'Strike them out!', 'One less. Make it one less!'],
      hurt: ['That gets counted!', 'You owe us for that.', 'Mark it! Mark it on the wall!'],
      recruit: ["I'll walk with you. Someone has to keep your count honest."],
      idle: ['Two hundred and nine chairs in the east wing. Still two hundred and nine.', 'The lights hum in a number. I am close to it.', 'Count your steps. The rooms cheat.'],
      raid: ['There! The one who struck us out!', 'Take back what they owe!'],
      bye: ['Stay countable.', 'Mind the loops.'],
      follow: ['Fifty steps. Fifty-one.', 'I count three exits. Two are lying.'],
    },
    wares: [['canned_beans', -12], ['canned_spam', -12], ['crackers', -12], ['almond_water', -12], ['duct_tape', -12], ['rope', -12], ['battery', -12], ['flashlight', 0], ['crowbar', 0], ['hammer', -12], ['bandage', -12], ['lighter', 0], ['kit_crate', 12], ['bolt_cutters', 40]],
    wants: ['food', 'material', 'battery', 'tool'],
    startRep: 6, rival: 'turnkey', hp: 55, dmg: [6, 11],
    lore: { cls: 'Scavenger clan', notes: ['They count everything: rooms, chairs, steps, the dead. A thing counted cannot be lost, they say.', 'Their tallies are chalked on every wall they pass. Follow the chalk and you find their camps.', 'They trade fair and remember every slight. Every one.'] },
  },
  wax: {
    key: 'wax', name: 'The Waxen Choir', member: 'Chorister', color: 0xe8dcc4, accent: 0xffb050, css: '#efe1c2',
    camps: [{ zone: 'suburbs', size: 5 }],
    app: (r) => app(r, { hairStyle: pick(r, ['bald', 'long', 'bob'] as const), facialHair: 'none' }),
    outfit: (r) => ({
      torso: { tex: 'c_coat', color: dim(0xe8dcc4, 0.88 + r() * 0.12), sleeve: 'long' },
      legs: { tex: 'c_skirt', color: dim(0xdcd0b6, 0.88 + r() * 0.12) }, legsKind: 'skirt',
      feet: { tex: 'c_shoes', color: 0xc8bca6 },
      head: { tex: 'c_beanie', color: 0xe4d8c0, hat: 'beanie' },
    }),
    head: (mb, v) => {
      // a blank wax mask with dribbles, a crown of three lit candles
      mb.box(0, 0.06, 0.112, 0.16, 0.2, 0.02, 'white', { color: 0xf0e6d0 });
      for (const s of [-1, 1]) mb.box(s * 0.035, 0.085, 0.123, 0.016, 0.006, 0.004, 'plastic_black');
      mb.box(0, 0.02, 0.123, 0.03, 0.003, 0.004, 'plastic_black');
      for (let i = 0; i < 4; i++) mb.box(-0.06 + i * 0.04, -0.045 - (i % 2) * 0.02, 0.118, 0.012, 0.03 + (i % 2) * 0.03, 0.012, 'white', { color: 0xe8dcc4 });
      for (let i = 0; i < 3; i++) {
        const a = -0.6 + i * 0.6, x = Math.sin(a) * 0.07, z = Math.cos(a) * 0.04 - 0.01;
        const h = 0.07 + ((i + v) % 3) * 0.025;
        mb.cylinder(x, 0.2, z, 0.014, h, 6, 'white', { color: 0xf4ecd8 });
        mb.cylinder(x, 0.2 + h, z, 0.01, 0.035, 5, 'white', { rTop: 0, color: 0xffb040, emissive: 2.2, caps: false });
      }
    },
    weapon: 'knife_kitchen', weaponKind: 'blade',
    names: ['Sister Tallow', 'Brother Wick', 'The Pale Alto', 'Mother Seam', 'Quiet Ezra', 'Candlemas', 'Little Drip', 'Deacon Stillwater', 'Hush'],
    lines: {
      greet: ['Be still, and be kept.', 'You move so much. Does it not hurt?', 'The Still Ones saw you come in. They see everything that moves.'],
      trade: ['We give what keeps. Wax for the wound, sleep for the mind.', 'Bring us faces. Photographs. We keep them warm.', 'Take what you need. Stillness is patient.'],
      hostile: ['Hold them still!', 'Pour the wax!', 'Be kept. Be KEPT.'],
      hurt: ['You crack the cast!', 'No, no, no, hold still!'],
      recruit: ['I will walk beside you, and keep you, when you stop.'],
      idle: ['Hm-mm-mmm... (a hymn with no tune)', 'The table is laid. Someone will sit.', 'Every face is a mould for the next one.'],
      raid: ['There, the restless one!', 'Make them still for the table!'],
      bye: ['Go gently. Go slowly.', 'We will set a place for you.'],
      follow: ['You walk so loudly.', 'Stop a moment. Just one.'],
    },
    wares: [['candle', -12], ['painkillers', -12], ['sleeping_pills', 0], ['anxiolytics', 0], ['bandage', -12], ['disinfectant', -12], ['suture_needle', 0], ['lucid_tea', 12], ['worry_stone', 0], ['first_aid_kit', 30]],
    wants: ['medical', 'photo_old', 'family_photo', 'candle', 'lore'],
    startRep: 0, rival: 'cog', hp: 50, dmg: [5, 10],
    lore: { cls: 'Wax-masked cult', notes: ['They pour wax over their faces until there is no face. They say the Still Lifes are saints.', 'They are gentle healers and patient trackers. They do not like things that move too much.', 'Their camps are laid like dinner parties for guests that never arrive.'] },
  },
  turnkey: {
    key: 'turnkey', name: 'The Turnkeys', member: 'Turnkey', color: 0x62686a, accent: 0xc82a20, css: '#c8463a',
    camps: [{ zone: 'depot', size: 5 }],
    app: (r) => app(r, { build: pick(r, ['average', 'broad', 'broad'] as const), hairStyle: pick(r, ['buzz', 'short', 'bald'] as const) }),
    outfit: (r) => ({
      torso: { tex: 'c_guard', color: dim(GUARD_GREY, 0.85 + r() * 0.2), sleeve: 'long', item: 'guard_uniform', wear: 0.5 },
      legs: { tex: 'c_guard', color: dim(GUARD_GREY, 0.8), item: 'guard_uniform', wear: 0.4 }, legsKind: 'pants',
      feet: { tex: 'c_shoes_boot', color: 0x1c1a18 }, hands: { tex: 'c_gloves', color: 0x1a1a1c },
      head: r() < 0.7 ? { tex: 'c_riot_helmet', color: 0x2e3236, hat: 'helmet', item: 'riot_helmet' } : undefined,
    }),
    head: (mb) => {
      // the visor shoved up, cracked; a chalked-out badge number on it
      mb.push().translate(0, 0.19, 0.06).rotateX(-1.05);
      mb.box(0, 0, 0, 0.17, 0.12, 0.016, 'glass_dark', { color: 0x3a4250 });
      mb.box(0.02, 0.01, 0.009, 0.08, 0.004, 0.003, 'white', { color: 0xd8d8d0 });
      mb.pop();
    },
    gear: { joint: 'uarmL', build: (mb) => { mb.cylinder(0, -0.08, 0, 0.052, 0.05, 8, 'fabric_red', { color: 0xc82a20 }); } },
    weapon: 'custody_baton', weaponKind: 'blunt',
    names: ['Sergeant Nobody', 'Ex-Officer Brand', 'Keys', 'Unit Nine', 'Halloran', 'Quartermaster Deel', 'Second Shift', 'Riot', 'Corporal Ash'],
    lines: {
      greet: ['Badge number voided. Same as your number, soon.', "Relax, debtor. We don't work for them any more.", 'Stand easy. State your business.'],
      trade: ['Requisition is open. Pay up front.', 'Institute-issue. Liberated. Still works.', 'You want a baton? I know how to use one. Learned on people like you.'],
      hostile: ['Code Black! Put them down!', 'Batons out!', 'Stop resisting!'],
      hurt: ['Officer down!', 'Assault on a Turnkey! Noted!'],
      recruit: ['One of ours will escort you. Old habit.'],
      idle: ['The band on your wrist? We fitted a thousand. Never one that came off clean.', 'Voss? Voss is a recording. Always was.', 'Shift change was nine years ago. Nobody relieved us.'],
      raid: ['Contact! The debtor!', 'Cuff them or kill them!'],
      bye: ['Dismissed.', 'Keep your head down, debtor.'],
      follow: ['Clear left.', 'I hate this posting.'],
    },
    wares: [['custody_baton', -12], ['knife_hunting', 0], ['machete', 12], ['riot_helmet', 12], ['guard_uniform', 0], ['painkillers', -12], ['adrenaline', 12], ['flare', -12], ['ammo_9mm', 25], ['pistol', 40], ['bolt_cutters', 25]],
    wants: ['weapon', 'ammo', 'food', 'drink'],
    startRep: -4, rival: 'tally', hp: 70, dmg: [7, 13],
    lore: { cls: 'Deserted custody officers', notes: ['Meridian guards who walked through the Seam after the debtors and never walked back.', 'They still keep ranks, rotas and a requisition desk. Nobody signs anything.', 'They know how the BAILIFF band is built. They will not say.'] },
  },
  cog: {
    key: 'cog', name: 'The Sprocket Congregation', member: 'Sprocket', color: 0x4a3a2a, accent: 0xffa040, css: '#9ce07a',
    camps: [{ zone: 'tunnels', size: 5 }, { zone: 'office', size: 2 }],
    app: (r) => app(r, { hairStyle: pick(r, ['buzz', 'bald', 'short'] as const) }),
    outfit: (r) => ({
      torso: { tex: 'c_uniform', color: dim(0x4a3a2a, 0.8 + r() * 0.3), sleeve: 'long', wear: 0.7 },
      legs: { tex: 'c_uniform', color: dim(0x3a2e22, 0.8 + r() * 0.3), wear: 0.7 }, legsKind: 'pants',
      feet: { tex: 'c_shoes_boot', color: 0x241c14 }, hands: { tex: 'c_gloves', color: 0x2a2a2a },
      cond: { dirt: 2 },
    }),
    head: (mb, v) => {
      // welding goggles with amber lenses and a copper-wire halo of little filament bulbs
      mb.box(0, 0.075, 0.105, 0.17, 0.035, 0.02, 'rubber_black');
      for (const s of [-1, 1]) { mb.cylinder(s * 0.04, 0.075, 0.12, 0.024, 0.02, 8, 'metal_dark'); mb.box(s * 0.04, 0.075, 0.131, 0.03, 0.03, 0.004, 'glass', { color: 0xc87a2a, emissive: 0.5 }); }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        mb.box(Math.cos(a) * 0.12, 0.26 + Math.sin(a * 3 + v) * 0.01, Math.sin(a) * 0.12, 0.02, 0.008, 0.02, 'metal_brass', { color: 0xc87a3a });
        if (i % 3 === 0) mb.sphere(Math.cos(a) * 0.12, 0.275, Math.sin(a) * 0.12, 0.009, 6, 4, 'white', { color: 0xffb050, emissive: 1.6 });
      }
    },
    gear: { joint: 'chest', build: (mb) => { mb.box(0, 0.02, -0.15, 0.16, 0.2, 0.06, 'metal_dark'); mb.box(0, 0.06, -0.185, 0.1, 0.03, 0.01, 'metal_brass'); for (let i = 0; i < 2; i++) mb.cylinder(-0.03 + i * 0.06, 0.09, -0.15, 0.012, 0.05, 6, 'glass', { color: 0xd8e0d8 }), mb.box(-0.03 + i * 0.06, 0.11, -0.15, 0.006, 0.02, 0.006, 'white', { color: 0xffa040, emissive: 1.6 }); for (const s of [-1, 1]) mb.cylinder(s * 0.06, 0.13, -0.15, 0.012, 0.12, 5, 'metal_grey'); } },
    weapon: 'wrench', weaponKind: 'blunt',
    names: ['Deacon Ohm', 'Sister Solder', 'Fan-Speaker', 'Relay', 'Capacitor Ruth', 'The Grounded', 'Little Diode', 'Brother Firmware', 'Reboot'],
    lines: {
      greet: ['The fan turns. The fan turns. Welcome, warm thing.', 'You carry a band of Institute iron. Crude. Beautiful.', 'Do you hear it? Under the hum? That is a mind waiting for a body.'],
      trade: ['We sell minds. Small ones. Bring us copper and charge.', 'A cortex valve: put it where the meat was, and the meat will listen.', 'Parts for prayers. Prayers for parts.'],
      hostile: ['Disassemble them!', 'Short them out!', 'Return them to scrap!'],
      hurt: ['Fault! Fault!', 'You damage a vessel of the current!'],
      recruit: ['I will come. I want to see what you wire.'],
      idle: ['Every light in this place is a prayer someone forgot to finish.', 'The meat dreams. The machine does not. We prefer the machine.', 'Praise the heat sink. Praise the ground.'],
      raid: ['There, the unbeliever!', 'Strip them for parts!'],
      bye: ['Stay grounded.', 'May your current be steady.'],
      follow: ['There is a generator two rooms away. I can taste it.', 'Your thralls hum in a lovely key.'],
    },
    wares: [['brain_mk1', -12], ['data_probe', -12], ['wire', -12], ['electronics_scrap', -12], ['power_bank', 0], ['battery', -12], ['multimeter', 0], ['soldering_iron', 12], ['screwdriver', -12], ['glowstick', -12], ['brain_mk2', 35]],
    wants: ['electronics', 'battery', 'material', 'anomaly'],
    startRep: 2, rival: 'wax', hp: 55, dmg: [6, 12],
    lore: { cls: 'Machine worshippers', notes: ['They believe the Backrooms are a machine that has not finished booting, and that minds are better in metal.', 'They build mechanical brains and will sell you one. What you put it in is your business.', 'Their camps hum. Their eyes glow amber behind welding glass.'] },
  },
};

export const tribeOf = (k: string): TribeDef | undefined => (TRIBES as Record<string, TribeDef>)[k];
export function standing(rep: number): { label: string; cls: string } {
  if (rep < -40) return { label: 'BLOOD FEUD', cls: 'feud' };
  if (rep < -12) return { label: 'HOSTILE', cls: 'hostile' };
  if (rep < 12) return { label: 'WARY', cls: 'wary' };
  if (rep < 40) return { label: 'FRIENDLY', cls: 'friendly' };
  return { label: 'KIN', cls: 'kin' };
}

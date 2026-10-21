// Tribe work (category 'tribe'): each faction uploads jobs to the watch once
// you have met them. Rewards pay research, goods and standing.
import { defQuest } from '../game/quests';
import { G } from '../game/G';
import { grantNode } from '../game/research';
import { TRIBES, type TribeKey } from './defs';

const tr = () => G.tribes;
const have = (key: string, n: number) => () => Math.min(1, (G.local?.allItems?.().filter((i: any) => i.key === key).length ?? 0) / n);
const stat = (k: string, n: number) => () => Math.min(1, (tr()?.stat(k) ?? 0) / n);
const rep = (t: TribeKey, n: number) => () => tr()?.bumpRep(t, n, 'job done');
const met = (t: TribeKey) => [`flag:tribe:${t}:met`];
const giver = (t: TribeKey) => TRIBES[t].name.toUpperCase();

// ---- the Tallymen
defQuest({ key: 'tribe_tally_count', category: 'tribe', giver: giver('tally'), requires: met('tally'), title: 'The Count',
  desc: 'The Tallymen keep the count of the dead. Add three hostile things to it, any way you like.',
  objectives: [{ id: 'kills', text: 'Kill hostile creatures (3)', check: stat('kills_hostile', 3) }],
  reward: { rp: 6, items: [['canned_spam', 2], ['almond_water', 1]] }, onComplete: rep('tally', 12) });
defQuest({ key: 'tribe_tally_haul', category: 'tribe', giver: giver('tally'), requires: ['tribe_tally_count'], title: 'Shoulder the Load',
  desc: 'Bring four pieces of scrap metal to a Tallyman. They are building a wall that counts its own bricks.',
  objectives: [{ id: 'scrap', text: 'Carry scrap metal (4)', check: have('scrap_metal', 4) }],
  cost: { items: [['scrap_metal', 4]] }, reward: { rp: 5, items: [['crowbar', 1]] }, onComplete: rep('tally', 10) });

// ---- the Waxen Choir
defQuest({ key: 'tribe_wax_still', category: 'tribe', giver: giver('wax'), requires: met('wax'), title: 'Sit With the Still',
  desc: 'Find one of the Still Lifes and scan it. The Choir wants to know whose face it borrowed.',
  objectives: [{ id: 'scan', text: 'Scan a Still Life', check: () => !!G.scan?.known?.('creature', 'still_life') }],
  reward: { rp: 8, items: [['candle', 2], ['anxiolytics', 1]] }, onComplete: rep('wax', 12) });
defQuest({ key: 'tribe_wax_face', category: 'tribe', giver: giver('wax'), requires: ['tribe_wax_still'], title: 'A Face for the Wall',
  desc: 'Bring the Choir an old photograph. They melt a mask for every face they are given.',
  objectives: [{ id: 'photo', text: 'Carry an old photograph', check: have('photo_old', 1) }],
  cost: { items: [['photo_old', 1]] }, reward: { rp: 5, items: [['first_aid_kit', 1]] }, onComplete: rep('wax', 10) });

// ---- the Turnkeys
defQuest({ key: 'tribe_turnkey_yard', category: 'tribe', giver: giver('turnkey'), requires: met('turnkey'), title: 'Clear the Yard',
  desc: 'Grinhounds have been worrying the depot. Put two of them down and the Turnkeys will log you as an asset.',
  objectives: [{ id: 'hounds', text: 'Kill Grinhounds (2)', check: stat('kill:grinhound', 2) }],
  reward: { rp: 6, items: [['painkillers', 1], ['custody_baton', 1]] }, onComplete: rep('turnkey', 12) });
defQuest({ key: 'tribe_turnkey_survey', category: 'tribe', giver: giver('turnkey'), requires: ['tribe_turnkey_yard'], title: 'Off-Book Survey',
  desc: 'The Institute never mapped the rooms honestly. Scan three different anomalies so the Turnkeys can.',
  objectives: [{ id: 'anom', text: 'Scan anomalies (3 kinds)', check: () => Math.min(1, (G.scan?.entries?.('anomaly').length ?? 0) / 3) }],
  reward: { rp: 9, items: [['adrenaline', 1]] }, onComplete: rep('turnkey', 10) });

// ---- the Sprocket Congregation
defQuest({ key: 'tribe_cog_feed', category: 'tribe', giver: giver('cog'), requires: met('cog'), title: 'Feed the Machine',
  desc: 'The Congregation asks for three handfuls of electronics scrap. In return: a probe to read the world with, and the schematic for a small mind.',
  objectives: [{ id: 'scrap', text: 'Carry electronics scrap (3)', check: have('electronics_scrap', 3) }],
  cost: { items: [['electronics_scrap', 3]] }, reward: { rp: 5, unlock: ['tame_mk1'], items: [['data_probe', 1]] },
  onComplete: () => { grantNode('tame_mk1'); rep('cog', 12)(); } });
defQuest({ key: 'tribe_cog_communion', category: 'tribe', giver: giver('cog'), requires: ['tribe_cog_feed'], title: 'Communion',
  desc: 'Knock something down, open it, and put a cortex where its brain was. Show the Congregation it can be done.',
  objectives: [{ id: 'thrall', text: 'Dominate a creature', check: () => (tr()?.stat('thralls') ?? 0) >= 1 || (G.dominion?.mine?.().length ?? 0) >= 1 }],
  reward: { rp: 12, items: [['brain_mk2', 1]] }, onComplete: rep('cog', 15) });
defQuest({ key: 'tribe_cog_titan', category: 'tribe', giver: giver('cog'), requires: ['tribe_cog_communion'], title: 'The Big Iron',
  desc: 'A Titan Lobe in a titan. Wire something enormous and walk it past the Congregation.',
  objectives: [{ id: 'titan', text: 'Run a thrall on a Titan Lobe', check: () => !!G.dominion?.mine?.().some((r: any) => r.tier >= 3) }],
  reward: { rp: 25, unlock: ['tame_overclock'] }, onComplete: () => { grantNode('tame_overclock'); rep('cog', 20)(); } });

// TALENT: the marbles. Each unit is weighed before it is linked: on the lab's
// talent bench (src/ui/menus/rooms/talentBench.ts) a row of tin cans holds glass
// marbles, and every marble is a trait with a weight. Buffs go on one pan of
// the balance, debuffs on the other; the unit can only be sealed while the beam
// is level or leans to the debuff side (Project Zomboid's trait points, as brass
// and glass). The chosen marbles ride on the unit's body as traits 'tal:<key>'
// (saved with the body, carried into a re-run of the same unit) and the game's
// systems read them through two small hooks:
//
//   talentMul(body, 'craft')    the product of every chosen marble's multiplier (1 = none)
//   talentAdd(body, 'carry')    the sum of every chosen marble's bonus (0 = none)
//
// Pure data and arithmetic: no imports, so any system can ask.
//   stat        what it scales (where the hook is)
//   craft       crafting time            (interact/crafting.ts, craft/bench.ts)
//   build       building / welding / nailing / barricading time (build/weld.ts, actions/world.ts)
//   butcher     butchering time          (cook/butchery.ts)
//   noise       footstep noise radius     (creatures/manager.ts)
//   crawlNoise  noise radius while crawling
//   rawPoison   sickness from raw and rotten food   (survival/body.ts eat)
//   poison      sickness from anything eaten
//   buy / sell  what human traders charge / credit (tribes/tribes.ts)
//   scan        scanner range            (scan/scan.ts)
//   carry       + kg carrying capacity   (survival/body.ts)
//   hunger / thirst / fatigue   how fast they rise
//   panic       how fast panic builds
//   stamina     how fast endurance drains
//   heal        how fast wounds heal
//   medic       time to treat a wound    (actions/medical.ts)
//   loot        time to move things in and out of containers (actions/transfer.ts)
//   melee       melee damage             (game/combat.ts)
//   xp          skill experience gained  (survival/body.ts addXp)
//   lucid       how fast lucidity drains in the place (survival/body.ts)
//   bleed       how hard wounds bleed    (survival/body.ts injuryBleed)
//   stress / boredom   how fast they build

export type TalentStat = 'craft' | 'build' | 'butcher' | 'noise' | 'crawlNoise' | 'rawPoison' | 'poison' | 'buy' | 'sell' | 'scan' | 'carry'
  | 'hunger' | 'thirst' | 'fatigue' | 'panic' | 'stamina' | 'heal' | 'medic' | 'loot' | 'melee' | 'xp' | 'lucid' | 'bleed' | 'stress' | 'boredom';
/** additive stats (everything else multiplies) */
const ADDITIVE: ReadonlySet<TalentStat> = new Set(['carry']);
/** what each stat is called on the inspect card, and which way is good (low: a smaller number helps) */
export const STAT_INFO: Record<TalentStat, { label: string; low: boolean }> = {
  craft: { label: 'craft time', low: true }, build: { label: 'build time', low: true }, butcher: { label: 'butcher time', low: true },
  noise: { label: 'footstep noise', low: true }, crawlNoise: { label: 'crawl noise', low: true }, rawPoison: { label: 'sick from raw', low: true },
  poison: { label: 'food sickness', low: true }, buy: { label: 'trader prices', low: true }, sell: { label: 'sale credit', low: false },
  scan: { label: 'scanner range', low: false }, carry: { label: 'carry', low: false }, hunger: { label: 'hunger', low: true }, thirst: { label: 'thirst', low: true },
  fatigue: { label: 'tiredness', low: true }, panic: { label: 'panic', low: true }, stamina: { label: 'stamina drain', low: true }, heal: { label: 'healing', low: false },
  medic: { label: 'treat time', low: true }, loot: { label: 'looting time', low: true }, melee: { label: 'melee damage', low: false }, xp: { label: 'skill xp', low: false },
  lucid: { label: 'lucidity drain', low: true }, bleed: { label: 'bleeding', low: true }, stress: { label: 'stress', low: true }, boredom: { label: 'boredom', low: true },
};

/** the tin cans on the bench (four each side of the balance) */
export type CanKey = 'hands' | 'gut' | 'feet' | 'tongue' | 'eyes' | 'nerve' | 'mind' | 'blood';
export const CANS: { key: CanKey; label: string; sub: string; paper: number; ink: number }[] = [
  { key: 'hands', label: 'HANDS', sub: 'craft · build · treat', paper: 0xd8b848, ink: 0x2a1e0c },
  { key: 'gut', label: 'GUT', sub: 'food · water', paper: 0x9ab85a, ink: 0x14200c },
  { key: 'feet', label: 'FEET', sub: 'quiet · stamina', paper: 0xc86a3a, ink: 0x200c06 },
  { key: 'mind', label: 'MIND', sub: 'learning · lucidity · stress', paper: 0xa88ad0, ink: 0x1a0e2a },
  { key: 'tongue', label: 'TONGUE', sub: 'trade with people', paper: 0xd8d0b8, ink: 0x6a1a14 },
  { key: 'eyes', label: 'EYES', sub: 'scanner · scavenging', paper: 0x5a8ab8, ink: 0x0a1424 },
  { key: 'nerve', label: 'NERVE', sub: 'panic · strength', paper: 0xb84a4a, ink: 0x1e0606 },
  { key: 'blood', label: 'BLOOD', sub: 'bleeding · healing', paper: 0x8a2a2a, ink: 0xf4e4d0 },
];

/** how a marble looks: the glass, what turns inside it */
export type Swirl = 'vane' | 'ribbon' | 'onion' | 'fleck' | 'crack' | 'smoke' | 'void' | 'jelly' | 'banded';
export type Inclusion = 'gear' | 'moth' | 'eye' | 'crescent' | 'bone' | 'tooth' | 'key' | 'cross' | 'feather' | 'drop' | 'coin' | 'rivet';
export interface MarbleLook {
  glass: number; cloud: number; swirl: Swirl; colors: number[];
  inc?: Inclusion; incColor?: number; bubbles?: number; flecks?: number; fleckColor?: number;
}
export type Unlock =
  | { kind: 'start' }
  | { kind: 'tree'; cost: number; requires?: string[] }
  | { kind: 'ach'; key: string; why: string }
  | { kind: 'codex'; n: number }
  | { kind: 'deaths'; n: number };
export interface Marble {
  key: string; name: string; kind: 'buff' | 'debuff';
  /** grams on the balance */
  weight: number;
  can: CanKey;
  /** one short line */
  line: string;
  fx: Partial<Record<TalentStat, number>>;
  look: MarbleLook;
  unlock: Unlock;
}
type L = MarbleLook;
const B = (key: string, name: string, weight: number, can: CanKey, line: string, fx: Marble['fx'], look: L, unlock: Unlock): Marble => ({ key, name, kind: 'buff', weight, can, line, fx, look, unlock });
const D = (key: string, name: string, weight: number, can: CanKey, line: string, fx: Marble['fx'], look: L, unlock: Unlock): Marble => ({ key, name, kind: 'debuff', weight, can, line, fx, look, unlock });
const start: Unlock = { kind: 'start' };
const tree = (cost: number): Unlock => ({ kind: 'tree', cost });
const ach = (key: string, why: string): Unlock => ({ kind: 'ach', key, why });
const codex = (n: number): Unlock => ({ kind: 'codex', n });
const deaths = (n: number): Unlock => ({ kind: 'deaths', n });

export const MARBLES: Marble[] = [
  // ------------------------------------------------------------------ HANDS
  B('tinker', 'Brass Tinker', 3, 'hands', 'Builds things in half the swearing.', { craft: 0.7, loot: 1.15 }, { glass: 0xf2e8c8, cloud: 0.05, swirl: 'vane', colors: [0xd89a2a, 0xf0d070], inc: 'gear', incColor: 0xc8962e, bubbles: 6 }, start),
  B('rivet', 'Rivet Heart', 3, 'hands', 'Welds and barricades go up fast.', { build: 0.7, hunger: 1.08 }, { glass: 0x3a2a24, cloud: 0.15, swirl: 'ribbon', colors: [0xff5a1a, 0xffc040], inc: 'rivet', incColor: 0xb87a4a, flecks: 30, fleckColor: 0xd8783a }, tree(6)),
  B('cleaver', 'Bone Saw', 2, 'hands', 'Knows where the joints are.', { butcher: 0.65, thirst: 1.05 }, { glass: 0xf0ece4, cloud: 0.75, swirl: 'onion', colors: [0xb81e1a, 0xf4ece0, 0x7a0e0a], bubbles: 3 }, codex(4)),
  B('solder', 'Solder Bead', 2, 'hands', 'A little better at everything with a tool.', { craft: 0.86, build: 0.86, fatigue: 1.06 }, { glass: 0xe8c8a0, cloud: 0.1, swirl: 'banded', colors: [0xb8702a, 0xe8b070, 0x6a3a14], flecks: 40, fleckColor: 0xffc880 }, tree(4)),
  B('pliers', 'Steady Pliers', 2, 'hands', 'Stitches straight with the lights off.', { medic: 0.75, craft: 0.92, stress: 1.05 }, { glass: 0xe0e8ec, cloud: 0.04, swirl: 'vane', colors: [0x9aa4ac, 0xd8dce0, 0x6a747c], inc: 'key', incColor: 0xb8c0c8, bubbles: 4 }, ach('steady_hands', 'Ace a bench test')),
  D('greasy', 'Greasy Thumbs', 3, 'hands', 'Everything slips.', { craft: 1.35, build: 1.2 }, { glass: 0x2a2a30, cloud: 0.2, swirl: 'smoke', colors: [0x6aa8a0, 0xb070c8, 0xd8c060], bubbles: 2 }, ach('butterfingers', 'Spoil a sample at a research bench')),
  D('shaky', 'Shaky Hands', 2, 'hands', 'The needle never goes where it is aimed.', { medic: 1.3, craft: 1.1 }, { glass: 0xf4e8a8, cloud: 0.15, swirl: 'crack', colors: [0xd8a020, 0xfff0c0] }, deaths(2)),
  D('splinter', 'Splinter', 1, 'hands', 'Wood fights back.', { build: 1.15 }, { glass: 0xc89a68, cloud: 0.5, swirl: 'banded', colors: [0x8a5a30, 0xc8945a, 0x5a3418] }, codex(1)),
  // ------------------------------------------------------------------ GUT
  B('tinstomach', 'Tin Stomach', 3, 'gut', 'A stomach for raw meat.', { rawPoison: 0.35, hunger: 1.1 }, { glass: 0x6a9a5a, cloud: 0.1, swirl: 'onion', colors: [0x9aa0a4, 0x5a6064], bubbles: 12 }, tree(5)),
  B('camel', 'Camel Glass', 2, 'gut', 'Goes a long way on a little water.', { thirst: 0.75, carry: -1 }, { glass: 0xd8a860, cloud: 0.1, swirl: 'banded', colors: [0xb87a3a, 0xf0d8a0], flecks: 60, fleckColor: 0xffe0a0 }, ach('hydration', 'Die of thirst, once')),
  B('gutter', 'Gutter Glass', 3, 'gut', 'Eats less, eats worse.', { hunger: 0.8, rawPoison: 0.8, stress: 1.08 }, { glass: 0x8aa04a, cloud: 0.3, swirl: 'fleck', colors: [0x6a8a2a], flecks: 50, fleckColor: 0xd8e870, bubbles: 6 }, ach('fasting', 'Starve to death, once')),
  B('brine', 'Brine Pearl', 2, 'gut', 'Salt-cured from the inside.', { thirst: 0.85, poison: 0.85, hunger: 1.05 }, { glass: 0x9ad0d8, cloud: 0.6, swirl: 'onion', colors: [0x2a7a9a, 0xe8f4f4, 0x4ab0c8], bubbles: 10 }, tree(4)),
  D('hollowleg', 'Hollow Leg', 3, 'gut', 'Never full.', { hunger: 1.25 }, { glass: 0x4a3a2a, cloud: 0.1, swirl: 'void', colors: [0x050404, 0x8a5a2a], bubbles: 16 }, start),
  D('sourgut', 'Sour Gut', 2, 'gut', 'Everything disagrees with it.', { poison: 1.5 }, { glass: 0xa8c040, cloud: 0.55, swirl: 'smoke', colors: [0xd8e060, 0x6a7a10], flecks: 20, fleckColor: 0xe8f080 }, codex(2)),
  D('sweettooth', 'Sweet Tooth', 2, 'gut', 'Bored without sugar.', { boredom: 1.2, hunger: 1.1 }, { glass: 0xf0a0c0, cloud: 0.2, swirl: 'jelly', colors: [0xff70a8, 0xd83a7a], bubbles: 14 }, codex(5)),
  D('drythroat', 'Dry Throat', 2, 'gut', 'Always thirsty.', { thirst: 1.25 }, { glass: 0xe0c890, cloud: 0.45, swirl: 'smoke', colors: [0xc8a050, 0xf0e0b0] }, deaths(4)),
  // ------------------------------------------------------------------ FEET
  B('mothstep', 'Moth Step', 2, 'feet', 'Crawls without a sound.', { crawlNoise: 0.4, noise: 0.92, stamina: 1.05 }, { glass: 0xd8e8f8, cloud: 0.04, swirl: 'vane', colors: [0xb8c8e0], inc: 'moth', incColor: 0xf0e8d8, bubbles: 4 }, start),
  B('stride', 'Long Stride', 3, 'feet', 'Keeps going.', { stamina: 0.75, noise: 1.1 }, { glass: 0xe8f4e8, cloud: 0.03, swirl: 'vane', colors: [0x2a9a4a, 0x6ad86a, 0x1a6a2a, 0x8af08a], bubbles: 5 }, tree(5)),
  B('catpaw', "Cat's Paw", 3, 'feet', 'Soft on every floor.', { noise: 0.75, crawlNoise: 0.8, carry: -1.5 }, { glass: 0xf0d8a8, cloud: 0.05, swirl: 'vane', colors: [0xd88a2a, 0xffc860, 0x8a4a10], inc: 'feather', incColor: 0xf8f0e0, bubbles: 3 }, tree(7)),
  B('longlung', 'Long Lung', 3, 'feet', 'Breath for days.', { stamina: 0.8, fatigue: 0.92, hunger: 1.08 }, { glass: 0xc8dcf8, cloud: 0.05, swirl: 'ribbon', colors: [0x3a6ad8, 0xa8c8ff], bubbles: 18 }, codex(10)),
  D('leadboots', 'Lead Boots', 3, 'feet', 'Everything hears it coming.', { noise: 1.35, crawlNoise: 1.35 }, { glass: 0x6a6e72, cloud: 0.85, swirl: 'banded', colors: [0x4a4e52, 0x9aa0a4], flecks: 12, fleckColor: 0xc8ccd0 }, ach('open_floor', 'Shout ten times in one run')),
  D('jellyknees', 'Jelly Knees', 2, 'feet', 'Out of breath on the stairs.', { stamina: 1.25 }, { glass: 0xd83a4a, cloud: 0.25, swirl: 'jelly', colors: [0xff7a8a, 0xa81a2a], bubbles: 22 }, ach('quiet_quit', 'Die having walked less than twenty metres')),
  D('clatter', 'Clatter', 2, 'feet', 'Kicks every can.', { noise: 1.2 }, { glass: 0xb8bcc0, cloud: 0.7, swirl: 'banded', colors: [0x8a9094, 0xd8dce0, 0x5a6064] }, codex(7)),
  D('flatfoot', 'Flat Foot', 2, 'feet', 'Plods.', { stamina: 1.15, noise: 1.08 }, { glass: 0x9a9a92, cloud: 0.6, swirl: 'onion', colors: [0x6a6a62, 0xb8b8a8] }, deaths(6)),
  // ------------------------------------------------------------------ MIND
  B('bookworm', 'Bookworm', 4, 'mind', 'Learns everything faster.', { xp: 1.3, stamina: 1.08 }, { glass: 0xf4ecd8, cloud: 0.4, swirl: 'onion', colors: [0x2a2a3a, 0xf0e8d0, 0x6a5a40], inc: 'key', incColor: 0xd8b060 }, ach('peer_review', 'Research one codex entry to 100%')),
  B('anchor', 'Anchor Stone', 3, 'mind', 'Holds on to what is real.', { lucid: 0.7, xp: 0.92 }, { glass: 0x6a7a8a, cloud: 0.1, swirl: 'void', colors: [0x050608, 0xc8d8e8], bubbles: 8 }, tree(7)),
  B('stillwater', 'Still Water', 3, 'mind', 'Stress slides off.', { stress: 0.7, boredom: 1.15 }, { glass: 0xb8f0f0, cloud: 0.03, swirl: 'vane', colors: [0x2ab8c0, 0x8af0f0, 0x0a7a8a], bubbles: 12 }, ach('hr_compliant', 'Survive two days without killing anything')),
  B('tenured', 'Tenured Mind', 5, 'mind', 'Learns fast, stays sane, bad with money.', { xp: 1.25, lucid: 0.8, sell: 0.9 }, { glass: 0xf0dc90, cloud: 0.1, swirl: 'banded', colors: [0xc89a20, 0xf8e8a0, 0x8a6a10], inc: 'coin', incColor: 0xf0c840, flecks: 20, fleckColor: 0xffe080 }, ach('tenure', 'Complete fifteen codex entries')),
  D('restless', 'Restless', 2, 'mind', 'Cannot sit still.', { boredom: 1.3 }, { glass: 0xe86a4a, cloud: 0.2, swirl: 'fleck', colors: [0xff4a2a], flecks: 70, fleckColor: 0xffd0a0 }, codex(11)),
  D('brainfog', 'Brain Fog', 3, 'mind', 'Nothing sticks.', { xp: 0.75 }, { glass: 0xb8a8c8, cloud: 0.75, swirl: 'smoke', colors: [0xd8d0e8, 0x7a6a90] }, deaths(8)),
  D('drifter', 'Drifter', 3, 'mind', 'The place gets in quicker.', { lucid: 1.35 }, { glass: 0x4a2a6a, cloud: 0.1, swirl: 'ribbon', colors: [0xc860ff, 0x6a20b0, 0xff90e0], bubbles: 6 }, ach('loyalty', 'Die to the same thing three runs in a row')),
  D('worrybead', 'Worry Bead', 2, 'mind', 'Turns everything over and over.', { stress: 1.3 }, { glass: 0xe8a840, cloud: 0.2, swirl: 'crack', colors: [0xb86a10, 0xffe0a0] }, ach('repeat', 'Start five runs')),
  // ------------------------------------------------------------------ TONGUE
  B('silver', 'Silver Tongue', 4, 'tongue', 'Better trades with people.', { buy: 0.8, sell: 1.2, panic: 1.08 }, { glass: 0xe8eef4, cloud: 0.04, swirl: 'ribbon', colors: [0xd8dce0, 0x9aa4ac], inc: 'coin', incColor: 0xd8dce0, bubbles: 3 }, tree(8)),
  B('haggler', "Haggler's Coin", 2, 'tongue', 'Talks the price down.', { buy: 0.88, sell: 0.95 }, { glass: 0xf0e0b0, cloud: 0.05, swirl: 'fleck', colors: [0xd8b040], inc: 'coin', incColor: 0xe8c040, flecks: 24, fleckColor: 0xffe890 }, ach('sole', 'Feed your own shoe to the press')),
  B('tally', 'Tallyman', 3, 'tongue', 'Gets full value for what it sells.', { sell: 1.25, panic: 1.05 }, { glass: 0xa8d0a0, cloud: 0.5, swirl: 'banded', colors: [0x2a6a3a, 0xe8f0d8, 0x4a8a5a] }, tree(6)),
  B('honey', 'Honey Voice', 3, 'tongue', 'People like hearing it.', { buy: 0.85, sell: 1.1, noise: 1.06 }, { glass: 0xf0b030, cloud: 0.15, swirl: 'jelly', colors: [0xffc040, 0xc87a10], bubbles: 20 }, codex(12)),
  D('sourbreath', 'Sour Breath', 2, 'tongue', 'People do not like dealing with it.', { buy: 1.2, sell: 0.85 }, { glass: 0xc8b84a, cloud: 0.4, swirl: 'smoke', colors: [0x8a9a2a, 0xe8d860], bubbles: 8 }, ach('compound', 'Die owing more than you started with')),
  D('mumbler', 'Mumbler', 2, 'tongue', 'Nobody catches the price.', { buy: 1.1, sell: 0.9 }, { glass: 0x8a8a8a, cloud: 0.55, swirl: 'smoke', colors: [0xb8b8b8, 0x5a5a5a] }, deaths(5)),
  D('stammer', 'Stammer', 1, 'tongue', 'Loses the sale halfway.', { sell: 0.92 }, { glass: 0xf4f0e8, cloud: 0.1, swirl: 'crack', colors: [0xc8b8a0, 0xffffff] }, codex(3)),
  // ------------------------------------------------------------------ EYES
  B('lens', 'Lens Eye', 3, 'eyes', 'The scanner reaches further.', { scan: 1.35, fatigue: 1.08 }, { glass: 0xeef4f8, cloud: 0.02, swirl: 'fleck', colors: [0x3a8ad8], inc: 'eye', incColor: 0x2a7ad0, flecks: 14, fleckColor: 0xa8d8ff, bubbles: 2 }, codex(8)),
  B('magpie', 'Magpie', 2, 'eyes', "Quick hands in other people's drawers.", { loot: 0.65, carry: -1 }, { glass: 0x1a1e2a, cloud: 0.3, swirl: 'banded', colors: [0xf0f0f0, 0x101418, 0x2a4ab8], flecks: 40, fleckColor: 0xd8e8ff }, tree(4)),
  B('owl', 'Owl Glass', 3, 'eyes', 'Sees far, rests well, startles easy.', { scan: 1.2, fatigue: 0.9, panic: 1.06 }, { glass: 0x2a3a5a, cloud: 0.05, swirl: 'fleck', colors: [0x8aa0d8], inc: 'feather', incColor: 0xd8c8a0, flecks: 36, fleckColor: 0xf0f0ff }, tree(7)),
  B('rummage', 'Rummage', 3, 'eyes', 'Finds the pocket nobody checked.', { loot: 0.75, carry: 1, noise: 1.06 }, { glass: 0xd8c8b0, cloud: 0.6, swirl: 'banded', colors: [0xc83a2a, 0x2a6ac8, 0xe8c040, 0x3a9a4a] }, ach('field_kit', 'Collect five samples in one run')),
  B('surveyor', "Surveyor's Eye", 4, 'eyes', 'Reads the place like a map.', { scan: 1.25, xp: 1.1, stamina: 1.06 }, { glass: 0xc8f0e8, cloud: 0.04, swirl: 'vane', colors: [0x1a9a8a, 0x8ae8d8, 0x0a5a50], inc: 'gear', incColor: 0xd8b060, bubbles: 4 }, ach('fieldwork', 'Discover ten codex entries')),
  D('squint', 'Squint', 2, 'eyes', 'The scanner sees less.', { scan: 0.75 }, { glass: 0xc8ccc8, cloud: 0.9, swirl: 'smoke', colors: [0xe8ece8, 0x8a908a] }, codex(6)),
  D('tunnel', 'Tunnel Vision', 2, 'eyes', 'Sees only what is in front.', { scan: 0.85, panic: 1.08 }, { glass: 0x1a2a4a, cloud: 0.05, swirl: 'void', colors: [0x000000, 0x4a8ad8], bubbles: 4 }, deaths(7)),
  D('glare', 'Glare', 2, 'eyes', 'Lights hurt.', { scan: 0.88, fatigue: 1.1 }, { glass: 0xf8f8f0, cloud: 0.05, swirl: 'crack', colors: [0xffffff, 0xf0e070] }, codex(9)),
  // ------------------------------------------------------------------ NERVE
  B('coldblood', 'Cold Blood', 4, 'nerve', 'Does not panic.', { panic: 0.6, heal: 0.9 }, { glass: 0xa8d8f0, cloud: 0.05, swirl: 'crack', colors: [0xe8f8ff, 0x2a5aa8], inc: 'drop', incColor: 0x1a3a8a, bubbles: 6 }, tree(8)),
  B('oxback', 'Ox Back', 3, 'nerve', 'Carries more, hits harder.', { carry: 3, melee: 1.1, thirst: 1.1 }, { glass: 0x5a1a14, cloud: 0.6, swirl: 'banded', colors: [0x8a2a1a, 0xd8a070, 0x3a0a06], flecks: 10, fleckColor: 0xffd8a0 }, ach('wage_slave', 'Press five valuables in one run')),
  B('steelspine', 'Steel Spine', 4, 'nerve', 'Stands its ground and swings hard.', { melee: 1.15, panic: 0.85, hunger: 1.1 }, { glass: 0x8a9aa8, cloud: 0.7, swirl: 'banded', colors: [0x4a5a68, 0xc8d4dc, 0x2a343c], inc: 'rivet', incColor: 0xd8dce0 }, ach('noise', 'Kill a Driller')),
  D('glassnerves', 'Glass Nerves', 3, 'nerve', 'Jumps at everything.', { panic: 1.4 }, { glass: 0xf4f8f8, cloud: 0.02, swirl: 'crack', colors: [0xff3a2a, 0xffffff], bubbles: 2 }, codex(3)),
  D('nightsweats', 'Night Sweats', 2, 'nerve', 'Never quite rested.', { fatigue: 1.25, thirst: 1.1 }, { glass: 0x1a2a5a, cloud: 0.2, swirl: 'fleck', colors: [0x3a5aa8], inc: 'crescent', incColor: 0xf0e8b0, flecks: 50, fleckColor: 0xd8e0ff }, deaths(3)),
  D('brittle', 'Brittle Bones', 4, 'nerve', 'Breaks, and stays broken.', { heal: 0.7, melee: 0.9 }, { glass: 0xe8e2d0, cloud: 0.8, swirl: 'crack', colors: [0x8a7a5a, 0xf4f0e4], inc: 'bone', incColor: 0xf0e8d0 }, ach('flattened', 'Be flattened by the Remittance Press')),
  D('flinch', 'Flinch', 2, 'nerve', 'Pulls every punch.', { panic: 1.2, melee: 0.95 }, { glass: 0xf0e060, cloud: 0.2, swirl: 'jelly', colors: [0xffe840, 0xc8a010], bubbles: 12 }, ach('shock', 'Get a jolt from your own band')),
  // ------------------------------------------------------------------ BLOOD
  B('mend', 'Quick Mend', 3, 'blood', 'Heals fast, patches fast.', { heal: 1.35, medic: 0.8, hunger: 1.08 }, { glass: 0xf8d8d8, cloud: 0.1, swirl: 'ribbon', colors: [0xd81a2a, 0xffffff], inc: 'cross', incColor: 0xd81a2a, bubbles: 5 }, ach('probation', 'Die inside the first minute of a run')),
  B('clot', 'Clot', 3, 'blood', 'Wounds close on their own.', { bleed: 0.65, fatigue: 1.06 }, { glass: 0x5a0a0a, cloud: 0.5, swirl: 'onion', colors: [0x8a0a0a, 0x3a0404, 0xc83a2a] }, tree(6)),
  B('leech', 'Leech Glass', 2, 'blood', 'Takes a little, gives a little.', { heal: 1.15, bleed: 0.9, poison: 1.15 }, { glass: 0x3a1010, cloud: 0.2, swirl: 'jelly', colors: [0x6a0a10, 0x1a0204], inc: 'drop', incColor: 0xc8202a, bubbles: 8 }, ach('unethical', 'Sample something still breathing')),
  B('ironblood', 'Iron Blood', 3, 'blood', 'Heals well, runs long.', { heal: 1.2, stamina: 0.92, thirst: 1.08 }, { glass: 0xb85a3a, cloud: 0.6, swirl: 'banded', colors: [0x8a3a1a, 0xd88a5a, 0x4a1a0a], flecks: 16, fleckColor: 0xff9a6a }, ach('cold_storage', 'Bank twenty-five samples')),
  B('bruiser', 'Bruiser', 3, 'blood', 'Hits hard, treats badly.', { melee: 1.15, medic: 1.15 }, { glass: 0x6a3a6a, cloud: 0.3, swirl: 'fleck', colors: [0x8a4a8a], flecks: 44, fleckColor: 0xd8a0d8, inc: 'tooth', incColor: 0xf4ecd8 }, ach('humbled', 'Die to something rated harmless')),
  D('thinblood', 'Thin Blood', 3, 'blood', 'Every cut runs.', { bleed: 1.4 }, { glass: 0xf0b0b0, cloud: 0.05, swirl: 'ribbon', colors: [0xe81a2a, 0xff8a8a], bubbles: 10 }, codex(14)),
  D('paleveins', 'Pale Veins', 2, 'blood', 'Slow to knit.', { heal: 0.85 }, { glass: 0xe8e8f0, cloud: 0.5, swirl: 'smoke', colors: [0xc8c8e0, 0x8a8aa8] }, ach('custody', 'Bank your first sample')),
];
export const MARBLE = new Map(MARBLES.map((m) => [m.key, m]));
export const marblesIn = (can: CanKey) => MARBLES.filter((m) => m.can === can);
/** a marble's effects as card lines: the stat, a signed number, whether it helps */
export function effectsOf(m: Marble): { stat: TalentStat; label: string; value: string; good: boolean }[] {
  return (Object.entries(m.fx) as [TalentStat, number][]).map(([stat, v]) => {
    const I = STAT_INFO[stat];
    if (ADDITIVE.has(stat)) return { stat, label: I.label, value: `${v > 0 ? '+' : '−'}${Math.abs(v)} kg`, good: v > 0 };
    const pct = Math.round((v - 1) * 100);
    return { stat, label: I.label, value: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, good: I.low ? v < 1 : v > 1 };
  }).sort((a, b) => Number(b.good) - Number(a.good));
}

// ------------------------------------------------------------------ on the unit
export const TALENT_PREFIX = 'tal:';
interface HasTraits { traits?: Set<string> }
/** the marbles a body carries */
export function talentsOf(body: HasTraits | null | undefined): Marble[] {
  const out: Marble[] = [];
  const t = body?.traits;
  if (!t) return out;
  for (const k of t) if (k.startsWith(TALENT_PREFIX)) { const m = MARBLE.get(k.slice(TALENT_PREFIX.length)); if (m) out.push(m); }
  return out;
}
/** traits for a set of marble keys (what goes on the unit at launch) */
export const talentTraits = (keys: string[]) => keys.filter((k) => MARBLE.has(k)).map((k) => TALENT_PREFIX + k);
/** the product of every carried marble's multiplier for this stat (1 = untouched) */
export function talentMul(body: HasTraits | null | undefined, stat: TalentStat): number {
  const t = body?.traits;
  if (!t || !t.size) return 1;
  let m = 1;
  for (const k of t) {
    if (k.charCodeAt(0) !== 116 || !k.startsWith(TALENT_PREFIX)) continue;
    const v = MARBLE.get(k.slice(TALENT_PREFIX.length))?.fx[stat];
    if (v !== undefined && !ADDITIVE.has(stat)) m *= v;
  }
  return m;
}
/** the sum of every carried marble's bonus for an additive stat (carry) */
export function talentAdd(body: HasTraits | null | undefined, stat: TalentStat): number {
  const t = body?.traits;
  if (!t || !t.size) return 0;
  let a = 0;
  for (const k of t) {
    if (!k.startsWith(TALENT_PREFIX)) continue;
    const v = MARBLE.get(k.slice(TALENT_PREFIX.length))?.fx[stat];
    if (v !== undefined && ADDITIVE.has(stat)) a += v;
  }
  return a;
}
/** grams on each pan for a set of marble keys */
export function weigh(keys: Iterable<string>): { buff: number; debuff: number } {
  let buff = 0, debuff = 0;
  for (const k of keys) { const m = MARBLE.get(k); if (!m) continue; if (m.kind === 'buff') buff += m.weight; else debuff += m.weight; }
  return { buff, debuff };
}
/** the unit may be sealed: level, or leaning to the debuff side */
export const balanced = (keys: Iterable<string>) => { const w = weigh(keys); return w.debuff >= w.buff; };
/** one short line for the status page: "Brass Tinker, Moth Step · Hollow Leg" */
export function talentLine(body: HasTraits | null | undefined): string {
  const ms = talentsOf(body);
  if (!ms.length) return 'none';
  const b = ms.filter((m) => m.kind === 'buff').map((m) => m.name), d = ms.filter((m) => m.kind === 'debuff').map((m) => m.name);
  return [b.join(', '), d.join(', ')].filter(Boolean).join(' · ');
}

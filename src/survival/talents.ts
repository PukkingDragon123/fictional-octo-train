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

export type TalentStat = 'craft' | 'build' | 'butcher' | 'noise' | 'crawlNoise' | 'rawPoison' | 'poison' | 'buy' | 'sell' | 'scan' | 'carry'
  | 'hunger' | 'thirst' | 'fatigue' | 'panic' | 'stamina' | 'heal' | 'medic' | 'loot' | 'melee';
/** additive stats (everything else multiplies) */
const ADDITIVE: ReadonlySet<TalentStat> = new Set(['carry']);

/** the six tin cans on the bench */
export type CanKey = 'hands' | 'gut' | 'feet' | 'tongue' | 'eyes' | 'nerve';
export const CANS: { key: CanKey; label: string; sub: string; paper: number; ink: number }[] = [
  { key: 'hands', label: 'HANDS', sub: 'craft · build · butcher', paper: 0xd8b848, ink: 0x2a1e0c },
  { key: 'gut', label: 'GUT', sub: 'food · water', paper: 0x9ab85a, ink: 0x14200c },
  { key: 'feet', label: 'FEET', sub: 'quiet · stamina', paper: 0xc86a3a, ink: 0x200c06 },
  { key: 'tongue', label: 'TONGUE', sub: 'trade with people', paper: 0xd8d0b8, ink: 0x6a1a14 },
  { key: 'eyes', label: 'EYES', sub: 'scanner · scavenging', paper: 0x5a8ab8, ink: 0x0a1424 },
  { key: 'nerve', label: 'NERVE', sub: 'panic · body · strength', paper: 0xb84a4a, ink: 0x1e0606 },
];

/** how a marble looks: the glass, what turns inside it */
export type Swirl = 'vane' | 'ribbon' | 'onion' | 'fleck' | 'crack' | 'smoke' | 'void' | 'jelly' | 'banded';
export type Inclusion = 'gear' | 'moth' | 'eye' | 'crescent' | 'bone' | 'tooth' | 'key' | 'cross' | 'feather' | 'drop' | 'coin' | 'rivet';
export interface MarbleLook {
  /** the glass tint */
  glass: number;
  /** 0 water clear .. 1 milky */
  cloud: number;
  swirl: Swirl;
  /** swirl colours (first is the main one) */
  colors: number[];
  /** a tiny figure set in the glass (a "sulphide") */
  inc?: Inclusion;
  incColor?: number;
  /** air bubbles trapped in the glass (count) */
  bubbles?: number;
  /** metallic glitter flakes (count) */
  flecks?: number;
  fleckColor?: number;
}

/** how a marble is earned: there from the start, bought on the research lattice, a commendation, codex discoveries, deaths */
export type Unlock =
  | { kind: 'start' }
  | { kind: 'tree'; cost: number; requires?: string[] }
  | { kind: 'ach'; key: string; why: string }
  | { kind: 'codex'; n: number }
  | { kind: 'deaths'; n: number };

export interface Marble {
  key: string;
  name: string;
  kind: 'buff' | 'debuff';
  /** grams on the balance */
  weight: number;
  can: CanKey;
  /** one line on the card's face */
  line: string;
  /** the card's lines: what it does for the unit, and what it costs */
  good: string[];
  bad: string[];
  fx: Partial<Record<TalentStat, number>>;
  look: MarbleLook;
  unlock: Unlock;
  /** a lab note in Dr. Calder's hand */
  note: string;
}

const M = (m: Marble) => m;
export const MARBLES: Marble[] = [
  // ------------------------------------------------------------------ HANDS
  M({ key: 'tinker', name: 'Brass Tinker', kind: 'buff', weight: 3, can: 'hands', line: 'Builds things in half the swearing.',
    good: ['Crafting is 30% faster', 'At the bench, at the fire, in the dark'], bad: ['Fiddles with everything: moving items in and out of containers is 15% slower'],
    fx: { craft: 0.7, loot: 1.15 }, unlock: { kind: 'start' },
    look: { glass: 0xf2e8c8, cloud: 0.05, swirl: 'vane', colors: [0xd89a2a, 0xf0d070], inc: 'gear', incColor: 0xc8962e, bubbles: 6 },
    note: 'The gear inside turns if you leave it on a warm bench. We have stopped leaving it on a warm bench.' }),
  M({ key: 'rivet', name: 'Rivet Heart', kind: 'buff', weight: 3, can: 'hands', line: 'Welds, nails and barricades go up fast.',
    good: ['Building, welding, nailing and barricading 30% faster'], bad: ['Works up an appetite: hunger rises 8% faster'],
    fx: { build: 0.7, hunger: 1.08 }, unlock: { kind: 'tree', cost: 6 },
    look: { glass: 0x3a2a24, cloud: 0.15, swirl: 'ribbon', colors: [0xff5a1a, 0xffc040], inc: 'rivet', incColor: 0xb87a4a, flecks: 30, fleckColor: 0xd8783a },
    note: 'Warm to the touch. The core glows orange when somebody in the building is hammering.' }),
  M({ key: 'cleaver', name: 'Bone Saw', kind: 'buff', weight: 2, can: 'hands', line: 'Knows where the joints are.',
    good: ['Butchering is 35% faster'], bad: ['Thirst rises 5% faster'],
    fx: { butcher: 0.65, thirst: 1.05 }, unlock: { kind: 'codex', n: 4 },
    look: { glass: 0xf0ece4, cloud: 0.75, swirl: 'onion', colors: [0xb81e1a, 0xf4ece0, 0x7a0e0a], bubbles: 3 },
    note: 'Milk glass with red in it. The technician who sorted it asked to be moved off the butchery rota. Then asked to be moved back.' }),
  M({ key: 'greasy', name: 'Greasy Thumbs', kind: 'debuff', weight: 3, can: 'hands', line: 'Everything slips.',
    good: [], bad: ['Crafting is 35% slower', 'Building is 20% slower'],
    fx: { craft: 1.35, build: 1.2 }, unlock: { kind: 'ach', key: 'butterfingers', why: 'Spoil a sample at a research bench' },
    look: { glass: 0x2a2a30, cloud: 0.2, swirl: 'smoke', colors: [0x6aa8a0, 0xb070c8, 0xd8c060], bubbles: 2 },
    note: 'An oily sheen that will not polish off. It left a print on the inside of the glass.' }),
  // ------------------------------------------------------------------ GUT
  M({ key: 'tinstomach', name: 'Tin Stomach', kind: 'buff', weight: 3, can: 'gut', line: 'A stomach for raw meat.',
    good: ['Raw and rotten food is 65% less likely to make the unit sick'], bad: ['Hunger rises 10% faster'],
    fx: { rawPoison: 0.35, hunger: 1.1 }, unlock: { kind: 'tree', cost: 5 },
    look: { glass: 0x6a9a5a, cloud: 0.1, swirl: 'onion', colors: [0x9aa0a4, 0x5a6064], bubbles: 12 },
    note: 'A grey metal core, like a ball bearing swallowed by a bottle. It rattles when the unit is hungry.' }),
  M({ key: 'camel', name: 'Camel Glass', kind: 'buff', weight: 2, can: 'gut', line: 'Goes a long way on a little water.',
    good: ['Thirst rises 25% slower'], bad: ['Carries 1 kg less'],
    fx: { thirst: 0.75, carry: -1 }, unlock: { kind: 'ach', key: 'hydration', why: 'Die of thirst, once' },
    look: { glass: 0xd8a860, cloud: 0.1, swirl: 'banded', colors: [0xb87a3a, 0xf0d8a0], flecks: 60, fleckColor: 0xffe0a0 },
    note: 'Sand in the glass, or something like sand. Issued after a unit died of thirst next to a vending machine.' }),
  M({ key: 'hollowleg', name: 'Hollow Leg', kind: 'debuff', weight: 3, can: 'gut', line: 'Never full.',
    good: [], bad: ['Hunger rises 25% faster'],
    fx: { hunger: 1.25 }, unlock: { kind: 'start' },
    look: { glass: 0x4a3a2a, cloud: 0.1, swirl: 'void', colors: [0x050404, 0x8a5a2a], bubbles: 16 },
    note: 'There is nothing in the middle of it. Look closer. There is nothing in the middle of it.' }),
  M({ key: 'sourgut', name: 'Sour Gut', kind: 'debuff', weight: 2, can: 'gut', line: 'Everything disagrees with it.',
    good: [], bad: ['Anything eaten is 50% more likely to make the unit sick'],
    fx: { poison: 1.5 }, unlock: { kind: 'codex', n: 2 },
    look: { glass: 0xa8c040, cloud: 0.55, swirl: 'smoke', colors: [0xd8e060, 0x6a7a10], flecks: 20, fleckColor: 0xe8f080 },
    note: 'Bile green. Cloudy. The cloud moves.' }),
  // ------------------------------------------------------------------ FEET
  M({ key: 'mothstep', name: 'Moth Step', kind: 'buff', weight: 2, can: 'feet', line: 'Crawls without a sound.',
    good: ['Crawling makes 60% less noise', 'Footsteps 8% quieter'], bad: ['Endurance drains 5% faster'],
    fx: { crawlNoise: 0.4, noise: 0.92, stamina: 1.05 }, unlock: { kind: 'start' },
    look: { glass: 0xd8e8f8, cloud: 0.04, swirl: 'vane', colors: [0xb8c8e0], inc: 'moth', incColor: 0xf0e8d8, bubbles: 4 },
    note: 'A moth set in the glass. Not a carving. We checked. It had dust on its wings when it was poured.' }),
  M({ key: 'stride', name: 'Long Stride', kind: 'buff', weight: 3, can: 'feet', line: 'Keeps going.',
    good: ['Endurance drains 25% slower'], bad: ['Heavy-footed: footsteps 10% louder'],
    fx: { stamina: 0.75, noise: 1.1 }, unlock: { kind: 'tree', cost: 5 },
    look: { glass: 0xe8f4e8, cloud: 0.03, swirl: 'vane', colors: [0x2a9a4a, 0x6ad86a, 0x1a6a2a, 0x8af08a], bubbles: 5 },
    note: 'A cat\'s eye with four long green vanes. Units that carry it walk past the place they meant to stop.' }),
  M({ key: 'leadboots', name: 'Lead Boots', kind: 'debuff', weight: 3, can: 'feet', line: 'Everything hears it coming.',
    good: [], bad: ['Footsteps 35% louder'],
    fx: { noise: 1.35, crawlNoise: 1.35 }, unlock: { kind: 'ach', key: 'open_floor', why: 'Shout ten times in one run' },
    look: { glass: 0x6a6e72, cloud: 0.85, swirl: 'banded', colors: [0x4a4e52, 0x9aa0a4], flecks: 12, fleckColor: 0xc8ccd0 },
    note: 'Heavier than it looks. The scale says it is heavier than it is.' }),
  M({ key: 'jellyknees', name: 'Jelly Knees', kind: 'debuff', weight: 2, can: 'feet', line: 'Out of breath on the stairs.',
    good: [], bad: ['Endurance drains 25% faster'],
    fx: { stamina: 1.25 }, unlock: { kind: 'ach', key: 'quiet_quit', why: 'Die having walked less than twenty metres' },
    look: { glass: 0xd83a4a, cloud: 0.25, swirl: 'jelly', colors: [0xff7a8a, 0xa81a2a], bubbles: 22 },
    note: 'It wobbles. Glass should not wobble.' }),
  // ------------------------------------------------------------------ TONGUE
  M({ key: 'silver', name: 'Silver Tongue', kind: 'buff', weight: 4, can: 'tongue', line: 'Better trades with people.',
    good: ['Traders charge 20% less', 'And credit 20% more for what the unit sells'], bad: ['A nervous talker: panic builds 8% faster'],
    fx: { buy: 0.8, sell: 1.2, panic: 1.08 }, unlock: { kind: 'tree', cost: 8 },
    look: { glass: 0xe8eef4, cloud: 0.04, swirl: 'ribbon', colors: [0xd8dce0, 0x9aa4ac], inc: 'coin', incColor: 0xd8dce0, bubbles: 3 },
    note: 'Silver ribbons round a coin nobody can read. The tribes trade straighter with a unit that carries it. Nobody knows how they can tell.' }),
  M({ key: 'sourbreath', name: 'Sour Breath', kind: 'debuff', weight: 2, can: 'tongue', line: 'People do not like dealing with it.',
    good: [], bad: ['Traders charge 20% more', 'And credit 15% less'],
    fx: { buy: 1.2, sell: 0.85 }, unlock: { kind: 'ach', key: 'compound', why: 'Die owing more than you started with' },
    look: { glass: 0xc8b84a, cloud: 0.4, swirl: 'smoke', colors: [0x8a9a2a, 0xe8d860], bubbles: 8 },
    note: 'Yellow smoke in yellow glass. The jar it came in was sealed with tape, twice.' }),
  // ------------------------------------------------------------------ EYES
  M({ key: 'lens', name: 'Lens Eye', kind: 'buff', weight: 3, can: 'eyes', line: 'The scanner reaches further.',
    good: ['Scanner range 35% longer'], bad: ['Eye strain: fatigue builds 8% faster'],
    fx: { scan: 1.35, fatigue: 1.08 }, unlock: { kind: 'codex', n: 8 },
    look: { glass: 0xeef4f8, cloud: 0.02, swirl: 'fleck', colors: [0x3a8ad8], inc: 'eye', incColor: 0x2a7ad0, flecks: 14, fleckColor: 0xa8d8ff, bubbles: 2 },
    note: 'There is an eye in it. It follows the lamp. Dr. Calder signed for it personally.' }),
  M({ key: 'magpie', name: 'Magpie', kind: 'buff', weight: 2, can: 'eyes', line: 'Quick hands in other people\'s drawers.',
    good: ['Moving items in and out of containers 35% faster'], bad: ['Pockets full of junk: carries 1 kg less'],
    fx: { loot: 0.65, carry: -1 }, unlock: { kind: 'tree', cost: 4 },
    look: { glass: 0x1a1e2a, cloud: 0.3, swirl: 'banded', colors: [0xf0f0f0, 0x101418, 0x2a4ab8], flecks: 40, fleckColor: 0xd8e8ff },
    note: 'Black and white with a blue sheen. It was found in a drawer that was locked.' }),
  M({ key: 'squint', name: 'Squint', kind: 'debuff', weight: 2, can: 'eyes', line: 'The scanner sees less.',
    good: [], bad: ['Scanner range 25% shorter'],
    fx: { scan: 0.75 }, unlock: { kind: 'codex', n: 6 },
    look: { glass: 0xc8ccc8, cloud: 0.9, swirl: 'smoke', colors: [0xe8ece8, 0x8a908a] },
    note: 'Frosted. Whatever is inside it is out of focus. Polishing does not help.' }),
  // ------------------------------------------------------------------ NERVE
  M({ key: 'coldblood', name: 'Cold Blood', kind: 'buff', weight: 4, can: 'nerve', line: 'Does not panic.',
    good: ['Panic builds 40% slower'], bad: ['Slow circulation: wounds heal 10% slower'],
    fx: { panic: 0.6, heal: 0.9 }, unlock: { kind: 'tree', cost: 8 },
    look: { glass: 0xa8d8f0, cloud: 0.05, swirl: 'crack', colors: [0xe8f8ff, 0x2a5aa8], inc: 'drop', incColor: 0x1a3a8a, bubbles: 6 },
    note: 'Frost cracks all through it and it never gets warm. A unit carried it past a Driller and did not run. Nobody knows if that was good.' }),
  M({ key: 'mend', name: 'Quick Mend', kind: 'buff', weight: 3, can: 'nerve', line: 'Heals fast, patches fast.',
    good: ['Wounds heal 35% faster', 'Treating a wound takes 20% less time'], bad: ['A fast metabolism: hunger rises 8% faster'],
    fx: { heal: 1.35, medic: 0.8, hunger: 1.08 }, unlock: { kind: 'ach', key: 'probation', why: 'Die inside the first minute of a run' },
    look: { glass: 0xf8d8d8, cloud: 0.1, swirl: 'ribbon', colors: [0xd81a2a, 0xffffff], inc: 'cross', incColor: 0xd81a2a, bubbles: 5 },
    note: 'A red thread wound round and round a white cross, like a suture. Issued to a unit that lasted forty seconds. It learned.' }),
  M({ key: 'oxback', name: 'Ox Back', kind: 'buff', weight: 3, can: 'nerve', line: 'Carries more, hits harder.',
    good: ['Carries 3 kg more', 'Melee hits 10% harder'], bad: ['Thirst rises 10% faster'],
    fx: { carry: 3, melee: 1.1, thirst: 1.1 }, unlock: { kind: 'ach', key: 'wage_slave', why: 'Press five valuables in one run' },
    look: { glass: 0x5a1a14, cloud: 0.6, swirl: 'banded', colors: [0x8a2a1a, 0xd8a070, 0x3a0a06], flecks: 10, fleckColor: 0xffd8a0 },
    note: 'Oxblood and cream, heavy as a fist. It sits low in the pan and does not roll.' }),
  M({ key: 'glassnerves', name: 'Glass Nerves', kind: 'debuff', weight: 3, can: 'nerve', line: 'Jumps at everything.',
    good: [], bad: ['Panic builds 40% faster'],
    fx: { panic: 1.4 }, unlock: { kind: 'codex', n: 3 },
    look: { glass: 0xf4f8f8, cloud: 0.02, swirl: 'crack', colors: [0xff3a2a, 0xffffff], bubbles: 2 },
    note: 'Clear glass crazed through with red. It cracks a little more every time it is picked up.' }),
  M({ key: 'nightsweats', name: 'Night Sweats', kind: 'debuff', weight: 2, can: 'nerve', line: 'Never quite rested.',
    good: [], bad: ['Fatigue builds 25% faster', 'Thirst rises 10% faster'],
    fx: { fatigue: 1.25, thirst: 1.1 }, unlock: { kind: 'deaths', n: 3 },
    look: { glass: 0x1a2a5a, cloud: 0.2, swirl: 'fleck', colors: [0x3a5aa8], inc: 'crescent', incColor: 0xf0e8b0, flecks: 50, fleckColor: 0xd8e0ff },
    note: 'A night sky with a moon in it. It is always the same phase. Not this month\'s.' }),
  M({ key: 'brittle', name: 'Brittle Bones', kind: 'debuff', weight: 4, can: 'nerve', line: 'Breaks, and stays broken.',
    good: [], bad: ['Wounds heal 30% slower', 'Melee hits 10% softer'],
    fx: { heal: 0.7, melee: 0.9 }, unlock: { kind: 'ach', key: 'flattened', why: 'Be flattened by the Remittance Press' },
    look: { glass: 0xe8e2d0, cloud: 0.8, swirl: 'crack', colors: [0x8a7a5a, 0xf4f0e4], inc: 'bone', incColor: 0xf0e8d0 },
    note: 'Chalk white, a little bone inside, cracked. Handle it like it matters.' }),
];
export const MARBLE = new Map(MARBLES.map((m) => [m.key, m]));
export const marblesIn = (can: CanKey) => MARBLES.filter((m) => m.can === can);

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

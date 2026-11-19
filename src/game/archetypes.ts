// UNIT ARCHETYPES (round 21, wave 4): who the unit was before the debt. Not a new
// system: each archetype is a pick of the creator's own pieces, an occupation
// (src/survival/traits.ts OCCUPATIONS: skills, kit, perks) and a few traits, a gift
// and a flaw, so the bodies really play differently (strength, wind, healing, nerve,
// noise). The unit room's creator offers them on the body (src/ui/menus/intake.ts,
// the "Archetype" line, imprinted through the spine port), and only the ones the
// Meridian file has earned: three from the start, the rest with runs and losses.
//   ARCHETYPES  archetype(key)  archetypeOwned(a)  archetypesOwned()  archetypeOf(occupation, traits)
import { file, deathCount } from './meridian';
import { occupationByKey, traitByKey, SKILLS } from '../survival/traits';

export interface Archetype {
  key: string;
  name: string;
  /** the occupation it is filed under (skills, kit, perks) */
  occupation: string;
  /** a gift and a flaw (trait keys) */
  traits: string[];
  /** the colour of its chip on the creator's line */
  color: number;
  /** how it plays, a few words */
  line: string;
  /** earned by: runs finished or units lost (none: from the start) */
  need?: { runs?: number; deaths?: number };
}

export const ARCHETYPES: Archetype[] = [
  { key: 'debtor', name: 'Debtor', occupation: 'unemployed', traits: [], color: 0xc8b890, line: 'no edge, no flaw' },
  { key: 'hauler', name: 'Hauler', occupation: 'mover', traits: ['strong', 'clumsy'], color: 0xd08a3a, line: 'lifts, drags and hits hard; loud on their feet' },
  { key: 'runner', name: 'Runner', occupation: 'explorer', traits: ['athletic', 'graceful', 'weak'], color: 0x6ac0d8, line: 'long wind and quiet feet; carries little' },
  { key: 'medic', name: 'Medic', occupation: 'nurse', traits: ['fast_healer', 'cowardly'], color: 0xe85a5a, line: 'stitches anyone, heals fast; scares easily', need: { runs: 1 } },
  { key: 'tinker', name: 'Tinker', occupation: 'electrician', traits: ['handy', 'short_sighted'], color: 0xe8c040, line: 'breakers and builds; poor eyes in the dark', need: { runs: 2 } },
  { key: 'returnee', name: 'Returnee', occupation: 'returnee', traits: ['been_here_before', 'graceful', 'thin_skinned'], color: 0x9a7ae0, line: 'the loops never surprise them; bruises easily', need: { deaths: 3 } },
];
const BY = new Map(ARCHETYPES.map((a) => [a.key, a]));
export const archetype = (k: string | undefined | null): Archetype => BY.get(k ?? '') ?? ARCHETYPES[0];

const safe = (f: () => number) => { try { return f(); } catch { return 0; } };
export function archetypeOwned(a: Archetype): boolean {
  if (!a.need) return true;
  if (a.need.runs && safe(() => file().runs ?? 0) < a.need.runs) return false;
  if (a.need.deaths && safe(deathCount) < a.need.deaths) return false;
  return true;
}
export const archetypesOwned = () => ARCHETYPES.filter(archetypeOwned);
/** what is still missing, a few words (a locked archetype's hint) */
export function archetypeNeed(a: Archetype): string {
  if (archetypeOwned(a) || !a.need) return '';
  if (a.need.runs) return `after ${a.need.runs} run${a.need.runs > 1 ? 's' : ''}`;
  return `after ${a.need.deaths} units lost`;
}
/** the stats line under the archetype: skills, then the gift and the flaw */
export function archetypeStats(a: Archetype): string {
  const o = occupationByKey(a.occupation);
  const sk = Object.entries(o.skills || {}).map(([k, v]) => `${SKILLS.find((q) => q.key === k)?.name ?? k} ${v}`).slice(0, 2);
  const tr = a.traits.map((k) => traitByKey(k)?.name ?? k);
  return [...sk, ...tr].join(' · ') || a.line;
}
/** which archetype a unit on file is (by its occupation and traits): for old saves, the Debtor */
export function archetypeOf(occupation: string, traits: Iterable<string>): Archetype {
  const t = new Set(traits);
  return ARCHETYPES.find((a) => a.occupation === occupation && a.traits.every((k) => t.has(k))) ?? ARCHETYPES[0];
}

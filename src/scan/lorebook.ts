// The inhabitants' lore as this operator knows it: each scan of a species
// reveals one more section of its entry (src/creatures/lore.ts), in order:
// summary -> biology -> behaviour -> habitat -> lore (and the harvest notes
// with the last). The Seated whisper sections too, and the King in Yellow
// reveals everything at once (and then you die). Persistent per profile
// (stat 'inh_lore:<species>'). Bus: 'inhabitantLore' { key, level, section, title, text }.
import { bus } from '../core/events';
import { inhabitant, INHABITANTS, LORE_SECTIONS, SECTION_TITLE, loreLines, RANK_INFO, type InhabitantLore } from '../creatures/lore';

// the profile touches window at load: fetched lazily so node tools that import species still work
type ProfileMod = typeof import('../game/profile');
let PROF: ProfileMod | null = null;
if (typeof window !== 'undefined' && typeof (window as any).addEventListener === 'function') import('../game/profile').then((m) => { PROF = m; }).catch(() => {});

export const LORE_MAX = LORE_SECTIONS.length;
const KEY = (id: string) => 'inh_lore:' + id;

/** how many sections of this inhabitant's entry are known (0..LORE_MAX) */
export function loreLevel(id: string): number { return Math.min(LORE_MAX, PROF?.stat(KEY(id)) ?? 0); }

/** reveal the next section(s); returns what was newly revealed, or null when nothing was */
export function advanceLore(id: string, n = 1): { level: number; section: string; title: string; text: string; entry: InhabitantLore } | null {
  const e = inhabitant(id);
  if (!e || !PROF) return null;
  const was = loreLevel(id);
  const level = Math.min(LORE_MAX, was + n);
  if (level <= was) return null;
  PROF.addStat(KEY(id), level - was);
  const section = LORE_SECTIONS[level - 1];
  const out = { level, section, title: SECTION_TITLE[section], text: e[section], entry: e };
  bus.emit('inhabitantLore', { key: id, level, section, title: out.title, text: out.text });
  return out;
}

/** everything, all at once (the King's gift) */
export function revealAll(): number {
  let n = 0;
  for (const e of INHABITANTS) { const was = loreLevel(e.id); if (was < LORE_MAX) { PROF?.addStat(KEY(e.id), LORE_MAX - was); n++; bus.emit('inhabitantLore', { key: e.id, level: LORE_MAX, section: 'lore', title: SECTION_TITLE.lore, text: e.lore }); } }
  return n;
}

/** the scanner's lines for a species at what this operator knows */
export function loreNotes(id: string): string[] {
  const e = inhabitant(id);
  if (!e) return [];
  const lv = loreLevel(id);
  const head = `${e.class.toUpperCase()} // RANK ${RANK_INFO[e.rank].numeral} ${RANK_INFO[e.rank].label} // DANGER ${e.danger}/10`;
  const lines = loreLines(e, lv);
  if (lv < LORE_MAX) lines.push(`[${LORE_MAX - lv} section${LORE_MAX - lv > 1 ? 's' : ''} unrecorded: scan again]`);
  return [head, ...lines];
}

/** a species not yet fully known (the Seated whisper about these) */
export function unknownInhabitants(): InhabitantLore[] { return INHABITANTS.filter((e) => loreLevel(e.id) < LORE_MAX); }

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__lore = { loreLevel, advanceLore, revealAll, loreNotes };

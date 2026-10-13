// Readable lore: notes, terminals, tapes, journals, posters.
export interface LoreEntry {
  id: string; title: string; text: string; style?: 'paper' | 'terminal' | 'tape'; chapter?: number;
  /** mission flags set when read (e.g. learning a door code) */
  sets?: string[];
  /** creature species added to the scanner codex when read */
  codex?: string[];
}
const REG = new Map<string, LoreEntry>();
export function defLore(e: LoreEntry) { REG.set(e.id, e); return e; }
export function lore(id: string): LoreEntry | undefined { return REG.get(id); }
export function allLore() { return [...REG.values()]; }

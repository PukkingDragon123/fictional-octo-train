// Readable lore: notes, terminals, tapes, journals, posters.
export interface LoreEntry { id: string; title: string; text: string; style?: 'paper' | 'terminal' | 'tape'; chapter?: number; }
const REG = new Map<string, LoreEntry>();
export function defLore(e: LoreEntry) { REG.set(e.id, e); return e; }
export function lore(id: string): LoreEntry | undefined { return REG.get(id); }
export function allLore() { return [...REG.values()]; }

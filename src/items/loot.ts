import { Rng } from '../core/rng';

/**
 * Loot tables. A table has weighted entries and a roll range; containers are
 * filled lazily the first time anyone looks inside (like Project Zomboid).
 * entries: [itemKey | '@otherTable', weight, minCount?, maxCount?]
 */
export interface LootTable {
  key: string;
  rolls: [number, number];
  entries: [string, number, number?, number?][];
  /** chance the container is completely empty */
  empty?: number;
}

const REG = new Map<string, LootTable>();
export function defLoot(key: string, rolls: [number, number], entries: LootTable['entries'], empty = 0.15): LootTable {
  const t = { key, rolls, entries, empty };
  REG.set(key, t);
  return t;
}
export function lootTable(key: string) { return REG.get(key); }
export function allLootTables() { return [...REG.values()]; }

/** Roll a table into a list of item keys (resolves nested @tables) */
export function rollLoot(key: string, rng: Rng, mult = 1, depth = 0): string[] {
  const t = REG.get(key);
  if (!t || depth > 4) return [];
  if (t.empty && rng.chance(t.empty / Math.max(0.3, mult))) return [];
  const n = Math.max(0, Math.round(rng.int(t.rolls[0], t.rolls[1]) * mult));
  const out: string[] = [];
  const weighted = t.entries.map((e) => [e, e[1]] as [typeof e, number]);
  for (let i = 0; i < n; i++) {
    const e = rng.weighted(weighted);
    const cnt = rng.int(e[2] ?? 1, e[3] ?? e[2] ?? 1);
    for (let c = 0; c < cnt; c++) {
      if (e[0].startsWith('@')) out.push(...rollLoot(e[0].slice(1), rng, 1, depth + 1));
      else out.push(e[0]);
    }
  }
  return out;
}

// Creature species registry (populated by species modules).
export interface SpeciesLike { key: string; build: () => any; animateGallery?: (rig: any, t: number) => void }
const REG = new Map<string, SpeciesLike>();
export function defSpecies<T extends SpeciesLike>(s: T): T { REG.set(s.key, s); return s; }
/** species made on demand from their key (the procedural wildlife: src/creatures/species/wildlife.ts) */
const RESOLVE: ((key: string) => void)[] = [];
export function speciesResolver(fn: (key: string) => void) { RESOLVE.push(fn); }
export function species(key: string) {
  const s = REG.get(key);
  if (s || !RESOLVE.length) return s;
  for (const r of RESOLVE) { try { r(key); } catch (e) { console.warn('speciesResolver', e); } }
  return REG.get(key);
}
export function allSpecies() { return [...REG.values()]; }

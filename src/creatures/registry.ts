// Creature species registry (populated by species modules).
export interface SpeciesLike { key: string; build: () => any; animateGallery?: (rig: any, t: number) => void }
const REG = new Map<string, SpeciesLike>();
export function defSpecies<T extends SpeciesLike>(s: T): T { REG.set(s.key, s); return s; }
export function species(key: string) { return REG.get(key); }
export function allSpecies() { return [...REG.values()]; }

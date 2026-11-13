// Ported from the user's own creature project (automatic-disco: src/core/rand.ts, the bits src/life needs, plus a
// small species-name generator and the palette type the wild-species designer reads).
export class Rand {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gauss() { let u = 0, v = 0; while (u === 0) u = this.next(); while (v === 0) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  weighted<T>(a: readonly (readonly [T, number])[]): T {
    let t = 0; for (const [, w] of a) t += w;
    let r = this.next() * t;
    for (const [v, w] of a) { r -= w; if (r <= 0) return v; }
    return a[a.length - 1][0];
  }
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const SYL_A = ['bra', 'cor', 'den', 'ful', 'gra', 'hel', 'lum', 'mor', 'nec', 'pal', 'ser', 'tor', 'vel', 'ulc', 'rot'];
const SYL_B = ['us', 'is', 'ax', 'or', 'ens', 'ica', 'oides', 'ata'];
/** a Latin-ish binomial for a species */
export function binomial(r: Rand) {
  const g = r.pick(SYL_A) + r.pick(['', r.pick(SYL_A)]) + r.pick(SYL_B);
  const s = r.pick(SYL_A) + r.pick(SYL_B);
  return g[0].toUpperCase() + g.slice(1) + ' ' + s;
}
/** the colours a wild species is drawn from */
export interface Palette {
  key: string; name: string;
  grass: number; grassDry: number; soil: number; rock: number; sand: number; mud: number; clay: number;
  snow: number; basalt: number; ore: number; crystal: number;
  water: number; waterDeep: number; foam: number;
  foliage: number[]; bark: number[]; bloom: number[]; fungus: number[];
  sky: number; horizon: number; fog: number; sun: number; ambient: number; groundLight: number;
  star: number;
}

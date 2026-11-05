// The commissary's stock: every collectible the player can buy with research
// points and place in the menu rooms. All originals of the game's own cast:
// HEADCASES (big-head vinyl), STANCE (dramatic-pose statuettes) and lab decor.
import type * as THREE from 'three';
import { decoMats, type DMats } from './kit';
import type { DecoModel } from './parts';
import { buildVinyl, VINYL } from './vinyl';
import { statueDebtor, statueVoss, statueGuard, statueResearcher, statueLintel, statueDoe } from './statues';
import { decoRug, decoPlant, decoPoster, decoLava, decoFridge, decoNeon, decoJar, decoBobble, decoMoth } from './decor';

export type Series = 'vinyl' | 'stance' | 'decor';
export interface DecoItem {
  id: string;
  name: string;
  series: Series;
  /** research points */
  price: number;
  blurb: string;
  /** footprint radius (m) at scale 1, for spacing and the ghost's floor mark */
  r: number;
  /** model height (m) at scale 1 */
  h: number;
  /** where it may go: the floor only, or shelves and tables too */
  place: 'floor' | 'any';
  /** lies flat under other things (rugs) */
  under?: boolean;
  /** scale when set on a shelf / table */
  shelf?: number;
  build(m: DMats): DecoModel;
}

const V = (id: string, key: string, price: number, blurb: string): DecoItem => ({
  id, name: VINYL[key].label, series: 'vinyl', price, blurb, r: 0.16, h: 0.5, place: 'any', shelf: 0.5,
  build: (m) => buildVinyl(VINYL[key], m, 0.5, id.length * 7 + price),
});

export const CATALOG: DecoItem[] = [
  // ---- HEADCASES: big-head vinyl
  V('v_debtor', 'debtor', 6, 'The jumpsuit, the number, the band. Head sold separately from the debt.'),
  V('v_hazmat', 'hazmat', 8, 'Sealed for your protection. The visor fogs if you breathe on the box.'),
  V('v_voss', 'voss', 9, 'Arms crossed. Unimpressed. Comes pre-disappointed in you.'),
  V('v_guard', 'guard', 6, 'Visor up, baton ready, absolutely not paid enough.'),
  V('v_calder', 'researcher', 0, 'A gift. Do not tell the others I have a figure.'),
  V('v_cowerling', 'cowerling', 7, 'Six eyes, two ears, one bundle of found things. Do not corner it.'),
  V('v_hush', 'hush', 10, 'Finger to where its lips would be. The box is very, very quiet.'),
  V('v_tallyman', 'tallyman', 10, 'Thirteen beads on three wires. It is counting you.'),
  V('v_mirrorling', 'mirrorling', 11, 'Look into it. Something stands behind you in there.'),
  V('v_plushkin', 'plushkin', 7, 'One eye is a shirt button. It only moves when you blink.'),
  // ---- STANCE: dramatic-pose statuettes
  { id: 's_debtor', name: 'Breakthrough', series: 'stance', price: 18, blurb: 'The moment the wall turned to jelly. Limited cast, the drips glow.', r: 0.3, h: 1.0, place: 'floor', shelf: 0.42, build: (m) => statueDebtor(m, 1.0) },
  { id: 's_voss', name: 'Remit!', series: 'stance', price: 24, blurb: 'Staff Sergeant Voss, projected at one-third scale, pointing at you specifically.', r: 0.3, h: 1.0, place: 'floor', shelf: 0.42, build: (m) => statueVoss(m, 1.0) },
  { id: 's_guard', name: 'Hold the Line', series: 'stance', price: 20, blurb: 'Shield up, baton high, knees bent the way the manual says.', r: 0.32, h: 1.0, place: 'floor', shelf: 0.42, build: (m) => statueGuard(m, 1.0) },
  { id: 's_calder', name: 'Eureka', series: 'stance', price: 22, blurb: 'Dr. Calder and the first stable sample. The vial really glows.', r: 0.3, h: 1.0, place: 'floor', shelf: 0.42, build: (m) => statueResearcher(m, 1.0) },
  { id: 's_lintel', name: 'The Lintel', series: 'stance', price: 28, blurb: 'A doorway that wants you, caught mid-lunge. Mind the teeth.', r: 0.33, h: 1.0, place: 'floor', shelf: 0.42, build: (m) => statueLintel(m, 1.0) },
  { id: 's_doe', name: 'Stilt Doe', series: 'stance', price: 26, blurb: 'Two metres of leg, no eyes, perfect posture.', r: 0.3, h: 1.0, place: 'floor', shelf: 0.42, build: (m) => statueDoe(m, 1.0) },
  // ---- decor
  { id: 'd_rug', name: 'Kilim Rug', series: 'decor', price: 3, blurb: 'Hand-knotted somewhere with windows. Worn where the pacing goes.', r: 0.75, h: 0.02, place: 'floor', under: true, build: (m) => decoRug(m) },
  { id: 'd_plant', name: 'Snake Plant', series: 'decor', price: 0, blurb: 'Survives fluorescent light, neglect and the night shift.', r: 0.17, h: 0.8, place: 'any', shelf: 0.6, build: (m) => decoPlant(m) },
  { id: 'd_poster', name: 'Anatomy Chart', series: 'decor', price: 4, blurb: 'Specimen 02, labelled by hand. Coffee ring included.', r: 0.36, h: 0.95, place: 'floor', build: (m) => decoPoster(m) },
  { id: 'd_lava', name: 'Lava Lamp', series: 'decor', price: 8, blurb: 'Warm wax rising and sinking. The only calm thing on this level.', r: 0.14, h: 0.57, place: 'any', shelf: 0.7, build: (m) => decoLava(m) },
  { id: 'd_fridge', name: 'Mini Fridge', series: 'decor', price: 10, blurb: 'Hums. Shudders. Absolutely no samples in the food fridge.', r: 0.3, h: 0.82, place: 'floor', build: (m) => decoFridge(m) },
  { id: 'd_neon', name: 'Gas-Tube Eye', series: 'decor', price: 12, blurb: 'Bent glass and a tired transformer. It blinks when nobody looks.', r: 0.3, h: 0.52, place: 'any', shelf: 0.75, build: (m) => decoNeon(m) },
  { id: 'd_jar', name: 'Specimen Jar', series: 'decor', price: 9, blurb: 'E-31, curled up and dreaming. Bubbles rise. Do not shake.', r: 0.14, h: 0.49, place: 'any', shelf: 0.8, build: (m) => decoJar(m) },
  { id: 'd_bobble', name: 'Nodding Grinhound', series: 'decor', price: 7, blurb: 'Yes. Yes. Yes. Good boy. Do not feed.', r: 0.2, h: 0.62, place: 'any', shelf: 0.6, build: (m) => decoBobble(m) },
  { id: 'd_moth', name: 'Pinned Lumenmoth', series: 'decor', price: 9, blurb: 'Its scales still glow, a little, at night.', r: 0.22, h: 0.58, place: 'any', shelf: 0.7, build: (m) => decoMoth(m) },
];

export const ITEM = new Map(CATALOG.map((i) => [i.id, i]));
export const SERIES: { key: Series; name: string; sub: string }[] = [
  { key: 'vinyl', name: 'Headcases', sub: 'big-head vinyl' },
  { key: 'stance', name: 'Stance', sub: 'dramatic statuettes' },
  { key: 'decor', name: 'Decor', sub: 'for the lab' },
];
/** the starter gifts (the researcher hands them over) */
export const GIFTS = ['v_calder', 'd_plant'];

/** build a fresh model of an item (materials are shared and ref-counted) */
let MATS: DMats | null = null;
export function makeModel(id: string): DecoModel | null {
  const it = ITEM.get(id);
  if (!it) return null;
  try { return it.build(MATS ??= decoMats()); } catch (e) { console.warn('deco model', id, e); return null; }
}
export type { THREE };

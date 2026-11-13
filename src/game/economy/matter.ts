// MATTER: what things are made of. The Remittance Press weighs every load by
// mass and material; whatever the dial keeps goes down the seam into the lab's
// reservoir (the bank), the rest is remitted as credits. Creating something at the
// press draws exactly its mass back out of the bank (matter is conserved: the
// machine destroys and creates equally). The bank, the tokens and the press dial
// live in the Meridian file (src/game/meridian.ts), so they carry across runs and
// the lab's terminal reads the same numbers. See src/game/economy/index.ts.
import { dollars, addDollars, spendDollars, migrateMoney, INSTALLMENT_DOLLARS } from './money';
import { file, saveFile } from '../meridian';
import { bus } from '../../core/events';
import { itemDef, hasItemDef, type Item, type ItemDef } from '../../items/item';
import { objDef } from '../../world/objects';
import type { TileObject } from '../../world/zone';

export type Mat = 'metal' | 'polymer' | 'fibre' | 'wood' | 'mineral' | 'chem' | 'organic' | 'exotic';
export interface MatInfo { key: Mat; name: string; code: string; color: string; desc: string }
export const MATS: MatInfo[] = [
  { key: 'metal', name: 'Metal', code: 'MET', color: '#c8ccd2', desc: 'iron, steel, copper, tin' },
  { key: 'polymer', name: 'Polymer', code: 'PLY', color: '#7ad0e8', desc: 'plastic, rubber, tape, resin' },
  { key: 'fibre', name: 'Fibre', code: 'FIB', color: '#e8d8a8', desc: 'cloth, paper, rope, thread' },
  { key: 'wood', name: 'Wood', code: 'WOD', color: '#c8884a', desc: 'planks, branches, furniture' },
  { key: 'mineral', name: 'Glass & stone', code: 'MIN', color: '#a8c8c0', desc: 'glass, ceramic, stone, tile' },
  { key: 'chem', name: 'Chemical', code: 'CHM', color: '#c8e85a', desc: 'fuel, solvents, acids, cells' },
  { key: 'organic', name: 'Organic', code: 'ORG', color: '#e8706a', desc: 'flesh, food, wax, plant matter' },
  { key: 'exotic', name: 'Exotic', code: 'EXO', color: '#d88aff', desc: 'anomalous matter that keeps its own rules' },
];
export const MAT = Object.fromEntries(MATS.map((m) => [m.key, m])) as Record<Mat, MatInfo>;
export type Matter = Partial<Record<Mat, number>>;

// ------------------------------------------------------------------ what a thing is made of
/** first match wins: a key or tag fragment -> material split */
const RULES: [RegExp, Matter][] = [
  [/battery|cell\b/, { metal: 0.5, chem: 0.5 }],
  [/plastic|polymer|tape|zip_tie|rubber|tarp|bag_trash|resin|vinyl/, { polymer: 1 }],
  [/glue|bleach|chem|reagent|solvent|acid|fertil|fuel|gas|oil|lye|powder/, { chem: 1 }],
  [/scrap_metal|sheet_metal|pipe|spring|nail|screw|wire|steel|motor|fuse|coin|iron|copper|tin\b|can_|knife|blade|hammer|wrench|rebar|chain|key|metal|brass|chrome/, { metal: 1 }],
  [/plank|firewood|twig|charcoal|chair_leg|wood|branch|log\b|stick|board|crate/, { wood: 1 }],
  [/glass|bulb|fluoro|tube|stone|brick|ceramic|tile|mug|plate|jar|bottle|mirror|shard/, { mineral: 1 }],
  [/leather|fur|wax|tallow|bone|meat|flesh|organ|egg|honey|milk|feather|chitin|gel|comb|jelly|seed|spore|moss|cap\b|fung|lichen|tuber|truffle|roe|heart|liver/, { organic: 1 }],
  [/rag|cloth|sheet|denim|rope|thread|twine|string|cotton|paper|book|card|magazine|notebook|bandage|wool|knit|fuzz|fibre|fiber|strip/, { fibre: 1 }],
];
const CAT: Record<string, Matter> = {
  food: { organic: 1 }, drink: { organic: 0.7, mineral: 0.3 }, corpse: { organic: 1 }, seed: { organic: 1 },
  medical: { chem: 0.5, fibre: 0.3, polymer: 0.2 }, electronics: { metal: 0.5, polymer: 0.35, mineral: 0.15 },
  clothing: { fibre: 0.85, polymer: 0.15 }, bag: { fibre: 0.7, polymer: 0.3 }, weapon: { metal: 0.7, wood: 0.2, polymer: 0.1 },
  tool: { metal: 0.7, wood: 0.15, polymer: 0.15 }, literature: { fibre: 1 }, fuel: { chem: 1 }, light: { metal: 0.45, mineral: 0.3, polymer: 0.25 },
  ammo: { metal: 0.8, chem: 0.2 }, trap: { metal: 0.6, wood: 0.4 }, container: { polymer: 0.5, metal: 0.3, fibre: 0.2 },
  anomaly: { exotic: 1 }, material: { metal: 0.4, polymer: 0.3, fibre: 0.3 }, misc: { polymer: 0.4, metal: 0.3, fibre: 0.3 },
};
const FLUID_MAT: Record<string, Mat> = { gasoline: 'chem', bleach: 'chem', alcohol: 'chem', coolant: 'chem', almond: 'exotic', static: 'exotic' };

const mix = (into: Matter, m: Matter, kg: number) => { for (const k in m) { const v = (m as any)[k] * kg; if (v > 0) (into as any)[k] = ((into as any)[k] ?? 0) + v; } return into; };

/** the material split of one item kind (fractions summing to 1) */
export function defMatter(d: ItemDef): Matter {
  if (d.cat === 'anomaly' || d.anomaly) return { exotic: 1 };
  const hay = d.key + ' ' + (d.tags || []).join(' ');
  let base: Matter | null = null;
  for (const [re, m] of RULES) if (re.test(hay)) { base = m; break; }
  base ||= CAT[d.cat] || CAT.misc;
  // the strange things are part something else
  if ((d.tags || []).includes('weird')) return mix(mix({}, base, 0.7), { exotic: 1 }, 0.3);
  return base;
}

/** the matter in one item (kg by material), its contents and the fluid in it included */
export function itemMatter(it: Item, out: Matter = {}): Matter {
  if (!hasItemDef(it.key)) return out;
  const d = itemDef(it.key);
  let kg = Math.max(0.01, d.weight || 0.05) * (1 - Math.min(0.9, it.eaten ?? 0));
  const count = it.data?.count;
  if (typeof count === 'number' && d.ammoCount) kg *= Math.max(0, count) / d.ammoCount;
  mix(out, defMatter(d), kg);
  if (it.fluid && it.fluid.amount > 0) mix(out, { [FLUID_MAT[it.fluid.type] ?? 'organic']: 1 } as Matter, it.fluid.amount);
  if (it.inv) for (const c of it.inv.items) itemMatter(c, out);
  return out;
}

const SOUND_MAT: Record<string, Matter> = {
  wood: { wood: 0.85, metal: 0.1, fibre: 0.05 }, metal: { metal: 0.9, polymer: 0.1 }, plastic: { polymer: 0.85, metal: 0.15 },
  fabric: { fibre: 0.6, wood: 0.25, polymer: 0.15 }, glass: { mineral: 0.8, metal: 0.2 }, ceramic: { mineral: 1 },
  paper: { fibre: 1 }, flesh: { organic: 1 },
};
/** the matter in a piece of furniture (most of it is air: ~18 kg per cubic metre of bounding box) */
export function objMatter(o: TileObject, out: Matter = {}): Matter {
  const d = objDef(o.key);
  if (!d) return out;
  const vol = (d.w ?? 1) * (d.d ?? 1) * Math.max(0.2, d.height ?? 1);
  const kg = Math.max(1.5, Math.min(160, vol * 18 * (o.state.broken || o.state.debris ? 0.7 : 1)));
  mix(out, (d.sound && SOUND_MAT[d.sound]) || { metal: 0.4, wood: 0.3, polymer: 0.3 }, kg);
  return out;
}

export const matterKg = (m: Matter) => Object.values(m).reduce((s, v) => s + (v || 0), 0);
export const scaleMatter = (m: Matter, k: number): Matter => { const o: Matter = {}; for (const key in m) (o as any)[key] = (m as any)[key] * k; return o; };
/** "12.4 kg" (or grams under a kilo) */
export function fmtKg(kg: number): string { return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg < 10 ? kg.toFixed(2) : kg < 100 ? kg.toFixed(1) : Math.round(kg)} kg`; }

// ------------------------------------------------------------------ the bank (persistent)
export type PressMode = 'remit' | 'split' | 'keep';
export const MODES: { key: PressMode; name: string; share: number; line: string }[] = [
  { key: 'remit', name: 'REMIT', share: 1, line: 'every load is paid to the debt in credits; the seam keeps nothing' },
  { key: 'split', name: 'SPLIT', share: 0.5, line: 'half of every load is paid, half of its matter is kept' },
  { key: 'keep', name: 'KEEP', share: 0, line: 'every load is kept as matter; the debt gets nothing' },
];
export interface PressFile {
  /** banked matter, kg by material */
  m: Matter;
  /** retired Meridian clearance tokens (round 17: converted to dollars once, src/game/economy/money.ts) */
  tok: number;
  /** credits remitted toward the operator's next dollar */
  rem: number;
  /** the dial on the press */
  mode: PressMode;
  /** made at the lab terminal: sent down the chute at the start of the next run */
  disp: string[];
  /** lifetime: kg fed, kg created, tokens earned */
  fed: number; made: number; earned: number;
}
export function press(): PressFile {
  const f = file() as any;
  const p = (f.press && typeof f.press === 'object' ? f.press : (f.press = {})) as PressFile;
  if (!p.m || typeof p.m !== 'object') p.m = {};
  if (!(p.tok >= 0)) p.tok = 0;
  if (!(p.rem >= 0)) p.rem = 0;
  if (!MODES.some((q) => q.key === p.mode)) p.mode = 'remit';
  if (!Array.isArray(p.disp)) p.disp = [];
  for (const k of ['fed', 'made', 'earned'] as const) if (!(p[k] >= 0)) p[k] = 0;
  return p;
}
const changed = () => { saveFile(); bus.emit('matterChanged', press()); };
export const banked = (k: Mat) => press().m[k] ?? 0;
export const bankTotal = () => matterKg(press().m);
/** round 17: creation is paid in DOLLARS, the researcher's money (src/game/economy/money.ts; tokens are retired) */
export const tokens = () => dollars();
export const pressMode = () => press().mode;
export const remitShare = () => MODES.find((q) => q.key === press().mode)!.share;
export function setPressMode(m: PressMode) { const p = press(); if (p.mode === m) return; p.mode = m; changed(); }

/** put matter in the bank (a load the dial kept) */
export function bankMatter(m: Matter) {
  const p = press();
  for (const k in m) { const v = (m as any)[k]; if (v > 0) (p.m as any)[k] = Math.round((((p.m as any)[k] ?? 0) + v) * 1000) / 1000; }
  p.fed += matterKg(m);
  changed();
}
export const canAfford = (m: Matter) => Object.entries(m).every(([k, v]) => banked(k as Mat) + 1e-6 >= (v || 0));
/** take matter out (and pay the dollars) to create something; false when the bank or the purse is short */
export function drawMatter(m: Matter, cost: number): boolean {
  const p = press();
  if (!canAfford(m) || dollars() < cost) return false;
  if (cost > 0 && !spendDollars(cost, 'create')) return false;
  for (const k in m) (p.m as any)[k] = Math.max(0, Math.round((((p.m as any)[k] ?? 0) - ((m as any)[k] || 0)) * 1000) / 1000);
  p.made += matterKg(m);
  changed();
  return true;
}

/** credits remitted per dollar paid to the operator (the Stamp upgrade lowers it; the old name stays for callers) */
export let SCRIP_PER_TOKEN = 25;
export function setScripPerToken(v: number) { SCRIP_PER_TOKEN = v; }
/** credits were remitted to the debt: the Institute pays its operator a dollar for every SCRIP_PER_TOKEN, and a bonus for each installment met */
export function issueTokens(credits: number, installments = 0): number {
  const p = press();
  p.rem += Math.max(0, credits);
  let n = Math.floor(p.rem / SCRIP_PER_TOKEN);
  p.rem -= n * SCRIP_PER_TOKEN;
  n += Math.max(0, installments) * INSTALLMENT_DOLLARS;
  if (n > 0) { p.earned += n; addDollars(n, 'remit'); }
  changed();
  return n;
}
/** dollars straight to the operator (the old token grant) */
export function addTokens(n: number) { if (n > 0) addDollars(n, 'grant'); changed(); }
/** round 17: tokens held on an old profile become dollars, once */
export function migratePressTokens() { migrateMoney(() => press().tok, () => { const p = press(); p.tok = 0; saveFile(); }); }

/** made at the lab terminal: queued for the next run */
export function dispatch(keys: string[]) { const p = press(); p.disp.push(...keys); changed(); }
/** the chute: what the lab made, handed over once (src/game/metaRun.ts) */
export function takeDispatch(): string[] { const p = press(); const out = p.disp.splice(0); if (out.length) changed(); return out; }

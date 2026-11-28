// WHAT A LATTICE NODE COSTS BESIDES ITS RESEARCH POINTS (round 27): materials, the way a crafting recipe costs
// ingredients. Every research node (the trades, the lab's research, the facility: src/game/research.ts buyNode)
// takes, on top of its RP and its level gate, a few lines of the operator's STORES:
//   matter     kilos by material out of the press's bank (src/game/economy/matter.ts: what the units fed the press
//              with the dial on SPLIT or KEEP, or broke down at the dock)
//   valuables  delivered valuables waiting on the lab's delivery dock (src/game/economy/freight.ts: freighted home
//              from a press in the runs), by class: gold (jewellery, watches, cash), tech (electronics, film,
//              copper), curios (antiques, porcelain, glass, the strange)
// A node's lines are explicit (setNodeCost: the facility deck, src/game/facilityTree.ts) or derived from its RP
// and its branch (a trade's own materials, a tier of valuables on the dearer nodes), so a node registered anywhere
// costs something without anyone writing it down. Early nodes cost a kilo or two: one run's SPLIT pays for them.
//   nodeCost(key) -> CostLine[]        resHave(r)     costShort(lines, plus?) -> what is missing
//   payCost(lines) -> { kg, vals }     (the matter drawn and the valuable keys taken off the dock, for the hopper)
import { MATS, MAT, press, matterKg, type Mat, type Matter } from './economy/matter';
import { dockCount, takeFromDock, VAL_CLASS, type ValClass } from './economy/freight';
import { researchNode, setNodeExtra } from './research';
import { bus } from '../core/events';
import { file, saveFile } from './meridian';

export type ResKey = Mat | ValClass;
export interface CostLine { r: ResKey; n: number }
export const isVal = (r: ResKey): r is ValClass => r.startsWith('v_');
/** a resource's display colour and name (the reader draws its icon from it) */
export function resInfo(r: ResKey): { name: string; color: string } {
  if (isVal(r)) return VAL_CLASS[r];
  return { name: MAT[r].name, color: MAT[r].color };
}

const EXPLICIT = new Map<string, CostLine[]>();
/** a node's own cost lines (rank keys too: 'fq_bunk~2') */
export function setNodeCost(key: string, lines: CostLine[]) { EXPLICIT.set(key, lines.filter((l) => l.n > 0)); }

/** each branch's materials: what its work is made of, and the class of valuable its dearer nodes want */
const BRANCH: Record<string, [Mat, Mat, ValClass]> = {
  p_combat: ['metal', 'fibre', 'v_gold'], p_medic: ['chem', 'fibre', 'v_curio'], p_engineer: ['metal', 'wood', 'v_tech'],
  p_scavenger: ['fibre', 'polymer', 'v_gold'], p_cook: ['organic', 'mineral', 'v_curio'], p_botanist: ['organic', 'wood', 'v_curio'],
  p_handler: ['organic', 'fibre', 'v_gold'], p_researcher: ['mineral', 'polymer', 'v_tech'],
  design: ['fibre', 'polymer', 'v_gold'], recipe: ['fibre', 'wood', 'v_curio'], build: ['wood', 'metal', 'v_tech'], device: ['metal', 'polymer', 'v_tech'],
  chip: ['polymer', 'chem', 'v_tech'], limb: ['metal', 'polymer', 'v_tech'], farm: ['organic', 'wood', 'v_curio'], matter: ['metal', 'chem', 'v_tech'],
  talent: ['mineral', 'chem', 'v_curio'],
};
/** a research node's cost lines (none for a free node) */
export function nodeCost(key: string): CostLine[] {
  const hit = EXPLICIT.get(key);
  if (hit) return hit;
  const n = researchNode(key);
  if (!n || !(n.cost > 0)) return [];
  const [a, b, v] = BRANCH[n.branch] ?? ['metal', 'fibre', 'v_gold'];
  const c = n.cost, out: CostLine[] = [{ r: a, n: Math.max(1, Math.min(14, Math.round(c * 0.5))) }];
  if (c >= 4) out.push({ r: b, n: Math.max(1, Math.min(10, Math.round(c * 0.3))) });
  if (c >= 8) out.push({ r: v, n: c >= 16 ? 2 : 1 });
  return out;
}

/** what the stores hold of one resource (kilos of matter, whole valuables) */
export function resHave(r: ResKey): number { return isVal(r) ? dockCount(r) : press().m[r] ?? 0; }
/** sum lines by resource */
export function sumLines(...ls: CostLine[][]): CostLine[] {
  const m = new Map<ResKey, number>();
  for (const l of ls) for (const q of l) m.set(q.r, (m.get(q.r) ?? 0) + q.n);
  return [...m].map(([r, n]) => ({ r, n }));
}
/** the lines the stores cannot cover (with `plus` already spoken for: a staged plan) */
export function costShort(lines: CostLine[], plus: CostLine[] = []): CostLine[] {
  const need = sumLines(lines, plus);
  return need.filter((l) => lines.some((q) => q.r === l.r) && resHave(l.r) + 1e-6 < l.n);
}
export const costCovered = (lines: CostLine[], plus: CostLine[] = []) => costShort(lines, plus).length === 0;

/** take the lines out of the stores: the matter off the bank, the valuables off the dock (null when short) */
export function payCost(lines: CostLine[]): { kg: Matter; vals: string[] } | null {
  if (!costCovered(lines)) return null;
  const kg: Matter = {}, vals: string[] = [];
  const p = press();
  for (const l of lines) {
    if (isVal(l.r)) { vals.push(...takeFromDock(l.r, l.n)); continue; }
    p.m[l.r] = Math.max(0, Math.round(((p.m[l.r] ?? 0) - l.n) * 1000) / 1000);
    kg[l.r] = l.n;
  }
  if (matterKg(kg) > 0) { p.made += matterKg(kg); saveFile(); bus.emit('matterChanged', p); }
  const f = file() as unknown as { spent?: number };
  f.spent = (f.spent ?? 0) + lines.length;
  return { kg, vals };
}

/** the last payment (the lattice's hopper plays it: the bricks of matter and the valuables, fed in one by one) */
export let lastPaid: { key: string; kg: Matter; vals: string[] } | null = null;
// research.ts asks before a node is bought and takes the materials when it is
setNodeExtra({
  ok: (key) => costCovered(nodeCost(key)),
  pay: (key) => { const r = payCost(nodeCost(key)); if (r) lastPaid = { key, ...r }; return !!r; },
});
export const MAT_KEYS: Mat[] = MATS.map((m) => m.key);

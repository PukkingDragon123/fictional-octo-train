// Research points (RP): the persistent meta currency. Missions, scans and quests
// grant them; the lab's research tree (the Control Room, between runs) spends them.
// Both live in the browser profile, so they carry across runs.
import { bus } from '../core/events';
import { addStat, stat, isUnlocked, unlock } from './profile';

export function researchPoints(): number { return stat('rp'); }

export function grantResearch(n: number, reason = '') {
  if (!(n > 0)) return;
  addStat('rp', n); addStat('rp_total', n);
  bus.emit('research', { n, reason, total: researchPoints() });
}

export function spendResearch(n: number, reason = ''): boolean {
  if (n < 0 || researchPoints() < n) return false;
  addStat('rp', -n);
  bus.emit('research', { n: -n, reason, total: researchPoints() });
  return true;
}

/** a node in the research tree: blueprints, recipes, knowledge, cyberware, scanner firmware */
export interface ResearchNode {
  key: string;
  branch: string;
  title: string;
  desc: string;
  cost: number;
  requires?: string[];
  icon?: string;
  /** shown but not buyable until this returns true (e.g. a quest flag) */
  gate?: () => boolean;
  gateHint?: string;
}

const NODES = new Map<string, ResearchNode>();
/** round 17: gates registered by key before or after the node exists (requirement quests, src/game/reqQuests.ts) */
const GATES = new Map<string, { ok: () => boolean; hint: () => string }>();
function applyGate(n: ResearchNode, g: { ok: () => boolean; hint: () => string }) {
  if (n.gate) return;
  n.gate = g.ok;
  // a live hint (a quest's progress reads fresh every time a tree paints it)
  Object.defineProperty(n, 'gateHint', { get: g.hint, configurable: true, enumerable: true });
}
export function defNode(n: ResearchNode) { const g = GATES.get(n.key); if (g) applyGate(n, g); NODES.set(n.key, n); return n; }
/** lock a node (shown, not buyable) until ok() holds; hint() says what it wants (read each time it is shown) */
export function gateNode(key: string, ok: () => boolean, hint: () => string) {
  const g = { ok, hint };
  GATES.set(key, g);
  const n = NODES.get(key);
  if (n) applyGate(n, g);
}
export function researchNodes(branch?: string): ResearchNode[] { return [...NODES.values()].filter((n) => !branch || n.branch === branch); }
export function researchNode(key: string) { return NODES.get(key); }

/** owned research (persistent); free nodes (cost 0, no requires, no gate) count as owned */
export function hasUnlock(key: string): boolean {
  if (isUnlocked('rp:' + key)) return true;
  const n = NODES.get(key);
  return !!n && n.cost <= 0 && !n.requires?.length && !n.gate;
}

export function canBuy(key: string): boolean {
  const n = NODES.get(key);
  if (!n || hasUnlock(key)) return false;
  if (n.requires?.some((r) => !hasUnlock(r))) return false;
  if (n.gate && !n.gate()) return false;
  return researchPoints() >= n.cost;
}

export function buyNode(key: string): boolean {
  if (!canBuy(key)) return false;
  const n = NODES.get(key)!;
  if (!spendResearch(n.cost, 'node:' + key)) return false;
  unlock('rp:' + key);
  bus.emit('researchUnlocked', key);
  return true;
}

/** dev / quest rewards: grant a node without paying */
export function grantNode(key: string) { if (unlock('rp:' + key)) bus.emit('researchUnlocked', key); }

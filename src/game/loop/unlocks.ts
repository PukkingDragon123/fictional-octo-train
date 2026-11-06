// What the research points buy: the control room's tree (src/game/unitTree.ts)
// read for the loop's last two steps, the run-end summary ("what it unlocks",
// src/ui/death) and the menu's next-step hint (./nextStep.ts).
//   outlook()   the nodes open now (affordable, not locked), the cheapest one still out of reach
import { treeNodes, nodeState, rankOf, BRANCHES, type TreeNode } from '../unitTree';
import { researchPoints } from '../research';

export interface Pick { key: string; title: string; cost: number; branch: string; gives: string }
export interface Outlook { rp: number; open: Pick[]; openCount: number; next: (Pick & { need: number }) | null }

const ROMAN = ['', '', ' II', ' III', ' IV', ' V'];
function pick(n: TreeNode): Pick {
  const r = rankOf(n);
  const br = BRANCHES.find((b) => b.key === n.branch);
  return { key: n.key, title: n.title + (n.ranks > 1 ? ROMAN[Math.min(5, r + 1)] : ''), cost: n.costs[r] ?? 0, branch: br?.name ?? n.branch, gives: n.gives[r] ?? '' };
}

export function outlook(): Outlook {
  const rp = researchPoints();
  const open: Pick[] = [];
  let next: (Pick & { need: number }) | null = null;
  try {
    for (const n of treeNodes()) {
      const st = nodeState(n);
      if (st === 'open') { const p = pick(n); if (p.cost > 0) open.push(p); }
      else if (st === 'poor') { const p = pick(n); if (!next || p.cost < next.cost) next = { ...p, need: p.cost - rp }; }
    }
  } catch (e) { console.warn('research outlook', e); }
  // the dearest first: the ones worth coming back for
  open.sort((a, b) => b.cost - a.cost);
  return { rp, open: open.slice(0, 3), openCount: open.length, next };
}

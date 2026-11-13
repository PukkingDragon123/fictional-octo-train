// The talent bench's paperwork: which marbles the Institute has (unlocks), and
// which are on the scale for the next unit (the loadout, kept in the Meridian
// file next to the fitted chips so every new unit starts from the last choice).
//   marbleOwned(m)        unlocked yet? (start / research lattice / commendation / codex / deaths)
//   unlockHint(m)         how to get it, for a locked marble's card
//   loadout() / setLoadout(keys)    the marbles on the scale (only owned ones count)
//   freshMarbles() / markSeen(keys)  marbles unlocked since the bench was last opened (they glint)
// The research-lattice marbles are registered as offers on their own branch (MRB).
import { MARBLES, MARBLE, balanced, type Marble } from '../survival/talents';
import { treeCategory, treeOffers } from './treeData';
import { hasUnlock } from './research';
import { earned, ACH } from './achievements';
import { file, saveFile, discoveredCount, deathCount } from './meridian';

const nodeKey = (m: Marble) => 'mrb_' + m.key;

treeCategory({ key: 'talent', name: 'Marbles', sub: 'talents for the bench · buffs to weigh', code: 'MRB', order: 45 });
treeOffers(MARBLES.filter((m) => m.unlock.kind === 'tree').map((m) => ({
  key: nodeKey(m), category: 'talent', lane: m.kind === 'buff' ? 'Buffs' : 'Debuffs', title: m.name + ' marble',
  desc: `${m.line} ${m.good.join('. ')}. Weighs ${m.weight} g on the talent bench.`,
  cost: (m.unlock as { cost: number }).cost, requires: (m.unlock as { requires?: string[] }).requires,
  item: 'marbles', alt: ['dice', 'gumball'], gives: `marble: ${m.name} (talent bench)`,
})));

export function marbleOwned(m: Marble): boolean {
  const u = m.unlock;
  try {
    switch (u.kind) {
      case 'start': return true;
      case 'tree': return hasUnlock(nodeKey(m));
      case 'ach': return earned(u.key);
      case 'codex': return discoveredCount() >= u.n;
      case 'deaths': return deathCount() >= u.n;
    }
  } catch { return u.kind === 'start'; }
  return false;
}
export function unlockHint(m: Marble): string {
  const u = m.unlock;
  switch (u.kind) {
    case 'start': return 'Issued to every unit.';
    case 'tree': return `Research it on the main computer: Marbles branch, ${u.cost} RP.`;
    case 'ach': return `Commendation: ${ACH.get(u.key)?.name ?? u.key}. ${u.why}.`;
    case 'codex': return `Discover ${u.n} codex entries (${Math.min(u.n, safe(discoveredCount))} so far).`;
    case 'deaths': return `Lose ${u.n} units (${Math.min(u.n, safe(deathCount))} so far).`;
  }
}
const safe = (f: () => number) => { try { return f(); } catch { return 0; } };
export const ownedMarbles = () => MARBLES.filter(marbleOwned);

interface TalentFile { talents?: string[]; talentSeen?: string[] }
const tf = () => file() as unknown as TalentFile;
/** the marbles on the scale for the next unit (owned ones only; an unbalanced set is never handed out) */
export function loadout(): string[] {
  const keys = (tf().talents ?? []).filter((k) => { const m = MARBLE.get(k); return !!m && marbleOwned(m); });
  return balanced(keys) ? keys : keys.filter((k) => MARBLE.get(k)!.kind === 'debuff');
}
export function setLoadout(keys: string[]) { tf().talents = [...new Set(keys)].filter((k) => MARBLE.has(k)); saveFile(); }
/** owned marbles the bench has not shown yet */
export function freshMarbles(): Set<string> {
  const seen = new Set(tf().talentSeen ?? MARBLES.filter((m) => m.unlock.kind === 'start').map((m) => m.key));
  return new Set(ownedMarbles().filter((m) => !seen.has(m.key)).map((m) => m.key));
}
export function markSeen(keys: Iterable<string>) {
  const f = tf();
  const s = new Set(f.talentSeen ?? MARBLES.filter((m) => m.unlock.kind === 'start').map((m) => m.key));
  let n = 0; for (const k of keys) if (!s.has(k)) { s.add(k); n++; }
  if (n || !f.talentSeen) { f.talentSeen = [...s]; saveFile(); }
}

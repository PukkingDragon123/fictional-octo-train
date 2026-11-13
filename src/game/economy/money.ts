// THE THREE CURRENCIES (round 17). There are exactly three kinds of money, and
// everything that costs or pays is in one of them:
//   CREDITS          the unit's money in a run: the press pays them, they pay the debt and
//                    passage, strangers trade in them. (Older code and saves call them
//                    "scrip": the numbers are the same, the ledger holds them.)
//   DOLLARS          the researcher's money, between runs: the lab commissary, the emote
//                    jukebox, creation at the press terminal. The Institute pays its operator
//                    for every load remitted ($1 per 25 credits, per 15 with the Stamp upgrade)
//                    and a bonus for every installment met. Kept on the operator's profile.
//   RESEARCH POINTS  knowledge: the research lattice and the skill tree (src/game/research.ts).
// Everything else that looked like money is an ITEM: coins, cash rolls, silver dollars,
// subway tokens. The press turns items into credits.
// Old profiles: the retired clearance TOKENS are converted to dollars once ($20 each), and an
// operator who has never had a purse gets a starting one (migrateMoney, called at boot).
import { bus } from '../../core/events';
import { stat, addStat } from '../profile';
import { researchPoints } from '../research';
import { file, saveFile } from '../meridian';

const fmtN = (n: number) => Math.round(n).toLocaleString('en-GB');
export const CURRENCY = {
  credits: { key: 'credits', name: 'CREDITS', unit: 'credits', short: 'cr', fmt: (n: number) => `${fmtN(n)} cr` },
  dollars: { key: 'dollars', name: 'DOLLARS', unit: 'dollars', short: '$', fmt: (n: number) => `$${fmtN(n)}` },
  rp: { key: 'rp', name: 'RESEARCH POINTS', unit: 'RP', short: 'RP', fmt: (n: number) => `${fmtN(n)} RP` },
} as const;

/** what a retired clearance token is worth in dollars */
export const DOLLARS_PER_TOKEN = 20;
/** an installment met pays the operator this bonus */
export const INSTALLMENT_DOLLARS = 50;
const START_PURSE = 150;

export const dollars = () => { migrate(); return Math.max(0, Math.floor(stat('dollars'))); };
export function addDollars(n: number, why = '') {
  migrate();
  if (!(n > 0)) return;
  addStat('dollars', Math.round(n)); addStat('dollars_total', Math.round(n));
  bus.emit('money', { cur: 'dollars', n: Math.round(n), why, total: dollars() });
}
export function spendDollars(n: number, why = ''): boolean {
  n = Math.round(n);
  if (n < 0 || dollars() < n) return false;
  addStat('dollars', -n);
  bus.emit('money', { cur: 'dollars', n: -n, why, total: dollars() });
  return true;
}
/** the purse line for the HUD, the pause screen and the band desktop */
export function purseLine(credits: number | null): string {
  const parts: string[] = [];
  if (credits != null) parts.push(CURRENCY.credits.fmt(credits));
  parts.push(CURRENCY.dollars.fmt(dollars()));
  let rp = 0; try { rp = researchPoints(); } catch { /* no profile */ }
  parts.push(CURRENCY.rp.fmt(rp));
  return parts.join(' · ');
}

/** once per profile: retired tokens (the press file on the Meridian file) become dollars, and the operator gets a purse */
let migrated = false;
function migrate() {
  if (migrated) return;
  migrated = true;
  try {
    if (stat('money_v17') > 0) return;
    const pf = (file() as { press?: { tok?: number } }).press;
    const tok = Math.max(0, Math.floor(Number(pf?.tok) || 0));
    addStat('money_v17', 1);
    addStat('dollars', START_PURSE + tok * DOLLARS_PER_TOKEN);
    if (pf && tok) { pf.tok = 0; saveFile(); }
  } catch (e) { console.warn('money migration', e); migrated = false; }
}
/** kept for callers: the migration runs on the first read of the purse */
export function migrateMoney(_tokensHeld?: () => number, _clear?: () => void) { migrate(); }

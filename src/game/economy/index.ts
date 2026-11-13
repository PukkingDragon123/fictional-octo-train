// =============================================================================
// THE ECONOMY: one model, four quantities (round 15)
//
//   (round 17: there are three currencies, src/game/economy/money.ts: CREDITS in a run (the old
//   "scrip"), DOLLARS for the researcher between runs (the old clearance tokens became dollars),
//   RESEARCH POINTS. The notes below are the round 15 design, with those names.)
//   CREDITS   the run's money. What a load is WORTH to Meridian. The press credits
//           it to the crew's debt (src/game/debt/ledger.ts); once the debt is
//           cleared, surplus credits buys passage at the depot. Strangers trade in
//           it too. It lives in the save of one world. Shown on the press's
//           nixie tubes and the ledger.
//   TOKENS  clearance tokens: Meridian's permission to make things. The press
//           stamps one for every 250 credits remitted (150 with the Token Stamp)
//           and three for every installment met. Paying the debt is how you
//           earn them. Every creation at the press costs tokens.
//   MATTER  what a load is MADE OF, in kg by material (metal, polymer, fibre,
//           wood, glass & stone, chemical, organic, exotic). The press destroys
//           and creates equally: what the dial keeps goes down the seam into the
//           lab's reservoir, and creating something draws exactly its mass back.
//   RP      research points: knowledge. Scans, samples and quests earn them; the
//           lab's research lattice spends them. A creation PATTERN must be
//           researched before the press can make it.
//
//   the dial on the press:   REMIT  value -> credits (debt) -> tokens
//                            SPLIT  half and half
//                            KEEP   mass  -> matter (bank)
//   to create:               pattern (RP, once) + matter (kg) + tokens  -> the item on the plate
//
// Tokens, matter and RP belong to the operator (the Meridian file, kept
// between runs, read by the lab terminal); credits belongs to the run.
//
// Modules: matter.ts (the bank, materials, tokens), registry.ts (everything
// as data for the lab's lattice: patterns, press upgrades, homestead pieces,
// plants, livestock, recipes), terminal.ts (the press TERMINAL panel, in a
// run and in the lab), homestead.ts (forage, pens, livestock), plantModels.ts.
// =============================================================================
import { G } from '../G';
import { bus } from '../../core/events';
import { hasUnlock } from '../research';
import type { Game, GameSystem } from '../game';
import type { Player } from '../../entities/player';
import type { TileObject, Zone } from '../../world/zone';
import type { MenuOption } from '../../ui/ui';
import type { WorldItem } from '../../items/worldItems';
import {
  itemMatter, objMatter, scaleMatter, matterKg, bankMatter, issueTokens, remitShare, setScripPerToken, takeDispatch, fmtKg, migratePressTokens, type Matter,
} from './matter';
import { wireHomestead, penStep, homesteadUpdate } from './homestead';
import { seedEconomyLoot } from '../../content/items/ze_economy';
import { selfThought } from '../debt/voice';
import './registry';

export * from './matter';
export * from './money';
export { economyCatalogue, PATTERNS, PRESS_UPGRADES, HOMESTEAD, PLANTS, LIVESTOCK, HUSBANDRY, ECON_RECIPES } from './registry';

/** the press runs with no contract (free survival, before intake) once Cold Start is researched */
export const pressCold = () => hasUnlock('pr_cold');

/**
 * Host: settle a load the press just took. The dial splits it: the remitted
 * share of its credits VALUE goes to the debt (and pays the operator dollars), the kept
 * share of its MATTER goes to the bank. Returns the credits paid.
 */
export function settleLoad(value: number, items: WorldItem[], objs: TileObject[], by: string): { credit: number; kg: number } {
  const m: Matter = {};
  for (const wi of items) itemMatter(wi.item, m);
  for (const o of objs) objMatter(o, m);
  const contract = !!G.debt?.on;
  const share = contract ? remitShare() : 0;
  let credit = Math.round(value * share);
  if (credit > 0 && G.debt) {
    const n0 = G.debt.s.n;
    credit = G.debt.credit(credit, 'deposit', by) || credit;
    const tok = issueTokens(credit, Math.max(0, G.debt.s.n - n0));
    if (tok > 0 && by === G.local?.id) noteTokens(tok);
  }
  const keep = 1 - share;
  const kept = keep > 0 ? scaleMatter(m, keep) : {};
  const kg = matterKg(kept);
  if (kg > 0) bankMatter(kept);
  if (kg > 0 && by === G.local?.id) noteKept(kg);
  return { credit, kg };
}

let saidTok = false, saidKeep = false;
function noteTokens(n: number) {
  if (saidTok) return;
  saidTok = true;
  setTimeout(() => selfThought(`The Institute paid my operator $${n} for that. Dollars: the lab commissary takes them.`), 2600);
}
function noteKept(kg: number) {
  if (saidKeep) return;
  saidKeep = true;
  setTimeout(() => selfThought(`${fmtKg(kg)} kept in the seam. The crown counts it in tenths of a kilo.`), 2400);
}

export class EconomySystem implements GameSystem {
  name = 'economy';
  constructor() { (G as any).econ = this; }
  /** the creature manager's hook: a penned creature wanders its pen */
  penStep(c: any, z: Zone, dt: number) { return penStep(c, z, dt); }
  update(_dt: number, dh: number) { homesteadUpdate(dh); }
}

let wired = false;
/** session start (src/game/debt/index.ts installContract) */
export function installEconomy(g: Game) {
  wireHomestead();
  try { seedEconomyLoot(); } catch (e) { console.warn('economy loot', e); }
  g.addSystem(new EconomySystem());
  setScripPerToken(hasUnlock('pr_stamp') ? 15 : 25);
  migratePressTokens();
  if (wired) return;
  wired = true;
  bus.on('researchUnlocked', () => setScripPerToken(hasUnlock('pr_stamp') ? 15 : 25));
  // the Seam Relay: a claim beacon is a press terminal
  bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => {
    if (o.key !== 'bld_beacon' || !hasUnlock('pr_relay')) return;
    out.push({ label: 'Seam relay: press terminal', action: () => { void import('./terminal').then((m) => m.openPressTerminal({ from: 'relay', o, p })); } });
  });
}

/** the lab's chute: what the lab terminal made goes into the next run (src/game/metaRun.ts) */
export function dispatchedKit(): string[] { return takeDispatch(); }

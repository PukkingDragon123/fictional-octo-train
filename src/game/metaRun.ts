// A run under the Meridian file (src/game/meridian.ts) and its codex
// (src/game/codex.ts): the session calls startMetaRun() once the local
// survivor exists. Every session (new, loaded, co-op) files what it meets
// (inhabitants, the levels walked, the items carried: the codex archive reads
// them), listens for commendations, banks samples that reach the lab (the
// press, the way out: src/research/bank.ts) and runs the research tools'
// passives; a NEW run also counts toward the milestones, gets the starting kit
// (the milestones' allowance and the tools picked in the lab's requisition)
// and the unit's fit from the unit room (applyUnitFit: chips and limbs).
import type { Game } from './game';
import type { Player } from '../entities/player';
import { G } from './G';
import { bus } from '../core/events';
import { wireField, noteRunStart, noteRunEnd, notePlace, noteFound } from './meridian';
import { startingKit } from './codex';
import { wireAchievements, runStarted } from './achievements';
import { wireSampleBank, carriedSamples } from '../research/bank';
import { researchToolSystem } from '../research/tools';
import { chipTraits, fittedLimbs } from './unitTree';
import { applyLoadout, cyberDefByItem } from '../survival/cyber';
import { grantNode, hasUnlock } from './research';
import { dispatchedKit } from './economy';

/**
 * The unit as the unit room left it: every fitted chip's traits (each rank
 * owned so far) and every fitted limb, installed as if the operating table had
 * done it. Called once, for a fresh survivor.
 */
export function applyUnitFit(p: Player) {
  for (const t of chipTraits()) p.body.traits.add(t);
  const limbs = fittedLimbs();
  if (Object.keys(limbs).length) applyLoadout(p, limbs);
}

let filing = false;
/** the codex archive's Places and Items (installed once per page) */
function wireFiling() {
  if (filing) return;
  filing = true;
  bus.on('enterZone', (z: any, pl: any) => { if (pl && pl === G.local && z?.key) notePlace(String(z.key)); });
  let t = 0;
  bus.on('inventoryChanged', (pl: any) => {
    if (!pl || pl !== G.local || t) return;
    t = window.setTimeout(() => { t = 0; try { noteFound((G.local as Player | null)?.allItems().map((i) => i.key) ?? []); } catch { /* mid-teardown */ } }, 1500);
  });
  // salvaged hardware that reaches the lab (fed to a press) is reverse-engineered: its limb research is filed
  bus.on('deposited', (e: { by?: string; keys?: string[] }) => {
    if (!e?.keys?.length || (e.by && e.by !== G.local?.id)) return;
    for (const k of e.keys) {
      const d = cyberDefByItem(k);
      if (d?.node && !hasUnlock(d.node)) { grantNode(d.node); if (G.local) bus.emit('halo', G.local, `${d.name}: the lab files the design`, 'good'); }
    }
  });
}

export function startMetaRun(g: Game, p: Player, o: { fresh: boolean; give: (key: string) => void }) {
  wireField();
  wireSampleBank();
  wireFiling();
  if (p.zoneKey) notePlace(p.zoneKey);
  // the file remembers the run before the commendations read it; samples on the body are lost
  let ended = false;
  const end = (cause: string) => { if (ended) return; ended = true; noteRunEnd(cause, carriedSamples(p).length); };
  bus.on('runReport', (r: any) => end(String(r?.cause?.who || r?.cause?.text || 'unknown')));
  bus.on('death', (pl: Player) => { if (pl === p) setTimeout(() => end('unknown'), 4000); });
  wireAchievements(() => G.local?.id);
  g.addSystem(researchToolSystem());
  if (!o.fresh) return;
  noteRunStart();
  try { applyUnitFit(p); } catch (e) { console.warn('unit fit', e); }
  for (const k of startingKit()) { try { o.give(k); } catch { /* unknown item */ } }
  // what the lab's press terminal made between runs comes down the chute with the kit (src/game/economy)
  for (const k of dispatchedKit()) { try { o.give(k); } catch { /* unknown item */ } }
  runStarted();
}

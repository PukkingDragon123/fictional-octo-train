// What clicking a hole in the IV bag can do for that wound, Zomboid health-panel
// style: every treatment the wound still needs, each naming the item it would use
// (or what is missing). The actions are the existing medical timed actions.
import type { Player } from '../../entities/player';
import type { Item, ItemDef } from '../../items/item';
import { itemDef } from '../../items/item';
import type { Injury } from '../../survival/body';
import { INJURY_INFO, PART_NAMES } from '../../survival/body';
import type { TimedAction } from '../../actions/action';
import {
  BandageAction, DisinfectAction, StitchAction, SplintAction, RemoveForeignAction,
  RemoveBandageAction, RemoveTourniquetAction, CauterizeAction, CloseStumpAction,
  isTourniquet, isStump, tourniquetable,
} from '../../actions/medical';
import { G } from '../../game/G';

export interface TreatOpt {
  key: 'tq' | 'untq' | 'pull' | 'disinfect' | 'stitch' | 'bandage' | 'rebandage' | 'unbandage' | 'splint' | 'caut' | 'close';
  label: string;
  /** item that will be used (display name) */
  using?: string;
  /** why it cannot be done right now */
  missing?: string;
  run?: () => void;
}

const has = (p: Player, f: (it: Item, d: ItemDef) => boolean) => p.findItem(f) || null;
/** best bandage first: sterile and strong, dirty last */
function bestBandage(p: Player): Item | null {
  let best: Item | null = null, score = -1;
  for (const it of p.allItems()) {
    const d = itemDef(it.key);
    if (d.medical?.type !== 'bandage' || isTourniquet(it)) continue;
    const s = (d.medical.power ?? 1) + (d.medical.sterile ? 2 : 0) - (/dirty/.test(d.key) || it.data?.dirty ? 5 : 0);
    if (s > score) { score = s; best = it; }
  }
  return best;
}
function usableDisinfect(p: Player): Item | null {
  return has(p, (it, d) => d.medical?.type === 'disinfect' && (d.fluidCap ? (it.fluid?.amount ?? 0) > 0.02 : (it.uses ?? 1) > 0.01));
}
const nm = (it: Item | null) => (it ? itemDef(it.key).name : undefined);

/** a wound that still wants something done (drives the hole's "needs care" pulse) */
export function needsCare(inj: Injury): boolean {
  if (inj.type === 'bruise') return false;
  if (inj.type === 'fracture') return !inj.splinted;
  if (inj.foreign) return true;
  if (isStump(inj)) return !inj.bandage || (!inj.stitched && !inj.caut);
  if (inj.bandage && inj.bandage.soak > 0.8) return true;
  if (inj.type === 'burn') return !inj.bandage;
  return !inj.bandage || inj.infection > 0.15;
}

export function treatOptions(p: Player, inj: Injury): TreatOpt[] {
  const o: TreatOpt[] = [];
  const run = (a: TimedAction) => () => { p.actions.clear(); p.actions.add(a); };
  const bandage = bestBandage(p);
  const dis = usableDisinfect(p);
  const needle = has(p, (_it, d) => d.medical?.type === 'suture') || p.findTool('#needle') || null;
  const thread = p.findTool('#thread') || null;
  const splint = has(p, (_it, d) => d.medical?.type === 'splint');
  const tweez = has(p, (_it, d) => d.medical?.type === 'tweezers');
  const tq = has(p, (it) => isTourniquet(it));
  const stump = isStump(inj);
  const bleedsHard = inj.bleed >= 0.5 && !inj.stitched && !inj.caut;

  if (inj.tq != null) o.push({ key: 'untq', label: 'Loosen tourniquet', run: run(new RemoveTourniquetAction(p, p, inj)) });
  else if (tourniquetable(inj) && (stump || bleedsHard)) o.push({ key: 'tq', label: 'Tourniquet', using: nm(tq), missing: tq ? undefined : 'a tourniquet or belt', run: tq ? run(new BandageAction(p, p, inj, tq)) : undefined });
  if (inj.foreign) o.push({ key: 'pull', label: inj.type === 'bullet' ? 'Dig out the bullet' : 'Pull the shard', using: nm(tweez) || 'bare fingers', run: run(new RemoveForeignAction(p, p, inj, tweez)) });
  if (inj.type === 'fracture') {
    if (!inj.splinted) o.push({ key: 'splint', label: 'Splint', using: nm(splint), missing: splint ? undefined : 'a splint', run: splint ? run(new SplintAction(p, p, inj, splint)) : undefined });
    return o;
  }
  if (inj.type === 'bruise') return o;
  if (stump) {
    if (!inj.caut && !inj.stitched) {
      const heat = G.interact?.nearHeat?.(p) || ((G as any).fireNear?.(p.x, p.z, p.zoneKey) ?? 0) > 0;
      const knife = p.findTool('#knife') || p.findTool('#sharp') || p.findTool('scalpel') || null;
      const flame = p.findTool('#lighter') || p.findTool('#matches') || p.findTool('lighter') || p.findTool('matches');
      if (heat) o.push({ key: 'caut', label: 'Cauterise in the flame', run: run(new CauterizeAction(p, p, inj, 'fire', null)) });
      else o.push({ key: 'caut', label: 'Cauterise (hot blade)', using: nm(knife), missing: !knife ? 'a blade' : !flame ? 'a flame' : undefined, run: knife && flame ? run(new CauterizeAction(p, p, inj, 'blade', knife)) : undefined });
      o.push({ key: 'close', label: 'Stitch the stump', using: nm(needle), missing: needle ? undefined : 'a needle', run: needle ? run(new CloseStumpAction(p, p, inj, needle, thread)) : undefined });
    }
  } else {
    if (inj.disinfected <= 0 || inj.infection > 0.1) o.push({ key: 'disinfect', label: 'Disinfect', using: nm(dis), missing: dis ? undefined : 'alcohol or disinfectant', run: dis ? run(new DisinfectAction(p, p, inj, dis)) : undefined });
    if ((inj.type === 'deep' || inj.type === 'laceration' || inj.type === 'bite') && !inj.stitched && !inj.foreign) o.push({ key: 'stitch', label: 'Stitch', using: nm(needle), missing: needle ? undefined : 'a needle', run: needle ? run(new StitchAction(p, p, inj, needle, thread)) : undefined });
  }
  if (!inj.bandage) o.push({ key: 'bandage', label: 'Bandage', using: nm(bandage), missing: bandage ? undefined : 'a bandage or rag', run: bandage ? run(new BandageAction(p, p, inj, bandage)) : undefined });
  else {
    if (inj.bandage.soak > 0.5 || !inj.bandage.clean) o.push({ key: 'rebandage', label: 'Fresh bandage', using: nm(bandage), missing: bandage ? undefined : 'a bandage or rag', run: bandage ? run(new BandageAction(p, p, inj, bandage)) : undefined });
    o.push({ key: 'unbandage', label: 'Take bandage off', run: run(new RemoveBandageAction(p, p, inj)) });
  }
  return o;
}

/** what a plain click does: stop the bleeding first, then clean, close and cover */
const ORDER: TreatOpt['key'][] = ['tq', 'bandage', 'rebandage', 'pull', 'disinfect', 'stitch', 'close', 'caut', 'splint'];
export function bestTreatment(inj: Injury, opts: TreatOpt[]): TreatOpt | null {
  const ok = opts.filter((x) => x.run && !x.missing && x.key !== 'unbandage' && x.key !== 'untq');
  const bleeding = inj.bleed * (1 - inj.heal) > 0.25 && !inj.bandage && inj.tq == null && !inj.stitched;
  // a foreign body under a bandage keeps cutting: pull it first unless it is pouring
  const order = bleeding ? ORDER : (['pull', 'disinfect', 'stitch', 'close', 'caut', 'bandage', 'rebandage', 'splint', 'tq'] as TreatOpt['key'][]);
  for (const k of order) { const f = ok.find((x) => x.key === k); if (f) return f; }
  return null;
}

export function woundTitle(inj: Injury): string {
  return `${INJURY_INFO[inj.type].name} · ${PART_NAMES[inj.part]}`;
}

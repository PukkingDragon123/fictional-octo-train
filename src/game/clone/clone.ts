// CLONING AND REVIVE (round 21, wave 4). Unlocked later, the lab's way:
//   1. research the CLONE VAT on the lattice (Devices, "Lab" lane)
//   2. fund and build its station in the control room (src/ui/menus/lab/stations.ts, key 'clone'):
//      the first clone is grown with it
//   3. press the vat to grow another one (dollars), one at a time: the Meridian file banks it
// When the unit dies with a clone banked (solo), the death is held back (bus.gate, src/core/events.ts)
// and the revive plays instead (./revive.ts): the vat drains, the sleeve lifts and the new body (the
// unit's own HumanRig) steps out. The operator is linked into it and it is put down at the relay that
// last held a checkpoint on this level, or where the level lets units in. It keeps the unit's skills,
// archetype and kit; the body is fresh. Old saves: no field, no clones.
//   clonesBanked()  canGrow() -> '' | why  growClone()  installClone(g, p)
import { G } from '../G';
import { bus } from '../../core/events';
import type { Game } from '../game';
import type { Player } from '../../entities/player';
import type { Appearance } from '../../entities/humanRig';
import { file, saveFile } from '../meridian';
import { treeOffers } from '../treeData';
import { dollars, spendDollars } from '../economy/money';

/** the research node that unlocks the station */
export const CLONE_NODE = 'clone_vat';
export const CLONE_MAX = 1;
export const CLONE_COST = 45;

treeOffers([{
  key: CLONE_NODE, category: 'device', lane: 'Lab', title: 'Clone vat', cost: 8, item: 'syringe', alt: ['bandage'],
  desc: 'A growth column for the control room. It keeps one spare body of the unit on file; when the unit dies, the operator is linked into the spare and it walks out.',
  gives: 'lab station: the clone vat (build it in the control room)',
}]);

interface CloneFile { clones?: number; cloneApp?: Appearance; revives?: number }
const cf = () => file() as unknown as CloneFile;
export const clonesBanked = () => { try { return Math.max(0, Math.min(CLONE_MAX, cf().clones ?? 0)); } catch { return 0; } };
/** the body grown in the vat looks like the last unit linked */
export const cloneLook = (): Appearance | null => cf().cloneApp ?? null;
export function bankClone(n = 1) { const f = cf(); f.clones = Math.max(0, Math.min(CLONE_MAX, (f.clones ?? 0) + n)); saveFile(); bus.emit('cloneBank', f.clones); }
/** '' when another clone can be grown now; otherwise why not */
export function canGrow(): string {
  if (clonesBanked() >= CLONE_MAX) return 'a clone is already in the vat';
  if (dollars() < CLONE_COST) return `$${CLONE_COST}`;
  return '';
}
export function growClone(): boolean {
  if (canGrow()) return false;
  if (!spendDollars(CLONE_COST, 'clone')) return false;
  bankClone(1);
  return true;
}

// ---------------------------------------------------------------- the revive
let reviving = false;
export const isReviving = () => reviving;

/** a fresh body: every wound gone, the limbs back, the numbers of a body that just walked out of a vat */
function freshBody(p: Player) {
  const b = p.body as unknown as Record<string, any>;
  for (const k of Object.keys(b.parts)) b.parts[k].injuries = [];
  b.severed = []; b.phantom = 0;
  Object.assign(b, {
    hunger: 22, thirst: 26, fatigue: 30, endurance: 0.8, boredom: 10, unhappy: 20, stress: 35, panic: 12,
    corruption: 0, corruptInfected: false, sickness: 0, temp: 36.6, wetness: 0.6, drunk: 0, stuffed: 0,
    blood: 100, health: 100, painkiller: 0, antibiotics: 0, sedated: 0, adrenaline: 0,
    dead: false, downed: false, downedTime: 0, asleep: false,
  });
  b.lucidity = Math.max(55, b.lucidity ?? 100);
}

/** where the new body is put down: the held checkpoint on this level, else the level's way in */
async function landing(p: Player): Promise<[string, number, number]> {
  // (loaded here: the control room imports this file, and the checkpoint code belongs to the run)
  const { heldCheckpoint } = await import('../checkpoint');
  const cp = heldCheckpoint();
  if (cp && cp.zone === p.zoneKey) return [cp.zone, cp.x, cp.y];
  const z = G.getZone(p.zoneKey);
  const sp = (z.meta.spawn as [number, number] | undefined) ?? [Math.floor(p.x), Math.floor(p.z)];
  return [z.key, sp[0], sp[1]];
}

async function revive(g: Game, p: Player) {
  const solo = g.role === 'solo';
  const was = g.paused;
  // the body drops (the ragdoll), a beat, then the vat
  await new Promise((r) => setTimeout(r, 1300));
  if (solo) g.paused = true;
  try { (G.audio as unknown as { duck?: (l: number, s: number) => void })?.duck?.(0.25, 0.6); } catch { /* audio optional */ }
  try {
    const { playRevive } = await import('./revive');
    await playRevive({ app: p.app, name: p.name });
  } catch (e) { console.warn('revive cutscene', e); }
  freshBody(p);
  // the new body stands: no ragdoll left over from the death
  try { (p as unknown as { rig?: { stopRagdoll?: () => void } }).rig?.stopRagdoll?.(); } catch { /* rig optional */ }
  const [zk, x, y] = await landing(p);
  try {
    const nw = (g as unknown as { nearestWalkable?: (z: unknown, x: number, y: number) => [number, number] }).nearestWalkable?.(g.getZone(zk), x, y) ?? [x, y];
    g.placePlayer(p, zk, nw[0], nw[1]);
  } catch (e) { console.warn('revive place', e); }
  if (solo) g.paused = was;
  try { (G.audio as unknown as { duck?: (l: number, s: number) => void })?.duck?.(1, 1.2); } catch { /* audio optional */ }
  const f = cf(); f.revives = (f.revives ?? 0) + 1; saveFile();
  reviving = false;
  bus.emit('cloneRevived', p);
  bus.emit('think', p, 'Cold. Wet. Somebody else\'s first breath, in my chest.');
  setTimeout(() => G.handler?.say?.('Link is up. That was your spare, operator. The vat is empty now: grow another before you do that again.', { pri: 2 }), 2200);
}

/** the session's hook: hold the local unit's death back while a clone is banked (solo) */
export function installClone(g: Game, p: Player) {
  try { cf().cloneApp = p.app; saveFile(); } catch { /* no file */ }
  bus.gate('death', (pl: Player) => {
    if (pl !== p || reviving) return false;
    if (g.role !== 'solo' && g.players.size > 1) return false;
    if (clonesBanked() <= 0) return false;
    reviving = true;
    bankClone(-1);
    void revive(g, p);
    return true;
  });
  if (import.meta.env.DEV) (window as unknown as { __clone: unknown }).__clone = { bank: () => bankClone(1), banked: clonesBanked, get reviving() { return reviving; } };
}

// THE WING'S WORKS AND STORES (round 26, part B): what restoring a room costs, what can be bought to furnish it,
// the finishes a room can be given, and the paying for all of it. Everything is paid the way the lab pays: the
// operator's DOLLARS (src/game/economy/money.ts, earned by remitting loads) and MATTER out of the press's bank
// (src/game/economy/matter.ts: what the units brought back and the dial kept). The models live in the UI
// (src/ui/menus/front/build/models.ts); this is the data and the rules, so a test can restore a room with no screen.
//
//   restoring a room, in four stages (condition 0 -> 3), each paid when it starts:
//     clear    a skip comes in; every piece of debris goes into it by hand (binDebris), then the room is cleared
//     repair   walls, wiring, the lights (a crew, a short cinematic)
//     clean    scrubbed and mopped; the room is restored, its screen or its feature opens
//   pacing: the first room is cheap and open from the start; each other room waits for a number of rooms restored
//   (its tier) and costs more, in dollars and in matter, so the wing is rebuilt across many runs.
//
//   stageOf(id) -> 'clear' | 'repair' | 'clean' | null     stageCost(id)   gateOf(id) (rooms still to restore first)
//   canPay(cost) / pay(cost)                               startStage(id) -> '' | why not   binDebris(id, n)
//   FURN / furnSpec(kind) / buyFurniture(id, kind, at)    sellFurniture(id, uid)
//   FINISHES / finishSpec(key) / applyFinish(id, key)      debrisCount(id)
import { ROOMS, room, roomDef, facility, facilityBonuses, buildWing, setPaidAt, setCondition, setWork, unlockRoom, placeFurniture, removeFurniture, setFinish, FIRST_ROOM, type RoomId } from './facility';
import { grantResearch } from './research';
import { FURN_BY, FINISH_BY, debrisCount, exhibitSpec, type Cost } from './facilityStores';
export { FURN, FINISHES, ZOO, ZOO_BY, exhibitSpec, purposeOf, furnSpec, finishSpec, debrisCount, type Cost, type FurnSpec, type FinishSpec, type Layer, type FinishPart, type ZooSp } from './facilityStores';
import { dollars, spendDollars, addDollars } from './economy/money';
import { canAfford, drawMatter, bankMatter, type Matter } from './economy/matter';
export type Stage = 'clear' | 'repair' | 'clean';
export const STAGES: Stage[] = ['clear', 'repair', 'clean'];

// ---------------------------------------------------------------- restoring
/** each room's tier: how many rooms must be restored before it can be started (and how dear it is) */
const TIER: Partial<Record<RoomId, number>> = {
  bunks: 0, unit: 1, control: 1, workshop: 1, monitors: 2, canteen: 2, archive: 3, dress: 3, fab: 4, lattice: 5, vault: 6, clone: 7,
};
const GATE = [0, 1, 1, 2, 3, 4, 5, 6];
/** the stage costs of a tier: [clear, repair, clean] */
function tierCost(t: number): Cost[] {
  if (t === 0) return [{ $: 10 }, { $: 20 }, { $: 10 }];
  const k = t;
  return [
    { $: 25 + 20 * k, m: { wood: 1 + k, metal: 1 + k } },
    { $: 50 + 40 * k, m: { metal: 2 + 2 * k, polymer: 1 + k, mineral: k } },
    { $: 25 + 20 * k, m: { chem: 1 + k * 0.5, fibre: 1 + k * 0.5 } },
  ];
}
export const restoredCount = () => ROOMS.filter((d) => room(d.id).condition >= 3).length;
/** the next stage a room needs (null once restored) */
export function stageOf(id: RoomId): Stage | null { if (roomDef(id).plot) return null; const c = room(id).condition; return c >= 3 ? null : STAGES[c]; }
export function stageCost(id: RoomId, st: Stage | null = stageOf(id)): Cost | null { return st ? tierCost(TIER[id] ?? 7)[STAGES.indexOf(st)] : null; }
/** how many more rooms must be restored before this one can be started (0: it can) */
export function gateOf(id: RoomId): number {
  const r = room(id);
  if (id === FIRST_ROOM || r.condition > 0 || r.work) return 0;
  return Math.max(0, GATE[TIER[id] ?? 7] - restoredCount());
}

export const canPay = (c: Cost) => dollars() >= c.$ && canAfford((c.m ?? {}) as Matter);
/** take the dollars and the matter (nothing is taken unless all of it can be) */
export function pay(c: Cost, why = 'facility'): boolean {
  if (!canPay(c)) return false;
  if (c.$ > 0 && !spendDollars(c.$, why)) return false;
  if (c.m && Object.keys(c.m).length && !drawMatter(c.m as Matter, 0)) { addDollars(c.$, 'refund'); return false; }
  return true;
}
/** a refund (furniture sold back): the dollars and the matter go back where they came from */
function refund(c: Cost) { if (c.$ > 0) addDollars(c.$, 'refund'); if (c.m) bankMatter(c.m as Matter); }

/** start (and pay for) a room's next stage: '' when it is under way, else why not ('done', 'gate', 'money', 'busy') */
export function startStage(id: RoomId): '' | 'done' | 'gate' | 'money' | 'busy' {
  const st = stageOf(id), r = room(id);
  if (!st) return 'done';
  if (r.work?.skip) return 'busy';
  if (gateOf(id) > 0) return 'gate';
  if (!pay(stageCost(id, st)!, 'restore')) return 'money';
  if (r.locked) unlockRoom(id);
  if (st === 'clear') setWork(id, { skip: true, binned: [] });
  else setCondition(id, (r.condition + 1) as 2 | 3);
  return '';
}
/** a piece of debris is in the skip; the last one clears the room (true when it did) */
export function binDebris(id: RoomId, n: number): boolean {
  const r = room(id);
  if (!r.work?.skip || r.condition !== 0) return false;
  const binned = r.work.binned.includes(n) ? r.work.binned : [...r.work.binned, n];
  if (binned.length >= debrisCount(id)) { setWork(id, null); setCondition(id, 1); return true; }
  setWork(id, { skip: true, binned });
  return false;
}

// ---------------------------------------------------------------- furniture
const BY = { get: (k: string) => FURN_BY.get(k) ?? exhibitSpec(k) };
/** buy a piece and place it (room-local metres, its turn); the uid, or null when it cannot be paid for */
export function buyFurniture(id: RoomId, kind: string, at: { x: number; z: number; rot: number; y?: number }): string | null {
  const f = BY.get(kind);
  if (!f || room(id).condition < 3 || !pay(f.cost, 'furnish')) return null;
  return placeFurniture(id, { kind, x: at.x, z: at.z, rot: at.rot, y: at.y });
}
/** take a piece out (what it cost comes back) */
export function sellFurniture(id: RoomId, uid: string) {
  const p = room(id).furniture.find((q) => q.uid === uid);
  if (!p) return;
  const f = BY.get(p.kind);
  removeFurniture(id, uid);
  if (f) refund(f.cost);
}

// ---------------------------------------------------------------- finishes
const FBY = FINISH_BY;
/** give a restored room a finish: true once paid and on */
export function applyFinish(id: RoomId, key: string): boolean {
  const f = FBY.get(key);
  if (!f || room(id).condition < 3) return false;
  if (room(id).finish?.[f.part] === key) return true;
  if (!pay(f.cost, 'finish')) return false;
  setFinish(id, f.part, key);
  return true;
}
/** the room's name (for a hover) */
export const roomName = (id: RoomId) => roomDef(id).name;

// ---------------------------------------------------------------- the annex, prestige, the takings
/** the Institute's prestige: every restored room, and every exhibit (the zoo and the museum of the liminal) */
export function prestige(): number { return restoredCount() * 2 + (facilityBonuses().prestige ?? 0); }
const PLOT_PRESTIGE: Partial<Record<RoomId, number>> = { annex1: 0, annex2: 10, annex3: 22, annex4: 36, annex5: 52, annex6: 70 };
const plotN = (id: RoomId) => Number(id.slice(5)) - 1;
/** what a wing on this plot costs */
export function plotCost(id: RoomId): Cost { const i = plotN(id); return { $: 120 + 90 * i, m: { mineral: 6 + 3 * i, metal: 6 + 3 * i, wood: 4 + 2 * i } }; }
/** what the plot still waits for: rooms restored (the first plot) and prestige */
export function plotGate(id: RoomId): { rooms: number; prestige: number } {
  return { rooms: id === 'annex1' ? Math.max(0, 2 - restoredCount()) : 0, prestige: Math.max(0, (PLOT_PRESTIGE[id] ?? 99) - prestige()) };
}
/** buy and build a wing on an annex plot: '' when it is going up */
export function buildPlot(id: RoomId): '' | 'done' | 'gate' | 'money' {
  if (!roomDef(id).plot || room(id).built) return 'done';
  const g = plotGate(id);
  if (g.rooms || g.prestige) return 'gate';
  if (!pay(plotCost(id), 'wing')) return 'money';
  buildWing(id);
  return '';
}
/** the exhibits' takings since they were last paid out (at most half a day's): dollars from the gate, research
 *  points from the study of them; paid now. The first call only starts the clock. */
export function collectTakings(now = Date.now()): { $: number; rp: number } {
  const s = facility();
  if (!s.paidAt) { setPaidAt(now); return { $: 0, rp: 0 }; }
  const h = Math.min(12, Math.max(0, (now - s.paidAt) / 3600000));
  const b = facilityBonuses(), ex = room ? ROOMS.reduce((n, d) => n + room(d.id).furniture.filter((f) => /^(encl|case|jar):/.test(f.kind)).length, 0) : 0;
  const $ = Math.floor(h * (b.income ?? 0) * 2), rp = Math.floor(h * (b.prestige ?? 0) * 0.25);
  if (!ex || ($ < 1 && rp < 1)) return { $: 0, rp: 0 };
  setPaidAt(now);
  if ($ > 0) addDollars($, 'takings');
  if (rp > 0) grantResearch(rp, 'exhibits');
  return { $, rp };
}

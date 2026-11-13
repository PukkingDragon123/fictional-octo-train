// BLUEPRINTS (round 17): what the build kit knows how to put up. Every piece starts
// locked except a small basic set (camp flag, crate, barricade, bunk, fire pit,
// carpenter's bench). The rest are learned, per unit, and saved with the unit like
// recipes (the 'bp:<piece>' entries ride in p.knownRecipes, src/game/save.ts):
//   - a Rolled Blueprint or a Sealed Plan Tube, found as loot: read it (the ReadAction)
//   - scan a built example: a derelict piece some earlier unit left in the level, or the
//     ordinary furniture it is copied from (a locker, a stove, a generator...)
//   - Dr. Calder's First Camp tasks (src/build/firstCamp.ts teaches on completion)
//   - research in the lab (a piece's research node still unlocks it)
// The shelf shows a locked piece greyed with BLUEPRINT NEEDED and where to find it.
import { G } from '../game/G';
import { bus } from '../core/events';
import { Rng } from '../core/rng';
import { hasUnlock, grantResearch } from '../game/research';
import { objDef } from '../world/objects';
import { itemDef, type Item } from '../items/item';
import { lootTable } from '../items/loot';
import { defPiece, PIECES, piece, pieceForObj, type Piece } from './pieces';
import type { Player } from '../entities/player';
import type { TileObject } from '../world/zone';

// the fire pit: a basic piece (the ordinary Fire Pit object, lit with the usual verbs)
defPiece({ key: 'campfire', name: 'Fire Pit', cat: 'living', kind: 'obj', obj: 'campfire_unlit', h: 0.4, cost: [['plank', 2], ['rag', 1]], weld: 2.5, join: 'nail', stats: { comfort: 2, food: 1 }, desc: 'A ring of broken tile round a nest of split planks. Light it, cook on it, sit by it.' });

/** known from the start */
export const BASIC = new Set(['camp_flag', 'crate', 'barricade', 'bunk', 'campfire', 'worktable']);
/** what a rolled blueprint can be (common, early) and what a sealed tube can be (machines, metal) */
const SHEET_POOL = ['plank_wall', 'plank_door', 'lantern', 'tripwire', 'rain_barrel', 'table', 'cot', 'locker', 'stove', 'strip_light', 'planter', 'rain', 'pipe_rail', 'deck', 'steps', 'plate_wall', 'metal_barricade', 'spikes', 'jaw_trap', 'beacon', 'fungus_bed'];
const TUBE_POOL = ['hatch', 'mech_bench', 'compactor', 'gen_rig', 'pole', 'work_lamp', 'condenser', 'still', 'siren', 'radio', 'hydro', 'pen', 'turret', 'flail', 'steel_wall', 'steel_door', 'machine_bench'];
/** derelict pieces an earlier unit left in the levels (src/build/gather.ts places them): scan one to learn it */
export const DERELICT = ['locker', 'stove', 'planter', 'cot', 'table', 'strip_light', 'still', 'condenser', 'rain', 'hydro', 'compactor', 'gen_rig', 'radio', 'mech_bench', 'metal_barricade'];
/** ordinary furniture a piece is copied from (object key pattern -> piece) */
const COPIED: [RegExp, string][] = [
  [/locker/, 'locker'], [/(^|_)(bed|cot|bunk)(_|$)/, 'cot'], [/(^|_)table(_|$)|desk/, 'table'], [/stove|oven|range/, 'stove'],
  [/generator/, 'gen_rig'], [/radio/, 'radio'], [/workbench/, 'mech_bench'], [/water_barrel|rain_barrel|drum/, 'rain'],
  [/planter|flower_box/, 'planter'], [/barricade/, 'metal_barricade'], [/light_fluoro|strip_light|work_light/, 'strip_light'],
  [/shelf|shelving/, 'locker'], [/fence|railing/, 'pipe_rail'], [/lantern|lamp_oil/, 'lantern'],
];
/** taught by Dr. Calder's First Camp tasks: quest key -> pieces (src/build/firstCamp.ts) */
export const TASK_TEACH: Record<string, string[]> = {
  fc_salvage: ['lantern'], fc_flag: ['plank_wall'], fc_store: ['plank_door'], fc_walls: ['tripwire', 'rain_barrel'],
  fc_bench: ['table', 'strip_light'], fc_bed: ['jaw_trap'], fc_watch: ['siren', 'metal_barricade'], fc_upgrade: ['plate_wall', 'locker'],
};
const TASK_TITLE: Record<string, string> = { fc_salvage: 'Salvage', fc_flag: 'Plant a Flag', fc_store: 'Somewhere to Put Things', fc_walls: 'Four Walls', fc_bench: 'A Bench', fc_bed: 'A Bed of Your Own', fc_watch: 'Night Watch', fc_upgrade: 'Scrap to Steel' };

const knownSet = (p: Player | null | undefined): Set<string> | null => {
  if (!p) return null;
  const q = p as Player & { knownRecipes?: Set<string> };
  return q.knownRecipes || (q.knownRecipes = new Set<string>());
};
/** does this unit know how to build it */
export function knowsBlueprint(p: Player | null | undefined, pc: Piece): boolean {
  if (BASIC.has(pc.key)) return true;
  if (knownSet(p)?.has('bp:' + pc.key)) return true;
  return !!pc.node && hasUnlock(pc.node);
}
/** every piece this unit knows */
export const knownPieces = (p: Player | null | undefined) => PIECES.filter((pc) => knowsBlueprint(p, pc));

/** where a locked piece's blueprint can be had (shown on the shelf and under the ghost) */
export function whereToFind(pc: Piece): string {
  const out: string[] = [];
  for (const [q, keys] of Object.entries(TASK_TEACH)) if (keys.includes(pc.key)) { out.push(`Dr. Calder's task "${TASK_TITLE[q] ?? q}"`); break; }
  if (DERELICT.includes(pc.key)) out.push('scan a derelict one');
  else if (COPIED.some(([, k]) => k === pc.key)) out.push('scan one in the levels');
  out.push(TUBE_POOL.includes(pc.key) ? 'a sealed plan tube' : 'a rolled blueprint');
  if (pc.node) out.push('lab research');
  return out.slice(0, 3).join(' · ');
}

/** learn a piece's blueprint; true if it was new */
export function learnBlueprint(p: Player | null | undefined, key: string, how: string, quiet = false): boolean {
  const pc = piece(key); const s = knownSet(p);
  if (!pc || !s || !p || knowsBlueprint(p, pc)) return false;
  s.add('bp:' + key);
  if (!quiet && p === G.local) {
    G.audio?.ui?.('nodeUnlock', 0.55);
    bus.emit('halo', p, 'Blueprint: ' + pc.name, 'good');
    bus.emit('subtitle', { who: 'BUILD KIT', text: `BLUEPRINT LEARNED · ${pc.name.toUpperCase()} · ${how}`, dur: 3.2, style: 'radio' });
  }
  G.missions?.set?.('bp:learned');
  bus.emit('blueprintLearned', p, key, how);
  return true;
}

/** read a rolled blueprint or a sealed tube: one (or two) pieces this unit does not know yet */
function readPlans(p: Player, it: Item) {
  const tube = it.key === 'blueprint_tube';
  const forced = it.data?.piece as string | undefined;
  const pool = (tube ? TUBE_POOL : SHEET_POOL).filter((k) => { const pc = piece(k); return pc && !knowsBlueprint(p, pc); });
  const rng = new Rng((it.uid * 2654435761) >>> 0);
  const got: string[] = [];
  if (forced && piece(forced) && !knowsBlueprint(p, piece(forced)!)) got.push(forced);
  const n = tube ? 2 : 1;
  while (got.length < n && pool.length) {
    // earlier entries are likelier (the sheets: walls and doors before metal)
    const i = Math.min(pool.length - 1, Math.floor(Math.pow(rng.next(), 1.6) * pool.length));
    const [k] = pool.splice(i, 1);
    if (!got.includes(k)) got.push(k);
  }
  if (!got.length) { bus.emit('think', p, 'Nothing on it I do not know already. R&D will want the paper, though.'); grantResearch(1, 'blueprint'); }
  got.forEach((k, i) => setTimeout(() => learnBlueprint(p, k, tube ? 'PLAN TUBE' : 'ROLLED BLUEPRINT'), i * 1400));
  p.removeItem(it);
  bus.emit('inventoryChanged', p);
}

/** a scan finished: a built example (or what a piece is copied from) teaches it */
function scanned(key: string) {
  const p = G.local; if (!p) return;
  const pc = pieceForObj(key) ?? piece(COPIED.find(([re]) => re.test(key))?.[1] ?? '');
  if (pc) learnBlueprint(p, pc.key, 'SCANNED');
}

let wired = false;
export function wireBlueprints() {
  if (wired) return;
  wired = true;
  bus.on('read', (p: Player, it: Item) => { if (p === G.local && (it?.key === 'blueprint_sheet' || it?.key === 'blueprint_tube')) readPlans(p, it); });
  bus.on('scanEntry', (e: { kind: string; key: string }) => { if (e?.kind === 'object' || e?.kind === 'artefact') scanned(e.key); });
  // the floating label over a derelict piece whose plan the unit does not have: [Q] Scan
  const g = G as unknown as { ctxHooks?: ((p: Player, touch: boolean) => unknown[])[] };
  (g.ctxHooks ||= []).push((p: Player) => {
    if (p.body.dead || G.build?.active) return [];
    const sc = (G as unknown as { scan?: { canScan?: () => boolean; targetOf?: (t: unknown) => unknown; begin?: (t: unknown) => boolean } }).scan;
    if (!sc?.begin) return [];
    for (const o of (G.interact?.objectsNear?.(p, 2.2) || []) as TileObject[]) {
      const pc = o.state?.derelict ? pieceForObj(o.key) : null;
      if (!pc || knowsBlueprint(p, pc)) continue;
      const d = objDef(o.key);
      const at = { x: o.x + 0.5, y: (p.y ?? 0) + Math.min(2, d?.height ?? 1) + 0.3, z: o.y + 0.5 };
      return [{ id: 'bp_scan', label: 'Scan', icon: 'scan', key: 'Q', run: () => sc.begin!(sc.targetOf!({ kind: 'object', obj: o })), head: 'Scan for the blueprint', name: 'Derelict ' + pc.name, tgt: 'o:' + o.uid, anchor: () => at }];
    }
    return [];
  });
  // the plans turn up where tools, drawings and other people's camps are kept
  const add = (table: string, entries: [string, number][]) => {
    const t = lootTable(table); if (!t) return;
    for (const e of entries) if (!t.entries.some((x) => x[0] === e[0])) t.entries.push(e);
  };
  add('maintenance', [['blueprint_sheet', 1.4], ['blueprint_tube', 0.4]]);
  add('toolbox', [['blueprint_sheet', 0.8]]);
  add('tool_shelf', [['blueprint_sheet', 1]]);
  add('garage_shelf', [['blueprint_sheet', 1]]);
  add('store_hardware', [['blueprint_sheet', 1], ['blueprint_tube', 0.5]]);
  add('office_desk', [['blueprint_sheet', 0.4]]);
  add('filing', [['blueprint_sheet', 0.6], ['blueprint_tube', 0.2]]);
  add('survivor_stash', [['blueprint_sheet', 1.6], ['blueprint_tube', 0.8]]);
  add('camp_supplies', [['blueprint_sheet', 1.4], ['blueprint_tube', 0.5]]);
  add('crate_supplies', [['blueprint_sheet', 0.8]]);
  add('security_office', [['blueprint_tube', 0.4]]);
  add('lab_cabinet', [['blueprint_tube', 0.5]]);
  void itemDef;
}

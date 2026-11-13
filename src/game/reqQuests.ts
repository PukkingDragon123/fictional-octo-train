// REQUIREMENT QUESTS (round 17): the lab's important research nodes cannot be
// bought on points alone. Each asks for a deed done in the field first (scan
// three Worm Train eggs, slip a Stalker, feed the press, light a camp...).
// Progress is counted from real game events on the bus, kept in the browser
// profile (it carries across runs), and the node stays LOCKED on the lattice
// until the deed is done (research.ts gateNode: canBuy and the lattice's
// nodeState both read the gate). Done: Dr. Calder logs it on the subtitle strip.
//
// API (for the lattice / any UI):
//   nodeQuest(key)  -> ReqProgress | null   a research node key or a lattice node key (its first rank)
//   reqQuests()     -> ReqProgress[]        every requirement quest, in order
//   bus 'reqQuest'  ReqProgress             whenever one moves (done: true once, when it completes)
//   ReqProgress = { id, node, title, text, progress, goal, done }
import { bus } from '../core/events';
import { G } from './G';
import { addStat, stat } from './profile';
import { gateNode, researchNode } from './research';
import { voss } from './debt/voice';
import { objDef } from '../world/objects';

export interface ReqProgress { id: string; node: string; title: string; text: string; progress: number; goal: number; done: boolean }
interface ReqDef { id: string; node: string; title: string; text: string; goal: number }

const DEFS: ReqDef[] = [
  { id: 'egg_census', node: 'scan_deep', title: 'Egg Census', text: 'Scan 3 Worm Train eggs', goal: 3 },
  { id: 'clean_signal', node: 'map_ping', title: 'Clean Signal', text: 'Hold 5 clean scanner locks', goal: 5 },
  { id: 'not_caught', node: 'chip_step', title: 'Not Caught', text: 'Survive a Stalker encounter without being caught', goal: 1 },
  { id: 'feed_press', node: 'pr_batch', title: 'Feed the Press', text: 'Crush 20 items at the press', goal: 20 },
  { id: 'lights_on', node: 'bp_turret', title: 'Lights On', text: 'Build a powered camp', goal: 1 },
  { id: 'steady_hands', node: 'chip_mend', title: 'Steady Hands', text: 'Stitch 3 wounds without a slip', goal: 3 },
  { id: 'slipped_grip', node: 'tame_mk2', title: 'Slipped the Grip', text: 'Break free from 3 holds', goal: 3 },
  { id: 'tumblers', node: 'rc_schematics', title: 'Tumblers', text: 'Pick 3 locks', goal: 3 },
];
const BY_ID = new Map(DEFS.map((d) => [d.id, d]));
const BY_NODE = new Map(DEFS.map((d) => [d.node, d]));
const K = (id: string) => 'rq:' + id;

function prog(d: ReqDef): ReqProgress {
  const n = Math.min(d.goal, stat(K(d.id)));
  return { id: d.id, node: d.node, title: d.title, text: d.text, progress: n, goal: d.goal, done: n >= d.goal };
}
export function reqQuests(): ReqProgress[] { return DEFS.map(prog); }
export function reqProgress(id: string): ReqProgress | null { const d = BY_ID.get(id); return d ? prog(d) : null; }
/** the requirement quest on a node: a research node key ('chip_mend', 'chip_mend~2' reads rank 1's) or a lattice node key */
export function nodeQuest(key: string): ReqProgress | null {
  const d = BY_NODE.get(key) ?? BY_NODE.get(key.replace(/~\d+$/, ''));
  return d ? prog(d) : null;
}

for (const d of DEFS) gateNode(d.node, () => stat(K(d.id)) >= d.goal, () => { const p = prog(d); return `QUEST · ${d.text} · ${p.progress}/${p.goal}`; });

/** count a step (by: the player it is about; only the local unit's deeds count here) */
export function reqBump(id: string, n = 1) {
  const d = BY_ID.get(id); if (!d || n <= 0) return;
  const before = stat(K(id));
  if (before >= d.goal) return;
  addStat(K(id), Math.min(n, d.goal - before));
  const p = prog(d);
  bus.emit('reqQuest', p);
  if (p.done) {
    G.audio?.ui?.('questDone', 0.6);
    const nt = researchNode(d.node)?.title;
    voss(`Logged: ${d.title}. ${nt ? cap(nt) + ' is cleared for research.' : 'The lab has it.'}`);
  } else G.audio?.ui?.('band_tick', 0.25);
}
const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
const mine = (by: unknown) => !by || by === G.local?.id;

// ---------------------------------------------------------------- the deeds, from the bus
// scanning: distinct eggs (a sloppy lock still counts; a lost one never reaches scanEntry)
const eggs = new Set<string>();
bus.on('scanEntry', (e: { kind: string; key: string; ref?: { id?: string } }) => {
  if (e.kind !== 'creature' || e.key !== 'worm_egg') return;
  const id = e.ref?.id ?? String(Math.random());
  if (eggs.has(id)) return;
  eggs.add(id); reqBump('egg_census');
});
bus.on('scanLock', (e: { end: string }) => { if (e.end === 'clean') reqBump('clean_signal'); });
// the press: every item fed to the hopper goes under the ram
bus.on('deposited', (e: { by?: string; keys?: string[] }) => { if (mine(e.by) && e.by) reqBump('feed_press', e.keys?.length ?? 0); });
// the steady-hand checks (src/actions/skillCheck.ts users)
bus.on('stitched', (e: { by?: string; clean?: boolean }) => { if (mine(e.by) && e.clean) reqBump('steady_hands'); });
bus.on('lockPicked', (e: { by?: string }) => { if (mine(e.by)) reqBump('tumblers'); });
bus.on('struggle', (e: { win: boolean; cid: string | null }) => { if (e.win) reqBump('slipped_grip'); stalkerCaught(e.cid); });

// a Stalker encounter: it has the unit (awareness >= 1) and later loses it (or dies, or the unit leaves)
// without ever laying a hand on it. It must have lasted a few seconds.
const enc = new Map<string, { t0: number; caught: boolean; calm: number }>();
function stalkerCaught(cid: string | null) { if (cid && enc.has(cid)) enc.get(cid)!.caught = true; }
bus.on('playerHit', (p: { id?: string; x: number; z: number }) => {
  if (!p || p !== G.local) return;
  for (const [id, e] of enc) { const c = G.creatures?.creatures?.get?.(id); if (!c || Math.hypot(c.x - p.x, c.z - p.z) < 3.5) e.caught = true; }
});
bus.on('downed', () => { for (const e of enc.values()) e.caught = true; });
bus.on('travelEnd', () => { for (const [id, e] of enc) close(id, e); });
function close(id: string, e: { t0: number; caught: boolean }) {
  enc.delete(id);
  const p = G.local;
  if (!e.caught && p && !p.body?.dead && !p.body?.downed && G.time - e.t0 >= 6) reqBump('not_caught');
}

// a powered camp: a running generator with camp pieces standing round it
function poweredCamp(): boolean {
  const z = G.zone as any, p = G.local;
  if (!z?.objects || !p) return false;
  const gens: { x: number; y: number }[] = [];
  const built: { x: number; y: number }[] = [];
  for (const o of z.objects.values()) {
    if (o.state?.built) built.push(o);
    if (o.state?.on && (o.state.fuel ?? 0) > 0 && objDef(o.key)?.tags?.includes('generator')) gens.push(o);
  }
  return gens.some((g) => built.filter((b) => b !== g && Math.hypot(b.x - g.x, b.y - g.y) <= 10).length >= 3);
}

let pollT = 0, campT = 0;
/** polled from the scan system's frame (src/scan/scan.ts) */
export function reqTick(dt: number) {
  pollT -= dt; campT -= dt;
  const p = G.local;
  if (!p || p.body?.dead) return;
  if (pollT <= 0) {
    pollT = 0.5;
    const seen = new Set<string>();
    for (const c of G.creatures?.list?.() || []) {
      if (c.sp?.key !== 'stalker' || c.zoneKey !== p.zoneKey) continue;
      seen.add(c.id);
      const a = c.awareness?.get?.(p.id) ?? 0;
      let e = enc.get(c.id);
      if (!e && !c.dead && a >= 1) { e = { t0: G.time, caught: false, calm: 0 }; enc.set(c.id, e); }
      if (!e) continue;
      if (c.dead) { close(c.id, e); continue; }
      e.calm = a < 0.25 ? e.calm + 0.5 : 0;
      if (e.calm >= 3) close(c.id, e);
    }
    for (const [id, e] of enc) if (!seen.has(id)) close(id, e);
  }
  if (campT <= 0) { campT = 3; if (stat(K('lights_on')) < 1 && poweredCamp()) reqBump('lights_on'); }
}

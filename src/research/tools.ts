// The research tools in a run: what each codex prize (src/game/codex.ts TOOLS,
// items in src/content/items/research.ts) actually does.
//   dart     the nearest creature in front of you (8 m, in sight) drops for 10 s
//   pinger   everything that moves within 18 m shows through walls for 8 s
//   lure     smashed 3.5 m ahead: a noise that pulls creatures there for 25 s
//   foam     whatever stands within 2.6 m in front is glued down for 6 s
//   inhaler  panic -50, stress -15, and a calm that keeps it low for a while
//   filter   (carried) sickness gains x0.35 and it clears twice as fast (body.ts)
//   kit2     (carried) easier, cleaner field samples, two from a body (collect.ts)
// researchItemMenu() adds the verbs to the item menu (src/interact/itemMenu.ts);
// installResearchTools() runs the passive checks and the lure / sonar timers.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import type { Item } from '../items/item';
import type { MenuOption } from '../ui/ui';
import type { Creature } from '../creatures/creature';
import { lineOfSight } from '../world/collision';
import { cbOp, killable } from '../combat/creatureState';
import { UseObjectAction } from '../actions/world';

/** the sonar reveal: until (G.time seconds) and radius; creatures/manager.ts reads it */
let revealUntil = -1;
export function sonarRadius(): number { return G.time < revealUntil ? 18 : 0; }

const lures: { zone: string; x: number; z: number; until: number; next: number; by: string }[] = [];
const say = (p: Player, s: string) => bus.emit('think', p, s);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** use one charge of a multi-use tool (uses is a 0..1 fraction of def.uses); the item goes when it is empty */
function spend(p: Player, it: Item, charges: number) {
  if (charges <= 1) { p.removeItem(it); }
  else {
    it.uses = Math.max(0, (it.uses ?? 1) - 1 / charges);
    if (it.uses <= 0.001) p.removeItem(it);
  }
  bus.emit('inventoryChanged', p);
}
function creaturesNear(p: Player, r: number): Creature[] {
  const cs: any = G.creatures;
  if (!cs) return [];
  const out: Creature[] = [];
  for (const c of cs.creatures.values() as Iterable<Creature>) if (!c.dead && c.zoneKey === p.zoneKey && Math.hypot(c.x - p.x, c.z - p.z) < r) out.push(c);
  return out;
}
/** in front of the survivor (within the half-angle) and in sight */
function inFront(p: Player, c: Creature, half: number): boolean {
  const a = Math.atan2(c.z - p.z, c.x - p.x);
  let d = a - p.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < half && (!G.zone || lineOfSight(G.zone, p.x, p.z, c.x, c.z));
}

function useDart(p: Player, it: Item) {
  const t = creaturesNear(p, 8).filter((c) => killable(c) && inFront(p, c, 0.9)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  p.removeItem(it); bus.emit('inventoryChanged', p);
  G.audio?.at?.('mn_inject', p.x, p.z);
  if (!t) { say(p, pick(['Missed. The dart is somewhere in the carpet now.', 'Nothing there. Good shot, though.'])); return; }
  cbOp({ t: 'down', id: t.id, s: 10 });
  bus.emit('noise', { x: t.x, z: t.z, radius: 3, kind: 'thud', zone: t.zoneKey, by: p.id });
  say(p, pick([`Got it. ${t.sp.name} is down. Sample it while it sleeps.`, 'Sleep tight. Ten seconds. Move.', 'Night night.']));
}
function usePinger(p: Player, it: Item) {
  spend(p, it, 3);
  revealUntil = G.time + 8;
  G.audio?.ui?.('band_ping', 0.8);
  bus.emit('noise', { x: p.x, z: p.z, radius: 6, kind: 'ping', zone: p.zoneKey, by: p.id });
  const n = creaturesNear(p, 18).length;
  say(p, n ? `PING. ${n} moving thing${n > 1 ? 's' : ''} out there.` : 'PING. Nothing moves. For now.');
}
function useLure(p: Player, it: Item) {
  p.removeItem(it); bus.emit('inventoryChanged', p);
  let x = p.x + Math.cos(p.facing) * 3.5, z = p.z + Math.sin(p.facing) * 3.5;
  const zone = G.zone;
  if (zone && G.nearestWalkable) { const [tx, ty] = G.nearestWalkable(zone, Math.floor(x), Math.floor(z)); x = tx + 0.5; z = ty + 0.5; }
  lures.push({ zone: p.zoneKey, x, z, until: G.time + 25, next: 0, by: p.id });
  G.audio?.at?.('dmg_break_glass', x, z);
  say(p, pick(['Smells like a bin behind a butcher. Perfect.', 'Come and get it. Not me. That.']));
}
function useFoam(p: Player, it: Item) {
  spend(p, it, 2);
  G.audio?.at?.('mn_spray', p.x, p.z);
  const hit = creaturesNear(p, 2.6).filter((c) => killable(c) && inFront(p, c, 0.8));
  for (const c of hit) cbOp({ t: 'down', id: c.id, s: 6 });
  say(p, hit.length ? pick(['Stuck fast. That will not hold long.', 'Glued. Go, go, go.']) : 'Foam everywhere. Nothing in it.');
}
function useInhaler(p: Player, it: Item) {
  spend(p, it, 3);
  const b = p.body;
  b.panic = Math.max(0, b.panic - 50);
  b.stress = Math.max(0, b.stress - 15);
  b.sedated = Math.max(b.sedated, 0.6);
  G.audio?.flat?.('breath', 'sfx', 0.5, 1);
  say(p, pick(['In. Hold. Out. Better.', 'Tastes of birthday cake and copper.', 'Calm. Calm. Calm.']));
}

const USE: Record<string, [string, (p: Player, it: Item) => void]> = {
  tool_dart: ['Fire dart', useDart],
  tool_pinger: ['Ping sonar', usePinger],
  tool_lure: ['Smash lure', useLure],
  tool_foam: ['Spray foam', useFoam],
  tool_inhaler: ['Take a puff', useInhaler],
};
/** the item menu's verbs for the research tools (the primary verb list matches /^Use/) */
export function researchItemMenu(p: Player, it: Item, o: MenuOption[]) {
  const u = USE[it.key];
  if (u) o.push({ label: 'Use: ' + u[0], action: () => { if (p.body.dead) return; p.actions.add(new UseObjectAction(p, u[0], it.key === 'tool_inhaler' ? 0.8 : 0.4, it.key === 'tool_inhaler' ? 'pickup' : 'loot', () => { if (p.allItems().includes(it)) u[1](p, it); })); } });
  if (it.key === 'tool_filter' || it.key === 'tool_kit2') o.push({ label: 'Carried: works on its own', disabled: 'passive' });
}
export const carries = (p: Player, key: string) => p.allItems().some((i) => i.key === key);

/** the passive tools and the lure timers: a game system (src/game/metaRun.ts adds it) */
export function researchToolSystem() {
  let acc = 0;
  return { name: 'researchTools', update(dt: number) {
    acc += dt;
    if (acc < 0.5) return;
    acc = 0;
    const p = G.local as Player | undefined;
    if (p) { if (carries(p, 'tool_filter')) p.body.perks.add('hazmat_filter'); else p.body.perks.delete('hazmat_filter'); }
    for (let i = lures.length - 1; i >= 0; i--) {
      const l = lures[i];
      if (G.time > l.until) { lures.splice(i, 1); continue; }
      if (G.time >= l.next) { l.next = G.time + 2; bus.emit('noise', { x: l.x, z: l.z, radius: 16, kind: 'lure', zone: l.zone, by: l.by }); if (p?.zoneKey === l.zone) G.audio?.at?.('glass_clink', l.x, l.z, 0.7); }
    }
  } };
}

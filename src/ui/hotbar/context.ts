// WHAT THE HANDS CAN DO (round 12 logic, round 14 presentation). One clear primary
// action and a few secondaries, chosen from what the unit is doing and what is in reach:
//   near a door          Open / Close
//   near furniture       Search (a container) · Carry (lift it whole) · Grip (too heavy to lift)
//   carrying             Place · Drop · Throw (light loads) · Turn      (Feed next to the press)
//   holding (pushing)    Let go · Shove · Lift
//   near an inhabitant   Scan (unscanned: hold Q) · Sample (down or dead) · Strike (touch)
//   near an anomaly      Scan (unscanned: hold Q)
//   things on the floor  Pick up (the physical loot view)
//   in water             Swim
//   in the dark          Lamp (the suit's helmet lamp, F)
//   near the press       Feed (the carried piece, or every valuable you have)
// Round 14: no button stack. Each action names its target (tgt / name / head) and where
// that target is in the world (anchor); src/ui/worldPrompt.ts floats "[E] Search: Filing
// Cabinet" over it (tappable on touch). Actions with no anchor (Lamp, Swim, Strike) are
// keybind-only on desktop (listed in the Controls menu) and live on the small chamfered
// touch pad (src/ui/touch/actpad.ts). Keys: E the primary, G carry / grip / drop, R turn,
// Space throw / shove, U the second E-thing, F the suit lamp, Q (hold) scan. Every label and pad button
// runs the same calls as the keys, so the game systems keep one path.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Player } from '../../entities/player';
import type { TileObject, EdgeObj } from '../../world/zone';
import { objDef } from '../../world/objects';
import { floorItemsNear } from '../../items/worldItems';
import { itemDef } from '../../items/item';
import { LootAction, verbWord } from '../../interact/verbs';
import { creatureSampleOption } from '../../research/collect';
import { isDown, isStunned } from '../../combat/creatureState';
import { isTouchMode } from '../touch/mode';
import { fpOwner } from '../../fp/fp';
import * as THREE from 'three';

export interface V3 { x: number; y: number; z: number }

export interface CtxAction {
  id: string;
  /** the short verb (the sub-line under a label, the touch pad) */
  label: string;
  icon: string;
  /** desktop key ('' = none) */
  key: string;
  run?: () => void;
  /** held like a key while the finger is down (touch) */
  hold?: { down: () => void; up: () => void };
  /** the touch Strike button: aims while held */
  strike?: boolean;
  on?: boolean;
  /** greyed (shown, but it would only say why not) */
  why?: string;
  /** the thing it acts on (actions sharing a tgt float as one label) */
  tgt?: string;
  /** that thing's name ("Filing Cabinet") */
  name?: string;
  /** the verb in front of the name when this action heads its label ('' = the name alone; default: label) */
  head?: string;
  /** where the label floats (world metres, the top of the thing); live, read every frame */
  anchor?: () => V3 | null;
}

const _p = new THREE.Vector3();
const angTo = (p: Player, x: number, z: number) => Math.abs(Math.atan2(Math.sin(Math.atan2(z - p.z, x - p.x) - p.facing), Math.cos(Math.atan2(z - p.z, x - p.x) - p.facing)));

/** the press system (G.press when the press agent is in, else the contract's hopper system) */
export function pressSys(): any { const g: any = G; return g.press?.pull ? g.press : g.debt?.hoppers ?? null; }

/** the nearest openable door in front (or right beside) the unit */
function nearDoor(p: Player): { x: number; y: number; side: 0 | 1; edge: EdgeObj; d: number } | null {
  const z = G.zones.get(p.zoneKey); if (!z) return null;
  let best: { x: number; y: number; side: 0 | 1; edge: EdgeObj; d: number } | null = null;
  const tx = p.tileX(), ty = p.tileY();
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) for (const side of [0, 1] as const) {
    const x = tx + dx, y = ty + dy;
    if (!z.inb(x, y)) continue;
    const e = z.edge(x, y, side);
    if (!e || (e.kind !== 'door' && e.kind !== 'gate')) continue;
    const mx = side === 0 ? x + 0.5 : x, mz = side === 0 ? y : y + 0.5;
    const d = Math.hypot(mx - p.x, mz - p.z);
    if (d > 1.35 || (d > 0.75 && angTo(p, mx, mz) > 1.75)) continue;
    if (!best || d < best.d) best = { x, y, side, edge: e, d };
  }
  return best;
}

/** the piece of furniture in front of the unit (in reach) */
function nearFurniture(p: Player): TileObject | null {
  const objs: TileObject[] = G.interact?.objectsNear?.(p, 1.15) || [];
  let best: TileObject | null = null, bs = Infinity;
  for (const o of objs) {
    const d = objDef(o.key); if (!d || d.onWall || d.ceiling || o.state?.held) continue;
    if (o.key === 'hopper' || o.key === 'debris_pile') continue;
    const w = d.w ?? 1, dd = d.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    const cx = o.x + rw / 2 + (o.ox ?? 0), cz = o.y + rd / 2 + (o.oz ?? 0);
    const s = Math.hypot(cx - p.x, cz - p.z) + angTo(p, cx, cz) * 0.55;
    if (s < bs) { bs = s; best = o; }
  }
  return best;
}

/** the floor height under a point of the unit's zone */
function groundAt(p: Player, x: number, z: number): number {
  try { return G.zones.get(p.zoneKey)?.heightAt(Math.floor(x), Math.floor(z)) ?? p.y; } catch { return p.y; }
}
/** the top of a piece of furniture (its footprint centre) */
function objTop(p: Player, o: TileObject): V3 {
  const d = objDef(o.key);
  const w = d?.w ?? 1, dd = d?.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  const x = o.x + rw / 2 + (o.ox ?? 0), z = o.y + rd / 2 + (o.oz ?? 0);
  return { x, y: groundAt(p, x, z) + Math.min(2.2, d?.height ?? 1) + 0.25, z };
}
/** over the unit's head (what it carries, what it holds on to) */
const overUnit = (p: Player) => () => (G.local === p ? { x: p.x, y: p.y + 2.15, z: p.z } : null);
const creatureName = (c: any) => { try { return String(c.displayName?.() || c.sp?.name || 'Something'); } catch { return 'Something'; } };
const creatureTop = (c: any) => () => (c && !c.removed ? { x: c.x, y: (c.y ?? 0) + Math.max(0.4, c.height ?? 1) + 0.3, z: c.z } : null);

/** what the unit can do right now, the primary first (at most four) */
export function contextActions(p: Player, touch: boolean): CtxAction[] {
  const out: CtxAction[] = [];
  if (!p || p.body.dead || p.inVehicle) return out;
  const g: any = G;
  const push = g.destruct?.push;
  const grab = g.grab;
  const pressAt = (hop: TileObject) => { const t = objTop(p, hop); return () => t; };
  // ---- carrying a piece of furniture
  const ci = push?.carryInfo?.();
  if (ci) {
    const ct = 'carry';
    const at = overUnit(p);
    if (ci.nearPress) {
      const hop = push.nearPress?.(p) as TileObject | null;
      out.push({ id: 'feed', label: 'Feed', icon: 'feed', key: 'E', run: () => push.feed(p), tgt: 'press', head: 'Feed the press', anchor: hop ? pressAt(hop) : at });
    }
    out.push({ id: 'place', label: 'Place', icon: 'place', key: ci.nearPress ? '' : 'E', run: () => { push.setDown(); grab?.letGo?.(); }, tgt: ct, name: ci.name, head: 'Place', anchor: at });
    out.push({ id: 'drop', label: 'Drop', icon: 'drop', key: 'G', run: () => push.drop(), tgt: ct, name: ci.name, anchor: at });
    if (ci.canThrow) out.push({ id: 'throw', label: 'Throw', icon: 'throw', key: 'Space', run: () => push.throw(p), tgt: ct, name: ci.name, anchor: at });
    else out.push({ id: 'turn', label: 'Turn', icon: 'turn', key: 'R', run: () => push.turn(p), tgt: ct, name: ci.name, anchor: at });
    if (ci.canThrow && out.length < 4) out.push({ id: 'turn', label: 'Turn', icon: 'turn', key: 'R', run: () => push.turn(p), tgt: ct, name: ci.name, anchor: at });
    return out.slice(0, 4);
  }
  // ---- holding on (pushing furniture, a door, a lever)
  if (grab?.holding) {
    const o = push?.holding ? push.st?.o as TileObject | undefined : undefined;
    const nm = o ? objDef(o.key)?.name : undefined;
    const at = o ? () => { const st = push.st; if (!st || st.o !== o) return null; return { x: st.cx, y: groundAt(p, st.cx, st.cz) + Math.min(2.2, st.h ?? 1) + 0.25, z: st.cz }; } : overUnit(p);
    out.push({ id: 'letgo', label: 'Let go', icon: 'letgo', key: 'E', run: () => grab.letGo(), tgt: 'held', name: nm, head: 'Let go', anchor: at });
    if (push?.holding && push.mode === 'push') {
      out.push({ id: 'shove', label: 'Shove', icon: 'push', key: 'Space', run: () => push.shove(p), tgt: 'held', anchor: at });
      if (o && push.liftable(p, o, true)) out.push({ id: 'lift', label: 'Lift', icon: 'carry', key: 'G', run: () => { grab.letGo(); setTimeout(() => grab.grab(p, { kind: 'object', obj: o, point: _p.set(o.x + 0.5, 0.5, o.y + 0.5) }, 'virtual'), 60); }, tgt: 'held', anchor: at });
    }
    return out;
  }
  const z = G.zones.get(p.zoneKey);
  if (!z) return out;
  // ---- the press
  const hop = push?.nearPress?.(p, 3.2) as TileObject | null;
  if (hop) {
    const sys = pressSys();
    let opts: any[] = [];
    try { opts = sys?.menu?.(p, hop) || []; } catch { /* no menu */ }
    const dep = opts.find((o) => /^Deposit all valuables/.test(o.label) && o.action && !o.disabled);
    const lever = opts.find((o) => /^Pull the lever/.test(o.label));
    const pr = { tgt: 'press', head: 'Feed the press', anchor: pressAt(hop) };
    if (dep) out.push({ id: 'feed', label: 'Feed', icon: 'feed', key: 'E', run: dep.action, ...pr });
    else if (lever) out.push({ id: 'feed', label: 'Feed', icon: 'feed', key: 'E', run: lever.disabled ? undefined : lever.action, why: lever.disabled ? String(lever.disabled) : undefined, ...pr });
  }
  // ---- inhabitants
  let near: any = null, nd = 8;
  let body: any = null, bd = 1.8;
  for (const c of g.creatures?.list?.() || []) {
    if (c.zoneKey && c.zoneKey !== p.zoneKey) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (c.dead) { if (d < bd && c.inv) { bd = d; body = c; } continue; }
    if (!c.visibleToLocal || c.tamedBy) continue;
    if (d < nd) { nd = d; near = c; }
  }
  const sampleOf = (c: any) => { try { const o = creatureSampleOption(p, c); return o && !o.disabled && o.action ? o : null; } catch { return null; } };
  const target = body && bd < 1.8 ? body : near && nd < 2.6 && (isDown(near) || isStunned(near)) ? near : null;
  const smp = target ? sampleOf(target) : null;
  const cr = (c: any) => ({ tgt: 'c:' + c.id, name: creatureName(c), anchor: creatureTop(c) });
  if (smp) out.push({ id: 'sample', label: 'Sample', icon: 'sample', key: 'E', run: smp.action, head: 'Sample', ...cr(target) });
  if (body) out.push({ id: 'searchbody', label: 'Search', icon: 'search', key: 'E', run: () => p.actions.add(new LootAction(p, body.inv, body)), head: 'Search', ...cr(body) });
  // ---- people (src/tribes): [E] Talk, [G] Pickpocket (before the scan: a person is talked to first)
  try { for (const a of (g.tribes?.ctxActions?.(p) || []) as CtxAction[]) out.push(a); } catch (e) { console.warn('ctx tribes', e); }
  // scanning (hold Q): only what nobody has scanned yet earns a label
  const sc = g.scan;
  const canScan = !!sc && (typeof sc.canScan === 'function' ? !!sc.canScan() : true);
  const unknown = (t: any) => !!t && !sc?.known?.(t.kind, t.key);
  if (near && canScan) {
    let st: any = null;
    try { st = sc.creatureTarget?.(near) ?? null; } catch { st = null; }
    if (st ? unknown(st) : !near.scanned) out.push({ id: 'scan', label: 'Scan', icon: 'scan', key: 'Q', run: () => { try { sc.begin?.(sc.creatureTarget(near)); } catch { /* no scanner */ } }, head: 'Scan', ...cr(near) });
  }
  if (near && touch && nd < 5) out.push({ id: 'strike', label: 'Strike', icon: 'strike', key: '', strike: true });
  // ---- other systems' verbs (round 15: the relay booths and the presses' checkpoints, src/game/checkpoint.ts)
  for (const f of (g.ctxHooks || []) as ((p: Player, touch: boolean) => CtxAction[])[]) { try { for (const a of f(p, touch) || []) out.push(a); } catch (e) { console.warn('ctx hook', e); } }
  // ---- furniture
  const f = nearFurniture(p);
  if (f) {
    const d = objDef(f.key)!;
    const t: any = { kind: 'object', obj: f, point: _p.set(f.x + 0.5, 0.5, f.y + 0.5) };
    const top = objTop(p, f);
    const fo = { tgt: 'o:' + f.uid, name: d.name, anchor: () => top };
    if (f.inv && !d.tags?.includes('portal')) out.push({ id: 'search', label: 'Search', icon: 'search', key: 'E', run: () => { p.actions.clear(); p.actions.add(new LootAction(p, f.inv, f)); }, head: 'Search', ...fo });
    const kind = grab?.grabbable?.(p, t);
    if (kind === 'carry') out.push({ id: 'carry', label: 'Carry', icon: 'carry', key: 'G', run: () => grab.grab(p, t, 'virtual'), head: '', ...fo });
    else if (kind === 'push') out.push({ id: 'pushf', label: 'Grip', icon: 'push', key: 'G', run: () => grab.grab(p, t, 'virtual'), head: 'Grip', ...fo });
  }
  // ---- doors
  const door = nearDoor(p);
  if (door && !door.edge.barricade) {
    const t: any = { kind: 'edge', x: door.x, y: door.y, side: door.side, edge: door.edge, point: _p.set(door.side === 0 ? door.x + 0.5 : door.x, 1, door.side === 0 ? door.y : door.y + 0.5) };
    const v = grab?.primaryOf?.(t);
    if (v) {
      const w = verbWord(v) || 'Open';
      const word = w.length > 9 ? (door.edge.open ? 'Close' : 'Open') : w;
      const mx = door.side === 0 ? door.x + 0.5 : door.x, mz = door.side === 0 ? door.y : door.y + 0.5;
      const dt = { x: mx, y: groundAt(p, mx, mz) + 2.25, z: mz };
      out.push({ id: 'door', label: word, icon: /close|shut/i.test(w) || door.edge.open ? 'close' : 'open', key: 'E', run: v.why ? undefined : v.run, why: v.why || undefined,
        tgt: 'd:' + door.x + ',' + door.y + ',' + door.side, head: word + ' ' + (door.edge.kind === 'gate' ? 'gate' : 'door'), anchor: () => dt });
    }
  }
  // ---- things lying on the floor
  const fl = floorItemsNear(z, p.x, p.z, 1.4);
  if (fl.length) {
    let bi = fl[0], bdd = Infinity;
    for (const wi of fl) { const d = Math.hypot(wi.x - p.x, wi.z - p.z); if (d < bdd) { bdd = d; bi = wi; } }
    const nm = (bi.item.name || itemDef(bi.item.key)?.name || 'Something') + (fl.length > 1 ? '  +' + (fl.length - 1) : '');
    const ix = bi.x, iz = bi.z, iy = (bi.y ?? groundAt(p, ix, iz)) + 0.55;
    out.push({ id: 'pickup', label: 'Pick up', icon: 'pickup', key: 'E', run: () => g.pack?.lootFloor?.(), tgt: 'floor', name: nm, head: '', anchor: () => ({ x: ix, y: iy, z: iz }) });
  }
  // ---- an anomaly nobody has scanned (a fixture or a thing on the floor)
  if (canScan && !out.some((a) => a.id === 'scan')) {
    let best: { t: any; tgt: string; at: V3 } | null = null, bdd = 2.6;
    for (const o of (G.interact?.objectsNear?.(p, 2.5) || []) as TileObject[]) {
      let t: any = null;
      try { t = sc.targetOf?.({ kind: 'object', obj: o }) ?? null; } catch { t = null; }
      if (!t || t.kind !== 'anomaly' || !unknown(t)) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bdd) { bdd = d; best = { t, tgt: 'o:' + o.uid, at: objTop(p, o) }; }
    }
    for (const wi of floorItemsNear(z, p.x, p.z, 2.5)) {
      if (!itemDef(wi.item.key)?.anomaly) continue;
      let t: any = null;
      try { t = sc.targetOf?.({ kind: 'item', wi }) ?? null; } catch { t = null; }
      if (!t || !unknown(t)) continue;
      const d = Math.hypot(wi.x - p.x, wi.z - p.z);
      if (d < bdd) { bdd = d; best = { t, tgt: 'floor', at: { x: wi.x, y: (wi.y ?? p.y) + 0.55, z: wi.z } }; }
    }
    if (best) { const b = best; out.push({ id: 'scan', label: 'Scan', icon: 'scan', key: 'Q', run: () => { try { sc.begin?.(b.t); } catch { /* no scanner */ } }, tgt: b.tgt, name: String(b.t.title || 'Something'), head: 'Scan', anchor: () => b.at }); }
  }
  // ---- water (Shift: keybind only; the touch pad has it)
  if (p.stance === 'swim') out.push({ id: 'swim', label: 'Swim', icon: 'swim', key: 'Shift', hold: { down: () => { G.input.press('run'); G.input.press('power'); }, up: () => { G.input.release('run'); G.input.release('power'); } } });
  // ---- the dark: the suit's helmet lamp (F: keybind only; the touch pad has it)
  let dark = false;
  try { dark = G.lightLevelAt(p.x, p.z) < 0.45; } catch { /* no light grid */ }
  if (dark || p.flashlightOn) out.push({ id: 'light', label: p.flashlightOn ? 'Lamp off' : 'Lamp', icon: 'light', key: 'F', on: p.flashlightOn, run: () => G.toggleFlashlight(p) });
  // nothing at all: on touch, the fists
  if (!out.length && touch) out.push({ id: 'strike', label: 'Strike', icon: 'strike', key: '', strike: true });
  // one action per id; the primary is the first that can be done
  const seen = new Set<string>();
  const list = out.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  const pi = list.findIndex((a) => !a.why && (a.run || a.hold || a.strike));
  if (pi > 0) list.unshift(...list.splice(pi, 1));
  // only the primary answers E; other E-things get U / O; the rest keep their own keys
  // (O opens Inspect Yourself and J the quest broadcast, so only U is spare)
  const spare = ['U'];
  list.forEach((a, i) => {
    if (i === 0 && !a.strike && a.key !== 'Shift') a.key = a.key === 'F' || a.key === 'Q' ? a.key : 'E';
    else if (i > 0 && (a.key === 'E' || (!a.key && !a.strike))) a.key = spare.shift() ?? '';
  });
  return list.slice(0, 4);
}

/** is the game in a state where the adaptive buttons speak (no close-up, menu, cutscene, car) */
export function ctxAllowed(): boolean {
  const p = G.local; const g: any = G;
  if (!p || p.body.dead || p.inVehicle) return false;
  if (fpOwner() || G.ui?.modal || G.ui?.menuEl || G.ui?.readerEl) return false;
  if (g.intro?.running || g.transitioning) return false;
  return true;
}

export class ContextBar {
  list: CtxAction[] = [];
  /** changes whenever the list does (the world labels and the touch pad redraw on it) */
  sig = '';
  private t = 0;
  private wrapped = false;
  hidden = false;

  constructor() {
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    bus.on('inventoryChanged', () => { this.t = 0; });
    (G as any).ctxBar = this;
  }

  /** the primary for E (the session's E handler is wrapped: intro / tutorial locks still apply) */
  private wrapInteract() {
    const ui: any = G.ui;
    if (this.wrapped || !ui || !ui.onInteractKey) return;
    this.wrapped = true;
    const prev = ui.onInteractKey;
    ui.onInteractKey = () => {
      const a = ctxAllowed() ? this.list[0] : null;
      if (a && a.key === 'E' && a.run && !a.why) { a.run(); G.audio?.ui?.('click', 0.25); this.t = 0; return; }
      prev();
    };
  }

  private onKey(e: KeyboardEvent) {
    if (e.repeat || G.input?.textFocus || !ctxAllowed()) return;
    const want = e.code === 'KeyG' ? 'G' : e.code === 'KeyR' ? 'R' : e.code === 'KeyU' ? 'U' : '';
    if (!want) return;
    const a = this.list.find((q) => q.key === want && q.run && !q.why);
    if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    a.run!(); this.t = 0;
    G.audio?.ui?.('click', 0.25);
  }

  update(dt: number) {
    this.wrapInteract();
    const p = G.local;
    const touch = isTouchMode();
    const ok = !this.hidden && ctxAllowed();
    if (!ok || !p) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.12;
    let list: CtxAction[] = [];
    try { list = contextActions(p, touch); } catch (e) { console.warn('ctx', e); }
    this.list = list;
    this.sig = (touch ? 'T' : 'D') + list.map((a) => a.id + a.label + a.key + (a.tgt ?? '') + (a.head ?? '') + (a.name ?? '') + (a.on ? 1 : 0) + (a.why ? 'x' : '')).join('|');
  }

  /** a tap on a world label (touch) or a pad button: the same call the key makes */
  runAction(a: CtxAction): boolean {
    if (a.why) { if (G.local) bus.emit('think', G.local, a.why.charAt(0).toUpperCase() + a.why.slice(1) + '.'); return false; }
    if (!a.run) return false;
    a.run();
    G.audio?.ui?.('click', 0.3);
    try { (navigator as any).vibrate?.(12); } catch { /* not allowed */ }
    this.t = 0.05;
    return true;
  }
  /** the run of an action by id (tests, the hotbar) */
  act(id: string): boolean { const a = this.list.find((q) => q.id === id); if (!a?.run || a.why) return false; a.run(); return true; }
}
// (item defs keep the icon table honest)
void itemDef;

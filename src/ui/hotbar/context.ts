// THE ADAPTIVE BUTTONS (round 12). One clear primary action and up to three
// secondaries, chosen from what the unit is doing and what is in reach:
//   near a door          Open / Close
//   near furniture       Search (a container) · Carry (lift it whole) · Push (too heavy to lift)
//   carrying             Place · Drop · Throw (light loads) · Turn      (Feed next to the press)
//   holding (pushing)    Let go · Shove · Lift
//   near an inhabitant   Scan · Sample (down or dead) · Strike (touch)
//   things on the floor  Pick up (the physical loot view)
//   in water             Swim
//   in the dark          Light (the watch's built-in flashlight)
//   near the press       Feed (the carried piece, or every valuable you have)
// Desktop: a strip of key hints over the hotbar (E does the primary; G carry / drop,
// R turn, Space throw, F light, N scan). Touch: a cluster of big pixel-art buttons
// bottom right (the movement stick stays where it is). Every button runs the same
// calls as the keys, so the game systems keep one path.
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
import { ctxIconUrl } from './icons';
import * as THREE from 'three';

export interface CtxAction {
  id: string;
  label: string;
  icon: string;
  /** desktop key shown on the cap ('' = none) */
  key: string;
  run?: () => void;
  /** held like a key while the finger is down (touch) */
  hold?: { down: () => void; up: () => void };
  /** the touch Strike button: aims while held */
  strike?: boolean;
  on?: boolean;
  /** greyed (shown, but it would only say why not) */
  why?: string;
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

/** what the unit can do right now, the primary first (at most four) */
export function contextActions(p: Player, touch: boolean): CtxAction[] {
  const out: CtxAction[] = [];
  if (!p || p.body.dead || p.inVehicle) return out;
  const g: any = G;
  const push = g.destruct?.push;
  const grab = g.grab;
  // ---- carrying a piece of furniture
  const ci = push?.carryInfo?.();
  if (ci) {
    if (ci.nearPress) out.push({ id: 'feed', label: 'Feed', icon: 'feed', key: 'E', run: () => push.feed(p) });
    out.push({ id: 'place', label: 'Place', icon: 'place', key: ci.nearPress ? '' : 'E', run: () => { push.setDown(); grab?.letGo?.(); } });
    out.push({ id: 'drop', label: 'Drop', icon: 'drop', key: 'G', run: () => push.drop() });
    if (ci.canThrow) out.push({ id: 'throw', label: 'Throw', icon: 'throw', key: 'Space', run: () => push.throw(p) });
    else out.push({ id: 'turn', label: 'Turn', icon: 'turn', key: 'R', run: () => push.turn(p) });
    if (ci.canThrow && out.length < 4) out.push({ id: 'turn', label: 'Turn', icon: 'turn', key: 'R', run: () => push.turn(p) });
    return out.slice(0, 4);
  }
  // ---- holding on (pushing furniture, a door, a lever)
  if (grab?.holding) {
    out.push({ id: 'letgo', label: 'Let go', icon: 'letgo', key: 'E', run: () => grab.letGo() });
    if (push?.holding && push.mode === 'push') {
      out.push({ id: 'shove', label: 'Shove', icon: 'push', key: 'Space', run: () => push.shove(p) });
      const o = push.st?.o;
      if (o && push.liftable(p, o, true)) out.push({ id: 'lift', label: 'Lift', icon: 'carry', key: 'G', run: () => { grab.letGo(); setTimeout(() => grab.grab(p, { kind: 'object', obj: o, point: _p.set(o.x + 0.5, 0.5, o.y + 0.5) }, 'virtual'), 60); } });
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
    if (dep) out.push({ id: 'feed', label: 'Feed', icon: 'feed', key: 'E', run: dep.action });
    else if (lever) out.push({ id: 'feed', label: 'Feed', icon: 'feed', key: 'E', run: lever.disabled ? undefined : lever.action, why: lever.disabled ? String(lever.disabled) : undefined });
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
  if (smp) out.push({ id: 'sample', label: 'Sample', icon: 'sample', key: 'E', run: smp.action });
  if (body) out.push({ id: 'searchbody', label: 'Search', icon: 'search', key: 'E', run: () => p.actions.add(new LootAction(p, body.inv, body)) });
  if (near && g.scan?.canScan?.()) out.push({ id: 'scan', label: 'Scan', icon: 'scan', key: 'N', run: () => g.scan.begin(g.scan.creatureTarget(near)) });
  if (near && touch && nd < 5) out.push({ id: 'strike', label: 'Strike', icon: 'strike', key: '', strike: true });
  // ---- furniture
  const f = nearFurniture(p);
  if (f) {
    const d = objDef(f.key)!;
    const t: any = { kind: 'object', obj: f, point: _p.set(f.x + 0.5, 0.5, f.y + 0.5) };
    if (f.inv && !d.tags?.includes('portal')) out.push({ id: 'search', label: 'Search', icon: 'search', key: 'E', run: () => { p.actions.clear(); p.actions.add(new LootAction(p, f.inv, f)); } });
    const kind = grab?.grabbable?.(p, t);
    if (kind === 'carry') out.push({ id: 'carry', label: 'Carry', icon: 'carry', key: 'G', run: () => grab.grab(p, t, 'virtual') });
    else if (kind === 'push') out.push({ id: 'pushf', label: 'Push', icon: 'push', key: 'G', run: () => grab.grab(p, t, 'virtual') });
  }
  // ---- doors
  const door = nearDoor(p);
  if (door && !door.edge.barricade) {
    const t: any = { kind: 'edge', x: door.x, y: door.y, side: door.side, edge: door.edge, point: _p.set(door.side === 0 ? door.x + 0.5 : door.x, 1, door.side === 0 ? door.y : door.y + 0.5) };
    const v = grab?.primaryOf?.(t);
    if (v) {
      const w = verbWord(v) || 'Open';
      out.push({ id: 'door', label: w.length > 9 ? (door.edge.open ? 'Close' : 'Open') : w, icon: /close|shut/i.test(w) || door.edge.open ? 'close' : 'open', key: 'E', run: v.why ? undefined : v.run, why: v.why || undefined });
    }
  }
  // ---- things lying on the floor
  if (floorItemsNear(z, p.x, p.z, 1.4).length) out.push({ id: 'pickup', label: 'Pick up', icon: 'pickup', key: 'E', run: () => g.pack?.lootFloor?.() });
  // ---- water
  if (p.stance === 'swim') out.push({ id: 'swim', label: 'Swim', icon: 'swim', key: 'Shift', hold: { down: () => { G.input.press('run'); G.input.press('power'); }, up: () => { G.input.release('run'); G.input.release('power'); } } });
  // ---- the dark: the watch's built-in flashlight
  let dark = false;
  try { dark = G.lightLevelAt(p.x, p.z) < 0.45; } catch { /* no light grid */ }
  if (dark || p.flashlightOn) out.push({ id: 'light', label: p.flashlightOn ? 'Light off' : 'Light', icon: 'light', key: 'F', on: p.flashlightOn, run: () => { const w: any = G.watch; if (w?.flashlight) w.flashlight(); else G.toggleFlashlight(p); } });
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
    if (i === 0 && !a.strike && a.key !== 'Shift') a.key = a.key === 'F' || a.key === 'N' ? a.key : 'E';
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

const KEYCAP: Record<string, string> = { Space: 'SPACE', Shift: 'SHIFT' };

export class ContextBar {
  readonly el: HTMLDivElement;
  private desk: HTMLDivElement;
  private touchEl: HTMLDivElement;
  list: CtxAction[] = [];
  private sig = '';
  private t = 0;
  private held = new Map<number, CtxAction>();
  private wrapped = false;
  hidden = false;

  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'ctx12';
    this.desk = document.createElement('div'); this.desk.className = 'ctx-desk';
    this.touchEl = document.createElement('div'); this.touchEl.className = 'ctx-touch';
    el.append(this.desk, this.touchEl);
    document.body.appendChild(el);
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
    this.el.classList.toggle('on', ok);
    this.el.classList.toggle('touch', touch);
    if (!ok || !p) { if (this.held.size) this.releaseAll(); return; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.12;
    let list: CtxAction[] = [];
    try { list = contextActions(p, touch); } catch (e) { console.warn('ctx', e); }
    this.list = list;
    const sig = (touch ? 'T' : 'D') + list.map((a) => a.id + a.label + a.key + (a.on ? 1 : 0) + (a.why ? 'x' : '')).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.render(touch);
  }

  private render(touch: boolean) {
    const list = this.list;
    if (!touch) {
      this.touchEl.innerHTML = '';
      this.desk.innerHTML = list.map((a, i) => `<div class="cx-chip${i === 0 ? ' prim' : ''}${a.why ? ' dim' : ''}${a.on ? ' lit' : ''}">${a.key ? `<b class="cx-key">${KEYCAP[a.key] ?? a.key}</b>` : ''}<i style="background-image:url(${ctxIconUrl(a.icon, i === 0 ? 3 : 2)})"></i><span>${a.label}</span></div>`).join('');
      return;
    }
    this.desk.innerHTML = '';
    this.releaseAll();
    this.touchEl.innerHTML = '';
    list.forEach((a, i) => {
      const b = document.createElement('div');
      b.className = 'cx-btn' + (i === 0 ? ' prim' : ' sec s' + i) + (a.why ? ' dim' : '') + (a.on ? ' lit' : '');
      b.innerHTML = `<i style="background-image:url(${ctxIconUrl(a.icon, i === 0 ? 3 : 2)})"></i><span>${a.label}</span>`;
      b.addEventListener('pointerdown', (e) => this.down(e, a, b));
      b.addEventListener('pointermove', (e) => { if (a.strike && this.held.get(e.pointerId) === a) (G as any).touch?.strikeMove?.(e); });
      const up = (e: PointerEvent, cancel: boolean) => this.up(e, a, b, cancel);
      b.addEventListener('pointerup', (e) => up(e, false));
      b.addEventListener('pointercancel', (e) => up(e, true));
      b.addEventListener('lostpointercapture', (e) => up(e, true));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.touchEl.appendChild(b);
    });
  }

  private down(e: PointerEvent, a: CtxAction, b: HTMLElement) {
    e.preventDefault(); e.stopPropagation();
    try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    b.classList.add('down');
    G.input.pointerOverUI = false;
    try { (navigator as any).vibrate?.(12); } catch { /* not allowed */ }
    if (a.why) { if (G.local) bus.emit('think', G.local, a.why.charAt(0).toUpperCase() + a.why.slice(1) + '.'); return; }
    this.held.set(e.pointerId, a);
    if (a.strike) { (G as any).touch?.strikeDown?.(e); return; }
    if (a.hold) { a.hold.down(); return; }
    a.run?.();
    G.audio?.ui?.('click', 0.3);
    this.t = 0.05;
  }
  private up(e: PointerEvent, a: CtxAction, b: HTMLElement, cancel: boolean) {
    b.classList.remove('down');
    if (this.held.get(e.pointerId) !== a) return;
    this.held.delete(e.pointerId);
    if (a.strike) (G as any).touch?.strikeUp?.(cancel);
    else if (a.hold) a.hold.up();
  }
  private releaseAll() {
    for (const a of this.held.values()) { if (a.hold) a.hold.up(); if (a.strike) (G as any).touch?.strikeUp?.(true); }
    this.held.clear();
  }
  /** the run of an action by id (tests, the hotbar) */
  act(id: string): boolean { const a = this.list.find((q) => q.id === id); if (!a?.run || a.why) return false; a.run(); return true; }
}
// (item defs keep the icon table honest)
void itemDef;

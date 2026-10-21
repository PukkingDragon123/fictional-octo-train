// Physical interaction, no popups (G.grab).
//
//  Right mouse, tapped   the primary verb of what is under the cursor: a box
//                        opens (the loot view), a chair is sat on, a door
//                        swings, a switch flips, an item is picked up, a body is
//                        searched; on yourself it opens the backpack (or uses
//                        what is in hand: eat, drink, read, treat...)
//  Right mouse, held     grab it: furniture is pushed (W) and dragged (S) with
//                        real weight, Shift is power, Space shoves it away, let
//                        go to release; small things are lifted and carried
//                        (left click throws); a door is swung by pushing or
//                        pulling; a lever is hauled down (S)
//  Right held + wheel    step through the other verbs, one word at a time;
//                        release does the one shown
//  Left mouse + tool     what the tool does to it (src/interact/toolUse.ts)
//
// Over the thing hangs a hint in free text (a real typeface, no box): what the
// buttons will do, with stencil pictograms (src/interact/signs.ts); holding on,
// bakelite keys for push / pull / power / shove and a strain gauge with a needle;
// stepping through verbs, ‹ the word › and a row of rivets for where you are.
// Touch (src/ui/touch) drives the same calls: tap = primary, long-press / the
// glove / holding USE = grab, swipe the USE cap = next verb.
import './grab.css';
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import { pick, PickTarget, targetPos } from '../game/picking';
import { objDef } from '../world/objects';
import type { TileObject } from '../world/zone';
import type { Container } from '../items/container';
import { TimedAction } from '../actions/action';
import { queueAt } from '../actions/basic';
import { DoorAction } from '../actions/world';
import { pushable } from '../world/destruction';
import { PushAction, queueOn, Target } from '../world/destructActions';
import { VerbTarget, Verb, verbsFor, primaryVerb, verbWord, heldItem, openLoot, openBackpack } from './verbs';
import { toolVerb, noteStrike, toolHit } from './toolUse';
import { punch, pop } from '../gfx/juice';
import { verbGlyph, glyphUrl } from './signs';

const HOLD_MS = 220;      // right button held this long on something grabbable = grab
const TAP_MS = 650;       // released sooner than this (and not consumed) = the primary verb
const _v = new THREE.Vector3();

type HoldSrc = 'mouse' | 'touch' | 'virtual' | null;
interface RmbPress { t: VerbTarget | null; t0: number; x: number; y: number; consumed: boolean; verbs: Verb[] | null; sel: number }

/** holding on to a door (swing it) or a lever (haul it down) */
class HoldEdgeAction extends TimedAction {
  acc = 0; px = 0; pz = 0; dir = 0;
  constructor(p: Player, public kind: 'door' | 'lever', public tgt: PickTarget) {
    super(p);
    this.name = kind === 'door' ? 'Door' : 'Lever';
    this.duration = 1e9; this.fixedTime = true; this.canMove = true; this.showBar = false;
    this.anim = 'drag' as any;
    this.face = targetPos(tgt);
  }
  start() { this.px = this.p.x; this.pz = this.p.z; G.audio?.at?.('dmg_grab', this.face!.x, this.face!.z, 0.5); }
  perform() { /* let go */ }
}

export class GrabSystem implements GameSystem {
  name = 'grab';
  private rmb: RmbPress | null = null;
  /** who started the current grab (and so who ends it) */
  src: HoldSrc = null;
  /** a grab on its way (walking over) */
  private pending: TimedAction | null = null;
  private edge: HoldEdgeAction | null = null;
  private lmbClaim = false;
  private hint: HTMLDivElement;
  private hintKey = '';
  private hover: { t: VerbTarget | null; key: string; prim: Verb | null; tool: string; grab: boolean; at: number } = { t: null, key: '', prim: null, tool: '', grab: false, at: 0 };

  constructor() {
    G.grab = this;
    this.hint = document.createElement('div');
    this.hint.id = 'gx-hint';
    document.body.appendChild(this.hint);
    // right button + wheel: step through the verbs (the camera does not zoom meanwhile)
    window.addEventListener('wheel', (e) => {
      const r = this.rmb;
      if (!r || !G.input?.mouseDown[2] || this.holding) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.cycle(r, Math.sign(e.deltaY) || 1);
    }, { capture: true, passive: false });
    bus.on('travelStart', () => this.letGo());
  }

  // ================================================================ queries
  /** holding something right now (furniture, a carried thing, a door, a lever) */
  get holding(): boolean { return !!(G.destruct?.push?.holding || this.edge); }
  /** the right button is ours this press (aiming with it is off): src/game/game.ts */
  ownsRmb(): boolean {
    if (this.holding || this.pending) return true;
    const t = this.rmb?.t;
    return !!t && t.kind !== 'tile' && !(t.kind === 'creature' && !(t.c as any).dead);
  }
  /** a left click now would be a tool verb or a throw (combat should not swing too) */
  claimsLmb(): boolean { return this.lmbClaim; }
  /** what a right click would do on a target */
  primaryOf(t: VerbTarget | null): Verb | null { const p = G.local; return p ? primaryVerb(p, t) : null; }
  verbsOf(t: VerbTarget | null): Verb[] { const p = G.local; return p ? verbsFor(p, t) : []; }

  /** can this be taken hold of? */
  grabbable(p: Player, t: VerbTarget | null): 'push' | 'carry' | 'door' | 'lever' | null {
    if (!t) return null;
    if (t.kind === 'object') {
      const d = objDef(t.obj.key); if (!d) return null;
      if (d.tags?.includes('lever')) return 'lever';
      if (!pushable(d, t.obj)) return null;
      const power = G.input.down('power') || G.input.down('run');
      return G.destruct?.push?.liftable?.(p, t.obj, power) ? 'carry' : 'push';
    }
    if (t.kind === 'edge') {
      const e = t.edge;
      if ((e.kind === 'door' || e.kind === 'gate') && !e.portal && !e.barricade && !e.locked) return 'door';
    }
    return null;
  }

  // ================================================================ actions
  /** the primary verb (right click / tap / E / USE) */
  primary(p: Player, t: VerbTarget | null): boolean {
    const v = primaryVerb(p, t);
    if (!v) return false;
    v.run();
    G.audio?.ui?.('click', 0.25);
    return true;
  }

  /** take hold of t (walks over first when it is out of reach) */
  grab(p: Player, t: VerbTarget | null, src: HoldSrc): boolean {
    const kind = this.grabbable(p, t);
    if (!kind || !t || t.kind === 'self') return false;
    this.letGo();
    this.src = src;
    if (kind === 'push' || kind === 'carry') {
      const o = (t as any).obj as TileObject;
      const a = new PushAction(p, o, kind);
      queueOn(p, o, a, 0.45);
      this.pending = a;
    } else {
      const a = new HoldEdgeAction(p, kind, t);
      const pos = targetPos(t);
      queueAt(p, pos.x, pos.z, a, kind === 'door' ? 1.1 : 1.3, kind !== 'door');
      this.edge = a; this.pending = a;
    }
    punch(0.015, 0.12);
    return true;
  }

  /** let go of whatever is held (a pending grab is called off) */
  letGo() {
    const p = G.local;
    if (this.pending && p) {
      const a = this.pending;
      if (!a.started && p.actions.list.includes(a)) p.actions.clear();
    }
    this.pending = null;
    if (G.destruct?.push?.st && !G.destruct.push.st.free && !G.destruct.push.st.thrown && !G.destruct.push.st.topple) G.destruct.push.end('release');
    if (this.edge) { this.edge.done = true; this.edge = null; }
    this.src = null;
  }

  /** the nearest grabbable thing in reach, in front first (touch glove / 'hold' key) */
  nearestGrab(p: Player): VerbTarget | null {
    const objs: TileObject[] = G.interact?.objectsNear?.(p, 1.2) || [];
    let best: VerbTarget | null = null, bs = Infinity;
    for (const o of objs) {
      const t: PickTarget = { kind: 'object', obj: o, point: _v };
      if (!this.grabbable(p, t)) continue;
      const c = targetPos(t);
      const da = Math.abs(Math.atan2(Math.sin(Math.atan2(c.z - p.z, c.x - p.x) - p.facing), Math.cos(Math.atan2(c.z - p.z, c.x - p.x) - p.facing)));
      const s = Math.hypot(c.x - p.x, c.z - p.z) + da * 0.5;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }

  /** open a container's loot view (the iron-cube backpack when it is in) */
  openLoot(p: Player, inv: Container | null | undefined, src?: any) { openLoot(p, inv, src); }
  openBackpack() { openBackpack(); }
  /** a blow just landed through a click (the combat swing should not land it twice) */
  noteStrike(t: Target) { if (t?.kind === 'obj') noteStrike('o' + t.o.uid); }
  /** combat's swing, no creature hit: the tool in hand on what it meets (src/world/destruction.ts meleeWorld) */
  toolHit(p: Player, w: any, it: any): boolean { return toolHit(p, w, it); }

  // ---- touch
  touchPrimary(t: VerbTarget | null) { const p = G.local; if (p && !p.body.dead) this.primary(p, t); }
  touchGrab(t: VerbTarget | null): boolean { const p = G.local; return !!p && !p.body.dead && this.grab(p, t, 'touch'); }
  touchRelease() { if (this.src === 'touch') this.letGo(); }

  // ================================================================ per frame
  update(dt: number) {
    const p = G.local, inp = G.input, ui = G.ui;
    if (!p || !inp) return;
    const now = performance.now();
    if (this.pending && (this.pending.started || !p.actions.list.includes(this.pending))) this.pending = null;
    if (this.edge && (this.edge.done || !p.actions.list.includes(this.edge))) this.edge = null;
    const free = !inp.pointerOverUI && !ui?.modal && !ui?.readerEl && !ui?.menuEl && !p.body.dead && !(G as any).items?.placing && !p.inVehicle;

    // ---- right mouse
    if (inp.mousePressed[2] && free) {
      this.rmb = { t: this.pickAt(inp.mouseX, inp.mouseY), t0: now, x: inp.mouseX, y: inp.mouseY, consumed: false, verbs: null, sel: 0 };
    }
    const r = this.rmb;
    if (r && inp.mouseDown[2] && !r.consumed && !r.verbs && now - r.t0 > HOLD_MS && !p.aiming) {
      if (this.grabbable(p, r.t)) { r.consumed = true; this.grab(p, r.t, 'mouse'); }
    }
    if (r && (inp.mouseReleased[2] || !inp.mouseDown[2])) {
      this.rmb = null;
      if (this.src === 'mouse') this.letGo();
      else if (r.verbs) {
        const v = r.verbs[r.sel];
        if (v && !v.why) { v.run(); G.audio?.ui?.('click', 0.3); }
        else if (v?.why) bus.emit('think', p, cap(v.why) + '.');
      } else if (!r.consumed && now - r.t0 < TAP_MS && !p.aiming && free) this.primary(p, r.t);
    }

    // ---- the touch glove / a 'hold' key
    if (inp.hit('hold') && !this.holding) { const t = this.nearestGrab(p); if (t) this.grab(p, t, 'virtual'); else bus.emit('think', p, 'Nothing to get hold of.'); }
    if (inp.up('hold') && this.src === 'virtual') this.letGo();

    // ---- while holding
    const push = G.destruct?.push;
    if (push?.holding) {
      if (inp.hit('shove')) push.shove(p);
      if (push.mode === 'carry' && inp.mousePressed[0] && !inp.pointerOverUI) push.throw(p);
    }
    if (this.edge?.started) this.updateEdge(p, this.edge, dt);

    // ---- left mouse with a tool in hand
    const it = heldItem(p);
    const hv = this.hoverTarget(p, now);
    const tv = it && free && !this.holding && hv.t && hv.t.kind !== 'self' ? toolVerb(p, hv.t as PickTarget, it) : null;
    this.lmbClaim = !!tv || (push?.holding && push.mode === 'carry');
    if (tv && inp.mousePressed[0] && free && !p.aiming) {
      const cur = p.actions.current;
      if (!(cur?.started && cur.locks)) tv.run();
    }
    this.updateHint(p, hv, tv?.label ?? '');
  }

  /** the press machine / door / lever grip: input pushes or pulls it */
  private updateEdge(p: Player, a: HoldEdgeAction, _dt: number) {
    // standing still holding on: walking input moves the door, not the survivor
    p.x = a.px; p.z = a.pz; p.vx = 0; p.vz = 0;
    const mv = G.input.moveAxis();
    const f = mv.y * mv.mag;
    p.facing = p.targetFacing = Math.atan2(a.face!.z - p.z, a.face!.x - p.x);
    if (a.kind === 'lever') {
      if (f < -0.3) { a.acc += _dt * 2.2; (a as any).anim = 'drag'; } else a.acc = Math.max(0, a.acc - _dt);
      if (a.acc >= 1) {
        const o = (a.tgt as any).obj as TileObject;
        G.interact?.pullLever?.(p, o);
        punch(0.03, 0.15);
        a.done = true; this.edge = null; this.src = null;
      }
      return;
    }
    // a door: push it (W) or pull it (S); a firm shove past a third of the way swings it
    const t = a.tgt as Extract<PickTarget, { kind: 'edge' }>;
    if (Math.abs(f) < 0.2) { a.acc *= 0.9; return; }
    const dir = Math.sign(f);
    if (dir !== a.dir) { a.acc = 0; a.dir = dir; }
    (a as any).anim = dir > 0 ? 'push' : 'drag';
    a.acc += _dt * (G.input.down('power') ? 3.5 : 2);
    if (a.acc > 0.35) {
      const z = G.getZone(p.zoneKey), e = z.edge(t.x, t.y, t.side);
      if (!e || e.locked || e.barricade) { a.done = true; this.edge = null; return; }
      // each firm push or pull swings it the other way (open or shut)
      new DoorAction(p, t.x, t.y, t.side, 'toggle').perform();
      a.acc = -9; // one swing per push; reverse to swing it back
    }
  }

  private cycle(r: RmbPress, d: number) {
    const p = G.local; if (!p) return;
    if (!r.verbs) {
      r.verbs = verbsFor(p, r.t);
      r.sel = Math.max(0, r.verbs.findIndex((v) => !v.why));
      r.consumed = true;
      if (this.pending) this.letGo();
    } else if (r.verbs.length) r.sel = (r.sel + d + r.verbs.length) % r.verbs.length;
    G.audio?.ui?.('hover', 0.5);
    this.hintKey = '';
  }

  /** what is under the cursor: the survivor's own body first (a click on yourself) */
  pickAt(x: number, y: number): VerbTarget | null {
    const p = G.local;
    if (!p || !G.view) return null;
    return this.selfAt(x, y) ?? pick(x, y, { creatures: G.creatures?.list?.() || [], ignore: p });
  }
  /** is (x, y) on the survivor's own body on screen? */
  private selfAt(x: number, y: number): VerbTarget | null {
    const p = G.local;
    if (!p || !G.view) return null;
    const a = G.pr.worldToScreen(_v.set(p.x, p.y + 0.35, p.z)), b = G.pr.worldToScreen(_v.set(p.x, p.y + 1.6, p.z));
    const hw = Math.max(8, Math.abs(a.y - b.y) * 0.22);
    if (x > a.x - hw && x < a.x + hw && y < Math.max(a.y, b.y) && y > Math.min(a.y, b.y)) return { kind: 'self', point: new THREE.Vector3(p.x, p.y + 1, p.z) };
    return null;
  }

  /** the hover target and what the buttons would do on it (re-evaluated a few times a second) */
  private hoverTarget(p: Player, now: number) {
    const h = this.hover;
    const inp = G.input;
    const t = inp.pointerOverUI || inp.mouseX < -1000 ? null : (this.rmb?.t ?? (G.ui?.hover && G.ui.hover.kind !== 'tile' ? G.ui.hover : this.selfAt(inp.mouseX, inp.mouseY) ?? G.ui?.hover ?? null));
    const key = !t ? '' : t.kind === 'object' ? 'o' + t.obj.uid : t.kind === 'edge' ? `e${t.x},${t.y},${t.side}` : t.kind === 'item' ? 'i' + t.wi.item.uid : t.kind === 'creature' ? 'c' + (t.c as any).id : t.kind === 'player' ? 'p' + t.p.id : t.kind === 'tile' ? `t${t.x},${t.y}` : t.kind;
    if (key !== h.key || now - h.at > 300) {
      h.t = t; h.key = key; h.at = now;
      h.prim = t && t.kind !== 'tile' ? primaryVerb(p, t) : null;
      h.grab = !!this.grabbable(p, t);
    }
    h.t = t;
    return h;
  }

  // ================================================================ the hint
  private updateHint(p: Player, hv: { t: VerbTarget | null; prim: Verb | null; grab: boolean }, tool: string) {
    const el = this.hint;
    const inp = G.input;
    const touch = document.documentElement.classList.contains('nc-touch');
    const push = G.destruct?.push;
    const r = this.rmb;
    // free text in a real typeface over the thing, with stencil pictograms and the
    // physical bits (a bakelite key, a strain gauge); never a box behind it
    let html = '', cls = '', at: { x: number; y: number; z: number } | null = null;
    if (r?.verbs && r.verbs.length) {
      const v = r.verbs[r.sel];
      html = `<span class="gx-cyc"><i>‹</i>${glyph(verbGlyph(v.label))}<b>${esc(clean(v.label))}</b><i>›</i></span>${pips(r.sel, r.verbs.length)}${v.why ? `<em class="gx-why">${esc(v.why)}</em>` : ''}`;
      cls = 'cyc'; at = this.anchor(r.t);
    } else if (push?.holding && push.st) {
      const st = push.st;
      at = { x: st.cx, y: st.h + 0.3 + st.lift, z: st.cz };
      const pw = inp.down('power') || inp.down('run') || inp.runLatch;
      if (push.mode === 'carry') html = `${seg(glyph('mouseL'), 'throw')}${seg(key('⇧', pw), 'harder')}${seg(glyph('mouseH'), 'let go: set down')}`;
      else {
        const e = Math.round(push.effort * 8) / 8;
        html = `${seg(key('W'), 'push')}${seg(key('S'), 'pull')}${seg(key('⇧', pw), 'power')}${seg(key('␣'), 'shove')}<span class="gx-gauge" style="--e:${e}"><i></i></span>`;
        if (push.effort > 0.92) cls = 'strain';
      }
    } else if (this.edge?.started) {
      at = this.anchor(this.edge.tgt);
      html = this.edge.kind === 'lever' ? seg(key('S'), 'haul it down') : `${seg(key('W'), 'push')}${seg(key('S'), 'pull')}`;
    } else if (hv.t && !inp.pointerOverUI && !G.ui?.menuEl) {
      if (hv.prim) html += seg(glyph('mouseR') + glyph(verbGlyph(hv.prim.label)), verbWord(hv.prim));
      if (hv.grab) html += seg(glyph('mouseH') + glyph('hand'), 'grab');
      if (tool) html += seg(glyph('mouseL') + glyph(verbGlyph(tool)), tool);
      if (html) at = this.anchor(hv.t);
    }
    if (touch || G.local?.aiming || !at) html = '';
    const key0 = cls + '|' + html;
    if (key0 !== this.hintKey) {
      this.hintKey = key0;
      el.innerHTML = html;
      el.className = 'nc-free-text ' + cls;
      el.style.display = html ? 'block' : 'none';
      if (html) pop(el.firstElementChild as HTMLElement, 1.06, 120);
    }
    if (html && at) {
      const s = G.pr.worldToScreen(_v.set(at.x, at.y, at.z));
      el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
    }
  }

  /** where a sign hangs: just over the top of the thing */
  private anchor(t: VerbTarget | null): { x: number; y: number; z: number } | null {
    if (!t) return null;
    const p = G.local;
    switch (t.kind) {
      case 'self': return { x: p.x, y: p.y + 2.05, z: p.z };
      case 'object': { const d = objDef(t.obj.key); const c = targetPos(t); return { x: c.x, y: G.getZone(p.zoneKey).heightAt(t.obj.x, t.obj.y) + (t.obj.state?.y ?? 0) + Math.min(2.3, (d?.height ?? 1) + 0.25), z: c.z }; }
      case 'edge': { const c = targetPos(t); return { x: c.x, y: 2.35, z: c.z }; }
      case 'item': return { x: t.wi.x, y: t.wi.y + 0.45, z: t.wi.z };
      case 'creature': { const c: any = t.c; return { x: c.x, y: (c.y ?? 0) + (c.height ?? 1.2) + 0.3, z: c.z }; }
      case 'player': return { x: t.p.x, y: t.p.y + 2.05, z: t.p.z };
      case 'vehicle': return { x: t.v.x, y: 1.8, z: t.v.z };
      case 'tile': return { x: t.point.x, y: t.point.y + 0.4, z: t.point.z };
    }
    return null;
  }
}

function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }
const clean = (l: string) => l.replace(/\s*\(.*?\)/g, '');
/** a stencil pictogram */
const glyph = (name: string) => `<img class="gx-g" src="${glyphUrl(name)}" alt="">`;
/** a bakelite key with its letter */
const key = (k: string, on = false) => `<kbd class="gx-key${on ? ' on' : ''}">${k}</kbd>`;
/** one control: its key or pictograms, then the word */
const seg = (pre: string, word: string) => `<span class="gx-seg">${pre}<b>${esc(word)}</b></span>`;
/** where you are in the list: brass rivets, the current one red */
const pips = (i: number, n: number) => n > 1 ? `<span class="gx-pips">${Array.from({ length: Math.min(n, 12) }, (_, j) => `<i${j === (n > 12 ? Math.round(i / (n - 1) * 11) : i) ? ' class="on"' : ''}></i>`).join('')}</span>` : '';

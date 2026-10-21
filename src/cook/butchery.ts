// Butchery: kneel over a corpse with a blade, an axe or a saw (E on the body
// with one in hand or pack). Cut markers float over the limbs, the head, the
// belly and the hide. Drag across a marker to cut: each stroke sprays (real
// gore through G.gore), a knife needs a few passes, a saw wants back-and-forth,
// an axe chops through in one or two. When it gives, the part actually comes
// off the body and the meat lands on the floor next to you.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { op, defOp } from '../game/ops';
import { TimedAction } from '../actions/action';
import { itemDef, type Item } from '../items/item';
import { createItem, serializeItem } from '../items/factory';
import { goreOf, KINDS } from '../gore/kinds';
import { partRole, limbId } from '../gore/tearing';
import { hitstop, shake, punch } from '../gfx/juice';
import { bump, mark } from '../build/progress';
import type { Player } from '../entities/player';

type Tool = 'knife' | 'saw' | 'axe';
interface Cut { name: string; kind: 'limb' | 'head' | 'belly' | 'hide'; label: string; need: number; got: number; el: HTMLDivElement; sx: number; sy: number }
interface Yield { meat?: string; human?: boolean; part?: string; hide?: string; organs?: boolean }

/** what each kind of thing gives up */
const SPECIES: Record<string, Yield> = {
  still_life: { human: true, part: 'part_tallow', organs: false },
  employee: { part: 'part_shell_chip', organs: false },
  drywall_man: { part: 'part_plaster_heart', organs: false },
  hollow: { part: 'part_static_node', organs: false },
  echo: { human: true, part: 'part_echo_cochlea', organs: true },
  gloam: { meat: 'cut_haunch', part: 'part_eyeshine', organs: true, hide: 'hide_raw' },
  grinhound: { meat: 'hound_meat_raw', part: 'part_grin_tongue', organs: true, hide: 'hide_raw' },
  stiltdoe: { meat: 'venison_raw', part: 'part_stilt_marrow', organs: true, hide: 'hide_raw' },
  stammer: { human: true, part: 'part_stutter_gland', organs: true },
  lifeguard: { human: true, part: 'part_drowned_lung', organs: true },
  plenum: { meat: 'cut_shank', part: 'part_plenum_eye', organs: true },
  davenport: { part: 'part_cotton_heart', organs: false, hide: 'rag' },
  plushkin: { part: 'part_cotton_heart', organs: false, hide: 'rag' },
  ventling: { meat: 'meat_raw', part: 'part_bellows_lung', organs: true, hide: 'hide_raw' },
  wrongbird: { meat: 'bird_meat_raw', part: 'part_wishbone', organs: false },
  lumenmoth: { part: 'part_glow_sac', organs: false },
  surveyor: { human: true, organs: true },
};
const FLESH = new Set(['red', 'dark', 'pale', 'oil', 'glow']);

/** the survivor kneels at the body while butchering */
class KneelAction extends TimedAction {
  constructor(p: Player, private alive: () => boolean, fx: number, fz: number) { super(p); this.name = 'Butchering'; this.duration = 1e6; this.anim = 'loot'; this.showBar = false; this.fixedTime = true; this.locks = true; this.face = { x: fx, z: fz }; }
  isValid() { return this.alive(); }
  perform() { /* runs until the butcher leaves */ }
}

/** every peer records the cut (and the corpse is spent when the belly and hide are done) */
defOp('butcherCut', (a: { id: string; part: string; done?: boolean }) => {
  const c = G.creatures?.creatures?.get?.(a.id); if (!c) return;
  const cuts: string[] = c.mem.cuts = [...(c.mem.cuts || [])];
  if (!cuts.includes(a.part)) cuts.push(a.part);
  if (a.done && !c.butchered) { c.butchered = true; G.creatures?.onButcher?.(c); }
});

const V = new THREE.Vector3();

export class Butchery {
  active: { c: any; tool: Tool; toolIt: Item; cuts: Cut[]; y: Yield; gaveParts: boolean } | null = null;
  private layer: HTMLDivElement;
  private trail: HTMLDivElement;
  private down = false;
  private lx = 0; private ly = 0;
  private passes = new Set<Cut>();

  constructor() {
    this.layer = document.createElement('div'); this.layer.className = 'bt-layer';
    this.trail = document.createElement('div'); this.trail.className = 'bt-hint';
    this.layer.appendChild(this.trail);
    document.body.appendChild(this.layer);
    window.addEventListener('mousedown', (e) => { if (this.active && e.button === 0) { this.down = true; this.lx = e.clientX; this.ly = e.clientY; this.passes.clear(); e.stopPropagation(); } }, true);
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.down = false; }, true);
    window.addEventListener('mousemove', (e) => { if (this.active && this.down) this.drag(e.clientX, e.clientY); });
    window.addEventListener('touchstart', (e) => { if (this.active && e.touches[0]) { this.down = true; this.lx = e.touches[0].clientX; this.ly = e.touches[0].clientY; this.passes.clear(); } }, { passive: true });
    window.addEventListener('touchmove', (e) => { if (this.active && this.down && e.touches[0]) this.drag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    window.addEventListener('touchend', () => { this.down = false; }, { passive: true });
    bus.on('travelEnd', () => this.stop());
  }

  /** a blade in hand first, then anything sharp in the pack */
  toolOf(p: Player): { tool: Tool; it: Item } | null {
    const kindOf = (it: Item | null | undefined): Tool | null => {
      if (!it) return null;
      const d = itemDef(it.key), t = d.tags || [];
      if (t.includes('saw')) return 'saw';
      if (t.includes('axe') || d.weapon?.kind === 'axe') return 'axe';
      if (t.includes('knife') || t.includes('sharp') || d.weapon?.kind === 'blade') return 'knife';
      return null;
    };
    for (const it of [p.handR, p.handL]) { const k = kindOf(it); if (k) return { tool: k, it: it! }; }
    for (const it of p.allItems()) { const k = kindOf(it); if (k) return { tool: k, it }; }
    return null;
  }

  canButcher(c: any) { return !!c?.dead && !c.butchered && !c.sp?.flags?.noCorpse && goreOf(c.sp).blood !== 'none'; }

  /** E on a corpse: start butchering if we have a blade (otherwise the caller loots it) */
  start(p: Player, c: any): boolean {
    if (!this.canButcher(c) || this.active) return false;
    const t = this.toolOf(p);
    if (!t) return false;
    const y: Yield = SPECIES[c.sp.key] ?? (FLESH.has(goreOf(c.sp).blood) ? { meat: c.sp.meat?.[0]?.[0] ?? 'cut_haunch', organs: true, hide: c.sp.radius > 0.35 ? 'hide_raw' : undefined } : { organs: false });
    const cuts = this.cutsFor(c, t.tool, y);
    if (!cuts.length) return false;
    this.active = { c, tool: t.tool, toolIt: t.it, cuts, y, gaveParts: false };
    for (const k of cuts) this.layer.appendChild(k.el);
    this.layer.classList.add('on');
    p.actions.clear();
    p.actions.add(new KneelAction(p, () => this.active?.c === c, c.x, c.z));
    if (p.handR !== t.it && !p.handR) p.equip(t.it, 'R');
    punch(0.06, 0.4);
    G.audio?.at?.('metal_clank', p.x, p.z, 0.3);
    bus.emit('think', p, y.human ? 'It looks like a person. It isn\'t. Probably.' : 'Okay. Okay. Just meat.');
    return true;
  }

  stop() {
    if (!this.active) return;
    for (const k of this.active.cuts) k.el.remove();
    this.active = null;
    this.layer.classList.remove('on');
    const p = G.local;
    if (p && p.actions.current instanceof KneelAction) p.actions.clear();
  }

  private cutsFor(c: any, tool: Tool, y: Yield): Cut[] {
    const gd = goreOf(c.sp);
    const done: string[] = [...(c.mem.cuts || []), ...(c.mem.severed || []), ...(c.mem.sev || [])];
    const seen = new Set<string>();
    const out: Cut[] = [];
    const strokes = (kind: Cut['kind']) => {
      const base = kind === 'head' ? 4 : kind === 'hide' ? 4 : 3;
      if (tool === 'axe') return kind === 'hide' ? 6 : kind === 'head' ? 2 : 1;
      if (tool === 'saw') return kind === 'hide' ? 5 : 2;
      return base;
    };
    const mk = (name: string, kind: Cut['kind'], label: string): Cut => {
      const el = document.createElement('div'); el.className = 'bt-mark ' + kind; el.innerHTML = `<i></i><span>${label}</span>`;
      return { name, kind, label, need: strokes(kind), got: 0, el, sx: -999, sy: -999 };
    };
    for (const n of gd.sever || []) {
      const role = partRole(n, gd.head);
      if (role === 'head' || done.includes(n)) continue;
      const k = role + ':' + limbId(n);
      if (role !== 'other' && seen.has(k)) continue;
      seen.add(k);
      out.push(mk(n, 'limb', role === 'leg' ? 'LEG' : role === 'arm' ? 'ARM' : role === 'tail' ? 'TAIL' : 'CUT'));
    }
    if (gd.head && !done.includes(gd.head)) out.push(mk(gd.head, 'head', 'HEAD'));
    if (!done.includes('belly')) out.push(mk('belly', 'belly', y.organs === false ? 'OPEN' : 'GUT'));
    if (y.hide && !done.includes('hide')) out.push(mk('hide', 'hide', 'SKIN'));
    return out;
  }

  /** world position of a cut on the body (rig part if we have one) */
  private posOf(c: any, k: Cut, out: THREE.Vector3) {
    const part = k.kind === 'belly' || k.kind === 'hide' ? null : c.rig?.parts?.[k.name];
    if (part) { part.getWorldPosition(out); return out; }
    const r = c.radius ?? 0.4;
    const off = k.kind === 'hide' ? 0.25 : k.kind === 'belly' ? 0 : (k.name.length % 3 - 1) * 0.3;
    out.set(c.x + Math.cos(c.facing + 1.57) * off * r * 2, (c.height ?? 1) * 0.18 + (k.kind === 'hide' ? 0.1 : 0), c.z + Math.sin(c.facing + 1.57) * off * r * 2);
    return out;
  }

  update() {
    const a = this.active; if (!a) return;
    const p = G.local, c = a.c, inp = G.input;
    if (!p || p.body.dead || !c || c.butchered || p.zoneKey !== c.zoneKey || Math.hypot(p.x - c.x, p.z - c.z) > 2.6) { this.stop(); return; }
    if (inp.keyHit('Escape') || inp.hit('interact') || inp.mouseReleased[2]) { inp.pressed.delete('Escape'); inp.pressed.delete('KeyE'); this.stop(); return; }
    if (inp.moveAxis().mag > 0.2) { this.stop(); return; }
    const cam = G.pr.camera as THREE.Camera;
    for (const k of a.cuts) {
      this.posOf(c, k, V); V.project(cam);
      k.sx = (V.x * 0.5 + 0.5) * window.innerWidth; k.sy = (-V.y * 0.5 + 0.5) * window.innerHeight;
      k.el.style.transform = `translate(${k.sx | 0}px, ${k.sy | 0}px)`;
      k.el.style.setProperty('--p', String(k.got / k.need));
    }
    const verb = a.tool === 'saw' ? 'Saw back and forth across a mark' : a.tool === 'axe' ? 'Chop: swipe hard across a mark' : 'Drag the blade across a mark';
    this.trail.textContent = `${verb} · E / Esc to stand up`;
  }

  // ---------------------------------------------------------------- strokes
  private drag(x: number, y: number) {
    const a = this.active; if (!a) return;
    const dx = x - this.lx, dy = y - this.ly, len = Math.hypot(dx, dy);
    if (len < 6) return;
    for (const k of a.cuts) {
      // distance from the mark to this mouse segment
      const t = Math.max(0, Math.min(1, ((k.sx - this.lx) * dx + (k.sy - this.ly) * dy) / (len * len)));
      const d = Math.hypot(this.lx + dx * t - k.sx, this.ly + dy * t - k.sy);
      const crossed = d < 22;
      if (crossed && !this.passes.has(k)) {
        this.passes.add(k);
        const fast = len > (a.tool === 'axe' ? 22 : 8);
        if (fast) this.stroke(k, dx, dy);
      } else if (!crossed && d > 40) this.passes.delete(k); // moved away: the next pass counts again (sawing)
    }
    this.lx = x; this.ly = y;
  }

  private stroke(k: Cut, sdx: number, sdy: number) {
    const a = this.active!; const c = a.c; const p = G.local!;
    k.got++;
    const gd = goreOf(c.sp), K = KINDS[gd.blood], tint = gd.tint ?? K.tint;
    this.posOf(c, k, V);
    // screen swipe → world direction (camera yaw)
    const yaw = G.pr.yaw, wdx = sdx * Math.cos(yaw) + sdy * Math.sin(yaw), wdz = -sdx * Math.sin(yaw) + sdy * Math.cos(yaw);
    const n = Math.hypot(wdx, wdz) || 1;
    const fin = k.got >= k.need;
    if (G.gore && K.key !== 'none') {
      G.gore.jet(K, tint, V.x, V.y + 0.05, V.z, wdx / n, wdz / n, fin ? 22 : 9, fin ? 3.2 : 2.2, 0.5, 1.2, 0.028, 0.08);
      if (k.kind === 'belly' && fin) G.gore.bits(K, tint, V.x, V.y + 0.1, V.z, wdx / n, wdz / n, 14, 2);
      G.gore.lensNear(V.x, V.z, fin ? 1.2 : 0.5, K);
      if (fin) G.gore.pool(G.getZone(c.zoneKey), c.x + (Math.random() - 0.5) * 0.4, c.z + (Math.random() - 0.5) * 0.4, 0.7 + Math.random() * 0.4, K, tint);
    }
    const snd = a.tool === 'axe' ? 'hit_blade' : a.tool === 'saw' ? 'saw' : 'flesh_cut';
    G.audio?.at?.(snd, V.x, V.z, 0.9);
    if (fin && (k.kind === 'limb' || k.kind === 'head')) G.audio?.at?.('bone_crunch', V.x, V.z, 0.9);
    hitstop(a.tool === 'axe' ? 70 : 40);
    shake(a.tool === 'axe' ? 0.3 : 0.12);
    k.el.classList.remove('hit'); void k.el.offsetWidth; k.el.classList.add('hit');
    a.toolIt.cond = Math.max(0, a.toolIt.cond - 0.002);
    p.body.addXp('trapping', 1);
    if (fin) this.finish(k, wdx / n, wdz / n);
  }

  private finish(k: Cut, dx: number, dz: number) {
    const a = this.active!; const c = a.c; const p = G.local!;
    const z = G.getZone(c.zoneKey);
    // the part comes off the body for everyone
    if (k.kind === 'limb' || k.kind === 'head') G.gore?.creatureSevered?.(c, [k.name], { kind: a.tool === 'axe' ? 'axe' : 'blade', fx: c.x - dx, fz: c.z - dz, dmg: 30, crit: false } as any);
    // what it gives
    const y = a.y, out: string[] = [];
    const meat = y.human ? 'cut_gristle' : y.meat;
    if (k.kind === 'limb') {
      const role = partRole(k.name, goreOf(c.sp).head);
      if (meat) out.push(role === 'arm' && !y.human && meat === 'cut_haunch' ? 'cut_shank' : meat);
      if (FLESH.has(goreOf(c.sp).blood)) out.push('bone');
      else if (y.part && !a.gaveParts && Math.random() < 0.25) { out.push(y.part); a.gaveParts = true; }
    } else if (k.kind === 'head') {
      if (y.part && !a.gaveParts) { out.push(y.part); a.gaveParts = true; } else out.push('bone');
    } else if (k.kind === 'belly') {
      if (y.organs !== false) { out.push('organ_heart', 'organ_liver', 'organ_offal'); if ((c.radius ?? 0.4) > 0.45 && meat) out.push('cut_ribs'); }
      if (y.part && !a.gaveParts) { out.push(y.part); a.gaveParts = true; }
      if (y.part === 'part_tallow') out.push('part_tallow');
    } else if (k.kind === 'hide' && y.hide) out.push(y.hide);
    for (const key of out) {
      const it = createItem(key);
      const ang = Math.atan2(dz, dx) + (Math.random() - 0.5) * 1.6, sp = 1 + Math.random() * 1.2;
      op('dropFloor', { z: z.key, item: serializeItem(it), x: c.x + dx * 0.3, zz: c.z + dz * 0.3, y: 0.5, v: [Math.cos(ang) * sp, 1.6 + Math.random() * 1.4, Math.sin(ang) * sp] });
      if (itemDef(key).tags?.includes('weirdpart')) bump('butcher_part');
    }
    if (out.length) bus.emit('halo', p, out.map((x) => itemDef(x).name).join(' · '), 'good');
    if (y.human) { p.body.stress = Math.min(100, (p.body.stress ?? 0) + 8); p.body.unhappy = Math.min(100, (p.body.unhappy ?? 0) + 6); }
    // done with this mark
    k.el.remove();
    a.cuts = a.cuts.filter((q) => q !== k);
    const spent = !a.cuts.some((q) => q.kind === 'belly' || q.kind === 'hide') || !a.cuts.length;
    op('butcherCut', { id: c.id, part: k.name, done: spent });
    punch(0.05, 0.2);
    if (spent) {
      bump('butcher_full'); mark('butcher:any');
      bus.emit('think', p, y.human ? 'I need to wash my hands. For a long time.' : 'That\'s all of it worth taking.');
      bus.emit('corpseButchered', p, c);
      this.stop();
    }
  }
}

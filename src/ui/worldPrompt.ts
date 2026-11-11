// THE WORLD PROMPT (round 14). No buttons in a corner: what the hands can do floats over
// the thing itself, as crisp Alagard text in a dark ink outline (no box):
//      [E] Search: Filing Cabinet          the best target, bright
//      [G] Carry                           its other verbs, small
//      [U] Open door                       one or two other things in reach, dimmed
// The actions and their targets come from src/ui/hotbar/context.ts (contextActions: the
// same targeting and keys as before); this file only draws them. Each label is projected
// from its target's world position every frame (whole pixels, lightly smoothed, so it does
// not shimmer), fades in and out, and keeps clear of the body console (top left), the job
// tracker (top right), the hotbar and the touch pad. On touch there are no keys: the label
// itself is the button (tap the name for the main verb, a small verb for the others).
// Actions with no target (Lamp, Swim, Strike) are keybind-only / on the touch pad.
// An inhabitant or anomaly nobody has scanned reads "[Q] Scan: <name>" (hold Q).
import './worldPrompt.css';
import * as THREE from 'three';
import { G } from '../game/G';
import type { CtxAction, V3 } from './hotbar/context';

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const KEYCAP: Record<string, string> = { Space: 'Space', Shift: 'Shift' };
/** things the labels must not cover (refreshed a few times a second) */
const KEEP_OUT = ['canvas.bh-ov', '.bh-lab', '.obj15.on', '.lp-track', '#hot12', '.lp-next.on', '#wpad', '#nc-touch .nc-tl', '#nc-touch .nc-tr'];
/** the mouse hint of the grab system (src/interact/grab.ts) floats over held things: stand above it */
const MOUSE_HINT = 'gx-hint';
/** targets the unit is already holding: a quieter label (the grab hint shows the mouse) */
const HELD = new Set(['carry', 'held']);
const MAX_DIM = 2;

interface Group { tgt: string; acts: CtxAction[]; anchor: () => V3 | null }
interface Tag {
  key: string; tgt: string; prim: boolean;
  el: HTMLDivElement; acts: CtxAction[]; anchor: () => V3 | null;
  sig: string; w: number; h: number;
  x: number; y: number; placed: boolean; vis: boolean; seen: boolean;
}

const _v = new THREE.Vector3();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const hit = (ax: number, ay: number, aw: number, ah: number, b: { left: number; top: number; right: number; bottom: number }) => ax < b.right && ax + aw > b.left && ay < b.bottom && ay + ah > b.top;

export class WorldPrompt {
  readonly el: HTMLDivElement;
  private tags = new Map<string, Tag>();
  private keepOut: DOMRect[] = [];
  private koT = 0;
  private touch = false;
  /** a tap on a label runs the action (wired to the context bar) */
  onRun: (a: CtxAction) => void = (a) => { if (!a.why) a.run?.(); };

  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'wprompt';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => this.onTap(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    (G as any).worldPrompt = this;
  }

  /** the bright label's box on screen (tours, tutorials), or null */
  primaryRect(): DOMRect | null {
    for (const t of this.tags.values()) if (t.prim && t.vis) return t.el.getBoundingClientRect();
    return null;
  }

  update(dt: number, list: CtxAction[], on: boolean, touch: boolean) {
    if (touch !== this.touch) { this.touch = touch; this.el.classList.toggle('touch', touch); for (const t of this.tags.values()) t.sig = ''; }
    // the labels: one per target, the best first
    const groups: Group[] = [];
    if (on) {
      for (const a of list) {
        if (!a.tgt || !a.anchor) continue;
        let g = groups.find((q) => q.tgt === a.tgt);
        if (!g) { g = { tgt: a.tgt, acts: [], anchor: a.anchor }; groups.push(g); }
        g.acts.push(a);
      }
    }
    const shown = groups.slice(0, 1 + MAX_DIM);
    for (const t of this.tags.values()) t.seen = false;
    shown.forEach((g, i) => {
      const prim = i === 0;
      const key = g.tgt + (prim ? '#p' : '#d');
      let t = this.tags.get(key);
      if (!t) {
        const el = document.createElement('div');
        el.className = 'wp-tag ' + (prim ? 'prim' : 'dim') + (HELD.has(g.tgt) ? ' held' : '');
        this.el.appendChild(el);
        t = { key, tgt: g.tgt, prim, el, acts: g.acts, anchor: g.anchor, sig: '', w: 0, h: 0, x: 0, y: 0, placed: false, vis: false, seen: true };
        this.tags.set(key, t);
      }
      t.seen = true; t.acts = g.acts; t.anchor = g.anchor;
      const sig = this.sigOf(g.acts, prim);
      if (sig !== t.sig) { t.sig = sig; t.el.innerHTML = this.html(g.acts, prim && !(HELD.has(g.tgt) && !this.touch)); this.measure(t); }
    });
    for (const t of [...this.tags.values()]) if (!t.seen) this.kill(t);
    if (!this.tags.size) return;
    // keep-out boxes
    this.koT -= dt;
    if (this.koT <= 0) {
      this.koT = 0.4;
      this.keepOut = [];
      for (const sel of KEEP_OUT) for (const e of document.querySelectorAll(sel)) {
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) continue;
        this.keepOut.push(r);
      }
      for (const t of this.tags.values()) this.measure(t);
    }
    this.place(dt);
  }

  // ------------------------------------------------------------------ drawing
  private sigOf(acts: CtxAction[], prim: boolean) {
    return (this.touch ? 'T' : 'D') + (prim ? 'p' : 'd') + acts.map((a) => a.id + '|' + a.key + '|' + (a.head ?? a.label) + '|' + (a.name ?? '') + '|' + (a.why ?? '')).join('/');
  }
  private keyCap(k: string) { return this.touch || !k ? '' : `<b class="wp-key">[${esc(KEYCAP[k] ?? k)}]</b>`; }
  private html(acts: CtxAction[], prim: boolean): string {
    const a = acts[0];
    const verb = a.head ?? a.label, name = a.name ?? '';
    const words = verb && name ? `<span class="wp-v">${esc(verb)}:</span> <span class="wp-n">${esc(name)}</span>` : `<span class="wp-n">${esc(verb || name)}</span>`;
    let s = `<div class="wp-in"><div class="wp-head${a.why ? ' no' : ''}" data-a="0">${this.keyCap(a.key)}${words}</div>`;
    if (a.why) s += `<div class="wp-why">${esc(a.why)}</div>`;
    if (prim && acts.length > 1) {
      s += '<div class="wp-subs">' + acts.slice(1).map((q, i) => `<span class="wp-sub${q.why ? ' no' : ''}" data-a="${i + 1}">${this.keyCap(q.key)}${esc(q.label)}</span>`).join('') + '</div>';
    }
    return s + '</div>';
  }
  private measure(t: Tag) { t.w = t.el.offsetWidth; t.h = t.el.offsetHeight; }

  private kill(t: Tag) {
    this.tags.delete(t.key);
    t.el.classList.remove('vis');
    t.el.style.pointerEvents = 'none';
    setTimeout(() => t.el.remove(), 220);
  }

  /** project, keep clear of the HUD and of each other, ease into place */
  private place(dt: number) {
    const pr: any = (G as any).pr;
    if (!pr?.worldToScreen) return;
    const W = window.innerWidth, H = window.innerHeight, M = 8;
    const k = 1 - Math.exp(-dt * 26);
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    // the unit's head stays in sight: a label over something beside it rises above the head
    const me = G.local;
    let head: { left: number; top: number; right: number; bottom: number } | null = null;
    if (me) {
      const a = pr.worldToScreen(_v.set(me.x, me.y + 1.95, me.z)), b = pr.worldToScreen(_v.set(me.x, me.y + 1.2, me.z));
      const hw = Math.max(10, (pr.cssPerMetre?.() ?? 60) * 0.3);
      if (a.z < 1) head = { left: a.x - hw, right: a.x + hw, top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) };
    }
    const mh = document.getElementById(MOUSE_HINT);
    const mr = mh && mh.style.display !== 'none' && mh.innerHTML ? mh.getBoundingClientRect() : null;
    const order = [...this.tags.values()].sort((a, b) => (a.prim === b.prim ? 0 : a.prim ? -1 : 1));
    for (const t of order) {
      let a: V3 | null = null;
      try { a = t.anchor(); } catch { a = null; }
      let ok = !!a;
      let tx = 0, ty = 0;
      if (a) {
        const s = pr.worldToScreen(_v.set(a.x, a.y, a.z));
        if (!(s.z < 1) || s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) ok = false;
        tx = s.x - t.w / 2; ty = s.y - t.h - 4;
        tx = clamp(tx, M, W - t.w - M); ty = clamp(ty, M, H - t.h - M);
        // never over the console, the tracker or the hotbar: slide below / above it
        for (let pass = 0; pass < 2; pass++) for (const r of this.keepOut) {
          if (!hit(tx, ty, t.w, t.h, r)) continue;
          if (r.top + r.height / 2 < H / 2) ty = r.bottom + 6; else ty = r.top - t.h - 6;
        }
        if (head && !HELD.has(t.tgt) && hit(tx, ty, t.w, t.h, head)) ty = head.top - t.h - 2;
        if (mr && mr.width > 2 && hit(tx, ty, t.w, t.h, mr)) ty = mr.top - t.h - 2;
        // dim labels step out of the bright one's way
        for (const r of placed) {
          if (!hit(tx, ty, t.w, t.h, r)) continue;
          ty = s.y < (r.top + r.bottom) / 2 ? r.top - t.h - 4 : r.bottom + 4;
        }
        ty = clamp(ty, M, H - t.h - M);
      }
      if (ok) {
        if (!t.placed) { t.x = tx; t.y = ty; t.placed = true; }
        else { t.x += (tx - t.x) * k; t.y += (ty - t.y) * k; if (Math.abs(tx - t.x) < 0.35) t.x = tx; if (Math.abs(ty - t.y) < 0.35) t.y = ty; }
        t.el.style.transform = `translate3d(${Math.round(t.x)}px, ${Math.round(t.y)}px, 0)`;
        placed.push({ left: t.x, top: t.y, right: t.x + t.w, bottom: t.y + t.h });
      }
      if (ok !== t.vis) { t.vis = ok; t.el.classList.toggle('vis', ok); }
    }
  }

  // ------------------------------------------------------------------ touch
  private onTap(e: PointerEvent) {
    if (!this.touch) return;
    const hitEl = (e.target as HTMLElement | null)?.closest?.('[data-a]') as HTMLElement | null;
    const tagEl = (e.target as HTMLElement | null)?.closest?.('.wp-tag') as HTMLElement | null;
    if (!tagEl) return;
    const t = [...this.tags.values()].find((q) => q.el === tagEl);
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    try { (G as any).input.pointerOverUI = false; } catch { /* no input */ }
    const a = t.acts[hitEl ? +(hitEl.dataset.a || 0) : 0] ?? t.acts[0];
    if (!a) return;
    const el = hitEl ?? tagEl;
    el.classList.add('down');
    setTimeout(() => el.classList.remove('down'), 140);
    this.onRun(a);
  }

  clear() { for (const t of [...this.tags.values()]) this.kill(t); }
}

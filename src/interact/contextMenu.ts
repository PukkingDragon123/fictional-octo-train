// RIGHT-CLICK CONTEXT MENUS (round 19): right click a corpse, a box, a door, a piece of furniture, something on
// the floor or yourself and a strip of plain-text options drops out at the pointer, as in the old survival sims:
// Loot / Search pockets / Drag / Butcher, Open / Take / Inspect, Pick up / Eat / Equip... A tap of E still does the
// first one (the primary verb, src/interact/verbs.ts); holding the right button still grabs (src/interact/grab.ts).
//
// The strip is a worn olive terminal plate from the machine kit (src/ui/pxKit.ts: chipped paint, scanlines, the
// hazard strip, screws) with Alagard type on it: no icons, no box of flat colour, no rounded corners. Rows light
// amber under the pointer and lean in; greyed rows say why on the foot line; a row with more behind it opens a second
// strip beside it; "Info" at the bottom prints what is known about the thing on the same plate.
//
// WHERE THE OPTIONS COME FROM (no system has to know about this file):
//  - the old option lists: G.interact.menu() and the 'worldMenu' / 'objectMenu' bus events (MenuOption[]), the
//    held-item verbs and the bench / look-closer verbs (all through verbsFor in ./verbs.ts)
//  - anything registered here:
//      registerContextActions(kind, (target, player) => [{ label, run, enabled?, info?, sub?, danger? }])
//      registerContextInfo(kind, (target, player) => ['line', 'line'])
//    kind: 'any' | 'self' | 'object' | 'container' | 'furniture' | 'door' | 'window' | 'edge' | 'item' | 'creature'
//          | 'corpse' | 'player' | 'vehicle' | 'tile' | 'wall'
//    `enabled` false (or a reason string) greys the row; MenuOption lists may carry `info` (a foot-line note).
import { G } from '../game/G';
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';
import { targetPos } from '../game/picking';
import { objDef } from '../world/objects';
import { itemDef, itemName, itemWeight } from '../items/item';
import { verbsFor, verbTargetName, type VerbTarget, type Verb } from './verbs';
import { wallNear } from '../world/destructActions';
import { pxPlate } from '../ui/pxKit';
import { dprK } from '../ui/hiPixel';
import { clearReach } from '../world/collision';
import './contextMenu.css';

export type CtxKind = 'any' | 'self' | 'object' | 'container' | 'furniture' | 'door' | 'window' | 'edge' | 'item' | 'creature' | 'corpse' | 'player' | 'vehicle' | 'tile' | 'wall';
export interface CtxAction {
  label: string;
  run?: () => void;
  /** false greys the row; a string greys it and says why */
  enabled?: boolean | string;
  /** a note on the foot line while the row is under the pointer */
  info?: string;
  sub?: CtxAction[];
  danger?: boolean;
}
type ActFn = (target: VerbTarget, player: Player) => (CtxAction | MenuOption)[] | null | undefined | void;
type InfoFn = (target: VerbTarget, player: Player) => string[] | null | undefined | void;

const ACTS: { kind: CtxKind; fn: ActFn }[] = [];
const INFOS: { kind: CtxKind; fn: InfoFn }[] = [];

/** add options to the right-click menu of every target of this kind; returns an unregister function */
export function registerContextActions(kind: CtxKind, fn: ActFn): () => void {
  const e = { kind, fn };
  ACTS.push(e);
  return () => { const i = ACTS.indexOf(e); if (i >= 0) ACTS.splice(i, 1); };
}
/** add lines to the "Info" readout of every target of this kind; returns an unregister function */
export function registerContextInfo(kind: CtxKind, fn: InfoFn): () => void {
  const e = { kind, fn };
  INFOS.push(e);
  return () => { const i = INFOS.indexOf(e); if (i >= 0) INFOS.splice(i, 1); };
}

/** every kind a target counts as (a searchable box is an object, furniture and a container) */
export function targetKinds(t: VerbTarget): CtxKind[] {
  const k: CtxKind[] = ['any'];
  switch (t.kind) {
    case 'self': k.push('self'); break;
    case 'object': k.push('object', 'furniture'); if (t.obj.inv) k.push('container'); break;
    case 'edge': k.push('edge'); if (t.edge.kind === 'door' || t.edge.kind === 'gate') k.push('door'); if (t.edge.kind === 'window') k.push('window'); break;
    case 'item': k.push('item'); if (t.wi.item.inv) k.push('container'); break;
    case 'creature': k.push(t.c.dead ? 'corpse' : 'creature'); if (t.c.dead && t.c.inv) k.push('container'); break;
    case 'player': k.push('player'); break;
    case 'vehicle': k.push('vehicle'); break;
    case 'tile': {
      k.push('tile');
      const p = G.local;
      if (p) { try { if (wallNear(G.getZone(p.zoneKey), t.point.x, t.point.z, p, 0.6)) k.push('wall'); } catch { /* no zone */ } }
      break;
    }
  }
  return k;
}

const toOption = (a: CtxAction | MenuOption): MenuOption => {
  if ('action' in a || 'disabled' in a) return a as MenuOption;
  const c = a as CtxAction;
  return { label: c.label, action: c.run, disabled: c.enabled === false ? true : typeof c.enabled === 'string' ? c.enabled : false, sub: c.sub?.map(toOption), danger: c.danger, info: c.info } as MenuOption;
};

/** Verb[] (flat, "Fill: Water Bottle") back into rows, prefixes with two or more entries folded into a sub-strip */
function rowsFromVerbs(vs: Verb[]): MenuOption[] {
  const out: MenuOption[] = [];
  const groups = new Map<string, MenuOption>();
  const count = new Map<string, number>();
  for (const v of vs) { const i = v.label.indexOf(': '); if (i > 0) count.set(v.label.slice(0, i), (count.get(v.label.slice(0, i)) ?? 0) + 1); }
  for (const v of vs) {
    const opt: MenuOption = { label: v.label, action: v.run, disabled: v.why || false };
    const i = v.label.indexOf(': ');
    const pre = i > 0 ? v.label.slice(0, i) : '';
    if (pre && (count.get(pre) ?? 0) > 1) {
      let g = groups.get(pre);
      if (!g) { g = { label: pre, sub: [] }; groups.set(pre, g); out.push(g); }
      g.sub!.push({ ...opt, label: v.label.slice(i + 2) });
    } else out.push(opt);
  }
  return out;
}

/** the rows of the menu for a target: the verbs it always had, then whatever was registered for its kinds */
export function contextOptions(t: VerbTarget, p: Player): MenuOption[] {
  let vs: Verb[] = [];
  try { vs = verbsFor(p, t); } catch (e) { console.warn('context verbs', e); }
  // walking somewhere is the left button's job; a tile only gets it when nothing else is offered
  vs = vs.filter((v) => !(t.kind !== 'tile' && /^Walk here$/.test(v.label)));
  const out = rowsFromVerbs(vs);
  const kinds = targetKinds(t);
  for (const r of ACTS) {
    if (!kinds.includes(r.kind)) continue;
    try { for (const a of r.fn(t, p) || []) out.push(toOption(a)); } catch (e) { console.warn('context actions', r.kind, e); }
  }
  // the same label twice (an old list and a registered one): the first wins
  const seen = new Set<string>();
  return out.filter((o) => o && o.label && o.label !== '-' && (seen.has(o.label) ? false : (seen.add(o.label), true)));
}

/** what is known about a target ("Info") */
export function contextInfo(t: VerbTarget, p: Player): string[] {
  const out: string[] = [];
  try {
    switch (t.kind) {
      case 'self': {
        out.push(p.name);
        out.push(`Health ${Math.round(p.body.health)} · Breath ${Math.round(p.body.endurance * 100)}`);
        const w = p.allItems().reduce((s, it) => s + itemWeight(it), 0);
        out.push(`Carrying ${w.toFixed(1)} kg of ${p.capacity().toFixed(0)}`);
        break;
      }
      case 'object': {
        const d = objDef(t.obj.key);
        if (!d) break;
        out.push(d.name);
        if ((d as any).desc) out.push(String((d as any).desc));
        out.push(`${d.height >= 1.6 ? 'Tall' : d.height >= 0.7 ? 'Waist high' : 'Low'} · ${(d.w ?? 1) * (d.d ?? 1) > 1 ? 'large' : 'small'}${d.movable ? ' · can be moved' : ''}`);
        if (t.obj.inv) out.push(t.obj.inv.locked ? 'Locked' : t.obj.state?.searched ? `${t.obj.inv.items.length} thing${t.obj.inv.items.length === 1 ? '' : 's'} inside` : 'Not searched yet');
        if (t.obj.hp !== undefined) out.push('Damaged');
        break;
      }
      case 'edge': {
        const e = t.edge;
        out.push(verbTargetName(t));
        if (e.kind === 'door' || e.kind === 'gate') out.push(`${e.open ? 'Open' : 'Shut'}${e.locked ? ' · locked' : ''}${e.barricade ? ` · ${e.barricade} board${e.barricade > 1 ? 's' : ''} across it` : ''}`);
        if (e.kind === 'window') out.push(`${e.glass === 'broken' ? 'Glass broken' : e.glass === 'none' ? 'No glass' : e.open ? 'Open' : 'Shut'}${e.barricade ? ` · boarded (${e.barricade})` : ''}`);
        break;
      }
      case 'item': {
        const it = t.wi.item, d = itemDef(it.key);
        out.push(itemName(it));
        if (d.desc) out.push(d.desc);
        out.push(`${itemWeight(it).toFixed(1)} kg${it.cond !== undefined && d.durability ? ` · condition ${Math.round(it.cond * 100)}%` : ''}`);
        if ((d as any).heavy) out.push('Needs both arms to carry');
        break;
      }
      case 'creature': {
        const c: any = t.c;
        out.push(verbTargetName(t));
        if (c.dead) { out.push(c.butchered ? 'Dead · butchered' : 'Dead'); if (c.inv) out.push(c.inv.items.length ? 'Something on it' : 'Nothing on it'); }
        else out.push(c.sp?.desc ? String(c.sp.desc).split('. ')[0] + '.' : 'Alive.');
        break;
      }
      case 'player': out.push(t.p.name, t.p.body.dead ? 'Dead' : t.p.body.downed ? 'Down' : 'On their feet'); break;
      case 'vehicle': out.push(verbTargetName(t)); break;
      case 'tile': {
        out.push(verbTargetName(t));
        if (targetKinds(t).includes('wall')) out.push('A wall. A sledgehammer, an axe or a crowbar goes through it.');
        break;
      }
    }
  } catch (e) { console.warn('context info', e); }
  const kinds = targetKinds(t);
  for (const r of INFOS) {
    if (!kinds.includes(r.kind)) continue;
    try { out.push(...(r.fn(t, p) || [])); } catch (e) { console.warn('context info', r.kind, e); }
  }
  return out.filter(Boolean);
}

// ================================================================== the strip on screen
interface Strip { el: HTMLDivElement; rows: { el: HTMLElement; o: MenuOption }[]; sel: number; child: Strip | null; foot: HTMLElement; info: HTMLElement | null }
let open: { root: Strip; t: VerbTarget; close: () => void } | null = null;

/** is a right-click menu up (the world ignores the mouse meanwhile) */
export function contextMenuOpen(): boolean { return !!open; }
export function closeContextMenu() { open?.close(); }

/** paint the worn olive terminal plate behind a strip (high-res pixel art, square chamfered corners) */
function plate(el: HTMLElement, seed: number) {
  let cv = el.querySelector(':scope > canvas.cm-plate') as HTMLCanvasElement | null;
  if (!cv) { cv = document.createElement('canvas'); cv.className = 'cm-plate'; el.prepend(cv); }
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (w < 8 || h < 8) return;
  const k = dprK();
  cv.width = w * k; cv.height = h * k; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false; c.setTransform(k, 0, 0, k, 0, 0);
  pxPlate(c, 0, 0, w - 2, h - 2, { tone: 'olive', well: 5, wellTint: 0x0d1008, scan: true, chamfer: 7, wear: 0.8, hazard: h > 60, seed });
}

function strip(rows: MenuOption[], title: string, depth: number): Strip {
  const el = document.createElement('div');
  el.className = 'cm' + (depth ? ' cm-sub' : '');
  el.setAttribute('role', 'menu');
  if (title) { const h = document.createElement('div'); h.className = 'cm-title'; h.textContent = title; el.append(h); }
  const s: Strip = { el, rows: [], sel: -1, child: null, foot: document.createElement('div'), info: null };
  for (const o of rows) {
    const r = document.createElement('div');
    const dis = !!o.disabled || (!o.action && !o.sub?.length);
    r.className = 'cm-row' + (dis ? ' dis' : '') + (o.danger ? ' danger' : '') + (o.sub?.length ? ' more' : '');
    r.setAttribute('role', 'menuitem');
    r.textContent = o.label + (o.sub?.length ? ' ›' : '');
    el.append(r);
    s.rows.push({ el: r, o });
  }
  s.foot.className = 'cm-foot';
  el.append(s.foot);
  return s;
}

function place(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(6, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
  el.style.top = Math.max(6, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
}

/** open the menu for a target at a screen point (right click) */
export function openContextMenu(t: VerbTarget | null, x: number, y: number): boolean {
  closeContextMenu();
  const p = G.local;
  if (!t || !p || p.body.dead) return false;
  const rows = contextOptions(t, p);
  rows.push({ label: 'Info', action: () => {} });
  const name = verbTargetName(t);
  const root = strip(rows, name, 0);
  root.rows[root.rows.length - 1].el.classList.add('cm-inforow');
  const seed = (Math.floor(x) * 7 + Math.floor(y) * 13) % 97;
  document.body.append(root.el);
  place(root.el, x + 8, y + 6);
  plate(root.el, seed);
  const all = () => { const out: Strip[] = []; let s: Strip | null = root; while (s) { out.push(s); s = s.child; } return out; };
  const foot = (s: Strip, text: string) => { s.foot.textContent = text; s.foot.style.display = text ? 'block' : 'none'; plate(s.el, seed + 3); };
  const closeChild = (s: Strip) => { if (s.child) { closeChild(s.child); s.child.el.remove(); s.child = null; } };
  const hover = (s: Strip, i: number) => {
    if (s.sel === i) return;
    if (s.sel >= 0) s.rows[s.sel]?.el.classList.remove('hot');
    s.sel = i;
    const row = s.rows[i];
    if (!row) return;
    row.el.classList.add('hot');
    G.audio?.ui?.('hover', 0.35);
    const o = row.o;
    foot(s, typeof o.disabled === 'string' ? o.disabled : o.info ?? '');
    closeChild(s);
    if (o.sub?.length && !o.disabled) {
      const c = strip(o.sub, '', 1);
      document.body.append(c.el);
      const rr = row.el.getBoundingClientRect(), pr = s.el.getBoundingClientRect();
      const right = pr.right + c.el.offsetWidth + 6 < window.innerWidth;
      place(c.el, right ? pr.right - 4 : pr.left - c.el.offsetWidth + 4, rr.top - 8);
      plate(c.el, seed + 11);
      wire(c);
      s.child = c;
    }
  };
  const showInfo = () => {
    if (root.info) { root.info.remove(); root.info = null; plate(root.el, seed); return; }
    const lines = contextInfo(t, p);
    const box = document.createElement('div');
    box.className = 'cm-info';
    for (const l of lines.length ? lines : ['Nothing more to tell.']) { const d = document.createElement('div'); d.textContent = l; box.append(d); }
    root.el.insertBefore(box, root.foot);
    root.info = box;
    place(root.el, parseFloat(root.el.style.left), parseFloat(root.el.style.top));
    plate(root.el, seed);
    G.audio?.ui?.('paper', 0.4);
  };
  const run = (s: Strip, i: number) => {
    const row = s.rows[i]; if (!row) return;
    const o = row.o;
    if (s === root && i === s.rows.length - 1) { showInfo(); return; }
    if (o.sub?.length) { hover(s, i); return; }
    if (o.disabled || !o.action) { G.audio?.ui?.('error', 0.5); row.el.classList.add('nope'); setTimeout(() => row.el.classList.remove('nope'), 260); return; }
    close();
    G.audio?.ui?.('click', 0.5);
    try { o.action(); } catch (e) { console.warn('context action', o.label, e); }
  };
  function wire(s: Strip) {
    s.rows.forEach((r, i) => {
      r.el.addEventListener('mouseenter', () => hover(s, i));
      r.el.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
      r.el.addEventListener('click', (e) => { e.stopPropagation(); run(s, i); });
    });
    s.el.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    s.el.addEventListener('mouseleave', () => { G.input.pointerOverUI = !!open && all().some((q) => q.el.matches(':hover')); });
    s.el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  }
  wire(root);
  const onKey = (e: KeyboardEvent) => {
    const k = e.code;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Escape', 'Space'].includes(k)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const ss = all(); const s = ss[ss.length - 1];
    if (k === 'Escape') { if (ss.length > 1) { const par = ss[ss.length - 2]; closeChild(par); } else close(); return; }
    if (k === 'ArrowLeft') { if (ss.length > 1) closeChild(ss[ss.length - 2]); return; }
    if (k === 'ArrowRight') { if (s.sel >= 0 && s.rows[s.sel].o.sub?.length) { hover(s, s.sel); const c = s.child; if (c) hover(c, 0); } return; }
    if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') { if (s.sel >= 0) run(s, s.sel); return; }
    const n = s.rows.length; if (!n) return;
    hover(s, ((s.sel < 0 ? (k === 'ArrowUp' ? 0 : -1) : s.sel) + (k === 'ArrowUp' ? -1 : 1) + n) % n);
  };
  const onDown = (e: MouseEvent) => {
    if (all().some((s) => s.el.contains(e.target as Node))) return;
    close();
    // a left click away only puts the menu away (no swing, no walk); a right click opens the next one
    if (e.button === 0) { e.stopPropagation(); e.preventDefault(); }
  };
  const onWheel = (e: WheelEvent) => { if (all().some((s) => s.el.contains(e.target as Node))) e.stopPropagation(); };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    closeChild(root);
    root.el.classList.add('out');
    setTimeout(() => root.el.remove(), 90);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('wheel', onWheel, true);
    G.input.pointerOverUI = false;
    if (open?.root === root) open = null;
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('wheel', onWheel, true);
  // (a frame later, so the release of this very click does not close it)
  setTimeout(() => { if (!closed) window.addEventListener('mousedown', onDown, true); }, 0);
  open = { root, t, close };
  G.audio?.ui?.('menu', 0.45);
  // walking off from it (or the thing going out of reach behind a wall) puts it away
  const pos0 = { x: p.x, z: p.z };
  const watch = () => {
    if (closed) return;
    const q = G.local;
    if (!q || q.body.dead || Math.hypot(q.x - pos0.x, q.z - pos0.z) > 6) { close(); return; }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  return true;
}

/** a target within a hand's reach and not behind a wall (the menu still opens far away: its verbs walk over) */
export function inHandReach(p: Player, t: VerbTarget, reach = 1.5): boolean {
  if (t.kind === 'self') return true;
  const c = targetPos(t as any);
  return Math.hypot(c.x - p.x, c.z - p.z) <= reach && clearReach(G.getZone(p.zoneKey), p.x, p.z, c.x, c.z);
}

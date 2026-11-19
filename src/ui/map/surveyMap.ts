// THE SURVEY MAP (round 15): M puts the suit's survey plot of this level up,
// a dark plotter glass in a riveted steel frame (src/ui/pxKit.ts) on which
// what the unit has seen is drawn in amber: floor, walls, furniture, the unit
// as a cream arrow. Everything else is research bought in the lab
// (src/game/mapUpgrades.ts): the survey echo that maps a ring round the unit
// through walls as it walks (the fog lifts there in the world too), facility
// icons, inhabitant pings, pins you drop with a click, the tracked task's next
// step. The world keeps running while it is up. M or Esc puts it away.
//
// Round 21: no text on it at all. The plotter's hood carries a row of little 3D models (src/ui/iconChip.ts): the
// level (its name on hover; a press fits the plot again), then one per layer (echo, facilities, pings, pins, trace)
// that switches it on and off, a padlock on any not researched yet, a count on its corner; and a brass zoom knob.
// On the glass the facilities are small 3D models, the pins real 3D pins that drop in and bounce, the unit sends a
// sonar ring, pings pulse; a marker under the pointer grows and its name floats over it. Drag to pan (it carries on
// and settles), the wheel or the knob to zoom about the pointer, a press without a drag drops or lifts a pin.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { mapRank, MAP_ECHO_R, MAP_PING_R } from '../../game/mapUpgrades';
import { pxFrame } from '../pxKit';
import { mxFrame, panelSpec, mxKnob } from '../machine/kit';
import { mxMount, mxIcon, type MxDecor, type IconKind } from '../machine/decor';
import { mxOk } from '../machine/core';
import { rect, dprK } from '../hiPixel';
import type { Zone } from '../../world/zone';
import type { QuestRuntime } from '../../missions/questRuntime';
import { isLoading } from '../loading';
import { zoneSpec } from '../../world/worldGraph';
import { objDef } from '../../world/objects';
import { iconChip, floatName, type IconChip } from '../iconChip';
import './surveyMap.css';
import { sfx } from '../menus/sfx';

type Fac = 'exit' | 'press' | 'check' | 'gen' | 'term' | 'lock';
const FAC_RX: [Fac, RegExp][] = [['press', /hopper|press|crusher/], ['check', /checkpoint/], ['gen', /generator/], ['term', /terminal|computer|kiosk|console/], ['lock', /locked|keypad|safe\b|vault_door/]];
// 7x7 glyphs for the facility icons (without WebGL)
const GLYPH: Record<Fac, string[]> = {
  exit: ['.#####.', '.#...#.', '.#...#.', '.#..##.', '.#...#.', '.#...#.', '.#####.'],
  press: ['#######', '#.....#', '#######', '..###..', '..###..', '.#####.', '#######'],
  check: ['#......', '####...', '#######', '####...', '#......', '#......', '#......'],
  gen: ['...##..', '..##...', '.####..', '...##..', '..##...', '.##....', '.#.....'],
  term: ['#######', '#.....#', '#.#...#', '#.....#', '#######', '..###..', '.#####.'],
  lock: ['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######'],
};
const FAC_COL: Record<Fac, string> = { exit: '#7dff9e', press: '#ff9a5a', check: '#9cf0f8', gen: '#ffe066', term: '#9cf0f8', lock: '#ff8f7a' };
// the same as small 3D models
const FAC_IC: Record<Fac, IconKind> = { exit: 'door', press: 'gear', check: 'siren', gen: 'bolt', term: 'radio', lock: 'key' };
const FAC_NAME: Record<Fac, string> = { exit: 'Way out', press: 'Press', check: 'Checkpoint', gen: 'Generator', term: 'Terminal', lock: 'Locked' };

type Layer = 'echo' | 'plant' | 'ping' | 'pins' | 'trace';
const LAYERS: { k: Layer; up: string; max: number; icon: IconKind; name: string }[] = [
  { k: 'echo', up: 'map_echo', max: 3, icon: 'radio', name: 'Survey echo' },
  { k: 'plant', up: 'map_plant', max: 1, icon: 'gear', name: 'Facilities' },
  { k: 'ping', up: 'map_ping', max: 2, icon: 'jar', name: 'Inhabitants' },
  { k: 'pins', up: 'map_pins', max: 1, icon: 'pin', name: 'Pins' },
  { k: 'trace', up: 'map_trace', max: 1, icon: 'compass', name: 'Task' },
];
const store = { get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
const hidden = new Set<Layer>((store.get('map.hide') ?? '').split(',').filter(Boolean) as Layer[]);
const ZMIN = 0.6, ZMAX = 5;

/** a 3D icon drawn on the plot (cached per size) */
const icCache = new Map<string, HTMLCanvasElement | null>();
function plotIcon(k: IconKind, size: number): HTMLCanvasElement | null {
  const key = k + size;
  if (!icCache.has(key)) icCache.set(key, mxOk() ? mxIcon(k, size) : null);
  return icCache.get(key)!;
}

interface Mark { x: number; y: number; r: number; name: string; key: string }

export class SurveyMap {
  private el: HTMLDivElement;
  private plot: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private rail: HTMLDivElement;
  open = false;
  private bcn: MxDecor | null = null;
  private t = 0; private drawT = 0; private echoT = 0; private openT = 0;
  /** what was drawn last: the tile at the canvas centre, pixels per tile, the canvas size */
  private view = { cx: 0, cy: 0, s: 2, cw: 0, ch: 0 };
  // the physical view: zoom (eased to its goal about an anchor), pan in tiles off the fit centre, its fling
  private zoom = 1; private zoomT = 1; private pan = { x: 0, y: 0 }; private vel = { x: 0, y: 0 };
  private anchor: { sx: number; sy: number; tx: number; ty: number } | null = null;
  private drag: { id: number; x: number; y: number; lx: number; ly: number; lt: number; moved: boolean } | null = null;
  private fit = { cx: 0, cy: 0, s0: 4, hx: 10, hy: 8, at: -1 };
  private hover: { x: number; y: number } | null = null;
  private hot = '';
  private marks: Mark[] = [];
  private drops = new Map<string, number>();
  private chips = new Map<Layer | 'zone', IconChip>();
  private knob: ReturnType<typeof mxKnob> = null;
  private tip = floatName();
  private zoomTick = 0;

  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'map15';
    const plot = this.plot = document.createElement('div');
    plot.className = 'map15-plot';
    this.rail = document.createElement('div'); this.rail.className = 'map15-rail';
    this.cv = document.createElement('canvas'); this.cv.className = 'map15-cv';
    plot.append(this.rail, this.cv);
    el.append(plot);
    document.body.appendChild(el);
    this.buildRail();
    try {
      // round 16: the plotter is a 3D machine (src/ui/machine): a deep olive hood with its lamps and a vent,
      // the plot glass set in a dark steel lip, grab handles, a hazard foot, cables out of the bottom
      // (round 21: no nameplate, serial, sticker or placard: the hood carries the layer models instead)
      if (mxOk()) {
        plot.classList.add('mx');
        mxFrame(plot, (w, h) => {
          const s = panelSpec(w, h, { seed: 41, lamps: ['green', 'amber', 'red'], glands: 3, handles: true, knobs: 2, toggles: 3,
            win: { l: 26, t: 44, r: 26, b: 34, cut: 9, lip: 6 } });
          s.win!.back = true;
          s.stickers = []; s.placards = []; s.stencils = [];
          return s;
        }, { pad: 16, grow: { l: 12, t: 30, r: 12, b: 20 } });
        this.bcn = mxMount(plot, 'beacon', { right: 150, top: -62, z: 4 }, { col: 'red' });
        // the side works only where the screen has room beside the plotter
        if (window.innerWidth >= 1230) {
          mxMount(plot, 'gears', { left: -88, top: 70, z: 4 }, { speed: 0.6 });
          mxMount(plot, 'wrench', { right: -48, top: 40, z: 4 });
          mxMount(plot, 'buttons', { right: -96, bottom: 40, z: 4 });
        }
      } else pxFrame(plot, { tone: 'steel', well: 16, wellTint: 0x0b0906, scan: true, hazard: true, chamfer: 12, seed: 41, crest: true, vents: true, lamps: ['g', 'a', 0], welds: true, gland: true });
    } catch { /* no canvas */ }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey) {
        if (G.input?.textFocus || !G.local) return;
        if (!this.open && (G.paused || isLoading() || (G as any).pauseMenu?.el)) return;
        e.preventDefault();
        this.toggle();
      } else if (this.open && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.toggle(false); }
    }, true);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.toggle(false); });
    this.wireGlass();
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    bus.on('travelStart', () => this.toggle(false));
    // on the real clock (the plot and the echo carry on while a cinematic holds the world's time); the pause stops it
    let last = performance.now();
    G.addSystem({ name: 'surveyMap', update: () => { const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now; if (!G.paused || this.embedded) this.update(dt); } });
    (G as any).surveyMap = this;
  }

  // ---------------------------------------------------------------- the hood's models
  private buildRail() {
    const zc = iconChip('map', 'Survey', () => this.refit(), { size: 30, below: true, sound: 'tab' });
    zc.el.classList.add('map15-zone');
    this.chips.set('zone', zc);
    this.rail.append(zc.el);
    const sep = document.createElement('i'); sep.className = 'map15-sep';
    this.rail.append(sep);
    for (const L of LAYERS) {
      const c = iconChip(L.icon, L.name, () => {
        if (hidden.has(L.k)) hidden.delete(L.k); else hidden.add(L.k);
        store.set('map.hide', [...hidden].join(','));
        sfx(hidden.has(L.k) ? 'rocker' : 'relay', 0.35);
        this.syncRail(); this.drawT = 0;
      }, { size: 26, below: true, sound: 'toggle' });
      this.chips.set(L.k, c);
      this.rail.append(c.el);
    }
    // the zoom knob: turn it with the wheel, drag it up and down, or press its halves
    const kw = document.createElement('button');
    kw.type = 'button'; kw.className = 'map15-knob ic21 below'; kw.setAttribute('aria-label', 'Zoom');
    const k = this.knob = mxKnob(30);
    if (k) { kw.append(k.cv); k.set(this.knobV()); }
    const nm = document.createElement('span'); nm.className = 'ic21-n'; nm.textContent = 'Zoom';
    kw.append(nm);
    kw.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); this.zoomBy(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    let ky: number | null = null;
    kw.addEventListener('pointerdown', (e) => { ky = e.clientY; kw.setPointerCapture(e.pointerId); });
    kw.addEventListener('pointermove', (e) => { if (ky === null) return; const d = ky - e.clientY; if (Math.abs(d) >= 8) { this.zoomBy(d > 0 ? 1.15 : 0.87); ky = e.clientY; kw.dataset.dr = '1'; } });
    kw.addEventListener('pointerup', (e) => {
      if (ky !== null && !kw.dataset.dr) { const r = kw.getBoundingClientRect(); this.zoomBy(e.clientX > r.left + r.width / 2 ? 1.4 : 0.71); }
      ky = null; delete kw.dataset.dr;
    });
    kw.addEventListener('pointerenter', () => sfx('hover', 0.2));
    this.rail.append(kw);
    this.syncRail();
  }
  private knobV() { return (Math.log(this.zoomT) - Math.log(ZMIN)) / (Math.log(ZMAX) - Math.log(ZMIN)); }
  private syncRail() {
    for (const L of LAYERS) {
      const c = this.chips.get(L.k)!, rk = mapRank(L.up, L.max);
      c.lock(rk < 1);
      c.set(rk >= 1 && !hidden.has(L.k));
    }
  }
  private on(k: Layer) { const L = LAYERS.find((q) => q.k === k)!; return mapRank(L.up, L.max) >= 1 && !hidden.has(k); }

  // ---------------------------------------------------------------- the glass: drag, fling, wheel, press
  private wireGlass() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.pinAt(e, true); return; }
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), moved: false };
      this.vel.x = this.vel.y = 0;
      try { cv.setPointerCapture(e.pointerId); } catch { /* gone */ }
    });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) { d.moved = true; cv.classList.add('grab'); sfx('ratchet', 0.15); }
      if (!d.moved) return;
      const now = performance.now(), dt = Math.max(1, now - d.lt) / 1000, s = this.view.s;
      const dx = (e.clientX - d.lx) / s, dy = (e.clientY - d.ly) / s;
      this.pan.x -= dx; this.pan.y -= dy;
      this.vel.x = this.vel.x * 0.4 + (-dx / dt) * 0.6; this.vel.y = this.vel.y * 0.4 + (-dy / dt) * 0.6;
      d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
      this.anchor = null;
      this.drawT = 0;
    });
    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      cv.classList.remove('grab');
      if (!d.moved) { this.vel.x = this.vel.y = 0; this.pinAt(e, false); }
      else if (performance.now() - d.lt > 90) this.vel.x = this.vel.y = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { this.hover = null; this.tip.hide(); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(); this.zoomBy(1.8, e.clientX - r.left, e.clientY - r.top); });
  }
  private zoomBy(f: number, sx?: number, sy?: number) {
    const v = this.view;
    const z = Math.max(ZMIN, Math.min(ZMAX, this.zoomT * f));
    if (z === this.zoomT) { this.knobBump(); return; }
    sx ??= v.cw / 2; sy ??= v.ch / 2;
    this.anchor = { sx, sy, tx: v.cx + (sx - v.cw / 2) / v.s, ty: v.cy + (sy - v.ch / 2) / v.s };
    this.zoomT = z;
    this.knob?.set(this.knobV(), false);
    const now = performance.now();
    if (now - this.zoomTick > 70) { this.zoomTick = now; sfx('tick', 0.22); }
    this.drawT = 0;
  }
  private knobBump() { const now = performance.now(); if (now - this.zoomTick > 160) { this.zoomTick = now; sfx('tab', 0.2); } }
  /** fit the plot again (the level's model) */
  private refit() { this.zoomT = 1; this.anchor = null; this.vel.x = this.vel.y = 0; this.knob?.set(this.knobV(), false); this.panHome = true; }
  private panHome = false;

  /** round 17: the band desktop's Map app shows the plot in its window: the canvas moves there while it is open */
  private embedded = false;
  embed(host: HTMLElement) { if (this.open) this.toggle(false); this.embedded = true; this.rail.classList.add('emb'); host.append(this.cv, this.rail); this.openT = 1; this.drawT = 0; this.echoT = 0; this.syncRail(); }
  unembed() { if (!this.embedded) return; this.embedded = false; this.rail.classList.remove('emb'); this.plot.append(this.rail, this.cv); this.tip.hide(); }
  /** the desktop drives the embedded plot (the game's systems sleep while time is held) */
  embedTick(dt: number) { if (this.embedded) this.update(dt); }
  toggle(on = !this.open) {
    if (on === this.open) return;
    this.open = on;
    this.el.classList.toggle('on', on);
    if (G.input) G.input.pointerOverUI = on;
    sfx(on ? 'relay' : 'lever', 0.6);
    this.plot.classList.toggle('px-mech-in', on);
    if (on) {
      this.openT = 0; this.drawT = 0; this.syncRail();
      // the models come in one after another, each with a little bounce
      [...this.rail.children].forEach((c, i) => { (c as HTMLElement).style.animationDelay = (0.12 + i * 0.05) + 's'; });
      this.rail.classList.remove('in'); void this.rail.offsetWidth; this.rail.classList.add('in');
    } else this.tip.hide();
  }

  private zone(): Zone | null { const p = G.local; return p ? (G as any).getZone?.(p.zoneKey) ?? (G as any).zones?.get?.(p.zoneKey) ?? null : null; }

  private update(dt: number) {
    this.t += dt;
    // the hood's beacon turns while something hunts close by
    if (this.open && this.bcn) this.bcn.alert(((G as any).survival?.threat ?? 0) > 0.45);
    // the survey echo: map a ring round the unit, through walls
    this.echoT -= dt;
    if (this.echoT <= 0) {
      this.echoT = 0.5;
      // with the fog off nothing marks tiles explored: the suit's own survey takes what the unit walks past
      const pw = G.local, zw = this.zone();
      if (pw && zw && !(G as any).view?.vis?.enabled) {
        const cx = Math.floor(pw.x), cy = Math.floor(pw.z), RW = 7;
        for (let y = Math.max(0, cy - RW); y <= Math.min(zw.H - 1, cy + RW); y++) for (let x = Math.max(0, cx - RW); x <= Math.min(zw.W - 1, cx + RW); x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= RW * RW) zw.explored[y * zw.W + x] = 1;
      }
      const R = MAP_ECHO_R[mapRank('map_echo', 3)] || 0, p = G.local, z = this.zone();
      if (R > 0 && p && z) {
        const cx = Math.floor(p.x), cy = Math.floor(p.z);
        for (let y = Math.max(0, cy - R); y <= Math.min(z.H - 1, cy + R); y++) for (let x = Math.max(0, cx - R); x <= Math.min(z.W - 1, cx + R); x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= R * R) z.explored[y * z.W + x] = 1;
        }
      }
    }
    if (!this.open && !this.embedded) return;
    if (this.open && (!G.local || G.local.body?.dead || document.body.classList.contains('noclip-cine'))) { this.toggle(false); return; }
    this.openT += dt;
    // the physical view: the zoom eases to its goal about its anchor, a fling carries on and settles, a pan past the
    // survey springs back
    let moving = false;
    if (Math.abs(this.zoom - this.zoomT) > 0.001) { this.zoom += (this.zoomT - this.zoom) * (1 - Math.exp(-14 * dt)); moving = true; } else this.zoom = this.zoomT;
    if (!this.drag && (Math.abs(this.vel.x) + Math.abs(this.vel.y) > 0.05)) {
      this.pan.x += this.vel.x * dt; this.pan.y += this.vel.y * dt;
      const k = Math.exp(-4.5 * dt); this.vel.x *= k; this.vel.y *= k; moving = true;
    }
    if (!this.drag) {
      const f = this.fit, lx = f.hx + 4, ly = f.hy + 4, k = 1 - Math.exp(-8 * dt);
      const goalX = this.panHome ? 0 : Math.max(-lx, Math.min(lx, this.pan.x)), goalY = this.panHome ? 0 : Math.max(-ly, Math.min(ly, this.pan.y));
      if (Math.abs(goalX - this.pan.x) + Math.abs(goalY - this.pan.y) > 0.01) { this.pan.x += (goalX - this.pan.x) * k; this.pan.y += (goalY - this.pan.y) * k; moving = true; }
      else if (this.panHome) this.panHome = false;
    }
    this.drawT -= dt;
    if (moving || this.drag) this.drawT = 0;
    if (this.drawT <= 0) { this.drawT = 1 / 24; this.draw(); this.syncCounts(); }
  }

  private syncCounts() {
    const z = this.zone();
    const zc = this.chips.get('zone');
    if (z && zc) zc.name(String(zoneSpec(z.key)?.name || z.key.replace(/[_-]+/g, ' ')));
    this.chips.get('pins')?.count(this.on('pins') ? ((z?.meta.mapPins ?? []) as unknown[]).length || null : null);
    this.chips.get('ping')?.count(this.on('ping') ? this.pingN || null : null);
    this.chips.get('echo')?.count(this.on('echo') ? MAP_ECHO_R[mapRank('map_echo', 3)] || null : null);
  }
  private pingN = 0;

  private tileAt(e: { clientX: number; clientY: number }) {
    const r = this.cv.getBoundingClientRect(), v = this.view;
    return { tx: Math.floor(v.cx + ((e.clientX - r.left) - v.cw / 2) / v.s), ty: Math.floor(v.cy + ((e.clientY - r.top) - v.ch / 2) / v.s) };
  }
  private pinAt(e: PointerEvent, lift: boolean) {
    if (mapRank('map_pins', 1) < 1) { sfx('error', 0.3); this.chips.get('pins')?.ping(); return; }
    const z = this.zone(); if (!z) return;
    const { tx, ty } = this.tileAt(e);
    if (!z.inb(tx, ty)) return;
    if (hidden.has('pins')) { hidden.delete('pins'); store.set('map.hide', [...hidden].join(',')); this.syncRail(); }
    const pins: [number, number][] = (z.meta.mapPins ??= []);
    const near = pins.findIndex(([x, y]) => Math.abs(x - tx) <= 2 && Math.abs(y - ty) <= 2);
    if (near >= 0 || lift) { if (near >= 0) { pins.splice(near, 1); sfx('tink', 0.35); } }
    else if (pins.length < 8) { pins.push([tx, ty]); this.drops.set(tx + ',' + ty, this.t); G.audio?.ui?.('bag_place', 0.3); }
    else { sfx('error', 0.3); this.chips.get('pins')?.ping(); }
    this.chips.get('pins')?.ping();
    this.drawT = 0;
  }

  private draw() {
    const z = this.zone(), p = G.local;
    if (!z || !p) return;
    const k = dprK();
    const cw = Math.max(40, Math.floor(this.cv.clientWidth)), ch = Math.max(40, Math.floor(this.cv.clientHeight));
    if (this.cv.width !== cw * k || this.cv.height !== ch * k) { this.cv.width = cw * k; this.cv.height = ch * k; }
    const c = this.cv.getContext('2d')!;
    c.setTransform(k, 0, 0, k, 0, 0); c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cw, ch);
    const px = Math.floor(p.x), py = Math.floor(p.z);
    // what to frame: the explored part of the level (and the unit), with a margin (the bounds every half second)
    const f = this.fit;
    if (this.t - f.at > 0.5 || f.at < 0) {
      f.at = this.t;
      let x0 = z.W, y0 = z.H, x1 = 0, y1 = 0;
      for (let y = 0; y < z.H; y++) for (let x = 0; x < z.W; x++) if (z.explored[y * z.W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const mx0 = this.embedded ? 6 : 10, my0 = this.embedded ? 4 : 8;
      x0 = Math.min(x0, px - mx0) - 3; y0 = Math.min(y0, py - my0) - 3; x1 = Math.max(x1, px + mx0) + 3; y1 = Math.max(y1, py + my0) + 3;
      // in a desktop window a small survey is drawn bigger, so the plot is never a speck
      f.s0 = Math.max(2, Math.min(this.embedded ? 24 : 14, Math.min(cw / (x1 - x0 + 1), ch / (y1 - y0 + 1))));
      f.cx = (x0 + x1 + 1) / 2; f.cy = (y0 + y1 + 1) / 2; f.hx = (x1 - x0 + 1) / 2; f.hy = (y1 - y0 + 1) / 2;
    }
    const s = f.s0 * this.zoom;
    let cx = f.cx + this.pan.x, cy = f.cy + this.pan.y;
    // a zoom about the pointer keeps the tile under it still
    if (this.anchor) {
      const a = this.anchor;
      cx = a.tx - (a.sx - cw / 2) / s; cy = a.ty - (a.sy - ch / 2) / s;
      this.pan.x = cx - f.cx; this.pan.y = cy - f.cy;
      if (Math.abs(this.zoom - this.zoomT) < 0.001) this.anchor = null;
    }
    this.view = { cx, cy, s, cw, ch };
    const X = (tx: number) => Math.round(cw / 2 + (tx - cx) * s), Y = (ty: number) => Math.round(ch / 2 + (ty - cy) * s);
    const S = Math.max(1, Math.ceil(s));
    const vx0 = Math.max(0, Math.floor(cx - cw / 2 / s) - 1), vx1 = Math.min(z.W - 1, Math.ceil(cx + cw / 2 / s) + 1);
    const vy0 = Math.max(0, Math.floor(cy - ch / 2 / s) - 1), vy1 = Math.min(z.H - 1, Math.ceil(cy + ch / 2 / s) + 1);
    // the plotter's grid
    for (let gx = Math.ceil(vx0 / 8) * 8; gx <= vx1; gx += 8) rect(c, X(gx), 0, 1, ch, 0x3a2a10, 0.35);
    for (let gy = Math.ceil(vy0 / 8) * 8; gy <= vy1; gy += 8) rect(c, 0, Y(gy), cw, 1, 0x3a2a10, 0.35);
    // the sweep that draws it in when it opens
    const sweep = Math.min(1, this.openT / 0.45), maxY = vy0 + (vy1 - vy0 + 1) * sweep;
    const ex = z.explored;
    for (let y = vy0; y <= vy1; y++) {
      if (y > maxY) break;
      for (let x = vx0; x <= vx1; x++) {
        const i = y * z.W + x;
        if (!ex[i] || !z.floor[i]) continue;
        const sx = X(x), sy = Y(y), sw = X(x + 1) - sx, sh = Y(y + 1) - sy;
        const sol = z.solid[i];
        rect(c, sx, sy, sw, sh, sol === 1 ? 0x6a4c1c : sol ? 0x553c16 : ((x + y) & 1 ? 0x3c2c12 : 0x392a11));
        if (s >= 6 && !sol && ((x * 7 + y * 13) % 11 === 0)) rect(c, sx + (sw >> 1), sy + (sh >> 1), 1, 1, 0x5a4420);
      }
    }
    // walls on top (north and west edges), bright amber lines
    const wt = s >= 6 ? 2 : 1;
    for (let y = vy0; y <= vy1; y++) {
      if (y > maxY) break;
      for (let x = vx0; x <= vx1; x++) {
        const i = y * z.W + x;
        const seen = ex[i] || (y > 0 && ex[i - z.W]) || (x > 0 && ex[i - 1]);
        if (!seen) {
          // in a desktop window, the archive's old blueprint of the level shows faintly round the survey
          if (this.embedded) { if (z.wallN[i]) rect(c, X(x), Y(y), S, 1, 0xffcf6a, 0.13); if (z.wallW[i]) rect(c, X(x), Y(y), 1, S, 0xffcf6a, 0.13); }
          continue;
        }
        if (z.wallN[i]) rect(c, X(x) - (wt >> 1), Y(y) - (wt >> 1), S + wt, wt, 0xffcf6a);
        if (z.wallW[i]) rect(c, X(x) - (wt >> 1), Y(y) - (wt >> 1), wt, S + wt, 0xffcf6a);
      }
    }
    const marks: Mark[] = [];
    const hv = this.hover, isHot = (key: string) => this.hot === key;
    const ux = X(p.x - 0.5) + s / 2, uy = Y(p.z - 0.5) + s / 2;
    // the echo ring: a slow sweep round its edge
    const echoR = this.on('echo') ? MAP_ECHO_R[mapRank('map_echo', 3)] || 0 : 0;
    if (echoR) {
      c.strokeStyle = 'rgba(255,207,106,0.35)'; c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.arc(ux, uy, echoR * s, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      const a = this.t * 1.4;
      c.strokeStyle = 'rgba(255,224,150,0.75)'; c.lineWidth = 2;
      c.beginPath(); c.arc(ux, uy, echoR * s, a, a + 0.5); c.stroke();
    }
    const glyph = (fc: Fac, gx: number, gy: number, big: boolean) => {
      const g = GLYPH[fc], col = FAC_COL[fc], q = (s >= 8 ? 2 : 1) * (big ? 2 : 1), w = 7 * q;
      rect(c, gx - w / 2 - 1, gy - w / 2 - 1, w + 2, w + 2, 0x050404, 0.85);
      g.forEach((row, j) => { for (let i2 = 0; i2 < 7; i2++) if (row[i2] === '#') rect(c, gx - w / 2 + i2 * q, gy - w / 2 + j * q, q, q, col); });
    };
    // a 3D model standing on the plot: a dark well under it, a slow bob, bigger while the pointer is on it
    const model = (kind: IconKind, mx: number, my: number, key: string, ph: number, fb: () => void) => {
      const big = isHot(key), sz = big ? 30 : s >= 9 ? 20 : 16;
      const im = plotIcon(kind, sz);
      if (!im) { fb(); return; }
      const bob = Math.round(Math.sin(this.t * 2.2 + ph) * 1.2) - (big ? 3 : 0);
      c.fillStyle = 'rgba(5,4,4,0.6)'; c.beginPath(); c.ellipse(mx, my + sz * 0.42, sz * 0.45, sz * 0.18, 0, 0, Math.PI * 2); c.fill();
      c.drawImage(im, Math.round(mx - im.width / 2), Math.round(my - im.height / 2 + bob - 2));
    };
    // facilities
    if (this.on('plant')) {
      for (const pt of z.portals) {
        if (pt.kind === 'loop' || !ex[z.idx(pt.x, pt.y)]) continue;
        const mx = X(pt.x) + s / 2, my = Y(pt.y) + s / 2, key = 'p' + pt.x + ',' + pt.y;
        model('door', mx, my, key, pt.x, () => glyph('exit', mx, my, isHot(key)));
        marks.push({ x: mx, y: my, r: 12, name: FAC_NAME.exit, key });
      }
      for (const o of z.objects.values()) {
        if (!z.inb(o.x, o.y) || !ex[z.idx(o.x, o.y)]) continue;
        const fc = FAC_RX.find(([, rx]) => rx.test(o.key))?.[0];
        if (!fc) continue;
        const mx = X(o.x) + s / 2, my = Y(o.y) + s / 2, key = 'o' + o.x + ',' + o.y;
        model(FAC_IC[fc], mx, my, key, o.x * 0.7 + o.y, () => glyph(fc, mx, my, isHot(key)));
        marks.push({ x: mx, y: my, r: 12, name: objDef(o.key)?.name || FAC_NAME[fc], key });
      }
    }
    // the tracked task's next step: a beating diamond and a dashed line from the unit
    if (this.on('trace')) {
      const q = G.missions?.quests as QuestRuntime | undefined, kq = q?.focus?.();
      const t = kq ? q!.target(kq) : null;
      if (t && t.zone === z.key) {
        const tx = X(t.x - 0.5) + s / 2, ty = Y(t.z - 0.5) + s / 2, pulse = 5 + (Math.sin(this.t * 4) * 0.5 + 0.5) * 3 + (isHot('task') ? 4 : 0);
        c.strokeStyle = 'rgba(255,210,122,0.35)'; c.lineWidth = 1; c.setLineDash([3, 4]); c.lineDashOffset = -this.t * 12;
        c.beginPath(); c.moveTo(ux, uy); c.lineTo(tx, ty); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
        c.strokeStyle = '#ffd27a'; c.lineWidth = 2; c.beginPath(); c.moveTo(tx, ty - pulse); c.lineTo(tx + pulse, ty); c.lineTo(tx, ty + pulse); c.lineTo(tx - pulse, ty); c.closePath(); c.stroke();
        rect(c, tx - 1, ty - 1, 3, 3, 0xfff0bc);
        const v = q!.view?.(kq!), step = v?.objectives?.find((o: { done: boolean; optional?: boolean }) => !o.done && !o.optional);
        marks.push({ x: tx, y: ty, r: 12, name: String(step?.text ?? v?.title ?? 'Task').replace(/\s*\([^)]*\)/g, ''), key: 'task' });
      }
    }
    // inhabitant pings: a blinking blip, its heading, a widening ring on the dangerous ones
    const pr = this.on('ping') ? mapRank('map_ping', 2) : 0;
    this.pingN = 0;
    if (pr) {
      const R = MAP_PING_R[pr], blink = (Math.sin(this.t * 6) * 0.5 + 0.5) > 0.3;
      for (const cr of (G as any).creatures?.creatures?.values?.() ?? []) {
        if (cr.dead || cr.zoneKey !== z.key) continue;
        const d = Math.hypot(cr.x - p.x, cr.z - p.z);
        if (d > R) continue;
        this.pingN++;
        const bx = X(cr.x - 0.5) + s / 2, by = Y(cr.z - 0.5) + s / 2, danger = pr >= 2 && (cr.sp?.threat ?? 0) >= 3, key = 'c' + (cr.id ?? this.pingN), hot = isHot(key);
        const q = hot ? 2 : 1;
        if (blink || d < R * 0.4 || hot) { rect(c, bx - 2 * q, by - 2 * q, 5 * q, 5 * q, 0x2a0604); rect(c, bx - q, by - q, 3 * q, 3 * q, 0xf05a3a); rect(c, bx - q, by - q, q, q, 0xffe0d4); }
        if (pr >= 2) {
          const fc = cr.facing ?? 0; rect(c, bx + Math.cos(fc) * 5 * q, by + Math.sin(fc) * 5 * q, 2, 2, 0xff9a7a);
          if (danger) { c.strokeStyle = 'rgba(240,90,58,0.8)'; c.lineWidth = 1; c.beginPath(); c.arc(bx + 0.5, by + 0.5, 6 + (this.t * 6) % 4, 0, Math.PI * 2); c.stroke(); }
        }
        marks.push({ x: bx, y: by, r: 9, name: cr.scanned ? String(cr.sp?.name ?? cr.name ?? '???') : '???', key });
      }
    }
    // pins: real 3D pins, dropped in with a bounce
    const pins: [number, number][] = z.meta.mapPins ?? [];
    if (this.on('pins')) {
      const im = plotIcon('pin', 18), imH = plotIcon('pin', 26);
      pins.forEach(([x, y], n) => {
        const bx = X(x) + s / 2, by = Y(y) + s / 2, key = 'n' + x + ',' + y, hot = isHot(key);
        const t0 = this.drops.get(x + ',' + y), dt = t0 === undefined ? 9 : this.t - t0;
        // the drop: falls 40 px, bounces twice
        const fall = dt < 0.25 ? -40 * (1 - (dt / 0.25) ** 2) : dt < 0.6 ? -10 * Math.sin(((dt - 0.25) / 0.35) * Math.PI) : dt < 0.8 ? -3 * Math.sin(((dt - 0.6) / 0.2) * Math.PI) : 0;
        c.fillStyle = 'rgba(5,4,4,0.55)'; c.beginPath(); c.ellipse(bx, by, 5, 2, 0, 0, Math.PI * 2); c.fill();
        const img = hot ? imH : im;
        if (img) c.drawImage(img, Math.round(bx - img.width * 0.42), Math.round(by - img.height + 3 + fall));
        else { rect(c, bx - 1, by - 9 + fall, 3, 9, 0x241808); rect(c, bx, by - 8 + fall, 1, 8, 0xd4b45e); rect(c, bx - 4, by - 16 + fall, 9, 8, 0x241808); rect(c, bx - 3, by - 15 + fall, 7, 6, 0xd4b45e); }
        if (dt < 0.6) { c.strokeStyle = `rgba(255,207,106,${0.7 * (1 - dt / 0.6)})`; c.lineWidth = 1; c.beginPath(); c.arc(bx, by, 4 + dt * 30, 0, Math.PI * 2); c.stroke(); }
        marks.push({ x: bx, y: by - 8, r: 10, name: '#' + (n + 1), key });
      });
    }
    // the unit: a cream arrow, a sonar ring going out from it every so often
    const ring = (this.t % 1.8) / 1.8;
    c.strokeStyle = `rgba(255,242,204,${0.55 * (1 - ring)})`; c.lineWidth = 1.5;
    c.beginPath(); c.arc(ux, uy, 4 + ring * Math.max(18, s * 3), 0, Math.PI * 2); c.stroke();
    const fa = p.facing, L = Math.max(6, Math.min(16, s * 1.4)) * (1 + Math.sin(this.t * 5) * 0.06);
    c.fillStyle = '#050404';
    c.beginPath(); c.moveTo(ux + Math.cos(fa) * (L + 2), uy + Math.sin(fa) * (L + 2)); c.lineTo(ux + Math.cos(fa + 2.5) * (L * 0.7 + 2), uy + Math.sin(fa + 2.5) * (L * 0.7 + 2)); c.lineTo(ux + Math.cos(fa - 2.5) * (L * 0.7 + 2), uy + Math.sin(fa - 2.5) * (L * 0.7 + 2)); c.closePath(); c.fill();
    c.fillStyle = '#fff2cc';
    c.beginPath(); c.moveTo(ux + Math.cos(fa) * L, uy + Math.sin(fa) * L); c.lineTo(ux + Math.cos(fa + 2.5) * L * 0.7, uy + Math.sin(fa + 2.5) * L * 0.7); c.lineTo(ux + Math.cos(fa - 2.5) * L * 0.7, uy + Math.sin(fa - 2.5) * L * 0.7); c.closePath(); c.fill();
    marks.push({ x: ux, y: uy, r: 10, name: String(p.name ?? 'Unit'), key: 'me' });
    // what is under the pointer: it grows on the next frame, its name floats over it
    this.marks = marks;
    let best: Mark | null = null, bd = 1e9;
    if (hv && !this.drag?.moved) for (const m of marks) { const d = Math.hypot(m.x - hv.x, m.y - hv.y); if (d < m.r + 4 && d < bd) { bd = d; best = m; } }
    const was = this.hot;
    this.hot = best?.key ?? '';
    if (best && this.hot !== was) sfx('hover', 0.15);
    if (best) { const r = this.cv.getBoundingClientRect(); this.tip.show(best.name, r.left + best.x, r.top + best.y - 8); }
    else this.tip.hide();
    this.cv.style.cursor = this.drag?.moved ? 'grabbing' : best ? 'pointer' : 'crosshair';
  }
}

// THE SURVEY MAP (round 15): M puts the suit's survey plot of this level up,
// a dark plotter glass in a riveted steel frame (src/ui/pxKit.ts) on which
// what the unit has seen is drawn in amber: floor, walls, furniture, the unit
// as a cream arrow. Everything else is research bought in the lab
// (src/game/mapUpgrades.ts): the survey echo that maps a ring round the unit
// through walls as it walks (the fog lifts there in the world too), facility
// icons, inhabitant pings, pins you drop with a click, the tracked task's next
// step. The world keeps running while it is up. M or Esc puts it away.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { mapRank, MAP_ECHO_R, MAP_PING_R } from '../../game/mapUpgrades';
import { pxFrame } from '../pxKit';
import { mxFrame, panelSpec } from '../machine/kit';
import { mxMount, type MxDecor } from '../machine/decor';
import { mxOk } from '../machine/core';
import { rect, dprK } from '../hiPixel';
import type { Zone } from '../../world/zone';
import type { QuestRuntime } from '../../missions/questRuntime';
import { isLoading } from '../loading';
import { zoneSpec } from '../../world/worldGraph';
import './surveyMap.css';
import { sfx } from '../menus/sfx';

type Fac = 'exit' | 'press' | 'check' | 'gen' | 'term' | 'lock';
const FAC_RX: [Fac, RegExp][] = [['press', /hopper|press|crusher/], ['check', /checkpoint/], ['gen', /generator/], ['term', /terminal|computer|kiosk|console/], ['lock', /locked|keypad|safe\b|vault_door/]];
// 7x7 glyphs for the facility icons
const GLYPH: Record<Fac, string[]> = {
  exit: ['.#####.', '.#...#.', '.#...#.', '.#..##.', '.#...#.', '.#...#.', '.#####.'],
  press: ['#######', '#.....#', '#######', '..###..', '..###..', '.#####.', '#######'],
  check: ['#......', '####...', '#######', '####...', '#......', '#......', '#......'],
  gen: ['...##..', '..##...', '.####..', '...##..', '..##...', '.##....', '.#.....'],
  term: ['#######', '#.....#', '#.#...#', '#.....#', '#######', '..###..', '.#####.'],
  lock: ['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######'],
};
const FAC_COL: Record<Fac, string> = { exit: '#7dff9e', press: '#ff9a5a', check: '#9cf0f8', gen: '#ffe066', term: '#9cf0f8', lock: '#ff8f7a' };

export class SurveyMap {
  private el: HTMLDivElement;
  private plot: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private head: HTMLDivElement;
  private foot: HTMLDivElement;
  open = false;
  private bcn: MxDecor | null = null;
  private t = 0; private drawT = 0; private echoT = 0; private openT = 0;
  private view = { x0: 0, y0: 0, s: 2, ox: 0, oy: 0 };

  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'map15';
    const plot = this.plot = document.createElement('div');
    plot.className = 'map15-plot';
    this.head = document.createElement('div'); this.head.className = 'map15-head';
    this.cv = document.createElement('canvas'); this.cv.className = 'map15-cv';
    this.foot = document.createElement('div'); this.foot.className = 'map15-foot';
    plot.append(this.head, this.cv, this.foot);
    el.append(plot);
    document.body.appendChild(el);
    try {
      // round 16: the plotter is a 3D machine (src/ui/machine): a deep olive hood with its nameplate, lamps and a vent,
      // the plot glass set in a dark steel lip, grab handles, a hazard foot, cables out of the bottom
      if (mxOk()) {
        plot.classList.add('mx');
        mxFrame(plot, (w, h) => {
          const s = panelSpec(w, h, { title: 'SURVEY PLOTTER SP-4', serial: 'MI-SP4-0' + (41 % 9), seed: 41, lamps: ['green', 'amber', 'red'], glands: 3, handles: true, knobs: 2, toggles: 3,
            win: { l: 26, t: 44, r: 26, b: 34, cut: 9, lip: 6 } });
          s.win!.back = true;
          return s;
        }, { pad: 16, grow: { l: 12, t: 30, r: 12, b: 20 } });
        this.bcn = mxMount(plot, 'beacon', { right: 150, top: -62, z: 4 }, { col: 'red' });
        // the side works only where the screen has room beside the plotter
        if (window.innerWidth >= 1230) {
          mxMount(plot, 'gears', { left: -88, top: 70, z: 4 }, { speed: 0.6 });
          mxMount(plot, 'wrench', { right: -48, top: 40, z: 4 });
          mxMount(plot, 'buttons', { right: -96, bottom: 40, z: 4 });
        }
      } else pxFrame(plot, { tone: 'steel', well: 16, wellTint: 0x0b0906, scan: true, hazard: true, chamfer: 12, seed: 41, crest: true, serial: 'SURVEY PLOTTER SP-4', vents: true, lamps: ['g', 'a', 0], welds: true, gland: true });
    } catch { /* no canvas */ }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey) {
        if (G.input?.textFocus || !G.local) return;
        if (!this.open && (G.paused || isLoading() || (G as any).pauseMenu?.el)) return;
        e.preventDefault();
        this.toggle();
      } else if (this.open && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.toggle(false); }
    }, true);
    el.addEventListener('pointerdown', (e) => {
      if (e.target === el) { this.toggle(false); return; }
      if (e.target === this.cv) this.pin(e);
    });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    bus.on('travelStart', () => this.toggle(false));
    // on the real clock (the plot and the echo carry on while a cinematic holds the world's time); the pause stops it
    let last = performance.now();
    G.addSystem({ name: 'surveyMap', update: () => { const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now; if (!G.paused) this.update(dt); } });
    (G as any).surveyMap = this;
  }

  toggle(on = !this.open) {
    if (on === this.open) return;
    this.open = on;
    this.el.classList.toggle('on', on);
    if (G.input) G.input.pointerOverUI = on;
    sfx(on ? 'relay' : 'lever', 0.6);
    this.plot.classList.toggle('px-mech-in', on);
    if (on) { this.openT = 0; this.drawT = 0; }
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
      const R = MAP_ECHO_R[mapRank('map_echo', 3)] || 0, p = G.local, z = this.zone();
      if (R > 0 && p && z) {
        const cx = Math.floor(p.x), cy = Math.floor(p.z);
        for (let y = Math.max(0, cy - R); y <= Math.min(z.H - 1, cy + R); y++) for (let x = Math.max(0, cx - R); x <= Math.min(z.W - 1, cx + R); x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= R * R) z.explored[y * z.W + x] = 1;
        }
      }
    }
    if (!this.open) return;
    if (!G.local || G.local.body?.dead || document.body.classList.contains('noclip-cine')) { this.toggle(false); return; }
    this.openT += dt;
    this.drawT -= dt;
    if (this.drawT <= 0) { this.drawT = 1 / 8; this.draw(); }
  }

  private pin(e: PointerEvent) {
    if (mapRank('map_pins', 1) < 1) return;
    const z = this.zone(); if (!z) return;
    const r = this.cv.getBoundingClientRect(), v = this.view;
    const tx = Math.floor(((e.clientX - r.left) - v.ox) / v.s + v.x0), ty = Math.floor(((e.clientY - r.top) - v.oy) / v.s + v.y0);
    if (!z.inb(tx, ty)) return;
    const pins: [number, number][] = (z.meta.mapPins ??= []);
    const near = pins.findIndex(([x, y]) => Math.abs(x - tx) <= 2 && Math.abs(y - ty) <= 2);
    if (near >= 0 || e.button === 2) { if (near >= 0) pins.splice(near, 1); }
    else if (pins.length < 8) pins.push([tx, ty]);
    G.audio?.ui?.('bag_place', 0.3);
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
    // what to frame: the explored part of the level (and the unit), with a margin
    let x0 = z.W, y0 = z.H, x1 = 0, y1 = 0;
    for (let y = 0; y < z.H; y++) for (let x = 0; x < z.W; x++) if (z.explored[y * z.W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const px = Math.floor(p.x), py = Math.floor(p.z);
    x0 = Math.min(x0, px - 10); y0 = Math.min(y0, py - 8); x1 = Math.max(x1, px + 10); y1 = Math.max(y1, py + 8);
    x0 -= 3; y0 -= 3; x1 += 3; y1 += 3;
    const s = Math.max(2, Math.min(14, Math.floor(Math.min(cw / (x1 - x0 + 1), ch / (y1 - y0 + 1)))));
    const ox = Math.floor((cw - (x1 - x0 + 1) * s) / 2), oy = Math.floor((ch - (y1 - y0 + 1) * s) / 2);
    this.view = { x0, y0, s, ox, oy };
    const X = (tx: number) => ox + (tx - x0) * s, Y = (ty: number) => oy + (ty - y0) * s;
    // the plotter's grid
    for (let gx = Math.ceil(x0 / 8) * 8; gx <= x1; gx += 8) rect(c, X(gx), 0, 1, ch, 0x3a2a10, 0.35);
    for (let gy = Math.ceil(y0 / 8) * 8; gy <= y1; gy += 8) rect(c, 0, Y(gy), cw, 1, 0x3a2a10, 0.35);
    // the sweep that draws it in when it opens
    const sweep = Math.min(1, this.openT / 0.45), maxY = y0 + (y1 - y0 + 1) * sweep;
    const ex = z.explored;
    for (let y = Math.max(0, y0); y <= Math.min(z.H - 1, y1); y++) {
      if (y > maxY) break;
      for (let x = Math.max(0, x0); x <= Math.min(z.W - 1, x1); x++) {
        const i = y * z.W + x;
        if (!ex[i] || !z.floor[i]) continue;
        const sx = X(x), sy = Y(y);
        const sol = z.solid[i];
        rect(c, sx, sy, s, s, sol === 1 ? 0x6a4c1c : sol ? 0x553c16 : ((x + y) & 1 ? 0x3c2c12 : 0x392a11));
        if (s >= 6 && !sol && ((x * 7 + y * 13) % 11 === 0)) rect(c, sx + (s >> 1), sy + (s >> 1), 1, 1, 0x5a4420);
      }
    }
    // walls on top (north and west edges), bright amber lines
    const wt = s >= 6 ? 2 : 1;
    for (let y = Math.max(0, y0); y <= Math.min(z.H - 1, y1); y++) {
      if (y > maxY) break;
      for (let x = Math.max(0, x0); x <= Math.min(z.W - 1, x1); x++) {
        const i = y * z.W + x;
        const seen = ex[i] || (y > 0 && ex[i - z.W]) || (x > 0 && ex[i - 1]);
        if (!seen) continue;
        if (z.wallN[i]) rect(c, X(x) - (wt >> 1), Y(y) - (wt >> 1), s + wt, wt, 0xffcf6a);
        if (z.wallW[i]) rect(c, X(x) - (wt >> 1), Y(y) - (wt >> 1), wt, s + wt, 0xffcf6a);
      }
    }
    const legend: string[] = [];
    // the echo ring
    const echoR = MAP_ECHO_R[mapRank('map_echo', 3)] || 0;
    if (echoR) {
      c.strokeStyle = 'rgba(255,207,106,0.35)'; c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.arc(X(p.x - 0.5) + s / 2, Y(p.z - 0.5) + s / 2, echoR * s, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      legend.push(`echo ${echoR}`);
    }
    const glyph = (f: Fac, cx: number, cy: number) => {
      const g = GLYPH[f], col = FAC_COL[f], q = s >= 8 ? 2 : 1, w = 7 * q;
      rect(c, cx - w / 2 - 1, cy - w / 2 - 1, w + 2, w + 2, 0x050404, 0.85);
      g.forEach((row, j) => { for (let i2 = 0; i2 < 7; i2++) if (row[i2] === '#') rect(c, cx - w / 2 + i2 * q, cy - w / 2 + j * q, q, q, col); });
    };
    // facilities
    if (mapRank('map_plant', 1)) {
      legend.push('facilities');
      for (const pt of z.portals) {
        if (pt.kind === 'loop' || !ex[z.idx(pt.x, pt.y)]) continue;
        glyph('exit', X(pt.x) + s / 2, Y(pt.y) + s / 2);
      }
      for (const o of z.objects.values()) {
        if (!z.inb(o.x, o.y) || !ex[z.idx(o.x, o.y)]) continue;
        const f = FAC_RX.find(([, rx]) => rx.test(o.key))?.[0];
        if (f) glyph(f, X(o.x) + s / 2, Y(o.y) + s / 2);
      }
    }
    // pins
    const pins: [number, number][] = z.meta.mapPins ?? [];
    if (mapRank('map_pins', 1)) {
      legend.push(`pins ${pins.length}/8 · click`);
      pins.forEach(([x, y], n) => {
        const cx = X(x) + s / 2, cy = Y(y) + s / 2;
        rect(c, cx - 1, cy - 9, 3, 9, 0x241808); rect(c, cx, cy - 8, 1, 8, 0xd4b45e);
        rect(c, cx - 4, cy - 16, 9, 8, 0x241808); rect(c, cx - 3, cy - 15, 7, 6, 0xd4b45e); rect(c, cx - 3, cy - 15, 7, 1, 0xfaecc0);
        c.fillStyle = '#241808'; c.font = '8px monospace'; c.textAlign = 'center'; c.fillText(String(n + 1), cx + 0.5, cy - 9);
      });
    }
    // the tracked task's next step
    if (mapRank('map_trace', 1)) {
      const q = G.missions?.quests as QuestRuntime | undefined, kq = q?.focus?.();
      const t = kq ? q!.target(kq) : null;
      if (t && t.zone === z.key) {
        const cx = X(t.x - 0.5) + s / 2, cy = Y(t.z - 0.5) + s / 2, pulse = 5 + Math.round((Math.sin(this.t * 4) * 0.5 + 0.5) * 3);
        c.strokeStyle = '#ffd27a'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy - pulse); c.lineTo(cx + pulse, cy); c.lineTo(cx, cy + pulse); c.lineTo(cx - pulse, cy); c.closePath(); c.stroke();
        rect(c, cx - 1, cy - 1, 3, 3, 0xfff0bc);
        legend.push('task');
      }
    }
    // inhabitant pings
    const pr = mapRank('map_ping', 2);
    if (pr) {
      const R = MAP_PING_R[pr], blink = (Math.sin(this.t * 6) * 0.5 + 0.5) > 0.3;
      let n = 0;
      for (const cr of (G as any).creatures?.creatures?.values?.() ?? []) {
        if (cr.dead || cr.zoneKey !== z.key) continue;
        const d = Math.hypot(cr.x - p.x, cr.z - p.z);
        if (d > R) continue;
        n++;
        const cx = X(cr.x - 0.5) + s / 2, cy = Y(cr.z - 0.5) + s / 2, danger = pr >= 2 && (cr.sp?.threat ?? 0) >= 3;
        if (blink || d < R * 0.4) { rect(c, cx - 2, cy - 2, 5, 5, 0x2a0604); rect(c, cx - 1, cy - 1, 3, 3, 0xf05a3a); rect(c, cx - 1, cy - 1, 1, 1, 0xffe0d4); }
        if (pr >= 2) {
          const f = cr.facing ?? 0; rect(c, cx + Math.cos(f) * 5, cy + Math.sin(f) * 5, 2, 2, 0xff9a7a);
          if (danger) { c.strokeStyle = 'rgba(240,90,58,0.8)'; c.lineWidth = 1; c.beginPath(); c.arc(cx + 0.5, cy + 0.5, 6 + (this.t * 6) % 4, 0, Math.PI * 2); c.stroke(); }
        }
      }
      legend.push(`pings ${n}`);
    }
    // the unit: a cream arrow
    const ux = X(p.x - 0.5) + s / 2, uy = Y(p.z - 0.5) + s / 2, f = p.facing, L = Math.max(6, s * 1.4);
    c.fillStyle = '#050404';
    c.beginPath(); c.moveTo(ux + Math.cos(f) * (L + 2), uy + Math.sin(f) * (L + 2)); c.lineTo(ux + Math.cos(f + 2.5) * (L * 0.7 + 2), uy + Math.sin(f + 2.5) * (L * 0.7 + 2)); c.lineTo(ux + Math.cos(f - 2.5) * (L * 0.7 + 2), uy + Math.sin(f - 2.5) * (L * 0.7 + 2)); c.closePath(); c.fill();
    c.fillStyle = '#fff2cc';
    c.beginPath(); c.moveTo(ux + Math.cos(f) * L, uy + Math.sin(f) * L); c.lineTo(ux + Math.cos(f + 2.5) * L * 0.7, uy + Math.sin(f + 2.5) * L * 0.7); c.lineTo(ux + Math.cos(f - 2.5) * L * 0.7, uy + Math.sin(f - 2.5) * L * 0.7); c.closePath(); c.fill();
    // the header and foot
    const zn = zoneSpec(z.key)?.name || z.key.replace(/[_-]+/g, ' ');
    const htm = `<b>${String(zn).replace(/</g, '')}</b><small class="px-stencil">suit survey · M</small>`;
    if (this.head.innerHTML !== htm) this.head.innerHTML = htm;
    const ft = legend.length ? legend.join(' · ') : 'research the survey map in the lab: echo · facilities · pings · pins · trace';
    if (this.foot.textContent !== ft) this.foot.textContent = ft;
  }
}

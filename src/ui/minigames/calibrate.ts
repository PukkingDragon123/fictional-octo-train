// CALIBRATION (round 15): the machines' timing mini-game, in the house style
// of the research bench and the link repair (the hi-res gauge plates of
// src/ui/hiPixel.ts drawGauge). A riveted steel panel with one gauge per dial;
// each needle sweeps across its glass and the operator stops it (Space, E,
// Enter or a click/tap) inside the green band. A hit locks the dial (its lamp
// goes green) and the next one starts, faster; a miss flashes red and costs the
// dial. Esc walks away. Used for the press (the terminal's calibration before
// a creation run), generators and locks; anything can call it:
//
//   const r = await calibrate({ title: 'Press calibration', dials: 3, difficulty: 2 });
//   r.cancelled | r.hits / r.of | r.score (0..1: hits weighted by how central) | r.perfect
//
// host: an element to sit in (e.g. a terminal page); else it opens over the screen.
import { gaugeIn, crispCanvas, GRN, RED, AMB } from '../hiPixel';
import { pxFrame, pxLamp } from '../pxKit';
import { FocusNav } from '../menus/nav';
import { sfx } from '../menus/sfx';
import './minigames.css';

export interface CalibrateOpts { title?: string; sub?: string; dials?: number; difficulty?: number; host?: HTMLElement | null }
export interface CalibrateResult { cancelled: boolean; hits: number; of: number; score: number; perfect: boolean }

let open = false;
export function calibrating() { return open; }

export function calibrate(o: CalibrateOpts = {}): Promise<CalibrateResult> {
  const N = Math.max(1, Math.min(5, o.dials ?? 3)), diff = Math.max(1, Math.min(4, o.difficulty ?? 2));
  return new Promise((resolve) => {
    open = true;
    const overlay = o.host ? null : document.createElement('div');
    if (overlay) overlay.className = 'mg-cal-veil';
    const panel = document.createElement('div');
    panel.className = 'mg-cal px-mech-in' + (o.host ? ' in-host' : '');
    const head = document.createElement('div'); head.className = 'mg-cal-head';
    head.innerHTML = `<b>${esc(o.title ?? 'Calibration')}</b><small>${esc(o.sub ?? 'stop each needle in the green · Space / E / click')}</small>`;
    const lamps = crispCanvas(N * 16 + 4, 14); lamps.cv.className = 'mg-cal-lamps';
    head.append(lamps.cv);
    panel.append(head);
    const rows: { el: HTMLDivElement; zone: [number, number]; x: number; v: number; state: 'wait' | 'run' | 'hit' | 'miss'; flash: number; q: number }[] = [];
    for (let i = 0; i < N; i++) {
      const el = document.createElement('div'); el.className = 'mg-cal-g';
      panel.append(el);
      const w = Math.max(0.07, 0.17 - diff * 0.025 - i * 0.012), c = 0.18 + Math.random() * (0.64 - w);
      rows.push({ el, zone: [c, c + w], x: Math.random() * 0.2, v: 0.55 + diff * 0.22 + i * 0.16, state: i === 0 ? 'run' : 'wait', flash: 0, q: 0 });
    }
    const foot = document.createElement('div'); foot.className = 'mg-cal-foot'; foot.textContent = 'Esc to walk away';
    panel.append(foot);
    if (overlay) { overlay.append(panel); document.body.append(overlay); } else o.host!.append(panel);
    let frame: { dispose: () => void } | null = null;
    try { frame = pxFrame(panel, { tone: 'steel', well: 14, wellTint: 0x0e0d0b, chamfer: 10, hazard: true, seed: 77, crest: true, serial: 'CAL RIG C-7', lamps: ['a', 0], welds: true }); } catch { /* no canvas */ }
    let cur = 0, raf = 0, last = 0, done = false;
    // on top of any menu's focus stack: Esc walks away from this, not from the menu under it
    const nav = new FocusNav(panel, { onBack: () => finish(true) });
    const drawLamps = () => {
      const c = lamps.c; c.clearRect(0, 0, N * 16 + 4, 14);
      rows.forEach((r, i) => pxLamp(c, 8 + i * 16, 7, r.state === 'hit' || r.state === 'miss' || i === cur, r.state === 'miss' ? RED : r.state === 'hit' ? GRN : AMB, 4));
    };
    const finish = (cancelled: boolean) => {
      if (done) return;
      done = true; open = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      nav.destroy();
      const hits = rows.filter((r) => r.state === 'hit').length;
      const score = rows.reduce((s, r) => s + (r.state === 'hit' ? 0.6 + 0.4 * r.q : 0), 0) / N;
      setTimeout(() => { frame?.dispose(); (overlay ?? panel).remove(); }, cancelled ? 0 : 520);
      (overlay ?? panel).classList.add('out');
      resolve({ cancelled, hits, of: N, score: cancelled ? 0 : score, perfect: !cancelled && hits === N && score > 0.85 });
    };
    const stop = () => {
      const r = rows[cur]; if (!r || r.state !== 'run') return;
      const inZ = r.x >= r.zone[0] && r.x <= r.zone[1];
      r.state = inZ ? 'hit' : 'miss'; r.flash = 0.35;
      sfx(inZ ? 'lever' : 'error', inZ ? 0.7 : 0.45);
      r.q = inZ ? 1 - Math.abs(r.x - (r.zone[0] + r.zone[1]) / 2) / ((r.zone[1] - r.zone[0]) / 2) : 0;
      cur++;
      if (cur < N) rows[cur].state = 'run';
      else setTimeout(() => finish(false), 420);
      drawLamps();
    };
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) stop(); }
    };
    window.addEventListener('keydown', onKey, true);
    panel.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); stop(); });
    overlay?.addEventListener('pointerdown', (e) => { if (e.target === overlay) finish(true); });
    const tick = (now: number) => {
      if (done) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      rows.forEach((r) => {
        if (r.state === 'run') { r.x += r.v * dt; if (r.x > 1) { r.x = 2 - r.x; r.v = -Math.abs(r.v); } if (r.x < 0) { r.x = -r.x; r.v = Math.abs(r.v); } }
        r.flash = Math.max(0, r.flash - dt);
        gaugeIn(r.el, 42, { zones: [r.zone], x: r.x, flash: r.flash > 0 ? (r.state === 'hit' ? 'hit' : 'miss') : '', t: now / 1000, fill: r.state === 'hit' ? 1 : undefined });
      });
    };
    drawLamps();
    raf = requestAnimationFrame(tick);
  });
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

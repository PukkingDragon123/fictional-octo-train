// THE GUIDED TOUR (round 18): the lab menus explained, once on the first visit and again from the Guide key.
// The camera visits each station in turn (the monitors, the codex archive, the research lattice, the sample fridge,
// the talent bench, the commissary and jukebox keys, unit room 4 and its New unit key); Dr. Calder says what it is
// for in one subtitle line, and square amber brackets close on the thing. A click or Space moves on, Esc skips.
// It ends on a compact card: the loop in five pictures (go in, loot, the press for Credits, pay the debt, research).
// No text walls, no stamps. The title room (title.ts) provides the moves; this only runs them.
import { SubLine } from './subline';
import { sfx } from '../sfx';
import { pixIconEl, type PixKind } from '../deco/pixIcons';

export type TourRoom = 'monitor' | 'archive' | 'research' | 'subject';
export interface TourHost {
  /** go to a room (resolves when the picture is up) */
  go(room: TourRoom): Promise<void>;
  /** aim the room's camera at a station (research room poses) */
  aim(room: TourRoom, pose: string): void;
  /** where a station is on screen (a hotspot's middle and a half size), or null */
  spot(room: TourRoom, hot: string): { x: number; y: number; r: number } | null;
  /** the room is ready for the tour (no panel, no creator, not moving) */
  ready(): boolean;
}
interface Stop { room: TourRoom; hot?: string; pose?: string; el?: string; line: string }

const STOPS: Stop[] = [
  { room: 'monitor', line: 'This booth watches three rooms. Click a monitor, or press 1, 2 or 3.' },
  { room: 'archive', hot: 'term', line: 'The codex archive. Every inhabitant you scan and every sample you bank is filed here.' },
  { room: 'research', hot: 'codex', pose: 'codex', line: 'The research lattice: your skill tree. Research points buy new kit, recipes and press patterns.' },
  { room: 'research', hot: 'fridge', pose: 'fridge', line: 'The sample fridge. Process what you bring back: that is where research points come from.' },
  { room: 'research', hot: 'tb:bench', pose: 'room', line: 'The talent bench. Weigh gifts against flaws for the next unit.' },
  { room: 'research', el: '.dk-icon[aria-label^="Commissary"], .dk-icon[aria-label^="Emote"]', line: 'Up here: the commissary and the jukebox. Your dollars buy things for this room and emotes.' },
  { room: 'subject', line: 'Unit room 4. Shape the next unit, then New unit sends them through the link.' },
];
const LOOP: [PixKind, string][] = [['plug', 'Go in'], ['crate', 'Loot'], ['press', 'Press'], ['coin', 'Pay the debt'], ['tree', 'Research']];
const KEY = 'noclip.tour.v1';

/** seen already (or switched off for scripted runs and shots: ?notour) */
export function tourSeen(): boolean { if (/[?&]notour\b/.test(location.search)) return true; try { return localStorage.getItem(KEY) === '1'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } }

let running = false;
export function tourRunning() { return running; }

export async function runTour(h: TourHost): Promise<void> {
  if (running) return;
  running = true;
  markSeen();
  const layer = document.createElement('div');
  layer.className = 'tour';
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  ring.innerHTML = '<i></i><i></i><i></i><i></i>';
  const dots = document.createElement('div');
  dots.className = 'tour-dots';
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'tour-skip'; skip.textContent = 'Skip ›';
  layer.append(ring, dots, skip);
  document.body.append(layer);
  const sub = new SubLine(layer);
  let quit = false, next = false;
  let endCard: (() => void) | null = null;
  const stop = () => { quit = true; next = true; };
  skip.addEventListener('click', (e) => { e.stopPropagation(); sfx('back', 0.5); stop(); });
  const onKey = (e: KeyboardEvent) => {
    if (endCard && ['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); endCard(); return; }
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stop(); }
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); if (sub.talking) sub.skip(); else next = true; }
  };
  const onDown = (e: PointerEvent) => { if (e.target === skip) return; e.preventDefault(); e.stopPropagation(); if (sub.talking) sub.skip(); else next = true; };
  window.addEventListener('keydown', onKey, true);
  layer.addEventListener('pointerdown', onDown);
  // the subtitle ticks and the brackets follow their thing on the clock
  let cur: Stop | null = null, last = performance.now(), raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    sub.update(Math.min(0.1, (now - last) / 1000)); last = now;
    let at: { x: number; y: number; r: number } | null = null;
    if (cur?.el) { const e = document.querySelector(cur.el) as HTMLElement | null; const b = e?.getBoundingClientRect(); if (b && b.width) at = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.max(b.width, b.height) / 2 + 8 }; }
    else if (cur?.hot) at = h.spot(cur.room, cur.hot);
    ring.classList.toggle('on', !!at);
    if (at) { const s = Math.round(Math.max(28, Math.min(220, at.r * 2))); Object.assign(ring.style, { left: Math.round(at.x - s / 2) + 'px', top: Math.round(at.y - s / 2) + 'px', width: s + 'px', height: s + 'px' }); }
  };
  raf = requestAnimationFrame(tick);
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < STOPS.length && !quit; i++) {
      const s = STOPS[i];
      dots.innerHTML = STOPS.map((_, k) => `<b class="${k === i ? 'on' : k < i ? 'past' : ''}"></b>`).join('');
      cur = null;
      for (let k = 0; k < 40 && !h.ready() && !quit; k++) await wait(150);
      if (quit) break;
      await h.go(s.room);
      if (s.pose) h.aim(s.room, s.pose);
      // let the channel change and the camera's flight finish before she speaks
      await wait(s.pose ? 1400 : 700);
      cur = s;
      sfx('tick', 0.5);
      sub.say(s.line, { dur: 60 });
      next = false;
      const t0 = performance.now();
      // on until a click (or long enough to have read it twice)
      while (!next && !quit && performance.now() - t0 < 9000 + s.line.length * 40) await wait(80);
    }
    cur = null;
    if (!quit) await loopCard(layer, (f) => { endCard = f; });
  } finally {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    sub.dispose();
    layer.remove();
    running = false;
    h.aim('research', 'room');
  }
}

/** the loop in five pictures, then out */
function loopCard(layer: HTMLElement, onEnd: (f: () => void) => void): Promise<void> {
  return new Promise((done) => {
    const card = document.createElement('div');
    card.className = 'tour-card';
    const row = document.createElement('div');
    row.className = 'tour-loop';
    LOOP.forEach(([k, w], i) => {
      const step = document.createElement('div');
      step.className = 'tour-step';
      step.style.animationDelay = i * 0.12 + 's';
      step.append(pixIconEl(k, 2), Object.assign(document.createElement('b'), { textContent: w }));
      row.append(step);
      if (i < LOOP.length - 1) row.append(Object.assign(document.createElement('i'), { className: 'tour-arrow', textContent: '›' }));
    });
    const ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'tour-ok'; ok.textContent = 'Got it';
    card.append(row, ok);
    layer.append(card);
    sfx('open', 0.6);
    let ended = false;
    const end = () => { if (ended) return; ended = true; card.remove(); sfx('confirm', 0.5); done(); };
    onEnd(end);
    ok.addEventListener('click', (e) => { e.stopPropagation(); end(); });
    ok.focus();
  });
}

// THE GUIDED TOUR (round 18): the lab menus explained, once on the first visit and again from Dr. Calder herself
// (click her) or Settings. The camera visits each station in turn and the station does its thing while she says
// what it is for in one short subtitle line: the archive, the research lattice (a branch swings onto the rig), the
// sample fridge (its door opens), the talent bench (the balance tips), the commissary and the jukebox up in the
// corner, unit room 4. Brass pixel corner pieces close on the thing, a glint running round them; little lamps
// count the stops; a pixel key cap skips. It ends on the loop as a pixel diagram (go in, loot, the press, pay the
// debt, research), joined by brass arrows, and a key cap to close it. No plain boxes, no text walls, no stamps.
// The title room (title.ts) provides the moves; this only runs them.
import { SubLine } from './subline';
import { sfx } from '../sfx';
import { pixIconEl, type PixKind } from '../deco/pixIcons';
import { cornerSheet, CORNER, CORNER_F, capEl, pipSheet, arrowSheet } from './tourArt';

export type TourRoom = 'monitor' | 'archive' | 'research' | 'subject';
export interface TourHost {
  /** go to a room (resolves when the picture is up) */
  go(room: TourRoom): Promise<void>;
  /** aim the room's camera at a station (research room poses) */
  aim(room: TourRoom, pose: string): void;
  /** where a station is on screen (a hotspot's middle and a half size), or null */
  spot(room: TourRoom, hot: string): { x: number; y: number; r: number } | null;
  /** make a station do its thing (the lattice swings a branch on, the fridge opens, the balance tips) */
  act(room: TourRoom, what: string): void;
  /** the room is ready for the tour (no panel, no creator, not moving) */
  ready(): boolean;
}
interface Stop { room: TourRoom; hot?: string; pose?: string; el?: string; act?: string; line: string }

const STOPS: Stop[] = [
  { room: 'monitor', line: 'Three rooms on these monitors. Click one, or press 1, 2, 3.' },
  { room: 'archive', hot: 'table', line: 'The codex. Everything you scan or sample is filed here.' },
  { room: 'research', hot: 'codex', pose: 'codex', act: 'lattice', line: 'The research lattice: spend research points on new kit.' },
  { room: 'research', hot: 'fridge', pose: 'fridge', act: 'fridge', line: 'Samples you bring back. Process them for research points.' },
  { room: 'research', hot: 'tb:bench', pose: 'talent', act: 'bench', line: 'The talent bench: gifts against flaws for the next unit.' },
  { room: 'research', pose: 'room', el: '.dk-icon[aria-label^="Commissary"], .dk-icon[aria-label^="Emote"]', line: 'Up there: spend your dollars on this room and emotes.' },
  { room: 'subject', line: 'Shape the next unit here. New unit sends them in.' },
];
const LOOP: [PixKind, string][] = [['plug', 'Go in'], ['crate', 'Loot'], ['press', 'Press'], ['coin', 'Pay the debt'], ['tree', 'Research']];
const KEY = 'noclip.tour.v1';

/** seen already (or switched off for scripted runs and shots: ?notour) */
export function tourSeen(): boolean { if (/[?&]notour\b/.test(location.search)) return true; try { return localStorage.getItem(KEY) === '1'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } }

// Settings reaches the lab guide through these (the lab hub registers them): mute her, replay the tour
let hooks: { tour: (() => void) | null; mute: (v: boolean) => void; muted: () => boolean } | null = null;
export function guideHooks(h: typeof hooks) { hooks = h; }
export function replayLabTour(): boolean { if (!hooks?.tour) return false; hooks.tour(); return true; }
export function setGuideMuted(v: boolean) { hooks?.mute(v); }
export function guideMuted(): boolean { return hooks?.muted() ?? false; }
export function labGuideHere(): boolean { return !!hooks; }

let running = false;
export function tourRunning() { return running; }

/** the brass corner pieces (one sprite, mirrored for the other three corners), glinting */
function bracket(): HTMLElement {
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  const S = 2, u = cornerSheet();
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('i');
    Object.assign(c.style, { width: CORNER * S + 'px', height: CORNER * S + 'px', backgroundImage: `url(${u})`, backgroundSize: `${CORNER * S}px ${CORNER * S * CORNER_F}px` });
    c.style.setProperty('--cs', CORNER * S + 'px');
    c.style.setProperty('--cf', String(CORNER_F));
    ring.append(c);
  }
  return ring;
}

export async function runTour(h: TourHost): Promise<void> {
  if (running) return;
  running = true;
  markSeen();
  // (the lab guide's own lines are hidden while she tours: body.touring, deco.css)
  const layer = document.createElement('div');
  layer.className = 'tour';
  const ring = bracket();
  const dots = document.createElement('div');
  dots.className = 'tour-dots';
  const pipU = pipSheet();
  const pips = STOPS.map(() => { const p = document.createElement('i'); Object.assign(p.style, { backgroundImage: `url(${pipU})` }); dots.append(p); return p; });
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'tour-skip'; skip.setAttribute('aria-label', 'Skip the tour (Esc)');
  skip.append(capEl('skip', 3));
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
  const onDown = (e: PointerEvent) => { if ((e.target as HTMLElement).closest?.('.tour-skip, .tour-ok')) return; e.preventDefault(); e.stopPropagation(); if (sub.talking) sub.skip(); else next = true; };
  window.addEventListener('keydown', onKey, true);
  layer.addEventListener('pointerdown', onDown);
  // the subtitle ticks and the brackets follow their thing on the clock
  let cur: Stop | null = null, last = performance.now(), raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    sub.update(Math.min(0.1, (now - last) / 1000)); last = now;
    let at: { x: number; y: number; r: number } | null = null;
    if (cur?.el) { const e = document.querySelector(cur.el) as HTMLElement | null; const b = e?.getBoundingClientRect(); if (b && b.width) at = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.max(b.width, b.height) / 2 + 6 }; }
    else if (cur?.hot) at = h.spot(cur.room, cur.hot);
    ring.classList.toggle('on', !!at);
    if (at) { const s = Math.round(Math.max(56, Math.min(240, at.r * 2)) / 2) * 2; Object.assign(ring.style, { left: Math.round(at.x - s / 2) + 'px', top: Math.round(at.y - s / 2) + 'px', width: s + 'px', height: s + 'px' }); }
  };
  raf = requestAnimationFrame(tick);
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  try {
    for (let i = 0; i < STOPS.length && !quit; i++) {
      const s = STOPS[i];
      pips.forEach((p, k) => { p.className = k === i ? 'on' : k < i ? 'past' : ''; });
      cur = null;
      sub.clear();
      for (let k = 0; k < 400 && !h.ready() && !quit; k++) await wait(150);
      if (quit) break;
      await h.go(s.room);
      if (s.pose) h.aim(s.room, s.pose);
      // let the channel change and the camera's flight finish, then the station moves and she speaks
      await wait(s.pose ? 1400 : 700);
      cur = s;
      if (s.act) { try { h.act(s.room, s.act); } catch (e) { console.warn('tour act', e); } }
      sfx('tick', 0.5);
      sub.say(s.line, { dur: 60 });
      next = false;
      const t0 = performance.now();
      // on until a click (or long enough to have read it twice)
      // (?tourmanual: only a click moves on, for scripted shots on a slow machine)
      const hold = /[?&]tourmanual\b/.test(location.search) ? 1e9 : 7000 + s.line.length * 40;
      while (!next && !quit && performance.now() - t0 < hold) await wait(80);
    }
    cur = null;
    ring.classList.remove('on');
    sub.clear();
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

/** the loop as a pixel diagram: five drawn things joined by brass arrows, a word under each, a key cap to close */
function loopCard(layer: HTMLElement, onEnd: (f: () => void) => void): Promise<void> {
  return new Promise((done) => {
    const card = document.createElement('div');
    card.className = 'tour-card';
    const row = document.createElement('div');
    row.className = 'tour-loop';
    const arrowU = arrowSheet();
    LOOP.forEach(([k, w], i) => {
      const step = document.createElement('div');
      step.className = 'tour-step';
      step.style.animationDelay = i * 0.14 + 's';
      step.append(pixIconEl(k, 2), Object.assign(document.createElement('b'), { textContent: w }));
      row.append(step);
      if (i < LOOP.length - 1) { const a = document.createElement('i'); a.className = 'tour-arrow'; a.style.backgroundImage = `url(${arrowU})`; a.style.animationDelay = i * 0.14 + 0.07 + 's'; row.append(a); }
    });
    const ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'tour-ok'; ok.setAttribute('aria-label', 'Got it');
    ok.append(capEl('ok', 3));
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

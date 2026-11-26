// THE GUIDED TOUR (round 18): the lab menus explained, once on the first visit and again from Dr. Calder herself
// (click her) or Settings. The camera visits each station in turn and the station does its thing while she says
// what it is for in one short subtitle line: the archive, the research lattice (a branch swings onto the rig), the
// sample fridge (its door opens), the talent bench (the balance tips), the commissary and the jukebox up in the
// corner, unit room 4. Brass pixel corner pieces close on the thing, a glint running round them; little lamps
// count the stops; a pixel key cap skips. It ends on the loop as a pixel diagram (go in, loot, the press, pay the
// debt, research), joined by brass arrows, and a key cap to close it. No plain boxes, no text walls, no stamps.
// The title room (title.ts) provides the moves; this only runs them.
import { SubLine } from './subline';
import { built, type StationKey } from '../lab/stations';
import { sfx } from '../sfx';
import { pixIconEl, type PixKind } from '../deco/pixIcons';
import { cornerSheet, CORNER, CORNER_F, capEl, pipSheet, arrowSheet } from './tourArt';
import { LAB_INTRO_KEY, labIntroDone } from '../../../game/tutorial/state';
import { calderHas, calderSay, calderStop } from '../../../audio/calderVoice';

export type TourRoom = 'monitor' | 'archive' | 'research' | 'subject';
/** round 22: the lab introduction moves her arm and mouth through the host (the lab guide's HumanRig) */
export interface IntroHost extends TourHost {
  /** she is speaking (her mouth moves) */
  talk(on: boolean): void;
  /** she points at the stop's thing (null: arm down) */
  point(room: TourRoom, hot: string | null): void;
  /** she has introduced herself and every room (the guide's first-meeting lines are spent) */
  introduced(): void;
}
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
// round 19, the lab from zero (../lab/stations.ts): a station not built yet is a taped build site; she names what
// goes there instead, the archive stop waits until it is built, the hub keys stop waits until one of them shows
const EMPTY: Partial<Record<StationKey, string>> = {
  lattice: 'The research lattice goes here. Your runs pay for it.',
  fridge: 'A sample fridge, once we can afford one.',
  talent: 'And a talent bench. Everything in here is bought with runs.',
};
const STATION_HOT: Record<string, StationKey> = { codex: 'lattice', fridge: 'fridge', 'tb:bench': 'talent' };
function stopsNow(): Stop[] {
  const out: Stop[] = [];
  for (const s of STOPS) {
    if (s.room === 'archive' && !built('archive')) continue;
    if (s.el && ![...document.querySelectorAll<HTMLElement>(s.el)].some((e) => !e.hidden)) continue;
    const k = s.hot ? STATION_HOT[s.hot] : undefined;
    // (the wide shot: a wall station's site of crates stands on the floor under where it will hang)
    if (k && !built(k)) { out.push({ room: s.room, hot: 'site:' + k, pose: 'room', line: EMPTY[k] ?? s.line }); continue; }
    out.push(s);
  }
  return out;
}
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
  const STOPS = stopsNow();
  const pips = STOPS.map(() => { const p = document.createElement('i'); Object.assign(p.style, { backgroundImage: `url(${pipU})` }); dots.append(p); return p; });
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'tour-skip'; skip.setAttribute('aria-label', 'Skip the tour (Esc)');
  skip.append(capEl('skip', 3));
  layer.append(ring, skip); // no progress dots (the user rejected them)
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

// ================================================================== THE LAB INTRODUCTION (round 22)
// A new game's first unit: before its first link, Dr. Calder walks the operator round the Meridian Institute of
// Liminality herself, one cinematic run of the camera from room to room: the unit waking in unit room 4, the
// control room, the research lattice, the archive, the fab bay, the clone vat, and back to the monitors. At each
// stop she says what the place is for in one or two short lines on the subtitle strip (her mouth and arm follow:
// the lab guide's HumanRig), and a station not built yet is its taped build site (the lab from zero: your runs
// fund them). About a minute, the input held (Esc, or hold Space / a click, skips; the pip lamps by the key cap
// fill while held), once per browser. It ends black, straight into the link and the first run (title.ts newGame),
// whose greeting knows she has met you (src/game/tutorial/firstRun.ts).
interface IStop { room: TourRoom; hot?: string; pose?: string; act?: string; lines: string[]; /** a camera pose for each line after the first */ poses?: (string | undefined)[] }

/** the lab introduction has not played yet (?labintro forces it, ?labintro=0 / ?notour and scripted browsers skip it) */
export function labIntroWanted(): boolean {
  const q = location.search;
  if (/[?&](labintro=0|notour)\b/.test(q)) return false;
  if (/[?&]labintro\b/.test(q)) return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  return !labIntroDone();
}
function markIntro() { try { localStorage.setItem(LAB_INTRO_KEY, '1'); localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ } }

function introStops(met: boolean): IStop[] {
  const S: IStop[] = [];
  S.push({ room: 'subject', pose: 'prisoner', poses: [undefined, 'title'], lines: met
    ? ["There. It's awake. Before it goes down, let me show you the place properly.", 'Unit room four. Your unit sits in that chair, and you ride along from up here.']
    : ["Oh, good, you're awake. Hi! I'm Iris. Dr. Calder.", 'Welcome to the Meridian Institute of Liminality. This is unit room four: your unit sits in that chair, you ride along from up here.'] });
  S.push({ room: 'research', pose: 'room', lines: ['The control room. Where the actual science happens. Eventually.'] });
  S.push(built('lattice')
    ? { room: 'research', hot: 'codex', pose: 'codex', act: 'lattice', lines: ['The research lattice. Research points go in, new kit comes out.'] }
    : { room: 'research', hot: 'site:lattice', pose: 'room', lines: ["The lattice goes there. Right now it's crates and tape. Your runs pay for it."] });
  S.push(built('archive')
    ? { room: 'archive', hot: 'table', lines: ['The archive. Anything you scan or sample down there gets filed in here.'] }
    : { room: 'monitor', hot: 'feed:archive', act: 'lean:archive', lines: ["The archive's on that feed. Well, it will be. Scan something and we'll buy the cabinets."] });
  S.push({ room: 'research', pose: 'fab', hot: built('filament') ? undefined : 'site:filament', lines: [built('filament')
    ? 'The fab bay. Banked matter becomes filament, filament becomes kit.'
    : "The fab bay. A filament maker and a printer, both taped off for now. You'll fund them as you go."] });
  S.push({ room: 'research', pose: 'clone', hot: built('clone') ? undefined : 'site:clone', lines: [built('clone')
    ? 'The clone vat. A spare body, for when things go badly. They will.'
    : 'And the clone vat goes there. A spare body, for when things go wrong. Not cheap.'] });
  S.push({ room: 'monitor', lines: ['And the monitors. Every camera in the building ends up on these tubes. Yours too.', "Right. That's the tour. Your unit's waiting. Let's get you linked."] });
  return S;
}

const INTRO_CSS = `
.tour.lab-intro { cursor: default; }
.tour.lab-intro .tour-bar { position: fixed; left: 0; right: 0; height: 7vh; background: linear-gradient(#000, #050403); z-index: 1; pointer-events: none; transition: transform .9s cubic-bezier(.2,.8,.3,1); }
.tour.lab-intro .tour-bar.t { top: 0; transform: translateY(-100%); box-shadow: 0 2px 0 rgba(255, 190, 70, .08); }
.tour.lab-intro .tour-bar.b { bottom: 0; transform: translateY(100%); box-shadow: 0 -2px 0 rgba(255, 190, 70, .08); }
.tour.lab-intro.in .tour-bar { transform: none; }
.tour.lab-intro .tour-dots { top: calc(3.5vh - 7px); z-index: 2; }
.tour.lab-intro .gd-sub { bottom: calc(7vh + 18px); }
.tour.lab-intro .tour-fade { position: fixed; inset: 0; background: #000; z-index: 5; pointer-events: none; opacity: 1; transition: opacity 1.4s ease; }
.tour.lab-intro.in .tour-fade { opacity: 0; }
.tour.lab-intro.out .tour-fade { opacity: 1; transition-duration: .7s; }
.tour.lab-intro .tour-skip { bottom: calc(3.5vh - 15px); right: 18px; display: flex; align-items: center; gap: 8px; }
.tour.lab-intro .tour-hold { display: flex; gap: 3px; }
.tour.lab-intro .tour-hold i { width: 14px; height: 14px; image-rendering: pixelated; background-size: 14px 42px; background-position: 0 0; }
.tour.lab-intro .tour-hold i.on { background-position: 0 -28px; filter: drop-shadow(0 0 4px rgba(255, 176, 48, .8)); }
@media (max-aspect-ratio: 1/1.05) { .tour.lab-intro .gd-sub { top: auto; bottom: calc(7vh + 18px); } }
`;
let introCss = false;

/** resolves when it is over (played or skipped) with a function that lifts the black it ends on */
export async function runLabIntro(h: IntroHost, o: { met?: boolean } = {}): Promise<() => void> {
  if (running) return () => {};
  running = true;
  markIntro();
  if (!introCss) { introCss = true; const st = document.createElement('style'); st.textContent = INTRO_CSS; document.head.append(st); }
  const layer = document.createElement('div');
  layer.className = 'tour lab-intro';
  const ring = bracket();
  const bars = ['t', 'b'].map((k) => { const b = document.createElement('div'); b.className = 'tour-bar ' + k; return b; });
  const fade = document.createElement('div'); fade.className = 'tour-fade';
  const STOPS = introStops(!!o.met);
  const pipU = pipSheet();
  const dots = document.createElement('div'); dots.className = 'tour-dots';
  const pips = STOPS.map(() => { const p = document.createElement('i'); p.style.backgroundImage = `url(${pipU})`; dots.append(p); return p; });
  // the skip key cap, and five little lamps that fill while Space / the pointer is held
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'tour-skip'; skip.setAttribute('aria-label', 'Skip (Esc, or hold)');
  const holdRow = document.createElement('span'); holdRow.className = 'tour-hold';
  const holdPips = [0, 1, 2, 3, 4].map(() => { const p = document.createElement('i'); p.style.backgroundImage = `url(${pipU})`; holdRow.append(p); return p; });
  skip.append(capEl('skip', 3)); // no hold dots either
  layer.append(...bars, ring, skip, fade); // no progress dots (the user rejected them)
  document.body.append(layer);
  const sub = new SubLine(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('in')));
  let quit = false, holding = 0, held = false;
  const stop = () => { if (!quit) { quit = true; sfx('back', 0.5); } };
  skip.addEventListener('click', (e) => { e.stopPropagation(); stop(); });
  // the input is held: every key and press goes to the introduction (Esc skips, a held Space / Enter / press skips)
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type !== 'keydown') { if (['Space', 'Enter'].includes(e.code)) held = false; return; }
    if (e.code === 'Escape') stop();
    else if (['Space', 'Enter'].includes(e.code)) held = true;
  };
  const onDown = (e: PointerEvent) => { if ((e.target as HTMLElement).closest?.('.tour-skip')) return; e.preventDefault(); e.stopPropagation(); held = true; };
  const onUp = () => { held = false; };
  const block = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  layer.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp, true);
  layer.addEventListener('wheel', block, { passive: false });
  layer.addEventListener('contextmenu', block);
  let cur: IStop | null = null, last = performance.now(), raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    sub.update(dt);
    h.talk(sub.talking);
    holding = held ? holding + dt : Math.max(0, holding - dt * 3);
    const k = Math.min(1, holding / 1.1);
    holdPips.forEach((p, i) => p.classList.toggle('on', k > (i + 0.5) / 5));
    if (k >= 1) stop();
    const at = cur?.hot ? h.spot(cur.room, cur.hot) : null;
    ring.classList.toggle('on', !!at);
    if (at) { const s = Math.round(Math.max(56, Math.min(240, at.r * 2)) / 2) * 2; Object.assign(ring.style, { left: Math.round(at.x - s / 2) + 'px', top: Math.round(at.y - s / 2) + 'px', width: s + 'px', height: s + 'px' }); }
  };
  raf = requestAnimationFrame(tick);
  const wait = async (ms: number) => { const t = performance.now() + ms; while (!quit && performance.now() < t) await new Promise((r) => setTimeout(r, 60)); };
  try {
    // the picture comes up out of black on the unit, waking in its chair
    // (dev: ?introfrom=N starts at stop N, for shots)
    const from = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('introfrom') || 0) : 0;
    for (let i = from; i < STOPS.length && !quit; i++) {
      const s = STOPS[i];
      pips.forEach((p, k) => { p.className = k === i ? 'on' : k < i ? 'past' : ''; });
      cur = null; sub.clear(); h.point(s.room, null);
      for (let k = 0; k < 400 && !h.ready() && !quit; k++) await wait(150);
      if (quit) break;
      await h.go(s.room);
      h.aim(s.room, s.pose ?? 'room');
      if (s.act) { try { h.act(s.room, s.act); } catch (e) { console.warn('intro act', e); } }
      await wait(s.pose && s.pose !== 'room' && s.room === 'research' ? 1300 : i === 0 ? 900 : 600);
      cur = s;
      if (s.hot) h.point(s.room, s.hot);
      for (let j = 0; j < s.lines.length; j++) {
        const line = s.lines[j];
        if (quit) break;
        if (j && s.poses?.[j]) h.aim(s.room, s.poses[j]!);
        sfx('tick', 0.4);
        const voiced = calderHas(line) && calderSay(line, { vol: 0.9 }) !== null;
        let n = 0;
        sub.say(line, { dur: 60, onChar: (ch) => { if (!voiced && ch !== ' ' && (n++ & 1) === 0) sfx('type', 0.12); } });
        while (!quit && sub.talking) await wait(60);
        if (import.meta.env.DEV) (window as unknown as { __labIntro?: unknown }).__labIntro = { stop: i, line, room: s.room };
        await wait(1500 + line.length * 22);
      }
    }
  } finally {
    cur = null; ring.classList.remove('on'); sub.clear();
    calderStop();
    h.point('monitor', null); h.talk(false);
    try { h.introduced(); } catch (e) { console.warn('intro guide', e); }
    // to black, then the link takes it from there
    layer.classList.add('out');
    await new Promise((r) => setTimeout(r, 750));
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('pointerup', onUp, true);
    sub.dispose();
    // the black stays up over the hand-off (a reload into the link, or the lights coming on for the creator)
    document.body.append(fade);
    fade.style.cssText = 'position:fixed;inset:0;background:#000;z-index:95;pointer-events:none;opacity:1;transition:opacity .6s ease';
    layer.remove();
    running = false;
    h.aim('research', 'room');
  }
  return () => { fade.style.opacity = '0'; setTimeout(() => fade.remove(), 650); };
}

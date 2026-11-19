// THE QUEST TRACKER (round 19): a small line at the top of the screen for the tracked job: a little pixel lamp, the
// job's name in amber, the step to do now, and, when the job has a time limit, a pixel stopwatch and the minutes left
// (red in the last two). Floating type in the game's ink outline, nothing behind it (no plate, no box). It hides while
// a close-up, the band, a menu or a cinematic has the screen. The full board stays on J.
//   installQuestTracker()             once per session
//   setTrackerTimer(endTime | null)   a deadline in game seconds (G.time) for the tracked job
import { G } from '../game/G';
import type { QuestRuntime } from '../missions/questRuntime';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const clean = (s: string) => s.replace(/\s*\([^)]*\)/g, '').split(/\s*[:;]\s*/)[0].trim();
let deadline: number | null = null;
export function setTrackerTimer(t: number | null) { deadline = t; }
export function trackerTimeLeft(): number | null { return deadline === null ? null : Math.max(0, deadline - (G.time ?? 0)); }

/** a pixel sprite as a data URL: rows of characters, a palette */
function sprite(rows: string[], pal: Record<string, string>): string {
  const cv = document.createElement('canvas'); cv.width = rows[0].length; cv.height = rows.length;
  const g = cv.getContext('2d')!;
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const c = pal[ch]; if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } }));
  return cv.toDataURL();
}
const LAMP = sprite([
  '..kkk..', '.kyyyk.', 'kyYWyyk', 'kyYyyyk', 'kyyyyok', '.koook.', '..kkk..',
], { k: '#1a1206', y: '#ffb030', Y: '#ffe090', W: '#ffffff', o: '#c86a10' });
const WATCH = sprite([
  '..kkk..', '...k...', '.kkkkk.', 'kwwkwwk', 'kwwkwwk', 'kwwkkwk', 'kwwwwwk', '.kkkkk.',
], { k: '#1a1206', w: '#f2ead0' });

let el: HTMLDivElement | null = null;
export function installQuestTracker() {
  if (el) return;
  el = document.createElement('div');
  el.className = 'qtk lp-track';
  el.setAttribute('aria-live', 'polite');
  document.body.append(el);
  const st = document.createElement('style');
  st.textContent = `.qtk { position: fixed; left: 50%; top: 10px; transform: translate(-50%, -6px); z-index: 27; display: flex; align-items: center; gap: 9px; pointer-events: none; white-space: nowrap;
  font-family: var(--font-new); font-size: 17px; line-height: 1; color: #f4ead0; opacity: 0; transition: opacity .3s ease, transform .3s ease;
  text-shadow: 2px 2px 0 #0b0a07, -1px -1px 0 #0b0a07, 1px -1px 0 #0b0a07, -1px 1px 0 #0b0a07, 0 3px 0 rgba(0,0,0,.35); }
.qtk.on { opacity: 1; transform: translate(-50%, 0); }
.qtk img { width: 14px; height: 14px; image-rendering: pixelated; filter: drop-shadow(1px 1px 0 #0b0a07); }
.qtk .qtk-l { animation: qtk-blink 2.4s steps(1) infinite; }
@keyframes qtk-blink { 90% { opacity: .45; } }
.qtk b { font-weight: 400; color: #ffc860; letter-spacing: .06em; }
.qtk em { font-style: normal; color: #f4ead0; max-width: 46vw; overflow: hidden; text-overflow: ellipsis; }
.qtk .qtk-t { display: inline-flex; align-items: center; gap: 5px; color: #f4ead0; }
.qtk .qtk-t.late { color: #ff7a5a; animation: qtk-blink .8s steps(1) infinite; }
.qtk .qtk-t img { width: 14px; height: 16px; }
@media (max-width: 560px) { .qtk { font-size: 15px; top: 6px; } .qtk em { max-width: 52vw; } }`;
  document.head.append(st);
  let sig = '', acc = 0, last = performance.now();
  G.addSystem({ name: 'questTracker', update: () => {
    const now = performance.now(); acc += now - last; last = now;
    if (acc < 250) return;
    acc = 0;
    const q = (G.missions as unknown as { quests?: QuestRuntime } | undefined)?.quests;
    const k = q?.focus?.() ?? null;
    const v = k ? q!.view(k) : null;
    const hide = !v || v.status === 'done' || document.body.classList.contains('noclip-cine') || !!document.querySelector('.wt.on, .fpk.on, .ptm, .ps2, .tour')
      || document.documentElement.classList.contains('lp-busy') || !!G.local?.body?.dead;
    el!.classList.toggle('on', !hide);
    if (!v) return;
    const step = v.objectives.find((o) => !o.done && !o.optional) ?? v.objectives.find((o) => !o.done);
    const left = trackerTimeLeft();
    const mm = left === null ? '' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const s = [v.title, step?.text ?? '', mm, left !== null && left < 120 ? 1 : 0].join('|');
    if (s === sig) return;
    sig = s;
    el!.innerHTML = `<img class="qtk-l" src="${LAMP}" alt=""><b>${esc(v.title)}</b>${step ? `<em>${esc(clean(step.text))}</em>` : ''}${mm ? `<span class="qtk-t${left! < 120 ? ' late' : ''}"><img src="${WATCH}" alt="">${mm}</span>` : ''}`;
  } });
}
/** the tracker's element (for a spotlight) */
export function trackerEl(): HTMLElement | null { return el; }

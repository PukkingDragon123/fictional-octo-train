// THE QUEST TRACKER (round 19): a small line at the top of the screen for the tracked job: a little pixel lamp, the
// job's name in amber, the step to do now, and, when the job has a time limit, a pixel stopwatch and the minutes left
// (red in the last two). Floating type in the game's ink outline, nothing behind it (no plate, no box). It hides while
// a close-up, the band, a menu or a cinematic has the screen. The full board stays on J.
// It is the one line at the top: the old objective caption's news (a new job, a step done, a job complete) flashes on
// it for a few seconds (trackerFlash, from src/ui/broadcast/objective.ts) and it goes back to the tracked job.
//   installQuestTracker()             once per session
//   setTrackerTimer(endTime | null)   a deadline in game seconds (G.time) for the tracked job
import { G } from '../game/G';
import type { QuestRuntime } from '../missions/questRuntime';
import { mxIconAnim, type IconKind } from './machine/decor';
import { creditSlot } from './creditIcon';

// round 21: the icons lead: a little 3D model of what the step asks for (a crate to carry, a lens to search, the press,
// a boot to go somewhere...) turns in front of the line, and sways when the step changes
const STEP_IC: [RegExp, IconKind][] = [
  [/\bpress|hopper|crush|feed it/i, 'gear'], [/\bcarry|bring|deliver|haul|hand in|drop off/i, 'crate'], [/\bscan/i, 'eye'],
  [/\bsample|specimen|jar|residue/i, 'jar'], [/\bfind|search|look|locate|explore|loot/i, 'lens'], [/\bkill|destroy|survive|escape|flee|hide/i, 'skull'],
  [/\btalk|call|report|radio|speak|phone/i, 'walkie'], [/\brepair|fix|build|craft|make|assemble/i, 'wrench'], [/\bpower|generator|fuse|switch|wire/i, 'bolt'],
  [/\bunlock|key|open|door/i, 'key'], [/\bpay|credit|money|sell|buy|debt/i, 'coin'], [/\bread|note|document|paper|file/i, 'dossier'],
  [/\bgo |reach|walk|enter|exit|leave|return|head /i, 'boot'],
];
const stepIcon = (t: string): IconKind => STEP_IC.find(([rx]) => rx.test(t))?.[1] ?? 'compass';
const icCache = new Map<IconKind, ReturnType<typeof mxIconAnim>>();
function leadIcon(k: IconKind) { if (!icCache.has(k)) icCache.set(k, mxIconAnim(k, 22)); return icCache.get(k) ?? null; }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const clean = (s: string) => s.replace(/\s*\([^)]*\)/g, '').split(/\s*[:;]\s*/)[0].trim();
/** round 21: an amount of credits in a line becomes the spinning credit coin and the number */
const coins = (html: string) => html.replace(/([\d][\d,]*)\s*(?:credits|cr)\b/gi, (_m, n: string) => creditSlot(Number(n.replace(/,/g, '')), 14));
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
const LAMP_G = sprite([
  '..kkk..', '.kgggk.', 'kgGWggk', 'kgGgggk', 'kggggok', '.koook.', '..kkk..',
], { k: '#06140a', g: '#50d860', G: '#c0ffb0', W: '#ffffff', o: '#1a8a30' });
const WATCH = sprite([
  '..kkk..', '...k...', '.kkkkk.', 'kwwkwwk', 'kwwkwwk', 'kwwkkwk', 'kwwwwwk', '.kkkkk.',
], { k: '#1a1206', w: '#f2ead0' });

let el: HTMLDivElement | null = null;
let flash: { title: string; step?: string; tone?: string; until: number } | null = null;
/** a word about a job for a few seconds (a new one, a step done, complete, filed), then back to the tracked job */
export function trackerFlash(c: { title: string; step?: string; tone?: string }, secs = 3.4) { flash = { ...c, until: performance.now() + secs * 1000 }; }
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
.qtk .qtk-i { display: inline-flex; width: 28px; height: 28px; margin: -6px -2px -6px 0; filter: drop-shadow(1px 1px 0 #0b0a07) drop-shadow(0 0 5px rgba(255, 190, 80, .35)); }
.qtk .qtk-i canvas { display: block; }
.qtk.flash .qtk-i { animation: qtk-pop .5s steps(6) both; }
.qtk img { width: 14px; height: 14px; image-rendering: pixelated; filter: drop-shadow(1px 1px 0 #0b0a07); }
.qtk .qtk-l { animation: qtk-blink 2.4s steps(1) infinite; }
@keyframes qtk-blink { 90% { opacity: .45; } }
.qtk b { font-weight: 400; color: #ffc860; letter-spacing: .06em; }
.qtk em { font-style: normal; color: #f4ead0; max-width: 46vw; overflow: hidden; text-overflow: ellipsis; }
.qtk .qtk-t { display: inline-flex; align-items: center; gap: 5px; color: #f4ead0; }
.qtk .qtk-t.late { color: #ff7a5a; animation: qtk-blink .8s steps(1) infinite; }
.qtk .qtk-t img { width: 14px; height: 16px; }
.qtk.flash b { animation: qtk-pop .45s steps(5) both; }
.qtk.flash em { animation: qtk-pop .45s .12s steps(5) both; }
.qtk.t-ok b { color: #9cf08a; } .qtk.t-filed b, .qtk.t-filed em { color: #b8ae96; }
@keyframes qtk-pop { 0% { opacity: 0; transform: translateY(-5px) scale(1.25); } 60% { opacity: 1; transform: translateY(1px) scale(.97); } 100% { transform: none; } }
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
    const busy = document.body.classList.contains('noclip-cine') || !!document.querySelector('.wt.on, .fpk.on, .ptm, .ps2, .tour')
      || document.documentElement.classList.contains('lp-busy') || !!G.local?.body?.dead;
    if (flash && now > flash.until) { flash = null; sig = ''; }
    if (flash) {
      el!.classList.toggle('on', !busy);
      const s = 'F|' + flash.title + '|' + (flash.step ?? '') + '|' + (flash.tone ?? '');
      if (s === sig) return;
      sig = s;
      el!.className = 'qtk lp-track flash t-' + (flash.tone ?? 'up') + (busy ? '' : ' on');
      el!.innerHTML = `<span class="qtk-i"></span><img class="qtk-l" src="${flash.tone === 'ok' ? LAMP_G : LAMP}" alt=""><b>${esc(flash.title)}</b>${flash.step ? `<em>${coins(esc(clean(flash.step)))}</em>` : ''}`;
      lead(flash.step ? stepIcon(flash.step) : flash.tone === 'ok' ? 'key' : 'clipboard');
      return;
    }
    if (el!.classList.contains('flash')) el!.className = 'qtk lp-track' + (el!.classList.contains('on') ? ' on' : '');
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
    el!.innerHTML = `<span class="qtk-i"></span><b>${esc(v.title)}</b>${step ? `<em>${coins(esc(clean(step.text)))}</em>` : ''}${mm ? `<span class="qtk-t${left! < 120 ? ' late' : ''}"><img src="${WATCH}" alt="">${mm}</span>` : ''}`;
    lead(stepIcon(step?.text ?? v.title));
  } });
}
/** put the step's model in front of the line; a new step makes it sway a moment */
let leadK = '';
function lead(k: IconKind) {
  const slot = el?.querySelector('.qtk-i');
  const ic = leadIcon(k);
  if (!slot || !ic) return;
  slot.replaceChildren(ic.cv);
  if (k !== leadK) { leadK = k; ic.hot(true); setTimeout(() => ic.hot(false), 1400); }
}
/** the tracker's element (for a spotlight) */
export function trackerEl(): HTMLElement | null { return el; }

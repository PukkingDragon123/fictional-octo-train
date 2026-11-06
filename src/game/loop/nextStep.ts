// The menu's next step: a small plate in the corner of the monitor booth that
// says where the operator is in the loop between runs (WAKE > WORK > PRESS >
// OUT > LAB > NEXT) and what to do now:
//   no run yet         NEW UNIT: the first link, Level 0, the debt
//   upgrades open      THE LAB: n RP banked, k upgrades ready (the plate takes
//                      you to the control room's tree, key 2)
//   nothing to buy     NEW UNIT: what the next unlock still needs
// It follows the title's own menu (shown only while the menu is up). A run
// that ended with "To the lab" (src/ui/death/summary.ts goToLab) lands here
// with 'noclip.menu.goto' set: the booth turns to the control room by itself.
//   nextStepHint(follow?)   called by src/main.ts once the title is up
import { outlook } from './unlocks';
import { file, lastRun } from '../meridian';
import { drawPlate, screw, hiCanvas } from './plate';
import { LOOP } from './tracker';

const GOTO_KEY = 'noclip.menu.goto';
const CSS = `
.lp-next { position: fixed; right: calc(16px + env(safe-area-inset-right)); bottom: calc(40px + env(safe-area-inset-bottom)); z-index: 60; width: 372px; height: 84px; font-family: var(--font-new);
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left; color: inherit; opacity: 0; transform: translateY(8px); transition: opacity .35s, transform .35s;
  filter: drop-shadow(0 3px 0 rgba(0,0,0,.45)) drop-shadow(0 8px 14px rgba(0,0,0,.4)); }
.lp-next.on { opacity: 1; transform: none; }
.lp-next > canvas { position: absolute; left: 0; top: 0; }
.lp-next .t { position: absolute; left: 16px; right: 14px; white-space: nowrap; overflow: hidden; font-size: 16px; line-height: 16px; text-shadow: var(--text-ink); }
.lp-next .t1 { top: 10px; color: #8fd8ff; letter-spacing: 1px; }
.lp-next .t2 { top: 30px; color: #ffe7a8; }
.lp-next .t3 { top: 54px; color: #5f6a66; display: flex; justify-content: space-between; }
.lp-next .t3 span.done { color: #6fb88a; } .lp-next .t3 span.cur { color: #ffd890; text-shadow: var(--text-ink), 0 0 6px rgba(255,190,90,.8); animation: lp-nx 1.2s steps(2) infinite; }
.lp-next .t3 i { font-style: normal; color: #3c4643; }
@keyframes lp-nx { 50% { opacity: .55; } }
.lp-next:hover .t2, .lp-next:focus-visible .t2 { color: #ffffff; }
.lp-next:focus-visible { outline: none; }
@media (max-width: 700px) { .lp-next { transform-origin: bottom right; scale: .78; } }
`;

/** what the loop says to do next, between runs */
export function nextStep(): { stage: 'lab' | 'next'; title: string; line: string; go: 'lab' | 'new' } {
  const runs = file().runs;
  const o = outlook();
  if (!runs) return { stage: 'next', title: 'NEXT STEP · YOUR FIRST UNIT', line: 'NEW UNIT: wake in Level 0, pay its debt', go: 'new' };
  if (o.openCount > 0) return { stage: 'lab', title: `NEXT STEP · THE LAB · ${o.rp} RP BANKED`, line: `${o.openCount} upgrade${o.openCount > 1 ? 's' : ''} ready: CONTROL ROOM (2)`, go: 'lab' };
  const last = lastRun();
  const more = o.next ? `${o.next.need} RP more unlocks ${o.next.title}` : 'another run, another file';
  return { stage: 'next', title: last ? `NEXT STEP · NEW UNIT · ${o.rp} RP BANKED` : 'NEXT STEP · NEW UNIT', line: more, go: 'new' };
}

function turnTo(key: string) { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }
function clickNewUnit() {
  const b = [...document.querySelectorAll<HTMLElement>('.tt3-menu button, .tt3-menu [role="button"]')].find((e) => /^new unit/i.test(e.getAttribute('aria-label') || e.textContent || ''));
  if (b) b.click(); else turnTo('3');
}

/** put the hint on the page; it follows the title menu's visibility */
export function nextStepHint(follow = '.tt3-menu'): HTMLButtonElement | null {
  if (!document.getElementById('lp-next-css')) { const s = document.createElement('style'); s.id = 'lp-next-css'; s.textContent = CSS; document.head.appendChild(s); }
  let s: ReturnType<typeof nextStep>;
  try { s = nextStep(); } catch (e) { console.warn('next step', e); return null; }
  const W = 372, H = 84;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'lp-next';
  b.setAttribute('aria-label', `${s.title}. ${s.line}`);
  const k = hiCanvas(W, H);
  drawPlate(k.x, W, H, 5150);
  for (const [sx, sy] of [[5, 5], [W - 6, 5], [5, H - 6], [W - 6, H - 6]] as const) screw(k.x, sx, sy);
  b.appendChild(k.c);
  const ci = LOOP.findIndex((x) => x.key === s.stage);
  b.insertAdjacentHTML('beforeend', `<div class="t t1">${s.title}</div><div class="t t2">› ${s.line}</div><div class="t t3">${LOOP.map((x, i) => `<span class="${i < ci ? 'done' : i === ci ? 'cur' : ''}">${x.label}</span>`).join('<i>›</i>')}</div>`);
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (s.go === 'lab') turnTo('2'); else clickNewUnit(); });
  document.body.appendChild(b);
  // only while the title's menu is on screen (not inside a room, the creator or a terminal)
  let goto = '';
  try { goto = sessionStorage.getItem(GOTO_KEY) || ''; sessionStorage.removeItem(GOTO_KEY); } catch { /* blocked */ }
  const t0 = performance.now();
  const tick = () => {
    if (!b.isConnected) return;
    const m = document.querySelector<HTMLElement>(follow);
    const cs = m ? getComputedStyle(m) : null, r = m?.getBoundingClientRect();
    const on = !!m && !!cs && !!r && r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
    b.classList.toggle('on', on);
    b.style.pointerEvents = on ? '' : 'none';
    // back from a run with research to spend: the booth turns to the control room once it is live
    if (goto === 'research') {
      const view = document.querySelector<HTMLElement>('.nx-title')?.dataset.view;
      if (view === 'research' || performance.now() - t0 > 20000) goto = '';
      else if (on && performance.now() - t0 > 1200) turnTo('2');
    }
    setTimeout(tick, 400);
  };
  tick();
  return b;
}

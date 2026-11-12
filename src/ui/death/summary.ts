// The run-end summary for a run that ends ALIVE (passage out on the coach,
// the cage or the carriage; the door), and the pieces the death report
// (./index.ts) shares with it: what the lab total buys now (unlockHtml) and
// the way back to the lab (goToLab). The loop's last steps, made plain:
//   OUT   the ending plays (src/game/debt/transport.ts, src/missions)
//   LAB   then this plate rises over it: what the run earned row by row, the
//         research points banked at once, what they unlock in the control
//         room, and the two keys: To the lab (spend them), New unit now.
// The books are the death report's own (./stats.ts RunTracker.report(out)).
//   wireRunEnd(g, p, tracker)   once per session; listens for bus 'runEnded' { how }
import { bus } from '../../core/events';
import type { Game } from '../../game/game';
import type { Player } from '../../entities/player';
import { G } from '../../game/G';
import { grantResearch, researchPoints } from '../../game/research';
import { flushStats } from '../../game/profile';
import { outlook } from '../../game/loop/unlocks';
import { drawPlate, drawRecess, screw, hiCanvas } from '../../game/loop/plate';
import { mxFrame, mxSkinKey, panelSpec } from '../machine/kit';
import { mxOk } from '../machine/core';
import { sfx } from '../menus/sfx';
import type { RunTracker, RunReport } from './stats';

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
/** where the menu lands after a run (src/game/loop/nextStep.ts reads it) */
export const MENU_GOTO_KEY = 'noclip.menu.goto';

/** back to the Institute, straight into the control room (the research tree) */
export function goToLab() {
  try { sessionStorage.setItem(MENU_GOTO_KEY, 'research'); } catch { /* blocked: the menu opens on the monitors */ }
  const u = new URL(location.href);
  for (const k of ['quick', 'intro', 'prologue', 'tutorial', 'seed']) u.searchParams.delete(k);
  // the loading screen of everything comes up first, so the reload never flashes (src/ui/loading.ts)
  void import('../loading').then((m) => m.showLoading('lab')).catch(() => { /* go anyway */ });
  setTimeout(() => { location.href = u.toString(); }, 450);
}

/** what the lab total buys now (or what is next), for the reports */
export function unlockHtml(): string {
  const o = outlook();
  const head = `<div class="ul-h">IN THE LAB <b>${o.rp} RP</b></div>`;
  if (o.open.length) {
    const rows = o.open.map((p) => `<div class="ul-r"><span>${esc(p.title)}</span><i>${p.cost} RP</i></div>`).join('');
    const more = o.openCount > o.open.length ? `<div class="ul-m">+${o.openCount - o.open.length} more ready to research</div>` : '';
    return head + `<div class="ul-k">READY TO UNLOCK</div>` + rows + more;
  }
  if (o.next) return head + `<div class="ul-k">NEXT UNLOCK</div><div class="ul-r"><span>${esc(o.next.title)}</span><i>${o.next.need} RP to go</i></div>`;
  return head + `<div class="ul-m">the research tree is complete</div>`;
}

const CSS = `
.dz-unl { margin-top: 6px; padding-top: 6px; border-top: 2px dashed rgba(141, 255, 122, 0.45); opacity: 0; transition: opacity .3s steps(3); }
.dz-unl.on { opacity: 1; }
.short .dz-unl .ul-r ~ .ul-r, .short .dz-unl .ul-m { display: none; }
.ul-h { display: flex; justify-content: space-between; color: #8dff7a; }
.ul-h b { font-weight: 400; color: #ffd27a; }
.ul-k { color: #8fd8ff; margin-top: 2px; }
.ul-r { display: flex; justify-content: space-between; gap: 12px; color: #d8ffd2; white-space: nowrap; }
.ul-r span { overflow: hidden; text-overflow: ellipsis; }
.ul-r i { font-style: normal; color: #ffd27a; }
.ul-m { color: #8dff7a; opacity: .75; }
.rs-root { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); z-index: 430; transform: translate(-50%, 24px); opacity: 0; pointer-events: auto;
  transition: opacity .5s, transform .5s cubic-bezier(.2, 1.3, .4, 1); font-family: var(--font-new); filter: drop-shadow(0 4px 0 rgba(0,0,0,.5)) drop-shadow(0 12px 24px rgba(0,0,0,.6)); }
.rs-root.on { opacity: 1; transform: translate(-50%, 0); }
.rs-root > canvas { position: absolute; left: 0; top: 0; }
.rs-in { position: relative; padding: 20px 24px 16px; width: min(560px, calc(100vw - 32px)); box-sizing: border-box; color: #8dff7a; font-size: 16px; line-height: 18px; }
.rs-h { display: flex; justify-content: space-between; opacity: .75; font-family: 'Courier Prime', monospace; font-size: 12px; letter-spacing: .16em; }
.rs-stamp { position: absolute; right: 22px; top: 44px; font-size: 22px; }
.rs-sub { margin-top: 4px; } .rs-sub b { font-weight: 400; color: #d8ffd2; }
.rs-rows { margin-top: 8px; }
.rs-row { display: grid; grid-template-columns: 1fr auto 3.5em; gap: 12px; color: #8dff7a; opacity: 0; transition: opacity .15s steps(2); }
.rs-row.on { opacity: 1; }
.rs-row span:nth-child(2) { color: #d8ffd2; text-align: right; } .rs-row span:nth-child(3) { color: #ffd27a; text-align: right; }
.rs-tot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding-top: 6px; border-top: 2px solid transparent; border-image: repeating-linear-gradient(90deg, rgba(141, 255, 122, .45) 0 6px, transparent 6px 9px) 2; }
.rs-tot b { font-weight: 400; font-size: 32px; line-height: 32px; color: #ffd27a; text-shadow: var(--text-ink-2); }
.rs-root .dz-unl { margin-top: 8px; }
.rs-keys { display: flex; gap: 8px 40px; justify-content: center; flex-wrap: wrap; margin-top: 14px; }
.rs-key { border: 6px solid transparent; border-image: var(--px-key) 5 fill / 6px; background: none; padding: 4px 14px 8px; min-height: 44px; cursor: pointer; color: #f3eedf; font: 26px/28px var(--font-new); text-shadow: 1px 1px 0 #050404; text-align: left; }
.rs-key:is(:hover, :focus-visible, .sel) { border-image-source: var(--px-key-hot); }
.rs-key:is(:active, .px-down) { border-image-source: var(--px-key-down); transform: translateY(2px); }
.rs-key small { display: block; font-size: 16px; line-height: 18px; color: #b8b09a; margin-left: 20px; text-shadow: var(--text-ink); }
.rs-key .ar { color: #ffd27a; margin-right: 6px; visibility: hidden; }
.rs-key.sel .ar, .rs-key:hover .ar, .rs-key:focus-visible .ar { visibility: visible; }
.rs-key.sel, .rs-key:hover { color: #ffe7a8; outline: none; }
@media (max-width: 600px) { .rs-key { font-size: 16px; line-height: 20px; } .rs-in { padding: 16px 16px 12px; } .rs-row { grid-template-columns: 1fr auto 3em; } }
`;
function css() { if (!document.getElementById('rs-css')) { const s = document.createElement('style'); s.id = 'rs-css'; s.textContent = CSS; document.head.appendChild(s); } }

/** install once per session: a run that ends alive files its report and shows the summary */
export function wireRunEnd(g: Game, p: Player, tracker: RunTracker) {
  css();
  let done = false;
  bus.on('runEnded', (e: { how?: string }) => {
    if (done || !p.isLocal || p.body.dead) return;
    done = true;
    let r: RunReport;
    try {
      const how = String(e?.how || '');
      const out = how.startsWith('transport:') ? `Passage out (${how.slice(10)})` : 'Out through the door';
      r = tracker.report(out);
      grantResearch(r.rp, 'run report');
      flushStats();
    } catch (err) { console.warn('run summary', err); return; }
    // the ending plays first; the summary rises over it
    setTimeout(() => showSummary(g, p, r), 9000);
  });
}

function showSummary(g: Game, p: Player, r: RunReport) {
  css();
  // the ending's own words step back under the plate
  for (const e of document.querySelectorAll<HTMLElement>('.dbt-end-inner, .k-ending-inner')) { e.style.transition = 'opacity 1s'; e.style.opacity = '0.25'; }
  const root = document.createElement('div');
  root.className = 'rs-root';
  const rows = r.lines.map((l) => `<div class="rs-row"><span>${esc(l.label)}</span><span>${esc(l.value)}</span><span>${l.rp ? '+' + l.rp : ''}</span></div>`).join('');
  root.innerHTML = `<div class="rs-in">
    <div class="rs-h"><span>MERIDIAN INSTITUTE · RUN REPORT · CLASSIFIED</span><span>RUN FILED</span></div>
    <span class="px-stamp green rs-stamp" style="--tilt:-9deg">Filed</span>
    <div class="rs-sub">UNIT <b>${esc(r.name.toUpperCase())}</b> · ${esc(r.cause.text.toUpperCase())}</div>
    <div class="rs-rows">${rows}</div>
    <div class="rs-tot"><span>RESEARCH POINTS</span><b>+${r.rp}</b></div>
    <div class="dz-unl on">${unlockHtml()}</div>
    <div class="rs-keys"></div>
  </div>`;
  document.body.appendChild(root);
  const keys = root.querySelector('.rs-keys') as HTMLElement;
  const btns: HTMLButtonElement[] = [];
  let focus = 0;
  const setFocus = (i: number) => { focus = (i + btns.length) % btns.length; btns.forEach((b, j) => b.classList.toggle('sel', j === focus)); };
  const mk = (label: string, hint: string, act: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rs-key';
    b.innerHTML = `<span class="ar">›</span>${esc(label)}<small>${esc(hint)}</small>`;
    b.addEventListener('pointerenter', () => { if (btns.indexOf(b) !== focus) sfx('hover', 0.6); setFocus(btns.indexOf(b)); });
    b.addEventListener('click', (e) => { e.stopPropagation(); sfx('confirm'); act(); });
    keys.appendChild(b); btns.push(b);
  };
  mk('To the lab', `spend ${researchPoints()} RP on upgrades`, () => goToLab());
  mk('New unit now', 'same file · straight back in', () => {
    const cfg = { mode: 'new' as const, name: p.name, app: p.app, occupation: p.occupation, traits: [...((p.body as unknown as { traits?: Set<string> }).traits ?? [])], sandbox: { ...(g.sandbox as Record<string, number>) }, seed: Math.floor(Math.random() * 1e9), directives: !!g.missions?.enabled };
    import('../../game/launch').then((m) => m.setLaunch(cfg)).catch(() => location.reload());
  });
  setFocus(0);
  const onKey = (e: KeyboardEvent) => {
    if (!root.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); setFocus(focus + 1); sfx('hover', 0.6); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocus(focus - 1); sfx('hover', 0.6); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); btns[focus]?.click(); }
  };
  window.addEventListener('keydown', onKey, true);
  // the plate behind it, drawn to the size the words came out at
  // round 16: a 3D machine housing behind the report (src/ui/machine), its keys 3D push keys
  const mx = mxOk();
  if (mx) {
    root.classList.add('mx');
    btns.forEach((b, i) => { mxSkinKey(b, { tone: i === 0 ? 'yellow' : 'olive', lamp: i === 0 ? 'green' : 'amber', screws: false, sound: 'plate' }); if (i === 0) b.classList.add('ink-d'); });
    mxFrame(root, (w, h) => { const s = panelSpec(w, h, { seed: 909, lamps: ['green', 'amber'], glands: 2, hazard: true, win: { l: 12, t: 12, r: 12, b: 12, cut: 6, lip: 4 } }); s.win!.back = true; return s; }, { pad: 16 });
  }
  requestAnimationFrame(() => {
    const W = Math.round(root.offsetWidth), H = Math.round(root.offsetHeight);
    if (W > 20 && H > 20 && !mx) {
      const k = hiCanvas(W, H);
      drawPlate(k.x, W, H, 909);
      for (const [sx, sy] of [[6, 6], [W - 7, 6], [6, H - 7], [W - 7, H - 7]] as const) screw(k.x, sx, sy);
      drawRecess(k.x, 12, 12, W - 24, H - 24, '#04130d');
      // the tube's scanlines
      k.x.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 15; y < H - 14; y += 2) k.x.fillRect(14, y, W - 28, 1);
      root.prepend(k.c);
    }
    root.classList.add('on');
    sfx('boot', 0.6);
    // the rows tick on one after another
    const els = [...root.querySelectorAll<HTMLElement>('.rs-row')];
    els.forEach((e, i) => setTimeout(() => { e.classList.add('on'); sfx('tick', 0.5); }, 400 + i * 160));
    setTimeout(() => { sfx('unlock', 0.8); btns[0]?.focus({ preventScroll: true }); }, 500 + els.length * 160);
  });
  if (import.meta.env.DEV) (window as unknown as { __runSummary: RunReport }).__runSummary = r;
  void G;
}

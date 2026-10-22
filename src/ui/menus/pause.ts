// Pause: time freezes (in co-op it keeps moving: "time does not stop for
// anyone"). The world behind goes grey and still; a column of riveted plates
// (btnKit.ts) hangs on the left like the title's, and the BAILIFF band's file
// comes up on a green phosphor terminal (terminal.ts): STATUS (number,
// programme, where you are, the debt, the body), SETTINGS, CONTROLS and, in
// co-op, the CREW. Esc goes back to STATUS, then resumes.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { saveGame } from '../../game/save';
import { zoneSpec } from '../../world/worldGraph';
import { occupationByKey } from '../../survival/traits';
import { suitNumber } from '../../entities/humanLooks';
import { h, optionsPanel, controlsPanel, esc, swapPage, confirmDialog, FocusNav, sfx } from './common';
import { bodyCanvas, moodleIcon, BODY_W, BODY_H } from '../moodles';
import { lossSummary } from '../../survival/limbs';
import { plateBtn, type PlateButton } from './btnKit';
import { terminal, type Terminal } from './terminal';
import './noir.css';

type Page = 'main' | 'options' | 'controls' | 'coop';
const NAMES: Record<Page, [string, string]> = { main: ['Status', 'the debtor\'s file'], options: ['Settings', 'Q / E change page'], controls: ['Controls', 'keys · touch · menus'], coop: ['Crew', 'who else is in here'] };

export class PauseMenu {
  el: HTMLDivElement | null = null;
  private nav: FocusNav | null = null;
  constructor() {
    bus.on('pauseMenu', () => (this.el ? this.close() : this.open()));
  }
  open(page: Page = 'main') {
    this.close(true);
    const solo = G.role === 'solo';
    if (solo) G.paused = true;
    const el = h('div', 'ps' + (solo ? '' : ' live'));
    const c = G.clock;
    const time = `Day ${c.day ?? Math.floor(c.hours / 24) + 1} · ${String(Math.floor(c.hours % 24)).padStart(2, '0')}:${String(Math.floor((c.hours % 1) * 60)).padStart(2, '0')}`;
    const p = G.local;
    const num = p ? suitNumber((p.rig as any)?.seed ?? 0) : 'D-____';
    const col = h('nav', 'ps-col');
    col.append(h('div', 'ps-head kf', `<b class="kf-cap">${solo ? 'Time held' : 'Time does not stop'}</b><small class="kf-it">${esc(time)} · ${solo ? 'nothing moves while the band projects' : 'the others are still out there'}</small>`));
    const pages: Page[] = ['main', 'options', 'controls', ...(G.net ? ['coop' as Page] : [])];
    let cur = Math.max(0, pages.indexOf(page));
    const t: Terminal = terminal({ title: `Bailiff · ${num}`, sub: NAMES[pages[cur]][0], cls: 'ps-term', model: 'Bailiff · Band link' });
    const pageBtns = new Map<Page, PlateButton>();
    const btn = (label: string, fn: () => void, o: Parameters<typeof plateBtn>[2] = {}) => {
      const b = plateBtn(label, fn, { size: 'md', full: true, pointer: true, ...o });
      col.append(b);
      return b;
    };
    btn('Resume', () => this.close(), { finish: 'olive', size: 'lg', sound: 'confirm' });
    if (G.role !== 'client') btn('Save tape', async () => { const ok = await saveGame(); G.ui?.toast?.(ok ? 'TAPE SAVED' : 'COULD NOT SAVE', ok ? 'progress written to this browser' : '', 2); this.close(); });
    for (const pg of pages) {
      const b = btn(NAMES[pg][0], () => select(pages.indexOf(pg)), { lamp: 'green', cls: 'ps-page' + (pg === 'main' ? ' ps-gap' : '') });
      pageBtns.set(pg, b);
    }
    btn('Quit to title', async () => {
      const ok = await confirmDialog({ title: 'Quit to title', body: G.role === 'client' ? 'Leave the room and go back to the title?' : 'Your progress is saved first, then the tape rewinds to the title.', ok: 'Quit', cancel: 'Stay', danger: true });
      if (!ok) return;
      if (G.role !== 'client') await saveGame();
      location.reload();
    }, { finish: 'oxblood', cls: 'ps-gap', sound: 'back' });

    let tabFn: ((d: -1 | 1) => void) | null = null;
    const render = (dir: 1 | -1 | 0) => {
      const pg = pages[cur];
      const frag = document.createDocumentFragment();
      tabFn = null;
      if (pg === 'main') frag.append(...this.mainPage(solo));
      else if (pg === 'options') frag.append(optionsPanel({ inGame: true, onTab: (fn) => { tabFn = fn; } }));
      else if (pg === 'controls') frag.append(controlsPanel());
      else if (pg === 'coop') frag.append(...this.coopPage());
      t.setHead(`Bailiff · ${num}`, NAMES[pg][0] + ' · ' + NAMES[pg][1]);
      for (const [k, b] of pageBtns) b.classList.toggle('on', k === pg);
      swapPage(t.body, frag, dir);
      t.body.scrollTop = 0;
    };
    const select = (i: number) => {
      i = (i + pages.length) % pages.length;
      if (i === cur) return;
      const d = i > cur ? 1 : -1;
      cur = i;
      sfx('key');
      render(d);
    };
    el.append(col, t.el);
    render(0);
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('on'));
    this.el = el;
    G.input.pointerOverUI = true;
    sfx(solo ? 'freeze' : 'open', 0.8);
    this.nav = new FocusNav(el, {
      onBack: () => (cur === 0 ? this.close() : select(0)),
      // Q/E switch the option sub-pages while on SETTINGS, the file's pages elsewhere
      onTab: (d) => (tabFn && pages[cur] === 'options' && document.activeElement && t.el.contains(document.activeElement) ? tabFn(d) : select(cur + d)),
      autofocus: col.querySelector('.pb') as HTMLElement,
    });
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });
  }

  private mainPage(solo: boolean): HTMLElement[] {
    const out: HTMLElement[] = [];
    const p = G.local;
    const z = p ? zoneSpec(p.zoneKey) : null;
    const ekg = h('div', 'ps-ekg', `<svg viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden="true"><polyline points="${solo ? '0,7 120,7' : '0,7 30,7 34,2 38,12 41,4 44,7 80,7 84,2 88,12 91,4 94,7 120,7'}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/></svg><span>${solo ? 'held' : Math.round(70 + (p?.body.panic ?? 0) * 0.8) + ' bpm'}</span>`);
    out.push(ekg);
    if (p) {
      const st = h('div', 'ps-grid');
      const d = G.debt as any;
      const rows: [string, string, boolean?][] = [
        ['Debtor', p.name],
        ['Programme', occupationByKey(p.occupation).name],
        ['Location', z?.name || p.zoneKey],
        ['Condition', p.body.dead ? 'DELETED' : p.body.downed ? 'DOWN' : 'ALIVE', p.body.downed],
      ];
      if (d?.on) {
        rows.push(['Debt', `${(d.remaining ?? 0).toLocaleString('en')} scrip owed · ${(d.paid ?? 0).toLocaleString('en')} paid`]);
        if (!d.cleared) rows.push(['Installment', `${d.installment ?? '?'}/${d.count ?? '?'} · ${(d.due ?? 0).toLocaleString('en')} due in ${Math.floor(d.hoursLeft ?? 0)} h`, (d.hoursLeft ?? 99) < 12]);
        else rows.push(['Debt', 'CLEARED']);
      }
      const lost = (p.body as any).severed?.length ? lossSummary((p.body as any).severed) : '';
      if (lost) rows.push(['Lost', lost, true]);
      for (const [k, v, warn] of rows) st.append(h('span', '', esc(k)), h('b', warn ? 'ct-warn' : '', esc(v)));
      out.push(st);
      // the body map and every status that is up, worst first
      const cond = h('div', 'ps-cond');
      try {
        const pc = bodyCanvas(p.body, 0.2);
        const cv = document.createElement('canvas'); cv.width = BODY_W; cv.height = BODY_H;
        cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
        cond.append(cv);
      } catch { /* body map unavailable */ }
      const moods = h('div', 'ps-moods');
      let list: { key: string; name: string; level: number; good?: boolean }[] = [];
      try { list = p.body.moodles(p.heavyLoad()).sort((a, b) => b.level - a.level); } catch { /* ignore */ }
      if (!list.length) moods.append(h('div', 'ps-mood ct-dim', 'Nothing troubling you.'));
      for (const m of list.slice(0, 8)) moods.append(h('div', 'ps-mood' + (m.level >= 3 && !m.good ? ' ct-warn' : ''), `<img src="${moodleIcon(m.key, m.level, !!m.good)}" alt=""><span>${esc(m.name)}</span>`));
      cond.append(moods);
      out.push(cond);
    }
    out.push(h('p', 't-note', solo ? 'The band holds time while it projects. It is the only kind thing it does.' : 'The simulation does not pause for anyone.'));
    return out;
  }

  private coopPage(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const n = G.net;
    if (!n) return out;
    out.push(h('p', 'ps-room', `Room <b>${esc(n.room)}</b>`));
    out.push(h('p', 't-note', n.isHost ? 'Give this code to friends. They join from the title screen with the same exchange address.' : 'Connected to the host.'));
    const list = h('div', 'ps-grid');
    for (const p of G.players.values()) list.append(h('span', '', esc(p.name)), h('b', p.body.downed || p.remote?.state?.down ? 'ct-warn' : '', `${p.isLocal ? 'you' : esc(p.zoneKey)}${p.body.downed || p.remote?.state?.down ? ' — DOWN' : ''}`));
    out.push(list);
    out.push(h('p', 't-note', `ping ${Math.round(n.ping)} ms · hold V to talk${n.voice.micError ? ' · mic: ' + esc(n.voice.micError) : ''}`));
    return out;
  }

  close(quiet = false) {
    if (!this.el) return;
    this.nav?.destroy(); this.nav = null;
    this.el.remove();
    this.el = null;
    G.paused = false;
    G.input.pointerOverUI = false;
    if (!quiet) sfx('back', 0.7);
  }
}

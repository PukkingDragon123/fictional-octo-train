// Pause: time freezes inside the BAILIFF band's hologram. The world behind
// goes grey and still (in co-op it keeps moving: "time does not stop for
// anyone"), a beam rises from the wrist band and the projection shows the
// debtor's file: number, programme, where they are, the debt, the body. Its
// pages are STATUS (resume / save / quit), SETTINGS, PROCEDURES and, in
// co-op, the CREW.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { saveGame } from '../../game/save';
import { zoneSpec } from '../../world/worldGraph';
import { occupationByKey } from '../../survival/traits';
import { suitNumber } from '../../entities/humanLooks';
import { h, optionsPanel, controlsPanel, esc, swapPage, confirmDialog, FocusNav, sfx, hoverFocus } from './common';
import { bodyCanvas, moodleIcon, BODY_W, BODY_H } from '../moodles';
import { lossSummary } from '../../survival/limbs';
import './diegetic.css';
import './desk.css';
import './noir.css';
import { uiSettings } from './settings';

type Page = 'main' | 'options' | 'controls' | 'coop';
const NAMES: Record<Page, string> = { main: 'STATUS', options: 'SETTINGS', controls: 'PROCEDURES', coop: 'CREW' };

export class PauseMenu {
  el: HTMLDivElement | null = null;
  private nav: FocusNav | null = null;
  private glitchT = 0;
  constructor() {
    bus.on('pauseMenu', () => (this.el ? this.close() : this.open()));
  }
  open(page: Page = 'main') {
    this.close(true);
    const solo = G.role === 'solo';
    if (solo) G.paused = true;
    const el = h('div', 'hp' + (solo ? '' : ' live'));
    const c = G.clock;
    const time = `DAY ${c.day ?? Math.floor(c.hours / 24) + 1} · ${String(Math.floor(c.hours % 24)).padStart(2, '0')}:${String(Math.floor((c.hours % 1) * 60)).padStart(2, '0')}`;
    el.append(
      h('div', 'hp-beam'), h('div', 'hp-band'),
      h('div', 'hp-frozen', solo ? `TIME HELD · ${time}<small>nothing moves while the band projects</small>` : `TIME DOES NOT STOP · ${time}<small>the others are still out there</small>`),
    );
    const panel = h('div', 'hp-panel holo nc-crt-dom' + (uiSettings().theme === 'amber' ? ' amber' : ''));
    const p = G.local;
    const num = p ? suitNumber((p.rig as any)?.seed ?? 0) : 'D-____';
    panel.append(h('div', 'hp-head', `<b>BAILIFF · ${esc(num)}</b><span>${esc(time)}</span>`));
    const pages: Page[] = ['main', 'options', 'controls', ...(G.net ? ['coop' as Page] : [])];
    let cur = Math.max(0, pages.indexOf(page));
    const tabRow = h('div', 'hp-tabs');
    tabRow.setAttribute('role', 'tablist');
    const tabBtns = pages.map((pg, i) => {
      const b = h('button', 'hp-tab' + (i === cur ? ' on' : ''), NAMES[pg]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      hoverFocus(b, '');
      b.onclick = () => select(i);
      tabRow.append(b);
      return b;
    });
    const body = h('div', 'hp-page');
    let tabFn: ((d: -1 | 1) => void) | null = null;
    const render = (dir: 1 | -1 | 0) => {
      const pg = pages[cur];
      const frag = document.createDocumentFragment();
      tabFn = null;
      if (pg === 'main') frag.append(...this.mainPage(solo));
      else if (pg === 'options') frag.append(optionsPanel({ inGame: true, onTab: (fn) => { tabFn = fn; } }));
      else if (pg === 'controls') frag.append(controlsPanel());
      else if (pg === 'coop') frag.append(...this.coopPage());
      swapPage(body, frag, dir);
      requestAnimationFrame(() => (body.querySelector('.hp-btn, button, input') as HTMLElement | null)?.focus({ preventScroll: true }));
    };
    const select = (i: number) => {
      i = (i + pages.length) % pages.length;
      if (i === cur) return;
      const d = i > cur ? 1 : -1;
      cur = i;
      tabBtns.forEach((b, j) => b.classList.toggle('on', j === i));
      sfx('tab');
      panel.classList.remove('glitch'); void panel.offsetWidth; panel.classList.add('glitch');
      render(d);
    };
    panel.append(tabRow, body);
    el.append(panel);
    render(0);
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('on'));
    this.el = el;
    G.input.pointerOverUI = true;
    sfx(solo ? 'freeze' : 'open', 0.8);
    this.nav = new FocusNav(panel, {
      onBack: () => (cur === 0 ? this.close() : select(0)),
      // Q/E switch the option sub-tabs while on SETTINGS, the projection's pages elsewhere
      onTab: (d) => (tabFn && pages[cur] === 'options' && document.activeElement && body.contains(document.activeElement) ? tabFn(d) : select(cur + d)),
    });
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });
    // the projection is not quite stable
    const glitch = () => {
      if (!this.el || this.el !== el) return;
      if (!document.documentElement.classList.contains('reduce-flash')) { panel.classList.remove('glitch'); void panel.offsetWidth; panel.classList.add('glitch'); }
      this.glitchT = window.setTimeout(glitch, 3000 + Math.random() * 6000);
    };
    this.glitchT = window.setTimeout(glitch, 2500);
  }

  private mainPage(solo: boolean): HTMLElement[] {
    const out: HTMLElement[] = [];
    const p = G.local;
    const z = p ? zoneSpec(p.zoneKey) : null;
    const ekg = h('div', 'hp-ekg', `<svg viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden="true"><polyline points="${solo ? '0,7 120,7' : '0,7 30,7 34,2 38,12 41,4 44,7 80,7 84,2 88,12 91,4 94,7 120,7'}" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/></svg><span>${solo ? 'HELD' : Math.round(70 + (p?.body.panic ?? 0) * 0.8) + ' BPM'}</span>`);
    out.push(ekg);
    if (p) {
      const st = h('div', 'hp-grid');
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
      for (const [k, v, warn] of rows) st.append(h('span', '', esc(k)), h('b', warn ? 'warn' : '', esc(v)));
      out.push(st);
      // the body map and every status that is up, worst first
      const cond = h('div', 'hp-cond');
      try {
        const pc = bodyCanvas(p.body, 0.2);
        const cv = document.createElement('canvas'); cv.width = BODY_W; cv.height = BODY_H;
        cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
        cond.append(cv);
      } catch { /* body map unavailable */ }
      const moods = h('div', 'hp-moods');
      let list: { key: string; name: string; level: number; good?: boolean }[] = [];
      try { list = p.body.moodles(p.heavyLoad()).sort((a, b) => b.level - a.level); } catch { /* ignore */ }
      if (!list.length) moods.append(h('div', 'hp-mood', 'Nothing troubling you.'));
      for (const m of list.slice(0, 8)) moods.append(h('div', 'hp-mood' + (m.level >= 3 && !m.good ? ' bad' : ''), `<img src="${moodleIcon(m.key, m.level, !!m.good)}" alt=""><span>${esc(m.name)}</span>`));
      cond.append(moods);
      out.push(cond);
    }
    const btns = h('div', 'hp-btns');
    const btn = (label: string, fn: () => void, cls = '', sub = '') => {
      const b = h('button', 'hp-btn ' + cls, `${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}`);
      b.type = 'button';
      hoverFocus(b);
      b.onclick = () => { sfx(cls === 'danger' ? 'back' : 'click'); fn(); };
      btns.append(b);
      return b;
    };
    btn('RELEASE TIME', () => this.close(), 'primary', 'esc');
    if (G.role !== 'client') btn('SAVE TAPE', async () => { const ok = await saveGame(); G.ui?.toast?.(ok ? 'TAPE SAVED' : 'COULD NOT SAVE', ok ? 'progress written to this browser' : '', 2); this.close(); });
    btn('QUIT TO TITLE', async () => {
      const ok = await confirmDialog({ title: 'QUIT TO TITLE', body: G.role === 'client' ? 'Leave the room and go back to the title?' : 'Your progress is saved first, then the tape rewinds to the title.', ok: 'Quit', cancel: 'Stay', danger: true });
      if (!ok) return;
      if (G.role !== 'client') await saveGame();
      location.reload();
    }, 'danger', G.role === 'client' ? '' : 'saves first');
    out.push(btns);
    out.push(h('div', 'hp-note', solo ? 'The band holds time while it projects. It is the only kind thing it does.' : 'The simulation does not pause for anyone.'));
    return out;
  }

  private coopPage(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const n = G.net;
    if (!n) return out;
    out.push(h('div', 't-room', `ROOM <b>${esc(n.room)}</b>`));
    out.push(h('div', 'hp-note', n.isHost ? 'Give this code to friends. They join from the title screen with the same exchange address.' : 'Connected to the host.'));
    const list = h('div', 'hp-grid');
    for (const p of G.players.values()) list.append(h('span', '', esc(p.name)), h('b', p.body.downed || p.remote?.state?.down ? 'warn' : '', `${p.isLocal ? 'you' : esc(p.zoneKey)}${p.body.downed || p.remote?.state?.down ? ' — DOWN' : ''}`));
    out.push(list);
    out.push(h('div', 'hp-note', `ping ${Math.round(n.ping)} ms · hold V to talk${n.voice.micError ? ' · mic: ' + esc(n.voice.micError) : ''}`));
    return out;
  }

  close(quiet = false) {
    if (!this.el) return;
    clearTimeout(this.glitchT);
    this.nav?.destroy(); this.nav = null;
    this.el.remove();
    this.el = null;
    G.paused = false;
    G.input.pointerOverUI = false;
    if (!quiet) sfx('back', 0.7);
  }
}

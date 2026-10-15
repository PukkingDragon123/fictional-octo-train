// Pause menu: a field terminal that powers on over the paused world.
// Tabs: status (resume / save / quit), options, controls and, in co-op, the room.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { saveGame } from '../../game/save';
import { zoneSpec } from '../../world/worldGraph';
import { occupationByKey } from '../../survival/traits';
import { h, mbtn, optionsPanel, controlsPanel, esc, frame, tabs, swapPage, confirmDialog, FocusNav, sfx, printIn } from './common';

type Page = 'main' | 'options' | 'controls' | 'coop';

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
    const el = h('div', 't-pause');
    const days = Math.floor(G.clock.hours / 24) + 1, hh = Math.floor(G.clock.hours % 24), mm = Math.floor((G.clock.hours % 1) * 60);
    const time = `DAY ${days} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const f = frame('Field terminal', '', time);
    el.append(f.el);
    const pages: Page[] = ['main', 'options', 'controls', ...(G.net ? ['coop' as Page] : [])];
    const names: Record<Page, string> = { main: 'STATUS', options: 'OPTIONS', controls: 'CONTROLS', coop: 'CO-OP' };
    let cur = Math.max(0, pages.indexOf(page));
    const body = h('div', 't-pause-page');
    let tabFn: ((d: -1 | 1) => void) | null = null;
    const render = (dir: 1 | -1 | 0) => {
      const p = pages[cur];
      const frag = document.createDocumentFragment();
      tabFn = null;
      if (p === 'main') frag.append(...this.mainPage(solo));
      else if (p === 'options') frag.append(optionsPanel({ inGame: true, onTab: (fn) => { tabFn = fn; } }));
      else if (p === 'controls') frag.append(controlsPanel());
      else if (p === 'coop') frag.append(...this.coopPage());
      swapPage(body, frag, dir);
      if (p === 'main') printIn([...body.querySelectorAll('.t-btn')] as HTMLElement[], 35);
      requestAnimationFrame(() => (body.querySelector('.t-tab.on, .t-btn, button, input') as HTMLElement | null)?.focus({ preventScroll: true }));
    };
    const t = tabs(pages.map((p) => names[p]), cur, (i) => { const d = i > cur ? 1 : -1; cur = i; render(d); });
    f.body.append(t.el, body);
    render(0);
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('on'));
    this.el = el;
    G.input.pointerOverUI = true;
    sfx('open', 0.8);
    this.nav = new FocusNav(f.el, {
      onBack: () => (cur === 0 ? this.close() : t.select(0)),
      // Q/E switch the option sub-tabs while on OPTIONS, the main tabs elsewhere
      onTab: (d) => (tabFn && pages[cur] === 'options' && document.activeElement && body.contains(document.activeElement) ? tabFn(d) : t.select(t.index + d)),
    });
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });
  }

  private mainPage(solo: boolean): HTMLElement[] {
    const out: HTMLElement[] = [];
    const p = G.local;
    const z = p ? zoneSpec(p.zoneKey) : null;
    out.push(h('div', 't-pause-big', solo ? 'SIMULATION PAUSED' : 'SIMULATION LIVE'));
    out.push(h('div', 't-pause-sub', solo ? 'Nothing moves while this terminal is up.' : 'The simulation does not pause for anyone.'));
    if (p) {
      const st = h('div', 't-pause-status');
      const rows: [string, string][] = [
        ['Subject', p.name],
        ['Assignment', occupationByKey(p.occupation).name],
        ['Location', z?.name || p.zoneKey],
        ['Condition', p.body.dead ? 'DELETED' : p.body.downed ? 'DOWN' : 'ALIVE'],
      ];
      for (const [k, v] of rows) st.append(h('span', '', esc(k)), h('b', '', esc(v)));
      out.push(st);
    }
    out.push(mbtn('Resume', () => this.close(), { key: 'ESC', primary: true }));
    if (G.role !== 'client') out.push(mbtn('Save', async () => { const ok = await saveGame(); G.ui?.toast?.(ok ? 'TAPE SAVED' : 'COULD NOT SAVE', ok ? 'progress written to this browser' : '', 2); this.close(); }));
    out.push(mbtn('Quit to title', async () => {
      const ok = await confirmDialog({ title: 'QUIT TO TITLE', body: G.role === 'client' ? 'Leave the room and go back to the title?' : 'Your progress is saved first, then the terminal returns to the title.', ok: 'Quit', cancel: 'Stay', danger: true });
      if (!ok) return;
      if (G.role !== 'client') await saveGame();
      location.reload();
    }, { sub: G.role === 'client' ? '' : 'saves first', danger: true }));
    return out;
  }

  private coopPage(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const n = G.net;
    if (!n) return out;
    out.push(h('div', 't-room', `ROOM <b>${esc(n.room)}</b>`));
    out.push(h('div', 't-note', n.isHost ? 'Give this code to friends. They join from the title screen with the same server address.' : 'Connected to the host.'));
    const list = h('div', 't-players');
    for (const p of G.players.values()) list.append(h('div', 't-pl', `${esc(p.name)} <small>${p.isLocal ? 'you' : esc(p.zoneKey)}${p.body.downed || p.remote?.state?.down ? ' — DOWN' : ''}</small>`));
    out.push(list);
    out.push(h('div', 't-note', `ping ${Math.round(n.ping)} ms · hold V to talk${n.voice.micError ? ' · mic: ' + esc(n.voice.micError) : ''}`));
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

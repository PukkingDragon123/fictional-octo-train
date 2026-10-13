// Pause menu: a clipboard that slides up over the paused world.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { saveGame } from '../../game/save';
import { h, mbtn, optionsPanel, controlsPanel, esc } from './common';

export class PauseMenu {
  el: HTMLDivElement | null = null;
  constructor() {
    bus.on('pauseMenu', () => (this.el ? this.close() : this.open()));
  }
  open(page: 'main' | 'options' | 'controls' | 'coop' = 'main') {
    this.close();
    const solo = G.role === 'solo';
    if (solo) G.paused = true;
    const el = h('div', 'k-pause');
    const board = h('div', 'k-clipboard');
    el.append(board);
    const clip = h('div', 'k-clip');
    board.append(clip);
    const sheet = h('div', 'k-sheet');
    board.append(sheet);
    const days = Math.floor(G.clock.hours / 24) + 1, hh = Math.floor(G.clock.hours % 24), mm = Math.floor((G.clock.hours % 1) * 60);
    sheet.append(h('div', 'k-sheet-head', `<b>MERIDIAN INSTITUTE</b><span>FIELD STATUS — DAY ${days}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span>`));
    const body = h('div', 'k-sheet-body');
    sheet.append(body);
    if (page === 'main') {
      body.append(h('div', 'k-sheet-sub', solo ? 'Simulation paused.' : 'The simulation does not pause for anyone.'));
      body.append(mbtn('Resume', () => this.close()));
      if (G.role !== 'client') body.append(mbtn('Save', async () => { const ok = await saveGame(); G.ui?.toast?.(ok ? 'SAVED' : 'COULD NOT SAVE', '', 2); this.close(); }));
      if (G.net) body.append(mbtn('Co-op', () => this.open('coop'), { sub: G.net.room ? 'room ' + G.net.room : '' }));
      body.append(mbtn('Options', () => this.open('options')));
      body.append(mbtn('Controls', () => this.open('controls')));
      body.append(mbtn('Quit to title', async () => { if (G.role !== 'client') await saveGame(); location.reload(); }, { sub: G.role === 'client' ? '' : 'saves first', danger: true }));
    } else {
      const back = mbtn('Back', () => this.open('main'));
      if (page === 'options') body.append(optionsPanel());
      if (page === 'controls') body.append(controlsPanel());
      if (page === 'coop' && G.net) {
        const n = G.net;
        body.append(h('div', 'k-room', `ROOM <b>${esc(n.room)}</b>`));
        body.append(h('div', 'k-sheet-sub', n.isHost ? 'Give this code to friends. They join from the title screen with the same server address.' : 'Connected to the host.'));
        const list = h('div', 'k-players');
        for (const p of G.players.values()) list.append(h('div', 'k-pl', `${esc(p.name)} <small>${p.isLocal ? 'you' : p.zoneKey}${p.body.downed || p.remote?.state?.down ? ' — DOWN' : ''}</small>`));
        body.append(list);
        body.append(h('div', 'k-sheet-sub', `ping ${Math.round(n.ping)} ms · hold V to talk${n.voice.micError ? ' · mic: ' + esc(n.voice.micError) : ''}`));
      }
      body.append(back);
    }
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('on'));
    this.el = el;
    G.input.pointerOverUI = true;
    el.addEventListener('mousedown', (e) => { if (e.target === el) this.close(); });
  }
  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    G.paused = false;
    G.input.pointerOverUI = false;
  }
}

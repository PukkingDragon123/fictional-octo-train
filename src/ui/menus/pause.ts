// Pause (round 15 remake): a cinematic hold. The world behind drains to grey
// and still under a vignette, black letterbox bars slide in top and bottom
// (TIME HELD, the day, the hour, where you are; the unit's number), and a
// column of riveted steel menu plates (src/ui/pxKit.ts: hi-res pixel art,
// chamfered, an amber lamp on the one you are on) slides in on the left. The
// debtor's file comes up on the phosphor terminal on the right: STATUS (number,
// programme, where you are, the debt, the body), SETTINGS (pages turned by the
// steel gear train), CONTROLS and, in co-op, the CREW. Esc goes back to
// STATUS, then resumes. (In co-op time keeps moving: "time does not stop".)
import { purseLine } from '../../game/economy/money';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { saveGame } from '../../game/save';
import { zoneSpec } from '../../world/worldGraph';
import { occupationByKey } from '../../survival/traits';
import { talentLine } from '../../survival/talents';
import { suitNumber } from '../../entities/humanLooks';
import { h, optionsPanel, controlsPanel, esc, swapPage, confirmDialog, FocusNav, sfx, type OptionsApi } from './common';
import { bodyCanvas, moodleIcon, BODY_W, BODY_H } from '../moodles';
import { lossSummary } from '../../survival/limbs';
import { gearCluster, type GearCluster } from './gears3d';
import { terminal, type Terminal } from './terminal';
import { pxButton, pxBanner, pxAccessLog, pxSerialEl, nodeId, type PxButton } from '../pxKit';
import { mxFrame, panelSpec, mxGauge, mxArrive } from '../machine/kit';
import { mxOk } from '../machine/core';
import { mxMount, type IconKind } from '../machine/decor';
import './diegetic.css';
import './noir.css';
import './pause.css';

type Page = 'main' | 'options' | 'controls' | 'coop';
const NAMES: Record<Page, [string, string]> = { main: ['Status', 'the debtor\'s file'], options: ['Settings', 'Q / E change page'], controls: ['Controls', 'keys · touch · menus'], coop: ['Crew', 'who else is in here'] };

export class PauseMenu {
  el: HTMLDivElement | null = null;
  private nav: FocusNav | null = null;
  private cluster: GearCluster | null = null;
  constructor() {
    // round 17: Esc / MENU put up the band desktop (src/ui/bandos); this console answers to 'pauseMenuClassic'
    bus.on('pauseMenuClassic', () => (this.el ? this.close() : this.open()));
  }
  open(page: Page = 'main') {
    this.close(true);
    const solo = G.role === 'solo';
    if (solo) G.paused = true;
    const el = h('div', 'ps2' + (solo ? '' : ' live'));
    const c = G.clock;
    const time = `Day ${c.day ?? Math.floor(c.hours / 24) + 1} · ${String(Math.floor(c.hours % 24)).padStart(2, '0')}:${String(Math.floor((c.hours % 1) * 60)).padStart(2, '0')}`;
    const p = G.local;
    const num = p ? suitNumber((p.rig as any)?.seed ?? 0) : 'D-____';
    const z0 = p ? zoneSpec(p.zoneKey) : null;
    const top = h('div', 'ps2-bar top', `<div class="ps2-title"><b>${solo ? 'Time held' : 'Time does not stop'}</b><small>${esc(time)}${z0?.name ? ' · ' + esc(z0.name) : ''}</small></div><div class="ps2-id">${esc(num)}</div>`);
    const bot = h('div', 'ps2-bar bot', `<span class="ps2-hint">${solo ? 'nothing moves while the band projects' : 'the others are still out there'}</span><span class="ps2-hint">Esc resume · Q E pages</span>`);
    top.querySelector('.ps2-id')?.replaceChildren(pxSerialEl('UNIT ' + num));
    top.prepend(pxBanner());
    bot.replaceChildren(pxAccessLog(nodeId(3)), h('span', 'ps2-hint', 'Esc resume · Q E pages'));
    const col = h('nav', 'ps2-col');
    const pages: Page[] = ['main', 'options', 'controls', ...(G.net ? ['coop' as Page] : [])];
    let cur = Math.max(0, pages.indexOf(page));
    const right = h('div', 'ps-right ps2-right');
    const t: Terminal = terminal({ title: `Bailiff · ${num}`, sub: NAMES[pages[cur]][0], cls: 'ps-term', model: 'Bailiff · Band link' });
    const gearSlot = h('div', 'ps-gears');
    right.append(gearSlot, t.el);
    const pageBtns = new Map<Page, PxButton>();
    const pt = window.innerHeight > window.innerWidth * 1.05 || window.innerWidth < 720;
    const bw = pt ? 150 : 244, bh = pt ? 30 : 36;
    const plate = (label: string, fn: () => void, o: Parameters<typeof pxButton>[2] = {}) => {
      const b = pxButton(label, fn, { w: bw, h: bh, sound: o.lamp === 'red' ? 'lever' : 'plate', ...o });
      col.append(b);
      return b;
    };
    plate('Resume', () => this.close(), { tone: 'olive', lamp: 'green', icon: 'play' });
    if (G.role !== 'client') plate(pt ? 'Save' : 'Save tape', async () => { const ok = await saveGame(); G.ui?.toast?.(ok ? 'TAPE SAVED' : 'COULD NOT SAVE', ok ? 'progress written to this browser' : '', 2); this.close(); }, { icon: 'tape' });
    col.append(h('i', 'ps2-gap'));
    const PAGE_ICON: Record<Page, IconKind> = { main: 'clipboard', options: 'gear', controls: 'key', coop: 'radio' };
    for (const pg of pages) pageBtns.set(pg, plate(NAMES[pg][0], () => select(pages.indexOf(pg)), { icon: PAGE_ICON[pg] }));
    // round 17: the emote jukebox (buy emotes for dollars, fill the wheel)
    plate(pt ? 'Emotes' : 'Emote jukebox', () => { void import('../../social/emotes/shop').then((m) => m.openEmoteShop()); }, { icon: 'coin' });
    col.append(h('i', 'ps2-gap'));
    plate(pt ? 'Quit' : 'Quit to title', async () => {
      const ok = await confirmDialog({ title: 'Quit to title', body: G.role === 'client' ? 'Leave the room and go back to the title?' : 'Your progress is saved first, then the tape rewinds to the title.', ok: 'Quit', cancel: 'Stay', danger: true });
      if (!ok) return;
      if (G.role !== 'client') await saveGame();
      location.reload();
    }, { tone: 'red', lamp: 'red', cls: 'danger', icon: 'door' });

    let tabFn: ((d: -1 | 1) => void) | null = null;
    const render = (dir: 1 | -1 | 0) => {
      const pg = pages[cur];
      const frag = document.createDocumentFragment();
      tabFn = null;
      this.cluster?.dispose(); this.cluster = null;
      gearSlot.innerHTML = '';
      right.classList.toggle('with-gears', pg === 'options');
      if (pg === 'main') frag.append(...this.mainPage(solo));
      else if (pg === 'options') {
        let api: OptionsApi | null = null;
        frag.append(optionsPanel({ inGame: true, hideTabs: true, onTab: (fn) => { tabFn = fn; }, onApi: (a) => { api = a; } }));
        const a = api as OptionsApi | null;
        if (a) {
          const cl = gearCluster(a.pages.map((x) => x[0] + x.slice(1).toLowerCase()), (i) => { if (a.index !== i) a.select(i); }, a.index);
          a.onChange((i) => { if (cl.index !== i) cl.select(i, true); });
          gearSlot.append(cl.el);
          if (mxOk() && !gearSlot.classList.contains('mxf')) mxFrame(gearSlot, (w, hh) => { const s = panelSpec(w, hh, { title: 'PAGE', seed: 31, lamps: ['amber'], glands: 1, hazard: false, vents: false, win: { l: 8, t: 26, r: 8, b: 12, cut: 5, lip: 3 } }); s.win!.back = true; return s; }, { pad: 12, grow: { l: 10, t: 30, r: 118, b: 10 } });
          this.cluster = cl;
          tabFn = (d) => cl.turn(d);
          requestAnimationFrame(() => cl.layout(window.innerHeight > window.innerWidth * 1.05 ? 'h' : 'v'));
        }
      }
      else if (pg === 'controls') frag.append(controlsPanel());
      else if (pg === 'coop') frag.append(...this.coopPage());
      t.setHead(`Bailiff · ${num}`, NAMES[pg][0] + ' · ' + NAMES[pg][1]);
      // the settings open the tube's switch deck: knobs, bat toggles and latching keys on dark enamel
      if (mxOk()) t.screen.classList.toggle('ct-deck', pg === 'options');
      for (const [k, b] of pageBtns) b.setOn(k === pg);
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
    // round 16: the column is a control console of its own (3D housing, a time gauge at its foot)
    if (mxOk()) {
      col.classList.add('mx');
      const foot = h('div', 'ps2-foot');
      const g = mxGauge(50, solo ? 0 : 0.55, 'TIME');
      if (g) foot.append(g);
      foot.append(h('span', 'ps2-foot-l', solo ? 'Time held<small>band projecting</small>' : 'Time running<small>co-op link</small>'));
      col.append(foot);
      mxFrame(col, (w, hh) => { const s = panelSpec(w, hh, { title: 'OPERATOR CONTROL', seed: 23, lamps: ['green', 'amber'], glands: 2, hazard: true, top: 40, bot: 18 }); return s; }, { pad: 16 });
      // the little things round the console: a spanner on its peg, the specimen jar in the gap (it watches the
      // pointer), a beacon on the terminal's hood that turns when something is wrong (debt overdue, the unit down)
      if (!pt) {
        mxMount(col, 'wrench', { right: -24, top: 64, z: 3 });
        const jar = mxMount(right, 'jar', { left: -142, bottom: 4, z: 3 }, { title: 'Specimen 07', s: 1.4 });
        jar?.el.classList.add('ps2-jar');
        const d = G.debt as any, p = G.local;
        const bad = !!p && (p.body.downed || p.body.dead || (!!d?.on && !d.cleared && (d.hoursLeft ?? 99) < 12));
        mxMount(t.el, 'beacon', { right: 66, top: 3, z: 6 }, { col: bad ? 'red' : 'amber', alert: bad });
      }
    }
    el.append(right, col, top, bot);
    render(0);
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('on'));
    if (mxOk()) setTimeout(() => sfx('clamp', 0.4), 380);
    this.el = el;
    G.input.pointerOverUI = true;
    sfx(solo ? 'freeze' : 'open', 0.8);
    this.nav = new FocusNav(el, {
      onBack: () => (cur === 0 ? this.close() : select(0)),
      // Q/E switch the option sub-pages while on SETTINGS, the file's pages elsewhere
      onTab: (d) => (tabFn && pages[cur] === 'options' ? tabFn(d) : select(cur + d)),
      autofocus: col.querySelector('.pxb') as HTMLElement,
    });
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });
  }

  private mainPage(solo: boolean): HTMLElement[] { return statusPage(solo); }
  private coopPage(): HTMLElement[] { return crewPage(); }


  close(quiet = false) {
    if (!this.el) return;
    this.nav?.destroy(); this.nav = null;
    this.cluster?.dispose(); this.cluster = null;
    this.el.remove();
    this.el = null;
    G.paused = false;
    G.input.pointerOverUI = false;
    if (!quiet) sfx('back', 0.7);
  }
}

/** the debtor's file: the status page (the pause's first page, and the band desktop's Status app) */
export function statusPage(solo: boolean): HTMLElement[] {
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
      // the talent marbles weighed on the bench (survival/talents.ts)
      ['Talent', talentLine(p.body)],
      ['Location', z?.name || p.zoneKey],
      ['Condition', p.body.dead ? 'DELETED' : p.body.downed ? 'DOWN' : 'ALIVE', p.body.downed],
    ];
    if (d?.on) {
      rows.push(['Debt', `${(d.remaining ?? 0).toLocaleString('en')} credits owed · ${(d.paid ?? 0).toLocaleString('en')} paid`]);
      rows.push(['Purse', purseLine(d.cleared ? (d.surplus ?? 0) : null)]);
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
/** who else is in here (co-op) */
export function crewPage(): HTMLElement[] {
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

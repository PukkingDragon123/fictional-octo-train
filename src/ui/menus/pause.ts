// Pause (round 15 remake): a cinematic hold. The world behind drains to grey
// and still under a vignette, black letterbox bars slide in top and bottom
// (TIME HELD, the day, the hour, where you are; the unit's number), and a
// column of riveted steel menu plates (src/ui/pxKit.ts: hi-res pixel art,
// chamfered, an amber lamp on the one you are on) slides in on the left. The
// debtor's file comes up on the phosphor terminal on the right: STATUS (number,
// programme, where you are, the debt, the body), SETTINGS (pages turned by the
// steel gear train), CONTROLS and, in co-op, the CREW. Esc goes back to
// STATUS, then resumes. (In co-op time keeps moving: "time does not stop".)
import { dollars } from '../../game/economy/money';
import { researchPoints } from '../../game/research';
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
import { pxButton, pxAccessLog, pxSerialEl, nodeId } from '../pxKit';
import { mxFrame, panelSpec, mxGauge, mxArrive } from '../machine/kit';
import { mxOk } from '../machine/core';
import { mxMount, mxIcon, type IconKind } from '../machine/decor';
import { iconKey, iconBanner } from './iconKey';
import { creditAmount } from '../creditIcon';
import { isDesktop, desktopQuit } from '../../platform/desktop';
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
    // Esc: this console, time held. The wrist terminal (src/ui/bandos) is Tab and the phone's MENU key, in real time.
    const flip = () => (this.el ? this.close() : this.open());
    bus.on('pauseMenu', flip);
    bus.on('pauseMenuClassic', flip);
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
    const bot = h('div', 'ps2-bar bot');
    top.querySelector('.ps2-id')?.replaceChildren(pxSerialEl('UNIT ' + num));
    // round 21: the banner is the crest and the clearance lamps (names on hover), the foot only the access log
    top.prepend(iconBanner());
    bot.replaceChildren(pxAccessLog(nodeId(3)));
    const col = h('nav', 'ps2-col');
    const pages: Page[] = ['main', 'options', 'controls', ...(G.net ? ['coop' as Page] : [])];
    let cur = Math.max(0, pages.indexOf(page));
    const right = h('div', 'ps-right ps2-right');
    const t: Terminal = terminal({ title: num, sub: '', cls: 'ps-term', model: 'Bailiff · Band link' });
    const gearSlot = h('div', 'ps-gears');
    right.append(gearSlot, t.el);
    const pageBtns = new Map<Page, { setOn(on: boolean): void }>();
    const pt = window.innerHeight > window.innerWidth * 1.05 || window.innerWidth < 720;
    // round 21: the column's plates are icon keys in pairs (a model on each cap; the name floats while hot)
    const kw = pt ? 58 : 84, kh = pt ? 40 : 46;
    let pair: HTMLElement | null = null;
    const plate = (label: string, fn: () => void, o: { tone?: 'olive' | 'yellow' | 'red'; lamp?: 'amber' | 'green' | 'red'; icon: IconKind; cls?: string; hint?: string }) => {
      const b = mxOk()
        ? iconKey(o.icon, label, fn, { w: kw, h: kh, tone: o.tone ?? 'olive', lamp: o.lamp ?? 'amber', sound: o.lamp === 'red' ? 'lever' : 'plate', cls: 'pxb ps2-ik' + (pt ? ' ikk-sm' : '') + (o.cls ? ' ' + o.cls : ''), nameAt: pt ? 'bottom' : 'right', hint: o.hint, seed: 80 + col.childElementCount })
        : pxButton(label, fn, { w: 150, h: 30, lamp: o.lamp, icon: o.icon, cls: o.cls });
      if (!pair || pair.childElementCount >= 2) { pair = h('div', 'ps2-pair'); col.append(pair); }
      pair.append(b);
      if (pair.childElementCount === 1) b.style.setProperty('--ik-push', kw + 8 + 'px');
      return b as unknown as { setOn(on: boolean): void };
    };
    const gap = () => { pair = null; col.append(h('i', 'ps2-gap')); };
    plate('Resume', () => this.close(), { tone: 'yellow', lamp: 'green', icon: 'play', hint: 'Esc' });
    if (G.role !== 'client') plate('Save tape', async () => { const ok = await saveGame(); G.ui?.toast?.(ok ? 'TAPE SAVED' : 'COULD NOT SAVE', '', 2); this.close(); }, { icon: 'tape' });
    gap();
    const PAGE_ICON: Record<Page, IconKind> = { main: 'clipboard', options: 'gear', controls: 'joystick', coop: 'walkie' };
    for (const pg of pages) pageBtns.set(pg, plate(NAMES[pg][0], () => select(pages.indexOf(pg)), { icon: PAGE_ICON[pg] }));
    // round 17: the emote jukebox (buy emotes for dollars, fill the wheel)
    plate('Emote jukebox', () => { void import('../../social/emotes/shop').then((m) => m.openEmoteShop()); }, { icon: 'reel' });
    gap();
    plate('Back to the lab', async () => {
      const ok = await confirmDialog({ title: 'Back to the lab', body: G.role === 'client' ? 'Leave the room and go back to the lab?' : 'Saved first. The link drops and you are back in the lab.', ok: 'Go back', cancel: 'Stay', danger: true });
      if (!ok) return;
      if (G.role !== 'client') await saveGame();
      // round 24: the link drops on screen first (src/game/cine/actcine.ts)
      this.close();
      try { await (await import('../../game/cine/actcine')).playUnlink(); } catch { /* straight out */ }
      location.reload();
    }, { tone: 'red', lamp: 'red', cls: 'danger', icon: 'door' });
    // the desktop build: save and close the program
    if (isDesktop()) plate('Quit', async () => {
      const ok = await confirmDialog({ title: 'Quit to desktop', body: G.role === 'client' ? 'Leave the room and close the game?' : 'Saved first, then the game closes.', ok: 'Quit', cancel: 'Stay', danger: true });
      if (!ok) return;
      if (G.role !== 'client') await saveGame();
      desktopQuit();
    }, { tone: 'red', lamp: 'red', cls: 'danger', icon: 'plug' });
    pair = null;

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
      t.setHead(num, '');
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
      col.append(foot);
      mxFrame(col, (w, hh) => { const s = panelSpec(w, hh, { seed: 23, lamps: ['green', 'amber'], glands: 2, hazard: true, top: 40, bot: 18 }); return s; }, { pad: 16 });
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
      autofocus: col.querySelector('.pxb, .ikk') as HTMLElement,
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
    // round 21: each row's name is a little model (the name on hover); credits are the spinning coin
    type V = string | (string | HTMLElement)[];
    const rows: [string, IconKind, V, boolean?][] = [
      ['Debtor', 'dossier', p.name],
      ['Programme', 'clipboard', occupationByKey(p.occupation).name],
      // the talent marbles weighed on the bench (survival/talents.ts)
      ['Talent', 'scale', talentLine(p.body)],
      ['Location', 'map', z?.name || p.zoneKey],
      ['Condition', 'crt', p.body.dead ? 'DELETED' : p.body.downed ? 'DOWN' : 'ALIVE', p.body.downed],
    ];
    if (d?.on) {
      // numbers, not sentences
      rows.push(['Debt', 'credit', [creditAmount(-(d.remaining ?? 0), 16), ' · ', creditAmount(d.paid ?? 0, 16), ' paid']]);
      const rp = ` · ${researchPoints()} RP`;
      rows.push(['Purse', 'ledger', d.cleared ? [creditAmount(d.surplus ?? 0, 16), ' · ', creditAmount(dollars(), 16), rp] : [creditAmount(dollars(), 16), rp]]);
      if (!d.cleared) rows.push(['Installment', 'phone', [`${d.installment ?? '?'}/${d.count ?? '?'} · `, creditAmount(d.due ?? 0, 16), ` · ${Math.floor(d.hoursLeft ?? 0)} h`], (d.hoursLeft ?? 99) < 12]);
      else rows.push(['Debt', 'credit', 'CLEARED']);
    }
    const lost = (p.body as any).severed?.length ? lossSummary((p.body as any).severed) : '';
    if (lost) rows.push(['Lost', 'skull', lost, true]);
    for (const [k, ic, v, warn] of rows) {
      const lab = h('span', 'ps-ic');
      const cv = mxOk() ? mxIcon(ic, 20) : null;
      if (cv) { lab.append(cv); lab.title = k; lab.setAttribute('aria-label', k); } else lab.textContent = k;
      const val = h('b', warn ? 'ct-warn' : '');
      if (typeof v === 'string') val.textContent = v; else val.append(...v);
      st.append(lab, val);
    }
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
    if (!list.length) moods.append(h('div', 'ps-mood ct-dim', '-'));
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

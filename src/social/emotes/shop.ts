// THE JUKEBOX: the Institute's staff emote dispenser, a coin-op cabinet in the
// machine kit (src/ui/machine). A marquee with chasing bulbs and a research-point
// counter; behind glass, the unit on a turntable doing the selected emote on a
// loop (a live HumanRig with its props and sparks: src/social/emotes/stage.ts)
// with a paper price tag on a string; the record's plate (name, rarity, blurb)
// and the BUY / WHEEL keys; the selector (every record with a little live film,
// its code, price, owned and on-the-wheel marks); and the wheel's eight sockets
// along the foot. Buying drops a coin through the cabinet, chases the bulbs,
// takes the points and puts the record on the wheel (the first free socket).
// Pay: research points (src/game/research.ts, the lab commissary's currency).
//
//   openEmoteShop({ onClose? })   from the emote wheel, the pause menu and the lab menu
import { G } from '../../game/G';
import { mxFrame, panelSpec, mxButton, type MxButton } from '../../ui/machine/kit';
import { mxOk } from '../../ui/machine/core';
import { mxIcon, mxMount } from '../../ui/machine/decor';
import { sfx } from '../../ui/menus/sfx';
import { FocusNav } from '../../ui/menus/nav';
import { EMOTES_ALL, emoteInfo, owns, buyEmote, wheelSlots, setSlot, slotOf, balance, RARITY, onEmotes, type EmoteInfo } from './catalog';
import { EmoteStage, emoteSheet, sheetNow, sheetFrame, stageOk } from './stage';
import { playSample } from './sound';
import './emotes.css';

let open: { close(): void } | null = null;
export const emoteShopOpen = () => !!open;

export function openEmoteShop(o: { onClose?: () => void; select?: string } = {}) {
  if (open) return;
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  const g = G as unknown as { role?: string; paused?: boolean; input?: { pointerOverUI: boolean } } | null;
  const solo = !!g && g.role === 'solo';
  const wasPaused = !!g?.paused;
  if (solo && g) g.paused = true;
  if (g?.input) g.input.pointerOverUI = true;

  const root = h('div', 'ej');
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'The Jukebox: emotes for research points');
  const cab = h('div', 'ej-cab');
  root.append(cab);
  // ---- marquee
  const marq = h('div', 'ej-marq');
  const title = h('h2', '', 'THE JUKEBOX<small>STAFF EMOTE DISPENSER · PAY IN RESEARCH</small>');
  const bulbs = h('div', 'ej-bulbs');
  for (let i = 0; i < 12; i++) bulbs.append(h('i'));
  const rp = h('div', 'ej-rp', `<b>${balance()}</b><small>RESEARCH PTS</small>`);
  marq.append(title, bulbs, rp);
  // ---- stage
  const stageCol = h('div', 'ej-stage');
  const view = h('div', 'ej-view');
  const glass = h('div', 'ej-glass');
  const cv = h('canvas');
  const tag = h('div', 'ej-tag');
  const coin = h('div', 'ej-coin');
  const coinIc = mxOk() ? mxIcon('coin', 26) : null;
  if (coinIc) coin.append(coinIc);
  const note = h('div', 'ej-note');
  view.append(glass, cv, tag, coin, note);
  const info = h('div', 'ej-info');
  const nameEl = h('h3');
  const rar = h('span', 'ej-rar');
  const blurb = h('p', 'ej-blurb');
  const acts = h('div', 'ej-acts');
  const buy = mxButton('BUY', () => doBuy(), { w: 138, h: 46, tone: 'yellow', lamp: 'green', sound: '', cls: 'ej-buy', icon: mxOk() ? mxIcon('coin', 24) : null });
  const equip = mxButton('ON WHEEL', () => armSlots(), { w: 138, h: 34, tone: 'olive', lamp: 'amber', sound: 'key', cls: 'ej-eq' });
  acts.append(buy, equip);
  info.append(nameEl, acts, rar, blurb);
  stageCol.append(view, info);
  // ---- selector
  const list = h('div', 'ej-list');
  const tabs = h('div', 'ej-tabs');
  const grid = h('div', 'ej-grid');
  list.append(tabs, grid);
  let filter: 'all' | 'owned' | 'new' = 'all';
  const tabKeys: MxButton[] = [];
  (['all', 'new', 'owned'] as const).forEach((f) => {
    const k = mxButton(f === 'all' ? 'ALL RECORDS' : f === 'new' ? 'NOT OWNED' : 'OWNED', () => { filter = f; tabKeys.forEach((t, i) => t.setOn(i === ['all', 'new', 'owned'].indexOf(f))); build(); }, { w: f === 'all' ? 128 : 112, h: 30, tone: 'dark', lamp: 'green', sound: 'key' });
    tabs.append(k); tabKeys.push(k);
  });
  tabKeys[0].setOn(true);
  // ---- the wheel's sockets
  const slots = h('div', 'ej-slots');
  slots.append(h('small', '', 'THE WHEEL<br>8 SOCKETS'));
  const socks: { b: HTMLButtonElement; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; label: HTMLElement }[] = [];
  for (let i = 0; i < 8; i++) {
    const b = h('button', 'ej-sock'); b.type = 'button';
    const c = h('canvas'); c.width = 80; c.height = 88;
    const lab = h('span'); const num = h('i', '', String(i + 1));
    b.append(c, num, lab);
    b.addEventListener('click', () => onSock(i));
    slots.append(b);
    socks.push({ b, cv: c, ctx: c.getContext('2d')!, label: lab });
  }
  const close = mxButton('CLOSE', () => shut(), { w: 96, h: 30, tone: 'red', lamp: 'red', sound: 'back', cls: 'ej-close' });
  cab.append(marq, stageCol, list, slots, close);
  document.body.append(root);
  if (mxOk()) {
    mxFrame(cab, (w, hh) => panelSpec(w, hh, { title: 'MERIDIAN · STAFF AMENITIES', seed: 87, lamps: ['green', 'amber', 'red'], glands: 2, hazard: true, top: 40, bot: 20, vents: true, handles: true }), { pad: 18 });
    mxFrame(view, (w, hh) => { const s = panelSpec(w, hh, { seed: 88, lamps: [], glands: 0, hazard: false, vents: false, handles: false, win: { l: 8, t: 8, r: 8, b: 8, cut: 6, lip: 3 } }); s.win!.back = true; return s; }, { pad: 10, over: true });
    if (innerWidth > 760) { mxMount(cab, 'gears', { left: -30, bottom: 70, z: 3 }); mxMount(cab, 'beacon', { right: 120, top: -6, z: 7 }, { col: 'amber', alert: true }); }
  }
  requestAnimationFrame(() => root.classList.add('on'));
  sfx('open', 0.8);
  playSample('vend', 0.35);

  // ---- the live turntable
  const stage = stageOk() ? new EmoteStage({ turntable: true }) : null;
  if (stage) { stage.audible = true; stage.frame(1.05, 6.4, 30, 0.75); }
  let sel = o.select && emoteInfo(o.select) ? o.select : (EMOTES_ALL.find((e) => !owns(e.id)) ?? EMOTES_ALL[0]).id;
  let arm = false;

  const recs = new Map<string, { b: HTMLButtonElement; c: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();
  function build() {
    grid.innerHTML = ''; recs.clear();
    const items = EMOTES_ALL.filter((e) => filter === 'all' || (filter === 'owned' ? owns(e.id) : !owns(e.id)));
    for (const e of items) {
      const b = h('button', 'ej-rec'); b.type = 'button';
      b.style.setProperty('--rar', RARITY[e.rarity].col);
      const c = h('canvas'); c.width = 96; c.height = 132;
      const t = h('span', 'ej-r-t');
      t.append(h('span', 'ej-code', `${e.code} · ${RARITY[e.rarity].label}`), h('span', 'ej-nm', e.name), h('span', 'ej-pr' + (owns(e.id) ? ' own' : ''), owns(e.id) ? 'OWNED' : e.price ? `${e.price} RP` : 'FREE'));
      b.append(h('span', 'ej-strip'), c, t);
      if (slotOf(e.id) >= 0) b.append(h('span', 'ej-eq', 'WHEEL ' + (slotOf(e.id) + 1)));
      b.setAttribute('aria-label', `${e.code} ${e.name}, ${RARITY[e.rarity].label}, ${owns(e.id) ? 'owned' : e.price + ' research points'}`);
      b.addEventListener('click', () => { select(e.id); });
      b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') sfx('tick', 0.3); });
      grid.append(b);
      recs.set(e.id, { b, c, ctx: c.getContext('2d')! });
      if (stageOk()) void emoteSheet(e.anim, c.width, c.height);
    }
    mark();
  }
  function mark() { for (const [id, r] of recs) r.b.classList.toggle('sel', id === sel); }
  function select(id: string, quiet = false) {
    sel = id;
    const e = emoteInfo(id)!;
    nameEl.textContent = e.name;
    rar.textContent = RARITY[e.rarity].label; rar.style.setProperty('--rar', RARITY[e.rarity].col);
    blurb.textContent = e.blurb;
    const own = owns(id);
    tag.innerHTML = own ? 'OWNED<small>ON THE SHELF</small>' : `${e.price} RP<small>${e.code} · ${RARITY[e.rarity].label}</small>`;
    tag.classList.toggle('owned', own);
    buy.querySelector('.mxb-t')!.textContent = own ? 'OWNED' : `BUY ${e.price}`;
    buy.disabled = own;
    const s = slotOf(id);
    equip.querySelector('.mxb-t')!.textContent = !own ? 'PREVIEW' : s >= 0 ? `WHEEL ${s + 1}` : 'ON WHEEL';
    equip.disabled = !own;
    stage?.play(e.anim);
    mark();
    disarm();
    if (!quiet) sfx('key', 0.5);
  }
  function say(t: string, ms = 1800) { note.textContent = t; note.classList.add('on'); clearTimeout((note as unknown as { _t?: number })._t); (note as unknown as { _t?: number })._t = window.setTimeout(() => note.classList.remove('on'), ms); }
  let chase = 0;
  function doBuy() {
    const e = emoteInfo(sel); if (!e) return;
    const r = buyEmote(e.id);
    if (r === 'poor') { sfx('error', 0.8); say(`NOT ENOUGH RESEARCH · NEED ${e.price - balance()} MORE`); return; }
    if (r !== 'ok') return;
    // the coin goes in, the bulbs chase, the record drops
    coin.classList.remove('drop'); void coin.offsetWidth; coin.classList.add('drop');
    playSample('tithe_jingle', 0.6);
    setTimeout(() => { playSample('kiosk_accept', 0.6); sfx('unlock', 0.7); }, 520);
    setTimeout(() => playSample('vend', 0.5), 700);
    chase = 2.2;
    rp.classList.remove('bump'); void rp.offsetWidth; rp.classList.add('bump');
    say(slotOf(e.id) >= 0 ? `ON THE WHEEL · SOCKET ${slotOf(e.id) + 1}` : 'BOUGHT · PUT IT ON THE WHEEL');
    build(); select(e.id, true);
  }
  function armSlots() {
    if (!owns(sel)) return;
    arm = !arm;
    for (const s of socks) s.b.classList.toggle('arm', arm);
    if (arm) say('PICK A SOCKET', 2400);
  }
  function disarm() { arm = false; for (const s of socks) s.b.classList.remove('arm'); }
  function onSock(i: number) {
    const cur = wheelSlots()[i];
    if (arm && owns(sel)) { setSlot(i, sel); sfx('clamp', 0.7); disarm(); say(`SOCKET ${i + 1} · ${emoteInfo(sel)!.name}`); build(); select(sel, true); return; }
    if (cur) select(cur); else say('EMPTY SOCKET · SELECT A RECORD, THEN ON WHEEL');
  }
  const unsub = onEmotes(() => { rp.querySelector('b')!.textContent = String(balance()); });
  build(); select(sel, true);
  const nav = new FocusNav(root, { onBack: () => shut(), autofocus: buy });

  // ---- the frame loop
  let raf = 0, last = performance.now(), T = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; T += dt;
    if (stage) {
      stage.tick(dt);
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.max(64, Math.round(view.clientWidth * dpr)), hh = Math.max(64, Math.round(view.clientHeight * dpr));
      if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
      stage.draw(cv.getContext('2d')!, w, hh);
    }
    // the selector's films (only what is on screen)
    for (const [id, r] of recs) {
      const e = emoteInfo(id)!;
      const sh = sheetNow(e.anim, r.c.width, r.c.height);
      if (sh) sheetFrame(r.ctx, sh, id === sel || r.b.matches(':hover') ? T : 0.9);
    }
    const ws = wheelSlots();
    socks.forEach((s, i) => {
      const e = ws[i] ? emoteInfo(ws[i]) : null;
      s.label.textContent = e ? e.name : 'EMPTY';
      if (!e) { s.ctx.clearRect(0, 0, s.cv.width, s.cv.height); return; }
      const sh = sheetNow(e.anim, s.cv.width, s.cv.height);
      if (sh) sheetFrame(s.ctx, sh, T + i * 0.4); else if (stageOk()) void emoteSheet(e.anim, s.cv.width, s.cv.height);
    });
    // the marquee bulbs: a slow walk, a fast chase after a sale
    if (chase > 0) chase -= dt;
    const bs = bulbs.children;
    for (let i = 0; i < bs.length; i++) bs[i].classList.toggle('on', chase > 0 ? (Math.floor(T * 16) + i) % 3 === 0 : (Math.floor(T * 3) + i) % 4 === 0);
  };
  raf = requestAnimationFrame(loop);

  function shut() {
    if (!open) return;
    open = null;
    cancelAnimationFrame(raf);
    unsub();
    nav.destroy();
    stage?.dispose();
    root.classList.remove('on');
    sfx('back', 0.6);
    setTimeout(() => root.remove(), 220);
    if (solo && g && !wasPaused) g.paused = false;
    if (g?.input) g.input.pointerOverUI = false;
    o.onClose?.();
  }
  root.addEventListener('pointerdown', (e) => { if (e.target === root) shut(); });
  open = { close: shut };
  if (import.meta.env?.DEV) (window as unknown as { __jukebox: unknown }).__jukebox = { select, doBuy, close: shut, armSlots, onSock };
}
export function closeEmoteShop() { open?.close(); }
export type { EmoteInfo };

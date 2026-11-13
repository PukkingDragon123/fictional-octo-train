// THE PRESS TERMINAL. The Remittance Press's own console: a bulky enamel CRT
// on a steel arm, chamfered square housing, amber phosphor, plate keys on the
// strip (the menus' terminal kit, src/ui/menus/terminal.ts). Opened at the
// press in a run ("Press terminal", the press's second verb), at a claim
// beacon once the Seam Relay is researched, and in the lab between runs
// (openPressTerminal({ from: 'lab' }): the Control Room / Monitor room prop).
// Pages (Q / E or the plate keys):
//   ACCOUNT  the three currencies (credits on the debt, the researcher's dollars, RP), the matter bank by material
//   DIAL     REMIT / SPLIT / KEEP, and (Assay Lens) what is on the plate right now
//   CREATE   the researched patterns: matter + dollars -> the thing on the plate
//            (in the lab: down the chute at the start of the next run)
//   LEDGER   the crew ledger (in a run)
import { mxArrive } from '../../ui/machine/kit';
import { mxMount, mxIcon, type IconKind } from '../../ui/machine/decor';
import { G } from '../G';
import { bus } from '../../core/events';
import { op } from '../ops';
import { hasUnlock, researchPoints } from '../research';
import { itemDef, hasItemDef, type Item } from '../../items/item';
import { createItem, serializeItem } from '../../items/factory';
import { itemIcon } from '../../ui/icons';
import { terminal, type Terminal } from '../../ui/menus/terminal';
import { plateBtn, type PlateButton } from '../../ui/menus/btnKit';
import { FocusNav } from '../../ui/menus/nav';
import { sfx } from '../../ui/menus/sfx';
import type { Player } from '../../entities/player';
import type { TileObject } from '../../world/zone';
import {
  MATS, MODES, press, banked, bankTotal, tokens, pressMode, setPressMode, canAfford, drawMatter, dispatch, itemMatter, objMatter,
  matterKg, scaleMatter, fmtKg, SCRIP_PER_TOKEN, type Matter, type PressMode,
} from './matter';
import { PATTERNS, PRESS_UPGRADES, type Pattern } from './registry';
import { slagWords } from './crusher';
import { FeedScreen } from './feedScreen';
import { INSTALLMENT_DOLLARS } from './money';
import { itemValue } from '../debt/values';
import './terminal.css';
import { calibrate } from '../../ui/minigames/calibrate';
import { panicLocks, panicFumble } from '../panic';

export interface TermOpen {
  /** where it is used: at the press in a run, at a claim beacon (Seam Relay), or the lab between runs */
  from: 'press' | 'relay' | 'lab';
  /** the press (or beacon) object */
  o?: TileObject;
  p?: Player;
  page?: Page;
  onClose?: () => void;
}
type Page = 'feed' | 'account' | 'dial' | 'create' | 'ledger';
const PAGE_ICON: Record<Page, IconKind> = { feed: 'crate', account: 'coin', dial: 'gear', create: 'wrench', ledger: 'tape' };
/** the plate's calibration: 0 none, 1 close, 2 true (the next make prints a spare) */
let calib = 0;
const PAGES: [Page, string][] = [['feed', 'Feed'], ['account', 'Account'], ['dial', 'Dial'], ['create', 'Create'], ['ledger', 'Ledger']];
/** round 17: the hopper's slots on the FEED page */
const SLOTS = 10;

let open: { close: () => void } | null = null;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const iname = (k: string) => (hasItemDef(k) ? itemDef(k).name : k.replace(/_/g, ' '));
const itemDisplay = (it: Item) => it.name || iname(it.key);
const h = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const costLine = (m: Matter) => MATS.filter((q) => (m[q.key] ?? 0) > 0).map((q) => `<i style="color:${q.color}">${q.code}</i> ${fmtKg(m[q.key]!)}`).join(' · ');
const canIcon = () => !!(G as any)?.pr?.renderer;

export const pressTerminalOpen = () => !!open;

export function openPressTerminal(o: TermOpen) {
  // round 17: too frightened to work the press mid-run (src/game/panic.ts)
  if (o.from !== 'lab' && G?.local && panicLocks('press')) { panicFumble('press'); return; }
  open?.close();
  const inRun = o.from !== 'lab' && !!G?.local;
  const wrap = h('div', 'ptm');
  const t: Terminal = terminal({ title: 'Remittance Press', sub: o.from === 'lab' ? 'lab link · seam reservoir' : o.from === 'relay' ? 'seam relay · claim beacon' : 'press console', cls: 'ptm-term', model: 'Meridian · Press Terminal T-7', powerOn: true });
  t.screen.classList.add('amber');
  wrap.append(t.el);
  document.body.append(wrap);
  mxArrive(t.el, 'bottom', { delay: 40 });
  if (window.innerWidth > 820) {
    mxMount(t.el, 'gauge', { right: -44, top: 86, z: 4 }, { label: 'BAR' });
    mxMount(t.el, 'gears', { right: -74, top: 150, z: 4 }, { speed: 0.7 });
    mxMount(t.el, 'valve', { left: 70, bottom: -34, z: 4 }, { w: 150 });
  }
  const atPress = inRun && o.from === 'press' && !!o.o;
  let page: Page = o.page ?? (atPress ? 'feed' : 'account');
  const keys = new Map<Page, PlateButton>();
  const visible = PAGES.filter(([k]) => (k !== 'ledger' || inRun) && (k !== 'feed' || atPress));
  for (const [k, label] of visible) {
    const b = plateBtn(label, () => show(k), { finish: 'olive', size: 'sm', shape: 'key', tight: true, sound: 'plate' });
    // round 16: each page's little 3D model on its key
    const ic = mxIcon(PAGE_ICON[k], 16);
    if (ic) { b.append(ic); b.classList.add('has-i'); }
    keys.set(k, b); t.keys.append(b);
  }
  t.keys.append(plateBtn('Off', () => close(), { finish: 'oxblood', size: 'sm', shape: 'key', tight: true, sound: 'relay' }));
  const prevModal = G?.ui?.modal ?? null;
  if (G?.ui && inRun) G.ui.modal = wrap;
  if (G?.input) G.input.pointerOverUI = true;
  const nav = new FocusNav(wrap, {
    onBack: () => close(),
    onTab: (d) => { const i = visible.findIndex(([k]) => k === page); show(visible[(i + d + visible.length) % visible.length][0]); },
  });
  const off = () => { if (wrap.isConnected && !(page === 'feed' && (waiting || pay && !pay.done))) render(); };
  // ---- the FEED page's state: what is in the hopper slots, and the payout the screen is counting
  const queue: Item[] = [];
  let pay: { value: number; t0: number; out: string[]; jack: number; bonus: number; drop: string; done: boolean } | null = null;
  let waiting = false;
  // the polished 2D screen (src/game/economy/feedScreen.ts): it keeps its counter, ram and log alive across renders
  let fs: FeedScreen | null = null;
  const onDeposit = (e: { hopper?: number; value?: number; out?: string[]; jack?: number; bonus?: number }) => {
    if (!wrap.isConnected || !o.o || e.hopper !== o.o.uid || !waiting) return;
    waiting = false;
    pay = { value: e.value ?? 0, t0: performance.now(), out: e.out ?? [], jack: e.jack ?? 0, bonus: e.bonus ?? 0, drop: '', done: false };
    fs?.paid(pay);
    const mine = pay;
    window.setTimeout(() => { mine.done = true; if (wrap.isConnected && page === 'feed') render(); }, pay.jack ? 1900 : 1400);
    if (page === 'feed') render();
  };
  const onJack = (e: { hopper?: number; drop?: string }) => { if (pay && o.o && e.hopper === o.o.uid && e.drop) { pay.drop = e.drop; fs?.rare(e.drop); } };
  // Space pulls the FEED page's lever; during the show any of them skips it
  const onKey = (e: KeyboardEvent) => {
    if (page !== 'feed' || !fs || e.repeat || e.code !== 'Space') return;
    if (fs.pressKey(e.code)) { e.preventDefault(); e.stopPropagation(); }
  };
  window.addEventListener('keydown', onKey, true);
  const unsub = [bus.on('matterChanged', off), bus.on('debtChanged', off), bus.on('deposited', onDeposit), bus.on('pressJackpot', onJack)];
  let tick = 0;
  // the plate reading follows what lands on it
  const iv = window.setInterval(() => { if (page === 'dial' && inRun) render(); if (++tick % 4 === 0) t.paint(); }, 900);
  function close() {
    if (!open) return;
    open = null;
    nav.destroy();
    window.clearInterval(iv);
    for (const u of unsub) u();
    window.removeEventListener('keydown', onKey, true);
    fs?.destroy(); fs = null;
    t.screen.style.transform = '';
    wrap.classList.add('off');
    setTimeout(() => wrap.remove(), 160);
    if (G?.ui && G.ui.modal === wrap) G.ui.modal = prevModal;
    if (G?.input) G.input.pointerOverUI = false;
    sfx('back', 0.6);
    o.onClose?.();
  }
  open = { close };
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });

  function show(k: Page) { page = k; for (const [q, b] of keys) b.classList.toggle('on', q === k); render(); }

  function render() {
    const sub: Record<Page, string> = { feed: 'feed the press · item by item', account: 'account · credits · dollars · research · matter', dial: 'the dial · what the plate holds', create: 'creation patterns', ledger: 'crew ledger' };
    t.setHead('Remittance Press', sub[page]);
    const body = t.body;
    const keep = body.scrollTop;
    // the FEED page keeps its tube attached (re-attaching would replay the power-on): it clears its own leftovers
    if (page !== 'feed') body.innerHTML = '';
    if (page === 'feed') feed(body);
    else if (page === 'account') account(body);
    else if (page === 'dial') dial(body);
    else if (page === 'create') create(body);
    else ledger(body);
    body.scrollTop = keep;
  }

  // ---------------------------------------------------------------- FEED (round 17)
  // The press's own screen for a deposit (feedScreen.ts): the pack with a pixel render of every
  // line, the assay sheet of the selected one, the hopper's ten slots; CRUSH brings the pixel ram
  // down while the world press takes the load, then the flip counter rolls the payout.
  type Hoppers = { depositItems?: (p: Player, o: TileObject, items: Item[], press?: boolean) => void; busy?: (o: TileObject) => boolean } | undefined;
  const hoppers = () => G.debt?.hoppers as Hoppers;
  const canCrush = () => !!queue.length && !waiting && !hoppers()?.busy?.(o.o!) && (!!G?.debt?.on || hasUnlock('pr_cold'));
  function crushNow() {
    const pl = o.p ?? G.local;
    if (!pl || !o.o || !canCrush()) return;
    waiting = true; pay = null;
    fs?.crushStart();
    hoppers()?.depositItems?.(pl, o.o, queue.splice(0), true);
    render();
  }
  /** what the unit carries that the press would take, grouped, dearest first */
  function packRows(pl: Player | null | undefined): Item[][] {
    if (pl) for (let i = queue.length - 1; i >= 0; i--) if (!pl.containerOf(queue[i])) queue.splice(i, 1);
    const carried = pl ? pl.allItems().filter((it) => !pl.isWorn(it) && it.key !== 'bailiff_band' && it.key !== 'build_kit' && !queue.includes(it) && (itemValue(it) > 0 || matterKg(itemMatter(it)) > 0.02)) : [];
    const groups = new Map<string, Item[]>();
    for (const it of carried) { const k = it.key + ':' + (it.name ?? ''); (groups.get(k) ?? groups.set(k, []).get(k)!).push(it); }
    return [...groups.values()].sort((a, b) => itemValue(b[0]) - itemValue(a[0]));
  }
  function feed(el: HTMLElement) {
    fs ??= new FeedScreen({
      rows: () => packRows(o.p ?? G.local),
      queue,
      slots: SLOTS,
      canCrush,
      busy: () => waiting || !!(o.o && hoppers()?.busy?.(o.o)),
      load: (it) => { if (queue.length < SLOTS && !waiting && !queue.includes(it)) { queue.push(it); render(); } },
      unload: (it) => { const i = queue.indexOf(it); if (i >= 0 && !waiting) { queue.splice(i, 1); render(); } },
      crush: () => crushNow(),
      share: () => (G?.debt?.on ? MODES.find((q) => q.key === pressMode())!.share : 0),
      screen: t.screen,
    });
    fs.render(el);
  }

  // ---------------------------------------------------------------- ACCOUNT
  function account(el: HTMLElement) {
    const d = G?.debt;
    const rows = h('div', 'ptm-acct');
    const row = (code: string, name: string, val: string, note: string) => rows.append(h('div', 'ptm-row', `<span class="ptm-code">${code}</span><b>${name}</b><span class="ptm-v">${val}</span><small>${note}</small>`));
    if (inRun && d?.on) row('CR', 'Credits', d.cleared ? `${fmt(d.surplus)} surplus` : `${fmt(d.paid)} / ${fmt(d.owed)}`, d.cleared ? 'the debt is discharged; surplus buys passage at the depot' : `paid on the crew debt · ${fmt(d.remaining)} to go`);
    else row('CR', 'Credits', inRun ? 'no contract' : '—', inRun ? 'nobody is collecting in this world' : 'credits belong to a run: they pay that world\'s debt');
    const p = press();
    const rate = SCRIP_PER_TOKEN;
    row('$', 'Dollars', `$${fmt(tokens())}`, `the researcher's money · $1 per ${rate} credits remitted (${Math.round(rate - p.rem)} to the next) · +$${INSTALLMENT_DOLLARS} per installment · commissary, jukebox, creation`);
    row('RP', 'Research', `${researchPoints()}`, 'knowledge · buys patterns and upgrades on the lab lattice');
    row('KG', 'Matter', fmtKg(bankTotal()), 'banked in the seam reservoir · creation draws it back out kilo for kilo');
    el.append(rows);
    // the bank, material by material: segmented phosphor bars on a log scale
    const bars = h('div', 'ptm-bars');
    for (const m of MATS) {
      const kg = banked(m.key);
      const k = kg <= 0 ? 0 : Math.min(1, Math.log10(1 + kg) / 2.4);
      const b = h('div', 'ptm-bar' + (kg <= 0 ? ' nil' : ''), `<span class="ptm-code" style="color:${m.color}">${m.code}</span><span class="ptm-name">${m.name}</span><span class="ptm-seg"><span style="width:${(k * 100).toFixed(1)}%;--c:${m.color}"></span></span><span class="ptm-v">${kg > 0 ? fmtKg(kg) : '—'}</span>`);
      b.title = m.desc;
      bars.append(b);
    }
    el.append(bars);
    el.append(h('div', 'ptm-how', `<p><b>REMIT</b> pays a load's <b>value</b> to the debt in <b>credits</b>, and the Institute pays you <b>dollars</b> for it. <b>KEEP</b> banks its <b>mass</b> as matter. <b>CREATE</b> spends matter and dollars on a pattern you have <b>researched</b>.</p><p class="dim">The seam destroys and makes equally: what goes down comes back up, kilo for kilo.</p>`));
    if (p.disp.length) el.append(h('p', 'ptm-note', `Waiting at the chute for the next run: ${esc(summarise(p.disp))}`));
  }

  // ---------------------------------------------------------------- DIAL
  function dial(el: HTMLElement) {
    const cur = pressMode();
    const contract = !!G?.debt?.on;
    const box = h('div', 'ptm-dial');
    for (const m of MODES) {
      const dis = inRun && !contract && m.key !== 'keep';
      const b = h('button', 'ptm-mode' + (m.key === cur ? ' on' : ''), `<b>${m.name}</b><small>${m.line}</small>`) as HTMLButtonElement;
      b.type = 'button'; b.disabled = dis;
      b.addEventListener('click', () => { setPressMode(m.key as PressMode); sfx('lever', 0.8); G?.audio?.ui?.('click'); render(); });
      box.append(b);
    }
    el.append(box);
    if (inRun && !contract) el.append(h('p', 'ptm-note', hasUnlock('pr_cold') ? 'No contract in this world: Cold Start keeps every load as matter.' : 'No contract in this world: the press is cold. (Cold Start, a press upgrade in the lab, runs it anyway.)'));
    if (!inRun || o.from !== 'press' || !o.o) { el.append(h('p', 'ptm-note dim', 'The dial is set here and remembered: every press reads it.')); return; }
    // the plate
    const z = G.getZone(G.local.zoneKey);
    const P = G.press ?? G.debt?.hoppers;
    const c = P?.contents?.(z, o.o) as { items: { item: Item }[]; objs: TileObject[] } | undefined;
    const sec = h('div', 'ptm-plate');
    if (!hasUnlock('pr_assay')) sec.append(h('p', 'dim', 'PLATE: no assay lens fitted. (Assay Lens, a press upgrade in the lab, reads the plate before the lever.)'));
    else if (!c || (!c.items.length && !c.objs.length)) sec.append(h('p', 'dim', 'PLATE: empty.'));
    else {
      const m: Matter = {};
      for (const wi of c.items) itemMatter(wi.item, m);
      for (const q of c.objs) objMatter(q, m);
      const val = Math.round(P?.estimate?.(z, o.o) ?? 0);
      const share = MODES.find((q) => q.key === cur)!.share * (contract ? 1 : 0);
      sec.append(h('p', '', `PLATE: ${c.items.length + c.objs.length} thing${c.items.length + c.objs.length === 1 ? '' : 's'} · ${fmtKg(matterKg(m))} · ≈ ${fmt(val)} credits`));
      sec.append(h('p', 'ptm-cost', costLine(m)));
      sec.append(h('p', '', `THIS PULL: <b>${fmt(val * share)}</b> credits to the debt · <b>${fmtKg(matterKg(m) * (1 - share))}</b> kept`));
    }
    el.append(sec);
    const pull = h('button', 'ptm-act', '&gt; PULL THE LEVER') as HTMLButtonElement;
    pull.type = 'button';
    pull.disabled = !!P?.busy?.(o.o) || (!contract && !hasUnlock('pr_cold'));
    pull.addEventListener('click', () => { const pl = o.p ?? G.local; const tgt = o.o!; close(); P?.pullAction?.(pl, tgt); });
    el.append(pull);
  }

  // ---------------------------------------------------------------- CREATE
  function create(el: HTMLElement) {
    const batch = hasUnlock('pr_batch') ? 3 : 1;
    const where = o.from === 'lab' ? 'made here goes down the chute at the start of your next run' : o.from === 'relay' ? 'prints arrive at the beacon' : 'prints rise out of the seam onto the plate';
    el.append(h('p', 'ptm-note', `${esc(where)} · $${fmt(tokens())} in the purse · ${fmtKg(bankTotal())} banked${batch > 1 ? ' · BATCH FORMER: ×3 per fee' : ''}`));
    // the plate's calibration (UI round 15, src/ui/minigames/calibrate.ts): a clean run prints a spare on the next make
    const cal = h('div', 'ptm-cal');
    cal.innerHTML = `<span>${calib === 2 ? 'PLATE TRUE · the next make prints one spare' : calib === 1 ? 'plate close · calibrate clean for a spare' : 'plate uncalibrated · a clean calibration prints one spare'}</span>`;
    const cb = h('button', 'ptm-make', calib === 2 ? 'true' : 'calibrate') as HTMLButtonElement;
    cb.type = 'button'; cb.disabled = calib === 2;
    cb.addEventListener('click', async () => {
      const r = await calibrate({ title: 'Plate calibration', sub: 'stop each needle in the green · Space / E / click', dials: 3, difficulty: hasUnlock('pr_batch') ? 3 : 2 });
      if (!r.cancelled) { calib = r.perfect ? 2 : r.hits >= 2 ? 1 : 0; sfx(r.perfect ? 'stamp' : 'error', 0.6); }
      render();
    });
    cal.append(cb);
    el.append(cal);
    const list = h('div', 'ptm-pats');
    const known = PATTERNS.filter((q) => hasUnlock(q.key) && hasItemDef(q.item));
    const locked = PATTERNS.filter((q) => !hasUnlock(q.key) && hasItemDef(q.item));
    if (!known.length) list.append(h('p', 'dim', 'No patterns on file. Research them in the lab: THE PRESS branch of the lattice.'));
    for (const q of known) list.append(patRow(q, batch));
    el.append(list);
    if (locked.length) {
      el.append(h('p', 'ptm-sub', `LOCKED PATTERNS (${locked.length}) · research in the lab`));
      const l2 = h('div', 'ptm-locked');
      for (const q of locked.slice(0, 40)) l2.append(h('span', '', `${esc(iname(q.item))} <i>${q.rp} RP</i>`));
      el.append(l2);
    }
    const ups = PRESS_UPGRADES.map((u) => `<span class="${hasUnlock(u.key) ? 'own' : ''}">${hasUnlock(u.key) ? '■' : '□'} ${esc(u.title)}</span>`).join('');
    el.append(h('p', 'ptm-sub', 'PRESS UPGRADES'), h('div', 'ptm-ups', ups));
  }
  function patRow(q: Pattern, batch: number) {
    const cost = scaleMatter(q.cost, batch);
    const short = !canAfford(cost), poor = tokens() < q.tok;
    const busy = o.from === 'press' && !!o.o && !!(G.press ?? G.debt?.hoppers)?.busy?.(o.o);
    const r = h('div', 'ptm-pat' + (short || poor ? ' cant' : ''));
    const icon = canIcon() ? `<img src="${itemIcon(q.item, '', 24)}" alt="">` : `<span class="ptm-noicon"></span>`;
    r.innerHTML = `${icon}<b>${esc(iname(q.item))}${q.n * batch > 1 ? ` ×${q.n * batch}` : ''}</b><span class="ptm-cost">${costLine(cost)} · <i class="tok">$${q.tok}</i></span>`;
    const b = h('button', 'ptm-make', short ? 'short' : poor ? 'dollars' : busy ? 'busy' : 'make') as HTMLButtonElement;
    b.type = 'button';
    b.disabled = short || poor || busy;
    b.addEventListener('click', () => make(q, batch));
    r.append(b);
    return r;
  }
  function make(q: Pattern, batch: number) {
    const cost = scaleMatter(q.cost, batch);
    if (!drawMatter(cost, q.tok)) { sfx('error'); return; }
    const spare = calib === 2 ? 1 : 0;
    calib = 0;
    const keys: string[] = Array.from({ length: q.n * batch + spare }, () => q.item);
    sfx('press', 0.7);
    if (o.from === 'lab' || !inRun) { dispatch(keys); sfx('stamp', 0.8); render(); return; }
    const z = G.getZone(G.local.zoneKey);
    const tgt = o.o;
    const cx = tgt ? tgt.x + (o.from === 'press' ? 1 : 0.5) : G.local.x, cz = tgt ? tgt.y + (o.from === 'press' ? 1 : 1.2) : G.local.z;
    keys.forEach((k, i) => {
      const it = createItem(k);
      const a = Math.random() * Math.PI * 2, r = keys.length > 1 ? 0.25 : 0.05;
      setTimeout(() => op('dropFloor', { z: z.key, item: serializeItem(it), x: cx + Math.cos(a) * r, zz: cz + Math.sin(a) * r, y: 0.12, v: [Math.cos(a) * 0.2, 1.4 + i * 0.15, Math.sin(a) * 0.2] }), 250 + i * 120);
    });
    if (tgt && o.from === 'press') (G.press ?? G.debt?.hoppers)?.seamFlash?.(tgt);
    G.audio?.at?.('press_hiss', cx, cz, 0.6);
    render();
  }

  // ---------------------------------------------------------------- LEDGER
  function ledger(el: HTMLElement) {
    void import('../debt/hopper').then((m) => { if (page !== 'ledger') return; el.append(h('pre', 'ptm-pre', esc(m.ledgerText()))); });
  }

  show(page);
  sfx('relay', 0.7);
}

function summarise(keys: string[]): string {
  const n = new Map<string, number>();
  for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n].map(([k, c]) => `${c} × ${iname(k)}`).join(', ');
}

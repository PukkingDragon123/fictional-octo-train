// SURGICAL THEATRE No.3 — the character creator's last stop. After the look
// (and the gender press) the menus call startSurgery(app, onDone): the lamp
// pods come on one by one, the ceiling gantry carries the subject in hanging
// limp in two slings and drops it on the pad, the straps snap shut (stage.ts).
// Touch a part of the subject, or press its key in the region bank on the
// desk: the tele-diagnostic CRT lists what can go there (the Scrapjack Arm to
// begin with; the rest is researched on the watch, branch 'cyber', or found in
// a run), FIT sends the two manipulators in. BRAIN opens the programme
// cartridges (the occupations) and the condition cards (the traits): all of
// them are free to choose; the card reader holds four cards, two of them gifts
// at most. Pull DEAL to let the machine choose; press DISCHARGE to be sealed.
// The SKIP plate (S, gamepad Y / Start) seals at once with what is chosen.
// Every word is on a physical instrument or floats free on the overlay.
// Returns {occupation, traits, cyber}; the loadout is also left for the next
// new survivor (src/survival/cyber.ts setPendingLoadout).
import * as THREE from 'three';
import type { Appearance, Outfit } from '../../entities/humanRig';
import { OCCUPATIONS, TRAITS, SKILLS, Occupation, Trait, occupationByKey, chipCode, wareCode } from '../../survival/traits';
import { CYBER_SLOTS, CyberSlot, SLOT_CODE, SLOT_NAME, partsFor, cyberDef, slotConflicts, CyberDef } from '../../survival/cyberParts';
import { partUnlocked, setPendingLoadout } from '../../survival/cyber';
import { Player } from '../../entities/player';
import { hasItemDef } from '../../items/item';
import { SurgeryStage, Pick } from './stage';
import { csfx, audioKick } from './audio';
import { Crt3D, CrtPen, Desk3D, SkipButton, PH, REGION_KEYS, freeText, brackets } from './instruments';
import '../fonts.css';
import './surgery.css';

export interface SurgeryResult { occupation: string; traits: string[]; cyber: Record<string, string> }
export interface SurgeryOpts {
  /** the subject's name / number for the plate */
  name?: string;
  /** what the subject wears on the table (default: the Remittance jumpsuit) */
  outfit?: Outfit;
  occupation?: string; traits?: string[]; cyber?: Record<string, string>;
  /** where to mount (default document.body) */
  host?: HTMLElement;
}

/** the card reader: four slots, two of them gifts at most */
export const READER_SLOTS = 4, READER_GIFTS = 2;
const isGift = (t: Trait) => t.cost <= 0;

/** the Remittance jumpsuit and slip-ons, dressed the game's own way (a throwaway Player-shaped object) */
function jumpsuitOutfit(): Outfit {
  const fake: any = { worn: new Map(), handR: null, handL: null, lightItem: null, outfitDirty: false, cond: null };
  for (const k of ['prison_jumpsuit', 'canvas_slipons']) {
    if (!hasItemDef(k)) continue;
    try { Player.prototype.wear.call(fake, { uid: 0, key: k, cond: 1, age: 0 } as any); } catch { /* not wearable */ }
  }
  try { return Player.prototype.computeOutfit.call(fake); } catch { return {}; }
}

const up = (s: string) => s.toUpperCase();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/** the upside text, never a price */
const goodOf = (e: { good?: string; desc: string }) => (e.good && !/credit|point/i.test(e.good) ? e.good : e.desc);
function statLine(d: CyberDef): string {
  const f = d.fx, o: string[] = [];
  const p = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
  if (f.attack) o.push('Attack ' + p(f.attack));
  if (f.action) o.push('Hands ' + p(-f.action));
  if (f.aim) o.push('Aim ' + p(f.aim));
  if (f.move) o.push('Speed ' + p(f.move));
  if (f.carry) o.push(`Load +${f.carry} kg`);
  if (f.armor) o.push(`Armour ${Math.round(f.armor * 100)}%`);
  if (f.noise) o.push('Loud');
  if (f.rust) o.push('Rusts');
  if (f.drain) o.push(`Cell −${f.drain}%/h`);
  return o.join(' · ');
}

export function startSurgery(app: Appearance, onDone: (r: SurgeryResult | null) => void, opts: SurgeryOpts = {}): { close: () => void; el: HTMLElement } {
  let occ = opts.occupation && OCCUPATIONS.some((o) => o.key === opts.occupation) ? opts.occupation : (OCCUPATIONS.find((o) => o.key === 'unemployed') ?? OCCUPATIONS[0]).key;
  const traits = new Set<string>();
  for (const k of opts.traits || []) { const t = TRAITS.find((x) => x.key === k); if (t && canInsert(t)) traits.add(k); }
  function giftCount() { let n = 0; for (const k of traits) { const t = TRAITS.find((x) => x.key === k); if (t && isGift(t)) n++; } return n; }
  function canInsert(t: Trait) { return traits.size < READER_SLOTS && (!isGift(t) || giftCount() < READER_GIFTS); }
  const subject = up(cut(opts.name || 'UNNAMED', 18));
  let closed = false, finished = false;
  // a focused, hidden menu button must not take the gamepad's A press while we are up
  (document.activeElement as HTMLElement | null)?.blur?.();

  const root = document.createElement('div');
  root.className = 'sg-root';
  const view = document.createElement('div'); view.className = 'sg-view';
  root.append(view);
  (opts.host || document.body).append(root);
  const stage = new SurgeryStage(view, 'intake');
  const load: Record<string, string> = {};
  for (const [s, k] of Object.entries(opts.cyber || {})) { const d = cyberDef(k); if (d && partUnlocked(d)) load[s] = k; }
  /** what the subject leaves with (updated as soon as a fit is ordered, so SKIP keeps it) */
  const plan: Record<string, string> = { ...load };
  stage.setSubject(app, opts.outfit || jumpsuitOutfit(), load as any, []);

  // ---------------- the instruments
  type Mode = 'idle' | 'slot' | 'brain' | 'leave' | 'busy' | 'done';
  let mode: Mode = 'busy';
  let slot: CyberSlot | null = null;
  let preview = 0;
  let brainTab: 'prog' | 'cards' = 'prog';
  let deny = 0, denyMsg = '';
  const log: string[] = [];
  let logT = 0;
  const crt = new Crt3D(stage.mats, drawCrt, pickCrt);
  const desk = new Desk3D(stage.mats);
  stage.fg.add(crt.group, desk.group);
  const skip = new SkipButton(() => doSkip());
  root.append(skip.el);
  let uiK = 0, uiT = 0;

  const slotOptions = (sl: CyberSlot) => [null, ...partsFor(sl)] as (CyberDef | null)[];
  const brainList = (): (Occupation | Trait)[] => (brainTab === 'prog' ? OCCUPATIONS : TRAITS);
  const rowsVisible = () => (brainTab === 'prog' ? 7 : 6);

  function header(pen: CrtPen, a: string, b = '') {
    pen.text(a, 14, 9, PH.hi, 18, 'left', 600);
    if (b) pen.text(b, pen.W - 14, 12, PH.mid, 14, 'right');
    pen.rule(35);
  }
  function drawCrt(pen: CrtPen, t: number) {
    const W = pen.W, H = pen.H, X = 14, L = 21;
    const blink = (t * 2) % 1 < 0.55;
    if (mode === 'busy' || mode === 'done') {
      header(pen, mode === 'done' ? 'DISCHARGED' : 'OPERATING', mode === 'busy' && blink ? 'REC' : subject);
      const n = Math.min(log.length, 11);
      for (let i = 0; i < n; i++) pen.text(cut(log[log.length - n + i], 40), X, 44 + i * L, i === n - 1 ? PH.hi : PH.mid, 15);
      if (blink && log.length) pen.fill(X + pen.width(cut(log[log.length - 1], 40)) + 4, 44 + (n - 1) * L + 3, 8, 14, PH.hi);
      return;
    }
    if (mode === 'leave') {
      header(pen, 'LEAVE THE THEATRE?');
      pen.para('Nothing fitted here is kept. The subject goes back to processing.', X, 52, W - 2 * X, PH.mid, 16, 21);
      pen.button('leave:yes', 'LEAVE', X, 140, 120);
      pen.button('leave:no', 'STAY', W - X - 120, 140, 120);
      return;
    }
    if (mode === 'idle') {
      header(pen, 'THEATRE No.3', cut(subject, 16));
      pen.para('Touch the subject, or press a region key, to choose what goes where.', X, 44, W - 2 * X, PH.mid, 15, 19, 2, true);
      let y = 92;
      const o = occupationByKey(occ);
      pen.text('PROGRAMME', X, y, PH.dim, 13, 'left', 600);
      pen.text(cut(o.name, 26), X + 96, y - 2, PH.hi, 16); pen.hit('brain:prog', 8, y - 4, W - 16, 22);
      y += 24;
      pen.text('READER', X, y, PH.dim, 13, 'left', 600);
      for (let i = 0; i < READER_SLOTS; i++) pen.card(X + 96 + i * 24, y - 1, i < traits.size ? PH.hi : PH.dim, i + 2);
      pen.text(`${traits.size} of ${READER_SLOTS}`, X + 96 + READER_SLOTS * 24 + 6, y - 1, PH.mid, 14);
      pen.hit('brain:cards', 8, y - 4, W - 16, 22);
      y += 20;
      const names = [...traits].map((k) => TRAITS.find((x) => x.key === k)?.name).filter(Boolean).join(', ');
      pen.text(cut(names || 'no cards punched', 42), X + 96, y, names ? PH.mid : PH.dim, 13, 'left', 500, !names);
      y += 22;
      pen.rule(y); y += 8;
      pen.text('HARDWARE', X, y, PH.dim, 13, 'left', 600);
      const fitted = CYBER_SLOTS.filter((x) => stage.load[x]);
      if (!fitted.length) pen.text('all flesh', X + 96, y - 1, PH.mid, 15, 'left', 500, true);
      fitted.slice(0, 4).forEach((x, i) => pen.text(cut(`${SLOT_CODE[x]}  ${cyberDef(stage.load[x])!.name}`, 32), X + 96, y - 1 + i * 19, PH.hi, 15));
      pen.button('brain', 'BRAIN BAY', X, H - 40, 140);
      pen.button('go', 'DISCHARGE', W - X - 140, H - 40, 140);
      return;
    }
    if (mode === 'slot' && slot) {
      const cur = stage.load[slot];
      header(pen, `${SLOT_CODE[slot]}  ${up(SLOT_NAME[slot])}`, cur ? 'HARDWARE' : 'FLESH');
      const list = slotOptions(slot);
      list.forEach((d, i) => {
        const y = 42 + i * L;
        const fitted = d ? cur === d.key : !cur;
        const un = !d || partUnlocked(d);
        const isPrev = i === preview, hot = pen.hover === 'opt:' + i;
        if (isPrev || hot) pen.fill(8, y - 2, W - 16, L - 1, isPrev ? '#0e3a1c' : '#082612');
        if (isPrev) pen.fill(10, y + 3, 4, 10, PH.hi);
        pen.text(cut(d ? d.name : 'Flesh (original)', 26), X + 8, y, un ? PH.hi : PH.dim, 15);
        pen.text(fitted ? 'FITTED' : un ? 'READY' : 'LOCKED', W - X, y + 1, fitted ? PH.hi : un ? PH.mid : PH.dim, 13, 'right', 600);
        pen.hit('opt:' + i, 8, y - 2, W - 16, L - 1);
      });
      let y = 46 + list.length * L;
      pen.rule(y); y += 8;
      const d = list[preview] ?? null;
      if (!d) {
        pen.text('Vat-grown flesh, stitched back on', X, y, PH.mid, 14, 'left', 500, true); y += 20;
        pen.para('+ What you were born with. Bleeds, heals, feels.', X, y, W - 2 * X, PH.hi, 14, 18, 2);
      } else {
        pen.text(cut(`${d.maker} · tier ${d.tier} · ${d.weight} kg`, 44), X, y, PH.mid, 13, 'left', 500, true); y += 17;
        pen.text(cut(statLine(d), 50), X, y, PH.hi, 13); y += 20;
        if (partUnlocked(d)) {
          y += 18 * pen.para('+ ' + d.good, X, y, W - 2 * X, PH.hi, 14, 18, 2);
          pen.para('− ' + d.bad, X, y, W - 2 * X, PH.mid, 14, 18, 2);
        } else {
          pen.text('RESTRICTED HARDWARE', X, y, PH.hi, 14, 'left', 600); y += 19;
          pen.para('Research it on the watch (the cyber branch), or find one out there.', X, y, W - 2 * X, PH.mid, 14, 18, 2, true);
        }
      }
      const can = d ? partUnlocked(d) && cur !== d.key : !!cur;
      if (can) pen.button('fit', d ? 'FIT PART' : 'RESTORE', X, H - 36, 150);
      else pen.text(d && cur === d.key ? 'fitted' : d ? 'locked' : 'in place', X + 8, H - 32, PH.dim, 15, 'left', 500, true);
      pen.button('back', 'BACK', W - X - 100, H - 36, 100);
      return;
    }
    if (mode === 'brain') {
      header(pen, 'BRAIN BAY', deny > 0 && blink ? denyMsg : `READER ${traits.size}/${READER_SLOTS}`);
      pen.button('tab:prog', 'PROGRAMME', X, 41, 152, brainTab === 'prog', 24);
      pen.button('tab:cards', 'CARDS', W - X - 152, 41, 152, brainTab === 'cards', 24);
      const ly = 74;
      const list = brainList();
      const rows = rowsVisible();
      crt.maxScroll = Math.max(0, list.length - rows);
      crt.scroll = Math.min(crt.scroll, crt.maxScroll);
      for (let i = 0; i < rows && crt.scroll + i < list.length; i++) {
        const idx = crt.scroll + i, e = list[idx], y = ly + i * L;
        const isJob = 'points' in e;
        const on = isJob ? occ === e.key : traits.has(e.key);
        const isPrev = idx === preview, hot = pen.hover === 'row:' + idx;
        if (isPrev || hot) pen.fill(8, y - 2, W - 20, L - 1, isPrev ? '#0e3a1c' : '#082612');
        const c = on ? PH.hi : PH.mid;
        if (isJob) pen.cart(X, y, c); else pen.card(X, y, c, idx + 3);
        pen.text(cut(e.name, 24), X + 28, y, c, 15);
        const tag = isJob ? (on ? 'LOADED' : '') : (on ? 'IN' : isGift(e as Trait) ? 'gift' : 'flaw');
        pen.text(tag, W - X - 8, y + 1, on ? PH.hi : isGift(e as Trait) ? PH.mid : PH.red, 13, 'right', on ? 600 : 500, !on);
        pen.hit('row:' + idx, 8, y - 2, W - 20, L - 1);
      }
      if (crt.maxScroll > 0) {
        const th = rows * L, bh = Math.max(10, (rows / list.length) * th), by = ly - 2 + (crt.scroll / list.length) * th;
        pen.fill(W - 9, ly - 2, 2, th, PH.dim); pen.fill(W - 10, by, 4, bh, PH.hi);
        pen.hit('scroll:up', W - 16, ly - 2, 16, th / 2); pen.hit('scroll:down', W - 16, ly - 2 + th / 2, 16, th / 2);
      }
      const y0 = ly + rows * L + 2;
      pen.rule(y0);
      const e = list[preview] ?? list[crt.scroll];
      if (e) {
        let y = y0 + 7;
        const isJob = 'points' in e;
        const code = isJob ? chipCode(e as Occupation) : wareCode(e as Trait);
        const sk = isJob ? Object.entries((e as Occupation).skills).map(([k, v]) => `${SKILLS.find((q) => q.key === k)?.name || k} ${v}`).join(' · ') : (isGift(e as Trait) ? 'a gift' : 'a flaw');
        pen.text(cut(`${code}${sk ? '  ' + sk : ''}`, 52), X, y, PH.mid, 13, 'left', 500, true); y += 18;
        const ml = 2;
        y += 18 * pen.para('+ ' + goodOf(e), X, y, W - 2 * X, PH.hi, 14, 18, ml);
        if (e.bad) pen.para('− ' + e.bad, X, y, W - 2 * X, PH.mid, 14, 18, 1);
      }
      pen.button('back', 'BACK', W - X - 90, H - 30, 90);
      return;
    }
  }

  function pickCrt(id: string) {
    if (closed) return;
    if (id === 'back') { open(null); return; }
    if (id === 'brain') { open('brain'); return; }
    if (id === 'brain:prog') { brainTab = 'prog'; open('brain', true); return; }
    if (id === 'brain:cards') { brainTab = 'cards'; open('brain', true); return; }
    if (id === 'go') { discharge(); return; }
    if (id === 'leave:yes') { finish(null); return; }
    if (id === 'leave:no') { mode = selected ? (selected === 'brain' ? 'brain' : 'slot') : 'idle'; return; }
    if (id === 'scroll:up') { crt.scrollBy(-3); return; }
    if (id === 'scroll:down') { crt.scrollBy(3); return; }
    if (id.startsWith('tab:')) { brainTab = id.slice(4) as any; preview = brainTab === 'prog' ? Math.max(0, OCCUPATIONS.findIndex((o) => o.key === occ)) : 0; crt.scroll = Math.max(0, Math.min(preview - 2, 999)); return; }
    if (id.startsWith('opt:')) { preview = Number(id.slice(4)); return; }
    if (id === 'fit' && slot) { const d = slotOptions(slot)[preview]; doSwap(slot, d ? d.key : null); return; }
    if (id.startsWith('row:')) toggleRow(Number(id.slice(4)), true);
  }
  function toggleRow(idx: number, byPointer = false) {
    const e = brainList()[idx];
    if (!e) return;
    const already = preview === idx;
    preview = idx;
    if ('points' in e) {
      if (occ === e.key) return;
      occ = e.key; csfx('cy_bolt', 0.35); stage.shake(0.06);
      return;
    }
    if (traits.has(e.key)) { if (already || !byPointer) { traits.delete(e.key); csfx('cy_hiss', 0.3); } return; }
    const clash = TRAITS.find((x) => traits.has(x.key) && ((e.excl || []).includes(x.key) || (x.excl || []).includes(e.key)));
    if (clash) traits.delete(clash.key);
    if (!canInsert(e)) {
      deny = 2.2; denyMsg = traits.size >= READER_SLOTS ? 'READER FULL' : 'TWO GIFTS AT MOST';
      csfx('sg_buzzer', 0.4);
      return;
    }
    traits.add(e.key); csfx('cy_bolt', 0.3);
  }

  // ---------------- selection
  let selected: Pick | null = null;
  const open = (p: Pick | null, keepTab = false) => {
    if (stage.busy || closed) return;
    selected = p;
    stage.select(p);
    preview = 0; crt.scroll = 0;
    if (!p) mode = 'idle';
    else if (p === 'brain') {
      mode = 'brain';
      if (!keepTab) brainTab = 'prog';
      if (brainTab === 'prog') { preview = Math.max(0, OCCUPATIONS.findIndex((o) => o.key === occ)); crt.scroll = Math.max(0, preview - 2); }
    } else {
      mode = 'slot'; slot = p;
      const cur = stage.load[p];
      const i = slotOptions(p).findIndex((d) => (d ? d.key === cur : !cur));
      const firstFit = slotOptions(p).findIndex((d) => !!d && partUnlocked(d) && d.key !== cur);
      preview = firstFit >= 0 ? firstFit : Math.max(0, i);
    }
    if (p) csfx('cy_servo', 0.15, 1.3);
    stage.onHover?.(null);
  };
  const REGION_ORDER: Pick[] = REGION_KEYS.filter(([k]) => k !== 'back').map(([k]) => k as Pick);
  const cycle = (dir: number) => {
    const i = selected ? REGION_ORDER.indexOf(selected) : -1;
    const n = REGION_ORDER.length;
    open(REGION_ORDER[(i + dir + n * 2 + (i < 0 && dir > 0 ? 0 : 0)) % n] ?? REGION_ORDER[0]);
    desk.pressKey('key:' + selected);
  };
  const doSwap = async (sl: CyberSlot, key: string | null) => {
    if (stage.busy || closed) return;
    desk.pressKey('fit');
    mode = 'busy'; log.length = 0;
    const d = key ? cyberDef(key) : null;
    for (const s of slotConflicts(sl)) delete plan[s];
    if (key) plan[sl] = key; else delete plan[sl];
    log.push(`> ${SLOT_CODE[sl]} — ${up(SLOT_NAME[sl])}`, '> RESTRAINTS LOCKED');
    for (const s of slotConflicts(sl)) if (stage.load[s]) { log.push(`> REMOVING ${SLOT_CODE[s]}`); await stage.swap(s, null); }
    await stage.swap(sl, key, (ph) => {
      const M: Record<string, string> = { approach: '> ORDERLY TAKES HOLD', cut: '> SAW DOWN. CUTTING', drop: '> SPECIMEN TO TRAY', bring: d ? '> FETCHING ' + up(cut(d.name, 22)) : '> GRAFT FROM THE VAT', bolt: d ? '> BOLTING. WELDING' : '> CLAMP AND SUTURE', test: d ? '> POWER TO THE PART' : '> CLOSED' };
      if (M[ph]) { log.push(M[ph]); logT = 0; }
    });
    log.push('> COMPLETE'); logT = 0;
    if (!closed) mode = selected === 'brain' ? 'brain' : selected ? 'slot' : 'idle';
  };

  // ---------------- pointer: the CRT glass first, then the desk, else the subject
  stage.onPointer2D = (x, y, kind) => uiK > 0.6 && crt.pointer2D(x, y, kind);
  stage.onHover = () => {};
  stage.onFgHover = (id) => { desk.hover = id && (id.startsWith('key:') || id === 'fit' || id === 'go' || id === 'deal') ? id : ''; };
  stage.onClick = (id, _hit, p) => {
    if (closed) return;
    if (id) {
      if (stage.busy || uiK < 0.6) return;
      if (id.startsWith('key:')) {
        const k = id.slice(4);
        desk.pressKey(id);
        if (k === 'back') open(null); else open(k as Pick);
      } else if (id === 'rock:up' || id === 'rock:down') { desk.rock(id === 'rock:up' ? -1 : 1); step(id === 'rock:up' ? -1 : 1); }
      else if (id === 'fit') confirm();
      else if (id === 'deal') deal();
      else if (id === 'go') discharge();
      return;
    }
    if (p) { open(p); desk.pressKey('key:' + p); } else if (selected) open(null);
  };
  /** move the highlighted row */
  const step = (dir: number) => {
    const n = mode === 'slot' && slot ? slotOptions(slot).length : mode === 'brain' ? brainList().length : 0;
    if (!n) return;
    preview = (preview + dir + n) % n;
    if (mode === 'brain') { const rows = rowsVisible(); if (preview < crt.scroll) crt.scroll = preview; if (preview >= crt.scroll + rows) crt.scroll = preview - rows + 1; }
    csfx('cy_beep', 0.08, 1.4);
  };
  /** FIT: fit the previewed part, or punch / load the previewed card / cartridge */
  const confirm = () => {
    desk.pressKey('fit');
    if (mode === 'slot' && slot) { const d = slotOptions(slot)[preview]; if (d ? partUnlocked(d) && stage.load[slot] !== d.key : !!stage.load[slot]) doSwap(slot, d ? d.key : null); else csfx('sg_buzzer', 0.3); }
    else if (mode === 'brain') toggleRow(preview);
    else if (mode === 'idle') open('brain');
  };

  // ---------------- DEAL: the machine picks a programme and a hand of cards
  const deal = () => {
    if (stage.busy || closed) return;
    desk.pressKey('deal');
    const gifts = TRAITS.filter(isGift), flaws = TRAITS.filter((t) => !isGift(t));
    const o = OCCUPATIONS[Math.floor(Math.random() * OCCUPATIONS.length)];
    occ = o.key; traits.clear();
    const pickFrom = (arr: Trait[], n: number) => {
      for (let tries = 0; tries < 40 && n > 0; tries++) {
        const t = arr[Math.floor(Math.random() * arr.length)];
        if (!t || traits.has(t.key)) continue;
        if ([...traits].some((k) => (t.excl || []).includes(k) || (TRAITS.find((x) => x.key === k)?.excl || []).includes(t.key))) continue;
        traits.add(t.key); n--;
      }
    };
    pickFrom(gifts, 1 + (Math.random() < 0.6 ? 1 : 0));
    pickFrom(flaws, 1 + (Math.random() < 0.5 ? 1 : 0));
    setTimeout(() => { csfx('cy_spark', 0.4); stage.shake(0.15); }, 330);
    if (mode !== 'brain') open('brain', true);
  };

  // ---------------- DISCHARGE / SKIP
  const result = (): SurgeryResult => ({ occupation: occ, traits: [...traits], cyber: { ...plan } });
  const discharge = async () => {
    if (stage.busy || closed) return;
    desk.pressKey('go');
    closed = true;
    open(null); mode = 'done';
    log.length = 0;
    const o = occupationByKey(occ);
    const hw = CYBER_SLOTS.filter((s) => stage.load[s]).map((s) => `${SLOT_CODE[s]} ${cyberDef(stage.load[s])!.name}`);
    log.push(`> SUBJECT ${subject}`, `> PROGRAMME ${up(o.name)}`, `> CARDS ${traits.size ? [...traits].map((k) => up(TRAITS.find((x) => x.key === k)?.name || k)).join(', ') : 'NONE'}`, `> HARDWARE ${hw.length ? up(hw.join('; ')) : 'NONE'}`, '> SEALED. NEXT.');
    csfx('cy_hiss', 0.7);
    const r = result();
    setPendingLoadout(r.cyber as any);
    await stage.wait(700);
    uiT = 0;
    await stage.discharge();
    finish(r);
  };
  const doSkip = () => {
    if (finished) return;
    closed = true;
    const r = result();
    setPendingLoadout(r.cyber as any);
    finish(r);
  };

  // ---------------- layout: CRT and desk round the subject; slide out while the machines work
  const tanHalf = () => Math.tan((stage.fgCam.fov * Math.PI) / 360);
  const placeCrt = (x: number, y: number, w: number, h: number, slide: number) => {
    const D = 4, hh = tanHalf() * D, hw = hh * stage.fgCam.aspect;
    const cw = stage.lowW * stage.art, ch = stage.lowH * stage.art;
    const s = Math.min((w / cw) * 2 * hw / 1.27, (h / ch) * 2 * hh / 1.42);
    crt.group.scale.setScalar(s);
    crt.group.position.set(((x + w / 2) / cw * 2 - 1) * hw + slide * hw * 1.2, -(((y + h / 2) / ch) * 2 - 1) * hh + 0.1 * s, -D);
    crt.group.rotation.set(0, 0, 0);
  };
  let lastKey = '';
  const layout = () => {
    const W = stage.lowW * stage.art, H = stage.lowH * stage.art;
    if (!W) return;
    const portrait = W / H < 0.95, pad = Math.max(8, Math.round(Math.min(W, H) * 0.015));
    const k = 1 - easeIO(uiK);
    const key = `${W}x${H}:${portrait}`;
    if (key !== lastKey) { lastKey = key; desk.build(portrait ? 'tall' : 'wide'); skip.scale(stage.art); }
    let sx = 0, sy = 0;
    if (!portrait) {
      const cw = Math.min(Math.max(W * 0.34, 250), 560), topGap = 52 + pad;
      const ch = Math.min(H - topGap - pad, cw * 1.12);
      placeCrt(W - cw - pad, topGap + (H - topGap - pad - ch) / 2 - (H - topGap - pad - ch) * 0.3, cw, ch, k);
      const dw = W - cw - pad * 3, dh = Math.min(H * 0.3, dw / 4.3);
      desk.place(stage, pad, H - dh - pad + k * (dh + pad * 2), dw, dh);
      const cx = (W - cw - pad) / 2, cy = (H - dh) / 2;
      sx = ((W / 2 - cx) / W) * easeIO(uiK); sy = ((H / 2 - cy) / H) * easeIO(uiK);
    } else {
      const dw = W - pad * 2, dh = Math.min(H * 0.25, dw / 1.55);
      const dy = H - dh - pad;
      desk.place(stage, pad, dy + k * (dh + pad * 2), dw, dh);
      const cw = W - pad * 2, ch = Math.min(H * 0.4, cw * 1.05);
      const cy0 = dy - ch - pad * 0.5;
      placeCrt(pad, cy0, cw, ch, k * 1.3);
      const sceneBottom = cy0;
      sy = ((H / 2 - sceneBottom / 2) / H) * easeIO(uiK) * 0.95;
    }
    stage.setViewShift(sx, sy);
  };
  const easeIO = (t: number) => t * t * (3 - 2 * t);

  // ---------------- the overlay: CRT picture, engraved labels, the part under the pointer, the operation log
  stage.onOverlay = (ctx, o) => {
    const d = o.dpr;
    if (uiK > 0.02) { crt.paint(ctx, stage); desk.paint(ctx, stage); }
    // the part under the pointer (or the one chosen): pixel brackets and a free label
    const tagFor = !stage.busy && mode !== 'done' ? stage.hovered ?? selected : null;
    if (tagFor) {
      const sp = stage.toScreen(stage.anchor(tagFor, new THREE.Vector3()));
      if (sp) {
        const hot = tagFor === stage.hovered;
        brackets(ctx, sp.x * d, sp.y * d, 16 * d, o.art, hot ? '#ffd27a' : '#7affa6');
        const label = tagFor === 'brain' ? `BRAIN · ${occupationByKey(occ).name}` : `${SLOT_CODE[tagFor]} · ${stage.load[tagFor] ? cyberDef(stage.load[tagFor])!.name : 'flesh'}`;
        freeText(ctx, label, (sp.x + 22) * d, (sp.y - 20) * d, { size: 15 * d, color: hot ? '#ffe2a0' : '#b8ffcc', italic: true, weight: 500 });
      }
    }
    // during the work: the log line types out in the lower bar; the theatre's name in the upper one
    const bar = stage.bars;
    if (bar > 0.3) {
      const H = o.h, W = o.w, bh = H * 0.1 * bar;
      ctx.globalAlpha = Math.min(1, (bar - 0.3) * 2);
      const line = log[log.length - 1] || '';
      const shown = line.slice(0, Math.floor(logT * 40));
      if (shown) freeText(ctx, shown.replace(/^> /, ''), W / 2, H - bh / 2, { size: Math.min(20, bh / d * 0.42) * d, color: PH.hi, align: 'center', italic: true, glow: '#3aff7a' });
      freeText(ctx, `Surgical Theatre No.3 · ${subject}`, 18 * d, bh / 2, { size: Math.min(15, bh / d * 0.34) * d, color: '#b0a890', italic: true });
      ctx.globalAlpha = 1;
    }
  };

  // ---------------- keyboard and gamepad
  const onKey = (e: KeyboardEvent) => {
    if (finished) return;
    const k = e.key;
    if (k === 's' || k === 'S') { e.preventDefault(); e.stopPropagation(); doSkip(); return; }
    if (closed) return;
    if (k === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (stage.busy) { stage.hurry = true; return; }
      if (mode === 'leave') { mode = selected ? (selected === 'brain' ? 'brain' : 'slot') : 'idle'; return; }
      if (selected) { open(null); return; }
      mode = 'leave';
      return;
    }
    if (stage.busy) { if (k === 'Enter' || k === ' ') stage.hurry = true; return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); desk.rock(k === 'ArrowUp' ? -1 : 1); step(k === 'ArrowDown' ? 1 : -1); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (mode === 'brain') pickCrt(brainTab === 'prog' ? 'tab:cards' : 'tab:prog'); else cycle(k === 'ArrowRight' ? 1 : -1);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (mode === 'leave') pickCrt('leave:yes'); else if (mode === 'idle') discharge(); else confirm();
    } else if (k === 'r' || k === 'R') deal();
    else if (k === 'b' || k === 'B') open(mode === 'brain' ? null : 'brain');
  };
  window.addEventListener('keydown', onKey, true);
  view.addEventListener('wheel', (e) => { if (mode === 'brain') { e.preventDefault(); crt.scrollBy(Math.sign(e.deltaY)); } }, { passive: false });
  const padPrev: Record<number, boolean> = {};
  let padRepeat = 0;
  const pollPad = (dt: number) => {
    let pads: (Gamepad | null)[] = [];
    try { pads = [...(navigator.getGamepads?.() || [])]; } catch { return; }
    const p = pads.find(Boolean); if (!p) return;
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const edge = (i: number) => { const v = b(i), was = padPrev[i]; padPrev[i] = v; return v && !was; };
    if (edge(3) || edge(9)) { doSkip(); return; }
    if (closed) return;
    const fresh = { a: edge(0), b: edge(1), x: edge(2), lb: edge(4), rb: edge(5), up: edge(12), dn: edge(13), lf: edge(14), rt: edge(15) };
    if (stage.busy) { if (fresh.a || fresh.b) stage.hurry = true; return; }
    const ay = p.axes[1] || 0;
    padRepeat -= dt;
    const stick = Math.abs(ay) > 0.6 && padRepeat <= 0;
    if (fresh.up || fresh.dn || stick) { const dir = fresh.up || (stick && ay < 0) ? -1 : 1; desk.rock(dir as 1 | -1); step(dir); padRepeat = 0.18; }
    if (fresh.lb || fresh.lf) { if (mode === 'brain') pickCrt('tab:prog'); else cycle(-1); }
    if (fresh.rb || fresh.rt) { if (mode === 'brain') pickCrt('tab:cards'); else cycle(1); }
    if (fresh.a) { if (mode === 'leave') pickCrt('leave:yes'); else if (mode === 'idle') open('brain'); else confirm(); }
    if (fresh.b) { if (mode === 'leave') mode = 'idle'; else if (selected) open(null); else mode = 'leave'; }
    if (fresh.x) deal();
  };

  // ---------------- per frame
  stage.onFrame = (dt) => {
    if (finished) return;
    const want = !stage.busy && mode !== 'busy' && mode !== 'done' ? 1 : 0;
    uiT += dt;
    uiK += ((want ? (uiT > 0.15 ? 1 : uiK) : 0) - uiK) * Math.min(1, dt * (want ? 4 : 6));
    if (Math.abs(uiK - want) < 0.002) uiK = want;
    crt.powerT = uiK > 0.5 ? 1 : 0;
    layout();
    deny = Math.max(0, deny - dt);
    logT += dt;
    crt.frame(dt, stage.busy);
    desk.frame(dt);
    // the region keys: latched for the chosen part, a lamp over fitted hardware
    for (const [id] of REGION_KEYS) {
      desk.setLatched('key:' + id, selected === id);
      const fitted = id !== 'back' && id !== 'brain' && !!stage.load[id as CyberSlot];
      desk.setLamp('key:' + id, selected === id ? 0x50ff80 : fitted ? 0xffa030 : id === 'brain' && traits.size ? 0x60a0ff : null, 2.4);
    }
    const canFit = mode === 'slot' && !!slot && (() => { const d = slotOptions(slot!)[preview]; return d ? partUnlocked(d) && stage.load[slot!] !== d.key : !!stage.load[slot!]; })();
    desk.setLamp('fit', canFit || mode === 'brain' ? 0x60ff80 : null, (Math.sin(stage.t * 5) * 0.5 + 1.5));
    desk.setLamp('go', mode === 'idle' ? 0xff4020 : 0x401008, mode === 'idle' ? 1.5 + Math.sin(stage.t * 3) : 1);
    pollPad(dt);
  };

  const finish = (r: SurgeryResult | null) => {
    if (finished) return;
    finished = true; closed = true;
    window.removeEventListener('keydown', onKey, true);
    stage.dispose();
    root.remove();
    onDone(r);
  };

  log.push('> SUBJECT INBOUND', '> GANTRY ENGAGED');
  root.addEventListener('pointerdown', () => audioKick(), { once: true });
  stage.intro().then(() => {
    if (closed) return;
    log.push('> ON THE TABLE', '> READY'); logT = 0;
    mode = 'idle'; uiT = 0; csfx('cy_powerup', 0.5);
  });
  if (import.meta.env.DEV) (window as any).__surgery = { stage, open, swap: doSwap, go: discharge, skip: doSkip, deal, crt, desk, plan, traits, pick: pickCrt, step, confirm, get occ() { return occ; }, get mode() { return mode; }, get uiK() { return uiK; } };
  return { close: () => { if (!finished) finish(null); }, el: root };
}

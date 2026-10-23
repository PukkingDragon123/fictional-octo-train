// THE OPERATING TABLE IN A RUN. Lie down on a table (the theatre table in the
// Lobby, any operating table or gurney, or anywhere with a field surgery rig):
// the theatre comes up (stage.ts, the same crisp pixel room as the intake),
// the body lies back heavily and the straps snap shut. Then:
//   FIT     touch a part of yourself (or press its region key): the CRT lists
//           the hardware you carry that fits there, or takes what is fitted
//           off; FIT sends the two machines in to saw, bolt and weld.
//   CRAFT   pull the CRAFT lever (or press the CRAFT key): the jig swings out
//           over you; the CRT lists every part with what it needs against what
//           you carry; BUILD lays the pieces out on the jig and the machines
//           weld them into the part, which goes into your pack.
//   GET UP  the red key (or Esc) releases the straps. SKIP (S, gamepad Y) gets
//           you off at once, finishing whatever the machines were doing.
// No anaesthetic: fitting costs blood, pain, panic and a memory. Results are
// applied when the work completes (installPart / removePart in cyber.ts,
// craftPart in cyberCraft.ts).
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { TimedAction } from '../../actions/action';
import type { Player } from '../../entities/player';
import type { Item } from '../../items/item';
import { fpClaim, fpRelease, fpBlend } from '../../fp/fp';
import { addStat } from '../../game/profile';
import { CYBER_SLOTS, CyberSlot, SLOT_KIND, SLOT_CODE, SLOT_NAME, cyberDef, cyberDefByItem, slotConflicts, loadoutOf, installPart, removePart, partUnlocked, type CyberDef, type CyberKind } from '../../survival/cyber';
import { CRAFTABLE, craftRows, canCraft, craftPart, pieceKeys } from '../../survival/cyberCraft';
import { SurgeryStage, type Pick } from './stage';
import { csfx, audioKick } from './audio';
import { Crt3D, CrtPen, Desk3D, SkipButton, PH, REGION_KEYS, freeText, brackets } from './instruments';
import '../fonts.css';
import './surgery.css';

class OnTheTable extends TimedAction {
  finished = false;
  constructor(p: Player, public label: string) {
    super(p);
    this.name = label; this.duration = 3600; this.fixedTime = true; this.locks = true; this.canMove = false; this.anim = 'craft'; this.showBar = false;
  }
  update() { if (this.finished) this.done = true; }
  perform() { /* applied by the table */ }
}

let openNow = false;
const up = (s: string) => s.toUpperCase();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const SLOT_FOR: Record<CyberKind, CyberSlot> = { arm: 'arm_r', hand: 'hand_r', leg: 'leg_r', eyes: 'eyes', jaw: 'jaw', spine: 'spine', skin: 'skin' };
const KEYS: [string, string][] = [...REGION_KEYS.slice(0, 10), ['craft', 'CRAFT'], ['back', 'BACK']];
function statLine(d: CyberDef): string {
  const f = d.fx, o: string[] = [];
  const p = (v: number) => `${v > 0 ? '+' : '-'}${Math.round(Math.abs(v) * 100)}%`;
  if (f.attack) o.push('ATK ' + p(f.attack));
  if (f.action) o.push('HANDS ' + p(-f.action));
  if (f.aim) o.push('AIM ' + p(f.aim));
  if (f.move) o.push('SPD ' + p(f.move));
  if (f.carry) o.push(`LOAD +${f.carry}KG`);
  if (f.armor) o.push(`ARMOUR ${Math.round(f.armor * 100)}%`);
  if (f.noise) o.push('LOUD');
  if (f.rust) o.push('RUSTS');
  if (f.drain) o.push(`CELL -${f.drain}%/H`);
  return o.join(' · ');
}

export function fieldSurgery(p: Player) {
  if (openNow || !p?.isLocal || p.body.dead) return;
  openNow = true;
  const b = p.body;
  (document.activeElement as HTMLElement | null)?.blur?.();
  const root = document.createElement('div');
  root.className = 'sg-root field';
  const view = document.createElement('div'); view.className = 'sg-view';
  root.append(view);
  document.body.append(root);
  // the game's own first-person cut plays under us; the theatre fades in with it
  fpClaim('surgery', 5, { cinematic: 'full' });
  root.style.opacity = '0';
  let leaving = false, ended = false;
  const stage = new SurgeryStage(view, 'intake');
  const { cond: _c, ...outfit } = p.computeOutfit() as any;
  void _c;
  stage.setSubject(p.app, outfit, loadoutOf(b) as any, [...b.severed]);
  const action = new OnTheTable(p, 'On the operating table');
  p.actions.clear(); p.actions.add(action);

  // ---------------- what can be done
  type Row = { slot: CyberSlot; key: string | null; item: Item | null; d: CyberDef | null };
  const rowsFor = (slot: CyberSlot): Row[] => {
    const load = loadoutOf(b), out: Row[] = [], seen = new Set<string>();
    for (const it of p.allItems()) {
      const d = cyberDefByItem(it.key);
      if (!d || seen.has(d.key) || SLOT_KIND[slot] !== d.kind || load[slot] === d.key) continue;
      if (d.kind === 'hand' && (b.severed.includes(`farm_${slot.slice(-1)}` as any) || load[`arm_${slot.slice(-1)}` as CyberSlot])) continue;
      seen.add(d.key);
      out.push({ slot, key: d.key, item: it, d });
    }
    if (load[slot]) out.push({ slot, key: null, item: null, d: cyberDef(load[slot]) ?? null });
    return out;
  };
  const carried = () => { const s = new Set<string>(); for (const it of p.allItems()) { const d = cyberDefByItem(it.key); if (d) s.add(d.name); } return [...s]; };

  // ---------------- the instruments
  type Mode = 'busy' | 'idle' | 'slot' | 'craft' | 'leave';
  let mode: Mode = 'busy';
  let slot: CyberSlot | null = null;
  let preview = 0;
  const log: string[] = ['> LIE BACK', '> STRAPS ON'];
  let logT = 0;
  let selected: Pick | 'craft' | null = null;
  const crt = new Crt3D(stage.mats, drawCrt, pickCrt, 'OPERATING TABLE');
  const desk = new Desk3D(stage.mats);
  desk.keys = KEYS;
  desk.labels = { fit: 'FIT', deal: 'CRAFT', go: 'GET UP' };
  stage.fg.add(crt.group, desk.group);
  const skip = new SkipButton(() => skipOut(), 'SKIP', 'S · Y');
  root.append(skip.el);
  let uiK = 0, uiT = 0;
  // a run in progress (so SKIP can finish it at once)
  let running: { kind: 'fit'; row: Row } | { kind: 'craft'; key: string } | null = null;

  function header(pen: CrtPen, a: string, bb = '') {
    pen.text(a, 14, 9, PH.hi, 18, 'left', 600);
    if (bb) pen.text(bb, pen.W - 14, 12, PH.mid, 13, 'right');
    pen.rule(35);
  }
  function drawCrt(pen: CrtPen, t: number) {
    const W = pen.W, H = pen.H, X = 14, L = 21;
    const blink = (t * 2) % 1 < 0.55;
    if (mode === 'busy') {
      header(pen, 'OPERATING', blink ? 'REC' : 'NO ANAESTHETIC');
      const n = Math.min(log.length, 11);
      for (let i = 0; i < n; i++) pen.text(cut(log[log.length - n + i], 34), X, 44 + i * L, i === n - 1 ? PH.hi : PH.mid, 15);
      return;
    }
    if (mode === 'leave') {
      header(pen, 'GET UP?');
      pen.para('The straps come off. Anything half done stays undone.', X, 52, W - 2 * X, PH.mid, 15, 20);
      pen.button('leave:yes', 'GET UP', X, 140, 120);
      pen.button('leave:no', 'STAY', W - X - 120, 140, 120);
      return;
    }
    if (mode === 'idle') {
      header(pen, 'OPERATING TABLE', 'NO ANAESTHETIC');
      pen.para('Touch yourself, or press a region key, to fit or take off hardware. Pull CRAFT to build parts.', X, 44, W - 2 * X, PH.mid, 14, 18, 3);
      let y = 104;
      pen.text('FITTED', X, y, PH.dim, 13, 'left', 600);
      const load = loadoutOf(b), fitted = CYBER_SLOTS.filter((s) => load[s]);
      if (!fitted.length) pen.text('all flesh', X + 88, y - 1, PH.mid, 14);
      fitted.slice(0, 3).forEach((s, i) => pen.text(cut(`${SLOT_CODE[s]} ${cyberDef(load[s])!.name}`, 26), X + 88, y - 1 + i * 18, PH.hi, 14));
      y += Math.max(1, Math.min(3, fitted.length)) * 18 + 8;
      pen.text('IN PACK', X, y, PH.dim, 13, 'left', 600);
      const c = carried();
      pen.text(cut(c.length ? c.join(', ') : 'no hardware', 28), X + 88, y - 1, c.length ? PH.hi : PH.mid, 14);
      y += 26;
      pen.text('BUILDABLE', X, y, PH.dim, 13, 'left', 600);
      const ready = CRAFTABLE.filter((d) => partUnlocked(d) && canCraft(p, d.key));
      pen.text(cut(ready.length ? ready.map((d) => d.name).join(', ') : 'nothing yet: gather scrap', 28), X + 88, y - 1, ready.length ? PH.hi : PH.mid, 14);
      pen.button('craft', 'CRAFT', X, H - 40, 130);
      pen.button('leave', 'GET UP', W - X - 130, H - 40, 130);
      return;
    }
    if (mode === 'slot' && slot) {
      const load = loadoutOf(b), cur = load[slot] ? cyberDef(load[slot]) : null;
      const stump = b.severed.some((x) => (SLOT_KIND[slot!] === 'arm' || SLOT_KIND[slot!] === 'hand' || SLOT_KIND[slot!] === 'leg') && x.endsWith(slot!.slice(-2)));
      header(pen, `${SLOT_CODE[slot]}  ${up(SLOT_NAME[slot])}`, cur ? 'HARDWARE' : stump ? 'STUMP' : 'FLESH');
      pen.text(cur ? `now: ${cur.name}` : stump ? 'now: a stump' : 'now: flesh', X, 42, PH.mid, 14);
      const rows = rowsFor(slot);
      if (!rows.length) pen.para('Nothing you carry fits here. Pull CRAFT to build a part, or find one out there.', X, 66, W - 2 * X, PH.mid, 14, 18, 3);
      rows.slice(0, 5).forEach((r, i) => {
        const y = 64 + i * L;
        const isPrev = i === preview, hot = pen.hover === 'opt:' + i;
        if (isPrev || hot) pen.fill(8, y - 2, W - 16, L - 1, isPrev ? '#0e3a1c' : '#082612');
        if (isPrev) pen.fill(10, y + 3, 4, 10, PH.hi);
        pen.text(cut(r.key ? r.d!.name : 'Take it off', 22), X + 8, y, PH.hi, 15);
        pen.text(r.key ? (cur ? 'SWAP' : stump ? 'ON STUMP' : 'CUTS FLESH') : 'CAP SOCKET', W - X, y + 1, r.key ? PH.mid : PH.warn, 12, 'right', 600);
        pen.hit('opt:' + i, 8, y - 2, W - 16, L - 1);
      });
      const r = rows[preview];
      let y = 68 + Math.max(1, Math.min(5, rows.length)) * L;
      if (r) {
        pen.rule(y); y += 8;
        const d = r.d;
        if (d && r.key) {
          pen.text(cut(statLine(d), 40), X, y, PH.hi, 13); y += 19;
          y += 17 * pen.para('+ ' + d.good, X, y, W - 2 * X, PH.hi, 13, 17, 2);
          pen.para('- ' + d.bad, X, y, W - 2 * X, PH.mid, 13, 17, 2);
        } else if (d) pen.para(`The ${d.name} comes off into your pack. The socket gets a cap.`, X, y, W - 2 * X, PH.mid, 13, 17, 3);
        pen.button('fit', r.key ? 'FIT' : 'TAKE OFF', X, H - 36, 130);
      }
      pen.button('back', 'BACK', W - X - 96, H - 36, 96);
      return;
    }
    if (mode === 'craft') {
      header(pen, 'CRAFTING JIG', 'MACHINES WELD');
      const list = CRAFTABLE, rows = 5;
      crt.maxScroll = Math.max(0, list.length - rows);
      crt.scroll = Math.min(crt.scroll, crt.maxScroll);
      for (let i = 0; i < rows && crt.scroll + i < list.length; i++) {
        const idx = crt.scroll + i, d = list[idx], y = 42 + i * L;
        const un = partUnlocked(d), ok = un && canCraft(p, d.key);
        const isPrev = idx === preview, hot = pen.hover === 'row:' + idx;
        if (isPrev || hot) pen.fill(8, y - 2, W - 20, L - 1, isPrev ? '#0e3a1c' : '#082612');
        if (isPrev) pen.fill(10, y + 3, 4, 10, PH.hi);
        pen.text(cut(d.name, 22), X + 8, y, un ? PH.hi : PH.dim, 15);
        const miss = craftRows(p, d.key).reduce((a, r) => a + Math.max(0, r.need - r.have), 0);
        pen.text(!un ? 'LOCKED' : ok ? 'READY' : `${miss} SHORT`, W - X - 8, y + 1, !un ? PH.dim : ok ? PH.hi : PH.warn, 12, 'right', 600);
        pen.hit('row:' + idx, 8, y - 2, W - 20, L - 1);
      }
      if (crt.maxScroll > 0) {
        const th = rows * L, bh = Math.max(10, (rows / list.length) * th), by = 40 + (crt.scroll / list.length) * th;
        pen.fill(W - 9, 40, 2, th, PH.dim); pen.fill(W - 10, by, 4, bh, PH.hi);
        pen.hit('scroll:up', W - 16, 40, 16, th / 2); pen.hit('scroll:down', W - 16, 40 + th / 2, 16, th / 2);
      }
      let y = 44 + rows * L;
      pen.rule(y); y += 6;
      const d = list[preview];
      if (d) {
        if (!partUnlocked(d)) {
          pen.text('RESTRICTED DESIGN', X, y, PH.hi, 14, 'left', 600); y += 18;
          pen.para('Research it on the watch (the cyber branch), or find one out there.', X, y, W - 2 * X, PH.mid, 13, 17, 2);
        } else {
          const cr = craftRows(p, d.key);
          cr.forEach((r, i) => {
            const cx = X + (i % 2) * ((W - 2 * X) / 2), cy = y + Math.floor(i / 2) * 18;
            const ok = r.have >= r.need;
            pen.text(cut(up(r.name), 14), cx, cy, ok ? PH.mid : PH.dim, 13);
            pen.text(`${Math.min(r.have, 99)}/${r.need}`, cx + (W - 2 * X) / 2 - 12, cy, ok ? PH.hi : PH.red, 13, 'right', 600);
          });
          y += Math.ceil(cr.length / 2) * 18 + 2;
          pen.text(cut(statLine(d), 40), X, y, PH.mid, 12);
          if (canCraft(p, d.key)) pen.button('build', 'BUILD', X, H - 36, 130);
        }
      }
      pen.button('back', 'BACK', W - X - 96, H - 36, 96);
    }
  }

  function pickCrt(id: string) {
    if (ended || stage.busy) return;
    if (id === 'back') { open(null); return; }
    if (id === 'craft') { open('craft'); return; }
    if (id === 'leave') { mode = 'leave'; return; }
    if (id === 'leave:yes') { getUp(); return; }
    if (id === 'leave:no') { mode = selected === 'craft' ? 'craft' : selected ? 'slot' : 'idle'; return; }
    if (id === 'scroll:up') { crt.scrollBy(-2); return; }
    if (id === 'scroll:down') { crt.scrollBy(2); return; }
    if (id.startsWith('opt:')) { preview = Number(id.slice(4)); return; }
    if (id.startsWith('row:')) { const i = Number(id.slice(4)); if (preview === i) confirm(); else preview = i; return; }
    if (id === 'fit' || id === 'build') confirm();
  }
  const open = (s: Pick | 'craft' | null) => {
    if (stage.busy || ended) return;
    selected = s; preview = 0; crt.scroll = 0;
    if (s === 'craft') { mode = 'craft'; stage.select(null); const i = CRAFTABLE.findIndex((d) => partUnlocked(d) && canCraft(p, d.key)); preview = Math.max(0, i); crt.scroll = Math.max(0, preview - 2); desk.setLabel('fit', 'BUILD'); }
    else if (!s || s === 'brain') { mode = 'idle'; selected = null; stage.select(null); desk.setLabel('fit', 'FIT'); }
    else { mode = 'slot'; slot = s; stage.select(s); desk.setLabel('fit', 'FIT'); }
    if (s) csfx('cy_servo', 0.15, 1.3);
  };
  const ORDER: (Pick | 'craft')[] = [...CYBER_SLOTS, 'craft'];
  const cycle = (dir: number) => {
    const i = selected ? ORDER.indexOf(selected) : -1, n = ORDER.length;
    open(ORDER[(i + dir + n * 2) % n] ?? ORDER[0]);
    desk.pressKey('key:' + selected);
  };
  const step = (dir: number) => {
    const n = mode === 'slot' && slot ? rowsFor(slot).length : mode === 'craft' ? CRAFTABLE.length : 0;
    if (!n) return;
    preview = (preview + dir + n) % n;
    if (mode === 'craft') { if (preview < crt.scroll) crt.scroll = preview; if (preview >= crt.scroll + 5) crt.scroll = preview - 4; }
    csfx('cy_beep', 0.08, 1.4);
  };
  const confirm = () => {
    desk.pressKey('fit');
    if (mode === 'slot' && slot) { const r = rowsFor(slot)[preview]; if (r) doFit(r); else csfx('sg_buzzer', 0.3); }
    else if (mode === 'craft') { const d = CRAFTABLE[preview]; if (d && partUnlocked(d) && canCraft(p, d.key)) doCraft(d.key); else csfx('sg_buzzer', 0.3); }
    else if (mode === 'idle') open('craft');
  };

  // ---------------- the work
  const applyFit = (r: Row) => {
    for (const s of slotConflicts(r.slot)) if (loadoutOf(b)[s]) removePart(p, s, true);
    const ok = r.key ? installPart(p, r.slot, r.key, { item: r.item, giveBack: true }) : removePart(p, r.slot, true);
    if (!ok) return false;
    const hard = (b.perks.has('chop_doc') ? 0.5 : 1) * (b.painkiller > 0 ? 0.6 : 1);
    b.panic = Math.min(100, b.panic + 70 * hard); b.stress = Math.min(100, b.stress + 30 * hard); b.unhappy = Math.min(100, b.unhappy + 10 * hard);
    b.blood = Math.max(30, b.blood - 9 * hard); b.health = Math.max(5, b.health - 7 * hard);
    try { G.survival?.mind?.addTrauma?.(b, 0.15 * hard, 'self-surgery', 0.4); } catch { /* no mind */ }
    if (r.key) addStat('cyber_fitted', 1);
    bus.emit('noise', { x: p.x, z: p.z, radius: 20, kind: 'scream', zone: p.zoneKey, by: p.id });
    return true;
  };
  const doFit = async (r: Row) => {
    if (stage.busy || ended) return;
    mode = 'busy'; log.length = 0; logT = 0;
    running = { kind: 'fit', row: r };
    log.push(`> ${SLOT_CODE[r.slot]} ${r.key ? 'FIT ' + up(r.d!.name) : 'TAKE OFF'}`, '> BITE DOWN');
    bus.emit('subtitle', { who: p.name, text: r.key ? 'Okay. Okay okay okay.' : 'Get it OFF me.', x: p.x, y: p.y + 1.8, z: p.z });
    for (const s of slotConflicts(r.slot)) if (stage.load[s]) { log.push(`> OFF ${SLOT_CODE[s]}`); await stage.swap(s, null); }
    await stage.swap(r.slot, r.key, (ph) => {
      const M: Record<string, string> = { approach: '> ORDERLY TAKES HOLD', cut: '> SAW DOWN. SCREAMING', drop: '> SPECIMEN TO TRAY', bring: '> HARDWARE IN', bolt: r.key ? '> BOLTING. WELDING' : '> CLAMP AND SUTURE', test: r.key ? '> POWER TO THE PART' : '> CAPPED' };
      if (M[ph]) { log.push(M[ph]); logT = 0; }
    });
    if (ended || running?.kind !== 'fit') return;
    running = null;
    if (applyFit(r)) {
      bus.emit('subtitle', { who: p.name, text: r.key ? 'AAAAAGH- ...it moves. It MOVES.' : 'It is out. It is OUT.', style: 'shout', x: p.x, y: p.y + 1.8, z: p.z });
      log.push('> DONE'); logT = 0;
    }
    stage.load = { ...loadoutOf(b) } as any;
    mode = 'slot';
  };
  const doCraft = async (key: string) => {
    if (stage.busy || ended) return;
    const d = cyberDef(key)!;
    mode = 'busy'; log.length = 0; logT = 0;
    running = { kind: 'craft', key };
    log.push('> JIG OUT', `> BUILDING ${up(d.name)}`);
    await stage.craft(pieceKeys(key), key, SLOT_FOR[d.kind], (ph) => {
      const M: Record<string, string> = { assemble: '> WELDING IT TOGETHER', seam: '> THE LAST SEAM', done: `> ${up(d.name)} READY` };
      if (M[ph]) { log.push(M[ph]); logT = 0; }
    });
    if (ended || running?.kind !== 'craft') return;
    running = null;
    const it = craftPart(p, key);
    if (it) { csfx('cy_bolt', 0.5); log.push('> INTO YOUR PACK'); addStat('cyber_built', 1); bus.emit('think', p, `A ${d.name}. Mine. Now it just has to go on.`); }
    else log.push('> SOMETHING WENT MISSING');
    logT = 0;
    mode = 'craft';
  };

  // ---------------- leaving
  const close = () => {
    if (ended) return;
    ended = true;
    window.removeEventListener('keydown', onKey, true);
    leaving = true;
    fpRelease('surgery');
    root.style.transition = 'opacity 0.3s ease-in'; root.style.opacity = '0';
    setTimeout(() => { stage.dispose(); root.remove(); }, 320);
    openNow = false;
    if (!action.finished) action.finished = true;
  };
  const getUp = async () => {
    if (ended || stage.busy) return;
    desk.pressKey('go');
    mode = 'busy'; log.push('> STRAPS OFF'); logT = 0;
    await stage.discharge();
    close();
  };
  /** SKIP: off the table at once; whatever the machines were doing is done */
  const skipOut = () => {
    if (ended) return;
    const r = running; running = null;
    if (r?.kind === 'fit') applyFit(r.row);
    else if (r?.kind === 'craft') craftPart(p, r.key);
    close();
  };

  // ---------------- pointer
  stage.onPointer2D = (x, y, kind) => uiK > 0.6 && crt.pointer2D(x, y, kind);
  stage.onFgHover = (id) => { desk.hover = id && (id.startsWith('key:') || id === 'fit' || id === 'go' || id === 'deal') ? id : ''; };
  stage.onClick = (id, _hit, pk) => {
    if (ended) return;
    if (id) {
      if (stage.busy || uiK < 0.6) return;
      if (id.startsWith('key:')) { const k = id.slice(4); desk.pressKey(id); if (k === 'back') open(null); else open(k as any); }
      else if (id === 'rock:up' || id === 'rock:down') { desk.rock(id === 'rock:up' ? -1 : 1); step(id === 'rock:up' ? -1 : 1); }
      else if (id === 'fit') confirm();
      else if (id === 'deal') { desk.pressKey('deal'); open(mode === 'craft' ? null : 'craft'); }
      else if (id === 'go') getUp();
      return;
    }
    if (pk && pk !== 'brain') { open(pk); desk.pressKey('key:' + pk); } else if (selected) open(null);
  };

  // ---------------- layout (the same arrangement as the intake table)
  const easeIO = (t: number) => t * t * (3 - 2 * t);
  const tanHalf = () => Math.tan((stage.fgCam.fov * Math.PI) / 360);
  const placeCrt = (x: number, y: number, w: number, h: number, slide: number) => {
    const D = 4, hh = tanHalf() * D, hw = hh * stage.fgCam.aspect;
    const cw = stage.lowW * stage.art, ch = stage.lowH * stage.art;
    const s = Math.min((w / cw) * 2 * hw / 1.27, (h / ch) * 2 * hh / 1.42);
    crt.group.scale.setScalar(s);
    crt.group.position.set(((x + w / 2) / cw * 2 - 1) * hw + slide * hw * 1.2, -(((y + h / 2) / ch) * 2 - 1) * hh + 0.1 * s, -D);
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
      const short = H < 520;
      const cw = Math.min(Math.max(W * (short ? 0.37 : 0.34), 250), 560), topGap = (short ? 44 : 52) + pad;
      const ch = Math.min(H - topGap - pad, cw * 1.12);
      placeCrt(W - cw - pad, topGap + (H - topGap - pad - ch) * 0.2, cw, ch, k);
      const dw = W - cw - pad * 3, dh = Math.min(H * (short ? 0.4 : 0.3), dw / (short ? 3.4 : 4.3));
      desk.place(stage, pad, H - dh - pad + k * (dh + pad * 2), dw, dh);
      sx = ((W / 2 - (W - cw - pad) / 2) / W) * easeIO(uiK); sy = ((H / 2 - (H - dh) / 2) / H) * easeIO(uiK);
    } else {
      const dw = W - pad * 2, dh = Math.min(H * 0.25, dw / 1.55), dy = H - dh - pad;
      desk.place(stage, pad, dy + k * (dh + pad * 2), dw, dh);
      const cw = W - pad * 2, ch = Math.min(H * 0.37, cw * 0.98), cy0 = dy - ch - pad * 0.5;
      placeCrt(pad, cy0, cw, ch, k * 1.3);
      sy = ((H / 2 - cy0 / 2) / H) * easeIO(uiK) * 0.95;
    }
    stage.setViewShift(sx, sy);
  };

  // ---------------- overlay
  stage.onOverlay = (ctx, o) => {
    const d = o.dpr;
    if (uiK > 0.02) { crt.paint(ctx, stage); desk.paint(ctx, stage); }
    const tagFor = !stage.busy && mode !== 'craft' ? stage.hovered ?? (selected && selected !== 'craft' ? selected : null) : null;
    if (tagFor && tagFor !== 'brain') {
      const sp = stage.toScreen(stage.anchor(tagFor, new THREE.Vector3()));
      if (sp) {
        const hot = tagFor === stage.hovered;
        brackets(ctx, sp.x * d, sp.y * d, 16 * d, o.art, hot ? '#ffd27a' : '#7affa6');
        const ld = loadoutOf(b)[tagFor];
        freeText(ctx, `${SLOT_CODE[tagFor]} · ${ld ? cyberDef(ld)!.name : 'flesh'}`, (sp.x + 22) * d, (sp.y - 20) * d, { size: 14 * d, color: hot ? '#ffe2a0' : '#b8ffcc' });
      }
    }
    const bar = stage.bars;
    if (bar > 0.3) {
      const H = o.h, W = o.w, bh = H * 0.1 * bar;
      ctx.globalAlpha = Math.min(1, (bar - 0.3) * 2);
      const line = (log[log.length - 1] || '').replace(/^> /, '');
      const shown = line.slice(0, Math.floor(logT * 40));
      if (shown) freeText(ctx, shown, W / 2, H - bh / 2, { size: Math.min(20, bh / d * 0.42) * d, color: PH.hi, align: 'center', glow: '#3aff7a' });
      ctx.globalAlpha = 1;
    }
  };

  // ---------------- keys (everything is ours while we lie here) and the pad
  const onKey = (e: KeyboardEvent) => {
    if (ended) return;
    const k = e.key;
    if (/^F\d+$/.test(k)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type !== 'keydown' || e.repeat && !k.startsWith('Arrow')) return;
    if (k === 's' || k === 'S' || ((k === 'Enter' || k === ' ') && document.activeElement === skip.el)) { skipOut(); return; }
    if (k === 'Escape') {
      if (stage.busy) { stage.hurry = true; return; }
      if (mode === 'leave') { mode = 'idle'; return; }
      if (selected) { open(null); return; }
      mode = 'leave'; return;
    }
    if (stage.busy) { if (k === 'Enter' || k === ' ') stage.hurry = true; return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') { desk.rock(k === 'ArrowUp' ? -1 : 1); step(k === 'ArrowDown' ? 1 : -1); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') cycle(k === 'ArrowRight' ? 1 : -1);
    else if (k === 'Enter' || k === ' ') { if (mode === 'leave') getUp(); else confirm(); }
    else if (k === 'c' || k === 'C') { desk.pressKey('deal'); open(mode === 'craft' ? null : 'craft'); }
  };
  window.addEventListener('keydown', onKey, true);
  view.addEventListener('wheel', (e) => { if (mode === 'craft') { e.preventDefault(); crt.scrollBy(Math.sign(e.deltaY)); } }, { passive: false });
  const padPrev: Record<number, boolean> = {};
  let padRepeat = 0;
  const pollPad = (dt: number) => {
    let pads: (Gamepad | null)[] = [];
    try { pads = [...(navigator.getGamepads?.() || [])]; } catch { return; }
    const gp = pads.find(Boolean); if (!gp) return;
    const bt = (i: number) => !!gp.buttons[i]?.pressed;
    const edge = (i: number) => { const v = bt(i), was = padPrev[i]; padPrev[i] = v; return v && !was; };
    if (edge(3) || edge(9)) { skipOut(); return; }
    const f = { a: edge(0), b: edge(1), x: edge(2), lb: edge(4), rb: edge(5), up: edge(12), dn: edge(13), lf: edge(14), rt: edge(15) };
    if (stage.busy) { if (f.a || f.b) stage.hurry = true; return; }
    const ay = gp.axes[1] || 0;
    padRepeat -= dt;
    const stick = Math.abs(ay) > 0.6 && padRepeat <= 0;
    if (f.up || f.dn || stick) { const dir = f.up || (stick && ay < 0) ? -1 : 1; desk.rock(dir as 1 | -1); step(dir); padRepeat = 0.18; }
    if (f.lb || f.lf) cycle(-1);
    if (f.rb || f.rt) cycle(1);
    if (f.a) { if (mode === 'leave') getUp(); else confirm(); }
    if (f.b) { if (mode === 'leave') mode = 'idle'; else if (selected) open(null); else mode = 'leave'; }
    if (f.x) open(mode === 'craft' ? null : 'craft');
  };

  // ---------------- per frame
  stage.onFrame = (dt) => {
    if (ended) return;
    const want = !stage.busy && mode !== 'busy' ? 1 : 0;
    uiT += dt;
    uiK += ((want ? (uiT > 0.15 ? 1 : uiK) : 0) - uiK) * Math.min(1, dt * (want ? 4 : 6));
    if (Math.abs(uiK - want) < 0.002) uiK = want;
    crt.powerT = uiK > 0.5 ? 1 : 0;
    layout();
    logT += dt;
    crt.frame(dt, stage.busy);
    desk.frame(dt);
    const load = loadoutOf(b);
    for (const [id] of KEYS) {
      desk.setLatched('key:' + id, selected === id);
      const fitted = !!load[id as CyberSlot];
      desk.setLamp('key:' + id, selected === id ? 0x50ff80 : fitted ? 0xffa030 : id === 'craft' && CRAFTABLE.some((d) => partUnlocked(d) && canCraft(p, d.key)) ? 0x60a0ff : null, 2.4);
    }
    const canGo = (mode === 'slot' && !!slot && rowsFor(slot).length > 0) || (mode === 'craft' && !!CRAFTABLE[preview] && partUnlocked(CRAFTABLE[preview]) && canCraft(p, CRAFTABLE[preview].key));
    desk.setLamp('fit', canGo ? 0x60ff80 : null, Math.sin(stage.t * 5) * 0.5 + 1.5);
    desk.setLamp('go', mode === 'idle' ? 0xff4020 : 0x401008, mode === 'idle' ? 1.5 + Math.sin(stage.t * 3) : 1);
    pollPad(dt);
    if (!leaving) root.style.opacity = String(Math.min(1, fpBlend() * 1.15 + 0.0001));
    if (p.body.dead) close();
  };

  root.addEventListener('pointerdown', () => audioKick(), { once: true });
  stage.lieDown().then(() => { if (ended) return; log.push('> READY'); logT = 0; mode = 'idle'; uiT = 0; csfx('cy_powerup', 0.5); });
  if (import.meta.env.DEV) (window as any).__table = { stage, open, confirm, step, skip: skipOut, getUp, craft: doCraft, fit: doFit, rowsFor, get mode() { return mode; }, get uiK() { return uiK; } };
}

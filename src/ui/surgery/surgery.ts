// SURGICAL THEATRE No.3 — the character creator's last stop. After the look
// (and the gender press) the menus call startSurgery(app, onDone): a ceiling
// gantry carries the subject onto the table (stage.ts). Touch an arm, a hand,
// a leg, the eyes, the jaw, the spine or the skin and the tele-diagnostic CRT
// lists what can go there (only the Scrapjack Arm to begin with; the rest is
// researched on the watch, branch 'cyber', or found in a run); FIT and the
// robot arms take the flesh off and bolt the hardware on. Touch the brain for
// WARES: programmes as plug-in cartridges (the occupations) and conditions as
// punch cards (the traits), each with what it gives and what it costs, paid in
// credits shown on Nixie tubes. Pull the DEAL lever to let the machine choose;
// press the red mushroom button to be sealed and discharged.
// Every readout is pixel art on a physical instrument (panel.ts, crt.ts): no
// DOM text. Returns {occupation, traits, cyber}; the loadout is also left for
// the next new survivor (src/survival/cyber.ts setPendingLoadout).
import type { Appearance, Outfit } from '../../entities/humanRig';
import { OCCUPATIONS, TRAITS, SKILLS, Occupation, Trait, occupationAvailable, traitAvailable, occupationByKey, chipCode, wareCode } from '../../survival/traits';
import { unlockProgress } from '../../survival/unlocks';
import { CYBER_SLOTS, CyberSlot, SLOT_CODE, SLOT_NAME, partsFor, cyberDef, slotConflicts, CyberDef } from '../../survival/cyberParts';
import { partUnlocked, setPendingLoadout } from '../../survival/cyber';
import { researchPoints } from '../../game/research';
import { Player } from '../../entities/player';
import { hasItemDef } from '../../items/item';
import { Screen } from '../font5x7';
import { stampCanvas } from '../pixelart';
import { SurgeryStage, Pick } from './stage';
import { csfx } from './audio';
import { Pix, C, PH, ph, phButton, cartIcon, cardIcon, brassPlate, drawConsole, CON, drawTag, TAG, CRT } from './panel';
import { TeleCrt, HitFn } from './crt';
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
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '.' : s);
const cr = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n)}`;
/** short stat line for a part, phosphor-sized */
function statLine(d: CyberDef): string {
  const f = d.fx, o: string[] = [];
  const p = (v: number) => `${v > 0 ? '+' : '-'}${Math.round(Math.abs(v) * 100)}`;
  if (f.attack) o.push('ATK' + p(f.attack));
  if (f.action) o.push('HND' + p(-f.action));
  if (f.aim) o.push('AIM' + p(f.aim));
  if (f.move) o.push('SPD' + p(f.move));
  if (f.carry) o.push('KG+' + f.carry);
  if (f.armor) o.push('ARM+' + Math.round(f.armor * 100));
  if (f.noise) o.push('NOISE');
  if (f.rust) o.push('RUST');
  if (f.drain) o.push('BAT-' + f.drain);
  return o.join(' ');
}

export function startSurgery(app: Appearance, onDone: (r: SurgeryResult | null) => void, opts: SurgeryOpts = {}): { close: () => void; el: HTMLElement } {
  let occ = opts.occupation && occupationAvailable(occupationByKey(opts.occupation)) ? opts.occupation : 'unemployed';
  const traits = new Set((opts.traits || []).filter((k) => { const t = TRAITS.find((x) => x.key === k); return !!t && traitAvailable(t); }));
  const points = () => { let p = occupationByKey(occ).points; for (const k of traits) p += TRAITS.find((x) => x.key === k)?.cost ?? 0; return p; };
  const subject = up(cut(opts.name || 'UNNAMED', 14));
  let closed = false;

  const root = document.createElement('div');
  root.className = 'sg-root';
  const view = document.createElement('div'); view.className = 'sg-view';
  root.append(view);
  (opts.host || document.body).append(root);
  const stage = new SurgeryStage(view, 'intake');
  const sev: string[] = [];
  const load: Record<string, string> = {};
  for (const [s, k] of Object.entries(opts.cyber || {})) { const d = cyberDef(k); if (d && partUnlocked(d)) load[s] = k; }
  stage.setSubject(app, opts.outfit || jumpsuitOutfit(), load as any, sev);
  stage.setRack(CYBER_SLOTS.filter((s) => s === 'arm_r' || s === 'leg_r' || s === 'hand_r' || s === 'eyes').flatMap((s) => partsFor(s).map((d) => ({ key: d.key, slot: s, unlocked: partUnlocked(d) }))));

  // ---------------- the instruments
  const plateP = new Pix(176, 34, 'sg-plate');
  brassPlate(plateP.s, 0, 0, 176, 16, 'SURGICAL THEATRE No.3');
  brassPlate(plateP.s, 22, 19, 132, 14, 'SUBJECT ' + subject);
  plateP.flush();
  const con = new Pix(CON.W, CON.H, 'sg-con');
  const tag = new Pix(TAG.W, TAG.H, 'sg-tag');
  const stampP = new Pix(1, 1, 'sg-stamp');
  const sc = stampCanvas('DISCHARGED', 0xc02018, -8);
  stampP.el.width = sc.w; stampP.el.height = sc.h; stampP.w = sc.w; stampP.h = sc.h;
  stampP.el.getContext('2d')!.putImageData(sc.toImageData(), 0, 0);
  root.append(plateP.el, con.el, tag.el, stampP.el);

  // ---------------- the CRT
  type Mode = 'idle' | 'slot' | 'brain' | 'leave' | 'busy';
  let mode: Mode = 'idle';
  let slot: CyberSlot | null = null;
  let preview = 0;
  let brainTab: 'carts' | 'cards' = 'carts';
  let cardTab: 'assets' | 'liab' = 'assets';
  let deny = 0;
  const log: string[] = [];
  const crt = new TeleCrt(drawCrt, pickCrt);
  root.append(crt.pix.el);

  function slotOptions(sl: CyberSlot) { return [null, ...partsFor(sl)] as (CyberDef | null)[]; }
  function brainList(): (Occupation | Trait)[] {
    return brainTab === 'carts' ? OCCUPATIONS : TRAITS.filter((t) => (cardTab === 'assets' ? t.cost <= 0 : t.cost > 0));
  }

  function drawCrt(s: Screen, hit: HitFn, hover: string, t: number) {
    const W = CRT.SW;
    const blink = (t * 2) % 1 < 0.55;
    const title = (a: string, b = '') => { s.text(a, 3, 2, ph.hi); if (b) s.text(b, W - 3 - s.textW(b), 2, ph.mid); s.hline(2, W - 3, 11, ph.dim); };
    if (mode === 'busy') {
      title('OPERATING', blink ? '*REC' : '');
      const n = Math.min(log.length, 11);
      for (let i = 0; i < n; i++) s.text(cut(log[log.length - n + i], 27), 3, 15 + i * 9, i === n - 1 ? ph.hi : ph.mid);
      if (blink) s.rect(3 + s.textW(cut(log[log.length - 1] || '', 27)) + 1, 15 + (n - 1) * 9, 5, 7, ph.hi);
      return;
    }
    if (mode === 'leave') {
      title('LEAVE THE THEATRE?');
      s.para('NOTHING FITTED HERE IS KEPT. THE SUBJECT GOES BACK TO THE PROCESSING ROOM.', 3, 18, W - 6, ph.mid, 9);
      hit('leave:yes', 20, 70, 50, 11); phButton(s, 20, 70, 'LEAVE', hover === 'leave:yes', 50);
      hit('leave:no', 96, 70, 50, 11); phButton(s, 96, 70, 'STAY', hover === 'leave:no', 50);
      return;
    }
    if (mode === 'idle') {
      title('THEATRE 3', cut(subject, 12));
      s.text('TOUCH THE SUBJECT:', 3, 15, ph.mid);
      s.text('ARMS HANDS LEGS EYES JAW', 3, 24, ph.hi);
      s.text('SPINE SKIN  BRAIN=WARES', 3, 33, ph.hi);
      s.hline(2, W - 3, 43, ph.dim);
      const fitted = CYBER_SLOTS.filter((x) => stage.load[x]);
      s.text(`HARDWARE ${fitted.length ? fitted.length + ' FITTED' : '- ALL FLESH'}`, 3, 46, ph.mid);
      fitted.slice(0, 3).forEach((x, i) => s.text(cut(`${SLOT_CODE[x]} ${up(cyberDef(stage.load[x])!.name)}`, 27), 6, 55 + i * 9, ph.hi));
      const o = occupationByKey(occ);
      s.text(cut(`${chipCode(o)} ${up(o.name)}`, 27), 3, 85, ph.mid);
      s.text(`${traits.size} CARD${traits.size === 1 ? '' : 'S'} PUNCHED  CR ${cr(points())}`, 3, 94, points() < 0 ? (blink ? ph.hi : ph.dim) : ph.mid);
      hit('brain', 3, 108, 74, 11); phButton(s, 3, 108, 'BRAIN BAY', hover === 'brain', 74);
      if (blink) s.rect(W - 9, 110, 5, 7, ph.mid);
      return;
    }
    if (mode === 'slot' && slot) {
      const cur = stage.load[slot];
      title(`${SLOT_CODE[slot]} ${up(SLOT_NAME[slot])}`);
      const optsL = slotOptions(slot);
      optsL.forEach((d, i) => {
        const y = 14 + i * 9;
        const fitted = d ? cur === d.key : !cur;
        const un = !d || partUnlocked(d);
        const isPrev = i === preview;
        const hot = hover === 'opt:' + i;
        if (isPrev || hot) s.rect(2, y - 1, W - 4, 9, isPrev ? ph.dim : C(0x0c2a14));
        s.text(isPrev ? '>' : ' ', 3, y, ph.hi);
        s.text(cut(d ? up(d.name) : 'FLESH', 17), 10, y, un ? ph.hi : ph.mid);
        const st = fitted ? 'IN' : un ? 'OK' : 'LOCK';
        s.text(st, W - 4 - s.textW(st), y, fitted ? ph.hi : un ? ph.mid : ph.dim);
        hit('opt:' + i, 2, y - 1, W - 4, 9);
      });
      const y0 = 15 + optsL.length * 9;
      s.hline(2, W - 3, y0, ph.dim);
      const d = optsL[preview] ?? null;
      let y = y0 + 3;
      if (!d) {
        s.text('ORIGINAL - VAT-GROWN', 3, y, ph.mid); y += 9;
        y += 9 * Math.min(2, s.para('+ WHAT YOU WERE BORN WITH. BLEEDS, HEALS, FEELS.', 3, y, W - 6, ph.hi, 9, 2));
        s.para('- NOTHING SPECIAL.', 3, y, W - 6, ph.mid, 9, 1);
      } else {
        s.text(cut(`${up(d.maker)} T${d.tier}  ${d.weight}KG`, 27), 3, y, ph.mid); y += 9;
        s.text(cut(statLine(d), 27), 3, y, ph.hi); y += 9;
        if (partUnlocked(d)) {
          y += 9 * Math.min(2, s.para('+ ' + up(d.good), 3, y, W - 6, ph.hi, 9, 2));
          s.para('- ' + up(d.bad), 3, y, W - 6, ph.mid, 9, 2);
        } else {
          s.text('RESTRICTED: RESEARCH ON', 3, y, ph.hi); y += 9;
          s.text(cut(`THE WATCH. CYBER ${d.cost ?? 5} RP`, 27), 3, y, ph.hi); y += 9;
          const need = (d.requires || []).map((r) => cyberDef(r.replace(/^cyber:/, ''))?.name).filter(Boolean);
          if (need.length) s.text(cut('AFTER ' + up(need.join(', ')), 27), 3, y, ph.mid);
        }
      }
      const can = d ? partUnlocked(d) && cur !== d.key : !!cur;
      const label = d ? 'FIT PART' : 'RESTORE';
      if (can) { hit('fit', 3, 113, 62, 11); phButton(s, 3, 113, label, hover === 'fit', 62); }
      else s.text(d && cur === d.key ? 'FITTED' : d ? 'LOCKED' : 'IN USE', 6, 115, ph.dim);
      hit('back', W - 49, 113, 46, 11); phButton(s, W - 49, 113, 'BACK', hover === 'back', 46);
      return;
    }
    if (mode === 'brain') {
      const p = points();
      title('BRAIN BAY');
      hit('back', W - 39, 0, 36, 11); phButton(s, W - 39, 0, 'BACK', hover === 'back', 36);
      if (deny > 0 && blink) s.text('CREDITS BELOW ZERO', 3, 2, ph.hi);
      // tabs
      hit('tab:carts', 2, 13, 80, 11); phButton(s, 2, 13, 'CARTRIDGES', brainTab === 'carts' || hover === 'tab:carts', 80);
      hit('tab:cards', 85, 13, W - 87, 11); phButton(s, 85, 13, 'PUNCH CARDS', brainTab === 'cards' || hover === 'tab:cards', W - 87);
      let ly = 27;
      if (brainTab === 'cards') {
        hit('sub:assets', 2, ly, 60, 9); s.text(cardTab === 'assets' ? '[ASSETS]' : ' ASSETS ', 3, ly + 1, cardTab === 'assets' ? ph.hi : ph.mid);
        hit('sub:liab', 70, ly, 90, 9); s.text(cardTab === 'liab' ? '[LIABILITIES]' : ' LIABILITIES ', 66, ly + 1, cardTab === 'liab' ? ph.hi : ph.mid);
        ly += 10;
      }
      const list = brainList();
      const rows = 4;
      crt.maxScroll = Math.max(0, list.length - rows);
      crt.scroll = Math.min(crt.scroll, crt.maxScroll);
      for (let i = 0; i < rows && crt.scroll + i < list.length; i++) {
        const idx = crt.scroll + i, e = list[idx], y = ly + i * 10;
        const isJob = 'points' in e;
        const avail = isJob ? occupationAvailable(e as Occupation) : traitAvailable(e as Trait);
        const on = isJob ? occ === e.key : traits.has(e.key);
        const isPrev = idx === preview, hot = hover === 'row:' + idx;
        if (isPrev || hot) s.rect(2, y - 1, W - 4, 10, isPrev ? ph.dim : C(0x0c2a14));
        const c = on ? ph.hi : avail ? ph.mid : ph.dim;
        if (isJob) cartIcon(s, 3, y, c); else cardIcon(s, 3, y, c, idx + 3);
        s.text(cut(up(e.name), 16), 17, y + 1, on ? ph.hi : avail ? ph.mid : ph.dim);
        const cost = cr(isJob ? (e as Occupation).points : (e as Trait).cost);
        s.text(avail ? (on ? '*' : '') + cost : 'LOCK', W - 4 - s.textW(avail ? (on ? '*' : '') + cost : 'LOCK'), y + 1, c);
        hit('row:' + idx, 2, y - 1, W - 4, 10);
      }
      if (crt.maxScroll > 0) {
        const bh = Math.max(4, Math.round((rows / list.length) * rows * 10)), by = ly + Math.round((crt.scroll / list.length) * rows * 10);
        s.vline(W - 1, ly, ly + rows * 10 - 2, ph.dim); s.vline(W - 1, by, by + bh, ph.hi);
      }
      const y0 = ly + rows * 10 + 1;
      s.hline(2, W - 3, y0, ph.dim);
      const e = list[preview] ?? list[crt.scroll];
      if (e) {
        let y = y0 + 3;
        const isJob = 'points' in e;
        const avail = isJob ? occupationAvailable(e as Occupation) : traitAvailable(e as Trait);
        const code = isJob ? chipCode(e as Occupation) : wareCode(e as Trait);
        const sk = isJob ? Object.entries((e as Occupation).skills).map(([k, v]) => `${up((SKILLS.find((q) => q.key === k)?.name || k).slice(0, 4))}${v}`).join(' ') : '';
        s.text(cut(`${code} ${sk}`, 27), 3, y, ph.mid); y += 9;
        if (avail) {
          y += 9 * Math.min(brainTab === 'cards' ? 1 : 2, s.para('+ ' + up(e.good || ''), 3, y, W - 6, ph.hi, 9, brainTab === 'cards' ? 1 : 2));
          s.para('- ' + up(e.bad || ''), 3, y, W - 6, ph.mid, 9, brainTab === 'cards' ? 1 : 2);
        } else {
          const hint = (e as any).unlock?.hint || '';
          y += 9 * Math.min(2, s.para('ENCRYPTED: ' + up(hint), 3, y, W - 6, ph.mid, 9, 2));
          const pr = unlockProgress((isJob ? 'job:' : 'trait:') + e.key);
          s.bar(3, y + 1, 100, 6, pr, ph.hi, ph.bg); s.text(`${Math.round(pr * 100)}%`, 108, y, ph.mid);
        }
      }
      return;
    }
  }

  function pickCrt(id: string) {
    if (closed) return;
    if (id === 'back') { open(null); return; }
    if (id === 'brain') { open('brain'); return; }
    if (id === 'leave:yes') { closed = true; finish(null); return; }
    if (id === 'leave:no') { mode = selected ? (selected === 'brain' ? 'brain' : 'slot') : 'idle'; return; }
    if (id.startsWith('tab:')) { brainTab = id.slice(4) as any; preview = 0; crt.scroll = 0; return; }
    if (id.startsWith('sub:')) { cardTab = id.slice(4) as any; preview = 0; crt.scroll = 0; return; }
    if (id.startsWith('opt:')) { preview = Number(id.slice(4)); stage.shake(0.02); return; }
    if (id === 'fit' && slot) { const d = slotOptions(slot)[preview]; doSwap(slot, d ? d.key : null); return; }
    if (id.startsWith('row:')) {
      const idx = Number(id.slice(4)), e = brainList()[idx];
      if (!e) return;
      const already = preview === idx;
      preview = idx;
      if ('points' in e) {
        if (!occupationAvailable(e) || occ === e.key) return;
        occ = e.key; csfx('cy_bolt', 0.35); stage.shake(0.08);
      } else {
        if (!traitAvailable(e)) return;
        if (traits.has(e.key)) { if (already) { traits.delete(e.key); csfx('cy_hiss', 0.3); } }
        else {
          const clash = TRAITS.find((x) => traits.has(x.key) && ((e.excl || []).includes(x.key) || (x.excl || []).includes(e.key)));
          if (clash) { traits.delete(clash.key); }
          traits.add(e.key); csfx('cy_bolt', 0.3);
        }
      }
    }
  }

  // ---------------- selection
  let selected: Pick | null = null;
  const open = (p: Pick | null) => {
    if (stage.busy || closed) return;
    selected = p;
    stage.select(p);
    preview = 0; crt.scroll = 0;
    if (!p) mode = 'idle';
    else if (p === 'brain') mode = 'brain';
    else {
      mode = 'slot'; slot = p;
      const cur = stage.load[p];
      const i = slotOptions(p).findIndex((d) => (d ? d.key === cur : !cur));
      // preview the first thing that could be fitted, else what is there
      const firstFit = slotOptions(p).findIndex((d) => !!d && partUnlocked(d) && d.key !== cur);
      preview = firstFit >= 0 ? firstFit : Math.max(0, i);
    }
    if (p) csfx('cy_servo', 0.2);
  };
  const doSwap = async (sl: CyberSlot, key: string | null) => {
    if (stage.busy || closed) return;
    mode = 'busy'; log.length = 0;
    const d = key ? cyberDef(key) : null;
    log.push(`> ${SLOT_CODE[sl]} PREP`, '> STRAPS LOCKED');
    for (const s of slotConflicts(sl)) if (stage.load[s]) { log.push(`> REMOVE ${SLOT_CODE[s]}`); await stage.swap(s, null); }
    await stage.swap(sl, key, (ph) => {
      const L: Record<string, string> = { approach: '> SAW ARM DOWN', cut: '> CUTTING', drop: '> SPECIMEN TO TRAY', bring: d ? '> ' + up(cut(d.name, 20)) : '> GRAFT IN', bolt: d ? '> BOLTING 3/3' : '> SUTURE', test: '> SERVO TEST' };
      if (L[ph]) log.push(L[ph]);
    });
    log.push('> DONE');
    if (!closed) mode = 'slot';
  };

  // ---------------- the subject: hover shows the tag, click opens the CRT
  let tagFor: Pick | null = null;
  stage.onHover = (p) => {
    tagFor = p;
    view.style.cursor = p ? 'pointer' : '';
    if (!p) { tag.el.style.display = 'none'; return; }
    if (p === 'brain') drawTag(tag.s, 'BRAIN', cut(chipCode(occupationByKey(occ)), 11), `${traits.size} CARDS`);
    else { const dd = cyberDef(stage.load[p]); drawTag(tag.s, SLOT_CODE[p], dd ? cut(up(dd.name), 11) : 'FLESH', 'OPERATE'); }
    tag.flush();
    tag.el.style.display = '';
  };
  view.addEventListener('click', (e) => {
    if (stage.busy) { stage.hurry = true; return; }
    const r = view.getBoundingClientRect();
    const p = stage.pickAt(e.clientX - r.left, e.clientY - r.top);
    if (p) open(p); else if (selected) open(null);
  });

  // ---------------- the console
  let lever = 0, leverV = 0, pressed = 0, conHover = '';
  con.onHover = (id) => { conHover = id; };
  con.onClick = (id) => {
    if (stage.busy || closed) return;
    if (id === 'lever') deal();
    if (id === 'go') discharge();
  };
  const deal = () => {
    leverV = 1;
    csfx('cy_thunk', 0.7);
    const jobs = OCCUPATIONS.filter(occupationAvailable);
    const pos = TRAITS.filter((t) => traitAvailable(t) && t.cost < 0), neg = TRAITS.filter((t) => traitAvailable(t) && t.cost > 0);
    for (let tries = 0; tries < 40; tries++) {
      const o = jobs[Math.floor(Math.random() * jobs.length)];
      const a = pos[Math.floor(Math.random() * pos.length)], l = neg[Math.floor(Math.random() * neg.length)];
      if (!o || !a || !l || (a.excl || []).includes(l.key) || (l.excl || []).includes(a.key)) continue;
      if (o.points + a.cost + l.cost < 0) continue;
      occ = o.key; traits.clear(); traits.add(a.key); traits.add(l.key);
      break;
    }
    setTimeout(() => { csfx('cy_spark', 0.4); stage.shake(0.2); }, 250);
  };
  const discharge = () => {
    pressed = 0.4;
    csfx('cy_thunk', 0.8);
    if (points() < 0) { csfx('cy_powerdown', 0.5); deny = 2.5; brainTab = 'cards'; open('brain'); return; }
    closed = true;
    open(null);
    root.classList.add('done');
    csfx('cy_hiss', 0.7);
    setTimeout(() => { stampP.el.classList.add('on'); csfx('cy_thunk', 0.9); stage.shake(0.3); }, 450);
    const cyber: Record<string, string> = { ...stage.load } as Record<string, string>;
    setPendingLoadout(cyber as any);
    setTimeout(() => finish({ occupation: occ, traits: [...traits], cyber }), 1700);
  };

  // ---------------- layout: whole-pixel scales, landscape (CRT right, console bottom-left) or portrait (stacked at the bottom)
  const layout = () => {
    const vw = window.innerWidth, vh = window.innerHeight, portrait = vw < vh * 0.9;
    const k = (w: number, h: number, fw: number, fh: number) => Math.max(1, Math.min(3, Math.floor(Math.min((vw * fw) / w, (vh * fh) / h))));
    const kc = portrait ? k(CRT.W, CRT.H, 0.96, 0.4) : k(CRT.W, CRT.H, 0.36, 0.66);
    crt.pix.setScale(kc);
    const kk = portrait ? k(CON.W, CON.H, 0.96, 0.14) : k(CON.W, CON.H, 0.4, 0.2);
    con.setScale(kk);
    root.style.setProperty('--con-h', CON.H * kk + 'px');
    plateP.setScale(portrait ? 1 : Math.min(2, kk));
    tag.setScale(Math.max(1, Math.min(2, kc)));
    stampP.setScale(Math.max(2, kc + 1));
    root.classList.toggle('portrait', portrait);
    stage.setViewShift(portrait ? 0 : 0.14, portrait ? -0.18 : 0);
  };
  layout();
  window.addEventListener('resize', layout);

  // ---------------- the loop: instruments at ~15 fps, the tag every frame
  let raf = 0, last = performance.now(), acc = 0;
  const _sp = { x: 0, y: 0 };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    acc += dt;
    deny = Math.max(0, deny - dt);
    lever += (leverV - lever) * Math.min(1, dt * 14); if (lever > 0.95) leverV = 0;
    pressed = Math.max(0, pressed - dt);
    if (acc > 1 / 15) {
      root.classList.toggle('busy', stage.busy);
      crt.frame(acc);
      const hits = drawConsole(con.s, points(), researchPoints(), lever, pressed, conHover, now / 1000);
      con.hits.length = 0;
      con.hit('lever', ...hits.lever); con.hit('go', ...hits.go);
      con.flush();
      acc = 0;
    }
    if (tagFor && !stage.busy) {
      const sp = stage.toScreen(stage.anchor(tagFor));
      if (sp) { _sp.x = sp.x; _sp.y = sp.y; tag.el.style.transform = `translate(${Math.round(_sp.x)}px, ${Math.round(_sp.y - TAG.H * tag.scale)}px)`; }
    } else if (stage.busy) tag.el.style.display = 'none';
  };
  raf = requestAnimationFrame(tick);
  tag.el.style.display = 'none';

  const finish = (r: SurgeryResult | null) => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', layout);
    stage.dispose();
    root.remove();
    onDone(r);
  };
  const onKey = (e: KeyboardEvent) => {
    if (closed) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (stage.busy) { stage.hurry = true; return; }
      if (mode === 'leave') { mode = 'idle'; return; }
      if (selected) { open(null); return; }
      mode = 'leave';
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const n = mode === 'slot' && slot ? slotOptions(slot).length : mode === 'brain' ? brainList().length : 0;
      if (!n) return;
      preview = (preview + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      if (mode === 'brain') { const rows = 4; if (preview < crt.scroll) crt.scroll = preview; if (preview >= crt.scroll + rows) crt.scroll = preview - rows + 1; }
      csfx('cy_beep', 0.1, 1.4);
    } else if (e.key === 'Enter') {
      if (mode === 'slot') pickCrt('fit');
      else if (mode === 'brain') pickCrt('row:' + preview);
      else if (mode === 'idle') discharge();
    }
  };
  window.addEventListener('keydown', onKey, true);

  root.classList.add('intro');
  mode = 'busy'; log.push('> SUBJECT INBOUND', '> GANTRY ENGAGED');
  stage.intro().then(() => { root.classList.remove('intro'); log.push('> ON THE TABLE', '> READY'); mode = 'idle'; csfx('cy_powerup', 0.5); });
  if (import.meta.env.DEV) (window as any).__surgery = { stage, open, swap: doSwap, go: discharge, deal, get occ() { return occ; }, traits, crt, pick: pickCrt, get mode() { return mode; } };
  void PH;
  return { close: () => { if (!closed) { closed = true; finish(null); } }, el: root };
}

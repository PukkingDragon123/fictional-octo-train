// SURGICAL THEATRE No.3 — the character creator's last stop. After the look
// (and the gender press) the menus call startSurgery(app, onDone): a ceiling
// gantry carries the subject onto the table (stage.ts). Touch an arm, a hand,
// a leg, the eyes, the jaw, the spine or the skin: a typewritten tag swings on
// it, and the tele-diagnostic CRT lists what can go there (only the Scrapjack
// Arm to begin with; the rest is researched on the watch, branch 'cyber', or
// found in a run). FIT PART and the robot arms take the flesh off and bolt the
// hardware on. Touch the brain for WARES: programmes as plug-in cartridges (the
// occupations) and conditions as punch cards (the traits), each with what it
// gives and what it costs, paid in credits glowing in the desk's Nixie tubes.
// Pull the DEAL lever to let the machine choose; press the red DISCHARGE button
// to be sealed: a typed discharge slip is stamped and handed over.
// Every readout lives on a physical instrument (instruments.ts): no DOM text.
// Returns {occupation, traits, cyber}; the loadout is also left for the next
// new survivor (src/survival/cyber.ts setPendingLoadout).
import * as THREE from 'three';
import type { Appearance, Outfit } from '../../entities/humanRig';
import { OCCUPATIONS, TRAITS, SKILLS, Occupation, Trait, occupationAvailable, traitAvailable, occupationByKey, chipCode, wareCode } from '../../survival/traits';
import { unlockProgress } from '../../survival/unlocks';
import { CYBER_SLOTS, CyberSlot, SLOT_CODE, SLOT_NAME, partsFor, cyberDef, slotConflicts, CyberDef } from '../../survival/cyberParts';
import { partUnlocked, setPendingLoadout } from '../../survival/cyber';
import { researchPoints } from '../../game/research';
import { Player } from '../../entities/player';
import { hasItemDef } from '../../items/item';
import { SurgeryStage, Pick } from './stage';
import { csfx } from './audio';
import { Crt3D, CrtPen, Console3D, Tag3D, dischargeSlip, PH } from './instruments';
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
const cr = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
/** short stat line for a part */
function statLine(d: CyberDef): string {
  const f = d.fx, o: string[] = [];
  const p = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
  if (f.attack) o.push('ATK ' + p(f.attack));
  if (f.action) o.push('HANDS ' + p(-f.action));
  if (f.aim) o.push('AIM ' + p(f.aim));
  if (f.move) o.push('SPD ' + p(f.move));
  if (f.carry) o.push(`LOAD +${f.carry}KG`);
  if (f.armor) o.push(`ARMOUR ${Math.round(f.armor * 100)}%`);
  if (f.noise) o.push('LOUD');
  if (f.rust) o.push('RUSTS');
  if (f.drain) o.push(`BATT −${f.drain}%/H`);
  return o.join('  ');
}

export function startSurgery(app: Appearance, onDone: (r: SurgeryResult | null) => void, opts: SurgeryOpts = {}): { close: () => void; el: HTMLElement } {
  let occ = opts.occupation && occupationAvailable(occupationByKey(opts.occupation)) ? opts.occupation : 'unemployed';
  const traits = new Set((opts.traits || []).filter((k) => { const t = TRAITS.find((x) => x.key === k); return !!t && traitAvailable(t); }));
  const points = () => { let p = occupationByKey(occ).points; for (const k of traits) p += TRAITS.find((x) => x.key === k)?.cost ?? 0; return p; };
  const subject = up(cut(opts.name || 'UNNAMED', 18));
  let closed = false;

  const root = document.createElement('div');
  root.className = 'sg-root';
  const view = document.createElement('div'); view.className = 'sg-view';
  root.append(view);
  (opts.host || document.body).append(root);
  const stage = new SurgeryStage(view, 'intake');
  const load: Record<string, string> = {};
  for (const [s, k] of Object.entries(opts.cyber || {})) { const d = cyberDef(k); if (d && partUnlocked(d)) load[s] = k; }
  stage.setSubject(app, opts.outfit || jumpsuitOutfit(), load as any, []);
  stage.setRack(CYBER_SLOTS.filter((s) => s === 'arm_r' || s === 'leg_r' || s === 'hand_r' || s === 'eyes').flatMap((s) => partsFor(s).map((d) => ({ key: d.key, slot: s, unlocked: partUnlocked(d) }))));

  // ---------------- the instruments
  type Mode = 'idle' | 'slot' | 'brain' | 'leave' | 'busy';
  let mode: Mode = 'idle';
  let slot: CyberSlot | null = null;
  let preview = 0;
  let brainTab: 'carts' | 'cards' = 'carts';
  let cardTab: 'assets' | 'liab' = 'assets';
  let deny = 0;
  const log: string[] = [];
  const crt = new Crt3D(drawCrt, pickCrt);
  const desk = new Console3D('SURGICAL THEATRE No.3', 'SUBJECT ' + subject);
  const tag = new Tag3D();
  const fgLights = new THREE.Group();
  const key = new THREE.DirectionalLight(0xfff0dc, 1.5); key.position.set(-2, 3, 2); fgLights.add(key);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 0.6); rim.position.set(3, 1, -1); fgLights.add(rim);
  fgLights.add(new THREE.AmbientLight(0x6a6458, 0.6));
  stage.fg.add(fgLights, crt.group, desk.group, tag.group);
  let slip: THREE.Mesh | null = null;

  function slotOptions(sl: CyberSlot) { return [null, ...partsFor(sl)] as (CyberDef | null)[]; }
  function brainList(): (Occupation | Trait)[] {
    return brainTab === 'carts' ? OCCUPATIONS : TRAITS.filter((t) => (cardTab === 'assets' ? t.cost <= 0 : t.cost > 0));
  }

  function drawCrt(pen: CrtPen, t: number) {
    const W = pen.W, H = pen.H, L = 20, X = 14;
    const blink = (t * 2) % 1 < 0.55;
    const title = (a: string, b = '') => { pen.text(a, X, 10, PH.hi, 17); if (b) pen.text(b, W - X, 12, PH.mid, 14, 'right'); pen.rule(34); };
    if (mode === 'busy') {
      title('OPERATING', blink ? '● REC' : '');
      const n = Math.min(log.length, 12);
      for (let i = 0; i < n; i++) pen.text(cut(log[log.length - n + i], 38), X, 44 + i * L, i === n - 1 ? PH.hi : PH.mid, 15);
      if (blink) pen.fill(X + pen.width(cut(log[log.length - 1] || '', 38)) + 4, 44 + (n - 1) * L + 2, 9, 15, PH.hi);
      return;
    }
    if (mode === 'leave') {
      title('LEAVE THE THEATRE?');
      pen.para('Nothing fitted here is kept. The subject goes back to processing.', X, 50, W - 2 * X, PH.mid, 15, 20);
      pen.button('leave:yes', 'LEAVE', X, 130, 120);
      pen.button('leave:no', 'STAY', W - X - 120, 130, 120);
      return;
    }
    if (mode === 'idle') {
      title('THEATRE No.3', cut(subject, 16));
      pen.text('TOUCH THE SUBJECT TO OPERATE:', X, 44, PH.mid, 15);
      pen.text('ARMS · HANDS · LEGS · EYES · JAW', X, 66, PH.hi, 15);
      pen.text('SPINE · SKIN       BRAIN = WARES', X, 86, PH.hi, 15);
      pen.rule(112);
      const fitted = CYBER_SLOTS.filter((x) => stage.load[x]);
      pen.text(`HARDWARE  ${fitted.length ? fitted.length + ' FITTED' : '— ALL FLESH'}`, X, 120, PH.mid, 15);
      fitted.slice(0, 3).forEach((x, i) => pen.text(cut(`${SLOT_CODE[x]}  ${up(cyberDef(stage.load[x])!.name)}`, 36), X + 10, 142 + i * L, PH.hi, 15));
      const o = occupationByKey(occ);
      pen.text(cut(`CARTRIDGE ${chipCode(o)}  ${up(o.name)}`, 40), X, 212, PH.mid, 14);
      pen.text(`${traits.size} CARD${traits.size === 1 ? '' : 'S'} PUNCHED   CREDITS ${cr(points())}`, X, 232, points() < 0 ? (blink ? PH.hi : PH.dim) : PH.mid, 14);
      pen.button('brain', 'OPEN BRAIN BAY', X, H - 46, 180);
      if (blink) pen.fill(W - X - 10, H - 42, 10, 16, PH.mid);
      return;
    }
    if (mode === 'slot' && slot) {
      const cur = stage.load[slot];
      title(`${SLOT_CODE[slot]}  ${up(SLOT_NAME[slot])}`);
      const optsL = slotOptions(slot);
      optsL.forEach((d, i) => {
        const y = 42 + i * L;
        const fitted = d ? cur === d.key : !cur;
        const un = !d || partUnlocked(d);
        const isPrev = i === preview, hot = pen.hover === 'opt:' + i;
        if (isPrev || hot) pen.fill(8, y - 2, W - 16, L - 1, isPrev ? '#0f3a1e' : '#0a2414');
        pen.text(isPrev ? '▸' : ' ', X - 4, y, PH.hi, 15);
        pen.text(cut(d ? up(d.name) : 'FLESH (ORIGINAL)', 28), X + 12, y, un ? PH.hi : PH.dim, 15);
        const st = fitted ? 'FITTED' : un ? 'READY' : 'LOCKED';
        pen.text(st, W - X, y, fitted ? PH.hi : un ? PH.mid : PH.dim, 13, 'right');
        pen.hit('opt:' + i, 8, y - 2, W - 16, L - 1);
      });
      const y0 = 46 + optsL.length * L;
      pen.rule(y0);
      const d = optsL[preview] ?? null;
      let y = y0 + 8;
      if (!d) {
        pen.text('VAT-GROWN FLESH, STITCHED BACK ON', X, y, PH.mid, 14); y += L;
        y += 18 * pen.para('+ What you were born with. Bleeds, heals, feels.', X, y, W - 2 * X, PH.hi, 14, 18, 2);
        pen.para('− Nothing special.', X, y, W - 2 * X, PH.mid, 14, 18, 1);
      } else {
        pen.text(cut(`${up(d.maker)}  ·  TIER ${d.tier}  ·  ${d.weight} KG`, 44), X, y, PH.mid, 13); y += 18;
        pen.text(cut(statLine(d), 48), X, y, PH.hi, 13); y += 22;
        if (partUnlocked(d)) {
          y += 18 * pen.para('+ ' + d.good, X, y, W - 2 * X, PH.hi, 14, 18, 2);
          pen.para('− ' + d.bad, X, y, W - 2 * X, PH.mid, 14, 18, 2);
        } else {
          pen.text('RESTRICTED HARDWARE', X, y, PH.hi, 14); y += 18;
          pen.text(cut(`RESEARCH ON THE WATCH: CYBER · ${d.cost ?? 5} RP`, 46), X, y, PH.mid, 13); y += 18;
          const need = (d.requires || []).map((r) => cyberDef(r.replace(/^cyber:/, ''))?.name).filter(Boolean);
          if (need.length) pen.text(cut('AFTER ' + up(need.join(', ')), 46), X, y, PH.dim, 13);
        }
      }
      const can = d ? partUnlocked(d) && cur !== d.key : !!cur;
      if (can) pen.button('fit', d ? 'FIT PART ▸' : 'RESTORE FLESH', X, H - 34, 170);
      else pen.text(d && cur === d.key ? 'FITTED' : d ? 'LOCKED' : 'IN USE', X + 6, H - 30, PH.dim, 15);
      pen.button('back', 'BACK', W - X - 100, H - 34, 100);
      return;
    }
    if (mode === 'brain') {
      title('BRAIN BAY', deny > 0 && blink ? 'CREDITS BELOW ZERO' : `CREDITS ${cr(points())}`);
      pen.button('tab:carts', 'CARTRIDGES', X, 40, 180, brainTab === 'carts');
      pen.button('tab:cards', 'PUNCH CARDS', W - X - 180, 40, 180, brainTab === 'cards');
      let ly = 74;
      if (brainTab === 'cards') {
        pen.hit('sub:assets', X, ly - 2, 150, 18); pen.text(cardTab === 'assets' ? '[ ASSETS ]' : '  ASSETS', X, ly, cardTab === 'assets' ? PH.hi : PH.dim, 13);
        pen.hit('sub:liab', 170, ly - 2, 220, 18); pen.text(cardTab === 'liab' ? '[ LIABILITIES ]' : '  LIABILITIES', 170, ly, cardTab === 'liab' ? PH.hi : PH.dim, 13);
        ly += 20;
      }
      const list = brainList();
      const rows = brainTab === 'cards' ? 5 : 6;
      crt.maxScroll = Math.max(0, list.length - rows);
      crt.scroll = Math.min(crt.scroll, crt.maxScroll);
      for (let i = 0; i < rows && crt.scroll + i < list.length; i++) {
        const idx = crt.scroll + i, e = list[idx], y = ly + i * L;
        const isJob = 'points' in e;
        const avail = isJob ? occupationAvailable(e as Occupation) : traitAvailable(e as Trait);
        const on = isJob ? occ === e.key : traits.has(e.key);
        const isPrev = idx === preview, hot = pen.hover === 'row:' + idx;
        if (isPrev || hot) pen.fill(8, y - 2, W - 16, L - 1, isPrev ? '#0f3a1e' : '#0a2414');
        const c = on ? PH.hi : avail ? PH.mid : PH.dim;
        if (isJob) pen.cart(X, y, c); else pen.card(X, y, c, idx + 3);
        pen.text(cut(up(e.name), 26), X + 30, y, c, 15);
        const cost = cr(isJob ? (e as Occupation).points : (e as Trait).cost);
        pen.text(avail ? (on ? '● ' : '') + cost : 'LOCKED', W - X - 6, y, c, 13, 'right');
        pen.hit('row:' + idx, 8, y - 2, W - 16, L - 1);
      }
      if (crt.maxScroll > 0) {
        const th = rows * L, bh = Math.max(10, (rows / list.length) * th), by = ly + (crt.scroll / list.length) * th;
        pen.fill(W - 9, ly - 2, 2, th, PH.dim); pen.fill(W - 10, by, 4, bh, PH.hi);
      }
      const y0 = ly + rows * L + 2;
      pen.rule(y0);
      const e = list[preview] ?? list[crt.scroll];
      if (e) {
        let y = y0 + 8;
        const isJob = 'points' in e;
        const avail = isJob ? occupationAvailable(e as Occupation) : traitAvailable(e as Trait);
        const code = isJob ? chipCode(e as Occupation) : wareCode(e as Trait);
        const sk = isJob ? Object.entries((e as Occupation).skills).map(([k, v]) => `${up((SKILLS.find((q) => q.key === k)?.name || k))} ${v}`).join(' · ') : '';
        pen.text(cut(`${code}${sk ? '  ' + sk : ''}`, 48), X, y, PH.mid, 13); y += 19;
        const ml = brainTab === 'cards' ? 1 : 2;
        if (avail) {
          y += 18 * pen.para('+ ' + (e.good || ''), X, y, W - 2 * X, PH.hi, 14, 18, ml);
          pen.para('− ' + (e.bad || ''), X, y, W - 2 * X, PH.mid, 14, 18, ml);
        } else {
          const hint = (e as any).unlock?.hint || '';
          y += 18 * pen.para('ENCRYPTED. ' + hint, X, y, W - 2 * X, PH.mid, 14, 18, 2);
          const pr = unlockProgress((isJob ? 'job:' : 'trait:') + e.key);
          pen.bar(X, y + 2, 200, 12, pr); pen.text(`${Math.round(pr * 100)}%`, X + 210, y, PH.mid, 13);
        }
      }
      pen.button('back', 'BACK', W - X - 100, H - 30, 100);
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
    if (id.startsWith('opt:')) { preview = Number(id.slice(4)); return; }
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
          if (clash) traits.delete(clash.key);
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
      const firstFit = slotOptions(p).findIndex((d) => !!d && partUnlocked(d) && d.key !== cur);
      preview = firstFit >= 0 ? firstFit : Math.max(0, i);
    }
    if (p) csfx('cy_servo', 0.2);
    stage.onHover?.(null);
  };
  const doSwap = async (sl: CyberSlot, key: string | null) => {
    if (stage.busy || closed) return;
    mode = 'busy'; log.length = 0;
    const d = key ? cyberDef(key) : null;
    log.push(`> ${SLOT_CODE[sl]} — ${up(SLOT_NAME[sl])}`, '> RESTRAINTS LOCKED');
    for (const s of slotConflicts(sl)) if (stage.load[s]) { log.push(`> REMOVING ${SLOT_CODE[s]}`); await stage.swap(s, null); }
    await stage.swap(sl, key, (ph) => {
      const M: Record<string, string> = { approach: '> SAW ARM DOWN', cut: '> CUTTING', drop: '> SPECIMEN TO TRAY', bring: d ? '> FITTING ' + up(cut(d.name, 24)) : '> GRAFTING FLESH', bolt: d ? '> BOLTING 3 OF 3' : '> SUTURING', test: '> SERVO TEST' };
      if (M[ph]) log.push(M[ph]);
    });
    log.push('> COMPLETE');
    if (!closed) mode = 'slot';
  };

  // ---------------- pointer: the instruments, else the subject
  let tagFor: Pick | null = null;
  stage.onHover = (hp) => {
    // the tag follows the pointer, and stays on the part being worked on (touch has no hover)
    const p = hp ?? selected;
    tagFor = p;
    if (!p) { tag.group.visible = false; return; }
    if (p === 'brain') tag.write('BRAIN', chipCode(occupationByKey(occ)), `${traits.size} cards punched`);
    else { const dd = cyberDef(stage.load[p]); tag.write(SLOT_CODE[p], dd ? cut(up(dd.name), 18) : 'FLESH', 'touch to operate'); }
    tag.group.visible = true;
  };
  stage.onFgHover = (id, hit) => {
    crt.pointer(id, hit);
    desk.hover = id === 'lever' || id === 'go' ? id : '';
  };
  stage.onClick = (id, hit, p) => {
    if (closed) return;
    if (id) {
      if (crt.click(id, hit)) return;
      if (stage.busy) return;
      if (id === 'lever') deal();
      if (id === 'go') discharge();
      return;
    }
    if (p) open(p); else if (selected) open(null);
  };

  // ---------------- the desk controls
  const deal = () => {
    desk.pull();
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
  let slipT = 0;
  const discharge = () => {
    desk.push();
    if (points() < 0) { csfx('cy_powerdown', 0.5); deny = 2.5; brainTab = 'cards'; open('brain'); return; }
    closed = true;
    open(null);
    csfx('cy_hiss', 0.7);
    const o = occupationByKey(occ);
    const hw = CYBER_SLOTS.filter((s) => stage.load[s]).map((s) => `${SLOT_CODE[s]} ${cyberDef(stage.load[s])!.name}`);
    const lines = [`SUBJECT ........ ${subject}`, `PROGRAMME ...... ${chipCode(o)} ${o.name}`, `WARES .......... ${[...traits].map((k) => TRAITS.find((x) => x.key === k)?.name).filter(Boolean).join(', ') || 'none'}`, `HARDWARE ....... ${hw.length ? hw.join('; ') : 'none (all flesh)'}`, `CREDIT BALANCE . ${cr(points())}`];
    const t = dischargeSlip(lines);
    slip = t.mesh;
    slip.position.set(0, -2, -2.4); slip.rotation.set(-0.12, 0, 0.05);
    stage.fg.add(slip);
    slipT = 0;
    setTimeout(() => { csfx('cy_thunk', 0.9); stage.shake(0.3); }, 700);
    const cyber: Record<string, string> = { ...stage.load } as Record<string, string>;
    setPendingLoadout(cyber as any);
    setTimeout(() => finish({ occupation: occ, traits: [...traits], cyber }), 2600);
  };

  // ---------------- layout in the instrument layer (camera at the origin looking down -z)
  const D = 3, tanH = Math.tan((15 * Math.PI) / 180);
  const _a = new THREE.Vector3();
  const layout = () => {
    const asp = stage.fgCam.aspect || 16 / 9;
    const hh = tanH * D, hw = hh * asp, portrait = asp < 0.9;
    if (!portrait) {
      const sc = Math.min(1, (hw * 0.82) / 1.05);
      crt.group.scale.setScalar(sc); crt.group.position.set(hw - 0.58 * sc, 0.06, -D); crt.group.rotation.set(0, -0.22, 0);
      const sk = Math.min(1, (hw * 0.95) / 1.6);
      desk.group.scale.setScalar(sk); desk.group.position.set(-hw + 0.82 * sk, -hh + 0.34 * sk, -D); desk.group.rotation.set(-0.32, 0.12, 0);
      stage.setViewShift(0.13, 0);
    } else {
      const sc = Math.min(1, (hw * 1.9) / 1.05);
      const sk = Math.min(1, (hw * 1.9) / 1.6);
      desk.group.scale.setScalar(sk); desk.group.position.set(0, -hh + 0.34 * sk, -D); desk.group.rotation.set(-0.32, 0, 0);
      crt.group.scale.setScalar(sc); crt.group.position.set(0, -hh + 0.7 * sk + 0.48 * sc, -D); crt.group.rotation.set(0, 0, 0);
      stage.setViewShift(0, -0.22);
    }
  };
  let lastAsp = 0;

  stage.onFrame = (dt) => {
    if (stage.fgCam.aspect !== lastAsp) { lastAsp = stage.fgCam.aspect; layout(); }
    deny = Math.max(0, deny - dt);
    crt.frame(dt, stage.busy);
    desk.set(points(), researchPoints());
    desk.frame(dt);
    // the tag hangs off the part under the pointer (projected into this layer)
    if (tagFor && !stage.busy && tag.group.visible) {
      const sp = stage.toScreen(stage.anchor(tagFor, _a));
      const r = stage.canvas.getBoundingClientRect();
      if (sp && r.width) {
        const z = 2.6, hh = tanH * z, hw = hh * stage.fgCam.aspect;
        tag.place(_a.set(((sp.x / r.width) * 2 - 1) * hw, (1 - (sp.y / r.height) * 2) * hh, -z), dt);
      }
    } else if (stage.busy) tag.group.visible = false;
    // the discharge slip slides up in front of everything
    if (slip) { slipT += dt; const k = 1 - Math.pow(1 - Math.min(1, slipT / 0.6), 3); slip.position.y = -2 + k * 2; slip.position.z = -2.4 + k * 0.2; }
  };

  const finish = (r: SurgeryResult | null) => {
    window.removeEventListener('keydown', onKey, true);
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
      if (mode === 'brain') { const rows = brainTab === 'cards' ? 5 : 6; if (preview < crt.scroll) crt.scroll = preview; if (preview >= crt.scroll + rows) crt.scroll = preview - rows + 1; }
      csfx('cy_beep', 0.1, 1.4);
    } else if (e.key === 'Enter') {
      if (mode === 'slot') pickCrt('fit');
      else if (mode === 'brain') pickCrt('row:' + preview);
      else if (mode === 'idle') discharge();
    }
  };
  window.addEventListener('keydown', onKey, true);
  view.addEventListener('wheel', (e) => { if (mode === 'brain') { e.preventDefault(); crt.scrollBy(Math.sign(e.deltaY)); } }, { passive: false });

  mode = 'busy'; log.push('> SUBJECT INBOUND', '> GANTRY ENGAGED');
  stage.intro().then(() => { log.push('> ON THE TABLE', '> READY'); mode = 'idle'; csfx('cy_powerup', 0.5); });
  if (import.meta.env.DEV) (window as any).__surgery = { stage, open, swap: doSwap, go: discharge, deal, get occ() { return occ; }, traits, crt, desk, pick: pickCrt, get mode() { return mode; } };
  return { close: () => { if (!closed) { closed = true; finish(null); } }, el: root };
}

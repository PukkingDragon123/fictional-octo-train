// FIELD SURGERY: fitting hardware in a run, on an operating table or with a
// surgery rig, from your own eyes. The tele-diagnostic CRT lists every part
// you carry and where it can go (and what can come out); BEGIN straps you down
// (a locking action) and the same robot arms (stage.ts, first-person framing)
// take the limb off and bolt the metal on. No anaesthetic: it costs blood,
// pain, panic and a memory. Applied only when the sequence completes
// (installPart / removePart in src/survival/cyber.ts).
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { TimedAction } from '../../actions/action';
import type { Player } from '../../entities/player';
import type { Item } from '../../items/item';
import { fpClaim, fpRelease } from '../../fp/fp';
import { addStat } from '../../game/profile';
import { CYBER_SLOTS, CyberSlot, SLOT_KIND, SLOT_CODE, cyberDef, cyberDefByItem, slotConflicts, loadoutOf, installPart, removePart } from '../../survival/cyber';
import { SurgeryStage } from './stage';
import { csfx } from './audio';
import { TeleCrt } from './crt';
import { CRT, ph, phButton, C } from './panel';
import './surgery.css';

class SelfSurgery extends TimedAction {
  finished = false;
  constructor(p: Player, public label: string) {
    super(p);
    this.name = label; this.duration = 600; this.fixedTime = true; this.locks = true; this.canMove = false; this.anim = 'craft'; this.showBar = false;
  }
  update() { if (this.finished) this.done = true; }
  perform() { /* applied by the cutscene */ }
}

let openNow = false;
const up = (s: string) => s.toUpperCase();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '.' : s);

export function fieldSurgery(p: Player) {
  if (openNow || !p?.isLocal || p.body.dead) return;
  openNow = true;
  const b = p.body;
  const load = loadoutOf(b);
  const root = document.createElement('div');
  root.className = 'sg-root field';
  const view = document.createElement('div'); view.className = 'sg-view';
  root.append(view);
  document.body.append(root);
  fpClaim('surgery', 5);
  const stage = new SurgeryStage(view, 'field');
  const { cond: _c, ...outfit } = p.computeOutfit() as any;
  void _c;
  stage.setSubject(p.app, outfit, load as any, [...b.severed]);
  stage.intro(true);
  let action: SelfSurgery | null = null;
  let ended = false;

  // ---- what can be done: every part carried, onto every slot it fits; hardware that can come out
  const rows: { a: string; b: string; slot: CyberSlot; key: string | null; item: Item | null }[] = [];
  const seen = new Set<string>();
  for (const it of p.allItems()) {
    const d = cyberDefByItem(it.key);
    if (!d || seen.has(d.key)) continue;
    seen.add(d.key);
    for (const slot of CYBER_SLOTS) {
      if (SLOT_KIND[slot] !== d.kind || load[slot] === d.key) continue;
      if (d.kind === 'hand' && b.severed.includes(`farm_${slot.slice(-1)}` as any)) continue;
      rows.push({ a: 'FIT ' + up(d.name), b: SLOT_CODE[slot] + (load[slot] || slotConflicts(slot).some((s) => load[s]) ? ' REPLACES METAL' : b.severed.some((x) => x.endsWith(slot.slice(-2))) && SLOT_KIND[slot] !== 'eyes' ? ' ON THE STUMP' : ' CUTS FLESH'), slot, key: d.key, item: it });
    }
  }
  for (const slot of CYBER_SLOTS) if (load[slot]) rows.push({ a: 'OUT ' + up(cyberDef(load[slot])!.name), b: SLOT_CODE[slot] + ' CAPPED SOCKET', slot, key: null, item: null });
  let pick = 0;
  const log: string[] = [];
  let busy = false;
  const crt = new TeleCrt((s, hit, hover, t) => {
    const W = CRT.SW, blink = (t * 2) % 1 < 0.55;
    s.text(busy ? 'OPERATING' : 'SELF-SURGERY', 3, 2, ph.hi);
    s.text(busy ? (blink ? '*REC' : '') : 'NO ANAESTH.', W - 3 - s.textW(busy ? '*REC' : 'NO ANAESTH.'), 2, ph.mid);
    s.hline(2, W - 3, 11, ph.dim);
    if (busy) {
      const n = Math.min(log.length, 11);
      for (let i = 0; i < n; i++) s.text(cut(log[log.length - n + i], 27), 3, 15 + i * 9, i === n - 1 ? ph.hi : ph.mid);
      return;
    }
    if (!rows.length) {
      s.para('NOTHING TO FIT. FIND A PART OUT THERE OR BUILD A SCRAPJACK AT A WORKBENCH.', 3, 16, W - 6, ph.mid, 9);
    }
    const vis = 5;
    crt.maxScroll = Math.max(0, rows.length - vis);
    for (let i = 0; i < vis && crt.scroll + i < rows.length; i++) {
      const idx = crt.scroll + i, r = rows[idx], y = 15 + i * 18;
      if (idx === pick || hover === 'row:' + idx) s.rect(2, y - 1, W - 4, 18, idx === pick ? ph.dim : C(0x0c2a14));
      s.text(cut(r.a, 27), 4, y, ph.hi);
      s.text(cut(r.b, 27), 10, y + 8, ph.mid);
      hit('row:' + idx, 2, y - 1, W - 4, 18);
    }
    if (rows.length) { hit('go', 3, 113, 62, 11); phButton(s, 3, 113, 'BEGIN', hover === 'go', 62); }
    hit('off', W - 61, 113, 58, 11); phButton(s, W - 61, 113, 'CLIMB OFF', hover === 'off', 58);
  }, (id) => {
    if (busy || ended) return;
    if (id === 'off') close();
    else if (id.startsWith('row:')) pick = Number(id.slice(4));
    else if (id === 'go' && rows[pick]) go(rows[pick]);
  });
  root.append(crt.pix.el);
  const k = Math.max(1, Math.min(3, Math.floor(Math.min((innerWidth * 0.36) / CRT.W, (innerHeight * 0.66) / CRT.H))));
  crt.pix.setScale(k);
  stage.setViewShift(innerWidth > innerHeight ? 0.12 : 0, 0);
  let raf = 0, last = performance.now();
  const tick = (now: number) => { raf = requestAnimationFrame(tick); const dt = (now - last) / 1000; if (dt < 1 / 15) return; last = now; crt.frame(dt); };
  raf = requestAnimationFrame(tick);

  const close = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    stage.dispose(); root.remove();
    fpRelease('surgery');
    openNow = false;
    if (action && !action.finished) { action.finished = true; action.cancelled = true; }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);

  const go = async (r: (typeof rows)[number]) => {
    if (stage.busy || ended) return;
    busy = true;
    log.push('> STRAPS ON', '> BITE DOWN');
    action = new SelfSurgery(p, r.key ? 'Self-surgery' : 'Removing hardware');
    p.actions.clear(); p.actions.add(action);
    bus.emit('subtitle', { who: p.name, text: r.key ? 'Okay. Okay okay okay.' : 'Get it OFF me.', x: p.x, y: p.y + 1.8, z: p.z });
    for (const s of slotConflicts(r.slot)) if (stage.load[s]) await stage.swap(s, null);
    await stage.swap(r.slot, r.key, (ph) => {
      const L: Record<string, string> = { approach: '> SAW ARM DOWN', cut: '> CUTTING. SCREAMING.', drop: '> SPECIMEN TO TRAY', bring: '> HARDWARE IN', bolt: '> BOLTING', test: '> SERVO TEST' };
      if (L[ph]) log.push(L[ph]);
    });
    if (ended || action.cancelled) { close(); return; }
    // ---- it is done: apply for real
    const ok = r.key ? installPart(p, r.slot, r.key, { item: r.item, giveBack: true }) : removePart(p, r.slot, true);
    if (ok) {
      const hard = (b.perks.has('chop_doc') ? 0.5 : 1) * (b.painkiller > 0 ? 0.6 : 1);
      b.panic = Math.min(100, b.panic + 70 * hard); b.stress = Math.min(100, b.stress + 30 * hard); b.unhappy = Math.min(100, b.unhappy + 10 * hard);
      b.blood = Math.max(30, b.blood - 9 * hard); b.health = Math.max(5, b.health - 7 * hard);
      try { G.survival?.mind?.addTrauma?.(b, 0.15 * hard, 'self-surgery', 0.4); } catch { /* no mind */ }
      if (r.key) addStat('cyber_fitted', 1);
      bus.emit('subtitle', { who: p.name, text: 'AAAAAGH- ...it moves. It MOVES.', style: 'shout', x: p.x, y: p.y + 1.8, z: p.z });
      bus.emit('noise', { x: p.x, z: p.z, radius: 20, kind: 'scream', zone: p.zoneKey, by: p.id });
      csfx('cy_powerup', 0.6);
      log.push('> DONE');
    }
    action.finished = true;
    setTimeout(close, 1100);
  };
}

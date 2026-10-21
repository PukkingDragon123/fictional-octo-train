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
import * as THREE from 'three';
import { Crt3D, PH } from './instruments';
import '../fonts.css';
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
      if (d.kind === 'hand' && (b.severed.includes(`farm_${slot.slice(-1)}` as any) || load[`arm_${slot.slice(-1)}` as CyberSlot])) continue;
      rows.push({ a: 'FIT ' + up(d.name), b: SLOT_CODE[slot] + (load[slot] || slotConflicts(slot).some((s) => load[s]) ? ' REPLACES METAL' : b.severed.some((x) => x.endsWith(slot.slice(-2))) && SLOT_KIND[slot] !== 'eyes' ? ' ON THE STUMP' : ' CUTS FLESH'), slot, key: d.key, item: it });
    }
  }
  for (const slot of CYBER_SLOTS) if (load[slot]) rows.push({ a: 'OUT ' + up(cyberDef(load[slot])!.name), b: SLOT_CODE[slot] + ' CAPPED SOCKET', slot, key: null, item: null });
  let pick = 0;
  const log: string[] = [];
  let busy = false;
  const crt = new Crt3D((pen, t) => {
    const W = pen.W, H = pen.H, X = 14, blink = (t * 2) % 1 < 0.55;
    pen.text(busy ? 'OPERATING' : 'SELF-SURGERY', X, 10, PH.hi, 17);
    pen.text(busy ? (blink ? '● REC' : '') : 'NO ANAESTHETIC', W - X, 12, PH.mid, 13, 'right');
    pen.rule(34);
    if (busy) {
      const n = Math.min(log.length, 12);
      for (let i = 0; i < n; i++) pen.text(cut(log[log.length - n + i], 38), X, 44 + i * 20, i === n - 1 ? PH.hi : PH.mid, 15);
      return;
    }
    if (!rows.length) pen.para('Nothing to fit. Find a part out there, or build a Scrapjack at a workbench.', X, 50, W - 2 * X, PH.mid, 15, 20);
    const vis = 5;
    crt.maxScroll = Math.max(0, rows.length - vis);
    crt.scroll = Math.min(crt.scroll, crt.maxScroll);
    for (let i = 0; i < vis && crt.scroll + i < rows.length; i++) {
      const idx = crt.scroll + i, r = rows[idx], y = 44 + i * 42;
      if (idx === pick || pen.hover === 'row:' + idx) pen.fill(8, y - 3, W - 16, 40, idx === pick ? '#0f3a1e' : '#0a2414');
      pen.text(cut(r.a, 40), X, y, PH.hi, 15);
      pen.text(cut(r.b, 44), X + 14, y + 19, PH.mid, 13);
      pen.hit('row:' + idx, 8, y - 3, W - 16, 40);
    }
    if (rows.length) pen.button('go', 'BEGIN ▸', X, H - 34, 140);
    pen.button('off', 'CLIMB OFF', W - X - 140, H - 34, 140);
  }, (id) => {
    if (busy || ended) return;
    if (id === 'off') close();
    else if (id.startsWith('row:')) pick = Number(id.slice(4));
    else if (id === 'go' && rows[pick]) go(rows[pick]);
  });
  const fgL = new THREE.Group();
  const kl = new THREE.DirectionalLight(0xfff0dc, 2.2); kl.position.set(-2, 3, 2); fgL.add(kl, new THREE.AmbientLight(0x6a6458, 0.6));
  stage.fg.add(fgL, crt.group);
  stage.onFgHover = (id, hit) => crt.pointer(id, hit);
  stage.onClick = (id, hit) => { if (id) crt.click(id, hit); };
  const tanH = Math.tan((15 * Math.PI) / 180);
  let lastAsp = 0;
  stage.onFrame = (dt) => {
    const asp = stage.fgCam.aspect;
    if (asp !== lastAsp) {
      lastAsp = asp;
      const hh = tanH * 3, hw = hh * asp;
      if (asp >= 0.9) { const sc = Math.min(1, (hw * 0.82) / 1.05); crt.group.scale.setScalar(sc); crt.group.position.set(hw - 0.58 * sc, 0.0, -3); crt.group.rotation.set(0, -0.22, 0); stage.setViewShift(0.12, 0); }
      else { const sc = Math.min(1, (hw * 1.9) / 1.05); crt.group.scale.setScalar(sc); crt.group.position.set(0, -hh + 0.48 * sc, -3); crt.group.rotation.set(0, 0, 0); stage.setViewShift(0, -0.2); }
    }
    crt.frame(dt, busy);
  };

  const close = () => {
    if (ended) return;
    ended = true;
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
    // a whole arm comes off with any hand fitted on it
    for (const s of slotConflicts(r.slot)) delete stage.load[s];
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

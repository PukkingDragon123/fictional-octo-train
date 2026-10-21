// FIELD SURGERY: fitting hardware in a run, on an operating table or with a
// surgery rig, from your own eyes. Pick the part you carry and where it goes;
// the same robot arms (stage.ts, first-person framing) take the limb off and
// bolt the metal on while the survivor is strapped down (a locking action).
// No anaesthetic: it costs blood, pain, panic and a memory. Applied only when
// the sequence completes (installPart / removePart in src/survival/cyber.ts).
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { TimedAction } from '../../actions/action';
import type { Player } from '../../entities/player';
import type { Item } from '../../items/item';
import { fpClaim, fpRelease } from '../../fp/fp';
import { addStat } from '../../game/profile';
import { CYBER_SLOTS, CyberSlot, SLOT_KIND, SLOT_NAME, SLOT_CODE, cyberDef, cyberDefByItem, slotConflicts, loadoutOf, installPart, removePart } from '../../survival/cyber';
import { SurgeryStage } from './stage';
import { csfx } from './audio';
import './surgery.css';

class SelfSurgery extends TimedAction {
  finished = false;
  constructor(p: Player, public label: string) {
    super(p);
    this.name = label; this.duration = 60; this.fixedTime = true; this.locks = true; this.canMove = false; this.anim = 'craft'; this.showBar = false;
  }
  update() { if (this.finished) this.done = true; }
  perform() { /* applied by the cutscene */ }
}

let openNow = false;

export function fieldSurgery(p: Player) {
  if (openNow || !p?.isLocal || p.body.dead) return;
  openNow = true;
  const b = p.body;
  const load = loadoutOf(b);
  const root = document.createElement('div');
  root.className = 'sg-root field';
  const view = document.createElement('div'); view.className = 'sg-view';
  const fx = document.createElement('div'); fx.className = 'sg-fx';
  const panel = document.createElement('aside'); panel.className = 'sg-panel on';
  root.append(view, fx, panel);
  document.body.append(root);
  fpClaim('surgery', 5);
  const stage = new SurgeryStage(view, 'field');
  const out = p.computeOutfit();
  const { cond, ...outfit } = out as any;
  void cond;
  stage.setSubject(p.app, outfit, load as any, [...b.severed]);
  stage.intro(true);
  let action: SelfSurgery | null = null;
  let ended = false;
  const close = () => {
    if (ended) return;
    ended = true;
    window.removeEventListener('keydown', onKey, true);
    stage.dispose(); root.remove();
    fpRelease('surgery');
    openNow = false;
    if (action && !action.finished) { action.finished = true; action.cancelled = true; }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !stage.busy) { e.preventDefault(); e.stopPropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);

  // ---- what can be done: every part carried, onto every slot it fits; hardware that can come out
  const kits = p.allItems().filter((it) => !!cyberDefByItem(it.key));
  const seen = new Set<string>();
  const rows: { label: string; sub: string; run: () => void }[] = [];
  for (const it of kits) {
    const d = cyberDefByItem(it.key)!;
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    for (const slot of CYBER_SLOTS) {
      if (SLOT_KIND[slot] !== d.kind || load[slot] === d.key) continue;
      if (d.kind === 'hand' && b.severed.includes(`farm_${slot.slice(-1)}` as any)) continue;
      rows.push({ label: `Fit ${d.name}`, sub: `${SLOT_CODE[slot]} · ${SLOT_NAME[slot]}${load[slot] ? ' (replaces ' + cyberDef(load[slot])!.name + ')' : slotConflicts(slot).some((s) => load[s]) ? ' (replaces the fitted hardware)' : ''}`, run: () => go(slot, d.key, it) });
    }
  }
  for (const slot of CYBER_SLOTS) if (load[slot]) rows.push({ label: `Take out ${cyberDef(load[slot])!.name}`, sub: `${SLOT_CODE[slot]} · leaves a capped socket`, run: () => go(slot, null, null) });

  panel.innerHTML = `<div class="sg-ph"><small>FIELD SURGERY //</small><b>SELF-MODIFICATION</b><span>NO ANAESTHETIC · STRAPS ON · BITE DOWN</span></div>`;
  const x = document.createElement('button'); x.className = 'sg-x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Climb off'); x.addEventListener('click', close);
  panel.append(x);
  const list = document.createElement('div'); list.className = 'sg-cards';
  if (!rows.length) list.innerHTML = '<div class="sg-card locked"><header><b>NOTHING TO FIT</b></header><p class="b">✖ Find or build a part first (Scrapjack parts at a workbench).</p></div>';
  for (const r of rows) {
    const c = document.createElement('div'); c.className = 'sg-card';
    c.innerHTML = `<header><b>${r.label}</b><small>${r.sub}</small></header>`;
    const bt = document.createElement('button'); bt.className = 'sg-btn sg-small'; bt.textContent = 'BEGIN ▸';
    bt.addEventListener('click', r.run);
    c.append(bt); list.append(c);
  }
  panel.append(list);

  const go = async (slot: CyberSlot, key: string | null, item: Item | null) => {
    if (stage.busy || ended) return;
    panel.classList.remove('on');
    root.classList.add('cutting');
    action = new SelfSurgery(p, key ? 'Self-surgery' : 'Removing hardware');
    p.actions.clear(); p.actions.add(action);
    G.ui?.say?.(p, key ? 'Okay. Okay okay okay.' : 'Get it OFF me.', 'normal', 1.6);
    // a whole arm replaces a fitted hand (and the other way round)
    for (const s of slotConflicts(slot)) if (stage.load[s]) await stage.swap(s, null);
    await stage.swap(slot, key);
    root.classList.remove('cutting');
    if (ended || action.cancelled) { close(); return; }
    // ---- it is done: apply for real
    const ok = key ? installPart(p, slot, key, { item, giveBack: true }) : removePart(p, slot, true);
    if (ok) {
      const hard = (p.body.perks.has('chop_doc') ? 0.5 : 1) * (p.body.painkiller > 0 ? 0.6 : 1);
      b.panic = Math.min(100, b.panic + 70 * hard); b.stress = Math.min(100, b.stress + 30 * hard); b.unhappy = Math.min(100, b.unhappy + 10 * hard);
      b.blood = Math.max(30, b.blood - 9 * hard); b.health = Math.max(5, b.health - 7 * hard);
      try { G.survival?.mind?.addTrauma?.(b, 0.15 * hard, 'self-surgery', 0.4); } catch { /* no mind */ }
      if (key) addStat('cyber_fitted', 1);
      G.ui?.say?.(p, 'AAAAAGH— ...it moves. It MOVES.', 'shout', 2.4);
      bus.emit('noise', { x: p.x, z: p.z, radius: 20, kind: 'scream', zone: p.zoneKey, by: p.id });
      csfx('cy_powerup', 0.6);
    }
    action.finished = true;
    setTimeout(close, 900);
  };
}

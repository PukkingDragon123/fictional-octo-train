// Dev lineup for limb loss: stumps in every state of care, crutches, pegs,
// hooks, prosthetics, hopping, crawling and one-armed poses.
//   open ?gallery=humans&zoom=48, then in the page:
//   await (await import('/src/dev/limbGallery.ts')).populateLimbs(window.__gallery)
import * as THREE from 'three';
import { Player } from '../entities/player';
import { randomAppearance, Appearance } from '../entities/humanRig';
import type { ActionAnim, Stance } from '../entities/humanAnim';
import { createItem } from '../items/factory';
import { hasItemDef, BodyPart, Item } from '../items/item';
import { Rng } from '../core/rng';
import { distalOf, stumpBleed, noAids } from '../survival/limbs';

interface Spec { label: string; wear?: string[]; cut: BodyPart[]; look?: 'raw' | 'tq' | 'caut' | 'stitch' | 'band' | 'bandb' | 'healed'; hold?: string; holdL?: string; crutch?: 'L' | 'R' | 'both'; prost?: Record<string, string>; speed?: number; stance?: Stance; action?: ActionAnim; aim?: boolean; facing?: number }

const SPECS: Spec[] = [
  { label: 'torn off: raw', cut: ['farm_r'], look: 'raw' },
  { label: 'tourniquet', cut: ['farm_r'], look: 'tq' },
  { label: 'cauterised', cut: ['hand_l'], look: 'caut' },
  { label: 'bandaged arm', cut: ['uarm_r'], look: 'band' },
  { label: 'stitched + hook', cut: ['farm_l'], look: 'stitch', prost: { arm_l: 'hook_hand' } },
  { label: 'prosthetic hand', cut: ['hand_r'], look: 'healed', prost: { arm_r: 'prosthetic_hand' } },
  { label: 'leg torn: raw', cut: ['shin_l'], look: 'raw' },
  { label: 'hop (no foot)', cut: ['foot_l'], look: 'band', speed: 0.7 },
  { label: 'crutch', cut: ['shin_r'], look: 'band', crutch: 'L', speed: 1.0 },
  { label: 'two crutches', cut: ['thigh_l'], look: 'healed', crutch: 'both', speed: 1.1 },
  { label: 'peg leg', cut: ['shin_r'], look: 'healed', prost: { leg_r: 'peg_leg' }, speed: 1.5 },
  { label: 'prosthetic leg', cut: ['thigh_l'], look: 'healed', prost: { leg_l: 'prosthetic_leg' }, speed: 1.8 },
  { label: 'crawl (no legs)', cut: ['thigh_l', 'shin_r'], look: 'band', stance: 'crawl', speed: 0.3 },
  { label: 'one-arm aim', cut: ['hand_r'], look: 'band', hold: 'pistol', aim: true },
  { label: 'one-arm swing', cut: ['uarm_l'], look: 'healed', hold: 'crowbar', action: 'swing' },
  { label: 'pull (arm)', cut: [], action: 'torn_arm_r' },
  { label: 'pull (leg)', cut: [], action: 'torn_leg_l' },
  { label: 'one arm walking', cut: ['farm_l'], look: 'healed', speed: 1.9 },
];

/** set up a survivor's body as if it had lost these parts and been treated `look` */
export function maim(p: Player, cuts: BodyPart[], look: Spec['look'] = 'raw') {
  const b = p.body;
  for (const cut of cuts) {
    for (const q of distalOf(cut)) if (!b.severed.includes(q)) b.severed.push(q);
    if (look === 'healed') continue;
    const inj = b.addInjury(cut, 'amputation', 1);
    inj.bleed = stumpBleed(cut);
    if (look === 'tq') inj.tq = 0.2;
    if (look === 'caut') { inj.caut = true; inj.bleed *= 0.06; }
    if (look === 'stitch') inj.stitched = true;
    if (look === 'band' || look === 'bandb') { inj.stitched = true; inj.bandage = { clean: look === 'band', soak: look === 'bandb' ? 0.8 : 0.1, sterile: true }; }
  }
}

export async function populateLimbs(g: { pr: any; z: any; tgt: THREE.Vector3 }, opts: { cols?: number; spacing?: number; only?: number[]; facing?: number; ty?: number } = {}) {
  let specs = SPECS;
  if (opts.only) specs = opts.only.map((i) => SPECS[i]);
  const rng = new Rng(11);
  const cols = Math.min(opts.cols ?? 6, specs.length), sp = opts.spacing ?? 1.6;
  const players: { p: Player; s: Spec }[] = [];
  const give = (p: Player, k: string, hand: 'R' | 'L') => { if (!hasItemDef(k)) return null; const it = createItem(k); p.inv.add(it); p.equip(it, hand); return it; };
  specs.forEach((s, i) => {
    const app = { ...randomAppearance(() => rng.next()) } as Appearance;
    const p = new Player('l' + i, s.label, app, false);
    for (const k of s.wear ?? ['tshirt', 'jeans', 'sneakers']) if (hasItemDef(k)) { const it = createItem(k); p.inv.add(it); p.wear(it); }
    maim(p, s.cut, s.look);
    const aids = noAids();
    if (s.prost) { aids.prost = { ...s.prost } as any; for (const [slot, k] of Object.entries(s.prost)) { const it: Item = createItem(k); p.inv.add(it); p.worn.set(('prosth_' + slot) as any, it); } }
    if (s.crutch) {
      if (s.crutch === 'both') { give(p, 'crutch', 'R'); give(p, 'crutch', 'L'); aids.crutchL = aids.crutchR = true; }
      else { give(p, 'crutch', s.crutch); if (s.crutch === 'L') aids.crutchL = true; else aids.crutchR = true; }
    }
    p.body.limbAids = aids;
    if (s.hold) give(p, s.hold, 'R');
    p.speed = s.speed ?? 0; p.stance = s.stance ?? 'stand'; p.actionAnim = s.action ?? ''; p.aiming = !!s.aim;
    p.actionDur = s.action?.startsWith('torn') ? 2.4 : 1.2;
    p.outfitDirty = true;
    const x = 4 + (i % cols) * sp, z = 4 + Math.floor(i / cols) * sp * 1.4;
    p.x = x; p.z = z; p.facing = s.facing ?? opts.facing ?? Math.PI / 4 + 0.35;
    g.pr.scene.add(p.rig.root);
    players.push({ p, s });
  });
  g.tgt.set(4 + ((cols - 1) * sp) / 2, opts.ty ?? 0.8, 4 + ((Math.ceil(specs.length / cols) - 1) * sp * 1.4) / 2);
  const labels = players.map((e) => {
    const el = document.createElement('div');
    el.textContent = e.s.label;
    el.style.cssText = 'position:fixed;color:#fff;font:11px monospace;background:#0008;padding:1px 3px;transform:translate(-50%,0);z-index:20;pointer-events:none';
    document.body.appendChild(el);
    return el;
  });
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const e of players) {
      if (e.s.action) e.p.actionT = (e.p.actionT + dt) % e.p.actionDur;
      e.p.updateVisual(dt);
    }
    players.forEach((e, i) => { const v = g.pr.worldToScreen(new THREE.Vector3(e.p.x, 0, e.p.z + 0.3)); labels[i].style.left = v.x + 'px'; labels[i].style.top = v.y + 'px'; });
    requestAnimationFrame(tick);
  };
  tick();
  (window as any).__limbs = players;
  return players.length;
}

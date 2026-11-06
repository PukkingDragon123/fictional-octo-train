// FIELD SAMPLING, from the survivor's own eyes. "Take sample" on a body (dead,
// knocked down or stunned) or on an anomalous item runs a first-person close-up
// (src/fp/fp.ts, cinematic 'full': the dive into the head, the room behind your
// hands) with the shared first-person arms (src/fp/hands.ts fpArmsFor):
//   DRAW  (fluid)                 hold to pull the plunger, let go inside the green band
//   CUT   (tissue/spores/residue) three strokes: strike as the needle crosses the lit notch
// The quality (0..1) rides on the sample item (src/content/items/research.ts);
// a botched job spoils it with a line in the subtitle strip. Esc grabs a poor
// sample in a hurry. Mouse, touch, Space / E / Enter and the gamepad's A all
// work; B is Esc. Samples bank at the Remittance Press or when you walk out
// (src/research/bank.ts); dying with them loses them.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Player } from '../entities/player';
import type { Creature } from '../creatures/creature';
import type { Item } from '../items/item';
import type { MenuOption } from '../ui/ui';
import { itemDef } from '../items/item';
import { createItem } from '../items/factory';
import { TimedAction } from '../actions/action';
import { queueAt } from '../actions/basic';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera, fpBlend } from '../fp/fp';
import { fpArmsFor, type FpArm } from '../fp/hands';
import { isDown, isStunned } from '../combat/creatureState';
import { entry, anomalyEntry, KIND_NAME, type SampleKind } from '../game/codex';
import { holdArm, syringe, scalpel, swab, vialProp, type Syringe, type Vial } from './fpKit';
import { carries } from './tools';
import './research.css';

export interface SampleTarget { kind: SampleKind; src: string; name: string; alive: boolean; threat: number; done: (q: number) => void }
const COL: Record<SampleKind, number> = { tissue: 0xc84a5a, fluid: 0x3ac880, spores: 0xd8c050, residue: 0x9a6aff };
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const SPOIL: Record<SampleKind, string[]> = {
  fluid: ['Air in the barrel. That is now a sample of air.', 'Overdrawn. It went everywhere. Mostly on me.', 'The vial cracked. It smells like pennies.'],
  tissue: ['That was not tissue. That was my glove.', 'Mangled. The lab will not take mince.', 'It slipped out of the forceps and under the shelving.'],
  spores: ['Sneezed on it. Contaminated. Brilliant.', 'The swab came up clean. Somehow.'],
  residue: ['Scraped the floor instead. That is just floor.', 'The slide shattered. Glitter everywhere.'],
};
const GOOD = ['Sealed. Labelled. Lovely.', 'Into the vial. The Institute thanks me, probably.', 'Clean sample. Do not drop it.', 'Got it. It is still warm.'];

// ================================================================== the menu options
/** "Take sample" on a creature (the creature menu, src/creatures/manager.ts) */
export function creatureSampleOption(p: Player, c: Creature): MenuOption | null {
  const e = entry(c.sp.key);
  if (!e || c.tamedBy) return null;
  const alive = !c.dead;
  if (alive && !isDown(c) && !isStunned(c)) return null;
  const kit = carries(p, 'tool_kit2');
  const max = alive ? 1 : kit ? 2 : 1;
  const took = (c.mem.sampledN as number) || 0;
  const kind: SampleKind = alive ? (e.gives.includes('fluid') ? 'fluid' : e.gives[0]) : (took === 0 ? e.gives[0] : e.gives[1] ?? e.gives[0]);
  return {
    label: alive ? 'Take sample (quick, it is waking)' : 'Take sample',
    disabled: took >= max ? 'already sampled' : false,
    action: () => queueAt(p, c.x, c.z, new CollectAction(p, {
      kind, src: e.key, name: e.name, alive, threat: e.threat,
      done: () => { c.mem.sampledN = ((c.mem.sampledN as number) || 0) + 1; },
    }), 1.5, false),
  };
}
/** "Take residue sample" on an anomalous item (the item menu) */
export function itemSampleOption(p: Player, it: Item, o: MenuOption[]) {
  const key = anomalyEntry(itemDef(it.key).anomaly);
  if (!key) return;
  const e = entry(key);
  if (!e) return;
  o.push({
    label: 'Take residue sample', disabled: it.data?.sampled ? 'already sampled' : false,
    action: () => p.actions.add(new CollectAction(p, { kind: 'residue', src: key, name: e.name, alive: false, threat: e.threat, done: () => { it.data = { ...(it.data || {}), sampled: 1 }; } })),
  });
}

// ================================================================== the action
export class CollectAction extends TimedAction {
  fp = false;
  constructor(p: Player, public target: SampleTarget) { super(p); this.name = 'Take sample'; this.duration = 3.2; this.anim = 'loot'; }
  start() {
    if (this.p.isLocal && field.start(this)) { this.fp = true; this.duration = 1e9; this.fixedTime = true; this.showBar = false; }
  }
  stop() { if (this.fp) field.end(this); }
  /** no first person (a remote survivor, no overlay): a plain timed job at a fair quality */
  perform() { if (!this.fp) finishSample(this.p, this.target, 0.55 + Math.random() * 0.2); }
}

/** a sample in the pocket (q <= 0 = spoiled) */
function finishSample(p: Player, t: SampleTarget, q: number) {
  if (q <= 0) { bus.emit('think', p, pick(SPOIL[t.kind])); G.audio?.ui?.('dmg_break_glass', 0.5); bus.emit('sampleSpoiled', { p, src: t.src }); return; }
  if (carries(p, 'tool_kit2')) q = Math.min(1, q + 0.15);
  const it = createItem('sample_' + t.kind);
  it.data = { src: t.src, q: Math.round(q * 100) / 100, kind: t.kind };
  it.name = `${KIND_NAME[t.kind]} sample · ${t.name}`;
  p.inv.add(it);
  bus.emit('inventoryChanged', p);
  t.done(q);
  bus.emit('halo', p, `+ ${KIND_NAME[t.kind]} sample (${Math.round(q * 100)}%)`, 'good');
  bus.emit('think', p, q < 0.45 ? 'Rushed. It will do. Barely.' : pick(GOOD));
  bus.emit('sampleTaken', { p, src: t.src, kind: t.kind, q, alive: t.alive });
}

// ================================================================== the close-up
class FieldFp {
  active = false;
  private a: CollectAction | null = null;
  private root: THREE.Group | null = null;
  private arms: { right: FpArm; left: FpArm } | null = null;
  private syr: Syringe | null = null;
  private knife: THREE.Group | null = null;
  private stick: ReturnType<typeof swab> | null = null;
  private vial: Vial | null = null;
  private dom: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private needle: HTMLElement | null = null;
  private zone: HTMLElement | null = null;
  private t = 0;
  private held = false; private padA = false; private padB = false;
  // draw
  private fill = 0; private band: [number, number] = [0.6, 0.78];
  // cut
  private ph = 0; private hits: number[] = []; private notch = 0.5; private win = 0.12; private stab = -1;
  private ending = -1; private result = 0;
  private sysAdded = false;
  private key = (e: KeyboardEvent) => this.onKey(e);

  start(a: CollectAction): boolean {
    if (this.active || !G.pr?.overlayScene) return false;
    if (!fpClaim('sample', 5, { cinematic: 'full', eyePitch: 44 })) return false;
    if (!this.sysAdded) { this.sysAdded = true; G.addSystem({ name: 'sampleFp', update: (dt: number) => this.update(dt) }); }
    this.ensure();
    this.a = a; this.active = true; this.t = 0; this.held = false; this.ending = -1; this.result = 0;
    this.fill = 0; this.hits = []; this.stab = -1; this.ph = Math.random();
    const k = a.target.kind, kit = carries(a.p, 'tool_kit2');
    const w = (kit ? 1.6 : 1) * (a.target.alive ? 0.8 : 1) * (1 - Math.min(0.3, a.target.threat * 0.05));
    const c = 0.55 + Math.random() * 0.25;
    this.band = [c - 0.09 * w, c + 0.09 * w];
    this.win = 0.11 * w;
    this.notch = 0.3 + Math.random() * 0.4;
    const col = COL[k];
    this.syr!.g.visible = k === 'fluid';
    this.knife!.visible = k === 'tissue';
    this.stick!.g.visible = k === 'spores' || k === 'residue';
    (this.stick!.tip.material as THREE.MeshStandardMaterial).color.setHex(0xf2f0e8);
    this.syr!.fillMat.color.setHex(col); this.syr!.fillMat.emissive.setHex(col).multiplyScalar(0.35);
    this.vial!.fillMat.color.setHex(col); this.vial!.fillMat.emissive.setHex(col).multiplyScalar(0.3);
    this.syr!.set(0); this.vial!.set(0);
    const p = a.p;
    if (this.arms) { const look = { skin: p.app?.skin ?? 0xe8b98f, sleeve: 0xeeb415 }; this.arms.right.setLook(look); this.arms.left.setLook(look); }
    this.root!.visible = true;
    this.openDom(k);
    G.audio?.ui?.('bh_wrap', 0.4);
    return true;
  }
  end(a?: CollectAction) { if (!this.active || (a && a !== this.a)) return; this.finish(); }
  private finish() {
    this.active = false;
    const a = this.a; this.a = null;
    if (a && !a.done) a.done = true;
    this.dom?.remove(); this.dom = null;
    window.removeEventListener('keydown', this.key, true); window.removeEventListener('keyup', this.key, true);
    if (G.input) G.input.pointerOverUI = false;
    if (fpOwner() === 'sample') { const cam = fpCamera(); cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); } fpRelease('sample'); }
    if (this.root) this.root.visible = false;
  }
  /** the job is over: the sample goes in the pocket (or not), the hands come down */
  private conclude(q: number) {
    if (this.ending >= 0 || !this.a) return;
    this.ending = 0; this.result = q;
    const a = this.a;
    finishSample(a.p, a.target, q);
    if (this.dom) this.dom.classList.add(q > 0 ? 'ok' : 'bad');
  }

  private ensure() {
    if (this.root) return;
    const g = this.root = fpGroup('sample');
    // the room's light on the hands: a cold overhead tube and a warm spill from below
    g.add(new THREE.HemisphereLight(0xdfe8f0, 0x3a2a20, 1.1));
    const key = new THREE.DirectionalLight(0xe8f0ff, 1.5); key.position.set(-0.3, 1, 0.3); g.add(key);
    const warm = new THREE.DirectionalLight(0xffc888, 0.7); warm.position.set(0.6, -0.2, 0.5); g.add(warm);
    this.arms = fpArmsFor(G.local);
    g.add(this.arms.right.root, this.arms.left.root);
    this.syr = syringe(); g.add(this.syr.g);
    this.knife = scalpel(); g.add(this.knife);
    this.stick = swab(); g.add(this.stick.g);
    this.vial = vialProp(); g.add(this.vial.g);
  }

  private openDom(k: SampleKind) {
    const draw = k === 'fluid';
    const d = this.dom = document.createElement('div');
    d.className = 'rs-fp' + (draw ? ' draw' : ' cut');
    d.innerHTML = `<div class="rs-plate"><b>${draw ? 'DRAW' : k === 'tissue' ? 'EXCISE' : 'SWAB'} · ${KIND_NAME[k].toUpperCase()}</b><small>${draw ? 'hold · let go on the green' : 'strike on the lit notch · 3 strokes'}</small>
      <div class="rs-gauge"><i class="zone"></i><i class="needle"></i><span class="marks"></span></div>
      <div class="rs-keys"><span>${matchMedia('(pointer: coarse)').matches ? 'tap / hold' : 'click · space · A'}</span><span>esc · B rush it</span></div></div>`;
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button === 2) { this.rush(); return; } this.press(true); });
    d.addEventListener('pointerup', (e) => { e.preventDefault(); this.press(false); });
    d.addEventListener('pointercancel', () => this.press(false));
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(d);
    this.bar = d.querySelector('.rs-gauge'); this.needle = d.querySelector('.needle'); this.zone = d.querySelector('.zone');
    if (this.zone) { const [a, b] = draw ? this.band : [this.notch - this.win / 2, this.notch + this.win / 2]; this.zone.style.left = a * 100 + '%'; this.zone.style.width = (b - a) * 100 + '%'; }
    if (G.input) G.input.pointerOverUI = true;
    window.addEventListener('keydown', this.key, true); window.addEventListener('keyup', this.key, true);
  }
  private onKey(e: KeyboardEvent) {
    if (!this.active) return;
    const down = e.type === 'keydown';
    if (e.code === 'Escape') { if (down) { e.preventDefault(); e.stopImmediatePropagation(); this.rush(); } return; }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.press(down); }
  }
  /** Esc / B: grab a poor sample in a hurry (or leave, once it is over) */
  private rush() { if (this.ending >= 0) { this.leave(); return; } G.audio?.ui?.('band_tick', 0.4); this.conclude(0.28); }
  private leave() { const a = this.a; if (a?.p) a.p.actions.clear(); else this.finish(); }

  private press(down: boolean) {
    if (!this.active || !this.a) return;
    if (this.ending >= 0) { if (down && this.ending > 0.5) this.leave(); return; }
    if (fpBlend() < 0.85) return;
    const k = this.a.target.kind;
    if (k === 'fluid') {
      if (down) { this.held = true; G.audio?.ui?.('mn_inject', 0.35); }
      else if (this.held) {
        this.held = false;
        const [a, b] = this.band, f = this.fill;
        if (f < 0.04) return;
        const inside = f >= a && f <= b, mid = (a + b) / 2, half = (b - a) / 2;
        const q = inside ? 1 - (Math.abs(f - mid) / half) * 0.35 : f > b ? 0 : Math.max(0, 0.3 - (a - f) * 1.5);
        G.audio?.ui?.(q > 0.6 ? 'mn_tink' : q > 0 ? 'mn_click' : 'dmg_break_glass', 0.5);
        this.conclude(q);
      }
      return;
    }
    if (!down) return;
    // a stroke: how close the needle is to the notch
    const x = this.needleX();
    const d = Math.abs(x - this.notch);
    const s = d <= this.win / 2 ? 1 - (d / (this.win / 2)) * 0.4 : d < this.win ? 0.25 : 0;
    this.hits.push(s);
    this.stab = 0;
    G.audio?.ui?.(s > 0.5 ? (k === 'tissue' ? 'flesh_cut' : 'mn_slice') : s > 0 ? 'mn_click' : 'band_tick', 0.45);
    if (this.bar) { this.bar.classList.remove('hit', 'miss'); void this.bar.offsetWidth; this.bar.classList.add(s > 0.5 ? 'hit' : 'miss'); }
    // the next notch moves
    this.notch = 0.22 + Math.random() * 0.56;
    if (this.zone) { this.zone.style.left = (this.notch - this.win / 2) * 100 + '%'; this.zone.style.width = this.win * 100 + '%'; }
    const marks = this.dom?.querySelector('.marks');
    if (marks) marks.textContent = this.hits.map((h) => (h > 0.5 ? '●' : h > 0 ? '◐' : '○')).join(' ');
    if (this.hits.length >= 3) {
      const good = this.hits.filter((h) => h > 0).length;
      this.conclude(good === 0 ? 0 : this.hits.reduce((a, b) => a + b, 0) / 3);
    }
  }
  private needleX() { return 0.5 + 0.5 * Math.sin(this.ph * Math.PI * 2); }

  update(dt: number) {
    if (!this.active || !this.a || !this.root) return;
    this.t += dt;
    const a = this.a, k = a.target.kind;
    // the gamepad: A works it, B rushes
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean) as Gamepad | undefined;
    if (pad) {
      const A = !!pad.buttons[0]?.pressed, B = !!pad.buttons[1]?.pressed;
      if (A !== this.padA) { this.padA = A; this.press(A); }
      if (B && !this.padB) this.rush();
      this.padB = B;
    }
    const speed = 0.55 + a.target.threat * 0.06 + (a.target.alive ? 0.15 : 0);
    if (this.ending < 0) {
      if (k === 'fluid') {
        if (this.held) this.fill = Math.min(1.05, this.fill + dt * (0.28 + this.fill * 0.55) * speed * 1.6);
        if (this.fill > 1.02) { this.held = false; G.audio?.ui?.('dmg_break_glass', 0.5); this.conclude(0); }
        if (this.needle) this.needle.style.left = Math.min(100, this.fill * 100) + '%';
      } else {
        this.ph += dt * speed * 0.62;
        if (this.needle) this.needle.style.left = this.needleX() * 100 + '%';
      }
      // a stunned thing wakes up: hurry
      if (a.target.alive && this.t > 9) { G.audio?.ui?.('band_tick', 0.4); this.conclude(this.fill > 0.2 || this.hits.length ? 0.3 : 0); }
    } else {
      this.ending += dt;
      if (this.ending > 1.4) { this.leave(); return; }
    }
    this.pose(dt);
    this.arms!.right.update(dt); this.arms!.left.update(dt);
  }

  private pose(dt: number) {
    const a = this.a!, k = a.target.kind, t = this.t;
    const up = fpBlend();
    const yOff = (1 - up) * -0.24 + (this.ending > 0 ? -Math.min(1, this.ending) * 0.2 : 0);
    const cam = fpCamera();
    if (cam.fov !== 34) { cam.fov = 34; cam.updateProjectionMatrix(); }
    cam.position.set(0, 0, 0);
    cam.rotation.set(Math.sin(t * 0.8) * 0.004, Math.sin(t * 0.6) * 0.006, 0);
    const sway = Math.sin(t * 1.4) * 0.003;
    // the vial in the left hand, low and to the side; it fills as the work goes
    const v = this.vial!;
    v.g.position.set(-0.12 + sway, -0.12 + yOff, -0.36);
    v.g.rotation.set(0.3, 0, 0.25);
    const work = k === 'fluid' ? (this.ending >= 0 && this.result > 0 ? Math.min(1, this.ending * 1.5) * 0.7 : 0) : (this.hits.filter((h) => h > 0).length / 3) * 0.6;
    v.set(work);
    v.cap.position.y = 0.035 + 0.006 + (this.ending >= 0 && this.ending > 0.6 ? 0 : 0.03);
    holdArm(this.arms!.left, this.root!, 'grip', v.g, [0, -0.006, 0], [-0.24, -0.4, -0.16], [0.6, 0.5, 0.4]);
    if (k === 'fluid') {
      const s = this.syr!;
      s.set(Math.min(1, this.fill));
      s.g.position.set(0.05 + sway, -0.06 + yOff, -0.4);
      s.g.rotation.set(-0.5, 0, -0.25);
      holdArm(this.arms!.right, this.root!, 'pinch', s.g, [0, 0.03, 0], [0.24, -0.38, -0.12], [-0.6, 0.3, 0.5]);
      this.arms!.right.tremor = this.held ? 0.4 : 0;
    } else {
      // the blade / swab hovers over the spot and dips on a stroke
      const tool = k === 'tissue' ? this.knife! : this.stick!.g;
      if (this.stab >= 0) this.stab += dt * 4;
      if (this.stab > 1) this.stab = -1;
      const dip = this.stab >= 0 ? Math.sin(this.stab * Math.PI) : 0;
      const nx = (this.needleX() - 0.5) * 0.08;
      tool.position.set(0.04 + nx + sway, -0.08 + yOff - dip * 0.04, -0.42 + dip * 0.03);
      tool.rotation.set(-0.55 - dip * 0.3, 0, -0.2 + nx * 2);
      holdArm(this.arms!.right, this.root!, k === 'tissue' ? 'pinch' : 'pinch', tool, [0, 0.045, 0], [0.24, -0.38, -0.12], [-0.6, 0.3, 0.5]);
      if (k !== 'tissue') (this.stick!.tip.material as THREE.MeshStandardMaterial).color.setHex(this.hits.some((h) => h > 0) ? COL[k] : 0xf2f0e8);
    }
  }
}
const field = new FieldFp();

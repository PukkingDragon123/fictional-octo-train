// THE BENCHES: one banked sample worked through the research lab's stations in
// first person, in the menu's own 3D (rooms/research.ts). The camera goes to the
// bench and close, gloved hands come up into the shot (src/fp/hands.ts arms
// reaching back to the camera, so no hand floats) holding real tools
// (src/research/fpKit.ts), and each sample kind runs three short skill games
// (src/game/codex.ts KIND_GAMES):
//   pipette     hold to draw the sample up the pipette, let go on the red line (twice)
//   centrifuge  seat the tube opposite the balance tube, then hit the RPM band twice
//   microscope  turn the focus knob until the field is sharp, then name the cell
//   dissect     trace the dotted incision with the scalpel (drag, or hold and steer)
//   sequence    the read scrolls past: strike when the window matches the reference
// Good results push the entry's research further; a disaster can spoil the
// sample (with a line about it). Mouse, touch, keys (Space/Enter/E to act,
// arrows / A D to steer) and the gamepad (A acts, stick / d-pad steers, B skips)
// all work; Esc / B skips the current test at a cost.
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { FocusNav } from '../nav';
import { sfx } from '../sfx';
import { bus } from '../../../core/events';
import { fpArm, type FpArm } from '../../../fp/hands';
import { holdArm, pipette, scalpel, forceps, vialProp } from '../../../research/fpKit';
import { KIND_GAMES, KIND_NAME, entryName, entry, researchPct, processSample, TOOLS, type BenchGame, type Sample, type Processed } from '../../../game/codex';
import { bitText } from '../../../gfx/bitfont';
import { crispCanvas, drawBar, gaugeIn, GRN, AMB } from '../../hiPixel';

export interface Station { eye: THREE.Vector3; at: THREE.Vector3; surf: number; rotor?: THREE.Object3D; props?: THREE.Object3D[] }
export interface BenchHost {
  scene: THREE.Scene; cam: THREE.PerspectiveCamera; mats: FMats;
  station(k: string): Station;
  /** the sequencer's CRT canvas (288 x 216: draw in 96 x 72 units scaled by width / 96) */
  readout: CanvasRenderingContext2D | null;
  root: HTMLElement;
  rayAt?: (x: number, y: number) => THREE.Ray | null;
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const COL: Record<string, number> = { tissue: 0xd85a6a, fluid: 0x3ad888, spores: 0xe8d050, residue: 0xa87aff };
const NAMES: Record<BenchGame, [string, string]> = {
  pipette: ['PIPETTE', 'hold to draw · let go on the red line'],
  centrifuge: ['CENTRIFUGE', 'seat it opposite the balance tube · then hit the green RPM'],
  microscope: ['MICROSCOPE', 'turn the focus until it is sharp · then name the cell'],
  dissect: ['DISSECTION', 'trace the dotted line with the blade'],
  sequence: ['SEQUENCER', 'strike when the read matches the reference'],
};
const SPOIL: Record<BenchGame, string[]> = {
  pipette: ['Squirted the sample across the bench. And the ceiling.', 'Drew up air, then the sample, then my coffee.'],
  centrifuge: ['Unbalanced rotor. The centrifuge walked off the bench. The sample went with it.', 'Spun it into a fine, even paste. On the lid.'],
  microscope: ['Cracked the slide with the objective. Classic.', 'Focused straight through the cover slip.'],
  dissect: ['That incision went somewhere anatomy has no name for.', 'Cut the tray. And the sample. And a little of the glove.'],
  sequence: ['The sequencer read it as a shopping list. Milk, eggs, teeth.', 'Fed the tape in backwards. It is now jazz.'],
};
const CELLS = ['round', 'spindle', 'spore', 'crystal', 'chain'] as const;
type Cell = typeof CELLS[number];

interface Game { kind: BenchGame; t: number; score: number; done: boolean; doneT: number; data: any }

export class BenchRun {
  fov = 44;
  /** the result card is up (the camera is back in the room) */
  get done() { return this.finished; }
  /** the centrifuge rotor's spin goal while a test runs it */
  rotorSpin: number | undefined;
  /** the sequencer CRT is ours while that test runs */
  usesScreen = false;
  private host: BenchHost;
  private s: Sample;
  private games: BenchGame[];
  private gi = -1;
  private g: Game | null = null;
  private scores: number[] = [];
  private skipped: boolean[] = [];
  private arms: { right: FpArm; left: FpArm };
  private rig = new THREE.Group();
  private work = new THREE.Group();
  private dom = document.createElement('div');
  private catcher = document.createElement('div');
  private nav: FocusNav;
  private camP = new THREE.Vector3(); private camL = new THREE.Vector3();
  private goalP = new THREE.Vector3(); private goalL = new THREE.Vector3();
  private resolve: ((r: Processed | null) => void) | null = null;
  private act = false; private actEdge = 0; private dir = 0; private dirY = 0; private padA = false;
  private ptr = new THREE.Vector2(); private ptrDown = false; private ptrClient = { x: 0, y: 0 };
  private keys = new Set<string>();
  private t = 0;
  private finished = false;
  private col: number;
  private v = new THREE.Vector3();
  private onKey = (e: KeyboardEvent) => this.key(e);

  constructor(host: BenchHost, s: Sample) {
    this.host = host; this.s = s;
    this.games = KIND_GAMES[s.kind];
    this.col = COL[s.kind] ?? 0x3ad888;
    // nitrile gloves under the cuffs of Institute scrubs
    const look = { skin: 0x7088c0, sleeve: 0x4a6a7a, sleeveStyle: 'long' as const };
    this.arms = { right: fpArm('right', look), left: fpArm('left', look) };
    for (const a of [this.arms.right, this.arms.left]) { a.reach = host.cam; a.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } }); }
    this.rig.add(this.arms.right.root, this.arms.left.root, this.work);
    this.rig.name = 'bench';
    host.scene.add(this.rig);
    this.camP.copy(host.cam.position);
    const d = new THREE.Vector3(); host.cam.getWorldDirection(d);
    this.camL.copy(host.cam.position).addScaledVector(d, 2);
    // the HUD and the input catcher
    this.catcher.className = 'rb-catch'; this.catcher.tabIndex = -1;
    this.dom.className = 'rb-hud';
    host.root.append(this.catcher, this.dom);
    const pd = (e: PointerEvent) => { e.preventDefault(); this.ptrDown = true; this.ptrClient = { x: e.clientX, y: e.clientY }; this.setAct(true); try { this.catcher.setPointerCapture(e.pointerId); } catch { /* fine */ } };
    const pu = (e: PointerEvent) => { this.ptrDown = false; this.ptrClient = { x: e.clientX, y: e.clientY }; this.setAct(false); };
    this.catcher.addEventListener('pointerdown', pd);
    this.catcher.addEventListener('pointerup', pu);
    this.catcher.addEventListener('pointercancel', pu);
    this.catcher.addEventListener('pointermove', (e) => { this.ptrClient = { x: e.clientX, y: e.clientY }; this.ptr.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)); });
    this.catcher.addEventListener('contextmenu', (e) => e.preventDefault());
    this.nav = new FocusNav(this.dom, { onBack: () => this.skip(), onArrow: (dx) => { if (dx) this.tap(dx); return true; }, onTab: () => {} });
    window.addEventListener('keydown', this.onKey, true); window.addEventListener('keyup', this.onKey, true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.catcher.focus({ preventScroll: true });
  }

  run(): Promise<Processed | null> {
    sfx('open', 0.6);
    this.next();
    return new Promise((r) => { this.resolve = r; });
  }
  pointer(nx: number, ny: number) { this.ptr.set(nx, -ny); }

  // ================================================================== input
  private key(e: KeyboardEvent) {
    if (this.finished) return;
    const down = e.type === 'keydown';
    const k = e.code;
    if (k === 'Space' || k === 'Enter' || k === 'KeyE' || k === 'NumpadEnter') {
      if (this.g && !this.g.done) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.setAct(down); }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      if (k.startsWith('Key')) { e.preventDefault(); e.stopImmediatePropagation(); if (down && !e.repeat && (k === 'KeyA' || k === 'KeyD')) this.tap(k === 'KeyA' ? -1 : 1); }
    }
  }
  private setAct(on: boolean) { if (on && !this.act) this.actEdge++; this.act = on; }
  /** a single left / right step (slot choice, cell choice) */
  private tap(dx: number) {
    const g = this.g;
    if (!g || g.done) return;
    if (g.kind === 'centrifuge' && g.data.phase === 0) { g.data.sel = (g.data.sel + (dx > 0 ? 1 : 5)) % 6; sfx('tick', 0.6); }
    if (g.kind === 'microscope' && g.data.phase === 1) { g.data.sel = (g.data.sel + (dx > 0 ? 1 : 2)) % 3; sfx('tick', 0.6); this.drawChoices(); }
  }
  private pollPad() {
    const p = [...(navigator.getGamepads?.() || [])].find(Boolean) as Gamepad | undefined;
    let dx = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
    let dy = (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0);
    if (p) {
      const A = !!p.buttons[0]?.pressed;
      if (A !== this.padA) { this.padA = A; if (!this.finished && this.g && !this.g.done) this.setAct(A); }
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.abs(ax) > 0.25) dx = ax; if (p.buttons[14]?.pressed) dx = -1; if (p.buttons[15]?.pressed) dx = 1;
      if (Math.abs(ay) > 0.25) dy = ay; if (p.buttons[12]?.pressed) dy = -1; if (p.buttons[13]?.pressed) dy = 1;
    }
    this.dir = dx; this.dirY = dy;
  }
  private takeEdge(): boolean { if (this.actEdge > 0) { this.actEdge = 0; return true; } return false; }

  // ================================================================== flow
  private next() {
    this.clearWork();
    this.gi++;
    if (this.gi >= this.games.length) { void this.finish(); return; }
    const kind = this.games[this.gi];
    const st = this.host.station(kind);
    this.goalP.copy(st.eye); this.goalL.copy(st.at);
    this.fov = kind === 'microscope' ? 40 : kind === 'sequence' ? 42 : 46;
    this.g = { kind, t: 0, score: 0, done: false, doneT: 0, data: {} };
    this.actEdge = 0; this.act = false;
    this.hud();
    this.build(kind, st);
    sfx('servo', 0.4);
  }
  private end(score: number, line?: string) {
    const g = this.g;
    if (!g || g.done) return;
    g.done = true; g.score = clamp(score, 0, 1.1); g.doneT = 0;
    this.scores.push(g.score); this.skipped.push(false);
    if (g.score >= 0.95) bus.emit('benchPerfect', g.kind);
    sfx(g.score >= 0.85 ? 'perfect' : g.score >= 0.45 ? 'ding' : 'flub', 0.8);
    this.result(g.score, line);
  }
  /** Esc / B: skip this test (it counts as a poor one) */
  private skip() {
    if (this.finished) { this.close(); return; }
    const g = this.g;
    if (!g || g.done) return;
    g.done = true; g.score = 0.2; g.doneT = 0;
    this.scores.push(0.2); this.skipped.push(true);
    sfx('back', 0.6);
    this.result(0.2, 'skipped · the sample suffers for it');
  }
  private async finish() {
    this.finished = true;
    this.g = null;
    this.clearWork();
    this.rotorSpin = undefined; this.usesScreen = false;
    this.arms.right.root.visible = this.arms.left.root.visible = false;
    const avg = this.scores.reduce((a, b) => a + b, 0) / Math.max(1, this.scores.length);
    const worst = Math.min(...this.scores);
    const wi = this.scores.indexOf(worst);
    const spoiled = worst < 0.12 && !this.skipped[wi] && Math.random() < 0.65;
    const before = researchPct(this.s.src);
    const r = processSample(this.s.id, avg, spoiled);
    this.goalP.copy(this.camP).set(0.25, 1.72, 3.05); this.goalL.set(-0.1, 1.2, -1.2); this.fov = 54;
    this.showResult(r, before, spoiled ? pick(SPOIL[this.games[wi]]) : null);
    this.pending = r;
  }
  private pending: Processed | null = null;
  private close() {
    if (!this.resolve) return;
    window.removeEventListener('keydown', this.onKey, true); window.removeEventListener('keyup', this.onKey, true);
    this.nav.destroy();
    this.dom.remove(); this.catcher.remove();
    this.clearWork();
    this.rig.removeFromParent();
    this.arms.right.dispose(); this.arms.left.dispose();
    const r = this.resolve; this.resolve = null;
    sfx('back', 0.5);
    r(this.pending);
  }

  // ================================================================== the HUD
  private hud() {
    const g = this.g!;
    const [name, how] = NAMES[g.kind];
    const touch = matchMedia('(pointer: coarse)').matches;
    const keys = g.kind === 'dissect' ? (touch ? 'drag the blade' : 'drag · or hold space and steer ← →') : g.kind === 'microscope' ? (touch ? 'drag ← → · tap to lock' : '← → focus · space to lock') : g.kind === 'centrifuge' ? (touch ? 'tap a slot · tap on green' : '← → slot · space') : touch ? 'tap / hold' : 'space · click · A';
    this.dom.innerHTML = `<div class="rb-top"><b>TEST ${this.gi + 1}/${this.games.length} · ${name}</b><small>${esc(KIND_NAME[this.s.kind])} sample · ${esc(entryName(this.s.src))} · quality ${Math.round(this.s.q * 100)}%</small></div>
      <div class="rb-how"><span>${esc(how)}</span></div>
      <div class="rb-gauge" hidden><i class="zone"></i><i class="zone z2"></i><i class="needle"></i></div>
      <div class="rb-choices" hidden></div>
      <div class="rb-bot"><span class="rb-keys">${esc(keys)}</span><span class="rb-scores">${this.games.map((_, i) => `<i class="${i < this.scores.length ? (this.scores[i] >= 0.85 ? 'p' : this.scores[i] >= 0.45 ? 'g' : 'f') : i === this.gi ? 'now' : ''}"></i>`).join('')}</span><span class="rb-skip" role="presentation">esc · B skip</span></div>
      <div class="rb-res" hidden></div>`;
    this.dom.querySelector('.rb-skip')!.addEventListener('click', () => this.skip());
  }
  /** the bench gauge: a riveted housing with a glass channel, the green band(s) lit in it and a needle (hi-res pixel art) */
  private gz: { zone?: [number, number]; zone2?: [number, number]; x: number } = { x: 0 };
  private gauge(on: boolean, zone?: [number, number], zone2?: [number, number]) {
    const el = this.dom.querySelector('.rb-gauge') as HTMLElement | null;
    if (!el) return;
    el.hidden = !on;
    if (zone) this.gz.zone = zone;
    this.gz.zone2 = zone2;
    this.paintGauge();
  }
  private needle(x: number) { this.gz.x = clamp(x); this.paintGauge(); }
  private paintGauge() {
    const el = this.dom.querySelector('.rb-gauge') as HTMLElement | null;
    if (!el || el.hidden) return;
    gaugeIn(el, 42, { zones: [this.gz.zone, this.gz.zone2], x: this.gz.x });
  }
  private result(score: number, line?: string) {
    const el = this.dom.querySelector('.rb-res') as HTMLElement | null;
    if (!el) return;
    el.hidden = false;
    const grade = score >= 0.85 ? 'EXCELLENT' : score >= 0.45 ? 'GOOD' : score > 0.2 ? 'POOR' : 'FAILED';
    el.className = 'rb-res ' + (score >= 0.85 ? 'p' : score >= 0.45 ? 'g' : 'f');
    el.innerHTML = `<b>${grade}</b><span>${Math.round(score * 100)}%</span>${line ? `<small>${esc(line)}</small>` : ''}`;
  }

  // ================================================================== the result card
  private showResult(r: Processed | null, before: number, spoilLine: string | null) {
    const e = entry(this.s.src);
    const after = r?.after ?? before;
    const pz = r?.prize;
    const avg = this.scores.reduce((a, b) => a + b, 0) / Math.max(1, this.scores.length);
    this.dom.innerHTML = `<div class="rb-card${pz ? ' prize' : ''}${spoilLine ? ' spoiled' : ''}">
      <div class="rb-ch"><b>${esc(e?.name ?? this.s.src)}</b><small>${esc(e?.code ?? '')}</small></div>
      <div class="rb-cb">
        <div class="rb-tests">${this.games.map((k, i) => `<div><small>${NAMES[k][0]}</small><b class="${this.scores[i] >= 0.85 ? 'p' : this.scores[i] >= 0.45 ? 'g' : 'f'}">${this.skipped[i] ? 'SKIP' : Math.round((this.scores[i] ?? 0) * 100) + '%'}</b></div>`).join('')}</div>
        ${spoilLine ? `<p class="rb-spoil"><b>SAMPLE SPOILED</b> ${esc(spoilLine)}</p>` : `<p class="rb-avg">bench average <b>${Math.round(avg * 100)}%</b> · sample quality ${Math.round(this.s.q * 100)}%</p>`}
        <div class="rb-prog"><span>RESEARCH</span><i style="--a:${before}%;--b:${after}%"></i><b>${before}% → ${after}%</b></div>
        ${pz ? `<div class="rb-prize"><small>CODEX ENTRY COMPLETE · PRIZE</small><b>${esc(TOOLS[pz.tool].name)}</b><span>${esc(pz.text)} · +${pz.rp} RP</span><em>${esc(TOOLS[pz.tool].text)}</em></div>` : after >= 100 ? '<p class="rb-avg">This entry is already complete. More samples still pay RP-free research.</p>' : `<p class="rb-avg">${100 - after}% to go: complete it for a research tool.</p>`}
        <button type="button" class="rb-go">Continue</button>
      </div></div>`;
    // the research bar in hi-res pixel art: what was done before (green), what this sample added (amber)
    const pi = this.dom.querySelector('.rb-prog i') as HTMLElement | null;
    if (pi) requestAnimationFrame(() => {
      const w = Math.max(60, Math.round(pi.clientWidth || 200));
      const { cv, c } = crispCanvas(w, 16);
      drawBar(c, 1, 1, w - 2, 14, after / 100, { lo: { k: before / 100, ramp: GRN }, ramp: AMB, cell: 5, gap: 1, t: 0.4 });
      pi.replaceChildren(cv); pi.classList.add('hi');
    });
    const b = this.dom.querySelector('.rb-go') as HTMLButtonElement;
    b.addEventListener('click', () => this.close());
    this.catcher.remove();
    requestAnimationFrame(() => b.focus({ preventScroll: true }));
    sfx(pz ? 'unlock' : spoilLine ? 'error' : 'stamp', 0.9);
  }

  // ================================================================== building each test
  private clearWork() {
    for (const o of [...this.work.children]) { o.removeFromParent(); o.traverse((q) => { const m = q as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mm) ? mm : [mm]).forEach((x) => { (x as any).map?.dispose?.(); x.dispose(); }); } }); }
    this.rotorSpin = undefined;
    this.usesScreen = false;
    for (const o of this.host.station('dissect').props ?? []) o.visible = true;
    const st = this.host.station('centrifuge');
    st.rotor?.children.filter((c) => c.name === 'benchTube').forEach((c) => c.removeFromParent());
  }
  private build(kind: BenchGame, st: Station) {
    const d = this.g!.data;
    const W = this.work;
    if (kind === 'pipette') {
      const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8f0f4, transparent: true, opacity: 0.35, flatShading: true, side: THREE.DoubleSide, depthWrite: false }));
      beaker.position.set(st.at.x, st.surf + 0.05, st.at.z); W.add(beaker);
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.035, 0.05, 10), new THREE.MeshStandardMaterial({ color: this.col, emissive: new THREE.Color(this.col).multiplyScalar(0.3), flatShading: true }));
      liq.position.set(st.at.x, st.surf + 0.026, st.at.z); W.add(liq);
      const p = pipette(this.col);
      p.g.scale.setScalar(2.4);
      p.g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.transparent) { m.opacity = 0.55; m.color.setHex(0xe8fbff); } });
      W.add(p.g);
      // the red line, a ring round the glass
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.0014, 3, 10), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false })); ring.rotation.x = Math.PI / 2; p.g.add(ring);
      d.p = p; d.ring = ring; d.beaker = beaker; d.fill = 0; d.round = 0; d.sum = 0; d.target = 0.45 + Math.random() * 0.35; d.held = false;
      this.gauge(true, [d.target - 0.05, d.target + 0.05]);
    } else if (kind === 'centrifuge') {
      const rotor = st.rotor!;
      d.balance = Math.floor(Math.random() * 6); d.sel = (d.balance + 2) % 6; d.phase = 0; d.spin = 0; d.hits = []; d.bal = 0;
      d.tubes = [] as THREE.Mesh[];
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 6), new THREE.MeshStandardMaterial({ color: i === d.balance ? 0xd8d8c8 : 0x3a3e40, emissive: new THREE.Color(i === d.balance ? 0x2a2a20 : 0), flatShading: true }));
        m.name = 'benchTube'; m.position.set(Math.cos(i * 1.047) * 0.11, 0.045, Math.sin(i * 1.047) * 0.11); m.visible = i === d.balance;
        rotor.add(m); d.tubes.push(m);
      }
      const sel = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.003, 3, 12), new THREE.MeshBasicMaterial({ color: 0x3aff8a, toneMapped: false })); sel.rotation.x = Math.PI / 2; sel.name = 'benchTube'; rotor.add(sel); d.ring = sel;
      const tubeInHand = vialProp(this.col, 0xe8c228, 0.011, 0.07); W.add(tubeInHand.g); tubeInHand.set(0.6); d.hand = tubeInHand;
      this.rotorSpin = 0;
      this.gauge(false);
    } else if (kind === 'microscope') {
      d.focus = Math.random() < 0.5 ? 0.1 : 0.9; d.target = 0.35 + Math.random() * 0.3; d.phase = 0; d.drift = 1; d.sel = 0; d.lock = 0;
      const e = entry(this.s.src);
      let h = 0; for (const ch of this.s.src) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
      d.cell = CELLS[h % CELLS.length] as Cell;
      const others = CELLS.filter((c) => c !== d.cell).sort(() => Math.random() - 0.5).slice(0, 2);
      d.choices = [d.cell, ...others].sort(() => Math.random() - 0.5) as Cell[];
      d.sharp = document.createElement('canvas'); d.sharp.width = d.sharp.height = SLIDE;
      drawCells(d.sharp.getContext('2d')!, d.cell, this.col, h);
      d.cv = document.createElement('canvas'); d.cv.width = d.cv.height = SLIDE;
      const tex = new THREE.CanvasTexture(d.cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      d.tex = tex;
      // the eyepiece view: a disc in front of the camera with a black ring round it
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.026, 32), new THREE.MeshBasicMaterial({ map: tex, color: 0xb8b8b0, depthTest: false }));
      const ringM = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false }));
      disc.renderOrder = ringM.renderOrder = 20; disc.userData.noGlow = ringM.userData.noGlow = true;
      const view = new THREE.Group(); view.add(disc, ringM); view.visible = false; W.add(view); d.view = view;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, flatShading: true }));
      knob.rotation.set(Math.PI / 2, 0, 0); knob.position.set(st.at.x + 0.01, st.at.y - 0.01, st.at.z + 0.075); W.add(knob); d.knob = knob;
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.002, 0.025), new THREE.MeshStandardMaterial({ color: 0xe8f4f4, transparent: true, opacity: 0.7 }));
      slide.rotation.y = Math.PI / 2; slide.position.set(st.at.x + 0.02, st.at.y - 0.038, st.at.z); W.add(slide); d.slide = slide;
      const smear = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0025, 0.02), new THREE.MeshStandardMaterial({ color: this.col })); smear.position.copy(slide.position); W.add(smear);
      void e;
      this.gauge(true, [d.target - 0.05, d.target + 0.05]);
    } else if (kind === 'dissect') {
      for (const o of st.props ?? []) o.visible = false;
      // the specimen: a pale pinned body with a dotted incision drawn on it
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 192;
      const pts: [number, number][] = [];
      const wob = Math.random() * 6;
      // from the near end (the camera's side) away up the body
      for (let i = 0; i <= 24; i++) { const v = i / 24; pts.push([0.5 + Math.sin(v * 5 + wob) * 0.16 * Math.sin(v * Math.PI), 0.88 - v * 0.76]); }
      d.cv = cv; d.pts = pts; d.cut = pts.map(() => 0); d.off = 0; d.prog = 0; d.err = 0; d.n = 0;
      drawSpecimen(cv.getContext('2d')!, pts, d.cut, this.col);
      const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      d.tex = tex;
      const geo = new THREE.PlaneGeometry(0.26, 0.39, 6, 8);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / 0.13, y = pos.getY(i) / 0.195; pos.setZ(i, Math.max(0, 1 - x * x) * Math.max(0, 1 - y * y * 0.8) * 0.03); }
      geo.computeVertexNormals();
      const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, flatShading: true, color: 0x8a7a7a }));
      body.rotation.x = -Math.PI / 2; body.position.set(st.at.x, st.surf + 0.012, st.at.z);
      W.add(body); d.body = body;
      const blade = scalpel(); blade.scale.setScalar(1.3); W.add(blade); d.blade = blade;
      const fc = forceps(); fc.g.scale.setScalar(1.2); W.add(fc.g); d.forceps = fc;
      d.tip = new THREE.Vector3(st.at.x, st.surf + 0.04, st.at.z - 0.15);
      d.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(st.surf + 0.03));
      this.gauge(false);
    } else {
      // the sequencer: the CRT is drawn by the game; a reference pattern and the read
      this.usesScreen = true;
      const bases = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 4));
      d.ref = bases();
      d.windows = [] as { b: number[]; match: boolean; hit: boolean; judged: boolean }[];
      const order = [true, false, true, false, true].sort(() => Math.random() - 0.5);
      for (const m of order) { let b = m ? [...d.ref] : bases(); if (!m && b.join() === d.ref.join()) b[0] = (b[0] + 1) % 4; d.windows.push({ b, match: m, hit: false, judged: false }); }
      d.x = -1.2; d.cur = -1; d.hits = 0; d.false = 0; d.miss = 0; d.flash = 0; d.flashOk = true;
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: 0x3aff8a, emissive: new THREE.Color(0x0a3a1a), flatShading: true }));
      key.position.set(st.at.x + 0.05, 0.81, st.at.z + 0.24); W.add(key); d.key = key;
      this.gauge(false);
    }
  }

  // ================================================================== frame
  update(dt: number, t: number) {
    this.t = t;
    this.pollPad();
    const cam = this.host.cam;
    const k = 1 - Math.exp(-dt * 5);
    this.camP.lerp(this.goalP, k); this.camL.lerp(this.goalL, k);
    const lean = this.g?.kind === 'microscope' && this.g.data.phase !== undefined && !this.finished ? (this.g.data.lean ?? 0) : 0;
    cam.position.copy(this.camP).lerp(this.goalL, lean * 0.62);
    cam.position.x += Math.sin(t * 0.7) * 0.003; cam.position.y += Math.sin(t * 1.1) * 0.002;
    cam.lookAt(this.camL);
    cam.updateMatrixWorld(true);
    if (this.finished) { this.arms.right.update(dt); this.arms.left.update(dt); return; }
    const g = this.g;
    if (!g) return;
    g.t += dt;
    if (g.done) { g.doneT += dt; if (g.doneT > 1.3) this.next(); }
    else this.step(g, dt);
    if (this.g) this.pose(this.g, dt);
    this.arms.right.update(dt); this.arms.left.update(dt);
  }

  private step(g: Game, dt: number) {
    const d = g.data, edge = this.takeEdge();
    switch (g.kind) {
      case 'pipette': {
        if (this.act) { if (!d.held) { d.held = true; sfx('squeeze', 0.5); } d.fill = Math.min(1.08, d.fill + dt * (0.22 + d.fill * 0.5)); }
        else if (d.held) {
          d.held = false;
          const err = Math.abs(d.fill - d.target);
          const sc = d.fill > d.target + 0.12 ? 0 : clamp(1 - err / 0.16);
          sfx(sc > 0.8 ? 'ding' : sc > 0.3 ? 'tick' : 'miss', 0.7);
          d.sum += sc; d.round++;
          d.fill = 0; d.target = 0.4 + Math.random() * 0.4;
          this.gauge(true, [d.target - 0.05, d.target + 0.05]);
          if (d.round >= 2) this.end(d.sum / 2);
        }
        if (d.fill > 1.04) { d.held = false; this.act = false; sfx('spray', 0.8); d.round++; d.fill = 0; d.target = 0.4 + Math.random() * 0.4; this.gauge(true, [d.target - 0.05, d.target + 0.05]); if (d.round >= 2) this.end(d.sum / 2, 'squirted it into the lamp'); }
        this.needle(d.fill);
        break;
      }
      case 'centrifuge': {
        const rotor = this.host.station('centrifuge').rotor!;
        if (d.phase === 0) {
          // a pointer tap picks the slot nearest the pointer
          if (edge && this.ptrDown && this.host.rayAt) {
            const ray = this.host.rayAt(this.ptrClient.x, this.ptrClient.y);
            const hit = ray?.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -rotor.getWorldPosition(this.v).y), new THREE.Vector3());
            if (hit) {
              const loc = rotor.worldToLocal(hit.clone());
              const a = Math.atan2(loc.z, loc.x);
              const slot = ((Math.round(a / 1.047) % 6) + 6) % 6;
              if (Math.hypot(loc.x, loc.z) < 0.22) { if (slot !== d.sel) { d.sel = slot; sfx('tick', 0.6); break; } }
            }
          }
          if (edge) {
            if (d.sel === d.balance) { sfx('error', 0.6); break; }
            const opp = (d.balance + 3) % 6;
            d.bal = d.sel === opp ? 1 : Math.abs(((d.sel - opp + 9) % 6) - 3) === 2 ? 0.45 : 0.1;
            d.tubes[d.sel].visible = true; (d.tubes[d.sel].material as THREE.MeshStandardMaterial).color.setHex(this.col);
            d.ring.visible = false;
            d.phase = 1; d.spin = 0; d.band = [0.62 + Math.random() * 0.1, 0]; d.band[1] = d.band[0] + 0.12;
            sfx(d.bal > 0.9 ? 'clip' : 'thunk', 0.7);
            this.gauge(true, d.band);
            (this.dom.querySelector('.rb-how span') as HTMLElement).textContent = d.bal > 0.9 ? 'balanced · strike when the needle is in the green' : 'off balance! strike when the needle is in the green';
          }
          d.ring.position.set(Math.cos(d.sel * 1.047) * 0.11, 0.05, Math.sin(d.sel * 1.047) * 0.11);
        } else {
          // the dial: the RPM swings up through the band and back; wobble if unbalanced
          d.spin += dt;
          const x = 0.5 + 0.5 * Math.sin(d.spin * (1.9 + d.hits.length * 0.5) - Math.PI / 2);
          d.x = x;
          this.needle(x);
          this.rotorSpin = 4 + x * 40 + d.hits.length * 10;
          if (edge) {
            const [a, b] = d.band, mid = (a + b) / 2;
            const sc = x >= a && x <= b ? 1 - Math.abs(x - mid) / ((b - a) / 2) * 0.35 : Math.max(0, 0.3 - Math.abs(x - mid) * 2);
            d.hits.push(sc); sfx(sc > 0.6 ? 'hit' : 'miss', 0.7);
            d.band = [0.7 + Math.random() * 0.12, 0]; d.band[1] = d.band[0] + 0.1;
            this.gauge(true, d.band);
            if (d.hits.length >= 2) { this.rotorSpin = 60; sfx('grind', 0.6); this.end(d.bal * 0.5 + ((d.hits[0] + d.hits[1]) / 2) * 0.5, d.bal < 0.5 ? 'the rotor walked half a metre' : undefined); }
          }
        }
        break;
      }
      case 'microscope': {
        d.lean = Math.min(1, (d.lean ?? 0) + dt * 1.4);
        if (d.phase === 0) {
          // turn the knob: held direction, a drag, or (no input) a slow sweep you can tap at
          const drag = this.ptrDown ? this.ptr.x - (d.px ?? this.ptr.x) : 0; d.px = this.ptr.x;
          if (Math.abs(this.dir) > 0.1) d.focus += this.dir * dt * 0.35;
          else if (Math.abs(drag) > 0.0005) d.focus += drag * 0.7;
          else { d.focus += d.drift * dt * 0.16; if (d.focus > 0.98 || d.focus < 0.02) d.drift *= -1; }
          d.focus = clamp(d.focus);
          d.knob.rotation.y = d.focus * 12;
          this.needle(d.focus);
          this.drawView(d);
          if (g.t > 0.6 && edge && !(this.ptrDown && Math.abs(drag) > 0.002)) {
            const err = Math.abs(d.focus - d.target);
            d.fs = clamp(1 - err / 0.18);
            sfx(d.fs > 0.7 ? 'ding' : 'tick', 0.7);
            d.phase = 1; d.sel = 0;
            this.gauge(false);
            (this.dom.querySelector('.rb-how span') as HTMLElement).textContent = 'which cell is this? (← → and space, or tap)';
            this.drawChoices();
          }
        } else if (d.phase === 1 && edge && !this.ptrDown) this.pickCell(d.sel);
        break;
      }
      case 'dissect': {
        const st = this.host.station('dissect');
        const pts: [number, number][] = d.pts;
        const toWorld = (u: number, v: number) => new THREE.Vector3(st.at.x + (u - 0.5) * 0.26, st.surf + 0.03, st.at.z + (v - 0.5) * 0.39);
        // the blade: the pointer on the tray, or (keys / pad) along the path with a drift to steer against
        let tip: THREE.Vector3 | null = null;
        const usePtr = this.ptrDown && !!this.host.rayAt;
        if (usePtr) {
          const ray = this.host.rayAt!(this.ptrClient.x, this.ptrClient.y);
          tip = ray?.intersectPlane(d.plane, new THREE.Vector3()) ?? null;
        } else if (this.act) {
          d.prog = Math.min(1, d.prog + dt * 0.11);
          d.off += (Math.sin(g.t * 2.3) * 0.5 + Math.sin(g.t * 5.1) * 0.3) * dt * 0.05 + this.dir * dt * 0.08;
          d.off = clamp(d.off, -0.12, 0.12);
          const i = d.prog * (pts.length - 1), i0 = Math.floor(i), f = i - i0;
          const a = pts[i0], b = pts[Math.min(pts.length - 1, i0 + 1)];
          tip = toWorld(a[0] + (b[0] - a[0]) * f + d.off, a[1] + (b[1] - a[1]) * f);
        }
        if (tip) d.tip.lerp(tip, 0.5);
        else d.tip.lerp(toWorld(pts[0][0] + 0.18, pts[0][1] + 0.04).setY(st.surf + 0.07), 0.08);
        const cutting = !!tip;
        if (cutting) {
          // which path points the blade covers, and how far off it is
          const u = (d.tip.x - st.at.x) / 0.26 + 0.5, v = (d.tip.z - st.at.z) / 0.39 + 0.5;
          let best = 1e9, bi = -1;
          pts.forEach(([pu, pv], i) => { const dd = Math.hypot((pu - u) * 0.26, (pv - v) * 0.39); if (dd < best) { best = dd; bi = i; } });
          d.n++; d.err += Math.min(0.03, best);
          if (best < 0.012 && bi >= 0 && !d.cut[bi]) { d.cut[bi] = 1; if (Math.random() < 0.5) sfx('slice', 0.35); }
          else if (best > 0.025 && Math.random() < dt * 4) sfx('squelch', 0.3);
          drawSpecimen(d.cv.getContext('2d')!, pts, d.cut, this.col, [u, v], best < 0.012);
          d.tex.needsUpdate = true;
        }
        const covered = d.cut.reduce((a: number, b: number) => a + b, 0) / pts.length;
        this.dom.querySelector('.rb-how span')!.textContent = `trace the dotted line · ${Math.round(covered * 100)}% cut`;
        if (covered >= 0.92 || g.t > 14 || (!usePtr && d.prog >= 1)) {
          const acc = clamp(1 - (d.err / Math.max(1, d.n)) / 0.02);
          this.end(covered * 0.75 + acc * 0.25, covered < 0.4 ? 'most of it is still in one piece' : undefined);
        }
        break;
      }
      case 'sequence': {
        d.x += dt * 0.42;
        const wi = Math.floor(d.x);
        // a window has scrolled past the frame: judge it
        for (let i = 0; i < d.windows.length; i++) { const w = d.windows[i]; if (!w.judged && i < wi) { w.judged = true; if (w.match && !w.hit) { d.miss++; sfx('miss', 0.5); } } }
        d.cur = wi;
        const inFrame = d.x - wi > 0.2 && d.x - wi < 0.85 && wi >= 0 && wi < d.windows.length;
        if (edge) {
          const w = inFrame ? d.windows[wi] : null;
          if (w && w.match && !w.hit) { w.hit = true; d.hits++; d.flash = 0.4; d.flashOk = true; sfx('hit', 0.7); }
          else { d.false++; d.flash = 0.4; d.flashOk = false; sfx('error', 0.5); }
          d.key.position.y -= 0.004; setTimeout(() => { if (d.key) d.key.position.y += 0.004; }, 120);
        }
        d.flash = Math.max(0, d.flash - dt);
        this.drawSeq(d);
        if (wi >= d.windows.length) { const m = d.windows.filter((w: any) => w.match).length; this.end(clamp((d.hits - d.false * 0.5) / m)); }
        break;
      }
    }
  }

  private pickCell(i: number) {
    const g = this.g; if (!g || g.done) return;
    const d = g.data;
    const ok = d.choices[i] === d.cell;
    sfx(ok ? 'confirm' : 'error', 0.7);
    this.end(d.fs * 0.5 + (ok ? 0.5 : 0), ok ? undefined : `that was a ${d.cell} cell`);
  }
  private drawChoices() {
    const g = this.g; if (!g) return;
    const d = g.data;
    const box = this.dom.querySelector('.rb-choices') as HTMLElement | null;
    if (!box) return;
    box.hidden = false;
    if (!box.childElementCount) {
      d.choices.forEach((c: Cell, i: number) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'rb-cell'; b.tabIndex = -1;
        const cv = document.createElement('canvas'); cv.width = cv.height = 96; drawCells(cv.getContext('2d')!, c, 0x9ae8c8, i * 7 + 3, true);
        b.append(cv); const s = document.createElement('span'); s.textContent = c.toUpperCase(); b.append(s);
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', () => this.pickCell(i));
        box.append(b);
      });
    }
    [...box.children].forEach((b, i) => b.classList.toggle('on', i === d.sel));
  }
  private drawView(d: any) {
    const c = d.cv.getContext('2d') as CanvasRenderingContext2D;
    const N = SLIDE;
    const blur = Math.abs(d.focus - d.target);
    const bs = Math.max(1, Math.round(1 + blur * 44));
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#e8f0e0'; c.fillRect(0, 0, N, N);
    if (bs <= 1) c.drawImage(d.sharp, 0, 0);
    else { const n = Math.max(2, Math.floor(N / bs)); const tmp = (d.tmp ??= document.createElement('canvas')) as HTMLCanvasElement; tmp.width = tmp.height = n; const tc = tmp.getContext('2d')!; tc.imageSmoothingEnabled = true; tc.drawImage(d.sharp, 0, 0, n, n); c.drawImage(tmp, 0, 0, N, N); }
    // the graticule: a fine crosshair with tick marks, and a lens vignette
    c.fillStyle = 'rgba(20,30,20,0.55)'; c.fillRect(N / 2 - 1, 36, 1, N - 72); c.fillRect(36, N / 2 - 1, N - 72, 1);
    for (let i = -6; i <= 6; i++) { if (!i) continue; const L = i % 3 === 0 ? 6 : 3; c.fillRect(N / 2 - 1 + i * 8, N / 2 - 1 - L / 2, 1, L); c.fillRect(N / 2 - 1 - L / 2, N / 2 - 1 + i * 8, L, 1); }
    for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) {
      const r = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
      if (r > 0.82) { c.fillStyle = `rgba(10,16,12,${Math.min(0.85, (r - 0.82) * 4)})`; c.fillRect(x, y, 2, 2); }
    }
    d.tex.needsUpdate = true;
  }
  private drawSeq(d: any) {
    const c = this.host.readout;
    if (!c) return;
    const cols = ['#3aff6a', '#ff5a3a', '#3ac8ff', '#ffd23a'];
    // laid out in the old 96 x 72 units, drawn at the canvas's own density (bevels and glints stay one pixel)
    const Wd = c.canvas.width, Hd = c.canvas.height, k = Wd / 96, X = (v: number) => Math.round(v * k), px = Math.max(1, Math.round(k));
    c.fillStyle = '#04100a'; c.fillRect(0, 0, Wd, Hd);
    // the reference, top
    c.fillStyle = '#0a3a1a'; c.fillRect(X(20), X(3), X(56), X(14));
    d.ref.forEach((b: number, i: number) => block(c, X(23 + i * 13), X(6), X(10), X(8), cols[b]));
    // the read: windows of four, scrolling left through the frame
    const fx = 30, fw = 36;
    c.fillStyle = d.flash > 0 ? (d.flashOk ? '#1a6a2a' : '#6a1a10') : '#0a2a14'; c.fillRect(X(fx - 2), X(30), X(fw + 4), X(22));
    for (let i = 0; i < d.windows.length; i++) {
      const w = d.windows[i];
      const x = fx + (i - d.x + 0.5) * 48;
      if (x < -50 || x > 100) continue;
      w.b.forEach((b: number, j: number) => block(c, X(x + j * 9), X(34), X(7), X(14), w.hit ? '#ffffff' : cols[b]));
    }
    c.fillStyle = '#3aff6a'; c.fillRect(X(fx - 2), X(29), X(fw + 4), px); c.fillRect(X(fx - 2), X(52), X(fw + 4), px);
    const ts = Math.max(1, Math.round(k * 0.67));
    bitText(c, `${d.hits}`, X(4), X(54), { color: '#3aff6a', outline: null, scale: ts });
    bitText(c, `${d.false}`, X(92), X(54), { color: '#ff5a3a', outline: null, scale: ts, align: 'right' });
    for (let y = 0; y < Hd; y += 2) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y, Wd, 1); }
  }

  // ================================================================== the hands
  private pose(g: Game, _dt: number) {
    const d = g.data, R = this.arms.right, L = this.arms.left, root = this.rig;
    const cam = this.host.cam;
    // elbows below and outside the frame, in the camera's space
    const elbow = (sx: number) => { const e = cam.localToWorld(this.v.set(sx * 0.3, -0.4, -0.26)); return [e.x, e.y, e.z] as [number, number, number]; };
    const st = this.host.station(g.kind);
    const show = (on: boolean) => { R.root.visible = L.root.visible = on; };
    show(true);
    R.tremor = 0;
    switch (g.kind) {
      case 'pipette': {
        const p = d.p;
        p.set(Math.min(1, d.fill));
        p.g.position.set(st.at.x, st.surf + 0.06 + 0.13, st.at.z);
        p.g.rotation.set(0, 0, 0.04 + Math.sin(this.t * 1.3) * 0.01);
        d.ring.position.y = -0.05 + Math.min(1, d.target) * 0.07;
        holdArm(R, root, 'pinch', p.g, [0, 0.06, 0], elbow(1), [-0.4, 0.2, 0.6]);
        R.tremor = d.held ? 0.3 : 0.05;
        holdArm(L, root, 'cup', d.beaker, [-0.03, 0.0, 0.0], elbow(-1), [0.6, 0.2, 0.6]);
        break;
      }
      case 'centrifuge': {
        const h = d.hand;
        const rotor = st.rotor!;
        const target = d.phase === 0 ? rotor.localToWorld(new THREE.Vector3(Math.cos(d.sel * 1.047) * 0.11, 0.14, Math.sin(d.sel * 1.047) * 0.11)) : new THREE.Vector3(st.at.x - 0.2, st.at.y + 0.1, st.at.z + 0.18);
        h.g.position.lerp(target, 0.25);
        h.g.visible = d.phase === 0;
        holdArm(R, root, d.phase === 0 ? 'pinch' : 'press', h.g, [0, 0.02, 0], elbow(1), [-0.5, 0.3, 0.5]);
        const lid = new THREE.Object3D(); lid.position.set(st.at.x - 0.16, st.at.y - 0.12, st.at.z + 0.1); root.add(lid);
        holdArm(L, root, 'flat', lid, [0, 0, 0], elbow(-1), [0.3, 1, 0.2]);
        lid.removeFromParent();
        break;
      }
      case 'microscope': {
        const view = d.view as THREE.Group;
        view.visible = (d.lean ?? 0) > 0.85;
        // the eyepiece view sits just in front of the lens
        cam.getWorldDirection(this.v);
        view.position.copy(cam.position).addScaledVector(this.v, 0.09);
        view.quaternion.copy(cam.quaternion);
        holdArm(R, root, 'pinch', d.knob, [0, 0, -0.01], elbow(1), [-0.2, 0.3, 0.8]);
        holdArm(L, root, 'pinch', d.slide, [0, 0, -0.03], elbow(-1), [0.3, 1, 0.3]);
        break;
      }
      case 'dissect': {
        const b = d.blade as THREE.Group;
        b.position.copy(d.tip).add(this.v.set(0, 0.046, 0));
        b.rotation.set(-0.35, 0, 0.15);
        holdArm(R, root, 'pinch', b, [0, 0.06, 0], elbow(1), [-0.5, 0.4, 0.6]);
        const f = d.forceps;
        f.open(0.3 + Math.sin(this.t * 2) * 0.1);
        f.g.position.set(st.at.x - 0.09, st.surf + 0.085, st.at.z - 0.02);
        f.g.rotation.set(-0.4, 0, -0.3);
        holdArm(L, root, 'pinch', f.g, [0, 0.07, 0], elbow(-1), [0.5, 0.4, 0.6]);
        break;
      }
      case 'sequence': {
        holdArm(R, root, 'point', d.key, [0, 0.02 + (this.act ? -0.005 : 0.01), 0], elbow(1), [-0.3, 1, 0.3]);
        const rest = new THREE.Object3D(); rest.position.set(st.at.x - 0.2, 0.82, st.at.z + 0.28); root.add(rest);
        holdArm(L, root, 'flat', rest, [0, 0, 0], elbow(-1), [0.2, 1, 0.3]);
        rest.removeFromParent();
        break;
      }
    }
  }
}

// ================================================================== pixel art
/** the microscope's slide resolution (round 13: twice the old 96) */
const SLIDE = 192;
/** a lit block for the sequencer CRT: a bright top line, the colour, a dark bottom */
function block(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(x, y, w, 1); c.fillRect(x, y, 1, h - 1);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, y + h - 1, w, 1); c.fillRect(x + w - 1, y + 1, 1, h - 1);
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(x + 1, y + 1, 1, 1);
}
/** a field of cells of one kind (the microscope's slide; small = the choice icon), drawn per pixel with membranes, cytoplasm, nuclei and glints */
function drawCells(c: CanvasRenderingContext2D, kind: Cell, col: number, seed: number, small = false) {
  const N = c.canvas.width, k = N / 96;
  let s = seed || 7;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const C = new THREE.Color(col);
  const tint = (m: number, a = 1) => `rgba(${Math.round(C.r * 255 * m)},${Math.round(C.g * 255 * m)},${Math.round(C.b * 255 * m)},${a})`;
  c.fillStyle = small ? '#10201a' : '#e4ecd8'; c.fillRect(0, 0, N, N);
  // the slide: faint grain and stray debris
  if (!small) { for (let i = 0; i < 700; i++) { c.fillStyle = rnd() < 0.7 ? 'rgba(120,140,110,0.16)' : 'rgba(255,255,250,0.35)'; c.fillRect(Math.floor(rnd() * N), Math.floor(rnd() * N), 1 + Math.floor(rnd() * 2), 1); } }
  else { for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(60,110,90,0.25)'; c.fillRect(Math.floor(rnd() * N), Math.floor(rnd() * N), 1, 1); } }
  const n = small ? 3 : 9;
  const blob = (x: number, y: number, rx: number, ry: number, rot: number, wob: number) => {
    // a filled cell body: membrane (dark), cytoplasm (lit from the top-left), granules
    const R = Math.ceil(Math.max(rx, ry) + 2), cr = Math.cos(rot), sr = Math.sin(rot);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const u = (i * cr + j * sr) / rx, v = (-i * sr + j * cr) / ry;
      const a = Math.atan2(v, u), d = Math.hypot(u, v) * (1 + Math.sin(a * 3 + wob) * 0.06);
      if (d > 1) continue;
      const px = Math.round(x + i), py = Math.round(y + j);
      const lit = 0.75 + (-(i + j) / (R * 2)) * 0.35;
      c.fillStyle = d > 0.86 ? tint(0.38) : d > 0.74 ? tint(0.62) : tint(Math.min(1.25, lit) * 0.92, 0.85);
      c.fillRect(px, py, 1, 1);
      if (d < 0.7 && ((px * 7 + py * 13) % 23) === 0) { c.fillStyle = tint(0.5); c.fillRect(px, py, 1, 1); }
    }
    // a glint on the membrane
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(Math.round(x - rx * 0.45), Math.round(y - ry * 0.55), Math.max(1, Math.round(k)), 1);
  };
  const nucleus = (x: number, y: number, r: number) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const d = Math.hypot(i, j) / r; if (d > 1) continue; c.fillStyle = d > 0.7 ? tint(0.22) : tint(0.32); c.fillRect(Math.round(x + i), Math.round(y + j), 1, 1); }
    c.fillStyle = tint(0.6); c.fillRect(Math.round(x - r * 0.4), Math.round(y - r * 0.4), 1, 1);
  };
  for (let i = 0; i < n; i++) {
    const x = small ? (20 + (i % 2) * 44 + rnd() * 12) * k : (8 + rnd() * 80) * k, y = small ? (24 + Math.floor(i / 2) * 36 + rnd() * 8) * k : (8 + rnd() * 80) * k;
    const r = (small ? (6 + rnd() * 4) * 2 : 7 + rnd() * 4) * k;
    if (kind === 'round') { blob(x, y, r, r * (0.9 + rnd() * 0.15), rnd() * 3, rnd() * 6); nucleus(x - r * 0.1, y, Math.max(2, Math.round(r * 0.32))); }
    else if (kind === 'spindle') { const a0 = rnd() * 3; blob(x, y, r * 1.7, r * 0.45, a0, rnd() * 6); nucleus(x, y, Math.max(1, Math.round(r * 0.22))); }
    else if (kind === 'spore') {
      blob(x, y, r * 0.55, r * 0.55, 0, 0);
      for (let a = 0; a < 6.28; a += 0.52) { const L = r * (0.75 + (Math.round(a * 10) % 3) * 0.08); c.fillStyle = tint(0.45); for (let t = r * 0.55; t < L; t += 1) c.fillRect(Math.round(x + Math.cos(a) * t), Math.round(y + Math.sin(a) * t), 1, 1); c.fillStyle = tint(1.2); c.fillRect(Math.round(x + Math.cos(a) * L), Math.round(y + Math.sin(a) * L), Math.max(1, Math.round(k)), Math.max(1, Math.round(k))); }
    }
    else if (kind === 'crystal') {
      // a faceted rhomb: two lit faces, two dark, a bright ridge
      const hgt = r * 1.1, wd = r * 0.6;
      for (let j = -hgt; j <= hgt; j++) { const half = wd * (1 - Math.abs(j) / hgt); for (let i = -half; i <= half; i++) { c.fillStyle = i < 0 ? (j < 0 ? tint(1.15) : tint(0.8)) : (j < 0 ? tint(0.6) : tint(0.42)); c.fillRect(Math.round(x + i), Math.round(y + j), 1, 1); } }
      c.fillStyle = 'rgba(255,255,255,0.85)'; for (let j = -hgt + 2; j < hgt - 2; j++) c.fillRect(Math.round(x), Math.round(y + j), 1, 1);
    }
    else { for (let q = 0; q < 4; q++) { const cx = x + (q * 5 - 8) * k, cy = y + Math.sin(q + seed) * 2 * k; blob(cx, cy, 2.6 * k, 2.6 * k, 0, q); nucleus(cx, cy, Math.max(1, Math.round(k))); } }
  }
}
/** the dissection specimen: pale skin with pores and veins, the dotted line, the cut so far, the blade's mark (drawn at 2x the old resolution) */
function drawSpecimen(c: CanvasRenderingContext2D, pts: [number, number][], cut: number[], col: number, tip?: [number, number], onLine?: boolean) {
  const Wd = c.canvas.width, Hd = c.canvas.height, k = Wd / 64;
  // skin: a soft top-left light, mottling and pores
  for (let y = 0; y < Hd; y += 2) for (let x = 0; x < Wd; x += 2) {
    const l = 1.05 - (x / Wd) * 0.12 - (y / Hd) * 0.1;
    c.fillStyle = `rgb(${Math.round(200 * l)},${Math.round(138 * l)},${Math.round(124 * l)})`; c.fillRect(x, y, 2, 2);
  }
  let s = 11; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 900; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(160,90,90,0.22)' : 'rgba(250,220,210,0.28)'; c.fillRect(Math.floor(rnd() * Wd), Math.floor(rnd() * Hd), 1 + Math.floor(rnd() * 2), 1); }
  for (let i = 0; i < 140; i++) { c.fillStyle = 'rgba(120,60,60,0.35)'; c.fillRect(Math.floor(rnd() * Wd), Math.floor(rnd() * Hd), 1, 1); }
  // veins: branching, a darker core with a lighter edge
  for (let q = 0; q < 6; q++) {
    let x = rnd() * Wd, y = rnd() * Hd * 0.3;
    for (let i = 0; i < 40 * k; i++) { x += (rnd() - 0.5) * 2.2; y += 1.4; c.fillStyle = 'rgba(110,80,160,0.55)'; c.fillRect(Math.round(x), Math.round(y), 1, 1); c.fillStyle = 'rgba(170,140,210,0.3)'; c.fillRect(Math.round(x) + 1, Math.round(y), 1, 1); }
  }
  const C = new THREE.Color(col);
  pts.forEach(([u, v], i) => {
    const x = Math.round(u * Wd), y = Math.round(v * Hd);
    if (cut[i]) {
      // an open cut: dark edges, the wet inside in the sample's colour, a glint
      c.fillStyle = '#4a060e'; c.fillRect(x - 2, y - 4, 5, 9);
      c.fillStyle = '#8a1420'; c.fillRect(x - 1, y - 4, 3, 9);
      c.fillStyle = `rgb(${Math.round(C.r * 255)},${Math.round(C.g * 200)},${Math.round(C.b * 200)})`; c.fillRect(x, y - 3, 1, 7);
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(x - 1, y - 3, 1, 1);
    }
    else if (i % 2 === 0) { c.fillStyle = '#1a1a4a'; c.fillRect(x - 1, y - 1, 3, 3); c.fillStyle = '#4a4aa0'; c.fillRect(x - 1, y - 1, 2, 2); c.fillStyle = '#9a9ae0'; c.fillRect(x - 1, y - 1, 1, 1); }
  });
  if (tip) { const tx = Math.round(tip[0] * Wd), ty = Math.round(tip[1] * Hd); c.fillStyle = '#07060a'; c.fillRect(tx - 2, ty - 2, 5, 5); c.fillStyle = onLine ? '#ffffff' : '#ff3a2a'; c.fillRect(tx - 1, ty - 1, 3, 3); c.fillStyle = onLine ? '#9affb0' : '#ffb0a0'; c.fillRect(tx - 1, ty - 1, 1, 1); }
}

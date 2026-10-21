// The workbench in first person. Your iron cube sits open on the left of the
// bench; pull things out of it onto the boards, then work them by hand:
// drag one onto another to put them together, or pick a blueprint card.
// Hand steps (sawing, striking, binding) go to the close-up; ordinary
// recipes are assembled by holding your hands on the work while the hammer
// and saw do their thing. Every recipe in the game can be made here.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { TileObject } from '../world/zone';
import type { Container } from '../items/container';
import { type Item, itemDef, itemName } from '../items/item';
import { allRecipes, type Recipe } from '../items/recipes';
import { checkRecipe, CraftAction } from '../interact/crafting';
import { hasUnlock, researchNode } from '../game/research';
import { gridSpec } from '../items/grid';
import { setPlace } from '../items/grid';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../fp/fp';
import { ModelBuilder } from '../gfx/modelBuilder';
import { CubeView, CELL } from './cubeView';
import { HAND_OPS, type HandOp, matches, pickTool, pickParts, partLabel, toolLabel } from './handOps';
import { Tweens, easeOut, easeBack, makeArm, poseArm, type Arm, makeBackdrop, makeItemObj, fitItemObj, type ItemObj, pointerRay, Particles, fpMat, itemAlign, damp } from './fpKit';
import { recipeHint } from './knowledge';

interface Staged { it: Item; obj: ItemObj; spot: number }
const SPOTS_X = 5, SPOTS_Z = 3, SPOT = 0.13;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Bench {
  open = false;
  private built = false;
  private g!: THREE.Group;
  private top = new THREE.Group();
  private cube = new CubeView();
  private staged: Staged[] = [];
  private stageG = new THREE.Group();
  private obj: TileObject | null = null;
  private tw = new Tweens();
  private arms: Arm[] = [];
  private dust = new Particles(100, false, 2);
  private sparks = new Particles(100, true, 3);
  private rc = new THREE.Raycaster();
  private drag: { id: number; it: Item; from: 'cube' | 'bench'; ghost: ItemObj; x0: number; y0: number; live: boolean } | null = null;
  private px = 0; private py = 0;
  private hold: { r: Recipe; t: number; dur: number; down: boolean; tick: number } | null = null;
  private lastT = performance.now();
  private lastTap = { uid: 0, t: 0 };
  private dirty = true;
  root: HTMLDivElement;
  private cards: HTMLElement; private prog: HTMLElement; private note: HTMLElement; private hint: HTMLElement;
  private noteT = 0;

  constructor() {
    const r = document.createElement('div');
    r.className = 'fpk fpk-bench';
    r.innerHTML = `<div class="fpk-top"><div class="fpk-title">WORKBENCH<small>pull things out of the cube onto the boards · drag one onto another to combine</small></div></div>
      <div class="fpk-cards"></div>
      <div class="fpk-prog"><div class="lbl"></div><div class="fpk-bar"><i></i></div></div>
      <div class="fpk-btns"><button class="fpk-b" data-b="clear">CLEAR<kbd>back in the cube</kbd></button><button class="fpk-b" data-b="back">BACK<kbd>Esc</kbd></button></div>
      <div class="fpk-hint"></div><div class="fpk-note"></div>`;
    document.body.appendChild(r);
    this.root = r;
    this.cards = r.querySelector('.fpk-cards')!; this.prog = r.querySelector('.fpk-prog')!; this.note = r.querySelector('.fpk-note')!; this.hint = r.querySelector('.fpk-hint')!;
    r.querySelectorAll<HTMLButtonElement>('.fpk-b').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (b.dataset.b === 'clear') this.clear(); else this.close(); }));
    r.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    r.addEventListener('touchmove', (e) => { if (this.open) e.preventDefault(); }, { passive: false });
    bus.on('inventoryChanged', () => { this.dirty = true; });
    bus.on('fpLost', (n: string) => { if (n === 'bench' && this.open) this.suspended = true; });
    bus.on('fpChange', (n: string | null) => { if (n === null && this.open && this.suspended) setTimeout(() => this.resume(), 0); });
  }
  private suspended = false;

  private build() {
    if (this.built) return;
    this.built = true;
    const g = (this.g = fpGroup('bench'));
    const bd = makeBackdrop(); (bd.material as THREE.MeshBasicMaterial).opacity = 0.9; g.add(bd);
    g.add(new THREE.AmbientLight(0xd0ccc0, 0.6));
    const lamp = new THREE.DirectionalLight(0xffe8c8, 1.2); lamp.position.set(0.3, 1.5, 0.4); g.add(lamp);
    const fill = new THREE.DirectionalLight(0x5ae0d0, 0.3); fill.position.set(-1, 0.2, 0.2); g.add(fill);
    // the bench: thick scarred boards, a steel edge, a vice on the right
    const mb = new ModelBuilder();
    mb.box(0, -0.05, 0, 1.5, 0.05, 0.62, 'wood_light', { color: 0xb08858, uvScale: 2 });
    mb.box(0, -0.06, 0.315, 1.52, 0.06, 0.02, 'metal_grey', { color: 0x8a9096 });
    for (let i = 0; i < 6; i++) mb.box(-0.6 + i * 0.24, -0.0005, 0, 0.004, 0.001, 0.6, 'wood_dark', { color: 0x6a4a2a });
    mb.box(0.62, 0, -0.18, 0.16, 0.06, 0.12, 'metal_painted_green', { color: 0x3a5a4a });
    mb.box(0.62, 0.06, -0.12, 0.14, 0.05, 0.02, 'metal_grey'); mb.box(0.62, 0.06, -0.24, 0.14, 0.05, 0.02, 'metal_grey');
    mb.box(0.62, 0.03, -0.04, 0.012, 0.012, 0.2, 'metal_brushed');
    for (const [x, z, c] of [[0.1, 0.05, 0x3a2a1a], [0.3, -0.12, 0x2a2018], [-0.2, 0.18, 0x4a3420]] as [number, number, number][]) mb.box(x, -0.0002, z, 0.09, 0.0006, 0.06, 'wood_dark', { color: c });
    const benchMesh = new THREE.Mesh(mb.build(), fpMat());
    this.top.add(benchMesh);
    this.top.add(this.stageG);
    this.top.add(this.cube.root);
    this.cube.root.scale.setScalar(0.72);
    this.cube.root.position.set(-0.5, 0, -0.02);
    g.add(this.top);
    g.add(this.dust.points, this.sparks.points);
    for (const s of [1, -1] as const) { const a = makeArm(s); g.add(a.root); this.arms.push(a); }
  }

  private layout() {
    const asp = window.innerWidth / Math.max(1, window.innerHeight);
    this.top.position.set(asp < 1.2 ? 0 : -0.12, -0.2, -1.55);
    this.top.rotation.set(0.72, 0, 0);
    this.top.scale.setScalar(Math.min(1, asp / 1.5));
  }

  /** stand at a workbench */
  show(o: TileObject | null) {
    const p = G.local;
    if (!p) return;
    this.build();
    if (!fpClaim('bench', 3)) return;
    if (G.ui?.inventory?.open) G.ui.inventory.toggle(false);
    this.open = true; this.suspended = false;
    this.obj = o;
    this.root.classList.add('on', 'ready');
    G.input.pointerOverUI = true;
    const back = p.worn.get('back' as any);
    this.cube.setContainer(back?.inv ?? null);
    this.cube.setLid(1); this.cube.setBolts(1); this.cube.setInside(1);
    this.cube.root.rotation.set(0, 0.35, 0);
    this.layout();
    this.dirty = true;
    G.audio?.ui?.('cube_clunk', 0.5);
    this.top.position.y = -0.7;
    this.tw.add(0.35, (k) => { this.top.position.y = -0.7 + 0.5 * k; }, easeBack);
    this.say('workbench');
    this.hint.textContent = 'drag from the cube onto the bench · drag one thing onto another · double-click to work on it';
  }

  private resume() {
    if (!this.open || fpOwner()) return;
    if (!fpClaim('bench', 3)) return;
    this.suspended = false;
    this.root.classList.add('on', 'ready');
    G.input.pointerOverUI = true;
    this.dirty = true;
  }

  close() {
    if (!this.open) return;
    this.open = false; this.hold = null;
    this.cancelDrag();
    this.root.classList.remove('on', 'ready');
    this.prog.classList.remove('on');
    for (const s of this.staged) this.stageG.remove(s.obj.outer);
    this.staged = [];
    this.cube.hidden.clear();
    if (fpOwner() === 'bench') fpRelease('bench');
    G.input.pointerOverUI = false;
  }

  /** put everything back in the cube */
  private clear() {
    for (const s of this.staged) this.stageG.remove(s.obj.outer);
    this.staged = []; this.cube.hidden.clear(); this.dirty = true;
    G.audio?.ui?.('cube_place', 0.4);
  }

  // ---------------------------------------------------------------- staging
  private spotPos(i: number, out: THREE.Vector3) {
    const x = i % SPOTS_X, z = Math.floor(i / SPOTS_X);
    return out.set(-0.12 + x * SPOT, 0.0, -0.17 + z * SPOT);
  }
  private freeSpot(near?: THREE.Vector3): number {
    let best = -1, bd = 1e9;
    for (let i = 0; i < SPOTS_X * SPOTS_Z; i++) {
      if (this.staged.some((s) => s.spot === i)) continue;
      const d = near ? this.spotPos(i, _w).distanceTo(near) : i;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  stage(it: Item, near?: THREE.Vector3): boolean {
    if (this.staged.some((s) => s.it === it)) return true;
    const spot = this.freeSpot(near);
    if (spot < 0) { this.say('the bench is full', true); return false; }
    const obj = makeItemObj(it.key);
    const al = itemAlign(it.key);
    fitItemObj(obj, 0, SPOT * 0.9, SPOT * 0.9, SPOT * 0.6, 1.4);
    void al;
    this.spotPos(spot, obj.outer.position);
    obj.outer.position.y = 0.04;
    const target = obj.outer.position.clone(); target.y = SPOT * 0.3;
    obj.outer.userData.uid = it.uid;
    this.stageG.add(obj.outer);
    this.staged.push({ it, obj, spot });
    this.cube.hidden.add(it); this.cube.refresh();
    this.tw.add(0.2, (k) => { obj.outer.position.y = 0.12 * (1 - k) + target.y; }, easeOut, () => { G.audio?.ui?.('cube_place', 0.35); });
    this.dirty = true;
    return true;
  }
  private unstage(it: Item) {
    const i = this.staged.findIndex((s) => s.it === it);
    if (i < 0) return;
    this.stageG.remove(this.staged[i].obj.outer);
    this.staged.splice(i, 1);
    this.cube.hidden.delete(it); this.cube.refresh();
    this.dirty = true;
  }
  /** staged things that still exist (crafting uses them up) */
  private prune() {
    const all = new Set(G.local.allItems());
    for (const s of [...this.staged]) if (!all.has(s.it)) { this.stageG.remove(s.obj.outer); this.staged.splice(this.staged.indexOf(s), 1); this.cube.hidden.delete(s.it); }
  }

  // ---------------------------------------------------------------- the cards: what can be made from what is on the bench
  private renderCards() {
    const p = G.local;
    const onBench = this.staged.map((s) => s.it);
    const known: Set<string> = (p as any).knownRecipes || new Set();
    const rows: { html: string; ok: boolean; score: number; run: () => void }[] = [];
    // hand steps
    for (const h of HAND_OPS) {
      if (!h.item) continue;
      const tgt = onBench.find((it) => h.item!(it, itemDef(it.key)));
      if (!tgt) continue;
      const tool = pickTool(p, h, tgt);
      const parts = pickParts(p, h, tgt, onBench);
      const lock = h.requires && !hasUnlock(h.requires) ? 'research: ' + (researchNode(h.requires)?.title || h.requires) : '';
      const miss = parts.filter((q) => q.missing).map((q) => partLabel(q.req));
      const ok = !lock && !!tool && !miss.length;
      rows.push({ ok, score: ok ? 3 : 1, run: () => { if (ok) this.handStep(tgt, h); }, html: `<b>${h.name.toUpperCase()}</b>${itemName(tgt).toLowerCase()} · ${tool?.it ? itemName(tool.it).toLowerCase() : tool ? 'bare hands' : '<span class="miss">need ' + toolLabel(h) + '</span>'}${miss.length ? '<br><span class="miss">need ' + miss.join(', ') + '</span>' : ''}${lock ? '<br><span class="miss">' + lock + '</span>' : ''}` });
    }
    // every recipe: ones that use what is on the bench first
    for (const r of allRecipes()) {
      const uses = r.inputs.filter((i) => !i.keep).some((inp) => onBench.some((it) => matches(it, inp.item)));
      const benchOnly = (r.needs || []).includes('workbench');
      if (!uses && !(benchOnly && onBench.length === 0)) continue;
      if (r.learned && !known.has(r.key)) {
        if (uses) rows.push({ ok: false, score: 0, run: () => {}, html: `<b>${r.name.toUpperCase()}</b><span class="miss">schematic unknown${recipeHint(r) ? ': ' + recipeHint(r) : ''}</span>` });
        continue;
      }
      const chk = checkRecipe(p, r, onBench);
      const need = this.notOnBench(r, onBench);
      const ok = chk.ok && !need.length;
      rows.push({
        ok, score: ok ? 2.5 : chk.ok ? 2 : uses ? 1 : 0.5,
        run: () => { if (ok) this.assemble(r); else if (chk.ok && need.length) this.pull(r); },
        html: `<b>${r.name.toUpperCase()}</b>${r.inputs.map((i) => (i.count && i.count > 1 ? i.count + '× ' : '') + (i.item.startsWith('#') ? i.item.slice(1) : itemDef(i.item).name.toLowerCase()) + (i.keep ? ' (tool)' : '')).join(', ')}${!chk.ok ? '<br><span class="miss">need ' + chk.missing.slice(0, 3).join(', ') + '</span>' : need.length ? '<br>tap to pull ' + need.join(', ') + ' onto the bench' : ''}`,
      });
    }
    rows.sort((a, b) => b.score - a.score);
    this.cards.innerHTML = '';
    if (!rows.length) { this.cards.innerHTML = '<div class="fpk-card no"><b>NOTHING ON THE BENCH</b>drag things out of the cube onto the boards</div>'; return; }
    for (const row of rows.slice(0, 16)) {
      const c = document.createElement('div');
      c.className = 'fpk-card ' + (row.ok ? 'ok' : row.score >= 2 ? '' : 'no');
      c.innerHTML = row.html;
      c.addEventListener('click', (e) => { e.stopPropagation(); row.run(); });
      this.cards.appendChild(c);
    }
  }

  /** consumed inputs not yet laid out on the bench */
  private notOnBench(r: Recipe, onBench: Item[]): string[] {
    const used = new Set<Item>();
    const out: string[] = [];
    for (const inp of r.inputs) {
      if (inp.keep || inp.uses || inp.fluid) continue;
      const n = inp.count ?? 1;
      const got = onBench.filter((it) => !used.has(it) && matches(it, inp.item)).slice(0, n);
      got.forEach((g) => used.add(g));
      if (got.length < n) out.push((n - got.length > 1 ? (n - got.length) + '× ' : '') + (inp.item.startsWith('#') ? inp.item.slice(1) : itemDef(inp.item).name.toLowerCase()));
    }
    return out;
  }

  /** lay a recipe's parts out of the cube onto the bench */
  private pull(r: Recipe) {
    const p = G.local;
    const onBench = new Set(this.staged.map((s) => s.it));
    const pool = p.allItems().filter((i) => !p.isWorn(i) && !onBench.has(i));
    for (const inp of r.inputs) {
      if (inp.keep || inp.uses || inp.fluid) continue;
      let have = this.staged.filter((s) => matches(s.it, inp.item)).length;
      for (const it of pool) { if (have >= (inp.count ?? 1)) break; if (matches(it, inp.item) && !onBench.has(it)) { this.stage(it); onBench.add(it); have++; } }
    }
  }

  private handStep(target: Item, h: HandOp) {
    const p = G.local;
    (G as any).craft?.inspect?.(target, p.containerOf(target) || p.inv, { op: h.key, bench: true });
  }

  /** hold your hands on the work until it comes together */
  private assemble(r: Recipe) {
    const speed = hasUnlock('rc_bench') ? 0.65 : 1;
    const dur = Math.max(0.9, Math.min(5, r.time * 0.12 * speed));
    this.hold = { r, t: 0, dur, down: false, tick: 0 };
    this.prog.classList.add('on');
    (this.prog.querySelector('.lbl') as HTMLElement).textContent = 'HOLD ON THE BENCH: ' + r.name.toUpperCase();
    (this.prog.querySelector('i') as HTMLElement).style.width = '0%';
    this.hint.textContent = 'press and hold on the bench to work it';
  }

  private finishAssemble() {
    const h = this.hold!;
    this.hold = null;
    this.prog.classList.remove('on');
    const p = G.local;
    const before = new Set(p.allItems());
    const a = new CraftAction(p, h.r);
    a.prefer = this.staged.map((s) => s.it);
    try { a.perform(); } catch (e) { console.warn('bench craft', e); }
    G.missions?.set?.('craft:bench');
    const fresh = p.allItems().filter((i) => !before.has(i));
    this.prune();
    for (const it of fresh) this.stage(it);
    G.audio?.ui?.('craft_done', 0.5);
    this.sparks.emit(0, -0.1, -1.4, 20, 0xfff0b0, 0.6, 0.6);
    this.say(fresh.length ? '+ ' + itemName(fresh[0]).toLowerCase() : h.r.name.toLowerCase());
    this.hint.textContent = 'drag from the cube onto the bench · drag one thing onto another · double-click to work on it';
    this.dirty = true;
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (!this.open || this.suspended || G.input.textFocus) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.code === 'Escape') { if (this.hold) { this.hold = null; this.prog.classList.remove('on'); } else this.close(); }
  }

  private stagedAt(x: number, y: number): Staged | null {
    pointerRay(this.rc, fpCamera(), x, y);
    const hits = this.rc.intersectObjects(this.staged.map((s) => s.obj.outer), true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && o.userData.uid === undefined) o = o.parent; const s = o ? this.staged.find((q) => q.it.uid === o!.userData.uid) : null; if (s) return s; }
    return null;
  }
  /** the bench surface point under the pointer (bench-local), or null */
  private benchAt(x: number, y: number): THREE.Vector3 | null {
    const ray = pointerRay(this.rc, fpCamera(), x, y);
    this.top.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(this.top.matrixWorld).invert();
    const r = ray.clone().applyMatrix4(inv);
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = -r.origin.y / r.direction.y;
    if (t < 0) return null;
    const p = r.at(t, new THREE.Vector3());
    return Math.abs(p.x) < 0.76 && Math.abs(p.z) < 0.32 ? p : null;
  }

  private onDown(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    if ((e.target as HTMLElement).closest('.fpk-b,.fpk-card')) return;
    this.px = e.clientX; this.py = e.clientY;
    if (this.hold) { this.hold.down = true; return; }
    const s = this.stagedAt(e.clientX, e.clientY);
    if (s) { this.beginDrag(e, s.it, 'bench'); return; }
    pointerRay(this.rc, fpCamera(), e.clientX, e.clientY);
    const h = this.cube.pickAt(this.rc);
    if (h) this.beginDrag(e, h.a.items[0], 'cube');
  }

  private beginDrag(e: PointerEvent, it: Item, from: 'cube' | 'bench') {
    const ghost = makeItemObj(it.key);
    fitItemObj(ghost, 0, 0.11, 0.11, 0.08, 1.4);
    ghost.outer.visible = false;
    this.g.add(ghost.outer);
    this.drag = { id: e.pointerId, it, from, ghost, x0: e.clientX, y0: e.clientY, live: false };
  }
  private cancelDrag() { if (this.drag) { this.drag.ghost.outer.parent?.remove(this.drag.ghost.outer); this.drag = null; } }

  private onMove(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    this.px = e.clientX; this.py = e.clientY;
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.live && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
      d.live = true; d.ghost.outer.visible = true;
      if (d.from === 'bench') { const s = this.staged.find((q) => q.it === d.it); if (s) s.obj.outer.visible = false; }
      G.audio?.itemSound?.(d.it.key, 'pick', G.local);
    }
  }

  private onUp(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    if (this.hold) { this.hold.down = false; return; }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.cancelDrag();
    const s0 = this.staged.find((q) => q.it === d.it);
    if (s0) s0.obj.outer.visible = true;
    if (!d.live) {
      // click: double-click to work on it
      const now = performance.now();
      if (this.lastTap.uid === d.it.uid && now - this.lastTap.t < 360) { this.lastTap.uid = 0; const p = G.local; (G as any).craft?.inspect?.(d.it, p.containerOf(d.it) || p.inv, { bench: true }); }
      else this.lastTap = { uid: d.it.uid, t: now };
      return;
    }
    // onto another thing on the bench: put them together
    const other = this.stagedAt(e.clientX, e.clientY);
    if (other && other.it !== d.it) { this.combine(d.it, other.it); return; }
    const at = this.benchAt(e.clientX, e.clientY);
    if (d.from === 'cube') {
      if (at && at.x > -0.25) this.stage(d.it, at);
      return;
    }
    // from the bench: back into the cube, or to another spot
    if (!at || at.x < -0.25) { this.unstage(d.it); G.audio?.ui?.('cube_place', 0.4); return; }
    const s = this.staged.find((q) => q.it === d.it);
    if (s) { const sp = this.freeSpot(at); if (sp >= 0) { s.spot = sp; this.spotPos(sp, s.obj.outer.position); s.obj.outer.position.y = SPOT * 0.3; } }
  }

  /** two things put together by hand */
  private combine(a: Item, b: Item) {
    const p = G.local;
    for (const [t, o] of [[a, b], [b, a]] as [Item, Item][]) {
      for (const h of HAND_OPS) {
        if (!h.item?.(t, itemDef(t.key))) continue;
        if (!(h.parts || []).some((pr) => pr.any.some(([m]) => matches(o, m)))) continue;
        if (h.requires && !hasUnlock(h.requires)) { this.say('you don\'t know how yet: ' + (researchNode(h.requires)?.title || ''), true); return; }
        const parts = pickParts(p, h, t, this.staged.map((s) => s.it));
        if (parts.some((q) => q.missing)) { this.say('also need ' + parts.filter((q) => q.missing).map((q) => partLabel(q.req)).join(', '), true); return; }
        if (!pickTool(p, h, t)) { this.say('need ' + toolLabel(h), true); return; }
        this.handStep(t, h);
        return;
      }
    }
    const onBench = this.staged.map((s) => s.it);
    const known: Set<string> = (p as any).knownRecipes || new Set();
    const r = allRecipes().find((rr) => (!rr.learned || known.has(rr.key)) && rr.inputs.some((i) => !i.keep && matches(a, i.item)) && rr.inputs.some((i) => matches(b, i.item)) && checkRecipe(p, rr, onBench).ok);
    if (r) { if (this.notOnBench(r, onBench).length) this.pull(r); this.assemble(r); return; }
    G.audio?.ui?.('bag_bad', 0.4);
    this.say('those don\'t go together', true);
  }

  private say(t: string, bad = false) { this.note.textContent = t.toUpperCase(); this.note.className = 'fpk-note on' + (bad ? ' bad' : ''); this.noteT = 2; }

  // ---------------------------------------------------------------- frame
  update() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.open) return;
    this.tw.update(dt);
    if (this.suspended) return;
    if (this.dirty) {
      this.dirty = false;
      this.prune();
      const back = G.local.worn.get('back' as any);
      if ((back?.inv ?? null) !== this.cube.c) this.cube.setContainer(back?.inv ?? null); else this.cube.refresh();
      this.renderCards();
    }
    this.cube.update(dt);
    this.dust.update(dt, 1.6); this.sparks.update(dt, 2.4);
    const d = this.drag;
    if (d?.live) { pointerRay(this.rc, fpCamera(), this.px, this.py).at(1.3, _v); d.ghost.outer.position.lerp(_v, 1 - Math.exp(-30 * dt)); }
    const h = this.hold;
    if (h && h.down) {
      h.t += dt; h.tick -= dt;
      const at = this.benchAt(this.px, this.py) || _w.set(0.2, 0, 0);
      if (h.tick <= 0) {
        h.tick = 0.32;
        const anim = h.r.anim;
        G.audio?.ui?.(anim === 'saw' ? 'craft_saw' : anim === 'hammer' ? 'craft_clang' : anim === 'stitch' || anim === 'mix' ? 'craft_wrap' : 'craft_thud', 0.4);
        const wp = this.top.localToWorld(_v.copy(at));
        if (anim === 'hammer') this.sparks.emit(wp.x, wp.y + 0.02, wp.z, 8, 0xffc050, 0.6, 0.6); else this.dust.emit(wp.x, wp.y + 0.02, wp.z, 6, 0xd8c8a0, 0.4, 0.4);
      }
      (this.prog.querySelector('i') as HTMLElement).style.width = Math.min(100, (h.t / h.dur) * 100) + '%';
      if (h.t >= h.dur) this.finishAssemble();
    }
    // hands: left steadies the work, right works or reaches
    const [aR, aL] = this.arms;
    this.top.updateWorldMatrix(true, false);
    const lt = this.top.localToWorld(_v.set(-0.15, 0.03, 0.1));
    aL.target.lerp(lt, 1 - Math.exp(-12 * dt));
    let rt: THREE.Vector3;
    if (d?.live) rt = d.ghost.outer.getWorldPosition(_w).add(_v.set(0.02, -0.04, 0.03));
    else if (h?.down) { rt = this.top.localToWorld((this.benchAt(this.px, this.py) || _w.set(0.2, 0, 0)).clone().setY(0.05 + Math.abs(Math.sin(now * 0.02)) * 0.05)); }
    else rt = this.top.localToWorld(_w.set(0.35, 0.04, 0.12));
    aR.target.lerp(rt, 1 - Math.exp(-14 * dt));
    aL.grip = 0.3; aR.grip = d?.live || h?.down ? 0.9 : 0.4;
    poseArm(aL, 1.3); poseArm(aR, -1.3);
    if (this.noteT > 0) { this.noteT -= dt; if (this.noteT <= 0) this.note.classList.remove('on'); }
  }
}
void CELL; void gridSpec; void setPlace; void damp;
type _C = Container;

// The workbench in first person: a greasy workshop table under a gooseneck
// lamp, a vice bolted on one end, a pegboard behind it. Your iron cube sits
// open on the left of the boards; pull things out of it onto the table, then
// work them by hand: drag one onto another to put them together, or take a
// blueprint sheet off the pegboard. Hand steps (sawing, striking, binding)
// go to the close-up; ordinary recipes are assembled by holding your hands on
// the work while the hammer and saw do their thing, a slate keeping tally.
// Every recipe in the game can be made here. No DOM.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { TileObject } from '../world/zone';
import { type Item, itemDef, itemName } from '../items/item';
import { allRecipes, type Recipe } from '../items/recipes';
import { checkRecipe, CraftAction } from '../interact/crafting';
import { hasUnlock, researchNode } from '../game/research';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../fp/fp';
import { ModelBuilder } from '../gfx/modelBuilder';
import { CubeView } from './cubeView';
import { HAND_OPS, type HandOp, matches, pickTool, pickParts, partLabel, toolLabel } from './handOps';
import { Tweens, easeOut, easeBack, makeArm, poseArm, type Arm, makeBackdrop, makeItemObj, fitItemObj, type ItemObj, pointerRay, Particles, fpMat } from './fpKit';
import { pixTag, stamp, disposeTag, type PixTag } from './tags';
import { Dymo, Slate, HoverTag, clickTag } from './props';
import { recipeHint } from './knowledge';

interface Staged { it: Item; obj: ItemObj; spot: number }
interface Sheet { t: PixTag; run: () => void }
const SPOTS_X = 5, SPOTS_Z = 3, SPOT = 0.13;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Bench {
  open = false;
  private built = false;
  private g!: THREE.Group;
  private top = new THREE.Group();
  private peg = new THREE.Group();
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
  private suspended = false;
  private sheets: Sheet[] = [];
  private fixed: Sheet[] = [];
  private press: { id: number; x: number; y: number; sheet: Sheet | null } | null = null;
  private slate!: Slate;
  private dymo!: Dymo;
  private tag!: HoverTag;
  private lamp = new THREE.PointLight(0xffd8a0, 1.6, 2.2, 1.4);
  root: HTMLDivElement;

  constructor() {
    const r = document.createElement('div');
    r.className = 'fpk fpk-bench';
    document.body.appendChild(r);
    this.root = r;
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

  private build() {
    if (this.built) return;
    this.built = true;
    const g = (this.g = fpGroup('bench'));
    const bd = makeBackdrop(); (bd.material as THREE.MeshBasicMaterial).opacity = 0.95; g.add(bd);
    g.add(new THREE.AmbientLight(0xb8b0a0, 0.4));
    const fill = new THREE.DirectionalLight(0xffe0c0, 0.55); fill.position.set(-0.4, 1.2, 0.6); g.add(fill);
    // the table: thick scarred boards black with oil at the vice end, a steel lip, a vice, a lamp
    const mb = new ModelBuilder();
    mb.box(0, -0.05, 0, 1.5, 0.05, 0.62, 'wood_light', { color: 0x9a7448, uvScale: 2 });
    mb.box(0, -0.06, 0.315, 1.52, 0.06, 0.02, 'metal_grey', { color: 0x7a7e80 });
    for (let i = 0; i < 6; i++) mb.box(-0.6 + i * 0.24, -0.0005, 0, 0.004, 0.001, 0.6, 'wood_dark', { color: 0x5a3a1a });
    for (const [x, z, w, d, c] of [[0.42, -0.1, 0.3, 0.22, 0x2a2016], [0.1, 0.12, 0.12, 0.08, 0x3a2a1a], [-0.25, -0.18, 0.18, 0.1, 0x30241a], [0.55, 0.18, 0.1, 0.07, 0x1e1810]] as [number, number, number, number, number][]) mb.box(x, -0.0002, z, w, 0.0006, d, 'wood_dark', { color: c });
    mb.box(0.62, 0, -0.18, 0.16, 0.06, 0.12, 'metal_painted_green', { color: 0x3a5a4a });
    mb.box(0.62, 0.06, -0.12, 0.14, 0.05, 0.02, 'metal_grey'); mb.box(0.62, 0.06, -0.24, 0.14, 0.05, 0.02, 'metal_grey');
    mb.box(0.62, 0.03, -0.04, 0.012, 0.012, 0.2, 'metal_brushed');
    // scattered nuts and bolts
    for (let i = 0; i < 7; i++) mb.cylinder(0.3 + Math.sin(i * 7.1) * 0.2, 0, 0.2 + Math.cos(i * 3.3) * 0.08, 0.006, 0.006, 6, 'metal_grey', { color: 0x8a8a84 });
    // gooseneck lamp: weighted base, a jointed arm, an enamel shade
    mb.cylinder(0.66, 0, 0.12, 0.05, 0.02, 10, 'metal_dark', { color: 0x3a3a34 });
    mb.push().translate(0.66, 0.02, 0.12).rotateZ(0.25); mb.cylinder(0, 0, 0, 0.006, 0.32, 6, 'metal_brushed', { color: 0x9a9a92 }); mb.pop();
    mb.push().translate(0.58, 0.33, 0.12).rotateZ(1.2); mb.cylinder(0, 0, 0, 0.006, 0.22, 6, 'metal_brushed', { color: 0x9a9a92 }); mb.pop();
    mb.push().translate(0.38, 0.4, 0.12).rotateZ(2.6); mb.cylinder(0, 0, 0, 0.06, 0.09, 10, 'metal_painted_green', { color: 0x2a5a4a, rTop: 0.02 }); mb.pop();
    this.top.add(new THREE.Mesh(mb.build(), fpMat()));
    this.lamp.position.set(0.32, 0.3, 0.12);
    this.top.add(this.lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    bulb.position.set(0.345, 0.335, 0.12);
    this.top.add(bulb);
    this.top.add(this.stageG);
    this.top.add(this.cube.root);
    this.cube.root.scale.setScalar(0.58);
    this.cube.root.position.set(-0.52, 0, -0.04);
    g.add(this.top);
    // the pegboard behind: blueprints pinned up, two tags on hooks
    const pb = new ModelBuilder();
    pb.box(0, -0.26, 0, 1.3, 0.5, 0.012, 'cardboard', { color: 0x8a7050 });
    for (let y = 0; y < 9; y++) for (let x = 0; x < 22; x++) pb.box(-0.62 + x * 0.059, -0.24 + y * 0.055, 0.0065, 0.008, 0.008, 0.001, 'rubber_black', { color: 0x2a2018 });
    this.peg.add(new THREE.Mesh(pb.build(), fpMat()));
    g.add(this.peg);
    const sweep = clickTag('Sweep back into the cube', 'tag', 110, 0.22), away = clickTag('Step away', 'tag', 70, 0.17, '(Esc)');
    sweep.mesh.position.set(-0.56, -0.12, 0.01); sweep.mesh.rotation.z = 0.06;
    away.mesh.position.set(0.56, -0.12, 0.01); away.mesh.rotation.z = -0.05;
    this.peg.add(sweep.mesh, away.mesh);
    this.fixed = [{ t: sweep, run: () => this.clear() }, { t: away, run: () => this.close() }];
    g.add(this.dust.points, this.sparks.points);
    this.slate = new Slate(g);
    this.dymo = new Dymo(g);
    this.tag = new HoverTag(g);
    for (const s of [1, -1] as const) { const a = makeArm(s); g.add(a.root); this.arms.push(a); }
  }

  private layout() {
    const asp = window.innerWidth / Math.max(1, window.innerHeight);
    const k = Math.min(1, asp / 1.5);
    this.top.position.set(asp < 1.2 ? 0 : -0.04, -0.24, -2.0);
    this.top.rotation.set(0.74, 0, 0);
    this.top.scale.setScalar(Math.max(0.55, k));
    this.peg.position.set(0, 0.29, -2.6);
    this.peg.scale.setScalar(Math.max(0.5, k) * 1.3);
    this.slate.tag.mesh.position.set(0, -0.02, -1.15);
    this.dymo.place(0.2, -1.05);
  }

  /** stand at a workbench */
  show(o: TileObject | null) {
    const p = G.local;
    if (!p) return;
    this.build();
    if (!fpClaim('bench', 3)) return;
    if (G.ui?.inventory?.open) G.ui.inventory.toggle(false);
    this.open = true; this.suspended = false;
    G.hudBody?.setHidden?.('bench', true);
    this.obj = o;
    this.root.classList.add('on');
    G.input.pointerOverUI = true;
    const back = p.worn.get('back' as any);
    this.cube.setContainer(back?.inv ?? null);
    this.cube.setLid(1); this.cube.setBolts(1); this.cube.setInside(1);
    this.cube.root.rotation.set(0, 0.22, 0);
    this.layout();
    this.dirty = true;
    G.audio?.ui?.('cube_clunk', 0.5);
    const y0 = this.top.position.y;
    this.top.position.y = y0 - 0.5;
    this.tw.add(0.35, (k) => { this.top.position.y = y0 - 0.5 + 0.5 * k; }, easeBack);
  }

  private resume() {
    if (!this.open || fpOwner()) return;
    if (!fpClaim('bench', 3)) return;
    this.suspended = false;
    this.root.classList.add('on');
    G.input.pointerOverUI = true;
    this.dirty = true;
  }

  close() {
    if (!this.open) return;
    this.open = false; this.hold = null;
    G.hudBody?.setHidden?.('bench', false);
    this.cancelDrag();
    this.root.classList.remove('on');
    this.slate.hide(); this.tag.hide();
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
    if (spot < 0) { this.dymo.show('the bench is full', true); return false; }
    const obj = makeItemObj(it.key);
    fitItemObj(obj, 0, SPOT * 0.9, SPOT * 0.9, SPOT * 0.6, 1.4);
    this.spotPos(spot, obj.outer.position);
    const ty = SPOT * 0.3;
    obj.outer.userData.uid = it.uid;
    this.stageG.add(obj.outer);
    this.staged.push({ it, obj, spot });
    this.cube.hidden.add(it); this.cube.refresh();
    this.tw.add(0.2, (k) => { obj.outer.position.y = 0.12 * (1 - k) + ty; }, easeOut, () => { G.audio?.ui?.('cube_place', 0.35); });
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

  // ---------------------------------------------------------------- blueprint sheets: what can be made from what is on the bench
  private renderSheets() {
    const p = G.local;
    const onBench = this.staged.map((s) => s.it);
    const known: Set<string> = (p as any).knownRecipes || new Set();
    const rows: { title: string; lines: string; mark: string; ok: boolean; score: number; run: () => void }[] = [];
    const nm = (m: string) => (m.startsWith('#') ? m.slice(1) : itemDef(m).name);
    for (const h of HAND_OPS) {
      if (!h.item) continue;
      const tgt = onBench.find((it) => h.item!(it, itemDef(it.key)));
      if (!tgt) continue;
      const tool = pickTool(p, h, tgt);
      const parts = pickParts(p, h, tgt, onBench);
      const lock = h.requires && !hasUnlock(h.requires) ? researchNode(h.requires)?.title || h.requires : '';
      const miss = parts.filter((q) => q.missing).map((q) => partLabel(q.req));
      const ok = !lock && !!tool && !miss.length;
      rows.push({ ok, score: ok ? 3 : 1, run: () => { if (ok) this.handStep(tgt, h); else this.dymo.show(lock ? 'research: ' + lock : 'need ' + (tool ? miss.join(', ') : toolLabel(h)), true); },
        title: h.name, lines: itemName(tgt) + ' + ' + (tool?.it ? itemName(tool.it) : tool ? 'hands' : toolLabel(h)) + (miss.length ? '. need ' + miss.join(', ') : ''), mark: lock ? 'RESEARCH' : ok ? 'BY HAND' : 'MISSING' });
    }
    for (const r of allRecipes()) {
      const uses = r.inputs.filter((i) => !i.keep).some((inp) => onBench.some((it) => matches(it, inp.item)));
      const benchOnly = (r.needs || []).includes('workbench');
      if (!uses && !(benchOnly && onBench.length === 0)) continue;
      if (r.learned && !known.has(r.key)) {
        if (uses) rows.push({ ok: false, score: 0, run: () => this.dymo.show('schematic unknown', true), title: r.name, lines: recipeHint(r) || 'schematic unknown', mark: 'UNKNOWN' });
        continue;
      }
      const chk = checkRecipe(p, r, onBench);
      const need = this.notOnBench(r, onBench);
      const ok = chk.ok && !need.length;
      rows.push({
        ok, score: ok ? 2.5 : chk.ok ? 2 : uses ? 1 : 0.5,
        run: () => { if (ok) this.assemble(r); else if (chk.ok && need.length) this.pull(r); else this.dymo.show('need ' + chk.missing.slice(0, 2).join(', '), true); },
        title: r.name,
        lines: r.inputs.map((i) => (i.count && i.count > 1 ? i.count + 'x ' : '') + nm(i.item) + (i.keep ? ' (tool)' : '')).join(', ') + (!chk.ok ? '. need ' + chk.missing.slice(0, 2).join(', ') : ''),
        mark: ok ? 'READY' : chk.ok ? 'PULL PARTS' : 'MISSING',
      });
    }
    rows.sort((a, b) => b.score - a.score);
    for (const s of this.sheets) disposeTag(s.t);
    this.sheets = [];
    const list = rows.length ? rows.slice(0, 6) : [{ title: 'Empty bench', lines: 'drag things out of the cube onto the boards', mark: '', ok: false, score: 0, run: () => {} }];
    list.forEach((row, i) => {
      const t = pixTag('blueprint', 84, 56, 0.3);
      t.clear();
      t.type(row.title, 5, 7, undefined, 8.5, 'sign');
      t.para(row.lines, 5, 18, 76, '#c8d8f0', 7.5, 3, 6.5);
      if (row.mark) stamp(t, row.mark, 7, 45, row.ok ? '#8ae88a' : row.mark === 'PULL PARTS' || row.mark === 'BY HAND' ? '#ffd860' : '#ff7a6a');
      t.flush();
      const col = i % 3, ln = Math.floor(i / 3);
      t.mesh.position.set(-0.32 + col * 0.32, 0.09 - ln * 0.215, 0.012);
      t.mesh.rotation.z = (i % 2 ? 0.03 : -0.025);
      this.peg.add(t.mesh);
      this.sheets.push({ t, run: row.run });
    });
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
      if (got.length < n) out.push((n - got.length > 1 ? (n - got.length) + 'x ' : '') + (inp.item.startsWith('#') ? inp.item.slice(1) : itemDef(inp.item).name.toLowerCase()));
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
    this.drawSlate();
  }
  private drawSlate() {
    const h = this.hold;
    if (!h) { this.slate.hide(); return; }
    const need = Math.max(3, Math.round(h.dur / 0.32));
    this.slate.draw(h.r.name.toUpperCase(), (h.t / h.dur) * need, need, 'hold on the bench to work it');
  }

  private finishAssemble() {
    const h = this.hold!;
    this.hold = null;
    this.slate.hide();
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
    this.top.localToWorld(_v.set(0.15, 0.05, 0));
    this.sparks.emit(_v.x, _v.y, _v.z, 20, 0xfff0b0, 0.6, 0.6);
    this.dymo.show('+ ' + (fresh.length ? itemName(fresh[0]) : h.r.name));
    this.dirty = true;
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (!this.open || this.suspended || G.input.textFocus) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.code === 'Escape') { if (this.hold) { this.hold = null; this.slate.hide(); } else this.close(); }
  }

  private stagedAt(x: number, y: number): Staged | null {
    pointerRay(this.rc, fpCamera(), x, y);
    const hits = this.rc.intersectObjects(this.staged.map((s) => s.obj.outer), true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && o.userData.uid === undefined) o = o.parent; const s = o ? this.staged.find((q) => q.it.uid === o!.userData.uid) : null; if (s) return s; }
    return null;
  }
  private sheetAt(x: number, y: number): Sheet | null {
    pointerRay(this.rc, fpCamera(), x, y);
    const all = [...this.sheets, ...this.fixed];
    const hits = this.rc.intersectObjects(all.map((s) => s.t.mesh), false);
    return hits[0] ? all.find((s) => s.t.mesh === hits[0].object) || null : null;
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
    this.px = e.clientX; this.py = e.clientY;
    if (this.hold) { this.hold.down = true; return; }
    const sh = this.sheetAt(e.clientX, e.clientY);
    if (sh) { this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, sheet: sh }; return; }
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
    if (d && d.id === e.pointerId && !d.live && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) {
      d.live = true; d.ghost.outer.visible = true;
      if (d.from === 'bench') { const s = this.staged.find((q) => q.it === d.it); if (s) s.obj.outer.visible = false; }
      G.audio?.itemSound?.(d.it.key, 'pick', G.local);
      this.tag.hide();
    }
    if (!d && !this.hold && e.pointerType === 'mouse') {
      const s = this.stagedAt(e.clientX, e.clientY);
      let it = s?.it || null;
      if (!it) { pointerRay(this.rc, fpCamera(), e.clientX, e.clientY); it = this.cube.pickAt(this.rc)?.a.items[0] || null; }
      if (it) {
        const pos = s ? s.obj.outer.getWorldPosition(_v) : this.cube.itemWorldPos(it, _v);
        if (pos) this.tag.item(it, 1, pos);
      } else this.tag.hide();
    }
  }

  private onUp(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    if (this.hold) { this.hold.down = false; return; }
    const pr = this.press;
    if (pr && pr.id === e.pointerId) {
      this.press = null;
      if (pr.sheet && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 12 && this.sheetAt(e.clientX, e.clientY) === pr.sheet) { G.audio?.ui?.('bag_rot', 0.35); pr.sheet.run(); }
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.cancelDrag();
    const s0 = this.staged.find((q) => q.it === d.it);
    if (s0) s0.obj.outer.visible = true;
    if (!d.live) {
      const now = performance.now();
      if (this.lastTap.uid === d.it.uid && now - this.lastTap.t < 360) { this.lastTap.uid = 0; const p = G.local; (G as any).craft?.inspect?.(d.it, p.containerOf(d.it) || p.inv, { bench: true }); }
      else this.lastTap = { uid: d.it.uid, t: now };
      return;
    }
    const other = this.stagedAt(e.clientX, e.clientY);
    if (other && other.it !== d.it) { this.combine(d.it, other.it); return; }
    const at = this.benchAt(e.clientX, e.clientY);
    if (d.from === 'cube') { if (at && at.x > -0.25) this.stage(d.it, at); return; }
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
        if (h.requires && !hasUnlock(h.requires)) { this.dymo.show('research: ' + (researchNode(h.requires)?.title || ''), true); return; }
        const parts = pickParts(p, h, t, this.staged.map((s) => s.it));
        if (parts.some((q) => q.missing)) { this.dymo.show('need ' + parts.filter((q) => q.missing).map((q) => partLabel(q.req)).join(', '), true); return; }
        if (!pickTool(p, h, t)) { this.dymo.show('need ' + toolLabel(h), true); return; }
        this.handStep(t, h);
        return;
      }
    }
    const onBench = this.staged.map((s) => s.it);
    const known: Set<string> = (p as any).knownRecipes || new Set();
    const r = allRecipes().find((rr) => (!rr.learned || known.has(rr.key)) && rr.inputs.some((i) => !i.keep && matches(a, i.item)) && rr.inputs.some((i) => matches(b, i.item)) && checkRecipe(p, rr, onBench).ok);
    if (r) { if (this.notOnBench(r, onBench).length) this.pull(r); this.assemble(r); return; }
    G.audio?.ui?.('bag_bad', 0.4);
    this.dymo.show('those don\'t go together', true);
  }

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
      this.renderSheets();
    }
    this.cube.update(dt);
    this.dust.update(dt, 1.6); this.sparks.update(dt, 2.4);
    this.dymo.update(dt);
    this.lamp.intensity = 1.6 + (Math.random() < 0.02 ? -0.6 : 0);
    const d = this.drag;
    if (d?.live) { pointerRay(this.rc, fpCamera(), this.px, this.py).at(1.3, _v); d.ghost.outer.position.lerp(_v, 1 - Math.exp(-30 * dt)); }
    const h = this.hold;
    if (h && h.down) {
      const before = Math.floor(h.t / 0.32);
      h.t += dt; h.tick -= dt;
      const at = this.benchAt(this.px, this.py) || _w.set(0.2, 0, 0);
      if (h.tick <= 0) {
        h.tick = 0.32;
        const anim = h.r.anim;
        G.audio?.ui?.(anim === 'saw' ? 'craft_saw' : anim === 'hammer' ? 'craft_clang' : anim === 'stitch' || anim === 'mix' ? 'craft_wrap' : 'craft_thud', 0.4);
        const wp = this.top.localToWorld(_v.copy(at));
        if (anim === 'hammer') this.sparks.emit(wp.x, wp.y + 0.02, wp.z, 8, 0xffc050, 0.6, 0.6); else this.dust.emit(wp.x, wp.y + 0.02, wp.z, 6, 0xd8c8a0, 0.4, 0.4);
      }
      if (Math.floor(h.t / 0.32) > before) this.drawSlate();
      if (h.t >= h.dur) this.finishAssemble();
    }
    const [aR, aL] = this.arms;
    this.top.updateWorldMatrix(true, false);
    const lt = this.top.localToWorld(_v.set(-0.15, 0.03, 0.1));
    aL.target.lerp(lt, 1 - Math.exp(-12 * dt));
    let rt: THREE.Vector3;
    if (d?.live) rt = d.ghost.outer.getWorldPosition(_w).add(_v.set(0.02, -0.04, 0.03));
    else if (h?.down) rt = this.top.localToWorld((this.benchAt(this.px, this.py) || _w.set(0.2, 0, 0)).clone().setY(0.05 + Math.abs(Math.sin(now * 0.02)) * 0.05));
    else rt = this.top.localToWorld(_w.set(0.35, 0.04, 0.12));
    aR.target.lerp(rt, 1 - Math.exp(-14 * dt));
    aL.grip = 0.3; aR.grip = d?.live || h?.down ? 0.9 : 0.4;
    poseArm(aL, 1.3); poseArm(aR, -1.3);
  }
}

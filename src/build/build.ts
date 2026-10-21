// BUILD MODE (B). A placement mode over the tile grid: pick a piece on the
// parts rail, a ghost shows where it goes (green / red, snapped to tiles or to
// the nearest wall edge, R rotates), click to tack a frame together out of the
// salvage it costs, then hold the welder on the frame until it is done.
// X demolishes (frames refund in full, finished pieces about half). Pieces
// are unlocked by blueprints on the watch's research tree (branch 'blueprint').
// Also runs the rest of the settlement: farms, turrets, spikes, stoves, workers.
import { consume } from './keys';
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { uid } from '../core/rng';
import { objDef, objectGeometry } from '../world/objects';
import { objectMatrix } from '../world/chunkMesher';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';
import { wallDef, wallId } from '../world/defs';
import { TF, type Zone, type TileObject } from '../world/zone';
import { itemDef } from '../items/item';
import { createItem } from '../items/factory';
import { hasUnlock } from '../game/research';
import { pick, type PickTarget } from '../game/picking';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import { shake, punch } from '../gfx/juice';
import { PIECES, piece, pieceForObj, type Piece, type PieceCat } from './pieces';
import { Clipboard, type BoardHit, type BoardState } from './clipboard';
import { WeldAction, welderFor, setVisor, sparks } from './weld';
import { builtWalls, edgeKey } from './ops';
import { Farm, isPlanter } from './farm';
import { Settlement } from './settlement';
import { bump, mark } from './progress';
import type { GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';
import './build.css';

const REACH = 7;
const FRAME_FOR = (pc: Piece, rot: number) => {
  if (pc.kind !== 'obj') return 'bld_frame_wall';
  const w = pc.w ?? 1, d = pc.d ?? 1;
  if (w === 1 && d === 1) return 'bld_frame';
  const rw = rot % 2 === 0 ? w : d, rd = rot % 2 === 0 ? d : w;
  return rw > rd ? 'bld_frame_2x1' : 'bld_frame_1x2';
};
interface Spot { x: number; y: number; side: 0 | 1; rot: 0 | 1 | 2 | 3; ok: boolean; why: string }
type Hover = { kind: 'frame'; o: TileObject } | { kind: 'piece'; o: TileObject } | { kind: 'wall'; x: number; y: number; side: 0 | 1; key: string } | null;

export class BuildSystem implements GameSystem {
  name = 'build';
  active = false;
  /** demolish tool selected (touch: tap a piece to take it down) */
  demolish = false;
  sel = 0;
  rot: 0 | 1 | 2 | 3 = 0;
  cat: PieceCat = 'struct';
  farm = new Farm();
  settle = new Settlement();
  spot: Spot | null = null;
  hover: Hover = null;
  private ghost: THREE.Mesh;
  private ring: THREE.Mesh;
  private claimRing: THREE.Mesh;
  private ghostKey = '';
  private matOk: THREE.MeshLambertMaterial;
  private matBad: THREE.MeshLambertMaterial;
  /** the blueprint clipboard held in first person */
  board = new Clipboard();
  private boardOver = false;
  private mouseT = 0;
  private defT = 0;
  private stoveT = 0;
  private turretSeen = new Map<number, number>();
  private wallGeo = new Map<string, THREE.BufferGeometry>();

  constructor() {
    const mk = (tag: string, color: number) => {
      const m = (worldMaterial({ transparent: true, opacity: 0.55, outline: 0, noGrid: true, bldTag: tag } as any) as THREE.MeshLambertMaterial);
      m.color.setHex(color); m.depthWrite = false;
      return m;
    };
    this.matOk = mk('ok', 0x86b8ff); // blueprint blue
    this.matBad = mk('bad', 0xe0503a); // red pencil
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.matOk);
    this.ghost.matrixAutoUpdate = false; this.ghost.visible = false; this.ghost.renderOrder = 5;
    G.pr.scene.add(this.ghost);
    // footprint ring and the claim radius ring
    const rb = new ModelBuilder();
    for (const [x, z, w, d] of [[0.5, 0.02, 1, 0.04], [0.5, 0.98, 1, 0.04], [0.02, 0.5, 0.04, 1], [0.98, 0.5, 0.04, 1]]) rb.box(x, 0.012, z, w, 0.01, d, 'white', { emissive: 1, ao: false });
    this.ring = new THREE.Mesh(rb.build(), worldMaterial({ unlit: true, outline: 0, noGrid: true, transparent: true, opacity: 0.85, bldTag: 'ring' } as any));
    this.ring.visible = false; G.pr.scene.add(this.ring);
    const cb = new ModelBuilder();
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; cb.push().translate(Math.cos(a), 0.015, Math.sin(a)).rotateY(-a); cb.box(0, 0, 0, 0.012, 0.01, 0.07, 'white', { emissive: 1, ao: false }); cb.pop(); }
    this.claimRing = new THREE.Mesh(cb.build(), worldMaterial({ unlit: true, outline: 0, noGrid: true, transparent: true, opacity: 0.6, bldTag: 'claim' } as any));
    (this.claimRing.material as THREE.MeshLambertMaterial).color.setHex(0xf0e8d0); // chalk
    this.claimRing.visible = false; G.pr.scene.add(this.claimRing);
    bus.on('travelEnd', () => this.toggle(false));
    bus.on('death', (p: Player) => { if (p === G.local) this.toggle(false); });
    bus.on('bldWelded', (z: Zone, pc: Piece, o: TileObject, by: string | null) => this.onWelded(z, pc, o, by));
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => this.menuFor(p, o, out));
  }

  // ================================================================= mode
  toggle(on = !this.active) {
    if (on === this.active) return;
    const p = G.local;
    if (on) {
      if (!p || p.body.dead || p.inVehicle || G.transitioning) return;
      const intro = G.systems.find((s) => s.name === 'intro') as any;
      if (intro && intro.phase !== 'done') return;
    }
    this.active = on;
    this.demolish = false;
    if (!on) { this.ghost.visible = false; this.ring.visible = false; this.claimRing.visible = false; setVisor(0); }
    this.board.show(on);
    if (!on && this.boardOver) { G.input.pointerOverUI = false; this.boardOver = false; }
    G.audio?.ui?.(on ? 'paper' : 'menu', 0.5);
    bus.emit('buildMode', on);
  }
  /** true while build mode owns the mouse (combat / grab should leave clicks alone) */
  captures() { return this.active; }
  current(): Piece { return PIECES[this.sel] ?? PIECES[0]; }
  unlocked(pc: Piece) { return !pc.node || hasUnlock(pc.node); }
  select(key: string) { const i = PIECES.findIndex((p) => p.key === key); if (i >= 0) { this.sel = i; this.cat = PIECES[i].cat; this.ghostKey = ''; this.demolish = false; } }
  private cycle(dir: number) {
    const list = PIECES.filter((p) => p.cat === this.cat);
    const i = list.indexOf(this.current());
    const n = list[(i + dir + list.length) % list.length];
    if (n) this.select(n.key);
    G.audio?.ui?.('tab', 0.4);
  }

  // ================================================================= materials
  countOf(p: Player, key: string): number {
    let n = 0;
    for (const it of p.allItems()) {
      if (it.key !== key) continue;
      const d = itemDef(it.key);
      n += d.uses && d.cat === 'material' ? Math.floor((it.uses ?? 1) * d.uses + 1e-6) : 1;
    }
    return n;
  }
  canAfford(p: Player, pc: Piece) { return pc.cost.every(([k, n]) => this.countOf(p, k) >= n); }
  private takeMats(p: Player, mats: [string, number][]) {
    for (const [key, n] of mats) {
      let left = n;
      for (const it of [...p.allItems()]) {
        if (left <= 0) break;
        if (it.key !== key) continue;
        const d = itemDef(key);
        if (d.uses && d.cat === 'material') {
          const have = Math.floor((it.uses ?? 1) * d.uses + 1e-6), use = Math.min(have, left);
          it.uses = (it.uses ?? 1) - use / d.uses; left -= use;
          if (it.uses <= 0.001) p.removeItem(it);
        } else { p.removeItem(it); left--; }
      }
    }
    bus.emit('inventoryChanged', p);
  }
  private refund(p: Player, mats: [string, number][], frac: number) {
    const got: string[] = [];
    for (const [k, n] of mats) {
      const m = frac >= 1 ? n : Math.max(k === mats[0][0] ? 1 : 0, Math.floor(n * frac));
      const d = itemDef(k);
      if (d.uses && d.cat === 'material') { if (m > 0) { const it = createItem(k); it.uses = Math.min(1, m / d.uses); p.inv.add(it); got.push(`${m} ${d.name}`); } continue; }
      for (let i = 0; i < m; i++) p.inv.add(createItem(k));
      if (m) got.push(`${m} ${d.name}`);
    }
    if (got.length) G.audio?.ui?.('rummage', 0.5);
    bus.emit('inventoryChanged', p);
  }

  // ================================================================= placement
  private spotAt(p: Player, pc: Piece): Spot | null {
    const z = G.zones.get(p.zoneKey); if (!z) return null;
    const wp = G.pr.screenToWorld(G.input.mouseX, G.input.mouseY, z.heightAt(Math.floor(p.x), Math.floor(p.z)));
    if (!wp) return null;
    const tx = Math.floor(wp.x), ty = Math.floor(wp.z);
    if (pc.kind !== 'obj') {
      const fx = wp.x - tx, fy = wp.z - ty;
      const dN = fy, dS = 1 - fy, dW = fx, dE = 1 - fx;
      const m = Math.min(dN, dS, dW, dE);
      let x = tx, y = ty, side: 0 | 1 = 0;
      if (m === dN) { side = 0; } else if (m === dS) { y = ty + 1; side = 0; } else if (m === dW) { side = 1; } else { x = tx + 1; side = 1; }
      const why = this.edgeProblem(z, p, x, y, side);
      return { x, y, side, rot: 0, ok: !why, why };
    }
    const w = pc.w ?? 1, d = pc.d ?? 1;
    const rw = this.rot % 2 === 0 ? w : d, rd = this.rot % 2 === 0 ? d : w;
    const x = Math.floor(wp.x - rw / 2 + 0.5), y = Math.floor(wp.z - rd / 2 + 0.5);
    const why = this.tileProblem(z, p, x, y, rw, rd);
    return { x, y, side: 0, rot: this.rot, ok: !why, why };
  }
  private tileProblem(z: Zone, p: Player, x: number, y: number, rw: number, rd: number): string {
    if (Math.hypot(x + rw / 2 - p.x, y + rd / 2 - p.z) > REACH) return 'too far';
    for (let j = 0; j < rd; j++) for (let i = 0; i < rw; i++) {
      const X = x + i, Y = y + j;
      if (!z.inb(X, Y) || !z.floor[z.idx(X, Y)]) return 'no floor';
      if (z.flags[z.idx(X, Y)] & TF.NOBUILD) return 'not here';
      if (z.objectsAt(X, Y).some((o) => !objDef(o.key)?.ceiling)) return 'occupied';
      if (i > 0 && z.wallW[z.idx(X, Y)]) return 'wall in the way';
      if (j > 0 && z.wallN[z.idx(X, Y)]) return 'wall in the way';
      if (Math.floor(p.x) === X && Math.floor(p.z) === Y) return 'you are standing there';
    }
    return '';
  }
  private edgeProblem(z: Zone, p: Player, x: number, y: number, side: 0 | 1): string {
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.z) > REACH) return 'too far';
    if (!z.inb(x, y)) return 'no floor';
    const a = !!z.floor[z.idx(x, y)];
    const bx = side === 1 ? x - 1 : x, by = side === 0 ? y - 1 : y;
    const b = z.inb(bx, by) && !!z.floor[z.idx(bx, by)];
    if (!a && !b) return 'no floor';
    if (z.flags[z.idx(x, y)] & TF.NOBUILD) return 'not here';
    if ((side === 0 ? z.wallN : z.wallW)[z.idx(x, y)]) return 'wall already there';
    if (z.edge(x, y, side)) return 'doorway';
    if (z.objectsAt(x, y).some((o) => o.key === 'bld_frame_wall' && (o.state.side ?? 0) === side)) return 'frame already there';
    return '';
  }

  /** tack a frame together where the ghost is: materials go in now */
  place(p: Player, pc: Piece, s: Spot): boolean {
    if (!this.unlocked(pc)) { bus.emit('think', p, `I don't know how to build that yet. (Blueprint: research it on the watch.)`); return false; }
    if (!s.ok) { G.audio?.ui?.('dryfire'); bus.emit('think', p, s.why ? `Can't build: ${s.why}.` : 'Not there.'); return false; }
    if (!this.canAfford(p, pc)) {
      const miss = pc.cost.filter(([k, n]) => this.countOf(p, k) < n).map(([k, n]) => `${n - this.countOf(p, k)} ${itemDef(k).name}`);
      bus.emit('think', p, 'I need ' + miss.join(', ') + '. Smash something.');
      G.audio?.ui?.('dryfire');
      return false;
    }
    this.takeMats(p, pc.cost);
    const key = FRAME_FOR(pc, s.rot);
    op('objAdd', { z: p.zoneKey, obj: { uid: uid(), key, x: s.x, y: s.y, rot: key === 'bld_frame' ? s.rot : 0, state: { piece: pc.key, w: 0, side: s.side, by: p.id, prot: pc.kind === 'obj' ? s.rot : 0 } } });
    G.audio?.at?.('metal_clank', s.x + 0.5, s.y + 0.5, 0.8);
    sparks(s.x + 0.5, 0.2, s.y + 0.5, 6, 2);
    shake(0.06);
    bump('bld_frames');
    return true;
  }

  /** start welding a frame (hold = keep going only while this returns true) */
  weld(p: Player, o: TileObject, hold: () => boolean = () => G.input.mouseDown[0]): boolean {
    const pc = piece(o.state.piece as string); if (!pc) return false;
    const tool = welderFor(p, pc);
    if (!tool) {
      bus.emit('think', p, pc.join === 'nail' ? 'I need a hammer for this.' : 'I need a welding torch. Or something on this watch that burns.');
      G.audio?.ui?.('dryfire');
      return false;
    }
    queueAt(p, o.x + 0.5, o.y + 0.5, new WeldAction(p, o, tool, hold), 1.6);
    return true;
  }

  /** WeldAction finished on the local survivor's side: one op swaps the frame for the piece */
  finishFrame(p: Player, o: TileObject) {
    const nu = uid(), cu = uid();
    op('bldFinish', { z: p.zoneKey, uid: o.uid, nu, cu, by: p.id });
  }

  private onWelded(z: Zone, pc: Piece, o: TileObject, by: string | null) {
    if (by !== G.local?.id) return;
    bump('bld_weld');
    if (pc.kind === 'obj' && pc.obj) mark('piece:' + pc.key);
    if (pc.cat === 'machine') mark('machine');
    if (pc.key === 'beacon') bus.emit('think', G.local, 'Twelve metres of the Backrooms. Mine.');
    void z; void o;
  }

  /** take a piece down: frames refund everything, finished pieces about half */
  demolishAt(p: Player, h: Hover): boolean {
    if (!h) return false;
    const z = G.getZone(p.zoneKey);
    if (h.kind === 'wall') {
      const pc = piece(h.key);
      queueAt(p, h.x + 0.5, h.y + 0.5, new UseObjectAction(p, 'Cut down', 2.5, 'hammer', () => {
        op('bldWallDown', { z: z.key, x: h.x, y: h.y, side: h.side });
        if (pc) this.refund(p, pc.cost, 0.5);
        sparks(h.x + 0.5, 1.2, h.y + 0.5, 14, 3); shake(0.15);
        G.audio?.at?.('metal_clank', h.x + 0.5, h.y + 0.5, 1);
      }), 1.8);
      return true;
    }
    const o = h.o;
    const frame = h.kind === 'frame';
    const pc = frame ? piece(o.state.piece as string) : pieceForObj(o.key);
    if (!pc) return false;
    if (o.inv?.items.length) { bus.emit('think', p, 'Empty it first.'); return true; }
    queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, frame ? 'Knock apart' : 'Cut apart', frame ? 1.2 : 3, 'hammer', () => {
      if (z.objects.get(o.uid) !== o) return;
      op('objRemove', { z: z.key, uid: o.uid });
      this.refund(p, pc.cost, frame ? 1 : 0.5);
      sparks(o.x + 0.5, 0.6, o.y + 0.5, 12, 3); shake(0.12);
      G.audio?.at?.('metal_clank', o.x + 0.5, o.y + 0.5, 1);
    }), 1.8);
    return true;
  }

  // ================================================================= input hooks
  /** world click from the UI / touch layer; true = consumed */
  click(t: PickTarget, b: number): boolean {
    if (!this.active) return false;
    if (performance.now() - this.mouseT < 450) return true; // desktop: handled from raw mouse in update()
    const p = G.local; if (!p) return true;
    if (b === 2) return false;
    // a tap on the clipboard (touch: the finger is the cursor)
    const bh = this.board.hit(G.input.mouseX, G.input.mouseY);
    if (bh) { this.boardClick(bh); return true; }
    // touch tap
    if (this.demolish) { this.demolishAt(p, this.hoverOf(t)); return true; }
    if (t.kind === 'object' && objDef(t.obj.key)?.tags?.includes('bld_frame')) { this.weld(p, t.obj, () => true); return true; }
    const s = this.spotAt(p, this.current());
    if (s) this.place(p, this.current(), s);
    return true;
  }

  /** E on an object (popup-free default use); true = handled */
  useObject(p: Player, o: TileObject): boolean {
    const d = objDef(o.key); if (!d) return false;
    if (d.tags?.includes('bld_frame')) { this.weld(p, o, () => true); return true; }
    if (isPlanter(o)) return this.farm.use(p, o);
    if (o.key === 'bld_compactor') { this.compact(p, o); return true; }
    if (o.key === 'bld_beacon') {
      const s = this.settle.cache.get(o.uid);
      bus.emit('think', p, s ? `${s.rank}. Defence ${s.def}, comfort ${s.comfort}, food ${s.food}, power ${s.power}.` : 'The beacon blinks. Everything near it is mine.');
      return true;
    }
    return false;
  }

  /** context-menu options for build pieces (bus 'objectMenu') */
  private menuFor(p: Player, o: TileObject, out: MenuOption[]) {
    const d = objDef(o.key);
    if (d?.tags?.includes('bld_frame')) {
      const pc = piece(o.state.piece as string);
      out.unshift({ label: `${pc?.join === 'nail' ? 'Nail' : 'Weld'} ${pc?.name ?? 'frame'} (${Math.round((o.state.w ?? 0) * 100)}%)`, action: () => this.weld(p, o, () => true) });
      out.push({ label: 'Knock the frame apart', danger: true, action: () => this.demolishAt(p, { kind: 'frame', o }) });
      return;
    }
    if (isPlanter(o)) {
      for (let i = out.length - 1; i >= 0; i--) if (/^(Crop|Water|Harvest|Pull up|Fertilize)/.test(out[i].label)) out.splice(i, 1);
      out.unshift({ label: this.farm.verb(p, o), action: () => this.farm.use(p, o) }, ...this.farm.options(p, o));
    }
    if (o.key === 'bld_beacon') out.unshift({ label: 'Check the settlement', action: () => this.useObject(p, o) });
    if (o.key === 'bld_compactor') out.unshift({ label: 'Compact 3 scrap into sheet metal', disabled: this.countOf(p, 'scrap_metal') < 3 ? 'needs 3 scrap metal' : false, action: () => this.compact(p, o) });
    if (pieceForObj(o.key) && o.state.built) out.push({ label: 'Cut it apart (salvage half)', danger: true, action: () => this.demolishAt(p, { kind: 'piece', o }) });
  }

  private compact(p: Player, o: TileObject) {
    if (this.countOf(p, 'scrap_metal') < 3) { bus.emit('think', p, 'It wants three pieces of scrap.'); return; }
    const zk = p.zoneKey;
    queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, 'Compact', 2.2, 'push', () => {
      if (this.countOf(p, 'scrap_metal') < 3) return;
      this.takeMats(p, [['scrap_metal', 3]]);
      op('objState', { z: zk, uid: o.uid, patch: { down: true } });
      G.audio?.at?.('slam_hydraulic', o.x + 0.5, o.y + 0.5, 1);
      sparks(o.x + 0.5, 0.4, o.y + 0.5, 18, 3.5);
      if (p.isLocal) { shake(0.35); punch(0.04); }
      setTimeout(() => op('objState', { z: zk, uid: o.uid, patch: { down: false } }), 700);
      p.inv.add(createItem('sheet_metal'));
      bus.emit('inventoryChanged', p);
      bump('bld_compact');
    }), 1.5);
  }

  private hoverOf(t: PickTarget | null): Hover {
    if (!t) return null;
    if (t.kind === 'object') {
      const tags = objDef(t.obj.key)?.tags || [];
      if (tags.includes('bld_frame')) return { kind: 'frame', o: t.obj };
      if (tags.includes('build') && pieceForObj(t.obj.key)) return { kind: 'piece', o: t.obj };
      return null;
    }
    if (t.kind === 'edge') {
      const z = G.zones.get(G.local?.zoneKey ?? ''); if (!z) return null;
      const k = builtWalls(z)[edgeKey(t.x, t.y, t.side)];
      return k ? { kind: 'wall', x: t.x, y: t.y, side: t.side, key: k } : null;
    }
    return null;
  }

  // ================================================================= update
  update(dt: number, dh: number) {
    const inp = G.input, p = G.local;
    if (p && !inp.textFocus && inp.hit('build') && !G.cook?.captures?.()) this.toggle();
    if (this.active && p) this.updateMode(dt, p);
    this.farm.update(dh);
    this.settle.update(dt, this.active);
    this.defT -= dt; if (this.defT <= 0) { this.defT = 0.5; this.defences(); }
    this.stoveT -= dt; this.stoves();
    if (this.active && p) this.board.update(dt, this.boardState(p));
  }

  private updateMode(dt: number, p: Player) {
    const inp = G.input;
    if (p.body.dead || p.inVehicle) { this.toggle(false); return; }
    // keys
    if (inp.hit('pause')) { consume('pause'); this.toggle(false); return; }
    if (inp.hit('rotate')) { this.rot = ((this.rot + 1) % 4) as 0 | 1 | 2 | 3; G.audio?.ui?.('tab', 0.4); }
    if (inp.keyHit('BracketRight') || inp.keyHit('Period')) this.cycle(1);
    if (inp.keyHit('BracketLeft') || inp.keyHit('Comma')) this.cycle(-1);
    // the clipboard: the cursor over it is not pointing into the world (and the wheel turns its pages)
    const bh = this.board.hit(inp.mouseX, inp.mouseY);
    if (bh && !this.boardOver) { this.boardOver = true; inp.pointerOverUI = true; }
    else if (!bh && this.boardOver) { this.boardOver = false; inp.pointerOverUI = false; }
    if (bh && inp.wheel) this.cycle(Math.sign(inp.wheel));
    if (bh && inp.mousePressed[0]) { this.boardClick(bh); inp.mousePressed[0] = false; }
    const over = inp.pointerOverUI;
    const t = over ? null : pick(inp.mouseX, inp.mouseY, { ignore: p });
    this.hover = this.hoverOf(t);
    if (inp.keyHit('KeyX') || inp.keyHit('Delete')) this.demolishAt(p, this.hover);
    const pc = this.current();
    const z = G.getZone(p.zoneKey);
    // the ghost: hidden while pointing at a frame / piece to weld or demolish
    const showGhost = !over && !this.demolish && this.hover?.kind !== 'frame';
    this.spot = showGhost ? this.spotAt(p, pc) : null;
    this.drawGhost(z, pc, this.spot);
    // mouse
    if (!over && inp.mousePressed[0]) {
      this.mouseT = performance.now();
      if (this.demolish) this.demolishAt(p, this.hover);
      else if (this.hover?.kind === 'frame') this.weld(p, this.hover.o);
      else if (this.spot) this.place(p, pc, this.spot);
      // build mode owns the left button: systems after this one (grab / tool clicks) don't see the press
      inp.mousePressed[0] = false;
    }
    // claim ring around the nearest beacon
    const b = this.settle.claimAt(p.zoneKey, p.x, p.z) ?? null;
    this.claimRing.visible = !!b;
    if (b) { this.claimRing.position.set(b.x + 0.5, z.heightAt(b.x, b.y), b.y + 0.5); this.claimRing.scale.setScalar(12); }
    void dt;
  }

  private drawGhost(z: Zone, pc: Piece, s: Spot | null) {
    if (!s) { this.ghost.visible = false; this.ring.visible = false; return; }
    const key = pc.key + ':' + (pc.kind === 'obj' ? s.rot : s.side);
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      let g: THREE.BufferGeometry | null = null;
      if (pc.kind === 'obj') { const d = objDef(pc.obj!); g = d ? objectGeometry(d, { uid: -1, key: pc.obj!, x: 0, y: 0, rot: s.rot, state: {} }) : null; }
      else g = this.wallGhost(pc, s.side);
      this.ghost.geometry = g ?? new THREE.BufferGeometry();
    }
    const h = z.heightAt(s.x, s.y);
    if (pc.kind === 'obj') {
      const d = objDef(pc.obj!)!;
      this.ghost.matrix.copy(objectMatrix(z, { uid: -1, key: pc.obj!, x: s.x, y: s.y, rot: s.rot, state: {} }, d));
      const w = pc.w ?? 1, dd = pc.d ?? 1, rw = s.rot % 2 === 0 ? w : dd, rd = s.rot % 2 === 0 ? dd : w;
      this.ring.position.set(s.x, h, s.y); this.ring.scale.set(rw, 1, rd); this.ring.visible = true;
    } else {
      this.ghost.matrix.makeTranslation(s.x, h, s.y);
      this.ring.position.set(s.x, h, s.y); this.ring.scale.set(1, 1, 1); this.ring.visible = true;
    }
    this.ghost.matrixWorldNeedsUpdate = true;
    const good = s.ok && this.unlocked(pc) && !!G.local && this.canAfford(G.local, pc);
    this.ghost.material = good ? this.matOk : this.matBad;
    (this.ring.material as THREE.MeshLambertMaterial).color.setHex(good ? 0xf0f4ff : 0xe0503a);
    this.ghost.visible = true;
  }
  private wallGhost(pc: Piece, side: 0 | 1): THREE.BufferGeometry {
    const k = pc.key + side;
    let g = this.wallGeo.get(k);
    if (!g) {
      const mb = new ModelBuilder();
      const wd = wallDef(wallId(pc.wall!));
      const h = pc.kind === 'door' ? 2.7 : wd?.height ?? 2.7, th = wd?.thick ?? 0.12;
      if (side === 0) mb.box(0.5, 0, 0, 1, h, th, wd?.tex ?? 'metal_grey'); else mb.box(0, 0, 0.5, th, h, 1, wd?.tex ?? 'metal_grey');
      g = mb.build(); this.wallGeo.set(k, g);
    }
    return g;
  }

  // ================================================================= settlement machines
  /** turrets shoot hostiles, spikes hurt what walks on them (host) */
  private defences() {
    if (G.role === 'client' || !G.creatures) return;
    const zones = new Set<string>(); for (const pl of G.players.values()) zones.add(pl.zoneKey);
    for (const zk of zones) {
      const z = G.zones.get(zk); if (!z) continue;
      const cs: any[] = [];
      for (const c of (G.creatures.creatures?.values?.() || []) as Iterable<any>) if (!c.dead && c.zoneKey === zk && !c.tamedBy && !c.sp?.flags?.companion && !c.sp?.flags?.immortal && !c.mem?.thrall) cs.push(c);
      if (!cs.length) continue;
      for (const o of z.objects.values()) {
        if (o.key === 'bld_turret') this.turret(z, o, cs);
        else if (o.key === 'bld_spikes') for (const c of cs) if (Math.floor(c.x) === o.x && Math.floor(c.z) === o.y) G.creatures.damage('spikes', c.id, 6, o.x + 0.5, o.y + 0.5, 0);
      }
    }
  }
  private turret(z: Zone, o: TileObject, cs: any[]) {
    const ox = o.x + 0.5, oz = o.y + 0.5, R = o.state.manned ? 9 : 7;
    let best: any = null, bd = R;
    for (const c of cs) { const d = Math.hypot(c.x - ox, c.z - oz); if (d < bd) { bd = d; best = c; } }
    if (!best) return;
    const yaw = Math.atan2(best.x - ox, best.z - oz);
    const yq = ((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8;
    const last = this.turretSeen.get(o.uid) ?? 0;
    if (yq !== (o.state.yq ?? 0) && G.time - last > 0.8) { this.turretSeen.set(o.uid, G.time); op('objState', { z: z.key, uid: o.uid, patch: { yq } }); }
    G.creatures.damage('turret', best.id, (o.state.manned ? 7 : 5) + Math.random() * 3, ox, oz, 0.6);
    if (z.key === G.local?.zoneKey) {
      G.audio?.at?.('nail_shot', ox, oz, 0.8);
      G.pointLight(ox, 1.1, oz, 0xffd080, 2.5, 4);
      const dx = (best.x - ox) / bd, dz = (best.z - oz) / bd;
      sparks(ox + dx * 0.5, 1.05, oz + dz * 0.5, 4, 2.5);
      sparks(best.x, 0.8, best.z, 3, 1.5);
    }
    bus.emit('noise', { x: ox, z: oz, radius: 18, kind: 'gun', zone: z.key });
  }
  /** lit drum stoves glow and flicker (visual, local zone) */
  private stoves() {
    const p = G.local; const z = p ? G.zones.get(p.zoneKey) : null; if (!z) return;
    if (this.stoveT > 0) { for (const o of this.litStoves) G.pointLight(o.x + 0.5, 0.7, o.y + 0.5, 0xff8a3a, 1.1 + Math.sin(G.time * 13 + o.x) * 0.25, 5); return; }
    this.stoveT = 1;
    this.litStoves.length = 0;
    for (const o of z.objects.values()) if (o.key === 'bld_stove' && o.state.lit && Math.hypot(o.x - p!.x, o.y - p!.z) < 25 && this.litStoves.length < 3) this.litStoves.push(o);
  }
  private litStoves: TileObject[] = [];

  // ================================================================= the clipboard
  private boardClick(h: BoardHit) {
    const p = G.local;
    if (h.kind === 'tab') { this.cat = h.cat; const first = PIECES.find((q) => q.cat === h.cat); if (first) this.select(first.key); G.audio?.ui?.('paper', 0.5); }
    else if (h.kind === 'prev' || h.kind === 'next') { this.cycle(h.kind === 'next' ? 1 : -1); G.audio?.ui?.('paper', 0.4); }
    else if (h.kind === 'demo') { this.demolish = !this.demolish; G.audio?.ui?.('switch', 0.6); }
    const pc = this.current();
    if (p && h.kind !== 'demo' && !this.unlocked(pc)) (G as any).watch?.openResearch?.('blueprint', pc.node);
  }
  private boardState(p: Player): BoardState {
    const pc = this.current();
    const list = PIECES.filter((q) => q.cat === this.cat);
    const w = welderFor(p, pc);
    const L = this.settle.local();
    return {
      pc, idx: list.indexOf(pc), total: list.length, cat: this.cat, unlocked: this.unlocked(pc), have: (k) => this.countOf(p, k), demolish: this.demolish,
      gas: w?.kind === 'torch' ? (w.it.uses ?? 1) : w?.kind === 'laser' ? 1 : null,
      tool: w ? (w.kind === 'torch' ? 'TORCH' : w.kind === 'laser' ? 'LASER' : 'HAMMER') : pc.join === 'nail' ? 'NO HAMMER' : 'NO WELDER',
      stats: L?.s ?? null, claimName: (L?.b.state.name as string) ?? '',
    };
  }
}

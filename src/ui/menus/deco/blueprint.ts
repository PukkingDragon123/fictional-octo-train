// BUILD MODE for the room on screen: the view turns blueprint (a cyan grid
// laid over the floor and every shelf, corner ticks round the screen), the
// player's spare collectibles wait in a tray of live cards along the bottom,
// a cyan wire ghost of the held item follows the pointer and snaps to the
// grid (red where it cannot stand), and placed things can be picked up,
// turned, moved and sent back to the tray. Every change can be undone; the
// room is saved as it changes.
//   mouse   hover moves the ghost, click places / picks up, wheel turns
//   touch   drag the ghost, lift to place; tap a placed thing to pick it up
//   keys    Q / E turn · arrows nudge · Enter place · Z undo · Delete bin · Esc cancel / done
import * as THREE from 'three';
import type { MenuRoom } from '../menuRooms';
import { FocusNav } from '../nav';
import { plateBtn, kitScale, type PlateButton } from '../btnKit';
import { sfx } from '../sfx';
import { esc } from '../common';
import { ITEM, CATALOG, makeModel } from './catalog';
import type { Furnisher, Spot } from './furnish';
import { spare, newUid, onStore, type Placement } from './store';
import type { Preview } from './preview';

const STEP = 0.125, TURN = Math.PI / 4;
const CYAN = 0x5ad8ff, RED = 0xff4a3a;

export interface BuildHost {
  preview: Preview;
  openShop(): void;
  layer: HTMLElement;
  say(kind: 'build' | 'place' | 'remove', extra?: string): void;
  onExit(): void;
}

type Held = { kind: 'new'; item: string } | { kind: 'move'; uid: string; orig: Placement };

export class BuildMode {
  active = false;
  private host: BuildHost;
  private room: MenuRoom | null = null;
  private f: Furnisher | null = null;
  private el = document.createElement('div');
  private tray = document.createElement('div');
  private tools = document.createElement('div');
  private cap = document.createElement('div');
  private nav: FocusNav | null = null;
  private grid: THREE.LineSegments | null = null;
  private ghost: THREE.Group | null = null;
  private mark: THREE.LineSegments | null = null;
  private hoverMark: THREE.LineSegments | null = null;
  private held: Held | null = null;
  private spot: Spot | null = null;
  private rot = 0;
  private valid = false;
  private hover: string | null = null;
  private binOn = false;
  private undo: Placement[][] = [];
  private down: { x: number; y: number; picked: boolean; id: number } | null = null;
  private cards: { id: string; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; b: HTMLButtonElement; n: HTMLElement; w: number; h: number }[] = [];
  private cardI = 0;
  private bin: PlateButton | null = null;
  private undoBtn: PlateButton | null = null;
  private unsub: (() => void) | null = null;
  private t = 0;

  constructor(host: BuildHost) {
    this.host = host;
    this.el.className = 'dk-build';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Build mode');
    this.cap.className = 'dk-bcap';
    this.tray.className = 'dk-tray';
    this.tools.className = 'dk-tools';
    const ticks = document.createElement('div');
    ticks.className = 'dk-ticks';
    ticks.innerHTML = '<i></i><i></i><i></i><i></i>';
    const bottom = document.createElement('div');
    bottom.className = 'dk-bottom';
    bottom.append(this.tray, this.tools);
    this.el.append(ticks, this.cap, bottom);
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    this.el.addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('pointercancel', () => { this.down = null; });
    this.el.addEventListener('wheel', (e) => { if (this.held && e.target === this.el) { e.preventDefault(); this.turn(e.deltaY > 0 ? 1 : -1, Math.PI / 12); } }, { passive: false });
    this.el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.held) this.cancel(); });
  }

  // ---------------------------------------------------------------- enter / exit
  enter(room: MenuRoom, f: Furnisher) {
    if (this.active) this.exit(true);
    this.active = true;
    this.room = room; this.f = f;
    this.undo = [];
    this.held = null; this.hover = null; this.binOn = false;
    this.host.layer.append(this.el);
    document.body.classList.add('deco-build');
    this.buildGrid();
    this.buildTools();
    this.buildTray();
    this.caption();
    this.unsub = onStore(() => { if (this.active) this.buildTray(); });
    this.nav = new FocusNav(this.el, {
      onBack: () => { if (this.held) this.cancel(); else this.exit(); },
      onTab: (d) => { if (this.held) this.turn(d); },
      onArrow: (dx, dy) => { if (!this.held || !this.spot) return false; this.nudge(dx, dy); return true; },
    });
    window.addEventListener('keydown', this.onKey, true);
    this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in');
    sfx('open', 0.8);
    this.host.say('build');
  }
  exit(quiet = false) {
    if (!this.active) return;
    if (this.held) this.cancel(true);
    this.active = false;
    this.f?.save();
    this.grid?.removeFromParent(); this.grid = null;
    this.mark?.removeFromParent(); this.mark = null;
    this.hoverMark?.removeFromParent(); this.hoverMark = null;
    this.el.remove();
    document.body.classList.remove('deco-build');
    this.nav?.destroy(); this.nav = null;
    window.removeEventListener('keydown', this.onKey, true);
    this.unsub?.(); this.unsub = null;
    for (const c of this.cards) this.host.preview.drop('tray:' + c.id);
    this.cards = [];
    if (!quiet) { sfx('back'); this.host.onExit(); }
  }

  // ---------------------------------------------------------------- the 2D parts
  private caption() {
    const name = { monitor: 'Monitor room', research: 'Research lab', subject: 'Subject room' }[this.room!.id] ?? 'Room';
    this.cap.innerHTML = `<b>Blueprint</b><span>${esc(name)}</span><small>${this.held ? 'click to set · Q / E turn · right click cancel' : this.binOn ? 'click a thing to send it back to the tray' : 'pick from the tray · click a thing to move it'}</small>`;
  }
  private buildTools() {
    this.tools.innerHTML = '';
    const turn = plateBtn('Turn', () => { if (this.held) this.turn(1); else if (this.hover) this.turnPlaced(this.hover); }, { finish: 'navy', size: 'sm', lamp: false, sound: 'rocker', aria: 'Turn (Q / E)', tight: true });
    this.bin = plateBtn('Bin', () => { this.binOn = !this.binOn; this.bin!.classList.toggle('on', this.binOn); if (this.held) this.cancel(); this.caption(); }, { finish: 'oxblood', size: 'sm', lamp: 'red', aria: 'Bin: send things back to the tray (Delete)', tight: true });
    this.undoBtn = plateBtn('Undo', () => this.popUndo(), { finish: 'navy', size: 'sm', lamp: false, sound: 'rocker', aria: 'Undo (Z)', tight: true });
    const shop = plateBtn('Shop', () => this.host.openShop(), { finish: 'olive', size: 'sm', lamp: 'amber', aria: 'The commissary', tight: true });
    const done = plateBtn('Done', () => this.exit(), { finish: 'brass', size: 'sm', lamp: 'green', aria: 'Done (Esc)', tight: true });
    this.tools.append(turn, this.bin, this.undoBtn, shop, done);
    requestAnimationFrame(() => { for (const b of [turn, this.bin!, this.undoBtn!, shop, done]) b.paint(); });
  }
  /** the tray: a live card for every item the player has spare */
  private buildTray() {
    const ids = CATALOG.map((i) => i.id).filter((id) => spare(id) > 0 || (this.held?.kind === 'new' && this.held.item === id));
    const S = kitScale();
    const W = 30, H = 34;
    const keep = new Map(this.cards.map((c) => [c.id, c]));
    this.tray.innerHTML = '';
    const next: typeof this.cards = [];
    if (!ids.length) {
      const e = document.createElement('div');
      e.className = 'dk-empty';
      e.innerHTML = 'Tray empty · the <b>Shop</b> has more';
      this.tray.append(e);
    }
    for (const id of ids) {
      let c = keep.get(id);
      if (!c || c.w !== W * S) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'dk-card';
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
        const n = document.createElement('span');
        n.className = 'dk-n';
        b.append(cv, n);
        b.addEventListener('click', () => this.pickNew(id));
        b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { b.focus({ preventScroll: true }); sfx('tick', 0.3); } });
        c = { id, cv, ctx: cv.getContext('2d')!, b, n, w: W * S, h: H * S };
      }
      const it = ITEM.get(id)!;
      c.b.setAttribute('aria-label', `${it.name} (${spare(id)} in the tray)`);
      c.n.textContent = '×' + spare(id);
      c.b.classList.toggle('on', this.held?.kind === 'new' && this.held.item === id);
      this.tray.append(c.b);
      next.push(c);
    }
    for (const [id] of keep) if (!next.some((c) => c.id === id)) this.host.preview.drop('tray:' + id);
    this.cards = next;
    for (const c of this.cards) this.drawCard(c, 0);
  }
  private drawCard(c: (typeof this.cards)[number], dt: number) {
    const ctx = c.ctx;
    const W = c.cv.width, H = c.cv.height;
    this.host.preview.draw(ctx, 'tray:' + c.id, c.id, W, H, { dt, yaw: 0.5 + Math.sin(this.t * 0.6 + c.id.length) * 0.4, slot: false, bg: 0x0c2240 });
    // a blueprint card: cyan rule lines in the corners, the outline
    ctx.fillStyle = '#5ad8ff';
    for (const [x, y, w, h] of [[0, 0, 4, 1], [0, 0, 1, 4], [W - 4, 0, 4, 1], [W - 1, 0, 1, 4], [0, H - 1, 4, 1], [0, H - 4, 1, 4], [W - 4, H - 1, 4, 1], [W - 1, H - 4, 1, 4]]) ctx.fillRect(x, y, w, h);
  }

  // ---------------------------------------------------------------- 3D overlays
  private lineMat(color: number, opacity: number) { return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }); }
  private buildGrid() {
    const room = this.room!;
    const pts: number[] = [];
    const rects = [room.floor, ...(room.surfaces ?? [])];
    for (const rc of rects) {
      const y = rc.y + 0.004;
      const step = rc === room.floor ? 0.25 : 0.125;
      for (let x = rc.minX; x <= rc.maxX + 1e-6; x += step) pts.push(x, y, rc.minZ, x, y, rc.maxZ);
      for (let z = rc.minZ; z <= rc.maxZ + 1e-6; z += step) pts.push(rc.minX, y, z, rc.maxX, y, z);
      // the border, doubled
      pts.push(rc.minX, y, rc.minZ, rc.maxX, y, rc.minZ, rc.maxX, y, rc.minZ, rc.maxX, y, rc.maxZ, rc.maxX, y, rc.maxZ, rc.minX, y, rc.maxZ, rc.minX, y, rc.maxZ, rc.minX, y, rc.minZ);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(g, this.lineMat(CYAN, 0.42));
    this.grid.renderOrder = 6;
    this.grid.userData.ghost = true;
    room.deco.add(this.grid);
  }
  /** a footprint: a square of corner ticks on the ground */
  private markGeo(r: number): THREE.BufferGeometry {
    const k = r * 0.45, p: number[] = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      p.push(sx * r, 0.01, sz * r, sx * (r - k), 0.01, sz * r, sx * r, 0.01, sz * r, sx * r, 0.01, sz * (r - k));
    }
    p.push(0, 0.01, r * 0.2, 0, 0.01, r * 1.2); // the front arrow
    p.push(0, 0.01, r * 1.2, -r * 0.15, 0.01, r * 1.0, 0, 0.01, r * 1.2, r * 0.15, 0.01, r * 1.0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }
  private makeGhost(id: string): THREE.Group | null {
    const m = makeModel(id);
    if (!m) return null;
    const g = new THREE.Group();
    const fill = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
    const edge = this.lineMat(CYAN, 0.95);
    m.light?.removeFromParent();
    const meshes: THREE.Mesh[] = [];
    m.obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); else if ((o as THREE.Sprite).isSprite) o.visible = false; });
    for (const mesh of meshes) {
      mesh.material = fill;
      mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.userData.ghost = true;
      mesh.renderOrder = 7;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), edge);
      e.renderOrder = 8;
      mesh.add(e);
    }
    g.add(m.obj);
    g.userData = { ghost: true, fill, edge, model: m };
    return g;
  }
  private setGhostColor(ok: boolean) {
    if (!this.ghost) return;
    const c = ok ? CYAN : RED;
    (this.ghost.userData.fill as THREE.MeshBasicMaterial).color.setHex(c);
    (this.ghost.userData.edge as THREE.LineBasicMaterial).color.setHex(c);
    if (this.mark) (this.mark.material as THREE.LineBasicMaterial).color.setHex(c);
  }

  // ---------------------------------------------------------------- holding
  private itemOfHeld(): string { return this.held!.kind === 'new' ? this.held!.item : this.f!.items.get(this.held!.uid)!.p.item; }
  private pickNew(id: string) {
    if (spare(id) <= 0) return;
    if (this.held) this.cancel(true);
    this.binOn = false; this.bin?.classList.remove('on');
    this.held = { kind: 'new', item: id };
    this.rot = 0;
    this.startGhost(id);
    // start in the middle of the floor so keys / pads have somewhere to begin
    const F = this.room!.floor;
    this.place({ x: (F.minX + F.maxX) / 2, y: F.y, z: (F.minZ + F.maxZ) / 2, surf: -1, s: 1 });
    sfx('plate', 0.6);
    this.buildTray();
    this.caption();
  }
  private startMove(uid: string) {
    const it = this.f!.items.get(uid);
    if (!it) return;
    this.held = { kind: 'move', uid, orig: { ...it.p } };
    this.rot = it.p.rot;
    it.node.visible = false;
    this.startGhost(it.p.item);
    this.place({ x: it.p.x, y: it.p.y, z: it.p.z, surf: it.p.surf, s: it.p.s });
    sfx('servo', 0.4);
    this.caption();
  }
  private startGhost(id: string) {
    this.ghost?.removeFromParent();
    this.mark?.removeFromParent();
    this.ghost = this.makeGhost(id);
    const it = ITEM.get(id)!;
    this.mark = new THREE.LineSegments(this.markGeo(it.r), this.lineMat(CYAN, 0.9));
    this.mark.renderOrder = 8;
    this.mark.userData.ghost = true;
    if (this.ghost) this.room!.deco.add(this.ghost);
    this.room!.deco.add(this.mark);
  }
  /** move the ghost to a spot (snapped), recolour it */
  private place(sp: Spot) {
    if (!this.held || !this.f) return;
    const id = this.itemOfHeld(), it = ITEM.get(id)!;
    sp = this.f.snap(sp, sp.surf < 0 ? STEP : STEP / 2);
    sp.s = sp.surf < 0 ? 1 : it.shelf ?? 0.5;
    this.spot = sp;
    this.valid = this.f.fits(id, sp, this.held.kind === 'move' ? this.held.uid : undefined);
    for (const o of [this.ghost, this.mark]) {
      if (!o) continue;
      o.position.set(sp.x, sp.y, sp.z);
      o.rotation.y = this.rot;
      o.scale.setScalar(sp.s);
    }
    this.setGhostColor(this.valid);
  }
  private turn(d: number, step = TURN) {
    if (!this.held || !this.spot) return;
    this.rot = Math.round((this.rot + d * step) / (Math.PI / 12)) * (Math.PI / 12);
    this.place(this.spot);
    sfx('ratchet', 0.4);
  }
  private nudge(dx: number, dy: number) {
    if (!this.spot) return;
    // arrows move on the floor relative to the camera's facing
    const cam = this.room!.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const m = right.multiplyScalar(dx).add(fwd.multiplyScalar(-dy));
    const ax = Math.abs(m.x) > Math.abs(m.z);
    const st = this.spot.surf < 0 ? STEP : STEP / 2;
    this.place({ ...this.spot, x: this.spot.x + (ax ? Math.sign(m.x) * st : 0), z: this.spot.z + (ax ? 0 : Math.sign(m.z) * st) });
    sfx('tick', 0.3);
  }
  /** set the held item down where the ghost is */
  private drop(): boolean {
    if (!this.held || !this.spot || !this.f) return false;
    if (!this.valid) { sfx('error', 0.6); return false; }
    this.pushUndo();
    const sp = this.spot;
    let name = '';
    if (this.held.kind === 'new') {
      const p: Placement = { uid: newUid(), item: this.held.item, x: sp.x, y: sp.y, z: sp.z, rot: this.rot, surf: sp.surf, s: sp.s };
      this.f.spawn(p);
      name = ITEM.get(p.item)!.name;
    } else {
      this.f.set(this.held.uid, { x: sp.x, y: sp.y, z: sp.z, rot: this.rot, surf: sp.surf, s: sp.s });
      const n = this.f.node(this.held.uid);
      if (n) n.visible = true;
    }
    this.f.save();
    const kind = this.held.kind, again = this.held.kind === 'new' ? this.held.item : '';
    this.clearHeld();
    sfx('clamp', 0.6);
    if (kind === 'new') this.host.say('place', name.toLowerCase());
    // still have another? keep it in hand
    if (again && spare(again) > 0 && !matchMedia('(pointer: coarse)').matches) { this.pickNew(again); this.place(sp); }
    this.buildTray();
    return true;
  }
  /** put the held item back where it came from (or in the tray) */
  private cancel(quiet = false) {
    if (!this.held) return;
    if (this.held.kind === 'move') { const n = this.f?.node(this.held.uid); if (n) n.visible = true; }
    this.clearHeld();
    if (!quiet) sfx('back', 0.5);
    this.buildTray();
  }
  private clearHeld() {
    this.held = null; this.spot = null;
    this.ghost?.removeFromParent(); this.ghost = null;
    this.mark?.removeFromParent(); this.mark = null;
    this.caption();
  }
  private removePlaced(uid: string) {
    if (!this.f) return;
    const it = this.f.items.get(uid);
    if (!it) return;
    this.pushUndo();
    this.f.remove(uid);
    this.f.save();
    sfx('plate', 0.6);
    this.host.say('remove');
    this.buildTray();
  }
  private turnPlaced(uid: string) {
    const it = this.f?.items.get(uid);
    if (!it) return;
    this.pushUndo();
    this.f!.set(uid, { rot: it.p.rot + TURN });
    this.f!.save();
    sfx('ratchet', 0.4);
  }
  private pushUndo() { if (this.f) { this.undo.push(this.f.list()); if (this.undo.length > 60) this.undo.shift(); } }
  private popUndo() {
    if (!this.f) return;
    const prev = this.undo.pop();
    if (!prev) { sfx('error', 0.4); return; }
    if (this.held) this.cancel(true);
    this.f.restore(prev);
    this.f.save();
    sfx('rocker', 0.6);
    this.buildTray();
  }

  // ---------------------------------------------------------------- input
  private onKey = (e: KeyboardEvent) => {
    if (!this.active) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if ((k === 'z' || k === 'Z') && !e.altKey) { e.preventDefault(); this.popUndo(); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); if (this.held) this.turn(1); else if (this.hover) this.turnPlaced(this.hover); }
    else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      if (this.held?.kind === 'move') { const uid = this.held.uid; this.cancel(true); this.removePlaced(uid); }
      else if (this.held) this.cancel();
      else if (this.hover) this.removePlaced(this.hover);
    } else if ((k === 'Enter' || k === ' ') && this.held) { e.preventDefault(); e.stopPropagation(); this.drop(); }
  };
  private onDown(e: PointerEvent) {
    if (e.target !== this.el || !this.f) return;
    if (e.button === 2) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.down = { x: e.clientX, y: e.clientY, picked: false, id: e.pointerId };
    if (this.held) { this.follow(e.clientX, e.clientY); return; }
    const uid = this.f.hit(e.clientX, e.clientY);
    if (!uid) return;
    if (this.binOn) { this.removePlaced(uid); this.down = null; return; }
    this.startMove(uid);
    this.down.picked = true;
  }
  private onMove(e: PointerEvent) {
    if (!this.f) return;
    if (this.held) { if (e.target === this.el || this.down) this.follow(e.clientX, e.clientY); return; }
    if (e.target !== this.el) return;
    const uid = this.f.hit(e.clientX, e.clientY);
    if (uid !== this.hover) {
      this.hover = uid;
      this.el.classList.toggle('over', !!uid);
      this.el.classList.toggle('bin', !!uid && this.binOn);
      this.showHover();
    }
  }
  private onUp(e: PointerEvent) {
    const d = this.down;
    this.down = null;
    if (!d || !this.held) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10;
    if (d.picked && !moved && e.pointerType === 'mouse') return; // clicked to pick up: it follows the mouse now
    if (d.picked && !moved) return; // a tap picks it up; the next tap or a drag sets it down
    this.follow(e.clientX, e.clientY);
    if (!this.drop() && e.pointerType !== 'mouse' && moved) { /* invalid: keep it in hand */ }
  }
  private follow(cx: number, cy: number) {
    if (!this.f || !this.held) return;
    const it = ITEM.get(this.itemOfHeld())!;
    const sp = this.f.pick(cx, cy, it.place === 'any');
    if (sp) this.place(sp);
  }
  private showHover() {
    this.hoverMark?.removeFromParent(); this.hoverMark = null;
    if (!this.hover || !this.f) return;
    const it = this.f.items.get(this.hover);
    if (!it) return;
    const r = ITEM.get(it.p.item)!.r;
    this.hoverMark = new THREE.LineSegments(this.markGeo(r), this.lineMat(this.binOn ? RED : 0xffe08a, 0.95));
    this.hoverMark.userData.ghost = true;
    this.hoverMark.renderOrder = 8;
    this.hoverMark.position.set(it.p.x, it.p.y, it.p.z);
    this.hoverMark.rotation.y = it.p.rot;
    this.hoverMark.scale.setScalar(it.p.s);
    this.room!.deco.add(this.hoverMark);
    sfx('tick', 0.25);
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    // the ghost breathes; the held model keeps its idle (bobbles, blobs)
    if (this.ghost) {
      const m = this.ghost.userData.model as { update?: (t: number, dt: number) => void };
      m.update?.(this.t, dt);
      (this.ghost.userData.fill as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(this.t * 5) * 0.06;
    }
    if (this.grid) (this.grid.material as THREE.LineBasicMaterial).opacity = 0.36 + Math.sin(this.t * 1.7) * 0.06;
    if (this.undoBtn) this.undoBtn.disabled = !this.undo.length;
    // the tray cards turn, two per frame
    if (this.cards.length) for (let k = 0; k < 2; k++) { const c = this.cards[this.cardI++ % this.cards.length]; this.drawCard(c, dt * this.cards.length / 2); }
  }
}

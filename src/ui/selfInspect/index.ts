// INSPECT YOURSELF (round 12). O (a long press on the hotbar, P in the pack, the
// touch SELF button) stands your unit on the Meridian inspection turntable in
// front of you: the whole body, lit like the intake bay, wearing what you wear
// and holding what you hold. Glowing tags sit on it where things are: head,
// torso, trousers, feet, the pack on your back, the tool roll, the watch, both
// hands, the left and right pockets (and any chest / back pocket your clothes
// have). Touch one and its sheet of light opens beside you with the real
// things in it (their own models, turning slowly); pick one to wear it, take it
// off, take it into a hand, put it away or drop it. Under your feet is the
// HOTBAR: six sockets, each showing what it is bound to; drag a thing onto a
// socket to bind it (or press 1-6 with it picked), drag it off to clear it, drag
// a thing onto a tag on the body to move it there. Drag the empty space (A / D,
// arrows) to turn the turntable; it coasts. O / Esc closes.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Item } from '../../items/item';
import { itemDef, itemName, itemWeight } from '../../items/item';
import type { Container } from '../../items/container';
import type { Player } from '../../entities/player';
import { createPreviewRig, type HumanRig } from '../../entities/humanRig';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../../fp/fp';
import { makeItemObj, fitItemObj, type ItemObj } from '../../craft/fpKit';
import { gridSpec, containerOcc, testFit, type Region, type Rot, type Placement } from '../../items/grid';
import { queueTransfers } from '../../actions/transfer';
import { WearAction, EquipAction } from '../../actions/basic';
import { floorContainer } from '../../items/worldItems';
import { settlePack } from '../../items/packResolver';
import { bindHot, hotSlots, hotOf, HOT_N } from '../hotbar/hotbar';
import { Plate, PLATE_T, backdrop, lightBlend } from '../watch/plate';
import { isTouchMode } from '../touch/mode';

type SpotId = 'head' | 'torso' | 'legs' | 'feet' | 'back' | 'belt' | 'wrist' | 'handL' | 'handR' | 'pocketL' | 'pocketR' | 'pocketC';
interface SpotDef { id: SpotId; label: string; a: string; b?: string; t?: number; off: [number, number, number]; face: 'front' | 'back' | 'side'; slots?: string[] }
const SPOTS: SpotDef[] = [
  { id: 'head', label: 'HEAD', a: 'head', off: [0, 0.16, 0.06], face: 'front', slots: ['hat', 'eyes', 'mask', 'face', 'head', 'neck'] },
  { id: 'torso', label: 'TORSO', a: 'chest', off: [0, 0.02, 0.16], face: 'front', slots: ['tshirt', 'shirt', 'sweater', 'jacket', 'fullsuit', 'torso_inner', 'torso', 'torso_outer'] },
  { id: 'legs', label: 'TROUSERS', a: 'thighR', b: 'shinR', t: 0.7, off: [0, 0, 0.09], face: 'front', slots: ['pants', 'legs'] },
  { id: 'feet', label: 'FEET', a: 'footL', b: 'footR', t: 0.5, off: [0, 0.02, 0.12], face: 'front', slots: ['socks', 'shoes', 'feet'] },
  { id: 'back', label: 'BACKPACK', a: 'chest', off: [0, -0.06, -0.24], face: 'back', slots: ['back'] },
  { id: 'belt', label: 'TOOL ROLL', a: 'hips', off: [0, 0.02, 0], face: 'side', slots: ['belt'] },
  { id: 'wrist', label: 'WATCH', a: 'farmL', b: 'handL', t: 0.78, off: [0, 0, 0], face: 'side', slots: ['wrist'] },
  { id: 'handL', label: 'LEFT HAND', a: 'handL', off: [0, -0.06, 0], face: 'side', slots: ['hands'] },
  { id: 'handR', label: 'RIGHT HAND', a: 'handR', off: [0, -0.06, 0], face: 'side', slots: ['hands'] },
  { id: 'pocketL', label: 'LEFT POCKET', a: 'thighL', b: 'shinL', t: 0.2, off: [0, 0, 0.05], face: 'side' },
  { id: 'pocketR', label: 'RIGHT POCKET', a: 'thighR', b: 'shinR', t: 0.2, off: [0, 0, 0.05], face: 'side' },
  { id: 'pocketC', label: 'CHEST POCKET', a: 'chest', off: [0.09, 0.06, 0.15], face: 'front' },
];
const BONE = '#efe6cc', DIM = '#a89c7c', DIMM = '#6a6250', AMB = '#ffd27a', AMB_D = '#c8933a', OKC = '#a8e8a0', BAD = '#ff8f7a';
const D = 2.3;

/** which pocket side a pocket region is: L, R or C (chest, seat, pouch, inside) */
function pocketSide(r: Region | undefined): 'L' | 'R' | 'C' {
  const id = r?.pocket ?? '';
  return /_l$/.test(id) ? 'L' : /_r$/.test(id) ? 'R' : 'C';
}
function regionOf(p: Player, it: Item): Region | undefined {
  const s = gridSpec(p.inv); if (!s || it.gx === undefined || it.gy === undefined) return undefined;
  return s.regions[s.ri[it.gy * s.w + it.gx]];
}
/** a free place for `it` inside the pockets on one side */
function pocketSpot(p: Player, it: Item, side: 'L' | 'R' | 'C'): Placement | null {
  const spec = gridSpec(p.inv); if (!spec || (spec.accepts && !spec.accepts(it))) return null;
  const occ = containerOcc(p.inv, new Set([it])); if (!occ) return null;
  for (const r of spec.regions) {
    if (!r.pocket || pocketSide(r) !== side) continue;
    for (const rot of [0, 1] as Rot[]) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (testFit(occ, it, x, y, rot) !== 'blocked') return { gx: x, gy: y, rot };
  }
  return null;
}

interface Btn { id: string; label: string; x: number; y: number; w: number; h: number; on?: boolean }
interface Row { it: Item; y: number }

export class SelfInspect {
  open = false;
  private built = false;
  private g!: THREE.Group;
  private pivot = new THREE.Group();
  private rig: HumanRig | null = null;
  private outfitSig = '';
  private heldSig = '';
  private plinth!: THREE.Group;
  private back!: THREE.Mesh;
  private markers = new Map<SpotId, { m: THREE.Group; ring: THREE.Mesh; dot: THREE.Mesh; label: Plate; w: number; pos: THREE.Vector3; scr: THREE.Vector2; key: string; n: number }>();
  private sheet!: Plate; private title!: Plate;
  private sheetModels = new THREE.Group();
  private rowObjs: { o: ItemObj; it: Item }[] = [];
  private sockets: { root: THREE.Group; base: THREE.Mesh; glow: THREE.Mesh; num: Plate; obj: ItemObj | null; key: string }[] = [];
  private hotRow = new THREE.Group();
  private spot: SpotId = 'torso';
  private item: Item | null = null;
  private rows: Row[] = []; private btns: Btn[] = [];
  private sheetSig = '';
  private show = 0; private t = 0;
  private yaw = 0.42; private yawV = 0;
  private hoverSpot: SpotId | null = null; private hoverSock = -1;
  private ptr: { id: number; x0: number; y0: number; x: number; y: number; mode: 'turn' | 'pending' | 'drag' | 'none'; it: Item | null; fromSock: number; lastX: number; lastT: number } | null = null;
  private drag: { o: ItemObj; it: Item; fromSock: number; pos: THREE.Vector3; vel: THREE.Vector3 } | null = null;
  private rc = new THREE.Raycaster();
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3();
  private closing = false;
  private flash = '';
  private flashT = 0;

  constructor() {
    (G as any).selfInspect = this;
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('pointerdown', (e) => this.onDown(e), true);
    window.addEventListener('pointermove', (e) => this.onMove(e), true);
    window.addEventListener('pointerup', (e) => this.onUp(e), true);
    window.addEventListener('pointercancel', (e) => this.onUp(e, true), true);
    bus.on('fpLost', (n: string) => { if (n === 'self' && this.open) this.close(true); });
    bus.on('inventoryChanged', () => { this.sheetSig = ''; });
    G.addSystem({ name: 'selfInspect', update: (dt: number) => this.frame(dt) });
    // built early and hidden, so the renderer's warm-up compiles its shaders before the first open
    setTimeout(() => { try { this.build(); } catch (e) { console.warn('prebuild', e); } }, 2500);
  }

  toggle(v?: boolean) { const want = v ?? !this.open; if (want) this.openUp(); else this.close(); }

  private openUp() {
    if (this.open) return;
    const p = G.local, g: any = G;
    if (!p || p.body.dead || g.intro?.running) return;
    if (fpOwner() === 'watch') g.watch?.toggle?.(false);
    if (fpOwner() === 'pack') g.pack?.toggle?.(false);
    if (fpOwner() === 'broadcast') { g.broadcast?.close?.(true); fpRelease('broadcast'); }
    if (fpOwner() && fpOwner() !== 'self') return;
    this.build();
    if (!fpClaim('self', 4, { cinematic: 'glance' })) return;
    this.open = true; this.closing = false; this.show = 0; this.t = 0;
    this.sheetSig = ''; this.outfitSig = ''; this.heldSig = '';
    this.item = null;
    this.yaw = 0.42; this.yawV = 0;
    G.hudBody?.setHidden?.('self', true);
    G.audio?.ui?.('bag_zip', 0.3);
  }
  close(lost = false) {
    if (!this.open) return;
    this.open = false; this.closing = !lost;
    this.endDrag(false);
    G.hudBody?.setHidden?.('self', false);
    G.audio?.ui?.('watchTick', 0.35);
    document.body.style.cursor = '';
    if (lost) { this.closing = false; this.g.visible = false; }
  }

  // ================================================================ building
  private build() {
    if (this.built) return;
    this.built = true;
    const g = this.g = fpGroup('self');
    g.add(new THREE.HemisphereLight(0xd8d0bc, 0x2a241c, 0.75));
    const key = new THREE.DirectionalLight(0xffe8c8, 1.9); key.position.set(-1.2, 2.2, 1.6); g.add(key);
    const rim = new THREE.DirectionalLight(0x8ab8ff, 1.1); rim.position.set(1.6, 1.0, -2.2); g.add(rim);
    const fill = new THREE.DirectionalLight(0xffb070, 0.35); fill.position.set(1.4, -0.4, 1.0); g.add(fill);
    this.back = backdrop('#0b0906', 'rgba(40,32,22,0.8)', 'rgba(18,14,10,0.93)'); this.back.position.z = -5; g.add(this.back);
    g.add(this.pivot, this.sheetModels, this.hotRow);
    this.plinth = this.buildPlinth(); this.pivot.add(this.plinth);
    for (const s of SPOTS) {
      const m = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.021, 20), lightBlend(new THREE.MeshBasicMaterial({ color: 0xffc860, depthTest: false })));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.007, 12), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, depthWrite: false, depthTest: false }));
      ring.renderOrder = dot.renderOrder = 40;
      m.add(ring, dot);
      const label = new Plate(92, 12, { scan: 0.12 });
      label.mesh.renderOrder = 41; (label.mat as THREE.ShaderMaterial).depthTest = false;
      g.add(m, label.mesh);
      this.markers.set(s.id, { m, ring, dot, label, w: 0, pos: new THREE.Vector3(), scr: new THREE.Vector2(), key: '', n: 0 });
    }
    this.sheet = new Plate(178, 214); this.title = new Plate(220, 34, { scan: 0.1 });
    g.add(this.sheet.mesh, this.title.mesh);
    // the hotbar: six sockets on a rail
    const graph = new THREE.MeshLambertMaterial({ color: 0x2a2620 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(6 * 0.118 + 0.03, 0.016, 0.07), graph);
    rail.position.y = -0.012; this.hotRow.add(rail);
    for (let i = 0; i < HOT_N; i++) {
      const root = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.022, 6), new THREE.MeshLambertMaterial({ color: 0x3a342a }));
      base.rotation.y = Math.PI / 6;
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.043, 6), lightBlend(new THREE.MeshBasicMaterial({ color: 0xffb040, opacity: 0.3 })));
      glow.rotation.x = -Math.PI / 2; glow.rotation.z = Math.PI / 6; glow.position.y = 0.0125;
      const num = new Plate(16, 16, { scan: 0 });
      num.clear(); num.text(String(i + 1), 8, 0, AMB, 16, 'center'); num.commit();
      num.scaleTo(0.0021); num.mesh.position.set(0, 0.006, 0.06); num.mesh.rotation.x = -0.6;
      root.add(base, glow, num.mesh);
      root.position.x = (i - (HOT_N - 1) / 2) * 0.118;
      base.userData.sock = i;
      this.hotRow.add(root);
      this.sockets.push({ root, base, glow, num, obj: null, key: '' });
    }
  }

  private buildPlinth(): THREE.Group {
    const r = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0x4a4a46 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.05, 40), new THREE.MeshLambertMaterial({ color: 0x24221e }));
    top.position.y = -0.025;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.01, 4, 48), steel); lip.rotation.x = Math.PI / 2; lip.position.y = 0;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.385, 48), lightBlend(new THREE.MeshBasicMaterial({ color: 0xffa838, opacity: 0.55 })));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002;
    r.add(top, lip, ring);
    for (let i = 0; i < 36; i++) {
      const tk = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.003, i % 9 === 0 ? 0.05 : 0.022), steel);
      const a = (i / 36) * Math.PI * 2; tk.position.set(Math.cos(a) * 0.31, 0.002, Math.sin(a) * 0.31); tk.rotation.y = -a + Math.PI / 2;
      r.add(tk);
    }
    // the feet marks
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.002, 0.16), new THREE.MeshBasicMaterial({ color: 0x6a5a30 })); f.position.set(sx * 0.07, 0.002, 0.01); r.add(f); }
    return r;
  }

  // ================================================================ data
  private itemsAt(p: Player, s: SpotId): Item[] {
    const def = SPOTS.find((q) => q.id === s)!;
    const out: Item[] = [];
    if (s === 'handL' || s === 'handR') {
      const h = s === 'handL' ? p.handL : p.handR;
      if (h) out.push(h);
      const gl = p.worn.get('hands' as any); if (gl) out.push(gl);
      return out;
    }
    if (def.slots) { for (const [slot, it] of p.worn) if (def.slots.includes(slot)) out.push(it); return out; }
    const side = s === 'pocketL' ? 'L' : s === 'pocketR' ? 'R' : 'C';
    for (const it of p.inv.items) {
      if (p.isWorn(it) || p.handR === it || p.handL === it) continue;
      const r = regionOf(p, it);
      if (!r || !r.pocket) { if (side === 'R') out.push(it); continue; }
      if (pocketSide(r) === side) out.push(it);
    }
    return out;
  }
  private hasSpot(p: Player, s: SpotId): boolean {
    if (s === 'pocketC') { const sp = gridSpec(p.inv); return !!sp?.regions.some((r) => r.pocket && pocketSide(r) === 'C'); }
    if (s === 'belt' || s === 'back') return !!p.worn.get(s as any);
    return true;
  }
  private packC(p: Player): Container | null { const b = p.worn.get('back'); return b?.inv ?? null; }
  private label(s: SpotId) { return SPOTS.find((q) => q.id === s)!.label; }

  // ================================================================ actions
  private say(t: string) { this.flash = t; this.flashT = 2.4; this.sheetSig = ''; }
  private doAct(id: string) {
    const p = G.local, it = this.item; if (!p) return;
    if (id === 'openpack') { this.close(); setTimeout(() => (G as any).pack?.toggle?.(true), 350); return; }
    if (!it) return;
    const from = p.containerOf(it);
    G.audio?.ui?.('click', 0.3);
    if (id.startsWith('hot')) { const n = Number(id.slice(3)); bindHot(p, n, hotOf(it) === n ? null : it); this.sheetSig = ''; return; }
    switch (id) {
      case 'wear': if (from && from !== p.inv) queueTransfers(p, [it], from, p.inv); p.actions.add(new WearAction(p, it)); this.say('Putting it on…'); break;
      case 'off': p.actions.add(new WearAction(p, it, true)); this.say('Taking it off…'); setTimeout(() => { const q = G.local; if (q) { settlePack(q); bus.emit('inventoryChanged', q); } }, 3600); break;
      case 'holdR': case 'holdL': if (from && from !== p.inv && p.handR !== it && p.handL !== it) queueTransfers(p, [it], from, p.inv); p.actions.add(new EquipAction(p, it, id === 'holdR' ? 'R' : 'L')); break;
      case 'away': this.moveTo(p, it, 'back'); break;
      case 'drop': if (from) queueTransfers(p, [it], from, floorContainer(G.zone, p.x, p.z)); this.item = null; break;
    }
    this.sheetSig = '';
  }
  /** move a thing onto a spot of the body (drag and drop, PUT AWAY) */
  private moveTo(p: Player, it: Item, s: SpotId): boolean {
    const from = p.containerOf(it); if (!from) return false;
    const d = itemDef(it.key);
    const unhold = () => { if (p.handR === it) p.equip(null, 'R'); if (p.handL === it) p.equip(null, 'L'); };
    if (s === 'handL' || s === 'handR') { if (from !== p.inv) queueTransfers(p, [it], from, p.inv); p.actions.add(new EquipAction(p, it, s === 'handL' ? 'L' : 'R')); return true; }
    if (s === 'pocketL' || s === 'pocketR' || s === 'pocketC') {
      const at = pocketSpot(p, it, s === 'pocketL' ? 'L' : s === 'pocketR' ? 'R' : 'C');
      if (!at) { this.say('It will not fit in that pocket.'); G.audio?.ui?.('bag_bad', 0.4); return false; }
      unhold(); if (p.isWorn(it)) p.unwear(it);
      queueTransfers(p, [it], from, p.inv, at);
      G.audio?.ui?.('bag_place', 0.4);
      return true;
    }
    if (s === 'back') {
      const pk = this.packC(p);
      if (!pk) { this.say('No pack on my back.'); return false; }
      if (pk === from) return true;
      unhold();
      queueTransfers(p, [it], from, pk);
      G.audio?.ui?.('bag_place', 0.4);
      return true;
    }
    if (s === 'belt') { const roll = p.worn.get('belt')?.inv; if (roll) { unhold(); queueTransfers(p, [it], from, roll); return true; } return false; }
    // clothing spots: wear it if it is that kind of thing
    const def = SPOTS.find((q) => q.id === s)!;
    if ((d.clothing || d.bag) && !p.isWorn(it)) {
      if (from !== p.inv) queueTransfers(p, [it], from, p.inv);
      p.actions.add(new WearAction(p, it));
      this.say('Putting it on…');
      return true;
    }
    this.say(`That does not go on the ${def.label.toLowerCase()}.`);
    G.audio?.ui?.('bag_bad', 0.4);
    return false;
  }

  // ================================================================ drawing
  private drawSheet(p: Player) {
    const items = this.spot === 'back' ? [...(this.packC(p)?.items ?? [])] : this.itemsAt(p, this.spot);
    if (this.item && !p.containerOf(this.item)) this.item = null;
    const sig = [this.spot, this.item?.uid ?? 0, this.flash, isTouchMode() ? 1 : 0, ...items.map((i) => i.uid + ':' + i.key + ':' + hotOf(i) + (p.isWorn(i) ? 'w' : '') + (p.handR === i ? 'r' : '') + (p.handL === i ? 'l' : '')), p.handR?.uid ?? 0, p.handL?.uid ?? 0].join('|');
    if (sig === this.sheetSig) return;
    this.sheetSig = sig;
    const P = this.sheet, W = P.w, H = P.h;
    const rows: Row[] = this.rows = []; const btns: Btn[] = this.btns = [];
    P.clear();
    P.grad(0, 0, W, H, 'rgba(36,30,20,0.84)', 'rgba(16,13,9,0.74)');
    P.frame(0, 0, W, H, 'rgba(255,200,110,0.35)');
    P.corners(1, 1, W - 2, H - 2, AMB_D, 8);
    P.text(this.label(this.spot), 8, 6, AMB, 16);
    const sub = this.spot === 'back' ? (p.worn.get('back') ? itemName(p.worn.get('back')!) : '') : this.spot.startsWith('pocket') ? 'what you carry on you' : this.spot.startsWith('hand') ? 'held · gloves' : 'worn';
    P.text(P.fit(sub.toUpperCase(), W - 16, 8), 8, 24, DIM, 8);
    P.rect(6, 35, W - 12, 1, 'rgba(255,200,110,0.3)');
    const ROW = 18, top = 39, max = 6;
    if (!items.length) P.para(this.spot.startsWith('pocket') ? 'Empty. Drag something here to pocket it.' : this.spot.startsWith('hand') ? 'Nothing in this hand. Drag something here to hold it.' : 'Nothing here.', 10, top + 6, W - 20, DIMM, 8, 10, 3);
    items.slice(0, max).forEach((it, i) => {
      const y = top + i * ROW, on = it === this.item;
      if (on) { P.rect(3, y, W - 6, ROW - 2, 'rgba(255,196,96,0.2)'); P.rect(3, y, 2, ROW - 2, AMB); }
      const where = p.isWorn(it) ? 'WORN' : p.handR === it ? 'R HAND' : p.handL === it ? 'L HAND' : '';
      const hn = hotOf(it);
      const tag = (hn ? '[' + hn + '] ' : '') + where;
      const tw = tag ? P.measure(tag, 8) + 6 : 0;
      P.text(P.fit(itemName(it), W - 40 - tw, 8), 30, y + 2, on ? AMB : BONE, 8);
      P.text(itemWeight(it).toFixed(1) + ' kg', 30, y + 10, DIMM, 6, 'left', '');
      if (tag) P.text(tag, W - 7, y + 5, hn ? AMB : DIM, 8, 'right');
      rows.push({ it, y });
    });
    if (items.length > max) P.text('+ ' + (items.length - max) + ' more', 30, top + max * ROW, DIM, 8);
    // actions for the picked thing
    let by = H - 50;
    const add = (id: string, label: string, on = false) => {
      const w = P.measure(label, 8) + 12;
      if (btns.length && btns[btns.length - 1].x + btns[btns.length - 1].w + w + 4 > W - 6) by += 17;
      const x = btns.length && btns[btns.length - 1].y === by ? btns[btns.length - 1].x + btns[btns.length - 1].w + 4 : 7;
      btns.push({ id, label, x, y: by, w, h: 14, on });
    };
    const it = this.item;
    if (this.spot === 'back') add('openpack', 'OPEN THE PACK');
    if (it) {
      const d = itemDef(it.key);
      const held = p.handR === it || p.handL === it, worn = p.isWorn(it);
      if (worn && !(d.bag && it === p.worn.get('back')) && it.key !== 'bailiff_band') add('off', 'TAKE OFF');
      if (!worn && (d.clothing || (d.bag && d.bag.slot !== 'hand'))) add('wear', 'WEAR');
      if (!worn) { if (p.handR !== it) add('holdR', 'HOLD R'); if (p.handL !== it) add('holdL', 'HOLD L'); }
      if (held || (!worn && this.spot !== 'back')) add('away', 'PUT IN PACK');
      if (!worn) add('drop', 'DROP');
    }
    P.rect(6, H - 54, W - 12, 1, 'rgba(255,200,110,0.25)');
    for (const b of btns) { P.rect(b.x, b.y, b.w, b.h, 'rgba(255,190,90,0.22)'); P.frame(b.x, b.y, b.w, b.h, AMB_D); P.text(b.label, b.x + b.w / 2, b.y + 3, AMB, 8, 'center'); }
    // the hotbar row
    const hy = H - 15;
    P.text('HOTBAR', 7, hy + 2, it ? DIM : DIMM, 8);
    const hb = hotSlots(p);
    for (let i = 0; i < HOT_N; i++) {
      const x = 52 + i * 20, mine = !!it && hotOf(it) === i + 1;
      P.rect(x, hy, 16, 12, mine ? 'rgba(255,196,96,0.45)' : hb[i] ? 'rgba(255,196,96,0.14)' : 'rgba(255,255,255,0.05)');
      P.frame(x, hy, 16, 12, mine ? AMB : AMB_D);
      P.text(String(i + 1), x + 8, hy + 2, mine ? '#1a140a' : it ? AMB : DIM, 8, 'center', mine ? '' : undefined);
      if (it) btns.push({ id: 'hot' + (i + 1), label: '', x, y: hy, w: 16, h: 12 });
    }
    if (this.flash) P.text(P.fit(this.flash, W - 14, 8), 7, H - 66, OKC, 8);
    P.commit();
    // the real things, beside their rows
    for (const r of this.rowObjs) { this.sheetModels.remove(r.o.outer); }
    this.rowObjs = rows.map((r) => {
      const o = makeItemObj(r.it.key);
      fitItemObj(o, 0, 0.075, 0.075, 0.075, 1.6);
      this.sheetModels.add(o.outer);
      return { o, it: r.it };
    });
  }

  private drawTitle(p: Player) {
    const P = this.title, W = P.w;
    P.clear();
    P.grad(0, 0, W, P.h, 'rgba(30,24,16,0.75)', 'rgba(30,24,16,0)', false);
    P.rect(0, 0, 2, P.h, AMB);
    const unit = String((p as any).prisonerNo ?? '').replace(/^\D*/, '') || '0000';
    P.text('INSPECT YOURSELF', 7, 3, AMB, 16);
    P.text('UNIT ' + unit + '  ·  LOAD ' + p.carriedWeight().toFixed(1) + ' KG  ·  ' + (isTouchMode() ? 'TAP HERE TO CLOSE' : 'O CLOSE'), 7, 21, DIM, 8);
    P.commit();
  }

  // ================================================================ input
  private ndc(x: number, y: number) { return new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1); }
  private plateHit(x: number, y: number): { kind: 'row' | 'btn'; i: number; id?: string } | 'sheet' | null {
    this.rc.setFromCamera(this.ndc(x, y), fpCamera());
    const h = this.rc.intersectObject(this.sheet.mesh, false)[0];
    if (!h?.uv) return null;
    const u = h.uv.x * this.sheet.w, v = (1 - h.uv.y) * this.sheet.h;
    const b = this.btns.find((q) => u >= q.x && u <= q.x + q.w && v >= q.y && v <= q.y + q.h);
    if (b) return { kind: 'btn', i: 0, id: b.id };
    const r = this.rows.findIndex((q) => v >= q.y && v <= q.y + 16 && u > 3 && u < this.sheet.w - 3);
    if (r >= 0) return { kind: 'row', i: r };
    return 'sheet';
  }
  private sockAt(x: number, y: number): number {
    this.rc.setFromCamera(this.ndc(x, y), fpCamera());
    const h = this.rc.intersectObjects(this.sockets.map((s) => s.base), false)[0];
    if (h) return h.object.userData.sock as number;
    // generous: anything close to a socket on screen
    let best = -1, bd = 34;
    this.sockets.forEach((s, i) => { s.root.getWorldPosition(this.v).project(fpCamera()); const sx = (this.v.x + 1) / 2 * window.innerWidth, sy = (1 - this.v.y) / 2 * window.innerHeight; const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  private spotAt(x: number, y: number, r = 26): SpotId | null {
    let best: SpotId | null = null, bd = r;
    for (const [id, mk] of this.markers) { if (mk.w < 0.35) continue; const d = Math.hypot(mk.scr.x - x, mk.scr.y - y); if (d < bd) { bd = d; best = id; } }
    return best;
  }

  private onKey(e: KeyboardEvent) {
    if (G.input?.textFocus) return;
    if (!this.open) {
      if (e.code !== 'KeyO' || e.repeat || e.ctrlKey || e.metaKey) return;
      const g: any = G;
      if (g.paused || G.ui?.modal || G.ui?.menuEl || G.ui?.readerEl || g.transitioning) return;
      if (fpOwner() && fpOwner() !== 'watch' && fpOwner() !== 'pack') return;
      this.toggle(true);
      if (this.open) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (/^F\d+$/.test(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const p = G.local; if (!p) return;
    switch (e.code) {
      case 'Escape': case 'KeyO': if (!e.repeat) this.close(); break;
      case 'KeyI': if (!e.repeat) this.doAct('openpack'); break;
      case 'ArrowLeft': case 'KeyA': this.yawV -= 2.2; break;
      case 'ArrowRight': case 'KeyD': this.yawV += 2.2; break;
      case 'Tab': case 'ArrowDown': case 'ArrowUp': {
        if (e.repeat) break;
        const vis = SPOTS.filter((s) => this.hasSpot(p, s.id)).map((s) => s.id);
        const i = vis.indexOf(this.spot), d = e.code === 'ArrowUp' || e.shiftKey ? -1 : 1;
        this.pickSpot(vis[(i + d + vis.length) % vis.length]);
        break;
      }
      default: {
        const m = /^Digit([1-6])$/.exec(e.code);
        if (m && this.item && !e.repeat) this.doAct('hot' + m[1]);
      }
    }
  }
  private pickSpot(s: SpotId) {
    if (this.spot !== s) { this.spot = s; this.item = null; this.flash = ''; this.sheetSig = ''; G.audio?.ui?.('hover', 0.35); }
    // turn the body so the spot faces you (the pack is on the back)
    const want = s === 'back' ? Math.PI + 0.3 : s === 'pocketL' || s === 'handL' || s === 'wrist' ? -0.7 : s === 'pocketR' || s === 'handR' || s === 'belt' ? 0.7 : 0.35;
    let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yawV = d * 3.2;
  }
  private onDown(e: PointerEvent) {
    if (!this.open) return;
    // the touch buttons (SELF closes it again) keep their own taps
    if ((e.target as Element | null)?.closest?.('.nc-btn')) return;
    e.preventDefault(); e.stopPropagation();
    if (this.ptr) return;
    const x = e.clientX, y = e.clientY;
    const base = { id: e.pointerId, x0: x, y0: y, x, y, lastX: x, lastT: performance.now(), fromSock: -1, it: null as Item | null };
    // the close tag
    this.rc.setFromCamera(this.ndc(x, y), fpCamera());
    if (this.rc.intersectObject(this.title.mesh, false).length) { this.close(); return; }
    const ph = this.plateHit(x, y);
    if (ph && ph !== 'sheet' && ph.kind === 'btn') { this.doAct(ph.id!); this.ptr = { ...base, mode: 'none' }; return; }
    if (ph && ph !== 'sheet' && ph.kind === 'row') { const it = this.rows[ph.i].it; this.ptr = { ...base, mode: 'pending', it }; return; }
    if (ph === 'sheet') { this.ptr = { ...base, mode: 'none' }; return; }
    const sk = this.sockAt(x, y);
    const p = G.local;
    if (sk >= 0 && p) { const it = hotSlots(p)[sk]; this.ptr = { ...base, mode: it ? 'pending' : 'none', it, fromSock: sk }; if (!it && this.item) this.doAct('hot' + (sk + 1)); return; }
    const sp = this.spotAt(x, y);
    if (sp) { this.pickSpot(sp); this.ptr = { ...base, mode: 'none' }; return; }
    this.ptr = { ...base, mode: 'turn' };
  }
  private onMove(e: PointerEvent) {
    if (!this.open) return;
    const q = this.ptr;
    if (!q) {
      if (isTouchMode()) return;
      const sp = this.spotAt(e.clientX, e.clientY), sk = this.sockAt(e.clientX, e.clientY);
      this.hoverSpot = sp; this.hoverSock = sk;
      const ph = this.plateHit(e.clientX, e.clientY);
      document.body.style.cursor = sp || sk >= 0 || (ph && ph !== 'sheet') ? 'pointer' : 'grab';
      return;
    }
    if (e.pointerId !== q.id) return;
    e.preventDefault(); e.stopPropagation();
    q.x = e.clientX; q.y = e.clientY;
    if (q.mode === 'turn') {
      const now = performance.now(), dx = q.x - q.lastX, dts = Math.max(1, now - q.lastT) / 1000;
      this.yaw += dx * 0.012;
      this.yawV = this.yawV * 0.6 + (dx * 0.012 / dts) * 0.4;
      q.lastX = q.x; q.lastT = now;
      document.body.style.cursor = 'grabbing';
    } else if (q.mode === 'pending' && q.it && Math.hypot(q.x - q.x0, q.y - q.y0) > 7) {
      q.mode = 'drag';
      const o = makeItemObj(q.it.key);
      fitItemObj(o, 0, 0.16, 0.16, 0.16, 2);
      this.g.add(o.outer);
      this.drag = { o, it: q.it, fromSock: q.fromSock, pos: this.planePoint(q.x, q.y), vel: new THREE.Vector3() };
      this.drag.o.outer.position.copy(this.drag.pos);
      this.item = q.it; this.sheetSig = '';
      G.audio?.ui?.('bag_rot', 0.35);
    }
    if (q.mode === 'drag') { this.hoverSock = this.sockAt(q.x, q.y); this.hoverSpot = this.hoverSock >= 0 ? null : this.spotAt(q.x, q.y, 40); }
  }
  private onUp(e: PointerEvent, cancel = false) {
    if (!this.open) return;
    const q = this.ptr; if (!q || e.pointerId !== q.id) return;
    e.preventDefault(); e.stopPropagation();
    this.ptr = null;
    document.body.style.cursor = '';
    const p = G.local; if (!p) return;
    if (q.mode === 'pending' && q.it) {
      // a tap: pick it (on a socket: open the sheet where it lives)
      if (q.fromSock >= 0) this.pickSpot(this.spotOf(p, q.it));
      this.item = this.item === q.it && q.fromSock < 0 ? null : q.it;
      this.sheetSig = ''; G.audio?.ui?.('hover', 0.3);
      return;
    }
    if (q.mode === 'drag') this.endDrag(!cancel);
  }
  private endDrag(apply: boolean) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    this.g.remove(d.o.outer);
    const p = G.local; if (!p || !apply) return;
    if (this.hoverSock >= 0) { bindHot(p, this.hoverSock + 1, d.it); this.say(itemName(d.it) + ' on ' + (this.hoverSock + 1) + '.'); }
    else if (this.hoverSpot) this.moveTo(p, d.it, this.hoverSpot);
    else if (d.fromSock >= 0) { bindHot(p, d.fromSock + 1, null); this.say('Slot ' + (d.fromSock + 1) + ' cleared.'); }
    this.hoverSock = -1; this.hoverSpot = null;
    this.sheetSig = '';
  }
  /** screen position of a row of the sheet / a hotbar socket / a tag on the body (tests, tutorials) */
  screenOf(what: 'row' | 'sock' | 'spot', i: number | string): [number, number] | null {
    const cam = fpCamera();
    if (what === 'row') {
      const r = this.rows[i as number]; if (!r) return null;
      const st = this.sheet.mesh.scale.x / this.sheet.w;
      this.v.set((-this.sheet.w / 2 + 60) * st, (this.sheet.h / 2 - r.y - 8) * st, 0).applyMatrix4(this.sheet.mesh.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(1 / this.sheet.mesh.scale.x, 1 / this.sheet.mesh.scale.y, 1)));
    } else if (what === 'sock') { const s = this.sockets[i as number]; if (!s) return null; s.root.getWorldPosition(this.v); }
    else { const m = this.markers.get(i as SpotId); return m ? [m.scr.x, m.scr.y] : null; }
    this.v.project(cam);
    return [(this.v.x + 1) / 2 * window.innerWidth, (1 - this.v.y) / 2 * window.innerHeight];
  }
  private spotOf(p: Player, it: Item): SpotId {
    if (p.handL === it) return 'handL';
    if (p.handR === it) return 'handR';
    const ws = p.wornSlot(it);
    if (ws) return SPOTS.find((s) => s.slots?.includes(ws))?.id ?? 'torso';
    const c = p.containerOf(it);
    if (c === p.inv) { const r = regionOf(p, it); const sd = pocketSide(r); return sd === 'L' ? 'pocketL' : sd === 'C' && r ? 'pocketC' : 'pocketR'; }
    if (c && c === p.worn.get('belt')?.inv) return 'belt';
    return 'back';
  }
  private planePoint(x: number, y: number): THREE.Vector3 {
    this.rc.setFromCamera(this.ndc(x, y), fpCamera());
    const r = this.rc.ray, z = -D + 0.7;
    const t = (z - r.origin.z) / r.direction.z;
    return r.origin.clone().addScaledVector(r.direction, t);
  }

  // ================================================================ frame
  private frame(dt: number) {
    if (!this.built || (!this.open && !this.closing && this.show <= 0)) return;
    const p = G.local;
    if (this.open && (!p || p.body.dead || fpOwner() !== 'self')) { this.close(true); return; }
    dt = Math.min(dt, 0.05);
    this.t += dt;
    PLATE_T.value = performance.now() / 1000;
    this.show = Math.max(0, Math.min(1, this.show + (this.open ? dt / 0.45 : -dt / 0.28)));
    if (!this.open && this.show <= 0) { this.closing = false; fpRelease('self'); return; }
    if (!p) return;
    const e = this.show * this.show * (3 - 2 * this.show);
    const cam = fpCamera(), asp = cam.aspect;
    const hh = Math.tan((cam.fov * Math.PI) / 360) * D, hw = hh * asp;
    const wide = asp >= 1.15;
    this.back.scale.set(hw * 5, hh * 5, 1);
    (this.back.material as THREE.MeshBasicMaterial).opacity = e * 0.9;
    // the body on its turntable
    this.ensureRig(p);
    const s = (wide ? 1.42 : 1.0) * hh / 1.8;
    const bx = wide ? -0.2 * hw : 0, fy = wide ? -0.62 * hh : -0.2 * hh;
    this.pivot.position.set(bx, fy - (1 - e) * 0.08, -D);
    this.pivot.scale.setScalar(s);
    if (!this.ptr || this.ptr.mode !== 'turn') { this.yaw += this.yawV * dt; this.yawV *= Math.exp(-dt * 3.2); }
    this.pivot.rotation.y = this.yaw;
    if (this.rig) this.rig.update(dt);
    // the sheet
    this.drawSheet(p);
    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) || this.t <= dt) this.drawTitle(p);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash = ''; this.sheetSig = ''; } }
    const sw = wide ? 0.6 * hw : 1.0 * hw;
    const sx = wide ? 0.56 * hw : 0.45 * hw, sy = wide ? 0.04 * hh : -0.45 * hh;
    const st = sw / this.sheet.w;
    this.sheet.scaleTo(st);
    this.sheet.mesh.position.set(sx, sy + Math.sin(this.t * 0.8) * 0.005, -D + 0.25);
    this.sheet.mesh.rotation.set(0, wide ? -0.22 : 0, 0);
    this.sheet.show = Math.max(0, (e - 0.2) / 0.8);
    this.title.scaleTo((wide ? 0.62 : 1.1) * hw / this.title.w);
    this.title.mesh.position.set(wide ? -0.6 * hw : -0.4 * hw, 0.84 * hh, -D + 0.1);
    this.title.show = e;
    // the models beside the rows follow the sheet
    this.sheetModels.position.copy(this.sheet.mesh.position); this.sheetModels.rotation.copy(this.sheet.mesh.rotation);
    this.sheetModels.visible = this.sheet.mat.uniforms.uShow.value > 0.9;
    for (let i = 0; i < this.rowObjs.length; i++) {
      const r = this.rows[i], o = this.rowObjs[i].o; if (!r) continue;
      o.outer.position.set((-this.sheet.w / 2 + 16) * st, (this.sheet.h / 2 - r.y - 8) * st, 0.04);
      o.outer.rotation.y = this.t * 0.8 + i;
    }
    // markers
    this.placeMarkers(p, e, hw, hh);
    // the hotbar
    this.placeHotbar(p, e, hw, hh, wide);
    // the thing being dragged swings after the pointer
    const dg = this.drag;
    if (dg && this.ptr) {
      const goal = this.planePoint(this.ptr.x, this.ptr.y);
      const k = 1 - Math.exp(-dt * 18);
      const prev = this.v2.copy(dg.pos);
      dg.pos.lerp(goal, k);
      dg.vel.copy(dg.pos).sub(prev).divideScalar(Math.max(1e-3, dt));
      dg.o.outer.position.copy(dg.pos);
      dg.o.outer.rotation.set(THREE.MathUtils.clamp(dg.vel.y * 0.6, -0.6, 0.6), this.t * 1.2, THREE.MathUtils.clamp(-dg.vel.x * 0.6, -0.7, 0.7));
    }
  }

  private ensureRig(p: Player) {
    let out: any;
    try { out = p.computeOutfit(); } catch { out = {}; }
    const sig = JSON.stringify(out);
    if (!this.rig) {
      try {
        this.rig = createPreviewRig(p.app, out, { outline: false });
        this.rig.root.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
        this.pivot.add(this.rig.root);
        this.outfitSig = sig;
      } catch (e) { console.warn('selfInspect rig', e); return; }
    } else if (sig !== this.outfitSig) { this.outfitSig = sig; this.rig.setOutfit(out); }
    const hs = (p.handR?.key ?? '') + '|' + (p.handL && p.handL !== p.handR ? p.handL.key : '');
    if (hs !== this.heldSig && this.rig) {
      this.heldSig = hs;
      const mk = (k: string) => { if (!k) return null; const o = makeItemObj(k); fitItemObj(o, 0, 0.16, 0.16, 0.16, 1); return o.outer; };
      this.rig.hold('R', mk(p.handR?.key ?? ''));
      this.rig.hold('L', mk(p.handL && p.handL !== p.handR ? p.handL.key : ''));
    }
  }

  private placeMarkers(p: Player, e: number, hw: number, hh: number) {
    const rig = this.rig; if (!rig) return;
    const cam = fpCamera();
    rig.root.updateMatrixWorld(true);
    const center = this.v2.set(0, 0, 0); this.pivot.getWorldPosition(center);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.pivot.quaternion);
    const s = this.pivot.scale.x;
    for (const def of SPOTS) {
      const mk = this.markers.get(def.id)!;
      const has = this.hasSpot(p, def.id);
      const a = rig.j[def.a as keyof typeof rig.j].getWorldPosition(mk.pos);
      if (def.b) { const b = rig.j[def.b as keyof typeof rig.j].getWorldPosition(this.v); a.lerp(b, def.t ?? 0.5); }
      this.v.set(def.off[0], def.off[1], def.off[2]).multiplyScalar(s).applyQuaternion(this.pivot.quaternion);
      a.add(this.v);
      // facing: front / back by the turntable, sides by where it is from the body's axis
      let n: number;
      if (def.face === 'front') n = fwd.z; else if (def.face === 'back') n = -fwd.z;
      else { const dx = a.x - center.x, dz = a.z - center.z; const l = Math.hypot(dx, dz) || 1; n = (dz / l) * 0.8 + 0.35; }
      const w = has ? THREE.MathUtils.smoothstep(n, -0.25, 0.25) : 0;
      mk.w += (w - mk.w) * 0.25;
      const hot = this.hoverSpot === def.id || this.spot === def.id;
      const pulse = 1 + Math.sin(this.t * 4 + def.a.length) * 0.12;
      mk.m.position.copy(a);
      mk.m.quaternion.copy(cam.quaternion);
      mk.m.scale.setScalar((hot ? 1.5 : 1) * pulse * (0.6 + 0.4 * e) * (hh / 0.62));
      mk.m.visible = mk.w > 0.03 && e > 0.3;
      (mk.ring.material as THREE.MeshBasicMaterial).opacity = mk.w * e * (hot ? 1 : 0.75);
      (mk.ring.material as THREE.MeshBasicMaterial).color.setHex(this.spot === def.id ? 0xffe0a0 : 0xffb848);
      (mk.dot.material as THREE.MeshBasicMaterial).opacity = mk.w * e;
      // screen position for picking
      this.v.copy(a).project(cam);
      mk.scr.set((this.v.x + 1) / 2 * window.innerWidth, (1 - this.v.y) / 2 * window.innerHeight);
      // its label, outward from the body
      const items = def.id === 'back' ? (this.packC(p)?.items.length ?? 0) : this.itemsAt(p, def.id).length;
      const name = def.id === 'back' || def.id === 'belt' || def.id === 'wrist' ? (p.worn.get(def.slots![0] as any) ? itemName(p.worn.get(def.slots![0] as any)!).toUpperCase() : def.label) : def.label;
      const key = name + items + (hot ? 1 : 0);
      const L = mk.label;
      if (key !== mk.key) {
        mk.key = key;
        L.clear();
        const txt = L.fit(def.label === name ? name : def.label, 64, 8) + (items && def.id !== 'wrist' && def.id !== 'belt' ? '  ' + items : '');
        const right = a.x >= center.x;
        L.rect(right ? 0 : L.w - 2, 2, 2, 8, hot ? AMB : AMB_D);
        L.text(txt, right ? 5 : L.w - 5, 2, hot ? AMB : BONE, 8, right ? 'left' : 'right');
        L.commit();
      }
      const right = a.x >= center.x;
      const lt = (0.34 * hh / 0.62) / L.w * 0.9;
      L.scaleTo(lt);
      L.mesh.position.set(a.x + (right ? 1 : -1) * (L.w / 2 * lt + 0.03), a.y, a.z + 0.02);
      L.show = mk.w * e * (hot || this.hoverSpot === null ? 1 : 0.6);
      L.mesh.visible = mk.m.visible && hot && mk.w > 0.4;
    }
    void hw;
  }

  private placeHotbar(p: Player, e: number, hw: number, hh: number, wide: boolean) {
    const z = -D + 0.75, hz = hh * ((-z) / D);
    this.hotRow.position.set(wide ? -0.2 * hw * ((-z) / D) : 0, -0.8 * hz + (1 - e) * -0.1, z);
    this.hotRow.rotation.set(0.5, 0, 0);
    const sc = Math.min(1, (wide ? 0.95 : 0.85) * hw * ((-z) / D) / 0.45);
    this.hotRow.scale.setScalar(sc);
    const hb = hotSlots(p);
    this.sockets.forEach((s, i) => {
      const it = hb[i];
      const key = it ? it.uid + ':' + it.key : '';
      if (key !== s.key) {
        s.key = key;
        if (s.obj) s.root.remove(s.obj.outer);
        s.obj = null;
        if (it) { s.obj = makeItemObj(it.key); fitItemObj(s.obj, 0, 0.08, 0.08, 0.08, 1.8); s.root.add(s.obj.outer); }
      }
      if (s.obj) { s.obj.outer.position.set(0, 0.045 + Math.sin(this.t * 2 + i) * 0.004, 0); s.obj.outer.rotation.y = this.t * 0.9 + i; s.obj.outer.visible = !(this.drag && this.drag.fromSock === i); }
      const hot = this.hoverSock === i, mine = !!this.item && hb[i] === this.item;
      const gm = s.glow.material as THREE.MeshBasicMaterial;
      gm.opacity = (hot ? 0.95 : mine ? 0.8 : it ? 0.5 : 0.22) * e;
      s.root.position.y = hot ? 0.01 : 0;
    });
  }
}

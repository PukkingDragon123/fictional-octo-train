// THE DELIVERY DOCK (round 27): where the freight line from the presses comes up into the lab hub (the codex
// archive's right side). The valuables the units freighted home (src/game/economy/freight.ts) stand on it as
// themselves, enlarged on a pallet like goods for an auction, until the lattice's hopper takes them for a node
// (src/game/nodeCost.ts). New freight comes up through the floor: the hatch's leaves drop open, the platform rises
// with its load under a turning amber beacon. A board on the post counts what is waiting by class (icons, numbers).
// The transport upgrades (the lattice's Transport branch) change it: the hand cart parks beside it, the freight
// lift's cage stands round the platform, the courier drone waits on its pad, and with the armoured van the load
// comes up in a plate-steel strongbox.
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import type { Hot } from '../monitor/stage';
import { FacetBuilder, at, cbox, prism, lathe, bolt, C, gameSound } from '../monitor/props';
import { dock, dockUnseen, markDockSeen, onFreight, VAL_CLASS, VAL_KEYS, dockCount } from '../../../game/economy/freight';
import { facRank } from '../../../game/facilityTree';
import { bus } from '../../../core/events';
import { itemModel } from '../front/build/props3d';
import { hubModel } from './hubModels';
import { itemIcon } from '../../icons';
import { bitText } from '../../../gfx/bitfont';

const SHOW = 16;
const PAL = { w: 1.0, d: 0.8, top: 0.3 };

export class DeliveryDock {
  group = new THREE.Group();
  /** the lift's platform: the pallet, its load (it sinks and rises) */
  private plat = new THREE.Group();
  private goods = new THREE.Group();
  private leaves: THREE.Object3D[] = [];
  private beacon = new THREE.Group(); private beaconL = new THREE.PointLight(0xffa020, 0, 3, 1.6);
  private tiers = new Map<string, THREE.Object3D>();
  private box: THREE.Object3D;
  private crate: THREE.Object3D;
  private board: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; icons: Map<string, HTMLImageElement> };
  private sig = '';
  /** the arrival: 0 idle; else seconds in */
  private arr = 0;
  private spin = 0;
  private kick = 0;
  constructor(private mats: FMats, hots: Hot[], spot: { x: number; z: number; ry: number }) {
    this.group.name = 'deliveryDock';
    this.group.position.set(spot.x, 0, spot.z); this.group.rotation.y = spot.ry;
    const b = new FacetBuilder();
    // the shaft's mouth in the floor: a hazard frame, a steel kerb, the dark pit
    b.add('hazard', cbox(1.5, 0.02, 0.1, 0.004), 0xffffff, at(0, 0.01, -0.6), { rep: 0.2 });
    b.add('hazard', cbox(1.5, 0.02, 0.1, 0.004), 0xffffff, at(0, 0.01, 0.6), { rep: 0.2 });
    b.add('hazard', cbox(0.1, 0.02, 1.3, 0.004), 0xffffff, at(-0.7, 0.01, 0), { rep: 0.2 });
    b.add('hazard', cbox(0.1, 0.02, 1.3, 0.004), 0xffffff, at(0.7, 0.01, 0), { rep: 0.2 });
    b.add('rubber', cbox(1.3, 0.01, 1.1, 0.002), 0x050505, at(0, 0.002, 0));
    for (const [x, z] of [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]]) b.add('chrome', bolt(0.016, 0.012), C.steel, at(x, 0.022, z));
    // the post: a steel upright with the beacon on top, the count board on it, a call button box
    b.add('metal', cbox(0.08, 1.9, 0.08, 0.01), 0x4a5052, at(-0.95, 0.95, 0.55));
    b.add('metal', cbox(0.2, 0.06, 0.2, 0.01), 0x2a2e30, at(-0.95, 0.03, 0.55));
    b.add('enamel', cbox(0.5, 0.36, 0.06, 0.02), C.olive, at(-0.95, 1.36, 0.62));
    b.add('rubber', cbox(0.44, 0.3, 0.01, 0.003), 0x080808, at(-0.95, 1.36, 0.653));
    b.add('paint', cbox(0.12, 0.18, 0.08, 0.01), 0xd8a030, at(-0.95, 0.95, 0.61));
    b.add('lamp', prism(0.022, 0.02, 10), 0x40ff60, at(-0.95, 0.98, 0.655, Math.PI / 2));
    this.group.add(b.build(mats));
    // the hatch's two leaves (hinged on the long edges, they drop into the shaft while the platform comes up)
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.64, 0.012, 0);
      const lb = new FacetBuilder();
      lb.add('metal', cbox(0.64, 0.02, 1.08, 0.004), 0x6a6e70, at(-s * 0.32, 0, 0));
      for (let i = 0; i < 6; i++) lb.add('metal', cbox(0.6, 0.004, 0.02, 0.001), 0x8a9094, at(-s * 0.32, 0.012, -0.45 + i * 0.18));
      pivot.add(lb.build(mats));
      this.group.add(pivot); this.leaves.push(pivot);
    }
    // the platform: a steel deck, a pallet, the crate (an open-topped slatted crate; the strongbox with the van)
    const pb = new FacetBuilder();
    pb.add('metal', cbox(1.24, 0.06, 1.04, 0.01), 0x5a6062, at(0, 0.05, 0));
    pb.add('wood', cbox(PAL.w, 0.12, PAL.d, 0.01), 0x9a7a4a, at(0, 0.14, 0));
    for (let i = 0; i < 4; i++) pb.add('wood', cbox(PAL.w, 0.02, 0.1, 0.004), 0xb08a52, at(0, 0.21, -0.3 + i * 0.2));
    this.plat.add(pb.build(mats));
    this.crate = this.crateModel(false); this.box = this.crateModel(true);
    this.plat.add(this.crate, this.box, this.goods);
    this.group.add(this.plat);
    // the beacon
    const bb = new FacetBuilder();
    bb.add('metal', lathe([[0, 0], [0.07, 0], [0.07, 0.03], [0, 0.03]], 10), 0x2a2e30, at(0, 0, 0));
    bb.add('lamp', lathe([[0, 0], [0.055, 0], [0.05, 0.08], [0.03, 0.11], [0, 0.115]], 10), 0xffa020, at(0, 0.03, 0));
    this.beacon.add(bb.build(mats));
    this.beacon.position.set(-0.95, 1.9, 0.55);
    this.beaconL.position.set(-0.95, 2.05, 0.55);
    this.group.add(this.beacon, this.beaconL);
    // the board: icons and counts in amber
    const cv = document.createElement('canvas'); cv.width = 176; cv.height = 120;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.286), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(-0.95, 1.36, 0.66); scr.userData.noGlow = true;
    this.group.add(scr);
    this.board = { cv, tex, icons: new Map() };
    hots.push({ key: 'dock', objs: [this.plat, scr], label: '', press: () => this.rattle() });
    onFreight(() => this.sync());
    bus.on('researchUnlocked', () => this.sync());
    this.sync();
  }
  private crateModel(armoured: boolean): THREE.Object3D {
    const b = new FacetBuilder(), y = 0.22, w = PAL.w - 0.04, d = PAL.d - 0.04, h = 0.1;
    if (armoured) {
      for (const [x, z, sx, sz] of [[0, -d / 2, w, 0.03], [0, d / 2, w, 0.03], [-w / 2, 0, 0.03, d], [w / 2, 0, 0.03, d]] as [number, number, number, number][]) b.add('paint', cbox(sx, h, sz, 0.006), 0x4e6a46, at(x, y + h / 2, z), { rep: 0.3 });
      for (let i = 0; i < 8; i++) b.add('chrome', bolt(0.01, 0.008), C.steel, at(-w / 2 + 0.06 + i * (w - 0.12) / 7, y + h - 0.03, d / 2 + 0.016, Math.PI / 2));
      b.add('hazard', cbox(w + 0.006, 0.04, d + 0.006, 0.003), 0xffffff, at(0, y + 0.03, 0), { rep: 0.16 });
    } else {
      for (const [x, z, sx, sz] of [[0, -d / 2, w, 0.025], [0, d / 2, w, 0.025], [-w / 2, 0, 0.025, d], [w / 2, 0, 0.025, d]] as [number, number, number, number][]) b.add('wood', cbox(sx, 0.08, sz, 0.004), 0xb08a52, at(x, y + 0.04, z));
      b.add('paint', cbox(w + 0.004, 0.025, d + 0.004, 0.003), 0x3a5a3a, at(0, y + 0.05, 0));
    }
    return b.build(this.mats);
  }
  /** the goods on the pallet, the tiers round it, the board */
  sync() {
    const items = dock();
    const lift = facRank('ft_lift') > 0, van = facRank('ft_van') > 0;
    this.crate.visible = !van; this.box.visible = van;
    // the transport tiers
    const want: [string, boolean, [number, number, number, number]][] = [
      ['cart', facRank('ft_cart') > 0, [1.3, 0.35, -0.4, 1]],
      ['lift', lift, [0, 0, 0, 1]],
      ['drone', facRank('ft_drone') > 0, [1.15, -1.0, 0.3, 0.9]],
    ];
    for (const [k, on, [x, z, ry, s]] of want) {
      let o = this.tiers.get(k);
      if (on && !o) { o = hubModel(k, this.mats); o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); this.group.add(o); this.tiers.set(k, o); }
      if (o) o.visible = on;
    }
    const sig = items.map((d) => d.k).join() + ':' + van;
    if (sig !== this.sig) {
      this.sig = sig;
      this.goods.clear();
      const shown = items.slice(-SHOW);
      const cols = 4, rows = 2;
      shown.forEach((d, i) => {
        const m = itemModel(d.k);
        if (!m) return;
        const g = new THREE.Group(); g.add(m);
        const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3()), c0 = box.getCenter(new THREE.Vector3());
        m.position.set(-c0.x, -box.min.y, -c0.z);
        const k = 0.24 / Math.max(1e-3, sz.x, sz.y, sz.z);
        g.scale.setScalar(k);
        const layer = Math.floor(i / (cols * rows)), j = i % (cols * rows);
        g.position.set(-0.33 + (j % cols) * 0.22, 0.23 + layer * 0.16, -0.17 + Math.floor(j / cols) * 0.32);
        g.rotation.y = ((i * 1.7) % 1.2) - 0.6;
        g.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.castShadow = true; });
        this.goods.add(g);
      });
    }
    this.drawBoard();
  }
  private drawBoard() {
    const { cv, tex, icons } = this.board, c = cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0a0602'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(255,160,40,0.07)'; for (let x = 0; x < cv.width; x += 4) c.fillRect(x, 0, 1, cv.height);
    VAL_KEYS.forEach((k, i) => {
      const y = 6 + i * 38;
      let img = icons.get(k);
      if (!img) { img = new Image(); icons.set(k, img); img.onload = () => this.drawBoard(); try { img.src = itemIcon(VAL_CLASS[k].icon, '', 32); } catch { /* no icon */ } }
      if (img.complete && img.naturalWidth) c.drawImage(img, 10, y, 32, 32);
      const n = dockCount(k);
      bitText(c, String(n).padStart(2, '0'), 160, y + 6, { color: n ? '#ffc040' : '#5a3a14', outline: null, scale: 3, align: 'right' });
    });
    c.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < cv.height; y += 2) c.fillRect(0, y, cv.width, 1);
    tex.needsUpdate = true;
  }
  /** a press on the dock: the platform jolts, the beacon turns once, the call button clunks */
  private rattle() { this.kick = 1; this.spin = Math.max(this.spin, 1.2); gameSound('metal_clank', 0.5); this.onPress?.(); }
  /** the room's side of a press (title.ts: the camera steps up to the dock) */
  onPress?: () => void;
  /** new freight has come up the seam (title.ts calls it when the room is in view) */
  arrive() {
    if (this.arr > 0) return;
    this.arr = 0.001;
    this.spin = 4;
    gameSound('cy_servo', 0.6); setTimeout(() => gameSound('cy_powerup', 0.5), 500);
    markDockSeen();
  }
  get waiting() { return dockUnseen() > 0; }
  get busy() { return this.arr > 0; }
  update(dt: number, t: number) {
    // the arrival: the leaves drop, the platform comes up from 2 m below, the leaves close behind it... no: they stay
    // down until it is level, then fold back flush under it
    let lift = 0, open = 0;
    if (this.arr > 0) {
      this.arr += dt;
      const a = this.arr;
      open = Math.min(1, a / 0.35);
      lift = a < 0.35 ? -2.2 : a < 2.0 ? -2.2 * (1 - easeOut((a - 0.35) / 1.65)) : 0;
      if (a > 2.0 && a < 2.05) gameSound('cy_thunk', 0.6);
      if (a > 2.0) open = Math.max(0, 1 - (a - 2.0) / 0.4);
      if (a > 2.6) this.arr = 0;
    }
    this.kick = Math.max(0, this.kick - dt * 5);
    // (on the freight lift's deck once it is built)
    this.plat.position.y = lift + (this.tiers.get('lift')?.visible ? 0.34 : 0) + Math.sin(t * 40) * 0.006 * this.kick;
    this.leaves.forEach((l, i) => { l.rotation.z = (i ? -1 : 1) * open * 1.45; });
    this.spin = Math.max(0, this.spin - dt);
    this.beacon.rotation.y += dt * (this.spin > 0 ? 9 : 0);
    this.beaconL.intensity = this.spin > 0 ? 2.4 + Math.sin(t * 18) * 1.6 : 0;
    // the drone's rotors idle
    const dr = this.tiers.get('drone');
    if (dr?.visible) dr.position.y = Math.sin(t * 1.3) * 0.004;
  }
}
const easeOut = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

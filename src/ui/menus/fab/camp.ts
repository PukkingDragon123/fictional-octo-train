// A FAB MACHINE AT A CAMP (round 20): the filament maker or the printer raised from a blueprint in a run
// (src/game/economy/fabCamp.ts) opens here: the same machine as the lab's (./filament.ts, ./printer.ts)
// on a small stage of its own (the menus' renderer and pixel pipeline, src/ui/menus/monitor/stage.ts):
// a corner of the levels, damp yellow wallpaper and carpet under two fluorescent panels, the machine on
// its skid. At a camp the hopper takes carried scrap as well as the seam's banked matter, and prints are
// set down on the floor beside the machine. Esc (or Back) steps away.
import * as THREE from 'three';
import { MenuStage, type StageRoom, type Hot, type Grade } from '../monitor/stage';
import { facetMats, disposeFacetMats, type FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, slab } from '../monitor/props';
import { iconKey } from '../iconKey';
import { FocusNav } from '../nav';
import { G } from '../../../game/G';
import { op } from '../../../game/ops';
import { createItem, serializeItem } from '../../../items/factory';
import { selfThought } from '../../../game/debt/voice';
import type { Player } from '../../../entities/player';
import type { TileObject } from '../../../world/zone';
import { FilamentMaker } from './filament';
import { Printer3D } from './printer';
import { openPrintConsole, type PrintConsole } from './console';
import { humFrom, damp, type FabCtx, type Pose } from './kit';

type Kind = 'filament' | 'printer';
let open: { close: () => void } | null = null;
export const campFabOpen = () => !!open;

class CampRoom implements StageRoom {
  id = 'fabcamp';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.03, 30);
  hots: Hot[] = [];
  grade: Grade = { exposure: 1.45, lift: [0.86, 0.9, 1.0], gain: [1.08, 1.02, 0.9], vig: 0.55, sat: 1.1, contrast: 1.12, haze: 0.3, hazeColor: 0x7a7050, ao: 0.8, bounce: 0.3 };
  goal: () => Pose | null = () => null;
  tick: (dt: number, t: number) => void = () => {};
  private camP = new THREE.Vector3(); private camL = new THREE.Vector3(); private camF = 50; snapped = false;
  constructor(public mats: FMats, kind: Kind) {
    const S = this.scene;
    S.background = new THREE.Color(0x0a0906);
    const b = new FacetBuilder();
    const W = kind === 'filament' ? 2.4 : 1.6, BACK = -0.75, FRONT = 3.2, H = 2.7;
    // carpet, wallpaper over a dado, a ceiling of acoustic tiles; a skirting, a damp stain
    slab(b, 'sponge', -W, W, -0.1, 0, BACK, FRONT, 0x9a8a5a, 0.004, 0.5);
    const wall = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'paint', x0, x1, 0, H, z0, z1, 0xb8a866, 0.004, 0.9); slab(b, 'wood', x0, x1, 0, 0.1, z0, z1, 0x8a6a3a, 0.004); };
    wall(-W, W, BACK - 0.15, BACK); wall(-W - 0.15, -W, BACK, FRONT); wall(W, W + 0.15, BACK, FRONT);
    slab(b, 'tile', -W, W, H, H + 0.08, BACK, FRONT, 0xe0d8c0, 0.004, 0.6);
    for (let x = -W + 0.6; x < W; x += 0.6) b.add('metal', cbox(0.02, 0.02, FRONT - BACK, 0.003), 0x8a8478, at(x, H - 0.01, (FRONT + BACK) / 2));
    // two fluorescent panels
    for (const x of [-0.6, 0.6]) { b.add('metal', cbox(0.62, 0.04, 0.62, 0.006), 0xc8c4b8, at(x * (W / 1.6), H - 0.02, 0.6)); b.add('lamp', cbox(0.56, 0.01, 0.56, 0.002), 0xfff8e0, at(x * (W / 1.6), H - 0.045, 0.6)); }
    // a camp's leavings: a crate, a coil of rope, a jerrycan
    b.add('wood', cbox(0.5, 0.4, 0.4, 0.012), 0xa07a46, at(-W + 0.4, 0.2, 1.2, 0, 0.3));
    b.add('paint', cbox(0.22, 0.32, 0.12, 0.02), 0xa82a1a, at(W - 0.35, 0.16, 1.4, 0, -0.4));
    b.add('rubber', prism(0.14, 0.05, 10), 0x8a7a50, at(W - 0.5, 0.025, 2.0));
    S.add(b.build(mats));
    const hemi = new THREE.HemisphereLight(0xfff4d8, 0x5a4a30, 0.85);
    const key = new THREE.SpotLight(0xfff6e0, 16, 7, 0.9, 0.6, 1.2);
    key.position.set(0.4, H - 0.1, 2.0); key.target.position.set(0, 0.8, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
    const top = new THREE.SpotLight(0xf0f4ff, 10, 5, 1.1, 0.7, 1.3);
    top.position.set(0, H - 0.1, 0.4); top.target.position.set(0, 0.5, 0);
    const warm = new THREE.PointLight(0xffd8a0, 1.2, 4, 1.6); warm.position.set(-W + 0.5, 1.6, 1.8);
    S.add(hemi, key, key.target, top, top.target, warm);
  }
  update(dt: number, t: number) {
    this.tick(dt, t);
    const g = this.goal() ?? { pos: new THREE.Vector3(0, 1.6, 2.6), look: new THREE.Vector3(0, 0.9, 0), fov: 50 };
    if (!this.snapped) { this.snapped = true; this.camP.copy(g.pos); this.camL.copy(g.look); this.camF = g.fov; }
    const k = 1 - Math.exp(-dt * 4.5);
    this.camP.lerp(g.pos, k); this.camL.lerp(g.look, k); this.camF = damp(this.camF, g.fov, 4.5, dt);
    this.cam.position.copy(this.camP); this.cam.lookAt(this.camL);
  }
  frame(aspect: number, portrait: boolean) {
    this.cam.aspect = aspect;
    this.cam.fov = portrait ? Math.min(92, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camF / 2)) / aspect)) * 0.95) : this.camF;
    this.cam.updateProjectionMatrix();
  }
}

/** step up to a camp's fab machine (its object o); the unit p feeds it */
export function openCampFab(kind: Kind, o: TileObject, p: Player) {
  open?.close();
  const host = document.createElement('div');
  host.className = 'fab-camp';
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '58', background: '#000' });
  document.body.append(host);
  const stage = new MenuStage(host);
  const mats = facetMats(stage.low);
  const room = new CampRoom(mats, kind);
  const zk = p.zoneKey;
  const au = () => (G as unknown as { audio?: { flat?: (k: string, b: 'sfx', v?: number, r?: number) => AudioBufferSourceNode | null } })?.audio;
  const ctx: FabCtx = {
    mats, hots: room.hots, world: room.scene, lab: false,
    rayAt: (x, y) => stage.rayAt(x, y),
    project: (q) => stage.project(q),
    say: (t) => selfThought(t),
    who: () => p,
    sound: (k, v = 0.6, r = 1) => { try { au()?.flat?.(k, 'sfx', v, r); } catch { /* no audio */ } },
    loop: (k, v = 0.4, r = 1) => { const a = au(); return humFrom(a?.flat?.bind(a), k, v, r); },
    deliver: (keys) => {
      // set down beside the machine, on the floor in front of it
      const cx = o.x + 0.5, cz = o.y + 1.3;
      keys.forEach((k, i) => {
        const a = Math.random() * Math.PI * 2, r = keys.length > 1 ? 0.25 : 0.05;
        setTimeout(() => op('dropFloor', { z: zk, item: serializeItem(createItem(k)), x: cx + Math.cos(a) * r, zz: cz + Math.sin(a) * r, y: 0.3, v: [Math.cos(a) * 0.3, 1.2 + i * 0.15, Math.sin(a) * 0.3] }), 150 + i * 120);
      });
    },
  };
  let console_: PrintConsole | null = null;
  const fm = kind === 'filament' ? new FilamentMaker(ctx) : null;
  const pr = kind === 'printer' ? new Printer3D(ctx) : null;
  room.scene.add((fm ?? pr)!.group);
  room.goal = () => { const port = innerHeight > innerWidth * 1.05; return fm?.camGoal(port) ?? pr?.camGoal(port) ?? null; };
  room.tick = (dt, t) => { fm?.update(dt, t, room.cam); pr?.update(dt, t); };
  stage.add(room); stage.show(room.id);
  const prevModal = G?.ui?.modal ?? null;
  if (G?.ui) G.ui.modal = host;
  if (G?.input) G.input.pointerOverUI = true;
  // a touch screen gets a brass Back key; Esc steps away everywhere
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'absolute', left: '12px', top: '12px', zIndex: '2' });
  host.append(layer);
  if (matchMedia('(pointer: coarse)').matches) layer.append(iconKey('door', 'Back', () => close(), { tone: 'yellow', lamp: 'green', w: 76, h: 56, hint: 'Esc', nameAt: 'top' }));
  const nav = new FocusNav(host, { onBack: () => { if (!(fm?.back() || pr?.back())) close(); }, onArrow: () => true });
  let gone = false;
  function close() {
    if (gone) return;
    gone = true;
    open = null;
    nav.destroy();
    console_?.close(); console_ = null;
    fm?.close(); fm?.dispose(); pr?.close();
    stage.dispose();
    disposeFacetMats();
    host.remove();
    if (G?.ui && G.ui.modal === host) G.ui.modal = prevModal;
    if (G?.input) G.input.pointerOverUI = false;
  }
  open = { close };
  if (import.meta.env.DEV) (window as unknown as { __campFab?: unknown }).__campFab = { fm, pr, room, advance: (sec: number) => { for (let q = 0; q < sec; q += 0.05) room.tick(0.05, q); room.snapped = false; } };
  if (fm) { fm.onClose = () => close(); fm.open(); }
  if (pr) {
    pr.onOpen = () => { console_ = openPrintConsole(pr, ctx, () => { console_ = null; close(); }); };
    pr.onClose = () => { const c = console_; console_ = null; c?.close(); close(); };
    pr.open();
  }
}

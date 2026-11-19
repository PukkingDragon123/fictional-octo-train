// THE FAB BAY (round 20): the control room's front wall, right of the door, turned into a small works:
// the FILAMENT MAKER's line along the wall (./filament.ts) and the PRINTER in the corner by the door
// (./printer.ts), under a caged fluorescent fitting of their own, a cable tray, a yellow walkway line on
// the floor. Both are stations of the lab from zero (src/ui/menus/lab/stations.ts 'filament', 'printer'):
// until they are funded each stands as a build site. The room's words take the camera round to the bay
// ('Fab bay'); press a machine and the camera steps up to it; Esc steps back.
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import type { Hot } from '../monitor/stage';
import { FacetBuilder, at, cbox, prism, tube, C, gameSound, roomAudio } from '../monitor/props';
import { FocusNav } from '../nav';
import { mxButton } from '../../machine/kit';
import { dispatch } from '../../../game/economy/matter';
import { FilamentMaker } from './filament';
import { Printer3D } from './printer';
import { openPrintConsole, type PrintConsole } from './console';
import { humFrom, type FabCtx, type Pose } from './kit';

export interface BaySpot { front: number; W: number; H: number }

export class FabBay {
  group = new THREE.Group();
  fm: FilamentMaker;
  pr: Printer3D;
  /** a machine took the view / gave it back (the room hides its words) */
  onFocus?: (on: boolean) => void;
  project?: (p: THREE.Vector3) => { x: number; y: number } | null;
  rayAt?: (x: number, y: number) => THREE.Ray | null;
  private console: PrintConsole | null = null;
  private layer = document.createElement('div');
  private nav: FocusNav | null = null;
  private lamp: THREE.SpotLight;
  private key: THREE.SpotLight;
  private fill = new THREE.PointLight(0xfff0dc, 1.6, 4.2, 1.5);

  private hots: Hot[];
  constructor(mats: FMats, hots: Hot[], scene: THREE.Scene, S: BaySpot) {
    this.hots = hots;
    const ctx: FabCtx = {
      mats, hots, world: scene, lab: true,
      rayAt: (x, y) => this.rayAt?.(x, y) ?? null,
      project: (p) => this.project?.(p) ?? null,
      say: (t) => { (window as unknown as { __deco?: { guide?: { now?: (t: string) => void } } }).__deco?.guide?.now?.(t); },
      who: () => null,
      sound: (k, v = 0.6, r = 1) => gameSound(k, v, r),
      loop: (k, v = 0.4, r = 1) => { const a = roomAudio(); return humFrom(a?.flat?.bind(a) as never, k, v, r); },
      deliver: (keys) => dispatch(keys),
    };
    this.group.name = 'fabBay';
    // the line along the front wall, its back to the wall (local +Z faces into the room)
    this.fm = new FilamentMaker(ctx);
    this.fm.group.position.set(1.9, 0, S.front - 0.32);
    this.fm.group.rotation.y = Math.PI;
    // the printer in the corner by the door
    this.pr = new Printer3D(ctx);
    this.pr.group.position.set(-0.86, 0, S.front - 0.36);
    this.pr.group.rotation.y = Math.PI;
    this.group.add(this.fm.group, this.pr.group, this.dress(mats, S));
    // the bay's own work light: a caged twin-tube fitting on the wall over the line, a fill by the printer
    // the fitting's own tubes light the line from above (under the fitting, so its body throws no shadow)
    this.lamp = new THREE.SpotLight(0xf0f4ff, 10, 4.5, 1.15, 0.7, 1.2);
    this.lamp.position.set(1.0, S.H - 0.62, S.front - 0.75);
    this.lamp.target.position.set(1.2, 0.5, S.front - 0.2);
    // the room's side: a key from over the floor onto the machines' faces (they face into the room)
    this.key = new THREE.SpotLight(0xfff2e0, 16, 6.5, 0.72, 0.55, 1.1);
    this.key.position.set(0.9, S.H - 0.3, S.front - 2.3);
    this.key.target.position.set(0.9, 0.85, S.front - 0.2);
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024); this.key.shadow.bias = -0.0005;
    this.fill.position.set(-0.6, 1.8, S.front - 1.3);
    this.group.add(this.lamp, this.lamp.target, this.key, this.key.target, this.fill);
    this.fm.onOpen = () => this.opened();
    this.fm.onClose = () => this.closed();
    this.pr.onOpen = () => { this.opened(); this.console = openPrintConsole(this.pr, ctx, () => { this.console = null; this.pr.close(); }); };
    this.pr.onClose = () => { const c = this.console; this.console = null; c?.close(); this.closed(); };
    this.layer.className = 'fab-layer';
    if (import.meta.env.DEV) (window as unknown as { __fab?: FabBay }).__fab = this;
  }
  get active() { return this.fm.active || this.pr.active; }
  /** dev / screenshots: run the machines on for a while (software GL draws a few frames a second) */
  advance(sec: number, cam: THREE.Camera) { for (let s = 0; s < sec; s += 0.05) { this.fm.update(0.05, s, cam); this.pr.update(0.05, s); } }
  /** Dr. Calder steps out of the bay's pictures while it is in view (the guide's aside), and back after */
  private asideOn = false;
  aside(on: boolean) {
    if (on === this.asideOn) return;
    this.asideOn = on;
    const g = (window as unknown as { __deco?: { guide?: { aside?: (p: THREE.Vector3 | null) => void } } }).__deco?.guide;
    g?.aside?.(on ? new THREE.Vector3(-2.25, 0, 0.45) : null);
  }
  /** the stations' groups (the room hides an unbuilt one behind its build site) */
  get filamentGroup() { return this.fm.group; }
  get printerGroup() { return this.pr.group; }

  private opened() {
    if (this.nav) return;
    document.body.append(this.layer);
    if (matchMedia('(pointer: coarse)').matches && !this.layer.firstChild) this.layer.append(mxButton('Back', () => this.back(), { tone: 'yellow', w: 92, h: 40, cls: 'tb-back' }));
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.nav = new FocusNav(this.layer, { onBack: () => this.back(), onArrow: () => true });
    this.onFocus?.(true);
  }
  private closed() {
    if (this.active) return;
    this.nav?.destroy(); this.nav = null;
    this.layer.remove();
    this.onFocus?.(false);
  }
  back(): boolean { return this.pr.back() || this.fm.back(); }
  /** leaving the room: off the machines quietly */
  close() { this.pr.close(); this.fm.close(); }

  camGoal(): Pose | null {
    const port = innerHeight > innerWidth * 1.05;
    return this.fm.camGoal(port) ?? this.pr.camGoal(port);
  }
  update(dt: number, t: number, cam: THREE.Camera, built: { filament: boolean; printer: boolean }, blocked: boolean) {
    this.fm.update(dt, t, cam);
    this.pr.update(dt, t);
    // an unbuilt machine (hidden behind its build site) takes no pointer; nor does any while the lattice or bench is up
    const fOn = built.filament && !blocked && !this.pr.active, pOn = built.printer && !blocked && !this.fm.active;
    for (const h of this.hots) {
      if (h.key.startsWith('fm:') && !fOn) h.off = true;
      if (h.key.startsWith('pr:') && !pOn) h.off = true;
    }
  }

  // ================================================================== the bay's dressing
  private dress(mats: FMats, S: BaySpot): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const z = S.front - 0.02;
    // the fitting: a steel body, two tubes, a wire cage, two chains to the ceiling
    const fx = new FacetBuilder();
    fx.add('metal', cbox(1.3, 0.06, 0.16, 0.01), C.dark, at(1.0, S.H - 0.45, S.front - 0.75));
    for (const dz of [-0.04, 0.04]) fx.add('lamp', prism(0.016, 1.2, 6), 0xf4f8ff, at(1.0, S.H - 0.49, S.front - 0.75 + dz, 0, 0, Math.PI / 2));
    for (let i = 0; i < 9; i++) fx.add('metal', cbox(0.006, 0.05, 0.18, 0.002), 0x2a2a2a, at(0.4 + i * 0.15, S.H - 0.5, S.front - 0.75));
    for (const x of [0.45, 1.55]) fx.add('chrome', cbox(0.008, 0.42, 0.008, 0.002), 0xa8aca6, at(x, S.H - 0.21, S.front - 0.75));
    g.add(fx.build(mats, { cast: false }));
    // a cable tray along the wall over the bay, drops to the two machines
    b.add('metal', cbox(4.0, 0.05, 0.22, 0.006), 0x6a6e66, at(0.9, S.H - 0.3, z - 0.14));
    for (let i = 0; i < 5; i++) b.add('rubber', cbox(3.9, 0.025, 0.025, 0.006), [0x1a1a1a, 0x2a4a7a, 0x8a3020, 0x1a1a1a, 0x2a2622][i], at(0.9, S.H - 0.26, z - 0.22 + i * 0.035));
    b.add('rubber', tube([[2.6, S.H - 0.3, z - 0.1], [2.62, 2.2, z - 0.06], [2.62, 1.5, z - 0.05]], 0.018, 10, 5), 0x1a1a1a);
    b.add('rubber', tube([[-0.6, S.H - 0.3, z - 0.1], [-0.62, 2.3, z - 0.1], [-0.66, 1.0, z - 0.08], [-0.6, 0.1, z - 0.05]], 0.016, 12, 5), 0x1a1a1a);
    // an isolator box on the wall, a red emergency stop on a yellow plate between the two machines
    b.add('paint', cbox(0.22, 0.3, 0.12, 0.012), 0x8a8e88, at(0.25, 1.55, z - 0.06));
    b.add('paint', cbox(0.04, 0.1, 0.04, 0.006), 0xc8301c, at(0.25, 1.52, z - 0.13));
    b.add('paint', cbox(0.16, 0.16, 0.02, 0.006), 0xd8a828, at(0.25, 1.2, z - 0.01));
    b.add('paint', prism(0.04, 0.04, 12), 0xc8281c, at(0.25, 1.2, z - 0.035, Math.PI / 2));
    // the floor: a yellow walkway line in front of the bay, a drip mat under the bath
    b.add('hazard', cbox(4.2, 0.004, 0.06, 0.001), 0xffffff, at(0.9, 0.003, S.front - 0.95), { rep: 0.25 });
    b.add('rubber', cbox(0.8, 0.008, 0.5, 0.002), 0x2a2a28, at(1.1, 0.004, S.front - 0.42));
    g.add(b.build(mats));
    return g;
  }
}

// THE TALENT BENCH, against the control room's left wall by the door: a steel
// lab bench under a clamp lamp, a row of six tin cans (HANDS, GUT, FEET |
// TONGUE, EYES, NERVE) and in the middle a brass balance. The cans hold glass
// marbles (survival/talents.ts, built by rooms/marble3d.ts); every marble is a
// talent with a weight. Press a can and the camera leans in, the can tips
// toward you and the marbles roll and rattle to its lip; press a marble and it
// comes up to the light beside a small catalogue card (what it does, what it
// costs, its weight, how a locked one is earned). Put it on the scale and it
// flies to its pan: BUFFS on the left pan, DEBUFFS on the right. The beam
// really tips (a damped spring) and its needle swings over the dial; the unit
// can only be SEALED while the beam is level or leans to the debuffs.
//   bench.open()                       from the room: weigh the next unit (sealing saves the loadout)
//   await bench.open({ intake: true }) part of a new unit's creation: resolves with the sealed keys, or null
// Keys: ← → pick a can / a marble, Enter looks in / inspects / puts on or takes off, Q E next can,
// S or the red button seals, Esc steps back. Touch: tap the cans, the marbles, the card's keys.
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import type { Hot } from '../monitor/stage';
import { FacetBuilder, at, cbox, prism, lathe, tube, bolt, C, plate, paper, uiSound, gameSound, glowCard } from '../monitor/props';
import { bitText } from '../../../gfx/bitfont';
import { MARBLES, MARBLE, CANS, weigh, balanced, effectsOf, type Marble } from '../../../survival/talents';
import { statIcon } from './statIcons';
import { marbleOwned, unlockHint, loadout, setLoadout, freshMarbles, markSeen } from '../../../game/talentFile';
import { buildMarble, type Marble3D } from './marble3d';
import { FocusNav } from '../nav';
import { esc } from '../common';
import './talent.css';

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
type Mode = 'off' | 'room' | 'can' | 'pan' | 'card';
const RC = 0.058, HC = 0.13, MR = 0.014;
const PAN_R = 0.07, BEAM = 0.16, HANG = 0.165;
/** marbles under the inspection loupe read this much bigger */
const LOUPE = 1.7;
/** how far the open can tips toward the operator (rad) */
const TILT = 1.02;

interface Can { i: number; key: string; group: THREE.Group; body: THREE.Group; lid: THREE.Group; lidA: number; lidV: number; tilt: number; jig: number; marbles: string[]; x: number; z: number }
interface MState { m: Marble; v: Marble3D; pos: THREE.Vector3; fly: { from: THREE.Vector3; t: number; dur: number; arc: number; pan?: number } | null; last: THREE.Vector3; hop: number; scale: number }

export interface BenchSpot { wallX: number; z0: number; z1: number; top: number }

export class TalentBench {
  group = new THREE.Group();
  /** screen position of a world point (title.ts hands over the stage's) */
  project?: (p: THREE.Vector3) => { x: number; y: number } | null;
  /** the bench took the view / gave it back (title.ts hides its HUD) */
  onFocus?: (on: boolean) => void;
  private mats: FMats;
  private hots: Hot[];
  private S: BenchSpot;
  private BX: number; private ZC: number; private TOP: number;
  private cans: Can[] = [];
  private ms = new Map<string, MState>();
  private onScale = new Set<string>();
  private mode: Mode = 'off';
  private canI = 0;
  /** the selected thing for the keys: a can (room), a marble (can / pan) */
  private sel = 0;
  private held: string | null = null;
  private heldFrom: Mode = 'can';
  private intake: ((keys: string[] | null) => void) | null = null;
  // the balance
  private beam = new THREE.Group();
  private pans: THREE.Group[] = [];
  private needle = new THREE.Group();
  private ang = 0; private angV = 0; private jam = 0;
  private readout!: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture };
  private sealBtn = new THREE.Group(); private sealCap!: THREE.Mesh; private sealT = 0; private sealFlash = 0;
  // light
  private lamp = new THREE.SpotLight(0xffe2b8, 0, 2.6, 0.82, 0.55, 1.4);
  /** a fluorescent fitting on the wall over the bench: the work light */
  private strip = new THREE.SpotLight(0xe8f0ff, 0, 3.4, 1.05, 0.8, 1.3);
  private fill = new THREE.PointLight(0xdfe8ff, 0, 2.4, 1.6);
  private pen = new THREE.PointLight(0xfff4e0, 0, 0.6, 1.8);
  private glint = new THREE.Group();
  /** the inspection stand: a brass turntable over a light box, under a loupe light */
  private stand = new THREE.Group(); private standTop = new THREE.Group(); private standLight = new THREE.SpotLight(0xfff4e4, 0, 1.2, 0.5, 0.6, 1.5);
  private standGlow!: THREE.MeshBasicMaterial; private standP = new THREE.Vector3();
  // DOM
  private layer: HTMLElement;
  private tags: HTMLElement;
  private card: HTMLElement;
  private bar: HTMLElement;
  private sub: HTMLElement;
  private nav: FocusNav | null = null;
  private subT = 0;
  private fresh = new Set<string>();
  private t = 0;
  private v = new THREE.Vector3(); private q = new THREE.Quaternion();
  private cam: THREE.PerspectiveCamera | null = null;
  private snap = 0;

  constructor(mats: FMats, hots: Hot[], spot: BenchSpot) {
    this.mats = mats; this.hots = hots; this.S = spot;
    this.BX = spot.wallX + 0.34; this.ZC = (spot.z0 + spot.z1) / 2; this.TOP = spot.top;
    this.group.name = 'talentBench';
    this.group.add(this.benchBody(), this.scale(), this.sealButton(), this.inspectStand());
    this.buildCans();
    this.buildMarbles();
    this.lights();
    // the DOM: floating tags over the cans and marbles, the card, the bar of keys, the subtitle line
    this.layer = document.createElement('div'); this.layer.className = 'tb-layer';
    this.tags = document.createElement('div'); this.tags.className = 'tb-tags';
    this.card = document.createElement('div'); this.card.className = 'tb-card';
    this.bar = document.createElement('div'); this.bar.className = 'tb-bar';
    this.sub = document.createElement('div'); this.sub.className = 'tb-sub';
    this.layer.append(this.tags, this.card, this.bar, this.sub);
    for (const k of loadout()) this.onScale.add(k);
    this.hots.push({ key: 'tb:bench', objs: [this.group], glow: [], label: 'Talent bench', sub: 'weigh the next unit · marbles and the balance', press: () => { uiSound('tick', 0.6); void this.open(); } });
    this.hots.push({ key: 'tb:scale', objs: [this.beam, ...this.pans], glow: [], label: 'The balance', sub: '', press: () => this.pressScale() });
    this.hots.push({ key: 'tb:seal', objs: [this.sealBtn], label: 'Seal the unit', sub: 'only when the beam is level or leans to the debuffs', press: () => this.seal() });
    if (import.meta.env.DEV) (window as any).__talent = this;
  }
  get active() { return this.mode !== 'off'; }

  // ================================================================== building it
  private benchBody(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { BX, ZC, TOP } = this, L = this.S.z1 - this.S.z0, D = 0.64;
    // the cabinet: olive steel, three drawers, a kick plate; the black epoxy top with a steel lip
    b.add('paint', cbox(D - 0.04, TOP - 0.1, L - 0.04, 0.012), 0x5e6a52, at(BX, (TOP - 0.1) / 2 + 0.06, ZC), { rep: 0.5 });
    b.add('metal', cbox(D - 0.08, 0.06, L - 0.1, 0.01), 0x2a2c2a, at(BX + 0.01, 0.03, ZC));
    for (let i = 0; i < 3; i++) {
      const dz = (i - 1) * (L / 3);
      b.add('paint', cbox(0.02, 0.2, L / 3 - 0.05, 0.006), 0x6a7660, at(BX + D / 2 - 0.02, TOP - 0.22, ZC + dz));
      b.add('chrome', cbox(0.03, 0.025, 0.14, 0.006), 0xe0e4e4, at(BX + D / 2 + 0.005, TOP - 0.2, ZC + dz));
      b.add('paint', cbox(0.02, 0.44, L / 3 - 0.05, 0.006), 0x606c56, at(BX + D / 2 - 0.02, 0.36, ZC + dz));
      b.add('chrome', cbox(0.03, 0.12, 0.022, 0.006), 0xe0e4e4, at(BX + D / 2 + 0.005, 0.48, ZC + dz + (L / 3 - 0.12) / 2));
    }
    b.add('bakelite', cbox(D, 0.035, L, 0.008), 0x1e2120, at(BX, TOP - 0.0175, ZC));
    b.add('chrome', cbox(0.012, 0.04, L, 0.004), 0xb8bcbc, at(BX + D / 2 + 0.004, TOP - 0.02, ZC));
    // a green cutting mat under the cans, a felt square under the balance
    b.add('rubber', cbox(0.36, 0.004, L - 0.12, 0.001), 0x2e5a3e, at(BX - 0.02, TOP + 0.002, ZC));
    b.add('leather', cbox(0.22, 0.005, 0.5, 0.002), 0x3a2a24, at(BX + 0.04, TOP + 0.003, ZC));
    // the back: an upstand with a pegged rail and a strip light under a hood
    b.add('metal', cbox(0.03, 0.22, L, 0.006), 0x8a9088, at(this.S.wallX + 0.03, TOP + 0.11, ZC));
    // the clamp lamp: a clamp on the upstand, two arms with springs, the shade
    const lb = [this.S.wallX + 0.05, TOP + 0.16, this.S.z0 + 0.16] as [number, number, number];
    const j1 = [BX - 0.14, TOP + 0.62, this.S.z0 + 0.3] as [number, number, number];
    const j2 = [BX + 0.08, TOP + 0.66, ZC - 0.22] as [number, number, number];
    b.add('metal', cbox(0.05, 0.08, 0.05, 0.01), 0x2a2c2e, at(...lb));
    b.add('enamel', tube([lb, j1], 0.011, 2, 5, false), 0x3a5a4a);
    b.add('enamel', tube([j1, j2], 0.009, 2, 5, false), 0x3a5a4a);
    for (const [a0, a1] of [[lb, j1], [j1, j2]] as [number, number, number][][]) b.add('chrome', tube([[a0[0] + 0.012, a0[1] + 0.01, a0[2]], [a1[0] + 0.012, a1[1] + 0.01, a1[2]]], 0.004, 2, 4, false), 0xd8dcdc);
    b.add('metal', prism(0.016, 0.03, 8), 0x1a1c1e, at(...j1, Math.PI / 2, 0, 0));
    b.add('enamel', lathe([[0.012, 0], [0.03, 0.02], [0.075, 0.1], [0.078, 0.104], [0.07, 0.104], [0.026, 0.026], [0, 0.026]], 14), 0x3a5a4a, at(j2[0], j2[1] - 0.02, j2[2], Math.PI, 0, 0.35));
    // drawer labels and the bench's plate
    g.add(b.build(this.mats));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false }));
    bulb.position.set(j2[0] - 0.012, j2[1] - 0.085, j2[2]); bulb.userData.noGlow = true; g.add(bulb);
    this.lamp.position.copy(bulb.position); this.lamp.target.position.set(BX + 0.02, TOP, ZC);
    const sign = plate(this.mats, ['TALENT BENCH T-1', 'BUFFS LEFT · DEBUFFS RIGHT'], 0.42, 0.075, { bg: 0xd8b848, ink: 0x1a1408 });
    sign.position.set(BX + D / 2 + 0.016, TOP - 0.06, ZC + 0.36); sign.rotation.y = Math.PI / 2; g.add(sign);
    const rule = plate(this.mats, ['SEAL ONLY WHEN LEVEL', 'OR LEANING TO THE DEBUFFS'], 0.34, 0.075, { bg: 0xe8e2d0, ink: 0x6a1a14 });
    rule.position.set(BX + D / 2 + 0.016, TOP - 0.06, ZC - 0.4); rule.rotation.y = Math.PI / 2; g.add(rule);
    // the weigh-in log by the balance, a loupe
    const log = paper(['WEIGH-IN LOG', '~', '~', '~', '~'], 0.12, 0.16, { seed: 61, rule: true });
    log.rotation.set(-Math.PI / 2, 0, 0.4); log.position.set(BX + 0.22, TOP + 0.006, ZC + 0.62); g.add(log);
    const lb2 = new FacetBuilder();
    lb2.add('brass', lathe([[0.02, 0], [0.024, 0], [0.024, 0.012], [0.02, 0.012]], 14), 0xd8b060, at(BX + 0.24, TOP + 0.003, ZC - 0.62, 0, 0, 0));
    lb2.add('rubber', cbox(0.012, 0.012, 0.07, 0.003), 0x1a1a1a, at(BX + 0.24, TOP + 0.008, ZC - 0.57));
    g.add(lb2.build(this.mats));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), new THREE.MeshPhongMaterial({ color: 0xc8e0ff, transparent: true, opacity: 0.35, shininess: 200, specular: 0xffffff }));
    lens.rotation.x = -Math.PI / 2; lens.position.set(BX + 0.24, TOP + 0.01, ZC - 0.62); lens.userData.noGlow = true; g.add(lens);
    return g;
  }

  private scale(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { BX, ZC, TOP } = this;
    const sx = BX + 0.04, PIV = TOP + 0.33;
    // the base: black cast iron on four levelling feet, brass rails, a spirit level
    b.add('metal', cbox(0.15, 0.045, 0.5, 0.012), 0x18191a, at(sx, TOP + 0.0275, ZC));
    b.add('metal', cbox(0.155, 0.008, 0.505, 0.003), 0x2a2622, at(sx, TOP + 0.05, ZC));
    b.add('brass', cbox(0.004, 0.01, 0.505, 0.002), 0xb88a3a, at(sx + 0.077, TOP + 0.05, ZC));
    for (const [dx, dz] of [[-0.06, -0.22], [0.06, -0.22], [-0.06, 0.22], [0.06, 0.22]]) b.add('brass', prism(0.012, 0.012, 8), 0xb88a3a, at(sx + dx, TOP + 0.006, ZC + dz));
    b.add('chrome', cbox(0.03, 0.012, 0.08, 0.004), 0xc8d0d0, at(sx + 0.05, TOP + 0.058, ZC + 0.16));
    // the pillar and the knife-edge block
    b.add('brass', prism(0.016, 0.06, 10), 0xc89a48, at(sx, TOP + 0.08, ZC));
    b.add('brass', prism(0.011, PIV - TOP - 0.1, 10), 0xd8aa58, at(sx, (PIV + TOP + 0.1) / 2 - 0.01, ZC));
    b.add('brass', cbox(0.05, 0.03, 0.04, 0.006), 0xc89a48, at(sx, PIV - 0.005, ZC));
    // the dial plate behind the needle (its face is a canvas below)
    b.add('brass', cbox(0.012, 0.11, 0.17, 0.004), 0xb88a3a, at(sx - 0.012, PIV - 0.13, ZC));
    g.add(b.build(this.mats));
    const dial = this.dialFace();
    dial.position.set(sx - 0.0055, PIV - 0.13, ZC); dial.rotation.y = Math.PI / 2; g.add(dial);
    // the readout window on the base's front: grams on each pan
    const rd = document.createElement('canvas'); rd.width = 208; rd.height = 20;
    const rt = new THREE.CanvasTexture(rd); rt.colorSpace = THREE.SRGBColorSpace; rt.magFilter = rt.minFilter = THREE.NearestFilter; rt.generateMipmaps = false;
    const rm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.05), new THREE.MeshBasicMaterial({ map: rt, toneMapped: false }));
    rm.position.set(sx + 0.0755, TOP + 0.028, ZC); rm.rotation.y = Math.PI / 2; rm.userData.noGlow = true; g.add(rm);
    this.readout = { cv: rd, tex: rt };
    // the beam: a brass bar on the knife edge, end hooks; the needle hangs from the pivot
    const bb = new FacetBuilder();
    bb.add('brass', cbox(0.016, 0.022, BEAM * 2 + 0.03, 0.006), 0xe0b060, at(0, 0, 0));
    bb.add('brass', lathe([[0, -0.012], [0.02, -0.012], [0.02, 0.012], [0, 0.012]], 12), 0xc89a48, at(0, 0, 0, 0, 0, Math.PI / 2));
    for (const s of [-1, 1]) { bb.add('brass', prism(0.008, 0.02, 8), 0xd8aa58, at(0, 0.008, s * BEAM)); bb.add('chrome', bolt(0.006, 0.004), 0xffffff, at(0.009, 0, s * BEAM * 0.55, 0, Math.PI / 2, 0)); }
    this.beam.add(bb.build(this.mats));
    this.beam.position.set(sx, PIV, ZC);
    const nb = new FacetBuilder();
    nb.add('metal', cbox(0.004, 0.15, 0.004, 0.001), 0x101010, at(0, -0.075, 0));
    nb.add('metal', cbox(0.003, 0.02, 0.008, 0.001), 0xc81a10, at(0, -0.148, 0));
    this.needle.add(nb.build(this.mats, { cast: false }));
    this.needle.position.set(sx + 0.006, PIV, ZC);
    g.add(this.beam, this.needle);
    // the pans: a shallow dish under three hangers to a ring
    for (const side of [1, -1]) {
      const p = new THREE.Group();
      const pb = new FacetBuilder();
      pb.add('brass', lathe([[0, 0], [PAN_R * 0.7, 0], [PAN_R, 0.014], [PAN_R + 0.004, 0.018], [PAN_R - 0.002, 0.018], [PAN_R * 0.66, 0.004], [0, 0.004]], 22), side > 0 ? 0xe0b868 : 0xb8945a);
      for (let k = 0; k < 3; k++) { const a = k * (Math.PI * 2 / 3) + 0.5; pb.add('chrome', tube([[Math.cos(a) * PAN_R * 0.92, 0.016, Math.sin(a) * PAN_R * 0.92], [0, HANG, 0]], 0.0016, 2, 3, false), 0x9a9a92); }
      pb.add('brass', prism(0.008, 0.012, 8), 0xc89a48, at(0, HANG, 0));
      p.add(pb.build(this.mats, { cast: true }));
      // the pan's plate: BUFF / DEBUFF, stamped on a tag hanging off the rim
      const tag = plate(this.mats, [side > 0 ? 'BUFF' : 'DEBUFF'], 0.075, 0.03, { bg: side > 0 ? 0xd8b848 : 0xb83a2a, ink: side > 0 ? 0x1a1408 : 0xf4ecd8, px: 560 });
      tag.position.set(PAN_R + 0.004, 0.0, 0); tag.rotation.y = Math.PI / 2; p.add(tag);
      p.userData.side = side;
      this.pans.push(p);
      g.add(p);
    }
    this.drawReadout();
    return g;
  }
  /** the dial: a green arc (level or leaning to the debuffs) and a red one (too much buff) */
  private dialFace(): THREE.Mesh {
    const W = 88, H = 56;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#e8e0c8'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(120,90,50,0.12)'; for (let i = 0; i < 300; i++) c.fillRect((i * 37) % W, (i * 53) % H, 1, 1);
    const cx = W / 2, cy = -8, r0 = 46, r1 = 54;
    // arcs: the screen's left (debuff heavy, +z) to the centre is green, past centre to the right is red
    for (let a = -0.5; a <= 0.5; a += 0.004) {
      const x0 = cx + Math.sin(a) * r0, y0 = cy + Math.cos(a) * r0;
      c.fillStyle = a < 0.02 ? '#2e8a3a' : '#c8301e';
      for (let rr = r0; rr < r1; rr += 1) c.fillRect(Math.round(cx + Math.sin(a) * rr), Math.round(cy + Math.cos(a) * rr), 1, 1);
      void x0; void y0;
    }
    c.fillStyle = '#1a1410';
    for (let k = -5; k <= 5; k++) { const a = k * 0.09; for (let rr = r0 - (k % 5 === 0 ? 7 : 4); rr < r0; rr++) c.fillRect(Math.round(cx + Math.sin(a) * rr), Math.round(cy + Math.cos(a) * rr), 1, 1); }
    bitText(c, 'LEVEL', cx, 22, { color: '#1a1410', outline: null, shadow: null, align: 'center' });
    bitText(c, '-', 10, 34, { color: '#2e6a2a', outline: null, shadow: null });
    bitText(c, '+', W - 16, 34, { color: '#a8261e', outline: null, shadow: null });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    m.userData.noGlow = true;
    return m;
  }
  private drawReadout() {
    const { cv, tex } = this.readout, c = cv.getContext('2d')!;
    const w = weigh(this.onScale), ok = w.debuff >= w.buff;
    c.fillStyle = '#0c120c'; c.fillRect(0, 0, cv.width, cv.height);
    bitText(c, `BUFF ${w.buff}g`, 4, 1, { color: '#e8c040', outline: null, shadow: null });
    c.fillStyle = ok ? '#3af05a' : '#ff3a2a'; c.fillRect(100, 6, 8, 8); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(101, 7, 2, 2);
    bitText(c, `DEBUFF ${w.debuff}g`, 204, 1, { color: '#ff8a6a', outline: null, shadow: null, align: 'right' });
    tex.needsUpdate = true;
  }
  private sealButton(): THREE.Group {
    const g = this.sealBtn;
    const b = new FacetBuilder();
    const x = this.BX + 0.2, z = this.ZC, y = this.TOP;
    b.add('metal', cbox(0.09, 0.05, 0.09, 0.01), 0x2a2c2a, at(x, y + 0.025, z));
    b.add('hazard', lathe([[0.034, 0.05], [0.04, 0.05], [0.04, 0.058], [0.034, 0.058]], 14), 0xffffff, at(x, y, z), { rep: 0.05 });
    g.add(b.build(this.mats));
    const cap = this.sealCap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc81e14, roughness: 0.35, emissive: 0x300000 }));
    cap.scale.y = 0.6; cap.position.set(x, y + 0.058, z);
    g.add(cap);
    const lbl = plate(this.mats, ['SEAL'], 0.05, 0.016, { bg: 0xe8e2d0, ink: 0x6a1a14 });
    lbl.position.set(x + 0.0455, y + 0.025, z); lbl.rotation.y = Math.PI / 2; g.add(lbl);
    return g;
  }
  private canLabel(i: number): THREE.CanvasTexture {
    const C0 = CANS[i];
    const W = 192, H = 48;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const hx = (n: number) => '#' + n.toString(16).padStart(6, '0');
    c.fillStyle = hx(C0.paper); c.fillRect(0, 0, W, H);
    // a printed band, the name big, the contents line, a barcode; foxing and a rust stain
    c.fillStyle = hx(C0.ink); c.fillRect(0, 3, W, 2); c.fillRect(0, H - 5, W, 2);
    bitText(c, C0.label, 64, 9, { color: hx(C0.ink), outline: null, shadow: null, align: 'center', scale: 2 });
    bitText(c, 'MARBLES · ISSUE', 128, 8, { color: hx(C0.ink), outline: null, shadow: null });
    bitText(c, 'TALENT STOCK', 128, 22, { color: hx(C0.ink), outline: null, shadow: null });
    for (let x = 6; x < 30; x += 2) { c.fillStyle = hx(C0.ink); c.fillRect(150 + x, 36 - 0, (x * 7) % 3 === 0 ? 2 : 1, 6); }
    bitText(c, 'No. ' + String(i + 1).padStart(2, '0'), 166, 34, { color: hx(C0.ink), outline: null, shadow: null });
    let s = i * 97 + 3; const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 260; k++) { c.fillStyle = R() < 0.5 ? 'rgba(90,60,30,0.16)' : 'rgba(255,250,230,0.14)'; c.fillRect(R() * W, R() * H, 1 + R() * 2, 1); }
    const rx = R() * W, ry = H * 0.6;
    for (let k = 0; k < 60; k++) { c.fillStyle = 'rgba(140,70,20,0.25)'; c.fillRect(rx + (R() - 0.5) * 18, ry + (R() - 0.3) * 14, 2, 2); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
    return tex;
  }
  /** the printed disc on a lid: the can's colour, its number */
  private lidLabel(i: number): THREE.CanvasTexture {
    const C0 = CANS[i], S = 64, hx = (n: number) => '#' + n.toString(16).padStart(6, '0');
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d')!;
    c.fillStyle = hx(C0.paper); c.fillRect(0, 0, S, S);
    c.fillStyle = hx(C0.ink); c.fillRect(0, 6, S, 3); c.fillRect(0, S - 9, S, 3);
    bitText(c, String(i + 1), S / 2, 14, { color: hx(C0.ink), outline: null, shadow: null, align: 'center', scale: 2 });
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    return t;
  }
  /** the inspection stand: a brass turntable on a frosted light box; a marble set on it turns slowly under a loupe light */
  private inspectStand(): THREE.Group {
    const g = this.stand, b = new FacetBuilder();
    const x = this.BX + 0.2, z = this.ZC + 0.2, y = this.TOP;
    b.add('metal', prism(0.052, 0.034, 20), 0x2a2c2a, at(x, y + 0.017, z));
    b.add('brass', prism(0.056, 0.006, 20), 0xd8aa58, at(x, y + 0.036, z));
    b.add('chrome', prism(0.006, 0.012, 8), 0xe0e4e4, at(x + 0.05, y + 0.02, z));
    g.add(b.build(this.mats));
    this.standGlow = new THREE.MeshBasicMaterial({ color: 0xfff8ec, toneMapped: false });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.044, 28), this.standGlow);
    glow.rotation.x = -Math.PI / 2; glow.position.set(x, y + 0.0395, z); glow.userData.noGlow = true;
    g.add(glow);
    // the turntable ring: three brass fingers that hold the marble
    const tb = new FacetBuilder();
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; tb.add('brass', cbox(0.006, 0.01, 0.016, 0.002), 0xe0b868, at(Math.cos(a) * 0.012, 0.005, Math.sin(a) * 0.012, 0, -a, 0)); }
    this.standTop.add(tb.build(this.mats, { cast: false }));
    this.standTop.position.set(x, y + 0.04, z);
    g.add(this.standTop);
    this.standP.set(x, y + 0.04 + MR * LOUPE * 0.92, z);
    this.standLight.position.set(x + 0.12, y + 0.34, z - 0.06); this.standLight.target.position.set(x, y + 0.04, z);
    g.add(this.standLight, this.standLight.target);
    const plateG = plate(this.mats, ['INSPECT'], 0.05, 0.014, { bg: 0xd8b848, ink: 0x1a1408 });
    plateG.position.set(x + 0.0525, y + 0.018, z); plateG.rotation.y = Math.PI / 2; g.add(plateG);
    this.hots.push({ key: 'tb:stand', objs: [g], glow: [], label: 'Inspection stand', sub: 'a marble set here turns under the loupe', press: () => { if (this.held) this.toggle(this.held); } });
    return g;
  }
  private buildCans() {
    const zs = [0.73, 0.59, 0.45, 0.31, -0.31, -0.45, -0.59, -0.73];
    CANS.forEach((C0, i) => {
      const x = this.BX - 0.04 + (i % 2 ? 0.035 : 0), z = this.ZC + zs[i];
      const group = new THREE.Group(); group.name = 'can:' + C0.key;
      const body = new THREE.Group();
      const b = new FacetBuilder();
      // tinplate: a rolled foot, three ribs, a bead at the cut lip, the inside dull
      const rib = (y: number) => [[RC, y - 0.006], [RC - 0.002, y - 0.003], [RC - 0.002, y + 0.003], [RC, y + 0.006]] as [number, number][];
      const prof: [number, number][] = [[0, 0.002], [RC - 0.006, 0], [RC + 0.001, 0.004], [RC, 0.01], ...rib(0.03), ...rib(HC - 0.03), [RC, HC - 0.006], [RC + 0.002, HC - 0.002], [RC - 0.0015, HC], [RC - 0.003, HC - 0.004], [RC - 0.003, 0.008], [0, 0.008]];
      b.add('chrome', lathe(prof, 26), i === 2 || i === 5 ? 0xa8a294 : 0xb8bcbe, at(0, 0, 0), { rep: 0.08 });
      body.add(b.build(this.mats));
      // the paper label round the front
      const len = Math.PI * 2 * 0.86;
      const lab = new THREE.Mesh(new THREE.CylinderGeometry(RC + 0.0012, RC + 0.0012, HC * 0.56, 30, 1, true, Math.PI / 2 - len / 2, len), new THREE.MeshStandardMaterial({ map: this.canLabel(i), roughness: 0.85 }));
      lab.position.y = HC * 0.5; lab.receiveShadow = true;
      body.add(lab);
      // the press-fit lid: hinged at the back, it pops and swings open before the can tips
      const lid = new THREE.Group();
      const lb = new FacetBuilder();
      lb.add('chrome', lathe([[0, 0.004], [RC - 0.006, 0.004], [RC + 0.0025, 0.002], [RC + 0.0025, -0.008], [RC - 0.001, -0.008], [RC - 0.001, 0.0], [0, 0.001]], 26), i % 3 ? 0xb8bcbe : 0xa8a49a, at(RC, 0, 0), { rep: 0.06 });
      lb.add('chrome', lathe([[RC * 0.55, 0.0045], [RC * 0.6, 0.0065], [RC * 0.65, 0.0045]], 26), 0xc8ccce, at(RC, 0, 0));
      lid.add(lb.build(this.mats));
      const top = new THREE.Mesh(new THREE.CircleGeometry(RC * 0.5, 24), new THREE.MeshStandardMaterial({ map: this.lidLabel(i), roughness: 0.7 }));
      top.rotation.x = -Math.PI / 2; top.position.set(RC, 0.0052, 0); lid.add(top);
      lid.position.set(-RC, HC + 0.001, 0);
      body.add(lid);
      // pivot on the front edge of the foot (it tips toward the operator, +x)
      body.position.set(-RC, 0, 0);
      group.add(body);
      group.position.set(x + RC, this.TOP + 0.004, z);
      this.group.add(group);
      const can: Can = { i, key: C0.key, group, body, lid, lidA: 0, lidV: 0, tilt: 0, jig: 0, marbles: MARBLES.filter((m) => m.can === C0.key).map((m) => m.key), x, z };
      this.cans.push(can);
      this.hots.push({ key: 'tb:can:' + i, objs: [body], glow: [lab], label: `Tin can · ${C0.label}`, sub: `${C0.sub} · press to look inside`, press: () => this.openCan(i) });
    });
  }
  private buildMarbles() {
    for (const m of MARBLES) {
      const v = buildMarble(m, MR);
      this.group.add(v.group);
      this.group.add(v.caustic);
      const st: MState = { m, v, pos: new THREE.Vector3(), fly: null, last: new THREE.Vector3(), hop: -1, scale: 1 };
      this.ms.set(m.key, st);
      this.hots.push({ key: 'tb:m:' + m.key, objs: [v.shell], glow: [], label: m.name, sub: '', press: () => this.pressMarble(m.key) });
    }
    this.group.updateMatrixWorld(true);
    for (const st of this.ms.values()) { this.target(st.m.key, st.pos); st.last.copy(st.pos); st.v.group.position.copy(st.pos); }
  }
  private lights() {
    this.lamp.castShadow = false;
    this.fill.position.set(this.BX + 0.7, this.TOP + 0.9, this.ZC);
    this.group.add(this.lamp, this.lamp.target, this.fill, this.pen);
    // the wall fitting: an enamel hood, a tube, the light it throws on the bench
    const fb = new FacetBuilder(), fy = this.TOP + 1.12, fx = this.S.wallX + 0.16;
    fb.add('enamel', cbox(0.16, 0.06, 1.2, 0.012), 0xd8d4c4, at(fx, fy + 0.03, this.ZC));
    fb.add('metal', cbox(0.12, 0.02, 0.04, 0.004), C.dark, at(fx - 0.06, fy + 0.03, this.ZC - 0.5));
    fb.add('metal', cbox(0.12, 0.02, 0.04, 0.004), C.dark, at(fx - 0.06, fy + 0.03, this.ZC + 0.5));
    this.group.add(fb.build(this.mats, { cast: false }));
    const tg = new THREE.CylinderGeometry(0.011, 0.011, 1.08, 8); tg.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false })); tube.position.set(fx + 0.02, fy - 0.006, this.ZC); tube.userData.noGlow = true;
    this.group.add(tube);
    this.strip.position.set(fx + 0.04, fy - 0.03, this.ZC); this.strip.target.position.set(this.BX + 0.12, this.TOP, this.ZC);
    this.group.add(this.strip, this.strip.target);
    const pool = glowCard(0.9, 1.2, 0xffd8a0, 0.06); pool.rotation.x = -Math.PI / 2; pool.position.set(this.BX + 0.02, this.TOP + 0.003, this.ZC - 0.1);
    this.group.add(pool, this.glint);
  }

  // ================================================================== where things are
  /** a can's marble slot in the can's own space: a ring on the floor that rolls to the lip as it tips */
  private canSlot(can: Can, j: number, out: THREE.Vector3): THREE.Vector3 {
    const n = Math.max(1, can.marbles.length), k = THREE.MathUtils.clamp(can.tilt / TILT, 0, 1);
    // standing: a hex heap on the floor of the can (one in the middle, six round it, the rest on top)
    const lay = j < 7 ? 0 : 1, jj = j < 7 ? j : j - 7;
    const rr = lay === 0 ? (jj === 0 ? 0 : MR * 2.06) : MR * 1.2;
    const a = (lay === 0 ? (jj - 1) * Math.PI / 3 : jj * Math.PI * 2 / 3 + 0.5) + can.i;
    const x0 = Math.cos(a) * rr, y0 = 0.008 + MR + lay * MR * 1.5, z0 = Math.sin(a) * rr;
    // tipped toward the operator: heaped against the near wall in the bottom corner, rows of three
    const row = Math.floor(j / 3), inRow = Math.min(3, n - row * 3), col = j % 3;
    const z1 = (col - (inRow - 1) / 2) * MR * 2.06, wall = RC - 0.004 - MR;
    const x1 = Math.sqrt(Math.max(0, wall * wall - z1 * z1)) - row * MR * 0.2, y1 = 0.008 + MR + row * MR * 1.95;
    const jg = can.jig * 0.004;
    out.set(x0 + (x1 - x0) * k + Math.sin(this.t * 31 + j) * jg, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k + Math.cos(this.t * 27 + j * 2) * jg);
    return can.body.localToWorld(out);
  }
  /** a pan's slot: a little hex heap */
  private panSlot(side: number, j: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.pans[side > 0 ? 0 : 1];
    const d = MR * 2.05;
    const ring = j === 0 ? 0 : j <= 6 ? 1 : 2;
    const idx = j === 0 ? 0 : j <= 6 ? j - 1 : j - 7;
    const a = ring === 1 ? idx * (Math.PI / 3) : idx * (Math.PI / 6) + 0.26;
    const r = ring === 0 ? 0 : ring === 1 ? d : d * 1.9;
    out.set(Math.cos(a) * r, 0.004 + MR + (ring === 2 ? 0.006 : ring === 1 ? 0.002 : 0) + (j >= 13 ? MR * 1.6 : 0), Math.sin(a) * r);
    return p.localToWorld(out);
  }
  private target(key: string, out: THREE.Vector3): THREE.Vector3 {
    const st = this.ms.get(key)!;
    if (this.held === key) return out.copy(this.standP);
    if (this.onScale.has(key)) {
      const side = st.m.kind === 'buff' ? 1 : -1;
      const list = [...this.onScale].filter((k) => MARBLE.get(k)!.kind === st.m.kind);
      return this.panSlot(side, list.indexOf(key), out);
    }
    const can = this.cans.find((c) => c.key === st.m.can)!;
    const inCan = can.marbles.filter((k) => !this.onScale.has(k) && this.held !== k);
    return this.canSlot(can, Math.max(0, inCan.indexOf(key)), out);
  }
  private launch(key: string, dur = 0.55, arc = 0.12) {
    const st = this.ms.get(key)!;
    st.fly = { from: st.pos.clone(), t: 0, dur, arc };
  }

  // ================================================================== modes
  /** onto the bench (from the room, or as part of a new unit's creation) */
  open(o: { intake?: boolean } = {}): Promise<string[] | null> {
    if (this.mode === 'off') {
      this.mode = 'room';
      this.onScale = new Set(loadout());
      this.fresh = freshMarbles();
      document.body.append(this.layer);
      this.layer.classList.toggle('intake', !!o.intake);
      this.nav = new FocusNav(this.layer, { onBack: () => this.back(), onTab: (d) => this.stepCan(d), onArrow: (dx, dy) => this.arrow(dx, dy) });
      window.addEventListener('keydown', this.onKey, true);
      this.onFocus?.(true);
      this.sel = Math.max(0, this.canI);
      uiSound('servo', 0.4);
      this.say(o.intake ? 'Weigh the unit before it is linked. Buffs on the left pan, debuffs on the right.' : 'The talent bench. What goes on the scale goes into the next unit.', 5);
      this.drawReadout();
    }
    this.renderBar();
    if (!o.intake) return Promise.resolve(null);
    return new Promise((res) => { this.intake = res; });
  }
  /** off the bench (leaving the room closes it silently) */
  close(silent = false) {
    if (this.mode === 'off') return;
    if (this.held) this.drop();
    this.mode = 'off';
    for (const c of this.cans) c.jig = 0;
    this.layer.remove();
    this.card.classList.remove('on');
    this.nav?.destroy(); this.nav = null;
    window.removeEventListener('keydown', this.onKey, true);
    this.onFocus?.(false);
    // only a balanced scale is kept
    if (balanced(this.onScale)) setLoadout([...this.onScale]); else this.onScale = new Set(loadout());
    if (!silent) uiSound('back', 0.5);
    const r = this.intake; this.intake = null; r?.(null);
  }
  /** Esc: one step back */
  back(): boolean {
    if (this.mode === 'off') return false;
    if (this.mode === 'card') { this.drop(); return true; }
    if (this.mode === 'can' || this.mode === 'pan') { this.toRoom(); return true; }
    this.close();
    return true;
  }
  /** a tap on nothing: put a held marble back down; the bench keeps the view */
  miss(): boolean {
    if (this.mode === 'off') return false;
    if (this.mode === 'card') this.drop();
    return true;
  }
  private toRoom() {
    if (this.mode === 'can') { gameSound('metal_clank', 0.25, 1.1); }
    this.mode = 'room';
    this.sel = this.canI;
    this.renderBar();
  }
  private openCan(i: number) {
    if (this.mode === 'off') { void this.open(); }
    if (this.held) this.drop(true);
    const can = this.cans[i];
    this.canI = i; this.mode = 'can'; this.sel = 0;
    can.jig = 1;
    // the lid pops (a thumbnail under the rim), swings back on its hinge; then the can tips and the marbles rattle down
    if (can.lidA < 0.5) { can.lidV = 9; gameSound('can_open', 0.5, 1.15); setTimeout(() => gameSound('metal_clank', 0.22, 1.5), 140); }
    setTimeout(() => { gameSound('metal_clank', 0.3, 0.95 + Math.random() * 0.1); }, 260);
    setTimeout(() => { gameSound('tithe_jingle', 0.3, 1.3); gameSound('glass_clink', 0.25, 1.2); }, 420);
    setTimeout(() => gameSound('glass_clink', 0.2, 1.4), 600);
    setTimeout(() => gameSound('glass_clink', 0.12, 1.55), 760);
    markSeen(can.marbles.filter((k) => marbleOwned(MARBLE.get(k)!)));
    for (const k of can.marbles) this.fresh.delete(k);
    const n = can.marbles.filter((k) => marbleOwned(MARBLE.get(k)!)).length;
    this.say(`${CANS[i].label}: ${n} of ${can.marbles.length} marbles unlocked. Press one to look at it.`, 3.5);
    this.renderBar();
  }
  private stepCan(d: number) {
    if (this.mode === 'off') return;
    if (this.mode === 'card') { this.stepMarble(d); return; }
    const i = (this.canI + d + this.cans.length) % this.cans.length;
    if (this.mode === 'can') this.openCan(i); else { this.canI = i; this.sel = i; uiSound('tick', 0.4); this.renderBar(); }
  }
  /** the marbles the keys run along right now */
  private row(): string[] {
    if (this.mode === 'pan' || (this.mode === 'card' && this.heldFrom === 'pan')) return [...this.onScale].sort((a, b) => (MARBLE.get(a)!.kind === MARBLE.get(b)!.kind ? 0 : MARBLE.get(a)!.kind === 'buff' ? -1 : 1));
    const can = this.cans[this.canI];
    return can.marbles.filter((k) => !this.onScale.has(k) || k === this.held);
  }
  private stepMarble(d: number) {
    const r = this.row(); if (!r.length) return;
    const cur = this.held ? r.indexOf(this.held) : this.sel;
    const nx = r[(Math.max(0, cur) + d + r.length) % r.length];
    if (this.mode === 'card') { this.drop(true); this.view(nx); } else { this.sel = r.indexOf(nx); uiSound('tick', 0.4); }
  }
  private arrow(dx: number, dy: number): boolean {
    if (this.mode === 'off') return false;
    if (this.mode === 'room') {
      const N = this.cans.length;
      if (dx) { this.sel = (this.sel + dx + N + 2) % (N + 2); if (this.sel < N) this.canI = this.sel; uiSound('tick', 0.4); this.renderBar(); }
      else if (dy) { this.sel = dy < 0 ? N : this.canI; uiSound('tick', 0.4); this.renderBar(); }
      return true;
    }
    if (dx) this.stepMarble(dx);
    return true;
  }
  private onKey = (e: KeyboardEvent) => {
    if (this.mode === 'off') return;
    const t = e.target as HTMLElement | null;
    if (t && t.tagName === 'BUTTON' && this.layer.contains(t) && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); this.enter(); }
    else if (k === 's' || k === 'S') { e.preventDefault(); e.stopPropagation(); this.seal(); }
    else if (k >= '1' && k <= String(this.cans.length)) { e.preventDefault(); e.stopPropagation(); this.openCan(Number(k) - 1); }
  };
  /** Enter: look in / inspect / put on or take off / seal */
  private enter() {
    if (this.mode === 'room') {
      const N = this.cans.length;
      if (this.sel < N) this.openCan(this.sel); else if (this.sel === N) this.pressScale(); else this.seal();
    } else if (this.mode === 'can' || this.mode === 'pan') {
      const r = this.row(); const k = r[Math.min(this.sel, r.length - 1)];
      if (k) this.view(k);
    } else if (this.mode === 'card' && this.held) this.toggle(this.held);
  }
  private pressScale() {
    if (this.mode === 'off') { void this.open(); return; }
    if (this.held) this.drop(true);
    this.mode = 'pan'; this.sel = 0;
    uiSound('tick', 0.5);
    const w = weigh(this.onScale);
    this.say(this.onScale.size ? `Buffs ${w.buff} g, debuffs ${w.debuff} g. Press a marble on a pan to take it off.` : 'Both pans are empty. Pick marbles out of the cans.', 3.5);
    this.renderBar();
  }
  private pressMarble(key: string) {
    if (this.mode === 'off') { void this.open(); return; }
    if (this.held === key) { this.toggle(key); return; }
    if (this.onScale.has(key) && this.mode !== 'pan') { this.mode = 'pan'; }
    this.view(key);
  }
  /** up to the light, beside its card */
  private view(key: string) {
    if (this.held && this.held !== key) this.drop(true);
    const from = this.onScale.has(key) ? 'pan' : 'can';
    if (from === 'can') { const ci = this.cans.findIndex((c) => c.key === MARBLE.get(key)!.can); if (ci !== this.canI || this.mode === 'room') { this.canI = ci; this.cans[ci].jig = 0.6; } }
    this.heldFrom = from === 'pan' ? 'pan' : 'can';
    if (this.mode !== 'card') this.mode = from === 'pan' ? 'pan' : 'can';
    this.held = key; this.mode = 'card';
    this.launch(key, 0.6, 0.1);
    gameSound('glass_clink', 0.3, 1.1 + Math.random() * 0.2);
    setTimeout(() => { if (this.held === key) { gameSound('glass_clink', 0.4, 0.85); uiSound('tick', 0.3); } }, 560);
    this.renderCard(key);
    this.renderBar();
  }
  /** put the held marble back where it was */
  private drop(quiet = false) {
    const k = this.held; if (!k) return;
    this.held = null;
    this.mode = this.heldFrom;
    this.launch(k, 0.4, 0.05);
    this.card.classList.remove('on');
    if (!quiet) uiSound('back', 0.35);
    this.renderBar();
  }
  /** on the scale / off the scale */
  private toggle(key: string) {
    const m = MARBLE.get(key)!;
    if (!marbleOwned(m)) { uiSound('error', 0.6); this.say(`Locked. ${unlockHint(m)}`, 4); return; }
    const was = this.onScale.has(key);
    if (was) this.onScale.delete(key); else this.onScale.add(key);
    this.held = null;
    this.card.classList.remove('on');
    this.launch(key, was ? 0.7 : 0.8, was ? 0.16 : 0.22);
    // onto a pan: it lands with a knock that swings the beam, bounces twice and rolls into the heap (update)
    const ms0 = this.ms.get(key)!;
    if (!was && ms0.fly) ms0.fly.pan = m.kind === 'buff' ? 1 : -1;
    if (was) setTimeout(() => { gameSound('glass_clink', 0.5, 0.9); gameSound('metal_clank', 0.15, 1.6); }, 660);
    this.mode = was ? 'can' : 'room';
    if (was) { this.canI = this.cans.findIndex((c) => c.key === m.can); this.mode = 'can'; this.cans[this.canI].jig = 0.8; }
    this.drawReadout();
    const w = weigh(this.onScale);
    const st = w.debuff > w.buff ? 'The beam leans to the debuffs: sealable.' : w.debuff === w.buff ? (w.buff ? 'Level. Sealable.' : 'Both pans empty.') : `Too heavy on the buffs by ${w.buff - w.debuff} g. Add a debuff or take a buff off.`;
    this.say(`${was ? 'Off the scale' : 'On the scale'}: ${m.name} (${m.weight} g). ${st}`, 4);
    if (balanced(this.onScale)) setLoadout([...this.onScale]);
    this.renderBar();
  }
  /** the red button */
  seal() {
    if (this.mode === 'off') return;
    if (this.held) this.drop(true);
    this.sealT = 0.35;
    if (!balanced(this.onScale)) {
      const w = weigh(this.onScale);
      this.jam = 0.9;
      uiSound('error', 0.8); setTimeout(() => uiSound('buzz', 0.5), 120);
      this.say(`It will not seal: the buffs outweigh the debuffs by ${w.buff - w.debuff} g.`, 4);
      return;
    }
    setLoadout([...this.onScale]);
    uiSound('clamp', 0.7); gameSound('metal_clank', 0.35, 0.8); this.sealFlash = 1.2;
    const n = this.onScale.size;
    this.say(n ? `Sealed: ${n} marble${n === 1 ? '' : 's'} for the ${this.intake ? 'unit' : 'next unit'}.` : 'Sealed with an empty scale: a plain unit.', 3);
    if (this.intake) {
      const r = this.intake, keys = [...this.onScale];
      this.intake = null;
      setTimeout(() => { this.close(true); r(keys); }, 900);
    } else setTimeout(() => { if (this.mode !== 'off') this.close(true); }, 1100);
  }

  // ================================================================== DOM
  private say(text: string, secs = 3) { this.sub.textContent = text; this.sub.classList.add('on'); this.subT = secs; }
  private renderCard(key: string) {
    const m = MARBLE.get(key)!, own = marbleOwned(m), on = this.onScale.has(key);
    const w = weigh(this.onScale);
    const after = on ? { buff: w.buff - (m.kind === 'buff' ? m.weight : 0), debuff: w.debuff - (m.kind === 'debuff' ? m.weight : 0) } : { buff: w.buff + (m.kind === 'buff' ? m.weight : 0), debuff: w.debuff + (m.kind === 'debuff' ? m.weight : 0) };
    const C0 = CANS.find((c) => c.key === m.can)!;
    const fx = effectsOf(m);
    const row = (e: typeof fx[number]) => `<div class="tb-fx ${e.good ? 'g' : 'b'}"><img src="${statIcon(e.stat, e.good ? '#8af59a' : '#ff7a5a')}" alt=""><span class="l">${esc(e.label)}</span><b>${esc(e.value)}</b>${e.good ? '' : '<i>DRAWBACK</i>'}</div>`;
    const ok = after.debuff >= after.buff, tot = Math.max(1, after.buff, after.debuff);
    this.card.className = `tb-card ${m.kind}${own ? '' : ' locked'}`;
    this.card.innerHTML = `
      <div class="tb-c-head"><span class="tb-lamp ${own ? 'on' : ''}"></span><span class="tb-c-name">${esc(m.name)}</span><span class="tb-c-wt">${m.weight}<small>g</small></span></div>
      <div class="tb-c-sub"><span class="k ${m.kind}">${m.kind === 'buff' ? 'BUFF' : 'DEBUFF'}</span><span>${esc(C0.label)}</span><span class="ln">${esc(m.line)}</span></div>
      <div class="tb-c-fx">${fx.map(row).join('')}</div>
      ${own ? '' : `<div class="tb-c-lock"><span class="tb-lamp"></span>${esc(unlockHint(m))}</div>`}
      <div class="tb-c-pans"><span class="pb" style="--w:${(after.buff / tot * 100).toFixed(0)}%"><i></i>${after.buff} g</span><span class="pl ${ok ? 'ok' : 'no'}"></span><span class="pd" style="--w:${(after.debuff / tot * 100).toFixed(0)}%"><i></i>${after.debuff} g</span></div>
      <div class="tb-c-keys"></div>`;
    const keys = this.card.querySelector('.tb-c-keys')!;
    const btn = (label: string, k: string, fn: () => void, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tb-key ' + cls; b.innerHTML = `<kbd>${esc(k)}</kbd>${esc(label)}`; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); keys.append(b); return b; };
    if (own) btn(on ? 'Take off the scale' : 'Onto the scale', 'Enter', () => this.toggle(key), 'main');
    btn('Back', 'Esc', () => this.drop());
    this.card.classList.add('on');
  }
  private renderBar() {
    const w = weigh(this.onScale), ok = w.debuff >= w.buff;
    const intake = this.layer.classList.contains('intake');
    const hint = this.mode === 'room' ? '← → pick a can · Enter open it · 1-8 a can' : this.mode === 'can' ? '← → pick a marble · Enter inspect · Q E next can' : this.mode === 'pan' ? '← → pick a marble on the pans · Enter inspect' : 'Enter put on / take off · ← → next marble · Esc back';
    this.bar.innerHTML = `
      <div class="tb-read"><span class="b">BUFF <b>${w.buff}</b> g</span><span class="st ${ok ? 'ok' : 'no'}">${ok ? (w.buff === w.debuff ? 'LEVEL' : 'LEANS DEBUFF') : 'LEANS BUFF'}</span><span class="d">DEBUFF <b>${w.debuff}</b> g</span></div>
      <div class="tb-hint">${esc(hint)}</div>
      <div class="tb-keys"></div>`;
    const keys = this.bar.querySelector('.tb-keys')!;
    const btn = (label: string, key: string, fn: () => void, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tb-key ' + cls; b.innerHTML = `<kbd>${esc(key)}</kbd>${esc(label)}`; b.addEventListener('click', () => fn()); keys.append(b); };
    btn(this.mode === 'room' ? (intake ? 'Back to the unit' : 'Leave the bench') : 'Back', 'Esc', () => { uiSound('back', 0.4); this.back(); });
    if (this.mode !== 'room') btn('Next can', 'E', () => this.stepCan(1));
    btn(intake ? 'Seal & link' : 'Seal', 'S', () => this.seal(), 'seal' + (ok ? '' : ' no'));
  }
  /** floating tags over the cans (and the marbles of the open can) */
  private placeTags() {
    if (!this.project) return;
    const out: string[] = [];
    const tag = (p: THREE.Vector3, html: string, cls = '') => { const s = this.project!(p); if (s) out.push(`<div class="tb-tag ${cls}" style="left:${s.x.toFixed(0)}px;top:${s.y.toFixed(0)}px">${html}</div>`); };
    if (this.mode === 'room') {
      this.cans.forEach((c, i) => {
        const own = c.marbles.filter((k) => marbleOwned(MARBLE.get(k)!)).length;
        const nw = c.marbles.some((k) => this.fresh.has(k));
        const p = this.v.set(c.x, this.TOP + HC + 0.05, c.z);
        tag(p, this.sel === i ? `<kbd>Enter</kbd>${esc(CANS[i].label)} <small>${own}/${c.marbles.length}</small>${nw ? ' <em>NEW</em>' : ''}` : `<kbd>${i + 1}</kbd>${nw ? '<em>NEW</em>' : ''}`, this.sel === i ? 'sel' : '');
      });
      if (this.sel === this.cans.length) tag(this.v.set(this.BX + 0.04, this.TOP + 0.42, this.ZC), '<kbd>Enter</kbd>The balance', 'sel');
      if (this.sel === this.cans.length + 1) tag(this.v.set(this.BX + 0.2, this.TOP + 0.12, this.ZC), '<kbd>S</kbd>Seal', 'sel');
    } else if (this.mode === 'can' || this.mode === 'pan') {
      const r = this.row();
      r.forEach((k, j) => {
        const st = this.ms.get(k)!, own = marbleOwned(st.m);
        const p = this.v.copy(st.pos); p.y += MR * 1.9;
        const sel = j === Math.min(this.sel, r.length - 1);
        tag(p, `${sel ? '<kbd>Enter</kbd>' : ''}${own ? esc(st.m.name) : '???'}`, (sel ? 'sel ' : '') + (st.m.kind === 'buff' ? 'buff' : 'debuff'));
      });
    }
    this.tags.innerHTML = out.join('');
  }

  // ================================================================== the camera
  camGoal(): Pose | null {
    if (this.mode === 'off') return null;
    const port = innerHeight > innerWidth * 1.05;
    const { BX, ZC, TOP } = this;
    const can = this.cans[this.canI];
    if (this.mode === 'card') {
      const P = this.standP;
      return port ? { pos: new THREE.Vector3(P.x + 0.3, P.y + 0.12, P.z - 0.02), look: new THREE.Vector3(P.x, P.y + 0.035, P.z - 0.02), fov: 40 }
        : { pos: new THREE.Vector3(P.x + 0.24, P.y + 0.09, P.z - 0.075), look: new THREE.Vector3(P.x, P.y + 0.005, P.z - 0.075), fov: 34 };
    }
    const mode = this.mode;
    if (mode === 'can') return { pos: new THREE.Vector3(can.x + (port ? 0.5 : 0.4), TOP + (port ? 0.32 : 0.26), can.z), look: new THREE.Vector3(can.x + 0.04, TOP + 0.06, can.z), fov: port ? 56 : 44 };
    if (mode === 'pan') return { pos: new THREE.Vector3(BX + (port ? 0.95 : 0.64), TOP + (port ? 0.5 : 0.4), ZC), look: new THREE.Vector3(BX + 0.04, TOP + 0.17, ZC), fov: 46 };
    return { pos: new THREE.Vector3(BX + (port ? 2.1 : 1.42), TOP + (port ? 0.85 : 0.58), ZC), look: new THREE.Vector3(BX - 0.03, TOP + 0.12, ZC), fov: 50 };
  }

  // ================================================================== frame
  update(dt: number, t: number, full: boolean, cam: THREE.PerspectiveCamera, latticeUp: boolean) {
    this.t = t; this.cam = cam;
    const on = this.mode !== 'off';
    // the pointer: the bench as a whole from the room; its parts once on it
    for (const h of this.hots) {
      if (!h.key.startsWith('tb:')) continue;
      if (h.key === 'tb:bench') { h.off = on || latticeUp; continue; }
      if (!on) { h.off = true; continue; }
      if (h.key === 'tb:scale' || h.key === 'tb:seal') { h.off = this.mode === 'card'; continue; }
      if (h.key === 'tb:stand') { h.off = this.mode !== 'card'; continue; }
      if (h.key.startsWith('tb:can:')) { const i = Number(h.key.slice(7)); h.off = this.mode === 'card' || (this.mode === 'can' && i === this.canI); continue; }
      const k = h.key.slice(5), st = this.ms.get(k);
      if (!st) continue;
      const inOpen = this.mode === 'can' && st.m.can === this.cans[this.canI].key && !this.onScale.has(k);
      h.off = !(inOpen || this.onScale.has(k) || this.held === k) || (this.mode === 'card' && this.held !== k);
      if (!h.off) h.sub = `${st.m.kind} · ${st.m.weight} g${marbleOwned(st.m) ? '' : ' · locked'}`;
      if (!h.off && !marbleOwned(st.m)) h.label = '??? (locked)'; else h.label = st.m.name;
    }
    const sh = this.hots.find((h) => h.key === 'tb:scale'); if (sh) { const w = weigh(this.onScale); sh.sub = `buff ${w.buff} g · debuff ${w.debuff} g · press to look at the pans`; }
    if (!full && !on) return;
    // ---- light: the clamp lamp is on while the bench is in use (and dimly otherwise)
    // (physical units: a lamp a hand's breadth away needs very little)
    this.lamp.intensity = damp(this.lamp.intensity, on ? 2.1 : 0.8, 4, dt);
    this.fill.intensity = damp(this.fill.intensity, on ? 0.75 : 0.2, 4, dt);
    this.strip.intensity = damp(this.strip.intensity, on ? 4.2 : 3.4, 4, dt);
    const open = this.mode === 'can' || (this.mode === 'card' && this.heldFrom === 'can');
    const can = this.cans[this.canI];
    const insp = this.mode === 'card';
    this.pen.intensity = damp(this.pen.intensity, open ? 0.1 : 0, 6, dt);
    this.standLight.intensity = damp(this.standLight.intensity, insp ? 0.7 : 0.05, 6, dt);
    this.standGlow.color.setScalar(damp(this.standGlow.color.r, insp ? 1.25 : 0.45, 5, dt));
    this.standTop.rotation.y += dt * (insp ? 0.5 : 0.08);
    this.sealFlash = Math.max(0, this.sealFlash - dt);
    if (open) this.pen.position.set(can.x + 0.26, this.TOP + 0.16, can.z);
    // ---- the cans: the open one tips toward you, the rest settle; the rattle dies down
    for (const c of this.cans) {
      const want = open && c === can;
      // the lid: a sprung pop, then it swings back on its hinge (and shuts again when the can settles)
      const lidGoal = want ? 1.95 : c.tilt > 0.15 ? c.lidA : 0;
      c.lidV += ((lidGoal - c.lidA) * 60 - c.lidV * 9) * Math.min(dt, 0.04);
      c.lidA = Math.max(-0.02, c.lidA + c.lidV * Math.min(dt, 0.04));
      if (c.lidA <= -0.02 && c.lidV < -0.5) { c.lidV *= -0.25; gameSound('metal_clank', 0.12, 1.7); }
      c.lid.rotation.z = Math.max(0, c.lidA);
      const goal = want && c.lidA > 1.2 ? TILT : 0;
      const prev = c.tilt;
      c.tilt = damp(c.tilt, goal, goal > c.tilt ? 6 : 9, dt);
      c.jig = Math.max(0, c.jig - dt * 1.6);
      c.group.rotation.z = -c.tilt + Math.sin(t * 40 + c.i) * c.jig * 0.012;
      if (prev > 0.5 && c.tilt <= 0.5 && goal === 0) gameSound('metal_clank', 0.18, 1.2);
    }
    // ---- the beam: a damped spring toward the weight difference, a shiver when it jams
    // ---- the beam: torque from the grams on each pan against the beam's own low centre of mass,
    //      inertia that grows with the load, air and pivot friction, hard end stops that knock
    const w = weigh(this.onScale);
    const inertia = 1 + 0.06 * (w.buff + w.debuff);
    for (let n = 0, h = Math.min(dt, 0.05) / 3; n < 3; n++) {
      const torque = (w.buff - w.debuff) * Math.cos(this.ang) - 29 * Math.sin(this.ang) - 3.2 * this.angV;
      this.angV += (torque / inertia) * h * 3;
      this.ang += this.angV * h;
      if (Math.abs(this.ang) > 0.26) { this.ang = Math.sign(this.ang) * 0.26; if (Math.abs(this.angV) > 0.25) gameSound('metal_clank', Math.min(0.3, Math.abs(this.angV) * 0.2), 1.3); this.angV *= -0.25; }
    }
    this.jam = Math.max(0, this.jam - dt);
    const sh2 = this.jam > 0 ? Math.sin(t * 70) * 0.012 * this.jam : 0;
    this.beam.rotation.x = this.ang + sh2;
    this.needle.rotation.x = this.ang + sh2;
    this.beam.updateMatrixWorld(true);
    for (const p of this.pans) {
      const s = p.userData.side as number;
      this.v.set(0, 0.008, s * BEAM).applyMatrix4(this.beam.matrixWorld);
      p.position.set(this.v.x, this.v.y - HANG, this.v.z);
      p.rotation.x = Math.sin(t * 1.3 + s) * 0.01 - this.angV * 0.02;
    }
    this.sealT = Math.max(0, this.sealT - dt);
    this.sealCap.position.y = this.TOP + 0.058 - (this.sealT > 0 ? 0.008 : 0);
    (this.sealCap.material as THREE.MeshStandardMaterial).emissive.setRGB(this.sealFlash > 0 ? 0.2 : balanced(this.onScale) && on ? 0.25 + Math.sin(t * 4) * 0.12 : 0.08, this.sealFlash > 0 ? 0.9 * (this.sealFlash % 0.3 > 0.15 ? 1 : 0.3) : 0, 0);
    this.group.updateMatrixWorld(true);
    // ---- the marbles: follow their spot, fly in arcs, roll as they move, spin in the light
    for (const st of this.ms.values()) {
      const k = st.m.key, goal = this.target(k, new THREE.Vector3());
      if (this.snap > 0) { st.fly = null; st.hop = -1; st.pos.copy(goal); }
      else if (st.fly) {
        st.fly.t += dt / st.fly.dur;
        const u = Math.min(1, st.fly.t), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        st.pos.lerpVectors(st.fly.from, goal, e); st.pos.y += Math.sin(u * Math.PI) * st.fly.arc;
        if (u >= 1) {
          // a landing on a pan: the knock swings the beam, then two bounces and a roll into the heap
          if (st.fly.pan) { this.angV += st.fly.pan * st.m.weight * 0.09; st.hop = 0; gameSound('glass_clink', 0.55, 0.95 + Math.random() * 0.1); gameSound('metal_clank', 0.12, 1.8); }
          st.fly = null;
        }
      } else st.pos.lerp(goal, 1 - Math.exp(-dt * (this.held === k ? 30 : 22)));
      if (st.hop >= 0) {
        const h0 = st.hop; st.hop += dt;
        const bounce = (q: number) => Math.abs(Math.sin(q * Math.PI * 2.6)) * Math.exp(-q * 6) * 0.03;
        st.pos.y += bounce(st.hop);
        for (const at0 of [0.385, 0.77]) if (h0 < at0 && st.hop >= at0) gameSound('glass_clink', at0 < 0.5 ? 0.3 : 0.15, 1.15 + at0 * 0.3);
        if (st.hop > 1.2) st.hop = -1;
      }
      st.scale = damp(st.scale, this.held === k ? LOUPE : 1, 8, dt);
      st.v.group.scale.setScalar(st.scale);
      // its caustic: a coloured focus thrown on the pan floor or the stand, away from the lamp
      const onPan = this.onScale.has(k) && !st.fly && this.held !== k, onStand = this.held === k;
      st.v.caustic.visible = onPan || onStand;
      if (st.v.caustic.visible) {
        const fy = onStand ? this.standP.y - MR * LOUPE * 0.92 + 0.0005 : st.pos.y - MR + 0.0012;
        const away = this.v.set(st.pos.x - this.lamp.position.x, 0, st.pos.z - this.lamp.position.z).normalize();
        const sc = onStand ? LOUPE * 1.25 : 1;
        st.v.caustic.position.set(st.pos.x + away.x * MR * 1.2 * sc, fy, st.pos.z + away.z * MR * 1.2 * sc);
        st.v.caustic.scale.setScalar(sc);
        (st.v.caustic.material as THREE.MeshBasicMaterial).opacity = onStand ? 1 : 0.7;
      }
      const d = this.v.subVectors(st.pos, st.last);
      const len = d.length();
      if (len > 1e-5 && this.held !== k) { const ax = new THREE.Vector3(d.z, 0, -d.x).normalize(); this.q.setFromAxisAngle(ax, len / MR); st.v.group.quaternion.premultiply(this.q); }
      if (this.held === k && !st.fly) { this.q.setFromAxisAngle(this.v.set(0, 1, 0), dt * 0.5); st.v.group.quaternion.premultiply(this.q); }
      st.last.copy(st.pos);
      st.v.group.position.copy(st.pos);
      st.v.update(t, dt, this.held === k ? 0.35 : 0);
      st.v.setLocked(!marbleOwned(st.m) && this.held !== k);
    }
    if (this.snap > 0) this.snap--;
    // ---- DOM
    if (on) {
      this.placeTags();
      if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.sub.classList.remove('on'); }
    }
  }
  /** dev / screenshots: everything to its spot now */
  settle() {
    for (const c of this.cans) { const open = (this.mode === 'can' || (this.mode === 'card' && this.heldFrom === 'can')) && c === this.cans[this.canI]; c.tilt = open ? TILT : 0; c.lidA = open ? 1.95 : 0; c.lidV = 0; c.jig = 0; }
    const w = weigh(this.onScale); this.ang = THREE.MathUtils.clamp(Math.atan((w.buff - w.debuff) / 29), -0.26, 0.26); this.angV = 0;
    for (const st of this.ms.values()) { st.fly = null; st.hop = -1; st.scale = this.held === st.m.key ? LOUPE : 1; }
    this.snap = 3;
  }
}

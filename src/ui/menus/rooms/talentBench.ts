// THE TALENT BENCH, against the control room's left wall by the door, as the room sees it: a steel lab bench
// under a clamp lamp, eight tins of marbles (survival/talents.ts) and a brass balance in the middle carrying
// the marbles the next unit is sealed with. Press it and the close-up opens on its own full-resolution
// renderer: the TALENT DESK (rooms/talentDesk.ts: pour the tins, drag the glass marbles onto the pans, the
// lab card, the seal). Here it is the far view: the beam tips with the sealed loadout, a tin with something
// newly earned glows at its lid.
//   bench.open()                       from the room: weigh the next unit (sealing saves the loadout)
//   await bench.open({ intake: true }) part of a new unit's creation: resolves with the sealed keys, or null
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import type { Hot } from '../monitor/stage';
import { FacetBuilder, at, cbox, prism, lathe, tube, bolt, C, paper, uiSound, glowCard } from '../monitor/props';
import { bitText } from '../../../gfx/bitfont';
import { MARBLES, MARBLE, CANS, weigh } from '../../../survival/talents';
import { loadout, freshMarbles } from '../../../game/talentFile';
import { buildMarble, type Marble3D } from './marble3d';
import { TalentDesk } from './talentDesk';
import './talent.css';

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
const RC = 0.058, HC = 0.13, MR = 0.014;
const PAN_R = 0.07, BEAM = 0.16, HANG = 0.165;

interface Can { i: number; key: string; group: THREE.Group; body: THREE.Group; lid: THREE.Group; marbles: string[]; x: number; z: number }
export interface BenchSpot { wallX: number; z0: number; z1: number; top: number }

export class TalentBench {
  group = new THREE.Group();
  /** screen position of a world point (title.ts hands over the stage's; kept for callers) */
  project?: (p: THREE.Vector3) => { x: number; y: number } | null;
  /** the close-up took the screen / gave it back (title.ts pauses the stage and hides its HUD) */
  onFocus?: (on: boolean) => void;
  private mats: FMats;
  private hots: Hot[];
  private S: BenchSpot;
  private BX: number; private ZC: number; private TOP: number;
  private cans: Can[] = [];
  private onPan = new Map<string, Marble3D>();
  private onScale = new Set<string>();
  private desk: TalentDesk | null = null;
  private beam = new THREE.Group();
  private pans: THREE.Group[] = [];
  private needle = new THREE.Group();
  private ang = 0; private angV = 0;
  private sealBtn = new THREE.Group(); private sealCap!: THREE.Mesh;
  private lamp = new THREE.SpotLight(0xffe2b8, 0, 2.6, 0.82, 0.55, 1.4);
  private strip = new THREE.SpotLight(0xe8f0ff, 0, 3.4, 1.05, 0.8, 1.3);
  private fill = new THREE.PointLight(0xdfe8ff, 0, 2.4, 1.6);
  private pen = new THREE.PointLight(0xfff4e0, 0, 0.6, 1.8);
  private glint = new THREE.Group();
  private fresh = new Set<string>();
  private v = new THREE.Vector3();

  constructor(mats: FMats, hots: Hot[], spot: BenchSpot) {
    this.mats = mats; this.hots = hots; this.S = spot;
    this.BX = spot.wallX + 0.34; this.ZC = (spot.z0 + spot.z1) / 2; this.TOP = spot.top;
    this.group.name = 'talentBench';
    this.group.add(this.benchBody(), this.scale(), this.sealButton());
    this.buildCans();
    this.lights();
    this.reload();
    this.hots.push({ key: 'tb:bench', objs: [this.group], glow: [], label: 'Talent bench', sub: '', press: () => { uiSound('tick', 0.6); void this.open(); } });
    if (import.meta.env.DEV) (window as any).__talent = this;
  }
  get active() { return !!this.desk; }
  get inspecting() { return false; }
  /** the dev handle on the open close-up */
  get deskView() { return this.desk; }

  /** the close-up: the talent desk on its own renderer */
  open(o: { intake?: boolean } = {}): Promise<string[] | null> {
    if (this.desk) return Promise.resolve(null);
    this.onFocus?.(true);
    return new Promise((res) => {
      this.desk = new TalentDesk({ intake: !!o.intake, onDone: (keys) => { this.desk = null; this.onFocus?.(false); this.reload(); res(keys); } });
    });
  }
  close(_silent = false) { this.desk?.close(null); }
  back(): boolean { if (!this.desk) return false; this.desk.close(null); return true; }
  miss(): boolean { return !!this.desk; }
  camGoal(): Pose | null { return null; }
  settle() { this.desk?.settle(); this.ang = Math.atan((weigh(this.onScale).buff - weigh(this.onScale).debuff) / 29); this.angV = 0; }
  /** the sealed loadout onto the pans, the glow on fresh tins */
  private reload() {
    this.onScale = new Set(loadout());
    this.fresh = freshMarbles();
    for (const [k, v] of this.onPan) if (!this.onScale.has(k)) { v.group.removeFromParent(); v.caustic.removeFromParent(); this.onPan.delete(k); }
    for (const k of this.onScale) if (!this.onPan.has(k) && MARBLE.has(k)) { const v = buildMarble(MARBLE.get(k)!, MR); this.group.add(v.group); this.onPan.set(k, v); }
    for (const c of this.cans) { const g = c.lid.getObjectByName('fresh'); if (g) g.visible = c.marbles.some((m) => this.fresh.has(m)); }
  }

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
    // the weigh-in log by the balance, a loupe
    const log = paper(['WEIGH-IN LOG', '~', '~', '~', '~'], 0.12, 0.16, { seed: 61, rule: true });
    log.rotation.set(-Math.PI / 2, 0, 0.4); log.position.set(BX + 0.2, TOP + 0.006, ZC - 0.3); g.add(log);
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
    // the beam: a brass bar on the knife edge, end hooks; the needle hangs from the pivot
    const bb = new FacetBuilder();
    bb.add('brass', cbox(0.016, 0.022, BEAM * 2 + 0.03, 0.006), 0x7e6430, at(0, 0, 0));
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
      pb.add('brass', lathe([[0, 0], [PAN_R * 0.7, 0], [PAN_R, 0.014], [PAN_R + 0.004, 0.018], [PAN_R - 0.002, 0.018], [PAN_R * 0.66, 0.004], [0, 0.004]], 22), side > 0 ? 0x7a6232 : 0x6a5230);
      for (let k = 0; k < 3; k++) { const a = k * (Math.PI * 2 / 3) + 0.5; pb.add('chrome', tube([[Math.cos(a) * PAN_R * 0.92, 0.016, Math.sin(a) * PAN_R * 0.92], [0, HANG, 0]], 0.0016, 2, 3, false), 0x9a9a92); }
      pb.add('brass', prism(0.008, 0.012, 8), 0xc89a48, at(0, HANG, 0));
      p.add(pb.build(this.mats, { cast: true }));
      p.userData.side = side;
      this.pans.push(p);
      g.add(p);
    }
    return g;
  }
  /** the dial: a green arc (level or leaning to the debuffs) and a red one (too much buff) */
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
    // the name centred on the part that faces the operator (the label's middle), sized to fit
    const sc = C0.label.length > 4 ? 1 : 2;
    bitText(c, C0.label, W / 2, sc === 2 ? 9 : 16, { color: hx(C0.ink), outline: null, shadow: null, align: 'center', scale: sc });
    let s = i * 97 + 3; const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 260; k++) { c.fillStyle = R() < 0.5 ? 'rgba(90,60,30,0.16)' : 'rgba(255,250,230,0.14)'; c.fillRect(R() * W, R() * H, 1 + R() * 2, 1); }
    const rx = R() * W, ry = H * 0.6;
    for (let k = 0; k < 60; k++) { c.fillStyle = 'rgba(140,70,20,0.25)'; c.fillRect(rx + (R() - 0.5) * 18, ry + (R() - 0.3) * 14, 2, 2); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
    return tex;
  }
  /** the printed disc on a lid: the can's colour, its number */
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
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7af08a, toneMapped: false }));
      dot.position.set(RC + RC * 0.62, 0.006, 0); dot.name = 'fresh'; dot.visible = false; dot.userData.noGlow = true; lid.add(dot);
      lid.position.set(-RC, HC + 0.001, 0);
      body.add(lid);
      // pivot on the front edge of the foot (it tips toward the operator, +x)
      body.position.set(-RC, 0, 0);
      group.add(body);
      group.position.set(x + RC, this.TOP + 0.004, z);
      this.group.add(group);
      const can: Can = { i, key: C0.key, group, body, lid, marbles: MARBLES.filter((m) => m.can === C0.key).map((m) => m.key), x, z };
      this.cans.push(can);
    });
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

  // ================================================================== where the sealed marbles sit
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

  // ================================================================== frame
  update(dt: number, t: number, full: boolean, _cam: THREE.PerspectiveCamera, latticeUp: boolean) {
    for (const h of this.hots) if (h.key === 'tb:bench') h.off = !!this.desk || latticeUp;
    if (!full || this.desk) return;
    this.lamp.intensity = damp(this.lamp.intensity, 0.9, 4, dt);
    this.fill.intensity = damp(this.fill.intensity, 0.25, 4, dt);
    this.strip.intensity = damp(this.strip.intensity, 3.6, 4, dt);
    // the beam settles on the sealed loadout
    const w = weigh(this.onScale);
    const inertia = 1 + 0.06 * (w.buff + w.debuff);
    for (let n = 0, h = Math.min(dt, 0.05) / 3; n < 3; n++) {
      const torque = (w.buff - w.debuff) * Math.cos(this.ang) - 29 * Math.sin(this.ang) - 3.2 * this.angV;
      this.angV += (torque / inertia) * h * 3; this.ang += this.angV * h;
      if (Math.abs(this.ang) > 0.26) { this.ang = Math.sign(this.ang) * 0.26; this.angV *= -0.25; }
    }
    this.beam.rotation.x = this.ang; this.needle.rotation.x = this.ang;
    this.beam.updateMatrixWorld(true);
    for (const p of this.pans) { const s = p.userData.side as number; this.v.set(0, 0.008, s * BEAM).applyMatrix4(this.beam.matrixWorld); p.position.set(this.v.x, this.v.y - HANG, this.v.z); }
    this.group.updateMatrixWorld(true);
    const lists = { buff: [] as string[], debuff: [] as string[] };
    for (const k of this.onPan.keys()) lists[MARBLE.get(k)!.kind].push(k);
    for (const [k, v] of this.onPan) { const m = MARBLE.get(k)!; this.panSlot(m.kind === 'buff' ? 1 : -1, lists[m.kind].indexOf(k), v.group.position); }
    for (const c of this.cans) { const g = c.lid.getObjectByName('fresh') as THREE.Mesh | undefined; if (g?.visible) (g.material as THREE.MeshBasicMaterial).color.setScalar(0.6 + Math.sin(t * 3 + c.i) * 0.4); }
  }
}

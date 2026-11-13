// Round 16: found objects for the controls that came after the first set (see props.ts for the
// style): a bone die that tumbles for ROLL, a scuffed rubber knee pad that lies down flat for
// CRAWL, a handheld scanner whose dish turns and whose screen glows while held for SCAN, a
// clipboard with its lamp for the TASK BOARD (its top sheet lifts while the board is up, the
// lamp burns while fresh work waits) and a stethoscope for SELF (inspect yourself).
import * as THREE from 'three';
import { Mold, M, DEG, PAINT, STEEL, CHROME, BRASS, RUBBER, PLASTIC, GLASS, PAPER, Surf } from './stage3d';
import { Thing } from './props';
import { fcyl, fbox, fball, fring, gem, flathe, segs } from './facet';
import { sfx, haptic } from './sfx';

const PI = Math.PI;
const cyl = (r: number, h: number, seg = 12, rb = r) => fcyl(r, h, segs(seg), rb, 0.16);
const box = (w: number, h: number, d: number, c = 0.16) => fbox(w, h, d, c);
const hash = (x: number, y: number, z = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const SURF = (base: Surf, blood: number): Surf => [base[0], base[1], blood, base[3]];
const setGlow = (m: THREE.ShaderMaterial, rgb: number, k: number) => {
  (m.uniforms.uGlow.value as THREE.Vector3).set(((rgb >> 16) & 255) / 255 * k, ((rgb >> 8) & 255) / 255 * k, (rgb & 255) / 255 * k);
};
const ease = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, k);
const _up = new THREE.Vector3(0, 1, 0);
/** a few-sided tube between two points */
function rod(m: Mold, a: [number, number, number], b: [number, number, number], r: number, color: number, surf: Surf, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  m.add(fcyl(r, 1, seg, r, 0), new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, len, 1)), color, surf);
}
/** a tube along a polyline */
function tube(m: Mold, pts: [number, number, number][], r: number, color: number, surf: Surf) {
  for (let i = 1; i < pts.length; i++) rod(m, pts[i - 1], pts[i], r, color, surf, 6);
  for (let i = 1; i < pts.length - 1; i++) m.add(fball(r, 6, 3), M(...pts[i]), color, surf);
}

// =====================================================================
// ROLL: a big bone die; a press tumbles it a quarter turn
// =====================================================================
export class Die extends Thing {
  private cube = new THREE.Group();
  private spin = 0; private goal = 0;
  constructor() {
    super('roll');
    this.elev = 40 * DEG; this.fit = 1.0; this.k = 1300;
    this.cube.position.set(0, 0.26, 0);
    this.body.add(this.cube);
    const s = 0.46, m = new Mold();
    m.add(box(s, s, s, 0.22), null, (x, y, z) => (hash(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30)) > 0.9 ? 0xc8bc9c : 0xe8e0c8), SURF(PLASTIC, 0.8));
    // pips: dark dimples on each face (1 top, 2 front, 3 right, 4 back, 5 left, 6 bottom)
    const pip = (x: number, y: number, z: number) => m.add(gem(0.04, 0, 0.05), M(x, y, z, 0, 0, 0, 1, 1, 1), 0x1a0e0a, PLASTIC);
    const h = s / 2 + 0.005, d = 0.12;
    pip(0, h, 0);
    pip(-d, d, h); pip(d, -d, h);
    pip(h, d, -d); pip(h, 0, 0); pip(h, -d, d);
    for (const [a, b] of [[-d, -d], [d, -d], [-d, d], [d, d]]) pip(a, b, -h);
    for (const [a, b] of [[-d, -d], [d, -d], [-d, d], [d, d], [0, 0]]) pip(-h, a, b);
    for (const [a, b] of [[-d, -d], [d, -d], [-d, d], [d, d], [-d, 0], [d, 0]]) pip(a, -h, b);
    this.mesh(m, this.mat({ wear: 0.5 }), this.cube);
    this.cube.rotation.set(0.2, 0.55, 0);
    this.tape('ROLL', 0, 0.004, 0.36);
  }
  protected onDown() { sfx('tc_clack', 0.5, 0.8); haptic(10); this.goal += PI / 2; }
  protected animate(dt: number) {
    this.spin = ease(this.spin, this.goal, dt * 9);
    // a tumble forward with a hop at the top of it
    this.cube.rotation.x = 0.2 + this.spin;
    const ph = (this.goal - this.spin) / (PI / 2);
    this.cube.position.y = 0.26 + Math.sin(Math.min(1, ph) * PI) * 0.16 - this.press * 0.03;
    return Math.abs(this.goal - this.spin) > 0.002;
  }
}

// =====================================================================
// CRAWL: a black rubber knee pad on its strap; it lies flat while prone
// =====================================================================
export class KneePad extends Thing {
  private pad = new THREE.Group();
  private lay = 0;
  constructor() {
    super('crawl');
    this.elev = 50 * DEG; this.fit = 1.05; this.k = 900;
    this.pad.position.set(0, 0.04, 0);
    this.body.add(this.pad);
    const m = new Mold();
    // the hard cap: a ribbed dome
    m.add(flathe([[0.3, 0], [0.3, 0.06], [0.26, 0.15], [0.17, 0.22], [0, 0.25]], 10), M(0, 0, 0, PI / 2, 0, 0, 1, 1.25, 1), 0x24241f, RUBBER);
    for (let i = -1; i <= 1; i++) m.add(box(0.06, 0.04, 0.5, 0.3), M(i * 0.11, 0.23 - Math.abs(i) * 0.05, 0.0, 0, 0, i * -0.35), 0x3a3a32, RUBBER);
    // the foam liner peeking out, the straps with their buckle
    m.add(fring(0.29, 0.035, 10, 4), M(0, 0.0, 0, PI / 2, 0, 0, 1, 1.25, 1), 0x6a5a3a, PLASTIC);
    for (const z of [-0.2, 0.2]) {
      m.add(box(0.86, 0.03, 0.09, 0.2), M(0, -0.02, z), 0x3a3f2a, SURF(PAINT, 0.8));
      m.add(box(0.1, 0.05, 0.12, 0.2), M(0.4, -0.01, z), 0xb8bcb4, CHROME);
    }
    // a yellow safety tab with the stencil
    m.add(box(0.14, 0.02, 0.1, 0.2), M(0, 0.25, 0.22, -0.4, 0, 0), 0xd8a51c, PAINT);
    this.mesh(m, this.mat({ wear: 0.7 }), this.pad);
    this.tape('CRAWL', 0, 0.004, 0.48);
  }
  protected onDown() { sfx('tc_squish', 0.4, 0.7); haptic(10); }
  protected animate(dt: number) {
    const goal = this.on ? 1 : 0;
    this.lay = ease(this.lay, goal, dt * 7);
    // standing on its edge at rest, flat on the floor while prone
    this.pad.rotation.x = -0.9 * (1 - this.lay) - this.press * 0.25;
    this.pad.position.y = 0.04 + (1 - this.lay) * 0.2;
    this.pad.position.z = (1 - this.lay) * -0.05;
    return Math.abs(goal - this.lay) > 0.003;
  }
}

// =====================================================================
// SCAN: a handheld scanner: olive body, a green screen, a dish that turns while held
// =====================================================================
export class ScanWand extends Thing {
  private dish = new THREE.Group();
  private scrM: THREE.ShaderMaterial;
  private lampM: THREE.ShaderMaterial;
  private a = 0; private glow = 0;
  constructor() {
    super('scan');
    this.elev = 52 * DEG; this.fit = 1.05; this.k = 1500;
    const m = new Mold();
    m.add(box(0.42, 0.14, 0.62, 0.2), M(0, 0.07, 0.06), (_x, y) => (y > 0.12 ? 0x6e7a4c : 0x56603c), SURF(PAINT, 0.8));
    m.add(box(0.16, 0.12, 0.34, 0.25), M(0, 0.05, 0.46), 0x1e1f1a, RUBBER);
    for (let i = 0; i < 4; i++) m.add(box(0.17, 0.02, 0.025, 0.2), M(0, 0.115, 0.34 + i * 0.07), 0x2e2f28, RUBBER);
    m.add(box(0.06, 0.05, 0.08, 0.2), M(0.14, 0.15, 0.24), 0xc8281c, PLASTIC);
    m.add(box(0.06, 0.05, 0.08, 0.2), M(0.14, 0.15, 0.14), 0xd8a51c, PLASTIC);
    // the hazard band round the nose
    m.add(box(0.43, 0.145, 0.05, 0.1), M(0, 0.072, -0.2), (x) => (Math.floor((x + 1) * 18) % 2 ? 0xe0ac22 : 0x17150e), PAINT);
    // the mast for the dish
    m.add(cyl(0.035, 0.18, 6), M(0, 0.22, -0.16), 0xb8c0bc, CHROME);
    this.mesh(m, this.mat({ wear: 0.6 }));
    // the screen and its bezel
    this.scrM = this.mat();
    this.mesh(new Mold().add(box(0.3, 0.02, 0.2, 0.2), M(0, 0.15, 0.02), 0x0c1a10, GLASS, 1), this.scrM);
    this.lampM = this.mat();
    this.mesh(new Mold().add(gem(0.035, 0, 0.05), M(-0.14, 0.16, 0.22), 0x3cff6a, GLASS, 1), this.lampM);
    // the dish: a shallow cone with a feed horn
    this.dish.position.set(0, 0.32, -0.16);
    this.body.add(this.dish);
    const d = new Mold();
    d.add(flathe([[0.02, 0], [0.16, 0.05], [0.2, 0.07], [0.19, 0.08], [0.02, 0.02]], 8), M(0, 0, 0, -PI / 2.6, 0, 0), 0xa8b0aa, STEEL);
    d.add(cyl(0.02, 0.12, 6), M(0, 0.04, 0.05, -PI / 2.6, 0, 0), 0xc8ccc4, CHROME);
    this.mesh(d, this.mat({ wear: 0.4 }), this.dish);
    this.tape('SCAN', 0, 0.004, 0.5);
  }
  protected onDown() { sfx('tc_tick', 0.4, 1.4); haptic(8); }
  protected onUp() { sfx('tc_tick', 0.3, 0.9); }
  protected animate(dt: number) {
    const hot = this.held ? 1 : 0;
    this.glow = ease(this.glow, hot, dt * 10);
    this.a += dt * (0.4 + this.glow * 7);
    this.dish.rotation.y = this.a;
    const flick = this.held ? 0.85 + Math.sin(performance.now() * 0.03) * 0.15 : 0;
    setGlow(this.scrM, 0x3cff6a, 0.2 + this.glow * 0.9 * flick);
    setGlow(this.lampM, 0x3cff6a, this.held ? 1 : 0.15);
    this.dip(0.02);
    return true;
  }
}

// =====================================================================
// TASKS: a clipboard with the board's offers; its top sheet lifts while the board is up,
// the little lamp on the clip burns while fresh work waits
// =====================================================================
export class Clipboard extends Thing {
  private sheet = new THREE.Group();
  private lampM: THREE.ShaderMaterial;
  private lift = 0;
  fresh = false;
  constructor() {
    super('quest');
    this.elev = 56 * DEG; this.fit = 1.05;
    const m = new Mold();
    m.add(box(0.62, 0.04, 0.84, 0.15), M(0, 0.02, 0), (x, _y, z) => (hash(Math.round(x * 16), 0, Math.round(z * 16)) > 0.85 ? 0x6a4a24 : 0x8a5a2a), SURF(PAINT, 0.8));
    // the under-sheets
    m.add(box(0.54, 0.012, 0.7, 0.05), M(0.01, 0.048, 0.04), 0xd8d0b8, PAPER);
    // the clip: a steel bar, its spring roll and lever
    m.add(box(0.36, 0.05, 0.08, 0.2), M(0, 0.07, -0.37), 0xb8bcb4, CHROME);
    m.add(cyl(0.035, 0.36, 8), M(0, 0.09, -0.4, 0, 0, PI / 2), 0x9aa29c, STEEL);
    m.add(box(0.12, 0.03, 0.12, 0.2), M(0, 0.12, -0.44, 0.4, 0, 0), 0xa8b0aa, STEEL);
    this.mesh(m, this.mat({ wear: 0.6 }));
    this.lampM = this.mat();
    this.mesh(new Mold().add(cyl(0.05, 0.03, 8), M(0.24, 0.08, -0.37), 0x3a3f38, STEEL).add(gem(0.04, 0, 0.05), M(0.24, 0.11, -0.37), 0xffb02a, GLASS, 1), this.lampM);
    // the top sheet, hinged at the clip
    this.sheet.position.set(0, 0.06, -0.32);
    this.body.add(this.sheet);
    const s = new Mold();
    s.add(box(0.54, 0.008, 0.72, 0.05), M(0, 0, 0.36), 0xf0ead6, PAPER);
    for (let i = 0; i < 5; i++) s.add(box(i % 2 ? 0.28 : 0.38, 0.004, 0.025, 0), M(-0.06 + (i % 2) * -0.05, 0.006, 0.16 + i * 0.1), 0x4a4438, PAPER);
    s.add(box(0.06, 0.004, 0.06, 0), M(0.18, 0.006, 0.16), 0xb3261c, PAPER);
    this.mesh(s, this.mat({ wear: 0.3 }), this.sheet);
    this.tape('TASKS', 0, 0.004, 0.5);
  }
  protected onDown() { sfx('tc_paper', 0.45); haptic(8); }
  protected animate(dt: number) {
    const goal = this.on ? 1 : 0;
    this.lift = ease(this.lift, goal, dt * 7);
    this.sheet.rotation.x = -this.lift * 1.1;
    this.dip(0.02);
    setGlow(this.lampM, 0xffb02a, this.fresh ? 0.65 + Math.sin(performance.now() * 0.008) * 0.35 : 0);
    return this.fresh || Math.abs(goal - this.lift) > 0.003;
  }
}

// =====================================================================
// SELF: a stethoscope coiled on the panel (inspect yourself)
// =====================================================================
export class Stethoscope extends Thing {
  private chest = new THREE.Group();
  private beat = 0;
  constructor() {
    super('self');
    this.elev = 58 * DEG; this.fit = 1.05;
    const m = new Mold();
    const tubeC = 0x2a2a26, ear = 0xb8bcb4;
    // the binaural: two steel ear tubes with black tips, the spring between them
    tube(m, [[-0.22, 0.04, -0.36], [-0.17, 0.04, -0.2], [-0.07, 0.04, -0.06]], 0.022, ear, STEEL);
    tube(m, [[0.22, 0.04, -0.36], [0.17, 0.04, -0.2], [0.07, 0.04, -0.06]], 0.022, ear, STEEL);
    for (const x of [-0.22, 0.22]) m.add(gem(0.045, 0, 0.1), M(x, 0.05, -0.38), 0x141412, RUBBER);
    rod(m, [-0.17, 0.04, -0.22], [0.17, 0.04, -0.22], 0.012, 0x9aa29c, STEEL, 5);
    // the Y and the tubing curling down to the chest piece
    tube(m, [[-0.07, 0.04, -0.06], [0, 0.04, 0.02], [0.07, 0.04, -0.06]], 0.028, tubeC, RUBBER);
    tube(m, [[0, 0.04, 0.02], [-0.06, 0.04, 0.14], [-0.2, 0.04, 0.22], [-0.24, 0.04, 0.34], [-0.12, 0.04, 0.42], [0.04, 0.04, 0.38], [0.14, 0.04, 0.3]], 0.03, tubeC, RUBBER);
    this.mesh(m, this.mat({ wear: 0.4 }));
    this.chest.position.set(0.2, 0.04, 0.26);
    this.body.add(this.chest);
    const c = new Mold();
    c.add(cyl(0.13, 0.06, 12), M(0, 0.03, 0), 0xc8ccc4, CHROME);
    c.add(cyl(0.11, 0.012, 12), M(0, 0.065, 0), 0x1c1c18, PLASTIC);
    c.add(fring(0.11, 0.012, 12, 4), M(0, 0.07, 0, PI / 2, 0, 0), 0xe8e8e0, CHROME);
    c.add(cyl(0.03, 0.08, 6), M(-0.08, 0.05, -0.06, 0, 0, PI / 2.4), 0xb8bcb4, BRASS);
    this.mesh(c, this.mat({ wear: 0.3 }), this.chest);
    this.tape('SELF', 0, 0.004, 0.52);
  }
  protected onDown() { sfx('tc_clack', 0.4, 1.2); haptic([6, 30, 6]); this.beat = 1; }
  protected animate(dt: number) {
    this.beat = Math.max(0, this.beat - dt * 2);
    const b = this.beat > 0 ? Math.abs(Math.sin(this.beat * PI * 2)) : 0;
    this.chest.scale.setScalar(1 + b * 0.12 + this.press * 0.05);
    this.dip(0.02);
    return this.beat > 0;
  }
}

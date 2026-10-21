// More found-object controls for the physical overhaul (see props.ts for the
// style): a yellow rubber work glove to GRAB (its fingers close into a fist
// while you hold on), a throttle lever for POWER, a rubber squeeze bulb for the
// lung PUMP, a chunky steel wristwatch for the WATCH, a riveted iron cube for the
// backpack, a spirit level for BUILD and a pair of wind-up chattering teeth
// for EMOTE.
import * as THREE from 'three';
import { Mold, M, DEG, PAINT, STEEL, CHROME, BRASS, RUBBER, PLASTIC, GLASS, Surf } from './stage3d';
import { Thing } from './props';
import { sfx, haptic } from './sfx';

const PI = Math.PI;
const cyl = (r: number, h: number, seg = 12, rb = r) => new THREE.CylinderGeometry(r, rb, h, seg, 1, false);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs);
const hash = (x: number, y: number, z = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const SURF = (base: Surf, blood: number): Surf => [base[0], base[1], blood, base[3]];
const setGlow = (m: THREE.ShaderMaterial, rgb: number, k: number) => {
  (m.uniforms.uGlow.value as THREE.Vector3).set(((rgb >> 16) & 255) / 255 * k, ((rgb >> 8) & 255) / 255 * k, (rgb & 255) / 255 * k);
};
const ease = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, k);

// =====================================================================
// GRAB: a yellow rubber work glove; the fingers close while it holds on
// =====================================================================
export class Glove extends Thing {
  private fingers: THREE.Group[] = [];
  private thumb = new THREE.Group();
  private curl = 0;
  constructor() {
    super('grab');
    this.elev = 52 * DEG; this.fit = 1.1; this.k = 1000; this.bloodK = 0.6;
    const rub = (x: number, y: number, z: number) => (hash(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30)) > 0.88 ? 0xb88f1c : 0xe2b21f);
    const palm = new Mold();
    palm.add(box(0.5, 0.14, 0.46), M(0, 0.08, 0.1), rub, SURF(RUBBER, 1));
    palm.add(cyl(0.2, 0.36, 10), M(0, 0.08, 0.48, PI / 2, 0, 0, 1.25, 1, 0.55), 0xc99a17, RUBBER); // the cuff
    palm.add(box(0.5, 0.02, 0.06), M(0, 0.155, 0.36), 0x9a7413, RUBBER);
    this.mesh(palm, this.mat({ wear: 0.75 }));
    const xs = [-0.18, -0.06, 0.06, 0.18], ls = [0.26, 0.32, 0.34, 0.3];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.set(xs[i], 0.08, -0.13);
      const f = new Mold();
      f.add(box(0.1, 0.1, ls[i]), M(0, 0, -ls[i] / 2), rub, SURF(RUBBER, 1));
      f.add(sph(0.05, 8, 5), M(0, 0, -ls[i]), 0xe0ae1c, RUBBER);
      this.mesh(f, this.mat({ wear: 0.75 }), g);
      this.body.add(g);
      this.fingers.push(g);
    }
    this.thumb.position.set(-0.26, 0.07, 0.12);
    this.thumb.rotation.y = 0.7;
    this.mesh(new Mold().add(box(0.11, 0.1, 0.24), M(0, 0, -0.12), rub, SURF(RUBBER, 1)).add(sph(0.055, 8, 5), M(0, 0, -0.24), 0xe0ae1c, RUBBER), this.mat({ wear: 0.75 }), this.thumb);
    this.body.add(this.thumb);
    this.tape('GRAB', 0, 0.162, 0.2);
  }
  protected onDown() { sfx('tc_squish', 0.5, 0.8); haptic(16); }
  protected onUp() { sfx('tc_squeak', 0.3, 1.2); }
  protected animate(dt: number) {
    const goal = Math.max(this.press, this.on ? 1 : 0);
    this.curl = ease(this.curl, goal, dt * 12);
    const t = performance.now() * 0.03;
    for (let i = 0; i < 4; i++) this.fingers[i].rotation.x = -this.curl * (1.5 + i * 0.05) + (this.on ? Math.sin(t + i) * 0.03 : 0);
    this.thumb.rotation.z = this.curl * 0.9;
    return Math.abs(goal - this.curl) > 0.003;
  }
}

// =====================================================================
// POWER: a throttle lever in a slotted quadrant (forward = everything you have)
// =====================================================================
export class Throttle extends Thing {
  private lever = new THREE.Group();
  private lampM: THREE.ShaderMaterial;
  private pos = 0;
  constructor() {
    super('power');
    this.elev = 40 * DEG; this.fit = 1.05; this.k = 1300;
    const b = new Mold();
    b.add(box(0.5, 0.12, 0.9), M(0, 0.06, 0), 0x3d3f3a, SURF(PAINT, 0.5));
    b.add(box(0.1, 0.02, 0.7), M(0, 0.125, 0), 0x0e0e0d, RUBBER); // the slot
    for (const z of [-0.36, 0.36]) for (const x of [-0.19, 0.19]) b.add(cyl(0.025, 0.02, 6), M(x, 0.13, z), 0xa8aaa2, CHROME);
    // a painted scale: idle .. full
    for (let i = 0; i < 6; i++) b.add(box(0.12, 0.012, 0.025), M(0.15, 0.128, -0.28 + i * 0.11), i > 3 ? 0xc0392b : 0xd9cfae, PAINT);
    this.mesh(b, this.mat({ wear: 0.6 }));
    this.lever.position.set(0, 0.12, 0.28);
    this.body.add(this.lever);
    const l = new Mold();
    l.add(cyl(0.035, 0.62, 8), M(0, 0.31, 0), 0x8e918a, SURF(STEEL, 0.6));
    l.add(sph(0.12, 12, 8), M(0, 0.66, 0), 0xb3221a, SURF(PLASTIC, 1));
    this.mesh(l, this.mat({ wear: 0.5 }), this.lever);
    this.lampM = this.mat();
    this.mesh(new Mold().add(cyl(0.05, 0.04, 10), M(-0.16, 0.14, -0.34), 0x3a1206, GLASS, 1), this.lampM);
    this.tape('POWER', 0, 0.004, 0.52);
  }
  protected onDown() { sfx('tc_ratchet', 0.5, 0.9); haptic(14); }
  protected onUp(c: boolean) { if (!c) sfx('tc_clack_up', 0.3, 0.8); }
  protected animate(dt: number) {
    const goal = Math.max(this.press, this.on ? 1 : 0);
    this.pos = ease(this.pos, goal, dt * 14);
    this.lever.rotation.x = -0.55 + this.pos * 1.05;
    setGlow(this.lampM, 0xff8a1a, this.pos > 0.5 ? 0.9 + Math.sin(performance.now() * 0.02) * 0.1 : 0);
    return Math.abs(goal - this.pos) > 0.003;
  }
}

// =====================================================================
// PUMP: a black rubber squeeze bulb (H: work the lungs)
// =====================================================================
export class Bulb extends Thing {
  private bulb = new THREE.Group();
  constructor() {
    super('pump');
    this.elev = 30 * DEG; this.fit = 1.0; this.k = 700;
    this.bulb.position.set(0.05, 0.0, 0);
    this.body.add(this.bulb);
    const b = new Mold();
    b.add(sph(1, 14, 10), M(0, 0, 0, 0, 0, 0, 0.32, 0.27, 0.27), (x, y) => (y > 0.12 ? 0x3a3733 : hash(Math.round(x * 20), Math.round(y * 20)) > 0.85 ? 0x1a1917 : 0x262422), SURF(RUBBER, 1));
    this.mesh(b, this.mat({ wear: 0.4 }), this.bulb);
    const v = new Mold();
    v.add(cyl(0.07, 0.16, 10), M(-0.38, 0, 0, 0, 0, PI / 2), 0xb3b5ad, CHROME);
    v.add(cyl(0.04, 0.08, 8), M(-0.5, 0, 0, 0, 0, PI / 2), 0xc0a35a, BRASS);
    v.add(cyl(0.035, 0.12, 8), M(0.37, 0, 0, 0, 0, PI / 2), 0x9a9c95, CHROME);
    // the tube to the lungs, off the edge of the panel
    for (let i = 0; i < 5; i++) v.add(cyl(0.03, 0.14, 6), M(-0.6 - i * 0.1, -0.03 - i * 0.04, 0.02 * i, 0, 0, PI / 2 + i * 0.15), 0x1c1b19, RUBBER);
    this.mesh(v, this.mat({ wear: 0.6 }));
    this.tape('PUMP', 0, -0.33, 0.22, 'front');
  }
  protected onDown() { sfx('tc_hiss', 0.5, 1.1); haptic(20); }
  protected onUp(c: boolean) { if (!c) sfx('tc_squish', 0.35, 1.3); }
  protected animate() {
    const k = this.press;
    this.bulb.scale.set(1 + k * 0.22, 1 - k * 0.45, 1 + k * 0.12);
    return false;
  }
}

// =====================================================================
// WATCH: the band's watch face (Tab); it glows while it is up
// =====================================================================
export class WristWatch extends Thing {
  private faceM: THREE.ShaderMaterial;
  private crown = new THREE.Group();
  private hand = new THREE.Group();
  constructor() {
    super('scanner');
    this.elev = 58 * DEG; this.fit = 1.05;
    const m = new Mold();
    m.add(box(0.3, 0.06, 1.0), M(0, 0.03, 0), (x, _y, z) => (Math.abs(z) > 0.3 && (Math.round(z * 18) & 1) ? 0x2c2c2a : 0x3b3a36), SURF(RUBBER, 0.6)); // strap
    m.add(box(0.52, 0.16, 0.5), M(0, 0.12, 0), 0x6d716b, SURF(STEEL, 0.8));
    m.add(box(0.56, 0.05, 0.54), M(0, 0.205, 0), 0x9ea19a, CHROME);
    for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) m.add(cyl(0.025, 0.02, 6), M(x, 0.235, z), 0xd2d4cc, CHROME);
    this.mesh(m, this.mat({ wear: 0.55 }));
    this.faceM = this.mat();
    // a cream enamel dial with painted hour marks (no screen: it is a 1960s watch)
    this.mesh(new Mold().add(box(0.38, 0.012, 0.36), M(0, 0.232, 0), (x, _y, z) => (Math.abs(Math.abs(x) - 0.15) < 0.02 && Math.abs(z) < 0.03 || Math.abs(Math.abs(z) - 0.14) < 0.02 && Math.abs(x) < 0.03 ? 0x2a2620 : 0xe6dcc0), GLASS, 1), this.faceM);
    this.hand.position.set(0, 0.24, 0);
    this.body.add(this.hand);
    this.mesh(new Mold().add(box(0.02, 0.01, 0.15), M(0, 0, -0.07), 0x10221f, PLASTIC), this.mat(), this.hand);
    this.crown.position.set(0.3, 0.12, 0);
    this.body.add(this.crown);
    this.mesh(new Mold().add(cyl(0.05, 0.08, 10), M(0.04, 0, 0, 0, 0, PI / 2), 0xb3b5ad, CHROME), this.mat(), this.crown);
    this.tape('WATCH', 0, 0.004, 0.6);
  }
  protected onDown() { sfx('tc_tick', 0.5); haptic(8); }
  protected animate() {
    this.crown.position.x = 0.3 - this.press * 0.05;
    const t = performance.now() * 0.001;
    this.hand.rotation.y = -t * 0.8;
    // radium lume: a faint green warmth while it is up, nothing more
    setGlow(this.faceM, 0x9fd48a, this.on ? 0.32 : 0);
    return false;
  }
}

// =====================================================================
// PACK: a riveted iron cube (its lid lifts while the backpack is open)
// =====================================================================
export class IronCube extends Thing {
  private lid = new THREE.Group();
  private open = 0;
  constructor() {
    super('inv');
    this.elev = 30 * DEG; this.fit = 1.0; this.k = 1600;
    const iron = (x: number, y: number, z: number) => { const n = hash(Math.round(x * 22), Math.round(y * 22), Math.round(z * 22)); return n > 0.9 ? 0x6b3e22 : n > 0.75 ? 0x3e3d39 : 0x52514b; };
    const m = new Mold();
    m.add(box(0.7, 0.62, 0.7), M(0, -0.07, 0), iron, SURF(STEEL, 0.7));
    // corner straps and rivets
    for (const x of [-0.34, 0.34]) for (const z of [-0.34, 0.34]) {
      m.add(box(0.06, 0.64, 0.06), M(x, -0.07, z), 0x2d2c29, STEEL);
      for (const y of [-0.3, -0.07, 0.16]) m.add(cyl(0.022, 0.02, 6), M(x + Math.sign(x) * 0.03, y, z - Math.sign(z) * 0.1, 0, 0, PI / 2), 0x8d8a80, CHROME);
    }
    m.add(box(0.16, 0.12, 0.04), M(0, 0.12, 0.36), 0x2a2926, STEEL); // the hasp
    this.mesh(m, this.mat({ wear: 0.85 }));
    this.lid.position.set(0, 0.24, -0.35);
    this.body.add(this.lid);
    const l = new Mold();
    l.add(box(0.74, 0.08, 0.74), M(0, 0.04, 0.35), iron, SURF(STEEL, 0.7));
    l.add(box(0.2, 0.05, 0.08), M(0, 0.1, 0.35), 0x2a2926, STEEL);
    this.mesh(l, this.mat({ wear: 0.85 }), this.lid);
    this.tape('PACK', 0, -0.22, 0.36, 'front');
  }
  protected onDown() { sfx('tc_clunk', 0.55, 0.85); haptic(14); }
  protected animate(dt: number) {
    const goal = this.on ? 1 : this.press * 0.25;
    this.open = ease(this.open, goal, dt * 9);
    this.lid.rotation.x = -this.open * 1.4;
    this.dip(0.02);
    return Math.abs(goal - this.open) > 0.003;
  }
}

// =====================================================================
// BUILD: a spirit level (the bubble runs while build mode is on)
// =====================================================================
export class Level extends Thing {
  private bubble = new THREE.Group();
  private bx = 0;
  constructor() {
    super('build');
    this.elev = 48 * DEG; this.fit = 1.0;
    const m = new Mold();
    m.add(box(1.0, 0.14, 0.26), M(0, 0.07, 0), (x) => (Math.abs(x) > 0.46 ? 0x2b2b29 : 0xd8a51c), SURF(PAINT, 0.8));
    m.add(box(0.98, 0.02, 0.02), M(0, 0.14, 0.12), 0x9ea19a, CHROME);
    for (const x of [-0.3, 0.3]) m.add(box(0.12, 0.03, 0.12), M(x, 0.145, 0), 0x2b2b29, PLASTIC);
    m.add(box(0.3, 0.06, 0.13), M(0, 0.15, 0), 0x2b2b29, PLASTIC);
    this.mesh(m, this.mat({ wear: 0.6 }));
    this.mesh(new Mold().add(box(0.24, 0.05, 0.08), M(0, 0.17, 0), 0x9fe08a, GLASS, 0.4), this.mat());
    this.bubble.position.set(0, 0.2, 0);
    this.body.add(this.bubble);
    this.mesh(new Mold().add(sph(0.03, 8, 5), null, 0xf4ffe8, GLASS, 1), this.mat(), this.bubble);
    this.tape('BUILD', 0, 0.004, 0.24);
  }
  protected onDown() { sfx('tc_knob', 0.4, 0.8); haptic(8); }
  protected animate(dt: number) {
    const t = performance.now() * 0.002;
    const goal = this.on ? Math.sin(t) * 0.07 : (this.press - 0.5) * 0.12 + 0.06;
    this.bx = ease(this.bx, goal, dt * 6);
    this.bubble.position.x = this.bx;
    this.dip(0.025);
    return !this.on && Math.abs(goal - this.bx) > 0.002;
  }
}

// =====================================================================
// EMOTE: wind-up chattering teeth on little orange feet
// =====================================================================
export class Teeth extends Thing {
  private jaw = new THREE.Group();
  private wind = new THREE.Group();
  private chatter = 0;
  constructor() {
    super('emote');
    this.elev = 22 * DEG; this.fit = 1.0; this.k = 900;
    const gum = 0xd06b7a, tooth = 0xf2ecd8;
    const lo = new Mold();
    lo.add(box(0.62, 0.14, 0.4), M(0, 0.07, 0), gum, PLASTIC);
    for (let i = 0; i < 6; i++) lo.add(box(0.085, 0.09, 0.06), M(-0.24 + i * 0.096, 0.18, 0.17), tooth, PLASTIC);
    for (const x of [-0.18, 0.18]) lo.add(box(0.16, 0.06, 0.24), M(x, -0.02, 0.06), 0xe0782a, PLASTIC); // feet
    this.mesh(lo, this.mat({ wear: 0.3 }));
    this.jaw.position.set(0, 0.16, -0.18);
    this.body.add(this.jaw);
    const up = new Mold();
    up.add(box(0.62, 0.14, 0.4), M(0, 0.1, 0.18), gum, PLASTIC);
    for (let i = 0; i < 6; i++) up.add(box(0.085, 0.09, 0.06), M(-0.24 + i * 0.096, 0.0, 0.35), tooth, PLASTIC);
    this.mesh(up, this.mat({ wear: 0.3 }), this.jaw);
    this.wind.position.set(0.34, 0.12, 0);
    this.body.add(this.wind);
    this.mesh(new Mold().add(cyl(0.02, 0.1, 6), M(0.05, 0, 0, 0, 0, PI / 2), 0xb3b5ad, CHROME).add(box(0.03, 0.16, 0.1), M(0.11, 0, 0), 0xc0a35a, BRASS), this.mat(), this.wind);
    this.tape('EMOTE', 0, -0.07, 0.24, 'front');
  }
  protected onDown() { sfx('tc_ratchet', 0.45, 1.4); haptic([8, 20, 8]); this.chatter = 1.2; }
  protected animate(dt: number) {
    this.chatter = Math.max(0, this.chatter - dt);
    const t = performance.now() * 0.045;
    this.jaw.rotation.x = -(this.chatter > 0 ? (Math.sin(t) * 0.5 + 0.5) * 0.45 : 0.06) - this.press * 0.2;
    this.wind.rotation.x += dt * (this.chatter > 0 ? 18 : 0);
    this.body.position.x = this.chatter > 0 ? Math.sin(t * 0.7) * 0.02 : 0;
    return this.chatter > 0;
  }
}

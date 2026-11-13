// The things in an emote: a rocket in a bottle and a lighter, the robot's plates,
// a brass confetti popgun, a dented trombone, a striped sock puppet, a straw skep
// and its bees, a bouquet out of nowhere; and when they go off (sparks, smoke,
// confetti, a flash, recorded sounds). One driver per rig, fed the emote that
// is playing and how far in it is; the game drives every survivor's (co-op
// peers from their mirrored emote), the shop's stages drive the mannequin's.
//
//   const d = new EmoteRigFx(rig, host, { standalone })   d.update(anim | null, t, dt)   d.dispose()
import * as THREE from 'three';
import type { HumanRig } from '../../entities/humanRig';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { FX, type FxHost, CONFETTI_COLS, FIRE_COLS } from './fx';
import { FIREWORK, ROBOT, CONFETTI, TROMBONE, PUPPET, GHOSTCHAIR, MAGIC, FAINT, JAZZ, AIRGUITAR } from './moves';

const PI = Math.PI;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();
const cl = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sm = (t: number) => { t = cl(t, 0, 1); return t * t * (3 - 2 * t); };

type Mk = (mb: ModelBuilder) => void;
function mesh(mk: Mk, standalone: boolean): THREE.Mesh {
  const mb = new ModelBuilder(); mk(mb);
  const m = new THREE.Mesh(mb.build(), standalone ? worldMaterial({ noVis: true, noFog: true, noGrid: true }) : worldMaterial({}));
  m.castShadow = true;
  return m;
}
const W = 'white';

// ---------------------------------------------------------------- the models
const rocket: Mk = (mb) => {
  // a bottle on the floor with the rocket's stick down its neck
  mb.cylinder(0, 0, 0, 0.045, 0.16, 10, W, { color: 0x3e7a3a, rTop: 0.045 });
  mb.cylinder(0, 0.16, 0, 0.045, 0.05, 10, W, { color: 0x3e7a3a, rTop: 0.018 });
  mb.cylinder(0, 0.21, 0, 0.018, 0.05, 8, W, { color: 0x4a8a44 });
  mb.box(0.012, 0.03, 0.03, 0.06, 0.07, 0.004, W, { color: 0xe8dcb0 });
};
const rocketBody: Mk = (mb) => {
  mb.cylinder(0, 0, 0, 0.006, 0.42, 5, W, { color: 0xb08a50 }); // stick
  mb.cylinder(0, 0.36, 0, 0.032, 0.2, 10, W, { color: 0xc8241c });
  for (const y of [0.4, 0.47, 0.52]) mb.cylinder(0, y, 0, 0.0335, 0.016, 10, W, { color: y === 0.47 ? 0xfff0c0 : 0xffd23f });
  mb.cylinder(0, 0.56, 0, 0.032, 0.09, 10, W, { color: 0x2a62c8, rTop: 0.002 });
  mb.cylinder(0, 0.33, 0, 0.004, 0.035, 4, W, { color: 0x6a5030 }); // fuse
};
const lighter: Mk = (mb) => {
  mb.box(0, -0.035, 0, 0.022, 0.06, 0.012, W, { color: 0xd02a2a });
  mb.box(0, 0.025, 0, 0.022, 0.012, 0.012, 'metal_grey', { color: 0xc8c8c8 });
};
const flame: Mk = (mb) => { mb.cylinder(0, 0, 0, 0.007, 0.03, 6, W, { color: 0xffb030, rTop: 0.0, emissive: 1 }); };
const popgun: Mk = (mb) => {
  mb.cylinder(0, -0.02, 0, 0.034, 0.16, 12, W, { color: 0xc89a3a });
  mb.cylinder(0, 0.14, 0, 0.038, 0.012, 12, W, { color: 0xe0b850 });
  mb.cylinder(0, -0.03, 0, 0.038, 0.014, 12, W, { color: 0xe0b850 });
  for (const y of [0.02, 0.07]) mb.cylinder(0, y, 0, 0.0345, 0.012, 12, W, { color: 0xb02020 });
  mb.cylinder(0, -0.09, 0, 0.003, 0.07, 4, W, { color: 0xd8d0c0 }); // the string
  mb.box(0, -0.1, 0, 0.012, 0.012, 0.012, W, { color: 0xb02020 });
};
const trombone: Mk = (mb) => {
  // mouthpiece at the origin, the horn runs forward (+z); bell at the far end
  const brass = 0xd4a838;
  mb.cylinderZ(0, 0, 0.18, 0.009, 0.36, 8, W, { color: brass });
  mb.cylinderZ(0.045, 0, 0.18, 0.009, 0.36, 8, W, { color: brass });
  mb.cylinderX(0.022, 0, 0.36, 0.009, 0.06, 6, W, { color: brass });
  mb.cylinderZ(0.045, 0, 0.42, 0.012, 0.12, 8, W, { color: brass, rTop: 0.07 } as never);
  mb.cylinder(0, 0, 0, 0.011, 0.02, 6, W, { color: 0xe8e0c8 });
};
const slide: Mk = (mb) => {
  const brass = 0xe0b850;
  mb.cylinderZ(0, -0.07, 0.26, 0.011, 0.4, 8, W, { color: brass });
  mb.cylinderZ(0.045, -0.07, 0.26, 0.011, 0.4, 8, W, { color: brass });
  mb.cylinderX(0.022, -0.07, 0.46, 0.011, 0.06, 6, W, { color: brass });
};
const sock: Mk = (mb) => {
  // the sock over the hand, its "head" past the fingers (local -y is out along the hand)
  const stripes = [0xe8e4d8, 0xc83a3a, 0xe8e4d8, 0x3a6ac8, 0xe8e4d8];
  stripes.forEach((col, i) => mb.cylinder(0, 0.05 - i * 0.04, 0, 0.05, 0.04, 10, W, { color: col }));
  mb.sphere(0, -0.16, 0, 0.052, 10, 6, W, { color: 0xe8e4d8 });
  // button eyes
  for (const x of [-0.022, 0.022]) { mb.cylinderZ(x, -0.175, 0.045, 0.013, 0.01, 8, W, { color: 0x101010 }); mb.cylinderZ(x, -0.175, 0.049, 0.005, 0.004, 6, W, { color: 0xffffff }); }
  mb.box(0, -0.205, 0.02, 0.07, 0.012, 0.06, W, { color: 0xb02838 }); // upper lip
};
const sockJaw: Mk = (mb) => { mb.box(0, -0.008, 0.03, 0.066, 0.016, 0.065, W, { color: 0xd84050 }); mb.box(0, -0.014, 0.0, 0.07, 0.01, 0.07, W, { color: 0xe8e4d8 }); };
const skep: Mk = (mb) => {
  // a straw skep: coils narrowing to a dome, the binding in a darker straw, the entrance hole in front
  const straw = [0xd8b060, 0xc89a48];
  for (let i = 0; i < 7; i++) {
    const r0 = 0.155 - i * 0.017 - (i > 4 ? (i - 4) * 0.012 : 0), r1 = 0.155 - (i + 1) * 0.017 - (i > 3 ? (i - 3) * 0.012 : 0);
    mb.cylinder(0, i * 0.032, 0, Math.max(0.02, r0), 0.032, 14, W, { color: straw[i % 2], rTop: Math.max(0.015, r1) });
  }
  mb.cylinderZ(0, 0.03, 0.148, 0.022, 0.012, 8, W, { color: 0x281808 });
};
const beeM: Mk = (mb) => {
  mb.sphere(0, 0, 0, 0.018, 6, 4, W, { color: 0xf0c020, sy: 0.8 } as never);
  mb.box(0, -0.008, 0.0, 0.03, 0.016, 0.008, W, { color: 0x181208 });
  mb.box(0, -0.008, -0.012, 0.028, 0.016, 0.006, W, { color: 0x181208 });
  mb.sphere(0, 0, 0.02, 0.01, 5, 3, W, { color: 0x181208 });
  for (const x of [-0.016, 0.016]) mb.box(x, 0.012, 0, 0.022, 0.002, 0.014, W, { color: 0xe8f4ff, emissive: 0.3 });
};
const bouquet: Mk = (mb) => {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2, r = i ? 0.025 : 0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    mb.cylinder(x * 0.4, -0.05, z * 0.4, 0.003, 0.17, 4, W, { color: 0x3a8a30 });
    mb.sphere(x, 0.13, z, 0.022, 6, 4, W, { color: [0xd82040, 0xffd23f, 0xff6ab0, 0xf0f0f0, 0xd82040][i] });
    mb.sphere(x, 0.135, z, 0.008, 4, 3, W, { color: 0xffe080 });
  }
  mb.cylinder(0, -0.06, 0, 0.022, 0.06, 8, W, { color: 0xe8e0c8, rTop: 0.032 });
};

/** the robot's plates on one limb: a boxy shell, rivets, a seam lamp */
function plates(rig: HumanRig, standalone: boolean): THREE.Mesh[] {
  const r = rig.dims.rest, s = rig.s;
  const len = (a: string, b: string) => Math.abs((r as Record<string, number[]>)[a][1] - (r as Record<string, number[]>)[b][1]);
  const out: THREE.Mesh[] = [];
  const metal = (w: number, h: number, d: number, y: number, z = 0, lamp = false) => (mb: ModelBuilder) => {
    mb.box(0, y - h / 2, z, w, h, d, 'metal_grey', { color: 0xb8bcc0 });
    mb.box(0, y - h * 0.08, z + d / 2 + 0.003, w * 0.7, h * 0.12, 0.006, W, { color: 0x3a3e44 });
    for (const sx of [-1, 1]) for (const sy of [0.2, 0.8]) mb.box(sx * w * 0.36, y - h * sy, z + d / 2 + 0.002, 0.01, 0.01, 0.006, W, { color: 0x6a6e74 });
    if (lamp) mb.box(0, y - h * 0.5, z + d / 2 + 0.004, w * 0.3, 0.012, 0.006, W, { color: 0xff3a2a, emissive: 1 });
  };
  const add = (joint: keyof HumanRig['j'], mk: Mk) => { const m = mesh(mk, standalone); m.userData.joint = joint; (rig.j[joint] as THREE.Object3D).add(m); out.push(m); };
  const ua = len('uarmR', 'farmR'), fa = len('farmR', 'handR'), th = len('thighR', 'shinR'), sh = len('shinR', 'footR');
  add('uarmL', metal(0.12 * s, ua * 0.92, 0.12 * s, -ua * 0.04)); add('uarmR', metal(0.12 * s, ua * 0.92, 0.12 * s, -ua * 0.04));
  add('farmL', metal(0.105 * s, fa * 0.9, 0.105 * s, -fa * 0.04)); add('farmR', metal(0.105 * s, fa * 0.9, 0.105 * s, -fa * 0.04));
  add('thighL', metal(0.16 * s, th * 0.9, 0.16 * s, -th * 0.04)); add('thighR', metal(0.16 * s, th * 0.9, 0.16 * s, -th * 0.04));
  add('shinL', metal(0.13 * s, sh * 0.85, 0.13 * s, -sh * 0.04)); add('shinR', metal(0.13 * s, sh * 0.85, 0.13 * s, -sh * 0.04));
  add('chest', (mb) => { metal(0.4 * s, 0.32 * s, 0.26 * s, 0.26 * s, 0.01, true)(mb); mb.cylinder(0, 0.06 * s, 0.14 * s, 0.035 * s, 0.01, 8, W, { color: 0x50e0ff, emissive: 1 } as never); });
  add('head', (mb) => {
    metal(0.27 * s, 0.27 * s, 0.28 * s, 0.24 * s, 0.01)(mb);
    mb.box(0, 0.115 * s, 0.155 * s, 0.2 * s, 0.035 * s, 0.01, W, { color: 0xff3a2a, emissive: 1 });
    mb.cylinder(0.1 * s, 0.24 * s, 0, 0.004, 0.08 * s, 4, W, { color: 0x6a6e74 });
    mb.sphere(0.1 * s, 0.32 * s, 0, 0.012, 5, 3, W, { color: 0xff3a2a, emissive: 1 });
  });
  return out;
}

// ---------------------------------------------------------------- the driver
interface Live { anim: string; t: number; fired: Set<string>; objs: THREE.Object3D[]; data: Record<string, any> }

export class EmoteRigFx {
  private cur: Live | null = null;
  private plateMeshes: THREE.Mesh[] | null = null;
  constructor(public rig: HumanRig, public host: FxHost, private o: { standalone?: boolean; floorY?: () => number } = {}) {}

  private floor() { return this.o.floorY ? this.o.floorY() : this.rig.root.getWorldPosition(v1).y; }
  private toWorld(x: number, y: number, z: number, out = new THREE.Vector3()) { return this.rig.root.localToWorld(out.set(x, y, z)); }
  private handW(side: 'L' | 'R', out = new THREE.Vector3()) { this.rig.root.updateMatrixWorld(true); return (side === 'L' ? this.rig.heldL : this.rig.heldR).getWorldPosition(out); }
  private headW(out = new THREE.Vector3()) { this.rig.root.updateMatrixWorld(true); return this.rig.j.head.getWorldPosition(out); }
  private snd(key: string, vol: number, at?: THREE.Vector3, rate?: number) { this.host.sound(key, vol, at ?? this.rig.root.getWorldPosition(v2), rate); }
  /** once per playthrough: true the first frame t passes `at` */
  private once(L: Live, id: string, at: number): boolean { if (L.t >= at && !L.fired.has(id)) { L.fired.add(id); return true; } return false; }

  update(anim: string | null, t: number, dt: number) {
    const L0 = this.cur;
    if (!anim || (L0 && (L0.anim !== anim || t < L0.t - 0.25))) this.end();
    if (!anim) return;
    if (!this.cur) this.cur = { anim, t, fired: new Set(), objs: [], data: {} };
    const L = this.cur;
    L.t = t;
    try { this.step(L, dt); } catch (e) { console.warn('emote fx', anim, e); }
  }

  private keep(L: Live, o: THREE.Object3D, parent: THREE.Object3D) { parent.add(o); L.objs.push(o); return o; }
  private end() {
    const L = this.cur; if (!L) return;
    for (const o of L.objs) { o.removeFromParent(); (o as THREE.Mesh).geometry?.dispose?.(); o.traverse((c) => (c as THREE.Mesh).geometry?.dispose?.()); }
    if (this.plateMeshes) { for (const m of this.plateMeshes) { m.removeFromParent(); m.geometry.dispose(); } this.plateMeshes = null; }
    this.rig.j.handR.scale.setScalar(1);
    this.rig.body.scale.setScalar(1);
    this.cur = null;
  }
  dispose() { this.end(); }

  private step(L: Live, dt: number) {
    const sa = !!this.o.standalone, t = L.t, D = L.data, P = this.host.parts, root = this.rig.root, s = this.rig.s;
    const fl = this.floor();
    switch (L.anim) {
      case 'firework': {
        const F = FIREWORK;
        if (!D.bottle) {
          D.bottle = this.keep(L, mesh(rocket, sa), root); (D.bottle as THREE.Object3D).position.set(0.06, 0, 0.62);
          D.rk = this.keep(L, mesh(rocketBody, sa), root); D.lt = this.keep(L, mesh(lighter, sa), this.rig.heldL);
          D.fl = this.keep(L, mesh(flame, sa), D.lt as THREE.Object3D); (D.fl as THREE.Object3D).position.set(0, 0.035, 0);
          (D.lt as THREE.Object3D).rotation.set(0, 0, PI);
        }
        const bottle = D.bottle as THREE.Object3D, rk = D.rk as THREE.Object3D, lt = D.lt as THREE.Object3D, fm = D.fl as THREE.Object3D;
        bottle.visible = t > F.kneel[0] + 0.35;
        lt.visible = t > F.light - 0.5 && t < F.back + 0.2;
        fm.visible = t > F.light - 0.1 && t < F.light + 0.5;
        // the rocket stands in the bottle until it goes
        const up = t < F.launch ? 0 : (t - F.launch) ** 2 * 2.2 + (t - F.launch) * 1.2;
        const top = 2.35 - 0.21;
        rk.visible = t > F.kneel[0] + 0.35 && t < F.burst;
        rk.position.set(0.06, 0.2 + Math.min(up, top), 0.62);
        rk.rotation.z = t > F.launch ? Math.sin(t * 40) * 0.04 : 0;
        if (this.once(L, 'lit', F.light)) this.snd('tc_ign', 0.7, this.toWorld(0.06, 0.4, 0.62));
        // the fuse fizzes, then the motor roars up on a trail of sparks
        if (t > F.light && t < F.launch) { const w = this.toWorld(0.06, 0.55, 0.62); P.add(FX.Spark, w.x, w.y, w.z, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, 0xffd36a, 0.4, 0.018, fl); }
        if (this.once(L, 'fizz', F.light + 0.1)) this.snd('weld_crackle', 0.35, this.toWorld(0.06, 0.4, 0.62));
        if (this.once(L, 'go', F.launch)) { this.snd('cb_whoosh_big', 0.9, this.toWorld(0.06, 1, 0.62)); for (let i = 0; i < 12; i++) { const w = this.toWorld(0.06, 0.25, 0.62); P.add(FX.Smoke, w.x, w.y, w.z, (Math.random() - 0.5) * 0.9, Math.random() * 0.3, (Math.random() - 0.5) * 0.9, 0xb8b8b0, 1.4, 0.07, fl); } }
        if (t > F.launch && t < F.burst) for (let i = 0; i < 3; i++) { const w = this.toWorld(0.06, 0.2 + Math.min(up, top) + 0.33, 0.62); P.add(FX.Trail, w.x, w.y, w.z, (Math.random() - 0.5) * 0.4, -1.2 - Math.random(), (Math.random() - 0.5) * 0.4, i ? 0xff9a30 : 0xfff0b0, 0.5, 0.035, fl); }
        if (this.once(L, 'burst', F.burst)) {
          const w = this.toWorld(0.06, 2.35, 0.62);
          const cols = FIRE_COLS[Math.floor(Math.random() * FIRE_COLS.length)];
          P.burst(w.x, w.y, w.z, 110, 3.4, cols, fl);
          P.burst(w.x, w.y, w.z, 40, 1.6, [0xffffff, cols[0]], fl);
          this.host.flash(w, cols[0], 3.2, 0.5);
          this.snd('band_boom', 0.55, w); this.snd('dmg_light_pop', 0.6, w);
        }
        if (this.once(L, 'crackle', F.burst + 0.7)) { const w = this.toWorld(0.06, 2.1, 0.62); this.snd('weld_crackle', 0.5, w); for (let i = 0; i < 40; i++) P.add(FX.Glitter, w.x + (Math.random() - 0.5) * 2.2, w.y + (Math.random() - 0.5) * 1.2, w.z + (Math.random() - 0.5) * 2.2, 0, -0.3, 0, 0xfff4c0, 1.4, 0.03, fl); }
        break;
      }
      case 'robot': {
        const R = ROBOT;
        if (!this.plateMeshes && t > R.on - 0.25 && t < R.off + 0.3) { this.plateMeshes = plates(this.rig, sa); this.snd('cy_powerup', 0.6); }
        if (this.plateMeshes) {
          // they slam on one after another (and fold off in reverse)
          this.plateMeshes.forEach((m, i) => {
            const on = sm((t - (R.on - 0.25) - i * 0.03) / 0.12), off = sm((t - R.off - (9 - i) * 0.025) / 0.14);
            const k = Math.max(0.001, on * (1 - off));
            m.scale.setScalar(k < 0.999 ? 0.4 + 0.6 * k * (1 + Math.sin(k * PI) * 0.25) : 1);
            m.visible = k > 0.02;
          });
          if (t > R.off + 0.45) { for (const m of this.plateMeshes) { m.removeFromParent(); m.geometry.dispose(); } this.plateMeshes = null; }
        }
        if (this.once(L, 'clank', R.on)) this.snd('cy_clank', 0.8);
        const beat = Math.floor((t - R.on) / 0.32);
        if (t > R.on && t < R.off && beat !== D.beat) { D.beat = beat; this.snd(beat % 2 ? 'cy_servo' : 'mn_servo', 0.45, undefined, 0.9 + (beat % 3) * 0.08); }
        if (this.once(L, 'down', R.off)) this.snd('cy_powerdown', 0.55);
        break;
      }
      case 'confetti': {
        if (!D.gun) { D.gun = this.keep(L, mesh(popgun, sa), this.rig.heldR); (D.gun as THREE.Object3D).position.set(0, -0.02, 0.02); (D.gun as THREE.Object3D).rotation.set(PI, 0, 0); }
        (D.gun as THREE.Object3D).visible = t > 0.25;
        if (this.once(L, 'pop', CONFETTI.pop)) {
          const g = D.gun as THREE.Object3D;
          g.updateWorldMatrix(true, false);
          const mz = g.localToWorld(v1.set(0, 0.16, 0)).clone(), dir = g.localToWorld(v2.set(0, 1, 0)).sub(g.getWorldPosition(new THREE.Vector3())).normalize();
          for (let i = 0; i < 110; i++) {
            const sp = 2.6 + Math.random() * 2.4;
            P.add(FX.Flake, mz.x, mz.y, mz.z, dir.x * sp + (Math.random() - 0.5) * 2, dir.y * sp + Math.random(), dir.z * sp + (Math.random() - 0.5) * 2, CONFETTI_COLS[i % CONFETTI_COLS.length], 3.4, 0.055, fl);
          }
          for (let i = 0; i < 6; i++) P.add(FX.Smoke, mz.x, mz.y, mz.z, dir.x * 0.6, dir.y * 0.6, dir.z * 0.6, 0xd8d4c8, 0.8, 0.08, fl);
          this.snd('vx_pop', 0.9, mz); this.snd('tim_pop', 0.6, mz);
          this.host.flash(mz, 0xfff0c0, 2, 0.15);
        }
        break;
      }
      case 'trombone': {
        const T = TROMBONE;
        if (!D.tb) {
          D.tb = this.keep(L, mesh(trombone, sa), this.rig.j.head); (D.tb as THREE.Object3D).position.set(-0.022 * s, 0.05 * s, 0.1 * s);
          D.sl = this.keep(L, mesh(slide, sa), D.tb as THREE.Object3D);
        }
        const tb = D.tb as THREE.Object3D;
        tb.visible = t > 0.3 && t < T.wah + 2.2;
        tb.rotation.x = t > T.wah ? sm((t - T.wah) / 1.2) * 0.7 : 0;
        let k = 0;
        for (const n of T.notes) if (t > n && t < n + 0.55) k = Math.sin(((t - n) / 0.55) * PI);
        if (t > T.wah) k = sm((t - T.wah) / 1.1);
        (D.sl as THREE.Object3D).position.z = k * 0.2;
        T.notes.forEach((n, i) => { if (this.once(L, 'n' + i, n)) this.snd('horn', 0.35, this.headW(), 0.85 + i * 0.12); });
        if (this.once(L, 'wah', T.wah)) this.snd('tape_stop', 0.8, this.headW());
        if (this.once(L, 'flop', T.wah + 1.9)) this.snd('body_thud', 0.4);
        break;
      }
      case 'puppet': {
        if (!D.sock) {
          D.sock = this.keep(L, mesh(sock, sa), this.rig.heldL); (D.sock as THREE.Object3D).position.set(0, 0.07, 0);
          D.jaw = this.keep(L, mesh(sockJaw, sa), D.sock as THREE.Object3D); (D.jaw as THREE.Object3D).position.set(0, -0.2, 0.0);
        }
        (D.sock as THREE.Object3D).visible = t > 0.2;
        const talk = t > 0.8 && t < PUPPET.bite - 0.2 ? Math.abs(Math.sin(t * 11)) : t > PUPPET.bite && t < PUPPET.bite + 0.6 ? 1 - (t - PUPPET.bite) / 0.6 : 0;
        (D.jaw as THREE.Object3D).rotation.x = talk * 0.7;
        if (this.once(L, 'hi', 0.85)) this.snd('tim_giggle', 0.5, this.handW('L'));
        if (this.once(L, 'yak', 1.8)) this.snd('plush_squeak', 0.6, this.handW('L'));
        if (this.once(L, 'yak2', 2.9)) this.snd('tim_coo', 0.5, this.handW('L'));
        if (this.once(L, 'bite', PUPPET.bite)) { this.snd('swivel_bite', 0.6, this.headW()); this.snd('plush_squeak', 0.7, this.headW(), 1.3); }
        break;
      }
      case 'ghostchair': {
        if (this.once(L, 'sit', 0.9)) this.snd('chair_squeak', 0.35);
        if (this.once(L, 'page', 2.65)) this.snd('paper', 0.6, this.handW('R'));
        if (this.once(L, 'fall', GHOSTCHAIR.fall + 0.22)) { this.snd('body_thud', 0.7); for (let i = 0; i < 10; i++) { const w = this.toWorld((Math.random() - 0.5) * 0.6, 0.05, -0.3 + (Math.random() - 0.5) * 0.4); P.add(FX.Smoke, w.x, w.y, w.z, (Math.random() - 0.5) * 0.8, 0.1, (Math.random() - 0.5) * 0.8, 0xc8bc98, 1.1, 0.07, fl); } }
        break;
      }
      case 'magic': {
        const M = MAGIC;
        const gone = t > M.gone && t < M.back;
        this.rig.j.handR.scale.setScalar(gone ? 0.001 : 1);
        if (!D.fl) { D.fl = this.keep(L, mesh(bouquet, sa), this.rig.heldR); (D.fl as THREE.Object3D).rotation.set(PI, 0, 0); (D.fl as THREE.Object3D).position.set(0, 0.02, 0.02); }
        (D.fl as THREE.Object3D).visible = t > M.back;
        const puff = (w: THREE.Vector3) => {
          for (let i = 0; i < 16; i++) P.add(FX.Smoke, w.x, w.y, w.z, (Math.random() - 0.5) * 0.9, (Math.random() - 0.3) * 0.5, (Math.random() - 0.5) * 0.9, i % 3 ? 0xd8d8e0 : 0xb8b0d0, 1.1, 0.07, fl);
          for (let i = 0; i < 24; i++) P.add(FX.Glitter, w.x, w.y, w.z, (Math.random() - 0.5) * 1.6, (Math.random() - 0.2) * 1.4, (Math.random() - 0.5) * 1.6, i % 2 ? 0xfff0a0 : 0xa0e8ff, 1.0, 0.025, fl);
        };
        if (this.once(L, 'gone', M.gone)) { const w = this.rig.j.farmR.getWorldPosition(new THREE.Vector3()); puff(w); this.snd('holo_on', 0.6, w); this.snd('bubble_pop', 0.6, w); }
        if (this.once(L, 'back', M.back)) { const w = this.handW('R'); puff(w); this.snd('tim_pop', 0.7, w); this.snd('wisp_chime', 0.5, w); }
        break;
      }
      case 'jelly': {
        const a = Math.min(sm(t / 0.35), 1 - sm((t - 3.5) / 0.9));
        const w = Math.sin(t * 13) * a;
        this.rig.body.scale.set(1 + w * 0.07, 1 - w * 0.09, 1 + w * 0.07);
        if (this.once(L, 'wob', 0.05)) this.snd('bubble_wob', 0.7);
        if (this.once(L, 'boing', 1.6)) this.snd('mn_boing', 0.6);
        if (this.once(L, 'wob2', 2.8)) this.snd('bubble_wob', 0.5, undefined, 1.2);
        break;
      }
      case 'beehat': {
        if (!D.hat) {
          D.hat = this.keep(L, mesh(skep, sa), this.rig.j.head); (D.hat as THREE.Object3D).position.set(0, 0.17 * s, -0.01);
          D.bees = Array.from({ length: 9 }, () => this.keep(L, mesh(beeM, sa), root));
        }
        const hat = D.hat as THREE.Object3D;
        const pop = sm((t - 0.15) / 0.25);
        hat.scale.setScalar(Math.max(0.001, pop * (1 + Math.sin(pop * PI) * 0.3) * (1 - sm((t - 5.5) / 0.4))));
        root.updateMatrixWorld(true);
        const hw = this.rig.j.head.getWorldPosition(v1);
        const hl = root.worldToLocal(hw.clone());
        (D.bees as THREE.Object3D[]).forEach((b, i) => {
          const out = sm((t - 0.5 - i * 0.12) / 0.6) * (1 - sm((t - 5.2) / 0.6));
          const a = t * (2.2 + (i % 3) * 0.6) * (i % 2 ? 1 : -1) + i * 0.7, r = 0.22 + (i % 4) * 0.07 + Math.sin(t * 3 + i) * 0.04;
          b.position.set(hl.x + Math.cos(a) * r * out, hl.y + 0.18 + Math.sin(t * 5 + i * 2) * 0.12 * out - (1 - out) * 0.05, hl.z + Math.sin(a) * r * out);
          b.rotation.set(0, -a + (i % 2 ? PI : 0), Math.sin(t * 30 + i) * 0.2);
          b.visible = out > 0.02;
        });
        if (this.once(L, 'buzz', 0.6)) this.snd('moth_flutter', 0.7, hw);
        if (this.once(L, 'buzz2', 2.6)) this.snd('moth_flutter', 0.6, hw, 1.15);
        if (this.once(L, 'buzz3', 4.0)) this.snd('flicker_buzz', 0.35, hw, 1.4);
        break;
      }
      case 'levitate': {
        if (t > 0.9 && t < 5.4) for (let i = 0; i < 2; i++) { const a = Math.random() * PI * 2, r = 0.35 + Math.random() * 0.25; const w = this.toWorld(Math.cos(a) * r, 0.05 + Math.random() * 0.3, Math.sin(a) * r); P.add(FX.Glitter, w.x, w.y, w.z, 0, 0.25 + Math.random() * 0.3, 0, i ? 0xb8e8ff : 0xfff4c0, 1.2, 0.022, fl); }
        if (this.once(L, 'hum', 0.8)) this.snd('wisp_hum', 0.5);
        if (this.once(L, 'chime', 2.2)) this.snd('wisp_chime', 0.5);
        if (this.once(L, 'land', 5.5)) this.snd('thud_soft', 0.5);
        break;
      }
      case 'faint': {
        if (this.once(L, 'sigh', 0.5)) this.snd('hush_inhale', 0.4);
        if (this.once(L, 'down', FAINT.down + 0.1)) { this.snd('body_thud', 0.8); for (let i = 0; i < 8; i++) { const w = this.toWorld((Math.random() - 0.5) * 0.4, 0.04, -0.9 + (Math.random() - 0.5) * 0.6); P.add(FX.Smoke, w.x, w.y, w.z, (Math.random() - 0.5) * 0.7, 0.08, (Math.random() - 0.5) * 0.7, 0xc8bc98, 1, 0.06, fl); } }
        break;
      }
      case 'chicken': {
        const ph = Math.floor(t / 1.3);
        if (ph !== D.ph) { D.ph = ph; if (ph % 4 === 1) this.snd('bird_flap', 0.5); }
        break;
      }
      case 'boxer': {
        for (const at of [0.5, 0.9, 1.3, 1.9, 2.5, 3.1, 3.5, 3.9]) if (this.once(L, 'p' + at, at + 0.1)) this.snd('cb_jab', 0.35, this.handW(at === 1.3 || at === 2.5 || at === 3.5 ? 'R' : 'L'));
        break;
      }
      case 'jazz': {
        if (this.once(L, 'spin', JAZZ.spin[0])) this.snd('whoosh', 0.4);
        if (this.once(L, 'pop', JAZZ.pop)) {
          for (const side of ['L', 'R'] as const) { const w = this.handW(side); for (let i = 0; i < 20; i++) P.add(FX.Glitter, w.x, w.y, w.z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, i % 2 ? 0xffe070 : 0xff80d0, 1.2, 0.028, fl); }
          this.snd('wisp_chime', 0.6, this.headW());
        }
        break;
      }
      case 'airguitar': {
        if (this.once(L, 'slide', AIRGUITAR.slide + 0.15)) { this.snd('drag_scrape', 0.5); }
        if (this.once(L, 'fist', AIRGUITAR.slide + 1.5)) this.snd('cb_stomp', 0.4);
        break;
      }
      default: break;
    }
    void dt;
  }
}

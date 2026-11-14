// Picking something up off the floor (round 18b): a quick dip into the unit's eyes. It turns to the thing, goes
// down on one knee, the gloved right hand (HumanRig arm) reaches down, closes on the thing (its own 3D model, lying
// where it lay) and lifts it out of the picture; it flies into the tool belt as its icon and the eyes come back up.
// About 0.6 s in the eyes; several pickups in a row chain on without leaving them. Through the game's overlay
// pixel pipeline like every close-up. Scripted browsers (no ?fpcut) only get the flight into the belt.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Item } from '../../items/item';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../../fp/fp';
import { eyeActive, eyeCamera, eyeEnter } from '../../fp/eye';
import { makeArm, poseArm, makeItemObj, itemAlign, damp, type Arm, type ItemObj } from '../../craft/fpKit';
import { texturizeSleeves } from '../pack/packTex';
import { itemIconFor, iconResCss } from '../icons';
import { SCRIPTED } from './fpack';

const DEG = Math.PI / 180;
const GRAB_FOV = 56;
interface Job { it: Item; x: number; y: number; z: number }

/** the icon of a thing flying across the screen into the tool belt (to its slot when it has one) */
export function flyToBelt(it: Item, sx: number, sy: number) {
  if (document.documentElement.classList.contains('reduce-flash')) return;
  const hb = (G as any).hotbar;
  const to: { x: number; y: number } | null = hb?.pocketPoint?.(it) ?? null;
  if (!to) return;
  const S = 40;
  const im = new Image(); im.src = itemIconFor(it, iconResCss(S)); im.className = 'fpk-fly';
  Object.assign(im.style, { position: 'fixed', left: '0', top: '0', width: S + 'px', height: S + 'px', zIndex: '71', pointerEvents: 'none', imageRendering: 'pixelated', filter: 'drop-shadow(2px 3px 0 rgba(0,0,0,.5))' });
  document.body.append(im);
  const x0 = sx - S / 2, y0 = sy - S / 2, x1 = to.x - S / 2, y1 = to.y - S / 2;
  const mx = (x0 + x1) / 2 + (x1 > x0 ? -40 : 40), my = Math.min(y0, y1) - 90;
  const a = im.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(1.3) rotate(-8deg)`, opacity: 1 },
    { transform: `translate(${mx}px, ${my}px) scale(1.1) rotate(6deg)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${x1}px, ${y1 - 14}px) scale(0.92) rotate(0deg)`, opacity: 1, offset: 0.82 },
    { transform: `translate(${x1}px, ${y1}px) scale(0.8)`, opacity: 0.0 },
  ], { duration: 640, easing: 'cubic-bezier(.35,.1,.3,1)' });
  a.onfinish = () => { im.remove(); hb?.landed?.(it); };
}

export class GrabCut {
  private q: Job[] = [];
  private job: Job | null = null;
  private t = 0;
  private active = false;
  private waitT = 0;
  private g: THREE.Group | null = null;
  private set = new THREE.Group();
  private arm: Arm | null = null;
  private obj: ItemObj | null = null;
  private hand = new THREE.Vector3(0.3, -0.7, -0.5);
  private hookFn: ((dt: number) => void) | null = null;
  private knelt = false;
  private released = false;

  constructor(ui?: unknown) {
    (G as any).grabCut = this;
    const u = ui as { blocksMovement?: () => boolean } | undefined;
    const orig = u?.blocksMovement?.bind(u);
    if (u && orig) u.blocksMovement = () => orig() || this.active;
    bus.on('itemPickedUp', (p: any, it: Item, x: number, z: number) => {
      if (!p?.isLocal) return;
      const pk = (G as any).pack;
      if (pk?.open) return;
      const y = (p.y ?? 0);
      if (SCRIPTED || (G as any).camera?.comfort || !G.pr) { this.flyFrom(it, x, y, z); return; }
      this.q.push({ it, x, y, z });
      if (!this.active) this.start();
    });
  }

  private flyFrom(it: Item, x: number, y: number, z: number) {
    const cam = (G.pr as any)?.camera as THREE.Camera | undefined;
    if (!cam) return;
    const v = new THREE.Vector3(x, y + 0.1, z).project(cam);
    flyToBelt(it, (v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight);
  }

  private start() {
    const p = G.local as any;
    const j = this.q[0];
    if (!p || !j) return;
    const d = Math.hypot(j.x - p.x, j.z - p.z);
    const pitch = Math.max(38, Math.min(74, Math.atan2(1.05, Math.max(0.2, d - 0.05)) / DEG));
    if (d > 0.15) p.facing = Math.atan2(j.z - p.z, j.x - p.x);
    if (!fpClaim('grab', 1, { cinematic: 'full', eyePitch: pitch })) { for (const q of this.q) this.flyFrom(q.it, q.x, q.y, q.z); this.q.length = 0; return; }
    this.active = true; this.released = false;
    this.waitT = 0; this.job = null;
    if (!p.full && !p.sittingOn && !p.inVehicle) { p.full = 'kneel'; this.knelt = true; }
    if (!this.g) {
      this.g = fpGroup('grab');
      this.set.matrixAutoUpdate = false;
      this.g.add(this.set);
      this.set.add(new THREE.HemisphereLight(0xe8e0cc, 0x3a3226, 1.0));
      const key = new THREE.DirectionalLight(0xfff0dc, 1.8); key.position.set(-0.4, 3, 0.5); this.set.add(key);
      this.arm = makeArm(1, 1.05); texturizeSleeves(this.arm.root);
      this.g.add(this.arm.root);
    }
    if (!this.hookFn) this.hookFn = (dt) => { try { this.frame(dt); } catch (e) { console.warn('grab', e); this.end(); } };
    const pr = G.pr as unknown as { beforeRender: ((dt: number) => void)[] };
    if (!pr.beforeRender.includes(this.hookFn)) pr.beforeRender.push(this.hookFn);
  }

  private next() {
    const j = this.q.shift();
    if (!j) { this.job = null; return; }
    this.job = j; this.t = 0;
    const o = makeItemObj(j.it.key, undefined, j.it);
    const a = itemAlign(j.it.key);
    const md = a ? Math.max(...a.base) : 0.1;
    o.outer.scale.setScalar(Math.max(0.06, Math.min(0.3, md)) / md);
    o.outer.position.set(j.x, j.y + 0.012, j.z);
    o.outer.rotation.y = (j.it.uid % 7) * 0.7;
    o.outer.traverse((x) => { x.frustumCulled = false; });
    this.set.add(o.outer);
    this.obj = o;
    // the near point the hand starts from (off the bottom right of the picture)
    if (this.t === 0 && this.hand.z === -0.5) this.hand.set(0.3, -0.7, -0.5);
  }

  private frame(dt: number) {
    if (!this.active || !this.g || !this.arm) return;
    dt = Math.min(0.05, Math.max(0, dt));
    const cam = fpCamera();
    cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld();
    const asp = cam.aspect || 1;
    const base = (eyeActive() ? (G.pr as unknown as { eyeFov: number }).eyeFov : GRAB_FOV) * DEG;
    const vf = (asp >= 1.2 ? base : Math.min(104 * DEG, 2 * Math.atan(Math.tan(base / 2) * 1.2 / asp))) / DEG;
    if (Math.abs(cam.fov - vf) > 0.01) { cam.fov = vf; cam.updateProjectionMatrix(); }
    if (fpOwner() !== 'grab') { this.end(); return; }
    if (!eyeActive()) { this.waitT += dt; if (this.waitT > 1.2) this.end(); return; }
    if ((G.pr as unknown as { eyeFov: number }).eyeFov !== GRAB_FOV) eyeEnter({ pitchDeg: this.pitchFor(), fov: GRAB_FOV });
    const e = eyeCamera(); e.updateMatrixWorld();
    this.set.matrix.copy(e.matrixWorldInverse);
    this.set.matrixWorldNeedsUpdate = true; this.set.updateMatrixWorld(true);
    if (!this.job) { this.next(); if (!this.job) { this.finish(); return; } }
    const j = this.job!, o = this.obj!;
    this.t += dt;
    const t = this.t;
    // reach (0 .. .26), close (.26 .. .34), lift up out of the picture (.34 .. .6)
    const at = new THREE.Vector3().copy(o.outer.position).applyMatrix4(this.set.matrix);
    const goal = new THREE.Vector3();
    let pose: string = 'open';
    if (t < 0.26) { goal.copy(at).add(new THREE.Vector3(0, 0.05, 0.03)); pose = 'open'; }
    else if (t < 0.34) { goal.copy(at).add(new THREE.Vector3(0, 0.035, 0.02)); pose = 'grip'; }
    else {
      pose = 'grip';
      const k = Math.min(1, (t - 0.34) / 0.26);
      // carried up toward the chest (camera space), then out of frame
      const lift = new THREE.Vector3(0.16, -0.32, -0.42);
      const from = new THREE.Vector3().copy(at);
      goal.lerpVectors(from, lift, k * k * (3 - 2 * k));
      // the thing rides in the hand
      const inv = new THREE.Matrix4().copy(this.set.matrix).invert();
      o.outer.position.copy(goal).add(new THREE.Vector3(0, -0.03, -0.01)).applyMatrix4(inv);
    }
    const rate = t < 0.26 ? 16 : 30;
    this.hand.x = damp(this.hand.x, goal.x, rate, dt); this.hand.y = damp(this.hand.y, goal.y, rate, dt); this.hand.z = damp(this.hand.z, goal.z, rate, dt);
    this.arm.target.copy(this.hand);
    this.arm.want = pose as any;
    poseArm(this.arm, -0.4, dt);
    if (t >= 0.26 && t - dt < 0.26) G.audio?.itemSound?.(j.it.key, 'pick', G.local);
    if (t >= 0.6) {
      // it goes into the belt
      const v = o.outer.getWorldPosition(new THREE.Vector3()).project(cam);
      flyToBelt(j.it, (v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight);
      o.outer.removeFromParent();
      this.obj = null; this.job = null;
      if (!this.q.length) this.finish();
    }
  }
  private pitchFor(): number {
    const p = G.local as any, j = this.job ?? this.q[0];
    if (!p || !j) return 50;
    const d = Math.hypot(j.x - p.x, j.z - p.z);
    return Math.max(38, Math.min(74, Math.atan2(1.05, Math.max(0.2, d - 0.05)) / DEG));
  }
  private finish() {
    if (this.released) return;
    this.released = true;
    setTimeout(() => this.end(), 60);
  }
  private end() {
    if (!this.active) return;
    this.active = false;
    if (this.obj) { this.obj.outer.removeFromParent(); this.obj = null; }
    for (const q of this.q) this.flyFrom(q.it, q.x, q.y, q.z);
    this.q.length = 0; this.job = null;
    const pr = G.pr as unknown as { beforeRender: ((dt: number) => void)[] };
    const i = this.hookFn ? pr.beforeRender.indexOf(this.hookFn) : -1;
    if (i >= 0) pr.beforeRender.splice(i, 1);
    if (fpOwner() === 'grab') fpRelease('grab');
    const cam = fpCamera();
    if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); }
    const p = G.local as any;
    if (p && this.knelt && p.full === 'kneel') p.full = '';
    this.knelt = false;
    this.hand.set(0.3, -0.7, -0.5);
  }
}

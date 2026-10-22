// Meridian Custody Officers for the intro (src/game/intro.ts): local NPC rigs
// the script walks around, poses and points at things. Grey uniforms, riot
// helmets with dark visors (no faces), gloves, boots, a baton or a taser or
// the BAILIFF fitting gun in hand. They use the shared animator for walking
// and named actions when it has them, the cutscene poses (cutPose.ts) when it
// does not, and two-bone IK so a gloved hand actually closes on a wrist.
// Built with a `stage` parent they live outside the world (the first-person
// intake set in the renderer's overlay scene): stage coordinates, no zone,
// materials that ignore the zone's light grid, visibility mask and fog.
import * as THREE from 'three';
import { G } from './G';
import { HumanRig, type Appearance, type Outfit, SKIN_TONES } from '../entities/humanRig';
import type { FullBody } from '../entities/humanAnim';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { animSupported, fallbackPose, overlay, reachArm, addPose } from './cutPose';
import { Reactions } from '../entities/humanReact';
import { stageMat } from './introKit/stageMat';
import { dressGuard, batonGeo, fittingGunGeo, pendantGeo } from './introKit/gear';
import { emitMat } from './introKit/stageMat';
import { line, readTime } from './lines';
import { GUARD_GREY } from '../content/items/prisoner';

const GUARD_OUTFIT: Outfit = {
  torso: { tex: 'c_guard', color: GUARD_GREY, sleeve: 'long', item: 'guard_uniform' },
  legs: { tex: 'c_guard', color: scale(GUARD_GREY, 0.9), item: 'guard_uniform' }, legsKind: 'pants',
  feet: { tex: 'c_shoes_boot', color: 0x1c1a18 },
  hands: { tex: 'c_gloves', color: 0x1a1a1c },
  head: { tex: 'c_riot_helmet', color: 0x2e3236, hat: 'helmet', item: 'riot_helmet' },
};
function scale(c: number, f: number) { return (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f); }

// ------------------------------------------------------------------ props
let taserGeo: THREE.BufferGeometry | null = null;
function taserMesh(mat: THREE.Material): THREE.Object3D {
  if (!taserGeo) {
    const mb = new ModelBuilder();
    // a stubby yellow body with a rounded snout, a rubber grip, two prongs
    mb.cylinderX(0.02, -0.03, 0, 0.026, 0.15, 6, 'plastic_black', { color: 0xd8c040 });
    mb.sphere(0.095, -0.03, 0, 0.026, 6, 4, 'plastic_black', { color: 0xd8c040 });
    mb.push().translate(-0.04, -0.05, 0).rotateZ(0.25); mb.cylinder(0, -0.07, 0, 0.018, 0.075, 6, 'rubber_black'); mb.pop();
    for (const s of [-1, 1]) mb.cylinderX(0.125, -0.022, s * 0.01, 0.003, 0.02, 4, 'metal_grey');
    taserGeo = mb.build();
  }
  return new THREE.Mesh(taserGeo, mat);
}
/** the BAILIFF fitting gun (faceted, src/game/introKit/gear.ts) with its amber lamp lit */
function gunMesh(mat: THREE.Material): THREE.Object3D {
  const { body, lamp } = fittingGunGeo();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(body, mat), new THREE.Mesh(lamp, emitMat(0xffb040, 2.2)));
  return g;
}

export type GuardHeld = 'baton' | 'taser' | 'gun' | 'pendant' | null;
/** cutscene strikes always use the scripted poses (the weight is in them), never the animator's action */
const FORCE_POSE = new Set(['baton_chop', 'kick_low', 'shove2']);
const tv = new THREE.Vector3();

const STAGE_MAT = { noVis: true, noFog: true, noGrid: true };
/** the officers on the stage get a strong rim: dark uniforms against dark rooms */
const guardMat = (stage: boolean) => (stage ? stageMat({ rim: 1.3 }) : worldMaterial({}));
const gearMat = (stage: boolean) => (stage ? stageMat({ rim: 1.1 }) : worldMaterial({}));
void STAGE_MAT;

export class Guard {
  readonly rig: HumanRig;
  /** lives on a first-person stage, not in a zone */
  readonly staged: boolean;
  x = 0; z = 0; y = 0; facing = 0;
  zoneKey = '';
  speed = 0;
  private vSpeed = 0;
  /** a scripted action: named animator action when it exists, else a cutscene pose */
  act: { name: string; t: number; dur: number; k?: number; loop?: boolean } | null = null;
  /** IK: a hand closing on a world point */
  reachL: { p: THREE.Vector3; w: number; pole?: THREE.Vector3 } | null = null;
  reachR: { p: THREE.Vector3; w: number; pole?: THREE.Vector3 } | null = null;
  /** a held pose under everything (e.g. 'taser_aim') */
  hold: string | null = null;
  held: GuardHeld = null;
  full: FullBody = '';
  /** the body's own springs: recoil up the arm when the baton lands, a stagger when shoved */
  readonly react = new Reactions();
  private moved = 0;
  private rp: Record<string, unknown> = {};

  constructor(public label: string, seed: number, stage?: THREE.Object3D) {
    this.staged = !!stage;
    const r = (k: number) => { const s = Math.sin(seed * 91.7 + k * 13.1) * 43758.5453; return s - Math.floor(s); };
    const app: Appearance = {
      skin: SKIN_TONES[Math.floor(r(1) * SKIN_TONES.length)], hair: 0x2a2018, hairStyle: 'buzz', face: Math.floor(r(2) * 6), build: 'broad',
      height: 1.04 + r(3) * 0.05, beard: false, bodyShape: 0.08, facialHair: 'none', age: 0.3,
    };
    this.rig = new HumanRig(app, guardMat(!!stage));
    this.rig.setOutfit(GUARD_OUTFIT);
    // riot helmet and visor, vest with pouches and the radio, duty belt, knee pads (faceted, src/game/introKit/gear.ts)
    dressGuard(this.rig, gearMat(!!stage));
    this.rig.root.visible = !!stage;
    (stage ?? G.pr.scene).add(this.rig.root);
  }

  setHeld(k: GuardHeld) {
    if (k === this.held) return;
    this.held = k;
    const mat = gearMat(this.staged);
    const m = k === 'baton' ? new THREE.Mesh(batonGeo(), mat) : k === 'taser' ? taserMesh(mat) : k === 'gun' ? gunMesh(mat) : k === 'pendant' ? new THREE.Mesh(pendantGeo(), mat) : null;
    if (m) m.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
    this.rig.hold('R', m, k === 'baton' ? 'perp' : 'raw');
    if (m && k !== 'baton') { m.rotation.set(0, Math.PI / 2, -Math.PI / 2); m.position.set(0, -0.05, 0.02); }
    if (m && k === 'pendant') { m.rotation.set(0, 0, 0); m.position.set(0, -0.02, 0.03); }
  }

  place(zoneKey: string, x: number, z: number, facing = this.facing) {
    this.zoneKey = zoneKey; this.x = x; this.z = z; this.facing = facing;
    this.y = this.staged ? 0 : G.getZone(zoneKey).heightAt(Math.floor(x), Math.floor(z));
  }
  face(x: number, z: number) { this.facing = Math.atan2(z - this.z, x - this.x); }

  /** walk toward (x, z); returns true once there */
  walkTo(x: number, z: number, maxSpeed: number, dt: number, stop = 0.08, faceMove = true): boolean {
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz);
    if (d <= stop) { this.vSpeed = 0; return true; }
    const sp = Math.min(maxSpeed, d * 3.2);
    const k = Math.min(d, sp * dt);
    this.x += (dx / d) * k; this.z += (dz / d) * k;
    this.moved += k;
    if (faceMove) { const want = Math.atan2(dz, dx); this.facing += wrap(want - this.facing) * Math.min(1, dt * 9); }
    return false;
  }
  turnTo(x: number, z: number, dt: number, rate = 8) { const want = Math.atan2(z - this.z, x - this.x); this.facing += wrap(want - this.facing) * Math.min(1, dt * rate); }

  play(name: string, dur: number, loop = false) { this.act = { name, t: 0, dur, loop }; }
  bark(text: string, sound = true) {
    this.rig.root.updateMatrixWorld(true);
    const h = this.rig.jointWorld('head', tv);
    if (this.staged) { line('OFFICER', text, 'guard', readTime(text)); if (sound) G.audio?.flat?.('guard_bark', 'sfx', 0.75); return; }
    line('OFFICER', text, 'guard', readTime(text), { x: h.x, y: h.y + 0.3, z: h.z });
    if (sound) G.audio?.play?.('guard_bark', this.x, this.z, { vol: 0.75, range: 18 });
  }

  update(dt: number) {
    if (!this.staged) {
      const vz = G.view?.zone.key;
      this.rig.root.visible = vz === this.zoneKey;
    }
    if (!this.rig.root.visible) return;
    // speed from how far we actually moved this frame
    const inst = dt > 0 ? this.moved / dt : 0;
    this.moved = 0;
    this.speed += (inst - this.speed) * Math.min(1, dt * 10);
    const a = this.act;
    let animAction = '';
    if (a) {
      a.t += dt;
      if (a.t >= a.dur) { if (a.loop) a.t %= a.dur; else this.act = null; }
      if (this.act && !FORCE_POSE.has(a.name) && animSupported(a.name)) animAction = a.name;
    }
    this.rig.animate(dt, {
      speed: this.speed, stance: 'stand', full: this.full, action: animAction as never, actionT: a?.t ?? 0, actionDur: a?.dur ?? 1, twoHanded: false,
      limp: 0, tired: 0, panic: 0, cold: 0, aimPitch: 0, holdingLight: false, holding: !!this.held, lookYaw: 0, weapon: this.held === 'baton' ? 'blunt' : '', fidget: false,
    });
    const t = G.time;
    if (this.hold) { const ps = fallbackPose(this.hold, 0.5, t); if (ps) overlay(this.rig, ps, 1); }
    if (this.act && !animAction) {
      const u = this.act.t / this.act.dur;
      const ps = fallbackPose(this.act.name, u, t, this.act.k ?? u);
      if (ps) overlay(this.rig, ps, Math.min(1, Math.min(u, 1 - u) * 8 + (this.act.loop ? 1 : 0)));
    }
    // the reaction springs on top (recoil, stagger)
    const rp = this.rp as Record<string, unknown>;
    for (const k in rp) delete rp[k];
    if (this.react.apply(rp as never, dt)) addPose(this.rig, rp as never, 1);
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = Math.PI / 2 - this.facing;
    if (this.reachL || this.reachR) {
      this.rig.root.updateMatrixWorld(true);
      if (this.reachL) reachArm(this.rig, 'L', this.reachL.p, this.reachL.w, this.reachL.pole);
      if (this.reachR) reachArm(this.rig, 'R', this.reachR.p, this.reachR.w, this.reachR.pole);
    }
  }

  /** the strike connected: it jars back up the arm, a beat of hitstop in the body */
  recoil(k = 1) { this.react.recoil(k); }
  /** shoved / hit: (dx, dz) world push */
  jolt(dx: number, dz: number, part: string, k: number) {
    const th = this.rig.root.rotation.y, c = Math.cos(th), s = Math.sin(th);
    this.react.hit(c * dx - s * dz, s * dx + c * dz, part, k);
  }

  dispose() {
    this.rig.root.removeFromParent();
    this.rig.dispose();
  }
}
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

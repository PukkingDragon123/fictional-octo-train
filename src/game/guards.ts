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
import { makeHeldMesh } from '../items/itemMeshes';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { animSupported, fallbackPose, overlay, reachArm } from './cutPose';
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

// ------------------------------------------------------------------ props (shared geometry)
let visorGeo: THREE.BufferGeometry | null = null, taserGeo: THREE.BufferGeometry | null = null, gunGeo: THREE.BufferGeometry | null = null;
function visor(): THREE.BufferGeometry {
  if (visorGeo) return visorGeo;
  const mb = new ModelBuilder();
  // a curved smoked face shield: narrow panels round an arc, a rolled rim on top, a chin edge
  const N = 9, R = 0.118, span = 2.3;
  for (let i = 0; i < N; i++) {
    const a = -span / 2 + (i + 0.5) * span / N;
    mb.push().rotateY(a);
    mb.box(0, -0.01, R, (span / N) * R * 1.06, 0.15, 0.012, 'glass_dark', { color: 0x343c48 });
    mb.box(0, 0.138, R - 0.004, (span / N) * R * 1.1, 0.018, 0.026, 'plastic_black');
    mb.pop();
  }
  for (const s of [-1, 1]) { mb.push().translate(s * 0.12, 0.13, 0.0); mb.cylinderX(0, 0, 0, 0.018, 0.02, 8, 'plastic_black'); mb.pop(); }
  mb.push().rotateY(0); mb.box(0, 0.065, R + 0.008, 0.11, 0.008, 0.004, 'white', { color: 0x8a9aaa, emissive: 0.25 }); mb.pop();
  visorGeo = mb.build();
  return visorGeo;
}
function taserMesh(): THREE.Object3D {
  if (!taserGeo) {
    const mb = new ModelBuilder();
    // a stubby yellow body with a rounded snout, a rubber grip, two prongs
    mb.cylinderX(0.02, -0.03, 0, 0.026, 0.15, 10, 'plastic_black', { color: 0xd8c040 });
    mb.sphere(0.095, -0.03, 0, 0.026, 10, 6, 'plastic_black', { color: 0xd8c040 });
    mb.push().translate(-0.04, -0.05, 0).rotateZ(0.25); mb.cylinder(0, -0.07, 0, 0.018, 0.075, 8, 'rubber_black'); mb.pop();
    for (const s of [-1, 1]) mb.cylinderX(0.125, -0.022, s * 0.01, 0.003, 0.02, 4, 'metal_grey');
    taserGeo = mb.build();
  }
  return new THREE.Mesh(taserGeo, worldMaterial({}));
}
/** the BAILIFF fitting gun: a squat grey tool with a C-shaped jaw, a pistol grip and an amber light */
function gunMesh(): THREE.Object3D {
  if (!gunGeo) {
    const mb = new ModelBuilder();
    mb.cylinderX(0, -0.0, 0, 0.045, 0.22, 12, 'metal_grey', { color: 0x9aa0a4 });
    mb.sphere(-0.11, 0, 0, 0.045, 10, 6, 'metal_grey', { color: 0x9aa0a4 });
    mb.push().translate(-0.06, -0.03, 0).rotateZ(0.2); mb.cylinder(0, -0.12, 0, 0.022, 0.12, 8, 'rubber_black'); mb.pop();
    // the jaw: a C of thick steel at the muzzle
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.7 + i * (Math.PI * 1.4 / 6); mb.push().translate(0.15, 0, 0).rotateX(a); mb.cylinderX(0, 0.055, 0, 0.016, 0.06, 8, 'metal_dark'); mb.pop(); }
    mb.sphere(0.0, 0.045, 0.0, 0.012, 8, 6, 'white', { color: 0xffa040, emissive: 1.4 });
    mb.cylinderX(-0.02, 0.04, 0, 0.012, 0.12, 8, 'plastic_black', { color: 0xc89030 });
    gunGeo = mb.build();
  }
  return new THREE.Mesh(gunGeo, worldMaterial({}));
}

export type GuardHeld = 'baton' | 'taser' | 'gun' | null;
const tv = new THREE.Vector3();

const STAGE_MAT = { noVis: true, noFog: true, noGrid: true };
/** swap world materials (that read the zone's visibility / light grid) for stage-safe ones */
function stageMats(o: THREE.Object3D) {
  const safe = worldMaterial(STAGE_MAT);
  o.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh && !Array.isArray(mm.material) && !(mm.material as THREE.Material).transparent) mm.material = safe; });
}

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
  private moved = 0;

  constructor(public label: string, seed: number, stage?: THREE.Object3D) {
    this.staged = !!stage;
    const r = (k: number) => { const s = Math.sin(seed * 91.7 + k * 13.1) * 43758.5453; return s - Math.floor(s); };
    const app: Appearance = {
      skin: SKIN_TONES[Math.floor(r(1) * SKIN_TONES.length)], hair: 0x2a2018, hairStyle: 'buzz', face: Math.floor(r(2) * 6), build: 'broad',
      height: 1.04 + r(3) * 0.05, beard: false, bodyShape: 0.08, facialHair: 'none', age: 0.3,
    };
    this.rig = stage ? new HumanRig(app, worldMaterial(STAGE_MAT)) : new HumanRig(app);
    this.rig.setOutfit(GUARD_OUTFIT);
    const v = new THREE.Mesh(visor(), worldMaterial(stage ? STAGE_MAT : {}));
    v.scale.setScalar(this.rig.s);
    v.castShadow = true;
    this.rig.j.head.add(v);
    this.rig.root.visible = !!stage;
    (stage ?? G.pr.scene).add(this.rig.root);
  }

  setHeld(k: GuardHeld) {
    if (k === this.held) return;
    this.held = k;
    const m = k === 'baton' ? makeHeldMesh('custody_baton') ?? makeHeldMesh('baton') : k === 'taser' ? taserMesh() : k === 'gun' ? gunMesh() : null;
    this.rig.hold('R', m, k === 'baton' ? 'perp' : 'raw');
    if (m && k !== 'baton') { m.rotation.set(0, Math.PI / 2, -Math.PI / 2); m.position.set(0, -0.05, 0.02); }
    if (m && this.staged) stageMats(m);
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
      if (this.act && animSupported(a.name)) animAction = a.name;
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
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = Math.PI / 2 - this.facing;
    if (this.reachL || this.reachR) {
      this.rig.root.updateMatrixWorld(true);
      if (this.reachL) reachArm(this.rig, 'L', this.reachL.p, this.reachL.w, this.reachL.pole);
      if (this.reachR) reachArm(this.rig, 'R', this.reachR.p, this.reachR.w, this.reachR.pole);
    }
  }

  dispose() {
    this.rig.root.removeFromParent();
    this.rig.dispose();
  }
}
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

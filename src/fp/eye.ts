// The first-person eye: while a full close-up is up (the watch, the pack, eating, inspecting...)
// the world behind the hands is drawn from the survivor's own eyes instead of the iso camera.
// A perspective camera sits at the head bone (so crouching, sitting and lying move it), looks
// along the facing with a per-claim downward pitch, breathes, and twitches with every heartbeat
// (harder when the survivor is frightened or hurt). The renderer keeps the low-res pixel look and
// the ink outlines; walls stand full height and eye-only ceilings appear (render layer 1).
//
//   eyeEnter({ pitchDeg?, fov? })  switch to the eye now (cover the cut with a blink)
//   eyeExit()                      back to the iso camera now
//   eyeActive()                    is the eye up
import * as THREE from 'three';
import { G } from '../game/G';

export interface EyeOpts {
  /** look down by this much (deg); default 22, the watch wants ~30 */
  pitchDeg?: number;
  /** vertical field of view on a landscape screen (deg); portrait widens it to keep the view */
  fov?: number;
}

const DEG = Math.PI / 180;
const cam = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 48);
cam.layers.enable(1);   // the ceilings only the eye sees
cam.name = 'eye';

let active = false;
let hooked = false;
let pitchGoal = 22 * DEG, pitch = 22 * DEG;
let yaw = 0, yawVel = 0;
let t = 0, beatT = 0, breathT = 0;
let headY = 1.6;
const head = new THREE.Vector3();
const look = new THREE.Vector3();

/** the angle difference a - b wrapped to -PI..PI */
function wrap(a: number) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function bpm(): number {
  const sys = (G as any)?.systems as { bpm?: number }[] | undefined;
  const m = sys?.find((s) => typeof s?.bpm === 'number');
  return m?.bpm ?? 72;
}

function update(dt: number) {
  if (!active) return;
  const g: any = G, p = g?.local;
  if (!p || !g.pr) return;
  dt = Math.min(0.1, Math.max(0, dt));
  t += dt;
  // the head bone carries the pose (crouch, sit, lie, stumble); fall back to a standing eye
  const hb: THREE.Object3D | undefined = p.rig?.bones?.head;
  let hx = p.x, hz = p.z, hy = (p.y ?? 0) + 1.6;
  if (hb) {
    hb.updateWorldMatrix(true, false);
    head.setFromMatrixPosition(hb.matrixWorld);
    if (Number.isFinite(head.y)) { hx = head.x; hy = head.y + 0.07; hz = head.z; }
  }
  // the eye height eases (a crouch is a quick dip, not a cut)
  headY += (Math.max((p.y ?? 0) + 0.35, hy) - headY) * Math.min(1, dt * 12);
  // a little lag on turns, critically damped
  const goal = p.facing ?? 0;
  const k = 90, c = 2 * Math.sqrt(k);
  yawVel += (wrap(goal - yaw) * k - yawVel * c) * dt;
  yaw = wrap(yaw + yawVel * dt);
  pitch += (pitchGoal - pitch) * Math.min(1, dt * 8);
  // stress: fear and injury make the breath heave and the pulse shake the view
  const b = p.body ?? {};
  const stress = Math.min(1, Math.max(((b.panic ?? 0) - 15) / 85, ((55 - (b.health ?? 100)) / 55) * 0.8, 0));
  const comfort = !!g.camera?.comfort;
  const calm = comfort ? 0.3 : 1;
  breathT += dt * (0.27 + stress * 0.45) * Math.PI * 2;
  beatT += dt * (bpm() / 60);
  const beat = Math.pow(Math.max(0, Math.sin((beatT % 1) * Math.PI * 2)), 10);
  const bob = Math.sin(breathT) * (0.006 + stress * 0.018) * calm;
  const swayP = (Math.sin(breathT) * 0.004 + beat * (0.0015 + stress * 0.006)) * calm;
  const swayY = (Math.sin(breathT * 0.5 + 0.8) * 0.003 + beat * (0.001 + stress * 0.004) * Math.sin(t * 1.7)) * calm;
  // the eye sits just in front of the head's centre, inside the survivor's own collision radius
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  cam.position.set(hx + fx * 0.09, headY + bob, hz + fz * 0.09);
  const pt = pitch + swayP, yw = yaw + swayY;
  look.set(cam.position.x + Math.cos(yw) * Math.cos(pt), cam.position.y - Math.sin(pt), cam.position.z + Math.sin(yw) * Math.cos(pt));
  cam.up.set(0, 1, 0);
  cam.lookAt(look);
  cam.rotateZ(Math.sin(breathT * 0.5) * 0.004 * calm + beat * stress * 0.004 * calm);
  cam.updateMatrixWorld();
  // the survivor's own body (and what it holds) stays out of the picture
  g.pr.eyeHide = p.rig?.root ? [p.rig.root] : [];
}

/** switch the world view to the survivor's eyes, right now */
export function eyeEnter(opts: EyeOpts = {}) {
  const g: any = G;
  if (!g?.pr) return;
  if (!hooked) { g.pr.beforeRender.push(update); hooked = true; }
  pitchGoal = (opts.pitchDeg ?? 22) * DEG;
  g.pr.eyeFov = opts.fov ?? 62;
  if (!active) {
    // start settled: no swing in from wherever the eye was last time
    const p = g.local;
    yaw = p?.facing ?? 0; yawVel = 0; pitch = pitchGoal;
    headY = (p?.y ?? 0) + 1.6;
    const hb: THREE.Object3D | undefined = p?.rig?.bones?.head;
    if (hb) { hb.updateWorldMatrix(true, false); head.setFromMatrixPosition(hb.matrixWorld); if (Number.isFinite(head.y)) headY = head.y + 0.07; }
  }
  active = true;
  g.pr.eyeCamera = cam;
  update(0);
}

/** back to the iso camera, right now */
export function eyeExit() {
  const g: any = G;
  active = false;
  if (!g?.pr) return;
  if (g.pr.eyeCamera === cam) g.pr.eyeCamera = null;
  g.pr.eyeHide = [];
}

export function eyeActive(): boolean { return active; }

/** the eye camera itself (read-only use: projecting labels, aiming) */
export function eyeCamera(): THREE.PerspectiveCamera { return cam; }

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__eye = { eyeEnter, eyeExit, eyeActive, eyeCamera };

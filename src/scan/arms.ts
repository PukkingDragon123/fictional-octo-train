// The survivor's own arms in first-person close-ups (the shared smooth arms
// of src/fp/hands.ts): a pair per stage, dressed for the local survivor, aimed
// so a hand's grip, fingertip or thumb lands on a point (the forearm comes up
// from below toward it, the palm turned by a hint), eased so they never snap.
import * as THREE from 'three';
import { G } from '../game/G';
import { fpArmsFor, type FpArm, type HandPose } from '../fp/hands';

const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _a = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _oq = new THREE.Quaternion(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export class StageArms {
  right: FpArm;
  left: FpArm;
  private skin = -1;
  constructor(parent: THREE.Object3D) {
    const a = fpArmsFor(G.local as any);
    this.right = a.right; this.left = a.left;
    parent.add(this.right.root, this.left.root);
    this.skin = (G.local as any)?.app?.skin ?? -1;
  }
  /** re-dress for the current survivor (skin tone may differ after a load) */
  dress() {
    const skin = (G.local as any)?.app?.skin ?? 0xe8b98f;
    if (skin === this.skin) return;
    this.skin = skin;
    for (const a of [this.right, this.left]) a.setLook({ skin, sleeve: 0xeeb415 });
  }
  /**
   * Aim an arm: `anchor` (arm.grip / arm.tip / arm.thumbTip) goes to `target` (world),
   * the elbow sits near `elbow`, the palm faces `palm`. k eases (1 = snap).
   */
  aim(side: 'right' | 'left', pose: HandPose, anchor: 'grip' | 'tip' | 'thumbTip', target: THREE.Vector3, elbow: [number, number, number], palm: [number, number, number], k = 1) {
    const arm = this[side];
    arm.pose(pose);
    const dir = _d.set(target.x - elbow[0], target.y - elbow[1], target.z - elbow[2]).normalize();
    const z = _z.set(palm[0], palm[1], palm[2]);
    z.addScaledVector(dir, -z.dot(dir)).normalize();
    const x = _x.crossVectors(dir, z).normalize();
    _m.makeBasis(x, dir, z);
    _q.setFromRotationMatrix(_m);
    // solve the position with the wanted rotation, then ease both
    const oq = _oq.copy(arm.root.quaternion), op = _p.copy(arm.root.position);
    arm.root.quaternion.copy(_q); arm.root.position.set(elbow[0], elbow[1], elbow[2]);
    arm.root.updateMatrixWorld(true);
    const a = arm[anchor].getWorldPosition(_a);
    const want = _t.set(elbow[0] + target.x - a.x, elbow[1] + target.y - a.y, elbow[2] + target.z - a.z);
    if (k >= 1) { arm.root.position.copy(want); return; }
    arm.root.quaternion.copy(oq).slerp(_q, k);
    arm.root.position.copy(op).lerp(want, k);
  }
  /** an arm at rest, low at the edge of the frame */
  rest(side: 'right' | 'left', k = 1, drop = 0) {
    const arm = this[side], s = side === 'right' ? 1 : -1;
    arm.pose('relaxed');
    _p.set(s * 0.2, -0.46 - drop, -0.32);
    arm.root.position.lerp(_p, k);
    _q.setFromEuler(_e.set(-0.35, 0, -s * 0.35));
    arm.root.quaternion.slerp(_q, k);
  }
  update(dt: number) { this.right.update(dt); this.left.update(dt); }
  set visible(v: boolean) { this.right.root.visible = v; this.left.root.visible = v; }
}

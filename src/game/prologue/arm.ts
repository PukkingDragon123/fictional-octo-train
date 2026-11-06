// The operator's own right arm in the stage scenes (the prologue, the
// handshake): the shared first-person arm (src/fp/hands.ts) with a two-bone
// reach from a shoulder just outside the frame toward a world point (the
// badge, the door panel, the armrest), resting low in the corner otherwise.
// Only ever drawn through the eyes: these scenes are first person.
import * as THREE from 'three';
import { fpArm, type FpArm, type HandPose } from '../../fp/hands';

const SHOULDER = new THREE.Vector3(0.17, -0.25, -0.2);
const REST = new THREE.Vector3(0.24, -0.56, -0.36);
const UPPER = 0.3, FORE = 0.26;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const mtx = new THREE.Matrix4();
const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** the stage pass writes a normal buffer: the fp arm's standard materials learn to write it too */
export function stageNormals(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[]) {
      const tag = mat as THREE.Material & { ixN?: boolean };
      if (tag.ixN || (mat as THREE.ShaderMaterial).isShaderMaterial) continue;
      tag.ixN = true;
      const prev = mat.onBeforeCompile?.bind(mat);
      mat.onBeforeCompile = (sh, r) => {
        prev?.(sh, r);
        if (sh.fragmentShader.includes('gNormal')) return;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nlayout(location = 1) out highp vec4 gNormal;')
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngNormal = vec4(normalize(normal) * 0.5 + 0.5, 1.0);');
      };
      const key = mat.customProgramCacheKey?.bind(mat);
      mat.customProgramCacheKey = () => (key ? key() : '') + '|ixN';
      mat.needsUpdate = true;
    }
  });
}

export class ReachArm {
  readonly arm: FpArm;
  /** 0 resting .. 1 at the target */
  k = 0; goal = 0;
  target = new THREE.Vector3();
  /** hidden entirely (seated shots, the shock) */
  shown = true;
  constructor(scene: THREE.Object3D, cam: THREE.Camera, o: { skin?: number; sleeve?: number } = {}) {
    this.arm = fpArm('right', { skin: o.skin ?? 0xe0b090, sleeve: o.sleeve ?? 0x4a5866, sleeveStyle: 'long' });
    this.arm.reach = cam;
    this.arm.root.traverse((m) => { m.castShadow = true; (m as THREE.Mesh).receiveShadow = true; m.frustumCulled = false; });
    stageNormals(this.arm.root);
    this.arm.pose('relaxed', true);
    scene.add(this.arm.root);
  }
  /** reach for a world point (or come back to rest with null) */
  reach(at: THREE.Vector3 | null, pose: HandPose = 'point') {
    if (at) { this.target.copy(at); this.goal = 1; this.arm.pose(pose); } else { this.goal = 0; this.arm.pose('relaxed'); }
  }
  update(dt: number, cam: THREE.Camera) {
    this.k += Math.sign(this.goal - this.k) * Math.min(Math.abs(this.goal - this.k), dt * 2.4);
    const arm = this.arm;
    arm.root.visible = this.shown && this.k > 0.04;
    if (!arm.root.visible) return;
    cam.updateMatrixWorld();
    const S = cam.localToWorld(v1.copy(SHOULDER));
    const rest = cam.localToWorld(v2.copy(REST));
    const dir = v3.copy(this.target).sub(S);
    const L = Math.min(dir.length() - 0.03, UPPER + FORE - 0.004);
    const full = v4.copy(S).addScaledVector(dir.normalize(), Math.max(0.1, L));
    const W = rest.lerp(full, ease(this.k));
    const pole = v5.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(0.7).addScaledVector(UP, -0.7);
    // two-bone IK: the elbow
    const d = new THREE.Vector3().copy(W).sub(S);
    let len = d.length();
    len = Math.min(len, UPPER + FORE - 1e-3);
    d.normalize();
    const a = (UPPER * UPPER - FORE * FORE + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    const pd = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    const E = new THREE.Vector3().copy(S).addScaledVector(d, a).addScaledVector(pd, h);
    const Y = new THREE.Vector3().copy(W).sub(E).normalize();
    const Z = new THREE.Vector3(0, -1, 0).addScaledVector(Y, Y.y).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z);
    mtx.makeBasis(X, Y, Z);
    arm.root.quaternion.setFromRotationMatrix(mtx);
    arm.root.position.copy(E);
    arm.wrist.rotation.x = -0.25 * ease(this.k);
    arm.update(dt);
    arm.root.updateMatrixWorld(true);
  }
  dispose() { this.arm.root.removeFromParent(); this.arm.dispose(); }
}

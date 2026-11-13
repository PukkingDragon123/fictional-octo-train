// First-person arms and hands, shared by every close-up (backpack, eating, inspection, bench, cooking,
// surgery, the intro, the wrist terminal). They are the unit's OWN arm: a HumanRig
// (src/entities/humanRig.ts) dressed in the unit's outfit and painted by its paint pipeline at the
// finest level (the hd page: the sleeve and its cuff, the glove's seams, skin, fingers), of which
// only the forearm, the hand and the upper arm are kept: every other bone folds to a point at the
// shoulder, out of the frame. The rig's own bones are posed by the same API the close-ups call.
//
// Space: the elbow is the root's origin and the forearm runs up local +Y to the
// wrist (0.26 m); fingers continue along +Y; the palm faces +Z. A left arm is a
// mirrored right arm. Fingers curl toward +Z. Hang held items on `grip`.
// The upper arm runs from the elbow back to a shoulder below and beside the
// camera, so an arm always leaves the frame at the bottom edge: no hand floats.
import * as THREE from 'three';
import { G } from '../game/G';
import { HumanRig, normalizeAppearance, type Appearance, type Outfit } from '../entities/humanRig';
import { worldMaterial } from '../gfx/materials';

export type HandPose = 'relaxed' | 'open' | 'fist' | 'grip' | 'point' | 'pinch' | 'cup' | 'press' | 'claw' | 'flat';
type F3 = [number, number, number];
interface PoseDef { f: [F3, F3, F3, F3]; spread: number; thumb: [number, number, number] }

const P = (i: F3, m: F3, r: F3, k: F3, spread: number, thumb: [number, number, number]): PoseDef => ({ f: [i, m, r, k], spread, thumb });
export const HAND_POSES: Record<HandPose, PoseDef> = {
  relaxed: P([0.2, 0.3, 0.2], [0.25, 0.35, 0.22], [0.3, 0.4, 0.25], [0.38, 0.45, 0.3], 0.2, [0.35, 0.15, 0.2]),
  open: P([0.02, 0.03, 0.02], [0.02, 0.03, 0.02], [0.03, 0.04, 0.03], [0.04, 0.05, 0.03], 1, [0.05, 0.02, 0.02]),
  flat: P([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], 0, [0.25, 0, 0]),
  fist: P([1.45, 1.7, 1.15], [1.5, 1.72, 1.15], [1.52, 1.7, 1.12], [1.55, 1.65, 1.1], 0, [0.95, 0.55, 0.55]),
  grip: P([1.05, 1.2, 0.85], [1.1, 1.25, 0.88], [1.15, 1.25, 0.85], [1.2, 1.2, 0.8], 0.05, [1.05, 0.35, 0.3]),
  point: P([0.04, 0.05, 0.04], [1.5, 1.7, 1.1], [1.52, 1.7, 1.1], [1.55, 1.65, 1.05], 0.1, [0.85, 0.45, 0.4]),
  pinch: P([0.7, 0.6, 0.35], [0.55, 0.5, 0.3], [0.65, 0.6, 0.35], [0.75, 0.65, 0.4], 0.1, [1.2, 0.45, 0.35]),
  cup: P([0.45, 0.5, 0.35], [0.45, 0.5, 0.35], [0.5, 0.5, 0.35], [0.55, 0.5, 0.35], 0.15, [0.6, 0.2, 0.2]),
  press: P([1.3, 1.6, 1.1], [1.35, 1.6, 1.1], [1.4, 1.6, 1.05], [1.45, 1.55, 1.0], 0, [0.35, 0.04, 0.04]),
  claw: P([0.55, 1.1, 0.9], [0.5, 1.15, 0.95], [0.55, 1.1, 0.9], [0.6, 1.05, 0.85], 1.4, [0.5, 0.6, 0.6]),
};

const FOREARM = 0.26;
/** where the shoulder sits in the camera's own space (x is mirrored for the left arm): well outside the frame */
const SHOULDER = new THREE.Vector3(0.17, -0.25, -0.2);
/** the rig's hanging left arm turned into this space: forearm up +Y, palm (the rig's -X) to +Z, thumb (+Z) to -X */
const ALIGN = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0)));
const TINY = 1e-4;

// ---------------------------------------------------------------- the arm
export interface FpArm {
  root: THREE.Group;
  /** the wrist joint: rotate it to bend the hand; devices strap on here */
  wrist: THREE.Group;
  palm: THREE.Group;
  /** where a held item sits (centre of a closed grip) */
  grip: THREE.Object3D;
  /** the index fingertip (for pressing buttons and scanners) */
  tip: THREE.Object3D;
  /** the thumb tip (fingerprint readers) */
  thumbTip: THREE.Object3D;
  /** ease toward a pose (instant snaps) */
  pose(p: HandPose | PoseDef, instant?: boolean): void;
  update(dt: number): void;
  setLook(o: { skin?: number; sleeve?: number | null; sleeveStyle?: 'long' | 'rolled' | 'none' }): void;
  /** fear tremor 0..1 */
  tremor: number;
  /** the camera the upper arm runs back toward (to a shoulder off-screen). undefined = the
   *  first-person overlay camera when the arm sits in the overlay scene; null = no upper arm */
  reach: THREE.Camera | null | undefined;
  dispose(): void;
}

export interface FpArmOpts { skin?: number; sleeve?: number | null; sleeveStyle?: 'long' | 'rolled' | 'none'; scale?: number }

export function fpArm(side: 'right' | 'left' = 'right', o: FpArmOpts = {}): FpArm {
  const p = G?.local as unknown as { app?: Partial<Appearance>; computeOutfit?: () => Outfit; worn?: Map<string, { key: string }> } | null;
  let app = normalizeAppearance({ ...(p?.app ?? {}), ...(o.skin != null ? { skin: o.skin } : {}) });
  let sleeve = o.sleeve === undefined ? 0xeeb415 : o.sleeve;
  let sleeveStyle: 'long' | 'rolled' | 'none' = o.sleeveStyle ?? (sleeve === null ? 'none' : 'long');
  /** the unit's clothes as they are (its suit, its gloves); a plain jumpsuit sleeve when there is no unit */
  const outfit = (): Outfit => {
    let out: Outfit = {};
    try { out = p?.computeOutfit?.() ?? {}; } catch { out = {}; }
    out = { ...out };
    if (sleeveStyle === 'none') { out.torso = { tex: 'c_bare', color: app.skin, sleeve: 'none' } as Outfit['torso']; out.torsoOuter = undefined; }
    else if (!out.torso) out.torso = { tex: 'c_uniform', color: sleeve ?? 0xeeb415, sleeve: sleeveStyle === 'rolled' ? 'short' : 'long' } as Outfit['torso'];
    // the debt band on the left wrist (the rig draws it when the hand is bare)
    if (side === 'left' && p?.worn && [...p.worn.values()].some((it) => /band/.test(it.key))) out.wrist = { tex: 'c_gloves', color: 0x8a8e94 } as Outfit['wrist'];
    return out;
  };
  const rig = new HumanRig(app, worldMaterial({ noVis: true, noFog: true, noGrid: true }), { hd: true });
  rig.setOutfit(outfit());
  rig.root.traverse((ob) => { ob.castShadow = false; ob.frustumCulled = false; });

  const root = new THREE.Group(); root.name = 'fpArm:' + side;
  if (side === 'left') root.scale.x = -1;
  if (o.scale) root.scale.multiplyScalar(o.scale);
  // the rig's left arm (a mirrored root makes it the left hand again): its bones lifted out of the body
  const ua = rig.j.uarmL, fa = rig.j.farmL, ha = rig.j.handL;
  const handLen = ha.position.length() || 0.25, uaLen = fa.position.length() || 0.285;
  root.add(rig.root);
  root.add(fa); fa.position.set(0, 0, 0); fa.quaternion.copy(ALIGN);
  const wrist = new THREE.Group(); wrist.position.y = FOREARM; root.add(wrist);
  wrist.add(ha); ha.position.set(0, 0, 0); ha.quaternion.copy(ALIGN);
  // (the forearm is stretched a touch to the close-ups' 0.26 m)
  fa.scale.set(1, FOREARM / handLen, 1);
  root.add(ua);
  // the rest of the body folds to nothing where the rig's root is (kept at the shoulder, off the frame)
  rig.j.hips.scale.setScalar(TINY); rig.j.hips.position.set(0, 0, 0);
  const palm = new THREE.Group(); wrist.add(palm);
  const grip = new THREE.Object3D(); grip.position.set(0.002, 0.075, 0.032); palm.add(grip);
  const tip = new THREE.Object3D(); tip.position.set(-0.02, 0.165, 0.012); palm.add(tip);
  const thumbTip = new THREE.Object3D(); thumbTip.position.set(-0.048, 0.085, 0.03); palm.add(thumbTip);

  // the fingers: the rig's two finger joints and its thumb, eased toward the pose
  const f1 = rig.bones.fing1L, f2 = rig.bones.fing2L, th = rig.bones.thumbL;
  const cur = { c1: 0.2, c2: 0.3, t: 0.2, spread: 0.2 };
  let target: PoseDef = HAND_POSES.relaxed;
  let tremT = Math.random() * 10;
  const goal = (d: PoseDef) => ({ c1: d.f.reduce((a, f) => a + f[0], 0) / 4, c2: d.f.reduce((a, f) => a + (f[1] + f[2]) * 0.5, 0) / 4 * 1.1, t: Math.min(1, d.thumb[0] / 0.95), spread: d.spread });
  function apply() {
    f1.rotation.set(0, 0, -cur.c1);
    f2.rotation.set(0, 0, -cur.c2);
    th.rotation.set(cur.t * 0.5, cur.t * 0.6, -cur.t * 0.55);
  }

  const shoulder = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  /** the upper arm from the elbow back to a shoulder just outside the camera's frame; the folded body sits there */
  function reachBack() {
    let cam = arm.reach;
    if (cam === undefined) {
      let top: THREE.Object3D = root;
      while (top.parent) top = top.parent;
      cam = G.pr && top === G.pr.overlayScene ? G.pr.overlayCamera : null;
    }
    if (!cam) {
      // no upper arm: it folds into the elbow, the body with it
      ua.position.set(0, 0, 0); ua.scale.setScalar(TINY); rig.root.position.set(0, 0, 0);
      return;
    }
    cam.updateMatrixWorld();
    root.updateWorldMatrix(true, false);
    shoulder.copy(SHOULDER);
    if (side === 'left') shoulder.x = -shoulder.x;
    root.worldToLocal(cam.localToWorld(shoulder));
    const len = shoulder.length();
    if (len < 1e-4) return;
    dir.copy(shoulder).divideScalar(len);
    // the upper arm bone runs down its -Y from the shoulder to the elbow (ALIGN turns that to +Y, q to the elbow)
    q.setFromUnitVectors(up, dir.negate());
    ua.quaternion.copy(q).multiply(ALIGN);
    ua.scale.setScalar(1);
    ua.scale.y = len / uaLen;
    ua.position.copy(shoulder);
    rig.root.position.copy(shoulder);
  }

  const arm: FpArm = {
    root, wrist, palm, grip, tip, thumbTip, tremor: 0, reach: undefined,
    pose(pd, instant) {
      target = typeof pd === 'string' ? HAND_POSES[pd] : pd;
      if (instant) { Object.assign(cur, goal(target)); apply(); }
    },
    update(dt) {
      const g = goal(target);
      const k = 1 - Math.exp(-dt * 14);
      cur.c1 += (g.c1 - cur.c1) * k; cur.c2 += (g.c2 - cur.c2) * k; cur.t += (g.t - cur.t) * k; cur.spread += (g.spread - cur.spread) * k;
      tremT += dt;
      if (arm.tremor > 0.01) {
        const t = arm.tremor * 0.035;
        cur.c2 += Math.sin(tremT * 31) * t * 0.3;
        wrist.rotation.z = Math.sin(tremT * 23) * t * 0.4;
      }
      apply();
      reachBack();
    },
    setLook(l) {
      if (l.skin != null) app = normalizeAppearance({ ...app, skin: l.skin });
      if (l.sleeve !== undefined) { sleeve = l.sleeve; if (l.sleeve === null) sleeveStyle = 'none'; }
      if (l.sleeveStyle) sleeveStyle = l.sleeveStyle;
      if (l.skin != null) rig.setAppearance(app);
      rig.setOutfit(outfit());
    },
    dispose() { rig.dispose(); root.removeFromParent(); },
  };
  arm.pose('relaxed', true);
  return arm;
}

/** both arms dressed for a survivor (skin tone, the jumpsuit's sleeves) */
export function fpArmsFor(p: { app?: { skin?: number; suit?: { sleeves?: string } } } | null | undefined, sleeveColor: number | null = 0xeeb415) {
  const skin = p?.app?.skin ?? 0xe8b98f;
  const sleeveStyle = sleeveColor === null ? 'none' : p?.app?.suit?.sleeves === 'rolled' ? 'rolled' : 'long';
  return { right: fpArm('right', { skin, sleeve: sleeveColor, sleeveStyle }), left: fpArm('left', { skin, sleeve: sleeveColor, sleeveStyle }) };
}

/** a soft three-point rig for close-ups whose owner has no lights of its own (warm key, cool fill, rim) */
export function fpLightRig(key = 0xffe2c0, fill = 0x6c7a8c): THREE.Group {
  const g = new THREE.Group(); g.name = 'fpLights';
  g.add(new THREE.HemisphereLight(0xe8e0d0, 0x2a2420, 0.7));
  const k = new THREE.DirectionalLight(key, 1.6); k.position.set(0.6, 0.8, 0.5); g.add(k);
  const f = new THREE.DirectionalLight(fill, 0.5); f.position.set(-0.8, 0.1, 0.3); g.add(f);
  const r = new THREE.DirectionalLight(0xfff4e0, 0.9); r.position.set(-0.2, 0.6, -1); g.add(r);
  return g;
}

// Where the operating tools work on the subject, and how the camera frames
// each part. Anchors and paths are in a bone's own space at height 1 (the
// room scales them by the subject's height and head size, then finds the real
// skin under them with a ray, so a different body model still lines up).
// Paths are the lines the trace mini-games cut along.

export type AnchorBone = 'head' | 'chest' | 'hips' | 'uarmL' | 'uarmR' | 'farmL' | 'farmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR';
type V3 = [number, number, number];
export interface Anchor { bone: AnchorBone; p: V3; n: V3 }

export const ANCHORS: Record<string, Anchor> = {
  face: { bone: 'head', p: [0, 0.07, 0.11], n: [0, 0, 1] },
  chin: { bone: 'head', p: [0, 0.0, 0.1], n: [0, -0.4, 1] },
  jaw: { bone: 'head', p: [0.06, 0.02, 0.07], n: [0.8, -0.3, 0.6] },
  mouth: { bone: 'head', p: [0, 0.03, 0.105], n: [0, 0, 1] },
  nose: { bone: 'head', p: [0, 0.058, 0.115], n: [0, 0, 1] },
  eyes: { bone: 'head', p: [0.03, 0.095, 0.1], n: [0.15, 0, 1] },
  eyeL: { bone: 'head', p: [0.03, 0.095, 0.1], n: [0.15, 0, 1] },
  eyeR: { bone: 'head', p: [-0.03, 0.095, 0.1], n: [-0.15, 0, 1] },
  brows: { bone: 'head', p: [0.03, 0.118, 0.1], n: [0.1, 0.2, 1] },
  ear: { bone: 'head', p: [-0.092, 0.088, 0.0], n: [-1, 0, 0.1] },
  cheek: { bone: 'head', p: [0.055, 0.06, 0.088], n: [0.6, 0, 0.8] },
  forehead: { bone: 'head', p: [0, 0.145, 0.1], n: [0, 0.3, 1] },
  scalp: { bone: 'head', p: [0, 0.2, 0.02], n: [0, 1, 0.3] },
  temple: { bone: 'head', p: [0.08, 0.15, 0.03], n: [0.8, 0.5, 0.2] },
  templeR: { bone: 'head', p: [-0.08, 0.15, 0.03], n: [-0.8, 0.5, 0.2] },
  crown: { bone: 'head', p: [0, 0.19, -0.06], n: [0, 0.8, -0.5] },
  neck: { bone: 'chest', p: [0, 0.3, 0.06], n: [0, 0, 1] },
  chest: { bone: 'chest', p: [0, 0.12, 0.13], n: [0, 0.1, 1] },
  belly: { bone: 'hips', p: [0, 0.16, 0.12], n: [0, 0, 1] },
  armL: { bone: 'uarmL', p: [0, -0.14, 0.05], n: [0, 0, 1] },
  armR: { bone: 'uarmR', p: [0, -0.14, 0.05], n: [0, 0, 1] },
  forearmL: { bone: 'farmL', p: [0, -0.12, 0.04], n: [0, 0, 1] },
  forearmR: { bone: 'farmR', p: [0, -0.12, 0.04], n: [0, 0, 1] },
  thigh: { bone: 'thighL', p: [0, -0.2, 0.08], n: [0, 0, 1] },
  thighR: { bone: 'thighR', p: [0, -0.2, 0.08], n: [0, 0, 1] },
  shinR: { bone: 'shinR', p: [0, -0.2, 0.06], n: [0, 0, 1] },
  shin: { bone: 'shinL', p: [0, -0.2, 0.06], n: [0, 0, 1] },
};

/** lines to cut along (head space unless noted) */
export const PATHS: Record<string, { bone: AnchorBone; pts: V3[] }> = {
  // under the jaw from ear to ear
  jaw: { bone: 'head', pts: [[0.088, 0.075, 0.02], [0.08, 0.04, 0.05], [0.058, 0.012, 0.08], [0.03, -0.004, 0.096], [0, -0.008, 0.1], [-0.03, -0.004, 0.096], [-0.058, 0.012, 0.08], [-0.08, 0.04, 0.05], [-0.088, 0.075, 0.02]] },
  // round the back of the ear
  ear: { bone: 'head', pts: [[-0.088, 0.125, 0.02], [-0.094, 0.12, -0.015], [-0.098, 0.095, -0.03], [-0.097, 0.068, -0.02], [-0.093, 0.052, 0.005]] },
  // along both lids, over the bridge
  eyes: { bone: 'head', pts: [[0.06, 0.094, 0.088], [0.045, 0.106, 0.097], [0.028, 0.109, 0.101], [0.012, 0.1, 0.104], [0, 0.094, 0.108], [-0.012, 0.1, 0.104], [-0.028, 0.109, 0.101], [-0.045, 0.106, 0.097], [-0.06, 0.094, 0.088]] },
  // over both brows
  brows: { bone: 'head', pts: [[0.062, 0.114, 0.09], [0.042, 0.124, 0.098], [0.02, 0.124, 0.103], [0.006, 0.118, 0.106], [-0.006, 0.118, 0.106], [-0.02, 0.124, 0.103], [-0.042, 0.124, 0.098], [-0.062, 0.114, 0.09]] },
  // down the nose and round the nostrils
  nose: { bone: 'head', pts: [[0, 0.098, 0.108], [0, 0.08, 0.112], [0, 0.064, 0.117], [0.012, 0.05, 0.11], [0, 0.046, 0.112], [-0.012, 0.05, 0.11]] },
  // round the lips
  mouth: { bone: 'head', pts: [[0.03, 0.03, 0.098], [0.015, 0.04, 0.105], [0, 0.038, 0.107], [-0.015, 0.04, 0.105], [-0.03, 0.03, 0.098], [-0.015, 0.02, 0.104], [0, 0.018, 0.105], [0.015, 0.02, 0.104], [0.03, 0.03, 0.098]] },
  // temple to temple over the crown
  scalp: { bone: 'head', pts: [[0.088, 0.13, 0.05], [0.075, 0.17, 0.06], [0.045, 0.198, 0.05], [0, 0.208, 0.04], [-0.045, 0.198, 0.05], [-0.075, 0.17, 0.06], [-0.088, 0.13, 0.05]] },
  // the jawline and chin (a beard trim)
  beard: { bone: 'head', pts: [[0.085, 0.07, 0.04], [0.072, 0.035, 0.07], [0.045, 0.012, 0.09], [0, 0.0, 0.102], [-0.045, 0.012, 0.09], [-0.072, 0.035, 0.07], [-0.085, 0.07, 0.04]] },
  // a scar across the cheek
  scar: { bone: 'head', pts: [[0.078, 0.112, 0.06], [0.064, 0.09, 0.08], [0.052, 0.068, 0.09], [0.038, 0.048, 0.098]] },
};

/** camera framings for the creator: what to look at (bone space), distance, yaw round the subject, pitch, lens */
export interface ShotDef { bone: AnchorBone; at: V3; dist: number; yaw: number; pitch: number; fov: number; pDist: number; pFov: number }
export const SHOTS: Record<string, ShotDef> = {
  face: { bone: 'head', at: [0, 0.085, 0.03], dist: 0.66, yaw: 0.14, pitch: 0.04, fov: 30, pDist: 1.05, pFov: 38 },
  eyes: { bone: 'head', at: [0, 0.095, 0.06], dist: 0.44, yaw: 0.08, pitch: 0.02, fov: 30, pDist: 0.74, pFov: 38 },
  nose: { bone: 'head', at: [0, 0.05, 0.06], dist: 0.5, yaw: 0.46, pitch: 0.02, fov: 30, pDist: 0.82, pFov: 38 },
  mouth: { bone: 'head', at: [0, 0.035, 0.07], dist: 0.46, yaw: 0.3, pitch: -0.02, fov: 30, pDist: 0.78, pFov: 38 },
  hair: { bone: 'head', at: [0, 0.14, 0.0], dist: 0.82, yaw: 0.6, pitch: 0.36, fov: 32, pDist: 1.25, pFov: 40 },
  beard: { bone: 'head', at: [0, 0.04, 0.05], dist: 0.56, yaw: -0.42, pitch: -0.06, fov: 30, pDist: 0.9, pFov: 38 },
  brows: { bone: 'head', at: [0, 0.11, 0.06], dist: 0.46, yaw: -0.2, pitch: 0.06, fov: 30, pDist: 0.76, pFov: 38 },
  ears: { bone: 'head', at: [-0.05, 0.085, 0.0], dist: 0.52, yaw: -1.05, pitch: 0.06, fov: 30, pDist: 0.86, pFov: 38 },
  marks: { bone: 'head', at: [0.015, 0.08, 0.05], dist: 0.56, yaw: 0.5, pitch: 0.02, fov: 30, pDist: 0.92, pFov: 38 },
  skin: { bone: 'chest', at: [0, 0.2, 0.02], dist: 1.4, yaw: 0.32, pitch: 0.06, fov: 32, pDist: 2.3, pFov: 42 },
  // the unit room's hardware: the neck port, each arm, each leg
  neck: { bone: 'chest', at: [0, 0.27, 0.03], dist: 0.78, yaw: 0.34, pitch: 0.08, fov: 30, pDist: 1.25, pFov: 40 },
  armL: { bone: 'uarmL', at: [0, -0.22, 0.02], dist: 1.25, yaw: 0.62, pitch: 0.06, fov: 32, pDist: 1.9, pFov: 42 },
  armR: { bone: 'uarmR', at: [0, -0.22, 0.02], dist: 1.25, yaw: -0.62, pitch: 0.06, fov: 32, pDist: 1.9, pFov: 42 },
  legL: { bone: 'thighL', at: [0, -0.32, 0.03], dist: 1.6, yaw: 0.45, pitch: 0.12, fov: 32, pDist: 2.4, pFov: 42 },
  legR: { bone: 'thighR', at: [0, -0.32, 0.03], dist: 1.6, yaw: -0.45, pitch: 0.12, fov: 32, pDist: 2.4, pFov: 42 },
};

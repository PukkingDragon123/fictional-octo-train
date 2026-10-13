import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import './humanTextures';

export type JointName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'uarmL' | 'farmL' | 'handL' | 'uarmR' | 'farmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR';

export const JOINTS: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

export interface Appearance {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'long' | 'buzz' | 'bald' | 'ponytail' | 'curly' | 'bob';
  face: number;           // 0..3
  build: 'slim' | 'average' | 'broad';
  height: number;         // 0.94 .. 1.06 scale
  beard?: boolean;
}

export interface LookPart { tex: string; color: number; sleeve?: 'none' | 'short' | 'long'; }
export interface Outfit {
  torso?: LookPart;       // innermost visible top
  torsoOuter?: LookPart;  // jacket/coat (drawn over torso)
  legs?: LookPart;
  legsKind?: 'pants' | 'shorts' | 'skirt';
  feet?: LookPart;
  hands?: LookPart;
  head?: LookPart & { hat?: 'cap' | 'beanie' | 'hardhat' | 'helmet' };
  eyes?: LookPart;
  face?: LookPart;
  back?: LookPart & { size?: number };
}

export const SKIN_TONES = [0xf3d2b8, 0xe8b98f, 0xd39b6c, 0xb67a4c, 0x8d5634, 0x5e3a24];
export const HAIR_COLORS = [0x1c1612, 0x3b2a1e, 0x6a4628, 0x9c7a46, 0xd8c08a, 0xa8a49e, 0x8a3a1c, 0xe8e2d6];

/**
 * Segmented low-poly human (PS1-style rigid parts on a joint hierarchy).
 * Each body segment is a tapered box textured from the atlas and tinted per
 * character, so outfits are swapped by rebuilding a few small meshes.
 */
export class HumanRig {
  root = new THREE.Group();
  /** body pivot (rotated for lying / swimming poses) */
  body = new THREE.Group();
  j = {} as Record<JointName, THREE.Group>;
  meshes = new Map<string, THREE.Mesh>();
  heldR = new THREE.Group();
  heldL = new THREE.Group();
  backSlot = new THREE.Group();
  app: Appearance;
  outfit: Outfit = {};
  s: number;
  material: THREE.Material;
  private bw: number;

  constructor(app: Appearance, material?: THREE.Material) {
    this.app = app;
    this.s = app.height;
    this.bw = app.build === 'slim' ? 0.9 : app.build === 'broad' ? 1.12 : 1;
    this.material = material || worldMaterial({});
    this.root.add(this.body);
    const s = this.s;
    const mk = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); this.j[name] = g; return g;
    };
    const hips = mk('hips', this.body, 0, 0.94 * s, 0);
    const spine = mk('spine', hips, 0, 0.07 * s, 0);
    const chest = mk('chest', spine, 0, 0.2 * s, 0);
    const neck = mk('neck', chest, 0, 0.27 * s, 0);
    mk('head', neck, 0, 0.06 * s, 0.01);
    const sw = 0.215 * s * this.bw;
    const uL = mk('uarmL', chest, sw, 0.22 * s, 0);
    const fL = mk('farmL', uL, 0, -0.29 * s, 0);
    mk('handL', fL, 0, -0.25 * s, 0);
    const uR = mk('uarmR', chest, -sw, 0.22 * s, 0);
    const fR = mk('farmR', uR, 0, -0.29 * s, 0);
    mk('handR', fR, 0, -0.25 * s, 0);
    const tL = mk('thighL', hips, 0.095 * s * this.bw, -0.02 * s, 0);
    const sL = mk('shinL', tL, 0, -0.43 * s, 0);
    mk('footL', sL, 0, -0.42 * s, 0);
    const tR = mk('thighR', hips, -0.095 * s * this.bw, -0.02 * s, 0);
    const sR = mk('shinR', tR, 0, -0.43 * s, 0);
    mk('footR', sR, 0, -0.42 * s, 0);
    this.j.handR.add(this.heldR); this.heldR.position.set(0, -0.06 * s, 0.02);
    this.j.handL.add(this.heldL); this.heldL.position.set(0, -0.06 * s, 0.02);
    this.j.chest.add(this.backSlot); this.backSlot.position.set(0, 0.1 * s, -0.13 * s * this.bw);
    this.setOutfit({});
  }

  private partMesh(key: string, parent: THREE.Object3D, build: (mb: ModelBuilder) => void) {
    const old = this.meshes.get(key);
    if (old) { old.parent?.remove(old); old.geometry.dispose(); }
    const mb = new ModelBuilder();
    build(mb);
    if (mb.isEmpty) { this.meshes.delete(key); return; }
    const m = new THREE.Mesh(mb.build(), this.material);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    this.meshes.set(key, m);
  }

  /** Rebuild all segment meshes for an outfit */
  setOutfit(o: Outfit) {
    this.outfit = o;
    const s = this.s, bw = this.bw, A = this.app;
    const skin = { tex: 'c_skin', color: A.skin };
    const top = o.torsoOuter || o.torso || { tex: 'c_underwear', color: 0xd8d4c8, sleeve: 'none' as const };
    const inner = o.torso || top;
    const sleeve = (o.torsoOuter?.sleeve ?? 'long') === 'long' && o.torsoOuter ? 'long' : (top.sleeve ?? 'short');
    const legs = o.legs || { tex: 'c_underwear', color: 0xd8d4c8 };
    const legsKind = o.legs ? (o.legsKind || 'pants') : 'shorts';
    const feet = o.feet || skin;
    // tapered box helper: bottom w/d to top w/d
    const tbox = (mb: ModelBuilder, y0: number, h: number, wb: number, db: number, wt: number, dt: number, p: { tex: string; color: number }, front?: string, zoff = 0) => {
      const hw0 = wb / 2, hd0 = db / 2, hw1 = wt / 2, hd1 = dt / 2;
      const y1 = y0 + h;
      const P = [
        [-hw0, y0, hd0 + zoff], [hw0, y0, hd0 + zoff], [hw1, y1, hd1 + zoff], [-hw1, y1, hd1 + zoff], // front +z
        [hw0, y0, -hd0 + zoff], [-hw0, y0, -hd0 + zoff], [-hw1, y1, -hd1 + zoff], [hw1, y1, -hd1 + zoff], // back
      ];
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      mb.quadRaw([P[0], P[1], P[2], P[3]], uv, front || p.tex, p.color, 0.96);
      mb.quadRaw([P[4], P[5], P[6], P[7]], uv, p.tex, p.color, 0.8);
      mb.quadRaw([P[1], P[4], P[7], P[2]], uv, p.tex, p.color, 0.88);   // +x side
      mb.quadRaw([P[5], P[0], P[3], P[6]], uv, p.tex, p.color, 0.84);   // -x side
      mb.quadRaw([P[3], P[2], P[7], P[6]], uv, p.tex, p.color, 1.0);    // top
      mb.quadRaw([P[5], P[4], P[1], P[0]], uv, p.tex, p.color, 0.55);   // bottom
    };
    // pelvis
    this.partMesh('pelvis', this.j.hips, (mb) => tbox(mb, -0.08 * s, 0.16 * s, 0.31 * s * bw, 0.19 * s, 0.31 * s * bw, 0.2 * s, legs));
    // lower torso (shirt tucked)
    this.partMesh('spine', this.j.spine, (mb) => tbox(mb, -0.02 * s, 0.24 * s, 0.3 * s * bw, 0.18 * s, 0.33 * s * bw, 0.19 * s, top));
    // chest
    this.partMesh('chest', this.j.chest, (mb) => {
      tbox(mb, -0.02 * s, 0.27 * s, 0.33 * s * bw, 0.19 * s, 0.38 * s * bw, 0.2 * s, top);
      if (o.torsoOuter && o.torso) {
        // inner shirt visible as a strip at the collar / opening
        mb.box(0, 0.12 * s, 0.1 * s + 0.004, 0.08 * s, 0.13 * s, 0.01, inner.tex, { color: inner.color, fit: true });
      }
    });
    // neck
    this.partMesh('neck', this.j.neck, (mb) => tbox(mb, -0.02 * s, 0.09 * s, 0.1 * s, 0.1 * s, 0.09 * s, 0.09 * s, skin));
    // head: face box + hair shell + headwear
    this.partMesh('head', this.j.head, (mb) => {
      const hw = 0.19 * s, hh = 0.23 * s, hd = 0.21 * s;
      mb.box(0, 0, 0, hw, hh, hd, { south: 'c_face_' + (A.face & 3), north: 'c_skin', east: 'c_skin', west: 'c_skin', top: 'c_skin', bottom: 'c_skin' }, { color: A.skin, fit: true });
      // ears
      mb.box(hw / 2 + 0.008, hh * 0.38, 0, 0.016, 0.05 * s, 0.04 * s, 'c_skin', { color: A.skin, fit: true });
      mb.box(-hw / 2 - 0.008, hh * 0.38, 0, 0.016, 0.05 * s, 0.04 * s, 'c_skin', { color: A.skin, fit: true });
      const hc = A.hair;
      const st = A.hairStyle;
      if (st !== 'bald') {
        const thick = st === 'buzz' ? 0.008 : 0.02;
        const backLen = st === 'long' ? hh + 0.12 * s : st === 'bob' ? hh * 0.95 : st === 'ponytail' ? hh * 0.8 : hh * 0.62;
        // top cap
        mb.box(0, hh - 0.005, -0.005, hw + thick * 2, (st === 'curly' ? 0.06 : 0.035) * s + thick, hd + thick * 2, 'c_hair', { color: hc, fit: true });
        // back
        mb.box(0, hh - backLen, -hd / 2 - thick / 2, hw + thick * 2, backLen, thick + 0.01, 'c_hair', { color: hc, fit: true });
        // sides
        const sideLen = st === 'long' || st === 'bob' ? backLen : hh * 0.45;
        mb.box(hw / 2 + thick / 2 + 0.002, hh - sideLen, -0.02, thick + 0.004, sideLen, hd * 0.8, 'c_hair', { color: hc, fit: true });
        mb.box(-hw / 2 - thick / 2 - 0.002, hh - sideLen, -0.02, thick + 0.004, sideLen, hd * 0.8, 'c_hair', { color: hc, fit: true });
        if (st !== 'buzz') mb.box(0, hh - 0.055 * s, hd / 2 + 0.004, hw + 0.004, 0.055 * s, 0.012, 'c_hair_fringe', { color: hc, fit: true });
        if (st === 'ponytail') mb.box(0, hh * 0.35, -hd / 2 - 0.05, 0.05, 0.16 * s, 0.05, 'c_hair', { color: hc, fit: true });
        if (st === 'curly') for (const [dx, dz] of [[-0.06, -0.05], [0.06, -0.05], [0, -0.09], [-0.08, 0.02], [0.08, 0.02]]) mb.box(dx * s, hh - 0.02, dz * s, 0.07 * s, 0.07 * s, 0.07 * s, 'c_hair', { color: hc, fit: true });
      }
      if (A.beard) mb.box(0, 0.0, hd / 2 - 0.01, hw * 0.9, 0.07 * s, 0.03, 'c_hair', { color: hc, fit: true });
      if (o.eyes) mb.box(0, hh * 0.52, hd / 2 + 0.012, hw * 0.92, 0.045 * s, 0.01, o.eyes.tex, { color: o.eyes.color, fit: true });
      if (o.face) mb.box(0, 0.01, hd / 2 + 0.01, hw * 0.95, hh * 0.45, 0.02, o.face.tex, { color: o.face.color, fit: true });
      if (o.head) {
        const h = o.head.hat || 'cap';
        if (h === 'cap') { mb.box(0, hh - 0.01, 0, hw + 0.03, 0.07 * s, hd + 0.03, o.head.tex, { color: o.head.color, fit: true }); mb.box(0, hh, hd / 2 + 0.05, hw * 0.9, 0.015, 0.1, o.head.tex, { color: o.head.color, fit: true }); }
        else if (h === 'beanie') mb.box(0, hh - 0.04, -0.005, hw + 0.035, 0.11 * s, hd + 0.035, o.head.tex, { color: o.head.color, fit: true });
        else if (h === 'hardhat') { mb.box(0, hh - 0.01, 0, hw + 0.05, 0.09 * s, hd + 0.05, o.head.tex, { color: o.head.color, fit: true }); mb.box(0, hh - 0.01, 0, hw + 0.11, 0.015, hd + 0.11, o.head.tex, { color: o.head.color, fit: true }); }
        else if (h === 'helmet') mb.box(0, hh - 0.04, -0.01, hw + 0.05, 0.12 * s, hd + 0.06, o.head.tex, { color: o.head.color, fit: true });
      }
    });
    // arms
    const armTex = (seg: 'u' | 'f') => {
      if (sleeve === 'long') return top;
      if (sleeve === 'short' && seg === 'u') return top;
      return skin;
    };
    for (const side of ['L', 'R'] as const) {
      const ua = this.j[('uarm' + side) as JointName], fa = this.j[('farm' + side) as JointName], ha = this.j[('hand' + side) as JointName];
      const at = armTex('u');
      this.partMesh('uarm' + side, ua, (mb) => tbox(mb, -0.29 * s, 0.3 * s, 0.085 * s * bw, 0.09 * s, 0.1 * s * bw, 0.105 * s, at, undefined));
      this.partMesh('farm' + side, fa, (mb) => tbox(mb, -0.25 * s, 0.26 * s, 0.07 * s, 0.075 * s, 0.085 * s * bw, 0.09 * s, armTex('f')));
      const hand = o.hands || skin;
      this.partMesh('hand' + side, ha, (mb) => tbox(mb, -0.09 * s, 0.09 * s, 0.07 * s, 0.035 * s, 0.075 * s, 0.05 * s, hand));
    }
    // legs
    for (const side of ['L', 'R'] as const) {
      const th = this.j[('thigh' + side) as JointName], sh = this.j[('shin' + side) as JointName], ft = this.j[('foot' + side) as JointName];
      const thighP = legsKind === 'skirt' ? legs : legs;
      const shinP = legsKind === 'pants' ? legs : skin;
      this.partMesh('thigh' + side, th, (mb) => {
        tbox(mb, -0.43 * s, 0.45 * s, 0.11 * s * bw, 0.12 * s, 0.145 * s * bw, 0.16 * s, legsKind === 'skirt' ? skin : thighP);
        if (legsKind === 'skirt') tbox(mb, -0.25 * s, 0.27 * s, 0.17 * s * bw, 0.2 * s, 0.15 * s * bw, 0.18 * s, legs);
      });
      this.partMesh('shin' + side, sh, (mb) => tbox(mb, -0.42 * s, 0.43 * s, 0.085 * s, 0.09 * s, 0.11 * s * bw, 0.12 * s, shinP));
      this.partMesh('foot' + side, ft, (mb) => {
        mb.box(0, -0.085 * s, 0.04 * s, 0.1 * s, 0.085 * s, 0.25 * s, feet === skin ? 'c_skin' : feet.tex, { color: feet.color, fit: true });
      });
    }
    // backpack
    this.backSlot.clear();
    if (o.back) {
      const sz = o.back.size ?? 1;
      const mb = new ModelBuilder();
      mb.box(0, -0.18 * sz, -0.06 * sz, 0.3 * sz, 0.4 * sz, 0.16 * sz, o.back.tex, { color: o.back.color, fit: true });
      mb.box(0, -0.12 * sz, -0.15 * sz, 0.24 * sz, 0.18 * sz, 0.04, o.back.tex, { color: o.back.color, fit: true });
      // straps
      mb.box(0.09, -0.15, 0.06, 0.035, 0.32, 0.03, 'rubber_black');
      mb.box(-0.09, -0.15, 0.06, 0.035, 0.32, 0.03, 'rubber_black');
      const m = new THREE.Mesh(mb.build(), this.material); m.castShadow = true;
      this.backSlot.add(m);
    }
  }

  /** Place an item mesh in a hand (null clears). grip: rotate model so its long axis points along the arm */
  hold(side: 'R' | 'L', mesh: THREE.Object3D | null) {
    const g = side === 'R' ? this.heldR : this.heldL;
    g.clear();
    if (mesh) g.add(mesh);
  }

  setVisible(v: boolean) { this.root.visible = v; }

  /** Apply a pose (Euler angles per joint, radians) */
  applyPose(p: Pose) {
    for (const k of JOINTS) {
      const r = p[k];
      const g = this.j[k];
      if (r) g.rotation.set(r[0], r[1], r[2]); else g.rotation.set(0, 0, 0);
    }
    this.j.hips.position.y = 0.94 * this.s + (p.rootY ?? 0);
    this.j.hips.position.z = p.rootZ ?? 0;
    this.body.rotation.set(p.bodyPitch ?? 0, 0, p.bodyRoll ?? 0);
    this.body.position.y = p.bodyY ?? 0;
  }

  dispose() {
    for (const m of this.meshes.values()) m.geometry.dispose();
    this.meshes.clear();
  }
}

export type Pose = Partial<Record<JointName, [number, number, number]>> & { rootY?: number; rootZ?: number; bodyPitch?: number; bodyRoll?: number; bodyY?: number };

export function randomAppearance(rnd: () => number): Appearance {
  const styles: Appearance['hairStyle'][] = ['short', 'long', 'buzz', 'ponytail', 'curly', 'bob', 'short'];
  return {
    skin: SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)],
    hair: HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)],
    hairStyle: styles[Math.floor(rnd() * styles.length)],
    face: Math.floor(rnd() * 4),
    build: (['slim', 'average', 'broad'] as const)[Math.floor(rnd() * 3)],
    height: 0.95 + rnd() * 0.1,
    beard: rnd() < 0.2,
  };
}

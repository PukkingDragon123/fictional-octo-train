// The BAILIFF band as an object: a squat steel cuff bolted through the
// survivor's left wrist. Two bolts go clean through the forearm (nut caps on
// the inside of the wrist, crusted blood where they went in), a hazard-striped
// housing sits on the outside with a tiny status lens that blinks with the
// heartbeat and turns red when the band is unhappy, and a projector pupil that
// throws the hologram. Hung on the rig's forearm bone, so the animation agent
// can do anything to the arm and the band stays bolted on. If the left forearm
// is gone the unit "relocates" to the right one.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { worldMaterial } from '../../gfx/materials';
import type { Player } from '../../entities/player';

let texReady = false;
function ensureTextures() {
  if (texReady) return;
  texReady = true;
  const A = atlas();
  // scuffed gunmetal with a hazard band and rivets (wraps round the cuff)
  A.add('bb_cuff', 24, 8, (pc, rng) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) {
      const n = rng.next();
      let c = y === 0 ? 0x9aa2a8 : y === 7 ? 0x30363a : n < 0.15 ? 0x5c646a : n < 0.3 ? 0x7a8288 : 0x6a7278;
      if (y >= 3 && y <= 4) c = ((x + y) >> 1) % 2 ? 0xe2b42a : 0x18160f;
      pc.set(x, y, c);
    }
    for (const x of [2, 10, 18]) { pc.set(x, 1, 0xcfd6da); pc.set(x, 6, 0x22272a); }
    for (let i = 0; i < 5; i++) pc.set(Math.floor(rng.next() * 24), 1 + Math.floor(rng.next() * 6), 0x4a2a1a);
  });
  A.add('bb_house', 8, 8, (pc, rng) => {
    pc.fill(0x3e454a);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (rng.next() < 0.18) pc.set(x, y, 0x2c3236);
    for (let x = 0; x < 8; x++) { pc.set(x, 0, 0x7c858c); pc.set(x, 7, 0x1c2023); }
    pc.set(1, 1, 0xb8c0c6); pc.set(6, 1, 0xb8c0c6); pc.set(1, 6, 0x9aa2a8); pc.set(6, 6, 0x9aa2a8);
  });
  // dried blood, fresh at the centre
  A.add('bb_crust', 8, 8, (pc, rng) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5) / 4.5;
      const n = rng.next();
      pc.set(x, y, d < 0.35 ? (n < 0.5 ? 0x6e0c0c : 0x8a1410) : n < 0.4 ? 0x3a0e0a : n < 0.7 ? 0x4e1410 : 0x5a2a1c);
    }
  });
  A.add('bb_bolt', 4, 4, (pc) => { pc.fill(0xaab2b8); pc.set(0, 0, 0xdde3e7); pc.set(3, 3, 0x50585e); pc.set(1, 2, 0x7a8288); });
}

/** geometry of one band at height s (cached per bucketed height) */
const GEO = new Map<string, THREE.BufferGeometry>();
function bandGeo(s: number, part: 'body' | 'lensC' | 'lensR', side: 1 | -1): THREE.BufferGeometry {
  const key = part + ':' + Math.round(s * 50) + ':' + side;
  let g = GEO.get(key);
  if (g) return g;
  ensureTextures();
  const mb = new ModelBuilder();
  const rx = 0.037 * s, rz = 0.041 * s, h = 0.028 * s, k = side;
  if (part === 'body') {
    // cuff: a flattened octagon around the forearm (bone axis = y), outer and inner wall
    mb.push().scale(rx, 1, rz);
    mb.cylinder(0, -h / 2, 0, 1, h, 8, { sides: 'bb_cuff', top: 'bb_house', bottom: 'bb_house' }, { caps: false, fit: true });
    mb.pop();
    // thin lips at the cuff edges
    for (const y of [-h / 2 - 0.002 * s, h / 2 - 0.001 * s]) { mb.push().scale(rx * 1.06, 1, rz * 1.06); mb.cylinder(0, y, 0, 1, 0.003 * s, 8, 'bb_house', { caps: false }); mb.pop(); }
    // housing on the outside of the wrist
    const hx = k * (rx + 0.008 * s);
    mb.box(hx, -h * 0.62, 0, 0.017 * s, h * 1.24, 0.03 * s, { all: 'bb_house', top: 'bb_cuff' }, { fit: true });
    // projector pupil: a dark ring the lens sits in
    mb.box(hx + k * 0.0088 * s, -0.004 * s, 0.006 * s, 0.002 * s, 0.012 * s, 0.012 * s, 'bb_bolt', { color: 0x30363a });
    // two bolts straight through the wrist, nut caps on the inside, crust where they went in
    for (const z of [-0.011 * s, 0.011 * s]) {
      mb.push().translate(0, 0, z).rotateZ(Math.PI / 2);
      mb.cylinder(0, -(rx + 0.012 * s), 0, 0.0032 * s, (rx + 0.012 * s) * 2, 5, 'bb_bolt', { caps: true });
      mb.pop();
      mb.box(-k * (rx + 0.011 * s), -0.0045 * s, z, 0.005 * s, 0.009 * s, 0.009 * s, 'bb_bolt');
      // crust: a ring of dried blood round the entry and a streak running toward the hand
      mb.box(-k * (rx - 0.0005 * s), -0.009 * s, z, 0.003 * s, 0.018 * s, 0.016 * s, 'bb_crust', { fit: true });
      mb.box(-k * (rx - 0.001 * s), -0.034 * s, z + 0.002 * s, 0.002 * s, 0.026 * s, 0.006 * s, 'bb_crust', { fit: true });
    }
    // a raw puncture on the outer side too, under the housing edge
    mb.box(k * (rx + 0.0004 * s), h * 0.3, -0.016 * s, 0.002 * s, 0.012 * s, 0.01 * s, 'bb_crust', { fit: true });
  } else {
    const hx = k * (rx + 0.0175 * s);
    const c = part === 'lensC' ? 0x7af6ff : 0xff2a1e;
    mb.box(hx, -0.0025 * s, 0.006 * s, 0.0016 * s, 0.009 * s, 0.009 * s, 'white', { color: c, emissive: 1, ao: false });
    // a pinprick status LED next to it
    mb.box(hx, -0.016 * s, -0.009 * s, 0.0014 * s, 0.004 * s, 0.004 * s, 'white', { color: c, emissive: 1, ao: false });
  }
  g = mb.build();
  GEO.set(key, g);
  return g;
}

export interface BandView { group: THREE.Group; body: THREE.Mesh; lensC: THREE.Mesh; lensR: THREE.Mesh; bone: THREE.Object3D | null; side: 1 | -1; s: number }

/** hangs and updates bands on every survivor that wears one */
export class Bands {
  private views = new Map<string, BandView>();
  private tmp = new THREE.Vector3();

  private build(s: number, side: 1 | -1): BandView {
    const mat = worldMaterial({});
    const group = new THREE.Group(); group.name = 'bailiff_band';
    const body = new THREE.Mesh(bandGeo(s, 'body', side), mat);
    const lensC = new THREE.Mesh(bandGeo(s, 'lensC', side), mat);
    const lensR = new THREE.Mesh(bandGeo(s, 'lensR', side), mat);
    for (const m of [body, lensC, lensR]) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; group.add(m); }
    lensR.visible = false;
    return { group, body, lensC, lensR, bone: null, side, s };
  }

  /** attach / detach for one player; `on` = this survivor wears a band */
  sync(p: Player, on: boolean) {
    let v = this.views.get(p.id);
    if (!on) { if (v) { v.group.parent?.remove(v.group); this.views.delete(p.id); } return; }
    const rig: any = p.rig;
    if (!rig?.bones) return;
    // the left forearm, or the right one if the left is gone
    const sev: string[] = (p.body as any)?.severed || [];
    const leftGone = sev.includes('farm_l') || sev.includes('uarm_l');
    const side: 1 | -1 = leftGone ? -1 : 1;
    const bone: THREE.Object3D | undefined = rig.bones[leftGone ? 'farmR' : 'farmL'];
    if (!bone) return;
    const s = rig.s || 1;
    if (v && (v.side !== side || Math.abs(v.s - s) > 0.01)) { v.group.parent?.remove(v.group); this.views.delete(p.id); v = undefined; }
    if (!v) { v = this.build(s, side); this.views.set(p.id, v); }
    if (v.bone !== bone || v.group.parent !== bone) {
      bone.add(v.group);
      v.bone = bone;
      // just above the wrist in forearm space (the wrist sits at -0.215 * s)
      v.group.position.set(0, -0.183 * s, 0);
    }
  }

  /** lens state: 0 off (between beats), 1 cyan, 2 red */
  setLens(id: string, state: 0 | 1 | 2) {
    const v = this.views.get(id); if (!v) return;
    v.lensC.visible = state === 1;
    v.lensR.visible = state === 2;
  }

  has(id: string) { return this.views.has(id); }
  side(id: string): 1 | -1 { return this.views.get(id)?.side ?? 1; }

  /** world position of the projector lens (false when there is no band) */
  lensWorld(id: string, out: THREE.Vector3): boolean {
    const v = this.views.get(id);
    if (!v || !v.bone) return false;
    v.group.updateWorldMatrix(true, false);
    const s = v.s;
    this.tmp.set(v.side * (0.037 * s + 0.019 * s), -0.0025 * s, 0.006 * s);
    out.copy(this.tmp).applyMatrix4(v.group.matrixWorld);
    return true;
  }

  prune(alive: Set<string>) {
    for (const [id, v] of this.views) if (!alive.has(id)) { v.group.parent?.remove(v.group); this.views.delete(id); }
  }
}

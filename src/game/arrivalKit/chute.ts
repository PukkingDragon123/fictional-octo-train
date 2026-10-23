// The Institute's delivery chute: how a hologram hands you a bag. A square
// hatch in the Lobby's ceiling drops open, a telescoping pneumatic tube in
// olive enamel with brass collars hisses down in three sections, the flap on
// its mouth swings, the pack falls out onto the floor, and the tube goes back
// up. World props (faceted ModelBuilder parts, atlas pixel textures, the
// world material, so the Lobby's own light falls on them). The tube's
// material cuts everything above the ceiling, so nothing hangs in the void
// of the isometric view; the hatch is drawn only for the eyes (layer 1).
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { mixHex } from '../../gfx/pixel';
import { hash3 } from './geo';

const K = 0x0b0b09;
addTextureModule(() => {
  const A = atlas();
  A.add('arv_ch_tube', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = mixHex(0x56603f, 0x6c7850, hash3(x, y, 3) * 0.4 + (x / 15) * 0.3);
      if (hash3(x >> 1, y >> 1, 4) > 0.94) c = 0x9a9c88;
      if (y === 2 || y === 13) c = 0x31361f;
      pc.set(x, y, c);
    }
    for (const x of [2, 6, 10, 14]) { pc.set(x, 1, 0xc8c8b0); pc.set(x, 14, 0xc8c8b0); }
    for (let x = 0; x < 16; x++) { pc.set(x, 0, K); pc.set(x, 15, K); }
  });
  A.add('arv_ch_hatch', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, mixHex(0xb8b294, 0xcfc8a8, hash3(x, y, 5) * 0.5));
    for (let i = 0; i < 16; i++) { pc.set(i, 0, K); pc.set(0, i, K); pc.set(i, 15, K); pc.set(15, i, K); pc.set(i, 1, 0xe2dcc0); pc.set(1, i, 0xe2dcc0); }
    // hazard corners and a stencilled arrow
    for (let k = 0; k < 4; k++) { pc.set(3 + k, 3, k % 2 ? 0x16130e : 0xe0a428); pc.set(12 - k, 12, k % 2 ? 0x16130e : 0xe0a428); }
    for (let y = 6; y < 11; y++) pc.set(8, y, 0x2a2820);
    pc.set(7, 9, 0x2a2820); pc.set(9, 9, 0x2a2820); pc.set(6, 8, 0x2a2820); pc.set(10, 8, 0x2a2820);
  });
  A.add('arv_ch_dark', 8, 8, (pc) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pc.set(x, y, mixHex(0x0c0d0a, 0x1c1e18, hash3(x, y, 6))); });
});

/** a world material that cuts everything above a height (the tube above the ceiling) */
function clipMat(): { mat: THREE.Material; ceil: { value: number } } {
  const ceil = { value: 99 };
  const base = worldMaterial({ opacity: 0.99993 }) as THREE.MeshLambertMaterial;
  const m = base.clone();
  const prev = base.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(base, sh, r);
    sh.uniforms.uArvCeil = ceil;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uArvCeil;')
      .replace('void main() {', 'void main() {\n  if (vWPos.y > uArvCeil) discard;');
  };
  const key = base.customProgramCacheKey?.bind(base);
  m.customProgramCacheKey = () => (key ? key() : '') + '|arvCeil';
  return { mat: m, ceil };
}

const LEN = 0.62;
const RAD = [0.15, 0.128, 0.106];

export class Chute {
  readonly root = new THREE.Group();
  private secs: THREE.Mesh[] = [];
  private hatch: THREE.Group;
  private door: THREE.Mesh;
  private flap: THREE.Mesh;
  private flapPivot = new THREE.Group();
  private clip = clipMat();
  /** 0 up in the ceiling .. 1 all the way down */
  ext = 0;
  /** 0 shut .. 1 open */
  hatchOpen = 0; flapOpen = 0;
  constructor(public x: number, public z: number, public floorY: number, public ceilY: number, yaw = 0) {
    this.root.name = 'arrival:chute';
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    this.clip.ceil.value = ceilY + 0.02;
    for (let i = 0; i < 3; i++) {
      const mb = new ModelBuilder();
      const r = RAD[i];
      mb.cylinder(0, -LEN, 0, r, LEN, 8, 'arv_ch_tube', { bevel: 0.01 });
      // brass collars top and bottom, a band of rivets
      mb.cylinder(0, -0.06, 0, r + 0.014, 0.05, 8, 'arv_pk_brass', { bevel: 0.006 });
      mb.cylinder(0, -LEN, 0, r + 0.01, 0.035, 8, 'arv_pk_brass', { bevel: 0.005 });
      if (i === 2) {
        // the mouth: a flared nozzle, dark inside
        mb.cylinder(0, -LEN - 0.1, 0, r + 0.05, 0.1, 8, 'arv_ch_tube', { rTop: r + 0.005, bevel: 0.008 });
        mb.cylinder(0, -LEN - 0.098, 0, r + 0.035, 0.004, 8, 'arv_ch_dark', { bevel: 0 });
      }
      if (i === 0) {
        // a pressure gauge on the top section
        mb.box(r + 0.03, -0.32, 0, 0.05, 0.07, 0.05, 'arv_pk_brass', { bevel: 0.006 });
        mb.box(r + 0.058, -0.31, 0, 0.004, 0.04, 0.04, 'arv_ch_hatch', { emissive: 0.3, bevel: 0 });
      }
      const me = new THREE.Mesh(mb.build(), this.clip.mat);
      me.castShadow = true; me.receiveShadow = true;
      me.visible = false;
      this.secs.push(me);
      this.root.add(me);
    }
    // the flap on the mouth, hinged on one side
    const fb = new ModelBuilder();
    fb.box(RAD[2] + 0.05, -0.006, 0, (RAD[2] + 0.05) * 2, 0.012, (RAD[2] + 0.05) * 2, { top: 'arv_ch_tube', bottom: 'arv_ch_dark', sides: 'arv_pk_brass' }, { bevel: 0.004 });
    this.flap = new THREE.Mesh(fb.build(), worldMaterial({}));
    this.flap.castShadow = true;
    this.flapPivot.add(this.flap);
    this.secs[2].add(this.flapPivot);
    this.flapPivot.position.set(-(RAD[2] + 0.05), -LEN - 0.1, 0);
    // the ceiling hatch (only the eyes see ceilings)
    this.hatch = new THREE.Group();
    const hb = new ModelBuilder();
    const H = 0.27;
    hb.box(0, -0.03, -H - 0.03, 2 * H + 0.06, 0.03, 0.03, 'arv_pk_brass', { bevel: 0.005 });
    hb.box(0, -0.03, H + 0.03, 2 * H + 0.06, 0.03, 0.03, 'arv_pk_brass', { bevel: 0.005 });
    hb.box(-H - 0.03, -0.03, 0, 0.03, 0.03, 2 * H, 'arv_pk_brass', { bevel: 0.005 });
    hb.box(H + 0.03, -0.03, 0, 0.03, 0.03, 2 * H, 'arv_pk_brass', { bevel: 0.005 });
    hb.box(0, 0.0, 0, 2 * H, 0.004, 2 * H, 'arv_ch_dark', { bevel: 0 });
    const frame = new THREE.Mesh(hb.build(), worldMaterial({}));
    frame.layers.set(1);
    this.hatch.add(frame);
    const db = new ModelBuilder();
    db.box(H, -0.02, 0, 2 * H, 0.02, 2 * H, { bottom: 'arv_ch_hatch', top: 'arv_ch_dark', sides: 'arv_pk_brass' }, { bevel: 0.004, fit: true });
    this.door = new THREE.Mesh(db.build(), worldMaterial({}));
    this.door.layers.set(1);
    const dp = new THREE.Group(); dp.position.x = -H; dp.add(this.door);
    this.hatch.add(dp);
    this.hatch.position.y = ceilY - 0.005;
    this.root.add(this.hatch);
    this.apply();
  }

  /** world position of the mouth (where the pack comes out) */
  mouth(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.flapPivot.getWorldPosition(out).setX(this.x).setZ(this.z);
  }

  apply() {
    const c = this.ceilY, e = this.ext;
    // staggered: the wide section first, the narrow ones slide out of it
    const k = [Math.min(1, e / 0.45), Math.min(1, Math.max(0, (e - 0.25) / 0.4)), Math.min(1, Math.max(0, (e - 0.5) / 0.5))];
    const ease = (t: number) => t * t * (3 - 2 * t);
    const top0 = c + LEN + 0.06 - ease(k[0]) * LEN;
    const top1 = top0 - ease(k[1]) * (LEN - 0.09);
    const top2 = top1 - ease(k[2]) * (LEN - 0.09);
    const tops = [top0, top1, top2];
    for (let i = 0; i < 3; i++) {
      this.secs[i].position.y = tops[i] - 0; // geometry hangs below its origin
      this.secs[i].visible = tops[i] - LEN - (i === 2 ? 0.1 : 0) < c - 0.01;
    }
    // the flap rides the last section in its own space
    this.flapPivot.rotation.z = -this.flapOpen * 1.9;
    this.door.parent!.rotation.z = -this.hatchOpen * 1.75;
    this.hatch.visible = true;
  }

  dispose() {
    this.root.removeFromParent();
    for (const s of this.secs) s.geometry.dispose();
    this.flap.geometry.dispose(); this.door.geometry.dispose();
    this.clip.mat.dispose();
    this.hatch.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  }
}

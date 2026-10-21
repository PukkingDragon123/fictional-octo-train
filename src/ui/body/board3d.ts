// The first-aid pegboard: a square of perforated hardboard that swings in next
// to the bag when you pick a wound, with what that wound could use hanging on
// its hooks: a bandage roll, an iodine bottle, needle and thread, a splint,
// tweezers, a tourniquet, scissors, a hot blade. What you carry hangs there
// solid; what you lack is only a pale outline of where it should be.
import * as THREE from 'three';
import type { BodyStage } from './stage';
import { PrintTex } from './stage';
import { Mold, M, STEEL, CHROME, PAINT, box, cyl, solidMesh, toolModel, type ToolKey } from './models';
import { hash } from './pix';
import type { TreatOpt } from './treat';

const BW = 23, BH = 36;
const SLOTS: [number, number][] = [[-5.6, -7], [5.6, -7], [-5.6, -18.5], [5.6, -18.5], [-5.6, -30], [5.6, -30]];

interface Slot { g: THREE.Group; hit: THREE.Mesh; opt: TreatOpt | null; lift: number; mesh: THREE.Mesh | null }

export class Board3D {
  readonly root = new THREE.Group();
  private slide = new THREE.Group();
  readonly slots: Slot[] = [];
  private solid = new Map<ToolKey, THREE.BufferGeometry>();
  private mats: { on: THREE.ShaderMaterial; ghost: THREE.ShaderMaterial };
  open = false;
  private x = -40; private xv = 0; private swing = 0; private swingV = 0;
  hover = -1; best = -1;
  private t = 0;

  constructor(private st: BodyStage) {
    const tex = new PrintTex(BW, BH, 2);
    const P = tex.pix;
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      let c = hash(x, y, 1) < 0.25 ? 0x5e4024 : 0x6e4c2c;
      if ((x % 3 === 1) && (y % 3 === 1)) c = 0x140a04;
      P.set(x, y, c);
    }
    tex.commit();
    const frame = new Mold()
      .add(box(BW + 1.6, 1.2, 1.6), M(0, 0.4, 0), 0xb8c0c8, CHROME)
      .add(box(BW + 1.6, 1.2, 1.6), M(0, -BH - 0.4, 0), 0xb8c0c8, CHROME)
      .add(box(1.2, BH + 2, 1.6), M(-BW / 2 - 0.4, -BH / 2, 0), 0xa8b0b8, CHROME)
      .add(box(1.2, BH + 2, 1.6), M(BW / 2 + 0.4, -BH / 2, 0), 0xa8b0b8, CHROME)
      .add(cyl(0.9, 1.4, 8), M(0, 2.2, 0.4, Math.PI / 2, 0, 0), 0x5a5a5a, STEEL);
    this.slide.add(solidMesh(st, frame));
    const board = new THREE.Mesh(new Mold().add(new THREE.PlaneGeometry(BW, BH), M(0, -BH / 2, -0.2), 0xffffff, PAINT).build(), st.solid({ map: tex.tex, wear: 0.6 }));
    this.slide.add(board);
    this.mats = { on: st.solid({ wear: 0.35 }), ghost: st.surf('glass', { alpha: 0.16, color: 0x9aa4a8 }) };
    for (const [sx, sy] of SLOTS) {
      const g = new THREE.Group(); g.position.set(sx, sy, 1.4);
      // the hook it hangs on
      g.add(solidMesh(st, new Mold().add(box(0.6, 0.6, 2.4), M(0, 4.4, -0.6), 0x8a9098, STEEL)));
      const hit = new THREE.Mesh(new THREE.BoxGeometry(10.5, 11, 6), new THREE.MeshBasicMaterial()); hit.visible = false; g.add(hit);
      this.slide.add(g);
      this.slots.push({ g, hit, opt: null, lift: 0, mesh: null });
    }
    this.root.add(this.slide);
    this.slide.position.x = this.x;
    this.root.visible = false;
  }

  show(opts: TreatOpt[], best: TreatOpt | null) {
    this.open = true; this.root.visible = true;
    this.swingV += 4;
    this.best = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], o = opts[i] ?? null;
      s.opt = o;
      if (s.mesh) { s.g.remove(s.mesh); s.mesh = null; }
      if (!o) continue;
      if (o === best) this.best = i;
      let geo = this.solid.get(o.key);
      if (!geo) { geo = toolModel(o.key).build(); this.solid.set(o.key, geo); }
      const m = new THREE.Mesh(geo, o.missing ? this.mats.ghost : this.mats.on);
      m.frustumCulled = false;
      s.g.add(m); s.mesh = m;
    }
  }
  hide() { this.open = false; this.hover = -1; }
  get hits(): THREE.Object3D[] { return this.open ? this.slots.filter((s) => s.opt).map((s) => s.hit) : []; }
  slotOf(o: THREE.Object3D): number { return this.slots.findIndex((s) => s.hit === o); }

  update(dt: number) {
    this.t += dt;
    const target = this.open ? 0 : -40;
    this.xv += ((target - this.x) * 180 - this.xv * 22) * dt;
    this.x += this.xv * dt;
    this.slide.position.x = this.x;
    this.swingV += (-this.swing * 30 - this.swingV * 3) * dt; this.swing += this.swingV * dt;
    this.slide.rotation.z = this.swing * 0.08;
    if (!this.open && this.x < -38) this.root.visible = false;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const want = i === this.hover ? 1 : i === this.best ? 0.35 + Math.sin(this.t * 6) * 0.25 : 0;
      s.lift += (want - s.lift) * Math.min(1, dt * 14);
      if (s.mesh) { s.mesh.position.set(0, s.lift * 0.8, s.lift * 2); s.mesh.rotation.set(0, s.lift * 0.5, Math.sin(this.t * 2 + i) * 0.04 - s.lift * 0.12); s.mesh.scale.setScalar(1 + s.lift * 0.18); }
    }
  }
}

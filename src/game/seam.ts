// The Seam, alive. Every 'seam_door' in the zone you are looking at gets a
// local overlay: a black skin in front of the object that ripples when
// something pushes against it, dust motes drifting in toward it and vanishing,
// a breathing darkness around the rim, and a low drone you feel more than
// hear. A sealed Seam (state.sealed: the Lobby's, after the guard went back
// through) is a dead scar: none of that. Purely visual and local; the intro
// (src/game/intro.ts) and anyone else can ripple() or seal() one.
import * as THREE from 'three';
import { G } from './G';
import type { GameSystem } from './game';
import type { Zone, TileObject } from '../world/zone';
import { objDef } from '../world/objects';
import { objectMatrix } from '../world/chunkMesher';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { WZ } from '../content/furniture/a_lib';
import { seamFaceOf } from '../world/gen/seam_kit';
import '../audio/sounds_remit';

const W = 1.12, H = 2.46, NX = 6, NY = 12, MOTES = 26;
const mtx = new THREE.Matrix4(), col = new THREE.Color(), v3 = new THREE.Vector3();

interface Rip { t: number; amp: number; u: number; v: number; inward: boolean }
interface View {
  o: TileObject;
  face: { x: number; z: number; nx: number; nz: number };
  root: THREE.Group;
  plane: THREE.Mesh; base: Float32Array;
  halo: THREE.Mesh;
  motes: THREE.InstancedMesh;
  m: Float32Array;   // per mote: u, v (on the face), dist, speed, size, life
  rips: Rip[];
  seal: number;      // >= 0 while the seal animation runs
  breath: number;
}

let haloMat: THREE.Material | null = null;

export class SeamFx implements GameSystem {
  name = 'seamfx';
  private views: View[] = [];
  private zone: Zone | null = null;
  private t = 0;
  /** no screen wobble near an open Seam (the arrival keeps the picture crisp) */
  calm = false;

  constructor() { (G as unknown as { seamFx: SeamFx }).seamFx = this; }

  onZoneChange(z: Zone) { this.build(z); }

  /** live seams in the current view */
  get list(): TileObject[] { return this.views.map((v) => v.o); }
  faceOf(o: TileObject) { return seamFaceOf(o); }

  /** something pushed against the face at world point (x, y, z) */
  ripple(o: TileObject | number, at?: { x: number; y: number; z: number }, amp = 1, inward = false) {
    const v = this.view(o); if (!v) return;
    let u = 0.5, vv = 0.45;
    if (at) {
      const f = v.face;
      const tx = -f.nz, tz = f.nx; // along the wall (left to right seen from the front)
      u = 0.5 + ((at.x - f.x) * tx + (at.z - f.z) * tz) / W;
      vv = (at.y - G.getZone(G.view?.zone.key ?? '').heightAt(v.o.x, v.o.y)) / H;
    }
    v.rips.push({ t: 0, amp, u: Math.max(0.05, Math.min(0.95, u)), v: Math.max(0.05, Math.min(0.95, vv)), inward });
    if (v.rips.length > 4) v.rips.shift();
  }
  /** close it for good: the dark folds inward, the drone cuts out (local) */
  seal(o: TileObject | number, fx = true) {
    const v = this.view(o);
    const obj = v?.o ?? (typeof o === 'object' ? o : null);
    if (!obj) return;
    if (v && fx) { v.seal = 0; G.audio?.at?.('seam_seal', v.face.x, v.face.z, 1); }
    else this.setState(obj, true);
  }
  /** open / close a seam's look locally (the intro wakes the Lobby's for a minute) */
  setState(o: TileObject, sealed: boolean) {
    const z = this.zone;
    if (!z || !!o.state.sealed === sealed) return;
    o.state.sealed = sealed;
    for (const [x, y] of z.footprint(o, objDef(o.key) || {})) { z.recomputeTile(x, y); z.markDirty(x, y); }
  }

  private view(o: TileObject | number): View | undefined {
    const uid = typeof o === 'number' ? o : o.uid;
    return this.views.find((v) => v.o.uid === uid);
  }

  // ---------------------------------------------------------------- build
  private clear() {
    for (const v of this.views) { G.pr.scene.remove(v.root); G.audio?.positionalLoop?.('seam:' + v.o.uid, null); }
    this.views.length = 0;
  }
  private build(z: Zone) {
    this.clear();
    this.zone = z;
    for (const o of z.objects.values()) if (o.key === 'seam_door') this.views.push(this.make(z, o));
  }
  private make(z: Zone, o: TileObject): View {
    const d = objDef(o.key)!;
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.matrix.copy(objectMatrix(z, o, d));
    root.matrixWorldNeedsUpdate = true;
    // the skin: a grid of black quads just proud of the object
    const mb = new ModelBuilder();
    const zf = WZ + 0.02;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x0 = -W / 2 + (i / NX) * W, x1 = -W / 2 + ((i + 1) / NX) * W, y0 = (j / NY) * H, y1 = ((j + 1) / NY) * H;
      mb.quadRaw([[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'white', 0x000000, 1, 1, 0, [0, 0, 1]);
    }
    const geo = mb.build();
    const plane = new THREE.Mesh(geo, worldMaterial({}));
    plane.visible = false;
    plane.castShadow = false;
    root.add(plane);
    // breathing darkness around the rim (transparent, its own material so its opacity can move)
    if (!haloMat) haloMat = worldMaterial({ transparent: true, depthWrite: false, outline: 0, opacity: 0.9993 });
    const hb = new ModelBuilder();
    hb.quadRaw([[-1.15, -0.05, WZ + 0.03], [1.15, -0.05, WZ + 0.03], [1.15, 2.95, WZ + 0.03], [-1.15, 2.95, WZ + 0.03]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'zp_seam_halo', 0xffffff, 1, 0, 0, [0, 0, 1]);
    const halo = new THREE.Mesh(hb.build(), haloMat);
    halo.renderOrder = 5;
    root.add(halo);
    // dust motes
    const mm = new ModelBuilder();
    mm.box(0, -0.008, 0, 0.016, 0.016, 0.016, 'white', { emissive: 0.5, ao: false });
    const motes = new THREE.InstancedMesh(mm.build(), worldMaterial({}), MOTES);
    motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    motes.setColorAt(0, col.set(0xffffff));
    motes.count = 0; motes.frustumCulled = false;
    root.add(motes);
    const m = new Float32Array(MOTES * 6);
    for (let i = 0; i < MOTES; i++) this.spawnMote(m, i, true);
    G.pr.scene.add(root);
    const base = new Float32Array((geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array);
    return { o, face: seamFaceOf(o), root, plane, base, halo, motes, m, rips: [], seal: -1, breath: Math.random() * 6 };
  }
  private spawnMote(m: Float32Array, i: number, scatter = false) {
    const k = i * 6;
    m[k] = Math.random() * 1.6 - 0.3;               // u (may start beside the opening)
    m[k + 1] = Math.random() * 1.1;                 // v
    m[k + 2] = 0.4 + Math.random() * 2.4;           // distance out from the face
    m[k + 3] = 0.12 + Math.random() * 0.25;         // speed
    m[k + 4] = 0.5 + Math.random() * 0.9;           // size
    m[k + 5] = scatter ? Math.random() : 0;         // age 0..1 (fade in)
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const z = G.view?.zone ?? null;
    if (!z) return;
    if (z !== this.zone) this.build(z);
    this.t += dt;
    const p = G.local;
    for (const v of this.views) {
      const alive = !v.o.state.sealed || v.seal >= 0;
      // the drone, only while it is open
      const f = v.face;
      if (alive && p) {
        const d = Math.hypot(p.x - f.x, p.z - f.z);
        G.audio?.positionalLoop?.('seam:' + v.o.uid, 'seam_drone', f.x + f.nx * 0.3, f.z + f.nz * 0.3, 0.9, 0.98 + Math.sin(this.t * 0.3) * 0.02, 18);
        // (not while a cutscene owns the picture: the arrival must stay crisp)
        if (d < 2.2 && !this.calm) G.pr.fx.wobble = Math.max(G.pr.fx.wobble, (1 - d / 2.2) * 0.35);
      } else G.audio?.positionalLoop?.('seam:' + v.o.uid, null);
      // rim breathing
      v.breath += dt;
      const hm = v.halo.material as THREE.Material;
      hm.opacity = alive ? 0.55 + Math.sin(v.breath * 0.9) * 0.18 + Math.sin(v.breath * 2.3) * 0.06 : 0;
      v.halo.visible = alive;
      this.updateMotes(v, dt, alive);
      this.updateSkin(v, dt);
      if (v.seal >= 0) {
        v.seal += dt;
        if (v.seal > 1.7 && !v.o.state.sealed) this.setState(v.o, true);
        if (v.seal > 2.4) v.seal = -1;
      }
    }
  }

  private updateMotes(v: View, dt: number, alive: boolean) {
    if (!alive) { v.motes.count = 0; return; }
    const m = v.m;
    const pull = v.seal >= 0 ? 6 : 1;
    let n = 0;
    for (let i = 0; i < MOTES; i++) {
      const k = i * 6;
      m[k + 5] = Math.min(1, m[k + 5] + dt * 0.8);
      // drawn in: faster as they get close, curling toward the middle of the opening
      const d = m[k + 2];
      const sp = m[k + 3] * pull * (1 + 1.6 / (0.25 + d));
      m[k + 2] = d - sp * dt;
      m[k] += (0.5 - m[k]) * dt * 0.35 * pull;
      m[k + 1] += (0.45 - m[k + 1]) * dt * 0.12 * pull + Math.sin(this.t * 2 + i) * dt * 0.02;
      if (m[k + 2] <= 0.0) { this.spawnMote(m, i); continue; }
      const u = m[k], vv = m[k + 1], dd = m[k + 2];
      const s = m[k + 4] * Math.min(1, dd * 3) * m[k + 5];
      mtx.makeScale(s, s, s);
      mtx.setPosition((u - 0.5) * W, vv * H, WZ + 0.02 + dd);
      v.motes.setMatrixAt(n, mtx);
      const b = 0.35 + 0.65 * Math.min(1, dd);
      v.motes.setColorAt(n, col.setRGB(b * 0.8, b * 0.78, b * 0.72));
      n++;
    }
    v.motes.count = n;
    v.motes.instanceMatrix.needsUpdate = true;
    if (v.motes.instanceColor) v.motes.instanceColor.needsUpdate = true;
  }

  /** rings travelling out across the black from where it was touched; the edges wobble */
  private updateSkin(v: View, dt: number) {
    for (const r of v.rips) r.t += dt;
    v.rips = v.rips.filter((r) => r.t < 2.2);
    const sealing = v.seal >= 0 ? v.seal : -1;
    const active = v.rips.length > 0 || sealing >= 0;
    v.plane.visible = active;
    if (!active) return;
    const pos = v.plane.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cat = v.plane.geometry.getAttribute('color') as THREE.BufferAttribute;
    const a = pos.array as Float32Array, b = v.base, c = cat.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i], y = b[i + 1];
      const u = x / W + 0.5, vv = y / H;
      let dz = 0, dx = 0, dy = 0, lit = 0;
      for (const r of v.rips) {
        const du = (u - r.u) * W, dv = (vv - r.v) * H;
        const dist = Math.hypot(du, dv);
        const front = r.t * 2.4;
        const env = Math.exp(-r.t * 1.8) * r.amp;
        const w = Math.sin((dist - front) * 7) * Math.exp(-Math.abs(dist - front) * 2.2) * env;
        dz += w * 0.07 * (r.inward ? -1 : 1);
        // the leading crest catches what little light there is: a thin, dim ring
        lit += Math.exp(-((dist - front) ** 2) * 60) * env * 0.35;
        // the outline itself shivers
        const edge = Math.min(u, 1 - u, vv, 1 - vv);
        if (edge < 0.02) { dx += w * 0.05 * Math.sign(x || 1); dy += w * 0.03; }
      }
      if (sealing >= 0) {
        // folding inward from the edges toward the middle, then gone
        const k = Math.min(1, sealing / 1.7);
        const kk = k * k;
        dx += (0 - x) * kk * 0.5;
        dy += (H * 0.45 - y) * kk * 0.5;
        dz -= kk * 0.06;
      }
      a[i] = x + dx; a[i + 1] = y + dy; a[i + 2] = b[i + 2] + dz;
      // (linear values: even 0.06 reads as a grey ring against that black)
      lit = Math.min(0.07, lit * 0.2);
      c[i] = lit * 0.75; c[i + 1] = lit * 0.75; c[i + 2] = lit;
    }
    pos.needsUpdate = true;
    cat.needsUpdate = true;
    v.plane.geometry.computeBoundingSphere();
    void v3;
  }
}

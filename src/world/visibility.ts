import * as THREE from 'three';
import { Zone } from './zone';
import { castRay } from './lighting';
import { U } from '../gfx/materials';

export const VWIN = 128;

/**
 * Project Zomboid style line-of-sight. A fan of rays from the character's eyes
 * marks tiles currently visible (full range inside the facing cone, only a
 * couple of metres behind). Tiles once seen are remembered and drawn in muted
 * tones; tiles never seen stay black. Results feed a texture sampled by every
 * world shader and gate which creatures/items are rendered at all.
 */
export class Visibility {
  zone: Zone;
  /** smoothed visibility 0..1 for each tile */
  vis: Float32Array;
  /** raw visible this update */
  now: Uint8Array;
  tex: THREE.DataTexture;
  data: Uint8Array;
  winX = 0; winY = 0;
  range = 34;
  coneHalf = THREE.MathUtils.degToRad(82);
  nearRange = 2.4;
  /** extra viewers (co-op teammates share sight) */
  extra: { x: number; z: number; facing: number }[] = [];
  enabled = true;
  /** outdoors in daylight you know your surroundings: tiles within this radius count as explored */
  autoExplore = 0;
  private lastExX = -9999; private lastExY = -9999;
  private acc = 0;
  private touched: number[] = [];

  constructor(zone: Zone) {
    this.zone = zone;
    this.vis = new Float32Array(zone.W * zone.H);
    this.now = new Uint8Array(zone.W * zone.H);
    this.data = new Uint8Array(VWIN * VWIN * 4);
    this.tex = new THREE.DataTexture(this.data, VWIN, VWIN, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
  }

  isVisible(x: number, y: number): boolean {
    if (!this.enabled) return true;
    if (!this.zone.inb(x, y)) return false;
    return this.vis[this.zone.idx(x, y)] > 0.35;
  }
  visAmount(x: number, y: number): number {
    if (!this.enabled) return 1;
    if (!this.zone.inb(x, y)) return 0;
    return this.vis[this.zone.idx(x, y)];
  }

  private fan(px: number, pz: number, facing: number, range: number, gameTime: number) {
    const z = this.zone;
    const now = this.now;
    const mark = (x: number, y: number) => {
      const i = y * z.W + x;
      if (!now[i]) { now[i] = 1; this.touched.push(i); z.explored[i] = 1; z.lastSeen[i] = gameTime; }
    };
    const rays = 900;
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2;
      let da = a - facing; da = Math.atan2(Math.sin(da), Math.cos(da));
      const inCone = Math.abs(da) < this.coneHalf;
      // soft cone: rays near the cone edge reach a bit less far
      const edgeK = inCone ? 1 - Math.max(0, (Math.abs(da) - this.coneHalf * 0.75) / (this.coneHalf * 0.25)) * 0.35 : 0;
      const r = inCone ? range * edgeK : this.nearRange;
      if (!inCone && k % 3 !== 0) continue;
      castRay(z, px, pz, Math.cos(a), Math.sin(a), r, 'sight', mark);
    }
  }

  update(dt: number, px: number, pz: number, facing: number, gameTime: number) {
    const z = this.zone;
    this.acc += dt;
    // recompute sight at ~30Hz
    if (this.acc > 1 / 30) {
      this.acc = 0;
      for (const i of this.touched) this.now[i] = 0;
      this.touched.length = 0;
      if (this.enabled) {
        const ex = Math.floor(px), ey = Math.floor(pz), R = this.autoExplore;
        if (R > 0 && (ex !== this.lastExX || ey !== this.lastExY)) {
          this.lastExX = ex; this.lastExY = ey;
          for (let y = Math.max(0, ey - R); y <= Math.min(z.H - 1, ey + R); y++) for (let x = Math.max(0, ex - R); x <= Math.min(z.W - 1, ex + R); x++) {
            if ((x - ex) * (x - ex) + (y - ey) * (y - ey) <= R * R) z.explored[y * z.W + x] = 1;
          }
        }
        this.fan(px, pz, facing, this.range, gameTime);
        for (const e of this.extra) this.fan(e.x, e.z, e.facing, this.range * 0.8, gameTime);
      }
    }
    // window placement
    const half = VWIN / 2;
    const cx = Math.floor(px), cy = Math.floor(pz);
    if (Math.abs(cx - (this.winX + half)) > VWIN / 4 || Math.abs(cy - (this.winY + half)) > VWIN / 4) {
      this.winX = cx - half; this.winY = cy - half;
    }
    // smooth & upload window
    const upK = Math.min(1, dt * 14), downK = Math.min(1, dt * 5);
    const data = this.data;
    for (let y = 0; y < VWIN; y++) {
      const ty = this.winY + y;
      for (let x = 0; x < VWIN; x++) {
        const tx = this.winX + x;
        const o = (y * VWIN + x) * 4;
        if (tx < 0 || ty < 0 || tx >= z.W || ty >= z.H) { data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255; continue; }
        const i = ty * z.W + tx;
        let v = this.vis[i];
        const target = !this.enabled ? 1 : this.now[i] ? 1 : 0;
        v += (target - v) * (target > v ? upK : downK);
        this.vis[i] = v;
        data[o] = v * 255;
        data[o + 1] = z.explored[i] || !this.enabled ? 255 : 0;
        data[o + 2] = 0;
        data[o + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
    U.uVisTex.value = this.tex;
    U.uVisInfo.value.set(this.winX, this.winY, 1 / VWIN, 1 / VWIN);
    U.uVisOn.value = this.enabled ? 1 : 0;
  }
}

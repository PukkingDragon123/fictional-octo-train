// Melted furniture (state.melt 1..3, the Ledge): the cached model of any
// object slumps into a puddle of itself. The top comes down the most, the
// sides run in streaks, the foot spreads and splays, and a pool of the same
// colour spreads round the base with a few drips beside it. Hooked into the
// object geometry cache by src/content/furniture/zl_ledge.ts
// (setMeltGeometryHook, src/world/objects.ts), so melted things are cached
// per level like damaged ones.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { blob } from '../../creatures/kit/anomalies';
import type { ObjDef } from '../objects';

const K = [0, 0.3, 0.6, 0.88];
const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

export function meltGeometry(g0: THREE.BufferGeometry, d: ObjDef, lvl: number): THREE.BufferGeometry {
  if (d.onWall || d.ceiling) return g0;
  const k = K[Math.max(0, Math.min(3, lvl))];
  const g = g0.clone();
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const y0 = Math.max(0, bb.min.y), h = Math.max(0.05, bb.max.y - y0);
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const hx = Math.max(0.1, (bb.max.x - bb.min.x) / 2), hz = Math.max(0.1, (bb.max.z - bb.min.z) / 2);
  const s = hs(d.key);
  const la = s * Math.PI * 2, lx = Math.cos(la), lz = Math.sin(la);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const t = Math.max(0, Math.min(1, (y - y0) / h));
    const a = Math.atan2((z - cz) / hz, (x - cx) / hx);
    // runs: streaks of the surface sliding down the sides
    const run = Math.pow(Math.max(0, Math.sin(a * 5 + s * 31)), 6) * 0.2 + Math.pow(Math.max(0, Math.sin(a * 3 - s * 17)), 8) * 0.12;
    let ny = y0 + (y - y0) * (1 - 0.6 * k * Math.pow(t, 0.8)) - run * k * t * h;
    // the foot spreads; the middle bellies out a little; the top leans one way
    const sp = 1 + k * 0.55 * (1 - t) * (1 - t) + k * 0.1 * Math.sin(t * Math.PI);
    const lean = k * 0.14 * t * t * h;
    const nx = cx + (x - cx) * sp + lx * lean, nz = cz + (z - cz) * sp + lz * lean;
    ny = Math.max(0.004, ny);
    P.setXYZ(i, nx, ny, nz);
  }
  P.needsUpdate = true;
  g.computeVertexNormals();
  // colours: a little warmer and darker where it is wettest (low down)
  const C = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  let ar = 0, ag = 0, ab = 0, n = 0;
  if (C) for (let i = 0; i < C.count; i++) {
    const t = Math.max(0, Math.min(1, (P.getY(i) - y0) / h));
    const w = 1 - 0.18 * k * (1 - t);
    const r = C.getX(i), gg = C.getY(i), b = C.getZ(i);
    C.setXYZ(i, Math.min(1, r * w * (1 + 0.08 * k)), gg * w, b * w * (1 - 0.06 * k));
    ar += r; ag += gg; ab += b; n++;
  }
  if (C) C.needsUpdate = true;
  const avg = n ? new THREE.Color(ar / n, ag / n, ab / n) : new THREE.Color(0.8, 0.7, 0.5);
  // the puddle of itself round the base, and a few drips that ran off
  const mb = new ModelBuilder();
  mb.appendGeometry(g, new THREE.Matrix4());
  const pr = (Math.max(hx, hz) * (0.75 + k * 0.6));
  const col = avg.clone().lerp(new THREE.Color(0.95, 0.75, 0.4), 0.15).getHex();
  try {
    blob(mb, [cx, 0, cz], [pr * (hx / Math.max(hx, hz)) + 0.12, 0.02 + k * 0.035, pr * (hz / Math.max(hx, hz)) + 0.12], 16, 4, 'lg_wax', { color: col, v0: 0, v1: 0.5,
      disp: (dv) => 1 + 0.16 * Math.sin(Math.atan2(dv[2], dv[0]) * 4 + s * 9) + 0.08 * Math.sin(Math.atan2(dv[2], dv[0]) * 7 - s * 5) });
    const nd = 1 + Math.floor(k * 3);
    for (let j = 0; j < nd; j++) {
      const a = la + 1.3 + j * 2.1, r = pr + 0.18 + j * 0.07;
      blob(mb, [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r], [0.09 + 0.04 * k, 0.018 + 0.012 * k, 0.07 + 0.03 * k], 9, 3, 'lg_wax', { color: col, v0: 0, v1: 0.5 });
    }
  } catch { /* the wax texture is not in the atlas yet (node tools) */ }
  return mb.build();
}

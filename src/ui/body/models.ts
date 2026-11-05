// Low-poly pieces for the body HUD props, built with the touch controls' Mold
// (per-vertex colour + surface: metal, rust, blood uptake) so they share their
// banded light and grime. Units: low-res pixels.
import * as THREE from 'three';
import { fcyl, fbox, gem, fring, flat, flathe, jitter, segs } from '../touch/facet';
import { Mold, M, STEEL, CHROME, BRASS, RUBBER, PLASTIC, PAPER, GLASS, CERAMIC, PAINT, CLOTH } from '../touch/stage3d';
import type { BodyStage } from './stage';

export { Mold, M, STEEL, CHROME, BRASS, RUBBER, PLASTIC, PAPER, GLASS, CERAMIC, PAINT, CLOTH };
export const R90 = Math.PI / 2;

// faceted low-poly primitives (src/ui/touch/facet.ts): few sides, chamfered rims, flat facets
export const cyl = (r: number, h: number, seg = 10, open = false) => fcyl(r, h, segs(seg), r, open ? 0 : 0.18, open);
/** a bevelled block with corner facets: nothing here is a raw cube */
export const box = (w: number, h: number, d: number) => fbox(w, h, d, 0.2);
/** a cut gem / faceted knob */
export const ball = (r: number, detail = 1) => gem(r, Math.min(1, detail), 0.06);
export const ring = (r: number, tube: number, seg = 12, arc = Math.PI * 2) => fring(r, tube, Math.min(10, Math.max(5, Math.round(seg * 0.75))), 4, arc);
export { fcyl, fbox, gem, fring, flat, flathe, jitter };

/** a pillow panel (front +1 / back -1): w x h, bulging by depth in the middle */
export function pillow(w: number, h: number, depth: number, side: 1 | -1, sx = 6, sy = 10): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
    p.setZ(i, side * depth * (1 - x ** 4) * (1 - y ** 4));
  }
  if (side < 0) { g.scale(-1, 1, 1); }
  // faceted: every quad of the pillow catches the light on its own
  return flat(g);
}

/** mesh from a mold with a solid (touch-prop) material */
export function solidMesh(st: BodyStage, m: Mold, o: { map?: THREE.Texture; wear?: number } = {}): THREE.Mesh {
  const me = new THREE.Mesh(m.build(), st.solid({ map: o.map, wear: o.wear ?? 0.45 }));
  me.frustumCulled = false;
  return me;
}

export type ToolKey = 'tq' | 'untq' | 'pull' | 'disinfect' | 'stitch' | 'bandage' | 'rebandage' | 'unbandage' | 'splint' | 'caut' | 'close';

/** a small model of the thing a treatment uses, lying flat on the pegboard (about 9 units long) */
export function toolModel(k: ToolKey): Mold {
  const m = new Mold();
  switch (k) {
    case 'bandage': case 'rebandage':
      m.add(cyl(2.8, 3.2, 10), M(0, 0, 0, R90, 0, 0), (x, y, z) => (Math.abs(z) > 1.4 ? 0xf2eee0 : ((Math.round(y * 3) & 1) ? 0xe8e2cc : 0xf8f4e8)), CLOTH);
      m.add(cyl(1, 3.3, 8), M(0, 0, 0, R90, 0, 0), 0x8a7a5a, PAPER);
      m.add(box(2.6, 5, 0.3), M(1.8, -3.6, 1.2, 0, 0, 0.3), 0xf2eee0, CLOTH);
      break;
    case 'disinfect':
      m.add(cyl(2.2, 6, 8), M(0, -0.5, 0), 0x5a2a10, GLASS);
      m.add(cyl(1.1, 1.6, 8), M(0, 3.2, 0), 0x6a4a2a, GLASS);
      m.add(cyl(1.3, 1.6, 8), M(0, 4.6, 0), 0x2a2420, PLASTIC);
      m.add(cyl(2.25, 2.4, 8, true), M(0, -0.8, 0), 0xe8e0c8, PAPER);
      break;
    case 'stitch': case 'close':
      m.add(ring(3, 0.35, 10, Math.PI * 1.2), M(0, 1, 0.6, 0, 0, -0.3), 0xd8dee4, CHROME);
      m.add(cyl(1.6, 2.4, 8), M(-1, -2.4, 0, R90, 0, 0), 0x2a2a2a, CLOTH);
      m.add(cyl(0.7, 2.6, 6), M(-1, -2.4, 0, R90, 0, 0), 0xc8b890, PAPER);
      m.add(box(0.3, 4, 0.3), M(1.3, -0.6, 0.5, 0, 0, 0.5), 0x1a1a1a, CLOTH);
      break;
    case 'splint':
      m.add(box(2.6, 9, 0.8), M(0, 0, 0), (x, y) => ((Math.round(y * 1.5) % 3 === 0) ? 0xb8864a : 0xc8965a), PAINT);
      m.add(box(3, 1, 1.1), M(0, 2.4, 0), 0xf0ead8, CLOTH);
      m.add(box(3, 1, 1.1), M(0, -2.4, 0), 0xf0ead8, CLOTH);
      break;
    case 'pull':
      m.add(box(0.7, 8, 0.5), M(-0.9, 0, 0, 0, 0, 0.14), 0xc8ccd2, STEEL);
      m.add(box(0.7, 8, 0.5), M(0.9, 0, 0, 0, 0, -0.14), 0xc8ccd2, STEEL);
      m.add(box(2, 1.2, 0.7), M(0, 3.6, 0), 0x9aa0a8, STEEL);
      break;
    case 'tq': case 'untq':
      m.add(ring(2.6, 0.7, 10), M(0, -1, 0, 0, 0, 0, 1, 1.4, 1), 0x6a2a1a, RUBBER);
      m.add(box(3, 1.6, 0.8), M(0, 3, 0.3), 0xb8bcc2, CHROME);
      m.add(box(1.6, 0.6, 0.9), M(0, 3, 0.4), 0x2a2a2a, STEEL);
      break;
    case 'unbandage':
      m.add(ring(1.3, 0.4, 8), M(-1.4, -3, 0), 0x2a2a2a, PLASTIC);
      m.add(ring(1.3, 0.4, 8), M(1.4, -3, 0), 0x2a2a2a, PLASTIC);
      m.add(box(0.8, 6, 0.4), M(-0.5, 1.2, 0, 0, 0, -0.15), 0xd8dee4, CHROME);
      m.add(box(0.8, 6, 0.4), M(0.5, 1.2, 0.2, 0, 0, 0.15), 0xc8ccd2, CHROME);
      break;
    case 'caut':
      m.add(box(1.4, 3.6, 1), M(0, -2.6, 0), 0x3a2418, PAINT);
      m.add(box(1.2, 5, 0.3), M(0, 1.6, 0), (x, y) => (y > 0.5 ? 0xff7a20 : 0xc8ccd2), STEEL, 1);
      break;
  }
  return m;
}

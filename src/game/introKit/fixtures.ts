// Light fittings for the intake set, faceted low-poly: the humming twin-tube
// fluorescent fixtures (enamelled trapezoid housing on two drop rods, end
// caps, bare tubes behind a wire guard, a junction box and its conduit), a
// caged tungsten lamp under a green enamel shade, a sodium high-bay bell, the
// red rotating warning beacon, an articulated desk lamp. Each returns the
// housing into `body` and the lit parts (tubes, bulbs, lenses) into their own
// builder so every lamp can flicker on its own. Plus the volume shapes the
// light director hangs under them: an open frustum for a light shaft, a
// faceted cone for a beam.
import { ModelBuilder } from '../../gfx/modelBuilder';
import { cbox, lathe, prism, rod, tube, face, type V3, type V2 } from './poly';

export interface Lamp { glow: ModelBuilder; at: V3 }

/** a twin-tube fluorescent fixture hung `drop` below a ceiling at y, long axis along z (rotY turns it) */
export function tubeFixture(body: ModelBuilder, x: number, y: number, z: number, o: { len?: number; drop?: number; rotY?: number; guard?: boolean } = {}): Lamp {
  const len = o.len ?? 1.24, drop = o.drop ?? 0.16;
  const glow = new ModelBuilder();
  for (const mb of [body, glow]) mb.push().translate(x, y, z).rotateY(o.rotY ?? 0);
  // ceiling canopies and drop rods
  for (const s of [-1, 1]) {
    lathe(body, 0, -0.025, s * len * 0.34, [[0.04, 0], [0.035, 0.02], [0.02, 0.025]], 6, 'metal_dark');
    rod(body, [0, -0.01, s * len * 0.34], [0, -drop, s * len * 0.34], 0.006, 4, 'chrome');
  }
  // the housing: an enamelled trapezoid trough with a lip, end caps
  const hy = -drop;
  body.push().translate(0, hy, 0);
  prism(body, [[-0.16, 0], [0.16, 0], [0.135, -0.075], [-0.135, -0.075]] as V2[], -len / 2, len / 2, { all: 'ix_fixture' }, { b: 0.012 });
  cbox(body, 0, -0.012, 0, 0.1, 0.03, 0.12, 0.008, 'metal_dark');
  for (const s of [-1, 1]) {
    cbox(body, 0, -0.09, s * (len / 2 - 0.02), 0.2, 0.06, 0.035, 0.008, 'metal_dark');
    for (const t of [-1, 1]) cbox(body, t * 0.055, -0.1, s * (len / 2 - 0.045), 0.03, 0.03, 0.02, 0.005, 'plastic_black');
  }
  // the guard: thin wires across under the tubes
  if (o.guard !== false) for (let i = -2; i <= 2; i++) rod(body, [-0.13, -0.122, i * len * 0.2], [0.13, -0.122, i * len * 0.2], 0.0035, 4, 'metal_dark', { caps: false });
  body.pop();
  // the tubes themselves (lit)
  for (const t of [-1, 1]) rod(glow, [t * 0.055, hy - 0.098, -len / 2 + 0.06], [t * 0.055, hy - 0.098, len / 2 - 0.06], 0.017, 6, 'ix_diffuser', { color: 0xffffff });
  for (const mb of [body, glow]) mb.pop();
  return { glow, at: [x, y - drop - 0.1, z] };
}

/** a caged tungsten lamp under a green enamel shade, hung from (x, y, z) on its flex */
export function cagedLamp(body: ModelBuilder, x: number, y: number, z: number, drop = 0.35, shade = 0x4e6a52): Lamp {
  const glow = new ModelBuilder();
  const by = y - drop;
  tube(body, [[x, y, z], [x + 0.01, y - drop * 0.5, z], [x, by + 0.02, z]], 0.007, 4, 'rubber_black');
  lathe(body, x, y - 0.03, z, [[0.035, 0], [0.03, 0.03]], 6, 'metal_dark');
  // shade: outside green enamel, inside white
  lathe(body, x, by - 0.16, z, [[0.19, 0], [0.18, 0.02], [0.07, 0.13], [0.035, 0.16]], 8, 'metal_painted_green', { color: shade, caps: false });
  lathe(body, x, by - 0.16, z, [[0.034, 0.158], [0.068, 0.128], [0.176, 0.02], [0.186, 0.002]], 8, 'ix_enamel', { color: 0xe8e4d4, caps: false });
  lathe(body, x, by - 0.06, z, [[0.035, 0], [0.035, 0.08]], 6, 'metal_brass');
  // the cage: wires down and round
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; rod(body, [x + Math.cos(a) * 0.17, by - 0.15, z + Math.sin(a) * 0.17], [x + Math.cos(a) * 0.05, by - 0.33, z + Math.sin(a) * 0.05], 0.004, 4, 'metal_dark', { caps: false }); }
  tube(body, Array.from({ length: 7 }, (_, i) => { const a = i / 6 * Math.PI * 2; return [x + Math.cos(a) * 0.115, by - 0.25, z + Math.sin(a) * 0.115] as V3; }), 0.004, 4, 'metal_dark', { caps: false });
  // the bulb
  lathe(glow, x, by - 0.29, z, [[0, 0], [0.04, 0.03], [0.055, 0.08], [0.04, 0.13], [0.024, 0.16]], 7, 'ix_sodium', { color: 0xfff0d0 });
  return { glow, at: [x, by - 0.22, z] };
}

/** a sodium high-bay: a big steel bell on a chain, an amber lens */
export function highBay(body: ModelBuilder, x: number, y: number, z: number, drop = 0.9): Lamp {
  const glow = new ModelBuilder();
  const by = y - drop;
  for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + 0.7) / 6; rod(body, [x, y - t0 * (drop - 0.25), z], [x, y - t1 * (drop - 0.25), z], 0.012, 4, 'metal_dark'); }
  cbox(body, x, by + 0.05, z, 0.3, 0.2, 0.22, 0.03, 'ix_steel');
  for (const s of [-1, 1]) cbox(body, x + s * 0.155, by + 0.08, z, 0.02, 0.12, 0.16, 0.004, 'metal_dark');
  lathe(body, x, by - 0.42, z, [[0.4, 0], [0.39, 0.05], [0.25, 0.25], [0.13, 0.4], [0.12, 0.47]], 10, 'ix_steel', { caps: false });
  lathe(body, x, by - 0.42, z, [[0.12, 0.465], [0.125, 0.4], [0.245, 0.25], [0.38, 0.05], [0.39, 0.004]], 10, 'chrome', { color: 0x8a8070, caps: false });
  lathe(glow, x, by - 0.4, z, [[0.37, 0], [0.3, -0.04], [0.0, -0.05]], 10, 'ix_sodium', { color: 0xffe0a0 });
  lathe(glow, x, by - 0.3, z, [[0.06, 0], [0.07, 0.1], [0.04, 0.2]], 6, 'ix_sodium', { color: 0xffffff });
  return { glow, at: [x, by - 0.45, z] };
}

/** the red rotating beacon on a bracket; returns the dome (glow) and where the reflector spins */
export function beacon(body: ModelBuilder, x: number, y: number, z: number): Lamp {
  const glow = new ModelBuilder();
  lathe(body, x, y, z, [[0.11, 0], [0.11, 0.05], [0.09, 0.07], [0.085, 0.08]], 8, 'metal_dark');
  lathe(glow, x, y + 0.08, z, [[0.08, 0], [0.083, 0.14], [0.062, 0.21], [0.03, 0.245], [0, 0.25]], 8, 'ix_beacon', { color: 0xffffff });
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; rod(body, [x + Math.cos(a) * 0.095, y + 0.07, z + Math.sin(a) * 0.095], [x + Math.cos(a) * 0.075, y + 0.27, z + Math.sin(a) * 0.075], 0.006, 4, 'metal_dark'); }
  lathe(body, x, y + 0.26, z, [[0.035, 0], [0.03, 0.025], [0.0, 0.03]], 6, 'metal_dark');
  return { glow, at: [x, y + 0.17, z] };
}

/** an articulated desk lamp on a desk top at (x, y, z), shade aimed at `aim` (yaw) */
export function deskLamp(body: ModelBuilder, x: number, y: number, z: number, yaw = 0): Lamp {
  const glow = new ModelBuilder();
  for (const mb of [body, glow]) mb.push().translate(x, y, z).rotateY(yaw);
  lathe(body, 0, 0, 0, [[0.09, 0], [0.09, 0.02], [0.06, 0.035], [0.02, 0.04]], 7, 'metal_dark', { color: 0x3a4a3a });
  rod(body, [0, 0.03, 0], [0.04, 0.3, 0.02], 0.009, 5, 'metal_dark', { color: 0x3a4a3a });
  rod(body, [0.04, 0.3, 0.02], [0.22, 0.36, 0.0], 0.009, 5, 'metal_dark', { color: 0x3a4a3a });
  lathe(body, 0.04, 0.29, 0.02, [[0.018, 0], [0.018, 0.02]], 6, 'chrome');
  body.push().translate(0.25, 0.33, 0).rotateZ(-0.9);
  lathe(body, 0, -0.1, 0, [[0.085, 0], [0.08, 0.02], [0.04, 0.09], [0.025, 0.11]], 8, 'metal_painted_green', { color: 0x3e5a44, caps: false });
  lathe(body, 0, -0.1, 0, [[0.024, 0.108], [0.039, 0.088], [0.078, 0.02], [0.083, 0.002]], 8, 'ix_enamel', { color: 0xf0e8d0, caps: false });
  body.pop();
  glow.push().translate(0.25, 0.33, 0).rotateZ(-0.9);
  lathe(glow, 0, -0.085, 0, [[0, 0], [0.028, 0.015], [0.032, 0.05], [0.015, 0.07]], 6, 'ix_sodium', { color: 0xfff2d0 });
  glow.pop();
  for (const mb of [body, glow]) mb.pop();
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { glow, at: [x + c * 0.27, y + 0.24, z - s * 0.27] };
}

/** an open frustum under a lamp: top rect (w0 x d0) at y0 widening to (w1 x d1) at y1 (a light shaft, additive) */
export function shaftGeo(mb: ModelBuilder, x: number, y0: number, z: number, w0: number, d0: number, y1: number, w1: number, d1: number, rotY = 0, tex = 'ix_shaft') {
  mb.push().translate(x, 0, z).rotateY(rotY);
  const T = (sx: number, sz: number): V3 => [sx * w0 / 2, y0, sz * d0 / 2], B = (sx: number, sz: number): V3 => [sx * w1 / 2, y1, sz * d1 / 2];
  const o = { fit: true };
  face(mb, [B(-1, 1), B(1, 1), T(1, 1), T(-1, 1)], tex, o);
  face(mb, [B(1, -1), B(-1, -1), T(-1, -1), T(1, -1)], tex, o);
  face(mb, [B(1, 1), B(1, -1), T(1, -1), T(1, 1)], tex, o);
  face(mb, [B(-1, -1), B(-1, 1), T(-1, 1), T(-1, -1)], tex, o);
  // a central card across the long axis, so the shaft reads from end-on too
  face(mb, [B(0, 1), B(0, -1), T(0, -1), T(0, 1)].map((p, i) => (i < 2 ? [p[0], p[1], p[2] * 0.8] : p) as V3), tex, o);
  mb.pop();
}

/** a faceted beam cone along +z from the origin: length L, end radius r (the beacon's sweep, a lamp's throw) */
export function beamGeo(mb: ModelBuilder, L: number, r0: number, r: number, segs = 6) {
  // built up +y with the source at the top (the shaft texture is bright at its top), then laid along +z
  mb.push().rotateX(-Math.PI / 2).translate(0, -L, 0);
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
    const p = (a: number, rr: number, y: number): V3 => [Math.cos(a) * rr, y, Math.sin(a) * rr];
    face(mb, [p(a0, r, 0), p(a1, r, 0), p(a1, r0, L), p(a0, r0, L)], 'ix_shaft', { fit: true });
  }
  mb.pop();
}

/** a unit quad facing +z (halo cards, flare ghosts; billboarded by the director) */
export function cardGeo(mb: ModelBuilder, tex = 'ix_halo', s = 1) {
  face(mb, [[-s / 2, -s / 2, 0], [s / 2, -s / 2, 0], [s / 2, s / 2, 0], [-s / 2, s / 2, 0]], tex, { fit: true });
}

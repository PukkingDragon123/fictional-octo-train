// Organic modelling helpers for the inhabitants pass (Mulchers, the Stilt
// Gull, the King in Yellow, the Seated...), on top of the skinned kit in
// ./humanoids.ts:
//  - chain(): one continuous lofted tube through a run of bones (a leg, an
//    arm, a tentacle, a neck), parallel-transported so it never twists,
//    radius tapering along its length, knuckled at the joints, skin weights
//    blending across each joint so it bends like flesh rather than pipe.
//  - sac(): a lofted body segment along a path with a radius profile and a
//    bump field (ribs, plates, folds, scallops of feathers).
//  - blade(): a flat, double-sided tapering blade (feather vanes, wing edges,
//    tatters of cloth) skinned along a run of bones.
//  - painters for chitin, wet skin, feathers and cloth on a kit page.
import { SkinB, Region, Wt, V3, BuildCtx, sub, norm, cross, dot, len, addV, scl, hash, clamp01 } from './humanoids';

export interface ChainOpt {
  /** bone names, root first; the tube runs from the first bone's joint through each joint */
  bones: string[];
  /** where the last segment ends (model space); default: continue the last segment's direction by `tipLen` */
  tip?: V3;
  tipLen?: number;
  /** radius at the start and the end (linear along length), or a function of t (0..1) */
  r: [number, number] | ((t: number) => number);
  /** flattening of the cross-section (rv = r * flat) */
  flat?: number;
  /** sides around */
  n?: number;
  /** rings per segment */
  rings?: number;
  /** extra radius at each joint (knuckles), fraction */
  knuckle?: number;
  /** a cross-section bump field (a: angle around, t: 0..1 along) */
  bump?: (a: number, t: number) => number;
  /** start / end caps */
  start?: boolean; end?: boolean;
  /** extra intermediate points between joints (curves the path); per segment, model-space offsets at the middle */
  bend?: (i: number) => V3 | null;
  /** reference 'up' for the first frame */
  up?: V3;
  /** how far before a joint the weights start blending into the next bone (0..0.5 of a segment) */
  blend?: number;
}

/** points of a run of bones (with optional mid-segment bends and a tip) */
function chainPoints(x: BuildCtx, o: ChainOpt): { pts: V3[]; seg: number[]; u: number[] } {
  const J = o.bones.map((b) => x.rest(b));
  let tip = o.tip;
  if (!tip) {
    const a = J.length > 1 ? J[J.length - 2] : addV(J[0], [0, 0.1, 0]);
    const b = J[J.length - 1];
    const d = norm(sub(b, a));
    tip = addV(b, scl(d, o.tipLen ?? len(sub(b, a))));
  }
  const all = [...J, tip];
  const rings = o.rings ?? 3;
  const pts: V3[] = [], seg: number[] = [], u: number[] = [];
  for (let i = 0; i + 1 < all.length; i++) {
    const A = all[i], B = all[i + 1];
    const bend = o.bend?.(i) ?? null;
    for (let k = 0; k < rings; k++) {
      const t = k / rings;
      // quadratic bezier through a bent midpoint
      let p: V3;
      if (bend) {
        const M = addV(scl(addV(A, B), 0.5), bend);
        const q = 1 - t;
        p = [q * q * A[0] + 2 * q * t * M[0] + t * t * B[0], q * q * A[1] + 2 * q * t * M[1] + t * t * B[1], q * q * A[2] + 2 * q * t * M[2] + t * t * B[2]];
      } else p = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      pts.push(p); seg.push(i); u.push(t);
    }
  }
  pts.push(tip); seg.push(all.length - 2); u.push(1);
  return { pts, seg, u };
}

/** parallel-transported frames along a polyline: no twisting */
export function transport(pts: V3[], up0: V3 = [0, 1, 0]): { d: V3; u: V3; v: V3 }[] {
  const out: { d: V3; u: V3; v: V3 }[] = [];
  let prevU: V3 | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm(sub(b, a));
    let u: V3;
    if (!prevU) {
      let c = cross(d, up0);
      if (len(c) < 1e-3) c = cross(d, [1, 0, 0]);
      if (len(c) < 1e-3) c = cross(d, [0, 0, 1]);
      u = norm(c);
    } else {
      // project the previous side axis onto the plane perpendicular to d
      const k = dot(prevU, d);
      u = norm(sub(prevU, scl(d, k)));
      if (len(u) < 1e-4) u = norm(cross(d, [0, 1, 0]));
    }
    const v = norm(cross(u, d));
    out.push({ d, u, v });
    prevU = u;
  }
  return out;
}

/** loft rings around a path with given frames (pts, frames, radii, weights, v) */
function loftPath(B: SkinB, reg: Region, g: number, pts: V3[], fr: { d: V3; u: V3; v: V3 }[], ru: number[], rv: number[], w: Wt[], tv: number[], n: number,
  bump: ((a: number, i: number) => number) | undefined, start: boolean, end: boolean, us?: number[], emis = 0) {
  const rings = pts.map((c, i) => {
    const P: V3[] = [];
    for (let j = 0; j <= n; j++) {
      const a = -Math.PI + (Math.PI * 2 * j) / n;
      // a = 0 is the top (+v), the seam (a = +-pi) runs underneath; +pi/2 is the +u side
      const k = 1 + (bump ? bump(a, i) : 0);
      const cu = Math.sin(a) * ru[i] * k, sv = Math.cos(a) * rv[i] * k;
      const f = fr[i];
      P.push([c[0] + f.u[0] * cu + f.v[0] * sv, c[1] + f.u[1] * cu + f.v[1] * sv, c[2] + f.u[2] * cu + f.v[2] * sv]);
    }
    return { pts: P, v: tv[i], w: w[i] };
  });
  const usx = us || Array.from({ length: n + 1 }, (_, j) => j / n);
  const tip = (i: number, dir: number): V3 => {
    const f = fr[i];
    const r = Math.min(ru[i], rv[i]) * 0.5;
    return [pts[i][0] + f.d[0] * r * dir, pts[i][1] + f.d[1] * r * dir, pts[i][2] + f.d[2] * r * dir];
  };
  return B.loft(rings, usx, reg, g, {
    start: start ? tip(0, -1) : null, end: end ? tip(pts.length - 1, 1) : null,
    startW: w[0], endW: w[w.length - 1], startV: tv[0], endV: tv[tv.length - 1], emis,
  });
}

/** a continuous skinned tube through a run of bones (limbs, necks, tentacles, tails) */
export function chain(B: SkinB, x: BuildCtx, reg: Region, g: number, o: ChainOpt) {
  const { pts, seg, u } = chainPoints(x, o);
  const fr = transport(pts, o.up ?? [0, 1, 0]);
  // cumulative length for the taper and v
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const L = cum[cum.length - 1] || 1;
  const rf = typeof o.r === 'function' ? o.r : ((t: number) => (o.r as [number, number])[0] + ((o.r as [number, number])[1] - (o.r as [number, number])[0]) * t);
  const kn = o.knuckle ?? 0;
  const bl = o.blend ?? 0.3;
  const ids = o.bones.map((b) => x.bi(b));
  const ru: number[] = [], rv: number[] = [], w: Wt[] = [], tv: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const t = cum[i] / L;
    // knuckles: swell near each joint (u ~ 0 of a segment, except the root)
    const s = seg[i], uu = u[i];
    const nearJ = s > 0 ? Math.exp(-(uu * uu) / 0.012) : 0;
    const r = rf(t) * (1 + kn * nearJ);
    ru.push(r); rv.push(r * (o.flat ?? 1));
    // weights: this segment's bone, blending into the next near its far joint
    const a = ids[s], b = ids[Math.min(ids.length - 1, s + 1)];
    if (s + 1 < ids.length && uu > 1 - bl) { const k = (uu - (1 - bl)) / bl * 0.5; w.push([a, 1 - k, b, k]); }
    else if (s > 0 && uu < bl * 0.6) { const k = 0.5 - (uu / (bl * 0.6)) * 0.5; w.push([a, 1 - k, ids[s - 1], k]); }
    else w.push([a, 1]);
    tv.push(1 - t);
  }
  const n = o.n ?? 6;
  return loftPath(B, reg, g, pts, fr, ru, rv, w, tv, n, o.bump ? (a, i) => o.bump!(a, cum[i] / L) : undefined, o.start ?? false, o.end ?? true);
}

/** a body segment along explicit points with radii (u, v) and weights; bump(a, t) */
export function sac(B: SkinB, reg: Region, g: number, pts: V3[], radii: [number, number][], w: Wt[], o: { n?: number; bump?: (a: number, t: number) => number; start?: boolean; end?: boolean; up?: V3; tv?: number[]; emis?: number } = {}) {
  const fr = transport(pts, o.up ?? [0, 1, 0]);
  const tv = o.tv ?? pts.map((_, i) => 1 - i / Math.max(1, pts.length - 1));
  return loftPath(B, reg, g, pts, fr, radii.map((r) => r[0]), radii.map((r) => r[1]), w, tv, o.n ?? 10,
    o.bump ? (a, i) => o.bump!(a, i / Math.max(1, pts.length - 1)) : undefined, o.start ?? true, o.end ?? true, undefined, o.emis ?? 0);
}

/**
 * A flat double-sided blade: a spine (points) with a width per point measured
 * along `side` (a unit vector per point, or one for all), skinned per point.
 * Feathers, wing edges, cloth tatters. `edge` jitters the outline (ragged).
 */
export function blade(B: SkinB, reg: Region, pts: V3[], width: number[], side: V3 | V3[], w: Wt[], o: { edge?: number; seed?: number; offset?: number; thick?: number; col?: number } = {}) {
  const n = pts.length;
  const S = (i: number) => (Array.isArray(side[0]) ? (side as V3[])[i] : (side as V3));
  const off = o.offset ?? 0;
  const seed = o.seed ?? 1;
  for (let i = 0; i + 1 < n; i++) {
    const v0 = 1 - i / (n - 1), v1 = 1 - (i + 1) / (n - 1);
    const e0 = 1 + (o.edge ? (hash(i, seed) - 0.5) * o.edge : 0), e1 = 1 + (o.edge ? (hash(i + 1, seed) - 0.5) * o.edge : 0);
    const a0 = addV(pts[i], scl(S(i), width[i] * off)), a1 = addV(pts[i + 1], scl(S(i + 1), width[i + 1] * off));
    const b0 = addV(pts[i], scl(S(i), width[i] * (1 + off) * e0)), b1 = addV(pts[i + 1], scl(S(i + 1), width[i + 1] * (1 + off) * e1));
    const ws: Wt[] = [w[i], w[i], w[i + 1], w[i + 1]];
    // quad: a = (u0, v0) ... winding by B.quad, both sides
    B.quad(a0, b0, b1, a1, reg, [0, v0, 1, v1], ws, true, o.col ?? 1);
  }
}

/**
 * A curved oval plate with planar UVs (faces, masks, shells): centre c, half
 * width w and half height h in the plane spanned by `right` and `up`, bulging
 * toward `out` by `bulge` at the centre. Single-sided, facing `out`.
 */
export function plate(B: SkinB, reg: Region, g: number, c: V3, right: V3, up: V3, w: number, h: number, bulge: number, wt: Wt | ((u: number, v: number) => Wt), o: { rows?: number; cols?: number; emis?: number; oval?: number } = {}) {
  const rows = o.rows ?? 6, cols = o.cols ?? 6, oval = o.oval ?? 1;
  const out = norm(cross(right, up));
  const idx: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    const v = -1 + (2 * j) / rows;
    const row: number[] = [];
    for (let i = 0; i <= cols; i++) {
      const u = -1 + (2 * i) / cols;
      const shrink = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(v) * 0.98, 2))) * oval + (1 - oval);
      const px = u * w * shrink, py = v * h;
      const z = bulge * (1 - Math.min(1, (u * shrink) * (u * shrink) * 0.6 + v * v * 0.6));
      const p: V3 = [c[0] + right[0] * px + up[0] * py + out[0] * z, c[1] + right[1] * px + up[1] * py + out[1] * z, c[2] + right[2] * px + up[2] * py + out[2] * z];
      const ww = typeof wt === 'function' ? wt(u, v) : wt;
      row.push(B.vert(p, reg.x + ((u * shrink + 1) / 2) * reg.w, reg.y + ((1 - v) / 2) * reg.h, ww, g, 1, o.emis ?? 0));
    }
    idx.push(row);
  }
  const inside: V3 = [c[0] - out[0], c[1] - out[1], c[2] - out[2]];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = idx[j][i], b = idx[j][i + 1], cc = idx[j + 1][i + 1], d = idx[j + 1][i];
    B.triOut(a, b, cc, inside); B.triOut(a, cc, d, inside);
  }
}

// =====================================================================================
// painting
// =====================================================================================
/** chitin: glossy plates with dark seams across v, a highlight band, pitting */
export function paintChitin(r: Region, R: number[], o: { seed?: number; plates?: number; hi?: number; base?: number; spots?: number } = {}) {
  const seed = o.seed ?? 1, plates = o.plates ?? 6, base = o.base ?? R.length * 0.45;
  r.fill(R, (x, y) => {
    const th = (r.deg(x) * Math.PI) / 180;
    const pv = (y / r.h) * plates;
    const seam = Math.abs(pv - Math.round(pv)) < 0.09 ? -2.2 : 0;
    const plateShade = (pv - Math.floor(pv)) * -0.9;
    const gloss = Math.pow(Math.max(0, Math.cos(th - 0.4)), 6) * (o.hi ?? 2.4);
    const pit = hash(x * 3 + 1, y * 7 + seed) < (o.spots ?? 0.05) ? -1.2 : 0;
    return base + 0.9 * Math.cos(th) + plateShade + seam + gloss + pit + (r.fbm(x, y, 3, 2, seed) - 0.5) * 1.2;
  }, undefined, 0.6);
}

/** wet skin: a subsurface ramp with veins, mottling and a few wet glints */
export function paintSkin(r: Region, R: number[], o: { seed?: number; veins?: number; vein?: number; mottle?: number; base?: number; glint?: number; spots?: number; spot?: number } = {}) {
  const seed = o.seed ?? 3, base = o.base ?? R.length * 0.5;
  r.fill(R, (x, y) => {
    const th = (r.deg(x) * Math.PI) / 180;
    return base + 0.85 * Math.cos(th) - 0.2 + (r.fbm(x, y, 4, 3, seed) - 0.5) * (o.mottle ?? 1.8);
  }, undefined, 0.55);
  // veins: wandering lines in a darker shade
  const nv = o.veins ?? 6;
  for (let i = 0; i < nv; i++) r.crack(hash(i, seed) * r.w, hash(i + 9, seed) * r.h, 10 + Math.floor(hash(i + 3, seed) * 18), 80 + hash(i + 5, seed) * 40, o.vein ?? R[1], seed * 13 + i, 0.55, 0.2);
  if (o.spots) for (let i = 0; i < o.spots; i++) r.blob(hash(i, seed + 21) * r.w, hash(i + 4, seed + 21) * r.h, 1.5 + hash(i, 5) * 2, 1.2 + hash(i, 6) * 1.6, o.spot ?? R[2], 0.9);
  const ng = o.glint ?? 8;
  for (let i = 0; i < ng; i++) { const gx = hash(i, seed + 40) * r.w, gy = hash(i + 2, seed + 40) * r.h; r.blend(gx, gy, R[R.length - 1], 0.8); r.blend(gx + 1, gy, R[R.length - 1], 0.4); }
}

/** feathers: overlapping scallops in rows across v (white/grey), dark shaft lines, optional tips */
export function paintFeathers(r: Region, R: number[], o: { seed?: number; rows?: number; cols?: number; base?: number; tip?: number[]; tipFrom?: number; shaft?: number } = {}) {
  const seed = o.seed ?? 5, rows = o.rows ?? 8, cols = o.cols ?? 10, base = o.base ?? R.length * 0.6;
  r.fill(R, (x, y) => {
    const fx = (x / r.w) * cols + ((Math.floor((y / r.h) * rows) & 1) ? 0.5 : 0);
    const fy = (y / r.h) * rows;
    const lx = fx - Math.floor(fx) - 0.5, ly = fy - Math.floor(fy);
    // a scallop: darker toward its top (under the row above), lit toward its rounded tip
    const scal = ly - (0.5 - Math.sqrt(Math.max(0, 0.25 - lx * lx))) * 0.6;
    const th = (r.deg(x) * Math.PI) / 180;
    return base + scal * 1.6 - 0.6 + 0.6 * Math.cos(th) + (hash(Math.floor(fx), Math.floor(fy) + seed) - 0.5) * 0.8;
  }, undefined, 0.5);
  if (o.shaft !== undefined) for (let c = 0; c < cols; c++) { const xx = Math.round(((c + 0.5) / cols) * r.w); for (let y = 0; y < r.h; y++) if (hash(c, y >> 2) < 0.75) r.blend(xx, y, o.shaft, 0.35); }
  if (o.tip) {
    const from = o.tipFrom ?? 0.75;
    for (let y = Math.floor(r.h * from); y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const t = (y - r.h * from) / (r.h * (1 - from));
      r.put(x, y, o.tip, t * (o.tip.length - 1) + (hash(x, y) - 0.5), 0.6);
    }
  }
}

/** cloth: a woven ramp with folds running along v, wear holes and stains */
export function paintCloth(r: Region, R: number[], o: { seed?: number; folds?: number; stain?: number; holes?: number; hole?: number; base?: number } = {}) {
  const seed = o.seed ?? 7, folds = o.folds ?? 5, base = o.base ?? R.length * 0.55;
  r.fill(R, (x, y) => {
    const f = Math.sin((x / r.w) * Math.PI * 2 * folds + Math.sin(y * 0.15 + seed) * 1.4);
    const weave = ((x + y) & 1) ? 0.15 : -0.1;
    return base + f * 1.1 + weave + (r.fbm(x, y, 3, 2, seed) - 0.5) * 1.2 - (y / r.h) * 0.6;
  }, undefined, 0.5);
  for (let i = 0; i < (o.holes ?? 0); i++) r.blob(hash(i, seed + 31) * r.w, hash(i + 1, seed + 31) * r.h, 1 + hash(i, 2) * 2.5, 1 + hash(i, 3) * 3, o.hole ?? R[0], 1);
  for (let i = 0; i < (o.stain ?? 0); i++) r.glow(hash(i, seed + 51) * r.w, hash(i + 3, seed + 51) * r.h, 3 + hash(i, 4) * 5, 3 + hash(i, 6) * 6, R[1], 0.5);
}

/** a cross-section cap: a rim of the outer colour, then flesh, then a dark core */
export function paintCap(r: Region, rim: number, flesh: number, core: number) {
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2) / (r.w / 2);
    r.set(x, y, d > 0.84 ? rim : d > 0.3 || hash(x, y) < 0.3 ? flesh : core);
  }
}

/** an eye: iris ramp, pupil, catchlight */
export function paintEye(r: Region, iris: number, pupil: number, white: number, o: { slit?: boolean; size?: number } = {}) {
  const cx = r.w / 2, cy = r.h / 2, s = o.size ?? 0.8;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const dx = (x + 0.5 - cx) / (r.w / 2), dy = (y + 0.5 - cy) / (r.h / 2);
    const d = Math.hypot(dx, dy);
    const pup = o.slit ? Math.abs(dx) < 0.18 && d < s : d < s * 0.42;
    r.set(x, y, pup ? pupil : d < s ? iris : white);
  }
  r.set(Math.floor(cx - 1), Math.floor(cy - 1), 0xffffff);
}

export { clamp01 };

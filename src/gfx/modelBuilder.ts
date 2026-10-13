import * as THREE from 'three';
import { atlas, AtlasRect } from './atlas';

export type FaceKey = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
export type TexSpec = string | Partial<Record<FaceKey | 'sides' | 'all', string>>;

export interface PrimOpts {
  /** vertex tint 0xRRGGBB (multiplied with texture) */
  color?: number;
  /** emissive strength (0 = none). Emissive surfaces show texture at full brightness */
  emissive?: number;
  /** stretch the texture across each face exactly once */
  fit?: boolean | Partial<Record<FaceKey, boolean>>;
  /** extra uv offset in metres (to vary repeated textures) */
  uvOffset?: [number, number];
  /** uv scale multiplier */
  uvScale?: number;
  /** foliage sway weight */
  sway?: number;
  /** skip these faces */
  skip?: FaceKey[];
  /** darken bottom-ish faces for fake AO (default true) */
  ao?: boolean;
  /** rotate texture 90deg on top faces */
  rotTop?: boolean;
}

const FACE_SHADE: Record<FaceKey, number> = { top: 1.0, bottom: 0.55, north: 0.86, south: 0.94, east: 0.9, west: 0.82 };

/**
 * Procedural low-poly geometry builder. Everything in the game — walls,
 * furniture, items, creatures — is assembled from these primitives and
 * textured from the shared pixel-art atlas with world-scale UVs, so texel
 * density stays consistent and crisp across every model.
 */
export class ModelBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private atl: number[] = [];
  private fx: number[] = [];
  private idx: number[] = [];
  private stack: THREE.Matrix4[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private tmp = new THREE.Vector3();
  private tmpN = new THREE.Vector3();
  /** global tint multiplied into every vertex colour */
  tint = 0xffffff;
  /** default aFx.y when a primitive gives no sway (walls store their axis here: 1 = along x, 2 = along z) */
  swayDefault = 0;
  private faceShade = true;

  get vertexCount() { return this.pos.length / 3; }
  get isEmpty() { return this.idx.length === 0; }

  setFaceShading(on: boolean) { this.faceShade = on; return this; }

  // ---------- transform stack ----------
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { const m = this.stack.pop(); if (m) this.m.copy(m); return this; }
  identity() { this.m.identity(); return this; }
  translate(x: number, y: number, z: number) { this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this; }
  rotateY(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationY(a)); return this; }
  rotateX(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationX(a)); return this; }
  rotateZ(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationZ(a)); return this; }
  scale(x: number, y: number, z: number) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); return this; }
  matrix(m: THREE.Matrix4) { this.m.multiply(m); return this; }

  // ---------- low level ----------
  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: number, shade: number, r: AtlasRect, emis: number, sway: number) {
    this.tmp.set(x, y, z).applyMatrix4(this.m);
    this.nm.getNormalMatrix(this.m);
    this.tmpN.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
    this.pos.push(this.tmp.x, this.tmp.y, this.tmp.z);
    this.nor.push(this.tmpN.x, this.tmpN.y, this.tmpN.z);
    this.uv.push(u, v);
    const t = this.tint;
    const s = this.faceShade ? shade : 1;
    this.col.push(
      (((c >> 16) & 255) / 255) * (((t >> 16) & 255) / 255) * s,
      (((c >> 8) & 255) / 255) * (((t >> 8) & 255) / 255) * s,
      ((c & 255) / 255) * ((t & 255) / 255) * s,
    );
    this.atl.push(r.u0, r.v0, r.du, r.dv);
    this.fx.push(emis, sway || this.swayDefault);
  }

  /**
   * Add a quad from 4 corners (counter-clockwise seen from the front).
   * uvs: per-corner [u,v] in texture repeats.
   */
  quadRaw(p: number[][], uvs: number[][], tex: string, color = 0xffffff, shade = 1, emis = 0, sway = 0, normal?: number[]) {
    const r = atlas().get(tex);
    let n = normal;
    if (!n) {
      const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
      const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      n = [nx / l, ny / l, nz / l];
    }
    const base = this.vertexCount;
    for (let i = 0; i < 4; i++) this.vert(p[i][0], p[i][1], p[i][2], n[0], n[1], n[2], uvs[i][0], uvs[i][1], color, shade, r, emis, sway);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  triRaw(p: number[][], uvs: number[][], tex: string, color = 0xffffff, shade = 1, emis = 0, sway = 0) {
    const r = atlas().get(tex);
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const base = this.vertexCount;
    for (let i = 0; i < 3; i++) this.vert(p[i][0], p[i][1], p[i][2], nx / l, ny / l, nz / l, uvs[i][0], uvs[i][1], color, shade, r, emis, sway);
    this.idx.push(base, base + 1, base + 2);
  }

  // ---------- primitives ----------
  private texFor(spec: TexSpec, face: FaceKey): string {
    if (typeof spec === 'string') return spec;
    if (spec[face]) return spec[face]!;
    if ((face === 'north' || face === 'south' || face === 'east' || face === 'west') && spec.sides) return spec.sides;
    return spec.all || 'white';
  }

  /**
   * Axis-aligned box: x,z = centre, y = bottom, w (x size), h (y size), d (z size)
   */
  box(x: number, y: number, z: number, w: number, h: number, d: number, tex: TexSpec, o: PrimOpts = {}) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0, sw = o.sway ?? 0;
    const skip = o.skip || [];
    const fitAll = o.fit === true;
    const fitOf = (f: FaceKey) => fitAll || (typeof o.fit === 'object' && !!o.fit[f]);
    const us = o.uvScale ?? 1;
    const [ou, ov] = o.uvOffset || [0, 0];
    const ao = o.ao !== false;
    const face = (f: FaceKey, p: number[][], ext: [number, number], uvOrigin: [number, number]) => {
      if (skip.includes(f)) return;
      const t = this.texFor(tex, f);
      const r = atlas().get(t);
      let uvs: number[][];
      if (fitOf(f)) uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      else {
        const u0 = (uvOrigin[0] + ou) / r.mw * us, v0 = (uvOrigin[1] + ov) / r.mh * us;
        const u1 = u0 + ext[0] / r.mw * us, v1 = v0 + ext[1] / r.mh * us;
        uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      }
      if (f === 'top' && o.rotTop) uvs = [uvs[1], uvs[2], uvs[3], uvs[0]];
      this.quadRaw(p, uvs, t, c, ao ? FACE_SHADE[f] : 1, e, sw);
    };
    // south (+z)
    face('south', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [w, h], [x0, y0]);
    // north (-z)
    face('north', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [w, h], [-x1, y0]);
    // east (+x)
    face('east', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [d, h], [-z1, y0]);
    // west (-x)
    face('west', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [d, h], [z0, y0]);
    // top
    face('top', [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [w, d], [x0, -z1]);
    // bottom
    face('bottom', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [w, d], [x0, z0]);
    return this;
  }

  /** Box given by min/max corners */
  boxMinMax(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: TexSpec, o: PrimOpts = {}) {
    return this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tex, o);
  }

  /** Vertical cylinder / prism with n segments. Centre x,z, bottom y. */
  cylinder(x: number, y: number, z: number, r: number, h: number, segs: number, tex: TexSpec, o: PrimOpts & { rTop?: number; caps?: boolean } = {}) {
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
    const rt = o.rTop ?? r;
    const sideT = this.texFor(tex, 'north');
    const sr = atlas().get(sideT);
    const circ = 2 * Math.PI * Math.max(r, rt);
    const fit = o.fit === true;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const u0 = fit ? i / segs : (i / segs) * circ / sr.mw, u1 = fit ? (i + 1) / segs : ((i + 1) / segs) * circ / sr.mw;
      const v1 = fit ? 1 : h / sr.mh;
      const am = (a0 + a1) / 2;
      const shade = 0.8 + 0.2 * Math.max(0, Math.cos(am - 0.8));
      this.quadRaw(
        [[x + c0 * r, y, z + s0 * r], [x + c1 * r, y, z + s1 * r], [x + c1 * rt, y + h, z + s1 * rt], [x + c0 * rt, y + h, z + s0 * rt]].reverse().map((p) => p),
        [[u0, 0], [u1, 0], [u1, v1], [u0, v1]].reverse(),
        sideT, c, shade, e,
      );
    }
    if (o.caps !== false) {
      const topT = this.texFor(tex, 'top'), botT = this.texFor(tex, 'bottom');
      const tr = atlas().get(topT);
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = [x, y + h, z], p1 = [x + Math.cos(a1) * rt, y + h, z + Math.sin(a1) * rt], p2 = [x + Math.cos(a0) * rt, y + h, z + Math.sin(a0) * rt];
        const uvf = (p: number[]) => fit ? [0.5 + (p[0] - x) / (2 * rt), 0.5 + (p[2] - z) / (2 * rt)] : [p[0] / tr.mw, p[2] / tr.mh];
        if (rt > 0.001) this.triRaw([p0, p1, p2], [uvf(p0), uvf(p1), uvf(p2)], topT, c, 1, e);
        const q0 = [x, y, z], q1 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], q2 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
        if (r > 0.001) this.triRaw([q0, q1, q2], [uvf(q0), uvf(q1), uvf(q2)], botT, c, 0.55, e);
      }
    }
    return this;
  }

  /** Horizontal cylinder along X axis. centre x,y,z */
  cylinderX(x: number, y: number, z: number, r: number, len: number, segs: number, tex: TexSpec, o: PrimOpts & { caps?: boolean } = {}) {
    this.push().translate(x, y, z).rotateZ(-Math.PI / 2).translate(0, -len / 2, 0);
    this.cylinder(0, 0, 0, r, len, segs, tex, o);
    return this.pop();
  }
  cylinderZ(x: number, y: number, z: number, r: number, len: number, segs: number, tex: TexSpec, o: PrimOpts & { caps?: boolean } = {}) {
    this.push().translate(x, y, z).rotateX(Math.PI / 2).translate(0, -len / 2, 0);
    this.cylinder(0, 0, 0, r, len, segs, tex, o);
    return this.pop();
  }

  /** Low-poly sphere (UV sphere with few segments). centre x,y,z */
  sphere(x: number, y: number, z: number, r: number, segs: number, rings: number, tex: string, o: PrimOpts & { sy?: number } = {}) {
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
    const sy = o.sy ?? 1;
    const tr = atlas().get(tex);
    const fit = o.fit === true;
    const P = (i: number, j: number) => {
      const th = (i / segs) * Math.PI * 2, ph = (j / rings) * Math.PI;
      return [x + Math.sin(ph) * Math.cos(th) * r, y + Math.cos(ph) * r * sy, z + Math.sin(ph) * Math.sin(th) * r];
    };
    for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
      const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), d = P(i, j + 1);
      const uv = (ii: number, jj: number) => fit ? [ii / segs, 1 - jj / rings] : [(ii / segs) * 2 * Math.PI * r / tr.mw, (1 - jj / rings) * Math.PI * r / tr.mh];
      const shade = 0.75 + 0.25 * (1 - j / rings);
      // order (b, cc, d, a) is counter-clockwise seen from outside
      if (j === 0) this.triRaw([cc, d, a], [uv(i + 1, j + 1), uv(i, j + 1), uv(i, j)], tex, c, shade, e);
      else if (j === rings - 1) this.triRaw([b, d, a], [uv(i + 1, j), uv(i, j + 1), uv(i, j)], tex, c, shade, e);
      else this.quadRaw([b, cc, d, a], [uv(i + 1, j), uv(i + 1, j + 1), uv(i, j + 1), uv(i, j)], tex, c, shade, e);
    }
    return this;
  }

  /** A flat horizontal quad (floor decal etc.) centred at x,z at height y */
  flat(x: number, y: number, z: number, w: number, d: number, tex: string, o: PrimOpts & { rot?: number } = {}) {
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
    const r = atlas().get(tex);
    const fit = o.fit !== false;
    const hw = w / 2, hd = d / 2;
    const rot = o.rot ?? 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (dx: number, dz: number) => [x + dx * cs - dz * sn, y, z + dx * sn + dz * cs];
    const u1 = fit ? 1 : w / r.mw, v1 = fit ? 1 : d / r.mh;
    this.quadRaw([P(-hw, hd), P(hw, hd), P(hw, -hd), P(-hw, -hd)], [[0, 0], [u1, 0], [u1, v1], [0, v1]], tex, c, 1, e, o.sway ?? 0, [0, 1, 0]);
    return this;
  }

  /** Vertical billboard-ish card (two crossed quads) for plants/grass */
  cross(x: number, y: number, z: number, w: number, h: number, tex: string, o: PrimOpts & { rot?: number } = {}) {
    const c = o.color ?? 0xffffff;
    const rot = o.rot ?? 0;
    for (let k = 0; k < 2; k++) {
      const a = rot + k * Math.PI / 2;
      const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
      this.quadRaw([[x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz]],
        [[0, 0], [1, 0], [1, 1], [0, 1]], tex, c, 1, o.emissive ?? 0, o.sway ?? 1, [0, 1, 0]);
    }
    return this;
  }

  /** Vertical panel (single quad) from (x0,z0) to (x1,z1); its normal is (-dz, 0, dx) */
  panel(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tex: string, o: PrimOpts = {}) {
    const r = atlas().get(tex);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const fit = o.fit === true;
    const [ou, ov] = o.uvOffset || [0, 0];
    const u0 = fit ? 0 : ou / r.mw, u1 = fit ? 1 : (ou + len) / r.mw;
    const v0 = fit ? 0 : (y0 + ov) / r.mh, v1 = fit ? 1 : (y1 + ov) / r.mh;
    this.quadRaw([[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], tex, o.color ?? 0xffffff, 1, o.emissive ?? 0, o.sway ?? 0);
    return this;
  }

  /** Wedge/ramp: box whose top slopes from height h0 at -z to h1 at +z */
  wedge(x: number, y: number, z: number, w: number, d: number, h0: number, h1: number, tex: TexSpec, o: PrimOpts = {}) {
    const c = o.color ?? 0xffffff;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const top = this.texFor(tex, 'top'), side = this.texFor(tex, 'east');
    const rs = atlas().get(side);
    const rt = atlas().get(top);
    const slope = Math.hypot(d, h1 - h0);
    this.quadRaw([[x0, y + h1, z1], [x1, y + h1, z1], [x1, y + h0, z0], [x0, y + h0, z0]], [[0, 0], [w / rt.mw, 0], [w / rt.mw, slope / rt.mh], [0, slope / rt.mh]], top, c, 1);
    this.quadRaw([[x0, y, z1], [x1, y, z1], [x1, y + h1, z1], [x0, y + h1, z1]], [[0, 0], [w / rs.mw, 0], [w / rs.mw, h1 / rs.mh], [0, h1 / rs.mh]], side, c, 0.94);
    this.quadRaw([[x1, y, z0], [x0, y, z0], [x0, y + h0, z0], [x1, y + h0, z0]], [[0, 0], [w / rs.mw, 0], [w / rs.mw, h0 / rs.mh], [0, h0 / rs.mh]], side, c, 0.86);
    this.quadRaw([[x1, y, z1], [x1, y, z0], [x1, y + h0, z0], [x1, y + h1, z1]], [[0, 0], [d / rs.mw, 0], [d / rs.mw, h0 / rs.mh], [0, h1 / rs.mh]], side, c, 0.9);
    this.quadRaw([[x0, y, z0], [x0, y, z1], [x0, y + h1, z1], [x0, y + h0, z0]], [[0, 0], [d / rs.mw, 0], [d / rs.mw, h1 / rs.mh], [0, h0 / rs.mh]], side, c, 0.82);
    return this;
  }

  /** Append another builder's geometry (already in world space) */
  append(other: ModelBuilder) {
    const base = this.vertexCount;
    this.pos.push(...other.pos); this.nor.push(...other.nor); this.uv.push(...other.uv);
    this.col.push(...other.col); this.atl.push(...other.atl); this.fx.push(...other.fx);
    for (const i of other.idx) this.idx.push(i + base);
    return this;
  }

  /**
   * Append a cached geometry with a transform. Used by the chunk mesher to
   * stamp furniture models into merged chunk meshes.
   */
  appendGeometry(g: THREE.BufferGeometry, m: THREE.Matrix4, tint = 0xffffff) {
    const base = this.vertexCount;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), UV = g.getAttribute('uv');
    const C = g.getAttribute('color'), A = g.getAttribute('aAtlas'), F = g.getAttribute('aFx');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
    for (let i = 0; i < P.count; i++) {
      v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m);
      n.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z); this.nor.push(n.x, n.y, n.z);
      this.uv.push(UV.getX(i), UV.getY(i));
      this.col.push(C.getX(i) * tr, C.getY(i) * tg, C.getZ(i) * tb);
      this.atl.push(A.getX(i), A.getY(i), A.getZ(i), A.getW(i));
      this.fx.push(F.getX(i), F.getY(i));
    }
    const I = g.getIndex()!;
    for (let i = 0; i < I.count; i++) this.idx.push(I.getX(i) + base);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aAtlas', new THREE.Float32BufferAttribute(this.atl, 4));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.fx, 2));
    const vc = this.vertexCount;
    g.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  reset() {
    this.pos.length = 0; this.nor.length = 0; this.uv.length = 0; this.col.length = 0;
    this.atl.length = 0; this.fx.length = 0; this.idx.length = 0; this.m.identity(); this.stack.length = 0;
    return this;
  }
}

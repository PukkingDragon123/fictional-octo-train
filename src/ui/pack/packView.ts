// The Meridian Field Pack in first person: an institutional rucksack lying on
// its back on the floor in front of you. Slate canvas walls that bulge a little,
// a tan ripstop lining stitched into the 5x5x5 grid (one stitched seam per cell,
// floor and walls), a padded clamshell flap on a U-shaped zip hinged at the top
// end, two compression straps with side-release buckles, a zipped front pocket
// with the debtor card in a clear window, the stencilled Meridian seal and asset
// number, side pockets, a rubberised base, padded shoulder straps splayed on the
// floor, a dark steel external frame with a riveted asset plate, a webbing grab
// handle, and the seal: a brass padlock through both zip pulls, tied to the pack
// on a steel lanyard, with a phosphor window that reads the BAILIFF band on your
// wrist. A clip-on lamp inside the top wall lights the load when the flap opens.
//
// Same surface as the old CubeView (src/craft/cubeView.ts), so callers that set
// the lid / bolts / scan / inside / plate keep working: setLid = the flap,
// setBolts = the compression buckles, setScan = the seal's window, plus setZip
// and setLock for the zip pulls and the padlock.
//
// Space: x right, y up, z toward the viewer (the pack's bottom end); origin on the
// floor under the middle of the pack. Everything faceted, flat-shaded, pixel maps.
import * as THREE from 'three';
import type { Item } from '../../items/item';
import { type GridSpec, type Rot, dropSpot, extentIn } from '../../items/grid';
import { GridView3, type DropAt } from '../../craft/gridView3';
import { crtScreen, phosphorText, cssFont, type CrtScreen } from '../../gfx/crt';
import { metalMat, metalEnv } from '../../craft/metal';
import { fbox, fcyl, frod, jitter, hull, gem } from '../touch/facet';
import { canvasTile, liningCell, webbingTile, zipTile, rubberTile, padTile, logoDecal, warnDecal, idCard, assetPlate, packCard, hangTag, OCHRE, WEB_BLACK } from './packTex';

/** cell size: across (x), rows (z), layers (y) */
export const PACK_CELL: [number, number, number] = [0.088, 0.098, 0.074];
const BASE = 0.05;      // the harness board and frame under the interior floor
const T = 0.032;        // wall thickness (padded canvas)
const CLIP = 0.05;      // the outer corners are cut
const TH = 0.03;        // the flap's thickness at its edge
const DOME = 0.026;     // how far the flap crowns
const LID_OPEN = 3.92;  // radians the flap swings back (over the top end, down onto the floor)
const UVS = 6.25;       // canvas tiles per metre
const CRT = () => cssFont('--font-crt', 'monospace');

type V = THREE.Vector3;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

/** one material's worth of flat-shaded triangles with box-projected or explicit uvs and vertex tints */
class PG {
  private p: number[] = []; private n: number[] = []; private u: number[] = []; private c: number[] = [];
  constructor(public uvs = UVS, public ao: ((x: number, y: number, z: number) => number) | null = null) {}
  tri(a: V, b: V, c: V, col = 0xffffff, hint?: V, ua?: number[], ub?: number[], uc?: number[]) {
    _a.subVectors(b, a); _b.subVectors(c, a); _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-14) return;
    _n.normalize();
    if (hint && _n.dot(hint) < 0) { this.tri(a, c, b, col, undefined, ua, uc, ub); return; }
    const cc = new THREE.Color(col);
    const pts = [a, b, c], uv = [ua, ub, uc];
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    for (let i = 0; i < 3; i++) {
      const q = pts[i];
      this.p.push(q.x, q.y, q.z); this.n.push(_n.x, _n.y, _n.z);
      const t = uv[i];
      if (t) this.u.push(t[0], t[1]);
      else if (ay >= ax && ay >= az) this.u.push(q.x * this.uvs, q.z * this.uvs);
      else if (ax >= az) this.u.push(q.z * this.uvs, q.y * this.uvs);
      else this.u.push(q.x * this.uvs, q.y * this.uvs);
      const k = this.ao ? this.ao(q.x, q.y, q.z) : 1;
      this.c.push(cc.r * k, cc.g * k, cc.b * k);
    }
  }
  quad(a: V, b: V, c: V, d: V, col = 0xffffff, hint?: V, ua?: number[], ub?: number[], uc?: number[], ud?: number[]) {
    this.tri(a, b, c, col, hint, ua, ub, uc); this.tri(a, c, d, col, hint, ua, uc, ud);
  }
  /** a facet geometry placed by a matrix (uvs re-projected unless keep) */
  geo(g: THREE.BufferGeometry, m: THREE.Matrix4, col = 0xffffff, keep = false) {
    const ng = g.index ? g.toNonIndexed() : g;
    const P = ng.getAttribute('position'), U = ng.getAttribute('uv');
    const pts: V[] = [];
    for (let i = 0; i < P.count; i++) pts.push(v3(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m));
    for (let i = 0; i + 2 < P.count; i += 3) {
      const uv = keep && U ? [[U.getX(i), U.getY(i)], [U.getX(i + 1), U.getY(i + 1)], [U.getX(i + 2), U.getY(i + 2)]] : [undefined, undefined, undefined];
      this.tri(pts[i], pts[i + 1], pts[i + 2], col, undefined, uv[0], uv[1], uv[2]);
    }
    if (ng !== g) ng.dispose();
    g.dispose();
  }
  /** a rectangular-section sweep along a polyline (top and both sides; bottom too unless `open`) */
  bar(pts: V[], w: number, h: number, col = 0xffffff, up = v3(0, 1, 0), open = true, uLen = 0) {
    let s = 0;
    const ring: { l: V; r: V; lt: V; rt: V; s: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const t = (i === 0 ? pts[1].clone().sub(pts[0]) : i === pts.length - 1 ? pts[i].clone().sub(pts[i - 1]) : pts[i + 1].clone().sub(pts[i - 1])).normalize();
      const side = new THREE.Vector3().crossVectors(t, up).normalize().multiplyScalar(w / 2);
      const lift = new THREE.Vector3().crossVectors(side, t).normalize().multiplyScalar(h);
      if (i > 0) s += pts[i].distanceTo(pts[i - 1]);
      const l = pts[i].clone().sub(side), r = pts[i].clone().add(side);
      ring.push({ l, r, lt: l.clone().add(lift), rt: r.clone().add(lift), s });
    }
    const U = (x: number) => (uLen ? x / uLen : x * this.uvs);
    for (let i = 0; i + 1 < ring.length; i++) {
      const A = ring[i], B = ring[i + 1];
      const upv = A.lt.clone().sub(A.l);
      this.quad(A.lt, B.lt, B.rt, A.rt, col, upv, [U(A.s), 0], [U(B.s), 0], [U(B.s), 1], [U(A.s), 1]);
      const sl = A.l.clone().sub(A.r);
      this.quad(A.l, B.l, B.lt, A.lt, col, sl, [U(A.s), 0], [U(B.s), 0], [U(B.s), 0.3], [U(A.s), 0.3]);
      this.quad(A.r, B.r, B.rt, A.rt, col, sl.clone().negate(), [U(A.s), 0], [U(B.s), 0], [U(B.s), 0.3], [U(A.s), 0.3]);
      if (!open) this.quad(A.l, B.l, B.r, A.r, col, upv.clone().negate(), [U(A.s), 0], [U(B.s), 0], [U(B.s), 1], [U(A.s), 1]);
    }
  }
  get empty() { return this.p.length === 0; }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------- materials (shared)
let MAT: Record<string, THREE.Material> | null = null;
function mats() {
  if (MAT) return MAT;
  const env = metalEnv();
  const cloth = (map: THREE.Texture, rough = 0.93, side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: rough, metalness: 0, flatShading: true, side, envMap: env, envMapIntensity: 0.12 });
  const decal = (map: THREE.Texture, rough = 0.85) => new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.5, roughness: rough, metalness: 0, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT = {
    canvas: cloth(canvasTile()),
    canvasD: cloth(canvasTile(), 0.93, THREE.DoubleSide),
    lining: cloth(liningCell(), 0.95, THREE.DoubleSide),
    web: cloth(webbingTile(WEB_BLACK), 0.8, THREE.DoubleSide),
    ochre: cloth(webbingTile(OCHRE), 0.8, THREE.DoubleSide),
    zip: cloth(zipTile(), 0.6, THREE.DoubleSide),
    rubber: cloth(rubberTile(), 0.75),
    pad: cloth(padTile(), 0.9),
    steel: metalMat('steel', 2), brass: metalMat('brass', 3), chrome: metalMat('chrome', 3), iron: metalMat('iron', 2), bake: metalMat('bakelite', 2),
    plastic: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, flatShading: true, envMap: env, envMapIntensity: 0.5 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0xe8f0f0, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0, envMap: env, envMapIntensity: 1.4, depthWrite: false, flatShading: true }),
    ink: new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.BackSide }),
    logo: decal(logoDecal('MI-0447-R')), warn: decal(warnDecal()), card: decal(packCard(), 0.9), plate: decal(assetPlate('MI 0447'), 0.4),
    lens: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
  };
  return MAT;
}

/** an inked outline shell for a part (back faces only, black) */
function inked(m: THREE.Mesh, w = 0.0032): THREE.Mesh {
  const h = new THREE.Mesh(hull(m.geometry, w), mats().ink);
  h.raycast = () => { /* never picked */ };
  m.add(h);
  return m;
}

/** a faceted contact shadow polygon on the floor (an octagon stretched to the footprint) */
export function contactShadow(w: number, d: number, opacity = 0.5): THREE.Mesh {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.31; pts.push(new THREE.Vector2(Math.cos(a) * w / 2, Math.sin(a) * d / 2)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity, depthWrite: false }));
  m.position.y = 0.002;
  m.renderOrder = -2;
  m.raycast = () => { /* not a target */ };
  return m;
}

export class PackView extends GridView3 {
  readonly body = new THREE.Group();
  /** the clamshell flap (pivots on the top end's hinge) */
  readonly lid = new THREE.Group();
  /** the padlock (hangs on the zip pulls, falls open onto the floor) */
  readonly lock = new THREE.Group();
  /** the seal's phosphor window (also `pad`: where the banded wrist goes) */
  readonly reader: CrtScreen;
  readonly pad: THREE.Mesh;
  /** the clip-on lamp inside the top wall */
  readonly light = new THREE.PointLight(0xffd49a, 0, 1.1, 2);
  /** footprint of the closed pack (for the hands, shadows, layout) */
  readonly size = new THREE.Vector3();
  private shell: THREE.Object3D[] = [];
  private lidParts: THREE.Object3D[] = [];
  private pulls: THREE.Group[] = [];
  private zipPath: V[] = [];
  private zipLen: number[] = [];
  private strapEnds: THREE.Group[] = [];
  private shackle = new THREE.Group();
  private lockHang = new THREE.Matrix4();
  private lockFloor = new THREE.Matrix4();
  private lanyard: THREE.Mesh | null = null;
  private lanyardAt = new THREE.Vector3();
  private lens: THREE.Mesh | null = null;
  private peelPlane: THREE.Mesh;
  private peelGrid: THREE.LineSegments | null = null;
  private idMat: THREE.MeshStandardMaterial | null = null;
  private tagMat: THREE.MeshStandardMaterial | null = null;
  private no = '----';
  private scanState = '';
  private lockK = 0;
  private zipK = 0;

  constructor() {
    super();
    this.root.add(this.body);
    this.body.add(this.lid, this.lock, this.light);
    this.lock.add(this.shackle);
    this.reader = crtScreen(0.03, 0.021, { res: [96, 64], tint: 0x8cffb0, curvature: 0.3, glow: 1.1, noise: 0.05, scan: 0.7, mask: 0.25, reflect: 0.8, bulge: 0.0012 });
    this.pad = this.reader.mesh;
    this.reader.power(false, true);
    this.lock.add(this.pad);
    this.peelPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    this.peelPlane.rotation.x = -Math.PI / 2;
    this.peelPlane.visible = false;
    this.space.add(this.peelPlane);
    this.drawReader(0, 'idle');
  }

  cellSize(): [number, number, number] { return PACK_CELL; }

  // ================================================================ the model
  protected buildShell(spec: GridSpec) {
    const M = mats();
    const [cx, cy, cz] = PACK_CELL;
    const I = spec.w * cx, L = spec.h * cy, H = spec.d * cz;
    const W = I + 2 * T, LO = L + 2 * T, RIM = BASE + H;
    const W2 = W / 2, L2 = LO / 2;
    this.size.set(W, RIM + DOME + TH, LO);
    this.space.position.set(-I / 2, BASE, -L / 2);
    for (const m of [...this.shell, ...this.lidParts]) { m.parent?.remove(m); (m as THREE.Mesh).geometry?.dispose?.(); }
    this.shell = []; this.lidParts = []; this.pulls = []; this.strapEnds = [];
    const add = (pg: PG, mat: THREE.Material, parent: THREE.Object3D = this.body, ink = 0) => {
      if (pg.empty) return null;
      const m = new THREE.Mesh(pg.build(), mat);
      if (ink) inked(m, ink);
      parent.add(m);
      (parent === this.body ? this.shell : this.lidParts).push(m);
      return m;
    };
    // a little darker toward the floor (contact occlusion), lighter along the top
    const ao = (_x: number, y: number) => 0.58 + 0.42 * Math.min(1, Math.max(0, (y - 0.004) / 0.2));
    const rnd = (i: number, s = 0) => { const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };

    // ---- the outer footprint: a cut-corner rectangle, each edge split so the walls can bulge
    const outline: { x: number; z: number; nx: number; nz: number; corner: boolean }[] = [];
    const corners: [number, number][] = [[W2 - CLIP, L2], [-W2 + CLIP, L2], [-W2, L2 - CLIP], [-W2, -L2 + CLIP], [-W2 + CLIP, -L2], [W2 - CLIP, -L2], [W2, -L2 + CLIP], [W2, L2 - CLIP]];
    const segN = [4, 1, 5, 1, 4, 1, 5, 1];
    for (let e = 0; e < 8; e++) {
      const [x0, z0] = corners[e], [x1, z1] = corners[(e + 1) % 8];
      const ex = x1 - x0, ez = z1 - z0, len = Math.hypot(ex, ez);
      const nx = ez / len, nz = -ex / len;
      for (let k = 0; k < segN[e]; k++) { const t = k / segN[e]; outline.push({ x: x0 + ex * t, z: z0 + ez * t, nx, nz, corner: k === 0 }); }
    }
    // wall normals at the shared points (a corner averages its two edges)
    const N = outline.length;
    const nrm = outline.map((o, i) => {
      const p = outline[(i + N - 1) % N];
      const ax = o.corner ? o.nx + p.nx : o.nx, az = o.corner ? o.nz + p.nz : o.nz;
      const l = Math.hypot(ax, az) || 1;
      return [ax / l, az / l];
    });
    const per: number[] = [0];
    for (let i = 1; i <= N; i++) per.push(per[i - 1] + Math.hypot(outline[i % N].x - outline[i - 1].x, outline[i % N].z - outline[i - 1].z));
    const levels = [0, 0.16, 0.5, 0.84, 1];
    const Y0 = BASE - 0.014;
    const bulge = (t: number) => 0.014 * Math.sin(Math.PI * t);
    const ring = (t: number) => outline.map((o, i) => {
      const b = bulge(t) * (1 + (rnd(i, t * 7) - 0.5) * 0.5) + (rnd(i * 3, t) - 0.5) * 0.003;
      return v3(o.x + nrm[i][0] * b, Y0 + t * (RIM - Y0), o.z + nrm[i][1] * b);
    });
    const rings = levels.map(ring);
    const walls = new PG(UVS, ao);
    for (let l = 0; l + 1 < rings.length; l++) for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, A = rings[l][i], B = rings[l][j], C = rings[l + 1][j], D = rings[l + 1][i];
      const hint = v3(nrm[i][0] + nrm[j][0], 0, nrm[i][1] + nrm[j][1]);
      const s0 = per[i] * UVS, s1 = per[i + 1] * UVS;
      walls.quad(A, B, C, D, 0xffffff, hint, [s0, A.y * UVS], [s1, B.y * UVS], [s1, C.y * UVS], [s0, D.y * UVS]);
    }
    add(walls, M.canvas, this.body, 0.0035);

    // ---- the harness board under it all (black padded mesh), peeking out as a trim
    const base = new PG(30, ao);
    base.geo(jitter(fbox(W + 0.016, BASE - 0.004, LO + 0.016, 0.014, true), 0.0015, 3), new THREE.Matrix4().makeTranslation(0, (BASE - 0.004) / 2, 0), 0xffffff);
    add(base, M.pad, this.body, 0.003);

    // ---- the rim: binding tape round the top of the walls, down to the lining
    const top = rings[rings.length - 1];
    const inner = (p: V) => v3(Math.max(-I / 2, Math.min(I / 2, p.x)), RIM, Math.max(-L / 2, Math.min(L / 2, p.z)));
    const rim = new PG(UVS);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const A = top[i].clone().setY(RIM + 0.004), B = top[j].clone().setY(RIM + 0.004);
      rim.quad(A, B, inner(top[j]), inner(top[i]), 0xffffff, v3(0, 1, 0), [per[i] * 40, 0], [per[i + 1] * 40, 0], [per[i + 1] * 40, 1], [per[i] * 40, 1]);
      rim.quad(top[i], top[j], B, A, 0xffffff, v3(nrm[i][0], 0, nrm[i][1]), [per[i] * 40, 0], [per[i + 1] * 40, 0], [per[i + 1] * 40, 0.4], [per[i] * 40, 0.4]);
    }
    add(rim, M.web);

    // ---- the lining: floor and walls, one stitched cell per tile
    const lin = new PG(1);
    const x0 = -I / 2, x1 = I / 2, z0 = -L / 2, z1 = L / 2, yb = BASE + 0.0008, yt = RIM;
    lin.quad(v3(x0, yb, z0), v3(x1, yb, z0), v3(x1, yb, z1), v3(x0, yb, z1), 0xe8e0cc, v3(0, 1, 0), [0, 0], [spec.w, 0], [spec.w, spec.h], [0, spec.h]);
    const vt = (yt - BASE) / cz;
    // far / near walls (x runs along cells), side walls (rows)
    lin.quad(v3(x0, BASE, z0), v3(x1, BASE, z0), v3(x1, yt, z0), v3(x0, yt, z0), 0xd8d0bc, v3(0, 0, 1), [0, 0], [spec.w, 0], [spec.w, vt], [0, vt]);
    lin.quad(v3(x0, BASE, z1), v3(x1, BASE, z1), v3(x1, yt, z1), v3(x0, yt, z1), 0xc8c0aa, v3(0, 0, -1), [0, 0], [spec.w, 0], [spec.w, vt], [0, vt]);
    lin.quad(v3(x0, BASE, z0), v3(x0, BASE, z1), v3(x0, yt, z1), v3(x0, yt, z0), 0xd0c8b2, v3(1, 0, 0), [0, 0], [spec.h, 0], [spec.h, vt], [0, vt]);
    lin.quad(v3(x1, BASE, z0), v3(x1, BASE, z1), v3(x1, yt, z1), v3(x1, yt, z0), 0xd0c8b2, v3(-1, 0, 0), [0, 0], [spec.h, 0], [spec.h, vt], [0, vt]);
    add(lin, M.lining);

    // ---- the zip track on three sides of the rim (left, bottom end, right); the top end is the hinge
    const iA = outline.findIndex((o) => o.x === -W2 && o.z === -L2 + CLIP);
    const iB = outline.findIndex((o) => o.x === W2 && o.z === -L2 + CLIP);
    const zp: V[] = [];
    for (let i = iB, n = 0; n <= N; i = (i + 1) % N, n++) { zp.push(top[i].clone().setY(RIM + 0.006).addScaledVector(v3(nrm[i][0], 0, nrm[i][1]), -0.004)); if (i === iA) break; }
    // from the top-left corner down the left side, across the bottom end, up the right side
    this.zipPath = zp.reverse();
    this.zipLen = [0];
    for (let i = 1; i < this.zipPath.length; i++) this.zipLen.push(this.zipLen[i - 1] + this.zipPath[i].distanceTo(this.zipPath[i - 1]));
    const zip = new PG();
    zip.bar(this.zipPath, 0.013, 0.003, 0xffffff, v3(0, 1, 0), true, 0.012);
    add(zip, M.zip);

    // ---- the frame: dark steel tubes along both sides of the harness, a top bar past the top end
    const steel = new PG(8);
    const fr = 0.0095, fy = 0.02, fz0 = L2 - 0.03, fz1 = -L2 - 0.045;
    const tube = (a: [number, number, number], b: [number, number, number], r = fr) => steel.geo(frod(a, b, r, 6), new THREE.Matrix4(), 0x5c6064);
    for (const s of [-1, 1]) {
      const fx = s * (W2 + 0.004);
      tube([fx, fy, fz0], [fx, fy, -L2 + 0.02]);
      tube([fx, fy, -L2 + 0.02], [fx * 0.92, fy + 0.03, fz1 + 0.01]);
      steel.geo(fcyl(fr * 1.35, 0.02, 6, fr * 1.35, 0.25).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(fx, fy, fz0 + 0.008), 0x2a2b2d);
    }
    tube([-(W2 + 0.004) * 0.92, fy + 0.03, fz1 + 0.01], [(W2 + 0.004) * 0.92, fy + 0.03, fz1 + 0.01]);
    add(steel, M.steel, this.body, 0.0025);
    // the riveted asset plate on the top bar
    const plateM = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.025), M.plate);
    plateM.position.set(0, fy + 0.052, fz1 + 0.012); plateM.rotation.x = -0.6;
    this.body.add(plateM); this.shell.push(plateM);
    const plateBack = new PG(20);
    plateBack.geo(fbox(0.079, 0.004, 0.029, 0.001, true), new THREE.Matrix4().compose(v3(0, fy + 0.05, fz1 + 0.0105), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6 + Math.PI / 2, 0, 0)), v3(1, 1, 1)), 0x9aa0a6);
    add(plateBack, M.steel);

    // ---- the rubberised bottom end and corner patches
    const rub = new PG(14, ao);
    const nearW = W - 2 * CLIP;
    rub.geo(jitter(fbox(nearW + 0.01, 0.13, 0.012, 0.004, true), 0.001, 5), new THREE.Matrix4().makeTranslation(0, Y0 + 0.065, L2 + 0.009), 0xffffff);
    for (const s of [-1, 1]) {
      const m = new THREE.Matrix4().compose(v3(s * (W2 - CLIP / 2 + 0.003), Y0 + 0.07, L2 - CLIP / 2 + 0.003), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * Math.PI / 4, 0)), v3(1, 1, 1));
      rub.geo(fbox(CLIP * 1.4, 0.14, 0.01, 0.003, true), m, 0xffffff);
    }
    add(rub, M.rubber, this.body, 0.0025);
    // a drain grommet in the bottom end
    const grom = new PG(20);
    grom.geo(fcyl(0.011, 0.004, 8, 0.011, 0.3).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.12, Y0 + 0.1, L2 + 0.016), 0xd8dce0);
    add(grom, M.chrome);

    // ---- side pockets: bulging canvas with an ochre elastic binding and a strap
    const pk = new PG(UVS, ao), pkBind = new PG(40), pkStrap = new PG(40);
    for (const s of [-1, 1]) {
      const g = jitter(fbox(0.05, 0.2, 0.26, 0.016, true), 0.003, 11 + s);
      pk.geo(g, new THREE.Matrix4().makeTranslation(s * (W2 + 0.022), BASE + 0.11, 0.04), 0xc8ccbe);
      pkBind.bar([v3(s * (W2 + 0.005), BASE + 0.212, -0.09), v3(s * (W2 + 0.048), BASE + 0.212, -0.09)], 0.012, 0.003, 0xffffff, v3(0, 0, 1));
      pkBind.bar([v3(s * (W2 + 0.048), BASE + 0.212, -0.09), v3(s * (W2 + 0.048), BASE + 0.212, 0.17)], 0.012, 0.003, 0xffffff, v3(s, 0, 0));
      pkStrap.bar([v3(s * (W2 + 0.012), RIM - 0.01, 0.04), v3(s * (W2 + 0.05), BASE + 0.2, 0.04), v3(s * (W2 + 0.05), BASE + 0.03, 0.04), v3(s * (W2 + 0.02), Y0 + 0.004, 0.04)], 0.022, 0.003, 0xffffff, v3(0, 0, -1));
    }
    add(pk, M.canvas, this.body, 0.003); add(pkBind, M.ochre); add(pkStrap, M.web);
    // the small print down the right wall
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0375), M.warn);
    warn.position.set(W2 + 0.0165, BASE + 0.275, -0.12); warn.rotation.y = Math.PI / 2;
    this.body.add(warn); this.shell.push(warn);

    // ---- the grab handle over the top end, and a D-ring for the seal's lanyard on the bottom end
    const hand = new PG(40);
    hand.bar([v3(-0.07, RIM - 0.03, -L2 - 0.004), v3(-0.05, RIM + 0.02, -L2 - 0.02), v3(0, RIM + 0.034, -L2 - 0.03), v3(0.05, RIM + 0.02, -L2 - 0.02), v3(0.07, RIM - 0.03, -L2 - 0.004)], 0.032, 0.004, 0xffffff, v3(0, 0, -1));
    add(hand, M.web);
    const dr = new PG(30);
    const dring = v3(0.13, RIM - 0.075, L2 + 0.012);
    dr.geo(fcyl(0.009, 0.004, 6, 0.009, 0.3, true).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(dring.x, dring.y, dring.z), 0xd8dce0);
    add(dr, M.chrome);
    this.lanyardAt.copy(dring);

    // ---- shoulder straps splayed on the floor, black padding, webbing tails and ladder buckles
    const strap = new PG(18, ao), tail = new PG(40), buck = new PG(30);
    for (const s of [-1, 1]) {
      const pts = [v3(s * (W2 - 0.08), 0.03, -0.12), v3(s * (W2 + 0.02), 0.022, -0.06), v3(s * (W2 + 0.09), 0.016, 0.04), v3(s * (W2 + 0.12), 0.013, 0.15)];
      strap.bar(pts, 0.066, 0.016, 0xffffff, v3(0, 1, 0), true);
      const tp = [v3(s * (W2 + 0.12), 0.006, 0.15), v3(s * (W2 + 0.128), 0.004, 0.25), v3(s * (W2 + 0.11), 0.003, 0.32)];
      tail.bar(tp, 0.03, 0.002, 0xffffff, v3(0, 1, 0), true);
      buck.geo(fbox(0.044, 0.006, 0.02, 0.002, true), new THREE.Matrix4().makeTranslation(s * (W2 + 0.124), 0.008, 0.2), 0x9aa0a6);
    }
    add(strap, M.pad, this.body, 0.0025); add(tail, M.web); add(buck, M.steel);
    // the debtor's luggage tag tied to the right strap's buckle
    this.tagMat = new THREE.MeshStandardMaterial({ map: hangTag(this.no), transparent: true, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const tagM = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.042), this.tagMat);
    tagM.rotation.set(-Math.PI / 2, 0, 0.5); tagM.position.set(W2 + 0.17, 0.004, 0.25);
    this.body.add(tagM); this.shell.push(tagM);

    // ---- the clip-on lamp inside the top wall
    const lampG = new PG(20);
    lampG.geo(fbox(0.05, 0.028, 0.03, 0.006, true), new THREE.Matrix4().makeTranslation(0, RIM - 0.03, -L / 2 + 0.017), 0xffffff);
    lampG.geo(fbox(0.03, 0.01, 0.05, 0.002, true), new THREE.Matrix4().makeTranslation(0, RIM + 0.002, -L / 2 + 0.005), 0xb0b0b0);
    add(lampG, M.bake);
    this.lens = new THREE.Mesh(fcyl(0.011, 0.004, 8, 0.011, 0.2).rotateX(Math.PI / 2), M.lens.clone());
    this.lens.position.set(0, RIM - 0.03, -L / 2 + 0.033);
    this.lens.rotation.x = 0.5;
    this.body.add(this.lens); this.shell.push(this.lens);
    this.light.position.set(0, RIM - 0.05, -L / 2 + 0.1);

    // ================================================================ the flap
    this.lid.position.set(0, RIM, -L2);
    this.buildLid(W + 0.006, LO + 0.006, RIM);

    // ================================================================ zip pulls and the seal
    for (let i = 0; i < 2; i++) {
      const pg = new PG(30), tab = new PG(30);
      pg.geo(fbox(0.017, 0.007, 0.012, 0.002, true), new THREE.Matrix4().makeTranslation(0, 0.004, 0), 0xe0e4e8);
      tab.geo(fbox(0.012, 0.004, 0.034, 0.002, true), new THREE.Matrix4().makeTranslation(0, 0.003, 0.02), 0x2a2a2c);
      const g = new THREE.Group();
      const a = new THREE.Mesh(pg.build(), M.chrome), b = new THREE.Mesh(tab.build(), M.plastic);
      g.add(a, b);
      this.body.add(g); this.shell.push(g); this.pulls.push(g);
    }
    this.buildLock(RIM, L2);
    this.setZip(this.zipK); this.setLock(this.lockK);

    // ---- the peel guide
    const pp: number[] = [];
    for (let i = 0; i <= spec.w; i++) { const t = i * cx; pp.push(t, 0, 0, t, 0, L); }
    for (let j = 0; j <= spec.h; j++) { const t = j * cy; pp.push(0, 0, t, I, 0, t); }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    if (this.peelGrid) this.space.remove(this.peelGrid);
    this.peelGrid = new THREE.LineSegments(pgeo, new THREE.LineBasicMaterial({ color: 0xf0e8d0, transparent: true, opacity: 0.55, depthWrite: false }));
    this.peelGrid.visible = false;
    this.space.add(this.peelGrid);
    this.peelPlane.scale.set(I, L, 1);
    this.peelPlane.position.set(I / 2, 0, L / 2);
  }

  /** the padded flap: a crowned cut-corner slab, lining underneath, the seal stencil, front pocket, straps */
  private buildLid(W: number, LO: number, RIM: number) {
    const M = mats();
    const W2 = W / 2;
    // heightfield over the cut-corner footprint (z runs 0 at the hinge .. LO at the bottom end)
    const crown = (x: number, z: number) => {
      const a = Math.min(1, Math.abs(x) / W2), b = Math.min(1, Math.abs(z - LO / 2) / (LO / 2));
      return TH + DOME * (1 - a ** 4) * (1 - b ** 4);
    };
    const clampXZ = (x: number, z: number): [number, number] => {
      const dx = W2 - Math.abs(x), dz = LO / 2 - Math.abs(z - LO / 2);
      if (dx + dz < CLIP) { const k = (CLIP - dx - dz) / 2; return [x - Math.sign(x) * k, z - Math.sign(z - LO / 2) * k]; }
      return [x, z];
    };
    const NX = 8, NZ = 9;
    const P: V[][] = [];
    for (let j = 0; j <= NZ; j++) {
      const row: V[] = [];
      for (let i = 0; i <= NX; i++) {
        const [x, z] = clampXZ(-W2 + (i / NX) * W, (j / NZ) * LO);
        const edge = i === 0 || i === NX || j === 0 || j === NZ;
        const jy = edge ? 0 : (Math.sin(i * 7.3 + j * 3.1) * 0.5) * 0.0025;
        row.push(v3(x, crown(x, z) + jy, z));
      }
      P.push(row);
    }
    const lid = new PG(UVS, null);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) lid.quad(P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i], 0xffffff, v3(0, 1, 0));
    // the side band round the edge, down to the lining
    const edge: V[] = [];
    for (let i = 0; i <= NX; i++) edge.push(P[0][i]);
    for (let j = 1; j <= NZ; j++) edge.push(P[j][NX]);
    for (let i = NX - 1; i >= 0; i--) edge.push(P[NZ][i]);
    for (let j = NZ - 1; j >= 1; j--) edge.push(P[j][0]);
    const ctr = v3(0, 0, LO / 2);
    for (let k = 0; k < edge.length; k++) {
      const a = edge[k], b = edge[(k + 1) % edge.length];
      const out = a.clone().add(b).multiplyScalar(0.5).sub(ctr).setY(0);
      lid.quad(v3(a.x, 0, a.z), v3(b.x, 0, b.z), b, a, 0xe8ece0, out);
    }
    const m = new THREE.Mesh(lid.build(), M.canvas);
    inked(m, 0.0035);
    this.lid.add(m); this.lidParts.push(m);
    // underneath: the lining, a binding round it, the packing card
    const under = new PG(1);
    const [cx, cy] = PACK_CELL;
    for (let k = 0; k < edge.length; k++) {
      const a = edge[k], b = edge[(k + 1) % edge.length];
      under.tri(v3(a.x, -0.0005, a.z), v3(b.x, -0.0005, b.z), v3(0, -0.0005, LO / 2), 0xd8d0bc, v3(0, -1, 0), [a.x / cx, a.z / cy], [b.x / cx, b.z / cy], [0, LO / 2 / cy]);
    }
    const um = new THREE.Mesh(under.build(), M.lining);
    this.lid.add(um); this.lidParts.push(um);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.133), M.card);
    card.rotation.x = Math.PI / 2; card.rotation.z = Math.PI + 0.04;
    card.position.set(0.01, -0.003, LO * 0.42);
    this.lid.add(card); this.lidParts.push(card);

    // the stencilled seal on the far half (a decal laid over the crown)
    const dec = new PG(1);
    const dx0 = -0.12, dx1 = 0.12, dz0 = 0.05, dz1 = 0.05 + 0.15, DN = 6;
    for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
      const xa = dx0 + (dx1 - dx0) * (i / DN), xb = dx0 + (dx1 - dx0) * ((i + 1) / DN);
      const za = dz0 + (dz1 - dz0) * (j / DN), zb = dz0 + (dz1 - dz0) * ((j + 1) / DN);
      const q = (x: number, z: number) => v3(x, crown(x, z) + 0.0015, z);
      const uv = (x: number, z: number) => [(x - dx0) / (dx1 - dx0), (z - dz0) / (dz1 - dz0)];
      dec.quad(q(xa, za), q(xb, za), q(xb, zb), q(xa, zb), 0xffffff, v3(0, 1, 0), uv(xa, za), uv(xb, za), uv(xb, zb), uv(xa, zb));
    }
    const dm = new THREE.Mesh(dec.build(), M.logo);
    this.lid.add(dm); this.lidParts.push(dm);

    // the front pocket on the bottom half: a flat zipped pillow with the debtor card in a clear window
    const pz = LO * 0.7, py = crown(0, pz) - 0.006;
    const pocket = new PG(UVS, null);
    pocket.geo(jitter(fbox(0.3, 0.028, 0.17, 0.009, true), 0.002, 21), new THREE.Matrix4().makeTranslation(0, py + 0.014, pz), 0xc4c8ba);
    const pm = new THREE.Mesh(pocket.build(), M.canvas);
    inked(pm, 0.003);
    this.lid.add(pm); this.lidParts.push(pm);
    const pzip = new PG();
    pzip.bar([v3(-0.13, py + 0.029, pz - 0.068), v3(0.13, py + 0.029, pz - 0.068)], 0.011, 0.002, 0xffffff, v3(0, 1, 0), true, 0.012);
    const pzm = new THREE.Mesh(pzip.build(), M.zip);
    this.lid.add(pzm); this.lidParts.push(pzm);
    const ppull = new PG(30);
    ppull.geo(fbox(0.012, 0.005, 0.028, 0.002, true), new THREE.Matrix4().makeTranslation(0.1, py + 0.032, pz - 0.05), 0x2a2a2c);
    const ppm = new THREE.Mesh(ppull.build(), M.plastic);
    this.lid.add(ppm); this.lidParts.push(ppm);
    // the ID window: a webbing frame, the card, a sheet of clear plastic
    this.idMat = new THREE.MeshStandardMaterial({ map: idCard(this.no), roughness: 0.6, metalness: 0, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const cardM = new THREE.Mesh(new THREE.PlaneGeometry(0.096, 0.06), this.idMat);
    cardM.rotation.x = -Math.PI / 2;
    cardM.position.set(-0.055, py + 0.0295, pz + 0.012);
    this.lid.add(cardM); this.lidParts.push(cardM);
    const win = new PG(40);
    win.bar([v3(-0.108, py + 0.029, pz - 0.022), v3(-0.002, py + 0.029, pz - 0.022), v3(-0.002, py + 0.029, pz + 0.046), v3(-0.108, py + 0.029, pz + 0.046), v3(-0.108, py + 0.029, pz - 0.022)], 0.008, 0.0015, 0xffffff, v3(0, 1, 0), true);
    const wm = new THREE.Mesh(win.build(), M.web);
    this.lid.add(wm); this.lidParts.push(wm);
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.104, 0.066), M.sleeve);
    sl.rotation.x = -Math.PI / 2; sl.position.set(-0.055, py + 0.031, pz + 0.012);
    this.lid.add(sl); this.lidParts.push(sl);

    // the compression straps: over the crown, down the sides to buckles on the walls
    const straps = new PG(40);
    const strapZ = [LO * 0.27, LO * 0.53];
    for (const sz of strapZ) {
      const pts: V[] = [];
      for (let i = 0; i <= 10; i++) { const x = -W2 + 0.004 + (i / 10) * (W - 0.008); pts.push(v3(x, crown(x, sz) + 0.003, sz)); }
      straps.bar(pts, 0.026, 0.003, 0xffffff, v3(0, 0, 1), true);
      for (const s of [-1, 1]) {
        // the end hangs on a pivot at the flap's edge: down the wall to the buckle
        const piv = new THREE.Group();
        piv.position.set(s * (W2 + 0.002), TH * 0.5, sz);
        const e = new PG(40);
        e.bar([v3(0, 0, 0), v3(s * 0.006, -0.03, 0), v3(s * 0.009, -0.075, 0)], 0.026, 0.003, 0xffffff, v3(0, 0, 1), true);
        const em = new THREE.Mesh(e.build(), M.web);
        const bk = new PG(30);
        bk.geo(fbox(0.034, 0.03, 0.01, 0.003, true), new THREE.Matrix4().makeTranslation(s * 0.012, -0.08, 0), 0x2c2d30);
        const bm = new THREE.Mesh(bk.build(), M.plastic);
        inked(bm, 0.0018);
        piv.add(em, bm);
        this.lid.add(piv); this.lidParts.push(piv);
        this.strapEnds.push(piv);
      }
    }
    const stm = new THREE.Mesh(straps.build(), M.web);
    this.lid.add(stm); this.lidParts.push(stm);
    // the buckles' other halves stitched to the walls (on the body)
    const fem = new PG(30), femTape = new PG(40);
    for (const sz of strapZ) for (const s of [-1, 1]) {
      const z = sz - LO / 2;
      fem.geo(fbox(0.034, 0.032, 0.012, 0.003, true), new THREE.Matrix4().makeTranslation(s * (W2 + 0.012), RIM - 0.125, z), 0x2c2d30);
      femTape.bar([v3(s * (W2 + 0.006), RIM - 0.14, z), v3(s * (W2 + 0.012), BASE + 0.02, z)], 0.026, 0.003, 0xffffff, v3(0, 0, 1), true);
    }
    const fm = new THREE.Mesh(fem.build(), M.plastic); inked(fm, 0.0018);
    this.body.add(fm); this.shell.push(fm);
    const ftm = new THREE.Mesh(femTape.build(), M.web);
    this.body.add(ftm); this.shell.push(ftm);
    void RIM;
  }

  /** the brass padlock with its phosphor window, the shackle, the steel lanyard */
  private buildLock(RIM: number, L2: number) {
    const M = mats();
    for (const c of [...this.lock.children]) if (c !== this.shackle && c !== this.pad) this.lock.remove(c);
    this.shackle.clear();
    const body = new PG(30);
    body.geo(fbox(0.05, 0.056, 0.022, 0.005, true), new THREE.Matrix4(), 0xffffff);
    const bm = new THREE.Mesh(body.build(), M.brass); inked(bm, 0.002);
    const face = new PG(30);
    face.geo(fbox(0.04, 0.03, 0.004, 0.002, true), new THREE.Matrix4().makeTranslation(0, 0.006, 0.011), 0x3a3c3e);
    const fm = new THREE.Mesh(face.build(), M.iron);
    // the keyway is a slot for the band's contact, not a key
    const slot = new PG(30);
    slot.geo(fbox(0.016, 0.004, 0.003, 0.001, true), new THREE.Matrix4().makeTranslation(0, -0.017, 0.0115), 0x101010);
    const sm = new THREE.Mesh(slot.build(), M.iron);
    this.lock.add(bm, fm, sm);
    this.pad.position.set(0, 0.006, 0.0145);
    const sh = new PG(30);
    sh.geo(frod([-0.014, 0.02, 0], [-0.014, 0.05, 0], 0.0042, 6), new THREE.Matrix4(), 0xe8ecf0);
    sh.geo(frod([0.014, 0.02, 0], [0.014, 0.05, 0], 0.0042, 6), new THREE.Matrix4(), 0xe8ecf0);
    sh.geo(frod([-0.014, 0.05, 0], [-0.007, 0.06, 0], 0.0042, 6), new THREE.Matrix4(), 0xe8ecf0);
    sh.geo(frod([-0.007, 0.06, 0], [0.007, 0.06, 0], 0.0042, 6), new THREE.Matrix4(), 0xe8ecf0);
    sh.geo(frod([0.007, 0.06, 0], [0.014, 0.05, 0], 0.0042, 6), new THREE.Matrix4(), 0xe8ecf0);
    this.shackle.add(new THREE.Mesh(sh.build(), M.chrome));
    // poses: hanging from the pulls over the bottom end (face up toward the eye), and lying on the floor
    const hang = new THREE.Object3D();
    hang.position.set(0, RIM - 0.045, L2 + 0.03); hang.rotation.set(-1.0, 0, 0);
    hang.updateMatrix(); this.lockHang.copy(hang.matrix);
    const floor = new THREE.Object3D();
    floor.position.set(0.075, 0.012, L2 + 0.085); floor.rotation.set(-Math.PI / 2 + 0.05, 0, 0.5);
    floor.updateMatrix(); this.lockFloor.copy(floor.matrix);
    this.lock.matrixAutoUpdate = false;
    if (!this.lanyard) { this.lanyard = new THREE.Mesh(new THREE.BufferGeometry(), M.steel); this.body.add(this.lanyard); }
  }

  // ================================================================ moving parts
  /** 0 = shut, 1 = thrown back over the top end onto the floor */
  setLid(k: number) { this.lid.rotation.x = -Math.max(0, Math.min(1, k)) * LID_OPEN; }
  /** compression buckles: 0 = clipped, 1 = undone and flipped up onto the flap */
  setBolts(k: number) {
    this.strapEnds.forEach((p, i) => {
      const s = p.position.x > 0 ? 1 : -1;
      const kk = Math.max(0, Math.min(1, k * 1.5 - (i % 2) * 0.25 - Math.floor(i / 2) * 0.2));
      p.rotation.z = s * kk * 2.3;
    });
  }
  /** the zip pulls: 0 = together at the bottom end (sealed), 1 = round at the top corners */
  setZip(k: number) {
    this.zipK = k;
    const path = this.zipPath, len = this.zipLen;
    if (path.length < 2) return;
    const total = len[len.length - 1];
    // the bottom end's middle is where the pulls meet when shut
    let mid = total / 2;
    for (let i = 1; i < path.length; i++) if (path[i - 1].x < 0 && path[i].x >= 0 && Math.abs(path[i].z - path[i - 1].z) < 0.01) { mid = len[i - 1] + (0 - path[i - 1].x) / (path[i].x - path[i - 1].x) * (len[i] - len[i - 1]); break; }
    const at = (d: number, out: V, dir: V) => {
      d = Math.max(0, Math.min(total, d));
      let i = 1; while (i < len.length - 1 && len[i] < d) i++;
      const t = (d - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
      out.lerpVectors(path[i - 1], path[i], t); dir.subVectors(path[i], path[i - 1]).normalize();
    };
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    this.pulls.forEach((g, i) => {
      const s = i === 0 ? -1 : 1;
      const dist = mid + s * (0.012 + k * (mid - 0.012));
      at(dist, p, d);
      g.position.copy(p);
      g.rotation.set(0, Math.atan2(-d.z, d.x), 0);
      // the tab hangs over the outer edge
      g.children[1].rotation.x = 0.9;
    });
  }
  /** the seal: 0 = locked on the pulls, 0.3 shackle up, 1 = fallen open on the floor */
  setLock(k: number) {
    this.lockK = k;
    const up = Math.min(1, k / 0.3);
    this.shackle.position.y = up * 0.014;
    const f = Math.max(0, Math.min(1, (k - 0.3) / 0.7));
    const e = f * f * (3 - 2 * f);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), s = new THREE.Vector3();
    this.lockHang.decompose(a, qa, s); this.lockFloor.decompose(b, qb, s);
    const pos = a.clone().lerp(b, e);
    pos.y += Math.sin(e * Math.PI) * 0.03;
    const q = qa.clone().slerp(qb, e);
    this.lock.matrix.compose(pos, q, v3(1, 1, 1));
    this.lock.matrixWorldNeedsUpdate = true;
    this.lockLanyard(pos);
  }
  private lockLanyard(lockPos: V) {
    if (!this.lanyard) return;
    const a = lockPos.clone().add(v3(0, -0.024, 0)), b = this.lanyardAt;
    const pts: V[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * 0.035;
      p.y = Math.max(0.004, p.y);
      pts.push(p);
    }
    const pg = new PG(30);
    for (let i = 0; i < 6; i++) pg.geo(frod([pts[i].x, pts[i].y, pts[i].z], [pts[i + 1].x, pts[i + 1].y, pts[i + 1].z], 0.0018, 4), new THREE.Matrix4(), 0xc0c4c8);
    this.lanyard.geometry.dispose();
    this.lanyard.geometry = pg.build();
  }

  /** the seal's window reading the band: sweep 0..1 (0 = idle, 1 = done), glow 0..1 */
  setScan(sweep: number, glow: number, ok = true) {
    const state = sweep <= 0 ? (glow > 0.12 ? 'idle' : 'off') : sweep >= 1 ? (ok ? 'ok' : 'bad') : 'read';
    if (state === 'off') { if (this.scanState !== 'off') { this.reader.power(false); this.scanState = 'off'; } return; }
    if (this.scanState === 'off' || this.scanState === '') this.reader.power(true);
    if (state === 'read' || state !== this.scanState) this.drawReader(sweep, state);
    this.scanState = state;
  }
  private drawReader(sweep: number, state: string) {
    const { ctx, canvas } = this.reader;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0c2a12';
    for (let y = 4; y < h; y += 8) ctx.fillRect(4, y, w - 8, 1);
    if (state === 'read') {
      const x = 6 + sweep * (w - 12);
      ctx.fillStyle = 'rgba(150,255,170,0.45)'; ctx.fillRect(x - 10, 6, 10, h - 12);
      ctx.fillStyle = '#e0ffe4'; ctx.fillRect(x, 6, 2, h - 12);
      phosphorText(ctx, 'BAND', w / 2, h - 22, { size: 16, align: 'center', color: '#9dffb5', font: CRT() });
    } else if (state === 'ok') {
      phosphorText(ctx, 'OPEN', w / 2, 8, { size: 20, align: 'center', color: '#d8ffe0', glow: 9, font: CRT() });
      phosphorText(ctx, this.no, w / 2, 36, { size: 16, align: 'center', color: '#9dffb5', font: CRT() });
    } else if (state === 'bad') {
      phosphorText(ctx, 'DENIED', w / 2, 22, { size: 18, align: 'center', color: '#ffb080', glow: 9, font: CRT() });
    } else {
      phosphorText(ctx, 'SEALED', w / 2, 10, { size: 16, align: 'center', color: '#5ad87a', font: CRT() });
      phosphorText(ctx, 'BAND', w / 2, 34, { size: 14, align: 'center', color: '#3a9a52', font: CRT() });
    }
    this.reader.flush();
  }

  /** the debtor's number on the card, the luggage tag and the seal */
  setPlate(no: string) {
    if (no === this.no) return;
    this.no = no;
    if (this.idMat) { this.idMat.map = idCard(no); this.idMat.needsUpdate = true; }
    if (this.tagMat) { this.tagMat.map = hangTag(no); this.tagMat.needsUpdate = true; }
    this.scanState = '';
  }
  /** the inside: the lamp, the items */
  setInside(k: number, flicker = 0) {
    this.light.intensity = (0.9 + flicker * 0.4) * k;
    if (this.lens) (this.lens.material as THREE.MeshBasicMaterial).color.setRGB(0.25 + 0.75 * k, 0.22 + 0.67 * k, 0.16 + 0.5 * k);
    this.itemsG.visible = k > 0.05;
  }

  applyPeel() {
    super.applyPeel();
    const d = this.spec?.d ?? 5;
    const on = this.peel < d;
    this.peelPlane.visible = on; if (this.peelGrid) this.peelGrid.visible = on;
    const y = Math.min(this.peel, d) * PACK_CELL[2];
    this.peelPlane.position.y = y + 0.001; if (this.peelGrid) this.peelGrid.position.y = y + 0.001;
  }

  /** a zip pull (0 left, 1 right) */
  pull(i: number): THREE.Object3D | null { return this.pulls[i] ?? null; }
  /** a compression strap's buckle end (0..3) */
  strapEnd(i: number): THREE.Object3D | null { return this.strapEnds[i] ?? null; }
  /** the flap's free edge, middle (world space) */
  flapEdge(out: V): V { return this.lid.localToWorld(out.set(0, TH + DOME * 0.4, this.size.z * 0.98)); }
  /** the rim's near edge above local x (world space): where a tag for something inside lies */
  rimNear(x: number, out: V): V { return this.root.localToWorld(out.set(Math.max(-this.size.x / 2 + 0.06, Math.min(this.size.x / 2 - 0.06, x)), this.size.y - DOME - TH + 0.035, this.size.z / 2 + 0.05)); }
  /** the seal's window (world space) */
  sealAt(out: V): V { return this.pad.getWorldPosition(out); }
  /** where a hand takes hold to carry it (world space): the side at mid height, toward you */
  gripPoint(side: 1 | -1, out: V): V {
    return this.root.localToWorld(out.set(side * (this.size.x / 2 + 0.012), this.size.y * 0.55, 0.06));
  }

  // ================================================================ dropping in
  private inv = new THREE.Matrix4();
  private lr = new THREE.Ray();
  targetAt(ray: THREE.Ray, it: Item, rot: Rot, count: number): DropAt | null {
    const spec = this.spec, occ = this.occ, c = this.c;
    if (!spec || !occ || !c || !this.root.visible) return null;
    const [cx, cy, cz] = PACK_CELL;
    this.space.updateWorldMatrix(true, false);
    this.inv.copy(this.space.matrixWorld).invert();
    const r = this.lr.copy(ray).applyMatrix4(this.inv);
    const top = spec.d * cz;
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = (top - r.origin.y) / r.direction.y;
    if (t < 0) return null;
    const hx = r.origin.x + r.direction.x * t, hz = r.origin.z + r.direction.z * t;
    const I = spec.w * cx, L = spec.h * cy;
    if (hx < -cx * 0.9 || hz < -cy * 0.9 || hx > I + cx * 0.9 || hz > L + cy * 0.9) return null;
    const [ex, ey, ez] = extentIn(spec, it, rot);
    const gx = Math.max(0, Math.min(spec.w - Math.min(ex, spec.w), Math.round(hx / cx - ex / 2)));
    const gy = Math.max(0, Math.min(spec.h - Math.min(ey, spec.h), Math.round(hz / cy - ey / 2)));
    const ds = ex <= spec.w && ey <= spec.h && ez <= spec.d ? dropSpot(occ, it, gx, gy, rot, count) : null;
    const gz = ds ? ds.gz : Math.max(0, spec.d - ez);
    return { view: this, c, at: { gx, gy, gz, rot }, fit: ds ? ds.fit : 'blocked', ex, ey, ez };
  }
}

/** a pebble of grit for the thump of the pack landing (shared low-poly bit) */
export const gritGeo = () => gem(0.004, 0, 0.3, 2);

// The Meridian-issue backpack as the arrival shows it: a corporate field pack,
// not a box. A lofted ripstop body that bulges and narrows to a rounded top,
// a front pocket with a zip, a stiff curved top flap printed with the
// Institute's seal and name, a moulded olive back shell with vent ribs,
// padded shoulder straps curving away from it, a webbing carry handle, side
// compression straps with brass buckles, zip pulls with red tags, a brass
// serial plate. Faceted throughout; pixel-art textures with dark seams.
// Two builds of one part list: the world copy (atlas textures, world
// material: it falls out of the chute onto the Lobby floor) and the close-up
// copy for the hands (its own canvas textures, standard material, the
// printed words in Space Grotesk).
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, mixHex } from '../../gfx/pixel';
import { cssFont } from '../../gfx/crt';
import { hash3, canvasTex } from './geo';

const K = 0x0b0b09;
type Draw = (pc: PixelCanvas) => void;

// ------------------------------------------------------------------ textures
const fabric = (base: number, line: number, zip: boolean): Draw => (pc) => {
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = hash3(x, y, base & 255);
    let c = mixHex(base, mixHex(base, 0xffffff, 0.12), n * 0.7);
    if (x % 4 === 0 || y % 4 === 0) c = mixHex(c, line, 0.55);        // the ripstop grid
    if (hash3(x >> 1, y >> 1, 7) > 0.94) c = mixHex(c, 0x8a7c62, 0.4);  // dust
    pc.set(x, y, c);
  }
  if (zip) for (let x = 0; x < pc.w; x++) { pc.set(x, 1, x % 2 ? 0x18181a : 0x6a6c66); pc.set(x, 2, K); }
  for (let i = 0; i < pc.w; i++) { pc.set(i, pc.h - 1, K); }
  for (let i = 0; i < pc.h; i++) { pc.set(0, i, mixHex(pc.get(0, i), K, 0.6)); }
};
const FAB = fabric(0x343a30, 0x434a3c, false);
const FAB2 = fabric(0x2c312a, 0x3a4034, true);
const PANEL: Draw = (pc) => {
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    let c = mixHex(0x4f5a3e, 0x67734f, (1 - y / pc.h) * 0.5 + hash3(x, y, 13) * 0.25);
    if (hash3(x >> 1, y >> 1, 14) > 0.93) c = 0x8f9380;               // chipped enamel
    pc.set(x, y, c);
  }
  // vent slots
  for (let k = 0; k < 3; k++) for (let x = 4; x < 12; x++) { pc.set(x, 4 + k * 3, 0x161a12); pc.set(x, 5 + k * 3, 0x80906a); }
  for (let i = 0; i < pc.w; i++) { pc.set(i, 0, 0x8a9870); pc.set(i, pc.h - 1, K); }
  for (let i = 0; i < pc.h; i++) { pc.set(0, i, 0x7c8a64); pc.set(pc.w - 1, i, K); }
};
const STRAP: Draw = (pc) => {
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    let c = mixHex(0x23261f, 0x30342b, hash3(x, y, 17) * 0.6);
    if ((y + (x >> 1)) % 3 === 0) c = mixHex(c, 0x3e4336, 0.6);         // the weave
    pc.set(x, y, c);
  }
  for (let y = 0; y < pc.h; y += 2) { pc.set(1, y, 0x8c8a76); pc.set(pc.w - 2, y, 0x8c8a76); } // stitching
  for (let y = 0; y < pc.h; y++) { pc.set(0, y, K); pc.set(pc.w - 1, y, K); }
};
const BRASS: Draw = (pc) => {
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, mixHex(0x8a6a2a, 0xd8b45a, (1 - (x + y) / (pc.w + pc.h)) * 0.8 + hash3(x, y, 19) * 0.2));
  pc.set(1, 1, 0xfff0b0); pc.set(2, 1, 0xf0d890);
  for (let i = 0; i < pc.w; i++) { pc.set(i, pc.h - 1, K); pc.set(pc.w - 1, i, K); }
};
const TAG: Draw = (pc) => {
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, mixHex(0x9a2418, 0xc4402a, (1 - y / pc.h) * 0.7));
  for (let i = 0; i < pc.w; i++) { pc.set(i, pc.h - 1, K); pc.set(pc.w - 1, i, K); }
};
/** the flap: dark fabric, the Institute's seal (a globe of meridians), an orange Remittance stripe; words added on the close-up copy */
const FLAP: Draw = (pc) => {
  FAB2(pc);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, mixHex(pc.get(x, y), 0x22261f, 0.35));
  // the stripe
  for (let y = pc.h - 5; y < pc.h - 2; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, y === pc.h - 5 ? 0xf2a040 : mixHex(0xd8781c, 0xe8902c, hash3(x, y, 23)));
  for (let x = 0; x < pc.w; x++) pc.set(x, pc.h - 2, K);
  // the seal: a printed globe of meridians (pale, a little worn)
  const cx = 8.5, cy = 9.5, R = 6.2;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > R + 0.6) continue;
    const ring = d > R - 0.6;
    const eq = Math.abs(y - cy) < 0.5 && d < R;
    const mer = d < R && (Math.abs(x - cx) < 0.5 || Math.abs(Math.hypot((x - cx) / 0.55, (y - cy)) - R) < 0.55);
    if ((ring || eq || mer) && hash3(x, y, 29) > 0.08) pc.set(x, y, 0xcfd2c0);
  }
};
const TEX: Record<string, [number, number, Draw]> = {
  arv_pk_fab: [16, 16, FAB], arv_pk_fab2: [16, 16, FAB2], arv_pk_panel: [16, 16, PANEL], arv_pk_strap: [8, 16, STRAP],
  arv_pk_brass: [8, 8, BRASS], arv_pk_tag: [4, 6, TAG], arv_pk_flap: [48, 24, FLAP],
};
addTextureModule(() => { const A = atlas(); for (const [k, [w, h, d]] of Object.entries(TEX)) A.add(k, w, h, (pc) => d(pc)); });

/** the close-up copies of the textures (the flap gets its printed words) */
const canvases = new Map<string, THREE.CanvasTexture>();
function overlayTex(key: string): THREE.CanvasTexture {
  let t = canvases.get(key);
  if (t) return t;
  const [w, h, d] = TEX[key];
  const S = key === 'arv_pk_flap' ? 6 : 1;
  const pc = new PixelCanvas(w, h);
  d(pc);
  const cv = document.createElement('canvas');
  cv.width = w * S; cv.height = h * S;
  const g = cv.getContext('2d')!;
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
  tmp.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, w * S, h * S);
  if (key === 'arv_pk_flap') {
    // MERIDIAN / REMITTANCE ISSUE / a serial, screen-printed beside the seal (smooth type over the pixel fabric)
    const font = cssFont('--font-new', "'Space Grotesk', Arial, sans-serif");
    g.fillStyle = '#d6d8c8'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = `700 ${5.4 * S}px ${font}`;
    g.fillText('MERIDIAN', 17 * S, 10 * S);
    g.font = `500 ${2.9 * S}px ${font}`;
    g.fillText('REMITTANCE ISSUE', 17 * S, 14 * S);
    g.fillText('No. 0041-R', 17 * S, 17.4 * S);
  }
  t = canvasTex(cv, true);
  canvases.set(key, t);
  return t;
}

// ------------------------------------------------------------------ the part list
type Emit = (tex: string) => ModelBuilder;
type V3 = [number, number, number];

/** a loft of chamfered sections [y, halfW, halfD, zOff], wound outward; caps optional */
function loftInto(b: ModelBuilder, tex: string, S: [number, number, number, number][], ur: number, vr: number, caps: [boolean, boolean], color = 0xffffff) {
  const ring = ([y, w, d, z]: [number, number, number, number]): V3[] => {
    const cw = w * 0.32, cd = d * 0.38;
    return [[w, y, z + d - cd], [w - cw, y, z + d], [-w + cw, y, z + d], [-w, y, z + d - cd], [-w, y, z - d + cd], [-w + cw, y, z - d], [w - cw, y, z - d], [w, y, z - d + cd]];
  };
  const R = S.map(ring), y0 = S[0][0], H = S[S.length - 1][0] - y0 || 1;
  for (let s = 0; s < R.length - 1; s++) for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8, A = R[s], B = R[s + 1];
    const va = (S[s][0] - y0) / H * vr, vb = (S[s + 1][0] - y0) / H * vr, u0 = i / 8 * ur, u1 = (i + 1) / 8 * ur;
    b.quadRaw([A[j], A[i], B[i], B[j]], [[u1, va], [u0, va], [u0, vb], [u1, vb]], tex, color);
  }
  const cap = (r: V3[], up: boolean) => {
    const c: V3 = [0, r[0][1], r.reduce((a, p) => a + p[2], 0) / 8];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const uv = (p: V3) => [0.5 + p[0] * 2, 0.5 + (p[2] - c[2]) * 2];
      if (up) b.triRaw([c, r[j], r[i]], [uv(c), uv(r[j]), uv(r[i])], tex, color);
      else b.triRaw([c, r[i], r[j]], [uv(c), uv(r[i]), uv(r[j])], tex, color);
    }
  };
  if (caps[1]) cap(R[R.length - 1], true);
  if (caps[0]) cap(R[0], false);
}

/** a thin strap (box chain) along points, width w, thickness t, normal side toward +n */
function strapInto(b: ModelBuilder, tex: string, pts: V3[], w: number, t: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], len = Math.hypot(dx, dy, dz);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 0, 1).cross(new THREE.Vector3(dx, dy, dz)).lengthSq() > 1e-6 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0));
    b.push().translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2).matrix(m);
    // lookAt maps local +z to the direction: lay the box along z
    b.box(0, -t / 2, 0, w, t, len + 0.004, tex, { fit: true, bevel: Math.min(w, t) * 0.3 });
    b.pop();
  }
}

/** the whole pack: origin at the bottom centre, back shell toward -z, ~0.34 x 0.5 x 0.24 m */
function packParts(B: Emit) {
  // body and pocket
  loftInto(B('arv_pk_fab'), 'arv_pk_fab', [[0.0, 0.13, 0.07, 0.0], [0.035, 0.155, 0.09, 0.008], [0.2, 0.166, 0.1, 0.016], [0.34, 0.16, 0.096, 0.012], [0.43, 0.142, 0.082, 0.0], [0.475, 0.11, 0.06, -0.008], [0.497, 0.06, 0.034, -0.012]], 3, 3, [true, true]);
  loftInto(B('arv_pk_fab2'), 'arv_pk_fab2', [[0.045, 0.112, 0.026, 0.104], [0.075, 0.128, 0.038, 0.11], [0.22, 0.124, 0.036, 0.108], [0.272, 0.108, 0.022, 0.1]], 2, 2, [true, true], 0xe0e4dc);
  // the flap: a stiff curved lid over the top, front edge hanging down the front
  const fb = B('arv_pk_flap');
  const arc: [number, number][] = [[-0.03, 0.505], [0.03, 0.502], [0.075, 0.48], [0.105, 0.44], [0.118, 0.385], [0.12, 0.33]];
  const hw = 0.135, th = 0.012;
  for (let i = 0; i < arc.length - 1; i++) {
    const [z0, y0] = arc[i], [z1, y1] = arc[i + 1];
    const v0 = 1 - i / (arc.length - 1), v1 = 1 - (i + 1) / (arc.length - 1);
    const w0 = hw * (1 - i * 0.02), w1 = hw * (1 - (i + 1) * 0.02);
    // outer face
    fb.quadRaw([[-w0, y0 + th, z0 + th * 0.4], [-w1, y1 + th * 0.2, z1 + th], [w1, y1 + th * 0.2, z1 + th], [w0, y0 + th, z0 + th * 0.4]], [[0, v0], [0, v1], [1, v1], [1, v0]], 'arv_pk_flap');
    // the sides of the lid (its thickness)
    fb.quadRaw([[w0, y0 + th, z0 + th * 0.4], [w1, y1 + th * 0.2, z1 + th], [w1, y1, z1], [w0, y0, z0]], [[1, v0], [1, v1], [0.98, v1], [0.98, v0]], 'arv_pk_flap', 0x9a9a90);
    fb.quadRaw([[-w0, y0, z0], [-w1, y1, z1], [-w1, y1 + th * 0.2, z1 + th], [-w0, y0 + th, z0 + th * 0.4]], [[0, v0], [0, v1], [0.02, v1], [0.02, v0]], 'arv_pk_flap', 0x9a9a90);
  }
  const [ze, ye] = arc[arc.length - 1];
  fb.quadRaw([[-hw * 0.9, ye, ze], [hw * 0.9, ye, ze], [hw * 0.9, ye + th * 0.2, ze + th], [-hw * 0.9, ye + th * 0.2, ze + th]], [[0, 0], [1, 0], [1, 0.02], [0, 0.02]], 'arv_pk_flap', 0x707068);
  // the moulded back shell and its ribs
  const pb = B('arv_pk_panel');
  pb.box(0, 0.025, -0.098, 0.3, 0.44, 0.026, 'arv_pk_panel', { fit: true, bevel: 0.009 });
  for (let k = 0; k < 3; k++) pb.box(0, 0.12 + k * 0.12, -0.116, 0.22, 0.03, 0.012, 'arv_pk_panel', { fit: true, bevel: 0.004, color: 0xb8c0a8 });
  // padded shoulder straps, curving away from the shell
  const sb = B('arv_pk_strap');
  for (const s of [-1, 1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push([s * (0.065 + u * 0.05), 0.43 - u * 0.37, -0.118 - Math.sin(u * Math.PI) * 0.06]); }
    strapInto(sb, 'arv_pk_strap', pts, 0.055, 0.018);
    // the adjuster webbing hanging below
    strapInto(sb, 'arv_pk_strap', [[s * 0.115, 0.06, -0.12], [s * 0.13, 0.0, -0.1], [s * 0.14, -0.06, -0.09]], 0.026, 0.005);
  }
  // the carry handle
  strapInto(sb, 'arv_pk_strap', [[-0.045, 0.49, -0.04], [-0.03, 0.535, -0.04], [0.03, 0.535, -0.04], [0.045, 0.49, -0.04]], 0.024, 0.01);
  // side compression straps, brass buckles, the serial plate, zip pulls
  for (const s of [-1, 1]) strapInto(sb, 'arv_pk_strap', [[s * 0.168, 0.12, -0.07], [s * 0.178, 0.2, 0.0], [s * 0.17, 0.27, 0.08]], 0.022, 0.006);
  const bb = B('arv_pk_brass');
  for (const s of [-1, 1]) bb.box(s * 0.178, 0.19, 0.0, 0.014, 0.034, 0.03, 'arv_pk_brass', { fit: true, bevel: 0.003 });
  for (const s of [-1, 1]) bb.box(s * 0.07, 0.315, 0.128, 0.03, 0.024, 0.008, 'arv_pk_brass', { fit: true, bevel: 0.003 });
  bb.box(0.0, 0.405, 0.128, 0.05, 0.016, 0.006, 'arv_pk_brass', { fit: true, bevel: 0.002 });
  const tb = B('arv_pk_tag');
  for (const x of [-0.06, 0.08]) { tb.box(x, 0.205, 0.148, 0.012, 0.03, 0.006, 'arv_pk_tag', { fit: true, bevel: 0.002 }); }
}

/** the world copy (one mesh, world material) */
export function packWorldMesh(): THREE.Mesh {
  const mb = new ModelBuilder();
  packParts(() => mb);
  const m = new THREE.Mesh(mb.build(), worldMaterial({}));
  m.castShadow = true; m.receiveShadow = true;
  m.name = 'arrival:pack';
  return m;
}

/** the close-up copy for the hands (standard materials, crisp canvas textures) */
export function packOverlayGroup(): THREE.Group {
  const builders = new Map<string, ModelBuilder>();
  packParts((tex) => { let b = builders.get(tex); if (!b) { b = new ModelBuilder(); b.setFaceShading(false); builders.set(tex, b); } return b; });
  const g = new THREE.Group();
  g.name = 'arrival:packFp';
  const look: Record<string, { r: number; m: number }> = { arv_pk_brass: { r: 0.35, m: 0.85 }, arv_pk_panel: { r: 0.5, m: 0.15 }, arv_pk_tag: { r: 0.7, m: 0 } };
  for (const [tex, b] of builders) {
    const geo = b.build();
    geo.deleteAttribute('aAtlas'); geo.deleteAttribute('aFx');
    const l = look[tex] ?? { r: 0.88, m: 0 };
    const mat = new THREE.MeshStandardMaterial({ map: overlayTex(tex), vertexColors: true, flatShading: true, roughness: l.r, metalness: l.m });
    const me = new THREE.Mesh(geo, mat);
    me.castShadow = true;
    g.add(me);
  }
  return g;
}

export function disposeGroup(o: THREE.Object3D) {
  o.traverse((m) => {
    const me = m as THREE.Mesh;
    if (!me.isMesh) return;
    me.geometry.dispose();
    const mat = me.material as THREE.Material;
    if (!(mat as unknown as { isWorld?: boolean }).isWorld && mat.type !== 'MeshLambertMaterial') mat.dispose();
  });
  o.removeFromParent();
}

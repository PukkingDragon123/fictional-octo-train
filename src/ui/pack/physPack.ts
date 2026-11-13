// THE MERIDIAN FIELD PACK, round 12: a real rucksack you set down on its back and
// open like a panel-loader (the front panel unzips round three sides and flops
// over to the left on its fabric hinge), and the little physics that makes every
// item in it, in the drawer beside it and on the floor a solid thing that falls,
// bounces, slides and stacks.
//
//  buildFieldPack()  the model: a graphite ripstop body on a padded back panel,
//                    the amber Meridian lining, the zip track and two pulls, the
//                    front panel (organiser with a mesh pocket and a zip pocket on
//                    its inside; the logo patch, a front pocket, a reflective band
//                    and compression straps outside), shoulder straps and hip-belt
//                    wings out from under it, side compression straps with buckles,
//                    a stretch bottle pocket, the haul loop and a luggage tag.
//  PhysBin / Phys    boxes with gravity, restitution, friction and a little tumble:
//                    bodies are the items' real meshes (src/craft/fpKit makeItemObj),
//                    a bin is an open box (the pack's main compartment, a drawer, a
//                    pouch, a patch of floor) in its own frame. A held body follows a
//                    target on a critically damped spring and swings with its speed.
import * as THREE from 'three';
import type { Item } from '../../items/item';
import { size3 } from '../../items/grid';
import { makeItemObj, fitItemObj, type ItemObj } from '../../craft/fpKit';

// ================================================================ textures
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.magFilter = THREE.NearestFilter;
  return t;
}
/** ripstop nylon: a base colour with a darker grid and a lighter thread */
function ripstop(base: string, dark: string, light: string): THREE.CanvasTexture {
  return canvasTex(32, 32, (x) => {
    x.fillStyle = base; x.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 32; j++) if ((i * 7 + j * 13) % 11 === 0) { x.fillStyle = light; x.fillRect(i, j, 1, 1); }
    x.fillStyle = dark;
    for (let i = 0; i < 32; i += 8) { x.fillRect(i, 0, 1, 32); x.fillRect(0, i, 32, 1); }
  }, 4);
}
const MAT_CACHE: Record<string, THREE.Material> = {};
function mat(key: string): THREE.Material {
  if (MAT_CACHE[key]) return MAT_CACHE[key];
  let m: THREE.Material;
  switch (key) {
    case 'nylon': m = new THREE.MeshStandardMaterial({ map: ripstop('#3a4250', '#2a303a', '#4a5466'), roughness: 0.86, metalness: 0.02 }); break;
    case 'nylonDk': m = new THREE.MeshStandardMaterial({ map: ripstop('#262b33', '#1a1e24', '#323944'), roughness: 0.9 }); break;
    case 'lining': m = new THREE.MeshStandardMaterial({ map: ripstop('#d89a34', '#b8781c', '#eab456'), roughness: 0.8, side: THREE.DoubleSide }); break;
    case 'amber': m = new THREE.MeshStandardMaterial({ color: 0xe8b52a, roughness: 0.6 }); break;
    case 'web': m = new THREE.MeshStandardMaterial({ map: canvasTex(8, 16, (x) => { x.fillStyle = '#17181b'; x.fillRect(0, 0, 8, 16); x.fillStyle = '#2a2c30'; for (let i = 0; i < 16; i += 2) x.fillRect(0, i, 8, 1); x.fillStyle = '#e8b52a'; x.fillRect(3, 0, 2, 16); }, 1), roughness: 0.9 }); break;
    case 'pad': m = new THREE.MeshStandardMaterial({ map: canvasTex(16, 16, (x) => { x.fillStyle = '#1c1f24'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#2c323a'; for (let i = 0; i < 16; i += 4) for (let j = 0; j < 16; j += 4) x.fillRect(i + ((j / 4) % 2) * 2, j, 2, 2); }, 6), roughness: 0.95 }); break;
    case 'mesh': m = new THREE.MeshStandardMaterial({ map: canvasTex(16, 16, (x) => { x.fillStyle = '#20242a'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#4a5260'; for (let i = 0; i < 16; i += 3) { x.fillRect(i, 0, 1, 16); x.fillRect(0, i, 16, 1); } }, 5), roughness: 0.9, side: THREE.DoubleSide }); break;
    case 'zip': m = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.5, metalness: 0.3 }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.85 }); break;
    case 'plastic': m = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.55 }); break;
    case 'reflect': m = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.25, metalness: 0.5, emissive: 0x202428 }); break;
    case 'patch': m = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (x) => {
      x.fillStyle = '#1a1d22'; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = '#e8b52a'; x.lineWidth = 3; x.beginPath(); x.arc(32, 26, 17, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(13, 26); x.lineTo(51, 26); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.ellipse(32, 26, 8, 17, 0, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#e8b52a'; x.font = 'bold 9px monospace'; x.textAlign = 'center'; x.fillText('MERIDIAN', 32, 54);
      x.fillStyle = '#8a8e96'; x.font = '6px monospace'; x.fillText('INSTITUTE', 32, 61);
    }), roughness: 0.7 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  }
  MAT_CACHE[key] = m;
  return m;
}

// ================================================================ shapes
function roundRect(w: number, l: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -l / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + l - r); s.quadraticCurveTo(x0 + w, y0 + l, x0 + w - r, y0 + l);
  s.lineTo(x0 + r, y0 + l); s.quadraticCurveTo(x0, y0 + l, x0, y0 + l - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
/** a rounded slab lying flat (x by z), `t` thick, bottom at y = 0, soft bevelled edges */
function slab(w: number, l: number, t: number, r: number, bev = 0.008): THREE.BufferGeometry {
  const b = Math.min(bev, t * 0.4);
  const g = new THREE.ExtrudeGeometry(roundRect(w - b * 2, l - b * 2, Math.max(0.005, r - b)), { depth: t - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, b, 0);
  scaleUV(g, 3);
  return g;
}
/** a rounded ring wall (outer w x l, wall thickness t), `h` tall, bottom at y = 0 */
function ringWall(w: number, l: number, r: number, t: number, h: number): THREE.BufferGeometry {
  const s = roundRect(w, l, r);
  const hole = roundRect(w - t * 2, l - t * 2, Math.max(0.005, r - t));
  s.holes.push(new THREE.Path(hole.getPoints(24).reverse()));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  scaleUV(g, 3);
  return g;
}
function scaleUV(g: THREE.BufferGeometry, k: number) { const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined; if (!uv) return; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); uv.needsUpdate = true; }
/** a closed tube along the rounded-rect outline (zip tracks, piping) */
function rimTube(w: number, l: number, r: number, rad: number): THREE.BufferGeometry {
  const pts = roundRect(w, l, r).getPoints(16).map((p) => new THREE.Vector3(p.x, 0, -p.y));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, rad, 5, true);
}
/** a flat strap along a curve on the floor */
function strap(pts: [number, number, number][], wid: number, thick: number, m: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, 28, wid / 2, 6, false);
  const mesh = new THREE.Mesh(g, m);
  mesh.scale.y = thick / wid;
  mesh.castShadow = true;
  return mesh;
}
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

// ================================================================ the pack
export interface FieldPack {
  root: THREE.Group;
  /** the main compartment (pack-local): interior box */
  inner: { min: THREE.Vector3; max: THREE.Vector3 };
  W: number; L: number; H: number;
  /** the front panel on its hinge (0 shut over the body .. 1 flopped open to the left) */
  setOpen(k: number): void;
  /** the zip pulls run round (0 shut .. 1 open) */
  setZip(k: number): void;
  /** the luggage tag's text */
  /** the luggage tag: its lines, and (round 17) the load as a gauge, 0..1 of the rating */
  setTag(lines: string[], gauge?: number): void;
  /** the parts a hand reaches for (pack-local) */
  pull: THREE.Object3D; lidEdge: THREE.Object3D; handle: THREE.Object3D;
  /** pointer targets: the lid (tap to close), the haul handle */
  lidHit: THREE.Object3D;
  lamp: THREE.PointLight;
}

export function buildFieldPack(): FieldPack {
  const root = new THREE.Group();
  root.name = 'fieldPack';
  const W = 0.46, L = 0.64, H = 0.2, R = 0.075, T = 0.024, BACK = 0.034;
  // back panel on the floor: padded, a size bigger
  const back = new THREE.Mesh(slab(W + 0.03, L + 0.03, BACK, R + 0.01, 0.012), mat('pad'));
  back.castShadow = back.receiveShadow = true;
  root.add(back);
  // the body walls (the pack lies on its back: these were its sides)
  const walls = new THREE.Mesh(ringWall(W, L, R, T, H - BACK), mat('nylon'));
  walls.position.y = BACK;
  walls.castShadow = walls.receiveShadow = true;
  root.add(walls);
  // the lining: inside of the walls and the floor of the compartment, Meridian amber
  const lin = new THREE.Mesh(ringWall(W - T * 2 + 0.002, L - T * 2 + 0.002, R - T, 0.004, H - BACK - 0.006), mat('lining'));
  lin.position.y = BACK + 0.002;
  root.add(lin);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(W - T * 2, L - T * 2, R - T), 4), mat('lining'));
  floor.geometry.rotateX(-Math.PI / 2); scaleUV(floor.geometry, 3);
  floor.position.y = BACK + 0.003;
  floor.receiveShadow = true;
  root.add(floor);
  // a divider sleeve along the far end (a compartment for flat things)
  const sleeve = box(W - T * 2 - 0.02, 0.12, 0.012, mat('nylonDk'), 0, BACK + 0.06, -L / 2 + T + 0.07);
  root.add(sleeve);
  const sleeveTop = box(W - T * 2 - 0.02, 0.008, 0.016, mat('web'), 0, BACK + 0.123, -L / 2 + T + 0.07);
  root.add(sleeveTop);
  // the zip track round the rim and the piping
  const zipT = new THREE.Mesh(rimTube(W - 0.004, L - 0.004, R, 0.0065), mat('zip'));
  zipT.position.y = H + 0.002;
  root.add(zipT);
  // two zip pulls (they ride round the rim as it opens)
  const mkPull = () => {
    const g = new THREE.Group();
    g.add(box(0.018, 0.008, 0.026, mat('metal'), 0, 0.006, 0.008));
    const cord = box(0.006, 0.006, 0.04, mat('amber'), 0, 0.004, 0.036); cord.rotation.x = 0.3; g.add(cord);
    g.add(box(0.012, 0.012, 0.016, mat('plastic'), 0, 0.0, 0.058));
    return g;
  };
  const pullA = mkPull(), pullB = mkPull();
  root.add(pullA, pullB);
  // shoulder straps out from under the far end, hip-belt wings either side of the near end
  for (const s of [-1, 1]) {
    root.add(strap([[s * 0.1, 0.012, -L / 2 + 0.06], [s * 0.2, 0.014, -L / 2 - 0.04], [s * 0.3, 0.012, -L / 2 + 0.05], [s * 0.34, 0.012, -0.05], [s * 0.3, 0.012, L / 2 - 0.16], [s * 0.22, 0.012, L / 2 - 0.08]], 0.07, 0.022, mat('nylonDk')));
    root.add(strap([[s * 0.12, 0.01, L / 2 - 0.1], [s * 0.3, 0.012, L / 2 - 0.06], [s * 0.4, 0.01, L / 2 - 0.02]], 0.1, 0.024, mat('pad')));
    // load lifters / webbing with buckles on the walls
    for (const z of [-0.14, 0.12]) {
      const web = box(0.006, H - BACK - 0.02, 0.028, mat('web'), s * (W / 2 + 0.003), BACK + (H - BACK) / 2, z);
      root.add(web);
      const buckle = box(0.012, 0.03, 0.036, mat('plastic'), s * (W / 2 + 0.008), BACK + (H - BACK) * 0.55, z);
      root.add(buckle);
    }
    // the hip belt's buckle half
    root.add(box(0.04, 0.014, 0.05, mat('plastic'), s * 0.42, 0.016, L / 2 - 0.02));
  }
  // stretch bottle pocket on the right wall
  const bottle = new THREE.Mesh(slab(0.06, 0.2, H - BACK - 0.03, 0.025, 0.01), mat('mesh'));
  bottle.position.set(W / 2 + 0.028, BACK, 0.1);
  bottle.rotation.z = 0;
  root.add(bottle);
  // the haul loop at the top end and the luggage tag on it
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 14, Math.PI), mat('web'));
  handle.rotation.y = Math.PI / 2;
  handle.position.set(0, H - 0.02, -L / 2 - 0.004);
  handle.rotation.z = 0;
  const hg = new THREE.Group(); hg.add(handle); hg.position.set(0, 0, 0);
  handle.rotation.set(0, 0, 0); handle.position.set(0, H * 0.55, -L / 2 - 0.01); handle.rotation.x = -Math.PI / 2 + 0.25;
  root.add(hg);
  const tagC = document.createElement('canvas'); tagC.width = 96; tagC.height = 64;
  const tagT = new THREE.CanvasTexture(tagC); tagT.colorSpace = THREE.SRGBColorSpace; tagT.magFilter = THREE.NearestFilter;
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.0733), new THREE.MeshStandardMaterial({ map: tagT, roughness: 0.9, side: THREE.DoubleSide }));
  tag.rotation.x = -Math.PI / 2 + 0.18; tag.rotation.z = 0.22;
  tag.position.set(0.1, 0.012, -L / 2 - 0.1);
  root.add(tag);
  const tagCord = box(0.004, 0.003, 0.08, mat('amber'), 0.05, 0.02, -L / 2 - 0.05); tagCord.rotation.y = -0.6; root.add(tagCord);
  const setTag = (lines: string[], gauge?: number) => {
    const x = tagC.getContext('2d')!;
    x.fillStyle = '#d8c89a'; x.fillRect(0, 0, 96, 64);
    x.fillStyle = '#b8281c'; x.fillRect(0, 0, 96, 9);
    x.fillStyle = '#fff3d8'; x.font = 'bold 8px monospace'; x.fillText('MERIDIAN · FIELD PACK', 4, 7);
    x.fillStyle = '#3a2a14';
    if (gauge === undefined) lines.slice(0, 5).forEach((l, i) => { x.font = (i === 1 ? 'bold 11px' : '8px') + ' monospace'; x.fillText(l, 5, 21 + i * 10 + (i > 1 ? 2 : 0)); });
    else {
      // round 17: the unit's number, then the load as a gauge (ten cells, amber then red as it nears the rating), the kilos under it
      x.font = '8px monospace'; x.fillText(lines[0] ?? '', 5, 19);
      const k = Math.max(0, Math.min(1.2, gauge));
      x.fillStyle = '#3a2a14'; x.fillRect(4, 24, 80, 12);
      for (let i = 0; i < 10; i++) {
        const on = k * 10 > i + 0.15;
        x.fillStyle = on ? (i >= 9 || k > 1 ? '#c8281c' : i >= 7 ? '#d88a1c' : '#4a8a3a') : '#6a5a3a';
        x.fillRect(6 + i * 8, 26, 6, 8);
      }
      x.fillStyle = '#3a2a14'; x.font = 'bold 11px monospace'; x.fillText(lines[1] ?? '', 5, 49);
      x.font = '8px monospace'; x.fillText(lines[2] ?? '', 5, 59);
    }
    x.fillStyle = '#5a4a2a'; x.beginPath(); x.arc(88, 34, 3, 0, Math.PI * 2); x.fill();
    tagT.needsUpdate = true;
  };
  setTag(['', '', '']);
  // ---- the front panel on its hinge along the left long edge
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, H, 0);
  root.add(hinge);
  const lid = new THREE.Group();
  lid.position.set(W / 2, 0, 0);
  hinge.add(lid);
  const LT = 0.045;
  const lidShell = new THREE.Mesh(slab(W + 0.006, L + 0.006, LT, R, 0.012), mat('nylon'));
  lidShell.castShadow = true;
  lid.add(lidShell);
  // outside (up while shut): the front pocket with its zip, the logo patch, a reflective band, compression straps
  const fp = new THREE.Mesh(slab(W - 0.1, L * 0.42, 0.04, 0.05, 0.012), mat('nylon'));
  fp.position.set(0, LT - 0.004, L * 0.17);
  lid.add(fp);
  const fpZip = box(W - 0.13, 0.004, 0.006, mat('zip'), 0, LT + 0.037, L * 0.17 - L * 0.21 + 0.02);
  lid.add(fpZip);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), mat('patch'));
  patch.rotation.x = -Math.PI / 2; patch.position.set(0, LT + 0.0375, L * 0.2);
  lid.add(patch);
  lid.add(box(W - 0.02, 0.003, 0.018, mat('reflect'), 0, LT + 0.001, -L * 0.18));
  for (const s of [-1, 1]) {
    lid.add(box(0.03, 0.006, L - 0.06, mat('web'), s * (W / 2 - 0.06), LT + 0.002, 0));
    lid.add(box(0.04, 0.012, 0.03, mat('plastic'), s * (W / 2 - 0.06), LT + 0.008, -L * 0.3));
  }
  // inside (up once it is open): the organiser
  const inside = new THREE.Group();
  inside.rotation.z = Math.PI; // the panel's inner face
  lid.add(inside);
  const org = new THREE.Mesh(slab(W - 0.06, L * 0.36, 0.022, 0.03, 0.006), mat('mesh'));
  org.position.set(0, 0.0, -L * 0.2);
  inside.add(org);
  const orgTop = box(W - 0.06, 0.006, 0.014, mat('web'), 0, 0.02, -L * 0.2 - L * 0.18);
  inside.add(orgTop);
  const zp = new THREE.Mesh(slab(W - 0.06, L * 0.3, 0.016, 0.03, 0.006), mat('nylonDk'));
  zp.position.set(0, 0.0, L * 0.18);
  inside.add(zp);
  inside.add(box(W - 0.09, 0.004, 0.006, mat('zip'), 0, 0.017, L * 0.18 - L * 0.12));
  // pen loops
  for (let i = 0; i < 4; i++) inside.add(box(0.016, 0.012, 0.05, mat('web'), -0.12 + i * 0.03, 0.01, L * 0.02));
  const lidEdge = new THREE.Object3D(); lidEdge.position.set(W / 2 - 0.02, LT, 0); lid.add(lidEdge);
  // the fabric fold between the rim and the opened panel
  const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, L - 0.08, 10, 1, true, 0, Math.PI), mat('nylonDk'));
  fold.rotation.x = Math.PI / 2; fold.rotation.y = Math.PI / 2;
  fold.position.set(-W / 2 - 0.0, H * 0.55, 0);
  fold.scale.set(1, 1, 1);
  root.add(fold);
  // a clip-on lamp on the far rim lights the inside
  const lampG = new THREE.Group();
  lampG.add(box(0.03, 0.02, 0.03, mat('plastic'), 0, 0, 0));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.009, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
  lens.position.set(0, -0.004, 0.0152); lampG.add(lens);
  lampG.position.set(W / 2 - 0.07, H + 0.012, -L / 2 + 0.02);
  root.add(lampG);
  const lamp = new THREE.PointLight(0xffe2b0, 0, 0.9, 1.6);
  lamp.position.set(W / 2 - 0.08, H + 0.08, -L / 2 + 0.06);
  root.add(lamp);
  const inner = { min: new THREE.Vector3(-W / 2 + T + 0.004, BACK + 0.004, -L / 2 + T + 0.004), max: new THREE.Vector3(W / 2 - T - 0.004, H + 0.4, L / 2 - T - 0.004) };
  const ptsRim = roundRect(W - 0.004, L - 0.004, R).getPoints(16).map((p) => new THREE.Vector3(p.x, H + 0.006, -p.y));
  const rimCurve = new THREE.CatmullRomCurve3(ptsRim, true);
  // the zips start together at the hinge's near corner and run apart round the three free sides
  const setZip = (k: number) => {
    const u0 = 0.62; // the near-left corner on the curve
    const span = 0.5 * Math.max(0, Math.min(1, k));
    const a = rimCurve.getPointAt(((u0 + span) % 1 + 1) % 1), b = rimCurve.getPointAt(((u0 - span) % 1 + 1) % 1);
    pullA.position.copy(a); pullB.position.copy(b);
    pullA.rotation.y = Math.atan2(a.x, a.z); pullB.rotation.y = Math.atan2(b.x, b.z);
  };
  const setOpen = (k: number) => {
    const e = Math.max(0, Math.min(1, k));
    // over the hinge to the left, sagging down to lie on the floor as it goes past upright
    hinge.rotation.z = e * Math.PI;
    const sag = Math.max(0, e - 0.5) * 2;
    hinge.position.set(-W / 2 - sag * 0.05, H - sag * (H - LT - 0.004), 0);
    fold.visible = e > 0.35;
    fold.scale.set(1, 0.4 + sag * 0.6, 1);
    lamp.intensity = e * 0.9;
  };
  setOpen(0); setZip(0);
  return { root, inner, W, L, H, setOpen, setZip, setTag, pull: pullA, lidEdge, handle: hg, lidHit: lidShell, lamp };
}

// ================================================================ physics
/** metres per grid cell when an item's real size is laid out (src/items/grid size3) */
export const CELL = 0.07;
export interface PhysBin {
  id: string;
  frame: THREE.Object3D;
  /** interior (frame-local): x/z walls, y floor; items stay inside x/z, rest on y */
  min: THREE.Vector3; max: THREE.Vector3;
  /** how far the footprint reaches for drops (frame-local margin) */
  catchM: number;
  bodies: Body[];
}
export interface Body {
  items: Item[];
  key: string;
  obj: ItemObj;
  holder: THREE.Group;
  bin: PhysBin | null;
  /** half extents (bin-local, before yaw) */
  hx: number; hy: number; hz: number;
  pos: THREE.Vector3; vel: THREE.Vector3;
  yaw: number; yawV: number; tx: number; tz: number; txV: number; tzV: number; restTx: number; restTz: number;
  held: boolean; sleep: number;
  /** waiting for an inventory move to land (s of game time); until then the sim does not move it back */
  pendT: number;
  /** a highlight 0..1 (hover) */
  glow: number;
  /** round 17: how far it has turned on the spot under the pointer (visual only) */
  spin?: number;
}

const GRAV = 9.8;
const _a = new THREE.Vector3();

export function itemHalf(key: string): [number, number, number] {
  const s = size3(key);
  const w = Math.max(1, s[0]), l = Math.max(1, s[1]), t = Math.max(1, s[2]);
  // the real size, a little smaller than its cells (things are rarely the size of their box)
  return [Math.max(0.02, w * CELL * 0.45), Math.max(0.012, t * CELL * 0.4), Math.max(0.02, l * CELL * 0.45)];
}

export function makeBody(items: Item[]): Body {
  const it = items[0];
  const obj = makeItemObj(it.key);
  const [hx, hy, hz] = itemHalf(it.key);
  fitItemObj(obj, 0, hx * 2.1, hz * 2.1, hy * 2.1, 3);
  obj.outer.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const holder = new THREE.Group();
  holder.add(obj.outer);
  const h = (it.uid * 2654435761) >>> 0;
  return {
    items, key: it.key, obj, holder, bin: null, hx, hy, hz,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: ((h % 1000) / 1000 - 0.5) * 0.9, yawV: 0,
    tx: 0, tz: 0, txV: 0, tzV: 0, restTx: (((h >> 10) % 100) / 100 - 0.5) * 0.12, restTz: (((h >> 17) % 100) / 100 - 0.5) * 0.12,
    held: false, sleep: 0, pendT: 0, glow: 0,
  };
}

/** half extents on the bin's axes after the body's yaw */
function ext(b: Body): [number, number] {
  const c = Math.abs(Math.cos(b.yaw)), s = Math.abs(Math.sin(b.yaw));
  return [c * b.hx + s * b.hz, s * b.hx + c * b.hz];
}

export class Phys {
  bins: PhysBin[] = [];
  private acc = 0;
  /** collision sounds: (body, speed) */
  onImpact: ((b: Body, v: number) => void) | null = null;

  add(bin: PhysBin) { this.bins.push(bin); return bin; }
  /** put a body in a bin at a bin-local spot (it falls from there) */
  place(b: Body, bin: PhysBin, x: number, y: number, z: number) {
    if (b.bin && b.bin !== bin) { const i = b.bin.bodies.indexOf(b); if (i >= 0) b.bin.bodies.splice(i, 1); }
    if (!bin.bodies.includes(b)) bin.bodies.push(b);
    b.bin = bin;
    bin.frame.add(b.holder);
    b.pos.set(x, y, z);
    b.sleep = 0;
    this.sync(b);
  }
  remove(b: Body) {
    if (b.bin) { const i = b.bin.bodies.indexOf(b); if (i >= 0) b.bin.bodies.splice(i, 1); }
    b.bin = null;
    b.holder.parent?.remove(b.holder);
  }
  /** a free spot over a bin (bin-local), above whatever is there: for things arriving */
  spawnSpot(b: Body, bin: PhysBin, seed: number, out = new THREE.Vector3()): THREE.Vector3 {
    const [ex, ez] = ext(b);
    const rx = (bin.max.x - bin.min.x) / 2 - ex, rz = (bin.max.z - bin.min.z) / 2 - ez;
    const cx = (bin.max.x + bin.min.x) / 2, cz = (bin.max.z + bin.min.z) / 2;
    const fx = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1, fz = ((Math.sin(seed * 78.233) * 12543.123) % 1 + 1) % 1;
    out.set(cx + (fx * 2 - 1) * Math.max(0, rx), 0, cz + (fz * 2 - 1) * Math.max(0, rz));
    let top = bin.min.y;
    for (const o of bin.bodies) {
      if (o === b) continue;
      const [ox, oz] = ext(o);
      if (Math.abs(o.pos.x - out.x) < ox + ex && Math.abs(o.pos.z - out.z) < oz + ez) top = Math.max(top, o.pos.y + o.hy);
    }
    out.y = top + b.hy + 0.01;
    return out;
  }

  /** advance (fixed sub-steps) */
  step(dt: number) {
    this.acc = Math.min(0.1, this.acc + dt);
    const h = 1 / 120;
    while (this.acc >= h) { this.acc -= h; this.sub(h); }
    for (const bin of this.bins) for (const b of bin.bodies) this.sync(b);
  }
  /** run the sim with no time passing on screen (things already lying settled when a view opens) */
  settle(secs = 1.2) { const h = 1 / 60; for (let t = 0; t < secs; t += h) this.sub(h); for (const bin of this.bins) for (const b of bin.bodies) this.sync(b); }

  private sub(h: number) {
    for (const bin of this.bins) {
      const B = bin.bodies;
      for (const b of B) {
        if (b.held) continue;
        if (b.sleep > 0.6) continue;
        b.vel.y -= GRAV * h;
        b.pos.addScaledVector(b.vel, h);
        b.yaw += b.yawV * h; b.yawV *= Math.exp(-4 * h);
        // tumble springs back toward a resting tilt
        b.txV += (-(b.tx - b.restTx) * 140 - b.txV * 9) * h; b.tzV += (-(b.tz - b.restTz) * 140 - b.tzV * 9) * h;
        b.tx += b.txV * h; b.tz += b.tzV * h;
      }
      // contacts (a few passes)
      for (let pass = 0; pass < 3; pass++) {
        for (const b of B) {
          if (b.held) continue;
          const [ex, ez] = ext(b);
          // walls
          if (b.pos.x < bin.min.x + ex) { b.pos.x = bin.min.x + ex; if (b.vel.x < 0) b.vel.x *= -0.25; }
          if (b.pos.x > bin.max.x - ex) { b.pos.x = bin.max.x - ex; if (b.vel.x > 0) b.vel.x *= -0.25; }
          if (b.pos.z < bin.min.z + ez) { b.pos.z = bin.min.z + ez; if (b.vel.z < 0) b.vel.z *= -0.25; }
          if (b.pos.z > bin.max.z - ez) { b.pos.z = bin.max.z - ez; if (b.vel.z > 0) b.vel.z *= -0.25; }
          // floor
          if (b.pos.y < bin.min.y + b.hy) {
            b.pos.y = bin.min.y + b.hy;
            if (b.vel.y < 0) { this.landed(b, -b.vel.y); b.vel.y *= -0.22; if (Math.abs(b.vel.y) < 0.25) b.vel.y = 0; }
            b.vel.x *= 0.86; b.vel.z *= 0.86;
          }
        }
        // body against body: push apart along the shallowest axis (stacking when it is the vertical)
        for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
          const a = B[i], c = B[j];
          if (a.held || c.held) continue;
          const [ax, az] = ext(a), [cx, cz] = ext(c);
          const ox = ax + cx - Math.abs(a.pos.x - c.pos.x); if (ox <= 0) continue;
          const oz = az + cz - Math.abs(a.pos.z - c.pos.z); if (oz <= 0) continue;
          const oy = a.hy + c.hy - Math.abs(a.pos.y - c.pos.y); if (oy <= 0) continue;
          const asleep = a.sleep > 0.6, csleep = c.sleep > 0.6;
          if (oy < Math.min(ox, oz) * 1.2) {
            // vertical: the upper one rests on the lower one
            const up = a.pos.y > c.pos.y ? a : c, dn = up === a ? c : a;
            const k = dn.sleep > 0.6 || dn.pos.y - dn.hy <= bin.min.y + 0.001 ? 1 : 0.6;
            up.pos.y += oy * k; dn.pos.y -= oy * (1 - k);
            if (up.vel.y < dn.vel.y) { const rv = dn.vel.y - up.vel.y; this.landed(up, rv); up.vel.y = dn.vel.y + rv * 0.15; if (Math.abs(up.vel.y) < 0.2) up.vel.y = 0; }
            up.vel.x *= 0.88; up.vel.z *= 0.88;
            // resting off-centre on something: it tips toward the overhang a little
            const dxo = (up.pos.x - dn.pos.x) / (ax + cx), dzo = (up.pos.z - dn.pos.z) / (az + cz);
            up.restTz = Math.max(-0.25, Math.min(0.25, -dxo * 0.18)); up.restTx = Math.max(-0.25, Math.min(0.25, dzo * 0.18));
            if (up.sleep > 0.6 && !(dn.sleep > 0.6)) up.sleep = 0;
          } else if (ox < oz) {
            const s = Math.sign(a.pos.x - c.pos.x) || 1;
            const ka = asleep && !csleep ? 0 : csleep && !asleep ? 1 : 0.5;
            a.pos.x += s * ox * ka; c.pos.x -= s * ox * (1 - ka);
            const rv = a.vel.x - c.vel.x; if (rv * s < 0) { a.vel.x -= rv * 0.5; c.vel.x += rv * 0.5; }
            a.yawV += s * 0.6; c.yawV -= s * 0.6;
          } else {
            const s = Math.sign(a.pos.z - c.pos.z) || 1;
            const ka = asleep && !csleep ? 0 : csleep && !asleep ? 1 : 0.5;
            a.pos.z += s * oz * ka; c.pos.z -= s * oz * (1 - ka);
            const rv = a.vel.z - c.vel.z; if (rv * s < 0) { a.vel.z -= rv * 0.5; c.vel.z += rv * 0.5; }
            a.yawV -= s * 0.6; c.yawV += s * 0.6;
          }
        }
      }
      for (const b of B) {
        if (b.held) { b.sleep = 0; continue; }
        const sp = b.vel.length() + Math.abs(b.yawV) * 0.05 + Math.abs(b.txV) * 0.02 + Math.abs(b.tzV) * 0.02;
        b.sleep = sp < 0.03 ? b.sleep + h : 0;
        if (b.sleep > 0.6) { b.vel.set(0, 0, 0); b.yawV = 0; }
      }
    }
  }
  private landed(b: Body, v: number) {
    if (v > 0.6) {
      // a knock: it tumbles a little, the sound by how hard
      b.txV += (Math.random() - 0.5) * v * 6; b.tzV += (Math.random() - 0.5) * v * 6; b.yawV += (Math.random() - 0.5) * v * 2;
      this.onImpact?.(b, v);
    }
  }
  /** a held body follows a target (frame-local of its current parent) on a critically damped spring and swings with its speed */
  drive(b: Body, target: THREE.Vector3, dt: number) {
    const k = 1 - Math.exp(-16 * dt);
    _a.copy(b.pos);
    b.pos.lerp(target, k);
    const vx = (b.pos.x - _a.x) / Math.max(1e-3, dt), vy = (b.pos.y - _a.y) / Math.max(1e-3, dt), vz = (b.pos.z - _a.z) / Math.max(1e-3, dt);
    b.vel.set(vx, vy, vz);
    // swing: the item lags behind the hand (tilts against the motion)
    const tz = Math.max(-0.5, Math.min(0.5, -vx * 0.14)), tx = Math.max(-0.5, Math.min(0.5, vz * 0.14));
    b.tx += (tx - b.tx) * (1 - Math.exp(-10 * dt)); b.tz += (tz - b.tz) * (1 - Math.exp(-10 * dt));
    b.txV = 0; b.tzV = 0;
    this.sync(b);
  }
  sync(b: Body) {
    b.holder.position.copy(b.pos);
    // round 17: the thing under the pointer lifts a little and turns on the spot (b.spin, src/ui/inventory.ts)
    b.holder.position.y += b.glow * Math.max(0.012, b.hy * 0.6);
    b.holder.rotation.set(b.tx, b.yaw + (b.spin ?? 0), b.tz, 'YXZ');
    const s = 1 + b.glow * 0.1;
    b.holder.scale.setScalar(s);
  }
  /** the bin whose footprint (with its catch margin) a world point is over, if any */
  binAt(world: THREE.Vector3, skip?: PhysBin | null): PhysBin | null {
    let best: PhysBin | null = null, bd = Infinity;
    for (const bin of this.bins) {
      if (bin === skip || !bin.frame.visible) continue;
      bin.frame.updateWorldMatrix(true, false);
      _a.copy(world); bin.frame.worldToLocal(_a);
      const m = bin.catchM;
      if (_a.x < bin.min.x - m || _a.x > bin.max.x + m || _a.z < bin.min.z - m || _a.z > bin.max.z + m) continue;
      const d = Math.hypot(_a.x - (bin.min.x + bin.max.x) / 2, _a.z - (bin.min.z + bin.max.z) / 2);
      if (d < bd) { bd = d; best = bin; }
    }
    return best;
  }
}

// ================================================================ small trays round the pack
/** your pockets, turned out into an open canvas pouch; the tool roll unrolled flat with its loops */
export function buildTray(kind: 'pouch' | 'roll', w: number, l: number): { root: THREE.Group; inner: { min: THREE.Vector3; max: THREE.Vector3 } } {
  const root = new THREE.Group();
  if (kind === 'pouch') {
    const base = new THREE.Mesh(slab(w, l, 0.012, 0.03, 0.005), mat('nylonDk'));
    base.receiveShadow = true;
    root.add(base);
    const wall = new THREE.Mesh(ringWall(w, l, 0.03, 0.01, 0.045), mat('nylon'));
    wall.position.y = 0.01;
    root.add(wall);
    const pipe = new THREE.Mesh(rimTube(w - 0.002, l - 0.002, 0.03, 0.004), mat('amber'));
    pipe.position.y = 0.058;
    root.add(pipe);
    // a belt loop and a snap on the near side
    root.add(box(0.05, 0.03, 0.008, mat('web'), 0, 0.03, l / 2 + 0.004));
    root.add(box(0.016, 0.016, 0.006, mat('metal'), 0, 0.035, l / 2 + 0.01));
    return { root, inner: { min: new THREE.Vector3(-w / 2 + 0.012, 0.013, -l / 2 + 0.012), max: new THREE.Vector3(w / 2 - 0.012, 0.3, l / 2 - 0.012) } };
  }
  // the tool roll: waxed canvas unrolled, a row of elastic loops, the tie strings
  const canvas = new THREE.MeshStandardMaterial({ map: ripstop('#8a7448', '#6e5a34', '#9c8658'), roughness: 0.95 });
  const mat0 = new THREE.Mesh(slab(w, l, 0.008, 0.012, 0.003), canvas);
  mat0.receiveShadow = true;
  root.add(mat0);
  const rolled = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, l * 0.96, 10), canvas);
  rolled.rotation.x = Math.PI / 2; rolled.position.set(w / 2 + 0.02, 0.03, 0);
  root.add(rolled);
  for (let i = 0; i < 6; i++) root.add(box(w * 0.8, 0.006, 0.014, mat('web'), 0, 0.011, -l / 2 + 0.05 + i * (l - 0.1) / 5));
  for (const s of [-1, 1]) root.add(strap([[w / 2 + 0.03, 0.03, s * 0.05], [w / 2 + 0.1, 0.006, s * 0.12], [w / 2 + 0.16, 0.004, s * 0.08]], 0.012, 0.004, mat('web')));
  return { root, inner: { min: new THREE.Vector3(-w / 2 + 0.01, 0.009, -l / 2 + 0.01), max: new THREE.Vector3(w / 2 - 0.01, 0.3, l / 2 - 0.01) } };
}

// SURGICAL THEATRE No.3, the room: a dark tiled theatre with a terrazzo floor
// and a drain, peeling plaster, lagged pipes and cable trays, an observation
// window with watchers behind the glass, a flickering tube, a vitals cart, an
// oxygen bank, a specimen cabinet, a steam vent; the operating table on its
// bellows column with a segmented vinyl pad, side rails and leather straps; the
// six-pod surgical lamp on its ceiling arm (pods switch on one by one, haze
// shafts hang under it, dust turns in the light); and the ceiling gantry that
// carries the subject in on a spreader bar and slings. Everything faceted,
// pixel-textured and merged per material (geo.ts).
import * as THREE from 'three';
import { Kit, prep, cbox, tbox, prism, lathe, ccyl, ccylX, ccylZ, hexHead, gem, ngon, tube, jitter, LiveHose, type P2 } from './geo';
import type { Mats } from './pix';

export const TABLE_Y = 0.92;
export const TABLE_HALF_X = 1.08, TABLE_HALF_Z = 0.33;
export const BACK_Z = -2.4, CEIL_Y = 3.1, BEAM_Y = 2.98;
export const LAMP_POS = new THREE.Vector3(0.0, 2.38, 0.02);
export const TRAY_POS = new THREE.Vector3(1.62, 0.86, 0.42);
export const HATCH_POS = new THREE.Vector3(1.25, 1.18, -1.95);
export const VENT_POS = new THREE.Vector3(-2.2, 0.12, -2.3);

// ------------------------------------------------------------------ haze
const HAZE_VS = `
varying vec3 vW; varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const HAZE_FS = `
uniform vec3 uCol; uniform float uI; uniform float uTime; uniform float uTop; uniform float uLen;
varying vec3 vW; varying vec3 vN;
void main() {
  float t = clamp((uTop - vW.y) / uLen, 0.0, 1.0);
  float face = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
  float dust = 0.72 + 0.28 * sin(vW.x * 7.0 + uTime * 0.6) * sin(vW.z * 9.0 - uTime * 0.45 + vW.y * 3.0);
  float a = pow(face, 1.6) * smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.62, 1.0, t)) * dust * (1.0 - t * 0.35);
  gl_FragColor = vec4(uCol * uI * a, 1.0);
}`;
export function hazeMat(col: number, I: number, top: number, len: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(col) }, uI: { value: I }, uTime: { value: 0 }, uTop: { value: top }, uLen: { value: len } },
    vertexShader: HAZE_VS, fragmentShader: HAZE_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}
const MOTE_VS = `
uniform float uTime; attribute float aSeed; varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.21 + aSeed * 7.0) * 0.12; p.z += cos(uTime * 0.17 + aSeed * 5.0) * 0.12;
  p.y = 0.95 + mod(p.y - 0.95 + uTime * (0.015 + aSeed * 0.02), 1.35);
  vA = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 20.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 1.0;
}`;
const MOTE_FS = `
uniform float uI; varying float vA;
void main() { gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * uI * vA, 1.0); }`;

// ------------------------------------------------------------------ the room
export interface Room {
  group: THREE.Group;
  pods: THREE.MeshBasicMaterial[];
  haze: THREE.ShaderMaterial[];
  motes: THREE.ShaderMaterial;
  fluoro: THREE.MeshBasicMaterial;
  monitorGlow: THREE.MeshBasicMaterial;
  beacon: THREE.MeshBasicMaterial;
  watchers: THREE.Group;
  /** vitals screen canvas (drawn by the stage) */
  vitals: { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
}

export function buildRoom(M: Mats): Room {
  const group = new THREE.Group();
  const k = new Kit();
  const W = 3.4, Z0 = BACK_Z, Z1 = 3.2, H = CEIL_Y;
  // ---- floor, walls, ceiling
  k.put(M.floor, cbox(W * 2, 0.1, Z1 - Z0, 0.01), 0, -0.05, (Z0 + Z1) / 2, { tile: 1.0 });
  k.put(M.tile, cbox(W * 2, 1.5, 0.1, 0.01), 0, 0.75, Z0 - 0.05, { tile: 0.6 });
  k.put(M.plaster, cbox(W * 2, H - 1.5, 0.1, 0.01), 0, 1.5 + (H - 1.5) / 2, Z0 - 0.07, { tile: 1.2 });
  k.put(M.darksteel, cbox(W * 2, 0.06, 0.05, 0.01), 0, 1.52, Z0 + 0.01);
  k.put(M.darksteel, cbox(W * 2, 0.12, 0.04, 0.01), 0, 0.06, Z0 + 0.01);
  for (const s of [-1, 1]) {
    k.put(M.tile, cbox(0.1, 1.5, Z1 - Z0, 0.01), s * (W + 0.05), 0.75, (Z0 + Z1) / 2, { tile: 0.6 });
    k.put(M.plaster, cbox(0.1, H - 1.5, Z1 - Z0, 0.01), s * (W + 0.07), 1.5 + (H - 1.5) / 2, (Z0 + Z1) / 2, { tile: 1.2 });
    k.put(M.darksteel, cbox(0.05, 0.06, Z1 - Z0, 0.01), s * (W - 0.01), 1.52, (Z0 + Z1) / 2);
  }
  k.put(M.concrete, cbox(W * 2, 0.1, Z1 - Z0, 0.01), 0, H + 0.05, (Z0 + Z1) / 2, { tile: 1.5 });
  // ceiling joists
  for (let x = -3; x <= 3; x += 1.2) k.put(M.darksteel, prism([[-0.07, 0], [0.07, 0], [0.07, 0.02], [0.012, 0.02], [0.012, 0.16], [0.07, 0.16], [0.07, 0.18], [-0.07, 0.18], [-0.07, 0.16], [-0.012, 0.16], [-0.012, 0.02], [-0.07, 0.02]], Z1 - Z0), x, H - 0.18, (Z0 + Z1) / 2);
  // ---- the drain under the table and stains
  k.put(M.grate, cbox(0.5, 0.02, 0.5, 0.005), 0.1, 0.0, 0.05, { tile: 0.25 });
  k.put(M.darksteel, cbox(0.56, 0.015, 0.56, 0.005), 0.1, -0.002, 0.05);
  // ---- pipes along the back wall: lagged, painted, rusting, with brackets and a valve
  const pipes: [number, number, THREE.Material, number][] = [[2.62, 0.075, M.olivePlain, -2.3], [2.8, 0.05, M.rust, -2.32], [2.92, 0.06, M.steel, -2.3]];
  for (const [y, r, mat, z] of pipes) k.put(mat, ccylX(r, W * 2, 8, r * 0.2), 0, y, z, { tile: 0.4 });
  for (let x = -3; x <= 3; x += 1) k.put(M.darksteel, cbox(0.04, 0.42, 0.14, 0.008), x, 2.78, -2.32);
  k.put(M.olivePlain, ccyl(0.06, 2.6, 8, 0.01), 2.85, 0.0, -2.28, { tile: 0.4 });
  k.put(M.red, prism(ngon(8, 0.11), 0.025, 0.006), 2.85, 1.25, -2.18);
  k.put(M.steel, ccylZ(0.025, 0.12, 6), 2.85, 1.25, -2.22);
  for (let i = 0; i < 4; i++) k.put(M.darksteel, cbox(0.02, 0.2, 0.025, 0.005), 2.85, 1.25, -2.17, { rz: (i / 4) * Math.PI });
  // cable tray with bundles
  k.put(M.darksteel, prism([[-0.15, 0], [0.15, 0], [0.15, 0.06], [0.13, 0.06], [0.13, 0.015], [-0.13, 0.015], [-0.13, 0.06], [-0.15, 0.06]], W * 2 - 0.4), 0, 2.4, -2.2, { ry: Math.PI / 2 });
  for (let i = 0; i < 4; i++) k.put(i % 2 ? M.cable : M.rubber, ccylX(0.02, W * 2 - 0.5, 5), 0, 2.44, -2.28 + i * 0.045, { tile: 0.3 });
  // ---- observation window with watchers behind it
  const wx = -1.45, wy = 1.86, ww = 1.7, wh = 0.86;
  k.put(M.gunmetal, cbox(ww + 0.16, 0.08, 0.16, 0.02), wx, wy - wh / 2 - 0.04, Z0 + 0.04);
  k.put(M.gunmetal, cbox(ww + 0.16, 0.08, 0.12, 0.02), wx, wy + wh / 2 + 0.04, Z0 + 0.02);
  for (const s of [-1, 0, 1]) k.put(M.gunmetal, cbox(0.07, wh, 0.12, 0.015), wx + s * (ww / 2 + 0.04 * Math.abs(s)), wy, Z0 + 0.02);
  for (let i = 0; i < 10; i++) k.put(M.steel, hexHead(0.01, 0.012), wx - ww / 2 + i * (ww / 9), wy - wh / 2 - 0.0, Z0 + 0.12, { rx: Math.PI / 2 });
  // the booth behind
  k.put(M.concrete, cbox(ww + 0.4, wh + 0.6, 0.05, 0.01), wx, wy, Z0 - 1.2, { tile: 1.2 });
  k.put(M.darksteel, cbox(ww + 0.4, 0.05, 1.2, 0.01), wx, wy - wh / 2 - 0.1, Z0 - 0.6);
  k.put(M.darksteel, cbox(ww * 0.9, 0.35, 0.3, 0.02), wx, wy - wh / 2 + 0.05, Z0 - 0.35);
  // ---- left wall: swing doors with slot windows, a caged bulb
  for (const s of [-1, 1]) {
    k.put(M.mint, cbox(0.06, 2.1, 0.62, 0.015), -W + 0.03, 1.05, 1.0 + s * 0.32, { tile: 0.8 });
    k.put(M.glass, cbox(0.07, 0.4, 0.22, 0.01), -W + 0.035, 1.55, 1.0 + s * 0.32);
    k.put(M.steel, cbox(0.07, 0.25, 0.5, 0.01), -W + 0.035, 0.12, 1.0 + s * 0.32);
  }
  k.put(M.gunmetal, cbox(0.1, 0.1, 1.4, 0.02), -W + 0.05, 2.15, 1.0);
  // ---- the gantry beam (an I-section on hangers) and its opening in the left wall
  const ibeam: P2[] = [[-0.1, -0.11], [0.1, -0.11], [0.1, -0.085], [0.018, -0.085], [0.018, 0.085], [0.1, 0.085], [0.1, 0.11], [-0.1, 0.11], [-0.1, 0.085], [-0.018, 0.085], [-0.018, -0.085], [-0.1, -0.085]];
  k.put(M.yellow, prism(ibeam, 5.3, 0.004), -0.85, BEAM_Y, 0, { ry: Math.PI / 2, tile: 0.6 });
  for (const x of [-2.8, -1.4, 0.2, 1.4]) { k.put(M.darksteel, cbox(0.06, H - BEAM_Y - 0.1, 0.06, 0.01), x, (H + BEAM_Y + 0.1) / 2, 0); k.put(M.darksteel, cbox(0.22, 0.03, 0.22, 0.008), x, H - 0.02, 0); }
  k.put(M.hazard, cbox(0.06, 0.24, 0.24, 0.01), 1.6, BEAM_Y, 0);
  k.put(K0(M), cbox(0.06, 0.5, 0.5, 0.01), -W - 0.01, BEAM_Y - 0.1, 0);
  // ---- the vitals cart (right, behind the table): a green CRT, knobs, a drawer
  const vx = 2.05, vz = -0.75;
  k.put(M.chrome, ccyl(0.025, 1.0, 6), vx, 0.06, vz);
  k.put(M.darksteel, prism(ngon(5, 0.28, 0.3), 0.04, 0.006), vx, 0.06, vz, { rx: -Math.PI / 2 });
  k.put(M.cream, cbox(0.62, 0.48, 0.48, 0.06), vx, 1.3, vz, { ry: -0.5 });
  k.put(M.cream, tbox(0.5, 0.3, 0.38, 0.36, 0.26, 0.04), vx + Math.sin(-0.5) * -0.32, 1.3, vz - Math.cos(-0.5) * 0.32, { ry: -0.5, rx: Math.PI / 2 });
  k.put(M.gunmetal, cbox(0.5, 0.06, 0.4, 0.01), vx, 1.03, vz, { ry: -0.5 });
  for (const s of [-1, 1]) k.put(M.bakelite, ccylZ(0.025, 0.03, 6), vx + Math.cos(-0.5) * s * 0.21 + Math.sin(-0.5) * 0.25, 1.12, vz - Math.sin(-0.5) * s * 0.21 + Math.cos(-0.5) * 0.25, { ry: -0.5 });
  // ---- oxygen bank: three green cylinders chained to the wall
  for (let i = 0; i < 3; i++) {
    const x = 2.75 + i * 0.2, z = -1.95;
    k.put(M.mint, lathe([[0, 0], [0.085, 0], [0.09, 0.03], [0.09, 1.15], [0.07, 1.25], [0.03, 1.3], [0, 1.3]], 8), x, 0, z, { tile: 0.4, tint: i === 1 ? 0xc0c0a0 : 0xffffff });
    k.put(M.brass, ccyl(0.025, 0.12, 6), x, 1.3, z);
    k.put(M.chrome, ccylZ(0.012, 0.08, 5), x, 1.38, z + 0.04);
  }
  k.put(M.darksteel, cbox(0.75, 0.03, 0.05, 0.01), 2.95, 0.95, -2.03);
  // ---- specimen cabinet (left back): glass doors, jars inside
  const cx = -2.85, cz = -1.6;
  k.put(M.cream, cbox(0.62, 1.9, 0.42, 0.03), cx, 0.95, cz, { tile: 0.8 });
  k.put(M.darksteel, cbox(0.56, 1.7, 0.38, 0.02), cx + 0.03, 1.0, cz);
  for (let s = 0; s < 3; s++) {
    k.put(M.steel, cbox(0.5, 0.02, 0.34, 0.005), cx + 0.03, 0.42 + s * 0.52, cz);
    for (let j = 0; j < 3; j++) {
      const jx = cx + 0.03, jz = cz - 0.12 + j * 0.12, jy = 0.43 + s * 0.52;
      k.put(M.jar, lathe([[0, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.17], [0.035, 0.2], [0, 0.2]], 7), jx, jy, jz, { tile: 0.2 });
      k.put(M.bakelite, ccyl(0.04, 0.03, 7), jx, jy + 0.2, jz);
      k.put(M.label, cbox(0.005, 0.05, 0.06, 0.002), jx + 0.05, jy + 0.09, jz);
    }
  }
  k.put(M.glass, cbox(0.02, 1.6, 0.4, 0.005), cx + 0.31, 1.0, cz);
  // ---- instrument trolley with the kidney tray (foot of the table)
  const T = TRAY_POS;
  k.put(M.chrome, ccyl(0.02, T.y - 0.05, 6), T.x, 0.06, T.z);
  k.put(M.darksteel, prism([[-0.2, -0.18], [0.2, -0.18], [0.24, 0], [0.2, 0.18], [-0.2, 0.18], [-0.24, 0]], 0.03, 0.006), T.x, 0.06, T.z, { rx: -Math.PI / 2 });
  // the tray: a faceted steel dish with a rolled lip
  k.put(M.steel, prism([[-0.3, -0.16], [0.3, -0.16], [0.36, -0.08], [0.36, 0.08], [0.3, 0.16], [-0.3, 0.16], [-0.36, 0.08], [-0.36, -0.08]], 0.02, 0.004), T.x, T.y - 0.04, T.z, { rx: -Math.PI / 2 });
  const lip: [number, number, number, number, number][] = [[0, -0.17, 0.62, 0.02, 0], [0, 0.17, 0.62, 0.02, 0], [-0.37, 0, 0.02, 0.2, 0], [0.37, 0, 0.02, 0.2, 0]];
  for (const [x, z, w, d] of lip) k.put(M.chrome, cbox(w, 0.06, d, 0.006), T.x + x, T.y - 0.01, T.z + z);
  // instruments on a towel by the tray
  k.put(M.drape, cbox(0.3, 0.01, 0.2, 0.004), T.x - 0.05, T.y + 0.025, T.z + 0.32, { tile: 0.3 });
  k.put(M.darksteel, cbox(0.05, 0.02, 0.36, 0.006), T.x - 0.05, T.y + 0.0, T.z + 0.32);
  k.put(M.chrome, ccyl(0.012, T.y - 0.05, 5), T.x - 0.05, 0.06, T.z + 0.32);
  for (let i = 0; i < 4; i++) k.put(i % 2 ? M.chrome : M.steel, cbox(0.18, 0.008, 0.012, 0.003), T.x - 0.05, T.y + 0.035, T.z + 0.25 + i * 0.045, { ry: (i - 1.5) * 0.08 });
  // ---- parts hatch on the back wall (the orderly fetches hardware from it)
  const hp = HATCH_POS;
  k.put(M.gunmetal, cbox(0.6, 0.5, 0.12, 0.03), hp.x, hp.y, Z0 + 0.06);
  k.put(K0(M), cbox(0.46, 0.36, 0.06, 0.01), hp.x, hp.y, Z0 + 0.1);
  k.put(M.hazard, cbox(0.62, 0.05, 0.13, 0.01), hp.x, hp.y - 0.27, Z0 + 0.06);
  k.put(M.hazard, cbox(0.62, 0.05, 0.13, 0.01), hp.x, hp.y + 0.27, Z0 + 0.06);
  // ---- steam vent low on the back wall
  k.put(M.vent, cbox(0.5, 0.26, 0.05, 0.01), VENT_POS.x, 0.25, Z0 + 0.02, { tile: 0.2 });
  k.put(M.darksteel, cbox(0.56, 0.32, 0.03, 0.01), VENT_POS.x, 0.25, Z0 + 0.0);
  // ---- floor clutter: a coiled hose, a bucket, a stool
  k.add(M.rubber, tube([new THREE.Vector3(-2.9, 0.03, -0.4), new THREE.Vector3(-2.4, 0.03, -0.2), new THREE.Vector3(-2.2, 0.03, 0.2), new THREE.Vector3(-2.6, 0.03, 0.45), new THREE.Vector3(-2.9, 0.03, 0.1), new THREE.Vector3(-2.55, 0.03, -0.1), new THREE.Vector3(-2.0, 0.03, -0.6), new THREE.Vector3(-1.4, 0.03, -1.2)], 0.025, 5, 40), { uv: [12, 1] });
  k.put(M.steel, lathe([[0, 0], [0.13, 0], [0.16, 0.3], [0.17, 0.32], [0, 0.32]], 7), 2.6, 0, 0.9);
  k.put(M.flesh, prism(ngon(7, 0.15), 0.01), 2.6, 0.27, 0.9, { rx: -Math.PI / 2 });
  group.add(k.group());

  // ---- the operating table
  group.add(buildTable(M));
  // ---- the surgical lamp
  const lamp = buildLamp(M);
  group.add(lamp.group);
  // ---- glowing practicals (unlit)
  const fluoro = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8ffe8).multiplyScalar(2.6), toneMapped: false });
  const fk = new Kit();
  fk.put(M.gunmetal, cbox(1.3, 0.08, 0.14, 0.02), 1.15, 2.26, Z0 + 0.08);
  fk.put(fluoro, ccylX(0.018, 1.2, 6), 1.15, 2.215, Z0 + 0.1);
  for (let i = 0; i < 6; i++) fk.put(M.darksteel, cbox(0.008, 0.05, 0.12, 0.002), 0.6 + i * 0.22, 2.2, Z0 + 0.1);
  group.add(fk.group(false, false));
  const monitorGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60ff98).multiplyScalar(1.6), toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3010).multiplyScalar(0.3), toneMapped: false });
  const gk = new Kit();
  gk.put(M.gunmetal, cbox(0.12, 0.08, 0.1, 0.02), -0.4, 2.62, Z0 + 0.06);
  gk.put(beacon, prism(ngon(8, 0.045, Math.PI / 8), 0.09, 0.008), -0.4, 2.7, Z0 + 0.08, { rx: Math.PI / 2 });
  gk.put(M.glow(0xffb060, 2.4), gem(0.035, 0.05, 0.035), -W + 0.12, 2.15, 1.0);
  for (let i = 0; i < 4; i++) gk.put(M.darksteel, cbox(0.006, 0.12, 0.006, 0.002), -W + 0.12 + Math.cos(i * 1.57) * 0.045, 2.15, 1.0 + Math.sin(i * 1.57) * 0.045);
  for (let s = 0; s < 3; s++) gk.put(M.glow(0x50ff70, 0.45), cbox(0.4, 0.008, 0.3, 0.002), cx + 0.03, 0.4 + s * 0.52, cz);
  gk.put(M.glow(0xff4020, 1.5), cbox(0.035, 0.02, 0.02, 0.005), hp.x + 0.22, hp.y + 0.2, Z0 + 0.13);
  group.add(gk.group(false, false));
  // the vitals screen (a canvas drawn by the stage)
  const cv = document.createElement('canvas'); cv.width = 48; cv.height = 34;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#020a05'; ctx.fillRect(0, 0, 48, 34);
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.29), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false }));
  scr.position.set(vx + Math.sin(-0.5) * 0.245, 1.32, vz + Math.cos(-0.5) * 0.245); scr.rotation.y = -0.5;
  group.add(scr);
  // the watchers behind the glass: dark faceted head-and-shoulders, a dim red room light
  const watchers = new THREE.Group();
  const wk = new Kit();
  const silo = new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 1, flatShading: true });
  for (const [x, h] of [[-2.0, 1.0], [-1.35, 1.06], [-0.85, 0.96]] as const) {
    wk.put(silo, tbox(0.42, 0.5, 0.24, 0.3, 0.2, 0.06), x, wy - 0.32 + (h - 1) * 0.3, Z0 - 0.75);
    wk.put(silo, jitter(gem(0.1, 0.13, 0.11, 1), 0.012, x * 10), x, wy + 0.06 + (h - 1) * 0.3, Z0 - 0.75);
  }
  watchers.add(wk.group(false, false));
  const booth = new THREE.PointLight(0xff4030, 1.4, 2.6, 2); booth.position.set(wx, wy + 0.5, Z0 - 0.45);
  watchers.add(booth);
  group.add(watchers);
  const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ color: 0x0a1614, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false }));
  glassPane.position.set(wx, wy, Z0 + 0.03);
  group.add(glassPane);
  // haze under the lamp: a broad cone and six narrow shafts, plus dust
  const haze: THREE.ShaderMaterial[] = [];
  const top = LAMP_POS.y - 0.08, len = top - 0.6;
  const big = hazeMat(0xffe8c8, 0.11, top, len);
  const cone = new THREE.Mesh(lathe([[0.42, 0], [1.05, -len]], 10), big);
  cone.position.copy(LAMP_POS); cone.position.y = top; cone.renderOrder = 5;
  group.add(cone); haze.push(big);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const m = hazeMat(0xfff0d8, 0.07, top, len);
    const shaft = new THREE.Mesh(lathe([[0.09, 0], [0.2, -len * 0.95]], 6), m);
    shaft.position.set(LAMP_POS.x + Math.cos(a) * 0.32, top, LAMP_POS.z + Math.sin(a) * 0.32);
    shaft.rotation.set(Math.sin(a) * -0.2, 0, Math.cos(a) * 0.2);
    shaft.renderOrder = 5;
    group.add(shaft); haze.push(m);
  }
  const N = 160, mp = new Float32Array(N * 3), ms = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.8; mp[i * 3] = LAMP_POS.x + Math.cos(a) * r; mp[i * 3 + 1] = 0.95 + Math.random() * 1.35; mp[i * 3 + 2] = LAMP_POS.z + Math.sin(a) * r; ms[i] = Math.random(); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
  const motes = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uI: { value: 0.9 } }, vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pts = new THREE.Points(mg, motes); pts.frustumCulled = false; pts.renderOrder = 6;
  group.add(pts);
  return { group, pods: lamp.pods, haze, motes, fluoro, monitorGlow, beacon, watchers, vitals: { cv, ctx, tex } };
}
/** near-black recess */
function K0(M: Mats) { return M.glow(0x050505, 1); }

// ------------------------------------------------------------------ the table
function buildTable(M: Mats): THREE.Group {
  const k = new Kit();
  const Y = TABLE_Y;
  // base plate, pedals, bellows column, head unit
  k.put(M.darksteel, prism([[-0.42, -0.3], [0.42, -0.3], [0.5, -0.2], [0.5, 0.2], [0.42, 0.3], [-0.42, 0.3], [-0.5, 0.2], [-0.5, -0.2]], 0.06, 0.01), 0.05, 0.035, 0, { rx: -Math.PI / 2 });
  k.put(M.hazard, cbox(0.08, 0.02, 0.6, 0.004), 0.5, 0.07, 0);
  for (const z of [-0.12, 0.12]) k.put(M.steel, tbox(0.14, 0.03, 0.08, 0.12, 0.06, 0.01), 0.58, 0.04, z);
  const bel: P2[] = [[0, 0.1]];
  for (let i = 0; i <= 8; i++) bel.push([i % 2 ? 0.15 : 0.12, 0.12 + i * 0.04]);
  bel.push([0, 0.44]);
  k.put(M.rubber, lathe(bel, 8), 0.05, 0, 0, { tile: 0.2 });
  k.put(M.chrome, ccyl(0.085, 0.2, 8, 0.01), 0.05, 0.44, 0);
  k.put(M.cream, tbox(0.56, 0.16, 0.4, 0.5, 0.36, 0.04), 0.05, 0.71, 0);
  k.put(M.gunmetal, cbox(0.2, 0.08, 0.02, 0.006), 0.05, 0.7, 0.2);
  // the frame and side rails
  k.put(M.darksteel, cbox(2.12, 0.07, 0.62, 0.02), 0, Y - 0.12, 0, { tile: 0.8 });
  for (const s of [-1, 1]) {
    k.put(M.steel, cbox(2.08, 0.035, 0.03, 0.008), 0, Y - 0.1, s * (TABLE_HALF_Z + 0.025));
    for (const x of [-0.9, -0.3, 0.3, 0.9]) k.put(M.steel, cbox(0.03, 0.05, 0.04, 0.006), x, Y - 0.1, s * (TABLE_HALF_Z + 0.01));
    k.put(M.chrome, cbox(0.05, 0.04, 0.05, 0.01), -0.42, Y - 0.1, s * (TABLE_HALF_Z + 0.03));
    k.put(M.chrome, cbox(0.05, 0.04, 0.05, 0.01), 0.18, Y - 0.1, s * (TABLE_HALF_Z + 0.03));
    k.put(M.chrome, cbox(0.05, 0.04, 0.05, 0.01), 0.62, Y - 0.1, s * (TABLE_HALF_Z + 0.03));
  }
  // drain lip at the foot
  k.put(M.steel, prism([[0, 0], [0.1, 0], [0.12, 0.05], [0.1, 0.06], [0.02, 0.02], [0, 0.04]], 0.6, 0.004), 1.06, Y - 0.15, 0);
  k.put(M.chrome, ccyl(0.02, 0.15, 6), 1.13, Y - 0.32, 0);
  // the pad: head, torso and leg cushions in green vinyl, a headrest wedge
  const pads: [number, number][] = [[-0.86, 0.32], [-0.24, 0.86], [0.66, 0.8]];
  for (const [x, w] of pads) k.put(M.vinyl, cbox(w - 0.02, 0.085, 0.62, 0.03), x, Y - 0.045, 0, { tile: 0.6 });
  k.put(M.vinyl, tbox(0.2, 0.03, 0.42, 0.1, 0.36, 0.012), -0.9, Y + 0.012, 0);
  // a stained drape folded over the leg end
  k.put(M.drape, jitter(cbox(0.3, 0.02, 0.66, 0.008), 0.006, 3), 0.92, Y + 0.004, 0, { tile: 0.4 });
  k.put(M.drape, jitter(tbox(0.3, 0.3, 0.02, 0.32, 0.03, 0.006), 0.01, 4), 0.92, Y - 0.15, 0.34);
  return k.group();
}

// ------------------------------------------------------------------ the six-pod lamp
function buildLamp(M: Mats): { group: THREE.Group; pods: THREE.MeshBasicMaterial[] } {
  const g = new THREE.Group();
  const k = new Kit();
  const L = LAMP_POS;
  // ceiling mount, drop pole, a swing arm with two knuckles, the yoke
  k.put(M.gunmetal, prism(ngon(6, 0.18), 0.05, 0.01), 0.55, CEIL_Y - 0.04, -0.55, { rx: -Math.PI / 2 });
  k.put(M.cream, ccyl(0.045, 0.45, 8, 0.008), 0.55, CEIL_Y - 0.5, -0.55);
  k.put(M.gunmetal, cbox(0.14, 0.12, 0.14, 0.03), 0.55, CEIL_Y - 0.52, -0.55);
  k.push().at(0.55, CEIL_Y - 0.52, -0.55);
  const dx = L.x - 0.55, dz = L.z + 0.55, d = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
  k.ry(ang);
  k.put(M.cream, cbox(d, 0.07, 0.07, 0.015), d / 2, 0, 0);
  k.put(M.gunmetal, cbox(0.12, 0.1, 0.12, 0.025), d, 0, 0);
  k.pop();
  k.put(M.cream, ccyl(0.035, CEIL_Y - 0.52 - L.y - 0.12, 8, 0.008), L.x, L.y + 0.12, L.z);
  k.put(M.gunmetal, cbox(0.1, 0.08, 0.1, 0.02), L.x, L.y + 0.12, L.z);
  // hub
  k.put(M.cream, lathe([[0, 0], [0.16, 0], [0.18, 0.04], [0.14, 0.1], [0.06, 0.12], [0, 0.12]], 6, 0), L.x, L.y - 0.04, L.z);
  k.put(M.steel, ccyl(0.025, 0.16, 6), L.x, L.y - 0.2, L.z);
  k.put(M.cream, tbox(0.06, 0.08, 0.06, 0.04, 0.04, 0.01), L.x, L.y - 0.24, L.z);
  const pods: THREE.MeshBasicMaterial[] = [];
  const focus = new THREE.Vector3(L.x, TABLE_Y, L.z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const p = new THREE.Vector3(L.x + Math.cos(a) * 0.34, L.y - 0.06, L.z + Math.sin(a) * 0.34);
    // strut to the hub
    k.push().at((p.x + L.x) / 2, L.y - 0.0, (p.z + L.z) / 2).ry(-a);
    k.add(M.cream, cbox(0.3, 0.035, 0.05, 0.01));
    k.pop();
    // the pod looks at the focus
    const pg = new THREE.Object3D(); pg.position.copy(p); pg.lookAt(focus); pg.rotateX(-Math.PI / 2); pg.updateMatrix();
    k.push().mul(pg.matrix);
    k.add(M.cream, lathe([[0, 0.13], [0.06, 0.13], [0.12, 0.08], [0.13, 0.01], [0.115, 0.0]], 8, Math.PI / 8));
    k.add(M.darksteel, lathe([[0.112, 0.0], [0.122, -0.01], [0.122, 0.02], [0.112, 0.02]], 8, Math.PI / 8));
    for (let f = 0; f < 4; f++) k.put(M.steel, cbox(0.004, 0.05, 0.1, 0.001), 0, 0.15, 0, { ry: (f / 4) * Math.PI });
    k.pop();
    const mat = new THREE.MeshBasicMaterial({ map: M.lens.map, color: new THREE.Color(0.05, 0.05, 0.05), toneMapped: false });
    pods.push(mat);
    const lens = new THREE.Mesh(prismLens(), mat);
    lens.position.copy(p); lens.lookAt(focus); lens.rotateX(-Math.PI / 2);
    g.add(lens);
  }
  g.add(k.group());
  return { group: g, pods };
}
function prismLens(): THREE.BufferGeometry {
  return prep(prism(ngon(8, 0.108, Math.PI / 8), 0.012).rotateX(Math.PI / 2), null, 0.06, 0xffffff);
}

// ------------------------------------------------------------------ the gantry: trolley, cables, spreader bar and slings
export class Gantry {
  group = new THREE.Group();
  trolley = new THREE.Group();
  bar = new THREE.Group();
  /** the slings' lowest points (where the body rests), in bar space */
  slingX = [-0.52, 0.12];
  private cables: LiveHose[] = [];
  private slings: THREE.Group[] = [];
  beacon: THREE.MeshBasicMaterial;
  /** hoist cable length (trolley to bar) */
  drop = 0.55;
  /** sling slack 0 (taut, holding) .. 1 (dropped away) */
  slack = 0;
  /** pendulum swing of the hanging load about the trolley (radians, about z) */
  swing = 0; swingV = 0;
  private lastX = 0; private vx = 0;
  constructor(M: Mats) {
    const k = new Kit();
    k.put(M.yellow, cbox(0.5, 0.2, 0.34, 0.03), 0, -0.2, 0);
    k.put(M.hazard, cbox(0.52, 0.05, 0.36, 0.01), 0, -0.29, 0);
    k.put(M.gunmetal, cbox(0.2, 0.16, 0.2, 0.02), -0.33, -0.2, 0);
    for (let i = 0; i < 4; i++) k.put(M.darksteel, cbox(0.012, 0.15, 0.22, 0.003), -0.45 + i * 0.03, -0.2, 0);
    for (const x of [-0.16, 0.16]) for (const z of [-0.07, 0.07]) k.put(M.darksteel, ccylZ(0.05, 0.03, 8, 0.008), x, 0.0, z);
    for (const z of [-0.13, 0.13]) k.put(M.yellow, cbox(0.48, 0.2, 0.03, 0.008), 0, -0.06, z);
    k.put(M.darksteel, lathe([[0, -0.08], [0.09, -0.08], [0.09, 0.08], [0, 0.08]], 8), 0, -0.36, 0, { rx: Math.PI / 2 });
    k.put(M.label, cbox(0.14, 0.06, 0.004, 0.002), 0.08, -0.2, 0.172);
    this.trolley.add(k.group());
    this.beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa020).multiplyScalar(2.5), toneMapped: false });
    const bk = new Kit();
    bk.put(this.beacon, prism(ngon(6, 0.04), 0.05, 0.006), 0.18, -0.06, 0.17, { rx: 0 });
    this.trolley.add(bk.group(false, false));
    // the spreader bar
    const b = new Kit();
    b.put(M.yellow, cbox(1.1, 0.07, 0.09, 0.015), -0.2, 0, 0);
    for (const x of [-0.76, 0.36]) b.put(M.hazard, cbox(0.08, 0.075, 0.095, 0.01), x, 0, 0);
    b.put(M.gunmetal, cbox(0.12, 0.1, 0.12, 0.02), -0.2, 0.06, 0);
    b.put(M.steel, prism([[-0.03, 0], [0.03, 0], [0.02, 0.06], [-0.02, 0.06]], 0.02), -0.2, 0.1, 0);
    this.bar.add(b.group());
    for (const sx of this.slingX) {
      const sg = new THREE.Group(); sg.position.x = sx;
      const sk = new Kit();
      // a U of leather under the body, hung from two short chains on the bar
      const U: P2[] = [];
      const R0 = 0.26, R1 = 0.24;
      for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; U.push([Math.cos(a) * R0, Math.sin(a) * R0 * 1.2 - 0.18]); }
      U.push([R0, 0], [R1, 0]);
      for (let i = 8; i >= 0; i--) { const a = Math.PI + (i / 8) * Math.PI; U.push([Math.cos(a) * R1, Math.sin(a) * R1 * 1.2 - 0.18]); }
      U.push([-R1, 0], [-R0, 0]);
      sk.put(M.leather, prism(U, 0.08, 0.004), 0, -0.03, 0, { ry: Math.PI / 2, tile: 0.3 });
      for (const z of [-0.25, 0.25]) sk.put(M.chrome, cbox(0.03, 0.05, 0.02, 0.005), 0, 0.0, z);
      sg.add(sk.group());
      this.bar.add(sg); this.slings.push(sg);
    }
    this.group.add(this.trolley, this.bar);
    for (let i = 0; i < 2; i++) { const c = new LiveHose(M.steel, 0.008, 4, 4, 2); this.cables.push(c); this.group.add(c.mesh); }
    this.trolley.position.set(-3.6, BEAM_Y - 0.11, 0);
  }
  /** world position the hanging body's hips should sit at */
  update(dt: number) {
    const x = this.trolley.position.x;
    const v = dt > 0 ? (x - this.lastX) / dt : 0;
    const acc = dt > 0 ? (v - this.vx) / dt : 0;
    this.lastX = x; this.vx = v;
    // a pendulum driven by the trolley's acceleration
    const L = this.drop + 0.4;
    this.swingV += (-(9.8 / L) * Math.sin(this.swing) - acc / L * Math.cos(this.swing) * 0.6) * dt;
    this.swingV *= Math.exp(-dt * 0.9);
    this.swing += this.swingV * dt;
    const tp = this.trolley.position;
    this.bar.position.set(tp.x + Math.sin(this.swing) * this.drop, tp.y - 0.4 - Math.cos(this.swing) * this.drop, 0);
    this.bar.rotation.z = this.swing * 0.6;
    for (const [i, s] of this.slings.entries()) { s.position.y = -this.slack * 0.25; s.rotation.x = this.slack * (i ? 1.2 : -1.2); s.scale.y = 1 - this.slack * 0.3; s.visible = this.slack < 0.98; }
    this.group.updateMatrixWorld(true);
    for (const [i, c] of this.cables.entries()) {
      const a = new THREE.Vector3(tp.x + (i ? 0.1 : -0.1), tp.y - 0.38, 0);
      const b = this.bar.localToWorld(new THREE.Vector3(-0.2 + (i ? 0.04 : -0.04), 0.1, 0));
      c.set(a, a.clone().lerp(b, 0.33), a.clone().lerp(b, 0.66), b);
    }
  }
  /** where a sling cradles (world) */
  slingWorld(i: number, out = new THREE.Vector3()) { return this.bar.localToWorld(out.set(this.slingX[i], -0.42, 0)); }
}

// ------------------------------------------------------------------ restraint straps
const OPEN = 3.75;
export class Straps {
  group = new THREE.Group();
  private pivots: THREE.Group[] = [];
  private ang: number[] = []; private vel: number[] = []; private tgt: number[] = [];
  constructor(M: Mats, specs: { x: number; h: number }[]) {
    for (const s of specs) {
      const pv = new THREE.Group();
      pv.position.set(s.x, TABLE_Y - 0.1, -TABLE_HALF_Z - 0.03);
      const k = new Kit();
      // a band arching over the body from the far rail to the near one (pivot at the far rail)
      const W = 2 * TABLE_HALF_Z + 0.06, H = s.h + 0.1;
      const outer: P2[] = [], inner: P2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, z = t * W, y = Math.pow(Math.sin(t * Math.PI), 0.45) * H;
        outer.push([z, y + 0.012]); inner.push([z, y]);
      }
      const outline: P2[] = [...outer, ...inner.reverse()];
      k.put(M.leather, prism(outline, 0.075, 0.003), 0, 0, 0, { ry: -Math.PI / 2, tile: 0.25 });
      k.put(M.brass, cbox(0.09, 0.016, 0.06, 0.004), 0, Math.pow(Math.sin(0.72 * Math.PI), 0.45) * H + 0.014, 0.72 * W, { rx: -0.5 });
      k.put(M.steel, cbox(0.03, 0.02, 0.04, 0.005), 0, H + 0.02, W * 0.5);
      k.put(M.chrome, cbox(0.09, 0.05, 0.03, 0.008), 0, 0.0, 0.0);
      pv.add(k.group());
      this.group.add(pv);
      this.pivots.push(pv); this.ang.push(OPEN); this.vel.push(0); this.tgt.push(OPEN);
      pv.rotation.x = -OPEN;
    }
  }
  /** flip strap i shut (or all open) */
  shut(i: number) { this.tgt[i] = 0; this.vel[i] = -14; }
  open(i: number) { this.tgt[i] = OPEN; this.vel[i] = 6; }
  snapAll(closed: boolean) { for (let i = 0; i < this.pivots.length; i++) { this.ang[i] = this.tgt[i] = closed ? 0 : OPEN; this.vel[i] = 0; } this.update(0); }
  update(dt: number) {
    for (let i = 0; i < this.pivots.length; i++) {
      const w = 16, z = 0.32;
      this.vel[i] += ((this.tgt[i] - this.ang[i]) * w * w - 2 * z * w * this.vel[i]) * dt;
      this.ang[i] += this.vel[i] * dt;
      if (this.ang[i] < -0.08) { this.ang[i] = -0.08; this.vel[i] *= -0.3; }
      this.pivots[i].rotation.x = -this.ang[i];
    }
  }
}

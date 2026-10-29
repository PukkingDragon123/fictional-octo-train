// The taped section of the processing wing's wall, close enough to touch: the
// first-person set for the arm going into the Seam (src/game/arrival.ts).
// Glazed tiles laid one by one (bevelled, a few chipped, cracked or gone,
// grime rising from the floor and soot round the opening), a steel channel
// frame bolted round the opening, hazard tape outlining it (crumpled, one
// strip torn and hanging into the jelly), an enamel plate naming it, a caged
// amber warning lamp, a conduit up the wall, a concrete floor with a gel
// puddle. Lit by a cold strip light from above, the membrane's own cyan glow
// and the lamp. Every piece is a faceted mesh with a pixel-art texture.
import * as THREE from 'three';
import { PixelCanvas, mixHex } from '../../gfx/pixel';
import { cssFont } from '../../gfx/crt';
import { cbox, flathe, fromTris, hash3, pixTex, canvasTex, place, merge } from './geo';
import { JW, JH } from './jelly';

const K = 0x0a0b09;
const TILE = 0.15, GAP = 0.006, TD = 0.012;
/** the opening plus the frame around it, where no tiles go */
const HOLE_X = JW / 2 + 0.075, HOLE_Y = JH + 0.075;
export const LAMP_POS = new THREE.Vector3(JW / 2 + 0.27, 1.76, 0.16);

// ------------------------------------------------------------------ textures
function tilesTex() {
  return pixTex(64, 16, (pc) => {
    for (let v = 0; v < 4; v++) {
      const ox = v * 16;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const n = hash3(x + ox, y, 3);
        let c = mixHex(0xc4cbbb, 0xd6dbcd, n * 0.6 + (1 - y / 15) * 0.25);
        if (n > 0.93) c = 0xb4bba9;
        pc.set(ox + x, y, c);
      }
      // bevel: lit top-left, dark bottom-right, black outline
      for (let i = 0; i < 16; i++) { pc.set(ox + i, 1, 0xeef1e6); pc.set(ox + 1, i, 0xe6eadc); pc.set(ox + i, 14, 0x8e9584); pc.set(ox + 14, i, 0x98a08e); }
      for (let i = 0; i < 16; i++) { pc.set(ox + i, 0, K); pc.set(ox, i, K); pc.set(ox + i, 15, K); pc.set(ox + 15, i, K); }
      // the glaze catching the light
      for (let i = 0; i < 4; i++) pc.set(ox + 3 + i, 4 - Math.floor(i / 2), 0xffffff);
      pc.set(ox + 4, 5, 0xf4f6ee);
      if (v === 1) {
        // grime and a rust-brown drip
        for (let y = 6; y < 15; y++) for (let x = 2; x < 14; x++) if (hash3(x, y, 11) < (y - 5) / 12) pc.blend(ox + x, y, 0x6e6450, 0.55);
        for (let y = 2; y < 14; y++) pc.blend(ox + 9, y, 0x7a4a26, 0.35 + y * 0.03);
        pc.blend(ox + 10, 13, 0x6a3a1c, 0.6);
      } else if (v === 2) {
        // a crack, dark with a light lip
        let x = 3;
        for (let y = 2; y < 14; y++) { x += hash3(y, 5, 9) < 0.5 ? 1 : (hash3(y, 2, 9) < 0.5 ? -1 : 0); x = Math.max(2, Math.min(13, x)); pc.set(ox + x, y, 0x2a2b26); pc.set(ox + x + 1, y, 0xeef0e6); }
      } else if (v === 3) {
        // scratched tally marks: someone counted days here
        for (let k = 0; k < 4; k++) for (let y = 4; y < 12; y++) { pc.set(ox + 4 + k * 2, y, 0x50544a); pc.set(ox + 5 + k * 2, y, 0xe8ebe0); }
        for (let i = 0; i < 9; i++) { pc.set(ox + 3 + i, 10 - Math.floor(i * 0.7), 0x50544a); }
      }
    }
  });
}
function concreteTex() {
  return pixTex(32, 32, (pc) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = hash3(x, y, 21), m = hash3(x >> 2, y >> 2, 22);
      let c = mixHex(0x2a2b27, 0x3d3e38, m * 0.7 + n * 0.3);
      if (n > 0.95) c = 0x1a1a17; else if (n < 0.04) c = 0x4c4c45;
      pc.set(x, y, c);
    }
  }, true);
}
function steelTex() {
  return pixTex(16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = hash3(x, y, 31);
      let c = mixHex(0x434a3a, 0x566049, n * 0.5 + (1 - y / 15) * 0.3);
      if (hash3(x >> 1, y >> 1, 32) > 0.9) c = n > 0.5 ? 0x8d9188 : 0x6b4126; // chips to bare steel, rust
      pc.set(x, y, c);
    }
    for (let i = 0; i < 16; i++) { pc.set(i, 0, 0x7a846a); pc.set(0, i, 0x6f795f); pc.set(i, 15, K); pc.set(15, i, K); }
  });
}
function tapeTex() {
  // 8 across, 32 along: yellow and black bands at 45 degrees, scuffed, dirty
  return pixTex(8, 32, (pc) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
      const band = ((x + y) >> 2) & 1;
      let c = band ? 0x15130e : mixHex(0xd9a522, 0xf0c03a, hash3(x, y, 41) * 0.6);
      if (hash3(x, y, 42) > 0.9) c = band ? 0x34302a : 0xa88320;
      if (hash3(x >> 1, y >> 2, 43) > 0.93) c = mixHex(c, 0x6b5f48, 0.6);
      pc.set(x, y, c);
    }
    for (let y = 0; y < 32; y++) { pc.set(0, y, K); pc.set(7, y, K); pc.set(1, y, mixHex(pc.get(1, y), 0xffffff, 0.25)); }
  }, true);
}
/** the enamel plate: cream, a red border, black stencil words (Pixelify Sans, alpha-thresholded so the pixels stay hard) */
function signTex() {
  const W = 96, H = 34;
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, mixHex(0xd5ceb2, 0xe2dcc2, hash3(x, y, 51) * 0.5 + (1 - y / H) * 0.3));
  for (let x = 0; x < W; x++) { pc.set(x, 2, 0xa8281c); pc.set(x, 3, 0x8a1f16); pc.set(x, H - 3, 0xa8281c); pc.set(x, H - 4, 0x8a1f16); }
  for (let y = 2; y < H - 2; y++) { pc.set(2, y, 0xa8281c); pc.set(W - 3, y, 0xa8281c); }
  // chips and rust bleed at the rivets
  for (const [x, y] of [[5, 6], [W - 6, 6], [5, H - 7], [W - 6, H - 7]]) { pc.set(x, y, 0x6a6a62); pc.set(x + 1, y, 0x3a3a34); pc.set(x, y + 1, 0x3a3a34); pc.blend(x, y + 2, 0x7a4022, 0.6); pc.blend(x, y + 3, 0x7a4022, 0.3); }
  for (let i = 0; i < 14; i++) { const x = 4 + Math.floor(hash3(i, 1, 52) * (W - 8)), y = 4 + Math.floor(hash3(i, 2, 52) * (H - 8)); pc.set(x, y, 0x8c8a7c); }
  for (let x = 0; x < W; x++) { pc.set(x, 0, K); pc.set(x, H - 1, K); }
  for (let y = 0; y < H; y++) { pc.set(0, y, K); pc.set(W - 1, y, K); }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.putImageData(pc.toImageData(), 0, 0);
  // words, drawn on a scratch canvas and thresholded onto the plate
  const tc = document.createElement('canvas'); tc.width = W; tc.height = H;
  const t = tc.getContext('2d')!;
  t.fillStyle = '#000'; t.textAlign = 'center'; t.textBaseline = 'alphabetic';
  t.font = `700 13px ${cssFont('--font-new', "'Pixelify Sans', monospace")}`;
  t.fillText('SEAM 04', W / 2, 17);
  t.font = `600 8px ${cssFont('--font-new', "'Pixelify Sans', monospace")}`;
  t.fillText('ESCORTED TRANSFER ONLY', W / 2, 27);
  const td = t.getImageData(0, 0, W, H), pd = g.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) if (td.data[i * 4 + 3] > 110) { pd.data[i * 4] = 22; pd.data[i * 4 + 1] = 20; pd.data[i * 4 + 2] = 16; }
  g.putImageData(pd, 0, 0);
  return canvasTex(cv);
}
function lampGlassTex() {
  return pixTex(8, 8, (pc) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pc.set(x, y, mixHex(0xff9a3a, 0xffd27a, (1 - y / 7) * 0.7 + hash3(x, y, 61) * 0.3));
    pc.set(2, 1, 0xfff4d8); pc.set(3, 1, 0xfff4d8);
  });
}

// ------------------------------------------------------------------ the set
export interface WallSet {
  root: THREE.Group;
  glow: THREE.PointLight;
  lamp: THREE.PointLight;
  lampGlass: THREE.MeshStandardMaterial;
  key: THREE.DirectionalLight;
  /** the torn strip of tape hanging over the jelly (it swings) */
  hang: THREE.Object3D;
  update(t: number, glow: number): void;
  dispose(): void;
}

export function buildWallSet(low: boolean): WallSet {
  const root = new THREE.Group();
  root.name = 'arrival:wall';
  const disp: { dispose(): void }[] = [];
  const std = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial({ flatShading: true, ...o }); disp.push(m); return m; };
  const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => { const me = new THREE.Mesh(g, m); me.castShadow = shadow; me.receiveShadow = true; root.add(me); disp.push(g); return me; };

  // ---- the tiles, one by one
  const tiles = tilesTex(); disp.push(tiles);
  const tpos: number[] = [], tuv: number[] = [], tcol: number[] = [];
  const quad = (p: number[][], uv: number[][], c: [number, number, number]) => {
    for (const k of [0, 1, 2, 0, 2, 3]) { tpos.push(...p[k]); tuv.push(...uv[k]); tcol.push(...c); }
  };
  for (let j = 0; j < 22; j++) for (let i = -11; i < 11; i++) {
    const x0 = i * TILE + GAP / 2, x1 = (i + 1) * TILE - GAP / 2, y0 = j * TILE + GAP / 2, y1 = (j + 1) * TILE - GAP / 2;
    if (x1 > -HOLE_X && x0 < HOLE_X && y0 < HOLE_Y) continue;
    const r = hash3(i, j, 71);
    if (r < 0.03) continue; // fallen off: the concrete shows
    const v = r > 0.9 ? 2 : r > 0.8 ? 1 : (i === 6 && j === 9) ? 3 : r > 0.72 ? 1 : 0;
    const zf = TD + (hash3(i, j, 72) - 0.5) * 0.004;
    const zc = (k: number) => zf + (hash3(i, j, 73 + k) - 0.5) * 0.003;
    const b = 0.007;
    const F = [[x0 + b, y0 + b, zc(0)], [x1 - b, y0 + b, zc(1)], [x1 - b, y1 - b, zc(2)], [x0 + b, y1 - b, zc(3)]];
    const B = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
    const u0 = v * 0.25, u1 = u0 + 0.25, e = 1 / 64;
    // grime rises from the floor, soot darkens the tiles nearest the opening
    const dx = Math.max(0, Math.abs((x0 + x1) / 2) - HOLE_X), near = Math.exp(-dx * 4) * (y0 < HOLE_Y + 0.3 ? 1 : 0.5);
    const k = (0.82 + hash3(i, j, 74) * 0.2) * (1 - Math.max(0, 0.5 - y0) * 0.5) * (1 - near * 0.35);
    const c: [number, number, number] = [k * 0.97, k, k * 0.98];
    quad(F, [[u0 + e, e], [u1 - e, e], [u1 - e, 1 - e], [u0 + e, 1 - e]], c);
    // bevels: the tile's own edge pixels
    const cs: [number, number, number] = [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8];
    quad([B[0], B[1], F[1], F[0]], [[u0, 0], [u1, 0], [u1, e], [u0, e]], cs);
    quad([B[1], B[2], F[2], F[1]], [[u1, 0], [u1, 1], [u1 - e, 1], [u1 - e, 0]], cs);
    quad([B[2], B[3], F[3], F[2]], [[u1, 1], [u0, 1], [u0, 1 - e], [u1, 1 - e]], c);
    quad([B[3], B[0], F[0], F[3]], [[u0, 1], [u0, 0], [u0 + e, 0], [u0 + e, 1]], c);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3));
  tg.computeVertexNormals();
  add(tg, std({ map: tiles, vertexColors: true, roughness: 0.28, metalness: 0.0 }), false);

  // ---- concrete behind the tiles, and the floor
  const conc = concreteTex(); disp.push(conc);
  const back = new THREE.PlaneGeometry(3.4, 3.4, 1, 1);
  back.translate(0, 1.7, -0.002);
  const buv = back.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 6, buv.getY(i) * 6);
  add(back, std({ map: conc, color: 0x8a8a84, roughness: 0.95 }), false);
  // floor slabs: a few faceted pours, uneven
  const fl: THREE.BufferGeometry[] = [];
  for (let i = -2; i < 2; i++) for (let j = 0; j < 2; j++) {
    const g = cbox(0.86, 0.1, 0.78, 0.012, 0.008, i * 7 + j);
    place(g, i * 0.88 + 0.44, -0.05 + (hash3(i, j, 81) - 0.5) * 0.008, 0.4 + j * 0.8);
    fl.push(g);
  }
  const flg = merge(fl);
  const fuv = flg.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 3, fuv.getY(i) * 3);
  flg.computeVertexNormals();
  add(flg, std({ map: conc, color: 0x9a9890, roughness: 0.9 }), false);
  // the gel that has run out of it: a dark glossy puddle at the threshold
  const pud: number[][] = [];
  const pc0 = [0.05, 0.002, 0.16];
  for (let a = 0; a < 9; a++) {
    const a0 = (a / 9) * Math.PI * 2, a1 = ((a + 1) / 9) * Math.PI * 2;
    const r0 = 0.26 + hash3(a, 1, 82) * 0.18, r1 = 0.26 + hash3((a + 1) % 9, 1, 82) * 0.18;
    pud.push(pc0, [pc0[0] + Math.cos(a1) * r1 * 1.4, 0.002, pc0[2] + Math.sin(a1) * r1 * 0.6], [pc0[0] + Math.cos(a0) * r0 * 1.4, 0.002, pc0[2] + Math.sin(a0) * r0 * 0.6]);
  }
  add(fromTris(pud), std({ color: 0x050909, roughness: 0.05, metalness: 0.2, emissive: 0x041414 }), false);

  // ---- the steel frame round the opening, bolted through the tiles
  const steel = steelTex(); disp.push(steel);
  const fr: THREE.BufferGeometry[] = [];
  fr.push(place(cbox(0.075, JH + 0.07, 0.07, 0.012), -(JW / 2 + 0.0375), (JH + 0.07) / 2, 0.035));
  fr.push(place(cbox(0.075, JH + 0.07, 0.07, 0.012), JW / 2 + 0.0375, (JH + 0.07) / 2, 0.035));
  fr.push(place(cbox(JW + 0.15, 0.08, 0.075, 0.012), 0, JH + 0.04, 0.0375));
  fr.push(place(cbox(JW + 0.2, 0.025, 0.2, 0.008), 0, 0.012, 0.08));
  // the inner lip of the channel (the membrane sits recessed behind it)
  for (const s of [-1, 1]) fr.push(place(cbox(0.02, JH, 0.05, 0.005), s * (JW / 2 - 0.004), JH / 2, 0.0));
  // hex bolts
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) fr.push(place(cbox(0.022, 0.022, 0.012, 0.004), s * (JW / 2 + 0.0375), 0.14 + k * 0.3, 0.075, 0, 0, 0.3));
  add(merge(fr), std({ map: steel, color: 0xbfc2b4, roughness: 0.55, metalness: 0.55 }));

  // ---- hazard tape outlining it, crumpled; one strip torn and hanging into the jelly
  const tape = tapeTex(); disp.push(tape);
  const tapeMat = std({ map: tape, roughness: 0.45, side: THREE.DoubleSide });
  const ribbon = (pts: [number, number, number][], w: number, seed: number) => {
    const pos: number[] = [], uv: number[] = [];
    let along = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * w / 2, ny = dx / len * w / 2;
      const ja = (hash3(i, seed, 91) - 0.5) * 0.008, jb = (hash3(i + 1, seed, 91) - 0.5) * 0.008;
      const A0 = [a[0] - nx, a[1] - ny, a[2] + ja], A1 = [a[0] + nx, a[1] + ny, a[2] - ja], B0 = [b[0] - nx, b[1] - ny, b[2] + jb], B1 = [b[0] + nx, b[1] + ny, b[2] - jb];
      const v0 = along / (w * 4), v1 = (along + len) / (w * 4);
      pos.push(...A0, ...B0, ...B1, ...A0, ...B1, ...A1);
      uv.push(0, v0, 0, v1, 1, v1, 0, v0, 1, v1, 1, v0);
      along += len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const strip = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.12));
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, TD + 0.006 + hash3(i, seed, 92) * 0.004]);
    const g = ribbon(pts, 0.072, seed);
    add(g, tapeMat, false);
  };
  const ox = JW / 2 + 0.135;
  strip(-ox, 0.02, -ox, JH + 0.14, 1);
  strip(ox, 0.02, ox, JH + 0.14, 2);
  strip(-ox - 0.05, JH + 0.135, ox + 0.05, JH + 0.135, 3);
  strip(-ox - 0.06, 1.62, -ox + 0.06, 1.46, 4);
  strip(ox - 0.06, 0.62, ox + 0.08, 0.44, 5);
  // the torn one: it ran across the opening once; now it hangs from the left jamb, its end curled, stuck to the gel
  const hang = new THREE.Group();
  hang.position.set(-JW / 2 + 0.02, 1.58, 0.075);
  const hp: [number, number, number][] = [];
  for (let i = 0; i <= 7; i++) { const s = i / 7; hp.push([s * 0.2 + Math.sin(s * 2.2) * 0.04, -s * 0.42, 0.006 + s * s * 0.05]); }
  const hg = ribbon(hp, 0.07, 9);
  const hm = new THREE.Mesh(hg, tapeMat); hm.castShadow = true; disp.push(hg);
  hang.add(hm);
  root.add(hang);

  // ---- the enamel plate naming it, riveted to the tiles at eye level
  const sign = signTex(); disp.push(sign);
  const plate = cbox(0.3, 0.106, 0.008, 0.004);
  const pm = add(plate, [std({ color: 0x8a8678, roughness: 0.6, metalness: 0.4 })][0]);
  pm.position.set(JW / 2 + 0.33, 1.42, TD + 0.006);
  pm.rotation.z = -0.025;
  const face = new THREE.PlaneGeometry(0.29, 0.1);
  const fm = new THREE.Mesh(face, std({ map: sign, roughness: 0.4, metalness: 0.1 }));
  fm.position.set(0, 0, 0.0045); disp.push(face);
  pm.add(fm);

  // ---- the warning lamp: a caged amber lens on a bracket, beside the frame
  const lampGlassT = lampGlassTex(); disp.push(lampGlassT);
  const lampRoot = new THREE.Group();
  lampRoot.position.copy(LAMP_POS).setZ(0);
  root.add(lampRoot);
  const lb: THREE.BufferGeometry[] = [];
  lb.push(place(cbox(0.13, 0.13, 0.03, 0.01), 0, 0, 0.015));
  lb.push(place(flathe([[0.0, 0], [0.07, 0], [0.075, 0.02], [0.065, 0.035]], 7), 0, 0, 0.03, Math.PI / 2, 0, 0));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; lb.push(place(cbox(0.008, 0.008, 0.11, 0.002), Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0.09, 0, 0, a)); }
  lb.push(place(flathe([[0.062, 0], [0.066, 0.006], [0.05, 0.012], [0, 0.014]], 7), 0, 0, 0.142, Math.PI / 2, 0, 0));
  add(merge(lb), std({ map: steel, color: 0x9a9a8a, roughness: 0.5, metalness: 0.6 }));
  const lampGlass = std({ map: lampGlassT, emissive: 0xff8a2a, emissiveIntensity: 2.4, roughness: 0.2 });
  const dome = flathe([[0.052, 0], [0.052, 0.04], [0.04, 0.08], [0.0, 0.095]], 7);
  const dm = new THREE.Mesh(dome, lampGlass); disp.push(dome);
  dm.rotation.x = Math.PI / 2; dm.position.z = 0.034;
  lampRoot.add(dm);

  // ---- a conduit up the wall with its brackets
  const cd: THREE.BufferGeometry[] = [];
  cd.push(place(flathe([[0.024, 0], [0.024, 3.0]], 6), -1.02, 0, 0.05));
  for (let k = 0; k < 4; k++) cd.push(place(cbox(0.08, 0.03, 0.06, 0.008), -1.02, 0.35 + k * 0.7, 0.035));
  cd.push(place(flathe([[0.034, 0], [0.034, 0.12]], 6), -1.02, 1.25, 0.05));
  add(merge(cd), std({ map: steel, color: 0x8d8f80, roughness: 0.6, metalness: 0.5 }));

  // ---- lights
  const key = new THREE.DirectionalLight(0xd8eeff, 1.1);
  key.position.set(0.35, 3.2, 1.9);
  key.target.position.set(0, 1.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(low ? 512 : 1024, low ? 512 : 1024);
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = -1.4; sc.right = 1.4; sc.top = 1.6; sc.bottom = -1.6; sc.near = 0.5; sc.far = 6;
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.01;
  root.add(key, key.target);
  const glow = new THREE.PointLight(0x58dce6, 0.8, 3.2, 1.6);
  glow.position.set(0, 1.25, 0.32);
  root.add(glow);
  const lamp = new THREE.PointLight(0xff7a24, 0.9, 3.5, 1.8);
  lamp.position.copy(LAMP_POS).setZ(0.2);
  root.add(lamp);
  root.add(new THREE.HemisphereLight(0x46565c, 0x0c0a08, 0.55));

  return {
    root, glow, lamp, lampGlass, key, hang,
    update(t: number, g: number) {
      // the lamp: a tired relay, now and then a stutter
      const st = Math.sin(t * 2.1) > 0.97 || (Math.sin(t * 13.7) > 0.93 && Math.sin(t * 0.7) > 0.3);
      const k = (0.85 + Math.sin(t * 3.3) * 0.08) * (st ? 0.25 : 1);
      lamp.intensity = 0.9 * k;
      lampGlass.emissiveIntensity = 2.4 * k;
      glow.intensity = 0.15 + g * 0.4;
      hang.rotation.z = Math.sin(t * 0.8) * 0.03;
      hang.rotation.x = Math.sin(t * 1.1 + 1) * 0.04;
    },
    dispose() { root.removeFromParent(); for (const d of disp) d.dispose(); },
  };
}

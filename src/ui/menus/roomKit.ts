// The subject room's shell and its fixed dressing as faceted models on
// pixel-art textures (scene/facet.ts, scene/pixtex.ts): glazed tile up to the
// dado, board-formed concrete above, a slab floor with saw cuts, a riveted
// I-beam ceiling with the press well, the hatch and the arm slots, pipe runs
// with flanges and a handwheel, a louvre, the die plate, the drain, the brine
// bucket, the instrument stand, the monitor cart, the breaker, signs. Also
// the blood decals. Nothing here runs per frame.
import * as THREE from 'three';
import {
  FacetBuilder, at, cbox, prism, extrude, ngon, band, bolt, pipeRun, valveWheel, COL,
  breakerModel, trayModel, bucketModel, drainModel, signModel, monitorModel, fixtureModel, type Mats,
} from './roomParts';

export const ROOM = { W: 3.4, BACK: -2.4, FRONT: 6, H: 3.6, HATCH_W: 1.3, HATCH_H: 2.3, SEAT_Y: 0.47, CHAIR_Z: -0.45, FLOAT_Z: 0.45, PLATE_Y: 0.07, TILE_H: 1.5 };
/** phosphor and lamp colours (no neon: tubes, filaments, phosphor) */
export const PHOS = { amber: 0xffb43c, green: 0x8dff7a, white: 0xe8e4d0, nixie: 0xff7a2a, red: 0xff4a2a };
/** where things stand (world) */
export const SPOT = {
  breaker: new THREE.Vector3(-ROOM.W + 0.01, 1.25, -1.3),
  lever: new THREE.Vector3(-ROOM.W + 0.24, 1.18, -1.3),
  monitor: { x: 1.32, z: -0.62, ry: -0.95 },
  fixtures: [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.6], [1.6, 1.6]] as [number, number][],
  hatchLamp: new THREE.Vector3(0, ROOM.HATCH_H + 0.17, ROOM.BACK + 0.08),
};

/** a world-space slab (UVs follow world coordinates, so tiles and seams line up across pieces) */
function slab(b: FacetBuilder, key: Parameters<FacetBuilder['add']>[0], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, c = 0.004) {
  const g = cbox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), c);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.add(key, g, color, undefined, { uv0: [0, 0], tone: 0.04, seed: 1 });
}

/** the cell and everything bolted down in it (static, merged per material) */
export function roomModel(mats: Mats): THREE.Group {
  const { W, BACK, FRONT, H, HATCH_W, HATCH_H, FLOAT_Z, PLATE_Y, TILE_H } = ROOM;
  const b = new FacetBuilder();
  const TILE = 0xd8e0cc, CONC = 0xb8b4aa, hw = HATCH_W / 2;
  // floor
  slab(b, 'floor', -W, W, -0.1, 0, BACK - 0.2, FRONT, 0xd0d0d0);
  // back wall round the hatch: glazed tile to the dado, concrete above
  slab(b, 'tile', -W, -hw, 0, TILE_H, BACK - 0.2, BACK, TILE);
  slab(b, 'tile', hw, W, 0, TILE_H, BACK - 0.2, BACK, TILE);
  slab(b, 'concrete', -W, -hw, TILE_H, H, BACK - 0.2, BACK, CONC);
  slab(b, 'concrete', hw, W, TILE_H, H, BACK - 0.2, BACK, CONC);
  slab(b, 'concrete', -hw, hw, HATCH_H, H, BACK - 0.2, BACK, CONC);
  // side and front walls
  for (const k of [-1, 1]) {
    slab(b, 'tile', k * W, k * (W + 0.2), 0, TILE_H, BACK - 0.2, FRONT, TILE);
    slab(b, 'concrete', k * W, k * (W + 0.2), TILE_H, H, BACK - 0.2, FRONT, CONC);
  }
  slab(b, 'tile', -W, W, 0, TILE_H, FRONT, FRONT + 0.2, TILE);
  slab(b, 'concrete', -W, W, TILE_H, H, FRONT, FRONT + 0.2, CONC);
  // the dado: a bullnose of dark green glazed cap tiles, and a skirting
  const capRun = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'tile', x0, x1, TILE_H - 0.02, TILE_H + 0.05, z0, z1, 0x6a8a5a, 0.012); slab(b, 'tile', x0, x1, 0, 0.12, z0, z1, 0x5a6a4e, 0.01); };
  capRun(-W, -hw - 0.12, BACK, BACK + 0.04); capRun(hw + 0.12, W, BACK, BACK + 0.04);
  for (const k of [-1, 1]) capRun(k * W - (k > 0 ? 0.04 : 0), k * W + (k < 0 ? 0.04 : 0), BACK, FRONT);
  capRun(-W, W, FRONT - 0.04, FRONT);
  // ceiling round the press well, riveted I-beams under it
  const pw = 1.5, pd = 1.2;
  slab(b, 'concrete', -W, -pw / 2, H, H + 0.15, BACK - 0.2, FRONT, 0x6a6862);
  slab(b, 'concrete', pw / 2, W, H, H + 0.15, BACK - 0.2, FRONT, 0x6a6862);
  slab(b, 'concrete', -pw / 2, pw / 2, H, H + 0.15, BACK - 0.2, FLOAT_Z - pd / 2, 0x6a6862);
  slab(b, 'concrete', -pw / 2, pw / 2, H, H + 0.15, FLOAT_Z + pd / 2, FRONT, 0x6a6862);
  const I: [number, number][] = [[-0.07, -0.11], [0.07, -0.11], [0.07, -0.09], [0.008, -0.09], [0.008, 0.09], [0.07, 0.09], [0.07, 0.11], [-0.07, 0.11], [-0.07, 0.09], [-0.008, 0.09], [-0.008, -0.09], [-0.07, -0.09]];
  for (const x of [-2.4, -1.0, 1.0, 2.4]) {
    b.add('rust', extrude(I, FRONT - BACK, 0.003), 0x9a8a7a, at(x, H - 0.11, (FRONT + BACK) / 2), { grain: 'z' });
    for (let z = BACK + 0.4; z < FRONT; z += 0.7) for (const dx of [-0.045, 0.045]) b.add('metal', bolt(0.01, 0.008), COL.dark, at(x + dx, H - 0.215, z, Math.PI));
  }
  // the press well: steel sides going up into the dark, a hazard collar
  for (const k of [-1, 1]) {
    slab(b, 'metal', k * pw / 2 - 0.02, k * pw / 2 + 0.02, H - 0.25, H + 1.3, FLOAT_Z - pd / 2, FLOAT_Z + pd / 2, 0x5a5c5a);
    slab(b, 'metal', -pw / 2, pw / 2, H - 0.25, H + 1.3, FLOAT_Z + k * pd / 2 - 0.02, FLOAT_Z + k * pd / 2 + 0.02, 0x5a5c5a);
  }
  for (const k of [-1, 1]) { slab(b, 'hazard', k * (pw / 2 + 0.04) - 0.04, k * (pw / 2 + 0.04) + 0.04, H - 0.32, H - 0.2, FLOAT_Z - pd / 2 - 0.08, FLOAT_Z + pd / 2 + 0.08, 0xffffff, 0.01); slab(b, 'hazard', -pw / 2 - 0.08, pw / 2 + 0.08, H - 0.32, H - 0.2, FLOAT_Z + k * (pd / 2 + 0.04) - 0.04, FLOAT_Z + k * (pd / 2 + 0.04) + 0.04, 0xffffff, 0.01); }
  slab(b, 'rubber', -pw / 2, pw / 2, H + 1.25, H + 1.3, FLOAT_Z - pd / 2, FLOAT_Z + pd / 2, 0x222222);
  // the hatch: channel frame, hazard lintel, the throat behind with a grate floor
  for (const k of [-1, 1]) {
    b.add('paint', cbox(0.12, HATCH_H + 0.08, 0.1, 0.02), COL.oliveDark, at(k * (hw + 0.06), (HATCH_H + 0.08) / 2, BACK + 0.04));
    for (let y = 0.3; y < HATCH_H; y += 0.5) b.add('metal', bolt(0.014, 0.01), COL.steel, at(k * (hw + 0.06), y, BACK + 0.095, Math.PI / 2));
  }
  b.add('hazard', cbox(HATCH_W + 0.26, 0.12, 0.1, 0.02), 0xffffff, at(0, HATCH_H + 0.06, BACK + 0.04), { rep: 0.24 });
  slab(b, 'rust', -hw - 0.1, hw + 0.1, -0.02, 0.02, BACK - 3.1, BACK - 0.2, 0x8a8a8a);
  for (const k of [-1, 1]) slab(b, 'metal', k * (hw + 0.1) - 0.02, k * (hw + 0.1) + 0.02, 0, HATCH_H + 0.2, BACK - 3.1, BACK - 0.2, 0x3a3c3a);
  slab(b, 'metal', -hw - 0.1, hw + 0.1, HATCH_H + 0.1, HATCH_H + 0.2, BACK - 3.1, BACK - 0.2, 0x2a2c2a);
  slab(b, 'metal', -hw - 0.1, hw + 0.1, 0, HATCH_H + 0.2, BACK - 3.15, BACK - 3.1, 0x1a1a1a);
  b.add('metal', cbox(0.34, 0.08, 0.08, 0.012), COL.dark, at(0, HATCH_H + 0.17, BACK + 0.04));
  // the arm slots: framed black mouths, a hazard strip above each
  for (const k of [-1, 1]) {
    b.add('metal', extrude([[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]], 0.06, 0.012, [[[-0.32, -0.32], [0.32, -0.32], [0.32, 0.32], [-0.32, 0.32]]]), COL.dark, at(k * 1.75, 2.75, BACK + 0.03));
    slab(b, 'rubber', k * 1.75 - 0.33, k * 1.75 + 0.33, 2.42, 3.08, BACK - 0.05, BACK + 0.004, 0x0a0a0a);
    b.add('hazard', cbox(0.84, 0.06, 0.04, 0.01), 0xffffff, at(k * 1.75, 3.2, BACK + 0.03), { rep: 0.2 });
  }
  for (const [x, z] of [[0, -0.95], [-1.75, 0.9]]) {
    b.add('metal', extrude([[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]], 0.05, 0.01, [[[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]]), COL.dark, at(x, H - 0.02, z, Math.PI / 2));
    slab(b, 'rubber', x - 0.31, x + 0.31, H - 0.005, H + 0.05, z - 0.31, z + 0.31, 0x0a0a0a);
  }
  // pipe runs: two risers in the back left corner, one on the right, a main along the back wall with a handwheel
  pipeRun(b, [[-W + 0.17, 0, BACK + 0.17], [-W + 0.17, H - 0.25, BACK + 0.17], [W - 0.6, H - 0.25, BACK + 0.17]], 0.07, 'rust', 0xffffff);
  pipeRun(b, [[-W + 0.36, 0, BACK + 0.12], [-W + 0.36, H - 0.45, BACK + 0.12], [-1.2, H - 0.45, BACK + 0.12], [-1.2, 1.9, BACK + 0.12]], 0.035, 'paint', 0x6a7a5a);
  pipeRun(b, [[W - 0.2, 0, BACK + 0.2], [W - 0.2, H - 0.6, BACK + 0.2], [W - 0.2, H - 0.6, 2.0]], 0.055, 'paint', 0x8a5a3a);
  valveWheel(b, at(-1.2, 1.88, BACK + 0.2), 0.11);
  b.add('metal', prism(0.05, 0.08, 8), COL.dark, at(-1.2, 1.88, BACK + 0.12, Math.PI / 2));
  // junction boxes and conduit on the back wall
  for (const [x, y] of [[1.25, 2.1], [-2.3, 1.85]]) {
    b.add('paint', cbox(0.22, 0.28, 0.1, 0.015), COL.oliveDark, at(x, y, BACK + 0.05));
    for (const [dx, dy] of [[-0.08, 0.11], [0.08, 0.11], [-0.08, -0.11], [0.08, -0.11]]) b.add('metal', bolt(0.008, 0.006), COL.steel, at(x + dx, y + dy, BACK + 0.1, Math.PI / 2));
    b.add('metal', prism(0.016, H - y - 0.14, 6), COL.steel, at(x, (H + y + 0.14) / 2, BACK + 0.04));
  }
  // a louvre high on the right wall
  b.add('metal', extrude([[-0.35, -0.25], [0.35, -0.25], [0.35, 0.25], [-0.35, 0.25]], 0.06, 0.012, [[[-0.3, -0.2], [0.3, -0.2], [0.3, 0.2], [-0.3, 0.2]]]), COL.dark, at(W - 0.03, 2.75, -0.2, 0, -Math.PI / 2));
  for (let i = 0; i < 7; i++) b.add('metal', cbox(0.05, 0.012, 0.6, 0.004), COL.steel, at(W - 0.03, 2.58 + i * 0.056, -0.2, 0, 0, 0.6));
  slab(b, 'rubber', W - 0.01, W + 0.02, 2.55, 2.95, -0.5, 0.1, 0x050505);
  // the die plate under the press: a steel slab with hazard edges and chain eyes
  b.add('metal', cbox(1.4, PLATE_Y, 1.1, 0.012), 0x9a9e9e, at(0, PLATE_Y / 2, FLOAT_Z), { rep: 0.6 });
  for (const k of [-1, 1]) b.add('hazard', cbox(1.5, 0.014, 0.07, 0.004), 0xffffff, at(0, PLATE_Y + 0.004, FLOAT_Z + k * 0.58), { rep: 0.2 });
  for (const k of [-1, 1]) {
    b.add('metal', bolt(0.035, 0.03), COL.dark, at(k * 0.34, PLATE_Y, FLOAT_Z + 0.1));
    b.add('metal', band(0.022, 0.022, 0.012, 0.012, 6), COL.steel, at(k * 0.34, PLATE_Y + 0.05, FLOAT_Z + 0.1, Math.PI / 2));
  }
  for (const [x, z] of [[-0.62, -0.47], [0.62, -0.47], [-0.62, 0.47], [0.62, 0.47]]) b.add('metal', bolt(0.02, 0.012), COL.steel, at(x, PLATE_Y, FLOAT_Z + z));
  const g = b.build(mats, { cast: false });
  // the bolted-down things with their own pivots
  const put = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };
  g.add(breakerModel(mats));
  put(trayModel(mats), -0.98, 0, -0.42, 0.5);
  put(bucketModel(mats), 0.8, 0, -0.62);
  put(drainModel(mats), 0.95, 0, 0.12);
  put(signModel(mats, ['DANGER', '2400 VOLTS'], 0.28, 0.14, { bg: 0xc8a030 }), -ROOM.W + 0.012, 1.86, -1.3, Math.PI / 2);
  put(signModel(mats, ['CHAIR No. 4'], 0.42, 0.11, { bg: 0xc8c0a0 }), 0.9, 2.62, BACK + 0.012);
  put(signModel(mats, ['KEEP CLEAR'], 0.36, 0.09, { bg: 0xc8a030 }), 0, HATCH_H + 0.36, BACK + 0.012);
  const fx = fixtureModel(mats);
  for (const [x, z] of SPOT.fixtures) { const f = fx.group.clone(); put(f, x, H - 0.25, z); }
  return g;
}

/** the tube fixtures' glowing tubes, one merged geometry for all four (world space) */
export function fixtureTubes(mats: Mats): THREE.BufferGeometry {
  const { tubeGeo } = fixtureModel(mats);
  const parts: number[] = [];
  const p = tubeGeo.attributes.position as THREE.BufferAttribute;
  for (const [x, z] of SPOT.fixtures) for (let i = 0; i < p.count; i++) parts.push(p.getX(i) + x, p.getY(i) + ROOM.H - 0.25, p.getZ(i) + z);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3)); g.computeVertexNormals();
  return g;
}
export { monitorModel };

// ------------------------------------------------------------------ blood
export function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a blood splat (alpha) for decals: a faceted core, drops flung outwards, a few runs; pixel-hard edges */
export function bloodCanvas(seed: number, size = 64, drip = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const cols = ['#4a0606', '#6a0a0a', '#7e1010', '#3a0404'];
  const blob = (x: number, y: number, r: number) => {
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
    const n = 5 + Math.floor(rnd() * 3);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd() * 0.5, rr = r * (0.7 + rnd() * 0.5); ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  };
  const c = size / 2;
  for (let i = 0; i < 9; i++) blob(c + (rnd() - 0.5) * size * 0.25, c + (rnd() - 0.5) * size * 0.25, size * (0.08 + rnd() * 0.12));
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, d = size * (0.18 + rnd() * 0.3); blob(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.8 + rnd() * size * 0.035); }
  if (drip) for (let i = 0; i < 5; i++) { const x = c + (rnd() - 0.5) * size * 0.4; ctx.fillStyle = cols[1]; ctx.fillRect(Math.round(x), c, 1 + Math.floor(rnd() * 2), Math.round(size * (0.2 + rnd() * 0.3))); }
  const d = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i + 3] = d.data[i + 3] > 90 ? 255 : 0;
    // a wet highlight speck here and there
    if (d.data[i + 3] && Math.random() < 0.015) { d.data[i] = 150; d.data[i + 1] = 40; d.data[i + 2] = 40; }
  }
  ctx.putImageData(d, 0, 0);
  return cv;
}

export { ngon };

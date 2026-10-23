import * as THREE from 'three';
import { Zone, CHUNK, TileObject, EdgeObj, Decal } from './zone';
import { floorDef, wallDef, wallpaperTex, WALL_H, WallDef } from './defs';
import { ModelBuilder } from '../gfx/modelBuilder';
import { atlas } from '../gfx/atlas';
import { mix3, wearRand, floorDamp, DAMP_GRADES as DAMP, SOOTY_GRADES as SOOTY } from './wear';
import { MAT, worldMaterial } from '../gfx/materials';
import { hash3 } from '../core/rng';
import { objDef, objectGeometry, ObjDef } from './objects';
import { G } from '../game/G';

const ROT_MATS = [0, 1, 2, 3].map((r) => new THREE.Matrix4().makeRotationY(-r * Math.PI / 2));

/** Variation pick for wall faces so repeated walls don't look copy-pasted */
const agedOf = new Map<string, string | null>();
function wallVariant(tex: string, x: number, y: number, side: number): string {
  const h = mix3(x, y, side + 77) % 100;
  if (tex === 'wall_yellow') {
    if (h < 14) return 'wall_yellow_b';
    if (h < 22) return 'wall_yellow_c';
    if (h < 26) return 'wall_yellow_d';
    return tex;
  }
  // every other wall has a damaged twin (src/content/textures/walls.ts): water, peeling, rust, mould
  let aged = agedOf.get(tex);
  if (aged === undefined) { aged = atlas().has(tex + '_aged') ? tex + '_aged' : null; agedOf.set(tex, aged); }
  return aged && h < 20 ? aged : tex;
}

export interface ChunkMeshes {
  group: THREE.Group;
  dispose(): void;
}

/**
 * Builds the merged static geometry for one 16x16 chunk: floors (with height
 * steps), edge walls with per-side wallpaper, door/window frames, static
 * furniture, foliage and decals. Dynamic parts (door leaves, glass) are
 * produced by the zone renderer.
 */
export function buildChunk(zone: Zone, cx: number, cy: number): ChunkMeshes {
  const floors = new ModelBuilder();
  const walls = new ModelBuilder();
  const props = new ModelBuilder();
  const propsLow = new ModelBuilder();
  const foliage = new ModelBuilder();
  const decals = new ModelBuilder();
  const glass = new ModelBuilder();
  const alphaWalls = new ModelBuilder();
  // ceilings exist only for the first-person eye (render layer 1; the iso camera sees layer 0)
  const ceil = new ModelBuilder();
  // horror wear scattered over walls (cut away with them) and floors
  const wear = new ModelBuilder();
  const wearFloor = new ModelBuilder();
  const gore = G?.sandbox?.gore !== 0;
  // building fabric stays square so walls, tiles and frames butt cleanly (furniture brings its own facets)
  for (const mb of [floors, walls, decals, glass, alphaWalls, foliage, ceil, wear, wearFloor]) mb.setFacets(false);
  const ceilH = ceilingHeight(zone), flav = ceilingFlavour(zone);
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  const x1 = Math.min(zone.W, x0 + CHUNK), y1 = Math.min(zone.H, y0 + CHUNK);

  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = zone.idx(x, y);
    const fid = zone.floor[i];
    const h = zone.height[i] * 0.1;
    if (fid) {
      const f = floorDef(fid);
      const v = zone.floorVar[i];
      const tex = f.tex[v % f.tex.length];
      // uv: world aligned so textures flow across tiles; optional rotation for organic surfaces
      const rot = f.rotate ? (hash3(x, y, 5) & 3) : 0;
      let uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let r = 0; r < rot; r++) uvs = [uvs[1], uvs[2], uvs[3], uvs[0]];
      floors.quadRaw([[x, h, y + 1], [x + 1, h, y + 1], [x + 1, h, y], [x, h, y]], uvs, tex, 0xffffff, 1, 0, 0, [0, 1, 0]);
      // vertical steps to lower neighbours (pool edges, ledges)
      const sideTex = f.side ?? (f.water ? 'wall_pool' : tex);
      const stepFace = (nx: number, ny: number, p: number[][]) => {
        const nh = zone.inb(nx, ny) && zone.floor[zone.idx(nx, ny)] ? zone.height[zone.idx(nx, ny)] * 0.1 : -3;
        if (nh < h - 0.01) {
          const pts = p.map((q) => [q[0], q[1] === 1 ? h : nh, q[2]]);
          floors.quadRaw(pts, [[0, nh / 2.7], [1, nh / 2.7], [1, h / 2.7], [0, h / 2.7]], sideTex, 0xd8d8d8, 0.9);
        }
      };
      stepFace(x, y + 1, [[x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 1, y + 1], [x, 1, y + 1]]);
      stepFace(x, y - 1, [[x + 1, 0, y], [x, 0, y], [x, 1, y], [x + 1, 1, y]]);
      stepFace(x + 1, y, [[x + 1, 0, y + 1], [x + 1, 0, y], [x + 1, 1, y], [x + 1, 1, y + 1]]);
      stepFace(x - 1, y, [[x, 0, y], [x, 0, y + 1], [x, 1, y + 1], [x, 1, y]]);
      if (!zone.floor[i] || f.water) { /* no wear on water */ } else floorWear(zone, wearFloor, x, y, h, gore);
      if (!zone.isOutdoor(x, y)) {
        const cy = (h >= 1 ? h : 0) + ceilH;
        const t = ceilingTex(flav, x, y), r = flav.mw;
        ceil.quadRaw([[x, cy, y], [x + 1, cy, y], [x + 1, cy, y + 1], [x, cy, y + 1]],
          [[x / r, y / r], [(x + 1) / r, y / r], [(x + 1) / r, (y + 1) / r], [x / r, (y + 1) / r]], t, flav.tint, 1, 0, 0, [0, -1, 0]);
      }
    }
    // ---- edge walls: north edge (between y-1 and y) and west edge (between x-1 and x)
    for (const side of [0, 1] as const) {
      const wid = side === 0 ? zone.wallN[i] : zone.wallW[i];
      const e = zone.edges.get(i * 2 + side);
      if (!wid && !e) continue;
      const w = wid ? wallDef(wid) : wallDef(1);
      // neighbour tile on the other side of the edge
      const ox = side === 1 ? x - 1 : x, oy = side === 0 ? y - 1 : y;
      const texIn = faceTex(zone, x, y, w, side);
      const texOut = faceTex(zone, ox, oy, w, side);
      const target = w.alpha ? alphaWalls : walls;
      target.swayDefault = side === 0 ? 1 : 2;
      emitWall(zone, target, glass, x, y, side, w, texIn, texOut, e, wid !== 0, w.alpha ? null : decals);
      target.swayDefault = 0;
      if (wid && !e && !w.alpha && !w.glass && !w.low) wallWear(zone, wear, x, y, side, w, gore);
    }
    // ---- static objects anchored on this tile
    const objs = zone.tileObjs.get(i);
    if (objs) for (const o of objs) {
      if (o.x !== x || o.y !== y) continue;
      const d = objDef(o.key);
      if (!d || d.dynamic) continue;
      const g = objectGeometry(d, o);
      if (!g) continue;
      const m = objectMatrix(zone, o, d);
      const target = d.foliage ? foliage : (d.height > 1.1 || d.tall) ? props : propsLow;
      // wall-mounted props are cut away together with the wall they hang on (axis 1 = wall along x, 2 = along z)
      target.appendGeometry(g, m, o.tint ?? 0xffffff, d.onWall && !d.foliage ? (o.rot % 2 === 0 ? 1 : 2) : undefined);
    }
  }
  // ceiling fixtures: diffusers that glow with their own light (negative emissive reads the light grid)
  for (const l of zone.lights) {
    if (l.x < x0 || l.x >= x1 || l.z < y0 || l.z >= y1 || l.y < 2.0) continue;
    const tx = Math.floor(l.x), ty = Math.floor(l.z);
    if (!zone.inb(tx, ty) || zone.isOutdoor(tx, ty) || !zone.floor[zone.idx(tx, ty)]) continue;
    const h = zone.heightAt(tx, ty);
    const cy = (h >= 1 ? h : 0) + ceilH - 0.01;
    const quad = (hx: number, hz: number, tex: string, tint: number, emis: number) =>
      ceil.quadRaw([[l.x - hx, cy, l.z - hz], [l.x + hx, cy, l.z - hz], [l.x + hx, cy, l.z + hz], [l.x - hx, cy, l.z + hz]], [[0, 0], [1, 0], [1, 1], [0, 1]], tex, tint, 1, emis, 0, [0, -1, 0]);
    if (l.kind === 'fluoro' || l.kind === 'sky') {
      const rm = zone.roomAt(tx, ty);
      const alongX = rm.id ? rm.x1 - rm.x0 > rm.y1 - rm.y0 : (l.id & 1) === 0;
      if (alongX) {
        // texture runs along its long side: swap the quad's axes by rotating the uvs
        ceil.quadRaw([[l.x - 0.6, cy, l.z - 0.3], [l.x + 0.6, cy, l.z - 0.3], [l.x + 0.6, cy, l.z + 0.3], [l.x - 0.6, cy, l.z + 0.3]], [[0, 0], [0, 1], [1, 1], [1, 0]], 'ceil_troffer', l.kind === 'sky' ? 0xd8e8ff : 0xffffff, 1, -1.5, 0, [0, -1, 0]);
      } else quad(0.3, 0.6, 'ceil_troffer', l.kind === 'sky' ? 0xd8e8ff : 0xffffff, -1.5);
    } else if (l.kind === 'bulb' || l.kind === 'emergency' || l.kind === 'sodium') {
      const s = l.kind === 'sodium' ? 0.3 : 0.15;
      quad(s, s, 'ceil_bulb', l.kind === 'emergency' ? 0xff6050 : l.color, -1.8);
    }
  }
  // decals inside this chunk (floor decals, and wall decals that get cut away with their wall)
  let wallDecals: ModelBuilder | null = null;
  const noBlood = G?.sandbox?.gore === 0;
  for (const dc of zone.decals) {
    if (dc.x < x0 || dc.x >= x1 || dc.z < y0 || dc.z >= y1) continue;
    if (dc.vert) { wallDecal(wallDecals ??= new ModelBuilder(), zone, dc); continue; }
    if (noBlood && dc.tex.startsWith('decal_blood')) continue; // gore off: no blood at all, not even the level's
    const fy = zone.heightAt(Math.floor(dc.x), Math.floor(dc.z)) + (dc.y ?? 0.012);
    decals.flat(dc.x, fy, dc.z, dc.w, dc.d, dc.tex, { rot: dc.rot, color: dc.tint ?? 0xffffff });
  }

  const group = new THREE.Group();
  const add = (mb: ModelBuilder, mat: THREE.Material, shadows = true, order = 0) => {
    if (mb.isEmpty) return;
    const mesh = new THREE.Mesh(mb.build(), mat);
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  add(floors, MAT.floor, false);
  add(walls, MAT.wall, true);
  add(alphaWalls, worldMaterial({ alphaTest: 0.5, doubleSide: true, cutout: true }), true);
  add(props, MAT.prop, true);
  add(propsLow, MAT.propLow, true);
  add(foliage, MAT.foliage, false);
  add(decals, MAT.decal, false, 1);
  if (wallDecals) add(wallDecals, worldMaterial({ transparent: true, outline: 0.0, depthWrite: false, cutout: true }), false, 1);
  add(wear, worldMaterial({ transparent: true, outline: 0.0, depthWrite: false, cutout: true }), false, 1);
  add(wearFloor, MAT.decal, false, 1);
  add(glass, MAT.glass, false, 2);
  if (!ceil.isEmpty) {
    const mesh = new THREE.Mesh(ceil.build(), worldMaterial({ outline: 0.0 }));
    mesh.layers.set(1);
    mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'ceiling';
    group.add(mesh);
  }
  return {
    group,
    dispose() { group.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); },
  };
}

/** vertical decal quad facing (cos rot, sin rot); shaded like the wall face it sits on, tagged with the wall axis for cutaways */
function wallDecal(mb: ModelBuilder, zone: Zone, dc: Decal) {
  const nx = Math.cos(dc.rot), nz = Math.sin(dc.rot);
  // the wall behind it may be gone (knocked down, a room that shifted): then so is the decal
  const tx = Math.floor(dc.x), ty = Math.floor(dc.z);
  const along = Math.abs(nz) >= Math.abs(nx);
  const ex = along ? tx : (nx > 0 ? tx : tx + 1), ey = along ? (nz > 0 ? ty : ty + 1) : ty;
  if (!zone.inb(ex, ey)) return;
  const wi = zone.idx(ex, ey), side = along ? 0 : 1;
  if (!(side === 0 ? zone.wallN[wi] : zone.wallW[wi]) || zone.edges.has(wi * 2 + side)) return;
  const ux = nz, uz = -nx; // tangent: (p1 - p0) x (p2 - p0) then points along the normal
  const hw = dc.w / 2, hh = dc.d / 2;
  const cy = zone.heightAt(Math.floor(dc.x), Math.floor(dc.z)) + (dc.y ?? 1.2);
  const shade = Math.abs(nz) >= Math.abs(nx) ? (nz > 0 ? 0.94 : 0.86) : (nx > 0 ? 0.9 : 0.82);
  mb.swayDefault = Math.abs(nz) >= Math.abs(nx) ? 1 : 2;
  mb.quadRaw(
    [[dc.x - ux * hw, cy - hh, dc.z - uz * hw], [dc.x + ux * hw, cy - hh, dc.z + uz * hw], [dc.x + ux * hw, cy + hh, dc.z + uz * hw], [dc.x - ux * hw, cy + hh, dc.z - uz * hw]],
    [[0, 0], [1, 0], [1, 1], [0, 1]], dc.tex, dc.tint ?? 0xffffff, shade, 0, 0, [nx, 0, nz]);
  mb.swayDefault = 0;
}

export function objectMatrix(zone: Zone, o: TileObject, d: ObjDef): THREE.Matrix4 {
  const w = d.w ?? 1, dd = d.d ?? 1;
  const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  const cx = o.x + rw / 2 + (o.ox ?? 0), cz = o.y + rd / 2 + (o.oz ?? 0);
  // wall-mounted props follow the floor they hang over unless given an explicit (absolute) state.y
  const h = d.onWall && o.state?.y !== undefined ? 0 : zone.heightAt(o.x, o.y);
  const m = new THREE.Matrix4().makeTranslation(cx, h + (o.state?.y ?? 0), cz);
  m.multiply(ROT_MATS[o.rot]);
  if (o.state?.yaw) m.multiply(new THREE.Matrix4().makeRotationY(o.state.yaw));
  return m;
}

function faceTex(zone: Zone, x: number, y: number, w: WallDef, _side: number): string {
  if (w.noWallpaper || !zone.inb(x, y)) return w.tex;
  const p = zone.paper[zone.idx(x, y)];
  return p ? wallpaperTex(p) : w.tex;
}

/**
 * Emit geometry for one edge. Walls are thin boxes centred on the edge line,
 * with each face textured from the room it faces. Openings (doors, windows,
 * arches) leave holes with lintels/sills and frames.
 */
function emitWall(zone: Zone, mb: ModelBuilder, glass: ModelBuilder, x: number, y: number, side: 0 | 1, w: WallDef, texIn: string, texOut: string, e: EdgeObj | undefined, hasWall: boolean, ao: ModelBuilder | null = null) {
  const H = w.height ?? WALL_H;
  const T = w.thick ?? 0.12;
  const baseH = Math.max(zone.heightAt(x, y), zone.heightAt(side === 1 ? x - 1 : x, side === 0 ? y - 1 : y));
  // local frame: along = +x for north edge, +z for west edge.
  // "in" face looks into tile (x,y): +z for north edge, +x for west edge.
  const vIn = wallVariant(texIn, x, y, side), vOut = wallVariant(texOut, x, y, side + 2);
  // contact shadow where a wall stands on a floor: a stepped dark strip on each side (pixel-art AO)
  const floorAt = (tx: number, ty: number) => zone.inb(tx, ty) && zone.floor[zone.idx(tx, ty)] !== 0 && Math.abs(zone.heightAt(tx, ty) - baseH) < 0.05;
  const aoIn = !!ao && floorAt(x, y), aoOut = !!ao && floorAt(side === 1 ? x - 1 : x, side === 0 ? y - 1 : y);
  const AOW = 0.26, fy = baseH + 0.004;
  const aoStrip = (a0: number, a1: number) => {
    if (!ao) return;
    if (side === 0) {
      // along x; the in side looks toward +z
      if (aoIn) ao.quadRaw([[x + a0, fy, y + T / 2 + AOW], [x + a1, fy, y + T / 2 + AOW], [x + a1, fy, y + T / 2], [x + a0, fy, y + T / 2]], [[0.995, 0], [0.995, 1], [0.005, 1], [0.005, 0]], 'ao_strip', 0xffffff, 1, 0, 0, [0, 1, 0]);
      if (aoOut) ao.quadRaw([[x + a0, fy, y - T / 2], [x + a1, fy, y - T / 2], [x + a1, fy, y - T / 2 - AOW], [x + a0, fy, y - T / 2 - AOW]], [[0.005, 0], [0.005, 1], [0.995, 1], [0.995, 0]], 'ao_strip', 0xffffff, 1, 0, 0, [0, 1, 0]);
    } else {
      // along z; the in side looks toward +x
      if (aoIn) ao.quadRaw([[x + T / 2, fy, y + a1], [x + T / 2 + AOW, fy, y + a1], [x + T / 2 + AOW, fy, y + a0], [x + T / 2, fy, y + a0]], [[0.005, 1], [0.995, 1], [0.995, 0], [0.005, 0]], 'ao_strip', 0xffffff, 1, 0, 0, [0, 1, 0]);
      if (aoOut) ao.quadRaw([[x - T / 2 - AOW, fy, y + a1], [x - T / 2, fy, y + a1], [x - T / 2, fy, y + a0], [x - T / 2 - AOW, fy, y + a0]], [[0.995, 1], [0.005, 1], [0.005, 0], [0.995, 0]], 'ao_strip', 0xffffff, 1, 0, 0, [0, 1, 0]);
    }
  };
  const seg = (a0: number, a1: number, h0: number, h1: number, ext0 = 0, ext1 = 0) => {
    // a0..a1 along the edge (0..1), h0..h1 vertical
    const A0 = a0 - ext0, A1 = a1 + ext1;
    if (h0 === 0 && !w.low) aoStrip(a0, a1);
    if (side === 0) {
      mb.boxMinMax(x + A0, baseH + h0, y - T / 2, x + A1, baseH + h1, y + T / 2,
        { south: vIn, north: vOut, east: vIn, west: vIn, top: w.top, bottom: w.top }, { uvOffset: [0, -baseH], ao: true });
    } else {
      mb.boxMinMax(x - T / 2, baseH + h0, y + A0, x + T / 2, baseH + h1, y + A1,
        { east: vIn, west: vOut, north: vIn, south: vIn, top: w.top, bottom: w.top }, { uvOffset: [0, -baseH], ao: true });
    }
  };
  const ext = T / 2; // overlap corners
  if (w.glass && !e) {
    // glass partition: metal frame in the opaque mesh, the pane goes to the transparent pass
    const fr = w.top || 'metal_grey';
    const frame = (a0: number, a1: number, h0: number, h1: number) => {
      if (side === 0) mb.boxMinMax(x + a0, baseH + h0, y - T / 2, x + a1, baseH + h1, y + T / 2, fr, { ao: true });
      else mb.boxMinMax(x - T / 2, baseH + h0, y + a0, x + T / 2, baseH + h1, y + a1, fr, { ao: true });
    };
    frame(-ext, 0.05, 0, H); frame(0.95, 1 + ext, 0, H);
    frame(0.05, 0.95, 0, 0.1); frame(0.05, 0.95, H - 0.08, H);
    if (side === 0) glass.boxMinMax(x + 0.05, baseH + 0.1, y - 0.015, x + 0.95, baseH + H - 0.08, y + 0.015, 'glass');
    else glass.boxMinMax(x - 0.015, baseH + 0.1, y + 0.05, x + 0.015, baseH + H - 0.08, y + 0.95, 'glass');
    return;
  }
  if (!e || !hasWall && e.kind === 'arch') {
    if (!e) { seg(0, 1, 0, H, ext, ext); return; }
  }
  if (e) {
    if (e.kind === 'door' || e.kind === 'gate' || e.kind === 'shutter') {
      const dw = 0.84; const dh = 2.1;
      const a0 = (1 - dw) / 2, a1 = a0 + dw;
      if (hasWall) {
        seg(0, a0, 0, H, ext, 0);
        seg(a1, 1, 0, H, 0, ext);
        if (H > dh) seg(a0, a1, dh, H);
      }
      // frame trims
      const frameTex = e.style.includes('metal') ? 'metal_grey' : e.style.includes('glass') ? 'metal_dark' : 'wood_trim';
      const ft = 0.05, fd = T + 0.04;
      if (side === 0) {
        mb.boxMinMax(x + a0 - ft, baseH, y - fd / 2, x + a0, baseH + dh, y + fd / 2, frameTex);
        mb.boxMinMax(x + a1, baseH, y - fd / 2, x + a1 + ft, baseH + dh, y + fd / 2, frameTex);
        mb.boxMinMax(x + a0 - ft, baseH + dh, y - fd / 2, x + a1 + ft, baseH + dh + ft, y + fd / 2, frameTex);
      } else {
        mb.boxMinMax(x - fd / 2, baseH, y + a0 - ft, x + fd / 2, baseH + dh, y + a0, frameTex);
        mb.boxMinMax(x - fd / 2, baseH, y + a1, x + fd / 2, baseH + dh, y + a1 + ft, frameTex);
        mb.boxMinMax(x - fd / 2, baseH + dh, y + a0 - ft, x + fd / 2, baseH + dh + ft, y + a1 + ft, frameTex);
      }
      return;
    }
    if (e.kind === 'arch') {
      const aw = 0.9, ah = 2.2;
      const a0 = (1 - aw) / 2, a1 = a0 + aw;
      if (hasWall) {
        seg(0, a0, 0, H, ext, 0);
        seg(a1, 1, 0, H, 0, ext);
        if (H > ah) seg(a0, a1, ah, H);
      }
      return;
    }
    if (e.kind === 'window') {
      const ww = 0.8, sill = 0.9, top = 2.0;
      const a0 = (1 - ww) / 2, a1 = a0 + ww;
      if (hasWall) {
        seg(0, a0, 0, H, ext, 0);
        seg(a1, 1, 0, H, 0, ext);
        seg(a0, a1, 0, sill);
        if (H > top) seg(a0, a1, top, H);
      }
      const frame = e.style.includes('metal') ? 'metal_grey' : 'window_frame';
      const ft = 0.045, fd = T + 0.03;
      if (side === 0) {
        mb.boxMinMax(x + a0 - ft, baseH + sill - ft, y - fd / 2, x + a1 + ft, baseH + sill, y + fd / 2 + 0.06, frame);
        mb.boxMinMax(x + a0 - ft, baseH + top, y - fd / 2, x + a1 + ft, baseH + top + ft, y + fd / 2, frame);
        mb.boxMinMax(x + a0 - ft, baseH + sill, y - fd / 2, x + a0, baseH + top, y + fd / 2, frame);
        mb.boxMinMax(x + a1, baseH + sill, y - fd / 2, x + a1 + ft, baseH + top, y + fd / 2, frame);
        if (e.glass === 'intact') glass.boxMinMax(x + a0, baseH + sill, y - 0.01, x + a1, baseH + top, y + 0.01, 'glass');
        else if (e.glass === 'broken') emitBrokenGlass(glass, x, y, side, a0, a1, baseH + sill, baseH + top);
      } else {
        mb.boxMinMax(x - fd / 2, baseH + sill - ft, y + a0 - ft, x + fd / 2 + 0.06, baseH + sill, y + a1 + ft, frame);
        mb.boxMinMax(x - fd / 2, baseH + top, y + a0 - ft, x + fd / 2, baseH + top + ft, y + a1 + ft, frame);
        mb.boxMinMax(x - fd / 2, baseH + sill, y + a0 - ft, x + fd / 2, baseH + top, y + a0, frame);
        mb.boxMinMax(x - fd / 2, baseH + sill, y + a1, x + fd / 2, baseH + top, y + a1 + ft, frame);
        if (e.glass === 'intact') glass.boxMinMax(x - 0.01, baseH + sill, y + a0, x + 0.01, baseH + top, y + a1, 'glass');
        else if (e.glass === 'broken') emitBrokenGlass(glass, x, y, side, a0, a1, baseH + sill, baseH + top);
      }
      // curtains / barricades are dynamic (zone renderer)
      return;
    }
  }
  seg(0, 1, 0, H, ext, ext);
}

function emitBrokenGlass(glass: ModelBuilder, x: number, y: number, side: number, a0: number, a1: number, yb: number, yt: number) {
  // jagged shards remaining in the frame
  const shards: [number, number, number][] = [[0, 0.0, 0.35], [0.7, 0.0, 0.25], [0.15, 0.8, 0.2], [0.85, 0.75, 0.25]];
  for (const [u, v, s] of shards) {
    const au = a0 + (a1 - a0) * u, hv = yb + (yt - yb) * v;
    const p = side === 0
      ? [[x + au, hv, y], [x + au + s * 0.5, hv, y], [x + au + s * 0.2, hv + s, y]]
      : [[x, hv, y + au], [x, hv, y + au + s * 0.5], [x, hv + s, y + au + s * 0.2]];
    glass.triRaw(p, [[0, 0], [1, 0], [0.5, 1]], 'glass');
  }
}

// ---------------------------------------------------------------- horror wear
const BARE = /concrete|cinder|tunnel|garage|server|brick/;

/** a decal quad standing just proud of one face of an edge wall; a = centre along the edge (0..1) */
function faceDecal(mb: ModelBuilder, side: 0 | 1, x: number, y: number, out: boolean, T: number, a: number, w: number, y0: number, y1: number, tex: string, tint = 0xffffff) {
  const off = T / 2 + 0.006;
  mb.swayDefault = side === 0 ? 1 : 2;
  if (side === 0) {
    const z = out ? y - off : y + off, xa = x + a - w / 2, xb = x + a + w / 2;
    const pts = out ? [[xb, y0, z], [xa, y0, z], [xa, y1, z], [xb, y1, z]] : [[xa, y0, z], [xb, y0, z], [xb, y1, z], [xa, y1, z]];
    mb.quadRaw(pts, [[0, 0], [1, 0], [1, 1], [0, 1]], tex, tint, out ? 0.86 : 0.94, 0, 0, [0, 0, out ? -1 : 1]);
  } else {
    const xp = out ? x - off : x + off, za = y + a - w / 2, zb = y + a + w / 2;
    const pts = out ? [[xp, y0, za], [xp, y0, zb], [xp, y1, zb], [xp, y1, za]] : [[xp, y0, zb], [xp, y0, za], [xp, y1, za], [xp, y1, zb]];
    mb.quadRaw(pts, [[0, 0], [1, 0], [1, 1], [0, 1]], tex, tint, out ? 0.82 : 0.9, 0, 0, [out ? -1 : 1, 0, 0]);
  }
  mb.swayDefault = 0;
}

/** water runs from the ceiling joint, mould out of the corners, rust from fixings, soot, bloody hands */
function wallWear(zone: Zone, mb: ModelBuilder, x: number, y: number, side: 0 | 1, w: WallDef, gore: boolean) {
  const g = zone.env.grade, damp = DAMP.has(g);
  const H = w.height ?? WALL_H, T = w.thick ?? 0.12;
  for (const out of [false, true]) {
    const tx = out && side === 1 ? x - 1 : x, ty = out && side === 0 ? y - 1 : y;
    if (!zone.inb(tx, ty) || !zone.floor[zone.idx(tx, ty)]) continue;
    const base = zone.heightAt(tx, ty);
    const r = (k: number) => (mix3(x * 2 + side, y * 2 + (out ? 1 : 0), k) % 10000) / 10000;
    const a = 0.3 + r(1) * 0.4;
    if (r(2) < (damp ? 0.07 : 0.035)) faceDecal(mb, side, x, y, out, T, a, 0.8, base + H - 1.7, base + H - 0.02, 'hd_water_run');
    if (r(3) < (damp ? 0.08 : 0.03)) faceDecal(mb, side, x, y, out, T, r(4) < 0.5 ? 0.22 : 0.78, 0.75, base + 0.004, base + 0.75, 'hd_mould');
    if (BARE.test(w.tex) && r(5) < 0.07) faceDecal(mb, side, x, y, out, T, 0.2 + r(6) * 0.6, 0.3, base + H - 1.95, base + H - 0.45, 'hd_rust');
    if (SOOTY.has(g) && r(7) < 0.018) faceDecal(mb, side, x, y, out, T, 0.5, 0.95, base + 0.004, base + 1.9, 'hd_soot');
    if (gore && zone.env.grade !== 'exit') {
      if (r(8) < 0.011) faceDecal(mb, side, x, y, out, T, 0.25 + r(9) * 0.5, 0.3, base + 0.95 + r(10) * 0.35, base + 1.55 + r(10) * 0.35, 'hd_handprint');
      else if (r(11) < 0.007) faceDecal(mb, side, x, y, out, T, 0.5, 0.85, base + 0.55, base + 1.4, 'hd_hand_smear');
    }
  }
}

/** damp patches, scorch marks, and (gore on) something dragged across the floor */
function floorWear(zone: Zone, mb: ModelBuilder, x: number, y: number, h: number, gore: boolean) {
  const g = zone.env.grade;
  const r = (k: number) => wearRand(x, y, k);
  const fy = h + 0.008;
  const rot = Math.floor(r(1) * 4) * Math.PI / 2 + (r(2) - 0.5) * 0.5;
  if (zone.isOutdoor(x, y)) return;
  if (floorDamp(zone, x, y)) mb.flat(x + 0.5, fy, y + 0.5, 1.1, 1.0, 'hd_damp', { rot });
  else if (SOOTY.has(g) && r(4) < 0.008) mb.flat(x + 0.5, fy, y + 0.5, 1.0, 1.0, 'decal_scorch', { rot });
  if (gore && g !== 'exit' && r(5) < 0.004) mb.flat(x + 0.5, fy + 0.002, y + 0.5, 0.9, 1.8, 'hd_drag', { rot });
}

// ---------------------------------------------------------------- ceilings (first person only)
interface CeilFlavour { kind: 'tile' | 'concrete' | 'plaster'; tint: number; mw: number }
const ceilCache = new WeakMap<Zone, { h: number; f: CeilFlavour }>();
function ceilingInfo(zone: Zone) {
  let c = ceilCache.get(zone);
  if (!c) {
    // tall fixtures (sodium lamps in the garage) lift the slab above them
    let top = 0;
    for (const l of zone.lights) if (l.kind === 'sodium' || l.kind === 'sky') top = Math.max(top, l.y);
    const h = top > WALL_H ? Math.min(6, top + 0.2) : WALL_H;
    const g = zone.env.grade;
    const T: Record<string, number> = { lobby: 0xd8cb94, office: 0xc6cacc, school: 0xd8d0bc, hospital: 0xd0dad4, mall: 0xdcd2cc, lab: 0xd0d8de, market: 0xc8c8be, exit: 0xf0f0ee };
    let f: CeilFlavour;
    if (['parking', 'tunnels', 'server', 'stairwell', 'corrupt', 'void'].includes(g)) f = { kind: 'concrete', tint: g === 'server' ? 0xa8b0bc : 0xffffff, mw: 1 };
    else if (['house', 'suburbs', 'homestead'].includes(g)) f = { kind: 'plaster', tint: 0xf0e8dc, mw: 1 };
    else if (g === 'pool') f = { kind: 'concrete', tint: 0xd8eef0, mw: 1 };
    else f = { kind: 'tile', tint: T[g] ?? 0xd0ccc0, mw: 1.25 };
    c = { h, f };
    ceilCache.set(zone, c);
  }
  return c;
}
function ceilingHeight(zone: Zone) { return ceilingInfo(zone).h; }
function ceilingFlavour(zone: Zone) { return ceilingInfo(zone).f; }
function ceilingTex(f: CeilFlavour, x: number, y: number): string {
  if (f.kind === 'concrete') return 'ceil_concrete';
  if (f.kind === 'plaster') return 'ceil_plaster';
  const h = mix3(x, y, 91) % 100;
  return h < 5 ? 'ceil_tile_stain' : h < 7 ? 'ceil_tile_sag' : h < 9 ? 'ceil_tile_gap' : h < 10 ? 'ceil_tile_mould' : 'ceil_tile';
}

export function makeChunkMaterialsWarm() {
  // touch materials so shaders compile up-front
  void MAT.floor; void MAT.wall; void MAT.prop; void MAT.propLow; void MAT.foliage; void MAT.decal; void MAT.glass;
  void worldMaterial({});
}

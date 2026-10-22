import * as THREE from 'three';
import { Zone, CHUNK, TileObject, EdgeObj, Decal } from './zone';
import { floorDef, wallDef, wallpaperTex, WALL_H, WallDef } from './defs';
import { ModelBuilder } from '../gfx/modelBuilder';
import { MAT, worldMaterial } from '../gfx/materials';
import { hash3 } from '../core/rng';
import { objDef, objectGeometry, ObjDef } from './objects';
import { G } from '../game/G';

const ROT_MATS = [0, 1, 2, 3].map((r) => new THREE.Matrix4().makeRotationY(-r * Math.PI / 2));

/** Variation pick for wall faces so repeated walls don't look copy-pasted */
function wallVariant(tex: string, x: number, y: number, side: number): string {
  if (tex === 'wall_yellow') {
    const h = hash3(x, y, side + 77) % 100;
    if (h < 14) return 'wall_yellow_b';
    if (h < 22) return 'wall_yellow_c';
    if (h < 26) return 'wall_yellow_d';
  }
  return tex;
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
  // building fabric stays square so walls, tiles and frames butt cleanly (furniture brings its own facets)
  for (const mb of [floors, walls, decals, glass, alphaWalls, foliage]) mb.setFacets(false);
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
  add(glass, MAT.glass, false, 2);
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

export function makeChunkMaterialsWarm() {
  // touch materials so shaders compile up-front
  void MAT.floor; void MAT.wall; void MAT.prop; void MAT.propLow; void MAT.foliage; void MAT.decal; void MAT.glass;
  void worldMaterial({});
}

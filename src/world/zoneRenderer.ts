import * as THREE from 'three';
import { Zone, CHUNK, EdgeObj, TileObject } from './zone';
import { buildChunk, ChunkMeshes, objectMatrix } from './chunkMesher';
import { ModelBuilder } from '../gfx/modelBuilder';
import { MAT, worldMaterial } from '../gfx/materials';
import { wallDef, WALL_H } from './defs';
import { objDef, objectGeometry } from './objects';

interface DynEdge { mesh: THREE.Object3D; key: number; style: string; barricade: number; curtains?: string; }

/**
 * Keeps chunk meshes around the camera alive, rebuilds dirty chunks with a
 * small per-frame budget, and animates dynamic edge parts (door leaves,
 * curtains, barricade planks).
 */
export class ZoneRenderer {
  zone: Zone;
  root = new THREE.Group();
  chunks = new Map<number, ChunkMeshes>();
  dynEdges = new Map<number, DynEdge>();
  dynObjs = new Map<number, THREE.Mesh>();
  radiusChunks = 4;

  constructor(zone: Zone) {
    this.zone = zone;
    this.root.name = 'zone:' + zone.key;
  }

  dispose() {
    for (const c of this.chunks.values()) { c.dispose(); }
    this.chunks.clear();
    this.root.clear();
  }

  update(camX: number, camZ: number, viewRadius: number, dt: number) {
    const z = this.zone;
    const ccx = Math.floor(camX / CHUNK), ccy = Math.floor(camZ / CHUNK);
    const r = Math.ceil(viewRadius / CHUNK) + 1;
    this.radiusChunks = r;
    // rebuild dirty chunks that are loaded (budget)
    let budget = 3;
    for (const ci of [...z.dirtyChunks]) {
      if (!this.chunks.has(ci)) { z.dirtyChunks.delete(ci); continue; }
      if (budget-- <= 0) break;
      z.dirtyChunks.delete(ci);
      this.rebuildChunk(ci);
    }
    // load nearby, nearest first
    const want: [number, number, number][] = [];
    for (let y = ccy - r; y <= ccy + r; y++) for (let x = ccx - r; x <= ccx + r; x++) {
      if (x < 0 || y < 0 || x >= z.chunksX || y >= z.chunksY) continue;
      const ci = y * z.chunksX + x;
      if (!this.chunks.has(ci)) want.push([ci, x, y]);
    }
    want.sort((a, b) => (Math.abs(a[1] - ccx) + Math.abs(a[2] - ccy)) - (Math.abs(b[1] - ccx) + Math.abs(b[2] - ccy)));
    let loads = this.chunks.size === 0 ? 999 : 2;
    for (const [ci] of want) { if (loads-- <= 0) break; this.rebuildChunk(ci); }
    // unload far chunks
    for (const [ci, c] of this.chunks) {
      const x = ci % z.chunksX, y = Math.floor(ci / z.chunksX);
      if (Math.abs(x - ccx) > r + 1 || Math.abs(y - ccy) > r + 1) {
        this.root.remove(c.group); c.dispose(); this.chunks.delete(ci);
      }
    }
    this.updateDynamicEdges(camX, camZ, viewRadius, dt);
    this.updateDynamicObjects(camX, camZ, viewRadius);
  }

  rebuildChunk(ci: number) {
    const z = this.zone;
    const old = this.chunks.get(ci);
    if (old) { this.root.remove(old.group); old.dispose(); }
    const cx = ci % z.chunksX, cy = Math.floor(ci / z.chunksX);
    const c = buildChunk(z, cx, cy);
    this.chunks.set(ci, c);
    this.root.add(c.group);
  }

  rebuildAll() { for (const ci of [...this.chunks.keys()]) this.rebuildChunk(ci); }

  // ---------------- doors & windows ----------------
  private updateDynamicEdges(camX: number, camZ: number, R: number, dt: number) {
    const z = this.zone;
    const seen = new Set<number>();
    const x0 = Math.max(0, Math.floor(camX - R)), x1 = Math.min(z.W - 1, Math.ceil(camX + R));
    const y0 = Math.max(0, Math.floor(camZ - R)), y1 = Math.min(z.H - 1, Math.ceil(camZ + R));
    for (const [key, e] of z.edges) {
      const ti = key >> 1, side = key & 1;
      const x = ti % z.W, y = Math.floor(ti / z.W);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      seen.add(key);
      let d = this.dynEdges.get(key);
      if (d && (d.style !== e.style || d.barricade !== e.barricade || d.curtains !== e.curtains)) {
        this.root.remove(d.mesh); disposeObj(d.mesh); this.dynEdges.delete(key); d = undefined;
      }
      if (!d) {
        const mesh = buildEdgeDynamic(z, x, y, side as 0 | 1, e);
        if (!mesh) continue;
        d = { mesh, key, style: e.style, barricade: e.barricade, curtains: e.curtains };
        this.dynEdges.set(key, d);
        this.root.add(mesh);
      }
      // door swing animation
      const target = e.open ? 1 : 0;
      e.anim = e.anim ?? target;
      e.anim += (target - e.anim) * Math.min(1, dt * 9);
      const leaf = d.mesh.getObjectByName('leaf');
      if (leaf) leaf.rotation.y = (e.swing ?? 1) * (e.hinge ? -1 : 1) * e.anim * Math.PI * 0.5;
    }
    for (const [key, d] of this.dynEdges) if (!seen.has(key)) { this.root.remove(d.mesh); disposeObj(d.mesh); this.dynEdges.delete(key); }
  }

  private updateDynamicObjects(camX: number, camZ: number, R: number) {
    const z = this.zone;
    const seen = new Set<number>();
    for (const o of z.objects.values()) {
      const d = objDef(o.key);
      if (!d?.dynamic) continue;
      if (Math.abs(o.x - camX) > R + 2 || Math.abs(o.y - camZ) > R + 2) continue;
      seen.add(o.uid);
      let m = this.dynObjs.get(o.uid);
      const g = objectGeometry(d, o);
      if (!g) continue;
      if (!m || m.geometry !== g) {
        if (m) this.root.remove(m);
        m = new THREE.Mesh(g, d.height > 1.1 || d.tall ? MAT.prop : MAT.propLow);
        m.castShadow = !d.noShadow; m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        this.dynObjs.set(o.uid, m);
        this.root.add(m);
      }
      m.matrix.copy(objectMatrix(z, o, d));
      m.matrixWorldNeedsUpdate = true;
    }
    for (const [uid, m] of this.dynObjs) if (!seen.has(uid)) { this.root.remove(m); this.dynObjs.delete(uid); }
  }

  /** world-space highlight overlay for an object (hover) */
  highlightMesh(o: TileObject): THREE.Mesh | null {
    const d = objDef(o.key); if (!d) return null;
    const g = objectGeometry(d, o); if (!g) return null;
    const m = new THREE.Mesh(g, MAT.highlight);
    m.matrixAutoUpdate = false;
    m.matrix.copy(objectMatrix(this.zone, o, d));
    m.renderOrder = 5;
    return m;
  }
}

function disposeObj(o: THREE.Object3D) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
}

/** Door leaf (hinged), curtains, barricade planks for an edge */
function buildEdgeDynamic(z: Zone, x: number, y: number, side: 0 | 1, e: EdgeObj): THREE.Object3D | null {
  const g = new THREE.Group();
  const wid = side === 0 ? z.wallN[z.idx(x, y)] : z.wallW[z.idx(x, y)];
  const w = wid ? wallDef(wid) : null;
  const T = w?.thick ?? 0.12;
  const baseH = Math.max(z.heightAt(x, y), z.heightAt(side === 1 ? x - 1 : x, side === 0 ? y - 1 : y));
  // local frame: origin at edge start, +x along the edge, +z toward tile (x,y)
  // west edges: start at (x, y+1), run toward -z, local +z points into tile (x,y)
  if (side === 1) { g.position.set(x, baseH, y + 1); g.rotation.y = Math.PI / 2; }
  else g.position.set(x, baseH, y);
  const bside = e.barricadeSide ?? 1;
  if (e.kind === 'door' || e.kind === 'gate' || e.kind === 'shutter') {
    const dw = 0.84, dh = 2.08;
    const a0 = (1 - dw) / 2;
    const mb = new ModelBuilder();
    mb.swayDefault = side === 0 ? 1 : 2;
    const tex = doorTex(e.style);
    // leaf modelled from hinge at origin, extending +x
    const th = 0.05;
    if (e.kind === 'gate') {
      mb.box(dw / 2, 0.05, 0, dw - 0.02, 1.1, th, 'fence_wood');
    } else {
      mb.box(dw / 2, 0.01, 0, dw - 0.02, dh - 0.02, th, { south: tex, north: tex, east: 'wood_trim', west: 'wood_trim', top: 'wood_trim', bottom: 'wood_trim' }, { fit: { south: true, north: true } });
      // handle
      mb.box(dw - 0.1, 0.98, th / 2 + 0.02, 0.1, 0.03, 0.04, 'metal_brass');
      mb.box(dw - 0.1, 0.98, -th / 2 - 0.02, 0.1, 0.03, 0.04, 'metal_brass');
      if (e.style.includes('glass')) mb.box(dw / 2, 1.2, 0, 0.4, 0.6, th + 0.01, 'glass_dark', { fit: true });
      if (e.sign) mb.box(dw / 2, 1.55, th / 2 + 0.006, 0.36, 0.12, 0.01, 'sign_' + e.sign, { fit: true });
    }
    const leafMesh = new THREE.Mesh(mb.build(), MAT.prop);
    leafMesh.castShadow = true; leafMesh.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.name = 'leaf';
    const hingeAtEnd = e.hinge === 1;
    if (hingeAtEnd) { pivot.position.set(a0 + dw, 0, 0); leafMesh.scale.x = -1; }
    else pivot.position.set(a0, 0, 0);
    pivot.add(leafMesh);
    g.add(pivot);
  }
  if (e.kind === 'window') {
    if (e.curtains && e.curtains !== 'none') {
      const mb = new ModelBuilder();
      const closed = e.curtains === 'closed';
      const cw = closed ? 0.42 : 0.14;
      const cz = (e.curtainSide ?? 1) * (T / 2 + 0.05);
      mb.box(0.1 + cw / 2, 0.88, cz, cw, 1.2, 0.03, 'curtain', { fit: true });
      mb.box(0.9 - cw / 2, 0.88, cz, cw, 1.2, 0.03, 'curtain', { fit: true });
      mb.box(0.5, 2.08, cz, 0.95, 0.03, 0.03, 'metal_grey');
      const m = new THREE.Mesh(mb.build(), MAT.prop); m.castShadow = true;
      g.add(m);
    }
  }
  if (e.barricade > 0) {
    const mb = new ModelBuilder();
    const n = Math.min(4, e.barricade);
    const isDoor = e.kind !== 'window';
    for (let i = 0; i < n; i++) {
      const yy = isDoor ? 0.45 + i * 0.42 : 1.0 + i * 0.26;
      const tilt = ((i * 37) % 7 - 3) * 0.035;
      mb.push().translate(0.5, yy, bside * (0.03 + T / 2)).rotateZ(tilt);
      mb.box(0, 0, 0, 1.05, 0.13, 0.035, 'plank');
      mb.box(-0.42, 0.04, 0.02, 0.025, 0.025, 0.02, 'metal_grey');
      mb.box(0.42, 0.04, 0.02, 0.025, 0.025, 0.02, 'metal_grey');
      mb.pop();
    }
    if (e.barricade >= 5) mb.box(0.5, isDoor ? 0.05 : 0.85, bside * (0.06 + T / 2), 0.98, isDoor ? 2.0 : 1.2, 0.02, 'metal_sheet');
    const m = new THREE.Mesh(mb.build(), MAT.prop); m.castShadow = true;
    g.add(m);
  }
  if (!g.children.length) return null;
  g.updateMatrixWorld(true);
  return g;
}

function doorTex(style: string): string {
  switch (style) {
    case 'door_metal': return 'door_metal';
    case 'door_office': return 'door_office';
    case 'door_glass': return 'door_office';
    case 'door_house': return 'door_house';
    case 'door_red': return 'door_red';
    case 'door_hospital': return 'door_hospital';
    case 'door_school': return 'door_school';
    case 'door_lab': return 'door_lab';
    case 'door_white': return 'door_white';
    default: return 'door_wood';
  }
}

export { WALL_H, worldMaterial };

// The build-mode clipboard, held in first person (fp stage 'build'): a masonite
// board with a steel clip and a blueprint sheet. The sheet shows the selected
// piece as a turning blue scale model, its typed name and the salvage it costs
// (ticked or crossed in red pencil). Category tabs and page corners are on the
// paper; a bakelite toggle on the edge arms the demolish cutter. Clipped on
// top: a painted-steel bar of needle gauges for the settlement you stand in
// (defence, comfort, food, power) and the torch's gas, with a stamped rank plate.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../fp/fp';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';
import { objDef, objectGeometry } from '../world/objects';
import { itemDef } from '../items/item';
import { researchNode } from '../game/research';
import { lerp, clamp } from '../core/math';
import { Sheet, sheetMesh, overlayRay } from './paper';
import { PIECES, CAT_NAMES, type Piece, type PieceCat } from './pieces';
import type { SettleStats } from './settlement';

const SW = 120, SH = 148;           // sheet pixels
const PW = 0.27, PH = PW * SH / SW; // sheet metres
const CATS = Object.keys(CAT_NAMES) as PieceCat[];
const TAB: Record<PieceCat, string> = { struct: 'STR', machine: 'MCH', defense: 'DEF', living: 'LIV', farm: 'FRM' };
const WHITE = 0xe8f0ff, PALE = 0x9fc0ea, RED = 0xe0503a;

export interface BoardState { pc: Piece; idx: number; total: number; cat: PieceCat; unlocked: boolean; have: (k: string) => number; demolish: boolean; gas: number | null; tool: string; stats: SettleStats | null; claimName: string }
export type BoardHit = { kind: 'tab'; cat: PieceCat } | { kind: 'prev' } | { kind: 'next' } | { kind: 'demo' } | { kind: 'board' };

interface Gauge { needle: THREE.Object3D; v: number; target: number }

export class Clipboard {
  shown = false;
  private g: THREE.Group;
  private rig = new THREE.Group();
  private sheet = new Sheet(SW, SH);
  private sheetM: THREE.Mesh;
  private board: THREE.Mesh;
  private mini = new THREE.Group();
  private miniMesh: THREE.Mesh;
  private miniKey = '';
  private gauges: Gauge[] = [];
  private rank = new Sheet(64, 11);
  private lever = new THREE.Group();
  private sig = '';
  private raise = 0;
  private ray = new THREE.Raycaster();
  private hits: THREE.Object3D[] = [];
  private toggleM: THREE.Mesh;

  constructor() {
    this.g = fpGroup('build');
    this.g.add(this.rig);
    const M = worldMaterial({ noVis: true, noFog: true, noGrid: true, bpTag: 'board' } as any);
    // ---- masonite board, steel clip
    const bb = new ModelBuilder();
    bb.box(0, -0.2, 0, 0.3, 0.4, 0.008, 'wood_dark', { color: 0x8a6a4a });
    bb.box(0, 0.17, 0.006, 0.12, 0.035, 0.012, 'metal_grey');
    bb.cylinderX(0, 0.172, 0.014, 0.006, 0.1, 6, 'chrome');
    for (const x of [-0.05, 0.05]) bb.box(x, 0.16, 0.012, 0.01, 0.01, 0.006, 'metal_dark');
    this.board = new THREE.Mesh(bb.build(), M);
    this.board.rotation.x = 0; this.rig.add(this.board);
    // ---- the blueprint sheet (slightly curled: two planes, one tilted)
    this.sheetM = sheetMesh(this.sheet, PW, PH);
    this.sheetM.position.set(0, 0.145 - PH / 2, 0.0055);
    this.rig.add(this.sheetM);
    // ---- the scale model stands on the paper
    this.miniMesh = new THREE.Mesh(new THREE.BufferGeometry(), worldMaterial({ noVis: true, noFog: true, noGrid: true, bpTag: 'mini' } as any));
    (this.miniMesh.material as THREE.MeshLambertMaterial).color.setHex(0xcfe2ff);
    this.mini.add(this.miniMesh);
    this.mini.rotation.x = Math.PI / 2;
    this.mini.position.set(0, this.uvY(0.47), 0.012);
    this.rig.add(this.mini);
    // ---- gauge bar
    const gb = new ModelBuilder();
    gb.box(0, 0.19, -0.004, 0.31, 0.09, 0.016, 'metal_painted_green');
    for (const x of [-0.15, 0.15]) gb.cylinder(x, 0.19, 0.005, 0.006, 0.006, 6, 'chrome');
    gb.box(0, 0.19, -0.012, 0.02, 0.04, 0.02, 'metal_dark');
    this.rig.add(new THREE.Mesh(gb.build(), M));
    const labels: [string, 'low' | 'high' | 'none'][] = [['DEF', 'low'], ['CMF', 'low'], ['FOOD', 'low'], ['PWR', 'low'], ['GAS', 'low']];
    labels.forEach(([lab, red], i) => {
      const x = -0.12 + i * 0.06, y = 0.24;
      const bez = new ModelBuilder(); bez.cylinder(0, 0, 0, 0.026, 0.01, 14, 'chrome');
      const bm = new THREE.Mesh(bez.build(), M); bm.rotation.x = Math.PI / 2; bm.position.set(x, y, -0.002); this.rig.add(bm);
      const face = new Sheet(32, 32); face.gaugeFace(lab, red); face.commit();
      const fm = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshLambertMaterial({ map: face.tex }));
      fm.position.set(x, y, 0.0096); this.rig.add(fm);
      const nb = new ModelBuilder(); nb.box(0, 0, 0, 0.0025, 0.019, 0.001, 'white', { color: 0xc8302a });
      const needle = new THREE.Group(); const nm = new THREE.Mesh(nb.build(), M); needle.add(nm);
      needle.position.set(x, y - 0.002, 0.0105); this.rig.add(needle);
      const hub = new ModelBuilder(); hub.cylinder(0, 0, 0, 0.003, 0.002, 6, 'metal_dark');
      const hm = new THREE.Mesh(hub.build(), M); hm.rotation.x = Math.PI / 2; hm.position.set(x, y - 0.002, 0.011); this.rig.add(hm);
      this.gauges.push({ needle, v: 0, target: 0 });
    });
    const rm = sheetMesh(this.rank, 0.11, 0.11 * 11 / 64); rm.position.set(0.0, 0.19, 0.0128); this.rig.add(rm);
    // ---- demolish toggle on the right edge (bakelite base, steel lever)
    const tb = new ModelBuilder(); tb.box(0, -0.016, 0, 0.034, 0.032, 0.014, 'plastic_black'); tb.box(0, 0.02, 0.002, 0.03, 0.012, 0.003, 'bt_hazard', { fit: true });
    this.toggleM = new THREE.Mesh(tb.build(), M); this.toggleM.position.set(0.168, -0.05, 0.006); this.rig.add(this.toggleM);
    const lb = new ModelBuilder(); lb.cylinder(0, 0, 0, 0.004, 0.026, 6, 'chrome'); lb.sphere(0, 0.027, 0, 0.0065, 6, 4, 'plastic_red');
    const lm = new THREE.Mesh(lb.build(), M); this.lever.add(lm); this.lever.position.set(0.168, -0.05, 0.014); this.rig.add(this.lever);
    // lights of its own (the stage may have none)
    const key = new THREE.DirectionalLight(0xfff2e0, 1.0); key.position.set(-0.5, 0.8, 1); this.g.add(key);
    this.g.add(new THREE.AmbientLight(0xb8c0d0, 0.55));
    // held low and to the left (the body gauges live on the right), tilted toward you
    this.rig.scale.setScalar(0.86);
    this.rig.rotation.set(-0.28, 0.32, -0.05);
    this.hits = [this.board, this.sheetM, this.toggleM, lm];
    bus.on('fpChange', (n: string | null) => { if (n === null && this.shown) setTimeout(() => { if (this.shown && !fpOwner()) fpClaim('build', 2); }, 0); });
  }

  private uvY(v: number) { return this.sheetM.position.y + (0.5 - v) * PH; }

  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    if (on) { fpClaim('build', 2); this.raise = 0; this.sig = ''; }
    else fpRelease('build');
  }

  /** what the cursor is over on the board (null: the world) */
  hit(cx: number, cy: number): BoardHit | null {
    if (!this.shown || fpOwner() !== 'build' || this.raise < 0.6) return null;
    overlayRay(this.ray, fpCamera(), cx, cy);
    const h = this.ray.intersectObjects(this.hits, false)[0];
    if (!h) return null;
    if (h.object === this.toggleM || h.object.parent === this.lever) return { kind: 'demo' };
    if (h.object === this.sheetM && h.uv) {
      const px = h.uv.x * SW, py = (1 - h.uv.y) * SH;
      if (py < 14) { const i = Math.floor((px - 3) / 23); if (i >= 0 && i < CATS.length) return { kind: 'tab', cat: CATS[i] }; }
      if (py > SH - 16 && px < 22) return { kind: 'prev' };
      if (py > SH - 16 && px > SW - 22) return { kind: 'next' };
    }
    return { kind: 'board' };
  }

  update(dt: number, st: BoardState) {
    if (!this.shown) return;
    if (fpOwner() !== 'build') { if (!fpOwner()) fpClaim('build', 2); return; }
    this.raise = Math.min(1, this.raise + dt * 3.5);
    const e = 1 - Math.pow(1 - this.raise, 3);
    this.rig.position.set(-0.37, lerp(-0.62, -0.13, e) + Math.sin(G.time * 1.3) * 0.003, -1.02);
    // scale model of the piece
    const mk = st.pc.key;
    if (mk !== this.miniKey) { this.miniKey = mk; this.buildMini(st.pc); }
    this.mini.rotation.y = 0; this.miniMesh.rotation.y = G.time * 0.6;
    (this.miniMesh.material as THREE.MeshLambertMaterial).color.setHex(st.unlocked ? 0xcfe2ff : 0x8a9ab8);
    // gauges
    const s = st.stats;
    const vals = [s ? s.def / 40 : 0, s ? s.comfort / 30 : 0, s ? s.food / 25 : 0, s ? (s.power + 4) / 14 : 0, st.gas ?? 0];
    this.gauges.forEach((gg, i) => {
      gg.target = clamp(vals[i], 0, 1);
      gg.v = lerp(gg.v, gg.target, 1 - Math.exp(-dt * 4));
      gg.needle.rotation.z = Math.PI * (0.75 - gg.v * 1.5) + Math.sin(G.time * 23 + i) * 0.01;
    });
    this.lever.rotation.z = lerp(this.lever.rotation.z, st.demolish ? -0.6 : 0.6, 1 - Math.exp(-dt * 14));
    // the paper (redrawn only when something on it changes)
    const cost = st.pc.cost.map(([k, n]) => `${k}:${n}:${Math.min(n, st.have(k))}`).join(',');
    const sig = [mk, st.cat, st.idx, st.unlocked, cost, st.demolish, st.tool, s?.rank ?? '-', st.claimName].join('|');
    if (sig !== this.sig) { this.sig = sig; this.draw(st); }
  }

  private buildMini(pc: Piece) {
    let g: THREE.BufferGeometry | null = null;
    if (pc.kind === 'obj' && pc.obj) { const d = objDef(pc.obj); if (d) g = objectGeometry(d, { uid: -2, key: pc.obj, x: 0, y: 0, rot: 0, state: { lit: true, crop: pc.cat === 'farm' ? 'tomato' : undefined, cc: 0xd83a2a, stage: 4 } }); }
    else {
      const mb = new ModelBuilder();
      mb.box(0, 0, 0, 1, pc.h, 0.14, pc.wall === 'wood_built' ? 'wall_planks' : pc.wall === 'railing' ? 'metal_grey' : 'bw_scrap_plate');
      if (pc.kind === 'door') mb.box(0, 0, 0.08, 0.5, 2.0, 0.04, 'metal_painted_green');
      g = mb.build();
    }
    this.miniMesh.geometry = g ?? new THREE.BufferGeometry();
    this.miniMesh.geometry.computeBoundingBox();
    const bb = this.miniMesh.geometry.boundingBox;
    if (bb) {
      const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      const k = 0.075 / Math.max(0.2, sx, sy * 0.9, sz);
      this.miniMesh.scale.setScalar(k);
      this.miniMesh.position.set(-(bb.min.x + bb.max.x) / 2 * k, 0, -(bb.min.z + bb.max.z) / 2 * k);
    }
  }

  private draw(st: BoardState) {
    const sh = this.sheet, s = sh.scr, c = (v: number) => sh.c(v);
    sh.blueprint(7);
    // tabs
    CATS.forEach((cat, i) => {
      const x = 3 + i * 23, on = cat === st.cat;
      if (on) s.rect(x, 3, 22, 10, c(WHITE)); else s.frame(x, 3, 22, 10, c(PALE));
      s.text(TAB[cat], x + 11 - s.textW(TAB[cat]) / 2, 5, c(on ? 0x22508f : PALE));
    });
    // number and name, typed
    s.text(`No.${String(st.idx + 1).padStart(2, '0')}/${st.total}`, 5, 17, c(PALE));
    s.text(CAT_NAMES[st.cat].slice(0, 9), SW - 5 - s.textW(CAT_NAMES[st.cat].slice(0, 9)), 17, c(PALE));
    s.para(st.pc.name.toUpperCase(), 5, 27, SW - 10, c(WHITE), 9, 2);
    // the model's ground: dimension lines and a scale note
    const y0 = 46, y1 = 96;
    s.hline(14, SW - 14, y1, c(PALE), 4);
    s.vline(10, y0, y1, c(PALE)); s.line(8, y0 + 2, 10, y0, c(PALE)); s.line(12, y0 + 2, 10, y0, c(PALE));
    s.text('1:20', SW - 30, y1 - 9, c(PALE));
    // cost list (pencil ticks)
    let y = 101;
    for (const [k, n] of st.pc.cost.slice(0, 4)) {
      const have = st.have(k), ok = have >= n;
      s.frame(5, y, 7, 7, c(WHITE));
      if (ok) { s.line(6, y + 4, 8, y + 6, c(0xe8f0ff)); s.line(8, y + 6, 11, y + 1, c(0xe8f0ff)); }
      else { s.line(5, y, 11, y + 6, c(RED)); s.line(11, y, 5, y + 6, c(RED)); }
      const name = itemDef(k).name.toUpperCase().replace('ELECTRONICS', 'ELEC.').replace('ELECTRICAL', 'ELEC.');
      s.text(`${n} ${name}`, 15, y, c(ok ? WHITE : RED), 1, SW - 40);
      const hv = String(Math.min(99, have));
      s.text(hv, SW - 7 - s.textW(hv), y, c(ok ? PALE : RED));
      y += 9;
    }
    // page corners
    s.rect(3, SH - 14, 16, 11, c(0x2f62a8)); s.text('<', 8, SH - 12, c(WHITE));
    s.rect(SW - 19, SH - 14, 16, 11, c(0x2f62a8)); s.text('>', SW - 14, SH - 12, c(WHITE));
    s.text(st.tool, SW / 2 - s.textW(st.tool) / 2, SH - 12, c(st.tool.startsWith('NO ') ? RED : PALE), 1, SW - 44);
    // stamps
    if (!st.unlocked) {
      const nd = researchNode(st.pc.node!);
      this.stamp('LOCKED', y0 + 14, RED);
      const t = `RESEARCH ${nd?.cost ?? '?'} RP`;
      s.text(t, SW / 2 - s.textW(t) / 2, y0 + 32, c(RED));
    } else if (st.demolish) this.stamp('CUTTER', y0 + 16, 0xe8b52a);
    sh.commit();
    // rank plate (stamped steel)
    const r = this.rank.scr;
    this.rank.scr.clear(0x3b4036);
    r.frame(0, 0, 64, 11, this.rank.c(0x6f7766));
    const label = st.stats ? st.stats.rank : 'NO CLAIM';
    r.text(label, 32 - r.textW(label) / 2, 2, this.rank.c(st.stats ? 0xe8d8a0 : 0x899180));
    this.rank.commit();
  }
  /** a crooked rubber stamp across the drawing */
  private stamp(word: string, y: number, col: number) {
    const s = this.sheet.scr, c = this.sheet.c(col), w = s.textW(word, 2);
    const x = SW / 2 - w / 2;
    s.frame(x - 4, y - 4, w + 8, 22, c); s.frame(x - 3, y - 3, w + 6, 20, c);
    s.text(word, x, y, c, 2);
  }
}

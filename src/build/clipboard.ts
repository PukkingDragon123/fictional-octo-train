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
import { Sheet, sheetMesh, overlayRay, shinyMaterial, whenFonts, FONT } from './paper';
import { crtScreen, phosphorText, type CrtScreen } from '../gfx/crt';
import { PIECES, CAT_NAMES, type Piece, type PieceCat } from './pieces';
import type { SettleStats } from './settlement';

const SW = 256, SH = 316;           // sheet pixels
const PW = 0.27, PH = PW * SH / SW; // sheet metres
const CATS = Object.keys(CAT_NAMES) as PieceCat[];
const TAB: Record<PieceCat, string> = { struct: 'STRUCT', machine: 'MACH', defense: 'DEF', living: 'LIVING', farm: 'FARM' };
const PALE = 0x9fc0ea, RED = 0xff6a4a;

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
  private miniPivot = new THREE.Vector3();
  private gauges: Gauge[] = [];
  private rank: CrtScreen;
  private rankSig = '';
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
    const S = shinyMaterial(0xb8bcc0, 80, 0xd0d0d0);
    // ---- masonite board, steel clip
    const bb = new ModelBuilder();
    bb.box(0, -0.2, 0, 0.3, 0.4, 0.008, 'wood_dark', { color: 0x8a6a4a });
    bb.box(0, 0.17, 0.006, 0.12, 0.035, 0.012, 'metal_grey');
    for (const x of [-0.05, 0.05]) bb.box(x, 0.16, 0.012, 0.01, 0.01, 0.006, 'metal_dark');
    this.board = new THREE.Mesh(bb.build(), M);
    const clip = new ModelBuilder(); clip.cylinderX(0, 0.172, 0.014, 0.006, 0.1, 8, 'chrome'); clip.box(0, 0.168, 0.017, 0.07, 0.004, 0.012, 'chrome');
    this.rig.add(new THREE.Mesh(clip.build(), S));
    this.board.rotation.x = 0; this.rig.add(this.board);
    // ---- the blueprint sheet (slightly curled: two planes, one tilted)
    this.sheetM = sheetMesh(this.sheet, PW, PH);
    this.sheetM.position.set(0, 0.145 - PH / 2, 0.0055);
    this.rig.add(this.sheetM);
    // ---- the scale model stands on the paper
    this.miniMesh = new THREE.Mesh(new THREE.BufferGeometry(), worldMaterial({ noVis: true, noFog: true, noGrid: true, bpTag: 'mini' } as any));
    (this.miniMesh.material as THREE.MeshLambertMaterial).color.setHex(0xcfe2ff);
    this.mini.add(this.miniMesh);
    // the model stands in elevation on the drawing (up the page), turning on its own axis
    this.mini.position.set(0, this.uvY(196 / SH), 0.006);
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
      const bm = new THREE.Mesh(bez.build(), S); bm.rotation.x = Math.PI / 2; bm.position.set(x, y, -0.002); this.rig.add(bm);
      const face = new Sheet(96, 96); whenFonts(() => { face.gaugeFace(lab, red); face.commit(); });
      const fm = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshLambertMaterial({ map: face.tex }));
      fm.position.set(x, y, 0.0096); this.rig.add(fm);
      const nb = new ModelBuilder(); nb.box(0, 0, 0, 0.0025, 0.019, 0.001, 'white', { color: 0xc8302a });
      const needle = new THREE.Group(); const nm = new THREE.Mesh(nb.build(), M); needle.add(nm);
      needle.position.set(x, y - 0.002, 0.0105); this.rig.add(needle);
      const hub = new ModelBuilder(); hub.cylinder(0, 0, 0, 0.003, 0.002, 6, 'metal_dark');
      const hm = new THREE.Mesh(hub.build(), M); hm.rotation.x = Math.PI / 2; hm.position.set(x, y - 0.002, 0.011); this.rig.add(hm);
      this.gauges.push({ needle, v: 0, target: 0 });
    });
    // the rank readout: a little amber tube in a steel bezel on the clip
    this.rank = crtScreen(0.1, 0.022, { tint: 0xffc070, res: [256, 56], curvature: 0.12, reflect: 0.5, glow: 1 });
    const rb = new ModelBuilder(); rb.box(0, -0.016, -0.004, 0.112, 0.032, 0.008, 'metal_dark');
    const rbm = new THREE.Mesh(rb.build(), S); rbm.position.set(0, 0.19, 0.016); this.rig.add(rbm);
    this.rank.mesh.position.set(0, 0.19, 0.0165); this.rig.add(this.rank.mesh);
    // ---- demolish toggle on the right edge (bakelite base, steel lever)
    const tb = new ModelBuilder(); tb.box(0, -0.016, 0, 0.034, 0.032, 0.014, 'plastic_black'); tb.box(0, 0.02, 0.002, 0.03, 0.012, 0.003, 'bt_hazard', { fit: true });
    this.toggleM = new THREE.Mesh(tb.build(), M); this.toggleM.position.set(0.168, -0.05, 0.006); this.rig.add(this.toggleM);
    const lb = new ModelBuilder(); lb.cylinder(0, 0, 0, 0.004, 0.026, 6, 'chrome'); lb.sphere(0, 0.027, 0, 0.0065, 6, 4, 'plastic_red');
    const lm = new THREE.Mesh(lb.build(), S); this.lever.add(lm); this.lever.position.set(0.168, -0.05, 0.014); this.rig.add(this.lever);
    // lights of its own (the stage may have none)
    const key = new THREE.DirectionalLight(0xfff2e0, 1.0); key.position.set(-0.5, 0.8, 1); this.g.add(key);
    this.g.add(new THREE.AmbientLight(0xb8c0d0, 0.55));
    // held low and to the left (the body gauges live on the right), tilted toward you
    this.rig.scale.setScalar(0.78);
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
      if (py < 34) { const i = Math.floor((px - 14) / 46); if (i >= 0 && i < CATS.length) return { kind: 'tab', cat: CATS[i] }; }
      if (py > SH - 36 && px < 52) return { kind: 'prev' };
      if (py > SH - 36 && px > SW - 52) return { kind: 'next' };
    }
    return { kind: 'board' };
  }

  update(dt: number, st: BoardState) {
    if (!this.shown) return;
    if (fpOwner() !== 'build') { if (!fpOwner()) fpClaim('build', 2); return; }
    this.raise = Math.min(1, this.raise + dt * 3.5);
    const e = 1 - Math.pow(1 - this.raise, 3);
    this.rig.position.set(-0.36, lerp(-0.62, -0.075, e) + Math.sin(G.time * 1.3) * 0.003, -1.02);
    // scale model of the piece
    const mk = st.pc.key;
    if (mk !== this.miniKey) { this.miniKey = mk; this.buildMini(st.pc); }
    this.mini.rotation.y = G.time * 0.6;
    this.miniMesh.position.copy(this.miniPivot);
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
    if (sig !== this.sig) { this.sig = sig; whenFonts(() => this.draw(st)); }
    const rk = s ? `${s.rank}  ${String(s.score).padStart(3, '0')}` : 'NO CLAIM';
    if (rk !== this.rankSig) {
      this.rankSig = rk;
      const g = this.rank.ctx; g.fillStyle = '#000'; g.fillRect(0, 0, 256, 56);
      phosphorText(g, rk, 128, 12, { size: 30, color: s ? '#ffc070' : '#7a5a30', font: FONT.crt, align: 'center', glow: 8 });
      this.rank.flush();
    }
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
      const k = Math.min(0.1 / Math.max(0.1, sy), 0.17 / Math.max(0.1, sx, sz));
      this.miniMesh.scale.setScalar(k);
      // the turning axis through the footprint's middle; stand clear of the paper
      this.miniPivot.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
      this.mini.position.z = 0.006 + Math.hypot(sx, sz) / 2 * k;
    }
  }

  private draw(st: BoardState) {
    const sh = this.sheet;
    sh.blueprint(7);
    const INK = 0xe8f0ff, BLUE = 0x24538f;
    // file tabs along the top
    CATS.forEach((cat, i) => {
      const x = 14 + i * 46, on = cat === st.cat;
      if (on) sh.rect(x, 12, 44, 20, INK); else sh.frame(x, 12, 44, 20, PALE, 1.5);
      sh.text(TAB[cat], x + 22, 15, { font: FONT.sign, size: 13, color: on ? BLUE : PALE, align: 'center', weight: '600' });
    });
    // drawing number, category, the piece's name in typewriter
    sh.text(`DWG. No. ${String(st.idx + 1).padStart(2, '0')} / ${st.total}`, 16, 40, { font: FONT.type, size: 12, color: PALE });
    sh.text(CAT_NAMES[st.cat], SW - 16, 40, { font: FONT.sign, size: 12, color: PALE, align: 'right' });
    sh.text(st.pc.name.toUpperCase(), 16, 56, { font: FONT.type, size: 21, color: INK, maxW: SW - 32 });
    // the scale model stands here: dimension arrows and a scale note
    const y0 = 88, y1 = 196;
    sh.line(24, y1, SW - 24, y1, PALE, 1, [6, 4]);
    sh.line(20, y0, 20, y1, PALE, 1); sh.line(16, y0 + 6, 20, y0, PALE); sh.line(24, y0 + 6, 20, y0, PALE);
    sh.text(`H ${st.pc.h.toFixed(1)} m`, 28, y0, { font: FONT.type, size: 11, color: PALE });
    sh.text('SCALE 1:20', SW - 18, y1 - 16, { font: FONT.type, size: 11, color: PALE, align: 'right' });
    // bill of salvage, ticked or crossed in pencil
    let y = 206;
    sh.text('SALVAGE', 16, y, { font: FONT.sign, size: 12, color: PALE, weight: '600' });
    y += 18;
    for (const [k, n] of st.pc.cost.slice(0, 4)) {
      const have = st.have(k), ok = have >= n;
      sh.frame(16, y + 2, 13, 13, INK, 1.5);
      if (ok) { sh.line(18, y + 9, 22, y + 13, 0xf6f0d8, 2.2); sh.line(22, y + 13, 30, y + 1, 0xf6f0d8, 2.2); }
      else { sh.line(15, y + 1, 31, y + 17, RED, 2.4); sh.line(31, y + 1, 15, y + 17, RED, 2.4); }
      sh.text(`${n} × ${itemDef(k).name}`, 38, y, { font: FONT.type, size: 15, color: ok ? INK : 0xf0a090, maxW: SW - 90 });
      sh.text(String(Math.min(99, have)), SW - 18, y + 1, { font: FONT.pen, size: 19, color: ok ? 0xf6f0d8 : RED, align: 'right', weight: '700' });
      y += 19;
    }
    // page corners and the tool in hand
    sh.rect(12, SH - 30, 34, 20, 0x2f62a8); sh.text('‹', 29, SH - 33, { font: FONT.sign, size: 22, color: INK, align: 'center' });
    sh.rect(SW - 46, SH - 30, 34, 20, 0x2f62a8); sh.text('›', SW - 29, SH - 33, { font: FONT.sign, size: 22, color: INK, align: 'center' });
    sh.text(st.tool, SW / 2, SH - 27, { font: FONT.sign, size: 13, color: st.tool.startsWith('NO ') ? RED : PALE, align: 'center', weight: '600' });
    // stamps over the drawing
    if (!st.unlocked) {
      const nd = researchNode(st.pc.node!);
      sh.stamp('LOCKED', SW / 2, y0 + 44, RED, 30, -0.14);
      sh.text(`research · ${nd?.cost ?? '?'} RP`, SW / 2, y0 + 74, { font: FONT.pen, size: 20, color: 0xff9a80, align: 'center', weight: '700' });
    } else if (st.demolish) sh.stamp('CUTTER ARMED', SW / 2, y0 + 50, 0xe8b52a, 22, -0.1);
    sh.commit();
  }
}

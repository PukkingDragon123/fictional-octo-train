// THE SPECIMEN WING: the containment corridor runs on past the Hush's cell,
// both ways, past a row of smaller cells, one per species in the Meridian
// file's catalogue (src/game/meridian.ts). The roach first, then outward by
// threat, alternating right and left.
//   undiscovered  a dark, empty cell, a violet "?" glowing on the back wall
//   discovered    the real creature, built and animated by its own species code
//                 (only near the camera: built on approach, animated on screen)
//   studied       the plaque lit gold with the harvestable power, a lamp on the sill
// Every cell is one Hot (the glass and what stands behind it): press = select.
// The static shell is one merged FacetBuilder build; the per-cell lamps and
// floor pools are unlit cards sharing three materials; three travelling
// point lights light the cells nearest the camera (the light count never
// changes, so no shader recompiles while you pan).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FMats } from '../scene/pixtex';
import type { Hot } from '../monitor/stage';
import type { Rig } from '../../../creatures/species';
import { species } from '../../../creatures/registry';
import { FacetBuilder, at, cbox, bolt, C, plate, slab, glowCard, gameSound, uiSound } from '../monitor/props';
import { catalogue, isDiscovered, isStudied, studyPct, powerOf, lastRun, loadout, ownsPower, STARTER_PET } from '../../../game/meridian';
import { petted } from '../../../game/achievements';
import '../../../creatures/species/roach';
import { dressSpecimen, SpecimenLife } from './specimenDetail';
import { paper, lathe, prism, tube } from '../monitor/props';

/** the species with a cell in the wing (the Hush has the big cell in the middle) */
export function wingSpecies() { return catalogue().filter((s) => s.key !== 'hush'); }

export const PITCH = 2.4;
const CW = 2.2, CD = 2.6, HC = 2.6, H = 3.3, SILL = 0.42;
const BACKS = [0x3aa8a0, 0xe8c050, 0xe0705a, 0x5a9ae0, 0x8ad06a, 0xc87ad0];
type CellState = 'unknown' | 'seen' | 'studied';

export interface Cell {
  key: string; name: string; x: number; side: number; idx: number;
  state: CellState;
  g: THREE.Group;
  holder: THREE.Group;
  glass: THREE.Mesh;
  lamp: THREE.Mesh; pool: THREE.Mesh; button: THREE.Mesh;
  q: THREE.Group;
  plaque: THREE.Group | null;
  tag: THREE.Group | null;
  rig: Rig | null; def: any; fc: any; scale: number; baseY: number; failed: boolean;
  life: SpecimenLife | null; bulb: THREE.Mesh; flick: number;
  poke: number; seed: number;
}

export class SpecimenWing {
  group = new THREE.Group();
  cells: Cell[] = [];
  hots: Hot[] = [];
  minX = 0; maxX = 0;
  /** a cell was pressed */
  onSelect?: (c: Cell) => void;
  private lights: THREE.PointLight[] = [];
  private hall = new THREE.PointLight(0xffe8c8, 2.2, 9, 1.6);
  private glassMat: THREE.MeshBasicMaterial;
  private lampMats: Record<CellState, THREE.MeshBasicMaterial>;
  private poolMats: Record<CellState, THREE.MeshBasicMaterial>;
  private btnMat = new THREE.MeshBasicMaterial({ color: 0x40ff80, toneMapped: false });

  constructor(private mats: FMats, private W: number) {
    // thick glass with wire inlay, scratches, smears and old hand prints (one texture for every pane)
    const gt = new THREE.CanvasTexture(glassMarks());
    gt.magFilter = gt.minFilter = THREE.NearestFilter; gt.generateMipmaps = false;
    this.glassMat = new THREE.MeshBasicMaterial({ color: 0x8ab8b4, map: gt, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const lm = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    this.lampMats = { unknown: lm(0x3a2a5a), seen: lm(0xbff4ff), studied: lm(0xfff0b0) };
    const pm = (c: number) => new THREE.MeshBasicMaterial({ color: c, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.poolMats = { unknown: pm(0x8a5aff), seen: pm(0x8ae8ff), studied: pm(0xffd070) };
    const list = wingSpecies();
    const b = new FacetBuilder();
    list.forEach((sp, i) => {
      const side = i % 2 === 0 ? 1 : -1, n = Math.floor(i / 2);
      const xa = W + 0.2 + n * PITCH, xc = side * (xa + CW / 2);
      this.shellCell(b, xc, side, n, sp);
      this.cells.push(this.makeCell(sp, xc, side, i));
    });
    const nR = Math.ceil(list.length / 2), nL = Math.floor(list.length / 2);
    this.maxX = W + 0.2 + nR * PITCH; this.minX = -(W + 0.2 + nL * PITCH);
    this.shellHall(b);
    this.group.add(b.build(this.mats, { cast: false }));
    this.group.add(this.grime(list.length));
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 4.6, 1.5); this.lights.push(l); this.group.add(l); }
    this.hall.position.set(0, 2.9, 2.4);
    this.group.add(this.hall);
    this.refresh();
  }

  // ================================================================== build
  private shellCell(b: FacetBuilder, xc: number, side: number, n: number, sp: any) {
    const x0 = xc - CW / 2, x1 = xc + CW / 2;
    const back = BACKS[n % BACKS.length];
    slab(b, 'metal', x0, x1, -0.1, 0, -CD, 0, 0x9aa09a, 0.004, 0.8);
    slab(b, 'paint', x0, x1, 0, HC, -CD - 0.15, -CD, back, 0.004, 0.6);
    slab(b, 'metal', x0, x1, HC, HC + 0.08, -CD, 0, 0x6a706c);
    // the outer divider (and the end wall of the row)
    const dx0 = side > 0 ? x1 : x0 - 0.2, dx1 = side > 0 ? x1 + 0.2 : x0;
    slab(b, 'metal', dx0, dx1, 0, H, -CD - 0.15, 0, 0x7a807c, 0.004, 0.9);
    slab(b, 'paint', dx0, dx1, 0, H, -0.19, 0.19, 0x485240, 0.02, 0.5);
    // the glass frame: a sill with a hazard edge, a header for the plaque
    b.add('paint', cbox(CW, SILL, 0.36, 0.02), 0x3e4636, at(xc, SILL / 2, 0), { rep: 0.5 });
    b.add('hazard', cbox(CW, 0.05, 0.38, 0.01), 0xffffff, at(xc, SILL + 0.02, 0), { rep: 0.24 });
    b.add('paint', cbox(CW + 0.4, H - HC, 0.36, 0.02), 0x3e4636, at(xc, (HC + H) / 2, 0), { rep: 0.5 });
    for (let x = x0 + 0.15; x < x1; x += 0.3) b.add('metal', bolt(0.011, 0.008), C.steel, at(x, SILL - 0.05, 0.19, Math.PI / 2));
    // a seam grid and rivets on the back plate, a plinth with hazard edges (a pedestal for the small ones)
    for (const y of [0.9, 1.8]) b.add('metal', cbox(CW, 0.025, 0.02, 0.006), 0x2a2e2c, at(xc, y, -CD + 0.01));
    for (const x of [x0 + 0.55, x1 - 0.55]) b.add('metal', cbox(0.025, HC, 0.02, 0.006), 0x2a2e2c, at(x, HC / 2, -CD + 0.01));
    const small = (sp.height ?? 1) < 0.6;
    const ph = small ? 0.42 : 0.1;
    b.add('metal', cbox(small ? 0.8 : 1.3, ph, small ? 0.8 : 1.2, 0.012), 0x8a8e8a, at(xc, ph / 2, -1.35), { rep: 0.6 });
    b.add('hazard', cbox(small ? 0.82 : 1.32, 0.04, 0.05, 0.01), 0xffffff, at(xc, ph - 0.01, -1.35 + (small ? 0.4 : 0.6)), { rep: 0.24 });
    b.add('metal', cbox(0.9, 0.06, 0.32, 0.012), C.dark, at(xc, HC - 0.03, -0.9));
    b.add('rust', cbox(0.3, 0.012, 0.3, 0.004), 0xb0a090, at(xc + side * 0.65, 0.006, -0.5));
    // ---- real cell construction
    // riveted posts: a double row of rivets down the front of the divider, more along the header and sill
    const px = side > 0 ? x1 + 0.1 : x0 - 0.1;
    for (let y = 0.15; y < H - 0.05; y += 0.16) for (const dx of [-0.065, 0.065]) b.add('metal', bolt(0.011, 0.008), C.steel, at(px + dx, y, 0.195, Math.PI / 2));
    for (let x = x0 + 0.1; x < x1; x += 0.16) b.add('metal', bolt(0.01, 0.007), C.steel, at(x, HC + 0.12, 0.185, Math.PI / 2));
    // the glass sits in a thick rubber gasket and a steel retaining frame
    for (const y of [SILL + 0.01, HC - 0.02]) { b.add('rubber', cbox(CW, 0.04, 0.09, 0.008), 0x1a1a1a, at(xc, y, 0.03)); b.add('metal', cbox(CW, 0.05, 0.03, 0.006), 0x5a605c, at(xc, y + (y > 1 ? -0.035 : 0.035), 0.08)); }
    for (const x of [x0 + 0.02, x1 - 0.02]) b.add('rubber', cbox(0.04, HC - SILL, 0.09, 0.008), 0x1a1a1a, at(x, (HC + SILL) / 2, 0.03));
    // the drain: a sunken grate with slats, a rusted rim
    const dxr = xc - side * 0.62, dz = -1.95;
    b.add('rust', cbox(0.34, 0.02, 0.34, 0.006), 0x6a5040, at(dxr, 0.003, dz));
    for (let i = 0; i < 6; i++) b.add('metal', cbox(0.3, 0.014, 0.022, 0.004), 0x2a2a28, at(dxr, 0.012, dz - 0.13 + i * 0.052));
    // restraints: two wall rings on the back plate, chains sagging to a floor shackle by the plinth
    for (const k of [-1, 1]) {
      const ax = xc + k * 0.62, ay = 1.55, az = -CD + 0.04;
      b.add('metal', cbox(0.16, 0.16, 0.04, 0.01), C.dark, at(ax, ay, -CD + 0.02));
      b.add('chrome', prism(0.035, 0.022, 8), 0xb8bcc0, at(ax, ay, az + 0.01, Math.PI / 2));
      const fx = xc + k * 0.38, fz = -1.0;
      b.add('metal', cbox(0.1, 0.03, 0.1, 0.008), C.dark, at(fx, 0.12, fz));
      const N = 11;
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = ax + (fx - ax) * u, z = az + (fz - az) * u, y = ay + (0.14 - ay) * u - Math.sin(u * Math.PI) * 0.32;
        b.add('chrome', cbox(0.05, 0.022, 0.012, 0.004), 0x9a9ea2, at(x, y, z, 0, Math.atan2(fx - ax, fz - az), i % 2 ? Math.PI / 2 : 0));
      }
    }
    // pipes along the back wall, a riser in the corner with a valve wheel, a vent grille, hanging cables
    b.add('paint', prism(0.045, CW, 8), [0x7a4a30, 0x3a6a5a, 0x6a6a72][n % 3], at(xc, HC - 0.28, -CD + 0.09, 0, 0, Math.PI / 2), { rep: 0.4 });
    b.add('copper', prism(0.022, CW, 6), 0xc87a4a, at(xc, HC - 0.4, -CD + 0.06, 0, 0, Math.PI / 2));
    const rx = side > 0 ? x0 + 0.12 : x1 - 0.12;
    b.add('paint', prism(0.04, HC, 8), 0x5a6a5a, at(rx, HC / 2, -CD + 0.1), { rep: 0.4 });
    b.add('brass', lathe([[0.07, -0.008], [0.08, 0], [0.07, 0.008], [0.06, 0]], 10), 0xc8a050, at(rx + side * 0.05, 1.2, -CD + 0.1, 0, 0, Math.PI / 2));
    const vx = side > 0 ? x1 - 0.01 : x0 + 0.01;
    b.add('metal', cbox(0.03, 0.34, 0.5, 0.008), C.dark, at(vx, 2.05, -1.5));
    for (let i = 0; i < 7; i++) b.add('metal', cbox(0.035, 0.016, 0.46, 0.004), 0x6a706c, at(vx - side * 0.012, 1.92 + i * 0.043, -1.5));
    for (let k = 0; k < 2; k++) { const cx0 = xc + (k ? 0.3 : -0.55) * side; b.add('rubber', tube([[cx0, HC, -0.5], [cx0 + 0.1 * side, HC - 0.32 - k * 0.12, -0.75], [cx0 + 0.24 * side, HC, -1.1]], 0.012, 10, 4), 0x141414); }
    // the practical light: a caged bulb high on the back wall (the bulb itself flickers, see makeCell)
    b.add('metal', cbox(0.16, 0.05, 0.1, 0.01), C.dark, at(xc, HC - 0.16, -CD + 0.05));
    for (let i = 0; i < 4; i++) b.add('metal', cbox(0.01, 0.14, 0.01, 0.003), C.darker, at(xc - 0.05 + (i % 2) * 0.1, HC - 0.26, -CD + 0.06 + Math.floor(i / 2) * 0.08));
  }
  /** grime and puddles for the whole row: two merged meshes, two draw calls */
  private grime(n: number): THREE.Group {
    const g = new THREE.Group();
    const grime: THREE.BufferGeometry[] = [], wet: THREE.BufferGeometry[] = [];
    const cells = wingSpecies().slice(0, n);
    cells.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1, k = Math.floor(i / 2), xc = side * (this.W + 0.2 + k * PITCH + CW / 2);
      // streaks down the back plate, a tide line at the floor, stains round the drain
      const back = new THREE.PlaneGeometry(CW, 1.1); back.translate(xc, 0.55, -CD + 0.012); grime.push(back);
      const fl = new THREE.PlaneGeometry(CW - 0.1, CD - 0.2); fl.rotateX(-Math.PI / 2); fl.translate(xc, 0.004, -CD / 2); grime.push(fl);
      const pd = new THREE.CircleGeometry(0.28 + (i % 3) * 0.08, 10); pd.rotateX(-Math.PI / 2); pd.scale(1.4, 1, 0.8); pd.translate(xc - side * 0.5, 0.006, -1.75); wet.push(pd);
    });
    const gm = new THREE.MeshBasicMaterial({ map: grimeTex(), transparent: true, depthWrite: false, color: 0xffffff });
    const merged = mergeGeometries(grime.map((q) => q.toNonIndexed()), false);
    if (merged) { const m = new THREE.Mesh(merged, gm); m.renderOrder = 1; m.userData.noGlow = true; g.add(m); }
    const wm = mergeGeometries(wet.map((q) => q.toNonIndexed()), false);
    if (wm) { const m = new THREE.Mesh(wm, new THREE.MeshStandardMaterial({ color: 0x0a1210, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.75, depthWrite: false })); m.renderOrder = 1; m.userData.noGlow = true; g.add(m); }
    return g;
  }
  private shellHall(b: FacetBuilder) {
    // corridor ceiling strips (the lamps are cards, see makeCell) and a long pipe run
    const W = this.W, xs = [this.minX, -W - 0.1, W + 0.1, this.maxX];
    for (const [a, z] of [[0, 1], [2, 3]] as const) {
      const xa = xs[a], xb = xs[z];
      b.add('paint', cbox(Math.abs(xb - xa), 0.08, 0.08, 0.01), 0x7a4a30, at((xa + xb) / 2, H - 0.25, 3.3), { rep: 0.4 });
      b.add('paint', cbox(Math.abs(xb - xa), 0.06, 0.06, 0.01), 0x3a8a7a, at((xa + xb) / 2, H - 0.12, 3.5), { rep: 0.4 });
    }
  }
  private makeCell(sp: any, xc: number, side: number, idx: number): Cell {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.04, HC - SILL - 0.04), this.glassMat);
    glass.position.set(xc, (SILL + HC) / 2, 0.03);
    glass.renderOrder = 5; glass.userData.noGlow = true;
    const lamp = new THREE.Mesh(cbox(0.78, 0.02, 0.22, 0.004), this.lampMats.unknown);
    lamp.position.set(xc, HC - 0.07, -0.9); lamp.userData.noGlow = true;
    const pool = glowCard(1.8, 1.8, 0xffffff, 0.3);
    pool.rotation.x = -Math.PI / 2; pool.position.set(xc, 0.012, -1.0);
    const button = new THREE.Mesh(cbox(0.08, 0.04, 0.08, 0.01), this.btnMat);
    button.position.set(xc + side * 0.8, SILL + 0.06, 0.08); button.userData.noGlow = true;
    const holder = new THREE.Group();
    holder.position.set(xc, 0, -1.35);
    const q = plate(this.mats, ['?'], 0.55, 0.55, { bg: 0x2a1840, ink: 0xc8a0ff, emissive: true, px: 120 });
    q.position.set(xc, 1.35, -CD + 0.012);
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1), this.lampMats.unknown);
    bulb.position.set(xc, HC - 0.27, -CD + 0.1); bulb.userData.noGlow = true;
    g.add(glass, lamp, pool, button, holder, q, bulb);
    // stencils and a specimen tag (shared textures, cloned)
    const st = stencils(this.mats);
    const s1 = st[idx % st.length].clone(); s1.position.set(xc + side * 0.55, SILL / 2, 0.185); g.add(s1);
    const s2 = st[(idx + 1) % st.length].clone(); s2.position.set(xc - side * 0.62, 1.95, -CD + 0.013); s2.scale.setScalar(0.8); g.add(s2);
    const tg = tags()[idx % 4].clone(); tg.position.set(xc - side * 0.85, SILL + 0.22, 0.07); tg.rotation.z = side * 0.18; g.add(tg);
    this.group.add(g);
    const cell: Cell = { key: sp.key, name: String(sp.name), x: xc, side, idx, state: 'unknown', g, holder, glass, lamp, pool, button, q, plaque: null, tag: null, rig: null, def: sp, fc: null, scale: 1, baseY: 0, failed: false, poke: 0, seed: idx * 1.37, life: null, bulb, flick: 1 };
    this.hots.push({ key: 'cell:' + sp.key, objs: [glass, holder, button], glow: [holder], label: '', press: () => this.onSelect?.(cell) });
    return cell;
  }

  /** re-read the Meridian file: states, plaques, captions (after a run, or a purchase in the panel) */
  refresh() {
    const last = lastRun();
    for (const c of this.cells) {
      const st: CellState = isStudied(c.key) ? 'studied' : isDiscovered(c.key) ? 'seen' : 'unknown';
      const changed = st !== c.state || !c.plaque;
      c.state = st;
      c.lamp.material = this.lampMats[st];
      c.bulb.material = this.lampMats[st];
      c.pool.material = this.poolMats[st];
      c.q.visible = st === 'unknown';
      c.button.visible = st === 'studied';
      if (st === 'unknown' && c.rig) { c.holder.remove(c.rig.root); c.rig = null; }
      const pw = powerOf(c.key);
      const h = this.hots.find((q) => q.key === 'cell:' + c.key)!;
      h.label = st === 'unknown' ? 'Empty cell' : c.name;
      h.sub = st === 'unknown' ? 'not yet discovered' : st === 'studied' ? `${pw?.name ?? 'power'} · ${ownsPower(c.key) ? 'harvested' : 'harvest it'}` : `${studyPct(c.key)}% studied`;
      if (changed || (st === 'studied')) {
        if (c.plaque) { c.g.remove(c.plaque); disposeGroup(c.plaque); }
        const code = String(c.def.code ?? '').split('//')[0].trim() || 'CELL';
        const lines = st === 'unknown' ? ['UNCATALOGUED', '? ? ?'] : st === 'studied' ? [c.name.toUpperCase(), (ownsPower(c.key) ? '★ ' : '') + (pw?.name ?? '').toUpperCase()] : [code, c.name.toUpperCase()];
        c.plaque = plate(this.mats, lines, 1.5, 0.3, st === 'studied' ? { bg: 0xf0c040, ink: 0x1a0c00, px: 200 } : st === 'seen' ? { bg: 0xc8d8d0, px: 200 } : { bg: 0x4a3a5a, ink: 0xd8c8ff, px: 200 });
        c.plaque.position.set(c.x, HC - 0.2, 0.07);
        c.g.add(c.plaque);
      }
      const isNew = st !== 'unknown' && !!last && (last.discovered.includes(c.key) || last.studied.includes(c.key));
      if (isNew && !c.tag) { c.tag = plate(this.mats, [last!.studied.includes(c.key) ? 'STUDIED!' : 'NEW!'], 0.44, 0.13, { bg: 0x9a1a4a, ink: 0xfff0f6, emissive: true, px: 220 }); c.tag.position.set(c.x - c.side * 0.72, HC - 0.62, 0.08); c.tag.rotation.z = c.side * 0.12; c.g.add(c.tag); }
      if (!isNew && c.tag) { c.g.remove(c.tag); disposeGroup(c.tag); c.tag = null; }
      // the roach wears what the loadout gives her
      if (c.key === STARTER_PET && c.fc) { c.fc.mem.netMem.hat = loadout().petHat; c.fc.mem.netMem.tint = loadout().petTint; }
    }
  }

  private buildRig(c: Cell) {
    if (c.rig || c.failed || c.state === 'unknown') return;
    const def: any = species(c.key);
    if (!def) { c.failed = true; return; }
    try {
      const rig: Rig = def.build();
      rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
      const hgt = def.height ?? 1, rad = def.radius ?? 0.4;
      let s = hgt > 1.9 ? 1.9 / hgt : hgt < 0.75 ? Math.min(3, 0.75 / hgt) : 1;
      if (rad * 2 * s > 1.6) s = 1.6 / (rad * 2);
      // fliers hover low in the cell (their own altitude would put them in the lamp)
      const flying = !!def.flags?.flying;
      if (flying) s = Math.min(s, 1);
      c.scale = s;
      rig.root.scale.setScalar(s);
      c.baseY = hgt < 0.6 ? 0.42 : 0.1;
      c.holder.add(rig.root);
      c.rig = rig;
      // the display specimen: anatomy, wet layered materials, breathing and twitches (specimenDetail.ts)
      try { const d = dressSpecimen(rig, def); c.life = new SpecimenLife(rig, d.breathe, d.profile); } catch (e) { console.warn('specimen detail', c.key, e); }
      c.def = def;
      c.fc = { id: 'menu-cell-' + c.key, x: 0, z: 0, y: 0, facing: 0, targetFacing: 0, speed: 0, state: 'idle', mem: { netMem: c.key === STARTER_PET ? { hat: loadout().petHat, tint: loadout().petTint } : flying ? { h: 0.9 } : {} }, attackPhase: 0, hp: def.hp ?? 10, hitFlash: 0, dead: false, deathT: 0, targetId: null, tamedBy: null, phase: 0, observed: false, stateT: 0, zoneKey: 'menu', attackT: 0, sp: def, noiseCooldown: 99, radius: rad, height: hgt, awareness: new Map(), visibleToLocal: true, wasSeenByLocal: true, animT: 0, vx: 0, vz: 0, stagger: 0 };
    } catch (e) { console.warn('wing specimen', c.key, e); c.failed = true; c.rig = null; }
  }

  /** a tap on the glass: the specimen startles (the roach gets a pat) */
  poke(c: Cell) {
    if (c.state === 'unknown') { uiSound('tink', 0.6); return; }
    c.poke = 1;
    uiSound('tink', 0.8);
    const snd = c.def?.sounds?.idle || c.def?.sounds?.alert;
    if (snd) gameSound(snd, 0.45, c.key === STARTER_PET ? 1.4 : 1);
    if (c.key === STARTER_PET) { petted(); if (c.fc) c.fc.mem.netMem.pose = 'happy'; }
  }

  // ================================================================== frame
  update(dt: number, t: number, camX: number, full: boolean) {
    // the practical lights: an old ballast, each cell its own stutter (only cells near the camera)
    for (const c of this.cells) {
      if (Math.abs(c.x - camX) > 7) continue;
      const h = Math.sin(t * 7.3 + c.seed * 13) + Math.sin(t * 2.1 + c.seed * 5) + Math.sin(t * 23 + c.seed);
      c.flick = h > 2.35 ? 0.25 : h > 2.1 ? 0.7 : 1;
      const on = c.flick > 0.5;
      c.bulb.visible = on; c.lamp.visible = c.flick > 0.3;
    }
    // the three travelling lamps take the nearest cells
    const near = this.cells.map((c) => ({ c, d: Math.abs(c.x - camX) })).sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], e = near[i];
      if (!e || e.d > 6) { l.intensity = 0; continue; }
      const st = e.c.state;
      l.position.set(e.c.x, 2.2, -1.0);
      l.color.setHex(st === 'studied' ? 0xfff0c8 : st === 'seen' ? 0xc8f4ff : 0x9a7aff);
      l.intensity = (st === 'studied' ? 7 : st === 'seen' ? 5.5 : 1.6) * e.c.flick;
    }
    this.hall.position.x = camX;
    this.hall.intensity = Math.min(2.4, Math.max(0, Math.abs(camX) - 1.5) * 1.2);
    for (const c of this.cells) {
      const d = Math.abs(c.x - camX);
      c.g.visible = d < 9;
      if (!full || d > 6) continue;
      if (!c.rig) { if (d < 5.5) this.buildRig(c); if (!c.rig) continue; }
      if (d > 4.6) continue;
      // on screen: the specimen lives in its cell
      const fc = c.fc, def = c.def, rig = c.rig!;
      c.poke = Math.max(0, c.poke - dt * 1.4);
      fc.stateT += dt; fc.animT += dt;
      fc.state = c.poke > 0.3 ? 'investigate' : 'idle';
      fc.hitFlash = c.poke > 0.85 ? 0.2 : 0;
      if (c.key === STARTER_PET && c.poke <= 0.05) fc.mem.netMem.pose = Math.sin(t * 0.21 + c.seed) > 0.85 ? 'point' : '';
      c.life?.before();
      try { def.animate(rig, fc, t, dt); } catch { try { def.animateGallery?.(rig, t); } catch { /* its own code */ } }
      c.life?.after(dt, t);
      rig.root.position.set(0, c.baseY + c.poke * 0.04 * Math.sin(t * 30), 0);
      rig.root.rotation.set(0, Math.sin(t * 0.31 + c.seed) * 0.45 + c.poke * Math.sin(t * 20) * 0.15, 0);
      rig.root.scale.setScalar(c.scale);
    }
  }
  cellNearest(x: number): Cell | null { let best: Cell | null = null, bd = Infinity; for (const c of this.cells) { const d = Math.abs(c.x - x); if (d < bd) { bd = d; best = c; } } return best; }
}

/** a plate's own geometry, text face and its texture (the frame's materials are the room's shared ones) */
function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    if (m.geometry?.type === 'PlaneGeometry' && !Array.isArray(m.material)) { const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); }
  });
}

// ================================================================== shared textures
/** wire inlay (a diamond mesh), scratches, smears and palm prints for every pane */
function glassMarks(): HTMLCanvasElement {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  let s = 977; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  c.strokeStyle = 'rgba(150,170,165,0.16)'; c.lineWidth = 1;
  for (let i = -S; i < S * 2; i += 10) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + S, S); c.stroke(); c.beginPath(); c.moveTo(i, S); c.lineTo(i + S, 0); c.stroke(); }
  for (let i = 0; i < 30; i++) { let x = r() * S, y = r() * S; const a = r() * Math.PI, len = 10 + r() * 60; c.fillStyle = `rgba(230,240,235,${0.15 + r() * 0.25})`; for (let k = 0; k < len; k++) { c.fillRect(Math.round(x), Math.round(y), 1, 1); x += Math.cos(a); y += Math.sin(a) + (r() - 0.5) * 0.3; } }
  for (let i = 0; i < 3; i++) { const cx = r() * S, cy = 150 + r() * 90, rr = 8 + r() * 16; for (let y = -rr; y < rr; y++) for (let x = -rr; x < rr; x++) if (x * x + y * y < rr * rr && r() < 0.12) { c.fillStyle = 'rgba(170,185,160,0.22)'; c.fillRect(Math.round(cx + x), Math.round(cy + y * 0.5), 1, 1); } }
  for (let p = 0; p < 2; p++) { const px = 40 + r() * 170, py = 150 + r() * 70; c.fillStyle = 'rgba(200,215,200,0.35)'; for (let f = 0; f < 4; f++) for (let k = 0; k < 10; k++) c.fillRect(Math.round(px - 7 + f * 4), Math.round(py - 12 - k + (f === 0 || f === 3 ? 3 : 0)), 2, 1); for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) if (r() < 0.55) c.fillRect(Math.round(px - 6 + x), Math.round(py - 2 + y), 1, 1); }
  return cv;
}
let GRIME: THREE.Texture | null = null;
function grimeTex(): THREE.Texture {
  if (GRIME) return GRIME;
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  let s = 331; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  // drips running down, a tide line, blotches of something that dried brown
  for (let i = 0; i < 26; i++) { const x = r() * S, w = 1 + r() * 3, len = 20 + r() * 90; const gr = c.createLinearGradient(0, S, 0, S - len); gr.addColorStop(0, 'rgba(40,30,20,0.55)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); c.fillStyle = gr; c.fillRect(x, S - len, w, len); }
  c.fillStyle = 'rgba(30,24,16,0.45)'; c.fillRect(0, S - 10, S, 10);
  for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(${60 + r() * 40},${20 + r() * 20},${10 + r() * 10},${0.15 + r() * 0.3})`; c.beginPath(); c.ellipse(r() * S, r() * S, 4 + r() * 14, 3 + r() * 9, r() * 3, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return (GRIME = t);
}
let STENCILS: THREE.Group[] | null = null;
function stencils(mats: FMats): THREE.Group[] {
  return STENCILS ??= [
    plate(mats, ['DANGER', 'DO NOT FEED'], 0.5, 0.16, { bg: 0xd8a820, ink: 0x140c04, px: 200 }),
    plate(mats, ['BIOHAZARD'], 0.46, 0.12, { bg: 0xc83a24, ink: 0xfff0e0, px: 200 }),
    plate(mats, ['KEEP HANDS', 'OFF GLASS'], 0.46, 0.16, { bg: 0xe8e0c8, ink: 0x1a1408, px: 200 }),
  ];
}
let TAGS: THREE.Mesh[] | null = null;
function tags(): THREE.Mesh[] {
  return TAGS ??= [0, 1, 2, 3].map((i) => paper(['SPECIMEN', ['DO NOT', 'HOLD', 'LIVE', 'WET'][i], ['OPEN', 'FOR', 'SAMPLE', 'CELL'][i], '#' + (4100 + i * 37)], 0.12, 0.17, { seed: 60 + i, stamp: ['C', 'B', 'A', 'X'][i] }));
}

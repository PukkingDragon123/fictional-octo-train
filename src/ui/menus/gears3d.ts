// THE GEAR WORKS: real 3D steel gears for the settings. Each gear is a
// faceted extruded tooth profile (flat-shaded, chamfered, spoke windows cut
// out), an octagonal hub with hex bolts, a worn pixel-art steel texture
// (nearest filtered) and a black inverted-hull outline, lit by a warm key, a
// cold rim and a dim fill. They render in a tiny three.js canvas at low
// resolution, enlarged by a whole number of device pixels (crisp pixels, no
// blur), and only while something moves.
//  gearButton   the SETTINGS entry: a gear that creeps round, spins up when
//               hovered or focused and turns a notch when pressed.
//  gearCluster  inside SETTINGS: one meshing gear per page in a gear train;
//               picking a page turns the whole train (the gears mesh, so
//               neighbours counter-rotate) and the page changes when it
//               clicks home. Labels float beside the gears as free text.
import * as THREE from 'three';
import { PixelCanvas, mixHex, bayer } from '../../gfx/pixel';
import { kitScale } from './btnKit';
import { sfx } from './sfx';
import { calm } from './settings';
import './kit.css';

/** the gears' pixel: about two thirds of the kit's art pixel, a whole number of device pixels (more facets read) */
export function fineScale(): number {
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  return Math.max(1, Math.round(kitScale() * dpr * 0.66)) / dpr;
}
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return ((h >>> 0) % 10000) / 10000; };

// ------------------------------------------------------------------ the worn steel texture (shared)
let steelTex: THREE.CanvasTexture | null = null;
function steelTexture(): THREE.CanvasTexture {
  if (steelTex) return steelTex;
  const N = 32, pc = new PixelCanvas(N, N);
  const R = [0x3a4045, 0x4f575d, 0x646d73, 0x7a838a, 0x949da3, 0xb4bcc0];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0.6 + (hash(x >> 2, y >> 1, 3) - 0.5) * 0.16 + Math.sin(x * 0.5 + y * 0.12) * 0.05;
    if (hash(x, y, 7) > 0.975) v += 0.25;           // bright scratches
    if (hash(x >> 3, y >> 3, 11) < 0.12) v -= 0.22; // grime
    const f = Math.max(0, Math.min(1, v)) * 5;
    let i = Math.floor(f); if (f - i > bayer(x, y)) i++;
    let c = R[Math.max(0, Math.min(5, i))];
    if (hash(x >> 1, y >> 1, 13) < 0.05) c = mixHex(c, 0x7a3a16, 0.6); // rust
    pc.set(x, y, c);
  }
  for (let i = 0; i < 6; i++) { const x0 = Math.floor(hash(i, 1, 17) * N), y0 = Math.floor(hash(i, 2, 17) * N); for (let k = 0; k < 6; k++) pc.set((x0 + k) % N, (y0 + (k >> 1)) % N, 0xc8d0d4); }
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(0.35, 0.35);
  steelTex = t;
  return t;
}

// ------------------------------------------------------------------ geometry
export interface GearSpec { teeth: number; r: number; depth?: number; spokes?: number; seed?: number }
const geoCache = new Map<string, THREE.BufferGeometry>();
function gearGeometry(g: GearSpec): THREE.BufferGeometry {
  const key = `${g.teeth}|${g.r}|${g.depth}|${g.spokes}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const { teeth, r } = g;
  const depth = g.depth ?? r * 0.28;
  const tip = r, root = r - Math.min(0.24, r * 0.2);
  const shape = new THREE.Shape();
  const pitch = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * pitch;
    const pts: [number, number][] = [[a, root], [a + pitch * 0.18, tip * 0.985], [a + pitch * 0.25, tip], [a + pitch * 0.45, tip], [a + pitch * 0.52, tip * 0.985], [a + pitch * 0.7, root]];
    pts.forEach(([ang, rad], j) => { const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad; if (i === 0 && j === 0) shape.moveTo(x, y); else shape.lineTo(x, y); });
  }
  shape.closePath();
  // the shaft hole (an octagon) and spoke windows (faceted ring sectors)
  const hole = new THREE.Path();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * r * 0.13, y = Math.sin(a) * r * 0.13; if (i) hole.lineTo(x, y); else hole.moveTo(x, y); }
  hole.closePath();
  shape.holes.push(hole);
  const spokes = g.spokes ?? (r > 0.7 ? 5 : 4);
  const ri = r * 0.36, ro = root - r * 0.16;
  if (ro - ri > r * 0.12) for (let s = 0; s < spokes; s++) {
    const a0 = (s / spokes) * Math.PI * 2 + 0.22, a1 = ((s + 1) / spokes) * Math.PI * 2 - 0.22;
    const w = new THREE.Path();
    const steps = 3;
    for (let k = 0; k <= steps; k++) { const a = a0 + ((a1 - a0) * k) / steps; const x = Math.cos(a) * ro, y = Math.sin(a) * ro; if (k) w.lineTo(x, y); else w.moveTo(x, y); }
    for (let k = steps; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / steps; w.lineTo(Math.cos(a) * ri, Math.sin(a) * ri); }
    w.closePath();
    shape.holes.push(w);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.22, bevelSize: r * 0.035, bevelSegments: 1, curveSegments: 1, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  geoCache.set(key, geo);
  return geo;
}
/** an octagonal hub with a chamfer (lathe, 8 facets) */
function hubGeometry(r: number, d: number) {
  const p = [new THREE.Vector2(0.001, -d), new THREE.Vector2(r * 0.8, -d), new THREE.Vector2(r, -d * 0.7), new THREE.Vector2(r, d * 0.7), new THREE.Vector2(r * 0.8, d), new THREE.Vector2(0.001, d)];
  const g = new THREE.LatheGeometry(p, 8);
  g.rotateX(Math.PI / 2);
  return g;
}
function boltGeometry(r: number, d: number) {
  const p = [new THREE.Vector2(0.001, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, d * 0.7), new THREE.Vector2(r * 0.7, d), new THREE.Vector2(0.001, d)];
  const g = new THREE.LatheGeometry(p, 6);
  g.rotateX(Math.PI / 2);
  return g;
}

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
function withOutline(geo: THREE.BufferGeometry, mat: THREE.Material, grow: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, OUTLINE);
  o.scale.setScalar(grow);
  g.add(o, m);
  return g;
}

/** a whole gear: tooth wheel, hub, bolts, all outlined; the hub material can glow (the selected page) */
function makeGear(spec: GearSpec, hubGlow = false): { group: THREE.Group; hubMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: steelTexture(), color: 0xe4e8ea, flatShading: true, metalness: 0.32, roughness: 0.52 });
  const depth = spec.depth ?? spec.r * 0.28;
  group.add(withOutline(gearGeometry(spec), mat, 1 + 0.05 / spec.r));
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb08a3a, flatShading: true, metalness: 0.4, roughness: 0.4, emissive: hubGlow ? 0xd8600c : 0x000000, emissiveIntensity: 0 });
  const hub = withOutline(hubGeometry(spec.r * 0.24, depth * 0.85), hubMat, 1.12);
  group.add(hub);
  const boltMat = new THREE.MeshStandardMaterial({ color: 0xc8d0d4, flatShading: true, metalness: 0.4, roughness: 0.35 });
  const nb = spec.r > 0.7 ? 5 : 4;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + 0.3;
    const b = withOutline(boltGeometry(spec.r * 0.055, depth * 0.35), boltMat, 1.25);
    b.position.set(Math.cos(a) * spec.r * 0.3, Math.sin(a) * spec.r * 0.3, depth * 0.62);
    group.add(b);
  }
  return { group, hubMat };
}

// ------------------------------------------------------------------ a tiny stage (one per widget)
class Stage {
  canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  W = 0; H = 0;
  constructor(fov = 26) {
    this.cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 50);
    this.canvas.className = 'gw-cv';
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
    } catch { this.renderer = null; }
    this.scene.add(new THREE.AmbientLight(0x8a96a8, 0.7));
    this.scene.add(new THREE.HemisphereLight(0xc8d4e0, 0x2a2018, 0.9));
    const key = new THREE.DirectionalLight(0xffe2b8, 3.4); key.position.set(-3, 4, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6a9aff, 2.2); rim.position.set(4, -1, -3); this.scene.add(rim);
    const fill = new THREE.PointLight(0xffb070, 1.2, 12, 1.5); fill.position.set(2, -2, 4); this.scene.add(fill);
  }
  /** size in fine px (half the kit's art pixel, still whole device pixels) */
  size(W: number, H: number) {
    const s = fineScale();
    this.W = W; this.H = H;
    this.renderer?.setSize(W, H, false);
    this.canvas.style.width = W * s + 'px'; this.canvas.style.height = H * s + 'px';
    this.cam.aspect = W / H; this.cam.updateProjectionMatrix();
  }
  render() { this.renderer?.render(this.scene, this.cam); }
  dispose() { this.renderer?.dispose(); this.renderer = null; }
}

// a single loop for every turning gear widget
const ticking = new Set<{ el: HTMLElement; tick: (dt: number) => boolean }>();
let raf = 0, lastT = 0;
function loop(now: number) {
  raf = 0;
  const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
  lastT = now;
  for (const t of [...ticking]) { if (!t.el.isConnected || !t.tick(dt)) ticking.delete(t); }
  if (ticking.size) raf = requestAnimationFrame(loop); else lastT = 0;
}
function run(t: { el: HTMLElement; tick: (dt: number) => boolean }) { ticking.add(t); if (!raf) raf = requestAnimationFrame(loop); }

// ------------------------------------------------------------------ the SETTINGS gear
export type GearButton = HTMLButtonElement & { spin: (w: number) => void; dispose: () => void };
export function gearButton(label: string, onClick: () => void, o: { size?: number; aria?: string } = {}): GearButton {
  const b = document.createElement('button') as GearButton;
  b.type = 'button';
  b.className = 'gb';
  b.setAttribute('aria-label', o.aria ?? label);
  const st = new Stage(24);
  const lab = document.createElement('span'); lab.className = 'gb-l'; lab.textContent = label;
  b.append(st.canvas, lab);
  const { group, hubMat } = makeGear({ teeth: 12, r: 1 }, true);
  // a small second gear meshing at the back, for the sense of a mechanism
  const small = makeGear({ teeth: 8, r: 0.62, depth: 0.2 }).group;
  small.position.set(1.42, -0.62, -0.3);
  const rig = new THREE.Group(); rig.add(group, small);
  rig.rotation.set(-0.42, 0.38, 0);
  st.scene.add(rig);
  st.cam.position.set(0.32, -0.18, 5.6); st.cam.lookAt(0.32, -0.18, 0);
  let ang = 0, w = 0.35, target = 0.35, glow = 0;
  const N = o.size ?? 60;
  const tickO = {
    el: b,
    tick: (dt: number) => {
      const hot = document.activeElement === b || b.matches(':hover');
      target = calm() ? 0 : hot ? 3.2 : 0.35;
      w += (target - w) * Math.min(1, dt * 3);
      ang += w * dt;
      glow += ((hot ? 1 : 0.15) - glow) * Math.min(1, dt * 5);
      group.rotation.z = -ang;
      small.rotation.z = ang * (12 / 8) + 0.2;
      hubMat.emissiveIntensity = glow * 0.45;
      st.render();
      return true;
    },
  };
  const paint = () => { st.size(N, N + 2); st.render(); };
  b.spin = (dw: number) => { w += dw; run(tickO); };
  b.dispose = () => { st.dispose(); };
  b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== b) b.focus({ preventScroll: true }); sfx('ratchet', 0.4); });
  b.addEventListener('focus', () => run(tickO));
  b.addEventListener('click', () => { w += 9; sfx('ratchet'); sfx('gear', 0.6); onClick(); });
  requestAnimationFrame(() => { paint(); run(tickO); });
  window.addEventListener('resize', () => { if (b.isConnected) paint(); });
  return b;
}

// ------------------------------------------------------------------ the page gear train
export interface GearCluster { el: HTMLElement; select: (i: number, animate?: boolean) => void; readonly index: number; turn: (d: -1 | 1) => void; dispose: () => void; layout: (orient: 'v' | 'h') => void }
export function gearCluster(pages: string[], onPick: (i: number) => void, start = 0): GearCluster {
  const el = document.createElement('div');
  el.className = 'gc';
  const st = new Stage(22);
  el.append(st.canvas);
  const n = pages.length;
  // alternate big and small wheels, zig-zagging so they mesh
  const specs: GearSpec[] = pages.map((_, i) => (i % 2 ? { teeth: 9, r: 0.72, depth: 0.24 } : { teeth: 12, r: 0.96, depth: 0.28 }));
  const gears = specs.map((sp) => makeGear(sp, true));
  const rig = new THREE.Group();
  for (const g of gears) rig.add(g.group);
  rig.rotation.set(-0.3, 0.32, 0);
  st.scene.add(rig);
  const btns = pages.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gc-b';
    b.innerHTML = `<span>${p}</span>`;
    b.setAttribute('role', 'tab');
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== b) b.focus({ preventScroll: true }); });
    b.addEventListener('click', () => select(i, true));
    el.append(b);
    return b;
  });
  let orient: 'v' | 'h' = 'v';
  let cur = Math.max(0, Math.min(n - 1, start));
  let theta = 0, from = 0, to = 0, t0 = 0, dur = 0, pending = -1;
  const place = () => {
    // pitch circles touch: the next centre sits at the sum of the radii, swung out to alternate sides
    let x = 0, y = 0;
    const pos: [number, number][] = [];
    specs.forEach((sp, i) => {
      if (i) {
        const d = specs[i - 1].r + sp.r - 0.13;
        const sideA = orient === 'v' ? (i % 2 ? 0.55 : -0.55) : (i % 2 ? -0.5 : 0.5);
        if (orient === 'v') { x += Math.sin(sideA) * d; y -= Math.cos(sideA) * d; } else { x += Math.cos(sideA) * d; y += Math.sin(sideA) * d; }
      }
      pos.push([x, y]);
    });
    const cx = (Math.min(...pos.map((p) => p[0])) + Math.max(...pos.map((p) => p[0]))) / 2;
    const cy = (Math.min(...pos.map((p) => p[1])) + Math.max(...pos.map((p) => p[1]))) / 2;
    gears.forEach((g, i) => g.group.position.set(pos[i][0] - cx, pos[i][1] - cy, 0));
    return pos.map(([px, py]) => [px - cx, py - cy] as [number, number]);
  };
  const apply = () => {
    // meshing gears turn opposite ways at the inverse ratio of their sizes; odd wheels carry a half-tooth offset
    gears.forEach((g, i) => {
      const k = specs[0].r / specs[i].r;
      g.group.rotation.z = (i % 2 ? 1 : -1) * theta * k + (i % 2 ? Math.PI / specs[i].teeth : 0);
      g.hubMat.emissiveIntensity = i === (pending >= 0 ? pending : cur) ? 0.5 : 0;
    });
    st.render();
  };
  const layoutBtns = () => {
    const s = fineScale();
    el.style.setProperty('--gw', st.W * s + 'px');
    el.style.setProperty('--gh', st.H * s + 'px');
    const v = new THREE.Vector3();
    rig.updateMatrixWorld(true);
    gears.forEach((g, i) => {
      g.group.getWorldPosition(v); v.project(st.cam);
      const x = (v.x * 0.5 + 0.5) * st.W * s, y = (-v.y * 0.5 + 0.5) * st.H * s;
      const rPx = (specs[i].r / 3.6) * st.H * s * (orient === 'v' ? 1 : 1.3);
      const b = btns[i];
      b.style.setProperty('--gx', Math.round(x) + 'px');
      b.style.setProperty('--gy', Math.round(y) + 'px');
      b.style.setProperty('--gr', Math.round(Math.max(26, rPx)) + 'px');
    });
  };
  const layout = (o: 'v' | 'h') => {
    orient = o;
    el.classList.toggle('h', o === 'h');
    const pos = place();
    const span = Math.max(...pos.map((p) => (o === 'v' ? Math.abs(p[1]) : Math.abs(p[0])))) + 1.1;
    if (o === 'v') { st.size(84, Math.round(span * 2 * 27)); st.cam.position.set(0, 0, (span * 2 * 1.02) / (2 * Math.tan((22 * Math.PI) / 360))); }
    else { st.size(Math.round(span * 2 * 27), 72); st.cam.position.set(0, 0, (1.15 * 2 * 1.05) / (2 * Math.tan((22 * Math.PI) / 360))); }
    st.cam.lookAt(0, 0, 0);
    apply();
    layoutBtns();
  };
  const tickO = {
    el,
    tick: (dt: number) => {
      if (dur <= 0) return false;
      const k = Math.min(1, (performance.now() - t0) / dur);
      // a ratcheting turn: ease in, overshoot a hair, settle
      const e = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 3.2) : 1;
      theta = from + (to - from) * e;
      apply();
      if (k >= 1) { dur = 0; if (pending >= 0) { cur = pending; pending = -1; apply(); paintBtns(); onPick(cur); } return false; }
      void dt;
      return true;
    },
  };
  const paintBtns = () => { const on = pending >= 0 ? pending : cur; btns.forEach((b, i) => { b.classList.toggle('on', i === on); b.setAttribute('aria-selected', String(i === on)); }); };
  const select = (i: number, animate = true) => {
    i = ((i % n) + n) % n;
    if (i === cur && pending < 0) return;
    const d = i - (pending >= 0 ? pending : cur);
    pending = i;
    from = theta; to = theta + d * (Math.PI * 2 / 5);
    if (!animate || calm()) { theta = to; cur = i; pending = -1; apply(); paintBtns(); onPick(cur); return; }
    t0 = performance.now(); dur = 520 + Math.abs(d) * 120;
    sfx('ratchet'); sfx('gear', 0.7);
    run(tickO);
    paintBtns();
  };
  paintBtns();
  requestAnimationFrame(() => layout(orient));
  window.addEventListener('resize', () => { if (el.isConnected) layout(orient); });
  return {
    el, select, layout,
    get index() { return pending >= 0 ? pending : cur; },
    turn: (d: -1 | 1) => select((pending >= 0 ? pending : cur) + d, true),
    dispose: () => st.dispose(),
  };
}

// The 3D props of the hybrid pack close-up (round 18b): the unit's field pack (an open canvas body whose floor is
// the painted interior of ./board.ts, a lid hinged at the back that flips over to lie open beyond it, its inside
// painted with the pockets and tool loops), and one shell per kind of container being searched (a cardboard box
// with four flaps, a wooden drawer that slides out, a locker / fridge / cabinet whose door swings over, a crate
// whose lid lifts off, a bin bag, a coat with pocket flaps, a patch of floor). Each opens on a 0..1 dial and says
// where the hands should be while it does. Every surface is painted pixel art (./paint.ts).
import * as THREE from 'three';
import { PPM } from './board';
import { Px, PAL, hex, mix, mul, upscale, weave, leather, webbing, brushed, wood, cardboard, enamel, cloth, plastic, felt, stitchLine, stitchRect, rivet, buckle, zipper, innerShadow, type C3 } from './paint';

const WALL_PPM = 300;

function texOf(cv: HTMLCanvasElement, k = 2): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(upscale(cv, k));
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
  return t;
}
const std = (map: THREE.Texture | null, rough = 0.9, metal = 0, color = 0xffffff) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal, color });

/** paint a w x h metre face with a surface painter */
function face(w: number, h: number, seed: number, fn: (p: Px, W: number, H: number) => void, ppm = WALL_PPM): THREE.CanvasTexture {
  const W = Math.max(4, Math.round(w * ppm)), H = Math.max(4, Math.round(h * ppm));
  const p = new Px(W, H, seed);
  fn(p, W, H);
  return texOf(p.done());
}

/** a box whose six faces each get their own painted texture (faces: +x -x +y -y +z -z) */
function paintedBox(w: number, h: number, d: number, fns: ((p: Px, W: number, H: number) => void)[], seed: number, ppm = WALL_PPM): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const mats = dims.map(([a, b], i) => std(face(a, b, seed + i * 17, fns[i] ?? fns[0], ppm)));
  return new THREE.Mesh(g, mats);
}

// ---------------------------------------------------------------- surfaces
const S = {
  canvas: (base: C3) => (p: Px, W: number, H: number) => { weave(p, 0, 0, W, H, base, { seed: W * 3 + H, dirt: 0.7, wear: 0.7 }); stitchLine(p, 1, 2, W - 2, 2, PAL.thread, 0.7); stitchLine(p, 1, H - 3, W - 2, H - 3, PAL.thread, 0.6); },
  binding: (p: Px, W: number, H: number) => { webbing(p, 0, 0, W, H, PAL.web, W < H, W + H); },
  card: (p: Px, W: number, H: number) => { cardboard(p, 0, 0, W, H, PAL.card, { seed: W + H * 7 }); for (let i = 0; i < W; i++) p.shade(i, 0, 0.7); },
  cardIn: (p: Px, W: number, H: number) => { cardboard(p, 0, 0, W, H, mul(PAL.card, 0.86), { seed: W * 5 + H }); innerShadow(p, 0, 0, W, H, 6, 0.4); },
  wood: (base: C3) => (p: Px, W: number, H: number) => { wood(p, 0, 0, W, H, base, 10, { seed: W * 7 + H }); },
  steel: (base: C3) => (p: Px, W: number, H: number) => { brushed(p, 0, 0, W, H, base, { seed: W + H * 3, dirt: 0.45 }); for (const [x, y] of [[2, 2], [W - 5, 2], [2, H - 5], [W - 5, H - 5]]) rivet(p, x, y, PAL.steel); },
  enamel: (base: C3) => (p: Px, W: number, H: number) => { enamel(p, 0, 0, W, H, base, { seed: W + H }); },
  plastic: (p: Px, W: number, H: number) => { plastic(p, 0, 0, W, H, hex(0x242624), W + H); },
  felt: (p: Px, W: number, H: number) => { felt(p, 0, 0, W, H, hex(0x4a4c50), W + H); },
};

// ---------------------------------------------------------------- the field pack
export interface FieldPack {
  root: THREE.Group;
  floor: THREE.Mesh; lidIn: THREE.Mesh;
  lid: THREE.Group;
  W: number; L: number; h: number; lidL: number;
  /** 0 shut .. 1 open */
  setOpen(k: number): void;
  /** where the left hand holds the lid's free edge (pack-local) */
  lidEdge(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export function buildPack(bodyTex: THREE.Texture, lidTex: THREE.Texture, W: number, L: number, lidL: number): FieldPack {
  const root = new THREE.Group();
  const h = 0.085, t = 0.02;
  const olive = hex(0x767a4c);
  // the floor (the painted interior)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), std(bodyTex, 0.96));
  floor.position.y = 0.012; floor.name = 'packFloor';
  root.add(floor);
  // the walls: canvas outside and in, a webbing binding rolled over their tops
  const wall = S.canvas(olive), wallIn = S.canvas(mix(PAL.lining, PAL.khaki, 0.3));
  const front = (p: Px, Wd: number, Hd: number) => {
    wall(p, Wd, Hd);
    // two compression straps with brass buckles down the front
    for (const fx of [0.28, 0.72]) {
      const sx = Math.round(Wd * fx) - 4;
      webbing(p, sx, 0, 9, Hd, PAL.web, true, sx);
      buckle(p, sx - 2, Math.round(Hd * 0.42), 13, 9);
    }
    // a Meridian patch: a stitched olive square with the bishop in tan thread
    const px = Math.round(Wd / 2) - 9, py = Math.round(Hd * 0.25);
    p.rect(px, py, 18, 14, mul(olive, 0.8)); stitchRect(p, px, py, 18, 14, PAL.thread, 0.9);
    for (const [dx, dy] of [[8, 3], [9, 3], [7, 4], [10, 4], [7, 5], [8, 5], [9, 5], [10, 5], [8, 6], [9, 6], [7, 8], [8, 8], [9, 8], [10, 8], [6, 9], [11, 9], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10]]) p.put(px + dx, py + dy, hex(0xc8b888));
  };
  const walls: [number, number, number, number, number, ((p: Px, W: number, H: number) => void)][] = [
    [W + 2 * t, t, 0, L / 2 + t / 2, 0, front],
    [W + 2 * t, t, 0, -L / 2 - t / 2, 0, wall],
    [t, L, -W / 2 - t / 2, 0, 1, wall],
    [t, L, W / 2 + t / 2, 0, 1, wall],
  ];
  walls.forEach(([w, d, x, z, side, outer], i) => {
    const m = paintedBox(w, h, d, side ? [outer, outer, S.binding, S.binding, wallIn, wallIn] : [wallIn, wallIn, S.binding, S.binding, i === 0 ? outer : wallIn, i === 0 ? wallIn : outer], 300 + i * 11);
    m.position.set(x, h / 2, z);
    root.add(m);
    // the rolled binding on top
    const b = new THREE.Mesh(new THREE.BoxGeometry(side ? t + 0.012 : w + 0.012, 0.014, side ? L + 0.012 : t + 0.012), std(face(side ? L : w, 0.03, 50 + i, S.binding)));
    b.position.set(x, h + 0.004, z);
    root.add(b);
  });
  // the lid: a padded slab hinged along the back top edge, its inside the painted organiser
  const lid = new THREE.Group();
  lid.position.set(0, h + 0.01, -L / 2 - t);
  const LW = W + 2 * t + 0.012;
  const lidOut = (p: Px, Wd: number, Hd: number) => {
    weave(p, 0, 0, Wd, Hd, olive, { seed: 77, dirt: 0.75, wear: 0.8 });
    // two straps running to the free edge, a carry handle at the hinge, a grab loop
    for (const fx of [0.28, 0.72]) { const sx = Math.round(Wd * fx) - 4; webbing(p, sx, 0, 9, Hd, PAL.web, true, sx); for (let j = 0; j < Hd; j++) p.film(sx + 9, j, [0, 0, 0], 0.3); stitchRect(p, sx + 1, 4, 7, 10, PAL.thread, 0.7); }
    leather(p, Math.round(Wd / 2) - 14, 3, 28, 7, PAL.leather, { seed: 79, stitch: true });
    stitchRect(p, 4, 4, Wd - 8, Hd - 8, PAL.thread, 0.75);
    innerShadow(p, 0, 0, Wd, Hd, 3, 0.3);
  };
  const slab = paintedBox(LW, 0.018, lidL, [S.binding, S.binding, lidOut, S.binding, S.binding, S.binding], 400, 280);
  slab.position.set(0, 0.009, lidL / 2);
  lid.add(slab);
  const lidIn = new THREE.Mesh(new THREE.PlaneGeometry(LW - 0.01, lidL - 0.01).rotateX(Math.PI / 2), std(lidTex, 0.95));
  lidIn.position.set(0, -0.0015, lidL / 2); lidIn.name = 'lidIn';
  lid.add(lidIn);
  root.add(lid);
  const openA = Math.PI + Math.asin(Math.min(0.9, (h + 0.01) / lidL));
  const pack: FieldPack = {
    root, floor, lidIn, lid, W, L, h, lidL,
    setOpen(k: number) {
      const e = Math.max(0, Math.min(1, k));
      lid.rotation.x = -openA * e;
      // the lid lifts a little off the body as it goes (the padding)
      lid.position.y = h + 0.01 + Math.sin(e * Math.PI) * 0.015;
    },
    lidEdge(out) { out.set(0, 0.012, lidL); lid.updateMatrix(); return out.applyMatrix4(lid.matrix); },
    dispose() { root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; if (mm) for (const q of Array.isArray(mm) ? mm : [mm]) { const mp = (q as THREE.MeshStandardMaterial).map; if (mp && mp !== bodyTex && mp !== lidTex) mp.dispose(); q.dispose(); } }); },
  };
  pack.setOpen(0);
  return pack;
}

// ---------------------------------------------------------------- containers
export interface Shell {
  root: THREE.Group;
  floor: THREE.Mesh;
  W: number; L: number; h: number;
  kind: string;
  /** seconds the opening takes, the sound it makes */
  dur: number; sound: string;
  setOpen(k: number): void;
  /** where each hand is while it opens (shell-local), and its pose */
  grips(k: number, L: THREE.Vector3, R: THREE.Vector3): { l: string; r: string };
  dispose(): void;
}

/** which shell a container style gets */
export function shellKind(style: string, kind: string): string {
  if (kind === 'floor' || style === 'floor') return 'floor';
  if (style === 'cardboard') return 'box';
  if (style === 'wood' || style === 'laminate' || style === 'shelf') return 'drawer';
  if (style === 'crate' || style === 'carpet' || style === 'cooler') return 'crate';
  if (style === 'trash' || style === 'pile') return 'bin';
  if (style === 'corpse') return 'corpse';
  return 'cabinet';
}

function wallSet(root: THREE.Group, W: number, L: number, h: number, t: number, outer: (p: Px, W: number, H: number) => void, inner: (p: Px, W: number, H: number) => void, top: (p: Px, W: number, H: number) => void, seed: number) {
  const ws: [number, number, number, number, number][] = [[W + 2 * t, t, 0, L / 2 + t / 2, 0], [W + 2 * t, t, 0, -L / 2 - t / 2, 0], [t, L, -W / 2 - t / 2, 0, 1], [t, L, W / 2 + t / 2, 0, 1]];
  ws.forEach(([w, d, x, z, side], i) => {
    const fns = side ? [x < 0 ? outer : inner, x < 0 ? inner : outer, top, top, inner, inner] : [inner, inner, top, top, i === 0 ? outer : inner, i === 0 ? inner : outer];
    const m = paintedBox(w, h, d, fns, seed + i * 13);
    m.position.set(x, h / 2, z);
    root.add(m);
  });
}

export function buildShell(style: string, kind: string, tex: THREE.Texture, W: number, L: number): Shell {
  const root = new THREE.Group();
  const sk = shellKind(style, kind);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, transparent: sk === 'floor', alphaTest: sk === 'floor' ? 0.02 : 0 }));
  floor.name = 'lootFloor';
  root.add(floor);
  const t = 0.014;
  let h = 0.1, dur = 0.7, sound = 'rummage';
  let setOpen: (k: number) => void = () => { /* nothing moves */ };
  let grips: Shell['grips'] = (k, l, r) => { l.set(-W * 0.3, 0.06, 0); r.set(W * 0.3, 0.06, 0); return { l: 'open', r: 'open' }; };
  const ease = (x: number) => { const e = Math.max(0, Math.min(1, x)); return e * e * (3 - 2 * e); };
  const top = (p: Px, Wd: number, Hd: number) => { p.rect(0, 0, Wd, Hd, hex(0x2a2a26)); };
  if (sk === 'box') {
    h = 0.15; dur = 0.75; sound = 'rummage';
    wallSet(root, W, L, h, t, S.card, S.cardIn, (p, Wd, Hd) => { cardboard(p, 0, 0, Wd, Hd, mul(PAL.card, 1.05), { seed: Wd }); }, 600);
    // four flaps: the long ones (front, back) meet in the middle and were taped; the short ones tuck under
    const flaps: { g: THREE.Group; axis: 'x' | 'z'; sign: number; a0: number; t0: number; t1: number }[] = [];
    const mk = (fw: number, fl: number, x: number, z: number, axis: 'x' | 'z', sign: number, t0: number, t1: number, seed: number) => {
      const g = new THREE.Group(); g.position.set(x, h, z);
      const m = paintedBox(fw, 0.006, fl, [S.card, S.card, (p, Wd, Hd) => { cardboard(p, 0, 0, Wd, Hd, PAL.card, { seed }); for (let i = 0; i < Wd; i++) { p.put(i, Hd - 4, PAL.tape); p.put(i, Hd - 3, mul(PAL.tape, 1.08)); p.put(i, Hd - 2, mul(PAL.tape, 0.9)); } }, S.cardIn, S.card, S.card], seed);
      if (axis === 'x') m.position.set(0, 0.003, -sign * fl / 2); else m.position.set(-sign * fw / 2, 0.003, 0);
      g.add(m); root.add(g);
      flaps.push({ g, axis, sign, a0: 0, t0, t1 });
    };
    mk(W, L / 2, 0, L / 2, 'x', 1, 0, 0.55, 610);
    mk(W, L / 2, 0, -L / 2, 'x', -1, 0.08, 0.62, 611);
    mk(W / 2, L * 0.96, -W / 2, 0, 'z', -1, 0.4, 0.95, 612);
    mk(W / 2, L * 0.96, W / 2, 0, 'z', 1, 0.45, 1, 613);
    // the short flaps sit a hair lower than the long ones
    flaps[2].g.position.y -= 0.004; flaps[3].g.position.y -= 0.004;
    const OPEN = 2.35;
    setOpen = (k) => {
      for (const f of flaps) {
        const e = ease((k - f.t0) / (f.t1 - f.t0)) * OPEN;
        if (f.axis === 'x') f.g.rotation.x = f.sign * e; else f.g.rotation.z = -f.sign * e;
      }
    };
    grips = (k, l, r) => {
      const a = ease(k / 0.6) * OPEN, b = ease((k - 0.4) / 0.6) * OPEN;
      // right hand lifts the front flap's edge, the left the back one; then they push the sides out
      r.set(W * 0.12, h + Math.sin(a) * L * 0.5, L / 2 - Math.cos(a) * L * 0.5);
      l.set(-W * 0.12, h + Math.sin(a) * L * 0.5, -L / 2 + Math.cos(a) * L * 0.5);
      if (k > 0.45) { r.lerp(new THREE.Vector3(W / 2 - Math.cos(b) * W * 0.4, h + Math.sin(b) * W * 0.4, 0), ease((k - 0.45) / 0.3)); l.lerp(new THREE.Vector3(-W / 2 + Math.cos(b) * W * 0.4, h + Math.sin(b) * W * 0.4, 0), ease((k - 0.45) / 0.3)); }
      return { l: k < 0.9 ? 'pinch' : 'open', r: k < 0.9 ? 'pinch' : 'open' };
    };
  } else if (sk === 'drawer') {
    h = 0.08; dur = 0.6; sound = 'drawer_wood';
    const base = style === 'laminate' ? hex(0xb8a478) : PAL.wood;
    const body = new THREE.Group(); root.add(body);
    body.add(floor);
    wallSet(body, W, L, h, t, S.wood(base), S.wood(mul(base, 0.85)), S.wood(mul(base, 1.1)), 640);
    // a thicker drawer front with a brass pull
    const fr = paintedBox(W + 0.05, h + 0.03, 0.022, [S.wood(mul(base, 0.8))], 650);
    const fd = (p: Px, Wd: number, Hd: number) => { wood(p, 0, 0, Wd, Hd, mul(base, 0.92), 9, { seed: 651 }); for (let i = 0; i < Wd; i++) { p.shade(i, 0, 1.3); p.shade(i, Hd - 1, 0.5); } };
    (fr.material as THREE.MeshStandardMaterial[])[2] = std(face(W + 0.05, 0.022, 652, fd));
    (fr.material as THREE.MeshStandardMaterial[])[4] = std(face(W + 0.05, h + 0.03, 653, fd));
    fr.position.set(0, (h + 0.03) / 2, L / 2 + t + 0.011);
    body.add(fr);
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.018), std(null, 0.35, 0.85, 0xc49a48));
    pull.position.set(0, h * 0.62, L / 2 + t + 0.03);
    body.add(pull);
    const shadowDark = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.1, L + 0.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0, depthWrite: false }));
    shadowDark.position.y = h + 0.04; shadowDark.renderOrder = 4; root.add(shadowDark);
    setOpen = (k) => {
      const e = ease(k);
      body.position.z = -(1 - e) * (L + 0.08);
      // it comes out of the dark of the desk: shaded until it is out
      (shadowDark.material as THREE.MeshBasicMaterial).opacity = (1 - e) * 0.85;
      shadowDark.position.z = -(1 - e) * (L + 0.08) * 0.5 - L * 0.5 * (1 - e);
    };
    grips = (k, l, r) => {
      const e = ease(k);
      r.set(0.01, h * 0.62 + 0.01, L / 2 + t + 0.05 - (1 - e) * (L + 0.08));
      l.set(-W * 0.42, h + 0.02, L * 0.35 - (1 - e) * (L + 0.08));
      return { l: 'flat', r: 'grip' };
    };
  } else if (sk === 'cabinet') {
    const base = style === 'fridge' || style === 'freezer' || style === 'medical' ? hex(0xd8d8cc) : style === 'oven' || style === 'vending' ? hex(0x3a3a38) : style === 'toolbox' ? hex(0x9a3a2a) : hex(0x6e7a70);
    const enam = style === 'fridge' || style === 'freezer' || style === 'medical' || style === 'oven' || style === 'vending';
    h = 0.12; dur = 0.7; sound = enam ? 'door_open' : 'drawer_metal';
    const surf = enam ? S.enamel(base) : S.steel(base);
    wallSet(root, W, L, h, t, surf, enam ? S.enamel(mul(base, 0.9)) : S.steel(mul(base, 0.85)), surf, 700);
    // the door, hinged along the left edge; its inside has a rubber seal (or a mirror of hooks for lockers)
    const hinge = new THREE.Group(); hinge.position.set(-W / 2 - t, h, 0); root.add(hinge);
    const DW = W + 2 * t, DL = L + 2 * t;
    const outside = (p: Px, Wd: number, Hd: number) => {
      surf(p, Wd, Hd);
      // vents (lockers), a handle plate on the free edge
      if (!enam) for (let y = Math.round(Hd * 0.15); y < Hd * 0.45; y += 4) for (let x = Math.round(Wd * 0.2); x < Wd * 0.7; x++) { p.put(x, y, hex(0x1a1c1a)); p.put(x, y + 1, mul(base, 1.3)); }
      p.rect(Wd - 12, Math.round(Hd / 2) - 10, 7, 20, PAL.steelD); p.rect(Wd - 11, Math.round(Hd / 2) - 9, 5, 18, PAL.steel);
    };
    const inside = (p: Px, Wd: number, Hd: number) => {
      (enam ? S.enamel(mul(base, 0.95)) : S.steel(mul(base, 0.9)))(p, Wd, Hd);
      p.rect(2, 2, Wd - 4, 3, hex(0x1e1e1c)); p.rect(2, Hd - 5, Wd - 4, 3, hex(0x1e1e1c)); p.rect(2, 2, 3, Hd - 4, hex(0x1e1e1c)); p.rect(Wd - 5, 2, 3, Hd - 4, hex(0x1e1e1c));
      if (!enam) for (let i = 0; i < 3; i++) { const y = Math.round(Hd * (0.25 + i * 0.25)); p.rect(10, y, Wd - 20, 2, PAL.steel); }
    };
    const door = paintedBox(DW, 0.016, DL, [surf, surf, outside, inside, surf, surf], 720);
    door.position.set(DW / 2, 0.008, 0);
    hinge.add(door);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.02, 0.09), std(null, 0.3, 0.9, 0xb8bcb4));
    handle.position.set(DW - 0.02, 0.026, 0); hinge.add(handle);
    const openA = Math.PI + Math.asin(Math.min(0.9, h / DW));
    setOpen = (k) => { hinge.rotation.z = ease(k) * openA; };
    grips = (k, l, r) => {
      const a = ease(k) * openA;
      r.set(-W / 2 - t + Math.cos(a) * (DW - 0.02), h + Math.sin(a) * (DW - 0.02) + 0.03, 0.01);
      l.set(-W * 0.2, h + 0.03, L * 0.45);
      return { l: 'flat', r: 'grip' };
    };
  } else if (sk === 'crate') {
    const base = style === 'carpet' ? hex(0x4a4c50) : style === 'cooler' ? hex(0xd8dcd8) : hex(0xa8865a);
    h = 0.13; dur = 0.7; sound = style === 'cooler' ? 'door_open' : 'drawer_wood';
    const surf = style === 'carpet' ? S.felt : style === 'cooler' ? S.enamel(base) : (p: Px, Wd: number, Hd: number) => { wood(p, 0, 0, Wd, Hd, base, 9, { seed: Wd + Hd }); for (let x = 0; x < Wd; x += 14) for (let y = 0; y < Hd; y++) p.shade(x, y, 0.5); };
    wallSet(root, W, L, h, t, surf, surf, surf, 760);
    const lid = paintedBox(W + 2 * t + 0.01, 0.02, L + 2 * t + 0.01, [surf], 780);
    root.add(lid);
    setOpen = (k) => {
      const e = ease(k);
      // lifted off, carried back, laid down leaning on the far side
      lid.position.set(-e * W * 0.15, h + 0.01 + Math.sin(e * Math.PI) * 0.16 + e * (-h + 0.012), -e * (L + 0.06));
      lid.rotation.set(-e * 0.18, 0, e * 0.06);
    };
    grips = (k, l, r) => {
      const e = ease(k);
      const y = h + 0.03 + Math.sin(e * Math.PI) * 0.16 + e * (-h + 0.012), z = -e * (L + 0.06);
      r.set(W / 2 - e * W * 0.15, y, z); l.set(-W / 2 - e * W * 0.15, y, z);
      return { l: 'grip', r: 'grip' };
    };
  } else if (sk === 'bin') {
    h = style === 'pile' ? 0.02 : 0.14; dur = 0.55; sound = 'rummage';
    if (style !== 'pile') {
      wallSet(root, W, L, h, t, S.plastic, S.plastic, S.plastic, 800);
      // the bag's mouth folded over the rim
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 16), std(face(0.3, 0.05, 801, S.plastic), 0.4));
      rim.rotation.x = Math.PI / 2; rim.scale.set(W * 0.56, L * 0.56, 0.4); rim.position.y = h;
      root.add(rim);
      setOpen = (k) => { const e = ease(k); rim.scale.set(W * (0.5 + 0.06 * e), L * (0.5 + 0.06 * e), 0.4); };
    }
    grips = (k, l, r) => { const e = ease(k); l.set(-W * (0.2 + 0.3 * e), h + 0.03, 0); r.set(W * (0.2 + 0.3 * e), h + 0.03, 0); return { l: 'grip', r: 'grip' }; };
  } else if (sk === 'corpse') {
    h = 0.01; dur = 0.6; sound = 'cloth';
    // the coat's front lies over its pockets: one panel per side, folded back in turn
    const flaps: THREE.Group[] = [];
    for (const sgn of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sgn * W / 2, 0.016, 0);
      const m = paintedBox(W / 2, 0.006, L, [(p, Wd, Hd) => { cloth(p, 0, 0, Wd, Hd, hex(0x30343a), { seed: Wd + sgn, dirt: 0.8 }); stitchRect(p, 2, 2, Wd - 4, Hd - 4, hex(0x6a645a), 0.7); }], 820 + sgn);
      m.position.set(-sgn * W / 4, 0, 0);
      g.add(m); root.add(g); flaps.push(g);
    }
    setOpen = (k) => { flaps[0].rotation.z = -ease(k / 0.7) * 2.9; flaps[1].rotation.z = ease((k - 0.3) / 0.7) * 2.9; };
    grips = (k, l, r) => {
      const a = ease(k / 0.7) * 2.9, b = ease((k - 0.3) / 0.7) * 2.9;
      l.set(-W / 2 + Math.cos(a) * W * 0.45, 0.02 + Math.sin(a) * W * 0.45, 0.02);
      r.set(W / 2 - Math.cos(b) * W * 0.45, 0.02 + Math.sin(b) * W * 0.45, -0.02);
      return { l: 'pinch', r: 'pinch' };
    };
  } else {
    h = 0.0; dur = 0.4; sound = 'rummage';
    floor.renderOrder = 1;
  }
  floor.position.y = sk === 'drawer' ? 0.008 : sk === 'corpse' ? 0.006 : 0.008;
  void top;
  const shell: Shell = {
    root, floor, W, L, h, kind: sk, dur, sound, setOpen, grips,
    dispose() { root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; if (mm) for (const q of Array.isArray(mm) ? mm : [mm]) { const mp = (q as THREE.MeshStandardMaterial).map; if (mp && mp !== tex) mp.dispose(); q.dispose(); } }); },
  };
  setOpen(0);
  return shell;
}

/** metres of a board of art pixels */
export const metres = (px: number) => px / PPM;
export { zipper };

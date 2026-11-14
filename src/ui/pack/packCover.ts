// Opening what is being searched (round 18b): the first-person backpack scene (src/ui/inventory.ts) sets the
// container down beside the pack shut, and the hands open it before anything can be taken: a cardboard box's four
// flaps pulled up and folded out, a locker / fridge / cabinet / toolbox door swung over on its hinge, a crate's lid
// lifted off and laid behind it, a bin's lid flipped back, a sheet / coat pulled back off a body or a heap; a
// drawer slides out toward you by its pull. Each part says where the hands hold it while it moves. ~0.8 s.
import * as THREE from 'three';

export interface Cover {
  g: THREE.Group;
  /** 0 shut .. 1 open */
  set(k: number): void;
  /** where each hand holds while it opens (children of the moving parts), null = the hand stays at rest */
  L: THREE.Object3D | null; R: THREE.Object3D | null;
  dur: number; sound: string;
  /** a drawer: the whole container slides out instead (metres it travels) */
  slide: number;
}

const ease = (x: number) => { const e = Math.max(0, Math.min(1, x)); return e * e * (3 - 2 * e); };

function tex(paint: (c: CanvasRenderingContext2D, w: number, h: number) => void, w = 64, h = 64): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.anisotropy = 8;
  return t;
}
let rs = 7;
const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const noise = (c: CanvasRenderingContext2D, w: number, h: number, a: number) => { for (let i = 0; i < w * h / 3; i++) { c.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a * rnd()})` : `rgba(255,255,255,${a * rnd()})`; c.fillRect(rnd() * w | 0, rnd() * h | 0, 1, 1); } };
const CARD = () => tex((c, w, h) => { c.fillStyle = '#b8905e'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 4) { c.fillStyle = 'rgba(255,240,200,.08)'; c.fillRect(x, 0, 1, h); c.fillStyle = 'rgba(60,30,10,.08)'; c.fillRect(x + 2, 0, 1, h); } noise(c, w, h, 0.18); c.fillStyle = 'rgba(80,50,20,.35)'; c.fillRect(0, 0, w, 1); });
const TAPE = () => tex((c, w, h) => { c.fillStyle = '#c8b88a'; c.fillRect(0, 0, w, h); noise(c, w, h, 0.12); c.fillStyle = 'rgba(255,255,240,.3)'; c.fillRect(0, 2, w, 1); }, 32, 8);
const STEEL = (col: string) => tex((c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { c.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; c.fillRect(0, y, w, 1); } noise(c, w, h, 0.1); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, w, 2); c.fillRect(0, h - 2, w, 2); c.fillRect(0, 0, 2, h); c.fillRect(w - 2, 0, 2, h); for (const [x, y] of [[4, 4], [w - 6, 4], [4, h - 6], [w - 6, h - 6]]) { c.fillStyle = '#d8dcd4'; c.fillRect(x, y, 2, 2); c.fillStyle = '#2a2c2a'; c.fillRect(x + 1, y + 1, 2, 1); } });
const VENTS = (col: string) => tex((c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); noise(c, w, h, 0.1); for (let y = 14; y < 34; y += 4) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(16, y, 32, 1); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(16, y + 1, 32, 1); } c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, w, 2); c.fillRect(0, h - 2, w, 2); c.fillRect(0, 0, 2, h); c.fillRect(w - 2, 0, 2, h); });
const WOOD = () => tex((c, w, h) => { c.fillStyle = '#a88458'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { c.fillStyle = `rgba(70,40,15,${0.05 + 0.12 * Math.abs(Math.sin(y * 0.7 + rnd()))})`; c.fillRect(0, y, w, 1); } for (let y = 0; y < h; y += 13) { c.fillStyle = 'rgba(30,15,5,.55)'; c.fillRect(0, y, w, 1); } noise(c, w, h, 0.12); c.fillStyle = '#2a2a2a'; for (const [x, y] of [[5, 5], [w - 7, 5], [5, h - 7], [w - 7, h - 7]]) c.fillRect(x, y, 2, 2); });
const CLOTH = (col: string) => tex((c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y * 2) % 4 < 2) { c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(x, y, 1, 1); } noise(c, w, h, 0.14); c.fillStyle = 'rgba(90,20,14,.35)'; c.beginPath(); c.ellipse(w * 0.6, h * 0.55, 10, 7, 0.4, 0, Math.PI * 2); c.fill(); });

const mat = (t: THREE.Texture, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: metal });
const slab = (w: number, t: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, t, d), m);
const marker = (parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

/** a cover for a container shell of this style, W x D across the top at height `top` (container-local) */
export function buildCover(style: string, W: number, D: number, top: number): Cover | null {
  const g = new THREE.Group();
  if (style === 'wood' || style === 'laminate' || style === 'shelf') {
    // a drawer: the container itself slides; the right hand has its pull
    const R = marker(g, 0, top - 0.02, D / 2 + 0.05);
    return { g, set() { /* the slide is applied to the container */ }, L: null, R, dur: 0.62, sound: 'drawer_wood', slide: D + 0.12 };
  }
  if (style === 'cardboard') {
    // four flaps folded shut over the top (the long ones meet in the middle over a strip of tape)
    const card = mat(CARD()), tape = mat(TAPE(), 0.6);
    const flaps: { h: THREE.Group; axis: 'x' | 'z'; s: number; t0: number; t1: number }[] = [];
    const mk = (w: number, d: number, x: number, z: number, axis: 'x' | 'z', s: number, t0: number, t1: number, y: number, taped: boolean) => {
      const h = new THREE.Group(); h.position.set(x, top + y, z); g.add(h);
      const m = slab(w, 0.004, d, card);
      if (axis === 'x') m.position.set(0, 0.002, -s * d / 2); else m.position.set(-s * w / 2, 0.002, 0);
      h.add(m);
      if (taped) { const t = slab(w * 0.98, 0.0012, 0.04, tape); t.position.set(0, 0.0046, -s * (d - 0.02)); h.add(t); }
      flaps.push({ h, axis, s, t0, t1 });
      return { h, m };
    };
    mk(W / 2, D - 0.004, -W / 2, 0, 'z', -1, 0.38, 0.92, 0.0, false);
    mk(W / 2, D - 0.004, W / 2, 0, 'z', 1, 0.42, 1, 0.0, false);
    const f = mk(W, D / 2, 0, D / 2, 'x', 1, 0, 0.55, 0.005, true);
    const b = mk(W, D / 2, 0, -D / 2, 'x', -1, 0.06, 0.6, 0.005, false);
    const R = marker(f.h, 0.04, 0.01, -D / 2 + 0.02), L = marker(b.h, -0.04, 0.01, D / 2 - 0.02);
    const OPEN = 2.75;
    return {
      g, L, R, dur: 0.85, sound: 'rummage', slide: 0,
      set(k) { for (const q of flaps) { const e = ease((k - q.t0) / (q.t1 - q.t0)) * OPEN; if (q.axis === 'x') q.h.rotation.x = q.s * e; else q.h.rotation.z = -q.s * e; } },
    };
  }
  if (style === 'crate' || style === 'carpet') {
    // the lid lifted off by both ends and laid down behind
    const lid = new THREE.Group(); g.add(lid);
    const m = slab(W + 0.01, 0.018, D + 0.01, mat(style === 'carpet' ? CLOTH('#4a4c50') : WOOD()));
    m.position.y = 0.009; lid.add(m);
    const L = marker(lid, -W / 2, 0.02, 0.02), R = marker(lid, W / 2, 0.02, 0.02);
    return {
      g, L, R, dur: 0.8, sound: 'drawer_wood', slide: 0,
      set(k) { const e = ease(k); lid.position.set(-e * W * 0.1, top + Math.sin(e * Math.PI) * 0.15 - e * (top - 0.012), -e * (D + 0.07)); lid.rotation.set(-e * 0.16, 0, e * 0.05); },
    };
  }
  if (style === 'corpse' || style === 'pile') {
    // a sheet / the coat's front pulled back off what is underneath
    const h = new THREE.Group(); h.position.set(0, top + 0.004, -D / 2); g.add(h);
    const m = slab(W + 0.03, 0.004, D + 0.02, mat(CLOTH(style === 'corpse' ? '#3a3e44' : '#6a6050'), 0.95));
    m.position.set(0, 0.002, D / 2); h.add(m);
    const L = marker(h, -W * 0.3, 0.01, D - 0.01), R = marker(h, W * 0.3, 0.01, D - 0.01);
    return { g, L, R, dur: 0.7, sound: 'cloth', slide: 0, set(k) { h.rotation.x = -ease(k) * 2.9; } };
  }
  // a door / lid on a hinge: lockers, cabinets, fridges, toolboxes, bins
  const back = style === 'trash';
  const col = style === 'toolbox' ? '#b83a2a' : style === 'fridge' || style === 'freezer' || style === 'medical' ? '#e4e6e0' : style === 'cooler' ? '#4a8ac8' : style === 'oven' || style === 'vending' ? '#4a4a48' : style === 'trash' ? '#3a3e3a' : '#7a8478';
  const enam = style === 'fridge' || style === 'freezer' || style === 'medical' || style === 'cooler';
  const h = new THREE.Group(); g.add(h);
  const door = slab(W + 0.012, 0.016, D + 0.012, mat(style === 'steel' || style === 'mailbox' || style === 'safe' ? VENTS(col) : STEEL(col), enam ? 0.35 : 0.45, enam ? 0 : 0.55));
  h.add(door);
  const handle = slab(back ? 0.09 : 0.016, 0.02, back ? 0.016 : 0.09, new THREE.MeshStandardMaterial({ color: 0xb8bcb4, roughness: 0.3, metalness: 0.9 }));
  h.add(handle);
  let R: THREE.Object3D;
  if (back) { h.position.set(0, top + 0.008, -D / 2 - 0.006); door.position.set(0, 0, D / 2 + 0.006); handle.position.set(0, 0.016, D + 0.0); R = marker(h, 0, 0.03, D); }
  else { h.position.set(-W / 2 - 0.006, top + 0.008, 0); door.position.set(W / 2 + 0.006, 0, 0); handle.position.set(W - 0.01, 0.016, 0); R = marker(h, W - 0.01, 0.03, 0.01); }
  return {
    g, L: null, R, dur: 0.72, sound: enam ? 'door_open' : 'drawer_metal', slide: 0,
    set(k) { const e = ease(k) * 2.95; if (back) h.rotation.x = -e; else h.rotation.z = e; },
  };
}

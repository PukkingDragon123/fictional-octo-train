// The robot tool heads for the subject room's operating arms. Each is a
// faceted low-poly model on the room's pixel-art materials, built along +Y
// from the wrist mount (origin) to the working point (len), with its own
// moving parts animated here:
//   saw      a toothed blade spinning in a half guard
//   scalpel  a long steel blade on a slender holder
//   laser    a finned barrel, a ruby lens and a one-pixel beam
//   stamp    a hydraulic ram driving a rubber-faced die
//   clipper  a clipper body with an oscillating comb
//   spray    a nozzle fed from a paint canister (the paint shows in its window)
//   injector a glass barrel of coloured serum, plunger and needle
//   clamp    two padded jaws on a screw slide
//   welder   a gooseneck torch with a copper tip and a hissing flame
//   scanner  a boxy head with a green slot throwing a fan of light
import * as THREE from 'three';
import { FacetBuilder, at, cbox, prism, lathe, extrude, ngon, tube, band, gem, bolt, hull, starGeo, jitter } from './facet';
import type { FMats } from './pixtex';

export type ToolKind = 'saw' | 'scalpel' | 'laser' | 'stamp' | 'clipper' | 'spray' | 'injector' | 'clamp' | 'welder' | 'scanner';
export const TOOL_KINDS: ToolKind[] = ['saw', 'scalpel', 'laser', 'stamp', 'clipper', 'spray', 'injector', 'clamp', 'welder', 'scanner'];

const DARK = 0x4a4e50, STEEL = 0x8e9294, OLIVE = 0x76804e, OLIVE_D = 0x4e5636;

/** one built tool: its root group (child of an arm's wrist), working length, the parts that move */
export interface ToolModel {
  kind: ToolKind;
  group: THREE.Group;
  /** distance from the wrist to the working point along +Y */
  len: number;
  /** how far the tool stands off the skin when working (the tip touches at 0) */
  standoff: number;
  /** a practical light colour (0 = none) */
  glow: number;
  parts: Record<string, THREE.Object3D>;
  /** the colour of what it carries (paint, serum) */
  setColor?: (c: number) => void;
}

/** the wrist collar every tool sits on */
function collar(b: FacetBuilder) {
  b.add('metal', lathe([[0, -0.05], [0.064, -0.05], [0.07, -0.01], [0.062, 0.03], [0.05, 0.05], [0, 0.055]], 8), DARK);
  b.add('paint', band(0.068, 0.068, 0.022, 0.008, 8, 1, Math.PI / 8), OLIVE, at(0, -0.026, 0));
  b.add('lamp', gem(0.009, 5, 0.008), 0xff3a2a, at(0, 0.0, 0.07, Math.PI / 2));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; b.add('metal', bolt(0.008, 0.006), STEEL, at(Math.cos(a) * 0.058, 0.035, Math.sin(a) * 0.058)); }
}

export function buildTool(kind: ToolKind, mats: FMats): ToolModel {
  const g = new THREE.Group();
  g.name = 'tool:' + kind;
  const parts: Record<string, THREE.Object3D> = {};
  const b = new FacetBuilder();
  collar(b);
  let len = 0.3, standoff = 0, glow = 0;
  let setColor: ((c: number) => void) | undefined;
  switch (kind) {
    case 'saw': {
      // motor drum with cooling fins, an arm out to the axle, the half guard over the back of the blade
      b.add('metal', lathe([[0, 0.05], [0.07, 0.05], [0.082, 0.08], [0.082, 0.16], [0.06, 0.19], [0, 0.195]], 8), DARK);
      for (const y of [0.09, 0.115, 0.14]) b.add('metal', band(0.088, 0.088, 0.008, 0.012, 8, 1, Math.PI / 8), STEEL, at(0, y, 0));
      b.add('paint', hull([[-0.03, 0.18, -0.03], [0.03, 0.18, -0.03], [-0.03, 0.18, 0.0], [0.03, 0.18, 0.0], [-0.02, 0.27, -0.03], [0.02, 0.27, -0.03], [-0.02, 0.27, -0.005], [0.02, 0.27, -0.005]]), OLIVE);
      b.add('hazard', extrude(ngon(0.128, 12, 0).filter((_, i) => i <= 6 || i === 11).map(([x, y]) => [x, -Math.abs(y)] as [number, number]), 0.012, 0.003), 0xffffff, at(0, 0.27, -0.045), { rep: 0.08 });
      b.add('metal', bolt(0.022, 0.016), STEEL, at(0, 0.27, -0.03, -Math.PI / 2));
      const blade = new FacetBuilder();
      blade.add('chrome', starGeo(0.118, 0.098, 28, 0.006, 0.014, 0.42), 0xffffff);
      blade.add('metal', prism(0.03, 0.016, 6), DARK, at(0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; blade.add('metal', cbox(0.044, 0.008, 0.009, 0.002), STEEL, at(Math.cos(a) * 0.062, Math.sin(a) * 0.062, 0, 0, 0, a)); }
      const bl = blade.build(mats);
      bl.position.set(0, 0.27, -0.022);
      parts.blade = bl;
      g.add(bl);
      len = 0.385; standoff = -0.01; glow = 0xffa040;
      break;
    }
    case 'scalpel': {
      b.add('metal', lathe([[0, 0.05], [0.032, 0.05], [0.026, 0.09], [0.016, 0.12], [0, 0.125]], 6), DARK);
      b.add('chrome', prism(0.011, 0.13, 6), 0xffffff, at(0, 0.18, 0));
      for (const y of [0.13, 0.16, 0.19]) b.add('metal', band(0.013, 0.013, 0.006, 0.004, 6), STEEL, at(0, y, 0));
      b.add('metal', cbox(0.026, 0.02, 0.012, 0.004), DARK, at(0, 0.25, 0));
      // the blade: a flat curved belly to a point
      b.add('chrome', extrude([[-0.011, 0], [0.008, 0], [0.012, 0.03], [0.006, 0.062], [-0.004, 0.078], [-0.009, 0.04]], 0.003, 0), 0xffffff, at(0, 0.258, 0));
      len = 0.336; standoff = -0.006; glow = 0;
      break;
    }
    case 'laser': {
      b.add('paint', prism(0.042, 0.06, 8), OLIVE_D, at(0, 0.08, 0));
      b.add('metal', prism(0.03, 0.16, 8), DARK, at(0, 0.17, 0));
      for (let i = 0; i < 6; i++) b.add('metal', band(0.046, 0.046, 0.008, 0.016, 8, 1, Math.PI / 8), STEEL, at(0, 0.12 + i * 0.018, 0));
      b.add('copper', lathe([[0.03, 0], [0.026, 0.03], [0.014, 0.05], [0.012, 0.06]], 8), 0xffffff, at(0, 0.25, 0));
      b.add('lamp', gem(0.012, 6, 0.008), 0xff2a10, at(0, 0.312, 0));
      b.add('rubber', tube([[0.04, 0.07, 0.0], [0.07, 0.11, 0.01], [0.05, 0.18, 0.02], [0.028, 0.22, 0.01]], 0.007, 6, 4), 0x8a8a8a);
      // the beam: a few one-pixel lines (scaled along +Y each frame)
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0.0015, 0, 0, 0.0015, 1, 0, -0.0015, 0, 0.001, -0.0015, 1, 0.001], 3));
      const beam = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      beam.position.y = 0.318; beam.visible = false; beam.frustumCulled = false;
      beam.name = 'beam'; parts.beam = beam; g.add(beam);
      len = 0.318; standoff = 0.09; glow = 0xff2a10;
      break;
    }
    case 'stamp': {
      b.add('paint', cbox(0.11, 0.1, 0.1, 0.02), OLIVE, at(0, 0.1, 0));
      b.add('hazard', cbox(0.115, 0.03, 0.105, 0.008), 0xffffff, at(0, 0.07, 0), { rep: 0.08 });
      b.add('metal', prism(0.04, 0.06, 8), DARK, at(0, 0.18, 0));
      for (const k of [-1, 1]) b.add('metal', bolt(0.01, 0.007), STEEL, at(k * 0.056, 0.11, 0, 0, 0, -k * Math.PI / 2));
      const ram = new FacetBuilder();
      ram.add('chrome', prism(0.018, 0.08, 8), 0xffffff, at(0, 0.0, 0));
      ram.add('metal', cbox(0.11, 0.028, 0.08, 0.008), DARK, at(0, 0.05, 0));
      ram.add('rubber', jitter(cbox(0.1, 0.014, 0.07, 0.004), 0.002, 7), 0x8a3020, at(0, 0.071, 0));
      const r = ram.build(mats);
      r.position.y = 0.21;
      parts.ram = r; g.add(r);
      len = 0.288; standoff = 0.0; glow = 0;
      break;
    }
    case 'clipper': {
      b.add('bakelite', hull([[-0.034, 0.05, -0.022], [0.034, 0.05, -0.022], [-0.034, 0.05, 0.022], [0.034, 0.05, 0.022], [-0.04, 0.16, -0.026], [0.04, 0.16, -0.026], [-0.04, 0.16, 0.026], [0.04, 0.16, 0.026], [-0.036, 0.22, -0.018], [0.036, 0.22, -0.018], [-0.036, 0.22, 0.02], [0.036, 0.22, 0.02]]), 0xffffff);
      b.add('chrome', cbox(0.07, 0.014, 0.04, 0.004), 0xffffff, at(0, 0.11, 0));
      b.add('lamp', gem(0.006, 5, 0.005), 0x40ff60, at(0.02, 0.15, 0.027, Math.PI / 2));
      b.add('metal', cbox(0.082, 0.012, 0.036, 0.003), STEEL, at(0, 0.226, 0));
      // the fixed comb
      for (let i = 0; i < 9; i++) b.add('chrome', cbox(0.005, 0.03, 0.01, 0.0015), 0xffffff, at(-0.036 + i * 0.009, 0.245, 0.01));
      const teeth = new FacetBuilder();
      for (let i = 0; i < 9; i++) teeth.add('chrome', cbox(0.005, 0.024, 0.008, 0.0015), 0xd8d8d8, at(-0.036 + i * 0.009, 0, 0));
      const t = teeth.build(mats);
      t.position.set(0, 0.24, -0.004);
      parts.teeth = t; g.add(t);
      len = 0.262; standoff = -0.004; glow = 0;
      break;
    }
    case 'spray': {
      // a paint canister on the side with a window, a gun body, the nozzle
      b.add('metal', prism(0.026, 0.12, 8), DARK, at(0, 0.1, 0));
      b.add('metal', lathe([[0, 0], [0.034, 0], [0.036, 0.01], [0.036, 0.1], [0.026, 0.12], [0, 0.122]], 8), STEEL, at(0.06, 0.06, 0));
      b.add('metal', tube([[0.06, 0.18, 0], [0.04, 0.2, 0], [0.012, 0.2, 0]], 0.008, 4, 5, false), DARK);
      b.add('copper', lathe([[0.02, 0], [0.018, 0.03], [0.008, 0.06], [0.005, 0.07]], 6), 0xffffff, at(0, 0.16, 0));
      b.add('metal', cbox(0.03, 0.018, 0.03, 0.005), DARK, at(0, 0.235, 0));
      const win = new THREE.Mesh(prism(0.0365, 0.07, 8), new THREE.MeshLambertMaterial({ color: 0xc08060, flatShading: true }));
      win.position.set(0.06, 0.115, 0);
      parts.paint = win; g.add(win);
      setColor = (c) => (win.material as THREE.MeshLambertMaterial).color.setHex(c);
      len = 0.245; standoff = 0.12; glow = 0;
      break;
    }
    case 'injector': {
      b.add('metal', prism(0.028, 0.05, 8), DARK, at(0, 0.075, 0));
      for (const k of [-1, 1]) b.add('chrome', cbox(0.07, 0.008, 0.012, 0.003), 0xffffff, at(0, 0.098 + k * 0.0, 0, 0, k > 0 ? 0 : Math.PI / 2));
      // the glass barrel (rings top and bottom), the serum inside, the plunger rod
      b.add('chrome', band(0.023, 0.023, 0.01, 0.006, 8), 0xffffff, at(0, 0.11, 0));
      b.add('chrome', band(0.023, 0.023, 0.01, 0.006, 8), 0xffffff, at(0, 0.24, 0));
      b.add('glass', prism(0.022, 0.13, 8), 0x9ab8c0, at(0, 0.175, 0));
      b.add('chrome', lathe([[0.02, 0], [0.012, 0.012], [0.004, 0.022], [0.003, 0.03]], 6), 0xffffff, at(0, 0.245, 0));
      b.add('chrome', prism(0.0025, 0.075, 4), 0xffffff, at(0, 0.31, 0));
      const serum = new THREE.Mesh(prism(0.018, 1, 8), new THREE.MeshBasicMaterial({ color: 0x40e070, toneMapped: false }));
      serum.position.set(0, 0.115, 0);
      serum.geometry.translate(0, 0.5, 0);
      serum.scale.set(1, 0.12, 1);
      parts.serum = serum; g.add(serum);
      const plunger = new FacetBuilder();
      plunger.add('chrome', prism(0.005, 0.12, 6), 0xffffff, at(0, -0.06, 0));
      plunger.add('rubber', prism(0.019, 0.012, 8), 0x404040, at(0, 0.0, 0));
      plunger.add('metal', cbox(0.04, 0.008, 0.012, 0.003), DARK, at(0, -0.12, 0));
      const pl = plunger.build(mats);
      pl.position.y = 0.235;
      parts.plunger = pl; g.add(pl);
      setColor = (c) => (serum.material as THREE.MeshBasicMaterial).color.setHex(c);
      len = 0.347; standoff = -0.012; glow = 0;
      break;
    }
    case 'clamp': {
      b.add('metal', lathe([[0, 0.05], [0.06, 0.05], [0.07, 0.09], [0.06, 0.12], [0, 0.125]], 8), DARK);
      b.add('chrome', cbox(0.24, 0.026, 0.05, 0.008), 0xffffff, at(0, 0.13, 0));
      b.add('metal', prism(0.008, 0.22, 6), STEEL, at(0, 0.145, 0.03, 0, 0, Math.PI / 2));
      for (const k of [-1, 1]) {
        const jaw = new FacetBuilder();
        jaw.add('paint', cbox(0.03, 0.15, 0.06, 0.008), OLIVE, at(0, 0.075, 0));
        jaw.add('rubber', jitter(cbox(0.014, 0.1, 0.07, 0.004), 0.002, 3 + k), 0x6a6a6a, at(-k * 0.02, 0.1, 0));
        jaw.add('metal', bolt(0.009, 0.006), STEEL, at(0, 0.03, 0.031, Math.PI / 2));
        const j = jaw.build(mats);
        j.position.set(k * 0.09, 0.13, 0);
        j.userData.k = k;
        parts[k < 0 ? 'jawL' : 'jawR'] = j; g.add(j);
      }
      len = 0.25; standoff = 0.0; glow = 0;
      break;
    }
    case 'welder': {
      b.add('paint', prism(0.04, 0.05, 8), OLIVE_D, at(0, 0.075, 0));
      b.add('metal', tube([[0, 0.09, 0], [0, 0.16, 0.0], [0.0, 0.22, 0.01], [0, 0.26, 0.0]], 0.014, 8, 6), DARK);
      b.add('copper', lathe([[0.02, 0], [0.018, 0.02], [0.01, 0.045], [0.007, 0.05]], 8), 0xffffff, at(0, 0.258, 0));
      b.add('rubber', tube([[-0.04, 0.07, 0.0], [-0.07, 0.12, -0.02], [-0.05, 0.18, -0.02], [-0.016, 0.21, 0.0]], 0.008, 6, 4), 0x8a8a8a);
      b.add('metal', cbox(0.03, 0.018, 0.02, 0.004), STEEL, at(0.03, 0.12, 0.0));
      // the flame: an additive faceted cone (blue core, white tip)
      const fg = lathe([[0.0, 0], [0.012, 0.004], [0.009, 0.03], [0.004, 0.05], [0, 0.056]], 6);
      const flame = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x80b0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      flame.position.y = 0.306; flame.visible = false;
      flame.name = 'flame'; parts.flame = flame; g.add(flame);
      len = 0.31; standoff = 0.03; glow = 0x9ac8ff;
      break;
    }
    case 'scanner': {
      b.add('paint', cbox(0.15, 0.09, 0.08, 0.016), 0xd8ccb0, at(0, 0.11, 0), { rep: 0.2 });
      b.add('metal', cbox(0.155, 0.02, 0.085, 0.005), DARK, at(0, 0.066, 0));
      b.add('metal', cbox(0.13, 0.03, 0.03, 0.006), DARK, at(0, 0.165, 0));
      b.add('lamp', cbox(0.11, 0.01, 0.012, 0.003), 0x6aff8a, at(0, 0.181, 0));
      for (const k of [-1, 1]) b.add('metal', bolt(0.008, 0.006), STEEL, at(k * 0.06, 0.11, 0.041, Math.PI / 2));
      b.add('lamp', gem(0.006, 5, 0.005), 0xffb43c, at(-0.05, 0.13, 0.041, Math.PI / 2));
      // the fan of light: a thin additive wedge opening along +Y
      const fan = new THREE.BufferGeometry();
      fan.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 1, 0, 0.5, 1, 0, 0, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
      const fm = new THREE.Mesh(fan, new THREE.MeshBasicMaterial({ color: 0x1a6a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      fm.position.y = 0.185; fm.visible = false; fm.frustumCulled = false;
      fm.name = 'fan'; parts.fan = fm; g.add(fm);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 1, 0, 0.5, 1, 0], 3));
      const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9affb0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      line.position.y = 0.185; line.visible = false; line.frustumCulled = false;
      line.name = 'line'; parts.line = line; g.add(line);
      len = 0.185; standoff = 0.32; glow = 0x5aff7a;
      break;
    }
  }
  const body = b.build(mats);
  g.add(body);
  g.traverse((o) => { o.castShadow = false; });
  return { kind, group: g, len, standoff, glow, parts, setColor };
}

/** animate a tool's moving parts. run 0..1 (motor), hit 0..1 (a strike in progress), t = clock */
export function animateTool(m: ToolModel, dt: number, t: number, run: number, hit: number, reach = 0.4) {
  const P = m.parts;
  switch (m.kind) {
    case 'saw': P.blade.rotation.z -= dt * (2 + run * 60); break;
    case 'clipper': P.teeth.position.x = run > 0.05 ? Math.sin(t * 90) * 0.004 * run : 0; break;
    case 'stamp': P.ram.position.y = 0.21 + hit * 0.075; break;
    case 'injector': {
      const k = Math.min(1, hit);
      P.plunger.position.y = 0.235 - (1 - k) * 0.11;
      P.serum.scale.y = Math.max(0.004, 0.124 * (1 - k * 0.92));
      break;
    }
    case 'clamp': {
      const open = 1 - Math.min(1, hit);
      P.jawL.position.x = -(0.035 + open * 0.06); P.jawR.position.x = 0.035 + open * 0.06;
      break;
    }
    case 'laser': {
      const beam = P.beam as THREE.LineSegments;
      beam.visible = run > 0.05;
      beam.scale.y = Math.max(0.01, reach);
      (beam.material as THREE.LineBasicMaterial).color.setRGB(2.4 * run * (0.8 + Math.random() * 0.4), 0.25 * run, 0.15 * run);
      break;
    }
    case 'welder': {
      const f = P.flame as THREE.Mesh;
      f.visible = run > 0.05;
      const s = run * (0.8 + Math.random() * 0.5);
      f.scale.set(1, s, 1);
      (f.material as THREE.MeshBasicMaterial).color.setRGB(0.6 + s * 0.6, 0.8 + s * 0.5, 1.6 + s * 0.6);
      break;
    }
    case 'scanner': {
      const fan = P.fan as THREE.Mesh, line = P.line as THREE.LineSegments;
      fan.visible = line.visible = run > 0.05;
      const w = 0.42;
      fan.scale.set(w * reach, reach, 1); line.scale.set(w * reach, reach, 1);
      const k = run * (0.85 + Math.sin(t * 31) * 0.15);
      (fan.material as THREE.MeshBasicMaterial).color.setRGB(0.025 * k, 0.15 * k, 0.05 * k);
      (line.material as THREE.LineBasicMaterial).color.setRGB(0.5 * k, 1.6 * k, 0.7 * k);
      break;
    }
  }
}

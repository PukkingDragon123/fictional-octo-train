// How an item looks up close (round 15): the shared pipeline every item model
// goes through for the hands, the pack and the inspect view.
//
//   bakeLook      tags each vertex with its surface (from the texture it was
//                 painted with: bare metal, painted metal, plastic, rubber,
//                 cloth, leather, paper, wood, glass, wet organic, dry organic,
//                 ceramic, rust) and bakes a contact occlusion where parts meet
//                 (a voxel sweep of the model's own surfaces)
//   itemCloseMat  a physically based material that reads the pixel atlas with
//                 crisp, anti-aliased texel edges and lays real-scale micro
//                 detail over it per surface: brushed streaks and scratches on
//                 metal, chipped paint showing steel, cloth weave, paper fibre,
//                 wood grain, leather pebbling, pores; grime, dried blood and
//                 wet sheen; a bump from all of it and the room's reflections.
//                 Wear follows the item's condition. Cached per wear bucket.
//   itemPois      the points of interest the inspect view marks on an item
import * as THREE from 'three';
import { atlas, type AtlasRect } from '../gfx/atlas';
import { U } from '../gfx/materials';
import { metalEnv } from '../craft/metal';
import { itemDef, freshness, type Item } from './item';
import { DETAIL } from './detailModels';

export const SURF_NAMES = ['matte', 'steel', 'painted steel', 'plastic', 'rubber', 'cloth', 'leather', 'paper', 'wood', 'glass', 'wet tissue', 'dry organic', 'ceramic', 'glow', 'rust'];

// first rule that matches the texture name wins
const RULES: [RegExp, number][] = [
  [/rust/, 14],
  [/porc|mug|dish_|soap|cameo|pearl/, 12],
  [/glass|lens|beaker|jar$|_jar|crystal|memshard|mirror|ec_pane|bld_gauge/, 9],
  [/keycard|card_lab|card_fac|id_badge|keeper|polaroid|remote|phone|calc|game_face|mp3|radio|cassette|floppy|data_drive|vhs|powerbank|timer_face|alarm|laptop|ec_poly|ec_tray|pcb|epipen|inhaler|pill|toothpaste|sunscreen|foam|riot|helmet|pg_|dino|cube_|crayons|boombox|camcorder|plastic|_cap$|^i_cap|screen|pbottle|lighter/, 3],
  [/soda|beer|energy|alu_top|gascan|extinguisher|spray|oilcan|ammo_box|^i_can_|tin_blue|thermos|cy_case|toolbox|carbatt/, 2],
  [/metal|steel|^i_tin|chrome|brass|copper|coil|spring|sheetmetal|band_|nails|screws|coin|pipe_end|silverware|pocketwatch|clasp|master_fuse|v_drive|filmcan|medals|trophy|sovereign|^key|_key$|iron|alu/, 1],
  [/leather|hide|strap|wallet|glove/, 6],
  [/cloth|knit|nylon|denim|fold_|rag|sheet_top|blanket|towel|cotton|gauze|canvas|sock|scarf|tarp|rope|net_bag|cushion|pillow|mask|fpack|issue|sack|velvet|felt|fur|fuzz|plush|feather|strings|spool|tote|tool_roll|griptape|tape_side|tape_roll|fabric|upholstery|curtain/, 5],
  [/rubber|grip|black|laces|striker|sneaker|slipon/, 4],
  [/page|paper|card|note|newspaper|cover|label|front|box|wrap|photo|map_|ticket|handbook|journal|notebook|sticky|matchbox|tp_|tissue|stamps|cash|needle_card|suture|breathing|cardboard/, 7],
  [/wood|log_end|plank|hv_board|waln|pencil|handle|lacquer|jbox|chalk|hgrip/, 8],
  [/meat|steak|fat|lean|blubber|jelly|slime|worm|organ|eye|fill_|residue|ec_milk|sfluid|royal|brood|comb|honey|egg|ink|possum|membrane|_sac|apple|tomato|orange|onion|banana|dreamfruit|flesh|gore/, 10],
  [/mushroom|morel|ec_ear|ec_hum|ec_puff|ec_moss|ec_tuber|ec_twist|mycelium|spore|petal|seed|lettuce|cabbage|carrot|potato|bread|cake|donut|pizza|biomass|sponge|bone|tooth|jaw|fs_|bt_|hv_|bristle|baleen|amber|rind|moss|leaf|grass/, 11],
];
const nameClass = new Map<string, number>();
function classOfName(n: string): number {
  let c = nameClass.get(n);
  if (c !== undefined) return c;
  c = -1;
  for (const [re, k] of RULES) if (re.test(n)) { c = k; break; }
  nameClass.set(n, c);
  return c;
}
/** the surface a part painted with no telling texture (plain white, tinted) most likely is */
function defaultClass(key: string): number {
  const d = itemDef(key), tags = d.tags || [];
  if (tags.includes('metal')) return 2;
  if (d.cat === 'weapon' || d.cat === 'tool') return 2;
  if (d.cat === 'food') return 11;
  if (d.cat === 'clothing' || d.bag) return 5;
  if (d.cat === 'literature') return 7;
  if (d.cat === 'medical' || d.cat === 'drink' || d.cat === 'electronics') return 3;
  return 0;
}

// atlas rect (u0, v0) -> texture name, rebuilt when the atlas grows
let rev: Map<number, string> | null = null; let revSize = -1;
const rk = (u: number, v: number) => Math.round(u * 8192) * 10007 + Math.round(v * 8192);
function texAt(u: number, v: number): string | undefined {
  const rects = (atlas() as unknown as { rects: Map<string, AtlasRect> }).rects;
  if (!rev || rects.size !== revSize) {
    rev = new Map(); revSize = rects.size;
    for (const [n, r] of rects) rev.set(rk(r.u0, r.v0), n);
  }
  return rev.get(rk(u, v));
}

/** tag a close-up item geometry with its surfaces (aSurf.x) and a baked contact occlusion (aSurf.y) */
export function bakeLook(g: THREE.BufferGeometry, key: string) {
  const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute, A = g.attributes.aAtlas as THREE.BufferAttribute;
  const n = P.count;
  const out = new Float32Array(n * 2);
  const def = defaultClass(key);
  const tally = new Float32Array(16);
  for (let i = 0; i < n; i++) {
    const nm = texAt(A.getX(i), A.getY(i));
    let c = nm ? classOfName(nm) : -1;
    if (c < 0) c = def;
    out[i * 2] = c; out[i * 2 + 1] = 1;
    tally[c]++;
  }
  let main = 0; for (let k = 1; k < 16; k++) if (tally[k] > tally[main]) main = k;
  g.userData.surfMain = main;
  // contact occlusion: mark the voxels the model's own surfaces pass through, then look out from each
  // vertex along its normal and a cone round it; where another part is close, it is in shadow
  const bb = g.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const L = Math.max(size.x, size.y, size.z, 0.01);
  const cell = L / 30;
  const nx = Math.ceil(size.x / cell) + 4, ny = Math.ceil(size.y / cell) + 4, nz = Math.ceil(size.z / cell) + 4;
  const occ = new Uint8Array(nx * ny * nz);
  const ox = bb.min.x - cell * 2, oy = bb.min.y - cell * 2, oz = bb.min.z - cell * 2;
  const idxOf = (x: number, y: number, z: number) => {
    const ix = Math.floor((x - ox) / cell), iy = Math.floor((y - oy) / cell), iz = Math.floor((z - oz) / cell);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
    return (iz * ny + iy) * nx + ix;
  };
  const I = g.index;
  const tri = I ? I.count / 3 : n / 3;
  const vi = (k: number) => (I ? I.getX(k) : k);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < tri; t++) {
    a.fromBufferAttribute(P, vi(t * 3)); b.fromBufferAttribute(P, vi(t * 3 + 1)); c.fromBufferAttribute(P, vi(t * 3 + 2));
    const steps = Math.min(40, Math.ceil(Math.max(a.distanceTo(b), a.distanceTo(c), b.distanceTo(c)) / (cell * 0.5)));
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
      const u = i / Math.max(1, steps), v = j / Math.max(1, steps);
      const k = idxOf(a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v);
      if (k >= 0) occ[k] = 1;
    }
  }
  const p = new THREE.Vector3(), nn = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3();
  const dists = [1.4, 2.4, 3.8];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(P, i); nn.fromBufferAttribute(N, i).normalize();
    t1.set(Math.abs(nn.y) < 0.9 ? 0 : 1, Math.abs(nn.y) < 0.9 ? 1 : 0, 0).cross(nn).normalize(); t2.crossVectors(nn, t1);
    let hit = 0, tot = 0;
    for (let s = 0; s < 5; s++) {
      d.copy(nn);
      if (s === 1) d.addScaledVector(t1, 0.95); else if (s === 2) d.addScaledVector(t1, -0.95); else if (s === 3) d.addScaledVector(t2, 0.95); else if (s === 4) d.addScaledVector(t2, -0.95);
      d.normalize();
      for (const r of dists) {
        q.copy(p).addScaledVector(nn, cell * 0.8).addScaledVector(d, r * cell);
        const k = idxOf(q.x, q.y, q.z);
        const w = 1 / r;
        tot += w;
        if (k >= 0 && occ[k]) { hit += w; break; }
      }
    }
    out[i * 2 + 1] = Math.max(0.4, 1 - 0.75 * (hit / Math.max(1e-6, tot)));
  }
  g.setAttribute('aSurf', new THREE.BufferAttribute(out, 2));
}

// ---------------------------------------------------------------- the material
const VERT_DECL = /* glsl */`
attribute vec4 aAtlas;
attribute vec4 aHd;
attribute vec2 aFx;
attribute vec2 aSurf;
varying vec4 vAtlas; varying vec4 vHd; varying vec3 vOP; varying vec3 vON; varying float vEm; varying vec2 vSurf;
`;
const VERT_MAIN = /* glsl */`
#include <begin_vertex>
vAtlas = aAtlas; vHd = aHd; vOP = position; vON = normal; vEm = aFx.x; vSurf = aSurf;
`;
const FRAG_DECL = /* glsl */`
varying vec4 vAtlas; varying vec4 vHd; varying vec3 vOP; varying vec3 vON; varying float vEm; varying vec2 vSurf;
uniform float uAtlasSize; uniform sampler2D uHdMap; uniform float uHdSize;
// x wear, y grime, z blood, w wet
uniform vec4 uLook;
float lpRough = 0.7; float lpMetal = 0.0; float lpBump = 0.0; float lpFw = 0.0;
float lpH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float lpN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lpH(i), lpH(i + vec2(1.0, 0.0)), f.x), mix(lpH(i + vec2(0.0, 1.0)), lpH(i + vec2(1.0, 1.0)), f.x), f.y); }
// a frequency (per metre) faded out before it would alias
float lpAA(float f) { return smoothstep(0.55, 0.18, f * lpFw); }
vec4 lpTex(sampler2D t, vec4 r, vec2 px, vec2 c) { c = mod(c, px); return textureLod(t, r.xy + vec2((c.x + 0.5) / px.x, 1.0 - (c.y + 0.5) / px.y) * r.zw, 0.0); }
// pixel art magnified: each texel stays a crisp square, its edges anti-aliased over one screen pixel
vec4 lpSharp(sampler2D t, vec4 r, vec2 px, vec2 uv, vec2 raw) {
  vec2 tuv = uv * px - 0.5; vec2 c = floor(tuv); vec2 f = tuv - c;
  vec2 w = max(fwidth(raw * px), vec2(1e-4));
  vec2 k = clamp((f - 0.5) / w + 0.5, 0.0, 1.0);
  return mix(mix(lpTex(t, r, px, c), lpTex(t, r, px, c + vec2(1.0, 0.0)), k.x), mix(lpTex(t, r, px, c + vec2(0.0, 1.0)), lpTex(t, r, px, c + vec2(1.0, 1.0)), k.x), k.y);
}
float lpScratch(vec2 p) {
  vec2 c = floor(p), f = fract(p) - 0.5; float a = lpH(c) * 6.2832; vec2 d = vec2(cos(a), sin(a));
  float l = abs(dot(f, vec2(-d.y, d.x))), al = abs(dot(f, d));
  return step(lpH(c + 7.1), 0.42) * (1.0 - smoothstep(0.0, 0.045, l)) * step(al, 0.15 + 0.35 * lpH(c + 3.3));
}
`;
const FRAG_MAP = /* glsl */`
vec2 lpPx = max(vAtlas.zw * uAtlasSize, vec2(1.0));
vec2 lpUv = fract(vMapUv);
vec4 lpCol = (vHd.w < 0.0 && vHd.z > 0.0)
  ? lpSharp(uHdMap, vec4(vHd.xy, vHd.z, -vHd.w), max(vec2(vHd.z, -vHd.w) * uHdSize, vec2(1.0)), lpUv, vMapUv)
  : lpSharp(map, vAtlas, lpPx, lpUv, vMapUv);
float lpS = floor(vSurf.x + 0.5);
vec3 lpAn = abs(vON);
vec2 lpP = lpAn.x > lpAn.y && lpAn.x > lpAn.z ? vOP.zy : (lpAn.y > lpAn.z ? vOP.xz : vOP.xy);
lpFw = max(length(fwidth(lpP)), 1e-6);
float lpF = mix(0.5, lpN(lpP * 900.0), lpAA(900.0)), lpM = mix(0.5, lpN(lpP * 220.0 + 3.7), lpAA(220.0)), lpB = lpN(lpP * 38.0 + 9.1) * 0.65 + lpN(lpP * 95.0) * 0.35;
vec3 lpC = lpCol.rgb;
float lpWear = uLook.x;
float lpSc = lpScratch(lpP * 70.0) * lpAA(1400.0) * (0.2 + lpWear);
lpRough = 0.7; lpMetal = 0.0; lpBump = (lpF - 0.5) * 0.12;
if (lpS == 1.0) {
  float br = mix(0.5, lpN(vec2(lpP.x * 2400.0, lpP.y * 60.0)), lpAA(2400.0));
  lpMetal = 1.0; lpRough = 0.28 + br * 0.14 + lpM * 0.1 + lpWear * 0.08; lpC *= 0.9 + br * 0.2; lpC += lpSc * 0.22; lpRough -= lpSc * 0.12;
  lpBump = (br - 0.5) * 0.25 - lpSc * 0.6;
} else if (lpS == 2.0) {
  float chip = smoothstep(0.66 - lpWear * 0.3, 0.72 - lpWear * 0.3, lpM * 0.55 + lpB * 0.45);
  lpRough = mix(0.4, 0.3, chip); lpMetal = mix(0.12, 1.0, max(chip, lpSc));
  lpC = mix(lpC, vec3(0.6, 0.62, 0.64), max(chip * 0.85, lpSc * 0.7));
  lpBump = -chip * 0.45 - lpSc * 0.5 + (lpF - 0.5) * 0.08;
} else if (lpS == 14.0) {
  lpRough = 0.86 + lpF * 0.1; lpMetal = 0.35; lpC *= 0.75 + lpM * 0.4; lpBump = (lpM - 0.5) * 0.9;
} else if (lpS == 3.0) {
  lpRough = 0.34 + lpM * 0.12 + lpWear * 0.18; lpC *= 0.97 + lpF * 0.06; lpBump = (lpF - 0.5) * 0.05 - lpSc * 0.3;
  lpC = mix(lpC, lpC * 1.15 + 0.04, lpSc * 0.6);
} else if (lpS == 4.0) {
  lpRough = 0.86 + lpF * 0.1; lpC *= 0.92 + lpF * 0.12; lpBump = (lpF - 0.5) * 0.35;
} else if (lpS == 5.0) {
  vec2 wv = lpP * 700.0;
  float wx = sin(wv.x * 3.1416) * 0.5 + 0.5, wy = sin(wv.y * 3.1416) * 0.5 + 0.5;
  float weave = mix(0.5, mod(floor(wv.x) + floor(wv.y), 2.0) < 1.0 ? wx : wy, lpAA(1400.0));
  lpRough = 0.96; lpC *= 0.84 + weave * 0.26 + (lpF - 0.5) * 0.1; lpBump = (weave - 0.5) * 0.6;
} else if (lpS == 6.0) {
  float gr = mix(0.5, lpN(lpP * 600.0), lpAA(600.0));
  lpRough = 0.52 + gr * 0.2 + lpWear * 0.1; lpC *= 0.88 + gr * 0.22; lpBump = (gr - 0.5) * 0.5;
} else if (lpS == 7.0) {
  float fb = mix(0.5, lpN(vec2(lpP.x * 1500.0, lpP.y * 420.0)), lpAA(1500.0));
  lpRough = 0.9; lpC *= 0.95 + fb * 0.09; lpBump = (fb - 0.5) * 0.16;
} else if (lpS == 8.0) {
  float gw = sin(lpP.y * 480.0 + lpM * 7.0 + lpB * 9.0) * 0.5 + 0.5; gw = mix(0.5, gw, lpAA(480.0));
  lpRough = 0.6 + gw * 0.16; lpC *= 0.84 + gw * 0.24; lpBump = (gw - 0.5) * 0.35;
} else if (lpS == 9.0) {
  lpRough = 0.04 + lpF * 0.04 + lpWear * 0.1; lpC *= 0.6; lpBump = -lpSc * 0.2;
} else if (lpS == 10.0) {
  float pr = smoothstep(0.55, 0.78, mix(0.5, lpN(lpP * 600.0), lpAA(600.0)));
  lpRough = 0.26 + lpM * 0.22; lpC *= 0.9 + lpM * 0.2 - pr * 0.14; lpBump = (lpM - 0.5) * 0.4 - pr * 0.45;
} else if (lpS == 11.0) {
  float pr = mix(0.5, lpN(lpP * 480.0), lpAA(480.0));
  lpRough = 0.72 + pr * 0.2; lpC *= 0.85 + pr * 0.25; lpBump = (pr - 0.5) * 0.6;
} else if (lpS == 12.0) {
  lpRough = 0.18 + lpM * 0.1; lpC *= 0.98 + lpF * 0.04; lpBump = (lpF - 0.5) * 0.04 - lpSc * 0.2;
} else {
  lpRough = 0.66 + lpM * 0.12; lpC *= 0.94 + lpF * 0.1; lpBump = (lpF - 0.5) * 0.12;
}
// handling grime in blotches, dried blood, wet sheen, and the contact shadow where parts meet
float lpG = smoothstep(0.45, 0.88, lpB) * uLook.y;
lpC *= 1.0 - lpG * 0.32; lpRough = mix(lpRough, 0.9, lpG * 0.5);
float lpBl = smoothstep(0.56, 0.8, lpN(lpP * 55.0 + 17.0)) * uLook.z;
lpC = mix(lpC, vec3(0.2, 0.025, 0.018), lpBl * 0.8); lpRough = mix(lpRough, 0.3, lpBl);
lpRough = mix(lpRough, 0.1, uLook.w * 0.7);
lpC *= vSurf.y;
diffuseColor *= vec4(lpC, lpCol.a);
`;
const FRAG_BUMP = /* glsl */`
#include <normal_fragment_maps>
{
  vec3 lpSx = normalize(dFdx(-vViewPosition)), lpSy = normalize(dFdy(-vViewPosition));
  vec2 lpD = vec2(dFdx(lpBump), dFdy(lpBump)) * 0.55;
  vec3 lpR1 = cross(lpSy, normal), lpR2 = cross(normal, lpSx);
  float lpDet = dot(lpSx, lpR1) * faceDirection;
  vec3 lpGrad = sign(lpDet) * (lpD.x * lpR1 + lpD.y * lpR2);
  normal = normalize(abs(lpDet) * normal - lpGrad);
}
`;

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** wear 0..1 (0 = new), grime 0..1, blood 0..1, wet 0..1 */
function closeMat(wear: number, grime: number, blood: number, wet: number): THREE.MeshStandardMaterial {
  const q = (v: number, n: number) => Math.round(Math.max(0, Math.min(1, v)) * n) / n;
  const look = new THREE.Vector4(q(wear, 4), q(grime, 2), q(blood, 2), q(wet, 1));
  const key = look.toArray().join(',');
  const hit = mats.get(key);
  if (hit) return hit;
  const A = atlas();
  const m = new THREE.MeshStandardMaterial({ map: A.texture, vertexColors: true, roughness: 0.7, metalness: 0, envMap: metalEnv(), envMapIntensity: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAtlasSize = U.uAtlasSize;
    sh.uniforms.uHdMap = { value: A.hdEnabled ? A.hdTexture : A.texture };
    sh.uniforms.uHdSize = { value: A.hdSize };
    sh.uniforms.uLook = { value: look };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL).replace('#include <begin_vertex>', VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(lpRough, 0.035, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = lpMetal;')
      .replace('#include <normal_fragment_maps>', FRAG_BUMP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEm * 1.15;');
  };
  m.customProgramCacheKey = () => 'lp-item-close-1';
  mats.set(key, m);
  return m;
}

/** the close-up material for an item (or its kind, when there is no particular one) */
export function itemCloseMat(it?: Item | null, key?: string): THREE.MeshStandardMaterial {
  if (!it) return closeMat(0.3, 0.5, 0, 0);
  const d = itemDef(it.key);
  const worn = d.durability || d.weapon ? 1 - it.cond : 0.25 + (1 - it.cond) * 0.5;
  void key;
  return closeMat(worn, 0.35 + worn * 0.6, Math.min(1, it.bloody ?? 0), Math.min(1, it.wet ?? 0));
}

// ---------------------------------------------------------------- points of interest
export interface PoiAt { at: THREE.Vector3; label: string; note: string }
const HANDLING: Record<number, string> = {
  1: 'Bare steel, scuffed where hands have been.', 2: 'Painted steel; the paint is wearing through at the edges.', 3: 'Moulded plastic, a little greasy from handling.',
  4: 'Rubber, gone slightly tacky.', 5: 'Woven fibre. It smells of the place.', 6: 'Leather, creased and dark with handling.', 7: 'Paper and card, soft at the corners.',
  8: 'Wood, the grain raised by damp.', 9: 'Glass. Cold, smudged with prints.', 10: 'Soft and wet to the touch.', 11: 'Dry and organic. It flakes.', 12: 'Glazed. One hairline crack.', 14: 'Rusted through in places.', 0: 'Ordinary. Too ordinary for here.',
};
/** what the inspect view marks on an item (model space of its geometry) */
export function itemPois(it: Item, g: THREE.BufferGeometry | null): PoiAt[] {
  const d = itemDef(it.key), det = DETAIL[it.key];
  const out: PoiAt[] = [];
  if (det?.poi) for (const p of det.poi) out.push({ at: new THREE.Vector3(...p.at), label: p.label, note: typeof p.note === 'function' ? p.note(it) : p.note });
  if (out.length >= 2 || !g) return out.slice(0, 4);
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox!, c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
  const long = s.x >= s.y && s.x >= s.z ? 'x' : s.z >= s.y ? 'z' : 'y';
  const end = c.clone(); end[long] = bb.max[long] - s[long] * 0.08;
  const top = c.clone(); top.y = bb.max.y;
  const near = c.clone(); near[long] = bb.min[long] + s[long] * 0.12;
  const has = (l: string) => out.some((p) => p.label === l);
  if ((d.durability || d.weapon) && !has('WEAR')) {
    const k = it.cond;
    out.push({ at: end, label: 'WEAR', note: 'Condition ' + Math.round(k * 100) + '%. ' + (k > 0.8 ? 'Barely used.' : k > 0.5 ? 'Scuffed and knocked about, sound.' : k > 0.25 ? 'Tired. It will not take much more.' : 'Falling apart in your hands.') });
  }
  if (d.food && !has('FRESHNESS')) {
    const f = freshness(it);
    out.push({ at: top, label: 'FRESHNESS', note: f === 'rotten' ? 'Rotten. Soft, sweet-smelling, wrong.' : f === 'stale' ? 'Stale but edible. Probably.' : f === 'fresh' ? 'Fresh. Eat it before this place changes its mind.' : (it.cooked ?? 0) >= 1 ? 'Cooked through.' : 'Sealed and shelf-stable.' });
  }
  if ((it.fluid || d.fluidCap) && !has('CONTENTS')) out.push({ at: c.clone(), label: 'CONTENTS', note: it.fluid ? it.fluid.amount.toFixed(2) + ' L of ' + it.fluid.type + '.' : 'Empty.' });
  if ((it.bloody ?? 0) > 0.05 || (it.wet ?? 0) > 0.05) out.push({ at: near, label: 'STAINS', note: (it.bloody ?? 0) > 0.05 ? 'Dried blood in the seams. Not all of it yours.' : 'Damp through. It will dry, slowly.' });
  if (out.length < 2) out.push({ at: near.clone().lerp(top, 0.5), label: 'MATERIAL', note: HANDLING[(g.userData.surfMain as number) ?? 0] ?? HANDLING[0] });
  return out.slice(0, 4);
}

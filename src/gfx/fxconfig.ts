// Render-quality presets and per-zone atmosphere for the realism passes in
// src/gfx/postfx.ts. Everything runs at the low internal resolution, so the
// image stays pixel art: the final ordered dither quantises AO, haze, bloom
// and reflections into the same chunky palette as the textures.

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityLevel;

export interface FxQuality {
  /** screen-space ambient occlusion: samples (0 = off), computed at half resolution */
  ao: number;
  aoHalf: boolean;
  /** soft blob contact shadows under survivors and creatures */
  blobs: number;
  /** bloom mip levels (0 = off) */
  bloom: number;
  /** volumetric light march steps (0 = off), half resolution */
  vol: number;
  /** flashlight cones and sun shafts test the shadow maps */
  volShadows: boolean;
  /** dust motes drifting in light beams */
  motes: boolean;
  /** screen-space reflection steps on wet / glossy floors (0 = sheen only) */
  ssr: number;
  /** exponential ground mist layer */
  mist: boolean;
  /** lens dirt lit by bloom */
  dirt: boolean;
  /** outdoors: warm sunlit / cool shaded split (one shadow-map lookup per pixel) */
  split: boolean;
}

export const QUALITY: Record<QualityLevel, FxQuality> = {
  low: { ao: 0, aoHalf: true, blobs: 6, bloom: 0, vol: 0, volShadows: false, motes: false, ssr: 0, mist: true, dirt: false, split: false },
  medium: { ao: 6, aoHalf: true, blobs: 10, bloom: 2, vol: 8, volShadows: false, motes: true, ssr: 10, mist: true, dirt: true, split: true },
  high: { ao: 12, aoHalf: true, blobs: 16, bloom: 3, vol: 14, volShadows: true, motes: true, ssr: 14, mist: true, dirt: true, split: true },
};

/** best first guess for this device: phones start low, tablets medium, desktops high */
export function detectQuality(): QualityLevel {
  let coarse = false, small = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* ignore */ }
  const sw = Math.min(screen.width || innerWidth, screen.height || innerHeight);
  small = sw < 600;
  if (coarse && small) return 'low';
  if (coarse) return 'medium';
  const mem = (navigator as any).deviceMemory as number | undefined;
  const cores = navigator.hardwareConcurrency || 4;
  if ((mem && mem <= 4) || cores <= 2) return 'medium';
  return 'high';
}

/** atmosphere knobs per zone grade key (see GRADES in src/game/game.ts) */
export interface ZoneFx {
  /** volumetric haze: tint applied to the light it scatters, density per metre, height falloff, top of the volume above the floor */
  haze: [number, number, number];
  hazeDens: number;
  hazeFall: number;
  volTop: number;
  /** how strongly the zone's fixtures (light grid) feed the haze, and the flashlight cone */
  gridMul: number;
  spotMul: number;
  /** sun shafts strength outdoors */
  sunShafts: number;
  /** ground mist: colour, density, height falloff (1/m), how much nearby light brightens it, max cover */
  mist: [number, number, number];
  mistDens: number;
  mistFall: number;
  mistLit: number;
  mistMax: number;
  /** bloom strength and threshold (linear HDR) */
  bloom: number;
  bloomTh: number;
  /** AO strength */
  ao: number;
  /** reflection strength on wet / glossy floors and the floor shader's fixture sheen */
  reflect: number;
  sheen: number;
  /** pool caustics */
  caustics: number;
  /** fluorescent sickness: olive cast in the shadows and the faint tube flutter */
  sick: number;
  /** motes density in light beams */
  motes: number;
  /** lens dirt */
  dirt: number;
}

export const DEFAULT_ZONEFX: ZoneFx = {
  haze: [1, 1, 1], hazeDens: 0.014, hazeFall: 0.25, volTop: 2.8, gridMul: 1, spotMul: 1, sunShafts: 0,
  mist: [0.5, 0.5, 0.5], mistDens: 0.0, mistFall: 1.4, mistLit: 0.6, mistMax: 0.3,
  bloom: 0.55, bloomTh: 0.85, ao: 0.95, reflect: 0.45, sheen: 0.5, caustics: 0, sick: 0, motes: 0.6, dirt: 0.5,
};

export const ZONEFX: Record<string, Partial<ZoneFx>> = {
  // the yellow rooms: buzzing tubes, damp air, a sickly olive cast in the shade
  lobby: { haze: [1.0, 0.94, 0.62], hazeDens: 0.011, hazeFall: 0.05, gridMul: 1.0, mist: [0.42, 0.38, 0.2], mistDens: 0.02, mistFall: 1.4, mistLit: 0.8, mistMax: 0.14, bloom: 0.7, bloomTh: 0.75, ao: 1.0, sick: 1, motes: 0.8 },
  // humid tiled halls: blue haze, caustic webs, strong reflections
  pool: { haze: [0.78, 0.95, 1.05], hazeDens: 0.012, hazeFall: 0.12, volTop: 3.5, gridMul: 0.8, mist: [0.62, 0.78, 0.84], mistDens: 0.03, mistFall: 0.9, mistLit: 0.6, mistMax: 0.2, bloom: 0.7, bloomTh: 0.9, reflect: 1.0, sheen: 0.8, caustics: 0.85, motes: 0.5, ao: 1.0 },
  // sodium haze hanging under the slabs
  parking: { haze: [1.15, 0.72, 0.32], hazeDens: 0.024, hazeFall: 0.05, volTop: 3.2, gridMul: 1.1, mist: [0.36, 0.22, 0.09], mistDens: 0.07, mistFall: 0.6, mistLit: 1.0, mistMax: 0.3, bloom: 0.95, bloomTh: 0.65, reflect: 0.7, sheen: 0.8, motes: 0.9, dirt: 0.8, ao: 1.0 },
  // late afternoon: warm shafts, pollen, a soft lilac ground haze
  fields: { haze: [1.1, 0.95, 0.78], hazeDens: 0.006, hazeFall: 0.15, volTop: 6, gridMul: 0.6, sunShafts: 1, mist: [0.86, 0.8, 0.9], mistDens: 0.03, mistFall: 1.0, mistLit: 0.2, mistMax: 0.16, bloom: 0.6, bloomTh: 0.9, ao: 0.7, motes: 1.2, dirt: 0.7 },
  suburbs: { haze: [1.05, 0.98, 0.9], hazeDens: 0.006, volTop: 6, gridMul: 0.6, sunShafts: 0.8, mist: [0.7, 0.72, 0.8], mistDens: 0.025, mistFall: 0.8, mistLit: 0.2, bloom: 0.55, ao: 0.75 },
  office: { haze: [0.92, 0.98, 1.0], hazeDens: 0.012, gridMul: 0.9, mist: [0.3, 0.33, 0.35], mistDens: 0.03, bloom: 0.55, sheen: 0.4, motes: 0.7 },
  // cold concrete, steam pooling at ankle height
  tunnels: { haze: [0.85, 0.92, 0.95], hazeDens: 0.022, hazeFall: 0.3, volTop: 3.0, gridMul: 1.1, mist: [0.3, 0.32, 0.33], mistDens: 0.07, mistFall: 1.8, mistLit: 0.7, mistMax: 0.24, bloom: 0.8, bloomTh: 0.7, reflect: 0.7, sheen: 0.7, motes: 1.0, dirt: 0.8, ao: 1.0 },
  mall: { haze: [1.0, 0.97, 1.0], hazeDens: 0.012, volTop: 5, gridMul: 0.9, mist: [0.5, 0.48, 0.52], mistDens: 0.02, bloom: 0.6, reflect: 0.6, sheen: 0.7 },
  market: { hazeDens: 0.01, mist: [0.4, 0.42, 0.42], mistDens: 0.02, bloom: 0.55, reflect: 0.5, sheen: 0.6 },
  school: { haze: [1.0, 0.96, 0.88], hazeDens: 0.012, mist: [0.4, 0.38, 0.33], mistDens: 0.02, sheen: 0.6, motes: 0.9 },
  hospital: { haze: [0.9, 1.0, 0.96], hazeDens: 0.014, mist: [0.36, 0.42, 0.4], mistDens: 0.03, bloom: 0.6, reflect: 0.55, sheen: 0.7, sick: 0.35 },
  lab: { haze: [0.85, 0.95, 1.05], hazeDens: 0.012, mist: [0.3, 0.36, 0.42], mistDens: 0.02, bloom: 0.7, reflect: 0.6, sheen: 0.7 },
  server: { haze: [0.7, 0.85, 1.1], hazeDens: 0.02, gridMul: 1.2, mist: [0.12, 0.18, 0.3], mistDens: 0.06, mistLit: 1.2, bloom: 1.0, bloomTh: 0.6, reflect: 0.6, sheen: 0.7, motes: 0.4 },
  stairwell: { hazeDens: 0.02, mist: [0.25, 0.25, 0.25], mistDens: 0.05, bloom: 0.6 },
  corrupt: { haze: [1.05, 0.8, 1.1], hazeDens: 0.02, mist: [0.3, 0.12, 0.35], mistDens: 0.06, mistLit: 1.0, bloom: 1.0, bloomTh: 0.6 },
  exit: { haze: [1, 1, 1], hazeDens: 0.03, mist: [0.9, 0.9, 0.92], mistDens: 0.12, mistMax: 0.5, bloom: 1.1, bloomTh: 0.6 },
  void: { hazeDens: 0.01, mistDens: 0.0, bloom: 0.5 },
  house: { haze: [1.05, 0.95, 0.82], hazeDens: 0.014, mist: [0.35, 0.3, 0.24], mistDens: 0.02, bloom: 0.6, sheen: 0.45, motes: 1.0 },
};

export function zoneFx(grade: string): ZoneFx {
  return { ...DEFAULT_ZONEFX, ...(ZONEFX[grade] || {}) } as ZoneFx;
}

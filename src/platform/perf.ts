// Graphics presets and the first-launch performance check. The first time the game starts on a machine
// it reads the GPU's name, counts cores and memory and times a couple of seconds of frames, then picks a
// preset (Settings > Display shows it lit; "detect" there runs the check again). Nothing leaves the machine.
import { gfxSettings, saveGfx, type GfxSettings } from '../ui/menus/common';
import { setFpsCap } from '../gfx/frameCap';

export type Preset = 'low' | 'medium' | 'high' | 'ultra';
export const PRESETS: Record<Preset, Partial<GfxSettings>> = {
  low: { quality: 'low', pixelHeight: 360, motionBlur: 'off', grain: 0.5, renderScale: 0.75 },
  medium: { quality: 'medium', pixelHeight: 420, motionBlur: 'low', grain: 1, renderScale: 1 },
  high: { quality: 'high', pixelHeight: 450, motionBlur: 'normal', grain: 1, renderScale: 1 },
  ultra: { quality: 'high', pixelHeight: 540, motionBlur: 'normal', grain: 1, renderScale: 1 },
};
/** the preset the current settings match ('' = custom) */
export function currentPreset(s = gfxSettings()): Preset | '' {
  for (const [k, p] of Object.entries(PRESETS) as [Preset, Partial<GfxSettings>][]) {
    if (Object.entries(p).every(([f, v]) => (s as unknown as Record<string, unknown>)[f] === v || (f === 'renderScale' && v === 1 && (s.renderScale ?? 1) === 1))) return k;
  }
  return '';
}
export function applyPreset(p: Preset) {
  const s = { ...gfxSettings(), ...PRESETS[p] };
  saveGfx(s);
  setFpsCap(s.fpsCap ?? 0);
}

function gpuName(): string {
  try {
    const cv = document.createElement('canvas');
    const gl = (cv.getContext('webgl2') || cv.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch { return 'unknown'; }
}
function frameMs(ms = 1800): Promise<number> {
  return new Promise((res) => {
    const t: number[] = []; let last = 0; const end = performance.now() + ms;
    const tick = (now: number) => {
      if (last) t.push(now - last);
      last = now;
      if (now < end && document.visibilityState === 'visible') requestAnimationFrame(tick);
      else { t.sort((a, b) => a - b); res(t.length > 8 ? t[Math.floor(t.length * 0.75)] : 16.7); }
    };
    requestAnimationFrame(tick);
  });
}

export interface PerfResult { preset: Preset; gpu: string; ms: number; cores: number; at: number }
/** read the machine and pick a preset (and apply it) */
export async function detectPerformance(apply = true): Promise<PerfResult> {
  const gpu = gpuName();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const ms = await frameMs();
  let score = 3; // 0 low .. 3 ultra
  if (/swiftshader|llvmpipe|softpipe|software|basic render|none/i.test(gpu)) score = 0;
  else if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|vivante|videocore/i.test(gpu)) score = 1;
  else if (/gtx 9|gtx 10|rx 5[0-9]0\b|mx\d{3}|radeon\(tm\) graphics|vega [0-9]/i.test(gpu)) score = 2;
  if (cores <= 4) score -= 1;
  if (mem <= 4) score -= 1;
  if (ms > 30) score -= 2; else if (ms > 20) score -= 1;
  const preset: Preset = (['low', 'medium', 'high', 'ultra'] as Preset[])[Math.max(0, Math.min(3, score))];
  const r: PerfResult = { preset, gpu, ms: Math.round(ms * 10) / 10, cores, at: Date.now() };
  try { localStorage.setItem('noclip.perf', JSON.stringify(r)); } catch { /* storage blocked */ }
  if (apply) applyPreset(preset);
  return r;
}
export function lastPerf(): PerfResult | null { try { return JSON.parse(localStorage.getItem('noclip.perf') || 'null'); } catch { return null; } }

/** first launch only (no saved picture settings and no check on file): wait for the first screen, then check */
export function firstLaunchPerf() {
  try { if (localStorage.getItem('noclip.perf') || localStorage.getItem('noclip.gfx')) return; } catch { return; }
  const params = new URLSearchParams(location.search);
  if (params.has('quick') || params.has('gallery') || params.has('sandbox') || navigator.webdriver) return;
  setTimeout(() => { void detectPerformance(true).catch(() => undefined); }, 4500);
}

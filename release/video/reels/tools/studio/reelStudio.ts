// Reel studio (capture only): a real level generated and drawn by the game's own
// renderer (zone renderer, light grid, grade, outlines), seen through a free
// perspective film camera, with actors posed by the species' stand-alone posing
// APIs and HumanRig people (Dr. Calder, the unit). Time only moves when the
// capture harness asks for a frame, so every frame is deterministic.
//   reel.html?zone=ledge&seed=1337      window.__studio
import '/src/ui/fonts.css';
import * as THREE from 'three';
import { registerContent } from '/src/content/index';
import '/src/world/zones';
import { PixelRenderer } from '/src/gfx/renderer';
import { atlas } from '/src/gfx/atlas';
import { U } from '/src/gfx/materials';
import { DEFAULT_GRADE } from '/src/gfx/renderer';
import { GRADES } from '/src/game/game';
import { generateZone } from '/src/world/worldGraph';
import { ZoneRenderer } from '/src/world/zoneRenderer';
import { LightGrid } from '/src/world/lighting';
import { setGame } from '/src/game/G';
import type { Zone } from '/src/world/zone';

registerContent();

export interface Studio {
  pr: PixelRenderer; zone: Zone; zr: ZoneRenderer; lg: LightGrid; cam: THREE.PerspectiveCamera; scene: THREE.Scene;
  t: number; focus: THREE.Vector3;
  /** per-frame hooks (actors) */
  hooks: ((t: number, dt: number) => void)[];
  frame(dt: number, render?: boolean): void;
  grab(q?: number): string;
  ground(x: number, z: number): number;
}

export function makeStudio(zoneKey: string, seed: number): Studio {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const pr = new PixelRenderer(canvas);
  atlas().flush();
  const zone = generateZone(zoneKey, seed);
  const zr = new ZoneRenderer(zone);
  pr.scene.add(zr.root);
  const lg = new LightGrid(zone);
  const e = zone.env;
  const amb = new THREE.AmbientLight(e.ambient, e.ambientI * Math.PI);
  pr.scene.add(amb);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0); pr.scene.add(hemi);
  U.uFogColor.value.set(e.fog); U.uFogNear.value = e.fogNear; U.uFogFar.value = e.fogFar;
  U.uVoidColor.value.set(e.void);
  pr.scene.background = new THREE.Color(e.void);
  const g = { ...DEFAULT_GRADE, ...((GRADES as Record<string, object>)[e.grade] || {}) };
  pr.gradeTarget = JSON.parse(JSON.stringify(g)); pr.grade = JSON.parse(JSON.stringify(g));
  pr.setZoneFx(e.grade, true);
  U.uVisOn.value = 0; U.uCutOn.value = 0;
  const cam = new THREE.PerspectiveCamera(40, 9 / 16, 0.05, 60);
  cam.layers.enable(1);
  pr.eyeCamera = cam; pr.eyeFov = 40; pr.eyeHide = [];
  const pool: THREE.PointLight[] = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffffff, 0, 6, 1.6); pr.scene.add(l); return l; });
  pr.pinLights.push(...pool);
  let pn = 0;
  const fake: Record<string, unknown> = {
    zones: new Map([[zone.key, zone]]), players: new Map(), creatures: { creatures: new Map() }, time: 0, local: null, pr, dt: 1 / 30,
    getZone: (k: string) => (fake.zones as Map<string, Zone>).get(k), get zone() { return zone; }, systems: [], clock: { hours: 12, dayFrac: 0.5, startDay: 1 },
    pointLight: (x: number, y: number, zz: number, color: number, intensity: number, dist = 7) => { const l = pool[pn++]; if (!l) return; l.position.set(x, y, zz); l.color.setHex(color); l.intensity = intensity; l.distance = dist; },
    addSystem: () => {}, audio: null,
  };
  setGame(fake as never);
  const S: Studio = {
    pr, zone, zr, lg, cam, scene: pr.scene, t: 0, focus: new THREE.Vector3(zone.W / 2, 0, zone.H / 2), hooks: [],
    ground: (x, z) => { try { return Number(zone.heightAt(Math.floor(x), Math.floor(z))) || 0; } catch { return 0; } },
    frame(dt, render = true) {
      S.t += dt; fake.time = S.t; fake.dt = dt;
      U.uTime.value = S.t;
      for (const l of pool) l.intensity = 0;
      pn = 0;
      for (const h of S.hooks) h(S.t, dt);
      if (!render) return;
      pr.target.copy(S.focus);
      pr.updateCamera(dt);
      pr.updatePlayerView(S.focus);
      lg.update(dt, S.focus.x, S.focus.z, S.t);
      zr.update(S.focus.x, S.focus.z, 30, dt);
      pr.render(dt);
    },
    grab(q = 0.92) { return canvas.toDataURL('image/jpeg', q); },
  };
  (window as unknown as { __studio: Studio }).__studio = S;
  return S;
}

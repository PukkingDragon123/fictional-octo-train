import * as THREE from 'three';
import type { Game } from '../game/game';
import { bus } from '../core/events';
import { damp } from '../core/math';
import { U } from './materials';
import { WetMap } from './wetmap';

/**
 * Feeds the realism passes from the game world each frame: soft contact
 * shadows under survivors and creatures, the wet / gloss map of the zone,
 * rain wetness outdoors, the flashlight and sun the haze follows, and the
 * reduce-flashing preference. Purely visual and local.
 */
export class SceneFx {
  readonly wet = new WetMap();
  private g: Game;
  private calmT = 0;
  private cand: { x: number; y: number; z: number; r: number; d: number }[] = [];
  private warm = new THREE.Color(0xffa860);

  constructor(g: Game) {
    this.g = g;
    bus.on('zoneView', (z: any) => this.wet.attach(z));
    bus.on('floorChanged', (z: any) => { if (z === this.wet.zone) this.wet.invalidate(); });
  }

  update(dt: number) {
    const g = this.g, pr = g.pr, v = g.view, p = g.local;
    if (!v || !p) return;
    pr.spot = g.flashlights[0] ?? null;
    pr.sun = g.sun;
    this.wet.update(dt);
    // rain soaks outdoor ground slowly and dries slower
    const raining = v.zone.env.weather === 'rain';
    U.uWetness.value = damp(U.uWetness.value, raining ? 0.85 : 0, raining ? 0.08 : 0.03, dt);
    // low afternoon / evening sun turns golden (visual only: light levels use the intensity)
    if (v.zone.env.sky && g.sun.intensity > 0) {
      const k = Math.min(1, Math.max(0, (42 - g.sun.position.y) / 30));
      g.sun.color.set(v.zone.env.sun).lerp(this.warm, k * 0.55);
    }
    this.calmT -= dt;
    if (this.calmT <= 0) { this.calmT = 1; pr.calm = document.documentElement.classList.contains('reduce-flash'); }
    // contact shadow blobs, nearest to the view first
    const c = this.cand; c.length = 0;
    const fx = pr.target.x, fz = pr.target.z;
    const R = (pr.lowW * pr.pxSize) * 0.6 + 3;
    for (const pl of g.players.values()) {
      if (pl.zoneKey !== p.zoneKey || pl.inVehicle || !pl.rig.root.visible) continue;
      const lying = (pl as any).full === 'lie' || pl.body.downed || pl.body.dead;
      c.push({ x: pl.x, y: pl.y - (pl.stance === 'swim' ? 0 : 0), z: pl.z, r: lying ? 0.62 : 0.34, d: Math.abs(pl.x - fx) + Math.abs(pl.z - fz) });
    }
    const cs = g.creatures?.creatures as Map<string, any> | undefined;
    if (cs) for (const cr of cs.values()) {
      if (cr.dead || cr.zoneKey !== p.zoneKey || !cr.visibleToLocal) continue;
      const d = Math.abs(cr.x - fx) + Math.abs(cr.z - fz);
      if (d > R * 1.5) continue;
      c.push({ x: cr.x, y: cr.y ?? 0, z: cr.z, r: Math.max(0.2, (cr.radius ?? 0.4) * 1.05), d });
    }
    c.sort((a, b) => a.d - b.d);
    const fxp = pr.postfx;
    const n = Math.min(c.length, fxp.blobs.length);
    for (let i = 0; i < n; i++) { const b = c[i]; fxp.blobs[i].set(b.x, b.y, b.z, b.r); }
    fxp.blobN = n;
  }
}

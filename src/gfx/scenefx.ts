import * as THREE from 'three';
import type { Game } from '../game/game';
import { bus } from '../core/events';
import { damp } from '../core/math';
import { U } from './materials';
import { WetMap } from './wetmap';
import { GLOWU, GLOW_MAX } from './postfx';

const byD = (a: { d: number }, b: { d: number }) => a.d - b.d;

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
  private cand: { x: number; y: number; z: number; r: number; h: number; d: number }[] = [];
  private warm = new THREE.Color(0xffa860);
  private glowPos = new Float32Array(GLOW_MAX * 4);
  private shBuf = new Float32Array(12);
  private glowCol = new Float32Array(GLOW_MAX * 4);

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
    // the torch and point-light pools always count as lights (no shader rebuild when one switches on)
    if (pr.pinLights.length !== g.flashlights.length + g.points.length) pr.pinLights = [...g.flashlights, ...g.points];
    this.wet.update(dt);
    // the fixtures nearest the view glow in the haze and shine on glossy suits (at their current level: dying
    // tubes stutter in the air too)
    {
      // (always the full list: glossy suits mirror the tubes on every preset; the haze reads only q.glow of them)
      const n = v.lg.nearestLights(pr.target.x, pr.target.z, GLOW_MAX, this.glowPos, this.glowCol);
      const P = GLOWU.uGlowPos.value, C = GLOWU.uGlowCol.value, gp = this.glowPos, gc = this.glowCol;
      for (let i = 0; i < n; i++) { P[i].set(gp[i * 4], gp[i * 4 + 1], gp[i * 4 + 2], gp[i * 4 + 3]); C[i].set(gc[i * 4], gc[i * 4 + 1], gc[i * 4 + 2], gc[i * 4 + 3]); }
      GLOWU.uGlowN.value = n;
    }
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
    const pool = this.cand; let n0 = 0;
    const put = (x: number, y: number, z: number, r: number, h: number, d: number) => {
      let o = pool[n0]; if (!o) { o = { x: 0, y: 0, z: 0, r: 0, h: 0, d: 0 }; pool[n0] = o; }
      o.x = x; o.y = y; o.z = z; o.r = r; o.h = h; o.d = d; n0++;
    };
    const fx = pr.target.x, fz = pr.target.z;
    const R = (pr.lowW * pr.pxSize) * 0.6 + 3;
    for (const pl of g.players.values()) {
      if (pl.zoneKey !== p.zoneKey || pl.inVehicle || !pl.rig.root.visible) continue;
      const lying = (pl as any).full === 'lie' || pl.body.downed || pl.body.dead;
      put(pl.x, pl.y, pl.z, lying ? 0.62 : 0.34, lying ? 0.6 : 1.95, Math.abs(pl.x - fx) + Math.abs(pl.z - fz));
    }
    const cs = g.creatures?.creatures as Map<string, any> | undefined;
    if (cs) for (const cr of cs.values()) {
      if (cr.dead || cr.zoneKey !== p.zoneKey || !cr.visibleToLocal) continue;
      const d = Math.abs(cr.x - fx) + Math.abs(cr.z - fz);
      if (d > R * 1.5) continue;
      put(cr.x, cr.y ?? 0, cr.z, Math.max(0.2, (cr.radius ?? 0.4) * 1.05), Math.max(0.3, (cr.height ?? 1.2) * 1.1), d);
    }
    // reused entries (no garbage per frame): the unused tail sorts last
    for (let i = n0; i < pool.length; i++) pool[i].d = Infinity;
    const c = pool;
    c.sort(byD);
    const fxp = pr.postfx;
    const n = Math.min(n0, fxp.blobs.length);
    for (let i = 0; i < n; i++) { const b = c[i]; fxp.blobs[i].set(b.x, b.y, b.z, b.r); fxp.blobH[i] = b.h; }
    fxp.blobN = n;
    // the fixtures each body casts its shadows from (bodies near the view only; cheap: a few short ray tests each)
    {
      const out = this.shBuf, L = fxp.blobL;
      for (let i = 0; i < n; i++) {
        const b = c[i];
        v.lg.lightsFor(b.x, b.z, 3, out, 0);
        for (let k = 0; k < 3; k++) L[i * 3 + k].set(out[k * 4], out[k * 4 + 1], out[k * 4 + 2], out[k * 4 + 3]);
      }
    }
  }
}

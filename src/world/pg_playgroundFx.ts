// The Nostalgic Playground's moving fixtures (src/content/furniture/pg_playground.ts,
// src/world/gen/z_playground.ts): the swings on every swing frame swing by
// themselves with no wind, each in its own slow rhythm, and creak at the top of
// each arc; the roundabout's deck turns on its own and speeds up while nobody
// is looking at it. Purely visual and purely local: every peer animates its own
// copy from the clock, nothing touches shared state. Installs itself as a game
// system the first time the game exists.
import * as THREE from 'three';
import { G } from '../game/G';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { rod, torus, discY } from '../content/furniture/b_common';
import { objDef } from './objects';
import { objectMatrix } from './chunkMesher';
import type { Zone, TileObject } from './zone';

interface Mover { o: TileObject; g: THREE.Group; parts: THREE.Object3D[]; seed: number; next: number[] }
const GEO: Record<string, THREE.BufferGeometry> = {};
function geo(k: string, fn: (mb: ModelBuilder) => void) { return (GEO[k] ??= (() => { const mb = new ModelBuilder(); fn(mb); return mb.build(); })()); }

/** a swing hanging from its pivot (the top bar at the origin): two chains, a rubber seat */
const swingGeo = () => geo('swing', (mb) => {
  for (const s of [-1, 1]) mb.box(s * 0.2, -1.8, 0, 0.018, 1.8, 0.018, 'q_chain');
  mb.box(0, -1.84, 0, 0.47, 0.035, 0.17, 'q_swing_seat');
  for (const s of [-1, 1]) mb.box(s * 0.21, -1.81, 0, 0.03, 0.05, 0.05, 'metal_dark');
});
/** the roundabout's deck: the painted disc, its rails and the hub */
const deckGeo = () => geo('deck', (mb) => {
  mb.cylinder(0, 0.18, 0, 0.9, 0.07, 16, 'q_paint_yellow', { caps: false } as any);
  discY(mb, 0, 0.25, 0, 0.9, 16, 'q_merry_top');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.2, cx = Math.cos(a), cz = Math.sin(a);
    rod(mb, cx * 0.12, 0.88, cz * 0.12, cx * 0.8, 0.55, cz * 0.8, 0.022, 6, k % 2 ? 'q_paint_red' : 'q_paint_blue');
    rod(mb, cx * 0.8, 0.25, cz * 0.8, cx * 0.8, 0.55, cz * 0.8, 0.022, 6, k % 2 ? 'q_paint_red' : 'q_paint_blue');
  }
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2 + 0.2, a1 = ((k + 1) / 12) * Math.PI * 2 + 0.2;
    rod(mb, Math.cos(a0) * 0.8, 0.55, Math.sin(a0) * 0.8, Math.cos(a1) * 0.8, 0.55, Math.sin(a1) * 0.8, 0.02, 4, 'metal_grey');
  }
  mb.cylinder(0, 0.25, 0, 0.12, 0.66, 8, 'q_paint_red', { rTop: 0.06 } as any);
  mb.sphere(0, 0.92, 0, 0.07, 7, 4, 'q_paint_yellow');
  torus(mb, 0, 0.2, 0, 0.92, 0.02, 18, 4, 'metal_dark');
});
const SWINGS_X = [-0.75, 0.45];
const TOP = 2.28;

class PlaygroundFx {
  name = 'pg_fx';
  private root = new THREE.Group();
  private live = new Map<number, Mover>();
  private zoneKey = '';
  private scanT = 0;
  private t = 0;
  private mat = worldMaterial({});

  update(dt: number) {
    const g: any = G;
    const p = g?.local, z = g?.zone as Zone | undefined;
    if (!p || !z || !g.pr?.scene) return;
    if (!this.root.parent) { this.root.name = 'pg_fx'; g.pr.scene.add(this.root); }
    if (z.key !== this.zoneKey) { this.clear(); this.zoneKey = z.key; this.scanT = 0; }
    this.t += dt;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1.2; this.scan(z, p.x, p.z); }
    const t = this.t;
    for (const m of this.live.values()) {
      const o = z.objects.get(m.o.uid);
      if (!o) { m.g.visible = false; continue; }
      const d = objDef(o.key)!;
      m.g.visible = true;
      m.g.matrix.copy(objectMatrix(z, o, d)); m.g.matrixWorldNeedsUpdate = true;
      const cx = o.x + (d.w ?? 1) / 2, cz = o.y + (d.d ?? 1) / 2, dist = Math.hypot(cx - p.x, cz - p.z);
      if (o.key === 'pg_swing_frame') {
        m.parts.forEach((sw, i) => {
          // somebody invisible is swinging: the arc swells and dies away over half a minute
          const ph = m.seed * 7 + i * 2.1;
          const amp = 0.1 + 0.55 * Math.max(0, Math.sin(t * 0.09 + ph)) ** 2;
          const a = Math.sin(t * 2.35 + ph * 3) * amp;
          sw.rotation.x = a;
          if (dist < 15 && amp > 0.3 && Math.abs(a) > amp * 0.97 && t > m.next[i]) { m.next[i] = t + 0.8; g.audio?.play?.('tc_creak', cx, cz, { zone: z.key, vol: 0.14 + amp * 0.2 }); }
        });
      } else {
        // the deck: slow while watched, faster as soon as you look away
        const away = Math.abs(((Math.atan2(cz - p.z, cx - p.x) - p.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.9;
        const w = (0.25 + 0.15 * Math.sin(t * 0.13 + m.seed * 5)) * (away ? 3.2 : 1);
        const deck = m.parts[0];
        deck.rotation.y += w * dt;
        if (dist < 14 && t > m.next[0]) { m.next[0] = t + 2.6 / Math.max(0.3, w); g.audio?.play?.('still_creak', cx, cz, { zone: z.key, vol: 0.12 + Math.min(0.2, w * 0.1) }); }
      }
    }
  }

  private scan(z: Zone, px: number, pz: number) {
    const R = 42;
    const seen = new Set<number>();
    for (const o of z.objects.values()) {
      if (o.key !== 'pg_swing_frame' && o.key !== 'pg_merry') continue;
      if (Math.abs(o.x - px) > R || Math.abs(o.y - pz) > R) continue;
      seen.add(o.uid);
      if (this.live.has(o.uid)) continue;
      const g = new THREE.Group(); g.matrixAutoUpdate = false;
      const parts: THREE.Object3D[] = [];
      if (o.key === 'pg_swing_frame') {
        for (const x of SWINGS_X) {
          const piv = new THREE.Group(); piv.position.set(x, TOP, 0);
          const mesh = new THREE.Mesh(swingGeo(), this.mat); mesh.castShadow = true; mesh.receiveShadow = true;
          piv.add(mesh); g.add(piv); parts.push(piv);
        }
      } else {
        const deck = new THREE.Group();
        const mesh = new THREE.Mesh(deckGeo(), this.mat); mesh.castShadow = true; mesh.receiveShadow = true;
        deck.add(mesh); g.add(deck); parts.push(deck);
        deck.rotation.y = (o.uid % 628) / 100;
      }
      this.root.add(g);
      this.live.set(o.uid, { o, g, parts, seed: ((o.uid * 2654435761) >>> 0) / 4294967296, next: parts.map(() => 0) });
    }
    for (const [uid, m] of this.live) if (!seen.has(uid)) { this.root.remove(m.g); this.live.delete(uid); }
  }

  private clear() { for (const m of this.live.values()) this.root.remove(m.g); this.live.clear(); }
}

if (typeof window !== 'undefined' && typeof (globalThis as any).document?.visibilityState === 'string') {
  let tries = 0;
  const iv = setInterval(() => {
    const g: any = G;
    if (++tries > 3000) { clearInterval(iv); return; }
    if (!g?.addSystem || !g.pr) return;
    clearInterval(iv);
    try { g.addSystem(new PlaygroundFx()); } catch (e) { console.warn('pg fx', e); }
  }, 400);
}

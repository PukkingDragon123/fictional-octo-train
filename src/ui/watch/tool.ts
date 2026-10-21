// The watch as a multi-tool: a cutting laser, a welding arc and the scanner
// beam (G.watch.laser), and the field fabricator (G.watch.fab).
//
// For other systems (build mode, crafting, welding):
//   G.watch.laser.can('cut' | 'weld' | 'scan')        researched? (.unlocked: the cutter)
//   G.watch.laser.fire(mode, {x, y, z}, dt)           draw the beam from the local wrist to a world point
//                                                     this frame and drain charge; false when locked or empty.
//                                                     Callers apply their own effect (a weld seam, a cut).
//   G.watch.laser.charge / capacity()                 the battery
//   G.watch.fab.register(recipeKey | keys[])          make a recipe field-craftable on the watch's FAB page
// Bus: 'laserCut' (furniture the cutter finished), 'watchWeld' ({ zone, uid?, x, y, z }), 'watchFab' (recipe).
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { hasUnlock } from '../../game/research';
import { allRecipes, recipe as recipeByKey, type Recipe } from '../../items/recipes';
import { CraftAction } from '../../interact/crafting';
import { shake } from '../../gfx/juice';

export type LaserMode = 'cut' | 'weld' | 'scan';
const COL: Record<LaserMode, number> = { cut: 0xff3048, weld: 0x9fe8ff, scan: 0x4ff0ff };

export class WatchLaser {
  armed = false;
  mode: 'cut' | 'weld' = 'cut';
  charge = 1;
  private beam: THREE.Mesh;
  private core: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private coreMat: THREE.MeshBasicMaterial;
  private onT = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private beamMode: LaserMode = 'cut';
  private fxT = 0;
  private dmgT = 0;
  private humT = 0;
  /** uid → time the cutter last touched it (for 'laserCut') */
  private touched = new Map<number, number>();
  holding = false;

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    this.mat = new THREE.MeshBasicMaterial({ color: COL.cut, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beam = new THREE.Mesh(geo, this.mat);
    this.core = new THREE.Mesh(geo, this.coreMat);
    this.beam.visible = this.core.visible = false;
    this.beam.frustumCulled = this.core.frustumCulled = false;
    G.pr.scene.add(this.beam, this.core);
    bus.on('objBroken', (_z: any, o: any) => {
      const t = o && this.touched.get(o.uid);
      if (t !== undefined && G.time - t < 0.8) { this.touched.delete(o.uid); bus.emit('laserCut', o); }
    });
  }

  capacity() { return hasUnlock('tool_cell') ? 2 : 1; }
  /** researched for a mode: 'cut' LASER CUTTER, 'weld' ARC WELDER, 'scan' SCANNER BEAM */
  can(mode: LaserMode = 'cut') { return hasUnlock(mode === 'weld' ? 'tool_weld' : mode === 'scan' ? 'tool_beam' : 'tool_laser'); }
  /** the cutter is researched (the welder needs it too) */
  get unlocked() { return hasUnlock('tool_laser'); }
  arm(on: boolean) {
    if (on && !this.can(this.mode)) { G.audio?.ui?.('watchDeny'); return; }
    this.armed = on;
    G.audio?.ui?.(on ? 'laserZap' : 'watchTick', on ? 0.35 : 0.5);
  }
  stop() { this.onT = 0; this.holding = false; }

  /** the local survivor's wrist in world space (left forearm, raised a little) */
  wrist(out: THREE.Vector3) {
    const p = G.local;
    const f = p.facing;
    return out.set(p.x + Math.cos(f) * 0.32 - Math.sin(f) * 0.12, p.y + 1.18, p.z + Math.sin(f) * 0.32 + Math.cos(f) * 0.12);
  }

  /** draw a beam this frame toward a world point and drain charge (other systems call this too) */
  fire(mode: LaserMode, to: { x: number; y: number; z: number }, dt = 1 / 60): boolean {
    if (!G.local || !this.can(mode)) return false;
    const drain = mode === 'cut' ? 0.12 : mode === 'weld' ? 0.07 : 0.02;
    if (this.charge < drain * dt) { if (this.onT <= 0) G.audio?.ui?.('watchDeny', 0.4); return false; }
    this.charge = Math.max(0, this.charge - drain * dt);
    this.wrist(this.from);
    this.to.set(to.x, to.y, to.z);
    this.beamMode = mode;
    this.onT = 0.08;
    // light, sparks and hum
    const col = COL[mode];
    G.pointLight?.(to.x, to.y + 0.1, to.z, col, mode === 'scan' ? 0.6 : 2.2, mode === 'scan' ? 3 : 5);
    this.fxT -= dt;
    if (this.fxT <= 0 && mode !== 'scan') {
      this.fxT = 0.07;
      const z = G.zones.get(G.local.zoneKey);
      const dx = this.from.x - to.x, dz = this.from.z - to.z, l = Math.hypot(dx, dz) || 1;
      if (z) G.destruct?.impactFx?.(z, to.x, to.y, to.z, dx / l, dz / l, 'metal', mode === 'weld' ? 0.45 : 0.7);
    }
    this.humT -= dt;
    if (this.humT <= 0) { this.humT = 0.3; G.audio?.at?.('laserHum', to.x, to.z, mode === 'scan' ? 0.15 : 0.5); }
    return true;
  }

  /** the armed cutter / welder held on whatever is under the cursor (called each frame while the button is held) */
  holdAt(dt: number) {
    const ui = G.ui, t = ui?.hover;
    const pt = t?.point ?? G.pr.screenToWorld(G.input.mouseX, G.input.mouseY, 0.6);
    if (!pt) return;
    const p = G.local;
    if (Math.hypot(pt.x - p.x, pt.z - p.z) > 9) return;
    if (!this.fire(this.mode, pt, dt)) { this.holding = false; return; }
    this.dmgT -= dt;
    if (this.dmgT > 0) return;
    this.dmgT = 0.2;
    if (this.mode === 'cut') {
      if (t?.kind === 'object') { this.touched.set(t.obj.uid, G.time); G.destruct?.damageObject?.(p, t.obj, 9, 'laser', pt); }
      else if (t?.kind === 'creature' && !t.c.dead) { G.creatures?.damage?.(p.id, t.c.id, 7, p.x, p.z, 0.1, 'laser'); shake(0.12); }
    } else if (this.mode === 'weld') {
      bus.emit('watchWeld', { zone: p.zoneKey, uid: t?.kind === 'object' ? t.obj.uid : undefined, x: pt.x, y: pt.y, z: pt.z });
    }
  }

  update(dt: number) {
    if (this.onT > 0) this.onT -= dt;
    else this.charge = Math.min(this.capacity(), this.charge + dt * 0.05 * this.capacity());
    const on = this.onT > 0 && !!G.local;
    this.beam.visible = this.core.visible = on;
    if (!on) return;
    const len = this.from.distanceTo(this.to);
    const w = this.beamMode === 'scan' ? 0.035 : this.beamMode === 'weld' ? 0.05 : 0.06;
    const flick = 0.75 + Math.random() * 0.5;
    for (const [m, k] of [[this.beam, 1], [this.core, 0.35]] as [THREE.Mesh, number][]) {
      m.position.copy(this.from);
      m.lookAt(this.to);
      m.scale.set(w * k * flick, w * k * flick, len);
    }
    this.mat.color.setHex(COL[this.beamMode]);
    this.mat.opacity = this.beamMode === 'scan' ? 0.3 + Math.sin(G.time * 30) * 0.1 : 0.55;
  }
}

/** field crafting: simple recipes the watch can fold out of what you carry */
export class WatchFab {
  private keys = new Set<string>();
  private pending: string | null = null;
  constructor() {
    bus.on('crafted', (p: any, r: any) => {
      const k = typeof r === 'string' ? r : r?.key;
      if (p?.isLocal && k && k === this.pending) { this.pending = null; bus.emit('watchFab', k); G.audio?.ui?.('watchTick'); }
    });
  }
  register(k: string | string[]) { for (const x of Array.isArray(k) ? k : [k]) this.keys.add(x); }
  /** registered patterns, plus anything simple enough to fold by hand (no station, few parts, quick) */
  list(): Recipe[] {
    const p = G.local as any;
    const out: Recipe[] = [];
    for (const k of this.keys) { const r = recipeByKey(k); if (r) out.push(r); }
    for (const r of allRecipes()) {
      if (this.keys.has(r.key) || r.needs?.length || r.inputs.length > 3 || r.time > 25) continue;
      if (r.learned && !p?.knownRecipes?.has(r.key)) continue;
      if (r.category === 'cooking' || r.category === 'farming') continue;
      out.push(r);
    }
    return out;
  }
  craft(r: Recipe) {
    const p = G.local; if (!p) return;
    const L = G.watch?.laser as WatchLaser | undefined;
    if (L && L.charge < 0.1) { G.audio?.ui?.('watchDeny'); G.ui?.toast?.('LOW CHARGE', 'The fabricator needs 10% charge.', 2); return; }
    if (L) L.charge -= 0.1;
    this.pending = r.key;
    const a = new CraftAction(p, r);
    a.duration *= 0.6; // the fabricator does the fiddly part
    p.actions.add(a);
    G.audio?.ui?.('laserZap', 0.3);
  }
}

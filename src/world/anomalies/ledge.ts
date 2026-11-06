// The Ledge at runtime (the level: src/world/gen/z_ledge.ts):
//   look      the melt (U.uMelt: walls and tall props sag, lean and shimmer,
//             src/gfx/materials.ts), a heat shimmer on the picture
//             (G.pr.fx.heat, src/gfx/postfx.ts) that grows with exposure, a
//             saturated grade and haze, drops of melt falling from the ceiling
//   melting   things left lying in the Ledge soften and then melt: floor items
//             (data.melt 0..1: 'Softened', then 'Melted', condition and worth
//             gone, src/items/worldItems.ts squashes them) and furniture
//             (state.melt 1..3 via the objState op: src/world/anomalies/meltGeo.ts
//             slumps the model); a container that melts through ruins what is in it
//   exposure  the unit heats up while it stays (0..100): lucidity wears down,
//             stress climbs, past 70 the floor burns hands and feet. Protection
//             slows it: the hazmat suit, a gas mask, the Hazmat Filter, Survey Foil
//             (ledgeProtection). Outside the Ledge it cools off.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { GRADES } from '../../game/game';
import { ZONEFX } from '../../gfx/fxconfig';
import { U, worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { blob, tube } from '../../creatures/kit/anomalies';
import { op } from '../../game/ops';
import { objDef } from '../objects';
import { floorItems } from '../../items/worldItems';
import { itemDef, type Item } from '../../items/item';
import type { Player } from '../../entities/player';
import type { Zone, TileObject } from '../zone';

GRADES.ledge = { lift: [0.02, 0.006, 0.026], gain: [1.03, 0.99, 0.98], gamma: 0.98, sat: 1.2, tint: [1.02, 0.99, 1.01], vignette: 0.28 };
ZONEFX.ledge = { haze: [1.15, 0.9, 0.96], hazeDens: 0.01, hazeFall: 0.05, gridMul: 1.1, mist: [0.62, 0.36, 0.32], mistDens: 0.018, mistFall: 1.2, mistLit: 1.0, mistMax: 0.12,
  bloom: 0.8, bloomTh: 0.7, ao: 0.85, sick: 0, motes: 1.6, dirt: 0.3, rim: 1.2, rimTint: [0.14, 0.06, 0.1], reflect: 0.95, sheen: 1.1 };

/** seconds for something left on the floor to melt right through */
const ITEM_MELT = 110;
/** seconds per furniture melt stage (jittered per object) */
const OBJ_STAGE = [45, 110, 220];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hsh = (n: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** how much the unit's gear slows the Ledge's heat (0..0.85) */
export function ledgeProtection(p: Player): { k: number; parts: string[] } {
  const parts: string[] = [];
  let k = 0;
  const worn = [...p.worn.values()].map((w) => w.key);
  if (worn.includes('hazmat_suit') || worn.includes('prison_jumpsuit')) { k += 0.22; parts.push('suit'); }
  if (worn.includes('gas_mask')) { k += 0.15; parts.push('mask'); }
  const has = (key: string) => p.allItems().some((i) => i.key === key);
  if (has('tool_filter')) { k += 0.18; parts.push('filter'); }
  if (has('ledge_foil')) { k += 0.35; parts.push('foil'); }
  return { k: Math.min(0.85, k), parts };
}

/** can this be melted (furniture) */
function meltable(o: TileObject): boolean {
  const d = objDef(o.key);
  if (!d || d.onWall || d.ceiling || o.state?.held) return false;
  const t = d.tags || [];
  if (t.includes('fixed') || t.includes('anomaly') || t.includes('portal') || t.includes('mission') || t.includes('hopper') || t.includes('node')) return false;
  return !/^(lg_|vx_|zw_|an_)/.test(o.key);
}
/** an item melts (or softens) where it lies */
export function setItemMelt(it: Item, m: number) {
  const d = (it.data ||= {});
  const base = itemDef(it.key).name;
  d.melt = Math.max(0, Math.min(1, m));
  if (d.melt >= 1) { if (!d.melted) { d.melted = 1; it.cond = Math.min(it.cond ?? 1, 0.15); it.name = 'Melted ' + base; } }
  else if (d.melt >= 0.5) { if (!d.soft) { d.soft = 1; it.cond = Math.min(it.cond ?? 1, 0.6); it.name = 'Softened ' + base; } }
}
/** set right again (the Upward Rain does this) */
export function unmeltItem(it: Item) {
  if (!it.data) return;
  if (it.data.melt || it.data.melted || it.data.soft) { delete it.data.melt; delete it.data.melted; delete it.data.soft; it.name = undefined; }
}
const meltable_item = (it: Item) => { const d = itemDef(it.key); return d.anomaly !== 'ledge' && !(d.tags || []).includes('ledge') && d.cat !== 'anomaly'; };

export class LedgeRuntime {
  /** the local unit's heat 0..100 */
  heat = 0;
  melt = 0;
  private stepT = 0;
  private objT = 0;
  private burnT = 12;
  private said = new Set<string>();
  private objAcc = new Map<number, number>();
  private drips: THREE.InstancedMesh | null = null;
  private dripS: { x: number; y: number; z: number; vy: number; floor: number; wait: number }[] = [];
  private m4 = new THREE.Matrix4();
  private zoneKey = '';
  private calderT = 0;

  update(dt: number) {
    const p = G.local as Player | undefined;
    const z = G.zone as Zone | undefined;
    if (!p || !z) return;
    const here = !!z.meta?.ledge && p.zoneKey === z.key;
    if (z.key !== this.zoneKey) { this.zoneKey = z.key; this.objAcc.clear(); if (here) this.enter(p); }
    // the look ramps in and out (the walls sag as you arrive)
    this.melt += ((here ? 1 : 0) - this.melt) * Math.min(1, dt * (here ? 0.6 : 3));
    if (this.melt < 0.002) this.melt = 0;
    U.uMelt.value = this.melt;
    const fx = G.pr?.fx as any;
    if (fx) fx.heat = Math.min(1.25, this.melt * (0.5 + 0.6 * this.heat / 100));
    if (this.drips) this.drips.visible = here;
    if (!here) { this.heat = Math.max(0, this.heat - dt * 1.4); return; }
    if (!p.body.dead) this.expose(p, dt);
    this.updateDrips(dt, p, z);
    // melting runs on the host (solo / host); its furniture changes go out as objState ops
    if (G.role === 'client') return;
    this.stepT += dt;
    if (this.stepT >= 1) { this.meltItems(z, this.stepT); this.stepT = 0; }
    this.objT += dt;
    if (this.objT >= 2) { this.meltObjects(z, p, this.objT); this.objT = 0; }
  }

  private enter(p: Player) {
    this.ensureDrips();
    if (!this.said.has('enter')) {
      this.said.add('enter');
      setTimeout(() => bus.emit('subtitle', { who: 'DR. CALDER', text: 'That is the Ledge. Everything there is soft, and it will be soft with your unit too. Keep moving, and put nothing down.', style: 'voss', dur: 7 }), 2500);
    }
    bus.emit('think', p, pick(['It is warm. Everything is warm.', 'The walls are leaning. No. They are not. They are.', 'Smells like candles and carpet.']));
  }

  // ---------------------------------------------------------------- the unit heats up
  private expose(p: Player, dt: number) {
    const prot = ledgeProtection(p);
    const was = this.heat;
    this.heat = Math.min(100, this.heat + dt * (100 / 300) * (1 - prot.k));
    const k = this.heat / 100, b = p.body;
    b.lucidity = Math.max(0, b.lucidity - dt * 0.11 * k);
    b.stress = Math.min(100, b.stress + dt * 0.04 * k);
    if (k > 0.5) b.thirst = Math.min(100, b.thirst + dt * 0.012 * k);
    if (G.survival) G.survival.anomaly = Math.max(G.survival.anomaly, 0.25 * k);
    const cross = (t: number) => was < t && this.heat >= t;
    if (cross(25)) bus.emit('think', p, prot.k > 0.4 ? 'Warm under the suit. Manageable.' : 'It is getting into me. The warm.');
    if (cross(50)) {
      bus.emit('think', p, 'My thoughts are going soft at the edges.');
      if (this.calderT <= G.time) { this.calderT = G.time + 120; bus.emit('subtitle', { who: 'DR. CALDER', text: prot.parts.includes('foil') ? 'Core temperature climbing, even with the foil. Do what you came for and go back up the rope.' : 'Core temperature climbing. Survey foil would slow that, if you can find the post. Otherwise, the rope.', style: 'voss', dur: 6.5 }); }
    }
    if (cross(75)) bus.emit('think', p, 'Get out. Get out before you are part of the carpet.');
    // past 70 the floor burns: hands on walls, feet through the soles
    if (this.heat > 70) {
      this.burnT -= dt * (1 - prot.k * 0.8);
      if (this.burnT <= 0) {
        this.burnT = 14 + Math.random() * 10;
        b.addInjury(pick(['hand_l', 'hand_r', 'foot_l', 'foot_r'] as const), 'burn', 0.04 + 0.08 * k);
        G.audio?.at?.('sizzle', p.x, p.z, 0.4);
        bus.emit('think', p, pick(['The floor is sticking to my feet.', 'I touched the wall. The wall touched back. Hot.', 'Something dripped on my hand. It burns.']));
      }
    }
  }

  // ---------------------------------------------------------------- things left lying about
  private meltItems(z: Zone, dt: number) {
    const p = G.local;
    for (const wi of floorItems(z).values()) {
      const it = wi.item;
      if (!meltable_item(it)) continue;
      const m0 = it.data?.melt ?? 0;
      if (m0 >= 1) continue;
      setItemMelt(it, m0 + dt / ITEM_MELT);
      if (it.data!.melt >= 1 && p && Math.hypot(wi.x - p.x, wi.z - p.z) < 9) G.audio?.at?.('bh_squelch', wi.x, wi.z, 0.35);
    }
  }
  private meltObjects(z: Zone, p: Player, dt: number) {
    for (const o of z.objects.values()) {
      if (Math.abs(o.x - p.x) > 28 || Math.abs(o.y - p.z) > 28) continue;
      const lvl = Math.min(3, o.state?.melt | 0);
      if (lvl >= 3 || !meltable(o)) continue;
      const acc = (this.objAcc.get(o.uid) ?? 0) + dt;
      const need = OBJ_STAGE[lvl] * (0.7 + hsh(o.uid) * 0.6);
      if (acc < need) { this.objAcc.set(o.uid, acc); continue; }
      this.objAcc.set(o.uid, 0);
      op('objState', { z: z.key, uid: o.uid, patch: { melt: lvl + 1 } });
      const [cx, cz] = [o.x + 0.5, o.y + 0.5];
      if (Math.hypot(cx - p.x, cz - p.z) < 10) G.audio?.at?.(lvl === 2 ? 'arv_squelch' : 'drip', cx, cz, 0.45);
      // melted right through: whatever was inside goes with it
      if (lvl + 1 >= 3 && o.inv) for (const it of o.inv.items) if (meltable_item(it)) setItemMelt(it, 1);
    }
  }

  // ---------------------------------------------------------------- drops of melt falling from the ceiling
  private ensureDrips() {
    if (this.drips || !G.pr?.scene) return;
    const mb = new ModelBuilder();
    tube(mb, [[0, 0.1, 0], [0, 0.05, 0], [0, 0, 0]], (t) => 0.006 + t * t * 0.014, 6, 'lg_wax', { color: 0xffd090, emissive: 0.35 });
    blob(mb, [0, 0, 0], [0.022, 0.03, 0.022], 7, 4, 'lg_wax', { color: 0xffc070, emissive: 0.35 });
    const N = 70;
    this.drips = new THREE.InstancedMesh(mb.build(), worldMaterial({}), N);
    this.drips.frustumCulled = false;
    this.drips.name = 'ledgeDrips';
    G.pr.scene.add(this.drips);
    for (let i = 0; i < N; i++) this.dripS.push({ x: 0, y: -10, z: 0, vy: 0, floor: 0, wait: Math.random() * 4 });
  }
  private updateDrips(dt: number, p: Player, z: Zone) {
    if (!this.drips) this.ensureDrips();
    const m = this.drips; if (!m) return;
    for (let i = 0; i < this.dripS.length; i++) {
      const d = this.dripS[i];
      if (d.wait > 0) {
        d.wait -= dt;
        if (d.wait <= 0) {
          // somewhere within a dozen metres, on a floor tile under the ceiling
          for (let t = 0; t < 6; t++) {
            const x = p.x + (Math.random() - 0.5) * 24, zz = p.z + (Math.random() - 0.5) * 24;
            const tx = Math.floor(x), ty = Math.floor(zz);
            if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)]) continue;
            d.x = x; d.z = zz; d.floor = z.heightAt(tx, ty); d.y = d.floor + 2.62; d.vy = 0; break;
          }
          if (d.y < -5) d.wait = 0.5;
        }
        this.m4.makeScale(0, 0, 0); m.setMatrixAt(i, this.m4);
        continue;
      }
      d.vy -= 9.8 * dt; d.y += d.vy * dt;
      if (d.y <= d.floor) {
        if (Math.hypot(d.x - p.x, d.z - p.z) < 5 && Math.random() < 0.3) G.audio?.at?.('drip', d.x, d.z, 0.25);
        d.y = -10; d.wait = 0.5 + Math.random() * 3.5;
        this.m4.makeScale(0, 0, 0); m.setMatrixAt(i, this.m4);
        continue;
      }
      const st = 1 + Math.min(1.5, -d.vy * 0.12);
      this.m4.makeScale(1, st, 1).setPosition(d.x, d.y, d.z);
      m.setMatrixAt(i, this.m4);
    }
    m.instanceMatrix.needsUpdate = true;
  }
}

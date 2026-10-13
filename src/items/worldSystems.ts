// World systems behind the right-click menus: fire (campfires and spreading
// tile fires), generators and breakers, farming, traps, pushable carts,
// carrying and placing furniture, building, rain collection and weather.
// Host-authoritative: the host simulates and replicates through ops.
import * as THREE from 'three';
import { bus } from '../core/events';
import { G } from '../game/G';
import { op, defOp } from '../game/ops';
import { serializeObj } from '../game/worldOps';
import { clamp } from '../core/math';
import { uid } from '../core/rng';
import { objDef, objectGeometry, defObj } from '../world/objects';
import { objectMatrix } from '../world/chunkMesher';
import { itemDef, hasItemDef, Item } from './item';
import { createItem } from './factory';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';
import { atlas } from '../gfx/atlas';
import { addTextureModule } from '../gfx/textures/index';
import { TF, Zone, TileObject } from '../world/zone';
import { wallId } from '../world/defs';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import { pick } from '../game/picking';
import type { GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';

// ---------------------------------------------------------------- fx textures
addTextureModule(() => {
  atlas().add('fx_flame', 8, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const cx = Math.abs(x + 0.5 - 4) / 4, t = y / 16; // t: 0 top .. 1 bottom
      const w = 0.25 + t * 0.75;
      if (cx > w) continue;
      const core = cx < w * 0.45 && t > 0.35;
      pc.set(x, y, core ? (t > 0.75 ? 0xfff6c0 : 0xffd060) : t > 0.6 ? 0xff8a20 : 0xe04a10);
    }
  });
  atlas().add('fx_rain', 2, 8, (pc) => { pc.fill(0x9ab4d0); pc.set(0, 0, 0xd8e8f8); });
});

const FIRE_LIGHT = 0xff8a3a;
const tileKey = (x: number, y: number) => x + ',' + y;
interface FireTile { i: number; f: number }
const firesOf = (z: Zone): Record<string, FireTile> => (z.meta.fires ||= {});

defOp('fire', (a: { z: string; x: number; y: number; i: number; f?: number }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const F = firesOf(z), k = tileKey(a.x, a.y);
  if (a.i <= 0) {
    if (F[k]) { delete F[k]; z.flags[z.idx(a.x, a.y)] |= TF.BURNT; }
    return;
  }
  F[k] = { i: a.i, f: a.f ?? F[k]?.f ?? 30 };
});

// ---------------------------------------------------------------- crops
interface CropDef { name: string; days: number; yield: [number, number]; item: string; color: number }
export const CROPS: Record<string, CropDef> = {
  potato: { name: 'Potatoes', days: 6, yield: [3, 6], item: 'potato', color: 0xc8a060 },
  carrot: { name: 'Carrots', days: 4, yield: [3, 6], item: 'carrot', color: 0xe8802a },
  tomato: { name: 'Tomatoes', days: 5, yield: [3, 7], item: 'tomato', color: 0xd83a2a },
  cabbage: { name: 'Cabbage', days: 5, yield: [1, 2], item: 'cabbage', color: 0x9ad070 },
  strawberry: { name: 'Strawberries', days: 4, yield: [4, 9], item: 'strawberries', color: 0xd02a3a },
  lettuce: { name: 'Lettuce', days: 3, yield: [1, 2], item: 'lettuce', color: 0xb8e888 },
  dreamlily: { name: 'Dreamlilies', days: 7, yield: [1, 3], item: 'dreamlily_bloom', color: 0xd8b8ff },
};

/** generic crop furrow object; its look follows the growth stage */
defObj({
  key: 'crop', name: 'Crop', height: 0.4, block: 'none', flammable: 0.4, sound: 'fabric',
  tags: ['farm', 'crop', 'plant'],
  variant: (s) => `${s.crop}:${Math.floor(s.stage ?? 0)}:${s.dead ? 1 : 0}`,
  model: (mb, s) => {
    const def = CROPS[s.crop as string] || CROPS.potato;
    const st = Math.floor(s.stage ?? 0);
    const dead = !!s.dead || st >= 5;
    const leaf = dead ? 0x8a6a3a : st >= 4 ? 0x4a8a2a : 0x6ab04a;
    mb.box(0, 0, 0, 0.8, 0.04, 0.3, 'soil', { color: 0xd0c0b0 });
    const n = st <= 0 ? 0 : 3;
    for (let i = 0; i < n; i++) {
      const x = -0.25 + i * 0.25, h = 0.08 + Math.min(4, st) * 0.08;
      mb.cross(x, 0.03, 0, 0.18 + st * 0.04, h, 'grass', { color: leaf, rot: i * 0.7, sway: 0.6 });
      if (st >= 4 && !dead) mb.sphere(x + 0.03, h * 0.6, 0.04, 0.035, 5, 4, 'plastic_white', { color: def.color });
    }
    if (st <= 0) for (let i = 0; i < 3; i++) mb.box(-0.25 + i * 0.25, 0.04, 0, 0.03, 0.02, 0.03, 'grass', { color: 0x8ac060 });
  },
});

// ---------------------------------------------------------------- building
interface Buildable { key: string; label: string; secs: number; skill?: number; tools: string[]; mats: [string, number][]; obj?: string; wall?: string; edge?: boolean }
const BUILD: Buildable[] = [
  { key: 'wall_n', label: 'Wooden wall (north edge)', secs: 14, skill: 1, tools: ['#hammer'], mats: [['plank', 3], ['nails', 6]], wall: 'wood_built', edge: true },
  { key: 'wall_w', label: 'Wooden wall (west edge)', secs: 14, skill: 1, tools: ['#hammer'], mats: [['plank', 3], ['nails', 6]], wall: 'wood_built', edge: true },
  { key: 'fence_n', label: 'Fence (north edge)', secs: 8, tools: ['#hammer'], mats: [['plank', 2], ['nails', 4]], wall: 'fence_wood', edge: true },
  { key: 'fence_w', label: 'Fence (west edge)', secs: 8, tools: ['#hammer'], mats: [['plank', 2], ['nails', 4]], wall: 'fence_wood', edge: true },
  { key: 'crate', label: 'Wooden crate', secs: 10, skill: 1, tools: ['#hammer'], mats: [['plank', 3], ['nails', 4]], obj: 'crate_wood' },
  { key: 'firepit', label: 'Fire pit', secs: 6, tools: [], mats: [['stone', 4], ['firewood', 1]], obj: 'campfire_unlit' },
  { key: 'rain', label: 'Rain collector', secs: 16, skill: 2, tools: ['#hammer'], mats: [['plank', 2], ['nails', 4], ['tarp', 1]], obj: 'rain_collector' },
  { key: 'bed', label: 'Makeshift bed', secs: 18, skill: 2, tools: ['#hammer'], mats: [['plank', 4], ['nails', 6], ['bedsheet', 1]], obj: 'bed_makeshift' },
  { key: 'table', label: 'Plank table', secs: 14, skill: 2, tools: ['#hammer'], mats: [['plank', 4], ['nails', 6]], obj: 'table_makeshift' },
  { key: 'sign', label: 'Sign post', secs: 5, tools: ['#hammer'], mats: [['plank', 1], ['nails', 2]], obj: 'sign_post' },
];

const pickN = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class WorldSystems implements GameSystem {
  name = 'items';
  // fire visuals
  private fireMesh: THREE.InstancedMesh;
  private fireT = 0;
  private fireDmgT = 0;
  // rain visuals
  private rainMesh: THREE.InstancedMesh;
  private rainSeeds: Float32Array;
  // placement mode
  placing: { p: Player; it: Item; key: string; rot: 0 | 1 | 2 | 3; ghost: THREE.Mesh | null; x: number; y: number; ok: boolean; plant?: boolean } | null = null;
  // pushing
  private pushing = new Map<string, number>();
  private pushT = 0;
  private simH = 0;
  private genT = 0;
  private weatherT = 0;
  private running: { z: Zone; x: number; y: number; o: TileObject }[] = [];

  constructor() {
    const mb = new ModelBuilder();
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3;
      const dx = Math.cos(a) * 0.22, dz = Math.sin(a) * 0.22;
      mb.quadRaw([[-dx, 0, -dz], [dx, 0, dz], [dx, 0.8, dz], [-dx, 0.8, -dz]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'fx_flame', 0xffffff, 1, 1.4, 0);
    }
    const g = mb.build();
    this.fireMesh = new THREE.InstancedMesh(g, worldMaterial({ cutout: true, doubleSide: true, noGrid: true, unlit: true }), 256);
    this.fireMesh.count = 0; this.fireMesh.frustumCulled = false;
    G.pr.scene.add(this.fireMesh);
    const rb = new ModelBuilder();
    rb.quadRaw([[0, 0, 0], [0.02, 0, 0.02], [0.02, 0.5, 0.02], [0, 0.5, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'fx_rain', 0xffffff, 1, 0.5, 0);
    this.rainMesh = new THREE.InstancedMesh(rb.build(), worldMaterial({ transparent: true, opacity: 0.45, doubleSide: true, noGrid: true, unlit: true, outline: 0 }), 700);
    this.rainMesh.count = 0; this.rainMesh.frustumCulled = false;
    G.pr.scene.add(this.rainMesh);
    this.rainSeeds = new Float32Array(700 * 3).map(() => Math.random());
    (G as any).fireNear = (x: number, z: number, zk?: string) => this.fireNear(x, z, 3.5, zk);
    bus.on('travelEnd', () => { this.cancelPlacing(); });
  }

  // ================================================================= update
  update(dt: number, dh: number) {
    const host = G.role !== 'client';
    this.simH += dh;
    this.genT -= dt;
    if (this.genT <= 0) { this.genT = 1; this.updateGenerators(host); }
    this.fireT -= dt;
    if (this.fireT <= 0) { this.fireT = 0.5; if (host) this.simFires(0.5); this.campfires(host); }
    if (this.simH >= 0.25) { const h = this.simH; this.simH = 0; if (host) { this.burnCampfires(h); this.simCrops(h); this.simTraps(h); this.simRain(h); this.simWater(); } }
    this.weatherT -= dt;
    if (this.weatherT <= 0) { this.weatherT = 20; if (host) this.simWeather(); }
    this.updatePushing(dt);
    this.updatePlacing();
    this.renderFires();
    this.renderRain(dt);
  }

  // ================================================================= fire
  /** 0..1 warmth/fear factor of the nearest fire within r metres (zone defaults to the local player's) */
  fireNear(x: number, z: number, r = 3, zoneKey?: string): number {
    const Z = G.zones.get(zoneKey ?? G.local?.zoneKey ?? '');
    if (!Z) return 0;
    let best = 0;
    for (const [k, t] of Object.entries((Z.meta.fires as Record<string, FireTile>) || {})) {
      const [fx, fy] = k.split(',').map(Number);
      const d = Math.hypot(fx + 0.5 - x, fy + 0.5 - z);
      if (d < r) best = Math.max(best, (1 - d / r) * t.i);
    }
    const R = Math.ceil(r);
    for (let y = Math.floor(z) - R; y <= Math.floor(z) + R; y++) for (let xx = Math.floor(x) - R; xx <= Math.floor(x) + R; xx++) {
      if (!Z.inb(xx, y)) continue;
      for (const o of Z.objectsAt(xx, y)) {
        if (!this.isLitFire(o)) continue;
        const d = Math.hypot(o.x + 0.5 - x, o.y + 0.5 - z);
        if (d < r) best = Math.max(best, 1 - d / r);
      }
    }
    return best;
  }
  private isLitFire(o: TileObject) {
    const d = objDef(o.key);
    if (!d) return false;
    if (o.key === 'campfire') return o.state.lit !== false;
    return d.heat === 'fire' && !!o.state.lit;
  }

  /** set a tile alight (molotovs, spreading, sparks) */
  startFire(zoneKey: string, x: number, y: number, intensity = 1) {
    const z = G.zones.get(zoneKey); if (!z || !z.inb(x, y)) return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > (intensity >= 2 ? 2 : 0)) continue;
      const X = x + dx, Y = y + dy;
      if (!z.inb(X, Y) || !z.floor[z.idx(X, Y)]) continue;
      op('fire', { z: zoneKey, x: X, y: Y, i: dx || dy ? 0.6 : 1, f: 20 + this.flammability(z, X, Y) * 50 });
    }
    G.audio?.at?.('whoosh', x + 0.5, y + 0.5);
  }

  private flammability(z: Zone, x: number, y: number): number {
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)]) return 0;
    if (z.flags[z.idx(x, y)] & TF.BURNT) return 0;
    const f = z.floorAt(x, y);
    if (f?.water) return 0;
    let fl = (f as any)?.flammable ?? 0.05;
    for (const o of z.objectsAt(x, y)) { const d = objDef(o.key); if (d?.flammable) fl = Math.max(fl, d.flammable); }
    return fl;
  }

  private simFires(dt: number) {
    for (const z of this.activeZones()) {
      const F = z.meta.fires as Record<string, FireTile> | undefined;
      if (!F) continue;
      const keys = Object.keys(F);
      if (!keys.length) continue;
      const raining = z.env.weather === 'rain';
      const many = keys.length > 500;
      for (const k of keys) {
        const t = F[k]; if (!t) continue;
        const [x, y] = k.split(',').map(Number);
        const outdoor = !!z.floorAt(x, y)?.outdoor;
        t.f -= dt * (0.6 + t.i);
        let ni = t.i + dt * 0.12;
        if (raining && outdoor) ni -= dt * 0.35;
        if (t.f <= 0) ni -= dt * 0.4;
        ni = clamp(ni, 0, 1);
        if (ni <= 0.02) {
          op('fire', { z: z.key, x, y, i: 0 });
          op('decal', { z: z.key, d: { x: x + 0.5, z: y + 0.5, w: 1.3, d: 1.3, rot: Math.random() * 6.28, tex: 'decal_stain_dark', tint: 0x302a24, alpha: 0.85 } });
          continue;
        }
        if (Math.abs(ni - t.i) > 0.2) op('fire', { z: z.key, x, y, i: ni, f: t.f }); else t.i = ni;
        // burn what stands here
        for (const o of [...z.objectsAt(x, y)]) {
          const d = objDef(o.key);
          if (!d?.flammable || o.key === 'campfire' || o.key === 'campfire_unlit') continue;
          o.hp = (o.hp ?? d.hp ?? 120) - dt * 40 * t.i * d.flammable;
          if (o.hp <= 0) { op('objRemove', { z: z.key, uid: o.uid }); t.f += 20 * d.flammable; }
        }
        // spread
        if (many || t.i < 0.35) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const X = x + dx, Y = y + dy;
          if (F[tileKey(X, Y)]) continue;
          if (z.edgeBlocks(x, y, dx, dy, 'sight') && Math.random() > 0.15) continue;
          const fl = this.flammability(z, X, Y);
          if (fl <= 0) continue;
          if (Math.random() < dt * 0.09 * t.i * fl * (raining && outdoor ? 0.2 : 1)) op('fire', { z: z.key, x: X, y: Y, i: 0.35, f: 15 + fl * 45 });
        }
      }
    }
    // burns: players and creatures standing in fire
    this.fireDmgT += dt;
    if (this.fireDmgT < 1) return;
    this.fireDmgT = 0;
    for (const p of G.players.values()) {
      if (p.body.dead) continue;
      const z = G.zones.get(p.zoneKey); const F = z?.meta.fires as Record<string, FireTile> | undefined;
      const t = F?.[tileKey(p.tileX(), p.tileY())];
      if (!t || t.i < 0.15) continue;
      const parts = ['foot_l', 'foot_r', 'shin_l', 'shin_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r'] as const;
      p.body.addInjury(pickN([...parts]) as any, 'burn' as any, 0.12 + t.i * 0.25);
      p.body.panic = Math.min(100, p.body.panic + 20);
      if (p.isLocal) { bus.emit('think', p, pickN(['I\'m burning!', 'HOT—', 'Get out get out get out'])); G.audio?.hurt?.(p); }
    }
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
      if (c.dead) continue;
      const z = G.zones.get(c.zoneKey); const F = z?.meta.fires as Record<string, FireTile> | undefined;
      const t = F?.[tileKey(Math.floor(c.x), Math.floor(c.z))];
      if (t) G.creatures.damage('fire', c.id, 10 * t.i, c.x, c.z, 0);
    }
  }

  private campfires(host: boolean) {
    const z = G.local ? G.zones.get(G.local.zoneKey) : null;
    if (!z) return;
    // point lights for burning tiles near the camera
    const F = z.meta.fires as Record<string, FireTile> | undefined;
    if (F) {
      const near = Object.entries(F).map(([k, t]) => { const [x, y] = k.split(',').map(Number); return { x, y, t, d: Math.hypot(x - G.local.x, y - G.local.z) }; }).filter((f) => f.d < 30).sort((a, b) => a.d - b.d).slice(0, 4);
      this.fireLights = near;
    } else this.fireLights = [];
    if (!host) return;
    void z;
  }
  private fireLights: { x: number; y: number; t: FireTile }[] = [];

  /** campfire fuel burns down in game time; out of fuel → back to a cold pit */
  private burnCampfires(h: number) {
    for (const z of this.activeZones()) {
      for (const o of z.objects.values()) {
        if (o.key === 'campfire') {
          if (o.state.lit === false) { this.swapObject(z, o, 'campfire_unlit', { fuel: 0 }); continue; }
          const fuel = (o.state.fuel ?? 1.5) - h;
          if (fuel <= 0) { this.swapObject(z, o, 'campfire_unlit', { fuel: 0, ash: true }); continue; }
          o.state.fuel = fuel;
          if (z.env.weather === 'rain' && z.floorAt(o.x, o.y)?.outdoor && Math.random() < h * 0.6) this.swapObject(z, o, 'campfire_unlit', { fuel: Math.max(0, fuel - 0.5) });
        } else if (o.state.lit) {
          const d = objDef(o.key);
          if (d?.heat !== 'fire') continue;
          const fuel = (o.state.fuel ?? 1) - h;
          op('objState', { z: z.key, uid: o.uid, patch: fuel <= 0 ? { lit: false, fuel: 0 } : { fuel } });
        }
      }
    }
  }

  lightFire(p: Player, o: TileObject, igniter: Item | undefined, fuel: Item | undefined) {
    const z = G.getZone(p.zoneKey);
    if (!igniter) { bus.emit('think', p, 'I need something to light it with.'); return; }
    const d = itemDef(igniter.key);
    if (d.uses) igniter.uses = Math.max(0, (igniter.uses ?? 1) - 1 / d.uses);
    if ((igniter.uses ?? 1) <= 0.001 && d.cat !== 'tool') p.removeItem(igniter);
    let hours = o.state.fuel ?? (o.key === 'campfire_unlit' && !o.state.ash ? 1.5 : 0);
    if (fuel) { hours += itemDef(fuel.key).burn ?? 1; p.removeItem(fuel); }
    if (hours <= 0) { bus.emit('think', p, 'Nothing to burn.'); return; }
    // wet weather, poor skill: sometimes it doesn't catch
    const outdoorsRain = z.env.weather === 'rain' && z.floorAt(o.x, o.y)?.outdoor;
    if (Math.random() < (outdoorsRain ? 0.5 : 0.08)) { bus.emit('think', p, 'It won\'t catch.'); bus.emit('inventoryChanged', p); return; }
    if (o.key === 'campfire_unlit') this.swapObject(z, o, 'campfire', { lit: true, fuel: hours });
    else op('objState', { z: z.key, uid: o.uid, patch: { lit: true, fuel: hours } });
    G.audio?.at?.('whoosh', o.x + 0.5, o.y + 0.5, 0.6);
    p.body.addXp?.('survival' as any, 3);
    bus.emit('inventoryChanged', p);
  }

  private swapObject(z: Zone, o: TileObject, key: string, state: Record<string, any>) {
    const s = serializeObj(o);
    op('objRemove', { z: z.key, uid: o.uid });
    op('objAdd', { z: z.key, obj: { ...s, uid: uid(), key, state: { ...o.state, ...state }, inv: null } });
  }

  private renderFires() {
    const z = G.local ? G.zones.get(G.local.zoneKey) : null;
    const F = z?.meta.fires as Record<string, FireTile> | undefined;
    const m = this.fireMesh;
    if (!F || !z) { m.count = 0; return; }
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    let n = 0;
    const t = G.time;
    for (const [k, f] of Object.entries(F)) {
      if (n >= 256) break;
      const [x, y] = k.split(',').map(Number);
      if (Math.abs(x - G.local.x) > 40 || Math.abs(y - G.local.z) > 40) continue;
      const h = (x * 7.13 + y * 3.71) % 6.28;
      const fl = 0.75 + 0.25 * Math.sin(t * 11 + h) * Math.sin(t * 7.3 + h * 2);
      s.set(0.7 + f.i * 0.6, (0.5 + f.i * 0.9) * fl, 0.7 + f.i * 0.6);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h);
      pos.set(x + 0.5, z.heightAt(x, y), y + 0.5);
      mat.compose(pos, q, s);
      m.setMatrixAt(n++, mat);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    for (const f of this.fireLights) G.pointLight(f.x + 0.5, 0.8, f.y + 0.5, FIRE_LIGHT, 0.8 + f.t.i * 0.9 + Math.sin(t * 13 + f.x) * 0.15, 5 + f.t.i * 4);
  }

  // ================================================================= generators & breakers
  private updateGenerators(host: boolean) {
    this.running = [];
    for (const z of this.activeZones()) {
      let any = false;
      for (const o of z.objects.values()) {
        if (!objDef(o.key)?.tags?.includes('generator') || !o.state.on) continue;
        if ((o.state.fuel ?? 0) <= 0) { if (host) op('objState', { z: z.key, uid: o.uid, patch: { on: false } }); continue; }
        this.running.push({ z, x: o.x + 0.5, y: o.y + 0.5, o });
        any = true;
        if (host) {
          o.state.fuel = Math.max(0, (o.state.fuel ?? 0) - 0.12 / 150); // ~0.12 L per game hour at default speed
          if (Math.random() < 0.25) bus.emit('noise', { x: o.x + 0.5, z: o.y + 0.5, radius: 20, kind: 'machine', zone: z.key });
        }
      }
      z.extPower = any ? (x: number, y: number) => this.running.some((r) => r.z === z && Math.hypot(r.x - x, r.y - y) < 14) : null;
    }
  }
  generatorPowers(z: Zone, x: number, y: number) { return this.running.some((r) => r.z === z && Math.hypot(r.x - (x + 0.5), r.y - (y + 0.5)) < 14); }
  circuitOnGenerator(z: Zone, c: number) {
    if (!this.running.some((r) => r.z === z)) return false;
    return z.lights.some((l) => l.circuit === c && this.running.some((r) => r.z === z && Math.hypot(r.x - l.x, r.y - l.z) < 14));
  }

  generatorOptions(p: Player, o: TileObject): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    const at = (name: string, secs: number, anim: string, fn: () => void) => () => queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, name, secs, anim as any, fn), 1.4);
    const fuel = o.state.fuel ?? 0;
    const out: MenuOption[] = [];
    out.push({ label: `Fuel: ${fuel.toFixed(1)} / 10 L${o.state.on ? ' — running' : ''}`, disabled: true });
    if (o.state.on) out.push({ label: 'Turn off', action: at('Turn off', 1, 'push', () => { op('objState', { z: z.key, uid: o.uid, patch: { on: false } }); G.audio?.at?.('power_off', o.x + 0.5, o.y + 0.5, 0.6); }) });
    else out.push({ label: 'Pull the starter cord', disabled: fuel <= 0 ? 'no fuel' : false, action: at('Start generator', 2.5, 'push', () => {
      if (Math.random() < 0.3) { bus.emit('think', p, 'It coughs and dies. Again.'); G.audio?.at?.('machine_hum', o.x + 0.5, o.y + 0.5, 0.3); return; }
      op('objState', { z: z.key, uid: o.uid, patch: { on: true } });
      G.audio?.at?.('power_on', o.x + 0.5, o.y + 0.5);
    }) });
    const can = p.findItem((i) => i.fluid?.type === 'gasoline' && i.fluid.amount > 0.05);
    out.push({ label: 'Add fuel', disabled: !can ? 'needs gasoline' : fuel >= 9.9 ? 'full' : false, action: at('Refuel', 4, 'pour', () => {
      const c = p.findItem((i) => i.fluid?.type === 'gasoline' && i.fluid.amount > 0.05); if (!c || !c.fluid) return;
      const amt = Math.min(c.fluid.amount, 10 - (o.state.fuel ?? 0));
      c.fluid.amount -= amt; if (c.fluid.amount <= 0.01) c.fluid = null;
      op('objState', { z: z.key, uid: o.uid, patch: { fuel: (o.state.fuel ?? 0) + amt } });
      G.audio?.at?.('pour', o.x + 0.5, o.y + 0.5);
      bus.emit('inventoryChanged', p);
    }) });
    return out;
  }

  breakerOptions(p: Player, o: TileObject): MenuOption[] {
    if (o.state.mission) return [];
    const z = G.getZone(p.zoneKey);
    const circuits = this.panelCircuits(z, o);
    if (!circuits.length) return [{ label: 'Nothing is wired to this panel', disabled: true }];
    const anyOn = circuits.some((c) => z.circuitPowered(c));
    const grid = this.gridAlive(z);
    return [{
      label: anyOn ? 'Switch the breakers off' : 'Switch the breakers on',
      disabled: !anyOn && !grid ? 'no power from the grid' : false,
      action: () => queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, 'Breakers', 1.5, 'push', () => {
        for (const c of circuits) op('circuit', { z: z.key, c, on: !anyOn });
        G.audio?.at?.('switch', o.x + 0.5, o.y + 0.5);
      }), 1.4),
    }];
  }
  private panelCircuits(z: Zone, o: TileObject): number[] {
    if (Array.isArray(o.state.circuits)) return o.state.circuits;
    const set = new Set<number>();
    const rc = z.roomAt(o.x, o.y).circuit;
    if (rc) set.add(rc);
    if (!set.size) for (const l of z.lights) if (l.circuit && Math.hypot(l.x - o.x, l.z - o.y) < 12) set.add(l.circuit);
    return [...set];
  }
  /** grid power stays on until the sandbox shut-off day (0 = never) */
  gridAlive(z: Zone) {
    const days = G.sandbox.powerShutoffDays ?? 0;
    if (days <= 0) return true;
    return G.clock.hours / 24 < days || !!z.meta.ownPower;
  }

  // ================================================================= farming
  soilOptions(p: Player, x: number, y: number): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    if (z.objectsAt(x, y).some((o) => o.key === 'crop')) return [];
    const seeds = p.allItems().filter((i) => itemDef(i.key).seed && CROPS[itemDef(i.key).seed!]);
    if (!seeds.length) return [{ label: 'Sow seeds', disabled: 'no seeds' }];
    return [{ label: 'Sow', sub: seeds.slice(0, 8).map((s) => ({ label: itemDef(s.key).name, action: () => this.sow(p, s, x, y) })) }];
  }
  private sow(p: Player, seed: Item, x: number, y: number) {
    const z = G.getZone(p.zoneKey);
    queueAt(p, x + 0.5, y + 0.5, new UseObjectAction(p, 'Sow', 4, 'dig', () => {
      const d = itemDef(seed.key);
      if (d.uses) { seed.uses = (seed.uses ?? 1) - 1 / d.uses; if (seed.uses <= 0.001) p.removeItem(seed); }
      else p.removeItem(seed);
      op('objAdd', { z: z.key, obj: { uid: uid(), key: 'crop', x, y, rot: 0, state: { crop: d.seed, stage: 0, water: 40, planted: G.clock.hours, growth: 0 } } });
      p.body.addXp?.('farming' as any, 3);
      bus.emit('inventoryChanged', p);
    }), 1.3);
  }
  plantMode(p: Player, it: Item) {
    const x = Math.floor(p.x + Math.cos(p.facing)), y = Math.floor(p.z + Math.sin(p.facing));
    const z = G.getZone(p.zoneKey);
    if (!(z.flags[z.idx(x, y)] & TF.FURROW) && !z.floorAt(x, y)?.farmable) { bus.emit('think', p, 'I need to dig a furrow first.'); return; }
    this.sow(p, it, x, y);
  }
  farmOptions(p: Player, o: TileObject): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    const c = CROPS[o.state.crop as string];
    const at = (name: string, secs: number, anim: string, fn: () => void) => () => queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, name, secs, anim as any, fn), 1.3);
    const out: MenuOption[] = [];
    const st = Math.floor(o.state.stage ?? 0);
    const status = o.state.dead ? 'withered' : st >= 5 ? 'rotting' : st >= 4 ? 'ready to harvest' : ['seeded', 'sprouting', 'growing', 'flowering'][st];
    out.push({ label: `${c?.name ?? 'Crop'}: ${status}, water ${Math.round(o.state.water ?? 0)}%`, disabled: true });
    const water = p.findItem((i) => !!i.fluid && (i.fluid.type === 'water' || i.fluid.type === 'tainted') && i.fluid.amount > 0.2);
    if (!o.state.dead && st < 5) out.push({ label: 'Water', disabled: !water ? 'needs water' : false, action: at('Water', 3, 'pour', () => {
      const w = p.findItem((i) => !!i.fluid && (i.fluid.type === 'water' || i.fluid.type === 'tainted') && i.fluid.amount > 0.2); if (!w?.fluid) return;
      const used = Math.min(w.fluid.amount, 1); w.fluid.amount -= used; if (w.fluid.amount < 0.01) w.fluid = null;
      op('objState', { z: z.key, uid: o.uid, patch: { water: clamp((o.state.water ?? 0) + used * 70, 0, 100) } });
      G.audio?.at?.('pour', o.x + 0.5, o.y + 0.5, 0.6);
      bus.emit('inventoryChanged', p);
    }) });
    const fert = p.findTool('#fertilizer');
    if (!o.state.dead && st < 4 && fert) out.push({ label: 'Fertilize', action: at('Fertilize', 3, 'dig', () => {
      const f = p.findTool('#fertilizer'); if (!f) return;
      const d = itemDef(f.key); f.uses = (f.uses ?? 1) - 1 / (d.uses ?? 1); if (f.uses <= 0.001) p.removeItem(f);
      op('objState', { z: z.key, uid: o.uid, patch: { fert: 1 } });
    }) });
    if (st >= 4 && !o.state.dead && c) out.push({ label: 'Harvest', action: at('Harvest', 5, 'loot', () => {
      const skill = p.body.skill?.('farming' as any) ?? 0;
      const rotten = st >= 5;
      const n = Math.round(c.yield[0] + Math.random() * (c.yield[1] - c.yield[0]) * (1 + skill * 0.08) * (o.state.fert ? 1.3 : 1));
      if (!rotten && hasItemDef(c.item)) for (let i = 0; i < n; i++) p.inv.add(createItem(c.item));
      if (rotten) bus.emit('think', p, 'It\'s all gone soft.');
      else bus.emit('halo', p, `+${n} ${itemDef(c.item).name}`, 'good');
      op('objRemove', { z: z.key, uid: o.uid });
      p.body.addXp?.('farming' as any, 8);
      bus.emit('inventoryChanged', p);
    }) });
    out.push({ label: 'Pull up', danger: true, action: at('Pull up', 2, 'loot', () => op('objRemove', { z: z.key, uid: o.uid })) });
    return out;
  }
  private simCrops(h: number) {
    for (const z of this.allPopulated()) {
      const raining = z.env.weather === 'rain';
      for (const o of z.objects.values()) {
        if (o.key !== 'crop' || o.state.dead) continue;
        const c = CROPS[o.state.crop as string]; if (!c) continue;
        const outdoor = !!z.floorAt(o.x, o.y)?.outdoor;
        let water = (o.state.water ?? 0) - h * 1.1 + (raining && outdoor ? h * 25 : 0);
        water = clamp(water, 0, 100);
        let growth = o.state.growth ?? 0;
        if (water > 5) growth += h / (c.days * 24) * 4 * (o.state.fert ? 1.4 : 1) * (z.key === 'fields' ? 1.2 : 1);
        let dry = o.state.dry ?? 0;
        dry = water <= 0 ? dry + h : 0;
        const stage = Math.min(5, Math.floor(growth));
        const patch: Record<string, any> = { water, growth, dry };
        if (dry > 48) patch.dead = true;
        if (stage !== Math.floor(o.state.stage ?? 0) || patch.dead) { patch.stage = stage; op('objState', { z: z.key, uid: o.uid, patch }); }
        else Object.assign(o.state, patch);
      }
    }
  }

  // ================================================================= traps
  trapOptions(p: Player, o: TileObject): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    const at = (name: string, secs: number, fn: () => void) => () => queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, name, secs, 'loot', fn), 1.3);
    const out: MenuOption[] = [];
    if (o.state.caught) {
      out.push({ label: `Collect: ${itemDef(o.state.caught).name}`, action: at('Collect', 2, () => {
        if (hasItemDef(o.state.caught)) p.inv.add(createItem(o.state.caught));
        op('objState', { z: z.key, uid: o.uid, patch: { caught: null, armed: false, bait: null } });
        p.body.addXp?.('trapping' as any, 6);
        bus.emit('inventoryChanged', p);
      }) });
      return out;
    }
    const bait = p.findItem((i, d) => d.tags?.includes('bait') || (d.cat === 'food' && !!d.food && (d.tags?.includes('rawmeat') || d.tags?.includes('produce') || d.tags?.includes('snack'))));
    if (!o.state.bait) out.push({ label: 'Bait the trap', disabled: !bait ? 'needs bait or food' : false, action: at('Bait', 2, () => {
      const b = p.findItem((i, d) => d.tags?.includes('bait') || (d.cat === 'food' && (d.tags?.includes('rawmeat') || d.tags?.includes('produce') || d.tags?.includes('snack'))));
      if (!b) return; p.removeItem(b);
      op('objState', { z: z.key, uid: o.uid, patch: { bait: b.key } });
      bus.emit('inventoryChanged', p);
    }) });
    out.push({ label: o.state.armed ? 'Disarm' : 'Set the trap', action: at(o.state.armed ? 'Disarm' : 'Set trap', 2.5, () => op('objState', { z: z.key, uid: o.uid, patch: { armed: !o.state.armed, setAt: G.clock.hours } })) });
    return out;
  }
  private simTraps(h: number) {
    const catches: [string, number][] = [['rat_dead', 5], ['rabbit_dead', 3], ['bird_dead', 3], ['squirrel_dead', 2]];
    const valid = catches.filter(([k]) => hasItemDef(k));
    if (!valid.length) return;
    for (const z of this.allPopulated()) {
      const outdoor = z.env.sky;
      for (const o of z.objects.values()) {
        if (!o.state.armed || o.state.caught || !objDef(o.key)?.tags?.includes('trap')) continue;
        if ([...G.players.values()].some((p) => p.zoneKey === z.key && Math.hypot(p.x - o.x, p.z - o.y) < 12)) continue;
        const chance = h * (o.state.bait ? 0.08 : 0.015) * (outdoor ? 1.6 : 0.7);
        if (Math.random() < chance) {
          let tot = 0; for (const [, w] of valid) tot += w;
          let r = Math.random() * tot, k = valid[0][0];
          for (const [kk, w] of valid) { r -= w; if (r <= 0) { k = kk; break; } }
          op('objState', { z: z.key, uid: o.uid, patch: { caught: k, bait: null } });
        }
      }
    }
  }

  // ================================================================= rain, water, weather
  private simRain(h: number) {
    for (const z of this.allPopulated()) {
      if (z.env.weather !== 'rain') continue;
      for (const o of z.objects.values()) {
        const d = objDef(o.key);
        if (!d?.water || !d.tags?.includes('rain')) continue;
        if (!z.floorAt(o.x, o.y)?.outdoor && !(z.flags[z.idx(o.x, o.y)] & TF.OUTDOOR)) continue;
        const w = Math.min(d.water.capacity, (o.state.water ?? 0) + h * 6);
        if (Math.abs(w - (o.state.water ?? 0)) > 0.5) op('objState', { z: z.key, uid: o.uid, patch: { water: w } });
      }
    }
  }
  private simWater() {
    const days = G.sandbox.waterShutoffDays ?? 0;
    const off = days > 0 && G.clock.hours / 24 >= days && !G.missions?.flags?.has('pumps_on');
    for (const z of G.zones.values()) if (z.waterOn === off) z.waterOn = !off;
  }
  private simWeather() {
    for (const z of G.zones.values()) {
      if (!z.env.sky || z.meta.noWeather) continue;
      const raining = z.env.weather === 'rain';
      // rain fronts come and go; more often as the simulation frays
      const flip = raining ? 0.18 : 0.05 + G.collapse * 0.08;
      if (Math.random() < flip) op('env', { z: z.key, patch: { weather: raining ? 'none' : 'rain' } });
    }
  }
  private renderRain(dt: number) {
    const z = G.local ? G.zones.get(G.local.zoneKey) : null;
    const m = this.rainMesh;
    if (!z || z.env.weather !== 'rain') { m.count = 0; return; }
    const cx = G.pr.target.x, cz = G.pr.target.z;
    const R = 16, n = 600;
    const mat = new THREE.Matrix4();
    const t = G.time;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const sx = this.rainSeeds[i * 3], sz = this.rainSeeds[i * 3 + 1], sp = this.rainSeeds[i * 3 + 2];
      const x = cx + (sx - 0.5) * R * 2, zz = cz + (sz - 0.5) * R * 2;
      const tx = Math.floor(x), ty = Math.floor(zz);
      if (!z.inb(tx, ty)) continue;
      const f = z.floorAt(tx, ty);
      if (!f?.outdoor && !(z.flags[z.idx(tx, ty)] & TF.OUTDOOR)) continue;
      const y = 6 - ((t * (9 + sp * 3) + sp * 6) % 6);
      mat.makeTranslation(x, y, zz);
      m.setMatrixAt(k++, mat);
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    void dt;
  }

  // ================================================================= pushing carts
  togglePush(p: Player, o: TileObject) {
    const cur = this.pushing.get(p.id);
    if (cur === o.uid) { this.pushing.delete(p.id); o.state.pushedBy = null; this.settle(p, o); return; }
    if (Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.z) > 1.8) { queueAt(p, o.x + 0.5, o.y + 0.5, new UseObjectAction(p, 'Grab', 0.4, 'push', () => this.togglePush(p, o)), 1.4); return; }
    this.pushing.set(p.id, o.uid);
    o.state.pushedBy = p.id;
    G.audio?.at?.('metal_clank', o.x + 0.5, o.y + 0.5, 0.4);
  }
  /** is this player pushing something (movement code slows them) */
  pushingOf(p: Player) { return this.pushing.has(p.id); }
  private updatePushing(dt: number) {
    this.pushT += dt;
    for (const [pid, ouid] of this.pushing) {
      const p = G.players.get(pid); if (!p) { this.pushing.delete(pid); continue; }
      const z = G.zones.get(p.zoneKey); const o = z?.objects.get(ouid);
      if (!z || !o || p.body.dead || p.actions.current) { this.pushing.delete(pid); if (o) o.state.pushedBy = null; continue; }
      // the cart rides ~0.8 m in front of the player, offsets kept inside its tile
      const fx = p.x + Math.cos(p.facing) * 0.85, fz = p.z + Math.sin(p.facing) * 0.85;
      const tx = Math.floor(fx), ty = Math.floor(fz);
      const blocked = !z.inb(tx, ty) || !z.floor[z.idx(tx, ty)] || (tx !== o.x || ty !== o.y) && z.objectsAt(tx, ty).some((q) => q !== o && (objDef(q.key)?.block ?? 'solid') !== 'none');
      if (!blocked && (tx !== o.x || ty !== o.y)) {
        z.removeObject(o); o.x = tx; o.y = ty; z.addObject(o);
      }
      if (!blocked) { o.ox = clamp(fx - (o.x + 0.5), -0.45, 0.45); o.oz = clamp(fz - (o.y + 0.5), -0.45, 0.45); }
      o.state.yaw = Math.PI / 2 - p.facing - (o.rot * Math.PI) / 2;
      if (p.speed > 0.3 && Math.random() < dt * 3) G.audio?.at?.('chair_squeak', o.x + 0.5, o.y + 0.5, 0.25);
      if (this.pushT > 0.5 && p.isLocal && G.role !== 'solo') op('objMove', { z: z.key, uid: o.uid, x: o.x, y: o.y, rot: o.rot });
    }
    if (this.pushT > 0.5) this.pushT = 0;
  }
  private settle(p: Player, o: TileObject) {
    const z = G.getZone(p.zoneKey);
    op('objMove', { z: z.key, uid: o.uid, x: o.x, y: o.y, rot: o.rot });
    op('objState', { z: z.key, uid: o.uid, patch: { yaw: o.state.yaw ?? 0, pushedBy: null } });
  }

  // ================================================================= furniture: pick up & place
  pickupFurniture(p: Player, o: TileObject) {
    const z = G.getZone(p.zoneKey);
    const d = objDef(o.key); if (!d) return;
    if (o.inv?.items.length) { bus.emit('think', p, 'I should empty it first.'); return; }
    const it = createItem('furniture');
    it.name = d.name;
    it.data = { obj: o.key, state: { ...o.state, pushedBy: null }, weight: d.movable ?? 10 };
    op('objRemove', { z: z.key, uid: o.uid });
    p.inv.add(it);
    if (!p.handR) p.equip(it, 'R');
    G.audio?.at?.('thud_soft', o.x + 0.5, o.y + 0.5, 0.6);
    bus.emit('inventoryChanged', p);
  }

  /** enter placement mode for an item that becomes furniture (kits, traps, carried furniture) */
  startPlacing(p: Player, it: Item) {
    const key = it.key === 'furniture' ? it.data?.obj : itemDef(it.key).place;
    if (!key || !objDef(key)) { bus.emit('think', p, 'I can\'t place that here.'); return; }
    this.cancelPlacing();
    this.placing = { p, it, key, rot: 0, ghost: null, x: -1, y: -1, ok: false };
    G.ui?.toast?.('PLACE: ' + objDef(key)!.name.toUpperCase(), 'click to place · R rotate · right-click cancel', 3);
  }
  cancelPlacing() {
    if (this.placing?.ghost) { G.pr.scene.remove(this.placing.ghost); this.placing.ghost.geometry.dispose(); }
    this.placing = null;
  }
  private updatePlacing() {
    const pl = this.placing; if (!pl) return;
    const z = G.getZone(pl.p.zoneKey);
    if (G.input.hit('rotate')) { pl.rot = ((pl.rot + 1) % 4) as 0 | 1 | 2 | 3; if (pl.ghost) { G.pr.scene.remove(pl.ghost); pl.ghost = null; } }
    if (G.input.hit('pause')) { this.cancelPlacing(); return; }
    const t = pick(G.input.mouseX, G.input.mouseY);
    if (!t) return;
    const x = Math.floor(t.point.x), y = Math.floor(t.point.z);
    const d = objDef(pl.key)!;
    const fake: TileObject = { uid: -1, key: pl.key, x, y, rot: pl.rot, state: { ...(pl.it.data?.state || {}) } };
    if (!pl.ghost) {
      const g = objectGeometry(d, fake);
      if (!g) return;
      pl.ghost = new THREE.Mesh(g, worldMaterial({ transparent: true, opacity: 0.55, outline: 0, noGrid: true }));
      pl.ghost.matrixAutoUpdate = false;
      G.pr.scene.add(pl.ghost);
    }
    pl.x = x; pl.y = y;
    pl.ok = this.canPlace(z, pl.p, d, x, y, pl.rot);
    pl.ghost.matrix.copy(objectMatrix(z, fake, d));
    pl.ghost.matrixWorldNeedsUpdate = true;
    (pl.ghost.material as THREE.MeshLambertMaterial).color.setHex(pl.ok ? 0x9cff8a : 0xff6a5a);
  }
  private canPlace(z: Zone, p: Player, d: any, x: number, y: number, rot: number, building = false) {
    const w = d.w ?? 1, dd = d.d ?? 1;
    const rw = rot % 2 === 0 ? w : dd, rd = rot % 2 === 0 ? dd : w;
    if (!building && Math.hypot(x + rw / 2 - p.x, y + rd / 2 - p.z) > 4) return false;
    for (let j = 0; j < rd; j++) for (let i = 0; i < rw; i++) {
      const X = x + i, Y = y + j;
      if (!z.inb(X, Y) || !z.floor[z.idx(X, Y)]) return false;
      if (z.flags[z.idx(X, Y)] & TF.NOBUILD) return false;
      if (z.objectsAt(X, Y).some((o) => !objDef(o.key)?.ceiling)) return false;
      if (i > 0 && z.wallW[z.idx(X, Y)]) return false;
      if (j > 0 && z.wallN[z.idx(X, Y)]) return false;
      if (!building && Math.floor(p.x) === X && Math.floor(p.z) === Y && (d.block ?? 'solid') !== 'none') return false;
    }
    return true;
  }
  /** called by the world click handler while placing; returns true if consumed */
  placementClick(button: number): boolean {
    const pl = this.placing; if (!pl) return false;
    if (button === 2) { this.cancelPlacing(); return true; }
    if (!pl.ok) { G.audio?.ui?.('dryfire'); return true; }
    const { p, it, key, x, y, rot } = pl;
    const z = G.getZone(p.zoneKey);
    const state = { ...(it.data?.state || {}) };
    this.cancelPlacing();
    queueAt(p, x + 0.5, y + 0.5, new UseObjectAction(p, 'Place', 1.5, 'pickup', () => {
      if (!p.containerOf(it)) return;
      p.removeItem(it);
      op('objAdd', { z: z.key, obj: { uid: uid(), key, x, y, rot, state } });
      G.audio?.at?.('thud_soft', x + 0.5, y + 0.5, 0.5);
      bus.emit('inventoryChanged', p);
    }), 2.2);
    return true;
  }

  // ================================================================= building
  buildOptions(p: Player, x: number, y: number): MenuOption[] {
    const z = G.getZone(p.zoneKey);
    if (z.flags[z.idx(x, y)] & TF.NOBUILD) return [];
    const out: MenuOption[] = [];
    const carp = p.body.skill?.('carpentry' as any) ?? 0;
    for (const b of BUILD) {
      if (b.obj && !objDef(b.obj)) continue;
      const missingTool = b.tools.find((t) => !p.findTool(t));
      const missingMat = b.mats.find(([k, n]) => this.countOf(p, k) < n);
      let disabled: string | false = false;
      if (b.skill && carp < b.skill) disabled = `carpentry ${b.skill}`;
      else if (missingTool) disabled = `needs ${missingTool.replace('#', '')}`;
      else if (missingMat) disabled = `needs ${missingMat[1]}× ${itemDef(missingMat[0]).name}`;
      else if (b.obj && !this.canPlace(z, p, objDef(b.obj), x, y, 0, true)) disabled = 'no room';
      else if (b.edge) {
        const side = b.key.endsWith('_n') ? 0 : 1;
        if (side === 0 ? z.wallN[z.idx(x, y)] : z.wallW[z.idx(x, y)]) disabled = 'already a wall';
      }
      out.push({ label: b.label, disabled, action: () => this.build(p, b, x, y) });
    }
    return out;
  }
  private countOf(p: Player, key: string): number {
    let n = 0;
    for (const it of p.allItems()) {
      if (it.key !== key) continue;
      const d = itemDef(it.key);
      n += d.uses ? Math.floor((it.uses ?? 1) * d.uses + 1e-6) : 1;
    }
    return n;
  }
  private takeMats(p: Player, mats: [string, number][]) {
    for (const [key, n] of mats) {
      let left = n;
      for (const it of p.allItems()) {
        if (left <= 0) break;
        if (it.key !== key) continue;
        const d = itemDef(key);
        if (d.uses) {
          const have = Math.floor((it.uses ?? 1) * d.uses + 1e-6);
          const use = Math.min(have, left);
          it.uses = (it.uses ?? 1) - use / d.uses; left -= use;
          if (it.uses <= 0.001) p.removeItem(it);
        } else { p.removeItem(it); left--; }
      }
    }
  }
  private build(p: Player, b: Buildable, x: number, y: number) {
    const z = G.getZone(p.zoneKey);
    let hit = 0;
    queueAt(p, x + 0.5, y + 0.5, new UseObjectAction(p, b.label, b.secs * (1 - Math.min(0.4, (p.body.skill?.('carpentry' as any) ?? 0) * 0.05)), b.tools.includes('#hammer') ? 'hammer' : 'craft', () => {
      if (b.mats.some(([k, n]) => this.countOf(p, k) < n)) { bus.emit('think', p, 'I\'m missing materials.'); return; }
      this.takeMats(p, b.mats);
      if (b.wall) op('wall', { z: z.key, x, y, side: b.key.endsWith('_n') ? 0 : 1, wall: wallId(b.wall) });
      else if (b.obj) op('objAdd', { z: z.key, obj: { uid: uid(), key: b.obj, x, y, rot: 0, state: {} } });
      p.body.addXp?.('carpentry' as any, 6);
      bus.emit('inventoryChanged', p);
      bus.emit('noise', { x: x + 0.5, z: y + 0.5, radius: 22, kind: 'build', zone: z.key, by: p.id });
    }, (dt) => { hit -= dt; if (hit <= 0 && b.tools.includes('#hammer')) { hit = 0.65; G.audio?.at?.('hammer', x + 0.5, y + 0.5, 0.8); bus.emit('noise', { x: x + 0.5, z: y + 0.5, radius: 18, kind: 'build', zone: z.key, by: p.id }); } }), 1.5);
  }

  // ================================================================= vehicles (hooked by the vehicle system when present)
  nearbyTrunks(p: Player) { return (G as any).vehicles?.nearbyTrunks?.(p) || []; }
  vehicleContainer(ref: string) { return (G as any).vehicles?.container?.(ref) ?? null; }

  // ================================================================= helpers
  private activeZones(): Zone[] {
    const out = new Set<Zone>();
    for (const p of G.players.values()) { const z = G.zones.get(p.zoneKey); if (z) out.add(z); }
    return [...out];
  }
  /** zones that exist (generated) — crops and traps grow even when nobody is there */
  private allPopulated(): Zone[] { return [...G.zones.values()]; }

}

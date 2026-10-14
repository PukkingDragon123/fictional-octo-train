// Vehicles: low-poly cars that can be found, unlocked or hotwired, fuelled,
// driven, crashed and looted. Arcade bicycle-model handling with multi-circle
// collision against the tile world; the driver's machine simulates the car
// and streams its pose, discrete changes go through ops.
import * as THREE from 'three';
import { bus } from '../core/events';
import { G } from '../game/G';
import { defOp, op } from '../game/ops';
import { clamp, damp } from '../core/math';
import { Rng, hash3, hashStr, beginGenUids, endGenUids } from '../core/rng';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { atlas } from '../gfx/atlas';
import { addTextureModule } from '../gfx/textures/index';
import { makeRamp, ph } from '../gfx/pixel';
import { Container } from '../items/container';
import { serializeContainer, deserializeContainer, createItem } from '../items/factory';
import { itemDef } from '../items/item';
import { resolve } from '../world/collision';
import { dropItem } from '../items/worldItems';
import { defSound, defLoopSound, kit } from '../audio/sounds';
import { Buf, noise, osc, lowpass, bandpass, decay, adsr, perc, rnd } from '../audio/synth';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import type { GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import type { Zone } from '../world/zone';
import type { MenuOption } from '../ui/ui';

// ---------------------------------------------------------------- textures
addTextureModule(() => {
  const A = atlas();
  A.add('v_paint', 32, 32, (pc) => {
    const R = makeRamp(0xd8d8d4, 5, { spread: 0.18 });
    pc.fillRamp(R, (x, y) => 0.55 + (ph(x, y, 3) - 0.5) * 0.06 + (y % 16 === 0 ? -0.05 : 0), 0.4);
  });
  A.add('v_rust', 32, 32, (pc, rng) => {
    const R = makeRamp(0xd8d8d4, 5, { spread: 0.18 });
    pc.fillRamp(R, (x, y) => 0.55 + (ph(x, y, 3) - 0.5) * 0.06, 0.4);
    for (let i = 0; i < 40; i++) { const x = rng.int(0, 31), y = rng.int(20, 31); pc.blend(x, y, 0x7a3a1a, 0.7); pc.blend(x + 1, y, 0x9a5a2a, 0.5); }
  });
  A.add('v_glass', 32, 16, (pc) => {
    const R = makeRamp(0x2a3440, 5, { spread: 0.4 });
    pc.fillRamp(R, (x, y) => 0.4 + y * 0.02 + (((x + y * 0.6) % 14) < 2 ? 0.35 : 0), 0.3);
  });
  A.add('v_tire', 16, 16, (pc) => {
    const R = makeRamp(0x1c1c1c, 4, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => ((x + y) % 4 < 2 ? 0.6 : 0.3), 0);
  });
  A.add('v_rim', 16, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x1c1c1c);
    pc.circle(7.5, 7.5, 6.5, 0x9a9a98); pc.circle(7.5, 7.5, 4.5, 0x6a6a68); pc.circle(7.5, 7.5, 1.5, 0xc8c8c4);
  });
  A.add('v_grille', 24, 8, (pc) => { pc.fill(0x1a1a1a); for (let x = 1; x < 24; x += 2) pc.vline(x, 1, 6, 0x5a5a58); pc.strokeRect(0, 0, 24, 8, 0x9a9a98); });
  A.add('v_head', 8, 6, (pc) => { pc.fill(0xf8f4d8); pc.strokeRect(0, 0, 8, 6, 0x8a8a84); pc.set(2, 2, 0xffffff); });
  A.add('v_tail', 8, 6, (pc) => { pc.fill(0xc02018); pc.strokeRect(0, 0, 8, 6, 0x5a1010); pc.set(2, 2, 0xff6050); });
  A.add('v_plate', 20, 8, (pc) => {
    pc.wrap = false; pc.fill(0xe8e2c8); pc.strokeRect(0, 0, 20, 8, 0x2a2a6a);
    for (const [x, w] of [[2, 3], [6, 3], [10, 1], [12, 3], [16, 2]] as const) pc.rect(x, 3, w, 3, 0x1a1a3a);
  });
  A.add('v_interior', 16, 16, (pc) => { const R = makeRamp(0x3a342c, 4); pc.fillRamp(R, (x, y) => 0.5 + (ph(x, y, 7) - 0.5) * 0.2, 0.5); });
});

// ---------------------------------------------------------------- sounds
defLoopSound('engine_loop', () => {
  const len = 2;
  const b = new Buf(len);
  const ph0 = osc(len, 'saw', 42); lowpass(ph0, 420);
  b.mix(ph0, 0, 0.6);
  const n = noise(len, 'brown'); lowpass(n, 300); b.mix(n, 0, 0.6);
  for (let i = 0; i < b.n; i++) b.d[i] *= 0.65 + 0.35 * Math.sin(i / 44100 * Math.PI * 2 * 21);
  return b.normalize(0.5);
});
defSound('engine_crank', () => { const b = new Buf(1.4); for (let i = 0; i < 9; i++) b.mix(kit.thump(0.12, 120, 50, 22), i * 0.12, 0.6 + i * 0.03); const e = osc(0.6, 'saw', (t) => 30 + t * 40); lowpass(e, 400); e.env(adsr(0.05, 0.1, 0.8, 0.2, 0.6)); b.mix(e, 0.9, 0.7); return b.normalize(0.6); });
defSound('engine_fail', () => { const b = new Buf(1.3); for (let i = 0; i < 8; i++) b.mix(kit.thump(0.12, 110 - i * 4, 45, 22), i * 0.15, 0.6 - i * 0.05); return b.normalize(0.5); });
defSound('horn', () => { const b = osc(0.8, 'square', 420); b.mix(osc(0.8, 'square', 505), 0, 0.8); lowpass(b, 1800); b.env(adsr(0.01, 0.05, 0.9, 0.08, 0.8)); return b.normalize(0.55); });
defSound('crash', () => { const b = new Buf(1.2); b.mix(kit.thump(0.5, 160, 40, 6), 0, 1); b.mix(kit.burst(0.3, 'white', 7000, 400, 14), 0, 0.7); for (let i = 0; i < 12; i++) b.mix(kit.burst(0.05, 'white', 9000, 3000, 80), 0.05 + rnd() * 0.5, 0.3); return b.drive(2).normalize(0.8); });
defSound('tire_screech', () => { const b = noise(0.9, 'white'); bandpass(b, (t) => 1800 + Math.sin(t * 40) * 300, 6); b.env(adsr(0.03, 0.1, 0.8, 0.3, 0.9)); return b.normalize(0.4); });
defSound('car_door', () => { const b = kit.thump(0.25, 140, 60, 18); b.mix(kit.burst(0.06, 'pink', 3000, 300, 60), 0, 0.4); return b.normalize(0.5); });
defSound('car_lock', () => { const b = osc(0.08, 'square', 1800).env(perc(0.002, 30)); b.mix(osc(0.08, 'square', 2400).env(perc(0.002, 30)), 0.12, 1); return b.normalize(0.35); });
void decay;

// ---------------------------------------------------------------- types
interface VType {
  key: string; name: string; len: number; wid: number; hgt: number; wheelbase: number;
  maxSpeed: number; accel: number; seats: number; trunk: number; fuelCap: number; colors: number[];
  shape: 'sedan' | 'hatch' | 'van' | 'pickup';
}
const TYPES: Record<string, VType> = {
  sedan: { key: 'sedan', name: 'Sedan', len: 4.3, wid: 1.75, hgt: 1.4, wheelbase: 2.6, maxSpeed: 15, accel: 4.2, seats: 4, trunk: 50, fuelCap: 50, shape: 'sedan', colors: [0x8a2a24, 0x2a4a6a, 0xd8d4c8, 0x3a5a3a, 0x6a6a6a, 0xb89a5a] },
  hatch: { key: 'hatch', name: 'Hatchback', len: 3.7, wid: 1.65, hgt: 1.4, wheelbase: 2.4, maxSpeed: 13, accel: 4.6, seats: 4, trunk: 30, fuelCap: 40, shape: 'hatch', colors: [0xc8a03a, 0x5a8aa8, 0xa83a5a, 0xe8e4dc, 0x4a4a52] },
  van: { key: 'van', name: 'Van', len: 4.8, wid: 1.9, hgt: 2.0, wheelbase: 3.0, maxSpeed: 12, accel: 3.0, seats: 2, trunk: 120, fuelCap: 70, shape: 'van', colors: [0xe8e4dc, 0x6a6a5a, 0x2a3a5a, 0x7a2a22] },
  pickup: { key: 'pickup', name: 'Pickup Truck', len: 4.9, wid: 1.85, hgt: 1.7, wheelbase: 3.1, maxSpeed: 14, accel: 3.6, seats: 2, trunk: 80, fuelCap: 65, shape: 'pickup', colors: [0x5a2a1a, 0x2a3a2a, 0x8a8a84, 0x1a2a4a, 0xa8822a] },
};

export interface VehicleState {
  id: string; type: string; zone: string; x: number; z: number; yaw: number; color: number;
  fuel: number; battery: number; engine: number; locked: boolean; keyId: string; hotwired: boolean;
  running: boolean; lights: boolean; seats: (string | null)[]; windows: number;
}

export class Vehicle implements VehicleState {
  id = ''; type = 'sedan'; zone = ''; x = 0; z = 0; yaw = 0; color = 0xffffff;
  fuel = 0; battery = 1; engine = 1; locked = true; keyId = ''; hotwired = false;
  running = false; lights = false; seats: (string | null)[] = []; windows = 0;
  speed = 0; steer = 0; wheelRot = 0;
  trunk!: Container; glove!: Container;
  mesh: THREE.Group | null = null;
  wheels: THREE.Object3D[] = [];
  lightsOn: THREE.Mesh | null = null;
  net?: { x: number; z: number; yaw: number; t: number };
  get def() { return TYPES[this.type] || TYPES.sedan; }
  get name() { return this.def.name; }
  get fwd() { return { x: Math.cos(this.yaw), z: Math.sin(this.yaw) }; }
  state(): VehicleState {
    const { id, type, zone, x, z, yaw, color, fuel, battery, engine, locked, keyId, hotwired, running, lights, seats, windows } = this;
    return { id, type, zone, x, z, yaw, color, fuel, battery, engine, locked, keyId, hotwired, running, lights, seats: [...seats], windows };
  }
}

const sys = () => (G as any).vehicles as VehicleSystem;

// discrete changes (seats, locks, fuel, engine, final parking pose)
defOp('veh', (a: { id: string; patch: Partial<VehicleState> }) => {
  const v = sys()?.vehicles.get(a.id); if (!v) return;
  Object.assign(v, a.patch);
  if (a.patch.seats) sys().onSeats(v);
  if (a.patch.type || a.patch.color) sys().rebuild(v);
});
defOp('vehSeat', (a: { id: string; seat: number; pid: string | null }) => {
  const v = sys()?.vehicles.get(a.id); if (!v) return;
  if (a.pid && v.seats.includes(a.pid)) v.seats[v.seats.indexOf(a.pid)] = null;
  if (a.pid === null) { v.seats = v.seats.map((s, i) => (i === a.seat ? null : s)); }
  else if (!v.seats[a.seat]) v.seats[a.seat] = a.pid;
  sys().onSeats(v);
});

export class VehicleSystem implements GameSystem {
  name = 'vehicles';
  vehicles = new Map<string, Vehicle>();
  private mat = worldMaterial({});
  private sendT = 0;
  private noiseT = 0;
  private beams: THREE.SpotLight[] = [];

  constructor() {
    (G as any).vehicles = this;
    bus.on('zoneGenerated', (z: Zone) => this.spawnFor(z));
    for (const z of G.zones.values()) this.spawnFor(z);
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(0xfff0c8, 0, 22, 0.42, 0.6, 1.2);
      G.pr.scene.add(s); G.pr.scene.add(s.target);
      this.beams.push(s);
    }
  }

  // ---------------------------------------------------------------- spawning
  /** zones list parked vehicles in meta.vehicleSpawns: [{x, y, rot, type?, chance?}] */
  spawnFor(z: Zone) {
    const list = (z.meta.vehicleSpawns as any[]) || [];
    if (!list.length) return;
    // deterministic ids on every peer, whatever order zones were generated in
    beginGenUids(2 ** 37 + (hashStr(z.key) % 100000) * 4096);
    try { list.forEach((s, i) => {
      const id = `v:${z.key}:${i}`;
      if (this.vehicles.has(id)) return;
      const rng = new Rng(hash3(z.seed, hashStr(id), 91));
      if (rng.next() > (s.chance ?? 0.8)) return;
      const t = TYPES[s.type] || TYPES[rng.pick(['sedan', 'sedan', 'hatch', 'van', 'pickup'])];
      const v = new Vehicle();
      v.id = id; v.type = t.key; v.zone = z.key;
      v.x = s.x + 0.5; v.z = s.y + 0.5;
      v.yaw = typeof s.rot === 'number' && s.rot > 3.5 ? s.rot : ((s.rot ?? 0) * Math.PI) / 2;
      v.color = rng.pick(t.colors);
      v.fuel = rng.chance(0.3) ? 0 : rng.float(0.05, 0.6) * t.fuelCap;
      v.battery = rng.chance(0.25) ? 0 : rng.float(0.3, 1);
      v.engine = rng.float(0.35, 1);
      v.locked = rng.chance(0.7);
      v.keyId = 'car:' + id;
      v.seats = new Array(t.seats).fill(null);
      v.windows = rng.chance(0.15) ? 1 : 0;
      const cu = -(1000 + (hashStr(id) % 1000000)) * 2;
      v.trunk = new Container(cu, t.name + ' Trunk', 'trunk', t.trunk);
      v.trunk.loot = 'car_trunk'; v.trunk.owner = `veh:${id}:trunk`;
      v.glove = new Container(cu - 1, 'Glovebox', 'box', 4);
      v.glove.loot = 'car_glovebox'; v.glove.owner = `veh:${id}:glove`;
      // the key is somewhere: in the glovebox, on the floor nearby, or lost
      const kr = rng.next();
      if (kr < 0.3) { const k = createItem('car_key', rng); k.data = { keyId: v.keyId }; k.name = `${t.name} Key`; v.glove.lootDone = false; (v as any).pendingKey = k; }
      else if (kr < 0.5) z.meta.carKeys = [...(z.meta.carKeys || []), { x: s.x + rng.int(-6, 6), y: s.y + rng.int(-6, 6), keyId: v.keyId, name: `${t.name} Key` }];
      this.vehicles.set(id, v);
    }); } finally { endGenUids(); }
    for (const k of (z.meta.carKeys as any[]) || []) {
      if (k.spawned) continue;
      k.spawned = true;
      beginGenUids(2 ** 37 + (hashStr(z.key + k.keyId) % 100000) * 4096 + 2048);
      try { const it = createItem('car_key'); it.data = { keyId: k.keyId }; it.name = k.name; const [x, y] = G.nearestWalkable(z, k.x, k.y); dropItem(z, it, x + 0.5, y + 0.5); } finally { endGenUids(); }
    }
  }

  list(): Vehicle[] { const zk = G.local?.zoneKey; return [...this.vehicles.values()].filter((v) => v.zone === zk); }

  container(ref: string): Container | null {
    const [, id, which] = ref.match(/^veh:(.+):(trunk|glove)$/) || [];
    const v = this.vehicles.get(id); if (!v) return null;
    const c = which === 'trunk' ? v.trunk : v.glove;
    if (!c.lootDone && (v as any).pendingKey && which === 'glove') { c.add((v as any).pendingKey); (v as any).pendingKey = null; }
    return c;
  }
  nearbyTrunks(p: Player): { c: Container; name: string }[] {
    const out: { c: Container; name: string }[] = [];
    for (const v of this.list()) {
      if (p.inVehicle === v.id) { out.push({ c: this.container(`veh:${v.id}:glove`)!, name: 'Glovebox' }); continue; }
      const f = v.fwd, half = v.def.len / 2;
      const rx = v.x - f.x * (half + 0.4), rz = v.z - f.z * (half + 0.4);
      if (Math.hypot(rx - p.x, rz - p.z) < 1.4 && !v.locked) out.push({ c: this.container(`veh:${v.id}:trunk`)!, name: `${v.name} trunk` });
    }
    return out;
  }

  // ---------------------------------------------------------------- interaction
  private hasKey(p: Player, v: Vehicle) { return !!p.findItem((i) => i.data?.keyId === v.keyId); }
  seatOf(p: Player): { v: Vehicle; seat: number } | null {
    if (!p.inVehicle) return null;
    const v = this.vehicles.get(p.inVehicle); if (!v) return null;
    return { v, seat: v.seats.indexOf(p.id) };
  }
  menuOptions(p: Player, v: Vehicle): MenuOption[] {
    const out: MenuOption[] = [];
    const at = (name: string, secs: number, anim: string, fn: () => void, tick?: (dt: number) => void) => () => queueAt(p, v.x, v.z, new UseObjectAction(p, name, secs, anim as any, fn, tick), v.def.wid / 2 + 1.1);
    const key = this.hasKey(p, v);
    const free = v.seats.findIndex((s) => !s);
    if (p.inVehicle === v.id) { out.push({ label: 'Get out', action: () => this.exit(p) }); return out; }
    if (v.locked) {
      out.push({ label: 'Unlock', disabled: key ? false : 'no key', action: at('Unlock', 0.6, 'hold_item', () => { op('veh', { id: v.id, patch: { locked: false } }); G.audio?.at?.('car_lock', v.x, v.z); }) });
      out.push({ label: 'Smash a window', danger: true, action: at('Smash window', 2, 'swing', () => { op('veh', { id: v.id, patch: { locked: false, windows: 1 } }); G.audio?.at?.('glass_break', v.x, v.z); bus.emit('noise', { x: v.x, z: v.z, radius: 22, kind: 'glass', zone: v.zone, by: p.id }); }) });
    } else {
      out.push({ label: 'Get in (driver)', disabled: v.seats[0] ? 'occupied' : false, action: at('Get in', 0.8, 'hold_item', () => this.enter(p, v, 0)) });
      if (v.def.seats > 1) out.push({ label: 'Get in (passenger)', disabled: free < 0 || v.seats.slice(1).every((s) => s) ? 'full' : false, action: at('Get in', 0.8, 'hold_item', () => this.enter(p, v, v.seats.findIndex((s, i) => i > 0 && !s))) });
      out.push({ label: 'Open the trunk', action: () => { const c = this.container(`veh:${v.id}:trunk`); if (c) { G.ui?.inventory?.toggle?.(true); G.ui?.inventory?.focus?.(c); } } });
      if (key) out.push({ label: 'Lock', action: at('Lock', 0.6, 'hold_item', () => { op('veh', { id: v.id, patch: { locked: true } }); G.audio?.at?.('car_lock', v.x, v.z); }) });
    }
    const can = p.findItem((i) => i.fluid?.type === 'gasoline' && i.fluid.amount > 0.05);
    out.push({ label: `Refuel (${v.fuel.toFixed(1)} / ${v.def.fuelCap} L)`, disabled: !can ? 'needs gasoline' : v.fuel >= v.def.fuelCap - 0.5 ? 'full' : false, action: at('Refuel', 5, 'pour', () => {
      const c = p.findItem((i) => i.fluid?.type === 'gasoline' && i.fluid.amount > 0.05); if (!c?.fluid) return;
      const amt = Math.min(c.fluid.amount, v.def.fuelCap - v.fuel);
      c.fluid.amount -= amt; if (c.fluid.amount < 0.01) c.fluid = null;
      op('veh', { id: v.id, patch: { fuel: v.fuel + amt } });
      G.audio?.at?.('pour', v.x, v.z); bus.emit('inventoryChanged', p);
    }) });
    out.push({ label: 'Look under the hood', action: at('Inspect engine', 3, 'loot', () => {
      const m = p.body.skill('mechanics' as any);
      const eng = m >= 2 ? `${Math.round(v.engine * 100)}%` : v.engine > 0.6 ? 'looks fine' : v.engine > 0.3 ? 'tired' : 'in a bad way';
      bus.emit('think', p, `Engine ${eng}. Battery ${v.battery > 0.05 ? (m >= 1 ? Math.round(v.battery * 100) + '%' : 'has charge') : 'dead'}. Fuel ${v.fuel < 0.5 ? 'empty' : Math.round(v.fuel) + ' L'}.`);
    }) });
    const scrap = p.findItem((i) => i.key === 'electronics_scrap' || i.key === 'scrap_metal' || i.key === 'sheet_metal');
    const wrench = p.findTool('#wrench');
    if (v.engine < 0.95) out.push({ label: 'Repair the engine', disabled: !wrench ? 'needs a wrench' : !scrap ? 'needs scrap parts' : false, action: at('Repair engine', 20, 'craft', () => {
      const s = p.findItem((i) => i.key === 'electronics_scrap' || i.key === 'scrap_metal' || i.key === 'sheet_metal'); if (!s) return;
      p.removeItem(s);
      op('veh', { id: v.id, patch: { engine: Math.min(1, v.engine + 0.15 + p.body.skill('mechanics' as any) * 0.05) } });
      p.body.addXp('mechanics' as any, 8); bus.emit('inventoryChanged', p);
    }) });
    const bat = p.findItem((i) => i.key === 'car_battery' && (i.uses ?? 1) > 0.2);
    if (v.battery < 0.3 && bat) out.push({ label: 'Swap in a car battery', action: at('Swap battery', 12, 'craft', () => {
      const b = p.findItem((i) => i.key === 'car_battery'); if (!b) return;
      const charge = b.uses ?? 1; p.removeItem(b);
      op('veh', { id: v.id, patch: { battery: charge } }); bus.emit('inventoryChanged', p);
    }) });
    return out;
  }

  enter(p: Player, v: Vehicle, seat: number) {
    if (v.locked || seat < 0) return;
    op('vehSeat', { id: v.id, seat, pid: p.id });
    G.audio?.at?.('car_door', v.x, v.z);
  }
  exit(p: Player) {
    const s = this.seatOf(p); if (!s) { p.inVehicle = null; return; }
    const { v, seat } = s;
    if (seat === 0) { v.speed = 0; op('veh', { id: v.id, patch: { x: v.x, z: v.z, yaw: v.yaw, running: false } }); }
    op('vehSeat', { id: v.id, seat, pid: null });
    p.inVehicle = null;
    // step out beside the door
    const side = { x: -Math.sin(v.yaw), z: Math.cos(v.yaw) };
    const sx = seat % 2 === 0 ? -1 : 1;
    const z = G.getZone(p.zoneKey);
    const [tx, ty] = G.nearestWalkable(z, Math.floor(v.x + side.x * sx * (v.def.wid / 2 + 0.6)), Math.floor(v.z + side.z * sx * (v.def.wid / 2 + 0.6)));
    p.x = tx + 0.5; p.z = ty + 0.5;
    G.audio?.at?.('car_door', v.x, v.z);
  }
  /** seats changed: sync the local player's state */
  onSeats(v: Vehicle) {
    const me = G.local; if (!me) return;
    if (v.seats.includes(me.id)) { me.inVehicle = v.id; me.actions.clear(); }
    else if (me.inVehicle === v.id) me.inVehicle = null;
  }

  private tryStart(v: Vehicle, p: Player) {
    if (v.running) { op('veh', { id: v.id, patch: { running: false } }); return; }
    const key = this.hasKey(p, v) || v.hotwired;
    if (!key) {
      const can = p.body.skill('electrical' as any) >= 1 && p.body.skill('mechanics' as any) >= 1 || p.occupation === 'mechanic' || p.occupation === 'electrician';
      if (!can) { bus.emit('think', p, 'No key. I don\'t know how to hotwire it.'); return; }
      bus.emit('think', p, 'Pulling the panel off the column...');
      p.actions.add(new UseObjectAction(p, 'Hotwire', 9, 'craft', () => {
        if (Math.random() < 0.35 - p.body.skill('electrical' as any) * 0.05) { bus.emit('think', p, 'Sparks. Nothing.'); return; }
        op('veh', { id: v.id, patch: { hotwired: true } }); bus.emit('think', p, 'Got it.');
        p.body.addXp('electrical' as any, 6);
      }));
      return;
    }
    if (v.battery < 0.05) { G.audio?.at?.('switch', v.x, v.z); bus.emit('think', p, 'Click. The battery is dead.'); return; }
    if (v.fuel <= 0.05 || v.engine < 0.08 || Math.random() > 0.35 + v.engine * 0.7) {
      G.audio?.at?.('engine_fail', v.x, v.z); op('veh', { id: v.id, patch: { battery: Math.max(0, v.battery - 0.06) } });
      if (v.fuel <= 0.05) bus.emit('think', p, 'It turns over but there\'s no fuel.');
      bus.emit('noise', { x: v.x, z: v.z, radius: 18, kind: 'engine', zone: v.zone, by: p.id });
      return;
    }
    G.audio?.at?.('engine_crank', v.x, v.z);
    op('veh', { id: v.id, patch: { running: true } });
    bus.emit('noise', { x: v.x, z: v.z, radius: 25, kind: 'engine', zone: v.zone, by: p.id });
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const me = G.local;
    const s = me ? this.seatOf(me) : null;
    if (s && s.seat === 0) this.drive(s.v, me, dt);
    else if (s && G.input.hit('interact')) this.exit(me);
    // remote-driven vehicles interpolate
    for (const v of this.vehicles.values()) {
      if (v.net && !(s && s.v === v && s.seat === 0)) {
        // a remote driver crossed a loop seam: jump with it instead of sliding across the map
        if (Math.hypot(v.net.x - v.x, v.net.z - v.z) > 12) { const dx = v.net.x - v.x, dz = v.net.z - v.z; v.net.x -= dx; v.net.z -= dz; this.shift(v, dx, dz); }
        const k = 1 - Math.exp(-10 * dt);
        v.x += (v.net.x - v.x) * k; v.z += (v.net.z - v.z) * k;
        let dy = v.net.yaw - v.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        v.yaw += dy * k;
      }
    }
    // occupants ride along
    for (const p of G.players.values()) {
      if (!p.inVehicle) continue;
      const v = this.vehicles.get(p.inVehicle); if (!v) { p.inVehicle = null; continue; }
      const seat = Math.max(0, v.seats.indexOf(p.id));
      const f = v.fwd, side = { x: -f.z, z: f.x };
      const fx = seat < 2 ? 0.25 : -0.7, sx = seat % 2 === 0 ? -0.38 : 0.38;
      p.x = v.x + f.x * fx + side.x * sx; p.z = v.z + f.z * fx + side.z * sx;
      p.facing = p.targetFacing = v.yaw; p.speed = 0; p.vx = p.vz = 0;
      p.zoneKey = v.zone;
    }
    this.render(dt);
  }

  private drive(v: Vehicle, p: Player, dt: number) {
    const inp = G.input;
    const t = v.def;
    if (inp.hit('interact')) { this.exit(p); return; }
    if (inp.hit('reload') || inp.hit('grab')) this.tryStart(v, p); // R / G: ignition
    if (inp.hit('flashlight')) op('veh', { id: v.id, patch: { lights: !v.lights } });
    if (inp.hit('shove')) { G.audio?.at?.('horn', v.x, v.z); bus.emit('noise', { x: v.x, z: v.z, radius: 45, kind: 'horn', zone: v.zone, by: p.id }); }
    const up = inp.down('up') ? 1 : 0, down = inp.down('down') ? 1 : 0;
    const left = inp.down('left') ? 1 : 0, right = inp.down('right') ? 1 : 0;
    const go = v.running && v.fuel > 0 && v.engine > 0.05;
    const top = t.maxSpeed * (0.55 + v.engine * 0.45) * (inp.down('run') ? 1 : 0.7);
    if (up && go) v.speed = v.speed < -0.2 ? v.speed + 9 * dt : Math.min(top, v.speed + t.accel * (0.6 + v.engine * 0.4) * dt);
    else if (down) v.speed = v.speed > 0.2 ? v.speed - 9 * dt : go ? Math.max(-4, v.speed - t.accel * 0.6 * dt) : v.speed * (1 - dt * 2);
    else v.speed *= 1 - dt * (go ? 0.35 : 0.9);
    if (Math.abs(v.speed) < 0.02) v.speed = 0;
    // steering is relative to the car: A turns left, D turns right
    const want = (left - right) * 0.55 * (1 - Math.min(0.55, Math.abs(v.speed) / t.maxSpeed * 0.6));
    v.steer = damp(v.steer, want, 7, dt);
    const yawRate = (v.speed / t.wheelbase) * Math.tan(v.steer);
    if (Math.abs(yawRate) > 0.9 && Math.abs(v.speed) > 7 && Math.random() < dt * 4) G.audio?.at?.('tire_screech', v.x, v.z, 0.6);
    const ny = v.yaw - yawRate * dt;
    const nf = { x: Math.cos(ny), z: Math.sin(ny) };
    const dx = nf.x * v.speed * dt, dz = nf.z * v.speed * dt;
    const z = G.getZone(v.zone);
    const before = Math.abs(v.speed);
    let moved = this.tryMove(z, v, dx, dz, ny);
    if (!moved) moved = this.tryMove(z, v, dx, 0, ny) || this.tryMove(z, v, 0, dz, ny);
    if (!moved) {
      if (before > 2.2) this.crash(v, p, before);
      v.speed *= -0.25;
    }
    // fuel: per metre + idle
    if (v.running) {
      const used = (Math.abs(v.speed) * dt * 0.00008 + dt * 0.00012) * t.fuelCap;
      v.fuel = Math.max(0, v.fuel - used);
      if (v.fuel <= 0) { op('veh', { id: v.id, patch: { running: false, fuel: 0 } }); bus.emit('think', p, 'Out of gas.'); }
      v.battery = Math.min(1, v.battery + dt * 0.002);
      this.noiseT -= dt;
      if (this.noiseT <= 0) { this.noiseT = 1; bus.emit('noise', { x: v.x, z: v.z, radius: 16 + Math.abs(v.speed) * 1.4, kind: 'engine', zone: v.zone, by: p.id }); }
    }
    // run things over
    if (Math.abs(v.speed) > 2) for (const c of (G.creatures?.list?.() || []) as any[]) {
      if (c.dead || c.zoneKey !== v.zone) continue;
      if (Math.hypot(c.x - v.x, c.z - v.z) < t.len / 2 + (c.radius ?? 0.4)) {
        G.creatures.damage(p.id, c.id, Math.abs(v.speed) * 7, v.x, v.z, 1.2);
        v.speed *= 0.6;
        v.engine = Math.max(0, v.engine - 0.01);
        G.audio?.at?.('hit_blunt', c.x, c.z);
      }
    }
    // roads off the map edge: drive into the next zone
    const tx = Math.floor(v.x), ty = Math.floor(v.z);
    const portal = z.portals.find((q) => q.kind === 'walk' && q.x === tx && q.y === ty);
    if (portal && Math.abs(v.speed) > 0.5) this.travel(v, portal);
    // looping streets and lanes: shift the car (and the camera) seamlessly
    const loop = z.portals.find((q) => q.kind === 'loop' && q.x === tx && q.y === ty);
    if (loop) this.shift(v, loop.loopDx ?? 0, loop.loopDy ?? 0);
    // stream the pose
    this.sendT -= dt;
    if (this.sendT <= 0 && G.net) { this.sendT = 1 / 15; G.net.sendVehicle?.({ id: v.id, x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: +v.yaw.toFixed(3), zone: v.zone, sp: +v.speed.toFixed(2) }); }
  }

  private tryMove(z: Zone, v: Vehicle, dx: number, dz: number, ny: number): boolean {
    const t = v.def;
    const nx = v.x + dx, nz = v.z + dz;
    const f = { x: Math.cos(ny), z: Math.sin(ny) };
    const r = t.wid / 2 * 0.92;
    const n = Math.max(2, Math.ceil((t.len - t.wid) / (r * 1.2)) + 1);
    for (let i = 0; i < n; i++) {
      const o = -t.len / 2 + r + (i / (n - 1)) * (t.len - 2 * r);
      const m = { x: nx + f.x * o, z: nz + f.z * o, radius: r };
      const ox = m.x, oz = m.z;
      if (resolve(z, m, {}) && Math.hypot(m.x - ox, m.z - oz) > 0.02) return false;
      const fl = z.floorAt(Math.floor(m.x), Math.floor(m.z));
      if (fl?.water === 'deep') return false;
    }
    v.x = nx; v.z = nz; v.yaw = ny;
    v.wheelRot += (Math.hypot(dx, dz) / 0.33) * Math.sign(v.speed);
    return true;
  }

  private crash(v: Vehicle, driver: Player, speed: number) {
    G.audio?.at?.('crash', v.x, v.z, Math.min(1, speed / 10));
    bus.emit('noise', { x: v.x, z: v.z, radius: 35, kind: 'crash', zone: v.zone, by: driver.id });
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, Math.min(1, speed / 12));
    const dmg = (speed - 2) * 0.03;
    op('veh', { id: v.id, patch: { engine: Math.max(0, v.engine - dmg), windows: speed > 9 ? 1 : v.windows } });
    if (speed > 7) for (const pid of v.seats) {
      const q = pid ? G.players.get(pid) : null; if (!q?.isLocal) continue;
      q.body.addInjury('head' as any, 'bruise' as any, Math.min(1, (speed - 6) * 0.08));
      if (speed > 11) q.body.addInjury('torso_u' as any, speed > 14 ? 'fracture' as any : 'bruise' as any, Math.min(1, (speed - 10) * 0.08));
      q.body.panic = Math.min(100, q.body.panic + 30);
    }
  }

  /** move a car by a loop offset; local occupants and the camera come along without a visible jump */
  private shift(v: Vehicle, dx: number, dz: number) {
    v.x += dx; v.z += dz;
    if (v.net) { v.net.x += dx; v.net.z += dz; }
    for (const pid of v.seats) {
      const p = pid ? G.players.get(pid) : null;
      if (!p) continue;
      p.x += dx; p.z += dz;
      if (p.isLocal) { G.pr.target.x += dx; G.pr.target.z += dz; }
    }
  }

  private travel(v: Vehicle, portal: any) {
    const target = G.getZone(portal.to);
    const a = target.meta.anchors?.[portal.anchor ?? portal.id] as number[] | undefined;
    const [x, y] = G.nearestWalkable(target, a ? a[0] : portal.tx, a ? a[1] : portal.ty);
    const yaw = a && a[2] !== undefined ? a[2] : v.yaw;
    op('veh', { id: v.id, patch: { zone: portal.to, x: x + 0.5, z: y + 0.5, yaw } });
    for (const pid of v.seats) {
      const p = pid ? G.players.get(pid) : null;
      if (p?.isLocal) G.travel(p, portal.to, x, y, yaw);
    }
    v.speed *= 0.5;
  }

  /** a remote driver's pose arrived */
  applyPose(s: { id: string; x: number; z: number; yaw: number; zone: string; sp: number }) {
    const v = this.vehicles.get(s.id); if (!v) return;
    const me = G.local;
    if (me && v.seats[0] === me.id) return; // we drive it
    if (v.zone !== s.zone) { v.zone = s.zone; v.x = s.x; v.z = s.z; v.yaw = s.yaw; }
    v.net = { x: s.x, z: s.z, yaw: s.yaw, t: G.time };
    v.speed = s.sp;
  }

  // ---------------------------------------------------------------- rendering
  rebuild(v: Vehicle) { if (v.mesh) { G.pr.scene.remove(v.mesh); v.mesh = null; } }
  private render(dt: number) {
    const zk = G.local?.zoneKey;
    const beamCands: Vehicle[] = [];
    for (const v of this.vehicles.values()) {
      const here = v.zone === zk && G.local && Math.abs(v.x - G.local.x) < 60 && Math.abs(v.z - G.local.z) < 60;
      if (!here) { if (v.mesh) v.mesh.visible = false; G.audio?.positionalLoop?.('veh:' + v.id, null); continue; }
      if (!v.mesh) this.build(v);
      const m = v.mesh!;
      m.visible = true;
      m.position.set(v.x, G.getZone(v.zone).heightAt(Math.floor(v.x), Math.floor(v.z)), v.z);
      m.rotation.y = -v.yaw;
      // wheels roll; front wheels steer
      v.wheels.forEach((w, i) => { w.rotation.z = -v.wheelRot; if (i < 2) (w.parent as THREE.Object3D).rotation.y = v.steer * 0.9; });
      if (v.lightsOn) v.lightsOn.visible = v.lights && v.battery > 0.02;
      // engine sound
      if (v.running) G.audio?.positionalLoop?.('veh:' + v.id, 'engine_loop', v.x, v.z, 0.5 + Math.min(0.5, Math.abs(v.speed) * 0.05), 0.7 + Math.min(1.1, Math.abs(v.speed) / v.def.maxSpeed * 1.2), 40);
      else G.audio?.positionalLoop?.('veh:' + v.id, null);
      if (v.lights && v.battery > 0.02) { beamCands.push(v); v.battery = Math.max(0, v.battery - dt * (v.running ? 0 : 0.0008)); }
    }
    beamCands.sort((a, b) => Math.hypot(a.x - G.local.x, a.z - G.local.z) - Math.hypot(b.x - G.local.x, b.z - G.local.z));
    this.beams.forEach((b, i) => {
      const v = beamCands[i];
      if (!v) { b.intensity = 0; return; }
      const f = v.fwd;
      b.position.set(v.x + f.x * v.def.len * 0.45, 0.75, v.z + f.z * v.def.len * 0.45);
      b.target.position.set(v.x + f.x * 12, 0, v.z + f.z * 12);
      b.target.updateMatrixWorld();
      b.intensity = 34;
    });
  }

  private build(v: Vehicle) {
    const t = v.def;
    const g = new THREE.Group();
    const mb = new ModelBuilder();
    const L = t.len, W = t.wid, H = t.hgt;
    const paint = v.engine < 0.5 ? 'v_rust' : 'v_paint';
    const col = v.color;
    const clear = 0.18;
    const bodyH = t.shape === 'van' ? H - clear : 0.62;
    // lower body
    mb.box(0, clear, 0, L, bodyH, W, { all: paint, top: paint }, { color: col });
    // bumpers
    mb.box(L / 2 + 0.03, clear, 0, 0.1, 0.2, W * 0.96, 'metal_grey', { color: 0x5a5a58 });
    mb.box(-L / 2 - 0.03, clear, 0, 0.1, 0.2, W * 0.96, 'metal_grey', { color: 0x5a5a58 });
    // grille, lamps, plate
    mb.box(L / 2 + 0.005, clear + 0.22, 0, 0.02, 0.18, W * 0.5, 'v_grille', { fit: true });
    for (const s of [-1, 1]) {
      mb.box(L / 2 + 0.006, clear + 0.3, s * W * 0.36, 0.02, 0.1, W * 0.18, 'v_head', { fit: true });
      mb.box(-L / 2 - 0.006, clear + 0.32, s * W * 0.38, 0.02, 0.1, W * 0.14, 'v_tail', { fit: true });
    }
    mb.box(-L / 2 - 0.09, clear + 0.12, 0, 0.02, 0.12, 0.34, 'v_plate', { fit: true });
    // cabin / box
    if (t.shape === 'van') {
      mb.box(L * 0.32, clear + bodyH * 0.45, 0, 0.04, bodyH * 0.38, W * 0.86, 'v_glass', { fit: true }); // windscreen
      for (const s of [-1, 1]) mb.box(L * 0.22, clear + bodyH * 0.48, s * (W / 2 + 0.005), L * 0.18, bodyH * 0.32, 0.02, 'v_glass', { fit: true });
    } else {
      const cabL = t.shape === 'hatch' ? L * 0.52 : t.shape === 'pickup' ? L * 0.3 : L * 0.42;
      const cabX = t.shape === 'hatch' ? -L * 0.12 : t.shape === 'pickup' ? L * 0.06 : -L * 0.04;
      const cabH = H - clear - bodyH;
      mb.box(cabX, clear + bodyH, 0, cabL, cabH, W * 0.88, { all: 'v_glass', top: paint }, { color: 0xffffff, fit: true });
      mb.box(cabX, clear + bodyH + cabH - 0.04, 0, cabL + 0.02, 0.06, W * 0.9, paint, { color: col });
      // pillars
      for (const s of [-1, 1]) for (const px of [cabX - cabL / 2, cabX, cabX + cabL / 2]) mb.box(px, clear + bodyH, s * W * 0.44, 0.07, cabH, 0.03, paint, { color: col });
      if (t.shape === 'pickup') {
        // open bed with walls
        const bx0 = cabX - cabL / 2 - 0.05, bx1 = -L / 2;
        for (const s of [-1, 1]) mb.box((bx0 + bx1) / 2, clear + bodyH, s * (W / 2 - 0.04), bx0 - bx1, 0.28, 0.06, paint, { color: col });
        mb.box(bx1 + 0.03, clear + bodyH, 0, 0.06, 0.28, W - 0.08, paint, { color: col });
        mb.box((bx0 + bx1) / 2, clear + bodyH - 0.01, 0, bx0 - bx1, 0.02, W - 0.1, 'v_interior');
      }
    }
    if (v.windows) mb.box(-L * 0.04, clear + bodyH + 0.02, W * 0.45, 0.6, 0.05, 0.04, 'glass', { color: 0xd0e0e8 }); // shattered bits
    const body = new THREE.Mesh(mb.build(), this.mat);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // headlight glow (emissive copy shown when lights are on)
    const lm = new ModelBuilder();
    for (const s of [-1, 1]) lm.box(L / 2 + 0.012, clear + 0.3, s * W * 0.36, 0.02, 0.1, W * 0.18, 'v_head', { fit: true, emissive: 1.5 });
    v.lightsOn = new THREE.Mesh(lm.build(), worldMaterial({ unlit: true }));
    v.lightsOn.visible = false;
    g.add(v.lightsOn);
    // wheels
    const wm = new ModelBuilder();
    wm.cylinderZ(0, 0, 0, 0.33, 0.22, 10, { sides: 'v_tire', top: 'v_rim', bottom: 'v_rim' } as any, { fit: true } as any);
    const wg = wm.build();
    v.wheels = [];
    const wx = t.wheelbase / 2;
    for (const [x, s] of [[wx, -1], [wx, 1], [-wx, -1], [-wx, 1]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.33, s * (W / 2 - 0.08));
      const w = new THREE.Mesh(wg, this.mat);
      w.castShadow = true;
      pivot.add(w);
      g.add(pivot);
      v.wheels.push(w);
    }
    g.traverse((o) => { o.matrixAutoUpdate = true; });
    G.pr.scene.add(g);
    v.mesh = g;
  }

  // ---------------------------------------------------------------- persistence
  serialize() { return [...this.vehicles.values()].map((v) => ({ ...v.state(), trunk: serializeContainer(v.trunk), glove: serializeContainer(v.glove) })); }
  load(list: any[]) {
    for (const s of list || []) {
      let v = this.vehicles.get(s.id);
      if (!v) {
        v = new Vehicle();
        v.trunk = new Container(-1, 'Trunk', 'trunk', 50); v.glove = new Container(-1, 'Glovebox', 'box', 4);
        this.vehicles.set(s.id, v);
      }
      const { trunk, glove, ...st } = s;
      Object.assign(v, st);
      v.seats = new Array((TYPES[v.type] || TYPES.sedan).seats).fill(null);
      v.running = false;
      if (trunk) v.trunk = deserializeContainer(trunk);
      if (glove) v.glove = deserializeContainer(glove);
      this.rebuild(v);
    }
  }
}

/** world-picking helper: rough box around a vehicle */
export function vehicleBox(v: Vehicle, box: THREE.Box3) {
  const t = v.def, f = v.fwd;
  const hx = Math.abs(f.x) * t.len / 2 + Math.abs(f.z) * t.wid / 2;
  const hz = Math.abs(f.z) * t.len / 2 + Math.abs(f.x) * t.wid / 2;
  box.set(new THREE.Vector3(v.x - hx, 0, v.z - hz), new THREE.Vector3(v.x + hx, t.hgt, v.z + hz));
  return box;
}
void itemDef;

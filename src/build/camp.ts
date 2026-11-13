// THE CAMP AT RUN TIME (round 16): G.build.camp. Everything the camp pieces of
// src/build/kit2.ts do once they stand:
//   grid      running generators + wire poles: coverage, the sagging cables between them,
//             appliances and lamps in reach light up (src/items/worldSystems.ts asks gridPowers)
//   water     rain barrels catch drips, the collector pulls clean water out of the air,
//             the still boils whatever is poured into it
//   defence   tripwires ring, jaw traps hold, the chain flail beats, the siren wails;
//             creatures sometimes PROBE the camp: one walks in from outside, and what stands
//             in its way (walls, doors, barricades) it has to break (probeStep, one hook in
//             src/creatures/manager.ts). Never in the first minutes, never two at once.
//   upkeep    generators burn fuel (worldSystems); once a day the camp eats one meal per bed
//             out of its stores: a fed camp is a comfortable one, a hungry camp loses comfort
//   bed       sleeping in (or making) a camp bed holds a checkpoint there (src/game/checkpoint.ts)
//   radio     Dr. Calder answers on it, and it hears a probe coming
//   upgrade   U in build mode puts the next tier over a piece in place (op 'bldUpgrade')
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { op, defOp, applyOp, isReplaying } from '../game/ops';
import { uid } from '../core/rng';
import { objDef } from '../world/objects';
import { wallId } from '../world/defs';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';
import { refreshUnpowered } from '../world/power';
import { serializeContainer } from '../items/factory';
import { itemDef } from '../items/item';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import { TimedAction } from '../actions/action';
import { lineOfSight } from '../world/collision';
import { findPath } from '../world/path';
import { steer, heading, brake } from '../creatures/kit/physics';
import { voss } from '../game/debt/voice';
import { holdCheckpoint } from '../game/checkpoint';
import { shake, punch } from '../gfx/juice';
import { piece, pieceForObj, type Piece } from './pieces';
import { upgradeOf, upgradeCost, CLAIM_OBJS } from './kit2';
import { builtWalls, edgeKey } from './ops';
import { sparks, splinters, welderFor, setVisor, type Welder } from './weld';
import { buildSpeed } from './speed';
import { bump, mark } from './progress';
import { stores, takeFromStore } from '../craft/stores';
import type { Zone, TileObject } from '../world/zone';
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';

const POLE_R = 10, GEN_R = 14;
const CALM = new Set(['neutral', 'docile', 'passive', 'shy', 'timid', 'skittish']);
const isHostile = (c: any) => !c.dead && c.sp?.attack && !c.tamedBy && !c.mem?.thrall && !c.mem?.pen && !c.mem?.dom && !c.mem?.tribe && !String(c.sp?.key ?? '').startsWith('tribe_') && !c.sp?.flags?.companion && !c.sp?.flags?.immortal && !CALM.has(c.sp?.temperament);
const centreOf = (o: TileObject) => { const d = objDef(o.key); const w = d?.w ?? 1, dd = d?.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w; return { x: o.x + rw / 2, z: o.y + rd / 2, h: d?.height ?? 1 }; };
const day = () => Math.floor((G.clock?.hours ?? 0) / 24);

// ================================================================ the upgrade op
function setWall(z: Zone, x: number, y: number, side: number, id: number) { if (side === 0) z.setWallN(x, y, id); else z.setWallW(x, y, id); }
defOp('bldUpgrade', (a: { z: string; uid?: number; x?: number; y?: number; side?: 0 | 1; to: string; nu?: number; cu?: number; by?: string }, ctx) => {
  const z = G.zones.get(a.z); if (!z) return;
  const pc = piece(a.to); if (!pc) return;
  if (pc.kind === 'obj' && pc.obj && a.uid != null) {
    const o = z.objects.get(a.uid); if (!o) return;
    const d = objDef(pc.obj); const spec = d?.container || d?.containers?.[0];
    let inv: any = null;
    if (spec) {
      const base = o.inv ? serializeContainer(o.inv) : { items: [] };
      inv = { ...base, uid: a.cu, name: spec.name || d!.name, kind: spec.kind, capacity: spec.capacity, reduction: 0, lootDone: true, locked: false, owner: 'obj:' + a.nu };
    }
    const keep: Record<string, unknown> = {};
    for (const k of ['worker', 'name', 'water', 'fuel', 'on', 'crop', 'stage', 'cc']) if (o.state[k] !== undefined) keep[k] = o.state[k];
    applyOp('objRemove', { z: a.z, uid: o.uid }, ctx.from, false);
    applyOp('objAdd', { z: a.z, obj: { uid: a.nu, key: pc.obj, x: o.x, y: o.y, rot: o.rot, state: { ...keep, built: 1, by: a.by ?? null, tier: 1 }, inv } }, ctx.from, false);
    bus.emit('bldUpgraded', z, pc, a.by ?? null);
    return;
  }
  if (pc.wall && a.x != null && a.y != null) {
    const side = a.side === 1 ? 1 : 0;
    setWall(z, a.x, a.y, side, wallId(pc.wall));
    const e = z.edge(a.x, a.y, side);
    if (pc.kind === 'door') {
      const hp = pc.key === 'steel_door' ? 900 : 400;
      z.setEdge(a.x, a.y, side, { kind: 'door', style: pc.doorStyle ?? 'door_metal', open: e?.open ?? false, locked: e?.locked ?? false, hp, maxHp: hp, barricade: 0, swing: e?.swing ?? 1, hinge: e?.hinge ?? 0 });
    }
    builtWalls(z)[edgeKey(a.x, a.y, side)] = pc.key;
    bus.emit('bldUpgraded', z, pc, a.by ?? null);
  }
});

/** the upgrade in the hands: like a weld, on the standing piece */
class UpgradeAction extends TimedAction {
  private fxT = 0;
  constructor(p: Player, private at: { x: number; z: number; h: number }, private to: Piece, private tool: Welder, private done_: () => void) {
    super(p);
    const skill = p.body.skill(tool.kind === 'hammer' ? 'carpentry' : 'mechanics');
    this.duration = Math.max(1, to.weld * 0.85 * (1 - Math.min(0.35, skill * 0.05)) / buildSpeed(p));
    this.fixedTime = true;
    this.name = 'Upgrade to ' + to.name;
    this.anim = tool.kind === 'hammer' ? 'hammer' : 'craft';
    this.face = { x: at.x, z: at.z };
  }
  isValid() { return Math.hypot(this.at.x - this.p.x, this.at.z - this.p.z) < 2.8 && (this.tool.kind !== 'torch' || (this.tool.it.uses ?? 1) > 0.002); }
  update(dt: number) {
    this.fxT -= dt;
    const hammer = this.tool.kind === 'hammer';
    if (this.tool.kind === 'torch') this.tool.it.uses = Math.max(0, (this.tool.it.uses ?? 1) - dt / (itemDef('welding_torch').uses ?? 60));
    if (this.fxT <= 0) {
      this.fxT = hammer ? 0.45 : 0.05;
      const x = this.at.x + (Math.random() - 0.5) * 0.7, y = Math.random() * this.at.h, z = this.at.z + (Math.random() - 0.5) * 0.7;
      if (hammer) { splinters(x, y, z, 4); G.audio?.at?.('hammer', x, z, 0.8); if (this.p.isLocal) shake(0.06); }
      else { sparks(x, y, z, 3, 2.6); G.pointLight(x, y + 0.1, z, 0xb8d8ff, 2, 4); if (Math.random() < 0.3) G.audio?.at?.('weld_crackle', x, z, 0.5); if (this.p.isLocal) setVisor(0.8, x, y, z); }
    }
    if (Math.random() < dt * 2) bus.emit('noise', { x: this.at.x, z: this.at.z, radius: hammer ? 20 : 14, kind: 'build', zone: this.p.zoneKey, by: this.p.id });
  }
  stop() { if (this.p.isLocal) setVisor(0); }
  perform() {
    if (this.p.isLocal) setVisor(0);
    this.done_();
    sparks(this.at.x, this.at.h * 0.6, this.at.z, 22, 4);
    G.audio?.at?.(this.tool.kind === 'hammer' ? 'hammer' : 'metal_clank', this.at.x, this.at.z, 1);
    if (this.p.isLocal) { punch(0.05, 0.25); shake(0.2); }
    this.p.body.addXp(this.tool.kind === 'hammer' ? 'carpentry' : 'mechanics', 8 + this.to.weld);
  }
}

// ================================================================ probes
interface Probe { b: number; x: number; z: number; t: number; lx: number; lz: number; chk: number; stuck: number; inside: number; hits: number; tgt?: Obst | null; route?: [number, number][] | null; ri: number; goal?: Obst | null }
type Obst = { kind: 'obj'; o: TileObject; x: number; z: number } | { kind: 'wall' | 'door'; x: number; y: number; side: 0 | 1; mx: number; mz: number };

export class Camp {
  // ---- grid
  private live = new Map<string, { pts: { x: number; z: number; r: number }[]; sig: string }>();
  private cables: THREE.Mesh | null = null;
  private cableSig = '';
  private cableMat = worldMaterial({});
  private gridT = 0;
  // ---- flail heads
  private flails = new Map<number, THREE.Mesh>();
  private flailGeo: THREE.BufferGeometry | null = null;
  // ---- timers
  private hostT = 0;
  private waterAcc = new Map<number, number>();
  private waterT = 0;
  private wail = new Map<number, number>();
  private wailSnd = new Map<number, number>();
  private rung = new Map<number, number>();
  private lastDay = -1;
  private nextProbe = -1;
  private probing: string | null = null;
  private claimSeen = 0;
  private bedT = 0;
  private bedHeldDay = -1;

  constructor() {
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => { try { this.menu(p, o, out); } catch (e) { console.warn('camp menu', e); } });
    bus.on('bldWelded', (z: Zone, pc: Piece, o: TileObject, by: string | null) => this.onBuilt(z, pc, by));
    bus.on('bldUpgraded', (z: Zone, pc: Piece, by: string | null) => this.onBuilt(z, pc, by, true));
    bus.on('travelEnd', () => this.clearVisuals());
    const g = G as unknown as { ctxHooks?: ((p: Player, touch: boolean) => unknown[])[] };
    (g.ctxHooks ||= []).push((p: Player) => this.ctx(p));
  }

  // ================================================================ grid
  /** is this point (world metres) on the camp grid: in reach of a running generator, or of a pole chained to one */
  gridPowers = (z: Zone, x: number, y: number): boolean => {
    const L = this.live.get(z.key); if (!L) return false;
    for (const q of L.pts) if (Math.hypot(q.x - x, q.z - y) < q.r) return true;
    return false;
  };
  private computeGrid(z: Zone) {
    const gens: { x: number; z: number; uid: number }[] = [], poles: { x: number; z: number; uid: number; o: TileObject }[] = [];
    for (const o of z.objects.values()) {
      if (o.key === 'bld_pole') { const c = centreOf(o); poles.push({ x: c.x, z: c.z, uid: o.uid, o }); }
      else if (o.state.on && (o.state.fuel ?? 0) > 0 && objDef(o.key)?.tags?.includes('generator')) { const c = centreOf(o); gens.push({ x: c.x, z: c.z, uid: o.uid }); }
    }
    const pts: { x: number; z: number; r: number }[] = gens.map((g) => ({ x: g.x, z: g.z, r: GEN_R }));
    const links: [number, number, number, number][] = [];
    if (gens.length && poles.length) {
      const live = new Set<number>();
      // breadth-first: a pole in reach of a generator (or a live pole) goes live
      let frontier: { x: number; z: number; r: number }[] = gens.map((g) => ({ x: g.x, z: g.z, r: GEN_R }));
      while (frontier.length) {
        const next: { x: number; z: number; r: number }[] = [];
        for (const pl of poles) {
          if (live.has(pl.uid)) continue;
          let best: { x: number; z: number; r: number } | null = null, bd = 1e9;
          for (const f of frontier) { const d = Math.hypot(f.x - pl.x, f.z - pl.z); if (d < f.r && d < bd) { bd = d; best = f; } }
          if (!best) continue;
          live.add(pl.uid);
          links.push([best.x, best.z, pl.x, pl.z]);
          const q = { x: pl.x, z: pl.z, r: POLE_R };
          pts.push(q); next.push(q);
        }
        frontier = next;
      }
    }
    const sig = pts.map((q) => `${q.x},${q.z},${q.r}`).join('|');
    const prev = this.live.get(z.key);
    this.live.set(z.key, { pts, sig });
    if (prev?.sig !== sig) { try { refreshUnpowered(z); } catch { /* no zone view */ } z.lightDirty = true; }
    if (z.key === G.local?.zoneKey) this.drawCables(z, links);
  }
  private drawCables(z: Zone, links: [number, number, number, number][]) {
    const sig = links.map((l) => l.join(',')).join('|');
    if (sig === this.cableSig) return;
    this.cableSig = sig;
    if (this.cables) { G.pr.scene.remove(this.cables); this.cables.geometry.dispose(); this.cables = null; }
    if (!links.length) return;
    const mb = new ModelBuilder();
    for (const [ax, az, bx, bz] of links) {
      const ya = z.heightAt(Math.floor(ax), Math.floor(az)) + 2.42, yb = z.heightAt(Math.floor(bx), Math.floor(bz)) + 2.42;
      const L = Math.hypot(bx - ax, bz - az), sag = Math.min(0.6, 0.05 + L * 0.04);
      const N = Math.max(6, Math.round(L * 1.5));
      // two conductors, one either side of the cross-arm, hanging in a catenary
      for (const off of [-0.24, 0.24]) {
        const nx = -(bz - az) / (L || 1) * off, nz = (bx - ax) / (L || 1) * off;
        let px = ax + nx, py = ya, pz = az + nz;
        for (let i = 1; i <= N; i++) {
          const t = i / N, x = ax + (bx - ax) * t + nx, zz = az + (bz - az) * t + nz, y = ya + (yb - ya) * t - Math.sin(t * Math.PI) * sag;
          rodSeg(mb, px, py, pz, x, y, zz, 0.012);
          px = x; py = y; pz = zz;
        }
      }
    }
    this.cables = new THREE.Mesh(mb.build(), this.cableMat);
    this.cables.frustumCulled = false;
    G.pr.scene.add(this.cables);
  }

  // ================================================================ per frame
  update(dt: number, dh: number) {
    const p = G.local; if (!p) return;
    const z = G.zones.get(p.zoneKey); if (!z) return;
    this.gridT -= dt;
    if (this.gridT <= 0) { this.gridT = 1; this.computeGrid(z); }
    this.visuals(z, dt);
    if (G.role === 'client') return;
    this.water(z, dh);
    this.hostT -= dt;
    if (this.hostT <= 0) { this.hostT = 0.25; this.defend(z); }
    this.probes(z, p, dt);
    this.upkeep(z);
    this.beds(z, p, dt);
  }

  private clearVisuals() {
    for (const m of this.flails.values()) G.pr.scene.remove(m);
    this.flails.clear();
    if (this.cables) { G.pr.scene.remove(this.cables); this.cables.geometry.dispose(); this.cables = null; }
    this.cableSig = '';
  }

  /** powered flails spin their chains; wailing sirens throw red light */
  private visuals(z: Zone, dt: number) {
    const seen = new Set<number>();
    for (const o of z.objects.values()) {
      if (o.key === 'bld_flail' && this.powered(z, o)) {
        seen.add(o.uid);
        let m = this.flails.get(o.uid);
        if (!m) { m = new THREE.Mesh(this.flailHead(), this.cableMat); G.pr.scene.add(m); this.flails.set(o.uid, m); m.position.set(o.x + 0.5, z.heightAt(o.x, o.y) + 1.42, o.y + 0.5); }
        m.rotation.y += dt * (o.state.hit && G.time - o.state.hit < 1 ? 16 : 9);
      } else if (o.key === 'bld_siren' && (this.wail.get(o.uid) ?? 0) > G.time) {
        const k = 0.5 + 0.5 * Math.sin(G.time * 9);
        G.pointLight(o.x + 0.5 + Math.cos(G.time * 6) * 0.6, z.heightAt(o.x, o.y) + 1.8, o.y + 0.5 + Math.sin(G.time * 6) * 0.6, 0xff2a1a, 1.2 + k * 2.4, 8);
      }
    }
    for (const [u, m] of this.flails) if (!seen.has(u)) { G.pr.scene.remove(m); this.flails.delete(u); }
  }
  private flailHead(): THREE.BufferGeometry {
    if (this.flailGeo) return this.flailGeo;
    const mb = new ModelBuilder();
    mb.cylinder(0, -0.04, 0, 0.07, 0.1, 10, 'chrome');
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      for (let k = 0; k < 6; k++) { const r = 0.1 + k * 0.11, y = -0.02 - k * 0.035; mb.push().translate(Math.cos(a) * r, y, Math.sin(a) * r).rotateY(-a).rotateX(k % 2 ? Math.PI / 2 : 0); mb.cylinder(0, -0.03, 0, 0.022, 0.06, 6, 'q_chain', { caps: false }); mb.pop(); }
      mb.sphere(Math.cos(a) * 0.78, -0.24, Math.sin(a) * 0.78, 0.06, 8, 5, 'metal_dark');
    }
    this.flailGeo = mb.build();
    return this.flailGeo;
  }

  powered(z: Zone, o: TileObject): boolean {
    const r = z.roomAt(o.x, o.y);
    if (z.circuitPowered(r.circuit)) return true;
    return !!G.items?.generatorPowers?.(z, o.x, o.y) || this.gridPowers(z, o.x + 0.5, o.y + 0.5);
  }

  // ================================================================ water (host)
  private water(z: Zone, dh: number) {
    if (dh <= 0) return;
    this.waterT -= dh;
    const send = this.waterT <= 0;
    if (send) this.waterT = 0.08;
    const rain = z.env?.weather === 'rain';
    for (const o of z.objects.values()) {
      let rate = 0, cap = 0, clean = false;
      if (o.key === 'bld_rain_barrel' || o.key === 'bld_rain') { cap = objDef(o.key)?.water?.capacity ?? 30; rate = rain && z.isOutdoor(o.x, o.y) ? 8 : 0.35; }
      else if (o.key === 'bld_condenser') { cap = 16; clean = true; rate = this.powered(z, o) ? 0.9 : 0.35; }
      else if (o.key === 'bld_still') {
        cap = 12; clean = true;
        rate = o.state.lit && (o.state.feed ?? 0) > 0 ? 3 : 0;
      } else continue;
      if (rate <= 0) continue;
      const acc = (this.waterAcc.get(o.uid) ?? 0) + rate * dh;
      this.waterAcc.set(o.uid, acc);
      if (!send || acc < 0.05) continue;
      const have = o.state.water ?? 0;
      if (have >= cap - 0.01) { this.waterAcc.set(o.uid, 0); continue; }
      let add = Math.min(acc, cap - have);
      const patch: Record<string, unknown> = {};
      if (o.key === 'bld_still') { add = Math.min(add, o.state.feed ?? 0); patch.feed = Math.round(((o.state.feed ?? 0) - add) * 100) / 100; }
      patch.water = Math.round((have + add) * 100) / 100;
      if (clean) patch.boiled = true;
      this.waterAcc.set(o.uid, 0);
      op('objState', { z: z.key, uid: o.uid, patch });
    }
  }

  // ================================================================ defence (host, 4 Hz)
  private defend(z: Zone) {
    const cs: any[] = [];
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) if (c.zoneKey === z.key && isHostile(c)) cs.push(c);
    const now = G.time;
    let alarm: { x: number; z: number } | null = null;
    for (const o of z.objects.values()) {
      if (o.key === 'bld_tripwire') {
        const cx = o.x + 0.5, cz = o.y + 0.5;
        const c = cs.find((q) => Math.hypot(q.x - cx, q.z - cz) < 0.75);
        if (c && now - (this.rung.get(o.uid) ?? -99) > 8) {
          this.rung.set(o.uid, now);
          G.audio?.at?.('tc_chain', cx, cz, 1); G.audio?.at?.('vent_clank', cx, cz, 0.9);
          bus.emit('noise', { x: cx, z: cz, radius: 22, kind: 'alarm', zone: z.key });
          alarm = { x: cx, z: cz };
          this.note(G.local, 'Cans. Something just walked into the tripwire.');
        }
      } else if (o.key === 'bld_jaw_trap' && !o.state.sprung) {
        const c = cs.find((q) => Math.floor(q.x) === o.x && Math.floor(q.z) === o.y);
        if (c) {
          op('objState', { z: z.key, uid: o.uid, patch: { sprung: true } });
          G.creatures.damage('jaw_trap', c.id, 22 + Math.random() * 10, o.x + 0.5, o.y + 0.5, 0, 'pierce');
          c.stagger = Math.max(c.stagger ?? 0, 3.2);
          c.vx = 0; c.vz = 0;
          G.audio?.at?.('slam_hydraulic', o.x + 0.5, o.y + 0.5, 0.9); G.audio?.at?.('cy_squeal', o.x + 0.5, o.y + 0.5, 0.8);
          sparks(o.x + 0.5, 0.2, o.y + 0.5, 10, 2);
          alarm = { x: o.x + 0.5, z: o.y + 0.5 };
          this.note(G.local, 'The jaw trap went. Something is stuck in it.');
        }
      } else if (o.key === 'bld_flail' && this.powered(z, o)) {
        const cx = o.x + 0.5, cz = o.y + 0.5;
        for (const c of cs) {
          const d = Math.hypot(c.x - cx, c.z - cz);
          if (d > 1.75) continue;
          if (Math.random() < 0.5) continue;
          G.creatures.damage('flail', c.id, 5 + Math.random() * 4, cx, cz, 0.9, 'blunt');
          if (!o.state.hit || now - o.state.hit > 0.9) op('objState', { z: z.key, uid: o.uid, patch: { hit: now } });
          if (z.key === G.local?.zoneKey) { G.audio?.at?.('tc_chain', cx, cz, 0.9); sparks(c.x, 0.8, c.z, 3, 2); }
        }
      }
    }
    // sirens: anything hostile inside the claim, or an alarm just now
    for (const o of z.objects.values()) {
      if (o.key !== 'bld_siren') continue;
      const claim = G.build?.settle?.claimAt?.(z.key, o.x + 0.5, o.y + 0.5) as TileObject | null;
      const R = claim ? this.claimR(claim) : 10;
      const cx = claim ? claim.x + 0.5 : o.x + 0.5, cz = claim ? claim.y + 0.5 : o.y + 0.5;
      const inside = cs.some((c) => Math.hypot(c.x - cx, c.z - cz) < R) || (alarm && Math.hypot(alarm.x - cx, alarm.z - cz) < R + 4);
      if (!inside) continue;
      const was = (this.wail.get(o.uid) ?? 0) > now;
      this.wail.set(o.uid, now + 6);
      if (now - (this.wailSnd.get(o.uid) ?? -99) > 2.6) { this.wailSnd.set(o.uid, now); G.audio?.at?.('car_alarm_far', o.x + 0.5, o.y + 0.5, 1); bus.emit('noise', { x: o.x + 0.5, z: o.y + 0.5, radius: 26, kind: 'alarm', zone: z.key }); }
      if (!was) {
        const p = G.local;
        if (p && p.zoneKey === z.key) {
          if (p.sleeping) p.actions.clear();
          bus.emit('subtitle', { who: 'SIREN', text: 'THE CAMP SIREN IS WAILING', dur: 2.4, style: 'radio' });
        }
      }
    }
  }
  private noteT = 0;
  private note(p: Player | null, text: string) {
    if (!p || G.time - this.noteT < 6) return;
    this.noteT = G.time;
    bus.emit('think', p, text);
  }
  private claimR(o: TileObject) { return CLAIM_OBJS[o.key] ?? 12; }

  // ================================================================ probes (host)
  /** the claim this unit's camp is (the nearest claim in the zone with something built round it) */
  private homeClaim(z: Zone, p: Player): TileObject | null {
    let best: TileObject | null = null, bd = 1e9;
    for (const o of z.objects.values()) {
      if (!(o.key in CLAIM_OBJS)) continue;
      const d = Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best && bd < 40 ? best : null;
  }
  private builtNear(z: Zone, b: TileObject): number {
    const R = this.claimR(b); let n = 0;
    for (const o of z.objects.values()) if (o.state.built && Math.hypot(o.x - b.x, o.y - b.y) <= R) n++;
    for (const k of Object.keys(builtWalls(z))) { const [x, y] = k.split(',').map(Number); if (Math.hypot(x - b.x, y - b.y) <= R) n++; }
    return n;
  }
  private probes(z: Zone, p: Player, dt: number) {
    if (this.probing) {
      const c = G.creatures?.creatures?.get?.(this.probing);
      if (!c || c.dead || !c.mem?.probe || c.zoneKey !== z.key) { this.endProbe(c); }
      return;
    }
    const b = this.homeClaim(z, p);
    if (!b || p.body.dead || G.transitioning || (G as any).intro?.running) { this.claimSeen = 0; return; }
    this.claimSeen += dt;
    if (this.nextProbe < 0) { this.nextProbe = G.time + 300 + Math.random() * 180; return; }
    if (G.time < this.nextProbe || this.claimSeen < 120 || this.builtNear(z, b) < 4) return;
    this.nextProbe = G.time + 360 + Math.random() * 300;
    this.startProbe(z, b, p);
  }
  /** send one inhabitant at the camp: one already in the level, or (if there is none) one that wanders in from the dark */
  startProbe(z: Zone, b: TileObject, p: Player | null = G.local): any {
    const bx = b.x + 0.5, bz = b.y + 0.5, R = this.claimR(b);
    const cands: { q: any; d: number }[] = [];
    for (const q of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
      if (q.zoneKey !== z.key || !isHostile(q) || q.mem?.probe || (q.sp?.threat ?? 1) > 3.5) continue;
      const d = Math.hypot(q.x - bx, q.z - bz);
      if (d < R + 4 || d > 60) continue;
      if (q.targetId && (q.awareness?.get?.(q.targetId) ?? 0) >= 1) continue;
      cands.push({ q, d });
    }
    cands.sort((a, b2) => a.d - b2.d);
    let c: any = null;
    const m: Probe = { b: b.uid, x: bx, z: bz, t: 0, lx: 0, lz: 0, chk: 0, stuck: 0, inside: 0, hits: 0, ri: 0 };
    for (const { q } of cands.slice(0, 5)) { this.plan(z, q, m); if (m.route) { c = q; break; } }
    for (let t = 0; !c && t < 3; t++) {
      const q = this.spawnProber(z, bx, bz, R, p);
      if (!q) break;
      this.plan(z, q, m);
      if (m.route) c = q; else G.creatures.remove(q);
    }
    if (!c) return null;
    m.lx = c.x; m.lz = c.z;
    c.mem.probe = m;
    this.probing = c.id;
    mark('camp:probed');
    // a radio in the camp hears it coming
    if (this.hasInClaim(z, b, 'bld_radio')) {
      const dx = c.x - bx, dz = c.z - bz;
      const dir = (Math.abs(dz) > Math.abs(dx) * 0.5 ? (dz < 0 ? 'north' : 'south') : '') + (Math.abs(dx) > Math.abs(dz) * 0.5 ? (dz !== 0 && Math.abs(dz) > Math.abs(dx) * 0.5 ? '-' : '') + (dx > 0 ? 'east' : 'west') : '');
      setTimeout(() => { G.audio?.ui?.('radio_on', 0.5); voss(`Camp radio, unit. Something has your scent. Coming in from the ${dir || 'dark'}. Doors shut.`); }, 400);
    }
    return c;
  }
  private spawnProber(z: Zone, bx: number, bz: number, R: number, p: Player | null): any {
    const table: [string, number][] = Array.isArray((z as any).spawnTable) ? (z as any).spawnTable : [];
    const opts: [string, number][] = [];
    for (const [k, w] of table) {
      const sp: any = (G.creatures as any)?.species?.(k) ?? null;
      void sp;
      opts.push([k, w]);
    }
    if (!opts.length) return null;
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * Math.PI * 2, d = R + 10 + Math.random() * 10;
      const x = Math.floor(bx + Math.cos(a) * d), y = Math.floor(bz + Math.sin(a) * d);
      if (!z.inb(x, y) || !z.floor[z.idx(x, y)] || z.solid[z.idx(x, y)]) continue;
      if (p && Math.hypot(x + 0.5 - p.x, y + 0.5 - p.z) < 14) continue;
      if (p && lineOfSight(z, p.x, p.z, x + 0.5, y + 0.5) && Math.hypot(x - p.x, y - p.z) < 22) continue;
      let tot = 0; for (const [, w] of opts) tot += w;
      let r = Math.random() * tot, key = opts[0][0];
      for (const [k, w] of opts) { r -= w; if (r <= 0) { key = k; break; } }
      const c = G.creatures.spawn(key, z.key, x + 0.5, y + 0.5);
      if (c && isHostile(c) && (c.sp?.threat ?? 1) <= 3.5) return c;
      if (c) G.creatures.remove(c);
    }
    return null;
  }
  private endProbe(c: any) {
    if (c?.mem?.probe) {
      const hits = (c.mem.probe as Probe).hits;
      delete c.mem.probe;
      if (hits > 0 && !c.dead) setTimeout(() => this.note(G.local, 'It gave up on the camp. For now. Something needs patching.'), 600);
    }
    this.probing = null;
  }
  /** the creature manager hands a probing creature's step here; true = handled this frame */
  probeStep(c: any, z: Zone, dt: number): boolean {
    const m = c.mem.probe as Probe | undefined;
    if (!m || c.dead) return false;
    if (c.stagger > 0) return false;
    m.t += dt;
    // a unit it can see and reach takes over: from here it hunts like it always does
    const tp = c.targetId ? G.players.get(c.targetId) : null;
    if (tp && (c.awareness?.get?.(tp.id) ?? 0) >= 1 && Math.hypot(tp.x - c.x, tp.z - c.z) < 6 && lineOfSight(z, c.x, c.z, tp.x, tp.z)) { this.endProbe(c); return false; }
    if (m.t > 120) { this.endProbe(c); return false; }
    // winding up a blow against what is in its way
    if (c.attackPhase > 0) {
      c.attackPhase -= dt; c.vx *= 0.7; c.vz *= 0.7; c.speed = 0;
      if (c.attackPhase <= 0 && m.tgt) this.bashLand(c, z, m);
      return true;
    }
    // inside the camp: it noses about, then loses interest
    if (Math.hypot(m.x - c.x, m.z - c.z) < 2.4) {
      m.inside += dt; c.speed = 0; brake(c, dt);
      if (Math.random() < dt * 0.6) c.targetFacing = Math.random() * Math.PI * 2;
      if (m.inside > 14) this.endProbe(c);
      return true;
    }
    if (!m.route) { this.plan(z, c, m); if (!m.route) { this.endProbe(c); return false; } }
    // follow the route (doors count as open: it means to go through them)
    const r = m.route;
    while (m.ri < r.length && Math.hypot(r[m.ri][0] + 0.5 - c.x, r[m.ri][1] + 0.5 - c.z) < 0.5) m.ri++;
    if (m.ri >= r.length) {
      // the end of the route: the camp, or the piece of it it chose to go through
      if (m.goal && this.standing(z, m.goal)) { this.swing(c, m, m.goal); return true; }
      m.route = null; m.goal = null;
      return true;
    }
    const tx = r[m.ri][0] + 0.5, tz = r[m.ri][1] + 0.5, ddx = tx - c.x, ddz = tz - c.z, dd = Math.hypot(ddx, ddz) || 1;
    const sp = (c.sp.walk ?? 1) * 1.15;
    steer(c, (ddx / dd) * sp, (ddz / dd) * sp, dt);
    c.targetFacing = heading(c, ddx, ddz);
    c.speed = sp;
    m.chk -= dt;
    if (m.chk <= 0) {
      m.chk = 0.8;
      const moved = Math.hypot(c.x - m.lx, c.z - m.lz);
      m.lx = c.x; m.lz = c.z;
      m.stuck = moved < 0.35 ? m.stuck + 1 : 0;
    }
    if (m.stuck >= 2) {
      const ob = this.obstacle(z, c, m);
      if (ob) { this.swing(c, m, ob); return true; }
      if (m.stuck === 5) { m.route = null; }
      if (m.stuck > 10) { this.endProbe(c); return false; }
    }
    return true;
  }
  /** wind up a blow at a piece of the camp */
  private swing(c: any, m: Probe, ob: Obst) {
    m.tgt = ob;
    const ox = ob.kind === 'obj' ? ob.x : ob.mx, oz = ob.kind === 'obj' ? ob.z : ob.mz;
    c.targetFacing = Math.atan2(oz - c.z, ox - c.x);
    c.speed = 0; c.vx *= 0.3; c.vz *= 0.3;
    c.attackPhase = 0.6;
    if (c.sp.sounds?.attack && Math.random() < 0.5) G.audio?.at?.(c.sp.sounds.attack, c.x, c.z, 0.7);
  }
  /** is this piece of the camp still in the way */
  private standing(z: Zone, ob: Obst): boolean {
    if (ob.kind === 'obj') return z.objects.get(ob.o.uid) === ob.o;
    const e = z.edge(ob.x, ob.y, ob.side);
    if (ob.kind === 'door') return !!e && e.kind === 'door' && !e.open;
    const wid = ob.side === 0 ? z.wallN[z.idx(ob.x, ob.y)] : z.wallW[z.idx(ob.x, ob.y)];
    return !!wid && !(e && e.open);
  }
  /** the way in: straight to the claim (doors count as open), or else to the outside of the nearest built piece of it */
  private plan(z: Zone, c: any, m: Probe) {
    const sx = Math.floor(c.x), sy = Math.floor(c.z), bx = Math.floor(m.x), by = Math.floor(m.z);
    m.ri = 0; m.goal = null; m.stuck = 0;
    m.route = findPath(z, sx, sy, bx, by, { creature: true, doors: true, maxNodes: 6000 });
    if (m.route) return;
    const b = z.objects.get(m.b);
    const R = (b ? this.claimR(b) : 12) + 2;
    const obs: Obst[] = [];
    for (const [k] of Object.entries(builtWalls(z))) {
      const [x, y, side] = k.split(',').map(Number) as [number, number, 0 | 1];
      if (Math.hypot(x - m.x, y - m.z) > R) continue;
      const e = z.edge(x, y, side);
      const ob: Obst = { kind: e && e.kind === 'door' ? 'door' : 'wall', x, y, side, mx: side === 0 ? x + 0.5 : x, mz: side === 0 ? y : y + 0.5 };
      if (this.standing(z, ob)) obs.push(ob);
    }
    for (const o of z.objects.values()) {
      if (Math.hypot(o.x - m.x, o.y - m.z) > R) continue;
      const d = objDef(o.key);
      if (!d || !o.state.built || (d.block !== 'solid' && !d.tags?.includes('barricade'))) continue;
      const cc = centreOf(o);
      obs.push({ kind: 'obj', o, x: cc.x, z: cc.z });
    }
    const pos = (ob: Obst) => (ob.kind === 'obj' ? [ob.x, ob.z] : [ob.mx, ob.mz]);
    obs.sort((a, b2) => { const [ax, az] = pos(a), [bx2, bz2] = pos(b2); return Math.hypot(ax - c.x, az - c.z) - Math.hypot(bx2 - c.x, bz2 - c.z); });
    for (const ob of obs.slice(0, 8)) {
      // the tile on its far side from the camp
      const cands: [number, number][] = ob.kind === 'obj'
        ? [[ob.o.x - 1, ob.o.y], [ob.o.x + 1, ob.o.y], [ob.o.x, ob.o.y - 1], [ob.o.x, ob.o.y + 1]]
        : ob.side === 0 ? [[ob.x, ob.y], [ob.x, ob.y - 1]] : [[ob.x, ob.y], [ob.x - 1, ob.y]];
      cands.sort((a, b2) => Math.hypot(b2[0] + 0.5 - m.x, b2[1] + 0.5 - m.z) - Math.hypot(a[0] + 0.5 - m.x, a[1] + 0.5 - m.z));
      for (const [ox, oy] of cands.slice(0, ob.kind === 'obj' ? 2 : 1)) {
        if (!z.inb(ox, oy) || !z.floor[z.idx(ox, oy)]) continue;
        const r = findPath(z, sx, sy, ox, oy, { creature: true, doors: true, maxNodes: 6000 });
        if (r) { m.route = r; m.goal = ob; return; }
      }
    }
  }
  /** what is between a probing creature and the camp, within a lunge */
  private obstacle(z: Zone, c: any, m: Probe): Obst | null {
    const gx = m.x - c.x, gz = m.z - c.z, gl = Math.hypot(gx, gz) || 1;
    let best: Obst | null = null, bs = 1e9;
    const score = (x: number, zz: number) => { const dx = x - c.x, dz = zz - c.z, d = Math.hypot(dx, dz); if (d > 1.9) return 1e9; const dot = (dx * gx + dz * gz) / (gl * (d || 1)); return dot < -0.2 ? 1e9 : d - dot * 0.8; };
    const tx = Math.floor(c.x), ty = Math.floor(c.z);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!z.inb(x, y)) continue;
      for (const o of z.objectsAt(x, y)) {
        const d = objDef(o.key);
        if (!d || d.block === 'none' || !(pieceForObj(o.key) || d.tags?.includes('barricade'))) continue;
        const cc = centreOf(o), s = score(cc.x, cc.z);
        if (s < bs) { bs = s; best = { kind: 'obj', o, x: cc.x, z: cc.z }; }
      }
      for (const side of [0, 1] as const) {
        const wid = side === 0 ? z.wallN[z.idx(x, y)] : z.wallW[z.idx(x, y)];
        const e = z.edge(x, y, side);
        const built = !!builtWalls(z)[edgeKey(x, y, side)];
        if (!built) continue;
        if (e && e.kind === 'door' && e.open) continue;
        if (!wid && !(e && e.kind === 'door')) continue;
        const mx = side === 0 ? x + 0.5 : x, mz = side === 0 ? y : y + 0.5;
        const s = score(mx, mz);
        if (s < bs) { bs = s; best = { kind: e && e.kind === 'door' ? 'door' : 'wall', x, y, side, mx, mz }; }
      }
    }
    return best;
  }
  private bashLand(c: any, z: Zone, m: Probe) {
    const ob = m.tgt!; m.tgt = null;
    const a = c.sp.attack;
    const dmg = Math.max(10, ((a?.dmg?.[0] ?? 5) + (a?.dmg?.[1] ?? 10)) * 1.4);
    m.hits++; m.stuck = 0;
    const local = z.key === G.local?.zoneKey;
    if (ob.kind === 'obj') {
      if (!z.objects.has(ob.o.uid)) return;
      const metal = objDef(ob.o.key)?.sound === 'metal';
      G.destruct?.damageObject?.(null, ob.o, dmg, 'blunt', { x: ob.x, y: 0.8, z: ob.z }, [ob.x - c.x, ob.z - c.z]);
      if (local) G.audio?.at?.(metal ? 'dmg_hit_metal' : 'dmg_hit_wood', ob.x, ob.z, 1);
    } else if (ob.kind === 'wall') {
      const n: 1 | -1 = ob.side === 0 ? (c.z > ob.y ? 1 : -1) : (c.x > ob.x ? 1 : -1);
      op('wallSmash', { z: z.key, x: ob.x, y: ob.y, side: ob.side, d: Math.round(dmg), how: 'blunt', by: null, u: 0.3 + Math.random() * 0.4, h: 0.6 + Math.random() * 0.9, n });
    } else {
      const e = z.edge(ob.x, ob.y, ob.side); if (!e) return;
      const hp = e.hp - dmg;
      if (hp <= 0) { op('edge', { z: z.key, x: ob.x, y: ob.y, side: ob.side, patch: { locked: false, open: true, hp: Math.round(e.maxHp * 0.3), barricade: 0 } }); if (local) G.audio?.at?.('dmg_break_wood', ob.mx, ob.mz, 1); }
      else { op('edge', { z: z.key, x: ob.x, y: ob.y, side: ob.side, patch: { hp: Math.round(hp) } }); if (local) G.audio?.at?.('door_kick', ob.mx, ob.mz, 1); }
    }
    if (local) {
      const p = G.local;
      const d = p ? Math.hypot(p.x - c.x, p.z - c.z) : 99;
      if (d < 18) shake(Math.max(0.03, 0.18 - d * 0.01));
      if (m.hits === 1) this.note(p, d < 18 ? 'Something is hammering on the camp.' : 'Banging. From the camp.');
    }
    bus.emit('noise', { x: c.x, z: c.z, radius: 16, kind: 'bang', zone: z.key });
  }
  private hasInClaim(z: Zone, b: TileObject, key: string) {
    const R = this.claimR(b);
    for (const o of z.objects.values()) if (o.key === key && Math.hypot(o.x - b.x, o.y - b.y) <= R) return true;
    return false;
  }

  // ================================================================ upkeep (host)
  private upkeep(z: Zone) {
    const d = day();
    if (d === this.lastDay) return;
    const first = this.lastDay < 0;
    this.lastDay = d;
    if (first) return;
    for (const b of z.objects.values()) {
      if (!(b.key in CLAIM_OBJS)) continue;
      const R = this.claimR(b);
      let beds = 0;
      const food: { it: any; ref: string }[] = [];
      for (const o of z.objects.values()) {
        if (Math.hypot(o.x - b.x, o.y - b.y) > R) continue;
        if (objDef(o.key)?.tags?.includes('bed') && o.state.built) beds++;
        if (o.inv && o.state.built) for (const it of o.inv.items) if (itemDef(it.key).cat === 'food' && !(it.cooked && it.cooked >= 1.6)) food.push({ it, ref: 'obj:' + o.uid });
      }
      if (!beds) continue;
      const eat = Math.min(beds, food.length);
      for (let i = 0; i < eat; i++) op('bldStoreTake', { z: z.key, ref: food[i].ref, uid: food[i].it.uid, uses: null });
      const fed = eat >= beds;
      op('objState', { z: z.key, uid: b.uid, patch: { fedDay: fed ? d : (b.state.fedDay ?? -1), hungry: !fed } });
      if (G.local && G.local.zoneKey === z.key) {
        if (fed) this.note(G.local, eat === 1 ? 'The camp ate a meal out of the crate. One day more.' : `The camp ate ${eat} meals out of its stores.`);
        else setTimeout(() => voss('Your camp\'s stores are empty, unit. A camp that does not eat is not much of a camp. Put food in the crates.'), 1200);
      }
    }
  }
  /** settlement comfort: a fed camp is a comfortable one (src/build/settlement.ts) */
  upkeepBonus(b: TileObject): number { return b.state.hungry ? -3 : b.state.fedDay === day() || b.state.fedDay === day() - 1 ? 2 : 0; }

  // ================================================================ beds
  private beds(z: Zone, p: Player, dt: number) {
    if (!p.sleeping) { this.bedT = 0; return; }
    this.bedT += dt;
    if (this.bedT < 3 || this.bedHeldDay === day()) return;
    const bed = (G.interact?.objectsNear?.(p, 1.4) || []).find((o: TileObject) => objDef(o.key)?.tags?.includes('bed') && o.state.built);
    if (!bed) return;
    this.bedHeldDay = day();
    mark('camp:bed');
    void holdCheckpoint(p, bed, 'bed', true);
  }
  makeBed(p: Player, o: TileObject) {
    const c = centreOf(o);
    queueAt(p, c.x, c.z, new UseObjectAction(p, 'Make the bed', 1.6, 'craft', () => { this.bedHeldDay = day(); void holdCheckpoint(p, o, 'bed', true); mark('camp:bed'); }), 1.6);
  }

  // ================================================================ radio
  radio(p: Player, o: TileObject) {
    const c = centreOf(o);
    queueAt(p, c.x, c.z, new UseObjectAction(p, 'Call in', 2.2, 'hold_item', () => {
      G.audio?.at?.('radio_on', c.x, c.z, 0.7); G.audio?.at?.('static_burst', c.x, c.z, 0.4);
      mark('camp:radio');
      const L = G.build?.settle?.local?.();
      const s = L?.s;
      const parts: string[] = [];
      if (s) parts.push(`${s.rank.toLowerCase()}. Defence ${s.def}, comfort ${s.comfort}, food ${s.food}, power ${s.power >= 0 ? '+' : ''}${s.power}.`);
      const until = this.nextProbe - G.time;
      if (this.probing) parts.push('Something is at your camp right now. Get to it.');
      else if (this.nextProbe > 0 && until < 150) parts.push('I can hear something moving round the edges. Shut the doors.');
      else parts.push('Quiet out there. It will not stay quiet.');
      const b = L?.b;
      if (b?.state.hungry) parts.push('And feed the place: the crates are empty.');
      voss('Calder here. Your camp: ' + parts.join(' '));
    }), 1.6);
  }

  // ================================================================ still / traps menus
  private pour(p: Player, o: TileObject) {
    const have = o.state.feed ?? 0, room = 12 - have;
    const v = p.allItems().find((i) => i.fluid && (i.fluid.type === 'tainted' || i.fluid.type === 'water' || String(i.fluid.type).includes('water')) && i.fluid.amount > 0.05);
    if (!v || room <= 0.05) { bus.emit('think', p, room <= 0.05 ? 'The pot is full.' : 'I need a bottle of water to pour in. Any water.'); return; }
    const c = centreOf(o);
    queueAt(p, c.x, c.z, new UseObjectAction(p, 'Pour', 1.6, 'pour', () => {
      if (!v.fluid) return;
      const amt = Math.min(room, v.fluid.amount);
      v.fluid.amount -= amt; if (v.fluid.amount <= 0.01) v.fluid = null;
      op('objState', { z: p.zoneKey, uid: o.uid, patch: { feed: Math.round((have + amt) * 100) / 100 } });
      G.audio?.at?.('pour', c.x, c.z, 0.7);
      bus.emit('inventoryChanged', p);
      if (!o.state.lit) bus.emit('think', p, 'Now it needs a fire under it.');
    }), 1.5);
  }
  private rearm(p: Player, o: TileObject) {
    const c = centreOf(o);
    queueAt(p, c.x, c.z, new UseObjectAction(p, 'Re-arm', 2.2, 'craft', () => { op('objState', { z: p.zoneKey, uid: o.uid, patch: { sprung: false } }); G.audio?.at?.('cy_squeal', c.x, c.z, 0.6); }), 1.3);
  }
  private menu(p: Player, o: TileObject, out: MenuOption[]) {
    if (o.key === 'bld_still') { out.unshift({ label: `Pour water in (${(o.state.feed ?? 0).toFixed(1)} / 12 L)`, action: () => this.pour(p, o) }); out.push({ label: `Clean water: ${(o.state.water ?? 0).toFixed(1)} L`, disabled: true }); }
    if (o.key === 'bld_condenser') out.push({ label: `Clean water: ${(o.state.water ?? 0).toFixed(1)} / 16 L${this.powered(G.getZone(p.zoneKey), o) ? ' (fan running)' : ''}`, disabled: true });
    if (o.key === 'bld_jaw_trap' && o.state.sprung) out.unshift({ label: 'Re-arm the trap', action: () => this.rearm(p, o) });
    if (o.key === 'bld_radio') out.unshift({ label: 'Call in on the radio', action: () => this.radio(p, o) });
    if (objDef(o.key)?.tags?.includes('bed') && o.state.built) out.push({ label: 'Make this your bed (hold a checkpoint)', action: () => this.makeBed(p, o) });
  }
  /** the floating [E] labels for camp pieces in reach (src/ui/hotbar/context.ts reads G.ctxHooks) */
  private ctx(p: Player): unknown[] {
    const out: unknown[] = [];
    if (p.body.dead || G.build?.active) return out;
    const near = (G.interact?.objectsNear?.(p, 1.6) || []) as TileObject[];
    for (const o of near) {
      const d = objDef(o.key); if (!d) continue;
      const c = centreOf(o), at = { x: c.x, y: (p.y ?? 0) + c.h + 0.3, z: c.z };
      const base = { tgt: 'o:' + o.uid, name: d.name, anchor: () => at };
      if (o.key === 'bld_radio') out.push({ id: 'camp_radio', label: 'Call in', icon: 'open', key: 'E', run: () => this.radio(p, o), head: 'Call in', ...base });
      else if (o.key === 'bld_still') out.push({ id: 'camp_pour', label: 'Pour water', icon: 'open', key: 'E', run: () => this.pour(p, o), head: 'Pour water', ...base });
      else if (o.key === 'bld_jaw_trap' && o.state.sprung) out.push({ id: 'camp_rearm', label: 'Re-arm', icon: 'open', key: 'E', run: () => this.rearm(p, o), head: 'Re-arm', ...base });
      else if (d.tags?.includes('bed') && o.state.built && G.role !== 'client') out.push({ id: 'camp_bed', label: 'Hold checkpoint', icon: 'open', key: 'U', run: () => this.makeBed(p, o), head: 'Make your bed', ...base });
      if (out.length >= 2) break;
    }
    return out;
  }

  // ================================================================ built / upgraded
  private onBuilt(z: Zone, pc: Piece, by: string | null, up = false) {
    if (by !== G.local?.id || isReplaying()) return;
    if (up) { bump('bld_upgrade'); mark('upgrade:' + pc.key); }
    if (pc.key === 'camp_flag' || pc.key === 'beacon') { mark('camp:claim'); if (this.nextProbe < 0) this.nextProbe = G.time + 300 + Math.random() * 180; }
    if (pc.key === 'camp_flag') setTimeout(() => voss('A flag. Good. Eight metres round it are your camp now. Anything that wanders in has to get through what you put up.'), 900);
    // fresh water pieces start dry
    if (pc.kind === 'obj' && pc.obj && ['bld_rain_barrel', 'bld_condenser', 'bld_still'].includes(pc.obj)) {
      setTimeout(() => {
        for (const o of z.objects.values()) if (o.key === pc.obj && o.state.water === undefined) op('objState', { z: z.key, uid: o.uid, patch: { water: 0, feed: 0, boiled: pc.obj !== 'bld_rain_barrel' } });
      }, 50);
    }
  }

  /** start an upgrade of a built piece or wall in the hands (U in build mode); false = could not */
  upgrade(p: Player, h: { kind: 'piece'; o: TileObject } | { kind: 'wall'; x: number; y: number; side: 0 | 1; key: string }, mats: { has: (pc: [string, number][]) => string[]; take: (pc: [string, number][]) => void; unlocked: (pc: Piece) => boolean }): boolean {
    const fromKey = h.kind === 'wall' ? h.key : pieceForObj(h.o.key)?.key;
    if (!fromKey) return false;
    const to = upgradeOf(fromKey);
    if (!to) { bus.emit('think', p, 'That is as good as it gets.'); return false; }
    if (!mats.unlocked(to)) { bus.emit('think', p, `I'd need the ${to.name} blueprint. The lab's research has it, between runs.`); G.audio?.ui?.('dryfire'); return false; }
    const cost = upgradeCost(to);
    const miss = mats.has(cost);
    if (miss.length) { bus.emit('think', p, 'To upgrade it I need ' + miss.join(', ') + '.'); G.audio?.ui?.('dryfire'); return false; }
    const tool = welderFor(p, to);
    if (!tool) { bus.emit('think', p, to.join === 'nail' ? 'I need a hammer for this.' : 'That upgrade wants a welding torch.'); G.audio?.ui?.('dryfire'); return false; }
    if (h.kind === 'piece' && h.o.inv?.items.length && !objDef(to.obj ?? '')?.container) { bus.emit('think', p, 'Empty it first.'); return false; }
    const zk = p.zoneKey;
    const at = h.kind === 'wall' ? { x: h.side === 0 ? h.x + 0.5 : h.x, z: h.side === 0 ? h.y : h.y + 0.5, h: 2.4 } : (() => { const c = centreOf(h.o); return { x: c.x, z: c.z, h: c.h }; })();
    queueAt(p, at.x, at.z, new UpgradeAction(p, at, to, tool, () => {
      const z = G.zones.get(zk); if (!z) return;
      if (mats.has(cost).length) { bus.emit('think', p, 'Not enough left to finish it.'); return; }
      mats.take(cost);
      if (h.kind === 'wall') op('bldUpgrade', { z: zk, x: h.x, y: h.y, side: h.side, to: to.key, by: p.id });
      else { if (z.objects.get(h.o.uid) !== h.o) return; op('bldUpgrade', { z: zk, uid: h.o.uid, to: to.key, nu: uid(), cu: uid(), by: p.id }); }
    }), 1.8);
    return true;
  }

  /** a lit camp with a bench is quicker to work in (src/build/speed.ts) */
  campBonus(p: Player, kind: 'build' | 'craft'): number {
    const b = G.build?.settle?.claimAt?.(p.zoneKey, p.x, p.z) as TileObject | null;
    if (!b) return 1;
    const z = G.zones.get(p.zoneKey); if (!z) return 1;
    let bench = false, light = false;
    const R = this.claimR(b);
    for (const o of z.objects.values()) {
      if (Math.abs(o.x - b.x) > R || Math.abs(o.y - b.y) > R) continue;
      const d = objDef(o.key);
      if (d?.tags?.includes('workbench')) bench = true;
      if (d?.light && o.state.built) light = true;
      if (bench && light) break;
    }
    return bench && light ? (kind === 'craft' ? 1.15 : 1.1) : 1;
  }

  /** linked camp stores (for build mode) */
  stores(p: Player) { return stores(p); }
  take(p: Player, it: any, uses: number | null) { return takeFromStore(p, it, uses); }

  /** dev: send a probe at the nearest claim right now */
  probeNow(): any {
    const p = G.local; if (!p) return null;
    const z = G.getZone(p.zoneKey);
    const b = this.homeClaim(z, p); if (!b) return null;
    if (this.probing) this.endProbe(G.creatures?.creatures?.get?.(this.probing));
    this.nextProbe = G.time + 360;
    return this.startProbe(z, b, p);
  }
}

/** one straight segment of cable (a thin box along the segment) */
function rodSeg(mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
  mb.push().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mb.rotateY(-Math.atan2(dz, dx)).rotateZ(Math.atan2(dy, Math.hypot(dx, dz)));
  mb.box(0, -r, 0, L + 0.01, r * 2, r * 2, 'rubber_black', { ao: false });
  mb.pop();
}

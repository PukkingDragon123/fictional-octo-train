// Settlements: a Claim Beacon makes everything within its radius one base with
// four stats (defence, comfort, food, power) and a rank from Camp to MEGA BASE.
// The base is just world objects and walls, so it persists in saves and
// replicates in co-op through the op log. Stations (planters, benches,
// turrets, stoves, generators, lockers) can be staffed by workers: robot
// thralls from the dominion system call assignWorker / stationWork.
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { objDef } from '../world/objects';
import { itemDef } from '../items/item';
import type { Zone, TileObject } from '../world/zone';
import { pieceForObj, piece, type Piece } from './pieces';
import { createItem, serializeItem } from '../items/factory';
import { builtWalls } from './ops';
import { isPlanter } from './farm';
import { mark } from './progress';

export const CLAIM_R = 12;
export interface SettleStats { def: number; comfort: number; food: number; power: number; beds: number; stations: number; workers: number; crops: number; score: number; rank: string }
export interface Station { uid: number; z: string; x: number; y: number; kind: NonNullable<Piece['station']>; worker: string | null; claim: number | null; name: string }

const RANKS: [number, string][] = [[0, 'CAMP'], [12, 'OUTPOST'], [28, 'SETTLEMENT'], [55, 'STRONGHOLD'], [90, 'MEGA BASE']];
export const rankOf = (score: number) => { let r = RANKS[0][1]; for (const [s, n] of RANKS) if (score >= s) r = n; return r; };

export class Settlement {
  /** last computed stats per beacon uid */
  cache = new Map<number, SettleStats>();
  private t = 0;

  beacons(z: Zone): TileObject[] { const out: TileObject[] = []; for (const o of z.objects.values()) if (o.key === 'bld_beacon') out.push(o); return out; }

  /** the claim (beacon) covering this point, if any */
  claimAt(zk: string, x: number, y: number): TileObject | null {
    const z = G.zones.get(zk); if (!z) return null;
    let best: TileObject | null = null, bd = 1e9;
    for (const b of this.beacons(z)) { const d = Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y); if (d <= CLAIM_R && d < bd) { bd = d; best = b; } }
    return best;
  }

  compute(z: Zone, b: TileObject): SettleStats {
    const s: SettleStats = { def: 0, comfort: 0, food: 0, power: 0, beds: 0, stations: 0, workers: 0, crops: 0, score: 0, rank: 'CAMP' };
    const bx = b.x + 0.5, by = b.y + 0.5, R = CLAIM_R;
    let gen = 0, use = 0, stored = 0;
    for (const o of z.objects.values()) {
      if (Math.abs(o.x - b.x) > R || Math.abs(o.y - b.y) > R || Math.hypot(o.x + 0.5 - bx, o.y + 0.5 - by) > R) continue;
      const d = objDef(o.key); if (!d) continue;
      const pc = pieceForObj(o.key);
      if (pc?.stats) {
        s.def += pc.stats.def ?? 0; s.comfort += pc.stats.comfort ?? 0; s.food += pc.stats.food ?? 0;
        const pw = pc.stats.power ?? 0;
        if (pw > 0) { if (o.state.on && (o.state.fuel ?? 0) > 0) gen += pw; } else use -= pw;
      } else {
        // scavenged furniture counts too
        if (d.sleep) s.comfort += 2; else if (d.sit) s.comfort += 0.5;
        if (d.light) s.comfort += 0.5;
        if (d.heat) s.food += 1;
        if (d.tags?.includes('generator') && o.state.on && (o.state.fuel ?? 0) > 0) gen += 4;
        if (d.tags?.includes('trap')) s.def += 1;
      }
      if (d.sleep) s.beds++;
      if (pc?.station) { s.stations++; if (o.state.worker) { s.workers++; this.workerBonus(s, pc.station); } }
      if (isPlanter(o) && o.state.crop && !o.state.dead) { s.crops++; s.food += Math.floor(o.state.stage ?? 0) >= 4 ? 2 : 1; }
      if (o.inv) for (const it of o.inv.items) if (itemDef(it.key).cat === 'food') stored++;
    }
    // walls this crew put up
    for (const [k, key] of Object.entries(builtWalls(z))) {
      const [x, y] = k.split(',').map(Number);
      if (Math.hypot(x + 0.5 - bx, y + 0.5 - by) > R) continue;
      s.def += piece(key)?.stats?.def ?? 0;
    }
    s.food += Math.min(8, Math.floor(stored / 6));
    s.power = gen - use;
    s.def = Math.round(s.def); s.comfort = Math.round(s.comfort); s.food = Math.round(s.food);
    s.score = s.def + s.comfort + s.food + Math.max(0, s.power) * 2;
    s.rank = rankOf(s.score);
    return s;
  }
  private workerBonus(s: SettleStats, kind: string) {
    if (kind === 'guard') s.def += 3; else if (kind === 'farm') s.food += 2; else if (kind === 'kitchen') s.comfort += 2; else if (kind === 'power') s.power += 1; else s.comfort += 1;
  }

  /** stats of the claim the local survivor stands in (or the nearest in build mode) */
  local(): { b: TileObject; s: SettleStats } | null {
    const p = G.local; if (!p) return null;
    const b = this.claimAt(p.zoneKey, p.x, p.z); if (!b) return null;
    const s = this.cache.get(b.uid) ?? this.compute(G.getZone(p.zoneKey), b);
    return { b, s };
  }

  update(dt: number, buildMode: boolean) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.2;
    const p = G.local; if (!p) return;
    const z = G.zones.get(p.zoneKey); if (!z) return;
    for (const b of this.beacons(z)) {
      const s = this.compute(z, b);
      this.cache.set(b.uid, s);
      // milestones (quests read these flags)
      if (s.def >= 10) mark('settle:def10');
      if (s.score >= 28) mark('settle:settlement');
      if (s.rank === 'MEGA BASE') mark('settle:mega');
      if (s.crops >= 4) mark('settle:farm4');
    }
    void buildMode;
  }

  // ---------------------------------------------------------------- stations & workers (hooks for robot thralls)
  /** every staffable station in a zone (default: the local survivor's), with its claim */
  stations(zoneKey?: string): Station[] {
    const zk = zoneKey ?? G.local?.zoneKey; const z = zk ? G.zones.get(zk) : null; if (!z) return [];
    const out: Station[] = [];
    for (const o of z.objects.values()) {
      const pc = pieceForObj(o.key); if (!pc?.station) continue;
      const c = this.claimAt(z.key, o.x + 0.5, o.y + 0.5);
      out.push({ uid: o.uid, z: z.key, x: o.x + 0.5, y: o.y + 0.5, kind: pc.station, worker: (o.state.worker as string) ?? null, claim: c?.uid ?? null, name: pc.name });
    }
    return out;
  }
  /** put a worker (any id: a thrall, a creature, a player) on a station, or take it off (null) */
  assignWorker(zoneKey: string, stationUid: number, workerId: string | null): boolean {
    const z = G.zones.get(zoneKey); const o = z?.objects.get(stationUid);
    if (!z || !o || !pieceForObj(o.key)?.station) return false;
    if (workerId) for (const q of z.objects.values()) if (q !== o && q.state.worker === workerId) op('objState', { z: zoneKey, uid: q.uid, patch: { worker: null } });
    op('objState', { z: zoneKey, uid: stationUid, patch: { worker: workerId } });
    bus.emit('stationAssigned', { z: zoneKey, uid: stationUid, worker: workerId });
    return true;
  }
  workerOf(zoneKey: string, stationUid: number): string | null { return (G.zones.get(zoneKey)?.objects.get(stationUid)?.state.worker as string) ?? null; }

  /**
   * Host: a worker spent dt seconds at a station. Farms get tended, forges turn
   * scrap from nearby lockers into sheet metal, generators get topped up,
   * turrets are manned (sharper aim). Returns what happened, for the worker's AI.
   */
  stationWork(zoneKey: string, stationUid: number, dt: number): string {
    const z = G.zones.get(zoneKey); const o = z?.objects.get(stationUid);
    if (!z || !o) return 'none';
    const pc = pieceForObj(o.key); if (!pc?.station) return 'none';
    o.state.workT = (o.state.workT ?? 0) + dt;
    switch (pc.station) {
      case 'farm': G.build?.farm?.tend?.(z, o, dt); return 'tend';
      case 'power': if (o.state.workT > 30) { o.state.workT = 0; op('objState', { z: zoneKey, uid: o.uid, patch: { fuel: Math.min(10, (o.state.fuel ?? 0) + 0.25), on: true } }); } return 'fuel';
      case 'guard': o.state.manned = 1; return 'guard';
      case 'forge': {
        if (o.state.workT < 45) return 'work';
        o.state.workT = 0;
        const src = [...z.objects.values()].find((q) => q.inv && Math.hypot(q.x - o.x, q.y - o.y) < 4 && q.inv.items.filter((i) => i.key === 'scrap_metal').length >= 3);
        if (src) op('bldCraft', { z: zoneKey, ref: 'obj:' + src.uid, take: src.inv!.items.filter((i) => i.key === 'scrap_metal').slice(0, 3).map((i) => i.uid), give: serializeItem(createItem('sheet_metal')) });
        return src ? 'produce' : 'idle';
      }
      default: return 'idle';
    }
  }
}

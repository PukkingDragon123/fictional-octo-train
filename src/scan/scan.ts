// Scanning for DATA. Point at anything (a creature, an anomaly, a piece of
// furniture, a tribe totem, a stranger, an item on the floor) and hold SCAN
// (N): the watch (research node 'watch_scan') or a handheld Data Probe sweeps
// it. Every scan yields DATA (a persistent profile stat); first scans of a
// kind, anomalies and data milestones pay Research Points (grantResearch) and
// unlock a knowledge entry (profile 'scan:<kind>:<key>') the watch can list
// as a bestiary (G.scan.entries()). Old SEER-9 creature scans feed the same
// pipeline. Bus: 'scanEntry' {kind, key, title, first, data, rp},
// 'scanned' (creature, as before), 'scanData' {data, total}.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';
import { defNode, hasUnlock, grantResearch } from '../game/research';
import { addStat, stat, unlock, isUnlocked, unlockedIds } from '../game/profile';
import { objDef } from '../world/objects';
import { itemDef } from '../items/item';
import { species as getSpecies } from '../creatures/registry';
import { scanSounds } from './sounds';
import { Scope } from './scope';

export type ScanKind = 'creature' | 'tribe' | 'anomaly' | 'artefact' | 'object' | 'item' | 'survivor';

export interface ScanTarget {
  kind: ScanKind;
  key: string;
  title: string;
  cls: string;
  notes: string[];
  x: number; y: number; z: number;
  threat?: number;
  ref?: any;
}

export interface ScanEntry { kind: ScanKind; key: string; title: string; cls: string; notes: string[]; count: number }

defNode({ key: 'watch_scan', branch: 'watch', title: 'SCAN', cost: 4, icon: 'scan',
  desc: 'The watch learns to sweep what you point at: hold N on a creature, anomaly, object or stranger for DATA. First scans pay research.' });
defNode({ key: 'scan_deep', branch: 'watch', title: 'DEEP SCAN', cost: 14, requires: ['watch_scan'], icon: 'scan',
  desc: 'Longer reach (18 m), faster sweeps and half again as much DATA from every scan.' });

/** DATA milestones and the research they pay */
const MILESTONES: [number, number][] = [[40, 3], [120, 4], [250, 5], [450, 6], [700, 8], [1000, 10], [1500, 12], [2200, 15], [3000, 18], [4000, 22], [5500, 26], [7500, 30]];

const ANOMALY_TAGS = ['anomaly', 'glitch', 'story', 'weird', 'wrong', 'replica', 'node'];

/** registry for knowledge entries the scanner cannot derive from content (tribes, artefacts) */
const EXTRA = new Map<string, { title: string; cls: string; notes: string[] }>();
export function defScanInfo(kind: ScanKind, key: string, info: { title: string; cls: string; notes: string[] }) { EXTRA.set(kind + ':' + key, info); }

export class ScanSystem implements GameSystem {
  name = 'scan';
  /** the sweep in progress */
  active: { t: ScanTarget; prog: number; dur: number; lost: number; hold: boolean } | null = null;
  /** the handheld readout: CRT, needle, punch cards */
  scope: Scope;
  private emitting = false;
  private humT = 0;
  private hintT = 0;

  constructor() {
    G.scan = this;
    scanSounds();
    this.scope = new Scope();
    // the SEER-9 (if it is still around) scans creatures its own way: count those too
    bus.on('scanned', (c: any) => { if (!this.emitting && c?.sp) this.complete(this.creatureTarget(c), true); });
  }

  // ---------------------------------------------------------------- queries
  get data(): number { return stat('scan_data'); }
  /** can the local survivor scan at all (watch function or a handheld probe) */
  canScan(): boolean { return hasUnlock('watch_scan') || !!this.probe(); }
  probe() { return G.local?.findTool?.('#data_probe'); }
  range() { return hasUnlock('scan_deep') || hasUnlock('tool_beam') ? 18 : 10; }
  /** how many times this thing has been scanned (persistent) */
  count(kind: ScanKind, key: string) { return stat(`scan_n:${kind}:${key}`); }
  known(kind: ScanKind, key: string) { return isUnlocked(`scan:${kind}:${key}`); }

  /** every knowledge entry so far (bestiary / codex for the watch) */
  entries(kind?: ScanKind): ScanEntry[] {
    const out: ScanEntry[] = [];
    for (const id of unlockedIds('scan:')) {
      const [, k, key] = id.split(':') as [string, ScanKind, string];
      if (kind && k !== kind) continue;
      const info = this.info(k, key);
      out.push({ kind: k, key, ...info, count: this.count(k, key) });
    }
    return out;
  }

  info(kind: ScanKind, key: string): { title: string; cls: string; notes: string[] } {
    const x = EXTRA.get(kind + ':' + key);
    if (x) return x;
    if (kind === 'creature') { const sp: any = getSpecies(key); if (sp) return { title: sp.name, cls: sp.scan?.cls || 'Entity', notes: [...(sp.scan?.notes || []), ...(sp.rule ? [`RULE // ${sp.rule.name}: ${sp.rule.text}`] : [])] }; }
    if (kind === 'object' || kind === 'anomaly' || kind === 'artefact') { const d = objDef(key); if (d) return { title: d.name, cls: kind === 'anomaly' ? 'Anomalous fixture' : kind === 'artefact' ? 'Tribal artefact' : 'Fixture', notes: d.desc ? [d.desc] : [] }; }
    if (kind === 'item') { const d = itemDef(key); return { title: d.name, cls: d.anomaly ? 'Anomalous object' : 'Object', notes: d.desc ? [d.desc] : [] }; }
    return { title: key, cls: 'Unknown', notes: [] };
  }

  // ---------------------------------------------------------------- targets
  creatureTarget(c: any): ScanTarget {
    const tribe = (c.mem?.tribe as string | undefined) || (c.sp.key.startsWith('tribe_') ? c.sp.key.slice(6) : undefined);
    if (tribe) {
      const info = EXTRA.get('tribe:' + tribe);
      return { kind: 'tribe', key: tribe, title: info?.title || c.sp.name, cls: info?.cls || 'Survivor faction', notes: info?.notes || [], x: c.x, y: c.y + c.height * 0.7, z: c.z, threat: 1, ref: c };
    }
    return { kind: 'creature', key: c.sp.key, title: c.sp.name, cls: c.sp.scan?.cls || 'Entity', notes: c.sp.scan?.notes || [], x: c.x, y: c.y + c.height * 0.6, z: c.z, threat: c.sp.threat ?? 1, ref: c };
  }

  /** a scannable description of whatever a pick target is */
  targetOf(t: any): ScanTarget | null {
    if (!t) return null;
    if (t.kind === 'creature' && t.c && !t.c.dead) return this.creatureTarget(t.c);
    if (t.kind === 'creature' && t.c?.dead) { const s = this.creatureTarget(t.c); s.title += ' (remains)'; return s; }
    if (t.kind === 'object' && t.obj) {
      const d = objDef(t.obj.key); if (!d) return null;
      const tags = d.tags || [];
      const kind: ScanKind = tags.includes('tribe') ? 'artefact' : tags.some((g) => ANOMALY_TAGS.includes(g)) ? 'anomaly' : 'object';
      const w = d.w ?? 1, dd = d.d ?? 1, rot = t.obj.rot ?? 0;
      const ox = (rot % 2 ? dd : w) / 2, oz = (rot % 2 ? w : dd) / 2;
      return { kind, key: d.key, title: d.name, cls: '', notes: d.desc ? [d.desc] : [], x: t.obj.x + ox, y: Math.min(1.2, d.height * 0.6), z: t.obj.y + oz, ref: t.obj };
    }
    if (t.kind === 'item' && t.wi) {
      const d = itemDef(t.wi.item.key);
      return { kind: d.anomaly ? 'anomaly' : 'item', key: d.key, title: d.name, cls: '', notes: d.desc ? [d.desc] : [], x: t.wi.x, y: (t.wi.y ?? 0) + 0.1, z: t.wi.z, ref: t.wi };
    }
    if (t.kind === 'player' && t.p && !t.p.isLocal) return { kind: 'survivor', key: 'debtor', title: t.p.name || 'Debtor', cls: 'Remittance debtor', notes: ['Another number on the ledger.'], x: t.p.x, y: 1.4, z: t.p.z, ref: t.p };
    return null;
  }

  /** what the survivor is pointing at, or the nearest living thing in front of them */
  private pickTarget(): ScanTarget | null {
    const h = this.targetOf(G.ui?.hover);
    if (h) return h;
    const p = G.local; if (!p) return null;
    let best: any = null, bd = this.range();
    for (const c of G.creatures?.list?.() || []) {
      if (c.dead || !c.visibleToLocal) continue;
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      const a = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - p.facing), Math.cos(Math.atan2(dz, dx) - p.facing)));
      if (a > 0.9) continue;
      bd = d; best = c;
    }
    return best ? this.creatureTarget(best) : null;
  }

  /** begin sweeping a target (the watch UI may call this directly; hold = only while N is held) */
  begin(t: ScanTarget | null, hold = false): boolean {
    if (!t) return false;
    if (!this.canScan()) {
      if (G.time > this.hintT) { this.hintT = G.time + 4; bus.emit('think', G.local, "Nothing to scan it with. The watch could learn to (research SCAN), or I find a probe."); }
      return false;
    }
    const base = t.kind === 'creature' ? 1.5 + (t.threat ?? 1) * 0.25 : t.kind === 'tribe' || t.kind === 'artefact' ? 1.4 : t.kind === 'anomaly' ? 1.2 : t.kind === 'item' ? 0.5 : 0.8;
    const dur = base * (hasUnlock('scan_deep') ? 0.7 : 1) * (hasUnlock('watch_scan') ? 1 : 1.35);
    this.active = { t, prog: 0, dur, lost: 0, hold };
    G.audio?.ui?.('scan_start', 0.45);
    return true;
  }

  cancel() { this.active = null; }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const p = G.local;
    const inp = G.input;
    if (!p || p.body?.dead) { this.active = null; this.scope.drop(); this.scope.update(dt); return; }
    const held = !inp.textFocus && inp.down('scan');
    if (held && !this.active && inp.hit('scan')) this.begin(this.pickTarget(), true);
    const a = this.active;
    if (a) {
      // follow moving things
      const r = a.t.ref;
      if (r && typeof r.x === 'number' && (a.t.kind === 'creature' || a.t.kind === 'tribe' || a.t.kind === 'survivor')) { a.t.x = r.x; a.t.z = r.z; }
      const d = Math.hypot(a.t.x - p.x, a.t.z - p.z);
      const ok = d <= this.range() && (!r?.zoneKey || r.zoneKey === p.zoneKey);
      if (a.hold && !held) { this.active = null; }
      else if (ok) {
        a.prog += dt / a.dur; a.lost = 0;
        this.humT -= dt;
        if (this.humT <= 0) { this.humT = 0.32; G.audio?.ui?.('scan_tick', 0.22); }
        if (a.prog >= 1) { this.active = null; this.complete(a.t); p.playAnim?.('scanner', 0.6); }
      } else {
        a.lost += dt; a.prog = Math.max(0, a.prog - dt * 0.6);
        if (a.lost > 1.2) this.active = null;
      }
    }
    const cur = this.active;
    if (cur) {
      this.scope.sweep({ title: cur.t.title, cls: cur.t.cls, known: this.known(cur.t.kind, cur.t.key), kind: cur.t.kind }, cur.prog);
      const r = cur.t.ref, size = r?.height ? Math.max(0.6, r.height * 1.2) : 0.9;
      this.scope.mark(cur.t.x, cur.t.y, cur.t.z, size, { x: p.x, y: (p.y ?? 0) + 1.25, z: p.z });
    } else if (a) this.scope.drop();
    this.scope.update(dt);
  }


  // ---------------------------------------------------------------- results
  /** a finished scan: DATA, research for firsts and milestones, a knowledge entry */
  complete(t: ScanTarget, viaSeer = false) {
    const kind = t.kind, key = t.key;
    const n = this.count(kind, key);
    const first = n === 0;
    let base = kind === 'creature' ? 8 + (t.threat ?? 1) * 6 : kind === 'tribe' ? 10 : kind === 'artefact' ? 15 : kind === 'anomaly' ? 6 : kind === 'object' ? 2 : kind === 'survivor' ? 3 : 1;
    if (hasUnlock('scan_deep')) base *= 1.5;
    const data = Math.max(first ? 1 : 0, Math.round(base * (first ? 1 : Math.max(0.1, 0.5 ** n))));
    addStat(`scan_n:${kind}:${key}`, 1);
    let rp = 0;
    if (first) {
      unlock(`scan:${kind}:${key}`);
      rp = kind === 'creature' ? 2 + Math.round(t.threat ?? 1) : kind === 'artefact' ? 4 : kind === 'tribe' ? 3 : kind === 'anomaly' ? 2 : 0;
      // every dozen ordinary things catalogued
      if (kind === 'object' || kind === 'item') { const kinds = unlockedIds('scan:object:').length + unlockedIds('scan:item:').length; if (kinds % 12 === 0) rp += 1; }
    }
    const before = this.data;
    if (data > 0) addStat('scan_data', data);
    // milestones
    let ms = stat('scan_ms');
    while (ms < MILESTONES.length && this.data >= MILESTONES[ms][0]) { rp += MILESTONES[ms][1]; ms++; addStat('scan_ms', 1); bus.emit('scanMilestone', MILESTONES[ms - 1][0]); }
    if (rp > 0) grantResearch(rp, `scan:${kind}:${key}`);
    // creatures: the old flags (codex, mission 'scan:<key>', creature rules)
    const c = t.ref;
    if ((kind === 'creature' || kind === 'tribe') && c?.sp) {
      c.scanned = true;
      if (!viaSeer) { G.missions?.onScan?.(c); this.emitting = true; try { bus.emit('scanned', c); } finally { this.emitting = false; } }
    }
    G.audio?.ui?.(first ? 'scan_new' : 'scanDone', 0.5);
    this.scope.result({ title: t.title, kind: kind === 'creature' ? (t.cls || 'ENTITY') : kind, data, rp, first, total: before + data });
    bus.emit('scanEntry', { kind, key, title: t.title, first, data, rp });
    bus.emit('scanData', { data, total: before + data });
    if (first && t.notes?.length && G.local) bus.emit('think', G.local, t.notes[0].length < 110 ? t.notes[0] : t.notes[0].slice(0, 107) + '...');
  }

}

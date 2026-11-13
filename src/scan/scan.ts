// Scanning for DATA with the unit's suit scanner (round 14: the wrist watch
// is gone; the emitter sits on the visor and needs no research). Point at
// anything (an inhabitant, an anomaly, a piece of furniture, a tribe totem, a
// stranger, an item on the floor) and hold SCAN (Q, or N): a cone of light sweeps it
// in the world (src/scan/sweep.ts) and the action plate over the unit's head
// fills (plate(), read by src/ui/ui.ts). Every scan yields DATA (a persistent
// profile stat); first scans of a kind, anomalies and data milestones pay
// Research Points (grantResearch) and unlock a codex entry (profile
// 'scan:<kind>:<key>', G.scan.entries(); the lab's archive reads them). Dr.
// Calder reads the result out on the subtitle strip (inhabitant sections:
// src/scan/lorebook.ts). Research in the lab (the 'recipe' page of the
// Control Room tree, src/game/unitTree.ts) widens and speeds the sweep:
// SCANNER BEAM ('tool_beam') and DEEP SCAN ('scan_deep'). A Phosphor Scope
// (data_probe) on the belt speeds it a little more. Q is also whistle / shout
// (src/social/social.ts): on Q the scanner only takes an inhabitant, an
// anomaly, an artefact or a stranger in front of the unit, else Q whistles;
// N (scan only) takes anything.
// Round 17: anything worth a scan fights the visor: after the cone finds it the
// SIGNATURE LOCK comes up (two dials, src/ui/minigames/tuner.ts; lockDiff /
// lockEase below). A clean lock finishes early and reads more DATA, a sloppy
// one reads part of it, feedback loses the scan, makes noise and turns the
// inhabitant toward the unit (botch).
// Bus: 'scanEntry' {kind, key, title, first, data, rp, q, ref}, 'scanned' (creature,
// as before), 'scanData' {data, total}, 'anomalyLogged' (anomaly id),
// 'scanLock' {kind, key, q, end: 'clean' | 'time' | 'fail', ref}.
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';
import { defNode, hasUnlock, grantResearch } from '../game/research';
import { addStat, stat, unlock, isUnlocked, unlockedIds } from '../game/profile';
import { objDef } from '../world/objects';
import { itemDef } from '../items/item';
import { species as getSpecies } from '../creatures/registry';
import { scanSounds } from './sounds';
import { loreNotes } from './lorebook';
import { ScanSweep } from './sweep';
import { voss } from '../game/debt/voice';
import * as THREE from 'three';
import { scanTuner, type LockStep } from '../ui/minigames/tuner';
import { talentMul } from '../survival/talents';
import { reqTick } from '../game/reqQuests';

/** round 17: scripted browsers skip the signature lock (the sweep then reads as a clean lock) unless the URL says ?qte */
const AUTO_LOCK = typeof navigator !== 'undefined' && !!navigator.webdriver && !/[?&]qte/.test(location.search);
/** the part of a locking sweep the cone spends finding the target before the scope comes up */
const ACQ = 0.15;

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
  /** carried by the unit (the item menu's study): the sweep plays over its hands */
  held?: boolean;
}

export interface ScanEntry { kind: ScanKind; key: string; title: string; cls: string; notes: string[]; count: number }

// the suit scanner's upgrades (researched in the lab between runs; old saves may own the retired 'watch_scan')
defNode({ key: 'tool_beam', branch: 'scanner', title: 'SCANNER BEAM', cost: 4, icon: 'scan',
  desc: 'A focusing lens for the visor emitter: scans reach 18 m and finish faster.' });
defNode({ key: 'scan_deep', branch: 'scanner', title: 'DEEP SCAN', cost: 14, requires: ['tool_beam'], icon: 'scan',
  desc: 'Longer reach (18 m), faster sweeps and half again as much DATA from every scan.' });

/** DATA milestones and the research they pay */
const MILESTONES: [number, number][] = [[40, 3], [120, 4], [250, 5], [450, 6], [700, 8], [1000, 10], [1500, 12], [2200, 15], [3000, 18], [4000, 22], [5500, 26], [7500, 30]];

/** what Q (shared with whistle) will scan: living things, the anomalous, strangers */
const STRICT = new Set<ScanKind>(['creature', 'tribe', 'anomaly', 'artefact', 'survivor']);

const ANOMALY_TAGS = ['anomaly', 'glitch', 'story', 'weird', 'wrong', 'replica', 'node'];

/** registry for knowledge entries the scanner cannot derive from content (tribes, artefacts) */
const EXTRA = new Map<string, { title: string; cls: string; notes: string[] }>();
export function defScanInfo(kind: ScanKind, key: string, info: { title: string; cls: string; notes: string[] }) { EXTRA.set(kind + ':' + key, info); }

export class ScanSystem implements GameSystem {
  name = 'scan';
  /** the sweep in progress (diff >= 0: it fights the visor and needs the signature lock, src/ui/minigames/tuner.ts) */
  active: { t: ScanTarget; prog: number; dur: number; lost: number; hold: boolean; diff: number; ease: number; latch: boolean } | null = null;
  /** the last lock's result, for tests and other systems */
  lastLock: { kind: ScanKind; key: string; q: number; end: string } | null = null;
  /** the sweep in the world: the cone from the visor, the band over the target, the ring on the floor */
  sweep: ScanSweep;
  private emitting = false;
  private eye = new THREE.Vector3();
  private humT = 0;
  private hintT = 0;
  private failT = 0;
  private knobV = 0;

  constructor() {
    G.scan = this;
    scanSounds();
    this.sweep = new ScanSweep();
    // anything else that scans a creature its own way (bus 'scanned'): count those too
    bus.on('scanned', (c: any) => { if (!this.emitting && c?.sp) this.complete(this.creatureTarget(c), true); });
  }

  // ---------------------------------------------------------------- queries
  get data(): number { return stat('scan_data'); }
  /** can the local survivor scan at all (the suit scanner is built in: always, while alive) */
  canScan(): boolean { return !!G.local && !G.local.body?.dead; }
  probe() { return G.local?.findTool?.('#data_probe'); }
  range() { return (hasUnlock('scan_deep') || hasUnlock('tool_beam') ? 18 : 10) * talentMul(G.local?.body, 'scan'); }
  /** how many times this thing has been scanned (persistent) */
  count(kind: ScanKind, key: string) { return stat(`scan_n:${kind}:${key}`); }
  known(kind: ScanKind, key: string) { return isUnlocked(`scan:${kind}:${key}`); }

  /** every knowledge entry so far (the codex: the lab's archive lists them) */
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
    if (kind === 'creature') { const sp: any = getSpecies(key); const lore = loreNotes(key); if (sp) return { title: sp.name, cls: sp.scan?.cls || 'Entity', notes: [...(lore.length ? lore : sp.scan?.notes || []), ...(sp.rule ? [`RULE // ${sp.rule.name}: ${sp.rule.text}`] : [])] }; }
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

  /** what the survivor is pointing at, or the nearest living thing in front of them (strict: worth a scan, not furniture) */
  private pickTarget(strict = false): ScanTarget | null {
    const h = this.targetOf(G.ui?.hover);
    if (h && (!strict || STRICT.has(h.kind))) return h;
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

  /** begin sweeping a target (menus and the context bar call this directly; hold = only while the key is held) */
  begin(t: ScanTarget | null, hold = false, hint = hold): boolean {
    if (!this.canScan()) return false;
    if (!t) {
      if (hint && G.time > this.hintT) { this.hintT = G.time + 4; bus.emit('think', G.local, 'Nothing in front of the visor to scan.'); }
      return false;
    }
    const diff = this.lockDiff(t);
    const base = diff >= 0 ? 0.4 / ACQ : t.kind === 'item' ? 0.5 : 0.8;
    const dur = base * (hasUnlock('scan_deep') ? 0.7 : 1) * (hasUnlock('tool_beam') ? 0.75 : 1) * (this.probe() ? 0.85 : 1);
    this.active = { t, prog: 0, dur, lost: 0, hold, diff, ease: this.lockEase(), latch: false };
    G.audio?.ui?.('scan_start', 0.45);
    G.missions?.set?.('tut:scanner');
    return true;
  }
  /** study an anomalous thing you carry (the item menu's "Study with the scanner") */
  scanItem(it: { key: string } | null | undefined): boolean {
    const p = G.local; if (!p || !it) return false;
    const d = itemDef(it.key);
    return this.begin({ kind: d.anomaly ? 'anomaly' : 'item', key: d.key, title: d.name, cls: d.anomaly ? 'Anomalous object' : 'Object', notes: d.desc ? [d.desc] : [], x: p.x, y: (p.y ?? 0) + 1, z: p.z, held: true, ref: it });
  }
  /** for the action plate over the unit's head while a sweep runs (src/ui/ui.ts) */
  plate(): { name: string; k: number } | null {
    const a = this.active;
    return a ? { name: 'Scanning' + (this.known(a.t.kind, a.t.key) ? ' ' + a.t.title : '...'), k: Math.min(1, a.prog) } : null;
  }

  cancel() { this.active = null; }

  /**
   * how hard a thing fights the visor's lock (0 easy .. 4 brutal), or -1 for a plain sweep (furniture, ordinary
   * objects): deadlier inhabitants, anomalies and artefacts fight harder, and something never scanned before a little more
   */
  lockDiff(t: ScanTarget): number {
    const fresh = this.count(t.kind, t.key) === 0 ? 0.5 : 0;
    let d: number;
    if (t.kind === 'creature') d = Math.max(0, (t.threat ?? 1) - 1) + fresh - (t.ref?.dead ? 1 : 0);
    else if (t.kind === 'tribe' || t.kind === 'survivor') d = 0.8 + fresh;
    else if (t.kind === 'anomaly') d = (t.held ? 1.2 : 2) + fresh;
    else if (t.kind === 'artefact') d = 2.4 + fresh;
    else return -1;
    return Math.max(0, Math.min(4, d));
  }
  /** how well this unit locks on (> 1 easier): the 'scan' talent, the lab's scanner research, a Phosphor Scope, a little electrical skill */
  lockEase(): number {
    const b = G.local?.body;
    const sk = Math.min(10, Number(b?.skill?.('electrical')) || 0);
    return Math.pow(talentMul(b, 'scan'), 0.8) * (hasUnlock('tool_beam') ? 1.08 : 1) * (hasUnlock('scan_deep') ? 1.12 : 1) * (this.probe() ? 1.08 : 1) * (1 + sk * 0.03);
  }

  /** a lock lost to feedback (or a hopeless one): the scanner screams, things nearby hear it, the target turns */
  private botch(t: ScanTarget, loud: boolean) {
    const p = G.local; if (!p) return;
    G.audio?.ui?.('static_burst', loud ? 0.75 : 0.45);
    if (loud) G.audio?.at?.('band_glitch', p.x, p.z, 0.7);
    bus.emit('noise', { x: p.x, z: p.z, radius: loud ? 12 : 6, kind: 'scan', zone: p.zoneKey, by: p.id });
    const c = t.ref;
    if ((t.kind === 'creature' || t.kind === 'tribe') && c && !c.dead && c.awareness) {
      c.awareness.set(p.id, Math.max(c.awareness.get(p.id) ?? 0, loud ? 1.2 : 0.7));
      c.lastSeen = { x: p.x, z: p.z, t: G.time };
      c.alert = Math.min(1, (c.alert ?? 0) + (loud ? 1 : 0.4));
      if (loud) c.targetId = p.id;
    }
    if (loud && G.time > this.failT) { this.failT = G.time + 90; voss('Feedback. It heard that.'); }
    bus.emit('scanLock', { kind: t.kind, key: t.key, q: 0, end: 'fail', ref: t.ref });
  }
  /** the lock's sounds: the carrier whine climbs as the traces close, ticks while it holds, the dials click */
  private lockSound(p: any, s: LockStep, dt: number) {
    G.audio?.positionalLoop?.('scanlock', 'mn_loop_scan', p.x, p.z, 0.22 + s.close * 0.25, 0.75 + s.close * 0.55 + (s.on ? 0.1 : 0), 20);
    G.audio?.positionalLoop?.('scanstatic', s.heat > 0.08 ? 'static' : null, p.x, p.z, Math.min(0.6, s.heat * 0.7), 1, 20);
    if (s.on) { this.humT -= dt; if (this.humT <= 0) { this.humT = 0.16; G.audio?.flat?.('scan_tick', 'ui', 0.18, 1 + s.lock * 0.5); } }
    if (s.turned - this.knobV > 0.06) { this.knobV = s.turned; G.audio?.ui?.('tc_knob', 0.12); }
  }
  private lockQuiet() { G.audio?.positionalLoop?.('scanlock', null); G.audio?.positionalLoop?.('scanstatic', null); }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const p = G.local;
    const inp = G.input;
    // the lab's requirement quests watch the field from here (src/game/reqQuests.ts)
    try { reqTick(dt); } catch (e) { console.warn('reqQuests', e); }
    if (!p || p.body?.dead) { this.active = null; this.sweep.drop(); this.sweep.update(dt); return; }
    const held = !inp.textFocus && inp.down('scan');
    if (held && !this.active && inp.hit('scan')) {
      // the key is shared with whistle / shout (Q): only something worth a scan takes it, and no hint when nothing does
      const shared = inp.hit('whistle') || inp.hit('shout');
      this.begin(this.pickTarget(shared), true, !shared);
    }
    const a = this.active;
    let lost = false;
    if (a) {
      // follow moving things (a carried item rides with the unit)
      const r = a.t.ref;
      if (a.t.held) { a.t.x = p.x + Math.cos(p.facing) * 0.45; a.t.z = p.z + Math.sin(p.facing) * 0.45; a.t.y = (p.y ?? 0) + 1.0; }
      else if (r && typeof r.x === 'number' && (a.t.kind === 'creature' || a.t.kind === 'tribe' || a.t.kind === 'survivor')) { a.t.x = r.x; a.t.z = r.z; }
      const d = Math.hypot(a.t.x - p.x, a.t.z - p.z);
      const ok = d <= this.range() && (!r?.zoneKey || r.zoneKey === p.zoneKey) && !(r?.dead && a.t.kind !== 'creature');
      // on touch the lock latches once the scope is up (one thumb drags the dials); keys must keep holding
      if (a.hold && !held && !a.latch) { this.active = null; }
      else if (ok && a.diff >= 0 && a.prog >= ACQ && !AUTO_LOCK) {
        // the signature lock (src/ui/minigames/tuner.ts)
        a.lost = 0;
        if (!scanTuner.active) {
          scanTuner.start({ diff: a.diff, ease: a.ease });
          this.knobV = 0;
          a.latch = !!(G.systems.find((q: any) => q.name === 'touch') as any)?.active;
          G.audio?.ui?.('mn_scan', 0.35);
        }
        const s = scanTuner.step(dt);
        a.prog = ACQ + (1 - ACQ) * s.lock;
        this.lockSound(p, s, dt);
        if (s.end) {
          this.active = null; this.lockQuiet();
          const q = s.end === 'clean' ? 1 : s.lock;
          if (s.end === 'fail' || q < 0.2) { scanTuner.stop('fail'); this.botch(a.t, s.end === 'fail'); this.lastLock = { kind: a.t.kind, key: a.t.key, q: 0, end: 'fail' }; }
          else {
            scanTuner.stop(s.end);
            G.audio?.ui?.(s.end === 'clean' ? 'mn_perfect' : 'mn_flub', s.end === 'clean' ? 0.5 : 0.3);
            this.lastLock = { kind: a.t.kind, key: a.t.key, q, end: s.end };
            this.complete(a.t, false, q);
            bus.emit('scanLock', { kind: a.t.kind, key: a.t.key, q, end: s.end, ref: a.t.ref });
            p.playAnim?.('scanner', 0.6);
          }
        }
      } else if (ok) {
        a.prog += dt / a.dur; a.lost = 0;
        this.humT -= dt;
        if (this.humT <= 0) { this.humT = 0.32; G.audio?.ui?.('scan_tick', 0.22); }
        if (a.prog >= 1) { this.active = null; this.complete(a.t); p.playAnim?.('scanner', 0.6); }
      } else {
        lost = true;
        a.lost += dt; a.prog = Math.max(0, a.prog - dt * 0.6);
        if (a.lost > 1.2) this.active = null;
      }
      // the unit turns its visor to what it is sweeping
      if (!a.t.held && !p.aiming && p.speed < 0.2) p.targetFacing = Math.atan2(a.t.z - p.z, a.t.x - p.x);
    }
    const cur = this.active;
    if (scanTuner.active && (!cur || cur.diff < 0 || lost)) { scanTuner.stop(); this.lockQuiet(); }
    if (cur) {
      const r = cur.t.ref;
      const tall = r?.height ? Math.max(0.3, r.height) : cur.t.kind === 'item' || cur.t.held ? 0.3 : Math.max(0.4, cur.t.y * 1.4);
      const size = r?.height ? Math.max(0.55, Math.min(2.6, r.height * 0.7)) : cur.t.kind === 'item' || cur.t.held ? 0.4 : 0.9;
      let ground = cur.t.held ? cur.t.y - 0.15 : 0;
      if (!cur.t.held) { try { ground = Number(G.zone?.heightAt?.(Math.floor(cur.t.x), Math.floor(cur.t.z))) || 0; } catch { /* no zone */ } }
      this.emitter(p, this.eye);
      this.sweep.aim(this.eye, cur.t, size, tall, ground, cur.prog, lost);
    } else this.sweep.drop();
    this.sweep.update(dt);
  }

  /** the visor emitter: in front of the unit's head (the rig's head bone when it is built) */
  private emitter(p: any, out: THREE.Vector3) {
    const head = p.rig?.j?.head as THREE.Object3D | undefined;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    if (head) { head.getWorldPosition(out); out.x += fx * 0.13; out.z += fz * 0.13; out.y += 0.06; }
    else out.set(p.x + fx * 0.15, (p.y ?? 0) + 1.62, p.z + fz * 0.15);
    return out;
  }


  // ---------------------------------------------------------------- results
  /** a finished scan: DATA, research for firsts and milestones, a knowledge entry */
  complete(t: ScanTarget, viaSeer = false, q = 1) {
    const kind = t.kind, key = t.key;
    const n = this.count(kind, key);
    const first = n === 0;
    let base = kind === 'creature' ? 8 + (t.threat ?? 1) * 6 : kind === 'tribe' ? 10 : kind === 'artefact' ? 15 : kind === 'anomaly' ? 6 : kind === 'object' ? 2 : kind === 'survivor' ? 3 : 1;
    if (hasUnlock('scan_deep')) base *= 1.5;
    // the lock: a clean one reads more, a sloppy one only part of it
    base *= q >= 0.999 ? 1.3 : 0.35 + 0.65 * q;
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
    if (q < 0.5) rp = Math.floor(rp / 2);
    if (rp > 0) grantResearch(rp, `scan:${kind}:${key}`);
    // creatures: the old flags (codex, mission 'scan:<key>', creature rules)
    const c = t.ref;
    if ((kind === 'creature' || kind === 'tribe') && c?.sp) {
      c.scanned = true;
      if (!viaSeer) { G.missions?.onScan?.(c); this.emitting = true; try { bus.emit('scanned', c); } finally { this.emitting = false; } }
    }
    // anomalies: R&D's survey counts each one logged (once per thing)
    if (kind === 'anomaly') {
      const id = `${G.local?.zoneKey ?? ''}:${t.ref?.uid ?? t.ref?.item?.uid ?? key}`;
      if (!G.missions?.flags?.has?.('anom:' + id)) { G.missions?.set?.('anom:' + id); bus.emit('anomalyLogged', id); }
    }
    G.audio?.ui?.(first ? 'scan_new' : 'scanDone', 0.5);
    bus.emit('scanEntry', { kind, key, title: t.title, first, data, rp, q, ref: t.ref });
    bus.emit('scanData', { data, total: before + data });
    this.report(t, first, data, rp);
  }


  /** Dr. Calder reads the sample out (an inhabitant's codex sections are hers too: src/scan/lorebook.ts) */
  private report(t: ScanTarget, first: boolean, data: number, rp: number) {
    if (!G.local) return;
    const tally = `Data ${data}${rp ? `, research ${rp}` : ''}.`;
    // a known inhabitant: the lorebook reads its next section; she only adds the numbers
    if (t.kind === 'creature' && loreNotes(t.key).length) return;
    const note = first && t.notes?.length ? ' ' + (t.notes[0].length < 120 ? t.notes[0] : t.notes[0].slice(0, 117) + '...') : '';
    voss(first ? `New entry: ${t.title}.${note} ${tally}` : `${t.title} again. ${tally}`);
  }
}

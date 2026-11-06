// The studyable anomalies at runtime, installed once per session
// (src/game/session.ts installAnomalies):
//   the Ledge          ledge.ts (the melt, the heat, the look)
//   the fixtures       behave.ts (what each one does, their moving parts)
//   studying them      the watch: scanning a fixture (its object carries the
//                      'anomaly' tag, src/scan/scan.ts) logs the codex entry
//                      'anom:<key>' (src/game/codex.ts) and reads an observation
//                      onto the subtitle strip; coming close logs it too.
//                      Sampling: the fixture's menu takes a sample of its kind
//                      into the field kit (src/research/collect.ts CollectAction),
//                      which banks and goes to the lab benches like any other.
//   dev                ?zone=ledge (with ?quick) goes straight to a level;
//                      ?anom=<key> to a fixture; window.__anom.{go, tp, list, heat, melt}
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Game } from '../../game/game';
import type { Player } from '../../entities/player';
import type { TileObject, Zone } from '../zone';
import type { MenuOption } from '../../ui/ui';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { CollectAction } from '../../research/collect';
import { discover } from '../../game/meridian';
import { entryKnown } from '../../game/codex';
import { op } from '../../game/ops';
import { objDef } from '../objects';
import { WORLD_ANOMALIES, ANOMALY_OBJ, worldAnomaly, type WorldAnomaly } from './data';
import { LedgeRuntime } from './ledge';
import { AnomalyBehaviours, centreOf, type Placed } from './behave';

export { WORLD_ANOMALIES, ANOMALY_OBJ };
/** the Ledge fixtures a sample can be scraped from */
const SAMPLE_LEDGE = new Set(['lg_wax_heap', 'lg_wax_puddle', 'lg_wax_column']);

let installed: AnomalySystem | null = null;
export function installAnomalies(g: Game) {
  if (installed) return installed;
  installed = new AnomalySystem();
  g.addSystem(installed);
  return installed;
}

export class AnomalySystem {
  name = 'anomalies';
  ledge = new LedgeRuntime();
  fx = new AnomalyBehaviours();
  private seenZone = new Map<string, Set<string>>();
  private scanN = new Map<string, number>();
  /** dev: wall-clock ms when the URL's ?zone / ?anom jump fires (SwiftShader frames are slow: not game time) */
  private devAt = -1;

  constructor() {
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => { try { this.menu(p, o, out); } catch (e) { console.warn('anomaly menu', e); } });
    bus.on('scanEntry', (s: { kind?: string; key?: string; first?: boolean }) => this.scanned(s));
    if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__anom = this.devApi();
  }

  update(dt: number) {
    const p = G.local as Player | undefined;
    try { this.ledge.update(dt); } catch (e) { console.error('ledge', e); }
    try { this.fx.update(dt); } catch (e) { console.error('anomaly fx', e); }
    if (p && G.zone) this.notice(p, G.zone);
    if (this.devAt !== 0 && p && !G.transitioning) { const now = performance.now(); if (this.devAt < 0) this.devAt = now + 1200; else if (now >= this.devAt) { this.devAt = 0; this.devStart(); } }
  }

  // ---------------------------------------------------------------- noticing one: the codex logs it
  private notice(p: Player, z: Zone) {
    let seen = this.seenZone.get(z.key);
    if (!seen) this.seenZone.set(z.key, (seen = new Set()));
    if (z.meta.ledge && !seen.has('ledge')) { seen.add('ledge'); this.logged('ledge', p, true); }
    for (const a of (z.meta.anomalies || []) as Placed[]) {
      if (seen.has(a.key)) continue;
      if (Math.hypot(a.x + 1 - p.x, a.y + 1 - p.z) > 6) continue;
      seen.add(a.key);
      this.logged(a.key, p, false);
    }
  }
  private logged(key: string, p: Player, quiet: boolean) {
    const a = worldAnomaly(key); if (!a) return;
    const first = !entryKnown('anom:' + key);
    discover('anom:' + key);
    if (first && !quiet) bus.emit('subtitle', { who: 'WATCH // ' + a.code, text: `${a.name} logged. ${a.study}`, style: 'radio', dur: 6 });
    void p;
  }

  // ---------------------------------------------------------------- the watch: a scan reads one more observation
  private scanned(s: { kind?: string; key?: string }) {
    if (!s || s.kind !== 'anomaly' || !s.key) return;
    const key = ANOMALY_OBJ[s.key]; if (!key) return;
    const a = worldAnomaly(key)!;
    discover('anom:' + key);
    const n = this.scanN.get(key) ?? 0;
    this.scanN.set(key, n + 1);
    const text = n < 2 ? a.notes[n] : `Entry on file: ${a.cls}, threat ${a.threat}. ${a.behaviour} The rest is in the samples.`;
    bus.emit('subtitle', { who: `WATCH // ${a.code}`, text, style: 'radio', dur: Math.min(12, 3 + text.length * 0.045) });
  }

  // ---------------------------------------------------------------- the fixture's menu: its verb, then the sample
  private menu(p: Player, o: TileObject, out: MenuOption[]) {
    const key = ANOMALY_OBJ[o.key]; if (!key) return;
    const a = worldAnomaly(key)!;
    const z = G.getZone(p.zoneKey);
    const [cx, cz] = centreOf(o);
    const at = (act: any, reach = 1.5) => () => queueAt(p, cx, cz, act, reach);
    const own: MenuOption[] = [];
    if (key === 'echo_phone') own.push({ label: this.fx.isRinging() ? 'Answer the phone' : 'Lift the handset', action: at(new UseObjectAction(p, 'Phone', 1.2, 'hold_item', () => { if (this.fx.answer(p, cx, cz)) discover('anom:' + key); }), 1.4) });
    if (key === 'snow_globe') own.push({ label: 'Shake the globe', danger: true, action: at(new UseObjectAction(p, 'Shake', 1.4, 'push', () => this.fx.shake(p, cx, cz)), 1.9) });
    if (key === 'patient_chair') own.push({ label: 'Sit in the chair', danger: true, action: at(new UseObjectAction(p, 'Sit', 1.6, 'sit', () => this.fx.sit(p, z)), 1.2) });
    if (key !== 'ledge' || SAMPLE_LEDGE.has(o.key)) own.push(this.sampleOption(p, o, a, at));
    out.unshift(...own);
  }
  private sampleOption(p: Player, o: TileObject, a: WorldAnomaly, at: (act: any, reach?: number) => () => void): MenuOption {
    const n = o.state?.samples | 0;
    const z = p.zoneKey;
    return {
      label: a.sampleVerb,
      disabled: n >= a.samples ? 'nothing left to take' : false,
      action: at(new CollectAction(p, {
        kind: a.sample, src: 'anom:' + a.key, name: a.name, alive: false, threat: a.threat,
        done: () => { op('objState', { z, uid: o.uid, patch: { samples: (o.state?.samples | 0) + 1 } }); if (a.key === 'hungry_carpet') G.audio?.at?.('bh_squelch', o.x + 1, o.y + 1, 0.6); },
      })),
    };
  }

  // ---------------------------------------------------------------- dev
  private devStart() {
    if (!import.meta.env?.DEV || typeof location === 'undefined') return;
    const q = new URLSearchParams(location.search);
    const an = q.get('anom'), zk = q.get('zone');
    if (an) this.go(an);
    else if (zk) this.tp(zk, q.get('anchor') || undefined);
  }
  tp(zone: string, anchor?: string) {
    const p = G.local; if (!p) return;
    const z = G.getZone(zone);
    const a = (z.meta.anchors?.[anchor || 'fall'] ?? Object.values(z.meta.anchors || {})[0]) as number[] | undefined;
    G.travel(p, zone, a ? a[0] : z.W >> 1, a ? a[1] : z.H >> 1, a?.[2]);
  }
  go(key: string) {
    const a = worldAnomaly(key), p = G.local; if (!a || !p) return;
    if (a.zone === 'ledge') { this.tp('ledge'); return; }
    const z = G.getZone(a.zone);
    const pl = ((z.meta.anomalies || []) as Placed[]).find((q) => q.key === key);
    if (!pl) { this.tp(a.zone); return; }
    G.travel(p, a.zone, pl.x, pl.y + 3, -Math.PI / 2);
  }
  private devApi() {
    return {
      go: (k: string) => this.go(k), tp: (z: string, a?: string) => this.tp(z, a),
      list: () => WORLD_ANOMALIES.map((a) => ({ key: a.key, zone: a.zone, at: ((G.zones?.get?.(a.zone)?.meta?.anomalies || []) as Placed[]).find((q) => q.key === a.key) })),
      heat: (v?: number) => { if (typeof v === 'number') this.ledge.heat = v; return this.ledge.heat; },
      melt: (lvl = 3) => { const z = G.zone; for (const o of z.objects.values()) { const d = objDef(o.key); if (d && !d.onWall && !d.ceiling && Math.abs(o.x - G.local.x) < 14 && Math.abs(o.y - G.local.z) < 14 && !/^(lg_|an_|vx_|zw_)/.test(o.key)) op('objState', { z: z.key, uid: o.uid, patch: { melt: lvl } }); } },
      /** stand at tile (x, y) of the current level */
      at: (x: number, y: number, face = 0) => { const z = G.zone; const [tx, ty] = G.nearestWalkable(z, x, y); G.placePlayer(G.local, z.key, tx, ty, face); },
      sys: this,
    };
  }
}

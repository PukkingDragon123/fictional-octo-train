// Checkpoints (round 15, WORLD). Two kinds of place hold a checkpoint:
//   - the Remittance Presses: a unit that feeds one is logged by it (the first time
//     at each press with the keying-in shot, after that quietly), or [U] Checkpoint /
//     the press's menu "Hold a checkpoint here";
//   - the Meridian relay booths (cp_relay, placed with the company facilities,
//     src/world/gen/facilities.ts): [E] Key in.
// Holding one saves the game to its slot and writes a full snapshot of the world as it
// stands (the same seed, the op log, the unit and what it carries) under 'cp_<lineage>'
// (src/game/save.ts: writeCheckpoint). The slot's card remembers it (SaveMeta.cp).
//
// After a death (the incident report's keys, src/ui/death) or from the title's case
// files, RE-ENTER makes a NEW save file from that snapshot and continues the OLD world:
// launch mode 'reenter' (src/game/launch.ts) -> reentryFrom() -> a session with
// { reentry: true }, which plays the relay's shot (src/game/cine/moments.ts).
//
// The world's lineage (G.lineage) is the id of its first file; every re-entry keeps it,
// so the last checkpoint held on a world is always 'cp_<lineage>'.
import { G } from './G';
import { bus } from '../core/events';
import type { Game } from './game';
import type { Player } from '../entities/player';
import type { TileObject } from '../world/zone';
import type { MenuOption } from '../ui/ui';
import { objDef } from '../world/objects';
import { queueAt } from '../actions/basic';
import { UseObjectAction } from '../actions/world';
import { saveGame, snapshotGame, writeCheckpoint, type SaveData, type CheckpointInfo } from './save';
import { checkpointShot, cineEnabled } from './cine';

type GG = { lineage?: string; checkpoint?: CheckpointInfo | null; reentries?: number; ctxHooks?: ((p: Player, touch: boolean) => unknown[])[] };
const gx = () => G as unknown as GG;

/** the checkpoint held on this world, if any */
export function heldCheckpoint(): CheckpointInfo | null { return gx().checkpoint ?? null; }

/** a new file on the old world from the held checkpoint (reloads into it) */
export function reenterCheckpoint(info: CheckpointInfo | null = heldCheckpoint()) {
  if (!info) return;
  void import('./launch').then((m) => m.setLaunch({ mode: 'reenter', cp: info.id })).catch(() => location.reload());
}

const centre = (o: TileObject) => {
  const d = objDef(o.key);
  const w = d?.w ?? 1, dd = d?.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  return { x: o.x + rw / 2, z: o.y + rd / 2, top: (d?.height ?? 1.5) + 0.3 };
};
const isRelay = (o: TileObject) => o.key === 'cp_relay';
const isPress = (o: TileObject) => o.key === 'hopper';
const placeName = (zk: string) => { const z = G.zones.get(zk); return String(z?.name || zk).replace(/^Level\s+\S+\s+—\s+/, ''); };

let busy = false;
/** hold a checkpoint at this relay or press (the shot first, then the save) */
export async function holdCheckpoint(p: Player, o: TileObject, kind: 'relay' | 'press' | 'bed', quiet = false): Promise<boolean> {
  if (busy || p !== G.local || p.body.dead) return false;
  if (G.role === 'client') { bus.emit('think', p, 'The relay only answers the host.'); return false; }
  busy = true;
  try {
    const z = G.getZone(p.zoneKey);
    const label = `${kind === 'relay' ? 'Relay booth' : kind === 'bed' ? 'Camp bed' : 'Remittance Press'}, ${placeName(z.key)}`;
    const here = `cp:at:${z.key}:${o.uid}`;
    const first = !G.missions?.flags?.has(here);
    if (first) { try { G.missions?.set?.(here); } catch { /* no missions */ } }
    // a camp bed (src/build/camp.ts) holds it quietly: the unit is asleep, no shot
    const shot = kind !== 'bed' && (!quiet || first);
    if (shot && cineEnabled()) await checkpointShot(o, kind, label);
    const ok = await writeHeld(p, label, z.key, o);
    if (!shot || !cineEnabled()) bus.emit('subtitle', { who: 'RELAY', text: ok ? `CHECKPOINT HELD · ${label.toUpperCase()}` : 'THE RELAY COULD NOT HOLD THE LINE', dur: 2.6, style: 'radio' });
    return ok;
  } finally { busy = false; }
}

async function writeHeld(p: Player, label: string, zone: string, o: TileObject): Promise<boolean> {
  if (p.body.dead) return false;
  const g = gx();
  if (!G.saveId) G.saveId = 'w' + Date.now().toString(36);
  g.lineage ||= G.saveId;
  const c = centre(o);
  const info: CheckpointInfo = {
    id: 'cp_' + g.lineage, label, zone, zoneName: placeName(zone), at: Date.now(),
    x: Math.floor(c.x), y: Math.floor(c.z), day: Math.floor(G.clock.hours / 24) + 1,
  };
  const was = g.checkpoint;
  g.checkpoint = info;
  try {
    // the slot (its card shows the checkpoint), then the snapshot the re-entries are made from
    const ok = await saveGame();
    if (!ok) { g.checkpoint = was; return false; }
    const d: SaveData = snapshotGame();
    d.id = info.id;
    d.name = `${p.name} — checkpoint`;
    await writeCheckpoint(d);
    bus.emit('checkpoint', info);
    return true;
  } catch (e) { console.warn('checkpoint', e); g.checkpoint = was; return false; }
}

export function installCheckpoints(g: Game, s: SaveData | null) {
  const x = g as unknown as GG;
  x.lineage = s?.lineage || s?.id || undefined;
  x.checkpoint = s?.checkpoint ?? null;
  x.reentries = s?.reentries ?? 0;
  const keyIn = (p: Player, o: TileObject) => { const c = centre(o); queueAt(p, c.x, c.z, new UseObjectAction(p, 'Key in', 1.2, 'read', () => { void holdCheckpoint(p, o, 'relay'); }), 1.5); };
  const atPress = (p: Player, o: TileObject) => { const c = centre(o); queueAt(p, c.x, c.z, new UseObjectAction(p, 'Log in at the press', 0.8, 'read', () => { void holdCheckpoint(p, o, 'press'); }), 2.2); };
  // the world menu: the booth's verb, and one more line on the press
  bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => {
    if (isRelay(o)) out.unshift({ label: 'Key in (hold a checkpoint)', action: () => keyIn(p, o) });
    else if (isPress(o) && G.role !== 'client') out.push({ label: 'Hold a checkpoint here', action: () => atPress(p, o) });
  });
  // the hands' labels (src/ui/hotbar/context.ts reads G.ctxHooks): [E] Key in at a booth, [U] Checkpoint at a press
  (x.ctxHooks ||= []).push((p: Player) => {
    const out: unknown[] = [];
    if (p.body.dead || G.role === 'client') return out;
    const near = (G.interact?.objectsNear?.(p, 1.7) || []) as TileObject[];
    const relay = near.find(isRelay);
    if (relay) {
      const c = centre(relay), at = { x: c.x, y: (p.y ?? 0) + c.top, z: c.z };
      out.push({ id: 'relay', label: 'Key in', icon: 'open', key: 'E', run: () => keyIn(p, relay), tgt: 'o:' + relay.uid, name: 'Relay Booth', head: 'Key in', anchor: () => at });
    }
    const push = (G as unknown as { destruct?: { push?: { nearPress?: (p: Player, r?: number) => TileObject | null } } }).destruct?.push;
    const press = push?.nearPress?.(p, 3.2) ?? null;
    const cp = x.checkpoint;
    if (press && !(cp && cp.zone === p.zoneKey && Math.abs(cp.x - press.x) <= 2 && Math.abs(cp.y - press.y) <= 2)) {
      const c = centre(press), at = { x: c.x, y: (p.y ?? 0) + c.top, z: c.z };
      out.push({ id: 'cp_press', label: 'Checkpoint', icon: 'open', key: 'E', run: () => atPress(p, press), tgt: 'press', head: 'Feed the press', anchor: () => at });
    }
    return out;
  });
  // feeding a press logs the unit (the first time with the shot, once the ram is back up)
  const lastAt = new Map<string, number>();
  bus.on('deposited', (e: { by?: string; hopper?: number }) => {
    const p = G.local;
    if (!p || e?.by !== p.id || e.hopper == null || G.role === 'client') return;
    const z = G.getZone(p.zoneKey);
    const o = z.objects.get(e.hopper);
    if (!o) return;
    const k = z.key + ':' + o.uid;
    if (G.time - (lastAt.get(k) ?? -1e9) < 90) return;
    lastAt.set(k, G.time);
    setTimeout(() => { if (!p.body.dead && p.zoneKey === z.key) void holdCheckpoint(p, o, 'press', true); }, 3600);
  });
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __checkpoint: unknown }).__checkpoint = {
      get held() { return heldCheckpoint(); },
      /** hold one at the nearest relay or press in this level */
      async hold(kind: 'relay' | 'press' = 'relay') {
        const p = G.local, z = G.getZone(p.zoneKey);
        let best: TileObject | null = null, bd = Infinity;
        for (const o of z.objects.values()) if ((kind === 'relay' ? isRelay(o) : isPress(o))) { const d = Math.hypot(o.x - p.x, o.y - p.z); if (d < bd) { bd = d; best = o; } }
        return best ? holdCheckpoint(p, best, kind) : false;
      },
      reenter: () => reenterCheckpoint(),
    };
  }
}

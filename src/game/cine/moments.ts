// First-person moments (round 15, WORLD): short shots through the unit's eyes for
// the beats worth stopping for. Each plays once per world (a mission flag in the op
// log remembers it), is skippable (Esc) and lasts a few seconds.
//
//   reveal      the first time in a level: the unit stops and takes it in (a slow pan,
//               a push, the level's own sounds, Dr. Calder's line). Bespoke for the
//               Ledge, the Nostalgic Playground and the Ball House; every other level
//               gets one too, from its name and blurb.
//   facility    finding a company's facility (src/world/gen/facilities.ts): the eyes
//               go to its sign, a push in, who built it and what is left in it.
//   checkpoint  keying in at a relay booth or a press (src/game/checkpoint.ts)
//   reentry     a new unit put back at the last relay (a new file on the old world)
import { G } from '../G';
import { bus } from '../../core/events';
import type { Player } from '../../entities/player';
import type { TileObject } from '../../world/zone';
import { objDef } from '../../world/objects';
import { fpOwner } from '../../fp/fp';
import { playCine, cineRunning, cineEnabled, type Cine, type Script, ease, lerp } from './engine';
import type { FacInfo, FacKind } from '../../world/gen/facilities';
import { openFacing } from './travel';

const flags = () => G.missions?.flags;
const seen = (k: string) => !!flags()?.has(k);
const mark = (k: string) => { try { G.missions?.set?.(k); } catch { /* no missions */ } };

// ---------------------------------------------------------------- reveals
interface Reveal { lines: string[]; sounds?: [string, number][]; pan?: number; pitch?: [number, number]; fov?: [number, number]; dur?: number; haze?: boolean; who?: string }
const REVEALS: Record<string, Reveal> = {
  ledge: {
    lines: ['This is the Ledge. The far edge of the backrooms, where the place stops holding its shape.', 'Everything out here melts, slowly. The walls, the furniture. You, if you stay.'],
    sounds: [['mus_drone', 0.45], ['hollow_moan', 0.3]], pan: 42, pitch: [10, -4], fov: [66, 48], dur: 8, haze: true,
  },
  playground: {
    lines: ['A playground. Nobody built it for children.', 'If something down here asks you to play, do not answer it.'],
    sounds: [['playground_far', 0.5], ['music_box_broken', 0.35]], pan: 38, pitch: [6, -2], fov: [64, 50], dur: 7.5,
  },
  ballhouse: {
    lines: ['The Ball House. Keep your head above the balls.', 'Things live under them. They like to be found.'],
    sounds: [['bx_balls', 0.6], ['tim_giggle', 0.25]], pan: 32, pitch: [16, 4], fov: [62, 50], dur: 7,
  },
  pools: { lines: ['The Poolrooms. Warm water and no drains.', "Don't swim where you can't see the bottom."], sounds: [['water_lap', 0.5]], pan: 30 },
  office: { lines: ["Level Four. Meridian's own offices. Or what this place made of them."], sounds: [['hum_fluoro', 0.4]] },
  server: { lines: ['The Core. The racks render the floors you have been walking.'], sounds: [['server_hum', 0.5]] },
  fields: { lines: ['Open sky. It is not a sky.'], sounds: [['wind', 0.5], ['crickets', 0.3]], pan: 44 },
  meadow: { lines: ['A meadow. Something keeps it mown.'], sounds: [['wind', 0.4]], pan: 40 },
  moon: { lines: ['Hold your breath. No. Breathe. It only looks like the Moon.'], sounds: [['vx_hole_wind', 0.4]], pan: 40, pitch: [-6, 2] },
  hospital: { lines: ["St. Aldric's. The patients are still checked in."], sounds: [['beep_loop', 0.3]] },
  mall: { lines: ['Westgate Mall. The muzak never got the news.'], sounds: [['mus_muzak', 0.35]] },
  parking: { lines: ['A parking level with no top and no bottom. Count the pillars if it helps.'], sounds: [['tunnel_air', 0.4]] },
  tunnels: { lines: ['Service tunnels. Mind the steam. Mind what is in it.'], sounds: [['tunnel_air', 0.5]] },
  suburbs: { lines: ['A street of houses with the lights on. Nobody is home. Everybody is home.'], sounds: [['wind', 0.3]], pan: 40 },
};
function revealFor(zoneKey: string): Reveal | null {
  const k = zoneKey.split('~')[0];
  if (k === 'lobby' || k === 'reality' || k === 'exit' || k === 'gallery') return null;
  const r = REVEALS[k];
  if (r) return r;
  const z = G.zones.get(zoneKey);
  const blurb = String(z?.meta?.blurb || '');
  return { lines: [blurb ? `${z?.name || 'A new level'}. ${blurb}` : `${z?.name || 'A new level'}. Keep your eyes open.`], dur: 5 };
}

function* revealShot(c: Cine, r: Reveal): Script {
  // turned to the most open view first (not a wall a step away)
  c.face(openFacing(c.p, 3.5), 0.6);
  yield c.eyeUp();
  const dur = r.dur ?? 6;
  const [p0, p1] = r.pitch ?? [6, 1];
  const [f0, f1] = r.fov ?? [64, 52];
  const pan = r.pan ?? 34;
  c.cam.pitch = p0; c.cam.fov = f0; c.cam.yaw = -pan;
  c.sfx('sting_low', 0.4);
  for (const [k, v] of r.sounds ?? []) c.sfx(k, v);
  c.tween(dur, (k) => {
    const e = ease(k);
    c.cam.yaw = lerp(-pan, pan * 0.35, e);
    c.cam.pitch = lerp(p0, p1, e);
    c.cam.fov = lerp(f0, f1, e);
    // the Ledge's heat: the picture swims
    if (r.haze) { c.cam.roll = Math.sin(k * 9) * 1.4; c.cam.fov += Math.sin(k * 13) * 1.2; }
  });
  r.lines.forEach((ln, i) => {
    const at = 0.6 + i * (dur - 1.4) / Math.max(1, r.lines.length);
    c.tween(at, () => { /* wait */ }, () => c.say(ln, r.who));
  });
  yield c.sleep(dur);
  c.ease('yaw', 0, 0.6); c.ease('fov', 62, 0.6); c.ease('pitch', 0, 0.6); c.ease('roll', 0, 0.6);
  yield c.sleep(0.6);
}

/** the first time in this level: take it in */
export function revealLevel(zoneKey: string, force = false): Cine | null {
  const key = 'cine:visit:' + zoneKey.split('~')[0];
  if (!force && seen(key)) return null;
  const r = revealFor(zoneKey);
  if (!r) return null;
  const c = playCine({ name: 'reveal' }, (c) => revealShot(c, r));
  if (c || !cineEnabled()) mark(key);
  return c;
}

// ---------------------------------------------------------------- facilities
const FAC_LINES: Record<FacKind, string[]> = {
  outpost: ['One of ours. A field outpost.', 'The cabinet should still have samples in it. Bank them.'],
  containment: ["Argent-Vale. They were down here before us and they'd like you to forget it.", "Don't open the pods. Do open the crates."],
  maint: ['A maintenance bay. Tools, fuses, wire. Somebody always leaves something.'],
  survey: ['Halcyon Survey. The company went under years ago. The crews never came up.', 'Read what they left. They mapped this place before it moved.'],
  checkpoint: ['A custody checkpoint. Use the relay booth. If you go down, I can put a new unit back here.'],
  cargo: ["Ostrander's lifts. Out of service since the company died. The cables still twitch."],
  server: ['A server closet. If the lights blink in a pattern, do not count it.'],
  relay: ['A relay booth. Key in and the relay holds you. Same world, if you are lost.'],
};

function* facilityShot(c: Cine, f: FacInfo): Script {
  const p = c.p;
  yield c.eyeUp();
  const tx = f.sx + 0.5, tz = f.sy + 0.5;
  const yaw = Math.atan2(tz - p.z, tx - p.x);
  c.face(yaw, 0.7);
  const d = Math.hypot(tx - p.x, tz - p.z);
  // up at the plate, high on the wall (src/content/furniture/zf_facility.ts: 2.06..2.46 m)
  c.ease('pitch', Math.max(-24, Math.min(10, -Math.atan2(2.26 - 1.6, Math.max(0.8, d)) * 57)), 0.7);
  c.sfx('fluoro_tick', 0.5); c.sfx('sting_low', 0.3);
  yield c.sleep(0.6);
  c.ease('fov', 46, 2.6);
  c.say(`${f.company}: ${f.name}.`, 'RELAY', 2.6);
  yield c.sleep(1.2);
  for (const ln of FAC_LINES[f.kind] ?? []) c.say(ln);
  yield c.sleep(2.2);
  c.ease('fov', 62, 0.5); c.ease('pitch', 0, 0.5);
  yield c.sleep(0.5);
}

/** a facility in sight for the first time */
export function facilityFound(f: FacInfo, zoneKey: string, force = false): Cine | null {
  const key = `cine:fac:${zoneKey}:${f.i}`;
  if (!force && seen(key)) return null;
  const c = playCine({ name: 'facility' }, (c) => facilityShot(c, f));
  if (c || !cineEnabled()) mark(key);
  bus.emit('facilityFound', { zone: zoneKey, facility: f });
  return c;
}

/** is it quiet enough to stop and look (no living inhabitant close, not holding or carrying, no close-up up) */
function calm(p: Player): boolean {
  if (fpOwner() || cineRunning() || G.transitioning || p.body.dead || p.inVehicle || p.actions.current) return false;
  const g = G as unknown as { grab?: { holding?: boolean }; ui?: { modal?: unknown; menuEl?: unknown; readerEl?: unknown }; creatures?: { list?: () => { dead?: boolean; tamedBy?: string; zoneKey?: string; x: number; z: number }[] } };
  if (g.grab?.holding || g.ui?.modal || g.ui?.menuEl || g.ui?.readerEl) return false;
  for (const cr of g.creatures?.list?.() || []) {
    if (cr.dead || cr.tamedBy || (cr.zoneKey && cr.zoneKey !== p.zoneKey)) continue;
    if (Math.hypot(cr.x - p.x, cr.z - p.z) < 10) return false;
  }
  return true;
}

// ---------------------------------------------------------------- checkpoints
/** the keying-in shot at a relay booth or a press; resolves when it is over (at once with the cinematics off) */
export function checkpointShot(o: TileObject, kind: 'relay' | 'press', label: string): Promise<void> {
  return new Promise((resolve) => {
    const d = objDef(o.key);
    const w = d?.w ?? 1, dd = d?.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    const cx = o.x + rw / 2, cz = o.y + rd / 2;
    const c = playCine({ name: 'checkpoint', onEnd: () => resolve() }, (c) => (function* () {
      const p = c.p;
      yield c.eyeUp();
      c.face(Math.atan2(cz - p.z, cx - p.x), 0.5);
      c.ease('pitch', kind === 'press' ? -10 : 2, 0.5);
      yield c.sleep(0.45);
      if (kind === 'relay') { c.sfx('radio_on', 0.6); c.sfx('static_burst', 0.35); } else { c.sfx('hopper_scan', 0.7); }
      c.ease('fov', 44, 1.6);
      c.tint = '#7affc0';
      // the tube (or the crown's nixies) flares: a green flash over the picture
      yield c.tw(0.25, (k) => { c.black = 0.22 * k; });
      c.sfx('cube_relay', 0.8);
      yield c.tw(0.6, (k) => { c.black = 0.22 * (1 - k); });
      c.tint = '#000';
      c.sfx('cube_ok', 0.7);
      c.say(`CHECKPOINT HELD · ${label.toUpperCase()}`, 'RELAY', 2.8);
      yield c.sleep(0.9);
      c.say(kind === 'relay' ? 'The relay has you. If you are deleted, I can put a new unit back right here.' : 'The press logged you. If you are deleted, a new unit comes back in here.');
      yield c.sleep(1.6);
      c.ease('fov', 62, 0.5); c.ease('pitch', 0, 0.5);
      yield c.sleep(0.5);
    })());
    if (!c) resolve();
  });
}

/** a new unit put back at the relay */
export function reentryShot(label: string): Cine | null {
  return playCine({ name: 'reentry', black: true }, (c) => (function* () {
    c.tint = '#06140e';
    yield c.eyeUp();
    c.cam.pitch = 52; c.cam.fov = 70; c.cam.roll = 4;
    c.sfx('cube_relay', 0.8); c.sfx('static_burst', 0.5);
    // the picture keys in like a tube warming up: green, a flicker, then the room
    yield c.tw(0.5, (k) => { c.black = 1 - 0.5 * k + (Math.random() < 0.3 ? 0.2 : 0); });
    c.sfx('wake_gasp', 0.75);
    c.fade(0, 1.2);
    c.tween(2.4, (k) => { const e = ease(k); c.cam.pitch = lerp(52, 2, e); c.cam.fov = lerp(70, 62, e); c.cam.roll = lerp(4, 0, e); });
    yield c.sleep(1.0);
    c.say(`Relay re-entry. ${label}. Same world, new file.`, 'RELAY', 2.6);
    yield c.sleep(1.4);
    c.say("The last unit didn't make it. You know where it went wrong. Don't do it again.");
    yield c.sleep(2.2);
  })());
}

// ---------------------------------------------------------------- install
export function installMoments() {
  // a level's first visit: after the crossing (or the plain travel) has played out
  let pend: string | null = null, pendT = 0;
  bus.on('travelEnd', (p: Player, zk: string) => { if (p === G.local) { pend = zk; pendT = 0; } });
  let facT = 0;
  G.addSystem({
    name: 'cineMoments',
    update: (dt: number) => {
      const p = G.local;
      if (!p || !cineEnabled()) return;
      if (pend) {
        pendT += dt;
        if (p.zoneKey !== pend || pendT > 45) pend = null;
        else if (pendT > 0.7 && !cineRunning() && !G.transitioning && !fpOwner()) { const zk = pend; pend = null; revealLevel(zk); }
        return;
      }
      facT -= dt;
      if (facT > 0) return;
      facT = 0.5;
      const z = G.zones.get(p.zoneKey);
      const facs = (z?.meta?.facilities || []) as FacInfo[];
      if (!facs.length || !calm(p)) return;
      for (const f of facs) {
        if (seen(`cine:fac:${p.zoneKey}:${f.i}`)) continue;
        const d = Math.hypot(f.x + 0.5 - p.x, f.y + 0.5 - p.z);
        if (d > 5.5) continue;
        let vis = true;
        try { vis = G.view?.vis?.isVisible?.(f.x, f.y) ?? true; } catch { /* no view */ }
        if (!vis) continue;
        facilityFound(f, p.zoneKey);
        break;
      }
    },
  });
}

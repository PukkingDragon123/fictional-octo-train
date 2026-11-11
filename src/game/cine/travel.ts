// Ways between levels (round 15, WORLD). Going through a portal is a short first-person
// shot of the unit passing through, then the landing in the new level:
//
//   lift         the Ostrander car: in, the scissor gate and the doors shut, the floors
//                tick down, the lamp stutters; out: a ding, the doors open on the new level
//   stairs       down (or up) a concrete stair shaft, step by step into the dark; out of
//                the last steps onto the new floor
//   crawl        down on hands and knees into a duct (a vent) or a wet pipe (a manhole);
//                out of the duct's mouth and up onto your feet
//   liquid       the wall goes liquid, swells toward the face and takes the unit; spat out
//                on the other side on hands and knees
//   door         a door swings open on pitch black and the unit steps into it; out of the
//                black, the door shutting behind
//
// It wraps Game.usePortal / Game.travel for the local unit only: every caller (doors,
// portal objects, walk-on tiles, the walkthrough's usePortal) goes through the same path,
// and with the cinematics off (automation, ?nocine, the setting) the plain travel runs
// untouched. Holes stay the falls' (src/social/floors.ts).
//
// LOADER HAND-OFF (the loading screen is the UI worker's): while the screen is black the
// shot emits bus 'travelDark' { from, to, kind, hold(promise) } just before the level is
// built; a loader may pass a promise to hold() and the landing waits for it (8 s at most),
// then bus 'travelLit' { to, kind } fires as the new level is revealed.
import * as THREE from 'three';
import { G } from '../G';
import { bus } from '../../core/events';
import type { Game } from '../game';
import type { Player } from '../../entities/player';
import type { Portal, Zone } from '../../world/zone';
import { playCine, cineEnabled, cineRunning, type Cine, type Script, ease, easeOut, lerp, clamp01 } from './engine';
import { liftCab, stairShaft, duct, membrane, darkDoor } from './sets';

export type Entrance = 'lift' | 'stairs_down' | 'stairs_up' | 'crawl_duct' | 'crawl_pipe' | 'liquid' | 'door';

export function entranceFor(portal: Portal | null | undefined): Entrance | null {
  if (!portal) return null;
  switch (portal.kind) {
    case 'elevator': return 'lift';
    case 'stairs_down': return 'stairs_down';
    case 'stairs_up': case 'ladder': return 'stairs_up';
    case 'vent': return 'crawl_duct';
    case 'manhole': case 'hole': return 'crawl_pipe';
    case 'door': return 'door';
    case 'walk': return 'liquid';
    default: return null;
  }
}

// ---------------------------------------------------------------- the level around the unit
function walkable(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  return !!z.floor[i] && z.solid[i] !== 1 && z.solid[i] !== 3;
}
/** how far the unit can walk straight ahead (m), up to max */
export function clearAhead(p: Player, yaw: number, max: number): number {
  const z = G.getZone(p.zoneKey);
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  let tx = Math.floor(p.x), ty = Math.floor(p.z);
  for (let d = 0.25; d <= max + 0.35; d += 0.25) {
    const nx = Math.floor(p.x + fx * d), ny = Math.floor(p.z + fz * d);
    if (nx !== tx || ny !== ty) {
      if (!walkable(z, nx, ny)) return Math.max(0, d - 0.55);
      if (nx !== tx && ny === ty && z.edgeBlocks(tx, ty, nx - tx, 0, 'walk')) return Math.max(0, d - 0.55);
      if (ny !== ty && nx === tx && z.edgeBlocks(tx, ty, 0, ny - ty, 'walk')) return Math.max(0, d - 0.55);
      if (nx !== tx && ny !== ty) return Math.max(0, d - 0.55);
      tx = nx; ty = ny;
    }
  }
  return max;
}
/** the facing on arrival: keep it if there is room ahead, else the most open of eight */
export function openFacing(p: Player, want = 1.8): number {
  if (clearAhead(p, p.facing, want) >= want - 0.1) return p.facing;
  let best = p.facing, bd = -1;
  for (let i = 0; i < 8; i++) {
    const a = p.facing + (i * Math.PI) / 4;
    const d = clearAhead(p, a, 3);
    if (d > bd + 0.01) { bd = d; best = a; }
  }
  return best;
}
/** where the portal is (its door edge, its object, its tile) */
function portalSpot(p: Player, portal: Portal | null): { x: number; z: number; door?: { nx: number; nz: number } } {
  if (!portal) return { x: p.x + Math.cos(p.facing), z: p.z + Math.sin(p.facing) };
  const z = G.getZone(p.zoneKey);
  // a door edge carrying this portal
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const side of [0, 1] as const) {
    const x = portal.x + dx, y = portal.y + dy;
    const e = z.edge(x, y, side);
    if (!e || e.portal !== portal.id) continue;
    const cx = side === 0 ? x + 0.5 : x, cz = side === 0 ? y : y + 0.5;
    let nx = side === 0 ? 0 : 1, nz = side === 0 ? 1 : 0;
    if ((p.x - cx) * nx + (p.z - cz) * nz < 0) { nx = -nx; nz = -nz; }
    return { x: cx, z: cz, door: { nx, nz } };
  }
  // a portal object (the elevator, the manhole)
  const o = z.objectsAt(portal.x, portal.y)[0];
  if (o) return { x: o.x + 0.5, z: o.y + 0.5 };
  return { x: portal.x + 0.5, z: portal.y + 0.5 };
}
const yawTo = (p: Player, x: number, z: number) => Math.atan2(z - p.z, x - p.x);
/** a set at the unit's feet, turned to its facing */
function atUnit(g: THREE.Object3D, p: Player, yaw = p.facing) { g.position.set(p.x, p.y ?? 0, p.z); g.rotation.y = -yaw; }
/** the colour the walls go when they melt (the level's mood) */
function gelColour(zoneKey: string): number {
  const k = zoneKey.split('~')[0];
  return ({ lobby: 0xb59642, pools: 0x6fb2c4, office: 0x9a968a, server: 0x5a8a9a, hospital: 0xb8c8b0, ledge: 0xc87a3a, playground: 0xc89ac8, ballhouse: 0xd88a4a, fields: 0x9aa860 } as Record<string, number>)[k] ?? 0x8c7a4a;
}

// ---------------------------------------------------------------- the shots
interface Ctx { kind: Entrance; portal: Portal | null; from: string; to: string }

function* departure(c: Cine, x: Ctx): Script {
  const p = c.p;
  const spot = portalSpot(p, x.portal);
  switch (x.kind) {
    case 'lift': {
      c.face(yawTo(p, spot.x, spot.z), 0.5); c.ease('pitch', 3, 0.5);
      yield c.sleep(0.6);
      c.sfx('elevator_ding', 0.5, 0.9);
      yield c.fade(1, 0.2);
      const cab = liftCab({ landing: true });
      atUnit(cab.group, p); c.add(cab.group); c.isolated = true;
      cab.doors(1); cab.gate(0); cab.floor(4); cab.lamp(1);
      c.cam.pitch = 2;
      c.sfx('step_metal', 0.6);
      yield c.fade(0, 0.3);
      yield c.sleep(0.35);
      c.sfx('tc_ratchet', 0.7);
      yield c.tw(0.65, (k) => cab.gate(ease(k)));
      c.sfx('coach_doors', 0.75);
      yield c.tw(0.85, (k) => cab.doors(1 - ease(k)));
      c.sfx('metal_clank', 0.9); c.cam.shake = 1.4; c.ease('shake', 0.35, 0.3);
      c.sfx('lift_rise', 0.8, 0.82); c.sfx('leviathan_rumble', 0.3, 1.3);
      c.tween(2.4, (k) => {
        cab.floor(4 - Math.min(4, Math.floor(k * 5)));
        cab.lamp(k > 0.55 && k < 0.62 ? 0.15 : k > 0.8 ? 0.6 + Math.random() * 0.4 : 1);
        c.cam.dy = -0.012 * Math.sin(k * 41);
      });
      yield c.sleep(1.7);
      yield c.fade(1, 0.6);
      return;
    }
    case 'stairs_down': case 'stairs_up': {
      const up = x.kind === 'stairs_up';
      c.ease('pitch', up ? -4 : 14, 0.5);
      yield c.sleep(0.5);
      yield c.fade(1, 0.16);
      const sh = stairShaft(up);
      const f = p.facing, bx = p.x, by = p.y ?? 0, bz = p.z;
      atUnit(sh.group, p); c.add(sh.group); c.isolated = true;
      c.cam.pitch = up ? -8 : 22;
      yield c.fade(0, 0.28);
      let step = -1;
      const dur = 3.1;
      c.tween(dur, (k) => {
        const s = k;
        const d = s * sh.run, dy = s * sh.drop;
        sh.group.position.set(bx - Math.cos(f) * d, by - dy, bz - Math.sin(f) * d);
        const st = Math.floor(s * 12);
        if (st !== step) { step = st; c.sfx('step_concrete', 0.45, 0.9 + Math.random() * 0.2); }
        c.cam.dy = -0.06 * Math.abs(Math.sin(s * Math.PI * 12));
        c.cam.pitch = lerp(up ? -8 : 22, up ? -2 : 10, ease(s));
        p.speed = k < 1 ? 1.4 : 0;
        sh.bulb(s > 0.75 ? Math.max(0, 1 - (s - 0.75) * 3) * (Math.random() < 0.1 ? 0.3 : 1) : 1);
      });
      yield c.sleep(dur - 0.7);
      yield c.fade(1, 0.6);
      return;
    }
    case 'crawl_duct': case 'crawl_pipe': {
      const pipe = x.kind === 'crawl_pipe';
      c.face(yawTo(p, spot.x, spot.z), 0.45); c.ease('pitch', 26, 0.5);
      yield c.sleep(0.5);
      c.stance('crawl'); c.sfx('cloth', 0.6); c.sfx(pipe ? 'drip' : 'vent_clank', 0.5);
      // down onto the knees: from a standing eye to the crawl's
      c.cam.height = 1.6;
      c.ease('height', 0.55, 0.6);
      yield c.sleep(0.6);
      yield c.fade(1, 0.16);
      const dc = duct(pipe ? 'pipe' : 'duct', false);
      const f = p.facing, bx = p.x, by = p.y ?? 0, bz = p.z;
      atUnit(dc.group, p); c.add(dc.group); c.isolated = true;
      c.cam.pitch = 6; c.cam.height = 0.5;
      yield c.fade(0, 0.28);
      const dur = 3.2;
      let last = 0;
      c.tween(dur, (k) => {
        const d = k * 2.9;
        dc.group.position.set(bx - Math.cos(f) * d, by, bz - Math.sin(f) * d);
        c.cam.dy = -0.025 * Math.abs(Math.sin(k * Math.PI * 9));
        c.cam.roll = Math.sin(k * Math.PI * 4.5) * 1.6;
        p.speed = k < 1 ? 0.7 : 0;
        if (k - last > 0.18) { last = k; c.sfx(pipe ? 'step_water' : 'scrape_wall', 0.4, 0.85 + Math.random() * 0.3); }
        dc.light(k > 0.7 ? Math.max(0, 1 - (k - 0.7) * 3.3) : 0.85 + (Math.random() < 0.06 ? -0.5 : 0));
      });
      yield c.sleep(dur - 0.7);
      yield c.fade(1, 0.6);
      return;
    }
    case 'liquid': {
      const yaw = p.facing;
      c.ease('pitch', 4, 0.4);
      const m = membrane(gelColour(x.from));
      atUnit(m.group, p, yaw); c.add(m.group);
      const u = m.mat.uniforms;
      c.tween(9, (k) => { u.uTime.value = k * 9; });
      c.sfx('seam_ripple', 0.7);
      yield c.tw(0.9, (k) => { u.uA.value = 0.94 * ease(k); u.uTouch.value = 0.12 * k; });
      yield c.sleep(0.35);
      c.sfx('arv_squelch', 0.8);
      const fx = Math.cos(yaw), fz = Math.sin(yaw), x0 = p.x, z0 = p.z;
      // a step in: the surface swells round the face
      c.tween(1.3, (k) => { const e = ease(k); p.x = x0 + fx * 0.5 * e; p.z = z0 + fz * 0.5 * e; p.speed = k < 1 ? 0.6 : 0; u.uTouch.value = 0.12 + 0.88 * e; u.uSwell.value = 0.7 * e; });
      c.ease('fov', 52, 1.3);
      yield c.sleep(0.9);
      c.sfx('arv_gulp', 0.9);
      yield c.fade(1, 0.4, '#0d1310');
      return;
    }
    case 'door': {
      const d = spot.door;
      const nx = d?.nx ?? -Math.cos(p.facing), nz = d?.nz ?? -Math.sin(p.facing);
      // stand square in front of it
      const sx = spot.x + nx * 0.95, sz = spot.z + nz * 0.95;
      const yaw = Math.atan2(-nz, -nx);
      c.face(yaw, 0.5); c.ease('pitch', 3, 0.5);
      if (Math.hypot(sx - p.x, sz - p.z) > 0.08) c.walk(sx, sz, 0.55);
      const dd = darkDoor(0.92, 2.08, G.getZone(p.zoneKey).env?.sky ? 'p_paint_door' : 'p_oak_door');
      dd.group.position.set(spot.x, p.y ?? 0, spot.z);
      dd.group.rotation.y = -yaw;
      if (d) c.add(dd.group);
      yield c.sleep(0.6);
      c.sfx('door_open', 0.8); c.sfx('wood_creak', 0.5, 0.85);
      yield c.tw(1.1, (k) => dd.open(easeOut(k)));
      c.sfx('breath', 0.45);
      c.ease('fov', 54, 1.2);
      yield c.sleep(0.6);
      const tx = spot.x - nx * 0.7, tz = spot.z - nz * 0.7;
      c.walk(tx, tz, 1.15);
      yield c.sleep(0.55);
      yield c.fade(1, 0.45);
      return;
    }
  }
}

function* arrival(c: Cine, x: Ctx): Script {
  const p = c.p;
  const yaw = openFacing(p);
  p.facing = p.targetFacing = yaw;
  c.cam.fov = 62; c.cam.roll = 0; c.cam.dy = 0; c.cam.shake = 0; c.cam.yaw = 0;
  c.isolated = false;
  const out = (max: number) => clearAhead(p, yaw, max);
  const stepOut = (dist: number, dur: number) => { const d = out(dist); if (d > 0.2) c.walk(p.x + Math.cos(yaw) * d, p.z + Math.sin(yaw) * d, dur * (d / dist)); };
  switch (x.kind) {
    case 'lift': {
      const cab = liftCab({ half: 0.74 });
      atUnit(cab.group, p, yaw); c.add(cab.group); c.isolated = true;
      cab.doors(0); cab.gate(0); cab.floor(1); cab.lamp(0.9);
      c.cam.pitch = 3; c.cam.shake = 0.4;
      c.sfx('lift_rise', 0.45, 0.7);
      yield c.fade(0, 0.45);
      yield c.sleep(0.45);
      c.cam.shake = 0; c.sfx('metal_clank', 0.6); cab.floor(0);
      yield c.sleep(0.25);
      c.sfx('elevator_ding', 0.85);
      yield c.sleep(0.35);
      c.isolated = false;
      c.sfx('coach_doors', 0.7);
      bus.emit('travelLit', { to: x.to, kind: x.kind });
      yield c.tw(1.0, (k) => cab.doors(ease(k)));
      stepOut(1.9, 1.5);
      yield c.sleep(1.5);
      return;
    }
    case 'stairs_down': case 'stairs_up': {
      c.cam.pitch = x.kind === 'stairs_up' ? 8 : 18;
      bus.emit('travelLit', { to: x.to, kind: x.kind });
      c.fade(0, 0.55);
      let st = -1;
      const d = out(1.3);
      const x0 = p.x, z0 = p.z;
      c.tween(1.5, (k) => {
        p.x = x0 + Math.cos(yaw) * d * k; p.z = z0 + Math.sin(yaw) * d * k; p.speed = k < 1 ? 1.2 : 0;
        const s = Math.floor(k * 4); if (s !== st) { st = s; c.sfx('step_concrete', 0.45); }
        c.cam.dy = -0.05 * Math.abs(Math.sin(k * Math.PI * 4)) * (1 - k);
      });
      c.ease('pitch', 3, 1.4);
      yield c.sleep(1.6);
      return;
    }
    case 'crawl_duct': case 'crawl_pipe': {
      const pipe = x.kind === 'crawl_pipe';
      const dc = duct(pipe ? 'pipe' : 'duct', true);
      atUnit(dc.group, p, yaw); c.add(dc.group);
      c.stance('crawl'); c.cam.height = 0.5; c.cam.pitch = 5;
      bus.emit('travelLit', { to: x.to, kind: x.kind });
      c.fade(0, 0.5);
      const d = out(1.3), x0 = p.x, z0 = p.z;
      let last = 0;
      yield c.tw(1.6, (k) => {
        p.x = x0 + Math.cos(yaw) * d * k; p.z = z0 + Math.sin(yaw) * d * k; p.speed = k < 1 ? 0.7 : 0;
        c.cam.dy = -0.02 * Math.abs(Math.sin(k * Math.PI * 5));
        if (k - last > 0.3) { last = k; c.sfx(pipe ? 'step_water' : 'scrape_wall', 0.4); }
      });
      // up onto the feet
      c.stance('stand'); c.sfx('cloth', 0.5);
      yield c.tw(0.75, (k) => { c.cam.height = lerp(0.5, 1.62, ease(k)); c.cam.pitch = lerp(5, 2, k); });
      c.cam.height = -1;
      yield c.sleep(0.2);
      return;
    }
    case 'liquid': {
      c.tint = '#0d1310';
      c.stance('crawl'); c.cam.height = 0.62; c.cam.pitch = 38; c.cam.roll = -7;
      c.sfx('arv_spit', 0.9); c.sfx('wake_gasp', 0.7);
      bus.emit('travelLit', { to: x.to, kind: x.kind });
      c.fade(0, 0.9);
      c.ease('roll', 0, 1.4);
      yield c.sleep(0.9);
      c.stance('stand'); c.sfx('cloth', 0.5);
      yield c.tw(0.9, (k) => { c.cam.height = lerp(0.62, 1.62, ease(k)); c.cam.pitch = lerp(38, 4, ease(k)); });
      c.cam.height = -1;
      stepOut(0.6, 0.6);
      yield c.sleep(0.6);
      return;
    }
    case 'door': {
      c.cam.pitch = 6;
      bus.emit('travelLit', { to: x.to, kind: x.kind });
      c.fade(0, 0.6);
      c.sfx('door_close', 0.7);
      stepOut(1.0, 1.1);
      c.ease('pitch', 2, 1.0);
      yield c.sleep(1.3);
      return;
    }
  }
}

// ---------------------------------------------------------------- the wrapper
let lastEnd = -1e9;
/** after one crossing, the next within this many seconds is plain (walk-on loops, back-and-forth) */
const COOLDOWN = 25;

/** play the full crossing; `go` runs the level's own travel when the screen is black */
export function crossing(kind: Entrance, portal: Portal | null, to: string, go: () => void): Cine | null {
  const p = G.local;
  const ctx: Ctx = { kind, portal, from: p.zoneKey, to };
  let went = false, landed = false;
  const holds: Promise<unknown>[] = [];
  const off = bus.on('travelEnd', (pl: Player) => { if (pl === p) landed = true; });
  const travel = () => {
    if (went) return;
    went = true;
    try { bus.emit('travelDark', { from: ctx.from, to, kind, hold: (pr: Promise<unknown>) => { if (pr && typeof pr.then === 'function') holds.push(pr); } }); } catch (e) { console.warn('travelDark', e); }
    // the level's own crossing (its fade sits under our black); the unit is let go for it
    const g = G as Game;
    g.transitioning = false;
    go();
  };
  const settle = function* (c: Cine): Script {
    yield c.until(() => landed || !went, 40);
    if (holds.length) {
      let done = false;
      Promise.race([Promise.allSettled(holds), new Promise((r) => setTimeout(r, 8000))]).then(() => { done = true; });
      yield c.until(() => done, 9);
    }
  };
  const c = playCine({ name: 'travel:' + kind, pitch: 4, travel: true, onEnd: () => { off(); lastEnd = G.time; if (!went) travel(); } }, (c) => (function* () {
    c.onSkip = () => (function* () { c.black = 1; travel(); yield* settle(c); c.isolated = false; c.cam.height = -1; c.stance('stand'); bus.emit('travelLit', { to, kind }); })();
    yield c.eyeUp();
    yield* departure(c, ctx);
    c.black = 1;
    // the black: the level is built behind it
    c.dropAll();
    c.isolated = false; c.cam.height = -1; c.cam.pitch = 0; c.cam.roll = 0; c.cam.fov = 62; c.cam.shake = 0; c.cam.dy = 0;
    c.stance('stand');
    travel();
    yield* settle(c);
    yield c.sleep(0.15);
    c.onSkip = () => { c.isolated = false; c.cam.height = -1; c.stance('stand'); };
    yield* arrival(c, ctx);
  })());
  if (!c) off();
  return c;
}

export function installTravelCine(g: Game) {
  const any = g as unknown as { __travelCine?: boolean };
  if (any.__travelCine) return;
  any.__travelCine = true;
  const origUse = g.usePortal.bind(g), origTravel = g.travel.bind(g);
  let pending: Portal | null = null;
  g.usePortal = (p: Player, portal: Portal) => {
    if (p === g.local) pending = portal;
    try { origUse(p, portal); } finally { pending = null; }
  };
  g.travel = (p: Player, zoneKey: string, tx: number, ty: number, face?: number, lockReq?: string, anchor?: string) => {
    const portal = pending; pending = null;
    const plain = () => origTravel(p, zoneKey, tx, ty, face, lockReq, anchor);
    if (p !== g.local || !cineEnabled() || cineRunning() || g.transitioning || p.inVehicle || p.body.dead) return plain();
    if (lockReq && g.missions && !g.missions.isUnlocked?.(lockReq, p)) return plain();
    if (G.time - lastEnd < COOLDOWN) return plain();
    const kind = entranceFor(portal);
    if (!kind) return plain();
    if (!crossing(kind, portal, zoneKey, plain)) plain();
  };
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __crossing: unknown }).__crossing = {
      /** play a crossing in place (back into the same level, the same tile) */
      test(kind: Entrance = 'lift') {
        const p = g.local;
        lastEnd = -1e9;
        return crossing(kind, null, p.zoneKey, () => origTravel(p, p.zoneKey, p.tileX(), p.tileY(), p.facing));
      },
    };
  }
  void clamp01;
}

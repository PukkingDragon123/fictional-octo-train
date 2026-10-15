import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { op } from '../../game/ops';
import { G } from '../../game/G';
import { TF, Zone } from '../../world/zone';
import { itemDef } from '../../items/item';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, nm, netSet, pulse, attack, playersIn, stop, dist, faceTo, sfx, speak, showSpeech, objectsNear,
  floorItemsAround, isPrecious, takeFloorItem, putStored, restoreStore, galleryPose, h01, idHash,
} from '../behaviors_a';

// =====================================================================================
// THE CUSTODIAN — a maintenance process wearing a dark suit, too many arms folded
// behind its back. It tidies: picks up what you dropped, closes the doors you
// left open, switches off what you left on. It does not mind you — until you
// are untidy yourself.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  A.add('c_custodian_suit', 32, 32, (pc) => {
    const R = makeRamp(0x2c2c34, 6, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.45 + (tileFbm(x, y, 32, 32, 2, 2, 71) - 0.5) * 0.12, 0.3);
    for (let x = 2; x < 32; x += 6) for (let y = 0; y < 32; y += 2) pc.blend(x, y, 0x50505e, 0.35); // pinstripe
  });
  A.add('c_custodian_jacket', 24, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x2c2c34, 6, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.45 + (ph(x, y, 72) - 0.5) * 0.05, 0.3);
    for (let x = 2; x < 24; x += 6) for (let y = 0; y < 32; y += 2) pc.blend(x, y, 0x50505e, 0.3);
    for (let y = 0; y < 15; y++) { const w = Math.max(0, 5 - (y >> 1)); for (let x = 12 - w; x < 12 + w; x++) pc.set(x, y, 0xd8d8d0); }
    for (let y = 0; y < 18; y++) { const w = Math.max(0, 6 - (y >> 1)); pc.set(12 - w - 1, y, R[0]); pc.set(12 + w, y, R[0]); pc.set(12 + w + 1, y, R[3]); }
    for (let y = 1; y < 24; y++) { pc.set(11, y, 0x0c0c10); pc.set(12, y, 0x14141a); } // black tie
    pc.rect(3, 10, 5, 3, 0xb89a4a); pc.hline(4, 6, 11, 0x6a5a2a); // brass name plate, blank
    pc.rect(16, 9, 4, 2, 0xe8e8e0); // pocket square
    pc.set(12, 26, R[4]); pc.set(12, 29, R[4]);
  });
  // a smooth head with nothing on it but a seam
  A.add('c_custodian_head', 16, 24, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xb4b4ae, 6, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.6 - Math.abs(x - 7.5) * 0.025 + (ph(x, y, 73) - 0.5) * 0.03, 0.3);
    for (let y = 0; y < 24; y++) pc.blend(8, y, R[2], 0.35);
    pc.set(7, 20, R[2]); pc.set(9, 20, R[2]); // two screw holes where a mouth would be
  });
  A.add('c_custodian_glove', 8, 8, (pc) => {
    const R = makeRamp(0xdcdcd4, 5);
    pc.fillRamp(R, (x, y) => 0.6 + (ph(x, y, 74) - 0.5) * 0.1, 0.3);
  });
});

const SUIT = 'c_custodian_suit', GLOVE = 'c_custodian_glove';
const PAIRS = [0.74, 0.58, 0.42];

function buildCustodian(): Rig {
  const rig = newRig(2.6);
  const hips = part(rig, 'hips', rig.body, [0, 1.3, 0], (mb) => { mb.box(0, -0.1, 0, 0.32, 0.16, 0.2, SUIT); });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const th = part(rig, 'thigh' + n, hips, [s * 0.09, -0.08, 0], (mb) => { mb.box(0, -0.64, 0, 0.12, 0.64, 0.14, SUIT); });
    part(rig, 'shin' + n, th, [0, -0.64, 0], (mb) => {
      mb.box(0, -0.52, 0, 0.11, 0.52, 0.12, SUIT);
      mb.box(0, -0.58, 0.04, 0.12, 0.07, 0.29, 'leather_black', { color: 0x606068 }); // polished shoes
    });
  }
  const spine = part(rig, 'spine', hips, [0, 0.06, 0], (mb) => {
    mb.box(0, 0, 0, 0.42, 0.8, 0.22, { south: 'c_custodian_jacket', all: SUIT }, { fit: { south: true } });
    mb.box(0, -0.1, 0.0, 0.44, 0.14, 0.23, SUIT); // jacket skirt
    mb.box(0, 0.76, 0, 0.5, 0.07, 0.22, SUIT); // square shoulders
    // a ring of keys at the hip
    mb.box(0.23, -0.02, 0.06, 0.012, 0.06, 0.012, 'metal_brass');
    mb.box(0.235, -0.07, 0.07, 0.008, 0.05, 0.02, 'metal_brass');
    mb.box(0.23, -0.07, 0.05, 0.008, 0.04, 0.016, 'chrome');
  });
  const neck = part(rig, 'neck', spine, [0, 0.8, 0], (mb) => { mb.box(0, 0, 0, 0.08, 0.14, 0.08, 'white', { color: 0xc8c8c0 }); });
  part(rig, 'head', neck, [0, 0.12, 0], (mb) => {
    mb.cylinder(0, 0, 0, 0.11, 0.3, 8, { sides: 'c_custodian_head', top: 'c_custodian_head', bottom: 'c_custodian_head' }, { rTop: 0.1 });
    mb.sphere(0, 0.3, 0, 0.1, 8, 4, 'c_custodian_head', { sy: 0.7 });
    mb.box(0, 0.02, 0.07, 0.13, 0.26, 0.06, { south: 'c_custodian_head', all: 'c_custodian_head' }, { fit: { south: true } });
  });
  // three pairs of arms folded behind the back
  PAIRS.forEach((y, i) => {
    for (const s of [-1, 1]) {
      const n = `${i}${s < 0 ? 'L' : 'R'}`;
      const ua = part(rig, 'ua' + n, spine, [s * (0.22 + i * 0.015), y, -0.06 - i * 0.02], (mb) => { mb.box(0, -0.4, 0, 0.085, 0.4, 0.09, SUIT); });
      const fa = part(rig, 'fa' + n, ua, [0, -0.4, 0], (mb) => {
        mb.box(0, -0.36, 0, 0.075, 0.36, 0.08, SUIT);
        mb.box(0, -0.37, 0, 0.085, 0.03, 0.09, 'white', { color: 0xd8d8d0 }); // cuff
        mb.box(0, -0.5, 0.0, 0.07, 0.13, 0.04, GLOVE);
        mb.box(-s * 0.03, -0.44, 0.02, 0.02, 0.07, 0.02, GLOVE);
      });
      void fa;
    }
  });
  return rig;
}

/** reach: 0 folded, 1 top pair reaching forward/down; menace: pairs unfold sideways; glitch: twitching */
function pose(rig: Rig, moving: boolean, phase: number, t: number, reach: number, menace: number, glitch: number, seed: number) {
  const P = rig.parts;
  const sw = moving ? Math.sin(phase * 0.7) : 0;
  P.thighL.rotation.x = sw * 0.3; P.thighR.rotation.x = -sw * 0.3;
  P.shinL.rotation.x = Math.max(0, -sw) * 0.35; P.shinR.rotation.x = Math.max(0, sw) * 0.35;
  rig.body.position.y = 0; // it glides: no bob at all
  P.spine.rotation.x = reach * 0.35;
  P.head.rotation.x = reach * 0.35 - menace * 0.1;
  P.head.rotation.y = 0;
  PAIRS.forEach((_, i) => {
    for (const s of [-1, 1]) {
      const n = `${i}${s < 0 ? 'L' : 'R'}`;
      const ua = P['ua' + n], fa = P['fa' + n];
      const r = i === 0 ? reach : i === 1 ? menace * 0.8 : menace * 0.3;
      // folded: upper arm back, forearm across the small of the back
      const fold = 1 - r;
      ua.rotation.set(0.42 * fold - r * (i === 0 ? 1.35 : 0.6), 0, -s * 0.1 * fold + s * r * (i === 0 ? 0.05 : 0.9));
      fa.rotation.set(-r * 0.3, 0, -s * 1.45 * fold - s * r * 0.15);
      if (glitch > 0) {
        const g = h01(Math.floor(t * 12) + i * 7 + (s > 0 ? 3 : 0), seed);
        if (g < 0.45) { ua.rotation.x += (g - 0.2) * 3; fa.rotation.z += (h01(g * 99, seed) - 0.5) * 2; }
      }
    }
  });
  if (glitch > 0) { P.head.rotation.y = (h01(Math.floor(t * 9), seed) - 0.5) * 1.4; P.head.rotation.z = (h01(Math.floor(t * 7), seed + 1) - 0.5) * 0.6; }
}

function animateCustodian(rig: Rig, c: Creature, t: number, dt: number) {
  void dt;
  const n = nm(c);
  const reach = c.attackPhase > 0 ? 1 : n.reach ? 1 : 0;
  const menace = c.state === 'chase' || c.state === 'warn' ? 1 : 0;
  const k = c.mem._reach ?? 0;
  c.mem._reach = k + (reach - k) * Math.min(1, dt * 6);
  const m = c.mem._men ?? 0;
  c.mem._men = m + (menace - m) * Math.min(1, dt * 3);
  pose(rig, c.speed > 0.1, c.phase, t, c.mem._reach, c.mem._men, c.state === 'frozen' || c.hitFlash > 0 || c.stagger > 0 ? 1 : 0, idHash(c) * 50);
  showSpeech(c, 2.75);
}

// ---------------------------------------------------------------- judgement
const ANOMALOUS = (key: string) => { const d = itemDef(key); return d.cat === ('anomaly' as any) || !!d.anomaly || !!d.tags?.includes('anomalous'); };
/** how out of place a survivor is (>= 3: process them) */
export function untidiness(p: Player, z: Zone): number {
  let s = Math.max(0, G.missions?.stage ?? 0);
  if (z.inb(p.tileX(), p.tileY()) && (z.flags[z.idx(p.tileX(), p.tileY())] & TF.CORRUPT)) s += 2;
  const items = p.isLocal ? p.allItems() : [p.handR, p.handL].filter((x): x is NonNullable<typeof x> => !!x);
  let an = 0; for (const it of items) if (ANOMALOUS(it.key)) an++;
  s += Math.min(2, an * 0.75);
  if (p.isLocal) { const cr = p.body.corruption ?? 0; s += cr > 60 ? 2 : cr > 30 ? 1 : 0; }
  return s;
}
const NOTICES = ['This area is being maintained.', 'Please return anomalous materials.', 'You are out of place.', 'Unauthorised persistence detected.', 'Remain where you are.', 'Thank you for your patience.'];

// ---------------------------------------------------------------- tidying
type Task = { kind: 'item'; uid: number; x: number; z: number } | { kind: 'door'; x: number; y: number; side: 0 | 1; sx: number; sz: number } | { kind: 'switch'; uid: number; x: number; z: number } | { kind: 'bin'; uid: number; x: number; z: number };
function playerNear(c: Creature, x: number, z: number, r: number) { return playersIn(c).some((p) => dist(p.x, p.z, x, z) < r); }
function findTask(c: Creature): Task | null {
  const z = zoneOf(c);
  const tidied: any[] = c.mem.tidied || [];
  if (tidied.length >= 3) {
    const bins = objectsNear(z, c.x, c.z, 22, (o, d) => !!o.inv && (d.container?.kind === 'trash' || (d.container?.kind === 'bin' && d.container?.loot === 'trash') || /trash|bin/.test(o.key)), 6);
    const b = bins.sort((a, b2) => dist(a.x, a.y, c.x, c.z) - dist(b2.x, b2.y, c.x, c.z))[0];
    if (b) return { kind: 'bin', uid: b.uid, x: b.x + 0.5, z: b.y + 0.5 };
  }
  // whatever is nearest: dropped things, doors left open, things left switched on
  let best: Task | null = null, bd = Infinity;
  const consider = (t: Task, d: number) => { if (d < bd) { bd = d; best = t; } };
  if (tidied.length < 12) for (const wi of floorItemsAround(z, c.x, c.z, 10)) {
    if (isPrecious(wi.item) || playerNear(c, wi.x, wi.z, 2.5)) continue;
    consider({ kind: 'item', uid: wi.item.uid, x: wi.x, z: wi.z }, dist(wi.x, wi.z, c.x, c.z));
  }
  const cx = Math.floor(c.x), cy = Math.floor(c.z);
  for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) for (const side of [0, 1] as const) {
    const e = z.edge(x, y, side);
    if (!e || e.kind !== 'door' || !e.open || e.portal || e.locked || e.barricade > 0) continue;
    const ex = side === 0 ? x + 0.5 : x, ez = side === 0 ? y : y + 0.5;
    if (playerNear(c, ex, ez, 3)) continue;
    // stand on our side of it
    const sx = side === 0 ? ex : ex + (c.x > ex ? 0.6 : -0.6), sz = side === 0 ? ez + (c.z > ez ? 0.6 : -0.6) : ez;
    consider({ kind: 'door', x, y, side, sx, sz }, dist(ex, ez, c.x, c.z) * 0.8);
  }
  const on = objectsNear(z, c.x, c.z, 8, (o, d) => !!o.state?.on && (!!d.tags?.includes('tv') || !!d.tags?.includes('radio')) && !d.tags?.includes('mission'), 3);
  for (const o of on) if (!playerNear(c, o.x + 0.5, o.y + 0.5, 4)) consider({ kind: 'switch', uid: o.uid, x: o.x + 0.5, z: o.y + 0.5 }, dist(o.x + 0.5, o.y + 0.5, c.x, c.z));
  return best;
}
function doTask(c: Creature, t: Task) {
  const z = zoneOf(c);
  if (t.kind === 'item') {
    const wi = floorItemsAround(z, t.x, t.z, 0.3).find((w) => w.item.uid === t.uid);
    if (wi) { takeFloorItem(c, wi, 'tidied'); sfx(c, 'grab', 0.6); }
  } else if (t.kind === 'door') {
    const e = z.edge(t.x, t.y, t.side);
    if (e && e.open) { op('edge', { z: c.zoneKey, x: t.x, y: t.y, side: t.side, patch: { open: false } }); sfx(c, 'door_close', 0.9); }
  } else if (t.kind === 'switch') {
    const o = z.objects.get(t.uid);
    if (o?.state?.on) { op('objState', { z: c.zoneKey, uid: o.uid, patch: { on: false } }); sfx(c, 'power_off', 0.6); }
  } else if (t.kind === 'bin') {
    const o = z.objects.get(t.uid);
    if (o?.inv) { putStored(c, 'tidied', o.uid); sfx(c, 'rummage', 0.7); }
  }
}

/** pursuing: open (and later close) doors in the way */
function doorwork(c: Creature, dt: number) {
  const z = zoneOf(c);
  const lx = c.mem.lx ?? c.x, lz = c.mem.lz ?? c.z;
  c.mem.lx = c.x; c.mem.lz = c.z;
  if (c.speed > 0.5 && dist(lx, lz, c.x, c.z) < c.speed * dt * 0.25) c.mem.stuck = (c.mem.stuck ?? 0) + dt; else c.mem.stuck = 0;
  if (c.speed === 0 || c.mem.stuck > 0.6) {
    const cx = Math.floor(c.x), cy = Math.floor(c.z);
    for (const [x, y, side] of [[cx, cy, 0], [cx, cy, 1], [cx, cy + 1, 0], [cx + 1, cy, 1]] as [number, number, 0 | 1][]) {
      const e = z.edge(x, y, side);
      if (!e || e.kind !== 'door' || e.open || e.locked || e.barricade > 0) continue;
      op('edge', { z: c.zoneKey, x, y, side, patch: { open: true } });
      sfx(c, 'door_open', 0.9);
      c.mem.toClose = { x, y, side }; c.mem.stuck = 0; c.path = null; c.repathT = 0;
      break;
    }
  }
  const tc = c.mem.toClose;
  if (tc) {
    const ex = tc.side === 0 ? tc.x + 0.5 : tc.x, ez = tc.side === 0 ? tc.y : tc.y + 0.5;
    if (dist(ex, ez, c.x, c.z) > 1.6) {
      const e = z.edge(tc.x, tc.y, tc.side);
      if (e?.open && !playerNear(c, ex, ez, 1.2)) { op('edge', { z: c.zoneKey, x: tc.x, y: tc.y, side: tc.side, patch: { open: false } }); sfx(c, 'door_close', 0.8); }
      c.mem.toClose = null;
    }
  }
}

function thinkCustodian(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  restoreStore(c, 'tidied');
  // staggers: three blows in quick succession make it lose its place for a moment
  if (ev.staggered) {
    const hits: number[] = (c.mem.hits = (c.mem.hits || []).filter((h: number) => G.time - h < 6));
    hits.push(G.time);
    if (hits.length >= 3 && c.state !== 'frozen') { c.mem.hits = []; c.setState('frozen'); stop(c); sfx(c, 'custodian_glitch', 1); netSet(c, 'reach', 0); return true; }
  }
  if (c.state === 'frozen') { stop(c); if (c.stateT > 4.5) c.setState('wander'); return true; }
  // who is out of place?
  if ((c.mem.judgeT ?? 0) < G.time) {
    c.mem.judgeT = G.time + 0.6;
    let worst: Player | null = null, ws = 0;
    for (const p of playersIn(c)) {
      const d = dist(p.x, p.z, c.x, c.z);
      if (d > 16) continue;
      const s = untidiness(p, z);
      if (s > ws) { ws = s; worst = p; }
    }
    c.mem.score = ws; c.mem.worst = worst?.id ?? null;
  }
  const worst = c.mem.worst ? G.players.get(c.mem.worst) ?? null : null;
  const score = c.mem.score ?? 0;
  switch (c.state) {
    case 'chase': {
      netSet(c, 'reach', 0);
      const T = c.targetId ? G.players.get(c.targetId) ?? null : worst;
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { c.setState('wander'); return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const sTarget = untidinessCached(c, T, z);
      if (sTarget < 2 && c.stateT > 8) { c.setState('wander'); c.targetId = null; cs.call(c, 'idle'); return true; }
      if (d > 30) { c.setState('wander'); return true; }
      const reach = (c.sp.attack?.range ?? 1.1) + T.radius;
      if (d <= reach) { faceTo(c, T.x, T.z); stop(c); if (c.attackT <= 0) attack(c, T); return true; }
      cs.moveTo(c, z, T.x, T.z, c.sp.run, dt, reach * 0.85);
      doorwork(c, dt);
      return true;
    }
    case 'warn': {
      stop(c); netSet(c, 'reach', 0);
      const T = c.targetId ? G.players.get(c.targetId) ?? null : null;
      if (!T) { c.setState('wander'); return true; }
      faceTo(c, T.x, T.z);
      if (c.stateT > 3.2) {
        if (untidinessCached(c, T, z) >= 3) { c.setState('chase'); cs.call(c, 'alert'); }
        else { c.setState('wander'); c.mem.noteCool = G.time + 25; }
      }
      return true;
    }
    default: {
      if (worst && score >= 3) { c.targetId = worst.id; c.setState('chase'); cs.call(c, 'alert'); speak(c, NOTICES[2 + Math.floor(cs.rng.next() * 3)], 3); return true; }
      if (worst && score >= 2 && G.time > (c.mem.noteCool ?? 0) && dist(worst.x, worst.z, c.x, c.z) < 9) {
        c.targetId = worst.id; c.setState('warn'); cs.call(c, 'alert'); speak(c, NOTICES[Math.floor(cs.rng.next() * 3)], 3); return true;
      }
      if (ev.staggered && c.targetId && score >= 1) { c.setState('warn'); return true; }
      return tidy(c, dt);
    }
  }
}
function untidinessCached(c: Creature, p: Player, z: Zone) {
  const k = 's_' + p.id;
  const e = c.mem[k];
  if (e && e.t > G.time) return e.v;
  const v = untidiness(p, z); c.mem[k] = { v, t: G.time + 1 };
  return v;
}

function tidy(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const task: Task | null = c.mem.task;
  if (c.mem.reachT && G.time < c.mem.reachT) { stop(c); return true; }
  if (c.mem.reachT) { c.mem.reachT = 0; netSet(c, 'reach', 0); if (task) doTask(c, task); c.mem.task = null; c.setState('wander'); c.goal = null; return true; }
  if (task) {
    const gx = task.kind === 'door' ? task.sx : task.x, gz = task.kind === 'door' ? task.sz : task.z;
    if (cs.moveTo(c, z, gx, gz, c.sp.walk, dt, task.kind === 'item' ? 0.55 : 0.8) || c.stateT > 20) {
      if (c.stateT > 20) { c.mem.task = null; c.setState('wander'); return true; }
      if (task.kind === 'door') faceTo(c, task.side === 0 ? task.x + 0.5 : task.x, task.side === 0 ? task.y : task.y + 0.5); else faceTo(c, task.x, task.z);
      stop(c);
      c.mem.reachT = G.time + 1.1; netSet(c, 'reach', 1);
    }
    doorwork(c, dt);
    return true;
  }
  if ((c.mem.taskT ?? 0) < G.time) {
    c.mem.taskT = G.time + 1.5;
    const t = findTask(c);
    if (t) { c.mem.task = t; c.setState('investigate'); return true; }
  }
  // patrol
  if (c.state !== 'wander') c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 30) {
    c.goal = cs.wanderSpot(c, z, 22); c.stateT = 0;
  }
  if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.06)) { cs.call(c, 'idle'); c.noiseCooldown = 12; }
  doorwork(c, dt);
  return true;
}

const sp = def({
  key: 'custodian', name: 'The Custodian', code: 'M-00 // MAINTENANCE PROCESS', temperament: 'neutral', threat: 4,
  hp: 999, walk: 1.05, run: 2.9, turn: 5, radius: 0.34, height: 2.6, sight: 18, fov: 1.5, hearing: 1.0, nightVision: true,
  attack: { dmg: [8, 15], range: 1.1, cooldown: 2.1, kinds: ['bruise', 'fracture', 'laceration'], corrupt: 0.25, knock: 1.1, parts: ['torso_u', 'head', 'neck', 'uarm_l', 'uarm_r'] },
  zones: ['office', 'mall', 'hospital', 'lab', 'server', 'corrupt'], weight: 1, maxPerZone: 2, diet: 'none',
  flags: { custodian: true, immortal: true, noCorpse: true },
  sounds: { idle: 'custodian_tone', alert: 'custodian_alarm', attack: 'custodian_strike', hurt: 'custodian_glitch' },
  scan: {
    cls: 'Maintenance process',
    notes: [
      'Tall, faceless, six arms folded behind its back. It is cleaning up.',
      'Picks up anything left on the floor and puts it in the nearest bin. Closes doors. Switches off what you left on.',
      'Ignores tidy survivors. Carrying anomalies, standing in corruption or being corrupted yourself gets you noticed.',
      'Every render node taken offline makes it less tolerant.',
      'It cannot be destroyed. Three quick blows make it lose its place for a few seconds.',
    ],
  },
  gore: { blood: 'none' },
  build: buildCustodian,
  animate: animateCustodian,
  think: thinkCustodian,
});
(sp.sounds as any).loop = 'custodian_hum';
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  pose(rig, q.startsWith('walk'), t * 4, t, q.startsWith('reach') ? 1 : 0, q.startsWith('menace') ? 1 : 0, q.startsWith('glitch') ? 1 : 0, 3);
  rig.root.rotation.y = q.endsWith('back') ? Math.PI * 0.8 : 0;
};

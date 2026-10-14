import * as THREE from 'three';
import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { op } from '../../game/ops';
import { G } from '../../game/G';
import { worldMaterial } from '../../gfx/materials';
import { itemGeometry } from '../../items/itemMeshes';
import { itemWeight, itemDef } from '../../items/item';
import type { Creature } from '../creature';
import {
  CS, zoneOf, nm, netSet, pulse, instFlags, walkable, attack, nearestPlayer, stop, dist, faceTo, sfx, ventSpots, VentSpot, objectsNear,
  floorItemsAround, isPrecious, takeFloorItem, takeObjItem, dropStored, onKilled, hideRig, galleryPose, suppressSighting, restoreStore, ease, lerp, findSpot,
} from '../behaviors_a';

// =====================================================================================
// VENTLING — a small pale thing that lives in the ducts. It crawls out of one
// vent and into another, and it takes things: whatever is lying on the floor,
// whatever you left in that drawer. Cowardly. Kill it or trap it and it drops
// everything it was carrying.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  A.add('c_ventling_skin', 16, 16, (pc) => {
    const R = makeRamp(0xaeb2a8, 6, { hueShift: -0.05 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 16, 16, 2, 2, 51) - 0.5) * 0.22, 0.5);
    // veins just under the skin
    let x = 3, y = 0;
    for (let i = 0; i < 16; i++) { pc.blend(x & 15, y, 0x6a7a98, 0.45); y++; if (ph(i, 1, 5) < 0.4) x++; }
    x = 12; y = 4;
    for (let i = 0; i < 8; i++) { pc.blend(x & 15, y & 15, 0x7a86a0, 0.35); x += ph(i, 2, 5) < 0.5 ? 1 : -1; y++; }
    // creases
    for (let i = 0; i < 16; i += 5) pc.blend(i, (i * 3) & 15, R[1], 0.4);
  });
  A.add('c_ventling_face', 12, 10, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xaeb2a8, 6, { hueShift: -0.05 });
    pc.fillRamp(R, (x, y) => 0.55 - y * 0.025, 0.4);
    // two huge slanted black eyes, no whites at all — just a dull eyeshine low in each
    for (const [ex, dir] of [[0, 1], [7, -1]] as [number, number][]) {
      for (let y = 1; y < 6; y++) for (let x = 0; x < 5; x++) { const sl = dir > 0 ? (y < 2 && x > 3) : (y < 2 && x < 1); if (!sl) pc.set(ex + x, y, 0x050506); }
      pc.set(ex + 2, 4, 0x3a4a40);
    }
    // a wide mouth full of needle teeth
    pc.hline(1, 10, 8, 0x1e0e12);
    for (let x = 1; x < 11; x += 2) pc.set(x, 7, 0xd8d0c0);
    for (let x = 2; x < 11; x += 2) pc.set(x, 9, 0xc8c0b0);
  });
});

const SK = 'c_ventling_skin';

function buildVentling(): Rig {
  const rig = newRig(0.35);
  const torso = part(rig, 'torso', rig.body, [0, 0.2, -0.02], (mb) => {
    mb.box(0, -0.06, 0, 0.15, 0.12, 0.28, SK);
    mb.box(0, 0.06, -0.02, 0.05, 0.02, 0.24, SK, { color: 0xc8c4bc }); // spine ridge
    mb.box(0, -0.05, -0.17, 0.12, 0.1, 0.08, SK); // haunches
  });
  const neck = part(rig, 'neck', torso, [0, 0.0, 0.14], (mb) => { mb.box(0, -0.03, 0.03, 0.06, 0.06, 0.08, SK); });
  part(rig, 'head', neck, [0, 0.0, 0.07], (mb) => {
    mb.box(0, -0.06, 0.05, 0.15, 0.12, 0.12, { south: 'c_ventling_face', all: SK }, { fit: { south: true } });
    mb.box(0, 0.05, 0.03, 0.11, 0.03, 0.09, SK); // bulging cranium
  });
  const eyes = part(rig, 'eyes', rig.parts.head, [0, 0, 0], (mb) => {
    mb.box(-0.04, -0.015, 0.112, 0.012, 0.012, 0.004, 'c_eye_glow', { color: 0xc8ffd8, emissive: 1.2 });
    mb.box(0.042, -0.015, 0.112, 0.012, 0.012, 0.004, 'c_eye_glow', { color: 0xc8ffd8, emissive: 1.2 });
  }, true);
  rig.eyes = [eyes];
  // long, wrong limbs: knees up like a crawling child
  const limbs: [string, number, number, number][] = [['armL', -1, 0.1, 0.24], ['armR', 1, 0.1, 0.24], ['legL', -1, -0.12, 0.2], ['legR', 1, -0.12, 0.2]];
  for (const [n, s, z, len] of limbs) {
    const up = part(rig, n, torso, [s * 0.07, -0.04, z], (mb) => { mb.box(s * 0.02, 0, 0, 0.03, len, 0.03, SK); });
    up.rotation.z = -s * 0.9;
    const lo = part(rig, n + 'b', up, [s * 0.02, len, 0], (mb) => {
      mb.box(0, -len - 0.04, 0, 0.025, len + 0.04, 0.025, SK);
      for (let k = -1; k <= 1; k++) mb.box(k * 0.012, -len - 0.05, 0.03, 0.008, 0.008, 0.06, SK); // fingers
    });
    lo.rotation.z = s * 0.9;
  }
  part(rig, 'tail', torso, [0, -0.06, -0.2], (mb) => { mb.box(0, 0, -0.18, 0.02, 0.02, 0.36, SK); });
  part(rig, 'carry', rig.parts.head, [0, -0.11, 0.16], () => {});
  return rig;
}

function crawl(rig: Rig, moving: boolean, phase: number, t: number, alarm: number) {
  const P = rig.parts;
  const g = moving ? 1 : 0;
  const L = [['armL', 0], ['legR', 0], ['armR', Math.PI], ['legL', Math.PI]] as [string, number][];
  for (const [n, o] of L) {
    const s = n.endsWith('L') ? -1 : 1;
    const w = Math.sin(phase * 1.6 + o) * g;
    P[n].rotation.x = w * 0.6;
    P[n].rotation.z = -s * (0.9 + Math.max(0, w) * 0.3);
    P[n + 'b'].rotation.z = s * (0.9 + Math.max(0, -w) * 0.25);
  }
  rig.body.position.y = g ? Math.abs(Math.sin(phase * 1.6)) * 0.015 : 0;
  P.torso.rotation.x = 0.08 + alarm * 0.15;
  P.head.rotation.y = g ? 0 : Math.sin(Math.floor(t * 2.3) * 3.7) * 0.6; // twitchy look-around
  P.head.rotation.x = -0.1 - alarm * 0.2;
  P.tail.rotation.y = Math.sin(t * 3) * 0.3; P.tail.rotation.x = -0.1 + alarm * 0.5;
}

function setCarry(rig: Rig, key: string | null) {
  if ((rig.root.userData.carry ?? null) === key) return;
  rig.root.userData.carry = key;
  const g = rig.parts.carry;
  while (g.children.length) g.remove(g.children[0]);
  if (!key) return;
  const geo = itemGeometry(key);
  if (!geo) return;
  const m = new THREE.Mesh(geo, worldMaterial({}));
  // shrink big things so they fit in its mouth
  const bb = geo.boundingBox; const sz = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) : 0.2;
  m.scale.setScalar(Math.min(1, 0.22 / Math.max(0.05, sz)));
  m.rotation.set(0.3, 0.8, 0);
  g.add(m);
}

function animateVentling(rig: Rig, c: Creature, t: number, dt: number) {
  void dt;
  const n = nm(c);
  suppressSighting(c, !!n.duct && !c.dead);
  if (n.duct && !c.dead) { hideRig(c, rig); return; }
  setCarry(rig, c.dead ? null : (n.carry ?? null));
  const alarm = c.state === 'flee' || c.attackPhase > 0 ? 1 : 0;
  crawl(rig, c.speed > 0.15, c.phase, t, alarm);
  // squeezing out of a vent
  if (c.state === 'emerge') { const k = ease(Math.min(1, (c.mem._et = (c.mem._et ?? 0) + dt) / 0.6)); rig.body.scale.set(lerp(0.4, 1, k), lerp(0.25, 1, k), 1); }
  else { c.mem._et = 0; rig.body.scale.set(1, 1, 1); }
}

// ---------------------------------------------------------------- brain
function playerNear(c: Creature, x: number, z: number, r: number) {
  for (const p of CS().playersInZone(c.zoneKey)) if (dist(p.x, p.z, x, z) < r) return true;
  return false;
}
/** nearest vent no survivor is standing next to */
function pickVent(c: Creature, opts: { near?: boolean; awayFrom?: { x: number; z: number }; min?: number; max?: number } = {}): VentSpot | null {
  const vs = ventSpots(zoneOf(c)).filter((v) => !playerNear(c, v.x, v.z, 3));
  if (!vs.length) return null;
  if (opts.near) {
    let best: VentSpot | null = null, bd = opts.max ?? 18;
    for (const v of vs) {
      const d = dist(v.x, v.z, c.x, c.z);
      if (opts.awayFrom && dist(v.x, v.z, opts.awayFrom.x, opts.awayFrom.z) < dist(c.x, c.z, opts.awayFrom.x, opts.awayFrom.z) - 1) continue;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  const far = vs.filter((v) => { const d = dist(v.x, v.z, c.x, c.z); return d >= (opts.min ?? 8) && d <= (opts.max ?? 45); });
  const list = far.length ? far : vs;
  return list[Math.floor(CS().rng.next() * list.length)];
}

type Loot = { kind: 'floor'; wi: any; x: number; z: number } | { kind: 'obj'; o: any; it: any; x: number; z: number } | { kind: 'trap'; o: any; x: number; z: number };
function findLoot(c: Creature): Loot | null {
  const z = zoneOf(c);
  // bait in a set trap is irresistible
  for (const o of objectsNear(z, c.x, c.z, 10, (o, d) => !!o.state?.armed && !!o.state?.bait && !o.state?.caught && !!d.tags?.includes('trap'), 4)) {
    if (!playerNear(c, o.x + 0.5, o.y + 0.5, 4)) return { kind: 'trap', o, x: o.x + 0.5, z: o.y + 0.5 };
  }
  let best: Loot | null = null, bd = 13;
  for (const wi of floorItemsAround(z, c.x, c.z, 13)) {
    if (isPrecious(wi.item) || itemWeight(wi.item) > 2.5) continue;
    if (playerNear(c, wi.x, wi.z, 5)) continue;
    const d = dist(wi.x, wi.z, c.x, c.z);
    if (d < bd) { bd = d; best = { kind: 'floor', wi, x: wi.x, z: wi.z }; }
  }
  if (best) return best;
  for (const o of objectsNear(z, c.x, c.z, 10, (o) => !!o.inv && o.inv.lootDone && o.inv.items.length > 0 && !o.inv.locked, 12)) {
    if (playerNear(c, o.x + 0.5, o.y + 0.5, 6)) continue;
    const it = o.inv.items.filter((i: any) => !isPrecious(i) && itemWeight(i) <= 2.5).sort((a: any, b: any) => (itemDef(b.key).value ?? 1) - (itemDef(a.key).value ?? 1))[0];
    if (it) return { kind: 'obj', o, it, x: o.x + 0.5, z: o.y + 0.5 };
  }
  return null;
}

function enterVent(c: Creature, from: VentSpot | null) {
  const z = zoneOf(c);
  const stash = (c.mem.stolen?.length ?? 0) >= 3 && c.mem.nest;
  const nest: VentSpot | undefined = stash ? ventSpots(z).find((v) => v.uid === c.mem.nest) : undefined;
  const to = nest && !playerNear(c, nest.x, nest.z, 6) ? nest : pickVent(c, { min: 8, max: 40 });
  if (from) { c.x = from.wx; c.z = from.wz; sfx(c, 'vent_clank', 0.8); }
  if (!c.mem.nest && from) c.mem.nest = from.uid;
  c.mem.route = to ? { fx: c.x, fz: c.z, to } : null;
  c.setState('travel'); stop(c);
  netSet(c, 'duct', 1);
}

function thinkVentling(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  restoreStore(c, 'stolen');
  if (c.mem.stolen?.length && !nm(c).carry && !nm(c).duct) netSet(c, 'carry', c.mem.stolen[c.mem.stolen.length - 1].key);
  const hasVents = ventSpots(z).length > 0;
  instFlags(c, { immortal: !!nm(c).duct });
  const threat = nearestPlayer(c, 5, (p, d) => d < 2.2 || (c.awareness.get(p.id) ?? 0) > 0.5 || p.running);
  if (c.state !== 'travel' && c.state !== 'hide' && c.state !== 'flee' && c.attackPhase <= 0 && (threat || ev.staggered)) {
    c.setState('flee'); c.goal = null; cs.call(c, 'alert');
  }
  switch (c.state) {
    case 'travel': {
      netSet(c, 'duct', 1);
      const r = c.mem.route;
      if (!r) { c.setState('hide'); return true; }
      const tx = r.to.wx, tz = r.to.wz, d = dist(tx, tz, c.x, c.z), step = 4 * dt;
      if (d <= step) {
        c.x = tx; c.z = tz;
        c.setState('hide'); c.mem.hideFor = 4 + cs.rng.float(0, 14); c.mem.at = r.to;
        return true;
      }
      c.x += ((tx - c.x) / d) * step; c.z += ((tz - c.z) / d) * step;
      stop(c);
      if ((c.mem.clankT ?? 0) < G.time) { c.mem.clankT = G.time + 3 + cs.rng.float(0, 3); sfx(c, 'vent_clank', 0.35); }
      return true;
    }
    case 'hide': {
      stop(c);
      const at: VentSpot | undefined = c.mem.at;
      if (at) { c.x = at.wx; c.z = at.wz; }
      if (!hasVents) { netSet(c, 'duct', 0); if (c.stateT > (c.mem.hideFor ?? 6)) c.setState('wander'); return true; }
      netSet(c, 'duct', 1);
      if (c.stateT < (c.mem.hideFor ?? 6)) return true;
      if (!at || playerNear(c, at.x, at.z, 4)) { enterVent(c, null); return true; }
      // stash the hoard at the nest vent
      if ((c.mem.stolen?.length ?? 0) >= 3 && at.uid === c.mem.nest) { dropStored(c, 'stolen', at.x, at.z); netSet(c, 'carry', null); }
      c.x = at.x; c.z = at.z; faceTo(c, at.x + (at.x - at.wx), at.z + (at.z - at.wz), true);
      c.setState('emerge'); netSet(c, 'duct', 0); sfx(c, 'vent_clank', 0.9);
      return true;
    }
    case 'emerge': {
      stop(c); netSet(c, 'duct', 0);
      if (c.stateT > 0.7) { c.setState('wander'); c.goal = null; c.mem.look = null; }
      return true;
    }
    case 'wander':
    case 'idle':
    case 'investigate': {
      netSet(c, 'duct', 0);
      if (c.state !== 'investigate') {
        if ((c.mem.lookT ?? 0) < G.time) {
          c.mem.lookT = G.time + 1.2;
          const l = (c.mem.stolen?.length ?? 0) < 4 ? findLoot(c) : null;
          if (l) { c.mem.look = l; c.setState('investigate'); return true; }
        }
        if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.15)) { cs.call(c, 'idle'); c.noiseCooldown = 5; }
        if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.5)) c.goal = findSpot(c, { rMin: 2, rMax: 8, dark: 0.4 }) ?? cs.wanderSpot(c, z, 6);
        if (c.stateT > 14) {
          const v = pickVent(c, { near: true, max: 25 });
          if (v) { c.goal = { x: v.x, z: v.z }; c.mem.goVent = v; c.setState('flee'); }
          else c.stateT = 0;
        }
        return true;
      }
      const l: Loot | null = c.mem.look;
      if (!l || c.stateT > 15) { c.setState('wander'); return true; }
      if (cs.moveTo(c, z, l.x, l.z, c.sp.walk * 1.2, dt, l.kind === 'trap' ? 0.3 : 0.7)) {
        faceTo(c, l.x, l.z);
        if (l.kind === 'trap') {
          // snap
          if (l.o.state?.armed) {
            op('objState', { z: c.zoneKey, uid: l.o.uid, patch: { armed: false, bait: null } });
            sfx(c, 'wood_hit', 1); cs.call(c, 'hurt');
            cs.kill(c, z);
          } else c.setState('wander');
          return true;
        }
        let s: any = null;
        if (l.kind === 'floor') { if ([...floorItemsAround(z, l.x, l.z, 0.2)].includes(l.wi)) s = takeFloorItem(c, l.wi, 'stolen'); }
        else if (l.o.inv?.items.includes(l.it)) { s = takeObjItem(c, l.o, l.it, 'stolen'); sfx(c, 'rummage', 0.6); }
        if (s) { netSet(c, 'carry', s.key ?? null); cs.call(c, 'idle'); }
        // off to the vents with it
        const v = pickVent(c, { near: true, max: 30 });
        c.mem.goVent = v; c.goal = v ? { x: v.x, z: v.z } : null;
        c.setState('flee');
      }
      return true;
    }
    case 'flee': {
      netSet(c, 'duct', 0);
      const P = nearestPlayer(c, 12);
      if (!c.mem.goVent || (P && dist(c.mem.goVent.x, c.mem.goVent.z, P.p.x, P.p.z) < 2.5)) {
        c.mem.goVent = pickVent(c, { near: true, max: 25, awayFrom: P ? { x: P.p.x, z: P.p.z } : undefined });
        c.goal = c.mem.goVent ? { x: c.mem.goVent.x, z: c.mem.goVent.z } : (P ? cs.fleeSpot(c, z, P.p.x, P.p.z) : cs.wanderSpot(c, z, 10));
      }
      const v: VentSpot | null = c.mem.goVent;
      const g = c.goal ?? (v ? { x: v.x, z: v.z } : null);
      if (!g) { c.setState('wander'); return true; }
      if (cs.moveTo(c, z, g.x, g.z, c.sp.run, dt, 0.35)) {
        if (v) { enterVent(c, v); c.mem.goVent = null; }
        else { c.setState(hasVents ? 'wander' : 'hide'); c.mem.hideFor = 5 + cs.rng.float(0, 8); }
        return true;
      }
      // cornered: bite
      if (P && P.d < 1.0 && c.stateT > 2 && c.speed > 0 && c.attackT <= 0) attack(c, P.p);
      if (c.stateT > 12) { c.setState('wander'); c.mem.goVent = null; }
      return true;
    }
    default: {
      // first think, or a state set by the manager ('chase' after being hit, 'warn'...)
      if (c.state === 'chase' || c.state === 'warn') { c.setState('flee'); c.goal = null; return true; }
      c.setState('wander');
      return true;
    }
  }
}

onKilled('ventling', (c) => {
  // drop the haul somewhere a survivor can reach it (it may have died half inside a duct)
  const z = zoneOf(c);
  let x = c.x, zz = c.z;
  if (!walkable(z, Math.floor(x), Math.floor(zz))) {
    const at: VentSpot | undefined = c.mem.at ?? c.mem.route?.to;
    if (at) { x = at.x; zz = at.z; }
  }
  dropStored(c, 'stolen', x, zz);
  netSet(c, 'carry', null); netSet(c, 'duct', 0);
});

const sp = def({
  key: 'ventling', name: 'Ventling', code: 'E-28 // DUCT-SCAVENGER', temperament: 'skittish', threat: 1,
  hp: 14, walk: 1.7, run: 5.6, turn: 14, radius: 0.22, height: 0.35, sight: 12, fov: 1.8, hearing: 1.8, nightVision: true,
  attack: { dmg: [3, 6], range: 0.6, cooldown: 1.2, kinds: ['bite', 'scratch'], corrupt: 0.04, knock: 0.1, parts: ['hand_l', 'hand_r', 'farm_l', 'farm_r', 'shin_l', 'shin_r'] },
  zones: ['office', 'tunnels', 'mall', 'market', 'hospital'], weight: 2, group: [1, 2], maxPerZone: 4, diet: 'items',
  meat: [['meat_raw', 1]],
  flags: { vents: true, thief: true },
  sounds: { idle: 'ventling_chitter', alert: 'ventling_squeal', attack: 'ventling_squeal', hurt: 'ventling_squeal', death: 'ventling_die', step: 'pad' },
  scan: {
    cls: 'Scavenger / thief',
    notes: [
      'Pale, hairless, all eyes. Lives in the ductwork and travels vent to vent.',
      'Steals: anything small left on the floor, anything in a drawer you opened and walked away from.',
      'Cowardly. Runs for the nearest vent when approached and only bites when cornered.',
      'Cannot resist bait in a set box trap. Kill or catch it and it drops everything it carried.',
      'Missing things? Check under the vents. It keeps a hoard.',
    ],
  },
  build: buildVentling,
  animate: animateVentling,
  think: thinkVentling,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  setCarry(rig, q === 'carry' ? 'soda_can' : null);
  crawl(rig, q === 'walk' || q === 'carry', t * 6, t, q === 'flee' ? 1 : 0);
};

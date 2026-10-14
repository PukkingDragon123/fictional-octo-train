import * as THREE from 'three';
import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp } from '../../gfx/pixel';
import { G } from '../../game/G';
import { itemDef } from '../../items/item';
import type { Creature } from '../creature';
import {
  net, netOf, snd, live, playersIn, lightOn, beamOn, heldFlame, dist, hold, face, hashId, localIn, thinkOnce,
  matB, partB, fakeCreature, rng, lineOfSightB, fxPoll, fx, playAt,
} from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Lumenmoth: pale hand-sized moths shedding luminous scales. One creature is a
// small swarm (5-8 moths orbiting a shared centre). Drawn to light: zone lamps,
// fires (at a respectful distance) and above all a survivor's flashlight, whose
// battery they drain while crawling over the lens. Open flame scatters them.

addTextureModule(() => {
  const A = atlas();
  // right wing seen from above (x = away from the body, y = tail→head):
  // swept forewing + rounded hindwing, eye spot, glowing scale rim; the rest
  // of the card stays transparent (alpha-tested)
  A.add('c_lumenmoth_wing', 12, 12, (pc) => {
    pc.wrap = false;
    pc.clear();
    const R = makeRamp(0xd8e6d4, 6, { hueShift: 0.03 });
    const inWing = (x: number, y: number) => {
      const fore = y >= 5 && x <= 11 && (y - 5) >= (x * 0.45) - 1 && y <= 11 - Math.max(0, x - 8) * 0.8; // swept forewing
      const hind = Math.hypot((x - 3.5) / 3.8, (y - 3.5) / 3.6) < 1; // round hindwing
      return fore || hind;
    };
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if (!inWing(x, y)) continue;
      const v = 0.8 - Math.hypot(x, y - 6) * 0.035;
      pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(v * 5)))]);
    }
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if (!inWing(x, y)) continue;
      if (!inWing(x + 1, y) || !inWing(x, y + 1) || !inWing(x, y - 1)) pc.set(x, y, 0xeafff0); // glowing rim
    }
    pc.circle(7, 8, 1.2, 0x8aa898); pc.set(7, 8, 0x2e4038); // forewing eye spot
    pc.set(3, 3, 0x9ab8a4); pc.set(2, 9, 0xbfd8c4);
  });
  A.add('c_lumenmoth_body', 4, 8, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc4b8a0, 4);
    pc.fillRamp(R, (x, y) => 0.7 - y * 0.06 + (x === 0 ? -0.15 : 0), 0.4);
    for (let y = 2; y < 8; y += 2) pc.hline(0, 3, y, R[1]); // abdomen rings
  });
  A.add('c_lumenmoth_dust', 2, 2, (pc) => { pc.fill(0xc8ffe0); pc.set(0, 0, 0xffffff); });
});

const MOTHS = 8;
const DUST = 6;

function buildMoth(rig: Rig, i: number, parent: THREE.Object3D): THREE.Group {
  const m = new THREE.Group();
  m.name = 'moth' + i;
  parent.add(m);
  rig.parts['moth' + i] = m;
  part(rig, 'mb' + i, m, [0, 0, 0], (mb) => {
    mb.box(0, -0.012, 0, 0.022, 0.024, 0.07, 'c_lumenmoth_body', { fit: true });
    mb.box(0, -0.006, 0.042, 0.018, 0.018, 0.018, 'c_lumenmoth_body', { fit: true }); // head
    mb.box(0.012, 0.008, 0.06, 0.004, 0.004, 0.04, 'c_lumenmoth_body', { color: 0x8a8070 }); // feelers
    mb.box(-0.012, 0.008, 0.06, 0.004, 0.004, 0.04, 'c_lumenmoth_body', { color: 0x8a8070 });
  });
  // wings hinge on the body axis; shaped cards that glow faintly (dust)
  const wing = (side: number) => (mb: import('../../gfx/modelBuilder').ModelBuilder) => {
    mb.push().scale(side, 1, 1);
    mb.quadRaw([[0, 0, -0.045], [0.12, 0, -0.045], [0.12, 0, 0.075], [0, 0, 0.075]], [[0, 1], [1, 1], [1, 0], [0, 0]], 'c_lumenmoth_wing', 0xffffff, 1, 0.8);
    mb.pop();
  };
  partB(rig, 'wl' + i, m, [-0.008, 0, 0], wing(-1), matB('cardGlow'));
  partB(rig, 'wr' + i, m, [0.008, 0, 0], wing(1), matB('cardGlow'));
  return m;
}

function buildSwarm(): Rig {
  const rig = newRig(1.5);
  // the swarm hangs off the root (not the body) so it doubles as "eyes": it is
  // drawn through darkness within sight lines, like real glowing scales
  const swarm = new THREE.Group();
  swarm.name = 'swarm';
  rig.root.add(swarm);
  rig.parts.swarm = swarm;
  for (let i = 0; i < MOTHS; i++) buildMoth(rig, i, swarm);
  for (let i = 0; i < DUST; i++) partB(rig, 'dust' + i, swarm, [0, 0, 0], (mb) => { mb.box(0, 0, 0, 0.018, 0.018, 0.018, 'c_lumenmoth_dust', { fit: true, emissive: 1.2 }); }, matB('dust'));
  rig.eyes = [swarm];
  return rig;
}

interface MothState { h: number; spread: number; t: number }

function animateSwarm(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const ud = rig.root.userData as { ms?: MothState };
  const n = netOf(c);
  const s = ud.ms || (ud.ms = { h: n.h ?? 1.5, spread: 1, t: 0 });
  const seed = hashId(c.id);
  const count = 5 + Math.floor(seed * 3.99);
  // swarm centre height and tightness by behaviour
  const follow = c.state === 'follow';
  const atLamp = c.state === 'curious';
  const fleeing = c.state === 'flee';
  const targetH = c.dead ? 0 : (n.h ?? 1.5);
  s.h += (targetH - s.h) * Math.min(1, dt * 2.5);
  const targetSpread = follow ? 0.55 : atLamp ? 0.75 : fleeing ? 1.6 : 1.1;
  s.spread += (targetSpread - s.spread) * Math.min(1, dt * 2);
  const swarm = P.swarm;
  // the root is rotated by facing; orbits are computed in world-ish space by undoing it
  swarm.rotation.y = -rig.root.rotation.y;
  // local-player effect: they swarm the lens and the battery suffers
  if (!c.dead) mothLocal(c, dt);
  for (let i = 0; i < MOTHS; i++) {
    const m = P['moth' + i];
    m.visible = i < count;
    if (i >= count) continue;
    const k = (i * 7.31 + seed * 13) % 6.283;
    if (c.dead) {
      // dropped where they fell, wings flat, still faintly glowing
      m.position.set(Math.cos(k * 3) * 0.35 * (0.4 + (i % 3) * 0.3), 0.012, Math.sin(k * 3) * 0.35 * (0.4 + (i % 2) * 0.4));
      m.rotation.set(0, k, i % 3 === 0 ? Math.PI : 0);
      P['wl' + i].rotation.z = 0; P['wr' + i].rotation.z = 0;
      continue;
    }
    const speed = (fleeing ? 4.5 : 1.6 + (i % 3) * 0.45) * (i % 2 ? 1 : -1);
    const r = (0.18 + ((i * 37) % 10) / 22) * s.spread;
    const a = t * speed + k;
    // erratic lissajous loops: moths never fly in circles
    const x = Math.cos(a) * r + Math.sin(t * 3.1 + i) * 0.06;
    const z = Math.sin(a * 1.3) * r + Math.cos(t * 2.3 + i * 2) * 0.06;
    const y = s.h + Math.sin(t * 2.2 + i * 1.7) * 0.18 * s.spread + Math.sin(t * 9 + i) * 0.03;
    m.position.set(x, y, z);
    // head along the direction of travel
    const vx = -Math.sin(a) * speed, vz = Math.cos(a * 1.3) * 1.3 * speed;
    m.rotation.set(Math.sin(t * 5 + i) * 0.3, Math.atan2(vx, vz), Math.sin(t * 7 + i) * 0.25);
    const flap = Math.sin(t * (26 + (i % 4) * 3) + i) * 0.9 + 0.2;
    P['wl' + i].rotation.z = -flap;
    P['wr' + i].rotation.z = flap;
  }
  // glowing scales drifting down through the air
  for (let i = 0; i < DUST; i++) {
    const d = P['dust' + i];
    d.visible = !c.dead;
    if (c.dead) continue;
    const life = (t * 0.45 + i / DUST) % 1;
    const a = i * 2.4 + seed * 6;
    d.position.set(Math.cos(a) * 0.3 * s.spread + Math.sin(t + i) * 0.05, s.h - life * Math.max(0.4, s.h * 0.9), Math.sin(a) * 0.3 * s.spread);
    d.scale.setScalar(1 - life * 0.7);
  }
  // a faint cold glow around the swarm in darkness
  if (live() && !c.dead && swarm.visible && G.view?.zone?.key === c.zoneKey && G.lightLevelAt(c.x, c.z) < 0.45) G.pointLight(c.x, c.y + s.h, c.z, 0xbfffd8, follow ? 0.35 : 0.22, 2.6);
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, 0.9);
  void dt;
}

/** the local survivor with a swarm on their flashlight */
function mothLocal(c: Creature, dt: number) {
  const p = localIn(c);
  const n = netOf(c);
  if (!p || c.state !== 'follow' || n.t !== p.id) return;
  if (Math.hypot(p.x - c.x, p.z - c.z) > 2.6 || !p.flashlightOn || !p.lightItem) return;
  const d = itemDef(p.lightItem.key);
  if (!d?.battery) return;
  // roughly triples the normal drain per swarm (normal ≈ 0.0004/s)
  p.lightItem.uses = Math.max(0, (p.lightItem.uses ?? 1) - dt * 0.0009);
  if (p.lightItem.uses <= 0) { p.flashlightOn = false; thinkOnce(p, 'moth_dead_batt', 'The batteries are dead. The moths drift off, disappointed.', 5); return; }
  thinkOnce(p, 'moth_lens', ['Moths all over the lens. The beam is getting weaker.', 'They keep landing on the flashlight. It flickers when they do.', 'Glowing dust everywhere. They want the light.'][Math.floor(Math.random() * 3)], 120);
}

// ---------------------------------------------------------------- brain (host)
function nearestLamp(c: Creature): { x: number; z: number; y: number } | null {
  const z = G.getZone(c.zoneKey);
  let best: { x: number; z: number; y: number } | null = null, bd = 12;
  for (const l of z.lights) {
    if (l.kind === 'sky') continue;
    const d = Math.hypot(l.x - c.x, l.z - c.z);
    if (d >= bd || !lightOn(z, l)) continue;
    if (!lineOfSightB(z, c.x, c.z, l.x, l.z)) continue;
    bd = d; best = { x: l.x, z: l.z, y: l.y };
  }
  return best;
}
function nearestFire(c: Creature, r: number): { x: number; z: number } | null {
  const z = G.getZone(c.zoneKey);
  const fires = (z.meta.fires || {}) as Record<string, any>;
  let best: { x: number; z: number } | null = null, bd = r;
  for (const k of Object.keys(fires)) {
    const [fx, fy] = k.split(',').map(Number);
    const d = Math.hypot(fx + 0.5 - c.x, fy + 0.5 - c.z);
    if (d < bd) { bd = d; best = { x: fx + 0.5, z: fy + 0.5 }; }
  }
  if (!best && (G.items?.fireNear?.(c.x, c.z, r, c.zoneKey) ?? 0) > 0) {
    // campfire / stove objects: find the tile
    const R = Math.ceil(r);
    for (let y = Math.floor(c.z) - R; y <= Math.floor(c.z) + R; y++) for (let x = Math.floor(c.x) - R; x <= Math.floor(c.x) + R; x++) {
      if ((G.items?.fireNear?.(x + 0.5, y + 0.5, 0.8, c.zoneKey) ?? 0) > 0) return { x: x + 0.5, z: y + 0.5 };
    }
  }
  return best;
}

function thinkSwarm(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  m.tt = (m.tt ?? 0) - dt;
  if (c.state === 'flee') {
    n.h = 2.2;
    if (!c.goal || G.creatures.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 1) || c.stateT > 5) { c.setState('wander'); c.goal = null; }
    return true;
  }
  if (m.tt <= 0) {
    m.tt = 0.4 + rng.next() * 0.2;
    // open flame nearby (held torch, fire tile): scatter
    const flame = playersIn(c.zoneKey).find((p) => heldFlame(p) && dist(p, c) < 3.2);
    const fire = nearestFire(c, 9);
    if (flame || (fire && dist(fire, c) < 2.2)) {
      const from = flame || fire!;
      c.setState('flee'); c.goal = G.creatures.fleeSpot(c, z, from.x, from.z);
      fx(c, 'lumen_puff');
      return true;
    }
    // a survivor's beam (or held lantern) within sight
    let tgt = null as null | { id: string; d: number };
    for (const p of playersIn(c.zoneKey)) {
      if (!p.flashlightOn || heldFlame(p)) continue;
      const d = dist(p, c);
      if (d > 18 || (tgt && d > tgt.d)) continue;
      if (d > 2 && !lineOfSightB(z, c.x, c.z, p.x, p.z)) continue;
      tgt = { id: p.id, d };
    }
    if (tgt) { if (c.state !== 'follow') c.setState('follow'); n.t = tgt.id; m.lamp = null; m.fire = null; }
    else {
      n.t = null;
      const lamp = nearestLamp(c);
      if (lamp) { m.lamp = lamp; m.fire = null; if (c.state !== 'curious') c.setState('curious'); }
      else if (fire) { m.fire = fire; m.lamp = null; if (c.state !== 'curious') c.setState('curious'); }
      else { m.lamp = null; m.fire = null; if (c.state === 'curious' || c.state === 'follow') c.setState('wander'); }
    }
  }
  if (c.state === 'follow') {
    const p = G.players.get(n.t);
    if (!p || p.zoneKey !== c.zoneKey) { c.setState('wander'); return true; }
    // the lens: a little ahead of the survivor at hand height
    const lx = p.x + Math.cos(p.facing) * 0.55, lz = p.z + Math.sin(p.facing) * 0.55;
    n.h = 1.25;
    const d = Math.hypot(lx - c.x, lz - c.z);
    if (d > 0.35) G.creatures.moveTo(c, z, lx, lz, d > 3 ? c.sp.run : Math.max(0.8, d * 2.2), dt, 0.2);
    else hold(c);
    return true;
  }
  if (c.state === 'curious') {
    const L = m.lamp || m.fire;
    if (!L) { c.setState('wander'); return true; }
    n.h = m.lamp ? Math.min(2.45, (m.lamp.y ?? 2.6) - 0.25) : 1.4;
    // lamps: hug the fixture; fires: circle at a respectful distance
    const orbit = m.lamp ? 0 : 3.2;
    const a = G.time * 0.4 + hashId(c.id) * 6;
    const gx = L.x + Math.cos(a) * orbit, gz = L.z + Math.sin(a) * orbit;
    if (G.creatures.moveTo(c, z, gx, gz, c.sp.walk, dt, 0.4)) face(c, L.x, L.z);
    return true;
  }
  // drifting
  n.h = 1.6;
  if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = G.creatures.wanderSpot(c, z, 8); }
  if (G.creatures.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.walk * 0.6, dt, 0.6) || c.stateT > 14) c.goal = G.creatures.wanderSpot(c, z, 8);
  return true;
}

const S = def({
  key: 'lumenmoth', name: 'Lumenmoth', code: 'E-21 // LEPIDOPTERA-LUX', temperament: 'peaceful', threat: 0,
  hp: 5, walk: 0.9, run: 3.4, turn: 6, radius: 0.22, height: 0.4, sight: 18, fov: 3.1, hearing: 0.6,
  light: 'attracted', diet: 'light',
  zones: ['lobby', 'pools', 'mall', 'office', 'house', 'suburbs', 'fields'], weight: 2, group: [1, 2], maxPerZone: 5,
  flags: { flying: true },
  sounds: snd({ loop: 'moth_flutter', hurt: 'lumen_puff', death: 'lumen_puff' }),
  scan: {
    cls: 'Phototropic swarm / harmless',
    notes: [
      'Pale moths the size of a hand. The scales they shed glow for days: glow dust.',
      'Drawn to any light. They will find your flashlight and crawl over the lens, draining the battery fast. Switch it off to lose them.',
      'Open flame scatters them. They circle campfires, never too close.',
      'Swat the swarm to collect the dust. It does not fight back.',
    ],
  },
  build: buildSwarm,
  animate: animateSwarm,
  think: thinkSwarm,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const c = fakeCreature(S, { id: 'g1', state: 'curious', mem: { netMem: { h: 0.9 } } });
  animateSwarm(rig, c, t, 1 / 60);
};

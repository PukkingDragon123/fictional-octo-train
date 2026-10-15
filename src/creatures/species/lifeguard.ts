import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, fx, fxPoll, playAt, live, seenByAny, localIn, thinkOnce, partB, matB } from '../behaviors_b';
import { part } from '../species';
import '../../audio/sounds_creatures_b';

// The Lifeguard: lives in the deep end of the Poolrooms and never leaves the
// water. From above it is only a shadow under the surface and a faded red
// rescue float drifting where no current should take it. The moment anyone
// swims into deep water it blows a whistle. Then it comes, faster than anyone
// can swim, takes hold and pulls them under. It lets go when struck, or when
// its victim reaches shallow water or the edge.

addTextureModule(() => {
  const A = atlas();
  // a person-shaped shadow seen from above, arms spread, soft dithered edge
  A.add('c_lifeguard_shadow', 32, 32, (pc) => {
    pc.wrap = false;
    pc.clear();
    const inBody = (x: number, y: number) => {
      const head = Math.hypot((x - 15.5) / 3.2, (y - 5) / 3.6) < 1;
      const torso = Math.abs(x - 15.5) < 4.2 - Math.max(0, y - 16) * 0.12 && y > 7 && y < 21;
      const arms = Math.abs(y - 10 - Math.abs(x - 15.5) * 0.18) < 1.6 && Math.abs(x - 15.5) < 14.5;
      const legs = y >= 20 && y < 31 && (Math.abs(x - 13 + (y - 20) * 0.15) < 1.8 || Math.abs(x - 18 - (y - 20) * 0.15) < 1.8);
      return head || torso || arms || legs;
    };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (!inBody(x, y)) continue;
      const edge = !inBody(x + 1, y) || !inBody(x - 1, y) || !inBody(x, y + 1) || !inBody(x, y - 1);
      if (edge && ((x + y) & 1)) continue; // dithered rim
      pc.set(x, y, edge ? 0x0e2a3a : 0x061620);
    }
  });
  A.add('c_lifeguard_float', 16, 8, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc8402e, 5, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.6 - Math.abs(y - 3.5) * 0.08 + (ph(x, y, 2) - 0.5) * 0.12, 0.5);
    // faded white lettering, mostly gone
    for (const x of [3, 4, 6, 8, 9, 11, 12]) pc.set(x, 3, 0xe8d8d0);
    pc.set(3, 4, 0xe8d8d0); pc.set(6, 4, 0xe8d8d0); pc.set(11, 4, 0xe8d8d0);
    pc.hline(0, 15, 0, R[1]); pc.hline(0, 15, 7, R[0]);
  });
  A.add('c_lifeguard_skin', 16, 16, (pc) => {
    const R = makeRamp(0xa8b4b8, 6, { hueShift: -0.03 });
    pc.fillRamp(R, (x, y) => 0.6 + (ph(x >> 1, y >> 1, 6) - 0.5) * 0.18, 0.6);
    for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) if ((x + y) % 6 === 0) pc.set(x, y, R[2]); // pruned, waterlogged
  });
  A.add('c_lifeguard_face', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xb0bcc0, 6, { hueShift: -0.03 });
    pc.fillRamp(R, (x, y) => 0.62 - y * 0.012, 0.5);
    pc.rect(0, 0, 16, 5, 0xa8342a); pc.hline(0, 15, 5, 0x7a2018); // swim cap
    pc.rect(3, 7, 3, 3, 0x0a0e10); pc.rect(10, 7, 3, 3, 0x0a0e10); // empty goggles-shaped eyes
    pc.hline(6, 9, 8, 0x3a3e40);
    pc.rect(5, 12, 6, 3, 0x14181a); // mouth, open
    pc.set(7, 14, 0xd8d0b8); // the whistle, between its teeth
  });
  A.add('c_lifeguard_ripple', 16, 16, (pc) => {
    pc.wrap = false;
    pc.clear();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.2 && d < 7.6 && ((x * 3 + y) % 4)) pc.set(x, y, 0xcfeef6);
    }
  });
});

const S0 = 0.6; // water surface above the root (the manager sinks swimmers 0.6 m)

function buildLifeguard(): Rig {
  const rig = newRig(S0 + 0.4);
  // everything hangs off `main` on the root, so the engine's dead-pose tilt of
  // rig.body does not stand the surface shadow on its edge
  const main = new THREE.Group();
  main.name = 'main';
  rig.root.add(main);
  rig.parts.main = main;
  partB(rig, 'shadow', main, [0, S0 + 0.012, 0], (mb) => { mb.flat(0, 0, 0, 1.6, 1.6, 'c_lifeguard_shadow'); }, matB('shadow'));
  part(rig, 'float', main, [0.25, S0, 0.7], (mb) => {
    mb.cylinderX(0, 0.04, 0, 0.065, 0.62, 6, 'c_lifeguard_float', { fit: true });
    mb.box(-0.36, 0.035, 0, 0.12, 0.012, 0.012, 'c_lifeguard_float', { color: 0xd8d0c0 }); // frayed strap
  });
  for (let i = 0; i < 3; i++) partB(rig, 'ripple' + i, main, [0, S0 + 0.02, 0], (mb) => { mb.flat(0, 0, 0, 1, 1, 'c_lifeguard_ripple'); }, matB('dust'));
  // the body: below the surface (hidden by the water floor) until it reaches up
  const body = part(rig, 'bodyG', main, [0, S0 - 1.2, 0], (mb) => {
    mb.box(0, -0.5, 0, 0.34, 0.6, 0.2, 'c_lifeguard_skin');
  });
  part(rig, 'head', body, [0, 0.1, 0.02], (mb) => {
    mb.box(0, 0, 0, 0.22, 0.27, 0.22, { south: 'c_lifeguard_face', all: 'c_lifeguard_skin', top: 'c_lifeguard_face' }, { fit: { south: true } });
    mb.box(0, 0.2, 0, 0.23, 0.08, 0.23, 'c_lifeguard_skin', { color: 0xb8443a }); // cap
  });
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    const ua = part(rig, 'arm' + side, body, [0.19 * s, 0.0, 0], (mb) => { mb.box(0, 0, 0, 0.065, 0.62, 0.065, 'c_lifeguard_skin'); });
    part(rig, 'fore' + side, ua, [0, 0.6, 0], (mb) => {
      mb.box(0, 0, 0, 0.055, 0.6, 0.055, 'c_lifeguard_skin');
      for (let f = 0; f < 4; f++) mb.box(-0.022 + f * 0.015, 0.58, 0, 0.012, 0.16, 0.012, 'c_lifeguard_skin'); // long white fingers
    });
  }
  return rig;
}

function animateLifeguard(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { rise?: number; fade?: number };
  const seed = hashId(c.id);
  const grabbing = !!n.g && !c.dead;
  const reaching = c.attackPhase > 0 || grabbing;
  const riseT = c.dead ? 0.55 : reaching ? 1 : c.state === 'watch' ? 0.35 : 0;
  ud.rise = (ud.rise ?? 0) + (riseT - (ud.rise ?? 0)) * Math.min(1, dt * (reaching ? 6 : 2));
  const rise = ud.rise;
  // body: comes up through the surface; head breaks it, arms reach up and in
  P.bodyG.position.y = S0 - 1.2 + rise * 1.05;
  P.bodyG.rotation.x = c.dead ? -1.45 : reaching ? -0.35 : 0;
  for (const [i, side] of [[0, 'L'], [1, 'R']] as const) {
    const claw = Math.sin(t * 9 + i * 2) * 0.25;
    P['arm' + side].rotation.set(reaching ? 0.55 + claw : 0, 0, (i ? 1 : -1) * (reaching ? 0.3 : 1.35));
    P['fore' + side].rotation.x = reaching ? 0.85 + claw : 0.1;
  }
  P.head.rotation.set(c.dead ? 0 : Math.sin(t * 0.7) * 0.1, Math.sin(t * 0.4 + seed * 6) * (c.state === 'watch' ? 0.6 : 0.2), 0);
  // shadow: stretched when it is swimming fast, faded when dead
  const fast = c.speed > 1.6;
  ud.fade = (ud.fade ?? 1) + ((c.dead ? 0 : 1) - (ud.fade ?? 1)) * Math.min(1, dt * 0.5);
  P.shadow.scale.set((fast ? 0.85 : 1) * ud.fade + 0.001, 1, (fast ? 1.35 : 1) * ud.fade + 0.001);
  P.shadow.rotation.y = Math.sin(t * 0.5 + seed * 3) * 0.08;
  P.shadow.position.y = S0 + 0.012 + Math.sin(t * 1.1) * 0.003;
  // the float: bobbing, turning slowly, dragged along when it moves
  P.float.position.set(0.25 + Math.sin(t * 0.37 + seed * 5) * 0.15, S0 + Math.sin(t * 1.9 + seed) * 0.018, (fast ? 1.0 : 0.7) + Math.cos(t * 0.31) * 0.12);
  P.float.rotation.y = t * 0.12 + seed * 6;
  P.float.rotation.z = Math.sin(t * 1.7) * 0.06;
  // ripples: rings spreading while it moves fast or thrashes
  for (let i = 0; i < 3; i++) {
    const r = P['ripple' + i];
    const active = (fast || reaching) && !c.dead;
    const life = (t * (reaching ? 1.4 : 0.9) + i / 3) % 1;
    r.visible = active;
    r.scale.setScalar(0.4 + life * (reaching ? 2.2 : 1.5));
    r.position.set(0, S0 + 0.02, fast && !reaching ? -0.6 - life * 0.6 : 0);
  }
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 1, e.a.r);
  // held under: the local survivor is dragged and drowns while it holds on
  const p = localIn(c);
  if (p && grabbing && n.g === p.id && live()) {
    const k = Math.min(1, dt * 2.5);
    p.x += (c.x - p.x) * k; p.z += (c.z - p.z) * k;
    p.vx *= 0.6; p.vz *= 0.6;
    const b = p.body as any;
    b.health = Math.max(0, b.health - dt * 3.2);
    b.panic = Math.min(100, b.panic + dt * 28);
    if (typeof b.endurance === 'number') b.endurance = Math.max(0, b.endurance - dt * 0.09);
    if (typeof b.wetness === 'number') b.wetness = 100;
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.3 + Math.sin(t * 6) * 0.1);
    G.pr.fx.blink = Math.max(G.pr.fx.blink, 0.25 + Math.max(0, Math.sin(t * 2.3)) * 0.35);
    thinkOnce(p, 'lifeguard_grab', ['It has my legs. It is pulling me under.', 'Get to the edge! Hit it!', 'Water. In my mouth. Can\'t—'][Math.floor(t * 3) % 3], 20);
  }
}

// ---------------------------------------------------------------- pools (deep-water bodies) per zone
const POOLS = new Map<string, { id: Int32Array; tiles: [number, number][][] }>();
function pools(z: Zone) {
  let P = POOLS.get(z.key);
  if (P && P.id.length === z.W * z.H) return P;
  const id = new Int32Array(z.W * z.H).fill(-1);
  const tiles: [number, number][][] = [];
  for (let y = 0; y < z.H; y++) for (let x = 0; x < z.W; x++) {
    const i = z.idx(x, y);
    if (id[i] >= 0 || z.floorAt(x, y)?.water !== 'deep') continue;
    const k = tiles.length, list: [number, number][] = [];
    const st: [number, number][] = [[x, y]]; id[i] = k;
    while (st.length) {
      const [cx, cy] = st.pop()!;
      list.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!z.inb(nx, ny)) continue;
        const j = z.idx(nx, ny);
        if (id[j] >= 0 || z.floorAt(nx, ny)?.water !== 'deep') continue;
        id[j] = k; st.push([nx, ny]);
      }
    }
    tiles.push(list);
  }
  P = { id, tiles };
  POOLS.set(z.key, P);
  return P;
}
const poolAt = (z: Zone, x: number, y: number) => (z.inb(Math.floor(x), Math.floor(y)) ? pools(z).id[z.idx(Math.floor(x), Math.floor(y))] : -1);

// ---------------------------------------------------------------- brain (host)
function thinkLifeguard(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  const cs = G.creatures;
  m.persistent = true;
  const myPool = poolAt(z, c.x, c.z);
  // stranded (pushed out of the water somehow): slip back into the nearest deep tile
  if (myPool < 0) {
    const P = pools(z);
    let best: [number, number] | null = null, bd = 1e9;
    for (const list of P.tiles) for (const [x, y] of list) { const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.z); if (d < bd) { bd = d; best = [x, y]; } }
    if (best) { c.x = best[0] + 0.5; c.z = best[1] + 0.5; } else cs.remove(c);
    return true;
  }
  // damage taken? let go and dive away
  if (m.hp !== undefined && c.hp < m.hp) { release(c, n); c.setState('flee'); c.goal = cs.wanderSpot(c, z, 8); }
  m.hp = c.hp;
  // whistle at anyone entering deep water nearby
  const swimmers: Player[] = [];
  m.wet = m.wet || {};
  for (const p of playersIn(c.zoneKey)) {
    const inDeep = poolAt(z, p.x, p.z) >= 0;
    const mine = poolAt(z, p.x, p.z) === myPool;
    if (inDeep && !m.wet[p.id] && dist(p, c) < 40 && (m.whistleT ?? 0) < G.time) { m.whistleT = G.time + 12; fx(c, 'lifeguard_whistle', { r: 60 }); }
    m.wet[p.id] = inDeep;
    if (mine) swimmers.push(p);
  }
  // pending grab resolves after the reach
  if (m.grabPending && c.attackPhase <= 0) {
    const p = G.players.get(m.grabPending);
    m.grabPending = null;
    if (p && dist(p, c) < 1.8 && poolAt(z, p.x, p.z) === myPool) { m.grab = p.id; m.grabEnd = G.time + rng.float(2.0, 2.8); n.g = p.id; fx(c, 'lifeguard_splash', { r: 30 }); }
  }
  if (m.grab) {
    const p = G.players.get(m.grab);
    if (!p || p.body.dead || G.time > m.grabEnd || poolAt(z, p.x, p.z) !== myPool) { release(c, n); c.setState('flee'); c.goal = cs.wanderSpot(c, z, 6); return true; }
    c.setState('attack');
    hold(c);
    c.x += (p.x - c.x) * Math.min(1, dt * 5); c.z += (p.z - c.z) * Math.min(1, dt * 5);
    face(c, p.x, p.z);
    return true;
  }
  if (c.state === 'flee') {
    if (!c.goal || moveInWater(c, z, c.goal.x, c.goal.z, c.sp.walk * 1.5, dt, myPool) || c.stateT > 4) c.setState('wander');
    return true;
  }
  // hunt the nearest swimmer in its pool
  let tgt: Player | null = null, td = 1e9;
  for (const p of swimmers) { const d = dist(p, c); if (d < td) { td = d; tgt = p; } }
  if (tgt) {
    c.setState('chase');
    c.targetId = tgt.id;
    const reach = c.sp.attack!.range + tgt.radius;
    if (td <= reach && c.attackT <= 0) { cs.startAttack(c, tgt); m.grabPending = tgt.id; return true; }
    moveInWater(c, z, tgt.x, tgt.z, td > 6 ? c.sp.run : c.sp.run * 0.8, dt, myPool, reach * 0.6);
    return true;
  }
  // someone at the edge, out of reach: it waits for them, just under the surface
  const near = playersIn(c.zoneKey).filter((p) => dist(p, c) < 9).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (near) {
    c.setState('watch');
    const P = pools(z).tiles[myPool];
    let best: [number, number] | null = null, bd = 1e9;
    for (const [x, y] of P) { const d = Math.hypot(x + 0.5 - near.x, y + 0.5 - near.z); if (d < bd) { bd = d; best = [x, y]; } }
    if (best && moveInWater(c, z, best[0] + 0.5, best[1] + 0.5, c.sp.walk, dt, myPool, 0.4)) face(c, near.x, near.z);
    return true;
  }
  // drifting along the bottom
  if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 8); }
  if (moveInWater(c, z, c.goal!.x, c.goal!.z, c.sp.walk * 0.6, dt, myPool, 0.6) || c.stateT > 18) c.goal = cs.wanderSpot(c, z, 8);
  m.bubT = (m.bubT ?? rng.float(4, 10)) - dt;
  if (m.bubT <= 0) { m.bubT = rng.float(8, 16); fx(c, 'lifeguard_bubbles', { v: 0.7, r: 16 }); }
  return true;
}
function release(c: Creature, n: Record<string, any>) { c.mem.grab = null; c.mem.grabPending = null; n.g = null; }
/** moveTo, but it never lets itself leave its pool */
function moveInWater(c: Creature, z: Zone, gx: number, gz: number, speed: number, dt: number, pool: number, stop = 0.5): boolean {
  const done = G.creatures.moveTo(c, z, gx, gz, speed, dt, stop);
  const nx = c.x + c.vx * Math.max(dt, 0.12), nz = c.z + c.vz * Math.max(dt, 0.12);
  if (poolAt(z, nx, nz) !== pool) {
    // slide along the edge instead of climbing out
    if (poolAt(z, nx, c.z) === pool) c.vz = 0;
    else if (poolAt(z, c.x, nz) === pool) c.vx = 0;
    else { c.vx = 0; c.vz = 0; c.speed = 0; return true; }
  }
  return done;
}

const S = def({
  key: 'lifeguard', name: 'The Lifeguard', code: 'E-14 // NATATOR', temperament: 'ambush', threat: 4,
  hp: 70, walk: 1.0, run: 3.0, turn: 6, radius: 0.45, height: 1.2, sight: 22, fov: 3.1, hearing: 2.0, nightVision: true,
  attack: { dmg: [5, 9], range: 0.9, cooldown: 3.2, kinds: ['bruise', 'scratch'], corrupt: 0.05, knock: 0, grab: true, parts: ['shin_l', 'shin_r', 'foot_l', 'foot_r', 'thigh_l', 'thigh_r'] },
  zones: ['pools'], weight: 2, maxPerZone: 3, diet: 'meat',
  flags: { swimmer: true },
  sounds: snd({ attack: 'lifeguard_splash', hurt: 'lifeguard_splash', death: 'lifeguard_sink' }),
  scan: {
    cls: 'Aquatic ambusher / deep water only',
    notes: [
      'A shadow under the deep end and a red float that drifts against the current. It cannot leave deep water.',
      'It blows a whistle when someone enters deep water. That is your warning: get out.',
      'Swims faster than you, grabs your legs and pulls you under. Strike it to make it let go; shallow water and the edge are safe.',
      'Throw something noisy in to draw it away, or cross where the water is shallow.',
    ],
  },
  gore: { blood: 'pale', sever: ['armL', 'armR', 'foreL', 'foreR'], head: 'head' },
  build: buildLifeguard,
  animate: animateLifeguard,
  think: thinkLifeguard,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  // gallery shows it surfacing (in game it is only a shadow until it reaches for someone)
  const c = fakeCreature(S, { id: 'g6', state: 'attack', speed: 0, mem: { netMem: { g: 'x' } } });
  animateLifeguard(rig, c, t, 1 / 60);
};

// ---------------------------------------------------------------- spawning
// The engine's spawn search (Zone.randomFloor) skips deep-water tiles, so
// swimmers can never be placed by the manager. Until that changes, keep each
// zone that lists 'lifeguard' in its spawn table stocked from here (host only).
const nextTry = new Map<string, number>();
function stockLifeguards() {
  if (!live() || !G.creatures || G.role === 'client' || G.paused) return;
  const zones = new Set<string>();
  for (const p of G.players.values()) zones.add(p.zoneKey);
  for (const zk of zones) {
    const z = G.zones.get(zk);
    if (!z) continue;
    const w = z.spawnTable.find(([k]) => k === 'lifeguard')?.[1] ?? 0;
    if (w <= 0 || (G.sandbox.creatures ?? 1) <= 0) continue;
    let have = 0;
    for (const o of G.creatures.creatures.values() as Iterable<Creature>) if (o.zoneKey === zk && o.sp.key === 'lifeguard' && !o.dead) have++;
    const want = Math.min(S.maxPerZone ?? 3, Math.max(1, Math.round(w * 0.75 * G.sandbox.creatures)));
    if (have >= want || (nextTry.get(zk) ?? 0) > G.time) continue;
    nextTry.set(zk, G.time + (have === 0 ? 4 : 90));
    const P = pools(z);
    const big = P.tiles.filter((l) => l.length >= 10);
    if (!big.length) continue;
    for (let t = 0; t < 30; t++) {
      const pool = rng.pick(big);
      const [x, y] = rng.pick(pool);
      const px = x + 0.5, pz = y + 0.5;
      if (playersIn(zk).some((p) => Math.hypot(p.x - px, p.z - pz) < 16)) continue;
      if (seenByAny(z, px, pz, 40)) continue;
      G.creatures.spawn('lifeguard', zk, px, pz);
      break;
    }
  }
}
if (typeof window !== 'undefined') setInterval(() => { try { stockLifeguards(); } catch (e) { console.warn('lifeguard stock', e); } }, 3000);

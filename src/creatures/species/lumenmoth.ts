import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ph } from '../../gfx/pixel';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { Page, Reg, OB, V3, registerPage, cachedGeo, beastMaterial, ramp, fillLv } from '../kit/beasts';
import { G } from '../../game/G';
import { itemDef } from '../../items/item';
import type { Creature } from '../creature';
import {
  net, netOf, snd, live, playersIn, lightOn, beamOn, heldFlame, dist, hold, face, hashId, localIn, thinkOnce,
  matB, fakeCreature, rng, lineOfSightB, fxPoll, fx, playAt,
} from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Lumenmoth: pale hand-sized moths shedding luminous scales. One creature is a
// small swarm (5-8 moths orbiting a shared centre). Drawn to light: zone lamps,
// fires (at a respectful distance) and above all a survivor's flashlight, whose
// battery they drain while crawling over the lens. Open flame scatters them.

// Model: each moth is one small merged mesh (furred thorax and tapering
// abdomen, feathered antennae, swept forewings and rounded hindwings painted
// with soft eye spots, veins and a glowing scale rim), flapped by flipbook:
// a handful of pre-built wing positions swapped per frame, so a whole swarm
// costs a few draw calls. Falling glow dust is a single dynamic mesh.
addTextureModule(() => {
  atlas().add('c_lumenmoth_dust', 2, 2, (pc) => { pc.fill(0xc8ffe0); pc.set(0, 0, 0xffffff); });
});
const PG = registerPage(new Page('c_mothpg', 64, 64, [['FORE', 30, 18], ['HIND', 22, 16], ['BODY', 12, 18], ['ANT', 10, 10]], 2));

const MOTHS = 8;
const DUST = 6;
/** flipbook wing angles (rad, up positive) and the play order (ping-pong) */
const FLAPS = [1.0, 0.5, 0.0, -0.45];
const ORDER = [0, 1, 2, 3, 2, 1];

function mothGeo(ob: OB, wing: number) {
  const P = PG;
  // body: furred thorax, ringed abdomen, a small head
  ob.tube([[0, 0, 0.034], [0, 0.002, 0.022], [0, 0.002, 0.008], [0, 0, -0.008], [0, -0.002, -0.026], [0, -0.004, -0.04]],
    [[0.008, 0.009], [0.012, 0.012], [0.012, 0.011], [0.01, 0.009], [0.008, 0.007], [0.003, 0.003]], 7, P.reg('BODY'), { up: [0, 1, 0], start: 'pole', end: 'pole', emis: 0.25 });
  // feathered antennae sweeping forward and out
  for (const s of [1, -1]) {
    ob.push().translate(s * 0.004, 0.006, 0.033).rotY(s * 0.45).rotX(-0.5);
    ob.quad([[-0.006, 0, 0], [0.006, 0, 0], [0.006, 0, 0.032], [-0.006, 0, 0.032]], P.reg('ANT'), [[0, 0], [1, 0], [1, 1], [0, 1]], { double: true, emis: 0.4 });
    ob.pop();
  }
  // wings hinge along the body axis: forewing swept forward-out, hindwing rounded behind
  for (const s of [1, -1]) {
    ob.push().rotZ(s * wing).translate(s * 0.006, 0.003, 0);
    const F = P.reg('FORE'), H = P.reg('HIND');
    // forewing: u = root (0) -> tip (1), v = trailing (0) -> leading (1)
    const fw = (u: number, v: number): V3 => [s * u * 0.078, Math.sin(u * Math.PI) * 0.004, -0.012 + v * 0.042 + u * 0.012 - (1 - v) * u * 0.02];
    for (let c = 0; c < 3; c++) {
      const u0 = c / 3, u1 = (c + 1) / 3;
      ob.quad([fw(u0, 0), fw(u1, 0), fw(u1, 1), fw(u0, 1)], F, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], { double: true, emis: 0.3 });
    }
    const hw = (u: number, v: number): V3 => [s * u * 0.058, -0.001 + Math.sin(u * Math.PI) * 0.003, -0.044 + v * 0.04 + u * 0.006];
    for (let c = 0; c < 2; c++) {
      const u0 = c / 2, u1 = (c + 1) / 2;
      ob.quad([hw(u0, 0), hw(u1, 0), hw(u1, 1), hw(u0, 1)], H, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], { double: true, emis: 0.28 });
    }
    ob.pop();
  }
}
const FRAME_GEO: THREE.BufferGeometry[] = [];
function frames(): THREE.BufferGeometry[] {
  if (!FRAME_GEO.length) {
    for (let i = 0; i < FLAPS.length; i++) FRAME_GEO.push(cachedGeo('c_mothpg:f' + i, PG, (ob) => mothGeo(ob, FLAPS[i])));
    FRAME_GEO.push(cachedGeo('c_mothpg:flat', PG, (ob) => mothGeo(ob, -0.05)));
  }
  return FRAME_GEO;
}

function buildMoth(rig: Rig, i: number, parent: THREE.Object3D): THREE.Group {
  const m = new THREE.Group();
  m.name = 'moth' + i;
  m.scale.setScalar(1.3); // hand-sized: readable as specks of light from the iso camera
  const mesh = new THREE.Mesh(frames()[2], beastMaterial());
  mesh.castShadow = false;
  mesh.userData.gk = 'c_mothpg:f2'; mesh.userData.page = PG.key;
  m.add(mesh);
  parent.add(m);
  rig.parts['moth' + i] = m;
  return m;
}

/** one dynamic mesh holding every glowing scale drifting down from the swarm */
function dustMesh(): THREE.Mesh {
  const mb = new ModelBuilder();
  for (let i = 0; i < DUST; i++) mb.box(0, -0.009, 0, 0.018, 0.018, 0.018, 'c_lumenmoth_dust', { fit: true, emissive: 1.2 });
  const g = mb.build();
  g.userData.base = Float32Array.from(g.getAttribute('position').array as ArrayLike<number>);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  const mesh = new THREE.Mesh(g, matB('dust'));
  mesh.frustumCulled = false;
  return mesh;
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
  const dust = new THREE.Group(); dust.name = 'dust';
  const dm = dustMesh(); dust.add(dm);
  swarm.add(dust);
  rig.parts.dust = dust;
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
  if (rig.root.userData.lookId !== c.id) {
    // individual swarms: one of the colour variants
    const k = Math.floor(seed * 7) % PG.variants;
    rig.root.userData.lookId = c.id;
    for (let i = 0; i < MOTHS; i++) P['moth' + i].userData.variant = k;
  }
  const follow = c.state === 'follow';
  const atLamp = c.state === 'curious';
  const fleeing = c.state === 'flee';
  const targetH = c.dead ? 0 : (n.h ?? 1.5);
  s.h += (targetH - s.h) * Math.min(1, dt * 2.5);
  const targetSpread = follow ? 0.55 : atLamp ? 0.75 : fleeing ? 1.6 : 1.1;
  s.spread += (targetSpread - s.spread) * Math.min(1, dt * 2);
  const swarm = P.swarm;
  swarm.rotation.y = -rig.root.rotation.y;
  if (!c.dead) mothLocal(c, dt);
  const F = frames();
  for (let i = 0; i < MOTHS; i++) {
    const m = P['moth' + i];
    m.visible = i < count;
    if (i >= count) continue;
    const mesh = m.children[0] as THREE.Mesh;
    const k = (i * 7.31 + seed * 13) % 6.283;
    if (c.dead) {
      // dropped where they fell, wings flat, still faintly glowing
      m.position.set(Math.cos(k * 3) * 0.35 * (0.4 + (i % 3) * 0.3), 0.012, Math.sin(k * 3) * 0.35 * (0.4 + (i % 2) * 0.4));
      m.rotation.set(0, k, i % 3 === 0 ? 0.25 : 0);
      setFrame(mesh, F, 4, m.userData.variant ?? 0);
      continue;
    }
    const speed = (fleeing ? 4.5 : 1.6 + (i % 3) * 0.45) * (i % 2 ? 1 : -1);
    const r = (0.18 + ((i * 37) % 10) / 22) * s.spread;
    const a = t * speed + k;
    // erratic lissajous loops: moths never fly in circles; every so often one stalls and drops a little
    const stall = Math.sin(t * 0.9 + i * 2.1) > 0.92 ? 1 : 0;
    const x = Math.cos(a) * r + Math.sin(t * 3.1 + i) * 0.06;
    const z = Math.sin(a * 1.3) * r + Math.cos(t * 2.3 + i * 2) * 0.06;
    const y = s.h + Math.sin(t * 2.2 + i * 1.7) * 0.18 * s.spread + Math.sin(t * 9 + i) * 0.03 - stall * 0.12;
    m.position.set(x, y, z);
    const vx = -Math.sin(a) * speed, vz = Math.cos(a * 1.3) * 1.3 * speed;
    m.rotation.set(-0.25 + Math.sin(t * 5 + i) * 0.3, Math.atan2(vx, vz), Math.sin(t * 7 + i) * 0.35);
    // flipbook flapping (about 9-14 beats a second, each moth its own rhythm; a stalled moth glides)
    const hz = fleeing ? 11 : 6.5 + (i % 4) * 0.9;
    const f = stall ? 1 : ORDER[Math.floor(t * hz * ORDER.length + i * 2.3) % ORDER.length];
    setFrame(mesh, F, f, m.userData.variant ?? 0);
  }
  // glowing scales drifting down through the air (one dynamic mesh)
  const dg = (P.dust.children[0] as THREE.Mesh).geometry;
  P.dust.visible = !c.dead;
  if (!c.dead) {
    const pos = dg.getAttribute('position') as THREE.BufferAttribute, base = dg.userData.base as Float32Array;
    const per = pos.count / DUST;
    for (let i = 0; i < DUST; i++) {
      const life = (t * 0.45 + i / DUST) % 1;
      const a = i * 2.4 + seed * 6;
      const ox = Math.cos(a) * 0.3 * s.spread + Math.sin(t + i) * 0.05, oy = s.h - life * Math.max(0.4, s.h * 0.9), oz = Math.sin(a) * 0.3 * s.spread;
      const sc = 1 - life * 0.7;
      for (let j = i * per; j < (i + 1) * per; j++) pos.setXYZ(j, base[j * 3] * sc + ox, base[j * 3 + 1] * sc + oy, base[j * 3 + 2] * sc + oz);
    }
    pos.needsUpdate = true;
  }
  if (live() && !c.dead && swarm.visible && G.view?.zone?.key === c.zoneKey && G.lightLevelAt(c.x, c.z) < 0.45) G.pointLight(c.x, c.y + s.h, c.z, 0xbfffd8, follow ? 0.35 : 0.22, 2.6);
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, 0.9);
  void dt;
}
/** swap a moth onto flipbook frame f (in its colour variant) */
function setFrame(mesh: THREE.Mesh, F: THREE.BufferGeometry[], f: number, k: number) {
  const key = k ? 'v' + k + ':' + f : '';
  if (mesh.userData.fk === key + '|' + f) return;
  mesh.userData.fk = key + '|' + f;
  mesh.geometry = k ? variantOf(F[f], f, k) : F[f];
}
const VAR = new Map<string, THREE.BufferGeometry>();
function variantOf(g: THREE.BufferGeometry, f: number, k: number) {
  const key = f + ':' + k;
  let v = VAR.get(key);
  if (!v) {
    v = g.clone();
    const r0 = atlas().get(PG.tex(0)), rk = atlas().get(PG.tex(k));
    const A = v.getAttribute('aAtlas') as THREE.BufferAttribute;
    for (let i = 0; i < A.count; i++) if (Math.abs(A.getX(i) - r0.u0) < 1e-6 && Math.abs(A.getY(i) - r0.v0) < 1e-6) A.setXY(i, rk.u0, rk.v0);
    VAR.set(key, v);
  }
  return v;
}

PG.paint((Pt, v) => {
  const base = v === 0 ? 0xdce8d6 : 0xd8d0e0;
  const W = ramp(base, 10, 0x2a3430, 0.55);
  const spot = v === 0 ? 0x6a8a7a : 0x7a6a8a;
  const rim = v === 0 ? 0xeafff0 : 0xf4ecff;
  /** alpha-shaped wing: inside(u, v) decides the outline */
  const wingPaint = (r: Reg, inside: (u: number, vv: number) => boolean, eye: [number, number, number] | null) => {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h;
      if (!inside(u, vv)) continue;
      const edge = !inside(u + 1.2 / r.w, vv) || !inside(u - 1.2 / r.w, vv) || !inside(u, vv + 1.2 / r.h) || !inside(u, vv - 1.2 / r.h);
      if (edge) { Pt.set(r, x, y, rim); continue; }
      // soft gradient from the dusky root to the pale outer wing, with fine scale texture
      let l = 2.4 + u * 3.4 + (ph(x, y, 5 + v) - 0.5) * 0.7;
      // veins radiating from the root
      const ang = Math.atan2(vv - 0.5, u + 0.05);
      if (Math.abs(Math.sin(ang * 7)) < 0.12 && u > 0.15) l -= 1.4;
      // a pale submarginal band
      if (inside(u + 4 / r.w, vv) && !inside(u + 6 / r.w, vv)) l += 1.5;
      Pt.put(r, x, y, W, l, 0.25);
    }
    if (eye) {
      const [cx, cy, rr] = eye;
      Pt.spot(r, cx * r.w, (1 - cy) * r.h, rr + 1.6, rr + 1.1, W[8], 0.9, true);
      Pt.spot(r, cx * r.w, (1 - cy) * r.h, rr + 0.8, rr + 0.5, spot, 1, true);
      Pt.spot(r, cx * r.w, (1 - cy) * r.h, rr * 0.55, rr * 0.45, 0x1e2a26, 1, true);
      Pt.set(r, cx * r.w - 1, (1 - cy) * r.h - 1, 0xffffff);
    }
  };
  // forewing: swept, pointed tip, straight leading edge
  wingPaint(Pt.R('FORE'), (u, vv) => u >= 0 && u <= 1 && vv >= 0 && vv <= 1 && vv > u * 0.72 - 0.08 && vv < 1 - u * 0.22 && !(u > 0.8 && vv < (u - 0.8) * 3.5 + 0.64), [0.58, 0.6, 2.4]);
  // hindwing: rounded, a small eye spot, scalloped hem
  wingPaint(Pt.R('HIND'), (u, vv) => { const d = Math.hypot((u - 0.35) / 0.68, (vv - 0.55) / 0.5); return u >= 0 && u <= 1 && vv >= 0 && vv <= 1 && d < 1 - (Math.sin(u * 28) > 0.6 ? 0.06 : 0); }, [0.55, 0.45, 1.2]);
  // a faint blush across the hindwings (the eerie part: they are a little too pretty)
  { const r = Pt.R('HIND'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const vv = 1 - (y + 0.5) / r.h; if (Pt.pc.alpha(r.x + x, r.y + y) === 0) continue; Pt.blend(r, x, y, v === 0 ? 0xd8a8c0 : 0xa8d8d0, 0.25 * (1 - vv)); } }
  // body: soft fur, darker rings on the abdomen
  {
    const r = Pt.R('BODY');
    fillLv(Pt, r, W, (u, vv, x, y) => 4.5 + Math.cos(u * Math.PI * 2) * -0.8 + (ph(x, y, 3) - 0.5) * 1.2 - (vv < 0.5 && y % 3 === 0 ? 1.5 : 0));
  }
  // antenna: a feather, alpha shaped
  {
    const r = Pt.R('ANT');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h;
      const half = 0.08 + (1 - vv) * 0.35 * Math.sin(vv * Math.PI);
      if (Math.abs(u - 0.5) > half) continue;
      Pt.set(r, x, y, Math.abs(u - 0.5) < 0.08 ? W[3] : ((x + y) % 2 ? W[6] : W[8]));
    }
  }
});

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
  rule: { name: 'DRAWN TO LIGHT', text: 'They swarm any light and drain your battery. Switch off to lose them; open flame scatters them.' },
  hp: 5, walk: 0.9, run: 3.4, turn: 6, radius: 0.22, height: 0.4, sight: 18, fov: 3.1, hearing: 0.6,
  light: 'attracted', diet: 'light',
  zones: ['lobby', 'pools', 'mall', 'office', 'house', 'suburbs', 'fields'], weight: 2, group: [1, 2], maxPerZone: 5,
  flags: { flying: true }, remains: 'decal_glow_paint',
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
  gore: { blood: 'glow' },
  build: buildSwarm,
  animate: animateSwarm,
  think: thinkSwarm,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const c = fakeCreature(S, { id: 'g1', state: 'curious', mem: { netMem: { h: 0.9 } } });
  animateSwarm(rig, c, t, 1 / 60);
};

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.2, snap: 0.15, breathe: 0, flop: false });

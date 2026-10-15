import * as THREE from 'three';
import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, fx, fxPoll, playAt, live, fearOf, threatNear, localIn, thinkOnce, partB, matB, lineOfSightB } from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Lamplighter: a night-light from Mia Hale's bedroom that learned to walk (or
// at least to float, little legs dangling). A small lantern under a crescent
// moon, warm and soft. It drifts toward whoever is most afraid of the dark and
// stays beside them. It goes dim and hides when something hostile is near.
// Feed it sweets and it is yours: a floating lamp that follows you and calms
// your nerves in the dark.

addTextureModule(() => {
  const A = atlas();
  A.add('c_lamplighter_glass', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xffc86a, 5, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.95 - Math.hypot(x - 7.5, y - 8) * 0.045, 0.6);
    // sleepy face: closed-eye arcs, a tiny smile, rosy cheeks
    pc.hline(3, 5, 7, 0x8a4a1a); pc.set(2, 6, 0x8a4a1a); pc.set(6, 6, 0x8a4a1a);
    pc.hline(10, 12, 7, 0x8a4a1a); pc.set(9, 6, 0x8a4a1a); pc.set(13, 6, 0x8a4a1a);
    pc.set(7, 10, 0x8a4a1a); pc.set(8, 10, 0x8a4a1a); pc.set(6, 9, 0x8a4a1a); pc.set(9, 9, 0x8a4a1a);
    pc.set(2, 9, 0xff8a6a); pc.set(3, 9, 0xff8a6a); pc.set(12, 9, 0xff8a6a); pc.set(13, 9, 0xff8a6a);
  });
  A.add('c_lamplighter_glass_plain', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xffc86a, 5, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.9 - Math.hypot(x - 7.5, y - 8) * 0.05, 0.6);
    pc.vline(7, 2, 13, R[4]); // the filament shadow
  });
  A.add('c_lamplighter_glass_dim', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x6a5038, 5);
    pc.fillRamp(R, (x, y) => 0.6 - Math.hypot(x - 7.5, y - 8) * 0.03, 0.6);
    // eyes squeezed shut, frightened
    pc.hline(3, 5, 7, 0x2a1a10); pc.hline(10, 12, 7, 0x2a1a10); pc.set(4, 6, 0x2a1a10); pc.set(11, 6, 0x2a1a10);
    pc.hline(6, 9, 10, 0x2a1a10);
  });
  A.add('c_lamplighter_brass', 8, 8, (pc) => {
    const R = makeRamp(0x9a7a3a, 5, { hueShift: 0.04 });
    pc.fillRamp(R, (x, y) => 0.55 + (ph(x, y, 8) - 0.5) * 0.25 + (y === 0 ? 0.2 : 0), 0.5);
  });
  A.add('c_lamplighter_moon', 8, 8, (pc) => {
    const R = makeRamp(0xf4e6a8, 4);
    pc.fillRamp(R, (x, y) => 0.8 - (ph(x, y, 2) < 0.15 ? 0.25 : 0), 0.3); // a few craters
  });
  A.add('c_lamplighter_pj', 8, 8, (pc) => {
    // little legs in faded star-print pyjama fabric
    pc.fill(0x8aa0c8);
    pc.set(2, 2, 0xf4e6a8); pc.set(5, 5, 0xf4e6a8); pc.set(6, 1, 0xf4e6a8);
    pc.hline(0, 7, 7, 0x6a7ea8);
  });
  A.add('c_lamplighter_halo', 16, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      const v = Math.max(0, 1 - d);
      const q = Math.floor(v * v * 5 + (((x + y) & 1) ? 0.25 : 0)) / 5; // stepped, pixel-art falloff
      pc.set(x, y, ((Math.round(q * 255) << 16) | (Math.round(q * 190) << 8) | Math.round(q * 90)));
    }
  });
});

const FLOAT = 1.05;

function buildLamp(): Rig {
  const rig = newRig(FLOAT + 0.3);
  const lamp = part(rig, 'lamp', rig.body, [0, FLOAT, 0], (mb) => {
    // brass frame and a little handle ring
    mb.box(0, -0.02, 0, 0.19, 0.025, 0.19, 'c_lamplighter_brass');
    mb.box(0, 0.165, 0, 0.17, 0.025, 0.17, 'c_lamplighter_brass');
    for (const [x, z] of [[0.085, 0.085], [-0.085, 0.085], [0.085, -0.085], [-0.085, -0.085]]) mb.box(x, 0, z, 0.02, 0.17, 0.02, 'c_lamplighter_brass');
    mb.box(0, 0.19, 0, 0.012, 0.05, 0.06, 'c_lamplighter_brass');
  });
  // the glass, bright and dim versions (swapped when frightened)
  partB(rig, 'glass', lamp, [0, 0, 0], (mb) => { mb.box(0, 0.005, 0, 0.15, 0.16, 0.15, { south: 'c_lamplighter_glass', all: 'c_lamplighter_glass_plain' }, { fit: true, emissive: 1.1 }); }, matB('glow'));
  part(rig, 'glassDim', lamp, [0, 0, 0], (mb) => { mb.box(0, 0.005, 0, 0.15, 0.16, 0.15, { south: 'c_lamplighter_glass_dim', all: 'c_lamplighter_brass' }, { fit: true, color: 0x8a8070 }); });
  // the crescent moon perched on top, and a star hanging from its tip
  const moon = partB(rig, 'moon', lamp, [0, 0.2, 0], (mb) => {
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const a = -0.3 + (i / (segs - 1)) * 2.6;
      const r = 0.11, th = 0.035 * Math.sin((i / (segs - 1)) * Math.PI) + 0.012;
      mb.box(Math.cos(a) * r - 0.02, 0.02 + Math.sin(a) * r * 0.9 + 0.08, 0, th + 0.02, 0.04, 0.045, 'c_lamplighter_moon', { emissive: 1.1 });
    }
  }, matB('glow'));
  partB(rig, 'star', moon, [0.08, 0.11, 0], (mb) => {
    mb.box(0, -0.08, 0, 0.004, 0.08, 0.004, 'c_lamplighter_brass');
    mb.box(0, -0.1, 0, 0.04, 0.012, 0.012, 'c_lamplighter_moon', { emissive: 1 });
    mb.box(0, -0.115, 0, 0.012, 0.04, 0.012, 'c_lamplighter_moon', { emissive: 1 });
  }, matB('glow'));
  // stubby legs dangling under it
  for (const [i, x] of [[0, 0.04], [1, -0.04]] as const) {
    part(rig, 'leg' + i, lamp, [x, -0.03, 0], (mb) => {
      mb.box(0, -0.075, 0, 0.035, 0.075, 0.035, 'c_lamplighter_pj', { fit: true });
      mb.box(0, -0.095, 0.008, 0.042, 0.022, 0.052, 'c_lamplighter_brass', { color: 0xf0e0d0 }); // tiny socks
    });
  }
  // soft halo on the root: seen through darkness like a real night-light
  const halo = new THREE.Group();
  halo.name = 'halo';
  rig.root.add(halo);
  rig.parts.halo = halo;
  partB(rig, 'haloA', halo, [0, 0, 0], (mb) => { mb.panel(-0.32, 0, 0.32, 0, -0.32, 0.32, 'c_lamplighter_halo', { fit: true, emissive: 1 }); }, matB('dust'));
  partB(rig, 'haloB', halo, [0, 0, 0], (mb) => { mb.panel(0, -0.32, 0, 0.32, -0.32, 0.32, 'c_lamplighter_halo', { fit: true, emissive: 1 }); }, matB('dust'));
  rig.eyes = [halo];
  return rig;
}

function animateLamp(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { h?: number; glow?: number };
  const seed = hashId(c.id);
  const dim = !!n.dim || c.dead;
  const happy = !!c.tamedBy || !!n.f;
  const hT = c.dead ? 0.09 : dim ? 0.55 : FLOAT + Math.sin(t * (happy ? 2.6 : 1.7) + seed * 6) * 0.07;
  ud.h = (ud.h ?? hT) + (hT - (ud.h ?? hT)) * Math.min(1, dt * (c.dead ? 6 : 3));
  P.lamp.position.y = ud.h;
  P.lamp.rotation.set(c.dead ? 0 : Math.sin(t * 1.3 + seed) * 0.08 + (c.speed > 0.3 ? -0.2 : 0), Math.sin(t * 0.5) * 0.3, c.dead ? 1.45 : dim ? Math.sin(t * 40) * 0.05 : Math.sin(t * 1.1) * 0.06);
  // glow swap
  ud.glow = (ud.glow ?? 1) + ((dim ? 0 : 1) - (ud.glow ?? 1)) * Math.min(1, dt * 4);
  P.glass.visible = ud.glow > 0.35;
  P.glassDim.visible = !P.glass.visible;
  P.moon.rotation.z = Math.sin(t * 0.9 + seed * 3) * 0.12;
  P.star.rotation.z = Math.sin(t * 2.1) * 0.35;
  // little legs kick when it hurries, swing when it floats
  const kick = c.speed > 0.3 ? 9 : 2.2;
  P.leg0.rotation.x = Math.sin(t * kick) * (c.speed > 0.3 ? 0.6 : 0.25);
  P.leg1.rotation.x = Math.sin(t * kick + Math.PI) * (c.speed > 0.3 ? 0.6 : 0.25);
  if (dim) { P.leg0.rotation.x = -0.9; P.leg1.rotation.x = -0.9; } // tucked up, hiding
  // halo follows the lamp (on the root so it shows in the dark)
  const halo = P.halo;
  halo.position.y = ud.h + 0.08;
  const hs = c.dead ? 0 : 0.35 + ud.glow * (0.75 + Math.sin(t * 3.1 + seed) * 0.05);
  halo.scale.setScalar(Math.max(0.001, hs));
  halo.rotation.y = -rig.root.rotation.y + Math.PI / 4;
  // real light, on every peer
  if (live() && !c.dead && rig.root.visible) {
    const I = (c.tamedBy ? 1.05 : 0.7) * (0.12 + ud.glow * 0.88) * (0.96 + Math.sin(t * 7.3 + seed * 9) * 0.04);
    G.pointLight(c.x, c.y + ud.h + 0.1, c.z, 0xffc070, I, c.tamedBy ? 6.5 : 5);
  }
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 0.8, e.a.r);
  // company in the dark: calms the survivor it is with
  const p = localIn(c);
  if (p && !c.dead && !dim && (c.tamedBy === p.id || n.f === p.id) && Math.hypot(p.x - c.x, p.z - c.z) < 4) {
    p.body.panic = Math.max(0, p.body.panic - dt * 8);
    p.body.stress = Math.max(0, p.body.stress - dt * 0.15);
    if (!c.tamedBy) thinkOnce(p, 'lamp_follow', ['A little light is following me. It feels... safe?', 'It hums a lullaby I almost remember.', 'A night-light. Like the one I had as a kid.'][Math.floor(seed * 3)], 300);
  }
}

// ---------------------------------------------------------------- brain (host)
function mostAfraid(c: Creature): Player | null {
  const z = G.getZone(c.zoneKey);
  let best: Player | null = null, bs = 0.35;
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    if (d > 16 || (d > 4 && !lineOfSightB(z, c.x, c.z, p.x, p.z))) continue;
    const s = fearOf(p, z) - d * 0.01;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
function chirp(c: Creature) { if (c.noiseCooldown <= 0) { G.creatures.call(c, 'idle'); c.noiseCooldown = rng.float(14, 30); } }

function thinkLamp(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  const cs = G.creatures;
  const owner = c.tamedBy ? G.players.get(c.tamedBy) : null;
  // danger: go dark and hide (behind its person if it has one)
  m.thrT = (m.thrT ?? 0) - dt;
  if (m.thrT <= 0) { m.thrT = 0.4; m.threat = threatNear(c, 9)?.id ?? null; }
  const threat = m.threat ? cs.creatures.get(m.threat) : null;
  if (threat && !threat.dead) {
    if (!n.dim) { fx(c, 'lamp_whimper', { v: 0.7 }); }
    n.dim = 1;
    const anchor = owner && owner.zoneKey === c.zoneKey ? owner : null;
    if (anchor) {
      const a = Math.atan2(anchor.z - threat.z, anchor.x - threat.x);
      cs.moveTo(c, z, anchor.x + Math.cos(a) * 0.9, anchor.z + Math.sin(a) * 0.9, c.sp.run, dt, 0.3);
      c.setState('hide');
    } else {
      if (c.state !== 'flee' || !c.goal) { c.setState('flee'); c.goal = cs.fleeSpot(c, z, threat.x, threat.z); }
      if (cs.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.run, dt, 0.8)) hold(c);
    }
    return true;
  }
  if (n.dim && c.state === 'flee' && c.stateT < 3) { cs.moveTo(c, z, c.goal?.x ?? c.x, c.goal?.z ?? c.z, c.sp.run, dt, 0.8); return true; }
  n.dim = 0;
  // tamed: float just ahead of its person, lighting the way
  if (owner) {
    n.f = owner.id;
    if (owner.zoneKey !== c.zoneKey) { hold(c); return true; }
    if (m.stay) { hold(c); c.setState('idle'); return true; }
    const side = hashId(c.id) > 0.5 ? 1 : -1;
    const a = owner.facing + side * 0.75;
    const gx = owner.x + Math.cos(a) * 1.0, gz = owner.z + Math.sin(a) * 1.0;
    const d = Math.hypot(gx - c.x, gz - c.z);
    c.setState('follow');
    if (d > 0.3) cs.moveTo(c, z, gx, gz, d > 5 ? c.sp.run : Math.min(c.sp.run, 0.6 + d * 1.4), dt, 0.25);
    else { hold(c); face(c, owner.x, owner.z); }
    if (fearOf(owner, z) > 0.5 && rng.chance(dt * 0.1)) chirp(c);
    return true;
  }
  // wild: find whoever is most afraid of the dark and keep them company
  m.scanT = (m.scanT ?? 0) - dt;
  if (m.scanT <= 0) { m.scanT = 1.2; const p = mostAfraid(c); n.f = p?.id ?? null; }
  const f = n.f ? G.players.get(n.f) : null;
  if (f && f.zoneKey === c.zoneKey) {
    const d = dist(f, c);
    // too much fuss (running at it, swinging): keep a little more distance
    const keep = f.running ? 3 : 1.6;
    const a = Math.atan2(c.z - f.z, c.x - f.x);
    const gx = f.x + Math.cos(a) * keep, gz = f.z + Math.sin(a) * keep;
    c.setState('follow');
    if (d > keep + 0.4 || d < keep - 0.8) cs.moveTo(c, z, gx, gz, d > 6 ? c.sp.run : c.sp.walk, dt, 0.3);
    else { hold(c); face(c, f.x, f.z); }
    if (rng.chance(dt * 0.06)) chirp(c);
    return true;
  }
  // drifting through dark corners
  if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 10); }
  if (cs.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.walk * 0.5, dt, 0.6) || c.stateT > 20) { c.goal = cs.wanderSpot(c, z, 10); c.stateT = 0; }
  if (rng.chance(dt * 0.02)) chirp(c);
  return true;
}

const S = def({
  key: 'lamplighter', name: 'Lamplighter', code: 'E-07 // NIGHT-LIGHT', temperament: 'peaceful', threat: 0,
  hp: 14, walk: 1.2, run: 3.4, turn: 6, radius: 0.18, height: 0.45, sight: 14, fov: 3.1, hearing: 1.2, nightVision: true,
  zones: ['house', 'school', 'lobby', 'suburbs', 'fields', 'hospital'], weight: 1, maxPerZone: 2, diet: 'none',
  tame: { food: ['candy_bar', 'candy_dream', 'cookies', 'donut', 'birthday_cake', 'popsicle', 'ice_cream'], feeds: 2 },
  flags: { flying: true, companion: true },
  sounds: snd({ idle: 'lamp_chirp', alert: 'lamp_chirp', hurt: 'lamp_whimper', death: 'lamp_pop' }),
  scan: {
    cls: 'Dream-born / gentle / tameable',
    notes: [
      'A night-light with a crescent moon and little pyjama legs. Mia had one just like it.',
      'Drifts to whoever is most afraid of the dark and stays beside them. Its light calms panic.',
      'Goes dark and hides when anything hostile is near: when it dims, something is coming.',
      'Loves sweets. Two candies and it is yours; it lights the way ahead of you.',
    ],
  },
  gore: { blood: 'glass', sever: ['leg0', 'leg1'], gib: false },
  build: buildLamp,
  animate: animateLamp,
  think: thinkLamp,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const c = fakeCreature(S, { id: 'g7', state: 'follow', mem: { netMem: { f: 'x' } } });
  animateLamp(rig, c, t, 1 / 60);
};

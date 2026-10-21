import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, fx, fxPoll, playAt, live, fearOf, threatNear, localIn, thinkOnce, partB, matB, lineOfSightB } from '../behaviors_b';
import '../../audio/sounds_creatures_b';
import { SkinKit, KRig, tube, blob, lathe, damp, V3 } from '../kit/anomalies';
import '../kit/anomalyTextures';

// Lamplighter: a night-light from Mia Hale's bedroom that learned to walk (or
// at least to float, little legs dangling). A small brass lantern under a
// crescent moon, warm and soft, with a sleepy face on its front pane that
// sometimes opens its eyes a crack when you are close. It drifts toward
// whoever is most afraid of the dark and stays beside them. It goes dim and
// hides when something hostile is near. Feed it sweets and it is yours: a
// floating lamp that follows you and calms your nerves in the dark.

addTextureModule(() => {
  const A = atlas();
  const glassBase = (pc: any, flame: boolean) => {
    const R = makeRamp(0xffc66a, 6, { hueShift: 0.03, spread: 0.45 });
    pc.fillRamp(R, (x: number, y: number) => 0.98 - Math.hypot((x - 15.5) / 16, (y - 18) / 18) * 0.55, 0.6);
    // leading of the little window, and a soft reflection streak
    for (let y = 0; y < 32; y++) { pc.blend(2, y, 0xfff8e0, 0.35); pc.blend(3, y, 0xfff8e0, 0.2); }
    if (flame) { pc.ellipse(15.5, 21, 2.2, 4.5, 0xfff4c8); pc.ellipse(15.5, 22, 1.2, 2.5, 0xffffff); pc.rect(14, 26, 4, 5, 0xf0d8a8); }
  };
  // the front pane: a sleepy face (closed arcs, rosy cheeks, a small smile)
  A.add('c_ll_face', 32, 32, (pc) => {
    pc.wrap = false; glassBase(pc, false);
    const ink = 0x8a4a1a;
    for (const cx of [9, 22]) { pc.hline(cx - 3, cx + 3, 14, ink); pc.set(cx - 4, 13, ink); pc.set(cx + 4, 13, ink); pc.set(cx - 2, 15, 0xc87a3a); pc.set(cx + 2, 15, 0xc87a3a); }
    for (const cx of [7, 24]) pc.ellipseBlend(cx, 18.5, 3, 1.6, 0xff7a6a, 0.6, false);
    pc.line(13, 20, 15, 21, ink); pc.line(16, 21, 18, 20, ink);
  });
  // eyes open a crack: drowsy half-moons with a glint
  A.add('c_ll_face_open', 32, 32, (pc) => {
    pc.wrap = false; glassBase(pc, false);
    const ink = 0x8a4a1a;
    for (const cx of [9, 22]) { pc.hline(cx - 3, cx + 3, 12, ink); pc.ellipse(cx, 14, 2.6, 1.6, 0x4a2410); pc.set(cx - 1, 13, 0xfff8e8); pc.hline(cx - 3, cx + 3, 12, ink); }
    for (const cx of [7, 24]) pc.ellipseBlend(cx, 18.5, 3, 1.6, 0xff7a6a, 0.6, false);
    pc.line(13, 20, 15, 22, ink); pc.line(16, 22, 18, 20, ink); pc.set(15, 22, ink);
  });
  A.add('c_ll_glass', 32, 32, (pc) => { pc.wrap = false; glassBase(pc, true); });
  // frightened and dark
  A.add('c_ll_glass_dim', 32, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x5a4430, 5);
    pc.fillRamp(R, (x, y) => 0.55 - Math.hypot(x - 15.5, y - 18) * 0.02, 0.6);
    const ink = 0x1e120a;
    for (const cx of [9, 22]) { pc.line(cx - 3, 13, cx + 3, 15, ink); pc.line(cx - 3, 15, cx + 3, 13, ink); } // eyes squeezed shut
    pc.hline(12, 19, 21, ink); pc.set(11, 20, ink); pc.set(20, 20, ink);
  });
  A.add('c_ll_brass', 16, 16, (pc) => {
    const R = makeRamp(0xa07a36, 7, { hueShift: 0.04, spread: 0.6 });
    pc.fillRamp(R, (x, y) => 0.58 + Math.sin((x + y * 0.3) * 0.5) * 0.14 + (ph(x >> 1, y >> 1, 8) - 0.5) * 0.08, 0.5);
    for (let i = 0; i < 3; i++) pc.set(Math.floor(ph(i, 1, 9) * 16), Math.floor(ph(i, 2, 9) * 16), 0x6a8a5a); // a little verdigris
    pc.set(4, 3, 0xfff0b0); pc.set(11, 9, 0xfff0b0);
  }, 0.125, 0.125);
  A.add('c_ll_moon', 16, 16, (pc) => {
    const R = makeRamp(0xf4e2a0, 5, { spread: 0.35 });
    pc.fillRamp(R, (x, y) => 0.8 - (ph(x >> 1, y >> 1, 2) < 0.18 ? 0.3 : 0) + (ph(x, y, 3) - 0.5) * 0.08, 0.3); // craters
  }, 0.1, 0.1);
  A.add('c_ll_pj', 16, 16, (pc) => {
    // faded star-print flannel
    const R = makeRamp(0x8aa0c8, 5, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => 0.55 + ((x + y) % 4 === 0 ? 0.08 : 0) + (ph(x, y, 4) - 0.5) * 0.1, 0.6);
    for (const [x, y] of [[3, 3], [11, 6], [6, 12], [13, 13]]) { pc.set(x, y, 0xf4e6a8); pc.set(x + 1, y, 0xe8d898); pc.set(x, y + 1, 0xe8d898); }
  }, 0.08, 0.08);
  A.add('c_ll_sock', 16, 8, (pc) => {
    pc.fill(0xf0e4d4);
    for (let x = 0; x < 16; x++) { pc.set(x, 0, 0xc84a4a); pc.set(x, 1, 0xc84a4a); pc.set(x, 3, x % 2 ? 0xe0d4c4 : 0xf8f0e4); }
    pc.set(3, 6, 0xd8ccbc); pc.set(10, 5, 0xd8ccbc);
  }, 0.08, 0.04);
  A.add('c_lamplighter_halo', 16, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      const v = Math.max(0, 1 - d);
      const q = Math.floor(v * v * 5 + (((x + y) & 1) ? 0.25 : 0)) / 5; // stepped, pixel-art falloff
      pc.set(x, y, ((Math.round(q * 255) << 16) | (Math.round(q * 190) << 8) | Math.round(q * 90)));
    }
  });
  void mixHex;
});

const FLOAT = 1.05;
const W2 = 0.085, H = 0.17; // half width of the lantern, height of the glass

function buildLamp(): Rig {
  const K = new SkinKit(FLOAT + 0.3);
  K.bone('lamp', null, [0, FLOAT, 0]);
  K.bone('glass', 'lamp', [0, 0, 0]);
  K.bone('faceA', 'lamp', [0, H / 2, W2]);
  K.bone('faceB', 'lamp', [0, H / 2, W2]);
  K.bone('moon', 'lamp', [0, H + 0.075, 0]);
  K.bone('star', 'moon', [0.085, 0.1, 0]);
  K.bone('leg0', 'lamp', [0.035, -0.035, 0.005]);
  K.bone('leg1', 'lamp', [-0.035, -0.035, 0.005]);
  K.bone('shin0', 'leg0', [0, -0.05, 0]);
  K.bone('shin1', 'leg1', [0, -0.05, 0]);
  const BR = 'c_ll_brass';
  K.local('lamp', (mb) => {
    // base: stepped plate with little ball feet
    mb.box(0, -0.028, 0, W2 * 2 + 0.04, 0.016, W2 * 2 + 0.04, BR);
    mb.box(0, -0.014, 0, W2 * 2 + 0.024, 0.014, W2 * 2 + 0.024, BR);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) blob(mb, [x * (W2 + 0.012), -0.036, z * (W2 + 0.012)], [0.011, 0.01, 0.011], 5, 3, BR, {});
    // corner posts with rivets, top rail
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      mb.cylinder(x * W2, 0, z * W2, 0.0085, H, 6, BR);
      for (const y of [0.02, H - 0.02]) blob(mb, [x * (W2 + 0.006), y, z * (W2 + 0.006)], [0.006, 0.006, 0.006], 4, 2, BR, {});
    }
    mb.box(0, H, 0, W2 * 2 + 0.03, 0.014, W2 * 2 + 0.03, BR);
    // roof: a four-sided cap and a ring handle
    mb.push().rotateY(Math.PI / 4);
    lathe(mb, [0, H + 0.014, 0], [[W2 + 0.02, 0], [W2 + 0.012, 0.012], [0.045, 0.05], [0.014, 0.075], [0.008, 0.08]].map(([r, y]) => [r * Math.SQRT2, y] as [number, number]), 4, BR, { inside: null, flat: true });
    mb.pop();
    tube(mb, Array.from({ length: 11 }, (_, q) => { const a = (q / 10) * Math.PI * 2; return [Math.sin(a) * 0.022, H + 0.105 + Math.cos(a) * 0.022, 0] as V3; }), 0.0045, 4, BR);
    // dim panes just inside the glowing ones (they show when it goes dark)
    for (let s = 0; s < 4; s++) { mb.push().rotateY(s * Math.PI / 2); mb.box(0, 0.002, W2 - 0.004, W2 * 2 - 0.006, H - 0.004, 0.002, s === 0 ? 'c_ll_glass_dim' : 'c_ll_glass_dim', { fit: true }); mb.pop(); }
  });
  // glowing panes (sides and back with a little flame, the face on the front)
  K.local('glass', (mb) => {
    for (let s = 1; s < 4; s++) { mb.push().rotateY(s * Math.PI / 2); mb.box(0, 0.002, W2 - 0.001, W2 * 2 - 0.006, H - 0.004, 0.002, 'c_ll_glass', { fit: true, emissive: 1 }); mb.pop(); }
  }, 'g');
  K.local('faceA', (mb) => { mb.box(0, -H / 2 + 0.002, -0.001, W2 * 2 - 0.006, H - 0.004, 0.002, 'c_ll_face', { fit: true, emissive: 1 }); }, 'g');
  K.local('faceB', (mb) => { mb.box(0, -H / 2 + 0.002, -0.0005, W2 * 2 - 0.006, H - 0.004, 0.002, 'c_ll_face_open', { fit: true, emissive: 1 }); }, 'g');
  // the crescent moon perched on the roof, and a star hanging from its tip on a thread
  K.local('moon', (mb) => {
    const pts: V3[] = [];
    for (let k = 0; k <= 9; k++) { const a = -0.5 + (k / 9) * 2.9; pts.push([Math.cos(a) * 0.075 - 0.01, 0.03 + Math.sin(a) * 0.072, 0]); }
    tube(mb, pts, (t) => 0.004 + Math.sin(t * Math.PI) * 0.02, 6, 'c_ll_moon', { capStart: true, capEnd: true, emissive: 1, squash: [1, 0.6] });
  }, 'g');
  K.local('star', (mb) => {
    mb.box(0, -0.06, 0, 0.002, 0.06, 0.002, BR);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; mb.push().translate(0, -0.075, 0).rotateZ(a); mb.box(0, 0, 0, 0.007, 0.016, 0.006, 'c_ll_moon', { emissive: 1 }); mb.pop(); }
    blob(mb, [0, -0.075, 0], [0.008, 0.008, 0.006], 5, 3, 'c_ll_moon', { emissive: 1 });
  }, 'g');
  // stubby legs in star-print pyjamas, striped socks
  for (const i of [0, 1]) {
    K.local('leg' + i, (mb) => { tube(mb, [[0, 0.01, 0], [0, -0.025, 0.003], [0, -0.055, 0]], 0.019, 6, 'c_ll_pj', { capStart: true }); });
    K.local('shin' + i, (mb) => {
      tube(mb, [[0, 0, 0], [0, -0.035, 0]], 0.0155, 6, 'c_ll_pj', {});
      tube(mb, [[0, -0.03, 0], [0, -0.055, 0.002]], 0.0165, 6, 'c_ll_sock', { fitU: true });
      blob(mb, [0, -0.062, 0.012], [0.018, 0.014, 0.026], 6, 3, 'c_ll_sock', {});
    });
  }
  const rig = K.finish({ sphere: [0, FLOAT, 0, 0.6] });
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

interface LPose { h: number; glow: number; speed: number; happy: number; dead: number; awake: number; flinch: number }
function poseLamp(rig: KRig, o: LPose, t: number, seed: number, ud: Record<string, number>, dt: number) {
  const P = rig.parts;
  const dim = o.glow < 0.35;
  P.lamp.position.y = o.h;
  // bobbing float with a lazy sway; leaning into its drift, flinching when struck
  ud.lean = damp(ud.lean ?? 0, o.speed > 0.3 ? -0.22 : 0, 3, dt);
  P.lamp.rotation.set(o.dead ? 0 : Math.sin(t * 1.3 + seed) * 0.07 + ud.lean - o.flinch * 0.4, Math.sin(t * 0.5 + seed) * 0.3, o.dead ? 1.45 : dim ? Math.sin(t * 40) * 0.05 : Math.sin(t * 1.1) * 0.06 + o.flinch * Math.sin(t * 50) * 0.2);
  // glow: candle flutter on the panes, dark when frightened
  if (rig.skins.g) rig.skins.g.visible = !dim;
  // sleepy face: eyes closed, opening a crack now and then when it is happy and close to its person
  ud.open = damp(ud.open ?? 0, o.awake > 0 && ((t * 0.21 + seed) % 1) < 0.35 ? 1 : 0, 2, dt);
  const open = ud.open > 0.5;
  P.faceA.scale.setScalar(open ? 0.001 : 1);
  P.faceB.scale.setScalar(open ? 1 : 0.001);
  P.moon.rotation.z = Math.sin(t * 0.9 + seed * 3) * 0.12;
  // the star swings like a pendulum, pushed by the lamp's sway
  P.star.rotation.z = Math.sin(t * 2.1) * 0.35 - ud.lean * 0.8;
  // legs dangle with a little lag, kick when it hurries, tuck up when hiding
  const kick = o.speed > 0.3 ? 9 : 2.2, amp = o.speed > 0.3 ? 0.6 : 0.22;
  for (const i of [0, 1]) {
    const ph0 = t * kick + (i ? Math.PI : 0);
    if (dim) { P['leg' + i].rotation.set(-1.0, 0, (i ? -1 : 1) * 0.15); P['shin' + i].rotation.set(1.6, 0, 0); }
    else if (o.dead) { P['leg' + i].rotation.set(-0.3, 0, (i ? -1 : 1) * 0.5); P['shin' + i].rotation.set(0.2, 0, 0); }
    else {
      P['leg' + i].rotation.set(Math.sin(ph0) * amp - ud.lean * 1.2, 0, (i ? -1 : 1) * (0.06 + o.happy * 0.08 * Math.sin(t * 3 + i)));
      P['shin' + i].rotation.set(0.25 + Math.max(0, Math.sin(ph0 - 0.8)) * amp * 1.4, 0, 0);
    }
  }
}

function animateLamp(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as KRig;
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as Record<string, number>;
  const seed = hashId(c.id);
  const dim = !!n.dim || c.dead;
  const happy = !!c.tamedBy || !!n.f;
  const hT = c.dead ? 0.09 : dim ? 0.55 : FLOAT + Math.sin(t * (happy ? 2.6 : 1.7) + seed * 6) * 0.07;
  ud.h = (ud.h ?? hT) + (hT - (ud.h ?? hT)) * Math.min(1, dt * (c.dead ? 6 : 3));
  ud.glow = (ud.glow ?? 1) + ((dim ? 0 : 1) - (ud.glow ?? 1)) * Math.min(1, dt * 4);
  const p = localIn(c);
  const near = p && Math.hypot(p.x - c.x, p.z - c.z) < 3 ? 1 : 0;
  poseLamp(R, { h: ud.h, glow: ud.glow, speed: c.speed, happy: happy ? 1 : 0, dead: c.dead ? 1 : 0, awake: happy && near ? 1 : near * 0.5, flinch: Math.min(1, c.hitFlash / 0.15) }, t, seed, ud, dt);
  // halo follows the lamp (on the root so it shows in the dark)
  const halo = P.halo;
  halo.position.y = ud.h + 0.08;
  const hs = c.dead ? 0 : 0.35 + ud.glow * (0.75 + Math.sin(t * 3.1 + seed) * 0.05);
  halo.scale.setScalar(Math.max(0.001, hs));
  halo.rotation.y = -rig.root.rotation.y + Math.PI / 4;
  // real light, on every peer: a candle flutter
  if (live() && !c.dead && rig.root.visible) {
    const I = (c.tamedBy ? 1.05 : 0.7) * (0.12 + ud.glow * 0.88) * (0.94 + Math.sin(t * 7.3 + seed * 9) * 0.04 + Math.sin(t * 17.1) * 0.02);
    G.pointLight(c.x, c.y + ud.h + 0.1, c.z, 0xffc070, I, c.tamedBy ? 6.5 : 5);
  }
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 0.8, e.a.r);
  // company in the dark: calms the survivor it is with
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
  rule: { name: 'IT DIMS FOR DANGER', text: 'Gentle. When its light goes out and it hides, something hostile is near.' },
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
/** gallery: floating (default), awake (eyes open a crack), dim (frightened), walk (hurrying), dead */
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const ud = rig.root.userData as Record<string, number>;
  const dim = q === 'dim', dead = q === 'dead';
  const h = dead ? 0.09 : dim ? 0.55 : FLOAT + Math.sin(t * 2.6) * 0.07;
  poseLamp(rig as KRig, { h, glow: dim || dead ? 0 : 1, speed: q === 'walk' ? 1 : 0, happy: 1, dead: dead ? 1 : 0, awake: q === 'awake' ? 1 : 0, flinch: 0 }, t, 0.3, ud, 1 / 60);
  rig.parts.halo.position.y = h + 0.08;
  rig.parts.halo.scale.setScalar(dim || dead ? 0.35 : 1.1);
  void fakeCreature;
};

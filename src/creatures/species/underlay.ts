import * as THREE from 'three';
import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { bus } from '../../core/events';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, pulse, attack, playersIn, stop, dist, faceTo, isCarpet, instFlags, sfx, galleryPose, onPlayerHit, HeldAction, heardMargin, suppressSighting,
} from '../behaviors_a';

// =====================================================================================
// UNDERLAY — something living under the carpet. No body you can see: a bulge
// that travels, a ripple that follows footsteps. It lunges up through the pile
// to grab ankles, then sinks again. It only knows you by your feet.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  A.add('c_underlay_hand', 8, 16, (pc) => {
    const R = makeRamp(0xb4b6ac, 5, { hueShift: -0.04 });
    pc.fillRamp(R, (x, y) => 0.55 + (x === 0 ? -0.2 : x === 7 ? 0.15 : 0) + (ph(x, y, 6) - 0.5) * 0.15 - y * 0.01, 0.5);
    for (let y = 3; y < 16; y += 4) pc.hline(1, 6, y, R[1]); // knuckle creases
    pc.rect(2, 0, 4, 2, 0x4a4a40); // nails
  });
  A.add('c_underlay_tear', 16, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x0a0806);
    for (let x = 0; x < 16; x++) { const e = Math.abs(x - 7.5) / 8; const h = Math.round(3.5 - e * 3.5); for (let y = 0; y < 8; y++) if (Math.abs(y - 3.5) > h) pc.set(x, y, ph(x, y, 4) < 0.5 ? 0xb8a060 : 0x8a7a48); }
    for (let x = 2; x < 14; x += 2) { pc.set(x, 3, 0x2a2018); pc.set(x + 1, 4, 0x1a1410); } // frayed fibres
  });
});

const BASE_TEX = 'carpet_yellow';

function moundGeo(tex: string, r: number, sy: number) {
  const mb = new ModelBuilder();
  mb.sphere(0, 0, 0, r, 8, 4, tex, { sy, color: 0xe6e2da });
  return mb.build();
}

function buildUnderlay(): Rig {
  const rig = newRig(0.4);
  const inner = part(rig, 'inner', rig.body, [0, 0, 0], () => {});
  part(rig, 'mound', inner, [0, -0.01, 0], (mb) => { mb.sphere(0, 0, 0, 0.5, 8, 4, BASE_TEX, { sy: 0.45, color: 0xe6e2da }); });
  part(rig, 'ripple1', inner, [0, -0.01, -0.55], (mb) => { mb.sphere(0, 0, 0, 0.32, 7, 3, BASE_TEX, { sy: 0.35, color: 0xe6e2da }); });
  part(rig, 'ripple2', inner, [0, -0.01, -0.95], (mb) => { mb.sphere(0, 0, 0, 0.22, 6, 3, BASE_TEX, { sy: 0.3, color: 0xe6e2da }); });
  part(rig, 'tear', inner, [0, 0.21, 0.08], (mb) => { mb.box(0, 0, 0, 0.42, 0.012, 0.16, { top: 'c_underlay_tear', all: 'c_underlay_tear' }, { fit: { top: true } }); });
  // the arm: far too long, grey, with jointed fingers
  const arm = part(rig, 'arm', inner, [0, 0.12, 0.1], (mb) => {
    mb.box(0, 0, 0, 0.09, 0.42, 0.09, 'c_underlay_hand', { fit: true });
    mb.sphere(0, 0.42, 0, 0.055, 6, 3, 'c_underlay_hand'); // an elbow where there should not be one
  });
  const fore = part(rig, 'fore', arm, [0, 0.42, 0], (mb) => {
    mb.box(0, 0, 0, 0.075, 0.4, 0.08, 'c_underlay_hand', { fit: true });
    mb.box(0, 0.38, 0.0, 0.13, 0.12, 0.05, 'c_underlay_hand', { fit: true }); // palm
  });
  for (let i = 0; i < 4; i++) {
    const f = part(rig, 'finger' + i, fore, [-0.05 + i * 0.033, 0.49, 0.0], (mb) => {
      mb.box(0, 0, 0, 0.02, 0.2, 0.022, 'c_underlay_hand', { fit: true });
      mb.box(0, 0.19, 0.012, 0.018, 0.14, 0.02, 'c_underlay_hand', { fit: true });
    });
    f.rotation.x = 0.5;
  }
  part(rig, 'thumb', fore, [0.075, 0.4, 0.02], (mb) => { mb.box(0, 0, 0, 0.02, 0.13, 0.022, 'c_underlay_hand', { fit: true }); }).rotation.z = -0.6;
  return rig;
}

function setMoundTex(rig: Rig, tex: string) {
  if (rig.root.userData.utex === tex) return;
  rig.root.userData.utex = tex;
  const specs: [string, number, number][] = [['mound', 0.5, 0.45], ['ripple1', 0.32, 0.35], ['ripple2', 0.22, 0.3]];
  for (const [n, r, sy] of specs) {
    const m = rig.parts[n].children[0] as THREE.Mesh | undefined;
    if (!m) continue;
    m.geometry.dispose();
    m.geometry = moundGeo(tex, r, sy);
  }
}

function pose(rig: Rig, h: number, lunge: number, moving: number, phase: number, t: number) {
  const P = rig.parts;
  const breathe = Math.sin(t * 0.9) * 0.04;
  P.mound.scale.set(1 + lunge * 0.1, Math.max(0.05, h + breathe * (1 - moving) + lunge * 0.9), 1 + lunge * 0.1);
  P.mound.position.z = moving ? Math.sin(phase * 0.7) * 0.06 : 0;
  for (const [n, o] of [['ripple1', 0.9], ['ripple2', 1.8]] as [string, number][]) {
    const w = moving ? Math.max(0, Math.sin(phase * 0.7 - o)) : 0;
    P[n].scale.set(1, Math.max(0.02, (0.15 + w * 0.6) * h * 1.4), 1);
    P[n].visible = moving > 0 || h > 0.3;
  }
  P.tear.visible = lunge > 0.2;
  P.tear.position.y = 0.225 * P.mound.scale.y + 0.004;
  P.tear.scale.set(lunge, 1, lunge);
  P.arm.visible = lunge > 0.05;
  P.arm.scale.set(1, Math.max(0.01, lunge), 1);
  P.arm.rotation.x = 0.2 + lunge * 0.5;
  P.fore.rotation.x = 0.3 + lunge * 0.9;
  for (let i = 0; i < 4; i++) P['finger' + i].rotation.x = 0.3 + Math.max(0, lunge - 0.6) * 2.4 + Math.sin(t * 13 + i) * 0.1;
}

function animateUnderlay(rig: Rig, c: Creature, t: number, dt: number) {
  suppressSighting(c, c.state === 'hide' && !c.dead); // a flat lump in the carpet should not cue the music
  const z = G.zones.get(c.zoneKey);
  const f = z?.floorAt(Math.floor(c.x), Math.floor(c.z));
  if (f && (f.sound ?? '').includes('carpet')) setMoundTex(rig, f.tex[0]);
  const target = c.dead ? 0.25 : c.attackPhase > 0 ? 1 : c.state === 'emerge' ? 0.85 : 0;
  const lr = c.mem._lunge ?? 0;
  c.mem._lunge = lr + (target - lr) * Math.min(1, dt * (target > lr ? 14 : 3));
  const h = c.dead ? 0.15 : c.state === 'hide' ? 0.12 : c.state === 'stalk' ? 0.55 : c.state === 'flee' ? 0.4 : 0.32;
  const hr = c.mem._h ?? h;
  c.mem._h = hr + (h - hr) * Math.min(1, dt * 2);
  pose(rig, c.mem._h, c.dead ? 0 : c.mem._lunge, c.speed > 0.15 ? 1 : 0, c.phase, t);
  // stays flat on the floor even when the manager tips the corpse over
  rig.parts.inner.rotation.z = -rig.body.rotation.z;
  rig.parts.inner.position.y = -rig.body.position.y;
}

/** footsteps it can feel: moving, not sneaking, on or next to carpet */
function felt(c: Creature): { p: Player; d: number } | null {
  const z = zoneOf(c);
  let best: Player | null = null, bd = Infinity;
  for (const p of playersIn(c)) {
    if (p.speed < 0.35 || p.stance === 'sneak' || p.stance === 'swim') continue;
    const d = dist(p.x, p.z, c.x, c.z);
    const r = p.running ? 10 : 6.5;
    if (d > r || !isCarpet(z, p.x, p.z) && d > 2) continue;
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}

/** move but never leave the carpet */
function carpetMove(c: Creature, gx: number, gz: number, speed: number, dt: number, stopD: number) {
  const cs = CS(), z = zoneOf(c);
  const arrived = cs.moveTo(c, z, gx, gz, speed, dt, stopD);
  const ax = c.x + c.vx * Math.max(dt, 0.016) * 4, az = c.z + c.vz * Math.max(dt, 0.016) * 4;
  if (!isCarpet(z, ax, az)) { stop(c); return true; }
  if (c.speed > 0 && (c.mem.rustleT ?? 0) < G.time) { c.mem.rustleT = G.time + 1.1 + Math.random() * 0.6; sfx(c, 'carpet_rustle', c.speed > 2 ? 0.8 : 0.45); }
  return arrived;
}

function thinkUnderlay(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  const surfaced = c.state === 'emerge';
  instFlags(c, { immortal: !surfaced });
  c.radius = surfaced ? 0.42 : 0.16;
  const f = felt(c);
  if (f) { c.targetId = f.p.id; c.lastSeen = { x: f.p.x, z: f.p.z, t: G.time }; c.mem.feltT = G.time; }
  const T = c.targetId ? G.players.get(c.targetId) ?? null : null;
  switch (c.state) {
    case 'emerge': {
      stop(c);
      if (T) faceTo(c, T.x, T.z);
      if (ev.hurt > 0 || c.stateT > 1.4) { c.setState('flee'); c.goal = null; cs.call(c, 'hurt'); }
      return true;
    }
    case 'flee': {
      if (!c.goal) c.goal = cs.wanderSpot(c, z, 8);
      if (carpetMove(c, c.goal.x, c.goal.z, 3.2, dt, 0.5) || c.stateT > 6) { c.setState('hide'); c.mem.cool = G.time + 4; }
      return true;
    }
    case 'stalk': {
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { c.setState('hide'); return true; }
      if (ev.staggered) { c.setState('flee'); c.goal = null; return true; }
      // lose the trail when the footsteps stop
      if (G.time - (c.mem.feltT ?? 0) > 2.6) { c.setState('hide'); c.targetId = null; return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const moving = T.speed > 0.35 && T.stance !== 'sneak';
      if (d < 1.15 && (moving || G.time - (c.mem.feltT ?? 0) < 0.5) && isCarpet(z, T.x, T.z) && G.time > (c.mem.cool ?? 0)) {
        faceTo(c, T.x, T.z, true); stop(c);
        instFlags(c, { immortal: false }); c.radius = 0.42;
        attack(c, T);
        c.setState('emerge');
        return true;
      }
      const g = c.lastSeen ?? { x: T.x, z: T.z };
      carpetMove(c, g.x, g.z, T.running ? c.sp.run : c.sp.walk, dt, 0.6);
      return true;
    }
    case 'hide':
    case 'wander':
    case 'idle': {
      if (f && G.time > (c.mem.cool ?? 0)) { c.setState('stalk'); cs.call(c, 'alert'); return true; }
      if (ev.staggered) { c.setState('flee'); c.goal = null; return true; }
      if (heardMargin(c) > 6 && G.time > (c.mem.cool ?? 0) && c.lastHeard) { c.goal = { x: c.lastHeard.x, z: c.lastHeard.z }; c.setState('wander'); }
      if (c.state === 'wander') {
        if (!c.goal || carpetMove(c, c.goal.x, c.goal.z, 0.7, dt, 0.5) || c.stateT > 14) c.setState('hide');
      } else {
        stop(c);
        if (c.state !== 'hide') c.setState('hide');
        if (c.stateT > 8 + (c.id.charCodeAt(1) % 7) && cs.rng.chance(dt * 0.2)) { c.goal = cs.wanderSpot(c, z, 6); c.setState('wander'); }
      }
      return true;
    }
    default:
      // e.g. 'chase' after being struck while surfaced: sink and get away
      c.setState('flee'); c.goal = null;
      return true;
  }
}

onPlayerHit('underlay', (p) => {
  p.actions.set(new HeldAction(p, 0.9, 'kneel', 'Grabbed', 0.5));
  bus.emit('think', p, ['Something has my ankle!', 'It pulled me down — under the carpet!', 'Fingers. Through the carpet.'][Math.floor(Math.random() * 3)]);
});

const sp = def({
  key: 'underlay', name: 'Underlay', code: 'E-26 // SUBSTRATE-DWELLER', temperament: 'ambush', threat: 3,
  hp: 38, walk: 2.4, run: 3.6, turn: 6, radius: 0.16, height: 0.3, sight: 0, fov: 3.1, hearing: 1.2, vibration: true,
  attack: { dmg: [6, 12], range: 0.8, cooldown: 2.0, kinds: ['laceration', 'scratch', 'bite'], corrupt: 0.08, knock: -0.35, grab: true, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'] },
  zones: ['lobby', 'office', 'house', 'tunnels', 'hospital'], weight: 2, maxPerZone: 3, diet: 'meat',
  flags: { underCarpet: true },
  sounds: { alert: 'underlay_hiss', attack: 'underlay_grab', hurt: 'underlay_hiss', death: 'underlay_die' },
  scan: {
    cls: 'Subsurface ambusher',
    notes: [
      'No visible body. A bulge under the carpet that moves against the weave.',
      'Blind. Feels footsteps through the floor. Sneaking does not register at all.',
      'Standing still makes it lose you. It cannot follow you onto tile, wood or concrete.',
      'Strikes at ankles, then stays surfaced for a moment. That is the only time a weapon finds it.',
    ],
  },
  gore: { blood: 'dark', tint: 0xb89a8a, sever: ['arm'] },
  build: buildUnderlay,
  animate: animateUnderlay,
  think: thinkUnderlay,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const lunge = q === 'lunge' ? 1 : q === 'idle' ? 0 : Math.max(0, Math.sin(t * 0.9));
  pose(rig, q === 'idle' ? 0.12 : 0.55, lunge, q === 'move' ? 1 : 0, t * 4, t);
};

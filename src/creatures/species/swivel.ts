import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { G } from '../../game/G';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import type { Creature } from '../creature';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import {
  CS, zoneOf, pulse, attack, nearestPlayer, stop, dist, faceTo, findSpot, objectsNear, walkable, anyPlayerSees,
  creatureMenu, poke, poked, heardMargin, suppressSighting, galleryPose, lerp,
} from '../behaviors_a';

// =====================================================================================
// SWIVEL — an office chair that grew a spider into itself. Five caster arms are
// jointed legs, the seat is a mouth, the armrests are fangs, the "tufting
// buttons" on the backrest are eyes. Sits among real chairs and bites ankles.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // the inside of the seat: wet foam, gums and a ring of little flat teeth
  A.add('c_swivel_maw', 32, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x6a1e22, 6, { hueShift: -0.03 });
    pc.fillRamp(R, (x, y) => { const d = Math.hypot(x - 15.5, y - 15.5) / 16; return 0.15 + d * 0.7 + (tileFbm(x, y, 32, 32, 3, 2, 4) - 0.5) * 0.15; }, 0.8);
    pc.ellipse(15.5, 15.5, 5, 4, 0x140406); // throat
    // ribbed palate
    for (let r = 7; r < 13; r += 2) for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; pc.blend(Math.round(15.5 + Math.cos(t) * r), Math.round(15.5 + Math.sin(t) * r * 0.85), R[0], 0.35); }
    // foam stuffing around the rim
    for (let i = 0; i < 32; i++) { pc.set(i, 0, 0xd8c890); pc.set(i, 31, 0xc8b880); pc.set(0, i, 0xd8c890); pc.set(31, i, 0xc8b880); if (ph(i, 3, 2) < 0.5) { pc.set(i, 1, 0xb8a870); pc.set(1, i, 0xb8a870); } }
    // teeth: small, flat and human
    for (let i = 3; i < 29; i += 3) { for (const [x, y] of [[i, 3], [i, 28], [3, i], [28, i]]) { pc.rect(x, y, 2, 2, 0xe8e0c8); pc.set(x + 1, y + 1, 0xb8ae96); } }
  });
  // backrest front: office fabric with a cluster of glossy black "buttons"
  A.add('c_swivel_back', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x4b5f86, 6, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.5 + (((x + y) & 1) ? 0.06 : -0.03) + (tileFbm(x, y, 16, 16, 2, 2, 9) - 0.5) * 0.2 - y * 0.01, 0.7);
    // tufting buttons in a neat grid... plus two that should not be there. They are all wet.
    const eyes: [number, number][] = [[4, 4], [11, 4], [4, 10], [11, 10], [7, 7], [8, 7], [6, 12], [10, 6]];
    for (const [x, y] of eyes) {
      pc.set(x, y, 0x0c0e18);
      pc.set(x, y - 1, R[1]); pc.blend(x + 1, y, R[1], 0.6); pc.blend(x - 1, y, R[1], 0.6); // dimple
    }
    pc.set(7, 7, 0x9aa8c8); pc.set(10, 6, 0x9aa8c8); // the highlights give them away
    for (let x = 1; x < 15; x++) pc.blend(x, 15, R[0], 0.5); // seam
  });
});

const FAB = 'fabric_blue', TINT = { color: 0xb4b8c4 };
const LEG_A = (i: number) => (i / 5) * Math.PI * 2 + 0.31;
const SHIN = 0.58;

function caster(mb: ModelBuilder, y = 0) {
  mb.cylinderX(0, y + 0.026, 0, 0.026, 0.024, 6, 'rubber_black');
  mb.box(0, y + 0.026, 0, 0.034, 0.032, 0.024, 'metal_dark');
}

function buildSwivel(): Rig {
  const rig = newRig(1.0);
  const hub = part(rig, 'hub', rig.body, [0, 0.06, 0], (mb) => {
    mb.cylinder(0, -0.025, 0, 0.05, 0.05, 6, 'plastic_black');
  });
  for (let i = 0; i < 5; i++) {
    const leg = part(rig, 'leg' + i, hub, [0, 0, 0], () => {});
    leg.rotation.y = LEG_A(i);
    const th = part(rig, 'thigh' + i, leg, [0, 0, 0], (mb) => {
      mb.box(0, -0.018, 0.14, 0.045, 0.035, 0.27, 'plastic_black');
      mb.box(0, 0.0, 0.25, 0.03, 0.012, 0.03, 'chrome'); // knuckle cap
    });
    // telescoping inner segment: slides out of the caster arm when it stands up
    const ext = part(rig, 'ext' + i, th, [0, 0, 0], (mb) => {
      mb.box(0, -0.016, 0.15, 0.036, 0.028, 0.24, 'metal_dark');
      mb.box(0, -0.016, 0.265, 0.042, 0.034, 0.03, 'chrome');
    });
    const sh = part(rig, 'shin' + i, ext, [0, 0, 0.27], (mb) => {
      // chrome gas-spring shin with a joint, tapering to the caster
      mb.box(0, -SHIN, 0, 0.026, SHIN, 0.026, 'chrome');
      mb.box(0, -SHIN * 0.45, 0, 0.034, 0.05, 0.034, 'metal_dark');
    });
    part(rig, 'foot' + i, sh, [0, -SHIN, 0], (mb) => caster(mb, -0.045));
  }
  const stem = part(rig, 'stem', rig.body, [0, 0.06, 0], (mb) => {
    mb.cylinder(0, 0.0, 0, 0.022, 0.3, 6, 'chrome');
    mb.cylinder(0, 0.0, 0, 0.032, 0.1, 6, 'plastic_black');
  });
  void stem;
  const seat = part(rig, 'seat', rig.body, [0, 0.36, 0], (mb) => {
    mb.box(0, 0, 0, 0.2, 0.05, 0.22, 'metal_dark');
    mb.box(0.12, 0.01, 0.08, 0.1, 0.012, 0.02, 'plastic_black'); // height lever
    mb.box(0, 0.05, 0.01, 0.5, 0.03, 0.48, 'plastic_black'); // seat pan = lower jaw
    mb.box(0, 0.081, 0.03, 0.44, 0.004, 0.4, { top: 'c_swivel_maw', all: 'plastic_black' }, { fit: { top: true } });
    for (let k = 0; k < 7; k++) mb.box(-0.18 + k * 0.06, 0.08, 0.22, 0.026, 0.035, 0.02, 'white', { color: 0xe4dccb }); // lower teeth
    mb.box(0, 0.02, -0.2, 0.08, 0.04, 0.16, 'metal_dark');
  });
  const cushion = part(rig, 'cushion', seat, [0, 0.08, -0.215], (mb) => {
    mb.box(0, 0, 0.235, 0.48, 0.07, 0.45, FAB, TINT);
    for (let k = 0; k < 7; k++) mb.box(-0.18 + k * 0.06, -0.03, 0.43, 0.024, 0.032, 0.02, 'white', { color: 0xe4dccb }); // upper teeth
  });
  void cushion;
  const back = part(rig, 'back', seat, [0, 0.02, -0.29], (mb) => {
    mb.box(0, 0, 0, 0.07, 0.3, 0.03, 'metal_dark');
    mb.push().translate(0, 0.24, 0).rotateX(-0.13);
    mb.box(0, 0, 0, 0.45, 0.44, 0.07, { south: 'c_swivel_back', all: FAB }, { ...TINT, fit: { south: true } });
    mb.box(0, 0.03, -0.045, 0.41, 0.38, 0.02, 'plastic_black');
    mb.pop();
  });
  void back;
  for (const s of [-1, 1]) {
    part(rig, s < 0 ? 'armL' : 'armR', seat, [s * 0.255, 0.05, -0.03], (mb) => {
      mb.box(0, 0, 0, 0.035, 0.24, 0.045, 'plastic_black');
      mb.box(0, 0.24, 0.02, 0.065, 0.03, 0.27, 'plastic_black');
      mb.box(0, 0.235, 0.16, 0.03, 0.03, 0.05, 'plastic_black'); // the end cap (a fang tip when it unfolds)
    });
  }
  return rig;
}

/** k: 0 = an ordinary office chair, 1 = standing on its legs */
function pose(rig: Rig, k: number, t: number, moving: number, bite: number, phase: number) {
  const P = rig.parts;
  rig.body.position.y = 0.32 * k + (moving ? Math.abs(Math.sin(phase * 2.5)) * 0.03 * k : 0);
  for (let i = 0; i < 5; i++) {
    const off = (i / 5) * Math.PI * 2;
    const lift = moving ? Math.max(0, Math.sin(phase * 2.5 + off)) * k : 0;
    P['thigh' + i].rotation.x = -1.0 * k - lift * 0.35;
    P['ext' + i].position.z = 0.27 * k;
    P['shin' + i].rotation.x = 0.65 * k + lift * 0.3;
    P['shin' + i].scale.y = lerp(0.05, 1.5, k);
    P['foot' + i].position.y = -SHIN * 1; // scaled with the shin
    P['foot' + i].scale.y = 1 / Math.max(0.05, P['shin' + i].scale.y); // keep the caster round
    P['leg' + i].rotation.y = LEG_A(i) + (moving ? Math.sin(phase * 2.5 + off) * 0.18 * k : 0);
  }
  // the seat leans forward like a head; jaw opens when it is about to bite
  P.seat.rotation.x = 0.28 * k + bite * 0.25;
  P.cushion.rotation.x = -(0.12 * k + bite * 0.75);
  P.back.rotation.x = 0.45 * k + Math.sin(t * 7) * 0.03 * k;
  for (const s of [-1, 1]) {
    const a = P[s < 0 ? 'armL' : 'armR'];
    a.rotation.x = 1.15 * k - bite * 0.4;
    a.rotation.z = -s * 0.25 * k + Math.sin(t * 11 + s) * 0.06 * k;
  }
}

function animateSwivel(rig: Rig, c: Creature, t: number, dt: number) {
  const hidden = c.state === 'disguised' || (c.state === 'hide' && !c.dead);
  suppressSighting(c, c.state === 'disguised');
  const target = hidden || c.dead ? 0 : 1;
  c.mem._rv = c.mem._rv === undefined ? target : c.mem._rv + Math.sign(target - c.mem._rv) * Math.min(Math.abs(target - c.mem._rv), dt * (target ? 5 : 1.6));
  const bite = c.attackPhase > 0 ? 1 : c.state === 'chase' ? 0.3 + Math.sin(t * 9) * 0.2 : 0;
  pose(rig, c.mem._rv, t, c.speed > 0.2 ? 1 : 0, bite, c.phase);
}

/** a dark spot next to real chairs and desks, away from survivors */
function hideSpot(c: Creature): { x: number; z: number } | null {
  const z = zoneOf(c), rng = CS().rng;
  const props = objectsNear(z, c.x, c.z, 16, (o, d) => (d.tags?.includes('chair') || d.tags?.includes('desk') || /chair|desk/.test(o.key)) && dist(o.x + 0.5, o.y + 0.5, c.x, c.z) > 5, 24);
  rng.shuffle(props);
  for (const o of props.slice(0, 8)) {
    for (const [dx, dy] of rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as [number, number][])) {
      const x = o.x + dx, y = o.y + dy;
      if (!walkable(z, x, y) || z.objectsAt(x, y).length) continue;
      const near = nearestPlayer(c, 6, () => true);
      if (near && dist(near.p.x, near.p.z, x + 0.5, y + 0.5) < 5) continue;
      if (anyPlayerSees(c.zoneKey, x + 0.5, y + 0.5, 14)) continue;
      return { x: x + 0.5, z: y + 0.5 };
    }
  }
  return findSpot(c, { rMin: 6, rMax: 16, dark: 0.35, unseen: true }) || findSpot(c, { rMin: 6, rMax: 16, unseen: true }) || CS().fleeSpot(c, z, c.x, c.z);
}

function thinkSwivel(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  const T = c.targetId ? G.players.get(c.targetId) : null;
  switch (c.state) {
    case 'disguised': {
      stop(c);
      const by = poked(c, 'sit');
      let victim = by ? G.players.get(by) ?? null : null;
      const np = nearestPlayer(c, 2.2, (p) => !p.body.dead);
      if (!victim && np) {
        const close = np.p.stance === 'sneak' ? 0.95 : 1.75;
        if (np.d < close && (np.p.speed > 0.2 || np.d < 1.0)) victim = np.p;
      }
      if (!victim && ev.staggered && np) victim = np.p;
      if (!victim && heardMargin(c) > 9 && np && np.d < 3) victim = np.p;
      if (victim) {
        c.targetId = victim.id; c.mem.bites = 0;
        c.setState('chase'); cs.call(c, 'alert');
        return true;
      }
      // the chair has turned to face you since you last looked
      if (!c.observed && c.stateT > 6 && CS().rng.chance(dt * 0.05)) {
        const p = nearestPlayer(c, 10); if (p) faceTo(c, p.p.x, p.p.z, true);
        c.stateT = 0;
      }
      return true;
    }
    case 'chase': {
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { c.setState('flee'); c.goal = hideSpot(c); return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const b = c.mem.bites ?? 0;
      if ((b >= 2 || (b >= 1 && d < 1.4)) && c.attackT < (c.sp.attack!.cooldown - 0.35)) { c.setState('flee'); c.goal = hideSpot(c); return true; }
      if (c.stateT > 5 || d > 8 || c.hp < c.sp.hp * 0.45) { c.setState('flee'); c.goal = hideSpot(c); return true; }
      const reach = (c.sp.attack?.range ?? 0.7) + T.radius;
      if (d <= reach) {
        faceTo(c, T.x, T.z); stop(c);
        if (c.attackT <= 0) {
          attack(c, T); c.mem.bites = (c.mem.bites ?? 0) + 1;
          // lunge at the ankles so a walking victim does not simply step out of the bite
          const dd = Math.max(0.1, d); c.vx = ((T.x - c.x) / dd + T.vx * 0.15) * 5; c.vz = ((T.z - c.z) / dd + T.vz * 0.15) * 5;
        }
        return true;
      }
      cs.moveTo(c, z, T.x, T.z, c.sp.run, dt, reach * 0.8);
      return true;
    }
    case 'flee': {
      if (!c.goal) c.goal = hideSpot(c);
      if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run * 0.9, dt, 0.35) || c.stateT > 10) {
        c.setState('hide'); stop(c);
      }
      if (c.stateT > 0.5 && c.noiseCooldown <= 0) { cs.call(c, 'alert'); c.noiseCooldown = 3; }
      return true;
    }
    case 'hide': {
      stop(c);
      if (ev.hurt > 0) { c.setState('chase'); return true; }
      if (!c.observed && c.stateT > 1.5) {
        c.setState('disguised'); c.awareness.clear(); c.targetId = null;
        c.facing = c.targetFacing = Math.floor(CS().rng.next() * 8) * (Math.PI / 4);
      } else if (c.stateT > 12) { c.setState('flee'); c.goal = hideSpot(c); }
      return true;
    }
    default:
      c.setState('flee'); c.goal = hideSpot(c);
      return true;
  }
}

creatureMenu('swivel', (p, c, opts) => {
  if (c.state !== 'disguised') return;
  opts.push({ label: 'Sit down', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Sit', 0.5, 'pickup', () => poke(p, c, 'sit')), 1.2, false) });
});

const sp = def({
  key: 'swivel', name: 'Swivel', code: 'E-23 // ARACH-ERGONOMIC', temperament: 'ambush', threat: 2,
  hp: 24, walk: 1.6, run: 6.6, turn: 16, radius: 0.32, height: 1.05, sight: 6, fov: 2.6, hearing: 1.0, vibration: true,
  attack: { dmg: [4, 9], range: 0.85, cooldown: 0.9, kinds: ['bite', 'laceration', 'scratch'], corrupt: 0.05, knock: 0.2, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'] },
  zones: ['office', 'school', 'market'], weight: 3, group: [1, 2], maxPerZone: 5, diet: 'meat',
  flags: { furniture: 'chair_office' },
  sounds: { alert: 'swivel_skitter', attack: 'swivel_bite', hurt: 'chair_squeak', death: 'swivel_die', step: 'plastic_tap' },
  scan: {
    cls: 'Ambush mimic / furniture',
    notes: [
      'An office chair. Five legs, eight eyes in the backrest tufting, a mouth under the cushion.',
      'Lunges when someone walks right past it. Sneaking past at arm\'s length is usually safe.',
      'Bites once — always low, ankles and shins — then skitters off to hide among other chairs.',
      'A chair that faces you when it did not before is not a chair. Kick it before it moves.',
    ],
  },
  gore: { blood: 'oil', sever: ['leg0', 'leg1', 'leg2', 'leg3', 'leg4', 'armL', 'armR'], head: 'back' },
  build: buildSwivel,
  animate: animateSwivel,
  think: thinkSwivel,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const k = q === 'disguised' ? 0 : q === 'revealed' ? 1 : q === 'bite' ? 1 : (Math.sin(t * 0.8) * 0.5 + 0.5);
  pose(rig, k, t, q === 'walk' ? 1 : 0, q === 'bite' ? 1 : 0, t * 6);
};

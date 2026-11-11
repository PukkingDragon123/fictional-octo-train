import * as THREE from 'three';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { ph } from '../../gfx/pixel';
import { HumanRig, SKIN_TONES, type Appearance, type Outfit, type Pose as HPose } from '../../entities/humanRig';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, stop, faceTo, attack, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn } from '../behaviors_b';
import { flinchOf, clamp01, hash } from '../kit/humanoids';
import { tgOf, isCalm, provoked, verdict, type Disposition } from '../temper';

// =====================================================================================
// THE PARTITION HERMIT — an office worker who never left the desk. The place grew the
// workstation onto them: the cubicle's fabric partitions have fused to the spine and
// the shoulder blades and become a shell, raw pink seams where board meets skin,
// memos still pinned to it, a nameplate, a coat hook. It lives on all fours under
// the shell like a hermit crab in a corner of the floor it has decided is its own,
// and it keeps things there: mugs, staplers, a phone, a photo. It wants nothing
// from you but distance. Walk past and it watches. Come into its corner and it rears
// up under the shell, rattles the panels and hisses through its teeth; keep coming
// and it rakes at you, then pulls itself back under the boards.
//   hermit   the one human base (HumanRig: same body, face and paint as every unit),
//            in a shirt and slacks gone to rags; the shell is built on the chest bone:
//            bent partition panels in a painted cubicle fabric, aluminium trim, pinned
//            paper, and the fleshy seams where it has grown in
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildHermit(variant 0..2)                         -> HermitRig (rig.root into any scene; rig.hr is the HumanRig)
//   poseHermit(rig, t, dt, pose, { speed })
//     pose: 'crouch' | 'crawl' | 'withdraw' | 'rattle' | 'rake' | 'hoard' | 'dead'
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // cubicle fabric: a blue-grey basket weave, faded in the middle, coffee rings, pin holes, a grey lint bloom
  A.add('c_cubicle_fabric', 32, 32, (pc) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const w = ((x >> 1) + (y >> 1)) & 1 ? ((x & 1) ? 0 : 1) : ((y & 1) ? 0 : 1);
      const n = ph(x, y, 17), fade = Math.hypot(x - 16, y - 12) / 22;
      const base = [0x3e4a5a, 0x46536a, 0x506078, 0x5a6a82][Math.max(0, Math.min(3, Math.floor(1 + w + (n - 0.5) * 1.5 + (1 - fade) * 0.8)))];
      pc.set(x, y, base);
    }
    for (const [cx, cy, r] of [[9, 22, 4], [22, 8, 3]] as const) for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; pc.blend(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 0x6a4a2a, 0.55); }
    for (let i = 0; i < 9; i++) pc.set(Math.floor(ph(i, 1, 3) * 32), Math.floor(ph(i, 2, 3) * 32), 0x1a1e24);
  });
  // where the board has grown into the back: raw pink, a ridge of scar, dark wet in the cracks
  A.add('c_hermit_seam', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = ph(x, y, 23), ridge = Math.abs(Math.sin((x + y * 0.4) * 0.8));
      pc.set(x, y, n < 0.12 ? 0x3a0a10 : ridge > 0.85 ? 0xf0b8b0 : n < 0.5 ? 0xc0606a : 0xd88080);
    }
  });
  // a pinned memo: ruled paper, a few lines of handwriting, a red pin
  A.add('c_hermit_memo', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, y % 3 === 0 ? 0xc8d4e0 : 0xf2eee0);
    for (let y = 3; y < 14; y += 3) for (let x = 2; x < 4 + Math.floor(ph(y, 5, 9) * 11); x++) if (ph(x, y, 4) < 0.7) pc.set(x, y - 1, 0x2a3a6a);
    pc.set(7, 1, 0xc82020); pc.set(8, 1, 0xe84040);
  });
});

const PEOPLE: { app: Appearance; outfit: Outfit }[] = [
  { app: { skin: SKIN_TONES[1], hair: 0x3a2a1a, hairStyle: 'short', face: 3, build: 'average', height: 0.98, bodyShape: 0.15, eyeColor: 0x4a3a2a, facialHair: 'stubble', freckles: 0, scars: 1, age: 0.55 },
    outfit: { torso: { tex: 'c_shirt_button', color: 0xd8d4c4 }, legs: { tex: 'c_slacks', color: 0x2a2c34 }, legsKind: 'pants', feet: { tex: 'c_shoes_dress', color: 0x1a1612 }, cond: { dirt: 3, pale: 2, expr: '', blood: { torso: 1, hand_l: 1 } } } },
  { app: { skin: SKIN_TONES[4], hair: 0x0e0a08, hairStyle: 'bob', face: 7, build: 'slim', height: 0.95, bodyShape: 0.8, eyeColor: 0x2a1a10, facialHair: 'none', freckles: 0, scars: 1, age: 0.45 },
    outfit: { torso: { tex: 'c_shirt_stripe', color: 0xc8d0dc }, legs: { tex: 'c_skirt', color: 0x2e2a30 }, legsKind: 'skirt', feet: { tex: 'c_shoes_dress', color: 0x2a1a14 }, cond: { dirt: 3, pale: 1, expr: '', blood: { hand_r: 1 } } } },
  { app: { skin: SKIN_TONES[2], hair: 0x6a6a64, hairStyle: 'short', face: 1, build: 'broad', height: 1.0, bodyShape: 0.1, eyeColor: 0x3a4a5a, facialHair: 'moustache', freckles: 0.2, scars: 1, age: 0.75 },
    outfit: { torso: { tex: 'c_shirt', color: 0xb8c4a8 }, legs: { tex: 'c_slacks', color: 0x3a3428 }, legsKind: 'pants', feet: { tex: 'c_shoes_dress', color: 0x2a2018 }, cond: { dirt: 3, pale: 2, expr: '', blood: { torso: 1 } } } },
];

// ------------------------------------------------------------------ the shell (on the chest bone; the back faces -z)
const SHELLS = new Map<number, THREE.BufferGeometry>();
function shellGeo(v: number): THREE.BufferGeometry {
  let g = SHELLS.get(v);
  if (g) return g;
  const mb = new ModelBuilder();
  const TRIM = { color: 0xa8aeb4 };
  // one partition panel, bent along its length into three facets, trimmed in aluminium
  const panel = (w: number, h: number, bend: number, seed: number) => {
    for (let i = 0; i < 3; i++) {
      const y0 = (i - 1) * (h / 3);
      mb.push().translate(0, y0, -Math.abs(i - 1) * bend * 0.5).rotateX((i - 1) * bend);
      mb.box(0, 0, 0, w, h / 3 + 0.004, 0.045, 'c_cubicle_fabric', { uvScale: 1.6 });
      mb.box(-w / 2 - 0.008, 0, 0, 0.016, h / 3 + 0.004, 0.05, 'white', TRIM);
      mb.box(w / 2 + 0.008, 0, 0, 0.016, h / 3 + 0.004, 0.05, 'white', TRIM);
      mb.pop();
    }
    mb.box(0, h / 2 + 0.008, -bend * 0.5, w + 0.03, 0.016, 0.05, 'white', TRIM);
    mb.box(0, -h / 2 - 0.008, -bend * 0.5, w + 0.03, 0.016, 0.05, 'white', TRIM);
    // what is still pinned to it
    for (let k = 0; k < 3; k++) if (hash(seed, k) < 0.75) mb.box((hash(seed + k, 3) - 0.5) * w * 0.7, (hash(seed + k, 4) - 0.5) * h * 0.6, -0.026, 0.07 + hash(k, seed) * 0.05, 0.09, 0.004, 'c_hermit_memo');
  };
  // the roof: two panels in a shallow ridge along the spine, a third laid across the hips, a short side panel
  mb.push().translate(0.13, 0.02, -0.17).rotateZ(-0.55).rotateY(Math.PI); panel(0.34, 0.62, 0.12, v * 7 + 1); mb.pop();
  mb.push().translate(-0.13, 0.02, -0.17).rotateZ(0.55).rotateY(Math.PI); panel(0.34, 0.62, 0.12, v * 7 + 2); mb.pop();
  mb.push().translate(0, -0.32, -0.13).rotateX(-0.9).rotateY(Math.PI); panel(0.42, 0.28, 0.05, v * 7 + 3); mb.pop();
  if (v !== 1) { mb.push().translate(0.24, 0.04, -0.1).rotateZ(-0.95).rotateY(Math.PI); panel(0.2, 0.36, 0.04, v * 7 + 4); mb.pop(); }
  // a nameplate on the ridge, a coat hook, a lanyard caught on the edge
  mb.box(0, 0.22, -0.28, 0.14, 0.035, 0.01, 'white', { color: 0x2a2a2e });
  mb.box(0, 0.22, -0.286, 0.11, 0.012, 0.002, 'white', { color: 0xd8c890 });
  mb.box(0.02, -0.05, -0.29, 0.012, 0.07, 0.012, 'white', TRIM);
  mb.box(0.02, -0.02, -0.31, 0.012, 0.012, 0.04, 'white', TRIM);
  // the seams: where the frame has grown into the back, raw and ridged
  for (let i = 0; i < 12; i++) {
    const a = (i / 11) - 0.5;
    mb.sphere(Math.sign(a || 1) * (0.07 + Math.abs(a) * 0.08), 0.24 - (i % 6) * 0.1, -0.1 - Math.abs(a) * 0.02, 0.028 + hash(i, v) * 0.012, 6, 4, 'c_hermit_seam', { sy: 0.6 });
  }
  g = mb.build();
  SHELLS.set(v, g);
  return g;
}

export interface HermitRig extends Rig { hr: HumanRig; shell: THREE.Mesh; v: number; m: Record<string, any> }
const POOL: HermitRig[] = [];
function newRig(v: number): HermitRig {
  const P = PEOPLE[v % PEOPLE.length];
  const hr = new HumanRig(P.app, worldMaterial({}));
  hr.setOutfit(P.outfit);
  hr.setExpression('fear');
  (hr.skin as any).clone = () => new THREE.Group();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(hr.root);
  const shell = new THREE.Mesh(shellGeo(v), worldMaterial({}));
  shell.castShadow = true; shell.receiveShadow = true; (shell as any).clone = () => shell.clone();
  hr.j.chest.add(shell);
  // a back grown round to carry it
  hr.j.spine.scale.setScalar(1.06);
  return { root, body, parts: { ...hr.j, shell }, headY: 0.7, hr, shell, v, m: {} };
}
function adopt(R: HermitRig, v: number) {
  if (R.v === v) return;
  R.v = v; const P = PEOPLE[v];
  R.hr.setAppearance(P.app); R.hr.setOutfit(P.outfit);
  R.shell.geometry = shellGeo(v);
}
function buildPooled(): Rig {
  for (const r of POOL) if (!r.root.parent) { r.root.userData = {}; r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0); r.root.scale.set(1, 1, 1); r.body.visible = true; r.m = {}; return r; }
  const r = newRig(0); POOL.push(r); return r;
}
export function buildHermit(variant = 0): HermitRig { return newRig(((variant % 3) + 3) % 3); }

// ------------------------------------------------------------------ poses (on all fours under the shell)
export type HermitPose = 'crouch' | 'crawl' | 'withdraw' | 'rattle' | 'rake' | 'hoard' | 'dead';
const set = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { (p as any)[j] = [x, y, z]; };
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
interface HDrive { t: number; dt: number; md: HermitPose; speed: number; seed: number; flinch: number; rake: number }
function poseH(R: HermitRig, d: HDrive) {
  const ud = R.m as Record<string, number>, t = d.t, dt = Math.min(0.05, Math.max(0, d.dt));
  const is = (m: HermitPose) => (d.md === m ? 1 : 0);
  const wd = sm(ud, 'wd', is('withdraw') + is('dead') * 0.6, 4, dt), rt = sm(ud, 'rt', is('rattle'), 6, dt), hd = sm(ud, 'hd', is('hoard'), 3, dt), rk = sm(ud, 'rk', d.rake, 14, dt);
  const go = clamp01(d.speed / 0.6) * (1 - wd);
  ud.ph = (ud.ph ?? 0) + dt * (d.speed / 0.38) * Math.PI;
  const s = Math.sin(ud.ph), c = Math.cos(ud.ph);
  const P: HPose = {};
  // hands and knees, the shell riding the back; withdrawn, folded flat under the boards; rattling, reared up
  P.bodyPitch = 1.32 + wd * 0.18 - rt * 0.38 - hd * 0.5 - rk * 0.25;
  P.rootY = -0.5 - wd * 0.14 + rt * 0.06 + hd * 0.05 + Math.abs(c) * 0.015 * go;
  P.bodyY = 0.0;
  set(P, 'hips', 0, -s * 0.06 * go, 0);
  set(P, 'spine', 0.12 + wd * 0.2, s * 0.08 * go, Math.sin(t * 31) * 0.05 * rt);
  set(P, 'chest', 0.1 + wd * 0.15, -s * 0.06 * go, Math.sin(t * 27 + 1) * 0.06 * rt);
  set(P, 'neck', -0.4 + wd * 0.9 - rt * 0.2, Math.sin(t * 0.6 + d.seed) * 0.3 * (1 - wd) * (1 - rt), 0);
  set(P, 'head', -0.75 + wd * 1.0 - rt * 0.15 + hd * 0.5, Math.sin(t * 0.9 + d.seed) * 0.25 * (1 - wd) + rt * Math.sin(t * 9) * 0.15, 0);
  const armL = -1.3 + s * 0.4 * go - wd * 0.7 + hd * 0.4, armR = -1.3 - s * 0.4 * go - wd * 0.7 + hd * 0.4;
  set(P, 'uarmL', armL - rt * 0.3, 0, 0.12 + rt * 0.75 + wd * 0.1); set(P, 'uarmR', armR - rt * 0.3 - rk * 1.0, 0, -0.12 - rt * 0.75 - wd * 0.1 + rk * 0.3);
  set(P, 'farmL', -0.15 - Math.max(0, c) * 0.5 * go - wd * 1.6 - hd * 1.4 - rt * 0.6, 0, 0); set(P, 'farmR', -0.15 - Math.max(0, -c) * 0.5 * go - wd * 1.6 - hd * 1.0 - rt * 0.6 + rk * 0.5, 0, 0);
  set(P, 'handL', 0.8 * (1 - hd), 0, 0); set(P, 'handR', 0.8 * (1 - hd) - rk * 0.8, 0, 0);
  set(P, 'thighL', -1.3 - s * 0.35 * go + wd * 0.1, 0, 0.1); set(P, 'thighR', -1.3 + s * 0.35 * go + wd * 0.1, 0, -0.1);
  set(P, 'shinL', 1.55 + Math.max(0, s) * 0.3 * go, 0, 0); set(P, 'shinR', 1.55 + Math.max(0, -s) * 0.3 * go, 0, 0);
  set(P, 'footL', 0.5, 0, 0); set(P, 'footR', 0.5, 0, 0);
  P.gripL = 0.5 + rt * 0.4 + hd * 0.3; P.gripR = 0.5 + rt * 0.4 + rk * 0.5;
  if (d.flinch > 0) P.rootX = Math.sin(t * 70) * 0.025 * d.flinch;
  R.hr.applyPose(P);
  R.hr.faceTick(dt);
  // the panels: they rattle in the display (a fast shiver), and settle as it breathes
  R.shell.rotation.set(Math.sin(t * 1.4 + d.seed) * 0.02 + rt * Math.sin(t * 38) * 0.06, rt * Math.sin(t * 33) * 0.05, rt * Math.sin(t * 29 + 2) * 0.07);
}
export function poseHermit(rig: HermitRig, t: number, dt: number, pose: HermitPose = 'crouch', o: { speed?: number } = {}) {
  poseH(rig, { t, dt, md: pose, speed: o.speed ?? (pose === 'crawl' ? 0.5 : 0), seed: 0.7, flinch: 0, rake: pose === 'rake' ? Math.max(0, Math.sin(t * 4)) : 0 });
}

// ------------------------------------------------------------------ game animation
function animateHermit(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as HermitRig;
  adopt(R, Math.floor(hashId(c.id) * 3));
  const n = netOf(c);
  const md: HermitPose = c.dead ? 'dead' : (n.md as HermitPose) || (c.speed > 0.05 ? 'crawl' : 'crouch');
  const exp = md === 'rattle' ? 'angry' : md === 'withdraw' ? 'fear' : 'sleepy';
  if (R.m.exp !== exp) { R.m.exp = exp; R.hr.setExpression(exp); }
  poseH(R, { t, dt, md, speed: c.dead ? 0 : c.speed, seed: hashId(c.id, 2) * 5, flinch: flinchOf(c), rake: c.attackPhase > 0 ? 1 : 0 });
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 6) thinkOnce(p, 'hermit', ['Someone under a cubicle wall. It is growing out of their back.', 'They have a little hoard: mugs, a stapler, a photo. This corner is theirs.'][Math.floor(t * 0.2) % 2], 120);
}

// ------------------------------------------------------------------ host brain: keep the corner, warn, rake, withdraw
const DISP: Disposition = { mood: 'territorial', territory: 4.5, warn: 2.6, calm: 3, self: true };
type Mode = 'keep' | 'rattle' | 'withdraw' | 'flee';
const setMd = (c: Creature, md: HermitPose | '') => { const n = net(c); n.md = md || undefined; };
function thinkHermit(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, ev = pulse(c), tg = tgOf(c);
  m.mT = (m.mT ?? 0) + dt;
  const go = (md: Mode) => { if (m.mode !== md) { m.mode = md; m.mT = 0; } };
  if (!m.mode) go('keep');
  // struck: into the shell (the boards take most of it), and the next one that comes close gets raked
  if (ev.hurt > 0) {
    tg.prov = G.time + 20;
    if (m.mode === 'withdraw') { const back = ev.hurt * 0.6; c.hp = Math.min(c.sp.hp, c.hp + back); c.mem._hp = c.hp; playAt('dmg_break_fabric', c, 0.7, 12); }
    else { go(c.hp < c.sp.hp * 0.35 ? 'flee' : 'withdraw'); playAt('cube_hiss', c, 0.8, 12); }
  }
  let near: Player | null = null, nd = 99;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < nd) { nd = d; near = p; } }
  const homeD = near ? Math.hypot(near.x - c.home.x, near.z - c.home.z) : 99;
  switch (m.mode as Mode) {
    case 'withdraw': {
      c.setState('hide'); stop(c); setMd(c, 'withdraw');
      if (near && nd < 1.4 && provoked(c) && c.attackT <= 0) { go('rattle'); return true; }
      if (m.mT > 5 && (!near || nd > 3)) go('keep');
      return true;
    }
    case 'flee': {
      c.setState('flee'); setMd(c, 'crawl');
      if (!c.goal || m.mT < dt * 1.5) c.goal = cs.fleeSpot(c, z, near?.x ?? c.x, near?.z ?? c.z);
      if (cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.6) || m.mT > 8) { go('withdraw'); c.home = { x: c.x, z: c.z }; }
      return true;
    }
    case 'rattle': {
      // the display: reared under the shell, panels shivering, a hiss through the teeth; then a rake if you keep coming
      c.setState('warn'); stop(c); setMd(c, 'rattle');
      if (!near) { go('keep'); return true; }
      faceTo(c, near.x, near.z);
      if ((m.hT = (m.hT ?? 0) - dt) <= 0) { m.hT = 0.9 + rng.next() * 0.6; playAt('cube_hiss', c, 0.7, 12, 0.8 + rng.next() * 0.2); playAt('dmg_debris_soft', c, 0.4, 10, 1.4); }
      if (m.mT < dt * 1.5) { tg.warnedAt = G.time; m.d0 = nd; if (near.isLocal) bus.emit('think', near, ['It reared up under the boards and it is hissing at me. Its corner. Back off.', 'The panels are rattling. It wants me out of its space.'][Math.floor(Math.random() * 2)]); }
      if ((nd < 1.25 || (provoked(c) && nd < 1.8) || (m.d0 - nd > 0.9 && m.mT > 0.8)) && c.attackT <= 0) { attack(c, near); go('withdraw'); return true; }
      if (homeD > (DISP.territory ?? 4.5) + 0.5 && nd > 3) { go('keep'); if (near.isLocal) thinkOnce(near, 'hermit_ok', 'It settles back down under its walls. Fine. It is all yours.', 30); return true; }
      if (m.mT > 6) go('keep');
      return true;
    }
    default: {
      // keeping its corner: shuffling about it, sorting the hoard, watching anyone who passes
      if (near && G.time > (m.calm ?? 0)) {
        const v = verdict(c, DISP, near);
        if (v !== 'ignore' && (homeD < (DISP.territory ?? 4.5) || nd < 2)) { go('rattle'); return true; }
        if (nd < 6) { c.setState('watch'); stop(c); setMd(c, 'crouch'); faceTo(c, near.x, near.z); return true; }
      }
      const hd = Math.hypot(c.x - c.home.x, c.z - c.home.z);
      if (m.hoard) { c.setState('idle'); stop(c); setMd(c, 'hoard'); if (m.mT > m.hoardT) { m.hoard = 0; m.mT = 0; } return true; }
      c.setState('wander'); setMd(c, '');
      if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.4) || m.mT > 12) {
        if (c.goal && rng.chance(0.55)) { m.hoard = 1; m.hoardT = 4 + rng.next() * 7; m.mT = 0; c.goal = null; return true; }
        const a = rng.next() * Math.PI * 2, r = hd > 3 ? 0 : 0.8 + rng.next() * 2.2;
        c.goal = { x: c.home.x + Math.cos(a) * r, z: c.home.z + Math.sin(a) * r }; m.mT = 0;
      }
      void isCalm;
      return true;
    }
  }
}

const HERMIT = def({
  key: 'hermit', name: 'Partition Hermit', code: 'OF-14 // REMNANT, ENCRUSTED (FORMERLY HUMAN)', temperament: 'territorial', threat: 1,
  rule: { name: 'ITS CORNER', text: 'It keeps a few metres of floor as its own. Walk past and it only watches. Step into its corner and it rears up and rattles its panels: that is the warning. Keep coming and it rakes you, then hides under the boards, which take most of a blow.', tell: 'A cubicle wall on the floor, moving. There is someone under it.' },
  hp: 90, walk: 0.55, run: 1.4, turn: 3, radius: 0.36, height: 0.75, sight: 8, fov: 2.0, hearing: 1.0,
  attack: { dmg: [6, 11], range: 1.0, cooldown: 2.2, kinds: ['scratch', 'laceration'], corrupt: 0, knock: 0.4, parts: ['hand_l', 'hand_r', 'farm_l', 'farm_r', 'shin_l', 'shin_r'] },
  zones: ['office', 'annex', 'hospital', 'lab', 'mall', 'school', 'showroom'], weight: 1, group: [1, 1], maxPerZone: 3, diet: 'items',
  meat: [['cut_gristle', 2]],
  disposition: DISP,
  sounds: { alert: 'cube_hiss', hurt: 'dmg_break_fabric', death: 'body_thud', idle: 'chair_squeak' },
  scan: {
    cls: 'Remnant / encrusted human',
    notes: [
      'Formerly an office worker. Cubicle partitions have fused to the spine and shoulder blades and become a shell.',
      'It lives on all fours in a corner it has claimed, and hoards office things there.',
      'It ignores a unit that passes by. Inside its corner it rears and rattles the panels: a warning.',
      'Pressed, it rakes with its nails, then withdraws under the boards, which take most of a blow.',
    ],
  },
  gore: { blood: 'red', flesh: 0xb85a5a, sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR'], head: 'head', gib: false },
  build: buildPooled, animate: animateHermit, think: thinkHermit,
});
(HERMIT as any).handlesSevered = true;
onPlayerHit('hermit', (p) => { bus.emit('think', p, ['Its nails are long and yellow and they went right through the sleeve.', 'It raked me and pulled straight back under the boards.'][Math.floor(Math.random() * 2)]); });
const GAL: HermitPose[] = ['crouch', 'crawl', 'rattle', 'rake', 'withdraw', 'hoard'];
HERMIT.animateGallery = (rig: Rig, t: number) => {
  const q = (new URLSearchParams(location.search).get('pose') || GAL[Math.floor(t / 3) % GAL.length]) as HermitPose;
  poseHermit(rig as HermitRig, t, 1 / 60, q);
};
void hash;

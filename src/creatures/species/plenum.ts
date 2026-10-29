import { horrify } from '../kit/horror';
import { kitCanvas, sores, drips, flay, RAW, BLOOD } from '../kit/rot';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp } from '../../gfx/pixel';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { TF } from '../../world/zone';
import type { Zone } from '../../world/zone';
import { WALL_H } from '../../world/defs';
import {
  net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, playAt, live, localIn, thinkOnce, pickReach, walkable,
} from '../behaviors_b';
import { pulse, instFlags, hideRig } from '../behaviors_a';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, V3, Wt, buildKitRig, kitSync, kitPersonalize, frames, pathFrames, ellipsoid,
  gauss, lostParts, attackCurve, flinchOf, hash, addV, scl,
} from '../kit/humanoids';
import { defDread } from '../dread';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ph } from '../../gfx/pixel';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// PLENUM — it lives in the space above the drop ceiling, where the cables
// run. You hear it first: a dry run of clicks crossing the tiles over your
// head, dust sifting down in the light. Then a panel lifts, and it drops out
// onto the floor in a heap of too many joints, eight limbs with four elbows
// each, a face set upside-down on the front of it. It is fast on the floor,
// but it does not like it there; when it has bitten someone, or been hurt, it
// goes back up.
// =====================================================================================

addTextureModule(() => {
  // a drop-ceiling panel: fissured mineral fibre, a water stain, the grid edge
  atlas().add('c_ceiling_panel', 20, 20, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const n = ph(x, y, 41), m = ph(x >> 1, y >> 1, 43);
      let c = n < 0.12 ? 0xb8b2a4 : n < 0.2 ? 0xc8c2b4 : 0xe0dccf;
      if (m < 0.1) c = 0xa8a294;
      if (Math.hypot(x - 13, y - 7) < 4.5) c = (c & 0xfefefe) >> 0 === c ? 0xc8b890 : c; // an old leak
      if (x === 0 || y === 0 || x === 19 || y === 19) c = 0xd8d8d0;
      pc.set(x, y, c);
    }
  }, 0.6, 0.6);
});

const LEGS = 8;
const LEG_Z = [0.26, 0.09, -0.09, -0.26];
const LEG_A = [0.75, 0.25, -0.25, -0.75];
function legDir(i: number): [number, number] { const j = i >> 1, k = i & 1 ? -1 : 1; const a = LEG_A[j]; return [k * Math.cos(a), Math.sin(a)]; }

function bonesP(v: number): BoneSpec[] {
  const L = 1 + (v % 3) * 0.06;
  const b: BoneSpec[] = [
    { name: 'pelvis', parent: '', at: [0, 0.46, 0] },
    { name: 'thorax', parent: 'pelvis', at: [0, 0.02, 0.2], cap: true },
    { name: 'head', parent: 'thorax', at: [0, -0.04, 0.24], cap: true },
    { name: 'jaw', parent: 'head', at: [0, -0.02, 0.06] },
    { name: 'abdomen', parent: 'pelvis', at: [0, 0.02, -0.22], cap: true },
  ];
  for (let i = 0; i < LEGS; i++) {
    const j = i >> 1, k = i & 1 ? -1 : 1;
    const [dx, dz] = legDir(i);
    const parent = j === 0 ? 'thorax' : j === 3 ? 'abdomen' : 'pelvis';
    const base: V3 = j === 0 ? [k * 0.09, -0.01, 0.06] : j === 3 ? [k * 0.09, -0.01, -0.04] : [k * 0.11, -0.01, LEG_Z[j]];
    b.push(
      { name: 'leg' + i, parent, at: base, cap: true },
      { name: 'shin' + i, parent: 'leg' + i, at: [dx * 0.3 * L, 0.24, dz * 0.3 * L], cap: true },
      { name: 'tars' + i, parent: 'shin' + i, at: [dx * 0.32 * L, -0.18, dz * 0.32 * L] },
      { name: 'tip' + i, parent: 'tars' + i, at: [dx * 0.1 * L, -0.42, dz * 0.1 * L] },
    );
  }
  return b;
}
function layoutP(p: Page) {
  p.reg('BODY', 72, 72);
  p.reg('HEAD', 56, 40);
  p.reg('LEG', 16, 96);
  p.reg('CAP', 16, 16);
}

function buildP(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  // the body: a ribbed pod lying along z, thicker at the thorax
  const zs = [-0.5, -0.44, -0.34, -0.22, -0.1, 0.02, 0.14, 0.24, 0.32, 0.38];
  const rad = [0.02, 0.08, 0.12, 0.125, 0.11, 0.13, 0.14, 0.12, 0.09, 0.05];
  const pts: V3[] = zs.map((z) => [0, 0.47 + gauss(z, -0.3, 0.12) * 0.04, z]);
  const w = (i: number): Wt => {
    const z = zs[i];
    if (z < -0.28) return [bi('abdomen'), 1];
    if (z < -0.14) return [bi('abdomen'), 0.5, bi('pelvis'), 0.5];
    if (z < 0.12) return [bi('pelvis'), 1];
    if (z < 0.22) return [bi('pelvis'), 0.5, bi('thorax'), 0.5];
    return [bi('thorax'), 1];
  };
  const fr = pathFrames(pts, rad.map((r) => [r * 1.15, r * 0.8] as [number, number]), w, [0, 1, 0]);
  for (const f of fr) f.bump = (a) => 0.12 * Math.pow(Math.max(0, Math.sin(f.c[2] * 60)), 2) * Math.max(0, Math.sin(a + Math.PI / 2));
  frames(B, fr, 10, R('BODY'), 1, { start: true, end: true });
  // the head: under the front, a face set upside down in it
  const hp = x.rest('head');
  // (a human-sized head, far too big for the body that carries it)
  ellipsoid(B, [hp[0], hp[1] + 0.01, hp[2] + 0.05], [0.125, 0.115, 0.115], 10, 6, R('HEAD'), [bi('head'), 1], 3);
  ellipsoid(B, [hp[0], hp[1] - 0.04, hp[2] + 0.1], [0.075, 0.036, 0.06], 8, 4, R('HEAD'), [bi('jaw'), 1], 4);
  // eight legs, four joints each, the knuckles swollen
  for (let i = 0; i < LEGS; i++) {
    const a = x.rest('leg' + i), b2 = x.rest('shin' + i), c2 = x.rest('tars' + i), d2 = x.rest('tip' + i);
    const tipEnd: V3 = [d2[0] + (d2[0] - c2[0]) * 0.12, Math.max(0.01, d2[1] - 0.06), d2[2] + (d2[2] - c2[2]) * 0.12];
    const P: V3[] = [a, addV(scl(a, 0.5), scl(b2, 0.5)), b2, addV(scl(b2, 0.5), scl(c2, 0.5)), c2, addV(scl(c2, 0.4), scl(d2, 0.6)), d2, tipEnd];
    const r: [number, number][] = [[0.03, 0.03], [0.022, 0.022], [0.03, 0.03], [0.018, 0.018], [0.026, 0.026], [0.014, 0.014], [0.018, 0.018], [0.004, 0.004]];
    const W: Wt[] = [[bi('leg' + i), 1], [bi('leg' + i), 1], [bi('leg' + i), 0.5, bi('shin' + i), 0.5], [bi('shin' + i), 1], [bi('shin' + i), 0.5, bi('tars' + i), 0.5], [bi('tars' + i), 1], [bi('tars' + i), 0.5, bi('tip' + i), 0.5], [bi('tip' + i), 1]];
    frames(B, pathFrames(P, r, W, [0, 0, 1], [1, 0.86, 0.72, 0.58, 0.44, 0.3, 0.16, 0.02]), 5, R('LEG'), 10 + i, { start: true, end: true });
  }
}

function paintP(p: Page, x: BuildCtx) {
  const SK = makeRamp([0xa89490, 0x9c948c, 0xb09a88][x.variant % 3], 10, { hueShift: 0.05, spread: 0.6 });
  const dust = (r: Region, sd: number) => { for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) { const n = r.fbm(xx, yy, 4, 2, sd); if (n > 0.62) r.blend(xx, yy, 0xd8d4c8, (n - 0.62) * 1.6); if (hash(xx * 3 + yy, sd) < 0.012) r.blend(xx, yy, 0xe8e4d8, 0.6); } };
  {
    const r = p.R('BODY');
    r.fill(SK, (xx, yy) => 4.6 + Math.sin((xx / r.w) * Math.PI * 2) * 1.2 + (r.fbm(xx, yy, 3, 2, 3) - 0.5) * 1.2 + (Math.sin(yy * 0.9) > 0.6 ? 1.2 : 0) - (Math.sin(yy * 0.9) < -0.7 ? 1 : 0));
    // the spine: a row of knuckles down the back
    for (let yy = 0; yy < r.h; yy += 3) { r.set(r.w / 4, yy, SK[8]); r.set(r.w / 4 + 1, yy, SK[6]); r.set(r.w / 4, yy + 1, SK[2]); }
    // old tile glue, a cable it is wearing like a vein
    for (let yy = 0; yy < r.h; yy++) r.blend(Math.round(r.w * 0.7 + Math.sin(yy * 0.2) * 3), yy, 0x2a2a2e, 0.7);
    // where the cable has worn through: a raw groove; sores where it hangs from the joists
    const C = kitCanvas(r);
    flay(C, Math.round(r.w * 0.7), Math.round(r.h * (0.35 + x.variant * 0.15)), 2.5, 6, { fibre: [0, 1], depth: 0.8, seed: 41 + x.variant, drips: 2, drip: [0, 1] });
    sores(C, 6, 43 + x.variant);
    dust(r, 5);
  }
  {
    const r = p.R('HEAD');
    r.fill(SK, (xx, yy) => 5 + Math.cos(((xx / r.w) - 0.5) * Math.PI * 2) * 1.2 + (r.fbm(xx, yy, 3, 2, 7) - 0.5) * 0.8);
    // the face, upside down: the mouth up top, closed eyes below it, the brow at the bottom
    const cx = r.w / 2;
    for (let xx = -7; xx <= 7; xx++) { const yy = 9 + Math.round(Math.abs(xx) * 0.25); r.set(cx + xx, yy, 0x2a1010); if (xx % 2 === 0 && Math.abs(xx) < 7) { r.set(cx + xx, yy + 1, 0xd8ccb0); r.set(cx + xx, yy - 1, 0xd8ccb0); } else { r.set(cx + xx, yy + 1, RAW[3]); r.set(cx + xx, yy - 1, RAW[3]); } }
    // the face is upside down, so what it drools runs UP over the lip toward the crown
    drips(kitCanvas(r), cx - 2, 8, 2, 6, [0, -1], 31 + x.variant, 3);
    // the eyes: open, upside down, bloodshot, rolled toward you; wet lids, a glint
    for (const k of [-1, 1]) {
      const ex = cx + k * 8, ey = 20;
      for (let yy = -2; yy <= 2; yy++) for (let xx = -4; xx <= 4; xx++) {
        const d = Math.hypot(xx / 4.2, yy / 2.3); if (d > 1) continue;
        const pd = Math.hypot(xx + k * 0.5, yy - 0.6);
        r.set(ex + xx, ey + yy, d > 0.82 ? 0x5a2420 : pd < 1.1 ? 0x060404 : pd < 2 ? [0x4a5a3a, 0x5a4a30, 0x3a4a5a][x.variant % 3] : hash(xx, yy + k) < 0.18 ? 0xb04a40 : 0xd8d0bc);
      }
      r.set(ex - k, ey + 1, 0xffffff);
      r.blend(ex, ey + 3, SK[2], 0.6); r.blend(ex - 1, ey + 3, SK[2], 0.6);
    }
    for (let xx = -11; xx <= 11; xx++) r.blend(cx + xx, 25, SK[2], 0.5);
    r.set(cx, 15, SK[2]); r.set(cx - 1, 14, SK[3]); r.set(cx + 1, 14, SK[3]);
    dust(r, 9);
  }
  {
    const r = p.R('LEG');
    r.fill(SK, (xx, yy) => 4.4 + Math.cos(((xx / r.w) - 0.5) * Math.PI * 2) * 1.4 + (r.fbm(xx, yy, 2, 2, 11) - 0.5) * 0.8);
    // joints: dark creases where the skin folds round each knuckle
    for (const v of [0.86, 0.58, 0.3]) { const yy = Math.round(r.h * (1 - v)); for (let xx = 0; xx < r.w; xx++) { r.blend(xx, yy, SK[1], 0.8); r.blend(xx, yy + 1, SK[7], 0.4); } }
    for (let yy = Math.round(r.h * 0.84); yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, hash(xx, yy) < 0.3 ? BLOOD[0] : 0x3a2e2a, 0.6); // the tips are horn, black at the ends, crusted
    dust(r, 13);
  }
  {
    const r = p.R('CAP');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2);
      r.set(xx, yy, d > 0.86 ? SK[5] : d < 0.3 ? 0xd8d0b8 : hash(xx, yy) < 0.3 ? 0x6a3a3a : 0x8a5a54);
    }
  }
}

const PLENUM_KIT: KitDef = { key: 'plenum', variants: 3, bones: bonesP, layout: layoutP, build: buildP, paint: paintP, sphere: [0, 0.4, 0, 1.1] };

// ------------------------------------------------------------------ dust sifting down and the falling tile (local visuals)
interface Mote { x: number; y: number; z: number; vy: number; life: number }
const motes: Mote[] = [];
let dustMesh: THREE.InstancedMesh | null = null, tileMesh: THREE.Mesh | null = null, tileT = -1, tileX = 0, tileZ = 0, tileRY = 0, lastStep = -1;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
function fxRoot(): THREE.Object3D | null { return live() && G.creatures ? (G.creatures.root as THREE.Object3D) : null; }
function dustAt(x: number, z: number, n: number) {
  for (let i = 0; i < n && motes.length < 40; i++) motes.push({ x: x + (Math.random() - 0.5) * 0.6, y: WALL_H - 0.05, z: z + (Math.random() - 0.5) * 0.6, vy: -0.5 - Math.random() * 0.6, life: 3 });
}
function dropTile(x: number, z: number, ry: number) {
  const root = fxRoot(); if (!root) return;
  if (!tileMesh) {
    const mb = new ModelBuilder();
    mb.box(0, -0.01, 0, 0.6, 0.02, 0.6, { top: 'c_ceiling_panel', bottom: 'c_ceiling_panel', sides: 'white' }, { color: 0xe8e4d8, fit: true });
    tileMesh = new THREE.Mesh(mb.build(), worldMaterial({}));
    tileMesh.castShadow = true;
  }
  if (tileMesh.parent !== root) root.add(tileMesh);
  tileT = 0; tileX = x; tileZ = z; tileRY = ry;
}
function stepFx(dt: number) {
  if (!live() || lastStep === G.time) return;
  lastStep = G.time;
  const root = fxRoot(); if (!root) return;
  if (!dustMesh) {
    const mb = new ModelBuilder();
    mb.box(0, 0, 0, 0.02, 0.02, 0.02, 'white', { color: 0xd8d4c8 });
    dustMesh = new THREE.InstancedMesh(mb.build(), worldMaterial({}), 40);
    dustMesh.frustumCulled = false; dustMesh.castShadow = false;
  }
  if (dustMesh.parent !== root) root.add(dustMesh);
  let k = 0;
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.life -= dt; m.y += m.vy * dt; m.x += Math.sin(m.y * 7 + i) * dt * 0.05;
    if (m.life <= 0 || m.y < 0) { motes.splice(i, 1); continue; }
  }
  for (const m of motes) { _m.makeTranslation(m.x, m.y, m.z); dustMesh.setMatrixAt(k++, _m); }
  dustMesh.count = k; dustMesh.instanceMatrix.needsUpdate = true;
  if (tileMesh && tileT >= 0) {
    tileT += dt;
    const fall = Math.min(1, tileT / 0.5);
    const y = (WALL_H - 0.02) * (1 - fall * fall);
    _e.set(fall * 1.4, tileRY + fall * 0.8, fall * 0.4);
    tileMesh.position.set(tileX + fall * 0.4, Math.max(0.02, y), tileZ);
    tileMesh.rotation.copy(_e);
    if (fall >= 1) tileMesh.rotation.set(0, tileRY + 0.8, 0);
    if (tileT > 9) { tileMesh.removeFromParent(); tileT = -1; }
  }
  void _q; void _s; void _p;
}

// ------------------------------------------------------------------ animation
function buildPlenum(): Rig { return buildKitRig(PLENUM_KIT, 0, 0.6); }
function animatePlenum(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, Math.floor(hashId(c.id) * 3)); }
  kitSync(K);
  stepFx(dt);
  const P = rig.parts;
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ac = attackCurve(rig, c, t);
  const lost = lostParts(c);
  // up in the ceiling: not drawn; dust and clicks give it away
  if (n.ceil && !c.dead) {
    hideRig(c, rig);
    const p = localIn(c);
    if (p && c.speed > 0.2) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      ud.dustT = (ud.dustT ?? 0) - dt;
      if (d < 9 && ud.dustT <= 0) { ud.dustT = 0.25 + Math.random() * 0.4; dustAt(c.x, c.z, 3); }
    }
    ud.wasCeil = 1;
    return;
  }
  rig.root.visible = true; rig.body.visible = c.visibleToLocal || Math.hypot((G?.local?.x ?? c.x) - c.x, (G?.local?.z ?? c.z) - c.z) < 1.6;
  // the drop: from the ceiling to the floor, folded, then everything unfolds at once
  if (n.drop !== undefined && n.drop !== ud.dropSeen) {
    const first = ud.dropSeen === undefined && !ud.wasCeil;
    ud.dropSeen = n.drop;
    if (!first) {
      ud.dropAt = t;
      if (live()) {
        dropTile(c.x, c.z, seed * 6);
        dustAt(c.x, c.z, 14);
        playAt('plenum_tile', c, 1, 26); playAt('plenum_drop', c, 1, 26);
        const p = localIn(c);
        if (p && Math.hypot(p.x - c.x, p.z - c.z) < 7) { G.audio?.flat?.('dread_hit', 'music', 0.6); G.camera?.shake?.(0.45, 0.5, 0.9); G.camera?.punch?.(0.07, 0.45); thinkOnce(p, 'plenum', ['The CEILING—', 'It came out of the ceiling.', 'There were clicks over my head. I heard them. I heard them and I didn\'t look up.'][Math.floor(t) % 3], 40); }
      }
    }
  }
  ud.wasCeil = 0;
  const since = ud.dropAt !== undefined ? t - ud.dropAt : 99;
  const fallK = since < 0.4 ? 1 - since / 0.4 : 0;
  const unfold = since < 0.4 ? 0 : since < 0.75 ? (since - 0.4) / 0.35 : 1;
  // climbing back up: the reverse
  // (sequence numbers, not host timestamps: peers' clocks differ)
  if (n.cl !== undefined && n.cl !== ud.clSeen) { ud.clSeen = n.cl; ud.climbAt = t; }
  const climbK = n.up && ud.climbAt !== undefined ? Math.min(1, (t - ud.climbAt) / 0.6) : 0;
  rig.root.position.y += (WALL_H - 0.6) * (fallK * fallK) + (WALL_H - 0.5) * climbK;
  const moving = c.speed > 0.3;
  const ph0 = c.phase * 1.6;
  // body: low, rocking, the thorax lifting to bite
  R('pelvis', Math.sin(ph0 * 2) * 0.04 * (moving ? 1 : 0.2), 0, Math.sin(ph0) * 0.06 * (moving ? 1 : 0));
  R('thorax', -0.1 - ac.wind * 0.7 + ac.strike * 0.4 - climbK * 0.8, Math.sin(t * 0.8 + seed) * 0.1, 0);
  R('abdomen', 0.08 + Math.sin(t * 1.3 + seed * 3) * 0.05, Math.sin(ph0) * 0.1, 0);
  R('head', -0.35 + ac.wind * 0.5 - ac.strike * 0.4, 0, Math.sin(t * 0.6 + seed) * 0.4); // the upside-down face held up to look at you
  R('jaw', ac.wind > 0.3 || ac.strike > 0 ? 0.9 : 0.15 + Math.max(0, Math.sin(t * 2.2 + seed)) * 0.15);
  // legs: alternating tetrapod gait, high-stepping; at rest they tap, one at a time; folded while it falls
  for (let i = 0; i < LEGS; i++) {
    const j = i >> 1, k = i & 1 ? -1 : 1;
    const group = (j + (i & 1)) & 1;
    const ph = ph0 + group * Math.PI + j * 0.3;
    const swing = moving ? Math.sin(ph) * 0.35 : 0;
    const lift = moving ? Math.max(0, Math.cos(ph)) * 0.5 : (Math.floor(t * 3 + i * 1.7 + seed * 9) % 9 === 0 ? 0.35 : 0);
    const fold = 1 - unfold;
    // folded tight while it drops, legs pointing up and in
    const yaw = swing - ac.wind * 0.3 * (j === 0 ? 1 : 0);
    R('leg' + i, 0, yaw, k * (lift + fold * 1.2 + climbK * 1.4));
    // the impossible bend: now and then a knee flips the wrong way for a beat
    const flip = !moving && Math.floor(t * 1.7 + i * 2.3 + seed * 11) % 13 === 0 ? -1.4 : 0;
    R('shin' + i, 0, 0, k * (-lift * 0.6 + fold * -1.6 + flip));
    R('tars' + i, 0, 0, k * (lift * 0.4 + fold * -1.2 - flip * 0.6));
    if (j === 0 && (ac.wind > 0 || ac.strike > 0)) { R('leg' + i, -0.3, -k * 0.4 * ac.strike, k * (0.9 * ac.wind)); R('shin' + i, 0, 0, k * -1.2 * ac.wind + k * 0.6 * ac.strike); }
    if (lost.has('leg' + i)) R('leg' + i, 0, 0, k * 0.8);
  }
  const fl = flinchOf(c);
  rig.body.position.x = fl > 0 ? Math.sin(t * 90) * 0.04 * fl : 0;
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.5; F.x = 0;
  if (c.dead) {
    // legs curl in over the body like a dead spider's
    ud.deadT = (ud.deadT ?? 0) + dt;
    const k2 = Math.min(1, ud.deadT * 2);
    for (let i = 0; i < LEGS; i++) { const k = i & 1 ? -1 : 1; R('leg' + i, 0, 0, k * 1.3 * k2); R('shin' + i, 0, 0, k * -2.0 * k2); R('tars' + i, 0, 0, k * -1.0 * k2); }
  }
  // skitter sounds in the ceiling or on the floor, for whoever is near
  ud.skT = (ud.skT ?? 0) - dt;
  if (moving && ud.skT <= 0 && live()) { ud.skT = 0.7 + Math.random() * 0.6; playAt('plenum_skitter', c, 0.6, 14); }
}

// ------------------------------------------------------------------ brain (host)
function ceilingOver(z: Zone, x: number, zz: number) {
  const tx = Math.floor(x), ty = Math.floor(zz);
  return !z.env?.sky && z.inb(tx, ty) && !(z.flags[z.idx(tx, ty)] & TF.OUTDOOR);
}
function nearest(c: Creature, maxD = 30): { p: Player; d: number } | null {
  let best: Player | null = null, bd = maxD;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}
function goUp(c: Creature) {
  const n = net(c);
  n.cl = ((n.cl ?? 0) + 1) % 1000; n.up = 1; c.setState('emerge'); c.mem.up = true; c.mem.upAt = G.time;
  playAt('plenum_skitter', c, 0.9, 16);
}

function thinkPlenum(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  const ev = pulse(c);
  if (!m.init) { m.init = 1; if (ceilingOver(z, c.x, c.z)) { n.ceil = 1; c.setState('hide'); } }
  instFlags(c, { ghost: !!n.ceil });
  const near = nearest(c, 40);
  // climbing up or dropping down: a scripted moment
  if (c.state === 'emerge') {
    hold(c);
    if (m.up && G.time - m.upAt > 0.6) { m.up = false; n.up = 0; n.ceil = 1; c.setState('hide'); m.dropCd = G.time + rng.float(10, 18); m.lair = pickReach(z, c.x, c.z, (x, zz, st) => (st < 6 || st > 20 || !ceilingOver(z, x, zz) ? null : 0), 500); }
    else if (!m.up && c.stateT > 0.75) { c.setState('chase'); m.floorAt = G.time; }
    return true;
  }
  if (n.ceil) {
    // above the tiles: drift toward whoever is nearest, then drop on them
    if (!near) { hold(c); return true; }
    const p = near.p, d = near.d;
    if (m.lair && dist(m.lair, c) > 0.8 && G.time < (m.dropCd ?? 0)) { cs.moveTo(c, z, m.lair.x, m.lair.z, c.sp.walk, dt, 0.6); return true; }
    if (d > 22) { hold(c); return true; }
    cs.moveTo(c, z, p.x, p.z, d < 4 ? c.sp.walk * 0.8 : c.sp.walk, dt, 0.3);
    if (d < 1.4 && G.time > (m.dropCd ?? 0) && walkable(z, Math.floor(c.x), Math.floor(c.z)) && ceilingOver(z, c.x, c.z)) {
      // a panel lifts; it comes down just short of them
      const a = Math.atan2(c.z - p.z, c.x - p.x);
      const dx = Math.cos(a) * 1.0, dz = Math.sin(a) * 1.0;
      if (walkable(z, Math.floor(p.x + dx), Math.floor(p.z + dz))) { c.x = p.x + dx; c.z = p.z + dz; }
      n.ceil = 0; n.drop = ((n.drop ?? 0) + 1) % 1000;
      face(c, p.x, p.z, true);
      c.setState('emerge'); m.up = false;
      c.targetId = p.id; c.awareness.set(p.id, 1.5);
    }
    return true;
  }
  // on the floor with a body (src/gore/maul.ts picks it and bites): it stays at it
  const f = m.feed as { pid: string; until: number } | undefined;
  const v = f && G.time < f.until ? (G.players.get(f.pid) as Player | undefined) : undefined;
  if (v && v.body.dead && v.zoneKey === c.zoneKey && (!near || near.d > 6)) {
    const reach = c.sp.attack!.range + 0.3;
    if (dist(v, c) > reach) { c.setState('investigate'); cs.moveTo(c, z, v.x, v.z, c.sp.run * 0.6, dt, reach * 0.8); }
    else { hold(c); face(c, v.x, v.z); }
    m.floorAt = G.time;
    return true;
  }
  // on the floor: fast, low, it bites; it does not stay long
  if (!near || near.d > 20) { if (ceilingOver(z, c.x, c.z)) goUp(c); else { c.setState('wander'); c.goal = c.goal ?? cs.wanderSpot(c, z, 10); if (cs.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.walk, dt, 0.8)) c.goal = null; } return true; }
  const p = near.p, d = near.d;
  const tired = G.time - (m.floorAt ?? G.time) > 16 || c.hp < c.sp.hp * 0.4 || m.bit;
  if (tired && ceilingOver(z, c.x, c.z) && (d > 2.5 || m.bit)) { m.bit = false; goUp(c); return true; }
  c.setState('chase');
  const reach = c.sp.attack!.range + p.radius;
  if (d <= reach && c.attackT <= 0) { cs.startAttack(c, p); m.bit = rng.chance(0.4); return true; }
  cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, reach * 0.8);
  if (ev.hurt > 0 && c.noiseCooldown <= 0) { playAt('plenum_shriek', c, 1, 22); c.noiseCooldown = 2; }
  return true;
}

const S = def({
  key: 'plenum', name: 'Plenum Crawler', code: 'PL-08 // CEILING VOID FAUNA', temperament: 'ambush', threat: 4,
  rule: { name: 'NO CEILING, NO PLENUM', text: 'It lives above drop ceilings and drops on you. It cannot follow you outdoors, where there is no ceiling.' },
  hp: 60, walk: 1.6, run: 4.4, turn: 9, radius: 0.42, height: 0.7, sight: 14, fov: 2.0, hearing: 1.8, vibration: true,
  attack: { dmg: [9, 15], range: 0.95, cooldown: 1.3, kinds: ['bite', 'laceration', 'scratch'], corrupt: 0.05, knock: 0.6, parts: ['shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'farm_l', 'farm_r', 'hand_l', 'hand_r'] },
  zones: ['office', 'lobby', 'school', 'hospital', 'mall', 'market', 'lab'], weight: 1, maxPerZone: 2, diet: 'meat',
  sounds: snd({ alert: 'plenum_shriek', attack: 'plenum_shriek', hurt: 'plenum_shriek', death: 'plenum_die' }),
  scan: {
    cls: 'Ceiling-void arthropod (vertebrate?)',
    notes: [
      'Lives above drop ceilings. Listen for clicking crossing the tiles over your head, and dust sifting down.',
      'It drops out of a ceiling panel on top of you. Eight limbs, four joints each, and a face set upside down.',
      'Fast on the floor, but it does not stay down long: once it has bitten, or been hurt, it climbs back up.',
      'It cannot follow you outdoors, where there is no ceiling.',
    ],
  },
  gore: { blood: 'pale', tint: 0xe0c8c0, flesh: 0xb09a90, sever: ['leg0', 'leg1', 'leg2', 'leg3', 'leg4', 'leg5', 'leg6', 'leg7', 'shin0', 'shin1', 'shin2', 'shin3', 'shin4', 'shin5', 'shin6', 'shin7'], head: 'head' },
  build: buildPlenum,
  animate: animatePlenum,
  think: thinkPlenum,
});
(S as any).handlesSevered = true;
defDread('plenum', { twitch: ['leg0', 'leg3', 'shin5', 'tars6', 'head'], twitchRate: 0.6, stutter: 0.15, sting: 'hit', cam: 0.8, stretch: { parts: ['leg0', 'leg1'], amount: 0.35 } });
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const c = fakeCreature(S, { id: 'g4', state: 'chase', speed: q === 'walk' ? 3.5 : 0, phase: t * 4, attackPhase: q === 'attack' ? 0.15 : 0, mem: { netMem: {} } });
  animatePlenum(rig, c, t, 1 / 60);
};
void hold;

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.7, snap: 0.3 });

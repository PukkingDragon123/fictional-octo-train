import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, creatureMenu, poke, poked, pulse, stop, HeldAction } from '../behaviors_a';
import { net, netOf, playAt, hashId, fakeCreature, localIn, thinkOnce, dist } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, buildKitRig, kitSync, hash, nearestSurvivor, lookAngles, flinchOf, cutState, cutSync, type CutState } from '../kit/humanoids';
import * as THREE from 'three';
import { HumanRig, randomAppearance, type Pose as HPose } from '../../entities/humanRig';
import { BONES } from '../../entities/humanModel';
import { worldMaterial } from '../../gfx/materials';
import { MEMORIES, ADULT_MEMORIES, replicaPose } from '../kit/replica';
import { chain, sac, blade, plate, paintSkin, paintCap, paintCloth } from '../kit/organic';
import { inhabitant } from '../lore';
import { advanceLore, unknownInhabitants } from '../../scan/lorebook';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE SEATED — an armchair made of a person. The spine is the back, the chest
// the padded backrest, the thighs the seat, the shins the front legs, the
// forearms the armrests with the hands gripping their ends; two turned wooden
// legs are nailed in behind, and a yellow antimacassar lies over the head that
// forms the headrest. It is alive: it breathes, its eyes move, its fingers
// tighten. The King in Yellow makes them out of those who sought to know too
// much. It whispers what it learned, to anyone who sits.
// Round 14 (one human base): the person in it is a HumanRig (src/entities/humanRig.ts),
// posed rigid in the chair, its face its own painter's (fear, pallor, the mouth
// working when it whispers); the kit rig below is only the chair grown round them:
// the tufted skin backing, the seat cushion, the upholstery, the wood and the nails.
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
function bonesS(): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'pelvis', parent: 'base', at: [0, 0.46, -0.2] },
    { name: 'spine', parent: 'pelvis', at: [0, 0.25, -0.04], cap: true },
    { name: 'chest', parent: 'spine', at: [0, 0.25, -0.03] },
    { name: 'neck', parent: 'chest', at: [0, 0.14, 0.0], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.1, 0.02], cap: true },
    { name: 'jaw', parent: 'head', at: [0, -0.05, 0.05] },
    { name: 'eyes', parent: 'head', at: [0, 0.035, 0.08] },
  ];
  for (const [s, k] of SIDES) {
    b.push(
      { name: 'uarm' + s, parent: 'chest', at: [k * 0.2, 0.06, 0.0], cap: true },
      { name: 'farm' + s, parent: 'uarm' + s, at: [k * 0.05, -0.33, 0.12], cap: true },
      { name: 'hand' + s, parent: 'farm' + s, at: [0, 0.0, 0.38], cap: true },
      { name: 'fing' + s, parent: 'hand' + s, at: [0, -0.005, 0.07] },
      { name: 'thigh' + s, parent: 'pelvis', at: [k * 0.11, -0.03, 0.02], cap: true },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, 0.0, 0.46], cap: true },
      { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.41, 0.03] },
    );
  }
  return b;
}
function layoutS(p: Page) {
  p.reg('SKIN', 64, 64); p.reg('BACK', 48, 48); p.reg('LIMB', 24, 48); p.reg('FACE', 32, 32); p.reg('HEAD', 32, 24);
  p.reg('WOOD', 16, 32); p.reg('CLOTH', 24, 32); p.reg('EYE', 8, 8); p.reg('NAIL', 8, 8); p.reg('CAP', 12, 12);
}
function buildS(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const BA = bi('base'), PV = bi('pelvis'), SP = bi('spine'), CH = bi('chest'), NK = bi('neck'), HD = bi('head'), JW = bi('jaw'), EY = bi('eyes');
  // the backing: skin stretched over a frame behind the body, buttoned through (the person sits in it)
  sac(B, R('BACK'), 1, [[0, 0.44, -0.34], [0, 0.6, -0.37], [0, 0.78, -0.39], [0, 0.95, -0.4], [0, 1.06, -0.4]],
    [[0.24, 0.07], [0.27, 0.08], [0.3, 0.08], [0.3, 0.08], [0.16, 0.06]], [[PV, 1], [PV, 0.5, SP, 0.5], [SP, 0.5, CH, 0.5], [CH, 1], [CH, 1]],
    { n: 12, up: [0, 0, 1], bump: (a, t) => Math.exp(-(a * a) / 0.5) * (Math.max(0, Math.sin(t * Math.PI * 7)) * 0.05) - (Math.abs(a) > 2.4 ? 0.1 : 0) });
  // the seat cushion: skin stretched under the thighs
  sac(B, R('SKIN'), 6, [[0, 0.4, -0.2], [0, 0.43, -0.05], [0, 0.44, 0.12], [0, 0.41, 0.27]], [[0.29, 0.05], [0.31, 0.06], [0.31, 0.06], [0.28, 0.04]], [[PV, 1], [PV, 1], [BA, 1], [BA, 1]],
    { n: 10, bump: (a, t) => Math.max(0, Math.sin(t * Math.PI * 3)) * 0.06 * Math.cos(a * 0.5) });
  for (const [s] of SIDES) {
    // a wooden strut under each armrest, screwed through the elbow
    const fa = x.rest('farm' + s);
    sac(B, R('WOOD'), 14, [[fa[0], 0.5, fa[2] + 0.05], [fa[0], fa[1] - 0.03, fa[2] + 0.05]], [[0.02, 0.02], [0.018, 0.018]], [[BA, 1], [bi('farm' + s), 1]], { n: 6 });
  }
  // the sides: skin stretched from armrest to seat like upholstery, tufted, so the whole reads as an armchair
  for (const [s, k] of SIDES) {
    const fa = x.rest('farm' + s);
    plate(B, R('BACK'), 21, [k * 0.315, 0.55, fa[2] + 0.04], [0, 0, -k], [0, 1, 0], 0.21, 0.13, 0.03, (u, v) => (v > 0.3 ? [bi('farm' + s), 0.6, BA, 0.4] : [BA, 1]), { rows: 4, cols: 6 });
    // a carved wooden foot under each human foot, screwed through the heel
    const fp = x.rest('foot' + s);
    sac(B, R('WOOD'), 22, [[fp[0], 0.0, fp[2] + 0.02], [fp[0], 0.03, fp[2] + 0.04], [fp[0], 0.05, fp[2] + 0.05]], [[0.035, 0.035], [0.045, 0.04], [0.04, 0.035]], [[BA, 1], [BA, 1], [bi('foot' + s), 1]], { n: 7, up: [0, 0, 1] });
  }
  // the front seat rail: a wooden apron under the knees, a brass escutcheon in the middle
  sac(B, R('WOOD'), 23, [[-0.24, 0.42, 0.24], [0, 0.4, 0.26], [0.24, 0.42, 0.24]], [[0.02, 0.035], [0.022, 0.045], [0.02, 0.035]], [[BA, 1], [BA, 1], [BA, 1]], { n: 6, up: [0, 1, 0] });
  sac(B, R('NAIL'), 24, [[0, 0.4, 0.28], [0, 0.4, 0.29]], [[0.018, 0.022], [0.016, 0.02]], [[BA, 1], [BA, 1]], { n: 6 });
  // two turned wooden back legs, nailed into the hips
  for (const [, k] of SIDES) {
    const prof: [number, number][] = [[0.0, 0.026], [0.06, 0.03], [0.1, 0.022], [0.2, 0.028], [0.3, 0.02], [0.38, 0.034], [0.46, 0.03]];
    sac(B, R('WOOD'), 15, prof.map(([y]) => [k * 0.22, y, -0.3 - (0.46 - y) * 0.06] as V3), prof.map(([, r]) => [r, r] as [number, number]), prof.map(([y]) => (y > 0.36 ? [PV, 1] : [BA, 1])), { n: 7, up: [0, 0, 1] });
    for (let n = 0; n < 3; n++) sac(B, R('NAIL'), 16, [[k * (0.2 + n * 0.012), 0.44 + n * 0.015, -0.29], [k * (0.2 + n * 0.012), 0.44 + n * 0.015, -0.24]], [[0.006, 0.006], [0.004, 0.004]], [[PV, 1], [PV, 1]], { n: 4 });
  }
  // the antimacassar: yellow cloth draped over the top of the head and down the back
  blade(B, R('CLOTH'), [[0, 1.33, -0.24], [0, 1.36, -0.32], [0, 1.25, -0.42], [0, 1.0, -0.43], [0, 0.82, -0.42]], [0.12, 0.14, 0.15, 0.15, 0.14], [1, 0, 0], [[HD, 1], [HD, 1], [HD, 0.5, CH, 0.5], [CH, 1], [CH, 1]], { offset: -0.5, edge: 0.3, seed: 4 });
}
function paintS(p: Page) {
  const SK = makeRamp(0xc0a494, 7, { hueShift: -0.04, spread: 0.65 });
  // stretched skin: taut, pale, veined, brass tacks in rows where it is pinned
  const skin = p.R('SKIN');
  paintSkin(skin, SK, { seed: 3, veins: 16, vein: 0x8a4a5a, mottle: 1.2, glint: 10 });
  for (let x = 2; x < skin.w; x += 5) for (const y of [2, skin.h - 3]) { skin.set(x, y, 0xd8b048); skin.set(x + 1, y, 0x8a6a20); }
  // the backrest: diamond tufting, a brass button at every crossing (the ribs, pinned)
  const bk = p.R('BACK');
  paintSkin(bk, SK, { seed: 5, veins: 10, vein: 0x8a4a5a, mottle: 1, glint: 6 });
  for (let yy = 0; yy < bk.h; yy++) for (let xx = 0; xx < bk.w; xx++) {
    const a = Math.abs(bk.deg(xx));
    if (a > 70) { bk.blend(xx, yy, 0x6a4a40, 0.35); continue; }
    const d = (Math.abs(((xx + yy) % 10) - 5) < 0.6 || Math.abs(((xx - yy + 100) % 10) - 5) < 0.6);
    if (d) bk.blend(xx, yy, SK[1], 0.6);
  }
  for (let yy = 5; yy < bk.h; yy += 10) for (let xx = 5; xx < bk.w; xx += 10) { if (Math.abs(bk.deg(xx)) > 65) continue; bk.ellipse(xx, yy, 1.4, 1.4, 0xd8b048, 1); bk.set(xx, yy, 0x6a5010); }
  paintSkin(p.R('LIMB'), SK, { seed: 7, veins: 4, vein: 0x8a6a68, mottle: 0.9, glint: 8 });
  paintSkin(p.R('HEAD'), SK, { seed: 9, veins: 4, vein: 0x8a4a5a, mottle: 1.0 });
  const hd = p.R('HEAD'); for (let xx = 0; xx < hd.w; xx++) for (let yy = hd.h - 8; yy < hd.h; yy++) if (Math.abs(hd.deg(xx)) > 50) hd.blend(xx, yy, 0x3a2a20, 0.7); // hair, thinning
  // the face: open-eyed, a slack open mouth, tear tracks
  const fc = p.R('FACE');
  fc.fill(SK, (xx, yy) => 4 - Math.abs(xx - fc.w / 2) / fc.w * 3 + (fc.fbm(xx, yy, 3, 2, 11) - 0.5) * 0.8);
  for (const k of [-1, 1]) {
    fc.ellipse(fc.w / 2 + k * 7, fc.h * 0.34, 4, 2.6, SK[1], 0.8); // sockets
    fc.hline(fc.w / 2 + k * 4, fc.w / 2 + k * 10, fc.h * 0.25, 0x5a3a30, 0.8); // brows, raised
    fc.vline(fc.w / 2 + k * 7, fc.h * 0.42, fc.h * 0.85, 0x9a7a8a, 0.4); // tears
  }
  fc.vline(fc.w / 2, fc.h * 0.4, fc.h * 0.58, SK[2], 0.8); fc.hline(fc.w / 2 - 2, fc.w / 2 + 2, fc.h * 0.6, SK[1], 0.8); // nose
  fc.ellipse(fc.w / 2, fc.h * 0.76, 5, 3, 0x2a0a0a, 1); fc.hline(fc.w / 2 - 5, fc.w / 2 + 5, fc.h * 0.68, 0x8a4a4a, 0.8); // the mouth, open
  const ey = p.R('EYE');
  for (let yy = 0; yy < ey.h; yy++) for (let xx = 0; xx < ey.w; xx++) { const d = Math.hypot(xx + 0.5 - 4, yy + 0.5 - 4) / 4; ey.set(xx, yy, d < 0.3 ? 0x101010 : d < 0.55 ? 0x6a8a9a : 0xe8e0d0); }
  ey.set(3, 3, 0xffffff);
  const wd = p.R('WOOD');
  wd.fill(makeRamp(0x4a2814, 6, { spread: 0.7 }), (xx, yy) => 2.6 + Math.cos((wd.deg(xx) * Math.PI) / 180) * 1.4 + Math.sin(yy * 0.9 + Math.sin(xx * 0.4) * 2) * 0.5);
  paintCloth(p.R('CLOTH'), makeRamp(0xd8b030, 6, { spread: 0.8 }), { seed: 13, folds: 3, holes: 3, hole: 0x2a1a08, stain: 3 });
  const cl = p.R('CLOTH'); for (let yy = 2; yy < cl.h; yy += 6) for (let xx = 2; xx < cl.w; xx += 4) cl.blend(xx, yy, 0xf0e0a0, 0.5); // lace
  p.R('NAIL').fill(makeRamp(0x8a8a90, 4), (xx) => 2 + (xx & 1));
  paintCap(p.R('CAP'), SK[2], 0xb83838, 0x3a1010);
}
const SEATED_KIT: KitDef = { key: 'seated', variants: 1, W: 128, H: 256, bones: bonesS, layout: layoutS, build: buildS, paint: paintS, sphere: [0, 0.6, 0, 1.0] };
// ------------------------------------------------------------------ the person in it: the human base, posed into the chair
interface SRig extends KitRig { hr: HumanRig; cut: CutState; who: string }
const POOL: SRig[] = [];
const HR_Z = -0.16;
function buildSeated(): Rig {
  for (const r of POOL) if (!r.root.parent) { r.root.userData = {}; r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0); r.body.rotation.set(0, 0, 0); return r; }
  const K = buildKitRig(SEATED_KIT, 0, 1.25) as SRig;
  const hr = new HumanRig(MEMORIES[0].app, worldMaterial({}));
  (hr.skin as any).clone = () => new THREE.Group();
  hr.root.position.set(0, 0, HR_Z);
  K.body.add(hr.root);
  K.hr = hr; K.who = '';
  K.cut = cutState(BONES.map((b) => hr.bones[b]), hr.skin.skeleton);
  // the gore system cuts these: the person's hands and head, not the chair's
  K.parts.handL = hr.j.handL; K.parts.handR = hr.j.handR; K.parts.head = hr.j.head;
  POOL.push(K);
  return K;
}
/** who it was: an operator who asked too much (a seeded face, a remembered set of clothes), gone pale, terrified */
function dress(K: SRig, id: string) {
  if (K.who === id) return;
  K.who = id;
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  let st = (h >>> 0) || 1;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const app = randomAppearance(rnd);
  const mem = MEMORIES[ADULT_MEMORIES[Math.floor(rnd() * ADULT_MEMORIES.length)]];
  K.hr.setAppearance(app);
  K.hr.setOutfit({ ...mem.outfit, cond: { pale: 2, dirt: 1, blood: { hand_l: 1, hand_r: 1, head: 1 }, expr: 'fear' } });
  K.hr.setExpression('fear');
  K.cut = cutState(BONES.map((b) => K.hr.bones[b]), K.hr.skin.skeleton);
}
/** the chair pose: sat bolt upright, forearms along the armrests, hands gripping the ends, the neck stretched into the headrest */
const SEAT_POSE = (() => { const P = replicaPose('sit', 0.2); return P; })();
function seatPose(): HPose {
  const P: HPose = { ...SEAT_POSE };
  for (const k of Object.keys(P)) { const v = (P as any)[k]; if (Array.isArray(v)) (P as any)[k] = v.slice(); }
  const J = (k: keyof HPose, x: number, y = 0, z = 0) => { (P as any)[k] = [x, y, z]; };
  J('uarmL', -0.35, -0.12, 0.14); J('farmL', -1.22, 0, 0); J('handL', 0.4, 0, 0);
  J('uarmR', -0.35, 0.12, -0.14); J('farmR', -1.22, 0, 0); J('handR', 0.4, 0, 0);
  J('spine', -0.04, 0, 0); J('chest', -0.03, 0, 0); J('neck', -0.08, 0, 0); J('head', -0.12, 0, 0);
  P.gripL = 0.85; P.gripR = 0.85; P.blink = 0;
  return P;
}

// ------------------------------------------------------------------ animation
function animateSeated(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as SRig;
  dress(K, c.id);
  kitSync(K);
  cutSync(K.cut, K.hr.body);
  const ud = rig.root.userData as Record<string, number>;
  const n = netOf(c), seed = hashId(c.id);
  const sm = (k: string, v: number, rate: number) => (ud[k] = (ud[k] ?? v) + (v - (ud[k] ?? v)) * Math.min(1, dt * rate));
  const P = seatPose();
  // breathing: slow and shallow, the chest rising; a catch in it now and then
  const catchB = Math.sin(t * 0.13 + seed * 9) > 0.92 ? Math.sin(t * 9) * 0.3 : 0;
  const br = Math.sin(t * 1.1 + seed * 5) + catchB;
  (P.chest as number[])[0] += br * 0.015;
  // the head strains toward you as far as the neck will turn, which is not far; sat on, it leans in to your ear
  const tgt = nearestSurvivor(c, 12);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 1.23, 1.4, 0.6);
  const sit = sm('sit', n.s ? 1 : 0, 2), wh = sm('wh', n.w ? 1 : 0, 6);
  const dart = (hash(Math.floor(t * 0.7 + seed * 3), 4) - 0.5) * 0.8;
  (P.neck as number[])[0] += sit * 0.35; (P.neck as number[])[1] += (tgt ? yaw * 0.3 : dart * 0.1) * (1 - sit);
  (P.head as number[])[0] += -pitch * 0.25 + sit * 0.4 + Math.sin(t * 0.4) * 0.02;
  (P.head as number[])[1] += (tgt ? yaw * 0.25 : 0) + sit * 0.3 * (seed < 0.5 ? 1 : -1);
  (P.head as number[])[2] += Math.sin(t * 0.3 + seed) * 0.04 + sit * 0.2;
  // fingers: they tighten on the armrests, tap, tighten harder when someone sits
  for (const [s, k] of SIDES) {
    const tap = Math.pow(Math.max(0, Math.sin(t * 2.3 + k * 1.7 + seed * 6)), 18) * 0.5;
    const g = Math.max(0.3, 0.85 - tap + sit * 0.15 + Math.sin(t * 13) * 0.04 * sit);
    if (s === 'L') P.gripL = g; else P.gripR = g;
    (P[('hand' + s) as keyof HPose] as number[])[0] += sit * 0.12;
  }
  if (c.dead) { (P.head as number[])[0] += 0.6; P.gripL = 0.1; P.gripR = 0.1; }
  const fl = flinchOf(c);
  P.rootX = fl > 0 ? Math.sin(t * 80) * 0.02 * fl : 0;
  K.hr.applyPose(P);
  // the neck, stretched a hand too long into the headrest
  const hd = K.hr.j.head, ud2 = hd.userData as { s0?: THREE.Vector3 };
  if (!ud2.s0) ud2.s0 = hd.position.clone();
  hd.position.copy(ud2.s0).multiplyScalar(1.6);
  // whispering: its own mouth works (the face painter's talking shapes); otherwise frozen in fear
  K.hr.talking = !c.dead && wh > 0.5;
  K.hr.faceTick(dt); K.hr.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && tgt && tgt.d < 4 && c.visibleToLocal) thinkOnce(p, 'seated', ['That chair is breathing.', 'The armrests are arms. The hands are holding on.', 'Its eyes moved. It is looking at me. It is ASKING me to sit.'][Math.floor(t * 0.5) % 3], 50);
}

// ------------------------------------------------------------------ the whispers (on the listener's own machine)
const OWN = [
  'He asked me what I wanted. I said: to know. He was very kind about it.',
  'Sit. Please. Nobody sits any more. It is the only thing I am for.',
  'I was an operator. Like you. I wanted to see what was under the floor.',
  'Do not look at his face. I looked. I know everything. I cannot close my eyes.',
  'The yellow is not cloth. It grows.',
  'There are others in the court. We talk, at night. We are all very comfortable.',
  'Calder. Tell Iris I am comfortable.',
];
function whisper(p: Player, c: Creature, hand: boolean) {
  let line = '';
  const unknown = unknownInhabitants().filter((e) => e.id !== 'seated');
  if (!hand && unknown.length) {
    const e = unknown[Math.floor(Math.random() * unknown.length)];
    const r = advanceLore(e.id);
    if (r) line = `${e.name}... ${r.text}`;
  }
  if (!line) {
    const own = inhabitant('seated');
    line = Math.random() < 0.3 && own ? own.lore : OWN[Math.floor(Math.random() * OWN.length)];
  }
  bus.emit('subtitle', { who: 'THE SEATED', text: line, style: 'radio', dur: 3 + line.length * 0.05 });
  G.audio?.flat?.('hollow_mutter', 'sfx', 0.35, 0.8);
  // the first whisper from each chair: you write it down
  const k = 'sw:' + c.id;
  if (!(p as any)[k]) { (p as any)[k] = 1; const it = createItem('seated_whisper'); it.data = { text: line }; p.inv.add(it); bus.emit('inventoryChanged', p); }
}
creatureMenu('seated', (p, c, opts) => {
  opts.push({
    label: 'Sit in it', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Sit', 0.6, 'pickup', () => {
      if (!CS().creatures.has(c.id) || c.dead) return;
      poke(p, c, 'sit');
      p.x = c.x; p.z = c.z; p.facing = p.targetFacing = c.facing;
      p.actions.set(new HeldAction(p, 6, 'sit', 'Sitting', 0));
      bus.emit('think', p, ['It is warm. It is breathing under me.', 'The hands on the armrests tighten.', 'Its mouth is right behind my ear.'][Math.floor(Math.random() * 3)]);
      setTimeout(() => { if (!p.body.dead) whisper(p, c, false); }, 1600);
      setTimeout(() => { if (!p.body.dead && Math.hypot(p.x - c.x, p.z - c.z) < 0.6) whisper(p, c, false); }, 4400);
    }), 1.0, false),
  });
  opts.push({
    label: 'Lay a hand on it', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Touch', 1.4, 'pickup', () => {
      if (!CS().creatures.has(c.id) || c.dead) return;
      poke(p, c, 'touch');
      whisper(p, c, true);
    }), 1.3, false),
  });
});

// ------------------------------------------------------------------ host brain: it cannot move; it whispers when touched
function thinkSeated(c: Creature, dt: number): boolean {
  const n = net(c), m = c.mem;
  pulse(c);
  stop(c);
  if (m.anchor === undefined) m.anchor = { x: c.x, z: c.z, f: c.facing };
  c.x = m.anchor.x; c.z = m.anchor.z; c.facing = c.targetFacing = m.anchor.f;
  if (poked(c, 'sit')) { m.sitT = 6.5; m.whT = 6; }
  if (poked(c, 'touch')) { m.whT = 3.5; }
  m.sitT = Math.max(0, (m.sitT ?? 0) - dt); m.whT = Math.max(0, (m.whT ?? 0) - dt);
  n.s = m.sitT > 0 ? 1 : 0; n.w = m.whT > 0 ? 1 : 0;
  if (n.w && c.noiseCooldown <= 0) { playAt('hollow_mutter', c, 0.3, 5, 0.7); c.noiseCooldown = 2.5; }
  return true;
}
const SEATED = def({
  key: 'seated', name: 'The Seated', code: 'IN-01 // REMNANT, FURNISHED', temperament: 'peaceful', threat: 0,
  rule: { name: 'IT ONLY ASKS', text: 'It cannot move or hurt you. Sit in it and it whispers what it learned before it was made into a chair: true things about the inhabitants.', tell: 'That armchair has hands.' },
  hp: 30, walk: 0, run: 0, turn: 0, radius: 0.38, height: 1.3, sight: 8, fov: 2, hearing: 0.5,
  zones: ['office', 'lab', 'hospital', 'undercroft'], weight: 0.3, maxPerZone: 3, diet: 'none',
  sounds: { hurt: 'still_crack', death: 'hollow_die', idle: 'still_creak' },
  scan: {
    cls: 'Remnant / furniture',
    notes: [
      'An armchair made of a person: spine for the back, ribs for the springs, hands gripping the ends of the armrests.',
      'It is alive. It breathes. Its eyes follow you.',
      'Sit in it and it whispers what it learned: true things about the inhabitants.',
      'The King in Yellow makes them out of those who asked to know too much.',
    ],
  },
  gore: { blood: 'red', flesh: 0xc8a898, sever: ['handL', 'handR', 'head'], head: 'head' },
  build: buildSeated, animate: animateSeated, think: thinkSeated,
});
(SEATED as any).handlesSevered = true;
SEATED.animateGallery = (rig: Rig, t: number) => { animateSeated(rig, fakeCreature(SEATED, { id: 'sg', mem: { netMem: { w: 1 } } }), t, 1 / 60); };
horrify(SEATED, { twitch: 0.5, snap: 0.2 });
void dist;

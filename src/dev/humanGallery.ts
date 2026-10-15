// Dev lineup of survivors for visual QA of the character model and animation.
// Load it on top of an empty gallery:
//   open ?gallery=humans&zoom=48 (an empty, lit gallery room), then in the page:
//   await (await import('/src/dev/humanGallery.ts')).populate(window.__gallery, 'lineup')
// Sets: 'lineup' (outfits, idle), 'anim' (locomotion + actions), 'emotes', 'cond' (injuries).
import * as THREE from 'three';
import { Player } from '../entities/player';
import { randomAppearance, Appearance } from '../entities/humanRig';
import type { ActionAnim, FullBody, Stance } from '../entities/humanAnim';
import { createItem } from '../items/factory';
import { hasItemDef } from '../items/item';
import { Rng } from '../core/rng';

interface Spec { app?: Partial<Appearance>; wear: string[]; hold?: string; speed?: number; stance?: Stance; action?: ActionAnim; full?: FullBody; label: string; emote?: string; aim?: boolean; setup?: (p: Player) => void }

const OUTFITS: Spec[] = [
  { label: 'office', wear: ['shirt_office', 'slacks', 'dress_shoes'], app: { hairStyle: 'short', build: 'average', bodyShape: 0.1 } as any },
  { label: 'casual', wear: ['tshirt', 'jeans', 'sneakers'], app: { hairStyle: 'ponytail', bodyShape: 0.9, build: 'slim' } as any },
  { label: 'hoodie', wear: ['hoodie', 'sweatpants', 'sneakers', 'backpack_school'], app: { hairStyle: 'curly', build: 'average', bodyShape: 0.6 } as any },
  { label: 'worker', wear: ['tshirt_stripe', 'jeans', 'boots_work', 'gloves_work', 'hard_hat', 'vest_hiviz'], app: { hairStyle: 'buzz', build: 'broad', beard: true, bodyShape: 0 } as any },
  { label: 'leather', wear: ['tshirt', 'jacket_leather', 'jeans', 'boots_work', 'sunglasses'], app: { hairStyle: 'long', build: 'average', bodyShape: 0.3 } as any },
  { label: 'lab', wear: ['shirt_office', 'lab_coat', 'slacks', 'dress_shoes', 'glasses'], app: { hairStyle: 'bob', build: 'slim', bodyShape: 1 } as any },
  { label: 'winter', wear: ['sweater', 'coat_winter', 'jeans', 'boots_work', 'beanie', 'scarf'], app: { hairStyle: 'short', build: 'broad', bodyShape: 0.2 } as any },
  { label: 'scrubs', wear: ['scrubs_top', 'scrubs_pants', 'sneakers', 'face_mask', 'gloves_rubber'], app: { hairStyle: 'bob', bodyShape: 0.8 } as any },
  { label: 'security', wear: ['security_uniform', 'slacks', 'dress_shoes', 'hat_cap'], app: { hairStyle: 'bald', build: 'broad', bodyShape: 0 } as any },
  { label: 'pajamas', wear: ['pajamas', 'slippers'], app: { hairStyle: 'long', bodyShape: 0.7 } as any },
  { label: 'skirt', wear: ['tshirt_stripe', 'skirt', 'sneakers'], app: { hairStyle: 'ponytail', bodyShape: 1, build: 'slim' } as any },
  { label: 'janitor', wear: ['janitor_uniform', 'boots_work', 'gas_mask', 'backpack_hiking'], app: { hairStyle: 'short', build: 'average' } as any },
];

const ANIMS: Spec[] = [
  { label: 'idle', wear: ['tshirt', 'jeans', 'sneakers'] },
  { label: 'walk', wear: ['hoodie', 'jeans', 'sneakers'], speed: 1.9 },
  { label: 'run', wear: ['tshirt', 'shorts', 'sneakers'], speed: 4.1 },
  { label: 'sneak', wear: ['hoodie', 'sweatpants', 'sneakers'], speed: 1.1, stance: 'sneak' },
  { label: 'aim gun', wear: ['security_uniform', 'slacks', 'dress_shoes'], hold: 'pistol', aim: true },
  { label: 'aim 2h', wear: ['tshirt', 'jeans', 'boots_work'], hold: 'bat_baseball', aim: true },
  { label: 'swing', wear: ['tshirt', 'jeans', 'boots_work'], hold: 'crowbar', action: 'swing' },
  { label: 'eat', wear: ['sweater', 'jeans', 'sneakers'], action: 'eat' },
  { label: 'sit', wear: ['shirt_office', 'slacks', 'dress_shoes'], full: 'sit' },
  { label: 'sleep', wear: ['pajamas'], full: 'lie' },
  { label: 'crawl', wear: ['tshirt', 'jeans', 'sneakers'], stance: 'crawl', speed: 0.3 },
  { label: 'loot', wear: ['jacket_denim', 'tshirt', 'jeans', 'sneakers'], action: 'loot' },
];

const EMOTE_SET: Spec[] = ['wave', 'flex', 'dance', 'jumping_jacks', 'shrug', 'salute', 'point', 'facepalm', 'sit_wait', 'cheer', 'clap', 'bow'].map((e, i) => ({
  label: e, emote: e, wear: [['tshirt', 'jeans', 'sneakers'], ['hoodie', 'sweatpants', 'sneakers'], ['shirt_office', 'slacks', 'dress_shoes'], ['sweater', 'skirt', 'sneakers']][i % 4],
}));
const COND_SET: Spec[] = [
  { label: 'bleeding arm', wear: ['tshirt', 'jeans', 'sneakers'], setup: (p) => { p.body.addInjury('farm_l', 'laceration', 0.8); p.body.addInjury('torso_u', 'deep', 0.7); } },
  { label: 'bandaged', wear: ['tshirt', 'jeans', 'sneakers'], setup: (p) => { const a = p.body.addInjury('uarm_r', 'laceration', 0.7); a.bandage = { clean: true, soak: 0.1, sterile: true }; const b = p.body.addInjury('head', 'scratch', 0.6); b.bandage = { clean: true, soak: 0.6, sterile: false }; } },
  { label: 'splint leg', wear: ['tshirt', 'shorts', 'sneakers'], speed: 1.2, setup: (p) => { const a = p.body.addInjury('shin_l', 'fracture', 0.9); a.splinted = true; a.bandage = { clean: true, soak: 0, sterile: true }; } },
  { label: 'pale + wet', wear: ['hoodie', 'jeans', 'sneakers'], setup: (p) => { p.body.blood = 40; p.body.wetness = 80; } },
  { label: 'corrupt', wear: ['shirt_office', 'slacks', 'dress_shoes'], setup: (p) => { p.body.corruption = 80; } },
  { label: 'bloody clothes', wear: ['sweater', 'jeans', 'boots_work'], setup: (p) => { for (const w of p.worn.values()) w.bloody = 0.8; p.body.addInjury('thigh_r', 'bite', 0.9); } },
  { label: 'limp walk', wear: ['tshirt', 'jeans', 'sneakers'], speed: 1.2, setup: (p) => { p.body.addInjury('thigh_r', 'deep', 0.9); p.body.addInjury('shin_r', 'fracture', 0.8); } },
  { label: 'broken arm', wear: ['tshirt', 'jeans', 'sneakers'], setup: (p) => { p.body.addInjury('farm_l', 'fracture', 0.9); } },
  { label: 'exhausted', wear: ['tshirt', 'shorts', 'sneakers'], setup: (p) => { p.body.endurance = 0.02; } },
  { label: 'panic', wear: ['tshirt', 'jeans', 'sneakers'], setup: (p) => { p.body.panic = 95; } },
  { label: 'downed', wear: ['tshirt', 'jeans', 'sneakers'], setup: (p) => { p.body.downed = true; } },
  { label: 'dead', wear: ['tshirt', 'jeans', 'sneakers'], setup: (p) => { p.body.addInjury('torso_u', 'bite', 1); p.body.dead = true; } },
];

const HAIR_SET: Spec[] = (['short', 'long', 'buzz', 'bald', 'ponytail', 'curly', 'bob'] as const).map((h, i) => ({
  label: h, wear: ['tshirt', 'jeans', 'sneakers'], app: { hairStyle: h, bodyShape: i % 2 ? 0.85 : 0.15, facialHair: i % 2 ? 'none' : (['beard', 'stubble', 'moustache', 'goatee'] as const)[(i >> 1) % 4], face: i % 6, freckles: i === 4 ? 0.8 : 0, age: i === 3 ? 0.8 : 0.1, scars: i === 2 ? 2 : 0 } as any,
}));
const HOLD_SET: Spec[] = [
  { label: 'pistol', wear: ['tshirt', 'jeans', 'sneakers'], hold: 'pistol', aim: true },
  { label: 'bat', wear: ['tshirt', 'jeans', 'sneakers'], hold: 'bat_baseball', aim: true },
  { label: 'knife', wear: ['tshirt', 'jeans', 'sneakers'], hold: 'knife_hunting', aim: true },
  { label: 'axe swing', wear: ['tshirt', 'jeans', 'sneakers'], hold: 'fire_axe', action: 'swing2h' },
  { label: 'unarmed', wear: ['tshirt', 'jeans', 'sneakers'], aim: true },
  { label: 'spear', wear: ['tshirt', 'jeans', 'sneakers'], hold: 'spear_wood', aim: true },
];

function pickHold(keys: string[]) { for (const k of keys) if (hasItemDef(k)) return k; return ''; }

/** co-op mirror check: a local survivor and a remote copy driven only by its netState() snapshots */
export async function netMirror(g: { pr: any; z: any; tgt: THREE.Vector3 }) {
  const A = new Player('a', 'Local', randomAppearance(() => 0.42), true);
  for (const k of ['hoodie', 'jeans', 'boots_work', 'beanie', 'backpack_hiking']) if (hasItemDef(k)) { const it = createItem(k); A.inv.add(it); A.wear(it); }
  const bat = createItem('bat_baseball'); A.inv.add(bat); A.equip(bat, 'R');
  const inj = A.body.addInjury('farm_l', 'laceration', 0.8); void inj;
  const b2 = A.body.addInjury('shin_r', 'fracture', 0.8); b2.splinted = true;
  A.x = 5; A.z = 5; A.facing = Math.PI / 4;
  const B = new Player('b', 'Remote', A.app, false);
  B.x = 6.2; B.z = 5; B.facing = Math.PI / 4;
  g.pr.scene.add(A.rig.root); g.pr.scene.add(B.rig.root);
  g.tgt.set(5.6, 1, 5);
  let outKey = '', t = 0, last = performance.now();
  const tick = () => {
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (t > 1 && t < 1.05) A.emote('wave');
    A.updateVisual(dt);
    const st = JSON.parse(JSON.stringify(A.netState()));
    // what net.ts stepRemote() does
    B.remote = { tx: st.x, tz: st.z, tf: st.f, t: 0, state: st };
    B.speed = st.sp; B.stance = st.st; B.running = st.run; B.aiming = st.aim; B.scannerOpen = !!st.th;
    B.full = st.fb; B.actionAnim = st.ac; B.actionT = st.at; B.actionDur = st.ad; B.flashlightOn = st.light;
    B.body.downed = st.down; B.body.dead = st.dead;
    if ((B.handR?.key || '') !== st.hr) B.handR = st.hr ? ({ uid: -1, key: st.hr, cond: 1, age: 0 } as any) : null;
    const ok = JSON.stringify(st.out); if (ok !== outKey) { outKey = ok; B.rig.setOutfit(st.out); }
    B.updateVisual(dt);
    requestAnimationFrame(tick);
  };
  tick();
  (window as any).__net = { A, B };
}

export async function populate(g: { pr: any; z: any; tgt: THREE.Vector3 }, set = 'lineup', opts: { cols?: number; spacing?: number; seed?: number; only?: number[]; facing?: number } = {}) {
  let specs = set === 'anim' ? ANIMS : OUTFITS;
  if (set === 'emotes') specs = EMOTE_SET;
  if (set === 'cond') specs = COND_SET;
  if (set === 'hair') specs = HAIR_SET;
  if (set === 'hold') specs = HOLD_SET;
  if (opts.only) specs = opts.only.map((i) => specs[i]);
  const rng = new Rng(opts.seed ?? 7);
  const cols = opts.cols ?? 6, sp = opts.spacing ?? 1.6;
  const players: { p: Player; s: Spec; t: number }[] = [];
  specs.forEach((s, i) => {
    const app = { ...randomAppearance(() => rng.next()), ...(s.app || {}) } as Appearance;
    const p = new Player('g' + i, s.label, app, false);
    for (const k of s.wear) if (hasItemDef(k)) { const it = createItem(k); p.inv.add(it); p.wear(it); }
    if (s.hold) { const k = pickHold([s.hold, 'crowbar', 'pipe']); if (k) { const it = createItem(k); p.inv.add(it); p.equip(it, 'R'); } }
    p.speed = s.speed ?? 0; p.stance = s.stance ?? 'stand'; p.full = s.full ?? ''; p.actionAnim = s.action ?? ''; p.aiming = !!s.aim;
    p.actionDur = 1.2;
    s.setup?.(p);
    if (s.emote) p.emote(s.emote, true);
    const x = 4 + (i % cols) * sp, z = 4 + Math.floor(i / cols) * sp * 1.4;
    p.x = x; p.z = z; p.facing = opts.facing ?? Math.PI / 4 + 0.35; // face the camera (3/4 view)
    g.pr.scene.add(p.rig.root);
    players.push({ p, s, t: 0 });
  });
  g.tgt.set(4 + ((cols - 1) * sp) / 2, 0.8, 4 + ((Math.ceil(specs.length / cols) - 1) * sp * 1.4) / 2);
  const labels = players.map((e) => {
    const el = document.createElement('div');
    el.textContent = e.s.label;
    el.style.cssText = 'position:fixed;color:#fff;font:11px monospace;background:#0008;padding:1px 3px;transform:translate(-50%,0);z-index:20;pointer-events:none';
    document.body.appendChild(el);
    return el;
  });
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const e of players) {
      e.t += dt;
      if (e.s.action && !e.p.actions.current) { e.p.actionT = (e.p.actionT + dt) % e.p.actionDur; }
      e.p.updateVisual(dt);
    }
    players.forEach((e, i) => { const sp = g.pr.worldToScreen(new THREE.Vector3(e.p.x, 0, e.p.z + 0.3)); labels[i].style.left = sp.x + 'px'; labels[i].style.top = sp.y + 'px'; });
    requestAnimationFrame(tick);
  };
  tick();
  (window as any).__humans = players;
  return players.length;
}

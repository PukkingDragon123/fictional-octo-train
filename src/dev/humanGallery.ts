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

const FULL_SET: Spec[] = (['sit', 'kneel', 'lie', 'lie_side', 'carried', 'vault'] as FullBody[]).map((f): Spec => ({ label: f, wear: ['shirt_office', 'jeans', 'sneakers'], full: f }))
  .concat([{ label: 'swim', wear: ['tshirt', 'shorts'], stance: 'swim', speed: 1 }, { label: 'hardhat', wear: ['tshirt', 'jeans', 'boots_work', 'hard_hat', 'gloves_work'] }, { label: 'helmet', wear: ['tshirt', 'jeans', 'sneakers', 'helmet_bike', 'swim_goggles'] }]);

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

/** gait filmstrip: the same survivor at 8 phases of a cycle, seen from the side */
export async function filmstrip(g: { pr: any; z: any; tgt: THREE.Vector3 }, speed = 2, stance: Stance = 'stand', wear = ['tshirt', 'jeans', 'sneakers'], extra?: (p: Player) => void) {
  const app = randomAppearance(() => 0.37);
  const ps: Player[] = [];
  for (let i = 0; i < 8; i++) {
    const p = new Player('f' + i, 'f' + i, app, false);
    for (const k of wear) if (hasItemDef(k)) { const it = createItem(k); p.inv.add(it); p.wear(it); }
    extra?.(p);
    p.speed = speed; p.stance = stance; p.x = 3 + i * 0.75; p.z = 5; p.facing = -Math.PI / 4; // side-on to the camera
    p.anim.phase = (i / 8) * Math.PI * 2;
    g.pr.scene.add(p.rig.root); ps.push(p);
  }
  g.tgt.set(3 + 3.5 * 0.75, 0.9, 5);
  let last = performance.now();
  const tick = () => { const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; for (const p of ps) { p.updateVisual(dt); p.anim.phase -= (p.speed / 1.42) * Math.PI * 2 * dt * 0.999; } requestAnimationFrame(tick); };
  tick();
}

/** an action at 8 moments of its cycle (side view) */
export async function actionStrip(g: { pr: any; z: any; tgt: THREE.Vector3 }, action: ActionAnim, hold = '', dur = 1.0, facing = -Math.PI / 4) {
  const app = randomAppearance(() => 0.37);
  const ps: Player[] = [];
  for (let i = 0; i < 8; i++) {
    const p = new Player('s' + i, 's' + i, app, false);
    for (const k of ['tshirt', 'jeans', 'sneakers']) { const it = createItem(k); p.inv.add(it); p.wear(it); }
    if (hold && hasItemDef(hold)) { const it = createItem(hold); p.inv.add(it); p.equip(it, 'R'); }
    p.x = 3 + i * 0.85; p.z = 5; p.facing = facing; p.actionAnim = action; p.actionDur = dur;
    g.pr.scene.add(p.rig.root); ps.push(p);
  }
  g.tgt.set(3 + 3.5 * 0.85, 1.0, 5);
  let last = performance.now();
  const tick = () => { const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; ps.forEach((p, i) => { p.actionT = (i / 8) * dur; (p as any).visT = p.actionT; (p as any).lastAnim = action; p.updateVisual(dt); }); requestAnimationFrame(tick); };
  tick();
}

export async function populate(g: { pr: any; z: any; tgt: THREE.Vector3 }, set = 'lineup', opts: { cols?: number; spacing?: number; seed?: number; only?: number[]; facing?: number } = {}) {
  let specs = set === 'anim' ? ANIMS : OUTFITS;
  if (set === 'emotes') specs = EMOTE_SET;
  if (set === 'cond') specs = COND_SET;
  if (set === 'hair') specs = HAIR_SET;
  if (set === 'hold') specs = HOLD_SET;
  if (set === 'full') specs = FULL_SET;
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

// ------------------------------------------------------------------ studio: standalone close-ups (menu-scene lighting)
/**
 * A standalone lit stage like the menus and the operating table use: the
 * scene rendered at low resolution and upscaled with nearest filtering, a warm
 * key, a cold rim, a weak fill, preview rigs with their own black outline.
 *   ?gallery=humans then: (await import('/src/dev/humanGallery.ts')).studio({ mode: 'heads' })
 * modes: 'lineup' (full bodies), 'heads' (faces, 3/4 view), 'one' (one subject, waist up), 'anim' (an action loop)
 */
export async function studio(o: { mode?: string; n?: number; seed?: number; scale?: number; wear?: string[][]; yaw?: number; app?: Partial<Appearance>[]; action?: string; t?: number; emote?: string } = {}) {
  const { createPreviewRig } = await import('../entities/humanRig');
  const mode = o.mode || 'lineup';
  const scale = o.scale ?? 3;
  const W = Math.floor(innerWidth / scale), H = Math.floor(innerHeight / scale);
  const cv = document.createElement('canvas');
  cv.style.cssText = `position:fixed;left:0;top:0;width:${W * scale}px;height:${H * scale}px;image-rendering:pixelated;z-index:30`;
  document.body.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
  r.setPixelRatio(1); r.setSize(W, H, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14160f);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: 0x2a2a22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshLambertMaterial({ color: 0x23261c }));
  wall.position.set(0, 5, -3); scene.add(wall);
  scene.add(new THREE.HemisphereLight(0x8a96a8, 0x2a2018, 0.55));
  const key = new THREE.DirectionalLight(0xffe6c8, 2.1); key.position.set(-2.2, 3.2, 3); key.castShadow = true; scene.add(key);
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -1;
  const rim = new THREE.DirectionalLight(0x7aa0ff, 1.3); rim.position.set(2.5, 2, -2.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9ab090, 0.35); fill.position.set(2.5, 0.8, 2); scene.add(fill);
  const rng = new Rng(o.seed ?? 11);
  const WEAR = o.wear ?? [
    ['prison_jumpsuit', 'socks', 'canvas_slipons'], ['tshirt', 'jeans', 'sneakers'], ['hoodie', 'sweatpants', 'boots_work'], ['shirt_office', 'slacks', 'dress_shoes', 'glasses'],
    ['jacket_leather', 'tshirt', 'jeans', 'boots_work'], ['guard_uniform', 'boots_work'], ['scrubs_top', 'scrubs_pants', 'sneakers'], ['sweater', 'skirt', 'sneakers', 'beanie'],
  ];
  const n = o.n ?? (mode === 'heads' ? 4 : mode === 'one' || mode === 'anim' ? 1 : 6);
  const rigs: any[] = [];
  for (let i = 0; i < n; i++) {
    const app = { ...randomAppearance(() => rng.next()), ...((o.app && o.app[i % o.app.length]) || {}) } as Appearance;
    const p = new Player('st' + i, 'st' + i, app, false);
    for (const k of WEAR[i % WEAR.length]) if (hasItemDef(k)) { const it = createItem(k); p.inv.add(it); p.wear(it); }
    const rig = createPreviewRig(p.app, p.computeOutfit());
    rig.skin.castShadow = true;
    const sp = mode === 'heads' ? 0.36 : 0.85;
    rig.root.position.set((i - (n - 1) / 2) * sp, 0, 0);
    rig.root.rotation.y = o.yaw ?? (mode === 'heads' ? 0.45 : 0.3);
    scene.add(rig.root);
    rigs.push(rig);
  }
  const cam = new THREE.PerspectiveCamera(mode === 'heads' ? 18 : mode === 'one' ? 24 : 30, W / H, 0.05, 50);
  if (mode === 'heads') { cam.position.set(0, 1.62, 2.1); cam.lookAt(0, 1.58, 0); }
  else if (mode === 'one') { cam.position.set(0, 1.4, 2.0); cam.lookAt(0, 1.3, 0); }
  else if (mode === 'anim') { cam.position.set(0, 1.2, 4.2); cam.lookAt(0, 0.9, 0); }
  else { cam.position.set(0, 1.25, 4.6 + n * 0.35); cam.lookAt(0, 0.92, 0); }
  let last = performance.now(), t = 0;
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    for (const rig of rigs) {
      if (o.action) rig.update(dt, { action: o.action, actionT: o.t ?? (t % 1.2), actionDur: 1.2, holding: true });
      else rig.update(dt);
    }
    r.render(scene, cam);
    requestAnimationFrame(loop);
  };
  if (o.emote) for (const rig of rigs) rig.playEmote(o.emote, true);
  loop();
  (window as any).__studio = { scene, cam, rigs, r, key, rim, fill };
  return rigs.length;
}

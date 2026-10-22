// First-person eating and drinking. Eating something opens a close-up on the
// overlay stage (src/fp/fp.ts): the shared smooth arms holding a smooth
// low-poly model of the food (foodMesh.ts); every bite dents it for real and
// shows the inside (crumb, flesh, filling). Click / tap / Space to bite: the food lunges,
// CHOMP, crumbs fly, the view bobs as you chew, and the bite drops into the
// stomach jar. Drinking tilts a bottle up for gulps. Leave it alone and you
// keep eating slowly; move or press Esc to stop.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera, fpBlendLinear } from '../../fp/fp';
import { fpArmsFor, type FpArm, type HandPose } from '../../fp/hands';
import { itemDef, freshness, type Item, type FluidType } from '../../items/item';
import { punch, shake } from '../../gfx/juice';
import { mix, shade } from './pix';
import type { BodyHud } from './bodyHud';
import { FoodModel, type Kind, type Recipe } from './foodMesh';

const MAXC = 120;
/** crumb size (m) */
const CS = 0.006;
const AUTO_BITE = 2.4, AUTO_GULP = 1.8;

interface Crumb { p: THREE.Vector3; v: THREE.Vector3; life: number; s: number; c: THREE.Color; g: number; on: boolean }

/** keyword → [kind, skin, flesh] */
const LOOKS: [RegExp, Kind, number, number][] = [
  [/apple/, 'fruit', 0xc8202a, 0xf2e2b0], [/orange|tangerine|mandarin/, 'fruit', 0xf08a1a, 0xf8b448], [/pear|lime/, 'fruit', 0x9ac040, 0xf0eab8],
  [/peach|apricot/, 'fruit', 0xf09a6a, 0xf8c070], [/tomato/, 'fruit', 0xd82818, 0xf05a40], [/onion/, 'fruit', 0xc8a070, 0xf0e8d8], [/potato/, 'fruit', 0xa8804a, 0xf0e0a0],
  [/banana/, 'long', 0xf0d040, 0xf8f0c8], [/carrot/, 'long', 0xf07a18, 0xf89a3a], [/cucumber|zucchini/, 'long', 0x3a7a2a, 0xd8f0b0], [/corn/, 'long', 0xf0d040, 0xf8e070],
  [/sandwich|burger|sub\b/, 'sandwich', 0xd8a050, 0xf4e8c8],
  [/bread|loaf|bun\b|toast|baguette|roll\b|bagel/, 'loaf', 0xb87a3a, 0xf2e2c2],
  [/cookie|biscuit|cracker|wafer|muffin|cake|pie|brownie|donut|doughnut|pastry/, 'cookie', 0xc8904a, 0xe8c080],
  [/chocolate|candy|ration|granola|protein|energy bar|nougat|toffee|fudge|\bbar\b/, 'bar', 0x6a3a1a, 0x8a5028],
  [/cheese/, 'cheese', 0xf0c040, 0xf8d860], [/egg/, 'egg', 0xf6f2e6, 0xf0b020],
  [/fish|salmon|trout|carp|eel/, 'fish', 0xa8b4bc, 0xf0a888],
  [/steak|meat|jerky|sausage|bacon|ham\b|chicken|rat\b|flesh|leg|rib|chop|patty|liver|heart|mutton|venison|drumstick/, 'meat', 0x7a3a18, 0xc8785a],
  [/cereal|rice|porridge|oat|noodle|pasta|salad|stew|soup|chili/, 'bowl', 0xd8b070, 0xf0d898],
];
const ING: Record<string, [Kind, number, number]> = {
  meat: ['meat', 0x7a3a18, 0xc8785a], fish: ['fish', 0xa8b4bc, 0xf0a888], fruit: ['fruit', 0xd84a2a, 0xf2d8a0], grain: ['loaf', 0xc89048, 0xf0dcb0],
  sweet: ['bar', 0x6a3a1a, 0x8a5028], dairy: ['cheese', 0xf0e0b0, 0xf8f0d8], veg: ['fruit', 0x4a9a3a, 0xc8e8a0], egg: ['egg', 0xf6f2e6, 0xf0b020],
  sauce: ['bowl', 0xb83a1a, 0xd85a2a], spice: ['blob', 0xa8582a, 0xc87a3a], weird: ['weird', 0x6a2aff, 0x3af2ff],
};
const FLUID: Record<string, number> = {
  water: 0x8ac8f0, tainted: 0x8a9a6a, almond: 0xe8dcc0, gasoline: 0xd0b840, bleach: 0xeef4e4, juice: 0xf0a020,
  soda: 0x5a2a10, alcohol: 0xd8a040, milk: 0xf8f8f0, coolant: 0x40e040, static: 0x9a6aff,
};

function recipe(it: Item): Recipe {
  const d = itemDef(it.key);
  const f = d.food!;
  const s = (d.key + ' ' + d.name).toLowerCase().replace(/_/g, ' ');
  let kind: Kind = 'blob', skin = 0xb08a5a, flesh = 0xd8b888;
  const hit = LOOKS.find((l) => l[0].test(s));
  if (f.canned || f.leaves === 'empty_can' || /\bcan\b|canned|tin\b|beans|ravioli|spaghetti/.test(s)) { kind = 'can'; skin = 0xa84a2a; flesh = 0xc86a3a; if (hit) { skin = hit[2]; flesh = hit[3]; } if (/bean/.test(s)) { skin = 0xa8502a; flesh = 0xc87040; } }
  else if (hit) { kind = hit[1]; skin = hit[2]; flesh = hit[3]; }
  else if (f.ingredient && ING[f.ingredient]) [kind, skin, flesh] = ING[f.ingredient];
  if (f.ingredient === 'weird' || /static|glitch|void|anomal|almond water/.test(s)) kind = 'weird';
  const fr = freshness(it);
  const cooked = (it.cooked ?? 0) >= 1 && (it.cooked ?? 0) < 1.6;
  const burnt = (it.cooked ?? 0) >= 1.6;
  const raw = !!f.raw && !cooked && !burnt;
  if (raw && (kind === 'meat' || kind === 'fish')) { skin = kind === 'fish' ? 0xb8c0c8 : 0xb83040; flesh = kind === 'fish' ? 0xf09080 : 0xd85060; }
  if (burnt) { skin = mix(skin, 0x1e140c, 0.7); flesh = mix(flesh, 0x5a3a20, 0.4); }
  if (fr === 'stale') { skin = mix(skin, 0x8a8a6a, 0.2); flesh = mix(flesh, 0x9a9a7a, 0.15); }
  if (fr === 'rotten') { skin = mix(skin, 0x6a7a3a, 0.45); flesh = mix(flesh, 0x8a8a4a, 0.4); }
  const wrap = d.tint ?? (kind === 'bar' ? 0x7a7a3a : 0xc8c0b0);
  const bad: Recipe['bad'] = fr === 'rotten' ? 'rotten' : raw ? 'raw' : (f.poison ?? 0) > 0.2 ? 'poison' : '';
  return {
    kind, skin, flesh, wrap, extra: kind === 'sandwich' ? 0x6ac040 : kind === 'cheese' ? 0xd8a020 : 0x3a1a0a,
    crunchy: /apple|carrot|cracker|biscuit|cookie|chip|toast|granola|bar\b|ration|cucumber|corn|nut/.test(s) || burnt || kind === 'bar' || kind === 'cookie',
    juicy: kind === 'fruit' || kind === 'meat' || kind === 'fish' || kind === 'long',
    hot: cooked && (it.age ?? 99) < 1.5, bad, label: d.name,
  };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _hd = new THREE.Vector3(0.04, 0.03, 0.04);
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _g = new THREE.Vector3(), _mb = new THREE.Matrix4();
/** long foods are held by the far end */
const LONG = new Set<Kind>(['bar', 'long', 'meat', 'fish', 'loaf', 'sandwich']);
const _c = new THREE.Color();

export class EatFp {
  static hints = 0;
  active = false;
  private mode: 'eat' | 'drink' = 'eat';
  private act: any = null;
  private root: THREE.Group | null = null;
  private grip = new THREE.Group();
  private food = new THREE.Group();
  private cMesh: THREE.InstancedMesh | null = null;
  private model: FoodModel | null = null;
  /** how much of the item is left (0..1) */
  private left = 1;
  private crumbs: Crumb[] = [];
  /** the shared smooth first-person arms (src/fp/hands.ts) */
  private arms: { right: FpArm; left: FpArm } | null = null;
  private props = new Map<string, THREE.Object3D>();
  private prop: THREE.Object3D | null = null;
  private liquid: THREE.Mesh | null = null;
  private spoon: THREE.Group | null = null;
  private lump: THREE.Mesh | null = null;
  private rec: Recipe | null = null;
  private t = 0; private raise = 0; private lunge = -1; private chew = -1; private refuse = -1; private lowerT = -1;
  private idle = 0; private combo = 0; private lastBite = -9; private bites = 0;
  private pendingJar: { t: number; c: number; s: number; bad: boolean }[] = [];
  private drunk = 0; private gulpT = -1; private fluidC = 0x8ac8f0; private fluidType: FluidType = 'water';
  private catcher: HTMLDivElement | null = null;
  private hintEl: HTMLDivElement | null = null;
  private key = (e: KeyboardEvent) => this.onKey(e);

  constructor(private hud: BodyHud) {
    bus.on('fpLost', (name: string) => { if (name === 'eat' && this.active) this.finish(true); });
  }

  // =================================================================== start / end
  startEat(a: any): boolean {
    const it: Item = a.it;
    const d = itemDef(it.key);
    if (!d.food || d.food.pills || !G.pr?.overlayScene || this.active) return false;
    if (!this.hud.canEat()) { bus.emit('think', a.p, ['I can\'t. Not another bite.', 'My stomach says no.', 'Too full.'][Math.floor(Math.random() * 3)]); G.audio?.flat?.('bh_swallow', 'voice', 0.4, 0.7); a.done = true; return true; }
    if (!fpClaim('eat', 5, { cinematic: 'full' })) return false;
    this.ensure();
    this.mode = 'eat'; this.act = a; this.rec = recipe(it);
    this.begin();
    this.buildFood(it);
    this.openDom(document.documentElement.classList.contains('nc-touch') ? 'tap to take a bite' : 'click to take a bite  ·  esc to stop');
    if (this.rec.bad === 'rotten') bus.emit('think', a.p, ['It smells wrong.', 'Is that... fuzz?', 'Don\'t look at it. Just eat.'][Math.floor(Math.random() * 3)]);
    G.audio?.ui?.('bh_wrap', 0.4);
    return true;
  }
  startDrink(a: any): boolean {
    const it: Item = a.it;
    if (!it?.fluid || !G.pr?.overlayScene || this.active) return false;
    if (!fpClaim('eat', 5, { cinematic: 'full' })) return false;
    this.ensure();
    this.mode = 'drink'; this.act = a; this.rec = null;
    this.fluidType = it.fluid.type; this.fluidC = FLUID[it.fluid.type] ?? 0x8ac8f0;
    this.begin();
    this.buildDrink(it);
    this.openDom(document.documentElement.classList.contains('nc-touch') ? 'tap to drink' : 'click to drink  ·  esc to stop');
    G.audio?.ui?.('band_tick', 0.2);
    return true;
  }
  private begin() {
    this.active = true; this.t = 0; this.raise = 0; this.lunge = -1; this.chew = -1; this.refuse = -1; this.lowerT = -1;
    this.idle = 0; this.combo = 0; this.lastBite = -9; this.bites = 0; this.drunk = 0; this.gulpT = -1;
    this.pendingJar.length = 0;
    for (const c of this.crumbs) c.on = false;
    const p = G.local;
    if (p && this.arms) { const look = { skin: p.app?.skin ?? 0xe8b98f, sleeve: 0xeeb415 }; this.arms.right.setLook(look); this.arms.left.setLook(look); }
    this.root!.visible = true;
  }
  /** the action ended (moved away, Esc, item gone) */
  end(a?: any) { if (!this.active || (a && a !== this.act)) return; this.finish(false); }
  abort(_why: string) { if (!this.active) return; const a = this.act; this.finish(false); if (a) { a.done = true; } }
  private finish(lost: boolean) {
    // throw whatever was mid-swallow into the jar now
    for (const j of this.pendingJar) this.hud.jar.bite(j.c, j.s, j.bad);
    this.pendingJar.length = 0;
    this.active = false;
    const a = this.act; this.act = null;
    if (a && !a.done) a.done = true;
    if (this.catcher) { const c = this.catcher; this.catcher = null; c.classList.add('out'); setTimeout(() => c.remove(), 400); }
    window.removeEventListener('keydown', this.key, true);
    if (G.input) G.input.pointerOverUI = false;
    if (!lost && fpOwner() === 'eat') { const cam = fpCamera(); cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); } fpRelease('eat'); }
    if (this.root) this.root.visible = false;
  }

  // =================================================================== scene
  private ensure() {
    if (this.root) return;
    const g = this.root = fpGroup('eat');
    g.add(new THREE.HemisphereLight(0xfff0d8, 0x3a2a24, 1.15));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.6); key.position.set(-0.5, 0.8, 0.6); g.add(key);
    const rim = new THREE.DirectionalLight(0x8ab0ff, 0.6); rim.position.set(0.6, 0.2, -0.8); g.add(rim);
    // crumbs: small soft lumps
    const lumpGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const cm = this.cMesh = new THREE.InstancedMesh(lumpGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXC);
    cm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cm.count = 0; cm.frustumCulled = false;
    cm.setColorAt(0, _c.setHex(0xffffff));
    for (let i = 0; i < MAXC; i++) this.crumbs.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, s: 1, c: new THREE.Color(), g: 1, on: false });
    this.grip.add(this.food);
    g.add(this.grip, cm);
    this.arms = fpArmsFor(G.local);
    g.add(this.arms.right.root, this.arms.left.root);
    // spoon for cans and bowls
    const sp = this.spoon = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xc8ccd2 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0035, 0.13, 8), steel); handle.scale.set(1.4, 1, 0.55); handle.rotation.x = Math.PI / 2; handle.position.z = 0.07; sp.add(handle);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel); bowl.scale.set(1, 0.5, 1.4); bowl.rotation.x = Math.PI; sp.add(bowl);
    const lump = this.lump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.013, 1), new THREE.MeshLambertMaterial({ color: 0xc86a3a })); lump.scale.set(1, 0.55, 1.2); lump.position.y = 0.004; sp.add(lump);
    g.add(sp);
  }
  private propFor(kind: string): THREE.Object3D {
    let o = this.props.get(kind);
    if (o) return o;
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
    if (kind === 'can') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.09, 14, 1, true), metal); c.position.y = 0.03; g.add(c);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.06, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0xc83a2a })); label.position.y = 0.025; g.add(label);
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 14), metal); bot.position.y = -0.014; g.add(bot);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.002, 14), metal); lid.position.set(0.02, 0.09, -0.03); lid.rotation.x = -1.1; g.add(lid);
    } else if (kind === 'bowl') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe8e0d0, side: THREE.DoubleSide }));
      b.rotation.x = Math.PI; b.position.y = 0.035; b.scale.y = 0.7; g.add(b);
    } else if (kind === 'bottle' || kind === 'canteen') {
      const glass = new THREE.MeshLambertMaterial({ color: kind === 'canteen' ? 0x5a6a3a : 0xd8f0f8, transparent: kind !== 'canteen', opacity: 0.35, depthWrite: false });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.16, 12, 1, true), glass); g.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.05, 12, 1, true), glass); neck.position.y = 0.105; g.add(neck);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.016, 10), new THREE.MeshLambertMaterial({ color: kind === 'canteen' ? 0x2a2a2a : 0x2a7ad8 })); cap.position.y = 0.14; cap.rotation.z = 0.8; cap.position.x = 0.03; g.add(cap);
      const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0345, 0.0345, 0.05, 12, 1, true), new THREE.MeshLambertMaterial({ color: kind === 'canteen' ? 0x4a5a2a : 0xf2f2f2 })); g.add(lab);
    } else if (kind === 'dcan') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14), new THREE.MeshLambertMaterial({ color: 0xc82a2a })); g.add(c);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.01, 14), metal); top.position.y = 0.064; g.add(top);
    } else if (kind === 'mug') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0xe8e4dc, side: THREE.DoubleSide })); g.add(m);
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 14), m.material as THREE.Material); bot.position.y = -0.044; g.add(bot);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 10, Math.PI), m.material as THREE.Material); h.position.x = 0.04; h.rotation.z = -Math.PI / 2; g.add(h);
    }
    g.visible = false;
    this.root!.add(g);
    this.props.set(kind, g);
    return g;
  }

  private clearModel() { if (this.model) { this.model.dispose(); this.model = null; } }
  private buildFood(it: Item) {
    const r = this.rec!;
    this.clearModel();
    const m = this.model = new FoodModel(r, (Math.random() * 1e6) | 0);
    this.food.add(m.group);
    m.group.position.set(0, r.kind === 'can' ? 0.07 - m.half.y : r.kind === 'bowl' ? 0.032 : 0, 0);
    // a half-eaten thing comes back half-eaten
    const eaten = Math.max(0, Math.min(0.95, it.eaten ?? 0));
    this.left = 1 - eaten;
    for (let i = 0; i < Math.round(eaten * 8); i++) m.bite(this.mouthFor(m), 1, () => {});
    m.setLevel(this.left);
    this.food.rotation.set(0, 0, 0); this.food.position.set(0, 0, 0); this.food.scale.setScalar(1);
    for (const p of this.props.values()) p.visible = false;
    this.prop = null; this.liquid = null;
    const cont = r.kind === 'can' || r.kind === 'bowl';
    this.spoon!.visible = cont;
    if (cont) {
      this.prop = this.propFor(r.kind); this.prop.visible = true;
      this.food.add(this.prop);
      (this.lump!.material as THREE.MeshLambertMaterial).color.setHex(r.skin);
      this.lump!.visible = false;
    }
  }
  private buildDrink(it: Item) {
    const s = (it.key + ' ' + itemDef(it.key).name).toLowerCase();
    const kind = /mug|cup|thermos|kettle/.test(s) ? 'mug' : /soda|cola|beer|\bcan\b/.test(s) ? 'dcan' : /canteen|flask/.test(s) ? 'canteen' : 'bottle';
    this.clearModel(); this.left = 1;
    for (const p of this.props.values()) p.visible = false;
    this.spoon!.visible = false;
    this.prop = this.propFor(kind); this.prop.visible = true;
    this.food.add(this.prop);
    this.food.rotation.set(0, 0, 0); this.food.position.set(0, 0, 0);
    if (!this.liquid) {
      this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 1, 12), new THREE.MeshLambertMaterial({ color: 0x8ac8f0, transparent: true, opacity: 0.85 }));
      this.food.add(this.liquid);
    }
    this.liquid.visible = kind === 'bottle' || kind === 'mug';
    (this.liquid.material as THREE.MeshLambertMaterial).color.setHex(this.fluidC);
    const cap = itemDef(it.key).fluidCap ?? 1;
    this.liquidFrac = Math.max(0.05, Math.min(1, (it.fluid?.amount ?? 0) / cap));
    this.liquidKind = kind;
  }
  private liquidFrac = 1; private liquidKind = 'bottle';

  /** where the bite comes from, in the model's space: the mouth, or a spoon above the bowl */
  private mouthFor(m: FoodModel): THREE.Vector3 {
    const k = m.r.kind;
    if (k === 'can' || k === 'bowl') return _w.set((Math.random() - 0.5) * m.half.x, m.half.y + 0.05, (Math.random() - 0.5) * m.half.z);
    this.root!.updateMatrixWorld(true);
    return m.mesh.worldToLocal(_w.set(0, -0.02, 0.05));
  }
  private crumbFrom(m: FoodModel) {
    return (x: number, y: number, z: number, c: number) => {
      _v.set(x, y, z); m.mesh.localToWorld(_v); this.root!.worldToLocal(_v);
      this.spawnCrumb(_v, c, 1);
    };
  }
  private spawnCrumb(at: THREE.Vector3, col: number, g: number, sc = 0.6, vel?: THREE.Vector3) {
    for (const c of this.crumbs) if (!c.on) {
      c.on = true; c.p.copy(at); c.c.setHex(col); c.life = 0.7 + Math.random() * 0.6; c.s = CS * sc * (0.6 + Math.random() * 0.7); c.g = g;
      if (vel) c.v.copy(vel); else c.v.set((Math.random() - 0.5) * 0.4, Math.random() * 0.3 - 0.05, 0.02 + Math.random() * 0.12);
      return;
    }
  }

  // =================================================================== input
  private openDom(hint: string) {
    const c = this.catcher = document.createElement('div');
    c.className = 'bh-eat';
    // the hint is free type, and only until you have got the idea
    if (EatFp.hints < 3) {
      EatFp.hints++;
      const h = this.hintEl = document.createElement('div');
      h.className = 'bh-eat-hint nc-free-text'; h.textContent = hint;
      c.appendChild(h);
    }
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button === 2) { this.stopByUser(); return; } this.click(); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerenter', () => { if (G.input) G.input.pointerOverUI = true; });
    document.body.appendChild(c);
    if (G.input) G.input.pointerOverUI = true;
    window.addEventListener('keydown', this.key, true);
  }
  private onKey(e: KeyboardEvent) {
    if (!this.active) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.stopByUser(); }
    else if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); this.click(); }
  }
  private stopByUser() { const a = this.act; if (a?.p) a.p.actions.clear(); else this.finish(false); }

  private click() {
    if (!this.active || this.lowerT >= 0 || this.raise < 0.6) return;
    if (this.hintEl) { this.hintEl.remove(); this.hintEl = null; }
    if (this.mode === 'drink') this.gulp(true); else this.bite(true);
  }

  private bite(byClick: boolean) {
    const a = this.act, r = this.rec; if (!a || !r) return;
    if (this.lunge >= 0 && this.lunge < 0.5) return;
    // a full stomach turns it away
    if (!this.hud.canEat()) {
      this.refuse = 0;
      G.audio?.flat?.('bh_swallow', 'voice', 0.5, 0.7);
      bus.emit('think', a.p, ['I can\'t. Not another bite.', 'My stomach says no.', 'Too full. It\'s coming back up if I try.'][Math.floor(Math.random() * 3)]);
      shake(0.08, 0.2);
      if (this.bites > 0) setTimeout(() => this.act === a && this.lowerFinish(), 650);
      return;
    }
    const fast = this.t - this.lastBite < 0.75;
    this.combo = fast ? this.combo + 1 : 1;
    this.lastBite = this.t;
    this.idle = 0;
    this.lunge = 0; this.chew = 0;
    this.bites++;
    // how much one bite takes: about eight bites to a whole thing, a third more when wolfed down
    const m = this.model;
    const portionLeft = Math.max(0, (a.portion ?? 1) - (a.bitten ?? 0));
    let amt = Math.min(0.125 * (fast ? 1.3 : 1), portionLeft, this.left);
    if (m) {
      const moved = m.bite(this.mouthFor(m), fast ? 1.15 : 1, this.crumbFrom(m));
      if (!moved) amt = this.left;
    }
    this.left = Math.max(0, this.left - amt);
    if (m) { m.setLevel(this.left); if (this.left <= 0.001) m.group.visible = false; }
    if (amt > 0) a.bite?.(amt);
    const res = { col: mix(r.flesh, r.skin, 0.3) };
    // juice: crunch, crumbs, a punch of the camera
    const crunchy = r.crunchy;
    G.audio?.flat?.(crunchy ? 'bh_crunch' : 'bh_soft', 'sfx', 0.75, (0.92 + Math.random() * 0.16) * (1 + Math.min(4, this.combo - 1) * 0.04));
    if (r.juicy) for (let i = 0; i < 6; i++) this.spawnCrumb(_w.set((Math.random() - 0.5) * 0.04, -0.03 + Math.random() * 0.02, -0.25), mix(r.flesh, 0xffffff, 0.35), 1.4, 0.35, _v.set((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.25, 0.05 + Math.random() * 0.15));
    if (r.bad) for (let i = 0; i < 5; i++) this.spawnCrumb(_w.set((Math.random() - 0.5) * 0.06, 0, -0.3), 0x8ab84a, -0.3, 0.8, _v.set((Math.random() - 0.5) * 0.2, 0.15 + Math.random() * 0.2, 0.1));
    punch(crunchy ? 0.025 : 0.015, 0.14);
    if (r.bad && this.bites === 1) bus.emit('think', a.p, r.bad === 'rotten' ? 'Rotten. Keep it down.' : r.bad === 'raw' ? 'Raw. That will cost me.' : 'That tastes wrong.');
    // the bite goes down to the jar a moment later
    const bad = !!r.bad && (r.bad === 'rotten' ? Math.random() < 0.8 : Math.random() < 0.45) && this.bites <= 2;
    this.pendingJar.push({ t: 0.5, c: res.col, s: Math.min(1.4, amt * 6), bad });
    this.flyToJar(res.col);
    if (this.left <= 0 || (a.bitten ?? 0) >= (a.portion ?? 1) - 0.01) setTimeout(() => this.act === a && this.lowerFinish(), 520);
  }
  private gulp(byClick: boolean) {
    const a = this.act; if (!a || this.gulpT >= 0) return;
    if (!this.hud.canEat() && this.hud.jar.fill > 1.0) { this.refuse = 0; bus.emit('think', a.p, 'I\'ll throw up if I drink any more.'); return; }
    this.gulpT = 0; this.idle = 0; this.bites++;
    const target = a.litres ?? 0.25;
    const sip = Math.min(0.09, Math.max(0.01, target - this.drunk));
    const got = a.gulp?.(sip) ?? sip;
    this.drunk += got;
    const it: Item = a.it;
    const cap = itemDef(it.key).fluidCap ?? 1;
    this.liquidFrac = Math.max(0, Math.min(1, (it.fluid?.amount ?? 0) / cap));
    G.audio?.flat?.('bh_gulp', 'voice', 0.7, 0.9 + Math.random() * 0.2);
    punch(0.012, 0.18);
    setTimeout(() => this.hud.jar.gulp(this.fluidC), 380);
    this.flyToJar(this.fluidC);
    if (this.fluidType === 'bleach' || this.fluidType === 'gasoline' || this.fluidType === 'coolant') { shake(0.3, 0.4); if (this.bites === 1) bus.emit('think', a.p, 'It burns. It burns all the way down.'); if (Math.random() < 0.6) setTimeout(() => this.hud.jar.crack(), 400); }
    if (this.drunk >= target - 0.005 || !it.fluid || it.fluid.amount <= 0.005) setTimeout(() => this.act === a && this.lowerFinish(), 700);
  }
  private lowerFinish() {
    if (!this.active || this.lowerT >= 0) return;
    this.lowerT = 0;
    if (this.mode === 'eat' && this.left <= 0) { G.audio?.ui?.('bh_wrap', 0.35); G.audio?.flat?.('bh_swallow', 'voice', 0.45); }
  }
  /** a pixel of the bite flies from the mouth to the stomach jar */
  private flyToJar(col: number) {
    const j = this.hud.jarScreen();
    const x0 = window.innerWidth / 2, y0 = window.innerHeight * 0.58;
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'bh-fly';
      d.style.background = '#' + col.toString(16).padStart(6, '0');
      document.body.appendChild(d);
      const mx = (x0 + j.x) / 2 + (Math.random() - 0.5) * 80, my = Math.min(y0, j.y) - 80 - Math.random() * 60;
      const an = d.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(1.4)` },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, offset: 0.45 },
        { transform: `translate(${j.x + (Math.random() - 0.5) * 10}px, ${j.y}px) scale(0.6)` },
      ], { duration: 520 + i * 70, delay: 120 + i * 50, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' });
      an.onfinish = () => d.remove();
    }
  }

  // =================================================================== per frame
  update(dt: number) {
    if (!this.active) return;
    if (fpOwner() !== 'eat') { this.finish(true); return; }
    this.t += dt;
    const a = this.act;
    if (!a) { this.finish(false); return; }
    // the shared cut (fp.ts) drives the entrance: the food comes up with the hands as the camera pushes in
    this.raise = Math.max(this.raise, Math.min(1, fpBlendLinear() * 1.05));
    // swallowed bites reach the jar
    for (let i = this.pendingJar.length - 1; i >= 0; i--) {
      const j = this.pendingJar[i];
      j.t -= dt;
      if (j.t <= 0) { this.hud.jar.bite(j.c, j.s, j.bad); G.audio?.ui?.('bh_plop', 0.35); if (j.bad) G.audio?.ui?.('bh_crack', 0.5); this.pendingJar.splice(i, 1); }
    }
    // lazy eating: no click for a while takes a slow bite anyway
    this.idle += dt;
    if (this.lowerT < 0 && this.raise >= 1 && this.idle > (this.mode === 'drink' ? AUTO_GULP : AUTO_BITE)) { if (this.mode === 'drink') this.gulp(false); else this.bite(false); this.idle = 0; }
    if (this.lunge >= 0) { this.lunge += dt / 0.16; if (this.lunge >= 1) this.lunge = -1; }
    if (this.chew >= 0) {
      const prev = this.chew;
      this.chew += dt / 0.62;
      for (const k of [0.3, 0.62]) if (prev < k && this.chew >= k) G.audio?.flat?.('bh_chew', 'sfx', 0.45, 0.9 + Math.random() * 0.2);
      if (this.chew >= 1) { this.chew = -1; if (this.t - this.lastBite > 0.55) G.audio?.flat?.('bh_swallow', 'voice', 0.3, 1); }
    }
    if (this.gulpT >= 0) { this.gulpT += dt / 0.55; if (this.gulpT >= 1) this.gulpT = -1; }
    if (this.refuse >= 0) { this.refuse += dt / 0.5; if (this.refuse >= 1) this.refuse = -1; }
    if (this.lowerT >= 0) { this.lowerT += dt / 0.32; if (this.lowerT >= 1) { const act = this.act; this.finish(false); if (act) act.done = true; return; } }
    this.pose(dt);
    if (this.arms) {
      const tr = Math.max(0, ((G.local?.body.panic ?? 0) - 40) / 60);
      this.arms.right.tremor = tr; this.arms.left.tremor = tr;
      this.arms.right.update(dt); this.arms.left.update(dt);
    }
    // a hot meal steams; rotten food has a few flies
    const r = this.rec;
    if (r?.hot && Math.random() < dt * 7) this.spawnCrumb(_w.set(this.grip.position.x + (Math.random() - 0.5) * 0.06, this.grip.position.y + 0.04, this.grip.position.z), 0xf4f4f0, -0.12, 0.9, _v.set((Math.random() - 0.5) * 0.04, 0.05, 0.02));
    if (r?.bad === 'rotten' && Math.random() < dt * 3) this.spawnCrumb(_w.set(this.grip.position.x + (Math.random() - 0.5) * 0.1, this.grip.position.y + 0.05, this.grip.position.z), 0x101010, 0, 0.5, _v.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2));
    this.stepCrumbs(dt);
  }

  private pose(_dt: number) {
    const t = this.t;
    const ease = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
    const up = this.lowerT >= 0 ? 1 - this.lowerT * this.lowerT : ease(this.raise);
    const sway = Math.sin(t * 1.3) * 0.004, bob = Math.sin(t * 2.1) * 0.003;
    const lunge = this.lunge >= 0 ? Math.sin(this.lunge * Math.PI) : 0;
    const no = this.refuse >= 0 ? Math.sin(this.refuse * Math.PI * 3) * (1 - this.refuse) : 0;
    const cam = fpCamera();
    // chewing bobs the view; a gulp tips the head back
    const chew = this.chew >= 0 ? Math.abs(Math.sin(this.chew * Math.PI * 3)) * (1 - this.chew) : 0;
    const g = this.gulpT >= 0 ? Math.sin(Math.min(1, this.gulpT) * Math.PI) : 0;
    // focus pull: the lens settles onto the food as it arrives
    const fov = 30 + (1 - up) * 7;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.set(0, -chew * 0.006, 0);
    cam.rotation.set(chew * 0.03 + g * 0.18, no * 0.12, Math.sin(t * 0.9) * 0.006);
    const yOff = (1 - up) * -0.22;
    const r = this.rec;
    if (this.mode === 'drink') {
      // the bottle comes up and tips towards you on each gulp
      this.grip.position.set(0.035 + sway, -0.075 + bob + yOff + g * 0.03, -0.36 + g * 0.06);
      this.grip.rotation.set(0.35 + g * 0.9, 0, -0.2 - g * 0.35);
      this.food.position.set(0, 0, 0); this.food.rotation.set(0, 0, 0);
      if (this.liquid && this.liquid.visible) {
        const h = 0.15 * Math.max(0.01, this.liquidFrac) * (this.liquidKind === 'mug' ? 0.55 : 1);
        this.liquid.scale.set(1, h, 1);
        this.liquid.position.y = (this.liquidKind === 'mug' ? -0.043 : -0.078) + h / 2;
      }
      this.holdAt('right', 'grip', this.food, 0, -0.035, 0.0, [0.22, -0.34, -0.12], [-0.8, 0.2, 0.6]);
      this.rest('left', yOff);
      return;
    }
    const cont = r && (r.kind === 'can' || r.kind === 'bowl');
    if (cont) {
      // left hand holds the can / bowl low, the right brings the spoon up
      this.grip.position.set(-0.03 + sway, -0.13 + bob + yOff, -0.38);
      this.grip.rotation.set(0.55, 0.2, 0);
      const sp = this.spoon!;
      const s = this.lunge >= 0 ? lunge : 0;
      sp.position.set(0.05 - s * 0.04, -0.07 + s * 0.05 + yOff, -0.33 + s * 0.16);
      sp.rotation.set(0.3 - s * 0.4, -0.4, 0.1);
      this.lump!.visible = this.lunge >= 0 && this.lunge < 0.5;
      this.holdAt('right', 'pinch', sp, 0, 0, 0.1, [0.2, -0.36, -0.08], [-0.5, 0.6, 0.6]);
      this.holdAt('left', 'cup', this.food, 0, -0.012, 0, [-0.16, -0.38, -0.2], [0.4, 0.9, 0.2]);
      return;
    }
    // held food: angled so the near end points at the mouth; it lunges in on a bite
    this.grip.position.set(0.02 + sway - lunge * 0.012, -0.04 + bob + yOff + lunge * 0.018, -0.42 + lunge * 0.13);
    this.grip.rotation.set(0.25 + lunge * 0.2, 0.75 + Math.sin(t * 0.7) * 0.05, 0.2);
    this.food.position.set(0, 0, 0);
    const h = this.model?.half ?? _hd;
    if (r && LONG.has(r.kind)) {
      // the held end is the far (+x) end; the left hand rests low
      this.holdAt('right', 'grip', this.food, h.x * 0.62, -h.y * 0.3, 0, [0.22, -0.34, -0.1], [-0.7, 0.3, 0.6]);
      this.rest('left', yOff);
    } else {
      // round things: the right hand holds it from behind, the left cups it from below
      this.holdAt('right', 'grip', this.food, h.x * 0.55, -h.y * 0.5, -h.z * 0.55, [0.24, -0.32, -0.16], [-0.85, 0.2, 0.45]);
      this.holdAt('left', 'cup', this.food, -h.x * 0.2, -h.y * 1.1, h.z * 0.1, [-0.18, -0.38, -0.18], [0.25, 0.95, 0.15]);
    }
  }

  /** put an arm's grip on a point of an object: the forearm comes from below toward it, the palm toward palmHint */
  private holdAt(side: 'right' | 'left', pose: HandPose, on: THREE.Object3D, lx: number, ly: number, lz: number, elbow: [number, number, number], palmHint: [number, number, number]) {
    const arm = this.arms?.[side]; if (!arm) return;
    arm.pose(pose);
    this.root!.updateMatrixWorld(true);
    const target = on.localToWorld(_t.set(lx, ly, lz));
    const dir = _d.set(target.x - elbow[0], target.y - elbow[1], target.z - elbow[2]).normalize();
    const z = _z.set(palmHint[0], palmHint[1], palmHint[2]);
    z.addScaledVector(dir, -z.dot(dir)).normalize();
    const x = _x.crossVectors(dir, z).normalize();
    _mb.makeBasis(x, dir, z);
    arm.root.quaternion.setFromRotationMatrix(_mb);
    arm.root.position.set(elbow[0], elbow[1], elbow[2]);
    arm.root.updateMatrixWorld(true);
    const g = arm.grip.getWorldPosition(_g);
    arm.root.position.x += target.x - g.x; arm.root.position.y += target.y - g.y; arm.root.position.z += target.z - g.z;
  }
  /** an arm at rest, low in the frame */
  private rest(side: 'right' | 'left', yOff: number) {
    const arm = this.arms?.[side]; if (!arm) return;
    arm.pose('relaxed');
    const s = side === 'left' ? -1 : 1;
    arm.root.position.set(s * 0.17, -0.42 + yOff * 0.6 + Math.sin(this.t * 1.7) * 0.003, -0.3);
    arm.root.rotation.set(-0.35, 0, -s * 0.35);
  }

  private stepCrumbs(dt: number) {
    const m = this.cMesh!;
    let n = 0;
    for (const c of this.crumbs) {
      if (!c.on) continue;
      c.life -= dt;
      if (c.life <= 0 || c.p.z > -0.14) { c.on = false; continue; }
      c.v.y -= 2.6 * c.g * dt;
      c.p.addScaledVector(c.v, dt);
      _m.compose(c.p, _q.setFromAxisAngle(_w.set(0.3, 1, 0.2).normalize(), c.life * 9), _s.setScalar(c.s * Math.min(1, c.life * 3)));
      m.setMatrixAt(n, _m); m.setColorAt(n, c.c);
      n++;
    }
    m.count = n;
    if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}

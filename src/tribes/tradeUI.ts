// Talking to a tribe is leaning over their barter cloth (first person): their
// goods laid out on the far side with chalked paper price tags, your own goods
// on the near side tagged with what they would give (a red bow on the things
// they want), the tab chalked on a slate, your standing as a brass bead on a
// painted rail, their jobs typed on index cards pinned along the back, and a
// carved token you can buy a companion with. Tap a thing to trade it. Walk
// away, E or Esc to leave. Over their heads in the world: a hanging tag.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { fpGroup, fpClaim, fpRelease, fpCamera, fpBlend } from '../fp/fp';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { itemDef } from '../items/item';
import type { Item } from '../items/item';
import { itemGeometry } from '../items/itemMeshes';
import { questDefs } from '../game/quests';
import { op } from '../game/ops';
import { PixTex, PAL, PointerLayer, WorldTag, flatMat, overlayRay } from '../scan/pix';
import { Screen } from '../ui/font5x7';
import { Shape } from '../craft/shapes';
import { pixMat } from '../craft/fpTex';
import { ink, shade, stencil } from '../craft/fpScene';
import { gem } from '../ui/touch/facet';
import { StageArms } from '../scan/arms';
import type { Creature } from '../creatures/creature';
import { TRIBES, type TribeKey } from './defs';
import { bark, memberName, tribeOfCreature } from './npc';
import type { TribeSystem } from './tribes';
import { RECRUIT_COST, RECRUIT_REP } from './tribes';

const TW = 0.56, TD = 0.4; // cloth size (m)
const tagCache = new Map<string, PixTex>();
function priceTag(text: string, ink: number) {
  const k = text + '|' + ink;
  let t = tagCache.get(k);
  if (!t) {
    t = new PixTex(26, 11, 4);
    t.reset(); t.paper(0, 0, 26, 11, PAL.paper, text.length * 7 + ink);
    t.s.disc(3, 5, 1, Screen.c(PAL.hole));
    t.pen(text, 16, -1.5, ink, 11, { align: 'center' });
    t.flush(); tagCache.set(k, t);
  }
  return t;
}
let _mat: THREE.Material | null = null;
const itemMat = () => (_mat ??= worldMaterial({ noVis: true, noFog: true, noGrid: true }));
// shared pieces (the cloth is laid out again after every trade: nothing per-layout but the job cards)
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const GEO = { hit: new THREE.BoxGeometry(0.07, 0.05, 0.05), tag: new THREE.PlaneGeometry(0.042, 0.018), bow: new THREE.TorusKnotGeometry(0.004, 0.0013, 24, 4, 2, 3), card: new THREE.PlaneGeometry(0.11, 0.073), pin: gem(0.0045, 0, 0.1), tokTag: new THREE.PlaneGeometry(0.036, 0.0145), tokHit: new THREE.BoxGeometry(0.06, 0.04, 0.06) };
const RED = new THREE.MeshLambertMaterial({ color: 0xb02018 });
/** a printed or painted surface that takes the scene's light (and its shadows) */
const litMat = (tex: THREE.Texture) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.95, metalness: 0 });
const tagMats = new Map<PixTex, THREE.Material>();
const cachedMats = new Set<THREE.Material>();
const tagMat = (p: PixTex) => { let m = tagMats.get(p); if (!m) { m = flatMat(p.tex); tagMats.set(p, m); cachedMats.add(m); } return m; };
let tokenGeo: THREE.BufferGeometry | null = null;

interface Slot { g: THREE.Group; kind: 'buy' | 'sell' | 'job' | 'join'; key: string; it?: Item; price: number; label: string; y0: number; ok: boolean }

export class TradeUI {
  private worldTag = new WorldTag(132, 18);
  private g: THREE.Group;
  private root = new THREE.Group();
  private goods = new THREE.Group();
  private cloth = new PixTex(112, 80, 1);
  private slate = new PixTex(48, 34, 4);
  private rail = new PixTex(64, 12, 3);
  private slip = new PixTex(72, 24, 4);
  private bead: THREE.Mesh;
  private slots: Slot[] = [];
  private hover: Slot | null = null;
  private layer: PointerLayer;
  private c: Creature | null = null;
  private focus: Creature | null = null;
  private raise = 0;
  private dirty = false;
  private flying: { g: THREE.Group; to: THREE.Vector3; t: number }[] = [];
  private beadX = 0.215;
  private arms: StageArms;
  private pinchT = 0;
  private tw = new THREE.Vector3();
  private lantern!: THREE.PointLight;
  private lanternT = 0;

  constructor(private T: TribeSystem) {
    this.g = fpGroup('trade');
    // a lantern on the crate and the room's own dim light: the trader stands in the eye's view beyond the counter
    this.g.add(new THREE.HemisphereLight(0xb8b0a0, 0x2a2018, 0.5));
    this.g.add(this.root);
    this.arms = new StageArms(this.g);
    this.buildCounter();
    // the cloth over the lid, lit like everything else
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD, 6, 4), litMat(this.cloth.tex));
    const cp = cl.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 31 + cp.getY(i) * 17) * 0.002);
    cl.geometry.computeVertexNormals();
    cl.rotation.x = -Math.PI / 2; cl.position.y = 0.003; cl.receiveShadow = true; this.root.add(cl);
    // the slate stands on its little easel, the standing rail and the slip lie by it
    const slateG = new THREE.Group();
    const sf = new Shape(4); sf.jbox(0, 0, -0.004, 0.118, 0.092, 0.008, 0xffffff, 0.0012, 3);
    slateG.add(new THREE.Mesh(sf.build(), pixMat('plank', { color: 0x9a7a5a })));
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.075), litMat(this.slate.tex)); sl.position.set(0, 0.046, 0.0005); slateG.add(sl);
    const leg = new Shape(4); leg.rod([0, 0.07, -0.006], [0, 0.0, -0.05], 0.004, 0xffffff, 4);
    slateG.add(new THREE.Mesh(leg.build(), pixMat('plank', { color: 0x7a5a3a })));
    slateG.position.set(0.215, 0.004, -0.13); slateG.rotation.x = -0.42;
    ink(slateG, 0.0015); shade(slateG);
    this.root.add(slateG);
    const rl = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.024), litMat(this.rail.tex)); rl.rotation.x = -Math.PI / 2; rl.position.set(0.215, 0.0075, 0.0); this.root.add(rl);
    const rs = new Shape(6); rs.jbox(0.215, 0.002, 0.0, 0.13, 0.005, 0.032, 0xffffff, 0.001, 9);
    this.root.add(new THREE.Mesh(rs.build(), pixMat('plank', { color: 0x6a4a2a })));
    this.bead = new THREE.Mesh(gem(0.008, 0, 0.1), pixMat('brass'));
    this.bead.position.set(0.215, 0.015, 0.0); this.bead.castShadow = true; this.root.add(this.bead);
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.05), litMat(this.slip.tex)); sp.rotation.x = -Math.PI / 2; sp.rotation.z = 0.03; sp.position.set(0.215, 0.0045, 0.068); this.root.add(sp);
    this.root.add(this.goods);
    this.drawRail();
    this.layer = new PointerLayer('trade', { down: (e) => this.click(e), move: (e) => this.move(e) });
    window.addEventListener('keydown', (e) => { if (this.c && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
    bus.on('tribeTab', () => { if (this.c) this.dirty = true; });
    bus.on('tribeRep', () => { if (this.c) this.dirty = true; });
    bus.on('inventoryChanged', () => { if (this.c) this.dirty = true; });
  }

  /** the counter: a shipping crate on its end with a plank lid, rope handles, stencilled, a lantern on the corner */
  private buildCounter() {
    const R = this.root;
    const lid = new Shape(4), box = new Shape(4), iron = new Shape(6), rope = new Shape(10), glassFrame = new Shape(7);
    const W = TW + 0.12, D = TD + 0.12;
    for (let i = 0; i < 4; i++) lid.jbox(0, -0.028, -D / 2 + D / 8 + i * D / 4, W, 0.028, D / 4 - 0.004, i % 2 ? 0xf0e8d8 : 0xffffff, 0.0015, i + 3);
    // the crate below: slatted sides going down out of the picture, corner battens, iron corner brackets
    for (const sx of [-1, 1]) {
      for (let j = 0; j < 4; j++) box.jbox(sx * (W / 2 - 0.012), -0.44 + j * 0.1, 0, 0.024, 0.094, D - 0.03, j % 2 ? 0xe0d4c0 : 0xffffff, 0.0015, j + sx * 5);
      for (const sz of [-1, 1]) iron.box(sx * (W / 2 - 0.006), -0.06, sz * (D / 2 - 0.03), 0.016, 0.034, 0.06, 0xffffff, 0.003);
      rope.ring(sx * (W / 2 + 0.004), -0.13, 0, 0.035, 0.006, 0xffffff, 10, [0, Math.PI / 2, 0]);
    }
    box.jbox(0, -0.44, D / 2 - 0.012, W, 0.42, 0.024, 0xd8ccb8, 0.002, 21);
    // the lantern on the far left corner: galvanised base and cap, a wire guard round a glass chimney
    const lx = -W / 2 + 0.06, lz = -D / 2 + 0.06;
    iron.lathe(lx, 0, lz, [[0, 0], [0.035, 0], [0.038, 0.012], [0.03, 0.03], [0.012, 0.034], [0, 0.034]], 0xffffff, 8);
    iron.lathe(lx, 0.12, lz, [[0, 0], [0.028, 0], [0.03, 0.006], [0.016, 0.03], [0.006, 0.036], [0, 0.04]], 0xffffff, 8);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; glassFrame.rod([lx + Math.cos(a) * 0.028, 0.032, lz + Math.sin(a) * 0.028], [lx + Math.cos(a) * 0.026, 0.12, lz + Math.sin(a) * 0.026], 0.0018, 0xffffff, 4); }
    iron.ring(lx, 0.17, lz, 0.02, 0.0025, 0xffffff, 8, [0, 0, 0]);
    const mesh = (sh: Shape, mat: THREE.Material) => { const m = new THREE.Mesh(sh.build(), mat); R.add(m); return m; };
    mesh(lid, pixMat('crate')); mesh(box, pixMat('crate', { color: 0xc8b8a0 })); mesh(iron, pixMat('galv', { color: 0x9a948a })); mesh(rope, pixMat('burlap', { color: 0xc8b088 })); mesh(glassFrame, pixMat('steel'));
    const chim = new THREE.Mesh(new Shape(5).lathe(lx, 0.034, lz, [[0.022, 0], [0.027, 0.03], [0.027, 0.06], [0.02, 0.086]], 0xffffff, 8).build(), new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.35, depthWrite: false }));
    chim.userData.noInk = true; R.add(chim);
    const flame = new THREE.Mesh(gem(0.008, 0, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); flame.scale.set(0.8, 1.8, 0.8); flame.position.set(lx, 0.07, lz); R.add(flame);
    this.lantern = new THREE.PointLight(0xffb868, 1.6, 1.4, 1.3); this.lantern.position.set(lx, 0.08, lz); R.add(this.lantern);
    const key = new THREE.SpotLight(0xffd8a8, 2.2, 2.4, 0.9, 0.6, 1.4); key.position.set(-0.4, 0.9, 0.2); key.target.position.set(0, 0, 0);
    key.castShadow = true; key.shadow.mapSize.set(512, 512); key.shadow.bias = -0.0015; key.shadow.normalBias = 0.01;
    R.add(key, key.target);
    // stencil on the crate's near side panel
    const st = stencil(['LOT 7', 'THIS SIDE UP'], 0.22, 0x1e1a14); st.position.set(-0.05, -0.2, D / 2 + 0.0005); R.add(st);
    ink(R, 0.0022); shade(R, true, true);
  }

  get isOpen() { return !!this.c; }

  private findFocus(): Creature | null {
    const p = G.local; if (!p) return null;
    const ok = (c: Creature | undefined | null) => !!c && !c.dead && !G.dominion?.isDowned?.(c) && c.zoneKey === p.zoneKey && !!tribeOfCreature(c) && Math.hypot(c.x - p.x, c.z - p.z) < 2.8;
    const h = G.ui?.hover;
    if (h?.kind === 'creature' && ok(h.c)) return h.c;
    let best: Creature | null = null, bd = 2.4;
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<Creature>) { if (!ok(c)) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  update(dt: number) {
    const p = G.local, inp = G.input; if (!p) return;
    this.focus = this.c ? null : this.findFocus();
    if (!inp.textFocus && inp.hit('interact') && !G.dominion?.ui?.open && !G.dominion?.surgery?.active) {
      if (this.c) this.close();
      else if (this.focus && !G.dominion?.riding?.()) this.open(this.focus);
    }
    // the tag over their head
    const f = this.focus;
    if (f) {
      const t = tribeOfCreature(f)!;
      const hostile = this.T.hostile(t) || f.state === 'chase' || f.state === 'attack';
      const name = memberName(f).toUpperCase();
      if (hostile) this.worldTag.show(f.x, f.y + f.height + 0.25, f.z, name + ' - HOSTILE', 'red', '');
      else this.worldTag.show(f.x, f.y + f.height + 0.25, f.z, (f.tamedBy === p.id ? 'TALK ' : 'TRADE ') + name, 'paper');
    } else this.worldTag.hide();
    const c = this.c;
    if (!c) return;
    if (c.dead || c.zoneKey !== p.zoneKey || Math.hypot(c.x - p.x, c.z - p.z) > 4.5 || p.body.dead) { this.close(); return; }
    if (this.T.hostile(tribeOfCreature(c)!) && !c.tamedBy) { this.close(); bark(c, 'hostile', true); return; }
    if (this.dirty) { this.dirty = false; this.layout(); }
    this.raise = Math.min(1, this.raise + dt * 4);
    const k = Math.min(1 - Math.pow(1 - this.raise, 3), fpBlend());
    const asp = innerWidth / Math.max(1, innerHeight);
    this.root.position.set(0.01, -0.1 - (1 - k) * 0.3, -1.15);
    this.root.rotation.set(0.9 - (1 - k) * 0.4, 0, 0);
    this.root.scale.setScalar(asp >= 1.2 ? 1 : Math.max(0.42, asp * 0.9));
    this.lanternT += dt;
    this.lantern.intensity = 1.6 * (0.9 + Math.sin(this.lanternT * 11) * 0.05 + Math.sin(this.lanternT * 27) * 0.04);
    // hover lift, flying goods, the standing bead sliding along its rail
    for (const s of this.slots) { const want = s === this.hover ? s.y0 + 0.014 : s.y0; s.g.position.y += (want - s.g.position.y) * Math.min(1, dt * 16); }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f2 = this.flying[i]; f2.t += dt * 3;
      f2.g.position.lerp(f2.to, Math.min(1, dt * 10)); f2.g.position.y = 0.02 + Math.sin(Math.min(1, f2.t) * Math.PI) * 0.05;
      if (f2.t >= 1) { f2.g.removeFromParent(); this.flying.splice(i, 1); }
    }
    this.bead.position.x += (this.beadX - this.bead.position.x) * Math.min(1, dt * 6);
    // hands: the left rests flat on the cloth, the right points at what you are looking at and picks it up
    const A = this.arms, kk = Math.min(1, dt * 10);
    this.root.updateMatrixWorld(true);
    A.aim('left', 'flat', 'grip', this.root.localToWorld(this.tw.set(-TW / 2 + 0.07, 0.014, TD / 2 - 0.02)), [-0.34, -0.5, -0.62], [0, -0.52, -0.85], kk);
    if (this.hover) { this.hover.g.getWorldPosition(this.tw); this.tw.y += 0.035; this.tw.z += 0.02; A.aim('right', this.pinchT > 0 ? 'pinch' : 'point', 'tip', this.tw, [0.3, -0.5, -0.6], [0, -0.52, -0.85], kk); }
    else A.rest('right', kk, 0.05);
    this.pinchT -= dt;
    A.update(dt);
  }

  open(c: Creature) {
    const t = tribeOfCreature(c); if (!t) return;
    if (this.T.hostile(t) && !c.tamedBy) { bark(c, 'hostile', true); bus.emit('think', G.local, 'They are not in a talking mood.'); return; }
    if (!fpClaim('trade', 3, { cinematic: 'full', eyePitch: 24 })) return;
    this.c = c; this.raise = 0; this.hover = null;
    this.arms.dress();
    this.T.meet(t);
    bark(c, 'trade', true);
    this.drawCloth(t);
    this.layout();
    this.bead.position.x = this.beadX;
    this.layer.on = true;
    G.audio?.ui?.('bagOpen', 0.4);
  }

  close() {
    if (!this.c) return;
    const c = this.c; this.c = null;
    this.layer.on = false;
    fpRelease('trade');
    if (!c.dead) bark(c, 'bye', true);
    G.audio?.ui?.('bagClose', 0.35);
  }

  /** standing changes, spoken as a thought (the rail shows it when you are at the cloth) */
  toast(title: string, sub: string, kind: 'up' | 'down') {
    void title;
    if (this.c) return;
    const p = G.local; if (!p) return;
    bus.emit('think', p, kind === 'up' ? `They liked that: ${sub}.` : `They will remember that: ${sub}.`);
  }

  // ---------------------------------------------------------------- the layout of the cloth
  private layout() {
    const c = this.c; if (!c) return;
    const p = G.local!;
    const t = tribeOfCreature(c)!;
    for (const s of this.slots) {
      s.g.removeFromParent();
      // job cards and the token tag are drawn per layout: free them
      if (s.kind === 'job' || s.kind === 'join') s.g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m?.map && !cachedMats.has(m)) { m.map.dispose(); m.dispose(); } });
    }
    this.slots = [];
    const tab = this.T.tab(t);
    // their goods: two rows on the far half
    this.T.wares(t).slice(0, 10).forEach((k, i) => {
      const pr = this.T.buyPrice(t, k);
      this.place('buy', k, undefined, pr, -0.235 + (i % 5) * 0.085, -0.125 + Math.floor(i / 5) * 0.075, String(pr), tab >= pr ? PAL.ink : PAL.inkRed, false, `${itemDef(k).name}  -  ${pr} SCRIP`, tab >= pr);
    });
    // yours: two rows on the near half
    this.sellable(p, t).slice(0, 10).forEach((it, i) => {
      const v = this.T.sellPrice(t, it), want = this.T.wanted(t, it);
      this.place('sell', it.key, it, v, -0.235 + (i % 5) * 0.085, 0.045 + Math.floor(i / 5) * 0.07, '+' + v, PAL.inkBlue, want, `YOURS: ${itemDef(it.key).name}  +${v}${want ? '  WANTED' : ''}`, true);
    });
    // jobs pinned along the back edge
    const status = (k: string) => (G.watch?.questStatus?.(k) as string | undefined) ?? '';
    questDefs().filter((q) => q.category === 'tribe' && q.giver === TRIBES[t].name.toUpperCase()).slice(0, 3).forEach((q, i) => {
      const st = status(q.key);
      const locked = (q.requires || []).some((r) => r.startsWith('flag:') ? !G.missions?.flags?.has?.(r.slice(5)) : status(r) !== 'done');
      const rw = [q.reward?.rp ? `${q.reward.rp} RP` : '', ...(q.reward?.items || []).map(([k]) => itemDef(k).name)].filter(Boolean).join(', ');
      this.jobCard(q.key, q.title, rw, st, locked, -0.2 + i * 0.13);
    });
    // the recruit token
    const rs = this.T.recruits(p.id);
    const mine = c.tamedBy === p.id;
    const why = mine ? 'SEND THEM HOME' : this.T.rep(t) < RECRUIT_REP ? 'THEY DO NOT TRUST YOU YET' : tab < RECRUIT_COST ? `RECRUIT: ${RECRUIT_COST} ON THE TAB` : rs.length >= 2 ? 'YOU HAVE ENOUGH COMPANY' : `RECRUIT ${memberName(c).toUpperCase()}  -${RECRUIT_COST}`;
    this.token(mine ? 'HOME' : String(RECRUIT_COST), why, mine || this.T.canRecruit(t));
    // slate and rail
    this.drawSlate(t, tab);
    const rep = this.T.rep(t);
    this.beadX = 0.215 + (Math.max(-100, Math.min(100, rep)) / 100) * 0.055;
    this.drawSlip(this.hover?.label ?? `${TRIBES[t].name.toUpperCase()} - ${this.T.standing(t).label}`);
  }

  private place(kind: 'buy' | 'sell', key: string, it: Item | undefined, price: number, x: number, z: number, tagText: string, ink: number, want: boolean, label: string, ok: boolean) {
    const g = new THREE.Group();
    const geo = itemGeometry(key);
    if (geo) {
      const bb = geo.boundingBox!, size = new THREE.Vector3(), cen = new THREE.Vector3();
      bb.getSize(size); bb.getCenter(cen);
      const sc = 0.05 / Math.max(0.02, size.x, size.y, size.z);
      const m = new THREE.Mesh(geo, itemMat());
      m.scale.setScalar(sc); m.position.set(-cen.x * sc, -bb.min.y * sc, -cen.z * sc);
      g.add(m);
    }
    // a fat invisible box to make it easy to tap
    const hit = new THREE.Mesh(GEO.hit, HIT); hit.position.y = 0.02; g.add(hit);
    const tg = new THREE.Mesh(GEO.tag, tagMat(priceTag(tagText, ink)));
    tg.rotation.x = -Math.PI / 2; tg.rotation.z = Math.sin(x * 40 + z * 13) * 0.25; tg.position.set(0.012, 0.001, 0.03); g.add(tg);
    if (want) { const bow = new THREE.Mesh(GEO.bow, RED); bow.position.set(-0.004, 0.003, 0.03); g.add(bow); }
    g.position.set(x, 0, z);
    this.goods.add(g);
    this.slots.push({ g, kind, key, it, price, label, y0: 0, ok });
  }

  private jobCard(key: string, title: string, reward: string, st: string, locked: boolean, x: number) {
    const pt = new PixTex(60, 40);
    pt.reset(); pt.paper(0, 0, 60, 40, 0xefe6cc, title.length);
    pt.s.hline(2, 57, 10, Screen.c(PAL.inkRed));
    pt.typed(title.toUpperCase(), 3, 2, PAL.ink, 7, 55);
    pt.typedPara(reward, 3, 13, 55, PAL.inkBlue, 7, 2, 6);
    const stamp = st === 'done' ? 'DONE' : st === 'ready' ? 'READY' : st === 'active' ? 'TAKEN' : locked ? 'LATER' : '';
    if (stamp) { const col = stamp === 'LATER' ? 0x6a5a40 : PAL.inkRed; pt.s.frame(16, 28, 30, 10, Screen.c(col)); pt.sign(stamp, 31, 28.5, col, 7, { align: 'center' }); }
    else pt.pen('take it', 30, 26, PAL.ink, 11, { align: 'center' });
    pt.flush();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(GEO.card, flatMat(pt.tex)));
    const pin = new THREE.Mesh(GEO.pin, RED); pin.position.set(0, 0.03, 0.003); g.add(pin);
    g.position.set(x, 0.035, -TD / 2 - 0.01); g.rotation.x = -0.35;
    this.goods.add(g);
    this.slots.push({ g, kind: 'job', key, price: 0, label: `JOB: ${title}  -  ${reward}`, y0: 0.035, ok: !stamp });
  }

  private token(face: string, label: string, ok: boolean) {
    const g = new THREE.Group();
    if (!tokenGeo) { const sh = new Shape(9); sh.lathe(0, 0, 0, [[0, 0], [0.021, 0], [0.023, 0.004], [0.022, 0.011], [0.017, 0.013], [0.016, 0.014], [0, 0.014]], 0xffffff, 8); tokenGeo = sh.build(); }
    const tk = new THREE.Mesh(tokenGeo, pixMat('handle', { color: 0x9a6a42 })); tk.castShadow = true; g.add(tk);
    const pt = new PixTex(30, 12, 4); pt.reset(); pt.paper(0, 0, 30, 12, PAL.paper, 5); pt.pen(face, 15, -1, ok ? PAL.ink : PAL.inkRed, 11, { align: 'center' }); pt.flush();
    const tg = new THREE.Mesh(GEO.tokTag, flatMat(pt.tex)); tg.rotation.x = -Math.PI / 2; tg.position.set(0, 0.0005, 0.03); g.add(tg);
    const hit = new THREE.Mesh(GEO.tokHit, HIT); g.add(hit);
    g.position.set(0.215, 0.002, 0.125);
    this.goods.add(g);
    this.slots.push({ g, kind: 'join', key: 'join', price: RECRUIT_COST, label, y0: 0.002, ok });
  }

  // ---------------------------------------------------------------- pointer
  private pickSlot(e: PointerEvent): Slot | null {
    const hits = overlayRay(e.clientX, e.clientY, fpCamera()).intersectObject(this.goods, true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && o.parent !== this.goods) o = o.parent; const s = this.slots.find((q) => q.g === o); if (s) return s; }
    return null;
  }
  private restLabel() { const t = tribeOfCreature(this.c!)!; return `${TRIBES[t].name.toUpperCase()} - ${this.T.standing(t).label}`; }
  private move(e: PointerEvent) {
    if (!this.c) return;
    const s = this.pickSlot(e);
    if (s !== this.hover) { this.hover = s; this.drawSlip(s?.label ?? this.restLabel()); this.layer.cursor = s ? 'pointer' : 'default'; }
  }
  private click(e: PointerEvent) {
    const c = this.c; if (!c) return;
    const t = tribeOfCreature(c)!;
    const s = this.pickSlot(e);
    if (!s) {
      // off the cloth: step back
      if (!overlayRay(e.clientX, e.clientY, fpCamera()).intersectObject(this.root, true).length) this.close();
      return;
    }
    const p = G.local!;
    this.pinchT = 0.35;
    if (s.kind === 'buy') {
      if (this.T.buy(t, s.key)) this.fly(s, 0.12);
      else { bark(c, 'trade', true); s.g.position.x += 0.006; G.audio?.ui?.('click', 0.4); }
    } else if (s.kind === 'sell' && s.it) {
      if (this.T.sell(t, s.it) > 0) this.fly(s, -0.2);
    } else if (s.kind === 'job') {
      if (!s.ok) return;
      const w = G.watch;
      const ok = w?.acceptQuest?.(s.key) ?? w?.quests?.accept?.(s.key) ?? w?.accept?.(s.key);
      bus.emit('questOffer', { key: s.key, giver: TRIBES[t].name.toUpperCase(), accepted: ok !== false });
      bus.emit('think', p, 'I pocket the card. The job goes up on the watch.');
      G.audio?.ui?.('click', 0.6);
      this.dirty = true;
    } else if (s.kind === 'join') {
      if (c.tamedBy === p.id) { op('tribeRecruit', { id: c.id, by: '' }); this.close(); return; }
      if (!s.ok) { bus.emit('think', p, s.label.charAt(0) + s.label.slice(1).toLowerCase() + '.'); return; }
      if (this.T.recruit(c)) { this.close(); bus.emit('think', p, `${memberName(c)} falls in behind me.`); }
    }
  }
  private fly(s: Slot, toZ: number) {
    this.slots = this.slots.filter((q) => q !== s);
    this.flying.push({ g: s.g, to: new THREE.Vector3(s.g.position.x * 0.5, 0.02, toZ + (toZ > 0 ? 0.1 : -0.1)), t: 0 });
    this.hover = null;
    G.audio?.ui?.('tribe_trade', 0.55);
    setTimeout(() => { if (this.c) this.dirty = true; }, 340);
  }

  /** what the survivor could hand over (not worn, not in hand, not an open bag, worth something) */
  private sellable(p: any, t: TribeKey): Item[] {
    const out: Item[] = [];
    for (const it of p.allItems() as Item[]) {
      if (p.isWorn?.(it) || p.handR === it || p.handL === it || (it.inv && it.inv.items.length)) continue;
      if (itemDef(it.key).tags?.includes('mission')) continue;
      if (this.T.sellPrice(t, it) <= 0) continue;
      out.push(it);
      if (out.length >= 10) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- painted surfaces
  private drawCloth(t: TribeKey) {
    const p = this.cloth, s = p.s, T = TRIBES[t];
    const base = t === 'wax' ? 0xd8ccb0 : t === 'turnkey' ? 0x6a6e66 : t === 'cog' ? 0x5a4a38 : 0xa88a5a;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const n = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const k = 0.86 + (((x + y) & 1) ? 0.06 : 0) + n * 0.08;
      s.px(x, y, Screen.c((Math.min(255, Math.round(((base >> 16) & 255) * k)) << 16) | (Math.min(255, Math.round(((base >> 8) & 255) * k)) << 8) | Math.min(255, Math.round((base & 255) * k))));
    }
    // a stitched hem and the tribe's mark painted big and faded in the middle
    for (let x = 2; x < p.w - 2; x += 2) { s.px(x, 2, Screen.c(0x3a2a18)); s.px(x, p.h - 3, Screen.c(0x3a2a18)); }
    for (let y = 2; y < p.h - 2; y += 2) { s.px(2, y, Screen.c(0x3a2a18)); s.px(p.w - 3, y, Screen.c(0x3a2a18)); }
    const mk = Screen.c(((T.color >> 1) & 0x7f7f7f) + 0x202020);
    const cx = 46, cy = 40;
    if (t === 'tally') { for (let i = 0; i < 4; i++) s.rect(cx - 12 + i * 7, cy - 12, 2, 24, mk); s.line(cx - 16, cy + 8, cx + 16, cy - 8, mk); }
    else if (t === 'wax') { s.circle(cx, cy, 12, mk); s.circle(cx, cy, 11, mk); s.rect(cx - 5, cy - 3, 3, 1, mk); s.rect(cx + 3, cy - 3, 3, 1, mk); s.rect(cx - 3, cy + 5, 7, 1, mk); }
    else if (t === 'turnkey') { s.frame(cx - 11, cy - 12, 22, 22, mk); s.line(cx - 8, cy - 9, cx + 8, cy + 7, mk); s.line(cx + 8, cy - 9, cx - 8, cy + 7, mk); }
    else { s.circle(cx, cy, 6, mk); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; s.line(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, mk); } }
    // the chalk line between theirs and yours
    for (let x = 6; x < 86; x += 3) s.px(x, 42, Screen.c(0xe8e4d4));
    p.flush();
  }
  private drawSlate(t: TribeKey, tab: number) {
    const p = this.slate, s = p.s;
    p.reset(PAL.slate);
    for (let i = 0; i < 60; i++) s.px((i * 37) % p.w, (i * 23) % p.h, Screen.c(i % 3 ? 0x3e4642 : 0x4a524e));
    p.pen(TRIBES[t].member, 3, -1, 0xc8c8b8, 9);
    p.pen('owes you', 3, 9, 0xb0b0a2, 8);
    p.pen(String(Math.min(9999, tab)), p.w - 4, 12, PAL.chalk, 20, { align: 'right' });
    p.flush();
  }
  private drawRail() {
    const p = this.rail, s = p.s;
    const bands = [0x8a2a1a, 0xb04a28, 0xb8963a, 0x7a9a3a, 0x4a8a3a];
    for (let i = 0; i < 5; i++) s.rect(Math.round(i * p.w / 5), 0, Math.ceil(p.w / 5), p.h, Screen.c(bands[i]));
    for (let x = 0; x < p.w; x += 4) s.px(x, p.h - 2, Screen.c(0x1a140c));
    p.sign('FEUD', 2, 2, 0xf0e6d0, 6); p.sign('KIN', p.w - 2, 2, 0xf0e6d0, 6, { align: 'right' });
    p.flush();
  }
  private drawSlip(text: string) {
    const p = this.slip;
    p.reset(); p.paper(0, 0, p.w, p.h, PAL.paper, 9);
    p.typedPara(text, 3, 2, p.w - 6, PAL.ink, 6.5, 3, 6.5);
    p.flush();
  }
}

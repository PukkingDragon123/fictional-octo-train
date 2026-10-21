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
import { fpGroup, fpClaim, fpRelease, fpCamera } from '../fp/fp';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { itemDef } from '../items/item';
import type { Item } from '../items/item';
import { itemGeometry } from '../items/itemMeshes';
import { questDefs } from '../game/quests';
import { op } from '../game/ops';
import { PixTex, PAL, PointerLayer, WorldTag, flatMat, overlayRay } from '../scan/pix';
import { Screen } from '../ui/font5x7';
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

interface Slot { g: THREE.Group; kind: 'buy' | 'sell' | 'job' | 'join'; key: string; it?: Item; price: number; label: string; y0: number; ok: boolean }

export class TradeUI {
  private worldTag = new WorldTag(132, 18);
  private g: THREE.Group;
  private root = new THREE.Group();
  private goods = new THREE.Group();
  private cloth = new PixTex(112, 80, 1);
  private slate = new PixTex(48, 34, 4);
  private rail = new PixTex(64, 12, 3);
  private slip = new PixTex(120, 12, 3);
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

  constructor(private T: TribeSystem) {
    this.g = fpGroup('trade');
    this.g.add(new THREE.AmbientLight(0xd8c8a8, 0.7));
    const lamp = new THREE.PointLight(0xffc880, 2.4, 1.6, 1.4); lamp.position.set(0.12, 0.3, -0.35); this.g.add(lamp);
    this.g.add(this.root);
    const mat = itemMat();
    // the board and the cloth
    const mb = new ModelBuilder();
    mb.box(0, -0.03, 0, TW + 0.06, 0.03, TD + 0.06, 'wood_crate');
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.box(x * (TW / 2 + 0.02), -0.004, z * (TD / 2 + 0.02), 0.012, 0.008, 0.012, 'stone_rough');
    // slate in its frame, the standing rail
    mb.box(0.215, 0.001, -0.075, 0.115, 0.006, 0.09, 'wood_dark');
    mb.box(0.215, 0.001, 0.105, 0.13, 0.006, 0.034, 'wood_light');
    this.root.add(new THREE.Mesh(mb.build(), mat));
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD), flatMat(this.cloth.tex)); cl.rotation.x = -Math.PI / 2; cl.position.y = 0.0005; this.root.add(cl);
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.075), flatMat(this.slate.tex)); sl.rotation.x = -Math.PI / 2; sl.position.set(0.215, 0.0075, -0.075); this.root.add(sl);
    const rl = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.024), flatMat(this.rail.tex)); rl.rotation.x = -Math.PI / 2; rl.position.set(0.215, 0.0075, 0.105); this.root.add(rl);
    this.bead = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6), new THREE.MeshLambertMaterial({ color: 0xd8a848, emissive: 0x2a1a04 }));
    this.bead.position.set(0.215, 0.013, 0.105); this.root.add(this.bead);
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.03), flatMat(this.slip.tex)); sp.rotation.x = -Math.PI / 2; sp.rotation.z = 0.02; sp.position.set(-0.1, 0.002, TD / 2 + 0.03); this.root.add(sp);
    this.root.add(this.goods);
    this.drawRail();
    this.layer = new PointerLayer('trade', { down: (e) => this.click(e), move: (e) => this.move(e) });
    window.addEventListener('keydown', (e) => { if (this.c && e.code === 'Escape') { e.stopPropagation(); this.close(); } }, true);
    bus.on('tribeTab', () => { if (this.c) this.dirty = true; });
    bus.on('tribeRep', () => { if (this.c) this.dirty = true; });
    bus.on('inventoryChanged', () => { if (this.c) this.dirty = true; });
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
    const k = 1 - Math.pow(1 - this.raise, 3);
    this.root.position.set(0.01, -0.06 - (1 - k) * 0.3, -0.84);
    this.root.rotation.set(1.02 - (1 - k) * 0.4, 0, 0);
    // hover lift, flying goods, the standing bead sliding along its rail
    for (const s of this.slots) { const want = s === this.hover ? s.y0 + 0.014 : s.y0; s.g.position.y += (want - s.g.position.y) * Math.min(1, dt * 16); }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f2 = this.flying[i]; f2.t += dt * 3;
      f2.g.position.lerp(f2.to, Math.min(1, dt * 10)); f2.g.position.y = 0.02 + Math.sin(Math.min(1, f2.t) * Math.PI) * 0.05;
      if (f2.t >= 1) { f2.g.removeFromParent(); this.flying.splice(i, 1); }
    }
    this.bead.position.x += (this.beadX - this.bead.position.x) * Math.min(1, dt * 6);
  }

  open(c: Creature) {
    const t = tribeOfCreature(c); if (!t) return;
    if (this.T.hostile(t) && !c.tamedBy) { bark(c, 'hostile', true); bus.emit('think', G.local, 'They are not in a talking mood.'); return; }
    if (!fpClaim('trade', 3)) return;
    this.c = c; this.raise = 0; this.hover = null;
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
    for (const s of this.slots) s.g.removeFromParent();
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
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.02; g.add(hit);
    const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.018), flatMat(priceTag(tagText, ink).tex));
    tg.rotation.x = -Math.PI / 2; tg.rotation.z = Math.sin(x * 40 + z * 13) * 0.25; tg.position.set(0.012, 0.001, 0.03); g.add(tg);
    if (want) { const bow = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.006), new THREE.MeshLambertMaterial({ color: 0xb02018 })); bow.position.set(-0.004, 0.003, 0.03); g.add(bow); }
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
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.073), flatMat(pt.tex)));
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), new THREE.MeshLambertMaterial({ color: 0xc02818 })); pin.position.set(0, 0.03, 0.003); g.add(pin);
    g.position.set(x, 0.035, -TD / 2 - 0.01); g.rotation.x = -0.35;
    this.goods.add(g);
    this.slots.push({ g, kind: 'job', key, price: 0, label: `JOB: ${title}  -  ${reward}`, y0: 0.035, ok: !stamp });
  }

  private token(face: string, label: string, ok: boolean) {
    const g = new THREE.Group();
    const mb = new ModelBuilder();
    mb.cylinder(0, 0, 0, 0.022, 0.012, 12, 'wood_dark', { color: 0x7a5232 });
    mb.cylinder(0, 0.012, 0, 0.017, 0.002, 12, 'wood_light');
    g.add(new THREE.Mesh(mb.build(), itemMat()));
    const pt = new PixTex(30, 12, 4); pt.reset(); pt.paper(0, 0, 30, 12, PAL.paper, 5); pt.pen(face, 15, -1, ok ? PAL.ink : PAL.inkRed, 11, { align: 'center' }); pt.flush();
    const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.0145), flatMat(pt.tex)); tg.rotation.x = -Math.PI / 2; tg.position.set(0, 0.0005, 0.03); g.add(tg);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), new THREE.MeshBasicMaterial({ visible: false })); g.add(hit);
    g.position.set(0.215, 0.002, 0.16);
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
    p.typed(text, 3, 2.5, PAL.ink, 7, p.w - 6);
    p.flush();
  }
}

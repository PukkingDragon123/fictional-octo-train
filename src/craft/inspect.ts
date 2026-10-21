// Close-up inspection and hands-on work. Double-click an item (in the cube,
// a tray, on the floor) or a chair in the world and it comes up in front of
// your face: drag to turn it over, FLIP to see the underside, wheel to bring
// it closer. Below it, what your hands can do to it with what you carry:
// saw a leg off a chair, beat scrap to an edge with a rock, tear a shirt into
// strips, braid strips into rope, seat a head on a handle and bind it. Each
// is a short physical motion, repeated: drag the saw along the line, click to
// strike the glowing edge, pull the cloth apart, circle round the joint.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { Container } from '../items/container';
import type { TileObject } from '../world/zone';
import { type Item, itemDef, itemName, itemWeight } from '../items/item';
import { objDef } from '../world/objects';
import { createItem } from '../items/factory';
import { size3, setPlace } from '../items/grid';
import { bestDest } from '../items/packResolver';
import { isWorldContainer } from '../game/worldOps';
import { queueTransfers } from '../actions/transfer';
import { itemMenuOptions } from '../interact/itemMenu';
import { recipesUsing } from '../interact/crafting';
import { itemIcon, itemIconFor } from '../ui/icons';
import { fpGroup, fpClaim, fpRelease, fpCamera } from '../fp/fp';
import { ModelBuilder } from '../gfx/modelBuilder';
import { hasUnlock, researchNode, grantResearch } from '../game/research';
import { shake as camShake } from '../gfx/juice';
import { type HandOp, opsForItem, opsForObject, opWork, pickTool, pickParts, type PartPick, partLabel, toolLabel } from './handOps';
import { Tweens, easeOut, easeBack, easeInOut, makeArm, poseArm, type Arm, makeBackdrop, makeItemObj, type ItemObj, itemAlign, Particles, fpMat, boxEdges, damp } from './fpKit';
import type { MenuOption } from '../ui/ui';

export type Subject = { kind: 'item'; it: Item; c: Container | null } | { kind: 'obj'; o: TileObject };
interface Work {
  h: HandOp; tool: Item | null; speed: number; parts: PartPick[]; need: number; done: number;
  phase: 'seat' | 'go' | 'finish'; a: THREE.Vector3; b: THREE.Vector3; joint: THREE.Vector3;
  t: number; dir: number; travel: number; ang: number; angAcc: number; pullX: number; pulling: boolean; needRelease: boolean;
  head: ItemObj | null; bands: THREE.Object3D[]; kerf: THREE.Mesh | null; swing: number;
}

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const VERB_LABEL: Record<string, string> = { saw: 'SAWING', grind: 'GRINDING', strike: 'STRIKING', tear: 'TEARING', wrap: 'BINDING', braid: 'BRAIDING' };
const VERB_HINT: Record<string, string> = {
  saw: 'hold and drag back and forth along the line', grind: 'hold and drag back and forth along the edge', strike: 'click the glowing line to strike',
  tear: 'press and pull sideways to tear a strip', wrap: 'circle round the joint to wrap it', braid: 'circle round the braid to twist it',
};

/** the work pose: long side across the screen, flat face toward you, tilted up by a */
function workPose(a: number, out: THREE.Quaternion) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, Math.cos(a), -Math.sin(a)), new THREE.Vector3(0, Math.sin(a), Math.cos(a)), new THREE.Vector3(1, 0, 0));
  return out.setFromRotationMatrix(m);
}

/** a chair tipped upside down for sawing, the near leg separate so it can come off */
function chairProxy(o: TileObject): { g: THREE.Group; leg: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3 } {
  const d = objDef(o.key);
  const snd = (d as any)?.sound || 'wood';
  const tex = snd === 'plastic' ? 'plastic_white' : snd === 'metal' ? 'metal_grey' : 'wood_light';
  const col = snd === 'plastic' ? 0xf2f0ea : snd === 'metal' ? 0xa0a6ac : 0xd8b888;
  const mb = new ModelBuilder();
  mb.box(0, 0, 0, 0.42, 0.04, 0.42, tex, { color: col });
  mb.box(0, -0.4, -0.19, 0.4, 0.4, 0.035, tex, { color: col });
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17]]) mb.cylinder(x, 0.04, z, 0.018, 0.42, 6, tex, { color: col, rTop: 0.014 });
  mb.box(0, 0.16, -0.17, 0.32, 0.02, 0.02, tex, { color: col });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mb.build(), fpMat()));
  const lb = new ModelBuilder();
  lb.cylinder(0, 0, 0, 0.018, 0.42, 6, tex, { color: col, rTop: 0.014 });
  const leg = new THREE.Mesh(lb.build(), fpMat());
  leg.position.set(0.17, 0.04, 0.17);
  g.add(leg);
  return { g, leg, a: new THREE.Vector3(0.12, 0.1, 0.17), b: new THREE.Vector3(0.22, 0.1, 0.17) };
}

export class Inspect {
  open = false;
  private built = false;
  private g!: THREE.Group;
  private hold = new THREE.Group();
  private turn = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private itemObj: ItemObj | null = null;
  private chair: ReturnType<typeof chairProxy> | null = null;
  private subj: Subject | null = null;
  private qT = new THREE.Quaternion();
  private dist = 1.15; private distT = 1.15;
  private tw = new Tweens();
  private arms: Arm[] = [];
  private sparks = new Particles(140, true, 3);
  private dust = new Particles(120, false, 2);
  private toolG = new THREE.Group();
  private toolObj: ItemObj | null = null;
  private guide: THREE.Line;
  private guideMat = new THREE.LineBasicMaterial({ color: 0xffd04a, transparent: true, opacity: 0.9, depthTest: false });
  private work: Work | null = null;
  private drag: { id: number; x: number; y: number; moved: number } | null = null;
  private px = 0; private py = 0; private down = false;
  private shakeT = 0;
  private lastT = performance.now();
  private onClose: (() => void) | null = null;
  private benchMode = false;
  // DOM
  root: HTMLDivElement;
  private panel: HTMLElement; private ops: HTMLElement; private prog: HTMLElement; private note: HTMLElement; private hint: HTMLElement;
  private noteT = 0;

  constructor() {
    const r = document.createElement('div');
    r.className = 'fpk fpk-inspect';
    r.innerHTML = `<div class="fpk-top"><div class="fpk-title">CLOSE LOOK<small>drag: turn it over · wheel: closer</small></div></div>
      <div class="fpk-panel"></div><div class="fpk-ops"></div>
      <div class="fpk-prog"><div class="lbl"></div><div class="fpk-bar"><i></i></div></div>
      <div class="fpk-btns"><button class="fpk-b" data-b="flip">FLIP<kbd>F</kbd></button><button class="fpk-b" data-b="back">BACK<kbd>Esc</kbd></button></div>
      <div class="fpk-hint"></div><div class="fpk-note"></div>`;
    document.body.appendChild(r);
    this.root = r;
    this.panel = r.querySelector('.fpk-panel')!; this.ops = r.querySelector('.fpk-ops')!; this.prog = r.querySelector('.fpk-prog')!;
    this.note = r.querySelector('.fpk-note')!; this.hint = r.querySelector('.fpk-hint')!;
    r.querySelectorAll<HTMLButtonElement>('.fpk-b').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (b.dataset.b === 'flip') this.flip(); else this.close(); }));
    r.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    r.addEventListener('wheel', (e) => { e.preventDefault(); if (!this.work) this.distT = Math.max(0.7, Math.min(1.6, this.distT + (e.deltaY > 0 ? 0.08 : -0.08))); }, { passive: false });
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    r.addEventListener('touchmove', (e) => { if (this.open) e.preventDefault(); }, { passive: false });
    const gg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
    this.guide = new THREE.Line(gg, this.guideMat);
    this.guide.renderOrder = 8;
    this.guide.visible = false;
    bus.on('fpLost', (n: string) => { if (n === 'inspect' && this.open) this.close(true); });
  }

  private build() {
    if (this.built) return;
    this.built = true;
    const g = (this.g = fpGroup('inspect'));
    g.add(makeBackdrop());
    (g.children[0] as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x0c0c0e, transparent: true, opacity: 0.94, depthWrite: false });
    g.add(new THREE.AmbientLight(0xc8ccd0, 0.6));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.25); key.position.set(-0.6, 1.2, 0.9); g.add(key);
    const rim = new THREE.DirectionalLight(0xffb060, 0.5); rim.position.set(0.9, 0.2, -0.4); g.add(rim);
    g.add(this.hold); this.hold.add(this.turn);
    g.add(this.toolG, this.sparks.points, this.dust.points);
    for (const s of [1, -1] as const) { const a = makeArm(s); g.add(a.root); this.arms.push(a); }
  }

  get busy() { return !!this.work; }

  /** open the close-up on an item (c = where it is) or a world object */
  show(s: Subject, opts: { op?: string; onClose?: () => void; bench?: boolean } = {}) {
    if (!G.local) return;
    this.build();
    if (!this.open) { if (!fpClaim('inspect', 5)) return; }
    this.open = true;
    this.onClose = opts.onClose ?? this.onClose;
    this.benchMode = !!opts.bench;
    this.root.classList.add('on', 'ready');
    G.input.pointerOverUI = true;
    this.setSubject(s);
    if (opts.op) { const h = this.opsFor().find((o) => o.key === opts.op); if (h) this.startOp(h); }
  }

  close(lost = false) {
    if (!this.open) return;
    this.endWork(false);
    this.open = false;
    this.root.classList.remove('on', 'ready');
    if (!lost) fpRelease('inspect');
    if (this.model) { this.turn.remove(this.model); this.model = null; }
    this.subj = null;
    G.input.pointerOverUI = !!G.ui?.inventory?.open;
    const cb = this.onClose; this.onClose = null;
    cb?.();
  }

  private setSubject(s: Subject) {
    this.endWork(false);
    if (this.model) this.turn.remove(this.model);
    this.subj = s;
    this.itemObj = null; this.chair = null;
    if (s.kind === 'item') {
      const o = makeItemObj(s.it.key);
      const al = itemAlign(s.it.key);
      const big = al ? Math.max(...al.base) : 0.2;
      o.outer.scale.setScalar(0.42 / Math.max(0.05, big));
      o.outer.quaternion.identity();
      this.itemObj = o; this.model = o.outer;
      workPose(0.55, this.qT);
    } else {
      const c = chairProxy(s.o);
      c.g.scale.setScalar(0.62);
      this.chair = c; this.model = c.g;
      this.qT.setFromEuler(_e.set(0.42, -0.75, 0));
    }
    this.turn.add(this.model);
    this.turn.quaternion.copy(this.qT);
    // it comes up into view with a turn
    this.hold.position.set(0, -0.5, -this.dist);
    this.tw.add(0.32, (k) => { this.hold.position.y = -0.5 + 0.5 * k; }, easeBack);
    G.audio?.itemSound?.(s.kind === 'item' ? s.it.key : 'plank', 'pick', G.local);
    this.renderPanel(); this.renderOps();
  }

  private flip() {
    if (this.work) return;
    _q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI);
    this.qT.premultiply(_q);
    G.audio?.ui?.('bag_rot', 0.4);
  }

  // ---------------------------------------------------------------- the panel and the hands-on choices
  private opsFor(): HandOp[] {
    const s = this.subj;
    if (!s) return [];
    return s.kind === 'item' ? opsForItem(s.it) : opsForObject(s.o);
  }
  private carried(it: Item): boolean { return G.local.allItems().includes(it); }

  private renderPanel() {
    const s = this.subj!;
    if (s.kind === 'obj') {
      const d = objDef(s.o.key);
      this.panel.innerHTML = `<h3>${(d?.name || s.o.key).toUpperCase()}</h3><p class="dim">Tipped over in front of you. Four legs, held on with glue and habit.</p><p>Each leg is a straight, dry length of hardwood: a handle, a club, a splint.</p>`;
      return;
    }
    const it = s.it, d = itemDef(it.key);
    const sz = size3(it.key);
    const uses = [...new Set([...opsForItem(it).map((h) => h.name), ...recipesUsing(it).slice(0, 6).map((r) => r.name)])].slice(0, 7);
    const cond = d.durability || d.weapon ? `<br>condition ${Math.round(it.cond * 100)}%` : '';
    const fluid = it.fluid ? `<br>${it.fluid.amount.toFixed(2)} L ${it.fluid.type}` : '';
    this.panel.innerHTML = `<h3>${itemName(it).toUpperCase()}</h3>
      <span class="dim">${itemWeight(it).toFixed(2)} kg · ${sz[0]}×${sz[1]}×${sz[2]} cells${d.value ? ' · ' + d.value + ' scrip' : ''}${cond}${fluid}</span>
      ${d.desc ? `<p>${d.desc}</p>` : ''}
      ${uses.length ? `<p class="dim">goes into: ${uses.join(', ').toLowerCase()}</p>` : ''}
      ${s.c && !this.carried(it) ? '<p class="dim">Not yours yet: take it to work on it.</p>' : ''}`;
  }

  private renderOps() {
    const p = G.local;
    const s = this.subj!;
    this.ops.innerHTML = '';
    const it = s.kind === 'item' ? s.it : null;
    const mine = !it || this.carried(it);
    for (const h of this.opsFor()) {
      const b = document.createElement('button');
      b.className = 'fpk-op';
      const tool = pickTool(p, h, it);
      const parts = pickParts(p, h, it);
      const missing = parts.filter((q) => q.missing);
      let why = '';
      if (h.requires && !hasUnlock(h.requires)) why = 'research: ' + (researchNode(h.requires)?.title || h.requires).toLowerCase();
      else if (!mine) why = 'take it first';
      else if (!tool) why = 'need ' + toolLabel(h);
      else if (missing.length) why = 'need ' + missing.map((m) => partLabel(m.req)).join(', ');
      const icon = tool?.it ? itemIconFor(tool.it, 22) : '';
      b.innerHTML = (icon ? `<img src="${icon}">` : '') + `<span>${h.name.toUpperCase()}<small>${why || (tool?.it ? 'with ' + itemName(tool.it).toLowerCase() : 'bare hands')}</small></span>`;
      if (why) b.disabled = true;
      b.title = h.desc;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!why) this.startOp(h); });
      this.ops.appendChild(b);
    }
    // the ordinary things you do with it (eat, wear, read, drop...)
    if (it && s.kind === 'item') {
      if (!mine && s.c) {
        this.actChip('TAKE', () => { queueTransfers(p, [it], s.c!, p.inv); this.close(); });
      } else if (s.c) {
        let opts: MenuOption[] = [];
        try { opts = itemMenuOptions(p, it, s.c, [it]); } catch { opts = []; }
        const flat: MenuOption[] = [];
        for (const o of opts) { if (o.sub) flat.push(...o.sub.slice(0, 3).map((q) => ({ ...q, label: o.label + ': ' + q.label }))); else flat.push(o); }
        for (const o of flat.filter((q) => q.action && !q.disabled).slice(0, 7)) this.actChip(o.label.toUpperCase(), () => { this.close(); o.action!(); });
      }
    }
    this.hint.textContent = this.opsFor().length ? 'pick what to do with your hands below' : 'drag to turn it over';
  }
  private actChip(label: string, fn: () => void) {
    const b = document.createElement('button');
    b.className = 'fpk-op act';
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    this.ops.appendChild(b);
  }

  // ---------------------------------------------------------------- work
  startOp(h: HandOp) {
    const p = G.local;
    const s = this.subj;
    if (!s || this.work) return;
    const it = s.kind === 'item' ? s.it : null;
    const tool = pickTool(p, h, it);
    const parts = pickParts(p, h, it);
    if (!tool || parts.some((q) => q.missing)) { this.say('missing something', true); return; }
    const need = Math.max(1, Math.round(opWork(h, p, it)));
    const w: Work = { h, tool: tool.it, speed: tool.speed, parts, need, done: 0, phase: 'go', a: new THREE.Vector3(), b: new THREE.Vector3(), joint: new THREE.Vector3(),
      t: 0.5, dir: 0, travel: 0, ang: NaN, angAcc: 0, pullX: 0, pulling: false, needRelease: false, head: null, bands: [], kerf: null, swing: 0 };
    // where the work happens, in the model's own space
    if (this.chair) { w.a.copy(this.chair.a); w.b.copy(this.chair.b); w.joint.copy(w.a).add(w.b).multiplyScalar(0.5); }
    else if (this.itemObj) {
      const al = itemAlign(this.itemObj.key)!;
      const [M, L, S] = al ? al.base : [0.05, 0.2, 0.02];
      if (h.verb === 'strike' || h.verb === 'grind') { w.a.set(M / 2, S / 2, -L * 0.4); w.b.set(M / 2, S / 2, L * 0.4); }
      else if (h.verb === 'wrap') { w.a.set(0, 0, L * 0.28); w.b.set(0, 0, L * 0.46); }
      else { w.a.set(0, S / 2, -L * 0.42); w.b.set(0, S / 2, L * 0.42); }
      w.joint.copy(w.a).add(w.b).multiplyScalar(0.5);
      workPose(h.verb === 'strike' || h.verb === 'grind' ? 0.25 : 0.55, this.qT);
    }
    this.distT = 1.05;
    // a head to seat before binding
    if (h.verb === 'wrap' && this.itemObj) {
      const headPick = parts.find((q) => q.req.label !== 'binding' && q.items[0]);
      if (headPick) {
        const ho = makeItemObj(headPick.items[0].key);
        const al = itemAlign(this.itemObj.key);
        const L = al ? al.base[1] : 0.4;
        ho.outer.position.set(0, 0.12, L * 0.42);
        ho.outer.rotation.set(0, Math.PI / 2, 0);
        this.itemObj.outer.add(ho.outer);
        w.head = ho; w.phase = 'seat';
      }
    }
    if (h.verb === 'saw' && this.model) {
      const kerf = new THREE.Mesh(new THREE.BoxGeometry(0.004, 1, 0.05), new THREE.MeshBasicMaterial({ color: 0x1a0e06 }));
      kerf.position.copy(w.joint); kerf.scale.y = 0.001;
      this.model.add(kerf); w.kerf = kerf;
    }
    this.work = w;
    // the tool comes into your hand
    if (this.toolObj) { this.toolG.remove(this.toolObj.outer); this.toolObj = null; }
    if (w.tool) {
      const to = makeItemObj(w.tool.key);
      const al = itemAlign(w.tool.key);
      to.outer.scale.setScalar(0.3 / Math.max(0.05, al ? Math.max(...al.base) : 0.2));
      this.toolG.add(to.outer);
      this.toolObj = to;
    }
    this.toolG.visible = true;
    this.g.add(this.guide);
    this.guide.visible = true;
    this.guideMat.color.setHex(h.verb === 'strike' ? 0xffa040 : 0xffd04a);
    this.ops.innerHTML = '';
    this.prog.classList.add('on');
    this.hint.textContent = w.phase === 'seat' ? 'click the head to seat it on the handle' : VERB_HINT[h.verb];
    this.updProg();
    G.audio?.itemSound?.(w.tool?.key || 'rag', 'equip', p);
  }

  private endWork(done: boolean) {
    const w = this.work;
    if (!w) return;
    this.work = null;
    this.guide.visible = false;
    this.toolG.visible = false;
    if (w.head) w.head.outer.parent?.remove(w.head.outer);
    for (const b of w.bands) b.parent?.remove(b);
    if (w.kerf) w.kerf.parent?.remove(w.kerf);
    this.prog.classList.remove('on');
    if (!done && this.subj) { this.renderOps(); workPose(0.55, this.qT); if (this.chair) this.qT.setFromEuler(_e.set(0.42, -0.75, 0)); }
  }

  private updProg() {
    const w = this.work;
    if (!w) return;
    (this.prog.querySelector('.lbl') as HTMLElement).textContent = `${VERB_LABEL[w.h.verb]} · ${Math.min(w.need, Math.floor(w.done))}/${w.need}`;
    (this.prog.querySelector('i') as HTMLElement).style.width = Math.min(100, (w.done / w.need) * 100) + '%';
  }

  /** one good motion: saw stroke, strike, strip, loop */
  private progress(amount: number, at: THREE.Vector3) {
    const w = this.work!;
    const before = Math.floor(w.done);
    w.done += amount;
    const v = w.h.verb;
    const metal = this.subj?.kind === 'item' && (itemDef(this.subj.it.key).tags || []).includes('metal');
    if (v === 'saw') { G.audio?.ui?.('craft_saw', 0.5); this.dust.emit(at.x, at.y, at.z, 6, 0xd8b070, 0.35, 0.2); this.shakeT = 0.05; }
    else if (v === 'grind') { G.audio?.ui?.('craft_grind', 0.45); this.sparks.emit(at.x, at.y, at.z, 9, 0xffb040, 0.7, 0.4); this.shakeT = 0.04; }
    else if (v === 'strike') {
      G.audio?.ui?.(metal ? 'craft_clang' : 'craft_crack', 0.55);
      if (metal) this.sparks.emit(at.x, at.y, at.z, 16, 0xffc050, 1.1, 0.8); else this.dust.emit(at.x, at.y, at.z, 10, 0xc8a070, 0.6, 0.6);
      this.shakeT = 0.14; camShake(0.08, 0.1);
    }
    else if (v === 'tear') { G.audio?.ui?.('craft_tear', 0.55); this.dust.emit(at.x, at.y, at.z, 10, 0xe8dcc0, 0.4, 0.3); this.shakeT = 0.08; }
    else { G.audio?.ui?.('craft_wrap', 0.45); this.dust.emit(at.x, at.y, at.z, 3, 0xe8dcc0, 0.2, 0.2); }
    if (w.kerf) w.kerf.scale.y = Math.min(0.05, 0.05 * (w.done / w.need));
    if ((v === 'wrap' || v === 'braid') && Math.floor(w.done) > before) this.addBand(w);
    if (v === 'tear' && Math.floor(w.done) > before) this.flyStrip();
    this.updProg();
    if (w.done >= w.need - 1e-6 && w.phase !== 'finish') { w.phase = 'finish'; setTimeout(() => this.finish(), v === 'saw' || v === 'strike' ? 220 : 120); }
  }

  private addBand(w: Work) {
    if (!this.model || !this.itemObj) return;
    const al = itemAlign(this.itemObj.key);
    const r = al ? Math.max(al.base[0], al.base[2]) / 2 + 0.005 : 0.02;
    const n = w.bands.length;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 8, 1, true), new THREE.MeshLambertMaterial({ color: n % 2 ? 0xd8ccaa : 0xe8dcc0, side: THREE.DoubleSide }));
    band.rotation.x = Math.PI / 2;
    band.rotation.z = (n % 2 ? 0.35 : -0.35);
    band.position.copy(w.a).lerp(w.b, (n + 0.5) / Math.max(1, w.need));
    this.itemObj.outer.add(band);
    w.bands.push(band);
    if (w.h.verb === 'braid') this.qT.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), 0.6));
  }

  private flyStrip() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.32), new THREE.MeshLambertMaterial({ color: 0xe0d4b4 }));
    m.position.set(0.05, 0, -this.dist + 0.1);
    this.g.add(m);
    const sx = (Math.random() - 0.5) * 0.4;
    this.tw.add(0.5, (k) => { m.position.set(0.05 + sx * k, -0.02 + k * 0.2 - k * k * 0.6, -this.dist + 0.1); m.rotation.set(k * 3, k * 2, k); }, (x) => x, () => this.g.remove(m));
    if (this.model) { const s = this.model.scale.x; this.model.scale.setScalar(s * 0.94); }
  }

  /** the work is done: use up the parts, make the thing, show it */
  private finish() {
    const w = this.work;
    const s = this.subj;
    const p = G.local;
    if (!w || !s || !p) return;
    const h = w.h;
    const target = s.kind === 'item' ? s.it : null;
    // re-check: things can go missing while you work (co-op, the floor)
    const parts = pickParts(p, h, target);
    if (parts.some((q) => q.missing) || (target && !this.carried(target))) { this.say('something went missing', true); this.endWork(false); return; }
    for (const pk of parts) {
      if (pk.uses) { for (const it of pk.items) { it.uses = (it.uses ?? 1) - pk.uses; if (it.uses <= 0.005) p.removeItem(it); } continue; }
      for (const it of pk.items) p.removeItem(it);
    }
    if (w.tool) { const td = itemDef(w.tool.key); if (td.durability) w.tool.cond = Math.max(0, w.tool.cond - (w.need * 0.6) / td.durability); }
    if (target && !h.keepTarget) p.removeItem(target);
    const outs: Item[] = [];
    for (const [key, n] of h.out(target, s.kind === 'obj' ? s.o : null)) {
      for (let i = 0; i < n; i++) {
        const it = createItem(key, undefined, { pristine: true });
        if (hasUnlock('rc_crude_tools') && itemDef(key).durability) it.cond = 1;
        else if (itemDef(key).durability) it.cond = 0.75 + Math.random() * 0.15;
        const b = bestDest(p, it);
        if (b) { setPlace(it, b.at); b.c.add(it); } else p.inv.add(it);
        outs.push(it);
      }
    }
    if (h.xp) p.body.addXp(h.xp[0] as any, h.xp[1]);
    if (h.flag) G.missions?.set?.(h.flag);
    const known: Set<string> = (p as any).knownRecipes || ((p as any).knownRecipes = new Set<string>());
    const first = !known.has('hand:' + h.key);
    if (first) { known.add('hand:' + h.key); grantResearch(1, 'discovery:' + h.key); }
    bus.emit('handCrafted', p, h.key, outs);
    bus.emit('inventoryChanged', p);
    G.audio?.ui?.('craft_done', 0.5);
    this.sparks.emit(0, 0, -this.dist + 0.1, 24, 0xfff0b0, 0.8, 0.6);
    const out0 = outs[0];
    this.say((first ? 'discovered: ' + h.name.toLowerCase() + ' · ' : '') + '+ ' + (out0 ? itemName(out0).toLowerCase() : '') + (outs.length > 1 ? ' ×' + outs.length : ''));
    // the chair gives up the leg (and falls apart); the leg drops away
    if (s.kind === 'obj') {
      const leg = this.chair?.leg;
      if (leg) this.tw.add(0.5, (k) => { leg.position.y = 0.04 + k * 0.2 - k * k * 0.9; leg.rotation.z = -k * 1.6; leg.position.x = 0.17 + k * 0.2; }, (x) => x);
      try { G.destruct?.damageObject?.(p, s.o, 999, 'saw'); } catch (e) { console.warn('chair break', e); }
    }
    this.work = null;
    this.guide.visible = false; this.toolG.visible = false; this.prog.classList.remove('on');
    if (w.head) w.head.outer.parent?.remove(w.head.outer);
    // look at what you made
    setTimeout(() => { if (this.open && out0) this.setSubject({ kind: 'item', it: out0, c: p.containerOf(out0) || p.inv }); else if (this.open) this.renderOps(); }, s.kind === 'obj' ? 600 : 250);
  }

  private say(t: string, bad = false) {
    this.note.textContent = t.toUpperCase();
    this.note.className = 'fpk-note on' + (bad ? ' bad' : '');
    this.noteT = 2.2;
  }

  // ---------------------------------------------------------------- input
  private onKey(e: KeyboardEvent) {
    if (!this.open || G.input.textFocus) return;
    const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };
    if (e.code === 'Escape') { stop(); if (this.work) this.endWork(false); else this.close(); return; }
    if (e.code === 'KeyF') { stop(); this.flip(); return; }
    if ((G.input.bindings.inventory || []).includes(e.code)) { stop(); this.close(); return; }
    stop();
  }

  private screenOf(local: THREE.Vector3, out: { x: number; y: number }) {
    if (!this.model) return out;
    _v.copy(local); this.model.localToWorld(_v); _v.project(fpCamera());
    out.x = ((_v.x + 1) / 2) * window.innerWidth; out.y = ((1 - _v.y) / 2) * window.innerHeight;
    return out;
  }
  private worldOf(local: THREE.Vector3, out: THREE.Vector3) { out.copy(local); this.model?.localToWorld(out); return out; }
  /** the pointer on the plane through the work spot, facing you */
  private pointerAt(x: number, y: number, z: number, out: THREE.Vector3) {
    const cam = fpCamera();
    _w.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5).unproject(cam).normalize();
    return out.copy(_w).multiplyScalar(z / _w.z);
  }

  private sa = { x: 0, y: 0 }; private sb = { x: 0, y: 0 }; private sj = { x: 0, y: 0 };

  private onDown(e: PointerEvent) {
    if (!this.open) return;
    if ((e.target as HTMLElement).closest('.fpk-b,.fpk-op,.fpk-panel')) return;
    this.px = e.clientX; this.py = e.clientY; this.down = true;
    const w = this.work;
    if (!w) { this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; return; }
    if (w.phase === 'seat') {
      // press the head down onto the handle
      if (w.head) {
        const head = w.head;
        const al = this.itemObj ? itemAlign(this.itemObj.key) : null;
        const L = al ? al.base[1] : 0.4;
        G.audio?.ui?.('cube_place', 0.6);
        this.tw.add(0.16, (k) => { head.outer.position.y = 0.12 * (1 - k); head.outer.position.z = L * 0.42; }, easeOut, () => { this.shakeT = 0.1; w.phase = 'go'; this.hint.textContent = VERB_HINT.wrap; });
      }
      return;
    }
    if (w.phase !== 'go') return;
    if (w.h.verb === 'strike') this.strike(e.clientX, e.clientY);
    else if (w.h.verb === 'tear') { if (!w.needRelease) { w.pulling = true; w.pullX = e.clientX; } }
    else if (w.h.verb === 'wrap' || w.h.verb === 'braid') { w.ang = NaN; }
  }

  private onMove(e: PointerEvent) {
    if (!this.open) return;
    const dx = e.clientX - this.px, dy = e.clientY - this.py;
    this.px = e.clientX; this.py = e.clientY;
    const w = this.work;
    if (!w) {
      const d = this.drag;
      if (d && d.id === e.pointerId) {
        d.moved += Math.abs(dx) + Math.abs(dy);
        _q.setFromAxisAngle(_v.set(0, 1, 0), dx * 0.01); this.qT.premultiply(_q);
        _q.setFromAxisAngle(_v.set(1, 0, 0), dy * 0.01); this.qT.premultiply(_q);
      }
      return;
    }
    if (w.phase !== 'go' || !this.down) return;
    const v = w.h.verb;
    if (v === 'saw' || v === 'grind') {
      this.screenOf(w.a, this.sa); this.screenOf(w.b, this.sb);
      const ax = this.sb.x - this.sa.x, ay = this.sb.y - this.sa.y, l2 = Math.max(1, ax * ax + ay * ay);
      const t = ((e.clientX - this.sa.x) * ax + (e.clientY - this.sa.y) * ay) / l2;
      const tc = Math.max(-0.2, Math.min(1.2, t));
      const px = this.sa.x + ax * tc - e.clientX, py = this.sa.y + ay * tc - e.clientY;
      const off = Math.hypot(px, py);
      const dt = tc - w.t;
      w.t = tc;
      const dir = Math.sign(dt);
      if (off < 90 && Math.abs(dt) > 1e-4) {
        if (dir !== 0 && dir !== w.dir && w.travel > 0.5) { w.travel = 0; this.progress(w.speed, this.worldOf(_w.copy(w.a).lerp(w.b, Math.max(0, Math.min(1, tc))), new THREE.Vector3())); }
        if (dir !== 0) w.dir = dir;
        w.travel += Math.abs(dt);
        if (Math.random() < 0.3) { this.worldOf(_w.copy(w.a).lerp(w.b, Math.max(0, Math.min(1, tc))), _v); (v === 'grind' ? this.sparks : this.dust).emit(_v.x, _v.y, _v.z, 1, v === 'grind' ? 0xffa030 : 0xc8a070, 0.25, 0.1); }
      }
    } else if (v === 'tear' && w.pulling) {
      const k = Math.abs(e.clientX - w.pullX) / (window.innerWidth * 0.26);
      if (k >= 1) { w.pulling = false; w.needRelease = true; this.progress(1, this.worldOf(w.joint, new THREE.Vector3())); }
    } else if (v === 'wrap' || v === 'braid') {
      this.screenOf(w.joint, this.sj);
      const rx = e.clientX - this.sj.x, ry = e.clientY - this.sj.y;
      const r = Math.hypot(rx, ry);
      if (r < 18 || r > Math.max(window.innerWidth, window.innerHeight) * 0.45) return;
      const ang = Math.atan2(ry, rx);
      if (!Number.isNaN(w.ang)) {
        let d = ang - w.ang;
        if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
        w.angAcc += Math.abs(d);
        if (w.angAcc >= Math.PI * 2 / Math.max(0.5, w.speed)) { w.angAcc = 0; this.progress(1, this.worldOf(w.joint, new THREE.Vector3())); }
      }
      w.ang = ang;
    }
  }

  private onUp(e: PointerEvent) {
    if (!this.open) return;
    this.down = false;
    if (this.drag && this.drag.id === e.pointerId) this.drag = null;
    const w = this.work;
    if (w) { w.pulling = false; w.needRelease = false; w.ang = NaN; }
  }

  private strike(x: number, y: number) {
    const w = this.work!;
    if (w.swing > 0) return;
    this.screenOf(w.a, this.sa); this.screenOf(w.b, this.sb);
    const ax = this.sb.x - this.sa.x, ay = this.sb.y - this.sa.y, l2 = Math.max(1, ax * ax + ay * ay);
    const t = Math.max(0, Math.min(1, ((x - this.sa.x) * ax + (y - this.sa.y) * ay) / l2));
    const d = Math.hypot(this.sa.x + ax * t - x, this.sa.y + ay * t - y);
    const tol = coarse() ? 46 : 32;
    w.swing = 0.0001;
    this.tw.add(0.09, (k) => { w.swing = k; }, easeInOut, () => {
      w.swing = 0;
      const at = this.worldOf(_w.copy(w.a).lerp(w.b, t), new THREE.Vector3());
      if (d <= tol) this.progress(w.speed * (0.65 + 0.35 * (1 - d / tol)), at);
      else { G.audio?.ui?.('craft_thud', 0.45); this.dust.emit(at.x, at.y - 0.03, at.z, 4, 0x8a8478, 0.3, 0.3); this.shakeT = 0.06; this.say('missed the edge', true); }
      if (!w.tool && this.subj?.kind === 'obj') bus.emit('think', G.local, 'Ow.');
    });
  }

  // ---------------------------------------------------------------- frame
  update() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.open) return;
    this.tw.update(dt);
    this.dist = damp(this.dist, this.distT, 10, dt);
    this.hold.position.z = -this.dist;
    this.turn.quaternion.slerp(this.qT, 1 - Math.exp(-12 * dt));
    if (this.shakeT > 0) { this.shakeT -= dt; const k = Math.max(0, this.shakeT) * 0.12; this.turn.position.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, 0); }
    else this.turn.position.set(0, 0, 0);
    this.sparks.update(dt, 2.6); this.dust.update(dt, 1.6);
    const w = this.work;
    // guide line
    if (w && this.model) {
      this.worldOf(w.a, _v); this.worldOf(w.b, _w);
      const pos = this.guide.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, _v.x, _v.y, _v.z); pos.setXYZ(1, _w.x, _w.y, _w.z); pos.needsUpdate = true;
      this.guide.geometry.computeBoundingSphere();
      this.guideMat.opacity = 0.55 + 0.4 * Math.sin(now * 0.008);
      this.guide.visible = w.phase !== 'finish' && (w.h.verb !== 'wrap' || w.phase === 'go');
    }
    // the tool follows your hand
    if (w && this.toolObj) {
      const z = this.worldOf(w.joint, _v).z;
      const at = this.pointerAt(this.px, this.py, z, _w);
      const o = this.toolObj.outer;
      if (w.h.verb === 'strike') {
        o.position.set(at.x + 0.05, at.y + 0.1 * (1 - w.swing) + 0.02, at.z + 0.06);
        o.rotation.set(0.2, 0.4, 0.9 - w.swing * 0.8);
      } else if (w.h.verb === 'saw' || w.h.verb === 'grind') {
        o.position.lerp(_v.set(at.x, at.y + 0.015, at.z + 0.04), 1 - Math.exp(-30 * dt));
        o.rotation.set(0, Math.PI / 2, 0.08);
      } else { o.position.lerp(_v.set(at.x + 0.06, at.y - 0.04, at.z + 0.08), 1 - Math.exp(-20 * dt)); o.rotation.set(0.3, 0.6, 0.4); }
    }
    this.poseHands(dt);
    if (this.noteT > 0) { this.noteT -= dt; if (this.noteT <= 0) this.note.classList.remove('on'); }
  }

  private gl = new THREE.Vector3(-0.3, -0.25, -1); private gr = new THREE.Vector3(0.3, -0.25, -1);
  private poseHands(dt: number) {
    const [aR, aL] = this.arms;
    const w = this.work;
    const m = this.model;
    if (!m) return;
    const al = this.itemObj ? itemAlign(this.itemObj.key) : null;
    const L = al ? al.base[1] : 0.5;
    // left hand holds the thing by its far end; right hand holds the tool, or the near end
    const lt = this.chair ? this.worldOf(_v.set(-0.2, 0.02, 0.15), new THREE.Vector3()) : this.worldOf(_v.set(0, 0, -L * 0.42), new THREE.Vector3());
    let rt: THREE.Vector3;
    if (w && this.toolObj) rt = this.toolObj.outer.getWorldPosition(new THREE.Vector3()).add(_v.set(0.03, -0.05, 0.02));
    else if (w && w.h.verb === 'tear') {
      rt = this.worldOf(_v.set(0, 0, L * 0.42), new THREE.Vector3());
      const k = w.pulling ? Math.min(1, Math.abs(this.px - w.pullX) / (window.innerWidth * 0.26)) : 0;
      rt.x += k * 0.08; lt.x -= k * 0.08;
    } else if (w && (w.h.verb === 'wrap' || w.h.verb === 'braid')) {
      rt = this.worldOf(w.joint, new THREE.Vector3());
      const a = w.angAcc * 3 + performance.now() * 0.002 * (this.down ? 1 : 0);
      rt.x += Math.cos(a) * 0.04; rt.y += Math.sin(a) * 0.04; rt.z += 0.03;
    } else rt = this.worldOf(_v.set(0, 0, L * 0.42), new THREE.Vector3());
    if (this.chair && !w) rt.set(0.32, -0.32, -0.95);
    this.gl.lerp(lt, 1 - Math.exp(-16 * dt)); this.gr.lerp(rt, 1 - Math.exp(-16 * dt));
    aL.target.copy(this.gl); aR.target.copy(this.gr);
    aL.grip = 0.85; aR.grip = w && w.h.verb === 'strike' && !w.tool ? 1 : 0.85;
    poseArm(aL, 1.2); poseArm(aR, -1.2);
  }
}
void easeBack; void boxEdges; void itemIcon; void isWorldContainer;

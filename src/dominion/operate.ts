// The operation, first person, hands on: kneel over the downed thing, saw
// round the skull, pry the cap off, grab the brain and tear it out, seat the
// mechanical cortex, throw the switch. Pointer-driven (mouse or finger) over
// the renderer's overlay stage (src/fp/fp.ts); nothing here is a menu.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { fpGroup, fpClaim, fpRelease, fpCamera } from '../fp/fp';
import { worldMaterial } from '../gfx/materials';
import { ModelBuilder } from '../gfx/modelBuilder';
import { makeHeldMesh } from '../items/itemMeshes';
import { hitstop, shake, punch } from '../gfx/juice';
import { op } from '../game/ops';
import type { Item } from '../items/item';
import type { Creature } from '../creatures/creature';
import type { DominionSystem } from './dominion';
import { BRAIN_MODELS, brainTier } from './brains';
import { PixTex, PAL, PointerLayer, flatMat } from '../scan/pix';
import { Screen } from '../ui/font5x7';

type Step = 'saw' | 'pry' | 'pull' | 'seat' | 'boot' | 'done';
const STEPS: Step[] = ['saw', 'pry', 'pull', 'seat', 'boot'];
const TEXT: Record<Step, [string, string]> = {
  saw: ['SAW ALONG THE LINE', 'drag back and forth across the skull'],
  pry: ['PRY THE CAP OFF', 'drag upward'],
  pull: ['TEAR IT OUT', 'grab the brain and yank it free'],
  seat: ['SEAT THE CORTEX', 'drag it into the skull'],
  boot: ['THROW THE SWITCH', 'tap the switch'],
  done: ['', ''],
};
const BLOOD: Record<string, number> = { red: 0x8a0f0a, dark: 0x2a0a12, pale: 0xb88a8a, static: 0x5878a0, stuffing: 0xe8dcc8, plaster: 0xe0d8c8, shell: 0xc8b890, oil: 0x141210, glow: 0x7aff5a, glass: 0x9ad0e0, none: 0x6a5a50 };
const R = 0.11, CAP = 0.85; // head radius, cap polar angle
const ringY = Math.cos(CAP) * R * 0.78, ringR = Math.sin(CAP) * R;

interface Drop { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number }

export class Operation {
  active = false;
  private c: Creature | null = null;
  private brainItem: Item | null = null;
  private tier: 1 | 2 | 3 = 1;
  private step: Step = 'saw';
  private g: THREE.Group;
  private root = new THREE.Group();
  private head = new THREE.Group();
  private cap = new THREE.Group();
  private brain = new THREE.Group();
  private tendrils: THREE.Mesh[] = [];
  private dashes: THREE.Mesh[] = [];
  private mech = new THREE.Group();
  private lever = new THREE.Group();
  private tool = new THREE.Group();
  private drops: Drop[] = [];
  private dropGeo = new THREE.BoxGeometry(0.006, 0.006, 0.006);
  private matBlood: THREE.MeshBasicMaterial;
  private matSpark = new THREE.MeshBasicMaterial({ color: 0xffe080 });
  private matSkin = new THREE.MeshLambertMaterial({ color: 0x9c7c6a });
  private matSteel = worldMaterial({ noVis: true, noFog: true, noGrid: true });
  private tv1 = new THREE.Vector3(); private tv2 = new THREE.Vector3();
  private dashMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
  private dashCut = new THREE.MeshBasicMaterial({ color: 0x3a0606 });
  private layer: PointerLayer;
  private card = new PixTex(120, 92);
  private plunger = new THREE.Group();
  private plungeT = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  // pointer state
  private down = false;
  private px = 0; private py = 0; private sx = 0; private sy = 0; private lastDir = 0;
  private prog = 0; private capA = 0; private capFly = -1;
  private pull = new THREE.Vector3(); private brainFly: THREE.Vector3 | null = null;
  private mechHome = new THREE.Vector3(0.13, -0.02, 0.09);
  private grabbed = false;
  private t = 0; private stepT = 0; private shakeT = 0; private waitT = -1;
  private prevFull = '';
  private tmp = new THREE.Vector3();
  private home = new THREE.Vector3(0, ringY - 0.012, 0);

  constructor(private d: DominionSystem) {
    this.g = fpGroup('dominion');
    this.matBlood = new THREE.MeshBasicMaterial({ color: 0x8a0f0a });
    this.build();
    this.layer = new PointerLayer('surgery', { down: (e) => this.onDown(e), move: (e) => this.onMove(e), up: () => this.onUp() });
    window.addEventListener('keydown', (e) => { if (this.active && e.code === 'Escape') { e.stopPropagation(); e.preventDefault(); this.abort('I back off.'); } }, true);
  }

  // ---------------------------------------------------------------- scene
  private build() {
    const g = this.g;
    const lit = (m: THREE.Mesh) => { m.material = this.matSkin; return m; };
    // a dark surround so the world doesn't swim behind the table
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: 0x06080a, transparent: true, opacity: 0.9 }));
    back.position.set(0, 0, -1.4); g.add(back);
    g.add(new THREE.AmbientLight(0xa0a8b4, 0.55));
    const lamp = new THREE.PointLight(0xfff1d8, 2.2, 2, 1.6); lamp.position.set(0.05, 0.22, -0.4); g.add(lamp);
    const rim = new THREE.DirectionalLight(0x5ae0ff, 0.6); rim.position.set(-0.5, -0.3, 0.2); g.add(rim);
    this.root.position.set(0, -0.035, -0.62);
    this.root.rotation.x = 0.95;
    g.add(this.root);
    // slab under the head
    const mb = new ModelBuilder();
    mb.box(0, -R * 1.05, 0, 0.5, 0.03, 0.42, 'metal_brushed', { color: 0x8a9096 });
    mb.box(0, -R * 1.02, 0.02, 0.36, 0.004, 0.3, 'white', { color: 0x5a0a08 });
    const slab = new THREE.Mesh(mb.build(), this.matSteel); this.root.add(slab);
    this.root.add(this.head);
    // lower skull with a snout and shut eyes (tinted per creature in start())
    const base = lit(new THREE.Mesh(new THREE.SphereGeometry(R, 18, 12, 0, Math.PI * 2, CAP * 0.96, Math.PI - CAP)));
    base.scale.set(1, 0.78, 1.15); base.name = 'skin'; this.head.add(base);
    const snout = lit(new THREE.Mesh(new THREE.BoxGeometry(R * 1.1, R * 0.7, R * 0.9)));
    snout.position.set(0, -R * 0.35, R * 1.05); snout.name = 'skin'; this.head.add(snout);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(R * 0.28, R * 0.06, R * 0.05), new THREE.MeshBasicMaterial({ color: 0x1a0806 }));
      eye.position.set(s * R * 0.42, -R * 0.02, R * 1.02); eye.rotation.z = s * 0.2; this.head.add(eye);
    }
    // the cavity
    const cav = new THREE.Mesh(new THREE.CircleGeometry(ringR * 0.98, 20), new THREE.MeshBasicMaterial({ color: 0x2a0404 }));
    cav.rotation.x = -Math.PI / 2; cav.position.y = ringY - 0.006; this.head.add(cav);
    const rimM = new THREE.Mesh(new THREE.TorusGeometry(ringR * 0.98, 0.004, 4, 24), new THREE.MeshBasicMaterial({ color: 0xe8dcc8 }));
    rimM.rotation.x = Math.PI / 2; rimM.position.y = ringY; this.head.add(rimM);
    // the cap, hinged at the back
    const capM = lit(new THREE.Mesh(new THREE.SphereGeometry(R, 18, 8, 0, Math.PI * 2, 0, CAP)));
    capM.scale.set(1, 0.78, 1.15); capM.name = 'skin';
    const inner = new THREE.Mesh(new THREE.SphereGeometry(R * 0.97, 14, 6, 0, Math.PI * 2, 0, CAP), new THREE.MeshBasicMaterial({ color: 0xe0d4bc, side: THREE.BackSide }));
    inner.scale.set(1, 0.78, 1.15);
    const hinge = new THREE.Group(); hinge.position.set(0, ringY, -ringR * 1.1);
    capM.position.set(0, -ringY, ringR * 1.1); inner.position.copy(capM.position);
    hinge.add(capM, inner); this.cap.add(hinge); this.cap.userData.hinge = hinge;
    this.head.add(this.cap);
    // the cut line
    const dg = new THREE.BoxGeometry(0.008, 0.004, 0.003);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const m = new THREE.Mesh(dg, this.dashMat);
      m.position.set(Math.cos(a) * ringR * 1.02, ringY + 0.002, Math.sin(a) * ringR * 1.15 * 1.02);
      m.rotation.y = -a + Math.PI / 2;
      this.dashes.push(m); this.head.add(m);
    }
    // the brain: lumpy folds, wet
    const bm = new THREE.MeshLambertMaterial({ color: 0xd8a0a4, emissive: 0x2a0808 });
    const lobes: [number, number, number, number][] = [[-0.022, 0.012, 0, 0.042], [0.022, 0.012, 0, 0.042], [-0.02, 0.006, 0.03, 0.032], [0.02, 0.006, 0.03, 0.032], [0, 0.0, -0.035, 0.034]];
    for (const [x, y, z, r] of lobes) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), bm); s.position.set(x, y, z); s.scale.y = 0.72; this.brain.add(s); }
    const fold = new THREE.MeshBasicMaterial({ color: 0x9a5a60 });
    for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.TorusGeometry(0.014 + (i % 3) * 0.006, 0.0018, 3, 10, Math.PI), fold); f.position.set((i % 3 - 1) * 0.022, 0.03, (Math.floor(i / 3) - 1) * 0.022); f.rotation.set(-Math.PI / 2, 0, i); this.brain.add(f); }
    this.brain.position.set(0, ringY - 0.012, 0);
    this.head.add(this.brain);
    const tm = new THREE.MeshLambertMaterial({ color: 0xa83038 });
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 1, 5), tm);
      t.userData.a = new THREE.Vector3(Math.cos(i) * ringR * 0.6, ringY - 0.03, Math.sin(i) * ringR * 0.6);
      this.tendrils.push(t); this.head.add(t);
    }
    this.head.add(this.mech);
    // the clipboard with the procedure, left of the table; the abort plunger, right
    const cb = new ModelBuilder();
    cb.box(0, 0, 0, 0.13, 0.1, 0.004, 'wood_light', { color: 0xa8784a });
    cb.box(0, 0.048, 0.004, 0.05, 0.012, 0.008, 'metal_brushed');
    cb.box(0, 0.05, 0.009, 0.03, 0.006, 0.004, 'chrome');
    const clip = new THREE.Group();
    clip.add(new THREE.Mesh(cb.build(), this.matSteel));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.092), flatMat(this.card.tex));
    sheet.position.set(0, -0.003, 0.0035); clip.add(sheet);
    clip.position.set(-0.205, 0.02, -0.66); clip.rotation.set(-0.12, 0.42, 0.04);
    this.g.add(clip);
    const pb = new ModelBuilder();
    pb.box(0, 0, 0, 0.06, 0.03, 0.05, 'metal_painted_green', { color: 0x4a5a48 });
    pb.box(0, 0.016, 0.026, 0.05, 0.012, 0.002, 'plastic_yellow', { color: 0xe0b020 });
    pb.cylinder(0, 0.015, 0, 0.012, 0.02, 10, 'chrome');
    const base = new THREE.Mesh(pb.build(), this.matSteel);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc0281a, emissive: 0x200000 }));
    knob.position.y = 0.035; knob.name = 'abort';
    this.plunger.add(base, knob);
    const tag = new PixTex(40, 10); tag.s.clear(0xe0b020); tag.typed('ABORT', 5, 2, 0x1a140c, 1, 40, 2); tag.flush();
    const tagM = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.012), flatMat(tag.tex)); tagM.position.set(0, 0.016, 0.0275); this.plunger.add(tagM);
    this.plunger.position.set(0.2, -0.105, -0.6); this.plunger.rotation.set(0.5, -0.35, 0);
    this.g.add(this.plunger);
    this.root.add(this.tool);
    // blood and sparks
    for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(this.dropGeo, this.matBlood); m.visible = false; this.root.add(m); this.drops.push({ m, vx: 0, vy: 0, vz: 0, life: 0 }); }
  }

  private skinColor(c: Creature) { return c.sp.gore?.flesh ?? (c.sp.gore?.blood === 'stuffing' ? 0xc8b49a : c.sp.gore?.blood === 'static' ? 0x8a94a0 : 0x9c7c6a); }

  private setMech(key: string) {
    this.mech.clear(); this.lever.clear();
    const mb = new ModelBuilder();
    (BRAIN_MODELS[key] || BRAIN_MODELS.brain_mk1)(mb);
    const m = new THREE.Mesh(mb.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true }));
    m.scale.setScalar(this.tier === 1 ? 1.5 : this.tier === 2 ? 1.25 : 0.72);
    this.mech.add(m);
    // the boot switch: a red-capped toggle on a little plate
    const lb = new ModelBuilder();
    lb.box(0, 0, 0, 0.026, 0.006, 0.018, 'metal_dark');
    lb.box(0, 0.012, 0, 0.005, 0.024, 0.005, 'metal_grey');
    lb.box(0, 0.026, 0, 0.011, 0.011, 0.011, 'white', { color: 0xff2a1a, emissive: 1.4 });
    const lv = new THREE.Mesh(lb.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true }));
    this.lever.add(lv); this.lever.position.set(0.0, 0.06, -0.01); this.lever.rotation.x = -0.6; this.lever.visible = false;
    this.mech.add(this.lever);
    this.mech.position.copy(this.mechHome); this.mech.visible = false;
  }

  // ---------------------------------------------------------------- flow
  start(c: Creature, brainItem: Item, tier: 1 | 2 | 3, toolItem: Item) {
    if (!fpClaim('dominion', 6)) { bus.emit('think', G.local, "Not now. My hands are full."); return; }
    this.active = true; this.c = c; this.brainItem = brainItem; this.tier = tier;
    this.step = 'saw'; this.prog = 0; this.capA = 0; this.capFly = -1; this.brainFly = null; this.grabbed = false; this.waitT = -1; this.t = 0; this.stepT = 0;
    this.matSkin.color.setHex(this.skinColor(c));
    this.matBlood.color.setHex(BLOOD[c.sp.gore?.blood ?? 'red'] ?? BLOOD.red);
    const hs = 0.85 + Math.min(0.5, c.sp.height * 0.12);
    this.head.scale.setScalar(hs);
    for (const m of this.dashes) { m.material = this.dashMat; m.visible = true; }
    const hinge = this.cap.userData.hinge as THREE.Group; hinge.rotation.set(0, 0, 0); hinge.position.set(0, ringY, -ringR * 1.1); this.cap.visible = true;
    this.brain.visible = true; this.brain.position.set(0, ringY - 0.012, 0); this.brain.rotation.set(0, 0, 0);
    for (const t of this.tendrils) t.visible = true;
    this.setMech(brainTier(tier).key);
    this.tool.clear();
    const tm = makeHeldMesh(toolItem.key);
    if (tm) { tm.scale.multiplyScalar(0.9); tm.rotation.set(0, 0, -Math.PI / 2); this.tool.add(tm); }
    this.tool.visible = false;
    for (const dr of this.drops) { dr.m.visible = false; dr.life = 0; }
    this.layer.on = true;
    this.plungeT = 0;
    this.label();
    const p = G.local!;
    this.prevFull = p.full; p.full = 'kneel';
    p.actions?.clear?.();
    G.audio?.at?.('dom_down', c.x, c.z, 0.35);
  }

  /** the procedure card on the clipboard: typed steps, the done ones struck through in red pencil */
  private label() {
    const p = this.card, s = p.s, i = STEPS.indexOf(this.step);
    s.clear(PAL.paper);
    p.paper(0, 0, p.w, p.h, PAL.paper, 7);
    p.typed('PROCEDURE 7-C', 6, 4, PAL.ink, 1, 110, 1);
    p.typed('CRANIAL REFIT', 6, 13, PAL.inkRed, 1, 110, 2);
    s.hline(4, p.w - 5, 22, Screen.c(PAL.ink), 2);
    STEPS.forEach((st, k) => {
      const y = 26 + k * 10;
      s.frame(5, y, 7, 7, Screen.c(PAL.ink));
      if (k < i) { s.line(6, y + 3, 8, y + 5, Screen.c(PAL.inkRed)); s.line(8, y + 5, 12, y - 1, Screen.c(PAL.inkRed)); }
      p.typed(TEXT[st][0], 15, y, k === i ? PAL.ink : k < i ? PAL.paperEdge : 0x6a5c44, 1, 104, k + 3);
      if (k < i) s.hline(15, 15 + TEXT[st][0].length * 6, y + 3, Screen.c(PAL.inkRed));
      if (k === i) { s.text('>', 1, y, Screen.c(PAL.inkRed)); }
    });
    if (this.step !== 'done') p.typedPara(TEXT[this.step][1], 6, 78, 110, PAL.inkBlue, 8, 2);
    p.flush();
    this.layer.cursor = this.step === 'pull' || this.step === 'seat' ? 'grab' : 'crosshair';
  }

  private next(s: Step) { this.step = s; this.stepT = 0; this.prog = 0; this.label(); }

  private end() {
    this.active = false; this.down = false;
    this.layer.on = false;
    fpRelease('dominion');
    const p = G.local; if (p && p.full === 'kneel') p.full = this.prevFull === 'kneel' ? '' : (this.prevFull as any);
    this.c = null; this.brainItem = null;
  }

  abort(why: string) {
    if (!this.active) return;
    const c = this.c;
    if (c && !c.dead && this.step !== 'done') this.d.abortHold(c);
    if (why) bus.emit('think', G.local, why);
    this.end();
  }

  // ---------------------------------------------------------------- pointer
  private pick(x: number, y: number) {
    this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, fpCamera());
    return this.ray;
  }
  /** the pointer as a point on the plane through `at` facing the camera (head-local) */
  private onPlane(x: number, y: number, at: THREE.Vector3, out: THREE.Vector3) {
    const ray = this.pick(x, y);
    const w = this.head.localToWorld(this.tmp.copy(at));
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), w);
    if (!ray.ray.intersectPlane(plane, out)) return null;
    return this.head.worldToLocal(out);
  }
  private screenOf(local: THREE.Vector3) {
    const w = this.head.localToWorld(this.tmp.copy(local)).project(fpCamera());
    return { x: (w.x + 1) / 2 * innerWidth, y: (1 - w.y) / 2 * innerHeight };
  }

  private onDown(e: PointerEvent) {
    if (!this.active) return;
    // the abort plunger
    if (this.pick(e.clientX, e.clientY).intersectObject(this.plunger, true).length) { this.plungeT = 0.25; G.audio?.ui?.('click', 0.7); this.abort('I back off.'); return; }
    this.down = true; this.px = this.sx = e.clientX; this.py = this.sy = e.clientY; this.lastDir = 0;
    if (this.step === 'pull') { const s = this.screenOf(this.brain.position); this.grabbed = Math.hypot(s.x - e.clientX, s.y - e.clientY) < Math.max(70, innerWidth * 0.08); if (this.grabbed) G.audio?.ui?.('gore_squelch', 0.5); }
    if (this.step === 'seat') { const s = this.screenOf(this.mech.position); this.grabbed = Math.hypot(s.x - e.clientX, s.y - e.clientY) < Math.max(80, innerWidth * 0.09); }
    if (this.step === 'boot') { const s = this.screenOf(this.tmp.copy(this.mech.position).add(this.lever.position)); if (Math.hypot(s.x - e.clientX, s.y - e.clientY) < Math.max(90, innerWidth * 0.1)) this.boot(); }
  }
  private onMove(e: PointerEvent) {
    if (!this.active) return;
    const dx = e.clientX - this.px, dy = e.clientY - this.py;
    this.px = e.clientX; this.py = e.clientY;
    if (!this.down) return;
    const scale = 900 / Math.max(500, innerWidth);
    if (this.step === 'saw') {
      this.prog = Math.min(1, this.prog + Math.hypot(dx, dy) * 0.0011 * scale);
      const dir = Math.sign(dx || dy);
      if (dir && dir !== this.lastDir) {
        this.lastDir = dir;
        const c = this.c!;
        G.audio?.at?.('dom_saw', c.x, c.z, 0.7);
        this.shakeT = 0.08;
        const a = this.prog * Math.PI * 2;
        this.spray(new THREE.Vector3(Math.cos(a) * ringR, ringY, Math.sin(a) * ringR * 1.15), 4, 0.25);
      }
      const n = Math.floor(this.prog * this.dashes.length);
      for (let i = 0; i < n; i++) this.dashes[i].material = this.dashCut;
      if (this.prog >= 1) { this.next('pry'); G.audio?.at?.('dom_crack', this.c!.x, this.c!.z, 0.9); this.shakeT = 0.2; punch(0.03); }
    } else if (this.step === 'pry') {
      this.capA = Math.max(0, Math.min(1.7, this.capA - dy * 0.006 * scale));
      if (this.capA > 1.15 && this.capFly < 0) {
        this.capFly = 0; this.down = false;
        G.audio?.at?.('gore_squelch', this.c!.x, this.c!.z, 0.9);
        this.spray(new THREE.Vector3(0, ringY, 0), 14, 0.5);
        this.shakeT = 0.25;
      }
    } else if (this.step === 'pull' && this.grabbed && !this.brainFly) {
      const home = this.home;
      const pt = this.onPlane(e.clientX, e.clientY, home, new THREE.Vector3());
      if (pt) {
        const off = pt.sub(home);
        const dist = off.length();
        // it resists: the further it stretches, the less it gives
        const give = 0.06 * (1 - Math.exp(-dist / 0.06));
        this.pull.copy(off).setLength(give);
        if (dist > 0.12 && Math.hypot(dx, dy) > 14) this.rip(off);
      }
    } else if (this.step === 'seat' && this.grabbed) {
      const pt = this.onPlane(e.clientX, e.clientY, this.mech.position, new THREE.Vector3());
      if (pt) this.mech.position.lerp(pt, 0.6);
    }
  }
  private onUp() {
    if (!this.active) return;
    this.down = false;
    if (this.step === 'pull' && this.grabbed && !this.brainFly) { this.pull.set(0, 0, 0); this.grabbed = false; }
    if (this.step === 'seat' && this.grabbed) {
      this.grabbed = false;
      const target = this.tmp.set(0, ringY - 0.02, 0);
      if (this.mech.position.distanceTo(target) < 0.06) {
        this.mech.position.copy(target);
        G.audio?.ui?.('dom_clamp', 0.7); setTimeout(() => G.audio?.ui?.('dom_clamp', 0.55), 140);
        this.shakeT = 0.12; this.lever.visible = true;
        this.next('boot');
      }
    }
  }

  private rip(off: THREE.Vector3) {
    const c = this.c!;
    this.brainFly = off.clone().normalize().multiplyScalar(0.9).add(new THREE.Vector3(0, 0.35, 0));
    for (const t of this.tendrils) t.visible = false;
    this.spray(this.brain.position.clone(), 40, 0.9);
    G.audio?.at?.('dom_rip', c.x, c.z, 1);
    G.audio?.at?.('gore_tear', c.x, c.z, 0.8);
    hitstop(90); shake(0.45); punch(0.05);
    this.shakeT = 0.35;
    G.gore?.lens?.splash?.(0.5, Math.sign(off.x) || 1, BLOOD[c.sp.gore?.blood ?? 'red']);
    if ((c.sp.gore?.blood ?? 'red') !== 'none') op('decal', { z: c.zoneKey, d: { x: c.x + (Math.random() - 0.5) * 0.6, z: c.z + (Math.random() - 0.5) * 0.6, w: 1.1, d: 1.1, rot: Math.random() * 6.28, tex: 'decal_blood_pool' } });
    bus.emit('brainRipped', c);
    setTimeout(() => { if (this.active && this.step === 'pull') { this.next('seat'); this.mech.visible = true; this.mech.position.copy(this.mechHome); } }, 700);
  }

  private boot() {
    if (this.waitT >= 0) return;
    const c = this.c!;
    this.lever.rotation.x = 0.6;
    G.audio?.at?.('dom_boot', c.x, c.z, 1);
    this.sparks(this.mech.position.clone(), 24);
    this.shakeT = 0.3; shake(0.25);
    this.waitT = 0;
    this.step = 'done';
    this.d.install(c, this.tier);
  }

  // ---------------------------------------------------------------- particles
  private spray(at: THREE.Vector3, n: number, power: number) {
    let k = 0;
    for (const d of this.drops) {
      if (d.life > 0) continue;
      d.m.material = this.matBlood;
      d.m.position.copy(at).applyMatrix4(this.head.matrix);
      const a = Math.random() * Math.PI * 2;
      d.vx = Math.cos(a) * power * (0.2 + Math.random() * 0.4); d.vz = Math.sin(a) * power * (0.2 + Math.random() * 0.4); d.vy = power * (0.3 + Math.random() * 0.6);
      d.life = 0.5 + Math.random() * 0.6; d.m.visible = true; d.m.scale.setScalar(0.6 + Math.random() * 1.4);
      if (++k >= n) break;
    }
  }
  private sparks(at: THREE.Vector3, n: number) { this.spray(at, n, 0.7); let k = 0; for (const d of this.drops) if (d.life > 0 && k++ < n) d.m.material = this.matSpark; }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    if (!this.active) return;
    const c = this.c, p = G.local;
    this.t += dt; this.stepT += dt;
    if (!c || !p || p.body.dead) return this.abort('');
    if (this.step !== 'done') {
      if (c.dead) return this.abort('It died on the table.');
      if (!this.d.isDowned(c)) return this.abort('It woke up!');
      if (Math.hypot(c.x - p.x, c.z - p.z) > 3.2 + c.radius) return this.abort('');
    }
    p.speed = 0;
    // cap
    const hinge = this.cap.userData.hinge as THREE.Group;
    if (this.capFly >= 0) {
      this.capFly += dt;
      hinge.rotation.x = -(1.15 + this.capFly * 7);
      hinge.position.y = ringY + this.capFly * 0.25 - this.capFly * this.capFly * 0.9;
      hinge.position.z = -ringR * 1.1 - this.capFly * 0.3;
      if (this.capFly > 0.6) { this.cap.visible = false; this.capFly = -1; if (this.step === 'pry') this.next('pull'); }
    } else if (this.step === 'pry') { if (!this.down) this.capA = Math.max(0, this.capA - dt * 2); hinge.rotation.x = -this.capA; }
    // brain
    const home = this.home;
    if (this.brainFly) {
      this.brain.position.addScaledVector(this.brainFly, dt);
      this.brainFly.y -= dt * 2.4;
      this.brain.rotation.x += dt * 9; this.brain.rotation.z += dt * 5;
      if (this.brain.position.y < -0.5) { this.brain.visible = false; this.brainFly = null; }
    } else if (this.step === 'pull' || this.step === 'saw' || this.step === 'pry') {
      const pulse = Math.sin(this.t * 7) * 0.002;
      this.brain.position.set(home.x + this.pull.x, home.y + this.pull.y + pulse, home.z + this.pull.z);
      this.brain.rotation.z = this.pull.x * 3; this.brain.rotation.x = -this.pull.z * 3;
    }
    // tendrils run from the brain's underside to the cavity floor, stretching
    for (const t of this.tendrils) {
      if (!t.visible) continue;
      const a = t.userData.a as THREE.Vector3;
      const b = this.brain.position;
      const len = a.distanceTo(b);
      t.position.addVectors(a, b).multiplyScalar(0.5);
      t.scale.set(1 - Math.min(0.6, len * 4), len, 1 - Math.min(0.6, len * 4));
      t.lookAt(this.head.localToWorld(this.tv1.copy(b))); t.rotateX(Math.PI / 2);
    }
    // the tool rides the pointer while sawing
    this.tool.visible = this.step === 'saw' && this.down;
    if (this.tool.visible) {
      const pt = this.onPlane(this.px, this.py, this.tv1.set(0, ringY, 0), this.tv2);
      if (pt) { this.tool.position.copy(pt).multiplyScalar(this.head.scale.x).add(this.head.position); this.tool.rotation.y = Math.sin(this.t * 30) * 0.15; }
    }
    // mech idle bob
    if (this.mech.visible && this.step === 'seat' && !this.grabbed) this.mech.position.lerp(this.mechHome, Math.min(1, dt * 8));
    if (this.step === 'done') {
      this.mech.rotation.y = Math.sin(this.t * 40) * 0.05 * Math.max(0, 1 - this.waitT);
      this.waitT += dt;
      if (this.waitT > 0.5 && Math.random() < dt * 20) this.sparks(this.mech.position.clone(), 2);
      const r = this.d.rec(c);
      if (r && this.waitT > 1.2) {
        // the host took it: spend the cortex
        const it = this.brainItem;
        if (it) { p.removeItem(it); bus.emit('inventoryChanged', p); }
        bus.emit('think', p, `${r.name} is online. It looks at me the way a tool would, if a tool could.`);
        bus.emit('subtitle', { who: r.name, text: 'UNIT ONLINE. AWAITING DIRECTIVE.', style: 'radio', x: c.x, y: c.y + c.height + 0.3, z: c.z });
        this.end();
        return;
      }
      if (this.waitT > 4) return this.abort('It convulses and goes still. The cortex did not take.');
    }
    // particles (root space, gravity down the screen)
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vy -= dt * 2.2;
      d.m.position.x += d.vx * dt * 0.25; d.m.position.y += d.vy * dt * 0.25; d.m.position.z += d.vz * dt * 0.25;
      if (d.life <= 0) d.m.visible = false;
    }
    this.plunger.children[1].position.y = 0.035 - Math.max(0, this.plungeT -= dt) * 0.04;
    // hand shake
    this.shakeT = Math.max(0, this.shakeT - dt);
    const s = this.shakeT * 0.04;
    this.root.position.set((Math.random() - 0.5) * s, -0.035 + (Math.random() - 0.5) * s + Math.sin(this.t * 1.3) * 0.002, -0.62);
  }
}

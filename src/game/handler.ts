// Staff Sergeant Voss (projection): the debtor's handler for the rest of the
// game. A soldier projected like old film (fatigues, beret: warm phosphor
// light, scanlines, 24 fps flicker and grain, the frame slipping when the feed
// is bad) from the lens of the BAILIFF band on the survivor's wrist or from
// the projector on a Remittance Press (object key 'hopper'), with a gruff
// procedural radio voice (src/game/vossVoice.ts) and 'subtitle' lines in the
// 'voss' style. Local to each player.
//
// API (G.handler):
//   say(text, { at?, point?, dur?, key?, cd? })  queue a line (also bus 'handlerSay' { text })
//   appear('band' | 'pylon' | { x, z }), vanish(), point(x, z)
//   guide(target | null)   a holographic chevron path on the floor toward a target
//   begin()                the post-intro tutorial: smash something, find a valuable, load the press, pull the lever
//   worldPos(), visible    (the HUD hangs his subtitles above him)
//   cine / briefed         a cutscene owns him (only lines said with { cine: true } get through) / he
//                          already briefed the debtor in person (the arrival): the tutorial starts quietly
//   appear(where, secs)    a slow materialise for cutscenes; beamFromBand: the beam from the wrist even
//                          when he stands at a fixed spot; collapse(): the picture shrinks to a line and
//                          a dot like an old tube switching off, then he is gone
// Reactions with cooldowns: furniture broken by you, deposits, debt
// milestones, band warnings, low health, a creature in sight, idling, a new zone.
import * as THREE from 'three';
import { G } from './G';
import type { GameSystem } from './game';
import { bus } from '../core/events';
import { HumanRig, type Appearance, type Outfit } from '../entities/humanRig';
import type { FullBody } from '../entities/humanAnim';
import { objDef } from '../world/objects';
import { objectMatrix } from '../world/chunkMesher';
import { findPath } from '../world/path';
import type { Zone, TileObject } from '../world/zone';
import type { Player } from '../entities/player';
import { holoBaseMaterial, holoPropMaterial, makeHologram, HOLO, HOLO_BASE, coneMesh, floorQuadGeo, additiveMat } from './holoShader';
import { RadioVoice } from './vossVoice';
import { line, readTime } from './lines';
import { fallbackPose, overlay, ease } from './cutPose';
import { ModelBuilder } from '../gfx/modelBuilder';
import { rigNumber } from '../content/items/prisoner';
import { ensurePack } from './arrivalKit/pack';
import '../audio/sounds_remit';

export type HandlerWhere = 'band' | 'pylon' | { x: number; z: number };
export interface SayOpts { at?: { x: number; z: number }; point?: { x: number; z: number }; dur?: number; key?: string; cd?: number; gesture?: string; pri?: number; pylon?: boolean; cine?: boolean }

const VOSS_APP: Appearance = {
  skin: 0xd39b6c, hair: 0x3b2a1e, hairStyle: 'buzz', face: 4, build: 'broad', height: 1.05, beard: false,
  bodyShape: 0.05, facialHair: 'moustache', freckles: 0, scars: 2, age: 0.62,
};
const VOSS_OUTFIT: Outfit = {
  torso: { tex: 'c_shirt_button', color: 0x5a6440, sleeve: 'long', item: 'fatigues' },
  legs: { tex: 'c_uniform', color: 0x4a5236, item: 'fatigues' }, legsKind: 'pants',
  feet: { tex: 'c_shoes_boot', color: 0x241e1a },
  hands: undefined,
};

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const wrapA = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** the debtor number on the local survivor (also read by the band HUD) */
export function debtorNumber(p: Player | null | undefined = G.local): string {
  const pn = (p as unknown as { prisonerNo?: string } | null)?.prisonerNo;
  return pn || (p ? rigNumber(p.rig) : 'D-4471');
}

// ------------------------------------------------------------------ lines
const L = {
  smashed: ['Good. Now go through the pieces.', 'That\'s the spirit. Destruction is a growth industry.', 'Again. The Institute has a lot of furniture and you have a lot of debt.', 'Listen to that. That\'s the sound of your balance going down. Slightly.'],
  deposit: ['Credited.', 'Pressed. Sent. Next.', 'Through to the other side. Keep loading it.', 'Noted on your file. In pencil.'],
  milestone: ['A quarter of the way. Don\'t celebrate, it makes you slow.', 'Halfway. I\'ve seen debtors die closer than this.', 'Three quarters. Now I\'m almost interested.'],
  warn: ['Wrong way, debtor. Turn around.', 'That\'s the edge of the work area. The band can count.', 'Back. Inside. Now.'],
  lowHealth: ['You\'re bleeding on Institute time. Patch yourself up.', 'Don\'t die. Dead debtors are an accounting nightmare.', 'Find a bandage. That\'s an order, not advice.'],
  creature: ['Contact. Whatever that is, it isn\'t paying your debt.', 'Something\'s watching you. Ignore it. Or don\'t. Your call, your arms.', 'Movement. Keep your back to a wall.'],
  idle: ['Clock\'s running, {n}.', 'Standing still doesn\'t pay. Move.', 'Are you sleeping? You\'re not sleeping. Move.', 'I can see you, {n}. I can always see you.'],
  zone: ['New sector. Same debt.', 'Unmapped. Lots of furniture. Get to work.', 'Different wallpaper. Same arrangement.'],
};
const pickL = (a: string[]) => a[Math.floor(Math.random() * a.length)];

export class Handler implements GameSystem {
  name = 'handler';
  readonly rig: HumanRig;
  /** world position (feet) */
  x = 0; z = 0; y = 0; facing = 0;
  /** the intro is driving him: no reactions or tutorial */
  scripted = false;
  /** a cutscene owns him: lines without { cine: true } (quest intros, ledger chatter) are dropped */
  cine = false;
  /** he briefed the debtor in person (the arrival): no first-lesson speech, the guide just lights up */
  briefed = false;
  /** draw the projector beam from the band even when he stands at a fixed spot */
  beamFromBand = false;
  private unfold = 1.6;
  /** dev: lines run faster (screenshot scripts) */
  talkSpeed = 1;
  collT = -1;
  private dot: THREE.Mesh;
  private where: HandlerWhere = 'band';
  private zoneKey = '';
  private show = 0; private showGoal = 0;
  private queue: { text: string; o: SayOpts }[] = [];
  private cur: { text: string; o: SayOpts; t: number; dur: number } | null = null;
  private voice = new RadioVoice(88, 0.94);
  private gest: { name: string; t: number; dur: number } | null = null;
  private idlePose = 'parade_rest';
  private quietT = 99;
  private glitch = 0; private glitchT = 4;
  private lookAt: { x: number; z: number } | null = null;
  private speed = 0;
  private paceT = 0;
  private beret: THREE.Mesh;
  private cone: THREE.Mesh;
  private coneW = 0;
  private hidden = true;
  // guide
  private guideT: { x: number; z: number } | null = null;
  private guideZone = '';
  private path: [number, number][] = [];
  private pathAt = -1; private pathFrom = -1;
  private chev: THREE.InstancedMesh;
  private mark: THREE.Mesh;
  private chevW = 0;
  // reactions / tutorial
  private cds = new Map<string, number>();
  private externalAt = -99;
  private tut = -1; private tutT = 0;
  private begun = false;
  private idleT = 0;
  private lastHp = 100;
  private seenZones = new Set<string>();
  private milestones = new Set<number>();
  private offs: (() => void)[] = [];
  private bootT = 0;
  private scanT = 0; private lookT = 0;

  constructor() {
    G.handler = this;
    const p = G.local;
    if (p && !(p as unknown as { prisonerNo?: string }).prisonerNo) (p as unknown as { prisonerNo: string }).prisonerNo = rigNumber(p.rig);
    this.rig = new HumanRig(VOSS_APP, holoBaseMaterial());
    this.rig.setOutfit(VOSS_OUTFIT);
    makeHologram(this.rig);
    // the beret: a tilted soft disc with a badge, drawn in the same light
    const mb = new ModelBuilder();
    // a band, then the soft crown swelling out over it and slouched off to one side, a few facets each
    mb.push().translate(0.0, 0.205, 0.0).rotateZ(-0.22).rotateX(-0.06);
    mb.cylinder(0, 0, 0, 0.112, 0.022, 9, 'fabric_red', { rTop: 0.118, color: 0x6e5656, bevel: 0.004 });
    mb.push().translate(0.025, 0.02, 0).scale(1.12, 1, 1.04);
    mb.cylinder(0, 0, 0, 0.12, 0.022, 9, 'fabric_red', { rTop: 0.138, color: 0x8a6a6a, bevel: 0.005 });
    mb.cylinder(0, 0.022, 0, 0.138, 0.02, 9, 'fabric_red', { rTop: 0.112, color: 0x8a6a6a, bevel: 0.005 });
    mb.cylinder(0, 0.042, 0, 0.112, 0.012, 9, 'fabric_red', { rTop: 0.05, color: 0x7e6060, bevel: 0.004 });
    mb.pop();
    // the cap badge: a small brass plate on the band over the left eye
    mb.box(-0.07, 0.006, 0.088, 0.04, 0.048, 0.016, 'metal_brass', { emissive: 0.6, bevel: 0.004 });
    mb.pop();
    this.beret = new THREE.Mesh(mb.build(), holoPropMaterial());
    this.beret.renderOrder = 20; this.beret.castShadow = false;
    this.rig.j.head.add(this.beret);
    this.rig.root.visible = false;
    G.pr.scene.add(this.rig.root);
    this.cone = coneMesh();
    this.cone.visible = false;
    G.pr.scene.add(this.cone);
    this.chev = new THREE.InstancedMesh(floorQuadGeo('zh_chevron', 0.46, 0.46), additiveMat(), 18);
    this.chev.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chev.setColorAt(0, new THREE.Color(1, 1, 1));
    this.chev.count = 0; this.chev.frustumCulled = false; this.chev.renderOrder = 18;
    G.pr.scene.add(this.chev);
    this.mark = new THREE.Mesh(floorQuadGeo('zh_mark', 1.1, 1.1), additiveMat());
    this.mark.visible = false; this.mark.renderOrder = 18;
    G.pr.scene.add(this.mark);
    // the last dot of light when the picture collapses
    const db = new ModelBuilder();
    db.cross(0, -0.06, 0, 0.12, 0.12, 'zh_dot', { emissive: 2 } as never);
    this.dot = new THREE.Mesh(db.build(), additiveMat());
    this.dot.visible = false; this.dot.renderOrder = 21;
    G.pr.scene.add(this.dot);
    this.wire();
    if (import.meta.env.DEV) (window as unknown as { __voss: Handler }).__voss = this;
  }

  // ================================================================ API
  get visible() { return this.show > 0.3 && !this.hidden; }
  get active() { return this.visible; }
  worldPos(out = new THREE.Vector3()) { return out.set(this.x, this.y, this.z); }
  get speaking() { return !!this.cur; }
  get busy() { return !!this.cur || this.queue.length > 0; }

  say(text: string, o: SayOpts = {}) {
    if (!text) return;
    if (this.cine && !o.cine) return;
    text = text.replace(/\{n\}/g, debtorNumber());
    if (this.cur?.text === text || this.queue.some((q) => q.text === text)) return;
    if (o.key) { const t = this.cds.get(o.key) ?? -1e9; if (G.time - t < (o.cd ?? 20)) return; this.cds.set(o.key, G.time); }
    if (this.queue.length >= 4) this.queue.shift();
    if (o.pri && o.pri > 1) this.queue.unshift({ text, o }); else this.queue.push({ text, o });
  }
  appear(where: HandlerWhere = 'band', secs?: number) {
    this.where = where;
    this.unfold = secs ? 1 / Math.max(0.1, secs) : 1.6;
    if (this.collT >= 0) { this.collT = -1; this.show = 0; }
    if (this.showGoal < 1) {
      this.showGoal = 1;
      if (this.show < 0.1) { this.placeNow(); this.glitch = 1; G.audio?.flat?.('holo_on', 'sfx', 0.45); }
    }
  }
  vanish() {
    if (this.showGoal > 0) { this.showGoal = 0; if (this.show > 0.2) G.audio?.flat?.('holo_off', 'sfx', 0.35); this.glitch = Math.max(this.glitch, 0.6); }
  }
  /** look and point at a spot */
  point(x: number, z: number) { this.lookAt = { x, z }; this.gest = { name: 'point_at', t: 0, dur: 2.4 }; }
  guide(target: { x: number; z: number } | null) {
    this.guideT = target ? { x: target.x, z: target.z } : null;
    this.guideZone = G.local?.zoneKey ?? '';
    this.pathAt = -1;
  }
  gesture(name: string, dur = 2) { this.gest = { name, t: 0, dur }; }
  /** silence him now (skips, cutscenes) */
  hush() { this.queue.length = 0; this.cur = null; this.voice.stop(); }
  /** sign off: the picture squeezes to a bright line, the line to a dot, the dot goes out */
  collapse() {
    if (this.hidden || this.show < 0.05) { this.show = this.showGoal = 0; return; }
    this.collT = 0; this.showGoal = 1; this.coneW = Math.min(this.coneW, 0.5);
  }
  /** gone at once (skips) */
  gone() { this.collT = -1; this.show = this.showGoal = 0; this.hidden = true; this.coneW = 0; this.rig.root.visible = false; this.cone.visible = false; this.dot.visible = false; this.rig.root.scale.setScalar(1); }

  /** the post-intro tutorial (also started by itself on quick starts and for co-op clients) */
  begin() {
    if (this.begun) return;
    this.begun = true;
    const m = G.missions;
    if (m?.flags?.has?.('contract:first_deposit')) { this.tut = 9; return; }
    this.tut = 0; this.tutT = 0;
    // briefed in person: the guide lights the way to the nearest furniture without another speech
    if (this.briefed) { this.cds.set('tut0', G.time + 40); const t = this.nearestFurniture(); if (t) this.guide(t); }
  }

  // ================================================================ events
  private wire() {
    const local = () => G.local;
    const on = (ev: string, fn: (...a: any[]) => void) => this.offs.push(bus.on(ev, fn));
    on('handlerSay', (e: { text: string }) => { if (e?.text) { this.externalAt = G.time; this.say(e.text); } });
    on('objBroken', (_z: Zone, _o: TileObject, by: string | null) => {
      if (this.scripted || by !== local()?.id) return;
      if (this.tut === 0) { this.advanceTut(1); return; }
      // (no running commentary on every chair: lines that matter only)
    });
    on('deposited', (d: { by: string; value: number }) => {
      if (this.scripted || d?.by !== local()?.id) return;
      if (this.tut === 2) { this.advanceTut(3); }
      // (the ledger and the press say what a deposit was worth; no extra acknowledgement here)
    });
    on('debtChanged', (st: { owed: number; paid: number; cleared: boolean }) => {
      if (this.scripted || !st || !st.owed) return;
      const f = st.paid / st.owed;
      for (const [k, i] of [[0.25, 0], [0.5, 1], [0.75, 2]] as [number, number][]) {
        if (f >= k && !this.milestones.has(k)) {
          this.milestones.add(k);
          if (G.time > 5 && G.time - this.externalAt > 4) this.say(L.milestone[i], { key: 'ms' + k, cd: 1 });
        }
      }
    });
    on('bandWarning', (w: { id: string; level: number }) => {
      if (this.scripted || w?.id !== local()?.id) return;
      if (G.time - this.externalAt < 3) return;
      this.react('warn', 9, L.warn, { pri: 2 });
    });
    on('enterZone', (z: Zone, p: Player) => {
      if (p !== local()) return;
      // the projection does not follow you through a door: it comes back when it has something to say
      this.hidden = true; this.show = 0; this.showGoal = 0; this.coneW = 0;
      if (this.guideT && this.guideZone !== z.key) this.guide(null);
      this.seenZones.add(z.key);
    });
    // the intake is over: whatever path it took (skipped, the arrival, the old pass-through), the pack is on
    on('introDone', () => { this.scripted = false; this.cine = false; if (!ensurePack(G.local)) console.warn('handler: no pack after the intake'); });
  }

  private react(key: string, cd: number, lines: string[], o: { pri?: number; pylon?: boolean } = {}) {
    const t = this.cds.get(key) ?? -1e9;
    if (G.time - t < cd) return;
    this.cds.set(key, G.time);
    let pylon = false;
    if (o.pylon) { const h = this.nearestHopper(), p = G.local; pylon = !!h && !!p && Math.hypot(h.x - p.x, h.z - p.z) < 7; }
    this.say(pickL(lines), { pri: o.pri, pylon });
  }

  private advanceTut(stage: number) {
    this.tut = stage; this.tutT = 0;
    const quiet = G.time - this.externalAt > 3;
    switch (stage) {
      case 1:
        this.guide(null);
        if (quiet) this.say('Good. Now go through what\'s left of it. Anything with resale value, you carry.');
        break;
      case 2: {
        const h = this.nearestHopper();
        if (h) { this.guide(h); if (quiet) this.say('The press. Striped plate under a ram, red lever on the side. Put it on the plate, step off, pull the lever. It goes through to the other side.', { point: h }); }
        break;
      }
      case 3:
        this.guide(null);
        this.tut = 9;
        break;
    }
  }

  // ================================================================ world queries
  private hopC = { t: -9, zone: '', o: null as TileObject | null };
  nearestHopperObj(): TileObject | null {
    const p = G.local; if (!p || !G.view) return null;
    const z = G.view.zone;
    if (G.time - this.hopC.t < 1 && this.hopC.zone === z.key) return this.hopC.o;
    let best: TileObject | null = null, bd = 1e9;
    for (const o of z.objects.values()) {
      if (o.key !== 'hopper') continue;
      const d = Math.hypot(o.x + 1 - p.x, o.y + 1 - p.z);
      if (d < bd) { bd = d; best = o; }
    }
    this.hopC = { t: G.time, zone: z.key, o: best };
    return best;
  }
  nearestHopper(): { x: number; z: number } | null {
    const best = this.nearestHopperObj();
    if (!best) return null;
    const d = objDef(best.key);
    const w = d?.w ?? 1, dd = d?.d ?? 1, rw = best.rot % 2 === 0 ? w : dd, rd = best.rot % 2 === 0 ? dd : w;
    return { x: best.x + rw / 2, z: best.y + rd / 2 };
  }
  /** a hopper's projector lens (its pylon), and where he stands in its beam */
  private pylonC: { o: TileObject; lens: THREE.Vector3; x: number; z: number } | null = null;
  private pylon(o: TileObject): { lens: THREE.Vector3; x: number; z: number } {
    if (this.pylonC?.o === o) return this.pylonC;
    const z = G.view!.zone, d = objDef(o.key);
    const m = d ? objectMatrix(z, o, d) : new THREE.Matrix4().makeTranslation(o.x + 1, 0, o.y + 1);
    const lens = new THREE.Vector3(0.86, 1.86, -0.6).applyMatrix4(m);
    const st = new THREE.Vector3(0.75, 0, 1.45).applyMatrix4(m);
    this.pylonC = { o, lens, x: st.x, z: st.z };
    return this.pylonC;
  }
  /** the nearest piece of furniture worth smashing */
  nearestFurniture(maxD = 18): { x: number; z: number } | null {
    const p = G.local; if (!p || !G.view) return null;
    const z = G.view.zone;
    let best: TileObject | null = null, bd = maxD;
    const px = Math.floor(p.x), pz = Math.floor(p.z);
    for (let y = pz - maxD; y <= pz + maxD; y++) for (let x = px - maxD; x <= px + maxD; x++) {
      if (!z.inb(x, y)) continue;
      for (const o of z.objectsAt(x, y)) {
        if (o.x !== x || o.y !== y) continue;
        const d = objDef(o.key);
        if (!d || d.ceiling || d.onWall || (d.tags || []).includes('nobreak') || o.key === 'hopper' || !(d.movable || d.container) || (d.hp ?? 0) > 5000) continue;
        const dist = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.z);
        if (dist < bd && dist > 0.8) { bd = dist; best = o; }
      }
    }
    return best ? { x: best.x + 0.5, z: best.y + 0.5 } : null;
  }

  // ================================================================ per frame
  update(dt: number) {
    const p = G.local;
    if (!p || !G.view) return;
    const z = G.view.zone;
    if (z.key !== this.zoneKey) { this.zoneKey = z.key; }
    this.updateTalk(dt);
    // free survival (directives off) has no contract and no handler nagging
    if (!this.scripted && G.missions?.enabled !== false) { this.updateTutorial(dt); this.updateReactions(dt, p); }
    // ---- visibility
    if (this.showGoal > 0) this.hidden = false;
    const rate = this.showGoal > this.show ? this.unfold : 2.4;
    this.show = this.showGoal > this.show ? Math.min(this.showGoal, this.show + dt * rate) : Math.max(this.showGoal, this.show - dt * rate);
    if (this.show <= 0.001 && this.showGoal === 0) this.hidden = true;
    const on = !this.hidden && this.show > 0.001;
    this.rig.root.visible = on;
    if (on) this.updateFigure(dt, p, z);
    if (this.collT >= 0) this.updateCollapse(dt);
    this.updateCone(dt, p, on);
    this.updateGuide(dt, p, z);
  }

  private updateTalk(dt: number) {
    if (this.cur) {
      this.cur.t += dt * this.talkSpeed;
      if (this.cur.t >= this.cur.dur) { this.cur = null; this.quietT = 0; }
    } else this.quietT += dt;
    if (!this.cur && this.queue.length && this.quietT > 0.45) {
      const q = this.queue.shift()!;
      const where: HandlerWhere = q.o.at ? q.o.at : q.o.pylon ? 'pylon' : 'band';
      if (this.show < 0.5) {
        // he flickers in first, then talks
        this.appear(where);
        if (this.show < 0.35) { this.queue.unshift(q); return; }
      } else if (!this.scripted) this.where = where;
      const voiced = this.voice.speak(q.text);
      const dur = Math.max(q.o.dur ?? 0, voiced, readTime(q.text) * 0.8);
      this.cur = { text: q.text, o: q.o, t: 0, dur: dur + 0.15 };
      line('SSGT. VOSS', q.text, 'voss', dur + 0.35, { x: this.x, y: this.y, z: this.z });
      if (q.o.point) this.point(q.o.point.x, q.o.point.z);
      else if (q.o.gesture) this.gesture(q.o.gesture, Math.min(dur, 3));
      else {
        const r = Math.random();
        this.gest = r < 0.4 ? { name: 'jab_finger', t: 0, dur: Math.min(dur, 2.4) } : r < 0.6 ? { name: 'dismiss', t: 0, dur: 1.2 } : null;
        this.idlePose = Math.random() < 0.5 ? 'arms_crossed' : 'parade_rest';
      }
      this.glitch = Math.max(this.glitch, 0.35);
    }
    // nothing more to say: fade out after a while
    const linger = this.tut >= 0 && this.tut < 9 ? 11 : 6;
    if (!this.cur && !this.queue.length && this.quietT > linger && this.showGoal > 0 && !this.scripted) this.vanish();
  }

  /** where he stands this frame */
  private spot(p: Player, z: Zone): [number, number] {
    const w = this.where;
    if (typeof w === 'object') return [w.x, w.z];
    if (w === 'pylon') {
      const o = this.nearestHopperObj();
      if (o) { const py = this.pylon(o); return [py.x, py.z]; }
    }
    // beside the survivor, on the camera's side so he is never hidden behind them
    const yaw = G.pr.yaw;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw), cx = Math.sin(yaw), cz = Math.cos(yaw);
    // (on the survivor's left on screen: the band's own read-out floats to the right of the wrist)
    const cands: [number, number][] = [[-1.55, 0.3], [-1.0, 1.0], [1.55, 0.3], [1.0, 1.0], [0, 1.3], [-1.3, -0.5], [1.3, -0.5]];
    for (const [a, b] of cands) {
      const x = p.x + rx * a + cx * b, zz = p.z + rz * a + cz * b;
      if (this.clear(z, p.x, p.z, x, zz)) return [x, zz];
    }
    return [p.x + cx * 0.8, p.z + cz * 0.8];
  }
  private clear(z: Zone, x0: number, z0: number, x1: number, z1: number) {
    const tx = Math.floor(x1), ty = Math.floor(z1);
    if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)] || z.solid[z.idx(tx, ty)] === 1) return false;
    // no wall between
    const n = 6;
    let lx = Math.floor(x0), ly = Math.floor(z0);
    for (let i = 1; i <= n; i++) {
      const x = Math.floor(x0 + (x1 - x0) * i / n), y = Math.floor(z0 + (z1 - z0) * i / n);
      if (x !== lx && (z.wallW[z.idx(Math.max(x, lx), y)] || z.wallW[z.idx(Math.max(x, lx), ly)])) return false;
      if (y !== ly && (z.wallN[z.idx(x, Math.max(y, ly))] || z.wallN[z.idx(lx, Math.max(y, ly))])) return false;
      lx = x; ly = y;
    }
    return true;
  }
  private placeNow() {
    const p = G.local; if (!p || !G.view) return;
    const [x, z] = this.spot(p, G.view.zone);
    this.x = x; this.z = z; this.y = G.view.zone.heightAt(Math.floor(x), Math.floor(z));
    this.facing = Math.atan2(p.z - z, p.x - x);
  }

  private updateFigure(dt: number, p: Player, z: Zone) {
    // ---- move toward his spot (a long way: the signal jumps); pacing while he waits on you
    let [tx, tz] = this.spot(p, z);
    if (this.paceT > 2.5 && this.where === 'band') {
      const yaw = G.pr.yaw, k = Math.sin((this.paceT - 2.5) * 0.85) * 0.75;
      const nx = tx + Math.cos(yaw) * k, nz = tz - Math.sin(yaw) * k;
      if (this.clear(z, tx, tz, nx, nz)) { tx = nx; tz = nz; }
    }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    let sp = 0;
    if (d > 3.2) { this.x = tx; this.z = tz; this.glitch = Math.max(this.glitch, 0.8); }
    else if (d > 0.15) {
      sp = Math.min(d * 2.2, 2.6);
      this.x += (dx / d) * sp * dt; this.z += (dz / d) * sp * dt;
    }
    // pacing while he waits for you to do something
    const waiting = !this.cur && !this.gest && !this.lookAt;
    if (waiting && !this.scripted) this.paceT += dt; else this.paceT = 0;
    this.y += (z.heightAt(Math.floor(this.x), Math.floor(this.z)) - this.y) * Math.min(1, dt * 10);
    // ---- face: what he points at, else you
    const look = this.lookAt ?? (sp > 0.3 ? { x: this.x + dx, z: this.z + dz } : { x: p.x, z: p.z });
    const want = Math.atan2(look.z - this.z, look.x - this.x);
    this.facing += wrapA(want - this.facing) * Math.min(1, dt * 7);
    this.speed += (sp - this.speed) * Math.min(1, dt * 8);
    // ---- animate: walk cycle from the animator, then his body language on top
    const talking = !!this.cur;
    this.rig.animate(dt, {
      speed: this.speed, stance: 'stand', full: '' as FullBody, action: '', actionT: 0, actionDur: 1, twoHanded: false, limp: 0, tired: 0, panic: 0, cold: 0,
      aimPitch: 0, holdingLight: false, holding: false, lookYaw: 0, fidget: false,
    });
    const tt = G.time;
    if (this.gest) {
      this.gest.t += dt;
      const u = this.gest.t / this.gest.dur;
      const ps = fallbackPose(this.gest.name, u, tt);
      if (ps) overlay(this.rig, ps, Math.min(1, Math.sin(Math.min(1, u) * Math.PI) * 3));
      if (u >= 1) { this.gest = null; this.lookAt = null; }
    }
    if (this.speed < 0.25) {
      const ps = fallbackPose(this.idlePose, 0.5, tt);
      if (ps) overlay(this.rig, ps, this.gest ? 0.35 : 0.9);
    }
    // talking: chin juts with the syllables
    if (talking) {
      const h = this.rig.j.head;
      h.rotation.x += Math.sin(tt * 11) * 0.05 + Math.sin(tt * 3.1) * 0.04;
      h.rotation.y += Math.sin(tt * 1.7) * 0.06;
    }
    // ---- hologram signal
    this.glitchT -= dt;
    if (this.glitchT <= 0) {
      this.glitchT = 5 + Math.random() * 9;
      this.glitch = Math.max(this.glitch, 0.3 + Math.random() * 0.3);
      if (this.show > 0.9 && Math.random() < 0.5) G.audio?.play?.('holo_glitch', this.x, this.z, { vol: 0.25 });
    }
    this.glitch = Math.max(0, this.glitch - dt * 2.2);
    const flick = this.glitch > 0.3 && Math.random() < 0.3 ? 0.45 : 1;
    HOLO.uHolo.value.set((0.25 + 0.75 * ease(this.show)) * flick, Math.min(1, this.glitch * 1.2), this.show, 1);
    HOLO_BASE.uHoloBase.value = this.y;
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = Math.PI / 2 - this.facing;
    this.rig.root.scale.setScalar(1.0);
    // the projection throws a little warm light on the floor and whoever stands near it
    (G as unknown as { pointLight?: (x: number, y: number, z: number, c: number, i: number, d: number) => void }).pointLight?.(this.x, this.y + 1.1, this.z, 0xffa850, 0.16 * this.show * flick, 3.2);
  }

  /** the tube switching off: squeeze to a line (bright), the line to a dot, the dot out */
  /** dev: freeze the collapse (screenshots) */
  collHold = false;
  private updateCollapse(dt: number) {
    if (!this.collHold) this.collT += dt;
    const t = this.collT, CY = 0.95;
    const a = Math.min(1, t / 0.2), b = Math.min(1, Math.max(0, (t - 0.2) / 0.17));
    const ea = a * a * (3 - 2 * a), eb = b * b;
    const sy = Math.max(0.012, 1 - ea * 0.988), sx = (1 + ea * 0.3) * (1 - eb);
    const root = this.rig.root;
    if (sx > 0.01) {
      root.visible = true;
      root.scale.set(sx, sy, sx * (1 - ea * 0.75));
      root.position.y = this.y + (1 - sy) * CY;
      HOLO.uHolo.value.set(1 + ea * 2.2, 0.15, 1, 1);
      // (the unfold cut-off line is far above him: the squeezed picture must not be clipped)
      HOLO_BASE.uHoloBase.value = this.y + 50;
    } else root.visible = false;
    // the dot: born as the line goes, burns a moment, shrinks out
    const d = t < 0.3 ? 0 : t < 0.42 ? (t - 0.3) / 0.12 : Math.max(0, 1 - (t - 0.42) / 0.45);
    this.dot.visible = d > 0.01;
    if (this.dot.visible) {
      this.dot.position.set(this.x, this.y + CY + 0.06, this.z);
      this.dot.scale.setScalar(0.6 + d * 1.2);
      this.dot.rotation.y = G.time * 2;
    }
    this.coneW = Math.max(0, this.coneW - dt * 4);
    if (t > 0.9) {
      this.collT = -1;
      this.show = this.showGoal = 0; this.hidden = true;
      root.visible = false; root.scale.setScalar(1); this.dot.visible = false;
      HOLO_BASE.uHoloBase.value = this.y;
    }
  }

  /** the faint beam from the band (or the pylon) to him */
  private updateCone(dt: number, p: Player, on: boolean) {
    const want = on && (this.where === 'band' || this.where === 'pylon' || this.beamFromBand) && this.collT < 0 ? Math.min(1, this.show) : 0;
    this.coneW += (want - this.coneW) * Math.min(1, dt * 6);
    if (this.coneW < 0.02) { this.cone.visible = false; return; }
    const apex = tmpV;
    if (this.where === 'pylon') {
      const o = this.nearestHopperObj();
      if (o) apex.copy(this.pylon(o).lens); else p.rig.jointWorld('handL', apex);
    } else {
      p.rig.jointWorld('handL', apex);
      apex.y += 0.04;
    }
    const base = tmpV2.set(this.x, this.y + 1.05, this.z);
    const dir = base.sub(apex);
    const len = dir.length();
    if (len < 0.2) { this.cone.visible = false; return; }
    dir.divideScalar(len);
    this.cone.visible = true;
    this.cone.position.copy(apex);
    this.cone.quaternion.copy(tmpQ.setFromUnitVectors(UP, dir));
    const r = 0.62 * (0.85 + Math.sin(G.time * 23) * 0.05 * this.glitch);
    this.cone.scale.set(r, len, r);
    const mat = this.cone.material as THREE.Material;
    mat.opacity = 0.16 * this.coneW * (this.glitch > 0.4 && Math.random() < 0.4 ? 0.3 : 1);
  }

  // ================================================================ the floor guide
  private updateGuide(dt: number, p: Player, z: Zone) {
    const t = this.guideT;
    const want = t && this.guideZone === z.key ? 1 : 0;
    this.chevW += (want - this.chevW) * Math.min(1, dt * 4);
    if (this.chevW < 0.02 || !t) { this.chev.count = 0; this.mark.visible = false; return; }
    // arrived: the marker flashes and the path goes
    const dTarget = Math.hypot(t.x - p.x, t.z - p.z);
    if (dTarget < 1.3) { this.guideT = null; G.audio?.flat?.('band_tick', 'ui', 0.3); return; }
    const ptile = Math.floor(p.x) + Math.floor(p.z) * 4096;
    this.pathAt -= dt;
    if (this.pathAt <= 0 || ptile !== this.pathFrom) {
      this.pathAt = 0.7; this.pathFrom = ptile;
      const path = findPath(z, Math.floor(p.x), Math.floor(p.z), Math.floor(t.x), Math.floor(t.z), { doors: true, maxNodes: 5000 });
      this.path = path && path.length ? path.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]) : [[t.x, t.z]];
      if (this.path.length) this.path[this.path.length - 1] = [t.x, t.z];
    }
    // chevrons every 0.85 m along the path, drifting toward the target
    const SP = 0.85, MAXN = 16;
    const phase = (G.time * 1.1) % SP;
    let px = p.x, pz = p.z, seg = 0, along = 0.9 + phase, n = 0;
    let acc = 0;
    const m = tmpM, col = tmpC;
    while (n < MAXN && seg < this.path.length) {
      const [ax, az] = this.path[seg];
      const sl = Math.hypot(ax - px, az - pz);
      if (acc + sl < along) { acc += sl; px = ax; pz = az; seg++; continue; }
      const k = (along - acc) / Math.max(1e-4, sl);
      const x = px + (ax - px) * k, zz = pz + (az - pz) * k;
      const ang = Math.atan2(az - pz, ax - px);
      const fade = clamp(1 - (along - 1) / (SP * MAXN), 0, 1) * this.chevW * (0.7 + 0.3 * Math.sin(G.time * 5 - along * 2));
      const y = z.heightAt(Math.floor(x), Math.floor(zz));
      m.makeRotationY(-ang - Math.PI / 2);
      m.setPosition(x, y, zz);
      this.chev.setMatrixAt(n, m);
      this.chev.setColorAt(n, col.setRGB(fade, fade, fade));
      n++;
      along += SP;
      if (along > acc + sl + 50) break;
    }
    this.chev.count = n;
    this.chev.instanceMatrix.needsUpdate = true;
    if (this.chev.instanceColor) this.chev.instanceColor.needsUpdate = true;
    // the target bracket
    this.mark.visible = true;
    const pulse = 1 + Math.sin(G.time * 4) * 0.08;
    this.mark.position.set(t.x, z.heightAt(Math.floor(t.x), Math.floor(t.z)) + 0.01, t.z);
    this.mark.scale.set(pulse, 1, pulse);
    this.mark.rotation.y = G.time * 0.4;
  }

  // ================================================================ tutorial and reactions
  private updateTutorial(dt: number) {
    const m = G.missions;
    // nobody ran an intro (quick start, co-op client, loaded game): start by ourselves
    if (!this.begun) {
      const intro = G.systems.find((s) => s.name === 'intro') as { phase?: string } | undefined;
      if (!intro || intro.phase === 'done') {
        this.bootT += dt;
        if (this.bootT > 2.5) {
          if (!m?.flags?.has?.('contract:first_deposit')) this.say('Debtor {n}. Staff Sergeant Voss. Smash the furniture, find what\'s worth something, put it on the press and pull the lever. Don\'t try to leave. Questions? Good.');
          this.begin();
        }
      }
      return;
    }
    if (this.tut < 0 || this.tut >= 9) return;
    this.tutT += dt;
    const f = (k: string) => !!m?.flags?.has?.(k);
    if (f('contract:first_deposit')) { this.tut = 9; this.guide(null); return; }
    switch (this.tut) {
      case 0: {
        if (f('tut:smash')) { this.advanceTut(1); break; }
        if (this.tutT > 1.5 && !this.cds.has('tut0')) {
          this.cds.set('tut0', G.time);
          const t = this.nearestFurniture();
          if (t) { this.guide(t); if (G.time - this.externalAt > 3) this.say('First lesson. Find something nobody\'s using. A chair, a desk. Break it.', { point: t }); }
        }
        // the guide follows whatever is nearest as you wander
        this.scanT -= dt;
        if (this.scanT <= 0 && this.tutT > 4 && this.guideT) { this.scanT = 5; const t = this.nearestFurniture(); if (t) this.guideT = t; }
        break;
      }
      case 1:
        if (f('tut:valuable') || this.tutT > 45) this.advanceTut(2);
        break;
      case 2:
        if (!this.guideT && this.tutT > 20) { this.tutT = 0; const h = this.nearestHopper(); if (h) this.guide(h); }
        break;
    }
  }

  private updateReactions(dt: number, p: Player) {
    if (!this.begun || p.body.dead) return;
    // low health
    const hp = p.body.health;
    if (hp < 35 && this.lastHp >= 35) this.react('hp', 90, L.lowHealth);
    this.lastHp = hp;
    // idling
    const moving = p.speed > 0.15 || !!p.actions.current;
    this.idleT = moving ? 0 : this.idleT + dt;
    if (this.idleT > 120 && !p.sleeping && !p.sittingOn) { this.idleT = 0; this.react('idle', 300, L.idle); }
    // something in sight
    this.lookT -= dt;
    if (this.lookT > 0) return;
    this.lookT = 0.6;
    const cr = (this.cds.get('creature') ?? -1e9) < G.time - 120 ? G.creatures?.list?.() as { x: number; z: number; dead?: boolean }[] | undefined : undefined;
    if (cr && cr.length) {
      for (const c of cr) {
        if (c.dead) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 11 && G.view?.vis.isVisible(Math.floor(c.x), Math.floor(c.z))) { this.react('creature', 120, L.creature); break; }
      }
    }
  }

  dispose() {
    for (const o of this.offs.splice(0)) o();
    G.pr.scene.remove(this.rig.root, this.cone, this.chev, this.mark, this.dot);
    this.voice.stop();
  }
}
void ease;

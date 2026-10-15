// The opening of a new game: intake.
//
// The Meridian Institute's processing wing, 1990, shot like Institute VHS
// (zone `reality`, src/world/gen/z_reality.ts). The debtor, in the yellow
// jumpsuit and cuffed, walks a wet corridor between two Custody Officers
// (forward only: stall and you get shoved, turn back and you get tased) past
// observation glass with still figures behind it, monitors showing their own
// mugshot and number, the REMITTANCE PROGRAMME board. Then a guard grabs them
// and drags them by the wrists to the drain in the antechamber, where both
// officers beat them with batons (real bruises, blood, not lethal). Hauled
// into Room 0, uncuffed, shoved into the Seam in the far wall: a short fall
// through the dark, and out of the Seam in the Lobby's waking room. It will
// not let them back. An officer steps out of it, pins the BAILIFF band
// through their wrist, and goes back in; the Seam seals. The band projects
// Staff Sergeant Voss (src/game/handler.ts), who gives the first orders. Then
// flag 'contract:intake' and bus 'introDone', and the debt contract takes over.
//
// Shown once per new solo/host game; Esc, the fast-forward in the corner (or
// a tap, then a tap on it) skips it at any moment. ?quick skips it, ?intro
// forces it. Co-op clients and loaded saves never see it. The stage zone is
// local: nothing that happens there reaches the op log or other players, and
// it is dropped from the world when the intro ends.
import * as THREE from 'three';
import { G } from './G';
import type { Game, GameSystem } from './game';
import type { Player } from '../entities/player';
import type { Action } from '../core/input';
import type { PickTarget } from './picking';
import { bus } from '../core/events';
import { U } from '../gfx/materials';
import { opLog } from './ops';
import type { Zone, TileObject, EdgeObj } from '../world/zone';
import { createItem } from '../items/factory';
import { hasItemDef, itemDef, type BodyPart } from '../items/item';
import type { InjuryType } from '../survival/body';
import { synth } from '../audio/sounds';
import '../audio/sounds_intro';
import '../audio/sounds_remit';
import { INTRO_ZONE, type RealityLayout } from '../world/gen/z_reality';
import { seamFaceOf } from '../world/gen/seam_kit';
import { moveCircle } from '../world/collision';
import { Guard } from './guards';
import { animSupported, fallbackPose, overlay, reachArm, palm, ease, lerp, clamp01 } from './cutPose';
import { line } from './lines';
import { paintMugshot } from '../content/furniture/zp_processing';
import { rigNumber } from '../content/items/prisoner';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { KINDS } from '../gore/kinds';
import type { SeamFx } from './seam';
import './intro.css';

export { INTRO_ZONE };

type Phase = 'open' | 'walk' | 'grab' | 'drag' | 'beat' | 'haul' | 'room0' | 'shove' | 'fall' | 'land' | 'tryback' | 'guardout' | 'pierce' | 'voss' | 'done';
type Ctl = 'none' | 'walk' | 'move' | 'all';

/** actions that make no sense while being processed */
const BLOCK = new Set<Action>(['scanner', 'map', 'flashlight', 'craft', 'sleep', 'grab', 'hot1', 'hot2', 'hot3', 'hot4', 'hot5', 'inventory', 'attack', 'shove', 'shout', 'interact'] as Action[]);
const DEG = Math.PI / 180;
const noop = () => { /* scripted: the intro drives the survivor */ };

/** Should a session that is about to start a fresh world play the intro? */
export function introWanted(mode: 'solo' | 'host' | 'client'): boolean {
  if (mode === 'client') return false;
  const q = new URLSearchParams(location.search);
  if (q.has('intro')) return q.get('intro') !== '0';
  return !q.has('quick');
}

/** Start the intro for a brand-new world; it ends with the survivor in the Lobby spawn room. */
export function startIntro(g: Game, p: Player, spawn: [number, number]): Intro {
  const intro = new Intro(g, p, spawn);
  g.addSystem(intro);
  if (import.meta.env.DEV) (window as unknown as { __intro: Intro }).__intro = intro;
  return intro;
}

interface Strike { t: number; who: 0 | 1; kind: 'chop' | 'kick'; part: BodyPart; inj: InjuryType; sev: number; done?: boolean; swung?: boolean }
const STRIKES: Omit<Strike, 'done' | 'swung'>[] = [
  { t: 1.1, who: 0, kind: 'chop', part: 'torso_u', inj: 'bruise', sev: 0.4 },
  { t: 1.85, who: 1, kind: 'chop', part: 'uarm_l', inj: 'bruise', sev: 0.35 },
  { t: 2.6, who: 0, kind: 'chop', part: 'head', inj: 'laceration', sev: 0.16 },
  { t: 3.35, who: 1, kind: 'kick', part: 'torso_l', inj: 'bruise', sev: 0.45 },
  { t: 4.05, who: 0, kind: 'chop', part: 'farm_r', inj: 'bruise', sev: 0.35 },
  { t: 4.7, who: 1, kind: 'chop', part: 'thigh_l', inj: 'bruise', sev: 0.4 },
  { t: 5.45, who: 0, kind: 'chop', part: 'torso_u', inj: 'laceration', sev: 0.12 },
  { t: 6.25, who: 1, kind: 'kick', part: 'torso_l', inj: 'bruise', sev: 0.35 },
];
const WARM = ['guard_bark', 'baton_hit', 'body_thud', 'debtor_grunt', 'debtor_scream', 'debtor_gasp', 'taser', 'buzzer', 'cuff_click', 'drag_scrape', 'seam_drone', 'seam_ripple', 'seam_reject',
  'seam_seal', 'seam_through', 'remit_pierce', 'remit_chirp', 'bone_crunch', 'holo_on', 'holo_off', 'radio_on', 'radio_off', 'holo_glitch', 'intro_fall', 'intro_land'];

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();

export class Intro implements GameSystem {
  name = 'intro';
  phase: Phase = 'open';
  /** seconds in the current phase / since the start */
  t = 0; T = 0;
  L: RealityLayout;
  z: Zone;
  A: Guard; B: Guard;
  private ctl: Ctl = 'none';
  private lockT = 0;
  private fired = new Set<number>();
  // the survivor's body
  private pp: { name: string; t: number; dur: number; loop: boolean; anim: boolean; k?: number } | null = null;
  private cuffed = true;
  private cuffL: THREE.Mesh | null = null; private cuffR: THREE.Mesh | null = null; private chain: THREE.Mesh | null = null;
  private armHold: { p: THREE.Vector3; w: number } | null = null;
  private delta = Math.PI;
  private drag: { path: [number, number][]; s: number; len: number; speed: number; holdW: number } | null = null;
  private moveTo: { x0: number; z0: number; x1: number; z1: number; t: number; dur: number; y0?: number; y1?: number; arc?: number } | null = null;
  // camera
  private follow = new THREE.Vector3();
  private camSaved = false;
  private camF = { x: 0, z: 0, w: 0, wGoal: 0, rate: 2.2 };
  private yaw0: number; private pitch0: number;
  // the walk
  private maxX = 0; private stallT = 0; private stallN = 0; private backT = 0; private pushT = 0; private walkT = 0;
  private figure: TileObject | null = null;
  // the beating
  private strikes: Strike[] = [];
  private hurtPulse = 0;
  private beaten = false; private pierced = false; private fitted = false; private sealed = false;
  // the lobby seam
  private seamL: TileObject | null = null;
  private rejectN = 0; private rejectT = -9;
  private guardGone = false;
  private sealAt = -1;
  private vossStarted = false; private vossShort = false;
  // world state to restore
  private hours: number;
  private missions: any = null;
  private missionsAt = -1;
  private envFall = false;
  private offs: (() => void)[] = [];
  private origClick: ((t: PickTarget, b: number) => void) | undefined;
  private origKey: (() => void) | undefined;
  // dom
  private root!: HTMLDivElement; private shade!: HTMLDivElement; private noise!: HTMLCanvasElement;
  private card!: HTMLDivElement; private prompt!: HTMLDivElement; private skipBtn!: HTMLButtonElement;
  private osdPlay!: HTMLDivElement; private osdTime!: HTMLDivElement; private osdCam!: HTMLDivElement;
  private noiseCtx: CanvasRenderingContext2D | null = null; private noiseImg: ImageData | null = null;
  private shadeA = 1; private noiseA = 0;
  private skipping = -1; private skipHot = 0;
  private touch = false;
  private warmQ = [...WARM];
  private num: string;

  constructor(public g: Game, public p: Player, public spawn: [number, number]) {
    const z = this.z = g.getZone(INTRO_ZONE);
    this.L = z.meta.intro as RealityLayout;
    this.num = (p as unknown as { prisonerNo?: string }).prisonerNo || rigNumber(p.rig);
    (p as unknown as { prisonerNo: string }).prisonerNo = this.num;
    paintMugshot({ skin: p.app.skin, hair: p.app.hair, hairStyle: p.app.hairStyle, number: this.num });
    this.hours = g.clock.hours;
    g.clock.hours = Math.floor(this.hours / 24) * 24 + 3 + 12 / 60;
    this.dress();
    // directives wait until the contract starts (no radio chatter in the processing wing)
    const m = g.missions;
    if (m) {
      this.missions = m;
      m.notified?.add?.('blurb:' + INTRO_ZONE);
      this.missionsAt = g.systems.indexOf(m);
      if (this.missionsAt >= 0) g.systems.splice(this.missionsAt, 1);
    }
    const [sx, sy] = this.L.start;
    g.placePlayer(p, INTRO_ZONE, sx, sy, 0);
    p.x = sx + 0.5; p.z = 21.5;
    this.maxX = p.x;
    // the officers
    this.A = new Guard('A', 3);
    this.B = new Guard('B', 7);
    this.A.place(INTRO_ZONE, this.L.guardA[0], this.L.guardA[1], 0);
    this.B.place(INTRO_ZONE, this.L.guardB[0], this.L.guardB[1], 0);
    this.A.setHeld('baton'); this.B.setHeld('baton');
    this.figure = z.objects.get(this.L.figure) ?? null;
    this.makeCuffs();
    // the camera: the VHS angle down the corridor, tight on the first monitor
    const cam = g.camera;
    this.yaw0 = cam.yawGoal; this.pitch0 = cam.pitchGoal;
    cam.setPhotoRig(-45 * DEG, 31 * DEG);
    g.pr.yaw = -45 * DEG; g.pr.pitch = 31 * DEG;
    g.pr.setZoomLevel(6);
    this.camF = { x: this.L.focus[0], z: this.L.focus[1], w: 1, wGoal: 1, rate: 2.2 };
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (G.handler) G.handler.scripted = true;
    (g as any).touch?.setHidden?.(true);
    this.hookInput();
    this.hookBody();
    this.hookCamera();
    this.buildDom();
    g.attract = noop;
  }

  /** prisoners don't keep their own clothes: the jumpsuit goes on, everything over it comes off */
  private dress() {
    const p = this.p;
    if (!hasItemDef('prison_jumpsuit')) return;
    let suit = p.allItems().find((i) => i.key === 'prison_jumpsuit');
    if (!suit) { suit = createItem('prison_jumpsuit', undefined, { pristine: true }); suit.cond = 0.62; p.inv.add(suit); }
    for (const [slot, it] of [...p.worn]) {
      const part = itemDef(it.key).clothing?.look?.part;
      if (it !== suit && (part === 'torso' || part === 'legs') && slot !== 'back') p.unwear(it);
    }
    if (!p.isWorn(suit)) p.wear(suit);
    p.outfitDirty = true;
    bus.emit('inventoryChanged', p);
  }

  // ================================================================== hooks
  private hookInput() {
    const g = this.g, inp = g.input as any;
    const orig = inp.hit.bind(inp) as (a: Action) => boolean;
    inp.hit = (a: Action) => {
      if (a === 'pause') {
        const v = orig(a);
        const ui = g.ui;
        if (v && !(ui?.menuEl || ui?.readerEl || ui?.modal || ui?.inventory?.open)) { this.skip(); return false; }
        return v;
      }
      if (this.ctl === 'all' && this.lockT <= 0) return orig(a);
      if (BLOCK.has(a)) return false;
      if (this.ctl === 'none' && a !== 'camLeft' && a !== 'camRight') return false;
      return orig(a);
    };
    this.offs.push(() => { delete inp.hit; });
    const ui = g.ui;
    if (ui) {
      this.origClick = ui.onWorldClick; this.origKey = ui.onInteractKey;
      ui.onWorldClick = (t: PickTarget, b: number) => { if (this.ctl === 'all' && this.lockT <= 0) this.origClick?.(t, b); };
      ui.onInteractKey = () => { if (this.ctl === 'all' && this.lockT <= 0) this.origKey?.(); };
      this.offs.push(() => { ui.onWorldClick = this.origClick; ui.onInteractKey = this.origKey; });
    }
    // a tap brings the fast-forward up; a tap on it skips
    const tap = (e: PointerEvent) => {
      if (this.phase === 'done' || this.skipBtn.contains(e.target as Node)) return;
      if (this.ctl === 'none' || e.pointerType !== 'touch') this.hotSkip();
    };
    window.addEventListener('pointerdown', tap, true);
    this.offs.push(() => window.removeEventListener('pointerdown', tap, true));
    this.offs.push(bus.on('enterZone', () => { this.camSaved = false; }));
  }

  /** poses on top of the animator, every frame, after the survivor's own animation */
  private hookBody() {
    const p = this.p as any;
    const orig = p.updateVisual.bind(p) as (dt: number) => void;
    p.updateVisual = (dt: number) => { orig(dt); try { this.afterPose(dt); } catch (e) { console.error('intro pose', e); } };
    this.offs.push(() => { delete p.updateVisual; });
  }

  /** framing: the camera can be pulled toward a point of interest */
  private hookCamera() {
    const cam = this.g.camera as any, pr = this.g.pr;
    const orig = cam.update.bind(cam) as (dt: number) => void;
    cam.update = (dt: number) => {
      if (this.camSaved) pr.target.copy(this.follow);
      orig(dt);
      this.follow.copy(pr.target); this.camSaved = true;
      const c = this.camF;
      c.w += (c.wGoal - c.w) * Math.min(1, dt * c.rate);
      if (c.w > 0.002) {
        pr.target.x = lerp(pr.target.x, c.x, c.w);
        pr.target.z = lerp(pr.target.z, c.z, c.w);
        pr.updateCamera(dt);
      }
    };
    this.offs.push(() => { delete cam.update; });
  }
  private frame(x: number, z: number, w: number, rate = 2.2) { this.camF.x = x; this.camF.z = z; this.camF.wGoal = w; this.camF.rate = rate; }

  // ================================================================== the survivor
  private makeCuffs() {
    const mb = new ModelBuilder();
    mb.cylinder(0, -0.02, 0, 0.042, 0.035, 8, 'chrome', { caps: true });
    const geo = mb.build();
    const mat = worldMaterial({});
    const r = this.p.rig;
    this.cuffL = new THREE.Mesh(geo, mat); this.cuffR = new THREE.Mesh(geo, mat);
    this.cuffL.position.set(0, 0.02, 0); this.cuffR.position.set(0, 0.02, 0);
    r.j.handL.add(this.cuffL); r.j.handR.add(this.cuffR);
    const cb = new ModelBuilder();
    cb.box(0, -0.5, 0, 0.012, 1, 0.012, 'chrome');
    this.chain = new THREE.Mesh(cb.build(), mat);
    this.g.pr.scene.add(this.chain);
  }
  private removeCuffs() {
    this.cuffed = false;
    this.cuffL?.removeFromParent(); this.cuffR?.removeFromParent();
    if (this.chain) this.g.pr.scene.remove(this.chain);
    this.cuffL = this.cuffR = this.chain = null;
  }

  /** a named animation if the animator has it, else the cutscene pose */
  private pose(name: string, dur = 1, loop = false) {
    const p = this.p as any;
    const anim = animSupported(name);
    this.pp = { name, t: 0, dur, loop, anim };
    if (anim) { if (typeof p.playAnim === 'function') p.playAnim(name, loop ? 9999 : dur); else { p.actionAnim = name; p.actionT = 0; p.actionDur = dur; } }
    else if (p.actionAnim) { p.stopAnim?.(); p.actionAnim = ''; }
  }
  private clearPose() {
    const p = this.p as any;
    if (this.pp?.anim) { p.stopAnim?.(this.pp.name); if (p.actionAnim === this.pp.name) p.actionAnim = ''; }
    this.pp = null;
  }

  private afterPose(dt: number) {
    const p = this.p, rig = p.rig, t = this.T;
    if (this.pp) {
      const s = this.pp;
      s.t += dt;
      const u = s.loop ? (s.t % s.dur) / s.dur : clamp01(s.t / s.dur);
      if (!s.anim) {
        const ps = fallbackPose(s.name, u, t, s.k ?? 9);
        if (ps) overlay(rig, ps, Math.min(1, s.t * 6));
      }
      if (!s.loop && s.t >= s.dur + 0.05 && !['prone', 'beaten', 'dragged', 'fall', 'cradle'].includes(s.name)) this.clearPose();
    }
    if (this.cuffed && (!this.pp || this.pp.name === 'stagger' || this.pp.name === 'shocked')) {
      const ps = fallbackPose('cuffed', 0, t);
      if (ps) overlay(rig, ps, this.pp ? 0.6 : 1);
    }
    rig.root.updateMatrixWorld(true);
    if (this.armHold) { reachArm(rig, 'L', this.armHold.p, this.armHold.w, v4.set(-0.4, -1, 0.2)); rig.root.updateMatrixWorld(true); }
    // the chain between the cuffs
    if (this.chain && this.cuffed) {
      palm(rig, 'L', v1); palm(rig, 'R', v2);
      const d = v1.distanceTo(v2);
      this.chain.visible = rig.root.visible;
      this.chain.position.copy(v1);
      this.chain.quaternion.setFromUnitVectors(v3.set(0, -1, 0), v4.copy(v2).sub(v1).normalize());
      this.chain.scale.set(1, Math.max(0.01, d), 1);
    }
    // the officers move after the debtor so their hands land on the wrists of this frame's pose
    this.A.update(dt); this.B.update(dt);
  }

  // ================================================================== dom
  private buildDom() {
    const root = this.root = document.createElement('div');
    root.className = 'vx-root letterbox track';
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
    this.shade = el('div', 'vx-shade');
    this.noise = el('canvas', 'vx-noise'); this.noise.width = 160; this.noise.height = 90;
    const top = el('div', 'vx-bar top'), bot = el('div', 'vx-bar bot');
    const track = el('div', 'vx-track');
    this.osdPlay = el('div', 'vx-osd vx-play', '<i>▶</i> PLAY');
    this.osdCam = el('div', 'vx-osd vx-cam', 'INTAKE&nbsp;CAM&nbsp;2');
    this.osdTime = el('div', 'vx-osd vx-time', '');
    this.card = el('div', 'vx-card', '<div class="l1">MERIDIAN INSTITUTE</div><div class="l2">PROCESSING WING</div><div class="l3">REMITTANCE PROGRAMME · INTAKE</div>');
    this.prompt = el('div', 'vx-prompt');
    const b = this.skipBtn = el('button', 'vx-skip', '<b>▶▶</b>SKIP' + (this.touch ? '' : '<small>ESC</small>'));
    b.type = 'button';
    b.setAttribute('aria-label', 'Skip the intro');
    b.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    b.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; });
    root.append(this.shade, this.noise, track, top, bot, this.osdPlay, this.osdCam, this.osdTime, this.card, this.prompt, b);
    document.body.appendChild(root);
  }
  private hotSkip() { this.skipHot = 2.6; this.skipBtn.classList.add('hot'); }
  private setPrompt(title: string, sub = '') {
    if (!title) { this.prompt.classList.remove('on'); return; }
    this.prompt.innerHTML = `<i>▶</i>${title}<small>${sub}</small>`;
    this.prompt.classList.add('on');
  }
  private letterbox(on: boolean) { this.root.classList.toggle('letterbox', on); }
  private paintDom(dt: number) {
    this.shade.style.opacity = String(clamp01(this.shadeA));
    if (this.skipHot > 0) { this.skipHot -= dt; if (this.skipHot <= 0) this.skipBtn.classList.remove('hot'); }
    // tape counter: 03:12 a.m., 11 November 1990
    const s = Math.floor(this.T) + 12 * 60 + 3 * 3600 + 17;
    const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
    this.osdTime.innerHTML = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}<br>NOV.11.1990`;
    const a = clamp01(this.noiseA);
    this.noise.style.opacity = String(a);
    if (a < 0.01) return;
    if (!this.noiseCtx) { this.noiseCtx = this.noise.getContext('2d'); this.noiseImg = this.noiseCtx?.createImageData(160, 90) ?? null; }
    const img = this.noiseImg, ctx = this.noiseCtx;
    if (!img || !ctx) return;
    const d = new Uint32Array(img.data.buffer);
    let sd = (Math.random() * 4294967296) >>> 0;
    for (let i = 0; i < d.length; i++) {
      sd = (sd * 1664525 + 1013904223) >>> 0;
      const v = sd >>> 24, row = Math.floor(i / 160);
      const c = (row + Math.floor(this.T * 30)) % 9 === 0 ? v >> 2 : v;
      d[i] = 0xff000000 | (c << 16) | (c << 8) | c;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ================================================================== helpers
  private at(t: number, id: number, fn: () => void) { if (this.t >= t && !this.fired.has(id)) { this.fired.add(id); fn(); } }
  private go(ph: Phase) { this.phase = ph; this.t = 0; this.fired.clear(); }
  private self(text: string, dur?: number) { const p = this.p; line(p.name, text, 'self', dur, { x: p.x, y: p.y + 2.0, z: p.z }); }
  private snd(key: string, x = this.p.x, z = this.p.z, vol = 1) { G.audio?.play?.(key, x, z, { vol, zone: this.p.zoneKey }); }
  private lock(secs: number) { this.lockT = Math.max(this.lockT, secs); }
  private hush() { for (const b of (this.g.ui?.bubbles || []) as { target: unknown; until: number }[]) if (b.target === this.p) b.until = 0; }
  private get seamFx(): SeamFx | null { return (G as unknown as { seamFx?: SeamFx }).seamFx ?? null; }
  private pulseHurt(a: number) { this.hurtPulse = Math.max(this.hurtPulse, a); }

  /** hands-midpoint of the survivor, world */
  private hands(out: THREE.Vector3) {
    const r = this.p.rig;
    palm(r, 'L', v1); palm(r, 'R', v2);
    return out.copy(v1).add(v2).multiplyScalar(0.5);
  }
  /** where the survivor's arms point, as an angle offset from their facing */
  private measureDelta() {
    const r = this.p.rig;
    r.root.updateMatrixWorld(true);
    this.hands(v3);
    r.root.worldToLocal(v3);
    if (Math.hypot(v3.x, v3.z) > 0.3) this.delta = Math.atan2(-v3.x, v3.z);
  }

  /** a guard's gloved hands onto the survivor's wrists */
  private grip(gd: Guard, side: 'L' | 'R', w: number) {
    const r = this.p.rig;
    const wp = palm(r, side, new THREE.Vector3());
    const pole = new THREE.Vector3(Math.cos(gd.facing) * -0.4, -1, Math.sin(gd.facing) * -0.4);
    const target = { p: wp, w, pole };
    if (gd === this.A) { this.A.reachR = target; } else { this.B.reachL = target; }
  }
  private ungrip(gd: Guard) { gd.reachL = null; gd.reachR = null; }

  // ================================================================== the script
  update(dt: number) {
    const g = this.g, p = this.p, fx = g.pr.fx;
    this.t += dt; this.T += dt;
    if (this.phase === 'done') return;
    if (this.warmQ.length && this.T > 0.3) synth(this.warmQ.shift()!);
    if (this.skipping >= 0) {
      this.skipping += dt;
      this.shadeA = Math.max(this.shadeA, this.skipping / 0.3);
      if (this.skipping >= 0.35) { this.skipping = -1; this.toEnd(); }
      this.paintDom(dt);
      return;
    }
    this.lockT = Math.max(0, this.lockT - dt);
    g.attract = this.ctl === 'none' || this.lockT > 0 ? noop : this.ctl === 'walk' ? this.walkCtl : null;
    if (this.lockT > 0 || this.ctl === 'none') { p.vx *= 0.8; p.vz *= 0.8; }
    switch (this.phase) {
      case 'open': this.updOpen(); break;
      case 'walk': this.updWalk(dt); break;
      case 'grab': this.updGrab(dt); break;
      case 'drag': this.updDrag(dt); break;
      case 'beat': this.updBeat(dt); break;
      case 'haul': this.updDrag(dt); break;
      case 'room0': this.updRoom0(dt); break;
      case 'shove': this.updShove(dt); break;
      case 'fall': this.updFall(dt); break;
      case 'land': this.updLand(dt); break;
      case 'tryback': this.updTryBack(dt); break;
      case 'guardout': this.updGuardOut(dt); break;
      case 'pierce': this.updPierce(dt); break;
      case 'voss': this.updVoss(dt); break;
    }
    this.updMoveTo(dt);
    // pain on the screen
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 1.6);
    if (this.hurtPulse > 0) { fx.hurt = Math.max(fx.hurt, this.hurtPulse); fx.desat = Math.max(fx.desat, this.hurtPulse * 0.4); }
    this.paintDom(dt);
  }

  /** scripted motion of the survivor (stumbles, being thrown) */
  private updMoveTo(dt: number) {
    const m = this.moveTo;
    if (!m) return;
    m.t += dt;
    const u = clamp01(m.t / m.dur), e = 1 - (1 - u) * (1 - u);
    const p = this.p;
    const nx = lerp(m.x0, m.x1, e), nz = lerp(m.z0, m.z1, e);
    p.speed = Math.hypot(nx - p.x, nz - p.z) / Math.max(dt, 1e-3);
    p.x = nx; p.z = nz;
    if (m.y0 !== undefined && m.y1 !== undefined) p.y = lerp(m.y0, m.y1, u) + Math.sin(u * Math.PI) * (m.arc ?? 0);
    if (u >= 1) { this.moveTo = null; p.speed = 0; }
  }
  private stumble(dx: number, dz: number, dist: number, dur: number) {
    const p = this.p, z = G.view!.zone;
    const sx = p.x, sz = p.z;
    const probe = { x: p.x, z: p.z, radius: p.radius } as Player;
    moveCircle(z, probe, dx * dist, dz * dist, { ignoreLow: false });
    this.moveTo = { x0: sx, z0: sz, x1: probe.x, z1: probe.z, t: 0, dur };
  }

  // ------------------------------------------------------------------ 1. the corridor
  private updOpen() {
    const t = this.t;
    this.shadeA = 1 - ease((t - 0.5) / 2.2);
    this.noiseA = t < 2.6 ? 0.28 * (1 - t / 2.6) : 0;
    this.at(0.4, 1, () => { this.osdPlay.classList.add('on'); this.osdTime.classList.add('on'); this.osdCam.classList.add('on'); G.audio?.flat?.('static_burst', 'sfx', 0.25); });
    this.at(1.0, 2, () => this.card.classList.add('on'));
    this.at(1.6, 3, () => this.skipBtn.classList.add('on'));
    this.at(3.6, 4, () => { this.card.classList.remove('on'); this.frame(this.p.x + 1.2, 21.5, 0.4, 1.2); this.g.pr.setZoomLevel(4); });
    this.at(4.2, 5, () => { this.B.bark('Walk.'); });
    this.at(5.0, 6, () => {
      this.go('walk');
      this.ctl = 'walk';
      (this.g as any).touch?.setHidden?.(false);
      this.frame(0, 0, 0, 1.5);
      this.setPrompt('WALK', this.touch ? 'push the stick forward' : 'W · forward');
    });
  }

  /**
   * The walk is the debtor's to make, but only one way: any push with an
   * eastward part shuffles them on down the corridor (cuffed, at the officers'
   * pace); pushing back the way they came is 'turning back'.
   */
  private walkCtl = (dt: number) => {
    const g = this.g, p = this.p, z = G.view!.zone;
    const mv = g.input.moveAxis();
    const yaw = g.pr.yaw;
    const wx = (-Math.sin(yaw) * mv.y + Math.cos(yaw) * mv.x) * mv.mag, wz = (-Math.cos(yaw) * mv.y - Math.sin(yaw) * mv.x) * mv.mag;
    this.intentX = wx;
    const go = wx > 0.2 ? Math.min(1, wx / 0.6) : 0;
    const sp = 1.6 * go;
    const tvx = sp, tvz = (21.5 - p.z) * 1.4 * go + wz * 0.35 * go;
    p.vx += (tvx - p.vx) * Math.min(1, dt * 10); p.vz += (tvz - p.vz) * Math.min(1, dt * 10);
    if (Math.hypot(p.vx, p.vz) > 0.01) moveCircle(z, p, p.vx * dt, p.vz * dt, { ignoreLow: false });
    p.speed = Math.hypot(p.vx, p.vz);
    if (p.speed > 0.2) { p.targetFacing = Math.atan2(p.vz, p.vx); p.turn(dt, 10); }
    p.y += (z.heightAt(p.tileX(), p.tileY()) - p.y) * Math.min(1, dt * 12);
    p.stance = 'stand'; p.running = false;
  };
  private intentX = 0;

  private updWalk(dt: number) {
    const p = this.p, A = this.A, B = this.B, L = this.L;
    this.walkT += dt;
    // forward only: trying to turn back gets you tased
    if (this.lockT <= 0 && this.intentX < -0.4) this.backT += dt; else this.backT = Math.max(0, this.backT - dt);
    if (this.backT > 0.3 && this.lockT <= 0) { this.backT = 0; this.tase('Wrong way, debtor.'); }
    if (p.speed > 0.4 && this.prompt.classList.contains('on') && this.walkT > 1.5) this.setPrompt('');
    // the officer ahead sets the pace and does not let you pass
    const aheadX = Math.max(A.x, p.x + 2.3);
    if (A.walkTo(Math.min(aheadX, L.grabX + 2.4), 21.35, 2.5, dt, 0.05)) { if (Math.floor(this.T * 0.5) % 3 === 0) A.turnTo(p.x, p.z, dt, 3); else A.turnTo(A.x + 5, A.z, dt, 3); }
    if (p.x > A.x - 1.25) { p.x = A.x - 1.25; p.vx = Math.min(p.vx, 0); }
    // the one behind keeps close
    if (this.pushT <= 0) { if (B.walkTo(Math.max(B.x, p.x - 1.75), 21.65, 3.2, dt, 0.05)) B.turnTo(p.x, p.z, dt, 5); }
    else this.pushT -= dt;
    // stalling
    if (this.lockT <= 0 && !this.moveTo) {
      this.stallT = p.speed < 0.15 ? this.stallT + dt : 0;
      if (this.stallT > (this.stallN ? 3 : 4.2) && this.walkT > 4) {
        this.stallT = 0;
        if (this.stallN++ < 2) this.shove(this.stallN === 1 ? 'Keep moving.' : 'Did I say stop?');
        else { this.stallN = 1; this.tase('I said walk.'); }
      }
    }
    // things on the way
    const x = p.x;
    if (x > 12) this.at(0, 10, () => { G.audio?.flat?.('pa_chime', 'sfx', 0.35); setTimeout(() => line('PA', 'Intake two. Intake two to Room Zero.', 'radio', 3.4), 900); });
    if (x > 18.5) this.at(0, 11, () => this.self('...that corridor goes on longer than the building.'));
    if (x > 25 && this.figure) this.at(0, 12, () => { const f = this.figure!; if (this.z.objects.has(f.uid)) this.z.removeObject(f); this.figure = null; });
    if (x > 21) this.at(0, 13, () => A.bark('Read the sign, debtor. That\'s you.'));
    if (x > 29.5) this.at(0, 14, () => B.bark('Smile. You\'re on the ledger.'));
    if (x > 33.5) this.at(0, 15, () => { this.snd('door_locked', 35.5, 20.2, 0.9); setTimeout(() => this.self('Somebody\'s behind that—'), 700); });
    if (x > 37) this.at(0, 16, () => { this.snd('machine_hum', 38.5, 18.5, 0.5); });
    if (x >= L.grabX) this.startGrab();
  }

  private shove(text: string) {
    const p = this.p, B = this.B;
    B.x = Math.max(B.x, p.x - 0.75); B.face(p.x + 1, p.z);
    B.play('shove2', 0.7);
    B.bark(text);
    this.pushT = 0.6;
    setTimeout(() => {
      if (this.phase !== 'walk') return;
      this.snd('shove', p.x, p.z, 0.8); this.snd('debtor_grunt', p.x, p.z, 0.6);
      this.pose('stagger', 0.8);
      this.stumble(1, 0, 1.3, 0.45);
      this.lock(0.6);
      this.g.camera.kick(1, 0, 0.35);
    }, 230);
  }

  private tase(text: string) {
    const p = this.p, B = this.B;
    B.setHeld('taser'); B.hold = 'taser_aim';
    B.walkTo(p.x - 0.9, p.z + 0.15, 9, 0.1); B.face(p.x, p.z);
    B.bark(text);
    this.lock(1.8);
    p.vx = p.vz = 0;
    setTimeout(() => {
      if (this.phase !== 'walk') return;
      this.snd('taser', p.x, p.z, 1); this.snd('debtor_grunt', p.x, p.z, 0.8);
      this.pose('shocked', 1.3);
      this.g.camera.shake(0.7, 0.9, 2.4);
      this.g.pr.fx.glitch = Math.max(this.g.pr.fx.glitch, 0.5);
      this.pulseHurt(0.8);
      p.body.addInjury('torso_u', 'burn', 0.06);
      p.body.panic = Math.min(100, p.body.panic + 25);
      bus.emit('playerHit', p, 'torso_u', 'shock', { dmg: 6, from: [B.x, B.z], knock: 0.1, by: 'custody' });
    }, 380);
    setTimeout(() => { B.hold = null; B.setHeld('baton'); }, 1700);
  }

  // ------------------------------------------------------------------ 2. grabbed, dragged, beaten
  private startGrab() {
    this.go('grab');
    this.ctl = 'none';
    (this.g as any).touch?.setHidden?.(true);
    this.setPrompt('');
    this.letterbox(true);
    this.snd('buzzer', 44, 21.5, 0.9);
    this.A.bark('That\'s far enough.');
  }
  private updGrab(dt: number) {
    const p = this.p, A = this.A, B = this.B;
    p.speed = 0;
    const fx = p.x + 0.7;
    A.walkTo(fx, p.z - 0.38, 2.4, dt, 0.05); A.face(p.x, p.z);
    B.walkTo(fx + 0.15, p.z + 0.4, 3.0, dt, 0.05); B.face(p.x, p.z);
    this.at(0.55, 1, () => { this.grip(A, 'R', 0.6); this.grip(B, 'L', 0.6); });
    if (this.t > 0.55) { this.grip(A, 'R', Math.min(1, (this.t - 0.55) * 3)); this.grip(B, 'L', Math.min(1, (this.t - 0.55) * 3)); }
    this.at(1.0, 2, () => {
      this.snd('debtor_gasp', p.x, p.z, 0.8); this.snd('body_thud', p.x, p.z, 0.5);
      this.g.camera.shake(0.45, 0.4);
      this.pose('dragged', 1, true);
      this.self('Wait— wait!');
    });
    this.at(1.5, 3, () => this.startDrag(this.L.drag, 1.45, 'drag'));
  }

  private startDrag(path: [number, number][], speed: number, ph: Phase) {
    const pts = path.slice();
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    this.drag = { path: pts, s: 0, len, speed, holdW: 1 };
    this.go(ph);
    if (this.pp?.name !== 'dragged') this.pose('dragged', 1, true);
    this.g.camera.pushIn(0.1, 2, -3);
  }
  /** a point and direction along the drag path */
  private along(s: number): [number, number, number] {
    const P = this.drag!.path;
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1], [bx, bz] = P[i];
      const l = Math.hypot(bx - ax, bz - az);
      if (acc + l >= s || i === P.length - 1) { const k = clamp01((s - acc) / Math.max(1e-4, l)); return [lerp(ax, bx, k), lerp(az, bz, k), Math.atan2(bz - az, bx - ax)]; }
      acc += l;
    }
    const e = P[P.length - 1];
    return [e[0], e[1], 0];
  }
  private updDrag(dt: number) {
    const d = this.drag!, p = this.p, A = this.A, B = this.B;
    d.s = Math.min(d.len, d.s + d.speed * dt);
    const [x, zz, ang] = this.along(d.s);
    const lx = Math.sin(ang), lz = -Math.cos(ang); // left of travel
    const sway = Math.sin(this.T * 5.6) * 0.03;
    A.walkTo(x + lx * 0.34, zz + lz * 0.34 + sway, 3, dt, 0.02, false); A.facing = ang;
    B.walkTo(x - lx * 0.34, zz - lz * 0.34 - sway, 3, dt, 0.02, false); B.facing = ang;
    this.grip(A, 'R', 1); this.grip(B, 'L', 1);
    // the debtor's wrists ride just behind the officers' hips; the body trails behind them
    this.measureDelta();
    p.facing = p.targetFacing = ang - this.delta;
    this.hands(v3);
    const ax = x - Math.cos(ang) * 0.42, az = zz - Math.sin(ang) * 0.42;
    p.x += (ax - v3.x) * Math.min(1, dt * 12);
    p.z += (az - v3.z) * Math.min(1, dt * 12);
    p.speed = 0;
    G.audio?.positionalLoop?.('intro_drag', 'drag_scrape', p.x, p.z, 0.55, 1, 16);
    const ph = this.phase;
    if (ph === 'drag') {
      this.at(1.0, 1, () => A.bark('Feet up. Dead weight\'s extra.'));
      this.at(2.8, 2, () => this.self('Where are you taking me?!'));
      this.at(4.2, 3, () => B.bark('Processing.'));
      this.frame(x + Math.cos(ang) * 1.5, zz + Math.sin(ang) * 1.5, 0.35, 1.2);
    } else {
      // the haul to Room 0: the door goes when they reach it
      const [dx, dy, ds] = this.L.door0;
      const e = this.z.edges.get(this.z.edgeKey(dx, dy, ds)) as EdgeObj | undefined;
      if (e && !e.open && A.x > dx - 1.3) { e.open = true; this.z.edgeChanged(dx, dy, ds); this.snd('door_open', dx, dy + 0.5, 1); this.snd('buzzer', dx, dy + 0.5, 0.6); }
      this.at(0.6, 1, () => A.bark('Up you get. Nearly done.'));
      this.at(2.4, 2, () => this.self('No— no, please—'));
      this.frame(this.L.seam.x, this.L.seam.z + 2.5, 0.3, 0.8);
    }
    if (d.s >= d.len - 0.01) {
      G.audio?.positionalLoop?.('intro_drag', null);
      if (ph === 'drag') this.startBeat(); else this.startRoom0();
    }
  }

  private startBeat() {
    this.go('beat');
    const p = this.p;
    this.ungrip(this.A); this.ungrip(this.B);
    this.pose('thrown', 0.6);
    this.snd('body_thud', p.x, p.z, 1);
    this.g.camera.shake(0.6, 0.4);
    this.strikes = STRIKES.map((s) => ({ ...s }));
    this.g.camera.pushIn(0.2, 1.2, -6);
    this.frame(p.x, p.z, 0, 2);
  }
  private updBeat(dt: number) {
    const p = this.p, A = this.A, B = this.B, t = this.t;
    if (t > 0.55 && this.pp?.name !== 'beaten') { const last = this.pp?.name; this.pose('beaten', 1, true); if (last === 'thrown') p.facing = p.targetFacing = p.facing; }
    // officers take their places either side
    const bx = p.x + Math.cos(p.facing) * 0.4, bz = p.z + Math.sin(p.facing) * 0.4;
    if (A.walkTo(bx + 0.05, bz - 0.95, 2.2, dt, 0.06)) A.turnTo(bx, bz, dt, 10);
    if (B.walkTo(bx + 0.85, bz + 0.62, 2.2, dt, 0.06)) B.turnTo(bx, bz, dt, 10);
    for (const s of this.strikes) {
      const gd = s.who === 0 ? A : B;
      if (!s.swung && t >= s.t - 0.42) {
        s.swung = true;
        if (s.kind === 'kick') gd.play('kick_low', 0.7);
        else gd.play(animSupported('smash') ? 'smash' : 'baton_chop', 0.72);
        G.audio?.play?.('whoosh', gd.x, gd.z, { vol: 0.5 });
      }
      if (!s.done && t >= s.t) { s.done = true; this.impact(s, gd); }
    }
    this.at(0.4, 1, () => B.bark('This is the orientation.'));
    this.at(3.0, 2, () => A.bark('Nothing personal. It\'s itemised.'));
    this.at(4.4, 3, () => this.self('Stop— please— STOP—'));
    this.at(6.6, 4, () => B.bark('Arms. Get its arms.'));
    if (t > 7.4) {
      this.beaten = true;
      this.g.camera.pushIn(0, 2);
      const [sx, sz] = [p.x, p.z];
      this.startDrag([[sx + 0.3, sz], [54.6, 21.5], [56.6, 21.5], [this.L.inside0[0], this.L.inside0[1]]], 1.35, 'haul');
    }
  }
  /** a blow lands: sound, blood, a bruise that stays, the picture jolts */
  private impact(s: Strike, gd: Guard) {
    const p = this.p, b = p.body;
    this.snd(s.kind === 'kick' ? 'body_thud' : 'baton_hit', p.x, p.z, 1);
    this.snd('debtor_grunt', p.x, p.z, 0.75);
    const dmg = s.kind === 'kick' ? 9 : 11;
    const inj = b.addInjury(s.part, s.inj, s.sev);
    if (s.inj === 'laceration') inj.bleed = Math.min(inj.bleed, 0.05);
    b.panic = Math.min(100, b.panic + 14);
    (G.gore as any)?.playerHit?.(p, { dmg, from: [gd.x, gd.z] }, s.part, s.inj === 'bruise' ? 'bruise' : 'laceration');
    if (s.inj === 'bruise' && G.sandbox.gore > 0) bus.emit('bloodied', p, s.part, 0.25);
    bus.emit('playerHit', p, s.part, 'blunt', { dmg, from: [gd.x, gd.z], knock: 0.25, by: 'custody' });
    this.g.camera.shake(0.55, 0.35, 1.2);
    this.g.camera.punch(0.07, 0.3);
    this.pulseHurt(0.9);
    const pp = this.pp; if (pp && pp.name === 'beaten') pp.k = 0;
  }

  // ------------------------------------------------------------------ 3. Room 0
  private startRoom0() {
    this.go('room0');
    this.pose('get_up', 1.8);
    this.g.pr.setZoomLevel(5);
    this.frame((this.p.x + this.L.seam.x) / 2, (this.p.z + this.L.seam.z) / 2 + 0.6, 0.6, 1);
  }
  private updRoom0(dt: number) {
    const p = this.p, A = this.A, B = this.B, t = this.t, S = this.L.seam;
    if (this.pp?.name === 'beaten' || this.pp?.name === 'dragged') this.pose('get_up', 1.8);
    // they hold on while the debtor gets up, then let go
    const hw = Math.max(0, 1 - t / 1.4);
    if (hw > 0) { this.grip(A, 'R', hw); this.grip(B, 'L', hw); } else { this.ungrip(A); this.ungrip(B); }
    if (t > 1.6) p.facing = p.targetFacing = p.facing + ((Math.atan2(S.z - p.z, S.x - p.x) - p.facing + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2);
    // the cuffs come off
    this.at(1.9, 1, () => { A.walkTo(p.x + Math.cos(p.facing) * 0.65, p.z + Math.sin(p.facing) * 0.65, 9, 1); A.face(p.x, p.z); });
    if (t > 1.9 && t < 2.9) {
      const w = Math.min(1, (t - 1.9) * 4) * Math.min(1, (2.9 - t) * 4);
      const r = p.rig;
      A.reachL = { p: palm(r, 'L', new THREE.Vector3()), w }; A.reachR = { p: palm(r, 'R', new THREE.Vector3()), w };
    }
    this.at(2.5, 2, () => { this.snd('cuff_click', p.x, p.z, 1); this.removeCuffs(); A.bark('Cuffs are Institute property.'); });
    this.at(2.95, 3, () => { this.ungrip(A); A.walkTo(p.x - 0.9, p.z - 0.4, 9, 1); });
    this.at(3.6, 4, () => this.self('...what is that.'));
    this.at(4.4, 5, () => { B.walkTo(p.x - Math.cos(p.facing) * 0.75, p.z - Math.sin(p.facing) * 0.75, 9, 1); B.face(p.x, p.z); B.bark('Don\'t touch the edges.'); });
    if (t > 3) { B.turnTo(p.x, p.z, dt); A.turnTo(S.x, S.z, dt); }
    if (t > 5.6) this.startShove();
  }

  private startShove() {
    this.go('shove');
    this.B.play('shove2', 0.8);
  }
  private updShove(dt: number) {
    const p = this.p, S = this.L.seam, t = this.t;
    this.at(0.28, 1, () => {
      this.snd('shove', p.x, p.z, 0.9); this.snd('debtor_gasp', p.x, p.z, 0.8);
      this.pose('stagger', 1.6);
      const tx = S.x + S.nx * 0.55, tz = S.z + S.nz * 0.55;
      this.moveTo = { x0: p.x, z0: p.z, x1: tx, z1: tz, t: 0, dur: 1.5 };
      this.frame(S.x, S.z + 1.2, 0.55, 1.5);
      this.g.pr.setZoomLevel(6);
    });
    if (t > 0.3) p.facing = p.targetFacing = Math.atan2(S.z - p.z, S.x - p.x);
    this.at(1.8, 2, () => {
      // into the black
      this.pose('thrown', 0.7);
      this.moveTo = { x0: p.x, z0: p.z, x1: S.x - S.nx * 0.6, z1: S.z - S.nz * 0.6, t: 0, dur: 0.55 };
      this.snd('seam_through', p.x, p.z, 1);
      const o = this.z.objects.get(S.uid);
      if (o) this.seamFx?.ripple(o, { x: p.x, y: 1.1, z: p.z }, 1.6, true);
      this.g.camera.shake(0.5, 0.6, 0.6);
    });
    if (t > 2.05) this.shadeA = clamp01((t - 2.05) / 0.25);
    if (t > 2.4) this.startFall();
    void dt;
  }

  // ------------------------------------------------------------------ 4. the fall
  private startFall() {
    const g = this.g, p = this.p, z = this.z, F = this.L.fall;
    this.go('fall');
    this.envFall = true;
    z.env = { ...z.env, ambient: 0x3a3e46, ambientI: 0.85, fog: 0x000000, fogNear: 5, fogFar: 16, void: 0x000000 };
    g.applyZoneEnv(z, true);
    if (g.view) g.view.vis.enabled = false;
    p.x = F.x; p.z = F.z; p.y = F.top;
    this.moveTo = null;
    g.pr.target.set(p.x, p.y, p.z);
    this.camSaved = false;
    this.frame(0, 0, 0, 5); this.camF.w = 0;
    g.camera.pushIn(0, 0.1);
    g.pr.setZoomLevel(5);
    this.A.zoneKey = ''; this.B.zoneKey = '';
    this.pose('fall', 2.4, true);
    G.audio?.flat?.('intro_sting', 'sfx', 0.35, 0.7);
  }
  private updFall(dt: number) {
    const g = this.g, p = this.p, F = this.L.fall, t = this.t, fx = g.pr.fx;
    const DUR = 3.3;
    const k = clamp01(t / DUR);
    p.y = lerp(F.top, F.bottom, Math.pow(k, 1.7));
    p.facing += dt * 0.9; p.targetFacing = p.facing; p.speed = 0;
    g.pointLight(p.x, p.y + 1.4, p.z + 0.5, 0xd8e0ff, 1.3, 7);
    G.audio?.positionalLoop?.('intro_fall', 'intro_fall', p.x, p.z, lerp(0.3, 0.8, k), lerp(0.8, 1.3, k), 40);
    fx.wobble = Math.max(fx.wobble, 0.8); fx.dream = 0.2;
    this.noiseA = 0.04 + 0.05 * Math.sin(t * 3);
    this.shadeA = t < 0.4 ? 1 - t / 0.4 : t > DUR - 0.55 ? (t - (DUR - 0.55)) / 0.4 : 0;
    if (t > DUR) this.startLand();
  }

  // ------------------------------------------------------------------ 5. out the other side
  private lobbySeam(z: Zone): TileObject | null {
    const m = z.meta.seam as [number, number, number] | undefined;
    if (!m) return null;
    return z.objectsAt(m[0], m[1]).find((o) => o.key === 'seam_door') ?? null;
  }
  private startLand() {
    const g = this.g, p = this.p;
    this.go('land');
    G.audio?.positionalLoop?.('intro_fall', null);
    this.restoreEnv();
    const lz = g.getZone('lobby');
    const seam = this.seamL = this.lobbySeam(lz);
    let fx = this.spawn[0] + 0.5, fz = this.spawn[1] + 0.5, nx = 0, nz = 1;
    if (seam) { const f = seamFaceOf(seam); fx = f.x; fz = f.z; nx = f.nx; nz = f.nz; }
    const [tx, ty] = g.nearestWalkable(lz, Math.floor(fx + nx * 1.2), Math.floor(fz + nz * 1.2));
    g.placePlayer(p, 'lobby', tx, ty, Math.atan2(nz, nx));
    g.net?.onLocalTravel?.('lobby');
    if (g.view) g.view.vis.enabled = true;
    // the waking room's Seam is awake for a minute
    if (seam) this.seamFx?.setState(seam, false);
    p.x = fx - nx * 0.3; p.z = fz - nz * 0.3; p.y = 0.9;
    p.vx = p.vz = 0;
    this.moveTo = { x0: p.x, z0: p.z, x1: fx + nx * 1.15, z1: fz + nz * 1.15, t: 0, dur: 0.34, y0: 0.9, y1: 0, arc: 0.15 };
    // the default view of the world, from here on
    g.camera.setPhotoRig(45 * DEG, this.pitch0);
    g.pr.yaw = 45 * DEG;
    g.pr.setZoomLevel(Math.max(g.camZoom, 4));
    this.camSaved = false;
    this.pose('fall', 1, true);
    this.shadeA = 1; this.noiseA = 0;
    g.pr.fx.dream = 0;
  }
  private updLand(dt: number) {
    const p = this.p, t = this.t, g = this.g;
    this.shadeA = t < 0.12 ? 1 : 1 - clamp01((t - 0.12) / 0.2);
    this.at(0.33, 1, () => {
      this.snd('body_thud', p.x, p.z, 1); G.audio?.flat?.('intro_land', 'sfx', 0.7);
      this.snd('debtor_grunt', p.x, p.z, 0.8);
      this.pose('fall_land', 0.9);
      g.camera.shake(0.9, 0.6); g.camera.punch(0.1, 0.4);
      g.pr.fx.blink = 0.8;
      this.pulseHurt(0.6);
    });
    this.at(1.2, 2, () => { this.pose('prone', 1, true); g.camera.pushIn(0.14, 2.5, -4); });
    this.at(2.6, 3, () => this.self('...no.'));
    this.at(3.4, 4, () => this.pose('get_up', 1.8));
    if (t > 3.4 && this.seamL) { const f = seamFaceOf(this.seamL); p.targetFacing = Math.atan2(f.z - p.z, f.x - p.x); p.turn(dt, 3); }
    this.at(5.3, 5, () => { this.clearPose(); g.camera.pushIn(0, 2); this.self('The wall. I came through the wall.'); });
    if (t > 5.6) {
      if (this.seamL) {
        this.go('tryback');
        this.ctl = 'move';
        (this.g as any).touch?.setHidden?.(false);
        this.letterbox(false);
        this.setPrompt('GO BACK THROUGH', this.touch ? 'walk into the black' : 'walk into the black doorway');
      } else this.startGuardOut();
    }
  }

  private updTryBack(dt: number) {
    const p = this.p, t = this.t;
    const f = seamFaceOf(this.seamL!);
    const dn = (p.x - f.x) * f.nx + (p.z - f.z) * f.nz;
    const lat = Math.abs((p.x - f.x) * -f.nz + (p.z - f.z) * f.nx);
    if (dn < 0.62 && lat < 0.75 && this.T - this.rejectT > 1.2 && !this.moveTo) {
      // it will not have you back
      this.rejectT = this.T; this.rejectN++;
      this.seamFx?.ripple(this.seamL!, { x: p.x - f.nx * dn, y: 1.2, z: p.z - f.nz * dn }, 1.2);
      this.snd('seam_reject', f.x, f.z, 1); this.snd('seam_ripple', f.x, f.z, 0.8);
      this.pose('stagger', 0.8);
      this.stumble(f.nx, f.nz, 1.0, 0.32);
      this.lock(0.5);
      this.g.camera.shake(0.5, 0.45, 0.7);
      this.g.pr.fx.wobble = Math.max(this.g.pr.fx.wobble, 1);
      this.setPrompt('');
      if (this.rejectN === 1) setTimeout(() => this.self('It\'s solid. It was a door— it was a DOOR—'), 500);
      if (this.rejectN === 2) setTimeout(() => this.self('Let me back in!'), 400);
    }
    if ((this.rejectN >= 1 && this.T - this.rejectT > 2.6) || t > 16) this.startGuardOut();
    void dt;
  }

  // ------------------------------------------------------------------ 6. the band
  private startGuardOut() {
    this.go('guardout');
    this.ctl = 'none';
    (this.g as any).touch?.setHidden?.(true);
    this.letterbox(true);
    this.setPrompt('');
    const A = this.A, p = this.p;
    A.setHeld('gun');
    A.hold = null; A.act = null; this.ungrip(A);
    if (this.seamL) {
      const f = seamFaceOf(this.seamL);
      A.place('lobby', f.x - f.nx * 0.6, f.z - f.nz * 0.6, Math.atan2(f.nz, f.nx));
      this.seamFx?.ripple(this.seamL, { x: f.x, y: 1.3, z: f.z }, 1.8);
      this.snd('seam_ripple', f.x, f.z, 1); this.snd('seam_reject', f.x, f.z, 0.7);
      this.g.camera.shake(0.35, 0.8, 0.5);
    } else A.place('lobby', p.x + 3, p.z, Math.PI);
  }
  private updGuardOut(dt: number) {
    const p = this.p, A = this.A, t = this.t;
    const f = this.seamL ? seamFaceOf(this.seamL) : { x: A.x, z: A.z, nx: -1, nz: 0 };
    p.speed = 0;
    if (t < 1.5) A.walkTo(f.x + f.nx * 0.95, f.z + f.nz * 0.95, 1.0, dt, 0.04);
    else if (t > 1.9) {
      const d = Math.hypot(p.x - A.x, p.z - A.z);
      const ux = (A.x - p.x) / (d || 1), uz = (A.z - p.z) / (d || 1);
      // he walks the debtor back off the Seam first, then gets to work
      if (A.walkTo(p.x + ux * 0.72, p.z + uz * 0.72, 1.6, dt, 0.06)) this.startPierce();
      else A.face(p.x, p.z);
    }
    p.targetFacing = Math.atan2(A.z - p.z, A.x - p.x); p.turn(dt, 4);
    this.frame((p.x + A.x) / 2, (p.z + A.z) / 2, 0.5, 1.6);
    this.at(0.5, 1, () => this.self('No—'));
    this.at(1.4, 2, () => A.bark('Hold still, debtor.'));
  }

  private startPierce() {
    this.go('pierce');
    this.g.pr.setZoomLevel(6);
    this.g.camera.pushIn(0.32, 0.7, -6);
    G.audio?.flat?.('heartbeat', 'sfx', 0.7);
  }
  private updPierce(dt: number) {
    const p = this.p, A = this.A, t = this.t, g = this.g;
    const r = p.rig;
    // the arm, held out between them
    const hx = (p.x * 0.55 + A.x * 0.45), hz = (p.z * 0.55 + A.z * 0.45);
    const lx = Math.cos(p.facing + Math.PI / 2) * 0.12, lz = Math.sin(p.facing + Math.PI / 2) * 0.12;
    if (t < 2.5) this.armHold = { p: new THREE.Vector3(hx + lx, p.y + 1.02, hz + lz), w: Math.min(1, t * 3) };
    else if (this.armHold) { this.armHold.w -= dt * 2; if (this.armHold.w <= 0) this.armHold = null; }
    if (t < 2.5) {
      r.root.updateMatrixWorld(true);
      const wrist = palm(r, 'L', new THREE.Vector3());
      const fore = r.j.farmL.getWorldPosition(new THREE.Vector3()).lerp(wrist, 0.45);
      A.reachL = { p: fore, w: Math.min(1, t * 3) };
      A.reachR = { p: wrist.clone().add(v4.set(0, 0.03, 0)), w: Math.min(1, t * 2.4) };
      this.frame(wrist.x, wrist.z, 0.85, 3);
    } else { A.reachL = null; A.reachR = null; }
    A.face(p.x, p.z);
    this.at(1.25, 1, () => this.pierce());
    this.at(1.9, 2, () => this.fitBand());
    this.at(2.5, 3, () => {
      this.pose('cradle', 1, true);
      p.full = 'kneel';
      g.camera.pushIn(0.12, 2.5, -4);
      this.frame(p.x, p.z, 0.2, 1);
    });
    this.at(3.0, 4, () => A.bark('Welcome to the Remittance Programme.'));
    // and back through the Seam
    if (t > 4.6 && !this.guardGone) {
      const f = this.seamL ? seamFaceOf(this.seamL) : { x: A.x + 2, z: A.z, nx: -1, nz: 0 };
      const tx = f.x - f.nx * 0.95, tz = f.z - f.nz * 0.95;
      A.walkTo(tx, tz, 1.15, dt, 0.05);
      const dn = (A.x - f.x) * f.nx + (A.z - f.z) * f.nz;
      if (dn < -0.5) {
        this.guardGone = true;
        A.zoneKey = '';
        this.sealAt = this.t;
        if (this.seamL) { this.seamFx?.seal(this.seamL); this.sealed = true; }
        g.camera.shake(0.4, 1.2, 0.5);
      }
    }
    if (this.guardGone && this.t - this.sealAt > 2.2) this.startVoss();
  }
  private pierce() {
    const p = this.p, A = this.A, g = this.g;
    if (this.pierced) return;
    this.pierced = true;
    this.snd('remit_pierce', p.x, p.z, 1); this.snd('bone_crunch', p.x, p.z, 1);
    setTimeout(() => this.snd('debtor_scream', p.x, p.z, 1), 120);
    const r = p.rig; r.root.updateMatrixWorld(true);
    const w = palm(r, 'L', new THREE.Vector3());
    const gore = G.gore as any;
    gore?.playerHit?.(p, { dmg: 16, from: [A.x, A.z] }, 'hand_l', 'laceration');
    if (G.sandbox.gore > 0) {
      const dx = Math.cos(p.facing + 1.4), dz = Math.sin(p.facing + 1.4);
      gore?.jet?.(KINDS.red, 0xffffff, w.x, w.y, w.z, dx, dz, 22, 2.4, 0.5, 0.55);
      gore?.jet?.(KINDS.red, 0xffffff, w.x, w.y, w.z, -dx, -dz, 12, 1.6, 0.6, 0.3);
      gore?.pool?.(G.getZone(p.zoneKey), w.x + dx * 0.4, w.z + dz * 0.4, 0.55, KINDS.red, 0xffffff, 1.5);
      bus.emit('bloodied', p, 'hand_l', 1); bus.emit('bloodied', p, 'farm_l', 0.7);
    }
    const inj = p.body.addInjury('farm_l', 'deep', 0.26);
    inj.bleed = Math.min(inj.bleed, 0.06);
    p.body.panic = 100;
    bus.emit('playerHit', p, 'hand_l', 'deep', { dmg: 16, from: [A.x, A.z], knock: 0.2, by: 'custody' });
    g.camera.shake(1.1, 0.7, 1.4); g.camera.punch(0.16, 0.5);
    g.pr.fx.glitch = Math.max(g.pr.fx.glitch, 0.6);
    g.pr.fx.blink = 0.55;
    this.pulseHurt(1);
  }
  private fitBand() {
    if (this.fitted) return;
    this.fitted = true;
    const p = this.p;
    this.snd('remit_chirp', p.x, p.z, 0.9);
    const band = G.band as any;
    if (band?.fit) { try { band.fit(p, { silent: true }); } catch (e) { console.warn('band.fit', e); } }
    else if (hasItemDef('bailiff_band') && !p.allItems().some((i) => i.key === 'bailiff_band')) {
      const it = createItem('bailiff_band', undefined, { pristine: true }); p.inv.add(it); p.wear(it); bus.emit('inventoryChanged', p);
    }
    try { (G.holo as any)?.boot?.(); } catch (e) { console.warn('holo.boot', e); }
  }

  // ------------------------------------------------------------------ 7. Voss
  private startVoss() {
    this.go('voss');
    const p = this.p;
    this.ctl = 'all';
    this.letterbox(false);
    this.root.classList.remove('track');
    (this.g as any).touch?.setHidden?.(false);
    p.full = '';
    this.clearPose();
    this.pose('get_up', 1.4);
    this.frame(0, 0, 0, 1);
    this.g.camera.pushIn(0, 2);
    this.g.pr.setZoomLevel(this.g.camZoom);
    this.osdPlay.classList.remove('on'); this.osdCam.classList.remove('on'); this.osdTime.classList.remove('on');
    this.vossLines(false);
  }
  private vossLines(short: boolean) {
    if (this.vossStarted) return;
    this.vossStarted = true; this.vossShort = short;
    const h = G.handler as any;
    if (!h) return;
    h.scripted = true;
    h.appear?.('band');
    const owed = Math.round((G.debt as any)?.remaining ?? (G.debt as any)?.state?.()?.owed ?? G.sandbox.debt ?? 25000);
    const owedS = owed.toLocaleString('en-GB');
    const hopper = h.nearestHopper?.();
    if (short) {
      h.say(`You slept through orientation, ${this.num}. Bold. You owe the Institute ${owedS} scrip. Smash the furniture, find what's worth something, feed the hopper. Don't try to leave.`, { gesture: 'jab_finger' });
      if (hopper) h.guide?.(hopper);
      return;
    }
    h.say(`BAILIFF link established. Debtor ${this.num}, this is Staff Sergeant Voss, Remittance Programme. I'm your handler. You're my problem.`, { gesture: 'salute2' });
    h.say(`You owe the Institute ${owedS} scrip. Interest compounds. So does my patience. That one's a lie.`);
    h.say('This place is full of furniture nobody\'s using. Grab it. Smash it. Anything worth something goes in the hopper.', { gesture: 'dismiss' });
    h.say('There\'s a hopper down the hall. I\'ll light the way. Try not to bleed on the merchandise.', hopper ? { point: hopper } : {});
    h.say('And debtor? Don\'t try to leave. The band takes it personally.', { gesture: 'jab_finger' });
  }
  private updVoss(dt: number) {
    const h = G.handler as any, t = this.t;
    this.shadeA = Math.max(0, this.shadeA - dt * 2);
    if (h && t > 9 && !this.fired.has(1)) {
      // the hopper line: light the way
      const hp = h.nearestHopper?.();
      this.fired.add(1);
      if (hp) h.guide?.(hp);
    }
    const busy = !!h?.busy;
    if ((!busy && t > (this.vossShort ? 2 : 4)) || t > 55) this.finish();
  }

  // ================================================================== skipping & cleanup
  skip() {
    if (this.phase === 'done' || this.skipping >= 0) return;
    if (this.phase === 'voss') { (G.handler as any)?.hush?.(); this.finish(); return; }
    this.skipping = 0;
    this.setPrompt('');
    this.card.classList.remove('on');
    this.skipBtn.classList.remove('on', 'hot');
    G.audio?.flat?.('static_burst', 'sfx', 0.3);
  }

  /** jump to where the script ends: in the Lobby, beaten, banded, the Seam shut, Voss talking */
  private toEnd() {
    const g = this.g, p = this.p;
    G.audio?.positionalLoop?.('intro_drag', null); G.audio?.positionalLoop?.('intro_fall', null);
    this.moveTo = null; this.armHold = null;
    this.ungrip(this.A); this.ungrip(this.B);
    this.A.zoneKey = ''; this.B.zoneKey = '';
    if (this.cuffed) this.removeCuffs();
    this.clearPose(); p.full = '';
    this.restoreEnv();
    if (g.view) g.view.vis.enabled = true;
    if (p.zoneKey !== 'lobby') {
      const lz = g.getZone('lobby');
      this.seamL = this.lobbySeam(lz);
      let x = this.spawn[0], y = this.spawn[1];
      if (this.seamL) { const f = seamFaceOf(this.seamL); [x, y] = g.nearestWalkable(lz, Math.floor(f.x + f.nx * 2.4), Math.floor(f.z + f.nz * 2.4)); }
      g.placePlayer(p, 'lobby', x, y, Math.PI * 0.75);
      g.net?.onLocalTravel?.('lobby');
    }
    p.vx = p.vz = 0; p.speed = 0;
    if (!this.beaten) {
      this.beaten = true;
      for (const s of STRIKES) { const inj = p.body.addInjury(s.part, s.inj, s.sev * 0.8); if (s.inj === 'laceration') inj.bleed = Math.min(inj.bleed, 0.05); }
      p.body.panic = Math.max(p.body.panic, 60);
    }
    if (!this.pierced) { this.pierced = true; const inj = p.body.addInjury('farm_l', 'deep', 0.22); inj.bleed = Math.min(inj.bleed, 0.05); }
    this.fitBand();
    if (this.seamL && !this.sealed) { this.sealed = true; this.seamFx?.setState(this.seamL, true); }
    g.camera.setPhotoRig(45 * DEG, this.pitch0);
    g.pr.yaw = 45 * DEG;
    g.camera.pushIn(0, 0.5);
    g.pr.setZoomLevel(g.camZoom);
    this.frame(0, 0, 0, 5); this.camF.w = 0; this.camSaved = false;
    this.letterbox(false);
    this.root.classList.remove('track');
    this.osdPlay.classList.remove('on'); this.osdCam.classList.remove('on'); this.osdTime.classList.remove('on');
    this.go('voss');
    this.ctl = 'all';
    (g as any).touch?.setHidden?.(false);
    this.vossLines(true);
  }

  private restoreEnv() {
    if (!this.envFall) return;
    this.envFall = false;
    const z = this.z;
    z.env = { ...z.env, ambient: 0x1a1e20, ambientI: 0.3, fog: 0x080a0a, fogNear: 13, fogFar: 27, void: 0x020203 };
    this.g.pr.fx.dream = 0;
  }

  finish() {
    if (this.phase === 'done') return;
    const g = this.g, p = this.p;
    if (p.zoneKey === INTRO_ZONE) { this.toEnd(); }
    this.phase = 'done';
    this.ctl = 'all';
    (g as any).touch?.setHidden?.(false);
    g.attract = null;
    this.clearPose(); p.full = '';
    if (this.cuffed) this.removeCuffs();
    p.y = g.getZone(p.zoneKey).heightAt(p.tileX(), p.tileY());
    G.audio?.positionalLoop?.('intro_drag', null); G.audio?.positionalLoop?.('intro_fall', null);
    for (const off of this.offs.splice(0)) { try { off(); } catch (e) { console.error(e); } }
    G.input.pointerOverUI = false;
    const fx = g.pr.fx;
    fx.corruptFlash = 0; fx.glitch = 0; fx.dream = 0;
    U.uCollapse.value = 0;
    g.clock.hours = this.hours;
    if (this.seamL && !this.sealed) { this.sealed = true; this.seamFx?.setState(this.seamL, true); }
    this.A.dispose(); this.B.dispose();
    this.root.remove();
    // nothing that happened on the stage belongs in the world's history or in co-op
    for (let i = opLog.length - 1; i >= 0; i--) {
      const r = opLog[i];
      if (r.includes(`"z":"${INTRO_ZONE}"`) || r.includes(`:${INTRO_ZONE}"`) || r.includes(`:${INTRO_ZONE}:`)) opLog.splice(i, 1);
    }
    const m = this.missions;
    if (m?.flags) for (const f of [...m.flags] as string[]) if (f.endsWith(':' + INTRO_ZONE) || f.includes(':' + INTRO_ZONE + ':')) m.flags.delete(f);
    // the systems list is being iterated right now: hand the directives back (and drop ourselves) after this frame
    queueMicrotask(() => {
      const i = g.systems.indexOf(this);
      if (i >= 0) g.systems.splice(i, 1);
      if (m && !g.systems.includes(m)) g.systems.splice(Math.max(0, Math.min(this.missionsAt, g.systems.length)), 0, m);
      if (g.view?.zone.key !== INTRO_ZONE) g.zones.delete(INTRO_ZONE);
    });
    m?.set?.('contract:intake');
    const h = G.handler as any;
    if (h) { h.scripted = false; h.begin?.(); }
    bus.emit('introDone', p);
    if (import.meta.env.DEV) (window as unknown as { __intro: Intro | null }).__intro = null;
  }

  // ================================================================== dev: jump around the script (screenshots)
  debugJump(phase: Phase, t = 0) {
    const steps = Math.ceil(t / 0.05);
    const run = (n: number) => { for (let i = 0; i < n; i++) { this.update(0.05); this.p.updateVisual(0.05); } };
    switch (phase) {
      case 'walk': if (this.phase === 'open') { this.t = 5; this.updOpen(); } break;
      case 'grab': this.p.x = this.L.grabX; this.A.x = this.L.grabX + 2.2; this.B.x = this.L.grabX - 1.8; this.startGrab(); break;
      case 'drag': this.p.x = this.L.grabX; this.A.x = this.L.grabX + 0.7; this.B.x = this.L.grabX + 0.8; this.pose('dragged', 1, true); this.startDrag(this.L.drag, 1.45, 'drag'); break;
      case 'beat': this.p.x = this.L.beat[0]; this.p.z = this.L.beat[1]; this.A.place(INTRO_ZONE, this.p.x + 1, 21.2); this.B.place(INTRO_ZONE, this.p.x + 1, 21.8); this.startBeat(); break;
      case 'room0': this.p.x = this.L.inside0[0]; this.p.z = this.L.inside0[1]; this.A.place(INTRO_ZONE, this.p.x + 0.6, 21.2); this.B.place(INTRO_ZONE, this.p.x + 0.6, 21.8); { const [dx, dy, ds] = this.L.door0; const e = this.z.edges.get(this.z.edgeKey(dx, dy, ds)); if (e) { e.open = true; this.z.edgeChanged(dx, dy, ds); } } this.startRoom0(); break;
      case 'shove': this.debugJump('room0'); run(Math.ceil(5.7 / 0.05)); return;
      case 'fall': this.startFall(); break;
      case 'land': if (this.phase !== 'fall') this.startFall(); this.startLand(); break;
      case 'guardout': if (this.p.zoneKey !== 'lobby') { this.debugJump('land'); run(120); } this.startGuardOut(); break;
      case 'pierce': this.debugJump('guardout'); run(80); break;
      case 'voss': this.toEnd(); break;
      case 'done': this.finish(); return;
    }
    if (steps) run(steps);
  }
}
void v1;

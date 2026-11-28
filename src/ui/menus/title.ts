// Round 26: the title opens on THE HALL (front/hall.ts), a cinematic dolly down a derelict corridor of the
// Meridian Institute in the rain, with the logo's reveal and four floating words over it (front/front.ts):
// Continue / New Game, New Game / Co-op, Options, Quit. A new game plays THE OFFER (front/offer.ts: Dr. Calder
// hands the unit a run-down wing; the contract is signed by hand) and then comes down onto THE FACILITY MAP
// (front/facilityMap.ts), the main menu: every room of the wing as a diorama in its condition
// (src/game/facility.ts). A room pressed on the map flies the camera into it and cuts into its own screen:
// the rooms below are those screens. Esc from a room comes back out to the map; Esc on the map, to the title.
//
// (before round 26) Title screen: THE MONITOR ROOM (monitor/monitorRoom.ts), a dim Meridian
// observation booth whose bank of CRTs shows three live feeds, the three parts
// of the lab: the CODEX ARCHIVE (rooms/archive.ts: five cabinets of files, the
// projection table and its holograms), the CONTROL ROOM (rooms/research.ts:
// the main computer with the research tree, research/tree.ts; the sample
// fridge, the benches and their first-person mini-games, the requisition) and
// UNIT ROOM 4 (the SubjectRoom of room3d.ts, rooms/subject.ts: the unit in the
// chair; tap a part of the unit and the lights come on for the creator).
// The menu is plain floating words in the game's font (Alagard, ink outline)
// over the dark side of the booth; the feed tubes are hot, and so are the
// switches, the microphone, the mug, the lamp, the phone, the chair and the window.
// Click a feed (or its DOM twin, or press 1-3) and the camera dives into the
// tube; a CRT cut drops you into that room, where you can look around and
// poke things; Q / E (or the arrows in the HUD) change channel, Esc goes back
// to the monitors. NEW UNIT goes to the unit room and the lights come on
// for the creator (intake.ts). SETTINGS sits beside a real 3D steel gear
// (gears3d.ts); CONTROLS, ABOUT, CO-OP and the CASE FILES open on a green
// phosphor terminal (terminal.ts).
import { Game } from '../../game/game';
import { randomAppearance } from '../../entities/humanRig';
import { randomLooks } from '../../entities/humanLooks';
import { AudioEngine } from '../../audio/audio';
import { listSaves, deleteSave, SaveMeta } from '../../game/save';
import { setLaunch } from '../../game/launch';
import { loadout as talentLoadout } from '../../game/talentFile';
import { talentTraits } from '../../survival/talents';
import { defaultServerUrl } from '../../net/net';
import { intakeForm, unitOutfit } from './intake';
import { h, esc, optionsPanel, controlsPanel, applyGfx, confirmDialog, FocusNav, sfx, type OptionsApi } from './common';
import { SubjectRoom } from './room3d';
import { installRetroKit } from './retroKit';
import { ambience, sample } from './sfx';
import { plateBtn } from './btnKit';
import { terminal, crtAct, type Terminal } from './terminal';
import './float.css';
import { gearCluster, type GearButton, type GearCluster } from './gears3d';
import '../../world/zones';
import '../../game/worldOps';
import './noir.css';
import { facetMats } from './scene/pixtex';
import { bitReady } from '../../gfx/bitfont';
import { MenuStage, type Hot } from './monitor/stage';
import { MonitorRoom, FEEDS, type FeedKey } from './monitor/monitorRoom';
import { CrtFx } from './monitor/crtfx';
import { setRoomAudio } from './monitor/props';
import { ResearchLab } from './rooms/research';
import { CodexArchive } from './rooms/archive';
import { openTree, treeOpen, closeTree } from './research/tree';
import { SubjectView } from './rooms/subject';
import { registerMenuRoom, setActiveMenuRoom, type MenuRoomId } from './menuRooms';
import { installLabProps } from './props/labProps';
import { installDecoAndGuide, onBuildMode } from './deco';
import { runTour, runLabIntro, tourRunning, type TourHost, type IntroHost } from './guide/tour';
import { currentGuide } from './guide/guide';
import { flag } from './deco/store';
import { isLoading } from '../loading';
import { built, onLab } from './lab/stations';
import { creditsPanel } from './credits';
import { isDesktop, desktopQuit } from '../../platform/desktop';
import { fundTag } from './lab/fund';
import { openCodex, openEntry, openFridge, openReq, openFile, panelOpen, closePanel, type PanelHost } from './research/panel';
import * as THREE from 'three';
import { mxOk } from '../machine/core';
import type { MxFrame } from '../machine/kit';
import type { MxDecor, IconKind } from '../machine/decor';
import { iconKey, iconBanner } from './iconKey';
import { TitleHall } from './front/hall';
import { FrontEnd, type FrontItem } from './front/front';
import { FacilityMap } from './front/facilityMap';
import { OfferRoom, runOffer } from './front/offer';
import { offerSigned, signOffer, screenOpen, roomDef, type RoomId } from '../../game/facility';
import { Works } from './front/build/works';

// round 21: the rooms' keys (labIcons.ts adds the lattice, the balance, the flask, the spool, the CRT and the cabinet)
const ACT_ICON: Record<string, IconKind> = {
  tree: 'lattice', talent: 'scale', process: 'flask', req: 'ledger', press: 'credit', fab: 'spool', file: 'dossier',
  inhabitants: 'jar', items: 'wrench', places: 'map', anomalies: 'siren', research: 'clipboard', new: 'plug', free: 'reel',
};
const ROOM_ICON: Record<FeedKey, IconKind> = { archive: 'cabinet', research: 'crt', subject: 'plug' };
// round 22: the short names floating under the icons
const SHORT: Record<string, string> = {
  tree: 'Research', talent: 'Talents', process: 'Samples', req: 'Requisition', press: 'Press', fab: 'Fab bay', file: 'File',
  inhabitants: 'Inhabitants', items: 'Items', places: 'Places', anomalies: 'Anomalies', research: 'Files', new: 'New unit', free: 'Release',
};
const ROOM_SHORT: Record<FeedKey, string> = { archive: 'Archive', research: 'Control', subject: 'Unit room' };

export function showTitle() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const g = new Game(canvas);
  g.worldSeed = 1000 + Math.floor(Math.random() * 9000);
  applyGfx();
  installRetroKit();
  const audio = new AudioEngine();
  g.audio = audio;
  // the world itself never draws behind the title: the rooms are their own small scenes
  (g as any).holdFeed = () => {};
  (window as any).__game = g;
  setRoomAudio(audio);
  const t = new TitleRoom(g);
  t.show();
  // the loading screen stays up (and keeps moving) until the rooms are built and their shaders
  // compiled, so the title never comes up frozen; a cap in case something stalls
  const gone = () => document.getElementById('boot')?.classList.add('gone');
  Promise.race([t.ready, new Promise((r) => setTimeout(r, 15000))]).then(gone, gone);
}

/** one breath for the page: the next frame and a task after it (or a short timer when hidden) */
const breath = () => new Promise<void>((res) => { let d = false; const go = () => { if (!d) { d = true; res(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 80); });
/** a quiet moment after a frame (requestIdleCallback where there is one), for work that can wait */
const idleSlice = () => new Promise<void>((res) => {
  const ric = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  requestAnimationFrame(() => { if (ric) ric(() => res(), { timeout: 700 }); else setTimeout(res, 50); });
});

interface Item { key: string; label: string; sub: string; act: () => void; size?: 'lg' | 'md' | 'sm' }
type View = 'front' | 'map' | 'offer' | 'monitor' | FeedKey;
type Acting = { actions: { key: string; label: string; run: () => void }[]; pointer(nx: number, ny: number): void };

/** the room's camera hooks */
type RoomCam = { shot?: (k: string, ms?: number) => void; setFraming?: (dx: number | null, dy?: number | null) => void };
const ORDER: FeedKey[] = ['archive', 'research', 'subject'];

class TitleRoom {
  root = h('div', 'nx nx-title mr');
  stageHost = h('div', 'nx-stage mr-stage');
  subjHost = h('div', 'nx-stage mr-subj feed');
  menu = h('nav', 'tt3-menu');
  cap = h('div', 'tt3-cap kf');
  hotcap = h('div', 'mr-hotcap');
  feedNav = h('div', 'mr-feeds');
  // the Institute banner across the top of the booth (the UI kit, round 15c)
  hud = (() => { const d = h('div', 'mr-hud'); const bn = iconBanner({ booth: 4 }); bn.classList.add('mr-banner'); d.append(bn); return d; })();
  foot = h('div', 'tt3-foot kf', '<span>arrows · enter · esc · 1 2 3 feeds</span><span>Observation · Meridian Institute of Liminality</span>');
  over = h('div', 'nx-over');
  room: SubjectRoom;
  stage: MenuStage;
  fx: CrtFx;
  monitor: MonitorRoom | null = null;
  research: ResearchLab | null = null;
  archive: CodexArchive | null = null;
  subject: SubjectView;
  view: View = 'front';
  hall: TitleHall | null = null;
  map: FacilityMap | null = null;
  /** round 26 part B: the room close-up's works (restoring, build mode) */
  works: Works | null = null;
  offerRoom: OfferRoom | null = null;
  front: FrontEnd;
  /** the facility map's global floating icons (no words: their names only while hot) */
  mapKeys = h('div', 'fm-keys');
  /** a black for the cinematic cuts */
  blk = h('div', 'fm-blk');
  /** the map room the last screen was entered from (back comes out over it) */
  private fromRoom: RoomId = 'monitors';
  saves: SaveMeta[] = [];
  nav: FocusNav | null = null;
  overNav: FocusNav | null = null;
  private btns = new Map<string, HTMLButtonElement | GearButton>();
  private feedBtns = new Map<FeedKey, HTMLButtonElement>();
  private gear: GearButton | null = null;
  private cluster: GearCluster | null = null;
  private lastKey = 'new';
  private live = false;
  private moving = false;
  private app = { ...randomAppearance(Math.random), ...randomLooks(Math.random, Math.random() < 0.5) };
  private g: Game;
  private term: Terminal | null = null;
  private hotT = 0;
  private hudCam: HTMLElement | null = null;
  private tcT = 0;

  constructor(g: Game) {
    this.g = g;
    // (round 16: the title is only its menu: no key line or footer under it)
    this.root.append(this.stageHost, this.subjHost, this.menu, this.feedNav, this.hud, this.mapKeys, this.hotcap, this.over, this.blk);
    this.front = new FrontEnd(this.root, { strike: (k) => this.hall?.strike(k) });
    document.body.append(this.root);
    // what the decorator hides while building / shopping
    for (const e of [this.menu, this.feedNav, this.hud, this.hotcap, this.foot, this.mapKeys]) e.setAttribute('data-deco-hide', '');
    this.fx = new CrtFx(this.root);
    // the subject room first (its frame runs before the stage's each animation frame: the feed copy relies on it)
    this.room = new SubjectRoom(this.subjHost);
    this.room.setAppearance(this.app);
    this.room.setOutfit(unitOutfit(this.app));
    this.subject = new SubjectView(this.room, this.subjHost);
    this.subjHost.addEventListener('pointerup', (e) => this.subjectTap(e));
    this.subjHost.addEventListener('pointermove', (e) => {
      if (this.view !== 'subject' || this.moving || this.root.classList.contains('lit') || this.subject.face) return;
      const h = this.room.pokeAt(e.clientX, e.clientY);
      if (h) this.showHotcap(h.label, h.sub, e.clientX, e.clientY); else this.hotcap.classList.remove('on');
    });
    this.stage = new MenuStage(this.stageHost);
    this.stage.onTick = (dt) => this.tick(dt);
    this.stage.onHot = (hh, x, y) => this.hotCaption(hh, x, y);
    this.stage.onPointer = (x, y) => this.pointer(x, y);
    // a tap on nothing while the research lattice is up steps back out of it
    this.stage.onMiss = () => { if (this.view === 'map') { if (this.map?.focused && !this.works?.miss()) void this.mapBack(); return; } if (treeOpen()) (this.research?.lattice as { back?: () => void } | undefined)?.back?.(); else if (this.view === 'research') { if (!this.research?.talent.miss()) this.research?.unfocus(); } };
    this.root.dataset.view = 'front';
    this.root.classList.add('frontend');
    listSaves().then((s) => { this.saves = s; this.build(); }).catch(() => this.build());
    this.build();
    window.addEventListener('keydown', this.onKey, true);
    bitReady().then(() => this.buildRooms()).catch(() => this.buildRooms());
    if (import.meta.env.DEV) (window as any).__title = this;
  }

  /** the three stage rooms (after the pixel font is ready: their labels are drawn with it) */
  /** resolves once the rooms are built and warmed (showTitle holds the loading screen until then) */
  private readyRes: () => void = () => {};
  readonly ready = new Promise<void>((r) => { this.readyRes = r; });
  private building = false;
  private async buildRooms() {
    if (this.monitor || this.building) return;
    this.building = true;
    let lab0: ResearchLab | null = null, arc0: CodexArchive | null = null;
    try {
      // round 22 (load time): only the monitor room is built and compiled behind the loading screen; the title
      // comes up on it, and the control room and the archive follow one idle slice at a time (their tubes show
      // snow until their feeds are live). A dive into one before it is up waits for it (go()).
      const mats = facetMats(this.stage.low);
      // round 26: the title's hall first (the title comes up on it), then the facility map, then the rooms
      const hall = new TitleHall(mats); await breath();
      this.hall = hall;
      this.stage.add(hall); this.stage.show('hall');
      await this.stage.warm(breath);
      await breath();
      this.readyRes();
      // (not while the loading screen is still playing out: it gets every frame until it is gone)
      for (let k = 0; k < 200 && isLoading(); k++) await new Promise((r) => setTimeout(r, 100));
      await idleSlice();
      const map = new FacilityMap(mats); await idleSlice();
      this.map = map;
      this.stage.add(map);
      map.onRoom = (id) => { void this.enterRoom(id); };
      this.works = new Works({ root: this.root, stage: this.stage, map, mats, enter: (id) => { void this.intoScreen(id); }, up: () => { void this.mapBack(); } });
      this.mapRes();
      await idleSlice();
      const mon0 = new MonitorRoom(mats); await idleSlice();
      this.monitor = mon0;
      this.stage.add(mon0);
      mon0.setFeedTexture('subject', this.subject.tex, false);
      mon0.onFeed = (k) => { void this.go(k); };
      await idleSlice();
      lab0 = new ResearchLab(mats); await idleSlice();
      arc0 = new CodexArchive(mats); await idleSlice();
      this.buildRoomsNow(mon0, lab0, arc0);
      // shaders: the rooms off screen are compiled (one per idle slice) before their feeds first draw them
      await this.stage.warm(idleSlice);
      mon0.setFeedTexture('archive', this.stage.feed('archive', 160, 120, 8), true);
      mon0.setFeedTexture('research', this.stage.feed('research', 160, 120, 10), true);
    } catch (e) { console.warn('title rooms', e); }
    this.building = false;
    this.readyRes();
    this.mapRes();
    this.labRes();
  }
  private mapRes: () => void = () => {};
  readonly mapReady = new Promise<void>((r) => { this.mapRes = r; });
  /** the control room and the archive are built (they come after the title is up) */
  private labRes: () => void = () => {};
  readonly labReady = new Promise<void>((r) => { this.labRes = r; });
  private buildRoomsNow(mon: MonitorRoom, lab: ResearchLab, arc: CodexArchive) {
    this.monitor = mon; this.research = lab; this.archive = arc;
    this.stage.add(mon); this.stage.add(lab); this.stage.add(arc);
    mon.setFeedTexture('subject', this.subject.tex, false);
    mon.onFeed = (k) => { void this.go(k); };
    // round 19: the lab from zero (src/ui/menus/lab): a build site in the control room funds its station
    const calder = (t: string) => { (window as unknown as { __deco?: { guide?: { now?: (t: string) => void } } }).__deco?.guide?.now?.(t); };
    // a station built (or its build site back) changes the room's words
    onLab(() => { if (this.view === 'research') this.buildHud(); });
    lab.onSite = (k, at) => {
      if (this.view !== 'research') return;
      fundTag(k, () => this.stage.project(at), () => { lab.playBuild(k); this.buildHud(); }, calder);
    };
    // the lab's paperwork (research/panel.ts): the codex, an entry, the fridge, the requisition, the Meridian file
    const ph: PanelHost = { root: this.root, onChange: () => lab.refresh(), onClose: () => lab.unfocus(), onProcess: (smp) => { if (this.view === 'research') void lab.process(smp); } };
    lab.onPanel = (w, key) => {
      if (this.view !== 'research' || lab.bench) return;
      sfx('open', 0.6);
      if (w === 'tree') { this.root.classList.add('benching'); this.hud.hidden = true; openTree({ onClose: () => { lab.unfocus(); this.root.classList.remove('benching'); this.hud.hidden = false; this.buildHud(); } }); return; }
      if (w === 'codex') openCodex(ph); else if (w === 'entry' && key) openEntry(ph, key); else if (w === 'fridge') openFridge(ph); else if (w === 'req') openReq(ph); else openFile(ph);
    };
    // the archive: its floating words ride the root; it borrows the stage's projection and pointer
    this.root.append(arc.layer);
    arc.project = (p) => this.stage.project(p);
    arc.onFocus = (on) => { this.root.classList.toggle('benching', on); this.hud.hidden = on; this.hotcap.classList.remove('on'); if (!on) this.buildHud(); };
    const cv = this.stage.canvas;
    cv.addEventListener('pointerdown', (e) => { if (this.view === 'archive') arc.drag('down', e.clientX, e.clientY); });
    window.addEventListener('pointermove', (e) => { if (this.view === 'archive') arc.drag('move', e.clientX, e.clientY); });
    window.addEventListener('pointerup', (e) => { if (this.view === 'archive') arc.drag('up', e.clientX, e.clientY); });
    this.stageHost.addEventListener('wheel', (e) => { if (this.view === 'archive' && arc.state === 'holo') { e.preventDefault(); arc.wheel(e.deltaY); } }, { passive: false });
    lab.rayAt = (x, y) => this.stage.rayAt(x, y);
    // the talent bench by the door (rooms/talentBench.ts): its floating tags ride the stage's projection
    lab.talent.project = (p) => this.stage.project(p);
    lab.talent.onFocus = (on) => { this.root.classList.toggle('benching', on); this.hud.hidden = on; this.hotcap.classList.remove('on'); if (!on) this.buildHud(); };
    lab.onBench = (on) => { this.root.classList.toggle('benching', on); this.hud.hidden = on; this.hotcap.classList.remove('on'); if (!on) this.buildHud(); };
    const reg = (id: MenuRoomId, r: { scene: THREE.Scene; cam: THREE.Camera; deco: THREE.Group; floor: any; surfaces: any; guideSpot: any }) =>
      registerMenuRoom({ id, scene: r.scene, camera: r.cam, deco: r.deco, floor: r.floor, surfaces: r.surfaces, guideSpot: r.guideSpot, host: this.stageHost, pick: (x, y) => this.pickFloor(x, y, r.floor.y, r.surfaces) });
    installLabProps();
    reg('monitor', mon); reg('research', lab); reg('archive', arc);
    this.buildFeedButtons();
    // the decorator (blueprint mode, collectibles) and the researcher guide; build mode gets a shot of the floor
    // round 18: the corner keys jump straight to the codex, the lattice and the guided tour
    installDecoAndGuide({
      root: this.root,
      jump: {
        codex: () => void this.go('archive'),
        tree: async () => { await this.go('research'); if (this.view === 'research' && !treeOpen()) (lab as unknown as { focus(k: string, cb?: () => void): void }).focus('codex', () => lab.onPanel?.('tree')); },
        tour: () => void this.startTour(),
      },
    });
    // the first visit: Dr. Calder shows the unit round once the booth is up
    onBuildMode((id) => { mon.setBuild(id === 'monitor'); lab.setBuild(id === 'research'); arc.setBuild(id === 'archive'); });
  }
  // ================================================================== the guided tour (guide/tour.ts)
  private tourReady() { return !isLoading() && !this.moving && !this.root.classList.contains('lit') && !this.root.classList.contains('playing') && !this.over.classList.contains('on') && !panelOpen() && !treeOpen() && !this.research?.bench && !this.research?.talent.active; }
  /** what the guided tour and the lab introduction drive: the rooms, the camera poses, the stations */
  private tourHost(): TourHost {
    const box = new THREE.Box3(), c = new THREE.Vector3(), q = new THREE.Vector3(), boxes = new Map<string, THREE.Box3>();
    return {
      go: async (r) => {
        await this.go(r);
        // the tube's warm-up (crtfx) runs past the cut: wait for the picture to settle before she speaks
        const fx = this.fx as unknown as { runs?: unknown[] };
        for (let k = 0; k < 40 && (fx.runs?.length ?? 0) > 0; k++) await new Promise((res) => setTimeout(res, 100));
      },
      aim: (r, pose) => { if (r === 'research' && this.research) (this.research as unknown as { pose: string }).pose = pose; else if (r === 'monitor') this.monitor?.leanTo(null); else if (r === 'subject' && (pose === 'prisoner' || pose === 'title')) void this.room.shot(pose, pose === 'title' ? 2200 : 900); },
      spot: (r, key) => {
        // round 22: a monitor's tube (the lab introduction shows an unbuilt archive on its feed)
        if (r === 'monitor' && key.startsWith('feed:') && this.monitor && this.view === 'monitor') {
          const cs = this.monitor.feedCorners(key.slice(5) as FeedKey).map((p) => this.stage.project(p)).filter((p): p is { x: number; y: number } => !!p);
          if (cs.length < 4) return null;
          const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
          return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, r: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.55 };
        }
        const room = r === 'research' ? this.research : r === 'archive' ? this.archive : null;
        const hot = (room as unknown as { hots?: { key: string; objs: THREE.Object3D[] }[] } | null)?.hots?.find((x) => x.key === key);
        if (!hot || this.view !== r) return null;
        // measured once per stop, before the station moves (a door swinging open must not drag the brackets off)
        const ck = r + ':' + key;
        const kept = boxes.get(ck);
        if (kept) box.copy(kept);
        else {
          box.makeEmpty();
          for (const o of hot.objs) if (!(o as THREE.InstancedMesh).isInstancedMesh) box.expandByObject(o);
          if (box.isEmpty()) return null;
          boxes.set(ck, box.clone());
        }
        box.getCenter(c);
        // a posed stop: the camera is looking at the station, so its middle is the look point
        const lab = this.research as unknown as { pose?: string; camL?: THREE.Vector3 } | null;
        if (r === 'research' && lab?.pose && lab.pose !== 'room' && lab.camL) c.copy(lab.camL);
        const m = this.stage.project(c);
        if (!m) return null;
        const mid = { x: m.x, y: m.y };
        const e = this.stage.project(q.copy(box.max));
        const f = this.stage.project(q.copy(box.min));
        const rad = e && f ? Math.hypot(e.x - f.x, e.y - f.y) / 2 : 60;
        const posed = r === 'research' && !!lab?.pose && lab.pose !== 'room';
        return { x: mid.x, y: mid.y, r: Math.min(150, Math.max(posed ? 110 : 64, rad * 0.6)) };
      },
      act: (r, what) => {
        // the station does its thing while she names it
        if (r === 'monitor' && what.startsWith('lean:')) { this.monitor?.leanTo(what.slice(5) as FeedKey); return; }
        const lab = this.research as unknown as { lattice?: { setBranch(i: number): void; bi?: number }; doorT?: number; hots?: { key: string; press(): void }[] } | null;
        if (r !== 'research' || !lab) return;
        if (what === 'lattice') lab.lattice?.setBranch(((lab.lattice as { bi?: number }).bi ?? 0) === 0 ? 1 : 0);
        else if (what === 'fridge') { lab.doorT = 1; sfx('creak', 0.5); }
        else if (what === 'bench') lab.hots?.find((q) => q.key === 'tb:scale')?.press();
      },
      ready: () => this.tourReady(),
    };
  }
  async startTour() {
    if (tourRunning()) return;
    // the room's own words step back while she talks (her line sits where they do)
    this.root.classList.add('touring'); document.body.classList.add('touring');
    await runTour(this.tourHost()).finally(() => { this.root.classList.remove('touring'); document.body.classList.remove('touring'); });
    if (this.view !== 'monitor') void this.back();
  }
  /** round 22: THE LAB INTRODUCTION (guide/tour.ts runLabIntro): a new game's first unit wakes in unit room 4 and
   *  Dr. Calder walks the operator round the lab, room by room, before the first link. Resolves with the black lift. */
  private async labIntro(): Promise<() => void> {
    if (tourRunning()) return () => {};
    await this.labReady;
    if (this.view !== 'monitor' && this.view !== 'subject') await this.back();
    const g = currentGuide();
    const met = flag('guide.met', false);
    const pt = new THREE.Vector3();
    const base = this.tourHost();
    const host: IntroHost = {
      ...base,
      talk: (on) => { if (g) g.voiceOver = on ? () => true : null; },
      point: (r, hot) => {
        if (!g) return;
        if (!hot || r === 'monitor') { g.pointAt = null; return; }
        const room = r === 'research' ? this.research : r === 'archive' ? this.archive : null;
        const hh = (room as unknown as { hots?: { key: string; objs: THREE.Object3D[] }[] } | null)?.hots?.find((x) => x.key === hot);
        const bx = new THREE.Box3();
        for (const o of hh?.objs ?? []) if (!(o as THREE.InstancedMesh).isInstancedMesh) bx.expandByObject(o);
        g.pointAt = bx.isEmpty() ? null : bx.getCenter(pt).clone();
      },
      introduced: () => g?.introduced(),
    };
    this.root.classList.add('touring'); document.body.classList.add('touring');
    this.menu.classList.remove('in');
    let lift: () => void = () => {};
    try { lift = await runLabIntro(host, { met }); } finally {
      this.root.classList.remove('touring'); document.body.classList.remove('touring');
      if (g) { g.voiceOver = null; g.pointAt = null; }
    }
    return lift;
  }
  /** a pointer ray onto the room's floor or the highest surface it crosses */
  private pickFloor(x: number, y: number, floorY: number, surfaces: { minX: number; maxX: number; minZ: number; maxZ: number; y: number }[] = []): THREE.Vector3 | null {
    const ray = this.stage.rayAt(x, y);
    if (!ray) return null;
    let best: THREE.Vector3 | null = null, bd = Infinity;
    for (const s of surfaces) {
      const p = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -s.y), new THREE.Vector3());
      if (p && p.x >= s.minX && p.x <= s.maxX && p.z >= s.minZ && p.z <= s.maxZ) { const d = p.distanceTo(ray.origin); if (d < bd) { bd = d; best = p; } }
    }
    if (best) return best;
    return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3());
  }

  private portrait() { return window.innerHeight > window.innerWidth * 1.05; }
  /** the room's keys: Esc back, Q / E channel; in the archive's projection ← → turn the pages */
  private navOpts() {
    return {
      onBack: () => this.onBack(), onTab: (d: -1 | 1) => this.channel(d),
      onArrow: (dx: number, dy: number) => { if (this.view === 'map' && this.map && !this.map.focused && !this.root.classList.contains('paneled')) { const id = this.map.nav(dx, dy); this.stage.hoverKey('room:' + id); return true; } const A = this.archive; if (this.view === 'archive' && A?.state === 'holo' && dx) { A.flip(dx); return true; } return false; },
    };
  }

  show() {
    this.live = true;
    this.root.classList.add('on');
    this.nav = new FocusNav(this.root, this.navOpts());
    ambience('hall');
    this.build();
    // the logo's reveal once the hall is up and the loading screen has gone
    void this.ready.then(async () => { for (let k = 0; k < 300 && isLoading(); k++) await new Promise((r) => setTimeout(r, 100)); if (this.view === 'front') this.front.reveal(!!navigator.webdriver && !/[?&]reveal\b/.test(location.search)); });
  }

  // ================================================================== the menu words
  private build() {
    // round 26: the title's four floating words (front/front.ts). With a facility (a signed offer or a save):
    // Continue (to the map), New Game (a new unit, from unit room 4); without: New Game (the offer), Co-op.
    const prog = this.saves.length > 0 || offerSigned();
    const items: FrontItem[] = [
      prog ? { key: 'continue', label: 'Continue', act: () => void this.toMap() } : { key: 'new', label: 'New Game', act: () => void this.offer() },
      prog ? { key: 'new', label: 'New Game', act: () => void this.newFromTitle() } : { key: 'coop', label: 'Co-op', act: () => this.coop() },
      { key: 'options', label: 'Options', act: () => this.options() },
      { key: 'quit', label: 'Quit', act: () => this.quit() },
    ];
    this.front.setItems(items.map((it) => ({ ...it, act: () => { if (this.busy || this.moving) return; it.act(); } })));
    if (this.live && this.view === 'front' && this.front.el.classList.contains('menu')) this.front.focusFirst();
    if (this.view === 'map') this.buildHud();
  }
  private beacon: MxDecor | null = null;
  private focusKey(k: string) { requestAnimationFrame(() => (this.btns.get(k) ?? this.feedBtns.get(k as FeedKey))?.focus({ preventScroll: true })); }
  private busy = false;
  private activate(it: Item) {
    if (this.busy || this.room.busy || this.moving) return;
    this.busy = true;
    // (the machine's keys already clunked on the press: only the way in confirms)
    if (!mxOk() || it.key === 'new' || it.key === 'continue') sfx(it.key === 'new' || it.key === 'continue' ? 'confirm' : 'plate');
    setTimeout(() => { this.busy = false; it.act(); }, 260);
  }

  // ================================================================== the feeds' DOM twins
  private buildFeedButtons() {
    this.feedNav.innerHTML = '';
    FEEDS.forEach((f, i) => {
      const b = h('button', 'mr-feed', `<i></i><i></i><i></i><i></i><span class="mr-feed-n">${i + 1}</span>`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.k = f.key;
      b.setAttribute('aria-label', `${f.label} — ${f.sub} (${i + 1})`);
      b.addEventListener('focus', () => { this.lastKey = f.key; this.monitor?.leanTo(f.key); this.stage.hoverKey('feed:' + f.key); this.feedCaption(f.key); });
      b.addEventListener('blur', () => { this.monitor?.leanTo(null); this.stage.hoverKey(null); this.hotcap.classList.remove('on'); });
      b.addEventListener('pointerenter', () => { if (document.activeElement !== b) b.focus({ preventScroll: true }); });
      b.addEventListener('click', () => { void this.go(f.key); });
      this.feedNav.append(b);
      this.feedBtns.set(f.key, b);
    });
  }
  /** keep the twins over the tubes (the camera drifts) */
  private placeFeedButtons() {
    const mon = this.monitor;
    if (!mon || this.view !== 'monitor') return;
    const r = this.root.getBoundingClientRect();
    for (const f of FEEDS) {
      const b = this.feedBtns.get(f.key);
      if (!b) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of mon.feedCorners(f.key)) { const p = this.stage.project(c); if (!p) continue; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      if (!isFinite(x0)) continue;
      const w = Math.max(44, x1 - x0), hh = Math.max(44, y1 - y0);
      b.style.transform = `translate(${Math.round(x0 - r.left - (w - (x1 - x0)) / 2)}px, ${Math.round(y0 - r.top - (hh - (y1 - y0)) / 2)}px)`;
      b.style.width = Math.round(w) + 'px'; b.style.height = Math.round(hh) + 'px';
    }
  }
  private feedCaption(k: FeedKey) {
    const f = FEEDS.find((q) => q.key === k)!, b = this.feedBtns.get(k);
    if (!b) return;
    const r = b.getBoundingClientRect();
    this.showHotcap(f.label, f.sub, r.left + r.width / 2, r.bottom + 8, true);
  }
  private showHotcap(label: string, sub: string | undefined, x: number, y: number, center = false) {
    const c = this.hotcap;
    // round 21: only the name, as raised letters (the sentence under it is gone; the thing speaks for itself)
    void sub;
    c.innerHTML = `<b>${esc(label)}</b>`;
    c.classList.add('on');
    c.classList.toggle('mid', center);
    const W = window.innerWidth, H = window.innerHeight;
    const cw = c.offsetWidth || 200, ch = c.offsetHeight || 40;
    const px = center ? Math.max(8, Math.min(W - cw - 8, x - cw / 2)) : Math.max(8, Math.min(W - cw - 8, x + 18));
    const py = Math.max(8, Math.min(H - ch - 8, y + (center ? 0 : 18)));
    c.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
  }
  private hotCaption(hh: Hot | null, x: number, y: number) {
    if (!hh) { if (!(document.activeElement as HTMLElement)?.classList?.contains('mr-feed')) this.hotcap.classList.remove('on'); return; }
    if (x < 0) return;
    // props that speak for themselves in the scene (the research lattice's sockets) carry no caption
    if (!hh.label) { this.hotcap.classList.remove('on'); return; }
    this.showHotcap(hh.label, hh.sub, x, y);
    this.hotT = 2.5;
  }
  private pointer(x: number, y: number) {
    const nx = (x / window.innerWidth) * 2 - 1, ny = (y / window.innerHeight) * 2 - 1;
    const r = this.roomOf(this.view);
    if (this.view === 'front') this.hall?.pointer(nx, ny);
    else if (this.view === 'map') this.map?.pointer(nx, ny);
    else if (this.view === 'monitor') this.monitor?.pointer(nx, ny);
    else (r as Acting | null)?.pointer(nx, ny);
  }
  private roomOf(v: View) { return v === 'monitor' ? this.monitor : v === 'research' ? this.research : v === 'archive' ? this.archive : null; }

  // ================================================================== frame hook
  private tick(dt: number) {
    this.subject.tick(dt);
    if (this.view === 'map') this.works?.update(dt);
    this.placeFeedButtons();
    if (this.hotT > 0) { this.hotT -= dt; if (this.hotT <= 0 && !this.stage.hovered && !(document.activeElement as HTMLElement)?.classList?.contains('mr-feed')) this.hotcap.classList.remove('on'); }
    this.tcT -= dt;
    if (this.tcT <= 0 && this.hudCam) {
      this.tcT = 0.5;
      const n = new Date();
      const tc = this.hudCam.querySelector('.tc');
      if (tc) tc.textContent = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}`;
      this.hudCam.classList.toggle('blink');
    }
  }

  // ================================================================== moving between rooms
  /** into a room: dive into its tube from the monitors, or switch channel from another room */
  async go(k: FeedKey | 'monitor') {
    if (this.moving || this.view === k) return;
    // round 22: the control room and the archive are built after the title is up; a dive waits for them
    if (!this.monitor || (k !== 'subject' && !this.research)) { this.moving = true; try { await this.labReady; } finally { this.moving = false; } if (this.view === k) return; }
    if (!this.monitor) return;
    // round 19: the codex archive has to be built (funded) first; its monitor shows the tag
    if (k === 'archive' && !built('archive')) {
      const calder = (t: string) => { (window as unknown as { __deco?: { guide?: { now?: (t: string) => void } } }).__deco?.guide?.now?.(t); };
      const r = this.stage.canvas.getBoundingClientRect();
      fundTag('archive', () => ({ x: r.left + r.width * 0.3, y: r.top + r.height * 0.42 }), () => { sfx('confirm'); }, calder);
      return;
    }
    if (this.over.classList.contains('on')) this.closeOver();
    this.moving = true;
    this.hotcap.classList.remove('on');
    const mon = this.monitor;
    try {
      if (this.view === 'monitor' && k !== 'monitor') {
        sfx('confirm');
        (document.activeElement as HTMLElement | null)?.blur?.();
        this.root.classList.add('diving');
        const tube = mon.tube(k);
        const t0 = performance.now();
        const snow = () => { const e = (performance.now() - t0) / 720; tube.snow = Math.max(0, Math.min(1, (e - 0.55) / 0.45)); if (e < 1.2 && this.moving) requestAnimationFrame(snow); };
        requestAnimationFrame(snow);
        await mon.dive(k);
        sfx('shutter', 0.6);
        await this.fx.play('snow', 240);
        tube.snow = 0;
      } else if (this.view === 'map' || this.view === 'front' || this.view === 'offer') {
        // round 26: out of the map's close shot on the room, a hard cut through a flash of static
        sfx('shutter', 0.5);
        await this.fx.play('snow', 260);
      } else {
        sfx('relay', 0.8);
        const i = ORDER.indexOf(k as FeedKey);
        await this.fx.play('snow', 420, i >= 0 ? `CH ${i + 1}` : undefined);
      }
      const was = this.view;
      this.enter(k);
      if (was === 'map' || was === 'front' || was === 'offer') ambience('room');
      sfx('hum', 0.5);
      await this.fx.play('on', 520);
    } finally {
      this.moving = false;
      this.root.classList.remove('diving');
    }
  }
  private enter(k: View) {
    closePanel(true);
    if (treeOpen()) closeTree();
    if (k !== 'archive') this.archive?.leave();
    this.view = k;
    this.root.dataset.view = k;
    // round 26: the title, the offer and the map are the front end: the lab's corner keys and its guide stay out of them
    this.root.classList.toggle('frontend', k === 'front' || k === 'map' || k === 'offer');
    if (k === 'subject') {
      this.subject.setMode('full');
      this.stage.paused = true;
      this.room.setFraming(0, this.portrait() ? 0.18 : 0.02);
      this.room.shot('title', 0);
      // after a breath on the room, the camera goes in to his face
      setTimeout(() => { if (this.view === 'subject' && !this.root.classList.contains('lit') && !this.subject.face) { this.subject.faceZoom(true, 2200); this.buildHud(); } }, 1400);
    } else {
      this.subject.setMode('feed');
      this.stage.paused = false;
      this.stage.show(k === 'front' ? 'hall' : k);
    }
    setActiveMenuRoom(k === 'front' || k === 'map' || k === 'offer' ? null : k);
    this.buildHud();
  }
  /** back out of a room's screen: the picture collapses and the map's camera rises out of that room's diorama */
  async back() {
    if (this.moving || this.view === 'map' || this.view === 'front' || this.view === 'offer' || !this.map) return;
    this.moving = true;
    try {
      sfx('back');
      await this.fx.play('off', 420);
      this.enter('map');
      this.map.snapTo(this.fromRoom);
      void this.fx.play('on', 320);
      ambience('map');
      await this.map.unfocus(1500);
      this.focusMap();
    } finally { this.moving = false; }
  }

  // ================================================================== round 26: the front, the offer, the map
  private black(on: boolean, ms = 800): Promise<void> {
    this.blk.style.transition = `opacity ${ms}ms ease`;
    this.blk.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, ms));
  }
  /** from the title onto the facility map (the descent) */
  async toMap() {
    if (this.moving) return;
    this.moving = true;
    try {
      void this.front.leave();
      sample('mn_whoosh', 0.3, 0.6);
      await this.black(true, 1100);
      await this.mapReady;
      if (!this.map) return;
      this.front.hide();
      this.enter('map');
      ambience('map');
      void this.black(false, 1600);
      await this.map.reveal(4200);
      this.focusMap();
    } finally { this.moving = false; }
  }
  /** a new game: the offer, then down onto the derelict wing */
  async offer() {
    if (this.moving) return;
    this.moving = true;
    try {
      void this.front.leave();
      await this.black(true, 1200);
      if (!this.offerRoom) {
        const r = new OfferRoom(facetMats(this.stage.low));
        this.offerRoom = r;
        this.stage.add(r);
        void r.load();
      }
      this.front.hide();
      this.enter('offer');
      this.blk.style.transition = 'none'; this.blk.classList.remove('on');
      await runOffer({ room: this.offerRoom, root: this.root, rayAt: (x, y) => this.stage.rayAt(x, y) });
      signOffer();
      this.blk.style.transition = 'none'; this.blk.classList.add('on');
      await this.mapReady;
      this.enter('map');
      ambience('map');
      this.build();
      await new Promise((r) => setTimeout(r, 600));
      void this.black(false, 2200);
      await this.map!.reveal(5200);
      this.focusMap();
    } finally { this.moving = false; }
  }
  /** New Game with a facility: a new unit, from unit room 4 (the intake, the talent bench, the link) */
  async newFromTitle() {
    await this.toMap();
    await this.enterRoom('unit', true);
    if (this.view === 'subject') void this.newGame(true);
  }
  /** back to the title from the map */
  async toFront() {
    if (this.moving) return;
    this.moving = true;
    try {
      sfx('back');
      await this.black(true, 900);
      this.enter('front');
      ambience('hall');
      this.front.back();
      await this.black(false, 1400);
    } finally { this.moving = false; }
  }
  quit() {
    if (isDesktop()) { desktopQuit(); return; }
    ambience(null);
    this.front.powerDown(() => ambience('hall'));
  }
  /** a room pressed on the map: the camera flies down into it and holds on its close-up, where the works are
   *  (part B: restoring, build mode) and its screen is one press away; `direct` cuts straight into the screen */
  async enterRoom(id: RoomId, direct = false) {
    const map = this.map;
    if (!map || this.moving || this.view !== 'map' || this.root.classList.contains('paneled')) return;
    this.moving = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.stage.hoverKey(null);
    sfx('confirm', 0.6);
    try { await map.focus(id); } finally { this.moving = false; }
    this.buildHud();
    if (direct && screenOpen(id)) { await this.intoScreen(id); return; }
    this.works?.open(id);
  }
  /** from a room's close-up into its own screen (the lattice, the fab bay, the talent bench, the containment drawer) */
  async intoScreen(id: RoomId) {
    const def = roomDef(id);
    if (this.moving || this.view !== 'map' || !screenOpen(id) || !def.screen) { sample('door_locked', 0.5); return; }
    this.works?.close();
    this.fromRoom = id;
    const sc = def.screen;
    await this.go(sc.view);
    if ((this.view as View) !== sc.view || !sc.act) return;
    // the room's own act once its screen is up (the lattice, the fab bay, the talent bench, the containment drawer)
    await new Promise((r) => setTimeout(r, 400));
    const acts = sc.view === 'archive' ? this.archive?.actions : this.research?.actions;
    acts?.find((a) => a.key === sc.act)?.run();
  }
  /** out of a room's close shot on the map */
  async mapBack() {
    if (!this.map?.focused || this.moving) return;
    this.works?.close();
    this.moving = true;
    try { await this.map.unfocus(); } finally { this.moving = false; }
    this.buildHud();
    this.focusMap();
  }
  private focusMap() { (document.activeElement as HTMLElement | null)?.blur?.(); }

  /** Q / E in a room: the next channel */
  private channel(d: -1 | 1) {
    if (this.view === 'monitor' || this.view === 'map' || this.view === 'front' || this.view === 'offer' || this.root.classList.contains('lit') || this.research?.bench || this.research?.talent.active || treeOpen()) return;
    // in the archive Q / E run along the drawers, or along the files in the projection
    const A = this.archive;
    if (this.view === 'archive' && A && A.state !== 'room') { if (A.state === 'holo') A.nextFile(d); else A.nextDrawer(d); return; }
    const i = ORDER.indexOf(this.view as FeedKey);
    void this.go(ORDER[(i + d + ORDER.length) % ORDER.length]);
  }
  private onBack() {
    if (this.over.classList.contains('on')) { this.closeOver(); return; }
    if (this.view === 'front' || this.view === 'offer') return;
    if (this.view === 'map') { if (this.works?.back()) return; if (this.map?.focused) void this.mapBack(); else void this.toFront(); return; }
    if (this.view === 'archive' && this.archive?.back()) return;
    if (this.view === 'subject' && this.subject.face) { this.subject.faceZoom(false); this.buildHud(); return; }
    if (this.research?.bench) return;
    void this.back();
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.live || tourRunning() || this.view === 'front' || this.view === 'offer' || this.root.classList.contains('lit') || this.root.classList.contains('playing') || this.over.classList.contains('on') || panelOpen() || treeOpen() || this.research?.bench || this.research?.talent.active) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (this.view === 'map') {
      if ((e.key === 'Enter' || e.key === ' ') && !(t && t.tagName === 'BUTTON')) { e.preventDefault(); if (!this.map?.focused) this.map?.pressSel(); else this.works?.press(); }
      return;
    }
    if (this.view === 'archive' && this.archive && this.archive.state !== 'room') { if (this.archive.key(e)) { e.preventDefault(); e.stopPropagation(); } return; }
    if (e.key >= '1' && e.key <= String(ORDER.length)) { e.preventDefault(); void this.go(ORDER[Number(e.key) - 1]); }
    else if (e.key === '0' && this.view !== 'monitor') { e.preventDefault(); void this.back(); }
  };

  // ================================================================== the room HUD
  private buildHud() {
    const hud = this.hud;
    const bn = hud.querySelector('.mr-banner');
    hud.innerHTML = '';
    if (bn) hud.append(bn);
    this.hudCam = null;
    this.mapKeys.innerHTML = '';
    if (this.view === 'map') { this.feedNav.hidden = true; this.buildMapKeys(); return; }
    if (this.view === 'front' || this.view === 'offer') { this.feedNav.hidden = true; return; }
    if (this.view === 'monitor') {
      // round 26: the booth is one room of the facility now; the way back out is a floating map
      this.feedNav.hidden = false;
      const b = iconKey('map', 'Facility', () => { if (!this.moving) void this.back(); }, { model: this.portrait() ? 40 : 50, cls: 'mr-ik home warm', hint: 'Esc' });
      const bar = h('div', 'mr-bar ikk-row'); bar.append(b); hud.append(bar);
      return;
    }
    this.feedNav.hidden = true;
    const k = this.view as FeedKey, i = ORDER.indexOf(k), f = FEEDS[i];
    // the camera's own overlay: its number, the record lamp, the clock (the room's name is on the hover of its key)
    const cam = h('div', 'mr-cam', `<b>${esc(f.cam)}</b><span class="rec" aria-label="recording"></span><span class="tc"></span>`);
    cam.setAttribute('aria-label', f.name);
    hud.append(cam);
    this.hudCam = cam;
    this.tcT = 0;
    // round 22: the room's words are floating icons, each with its short name under it
    const acts = h('div', 'mr-acts ikk-row');
    const bar = h('div', 'mr-bar ikk-row');
    const pt = this.portrait();
    const KW = pt ? 40 : 50;
    const key = (kind: IconKind, label: string, cls: string, fn: () => void, o: { hint?: string; tone?: 'olive' | 'yellow' | 'dark'; at?: 'top' | 'bottom' } = {}) => {
      const b = iconKey(kind, label, () => { if (!this.moving) fn(); }, { model: KW, cls: 'mr-ik ' + cls + (o.tone === 'yellow' ? ' warm' : ''), hint: o.hint });
      b.style.setProperty('--ik-i', String(acts.childElementCount + bar.childElementCount));
      return b;
    };
    const roomActs: { key: string; label: string; run: () => void }[] = k === 'subject'
      ? [
        { key: 'new', label: 'New unit', run: () => this.newGame(true) },
        { key: 'free', label: 'Release', run: () => this.newGame(false) },
        { key: 'face', label: this.subject.face ? 'Whole room' : 'The face', run: () => { this.subject.faceZoom(!this.subject.face); sfx('servo', 0.5); this.buildHud(); } },
      ]
      : ((this.roomOf(k) as Acting | null)?.actions ?? []);
    for (const a of roomActs) {
      const kind = a.key === 'face' ? (this.subject.face ? 'door' : 'lens') : ACT_ICON[a.key] ?? 'gear';
      acts.append(key(kind, a.key === 'face' ? (this.subject.face ? 'Room' : 'Face') : SHORT[a.key] ?? a.label, 'act', () => { sfx('click', 0.8); a.run(); }, { tone: a.key === 'new' ? 'yellow' : 'olive' }));
    }
    const prev = ORDER[(i + ORDER.length - 1) % ORDER.length], next = ORDER[(i + 1) % ORDER.length];
    const pf = FEEDS.find((q) => q.key === prev)!, nf = FEEDS.find((q) => q.key === next)!;
    const arrow = (b: HTMLElement, d: 'l' | 'r') => { b.append(h('span', 'ikk-arr ' + d)); return b; };
    if (prev !== next) bar.append(arrow(key(ROOM_ICON[prev], ROOM_SHORT[prev], 'prev', () => void this.go(prev), { hint: 'Q', tone: 'dark', at: 'bottom' }), 'l'));
    bar.append(key('map', 'Facility', 'home', () => void this.back(), { hint: 'Esc', tone: 'yellow', at: 'bottom' }));
    bar.append(arrow(key(ROOM_ICON[next], ROOM_SHORT[next], 'next', () => void this.go(next), { hint: 'E', tone: 'dark', at: 'bottom' }), 'r'));
    hud.append(acts, bar);
    requestAnimationFrame(() => (acts.querySelector('button') as HTMLElement | null ?? bar.querySelector('.home') as HTMLElement | null)?.focus({ preventScroll: true }));
  }
  /** round 26: the map's global keys, floating icons with no words (a name only while hot): back to the title,
   *  the last case, the case files, co-op, the controls, the options; down in a room, the way back up */
  private buildMapKeys() {
    const row = this.mapKeys;
    const pt = this.portrait();
    const key = (kind: IconKind, name: string, fn: () => void, cls = '') => {
      const b = iconKey(kind, name, () => { if (!this.moving) fn(); }, { model: pt ? 36 : 42, nameHover: true, cls: 'fm-k ' + cls });
      b.style.setProperty('--ik-i', String(row.childElementCount));
      row.append(b);
      return b;
    };
    if (this.map?.focused) { key('map', 'Back', () => void this.mapBack(), 'warm'); return; }
    key('door', 'Title', () => void this.toFront());
    const last = this.saves[0];
    if (last) key('play', 'Resume', () => this.play(last), 'warm');
    if (this.saves.length) key('clipboard', 'Case files', () => this.loads());
    key('walkie', 'Co-op', () => this.coop());
    key('joystick', 'Controls', () => this.controls());
    key('gear', 'Options', () => this.options());
  }
  /** a tap on a part of the unit: the lights come on and the creator starts at that part */
  private subjectTap(e: PointerEvent) {
    if (this.view !== 'subject' || this.moving || this.root.classList.contains('lit')) return;
    const part = this.room.partAt(e.clientX, e.clientY);
    if (part) { sfx('servo', 0.5); void this.newGame(true, part); }
    // not the unit: a prop round the room (the gauges, the clock, the cabinet, the locks) answers instead
    else if (!this.subject.face) this.room.pokeAt(e.clientX, e.clientY, true);
  }

  // ================================================================== panels: the terminal
  private openOver(el: HTMLElement, title: string, sub: string, onTab?: (d: -1 | 1) => void, side?: HTMLElement) {
    this.overNav?.destroy();
    this.cluster?.dispose(); this.cluster = null;
    this.over.innerHTML = '';
    this.over.className = 'nx-over on' + (side ? ' with-side' : '');
    const t = terminal({ title, sub, cls: 'tt3-term' });
    t.body.append(el);
    const back = mxOk() ? iconKey('door', 'Back', () => this.closeOver(), { w: 76, h: 56, tone: 'olive', lamp: 'amber', sound: 'back', hint: 'Esc', nameAt: 'left' }) : plateBtn('Back', () => this.closeOver(), { finish: 'cream', size: 'md', shape: 'arrowL', lamp: false, sound: 'back', aria: 'Back (Esc)' });
    t.keys.append(back);
    if (side) this.over.append(side);
    this.over.append(t.el);
    this.term = t;
    this.over.onpointerdown = (e) => { if (e.target === this.over) this.closeOver(); };
    this.root.classList.add('paneled');
    sfx('open', 0.7);
    this.overNav = new FocusNav(this.over, { onBack: () => this.closeOver(), autofocus: true, onTab });
  }
  private closeOver() {
    if (!this.over.classList.contains('on')) return;
    this.overNav?.destroy(); this.overNav = null;
    this.cluster?.dispose(); this.cluster = null;
    this.over.className = 'nx-over';
    this.over.innerHTML = '';
    this.term = null;
    this.root.classList.remove('paneled');
    sfx('back');
    if (this.view === 'front') this.front.focusFirst(); else this.focusKey(this.lastKey);
  }

  /** settings: the pages hang on a gear train; turn a gear (click, Q / E) to change page */
  options() {
    let api: OptionsApi | null = null;
    const panel = optionsPanel({ hideTabs: true, onApi: (a) => { api = a; } });
    const a = api as OptionsApi | null;
    const cl = gearCluster(a ? a.pages.map((p) => p[0] + p.slice(1).toLowerCase()) : ['Sound', 'Picture', 'Interface'], (i) => { if (a && a.index !== i) a.select(i); }, a ? a.index : 0);
    a?.onChange((i) => { if (cl.index !== i) cl.select(i, true); });
    const side = document.createElement('div'); side.className = 'tt4-gears';
    side.append(cl.el);
    this.openOver(panel, 'Settings', '', (d) => cl.turn(d), side);
    this.cluster = cl;
    requestAnimationFrame(() => cl.layout(this.portrait() ? 'h' : 'v'));
  }
  controls() { this.openOver(controlsPanel(), 'Controls', ''); }
  about() {
    const note = creditsPanel();
    this.openOver(note, 'About', '');
  }

  private play(s: SaveMeta) {
    sfx('confirm');
    this.root.classList.add('playing');
    setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 650);
  }

  /** lights on in subject room 4: the room becomes the creator */
  private async runIntake(opts: Parameters<typeof intakeForm>[0]) {
    if (this.view !== 'subject') await this.go('subject');
    if (this.subject.face) { this.subject.faceZoom(false, 500); await new Promise((r) => setTimeout(r, 520)); }
    this.root.classList.add('lit');
    this.nav?.destroy(); this.nav = null;
    const r = await intakeForm({ ...opts, room: this.room, app: this.app });
    this.root.classList.remove('lit');
    this.nav = new FocusNav(this.root, this.navOpts());
    this.build();
    if (!r) { this.room.setFraming(0, this.portrait() ? 0.18 : 0.02); this.room.shot('title', 900); this.buildHud(); }
    return r;
  }
  private async newGame(directives: boolean, part?: string) {
    // (round 26: the offer opens a new game now, front/offer.ts; the lab introduction tour returns with the rooms)
    const lift: (() => void) | null = null;
    // the very first unit: the prologue (the link, the intake drag, the wake and Dr. Calder's lesson)
    if (directives && !part && !navigator.webdriver) {
      const P = await import('../../game/prologue');
      if (!P.prologueSeen()) { sfx('confirm'); P.replayPrologue(); return; }
    }
    lift?.();
    this.menu.classList.add('in');
    const r = await this.runIntake({ directives, part: part as any });
    if (!r) return;
    // the talent bench in the control room weighs the unit before it is linked (null: backed out)
    const tal = await this.talentStep();
    if (tal) setLaunch({ mode: 'new', ...r, traits: [...r.traits, ...talentTraits(tal)] });
  }
  /** a new unit's last stop: the control room's talent bench (scripted browsers skip it unless ?talent) */
  private async talentStep(): Promise<string[] | null> {
    if (!this.research || (navigator.webdriver && !/[?&]talent/.test(location.search))) return talentLoadout();
    await this.go('research');
    return this.research.talent.open({ intake: true });
  }

  /** the case files: one per save */
  loads() {
    const list = h('div', 'tt3-cases');
    const draw = () => {
      list.innerHTML = '';
      if (!this.saves.length) list.append(h('p', 'ct-dim', 'No units on file.'));
      this.saves.forEach((s, i) => {
        const d = new Date(s.savedAt);
        const f = h('div', 'tt3-case', `<span class="n">${String(i + 1).padStart(3, '0')}</span><span class="t"><b>${esc(s.character)}</b><small>day ${Math.floor(s.hours / 24) + 1} · ${esc(s.zone)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}</small></span>`);
        const acts = h('span', 'a');
        acts.append(crtAct('Resume', () => { sfx('confirm'); f.classList.add('go'); setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 450); }, { icon: 'play' }));
        // round 15: the last checkpoint held on this world -> a new file on the old world (src/game/checkpoint.ts)
        if (s.cp) { const cp = s.cp; acts.append(crtAct('Re-enter', () => { sfx('confirm'); f.classList.add('go'); setTimeout(() => setLaunch({ mode: 'reenter', cp: cp.id }), 450); }, { icon: 'tape' })); }
        acts.append(crtAct('Delete', async () => {
          const ok = await confirmDialog({ title: 'Delete case file', body: `Delete ${s.character}'s file? This world and everything in it will be gone for good.`, ok: 'Delete', cancel: 'Keep', danger: true });
          if (!ok) return;
          await deleteSave(s.id);
          this.saves = this.saves.filter((q) => q !== s);
          f.classList.add('gone');
          setTimeout(() => { draw(); this.build(); (list.querySelector('button') as HTMLElement | null)?.focus(); }, 380);
        }, { danger: true, icon: 'skull' }));
        f.append(acts);
        list.append(f);
      });
    };
    draw();
    this.openOver(list, 'Case files', String(this.saves.length));
  }

  /** the handset: host a room or dial into one */
  coop() {
    const box = h('div', 'tt3-coop');
    const field = (ph: string, aria: string) => { const i = h('input', 'tt3-field') as HTMLInputElement; i.placeholder = ph; i.spellcheck = false; i.setAttribute('aria-label', aria); return i; };
    const srv = field('ws://host:8787', 'Relay server');
    let saved = ''; try { saved = localStorage.getItem('noclip.server') || ''; } catch { /* storage blocked */ }
    srv.value = saved || defaultServerUrl();
    const remember = () => { try { localStorage.setItem('noclip.server', srv.value.trim()); } catch { /* ignore */ } };
    const lbl = (t: string) => h('div', 'tt3-lbl', esc(t));
    box.append(lbl('Exchange (relay server)'), srv);
    if (!import.meta.env.VITE_DESKTOP) box.append(h('p', 'ct-dim tt3-small', 'Co-op runs through a relay (<code>npm start</code> in the project folder serves the game and the relay on port 8787). Everyone dials the same exchange. Up to 8 units.'));
    if (import.meta.env.VITE_DESKTOP) box.append(h('p', 'ct-dim tt3-small', 'Co-op is the only part of the game that uses the network: it connects to the relay you type here and nothing else. Single player never goes online.'));
    if (import.meta.env.VITE_SANDBOXED) box.append(h('p', 'ct-warn tt3-small', 'This copy runs in a sandboxed page that cannot open network connections, so co-op is unavailable here. Run the project with <code>npm start</code> to play together.'));
    const cols = h('div', 'tt3-cols');
    const hostBox = h('div', 'tt3-col', '<h4>Open a line · host</h4>');
    const rn = field('room name (optional)', 'Room name');
    const pw = field('password (optional)', 'Password');
    hostBox.append(rn, pw);
    hostBox.append(crtAct('Host a new world', async () => {
      remember();
      const server = srv.value.trim(), roomName = rn.value.trim(), pass = pw.value;
      this.closeOver();
      const r = await this.runIntake({ title: 'UNIT INTAKE · HOST' });
      if (!r) return;
      setLaunch({ mode: 'host', server, roomName: roomName || r.name, public: !pass, pass, ...r, traits: [...r.traits, ...talentTraits(talentLoadout())] });
    }, { icon: 'radio' }));
    if (this.saves.length) hostBox.append(crtAct('Host a saved world', () => {
      remember();
      const s = this.saves[0];
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || s.character, public: !pw.value, pass: pw.value, saveId: s.id, name: s.character, app: null as any, occupation: '', traits: [], sandbox: {}, seed: 0, directives: true });
    }, { sub: this.saves[0].character, icon: 'tape' }));
    const joinBox = h('div', 'tt3-col', '<h4>Dial in · join</h4>');
    const code = field('CODE', 'Room code'); code.maxLength = 5; code.classList.add('tt3-code');
    const jpw = field('password (if any)', 'Password');
    joinBox.append(code, jpw);
    const rooms = h('div', 'tt3-rooms');
    joinBox.append(crtAct('Join', async () => {
      if (code.value.trim().length < 4) { code.focus(); sfx('error'); return; }
      remember();
      const server = srv.value.trim(), room = code.value.trim(), pass = jpw.value;
      this.closeOver();
      const r = await this.runIntake({ title: 'UNIT INTAKE · JOIN', sandbox: false, submit: 'JOIN TEAM' });
      if (!r) return;
      setLaunch({ mode: 'join', server, room, pass, name: r.name, app: r.app, occupation: r.occupation, traits: [...r.traits, ...talentTraits(talentLoadout())] });
    }, { icon: 'walkie' }));
    joinBox.append(crtAct('List open lines', async () => {
      rooms.textContent = 'ringing…';
      try {
        const u = new URL(srv.value.trim().replace(/^ws/, 'http'));
        u.pathname = '/rooms';
        const list: any[] = await (await fetch(u.toString())).json();
        rooms.innerHTML = list.length ? '' : 'No open lines.';
        for (const r of list) rooms.append(crtAct(`${r.room} · ${r.name} · ${r.players}/${r.max}${r.locked ? ' · locked' : ''}`, () => { code.value = r.room; }));
      } catch { rooms.textContent = 'Nobody picked up (could not reach the relay).'; }
    }, { icon: 'phone' }));
    joinBox.append(rooms);
    cols.append(hostBox, joinBox);
    box.append(cols);
    for (const i of [srv, rn, pw, code, jpw]) { i.addEventListener('focus', () => { if (this.g.input) this.g.input.textFocus = true; }); i.addEventListener('blur', () => { if (this.g.input) this.g.input.textFocus = false; }); }
    this.openOver(box, 'Co-op', '');
  }
}
export type { RoomCam };

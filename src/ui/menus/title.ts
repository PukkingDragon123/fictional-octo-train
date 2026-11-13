// Title screen: THE MONITOR ROOM (monitor/monitorRoom.ts), a dim Meridian
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
import { pxBanner, CLEARANCE } from '../pxKit';
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
import { ambience } from './sfx';
import { plateBtn } from './btnKit';
import { terminal, crtAct, type Terminal } from './terminal';
import './float.css';
import { gearButton, gearCluster, type GearButton, type GearCluster } from './gears3d';
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
import { installDecoAndGuide, onBuildMode } from './deco';
import { openCodex, openEntry, openFridge, openReq, openFile, panelOpen, closePanel, type PanelHost } from './research/panel';
import * as THREE from 'three';
import { mxOk } from '../machine/core';
import { mxFrame, mxSkinKey, panelSpec, type MxFrame } from '../machine/kit';
import { mxIconAnim, mxMount, type IconKind, type MxDecor } from '../machine/decor';

const TITLE_ICON: Record<string, IconKind> = { continue: 'play', new: 'plug', free: 'reel', coop: 'walkie', load: 'clipboard', controls: 'joystick', about: 'dossier' };

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

interface Item { key: string; label: string; sub: string; act: () => void; size?: 'lg' | 'md' | 'sm' }
type View = 'monitor' | FeedKey;
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
  hud = (() => { const d = h('div', 'mr-hud'); const bn = pxBanner(CLEARANCE, 'OBSERVATION BOOTH 4'); bn.classList.add('mr-banner'); d.append(bn); return d; })();
  foot = h('div', 'tt3-foot kf', '<span>arrows · enter · esc · 1 2 3 feeds</span><span>Observation · Meridian Institute of Liminality</span>');
  over = h('div', 'nx-over');
  room: SubjectRoom;
  stage: MenuStage;
  fx: CrtFx;
  monitor: MonitorRoom | null = null;
  research: ResearchLab | null = null;
  archive: CodexArchive | null = null;
  subject: SubjectView;
  view: View = 'monitor';
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
    this.root.append(this.stageHost, this.subjHost, this.menu, this.feedNav, this.hud, this.hotcap, this.over);
    document.body.append(this.root);
    // what the decorator hides while building / shopping
    for (const e of [this.menu, this.feedNav, this.hud, this.hotcap, this.foot]) e.setAttribute('data-deco-hide', '');
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
    this.stage.onMiss = () => { if (treeOpen()) (this.research?.lattice as { back?: () => void } | undefined)?.back?.(); else if (this.view === 'research') { if (!this.research?.talent.miss()) this.research?.unfocus(); } };
    this.root.dataset.view = 'monitor';
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
    try {
      // one room per task, so the loading screen gets frames in between
      const mats = facetMats(this.stage.low);
      const mon0 = new MonitorRoom(mats); await breath();
      const lab0 = new ResearchLab(mats); await breath();
      const arc0 = new CodexArchive(mats); await breath();
      this.buildRoomsNow(mon0, lab0, arc0);
      // shaders: the rooms off screen are compiled before their feeds first draw them
      await this.stage.warm(breath);
      const mon = this.monitor!;
      mon.setFeedTexture('archive', this.stage.feed('archive', 160, 120, 8), true);
      mon.setFeedTexture('research', this.stage.feed('research', 160, 120, 10), true);
      await breath();
    } catch (e) { console.warn('title rooms', e); }
    this.building = false;
    this.readyRes();
  }
  private buildRoomsNow(mon: MonitorRoom, lab: ResearchLab, arc: CodexArchive) {
    this.monitor = mon; this.research = lab; this.archive = arc;
    this.stage.add(mon); this.stage.add(lab); this.stage.add(arc);
    this.stage.show('monitor');
    mon.setFeedTexture('subject', this.subject.tex, false);
    mon.onFeed = (k) => { void this.go(k); };
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
    reg('monitor', mon); reg('research', lab); reg('archive', arc);
    setActiveMenuRoom('monitor');
    this.buildFeedButtons();
    // the decorator (blueprint mode, collectibles) and the researcher guide; build mode gets a shot of the floor
    installDecoAndGuide({ root: this.root });
    onBuildMode((id) => { mon.setBuild(id === 'monitor'); lab.setBuild(id === 'research'); arc.setBuild(id === 'archive'); });
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
      onArrow: (dx: number) => { const A = this.archive; if (this.view === 'archive' && A?.state === 'holo' && dx) { A.flip(dx); return true; } return false; },
    };
  }

  show() {
    this.live = true;
    this.root.classList.add('on');
    this.nav = new FocusNav(this.root, this.navOpts());
    this.focusKey(this.lastKey);
    ambience('room');
    this.menu.classList.add('in');
  }

  // ================================================================== the menu words
  private build() {
    const last = this.saves[0];
    const pt = this.portrait();
    const items: Item[] = [];
    if (last) items.push({ key: 'continue', label: 'Resume', sub: `${last.character} · day ${Math.floor(last.hours / 24) + 1}`, act: () => this.play(last), size: 'lg' });
    items.push({ key: 'new', label: 'New unit', sub: 'to unit room 4 · the link rig · pay the debt', act: () => this.newGame(true), size: 'lg' });
    items.push({ key: 'free', label: 'Release', sub: 'free survival · no contract · no band', act: () => this.newGame(false), size: pt ? 'md' : 'lg' });
    items.push({ key: 'coop', label: 'Co-op', sub: 'call another cell · host or dial in', act: () => this.coop(), size: pt ? 'sm' : 'md' });
    if (this.saves.length) items.push({ key: 'load', label: 'Case files', sub: `${this.saves.length} unit${this.saves.length === 1 ? '' : 's'} on file`, act: () => this.loads(), size: pt ? 'sm' : 'md' });
    items.push({ key: 'controls', label: 'Controls', sub: 'keys · touch · gamepad', act: () => this.controls(), size: pt ? 'sm' : 'md' });
    items.push({ key: 'about', label: 'About', sub: 'what this place is', act: () => this.about(), size: pt ? 'sm' : 'md' });
    // a rebuild (the saves came in) keeps the console's housing and its little things: only the keys are replaced
    for (const c of [...this.menu.children]) if (!c.matches('.mxf-cv, .mxd, .tt-pro')) c.remove();
    this.menu.classList.add('ft-menu');
    if (!mxOk()) this.menu.append(this.cap);
    this.btns.clear();
    items.forEach((it, i) => {
      const b = h('button', `ft-item ft-${it.size ?? 'md'}`, `<span class="ft-ptr" aria-hidden="true"></span><span class="ft-lab">${esc(it.label)}</span>`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.k = it.key;
      b.style.setProperty('--ft-i', String(i));
      b.setAttribute('aria-label', `${it.label} — ${it.sub}`);
      b.addEventListener('focus', () => { this.lastKey = it.key; if (!mxOk()) this.caption(it, b); });
      b.addEventListener('pointerenter', () => { if (document.activeElement !== b) { b.focus({ preventScroll: true }); sfx('tick', 0.4); } });
      b.addEventListener('click', () => this.activate(it));
      this.menu.append(b);
      this.btns.set(it.key, b);
      // round 16: the words are keys on the observation desk's console, each with its little model
      if (mxOk()) {
        // one size of key (the way in a little bigger), its own little 3D model that sways while the key is hot,
        // the cap sinks with a clunk and the lamp lights (src/ui/machine/kit.ts mxSkinKey)
        const go = it.key === 'new' || it.key === 'continue';
        b.classList.toggle('ft-lg', go); b.classList.toggle('ft-md', !go); b.classList.remove('ft-sm');
        b.style.width = (pt ? (go ? 244 : 228) : (go ? 276 : 248)) + 'px';
        b.style.height = (pt ? (go ? 48 : 44) : (go ? 54 : 48)) + 'px';
        const ic = mxIconAnim(TITLE_ICON[it.key] ?? 'gear', pt ? 32 : 36);
        if (ic) {
          b.append(ic.cv);
          const hot = () => ic.hot(document.activeElement === b || b.matches(':hover'));
          for (const ev of ['focus', 'blur', 'pointerenter', 'pointerleave']) b.addEventListener(ev, () => requestAnimationFrame(hot));
        }
        mxSkinKey(b, { tone: go ? 'yellow' : 'olive', lamp: go ? 'green' : 'amber', sound: 'key', seed: 40 + i });
        if (go) b.classList.add('ink-d');
        b.addEventListener('focus', () => this.beacon?.alert(go));
      }
    });
    this.gear?.dispose();
    const gi: Item = { key: 'options', label: 'Settings', sub: 'sound · picture · interface', act: () => this.options() };
    const gb = gearButton('Settings', () => this.activate(gi), { aria: 'Settings — sound · picture · interface' });
    gb.dataset.k = 'options';
    gb.classList.add('tt4-gear');
    gb.addEventListener('focus', () => { this.lastKey = 'options'; if (!mxOk()) this.caption(gi, gb); });
    this.menu.append(gb);
    this.btns.set('options', gb);
    this.gear = gb;
    if (mxOk()) this.machine(pt);
    if (this.live) { this.menu.classList.add('in'); if (this.view === 'monitor') this.focusKey(this.btns.has(this.lastKey) ? this.lastKey : 'new'); }
  }
  private beacon: MxDecor | null = null;
  private mxf: MxFrame | null = null;
  /** round 16: the menu as a console on the desk: an enamel housing, a beacon on its hood that turns while the
   * way in is lit, a spanner on a peg and the specimen jar beside it, watching the pointer */
  private machine(pt: boolean) {
    this.menu.classList.add('mx');
    if (this.mxf) return; // built once: a rebuild of the keys must not flash the housing
    // no nameplate (the keys say enough): lamps, a vent, the hazard foot, glands and cables
    this.mxf = mxFrame(this.menu, (w, hh) => panelSpec(w, hh, { seed: 71, lamps: ['green', 'amber', 'red'], glands: 2, hazard: true, top: 44, bot: 26, toggles: 2, knobs: 1 }), { pad: 16, grow: pt ? { l: 14, t: 48, r: 14, b: 28 } : { l: 20, t: 50, r: 22, b: 30 } });
    this.beacon = mxMount(this.menu, 'beacon', { right: pt ? 18 : 30, top: pt ? -84 : -92, z: 3 }, { col: 'amber', s: 1.3, alert: this.lastKey === 'new' || this.lastKey === 'continue' });
    // the prologue is the cassette on the console's hood: press it to play the first link again
    const tape = mxIconAnim('tape', 30);
    if (tape) {
      const pb = h('button', 'tt-pro') as HTMLButtonElement;
      pb.type = 'button';
      pb.setAttribute('aria-label', 'Prologue — the first link, again');
      pb.title = 'Prologue';
      pb.append(tape.cv);
      for (const ev of ['focus', 'pointerenter']) pb.addEventListener(ev, () => { tape.hot(true); if (ev === 'pointerenter') sfx('tick', 0.35); });
      for (const ev of ['blur', 'pointerleave']) pb.addEventListener(ev, () => tape.hot(false));
      pb.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this.busy || this.room.busy || this.moving) return;
        sfx('key', 0.7);
        import('../../game/prologue').then((m) => m.replayPrologue()).catch((err) => console.warn('prologue', err));
      });
      pb.style.left = (pt ? 4 : 2) + 'px'; pb.style.top = (pt ? -44 : -46) + 'px';
      this.menu.append(pb);
    }
    if (!pt) {
      mxMount(this.menu, 'jar', { right: -132, bottom: -44, z: 3 }, { title: 'Specimen 07', s: 1.35 });
      mxMount(this.menu, 'gauge', { right: 10, bottom: 92, z: 3 }, { label: 'LINK' });
    }
  }
  private focusKey(k: string) { requestAnimationFrame(() => (this.btns.get(k) ?? this.feedBtns.get(k as FeedKey))?.focus({ preventScroll: true })); }
  private caption(it: { sub: string }, b: HTMLElement) {
    if (this.cap.parentElement !== this.menu) this.menu.append(this.cap);
    this.cap.innerHTML = `<small>${esc(it.sub)}</small>`;
    const cy = b.offsetHeight / 2;
    this.cap.style.top = this.portrait() ? '' : Math.round(b.offsetTop + cy) + 'px';
    this.cap.style.left = this.portrait() ? '' : Math.round(b.offsetLeft + b.offsetWidth + 34) + 'px';
    this.cap.classList.remove('in'); void this.cap.offsetWidth; this.cap.classList.add('in');
  }
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
    c.innerHTML = `<b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
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
    if (this.view === 'monitor') this.monitor?.pointer(nx, ny);
    else (r as Acting | null)?.pointer(nx, ny);
  }
  private roomOf(v: View) { return v === 'monitor' ? this.monitor : v === 'research' ? this.research : v === 'archive' ? this.archive : null; }

  // ================================================================== frame hook
  private tick(dt: number) {
    this.subject.tick(dt);
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
  async go(k: FeedKey) {
    if (this.moving || this.view === k || !this.monitor) return;
    if (this.over.classList.contains('on')) this.closeOver();
    this.moving = true;
    this.hotcap.classList.remove('on');
    const mon = this.monitor;
    try {
      if (this.view === 'monitor') {
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
      } else {
        sfx('relay', 0.8);
        const i = ORDER.indexOf(k);
        await this.fx.play('snow', 420, `CH ${i + 1}`);
      }
      this.enter(k);
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
      this.stage.show(k);
    }
    setActiveMenuRoom(k);
    this.buildHud();
  }
  /** back to the monitor room: the picture collapses, the camera pulls out of the tube */
  async back() {
    if (this.moving || this.view === 'monitor' || !this.monitor) return;
    this.moving = true;
    const from = this.view as FeedKey;
    try {
      sfx('back');
      await this.fx.play('off', 420);
      this.enter('monitor');
      const p = this.monitor.back(from);
      void this.fx.play('on', 320);
      await p;
      this.focusKey(from);
    } finally { this.moving = false; }
  }
  /** Q / E in a room: the next channel */
  private channel(d: -1 | 1) {
    if (this.view === 'monitor' || this.root.classList.contains('lit') || this.research?.bench || this.research?.talent.active || treeOpen()) return;
    // in the archive Q / E run along the drawers, or along the files in the projection
    const A = this.archive;
    if (this.view === 'archive' && A && A.state !== 'room') { if (A.state === 'holo') A.nextFile(d); else A.nextDrawer(d); return; }
    const i = ORDER.indexOf(this.view as FeedKey);
    void this.go(ORDER[(i + d + ORDER.length) % ORDER.length]);
  }
  private onBack() {
    if (this.over.classList.contains('on')) { this.closeOver(); return; }
    if (this.view === 'archive' && this.archive?.back()) return;
    if (this.view === 'subject' && this.subject.face) { this.subject.faceZoom(false); this.buildHud(); return; }
    if (this.research?.bench) return;
    if (this.view !== 'monitor') void this.back();
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.live || this.root.classList.contains('lit') || this.root.classList.contains('playing') || this.over.classList.contains('on') || panelOpen() || treeOpen() || this.research?.bench || this.research?.talent.active) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
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
    if (this.view === 'monitor') { this.feedNav.hidden = false; return; }
    this.feedNav.hidden = true;
    const k = this.view, i = ORDER.indexOf(k), f = FEEDS[i];
    const cam = h('div', 'mr-cam', `<b>${esc(f.cam)}</b><span class="nm">${esc(f.name)}</span><span class="rec">REC</span><span class="tc"></span>`);
    hud.append(cam);
    this.hudCam = cam;
    this.tcT = 0;
    const acts = h('div', 'mr-acts');
    const bar = h('div', 'mr-bar');
    const word = (label: string, cls: string, fn: () => void, aria?: string, short?: string) => {
      const lab = short ? `<span class="long">${esc(label)}</span><span class="short">${esc(short)}</span>` : esc(label);
      const b = h('button', 'mr-word ' + cls, `<span class="ft-ptr" aria-hidden="true"></span><span class="lab">${lab}</span>`) as HTMLButtonElement;
      b.type = 'button'; if (aria) b.setAttribute('aria-label', aria);
      b.addEventListener('pointerenter', () => { if (document.activeElement !== b) { b.focus({ preventScroll: true }); sfx('tick', 0.4); } });
      b.addEventListener('click', () => { if (!this.moving) fn(); });
      return b;
    };
    const roomActs: { key: string; label: string; run: () => void }[] = k === 'subject'
      ? [
        { key: 'new', label: 'New unit', run: () => this.newGame(true) },
        { key: 'face', label: this.subject.face ? 'Whole room' : 'The face', run: () => { this.subject.faceZoom(!this.subject.face); sfx('servo', 0.5); this.buildHud(); } },
      ]
      : ((this.roomOf(k) as Acting | null)?.actions ?? []);
    for (const a of roomActs) acts.append(word(a.label, 'act', () => { sfx('click', 0.8); a.run(); }));
    const prev = ORDER[(i + ORDER.length - 1) % ORDER.length], next = ORDER[(i + 1) % ORDER.length];
    const pf = FEEDS.find((q) => q.key === prev)!, nf = FEEDS.find((q) => q.key === next)!;
    if (prev !== next) bar.append(word('‹ ' + pf.label, 'prev', () => void this.go(prev), `Previous feed: ${pf.label} (Q)`, '‹ ' + pf.cam));
    bar.append(word('Monitors', 'home', () => void this.back(), 'Back to the monitors (Esc)'));
    bar.append(word(nf.label + ' ›', 'next', () => void this.go(next), `Next feed: ${nf.label} (E)`, nf.cam + ' ›'));
    hud.append(acts, bar);
    const tip = h('div', 'mr-tip', k === 'subject' ? 'tap a part of the unit to work on it · Q E change feed · Esc monitors' : k === 'research' ? 'tap the main computer, the fridge, the talent bench · Q E change feed · Esc monitors' : k === 'archive' ? 'tap a cabinet, pull a file, watch it project · Q E change feed · Esc monitors' : 'tap things · Q E change feed · Esc monitors');
    hud.append(tip);
    requestAnimationFrame(() => (acts.querySelector('button') as HTMLElement | null ?? bar.querySelector('.home') as HTMLElement | null)?.focus({ preventScroll: true }));
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
    const back = plateBtn('Back', () => this.closeOver(), { finish: 'cream', size: 'md', shape: 'arrowL', lamp: false, sound: 'back', aria: 'Back (Esc)' });
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
    this.focusKey(this.lastKey);
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
    this.openOver(panel, 'Settings', 'turn a gear · Q / E', (d) => cl.turn(d), side);
    this.cluster = cl;
    requestAnimationFrame(() => cl.layout(this.portrait() ? 'h' : 'v'));
  }
  controls() { this.openOver(controlsPanel(), 'Controls', 'keys · touch · menus'); }
  about() {
    const note = h('div', 'tt3-about', `
<p>A survival sandbox. You are an operator at the Meridian Institute of Liminality. In the chair beside the link rig sits a unit: a debtor whose body you take over, with a shock, and walk through a wall that turns to liquid, into rooms that never end.</p>
<p>A band on the unit's wrist counts what it owes. Dr. Iris Calder talks you through the job: carry the furniture to the presses, find the data, scan the inhabitants. Pay the debt, buy a way out. Or don't.</p>
<p>This booth watches three rooms. The codex archive, where every file is pulled and projected. The control room, where the main computer holds the research tree and the benches process the samples you bring back. Unit room 4, where the next unit is shaped, dressed and fitted with chips and limbs. Click a monitor, or press 1, 2 or 3.</p>
<p class="ct-dim">Inspired by the systemic survival of <i>Project Zomboid</i>, the 2019 "noclip" creepypasta, liminal-space photography and VHS-era found footage. All names, places, creatures and story here are original. Built with three.js. Type: Alagard (SIL Open Font License). Every texture, model, sound and pixel is generated in code.</p>`);
    this.openOver(note, 'About', 'the file in the drawer');
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
    // the very first unit: the prologue (the link, the intake drag, the wake and Dr. Calder's lesson)
    if (directives && !part && !navigator.webdriver) {
      const P = await import('../../game/prologue');
      if (!P.prologueSeen()) { sfx('confirm'); P.replayPrologue(); return; }
    }
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
        acts.append(crtAct('Resume', () => { sfx('confirm'); f.classList.add('go'); setTimeout(() => setLaunch({ mode: 'load', id: s.id }), 450); }));
        // round 15: the last checkpoint held on this world -> a new file on the old world (src/game/checkpoint.ts)
        if (s.cp) { const cp = s.cp; acts.append(crtAct('Re-enter', () => { sfx('confirm'); f.classList.add('go'); setTimeout(() => setLaunch({ mode: 'reenter', cp: cp.id }), 450); })); }
        acts.append(crtAct('Delete', async () => {
          const ok = await confirmDialog({ title: 'Delete case file', body: `Delete ${s.character}'s file? This world and everything in it will be gone for good.`, ok: 'Delete', cancel: 'Keep', danger: true });
          if (!ok) return;
          await deleteSave(s.id);
          this.saves = this.saves.filter((q) => q !== s);
          f.classList.add('gone');
          setTimeout(() => { draw(); this.build(); (list.querySelector('button') as HTMLElement | null)?.focus(); }, 380);
        }, { danger: true }));
        f.append(acts);
        list.append(f);
      });
    };
    draw();
    this.openOver(list, 'Case files', `${this.saves.length} unit${this.saves.length === 1 ? '' : 's'} on file`);
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
    box.append(h('p', 'ct-dim tt3-small', 'Co-op runs through a relay (<code>npm start</code> in the project folder serves the game and the relay on port 8787). Everyone dials the same exchange. Up to 8 units.'));
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
    }));
    if (this.saves.length) hostBox.append(crtAct('Host a saved world', () => {
      remember();
      const s = this.saves[0];
      setLaunch({ mode: 'host', server: srv.value.trim(), roomName: rn.value.trim() || s.character, public: !pw.value, pass: pw.value, saveId: s.id, name: s.character, app: null as any, occupation: '', traits: [], sandbox: {}, seed: 0, directives: true });
    }, { sub: this.saves[0].character }));
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
    }));
    joinBox.append(crtAct('List open lines', async () => {
      rooms.textContent = 'ringing…';
      try {
        const u = new URL(srv.value.trim().replace(/^ws/, 'http'));
        u.pathname = '/rooms';
        const list: any[] = await (await fetch(u.toString())).json();
        rooms.innerHTML = list.length ? '' : 'No open lines.';
        for (const r of list) rooms.append(crtAct(`${r.room} · ${r.name} · ${r.players}/${r.max}${r.locked ? ' · locked' : ''}`, () => { code.value = r.room; }));
      } catch { rooms.textContent = 'Nobody picked up (could not reach the relay).'; }
    }));
    joinBox.append(rooms);
    cols.append(hostBox, joinBox);
    box.append(cols);
    for (const i of [srv, rn, pw, code, jpw]) { i.addEventListener('focus', () => { if (this.g.input) this.g.input.textFocus = true; }); i.addEventListener('blur', () => { if (this.g.input) this.g.input.textFocus = false; }); }
    this.openOver(box, 'Co-op', 'host a world or dial into one');
  }
}
export type { RoomCam };

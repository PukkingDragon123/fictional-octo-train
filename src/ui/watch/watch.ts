// THE WATCH (G.watch, also G.ui.scanner for older callers): the wrist
// computer on the BAILIFF band. Tab raises your left wrist into a first-person
// close-up (src/fp/fp.ts stage 'watch'). Standing still it zooms in to a
// readable full view; walking or running it stays up small in the corner as a
// glance (it never pauses anything). Its one base function is QUESTS (with the
// R&D uplink that spends research points); everything else is researched:
// map, anomaly scan, signals, biomonitor (calories, blood pressure, diagnosis
// AI, mind), logbook, and the multi-tool (torch, scanner beam, laser cutter,
// welder, fabricator). Quests upload with a chime and a quick wrist-glance.
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { damp, clamp, angleDiff } from '../../core/math';
import { crtScreen, fontsReady, type CrtScreen } from '../../gfx/crt';
import { Tube } from './tube';
import { fpGroup, fpClaim, fpRelease, fpOwner } from '../../fp/fp';
import { fpArm, type FpArm } from '../../fp/hands';
import { hasUnlock, buyNode, researchNode, grantResearch } from '../../game/research';
import { itemDef } from '../../items/item';
import { punch } from '../../gfx/juice';
import type { Player } from '../../entities/player';
import type { QuestRuntime } from '../../missions/questRuntime';
import { buildWatchModel, setLamp, SCR_W, SCR_H, SCREEN, type WatchModel } from './model';
import { drawWatch, drawQuests, drawResearch, layoutBranch, PAL, type Zone } from './screen';
import { drawMap, drawScan, drawSig, drawBio, drawLog, drawNotes, drawTool, drawFab, contacts, type Contact } from './apps';
import { BRANCHES } from './nodes';
import { WatchLaser, WatchFab } from './tool';
import './nodes';
import './sounds';

export interface WatchFn { key: string; name: string; label: string; node: string | (() => boolean); draw: (s: Tube, w: Watch) => void }

/** every function the watch can run, in dock order; locked ones are simply absent */
export const FUNCTIONS: WatchFn[] = [
  { key: 'qst', name: 'QUESTS', label: 'QST', node: 'watch_quests', draw: drawQuests },
  { key: 'rnd', name: 'R&D UPLINK', label: 'R&D', node: 'watch_quests', draw: drawResearch },
  { key: 'map', name: 'CARTOGRAPHY', label: 'MAP', node: 'watch_map', draw: drawMap },
  { key: 'scan', name: 'ANOMALY SCAN', label: 'SCAN', node: 'watch_scan', draw: drawScan },
  { key: 'sig', name: 'SIGNAL TRACE', label: 'SIG', node: 'watch_signals', draw: drawSig },
  { key: 'stat', name: 'BIOMONITOR', label: 'BIO', node: 'watch_vitals', draw: drawBio },
  { key: 'log', name: 'LOGBOOK', label: 'LOG', node: 'watch_log', draw: drawLog },
  { key: 'note', name: 'FIELD NOTES', label: 'NOTE', node: 'watch_notes', draw: drawNotes },
  { key: 'tool', name: 'MULTI-TOOL', label: 'TOOL', node: () => hasUnlock('tool_torch') || hasUnlock('tool_laser') || hasUnlock('tool_beam'), draw: drawTool },
  { key: 'fab', name: 'FABRICATOR', label: 'FAB', node: 'tool_fab', draw: drawFab },
];
/** where a locked function is researched */
const NODE_OF: Record<string, string> = { map: 'watch_map', scan: 'watch_scan', sig: 'watch_signals', stat: 'watch_vitals', log: 'watch_log', note: 'watch_notes', tool: 'tool_torch', fab: 'tool_fab' };
const owned = (f: WatchFn) => (typeof f.node === 'string' ? hasUnlock(f.node) : f.node());

/** the live list of owned functions (the touch layer's strip reads it as the old scanner's PAGES) */
export const WATCH_PAGES: { key: string; name: string; label: string }[] = [];

/** the tube's bulge (src/gfx/crt.ts uCurv): clicks are warped the same way */
const CURV = 0.16;
/** canvas pixels per layout unit (sharper type on better hardware) */
const tubeScale = () => (G.pr?.quality === 'low' ? 1.25 : 1.5);

/** is this mesh part of the given arm (the hit test sees only the watch itself) */
function isArm(o: THREE.Object3D | null, arm: FpArm) { for (; o; o = o.parent) if (o === arm.root) return true; return false; }

export class Watch {
  // ---- the old scanner's surface (touch layer, creature menus, session hotkeys)
  open = false;
  page = 'qst';
  raise = 0;
  power = 0;
  st: Record<string, any> = { sel: 0, mapZoom: 3, freq: 77.7, dataTab: 0, qTab: 0, branch: 0, rSel: 0, bioTab: 0, clickZones: [] };
  healthOf: Player | null = null;
  scanTarget: (Contact & { c?: any }) | null = null;
  scanProgress = 0;
  // ---- the watch
  /** glance mode: small in the corner while you move (or a quick peek) */
  small = false;
  zoom = 0;
  peekKey: string | null = null;
  peekT = 0;
  threat: { n: number; d: number; rel: number; side: string } | null = null;
  pages = WATCH_PAGES;
  laser: WatchLaser;
  fab: WatchFab;
  /** last screen pixel clicked (for pages that need the exact spot) */
  lastHit: { x: number; y: number } | null = null;
  readonly model: WatchModel;
  readonly group: THREE.Group;
  /** the CRT (src/gfx/crt.ts) and the pen that writes on it */
  readonly crt: CrtScreen;
  readonly tv: Tube;
  private ray = new THREE.Raycaster();
  private drawT = 0;
  private staged = false;
  private still = 0;
  private moveT = 0;
  private slowT = 0;
  private pageSig = '';
  private skin = -1;
  private hitFx = 0;
  private knobKick = 0;
  /** the shared first-person arms: the watch arm and the finger that works the controls */
  private armL!: FpArm;
  private armR!: FpArm;
  private poke: { at: THREE.Vector3; from: THREE.Vector3; t: number } | null = null;
  private pokeQ = new THREE.Quaternion();
  private cine: 'full' | 'glance' = 'full';
  private lowerT = 0;
  private settleT = -1;
  private tubeWas = false;
  private typeT = 1;
  private rollT = 0;
  /** 1 while the wrist is up only for a peek (smaller, further off) */
  private peekMix = 0;
  private knobA = 0;
  private needleA = 0;
  private glow: THREE.PointLight;
  private v3 = new THREE.Vector3();
  private v2 = new THREE.Vector2();

  constructor() {
    const k = tubeScale();
    this.crt = crtScreen(SCREEN.w, SCREEN.h, { res: [Math.round(SCR_W * k), Math.round(SCR_H * k)], curvature: CURV, tint: 0xffffff, scan: 0.45, mask: 0.1, glow: 0.45, noise: 0.025, flicker: 0.35, vignette: 0.8, reflect: 0.3, bulge: 0.0022 });
    this.crt.power(false, true);
    (this.crt.mat.uniforms.uRes.value as THREE.Vector2).set(SCR_W * 0.62, SCR_H * 0.62);
    this.tv = new Tube(this.crt.ctx, SCR_W, SCR_H, k);
    fontsReady().then(() => { this.tv.fontsOk = true; this.drawT = 0; });
    // the shared smooth arms (src/fp/hands.ts): the left one wears the watch, the right one presses its keys
    this.armL = fpArm('left', { skin: 0xe8b98f, sleeve: 0xeeb415, sleeveStyle: 'rolled' });
    this.armR = fpArm('right', { skin: 0xe8b98f, sleeve: 0xeeb415, sleeveStyle: 'long' });
    this.model = buildWatchModel(this.crt.mesh, this.armL);
    this.group = fpGroup('watch');
    this.group.add(this.model.root);
    this.armR.root.visible = false;
    this.group.add(this.armR.root);
    this.glow = new THREE.PointLight(0x7cff6a, 0, 0.25, 2);
    this.group.add(this.glow);
    // the overlay stage's shared lights (other first-person views rely on them too)
    const os = G.pr.overlayScene;
    if (!os.userData.fpLit) {
      os.userData.fpLit = true;
      os.add(new THREE.AmbientLight(0xd8dcc8, 0.55));
      const key = new THREE.DirectionalLight(0xfff0d8, 1.25); key.position.set(-0.6, 1.2, 1.0); os.add(key);
      const rim = new THREE.DirectionalLight(0x6a8aff, 0.35); rim.position.set(1, -0.3, -0.5); os.add(rim);
    }
    this.laser = new WatchLaser();
    this.fab = new WatchFab();
    G.ui.scanner = this;
    G.watch = this;
    this.syncPages(true);
    // runs as its own system (the UI's per-frame call is kept as a no-op for older callers)
    G.addSystem({ name: 'watch', update: (dt: number) => this.frame(dt) });
    window.addEventListener('mousedown', (e) => this.onMouse(e), true);
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.laser.holding = false; }, true);
    window.addEventListener('wheel', (e) => this.onWheel(e), { capture: true, passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    bus.on('fpLost', (name: string) => { if (name === 'watch') { this.staged = false; this.open = false; this.peekKey = null; this.raise = 0; if (G.local) G.local.scannerOpen = false; } });
    bus.on('researchUnlocked', (key: string) => this.onUnlocked(key));
    bus.on('ruleLearned', (r: { name?: string; species?: string }) => this.message('RULE LEARNED', `${r?.species ?? ''}: ${r?.name ?? ''}`, 'rp', 3.5, hasUnlock('watch_notes')));
    bus.on('research', (e: { n: number; reason: string }) => { const why = String(e?.reason || ''); if (e?.n > 0 && !/^(quest|node):/.test(why)) this.message(`+${e.n} RP`, /^scan/.test(why) ? 'SCAN DATA FILED' : 'RESEARCH CREDIT', 'rp', 2.4); });
  }

  get quests(): QuestRuntime | null { return G.missions?.quests ?? null; }
  fn(): WatchFn | undefined { return FUNCTIONS.find((f) => f.key === this.page); }
  hasFn(key: string) { const f = FUNCTIONS.find((q) => q.key === key); return !!f && owned(f); }

  // ================================================================ control
  /** raise or lower the wrist (Tab); page opens a function (locked → the R&D node that unlocks it) */
  toggle(v?: boolean, page?: string) {
    const want = v ?? !this.open;
    const p = G.local;
    if (want && p && !this.wearing(p)) { bus.emit('think', p, 'My wrist is bare. No watch, no quests.'); return; }
    if (page) this.goto(page);
    if (want === this.open) return;
    if (want && fpOwner() && fpOwner() !== 'watch' && !fpClaim('watch', 1, { cinematic: this.still >= 0.3 ? 'full' : 'glance' })) return;
    if (want && this.staged) this.cine = 'glance'; // re-cut to full once it is up (from a peek)
    this.open = want;
    this.peekKey = null;
    if (p) p.scannerOpen = want;
    G.audio?.ui?.(want ? 'watchUp' : 'watchDown', 0.5);
    if (want) { this.drawT = 0; this.quests && (G.missions.unread = false); }
    else { this.healthOf = null; this.laser.holding = false; G.input.pointerOverUI = false; }
  }
  /** a function by key; a locked one opens the R&D tree on the node that unlocks it */
  goto(page: string) {
    const f = FUNCTIONS.find((q) => q.key === page);
    if (f && owned(f)) { if (this.page !== page) { this.page = page; this.st.sel = 0; this.st.qOpen = null; } return; }
    const node = NODE_OF[page];
    this.page = 'rnd';
    if (node) this.selectNode(node);
    if (G.local && this.open) bus.emit('think', G.local, `My watch can't do that yet. ${researchNode(node || '')?.title || 'Research'} is on the R&D uplink.`);
  }
  press(page: string) {
    const was = this.page;
    this.goto(page);
    G.audio?.ui?.('watchTick', 0.45);
    if (this.page !== was) { this.rollT = 1; this.typeT = Math.min(this.typeT, 0.4); this.knobKick = 1; G.audio?.ui?.('dial', 0.4); }
    this.drawT = 0;
  }
  cycle(dir: number) {
    const i = this.pages.findIndex((p) => p.key === this.page);
    const n = this.pages.length; if (!n) return;
    this.press(this.pages[(i + dir + n) % n].key);
  }
  selectNode(key: string) {
    const n = researchNode(key); if (!n) return;
    const bi = BRANCHES.findIndex((b) => b.key === n.branch);
    if (bi >= 0) this.st.branch = bi;
    const laid = layoutBranch(n.branch);
    const i = laid.findIndex((l) => l.n.key === key);
    if (i >= 0) this.st.rSel = i;
  }
  /** the wheel / swipe / arrow keys: select, tune, zoom, scroll */
  turnDial(dir: number) {
    const st = this.st;
    G.audio?.ui?.('watchTick', 0.25);
    switch (this.page) {
      case 'sig': st.freq = clamp(Math.round((st.freq + dir * 0.1) * 10) / 10, 60, 140); break;
      case 'map': st.mapZoom = clamp(st.mapZoom + (dir > 0 ? -1 : 1), 1, 4); break;
      case 'qst': if (st.qOpen) st.dScroll = clamp((st.dScroll ?? 0) + dir, 0, st.dMax ?? 0); else st.sel = (st.sel ?? 0) + dir; break;
      case 'rnd': st.rSel = (st.rSel ?? 0) + dir; break;
      default: st.sel = Math.max(0, (st.sel ?? 0) + dir); break;
    }
    this.drawT = 0;
  }
  /** left / right: sub-tabs */
  turnTab(dir: number) {
    const st = this.st;
    if (this.page === 'qst') { if (st.qOpen) { st.qOpen = null; return; } st.qTab = ((st.qTab ?? 0) + dir + 3) % 3; st.sel = 0; }
    else if (this.page === 'rnd') { st.branch = ((st.branch ?? 0) + dir + BRANCHES.length) % BRANCHES.length; st.rSel = 0; }
    else if (this.page === 'stat') st.bioTab = ((st.bioTab ?? 0) + dir + 3) % 3;
    else if (this.page === 'log') st.dataTab = ((st.dataTab ?? 0) + dir + 3) % 3;
    else this.cycle(dir);
    G.audio?.ui?.('watchTick', 0.35);
    this.drawT = 0;
  }
  /** Enter: the obvious action on the page */
  activate() {
    const st = this.st, Q = this.quests;
    if (this.page === 'qst' && Q) {
      if (!st.qOpen) { if (st.qHover) this.openQuest(st.qHover); return; }
      const v = Q.view(st.qOpen); if (!v) return;
      if (v.status === 'off' || v.status === 'decl') this.questAct(v.key, 'accept');
      else if (v.status === 'ready') this.questAct(v.key, 'pay');
      else if (v.status === 'act') Q.track(v.key);
    } else if (this.page === 'rnd') {
      const br = BRANCHES[((st.branch ?? 0) % BRANCHES.length + BRANCHES.length) % BRANCHES.length];
      const laid = layoutBranch(br.key);
      if (laid.length) this.buyResearch(laid[((st.rSel ?? 0) % laid.length + laid.length) % laid.length].n.key);
    } else if (this.page === 'fab') {
      const list = this.fab.list(); if (list.length) this.fab.craft(list[((st.sel % list.length) + list.length) % list.length]);
    }
    this.drawT = 0;
  }
  openQuest(k: string) { this.st.qOpen = k; this.st.dScroll = 0; this.quests?.fresh.delete(k); G.audio?.ui?.('watchTick', 0.4); }
  questAct(k: string, act: 'accept' | 'decline' | 'pay' | 'abandon') {
    const err = this.quests?.request(k, act);
    if (err) { G.audio?.ui?.('watchDeny'); this.message('CANNOT ' + act.toUpperCase(), err, 'warn', 2.5); this.hitFx = 0.6; return; }
    G.audio?.ui?.(act === 'pay' ? 'hopper_tally' : 'watchTick', 0.5);
    if (act === 'accept') { this.quests?.track(k); punch(0.02); }
    if (act === 'decline' || act === 'abandon') this.st.qOpen = null;
    this.hitFx = 0.4;
  }
  buyResearch(key: string) {
    if (!buyNode(key)) { G.audio?.ui?.('watchDeny'); this.hitFx = 0.5; this.st.denyT = G.time; return; }
    punch(0.03);
    this.hitFx = 1;
  }

  // ================================================================ API for other systems
  /** 'active' | 'ready' | 'done' | 'offered' | 'declined' | '' */
  questStatus(k: string): string {
    const Q = this.quests, s = Q?.status(k);
    if (!Q || !s) return '';
    if (s === 'done' || (Q.completed(k) && s !== 'act' && s !== 'ready')) return 'done';
    return s === 'act' ? 'active' : s === 'ready' ? 'ready' : s === 'off' ? 'offered' : 'declined';
  }
  /** take a job someone handed you in person (tribe job boards): straight onto the watch */
  acceptQuest(k: string): boolean {
    const err = this.quests?.request(k, 'accept');
    if (err) { G.audio?.ui?.('watchDeny'); return false; }
    this.quests?.track(k);
    return true;
  }
  /** open the R&D tree on a branch / node (build mode's locked blueprints) */
  openResearch(branch?: string, node?: string) {
    this.toggle(true);
    this.page = 'rnd'; this.st.qOpen = null;
    if (node) this.selectNode(node);
    else if (branch) { const bi = BRANCHES.findIndex((b) => b.key === branch); if (bi >= 0) { this.st.branch = bi; this.st.rSel = 0; } }
  }
  /** an incoming call or message (the intro's Voss): LEDs, a chime and a glance */
  signal(e: { from?: string; kind?: string; text?: string }) {
    this.st.signal = { from: e?.from || 'UNKNOWN', text: e?.text || 'INCOMING', t: G.time };
    G.audio?.ui?.('questChime', 0.5);
    this.hitFx = 0.8;
    const p = G.local;
    if (p && !this.open && (!fpOwner() || fpOwner() === 'watch')) { this.peekKey = '__signal'; this.peekT = 3.5; }
  }

  // ================================================================ notifications
  /** a teletype line on the CRT (on the glance when the wrist is down: it comes up to show it) */
  msgs: { title: string; body: string; tone: 'ok' | 'warn' | 'rp'; until: number }[] = [];
  message(title: string, body = '', tone: 'ok' | 'warn' | 'rp' = 'ok', secs = 3, raise = false) {
    this.msgs.push({ title: String(title).toUpperCase(), body: String(body).toUpperCase(), tone, until: G.time + secs });
    if (this.msgs.length > 4) this.msgs.shift();
    this.drawT = 0;
    const p = G.local;
    if (raise && p && !this.open && !this.peekKey && this.wearing(p) && !p.body.dead && (!fpOwner() || fpOwner() === 'watch')) { this.peekKey = '__msg'; this.peekT = secs; }
  }
  /** the message showing now (oldest first) */
  currentMsg() { while (this.msgs.length && this.msgs[0].until < G.time) this.msgs.shift(); return this.msgs[0] || null; }
  /** a quest arrived / is ready / finished: chime is the runtime's; the wrist comes up for a glance */
  notify(k: string, kind: 'offer' | 'ready' | 'done') {
    this.syncPages();
    const p = G.local;
    if (!p || !this.wearing(p) || p.body.dead) return;
    if (this.open && !this.small) return;
    if (fpOwner() && fpOwner() !== 'watch') return;
    this.peekKey = k; this.peekT = kind === 'done' ? 3.2 : 4.2;
  }
  private onUnlocked(key: string) {
    this.syncPages();
    const n = researchNode(key);
    G.audio?.ui?.('nodeUnlock', 0.55);
    this.message('FUNCTION UPLOADED', n?.title || key, 'rp', 3.5, true);
    this.hitFx = 1;
    if (key === 'tool_torch') this.hookTorch(true);
  }

  // ================================================================ scanning (ANOMALY SCAN)
  scanRange() { return hasUnlock('tool_beam') ? 40 : 24; }
  showHealthOf(p: Player) { this.healthOf = p === G.local ? null : p; this.toggle(true, 'stat'); }
  studyItem(it: any) { this.st.study = it; this.toggle(true, 'log'); }
  scanCreature(c: any) {
    if (!hasUnlock('watch_scan')) { this.toggle(true, 'scan'); return; }
    this.scanTarget = { x: c.x, z: c.z, kind: 'creature', c }; this.scanProgress = 0;
    this.toggle(true, 'scan');
  }
  scanAnomaly(ct: Contact) { if (!hasUnlock('watch_scan') || !ct.id) return; this.scanTarget = ct; this.scanProgress = 0; G.audio?.ui?.('watchTick'); }
  /** anomalies the crew has logged (mission flags, replicated) */
  get logged(): Set<string> {
    const out = new Set<string>();
    for (const f of G.missions?.flags || []) if (f.startsWith('anom:')) out.add(f.slice(5));
    return out;
  }
  private updateScan(dt: number, p: Player) {
    const t = this.scanTarget; if (!t) return;
    const beam = hasUnlock('tool_beam');
    const tx = t.c ? t.c.x : t.x, tz = t.c ? t.c.z : t.z;
    const d = Math.hypot(tx - p.x, tz - p.z);
    const gone = t.c ? (t.c.dead || t.c.zoneKey !== p.zoneKey) : false;
    if (gone || d > (beam ? 36 : 18)) this.scanProgress = Math.max(0, this.scanProgress - dt);
    else {
      this.scanProgress += dt / (t.kind === 'anomaly' ? 1.8 : 2.6) * (beam ? 2 : 1);
      if (beam) this.laser.fire('scan', { x: tx, y: (t.c ? 0.9 : 0.15) + (p.y ?? 0), z: tz }, dt);
    }
    if (this.scanProgress < 1) return;
    this.scanTarget = null;
    G.audio?.ui?.('scanDone');
    if (t.c) {
      // the scan pipeline (src/scan, G.scan) hears 'scanned' and pays DATA and RP for firsts
      const c = t.c, first = !G.missions?.flags?.has('scan:' + c.sp.key);
      c.scanned = true;
      G.missions?.onScan?.(c);
      bus.emit('scanned', c);
      this.st.lastScanned = c.sp.code?.split('//')[0]?.trim() || c.sp.name;
      if (first && !(G as any).scan) grantResearch(2, 'scan:' + c.sp.key);
    } else if (t.id) {
      G.missions?.set?.('anom:' + t.id);
      bus.emit('anomalyLogged', t.id);
      if (t.it) { const d = itemDef(t.it.key); (G as any).scan?.complete?.({ kind: 'item', key: t.it.key, title: d.name, cls: 'Anomalous object', notes: d.desc ? [d.desc] : [], x: t.x, y: 0, z: t.z }); }
      this.st.lastScanned = 'ANOMALY ' + (t.it ? itemDef(t.it.key).name.toUpperCase() : '');
      grantResearch(1, 'scan:anomaly');
    }
  }

  // ================================================================ multi-tool: torch
  torchOwned() { const p = G.local; return !!p && !!p.lightItem && p.lightItem === p.worn.get('wrist' as any); }
  toggleTorch() { const p = G.local; if (!p) return; this.hookTorch(true); if (this.torchOwned()) { p.flashlightOn = !p.flashlightOn; G.audio?.ui?.('watchTick'); } }
  /** with the WRIST TORCH researched and no other light, the band itself is the light (F toggles it) */
  private hookTorch(force = false) {
    const p = G.local; if (!p || !hasUnlock('tool_torch')) return;
    const band = p.worn.get('wrist' as any);
    if (!band) return;
    const other = p.findItem((it: any, d: any) => !!d.light && (it.uses ?? 1) > 0);
    if (!p.lightItem && (!other || force)) p.lightItem = band;
    else if (p.lightItem === band && other && !p.flashlightOn) p.lightItem = null;
  }

  // ================================================================ input
  wearing(p: Player) {
    if (!G.missions?.enabled) return true;
    const st = G.band?.get?.(p.id);
    return st === 'armed' || st === 'none' || !!p.worn.get('wrist' as any);
  }
  private interactive() { return this.open && this.raise > 0.7 && !this.small; }
  private onMouse(e: MouseEvent) {
    if (!this.open || this.raise < 0.6) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    if (hit) {
      e.stopPropagation(); e.preventDefault();
      this.physical(hit, e.button === 2 ? -1 : 1);
      return;
    }
    // armed multi-tool: the click goes into the world as a beam
    if (e.button === 0 && this.laser.armed && !G.input.pointerOverUI) {
      e.stopPropagation(); e.preventDefault();
      this.laser.holding = true;
    }
  }
  private onWheel(e: WheelEvent) {
    if (!this.open || this.raise < 0.6 || this.small) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    e.stopPropagation(); e.preventDefault();
    // the wheel over the function dial turns it; anywhere else on the watch it scrolls the page
    if (hit.kind === 'dial') this.cycle(Math.sign(e.deltaY));
    else this.turnDial(Math.sign(e.deltaY));
  }
  /** a click / tap on the watch itself: the CRT, the function dial, a toggle switch */
  private physical(hit: NonNullable<ReturnType<Watch['hitTest']>>, dir: number) {
    if (hit.point && !this.small && hit.kind !== 'body') this.reach(hit.point);
    if (hit.kind === 'dial') { this.cycle(dir); this.knobKick = dir; return; }
    if (hit.kind === 'toggle') {
      if (hit.page === 'torch') { if (hasUnlock('tool_torch')) this.toggleTorch(); else { G.audio?.ui?.('watchDeny'); this.message('NO LAMP FITTED', 'RESEARCH WRIST TORCH', 'warn'); } }
      else if (hasUnlock('tool_laser')) this.laser.arm(!this.laser.armed);
      else { G.audio?.ui?.('watchDeny'); this.message('NO EMITTER FITTED', 'RESEARCH LASER CUTTER', 'warn'); }
      G.audio?.ui?.('watchTick', 0.6);
      return;
    }
    if (hit.kind === 'screen' && !this.small) this.screenClick(hit.u!, hit.v!);
    else if (this.small) this.still = 1; // a click on the glance: hold still to read
  }
  private onKey(e: KeyboardEvent) {
    if (!this.interactive() || G.input.textFocus || e.repeat && !e.code.startsWith('Arrow')) return;
    const c = e.code;
    let used = true;
    if (c === 'ArrowUp') this.turnDial(-1);
    else if (c === 'ArrowDown') this.turnDial(1);
    else if (c === 'ArrowLeft') this.turnTab(-1);
    else if (c === 'ArrowRight') this.turnTab(1);
    else if (c === 'Enter' || c === 'NumpadEnter') this.activate();
    else if (c === 'Backspace') { if (this.st.qOpen) this.st.qOpen = null; else used = false; }
    else if (c === 'BracketLeft') this.cycle(-1);
    else if (c === 'BracketRight') this.cycle(1);
    else if (/^Digit[1-9]$/.test(c)) { const pg = this.pages[Number(c.slice(5)) - 1]; if (pg) this.press(pg.key); }
    else used = false;
    if (used) { e.stopPropagation(); e.preventDefault(); this.drawT = 0; }
  }

  /** a touch tap at CSS coords (the touch layer calls this); true when it landed on the watch */
  tapAt(cssX: number, cssY: number): boolean {
    if (!this.open || this.raise < 0.6) return false;
    const hit = this.hitTest(cssX, cssY);
    if (!hit) return false;
    this.physical(hit, 1);
    return true;
  }
  /** overlay-space point to CSS pixels */
  toCss(v: THREE.Vector3): { x: number; y: number } {
    const pr = G.pr;
    const RW = pr.lowW + pr.margin * 2, RH = pr.lowH + pr.margin * 2;
    const n = v.clone().project(pr.overlayCamera);
    const lx = (n.x + 1) / 2 * RW, ly = (n.y + 1) / 2 * RH;
    return { x: (lx - pr.margin) * pr.scale / pr.dpr, y: window.innerHeight - (ly - pr.margin) * pr.scale / pr.dpr };
  }
  /** where the raised watch sits on screen, in CSS pixels (null while lowered) */
  deviceRect(): { left: number; top: number; right: number; bottom: number } | null {
    if (this.raise < 0.05) return null;
    this.group.updateMatrixWorld(true);
    const s = this.model.screen;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const hw = SCREEN.w / 2 + 0.012, hh = SCREEN.h / 2 + 0.012;
    for (const [x, y] of [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]]) {
      const c = this.toCss(s.localToWorld(this.v3.set(x, y, 0)));
      left = Math.min(left, c.x); right = Math.max(right, c.x); top = Math.min(top, c.y); bottom = Math.max(bottom, c.y);
    }
    return { left, top, right, bottom };
  }
  hitTest(cssX: number, cssY: number): { kind: 'screen' | 'body' | 'dial' | 'toggle' | 'button'; page?: string; u?: number; v?: number; point?: THREE.Vector3 } | null {
    if (this.raise < 0.05) return null;
    const pr = G.pr;
    const RW = pr.lowW + pr.margin * 2, RH = pr.lowH + pr.margin * 2;
    const lx = cssX * pr.dpr / pr.scale + pr.margin, ly = (window.innerHeight - cssY) * pr.dpr / pr.scale + pr.margin;
    this.v2.set(lx / RW * 2 - 1, ly / RH * 2 - 1);
    this.group.updateMatrixWorld(true);
    this.ray.setFromCamera(this.v2, pr.overlayCamera);
    const hits = this.ray.intersectObject(this.model.root, true).filter((x) => !isArm(x.object, this.armL));
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object === this.model.screen && h.uv) return { kind: 'screen', u: h.uv.x, v: 1 - h.uv.y, point: h.point };
    for (let o: THREE.Object3D | null = h.object; o && o !== this.model.root; o = o.parent) {
      if (o.userData.hit === 'dial') return { kind: 'dial', point: h.point };
      if (o.userData.hit === 'toggle') return { kind: 'toggle', page: o.userData.which, point: h.point };
    }
    return { kind: 'body', point: h.point };
  }
  private screenClick(u: number, v: number) {
    // the same barrel warp as the tube shader, so a click lands on what it shows
    let cu = u * 2 - 1, cv = v * 2 - 1;
    const ou = Math.abs(cv) * CURV, ov = Math.abs(cu) * CURV;
    cu += cu * ou * ou; cv += cv * ov * ov;
    const x = Math.floor((cu * 0.5 + 0.5) * SCR_W), y = Math.floor((cv * 0.5 + 0.5) * SCR_H);
    this.lastHit = { x, y };
    const zones: Zone[] = this.st.clickZones || [];
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) { G.audio?.ui?.('watchTick', 0.4); z.fn(); this.drawT = 0; return; }
    }
  }

  /** the UI still calls this every frame (the scanner's old hook); the watch's own system does the work */
  update(_dt: number) { /* see frame() */ }

  // ================================================================ per frame
  frame(dt: number) {
    const p = G.local;
    if (!p) return;
    this.syncPages();
    this.slowT -= dt;
    if (this.slowT <= 0) { this.slowT = 0.5; this.slowTick(p); }
    this.laser.update(dt);
    if (this.laser.holding && this.laser.armed) this.laser.holdAt(dt);
    this.updateScan(dt, p);
    if (this.peekT > 0) { this.peekT -= dt; if (this.peekT <= 0) this.peekKey = null; }
    if (this.open && (p.body.dead || !this.wearing(p))) this.toggle(false);
    // still or moving: hysteresis so a step does not flip the view
    const moving = p.speed > 0.35 || !!p.running || !!p.inVehicle;
    if (moving) { this.moveT += dt; if (this.moveT > 0.12) this.still = 0; }
    else { this.moveT = 0; this.still += dt; }
    this.small = !!this.peekKey && !this.open || (this.open && this.still < 0.3);
    const up = this.open || !!this.peekKey;
    // hovering the device blocks world clicks
    if (this.open && this.raise > 0.5) {
      if (this.hitTest(G.input.mouseX, G.input.mouseY)) G.input.pointerOverUI = true;
      else if (!G.ui.inventory?.open && !G.ui.menuEl) G.input.pointerOverUI = false;
    }
    // ---- the cut: claim the stage (full on Tab while standing, a glance on the move or for a peek)
    const cine = this.open && !this.small ? 'full' : 'glance';
    if (up && !this.staged) {
      this.staged = fpClaim('watch', 1, { cinematic: cine });
      if (!this.staged) { this.open = false; this.peekKey = null; p.scannerOpen = false; return; }
      this.cine = cine; this.raise = 0; this.settleT = -1;
    } else if (up && this.staged && cine !== this.cine && this.raise > 0.9) { fpClaim('watch', 1, { cinematic: cine }); this.cine = cine; }
    // ---- the arm: up in ~0.45 s with weight; down after the tube has collapsed to a dot
    if (up) { this.lowerT = 0.14; this.raise = Math.min(1, this.raise + dt / 0.45); }
    else if (this.lowerT > 0) this.lowerT -= dt;
    else this.raise = Math.max(0, this.raise - dt / 0.26);
    if (this.raise >= 1 && this.settleT < 0) this.settleT = 0;
    if (this.settleT >= 0) this.settleT += dt;
    // (lowered, it simply starts from the right pose)
    if (this.raise < 0.05) this.zoom = this.small ? 0 : 1;
    this.zoom = damp(this.zoom, this.small ? 0 : 1, 7, dt);
    // (held while it lowers again, so a peek drops away where it came up)
    if (this.open) this.peekMix = damp(this.peekMix, 0, 9, dt);
    else if (this.peekKey) this.peekMix = this.raise < 0.05 ? 1 : damp(this.peekMix, 1, 9, dt);
    // ---- the tube: relay click and hum as it comes up; collapses to a dot first when lowered
    const tubeOn = up && this.raise > 0.55;
    if (tubeOn !== this.tubeWas) {
      this.tubeWas = tubeOn;
      this.crt.power(tubeOn);
      G.audio?.ui?.(tubeOn ? 'crtOn' : 'crtOff', 0.45);
      if (tubeOn) { this.typeT = 0; this.drawT = 0; }
    }
    this.power = this.crt.mat.crt.on;
    if (this.raise <= 0 && !up && this.staged) { this.staged = false; fpRelease('watch'); }
    if (!this.staged) return;
    if (this.skin !== p.app.skin) { this.skin = p.app.skin; this.armL.setLook({ skin: p.app.skin }); this.armR.setLook({ skin: p.app.skin }); }
    this.pose(p, dt);
    this.updateControls(p, dt);
    const u = this.crt.mat.uniforms;
    u.uNoise.value = 0.03 + Math.max(G.collapse * 0.12, p.body.corruption > 30 ? 0.08 : 0);
    this.hitFx = Math.max(0, this.hitFx - dt * 3);
    this.glow.intensity = 0.0006 * this.power;
    this.typeT = Math.min(1, this.typeT + dt / 0.38);
    this.rollT = Math.max(0, this.rollT - dt * 4.5);
    // redraw at ~15 fps (the tube animates itself in between), faster while it types on or rolls
    this.drawT -= dt;
    if (this.drawT <= 0 && this.power > 0.02) {
      this.drawT = this.typeT < 1 || this.rollT > 0 ? 1 / 30 : 1 / 15;
      this.paint();
    }
  }

  /** draw a frame onto the tube: the page, then the entrance effects (focus pull, type-on, vertical roll) */
  private paint() {
    const tv = this.tv, g = tv.ctx;
    const focus = clamp((this.raise - 0.55) / 0.45, 0, 1);
    const roll = this.rollT * this.rollT;
    g.save();
    if (focus < 1 && 'filter' in g) g.filter = `blur(${((1 - focus) * 2.2 * tv.k).toFixed(2)}px)`;
    if (roll > 0) g.translate(0, -roll * SCR_H * 0.45);
    drawWatch(tv, this);
    g.restore();
    if (roll > 0) {
      // the frame slips: the next one rolls up from below past a bright retrace line
      const y = SCR_H * (1 - roll * 0.45);
      tv.rect(0, y, SCR_W, SCR_H - y, PAL.BG);
      tv.rect(0, y, SCR_W, 2, PAL.HI);
    }
    if (this.typeT < 1) {
      // type-on: rows appear top to bottom behind a block cursor
      const y = Math.floor(this.typeT * (SCR_H + 9));
      if (y < SCR_H) tv.rect(0, y, SCR_W, SCR_H - y, PAL.BG);
      if (Math.floor(G.time * 12) % 2 === 0) tv.rect(3 + ((y * 7) % (SCR_W - 12)), Math.min(SCR_H - 8, y), 5, 7, PAL.HI);
    }
    tv.wash(PAL.HI, this.hitFx * 0.12);
    this.crt.flush();
  }

  /** place the wrist: the full close-up (the tube fills most of the view) or the small glance, raised from below */
  private pose(p: Player, dt: number) {
    const pr = G.pr, cam = pr.overlayCamera;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // full: the tube about 62% of the view's height, the case's control column still in frame
    const d1 = Math.max(SCREEN.h / (2 * tanH * 0.62), 0.106 / (2 * tanH * cam.aspect));
    const halfH = d1 * tanH;
    const fx = -0.0157, fy = -0.001, fz = -d1;
    // away from the face: held up on the move (Tab while walking), or a quick glance at the right
    // edge when something lands by itself (a peek). Both tilt toward the eye with the forearm
    // running steeply off the bottom edge, clear of the body HUD along the bottom.
    const pm = this.peekMix;
    const d2 = d1 * (2.8 + 1.6 * pm), h2 = d2 * tanH, w2 = h2 * cam.aspect;
    const sx = w2 * (0.56 + 0.18 * pm), sy = -h2 * (0.1 + 0.04 * pm), sz = -d2;
    const k = this.zoom, e = k * k * (3 - 2 * k);
    let x = sx + (fx - sx) * e, y = sy + (fy - sy) * e, z = sz + (fz - sz) * e;
    let rx = -(0.28 + 0.06 * pm) * (1 - e), ry = -(0.36 + 0.2 * pm) * (1 - e), rz = (0.62 + 0.3 * pm) * (1 - e);
    // raise from below with a little overshoot
    const r = this.raise, c1 = 1.5, back = 1 + (c1 + 1) * Math.pow(r - 1, 3) + c1 * Math.pow(r - 1, 2);
    const lift = (1 - back) * (halfH * 1.6);
    // the wrist turns to face you on the way up
    const turn = 1 - Math.min(1, back);
    y -= lift; rx -= (1 - r) * 0.9 + turn * 0.2; ry += turn * 0.55; rz += (1 - r) * 0.3;
    // and settles with a little weight when it arrives
    if (this.settleT >= 0 && this.settleT < 1.2) {
      const k2 = Math.exp(-this.settleT * 7);
      rz += Math.sin(this.settleT * 22) * 0.03 * k2;
      y += Math.sin(this.settleT * 19) * 0.0018 * k2;
    }
    // fingers flex as the arm comes up, then rest
    this.armL.pose(r < 0.75 ? 'open' : 'relaxed');
    this.armL.wrist.rotation.x = -0.25 * (1 - r) + Math.sin(Math.min(1, r) * Math.PI) * 0.12;
    this.armL.tremor = clamp((p.body.panic ?? 0) / 100, 0, 1);
    this.armL.update(dt);
    this.updatePoke(dt);
    // breathing at rest, swinging when you walk or run
    const moving = p.speed > 0.2;
    const amp = moving ? (p.running ? 2.2 : 1) : 0.15;
    y += Math.abs(Math.sin(G.time * (p.running ? 9 : moving ? 7 : 1.6))) * 0.004 * amp;
    x += Math.sin(G.time * (p.running ? 4.5 : moving ? 3.5 : 0.8)) * 0.003 * amp;
    rz += Math.sin(G.time * 3.5) * 0.02 * amp;
    rx += Math.sin(G.time * 1.3) * 0.006 * amp;
    // the band moves to the right arm when the left forearm is gone: mirror the wrist (not the LCD)
    const sev: string[] = (p.body as any).severed || [];
    const side = sev.includes('farm_l') || sev.includes('uarm_l') ? -1 : 1;
    const handGone = side > 0 ? sev.includes('hand_l') : sev.includes('hand_r');
    this.armL.palm.visible = !handGone; this.model.stump.visible = handGone;
    const root = this.model.root;
    root.scale.x = side; this.model.screen.scale.x = side;
    if (side < 0) { rz = -rz; ry = -ry; }
    root.rotation.set(rx, ry, rz);
    // the rotation pivots on the screen centre
    this.v3.set(SCREEN.x * side, SCREEN.y, SCREEN.z).applyEuler(root.rotation);
    root.position.set(x - this.v3.x, y - this.v3.y, z - this.v3.z);
    this.glow.position.set(x, y, z + 0.03);
    // modules follow research
    const m = this.model.mods;
    m.torch.visible = hasUnlock('tool_torch');
    m.laser.visible = hasUnlock('tool_laser');
    m.dish.visible = hasUnlock('tool_beam') || hasUnlock('watch_signals');
    m.fab.visible = hasUnlock('tool_fab');
    m.cell.visible = hasUnlock('tool_cell');
    this.model.antenna.rotation.y += dt * (hasUnlock('watch_radar') ? 4 : 0);
    m.dish.rotation.y += dt * (this.scanTarget ? 9 : 1.2);
    void w2;
  }

  /** the right hand comes in and presses where you clicked (the finger lands a beat after the click) */
  private reach(at: THREE.Vector3) {
    // in from the lower right, toward the eye, the forefinger leading
    const from = at.clone().add(new THREE.Vector3(0.16, -0.2, 0.1));
    const dir = at.clone().sub(from).normalize();
    const palm = new THREE.Vector3(-0.25, -1, -0.7);
    palm.sub(dir.clone().multiplyScalar(palm.dot(dir))).normalize();
    const x = new THREE.Vector3().crossVectors(dir, palm);
    this.pokeQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir, palm));
    this.poke = { at: at.clone(), from, t: 0 };
    this.armR.pose('point');
    this.armR.root.visible = true;
  }
  private updatePoke(dt: number) {
    const pk = this.poke, R = this.armR;
    if (!pk) { R.root.visible = false; return; }
    pk.t += dt;
    const IN = 0.13, HOLD = 0.09, OUT = 0.2;
    const t = pk.t;
    if (t > IN + HOLD + OUT) { this.poke = null; R.root.visible = false; R.pose('relaxed', true); return; }
    // how far along the approach: ease in, a small push past the surface, ease back out
    const k = t < IN ? 1 - Math.pow(1 - t / IN, 3) : t < IN + HOLD ? 1 + 0.02 * Math.sin(((t - IN) / HOLD) * Math.PI) : 1 - Math.pow((t - IN - HOLD) / OUT, 2);
    R.root.quaternion.copy(this.pokeQ);
    R.root.position.set(0, 0, 0);
    R.update(dt);
    R.root.updateMatrixWorld(true);
    const tip = R.tip.getWorldPosition(this.v3);
    // the tip (not the elbow) travels from far off to the point
    const goal = pk.from.clone().lerp(pk.at, k);
    R.root.position.copy(goal.sub(tip));
  }

  /** jewel lamps, the function dial's detents, the needle, the toggles, the valves */
  private updateControls(p: Player, dt: number) {
    const m = this.model, L = m.lamps;
    setLamp(L.power, this.power > 0.5 ? 0x3cb040 : 0x000000);
    const danger = !!this.threat || (G.survival?.threat ?? 0) > 0.2 || p.body.bleedRate() > 0.05;
    setLamp(L.alert, danger && Math.sin(G.time * 10) > 0 ? 0xc02810 : 0x000000);
    const fresh = !!this.quests?.fresh.size && Math.sin(G.time * 5) > 0;
    setLamp(L.signal, fresh || ((this.st.sigStrength ?? 0) > 0.3 && Math.sin(G.time * 12) > 0) ? 0xc08018 : 0x000000);
    // the function dial clicks round to the current function's detent
    const i = Math.max(0, this.pages.findIndex((q) => q.key === this.page));
    const target = -i * (Math.PI * 1.5 / 8) + Math.PI * 0.75;
    this.knobA = damp(this.knobA, target, 14, dt);
    m.knob.rotation.z = this.knobA + Math.sin(G.time * 60) * 0.02 * Math.abs(this.knobKick);
    this.knobKick = damp(this.knobKick, 0, 10, dt);
    // the needle: the multi-tool's charge, else the uplink's carrier (busy when something is new)
    const want = this.laser.can('cut') ? this.laser.charge / this.laser.capacity()
      : clamp(0.35 + (this.quests?.fresh.size ? 0.4 : 0) + (this.st.sigStrength ?? 0) * 0.3 + Math.sin(G.time * 1.7) * 0.04, 0, 1);
    this.needleA = damp(this.needleA, want, 5, dt);
    m.needle.rotation.z = 1.9 - this.needleA * 3.8 + (Math.random() - 0.5) * 0.02;
    // toggles flick toward you when on
    const on = (v: boolean) => (v ? 0.55 : -0.55);
    m.toggles.torch.rotation.x = damp(m.toggles.torch.rotation.x, on(this.torchOwned() && p.flashlightOn), 18, dt);
    m.toggles.laser.rotation.x = damp(m.toggles.laser.rotation.x, on(this.laser.armed), 18, dt);
    (m.torchLens.material as THREE.MeshBasicMaterial).color.setHex(this.torchOwned() && p.flashlightOn ? 0xfff0c8 : 0x3a3630);
    // the vacuum tubes warm up when the emitter is armed; the lens glows while it fires
    const glow = this.laser.armed ? 0.75 + Math.sin(G.time * 23) * 0.08 + Math.random() * 0.06 : 0.12;
    m.filaments.color.setRGB(glow, glow * 0.45, glow * 0.12);
    (m.laserLens.material as THREE.MeshBasicMaterial).color.setHex(this.laser.firing ? 0xffd080 : this.laser.armed ? 0xa02a10 : 0x401008);
  }

  /** twice a second: the function list, the threat radar, sonar mapping, the torch */
  private slowTick(p: Player) {
    // THREAT RADAR (works with the watch down)
    if (hasUnlock('watch_radar') && this.wearing(p)) {
      let n = 0, best = Infinity, bx = 0, bz = 0;
      for (const c of G.creatures?.creatures.values() || []) {
        const cc: any = c;
        if (cc.dead || cc.zoneKey !== p.zoneKey || cc.tamedBy || (cc.sp?.threat ?? 0) < 2) continue;
        const d = Math.hypot(cc.x - p.x, cc.z - p.z);
        if (d > 12) continue;
        n++; if (d < best) { best = d; bx = cc.x; bz = cc.z; }
      }
      const was = !!this.threat;
      if (n) {
        const rel = angleDiff(p.facing, Math.atan2(bz - p.z, bx - p.x));
        this.threat = { n, d: best, rel, side: Math.abs(rel) < 0.5 ? 'AHEAD' : Math.abs(rel) > 2.4 ? 'BEHIND' : rel > 0 ? 'RIGHT' : 'LEFT' };
        if (!was) { G.audio?.ui?.('watchDeny', 0.5); if (!this.open && (!fpOwner() || fpOwner() === 'watch')) { this.peekKey = this.peekKey || '__threat'; this.peekT = Math.max(this.peekT, 2.5); } }
      } else this.threat = null;
    } else this.threat = null;
    // DEEP SURVEY: the map fills in around you through walls
    if (hasUnlock('watch_survey')) {
      const z = G.zones.get(p.zoneKey);
      if (z) { const R = 9, tx = p.tileX(), ty = p.tileY(); for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { if (i * i + j * j > R * R || !z.inb(tx + i, ty + j)) continue; const k = z.idx(tx + i, ty + j); if (z.floor[k]) z.explored[k] = 1; } }
    }
    this.hookTorch();
    // nearby anomalies hum on the SCAN page
    void contacts;
  }

  /** keep the dock (and the touch strip's PAGES) in step with what has been researched */
  syncPages(force = false) {
    const own = FUNCTIONS.filter(owned);
    const sig = own.map((f) => f.key).join(',');
    if (!force && sig === this.pageSig) return;
    this.pageSig = sig;
    WATCH_PAGES.length = 0;
    for (const f of own) WATCH_PAGES.push({ key: f.key, name: f.name, label: f.label });
    if (!own.some((f) => f.key === this.page) && this.page !== 'rnd') this.page = 'qst';
  }


}

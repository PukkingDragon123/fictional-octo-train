// The BAILIFF band's rules (G.band).
//
//  - fit(): the band goes on the wrist ('bailiff_band', worn, cannot be taken
//    off). Called by the intro when the guard pierces it on; with ?quick or a
//    loaded save it is already on.
//  - Escape detection (local survivor only): standing at the Seam
//    ('seam_door') or the exit doorway, or trying to force them, starts an
//    escalating beep and a 10 s countdown ('bandWarning'); backing off stops
//    it; reaching zero detonates.
//  - Removal attempt: a long, painful timed action with pliers / bolt cutters
//    / a saw and electrical skill, checked every few seconds. Success takes the
//    band off ('band:removed'); a second failed check detonates it.
//  - Shock ('bandShock'): pain, a burn, a stun and the 'shocked' animation
//    (missed installments, tamper alarms).
//  - Detonation ('bandDetonate'): a wrist blast through G.gore, then the
//    forearm comes off (limb loss) or the survivor dies (sandbox.bandLethal).
// Every peer sees shocks and blasts: they travel as 'band' ops (logged, so a
// late joiner knows whose band is gone; replays skip the show).
import * as THREE from 'three';
import { bus } from '../../core/events';
import { G } from '../G';
import { defOp, op, isReplaying } from '../ops';
import { TimedAction } from '../../actions/action';
import { createItem } from '../../items/factory';
import { itemDef, type Item } from '../../items/item';
import { objDef } from '../../world/objects';
import { KINDS } from '../../gore/kinds';
import { rigNumber } from '../../content/items/prisoner';
import type { GameSystem } from '../game';
import type { Player } from '../../entities/player';
import type { Zone, TileObject } from '../../world/zone';
import type { MenuOption } from '../../ui/ui';
import { voss, bailiff, pick, L, selfThought } from './voice';

export type BandState = 'none' | 'armed' | 'removed' | 'blown' | 'lost';
const WARN_R = 1.6;          // metres from the Seam's face where the band starts complaining
const COUNTDOWN = 10;
const GRACE = 8;             // seconds after fitting before escape detection arms

interface BandOp { k: 'state' | 'shock' | 'boom' | 'warn'; id: string; s?: BandState; v?: number; lethal?: boolean; on?: boolean; reason?: string; x?: number; z?: number }

defOp('band', (a: BandOp) => { (G.band as BandSystem | null)?.onOp(a); });

/** the band's wrist position on a survivor (world) */
function wristPos(p: Player): THREE.Vector3 {
  try { const v = G.gore?.woundPos?.(p, 'hand_l'); if (v) return v; } catch { /* rig not ready */ }
  return new THREE.Vector3(p.x, (p.y || 0) + 0.95, p.z);
}

/** the spasm: locks the survivor for a moment */
class ShockAction extends TimedAction {
  constructor(p: Player, secs: number) { super(p); this.name = 'Shocked'; this.duration = secs; this.anim = 'shocked' as any; this.fixedTime = true; this.locks = true; this.showBar = false; }
  perform() { /* nothing: the shock already happened */ }
}

/** cutting the band off */
class RemoveBandAction extends TimedAction {
  private checkT = 0;
  private checks = 0;
  private fails = 0;
  constructor(p: Player, private tool: Item, private sys: BandSystem) {
    super(p);
    this.name = 'Cut the band off';
    this.duration = 30;
    this.anim = 'stitch';
    this.fixedTime = true;
  }
  isValid() { return !!this.p.containerOf(this.tool) && this.sys.armed(this.p.id) && !this.p.body.dead; }
  start() { bailiff(L.tamperStart); G.audio?.loop?.('saw', this.p, this.tool.key === 'saw'); this.checkT = 7; }
  stop() { G.audio?.loop?.('saw', this.p, false); }
  update(dt: number) {
    const p = this.p;
    this.checkT -= dt;
    if (Math.random() < dt * 0.8) G.audio?.at?.('metal_clank', p.x, p.z, 0.25);
    if (this.checkT > 0) return;
    this.checkT = 7;
    this.checks++;
    // every check hurts: the bolt is through the bone
    const inj = p.body.addInjury('farm_l', 'laceration', 0.25);
    inj.bleed *= 0.6;
    p.body.panic = Math.min(100, p.body.panic + 12);
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.5);
    G.audio?.at?.('debtor_grunt', p.x, p.z, 0.9);
    const skill = p.body.skill('electrical');
    const toolB = this.tool.key === 'bolt_cutters' ? 0.12 : this.tool.key === 'multitool' ? 0.04 : this.tool.key === 'saw' ? -0.05 : 0.06;
    const chance = Math.max(0.1, Math.min(0.95, 0.5 + skill * 0.07 + toolB - p.body.pain() / 400 - p.body.panic / 600));
    if (Math.random() < chance) { G.audio?.at?.('click', p.x, p.z, 0.8); selfThought(['Got a wire. Keep going.', 'The casing gave a little.', 'Easy. Easy.', 'One more screw.'][this.checks % 4]); return; }
    this.fails++;
    if (this.fails >= 2) { this.done = true; bailiff(L.tamperFail); this.stop(); setTimeout(() => this.sys.detonate('tamper'), 700); return; }
    bailiff('TAMPER ALARM. CEASE IMMEDIATELY.');
    this.sys.shock(0.6, 'tamper');
  }
  perform() {
    this.stop();
    this.sys.removed(this.p, this.tool);
  }
}

export class BandSystem implements GameSystem {
  name = 'band';
  /** band state per survivor id (synced) */
  st = new Map<string, BandState>();
  /** local warning */
  warn = { on: false, countdown: COUNTDOWN, level: 0, reason: '', beepT: 0, force: 0 };
  private graceT = GRACE;
  private seamCache = new Map<string, { t: number; list: TileObject[] }>();
  private remoteWarn = new Map<string, number>();
  private remoteBeep = new Map<string, number>();
  private flashes: { x: number; y: number; z: number; t: number; zone: string; c?: number; i?: number }[] = [];
  private wornCheckT = 0;

  constructor() {
    G.band = this;
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => { try { this.objectMenu(p, o, out); } catch (e) { console.warn('band menu', e); } });
    bus.on('death', (p: Player) => { if (p?.isLocal) this.stopWarning(); });
    // the core carries the BAILIFF network: when SRV-3 goes down every band unlatches (the side chain's ending)
    bus.on('flag', (k: string, on: boolean) => { if (k === 'node:SRV-3' && on && !isReplaying()) setTimeout(() => this.unlatchAll(), 1500); });
  }

  // ---------------------------------------------------------------- state
  get(id: string): BandState { return this.st.get(id) || 'none'; }
  armed(id = G.local?.id): boolean { return !!id && this.get(id) === 'armed'; }
  /** is the local survivor wearing a live band */
  get worn() { return this.armed(); }
  private setState(id: string, s: BandState) { this.st.set(id, s); op('band', { k: 'state', id, s }); }

  onOp(a: BandOp) {
    const rep = isReplaying();
    switch (a.k) {
      case 'state': this.st.set(a.id, a.s || 'none'); break;
      case 'warn': if (!rep && a.id !== G.local?.id) { if (a.on) this.remoteWarn.set(a.id, a.v ?? 0.5); else this.remoteWarn.delete(a.id); } break;
      case 'shock': if (!rep) this.shockFx(a.id, a.v ?? 1); break;
      case 'boom': this.st.set(a.id, 'blown'); if (!rep) this.boomFx(a.id, !!a.lethal); break;
    }
  }

  // ---------------------------------------------------------------- fitting
  /** put the band on (local survivor). With silent the fitting is not dramatised (quick start, loads). */
  fit(p: Player = G.local, o: { silent?: boolean } = {}) {
    if (!p?.isLocal) return;
    // free survival (directives off): no contract, no band
    if (G.missions && !G.missions.enabled) return;
    let it = p.allItems().find((i) => i.key === 'bailiff_band');
    if (!it) { it = createItem('bailiff_band', undefined, { pristine: true }); p.inv.add(it); }
    if (!p.isWorn(it)) { const prev = p.worn.get('wrist' as any); if (prev && prev !== it) p.unwear(prev); p.wear(it); }
    this.setState(p.id, 'armed');
    this.graceT = GRACE;
    bus.emit('inventoryChanged', p);
    if (!o.silent) {
      G.audio?.at?.('band_pierce', p.x, p.z, 1);
      setTimeout(() => { G.audio?.at?.('band_chirp', p.x, p.z, 0.8); bailiff('BAILIFF UNIT BLF-7 BONDED. DEBTOR ' + debtorNo(p) + '. TELEMETRY NOMINAL.'); }, 900);
    }
  }
  /** a replacement band (after a blast or a lost arm), fitted at a hopper */
  refit(p: Player = G.local) {
    if (!p?.isLocal) return;
    voss(L.refit);
    G.pr.fx.hurt = 0.8;
    G.camera?.shake?.(0.5, 0.4);
    p.body.addInjury(p.body.severed.includes('hand_l') || p.body.severed.includes('farm_l') ? 'farm_r' : 'farm_l', 'deep', 0.3);
    this.fit(p, { silent: false });
  }

  // ---------------------------------------------------------------- shocks
  /** shock the local survivor (if banded) and show it to everyone */
  shock(strength = 1, reason = '') {
    const p = G.local;
    if (!p || !this.armed(p.id) || p.body.dead) return;
    const b = p.body;
    const s = Math.max(0.2, Math.min(2, strength));
    const inj = b.addInjury(b.severed.includes('farm_l') ? 'farm_r' : 'farm_l', 'burn', Math.min(0.6, 0.15 * s));
    void inj;
    b.endurance = Math.max(0, b.endurance - 0.35 * s);
    b.panic = Math.min(100, b.panic + 25 * s);
    b.stress = Math.min(100, b.stress + 15 * s);
    b.health = Math.max(1, b.health - 6 * s);
    p.actions.clear();
    p.actions.add(new ShockAction(p, 1.1 + 0.6 * s));
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.9);
    G.pr.fx.glitch = Math.max(G.pr.fx.glitch, 0.5 * s);
    setTimeout(() => { G.pr.fx.glitch = Math.max(0, G.pr.fx.glitch - 0.5 * s); }, 450);
    G.camera?.shake?.(0.6 * s, 0.8);
    G.audio?.flat?.('debtor_scream', 'voice', 0.6, 1.05);
    op('band', { k: 'shock', id: p.id, v: s, reason });
    selfThought(pick(['AAH— my arm— my ARM—', 'It\'s in the bone. It\'s IN the bone.', 'Okay. Okay. I\'ll pay. I\'ll pay.']));
  }
  private shockFx(id: string, s: number) {
    const p = G.players.get(id);
    if (p && p.zoneKey === G.local?.zoneKey) {
      G.audio?.play?.('band_shock', p.x, p.z, { vol: 1, range: 18 });
      const w = wristPos(p);
      if (G.gore?.glow && (G.sandbox.gore ?? 2) > 0) for (let i = 0; i < 10; i++) G.gore.emit?.(KINDS.static ?? KINDS.red, 0x9ae8ff, w.x, w.y, w.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.02, 0.3, 0.02, true);
      this.flashes.push({ x: w.x, y: w.y, z: w.z, t: 0.25, zone: p.zoneKey });
    }
    bus.emit('bandShock', { id, strength: s });
  }

  // ---------------------------------------------------------------- detonation
  /** blow the local survivor's band (escape, tamper, default) */
  detonate(reason = 'abscond', forceLethal = false) {
    const p = G.local;
    if (!p || !this.armed(p.id) || p.body.dead) return;
    this.stopWarning();
    const lethal = forceLethal || Number(G.sandbox.bandLethal ?? 0) === 1;
    this.st.set(p.id, 'blown');
    op('band', { k: 'boom', id: p.id, lethal, reason });
    bailiff(L.boom);
    // the band is gone with the wrist
    const it = p.allItems().find((i) => i.key === 'bailiff_band');
    if (it) { p.removeItem(it); bus.emit('inventoryChanged', p); }
    const b = p.body;
    const from: [number, number] = [p.x + Math.cos(p.facing + 1.2) * 0.6, p.z + Math.sin(p.facing + 1.2) * 0.6];
    const limbs = (G as any).limbs;
    let severed = false;
    if (G.sandbox.limbLoss && limbs?.sever) severed = limbs.sever(p, lethal ? 'uarm_l' : 'farm_l', { how: 'crush', by: 'the BAILIFF band', from });
    if (!severed) {
      b.addInjury('hand_l', 'burn', 0.9); b.addInjury('farm_l', 'deep', 0.9); b.addInjury('farm_l', 'fracture', 0.8); b.addInjury('torso_u', 'burn', 0.4);
      b.health = Math.max(1, b.health - 35); b.blood = Math.max(10, b.blood - 15); b.panic = 100;
    }
    b.addInjury('torso_u', 'glass', 0.3);
    G.pr.fx.hurt = 1;
    G.camera?.punch?.(0.12, 0.35);
    G.camera?.shake?.(1.4, 1.2);
    G.audio?.flat?.('band_tinnitus', 'sfx', 0.6);
    if (lethal) {
      setTimeout(() => {
        if (p.body.dead) return;
        p.body.health = 0; p.body.blood = 0; p.body.downed = false; p.body.dead = true;
        bus.emit('death', p);
      }, 900);
    } else setTimeout(() => voss(pick(L.boomVoss)), 2600);
  }
  private boomFx(id: string, lethal: boolean) {
    const p = G.players.get(id);
    bus.emit('bandDetonate', { id });
    if (!p || p.zoneKey !== G.local?.zoneKey) return;
    const w = wristPos(p);
    G.audio?.play?.('band_boom', w.x, w.z, { vol: 1.2, range: 48 });
    this.flashes.push({ x: w.x, y: w.y, z: w.z, t: 0.45, zone: p.zoneKey });
    const gore = G.gore;
    if (gore && (G.sandbox.gore ?? 2) > 0) {
      const K = KINDS.red, heavy = (G.sandbox.gore ?? 2) >= 2;
      const m = heavy ? 1 : 0.55;
      const fx = Math.cos(p.facing + 1.57), fz = Math.sin(p.facing + 1.57);
      gore.jet?.(K, 0xffffff, w.x, w.y, w.z, fx, fz, Math.round(60 * m), 5.5, 2.6, 2.4, 0.04, 0.09);
      gore.jet?.(K, 0xffffff, w.x, w.y, w.z, -fx, -fz, Math.round(30 * m), 3.5, 2.0, 2.0, 0.03, 0.06);
      gore.mist?.(K, 0xffffff, w.x, w.y, w.z, fx, fz, Math.round(30 * m), 2.6);
      gore.bits?.(K, 0xffffff, w.x, w.y, w.z, fx, fz, Math.round(12 * m) + 2, 3.4);
      if (heavy) gore.gibs?.chunks?.(p.zoneKey, K, 0xffffff, w.x, w.y, w.z, lethal ? 8 : 4, new THREE.Vector3(fx, 0.4, fz), 3.2, 2.4);
      // black scorch and smoke from the casing
      gore.emit?.(KINDS.static ?? K, 0x2a2622, w.x, w.y + 0.1, w.z, 0, 1.2, 0, 0.12, 1.4, 0, true);
      const z = G.zones.get(p.zoneKey);
      if (z && p.isLocal) op('decal', { z: z.key, d: { x: p.x + fx * 0.3, z: p.z + fz * 0.3, w: 1.6, d: 1.6, rot: Math.random() * 6.28, tex: 'decal_scorch', alpha: 0.8 } });
    }
    const d = Math.hypot(p.x - G.local.x, p.z - G.local.z);
    if (!p.isLocal && d < 14) { G.camera?.shake?.(Math.max(0.2, 1 - d / 14), 0.6); G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.3 * (1 - d / 14)); }
  }

  // ---------------------------------------------------------------- removal
  removalTool(p: Player): Item | null {
    return p.findTool('bolt_cutters') || p.findTool('#pliers') || p.findTool('#saw') || null;
  }
  startRemoval(p: Player) {
    const tool = this.removalTool(p);
    if (!tool || !this.armed(p.id)) return;
    p.actions.clear();
    p.actions.add(new RemoveBandAction(p, tool, this));
  }
  removed(p: Player, tool?: Item) {
    if (!p.isLocal) return;
    const it = p.allItems().find((i) => i.key === 'bailiff_band');
    if (it) p.removeItem(it);
    p.inv.add(createItem('bailiff_band_cut', undefined, { pristine: true }));
    if (tool) tool.cond = Math.max(0, tool.cond - 0.15);
    this.stopWarning();
    this.setState(p.id, 'removed');
    G.missions?.set?.('band:removed');
    bus.emit('inventoryChanged', p);
    bailiff(L.removedBailiff);
    G.audio?.at?.('band_chirp', p.x, p.z, 0.5);
    setTimeout(() => voss(pick(L.removed)), 1800);
    selfThought('It\'s off. It\'s OFF.');
  }
  /** the network that carries the band dies (the side chain's core shutdown): every band unlatches */
  unlatchAll() {
    const p = G.local;
    if (p && this.armed(p.id)) {
      const it = p.allItems().find((i) => i.key === 'bailiff_band');
      if (it) p.removeItem(it);
      p.inv.add(createItem('bailiff_band_cut', undefined, { pristine: true }));
      this.setState(p.id, 'removed');
      bus.emit('inventoryChanged', p);
      bailiff('CARRIER LOST. CARRIER LOST. CARR—', 3);
      selfThought('The bolt just... slid out. The band\'s dead.');
    }
    G.missions?.set?.('band:removed');
  }

  // ---------------------------------------------------------------- escape detection
  private seams(z: Zone): TileObject[] {
    const c = this.seamCache.get(z.key);
    if (c && G.time - c.t < 2) return c.list;
    const list = [...z.objects.values()].filter((o) => o.key === 'seam_door' || o.key === 'exit_doorway' || objDef(o.key)?.tags?.includes('seam'));
    this.seamCache.set(z.key, { t: G.time, list });
    return list;
  }
  private seamDist(p: Player, o: TileObject): number {
    const d = objDef(o.key);
    const w = d?.w ?? 1, dd = d?.d ?? 1;
    const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    if (d?.onWall || o.key === 'seam_door') {
      // the face on the wall the Seam hangs on (rot 0 faces +z)
      const r = ((o.rot % 4) + 4) % 4;
      const nx = r === 1 ? -1 : r === 3 ? 1 : 0, nz = r === 0 ? 1 : r === 2 ? -1 : 0;
      const fx = o.x + 0.5 - nx * 0.44, fz = o.y + 0.5 - nz * 0.44;
      return Math.hypot(p.x - fx, p.z - fz);
    }
    const nx = Math.max(o.x, Math.min(p.x, o.x + rw)), nz = Math.max(o.y, Math.min(p.z, o.y + rd));
    return Math.hypot(p.x - nx, p.z - nz);
  }
  /** something tried to force a way out (the Seam's own menu, src/game/seam.ts may call this) */
  escapeAttempt(reason = 'force', severity = 1) {
    if (!this.armed() || this.graceT > 0) return;
    this.warn.force = 2.5;
    if (!this.warn.on) this.startWarning(reason);
    this.warn.countdown = Math.min(this.warn.countdown, Math.max(2, COUNTDOWN - 6 * severity));
    G.audio?.ui?.('band_arm_tone', 0.6);
  }
  private startWarning(reason: string) {
    const w = this.warn;
    w.on = true; w.countdown = COUNTDOWN; w.reason = reason; w.beepT = 0;
    bailiff(pick(L.warnBailiff));
    if (reason === 'seam') setTimeout(() => { if (this.warn.on) voss(pick(L.warnSeam)); }, 1200);
    G.audio?.ui?.('band_arm_tone', 0.6);
    op('band', { k: 'warn', id: G.local.id, on: true, v: 0.2 });
  }
  stopWarning() {
    const w = this.warn;
    if (!w.on) return;
    w.on = false; w.level = 0; w.countdown = COUNTDOWN; w.force = 0;
    bus.emit('bandWarning', { id: G.local?.id, level: 0, reason: w.reason, countdown: undefined });
    if (G.local && this.armed()) bailiff(L.warnStop);
    if (G.local) op('band', { k: 'warn', id: G.local.id, on: false });
  }
  private intro(): boolean {
    const intro = G.systems.find((s) => s.name === 'intro') as any;
    return !!intro && intro.phase !== 'done';
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const p = G.local;
    // flashes from blasts and shocks
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      if (f.t <= 0) { this.flashes.splice(i, 1); continue; }
      if (f.zone === p?.zoneKey) G.pointLight(f.x, f.y, f.z, f.c ?? 0xffd8a0, (f.i ?? 2.5) * f.t / 0.45 + 0.3, f.c ? 5 : 9);
    }
    // remote survivors' bands beeping
    for (const [id, lv] of this.remoteWarn) {
      const q = G.players.get(id);
      if (!q || q.zoneKey !== p?.zoneKey) continue;
      const t = (this.remoteBeep.get(id) ?? 0) - dt;
      this.remoteBeep.set(id, t <= 0 ? 0.6 - lv * 0.4 : t);
      if (t <= 0) { G.audio?.play?.('band_beep', q.x, q.z, { vol: 0.7, range: 16 }); const wq = wristPos(q); this.flashes.push({ x: wq.x, y: wq.y + 0.1, z: wq.z, t: 0.12, zone: q.zoneKey, c: 0xff2010, i: 1.5 }); }
    }
    if (!p) return;
    const m = G.missions;
    if (m?.enabled && !p.body.dead && !this.intro()) {
      // intake done but no band yet (joined a crew, an old save, an intro that skipped the fitting): it is already on
      if (this.get(p.id) === 'none' && m.flags.has('contract:intake')) this.fit(p, { silent: true });
      // banded but the intake never got signed off (an intro that ended early)
      else if (this.armed(p.id) && !m.flags.has('contract:intake')) m.set('contract:intake');
    }
    if (!this.armed(p.id)) { if (this.warn.on) this.stopWarning(); return; }
    // the band stays on (and is lost with the forearm)
    this.wornCheckT -= dt;
    if (this.wornCheckT <= 0) {
      this.wornCheckT = 0.5;
      const it = p.allItems().find((i) => i.key === 'bailiff_band');
      const armGone = p.body.severed.includes('farm_l') || p.body.severed.includes('hand_l');
      const wrist = p.worn.get('wrist' as any);
      if (!it || (armGone && wrist?.key !== 'bailiff_band')) {
        if (it) p.removeItem(it);
        this.setState(p.id, 'lost');
        this.stopWarning();
        setTimeout(() => voss(L.lost), 2500);
        return;
      }
      if (!p.isWorn(it)) { p.wear(it); selfThought('It doesn\'t come off. It goes through the bone.'); }
    }
    if (p.body.dead) return;
    if (this.graceT > 0) { this.graceT -= dt; if (this.warn.on) this.stopWarning(); return; }
    if (this.intro() || G.transitioning) return;
    const z = G.zones.get(p.zoneKey);
    if (!z) return;
    let near = Infinity, reason = '';
    for (const o of this.seams(z)) { const d = this.seamDist(p, o); if (d < near) { near = d; reason = o.key === 'seam_door' ? 'seam' : 'exit'; } }
    const w = this.warn;
    if (w.force > 0) w.force -= dt;
    const inside = near < WARN_R || w.force > 0;
    if (inside && !w.on) this.startWarning(reason || 'force');
    if (!w.on) return;
    if (!inside && near > WARN_R + 0.5) { this.stopWarning(); return; }
    if (!inside) return; // the dead band between the two radii holds the count
    w.countdown -= dt * (w.force > 0 ? 1.6 : 1);
    w.level = Math.max(0, Math.min(1, 1 - w.countdown / COUNTDOWN));
    w.beepT -= dt;
    if (w.beepT <= 0) {
      w.beepT = Math.max(0.09, 0.9 * (w.countdown / COUNTDOWN));
      G.audio?.play?.('band_beep', p.x, p.z, { vol: 0.7 + w.level * 0.4, variant: Math.min(7, Math.floor(w.level * 8)) });
      // the pip on the band strobes red with every beep
      const wp = wristPos(p);
      this.flashes.push({ x: wp.x, y: wp.y + 0.1, z: wp.z, t: 0.12, zone: p.zoneKey, c: 0xff2010, i: 1.2 + w.level * 2 });
      bus.emit('bandWarning', { id: p.id, level: w.level, reason: w.reason, countdown: Math.max(0, Math.ceil(w.countdown)) });
      if (w.level > 0.6) G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.15);
    }
    if (w.countdown <= 0) this.detonate('abscond');
  }

  // ---------------------------------------------------------------- menus
  /** item menu for the worn band (src/interact/itemMenu.ts hook) */
  itemMenu(p: Player, it: Item, opts: MenuOption[]) {
    if (it.key !== 'bailiff_band') return;
    // it does not come off normally
    for (let i = opts.length - 1; i >= 0; i--) if (/^(Take off|Drop|Drop all|Move to|Unequip|Equip)/.test(opts[i].label)) opts.splice(i, 1);
    if (!this.armed(p.id)) return;
    const tool = this.removalTool(p);
    opts.unshift({ label: 'Cut the band off…', danger: true, disabled: !tool ? 'needs pliers, bolt cutters or a saw' : false, action: () => this.startRemoval(p) });
    opts.unshift({ label: 'Read the band', action: () => G.ui?.read?.('BAILIFF BLF-7', bandText(p), 'terminal') });
  }
  /** the Seam / exit doorway: forcing them is an escape attempt */
  private objectMenu(p: Player, o: TileObject, out: MenuOption[]) {
    if (o.key !== 'seam_door' && o.key !== 'exit_doorway') return;
    if (!this.armed(p.id)) return;
    if (o.key === 'seam_door' && !out.some((m) => /force|pry/i.test(m.label))) {
      out.push({ label: 'Force the Seam', danger: true, action: () => { this.escapeAttempt('force', 1); selfThought('Come on. Come ON. Open.'); } });
    }
  }
}

/** the debtor number everyone else shows (jumpsuit patch, mugshot, hologram): set by the intro / handler */
function debtorNo(p: Player): string {
  const given = (p as unknown as { prisonerNo?: string }).prisonerNo;
  if (given) return given;
  try { const n = rigNumber(p.rig); (p as unknown as { prisonerNo: string }).prisonerNo = n; return n; } catch { return 'D-0000'; }
}

function bandText(p: Player) {
  const d = G.debt;
  const lines = [`DEBTOR ${debtorNo(p)} :: ${p.name.toUpperCase()}`, 'REMITTANCE PROGRAMME — MERIDIAN INSTITUTE', ''];
  if (d?.on) {
    lines.push(`BALANCE OWED   ${Math.round(d.remaining).toLocaleString('en-GB')} SCRIP`);
    lines.push(`PAID TO DATE   ${Math.round(d.paid).toLocaleString('en-GB')} SCRIP`);
    if (!d.cleared) lines.push(`INSTALLMENT ${d.installment}/${d.count}  ${Math.round(d.due).toLocaleString('en-GB')} DUE BY DAY ${d.dueDay} (${Math.floor(d.hoursLeft)}H ${Math.floor((d.hoursLeft % 1) * 60)}M)`);
    else lines.push(`CONTRACT DISCHARGED. SURPLUS ${Math.round(d.surplus).toLocaleString('en-GB')} SCRIP`);
  } else lines.push('NO CONTRACT ON FILE.');
  lines.push('', 'TAMPERING, ABSCONDING AND APPROACHING THE SEAM', 'WILL RESULT IN CORRECTIVE DISCHARGE.', '', `HEART ${Math.round(70 + p.body.panic * 0.6)} BPM`);
  void itemDef;
  return lines.join('\n');
}

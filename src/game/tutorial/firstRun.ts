// THE FIRST RUN (round 19): the user play-tested and found the game "really confusing". The unit now starts with
// nothing, and Dr. Iris Calder comes down in person (src/creatures/species/calder_guide.ts): she walks with the unit
// through Level 0, stops at each step and shows it, and the screen goes dark round the one thing to do (./spotlight.ts),
// the input held to that one action, until it is done. Her lines are short and human (her recorded voice where a clip
// exists, the band's chip voice otherwise), on the subtitle strip.
//
//   1  the supply bag      the issue kit came down in a bag at her feet: open it (E), take what is in it
//   2  walk with me        to a workbench (she walks, the unit follows)
//   3  the first craft     at the bench: lay the cloth out, hold the sheet that is ready: rags
//   4  cooking             (when there is a stove or a fire near) raw meat in the pan, flip it, plate it
//   5  the first mission   DEAD AIR: the band's radio blew a transistor; a clock on it; the tracker up top
//   6  the band            Tab: the wrist terminal, one app (Tasks)
//   7  the scanner         she installs it; hold Q on her; then it hears the transistor and marks it
//   8  the find            follow the mark, pick it up
//   9  the repair          back at a bench: the radio and the transistor make a working radio; the Map installs
// Then she signs off and walks away, and the contract (First Haul) begins. Runs once (flag 'tut:done'), for the
// host / solo with a contract, never under a test driver unless ?tutorial=1. Esc twice skips it.
import * as THREE from 'three';
import { G } from '../G';
import type { Game, GameSystem } from '../game';
import type { Action } from '../../core/input';
import type { Player } from '../../entities/player';
import type { TileObject, Zone } from '../../world/zone';
import type { Item } from '../../items/item';
import type { Creature } from '../../creatures/creature';
import type { ResearcherGesture } from '../../entities/researcher';
import { bus } from '../../core/events';
import { op } from '../ops';
import { uid } from '../../core/rng';
import { createItem } from '../../items/factory';
import { serializeItem } from '../../items/factory';
import { objDef } from '../../world/objects';
import { walkable } from '../../creatures/behaviors_b';
import { findPath } from '../../world/path';
import { floatText, floatQuiet } from '../../social/floatText';
import { offscreen } from '../../ui/holo/subs';
import { cineSay } from '../../ui/holo/cineText';
import { floatChoices, type FloatChoice } from '../../ui/holo/floatChoices';
import { subStrip } from '../../ui/menus/settings';
import { readTime } from '../lines';
import { RadioVoice } from '../vossVoice';
import { defQuest } from '../quests';
import type { QuestX } from '../../missions/questRuntime';
import { Spotlight, type SpotAt } from './spotlight';
import { limitApps, installApp } from '../../ui/bandos/installed';
import { setTrackerTimer, trackerEl } from '../../ui/questTracker';
import { TUT } from './state';
import { sfx } from '../../ui/menus/sfx';

/** what the first run is doing (the quest and the tracker read it) */
export const FIRST = { on: false, target: null as { zone: string; x: number; z: number } | null };
const MISSION_SECS = 15 * 60;
const SKIP = Symbol('first run skipped');
const v1 = new THREE.Vector3();
const flags = () => (G.missions as unknown as { flags: Set<string>; set: (k: string) => void });
const setFlag = (k: string) => { const m = flags(); if (m?.set) m.set(k); else m?.flags?.add(k); };
const has = (k: string) => !!flags()?.flags?.has(k);
const carries = (key: string) => !!G.local?.allItems?.().some((i) => i.key === key);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- the first mission
defQuest({
  key: 'first_signal', main: true, manual: true, voice: 'handler', title: 'Dead Air', giver: 'DR. CALDER', category: 'contract',
  desc: 'The band\'s field radio blew its output transistor on the way down. Without it Dr. Calder loses the unit the moment she leaves. Find a transistor on this floor and fit it, at a bench, before her shift ends.',
  objectives: [
    { id: 'scanner', text: 'Get the scanner from Dr. Calder', check: (m: { flags: Set<string> }) => m.flags.has('fr:scanner') },
    { id: 'find', text: 'Find the transistor', check: (m: { flags: Set<string> }) => m.flags.has('fr:found'), where: () => FIRST.target ? { ...FIRST.target, label: 'SIGNAL' } : null },
    { id: 'take', text: 'Pick it up', check: (m: { flags: Set<string> }) => m.flags.has('fr:transistor') },
    { id: 'fix', text: 'Fit it in the radio at a bench', check: (m: { flags: Set<string> }) => m.flags.has('fr:radio') },
  ],
  reward: { rp: 2 },
} as QuestX as never);

let running: FirstRun | null = null;
export function firstRunRunning() { return !!running; }
export function startFirstRun(g: Game): FirstRun | null {
  if (running || !G.local) return null;
  const f = new FirstRun(g);
  g.addSystem(f);
  if (import.meta.env.DEV) (window as unknown as { __first: FirstRun }).__first = f;
  return f;
}

/** Dr. Calder in person: the creature, and what the script asks of it */
class Calder {
  c: Creature | null = null;
  spawn(zone: string, x: number, z: number) {
    this.remove();
    this.c = G.creatures.spawn('calder_guide', zone, x, z);
    if (this.c) this.c.mem.follow = false;
  }
  remove() { if (this.c) { G.creatures.remove(this.c); this.c = null; } }
  get pos() { return this.c ? { x: this.c.x, z: this.c.z } : null; }
  goal(x: number, z: number, run = false, stop = 0.6) { if (this.c) { this.c.mem.goal = { x, z, run, stop }; this.c.mem.follow = false; } }
  follow(on: boolean) { if (this.c) this.c.mem.follow = on; }
  face(at: { x: number; z: number } | null) { if (this.c) this.c.mem.face = at; }
  gesture(name: ResearcherGesture, at?: { x: number; y: number; z: number }) { if (this.c) this.c.mem.ges = { name, at }; }
  talk(sec: number) { if (this.c) this.c.mem.talk = sec; }
  /** stand next to the unit's zone: she comes along through every door */
  keepUp(p: Player) {
    const c = this.c;
    if (!c) return;
    if (c.zoneKey === p.zoneKey && G.creatures.creatures?.has?.(c.id) !== false) return;
    const s = spotNear(p.zoneKey, p.x, p.z, 1.5, 3);
    if (s) this.spawn(p.zoneKey, s.x, s.z);
  }
}

/** a walkable floor tile at a distance from a point, with a path back to it */
function spotNear(zoneKey: string, x: number, z: number, r0: number, r1: number, needPath = false, avoid?: (x: number, y: number) => boolean): { x: number; z: number } | null {
  const zn = G.zones.get(zoneKey);
  if (!zn) return null;
  for (let t = 0; t < 80; t++) {
    const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
    const tx = Math.floor(x + Math.cos(a) * r), ty = Math.floor(z + Math.sin(a) * r);
    if (!zn.inb(tx, ty) || !walkable(zn, tx, ty) || zn.objectsAt(tx, ty).length) continue;
    if (avoid && avoid(tx, ty)) continue;
    if (needPath && t < 60 && !findPath(zn, Math.floor(x), Math.floor(z), tx, ty, { doors: true })) continue;
    return { x: tx + 0.5, z: ty + 0.5 };
  }
  return null;
}

export class FirstRun implements GameSystem {
  name = 'firstRun';
  step = 'hello';
  private clock = 0;
  private waits: { cond: () => boolean; res: () => void; rej: (e: unknown) => void }[] = [];
  private over = false;
  private spot = new Spotlight();
  private voice = new RadioVoice(205, 1, 'calder');
  private calder = new Calder();
  private allow: Set<Action> | null = new Set();
  private offs: (() => void)[] = [];
  private bag: TileObject | null = null;
  private bench: TileObject | null = null;
  private escT = -9;
  private scanned = false;
  private pinging = false;
  private cook: Record<string, boolean> = {};
  private lineDur = 0;

  constructor(public g: Game) {
    running = this;
    TUT.running = true; TUT.step = 'hello';
    FIRST.on = true;
    setFlag('fr:on');
    limitApps(['tasks']);
    // the contract's first job waits for hers (a quick start may have handed it out already)
    // (and so does anything else a quick start handed out: they come back by themselves once hers is done)
    const q = (G.missions as unknown as { quests?: { recs: Map<string, { s: string; n: number }>; apply(k: string, r: null): void; track(k: string | null): void } }).quests;
    if (q) {
      for (const [k, r] of [...q.recs]) if (k !== 'first_signal' && r.n === 0 && (r.s === 'act' || r.s === 'off')) q.apply(k, null);
      q.track(null);
    }
    floatQuiet(true);
    const h = G.handler as unknown as { briefed?: boolean; cine?: boolean; hush?: () => void; guide?: (t: null) => void } | null;
    if (h) { h.briefed = true; h.hush?.(); h.cine = true; h.guide?.(null); }
    this.hooks();
    void this.run();
  }

  // ================================================================== hooks: the input held to one thing
  private hooks() {
    const g = this.g;
    const inp = g.input as unknown as { hit: (a: Action) => boolean; down: (a: Action) => boolean };
    const ownHit = Object.prototype.hasOwnProperty.call(inp, 'hit') ? inp.hit : undefined;
    const ownDown = Object.prototype.hasOwnProperty.call(inp, 'down') ? inp.down : undefined;
    const oh = inp.hit.bind(inp), od = inp.down.bind(inp);
    const ok = (a: Action) => !this.allow || this.allow.has(a) || a === 'camLeft' || a === 'camRight' || a === 'pause';
    const hit = (a: Action) => {
      const v = oh(a);
      if (a === 'pause' && v) {
        const ui = g.ui as unknown as { menuEl?: unknown; readerEl?: unknown; modal?: unknown; inventory?: { open?: boolean } } | undefined;
        if (!(ui?.menuEl || ui?.readerEl || ui?.modal || ui?.inventory?.open || (G.craft as { benchV?: { open?: boolean } } | undefined)?.benchV?.open)) {
          // Esc twice skips her
          if (this.clock - this.escT < 2.5) { this.skip(); return false; }
          this.escT = this.clock;
          this.interject('Esc again if you really want to go it alone.');
          return false;
        }
        return v;
      }
      return ok(a) ? v : false;
    };
    const down = (a: Action) => (ok(a) ? od(a) : false);
    inp.hit = hit; inp.down = down;
    this.offs.push(() => {
      if (inp.hit === hit) { if (ownHit) inp.hit = ownHit; else delete (inp as { hit?: unknown }).hit; }
      if (inp.down === down) { if (ownDown) inp.down = ownDown; else delete (inp as { down?: unknown }).down; }
    });
    // world clicks only while using things is allowed
    const ui = g.ui as unknown as { onWorldClick?: (...a: unknown[]) => void } | undefined;
    if (ui?.onWorldClick) {
      const orig = ui.onWorldClick;
      ui.onWorldClick = (...a: unknown[]) => { if (!this.allow || this.allow.has('interact')) orig.apply(ui, a); };
      this.offs.push(() => { ui.onWorldClick = orig; });
    }
    // no scanning until she has installed the scanner
    const sc = G.scan as unknown as { canScan?: () => boolean } | undefined;
    if (sc?.canScan) {
      const own = Object.prototype.hasOwnProperty.call(sc, 'canScan') ? sc.canScan : undefined;
      const orig = sc.canScan.bind(sc);
      // (while she has the unit sweep for the transistor's signal, Q only listens: no target, no lock)
      const gated = () => (has('fr:scanner') || this.over) && !this.pinging && orig();
      sc.canScan = gated;
      this.offs.push(() => { if (sc.canScan === gated) { if (own) sc.canScan = own; else delete (sc as { canScan?: unknown }).canScan; } });
    }
    const on = (ev: string, fn: (...a: any[]) => void) => this.offs.push(bus.on(ev, fn));
    on('scanEntry', (e: { key?: string }) => { if (e?.key === 'calder_guide') this.scanned = true; });
    on('scanLock', (e: { key?: string; end?: string }) => { if (e?.key === 'calder_guide' && e.end !== 'fail') this.scanned = true; });
    on('cookOpen', () => { this.cook.open = true; });
    on('cookStep', (step: string) => { this.cook[step] = true; });
    on('dishPlated', () => { this.cook.plated = true; });
    on('cookClose', () => { this.cook.close = true; });
  }

  // ================================================================== the frame
  update(dt: number) {
    this.clock += dt;
    this.spot.update(dt);
    const p = G.local;
    if (p && !this.over) this.calder.keepUp(p);
    // what the unit opened, latched every frame: a pack opened and shut again while she was still talking counts
    const g = G as unknown as { ui?: { inventory?: { open?: boolean } }; craft?: { benchV?: { open?: boolean } }; bandos?: { open?: boolean } };
    if (g.ui?.inventory?.open) this.seen.add('pack');
    if (g.craft?.benchV?.open) this.seen.add('bench');
    if (g.bandos?.open) this.seen.add('band');
    for (const w of [...this.waits]) if (w.cond()) { this.waits.splice(this.waits.indexOf(w), 1); w.res(); }
    // the clock on the mission
    if (FIRST.target && !this.over && has('fr:mission') && !has('fr:radio') && !has('fr:late')) {
      const left = (this.deadline ?? 0) - (G.time ?? 0);
      if (left <= 0) { setFlag('fr:late'); this.interject('That\'s the clock. They\'ll dock you for it. I\'m not going anywhere, though. Keep at it.'); }
    }
  }
  private deadline: number | null = null;
  private seen = new Set<string>();

  private sleep(s: number) { const t = this.clock + s; return this.until(() => this.clock >= t); }
  private until(cond: () => boolean): Promise<void> {
    if (this.over) return Promise.reject(SKIP);
    return new Promise((res, rej) => this.waits.push({ cond, res, rej }));
  }
  /** hold until it is done; she says it again now and then, a little differently each time */
  private async gate(cond: () => boolean, nags: string[], every = 14) {
    let i = 0, t = this.clock;
    while (!cond()) {
      await this.until(() => cond() || this.clock - t > every);
      if (cond()) break;
      if (nags.length) { this.speak(nags[i % nags.length]); i++; }
      t = this.clock;
    }
  }
  private speak(text: string, o: { gesture?: ResearcherGesture } = {}) {
    if (this.over) return;
    const voiced = this.voice.speak(text);
    const d = Math.max(voiced, readTime(text) * 0.85);
    this.lineDur = d;
    // her words hang beside her in the world as cinematic type (src/ui/holo/cineText.ts; over the unit when she
    // is not in the scene); the subtitle strip when Settings asks for it
    if (subStrip() || !G.local) offscreen(floatText(text, { kind: 'voss', name: 'DR. CALDER', life: d + 0.5, pri: 3 }), d + 0.5);
    else cineSay('calder', text, this.voiceAt, { secs: d + 0.5, name: 'DR. CALDER', tone: 'calder' });
    bus.emit('calderSpeak', { text, dur: d });
    this.calder.talk(d);
    if (o.gesture) this.calder.gesture(o.gesture);
  }
  private async say(text: string, o: { gesture?: ResearcherGesture } = {}) {
    if (this.over) throw SKIP;
    this.speak(text, o);
    await this.sleep(this.lineDur + 0.25);
  }
  /** a point over Dr. Calder's head (the unit's when she is not here), followed every frame */
  private voiceAt = (() => {
    const who = () => this.calder.c ?? G.local!;
    const ground = () => { const w = who(); return G.zones.get(w.zoneKey)?.heightAt(Math.floor(w.x), Math.floor(w.z)) ?? 0; };
    return { get x() { return who().x; }, get y() { return ground() + 2.3; }, get z() { return who().z; } };
  })();
  /** floating answers beside her; the first one if nothing is picked in `secs` */
  private choose(list: FloatChoice[], secs: number): Promise<string> {
    return new Promise((res) => {
      let done = false;
      const fin = (id: string) => { if (!done) { done = true; res(id); } };
      const at = this.calderSpot();
      const h = floatChoices(list, { onPick: fin, speaker: () => { const a = at(); return a ? { x: a.x, y: a.y - a.r * 0.5 } : null; } });
      this.sleep(secs).then(() => { if (!done) { h.close(); fin(list[0].id); } }, () => { h.close(); fin(list[0].id); });
    });
  }
  private interject(text: string) { this.voice.stop(); this.speak(text); }
  private lock(acts: Action[] | null) { this.allow = acts ? new Set(acts) : null; }

  // ---------------------------------------------------------------- where things are on screen
  private screen(x: number, y: number, z: number, metres: number): SpotAt | null {
    const pr = (G as unknown as { pr?: { worldToScreen?: (v: THREE.Vector3) => { x: number; y: number; z: number }; cssPerMetre?: () => number } }).pr;
    if (!pr?.worldToScreen) return null;
    const s = pr.worldToScreen(v1.set(x, y, z));
    if (s.z > 1) return null;
    return { x: s.x, y: s.y, r: Math.max(46, Math.min(240, (pr.cssPerMetre?.() ?? 60) * metres)) };
  }
  private objSpot(o: TileObject, metres = 0.9): () => SpotAt | null {
    const d = objDef(o.key), z = G.zones.get(G.local!.zoneKey);
    const w = d?.w ?? 1, dd = d?.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    return () => this.screen(o.x + rw / 2, (z?.heightAt(o.x, o.y) ?? 0) + (d?.height ?? 0.6) * 0.5, o.y + rd / 2, metres);
  }
  private unitSpot(metres = 1.1): () => SpotAt | null { return () => { const p = G.local!; return this.screen(p.x, p.y + 0.9, p.z, metres); }; }
  private calderSpot(): () => SpotAt | null { return () => { const c = this.calder.c; return c ? this.screen(c.x, 0.9 + (G.zones.get(c.zoneKey)?.heightAt(Math.floor(c.x), Math.floor(c.z)) ?? 0), c.z, 1.1) : null; }; }
  private domSpot(el: HTMLElement | null): () => SpotAt | null {
    return () => { const b = el?.getBoundingClientRect(); return b && b.width ? { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.max(40, b.width / 2 + 16) } : null; };
  }

  /** walk her somewhere (she runs when it is far); resolves when she is there (or after a while, wherever she got to) */
  private async walk(x: number, z: number, run = false, stop = 0.8) {
    const c = this.calder.c;
    if (!c) return;
    this.calder.goal(x, z, run || Math.hypot(x - c.x, z - c.z) > 10, stop);
    const t0 = this.clock;
    await this.until(() => !this.calder.c?.mem.goal || this.clock - t0 > 22);
    // stuck: she takes the long way round (off screen) and turns up there
    const cc = this.calder.c;
    if (cc && Math.hypot(cc.x - x, cc.z - z) > stop + 2) { cc.x = x + 0.6; cc.z = z + 0.6; cc.mem.goal = null; }
  }

  // ================================================================== the script
  private async run() {
    try { await this.script(); } catch (e) { if (e !== SKIP) console.warn('first run', e); }
    this.finish();
  }

  private async script() {
    const p = () => G.local!;
    const zn = () => G.zones.get(p().zoneKey)!;
    this.lock([]);

    // ---- the bag: the issue kit moves into it, and it lies at the unit's feet
    this.step = 'bag'; TUT.step = 'bag';
    this.packBag();
    // ---- she arrives
    const s0 = spotNear(p().zoneKey, p().x, p().z, 6, 10, true) ?? spotNear(p().zoneKey, p().x, p().z, 2, 4);
    if (s0) this.calder.spawn(p().zoneKey, s0.x, s0.z);
    // (a wide, soft pool on the unit while she runs in: walls can hide her on the way; on her once she is here)
    this.spot.on(this.unitSpot(2.8), 0.4);
    await this.walk(p().x, p().z, true, 1.8);
    this.spot.on(this.calderSpot(), 0.55);
    this.calder.gesture('wave');
    await this.say('There you are. Hi! I\'m Iris. Calder. The voice in your band, and today, apparently, also the legs.');
    await this.say('First time down is a lot. So we do one thing at a time. I\'ll show you, you do it. Deal?', { gesture: 'talk' });
    // the answer floats beside her (src/ui/holo/floatChoices.ts): a click, or 1 / 2
    if (await this.choose([{ id: 'deal', label: 'Deal', tone: 'calder' }, { id: 'skip', label: 'I know the drill', tone: 'warm' }], 25) === 'skip') { this.skip(); throw SKIP; }
    await this.say(pick(['Good. Easy stuff first.', 'Great. Nothing scary yet, I promise.']));

    // ---- 1. open the bag
    const bag = this.bag;
    if (bag) {
      this.calder.gesture('point', { x: bag.x + 0.5, y: 0.2, z: bag.y + 0.5 });
      this.spot.on(this.objSpot(bag, 0.75));
      this.spot.keys(['E']);
      this.lock(['interact']);
      await this.say('Your kit came down in that bag. It\'s yours. Open it: walk up to it and press E.');
      this.lock(['interact', 'up', 'down', 'left', 'right']);
      const inv = () => (G.ui as unknown as { inventory?: { open?: boolean } } | undefined)?.inventory;
      await this.gate(() => this.seen.has('pack') || !!inv()?.open, ['E, next to the bag.', 'The bag. E. I promise there\'s nothing alive in it.']);
      this.spot.off();
      await this.say('Drag everything into your pack. All of it. You\'ll want it.');
      await this.gate(() => carries('cloth') && carries('field_radio_dead'), ['All of it. The cloth and the radio too.', 'Drag them over, into the pack.'], 16);
      await this.gate(() => !inv()?.open, ['Close the pack when you\'re done.'], 12);
      await this.say(pick(['Good. You\'re officially equipped. Badly, but equipped.', 'Nice. Now you own things. Congratulations, that\'s how it starts.']));
    }

    // ---- 2. walk with me, to a bench
    this.step = 'walk'; TUT.step = 'walk';
    this.seen.delete('bench');
    const bench = this.bench = await this.findBench();
    if (bench) {
      const bx = bench.x + 1, bz = bench.y + 0.5;
      this.lock(['up', 'down', 'left', 'right', 'run']);
      this.spot.on(this.unitSpot(1.2), 0.35);
      this.spot.keys(['W', 'A', 'S', 'D']);
      await this.say('Walk with me. W, A, S, D. Shift if you\'re in a hurry, which you are.');
      this.spot.keys(null); this.spot.off();
      void this.walk(bx + 1.2, bz + 0.6, false, 0.6);
      await this.gate(() => Math.hypot(p().x - bx, p().z - bz) < 2.4, ['This way. Follow me.', 'Over here, by the bench.'], 12);
      // ---- 3. the first craft
      this.step = 'craft'; TUT.step = 'craft';
      this.calder.gesture('present');
      const bV = () => (G.craft as unknown as { benchV?: { open?: boolean; stage?: (it: Item) => boolean } } | undefined)?.benchV;
      this.spot.on(this.objSpot(bench, 1.3));
      this.spot.keys(['E']);
      this.lock(['interact', 'up', 'down', 'left', 'right']);
      await this.say('A workbench. Most of what keeps you alive gets made on one of these. Step up to it. E.');
      await this.gate(() => this.seen.has('bench') || !!bV()?.open, ['E, at the bench.', 'The bench. E.']);
      if (!bV()?.open) await this.gate(() => !!bV()?.open, ['Back up to the bench. E.'], 12);
      this.spot.off();
      const cloth = p().allItems().find((i) => i.key === 'cloth');
      if (cloth) bV()?.stage?.(cloth);
      await this.say('I put your cloth on the boards. The sheets on the board behind show what it can become.');
      await this.say('The one with the green lamp is ready. Click it, hold your hands on the work.');
      await this.gate(() => carries('rag'), ['The sheet with the green lamp. Click it, then hold.', 'Click the ready sheet. Hold the work till it\'s done.'], 18);
      await this.say(pick(['Rags! Bandages, torches, filters. You\'ll want more than you think.', 'Look at you. Rags. That\'s how every empire starts.']));
      await this.say('Step back from the bench. Esc.');
      await this.gate(() => !bV()?.open, ['Esc steps you back from the bench.'], 10);
    }

    // ---- 4. cooking (when there is somewhere to cook)
    await this.cooking();

    // ---- 5. the first mission
    this.step = 'mission'; TUT.step = 'mission';
    this.lock([]);
    this.calder.gesture('think');
    await this.say('Okay. Bad news. The radio in your kit is dead. Blown transistor.');
    await this.say('Without it I lose you the second I walk off. And I do have to walk off. My shift ends.');
    const q = (G.missions as unknown as { quests?: { acceptQuest(k: string): boolean; track(k: string | null): void } }).quests;
    q?.acceptQuest('first_signal');
    q?.track('first_signal');
    setFlag('fr:mission');
    this.deadline = (G.time ?? 0) + MISSION_SECS;
    setTrackerTimer(this.deadline);
    await this.sleep(0.6);
    this.spot.on(this.domSpot(trackerEl()));
    await this.say('That\'s the job, up top. And that\'s the clock. Fifteen minutes. No pressure. Some pressure.');
    this.spot.off();

    // ---- 6. the band
    this.step = 'watch'; TUT.step = 'watch';
    this.seen.delete('band');
    const bandOpen = () => !!(G as unknown as { bandos?: { open?: boolean } }).bandos?.open;
    this.spot.on(this.unitSpot(1.0));
    this.spot.keys(['Tab']);
    this.lock(['watch']);
    await this.say('Your band has a screen. Tab, and look at your wrist.');
    await this.gate(() => this.seen.has('band') || bandOpen(), ['Tab. Your wrist.', 'Tab brings the band up.']);
    this.spot.off();
    await this.say('One app, for now: Tasks. That\'s the job, written down. You get more as you earn them.');
    await this.say('Tab again to put it away.');
    await this.gate(() => !bandOpen(), ['Tab puts it away.'], 10);

    // ---- 7. the scanner
    this.step = 'scanner'; TUT.step = 'scanner';
    await this.say('Here. I\'m pushing you the scanner. Hold still, this tickles.');
    await installApp('scanner');
    setFlag('fr:scanner');
    this.spot.on(this.calderSpot());
    this.spot.keys(['Q']);
    this.lock(['scan', 'whistle']);
    this.calder.gesture('present');
    await this.say('Hold Q and look at me. Go on. I don\'t bite.');
    const t0 = this.clock;
    let held = 0;
    await this.gate(() => { held = (G.input as unknown as { down: (a: Action) => boolean }).down('scan') ? held + 1 : held; return this.scanned || (this.clock - t0 > 30 && held > 40); }, ['Hold Q. Face me.', 'Keep holding it till it locks.'], 12);
    this.spot.off();
    await this.say(pick(['Ha. "Peaceful." My ex would disagree.', 'Filed. I\'m in your codex now. Weird feeling.']));

    // ---- 8. the find
    this.step = 'find'; TUT.step = 'find';
    const tgt = this.placeTransistor();
    if (tgt) {
      // the scanner finds places too: hold Q with nothing in front and it listens for a signal
      this.spot.on(this.unitSpot(1.5), 0.45);
      this.spot.keys(['Q']);
      this.lock(['scan']);
      this.pinging = true;
      this.calder.gesture('think');
      await this.say('The transistor fell out somewhere near. The scanner can hear it. Hold Q again, and just listen.');
      let held = 0;
      const dn = () => (G.input as unknown as { down: (a: Action) => boolean }).down('scan');
      await this.gate(() => { if (dn()) held++; return held > 40; }, ['Hold Q. Nothing in front of you, just listen.', 'Keep holding Q.'], 12);
      this.pinging = false;
      this.spot.keys(null);
      sfx('scan', 0.7); setTimeout(() => sfx('ding', 0.6), 380);
      const h = G.handler as unknown as { guide?: (t: { x: number; z: number } | null) => void } | null;
      h?.guide?.({ x: tgt.x, z: tgt.z });
      this.spot.on(() => this.screen(tgt.x, 0.3, tgt.z, 0.7), 0.3);
      await this.say('Ping. There it is. It marks the spot on the floor: follow the arrows, I\'ll keep up.');
      this.spot.off();
      this.lock(null);
      this.calder.follow(true);
      await this.gate(() => Math.hypot(p().x - tgt.x, p().z - tgt.z) < 2.2 || carries('transistor'), ['Follow the arrows.', 'The tick gets faster when you\'re close. Trust me.'], 25);
      setFlag('fr:found');
      h?.guide?.(null);
      if (!carries('transistor')) {
        this.spot.on(() => this.screen(tgt.x, 0.15, tgt.z, 0.6));
        this.spot.keys(['E']);
        await this.say('There it is. Pick it up. E.');
        await this.gate(() => carries('transistor'), ['E, to pick it up.'], 12);
        this.spot.off();
      }
      setFlag('fr:transistor');
      await this.say(pick(['Got it. Tiny thing. Holds my whole social life together.', 'That\'s the one. Back to a bench.']));
    }

    // ---- 9. the repair
    this.step = 'repair'; TUT.step = 'repair';
    if (this.bench) {
      const b = this.bench, bx = b.x + 1, bz = b.y + 0.5;
      this.calder.follow(false);
      void this.walk(bx + 1.2, bz + 0.6, false, 0.6);
      this.seen.delete('bench');
      await this.say('Back to the bench. Same as before.');
      const bV = () => (G.craft as unknown as { benchV?: { open?: boolean; stage?: (it: Item) => boolean } } | undefined)?.benchV;
      await this.gate(() => this.seen.has('bench') || !!bV()?.open, ['The bench. E.'], 20);
      if (!bV()?.open) await this.gate(() => !!bV()?.open, ['Back up to the bench. E.'], 12);
      for (const k of ['field_radio_dead', 'transistor']) { const it = p().allItems().find((i) => i.key === k); if (it) bV()?.stage?.(it); }
      await this.say('Radio and transistor on the boards. Green lamp, click, hold.');
      await this.gate(() => carries('radio_portable'), ['The ready sheet. Click it and hold.'], 18);
    }
    setFlag('fr:radio');
    setTrackerTimer(null);
    G.audio?.ui?.('static_burst', 0.4);
    await this.sleep(0.8);
    await this.say(pick(['...and I can hear you. Properly. Oh, that\'s so much better.', 'Testing. Testing. There you are. Loud and clear.']));
    await installApp('map');
    await this.say('Map. You earned it. Now the real job: the press, the debt, all of it. Tasks will tell you.');
    this.calder.gesture('wave');
    await this.say('I\'ll be in your ear. Don\'t die. I mean it.');
  }

  /** the cooking lesson (src/cook): a stove or a lit fire near, raw meat in the pan, flipped, plated */
  private async cooking() {
    const cook = (G as unknown as { cook?: { stations?: (z?: Zone) => TileObject[]; state?: () => { open?: boolean } } }).cook;
    const p = G.local!;
    const z = G.zones.get(p.zoneKey);
    const st = cook?.stations?.(z ?? undefined)?.filter((o) => Math.hypot(o.x - p.x, o.y - p.z) < 30)?.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.z) - Math.hypot(b.x - p.x, b.y - p.z))[0];
    if (!st) return;
    this.step = 'cook'; TUT.step = 'cook';
    const meat = createItem('small_meat_raw');
    p.inv.add(meat); bus.emit('inventoryChanged', p);
    this.lock(['up', 'down', 'left', 'right', 'run']);
    void this.walk(st.x + 1.4, st.y + 1, false, 0.6);
    await this.say('Food next. I brought you something. Raw meat makes you sick down here, so we cook it.');
    await this.gate(() => Math.hypot(p.x - st.x - 0.5, p.z - st.y - 0.5) < 2.6, ['This way, to the stove.'], 12);
    this.spot.on(this.objSpot(st, 1.0));
    this.spot.keys(['E']);
    this.lock(['interact', 'up', 'down', 'left', 'right']);
    await this.say('E, at the stove.');
    await this.gate(() => !!this.cook.open, ['The stove. E.'], 14);
    this.spot.off();
    await this.say('Meat in the pan. Drag it on.');
    await this.gate(() => !!this.cook.pan, ['Drag the meat into the pan.'], 14);
    await this.say('Wait till the underside browns. Then flip it.');
    await this.gate(() => !!this.cook.flip, ['Flip it. The edge goes brown first.'], 16);
    await this.say('Other side now. Don\'t walk off, it burns fast.');
    await this.gate(() => !!this.cook.cooked || !!this.cook.burnt, ['Almost.'], 16);
    if (this.cook.burnt) await this.say('Burnt. Honestly? Still edible. Plate it.');
    else await this.say('Perfect. Plate it.');
    await this.gate(() => !!this.cook.plated || !!this.cook.close, ['Onto the plate.'], 14);
    await this.say(pick(['Look at that. Dinner. The first thing down here that isn\'t trying to eat you.', 'Eat when you can. Starving makes the hands shake.']));
  }

  // ---------------------------------------------------------------- the world bits
  /** the issue kit moves into a supply bag that lies at the unit's feet; the unit keeps only what it wears */
  private packBag() {
    const p = G.local!, z = G.zones.get(p.zoneKey);
    if (!z) return;
    const s = spotNear(p.zoneKey, p.x, p.z, 1.2, 2.2) ?? { x: p.x + 1, z: p.z };
    const nu = uid();
    op('objAdd', { z: z.key, obj: { uid: nu, key: 'supply_bag', x: Math.floor(s.x), y: Math.floor(s.z), rot: 0, state: {}, inv: { uid: uid(), name: 'Supply bag', kind: 'pile', capacity: 30, reduction: 0, lootDone: true, locked: false, owner: 'obj:' + nu, items: [] } } });
    const o = z.objects.get(nu);
    if (!o?.inv) return;
    this.bag = o;
    const keep = new Set(['bailiff_band']);
    for (const it of p.allItems()) {
      if (p.isWorn(it) || keep.has(it.key)) continue;
      // only what the unit carries loose (not the pack it wears, not what lies inside a worn bag's own lining)
      const c = p.containerOf(it);
      if (!c) continue;
      c.remove(it);
      o.inv.add(it);
    }
    for (const k of ['cloth', 'field_radio_dead']) { try { o.inv.add(createItem(k)); } catch (e) { console.warn('bag', k, e); } }
    bus.emit('inventoryChanged', p);
  }
  /** a workbench in this level (the nearest), or one set down near the unit if there is none */
  private async findBench(): Promise<TileObject | null> {
    const p = G.local!, z = G.zones.get(p.zoneKey);
    if (!z) return null;
    let best: TileObject | null = null, bd = 40;
    for (const o of z.objects.values()) {
      if (!objDef(o.key)?.tags?.includes('workbench')) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.z);
      if (d < bd && findPath(z, Math.floor(p.x), Math.floor(p.z), o.x, o.y + 1, { doors: true })) { bd = d; best = o; }
    }
    if (best) return best;
    // none near: she had one sent down (a field bench, set down a few steps away)
    const s = spotNear(p.zoneKey, p.x, p.z, 2.5, 6, false, (x, y) => !walkable(z, x + 1, y) || z.objectsAt(x + 1, y).length > 0) ?? spotNear(p.zoneKey, p.x, p.z, 2, 8);
    if (!s) return null;
    const nu = uid();
    op('objAdd', { z: z.key, obj: { uid: nu, key: 'workbench', x: Math.floor(s.x), y: Math.floor(s.z), rot: 0, state: { built: true }, inv: null } });
    return z.objects.get(nu) ?? null;
  }
  /** the transistor lies somewhere on this floor, a walk away, and the scanner marks it */
  private placeTransistor(): { x: number; z: number } | null {
    const p = G.local!;
    const s = spotNear(p.zoneKey, p.x, p.z, 10, 20, true) ?? spotNear(p.zoneKey, p.x, p.z, 5, 9, true);
    if (!s) return null;
    const it = createItem('transistor');
    op('dropFloor', { z: p.zoneKey, item: serializeItem(it), x: s.x, zz: s.z, y: 0.05 });
    FIRST.target = { zone: p.zoneKey, x: s.x, z: s.z };
    return s;
  }

  // ================================================================== the end (or a skip)
  private skip() {
    if (this.over) return;
    this.interject('Okay. You know where I am. The bag\'s still there, take your kit.');
    this.over = true;
    for (const w of this.waits.splice(0)) w.rej(SKIP);
  }

  private finish() {
    this.over = true;
    for (const w of this.waits.splice(0)) w.rej(SKIP);
    for (const f of this.offs.splice(0)) { try { f(); } catch { /* gone */ } }
    this.spot.off();
    setTimeout(() => this.spot.dispose(), 600);
    setTrackerTimer(null);
    setFlag('tut:done'); setFlag('fr:done');
    // the band gets what a skip skipped; a finished run keeps its earned apps and gets the basics
    for (const k of ['scanner', 'map', 'settings', 'term']) void installApp(k, true);
    if (!has('fr:radio')) { const q = (G.missions as unknown as { quests?: { track(k: string | null): void } }).quests; q?.track(null); }
    TUT.running = false; TUT.step = '';
    FIRST.on = false;
    floatQuiet(false);
    const h = G.handler as unknown as { cine?: boolean; guide?: (t: null) => void } | null;
    if (h) { h.cine = false; h.guide?.(null); }
    // she walks off down a corridor and is gone
    const c = this.calder.c, p = G.local;
    if (c && p) {
      const away = spotNear(c.zoneKey, c.x, c.z, 10, 18, true);
      if (away) this.calder.goal(away.x, away.z, false, 0.8);
      setTimeout(() => this.calder.remove(), 9000);
    }
    const g = this.g as unknown as { systems: unknown[] };
    const i = g.systems.indexOf(this);
    if (i >= 0) g.systems.splice(i, 1);
    running = null;
  }
}

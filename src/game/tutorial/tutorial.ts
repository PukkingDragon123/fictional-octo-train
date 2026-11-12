// The contract tutorial: Dr. Iris Calder walks you through the unit, in the
// normal game view (isometric, third person; never through the eyes). She is
// a full-colour hologram on your screen (src/ui/holo/calderHolo.ts) that
// shimmers in, stands on the glass in front of the picture and points: at the
// unit, at the parts of the body console (the heart, the brain, the
// digester, the pump and its balloon, the rucksack), at the
// hotbar, at a chair in the room and the label floating over it, at the
// press, at an inhabitant, at the door. The camera comes in close on the unit
// and the thing being taught, then eases back out. No lesson cards, no step
// counters, no recap screens: she shows each part, then you do it.
//
// She talks a lot, and you can answer her (src/ui/holo/calderReplies.ts:
// square, chamfered plates, 1-3, a click or a tap); what she says back
// depends on what you said. Gentle, dry, and on the Institute's clock.
//
// A little forced: each lesson waits until you have done the thing (she
// repeats herself, then insists), the press refuses the unit's furniture
// until the press lesson, and every door out stays shut until she is done.
//
//   walk, run (the balloon), the pump, crouch, the body console, the hotbar,
//   the suit lamp, the pack, a piece of furniture (get a grip),
//   the press (feed it), an inhabitant (hold Q: the suit scans), the link
//   (resync), the door; the loop itself, said out loud (no tracker plate)
//
// Runs once per contract (flag 'tut:done'), only for the host / solo with the
// contract on (never free survival or a co-op joiner), never under a test
// driver (navigator.webdriver) unless ?tutorial=1. Esc (when no menu is up),
// the skip plate or a pad's Start ends it at once: she signs off, the doors
// and the press open. ?quick&tutorial=1 stages it on a quick start (dev).
//
//   tutorialWanted(), startTutorial(g), tutorialRunning()
import * as THREE from 'three';
import { G } from '../G';
import type { Game, GameSystem } from '../game';
import type { Action } from '../../core/input';
import type { Player } from '../../entities/player';
import type { TileObject } from '../../world/zone';
import type { ResearcherGesture } from '../../entities/researcher';
import { bus } from '../../core/events';
import { objDef } from '../../world/objects';
import { floatQuiet, floatText } from '../../social/floatText';
import { offscreen } from '../../ui/holo/subs';
import { skipPlate, pollPadSkip, type SkipPlate } from '../introKit/skip';
import { readTime } from '../lines';
import { RadioVoice } from '../vossVoice';
import { rigNumber } from '../../content/items/prisoner';
import { calderHolo, type CalderHolo } from '../../ui/holo/calderHolo';
import { askCalder, cancelAsk } from '../../ui/holo/calderReplies';
import { TUT } from './state';

interface PushApi {
  holding?: unknown; mode?: string; st?: { o?: TileObject } | null;
  liftable?: (p: Player, o: TileObject, power?: boolean) => boolean;
  carryInfo?: () => { mass: number; tier: number; name: string; nearPress: boolean } | null;
  feed?: (p: Player) => boolean;
}
type Pt = { x: number; y: number };
type Aim = () => Pt | null;
type HudPart = 'heart' | 'brain' | 'jar' | 'lung' | 'balloon' | 'pack';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const v1 = new THREE.Vector3();
const push = () => (G as unknown as { destruct?: { push?: PushApi } }).destruct?.push ?? null;
const isTouch = () => document.documentElement.classList.contains('nc-touch') || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** a skip unwinds the script */
const SKIP = Symbol('tutorial skipped');
/** the pickAt kinds of the body console for each part */
const PICK: Record<HudPart, string[]> = { heart: ['bag'], brain: ['brain'], jar: ['jar'], lung: ['lung', 'gauge'], balloon: ['balloon'], pack: ['pack'] };

let running: Tutorial | null = null;
export function tutorialRunning(): boolean { return !!running; }

/** should a contract run get the staged tutorial now */
export function tutorialWanted(g: Game = G as unknown as Game): boolean {
  const m = (g as unknown as { missions?: { enabled?: boolean; flags?: Set<string> } }).missions;
  if (!m || m.enabled === false) return false;
  if (m.flags?.has('tut:done') || m.flags?.has('contract:first_deposit')) return false;
  const net = (g as unknown as { net?: { mode?: string; isClient?: boolean } }).net;
  if (net?.isClient || net?.mode === 'client') return false;
  // automated runs (the walkthrough) play on; ?tutorial=1 still forces it
  if (typeof navigator !== 'undefined' && navigator.webdriver && !/[?&]tutorial=1/.test(location.search)) return false;
  return !!g.local;
}

export function startTutorial(g: Game = G as unknown as Game): Tutorial | null {
  if (running || !tutorialWanted(g)) return null;
  const t = new Tutorial(g);
  g.addSystem(t);
  if (import.meta.env.DEV) (window as unknown as { __tut: Tutorial }).__tut = t;
  return t;
}

const CSS = `
.tut-root { position: fixed; inset: 0; pointer-events: none; z-index: 64; font-family: var(--font-new); }
.tut-hl { position: absolute; pointer-events: none; opacity: 0; transition: opacity .25s; }
.tut-hl.on { opacity: 1; animation: tut-hl 1.1s steps(4) infinite; }
.tut-hl i { position: absolute; width: 14px; height: 14px; border: 0 solid #8fe8ff; filter: drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000) drop-shadow(0 0 4px rgba(110, 220, 255, .8)); }
.tut-hl i:nth-child(1) { left: 0; top: 0; border-left-width: 4px; border-top-width: 4px; }
.tut-hl i:nth-child(2) { right: 0; top: 0; border-right-width: 4px; border-top-width: 4px; }
.tut-hl i:nth-child(3) { left: 0; bottom: 0; border-left-width: 4px; border-bottom-width: 4px; }
.tut-hl i:nth-child(4) { right: 0; bottom: 0; border-right-width: 4px; border-bottom-width: 4px; }
@keyframes tut-hl { 50% { transform: scale(1.06); } }
.tut-keys { position: absolute; transform: translate(-50%, -100%); display: flex; gap: 4px; opacity: 0; transition: opacity .25s; }
.tut-keys.on { opacity: 1; }
.tut-keys b { display: grid; place-items: center; min-width: 32px; height: 32px; padding: 0 6px; box-sizing: border-box; font-weight: 400; font-size: 16px; line-height: 16px; color: #10161a;
  background: linear-gradient(180deg, #f2f6f8, #c2ccd0); box-shadow: inset 0 -4px 0 #7f8c90, 0 0 0 2px #0c1012, 0 3px 0 2px rgba(0,0,0,.4);
  clip-path: polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px); }
.tut-keys b.lit { background: linear-gradient(180deg, #fff2c8, #ffd890); box-shadow: inset 0 -2px 0 #b8904a, 0 0 0 2px #0c1012; transform: translateY(2px); }
.tut-keys.wasd { display: grid; grid-template-columns: repeat(3, 32px); grid-template-rows: 32px 32px; gap: 4px; }
.tut-keys.wasd b:nth-child(1) { grid-column: 2; grid-row: 1; } .tut-keys.wasd b:nth-child(2) { grid-column: 1; grid-row: 2; }
.tut-keys.wasd b:nth-child(3) { grid-column: 2; grid-row: 2; } .tut-keys.wasd b:nth-child(4) { grid-column: 3; grid-row: 2; }
`;

export class Tutorial implements GameSystem {
  name = 'tutorial';
  /** the current lesson (TUT.step mirrors it) */
  step = 'hello';
  private clock = 0;
  private waits: { cond: () => boolean; res: () => void; rej: (e: unknown) => void }[] = [];
  private over = false;
  private holo: CalderHolo;
  private voice = new RadioVoice(205, 1, 'calder');
  private num: string;
  private touch = isTouch();
  // what the unit has done (counted every frame)
  private walked = 0; private runT = 0; private sneakT = 0; private qHeld = 0;
  private pumped = 0; private hotKey = 0; private heartClicked = 0;
  private fed = false; private deposited = 0;
  private lastPos = { x: 0, z: 0 };
  // gates the lessons hold shut
  private pressOpen = false; private doorsOpen = false;
  private refused = new Set<number>();
  private target: TileObject | null = null;
  private saidHeavy = false;
  private nagT = 0;
  // the camera: framed on a spot or following the unit, zoomed in; w eases it in and out
  private cam = { on: false, follow: true, focus: new THREE.Vector3(), goal: new THREE.Vector3(), zoom: 1, zoomGoal: 1, rate: 2, w: 0 };
  private camSaved: { px: number; target: THREE.Vector3 } | null = null;
  // dom
  private root: HTMLDivElement; private hlEl: HTMLDivElement; private keysEl: HTMLDivElement;
  private plate: SkipPlate;
  private hlFn: (() => DOMRect | null) | null = null;
  private keysAt: (() => THREE.Vector3 | null) | null = null;
  private offs: (() => void)[] = [];
  private quietHeld = false;

  constructor(public g: Game) {
    running = this;
    TUT.running = true; TUT.step = 'hello'; TUT.target = -1;
    const p = G.local!;
    this.num = (p as unknown as { prisonerNo?: string }).prisonerNo || rigNumber(p.rig);
    this.lastPos = { x: p.x, z: p.z };
    if (!document.getElementById('tut-css')) { const st = document.createElement('style'); st.id = 'tut-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = (cls: string, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; return e; };
    this.root = el('tut-root');
    this.hlEl = el('tut-hl', '<i></i><i></i><i></i><i></i>');
    this.keysEl = el('tut-keys');
    this.plate = skipPlate(() => this.skip(), 'Skip lessons');
    this.plate.setKey(this.touch ? '' : 'Esc');
    this.plate.el.classList.add('on');
    this.plate.el.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    this.plate.el.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; });
    this.root.append(this.hlEl, this.keysEl, this.plate.el);
    document.body.appendChild(this.root);
    floatQuiet(true); this.quietHeld = true;
    // her own lines only (the handler's soft guide and its reactions stand down while she teaches)
    const h = G.handler as unknown as { briefed?: boolean; cine?: boolean; hush?: () => void; guide?: (t: null) => void } | null;
    if (h) { h.briefed = true; h.hush?.(); h.cine = true; h.guide?.(null); }
    this.holo = calderHolo();
    this.hooks();
    void this.run();
  }

  // ================================================================== hooks
  private hooks() {
    const g = this.g;
    const on = (ev: string, fn: (...a: any[]) => void) => this.offs.push(bus.on(ev, fn));
    on('grabbed', (p: Player, o: TileObject, mode: string) => { if (p === G.local) this.onGrab(o, mode); });
    on('carryFed', (p: Player) => { if (p === G.local) this.fed = true; });
    on('deposited', (d: { by: string; value: number }) => { if (d?.by === G.local?.id) { this.fed = true; this.deposited += Math.max(0, Number(d.value) || 0); } });
    // Esc skips (only while no menu, reader or pack is up)
    const inp = g.input as unknown as { hit: (a: Action) => boolean };
    const own = Object.prototype.hasOwnProperty.call(inp, 'hit') ? inp.hit : undefined;
    const orig = inp.hit.bind(inp);
    const hit = (a: Action) => {
      const v = orig(a);
      if (a === 'pause' && v) {
        const ui = g.ui as unknown as { menuEl?: unknown; readerEl?: unknown; modal?: unknown; inventory?: { open?: boolean } } | undefined;
        if (!(ui?.menuEl || ui?.readerEl || ui?.modal || ui?.inventory?.open)) { this.skip(); return false; }
      }
      return v;
    };
    inp.hit = hit;
    this.offs.push(() => { if (inp.hit !== hit) return; if (own) inp.hit = own; else delete (inp as { hit?: unknown }).hit; });
    // what the hands and keys do (watched, never swallowed)
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyH') this.pumped++;
      if (/^Digit[1-9]$/.test(e.code)) this.hotKey++;
    };
    window.addEventListener('keydown', key);
    this.offs.push(() => window.removeEventListener('keydown', key));
    const tap = (e: PointerEvent) => {
      if (this.plate.el.contains(e.target as Node)) return;
      const hb = G.hudBody as unknown as { pickAt?: (x: number, y: number) => { kind: string | null } } | null;
      let k: string | null = null;
      try { k = hb?.pickAt?.(e.clientX, e.clientY)?.kind ?? null; } catch { /* no console */ }
      if (k === 'bag') this.heartClicked++;
      if (k === 'lung' || k === 'gauge' || k === 'balloon') this.pumped++;
      if ((e.target as Element)?.closest?.('#hot12 .hb-slot')) this.hotKey++;
    };
    window.addEventListener('pointerdown', tap, true);
    this.offs.push(() => window.removeEventListener('pointerdown', tap, true));
    // the doors stay shut until she is done
    const gg = g as unknown as { travel: (p: Player, ...a: unknown[]) => void };
    const ownT = Object.prototype.hasOwnProperty.call(gg, 'travel') ? gg.travel : undefined;
    const travel0 = gg.travel.bind(g);
    const travel = (p: Player, ...a: unknown[]) => {
      if (!this.doorsOpen && p === G.local) { this.refuse('door'); return; }
      return travel0(p, ...a);
    };
    gg.travel = travel;
    this.offs.push(() => { if (gg.travel !== travel) return; if (ownT) gg.travel = ownT; else delete (gg as { travel?: unknown }).travel; });
    // the press takes nothing until the press lesson
    const pu = push();
    if (pu?.feed) {
      const ownF = Object.prototype.hasOwnProperty.call(pu, 'feed') ? pu.feed : undefined;
      const feed0 = pu.feed.bind(pu);
      const feed = (p: Player) => { if (!this.pressOpen && p === G.local) { this.refuse('press'); return false; } return feed0(p); };
      pu.feed = feed;
      this.offs.push(() => { if (pu.feed !== feed) return; if (ownF) pu.feed = ownF; else delete pu.feed; });
    }
    this.hookCamera();
  }
  private refusedAt = -99;
  private refuse(what: 'door' | 'press') {
    if (this.clock - this.refusedAt < 6) return;
    this.refusedAt = this.clock;
    G.audio?.flat?.('door_locked', 'sfx', 0.5);
    this.holo.jolt(0.5);
    this.interject(what === 'door'
      ? pick(['Not yet. That door opens when we are finished, and not a minute before.', 'Locked. I locked it. Lessons first, {n}.', 'The door is not part of this lesson. Come back.'])
      : pick(['Not yet. The press can wait for a unit that knows what it is doing.', 'Lessons first, press after. The ledger is patient. I am less so.']));
  }

  // ================================================================== the script
  private async run() {
    try { await this.script(); } catch (e) { if (e !== SKIP) console.warn('tutorial', e); }
    this.finish();
  }

  private async script() {
    const T = this.touch;
    const p = () => G.local!;
    const unit: Aim = () => this.screenOf(v1.set(p().x, p().y + 1.0, p().z));

    // ---- she comes on: the camera close on the unit, her picture shimmering in
    this.step = 'hello'; TUT.step = 'hello';
    this.camFollow(2.3, 1.2);
    await this.sleep(0.9);
    this.holo.standAt(0.8, 0.93);
    this.holo.appear();
    await this.sleep(1.0);
    this.holo.gesture('wave');
    // a proper hello first (her voice: public/voice/calder, src/audio/calderVoice.ts)
    await this.say('Hello! I am Dr. Iris Calder, from the Meridian Institute. It is so good to finally meet you, operator.', { expr: 'smile' });
    await this.say('That body on your screen is your unit. You are linked into it now, and I will be with you the whole way: the light on your screen, and the voice in its helmet.');
    await this.say('My job is to keep you both alive. Within budget.', { expr: 'smile' });
    const a0 = await this.ask(['Where am I?', 'What did they do to it?', 'Get me out of here.']);
    if (a0 === 0) { await this.say('Level 0. The first room of a very long building nobody built.'); await this.say('You are not lost. You are exactly where the Institute put you. That is worse, but it is tidier.', { gesture: 'shrug' }); }
    else if (a0 === 1) { await this.say('Intake. It is unpleasant and it is quick, and it is over.', { gesture: 'think' }); await this.say('I patched it on the way down. The bruises are on its file, not on its body. You are welcome.'); }
    else if (a0 === 2) { await this.say('Out is a direction, not a door. Work first. Out comes later, if the ledger agrees.', { gesture: 'shrug' }); await this.say('And the ledger has never once agreed quickly.'); }
    else { await this.say('Quiet type. Good. You will live longer than the ones who argue with me.'); }
    await this.say('Lessons, then. I talk, you do. Every door in here stays shut until you have done them all. I checked.', { gesture: 'talk' });

    // ---- walk
    this.lesson('walk');
    this.keys(T ? null : ['W', 'A', 'S', 'D'], 'wasd');
    this.aim(unit);
    await this.say(T ? 'The stick, bottom left. Walk it. Small steps, the legs are new to you.' : 'W, A, S, D. Walk it. Small steps, the legs are new to you.');
    this.holo.point(null);
    this.walked = 0;
    await this.gate(() => this.walked > 4.5, [
      'Any time now. The legs, {n}.',
      T ? 'The stick. Bottom left. Push it.' : 'W, A, S, D. I can wait. The Institute bills by the hour.',
      'It will not walk by itself. Well. Not yet. Walk it.',
    ], 8);
    this.keys(null);
    await this.say(pick(['There. Like a newborn deer with a debt.', 'Good. One foot, then the other. You would be amazed how many get that wrong.']));

    // ---- run, and the breath it costs (the balloon on the pump)
    this.lesson('run');
    this.keys(T ? null : ['Shift']);
    await this.say(T ? 'Faster. Tap RUN, on the right.' : 'Faster. Hold Shift and it runs.');
    this.runT = 0;
    await this.gate(() => this.runT > 1.0, [T ? 'RUN. The button on the right. Go on.' : 'Shift. Hold it while it walks.', 'Run, {n}. Not far. Just enough to hurt.'], 8);
    this.keys(null);
    this.camFollow(1.7);
    await this.show('balloon', 'Up there, on the machine. That balloon is its breath. Running empties it. Run it flat and it wheezes, and so will you.');
    this.show(null);
    await this.show('lung', T ? 'When it is winded, tap the pump. Try it now.' : 'The bellows under it is its lungs. H pumps them, on the beat. Try it. H.');
    this.pumped = 0;
    await this.gate(() => this.pumped > 0, [T ? 'The pump. Tap it.' : 'H. The pump.', 'In, out. It will not remember to breathe by itself when it is frightened. H.'], 8);
    this.show(null);
    await this.say('Good. Remember that when something is chasing it. Especially then.');

    // ---- crouch
    this.lesson('crouch');
    this.keys(T ? null : ['C']);
    await this.say(T ? 'Now get it low. SNEAK.' : 'Now get it low. C, or Control.');
    this.sneakT = 0;
    await this.gate(() => this.sneakT > 0.7, [T ? 'SNEAK. Low and slow.' : 'C. Down.', 'Lower, {n}. Pretend you are not here.'], 8);
    this.keys(null);
    await this.say('Quieter. Most of what lives down here hunts by ear. Some by smell. You do not want to meet the third kind.', { expr: 'think' });

    // ---- the body console: shown part by part, the heart tried by hand
    this.lesson('body');
    this.camFollow(1.5);
    await this.show('heart', 'Now the machine, top left. That is its body, as the rig reads it. The heart is its health.');
    await this.say('Wounds show up as holes in it. They spurt on every beat. Click a hole and the first-aid board swings in.');
    if (this.part('heart')) {
      await this.say(T ? 'Tap the heart. Go on. It does not bite.' : 'Click the heart. Go on. It does not bite.');
      this.heartClicked = 0;
      await this.gate(() => this.heartClicked > 0, [T ? 'The heart. Tap it.' : 'The heart, {n}. Click it.', 'It is the red thing. Pumping. Top left.'], 9);
      await this.say('Steady. Whole, for now. Keep it that way, the Institute bills for parts.');
    }
    await this.show('brain', 'The brain is its sanity. And yours: you share a wire. When it cracks, the link slips.');
    await this.show('jar', 'The digester is food and water. Feed it, or it starts on itself. Slowly. Loudly.');
    this.show(null);
    const a1 = await this.ask(['Why is it a machine?', 'The brain is... mine too?', 'Got it.']);
    if (a1 === 0) { await this.say('Because you read it better as plumbing than as a person. That is not my opinion. It is in the manual.', { gesture: 'shrug' }); }
    else if (a1 === 1) { await this.say('Your fear goes down the wire, its fear comes back up. Nobody has found the volume knob.', { expr: 'think' }); await this.say('Be calm, and it will be. That is most of the trick.'); }
    else if (a1 === 2) { await this.say('Good. I will not test you on it. The building will.'); }
    else { await this.say('I will take that as a yes.'); }

    // ---- the hotbar
    if (this.rectOf('#hot12')) {
      this.lesson('hotbar');
      await this.showRect(() => this.rectOf('#hot12'), T ? 'Down there, its hands. A short list. Tap a slot and it takes the thing into its hand.' : 'Down there: its hands, the short list. The number keys put a thing in its hand.');
      this.hotKey = 0;
      await this.say(T ? 'Tap one.' : 'Press one. Any of them.');
      await this.gate(() => this.hotKey > 0, [T ? 'A slot. Tap it.' : 'One. Two. Pick a number, {n}.', 'The little boxes, bottom of the screen.'], 8);
      this.showRect(null);
      const held = !!(p().handR || p().handL);
      await this.say(held ? 'There. In its hand. Again puts it away.' : 'Empty. It fills up as the unit finds things. Inspect it to arrange them.');
    }

    // ---- the suit lamp
    this.lesson('light');
    this.aim(unit);
    this.keys(T ? null : ['F']);
    await this.say(T ? 'The suit has a lamp on the helmet. The lamp button, on the right.' : 'The suit has a lamp on the helmet. F.');
    this.holo.point(null);
    const lit0 = p().flashlightOn;
    await this.gate(() => p().flashlightOn !== lit0, [T ? 'The lamp. Tap it.' : 'F, {n}. The lamp.', 'Some rooms down here have no lights. Some have lights you do not want. F.'], 8);
    this.keys(null);
    await this.say(p().flashlightOn ? 'Better. The battery is the unit\'s. The dark is ours.' : 'Off. Brave. The battery thanks you.');

    // ---- the pack
    this.lesson('pack');
    await this.show('pack', T ? 'The rucksack on the machine is its pack. Tap it.' : 'The rucksack on the machine is its pack. Press I, or click it.');
    this.keys(T ? null : ['I']);
    const inv = () => !!(G.ui as unknown as { inventory?: { open?: boolean } } | undefined)?.inventory?.open;
    await this.gate(inv, [T ? 'The pack. Tap it.' : 'I. The pack.', 'Everything it owns is in there. Have a look.'], 8);
    this.keys(null); this.show(null);
    await this.say('Everything it carries. Weight matters. It is not a mule. Mostly.');
    await this.say(T ? 'Close it again.' : 'Close it. I again, or Esc.');
    await this.gate(() => !inv(), ['Close the pack, {n}.', 'You can rummage later. On your own time.'], 8);

    // ---- the jobs: from her, out loud (and the J task board, when wanted)
    this.lesson('jobs');
    this.aim(unit);
    await this.say('Jobs come from me. I will say them as you go, and I will say them again when you forget.', { expr: 'smile' });
    this.holo.point(null);
    await this.say(T ? 'If you want them in front of you, my task board. It is on the pad.' : 'If you want them in front of you, J brings up my task board. Jobs pay research credit, and research is what the Institute actually wants from you.');

    // ---- the job: a piece of furniture, whole
    this.lesson('grip');
    this.findTarget();
    if (this.target) {
      const tg = () => this.targetAt();
      this.frameOn(tg, 2.1, 1.4);
      this.aim(() => { const t = tg(); return t ? this.screenOf(v1.set(t.x, t.y + 1.1, t.z)) : null; });
      await this.say('Now the job. The Institute collects furniture. Whole. Everything down here is built to last, so you do not break it, you carry it.', { gesture: 'present' });
      await this.say(`That one. The ${this.targetName()}. Light enough for a new body.`);
      this.camFollow(1.6, 1.4);
      await this.say(T ? 'Walk up to it. Its name floats over it: tap the name, then Carry.' : 'Walk up to it. Its name floats over it. Hold the right mouse button on it, or press G. Lift with the legs.');
      // close to it, she points at its floating label instead (src/ui/worldPrompt.ts) and lights it
      const label = () => { const t = tg(), p0 = p(); if (!t || Math.hypot(t.x - p0.x, t.z - p0.z) > 2.6) return null; return (G as unknown as { worldPrompt?: { primaryRect?: () => DOMRect | null } }).worldPrompt?.primaryRect?.() ?? null; };
      this.aim(() => { const r = label(); if (r) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; const t = tg(); return t ? this.screenOf(v1.set(t.x, t.y + 1.1, t.z)) : null; });
      this.hlFn = label; this.hlEl.classList.add('on');
      await this.gate(() => !!push()?.carryInfo?.(), [
        T ? 'Its floating name. Tap it, then Carry.' : 'Right button, held. Or G.',
        `The ${this.targetName()}, {n}. Pick it up.`,
        'It is a piece of furniture, not a riddle.',
      ], 10, () => { if (!this.target || !this.alive(this.target)) this.findTarget(); this.light(); }, () => this.light());
      this.hlFn = null; this.hlEl.classList.remove('on'); this.holo.point(null);
      await this.say('Got it. Good. Heavy things are slow, and slow things get caught. Keep that in mind.');
      const a2 = await this.ask(['Why furniture?', 'It\'s heavy.', 'Fine.']);
      if (a2 === 0) { await this.say('The Institute has a buyer on the other side. I have never asked who. You should not either.', { expr: 'think' }); }
      else if (a2 === 1) { await this.say('It is a chair, {n}. The unit has carried worse. Into here, for instance.', { gesture: 'shrug' }); }
      else if (a2 === 2) { await this.say('Fine is the best word I hear all week.'); }
      else { await this.say('Strong and silent. The file will love you.'); }

      // ---- the press: it opens now
      const hp = this.findHopper();
      if (hp) {
        this.lesson('press');
        this.pressOpen = true;
        this.frameOn(() => v1.set(hp.x, p().y + 0.6, hp.z).clone(), 1.9, 1.1);
        this.aim(() => this.screenOf(v1.set(hp.x, p().y + 1.4, hp.z)));
        await this.say('That is a Remittance Press. It eats what you feed it, and it pays the unit\'s number down.', { gesture: 'present' });
        this.camFollow(1.5, 1.2);
        await this.say(T ? 'Carry it over. Next to the plate, tap Feed over the press.' : 'Carry it over. Next to the plate, press E, and in it goes.');
        // she keeps a finger on the press; close to it, on its floating Feed label
        const near = () => { const p0 = p(); if (Math.hypot(hp.x - p0.x, hp.z - p0.z) > 3.4 || !push()?.carryInfo?.()) return null; return (G as unknown as { worldPrompt?: { primaryRect?: () => DOMRect | null } }).worldPrompt?.primaryRect?.() ?? null; };
        this.aim(() => { const r = near(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : this.screenOf(v1.set(hp.x, p().y + 1.4, hp.z)); });
        this.hlFn = near; this.hlEl.classList.add('on');
        this.fed = false;
        await this.gate(() => this.fed, [
          'To the press, {n}. The big machine.',
          T ? 'Next to the plate. Tap Feed.' : 'Next to the plate. E.',
          'If you put it down, pick it up again. The press is not going anywhere.',
        ], 10, undefined, () => this.lightAt(hp.x, hp.z, 0xffd9a0));
        this.hlFn = null; this.hlEl.classList.remove('on'); this.holo.point(null);
        await this.sleep(2.2);
        const d = this.debt();
        await this.say('Hear that? The number went down. That is the whole job, {n}. Furniture to the press, until the ledger goes quiet.', { expr: 'smile' });
        if (d && d.remaining > 0) await this.say(`It still owes ${fmt(d.remaining)} scrip. The ledger wants an installment every few days. Miss one, and the band bites. I do not enjoy that part. Much.`);
        const a3 = await this.ask(['And if I don\'t?', 'How long will it take?', 'Understood.']);
        if (a3 === 0) { this.holo.jolt(0.4); await this.say('Then the band does what bands do, and the Institute sends a new unit, and I have this conversation again.', { expr: 'think' }); await this.say('I am very tired of this conversation, {n}. Do not make me have it.'); }
        else if (a3 === 1) { await this.say('That depends on how many chairs there are in hell. Quite a lot, it turns out.', { gesture: 'shrug' }); }
        else if (a3 === 2) { await this.say('Understood is my second favourite word.'); }
        else { await this.say('Nothing to say? That is allowed. It is noted, but it is allowed.'); }
      } else this.pressOpen = true;
    } else this.pressOpen = true;

    // ---- an inhabitant, if one is about
    const c = this.findCreature();
    this.lesson('scan');
    if (c) {
      const at = () => (c.dead ? null : v1.set(c.x, c.y || p().y, c.z).clone());
      this.frameOn(at, 1.8, 1.0);
      this.aim(() => { const w = at(); return w ? this.screenOf(w.setY(w.y + 0.8)) : null; });
      await this.say('And there: a resident. Not a ghost, {n}, an organism. It lives here. You are visiting.', { expr: 'surprised' });
      await this.say(T ? 'Hold SCAN, and the suit\'s visor reads it. From a distance, please.' : 'Hold Q, and the suit\'s visor scans it. From a distance, please.');
      this.keys(T ? null : ['Q']);
      this.camFollow(1.3, 1.0);
      this.holo.point(null);
      const scans0 = this.scans();
      this.qHeld = 0;
      await this.gate(() => this.scans() > scans0 || this.qHeld > 1.2 || c.dead, [T ? 'Scan it. Hold SCAN.' : 'Q, held. Let the visor read it.', 'From a distance. I said that part already.'], 10, undefined, undefined, 30);
      this.keys(null);
      if (this.scans() > scans0) await this.say('Filed. The lab will be thrilled. The lab is always thrilled, it is very unsettling.');
    } else {
      await this.say(T ? 'You will meet the residents soon enough. Organisms, not ghosts. Hold SCAN and the visor reads one. From a distance, please.' : 'You will meet the residents soon enough. Organisms, not ghosts. Hold Q and the visor scans one. From a distance, please.');
    }

    // ---- the link: she slips it on purpose
    const L = (G as unknown as { link?: { force?: (k: string) => void; state?: string } }).link;
    if (L?.force) {
      this.lesson('link');
      this.camFollow(1.4, 1.0);
      await this.show('brain', 'Last thing, and you will hate it. When the brain cracks, the link slips: the unit lags, drifts, does things on its own.');
      this.show(null);
      await this.say(T ? 'I am going to slip it now. On purpose. Tap the LINK line to resync.' : 'I am going to slip it now. On purpose. L resyncs.', { gesture: 'think' });
      this.keys(T ? null : ['L']);
      try { L.force('desync'); } catch (e) { console.warn('link lesson', e); }
      this.holo.jolt(1);
      await this.sleep(0.6);
      await this.gate(() => L.state === 'ok', [T ? 'The LINK line. Tap it.' : 'L, {n}. Resync.', 'It is drifting. Bring it back. L.'], 8, undefined, undefined, 50);
      this.keys(null);
      await this.say('Locked. Good hands. Keep it calm and it will not happen often. Keep it terrified and it will happen all the time.');
    }

    // ---- the door: open now
    this.lesson('door');
    const ex = this.findExit();
    if (ex) {
      this.frameOn(() => v1.set(ex.x, p().y + 0.5, ex.z).clone(), 1.6, 0.9);
      this.aim(() => this.screenOf(v1.set(ex.x, p().y + 1.2, ex.z)));
      await this.say('That way is deeper. Deeper pays better. It also bites.', { gesture: 'present' });
    }
    this.doorsOpen = true;
    G.audio?.flat?.('door_open', 'sfx', 0.4);
    await this.say('The doors were locked the whole time, by the way. They are open now. That is how you know you passed.', { expr: 'smile' });
    this.holo.point(null);
    this.camFollow(1.15, 0.8);
    const a4 = await this.ask(['What\'s out there?', 'Will you be watching?', 'Thank you, doctor.']);
    if (a4 === 0) { await this.say('Rooms. More rooms. Things that live in rooms. Data that remembers what happened in them. Bring me all of it.'); }
    else if (a4 === 1) { await this.say('Always. It is in my contract, and in yours. Mine pays better.', { expr: 'smile' }); }
    else if (a4 === 2) { await this.say('Oh. Nobody says that.', { expr: 'surprised' }); await this.say('...Do not make it weird, {n}. Go to work.', { gesture: 'shrug' }); }
    else { await this.say('Right. Off you go then.'); }
    await this.say('So. Wake, work, press. Clear the debt and buy its way out. What it filed comes back to the lab, and then there is a next unit.', { gesture: 'talk' });
    await this.say('I will name the next step as you go. Stand up straight, {n}. Somebody is always watching.', { gesture: 'wave' });
    this.holo.dissolve();
    this.camRelease();
    await this.sleep(1.0);
  }

  // ================================================================== script helpers
  /** wait until a condition holds (checked every frame); a skip throws SKIP */
  private until(cond: () => boolean): Promise<void> {
    if (this.over) return Promise.reject(SKIP);
    return new Promise((res, rej) => this.waits.push({ cond, res, rej }));
  }
  private sleep(s: number) { if (this.rushTo) return Promise.resolve(); const t = this.clock + s; return this.until(() => this.clock >= t); }
  /** her line: the voice grains, the subtitle strip, her mouth and hands on the hologram */
  private async say(text: string, o: { gesture?: ResearcherGesture; expr?: string } = {}) {
    if (this.over) throw SKIP;
    if (this.rushTo) return;
    this.speak(text, o);
    await this.sleep(this.lineDur + 0.3);
  }
  private lineDur = 0;
  private speak(text: string, o: { gesture?: ResearcherGesture; expr?: string } = {}) {
    text = text.replace(/\{n\}/g, this.num);
    const voiced = this.voice.speak(text);
    const d = Math.max(voiced, readTime(text) * 0.82);
    this.lineDur = d;
    offscreen(floatText(text, { kind: 'voss', name: 'DR. CALDER', life: d + 0.5, pri: 3 }), d + 0.5);
    bus.emit('calderSpeak', { text, dur: d });
    this.holo.talk(d);
    if (o.expr) this.holo.expression(o.expr, Math.min(d, 3));
    // while she points, the point is the gesture
    if (this.holo.pointing) { /* arm on the target */ }
    else if (o.gesture) this.holo.gesture(o.gesture, Math.min(d, 3.2));
    else if (d > 2.2 && Math.random() < 0.5) this.holo.gesture(Math.random() < 0.75 ? 'talk' : 'nod', Math.min(d, 3));
  }
  /** a line that cuts in (a refusal) without waiting on the script */
  private interject(text: string) { this.voice.stop(); this.speak(text, this.holo.pointing ? {} : { gesture: 'shrug' }); }
  /** hold until the unit has done it: she repeats herself, then insists */
  private async gate(cond: () => boolean, nags: string[], every = 9, onNag?: () => void, tick?: () => void, giveUp = 0) {
    let i = 0;
    const t0 = this.clock;
    const c0 = cond;
    cond = () => c0() || !!this.rushTo;
    while (!cond()) {
      const t1 = this.clock;
      await this.until(() => { tick?.(); return cond() || this.clock - t1 > every + i * 2; });
      if (cond()) break;
      if (giveUp && this.clock - t0 > giveUp) break;
      onNag?.();
      this.holo.jolt(0.25);
      if (i >= nags.length) this.holo.gesture(Math.random() < 0.5 ? 'clipboard' : 'think', 3);
      await this.say(nags[i % nags.length]);
      i++;
    }
  }
  /** your answer (1-3, a click, a tap; -1 for silence) */
  private async ask(opts: string[]): Promise<number> {
    if (this.over) throw SKIP;
    if (this.rushTo) return -1;
    // the reply plates sit low in the middle: she steps aside for them
    if (this.holo.spot.x > 0.18 && this.holo.spot.x < 0.8) { this.holo.point(null); this.holo.standAt(0.85, 0.93); }
    this.holo.gesture('think', 2.5);
    let r = -2;
    void askCalder(opts, { secs: 30 }).then((i) => { r = i; });
    await this.until(() => r > -2);
    if (this.over) throw SKIP;
    return r;
  }
  private lesson(step: string) { this.step = step; TUT.step = step; if (this.rushTo === step) { this.rushTo = ''; this.holo.snap(); } G.audio?.ui?.('watchTick', 0.25); }

  /** point at a part of the body console and light it while she says the line */
  private async show(part: HudPart | null, text?: string) {
    if (!part) { this.showRect(null); return; }
    const at = () => this.part(part);
    if (!at()) { if (text) await this.say(text); return; }
    await this.showRect(() => this.partRect(part), text, at);
  }
  private async showRect(rect: (() => DOMRect | null) | null, text?: string, at?: Aim) {
    this.hlFn = rect;
    if (!rect) { this.hlEl.classList.remove('on'); this.holo.point(null); return; }
    const aim: Aim = at ?? (() => { const r = rect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
    const s = aim();
    if (s) this.holo.standAt(this.spotFor(s), 0.93);
    this.hlEl.classList.add('on');
    G.audio?.ui?.('watchTick', 0.35);
    this.holo.point(aim);
    if (text) await this.say(text);
  }
  /** she steps beside the thing (screen), then points at it; null puts the arm down */
  private aim(fn: Aim | null) {
    if (fn) { const s = fn(); if (s) this.holo.standAt(this.spotFor(s), 0.93); }
    this.holo.point(fn);
  }
  /** where she stands to point at a spot: beside it, on the side her right arm reaches */
  private spotFor(s: Pt): number {
    const tx = s.x / innerWidth;
    if (s.y < innerHeight * 0.45 && tx < 0.35) return clamp(tx + 0.12, 0.14, 0.24);
    return tx < 0.62 ? Math.min(0.88, tx + 0.27) : Math.max(0.12, tx - 0.3);
  }
  /** keycaps floating over the unit while it should press them */
  private keys(list: string[] | null, cls = '', at?: () => THREE.Vector3 | null) {
    if (!list) { this.keysEl.classList.remove('on'); this.keysAt = null; return; }
    this.keysEl.className = 'tut-keys' + (cls ? ' ' + cls : '');
    this.keysEl.innerHTML = list.map((k) => `<b data-k="${k}">${k}</b>`).join('');
    this.keysAt = at ?? (() => { const p = G.local; return p ? v1.set(p.x, p.y + 2.25, p.z) : null; });
    requestAnimationFrame(() => this.keysEl.classList.add('on'));
  }

  // ------------------------------------------------------------------ where things are on screen
  private screenOf(w: THREE.Vector3): Pt | null {
    const pr = G.pr as unknown as { worldToScreen?: (v: THREE.Vector3) => { x: number; y: number; z: number } };
    const s = pr?.worldToScreen?.(w);
    if (!s || !isFinite(s.x) || !isFinite(s.y)) return null;
    return { x: clamp(s.x, 8, innerWidth - 8), y: clamp(s.y, 8, innerHeight - 8) };
  }
  private hudOn(): boolean {
    const ov = document.querySelector('canvas.bh-ov');
    if (!ov) return false;
    const r = ov.getBoundingClientRect(), cs = getComputedStyle(ov);
    return r.width > 4 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
  }
  private part(kind: HudPart): Pt | null {
    const hb = G.hudBody as unknown as { propScreen?: (k: string) => Pt } | null;
    if (!hb?.propScreen || !this.hudOn()) return null;
    try { const s = hb.propScreen(kind); return s && (s.x > 1 || s.y > 1) && isFinite(s.x) ? s : null; } catch { return null; }
  }
  private rectCache = new Map<string, { at: number; r: DOMRect | null }>();
  /** the part's box on screen: sampled from the console's own hit test (cached), else a box round its centre */
  private partRect(kind: HudPart): DOMRect | null {
    const c = this.rectCache.get(kind), now = performance.now();
    if (c && now - c.at < 700) return c.r;
    let r: DOMRect | null = null;
    const hb = G.hudBody as unknown as { pickAt?: (x: number, y: number) => { kind: string | null } } | null;
    const ov = document.querySelector('canvas.bh-ov');
    const want = PICK[kind];
    if (hb?.pickAt && ov && this.hudOn()) {
      const R = ov.getBoundingClientRect();
      let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
      try {
        for (let y = R.top; y < R.bottom + 120; y += 6) for (let x = R.left; x < R.right; x += 6) {
          const k = hb.pickAt(x, y).kind;
          if (k && want.includes(k)) { l = Math.min(l, x); t = Math.min(t, y); rr = Math.max(rr, x); b = Math.max(b, y); }
        }
      } catch { /* no console */ }
      if (l < Infinity) r = new DOMRect(l - 5, t - 5, rr - l + 10, b - t + 10);
    }
    if (!r) { const s = this.part(kind); if (s) r = new DOMRect(s.x - 28, s.y - 28, 56, 56); }
    this.rectCache.set(kind, { at: now, r });
    return r;
  }
  private rectOf(sel: string): DOMRect | null {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden' ? r : null;
  }

  // ------------------------------------------------------------------ the camera (iso, framed and zoomed)
  private hookCamera() {
    const camera = this.g.camera as unknown as { update: (dt: number) => void };
    const own = Object.prototype.hasOwnProperty.call(camera, 'update') ? camera.update : null;
    const orig = camera.update.bind(camera);
    const pr = this.g.pr;
    const p0 = G.local!;
    this.cam.focus.set(p0.x, p0.y + 0.6, p0.z);
    const fn = (dt: number) => {
      // the camera's own state back first (its smoothing never sees our override)
      if (this.camSaved) { pr.pxSize = this.camSaved.px; pr.target.copy(this.camSaved.target); this.camSaved = null; }
      orig(dt);
      const c = this.cam, p = G.local;
      c.w += ((c.on ? 1 : 0) - c.w) * (1 - Math.exp(-dt * (c.on ? 2.4 : 1.4)));
      if (c.w < 0.002 && !c.on) return;
      if (c.follow && p) c.goal.set(p.x, p.y + 0.6, p.z);
      const k = 1 - Math.exp(-dt * c.rate);
      c.focus.lerp(c.goal, k);
      c.zoom += (c.zoomGoal - c.zoom) * k;
      this.camSaved = { px: pr.pxSize, target: pr.target.clone() };
      pr.target.lerp(c.focus, c.w);
      pr.pxSize = pr.pxSize / Math.max(0.3, 1 + (c.zoom - 1) * c.w);
      pr.updateCamera(0);
    };
    camera.update = fn;
    this.offs.push(() => {
      if (this.camSaved) { pr.pxSize = this.camSaved.px; pr.target.copy(this.camSaved.target); this.camSaved = null; }
      if (camera.update !== fn) return;
      if (own) camera.update = own; else delete (camera as { update?: unknown }).update;
    });
  }
  /** close on the unit, following it */
  private camFollow(zoom: number, rate = 1.6) {
    const c = this.cam;
    if (!c.on && c.w < 0.05) { const p = G.local!; c.focus.set(p.x, p.y + 0.6, p.z); c.zoom = 1; }
    c.on = true; c.follow = true; c.zoomGoal = zoom; c.rate = rate;
  }
  /** close on a thing (it may move: the function is read every frame while framed) */
  private frameOn(at: () => THREE.Vector3 | null, zoom: number, rate = 1.4) {
    const c = this.cam;
    const w = at();
    if (!w) return;
    if (!c.on && c.w < 0.05) { const p = G.local!; c.focus.set(p.x, p.y + 0.6, p.z); c.zoom = 1; }
    c.on = true; c.follow = false; c.goal.copy(w); c.zoomGoal = zoom; c.rate = rate;
    this.frameFn = at;
  }
  private frameFn: (() => THREE.Vector3 | null) | null = null;
  private camRelease() { this.cam.on = false; this.cam.zoomGoal = 1; this.frameFn = null; }

  // ------------------------------------------------------------------ world queries
  private alive(o: TileObject) { const z = G.view?.zone; return !!z?.objects.get(o.uid); }
  /** the nearest piece of furniture the unit can lift whole */
  private findTarget() {
    const p = G.local; const z = G.view?.zone; if (!p || !z) return;
    const pu = push();
    let best: TileObject | null = null, bs = 1e9;
    for (const o of z.objects.values()) {
      const d = objDef(o.key);
      if (!d || d.ceiling || d.onWall || o.key === 'hopper' || this.refused.has(o.uid)) continue;
      if (pu?.liftable ? !pu.liftable(p, o) : !d.movable) continue;
      const dist = Math.hypot(o.x + 0.5 - p.x, o.y + 0.5 - p.z);
      if (dist < 1.2 || dist > 18) continue;
      if (G.view?.vis && !G.view.vis.isVisible(o.x, o.y) && dist > 4) continue;
      const m = (d as { mass?: number }).mass ?? 20;
      const s = dist + (m < 8 ? 4 : 0);
      if (s < bs) { bs = s; best = o; }
    }
    this.target = best;
    TUT.target = best ? best.uid : -1;
  }
  private targetAt(): THREE.Vector3 | null {
    const z = G.view?.zone, o0 = this.target;
    const o = o0 && z ? z.objects.get(o0.uid) ?? null : null;
    if (!o || !z) return null;
    const d = objDef(o.key)!;
    const w = d.w ?? 1, dd = d.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    return new THREE.Vector3(o.x + rw / 2, z.heightAt(o.x, o.y), o.y + rd / 2);
  }
  private targetName() { const o = this.target; return o ? (objDef(o.key)?.name || 'chair').toLowerCase() : 'chair'; }
  private onGrab(o: TileObject, mode: string) {
    if (this.step !== 'grip') return;
    if (mode === 'carry') { this.target = o; TUT.target = o.uid; return; }
    // pushing: too heavy to lift
    this.refused.add(o.uid);
    if (!this.saidHeavy) { this.saidHeavy = true; this.interject(this.touch ? 'Too heavy to lift. That one you push. Let go and find something lighter: I have lit one.' : 'Too heavy to lift. That one you push. Let go, and find something lighter: I have lit one.'); }
    this.findTarget();
  }
  private findHopper(): { x: number; z: number } | null {
    const h = G.handler as unknown as { nearestHopper?: () => { x: number; z: number } | null } | null;
    return h?.nearestHopper?.() ?? null;
  }
  private findExit(): { x: number; z: number } | null {
    const p = G.local, z = G.view?.zone; if (!p || !z) return null;
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const pt of z.portals) {
      if (pt.hidden || pt.kind === 'loop' || pt.kind === 'walk') continue;
      const d = Math.hypot(pt.x + 0.5 - p.x, pt.y + 0.5 - p.z);
      if (d < bd && d < 30) { bd = d; best = { x: pt.x + 0.5, z: pt.y + 0.5 }; }
    }
    return best;
  }
  private findCreature(): { x: number; y: number; z: number; dead: boolean } | null {
    const p = G.local; if (!p) return null;
    const cs = (G as unknown as { creatures?: { creatures?: Map<string, { x: number; y: number; z: number; dead: boolean; zoneKey: string }> } }).creatures?.creatures;
    let best: { x: number; y: number; z: number; dead: boolean } | null = null, bd = 16;
    for (const c of cs?.values() ?? []) {
      if (c.dead || c.zoneKey !== p.zoneKey) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd && (!G.view?.vis || G.view.vis.isVisible(Math.floor(c.x), Math.floor(c.z)))) { bd = d; best = c; }
    }
    return best;
  }
  private scans(): number { let n = 0; for (const f of (G.missions?.flags ?? new Set<string>()) as Set<string>) if (f.startsWith('scan:')) n++; return n; }
  private debt(): { remaining: number } | null { try { return (G as unknown as { debt?: { state?: () => { remaining: number } } }).debt?.state?.() ?? null; } catch { return null; } }
  private light() { const t = this.targetAt(); if (t) this.lightAt(t.x, t.z, 0xffe2b0, t.y); }
  private lightAt(x: number, z: number, col: number, y = G.local?.y ?? 0) {
    const k = 0.9 + 0.25 * Math.sin(G.time * 3.2);
    (G as unknown as { pointLight?: (x: number, y: number, z: number, c: number, i: number, d: number) => void }).pointLight?.(x, y + 1.6, z, col, 1.6 * k, 4.5);
  }

  // ================================================================== per frame
  update(dt0: number) {
    if (this.over) return;
    const dt = Math.min(0.1, dt0);
    this.clock += dt;
    const p = G.local;
    // pad Start skips
    const pad = pollPadSkip(); if (pad === 'skip') { this.skip(); return; } else if (pad === 'wake') this.plate.el.classList.add('hot');
    if (p) {
      const d = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
      if (d < 2) this.walked += d;
      this.lastPos = { x: p.x, z: p.z };
      if (p.running && p.speed > 2.2) this.runT += dt;
      if (p.sneaking) this.sneakT += dt;
      if ((G.input as unknown as { keys?: Set<string> }).keys?.has?.('KeyQ')) this.qHeld += dt;
    }
    // the framed thing moves (a creature, a chair being carried)
    if (this.cam.on && !this.cam.follow && this.frameFn) { const w = this.frameFn(); if (w) this.cam.goal.copy(w); }
    this.holo.update(dt0);
    // the script's waits
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      let ok = false;
      try { ok = !!this.rushTo || w.cond(); } catch { ok = true; }
      if (ok) { this.waits.splice(i, 1); w.res(); }
    }
    this.paint();
    void this.nagT;
  }
  private paint() {
    // the highlight follows its element (the console eases in, a phone rotates)
    if (this.hlFn) {
      const r = this.hlFn();
      if (r) {
        const pad = 6;
        const s = this.hlEl.style;
        s.visibility = ''; s.left = Math.round(r.left - pad) + 'px'; s.top = Math.round(r.top - pad) + 'px';
        s.width = Math.round(r.width + pad * 2) + 'px'; s.height = Math.round(r.height + pad * 2) + 'px';
      } else this.hlEl.style.visibility = 'hidden';
    }
    if (this.keysAt) {
      const w = this.keysAt();
      const s = w ? this.screenOf(w) : null;
      if (s) { this.keysEl.style.left = s.x.toFixed(0) + 'px'; this.keysEl.style.top = Math.max(60, s.y).toFixed(0) + 'px'; }
      // the key lights while it is held
      const inp = G.input as unknown as { keys?: Set<string> };
      for (const b of this.keysEl.children as HTMLCollectionOf<HTMLElement>) {
        const k = b.dataset.k || '';
        const code = k.length === 1 ? 'Key' + k : k === 'Shift' ? 'ShiftLeft' : k;
        b.classList.toggle('lit', !!inp.keys?.has?.(code));
      }
    }
  }

  // ================================================================== the end
  skip() {
    if (this.over) return;
    G.audio?.flat?.('static_burst', 'sfx', 0.25);
    this.voice.stop();
    this.over = true;
    cancelAsk();
    this.holo.dissolve();
    // the waiting script unwinds; run() finishes
    for (const w of this.waits.splice(0)) w.rej(SKIP);
    this.finish();
  }
  private finished = false;
  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.over = true;
    this.step = 'done';
    cancelAsk();
    for (const w of this.waits.splice(0)) w.rej(SKIP);
    this.pressOpen = this.doorsOpen = true;
    this.holo.point(null);
    this.holo.dissolve();
    this.camRelease();
    this.hlEl.classList.remove('on'); this.keysEl.classList.remove('on');
    G.missions?.set?.('tut:done');
    TUT.running = false; TUT.step = ''; TUT.target = -1;
    const h = G.handler as unknown as { guide?: (t: null) => void; briefed?: boolean; cine?: boolean } | null;
    if (h) { h.guide?.(null); h.briefed = true; h.cine = false; }
    if (this.quietHeld) { floatQuiet(false); this.quietHeld = false; }
    G.input.pointerOverUI = false;
    const root = this.root, plate = this.plate, holo = this.holo, g = this.g;
    // the camera eases back out, the picture finishes dissolving; then the hooks come off
    let t = 0;
    const tail = {
      name: 'tutorialTail',
      update: (dt: number) => {
        t += dt;
        holo.update(dt);
        if (t > 2.2) {
          for (const f of this.offs.splice(0)) { try { f(); } catch (e) { console.error(e); } }
          const i = g.systems.indexOf(tail as unknown as GameSystem); if (i >= 0) g.systems.splice(i, 1);
          holo.hide();
        }
      },
    };
    g.addSystem(tail as unknown as GameSystem);
    setTimeout(() => { plate.destroy(); root.remove(); }, 400);
    queueMicrotask(() => { const i = this.g.systems.indexOf(this); if (i >= 0) this.g.systems.splice(i, 1); });
    running = null;
    if (import.meta.env.DEV) (window as unknown as { __tut: Tutorial | null }).__tut = null;
  }

  // ================================================================== dev (screenshots)
  /** dev: run the script straight through (no lines, gates pass, questions unanswered) to a lesson */
  rushTo = '';
  debugTo(step: string) { this.rushTo = step; cancelAsk(); }
  /** dev: jump the unit's counters so a gate passes (screenshot scripts) */
  debugPass() { this.walked = 99; this.runT = 99; this.sneakT = 99; this.pumped = 9; this.heartClicked = 9; this.hotKey = 9; this.fed = true; }
  get holoRef() { return this.holo; }
}

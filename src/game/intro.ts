// The opening of a new game: clipping in.
//
// The survivor starts in normal reality — the night-shift staff room of the
// Meridian Institute's Annex B (zone `reality`, src/world/gen/z_reality.ts) —
// with one small thing to do. Then the room goes wrong: lights stutter, the
// hum changes key, the same poster is on every wall, a door appears that was
// never there and yellow damp creeps across the floor. Then the floor lets go:
// the survivor sinks through it, falls through a void full of pieces of rooms
// and wakes face-down on the carpet of the Lobby spawn room, where the usual
// start takes over (wake note, SEER-9 boot line, the 'wake' directive).
//
// Shown once per new solo/host game. Skippable at any moment (Esc, the Skip
// button, or a tap during the scripted parts). ?quick skips it, ?intro forces
// it. Co-op clients and loaded saves never see it. The stage zone is local:
// nothing it does reaches the op log or other players, and it is dropped from
// the world when the intro ends.
import { G } from './G';
import type { Game, GameSystem } from './game';
import type { Player } from '../entities/player';
import type { Action } from '../core/input';
import type { PickTarget } from './picking';
import type { MenuOption } from '../ui/ui';
import { bus } from '../core/events';
import { U } from '../gfx/materials';
import { opLog } from './ops';
import { floorId, wallpaperId } from '../world/defs';
import type { Zone, LightSource, EdgeObj, TileObject } from '../world/zone';
import { createItem } from '../items/factory';
import { hasItemDef, Item } from '../items/item';
import { synth } from '../audio/sounds';
import '../audio/sounds_intro';
import { INTRO_ZONE, RealityLayout } from '../world/gen/z_reality';
import { TimedAction } from '../actions/action';
import { queueAt } from '../actions/basic';

export { INTRO_ZONE };

type Phase = 'normal' | 'wrong' | 'noclip' | 'fall' | 'wake' | 'done';

/** input actions that make no sense before the noclip (there is no scanner in normal life) */
const BLOCKED = new Set<Action>(['scanner', 'map', 'flashlight', 'craft', 'sleep', 'grab', 'hot1', 'hot2', 'hot3', 'hot4', 'hot5']);

/** Should a session that is about to start a fresh world play the intro? */
export function introWanted(mode: 'solo' | 'host' | 'client'): boolean {
  if (mode === 'client') return false;
  const q = new URLSearchParams(location.search);
  if (q.has('intro')) return q.get('intro') !== '0';
  return !q.has('quick');
}

/** Start the intro for a brand-new world; it ends with the player waking at `spawn` in the lobby. */
export function startIntro(g: Game, p: Player, spawn: [number, number]): Intro {
  const intro = new Intro(g, p, spawn);
  g.addSystem(intro);
  if (import.meta.env.DEV) (window as any).__intro = intro;
  return intro;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
/** piecewise-linear keyframes [[t, v], ...] */
function keys(k: [number, number][], t: number) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
}

/** pouring the coffee: a short timed action so it animates and can be interrupted like anything else */
class PourCoffee extends TimedAction {
  constructor(p: Player, private intro: Intro) { super(p); this.name = 'Pour a coffee'; this.duration = 2.6; this.anim = 'pour'; this.fixedTime = true; }
  start() { const [x, z] = this.intro.L.coffeeAt; G.audio?.play?.('intro_brew', x, z, { vol: 0.9, variant: 0 }); }
  stop() { this.intro.pouring = false; }
  perform() { this.intro.coffeeDone(); }
}

export class Intro implements GameSystem {
  name = 'intro';
  phase: Phase = 'normal';
  /** seconds in the current phase */
  t = 0;
  L: RealityLayout;
  z: Zone;
  pouring = false;
  private gotCoffee = false;
  private coffeeAt = -1;
  private scripted = false;
  private skipping = -1;
  private fast = false;
  private fired = new Set<number>();
  private loops = 0;
  private loopT = -1;
  private creepT = 0; private creepI = 0; private paperI = 0;
  private glitchT = 0; private glitchHold = 0;
  private idleT = 0;
  private hintShown = false;
  private nextUid: number;
  private door: EdgeObj | null = null;
  private radioKey = 'intro_radio'; private radioRate = 1;
  private humVol = 0; private humRate = 1;
  private sinkY = 0;
  private sinkAt: [number, number] = [0, 0];
  private sinkRing = -1;
  private envNormal: Zone['env'];
  private hours: number;
  private body: { panic: number; stress: number };
  private missions: any = null;
  private missionsAt = -1;
  private offs: (() => void)[] = [];
  private origClick: ((t: PickTarget, b: number) => void) | undefined;
  private origKey: (() => void) | undefined;
  // dom
  private root!: HTMLDivElement;
  private shade!: HTMLDivElement;
  private noise!: HTMLCanvasElement;
  private noiseCtx: CanvasRenderingContext2D | null = null;
  private noiseImg: ImageData | null = null;
  private card!: HTMLDivElement;
  private prompt!: HTMLDivElement;
  private skipBtn!: HTMLButtonElement;
  private shadeColor = '#000'; private shadeA = 1; private noiseA = 0;
  private touch = false;

  constructor(public g: Game, public p: Player, public spawn: [number, number]) {
    const z = this.z = g.getZone(INTRO_ZONE);
    this.L = z.meta.intro as RealityLayout;
    this.envNormal = { ...z.env };
    this.hours = g.clock.hours;
    // it is the middle of the night shift (the watch agrees); the world's own start time comes back on waking
    g.clock.hours = Math.floor(this.hours / 24) * 24 + 2 + 47 / 60;
    this.body = { panic: p.body.panic, stress: (p.body as any).stress ?? 0 };
    let maxUid = 0;
    for (const k of z.objects.keys()) maxUid = Math.max(maxUid, k);
    this.nextUid = maxUid + 1000;
    // directives wait until the survivor wakes up in the Lobby (no "SEER-9 ONLINE" in a staff room)
    const m = g.missions;
    if (m) {
      this.missions = m;
      (m as any).notified?.add?.('blurb:' + INTRO_ZONE);
      this.missionsAt = g.systems.indexOf(m);
      if (this.missionsAt >= 0) g.systems.splice(this.missionsAt, 1);
    }
    const [sx, sy, sf] = this.L.start;
    g.placePlayer(p, INTRO_ZONE, sx, sy, sf);
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.hookInput();
    this.buildDom();
  }
  /** sounds synthesised ahead of need, one per frame (the radio first, while the screen is still black) */
  private warmQ = ['intro_radio', 'intro_drops', 'intro_brew', 'intro_hum', 'static', 'intro_sting', 'numbers', 'intro_noclip', 'intro_fall', 'intro_land'];

  // ================================================================== input
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
      if (BLOCKED.has(a)) return false;
      if (this.scripted && a !== 'camLeft' && a !== 'camRight') return false;
      return orig(a);
    };
    this.offs.push(() => { delete inp.hit; });
    const ui = g.ui;
    if (ui) {
      this.origClick = ui.onWorldClick; this.origKey = ui.onInteractKey;
      ui.onWorldClick = (t: PickTarget, b: number) => {
        if (this.scripted) return;
        if (b === 0 && t.kind === 'object' && t.obj.uid === this.L.coffee && this.phase === 'normal') { this.pourCoffee(); return; }
        this.origClick?.(t, b);
      };
      ui.onInteractKey = () => {
        if (this.scripted) return;
        const h = ui.hover as PickTarget | null;
        const onCoffee = h?.kind === 'object' && h.obj.uid === this.L.coffee;
        if (this.phase === 'normal' && !this.gotCoffee && (onCoffee || ((!h || h.kind === 'tile') && this.nearCoffee(1.8)))) { this.pourCoffee(); return; }
        this.origKey?.();
      };
      this.offs.push(() => { ui.onWorldClick = this.origClick; ui.onInteractKey = this.origKey; });
    }
    this.offs.push(bus.on('worldMenu', (pl: Player, t: PickTarget, opts: MenuOption[]) => {
      if (pl === this.p && t.kind === 'object' && t.obj.uid === this.L.coffee && this.phase === 'normal' && !this.gotCoffee) opts.unshift({ label: 'Pour a coffee', action: () => this.pourCoffee() });
    }));
    this.offs.push(bus.on('loop', (pl: Player) => {
      if (pl !== this.p || this.phase !== 'wrong') return;
      this.loops++;
      if (this.loops === 1) this.think('...this is the same hallway.');
      if (this.loops >= 2 && this.loopT < 0) this.loopT = 1.2;
    }));
    // a tap anywhere skips the scripted part (the playable part has the Skip button)
    const tap = (e: PointerEvent) => {
      if (!this.scripted || this.phase === 'done') return;
      if (this.skipBtn && this.skipBtn.contains(e.target as Node)) return;
      this.skip();
    };
    window.addEventListener('pointerdown', tap, true);
    this.offs.push(() => window.removeEventListener('pointerdown', tap, true));
  }

  private nearCoffee(r: number) {
    const [x, z] = this.L.coffeeAt;
    return Math.hypot(this.p.x - x, this.p.z - z) <= r;
  }

  pourCoffee() {
    if (this.gotCoffee || this.pouring || this.phase !== 'normal') return;
    this.pouring = true;
    const [x, z] = this.L.coffeeAt;
    queueAt(this.p, x, z + 0.4, new PourCoffee(this.p, this), 1.5);
  }

  coffeeDone() {
    this.pouring = false;
    if (this.gotCoffee) return;
    this.gotCoffee = true;
    const p = this.p;
    if (hasItemDef('coffee_brewed')) {
      const it = createItem('coffee_brewed', undefined, { pristine: true });
      p.inv.add(it);
      if (!p.handR) p.equip(it, 'R');
      bus.emit('inventoryChanged', p);
    }
    G.audio?.at?.('glass_clink', this.L.coffeeAt[0], this.L.coffeeAt[1], 0.5);
    this.think('Burnt. Perfect.');
    this.setPrompt('', '');
    this.coffeeAt = this.t;
  }

  // ================================================================== dom
  private buildDom() {
    if (!document.getElementById('intro-style')) {
      const st = document.createElement('style');
      st.id = 'intro-style';
      st.textContent = `
.intro-root{position:fixed;inset:0;pointer-events:none;z-index:180}
.intro-shade{position:absolute;inset:0;background:#000}
.intro-noise{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;opacity:0}
.intro-card{position:absolute;left:50%;top:calc(9% + env(safe-area-inset-top));transform:translateX(-50%);text-align:center;white-space:nowrap;font-family:'VT323',monospace;color:#e9dfc3;text-shadow:2px 2px 0 #000;opacity:0;transition:opacity 1.6s}
.intro-card b{display:block;font-family:'Silkscreen','VT323',monospace;font-weight:400;font-size:12px;letter-spacing:3px;color:#cdbf98}
.intro-card span{display:block;font-size:22px;letter-spacing:1px;margin-top:4px}
.intro-card.on{opacity:.92}
.intro-prompt{position:absolute;left:50%;bottom:calc(15% + env(safe-area-inset-bottom));transform:translateX(-50%);text-align:center;font-family:'Pixelify Sans','VT323',monospace;font-size:21px;color:#f1e8cc;text-shadow:2px 2px 0 #000,0 0 12px rgba(0,0,0,.7);opacity:0;transition:opacity .9s;white-space:nowrap}
.intro-prompt::before{content:'';display:inline-block;width:7px;height:7px;margin:0 10px 3px 0;background:#f2b33d;box-shadow:0 0 6px #f2b33d}
.intro-prompt small{display:block;font-family:'VT323',monospace;font-size:17px;color:#b4a77f;letter-spacing:1px;margin-top:2px}
.intro-prompt small:empty{display:none}
.intro-prompt.on{opacity:1}
.intro-skip{position:absolute;right:calc(14px + env(safe-area-inset-right));top:calc(12px + env(safe-area-inset-top));pointer-events:auto;min-height:40px;padding:0 14px;background:rgba(10,8,4,.45);border:1px solid rgba(233,223,195,.35);color:#e9dfc3;font-family:'Silkscreen','VT323',monospace;font-size:11px;letter-spacing:2px;cursor:pointer;opacity:0;transition:opacity 1.2s,background .2s;touch-action:manipulation}
.intro-skip.on{opacity:.6}
.intro-skip:hover,.intro-skip:focus-visible{opacity:1;background:rgba(40,32,16,.8);outline:none}
.intro-skip kbd{font-family:'VT323',monospace;font-size:15px;color:#a89a72;margin-left:8px;letter-spacing:0}
@media (max-width:600px){.intro-prompt{font-size:18px;white-space:normal;width:86vw}.intro-card{top:calc(150px + env(safe-area-inset-top))}.intro-card span{font-size:19px}}`;
      document.head.appendChild(st);
    }
    const root = this.root = document.createElement('div');
    root.className = 'intro-root';
    this.shade = document.createElement('div'); this.shade.className = 'intro-shade';
    this.noise = document.createElement('canvas'); this.noise.className = 'intro-noise'; this.noise.width = 128; this.noise.height = 72;
    this.card = document.createElement('div'); this.card.className = 'intro-card';
    this.card.innerHTML = '<b>MERIDIAN INSTITUTE · ANNEX B</b><span>Night shift. 2:47 a.m.</span>';
    this.prompt = document.createElement('div'); this.prompt.className = 'intro-prompt';
    this.skipBtn = document.createElement('button'); this.skipBtn.className = 'intro-skip'; this.skipBtn.type = 'button';
    this.skipBtn.innerHTML = 'SKIP INTRO' + (this.touch ? '' : '<kbd>Esc</kbd>');
    this.skipBtn.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    this.skipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.skipBtn.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    this.skipBtn.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; });
    root.append(this.shade, this.noise, this.card, this.prompt, this.skipBtn);
    document.body.appendChild(root);
  }

  private setPrompt(title: string, sub: string) {
    if (!title) { this.prompt.classList.remove('on'); return; }
    this.prompt.innerHTML = `${title}<small>${sub}</small>`;
    this.prompt.classList.add('on');
  }

  private paintShade() {
    this.shade.style.background = this.shadeColor;
    this.shade.style.opacity = String(clamp01(this.shadeA));
    const a = clamp01(this.noiseA);
    this.noise.style.opacity = String(a);
    if (a < 0.01) return;
    if (!this.noiseCtx) { this.noiseCtx = this.noise.getContext('2d'); this.noiseImg = this.noiseCtx?.createImageData(128, 72) ?? null; }
    const img = this.noiseImg, ctx = this.noiseCtx;
    if (!img || !ctx) return;
    const d = new Uint32Array(img.data.buffer);
    let s = (Math.random() * 4294967296) >>> 0;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = s >>> 24;
      const row = (i >> 7) & 7;
      const c = row === 0 ? v >> 1 : v; // faint scanlines
      d[i] = 0xff000000 | (c << 16) | (c << 8) | c;
    }
    ctx.putImageData(img, 0, 0);
  }

  private think(text: string) { bus.emit('think', this.p, text); }
  /** drop anything the survivor was still saying or thinking (a new beat starts) */
  private hush() { for (const b of (this.g.ui?.bubbles || []) as { target: unknown; until: number }[]) if (b.target === this.p) b.until = 0; }

  // ================================================================== world helpers
  private light(id: number): LightSource | undefined { return this.z.lights.find((l) => l.id === id); }
  private lights(ids: number[]) { return ids.map((i) => this.light(i)).filter((l): l is LightSource => !!l); }
  /** recolour a light: take its old colour out of the light grid first so nothing is left behind */
  private recolor(l: LightSource, color: number, intensity?: number) {
    const lg = this.g.view?.zone === this.z ? this.g.view.lg : null;
    if (lg && l.level) lg.setLevel(l, 0);
    l.color = color;
    if (intensity !== undefined) l.intensity = intensity;
  }
  private addPoster(x: number, y: number, rot: 0 | 1 | 2 | 3) {
    const z = this.z;
    if (z.objectsAt(x, y).some((o) => o.key === 'poster' && o.rot === rot)) return;
    const o: TileObject = { uid: this.nextUid++, key: 'poster', x, y, rot, state: { v: this.L.poster.v } };
    z.addObject(o);
  }
  private repeatPosters(corridor: boolean) {
    const z = this.z;
    if (!corridor) {
      for (const uid of this.L.wallSwap) {
        const o = z.objects.get(uid);
        if (!o) continue;
        z.removeObject(o);
        this.addPoster(o.x, o.y, o.rot);
      }
    }
    const [rx0, , rx1] = this.L.room;
    for (const [x, y, r] of this.L.poster.spots) {
      const inRoom = x >= rx0 && x <= rx1;
      if (inRoom !== corridor) this.addPoster(x, y, r);
    }
    G.audio?.at?.('paper', this.p.x, this.p.z, 0.25);
  }
  private creep(nFloor: number, nPaper: number) {
    const z = this.z, cf = floorId('carpet_yellow'), wp = wallpaperId('wall_yellow');
    for (let k = 0; k < nFloor && this.creepI < this.L.creep.length; k++) {
      const [x, y] = this.L.creep[this.creepI++];
      z.setFloor(x, y, cf);
      z.floorVar[z.idx(x, y)] = (x * 7 + y * 3) % 3;
    }
    for (let k = 0; k < nPaper && this.paperI < this.L.paperCreep.length; k++) {
      const [x, y] = this.L.paperCreep[this.paperI++];
      z.paper[z.idx(x, y)] = wp;
      z.markDirty(x, y);
    }
  }
  private showDoor() {
    const [x, y, side] = this.L.pocketDoor;
    const e: EdgeObj = { kind: 'door', style: 'door_wood', open: false, locked: false, hp: 250, maxHp: 250, barricade: 0, swing: 1, hinge: 0 };
    this.z.setEdge(x, y, side, e);
    this.door = e;
    G.audio?.at?.('wood_creak', x, y + 0.5, 0.6);
    // a creak behind you: you look
    const p = this.p;
    if (p.speed < 0.3 && !p.actions.current && this.inRoom()) p.targetFacing = Math.atan2(y + 0.5 - p.z, x - p.x);
  }
  private openDoor() {
    if (!this.door) return;
    const [x, y, side] = this.L.pocketDoor;
    this.door.open = true;
    this.z.edgeChanged(x, y, side);
    // the room behind it is suddenly something you know is there
    const [px0, py0, px1, py1] = this.L.pocket;
    for (let yy = py0; yy <= py1; yy++) for (let xx = px0; xx <= px1; xx++) this.z.explored[this.z.idx(xx, yy)] = 1;
    G.audio?.at?.('door_open', x, y + 0.5, 0.8);
    G.audio?.flat?.('intro_sting', 'sfx', 0.55, 1, 0, 0);
  }
  private addLoop() {
    const { x, y0, y1, dx } = this.L.loop;
    for (let y = y0; y <= y1; y++) this.z.portals.push({ id: 'intro_loop_' + y, x, y, kind: 'loop', to: INTRO_ZONE, tx: x + dx, ty: y, loopDx: dx, loopDy: 0, hidden: true });
  }
  private inPocket() {
    const [x0, y0, x1, y1] = this.L.pocket, tx = this.p.tileX(), ty = this.p.tileY();
    return this.p.zoneKey === INTRO_ZONE && tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
  }
  /** anything the survivor put down on the stage comes along (the stage itself is about to stop existing) */
  private recoverItems() {
    const z = this.z, p = this.p;
    const back: Item[] = [];
    const fl = z.meta.floorItems as Map<number, { item: Item }> | undefined;
    if (fl) { for (const wi of fl.values()) back.push(wi.item); fl.clear(); }
    for (const o of z.objects.values()) if (o.inv?.items.length) back.push(...o.inv.items.splice(0));
    for (const it of back) p.inv.add(it);
    if (back.length) bus.emit('inventoryChanged', p);
  }
  private loopsOff() {
    const a = G.audio;
    if (!a) return;
    for (const id of ['intro_radio', 'intro_hum', 'intro_drops', 'intro_fall']) a.positionalLoop?.(id, null);
  }

  // ================================================================== the script
  update(dt: number) {
    const g = this.g, p = this.p, fx = g.pr.fx;
    this.t += dt;
    if (this.phase === 'done') return;
    // skipping: a short fade to black, then straight to waking up
    if (this.skipping >= 0) {
      this.skipping += dt;
      this.shadeColor = '#000'; this.shadeA = Math.max(this.shadeA, this.skipping / 0.35);
      this.noiseA *= 0.8;
      if (this.skipping >= 0.4) { this.skipping = -1; this.startWake(true); }
      this.paintShade();
      return;
    }
    if (this.warmQ.length && (this.phase === 'normal' || this.phase === 'wrong')) synth(this.warmQ.shift()!);
    switch (this.phase) {
      case 'normal': this.updateNormal(dt); break;
      case 'wrong': this.updateWrong(dt); break;
      case 'noclip': this.updateNoclip(dt); break;
      case 'fall': this.updateFall(dt); break;
      case 'wake': this.updateWake(dt); break;
    }
    // falling asleep on shift is how it happens to everyone else
    if ((this.phase === 'normal' || this.phase === 'wrong') && p.sleeping) this.startNoclip();
    if (this.phase === 'normal' || this.phase === 'wrong') this.updateLoops();
    if (this.glitchHold > 0) { this.glitchHold -= dt; fx.glitch = Math.max(fx.glitch, 0.55); }
    this.paintShade();
  }

  private updateLoops() {
    const a = G.audio, p = this.p;
    if (!a?.positionalLoop) return;
    const [rx, rz] = this.L.radioAt;
    const wob = this.phase === 'wrong' ? Math.sin(this.t * 1.7) * 0.015 * Math.min(1, this.t / 6) : 0;
    a.positionalLoop('intro_radio', this.radioKey, rx, rz, this.radioKey === 'intro_radio' ? 0.55 : 0.38, this.radioRate + wob, 15);
    const w = this.L.windows[1];
    a.positionalLoop('intro_drops', 'intro_drops', w[0], w[1] + 0.3, 0.42, 1, 11);
    if (this.humVol > 0.005) a.positionalLoop('intro_hum', 'intro_hum', p.x, p.z, this.humVol, this.humRate, 40);
  }

  private updateNormal(dt: number) {
    const t = this.t, p = this.p;
    // eyes on: fade up from black, the location card, then the one thing to do
    this.shadeColor = '#000'; this.shadeA = 1 - smooth((t - 0.4) / 2.4);
    this.at(1.2, 100, () => this.card.classList.add('on'));
    this.at(8.5, 101, () => this.card.classList.remove('on'));
    this.at(2.2, 102, () => this.skipBtn.classList.add('on'));
    this.at(3.6, 103, () => { if (!this.gotCoffee && !this.pouring) this.setPrompt('Get a coffee.', 'the machine on the counter'); });
    this.at(5.5, 104, () => { if (!this.gotCoffee && !this.pouring) this.think('Two more hours.'); });
    // stuck? say how
    const moving = p.speed > 0.2 || !!p.actions.current;
    this.idleT = moving ? 0 : this.idleT + dt;
    if (!this.hintShown && !this.gotCoffee && t > 9 && this.idleT > 5) {
      this.hintShown = true;
      this.setPrompt('Get a coffee.', this.touch ? 'drag to walk · tap the coffee machine' : 'WASD to walk · E or click to use');
    }
    if (this.gotCoffee && t - this.coffeeAt > 3.2) this.startWrong();
    else if (!this.gotCoffee && !this.pouring && t > 40) { this.think('Forget the coffee.'); this.setPrompt('', ''); this.startWrong(); }
  }

  private startWrong() {
    this.phase = 'wrong'; this.t = 0; this.fired.clear();
    this.card.classList.remove('on');
  }

  private at(t: number, id: number, fn: () => void) {
    if (this.t >= t && !this.fired.has(id)) { this.fired.add(id); fn(); }
  }

  private updateWrong(dt: number) {
    const t = this.t, z = this.z, g = this.g, fx = g.pr.fx, L = this.L;
    this.shadeA = Math.max(0, this.shadeA - dt * 2);
    // the radio drifts flat, the hum comes up under everything and sinks a semitone
    this.radioRate = lerp(1, 0.93, smooth(t / 9));
    this.humVol = lerp(0.04, 0.6, smooth(t / 22));
    this.humRate = lerp(1, 0.93, smooth((t - 6) / 16));
    U.uCollapse.value = 0.32 * smooth((t - 9) / 15);
    this.at(0, 0, () => { for (const l of this.lights(L.lights.fluoro)) l.flicker = 0.35; });
    this.at(2.5, 1, () => this.think('...huh.'));
    this.at(4.5, 2, () => this.repeatPosters(false));
    this.at(6.0, 3, () => {
      const lamp = this.lights(L.lights.warm).pop();
      if (lamp) { lamp.on = false; G.audio?.at?.('glass_clink', lamp.x, lamp.z, 0.5); G.audio?.at?.('switch', lamp.x, lamp.z, 0.4); }
      for (const l of this.lights(L.lights.warm)) l.flicker = 0.08;
    });
    this.at(7.2, 4, () => this.think(this.inRoom() ? 'That poster wasn\'t there.' : 'Was that poster always...'));
    this.at(10.0, 5, () => this.showDoor());
    this.at(11.2, 6, () => { this.openDoor(); this.think(this.inRoom() ? 'That door wasn\'t there.' : 'Did a door just open?'); });
    this.at(12.4, 7, () => {
      this.radioKey = 'static'; this.radioRate = 1;
      this.addLoop();
      this.repeatPosters(true);
      this.setPrompt('Go home.', 'the exit is at the end of the hall');
    });
    this.at(15.0, 8, () => { this.radioKey = 'numbers'; });
    this.at(16.0, 9, () => {
      const tv = z.objects.get(L.tv);
      for (const l of this.lights(L.lights.screens)) { if (tv && l.objUid === tv.uid) { this.recolor(l, 0xf0f4ff, 0.55); l.flicker = 0.6; } }
      if (tv) G.audio?.at?.('static_burst', tv.x + 0.5, tv.y + 0.5, 0.6);
    });
    this.at(18.5, 10, () => {
      for (const l of this.lights([...L.lights.warm, ...L.lights.fluoro, ...L.lights.corridor])) this.recolor(l, 0xf1edc0);
      z.env = { ...z.env, grade: 'lobby', ambient: 0x3a3418, ambientI: 0.42 };
      g.applyZoneEnv(z);
    });
    this.at(21.0, 11, () => this.think('No. No no no.'));
    // yellow damp spreading out from the door that was not there
    if (t > 8) {
      this.creepT -= dt;
      if (this.creepT <= 0) { this.creepT = 0.42; this.creep(t > 16 ? 4 : 2, 1); }
    }
    // the picture tears now and then, more often as it goes
    if (t > 13) {
      this.glitchT -= dt;
      if (this.glitchT <= 0) {
        this.glitchT = lerp(2.6, 0.7, smooth((t - 13) / 10)) * (0.6 + Math.random() * 0.8);
        this.glitchHold = 0.12 + Math.random() * 0.15;
        G.audio?.flat?.('static_burst', 'sfx', 0.12 + 0.1 * smooth((t - 13) / 10));
        if (t > 19 && Math.random() < 0.35) fx.corruptFlash = 0.6;
      }
    }
    fx.corruptFlash = Math.max(0, fx.corruptFlash - dt * 6);
    fx.wobble = Math.max(fx.wobble, 0.6 * smooth((t - 14) / 10));
    // ways out: the yellow room, walking the hall twice, or simply time
    if (this.loopT >= 0) { this.loopT -= dt; if (this.loopT < 0) this.startNoclip(); }
    if (this.inPocket() && t > 11.5) this.startNoclip();
    else if (t > 24) this.startNoclip();
  }

  private inRoom() {
    const [x0, y0, x1, y1] = this.L.room, tx = this.p.tileX(), ty = this.p.tileY();
    return tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
  }

  // ------------------------------------------------------------ the floor lets go
  private startNoclip() {
    if (this.phase === 'noclip' || this.phase === 'fall' || this.phase === 'wake' || this.phase === 'done') return;
    const g = this.g, p = this.p;
    this.phase = 'noclip'; this.t = 0; this.scripted = true;
    (g as any).touch?.setHidden?.(true); // on-screen controls step aside for the cutscene
    this.setPrompt('', '');
    this.card.classList.remove('on');
    p.actions.clear();
    p.vx = p.vz = 0; p.speed = 0; p.running = false; p.sneaking = false; p.aiming = false;
    p.sleeping = false; p.sittingOn = null;
    g.ui?.closeMenu?.(); g.ui?.closeReader?.();
    if (g.ui?.inventory?.open) g.ui.inventory.toggle(false);
    if (g.ui?.scanner?.open) g.ui.scanner.toggle(false);
    g.attract = () => { /* scripted: the intro drives the survivor */ };
    this.hush();
    this.sinkY = p.y;
    this.sinkAt = [p.tileX(), p.tileY()];
    g.pr.setZoomLevel(Math.min(g.camZoom + 1, 6));
    G.audio?.flat?.('intro_noclip', 'sfx', 1, 1, 0, 0);
    this.radioKey = 'static';
  }

  private updateNoclip(dt: number) {
    const t = this.t, p = this.p, fx = this.g.pr.fx;
    p.actionAnim = t < 0.7 ? 'flinch' : '';
    // the floor under your feet stops being a floor: a missing texture spreading out from where you stand
    const ring = t < 0.3 ? -1 : t < 0.55 ? 0 : t < 0.8 ? 1 : 2;
    if (ring > this.sinkRing) {
      this.sinkRing = ring;
      const [cx, cy] = this.sinkAt, z = this.z, gl = floorId('glitch');
      for (let y = cy - ring; y <= cy + ring; y++) for (let x = cx - ring; x <= cx + ring; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) > ring + (ring > 1 ? 1 : 0) || !z.floorAt(x, y)) continue;
        z.setFloor(x, y, gl);
        z.floorVar[z.idx(x, y)] = (x + y) & 1 ? 0 : 1;
      }
      G.audio?.at?.('static_burst', p.x, p.z, 0.4);
    }
    p.full = t < 0.55 ? '' : 'fall';
    const k = clamp01((t - 0.7) / 1.7);
    p.y = this.sinkY - 2.6 * k * k;
    this.humVol = lerp(0.6, 0.95, clamp01(t / 0.8)); this.humRate = lerp(0.93, 0.6, k);
    this.radioRate = 1;
    fx.glitch = Math.max(fx.glitch, t > 0.7 ? 0.65 + 0.3 * Math.sin(t * 23) : 0.3);
    fx.corruptFlash = (t > 0.72 && t < 0.8) || (t > 1.9 && t < 1.96) || (t > 2.18 && t < 2.32) ? 0.75 : 0;
    fx.wobble = Math.max(fx.wobble, 1.2);
    this.g.pr.shake = Math.max(this.g.pr.shake, t > 0.7 ? 0.45 : 0);
    U.uCollapse.value = lerp(0.32, 0.8, clamp01((t - 0.7) / 1.5));
    this.noiseA = clamp01((t - 1.5) / 0.9) * 0.22;
    // white-out
    if (t > 2.35) { this.shadeColor = '#f4f1e6'; this.shadeA = clamp01((t - 2.35) / 0.22); }
    if (t > 2.7) this.startFall();
    void dt;
  }

  // ------------------------------------------------------------ through the void
  private startFall() {
    const g = this.g, p = this.p, z = this.z, F = this.L.fall;
    this.phase = 'fall'; this.t = 0;
    this.radioKey = 'intro_radio';
    G.audio?.positionalLoop?.('intro_radio', null);
    G.audio?.positionalLoop?.('intro_drops', null);
    z.env = { ...this.envNormal, ambient: 0x6a5c3c, ambientI: 0.95, fog: 0x100d07, fogNear: 5, fogFar: 17, void: 0x0a0805, grade: 'lobby', weather: 'none' };
    g.applyZoneEnv(z, true);
    if (g.view) g.view.vis.enabled = false;
    U.uCollapse.value = 0.15;
    g.pr.fx.corruptFlash = 0; g.pr.shake = 0;
    p.x = F.x; p.z = F.z; p.y = F.top;
    g.pr.target.set(p.x, p.y, p.z);
    g.camLead.set(0, 0, 0);
    p.full = 'fall'; p.actionAnim = '';
    G.audio?.flat?.('intro_sting', 'sfx', 0.3, 0.5, 0, 0);
  }

  private updateFall(dt: number) {
    const t = this.t, g = this.g, p = this.p, fx = g.pr.fx, F = this.L.fall;
    const DUR = 6.6;
    const k = clamp01(t / DUR);
    p.y = lerp(F.top, F.bottom, Math.pow(k, 1.55));
    p.facing += dt * 0.8; p.targetFacing = p.facing;
    p.full = 'fall';
    // a light falls with you, so the pieces flare up as you pass them
    g.pointLight(p.x, p.y + 1.3, p.z + 0.4, 0xffeccc, 1.6, 8);
    this.humVol = lerp(0.95, 0.35, clamp01(t / 2)); this.humRate = lerp(0.6, 0.85, k);
    G.audio?.positionalLoop?.('intro_hum', 'intro_hum', p.x, p.z, this.humVol, this.humRate, 40);
    G.audio?.positionalLoop?.('intro_fall', 'intro_fall', p.x, p.z, lerp(0.25, 0.75, k), lerp(0.75, 1.35, k), 40);
    fx.glitch = Math.max(fx.glitch, 0.12 + (Math.sin(t * 7) > 0.96 ? 0.5 : 0));
    fx.corruptFlash = t > 3.1 && t < 3.16 ? 0.5 : 0;
    fx.wobble = Math.max(fx.wobble, 0.8);
    fx.dream = 0.25;
    this.noiseA = 0.05 + 0.04 * Math.sin(t * 3);
    // out of the white, and into it again at the bottom
    this.shadeColor = '#f4f1e6';
    this.shadeA = t < 0.45 ? 1 - t / 0.45 : t > DUR - 0.5 ? (t - (DUR - 0.5)) / 0.35 : 0;
    if (t > DUR - 0.12) this.startWake(false);
  }

  // ------------------------------------------------------------ face-down on wet carpet
  private startWake(fast: boolean) {
    const g = this.g, p = this.p;
    if (this.phase === 'wake' || this.phase === 'done') { this.fast = this.fast || fast; return; }
    this.phase = 'wake'; this.t = 0; this.fast = fast; this.scripted = true;
    this.setPrompt('', '');
    this.card.classList.remove('on');
    this.skipBtn.classList.remove('on');
    this.skipBtn.style.pointerEvents = 'none';
    this.loopsOff();
    p.actions.clear(); p.sleeping = false; p.sittingOn = null;
    g.ui?.closeMenu?.(); g.ui?.closeReader?.();
    if (g.ui?.inventory?.open) g.ui.inventory.toggle(false);
    g.attract = () => { /* scripted */ };
    this.hush();
    this.recoverItems();
    // leave the stage for good
    g.clock.hours = this.hours;
    p.body.panic = this.body.panic;
    if ((p.body as any).stress !== undefined) (p.body as any).stress = this.body.stress;
    const [sx, sy] = this.spawn;
    g.placePlayer(p, 'lobby', sx, sy, Math.PI * 0.75);
    p.vx = p.vz = 0; p.speed = 0;
    g.net?.onLocalTravel?.('lobby');
    p.full = 'lie'; p.actionAnim = '';
    g.pr.setZoomLevel(g.camZoom);
    U.uCollapse.value = 0;
    const fx = g.pr.fx;
    fx.corruptFlash = 0; fx.glitch = 0; fx.dream = 0; fx.blink = 1;
    g.pr.shake = 0;
    this.shadeColor = '#000'; this.shadeA = 1; this.noiseA = 0;
    if (!fast) G.audio?.flat?.('intro_land', 'sfx', 0.9, 1, 0, 0);
  }

  private updateWake(dt: number) {
    const t = this.t, p = this.p, fx = this.g.pr.fx;
    void dt;
    if (this.fast) {
      this.shadeA = 1 - clamp01((t - 0.15) / 0.3);
      fx.blink = Math.max(fx.blink, keys([[0, 1], [0.35, 1], [1.0, 0]], t));
      p.full = t < 0.55 ? 'lie' : t < 1.15 ? 'kneel' : '';
      if (t > 1.4) this.finish();
      return;
    }
    // black, then the eyelids: open, close, open
    this.shadeA = 1 - clamp01((t - 0.9) / 0.5);
    fx.blink = Math.max(fx.blink, keys([[0, 1], [1.7, 1], [2.3, 0.55], [2.55, 0.93], [3.0, 0.3], [3.2, 0.72], [3.9, 0]], t));
    fx.desat = Math.max(fx.desat, 0.5 * (1 - clamp01((t - 2) / 4)));
    fx.wobble = Math.max(fx.wobble, 0.7 * (1 - clamp01((t - 1.5) / 3.5)));
    this.at(2.3, 20, () => G.audio?.flat?.('wake_gasp', 'voice', 0.4));
    this.at(4.1, 21, () => { p.full = 'kneel'; G.audio?.at?.('cloth', p.x, p.z, 0.6); });
    this.at(5.3, 22, () => {
      p.full = '';
      const mug = this.gotCoffee && p.findItem((i) => i.key === 'coffee_brewed');
      this.think(mug ? '...the coffee\'s gone cold.' : '...where am I?');
    });
    if (t > 6.0) this.finish();
  }

  // ================================================================== skipping & cleanup
  skip() {
    if (this.phase === 'done') return;
    if (this.phase === 'wake') { this.fast = true; if (this.t > 0.2) this.finish(); return; }
    if (this.skipping >= 0) return;
    this.skipping = 0;
    this.scripted = true;
    this.p.actions.clear();
    this.setPrompt('', '');
    this.card.classList.remove('on');
    this.skipBtn.classList.remove('on');
    this.loopsOff();
  }

  finish() {
    if (this.phase === 'done') return;
    const g = this.g, p = this.p;
    if (p.zoneKey === INTRO_ZONE) { this.phase = 'normal'; this.startWake(true); }
    this.phase = 'done';
    this.scripted = false;
    (g as any).touch?.setHidden?.(false);
    g.attract = null;
    p.full = ''; p.actionAnim = '';
    p.y = g.getZone(p.zoneKey).heightAt(p.tileX(), p.tileY());
    this.loopsOff();
    for (const off of this.offs.splice(0)) { try { off(); } catch (e) { console.error(e); } }
    G.input.pointerOverUI = false;
    const fx = g.pr.fx;
    fx.corruptFlash = 0; fx.glitch = 0; fx.dream = 0;
    U.uCollapse.value = 0;
    this.root.remove();
    // nothing that happened on the stage belongs in the world's history or in co-op
    for (let i = opLog.length - 1; i >= 0; i--) {
      const r = opLog[i];
      if (r.includes(`"z":"${INTRO_ZONE}"`) || r.includes(`:${INTRO_ZONE}"`) || r.includes(`:${INTRO_ZONE}:`)) opLog.splice(i, 1);
    }
    const m = this.missions;
    if (m?.flags) for (const f of [...m.flags] as string[]) if (f.endsWith(':' + INTRO_ZONE) || f.includes(':' + INTRO_ZONE + ':')) m.flags.delete(f);
    // systems list is being iterated right now: hand the directives back (and drop ourselves) after this frame
    queueMicrotask(() => {
      const i = g.systems.indexOf(this);
      if (i >= 0) g.systems.splice(i, 1);
      if (m && !g.systems.includes(m)) g.systems.splice(Math.max(0, Math.min(this.missionsAt, g.systems.length)), 0, m);
      if (g.view?.zone.key !== INTRO_ZONE) g.zones.delete(INTRO_ZONE);
    });
    bus.emit('introDone', p);
    if (import.meta.env.DEV) (window as any).__intro = null;
  }

  // ================================================================== dev: jump around the script (screenshots)
  debugJump(phase: Phase, t = 0) {
    if (phase === 'wrong') {
      if (this.phase === 'normal') this.startWrong();
      // replay the timeline up to t at once
      const steps = Math.ceil(t / 0.1);
      for (let i = 0; i < steps; i++) { this.t += 0.1; this.updateWrong(0.1); if (this.phase !== 'wrong') break; }
    } else if (phase === 'noclip') this.startNoclip();
    else if (phase === 'fall') { if (this.phase === 'normal' || this.phase === 'wrong') this.startNoclip(); this.startFall(); this.t = t; }
    else if (phase === 'wake') { this.startWake(false); this.t = t; }
    else if (phase === 'done') this.finish();
    if (phase === 'noclip') this.t = t;
  }
}

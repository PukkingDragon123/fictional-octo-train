// Hallucinations: cheap, purely local fakes for a survivor whose mind is at an
// extreme (very low lucidity, days without sleep, a panic attack, a
// dissociative episode, heavy corruption). Nothing here touches the world,
// the op log or the network: another player standing next to you sees and
// hears nothing. The fakes are built from the same pieces the real things use
// (footstep and whisper recipes, creature rigs, furniture geometry) so they
// are hard to tell apart, which is the point.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { species } from '../creatures/registry';
import { objDef, objectGeometry } from '../world/objects';
import { objectMatrix } from '../world/chunkMesher';
import { MAT } from '../gfx/materials';
import type { Player } from '../entities/player';
import type { MindSystem } from './mindSystem';

type Kind = 'steps' | 'whisper' | 'knock' | 'figure' | 'move' | 'watch' | 'radio';

interface Figure { root: THREE.Object3D; t: number; life: number; x: number; z: number; seen: boolean }
interface Ghost { mesh: THREE.Mesh; base: THREE.Matrix4; t: number; life: number; dx: number; dz: number }

/** silhouettes that read as 'someone standing there' (no disguised or pool-bound species) */
const FIGURES = ['hollow', 'employee', 'echo', 'stilt_doe', 'grinhound', 'lifeguard'];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class Hallucinations {
  /** seconds until the next one */
  next = 40;
  /** queued fake footsteps: [time, x, z] */
  private steps: [number, number, number][] = [];
  private figure: Figure | null = null;
  private ghost: Ghost | null = null;
  /** count this session (debug / tests) */
  count = 0;
  last: Kind | '' = '';

  constructor(private mind: MindSystem) {}

  update(p: Player, dt: number, pressure: number) {
    this.updateSteps(p);
    this.updateFigure(p, dt);
    this.updateGhost(dt);
    if (p.sleeping || p.body.dead || pressure < 0.12) { this.next = Math.max(this.next, 20); return; }
    this.next -= dt;
    if (this.next > 0) return;
    this.next = (30 + Math.random() * 50) / (0.25 + pressure);
    this.trigger(p, pressure);
  }

  /** start one now (tests: __game.survival.mind.hallu.trigger(__game.local, 1, 'figure')) */
  trigger(p: Player, pressure: number, kind?: Kind): Kind | '' {
    const opts: [Kind, number][] = [['steps', 3], ['whisper', 2]];
    if (pressure > 0.25) opts.push(['knock', 1], ['radio', 0.6]);
    if (pressure > 0.3) opts.push(['move', 1.4]);
    if (pressure > 0.35) opts.push(['figure', 2]);
    if (pressure > 0.45 && this.watchWorn(p)) opts.push(['watch', 1]);
    let k = kind;
    if (!k) {
      let sum = 0; for (const [, w] of opts) sum += w;
      let r = Math.random() * sum;
      for (const [o, w] of opts) { r -= w; if (r <= 0) { k = o; break; } }
    }
    let ok = false;
    switch (k) {
      case 'steps': ok = this.fakeSteps(p); break;
      case 'whisper': ok = this.fakeWhisper(p); break;
      case 'knock': ok = this.fakeKnock(p); break;
      case 'figure': ok = this.fakeFigure(p); break;
      case 'move': ok = this.fakeMove(p); break;
      case 'watch': ok = this.fakeWatch(); break;
      case 'radio': G.audio?.ui?.('static_burst', 0.22); setTimeout(() => this.say(p, '...was that my name? On the radio?'), 900); ok = true; break;
    }
    if (!ok && k !== 'steps') { ok = this.fakeSteps(p); k = 'steps'; }
    if (ok && k) { this.count++; this.last = k; }
    return ok ? (k || '') : '';
  }

  private watchWorn(p: Player) { for (const it of p.worn.values()) if (it.key === 'wrist_monitor' && it.cond > 0) return true; return false; }

  private say(p: Player, text: string) {
    if (p.body.perks.has('investigator')) text = pick(['Interesting. Not real, though.', 'Logging that. Probably not real.', text]);
    bus.emit('think', p, text);
  }
  private scare(p: Player, amount: number) {
    const k = p.body.perks.has('investigator') ? 0.4 : 1;
    p.body.panic = Math.min(100, p.body.panic + amount * k);
    p.body.stress = Math.min(100, p.body.stress + amount * 0.25 * k);
  }

  // ---------------------------------------------------------------- sounds
  private floorSound(x: number, z: number) {
    const zone = G.zone; const f = zone?.floorAt(Math.floor(x), Math.floor(z));
    return 'step_' + (f?.sound || 'concrete');
  }
  private fakeSteps(p: Player) {
    const back = p.facing + Math.PI + (Math.random() - 0.5) * 1.2;
    const d0 = 6 + Math.random() * 3, n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const d = d0 - i * 0.9;
      this.steps.push([G.time + 0.2 + i * (0.42 + Math.random() * 0.08), p.x + Math.cos(back) * d, p.z + Math.sin(back) * d]);
    }
    setTimeout(() => { if (Math.random() < 0.6) this.say(p, pick(["Who's there?", '...hello?', 'Someone is behind me.', 'Those were footsteps. Right?'])); }, (n * 0.45 + 0.6) * 1000);
    setTimeout(() => this.scare(p, 10), n * 450);
    return true;
  }
  private updateSteps(p: Player) {
    while (this.steps.length && this.steps[0][0] <= G.time) {
      const [, x, z] = this.steps.shift()!;
      G.audio?.play?.(this.floorSound(x, z), x, z, { vol: 0.75, zone: p.zoneKey });
    }
  }
  private fakeWhisper(p: Player) {
    const a = p.facing + Math.PI + (Math.random() - 0.5) * 2;
    G.audio?.play?.('whisper', p.x + Math.cos(a) * 1.8, p.z + Math.sin(a) * 1.8, { vol: 0.7, range: 9 });
    setTimeout(() => { this.say(p, pick(['Did someone just say my name?', 'Who said that?', 'Stop whispering. Please.'])); this.scare(p, 8); }, 1300);
    return true;
  }
  private fakeKnock(p: Player) {
    const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 4;
    G.audio?.play?.('knock', p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, { vol: 0.8, zone: p.zoneKey });
    setTimeout(() => { this.say(p, pick(['Someone is knocking.', 'Knock, knock... who?', 'There is no door there.'])); this.scare(p, 6); }, 1500);
    return true;
  }
  private fakeWatch() {
    this.mind.watchGlitch = pick(['BEHIND YOU', 'I SEE YOU', 'WAKE UP', 'HELLO', 'STAY']);
    this.mind.watchGlitchT = 1.3;
    G.audio?.ui?.('beep', 0.25);
    return true;
  }

  // ---------------------------------------------------------------- a figure that isn't there
  /** a visible, walkable spot, preferably at the edge of vision */
  private spotAround(p: Player, dMin: number, dMax: number, spread: [number, number]): [number, number] | null {
    const v = G.view; if (!v) return null;
    const z = v.zone;
    const edge: [number, number][] = [], any: [number, number][] = [];
    const cx = Math.floor(p.x), cy = Math.floor(p.z), R = Math.ceil(dMax);
    for (let ty = cy - R; ty <= cy + R; ty++) for (let tx = cx - R; tx <= cx + R; tx++) {
      if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)] || z.solid[z.idx(tx, ty)] === 1) continue;
      const dx = tx + 0.5 - p.x, dz = ty + 0.5 - p.z, d = Math.hypot(dx, dz);
      if (d < dMin || d > dMax || !v.vis.isVisible(tx, ty)) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - p.facing), Math.cos(Math.atan2(dz, dx) - p.facing)));
      (off >= spread[0] && off <= spread[1] ? edge : any).push([tx + 0.5, ty + 0.5]);
    }
    const list = edge.length ? edge : any;
    return list.length ? pick(list) : null;
  }
  private fakeFigure(p: Player) {
    if (this.figure) return false;
    const spot = this.spotAround(p, 5, 12, [0.45, 1.2]);
    if (!spot) return false;
    // what you fear most shows up; otherwise something from the building
    const m = p.body.mind;
    const fears = Object.entries(m.triggers).filter(([k, v]) => v > 0.15 && species(k)).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const key = fears[0] || pick(FIGURES.filter((k) => species(k)));
    const sp: any = key ? species(key) : null;
    if (!sp) return false;
    let rig: any;
    try { rig = sp.build(); } catch { return false; }
    const root: THREE.Object3D = rig.root;
    root.position.set(spot[0], G.zone.heightAt(Math.floor(spot[0]), Math.floor(spot[1])), spot[1]);
    root.rotation.y = Math.PI / 2 - Math.atan2(p.z - spot[1], p.x - spot[0]);
    G.pr.scene.add(root);
    this.figure = { root, t: 0, life: 1.6 + Math.random() * 1.6, x: spot[0], z: spot[1], seen: false };
    return true;
  }
  private updateFigure(p: Player, dt: number) {
    const f = this.figure; if (!f) return;
    f.t += dt;
    const d = Math.hypot(f.x - p.x, f.z - p.z);
    const lit = G.lightLevelAt(f.x, f.z) > 0.9 && p.flashlightOn;
    if (!f.seen && f.t > 0.4) { f.seen = true; this.scare(p, 14); setTimeout(() => this.say(p, pick(['There! Something there!', 'Did you see that?', '...it was right there.', 'What was that?!'])), 500); }
    if (f.t > f.life || d < 3.5 || p.zoneKey !== G.zone.key || (lit && f.t > 0.5)) {
      G.pr.fx.glitch = Math.max(G.pr.fx.glitch, 0.25);
      this.dispose(f.root);
      this.figure = null;
    }
  }
  private dispose(o: THREE.Object3D) {
    // like the creature manager, rigs are only detached (other systems may share their geometry)
    o.parent?.remove(o);
  }

  // ---------------------------------------------------------------- furniture that moved (or did it?)
  private fakeMove(p: Player) {
    if (this.ghost) return false;
    const z = G.zone, v = G.view; if (!z || !v) return false;
    const cands: any[] = [];
    const cx = Math.floor(p.x), cy = Math.floor(p.z);
    for (let y = cy - 11; y <= cy + 11; y++) for (let x = cx - 11; x <= cx + 11; x++) {
      if (!z.inb(x, y)) continue;
      const dd = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.z);
      // furniture tiles themselves often read as not visible: any visible neighbour will do
      if (dd < 2.5 || dd > 11 || !(v.vis.isVisible(x, y) || v.vis.isVisible(x + 1, y) || v.vis.isVisible(x - 1, y) || v.vis.isVisible(x, y + 1) || v.vis.isVisible(x, y - 1))) continue;
      for (const o of z.objectsAt(x, y)) {
        if (o.x !== x || o.y !== y) continue;
        const d = objDef(o.key);
        if (!d || !d.movable || d.onWall || (d as any).dynamic || d.height > 2.2) continue;
        cands.push(o);
      }
    }
    if (!cands.length) return false;
    const o = pick(cands), d = objDef(o.key)!;
    const geo = objectGeometry(d, o); if (!geo) return false;
    const mesh = new THREE.Mesh(geo, d.height > 1.1 || (d as any).tall ? MAT.prop : MAT.propLow);
    mesh.matrixAutoUpdate = false;
    const base = objectMatrix(z, o, d).clone();
    const a = Math.random() * Math.PI * 2;
    this.ghost = { mesh, base, t: 0, life: 1.4, dx: Math.cos(a) * 0.5, dz: Math.sin(a) * 0.5 };
    this.applyGhost(this.ghost);
    G.pr.scene.add(mesh);
    G.audio?.play?.('wood_creak', o.x + 0.5, o.y + 0.5, { vol: 0.5, zone: p.zoneKey });
    setTimeout(() => this.say(p, pick(['Did that just move?', 'That was not there a second ago.', 'Stop moving. Stop it.'])), 1200);
    return true;
  }
  private applyGhost(g: Ghost) {
    const k = Math.max(0, 1 - g.t / g.life);
    const e = k * k;
    const m = new THREE.Matrix4().makeTranslation(g.dx * e, 0, g.dz * e).multiply(g.base);
    g.mesh.matrix.copy(m);
    g.mesh.matrixWorldNeedsUpdate = true;
  }
  private updateGhost(dt: number) {
    const g = this.ghost; if (!g) return;
    g.t += dt;
    this.applyGhost(g);
    if (g.t > g.life + 0.25 || !G.view) { g.mesh.parent?.remove(g.mesh); this.ghost = null; }  // geometry is shared (cache): never dispose
  }

  /** remove everything (zone change, death) */
  clear() {
    this.steps.length = 0;
    if (this.figure) { this.dispose(this.figure.root); this.figure = null; }
    if (this.ghost) { this.ghost.mesh.parent?.remove(this.ghost.mesh); this.ghost = null; }
  }
}

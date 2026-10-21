// Welding: the hands-on moment of build mode. Hold the torch (or the watch
// laser) to a tacked frame: sparks spray and skip off the floor, a blue-white
// arc glow pulses, the visor darkens the screen around the bead, the gas
// hisses and crackles. Progress is saved on the frame (objState w) so you can
// stop, walk away and come back; every peer sees the plates go on.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { op } from '../game/ops';
import { TimedAction } from '../actions/action';
import { itemDef, type Item } from '../items/item';
import { PK } from '../gore/particles';
import { shake, punch } from '../gfx/juice';
import { piece, type Piece } from './pieces';
import type { Player } from '../entities/player';
import type { TileObject } from '../world/zone';

export type Welder = { kind: 'torch'; it: Item } | { kind: 'laser' } | { kind: 'hammer'; it: Item };

/** the watch laser counts as a welder once the watch agent exposes it (G.watch.laser) */
export function laserReady(): boolean {
  const l = (G as any).watch?.laser;
  if (!l) return false;
  if (typeof l === 'function') return !!l();
  if (typeof l === 'object') return !!(l.unlocked ?? l.ready ?? l.enabled ?? (typeof l.can === 'function' ? l.can() : false));
  return !!l;
}

/** what this survivor can join a piece with (nail pieces want a hammer) */
export function welderFor(p: Player, pc: Piece | undefined): Welder | null {
  if (pc?.join === 'nail') { const h = p.findTool('#hammer'); return h ? { kind: 'hammer', it: h } : null; }
  const t = p.findItem((it) => it.key === 'welding_torch' && (it.uses ?? 1) > 0.002);
  if (t) return { kind: 'torch', it: t };
  if (laserReady()) return { kind: 'laser' };
  return null;
}

// ---------------------------------------------------------------- visor overlay (DOM, one element)
let visor: HTMLDivElement | null = null;
let visorOn = 0;
function visorEl() {
  if (!visor) { visor = document.createElement('div'); visor.className = 'bld-visor'; document.body.appendChild(visor); }
  return visor;
}
const _v = new THREE.Vector3();
/** darken the screen around the weld point (screen-space glow), 0 = off */
export function setVisor(on: number, wx = 0, wy = 0, wz = 0) {
  const el = visorEl();
  visorOn = on;
  if (on <= 0) { el.style.opacity = '0'; return; }
  _v.set(wx, wy, wz).project(G.pr.camera as THREE.Camera);
  const sx = (_v.x * 0.5 + 0.5) * window.innerWidth, sy = (-_v.y * 0.5 + 0.5) * window.innerHeight;
  const r = 40 + Math.random() * 30;
  el.style.background = `radial-gradient(circle at ${sx | 0}px ${sy | 0}px, rgba(235,245,255,.75) 0, rgba(150,200,255,.35) ${r | 0}px, rgba(20,40,60,.25) ${(r * 3) | 0}px, rgba(4,10,16,.62) ${(r * 7) | 0}px)`;
  el.style.opacity = String(Math.min(1, on));
}
export function visorActive() { return visorOn > 0; }

// ---------------------------------------------------------------- spark bursts (reuse the gore system's glowing particle pool)
const SPARK_COLS = [0xfff6c8, 0xffd060, 0xffb030, 0xffffff, 0xff8a20];
export function sparks(x: number, y: number, z: number, n: number, speed = 3, cols = SPARK_COLS) {
  const pool = G.gore?.glow;
  if (!pool) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
    pool.add(PK.Spark, x, y, z, Math.cos(a) * s, 0.5 + Math.random() * speed * 0.9, Math.sin(a) * s, 0.012 + Math.random() * 0.014, 0.35 + Math.random() * 0.5, cols[(Math.random() * cols.length) | 0], 0.05);
  }
}
/** wood dust and splinters when hammering a nail piece */
export function splinters(x: number, y: number, z: number, n: number) {
  const pool = G.gore?.parts;
  if (!pool) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 1.6;
    pool.add(i % 3 ? PK.Dust : PK.Sliver, x, y, z, Math.cos(a) * s, 1 + Math.random() * 1.5, Math.sin(a) * s, 0.01 + Math.random() * 0.02, 0.6 + Math.random(), i % 2 ? 0xc8a070 : 0x8a6a48);
  }
}

// ---------------------------------------------------------------- the action
/** frame footprint centre + a random point on its silhouette where the bead is being laid */
function beadPoint(o: TileObject, pc: Piece, out: THREE.Vector3) {
  if (pc.kind !== 'obj') {
    const along = Math.random() - 0.5, h = Math.random() * pc.h;
    if (o.state.side === 1) out.set(o.x, h, o.y + 0.5 + along); else out.set(o.x + 0.5 + along, h, o.y);
    return out;
  }
  const w = (pc.w ?? 1), d = (pc.d ?? 1);
  const rw = o.rot % 2 === 0 ? w : d, rd = o.rot % 2 === 0 ? d : w;
  const edge = Math.random() < 0.5;
  out.set(o.x + rw / 2 + (Math.random() - 0.5) * rw * 0.9, edge ? pc.h * (0.2 + Math.random() * 0.8) : pc.h, o.y + rd / 2 + (Math.random() - 0.5) * rd * 0.9);
  return out;
}

export class WeldAction extends TimedAction {
  private zk: string;
  private w0: number;
  private pc: Piece;
  private sendT = 0;
  private fxT = 0;
  private sndT = 0;
  private pt = new THREE.Vector3();
  private lastW: number;
  constructor(p: Player, public o: TileObject, private tool: Welder, private hold: () => boolean) {
    super(p);
    this.zk = p.zoneKey;
    this.pc = piece(o.state.piece as string)!;
    this.w0 = o.state.w ?? 0;
    this.lastW = this.w0;
    const skill = p.body.skill(this.tool.kind === 'hammer' ? 'carpentry' : 'mechanics');
    const rate = tool.kind === 'laser' ? 1.35 : 1;
    this.duration = Math.max(0.6, this.pc.weld * (1 - this.w0) * (1 - Math.min(0.35, skill * 0.05)) / rate);
    this.fixedTime = true;
    this.name = tool.kind === 'hammer' ? 'Nail ' + this.pc.name : 'Weld ' + this.pc.name;
    this.anim = tool.kind === 'hammer' ? 'hammer' : 'craft';
    this.showBar = false;
    this.face = { x: o.x + 0.5, z: o.y + 0.5 };
  }
  private alive(): boolean {
    const z = G.zones.get(this.zk);
    return !!z && z.objects.get(this.o.uid) === this.o && this.p.zoneKey === this.zk;
  }
  /** weld progress 0..1 right now */
  get w() { return Math.min(1, this.w0 + (1 - this.w0) * this.progress); }
  isValid() {
    if (!this.alive() || !this.hold()) return false;
    if (Math.hypot(this.o.x + 0.5 - this.p.x, this.o.y + 0.5 - this.p.z) > 2.6) return false;
    if (this.tool.kind === 'torch' && (!this.p.containerOf(this.tool.it) || (this.tool.it.uses ?? 1) <= 0.002)) { if (this.p.isLocal) bus.emit('think', this.p, 'The torch sputters. Out of gas.'); return false; }
    if (this.tool.kind === 'laser' && !laserReady()) return false;
    return true;
  }
  start() { G.audio?.at?.(this.tool.kind === 'hammer' ? 'hammer' : 'whoosh', this.o.x + 0.5, this.o.y + 0.5, 0.7); }
  update(dt: number) {
    const local = this.p.isLocal;
    // gas
    if (this.tool.kind === 'torch') this.tool.it.uses = Math.max(0, (this.tool.it.uses ?? 1) - dt / (itemDef('welding_torch').uses ?? 60));
    // fx
    this.fxT -= dt; this.sndT -= dt; this.sendT -= dt;
    beadPoint(this.o, this.pc, this.pt);
    const hammer = this.tool.kind === 'hammer';
    if (this.fxT <= 0) {
      this.fxT = hammer ? 0.5 : 0.045;
      if (hammer) { splinters(this.pt.x, this.pt.y, this.pt.z, 5); G.audio?.at?.('hammer', this.pt.x, this.pt.z, 0.8); if (local) shake(0.08); }
      else sparks(this.pt.x, this.pt.y, this.pt.z, this.tool.kind === 'laser' ? 2 : 3, 2.6, this.tool.kind === 'laser' ? [0xff4a6a, 0xff9ab0, 0xffffff] : undefined);
    }
    if (!hammer) {
      const fl = 0.7 + Math.random() * 0.6;
      G.pointLight(this.pt.x, this.pt.y + 0.1, this.pt.z, this.tool.kind === 'laser' ? 0xff6a8a : 0xb8d8ff, 2.2 * fl, 4.5);
      if (this.sndT <= 0) { this.sndT = 0.11 + Math.random() * 0.08; G.audio?.at?.(Math.random() < 0.7 ? 'weld_crackle' : 'sizzle', this.pt.x, this.pt.z, 0.55); }
      if (local) { setVisor(0.9, this.pt.x, this.pt.y, this.pt.z); if (Math.random() < dt * 4) shake(0.04, 0.12); }
    }
    if (Math.random() < dt * 2) bus.emit('noise', { x: this.pt.x, z: this.pt.z, radius: hammer ? 20 : 14, kind: 'build', zone: this.zk, by: this.p.id });
    // replicate progress a few times a second (the frame grows plates at quarter steps)
    const w = this.w;
    if (this.sendT <= 0 && w - this.lastW > 0.04) { this.sendT = 0.35; this.lastW = w; op('objState', { z: this.zk, uid: this.o.uid, patch: { w: Math.round(w * 100) / 100 } }); }
  }
  stop() {
    if (this.p.isLocal) setVisor(0);
    const w = this.w;
    if (this.alive() && w > this.lastW + 0.005) op('objState', { z: this.zk, uid: this.o.uid, patch: { w: Math.round(w * 100) / 100 } });
  }
  perform() {
    if (this.p.isLocal) setVisor(0);
    if (!this.alive()) return;
    const cx = this.o.x + 0.5, cz = this.o.y + 0.5;
    G.build?.finishFrame?.(this.p, this.o);
    if (this.tool.kind !== 'hammer') { sparks(cx, this.pc.h * 0.6, cz, 26, 4.5); G.audio?.at?.('metal_clank', cx, cz, 0.9); }
    else { splinters(cx, 0.6, cz, 14); G.audio?.at?.('hammer', cx, cz, 1); }
    if (this.p.isLocal) { punch(0.05, 0.25); shake(0.2); }
    this.p.body.addXp(this.tool.kind === 'hammer' ? 'carpentry' : 'mechanics', 6 + this.pc.weld);
  }
}

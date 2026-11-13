// Data-driven shots for the reel tool (tools/make.mjs): a reel.json's beats become studio shots here.
// A beat places the species (built and animated by the game's own species code through its gallery
// poses), Dr. Calder, the unit and the camera on a STAGE: an anchor the studio finds in the zone (the
// most open floor, a pool edge, a platform edge) with a forward direction (+z: across the open floor,
// into the water, over the tracks). Positions in a beat are metres in the stage's frame: [x, z] with
// +x to the stage's left as the camera looks forward, +z forward.
//
//   window.__spec = { stage?: {...}, shots: { <id>: BeatSpec } }   (make.mjs injects it)
import * as THREE from 'three';
import { species } from '/src/creatures/registry';
import { floorDef } from '/src/world/defs';
import { dressStalker } from '/src/creatures/species/stalker';
import { hazmatOutfit } from '/src/entities/player';
import { randomAppearance } from '/src/entities/humanRig';
import type { Zone } from '/src/world/zone';
import type { Studio } from './reelStudio';
import { Calder, Unit, aim, keys, V, lerp, smooth, clamp01, type Actor } from './reelActors';

/** bump to render every cached beat again (make.mjs keys beats on it, not on every edit of this file) */
export const SPEC_REV = 'a6c5662c8b7519';

type P2 = [number, number];
export interface Stage { x: number; z: number; y: number; yaw: number; kind: string; room: number }
export interface CreatureSpec {
  key: string; pose?: string; poses?: [number, string][];
  /** path in stage metres; `at` alone stands it there */
  at?: P2; from?: P2; to?: P2; via?: P2[];
  /** facing: 'path' (default when moving), 'camera', 'unit', 'calder', or degrees in the stage frame */
  face?: string | number;
  y?: number; scale?: number; speed?: number;
}
export interface BeatSpec {
  kind?: 'beat';
  creatures?: CreatureSpec[];
  calder?: { at: P2; face?: string | number; do?: string; doAt?: number; look?: string; walkTo?: P2 };
  unit?: { at: P2; to?: P2; do?: string; face?: string | number; seed?: number };
  /** the creature catches the unit at t: it ends its path on the unit, switches to `pose`, the unit goes down */
  caught?: { t: number; pose?: string; then?: string; hide?: number; drag?: P2; by?: number };
  camera?: { move?: string; on?: string; angle?: number; dist?: number; height?: number; fov?: number; push?: number; hand?: number; lookY?: number };
  light?: number;
}
export interface Spec { stage?: Partial<Stage> & { find?: string }; shots: Record<string, BeatSpec> }
export interface ShotCtxLike { S: Studio; actors: Actor[]; lights: { key: THREE.PointLight; fill: THREE.PointLight }; extra: THREE.Object3D[] }

// ------------------------------------------------------------------ the stage
const blocked = (z: Zone, x: number, y: number, water: boolean) => {
  if (!z.inb(x, y)) return true;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i]) return true;
  const f = floorDef(z.floor[i]);
  return !!f.water !== water;
};
/** chebyshev clearance of each tile (0 at blocked tiles and wall edges) */
function clearance(z: Zone, water = false): Uint8Array {
  const d = new Uint8Array(z.W * z.H).fill(255);
  const q: number[] = [];
  for (let y = 0; y < z.H; y++) for (let x = 0; x < z.W; x++) {
    const i = z.idx(x, y);
    if (blocked(z, x, y, water) || z.wallN[i] || z.wallW[i]) { d[i] = 0; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % z.W, y = (i / z.W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!z.inb(nx, ny)) continue;
      const j = z.idx(nx, ny);
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}
const DIRS: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** the stage: 'open' = the most open floor; 'water' / 'low' = land at the edge of deep water / a drop (tracks) */
export function findStage(S: Studio, find = 'open'): Stage {
  const z = S.zone;
  const land = clearance(z, false);
  if (find === 'open') {
    let best = -1, bx = z.W / 2, by = z.H / 2;
    for (let y = 1; y < z.H - 1; y++) for (let x = 1; x < z.W - 1; x++) {
      const c = Math.min(land[z.idx(x, y)], 9), s = c * 10 - Math.hypot(x - z.W / 2, y - z.H / 2) * 0.05;
      if (c > 0 && s > best) { best = s; bx = x; by = y; }
    }
    // forward: the longest free run
    let yaw = 0, run = -1;
    for (const [dx, dy] of DIRS) { let k = 0; while (k < 30 && !blocked(z, bx + dx * (k + 1), by + dy * (k + 1), false)) k++; if (k > run) { run = k; yaw = Math.atan2(dx, dy); } }
    return { x: bx + 0.5, z: by + 0.5, y: S.ground(bx, by), yaw, kind: 'open', room: z.room[z.idx(bx, by)] };
  }
  const low = (x: number, y: number) => {
    if (!z.inb(x, y)) return false;
    if (find === 'water') { const f = z.floorAt(x, y); return f?.water === 'deep'; }
    return z.heightAt(x, y) < -0.6 && !!z.floor[z.idx(x, y)];
  };
  let best = -1, out: Stage | null = null;
  for (let y = 2; y < z.H - 2; y++) for (let x = 2; x < z.W - 2; x++) {
    if (blocked(z, x, y, false) || low(x, y)) continue;
    for (const [dx, dy] of DIRS) {
      if (!low(x + dx, y + dy)) continue;
      let wr = 0; while (wr < 10 && low(x + dx * (wr + 1), y + dy * (wr + 1))) wr++;
      let lr = 0; while (lr < 6 && !blocked(z, x - dx * (lr + 1), y - dy * (lr + 1), false) && !low(x - dx * (lr + 1), y - dy * (lr + 1))) lr++;
      let side = 0; for (let s = 1; s <= 5; s++) { if (!blocked(z, x + dy * s, y + dx * s, false) && !blocked(z, x - dy * s, y - dx * s, false)) side++; else break; }
      const sc = Math.min(wr, 8) * 2 + Math.min(lr, 5) * 1.5 + side * 2 + Math.min(land[z.idx(x, y)], 4);
      if (sc > best) { best = sc; out = { x: x + 0.5, z: y + 0.5, y: S.ground(x, y), yaw: Math.atan2(dx, dy), kind: find, room: z.room[z.idx(x, y)] }; }
    }
  }
  return out ?? findStage(S, 'open');
}

// ------------------------------------------------------------------ stage frame helpers
export function W(st: Stage, p: P2, y = 0): THREE.Vector3 {
  const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
  return V(st.x + p[0] * c + p[1] * s, y, st.z - p[0] * s + p[1] * c);
}
const yawIn = (st: Stage, deg: number) => st.yaw + (deg * Math.PI) / 180;
const ground = (S: Studio, p: THREE.Vector3) => S.ground(p.x, p.z);
/** how far the camera can go from `from` toward `to` before a wall or a solid tile (the frame stays in the room) */
function clearTo(S: Studio, from: THREE.Vector3, to: THREE.Vector3): number {
  const z = S.zone, d = to.clone().sub(from); const L = Math.hypot(d.x, d.z);
  if (L < 1e-3) return to.distanceTo(from);
  let px = Math.floor(from.x), py = Math.floor(from.z);
  for (let k = 1; k <= Math.ceil(L * 6); k++) {
    const f = k / Math.ceil(L * 6), x = from.x + d.x * f, y = from.z + d.z * f, tx = Math.floor(x), ty = Math.floor(y);
    if (tx !== px || ty !== py) {
      const sx = Math.sign(tx - px), sy = Math.sign(ty - py);
      const wall = (sx && z.edgeBlocks(px, py, sx, 0, 'sight')) || (sy && z.edgeBlocks(px + sx, py, 0, sy, 'sight')) || !z.inb(tx, ty) || (z.solid[z.idx(tx, ty)] === 1 && to.y < 2.4);
      if (wall) return Math.max(0.6, f * from.distanceTo(to) - 0.35);
      px = tx; py = ty;
    }
  }
  return from.distanceTo(to);
}

// ------------------------------------------------------------------ any species, through its gallery poses
const BASE = location.search.replace(/[?&]pose=[^&]*/g, '').replace(/^\?/, '');
function setPose(p: string) { history.replaceState(null, '', '?' + (BASE ? BASE + '&' : '') + 'pose=' + encodeURIComponent(p)); }

export class SpeciesActor implements Actor {
  sp: any; rig: any; root: THREE.Object3D; pose = 'idle'; t = 0;
  pos = new THREE.Vector3(); yaw = 0; height: number; radius: number;
  constructor(S: Studio, public key: string, scale = 1) {
    this.sp = species(key);
    if (!this.sp) throw new Error('no species ' + key);
    this.rig = this.sp.build();
    this.root = this.rig.root;
    if (key === 'stalker') {
      let s = 0.37 * 1e6; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      try { dressStalker(this.rig, randomAppearance(rnd), hazmatOutfit({})); } catch (e) { console.error('stalker dress', e); }
    }
    if (scale !== 1) this.root.scale.multiplyScalar(scale);
    this.height = (this.sp.height ?? 1) * scale; this.radius = (this.sp.radius ?? 0.5) * scale;
    S.scene.add(this.root);
  }
  private bx: { l: number; w: number; h: number; cx: number; cy: number; cz: number } | null = null;
  /** its size in its own frame (length along its facing, width, height), measured once */
  box(_S: Studio) {
    if (this.bx) return this.bx;
    const p = this.root.position.clone(), r = this.root.rotation.y;
    this.root.position.set(0, 0, 0); this.root.rotation.y = 0; this.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(this.root), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    this.root.position.copy(p); this.root.rotation.y = r; this.root.updateMatrixWorld(true);
    const ok = isFinite(sz.x) && sz.x > 0;
    this.bx = ok ? { l: Math.max(sz.z, 0.05), w: Math.max(sz.x, 0.05), h: Math.max(sz.y, 0.05), cx: c.x, cy: c.y, cz: c.z }
      : { l: this.radius * 2, w: this.radius * 2, h: this.height, cx: 0, cy: this.height / 2, cz: 0 };
    return this.bx;
  }
  tick(_u: number, dt: number) {
    const n = Math.max(1, Math.round(dt * 60));
    const sc = this.root.scale.x;
    for (let i = 0; i < n; i++) {
      this.t += dt / n;
      setPose(this.pose);
      this.root.position.set(0, 0, 0);
      try { this.sp.animateGallery?.(this.rig, this.t); } catch (e) { console.error(this.key, e); }
    }
    const off = this.root.position.clone();
    this.root.position.set(this.pos.x + off.x * sc, this.pos.y + off.y * sc, this.pos.z + off.z * sc);
    this.root.rotation.y = this.yaw;
  }
}

// ------------------------------------------------------------------ a beat
function poseAt(c: CreatureSpec, u: number, moving: boolean): string {
  if (c.poses?.length) { let p = c.poses[0][1]; for (const [t, q] of c.poses) if (u >= t) p = q; return p; }
  return c.pose ?? (moving ? 'walk' : 'idle');
}
function faceYaw(st: Stage, f: string | number | undefined, from: THREE.Vector3, others: Record<string, THREE.Vector3 | undefined>, pathYaw: number | null): number {
  if (typeof f === 'number') return yawIn(st, f);
  const tgt = f ? others[f] : undefined;
  if (tgt) return Math.atan2(tgt.x - from.x, tgt.z - from.z);
  if (pathYaw !== null) return pathYaw;
  return st.yaw + Math.PI; // facing back toward the camera side
}
function along(pts: THREE.Vector3[], k: number): { p: THREE.Vector3; yaw: number | null } {
  if (pts.length === 1) return { p: pts[0].clone(), yaw: null };
  const seg: number[] = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); tot += d; }
  let r = clamp01(k) * tot;
  for (let i = 0; i < seg.length; i++) {
    if (r <= seg[i] || i === seg.length - 1) {
      const f = seg[i] > 0 ? Math.min(1, r / seg[i]) : 1, a = pts[i], b = pts[i + 1];
      return { p: a.clone().lerp(b, f), yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    r -= seg[i];
  }
  return { p: pts[pts.length - 1].clone(), yaw: null };
}

export function beatShot(spec: BeatSpec, st: Stage) {
  return (c: ShotCtxLike, dur: number) => {
    const S = c.S;
    const cr = (spec.creatures ?? []).map((cs) => {
      const a = new SpeciesActor(S, cs.key, cs.scale ?? 1);
      c.actors.push(a);
      const pts = (cs.from ? [cs.from, ...(cs.via ?? []), cs.to ?? cs.from] : [cs.at ?? [0, 2]]).map((p) => W(st, p));
      return { cs, a, pts };
    });
    const cal = spec.calder ? new Calder(S, W(st, spec.calder.at).x, W(st, spec.calder.at).z, 0) : null;
    if (cal) c.actors.push(cal);
    const un = spec.unit ? new Unit(S, W(st, spec.unit.at).x, W(st, spec.unit.at).z, 0, spec.unit.seed ?? 0.37) : null;
    if (un) c.actors.push(un);
    const ca = spec.caught;
    const unitPts = spec.unit ? [W(st, spec.unit.at), W(st, spec.unit.to ?? spec.unit.at)] : [];
    // the catcher's path ends at the unit, a body length short
    if (ca && un && cr.length) {
      const k = cr[ca.by ?? 0];
      const target = unitPts[1].clone();
      const last = k.pts[k.pts.length - 1];
      const dir = target.clone().sub(k.pts.length > 1 ? k.pts[k.pts.length - 2] : last).setY(0);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
      const reach = Math.max(0.25, k.a.radius * 0.9);
      if (k.pts.length === 1) k.pts.unshift(last.clone());
      k.pts[k.pts.length - 1] = target.clone().addScaledVector(dir, -reach);
    }
    let saidGesture = false, unitDown = 0, aOff: number | null = null;
    const caughtT = ca ? ca.t : 1e9;
    const mv = spec.camera?.move ?? 'wide';
    return (u: number, dt: number) => {
      // ---- the creatures
      const where: Record<string, THREE.Vector3 | undefined> = {};
      const unitPos = un ? (unitPts[0].clone().lerp(unitPts[1], smooth(clamp01(u / Math.max(0.1, Math.min(dur, caughtT))))) ) : undefined;
      for (const [i, k] of cr.entries()) {
        const moving = k.pts.length > 1;
        const end = ca && (ca.by ?? 0) === i ? caughtT : dur;
        const kk = moving ? clamp01(u / Math.max(0.1, end)) : 0;
        let { p, yaw } = along(k.pts, k.cs.poses ? kk : smooth(kk) * 0.15 + kk * 0.85);
        if (ca && (ca.by ?? 0) === i && u > caughtT && ca.drag) {
          const d0 = k.pts[k.pts.length - 1], d1 = W(st, ca.drag);
          p = d0.clone().lerp(d1, smooth((u - caughtT - 0.8) / Math.max(0.5, dur - caughtT - 0.8)));
          yaw = Math.atan2(d1.x - d0.x, d1.z - d0.z);
        }
        k.a.pos.set(p.x, (k.cs.y ?? 0) + ground(S, p), p.z);
        where['creature' + (i || '')] = k.a.pos;
        if (i === 0) where.creature = k.a.pos;
      }
      if (un && unitPos) where.unit = unitPos;
      if (cal) where.calder = cal.pos;
      where.stage = W(st, [0, 3], st.y + 1);
      where.camera = S.cam.position;
      for (const [i, k] of cr.entries()) {
        const moving = k.pts.length > 1 && u < (ca && (ca.by ?? 0) === i ? caughtT : dur);
        let pose = poseAt(k.cs, u, moving);
        if (ca && (ca.by ?? 0) === i && u >= caughtT) pose = u < caughtT + 1.2 || !ca.then ? (ca.pose ?? pose) : ca.then;
        if (ca && (ca.by ?? 0) === i && u >= caughtT && ca.drag && u > caughtT + 0.8) pose = ca.then ?? pose;
        k.a.pose = pose;
        const pathYaw = k.pts.length > 1 ? along(k.pts, clamp01(u / Math.max(0.1, dur))).yaw : null;
        const fyaw = (ca && (ca.by ?? 0) === i && u >= caughtT - 0.4 && where.unit) ? Math.atan2(where.unit.x - k.a.pos.x, where.unit.z - k.a.pos.z)
          : faceYaw(st, k.cs.face, k.a.pos, where, pathYaw);
        let dy = fyaw - k.a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        k.a.yaw += dy * Math.min(1, dt * (u < 0.05 ? 60 : 5));
      }
      // ---- the unit
      if (un && unitPos) {
        const walking = !!spec.unit!.to && u < caughtT;
        const dn = spec.unit!.do ?? 'idle';
        un.pos.set(unitPos.x, ground(S, unitPos), unitPos.z);
        const uy = faceYaw(st, spec.unit!.face ?? (walking ? undefined : 'creature'), un.pos, where, walking ? Math.atan2(unitPts[1].x - unitPts[0].x, unitPts[1].z - unitPts[0].z) : null);
        let d = uy - un.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        un.yaw += d * Math.min(1, dt * (u < 0.05 ? 60 : 6));
        const spd = walking ? unitPts[0].distanceTo(unitPts[1]) / Math.max(0.1, Math.min(dur, caughtT)) : 0;
        if (u >= caughtT) {
          unitDown += dt;
          const lying = spec.unit!.do === 'downed' || spec.unit!.do === 'dead';
          un.input = lying ? { full: spec.unit!.do === 'dead' ? 'dead' : 'downed', panic: 1 }
            : unitDown < 0.35 ? { panic: 1, action: 'flinch', actionT: unitDown, actionDur: 0.4 } : { full: unitDown < 1.0 ? 'fall' : 'downed', panic: 1 };
          if (ca?.drag && u > caughtT + 0.8 && cr[ca.by ?? 0]) { const h = cr[ca.by ?? 0].a.pos; un.pos.set(h.x, ground(S, h), h.z); }
          if (ca?.hide !== undefined && u > caughtT + ca.hide) un.root.visible = false;
        } else if (dn === 'downed' || dn === 'dead') un.input = { full: dn === 'dead' ? 'dead' : 'downed' };
        else if (dn === 'crouch') un.input = { stance: 'crouch' as never, speed: spd };
        else un.input = { speed: spd, panic: dn === 'flee' || dn === 'run' ? 1 : 0, stance: 'stand' as never };
        un.speed = spd;
      }
      // ---- Dr. Calder: points out what she is talking about
      if (cal && spec.calder) {
        const cs = spec.calder;
        const lookAt = cs.look === 'camera' ? S.cam.position : (where[cs.look ?? 'creature'] ?? S.cam.position);
        const fy = faceYaw(st, cs.face ?? 'creature', cal.pos, where, null);
        const toCam = Math.atan2(S.cam.position.x - cal.pos.x, S.cam.position.z - cal.pos.z);
        let dd = toCam - fy; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
        cal.yaw = fy + dd * (mv === 'two' ? 0.84 : 0.45);   // turned to the lens, toward what she shows
        // she talks to the lens, glancing at what she shows while she shows it
        const glance = mv === 'two' ? u > dur * 0.3 && u < dur * 0.62 : u > dur * 0.35;
        cal.r.lookAt(glance ? (mv === 'two' ? S.cam.position.clone().lerp(lookAt.clone().setY(lookAt.y + 0.5), 0.5) : lookAt.clone().setY(lookAt.y + 0.5)) : S.cam.position);
        if (!saidGesture && u > (cs.doAt ?? 0.6)) {
          saidGesture = true;
          const g = cs.do ?? 'point';
          const tgt = (where[cs.look ?? 'creature'] ?? where.creature)?.clone();
          if (g === 'point' || g === 'present') cal.r.gesture(g as never, { dur: dur - (cs.doAt ?? 0.6) - 0.3, at: tgt ? tgt.setY(tgt.y + 0.6) : undefined });
          else cal.r.gesture(g as never, { dur: Math.min(3, dur - 1) });
        }
      }
      // ---- the camera: framed on the creature's own size (portrait: the width is what has to fit)
      const cm = spec.camera ?? {};
      const k0 = cr[0]?.a;
      const box = k0?.box(S) ?? { l: 1, w: 0.6, h: 1.7, cx: 0, cy: 0.85, cz: 0 };
      const big = Math.max(box.l, box.h, 0.2);
      const asp = S.pr.lowW / Math.max(1, S.pr.lowH);
      const fov = cm.fov ?? (mv === 'two' ? 50 : mv === 'over' ? 50 : mv === 'low' ? 46 : 40);
      const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * Math.min(1, asp));
      const T = (() => {
        const on = cm.on ?? 'body';
        if (on === 'unit' && un) return un.pos.clone().setY(un.pos.y + 1.1);
        if (on === 'calder' && cal) return cal.pos.clone().setY(cal.pos.y + 1.3);
        if (on === 'stage' || !k0) return W(st, [0, 2], st.y + 1.2);
        const fw = V(Math.sin(k0.yaw), 0, Math.cos(k0.yaw)), rt = V(Math.cos(k0.yaw), 0, -Math.sin(k0.yaw));
        const c0 = k0.pos.clone().addScaledVector(rt, box.cx).addScaledVector(fw, box.cz).setY(k0.pos.y + box.cy);
        const o = Array.isArray(on) ? on : on === 'head' ? [0, 0.3, 0.42] : on === 'tail' ? [0, 0, -0.42] : on === 'feet' ? [0, -0.38, 0] : on === 'mid' && un ? null : [0, 0, 0];
        if (!o) return c0.lerp(un!.pos.clone().setY(un!.pos.y + 1), 0.5);
        return c0.addScaledVector(rt, o[0] * box.w).addScaledVector(V(0, 1, 0), o[1] * box.h).addScaledVector(fw, o[2] * box.l);
      })();
      const size = cm.size ?? (mv === 'close' ? big * 0.4 : mv === 'wide' ? big * 1.25 + 1 : mv === 'low' ? big * 1.0 : big * 0.75);
      const f = clamp01(u / dur);
      const dist0 = cm.dist ?? (size / 2) / Math.tan(hfov / 2);
      if (aOff === null) {
        // a clear line from the subject to the lens: if a wall or a pillar is in the way, swing round a little
        aOff = 0;
        for (const d of [0, 20, -20, 40, -40, 65, -65]) {
          const ad = yawIn(st, (cm.angle ?? 0) + d);
          const p0 = T.clone().add(V(-Math.sin(ad) * dist0, 0, -Math.cos(ad) * dist0));
          if (clearTo(S, T, p0) >= dist0 * 0.9) { aOff = d; break; }
        }
      }
      const ang = yawIn(st, (cm.angle ?? 0) + aOff);
      let a = ang;
      if (mv === 'orbit') a += ((cm.orbit ?? 50) * Math.PI / 180) * (smooth(f) - 0.5);
      if (mv === 'track') a += lerp(-0.12, 0.12, f);
      let dist = dist0;
      dist *= 1 - (cm.push ?? (mv === 'push' ? 0.4 : 0.07)) * smooth(f);
      let camP = T.clone().add(V(-Math.sin(a) * dist, 0, -Math.cos(a) * dist));
      let look = T.clone();
      if (cm.lookY !== undefined) look.y = ground(S, look) + cm.lookY;
      let hgt = cm.height !== undefined ? cm.height : mv === 'low' ? 0.3 : Math.max(0.5, look.y - ground(S, look) + dist * Math.tan(0.1));
      if (mv === 'two' && cal) {
        // the presenter shot: the camera in front of her, she in the near half of the frame turned to the lens,
        // the creature behind her, beyond
        const far = k0 ? k0.pos.clone().setY(k0.pos.y + Math.min(box.h * 0.5, 2.5)) : where.stage!.clone();
        const away = cal.pos.clone().sub(far).setY(0).normalize();
        const side = V(away.z, 0, -away.x).multiplyScalar(cm.angle !== undefined && cm.angle < 0 ? -1 : 1);
        camP = cal.pos.clone().addScaledVector(away, cm.dist ?? 2.3).addScaledVector(side, 0.32);
        hgt = cm.height ?? 1.45;
        look = cal.pos.clone().setY(cal.pos.y + 1.45).lerp(far, 0.18);
      } else if (mv === 'over' && un) {
        // over the unit's shoulder at what it faces
        const far = k0 ? k0.pos.clone().setY(k0.pos.y + Math.min(box.h * 0.5, 2.5)) : W(st, [0, 3], 1);
        const dir = far.clone().sub(un.pos).setY(0).normalize();
        const side = V(dir.z, 0, -dir.x).multiplyScalar(cm.angle !== undefined && cm.angle < 0 ? -1 : 1);
        camP = un.pos.clone().addScaledVector(dir, -(cm.dist ?? 1.6)).addScaledVector(side, 0.3);
        hgt = cm.height ?? 1.55;
        look = un.pos.clone().setY(un.pos.y + 1.3).lerp(far, 0.55);
      }
      // over water (or a track bed) the height counts from the stage's floor, not the bottom of the pool
      camP.y = (st.kind === 'water' ? Math.max(ground(S, camP), st.y) : ground(S, camP)) + hgt;
      // keep the lens inside the room
      const room = clearTo(S, look, camP);
      if (room < look.distanceTo(camP)) camP = look.clone().add(camP.clone().sub(look).setLength(room));
      const shake = ca && u > caughtT && u < caughtT + 0.6 ? 3 : (cm.hand ?? 0.8);
      aim(S, camP, look, fov, shake);
      // ---- light: a key from beside the lens, a fill from the other side
      const L = spec.light ?? 1;
      const sideV = V(Math.cos(a), 0, -Math.sin(a));
      c.lights.key.position.copy(camP).addScaledVector(sideV, 1.2).setY(camP.y + 1.4);
      c.lights.key.intensity = 2.0 * L; c.lights.key.distance = 9 + dist;
      c.lights.fill.position.copy(look).addScaledVector(sideV, -2.0).setY(look.y + 0.8);
      c.lights.fill.intensity = 0.7 * L; c.lights.fill.distance = 8 + dist;
    };
  };
}

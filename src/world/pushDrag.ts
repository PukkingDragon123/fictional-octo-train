// Grabbing furniture and moving it by hand. The survivor gets hold of a
// piece (op 'objHold': it leaves the tile grid on every peer and is drawn as
// a proxy), then walks: the object keeps its offset from them, slowed by its
// weight against their strength, sliding along walls and stopping against
// other furniture; they push when walking into it and drag when backing
// away. Letting go writes where it ended up (op 'objRelease', bus
// 'objPushed'), so it can be shoved onto a Remittance Hopper plate. While it
// moves it scrapes (a positional loop), leaves scuff marks, and smears any
// fresh blood it is dragged through. Other peers see it move from a light
// stream of positions (fx on the gore channel, not logged).
import * as THREE from 'three';
import { G } from '../game/G';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { clamp } from '../core/math';
import { moveCircle } from './collision';
import { Zone, TileObject } from './zone';
import { objDef, objectGeometry, ObjDef } from './objects';
import { objectMatrix } from './chunkMesher';
import { MAT, worldMaterial } from '../gfx/materials';
import type { Player } from '../entities/player';
import { applyHold, pushable } from './destruction';
import { objMass, objMat } from './debris';
import type { TimedAction } from '../actions/action';

interface PushState {
  o: TileObject; z: Zone; d: ObjDef; action: TimedAction;
  relX: number; relZ: number; k: number; mass: number;
  px: number; pz: number; cx: number; cz: number;
  rw: number; rd: number;
  sendT: number; moveD: number; smearD: number; scuffD: number; moving: number; loopKey: string; t: number;
}
interface Proxy { uid: number; zone: string; mesh: THREE.Group; o: TileObject; d: ObjDef; x: number; z: number; tx: number; tz: number; moving: number; local: boolean; removeWait: boolean; loopKey: string }

const ROT = [0, 1, 2, 3].map((r) => new THREE.Matrix4().makeRotationY(-r * Math.PI / 2));

export class PushDrag {
  st: PushState | null = null;
  proxies = new Map<number, Proxy>();

  constructor() {
    bus.on('objHeld', (z: Zone, o: TileObject, by: string) => this.held(z, o, by));
  }

  /** strongest load a survivor can shift at all */
  maxMass(p: Player) { return 130 + p.body.skill('strength') * 28 + (p.body.has?.('strong') ? 60 : 0); }

  /** start holding o (called from PushAction.start on the local machine) */
  begin(p: Player, o: TileObject, mode: 'push' | 'drag', action: TimedAction): boolean {
    const z = G.getZone(p.zoneKey);
    const d = objDef(o.key);
    if (!d || !z.objects.has(o.uid) || !pushable(d, o)) return false;
    if (this.st) this.end('switch');
    const mass = objMass(d);
    if (mass > this.maxMass(p)) {
      bus.emit('think', p, mass > 400 ? "That's not moving. Not without a forklift." : "It won't budge.");
      G.audio?.at?.('dmg_stuck', p.x, p.z, 0.8);
      p.body.endurance = Math.max(0, p.body.endurance - 0.03);
      return false;
    }
    const m = objectMatrix(z, o, d);
    const cx = m.elements[12], cz = m.elements[14];
    const w = d.w ?? 1, dd = d.d ?? 1;
    const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    // close enough to put hands on it?
    const nx = Math.max(cx - rw / 2, Math.min(p.x, cx + rw / 2)), nz = Math.max(cz - rd / 2, Math.min(p.z, cz + rd / 2));
    if (Math.hypot(nx - p.x, nz - p.z) > 0.95) { bus.emit('think', p, "I can't reach it from here."); return false; }
    const str = p.body.skill('strength');
    const k = clamp((0.85 + str * 0.06) * 42 / (mass + 26), 0.12, 0.85) * (mode === 'drag' ? 0.9 : 1);
    applyHold(z, o, p.id);
    op('objHold', { z: z.key, uid: o.uid, by: p.id });
    this.st = {
      o, z, d, action, relX: cx - p.x, relZ: cz - p.z, k, mass, px: p.x, pz: p.z, cx, cz, rw, rd,
      sendT: 0, moveD: 0, smearD: 0, scuffD: 0, moving: 0, loopKey: 'push:' + o.uid, t: 0,
    };
    G.audio?.at?.('dmg_grab', cx, cz, 0.7);
    if (mass > 60) bus.emit('think', p, mass > 110 ? 'Heavy. Really heavy.' : 'Heavy...');
    return true;
  }

  /** let go: write where it is */
  end(_why = '') {
    const st = this.st; if (!st) return;
    this.st = null;
    const { o, z, d } = st;
    G.audio?.positionalLoop?.(st.loopKey, null);
    if (!z.objects.has(o.uid)) return;
    const w = d.w ?? 1, dd = d.d ?? 1;
    const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    const ax = Math.floor(st.cx - rw / 2 + 0.5), ay = Math.floor(st.cz - rd / 2 + 0.5);
    const ox = Math.round((st.cx - (ax + rw / 2)) * 100) / 100, oz = Math.round((st.cz - (ay + rd / 2)) * 100) / 100;
    op('objRelease', { z: z.key, uid: o.uid, by: G.local?.id ?? 'host', x: ax, y: ay, ox, oz });
    G.audio?.at?.('dmg_debris_wood', st.cx, st.cz, 0.5);
  }

  forget(uid: number) {
    if (this.st?.o.uid === uid) { G.audio?.positionalLoop?.(this.st.loopKey, null); this.st = null; }
    const pr = this.proxies.get(uid);
    if (pr) { G.audio?.positionalLoop?.(pr.loopKey, null); this.removeProxy(pr); }
  }

  zoneChanged() {
    if (this.st) this.end('zone');
    for (const pr of [...this.proxies.values()]) this.removeProxy(pr);
    // proxies for objects already held in the new zone
    const z = G.view?.zone;
    if (z) for (const o of z.objects.values()) if (o.state?.held) this.held(z, o, o.state.held);
  }

  /** someone took hold of o: show a proxy (here) */
  private held(z: Zone, o: TileObject, by: string) {
    if (z !== G.view?.zone) return;
    const d = objDef(o.key); if (!d) return;
    if (this.proxies.has(o.uid)) return;
    const g = objectGeometry(d, o);
    const mesh = new THREE.Group();
    if (g) {
      const m = new THREE.Mesh(g, d.height > 1.1 || d.tall ? MAT.prop : MAT.propLow);
      m.castShadow = !d.noShadow; m.receiveShadow = true;
      mesh.add(m);
    }
    const ov = G.destruct?.overlayFor?.(o, d);
    if (ov) { const m = new THREE.Mesh(ov, worldMaterial({ alphaTest: 0.5 })); m.renderOrder = 1; mesh.add(m); }
    mesh.matrixAutoUpdate = false;
    const om = objectMatrix(z, o, d);
    const pr: Proxy = { uid: o.uid, zone: z.key, mesh, o, d, x: om.elements[12], z: om.elements[14], tx: om.elements[12], tz: om.elements[14], moving: 0, local: by === G.local?.id, removeWait: false, loopKey: 'pushr:' + o.uid };
    this.place(pr, z);
    G.destruct?.root?.add(mesh);
    this.proxies.set(o.uid, pr);
  }

  private place(pr: Proxy, z: Zone) {
    const o = pr.o, d = pr.d;
    const h = z.heightAt(Math.floor(pr.x), Math.floor(pr.z));
    const m = pr.mesh.matrix;
    m.makeTranslation(pr.x, h + (o.state?.y ?? 0), pr.z);
    m.multiply(ROT[o.rot]);
    if (o.state?.yaw) m.multiply(new THREE.Matrix4().makeRotationY(o.state.yaw));
    pr.mesh.matrixWorldNeedsUpdate = true;
    void d;
  }

  private removeProxy(pr: Proxy) {
    G.destruct?.root?.remove(pr.mesh);
    this.proxies.delete(pr.uid);
  }

  /** the release landed on this peer: the proxy goes once the chunk with the object is rebuilt */
  released(z: Zone, o: TileObject) {
    const pr = this.proxies.get(o.uid);
    if (!pr) return;
    const d = objDef(o.key)!;
    const m = objectMatrix(z, o, d);
    pr.x = pr.tx = m.elements[12]; pr.z = pr.tz = m.elements[14];
    this.place(pr, z);
    pr.removeWait = true; pr.moving = 0;
    G.audio?.positionalLoop?.(pr.loopKey, null);
  }

  onNet(ev: any) {
    if (!ev || ev.k !== 'mv') return;
    const pr = this.proxies.get(ev.u);
    if (!pr || pr.local || pr.zone !== ev.z) return;
    pr.tx = ev.x; pr.tz = ev.zz; pr.moving = ev.m ? 0.4 : 0;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    this.updateLocal(dt);
    const z = G.view?.zone;
    for (const pr of [...this.proxies.values()]) {
      if (!z || pr.zone !== z.key) { this.removeProxy(pr); continue; }
      if (pr.removeWait) {
        const o = pr.o;
        if (!z.dirtyChunks.has(z.chunkOf(o.x, o.y))) this.removeProxy(pr);
        continue;
      }
      if (pr.local && this.st?.o === pr.o) { pr.x = this.st.cx; pr.z = this.st.cz; }
      else if (!pr.local) {
        const k = 1 - Math.exp(-10 * dt);
        pr.x += (pr.tx - pr.x) * k; pr.z += (pr.tz - pr.z) * k;
        pr.moving = Math.max(0, pr.moving - dt);
        G.audio?.positionalLoop?.(pr.loopKey, pr.moving > 0 ? scrapeKey(pr.d) : null, pr.x, pr.z, 0.6, 1, 22);
      }
      this.place(pr, z);
    }
  }

  private updateLocal(dt: number) {
    const st = this.st; if (!st) return;
    const p = G.local;
    const cur = p?.actions.current;
    if (!p || p.body.dead || p.body.downed || p.zoneKey !== st.z.key || cur !== st.action || !st.z.objects.has(st.o.uid) || st.o.state?.held !== p.id && st.o.state?.held !== undefined && st.o.state?.held !== null) {
      this.end('lost'); return;
    }
    if (p.aiming) { this.end('aim'); return; }
    st.t += dt;
    const z = st.z;
    // how far the player tried to go this frame, scaled by the load
    const wx = p.x - st.px, wz = p.z - st.pz;
    let mx = wx * st.k, mz = wz * st.k;
    if (Math.hypot(mx, mz) > 1e-5) {
      if (!this.canPlace(z, st, st.cx + mx, st.cz + mz)) {
        if (Math.abs(mx) > 1e-5 && this.canPlace(z, st, st.cx + mx, st.cz)) mz = 0;
        else if (Math.abs(mz) > 1e-5 && this.canPlace(z, st, st.cx, st.cz + mz)) mx = 0;
        else { mx = 0; mz = 0; }
      }
    }
    // the player moves exactly as far as the load did
    p.x = st.px; p.z = st.pz;
    if (mx || mz) moveCircle(z, p, mx, mz, { ignoreLow: false });
    const ncx = p.x + st.relX, ncz = p.z + st.relZ;
    if (this.canPlace(z, st, ncx, ncz)) { st.cx = ncx; st.cz = ncz; }
    else { p.x = st.cx - st.relX; p.z = st.cz - st.relZ; }
    const moved = Math.hypot(p.x - st.px, p.z - st.pz);
    st.px = p.x; st.pz = p.z;
    const sp = moved / Math.max(1e-4, dt);
    p.speed = sp; p.vx *= st.k; p.vz *= st.k; p.running = false;
    // keep the object's own fields current here (anchor and offset) for anything that looks at it
    const ax = Math.floor(st.cx - st.rw / 2 + 0.5), ay = Math.floor(st.cz - st.rd / 2 + 0.5);
    st.o.x = ax; st.o.y = ay; st.o.ox = st.cx - (ax + st.rw / 2); st.o.oz = st.cz - (ay + st.rd / 2);
    // face it; pushing when walking into it, dragging when backing off
    p.facing = p.targetFacing = Math.atan2(st.relZ, st.relX);
    const into = wx * st.relX + wz * st.relZ;
    if (moved > 0.002) (st.action as any).anim = into >= 0 ? 'push' : 'drag';
    st.moving = moved > 0.002 ? 0.25 : Math.max(0, st.moving - dt);
    // effort
    if (moved > 0.002) { p.body.endurance = Math.max(0, p.body.endurance - dt * 0.012 * Math.min(3, st.mass / 40)); p.exertionTimer = 1; if (p.body.endurance < 0.04) { bus.emit('think', p, 'I need to catch my breath.'); this.end('tired'); return; } }
    // sound, marks, smears
    G.audio?.positionalLoop?.(st.loopKey, st.moving > 0 ? scrapeKey(st.d) : null, st.cx, st.cz, 0.55 + Math.min(0.4, st.mass / 200), 0.8 + Math.min(0.5, sp), 22);
    st.moveD += moved; st.smearD += moved; st.scuffD += moved;
    if (st.smearD > 0.3) {
      st.smearD = 0;
      const wet = G.gore?.decals?.wetAt?.(z.key, st.cx, st.cz);
      if (wet && wet.wet > 0.12 && (G.sandbox.gore ?? 2) > 0) {
        const a = Math.atan2(wz, wx);
        G.gore.decals.commit(z, { x: st.cx - Math.cos(a) * 0.3, z: st.cz - Math.sin(a) * 0.3, w: Math.min(1.2, st.rw * 0.8 + 0.3), d: 0.35, rot: a, tex: 'gore_red_smear', tint: wet.tint }, 0.4, { show: true, force: true });
      }
    }
    if (st.scuffD > 1.1 && st.mass > 15) {
      st.scuffD = 0;
      const a = Math.atan2(wz, wx);
      op('decal', { z: z.key, d: { x: Math.round(st.cx * 100) / 100, z: Math.round(st.cz * 100) / 100, w: Math.min(1.4, st.rw * 0.9), d: 0.5, rot: Math.round(a * 100) / 100, tex: 'dbr_scrape', y: 0.0105 } });
    }
    // others see it move
    st.sendT -= dt;
    if (st.sendT <= 0 && G.role !== 'solo') {
      st.sendT = 0.12;
      G.net?.broadcastFx?.('gore', { t: 'D', k: 'mv', z: z.key, u: st.o.uid, x: Math.round(st.cx * 100) / 100, zz: Math.round(st.cz * 100) / 100, m: st.moving > 0 ? 1 : 0 });
    }
    if (G.input?.hit?.('interact')) this.end('key');
  }

  /** can the held object's footprint sit with its centre at (cx, cz)? (walls, other furniture, floor) */
  private canPlace(z: Zone, st: PushState, cx: number, cz: number): boolean {
    const hx = st.rw / 2 - 0.06, hz = st.rd / 2 - 0.06;
    const ctx = Math.floor(cx), ctz = Math.floor(cz);
    if (!z.inb(ctx, ctz) || !z.floor[z.idx(ctx, ctz)]) return false;
    const pts: [number, number][] = [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx - hx, cz + hz], [cx + hx, cz + hz], [cx, cz - hz], [cx, cz + hz], [cx - hx, cz], [cx + hx, cz], [cx, cz]];
    for (const [x, y] of pts) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!z.inb(tx, ty)) return false;
      const i = z.idx(tx, ty);
      if (!z.floor[i]) return false;
      const s = z.solid[i];
      if (s === 1 || s === 3 || s === 2) return false;
      // walls between the centre tile and this corner's tile
      let ix = ctx, iy = ctz;
      while (ix !== tx) { const sx = tx > ix ? 1 : -1; if (z.edgeBlocks(ix, iy, sx, 0, 'walk')) return false; ix += sx; }
      while (iy !== ty) { const sy = ty > iy ? 1 : -1; if (z.edgeBlocks(ix, iy, 0, sy, 'walk')) return false; iy += sy; }
    }
    // other survivors are in the way too
    for (const q of G.players.values()) {
      if (q.isLocal || q.zoneKey !== z.key || q.body.dead) continue;
      if (Math.abs(q.x - cx) < hx + 0.25 && Math.abs(q.z - cz) < hz + 0.25) return false;
    }
    return true;
  }
}

function scrapeKey(d: ObjDef): string {
  const m = objMat(d);
  return m === 'metal' || m === 'elec' ? 'dmg_scrape_metal' : m === 'fabric' ? 'dmg_scrape_soft' : 'dmg_scrape_wood';
}

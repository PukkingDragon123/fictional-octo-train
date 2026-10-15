import * as THREE from 'three';
import { PixelRenderer, Grade, DEFAULT_GRADE } from '../gfx/renderer';
import { U } from '../gfx/materials';
import { atlas } from '../gfx/atlas';
import { Input } from '../core/input';
import { bus } from '../core/events';
import { clamp, damp, lerp, wrapAngle } from '../core/math';
import { Zone, Portal } from '../world/zone';
import { ZoneRenderer } from '../world/zoneRenderer';
import { LightGrid } from '../world/lighting';
import { Visibility } from '../world/visibility';
import { generateZone, zoneSpec } from '../world/worldGraph';
import { moveCircle } from '../world/collision';
import { floorDef } from '../world/defs';
import { Player } from '../entities/player';
import { Clock } from './clock';
import { setGame } from './G';
import { itemDef } from '../items/item';

export interface GameSystem {
  name: string;
  /** dt real seconds, dh in-game hours */
  update(dt: number, dh: number): void;
  onZoneChange?(z: Zone): void;
}

export interface ZoneView { zone: Zone; zr: ZoneRenderer; lg: LightGrid; vis: Visibility; }

export const GRADES: Record<string, Partial<Grade>> = {
  lobby: { lift: [0.02, 0.018, 0.0], gain: [1.02, 1.0, 0.86], gamma: 1.0, sat: 0.92, tint: [1, 0.99, 0.9], vignette: 0.42 },
  office: { lift: [0.0, 0.01, 0.02], gain: [0.95, 1.0, 1.02], sat: 0.8, vignette: 0.45 },
  pool: { lift: [0.02, 0.04, 0.05], gain: [0.95, 1.04, 1.08], sat: 0.95, tint: [0.96, 1.02, 1.04], vignette: 0.3 },
  mall: { lift: [0.03, 0.02, 0.03], gain: [1.03, 0.98, 1.0], sat: 0.85, tint: [1.02, 0.98, 1.0], vignette: 0.4 },
  market: { lift: [0.01, 0.02, 0.02], gain: [0.98, 1.02, 1.0], sat: 0.8, vignette: 0.45 },
  parking: { lift: [0.03, 0.015, 0.0], gain: [1.08, 0.9, 0.7], sat: 0.9, vignette: 0.55 },
  suburbs: { lift: [0.03, 0.03, 0.05], gain: [1.0, 1.0, 1.05], sat: 1.05, vignette: 0.3 },
  fields: { lift: [0.05, 0.05, 0.08], gain: [1.0, 1.02, 1.04], sat: 1.1, vignette: 0.25 },
  school: { lift: [0.01, 0.01, 0.0], gain: [1.0, 0.98, 0.92], sat: 0.85, vignette: 0.45 },
  hospital: { lift: [0.0, 0.02, 0.02], gain: [0.92, 1.02, 0.98], sat: 0.7, vignette: 0.5 },
  tunnels: { lift: [0.0, 0.0, 0.01], gain: [0.9, 0.92, 0.95], sat: 0.6, vignette: 0.6 },
  lab: { lift: [0.0, 0.01, 0.03], gain: [0.95, 1.0, 1.06], sat: 0.7, vignette: 0.4 },
  server: { lift: [0.0, 0.01, 0.04], gain: [0.85, 0.95, 1.1], sat: 0.85, vignette: 0.55 },
  stairwell: { lift: [0.01, 0.01, 0.01], gain: [0.95, 0.95, 0.95], sat: 0.6, vignette: 0.6 },
  corrupt: { lift: [0.04, 0.0, 0.05], gain: [1.1, 0.9, 1.15], sat: 1.2, vignette: 0.5 },
  exit: { lift: [0.1, 0.1, 0.1], gain: [1.1, 1.1, 1.1], sat: 0.5, vignette: 0.2 },
  void: { lift: [0, 0, 0], gain: [0.8, 0.8, 0.9], sat: 0.4, vignette: 0.7 },
  house: { lift: [0.03, 0.02, 0.01], gain: [1.05, 1.0, 0.9], sat: 0.95, tint: [1.02, 1.0, 0.94], vignette: 0.45 },
};

export class Game {
  pr: PixelRenderer;
  input: Input;
  clock = new Clock();
  zones = new Map<string, Zone>();
  view: ZoneView | null = null;
  players = new Map<string, Player>();
  local!: Player;
  systems: GameSystem[] = [];
  worldSeed = 1337;
  time = 0;
  dt = 0;
  paused = false;
  /** multiplayer role */
  role: 'solo' | 'host' | 'client' = 'solo';
  /** gore: 0 off, 1 normal, 2 heavy (dismemberment, gibs, arterial spray) */
  sandbox = { dayLength: 60, creatures: 1, loot: 1, startHour: 8.5, collapseSpeed: 1, waterShutoffDays: 14, powerShutoffDays: 10, gore: 2 };
  // lights
  ambient = new THREE.AmbientLight(0xffffff, 1);
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x405030, 0);
  sun = new THREE.DirectionalLight(0xfff2d8, 0);
  flashlights: THREE.SpotLight[] = [];
  points: THREE.PointLight[] = [];
  /** requests for point lights this frame (fires, flares, lamps) */
  private pointReq: { x: number; y: number; z: number; color: number; intensity: number; dist: number }[] = [];
  /** last frame's dynamic lights big enough to matter for gameplay light checks (fires, lanterns, muzzle flashes) */
  private pointPrev: { x: number; z: number; intensity: number; dist: number }[] = [];
  camZoom = 3;
  camLead = new THREE.Vector3();
  // ui / services attached later
  ui: any = null;
  audio: any = null;
  net: any = null;
  creatures: any = null;
  items: any = null;
  missions: any = null;
  combat: any = null;
  picking: any = null;
  interact: any = null;
  survival: any = null;
  /** blood, gibs and dismemberment (src/gore) */
  gore: any = null;
  collapse = 0;
  /** title-screen mode: replaces player control with a scripted wanderer */
  attract: ((dt: number) => void) | null = null;
  /** save slot of this world (set on first save / load) */
  saveId: string | null = null;
  playMinutes = 0;
  sessionStart = performance.now();
  fade = 0; fadeTarget = 0; fadeCb: (() => void) | null = null;
  transitioning = false;

  constructor(canvas: HTMLCanvasElement) {
    setGame(this);
    this.pr = new PixelRenderer(canvas);
    this.input = new Input(canvas);
    atlas().flush();
    const s = this.pr.scene;
    s.add(this.ambient); s.add(this.hemi); s.add(this.sun); s.add(this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    for (let i = 0; i < 4; i++) {
      const f = new THREE.SpotLight(0xfff1d6, 0, 18, 0.48, 0.55, 1.3);
      f.castShadow = i === 0;
      if (i === 0) { f.shadow.mapSize.set(1024, 1024); f.shadow.camera.near = 0.15; f.shadow.bias = -0.0006; f.shadow.normalBias = 0.02; }
      s.add(f); s.add(f.target);
      this.flashlights.push(f);
    }
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PointLight(0xff8a3a, 0, 8, 1.6);
      s.add(p); this.points.push(p);
    }
    this.pr.setZoomLevel(this.camZoom);
  }

  addSystem(s: GameSystem) { this.systems.push(s); return s; }

  // ---------------- zones ----------------
  getZone(key: string): Zone {
    let z = this.zones.get(key);
    if (!z) {
      z = generateZone(key, this.worldSeed);
      this.zones.set(key, z);
      bus.emit('zoneGenerated', z);
    }
    return z;
  }

  get zone(): Zone { return this.view!.zone; }

  setView(z: Zone) {
    if (this.view?.zone === z) return;
    if (this.view) { this.pr.scene.remove(this.view.zr.root); this.view.zr.dispose(); }
    const zr = new ZoneRenderer(z);
    this.pr.scene.add(zr.root);
    this.view = { zone: z, zr, lg: new LightGrid(z), vis: new Visibility(z) };
    this.applyZoneEnv(z, true);
    for (const s of this.systems) s.onZoneChange?.(z);
    bus.emit('zoneView', z);
  }

  applyZoneEnv(z: Zone, instant = false) {
    const e = z.env;
    this.ambient.color.set(e.ambient);
    this.ambient.intensity = e.ambientI * Math.PI;
    U.uFogColor.value.set(e.fog);
    U.uFogNear.value = e.fogNear; U.uFogFar.value = e.fogFar;
    U.uVoidColor.value.set(e.void);
    this.pr.scene.background = new THREE.Color(e.void);
    const g = { ...DEFAULT_GRADE, ...(GRADES[e.grade] || {}) } as Grade;
    this.pr.gradeTarget = JSON.parse(JSON.stringify(g));
    if (instant) this.pr.grade = JSON.parse(JSON.stringify(g));
    this.sun.intensity = e.sky ? e.sunI : 0;
    this.sun.color.set(e.sun);
    this.hemi.intensity = e.sky ? 0.9 : 0;
    // outdoors: the land around you is known and memory reads brighter
    U.uRememberAmt.value = e.sky ? 0.72 : 0.42;
    if (this.view?.zone === z) this.view.vis.autoExplore = e.sky ? 22 : 0;
    this.hemi.color.set(e.skyColor);
  }

  /** closest tile to (tx,ty) a player can stand on (generator mistakes never strand anyone) */
  nearestWalkable(z: Zone, tx: number, ty: number): [number, number] {
    const ok = (x: number, y: number) => z.inb(x, y) && z.floor[z.idx(x, y)] !== 0 && z.solid[z.idx(x, y)] !== 1;
    if (ok(tx, ty)) return [tx, ty];
    for (let r = 1; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (ok(tx + dx, ty + dy)) return [tx + dx, ty + dy];
    }
    return [tx, ty];
  }

  /** Move a player to a zone/tile (handles view swap for the local player) */
  placePlayer(p: Player, zoneKey: string, tx: number, ty: number, facing?: number) {
    const z = this.getZone(zoneKey);
    p.zoneKey = zoneKey;
    p.x = tx + 0.5; p.z = ty + 0.5;
    p.y = z.heightAt(tx, ty);
    if (facing !== undefined) { p.facing = p.targetFacing = facing; }
    if (p === this.local) {
      this.setView(z);
      this.pr.target.set(p.x, 0, p.z);
      bus.emit('enterZone', z, p);
    }
  }

  addPlayer(p: Player) {
    this.players.set(p.id, p);
    this.pr.scene.add(p.rig.root);
    p.footstepCb = (pl) => bus.emit('footstep', pl);
  }
  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.pr.scene.remove(p.rig.root);
    p.rig.dispose();
    this.players.delete(id);
  }

  /** request a dynamic point light for this frame */
  pointLight(x: number, y: number, z: number, color: number, intensity: number, dist = 7) {
    this.pointReq.push({ x, y, z, color, intensity, dist });
  }

  /** fade to black, run cb, fade back */
  fadeThen(cb: () => void) { this.fadeTarget = 1; this.fadeCb = cb; }

  // ---------------- main loop ----------------
  start() {
    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try { this.step(dt); } catch (e) { console.error(e); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** rolling per-section timings in ms (debug overlay / perf probes) */
  perf: Record<string, number> = {};
  private perfMark(k: string, t0: number) { const v = performance.now() - t0; this.perf[k] = (this.perf[k] ?? v) * 0.9 + v * 0.1; }

  step(dt: number) {
    this.dt = dt;
    const tStart = performance.now();
    this.time += dt;
    U.uTime.value = this.time;
    const sim = !this.paused;
    let dh = 0;
    if (sim) dh = this.clock.advance(dt);
    // fade transitions
    if (this.fadeTarget > 0 || this.fade > 0) {
      this.fade = damp(this.fade, this.fadeTarget, 9, dt);
      if (this.fadeTarget === 1 && this.fade > 0.97) {
        const cb = this.fadeCb; this.fadeCb = null; this.fadeTarget = 0; this.fade = 1;
        cb?.();
      }
      if (this.fadeTarget === 0 && this.fade < 0.01) this.fade = 0;
    }
    let t0 = performance.now();
    if (this.attract) this.attract(dt);
    else if (sim && this.local) this.controlLocal(dt);
    this.perfMark('control', t0);
    if (sim) for (const s of this.systems) {
      t0 = performance.now();
      try { s.update(dt, dh); } catch (e) { console.error('system', s.name, e); }
      this.perfMark('sys:' + s.name, t0);
    }
    t0 = performance.now();
    this.updateWorldView(dt);
    this.perfMark('view', t0);
    t0 = performance.now();
    this.ui?.update?.(dt);
    this.perfMark('ui', t0);
    this.pr.fx.blink = Math.max(this.pr.fx.blink, this.fade);
    t0 = performance.now();
    this.pr.render(dt);
    this.perfMark('render', t0);
    this.perfMark('frame', tStart);
    this.input.endFrame();
  }

  // ---------------- local player control ----------------
  controlLocal(dt: number) {
    const p = this.local;
    const z = this.zone;
    const inp = this.input;
    p.actions.update(dt);
    if (p.body.dead) { p.speed = 0; return; }
    const mods = p.body.mods(p.heavyLoad());
    const cur = p.actions.current;
    const locked = (cur && cur.started && cur.locks) || p.body.downed || this.transitioning || p.sleeping || p.carriedBy || p.inVehicle;
    // camera-relative movement
    let ix = 0, iy = 0;
    if (!locked && !this.ui?.blocksMovement?.()) {
      if (inp.down('up')) iy += 1;
      if (inp.down('down')) iy -= 1;
      if (inp.down('left')) ix -= 1;
      if (inp.down('right')) ix += 1;
    }
    const yaw = this.pr.yaw;
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const rtX = Math.cos(yaw), rtZ = -Math.sin(yaw);
    let mx = fwdX * iy + rtX * ix, mz = fwdZ * iy + rtZ * ix;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    const moving = ml > 0;
    if (moving && cur && !cur.canMove) p.actions.clear();
    if (!locked && inp.hit('sneak')) p.sneaking = !p.sneaking;
    const f = z.floorAt(p.tileX(), p.tileY());
    const deep = f?.water === 'deep';
    p.stance = p.body.downed ? 'crawl' : deep ? 'swim' : p.sneaking ? 'sneak' : 'stand';
    p.running = moving && inp.down('run') && mods.canRun && p.stance === 'stand' && !p.aiming;
    let speed = p.running ? 4.15 : p.stance === 'sneak' ? 1.15 : p.stance === 'swim' ? 1.05 * (p.body.perks.has('swimmer') ? 1.5 : 1) : p.stance === 'crawl' ? 0.35 : 2.0;
    speed *= mods.move * (f?.slow ?? 1);
    if (p.aiming) speed *= 0.55;
    const tvx = mx * speed, tvz = mz * speed;
    p.vx = damp(p.vx, tvx, 14, dt); p.vz = damp(p.vz, tvz, 14, dt);
    if (Math.hypot(p.vx, p.vz) > 0.01) {
      moveCircle(z, p, p.vx * dt, p.vz * dt, { ignoreLow: false });
    }
    p.speed = Math.hypot(p.vx, p.vz);
    p.y = damp(p.y, z.heightAt(p.tileX(), p.tileY()) + (deep ? -0.9 : 0), 12, dt);
    // aim (right mouse held)
    const over = inp.pointerOverUI;
    p.aiming = !locked && !over && inp.mouseDown[2] && inp.heldFor(2) > 140;
    const wp = this.pr.screenToWorld(inp.mouseX, inp.mouseY, 0.9);
    if (wp) { p.aimX = wp.x; p.aimZ = wp.z; }
    if (p.aiming) p.targetFacing = Math.atan2(p.aimZ - p.z, p.aimX - p.x);
    else if (moving) p.targetFacing = Math.atan2(mz, mx);
    else if (cur?.face && cur.started) p.targetFacing = Math.atan2(cur.face.z - p.z, cur.face.x - p.x);
    p.turn(dt, p.aiming ? 22 : 12);
    // flashlight
    if (!locked && inp.hit('flashlight')) this.toggleFlashlight(p);
    // camera rotation & zoom
    if (inp.hit('camLeft')) this.pr.yawTarget += Math.PI / 2;
    if (inp.hit('camRight')) this.pr.yawTarget -= Math.PI / 2;
    if (inp.wheel && !over) {
      this.camZoom = clamp(this.camZoom - Math.sign(inp.wheel), 0, PixelRenderer.ZOOMS.length - 1);
      this.pr.setZoomLevel(this.camZoom);
    }
    // exertion for body sim
    if (p.running) p.exertionTimer = 1;
    p.exertionTimer = Math.max(0, p.exertionTimer - dt * 0.5);
    // portals
    this.checkPortals(p);
  }

  toggleFlashlight(p: Player) {
    let light = p.lightItem;
    if (!light) {
      light = p.findItem((it, d) => !!d.light && (it.uses ?? 1) > 0) || null;
      if (light) { if (!p.handR || p.handR === light) p.equip(light, 'R'); else p.equip(light, 'L'); }
    }
    if (!light) { bus.emit('think', p, "I don't have a light."); return; }
    p.flashlightOn = !p.flashlightOn;
    bus.emit('sound', 'click', p.x, p.z, 0.4);
  }

  checkPortals(p: Player) {
    if (this.transitioning || p.inVehicle) return; // cars handle portals and loops for everyone inside
    const z = this.zone;
    const tx = p.tileX(), ty = p.tileY();
    for (const portal of z.portals) {
      if (portal.x !== tx || portal.y !== ty) continue;
      if (portal.kind === 'loop') {
        // seamless shift: move the player (and camera) by the loop offset
        const dx = portal.loopDx ?? 0, dy = portal.loopDy ?? 0;
        p.x += dx; p.z += dy;
        this.pr.target.x += dx; this.pr.target.z += dy;
        bus.emit('loop', p, portal);
        return;
      }
      if (portal.kind === 'door' || portal.kind === 'elevator' || portal.kind === 'manhole' || portal.kind === 'ladder' || portal.kind === 'vent') continue; // these need interaction
      this.usePortal(p, portal);
      return;
    }
  }

  /** go through a portal: lock check, special destinations, anchor resolution */
  usePortal(p: Player, portal: Portal) {
    if (portal.to === '__ending__') {
      if (portal.locked && this.missions && !this.missions.isUnlocked?.(portal.locked, p)) { bus.emit('think', p, this.missions.lockText?.(portal.locked) || "It won't open."); return; }
      this.missions?.ending?.(p);
      return;
    }
    this.travel(p, portal.to, portal.tx, portal.ty, portal.face, portal.locked, portal.anchor ?? portal.id);
  }

  travel(p: Player, zoneKey: string, tx: number, ty: number, face?: number, lockReq?: string, anchor?: string) {
    if (lockReq && this.missions && !this.missions.isUnlocked?.(lockReq, p)) {
      bus.emit('think', p, this.missions.lockText?.(lockReq) || "It won't budge.");
      return;
    }
    this.transitioning = true;
    p.actions.clear();
    bus.emit('travelStart', p, zoneKey);
    this.fadeThen(() => {
      const z = this.getZone(zoneKey);
      const a = anchor ? (z.meta.anchors?.[anchor] as number[] | undefined) : undefined;
      if (a) { tx = a[0]; ty = a[1]; if (a[2] !== undefined) face = a[2]; }
      [tx, ty] = this.nearestWalkable(z, tx, ty);
      this.placePlayer(p, zoneKey, tx, ty, face);
      p.vx = p.vz = 0;
      this.transitioning = false;
      bus.emit('travelEnd', p, zoneKey);
      this.net?.onLocalTravel?.(zoneKey);
    });
  }

  // ---------------- per-frame world view ----------------
  updateWorldView(dt: number) {
    const v = this.view;
    if (!v || !this.local) return;
    const p = this.local;
    // camera follow with slight look-ahead toward facing / aim
    const leadDist = p.aiming ? 2.2 : p.speed > 0.3 ? 0.8 : 0.3;
    const lx = Math.cos(p.facing) * leadDist, lz = Math.sin(p.facing) * leadDist;
    this.camLead.x = damp(this.camLead.x, lx, 3, dt);
    this.camLead.z = damp(this.camLead.z, lz, 3, dt);
    const tgt = new THREE.Vector3(p.x + this.camLead.x, p.y, p.z + this.camLead.z);
    this.pr.target.x = damp(this.pr.target.x, tgt.x, 10, dt);
    this.pr.target.z = damp(this.pr.target.z, tgt.z, 10, dt);
    this.pr.target.y = damp(this.pr.target.y, tgt.y, 10, dt);
    this.pr.updateCamera(dt);
    this.pr.updatePlayerView(new THREE.Vector3(p.x, p.y, p.z));
    const viewR = (this.pr.lowW * this.pr.pxSize) * 0.75 + 4;
    let t0 = performance.now();
    v.lg.update(dt, p.x, p.z, this.time);
    this.perfMark('lights', t0);
    // vision cone narrows with panic & tiredness
    const m = p.body.mods(0);
    v.vis.coneHalf = THREE.MathUtils.degToRad(82 - m.panic * 20 - m.tired * 10 + (p.body.has('eagle_eyed') ? 12 : 0) - (p.body.has('short_sighted') ? 6 : 0));
    v.vis.range = 34 * (p.body.has('short_sighted') ? 0.75 : 1);
    v.vis.extra = [];
    for (const o of this.players.values()) if (o !== p && o.zoneKey === p.zoneKey && !o.body.dead) v.vis.extra.push({ x: o.x, z: o.z, facing: o.facing });
    t0 = performance.now();
    v.vis.update(dt, p.x, p.z, p.facing, this.clock.hours);
    this.perfMark('vis', t0);
    t0 = performance.now();
    v.zr.update(this.pr.target.x, this.pr.target.z, viewR, dt);
    this.perfMark('chunks', t0);
    // sun follows player for shadows
    if (v.zone.env.sky) {
      const dayF = this.clock.dayFrac;
      const ang = (dayF - 0.25) * Math.PI * 2;
      const sx = Math.cos(ang) * 30, sy = Math.max(8, Math.sin(ang) * 40 + 12), sz = 18;
      this.sun.position.set(p.x + sx, sy, p.z + sz);
      this.sun.target.position.set(p.x, 0, p.z);
      this.sun.target.updateMatrixWorld();
    }
    this.updateLights(dt);
    // players visuals
    for (const pl of this.players.values()) {
      const same = pl.zoneKey === p.zoneKey;
      pl.rig.root.visible = same && !pl.inVehicle && (pl === p || v.vis.isVisible(Math.floor(pl.x), Math.floor(pl.z)));
      if (same) pl.updateVisual(dt);
    }
  }

  private updateLights(_dt: number) {
    // flashlights: local first (with shadow), then visible remote players
    const list = [...this.players.values()].filter((pl) => pl.zoneKey === this.local.zoneKey && pl.flashlightOn && pl.lightItem && !pl.body.dead);
    list.sort((a, b) => (a === this.local ? -1 : b === this.local ? 1 : 0));
    for (let i = 0; i < this.flashlights.length; i++) {
      const f = this.flashlights[i];
      const pl = list[i];
      if (!pl) { f.intensity = 0; f.visible = false; continue; }
      f.visible = true;
      const d = itemDef(pl.lightItem!.key);
      const charge = pl.lightItem!.uses ?? 1;
      const flick = charge < 0.15 ? (Math.random() < 0.15 ? 0.2 : 1) : 1;
      const base = (d.light?.intensity ?? 1) * 26 * Math.min(1, 0.35 + charge * 1.3) * flick;
      f.intensity = base;
      f.distance = (d.light?.range ?? 14) + 4;
      f.angle = d.light?.cone ?? 0.5;
      f.color.set(d.light?.color ?? 0xfff1d6);
      const hx = pl.x + Math.cos(pl.facing) * 0.35, hz = pl.z + Math.sin(pl.facing) * 0.35;
      f.position.set(hx, pl.y + 1.25, hz);
      f.target.position.set(pl.x + Math.cos(pl.facing) * 7, pl.y + 0.2, pl.z + Math.sin(pl.facing) * 7);
      f.target.updateMatrixWorld();
    }
    // dynamic point lights, nearest first
    const req = this.pointReq;
    const p = this.local;
    req.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    for (let i = 0; i < this.points.length; i++) {
      const L = this.points[i], r = req[i];
      if (!r) { L.intensity = 0; continue; }
      L.position.set(r.x, r.y, r.z); L.color.set(r.color); L.intensity = r.intensity * 8; L.distance = r.dist;
    }
    this.pointPrev = req.filter((r) => r.dist >= 4).map((r) => ({ x: r.x, z: r.z, intensity: r.intensity, dist: r.dist }));
    this.pointReq.length = 0;
  }

  /** Light level (0..1+) at a world position from static grid + flashlights (for stealth / creature visibility) */
  lightLevelAt(x: number, z: number): number {
    let l = this.view ? this.view.lg.lightAt(x, z) : 0;
    l += this.zone.env.ambientI * 0.25;
    if (this.zone.env.sky) l += this.sun.intensity * 0.35;
    for (const pl of this.players.values()) {
      if (!pl.flashlightOn || pl.zoneKey !== this.local.zoneKey) continue;
      const dx = x - pl.x, dz = z - pl.z, d = Math.hypot(dx, dz);
      if (d > 16) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dz, dx) - pl.facing));
      if (ang < 0.55 || d < 1.2) l += 1.2 * (1 - d / 16);
    }
    for (const r of this.pointPrev) {
      const d = Math.hypot(x - r.x, z - r.z);
      if (d < r.dist) l += Math.min(1.2, r.intensity * 0.6) * (1 - d / r.dist);
    }
    return l;
  }

  floorAtPlayer(p: Player) { return this.getZone(p.zoneKey).floorAt(p.tileX(), p.tileY()); }
}

export { floorDef, lerp };

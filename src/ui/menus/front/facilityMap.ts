// THE FACILITY MAP (round 26): the main menu after the title. The operator's wing of the Meridian Institute as
// a sectional model at night: twelve rooms (src/game/facility.ts) on one concrete slab, each a full diorama of
// itself (front/dioramas.ts) in the state it is in, derelict or restored, under its own light; rain falling
// through the dark round it. No words on it at all. A room under the pointer (or the arrow keys) rises a hand's
// breadth and its light comes up warm; a press flies the camera down into it (focus) and the title cuts into
// that room's own screen, or holds on the diorama for a room that has none yet (part B's build mode lands there).
//   const map = new FacilityMap(mats)   stage.add(map)
//   map.onRoom = (id) => ...            a room was pressed
//   map.focus(id) / map.unfocus()       the camera's flights (Promises)
//   map.reveal()                        the descent onto the model (after the offer, from the title)
//   map.nav(dx, dy) / map.pressSel()    keyboard
import * as THREE from 'three';
import type { StageRoom, Hot, Grade } from '../monitor/stage';
import type { FMats } from '../scene/pixtex';
import { FacetBuilder, at, cbox, jitter, tube } from '../scene/facet';
import { buildRoom, HALF, WT, type Diorama } from './dioramas';
import { ROOMS, facility, onFacility, type RoomId } from '../../../game/facility';
import { easeIO, damp } from './kit';
import { sfx, sample } from '../sfx';

const PITCH = 5.1;
/** what a room's diorama is built from (a change rebuilds it) */
const sigOf = (id: RoomId) => { const r = facility().rooms[id]; return r.condition + '|' + r.locked + '|' + JSON.stringify(r.furniture); };
const COLS = 4, ROWS = 3;
interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number }
interface Slot { sig: string; dim: number; id: RoomId; at: THREE.Vector3; d: Diorama; light: THREE.PointLight; holder: THREE.Group; lift: number; heat: number; key: string; flick: number; cond: number; locked: boolean; pad: THREE.Mesh }

export class FacilityMap implements StageRoom {
  id = 'map';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 200);
  hots: Hot[] = [];
  grade: Grade = {
    exposure: 2.2, lift: [0.95, 0.98, 1.04], gain: [1.03, 1.01, 0.98], vig: 0.42, sat: 1.0, contrast: 1.1, side: [1, 0, 0.05, 0.3],
    haze: 0.22, hazeColor: 0x3a4660, ao: 0.85, aoRad: 0.6, scatter: 0.5, bounce: 0.3,
  };
  onRoom?: (id: RoomId) => void;
  /** the room the camera is down in (null: the whole model) */
  focused: RoomId | null = null;
  private slots = new Map<RoomId, Slot>();
  private sel: RoomId | null = null;
  private hot: RoomId | null = null;
  private moon = new THREE.DirectionalLight(0xb0c4ff, 2.2);
  private hemi = new THREE.HemisphereLight(0x8a98b8, 0x3a3024, 1.15);
  private work = new THREE.SpotLight(0xd8e0ff, 260, 70, 0.36, 1, 1.5);
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private home: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(0, 0.4, 0.4), fov: 30 };
  private cur: Pose = { pos: new THREE.Vector3(0, 60, 60), look: new THREE.Vector3(0, 0, 0), fov: 30 };
  private flight: { from: Pose; to: Pose; t: number; dur: number; res: () => void } | null = null;
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private aspect = 16 / 9; private portrait = false;
  private yaw = 0.62; private pitch = 0.98; private dist = 40;
  private dirty = new Set<RoomId>();

  constructor(private mats: FMats) {
    const S = this.scene;
    S.background = new THREE.Color(0x06080c);
    this.base();
    for (const d of ROOMS) this.place(d.id);
    // the moon from the front left, high: the back walls stand lit, the floors catch the open side
    this.moon.position.set(-14, 30, 22); this.moon.target.position.set(0, 0, 0);
    this.moon.castShadow = true;
    const sc = this.moon.shadow.camera as THREE.OrthographicCamera;
    sc.left = -16; sc.right = 16; sc.top = 14; sc.bottom = -14; sc.near = 5; sc.far = 80;
    this.moon.shadow.mapSize.set(2048, 2048); this.moon.shadow.bias = -0.0008; this.moon.shadow.normalBias = 0.03;
    this.work.position.set(2, 34, 10); this.work.target.position.set(0, 0, 0);
    S.add(this.moon, this.moon.target, this.hemi, this.work, this.work.target);
    // rain: thin pale streaks falling through the whole volume
    const N = 520;
    this.rainPos = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 34, y = Math.random() * 22 - 2, z = (Math.random() - 0.5) * 28; this.rainPos.set([x, y, z, x - 0.02, y + 0.32, z - 0.01], i * 6); }
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x4a5670, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.rain.frustumCulled = false; this.rain.userData.noGlow = true;
    S.add(this.rain);
    onFacility(() => { for (const d of ROOMS) { const s = this.slots.get(d.id); if (s && s.sig !== sigOf(d.id)) this.dirty.add(d.id); } });
    this.cur.pos.copy(this.cur.look).add(new THREE.Vector3(10, 60, 40));
  }

  // ------------------------------------------------------------------ the model's slab, the corridors between rooms, the ground far below
  private base() {
    const b = new FacetBuilder();
    const W = COLS * PITCH + 1.2, D = ROWS * PITCH + 1.2;
    b.add('concrete', cbox(W, 0.9, D, 0.05), 0x7a766e, at(0, -0.57, 0), { rep: 2.2 });
    b.add('concrete', cbox(W - 0.1, 0.02, D - 0.1, 0.01), 0xa8a49a, at(0, -0.11, 0), { rep: 1.6 });
    // the corridors: worn lino strips between the rooms, a yellow edge line
    for (let r = 0; r <= ROWS; r++) b.add('floor', cbox(W - 0.6, 0.02, 0.62, 0.004), 0x6a665a, at(0, -0.09, (r - ROWS / 2) * PITCH - 0.1));
    for (let c = 0; c <= COLS; c++) b.add('floor', cbox(0.62, 0.02, D - 0.6, 0.004), 0x6a665a, at((c - COLS / 2) * PITCH - 0.1, -0.09, 0));
    // the cut edge of the slab: rebar ends, a service duct, pipes running under it
    for (let i = 0; i < 40; i++) b.add('rust', cbox(0.03, 0.03, 0.12, 0.004), 0x8a5a3a, at(-W / 2 + 0.5 + i * (W - 1) / 39, -0.5, D / 2 + 0.03));
    b.add('metal', cbox(W - 1, 0.24, 0.3, 0.02), 0x4a4e50, at(0, -1.2, D / 2 - 1.2));
    for (let i = 0; i < 3; i++) b.add(i ? 'paint' : 'rust', tube([[-W / 2, -1.3 - i * 0.22, -D / 2 + 2 + i], [W / 2, -1.3 - i * 0.22, -D / 2 + 2 + i]], 0.08, 2, 8, false), [0x8a6a50, 0x3a5a7a, 0x6a2a24][i]);
    // the columns under it, into the dark
    for (const x of [-W / 2 + 1, W / 2 - 1]) for (const z of [-D / 2 + 1, D / 2 - 1]) b.add('concrete', cbox(0.6, 6, 0.6, 0.02), 0x5a5852, at(x, -4.1, z));
    // the ground far below: wet concrete, a few puddles of light
    b.add('concrete', cbox(120, 0.2, 120, 0.05), 0x16181a, at(0, -7.2, 0), { rep: 3 });
    for (let i = 0; i < 30; i++) b.add('concrete', jitter(cbox(0.6 + (i % 4) * 0.3, 0.3, 0.5, 0.1), 0.1, i), 0x3a3a38, at(Math.sin(i * 7.1) * 22, -7.0, Math.cos(i * 3.3) * 18));
    this.scene.add(b.build(this.mats));
  }

  private slotAt(id: RoomId) {
    const d = ROOMS.find((r) => r.id === id)!;
    return new THREE.Vector3((d.cell[0] - (COLS - 1) / 2) * PITCH, 0, (d.cell[1] - (ROWS - 1) / 2) * PITCH);
  }
  private place(id: RoomId) {
    const old = this.slots.get(id);
    const st = facility().rooms[id];
    const d = buildRoom(id, st.condition, st.locked, this.mats, ROOMS.findIndex((r) => r.id === id) + 1, st.furniture);
    const holder = old?.holder ?? new THREE.Group();
    if (old) { holder.remove(old.d.group); old.d.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
    holder.position.copy(this.slotAt(id));
    holder.add(d.group);
    if (!old) this.scene.add(holder);
    const light = old?.light ?? new THREE.PointLight(0xffffff, 0, 11, 1.1);
    light.color.setHex(d.color);
    light.position.copy(d.light);
    if (!old) holder.add(light);
    // a warm glow on the slab round the room while it is hot
    let pad = old?.pad;
    if (!pad) {
      pad = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 0.9, HALF * 2 + 0.9), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(WT / 2, -0.07, WT / 2); pad.userData.noGlow = true; pad.renderOrder = 2;
      holder.add(pad);
    }
    const key = 'room:' + id;
    const slot: Slot = { sig: sigOf(id), dim: old?.dim ?? 0, id, at: holder.position.clone(), d, light, holder, lift: old?.lift ?? 0, heat: old?.heat ?? 0, key, flick: 0, cond: st.condition, locked: st.locked, pad };
    this.slots.set(id, slot);
    this.hots = this.hots.filter((h) => h.key !== key);
    this.hots.push({ key, objs: [d.group], label: '', press: () => { this.select(id); this.onRoom?.(id); }, hover: (on) => { if (on) { this.hot = id; this.sel = id; sfx('tick', 0.45); } else if (this.hot === id) this.hot = null; } });
  }

  // ------------------------------------------------------------------ keyboard
  select(id: RoomId | null) { this.sel = id; }
  get selected() { return this.sel; }
  nav(dx: number, dy: number): RoomId {
    const cur = ROOMS.find((r) => r.id === (this.sel ?? this.hot)) ?? ROOMS[0];
    let c = cur.cell[0] + Math.sign(dx), r = cur.cell[1] + Math.sign(dy);
    c = (c + COLS) % COLS; r = (r + ROWS) % ROWS;
    const next = ROOMS.find((q) => q.cell[0] === c && q.cell[1] === r) ?? cur;
    this.sel = next.id;
    sfx('tick', 0.45);
    return next.id;
  }
  pressSel() { if (this.sel) this.onRoom?.(this.sel); }
  /** part B: a room's diorama holder (room-local frame: floor centre at the origin, open sides toward +X and +Z) */
  roomFrame(id: RoomId): THREE.Object3D | null { return this.slots.get(id)?.holder ?? null; }
  /** part B: a pointer ray onto a room's floor, in that room's local metres (null: off the floor) */
  floorAt(id: RoomId, ray: THREE.Ray): THREE.Vector3 | null {
    const s = this.slots.get(id);
    if (!s) return null;
    const p = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -s.holder.position.y), new THREE.Vector3());
    if (!p) return null;
    p.sub(s.holder.position);
    return Math.abs(p.x) <= HALF && Math.abs(p.z) <= HALF ? p : null;
  }

  // ------------------------------------------------------------------ camera
  private homePose(): Pose {
    const look = this.home.look;
    const d = this.dist * (this.portrait ? 1.55 : 1);
    const yaw = this.yaw + this.ptrS.x * 0.05, pitch = this.pitch - this.ptrS.y * 0.03;
    const pos = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(d).add(look);
    return { pos, look: look.clone(), fov: this.home.fov };
  }
  private roomPose(id: RoomId): Pose {
    const s = this.slots.get(id)!;
    const look = s.at.clone().add(s.d.focus);
    const yaw = this.yaw - 0.05, pitch = 0.92, d = this.portrait ? 12 : 8.6;
    const pos = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(d).add(look);
    return { pos, look, fov: 36 };
  }
  private fly(to: Pose, ms: number): Promise<void> {
    this.flight?.res();
    return new Promise((res) => { this.flight = { from: { pos: this.cur.pos.clone(), look: this.cur.look.clone(), fov: this.cur.fov }, to, t: 0, dur: ms / 1000, res }; });
  }
  /** down into a room */
  focus(id: RoomId, ms = 1500): Promise<void> {
    this.focused = id; this.sel = id;
    sample('mn_whoosh', 0.35, 0.8);
    return this.fly(this.roomPose(id), ms);
  }
  /** back up to the whole model */
  unfocus(ms = 1300): Promise<void> {
    if (!this.focused) return Promise.resolve();
    this.focused = null;
    sample('mn_whoosh', 0.25, 0.7);
    return this.fly(this.homePose(), ms);
  }
  /** jump straight to a room's close shot (coming back out of its screen) */
  snapTo(id: RoomId) { const p = this.roomPose(id); this.cur.pos.copy(p.pos); this.cur.look.copy(p.look); this.cur.fov = p.fov; this.focused = id; this.flight = null; }
  /** the descent onto the model from high over it */
  reveal(ms = 4200): Promise<void> {
    this.focused = null;
    const h = this.homePose();
    this.cur.pos.copy(h.look).add(new THREE.Vector3(Math.sin(this.yaw + 0.5) * 30, 58, Math.cos(this.yaw + 0.5) * 30));
    this.cur.look.copy(h.look); this.cur.fov = 38;
    return this.fly(h, ms);
  }
  pointer(nx: number, ny: number) { this.ptr.set(nx, ny); }

  frame(aspect: number, portrait: boolean) {
    this.aspect = aspect; this.portrait = portrait;
    // fit the model's width: closer on a wide screen, further on a narrow one
    this.dist = Math.max(39, 43 * (1.78 / Math.max(0.5, aspect)) ** 0.6);
    const c = this.cam;
    c.aspect = aspect; c.fov = this.cur.fov; c.near = 0.5; c.far = 220;
    c.updateProjectionMatrix();
    c.position.copy(this.cur.pos); c.lookAt(this.cur.look);
  }

  update(dt: number, t: number, full: boolean) {
    for (const id of this.dirty) this.place(id);
    this.dirty.clear();
    this.ptrS.x = damp(this.ptrS.x, this.ptr.x, 1.5, dt); this.ptrS.y = damp(this.ptrS.y, this.ptr.y, 1.5, dt);
    const fl = this.flight;
    if (fl) {
      fl.t += dt;
      const e = easeIO(fl.t / fl.dur);
      this.cur.pos.lerpVectors(fl.from.pos, fl.to.pos, e);
      this.cur.look.lerpVectors(fl.from.look, fl.to.look, e);
      this.cur.fov = THREE.MathUtils.lerp(fl.from.fov, fl.to.fov, e);
      if (fl.t >= fl.dur) { this.flight = null; fl.res(); }
    } else {
      // idle: the model turns a few degrees and breathes with the pointer
      const target = this.focused ? this.roomPose(this.focused) : this.homePose();
      if (!this.focused) { const sway = Math.sin(t * 0.06) * 0.05; target.pos.sub(target.look).applyAxisAngle(new THREE.Vector3(0, 1, 0), sway).add(target.look); }
      const k = 1 - Math.exp(-dt * 2.2);
      this.cur.pos.lerp(target.pos, k); this.cur.look.lerp(target.look, k); this.cur.fov += (target.fov - this.cur.fov) * k;
    }
    // rooms: lift and warm the hot one, flicker the dead ones
    const hot = this.focused ? null : (this.hot ?? this.sel);
    for (const s of this.slots.values()) {
      const on = s.id === hot ? 1 : 0;
      s.heat = damp(s.heat, on, 6, dt);
      s.lift = damp(s.lift, on * 0.14, 7, dt);
      s.holder.position.y = s.at.y + s.lift;
      const base = s.locked ? 4.2 : s.cond === 0 ? 4.4 : s.cond === 1 ? 6 : s.cond === 2 ? 8.5 : 11;
      let k = 1;
      if (s.cond === 0 || s.locked) { s.flick -= dt; if (s.flick <= 0) s.flick = Math.random() < 0.85 ? 0.3 + Math.random() * 2.5 : -0.06 - Math.random() * 0.1; k = s.flick < 0 ? 0.25 : 1; if (s.flick < -0.2) s.flick = 0; }
      // down in a room, the rest of the model falls back into the dark
      s.dim = damp(s.dim, this.focused && this.focused !== s.id ? 1 : 0, 3, dt);
      const fk = this.focused === s.id ? 1.5 : 1 - s.dim * 0.75;
      s.light.intensity = (base * k * (1 + s.heat * 0.9) + s.heat * 4) * fk;
      s.light.color.setHex(s.d.color).lerp(new THREE.Color(0xffc890), s.heat * 0.55);
      (s.pad.material as THREE.MeshBasicMaterial).opacity = s.heat * 0.16;
      if (full) s.d.tick(t, dt);
    }
    // rain
    const P = this.rainPos, n = P.length / 6, fall = dt * 18;
    for (let i = 0; i < n; i++) {
      const j = i * 6;
      P[j + 1] -= fall; P[j + 4] -= fall;
      if (P[j + 1] < -7) { P[j + 1] += 24; P[j + 4] += 24; }
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

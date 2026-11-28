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
import { FacetBuilder, at, cbox, prism, lathe } from '../scene/facet';
import { buildRoom, HALF, WT, type Diorama } from './dioramas';
import { puddle } from '../rooms/dress';
import { shaftMesh } from '../scene/fx';
import { ROOMS, facility, onFacility, type RoomId } from '../../../game/facility';
import { easeIO, damp } from './kit';
import { sfx, sample } from '../sfx';

const PITCH = 5.1;
/** what a room's diorama is built from (a change rebuilds it) */
const sigOf = (id: RoomId) => { const r = facility().rooms[id]; return r.condition + '|' + r.locked + '|' + JSON.stringify(r.furniture); };
const COLS = 6, ROWS = 2;
/** the car park's sodium lamps (x, z) */
const LAMPS: [number, number][] = [[-8.5, 13.6], [3.5, 13.6], [15.5, 13.6]];
interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number }
interface Slot { sig: string; dim: number; id: RoomId; at: THREE.Vector3; d: Diorama; light: THREE.PointLight; holder: THREE.Group; lift: number; heat: number; key: string; flick: number; cond: number; locked: boolean; pad: THREE.Mesh }

export class FacilityMap implements StageRoom {
  id = 'map';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 200);
  hots: Hot[] = [];
  grade: Grade = {
    exposure: 2.65, lift: [0.95, 0.98, 1.04], gain: [1.03, 1.01, 0.98], vig: 0.42, sat: 1.0, contrast: 1.1, side: [1, 0, 0.05, 0.3],
    haze: 0.26, hazeColor: 0x4a5670, ao: 0.85, aoRad: 0.6, scatter: 0.5, bounce: 0.3,
  };
  onRoom?: (id: RoomId) => void;
  /** the room the camera is down in (null: the whole model) */
  focused: RoomId | null = null;
  private slots = new Map<RoomId, Slot>();
  private sel: RoomId | null = null;
  private hot: RoomId | null = null;
  private moon = new THREE.DirectionalLight(0xb0c4ff, 2.2);
  private hemi = new THREE.HemisphereLight(0x9aa8c8, 0x4a3c2c, 1.45);
  private work = new THREE.SpotLight(0xd8e0ff, 420, 80, 0.5, 1, 1.5);
  private drips: THREE.LineSegments; private dripPos: Float32Array;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private home: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(0, 0.6, 1.2), fov: 30 };
  private cur: Pose = { pos: new THREE.Vector3(0, 60, 60), look: new THREE.Vector3(0, 0, 0), fov: 30 };
  private flight: { from: Pose; to: Pose; t: number; dur: number; res: () => void } | null = null;
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private aspect = 16 / 9; private portrait = false;
  private yaw = 0.26; private pitch = 0.9; private dist = 44;
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
    sc.left = -26; sc.right = 26; sc.top = 22; sc.bottom = -22; sc.near = 5; sc.far = 100;
    this.moon.shadow.mapSize.set(2048, 2048); this.moon.shadow.bias = -0.0008; this.moon.shadow.normalBias = 0.03;
    this.work.position.set(2, 38, 16); this.work.target.position.set(0, 0, 0);
    // the car park's sodium lamps: warm pools on the wet asphalt, a cone of haze under each
    for (const [x, z] of LAMPS) {
      const L = new THREE.SpotLight(0xffa850, 260, 22, 0.75, 0.7, 1.5);
      L.position.set(x - 1.0, 5.6, z); L.target.position.set(x - 1.2, -0.6, z - 0.5);
      const cone = shaftMesh(10); cone.u.uColor.value.set(0xffb060); cone.u.uInt.value = 0.05;
      cone.mesh.position.set(x - 1.0, 5.6, z); cone.mesh.scale.set(3.2, 6.2, 3.2); cone.mesh.userData.noGlow = true;
      S.add(L, L.target, cone.mesh);
    }
    // a security lamp over the door
    const sec = new THREE.PointLight(0xd8e8ff, 14, 9, 1.6); sec.position.set(-5.2, 2.0, (ROWS * PITCH + 1.2) / 2 + 1.2); S.add(sec);
    S.add(this.moon, this.moon.target, this.hemi, this.work, this.work.target);
    // rain: thin pale streaks falling through the whole volume
    const N = 700;
    this.rainPos = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 52, y = Math.random() * 22 - 2, z = -8 + Math.random() * 30; this.rainPos.set([x, y, z, x - 0.02, y + 0.32, z - 0.01], i * 6); }
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x4a5670, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.rain.frustumCulled = false; this.rain.userData.noGlow = true;
    S.add(this.rain);
    // water off the roof's cut edge: a curtain of drips into the back corridor, a spout from the broken gutter
    const ND = 160;
    this.dripPos = new Float32Array(ND * 6);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dripPos, 3));
    const eZ = -(ROWS * PITCH + 1.2) / 2 + 0.33;
    for (let i = 0; i < ND; i++) { const spout = i < 40; const x = spout ? -12.8 + (Math.random() - 0.5) * 0.15 : (Math.random() - 0.5) * 31; const y = Math.random() * 5.2; this.dripPos.set([x, y, eZ + (spout ? 0.05 : 0), x, y + (spout ? 0.5 : 0.22), eZ], i * 6); }
    this.drips = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x8a9ab8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.drips.frustumCulled = false; this.drips.userData.noGlow = true;
    S.add(this.drips);
    onFacility(() => { for (const d of ROOMS) { const s = this.slots.get(d.id); if (s && s.sig !== sigOf(d.id)) this.dirty.add(d.id); } });
    this.cur.pos.copy(this.cur.look).add(new THREE.Vector3(10, 60, 40));
  }

  // ------------------------------------------------------------------ the model's slab, the corridors between rooms, the ground far below
  private base() {
    const b = new FacetBuilder();
    const W = COLS * PITCH + 1.2, D = ROWS * PITCH + 1.2, G = -0.62;
    // the wing's floor slab, sitting proud of the car park on a plinth
    b.add('concrete', cbox(W, 0.9, D, 0.05), 0x8a867e, at(0, -0.57, 0), { rep: 2.2 });
    b.add('concrete', cbox(W - 0.1, 0.02, D - 0.1, 0.01), 0xa8a49a, at(0, -0.11, 0), { rep: 1.6 });
    // the corridors: worn lino between the rooms, a yellow edge line
    for (let r = 0; r <= ROWS; r++) b.add('floor', cbox(W - 0.6, 0.02, 0.62, 0.004), 0x7a766a, at(0, -0.09, (r - ROWS / 2) * PITCH - 0.1));
    for (let c = 0; c <= COLS; c++) b.add('floor', cbox(0.62, 0.02, D - 0.6, 0.004), 0x7a766a, at((c - COLS / 2) * PITCH - 0.1, -0.09, 0));
    b.add('paint', cbox(W - 0.8, 0.006, 0.06, 0.002), 0xd8b030, at(0, -0.075, -0.1));
    // ---- the building's shell: the back and west walls standing full height, the roof's cut edge over the back
    const X0 = -W / 2 - 0.25, X1 = W / 2 + 0.25, Z0 = -D / 2 - 0.25, Z1 = D / 2 + 0.25, HH = 5.2;
    b.add('concrete', cbox(X1 - X0 + 0.5, HH, 0.5, 0.02), 0x8e8a82, at(0, HH / 2 - 0.12, Z0), { rep: 2 });
    b.add('concrete', cbox(0.5, HH, Z1 - Z0, 0.02), 0x8a867e, at(X0, HH / 2 - 0.12, (Z0 + Z1) / 2), { rep: 2 });
    for (const y of [1.2, 3.4]) b.add('paint', cbox(X1 - X0, 0.18, 0.06, 0.01), 0x5a6a4a, at(0, y, Z0 + 0.27));
    // high windows in the back wall (lit from the far side of the building, a few dead)
    for (let i = 0; i < 12; i++) {
      const x = X0 + 1.6 + i * ((X1 - X0 - 3.2) / 11), lit = (i * 7) % 5 !== 0;
      b.add('paint', cbox(1.1, 1.0, 0.1, 0.02), 0x2e3430, at(x, 3.9, Z0 + 0.24));
      b.add(lit ? 'lamp' : 'glass', cbox(0.96, 0.86, 0.02, 0.004), lit ? 0x8a7a58 : 0x1a2028, at(x, 3.9, Z0 + 0.3));
      b.add('paint', cbox(0.04, 0.86, 0.03, 0.004), 0x2e3430, at(x, 3.9, Z0 + 0.32));
    }
    // the roof: a slab over the back wall, its cut edge to the room side, a parapet and a gutter
    b.add('concrete', cbox(X1 - X0 + 0.6, 0.36, 2.0, 0.02), 0x7a766e, at(0, HH, Z0 - 0.45), { rep: 2 });
    b.add('rubber', cbox(X1 - X0 + 0.6, 0.36, 0.02, 0.002), 0x14100c, at(0, HH, Z0 + 0.56));
    b.add('concrete', cbox(X1 - X0 + 0.6, 0.5, 0.25, 0.02), 0x6a665e, at(0, HH + 0.42, Z0 - 1.35));
    b.add('metal', cbox(X1 - X0 + 0.4, 0.12, 0.16, 0.01), 0x5a5e5a, at(0, HH - 0.12, Z0 + 0.62));
    b.add('metal', prism(0.08, HH + 0.4, 8), 0x5a5e5a, at(X0 + 1.2, HH / 2 - 0.4, Z0 + 0.64));
    b.add('concrete', cbox(0.5, 0.36, Z1 - Z0, 0.02), 0x7a766e, at(X0 - 0.45, HH, (Z0 + Z1) / 2));
    // the front and east walls: cut low, the section capped dark, a doorway to the car park with its steps
    b.add('concrete', cbox(X1 - X0 + 0.5, 0.8, 0.5, 0.02), 0x8e8a82, at(0, 0.28, Z1), { rep: 2 });
    b.add('concrete', cbox(0.5, 0.8, Z1 - Z0, 0.02), 0x8e8a82, at(X1, 0.28, (Z0 + Z1) / 2), { rep: 2 });
    b.add('rubber', cbox(X1 - X0 + 0.5, 0.02, 0.52, 0.002), 0x14100c, at(0, 0.69, Z1));
    b.add('rubber', cbox(0.52, 0.02, Z1 - Z0, 0.002), 0x14100c, at(X1, 0.69, (Z0 + Z1) / 2));
    const DX = -5.2;
    for (let i = 0; i < 3; i++) b.add('concrete', cbox(1.8, 0.18, 0.4, 0.02), 0x9a968c, at(DX, -0.2 - i * 0.18, Z1 + 0.45 + i * 0.4));
    b.add('metal', cbox(2.2, 0.1, 1.1, 0.02), 0x4a5054, at(DX, 2.3, Z1 + 1.0));
    for (const s of [-1, 1]) b.add('metal', prism(0.05, 2.9, 6), 0x4a5054, at(DX + s * 1.0, 0.85, Z1 + 1.45));
    b.add('lamp', cbox(0.5, 0.04, 0.2, 0.01), 0xd8e8ff, at(DX, 2.24, Z1 + 1.0));
    // ---- the car park: wet asphalt, bays, a kerb, cars, sodium lamps, bollards, a fence into the dark
    b.add('concrete', cbox(140, 0.2, 140, 0.05), 0x2c2e32, at(0, G - 0.1, 20), { rep: 3 });
    b.add('concrete', cbox(X1 - X0 + 3, 0.16, 1.4, 0.02), 0x7a7870, at(0, G + 0.08, Z1 + 1.0), { rep: 1.2 });
    b.add('concrete', cbox(1.4, 0.16, Z1 - Z0 + 3, 0.02), 0x7a7870, at(X1 + 1.0, G + 0.08, 0), { rep: 1.2 });
    for (let i = 0; i < 13; i++) {
      const x = -15 + i * 2.6;
      b.add('paint', cbox(0.08, 0.01, 4.4, 0.002), 0xd8d4c4, at(x, G + 0.005, Z1 + 4.6));
      b.add('paint', cbox(0.08, 0.01, 4.4, 0.002), 0xd8d4c4, at(x, G + 0.005, Z1 + 11.2));
    }
    b.add('paint', cbox(34, 0.01, 0.1, 0.002), 0xd8c040, at(0, G + 0.005, Z1 + 7.9));
    const car = (x: number, z: number, col: number, ry: number) => {
      const m = at(x, G, z, 0, ry, 0);
      const M = (q: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(m, q);
      b.add('paint', cbox(1.8, 0.62, 4.3, 0.12), col, M(at(0, 0.55, 0)), { rep: 0.6 });
      b.add('paint', cbox(1.6, 0.5, 2.2, 0.16, 0.2), col, M(at(0, 1.1, -0.2)));
      b.add('glass', cbox(1.5, 0.38, 2.0, 0.1, 0.2), 0x3a4a5a, M(at(0, 1.12, -0.2)));
      for (const sx of [-1, 1]) for (const sz of [-1.3, 1.35]) b.add('rubber', prism(0.34, 0.24, 10), 0x1a1a1a, M(at(sx * 0.86, 0.34, sz, 0, 0, Math.PI / 2)));
      b.add('lamp', cbox(0.3, 0.1, 0.04, 0.01), 0x7a1a10, M(at(-0.6, 0.66, 2.16)));
      b.add('lamp', cbox(0.3, 0.1, 0.04, 0.01), 0x7a1a10, M(at(0.6, 0.66, 2.16)));
    };
    car(-9.8, Z1 + 4.6, 0x5a2a24, 0.04); car(-1.9, Z1 + 4.7, 0x3a4a5a, -0.03); car(7.1, Z1 + 11.0, 0x6a6a5a, 3.1); car(12.3, Z1 + 4.5, 0x2a3a2a, 0.02);
    for (let i = 0; i < 9; i++) b.add('paint', lathe([[0, 0], [0.1, 0], [0.1, 0.8], [0.06, 0.86], [0, 0.86]], 8), 0xd8b030, at(-14 + i * 3.4, G, Z1 + 1.9));
    // the fence far out, its posts and a sagging top wire
    for (let i = 0; i < 24; i++) b.add('metal', prism(0.04, 2.2, 6), 0x4a4e50, at(-30 + i * 2.6, G + 1.1, Z1 + 16));
    b.add('metal', cbox(62, 1.8, 0.02, 0.01), 0x3a3e40, at(0, G + 1.1, Z1 + 16));
    // the lamp posts
    for (const [x, z] of LAMPS) {
      b.add('metal', prism(0.09, 6.4, 8), 0x4a4e50, at(x, G + 3.2, z));
      b.add('metal', cbox(1.2, 0.1, 0.14, 0.02), 0x4a4e50, at(x - 0.5, G + 6.4, z));
      b.add('metal', cbox(0.6, 0.16, 0.34, 0.04), 0x3a3e40, at(x - 1.0, G + 6.34, z));
      b.add('lamp', cbox(0.48, 0.03, 0.26, 0.01), 0xffb050, at(x - 1.0, G + 6.25, z));
      b.add('concrete', lathe([[0, 0], [0.35, 0], [0.3, 0.3], [0, 0.3]], 8), 0x7a7870, at(x, G, z));
    }
    this.scene.add(b.build(this.mats));
    for (let i = 0; i < 9; i++) this.scene.add(puddle(-14 + ((i * 7.3) % 28), Z1 + 3 + ((i * 3.7) % 9), 1.6 + (i % 3) * 0.9, 1.0 + (i % 2) * 0.8, G + 0.006));
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
    this.dist = Math.max(40, 44 * (1.78 / Math.max(0.5, aspect)) ** 0.85);
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
      const base = s.locked ? 5.6 : s.cond === 0 ? 5.8 : s.cond === 1 ? 6 : s.cond === 2 ? 8.5 : 11;
      let k = 1;
      if (s.cond === 0 || s.locked) { s.flick -= dt; if (s.flick <= 0) s.flick = Math.random() < 0.85 ? 0.3 + Math.random() * 2.5 : -0.06 - Math.random() * 0.1; k = s.flick < 0 ? 0.25 : 1; if (s.flick < -0.2) s.flick = 0; }
      // down in a room, the rest of the model falls back into the dark
      s.dim = damp(s.dim, this.focused && this.focused !== s.id ? 1 : 0, 3, dt);
      const fk = this.focused === s.id ? 1.15 : 1 - s.dim * 0.75;
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
    const Q = this.dripPos, nd = Q.length / 6;
    for (let i = 0; i < nd; i++) {
      const j = i * 6, f = dt * (i < 40 ? 11 : 8 + (i % 5));
      Q[j + 1] -= f; Q[j + 4] -= f;
      if (Q[j + 1] < -0.1) { const l = Q[j + 4] - Q[j + 1]; Q[j + 1] = 5.15 + Math.random() * 0.4; Q[j + 4] = Q[j + 1] + l; }
    }
    (this.drips.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

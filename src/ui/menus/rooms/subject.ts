// SUBJECT ROOM 4 as one of the menu's rooms: the existing SubjectRoom
// (room3d.ts, its own renderer) seen two ways.
//  · FEED  its host shrinks to a small off-screen box and the room only runs a
//          dozen frames a second (paused between them, its clock scaled so
//          the lamp still swings in real time) from a high CCTV corner; each
//          new frame is copied into a little canvas the monitor bank shows.
//  · FULL  its host fills the screen and it runs at full rate: the room's own
//          title shot, and on request the camera flies in to the prisoner's
//          face (debugCam, eased) and back out again.
// It also registers itself with menuRooms.ts (scene/camera through the room's
// fields until room3d.ts exposes them: see scratchpad notes/menu-rooms.md).
import * as THREE from 'three';
import type { SubjectRoom } from '../room3d';
import { ROOM } from '../roomKit';
import { registerMenuRoom, type MenuRoom } from '../menuRooms';

type Pose = { pos: [number, number, number]; look: [number, number, number]; fov: number };
const CCTV: Pose = { pos: [2.95, 3.25, 4.4], look: [-0.15, 0.85, -0.6], fov: 60 };
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class SubjectView {
  readonly room: SubjectRoom;
  readonly host: HTMLElement;
  feedCv = document.createElement('canvas');
  tex: THREE.CanvasTexture;
  mode: 'feed' | 'full' = 'feed';
  deco = new THREE.Group();
  /** the face close-up is up (or flying) */
  face = false;
  private ctx: CanvasRenderingContext2D;
  private since = 1; private every = 1 / 12; private waiting = false; private lastFrame = -1;
  private fly: { from: Pose; to: Pose; t: number; dur: number; release: boolean } | null = null;
  private saved: Pose | null = null;
  private live: Pose | null = null;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(); private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(room: SubjectRoom, host: HTMLElement) {
    this.room = room; this.host = host;
    this.feedCv.width = 160; this.feedCv.height = 120;
    this.ctx = this.feedCv.getContext('2d')!;
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, 160, 120);
    this.tex = new THREE.CanvasTexture(this.feedCv);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.scene?.add(this.deco);
    this.deco.name = 'deco';
    this.setMode('feed');
    const self = this;
    const mr: MenuRoom = {
      id: 'subject',
      get scene() { return self.scene!; },
      get camera() { return self.camera!; },
      deco: this.deco,
      floor: { minX: -ROOM.W + 0.3, maxX: ROOM.W - 0.3, minZ: ROOM.BACK + 0.4, maxZ: ROOM.FRONT - 0.6, y: 0 },
      surfaces: [{ minX: -1.2, maxX: -0.76, minZ: -0.6, maxZ: -0.24, y: 0.94 }],
      guideSpot: { pos: new THREE.Vector3(1.7, 0, 1.5), look: new THREE.Vector3(0, 1.2, ROOM.CHAIR_Z) },
      host: this.host,
      pick: (x, y) => this.pick(x, y),
    };
    if (this.scene && this.camera) registerMenuRoom(mr);
  }
  /** the room's scene and camera (public getters when room3d.ts grows them, its fields until then) */
  get scene(): THREE.Scene | null { const r = this.room as any; return (r.sceneRef ?? r.scene ?? null) as THREE.Scene | null; }
  get camera(): THREE.Camera | null { const r = this.room as any; return (r.camera ?? r.cam ?? null) as THREE.Camera | null; }

  /** a client point on the room's floor (decorator placement) */
  pick(x: number, y: number): THREE.Vector3 | null {
    const cam = this.camera, cv = this.room.canvas;
    if (!cam) return null;
    const r = cv.getBoundingClientRect();
    if (!r.width) return null;
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, cam);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out);
  }

  setMode(m: 'feed' | 'full') {
    this.mode = m;
    this.host.classList.toggle('feed', m === 'feed');
    this.host.classList.toggle('full', m === 'full');
    const r = this.room;
    if (m === 'feed') { this.fly = null; this.face = false; this.saved = null; r.debugCam = { pos: [...CCTV.pos], look: [...CCTV.look], fov: CCTV.fov }; this.since = 1; }
    else { r.paused = false; r.timeScale = 1; this.waiting = false; r.debugCam = null; this.live = null; }
  }

  /** fly the camera in to the prisoner's face (true) or back to the room (false) */
  faceZoom(on: boolean, ms = 1300) {
    if (this.mode !== 'full' || on === this.face) return;
    const r = this.room;
    const cam = this.camera as THREE.PerspectiveCamera | null;
    if (!cam || !r.rig) return;
    this.face = on;
    const cur: Pose = this.live ?? { pos: [cam.position.x, cam.position.y, cam.position.z], look: this.lookOf(cam), fov: cam.fov };
    if (on) {
      if (!this.saved) this.saved = { pos: [...cur.pos], look: [...cur.look], fov: cur.fov };
      this.fly = { from: cur, to: this.facePose(), t: 0, dur: ms / 1000, release: false };
    } else {
      this.fly = { from: cur, to: this.saved ?? cur, t: 0, dur: ms / 1000, release: true };
    }
  }
  private lookOf(cam: THREE.PerspectiveCamera): [number, number, number] {
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(3).add(cam.position);
    return [d.x, d.y, d.z];
  }
  private facePose(): Pose {
    const rig = this.room.rig!;
    const h = rig.bones.head.getWorldPosition(new THREE.Vector3());
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    const d = portrait ? 1.05 : 0.74;
    return { pos: [h.x + 0.16 * d, h.y + 0.07, h.z + d], look: [h.x, h.y + 0.04, h.z], fov: portrait ? 44 : 32 };
  }

  /** every animation frame (after the room's own frame has run) */
  tick(dt: number) {
    const r = this.room;
    if (this.mode === 'full') {
      const f = this.fly;
      if (f) {
        f.t += dt;
        const k = ease(Math.min(1, f.t / f.dur));
        // the face moves (breathing, surges): keep re-aiming the close-up
        if (!f.release && this.face) f.to = this.facePose();
        const L = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * k) as [number, number, number];
        this.live = { pos: L(f.from.pos, f.to.pos), look: L(f.from.look, f.to.look), fov: f.from.fov + (f.to.fov - f.from.fov) * k };
        r.debugCam = { pos: this.live.pos, look: this.live.look, fov: this.live.fov };
        if (k >= 1) { this.fly = null; if (f.release) { r.debugCam = null; this.live = null; this.saved = null; } }
      } else if (this.face) {
        // hold on the face, a hand on the camera
        const p = this.facePose(), t = performance.now() / 1000;
        p.pos[0] += Math.sin(t * 0.31) * 0.01; p.pos[1] += Math.sin(t * 0.43) * 0.006;
        this.live = p;
        r.debugCam = { pos: p.pos, look: p.look, fov: p.fov };
      }
      return;
    }
    // FEED: let it draw one frame now and then, copy it when it has
    const gl = r.renderer;
    if (!gl) return;
    const fr = gl.info.render.frame;
    if (this.waiting) {
      if (fr !== this.lastFrame) {
        this.ctx.imageSmoothingEnabled = false;
        try { this.ctx.drawImage(r.canvas, 0, 0, 160, 120); this.tex.needsUpdate = true; } catch { /* context lost */ }
        this.waiting = false; r.paused = true; this.lastFrame = fr;
      }
      return;
    }
    this.since += dt;
    if (this.since >= this.every) {
      // its clock steps min(0.05, frame) * timeScale: scale it so the room keeps real time
      const frameDt = Math.max(1 / 240, Math.min(0.05, dt));
      r.timeScale = Math.max(1, Math.min(6, Math.min(0.15, this.since) / frameDt));
      r.paused = false; this.waiting = true; this.lastFrame = fr; this.since = 0;
    }
  }
}

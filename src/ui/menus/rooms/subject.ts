// SUBJECT ROOM 4 as one of the menu's rooms: the existing SubjectRoom
// (room3d.ts, its own renderer) seen two ways.
//  · FEED  its host shrinks to a small off-screen box and the room only runs a
//          dozen frames a second (paused between them, its clock scaled so
//          the lamp still swings in real time) from a high CCTV corner; each
//          new frame is copied into a little canvas the monitor bank shows.
//  · FULL  its host fills the screen and it runs at full rate: the room's own
//          title shot, and on request its 'prisoner' close-up on the face.
// It also registers itself with menuRooms.ts (the room's scene and camera).
import * as THREE from 'three';
import type { SubjectRoom } from '../room3d';
import { ROOM } from '../roomKit';
import { registerMenuRoom, type MenuRoom } from '../menuRooms';

type Pose = { pos: [number, number, number]; look: [number, number, number]; fov: number };
const CCTV: Pose = { pos: [2.95, 3.25, 4.4], look: [-0.15, 0.85, -0.6], fov: 60 };

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
    if (m === 'feed') { this.face = false; r.debugCam = { pos: [...CCTV.pos], look: [...CCTV.look], fov: CCTV.fov }; this.since = 1; }
    else { r.paused = false; r.timeScale = 1; this.waiting = false; r.debugCam = null; }
  }

  /** in to the prisoner's face (the room's own 'prisoner' close-up) or back out to the room */
  faceZoom(on: boolean, ms = 1300) {
    if (this.mode !== 'full' || on === this.face) return;
    this.face = on;
    void this.room.shot(on ? 'prisoner' : 'title', ms);
  }

  /** every animation frame (after the room's own frame has run) */
  tick(dt: number) {
    const r = this.room;
    if (this.mode === 'full') return;
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

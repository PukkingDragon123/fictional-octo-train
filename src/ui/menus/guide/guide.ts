// The guide: Dr. Iris Calder walks the player through the menu, the rooms,
// build mode and the commissary in short lines (pixel speech clouds in
// Alagard), points at what she is talking about (a 3D spot in the room or a
// key on screen), reacts when she is clicked, follows the player from room
// to room (she walks in from the side), and can be muted (the speech-cloud
// key): she says so and steps out until she is called back.
import * as THREE from 'three';
import type { MenuRoom, MenuRoomId } from '../menuRooms';
import { Bubbles, type Style } from './bubbles';
import { createGuideRig, type GuideRig } from './researcher';
import { flag, setFlag } from '../deco/store';
import { sfx } from '../sfx';

export type Aim = { el: () => HTMLElement | null } | { at: THREE.Vector3 } | null;
export interface Line { text: string; point?: Aim; look?: Aim; emote?: string; style?: Style; dur?: number; then?: () => void }

export interface GuideHost {
  /** the room the player is looking at */
  room(): MenuRoom | null;
  /** the active room's view rect on screen */
  rect(): DOMRect;
  layer: HTMLElement;
  anchor(k: 'blueprint' | 'shop' | 'guide' | 'tray' | 'menu'): HTMLElement | null;
  /** the 2D UI is hidden (a panel, the creator, the game starting) */
  hidden(): boolean;
}

const ROOM_INTRO: Record<MenuRoomId, string[]> = {
  monitor: ['The monitor room. Every camera in the building ends up on these tubes.', 'Pick a feed and go look. I will come with you.'],
  containment: ['Monster containment. That is RB-17. It hunts sound.', 'Tap the glass if you must. Not too often.'],
  lab: ['The experiment lab. My bench, my tanks, my mess.', 'Everything in here is labelled. Mostly correctly.'],
  subject: ['Subject room four. That chair is where the intake happens.', 'New subject brings the lights up in here.'],
};
const ROOM_AGAIN: Record<MenuRoomId, string[]> = {
  monitor: ['Back at the tubes.', 'Feeds are steady tonight.', 'Coffee is cold again. Of course it is.'],
  containment: ['It heard us come in.', 'Keep your voice down near the glass.', 'The crack is new. Do not mention it.'],
  lab: ['Mind the tanks.', 'If something bubbles, that is normal. Probably.', 'My lab. Wipe your feet.'],
  subject: ['The chair again.', 'Somebody always has to sit in it.', 'Smells like ozone in here.'],
};
const POKES: [string, string?][] = [
  ['Yes? I am listening.', 'wave'], ['That is my badge. Please do not.', 'shrug'], ['Careful. I am holding notes.'], ['Personal space, subject.', 'facepalm'],
  ['Still here.', 'bow'], ['Do you poke all the staff?', 'shrug'], ['I am flattered. Now. The menu.', 'point'],
];
const TIPS = [
  'Placed things can be clicked. They like it.',
  'Research points come from missions, scans and learning the rules.',
  'Build mode keeps every room separately. Go wild.',
  'Shelves take the small things. Statues want floor.',
  'The commissary restocks never. Everything is always there.',
];

export class Guide {
  private host: GuideHost;
  bubbles: Bubbles;
  private rig: GuideRig | null = null;
  private loading = false;
  private roomId: MenuRoomId | null = null;
  private room: MenuRoom | null = null;
  private queue: Line[] = [];
  private cur: (Line & { h: ReturnType<Bubbles['say']>; t: number; hold: number }) | null = null;
  private pos = new THREE.Vector3(); private goal = new THREE.Vector3();
  private walking = false; private yaw = 0;
  private gone = false; // muted and stepped out
  muted = flag<boolean>('guide.muted', false);
  private idleT = 0; private pokeN = 0;
  private chars = 0;
  private v = new THREE.Vector3(); private w = new THREE.Vector3();
  onMute?: (m: boolean) => void;

  constructor(host: GuideHost) {
    this.host = host;
    this.bubbles = new Bubbles(host.layer);
    this.gone = this.muted;
  }

  // ---------------------------------------------------------------- rooms
  /** the player is now looking at this room: she follows */
  follow(room: MenuRoom | null) {
    if (!room || room.id === this.roomId) return;
    const first = this.roomId === null;
    this.roomId = room.id; this.room = room;
    this.bubbles.clear(); this.cur = null;
    this.queue = this.queue.filter((l) => !l.look && !l.point);
    if (!this.rig) { this.ensureRig().then(() => this.arrive(room, first)); return; }
    this.arrive(room, first);
  }
  private async ensureRig() {
    if (this.rig || this.loading) return;
    this.loading = true;
    try { this.rig = await createGuideRig(); } catch (e) { console.warn('guide rig', e); }
    this.loading = false;
  }
  private spot(room: MenuRoom) {
    const F = room.floor;
    const gs = room.guideSpot;
    const p = gs ? gs.pos.clone() : new THREE.Vector3(F.minX + (F.maxX - F.minX) * 0.22, F.y, F.minZ + (F.maxZ - F.minZ) * 0.7);
    return p;
  }
  private arrive(room: MenuRoom, first: boolean) {
    if (!this.rig || this.room !== room) return;
    room.deco.add(this.rig.root);
    this.rig.root.visible = !this.gone;
    this.goal.copy(this.spot(room));
    // she walks in from the side of the view nearest her spot
    const F = room.floor;
    const side = this.goal.x < (F.minX + F.maxX) / 2 ? -1 : 1;
    this.pos.copy(this.goal).add(this.v.set(side * 1.3, 0, 0.25));
    this.pos.x = Math.max(F.minX - 0.6, Math.min(F.maxX + 0.6, this.pos.x));
    this.walking = true;
    this.rig.root.position.copy(this.pos);
    if (this.gone) return;
    if (!flag('guide.met', false)) { this.intro(); return; }
    const key = 'guide.room.' + room.id;
    if (!flag(key, false)) {
      setFlag(key, true);
      this.say(ROOM_INTRO[room.id].map((text, i) => ({ text, look: i === 0 ? { at: this.roomPoint(room) } : undefined, emote: i === 0 && !first ? 'wave' : undefined })));
    } else {
      const pool = ROOM_AGAIN[room.id];
      this.say([{ text: first ? 'Welcome back.' : pool[Math.floor(Math.random() * pool.length)], emote: first ? 'wave' : undefined }]);
    }
  }
  /** something worth looking at in a room: where she is told to look, else the room's middle */
  private roomPoint(room: MenuRoom): THREE.Vector3 {
    const w = room.guideSpot?.look.clone() ?? new THREE.Vector3((room.floor.minX + room.floor.maxX) / 2, 1.2, room.floor.minZ);
    return room.deco.localToWorld(w);
  }

  private intro() {
    setFlag('guide.met', true);
    if (this.room) setFlag('guide.room.' + this.room.id, true);
    const r = this.room!;
    this.say([
      { text: 'Oh, you are up. Dr. Iris Calder, Meridian research.', emote: 'wave' },
      { text: 'I will show you around. Click me if you need anything.' },
      { text: 'Your options float over there. New subject starts the contract.', point: { el: () => this.host.anchor('menu') } },
      ...ROOM_INTRO[r.id].map((text, i) => ({ text, look: i === 0 ? { at: this.roomPoint(r) } : undefined } as Line)),
      { text: 'See the little blueprint? Build mode. Make these rooms yours.', point: { el: () => this.host.anchor('blueprint') } },
      { text: 'The commissary sells figures and lab decor, for research points.', point: { el: () => this.host.anchor('shop') } },
      { text: 'I left two things in your tray. A plant. And a figure of me. For morale.', emote: 'shrug', then: () => this.onGift?.() },
      { text: 'Tap the speech cloud up there if you want me quiet.', point: { el: () => this.host.anchor('guide') } },
    ]);
  }
  onGift?: () => void;

  // ---------------------------------------------------------------- talking
  say(lines: Line[], interrupt = false) {
    if (this.gone) return;
    if (interrupt) { this.queue = []; this.bubbles.clear(); this.cur = null; }
    this.queue.push(...lines);
    this.idleT = 0;
  }
  /** say a line now, dropping the rest of the queue */
  now(text: string, o: Partial<Line> = {}) { this.say([{ text, ...o }], true); }
  get talking() { return !!this.cur; }

  /** something happened in the menus (build mode, the shop, a purchase...) */
  event(kind: 'build' | 'shop' | 'buy' | 'poor' | 'place' | 'remove' | 'free', extra = '') {
    if (this.gone) return;
    const once = (k: string, lines: Line[]) => { if (flag('guide.' + k, false)) return false; setFlag('guide.' + k, true); this.say(lines, true); return true; };
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    switch (kind) {
      case 'build':
        if (!once('build', [
          { text: 'Build mode. Pick something from the tray along the bottom.', point: { el: () => this.host.anchor('tray') } },
          { text: 'Set it on the floor or a shelf. Q and E turn it. Z takes it back.' },
          { text: 'Click anything you placed to move it. The bin sends it back to the tray.' },
        ])) this.now(pick(['Redecorating?', 'Make it yours.', 'Mind the cables.']));
        break;
      case 'shop':
        if (!once('shop', [
          { text: 'The commissary. Headcases, statuettes, a fridge that hums.' },
          { text: 'Prices are in research points. You earn those out there.' },
        ])) this.now(pick(['Browsing again?', 'The vinyl ones are the good ones.', 'Something for the shelf?']));
        break;
      case 'buy': this.now(pick(['Good choice.', 'That one is my favourite. Do not tell the others.', 'It is in your tray.', 'Delivered.']), { emote: Math.random() < 0.4 ? 'clap' : undefined }); break;
      case 'free': this.now('That one is on me.'); break;
      case 'poor': this.now(pick(['Not enough research points. Missions, scans and the rules all pay.', 'Short on points. The Institute pays for knowledge.']), { emote: 'shrug' }); break;
      case 'place': if (Math.random() < 0.35) this.now(pick(['Oh, that works there.', 'Very homely. For a containment facility.', 'Nice.', extra ? `The ${extra} suits the room.` : 'Lovely.'])); break;
      case 'remove': if (Math.random() < 0.25) this.now(pick(['Back in the tray it goes.', 'Fair. It was a lot.'])); break;
    }
  }

  setMuted(m: boolean) {
    if (m === this.muted) return;
    this.muted = m;
    setFlag('guide.muted', m);
    this.onMute?.(m);
    if (m) {
      this.queue = []; this.bubbles.clear(); this.cur = null;
      this.gone = false;
      this.say([{ text: 'I will be quiet. Tap the cloud if you need me.', emote: 'bow', then: () => { this.gone = true; } }], true);
    } else {
      this.gone = false;
      if (this.rig) this.rig.root.visible = true;
      if (this.room) { this.roomId = null; const r = this.room; this.room = null; this.follow(r); }
      this.say([{ text: 'Back. Did you miss me?', emote: 'wave' }], true);
    }
  }

  // ---------------------------------------------------------------- clicks
  /** a press on the room: true if it hit her */
  press(cx: number, cy: number): boolean {
    const rig = this.rig, room = this.room;
    if (!rig || !room || this.gone || !rig.root.visible) return false;
    const r = this.host.rect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), room.camera);
    if (!ray.intersectObject(rig.hitProxy, false).length) return false;
    rig.flinch();
    if (this.cur && !this.cur.h.typed) { this.bubbles.skip(); return true; }
    if (this.cur || this.queue.length) { this.next(); return true; }
    const [text, emote] = POKES[this.pokeN++ % POKES.length];
    this.now(text, { emote });
    sfx('tick', 0.5);
    return true;
  }
  /** over her (for the cursor) */
  over(cx: number, cy: number): boolean {
    const rig = this.rig, room = this.room;
    if (!rig || !room || this.gone || !rig.root.visible) return false;
    const r = this.host.rect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), room.camera);
    return ray.intersectObject(rig.hitProxy, false).length > 0;
  }
  private next() {
    if (this.cur) { this.cur.h.close(); this.cur.then?.(); this.cur = null; }
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const rig = this.rig, room = this.room;
    if (!rig || !room) return;
    const hide = this.host.hidden();
    this.bubbles.layer.style.visibility = hide ? 'hidden' : '';
    // gone (muted): walk out of the picture, then vanish
    if (this.gone && rig.root.visible) {
      const F = room.floor;
      this.goal.set(this.pos.x < (F.minX + F.maxX) / 2 ? F.minX - 1.4 : F.maxX + 1.4, F.y, this.pos.z);
      this.walking = true;
      if (Math.abs(this.pos.x - this.goal.x) < 0.1) rig.root.visible = false;
    }
    // walking
    let speed = 0;
    const d = this.v.copy(this.goal).sub(this.pos); d.y = 0;
    const dist = d.length();
    if (this.walking && dist > 0.04) {
      speed = Math.min(1.15, dist * 2.2 + 0.3);
      const step = Math.min(dist, speed * dt);
      this.pos.addScaledVector(d.normalize(), step);
      this.turnTo(Math.atan2(d.x, d.z), dt, 8);
    } else {
      this.walking = false;
      // face the camera (the player), easing
      const cam = room.camera;
      cam.getWorldPosition(this.w);
      room.deco.worldToLocal(this.w);
      this.turnTo(Math.atan2(this.w.x - this.pos.x, this.w.z - this.pos.z), dt, 3);
    }
    rig.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    rig.root.rotation.y = this.yaw;
    // the line being said; the next one when it is done
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.h.done) { const c = this.cur; this.cur = null; c.then?.(); }
    }
    if (!this.cur && this.queue.length && !this.walking && !hide) this.start(this.queue.shift()!);
    // idle chatter, rarely
    this.idleT += dt;
    if (!this.cur && !this.queue.length && !this.gone && this.idleT > 45 && !hide) { this.idleT = 0; this.say([{ text: TIPS[Math.floor(Math.random() * TIPS.length)] }]); }
    // where she looks / points
    const ln = this.cur;
    const point = ln?.point && ln.t > 0.25 && ln.t < ln.hold ? this.aim(ln.point, room) : null;
    const look = point ?? (ln?.look ? this.aim(ln.look, room) : null) ?? room.camera.getWorldPosition(this.w);
    rig.update(dt, { speed: this.walking ? speed : 0, look, point, talking: this.bubbles.talking });
    this.bubbles.update(dt, room.camera, this.host.rect());
  }
  private turnTo(a: number, dt: number, k: number) {
    let da = a - this.yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.yaw += da * Math.min(1, dt * k);
  }
  private start(l: Line) {
    const rig = this.rig!;
    this.chars = 0;
    const h = this.bubbles.say(() => rig.head(this.w.clone()), l.text, {
      style: l.style, dur: l.dur,
      onChar: (ch) => { if (ch !== ' ' && (this.chars++ & 1) === 0) sfx('type', 0.12); },
    });
    if (l.emote) rig.emote(l.emote);
    this.cur = { ...l, h, t: 0, hold: 1.6 + l.text.length * 0.06 };
  }
  /** a world point for an aim */
  private aim(a: Aim, room: MenuRoom): THREE.Vector3 | null {
    if (!a) return null;
    if ('at' in a) return a.at;
    const el = a.el();
    if (!el || !el.isConnected) return null;
    const br = el.getBoundingClientRect();
    if (br.width < 1) return null;
    const r = this.host.rect();
    const nx = ((br.left + br.width / 2 - r.left) / r.width) * 2 - 1, ny = -((br.top + br.height / 2 - r.top) / r.height) * 2 + 1;
    // at the depth of her shoulder, so the arm points across the screen at the key
    const rig = this.rig!;
    rig.head(this.v);
    this.v.project(room.camera);
    return new THREE.Vector3(Math.max(-1.2, Math.min(1.2, nx)), Math.max(-1.2, Math.min(1.2, ny)), this.v.z).unproject(room.camera);
  }

  dispose() { this.rig?.dispose(); this.rig = null; this.bubbles.dispose(); }
}
